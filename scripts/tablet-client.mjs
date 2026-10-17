import {splitAudio} from './tablet-audio.mjs';
const digest=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function tabletOffer({record,name,blob,parts,line,status,cloudCall}){
 if(parts!==1)throw Error('此课次包含多个独立录制分段，暂不自动生成字幕；请先选单段课次测试');
 status('正在准备字幕音频分段，请保持学校页面在前台…');
 const chunks=await splitAudio(blob),duration=chunks.at(-1).end;
 const metadata=[];for(const c of chunks)metadata.push({start:c.start,end:c.end,clock:c.clock,size:c.blob.size,sha256:await digest(c.blob)});
 let job=await cloudCall('init',{job:{lectureId:record.id,courseId:record.course,name,duration,sha256:await digest(blob),parts:metadata}});
 if(job.state==='complete'){status('本节字幕已完成，无需重复识别；打开回放即可自动加载。');return line;}
 for(let i=0;i<chunks.length;i++){
  status(`自动提交音频 ${i+1}/${chunks.length}，提交完成前请保持页面在前台。`);
  const bytes=new Uint8Array(await chunks[i].blob.arrayBuffer());let binary='';for(let p=0;p<bytes.length;p+=8192)binary+=String.fromCharCode(...bytes.subarray(p,p+8192));
  job=await cloudCall('part',{id:job.id,index:i,data:btoa(binary)});
 }
 status('整节课音频已确认提交。可以关闭页面，云端继续识别；回放时自动加载字幕。');
 const poll=document.createElement('button');poll.textContent='查询字幕进度';line.append(poll);
 async function check(){poll.disabled=true;try{job=await cloudCall('status',{id:job.id});status(job.state==='complete'?`字幕已完成；打开本节回放即可自动加载。`:`字幕进度：${job.finished}/${job.total} 段完成`+(job.error?' · '+job.error:''));}catch(e){status(e.message);}finally{poll.disabled=false;}}
 let checking=false;const originalCheck=check;check=async()=>{if(checking)return;checking=true;try{await originalCheck();}finally{checking=false;if(job.state==='complete'||job.state==='failed')clearInterval(timer);}};poll.onclick=check;const timer=setInterval(check,20000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});await check();return line;
}
