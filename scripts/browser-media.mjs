import {validateMediaUrl} from './media-range.mjs';

// Browser requests retain the school's Referer; some media hosts reject GM requests.
// Hosts without CORS still use the installed privileged bridge.
export function createSchoolMediaRequest(bridge,fetcher=(...args)=>fetch(...args)){
 const routes=new Map();
 return async function request(value,start,end,signal){
  const url=validateMediaUrl(value);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end-start>=4*1024*1024)throw Error('媒体分段范围无效');
  if(signal?.aborted)throw Error('已取消提取');
  if(routes.get(url)==='bridge')return bridge(url,start,end,signal);
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(cancel,45000);
  try{
   const options={credentials:'omit',mode:'cors',referrerPolicy:'origin',signal:controller.signal};
   let total=routes.get(url);
   if(!Number.isSafeInteger(total)){
    const head=await fetcher(url,{...options,method:'HEAD'});
    total=Number(head.headers.get('content-length'));
    if(!head.ok||!Number.isSafeInteger(total)||total<1)throw Error('媒体大小不可读取');
   }
   const last=Math.min(end,total-1),expected=last-start+1;
   if(expected<1)throw Error('媒体分段超出文件范围');
   const response=await fetcher(url,{...options,headers:{Range:`bytes=${start}-${end}`}});
   if(response.status!==206){await response.body?.cancel();throw Error('媒体未返回分段数据');}
   const range=response.headers.get('content-range');
   // Content-Range is often hidden by CORS. HEAD total, 206 and exact byte count
   // still bound the read; if exposed, verify the precise server position too.
   const expectedRange=`bytes ${start}-${last}/${total}`;
   if(range&&range!==expectedRange){await response.body?.cancel();throw Error('媒体分段位置不符');}
   const length=response.headers.get('content-length');
   if(length&&Number(length)!==expected){await response.body?.cancel();throw Error('媒体分段长度不符');}
   if(!response.body?.getReader)throw Error('浏览器不支持分段流式读取');
   const reader=response.body.getReader(),bytes=new Uint8Array(expected);let offset=0;
   try{for(;;){const result=await reader.read();if(result.done)break;if(offset+result.value.byteLength>expected)throw Error('媒体分段超过读取上限');bytes.set(result.value,offset);offset+=result.value.byteLength;}}finally{await reader.cancel().catch(()=>{});}
   if(offset!==expected)throw Error('媒体分段未完整返回');
   routes.set(url,total);return {status:206,contentRange:expectedRange,bytes};
  }catch(error){
   if(signal?.aborted)throw Error('已取消提取');
   controller.abort();routes.delete(url);
   const result=await bridge(url,start,end,signal);
   if(result.status===403)throw Error('媒体服务器拒绝下载请求；请确认学校原播放器能播放，并联系维护者检查来源信息');
   if(result.status===206)routes.set(url,'bridge');
   return result;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
 };
}
