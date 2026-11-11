// Native media streaming, independent of the download/remux pipeline.
import {audioDefaults,normalizeAudio} from './audio-tuning.mjs';

const mediaEvents=['loadedmetadata','loadeddata','canplay','seeked','playing','progress'];
const noRecording=()=>Error('这路音频在当前进度没有录音。');

function startMedia(media){
 return Promise.resolve(media.play()).then(()=>null,error=>error);
}

function waitMedia(media,minimum,signal,{playback,timeout=12000}={}){
 return new Promise((resolve,reject)=>{
  let started=minimum===1||!playback,settled=false;
  const finish=error=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   for(const event of mediaEvents)media.removeEventListener(event,check);
   media.removeEventListener('error',check);
   signal.removeEventListener('abort',abort);
   error?reject(error):resolve();
  };
  const check=()=>{
   if(media.error)finish(Error('这路音频无法读取。'));
   else if(started&&media.readyState>=minimum&&(minimum===1||!media.seeking))finish();
  };
  const abort=()=>finish(signal.reason);
  const timer=setTimeout(()=>finish(Error('这路音频缓冲超时，请稍后重试。')),timeout);
  for(const event of mediaEvents)media.addEventListener(event,check);
  media.addEventListener('error',check);
  signal.addEventListener('abort',abort,{once:true});
  playback?.then(error=>{
   if(error)finish(error);
   else{started=true;check();}
  });
  if(signal.aborted)abort();else check();
 });
}

