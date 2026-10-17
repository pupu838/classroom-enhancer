import {installCloud,cloudCall} from './cloud-client.mjs';
import {remuxAudio} from './audio-remux.mjs';
import {createRangeReader} from './media-range.mjs';
import {readAudio,saveAudio} from './audio-cache.mjs';
const SCHOOL='https://ylb.nwafu.edu.cn';
const PORTAL='https://classroom-enhancer-global-5rcwipvd.edgeone.dev';
const PORTALS=new Set([PORTAL,'https://classroom-enhancer-workbench-1um3o2ms.edgeone.cool']);
if(location.origin===SCHOOL && !window.__CE_SCHOOL_CONNECTOR_V1__){
 window.__CE_SCHOOL_CONNECTOR_V1__=true;
 const VERSION='0.7.0';
 const TABLET=document.documentElement.dataset.ceTabletBridge==='1';
 let adapter=null,term=null,courses=new Map(),replays=new Map(),pair=null,busy=false,controller=null,stage='';
 const host=document.createElement('div');host.id='ce-course-connector';const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>:host{position:fixed;right:12px;bottom:12px;z-index:2147483645;font:14px system-ui;color:#18382d}*{box-sizing:border-box}button,select{font:inherit;border:1px solid #bdcdb8;border-radius:8px;padding:9px;background:#fff;color:#244b39;cursor:pointer}#toggle{background:#244b39;color:white;box-shadow:0 4px 20px #0003}section{margin-top:8px;width:380px;max-width:calc(100vw - 24px);max-height:75vh;overflow:auto;background:#f8faf4;border:1px solid #bdcdb8;border-radius:14px;padding:18px;box-shadow:0 8px 32px #0003}h2{font-size:18px;margin:0 0 12px}p{line-height:1.7;font-size:12px}select{width:100%;margin:8px 0}label{display:flex;gap:8px;padding:9px 0;border-bottom:1px solid #dce5d7;line-height:1.6}a{color:#315d43}audio{width:100%;height:36px}#results>div{border-top:1px solid #d2dfcb;padding:12px 0}.row{display:flex;gap:8px;flex-wrap:wrap}.muted{color:#6b7d6c}progress{width:100%}[hidden]{display:none!important}</style><button id="toggle">${TABLET?"课堂字幕助手":"课堂音频连接器"}</button><section hidden><h2>选课 · ${TABLET?"自动生成字幕":"自动提取音频"} <small>v${VERSION}</small></h2><p id="status" role="status">等待学校登录与页面加载…</p><p class="muted">使用学校当前登录。音轨在浏览器提取；连接字幕服务后会自动提交音频识别。不读取或转交学校密码。iPad 提取时请保持此页面在前台。</p><div class="row"><button id="refresh">刷新课程</button><button id="stop" disabled>取消提取</button></div><select id="courses" aria-label="选择课程"><option>等待课程列表</option></select><div id="episodes"></div><div class="row"><button id="more" hidden>更多课次</button><button id="extract" disabled>${TABLET?"提取并生成字幕":"提取已选课次音频"}</button></div><progress id="progress" max="100" value="0"></progress><div id="results"></div></section>`;
 document.documentElement.append(host);const $=id=>root.getElementById(id),panel=root.querySelector('section');
 if(TABLET){const target=document.getElementById('nwa-classroom-host')?.shadowRoot?.getElementById('ce-courses');if(target){target.append(host);host.style.cssText='position:static;display:block;font:inherit;color:inherit';$('toggle').hidden=true;panel.hidden=false;panel.style.cssText='width:100%;max-width:none;max-height:none;overflow:visible;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:inherit';const style=document.createElement('style');style.textContent='button,select{color:#fff;background:#263044;border-color:#57657b}p.muted{color:#bcc9dc}label{border-color:#415068}h2{font-size:16px}section>h2{display:none}';root.append(style);}}
 const cloud=installCloud(root);
 const status=t=>{$('status').textContent=t;};
 $('toggle').onclick=()=>{panel.hidden=!panel.hidden;};
 function send(data){if(pair&&pair.source&&!pair.source.closed)pair.source.postMessage({ce:'school-connector-v1',channel:pair.channel,...data},pair.origin);}
 function getAdapter(){
  const app=document.querySelector('#app')?.__vue__;if(!app)return null;
  if(typeof app.$staticConfig!=='function'||!app.$Utils?.commonAjax)return null;
  // School's own wrapper adds authentication internally. No password, Cookie, or token is exported.
  let user;try{user=JSON.parse(app.$getLocalStorage('userInfo')||'{}');}catch{return null;}
  if(!user.userId)return null;
  return {vm:app,userId:user.userId,cfg:app.$staticConfig(),request:o=>app.$Utils.commonAjax(o)};
 }
 const code=s=>adapter.vm.$md5(s);
 async function loadCourses(){
  if(busy)throw Error('请等待当前音频提取完成');adapter=getAdapter();if(!adapter)throw Error('尚未读取到学校登录，请先完成登录并等待页面加载');
  status('正在读取当前学期与可访问课程…');
  const terms=await adapter.request({url:adapter.cfg.courseApi+'/v1/term/recent',type:'get',data:{futureTermNum:0,previousTermNum:7,validCode:adapter.cfg.validCode}});
  if(!Array.isArray(terms)||!terms.length)throw Error('学校没有返回学期');
  const now=Date.now();term=terms.find(t=>now>=new Date(t.startDate+' 00:00:00').getTime()&&now<=new Date(t.endDate+' 23:59:59').getTime());
  if(!term)throw Error('未找到当前学期，未自动选择其他学期');
  const catalog=await adapter.request({url:adapter.cfg.courseApi+'/v1/courseTables/studentCourseList',type:'get',data:{schoolYear:term.schoolYear,term:term.term,userId:adapter.userId,validCode:code('&signKey=123123')}});
  const recordings=await adapter.request({url:adapter.cfg.teachingApi+'/v1/videoinfo/student/courses',type:'get',data:{studentId:adapter.userId,schoolYear:term.schoolYear,term:term.term,validCode:adapter.cfg.validCode}});
  if(!Array.isArray(catalog)||!Array.isArray(recordings))throw Error('课程接口格式发生变化');
  courses=new Map(catalog.filter(c=>c.courseId).map(c=>[String(c.courseId),{id:String(c.courseId),name:String(c.courseName||'未命名课程'),teachers:String(c.teacherName||''),classes:(c.teachingClasses||[]).map(t=>t.classId).filter(Boolean),recording:false}]));
  for(const c of recordings){const id=String(c.courseId);const current=courses.get(id)||{id,name:String(c.courseName||'未命名课程'),teachers:String(c.teacherNames||''),classes:[]};current.recording=true;current.classes=c.classIds||current.classes;courses.set(id,current);}
  replays.clear();$('episodes').replaceChildren();$('courses').replaceChildren();const initial=document.createElement('option');initial.value='';initial.textContent='选择课程';$('courses').append(initial);
  for(const c of courses.values()){const o=document.createElement('option');o.value=c.id;o.textContent=c.name+(c.recording?'':' · 暂无回放');o.disabled=!c.recording;$('courses').append(o);}
  const list=[...courses.values()].map(({id,name,teachers,recording})=>({id,name,teachers,recording}));status(`已读取 ${list.length} 门课程，其中 ${list.filter(c=>c.recording).length} 门有回放入口。`);send({type:'catalog',term:term.description||`${term.schoolYear} 第${term.term}学期`,courses:list});autoSync().catch(e=>cloud.status('自动同步已暂停：'+e.message));return list;
 }
 let page=0,currentCourse='',totalEpisodes=0;
 async function loadReplays(id,more=false){
  if(busy)throw Error('请等待当前音频提取完成');const c=courses.get(String(id));if(!c?.recording)throw Error('请选择有回放的课程');
  if(!more||currentCourse!==c.id){page=0;replays.clear();$('episodes').replaceChildren();}currentCourse=c.id;const nextPage=page+1;
  const data=await adapter.request({url:adapter.cfg.teachingApi+'/v1/videoinfos/page?validCode='+encodeURIComponent(adapter.cfg.validCode),type:'post',isApplication:true,data:{userId:adapter.userId,groupIds:c.classes,openStatus:'1',week:null,schoolYear:term.schoolYear,term:term.term,validCode:adapter.cfg.validCode,page:nextPage,pageSize:30}});
  if(!Array.isArray(data.videoInfoResourceList))throw Error('课次接口格式发生变化');
  page=nextPage;const items=data.videoInfoResourceList.filter(v=>v.id && Number(v.openStatus)!==0 && (v.resourceStatus==null||Number(v.resourceStatus)===0)).map(v=>({id:String(v.id),name:String(v.videoInfoName||c.name),course:c.id,date:String(v.startTime||''),end:String(v.endTime||'')}));
  for(const v of items){replays.set(v.id,v);const label=document.createElement('label'),cb=document.createElement('input'),text=document.createElement('span');cb.type='checkbox';cb.value=v.id;text.textContent=`${v.date} ${v.name}`;label.append(cb,text);$('episodes').append(label);}
  totalEpisodes=Number(data.total)||0;$('more').hidden=page*30>=totalEpisodes;$('extract').disabled=!replays.size;
  status(`${c.name}：已读取 ${replays.size} / ${totalEpisodes} 个课次。`);send({type:'replays',courseId:c.id,items:[...replays.values()],hasMore:!$('more').hidden});return items;
 }

 let syncing=false;
 async function autoSync(){
  if(syncing||document.documentElement.dataset.ceCloudBridge!=='1')return;syncing=true;
  try{const settings=await cloudCall('settings');if(!settings.configured||!settings.autoSync)return;
   for(const c of courses.values()){
    if(!settings.textbooks?.[c.id]||!c.recording)continue;
    await loadReplays(c.id);let pages=1;while(!$('more').hidden&&pages++<20)await loadReplays(c.id,true);
    const rows=[...replays.values()];for(const record of rows){const state=await cloudCall('lecture',{id:record.id});if(state.state==='not_uploaded'||state.state==='uploading'){await extract([record.id]);if(cloud.error)throw Error(cloud.error);}}
   }
   cloud.status('自动检查完成。已提交的任务在云端继续；失败任务可手动重试。');
  }finally{syncing=false;}
 }
 function mediaURL(f){const value=String(f.outerIp||'')+String(f.videoStorePath||'');const u=new URL(value);if(u.protocol!=='https:'||!/^lzm\d+\.nwafu\.edu\.cn$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(u.pathname))throw Error('学校返回了不支持的媒体地址');return u.href;}
 function mediaRequest(url,start,end,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('已取消提取'));return;}
  const requestId=crypto.randomUUID();let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('message',receive);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const receive=event=>{const d=event.data;if(event.source!==window||event.origin!==SCHOOL||d?.ce!=='media-response'||d.requestId!==requestId)return;finish(d.ok?null:Error(d.error||'媒体读取失败'),d);};
  const cancel=()=>{window.postMessage({ce:'media-request',requestId,cancel:true},SCHOOL);finish(Error('已取消提取'));};
  const timer=setTimeout(()=>finish(Error('媒体分段读取超时')),100000);
  window.addEventListener('message',receive);signal?.addEventListener('abort',cancel,{once:true});
  window.postMessage({ce:'media-request',requestId,url,start,end},SCHOOL);
 });}
 function selectSegments(detail){
  const files=[...(detail.teacherViewFiles||[]),...(detail.studentViewFiles||[]),...(detail.vgaViewFiles||[])];const groups=new Map();
  for(const f of files){const key=f.startTime||f.serialNum||'first';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
  return [...groups.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([key,list])=>{const audible=list.filter(f=>Number(f.voiceStaus)===0).sort((a,b)=>Number(a.voicePriority??999)-Number(b.voicePriority??999));if(!audible.length)throw Error('该课次没有标注可用的发声音轨，请回学校播放器核对');return {key,url:mediaURL(audible[0])};});
 }
 let preparing=null;
 async function prepareLessonAudio(id,signal,onProgress=()=>{}){
  if(preparing){if(preparing.id===id)return preparing.promise;throw Error('正在准备另一节课的音轨，请等待完成');}
  const promise=(async()=>{adapter=getAdapter();if(!adapter)throw Error('请先完成学校登录');
   const detail=await adapter.request({url:adapter.cfg.teachingApi+'/v1/videoinfo/'+encodeURIComponent(id),type:'get',data:{validCode:code('id='+id+'&signKey=123123')}});
   const segments=selectSegments(detail);if(segments.length!==1)throw Error('此课次含多个独立录制分段，暂不支持纯音轨增强');
   const url=segments[0].url,cached=await readAudio(id,url);if(signal?.aborted)throw Error('已取消准备');if(cached){onProgress('已读取本机缓存的纯音轨');return cached;}
   onProgress('正在准备纯音轨；原声继续播放，请保持页面在前台…');
   const reader=await createRangeReader(url,mediaRequest,signal);
   try{const blob=await remuxAudio(()=>reader.read(),p=>onProgress(`准备纯音轨 ${Math.min(99,Math.round(p.bytes/reader.total*100))}% · 原声继续播放`),signal);await saveAudio(id,url,blob);return blob;}finally{await reader.cancel();}
  })();preparing={id,promise};try{return await promise;}finally{preparing=null;}
 }
 if(TABLET)window.__CE_AUDIO_PREPARE__=(id,{signal,onProgress}={})=>{
  const current=new URLSearchParams(location.hash.split('?')[1]||'').get('id');
  if(!id||id!==current)return Promise.reject(Error('请先打开要收听的具体课次'));
  return prepareLessonAudio(id,signal,onProgress);
 };
 async function addResult(name,blob,record,parts){const url=URL.createObjectURL(blob),box=document.createElement('div'),title=document.createElement('p'),audio=document.createElement('audio'),a=document.createElement('a');title.textContent=name;audio.controls=true;audio.src=url;a.href=url;a.download=name;a.textContent=`保存音频 · ${(blob.size/1024/1024).toFixed(1)} MB`;box.append(title,audio,a);$('results').prepend(box);if(document.documentElement.dataset.ceTabletBridge!=='1')send({type:'audio',name,blob});await cloud.offer(record,name,blob,parts);if(TABLET&&cloud.error)throw Error(cloud.error);}
 async function extract(ids){
  if(busy)throw Error('已有提取任务正在运行');if(!Array.isArray(ids)||ids.length<1||ids.length>20||ids.some(id=>!replays.has(id)))throw Error('只能选择当前已列出的1～20个课次');
  if(TABLET&&!(await cloudCall('settings')).configured)throw Error('请先点左下角“连接字幕服务”完成一次连接');busy=true;controller=new AbortController();$('extract').disabled=true;$('stop').disabled=false;
  try{for(let i=0;i<ids.length;i++){
   if(controller.signal.aborted)throw Error('已取消提取');const record=replays.get(ids[i]);status(`正在获取第 ${i+1}/${ids.length} 课：${record.date}`);
   if(TABLET){const known=await cloudCall('lecture',{id:record.id});if(known.state==='complete'){status('本节字幕已完成，打开本节回放即可自动加载。');continue;}}
   stage='读取课次详情';const detail=await adapter.request({url:adapter.cfg.teachingApi+'/v1/videoinfo/'+encodeURIComponent(record.id),type:'get',data:{validCode:code('id='+record.id+'&signKey=123123')}});
   stage='选择音轨';const segments=selectSegments(detail);if(!segments.length)throw Error('没有可用的媒体分段');if(document.documentElement.dataset.ceTabletBridge==='1'&&segments.length!==1)throw Error('此课次有多个独立录制分段，暂不支持自动字幕，请先选单段课次测试');
   if(TABLET){stage='准备纯音轨';const blob=await prepareLessonAudio(record.id,controller.signal,status);const name=(record.name+'_'+record.date).replace(/[\\/:*?"<>|]/g,'_').slice(0,140)+'.m4a';await addResult(name,blob,record,1);continue;}
   for(let j=0;j<segments.length;j++){
    stage='连接媒体服务器';status(`正在连接媒体服务器 · 分段 ${j+1}/${segments.length}…`);send({type:'progress',text:$('status').textContent,percent:0});
    let reader,length;
    if(TABLET){reader=await createRangeReader(segments[j].url,mediaRequest,controller.signal);length=reader.total;}
    else{let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller?.abort();},45000);let response;try{response=await fetch(segments[j].url,{mode:'cors',credentials:'omit',referrerPolicy:'origin',signal:controller.signal});}catch(e){if(timedOut)throw Error('媒体服务器45秒未响应');throw e;}finally{clearTimeout(timeout);}if(!response.ok)throw Error('媒体请求失败 HTTP '+response.status);if(!response.headers.get('content-type')?.includes('video/mp4'))throw Error('服务器未返回 MP4');length=Number(response.headers.get('content-length'));if(length>800*1024*1024)throw Error('该视频超过浏览器800MB处理上限，需要云端处理');if(!response.body?.getReader)throw Error('浏览器不支持流式读取，请更新 Safari 或 Edge');reader=response.body.getReader();}
    let bytes=0;stage='下载并解析音轨';
    try{const blob=await remuxAudio(async()=>{let stalled=false;const idle=setTimeout(()=>{stalled=true;controller?.abort();},90000);let result;try{result=await reader.read();}catch(e){if(stalled)throw Error('媒体下载90秒没有收到新数据');throw e;}finally{clearTimeout(idle);}if(!result.done){bytes+=result.value.byteLength;if(!TABLET&&bytes>800*1024*1024)throw Error('媒体超过浏览器处理上限');}return result;},p=>{const pct=length?Math.min(99,Math.round(p.bytes/length*100)):0;$('progress').value=pct;status(`第 ${i+1}/${ids.length} 课 · 分段 ${j+1}/${segments.length} · 已读取 ${(p.bytes/1024/1024).toFixed(1)} MB`);send({type:'progress',text:$('status').textContent,percent:pct});},controller.signal);
     const name=(record.name+'_'+record.date+`_第${j+1}段`).replace(/[\\/:*?"<>|]/g,'_').slice(0,140)+'.m4a';await addResult(name,blob,record,segments.length);
    }finally{await reader.cancel().catch(()=>{});}
   }
  }$('progress').value=100;status(TABLET?'音频提交流程完成，字幕进度请查看下方。':'音频提取完成，可直接试听或保存。');send({type:'done'});
  }finally{busy=false;$('extract').disabled=!replays.size;$('stop').disabled=true;controller=null;}
 }
 function fail(e){const raw=String(e?.message||'操作失败');const network=/Load failed|Failed to fetch|NetworkError/i.test(raw);const message=e?.name==='AbortError'?'提取已中止，可重新选择课次重试':`${stage?stage+'失败：':''}${network?'网络请求未能完成。请先在学校原播放器打开同一课次，确认能播放；若开着 VPN，可关闭后重试。浏览器未提供更具体的网络原因。':raw}`;status(message);send({type:'error',message});stage='';}
 $('refresh').onclick=()=>loadCourses().catch(fail);$('courses').onchange=()=>loadReplays($('courses').value).catch(fail);$('more').onclick=()=>loadReplays(currentCourse,true).catch(fail);$('extract').onclick=()=>extract([...root.querySelectorAll('#episodes input:checked')].map(c=>c.value)).catch(fail);$('stop').onclick=()=>controller?.abort();
 window.addEventListener('message',event=>{
  const d=event.data;if(!PORTALS.has(event.origin)||event.source!==window.opener||!d||d.ce!=='workbench-v1'||!/^[-a-f0-9]{36}$/.test(d.channel||''))return;
  if(d.type==='hello'){pair={source:event.source,channel:d.channel,origin:event.origin};send({type:'connected'});return;}
  if(!pair||d.channel!==pair.channel)return;
  if(d.type==='courses')loadCourses().catch(fail);if(d.type==='replays')loadReplays(d.courseId,!!d.more).catch(fail);if(d.type==='extract')extract(d.ids).catch(fail);if(d.type==='cancel')controller?.abort();
 });
 const start=Date.now(),timer=setInterval(()=>{if(getAdapter()){clearInterval(timer);loadCourses().catch(fail);}else if(Date.now()-start>120000){clearInterval(timer);status('请先登录，再点“刷新课程”。');}},1000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);controller?.abort();},{once:true});
}
