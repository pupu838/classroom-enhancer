'use strict';
window.addEventListener('message',event=>{
 const d=event.data;if(event.source!==window||event.origin!==location.origin||d?.ce!=='cloud-request'||!/^[-a-f0-9]{36}$/.test(d.requestId||''))return;
 if(!['settings','create','chunk','commit','retry','status','lecture'].includes(d.op))return;
 chrome.runtime.sendMessage({ceCloud:1,op:d.op,id:d.id,job:d.job,data:d.data,offset:d.offset},response=>{
  const error=chrome.runtime.lastError?.message;
  window.postMessage({ce:'cloud-response',requestId:d.requestId,...(error?{ok:false,error}:{...response})},location.origin);
 });
});

document.documentElement.dataset.ceCloudBridge='1';
