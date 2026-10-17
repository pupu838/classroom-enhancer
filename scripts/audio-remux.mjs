import {createFile} from 'mp4box';
export async function remuxAudio(read, progress=()=>{}, signal){
 const file=createFile(true),segments=[];let ready=false,failure=null,audioId=null,samples=0,total=0,offset=0;
 file.onError=e=>{failure=Error('无法解析课程媒体：'+String(e));};
 file.onSegment=(id,user,buffer,last)=>{segments.push(buffer);samples=last;file.releaseUsedSamples(id,last);};
 file.onReady=info=>{
  const track=info.audioTracks?.[0];if(!track){failure=Error('该画面没有音轨，请选择另一画面');return;}
  if(!track.codec?.startsWith('mp4a')){failure=Error('当前仅支持课程中的 AAC 音轨');return;}
  audioId=track.id;total=track.nb_samples;file.setSegmentOptions(audioId,null,{nbSamples:100,rapAlignement:false});
  segments.push(file.initializeSegmentation().buffer);ready=true;file.start();
 };
 while(true){
  if(signal?.aborted)throw Error('已取消提取');
  const next=await read();if(next.done)break;
  const chunk=next.value;const buffer=chunk.buffer.slice(chunk.byteOffset,chunk.byteOffset+chunk.byteLength);buffer.fileStart=offset;offset+=buffer.byteLength;
  file.appendBuffer(buffer);if(failure)throw failure;
  // mp4box keeps source mdat buffers even after emitting audio. Once all audio
  // samples preceding the next audio offset have been emitted, those buffers
  // contain only discarded video and can be freed. This bounds iPad memory.
  if(ready){const nextSample=file.getTrackSamplesInfo(audioId)?.[samples];const safeOffset=nextSample?.offset??(samples>=total?offset:0);
   for(const stored of file.stream.buffers)if(stored.fileStart+stored.byteLength<=safeOffset)stored.usedBytes=stored.byteLength;
   file.stream.cleanBuffers();}
  progress({bytes:offset,samples,total});
 }
 file.flush();if(failure)throw failure;if(!ready||!samples||samples<total)throw Error('音轨不完整，未生成下载文件');
 file.stop();return new Blob(segments,{type:'audio/mp4'});
}
