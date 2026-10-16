import {createFile} from 'mp4box';
export async function remuxAudio(read, progress=()=>{}, signal){
 const file=createFile(true),segments=[];let ready=false,failure=null,audioId=null,samples=0,total=0,offset=0;
 file.onError=e=>{failure=Error('无法解析课程媒体：'+String(e));};
 file.onSegment=(id,user,buffer,last)=>{segments.push(buffer);samples=last;file.releaseUsedSamples(id,last);};
 file.onReady=info=>{
  const track=info.audioTracks?.[0];if(!track){failure=Error('该画面没有音轨，请选择另一画面');return;}
  if(!track.codec?.startsWith('mp4a')){failure=Error('当前仅支持课程中的 AAC 音轨');return;}
  audioId=track.id;total=track.nb_samples;file.setSegmentOptions(audioId,null,{nbSamples:1000,rapAlignement:false});
  segments.push(file.initializeSegmentation().buffer);ready=true;file.start();
 };
 while(true){
  if(signal?.aborted)throw Error('已取消提取');
  const next=await read();if(next.done)break;
  const chunk=next.value;const buffer=chunk.buffer.slice(chunk.byteOffset,chunk.byteOffset+chunk.byteLength);buffer.fileStart=offset;offset+=buffer.byteLength;
  file.appendBuffer(buffer);if(failure)throw failure;progress({bytes:offset,samples,total});
 }
 file.flush();if(failure)throw failure;if(!ready||!samples||samples<total)throw Error('音轨不完整，未生成下载文件');
 file.stop();return new Blob(segments,{type:'audio/mp4'});
}
