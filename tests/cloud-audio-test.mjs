import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCloudAudio,MOSS_MODEL} from '../scripts/cloud-audio.mjs';
const flush=()=>new Promise(r=>setTimeout(r,10)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function until(check){for(let i=0;i<100&&!check();i++)await flush();assert(check(),'async operation did not complete');}
class Param{constructor(){this.value=1;}setTargetAtTime(value){this.value=value;}}
class Node{constructor(){for(const k of ['gain','frequency','Q','threshold','knee','ratio','attack','release'])this[k]=new Param();}connect(){}disconnect(){}}
const media=[];globalThis.Audio=class extends EventTarget{constructor(){super();this.readyState=4;this.seeking=false;this.currentTime=0;this.paused=true;media.push(this);}load(){}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}};
const ctx={currentTime:0,createGain:()=>new Node(),createMediaElementSource:()=>new Node(),createBiquadFilter:()=>new Node(),createDynamicsCompressor:()=>new Node()};
const clock=new EventTarget();Object.assign(clock,{currentTime:1,playbackRate:2,paused:false,seeking:false,duration:600});
const requests=[],deferred=[];let audible=false,reads=0;
const api=createCloudAudio({clock,ctx,output:new Node(),views:[{id:'teacher',offset:2,url:'teacher'},{id:'room',offset:8,url:'room'},{id:'slides',offset:0,url:'slides'}],clockId:'teacher',schedule:false,onAudible:v=>audible=v,
 readWindow:async(url,start,end,signal)=>{reads++;return {blob:new Blob([new Uint8Array(100)]),start,sourceDuration:600};},
 call:async(op,{job})=>{assert.equal(op,'init');if(job.mode==='moss-health')return {ready:true,model:MOSS_MODEL};requests.push(job);return new Promise((resolve,reject)=>deferred.push({resolve,reject,job}));}});
function respond(at){const {resolve,job}=deferred[at],data=Buffer.alloc(44+Math.round(job.duration*16000)*2);resolve({protocol:'ce-moss-segment/1',model:MOSS_MODEL,inputSha256:job.sha256,trimSeconds:job.trimSeconds,sampleRate:16000,samples:Math.round(job.duration*16000),pcmScale:4,data:data.toString('base64'),sha256:sha(data)});}
try{
 await api.unlock();await api.enable();await flush();assert.equal(requests.length,1);assert.equal(audible,false,'raw audio must remain during cloud preparation');
 for(let i=0;i<20;i++)api.tick();assert.equal(requests.length,1,'only one paid request in flight');
 clock.currentTime=100;clock.dispatchEvent(new Event('seeking'));respond(0);await flush();assert.equal(api.state().cached,0,'late response after seek is discarded');assert.equal(audible,false);
 api.tick();await until(()=>requests.length===2);respond(1);await until(()=>api.state().cached===1);api.tick();await until(()=>audible);assert.equal(clock.currentTime,100);assert(media.some(a=>a.preservesPitch&&a.playbackRate===2));
 api.compare(true);assert.equal(audible,false);api.compare(false);assert.equal(audible,true);
 api.select('room');assert.equal(audible,false,'switch immediately restores newly selected raw track');assert.equal(clock.currentTime,100);assert.equal(api.state().trackId,'room');
 // A prefetch from the previous track cannot become audible on the new track.
 await flush();const pending=deferred.at(-1);if(pending!==deferred[1]){pending.reject(Error('stale'));await flush();assert(api.state().enabled);}
 api.tick();await flush();deferred.at(-1).reject(Error('network unavailable'));await flush();assert.equal(api.state().phase,'error');assert.equal(api.state().enabled,false);assert.equal(audible,false);
 assert(reads>0);console.log('PASS original during preparation, serialized requests, stale seek/track results rejected, pitch-preserving native playback, compare, failure returns raw');
}finally{api.destroy();}
