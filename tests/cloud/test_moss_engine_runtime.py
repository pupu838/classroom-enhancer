"""A GPU-required deployment must never silently retry the model on the CPU."""
import hashlib
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from cloud.moss_engine import MossEngine


class RuntimePolicyTest(unittest.TestCase):
    def test_gpu_error_propagates_without_cpu_retry(self):
        class Session:
            disabled = False
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            def get_providers(self): return self.providers
            def disable_fallback(self): self.disabled = True
        session = Session()
        created = []
        def create(*args, **kwargs):
            created.append(kwargs)
            return session
        ort = SimpleNamespace(SessionOptions=SimpleNamespace,
            get_available_providers=lambda: session.providers,
            InferenceSession=create)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'model.onnx'
            path.write_bytes(b'fixture')
            with patch.dict(sys.modules, {'onnxruntime': ort}), \
                    patch('cloud.moss_engine.MODEL_SHA256', hashlib.sha256(b'fixture').hexdigest()):
                engine = MossEngine(path)
            self.assertTrue(session.disabled)
            options = created[0]['providers'][0][1]
            self.assertEqual(options['cudnn_conv_algo_search'], 'HEURISTIC')
            self.assertEqual(options['use_tf32'], '0')
            with patch('cloud.moss_engine.enhance', side_effect=RuntimeError('CUDA execution failed')) as process:
                with self.assertRaisesRegex(RuntimeError, 'CUDA execution failed'):
                    engine.enhance(object())
                process.assert_called_once()
            session.providers = ['CPUExecutionProvider']
            with patch('cloud.moss_engine.enhance', return_value=('audio', [])):
                with self.assertRaisesRegex(RuntimeError, 'CPU'):
                    engine.enhance(object())
            self.assertEqual(engine.diagnostics()['activeProviders'], ['CPUExecutionProvider'])


if __name__ == '__main__':
    unittest.main()
