import base64
import hashlib
import io
from pathlib import Path
import subprocess
import unittest
import wave
import numpy as np
from fastapi.testclient import TestClient
from cloud.moss_service import create_app, validate
from cloud.moss_engine import MODEL_ID, enhance


class Identity:
    calls = 0
    def enhance(self, pcm):
        self.calls += 1
        return pcm, []


class ServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Real encoded AAC, not fake bytes mirroring the request validator.
        result = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                                 'sine=frequency=1200:sample_rate=16000:duration=4', '-ac', '1',
                                 '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'],
                                stdout=subprocess.PIPE, check=True)
        cls.data = result.stdout

    def setUp(self):
        self.engine = Identity()
        self.client = TestClient(create_app(lambda: self.engine, token='test-only-' * 5))
        self.headers = {'Authorization': 'Bearer ' + 'test-only-' * 5}
        self.body = {'model': MODEL_ID, 'sha256': hashlib.sha256(self.data).hexdigest(),
                     'data': base64.b64encode(self.data).decode(), 'trimSeconds': .5, 'duration': 3}

    def test_auth_and_integrity_before_inference(self):
        self.assertEqual(self.client.post('/enhance', json=self.body).status_code, 401)
        bad = dict(self.body, sha256='0' * 64)
        self.assertEqual(self.client.post('/enhance', json=bad, headers=self.headers).status_code, 400)
        self.assertEqual(self.engine.calls, 0)

    def test_real_decode_timing_and_idempotency(self):
        first = self.client.post('/enhance', json=self.body, headers=self.headers)
        self.assertEqual(first.status_code, 200, first.text)
        result = first.json(); data = base64.b64decode(result['data'])
        self.assertEqual(result['sha256'], hashlib.sha256(data).hexdigest())
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual(wav.getframerate(), 16000)
            self.assertEqual(wav.getnframes(), 48000)
            pcm = np.frombuffer(wav.readframes(48000), dtype='<i2').astype(float) / 32767 * 4
        self.assertGreater(np.sqrt(np.mean(pcm**2)), .05)
        again = self.client.post('/enhance', json=self.body, headers=self.headers)
        self.assertEqual(again.json(), result)
        self.assertEqual(self.engine.calls, 1)

    def test_bounds_and_bad_audio(self):
        for patch in ({'duration': 60}, {'trimSeconds': -1}, {'data': '*' * 100}, {'model': 'other'}):
            self.assertEqual(self.client.post('/enhance', json=dict(self.body, **patch), headers=self.headers).status_code, 400)
        bad = b'#EXTM3U\nhttp://127.0.0.1/private' * 3
        body = dict(self.body, data=base64.b64encode(bad).decode(), sha256=hashlib.sha256(bad).hexdigest())
        self.assertEqual(self.client.post('/enhance', json=body, headers=self.headers).status_code, 422)
        self.assertEqual(self.engine.calls, 0)

    def test_stft_identity_and_silence(self):
        class Pass:
            def run(self, unused, feeds): return [feeds['spec']]
        x = np.random.default_rng(8).normal(0, .1, 55123).astype(np.float32)
        y, _ = enhance(Pass(), x)
        self.assertEqual(len(x), len(y))
        self.assertLess(float(np.max(np.abs(x-y))), 1e-5)
        y, times = enhance(Pass(), np.zeros(500, dtype=np.float32))
        self.assertTrue(np.all(y == 0)); self.assertEqual(times, [])


if __name__ == '__main__': unittest.main()
