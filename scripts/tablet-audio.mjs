import {createFile} from 'mp4box';
// Preserve both the AAC decoded clock and the source recording's container clock.
function boxes(bytes, start=0, end=bytes.byteLength) {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=[];
 for(let p=start;p<end;){if(p+8>end)throw Error('音频容器不完整');const n=v.getUint32(p),type=String.fromCharCode(...bytes.subarray(p+4,p+8));if(n<8||p+n>end)throw Error('不支持的音频容器');out.push({p,n,type});p+=n;}return out;
}
function descendants(bytes, wanted){let out=[];for(const b of boxes(bytes)){if(b.type===wanted)out.push(b);if(['moov','trak','mdia','moof','traf'].includes(b.type)){for(const c of descendants(bytes.subarray(b.p+8,b.p+b.n),wanted))out.push({...c,p:c.p+b.p+8});}}return out;}
function timing(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tfdt=descendants(bytes,'tfdt');if(tfdt.length!==1)throw Error('音轨时间轴不明确');const p=tfdt[0].p;const start=bytes[p+8]===1?Number(v.getBigUint64(p+12)):v.getUint32(p+12);let duration=0;const durations=[];
 for(const b of descendants(bytes,'trun')){const flags=v.getUint32(b.p+8)&0xffffff,count=v.getUint32(b.p+12);let q=b.p+16;if(flags&1)q+=4;if(flags&4)q+=4;if(!(flags&0x100))throw Error('音轨缺少逐帧时长');for(let i=0;i<count;i++){const d=v.getUint32(q);durations.push(d);duration+=d;q+=4;if(flags&0x200)q+=4;if(flags&0x400)q+=4;if(flags&0x800)q+=4;}if(q>b.p+b.n)throw Error('音轨帧表不完整');}
 return {start,duration,durations,tfdt:p};
}
export async function splitAudio(blob,maxBytes=3*1024*1024){
 let offset=0,init=[],fragments=[],pending=null,timescale=0;
 while(offset<blob.size){const head=new Uint8Array(await blob.slice(offset,offset+8).arrayBuffer());if(head.length<8)throw Error('音轨尾部不完整');const n=new DataView(head.buffer).getUint32(0),type=String.fromCharCode(...head.subarray(4));if(n<8||offset+n>blob.size)throw Error('音轨分段无效');
  if(type==='ftyp'||type==='moov'){const b=new Uint8Array(await blob.slice(offset,offset+n).arrayBuffer());init.push(b);if(type==='moov'){const md=descendants(b,'mdhd');if(md.length!==1)throw Error('当前仅支持单音轨');const p=md[0].p,v=new DataView(b.buffer);timescale=v.getUint32(p+(b[p+8]===1?28:20));}}
  else if(type==='moof'){if(pending)throw Error('音轨缺少媒体数据');const bytes=new Uint8Array(await blob.slice(offset,offset+n).arrayBuffer());pending={bytes,...timing(bytes)};}
  else if(type==='mdat'){if(!pending)throw Error('音轨缺少分段头');fragments.push({...pending,data:blob.slice(offset,offset+n)});pending=null;}
  else throw Error('不支持的音轨分段');offset+=n;
 }
 if(pending||!timescale||!fragments.length)throw Error('音轨不完整');const parser=createFile();let track;parser.onReady=info=>track=info.audioTracks?.[0];const initial=await new Blob(init).arrayBuffer();initial.fileStart=0;parser.appendBuffer(initial);if(track?.codec!=='mp4a.40.2'||!track.audio?.sample_rate)throw Error('暂仅支持 AAC-LC 课程音轨');const sampleRate=track.audio.sample_rate;let groups=[],group=[],size=init.reduce((n,b)=>n+b.length,0),initSize=size;
 for(const f of fragments){if(initSize+f.bytes.length+f.data.size>maxBytes)throw Error('单个音频分段过大');if(group.length&&size+f.bytes.length+f.data.size>maxBytes){groups.push(group);group=[];size=initSize;}group.push(f);size+=f.bytes.length+f.data.size;}if(group.length)groups.push(group);
 let expected=fragments[0].start;if(expected!==0)throw Error('音轨不是从零开始');
 const result=groups.map(g=>{const base=g[0].start,parts=[...init],clock=[[0,0]];let count=0,ticks=0,lastDuration=null;for(const f of g){if(f.start!==expected)throw Error('音轨时间轴存在缺口');expected=f.start+f.duration;const bytes=f.bytes.slice(),v=new DataView(bytes.buffer);if(bytes[f.tfdt+8]===1)v.setBigUint64(f.tfdt+12,BigInt(f.start-base));else v.setUint32(f.tfdt+12,f.start-base);parts.push(bytes,f.data);for(const d of f.durations){if(lastDuration!==null&&d!==lastDuration)clock.push([count*1024/sampleRate,ticks/timescale]);count++;ticks+=d;lastDuration=d;}}clock.push([count*1024/sampleRate,ticks/timescale]);if(clock.length>20000)throw Error('音轨时间轴过于复杂');return {start:base/timescale,end:expected/timescale,clock,blob:new Blob(parts,{type:'audio/mp4'})};});return result;
}
