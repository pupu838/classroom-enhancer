"""Registry protocol failure recovery, using synthetic bytes and no network."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
import time
import unittest
from unittest import mock
import httpx

spec = importlib.util.spec_from_file_location('moss_upload', Path(__file__).resolve().parents[2] / 'scripts/push-moss-oci.py')
upload = importlib.util.module_from_spec(spec); spec.loader.exec_module(upload)


class RegistryTest(unittest.TestCase):
    def test_parallel_layers_read_independent_archive_streams_before_manifest(self):
        layers = [bytes([i]) * (32768 + i * 37) for i in (1, 2, 3)]
        config = json.dumps({'os':'linux','architecture':'amd64','config':{'ExposedPorts':{'9000/tcp':{}}}}).encode()
        descriptor = lambda data: {'digest':'sha256:'+hashlib.sha256(data).hexdigest(),'size':len(data)}
        manifest = json.dumps({'mediaType':'application/vnd.oci.image.manifest.v1+json','layers':[descriptor(x) for x in layers],'config':descriptor(config)}).encode()
        expected = {descriptor(x)['digest']:x for x in [*layers,config]}
        barrier = threading.Barrier(3, timeout=5); lock = threading.Lock()
        active = 0; peak = 0; completed = []; manifests = []
        class FakeRegistry:
            def __init__(self, *args):
                self.client = mock.Mock(); self.recoveries = 0
            def upload(self, digest, size, source):
                nonlocal active, peak
                with lock:
                    active += 1; peak = max(peak,active)
                if digest != descriptor(config)['digest']: barrier.wait()
                source.seek(0); parts = []
                while chunk := source.read(128):
                    parts.append(chunk); time.sleep(.0001)
                self_test.assertEqual(b''.join(parts), expected[digest])
                self_test.assertEqual(size,len(expected[digest]))
                with lock:
                    completed.append(digest); active -= 1
                return {'bytes':size,'alreadyPresent':False}
            def manifest(self, raw, media_type):
                self_test.assertCountEqual(completed,list(expected))
                self_test.assertEqual(raw,manifest)
                manifests.append(media_type)
        self_test = self
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'synthetic.tar'
            with tarfile.open(path,'w') as archive:
                for name, data in [('index.json',json.dumps({'manifests':[descriptor(manifest)]}).encode()), *[('blobs/sha256/'+descriptor(x)['digest'][7:],x) for x in [manifest,*layers,config]]]:
                    entry = tarfile.TarInfo(name); entry.size = len(data)
                    archive.addfile(entry,io.BytesIO(data))
            with mock.patch.object(upload,'Registry',FakeRegistry):
                report = upload.push(path,'ccr.ccs.tencentyun.com/ns/image:test','test','password')
        self.assertEqual(peak,3); self.assertEqual(len(manifests),1)
        self.assertEqual(report['gpuInvocations'],0)

    def test_lost_chunk_ack_resumes_without_duplicating_bytes(self):
        expected = bytes(range(256)) * 180
        received = bytearray(); lost_ack = False
        location = '/v2/ns/image/blobs/uploads/example'
        digest = 'sha256:' + hashlib.sha256(expected).hexdigest()
        def handle(req):
            nonlocal lost_ack
            path = req.url.path
            if path == '/v2/':
                return httpx.Response(401, headers={'WWW-Authenticate':'Bearer realm="https://ccr.ccs.tencentyun.com/token",service="test"'})
            if path == '/token':
                return httpx.Response(200, json={'token':'synthetic-test-token'})
            self.assertEqual(req.headers['authorization'], 'Bearer synthetic-test-token')
            if req.method == 'HEAD': return httpx.Response(404)
            if req.method == 'POST': return httpx.Response(202, headers={'location':location})
            if req.method == 'GET':
                return httpx.Response(204, headers={'Range':f'0-{len(received)-1}', 'Location':location})
            if req.method == 'PATCH':
                start, end = map(int, req.headers['content-range'].split('-'))
                self.assertEqual(start, len(received)); self.assertEqual(end - start + 1, len(req.content))
                received.extend(req.content)
                if not lost_ack:
                    lost_ack = True
                    raise httpx.ReadTimeout('Synthetic lost acknowledgement')
                return httpx.Response(202, headers={'Location':location, 'Range':f'0-{end}'})
            if req.method == 'PUT':
                self.assertEqual(req.url.params['digest'], digest)
                self.assertEqual(bytes(received), expected)
                return httpx.Response(201)
            raise AssertionError('Unexpected registry request')
        registry = upload.Registry('ccr.ccs.tencentyun.com/ns/image:test','test','password',client=httpx.Client(transport=httpx.MockTransport(handle)),chunk_size=8192)
        result = registry.upload(digest,len(expected),io.BytesIO(expected))
        self.assertFalse(result['alreadyPresent']); self.assertEqual(registry.recoveries,1)

    def test_invalid_blob_never_starts_upload_and_redirect_cannot_leak_auth(self):
        def forbidden(req): raise AssertionError('Network called before integrity validation')
        registry = upload.Registry('ccr.ccs.tencentyun.com/ns/image:test','test','password',client=httpx.Client(transport=httpx.MockTransport(forbidden)))
        with self.assertRaisesRegex(ValueError,'integrity'):
            registry.upload('sha256:'+'0'*64,3,io.BytesIO(b'abc'))
        with self.assertRaisesRegex(ValueError,'unexpected'):
            registry.location('https://unrelated.example/v2/ns/image/blobs/uploads/test')
        self.assertTrue(registry.location('http://ccr.ccs.tencentyun.com/v2/ns/image/blobs/uploads/test').startswith('https://'))


if __name__ == '__main__': unittest.main()
