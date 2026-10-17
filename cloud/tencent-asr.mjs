import {createHash,createHmac} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,s)=>createHmac('sha256',key).update(s).digest();
export function asrClient(secretId,secretKey,fetcher=fetch){
 async function call(action,data){
  let body=JSON.stringify(data);if(typeof data.TaskId==='string'&&/^\d{1,20}$/.test(data.TaskId))body=body.replace(/"TaskId":"(\d+)"/,'"TaskId":$1');const timestamp=Math.floor(Date.now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10),host='asr.tencentcloudapi.com';
  const canonical='POST\n/\n\ncontent-type:application/json\nhost:'+host+'\n\ncontent-type;host\n'+sha(body),scope=date+'/asr/tc3_request';
  const signing=hmac(hmac(hmac('TC3'+secretKey,date),'asr'),'tc3_request');
  const signature=createHmac('sha256',signing).update('TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+sha(canonical)).digest('hex');
  const r=await fetcher('https://'+host,{method:'POST',headers:{'Content-Type':'application/json','X-TC-Action':action,'X-TC-Version':'2019-06-14','X-TC-Timestamp':String(timestamp),'X-TC-Region':'ap-shanghai',Authorization:`TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`},body,signal:AbortSignal.timeout(50000),redirect:'error'});
  if(!r.ok)throw Error('provider-http');const result=JSON.parse((await r.text()).replace(/("TaskId"\s*:\s*)(\d{16,})/g,'$1"$2"')).Response;if(result?.Error)throw Object.assign(Error('provider-error'),{code:result.Error.Code});if(!result)throw Error('provider-response');return result;
 }
 return {CreateRecTask:data=>call('CreateRecTask',data),DescribeTaskStatus:data=>call('DescribeTaskStatus',data)};
}
