// Fixed local endpoint only. No third-party API, no token collection, no video transfer.
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(msg?.type!=='CE_LOCAL_AI')return;
 let allowed=false;try{allowed=new URL(sender.url).origin==='https://ylb.nwafu.edu.cn'}catch{}
 if(!allowed||typeof msg.model!=='string'||msg.model.length>120||typeof msg.prompt!=='string'||msg.prompt.length>45000){sendResponse({ok:false,error:'无效的本机分析请求'});return;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
 fetch('http://localhost:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:msg.model,stream:false,format:'json',messages:[{role:'user',content:msg.prompt}]}),signal:controller.signal})
 .then(async r=>{if(!r.ok)throw Error('本机模型返回 HTTP '+r.status);const d=await r.json();if(typeof d.message?.content!=='string')throw Error('本机模型响应格式不正确');sendResponse({ok:true,content:d.message.content});})
 .catch(e=>sendResponse({ok:false,error:e.name==='AbortError'?'本机分析超时，请使用更快的模型或稍后重试':e.message})).finally(()=>clearTimeout(timer));return true;
});
