"""Private segment endpoint. Accepts short AAC bytes, never URLs or school login."""
import base64
from collections import OrderedDict
import hashlib
import hmac
import io
import json
import math
import os
import secrets
import subprocess
import threading
import time
import wave
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from .moss_engine import MODEL_ID, RATE, MossEngine

MAX_INPUT = 1024 * 1024


def decode(data):
    # Network protocols are forbidden, including embedded external MP4 references.
    run = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-max_alloc', '67108864',
                          '-protocol_whitelist', 'pipe', '-f', 'mov', '-probesize', '1048576',
                          '-analyzeduration', '1000000', '-threads', '1', '-i', 'pipe:0',
                          '-vn', '-t', '10.5', '-ac', '1', '-ar', str(RATE),
                          '-f', 'f32le', 'pipe:1'], input=data, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL, timeout=12, check=False)
    if run.returncode or len(run.stdout) < 1600 or len(run.stdout) > RATE * 11 * 4:
        raise ValueError('音频分段无法解码')
    return np.frombuffer(run.stdout, dtype='<f4').copy()


def validate(body):
    if not isinstance(body, dict) or body.get('model') != MODEL_ID:
        raise ValueError('降噪模型版本不匹配')
    trim, duration = body.get('trimSeconds'), body.get('duration')
    if any(type(v) not in (float, int) or not math.isfinite(v) for v in (trim, duration)) or not 0 <= trim <= 2.5 or not .2 <= duration <= 6:
        raise ValueError('音频分段时间无效')
    data = body.get('data')
    if not isinstance(data, str) or len(data) > (MAX_INPUT + 2) // 3 * 4:
        raise ValueError('音频分段超过上限')
    try:
        audio = base64.b64decode(data, validate=True)
    except Exception:
        raise ValueError('音频分段编码无效') from None
    digest = hashlib.sha256(audio).hexdigest()
    if not 32 <= len(audio) <= MAX_INPUT or not hmac.compare_digest(digest, str(body.get('sha256', ''))):
        raise ValueError('音频分段校验失败')
    key = hashlib.sha256((MODEL_ID + ':' + digest + ':' + str(trim) + ':' + str(duration)).encode()).hexdigest()
    return audio, digest, float(trim), float(duration), key


def create_app(engine_factory=None, token=None):
    token = token if token is not None else os.environ.get('CE_MOSS_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('CE_MOSS_TOKEN must contain at least 32 characters')
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    lock, cache, engine = threading.Lock(), OrderedDict(), None
    diagnostics = os.environ.get('CE_MOSS_DIAGNOSTICS') == '1'
    instance_id, invocations = secrets.token_hex(8), 0

    @app.post('/enhance')
    async def endpoint(request: Request):
        nonlocal engine
        # SCF reserves Authorization for the platform CAM signature. Keep our
        # independent app secret in a separate header, never in the audio body.
        app_token = request.headers.get('x-ce-moss-token')
        valid = hmac.compare_digest(app_token.encode(), token.encode()) if app_token is not None else hmac.compare_digest(request.headers.get('authorization', '').encode(), ('Bearer ' + token).encode())
        if not valid:
            raise HTTPException(401, '降噪服务认证失败')
        raw = bytearray()
        async for part in request.stream():
            raw.extend(part)
            if len(raw) > 1500000:
                raise HTTPException(413, '音频分段超过上限')
        try:
            audio, digest, trim, duration, key = validate(json.loads(raw))
        except (ValueError, TypeError, UnicodeError) as e:
            raise HTTPException(400, str(e) if isinstance(e, ValueError) else '请求格式无效') from None
        # Inference is bounded and serial. A duplicate gets the same cached output.
        def process():
            nonlocal engine, invocations
            if not lock.acquire(blocking=False):
                raise HTTPException(429, '降噪服务忙，请稍后重新开启')
            try:
                invocations += 1
                if key in cache:
                    cache.move_to_end(key)
                    result = cache[key]
                    if diagnostics:
                        return {**result, 'diagnostics': {**result.get('diagnostics', {}),
                                'instanceId': instance_id, 'invocationIndex': invocations, 'cacheHit': True}}
                    return result
                decoded_at = time.perf_counter()
                pcm = decode(audio)
                decoded_ms = round((time.perf_counter() - decoded_at) * 1000, 2)
                first, count = round(trim * RATE), round(duration * RATE)
                if first + count > len(pcm) + 2:
                    raise ValueError('音频分段未覆盖所需时间')
                cold = engine is None
                init_at = time.perf_counter()
                if cold:
                    engine = engine_factory() if engine_factory else MossEngine(os.environ['CE_MOSS_MODEL'], require_gpu=os.environ.get('CE_MOSS_CPU_TEST') != '1')
                init_ms = round((time.perf_counter() - init_at) * 1000, 2)
                began = time.perf_counter()
                out, block_times = engine.enhance(pcm)
                out = out[first:first + count]
                if len(out) < count:
                    out = np.pad(out, (0, count - len(out)))
                if not np.isfinite(out).all() or np.max(np.abs(out)) >= 4:
                    raise ValueError('降噪输出异常，已保留原声')
                # PCM16 with 4x headroom; browser restores scale before filtering.
                packed = np.rint(out / 4 * 32767).astype('<i2').tobytes()
                data = io.BytesIO()
                with wave.open(data, 'wb') as wav:
                    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE); wav.writeframes(packed)
                data = data.getvalue()
                result = {'protocol': 'ce-moss-segment/1', 'model': MODEL_ID, 'inputSha256': digest,
                          'trimSeconds': trim, 'duration': count / RATE, 'sampleRate': RATE, 'samples': count,
                          'pcmScale': 4, 'sha256': hashlib.sha256(data).hexdigest(),
                          'data': base64.b64encode(data).decode(), 'inferenceMs': round((time.perf_counter() - began) * 1000)}
                if diagnostics:
                    result['diagnostics'] = {'instanceId': instance_id, 'invocationIndex': invocations,
                        'cacheHit': False, 'coldModel': cold, 'decodeMs': decoded_ms, 'modelInitMs': init_ms,
                        'blockMs': [round(value * 1000, 2) for value in block_times],
                        **getattr(engine, 'diagnostics', lambda: {})()}
                cache[key] = result
                while len(cache) > 24:
                    cache.popitem(last=False)
                return result
            finally:
                lock.release()
        # Keep the HTTP loop responsive; the single model is never invoked in parallel.
        import asyncio
        try:
            return await asyncio.to_thread(process)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        except Exception:
            raise HTTPException(503, '云端降噪暂不可用，原声可继续播放') from None
    return app
