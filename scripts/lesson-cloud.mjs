import {cloudCall as call} from './cloud-client.mjs';
import {submitTabletAudio} from './tablet-client.mjs';
import {classroomLessonId} from './lesson-context.mjs';
export function installLessonCloud({root,prepare,getRecord,cloudCall=call,submit=submitTabletAudio,lesson=classroomLessonId}){
 const $=id=>root.getElementById(id),start=$('ce-cloud-current'),check=$('ce-cloud-check'),cancel=$('ce-cloud-cancel'),label=$('ce-cloud-status');
 if(!start)return;
 let current='',busy=false,checking=false,controller=null,job=null,lastCheck=0,lastConfigured='',disposed=false,startedAt=0;
 const say=text=>{label.textContent=text;};
 const elapsed=()=>startedAt?`（本次已用 ${Math.floor((Date.now()-startedAt)/1000)} 秒）`:'';
 function paint(result){job=result;start.textContent=result.state==='uploading'?'继续提交本节字幕':result.state==='complete'?'本节字幕已完成':result.state==='transcribing'?'本节正在转录':result.state==='failed'?'任务需检查':'生成本节云端字幕';start.disabled=busy||!current||['complete','transcribing','failed'].includes(result.state);
  const text=result.state==='complete'?'本节字幕已完成并保存，正在加载到播放器。':result.state==='transcribing'?`云端转录中：${result.finished||0}/${result.total} 段完成。音频已完整提交，可以关闭页面；回来后自动恢复进度。`:result.state==='uploading'?`上传尚未完成：已确认 ${result.submitted||0}/${result.total} 段。点“继续提交”只补交未确认分段；上传完成前请保持页面在前台。`:result.state==='failed'?'云端任务需要检查：'+(result.error||'识别失败'):'本节尚未提交。点击生成后自动准备、上传和转录；字幕按课次保存。';say(text);
  if(result.state==='complete')window.dispatchEvent(new Event('ce-cloud-ready'));
 }
 async function query(){if(disposed||busy||checking||!current)return;const expected=current;checking=true;check.disabled=true;lastCheck=Date.now();try{const settings=await cloudCall('settings');if(expected!==lesson()||busy)return;if(!settings.configured){job=null;start.disabled=false;say('请先到“设置”连接云端服务；连接后点“生成本节云端字幕”。');return;}const result=await cloudCall('lecture',{id:expected});if(expected===lesson()&&!busy)paint(result);}catch(e){if(expected===lesson())say('查询暂未完成：'+e.message+'。可再次查询；不会重新提交识别。');}finally{checking=false;check.disabled=busy||!current;}}
 async function run(){if(busy||disposed)return;const id=lesson();if(!id){say('请先打开一节具体回放。');return;}current=id;busy=true;controller=new AbortController();const signal=controller.signal;startedAt=Date.now();start.disabled=true;check.disabled=true;cancel.disabled=false;say('正在检查本节是否已有字幕…');
  try{const settings=await cloudCall('settings');if(!settings.configured)throw Error('请先到“设置”连接云端服务');const known=await cloudCall('lecture',{id});if(signal.aborted)throw Error('已停止上传');if(['complete','transcribing','failed'].includes(known.state)){paint(known);return;}
   const record=await getRecord(id);if(signal.aborted)throw Error('已停止上传');const report=text=>{if(id===lesson())say(text+elapsed());};
   const blob=await prepare(id,signal,text=>report('准备音频：'+text));if(signal.aborted)throw Error('已停止上传');
   const result=await submit({record,name:record.name,blob,parts:1,status:report,cloudCall,signal,onJob:value=>{if(id===lesson())job=value;}});if(id===lesson())paint(result);
  }catch(e){if(id===lesson())say(signal.aborted?'已停止继续上传。服务器已确认的分段会保留；再次点击可继续提交。已完整提交的任务仍在云端转录。':'本次提交未完成：'+e.message+'。已确认分段会保留，请先查询进度。');}
  finally{busy=false;controller=null;startedAt=0;cancel.disabled=true;check.disabled=!lesson();if(id===lesson()){start.textContent=job?.state==='complete'?'本节字幕已完成':job?.state==='transcribing'?'本节正在转录':job?.state==='uploading'?'继续提交本节字幕':'生成本节云端字幕';start.disabled=['complete','transcribing','failed'].includes(job?.state);}else route();}
 }
 function route(){const id=lesson(),configured=document.documentElement.dataset.ceCloudConfigured||'';if(id!==current){controller?.abort();current=id;job=null;lastCheck=0;start.textContent='生成本节云端字幕';start.disabled=busy||!id;check.disabled=busy||!id;say(id?'正在恢复本节云端字幕状态…':'打开具体课次后，可一键生成整课字幕。');}if(configured!==lastConfigured){lastConfigured=configured;lastCheck=0;}if(id&&!busy&&!checking&&Date.now()-lastCheck>=30000)query();}
 start.onclick=run;check.onclick=query;cancel.onclick=()=>{controller?.abort();cancel.disabled=true;say('正在停止继续上传，等待当前请求确认…');};
 const timer=setInterval(route,1000);const destroy=()=>{disposed=true;controller?.abort();clearInterval(timer);};window.addEventListener('pagehide',destroy,{once:true});route();return {start:run,query,destroy};
}
