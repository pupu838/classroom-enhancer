"""Build-only rewrite for cuDNN 9.8 asymmetric Conv padding; weights stay FP32."""
import hashlib
from pathlib import Path
import sys

import numpy as np
import onnx
from onnx import helper, numpy_helper

SOURCE_SHA256 = '708b725800ee43542f64c2a00a7a00289411385aecec75e8fc2295ea596be422'


def rewrite(source):
    model = onnx.ModelProto()
    model.CopyFrom(source)
    names = {value for node in model.graph.node for value in (*node.input, *node.output)}
    nodes, changed = [], []
    for node in model.graph.node:
        attrs = {attr.name: attr for attr in node.attribute}
        if node.op_type != 'Conv' or 'pads' not in attrs:
            nodes.append(node)
            continue
        pads = list(attrs['pads'].ints)
        rank = len(pads) // 2
        if pads[:rank] == pads[rank:]:
            nodes.append(node)
            continue
        if rank not in (1, 2, 3) or len(pads) != rank * 2 or min(pads) < 0:
            raise ValueError('Unsupported convolution padding')
        shared = [min(pads[i], pads[i + rank]) for i in range(rank)]
        explicit = [0, 0, *(pads[i] - shared[i] for i in range(rank)),
                    0, 0, *(pads[i + rank] - shared[i] for i in range(rank))]
        prefix = '__ce_cuda_pad_' + str(len(changed))
        output, value = prefix + '_output', prefix + '_pads'
        if output in names or value in names:
            raise ValueError('CUDA rewrite name collision')
        names.update((output, value))
        model.graph.initializer.append(numpy_helper.from_array(np.asarray(explicit, dtype=np.int64), value))
        nodes.append(helper.make_node('Pad', [node.input[0], value], [output], name=prefix, mode='constant'))
        node.input[0] = output
        del attrs['pads'].ints[:]
        attrs['pads'].ints.extend(shared + shared)
        nodes.append(node)
        changed.append(node.name)
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    onnx.checker.check_model(model)
    return model, changed


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:])
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Unexpected source model')
    model, changed = rewrite(onnx.load_from_string(raw))
    if len(changed) != 10:
        raise SystemExit('Unexpected CUDA rewrite count')
    data = model.SerializeToString()
    target.write_bytes(data)
    print({'rewrittenConvolutions': len(changed), 'sha256': hashlib.sha256(data).hexdigest()})
