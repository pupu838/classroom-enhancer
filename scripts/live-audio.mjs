// Native media streaming, independent of the download/remux pipeline.
// A fixed video remains the clock. Changing audio never changes that video.
import {audioDefaults,normalizeAudio} from './audio-tuning.mjs';
import {createCloudAudio} from './cloud-audio.mjs';
export function createLiveAudio({clock,views,clockId,workletSource,onStatus=()=>{}}){
 let ctx,bus,dry,wet,output,worklet,boost,tap,meter,cloud,cloudActive=false,active=null,wanted=clockId,enhanced=false,disposed=false,serial=0,preparing=null;
 let volume=clock.volume,muted=clock.muted,started=false,lastSeek=0,buffering=false,stalledAt=0,previousTime=-1,tuning={...audioDefaults},filters=null;
 const tracks=new Map(),clean=[],initialMute=clock.muted,base=views.find(v=>v.id===clockId)?.offset||0;
 const emit=()=>window.dispatchEvent(new Event('ce-audio-state'));
 const listen=(target,event,fn)=>{target.addEventListener(event,fn);clean.push(()=>target.removeEventListener(event,fn));};
 const targetTime=track=>Math.max(0,clock.currentTime+base-(track.view.offset||0));
 const ramp=(param,value,time=.03)=>param.setTargetAtTime(value,ctx.currentTime,time);
 function state(){return {activeId:active?.view.id||clockId,wantedId:wanted,started,enhanced,cloud:cloud?.state()||null,tuning:{...tuning},worklet:!!worklet,neural:!!worklet?.neural,volume,muted,ctx,analyser:tap,outputAnalyser:meter,media:active?{time:active.a.currentTime,paused:active.a.paused,rate:active.a.playbackRate,ready:active.a.readyState}:null};}
 function updateGain(){if(!ctx)return;ramp(output.gain,muted?0:volume);ramp(dry.gain,enhanced||cloudActive?0:1);ramp(wet.gain,enhanced?1:0);if(boost)ramp(boost.gain,10**(tuning.gain/20));if(filters){ramp(filters.hp.frequency,tuning.highpass);ramp(filters.lp.frequency,tuning.lowpass);for(const k of ['bass','body','presence','treble'])ramp(filters[k].gain,tuning[k]);ramp(filters.limiter.threshold,tuning.ceiling);}}
 function init(){
  if(ctx)return;
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});bus=ctx.createGain();dry=ctx.createGain();wet=ctx.createGain();output=ctx.createGain();tap=ctx.createAnalyser();tap.fftSize=2048;
  dry.gain.value=1;wet.gain.value=0;output.gain.value=muted?0:volume;meter=ctx.createAnalyser();meter.fftSize=2048;
  bus.connect(tap);bus.connect(dry);dry.connect(output);output.connect(meter);meter.connect(ctx.destination);
  // Create all three elements inside the initiating gesture; metadata is cheap,
  // and only the selected track is played until a switch is requested.
  for(const view of views){const a=new Audio();a.crossOrigin='anonymous';a.preload='metadata';a.playsInline=true;a.src=view.url;a.preservesPitch=true;
   const source=ctx.createMediaElementSource(a),level=ctx.createGain();level.gain.value=0;source.connect(level);level.connect(bus);
   const track={view,a,source,level};tracks.set(view.id,track);
   listen(a,'error',()=>{if(active===track)fallback('这路音频加载失败，已恢复学校原声。');});
  }
  if(typeof window.__CE_AUDIO_WINDOW__==='function')cloud=createCloudAudio({clock,ctx,output,views,clockId,readWindow:(...args)=>window.__CE_AUDIO_WINDOW__(...args),onAudible:value=>{cloudActive=value;updateGain();},onStatus:message=>window.dispatchEvent(new CustomEvent('ce-cloud-audio-status',{detail:message})),onState:emit});
 }
 function ready(a){return new Promise((resolve,reject)=>{if(a.readyState>=2&&!a.seeking){resolve();return;}const timer=setTimeout(()=>done(Error('所选音轨仍在缓冲，当前声音继续播放，请稍后重试')),20000);function done(e){clearTimeout(timer);for(const name of ['canplay','seeked'])a.removeEventListener(name,check);a.removeEventListener('error',fail);e?reject(e):resolve();}function check(){if(a.readyState>=2&&!a.seeking)done();}function fail(){done(Error('学校媒体暂不允许这路音轨在浏览器处理'));}for(const name of ['canplay','seeked'])a.addEventListener(name,check);a.addEventListener('error',fail);});}
 function align(track,force=false){const a=track.a,target=targetTime(track),drift=target-a.currentTime,now=performance.now();if(!a.seeking&&(force||Math.abs(drift)>.8&&now-lastSeek>2500)&&Math.abs(drift)>.05){a.currentTime=target;lastSeek=now;a.playbackRate=clock.playbackRate;return;}a.playbackRate=clock.playbackRate*(1+(!a.seeking&&Math.abs(drift)>.1?Math.max(-.015,Math.min(.015,drift*.05)):0));}
 function fallback(message){if(disposed)return;serial++;cloud?.disable();started=false;enhanced=false;worklet?.port.postMessage({type:'bypass',value:true});for(const t of tracks.values()){t.level.gain.value=0;t.a.pause();}active=null;clock.muted=muted;clock.volume=volume;onStatus(message);emit();}
 async function select(id=wanted){
  if(disposed)throw Error('播放器已关闭');if(!views.some(v=>v.id===id))throw Error('没有这路音频');wanted=id;const ticket=++serial;init();const track=tracks.get(id),a=track.a;
  ctx.resume().catch(()=>{});if(a.readyState<2){a.preload='auto';a.load();} // Keep activation before the first await.
  const playing=!clock.paused;const play=playing||active!==track?a.play():null;play?.catch(()=>{});
  try{await ready(a);if(ticket!==serial||disposed)return;const began=performance.now();align(track,true);await ready(a);
   // Seeking a remote MP4 takes time while the clock continues. Predict that
   // latency once before fading in, instead of introducing a permanent lag.
   const delay=Math.min(.6,(performance.now()-began)/1000);if(!clock.paused&&Math.abs(targetTime(track)-a.currentTime)>.15){a.currentTime=targetTime(track)+delay*clock.playbackRate;await ready(a);}
   if(!clock.paused)await a.play();else a.pause();if(ticket!==serial||disposed)return;
   // The previous track stays audible while the target buffers. Crossfade only
   // after the target is aligned and playable; keep the canonical clock intact.
   const old=active;if(old!==track)worklet?.port.postMessage({type:'reset'});active=track;cloud?.select(id);previousTime=-1;stalledAt=0;started=true;clock.muted=true;updateGain();ramp(track.level.gain,1,.015);
   if(old&&old!==track){ramp(old.level.gain,0,.015);setTimeout(()=>{if(active!==old)old.a.pause();},150);}
   onStatus('正在使用'+track.view.label+'音频'+(enhanced?' · 浏览器人声增强':' · 原声')+'。切换音频保留播放进度。');emit();window.dispatchEvent(new Event('ce-audio-track'));
  }catch(e){if(ticket!==serial||disposed)return;if(track!==active)track.a.pause();wanted=active?.view.id||clockId;emit();throw e;}
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
 async function setEnhanced(value){if(!value){enhanced=false;worklet?.port.postMessage({type:'bypass',value:true});updateGain();onStatus('已关闭降噪，继续播放所选音轨原声。');emit();return;}cloud?.disable();if(!started)await select(wanted);if(!worklet)onStatus('正在加载小型降噪模块，当前音轨原声继续播放…');await effects();if(disposed)return;enhanced=true;worklet?.port.postMessage({type:'bypass',value:false});updateGain();onStatus(worklet?.neural?'已开启 RNNoise 降噪试验；不保证提高课堂人声清晰度，可随时关闭对比原声。':'浏览器人声增强已开启，可在无人讲话时采样底噪。');emit();}
 async function setCloudEnhanced(value){if(!value){cloud?.disable();return;}init();if(!cloud)throw Error('分段音轨入口尚未就绪，请刷新课次');const unlocked=cloud.unlock();unlocked.catch(()=>{});ctx.resume().catch(()=>{});enhanced=false;worklet?.port.postMessage({type:'bypass',value:true});updateGain();try{if(!started)await select(wanted);await unlocked;if(disposed)return;await cloud.enable();}catch(e){cloud.disable();throw e;}}
 function sync(force=false){if(!started||!active||disposed)return;align(active,force);if(clock.paused||clock.seeking||buffering){active.a.pause();stalledAt=0;return;}if(active.a.paused)active.a.play().catch(()=>fallback('浏览器暂停了音频，请重新选择这路音频继续。'));const now=performance.now();if(!active.a.seeking&&active.a.currentTime===previousTime){if(!stalledAt)stalledAt=now;else if(now-stalledAt>3500)fallback('所选音轨缓冲停顿，已恢复学校主音轨原声；可稍后切换重试。');}else stalledAt=0;previousTime=active.a.currentTime;}
 for(const event of ['play','playing','seeked','ratechange'])listen(clock,event,()=>{if(event==='playing'||event==='seeked')buffering=false;sync(event==='seeked');});
 for(const event of ['pause','waiting','ended'])listen(clock,event,()=>{if(event==='waiting')buffering=true;if(active)active.a.pause();});
 listen(clock,'seeking',()=>{worklet?.port.postMessage({type:'reset'});if(active){active.a.pause();align(active,true);}window.dispatchEvent(new Event('ce-audio-seek'));});
 listen(clock,'volumechange',()=>{if(started&&!clock.muted)clock.muted=true;});
 const timer=setInterval(()=>sync(),500);
 return {state,select,setEnhanced,setCloudEnhanced,compareCloud(value){cloud?.compare(value);},update(values){tuning=normalizeAudio(values,tuning);worklet?.port.postMessage({type:'strength',value:tuning.strength});updateGain();},calibrate(){if(worklet)worklet.port.postMessage({type:'calibrate'});},getMuted:()=>muted,getVolume:()=>volume,setMuted(value){muted=!!value;if(started)updateGain();else clock.muted=muted;emit();},setVolume(value){volume=Math.max(0,Math.min(1,value));if(started)updateGain();else clock.volume=volume;emit();},destroy(){disposed=true;serial++;cloud?.destroy();clearInterval(timer);clean.forEach(fn=>fn());for(const t of tracks.values()){t.a.pause();t.a.removeAttribute('src');t.a.load();}ctx?.close().catch(()=>{});clock.muted=started?muted:initialMute;},getCapture(){if(!started)throw Error('请先选择一路音频');return {ctx,bus,clock,baseOffset:base};}};
}
