const DEFAULT_CHUNK=4*1024*1024;

export function validateMediaUrl(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||!/^lzm\d+\.nwafu\.edu\.cn$/.test(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!/^\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(url.pathname))throw Error('学校返回了不支持的媒体地址');
 return url.href;
}

export async function createRangeReader(url,request,signal,chunkSize=DEFAULT_CHUNK){
 const address=validateMediaUrl(url);
 if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>DEFAULT_CHUNK)throw Error('媒体分段大小无效');
 let next=0,total=null,first=null;
 async function fetchChunk(){
  if(signal?.aborted)throw Error('已取消提取');
  const end=next+chunkSize-1;
  const reply=await request(address,next,end,signal);
  if(reply.status!==206)throw Error(reply.status===200?'媒体服务器不支持分段读取，请换一节课测试或联系维护者':'媒体服务器返回 HTTP '+reply.status);
  const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(reply.contentRange||''));
  if(!match)throw Error('媒体服务器未返回有效的分段位置');
  const start=Number(match[1]),last=Number(match[2]),size=Number(match[3]);
  if(!Number.isSafeInteger(size)||size<1||start!==next||last!==Math.min(end,size-1)||size<=last||total!==null&&size!==total)throw Error('媒体分段位置不连续');
  const bytes=reply.bytes instanceof Uint8Array?reply.bytes:new Uint8Array(reply.bytes);
  if(bytes.byteLength!==last-start+1)throw Error('媒体分段长度不符');
  total=size;next=last+1;return bytes;
 }
 first=await fetchChunk();
 return {total,get received(){return next;},async read(){if(first){const value=first;first=null;return {value,done:false};}if(next>=total)return {done:true};return {value:await fetchChunk(),done:false};},async cancel(){}};
}
