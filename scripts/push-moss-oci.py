"""Bounded, resumable OCI upload to the configured private Tencent registry.

Uploads public container artifacts only. Never creates or invokes an SCF/GPU.
https://distribution.github.io/distribution/spec/api/#chunked-upload
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tarfile
import time
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
import httpx

HOST = 'ccr.ccs.tencentyun.com'
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')


class Registry:
    def __init__(self, image, username, password, client=None, chunk_size=8 * 1024**2):
        match = re.fullmatch(r'ccr\.ccs\.tencentyun\.com/([a-z0-9._-]+/[a-z0-9._-]+):([A-Za-z0-9_.-]{1,128})', image)
        if not match or not username or not password:
            raise ValueError('Private Tencent registry configuration is incomplete')
        self.repo, self.tag = match.groups()
        self.root = 'https://' + HOST
        self.path = self.root + '/v2/' + self.repo
        self.username, self.password = username, password
        self.client = client or httpx.Client(timeout=httpx.Timeout(60, connect=15), follow_redirects=False)
        self.token, self.token_time, self.chunk_size = '', 0, chunk_size
        self.recoveries = 0

    def location(self, value):
        url = urlsplit(urljoin(self.root, value))
        if url.hostname != HOST or url.username or url.password or url.port not in (None, 443, 80) or not url.path.startswith('/v2/' + self.repo + '/blobs/uploads/'):
            raise ValueError('Registry returned an unexpected upload destination')
        # Some registry reverse proxies advertise HTTP despite HTTPS ingress.
        return urlunsplit(('https', HOST, url.path, url.query, ''))

    def authenticate(self):
        response = self.client.get(self.root + '/v2/')
        challenge = response.headers.get('www-authenticate', '')
        realm = re.search(r'realm="([^"]+)"', challenge)
        service = re.search(r'service="([^"]+)"', challenge)
        if not realm or not service:
            raise ValueError('Registry authentication challenge is missing')
        parsed = urlsplit(realm.group(1))
        if parsed.scheme != 'https' or parsed.hostname != HOST or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError('Registry authentication destination is invalid')
        result = self.client.get(realm.group(1), params={'service': service.group(1), 'scope': 'repository:' + self.repo + ':pull,push'}, auth=(self.username, self.password))
        result.raise_for_status()
        self.token = result.json().get('token') or result.json().get('access_token')
        if not isinstance(self.token, str) or not self.token:
            raise ValueError('Registry authentication was not accepted')
        self.token_time = time.monotonic()

    def request(self, method, url, **kwargs):
        if not self.token or time.monotonic() - self.token_time > 240:
            self.authenticate()
        headers = dict(kwargs.pop('headers', {}), Authorization='Bearer ' + self.token)
        response = self.client.request(method, url, headers=headers, **kwargs)
        if response.status_code == 401:
            self.authenticate()
            headers['Authorization'] = 'Bearer ' + self.token
            response = self.client.request(method, url, headers=headers, **kwargs)
        return response

    def upload(self, digest, size, source):
        if not DIGEST.fullmatch(digest) or not 0 < size < 5 * 1024**3:
            raise ValueError('OCI blob metadata is invalid')
        # Validate archive bytes independently before handing them to a registry.
        source.seek(0); actual = hashlib.sha256(); count = 0
        while data := source.read(self.chunk_size):
            actual.update(data); count += len(data)
        if count != size or 'sha256:' + actual.hexdigest() != digest:
            raise ValueError('OCI blob integrity check failed')
        head = self.request('HEAD', self.path + '/blobs/' + digest)
        if head.status_code == 200:
            return {'bytes': size, 'alreadyPresent': True}
        if head.status_code != 404:
            head.raise_for_status()
        created = self.request('POST', self.path + '/blobs/uploads/', content=b'')
        if created.status_code != 202:
            created.raise_for_status(); raise ValueError('Registry did not start an upload')
        location = self.location(created.headers['location'])
        offset, failures, notified = 0, 0, -1
        while offset < size:
            source.seek(offset); data = source.read(min(self.chunk_size, size - offset))
            start = offset
            try:
                part = self.request('PATCH', location, content=data, headers={'Content-Type': 'application/octet-stream', 'Content-Range': f'{offset}-{offset + len(data) - 1}'})
                if part.status_code not in (202, 416) and part.status_code < 500:
                    part.raise_for_status(); raise ValueError('Registry rejected an upload chunk')
                if part.status_code == 202:
                    location = self.location(part.headers.get('location', location))
                    offset += len(data)
                else:
                    raise httpx.ReadError('Chunk confirmation unavailable')
            except httpx.TransportError:
                failures += 1; self.recoveries += 1
                if failures > 8:
                    raise ValueError('Registry transfer repeatedly interrupted') from None
                status = self.request('GET', location)
                if status.status_code != 204:
                    status.raise_for_status(); raise ValueError('Registry resume status is unavailable')
                received = re.fullmatch(r'(?:bytes=)?0-(\d+)', status.headers.get('range', ''))
                if not received:
                    raise ValueError('Registry resume range is invalid')
                end = int(received[1]); offset = end + 1 if end else 0
                if not start <= offset <= start + len(data):
                    raise ValueError('Registry resume offset is inconsistent')
                location = self.location(status.headers.get('location', location))
            progress = offset // (64 * 1024**2)
            if progress != notified:
                print(f'Layer {digest[7:19]}: {offset}/{size} bytes confirmed', flush=True)
                notified = progress
        query = parse_qsl(urlsplit(location).query, keep_blank_values=True)
        query.append(('digest', digest)); parts = urlsplit(location)
        finished = self.request('PUT', urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), '')), content=b'')
        if finished.status_code != 201:
            finished.raise_for_status(); raise ValueError('Registry did not finalize an upload')
        return {'bytes': size, 'alreadyPresent': False}

    def manifest(self, raw, media_type):
        result = self.request('PUT', self.path + '/manifests/' + self.tag, content=raw, headers={'Content-Type': media_type})
        if result.status_code != 201:
            result.raise_for_status(); raise ValueError('Registry did not accept image manifest')
        check = self.request('GET', self.path + '/manifests/' + self.tag, headers={'Accept': media_type})
        check.raise_for_status()
        if hashlib.sha256(check.content).digest() != hashlib.sha256(raw).digest():
            raise ValueError('Registry manifest verification failed')


def push(archive_path, image, username, password):
    began = time.monotonic(); registry = Registry(image, username, password)
    rows = []
    with tarfile.open(archive_path) as archive:
        def read(name):
            stream = archive.extractfile(name)
            if stream is None:
                raise ValueError('OCI archive member is missing')
            return stream

        def metadata(digest):
            if not DIGEST.fullmatch(digest):
                raise ValueError('OCI descriptor digest is invalid')
            data = read('blobs/sha256/' + digest[7:]).read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024 or 'sha256:' + hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('OCI metadata integrity check failed')
            return data

        index = json.load(read('index.json'))
        if len(index.get('manifests', [])) != 1:
            raise ValueError('Expected one pinned OCI image')
        raw = metadata(index['manifests'][0]['digest']); manifest = json.loads(raw)
        config = json.loads(metadata(manifest['config']['digest']))
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64':
            raise ValueError('SCF requires the pinned Linux amd64 image')
        if '9000/tcp' not in config.get('config', {}).get('ExposedPorts', {}):
            raise ValueError('SCF port 9000 is missing')
        for blob in [*manifest['layers'], manifest['config']]:
            with read('blobs/sha256/' + blob['digest'][7:]) as stream:
                rows.append(registry.upload(blob['digest'], blob['size'], stream))
        registry.manifest(raw, manifest['mediaType'])
    return {'uploaded': True, 'image': image, 'manifestSha256': hashlib.sha256(raw).hexdigest(), 'seconds': round(time.monotonic() - began, 2), 'recoveries': registry.recoveries, 'blobs': rows, 'gpuInvocations': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('archive'); parser.add_argument('image'); parser.add_argument('report'); args = parser.parse_args()
    try:
        report = push(args.archive, args.image, os.environ['CE_TCR_USERNAME'], os.environ['CE_TCR_PASSWORD'])
    except httpx.HTTPStatusError as exc:
        raise SystemExit('Private registry upload failed, HTTP ' + str(exc.response.status_code)) from None
    except (httpx.TransportError, ValueError, KeyError, tarfile.TarError) as exc:
        raise SystemExit('Private registry upload failed: ' + type(exc).__name__ + '; credentials and upload URLs withheld') from None
    Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('Private image uploaded and verified; no SCF function created or GPU invoked', flush=True)
