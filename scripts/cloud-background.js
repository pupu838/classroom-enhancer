'use strict';
const SCHOOL='https://ylb.nwafu.edu.cn';
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.ceCloud!==1)return;
 let allowed=false;try{allowed=new URL(sender.url).origin===SCHOOL;}catch{}
 if(!allowed){reply({ok:false,error:'Invalid source'});return;}
 (async()=>{
  const settings=await chrome.storage.local.get(['cloudEndpoint','cloudToken','textbooks','autoUpload','autoSync']);
  if(msg.op==='settings')return {configured:!!settings.cloudEndpoint&&!!settings.cloudToken,autoUpload:settings.autoUpload===true,autoSync:settings.autoSync===true,textbooks:settings.textbooks||{}};
  if(!settings.cloudEndpoint||!settings.cloudToken)throw Error('请先在扩展设置中配置私有云端处理服务');
  const base=new URL(settings.cloudEndpoint);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('云端地址必须是HTTPS站点根地址');
  const id=String(msg.id||'');let path,method='GET',body,headers={'Authorization':'Bearer '+settings.cloudToken};
  if(msg.op==='create'){path='/jobs';method='POST';headers['Content-Type']='application/json';body=JSON.stringify(msg.job);}
  else if(msg.op==='chunk'){
   if(!/^[a-f0-9]{32}$/.test(id)||!Number.isSafeInteger(msg.offset)||msg.offset<0||typeof msg.data!=='string'||msg.data.length>2800000)throw Error('无效上传分块');
   path='/jobs/'+id+'/audio?offset='+msg.offset;method='PUT';const raw=atob(msg.data);body=Uint8Array.from(raw,c=>c.charCodeAt(0));
  }else if(['commit','retry','status'].includes(msg.op)){
   if(!/^[a-f0-9]{32}$/.test(id))throw Error('无效任务');path='/jobs/'+id+(msg.op==='status'?'':'/'+msg.op);method=msg.op==='status'?'GET':'POST';
  }else if(msg.op==='lecture'){
   if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw Error('无效课次');path='/lectures/'+encodeURIComponent(id);
  }else throw Error('不支持的操作');
  const response=await fetch(base.origin+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});
  if(response.status===404&&msg.op==='lecture')return {state:'not_uploaded'};
  if(!response.ok)throw Error('云端请求失败 HTTP '+response.status);
  return await response.json();
 })().then(data=>reply({ok:true,data})).catch(e=>reply({ok:false,error:e.message}));return true;
});
