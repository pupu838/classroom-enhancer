"""Download an observed NWAFU classroom media URL and extract audio; no credentials."""
import argparse
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

REFERER = 'https://ylb.nwafu.edu.cn/'
MAX_BYTES = 2 * 1024**3

def validate_url(value):
    u = urllib.parse.urlsplit(value)
    if (u.scheme != 'https' or not re.fullmatch(r'lzm\d+\.nwafu\.edu\.cn', u.hostname or '')
        or u.port not in (None, 443) or u.username or u.password or u.query or u.fragment
        or not re.fullmatch(r'/bkt-lanz-record/[A-Za-z0-9_./-]+\.mp4', u.path)
        or '..' in u.path):
        raise ValueError('仅接受从学校播放器读取的 lzm 数字域名 /bkt-lanz-record/ MP4 地址')
    return value

class SchoolRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def extract(url, output, seconds=None):
    validate_url(url)
    if not shutil.which('ffmpeg'):
        raise RuntimeError('请先安装 FFmpeg')
    output = Path(output)
    if output.suffix.lower() not in ('.mp3', '.wav'):
        raise ValueError('输出文件必须为 .mp3 或 .wav')
    if output.exists():
        raise FileExistsError(f'不会覆盖已有文件：{output}')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='classroom-audio-') as tmp:
        source = Path(tmp) / 'lecture.mp4'
        request = urllib.request.Request(url, headers={'Referer': REFERER})
        opener = urllib.request.build_opener(SchoolRedirects())
        with opener.open(request, timeout=60) as response, source.open('wb') as target:
            if response.status != 200 or 'video/mp4' not in response.headers.get('Content-Type', ''):
                raise RuntimeError('服务器没有返回完整 MP4；请重新打开回放获取有效地址')
            total = 0
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > MAX_BYTES:
                    raise RuntimeError('媒体超过 2 GiB 上限')
                target.write(block)
        with source.open('rb') as check:
            if check.read(12)[4:8] != b'ftyp':
                raise RuntimeError('响应不是 MP4 文件')
        result = Path(tmp) / ('audio' + output.suffix)
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', str(source)]
        if seconds:
            cmd += ['-t', str(seconds)]
        cmd += ['-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000']
        cmd += ['-c:a', 'libmp3lame', '-b:a', '48k'] if output.suffix.lower() == '.mp3' else ['-c:a', 'pcm_s16le']
        subprocess.run(cmd + [str(result)], check=True)
        # Exclusive creation also protects against a destination created during download.
        with output.open('xb') as target, result.open('rb') as audio:
            shutil.copyfileobj(audio, target)
    return output

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', type=validate_url)
    parser.add_argument('-o', '--output', required=True)
    parser.add_argument('--seconds', type=int)
    args = parser.parse_args()
    if args.seconds is not None and args.seconds <= 0:
        parser.error('--seconds 必须大于 0')
    print(extract(args.url, args.output, args.seconds))

if __name__ == '__main__':
    main()
