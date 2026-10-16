"""Single-owner persistent worker. Deploy behind HTTPS with a mounted data volume."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import uuid
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from cloud.pipeline import process

ROOT = Path(os.environ.get('CE_DATA', './cloud-data')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
LOCK = threading.Lock()
UPLOAD_LOCK = threading.Lock()
STOP = threading.Event()


def db():
    c = sqlite3.connect(ROOT / 'jobs.db', timeout=30)
    c.row_factory = sqlite3.Row
    return c


with db() as c:
    c.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, lecture TEXT UNIQUE, metadata TEXT, state TEXT, size INTEGER, received INTEGER DEFAULT 0, error TEXT, result TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP)')


def patch(job_id, **values):
    assert set(values) <= {'state', 'received', 'error', 'result'}
    with db() as c:
        c.execute('UPDATE jobs SET ' + ','.join(k+'=?' for k in values) + ',updated=CURRENT_TIMESTAMP WHERE id=?', [*values.values(), job_id])


def worker():
    # With one uvicorn worker, restart resumes staged work from durable ASR/correction checkpoints.
    with db() as c:
        c.execute("UPDATE jobs SET state='queued' WHERE state IN ('transcribing','correcting','chapters','publishing')")
    while not STOP.wait(1):
        with db() as c:
            row = c.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY updated LIMIT 1").fetchone()
        if not row:
            continue
        try:
            metadata = json.loads(row['metadata'])
            result = process(metadata, ROOT / row['id'], lambda stage: patch(row['id'], state=stage))
            patch(row['id'], state='complete', result=json.dumps(result, ensure_ascii=False), error=None)
        except Exception as e:
            # Do not persist HTTP request bodies, OAuth tokens, or provider headers in user-visible errors.
            message = str(e) if isinstance(e, (ValueError, RuntimeError)) else type(e).__name__ + '：后台处理失败，可重试；请检查服务端配置与额度'
            patch(row['id'], state='failed', error=message[:300])


@asynccontextmanager
async def lifespan(app):
    secret = os.environ.get('CE_API_TOKEN', '')
    if len(secret) < 32:
        raise RuntimeError('CE_API_TOKEN must contain at least 32 characters')
    STOP.clear()
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    yield
    STOP.set()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def authenticate(request: Request, call_next):
    supplied = request.headers.get('authorization', '')
    expected = 'Bearer ' + os.environ.get('CE_API_TOKEN', '')
    if len(expected) < 39 or not hmac.compare_digest(supplied, expected):
        return JSONResponse({'detail': 'Unauthorized'}, status_code=401)
    # Requests originate in extension background, not arbitrary public-page CORS contexts.
    return await call_next(request)


class Job(BaseModel):
    lectureId: str = Field(min_length=1, max_length=200, pattern=r'^[A-Za-z0-9_-]+$')
    name: str = Field(min_length=1, max_length=200)
    courseId: str = Field(min_length=1, max_length=200)
    textbookId: str = Field(min_length=5, max_length=150, pattern=r'^[A-Za-z0-9_-]+$')
    size: int = Field(gt=0, le=300*1024*1024)
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')


def public(row):
    return {k: row[k] for k in ('id', 'state', 'received', 'size', 'error', 'updated')}


def get(job_id):
    if not re.fullmatch('[a-f0-9]{32}', job_id):
        raise HTTPException(404)
    with db() as c:
        row = c.execute('SELECT * FROM jobs WHERE id=?', [job_id]).fetchone()
    if not row:
        raise HTTPException(404)
    return row


@app.get('/health')
def health():
    names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID', 'CORRECTION_API_BASE', 'CORRECTION_MODEL']
    missing = [n for n in names if not os.environ.get(n)]
    return {'ready': not missing, 'missing': missing}


@app.post('/jobs')
def create(job: Job):
    with LOCK, db() as c:
        row = c.execute('SELECT * FROM jobs WHERE lecture=?', [job.lectureId]).fetchone()
        if row:
            previous = json.loads(row['metadata'])
            if previous['sha256'] != job.sha256:
                raise HTTPException(409, '课次已有不同音频，请先核对课次来源，禁止静默覆盖')
            return public(row)
        identifier = uuid.uuid4().hex
        meta = {**job.model_dump(), 'id': identifier}
        (ROOT / identifier).mkdir()
        c.execute('INSERT INTO jobs (id,lecture,metadata,state,size) VALUES (?,?,?,?,?)', [identifier, job.lectureId, json.dumps(meta), 'uploading', job.size])
    return public(get(identifier))


@app.put('/jobs/{job_id}/audio')
async def upload(job_id: str, request: Request, offset: int):
    # Bounded 2 MiB chunks; retries use acknowledged offsets. No giant body buffering.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 2*1024*1024:
            raise HTTPException(413)
    with UPLOAD_LOCK:
        row = get(job_id)
        if row['state'] != 'uploading' or offset < 0 or offset != row['received']:
            raise HTTPException(409, '上传偏移不一致，请读取任务状态后重试')
        if not body or offset+len(body) > row['size']:
            raise HTTPException(400, '音频大小无效')
        path = ROOT / job_id / 'audio'
        with open(path, 'r+b' if path.exists() else 'w+b') as f:
            # Recover a write that reached disk before its DB acknowledgement.
            f.truncate(offset)
            f.seek(offset)
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        patch(job_id, received=offset+len(body))
    return public(get(job_id))


@app.post('/jobs/{job_id}/commit')
def commit(job_id: str):
    with UPLOAD_LOCK:
        row = get(job_id)
        if row['state'] != 'uploading':
            return public(row)
        if row['received'] != row['size']:
            raise HTTPException(409, '上传尚未完成')
        h = hashlib.sha256()
        with open(ROOT/job_id/'audio', 'rb') as f:
            for chunk in iter(lambda: f.read(1024*1024), b''):
                h.update(chunk)
        if h.hexdigest() != json.loads(row['metadata'])['sha256']:
            raise HTTPException(409, '音频校验失败，未提交后台处理')
        patch(job_id, state='queued')
    return public(get(job_id))


@app.get('/jobs/{job_id}')
def status(job_id: str):
    return public(get(job_id))


@app.post('/jobs/{job_id}/retry')
def retry(job_id: str):
    row = get(job_id)
    if row['state'] != 'failed':
        raise HTTPException(409, '只有失败任务可以重试')
    patch(job_id, state='queued', error=None)
    return public(get(job_id))


@app.get('/lectures/{lecture_id}')
def lecture(lecture_id: str):
    with db() as c:
        row = c.execute('SELECT * FROM jobs WHERE lecture=?', [lecture_id]).fetchone()
    if not row:
        raise HTTPException(404, '该课次尚未上传')
    result = public(row)
    if row['state'] == 'complete':
        result.update(json.loads(row['result']))
    return result
