import {validateMediaUrl} from './media-range.mjs';
function startTime(value){
 if(value===null||value===undefined||value==='')return null;
 const text=String(value),clock=/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text);
 if(clock)return {kind:'clock',value:Number(clock[1])*3600+Number(clock[2])*60+Number(clock[3])};
 if(/^\d+(?:\.\d+)?$/.test(text)){const n=Number(text);return {kind:n>1e9?'date':'clock',value:n>1e12?n/1000:n};}
 const n=Date.parse(text.replace(' ','T'));return Number.isFinite(n)?{kind:'date',value:n/1000}:null;
}
export function schoolVideoSources(detail){
 const views=[];
 for(const [field,id,label] of [['teacherViewFiles','teacher','老师'],['studentViewFiles','room','教室'],['vgaViewFiles','slides','课件']]){
  const files=new Map();for(const file of detail[field]||[]){const url=validateMediaUrl(String(file.outerIp||'')+String(file.videoStorePath||''));files.set(url,file);}
  if(files.size>1)throw Error('此课次含多个独立录制分段，暂保留学校播放器，避免错误对齐');
  if(files.size){const [url,file]=[...files][0];views.push({id,label,url,audible:Number(file.voiceStaus)===0,priority:Number(file.voicePriority??999),start:startTime(file.startTime),offset:0});}
 }
 if(!views.length)throw Error('学校未返回可播放的视频画面');
 const timed=views.every(view=>view.start&&view.start.kind===views[0].start?.kind);
 if(timed){const begin=Math.min(...views.map(view=>view.start.value)),span=Math.max(...views.map(view=>view.start.value))-begin;if(span>600)throw Error('三路录制时间差异常，已保留学校播放器');for(const view of views)view.offset=view.start.value-begin;}
 const audible=views.filter(view=>view.audible).sort((a,b)=>a.priority-b.priority);
 if(!audible.length)throw Error('学校未标注可用声音轨道，已保留学校播放器');
 return {views:views.map(({start,priority,audible,...view})=>view),clockId:audible[0].id,timing:timed?'recording-start':'container-start'};
}
