import {CaptionQueue} from './local-caption-queue.mjs';
// The render thread only downsamples/copies PCM. Inference never runs here.
const captureSource=`class CaptionCapture extends AudioWorkletProcessor{
 constructor(){super();this.sum=0;this.count=0;this.phase=0;this.block=new Float32Array(8000);this.pos=0;}
 process(inputs,outputs){const input=inputs[0];if(!input?.length)return true;for(let i=0;i<input[0].length;i++){let x=0;for(const c of input)x+=c[i]||0;this.sum+=x/input.length;this.count++;this.phase+=16000;if(this.phase>=sampleRate){this.phase-=sampleRate;this.block[this.pos++]=this.sum/this.count;this.sum=0;this.count=0;if(this.pos===8000){this.port.postMessage(this.block,[this.block.buffer]);this.block=new Float32Array(8000);this.pos=0;}}}return true;}}
registerProcessor('classroom-caption-capture',CaptionCapture);`;
export function installLocalCaption({workerSource,libraryURL,wasmBase}){
 const shadow=document.getElementById('nwa-classroom-host')?.shadowRoot;if(!shadow)return;
 const button=shadow.getElementById('ce-local-caption'),status=shadow.getElementById('ce-local-status');if(!button)return;
 let enabled=false,worker=null,capture=null,silent=null,connection=null,initializing=false,ready=false,epoch=0,lastText='',lastAt=-Infinity,timeout=null,sequence=0,inflight=null,timer=null;
 const queue=new CaptionQueue(),captureModules=new WeakMap();
 const say=text=>status.textContent=text;
 function reset(){epoch++;queue.reset();lastText='';lastAt=-Infinity;}
 function stop(message='本机字幕已关闭。降噪、播放和下载可继续使用。'){enabled=false;epoch++;capture?.disconnect();if(connection&&capture)try{connection.bus.disconnect(capture);}catch{}silent?.disconnect();capture=null;silent=null;connection=null;worker?.terminate();worker=null;clearTimeout(timeout);clearInterval(timer);timeout=null;timer=null;ready=false;initializing=false;inflight=null;queue.reset();lastText='';button.textContent='开启本机字幕';say(message);}
 function dispatch(){if(!enabled||!ready||inflight||!worker)return;const job=queue.take();if(!job)return;inflight={id:++sequence,epoch,end:job.end};worker.postMessage({type:'transcribe',id:inflight.id,audio:job.audio},[job.audio.buffer]);say('正在本机识别最近一小段…');clearTimeout(timeout);timeout=setTimeout(()=>stop('本机识别耗时过长，已停止字幕以保留流畅播放；可重新开启。'),90000);}
 async function start(){
  enabled=true;initializing=true;button.textContent='关闭本机字幕';say('正在准备本机字幕：首次需下载模型，之后会自动复用浏览器缓存。');const ticket=++epoch;
  try{const bank=window.__CE_LIVE_AUDIO__;if(!bank)throw Error('请先打开具体课次并等待播放器就绪');if(!bank.state().started)await bank.select(bank.state().activeId);if(!enabled||ticket!==epoch)return;
   connection=bank.getCapture();const {ctx,bus,clock}=connection;if(!captureModules.has(ctx)){const loading=(async()=>{const url=URL.createObjectURL(new Blob([captureSource],{type:'text/javascript'}));try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}})();captureModules.set(ctx,loading);loading.catch(()=>captureModules.delete(ctx));}await captureModules.get(ctx);if(!enabled||ticket!==epoch)return;
   capture=new AudioWorkletNode(ctx,'classroom-caption-capture');silent=ctx.createGain();silent.gain.value=0;bus.connect(capture);capture.connect(silent);silent.connect(ctx.destination);
   capture.port.onmessage=({data})=>{if(!enabled||!ready||clock.paused||clock.seeking)return;queue.push(data,clock.currentTime,clock.playbackRate);dispatch();};
   const workerURL=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{worker=new Worker(workerURL,{type:'module'});}finally{URL.revokeObjectURL(workerURL);}
   worker.onerror=()=>stop('本机字幕模块加载失败。请检查网络后重新开启；播放与降噪不受影响。');
   worker.onmessage=({data:d})=>{if(!enabled)return;if(d.type==='progress'){say('准备本机识别 '+(d.file||'')+' '+d.progress+'%'+(d.loaded?'（'+(d.loaded/1048576).toFixed(1)+' MB）':'')+' · 音视频可继续播放');return;}if(d.type==='notice'){say(d.message);return;}if(d.type==='ready'){ready=true;initializing=false;clearTimeout(timeout);say('本机字幕已就绪（'+(d.device==='webgpu'?'GPU 加速':'CPU')+'），播放后约每 6 秒识别一段。');return;}if(d.type==='error'){stop('本机字幕暂不可用：'+d.message);return;}if(d.type==='result'&&inflight?.id===d.id){clearTimeout(timeout);if(inflight.epoch===epoch&&d.text){lastText=d.text;lastAt=clock.currentTime;say('本机识别 '+d.seconds.toFixed(1)+' 秒 · 字幕可能有错字'+(d.seconds>6?'；当前速度跟不上播放，可降低倍速。':'。'));}else if(inflight.epoch===epoch){lastText='';say('这一小段未识别清楚，继续聆听下一段…');}inflight=null;dispatch();}};
   worker.postMessage({type:'init',libraryURL,wasmBase});timeout=setTimeout(()=>stop('首次模型准备超过 10 分钟，已停止。已下载的缓存会尽量保留，可稍后重试。'),600000);
   timer=setInterval(()=>{if(connection&&(!clock.isConnected||window.__CE_LIVE_AUDIO__!==bank))stop('课次已切换，请在新课次重新开启本机字幕。');},500);
  }catch(e){if(enabled&&ticket===epoch)stop('本机字幕暂不可用：'+e.message);}
 }
 const api={get enabled(){return enabled;},get initializing(){return initializing;},toggle(){if(enabled)stop();else start();},stop,text(time){return enabled&&time>=lastAt-.5&&time-lastAt<15?lastText:'';}};window.__CE_LOCAL_CAPTION__=api;
 for(const event of ['ce-audio-seek','ce-audio-track'])window.addEventListener(event,()=>{if(enabled&&!initializing)reset();});
 window.addEventListener('ce-player-changing',()=>{if(enabled)stop('课次已切换，本机字幕已停止。');});window.addEventListener('pagehide',()=>stop());return api;
}
