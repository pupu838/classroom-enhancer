"""Compare the padding rewrite against ONNX's independent CPU reference."""
import hashlib
from pathlib import Path
import unittest

import numpy as np
import onnx
from onnx import helper as h, numpy_helper as nh
from onnx.reference import ReferenceEvaluator
from cloud.moss_cuda_model import rewrite
from cloud.moss_engine import MODEL_SHA256, CUDA_MODEL_SHA256


class PaddingRewriteTest(unittest.TestCase):
    def test_asymmetric_grouped_dilated_and_strided_convolutions(self):
        rng = np.random.default_rng(37)
        for pads, group, strides, dilations in (
                ([1, 1, 0, 1], 1, [1, 1], [1, 1]),
                ([4, 1, 0, 1], 2, [1, 1], [4, 1]),
                ([0, 1, 2, 3], 2, [2, 2], [1, 1])):
            with self.subTest(pads=pads, group=group, strides=strides):
                weight = rng.normal(0, .1, (4, 4 // group, 2, 3)).astype(np.float32)
                graph = h.make_graph([h.make_node('Conv', ['x', 'w'], ['y'], name='conv',
                    pads=pads, group=group, strides=strides, dilations=dilations)], 'padding',
                    [h.make_tensor_value_info('x', onnx.TensorProto.FLOAT, [1, 4, 20, 21])],
                    [h.make_tensor_value_info('y', onnx.TensorProto.FLOAT, [None] * 4)],
                    [nh.from_array(weight, 'w')])
                original = h.make_model(graph, opset_imports=[h.make_opsetid('', 17)], ir_version=8)
                rewritten, changed = rewrite(original)
                sample = rng.normal(0, .2, (1, 4, 20, 21)).astype(np.float32)
                expected = ReferenceEvaluator(original).run(None, {'x': sample})[0]
                actual = ReferenceEvaluator(rewritten).run(None, {'x': sample})[0]
                np.testing.assert_allclose(actual, expected, rtol=2e-6, atol=2e-6)
                self.assertEqual(changed, ['conv'])

    def test_pinned_full_model_weights_and_deterministic_graph(self):
        path = Path(__file__).resolve().parents[2] / 'portal/tablet/vendor/moss-fp32-ort130-708b725800ee/moss-se16k.onnx'
        raw = path.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MODEL_SHA256)
        original = onnx.load_from_string(raw)
        rewritten, changed = rewrite(original)
        self.assertEqual(len(changed), 10)
        self.assertEqual(hashlib.sha256(rewritten.SerializeToString()).hexdigest(), CUDA_MODEL_SHA256)
        weights = {v.name: v.SerializeToString() for v in rewritten.graph.initializer}
        for value in original.graph.initializer:
            self.assertEqual(weights[value.name], value.SerializeToString())
        self.assertEqual(original.SerializeToString(), raw)


if __name__ == '__main__':
    unittest.main()
