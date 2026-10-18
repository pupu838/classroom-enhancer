"""Two bounded requests to an AUTHORIZED private GPU deployment. No auto retry."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import time
from urllib.parse import urlparse
import httpx

p=argparse.ArgumentParser();p.add_argument('aac',help='a previously prepared eight-second AAC MP4 window');p.add_argument('report');args=p.parse_args()
url=os.environ['CE_MOSS_URL'];token=os.environ['CE_MOSS_TOKEN'];parsed=urlparse(url)
assert parsed.scheme=='https' and not parsed.username and not parsed.query and len(token)>=32
headers={'Authorization':'Bearer '+token}
if parsed.hostname.endswith('.modal.run'):
    headers.update({'Modal-Key':os.environ['CE_MOSS_PROXY_KEY'],'Modal-Secret':os.environ['CE_MOSS_PROXY_SECRET']})
audio=Path(args.aac).read_bytes();assert 32<=len(audio)<=1048576
body={'model':'moss-se16k-fp32-v1','data':base64.b64encode(audio).decode(),'sha256':hashlib.sha256(audio).hexdigest(),'duration':6}
rows=[]
with httpx.Client(timeout=55,follow_redirects=False) as client:
    for trim in (.5,1.0):
        began=time.perf_counter()
        response=client.post(url,headers=headers,json={**body,'trimSeconds':trim})
        if response.status_code!=200:
            raise SystemExit('Remote acceptance failed, HTTP '+str(response.status_code)+'; no retry issued')
        result=response.json();elapsed=time.perf_counter()-began;data=base64.b64decode(result['data'],validate=True)
        assert result['protocol']=='ce-moss-segment/1' and result['samples']==96000 and result['pcmScale']==4
        assert result['inputSha256']==body['sha256'] and result['trimSeconds']==trim
        assert len(data)==192044 and hashlib.sha256(data).hexdigest()==result['sha256']
        rows.append({'roundTripSeconds':elapsed,'inferenceMs':result['inferenceMs'],'finiteWavChecked':True})
report={'requests':2,'automaticRetries':0,'results':rows,'warmSupports1xPlanningGate':rows[1]['roundTripSeconds']<3.75,'warmSupports2xPlanningGate':rows[1]['roundTripSeconds']<1.875,'note':'Planning gates only; sustained real replay and physical iPad acceptance still required'}
Path(args.report).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
