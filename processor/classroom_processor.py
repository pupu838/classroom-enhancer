"""Local-file-only classroom transcription. No model or media downloads."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave
from contextlib import contextmanager

SCHEMA = 'classroom-enhancer/1'

def digest_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as f:
        tmp = Path(f.name)
        json.dump(data, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

@contextmanager
def job_lock(directory):
    """OS lock releases on crash; the lock file itself may remain."""
    f = open(directory / '.lock', 'a+b')
    try:
        f.seek(0); f.write(b'0'); f.flush(); f.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        raise ValueError('此输出目录已有处理任务，请等待它结束。')
    try:
        yield
    finally:
        f.close()

def decode(source, target, audio_track=0):
    # Explicit local input and protocol whitelist also reject remote URLs in playlists.
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe',
                    '-i', str(source), '-map', f'0:a:{audio_track}', '-vn', '-ar', '16000',
                    '-ac', '1', '-c:a', 'pcm_s16le', str(target)], check=True)

def windows(duration, size=60, overlap=2):
    if not 5 <= size <= 300 or not 0 <= overlap <= min(10, size / 4):
        raise ValueError('分段为 5–300 秒，重叠不得超过分段的四分之一或 10 秒。')
    for i in range(math.ceil(duration / size)):
        a, b = i * size, min((i + 1) * size, duration)
        yield {'index': i, 'start': a, 'end': b, 'readStart': max(0, a-overlap),
               'readEnd': min(duration, b+overlap)}

def cut_wave(src, dst, a, b):
    with wave.open(str(src), 'rb') as r:
        rate = r.getframerate()
        r.setpos(round(a * rate))
        frames = r.readframes(round((b-a) * rate))
        with wave.open(str(dst), 'wb') as w:
            w.setparams(r.getparams()); w.writeframes(frames)

def cues_from_chunk(raw, window, offset):
    """Assign words by midpoint to one core window; retain engine raw output in checkpoint."""
    result = []
    for i, segment in enumerate(raw):
        words = segment.get('words') or [segment]
        accepted = []
        for word in words:
            a, b = word['start'] + window['readStart'], word['end'] + window['readStart']
            if not all(isinstance(n, (int, float)) and math.isfinite(n) for n in (a, b)) or b <= a:
                continue
            mid = (a+b)/2
            if window['start'] <= mid < window['end']:
                a, b = max(0, a), min(window['readEnd'], b)
                if b > a:
                    accepted.append((a, b, word.get('word', word.get('text', ''))))
        text = ''.join(w[2] for w in accepted).strip()
        if text:
            result.append({'id': f'c{window["index"]}-s{i}',
                           'start': round(accepted[0][0]+offset, 3),
                           'end': round(accepted[-1][1]+offset, 3), 'text': text,
                           'reviewed': False, 'boundaryReview': any(abs(accepted[0][0]-x)<2 or abs(accepted[-1][1]-x)<2
                                                                  for x in (window['start'], window['end']))})
    return result

class WhisperBackend:
    def __init__(self, folder, device='cpu', compute_type='int8', prompt=''):
        folder = Path(folder).resolve()
        for name in ('model.bin', 'config.json', 'tokenizer.json'):
            if not (folder/name).is_file():
                raise ValueError(f'本地模型缺少 {name}；不会自动下载模型。')
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        from faster_whisper import WhisperModel
        from importlib.metadata import version
        self.identity = {'engine': 'faster-whisper', 'engineVersion': version('faster-whisper'), 'model': folder.name,
                         'files': {p.name: digest_file(p) for p in sorted(folder.iterdir()) if p.is_file()},
                         'device': device, 'computeType': compute_type, 'promptHash': digest(prompt)}
        self.model = WhisperModel(str(folder), device=device, compute_type=compute_type, local_files_only=True)
        self.prompt = prompt

    def transcribe(self, path):
        segments, _ = self.model.transcribe(str(path), language='zh', beam_size=5,
                                           word_timestamps=True, vad_filter=False,
                                           condition_on_previous_text=False, initial_prompt=self.prompt or None)
        return [{'start': s.start, 'end': s.end, 'text': s.text,
                 'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in (s.words or [])]}
                for s in segments]

def process(source, output, lecture_id, backend, size=60, overlap=2, offset=0, video_duration=None, audio_track=0, progress=print, cancel=None):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file():
        raise ValueError('需要本地音频/视频文件，不接受网址。')
    if not lecture_id or len(lecture_id) > 300 or not math.isfinite(offset) or offset < 0:
        raise ValueError('课次 ID 或偏移无效。')
    output.mkdir(parents=True, exist_ok=True)
    with job_lock(output):
        signature = {'schema': SCHEMA, 'sourceSha256': digest_file(source), 'lectureId': lecture_id,
                     'backend': backend.identity, 'size': size, 'overlap': overlap, 'offset': offset,
                     'videoDuration': video_duration, 'audioTrack': audio_track}
        fingerprint = digest(signature)
        checkpoint = output/'checkpoint.json'
        state = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else {'fingerprint': fingerprint, 'chunks': {}}
        if state['fingerprint'] != fingerprint:
            raise ValueError('输入、模型或参数已变化，请使用新的输出目录，避免复用旧字幕。')
        with tempfile.TemporaryDirectory(prefix='ce-audio-') as temporary:
            pcm, part = Path(temporary)/'audio.wav', Path(temporary)/'part.wav'
            decode(source, pcm, audio_track)
            with wave.open(str(pcm), 'rb') as w:
                duration = w.getnframes()/w.getframerate()
            total = duration + offset if video_duration is None else video_duration
            if not math.isfinite(total) or duration <= 0 or total < duration+offset-.01:
                raise ValueError('视频总时长小于音频结束时间，或媒体时长无效。')
            schedule = list(windows(duration, size, overlap))
            def export():
                completed = [x for x in schedule if str(x['index']) in state['chunks']]
                cues = [c for x in completed for c in cues_from_chunk(state['chunks'][str(x['index'])]['raw'], x, offset)]
                cues.sort(key=lambda c: (c['start'], c['end']))
                complete = len(completed)==len(schedule) and offset==0 and abs(total-duration)<.01
                package = {'schema': SCHEMA, 'lectureId': lecture_id, 'packageId': fingerprint,
                           'media': {'sha256': signature['sourceSha256'], 'duration': total, 'audioTrack': audio_track},
                           'coverage': {'status': 'complete' if complete else 'partial',
                                        'intervals': [[round(x['start']+offset,3), round(x['end']+offset,3)] for x in completed]},
                           'tracks': [{'id': 'asr-original', 'kind': 'asr', 'revision': 1,
                                       'engine': backend.identity['engine'], 'segments': cues}],
                           'warnings': ['处理区间覆盖不代表识别准确或没有漏句。所有识别稿待复核。',
                                        '分段接缝可能重复或遗漏，请复核 boundaryReview 段。']}
                write_json(output/'classroom.json', package)
                return package
            export()  # A resumed failed run never masquerades as a complete transcript.
            for item in schedule:
                index = str(item['index'])
                if index in state['chunks']:
                    continue
                if cancel is not None and cancel.is_set():
                    raise InterruptedError('已停止；完成的片段已保留。')
                cut_wave(pcm, part, item['readStart'], item['readEnd'])
                try:
                    raw = backend.transcribe(part)
                    cues_from_chunk(raw, item, offset)  # Validate before committing the checkpoint.
                    state['chunks'][index] = {'raw': raw}
                    state.pop('failedChunk', None)
                    write_json(checkpoint, state)
                    export()
                    progress(f'处理完成 {len(state["chunks"])}/{len(schedule)}')
                except Exception:
                    state['failedChunk'] = int(index)
                    write_json(checkpoint, state)
                    export()
                    raise
            return export()

def main():
    parser = argparse.ArgumentParser(description='本地课堂转写：需要已有本地 faster-whisper 模型和 ffmpeg。')
    parser.add_argument('input', type=Path)
    parser.add_argument('--lecture-id', required=True)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    parser.add_argument('--compute-type', default='int8')
    parser.add_argument('--terms', type=Path, help='UTF-8 术语提示文件；只作提示，不作已讲内容证据')
    parser.add_argument('--chunk-seconds', type=float, default=60)
    parser.add_argument('--overlap-seconds', type=float, default=2)
    parser.add_argument('--offset', type=float, default=0, help='片段在原视频中的起始秒数')
    parser.add_argument('--video-duration', type=float)
    parser.add_argument('--audio-track', type=int, default=0)
    args = parser.parse_args()
    try:
        prompt = args.terms.read_text(encoding='utf-8') if args.terms else ''
        if len(prompt)>2000:
            raise ValueError('术语提示最多 2000 字，请保留与本节课相关的词。')
        backend = WhisperBackend(args.model_dir, args.device, args.compute_type, prompt)
        result = process(args.input, args.output, args.lecture_id, backend, args.chunk_seconds,
                         args.overlap_seconds, args.offset, args.video_duration, args.audio_track)
        print(f'输出：{args.output / "classroom.json"}；{result["coverage"]["status"]}；内容待复核')
    except (Exception, KeyboardInterrupt) as e:
        print(f'未完成：{e or "用户中断；重跑相同命令可恢复"}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
