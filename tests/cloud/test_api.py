import hashlib
import importlib
import json
import os
import sys
from fastapi.testclient import TestClient


def test_authenticated_resumable_upload_and_restart(tmp_path, monkeypatch):
    monkeypatch.setenv('CE_DATA', str(tmp_path))
    monkeypatch.setenv('CE_API_TOKEN', 'a'*40)
    sys.modules.pop('cloud.app', None)
    m = importlib.import_module('cloud.app')
    # No lifespan => test queue boundaries without running an ASR/provider or exposing actual audio.
    client = TestClient(m.app)
    headers = {'Authorization': 'Bearer '+'a'*40}
    audio = b'synthetic-audio-for-protocol-tests'
    meta = {'lectureId': 'lecture-1', 'courseId': 'c1', 'textbookId': 'fixture-book', 'name': 'Synthetic', 'size': len(audio), 'sha256': hashlib.sha256(audio).hexdigest()}
    assert client.post('/jobs', json=meta).status_code == 401
    r = client.post('/jobs', json=meta, headers=headers)
    assert r.status_code == 200
    job = r.json()['id']
    assert client.post('/jobs', json=meta, headers=headers).json()['id'] == job
    assert client.post(f'/jobs/{job}/commit', headers=headers).status_code == 409
    first = client.put(f'/jobs/{job}/audio?offset=0', content=audio[:8], headers=headers)
    assert first.json()['received'] == 8
    assert client.put(f'/jobs/{job}/audio?offset=0', content=audio[:8], headers=headers).status_code == 409
    # Reopen application; bytes and acknowledged offset survive.
    m = importlib.reload(m)
    client = TestClient(m.app)
    assert client.get(f'/jobs/{job}', headers=headers).json()['received'] == 8
    assert client.put(f'/jobs/{job}/audio?offset=8', content=audio[8:], headers=headers).status_code == 200
    assert client.post(f'/jobs/{job}/commit', headers=headers).json()['state'] == 'queued'
    different = {**meta, 'sha256': 'b'*64}
    assert client.post('/jobs', json=different, headers=headers).status_code == 409
    assert client.get('/health', headers=headers).json()['ready'] is False
    assert client.get('/lectures/lecture-1', headers=headers).json()['state'] == 'queued'
