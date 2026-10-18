const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),{buildSync}=require('esbuild');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const dom=new JSDOM('<div id="app"></div><div class="video-js"><video src="https://lzm1.nwafu.edu.cn/bkt-lanz-record/lesson.mp4"></video></div>',{url:'https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/index.html#/fullpage/aiClassroom.htm?videoId=lesson-1',runScripts:'outside-only'}),w=dom.window;
 try{
  Object.assign(w.document.documentElement.dataset,{ceTabletBridge:'1',ceCloudBridge:'1',ceAppVersion:'0.7.0'});
  w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:800,height:450});
  const video=w.document.querySelector('video');let masterTime=0;Object.defineProperties(video,{readyState:{get:()=>4},currentSrc:{get:()=>video.src},paused:{get:()=>false},seeking:{get:()=>false},currentTime:{get:()=>masterTime,set:value=>masterTime=value}});
  class Param{setTargetAtTime(value){this.value=value;}}class Node{constructor(){for(const name of ['frequency','gain','Q','threshold','knee','ratio','attack','release'])this[name]=new Param();}connect(){}}
  w.AudioContext=class{constructor(){this.destination=new Node();this.currentTime=0;}async resume(){}async close(){}createMediaElementSource(a){assert.equal(a.src,'blob:pure-audio');return new Node();}createBiquadFilter(){return new Node();}createGain(){return new Node();}createDynamicsCompressor(){return new Node();}};
  let audio,seeks=0;w.Audio=class extends w.EventTarget{constructor(){super();audio=this;this.volume=1;this._time=0;this.readyState=4;this.seeking=false;}set currentTime(value){this._time=value;seeks++;}get currentTime(){return this._time;}load(){if(this.src)setTimeout(()=>this.dispatchEvent(new w.Event('canplay')),0);}async play(){}pause(){}removeAttribute(){this.src='';}};
  w.URL.createObjectURL=()=> 'blob:pure-audio';w.URL.revokeObjectURL=()=>{};
  w.eval(fs.readFileSync('edge/content.js','utf8'));
  w.eval(buildSync({entryPoints:['scripts/school-connector.mjs'],bundle:true,format:'iife',write:false,target:'safari16'}).outputFiles[0].text);
  const root=w.document.getElementById('nwa-classroom-host').shadowRoot,$=id=>root.getElementById(id);
  assert.equal(w.document.getElementById('ce-course-connector'),null,'connector must be inside the unified panel');
  const connector=$('ce-courses').querySelector('#ce-course-connector');assert(connector);assert.equal(connector.shadowRoot.getElementById('toggle').hidden,true);assert.equal(connector.shadowRoot.querySelector('section').hidden,false);
  assert.equal($('ce-local-caption').disabled,true);assert.equal(w.__CE_LOCAL_CAPTION__.enabled,false);$('ce-cloud-captions').click();assert.equal($('ce-library').hidden,false);
  assert.equal(root.querySelectorAll('#ce-nav button').length,3);root.querySelector('[data-tab="ce-library"]').click();assert.equal($('ce-library').hidden,false);assert.equal($('ce-listen').hidden,true);
  let preparations=0,enabled=false,updates=0;w.__CE_AUDIO_PREPARE__=async(id)=>{assert.equal(id,'lesson-1');preparations++;return new w.Blob(['fixture']);};
  w.__CE_LIVE_AUDIO__={state:()=>({started:true,enhanced:enabled,worklet:true,neural:true,activeId:'slides'}),update(){updates++;},async setEnhanced(value){enabled=value;w.dispatchEvent(new w.Event('ce-audio-state'));},calibrate(){throw Error('neural audio must not require calibration');}};
  root.querySelector('[data-tab="ce-listen"]').click();await $('audio').onclick();assert.equal(preparations,0,'live denoise must never download audio');assert.equal(enabled,true);assert.equal($('audio').textContent,'关闭声音调整');assert.equal($('noise').disabled,true);assert(updates>0);
  root.querySelector('[data-audio-preset=gentle]').click();assert.equal($('strength').value,'0.25');assert.equal($('body').value,'-2');assert.equal(preparations,0);
  $('presence').value='5';$('presence').dispatchEvent(new w.Event('input'));$('ce-audio-export').click();const exported=JSON.parse($('ce-audio-config').value);assert.equal(exported.settings.presence,5);assert.equal(exported.schema,'ce-audio/1');
  root.querySelector('[data-audio-preset=flat]').click();assert.equal($('presence').value,'0');$('ce-audio-config').value=JSON.stringify(exported);$('ce-audio-import').click();assert.equal($('presence').value,'5');assert.equal($('strength').value,'0.25');
  $('ce-audio-config').value='{}';$('ce-audio-import').click();assert.match($('status').textContent,/无法载入/);assert.equal($('presence').value,'5');

  const saved=[];w.HTMLAnchorElement.prototype.click=function(){saved.push(this.download);};await $('ce-audio-download').onclick();assert.equal(preparations,1);assert.equal(enabled,true,'downloading must not disable enhancement');assert.equal(saved[0],'课堂音频_lesson-1.m4a');assert.equal($('ce-audio-download-link').hidden,false);
  await $('audio').onclick();assert.equal(enabled,false);assert.equal(preparations,1);assert.equal($('audio').textContent,'开启声音调整');
  const retry=w.__CE_RETRY_PLAYER__;delete w.__CE_RETRY_PLAYER__;await $('ce-player-reset').onclick();assert.match(w.document.documentElement.dataset.cePlayerMessage,/尚未就绪/);assert.equal($('ce-player-reset').disabled,false);w.__CE_RETRY_PLAYER__=retry;
  console.log('PASS unified iPad panel, independent live denoise/download, neural automatic suppression, source UI recovery');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
