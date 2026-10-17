import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readSchoolMedia} from './media-reader.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(s);
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
export function createService({store,asr,secret,origin,sweepSecret,fetcher=fetch}){
 const save=(k,v)=>store.setJSON(k,v),get=k=>store.get(k,{type:'json',consistency:'strong'});
 const capability=(id,i)=>createHmac('sha256',secret).update(id+':'+i).digest('hex');
 function mediaTime(meta,seconds){const clock=meta.clock;if(!clock)fail('此旧任务需要补充音频时间轴，请重新选择同课次提交；不会重新识别已提交分段',409);const last=clock.at(-1);if(!Number.isFinite(seconds)||seconds<-.05||seconds>last[0]+.2)fail('识别时间戳超出音频范围',502);seconds=Math.max(0,Math.min(last[0],seconds));for(let i=1;i<clock.length;i++){const [x,y]=clock[i],prev=clock[i-1];if(seconds<=x)return meta.start+prev[1]+(seconds-prev[0])*(y-prev[1])/(x-prev[0]);}return meta.end;}
 async function finish(j,i,p,detail){if(!Array.isArray(detail))fail('识别服务未返回带时间戳字幕',502);p.cues=detail.map((c,n)=>({id:`p${i}-${n}`,start:mediaTime(j.parts[i],c.StartMs/1000),end:mediaTime(j.parts[i],c.EndMs/1000),text:c.FinalSentence,reviewed:false})).filter(c=>typeof c.text==='string'&&c.text.trim());if(p.cues.some(c=>c.end<=c.start))fail('字幕时间区间无效',502);p.state='complete';p.finished=Date.now();await save(`parts/${j.id}/${i}`,p);return p;}
 async function load(id){if(!/^[a-f0-9]{32}$/.test(id||''))fail('任务编号无效');const j=await get('jobs/'+id);if(!j)fail('任务不存在',404);return j;}
 async function refresh(j,i){let p=await get(`parts/${j.id}/${i}`);if(!p||p.state==='complete'||p.state==='failed'||!p.taskId)return p;
  if(Date.now()-p.created>24*60*60*1000){p.state='failed';p.error='识别结果已超过服务商24小时保留期，请联系维护者重置此任务后重新生成';await save(`parts/${j.id}/${i}`,p);return p;}
  const r=await asr.DescribeTaskStatus({TaskId:p.taskId});const d=r.Data;
  if(d.Status===2){await finish(j,i,p,d.ResultDetail);
  }else if(d.Status===3){p.state='failed';p.error=String(d.ErrorMsg||'识别失败').slice(0,200);await save(`parts/${j.id}/${i}`,p);}return p;
 }
 async function status(j,refreshAll=true){const rows=[];for(let i=0;i<j.parts.length;i++)rows.push(refreshAll?await refresh(j,i):await get(`parts/${j.id}/${i}`));const complete=rows.every(p=>p?.state==='complete'),submitted=rows.every(p=>p?.taskId),failed=rows.some(p=>p?.state==='failed'||p?.state==='uncertain');
  const out={id:j.id,state:complete?'complete':failed?'failed':submitted?'transcribing':'uploading',submitted:rows.filter(p=>p?.taskId).length,total:rows.length,finished:rows.filter(p=>p?.state==='complete').length,error:rows.find(p=>p?.error)?.error||null};
  if(complete){await store.delete('pending/'+j.id);let cues=rows.flatMap(p=>p.cues).sort((a,b)=>a.start-b.start);out.package={schema:'classroom-enhancer/1',lectureId:j.lectureId,packageId:j.id,media:{duration:j.duration,sha256:j.sha256},coverage:{status:'complete',intervals:[[0,j.duration]]},tracks:[{id:'tencent-asr',kind:'asr',revision:1,segments:cues}],chapters:[]};}return out;
 }
 return async request=>{
  const u=new URL(request.url),op=u.searchParams.get('op');let id=u.searchParams.get('id'),index=Number(u.searchParams.get('index'));
  if(op==='callback'){
   if(request.method!=='POST'||!Number.isSafeInteger(index)||index<0||!same(u.searchParams.get('key'),capability(id,index)))fail('无效回调',401);const j=await load(id);if(index>=j.parts.length)fail('分段不存在');const raw=await request.text();if(raw.length>2000000)fail('回调过大',413);const data=new URLSearchParams(raw),p=await get(`parts/${j.id}/${index}`);await save(`receipts/${j.id}/${index}`,{received:Date.now(),fields:[...data.keys()],taskMatched:!!p?.taskId&&String(p.taskId)===data.get('requestId')});if(!p?.taskId||String(p.taskId)!==data.get('requestId'))fail('回调任务不匹配',409);if(p.state!=='complete'){if(data.get('code')==='0'){p.callback=true;await finish(j,index,p,JSON.parse(data.get('resultDetail')||'null'));}else{p.state='failed';p.error='腾讯云识别失败，代码：'+String(data.get('code')).slice(0,30);await save(`parts/${j.id}/${index}`,p);}}return {code:0,message:'success'};
  }
  const scheduler=op==='sweep'&&typeof sweepSecret==='string'&&sweepSecret.length>=32&&same(request.headers.get('authorization'),'Bearer '+sweepSecret);
  if(!scheduler&&!same(request.headers.get('authorization'),'Bearer '+secret))fail('连接口令无效，请重新连接',401);
  if(op==='health')return {ready:true,protocol:'tablet-v1'};
  if(request.method!=='POST')fail('请求方法不支持',405);
  const raw=await request.text();if(raw.length>4500000)fail('上传分段过大',413);const b=JSON.parse(raw||'{}');
  // Existing installed bridges already forward init jobs. This additive mode
  // provides audio preparation without changing their permissions or tokens.
  if(op==='init'&&b.mode==='media-read')return readSchoolMedia(b,fetcher);
  if(op==='sweep'){
   const entries=await store.list({prefix:'pending/',limit:4,consistency:'strong'}),results=[];
   for(const entry of entries.blobs){const jobId=entry.key.slice('pending/'.length);try{const j=await load(jobId),s=await status(j);results.push(s.state);if(s.state==='failed')await store.delete(entry.key);}catch{results.push('needs_review');}}
   await save('maintenance/last-sweep',{time:Date.now(),checked:results.length});return {checked:results.length,complete:results.filter(s=>s==='complete').length,needsReview:results.filter(s=>s==='needs_review'||s==='failed').length};
  }
  if(op==='init'){
   if(!validId(b.lectureId)||!validId(b.courseId)||typeof b.name!=='string'||b.name.length>200||!/^[a-f0-9]{64}$/.test(b.sha256)||!Number.isFinite(b.duration)||b.duration<=0||b.duration>14400||!Array.isArray(b.parts)||!b.parts.length||b.parts.length>100)fail('课次信息无效');let end=0;
   for(const p of b.parts){if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||Math.abs(p.start-end)>.01||p.end<=p.start||p.end>b.duration+.01||!Number.isInteger(p.size)||p.size<1||p.size>3*1024*1024||!/^[a-f0-9]{64}$/.test(p.sha256))fail('音频分段存在缺口或超过限制');const clock=p.clock;if(!Array.isArray(clock)||clock.length<2||clock.length>20000||clock.some((x,i)=>!Array.isArray(x)||x.length!==2||!x.every(Number.isFinite)||x[0]<0||x[1]<0||(i>0&&(x[0]<=clock[i-1][0]||x[1]<clock[i-1][1])))||clock[0][0]!==0||clock[0][1]!==0||Math.abs(clock.at(-1)[1]-(p.end-p.start))>.01)fail('音频时间轴映射无效');end=p.end;}if(Math.abs(end-b.duration)>.01)fail('音频分段没有覆盖整课');
   id=hash(b.lectureId+':'+b.sha256).slice(0,32);const old=await get('jobs/'+id);if(old){if(old.parts.every(p=>!p.clock)&&old.parts.length===b.parts.length&&old.parts.every((p,i)=>['start','end','size','sha256'].every(k=>p[k]===b.parts[i][k]))){old.parts=b.parts;await save('jobs/'+id,old);}const current=await status(old);if(current.state==='transcribing')await save('pending/'+id,{id});return current;}
   const previous=await get('lectures/'+b.lectureId);if(previous&&previous.id!==id)fail('同课次已有另一音轨，请先核对',409);
   const j={id,lectureId:b.lectureId,courseId:b.courseId,name:b.name,duration:b.duration,sha256:b.sha256,parts:b.parts,created:Date.now()};await save('jobs/'+id,j);await save('lectures/'+b.lectureId,{id});return status(j,false);
  }
  if(op==='lecture'){if(!validId(b.id))fail('课次编号无效');const ref=await get('lectures/'+b.id);return ref?status(await load(ref.id)):{state:'not_uploaded'};}
  const j=await load(b.id);
  if(op==='status')return status(j,b.refresh!==false);
  if(op==='diagnostics'){const parts=[];for(let i=0;i<j.parts.length;i++){const p=await get(`parts/${j.id}/${i}`);let info=null;if(p?.taskId){const r=await asr.DescribeTaskStatus({TaskId:p.taskId});info={status:r.Data.Status,duration:r.Data.AudioDuration,first:r.Data.ResultDetail?.[0],last:r.Data.ResultDetail?.at(-1)};}parts.push({index:i,metadata:j.parts[i],state:p?.state,receipt:await get(`receipts/${j.id}/${i}`),info});}return {parts};}
  if(op==='part'){
   index=b.index;if(!Number.isInteger(index)||index<0||index>=j.parts.length||typeof b.data!=='string'||! /^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('上传分段无效');const key=`parts/${j.id}/${index}`,previous=await get(key);
   if(previous?.taskId){const state=await status(j,false);if(state.state==='transcribing')await save('pending/'+j.id,{id:j.id});return state;}if(previous?.state==='submitting'||previous?.state==='uncertain')fail('此分段提交结果待确认，已停止重复提交，避免重复消耗额度',409);
   const data=Buffer.from(b.data,'base64'),meta=j.parts[index];if(data.length!==meta.size||hash(data)!==meta.sha256)fail('音频完整性校验失败');
   // Persist the intent before the billable call. Ambiguous network outcomes are never auto-retried.
   await save(key,{state:'submitting',created:Date.now()});
   try{const r=await asr.CreateRecTask({EngineModelType:'16k_zh',ChannelNum:1,ResTextFormat:3,SourceType:1,Data:b.data,DataLen:data.length,SentenceMaxLength:28,CallbackUrl:origin+`/api/classroom?op=callback&id=${j.id}&index=${index}&key=${capability(j.id,index)}`});if(!r.Data?.TaskId)throw Error('missing-task-id');await save(key,{state:'transcribing',taskId:r.Data.TaskId,created:Date.now()});}
   catch(e){const code=String(e.code||'');const rejected=/^(AuthFailure|InvalidParameter|LimitExceeded|FailedOperation|ResourceUnavailable|UnauthorizedOperation)/.test(code);await save(key,{state:rejected?'failed':'uncertain',error:rejected?'腾讯云拒绝本次识别：'+code:'提交结果待确认，请勿反复点击；需要检查云端任务',created:Date.now()});throw Object.assign(Error(rejected?'腾讯云拒绝识别：'+code:'提交结果待确认，已停止自动重试'),{status:502});}
   const current=await status(j,false);if(current.state==='transcribing')await save('pending/'+j.id,{id:j.id});return current;
  }
  fail('不支持的操作');
 };
}
