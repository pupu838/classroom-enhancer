// Native media streaming, independent of the download/remux pipeline.
// A fixed video remains the clock. Changing audio never changes that video.
import {audioDefaults,normalizeAudio} from './audio-tuning.mjs';
export function createLiveAudio({clock,views,clockId,workletSource,onStatus=()=>{}}){
 let ctx,bus,dry,wet,output,worklet,boost,tap,meter,active=null,wanted=clockId,enhanced=false,disposed=false,serial=0,preparing=null;
 let volume=clock.volume,muted=clock.muted,started=false,buffering=false,stalledAt=0,driftSince=0,previousTime=-1,pendingResume=null,clockPauseOwner=0,handoffGraceUntil=0,tuning={...audioDefaults},filters=null;
 const tracks=new Map(),clean=[],initialMute=clock.muted,base=views.find(v=>v.id===clockId)?.offset||0;
 const emit=()=>window.dispatchEvent(new Event('ce-audio-state'));
 const listen=(target,event,fn)=>{target.addEventListener(event,fn);clean.push(()=>target.removeEventListener(event,fn));};
 const targetTime=track=>Math.max(0,clock.currentTime+base-(track.view.offset||0));
 const ramp=(param,value,time=.03)=>param.setTargetAtTime(value,ctx.currentTime,time);
 function state(){return {activeId:active?.view.id||clockId,wantedId:wanted,started,enhanced,tuning:{...tuning},worklet:!!worklet,neural:!!worklet?.neural,volume,muted,ctx,analyser:tap,outputAnalyser:meter,media:active?{time:active.a.currentTime,paused:active.a.paused,rate:active.a.playbackRate,ready:active.a.readyState,bufferAhead:bufferAhead(active.a)}:null};}
 function updateGain(){if(!ctx)return;ramp(output.gain,muted?0:volume);ramp(dry.gain,enhanced?0:1);ramp(wet.gain,enhanced?1:0);if(boost)ramp(boost.gain,10**(tuning.gain/20));if(filters){ramp(filters.hp.frequency,tuning.highpass);ramp(filters.lp.frequency,tuning.lowpass);for(const k of ['bass','body','presence','treble'])ramp(filters[k].gain,tuning[k]);ramp(filters.limiter.threshold,tuning.ceiling);}}
 function init(){
  if(ctx)return;
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});bus=ctx.createGain();dry=ctx.createGain();wet=ctx.createGain();output=ctx.createGain();tap=ctx.createAnalyser();tap.fftSize=2048;
  dry.gain.value=1;wet.gain.value=0;output.gain.value=muted?0:volume;meter=ctx.createAnalyser();meter.fftSize=2048;
  bus.connect(tap);bus.connect(dry);dry.connect(output);output.connect(meter);meter.connect(ctx.destination);
  // Create all three elements inside the initiating gesture; metadata is cheap,
  // and only the selected track is played until a switch is requested.
  for(const view of views){const a=new Audio();a.crossOrigin='anonymous';a.preload='none';a.playsInline=true;a.preservesPitch=true;
   const source=ctx.createMediaElementSource(a),level=ctx.createGain();level.gain.value=0;source.connect(level);level.connect(bus);
   const track={view,a,source,level};tracks.set(view.id,track);
   listen(a,'error',()=>{if(active===track)fallback('这路音频加载失败，已恢复学校原声。');});
  }
 }
 function waitMedia(a,minimum=3,timeout=12000){
  return new Promise((resolve,reject)=>{
   const usable=()=>a.readyState>=minimum&&(minimum<3||!a.seeking);
   if(usable()){resolve();return;}
   let settled=false;
   const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);for(const name of ['loadedmetadata','canplay','seeked','playing'])a.removeEventListener(name,check);a.removeEventListener('error',fail);error?reject(error):resolve();};
   const check=()=>{if(usable())finish();};
   const fail=()=>finish(Error('学校媒体暂不允许这路音轨在浏览器处理'));
   const timer=setTimeout(()=>finish(Error('独立音轨缓冲超时，已保留原有声音，请稍后重试')),timeout);
   for(const name of ['loadedmetadata','canplay','seeked','playing'])a.addEventListener(name,check);
   a.addEventListener('error',fail);check();
  });
 }
 function bufferAhead(a){
  try{const b=a.buffered,t=a.currentTime;if(!b||typeof b.length!=='number')return null;
   for(let i=0;i<b.length;i++)if(b.start(i)<=t+.05&&b.end(i)>t)return Math.max(0,b.end(i)-t);
   return b.length?0:null;
  }catch{return null;}
 }
 function align(track,force=false){
  const a=track.a,target=targetTime(track),drift=target-a.currentTime;
  // Only an explicit master timeline jump may seek an active stream.
  // Drift-driven repeated seeks on Safari discard MP4 range buffers.
  if(force&&a.readyState>=1&&!a.seeking&&Math.abs(drift)>.08){
   a.currentTime=target;a.playbackRate=clock.playbackRate;driftSince=0;stalledAt=0;return;
  }
  if(a.seeking||a.readyState<3)return;
  const correction=Math.abs(drift)>.08?Math.max(-.025,Math.min(.025,drift*.08)):0;
  const rate=clock.playbackRate*(1+correction);
  if(Math.abs(a.playbackRate-rate)>.0001)a.playbackRate=rate;
 }
 function fallback(message){
  if(disposed)return;serial++;started=false;enhanced=false;wanted=clockId;
  stalledAt=0;driftSince=0;previousTime=-1;handoffGraceUntil=0;
  worklet?.port.postMessage({type:'bypass',value:true});
  for(const t of tracks.values()){t.level.gain.value=0;t.a.pause();}
  active=null;clock.muted=muted;clock.volume=volume;onStatus(message);emit();
 }
 async function select(id=wanted,{forceExternal=false}={}){
  if(disposed)throw Error('播放器已关闭');
  if(!views.some(v=>v.id===id))throw Error('没有这路音频');
  // A second selection cancels the previous handoff and releases its temporary clock hold.
  if(clockPauseOwner&&clock.paused&&typeof clock.play==='function'){
   clockPauseOwner=0;Promise.resolve(clock.play()).catch(()=>{});
  }
  if(id===clockId&&!enhanced&&!forceExternal){
   wanted=clockId;if(started)fallback('已切回主音轨直放，无需重复下载音频。');
   else{serial++;onStatus('正在使用主音轨直放，优先保证声音连续。');emit();}
   return;
  }
  if(started&&active?.view.id===id)return;
  wanted=id;const ticket=++serial;init();const track=tracks.get(id),a=track.a;
  const highSpeed=clock.playbackRate>1.25&&typeof clock.pause==='function'&&typeof clock.play==='function';
  let heldClock=false;
  // Prime playback in the click gesture, but keep the candidate's gain at zero.
  // Never mute the old track until the replacement is ready.
  ctx.resume().catch(()=>{});a.preload='auto';a.playbackRate=clock.playbackRate;
  if(!a.src){a.src=track.view.url;a.load();}
  if(a.readyState>=1&&!a.seeking&&Math.abs(targetTime(track)-a.currentTime)>.08)a.currentTime=targetTime(track);
  const primed=!clock.paused?a.play():null;primed?.catch(()=>{});
  try{
   await waitMedia(a,1);if(ticket!==serial||disposed)return;
   if(!a.seeking&&Math.abs(targetTime(track)-a.currentTime)>.15)a.currentTime=targetTime(track);
   await waitMedia(a,3,16000);if(ticket!==serial||disposed)return;
   // At 2–5x, the master can advance many seconds during one remote MP4 seek.
   // Once the new track is warm, hold the video clock for ONLY the final alignment.
   // This prevents an endless moving-target seek/rebuffer loop.
   if(highSpeed&&!clock.paused&&!clock.seeking){
    onStatus('倍速音轨正在最后对齐，画面将短暂停顿后自动继续…');
    clockPauseOwner=ticket;heldClock=true;clock.pause();a.pause();
    if(Math.abs(targetTime(track)-a.currentTime)>.08)a.currentTime=targetTime(track);
    await waitMedia(a,3,16000);if(ticket!==serial||disposed)return;
   }else if(Math.abs(targetTime(track)-a.currentTime)>.45){
    // Normal-speed switching retains a single bounded catch-up seek.
    a.currentTime=targetTime(track);await waitMedia(a,3,12000);
    if(ticket!==serial||disposed)return;
   }
   const drift=Math.abs(targetTime(track)-a.currentTime),ahead=bufferAhead(a);
   if(drift>.75||a.seeking||a.readyState<3||
      (!heldClock&&!clock.paused&&ahead!==null&&ahead<.35))
    throw Error('新音轨无法稳定跟上视频，已保留原来的声音');
   if(!heldClock){if(!clock.paused)await a.play();else a.pause();}
   if(ticket!==serial||disposed)return;
   const old=active;if(old!==track)worklet?.port.postMessage({type:'reset'});
   active=track;previousTime=-1;stalledAt=0;driftSince=0;started=true;
   handoffGraceUntil=performance.now()+(highSpeed?Math.min(4500,1400+500*clock.playbackRate):800);
   clock.muted=true;updateGain();ramp(track.level.gain,1,.015);
   if(old&&old!==track){ramp(old.level.gain,0,.015);setTimeout(()=>{if(active!==old)old.a.pause();},150);}
   if(heldClock){
    // Resume the common clock and the new audio together. No second moving seek.
    const videoStart=clock.play(),audioStart=a.play();
    await Promise.all([videoStart,audioStart]);
    if(ticket!==serial||disposed)return;
    heldClock=false;clockPauseOwner=0;
   }
   onStatus('正在使用'+track.view.label+'音频'+(enhanced?' · 浏览器人声增强':' · 原声')+'。已按当前倍速同步。');
   emit();window.dispatchEvent(new Event('ce-audio-track'));
  }catch(e){
   if(ticket!==serial||disposed)return;
   if(active===track)fallback('独立音轨接入失败，已恢复主音轨直放。');
   else{a.pause();wanted=active?.view.id||clockId;emit();}
   throw e;
  }finally{
   // Even on failure/cancellation, never leave the master video paused.
   if(heldClock&&clockPauseOwner===ticket){
    clockPauseOwner=0;
    if(clock.paused)Promise.resolve(clock.play()).catch(()=>onStatus('音轨已恢复，请点播放继续。'));
   }
  }
 }
 async function effects(){if(preparing)return preparing;if(worklet)return;
  preparing=(async()=>{if(!ctx.audioWorklet)throw Error('此浏览器未提供实时音频处理');let url;
   const neuralSource=window.__CE_RNNOISE_SOURCE__,neural=!!neuralSource&&ctx.sampleRate===48000;
   try{url=URL.createObjectURL(new Blob([neural?neuralSource:workletSource],{type:'text/javascript'}));await ctx.audioWorklet.addModule(url);}finally{if(url)URL.revokeObjectURL(url);}
   if(disposed)return;const hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),bass=ctx.createBiquadFilter(),body=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),treble=ctx.createBiquadFilter(),limiter=ctx.createDynamicsCompressor();
   hp.type='highpass';lp.type='lowpass';bass.type='lowshelf';bass.frequency.value=180;body.type='peaking';body.frequency.value=450;body.Q.value=.8;presence.type='peaking';presence.frequency.value=2200;presence.Q.value=.8;treble.type='highshelf';treble.frequency.value=4500;
   limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;
   filters={hp,lp,bass,body,presence,treble,limiter};
   worklet=new AudioWorkletNode(ctx,neural?'classroom-rnnoise':'classroom-denoise');worklet.neural=neural;worklet.port.postMessage({type:'strength',value:tuning.strength});worklet.port.onmessage=({data})=>{if(data.type==='calibrated')onStatus('底噪采样完成。可降低降噪强度减少失真。');};worklet.onprocessorerror=()=>{enhanced=false;updateGain();onStatus('降噪处理暂停，已切回本路原声。');emit();};
   boost=ctx.createGain();bus.connect(worklet);worklet.connect(hp);hp.connect(lp);lp.connect(bass);bass.connect(body);body.connect(presence);presence.connect(treble);treble.connect(boost);boost.connect(limiter);limiter.connect(wet);wet.connect(output);updateGain();
  })().finally(()=>preparing=null);return preparing;
 }
 async function setEnhanced(value){if(!value){
   enhanced=false;worklet?.port.postMessage({type:'bypass',value:true});
   if(active?.view.id===clockId)fallback('已关闭增强，恢复主音轨直放，减少重复下载。');
   else{updateGain();onStatus('已关闭降噪，继续播放所选音轨原声。');emit();}
   return;
  }if(!started)await select(wanted,{forceExternal:true});if(!worklet)onStatus('正在加载小型降噪模块，当前音轨原声继续播放…');await effects();if(disposed)return;enhanced=true;worklet?.port.postMessage({type:'bypass',value:false});updateGain();onStatus(worklet?.neural?'已开启 RNNoise 降噪试验；不保证提高课堂人声清晰度，可随时关闭对比原声。':'浏览器人声增强已开启，可在无人讲话时采样底噪。');emit();}
 function sync(force=false){
  if(!started||!active||disposed)return;
  const track=active,a=track.a;
  if(force)align(track,true);
  if(clock.paused||clock.seeking||buffering){a.pause();stalledAt=0;driftSince=0;previousTime=-1;return;}
  if(!force)align(track);
  const now=performance.now(),drift=Math.abs(targetTime(track)-a.currentTime);
  if(drift>.9&&!a.seeking&&now>=handoffGraceUntil){
   if(!driftSince)driftSince=now;
   else if(now-driftSince>1500){fallback('独立音轨与画面失去同步，已自动恢复主音轨直放。');return;}
  }else driftSince=0;
  if(a.readyState<3||a.seeking){
   if(!stalledAt)stalledAt=now;
   else if(now-stalledAt>Math.min(4500,Math.max(1300,800+500*clock.playbackRate))){fallback('独立音轨缓冲中断，已自动恢复主音轨直放。');return;}
   return;
  }
  if(a.paused&&!pendingResume){
   pendingResume=Promise.resolve(a.play()).catch(()=>{
    if(active===track&&!disposed)fallback('独立音轨无法继续播放，已恢复主音轨直放。');
   }).finally(()=>{pendingResume=null;});
  }
  if(!a.paused&&a.currentTime===previousTime){
   if(!stalledAt)stalledAt=now;
   else if(now-stalledAt>Math.min(4500,Math.max(1300,800+500*clock.playbackRate))){fallback('独立音轨连续停顿，已自动恢复主音轨直放。');return;}
  }else stalledAt=0;
  previousTime=a.currentTime;
 }
 for(const event of ['play','playing','seeked','ratechange'])listen(clock,event,()=>{if(event==='playing'||event==='seeked')buffering=false;sync(event==='seeked');});
 for(const event of ['pause','waiting','ended'])listen(clock,event,()=>{if(event==='waiting')buffering=true;if(active)active.a.pause();});
 listen(clock,'seeking',()=>{worklet?.port.postMessage({type:'reset'});if(active){active.a.pause();align(active,true);}window.dispatchEvent(new Event('ce-audio-seek'));});
 listen(clock,'volumechange',()=>{if(started&&!clock.muted)clock.muted=true;});
 const timer=setInterval(()=>sync(),500);
 return {state,select,setEnhanced,update(values){tuning=normalizeAudio(values,tuning);worklet?.port.postMessage({type:'strength',value:tuning.strength});updateGain();},calibrate(){if(worklet)worklet.port.postMessage({type:'calibrate'});},getMuted:()=>muted,getVolume:()=>volume,setMuted(value){muted=!!value;if(started)updateGain();else clock.muted=muted;emit();},setVolume(value){volume=Math.max(0,Math.min(1,value));if(started)updateGain();else clock.volume=volume;emit();},destroy(){disposed=true;serial++;clearInterval(timer);clean.forEach(fn=>fn());for(const t of tracks.values()){t.a.pause();t.a.removeAttribute('src');t.a.load();}ctx?.close().catch(()=>{});clock.muted=started?muted:initialMute;},getCapture(){if(!started)throw Error('请先选择一路音频');return {ctx,bus,clock,baseOffset:base};}};
}
