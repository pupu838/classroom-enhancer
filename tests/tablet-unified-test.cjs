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
  assert.equal(root.querySelectorAll('#ce-nav button').length,3);root.querySelector('[data-tab="ce-library"]').click();assert.equal($('ce-library').hidden,false);assert.equal($('ce-listen').hidden,true);
  let preparations=0;w.__CE_AUDIO_PREPARE__=async(id)=>{assert.equal(id,'lesson-1');preparations++;return new w.Blob(['fixture']);};
  root.querySelector('[data-tab="ce-listen"]').click();$('audio').click();for(let i=0;i<20&&$('audio').textContent!=='恢复原声';i++)await wait(25);assert.equal(preparations,1);assert.equal($('audio').textContent,'恢复原声',$('status').textContent);assert.equal(video.muted,true);
  const saved=[];w.HTMLAnchorElement.prototype.click=function(){saved.push(this.download);};await $('ce-audio-download').onclick();assert.equal(preparations,2);assert.equal(saved[0],'课堂音频_lesson-1.m4a');assert.equal($('ce-audio-download-link').hidden,false);
  const retry=w.__CE_RETRY_PLAYER__;delete w.__CE_RETRY_PLAYER__;await $('ce-player-reset').onclick();assert.match(w.document.documentElement.dataset.cePlayerMessage,/尚未就绪/);assert.equal($('ce-player-reset').disabled,false);w.__CE_RETRY_PLAYER__=retry;
  const before=seeks;masterTime=1;audio._time=.8;await wait(850);assert.equal(seeks,before,'small drift caused a hard seek');assert(audio.playbackRate>1&&audio.playbackRate<=1.02);
  w.__CE_AUDIO_CONTROL__.setVolume(.4);assert.equal(audio.volume,.4);w.__CE_AUDIO_CONTROL__.setMuted(true);assert.equal(audio.muted,true);w.__CE_AUDIO_CONTROL__.setMuted(false);assert.equal(audio.muted,false);assert.equal(video.muted,true);assert.equal($('audio').textContent,'恢复原声');
  masterTime=50;video.dispatchEvent(new w.Event('seeking'));assert.equal(audio.currentTime,50);video.dispatchEvent(new w.Event('seeked'));
  audio.readyState=1;audio.dispatchEvent(new w.Event('waiting'));await wait(1900);assert.equal(video.muted,false);assert.match($('status').textContent,/自动恢复原声/);
  console.log('PASS unified iPad panel, cached pure-audio path, no tiny drift seeks, explicit seek, stalled audio restores original');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
