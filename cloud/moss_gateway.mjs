import {createHash} from 'node:crypto';
export const MOSS_MODEL='moss-se16k-fp32-v1';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function createMossGateway({url,token,proxyKey,proxySecret,enabled=false,fetcher=fetch}={}){
 let endpoint;try{endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)endpoint=null;}catch{}
 const proxyReady=!endpoint?.hostname.endsWith('.modal.run')||typeof proxyKey==='string'&&proxyKey.length>=16&&typeof proxySecret==='string'&&proxySecret.length>=16;
 const ready=enabled&&!!endpoint&&typeof token==='string'&&token.length>=32&&proxyReady;
 return async body=>{
  if(body.mode==='moss-health')return {protocol:'ce-moss-health/1',ready,model:MOSS_MODEL,clipSeconds:6,hopSeconds:5};
  if(!ready)fail('云端 Moss 降噪尚未开通，当前继续原声',503);
  const {trimSeconds,duration,sha256,data,model}=body;
  if(model!==MOSS_MODEL||!Number.isFinite(trimSeconds)||trimSeconds<0||trimSeconds>2.5||!Number.isFinite(duration)||duration<.2||duration>6||typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||typeof data!=='string'||data.length>1398104||! /^[A-Za-z0-9+/]*={0,2}$/.test(data))fail('降噪分段无效');
  const bytes=Buffer.from(data,'base64');if(bytes.length<32||bytes.length>1048576||createHash('sha256').update(bytes).digest('hex')!==sha256)fail('降噪分段校验失败');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
  try{
   const response=await fetcher(endpoint.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(endpoint.hostname.endsWith('.modal.run')?{'Modal-Key':proxyKey,'Modal-Secret':proxySecret}:{})},body:JSON.stringify({model,trimSeconds,duration,sha256,data}),signal:controller.signal});
   if(!response.ok){await response.body?.cancel();fail(response.status===429?'降噪服务忙，请稍后重新开启':'云端降噪暂不可用，当前继续原声',502);}
   const reader=response.body.getReader();let text='',size=0;const decoder=new TextDecoder();
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>400000)fail('云端降噪返回超过上限',502);text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
   const result=JSON.parse(text),audio=typeof result.data==='string'?Buffer.from(result.data,'base64'):Buffer.alloc(0);
   if(result.protocol!=='ce-moss-segment/1'||result.model!==MOSS_MODEL||result.inputSha256!==sha256||result.trimSeconds!==trimSeconds||result.pcmScale!==4||result.sampleRate!==16000||!Number.isInteger(result.samples)||Math.abs(result.samples-duration*16000)>.51||Math.abs(result.duration-result.samples/16000)>1e-8||audio.length!==44+result.samples*2||createHash('sha256').update(audio).digest('hex')!==result.sha256)fail('云端降噪返回校验失败',502);
   return result;
  }catch(e){if(e.status)throw e;fail('云端降噪连接中断，当前继续原声；请稍后重新开启',502);}finally{clearTimeout(timer);}
 };
}
