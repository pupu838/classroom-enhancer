const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto');
const hash=source=>createHash('sha256').update(source).digest('hex');
const release=JSON.parse(fs.readFileSync('portal/tablet-release.json','utf8'));
assert.equal(hash(fs.readFileSync('portal'+release.path)),release.sha256,'published candidate must match its manifest byte-for-byte');
async function run({cached=null,remote='new runtime',badHash=false,networkError=false,pathOverride,delay=0}={}){
 const document={documentElement:{dataset:{}},visibilityState:'visible'},saved=[],calls=[];
 const fallback={version:'0.7.0',source:'bundled fallback',sha256:hash('bundled fallback')};
 const digest=badHash?'a'.repeat(64):hash(remote),manifest={schema:'ce-runtime/1',minimumBridge:1,version:'0.7.1',sha256:digest,path:pathOverride||'/tablet/runtime/'+digest+'.js'};
 const GM={getValue:async()=>cached,setValue:async(key,value)=>saved.push(value),xmlHttpRequest:async options=>{calls.push(options.url);if(networkError)throw Error('offline');if(delay)await new Promise(r=>setTimeout(r,delay));return {status:200,responseText:options.url.includes('tablet-release.json')?JSON.stringify(manifest):remote};}};
 const context={document,window:{addEventListener(){}},crypto:webcrypto,TextEncoder,Uint8Array,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,20)),setInterval:()=>1,clearInterval(){},GM,fallback};vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/tablet-loader.js','utf8'),context);const source=await context.loadClassroomRuntime(GM,'https://fixed.example',fallback);return {source,saved,calls,document};
}
(async()=>{
 let result=await run();assert.equal(result.source,'new runtime');assert.equal(result.saved.length,1);assert(result.calls.every(url=>url.startsWith('https://fixed.example/')));
 result=await run({badHash:true});assert.equal(result.source,'bundled fallback');assert.equal(result.saved.length,0);
 result=await run({pathOverride:'https://evil.example/code.js'});assert.equal(result.source,'bundled fallback');assert.equal(result.calls.length,1);
 const cached={version:'0.7.1',source:'last good runtime',sha256:hash('last good runtime')};result=await run({cached,networkError:true});assert.equal(result.source,cached.source);
 result=await run({delay:30});assert.equal(result.source,'bundled fallback');await new Promise(r=>setTimeout(r,90));assert.equal(result.saved.length,1);assert.match(result.document.documentElement.dataset.ceUpdateStatus,/下次/);
 console.log('PASS automatic runtime: verified update, corrupt/foreign rejection, offline fallback, delayed update deferred until next page');
})().catch(error=>{console.error(error);process.exitCode=1;});
