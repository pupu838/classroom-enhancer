import assert from 'node:assert/strict';
import {classroomLessonId} from '../scripts/lesson-context.mjs';
import {createSchoolMediaRequest} from '../scripts/browser-media.mjs';
import {createRangeReader} from '../scripts/media-range.mjs';
const scope=(hash,search='',route)=>({location:{hash,search},document:{querySelector:()=>route?{__vue__:{$route:route}}:null}});
for(const key of ['id','videoId','videoInfoId','lectureId'])assert.equal(classroomLessonId(scope('#/aiClassroom/aiClassroom.htm?'+key+'=real-lesson&latestWatchTime=0')),'real-lesson');
assert.equal(classroomLessonId(scope('','?videoId=search-lesson')),'search-lesson');
assert.equal(classroomLessonId(scope('#/courseIndex.htm','',{fullPath:'/old',query:{videoId:'stale-lesson'}})),null);
assert.equal(classroomLessonId(scope('#/video.htm?videoId=%3Cscript%3E')),null);
const url='https://lzm15.nwafu.edu.cn/bkt-lanz-record/test.mp4',data=new Uint8Array(12).map((_,i)=>i),calls=[];
let bridges=0;
const request=createSchoolMediaRequest(async()=>{bridges++;throw Error('Unexpected privileged request');},async(address,options)=>{
 assert.equal(address,url);assert.equal(options.referrerPolicy,'origin');assert.equal(options.credentials,'omit');calls.push(options);
 if(options.method==='HEAD')return new Response(null,{headers:{'content-length':'12'}});
 const [,start,end]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range),bytes=data.slice(Number(start),Number(end)+1);
 // Same as the actual school host: Content-Range not exposed by CORS.
 return new Response(bytes,{status:206,headers:{'content-length':String(bytes.length)}});
});
const reader=await createRangeReader(url,request,undefined,4),chunks=[];
for(;;){const r=await reader.read();if(r.done)break;chunks.push(...r.value);}
assert.deepEqual(chunks,[...data]);assert.equal(bridges,0);assert.equal(calls.filter(c=>c.method==='HEAD').length,1);
let fallback=0;
const blocked=createSchoolMediaRequest(async()=>{fallback++;return {status:206,contentRange:'bytes 0-3/12',bytes:data.slice(0,4)};},async()=>{throw new TypeError('CORS blocked');});
await blocked(url,0,3);await blocked(url,0,3);assert.equal(fallback,2);
let consumed=false,cancelled=false;
const ignored=createSchoolMediaRequest(async()=>({status:403}),async(address,options)=>options.method==='HEAD'?new Response(null,{headers:{'content-length':'12'}}):{status:200,body:{cancel:async()=>cancelled=true},arrayBuffer:async()=>{consumed=true;}});
await assert.rejects(ignored(url,0,3),/拒绝下载/);assert.equal(consumed,false);assert.equal(cancelled,true);
const controller=new AbortController();controller.abort();await assert.rejects(request(url,0,3,controller.signal),/取消/);
console.log('PASS school videoId route, search route, stale route rejection; real-host CORS header behavior, bounded ranges, HEAD cache, bridge fallback, rejected full download and cancellation');
