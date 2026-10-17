import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installLocalCaption} from '../scripts/local-caption.mjs';
import {installLessonCloud} from '../scripts/lesson-cloud.mjs';
const tick=()=>new Promise(r=>setTimeout(r,5));
const dom=new JSDOM('<div id="nwa-classroom-host"></div>',{url:'https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/index.html'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.Event=dom.window.Event;
const root=document.getElementById('nwa-classroom-host').attachShadow({mode:'open'});root.innerHTML='<button id="ce-local-caption"></button><p id="ce-local-status"></p><button id="ce-cloud-current"></button><button id="ce-cloud-check"></button><button id="ce-cloud-cancel"></button><p id="ce-cloud-status"></p>';
globalThis.Worker=class{constructor(){throw Error('must not load ASR');}};window.__CE_LIVE_AUDIO__={getCapture(){throw Error('must not capture PCM');}};window.__CE_ASR_WORKER_SOURCE__='old';let stopped=0;window.__CE_LOCAL_CAPTION__={stop(){stopped++;}};
const local=installLocalCaption();local.toggle();assert.equal(stopped,1);assert(!local.enabled);assert(!('__CE_ASR_WORKER_SOURCE__'in window));assert(root.getElementById('ce-local-caption').disabled);
let state={state:'not_uploaded'},prepares=0,submits=0,current='lesson-1',ready=0,api;window.addEventListener('ce-cloud-ready',()=>ready++);
const cloudCall=async op=>op==='settings'?{configured:true}:structuredClone(state);
const setup=(prepare=async()=>{prepares++;return new Blob(['fixture']);})=>installLessonCloud({root,lesson:()=>current,cloudCall,getRecord:async id=>({id,course:'course-1',name:'lesson'}),prepare,submit:async({signal,onJob})=>{submits++;onJob({id:'job',state:'uploading',submitted:1,total:2});if(submits===1)throw Error('interrupted');assert(!signal.aborted);state={state:'transcribing',submitted:2,total:2,finished:0};return state;}});
try{
 api=setup();await tick();assert.equal(prepares,0,'read-only restore cannot extract or submit');await api.start();assert.match(root.getElementById('ce-cloud-status').textContent,/未完成/);assert.equal(root.getElementById('ce-cloud-current').textContent,'继续提交本节字幕');
 state={state:'uploading',submitted:1,total:2};api.destroy();api=setup();await tick();assert.match(root.getElementById('ce-cloud-status').textContent,/1\/2/);await api.start();assert.match(root.getElementById('ce-cloud-status').textContent,/可以关闭页面/);assert.equal(submits,2);
 api.destroy();api=setup();await tick();assert.equal(prepares,2,'refresh during transcription cannot prepare again');assert(root.getElementById('ce-cloud-current').disabled);await api.start();assert.equal(submits,2);
 state={state:'complete',total:2,finished:2};await api.query();assert(ready);assert.match(root.getElementById('ce-cloud-status').textContent,/已完成/);
 api.destroy();state={state:'not_uploaded'};let release;api=setup(async(id,signal)=>{prepares++;await new Promise(r=>release=r);return new Blob(['fixture']);});await tick();const running=api.start();await tick();root.getElementById('ce-cloud-cancel').click();release();await running;assert.equal(submits,2,'cancel during preparation must not upload');assert.match(root.getElementById('ce-cloud-status').textContent,/已停止/);
 console.log('PASS withdrawn local ASR cannot capture/load, current-lesson one-click, interrupted upload restore, transcription/completion reuse, subtitle ready event, preparation cancellation');
}finally{api?.destroy();dom.window.close();}
