"""Bounded FP32 MossFormerGAN processing; no downloads or networking at runtime."""
import hashlib
import time
from pathlib import Path
import numpy as np

MODEL_SHA256 = '708b725800ee43542f64c2a00a7a00289411385aecec75e8fc2295ea596be422'
MODEL_ID = 'moss-se16k-fp32-v1'
RATE, N, H, FRAMES, OVERLAP = 16000, 400, 100, 401, 80


class MossEngine:
    def __init__(self, model_path, require_gpu=True):
        import onnxruntime as ort
        if hashlib.sha256(Path(model_path).read_bytes()).hexdigest() != MODEL_SHA256:
            raise RuntimeError('模型文件校验失败')
        if require_gpu and 'CUDAExecutionProvider' not in ort.get_available_providers():
            raise RuntimeError('GPU 尚未就绪')
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        providers = [('CUDAExecutionProvider', {'use_tf32': '0', 'gpu_mem_limit': str(4 * 1024**3), 'arena_extend_strategy': 'kSameAsRequested'})] if require_gpu else ['CPUExecutionProvider']
        self.session = ort.InferenceSession(str(model_path), sess_options=options, providers=providers)
        if require_gpu and self.session.get_providers()[0] != 'CUDAExecutionProvider':
            raise RuntimeError('GPU 初始化失败')
        self.provider = self.session.get_providers()[0]

    def enhance(self, audio):
        return enhance(self.session, audio)


def enhance(session, audio):
    x = np.asarray(audio, dtype=np.float32)
    if x.ndim != 1 or not 400 <= len(x) <= RATE * 11 or not np.isfinite(x).all():
        raise ValueError('音频长度或采样无效')
    rms = float(np.sqrt(np.mean(x.astype(np.float64)**2)))
    if rms < 1e-7:
        return np.zeros_like(x), []
    norm = 1 / rms
    y = x.astype(np.float64) * norm
    count = len(y)
    padding = (-count) % H
    if padding:
        y = np.concatenate((y, y[:padding]))
    window = .54 - .46 * np.cos(2 * np.pi * np.arange(N) / N)
    padded = np.pad(y, (N // 2, N // 2), mode='reflect')
    frames = np.lib.stride_tricks.sliding_window_view(padded, N)[::H]
    spec = np.fft.rfft(frames * window, axis=-1).T
    compressed = np.abs(spec)**.3 * np.exp(1j * np.angle(spec))
    blocks = np.stack((compressed.real, compressed.imag)).transpose(0, 2, 1)
    total = blocks.shape[1]
    acc = np.zeros_like(blocks)
    weight = np.zeros((1, total, 1))
    ramp = np.linspace(0, 1, OVERLAP)
    times = []
    for start in range(0, total, FRAMES - OVERLAP):
        block = blocks[:, start:start + FRAMES]
        n = block.shape[1]
        batch = np.pad(block, ((0, 0), (0, FRAMES - n), (0, 0)))[None].astype(np.float32)
        began = time.perf_counter()
        out = session.run(None, {'spec': batch})[0][0, :, :n]
        times.append(time.perf_counter() - began)
        if not np.isfinite(out).all():
            raise RuntimeError('模型输出异常')
        envelope = np.ones((1, n, 1))
        if start:
            envelope[0, :min(OVERLAP, n), 0] = ramp[:min(OVERLAP, n)]
        if start + FRAMES < total:
            envelope[0, -OVERLAP:, 0] = ramp[::-1]
        acc[:, start:start + n] += out * envelope
        weight[:, start:start + n] += envelope
    acc /= np.maximum(weight, 1e-8)
    estimated = acc[0].T + 1j * acc[1].T
    z = np.abs(estimated)**(1 / .3) * np.exp(1j * np.angle(estimated))
    frames = np.fft.irfft(z.T, n=N) * window
    result = np.zeros(N + H * (len(frames) - 1))
    envelope = np.zeros_like(result)
    for i, frame in enumerate(frames):
        result[i * H:i * H + N] += frame
        envelope[i * H:i * H + N] += window**2
    result /= np.maximum(envelope, 1e-11)
    result = (result[N // 2:-N // 2][:count] / norm).astype(np.float32)
    if len(result) != len(x) or not np.isfinite(result).all():
        raise RuntimeError('模型输出时间轴异常')
    return result, times
