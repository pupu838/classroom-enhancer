import assert from 'node:assert/strict';
import {createRangeReader,validateMediaUrl} from '../scripts/media-range.mjs';

const url='https://lzm42.nwafu.edu.cn/bkt-lanz-record/sample.mp4';
assert.equal(validateMediaUrl(url),url);
assert.throws(()=>validateMediaUrl('https://evil.example/bkt-lanz-record/sample.mp4'));
assert.throws(()=>validateMediaUrl(url+'?download=1'));
const calls=[],source=Uint8Array.from([1,2,3,4,5,6,7,8,9,10]);
const request=async(address,start,end)=>{assert.equal(address,url);calls.push([start,end]);const last=Math.min(end,source.length-1);return {status:206,contentRange:`bytes ${start}-${last}/${source.length}`,bytes:source.slice(start,last+1)};};
const reader=await createRangeReader(url,request,null,4);assert.equal(reader.total,10);
const received=[];for(;;){const result=await reader.read();if(result.done)break;received.push(...result.value);}
assert.deepEqual(received,[...source]);assert.deepEqual(calls,[[0,3],[4,7],[8,11]]);
const large=await createRangeReader(url,async(_url,start,end)=>({status:206,contentRange:`bytes ${start}-${end}/900000000`,bytes:new Uint8Array(end-start+1)}),null,1024);
assert.equal(large.total,900000000);assert.equal((await large.read()).value.length,1024);
await assert.rejects(createRangeReader(url,async()=>({status:200,bytes:new Uint8Array(4)}),null,4),/不支持分段读取/);
await assert.rejects(createRangeReader(url,async()=>({status:206,contentRange:'bytes 1-4/10',bytes:new Uint8Array(4)}),null,4),/不连续/);
console.log('PASS range media: school-only URL, exact sequential chunks, >800 MB, unsafe response rejection');
