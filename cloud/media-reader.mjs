// Authenticated, bounded gathering of school AAC byte ranges. No login data is sent.
const MAX_SPAN=256*1024*1024,MAX_FETCH=128*1024;
function fail(message,status=400){throw Object.assign(Error(message),{status});}
export async function readSchoolMedia(body,fetcher=fetch){
 let url;try{url=new URL(body.url);}catch{fail('媒体地址无效');}
 if(url.protocol!=='https:'||!/^lzm\d+\.nwafu\.edu\.cn$/.test(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!/^\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(url.pathname))fail('媒体地址无效');
 const ranges=body.ranges;
 if(!Array.isArray(ranges)||!ranges.length||ranges.length>512)fail('媒体分段数量无效');
 let previous=-1,requested=0;
 for(const r of ranges){if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<r.start||r.start<=previous)fail('媒体分段位置无效');previous=r.end;requested+=r.end-r.start+1;}
 if(requested>2*1024*1024||ranges.at(-1).end-ranges[0].start+1>MAX_SPAN)fail('媒体读取超过单次上限',413);
 // Merge small gaps server-side, then return only the requested AAC bytes.
 const windows=[];
 for(const r of ranges){let at=r.start;while(at<=r.end){let w=windows.at(-1);if(w&&at-w.end<=8*1024&&r.end-w.start<MAX_FETCH){w.end=Math.max(w.end,r.end);break;}const end=Math.min(r.end,at+MAX_FETCH-1);windows.push({start:at,end});at=end+1;}}
 let total=null,fetchedBytes=0;const buffers=[];
 for(let i=0;i<windows.length;i+=8){
  const group=await Promise.all(windows.slice(i,i+8).map(async w=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
   try{
    const response=await fetcher(url.href,{redirect:'manual',headers:{Range:`bytes=${w.start}-${w.end}`,Referer:'https://ylb.nwafu.edu.cn/','Accept-Encoding':'identity'},signal:controller.signal});
    if(response.status!==206){await response.body?.cancel();fail('云端读取学校媒体失败 HTTP '+response.status,502);}
    const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
    if(!match||Number(match[1])!==w.start||!Number.isSafeInteger(Number(match[3]))||Number(match[2])!==Math.min(w.end,Number(match[3])-1))fail('学校媒体分段位置不符',502);
    const size=Number(match[3]),last=Number(match[2]),expected=last-w.start+1;
    if(expected<1||expected>MAX_FETCH||total!==null&&total!==size)fail('学校媒体文件发生变化',502);total=size;
    const reader=response.body.getReader(),bytes=new Uint8Array(expected);let offset=0;
    try{for(;;){const next=await reader.read();if(next.done)break;if(offset+next.value.length>expected)fail('学校媒体返回过大',502);bytes.set(next.value,offset);offset+=next.value.length;}}finally{await reader.cancel().catch(()=>{});}
    if(offset!==expected)fail('学校媒体分段不完整',502);fetchedBytes+=offset;return {start:w.start,end:last,bytes};
   }catch(error){if(error.status)throw error;const code=String(error.cause?.code||error.name||'NetworkError').replace(/[^A-Za-z0-9_-]/g,'').slice(0,50);fail('云端取音轨连接失败（'+code+'），可稍后重试',502);}finally{clearTimeout(timer);}
  }));buffers.push(...group);
 }
 const parts=ranges.map(r=>{const end=Math.min(r.end,total-1),out=new Uint8Array(end-r.start+1);let written=0;for(const w of buffers){const start=Math.max(r.start,w.start),last=Math.min(end,w.end);if(last>=start){out.set(w.bytes.subarray(start-w.start,last-w.start+1),start-r.start);written+=last-start+1;}}if(written!==out.length)fail('音轨分段未完整收集',502);return {start:r.start,end,data:Buffer.from(out).toString('base64')};});
 return {protocol:'media-read/1',total,fetchedBytes,parts};
}
