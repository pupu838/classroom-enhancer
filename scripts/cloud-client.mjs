import {tabletOffer} from './tablet-client.mjs';
export function cloudCall(op,extra={}){
 return new Promise((resolve,reject)=>{if(document.documentElement.dataset.ceCloudBridge!=='1'){reject(Error('云端同步需使用云端版电脑扩展；当前仍可提取音频'));return;}const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('未检测到云端扩展桥接，请安装云端版电脑扩展并完成设置'));},65000);
 function receive(event){const d=event.data;if(event.source!==window||event.origin!==location.origin||d?.ce!=='cloud-response'||d.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);d.ok?resolve(d.data):reject(Error(d.error||'云端操作失败'));}
 window.addEventListener('message',receive);window.postMessage({ce:'cloud-request',requestId,op,...extra},location.origin);
 });
}
export function installCloud(root){
 const box=document.createElement('div'),heading=document.createElement('h3'),info=document.createElement('p'),list=document.createElement('div');heading.textContent='云端字幕流水线';info.textContent='电脑版可在扩展设置中连接私有处理服务。';box.append(heading,info,list);root.querySelector('section').append(box);
 let failure=null;const status=text=>{info.textContent=text;};
 async function offer(record,name,blob,parts){
  const line=document.createElement('div'),button=document.createElement('button'),retry=document.createElement('button');button.textContent='上传并制作字幕';retry.textContent='重试后台处理';retry.hidden=true;line.append(document.createTextNode(name),button,retry);list.prepend(line);let job=null;
  async function upload(){failure=null;button.disabled=true;try{
   const settings=await cloudCall('settings');if(settings.protocol==='tablet-v1'){await tabletOffer({record,name,blob,parts,line,status,cloudCall});button.hidden=true;return;}const textbookId=settings.textbooks?.[record.course];if(!textbookId)throw Error('请在扩展设置中为这门课关联教材');
   if(parts!==1)throw Error('此课次包含多个媒体分段，当前云端入口暂未接入分段对齐；未上传不完整课堂');
   status('正在校验音频…');const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());const sha256=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
   job=await cloudCall('create',{job:{lectureId:record.id,name,courseId:record.course,textbookId,size:blob.size,sha256}});
   while(job.state==='uploading'&&job.received<blob.size){const offset=job.received,bytes=new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    try{job=await cloudCall('chunk',{id:job.id,offset,data:btoa(binary)});}catch(e){job=await cloudCall('status',{id:job.id});if(job.received===offset)throw e;}
    status(`上传中 ${Math.round(job.received/blob.size*100)}% · 上传确认前请保持浏览器打开`);
   }
   if(job.state==='uploading')job=await cloudCall('commit',{id:job.id});
   status(job.state==='complete'?'该课次字幕已完成，回放时自动加载。':'云端已完整接收音频，可以关闭浏览器；后台继续转录和校正。');button.textContent='查询处理状态';button.onclick=poll;await poll();
  }catch(e){failure=e.message;status(e.message);}finally{button.disabled=false;}}
  async function poll(){try{if(!job)return;job=await cloudCall('status',{id:job.id});const names={queued:'排队中',transcribing:'转录中',correcting:'教材校正中',chapters:'生成章节中',publishing:'保存到Drive中',complete:'字幕与章节已完成',failed:'处理失败'};status((names[job.state]||job.state)+(job.error?'：'+job.error:''));retry.hidden=job.state!=='failed';}catch(e){status(e.message);}}
  retry.onclick=async()=>{try{job=await cloudCall('retry',{id:job.id});await poll();}catch(e){status(e.message);}};button.onclick=upload;
  try{const settings=await cloudCall('settings');if(settings.configured&&settings.autoUpload)await upload();}catch{}return line;
 }
 return {offer,status,get error(){return failure;}};
}
