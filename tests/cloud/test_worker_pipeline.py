import json
import sys
import types
from cloud import pipeline as p


def test_pipeline_keeps_raw_and_publishes_independent_outputs(tmp_path, monkeypatch):
    calls = []
    class FakeDrive:
        def text(self, identifier): return '教材：结构刚度矩阵与位移法。'*40
        def put(self, name, content, mime, key):
            calls.append((name, content, key))
            return 'file-' + str(len(calls))
        def read_index(self): return {'older-lecture': {'name': 'older'}}
    class Model:
        def __init__(self, *args, **kwargs): pass
        def transcribe(self, *args, **kwargs):
            return iter([types.SimpleNamespace(start=1, end=5, text='刚肚矩阵')]), None
    def answer(prompt, data):
        if 'chapters' in prompt:
            return {'chapters': [{'cueId': 's0', 'title': '刚度矩阵'}]}
        return {'cues': [{'id': 's0', 'text': '刚度矩阵'}]}
    monkeypatch.setattr(p, 'Drive', FakeDrive)
    monkeypatch.setattr(p, 'model_json', answer)
    monkeypatch.setattr(p.subprocess, 'check_output', lambda *args, **kwargs: b'10.0')
    monkeypatch.setitem(sys.modules, 'faster_whisper', types.SimpleNamespace(WhisperModel=Model))
    monkeypatch.setenv('CORRECTION_MODEL', 'fixture-model')
    (tmp_path/'audio').write_bytes(b'fixture')
    job = {'id': 'j1', 'lectureId': 'l1', 'courseId': 'c1', 'name': 'fixture', 'textbookId': 'book'}
    phases = []
    result = p.process(job, tmp_path, phases.append)
    tracks = result['package']['tracks']
    assert tracks[0]['segments'][0]['text'] == '刚肚矩阵'
    assert tracks[1]['segments'][0]['text'] == '刚度矩阵'
    assert tracks[1]['segments'][0]['start'] == tracks[0]['segments'][0]['start']
    assert result['package']['chapters'][0]['start'] == 1
    assert len(calls) == 6
    index = json.loads(calls[-1][1])
    assert 'older-lecture' in index and 'l1' in index
    assert phases == ['transcribing', 'correcting', 'chapters', 'publishing']
    # Durable ASR and correction checkpoints must avoid a second ASR call on retry.
    class NoASR:
        def __init__(self, *args, **kwargs): raise AssertionError('ASR ran twice')
    monkeypatch.setitem(sys.modules, 'faster_whisper', types.SimpleNamespace(WhisperModel=NoASR))
    p.process(job, tmp_path, lambda stage: None)
