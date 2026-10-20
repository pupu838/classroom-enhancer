"""Two bounded requests to an AUTHORIZED private GPU deployment. No auto retry."""
import argparse
from array import array
import base64
import hashlib
import hmac
import io
import math
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
import wave
from urllib.parse import urlparse
import httpx

p=argparse.ArgumentParser();p.add_argument('aac',help='a previously prepared eight-second AAC MP4 window');p.add_argument('report');p.add_argument('--audio-dir',help='optional private directory for the returned WAV clips');p.add_argument('--rounds',type=int,choices=(1,2),default=2,help='maximum requests; stops at the first failure');args=p.parse_args()
url=os.environ['CE_MOSS_URL'];token=os.environ['CE_MOSS_TOKEN'];parsed=urlparse(url)
assert parsed.scheme=='https' and not parsed.username and not parsed.query and len(token)>=32
headers={'Content-Type':'application/json','Authorization':'Bearer '+token}
if parsed.hostname.endswith('.modal.run'):
    headers.update({'Modal-Key':os.environ['CE_MOSS_PROXY_KEY'],'Modal-Secret':os.environ['CE_MOSS_PROXY_SECRET']})
audio=Path(args.aac).read_bytes();assert 32<=len(audio)<=1048576
body={'model':'moss-se16k-fp32-v1','data':base64.b64encode(audio).decode(),'sha256':hashlib.sha256(audio).hexdigest(),'duration':6}
rows=[]

def request_headers(payload):
    if not parsed.hostname.endswith(('.tencentscf.com', '.scf.tencentcs.com')):
        return headers
    # Function URL CAM authentication is checked before a billable worker runs.
    # These credentials are separate from the existing ASR-only key.
    secret_id=os.environ['CE_MOSS_SCF_SECRET_ID'];secret_key=os.environ['CE_MOSS_SCF_SECRET_KEY'];uin=os.environ['CE_MOSS_SCF_UIN']
    stamp=int(time.time());date=datetime.fromtimestamp(stamp,timezone.utc).date().isoformat()
    sha=lambda value:hashlib.sha256(value.encode()).hexdigest()
    mac=lambda key,value:hmac.new(key,value.encode(),hashlib.sha256).digest()
    canonical='POST\n'+parsed.path+'\n\ncontent-type:application/json\nhost:'+parsed.netloc+'\n\ncontent-type;host\n'+sha(payload)
    scope=date+'/scf/tc3_request'
    signing=mac(mac(mac(('TC3'+secret_key).encode(),date),'scf'),'tc3_request')
    signature=hmac.new(signing,('TC3-HMAC-SHA256\n'+str(stamp)+'\n'+scope+'\n'+sha(canonical)).encode(),hashlib.sha256).hexdigest()
    result={'Content-Type':'application/json','Authorization':f'TC3-HMAC-SHA256 Credential={secret_id}/{scope}, SignedHeaders=content-type;host, Signature={signature}','X-Scf-Cam-Timestamp':str(stamp),'X-Scf-Cam-Uin':uin,'X-CE-Moss-Token':token}
    if os.environ.get('CE_MOSS_SCF_SESSION_TOKEN'):result['X-Scf-Cam-Token']=os.environ['CE_MOSS_SCF_SESSION_TOKEN']
    return result

with httpx.Client(timeout=55,follow_redirects=False) as client:
    for trim in (.5,1.0)[:args.rounds]:
        payload=json.dumps({**body,'trimSeconds':trim},separators=(',',':'))
        began=time.perf_counter()
        response=client.post(url,headers=request_headers(payload),content=payload.encode())
        if response.status_code!=200:
            # Preserve platform diagnostics for support without the AAC input,
            # request authorization, or arbitrary server response contents.
            diagnostic={}
            try:
                document=response.json()
                if isinstance(document,dict):
                    platform=document.get('Response',document)
                    if isinstance(platform,dict):
                        failure=platform.get('Error',platform.get('error',platform))
                        if isinstance(failure,dict):
                            for field in ('Code','Message','code','message'):
                                if isinstance(failure.get(field),str):diagnostic[field]=failure[field][:1500]
                        for field in ('RequestId','requestId'):
                            if isinstance(platform.get(field),str):diagnostic[field]=platform[field][:200]
            except ValueError:
                pass
            for field in ('x-scf-request-id','x-scf-requestid','x-request-id','x-tc-requestid'):
                if response.headers.get(field):diagnostic[field]=response.headers[field][:200]
            for field,value in diagnostic.items():
                for name in ('CE_MOSS_TOKEN','CE_MOSS_SCF_SECRET_ID','CE_MOSS_SCF_SECRET_KEY','CE_MOSS_SCF_SESSION_TOKEN'):
                    secret=os.environ.get(name)
                    if secret:value=value.replace(secret,'[redacted]')
                diagnostic[field]=value
            report={'status':'remote_http_failure','requests':len(rows)+1,'maximumRequests':args.rounds,'automaticRetries':0,'httpStatus':response.status_code,'roundTripSeconds':time.perf_counter()-began,'diagnostic':diagnostic,'results':rows,'note':'Stopped at the first failure; no further request issued'}
            Path(args.report).write_text(json.dumps(report,indent=2),encoding='utf-8')
            raise SystemExit('Remote acceptance failed, HTTP '+str(response.status_code)+'; no retry issued')
        result=response.json();elapsed=time.perf_counter()-began;data=base64.b64decode(result['data'],validate=True)
        assert result['protocol']=='ce-moss-segment/1' and result['samples']==96000 and result['pcmScale']==4
        assert result['inputSha256']==body['sha256'] and result['trimSeconds']==trim
        assert len(data)==192044 and hashlib.sha256(data).hexdigest()==result['sha256']
        with wave.open(io.BytesIO(data)) as wav:
            assert wav.getnchannels()==1 and wav.getsampwidth()==2 and wav.getframerate()==16000 and wav.getnframes()==96000
            pcm=array('h',wav.readframes(96000))
        if os.sys.byteorder!='little':pcm.byteswap()
        rms=math.sqrt(sum(float(x)**2 for x in pcm)/len(pcm))/32767*4
        assert 1e-5<rms<1,'Remote output is silent or has abnormal signal energy'
        if args.audio_dir:
            destination=Path(args.audio_dir);destination.mkdir(parents=True,exist_ok=True)
            (destination/f'moss-round-{len(rows)+1}.wav').write_bytes(data)
        rows.append({'roundTripSeconds':elapsed,'inferenceMs':result['inferenceMs'],'finiteWavChecked':True,'rms':rms,**({'diagnostics':result['diagnostics']} if isinstance(result.get('diagnostics'),dict) else {})})
warm=rows[1] if len(rows)>1 else None
report={'status':'success','requests':len(rows),'automaticRetries':0,'results':rows,'warmSupports1xPlanningGate':warm['roundTripSeconds']<3.75 if warm else None,'warmSupports2xPlanningGate':warm['roundTripSeconds']<1.875 if warm else None,'note':'Planning gates only; sustained real replay and physical iPad acceptance still required'}
Path(args.report).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
