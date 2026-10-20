import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mock} from 'node:test';
import {installLocalCaption} from '../scripts/local-caption.mjs';
import {installLessonCloud} from '../scripts/lesson-cloud.mjs';
const tick=()=>new Promise(r=>setTimeout(r,5));
const dom=new JSDOM('<div id="nwa-classroom-host"></div>',{url:'https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/index.html'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Event=dom.window.Event;
const root=document.getElementById('nwa-classroom-host').attachShadow({mode:'open'});root.innerHTML='<button id="ce-local-caption"></button><p id="ce-local-status"></p><button id="ce-cloud-current"></button><button id="ce-cloud-check"></button><button id="ce-cloud-cancel"></button><p id="ce-cloud-status"></p>';
globalThis.Worker=class{constructor(){throw Error('must not load ASR');}};window.__CE_LIVE_AUDIO__={getCapture(){throw Error('must not capture PCM');}};window.__CE_ASR_WORKER_SOURCE__='old';let stopped=0;window.__CE_LOCAL_CAPTION__={stop(){stopped++;}};
const local=installLocalCaption();local.toggle();assert.equal(stopped,1);assert(!local.enabled);assert(!('__CE_ASR_WORKER_SOURCE__'in window));assert(root.getElementById('ce-local-caption').disabled);
let state={state:'not_uploaded'},prepares=0,submits=0,current='lesson-1',ready=0,queries=0,api;window.addEventListener('ce-cloud-ready',()=>ready++);
const cloudCall=async op=>{if(op==='settings')return {configured:true};queries++;return structuredClone(state);};
const setup=(prepare=async()=>{prepares++;return new Blob(['fixture']);},request=cloudCall,getRecord=async id=>({id,course:'course-1',name:'lesson'}))=>installLessonCloud({root,lesson:()=>current,cloudCall:request,getRecord,prepare,submit:async({signal,onJob})=>{submits++;onJob({id:'job',state:'uploading',submitted:1,total:2});if(submits===1)throw Error('interrupted');assert(!signal.aborted);state={state:'transcribing',submitted:2,total:2,finished:0};return state;}});
try{
 api=setup();await tick();assert.equal(prepares,0,'read-only restore cannot extract or submit');await api.start();assert.match(root.getElementById('ce-cloud-status').textContent,/未完成/);assert.equal(root.getElementById('ce-cloud-current').textContent,'继续提交本节字幕');
 state={state:'uploading',submitted:1,total:2};api.destroy();api=setup();await tick();assert.match(root.getElementById('ce-cloud-status').textContent,/1\/2/);await api.start();assert.match(root.getElementById('ce-cloud-status').textContent,/可以关闭页面/);assert.equal(submits,2);
 api.destroy();api=setup();await tick();assert.equal(prepares,2,'refresh during transcription cannot prepare again');assert(root.getElementById('ce-cloud-current').disabled);await api.start();assert.equal(submits,2);
 state={state:'complete',total:2,finished:2};await api.query();assert(ready);assert.match(root.getElementById('ce-cloud-status').textContent,/已完成/);
 api.destroy();mock.timers.enable({apis:['setInterval','Date'],now:Date.now()});api=setup();await tick();const restoredQueries=queries;mock.timers.tick(90000);await tick();assert.equal(queries,restoredQueries,'completed subtitles stop automatic status polling');await api.query();assert.equal(queries,restoredQueries+1,'manual refresh still checks the saved result');current='another-lesson';window.dispatchEvent(new Event('hashchange'));await tick();assert.equal(queries,restoredQueries+2,'changing lesson restores its own result immediately');api.destroy();mock.timers.reset();current='lesson-1';
 api.destroy();state={state:'not_uploaded'};let release;api=setup(async(id,signal)=>{prepares++;await new Promise(r=>release=r);return new Blob(['fixture']);});await tick();const running=api.start();await tick();root.getElementById('ce-cloud-cancel').click();release();await running;assert.equal(submits,2,'cancel during preparation must not upload');assert.match(root.getElementById('ce-cloud-status').textContent,/已停止/);
 for(const stage of ['settings','lecture','record','prepare']){
  api.destroy();state={state:'not_uploaded'};let held=false,resume;
  const wait=async name=>{if(held&&name===stage)await new Promise(r=>resume=r);};
  api=setup(async()=>{await wait('prepare');return new Blob(['cached audio']);},async op=>{await wait(op);return op==='settings'?{configured:true}:{state:'not_uploaded'};},async id=>{await wait('record');return {id,course:'course-1',name:'lesson'};});
  await tick();held=true;const pending=api.start();await tick();assert.equal(typeof resume,'function');current='changed-during-'+stage;held=false;resume();await pending;await tick();assert.equal(submits,2,'navigation during '+stage+' must not submit the previous lesson');current='lesson-1';
 }
 console.log('PASS withdrawn local ASR, upload recovery, completion reuse without polling, manual refresh, immediate route restore, cancellation and navigation races at each preparation step');
}finally{api?.destroy();mock.timers.reset();dom.window.close();}
