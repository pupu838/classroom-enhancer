import {createFile} from 'mp4box';

export async function remuxSparseAudio(readRanges,progress=()=>{},signal){
 const file=createFile(true),segments=[];let info,failure,audioId,emitted=0,total=0,readBytes=0,peak=0;
 file.onError=e=>failure=Error('音频容器解析失败：'+String(e));
 file.onSegment=(id,user,buffer,last)=>{segments.push(buffer);emitted=last;file.releaseUsedSamples(id,last);};
 file.onReady=value=>{
  info=value;if(info.isFragmented){failure=Error('当前稀疏音轨入口暂不支持分片录像');return;}
  const track=info.audioTracks?.[0];if(!track?.codec?.startsWith('mp4a')){failure=Error('学校录像没有可用AAC音轨');return;}
  audioId=track.id;total=track.nb_samples;file.setSegmentOptions(audioId,null,{nbSamples:100,rapAlignement:false});segments.push(file.initializeSegmentation().buffer);file.start();
 };
 function append(part){const buffer=part.bytes.buffer.slice(part.bytes.byteOffset,part.bytes.byteOffset+part.bytes.length);buffer.fileStart=part.start;readBytes+=buffer.byteLength;const next=file.appendBuffer(buffer);if(failure)throw failure;return next;}
 let offset=0,sourceSize=null,metadataEnd=null;
 for(let attempt=0;!info&&attempt<160;attempt++){
  if(signal?.aborted)throw Error('已取消准备');
  const end=metadataEnd&&offset<metadataEnd?Math.min(metadataEnd-1,offset+1024*1024-1):offset+65535;
  const [part]=await readRanges([{start:offset,end}]);sourceSize=part.total;
  for(let p=0;p+8<=part.bytes.length;){const v=new DataView(part.bytes.buffer,part.bytes.byteOffset+p),size=v.getUint32(0),type=String.fromCharCode(...part.bytes.subarray(p+4,p+8));if(type==='moov'&&size>=8){if(size>10*1024*1024)throw Error('学校音轨目录超过安全上限');metadataEnd=offset+p+size;}if(size<8||p+size>part.bytes.length)break;p+=size;}
  let next=append(part);if(!info&&(!Number.isSafeInteger(next)||next<offset+part.bytes.length))next=offset+part.bytes.length;if(!info&&(next<0||next>=sourceSize))throw Error('无法定位学校录像的音轨目录');offset=next;
  progress({phase:'metadata',percent:0,bytes:readBytes});
 }
 if(!info||failure||!audioId)throw failure||Error('学校录像音轨目录过大');
 const samples=file.getTrackSamplesInfo(audioId),groups=[];
 for(const s of samples){if(!Number.isSafeInteger(s.offset)||!Number.isSafeInteger(s.size)||s.size<0||s.offset+s.size>sourceSize)throw Error('音轨采样位置无效');if(!s.size)continue;const previous=groups.at(-1);if(previous&&s.offset===previous.end+1&&s.offset+s.size-previous.start<=512*1024)previous.end+=s.size;else groups.push({start:s.offset,end:s.offset+s.size-1});}
 let finished=0;const batches=[];
 while(finished<groups.length){
  const batch=[];let bytes=0;
  while(finished<groups.length&&batch.length<32){const r=groups[finished],size=r.end-r.start+1;if(batch.length&&(r.end-batch[0].start>=64*1024*1024||bytes+size>1024*1024))break;batch.push(r);bytes+=size;finished++;}
  batches.push(batch);
 }
 // At most two bounded replies in flight; consume in media order.
 const pending=new Map();let requested=0,completed=0;
 const schedule=()=>{while(requested<batches.length&&pending.size<2){const index=requested++;pending.set(index,readRanges(batches[index]).then(parts=>({parts}),error=>({error})));}};
 schedule();
 for(let index=0;index<batches.length;index++){
  if(signal?.aborted)throw Error('已取消准备');
  const {parts,error}=await pending.get(index);pending.delete(index);if(error)throw error;schedule();const batch=batches[index];completed+=batch.length;
  if(parts.length!==batch.length)throw Error('音轨分段数量不符');
  for(let i=0;i<parts.length;i++){if(parts[i].start!==batch[i].start||parts[i].bytes.length!==batch[i].end-batch[i].start+1||parts[i].total!==sourceSize)throw Error('音轨分段校验失败');append(parts[i]);}
  const cutoff=samples[emitted]?.offset??sourceSize;
  for(const b of file.stream.buffers)if(b.fileStart+b.byteLength<=cutoff)b.usedBytes=b.byteLength;
  file.stream.cleanBuffers();peak=Math.max(peak,file.stream.buffers.reduce((n,b)=>n+b.byteLength,0));
  progress({phase:'audio',percent:Math.min(99,Math.round(completed/groups.length*100)),bytes:readBytes,peak,samples:emitted,total});
 }
 file.flush();file.stop();if(failure)throw failure;if(!emitted||emitted<total)throw Error('音轨未完整提取，已停止使用');
 return new Blob(segments,{type:'audio/mp4'});
}
