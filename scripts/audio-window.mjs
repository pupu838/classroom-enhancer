import {createFile} from 'mp4box';

// Index only the AAC sample table; never start full-track extraction.
export async function openAudioWindows(readRanges,signal){
 const file=createFile(true);let info,failure,size,offset=0,metadataEnd=null,readBytes=0;
 const cancelled=()=>{if(signal?.aborted)throw Error('已取消音频分段');};
 file.onError=e=>failure=Error('音轨目录解析失败：'+String(e));file.onReady=value=>info=value;
 for(let attempt=0;!info&&attempt<160;attempt++){
  cancelled();const end=metadataEnd&&offset<metadataEnd?Math.min(metadataEnd-1,offset+1048575):offset+65535;
  const [part]=await readRanges([{start:offset,end}]);cancelled();size=part.total;
  if(!Number.isSafeInteger(size)||size<1||part.start!==offset||part.bytes.length!==Math.min(end+1,size)-offset)throw Error('音轨目录分段位置异常');
  readBytes+=part.bytes.length;if(readBytes>12*1024*1024)throw Error('音轨目录超过处理上限');
  for(let p=0;p+8<=part.bytes.length;){const n=new DataView(part.bytes.buffer,part.bytes.byteOffset+p).getUint32(0),type=String.fromCharCode(...part.bytes.subarray(p+4,p+8));if(type==='moov'&&n>=8){if(n>10*1024*1024)throw Error('音轨目录超过处理上限');metadataEnd=offset+p+n;}if(n<8||p+n>part.bytes.length)break;p+=n;}
  const buffer=part.bytes.slice().buffer;buffer.fileStart=offset;let next=file.appendBuffer(buffer);if(failure)throw failure;
  if(!info&&(!Number.isSafeInteger(next)||next<offset+buffer.byteLength))next=offset+buffer.byteLength;
  if(!info&&(next<0||next>=size))throw Error('无法定位音轨目录');offset=next;
 }
 if(!info||info.isFragmented)throw Error('此录像格式暂不支持分段降噪');
 const track=info.audioTracks?.[0];if(!track?.codec?.startsWith('mp4a'))throw Error('未找到 AAC 音轨');
 const trak=file.getTrackById(track.id),entry=trak.mdia.minf.stbl.stsd.entries[0],samples=file.getTrackSamplesInfo(track.id),scale=track.timescale;
 const edits=trak.edts?.elst?.entries||[];let edit=0;
 if(edits.length){if(edits.length!==1||edits[0].media_time<0||edits[0].media_rate_integer!==1||edits[0].media_rate_fraction!==0)throw Error('此音轨包含复杂时间轴，已保留原声');edit=edits[0].media_time/scale;}
 if(!entry.esds||!samples.length||samples.length>1000000||!Number.isFinite(scale)||scale<=0)throw Error('AAC 音轨目录异常');
 for(const s of samples)if(!Number.isSafeInteger(s.offset)||!Number.isSafeInteger(s.size)||s.size<=0||s.offset+s.size>size||!Number.isFinite(s.dts)||s.cts!==s.dts||!Number.isFinite(s.duration)||s.duration<=0)throw Error('AAC 音轨采样异常');
 file.stream.buffers.length=0;const duration=samples.at(-1).cts/scale+samples.at(-1).duration/scale-edit;
 return {duration,sampleRate:track.audio.sample_rate,metadataBytes:readBytes,async read(start,end,read=readRanges,readSignal=signal){
  if(readSignal?.aborted)throw Error('已取消音频分段');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>10.01||start>=duration)throw Error('音频时间窗无效');
  // Two AAC frames before the requested window warm up the decoder's overlap.
  let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].cts/scale-edit<start)lo=mid+1;else hi=mid;}
  const first=Math.max(0,lo-3);let last=first;while(last<samples.length&&samples[last].cts/scale-edit<end)last++;
  const selected=samples.slice(first,last),ranges=[];let bytes=0;
  for(const s of selected){bytes+=s.size;const prev=ranges.at(-1);if(prev&&prev.end+1===s.offset)prev.end+=s.size;else ranges.push({start:s.offset,end:s.offset+s.size-1});}
  if(!selected.length||bytes>1024*1024)throw Error('音频分段超过处理上限');
  const parts=[];for(let at=0;at<ranges.length;at+=128){if(readSignal?.aborted)throw Error('已取消音频分段');const batch=ranges.slice(at,at+128),reply=await read(batch);if(reply.length!==batch.length)throw Error('音频分段不完整');for(let i=0;i<reply.length;i++)if(reply[i].start!==batch[i].start||reply[i].total!==size||reply[i].bytes.length!==batch[i].end-batch[i].start+1)throw Error('音频分段发生变化');parts.push(...reply);}
  if(readSignal?.aborted)throw Error('已取消音频分段');
  const out=createFile(),id=out.addTrack({type:'mp4a',hdlr:'soun',timescale:scale,channel_count:track.audio.channel_count,samplerate:track.audio.sample_rate,samplesize:entry.samplesize||16,description_boxes:[entry.esds]});
  let p=0;for(const s of selected){while(parts[p].start+parts[p].bytes.length<=s.offset)p++;const part=parts[p],at=s.offset-part.start;out.addSample(id,part.bytes.subarray(at,at+s.size),{dts:s.dts-selected[0].dts,cts:s.cts-selected[0].dts,duration:s.duration,is_sync:true});}
  return {blob:new Blob([out.getBuffer().buffer],{type:'audio/mp4'}),start:selected[0].cts/scale-edit,duration:selected.reduce((n,s)=>n+s.duration,0)/scale,sourceDuration:duration};
 }};
}