export function createLiveAudio({clock,views,clockId,workletSource,onStatus=()=>{}}){
 let ctx,bus,dry,wet,output,worklet,boost,tap,meter,preparing,filters;
 let active=null,pending=null,enhanced=false,disposed=false,buffering=false,needsGesture=false;
 let stalledAt=0,driftSince=0,previousTime=-1,lastProgressAt=0,recoverAfterBuffer=false,recoveryUsed=false,pendingResume=null;
 let volume=clock.volume,muted=clock.muted,tuning={...audioDefaults};
 const nativeTracks=new Map(),effectTracks=new Map(),clean=[];
 const base=views.find(view=>view.id===clockId)?.offset||0;
 const emit=()=>window.dispatchEvent(new Event('ce-audio-state'));
 const listen=(target,event,fn)=>{target.addEventListener(event,fn);clean.push(()=>target.removeEventListener(event,fn));};
 const targetTime=track=>clock.currentTime+base-(track.view.offset||0);
 const clockStopped=()=>clock.paused||clock.seeking||buffering;
 const hasRecording=(media,time)=>time>=-.05&&(!Number.isFinite(media.duration)||time<media.duration);
 const ramp=(param,value,time=.03)=>param.setTargetAtTime(value,ctx.currentTime,time);
 function state(){
  const media=active?.a;
  return {activeId:active?.view.id||clockId,wantedId:pending?.track.view.id||active?.view.id||clockId,started:!!active,
   enhanced,needsGesture,tuning:{...tuning},worklet:!!worklet,neural:!!worklet?.neural,volume,muted,ctx,analyser:tap,outputAnalyser:meter,
   media:media?{time:media.currentTime,paused:media.paused,rate:media.playbackRate,ready:media.readyState,bufferAhead:bufferAhead(media)}:null};
 }
 function updateGain(){if(!ctx)return;ramp(output.gain,muted?0:volume);ramp(dry.gain,enhanced?0:1);ramp(wet.gain,enhanced?1:0);if(boost)ramp(boost.gain,10**(tuning.gain/20));if(filters){ramp(filters.hp.frequency,tuning.highpass);ramp(filters.lp.frequency,tuning.lowpass);for(const k of ['bass','body','presence','treble'])ramp(filters[k].gain,tuning[k]);ramp(filters.limiter.threshold,tuning.ceiling);}}
 function initEffectsAudio(){
  if(ctx)return;
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});bus=ctx.createGain();dry=ctx.createGain();wet=ctx.createGain();output=ctx.createGain();tap=ctx.createAnalyser();tap.fftSize=2048;
  dry.gain.value=1;wet.gain.value=0;output.gain.value=muted?0:volume;meter=ctx.createAnalyser();meter.fftSize=2048;
  bus.connect(tap);bus.connect(dry);dry.connect(output);output.connect(meter);meter.connect(ctx.destination);
 }
 function getTrack(view,processed){
  const tracks=processed?effectTracks:nativeTracks;
  if(tracks.has(view.id))return tracks.get(view.id);
  const a=new Audio();
  a.preload='none';a.playsInline=true;a.preservesPitch=true;a.muted=!processed;
  let level;
  // Raw playback can use the school's native cross-origin media permissions.
  // Only explicit sound processing needs a CORS-enabled Web Audio source.
  if(processed){
   initEffectsAudio();a.crossOrigin='anonymous';
   level=ctx.createGain();level.gain.value=0;
   ctx.createMediaElementSource(a).connect(level);level.connect(bus);
  }
  const track={view,a,level};
  tracks.set(view.id,track);
  listen(a,'error',()=>{if(active===track)useClock('这路音频加载失败，已恢复主音轨。');});
  return track;
 }
 function bufferAhead(a){
  try{const b=a.buffered,t=a.currentTime;if(!b||typeof b.length!=='number')return null;
   for(let i=0;i<b.length;i++)if(b.start(i)<=t+.05&&b.end(i)>t)return Math.max(0,b.end(i)-t);
   return b.length?0:null;
  }catch{return null;}
 }
 function resetSync(){
  stalledAt=0;driftSince=0;previousTime=-1;lastProgressAt=0;recoverAfterBuffer=false;recoveryUsed=false;pendingResume=null;needsGesture=false;
 }
 function pauseTrack(track){
  if(track.level)track.level.gain.value=0;
  else track.a.muted=true;
  track.a.pause();
  track.a.preload='none';
 }
 function applyOutput(){
  clock.muted=!!active||muted;
  clock.volume=volume;
  if(active&&!active.level){active.a.volume=volume;active.a.muted=muted;}
  updateGain();
 }
 function useClock(message){
  if(active)pauseTrack(active);
  active=null;enhanced=false;resetSync();
  worklet?.port.postMessage({type:'bypass',value:true});
  applyOutput();onStatus(message);emit();
 }
 function releaseClock(request){
  if(!request.heldClock)return;
  request.heldClock=false;
  if(!disposed&&clock.paused&&!clock.ended)clock.play().catch(()=>onStatus('请点播放继续。'));
 }
 function cancelSelection(){
  if(!pending)return;
  const request=pending;pending=null;request.controller.abort();
  if(request.track!==active)pauseTrack(request.track);
  releaseClock(request);
 }
 async function alignCandidate(track,signal,timeout){
  const a=track.a,time=targetTime(track);
  if(!hasRecording(a,time))throw noRecording();
  const target=Math.max(0,time);
  if(Math.abs(a.currentTime-target)>.08)a.currentTime=target;
  a.playbackRate=clock.playbackRate;
  // Some browsers don't replenish media data after a seek until play is called.
  await waitMedia(a,3,signal,{playback:startMedia(a),timeout});
 }
 async function select(id=pending?.track.view.id||active?.view.id||clockId,{forceExternal=enhanced,enableEffects=false}={}){
  if(disposed)throw Error('播放器已关闭');
  const view=views.find(item=>item.id===id);
  if(!view)throw Error('没有这路音频');
  cancelSelection();
  if(id===clockId&&!forceExternal){
   useClock('正在使用主音轨原声。');return true;
  }
  if(active?.view.id===id&&(!forceExternal||active.level)){
   if(enableEffects){enhanced=true;worklet.port.postMessage({type:'bypass',value:false});updateGain();}
   onStatus('正在使用'+view.label+'音频。');emit();return true;
  }
  const track=getTrack(view,forceExternal),a=track.a;
  const request={track,controller:new AbortController(),heldClock:false};
  const {signal}=request.controller;pending=request;
  emit();
  try{
   if(track.level)ctx.resume().catch(()=>{});
   a.preload='auto';a.playbackRate=clock.playbackRate;
   if(!a.src||a.error){a.src=view.url;a.load();}
   const priming=a.readyState<1?startMedia(a):undefined;
   await waitMedia(a,1,signal,{playback:priming});
   signal.throwIfAborted();
   await alignCandidate(track,signal);
   signal.throwIfAborted();
   if(a.audioTracks?.length===0)throw Error('这路画面没有可播放的音轨。');

   if(enableEffects){
    onStatus('正在加载声音调整，当前声音继续播放…');
    await effects();
    signal.throwIfAborted();
   }
   // Warm the candidate without stopping the current playback. If a slow
   // range seek let the clock run ahead, hold it only for the final alignment.
   if(Math.abs(Math.max(0,targetTime(track))-a.currentTime)>.45){
    request.heldClock=!clockStopped();
    if(request.heldClock)clock.pause();
    a.pause();
    await alignCandidate(track,signal,4000);
    signal.throwIfAborted();
   }
   if(Math.abs(Math.max(0,targetTime(track))-a.currentTime)>.75)throw Error('这路音频暂时无法与画面对齐，请稍后重试。');
   if(clockStopped())a.pause();

   if(active&&active!==track)pauseTrack(active);
   active=track;pending=null;resetSync();
   enhanced=!!track.level&&(enhanced||enableEffects);
   worklet?.port.postMessage({type:'bypass',value:!enhanced});
   worklet?.port.postMessage({type:'reset'});
   if(track.level)ramp(track.level.gain,1,.015);
   applyOutput();
   onStatus('正在使用'+view.label+'音频'+(enhanced?' · 声音调整':' · 原声')+'。');
   emit();window.dispatchEvent(new Event('ce-audio-track'));
   releaseClock(request);
   sync();
   return true;
  }catch(error){
   if(signal.aborted||disposed)return false;
   if(track!==active)pauseTrack(track);
   pending=null;releaseClock(request);
   if(forceExternal&&!enableEffects&&(a.error||error.name==='NotSupportedError')){
    const selected=await select(id,{forceExternal:false});
    if(selected)onStatus('这路音频无法使用声音调整，正在播放原声。');
    return selected;
   }
   emit();
   throw error;
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
 async function setEnhanced(value){
  if(value){
   if(!enhanced)await select(undefined,{forceExternal:true,enableEffects:true});
   return;
  }
  enhanced=false;worklet?.port.postMessage({type:'bypass',value:true});
  if(active?.view.id===clockId&&active.level)useClock('已关闭声音调整，恢复主音轨原声。');
  else{updateGain();onStatus('已关闭声音调整，继续播放所选音轨原声。');emit();}
 }
 function seekActive(){
  if(!active||active.a.readyState<1)return;
  const time=targetTime(active),a=active.a;
  if(hasRecording(a,time)&&Math.abs(Math.max(0,time)-a.currentTime)>.08)a.currentTime=Math.max(0,time);
  a.playbackRate=clock.playbackRate;
  stalledAt=0;driftSince=0;previousTime=-1;lastProgressAt=0;recoverAfterBuffer=false;recoveryUsed=false;
 }
 function resume(){
  const track=active;
  if(!track||clockStopped()||!track.a.paused||pendingResume)return;
  const request=startMedia(track.a);
  pendingResume=request;
  request.then(error=>{
   if(disposed||active!==track||pendingResume!==request)return;
   pendingResume=null;
   if(!error){if(needsGesture){needsGesture=false;onStatus('已恢复所选音轨。');emit();}return;}
   if(error.name==='AbortError'||clockStopped())return;
   if(error.name==='NotAllowedError'){
    needsGesture=true;onStatus('点播放栏的“继续声音”恢复所选音轨。');emit();
   }else useClock('这路音频无法继续播放，已恢复主音轨。');
  });
 }
 function sync(){
  if(!active||disposed)return;
  const track=active,a=track.a;
  if(clockStopped()){a.pause();stalledAt=0;driftSince=0;previousTime=-1;lastProgressAt=0;return;}
  if(needsGesture)return;
  if(!hasRecording(a,targetTime(track))||a.ended){useClock('这路音频在当前进度没有录音，已恢复主音轨。');return;}
  if(a.paused)resume();

  const now=performance.now(),drift=Math.max(0,targetTime(track))-a.currentTime;
  if(a.currentTime!==previousTime){previousTime=a.currentTime;lastProgressAt=now;}
  if(a.readyState<3||a.seeking||a.paused||now-lastProgressAt>1000){
   stalledAt||=now;driftSince=0;recoverAfterBuffer=true;
   if(now-stalledAt>(a.seeking?8000:5000))useClock('这路音频长时间未能恢复缓冲，已恢复主音轨。');
   return;
  }
  stalledAt=0;
  if(recoverAfterBuffer){
   recoverAfterBuffer=false;
   if(Math.abs(drift)>.9&&!recoveryUsed){seekActive();recoveryUsed=true;return;}
  }
  if(Math.abs(drift)<.45)recoveryUsed=false;
  if(Math.abs(drift)>.9){
   driftSince||=now;
   if(now-driftSince>1500){useClock('这路音频持续不同步，已恢复主音轨。');return;}
  }else driftSince=0;
  const correction=Math.abs(drift)>.08?Math.max(-.025,Math.min(.025,drift*.08)):0;
  const rate=clock.playbackRate*(1+correction);
  if(Math.abs(a.playbackRate-rate)>.0001)a.playbackRate=rate;
 }
 for(const event of ['play','playing','seeked','ratechange'])listen(clock,event,()=>{
  if(event==='playing'||event==='seeked')buffering=false;
  if(event==='seeked')seekActive();
  if(event==='ratechange'&&active)active.a.playbackRate=clock.playbackRate;
  sync();
 });
 for(const event of ['pause','waiting','ended'])listen(clock,event,()=>{
  if(event==='waiting')buffering=true;
  if(active){active.a.pause();pendingResume=null;stalledAt=0;previousTime=-1;lastProgressAt=0;}
 });
 listen(clock,'seeking',()=>{worklet?.port.postMessage({type:'reset'});active?.a.pause();pendingResume=null;seekActive();window.dispatchEvent(new Event('ce-audio-seek'));});
 listen(clock,'volumechange',()=>{if(active&&!clock.muted)clock.muted=true;});
 const timer=setInterval(sync,500);
 return {state,select,resume,setEnhanced,update(values){tuning=normalizeAudio(values,tuning);worklet?.port.postMessage({type:'strength',value:tuning.strength});updateGain();},calibrate(){worklet?.port.postMessage({type:'calibrate'});},
  getMuted:()=>muted,getVolume:()=>volume,setMuted(value){muted=!!value;applyOutput();emit();},setVolume(value){volume=Math.max(0,Math.min(1,value));applyOutput();emit();},
  destroy(){
   disposed=true;cancelSelection();clearInterval(timer);clean.forEach(fn=>fn());
   for(const track of [...nativeTracks.values(),...effectTracks.values()]){track.a.pause();track.a.removeAttribute('src');track.a.load();}
   ctx?.close().catch(()=>{});clock.muted=muted;
  },
  getCapture(){if(!active?.level)throw Error('请先开启声音调整');return {ctx,bus,clock,baseOffset:base};}
 };
}
