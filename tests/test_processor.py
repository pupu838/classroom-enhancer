import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import wave

spec = importlib.util.spec_from_file_location('processor', Path(__file__).parents[1]/'processor/classroom_processor.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

class FakeBackend:
    identity = {'engine': 'TEST_FIXTURE_ONLY', 'model': 'deterministic'}
    def __init__(self, fail=None): self.calls=0; self.fail=fail
    def transcribe(self, path):
        self.calls+=1
        if self.calls==self.fail: raise RuntimeError('synthetic interruption')
        return [{'start':0.5,'end':2,'text':'合成测试字幕','words':[{'start':0.5,'end':2,'word':'合成测试字幕'}]}]

class ProcessorTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        self.audio=self.root/'input.wav'
        with wave.open(str(self.audio),'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b'\0\0'*16000*12)
    def tearDown(self): self.tmp.cleanup()
    def test_resume_and_partial_truth(self):
        out=self.root/'job'; engine=FakeBackend(fail=2)
        with self.assertRaises(RuntimeError): p.process(self.audio,out,'lesson',engine,size=5,overlap=1)
        data=json.loads((out/'classroom.json').read_text())
        self.assertEqual(data['coverage'],{'status':'partial','intervals':[[0,5]]})
        second=FakeBackend(); data=p.process(self.audio,out,'lesson',second,size=5,overlap=1)
        self.assertEqual(second.calls,2); self.assertEqual(data['coverage']['status'],'complete')
        self.assertNotIn(str(self.audio), json.dumps(data))
        third=FakeBackend(); p.process(self.audio,out,'lesson',third,size=5,overlap=1)
        self.assertEqual(third.calls,0)
        with self.assertRaises(ValueError): p.process(self.audio,out,'other',FakeBackend(),size=5,overlap=1)
    def test_sample_not_full_class(self):
        data=p.process(self.audio,self.root/'sample','lesson',FakeBackend(),size=5,overlap=1,offset=120,video_duration=5400)
        self.assertEqual(data['coverage']['status'],'partial')
        self.assertEqual(data['coverage']['intervals'][0][0],120)
        self.assertGreaterEqual(data['tracks'][0]['segments'][0]['start'],120)
    def test_window_ownership(self):
        raw=[{'start':0,'end':3,'text':'ABC','words':[{'start':0,'end':1,'word':'A'},{'start':1,'end':2,'word':'B'},{'start':2,'end':3,'word':'C'}]}]
        cue=p.cues_from_chunk(raw,{'index':1,'start':5,'end':10,'readStart':4,'readEnd':11},0)
        self.assertEqual(cue[0]['text'],'BC'); self.assertEqual(cue[0]['start'],5)
    def test_source_change_rejected(self):
        out=self.root/'job';p.process(self.audio,out,'lesson',FakeBackend(),size=5,overlap=1)
        with self.audio.open('ab') as f:f.write(b'changed')
        with self.assertRaises(ValueError):p.process(self.audio,out,'lesson',FakeBackend(),size=5,overlap=1)
    def test_invalid_range_and_missing_model(self):
        with self.assertRaises(ValueError):list(p.windows(20,size=5,overlap=4))
        with self.assertRaises(ValueError):p.WhisperBackend(self.root/'missing')
    def test_concurrent_directory_rejected(self):
        with p.job_lock(self.root):
            with self.assertRaises(ValueError):
                with p.job_lock(self.root):pass

if __name__=='__main__':unittest.main()
