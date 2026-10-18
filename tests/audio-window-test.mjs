import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {openAudioWindows} from '../scripts/audio-window.mjs';
const input=process.argv[2]||'../test-video.mp4',bytes=new Uint8Array(readFileSync(input));let readBytes=0;
const read=async ranges=>ranges.map(r=>{const part=bytes.slice(r.start,r.end+1);readBytes+=part.length;return {start:r.start,total:bytes.length,bytes:part};});
const index=await openAudioWindows(read);assert(index.duration>10);
mkdirSync('tests/artifacts',{recursive:true});
const rate=index.sampleRate;
const original=spawnSync('ffmpeg',['-v','error','-i',input,'-vn','-ac','1','-ar',String(rate),'-f','f32le','pipe:1'],{maxBuffer:100*1024*1024});assert.equal(original.status,0,original.stderr?.toString());
const pcm=new Float32Array(original.stdout.buffer.slice(original.stdout.byteOffset,original.stdout.byteOffset+original.stdout.length));
for(const [start,end] of [[0,4],[3.125,8.125],[7,12]]){
 const before=readBytes,w=await index.read(start,end);assert(w.blob.size<1024*1024);assert(readBytes-before<1024*1024);
 const data=Buffer.from(await w.blob.arrayBuffer()),decoded=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-vn','-ac','1','-ar',String(rate),'-f','f32le','pipe:1'],{input:data,maxBuffer:10*1024*1024});assert.equal(decoded.status,0,decoded.stderr?.toString());
 const y=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.length));
 // Compare AFTER decoder warm-up with the original full source, in source time.
 const trim=Math.max(start-w.start,.15),at=Math.round(trim*rate),sourceAt=at+Math.round(w.start*rate),n=Math.min(y.length-at,pcm.length-sourceAt,Math.round((end-start-.2)*rate));assert(n>1000);
 let error=0,power=0;for(let j=0;j<n;j++){error+=(y[at+j]-pcm[sourceAt+j])**2;power+=pcm[sourceAt+j]**2;}const relativeRMS=Math.sqrt(error/Math.max(power,1e-20));assert(relativeRMS<.02,`window ${start}: relative waveform error ${relativeRMS}, source offset ${w.start}`);
 writeFileSync(`tests/artifacts/window-${start}.m4a`,data);
 console.log(JSON.stringify({start,end,fragmentStart:w.start,fragmentSeconds:w.duration,bytes:data.length,relativeRMS}));
}
const controller=new AbortController();controller.abort();await assert.rejects(()=>index.read(1,3,read,controller.signal),/取消/);await assert.rejects(()=>index.read(0,30),/时间窗/);
console.log('PASS bounded AAC windows, edit-list timing, decoder preroll, waveform alignment, cancellation and duration limits');
