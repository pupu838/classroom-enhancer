import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createFile} from 'mp4box';
import {remuxSparseAudio} from '../scripts/sparse-audio.mjs';
import {createAudioRangeSource} from '../scripts/audio-range-source.mjs';
import {remuxAudio} from '../scripts/audio-remux.mjs';
const source=new Uint8Array(readFileSync(new URL('../../test-video.mp4',import.meta.url)));
async function aac(blob){const file=createFile(true),chunks=[];file.onReady=info=>{file.setExtractionOptions(info.audioTracks[0].id,null,{nbSamples:100});file.start();};file.onSamples=(id,user,samples)=>{for(const sample of samples)chunks.push(Buffer.from(sample.data));};const bytes=await blob.arrayBuffer();bytes.fileStart=0;file.appendBuffer(bytes);file.flush();return createHash('sha256').update(Buffer.concat(chunks)).digest('hex');}
let at=0;const original=await remuxAudio(async()=>{if(at>=source.length)return {done:true};const value=source.slice(at,at+1024*1024);at+=value.length;return {value,done:false};});
let read=0,requests=0;
const sparse=await remuxSparseAudio(async ranges=>{requests++;return ranges.map(r=>{const bytes=source.slice(r.start,r.end+1);read+=bytes.length;return {start:r.start,total:source.length,bytes};});});
assert.equal(await aac(sparse),await aac(original));assert(read<source.length*.05);assert(requests<40);
// Put an enlarged moov at the end, as in the real school's recordings.
const boxes=[];for(let p=0;p<source.length;){const n=new DataView(source.buffer).getUint32(p),type=String.fromCharCode(...source.subarray(p+4,p+8));boxes.push({p,n,type});p+=n;}
const moov=boxes.find(b=>b.type==='moov'),patched=source.slice(moov.p,moov.p+moov.n);const pv=new DataView(patched.buffer);
function adjust(begin,end){for(let p=begin;p+8<=end;){const n=pv.getUint32(p),type=String.fromCharCode(...patched.subarray(p+4,p+8));if(n<8)throw Error('bad test box');if(type==='stco'){const count=pv.getUint32(p+12);for(let i=0;i<count;i++)pv.setUint32(p+16+i*4,pv.getUint32(p+16+i*4)-moov.n);}else if(['moov','trak','mdia','minf','stbl'].includes(type))adjust(p+8,p+n);p+=n;}}
adjust(0,patched.length);const padding=new Uint8Array(200000);new DataView(padding.buffer).setUint32(0,padding.length);padding.set(new TextEncoder().encode('free'),4);pv.setUint32(0,patched.length+padding.length);
const moved=new Uint8Array(await new Blob([...boxes.filter(b=>b!==moov).map(b=>source.slice(b.p,b.p+b.n)),patched,padding]).arrayBuffer());
let movedCalls=0;const movedAudio=await remuxSparseAudio(async ranges=>{movedCalls++;return ranges.map(r=>({start:r.start,total:moved.length,bytes:moved.slice(r.start,r.end+1)}));});assert.equal(await aac(movedAudio),await aac(original));assert(movedCalls<45);
const url='https://lzm15.nwafu.edu.cn/bkt-lanz-record/test.mp4';let cloud=0,native=0;
const reader=createAudioRangeSource(url,async()=>{native++;throw Error('simulated Safari CORS/403');},async(op,{job})=>{cloud++;assert.equal(op,'init');assert.equal(job.mode,'media-read');return {protocol:'media-read/1',total:12,parts:job.ranges.map(r=>({start:r.start,end:Math.min(r.end,11),data:Buffer.alloc(Math.min(r.end,11)-r.start+1,7).toString('base64')}))};});
await reader([{start:0,end:3}]);await reader([{start:4,end:7}]);assert.equal(native,1);assert.equal(cloud,2);
console.log('PASS exact AAC payload preserved, sparse bytes <5%, bounded calls, large moov at file tail, automatic Safari failure->authenticated relay without a new bridge');
