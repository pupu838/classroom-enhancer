const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

(async()=>{
 const origin='https://ylb.nwafu.edu.cn';
 const dom=new JSDOM('<html><body></body></html>',{url:origin+'/TeachingCenterStudentWeb/index.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.GM={getValue:async()=>'',setValue:async()=>{},xmlHttpRequest:async options=>{calls.push(options);return {status:206,response:new w.Uint8Array([1,2,3,4]).buffer,responseHeaders:'Content-Range: bytes 0-3/900000000\r\nContent-Type: video/mp4'}}};
 w.eval(readFileSync('scripts/tablet-bridge.js','utf8').replace('__CE_TABLET_PAGE_SOURCE__',JSON.stringify('')));
 await new Promise(resolve=>setTimeout(resolve,0));
 const responses=[];w.addEventListener('message',event=>{if(event.data?.ce==='media-response')responses.push(event.data);});
 function dispatch(requestId,url){w.dispatchEvent(new w.MessageEvent('message',{source:w,origin,data:{ce:'media-request',requestId,url,start:0,end:3}}));}
 dispatch('11111111-1111-4111-8111-111111111111','https://lzm42.nwafu.edu.cn/bkt-lanz-record/sample.mp4');
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(calls.length,1);assert.equal(calls[0].headers.Range,'bytes=0-3');assert.equal(calls[0].responseType,'arraybuffer');assert.equal(responses[0].status,206);assert.equal(responses[0].contentRange,'bytes 0-3/900000000');
 dispatch('22222222-2222-4222-8222-222222222222','https://evil.example/bkt-lanz-record/sample.mp4');
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(calls.length,1);assert.equal(responses[1].ok,false);
 dom.window.close();console.log('PASS iPad bridge: 206 binary range, 900 MB metadata, rejects other domains');
})().catch(error=>{console.error(error);process.exitCode=1;});
