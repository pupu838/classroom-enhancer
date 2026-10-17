// Runs in Userscripts' isolated content context. Provider credentials never enter this file.
(async()=>{
 const ENDPOINT='https://classroom-enhancer-global-5rcwipvd.edgeone.dev';
 const SCHOOL='https://ylb.nwafu.edu.cn';
 let token=await GM.getValue('ce-tablet-token','');
 async function request(op,body={},anonymous=false){
  const result=await GM.xmlHttpRequest({url:ENDPOINT+'/api/classroom?op='+encodeURIComponent(op),method:'POST',headers:{'Content-Type':'application/json',...(anonymous?{}:{Authorization:'Bearer '+token})},data:JSON.stringify(body),responseType:'text',timeout:60000});
  let data;try{data=JSON.parse(result.responseText||result.response);}catch{throw Error('字幕服务返回异常，请稍后重试');}
  if(result.status<200||result.status>=300)throw Error(data.error||'字幕请求失败');return data;
 }
 const host=document.createElement('div');host.id='ce-tablet-settings';const root=host.attachShadow({mode:'closed'});
 root.innerHTML='<style>:host{position:fixed;left:12px;bottom:12px;z-index:2147483646;font:14px system-ui}button{padding:10px 14px;border-radius:9px;border:1px solid #456;background:#fff;color:#163d32;cursor:pointer}</style><button></button>';
 const button=root.querySelector('button');const paint=()=>{button.textContent=token?'字幕服务已连接 · 设置':'连接字幕服务';};paint();document.documentElement.append(host);
 button.onclick=async()=>{const code=prompt(token?'已连接字幕服务。重新连接请输入新连接码，取消则保留：':'请输入为你生成的一次性字幕服务连接码：');if(!code)return;button.disabled=true;try{const data=await request('pair',{code:code.trim()},true);if(typeof data.token!=='string'||data.token.length<32)throw Error('连接响应无效');token=data.token;await GM.setValue('ce-tablet-token',token);paint();alert('连接成功。现在可在学校页面选择课次，自动生成字幕。');}catch(e){alert(e.message);}finally{button.disabled=false;}};
 if(location.origin!==SCHOOL)return;
 document.documentElement.dataset.ceCloudBridge='1';document.documentElement.dataset.ceTabletBridge='1';
 const mediaRequests=new Map();
 window.addEventListener('message',async event=>{
  const d=event.data;if(event.source!==window||event.origin!==SCHOOL||d?.ce!=='media-request'||typeof d.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(d.requestId))return;
  if(d.cancel){mediaRequests.get(d.requestId)?.abort();return;}
  let answer;try{
   const url=new URL(d.url);
   if(url.protocol!=='https:'||!/^lzm\d+\.nwafu\.edu\.cn$/.test(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!/^\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(url.pathname))throw Error('媒体地址无效');
   if(!Number.isSafeInteger(d.start)||!Number.isSafeInteger(d.end)||d.start<0||d.end<d.start||d.end-d.start>=4*1024*1024)throw Error('媒体分段范围无效');
   const cap=8*1024*1024;let tooLarge=false;
   const pending=GM.xmlHttpRequest({url:url.href,method:'GET',headers:{Range:`bytes=${d.start}-${d.end}`},responseType:'arraybuffer',timeout:90000,onprogress:p=>{if(p.loaded>cap){tooLarge=true;mediaRequests.get(d.requestId)?.abort();}}});
   mediaRequests.set(d.requestId,pending);
   let result;try{result=await pending;}catch(e){if(tooLarge)throw Error('媒体服务器忽略了分段请求，无法安全读取此视频');throw Error('Userscripts 未能读取学校媒体。请在 Safari 扩展设置中允许 Userscripts 访问所有网站，并确认学校原播放器能播放。');}finally{mediaRequests.delete(d.requestId);}
   const bytes=result.response;
   if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>cap)throw Error('媒体服务器返回的数据格式异常');
   const range=String(result.responseHeaders||'').split(/\r?\n/).find(line=>/^content-range\s*:/i.test(line))?.replace(/^content-range\s*:\s*/i,'').trim()||'';
   answer={ce:'media-response',requestId:d.requestId,ok:true,status:result.status,contentRange:range,bytes};
  }catch(e){answer={ce:'media-response',requestId:d.requestId,ok:false,error:e?.message||'媒体读取失败'};}
  window.postMessage(answer,SCHOOL);
 });
 window.addEventListener('message',async event=>{
  const d=event.data;if(event.source!==window||event.origin!==SCHOOL||d?.ce!=='cloud-request'||typeof d.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(d.requestId))return;
  let response;try{
   if(d.op==='settings')response={protocol:'tablet-v1',configured:!!token,autoUpload:!!token,autoSync:false,textbooks:{}};
   else{if(!token)throw Error('请先点左下角“连接字幕服务”完成一次连接');if(!['init','part','status','lecture'].includes(d.op))throw Error('不支持的字幕操作');
    const body=d.op==='init'?d.job:d.op==='part'?{id:d.id,index:d.index,data:d.data}:{id:d.id};response=await request(d.op,body);}
   window.postMessage({ce:'cloud-response',requestId:d.requestId,ok:true,data:response},SCHOOL);
  }catch(e){window.postMessage({ce:'cloud-response',requestId:d.requestId,ok:false,error:e.message},SCHOOL);}
 });
 const script=document.createElement('script');script.textContent=__CE_TABLET_PAGE_SOURCE__;document.documentElement.append(script);script.remove();
})();
