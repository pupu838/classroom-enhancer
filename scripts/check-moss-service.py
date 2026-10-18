"""Local acceptance check with genuine classroom PCM; does not contact any cloud."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import time
from fastapi.testclient import TestClient
import numpy as np
from cloud.moss_engine import MossEngine, MODEL_ID
from cloud.moss_service import create_app

p = argparse.ArgumentParser();p.add_argument('pcm');p.add_argument('model');p.add_argument('report');args=p.parse_args()
x = np.fromfile(args.pcm, dtype='<f4')[:56000]
encoded = subprocess.run(['ffmpeg','-v','error','-f','f32le','-ar','16000','-ac','1','-i','pipe:0','-c:a','aac','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],input=x.tobytes(),stdout=subprocess.PIPE,check=True).stdout
began=time.perf_counter();engine=MossEngine(args.model,require_gpu=False);init=time.perf_counter()-began
token='local-acceptance-only-'*3;client=TestClient(create_app(lambda:engine,token=token));body={'model':MODEL_ID,'sha256':hashlib.sha256(encoded).hexdigest(),'data':base64.b64encode(encoded).decode(),'trimSeconds':.5,'duration':2.5}
began=time.perf_counter();r=client.post('/enhance',headers={'Authorization':'Bearer '+token},json=body);elapsed=time.perf_counter()-began
assert r.status_code==200,r.text
data=r.json();audio=base64.b64decode(data['data']);assert data['samples']==40000 and len(audio)==80044 and hashlib.sha256(audio).hexdigest()==data['sha256']
again=time.perf_counter();cached=client.post('/enhance',headers={'Authorization':'Bearer '+token},json=body);cached=time.perf_counter()-again
report={'test':'local real model, not a deployed GPU','provider':engine.provider,'inputAudioSeconds':len(x)/16000,'outputSeconds':data['duration'],'initSeconds':init,'processSeconds':elapsed,'cachedSeconds':cached,'finite':True,'outputBytes':len(audio),'outputSha256':data['sha256']}
Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
