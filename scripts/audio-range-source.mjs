import {validateMediaUrl} from './media-range.mjs';

export function createAudioRangeSource(value,nativeRead,cloudCall,signal,onStatus=()=>{}){
 const url=validateMediaUrl(value);let relay=false,total=null;
 const cancelled=()=>{if(signal?.aborted)throw Error('已取消准备');};
 return async ranges=>{
  cancelled();
  if(!relay){try{
   const windows=[];for(const r of ranges){let w=windows.at(-1);if(w&&r.end-w.start<4*1024*1024)w.end=r.end;else windows.push({...r});}
   const buffers=[];for(const w of windows){const reply=await nativeRead(url,w.start,w.end,signal);if(reply.status!==206)throw Error('本机媒体读取失败');const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(reply.contentRange||'');if(!m||Number(m[1])!==w.start||total!==null&&Number(m[3])!==total)throw Error('本机媒体位置异常');total=Number(m[3]);buffers.push({start:w.start,end:Number(m[2]),bytes:new Uint8Array(reply.bytes)});}
   return ranges.map(r=>{const w=buffers.find(w=>w.start<=r.start&&w.end>=Math.min(r.end,total-1));if(!w)throw Error('本机音轨数据不完整');return {start:r.start,total,bytes:w.bytes.slice(r.start-w.start,Math.min(r.end,total-1)-w.start+1)};});
  }catch(error){cancelled();relay=true;onStatus('本机下载受限，正在改用云端提取音轨…');}}
  let reply;
  for(let attempt=0;attempt<3;attempt++){
   try{reply=await cloudCall('init',{job:{mode:'media-read',url,ranges}});break;}
   catch(error){cancelled();const message=error.message||'';if(/请先.*连接|口令无效|尚未连接|未连接字幕|一次性连接/.test(message))throw Error('本机下载受限，需要云端取音轨。请在“设置 → 连接或更换云端服务”完成连接后重试');if(attempt===2||!/超时|暂时|连接失败|HTTP 50[234]|AbortError/.test(message))throw error;onStatus('云端取音轨遇到网络波动，正在重试当前小段…');await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
  }cancelled();
  if(reply?.protocol!=='media-read/1'||!Number.isSafeInteger(reply.total)||reply.total<1||total!==null&&reply.total!==total||reply.parts?.length!==ranges.length)throw Error('云端音轨返回格式异常');total=reply.total;
  return reply.parts.map((p,i)=>{const r=ranges[i],end=Math.min(r.end,total-1);if(p.start!==r.start||p.end!==end||typeof p.data!=='string'||p.data.length>3*1024*1024)throw Error('云端音轨位置异常');const bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));if(bytes.length!==end-r.start+1)throw Error('云端音轨长度异常');return {start:r.start,total,bytes};});
 };
}
