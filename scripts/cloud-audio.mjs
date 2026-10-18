import {cloudCall} from './cloud-client.mjs';

export const MOSS_MODEL='moss-se16k-fp32-v1';
const HOP=5,CLIP=6;
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function silentWav(){const b=new ArrayBuffer(3244),v=new DataView(b),text=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));text(0,'RIFF');v.setUint32(4,b.byteLength-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,3200,true);return new Blob([b],{type:'audio/wav'});}

// Small native Audio elements retain pitch at 0.5–2x. No model runs on the device.
export function createCloudAudio({clock,ctx,output,views,clockId,readWindow,call=cloudCall,onAudible=()=>{},onStatus=()=>{},onState=()=>{},schedule=true}){
 let enabled=false,compared=false,audible=false,disposed=false,serial=0,trackId=clockId,phase='off',message='',flight=null,controller=null,loading=false,active=null,buffering=false,latency=0,slow=0;
 const cache=new Map(),clean=[],base=views.find(v=>v.id===clockId)?.offset||0;
 const view=()=>views.find(v=>v.id===trackId),mediaTime=()=>Math.max(0,clock.currentTime+base-(view()?.offset||0));
 const say=(p,text)=>{if(phase===p&&message===text)return;phase=p;message=text;onStatus(text);onState();};
 const ramp=(param,value,time=.025)=>param.setTargetAtTime(value,ctx.currentTime,time);
 const setAudible=value=>{if(active)ramp(active.level.gain,value?1:0);if(audible===value)return;audible=value;onAudible(value);onState();};
 const common=ctx.createGain();common.gain.value=4;let tail=common;const nodes=[common];
 for(const [type,freq,gain] of [['highpass',400,0],['lowpass',20000,0],['lowshelf',180,-12],['peaking',450,-12],['peaking',2200,-12],['highshelf',4500,-12]]){const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=freq;n.Q.value=.8;n.gain.value=gain;tail.connect(n);tail=n;nodes.push(n);}
 const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;tail.connect(limiter);limiter.connect(output);nodes.push(limiter);
 const silent=URL.createObjectURL(silentWav());
 const slots=Array.from({length:2},()=>{const a=new Audio();a.preload='auto';a.playsInline=true;a.preservesPitch=true;a.src=silent;a.loop=true;const source=ctx.createMediaElementSource(a),level=ctx.createGain();level.gain.value=0;source.connect(level);level.connect(common);return {a,source,level,clip:null};});
 function unlock(){return Promise.all(slots.map(s=>{if(!s.clip){s.a.src=silent;s.a.loop=true;}return s.a.play();}));}
 function ready(a){return new Promise((resolve,reject)=>{if(a.readyState>=2&&!a.seeking){resolve();return;}let settled=false;const done=e=>{if(settled)return;settled=true;clearTimeout(timer);for(const name of ['canplay','seeked','error'])a.removeEventListener(name,check);e?reject(e):resolve();};const check=()=>a.error?done(Error('降噪片段无法播放')):a.readyState>=2&&!a.seeking&&done();const timer=setTimeout(()=>done(Error('降噪片段未能及时播放')),10000);for(const name of ['canplay','seeked','error'])a.addEventListener(name,check);});}
 function clearCache(){for(const c of cache.values())URL.revokeObjectURL(c.url);cache.clear();}
 function reset(){serial++;controller?.abort();active=null;loading=false;setAudible(false);for(const s of slots){ramp(s.level.gain,0);s.a.pause();s.clip=null;s.a.removeAttribute('src');s.a.load();}clearCache();}
 function fail(error){if(disposed)return;enabled=false;reset();say('error',(error?.message||'云端降噪未完成')+'。已恢复所选音轨原声。');}
 function evict(){const time=mediaTime();for(const [key,c] of cache){if(c.end<time-.5&&!slots.some(s=>s.clip===c)){URL.revokeObjectURL(c.url);cache.delete(key);}}while(cache.size>8){const key=[...cache.keys()].find(k=>!slots.some(s=>s.clip===cache.get(k)));if(key===undefined)break;URL.revokeObjectURL(cache.get(key).url);cache.delete(key);}}
 async function produce(index,ticket){
  const currentView=view(),start=index*HOP,signal=controller.signal;
  const w=await readWindow(currentView.url,Math.max(0,start-1),start+CLIP+1,signal);if(ticket!==serial||disposed)return;
  const duration=Math.min(CLIP,w.sourceDuration-start);if(duration<.2)return;
  const bytes=new Uint8Array(await w.blob.arrayBuffer()),sha256=await digest(bytes),trimSeconds=start-w.start;
  if(ticket!==serial||disposed)return;
  const began=performance.now(),result=await call('init',{job:{mode:'moss-segment',model:MOSS_MODEL,data:base64(bytes),sha256,trimSeconds,duration}});
  if(ticket!==serial||disposed)return;
  const elapsed=(performance.now()-began)/1000;
  if(latency&&elapsed>HOP/clock.playbackRate*.95)slow++;else slow=0;latency=elapsed;
  if(slow>=2)throw Error('云端处理未跟上当前倍速，请降低倍速或稍后重试');
  if(result.protocol!=='ce-moss-segment/1'||result.model!==MOSS_MODEL||result.inputSha256!==sha256||result.trimSeconds!==trimSeconds||result.sampleRate!==16000||result.pcmScale!==4||!Number.isInteger(result.samples)||Math.abs(result.samples-duration*16000)>.51||typeof result.data!=='string'||result.data.length>300000)throw Error('降噪片段时间轴不匹配');
  const audio=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));if(audio.length!==44+2*result.samples||await digest(audio)!==result.sha256)throw Error('降噪片段校验失败');
  if(ticket!==serial||disposed)return;
  cache.set(index,{index,start,end:start+result.samples/16000,url:URL.createObjectURL(new Blob([audio],{type:'audio/wav'}))});evict();
 }
 async function activate(clip,ticket){
  loading=true;const slot=slots.find(s=>s!==active),a=slot.a;slot.clip=clip;ramp(slot.level.gain,0);a.loop=false;a.src=clip.url;a.load();
  try{
   await ready(a);if(ticket!==serial||!enabled||disposed||slot.clip!==clip)return;
   let target=mediaTime()-clip.start;if(target<0||target>=clip.end-clip.start-.1)return;
   a.playbackRate=clock.playbackRate;a.currentTime=target;await a.play();await ready(a);
   if(ticket!==serial||!enabled||disposed||slot.clip!==clip)return;
   target=mediaTime()-clip.start;if(target<0||target>=clip.end-clip.start-.1)return;
   if(Math.abs(target-a.currentTime)>.12){a.currentTime=target;await ready(a);}
   if(ticket!==serial||disposed)return;
   const old=active;active=slot;if(old&&old!==slot){ramp(old.level.gain,0);setTimeout(()=>{if(active!==old)old.a.pause();},150);}
   if(clock.paused||clock.seeking||buffering){a.pause();setAudible(false);}else{ramp(slot.level.gain,compared?0:1);setAudible(!compared);}
   say('playing',compared?'正在对比所选音轨原声；云端降噪已准备。':'正在使用我的首选 · Moss 云端降噪。响度可在公共控制栏调整。');
  }catch(e){if(ticket===serial)fail(e);}finally{if(ticket===serial)loading=false;}
 }
 function tick(){
  if(disposed||!enabled)return;
  if(clock.paused||clock.seeking||buffering){for(const s of slots)s.a.pause();setAudible(false);return;}
  const time=mediaTime();evict();
  const clips=[...cache.values()].filter(c=>c.start<=time&&c.end>time+.15).sort((a,b)=>b.start-a.start),clip=clips[0];
  if(clip&&active?.clip!==clip&&!loading)activate(clip,serial);
  if(active){const a=active.a,c=active.clip,target=time-c.start;
   if(target<0||target>=c.end-c.start-.1){ramp(active.level.gain,0);a.pause();active=null;setAudible(false);say('preparing','正在准备后续降噪片段，当前继续所选音轨原声…');}
   else{const drift=target-a.currentTime;if(Math.abs(drift)>.35&&!a.seeking)a.currentTime=target;a.playbackRate=clock.playbackRate*(1+(!a.seeking&&Math.abs(drift)>.08?Math.max(-.015,Math.min(.015,drift*.05)):0));if(a.paused)a.play().catch(fail);ramp(active.level.gain,compared?0:1);setAudible(!compared&&!a.seeking&&Math.abs(drift)<.2);}
  }
  if(flight||clock.ended)return;
  const duration=Number.isFinite(clock.duration)?clock.duration+base-(view().offset||0):14400;
  // After a cold start misses its first clip, aim ahead of measured latency.
  const ahead=!clip&&latency?Math.min(30,latency*clock.playbackRate+.5):0;
  const first=Math.floor((time+ahead)/HOP),last=Math.floor(Math.min(duration-.2,time+Math.min(30,15*clock.playbackRate))/HOP);
  let index=first;while(index<=last&&cache.has(index))index++;if(index>last)return;
  const ticket=serial;controller=new AbortController();flight=produce(index,ticket).catch(e=>{if(ticket===serial&&!disposed)fail(e);}).finally(()=>{flight=null;});
 }
 const listen=(target,event,fn)=>{target.addEventListener(event,fn);clean.push(()=>target.removeEventListener(event,fn));};
 listen(clock,'seeking',()=>{if(enabled){reset();latency=0;say('preparing','已快进，正在准备当前位置的降噪片段，原声继续…');}});
 listen(clock,'waiting',()=>{buffering=true;for(const s of slots)s.a.pause();setAudible(false);});
 listen(clock,'playing',()=>{buffering=false;tick();});listen(clock,'seeked',()=>{buffering=false;tick();});
 listen(clock,'pause',()=>{for(const s of slots)s.a.pause();setAudible(false);});
 listen(clock,'ratechange',()=>{slow=0;tick();});
 if(typeof document!=='undefined')listen(document,'visibilitychange',()=>{if(document.hidden&&enabled){enabled=false;reset();say('off','页面进入后台，已暂停云端降噪并恢复原声；回到页面可重新开启。');}});
 const timer=schedule?setInterval(tick,100):null;
 return {
  unlock,tick,state:()=>({enabled,audible,compared,phase,message,trackId,cached:cache.size,inflight:!!flight,clipStart:active?.clip?.start??null,processedTime:active?.a.currentTime??null,rate:active?.a.playbackRate??null}),
  async check(){return call('init',{job:{mode:'moss-health'}});},
  async enable(){const health=await this.check();if(disposed)return;if(!health.ready||health.model!==MOSS_MODEL)throw Error('云端 Moss 降噪尚未开通');enabled=true;compared=false;latency=0;slow=0;say('preparing','正在云端准备当前位置的降噪片段，原声继续播放…');tick();},
  disable(){enabled=false;reset();say('off','已关闭云端降噪，继续所选音轨原声。');},
  select(id){if(!views.some(v=>v.id===id)||trackId===id)return;trackId=id;if(!enabled)return;reset();latency=0;slow=0;say('preparing','音轨已切换，正在准备本路降噪，原声继续…');},
  compare(value){compared=!!value;if(active)ramp(active.level.gain,compared?0:1);setAudible(enabled&&!!active&&!compared&&!clock.paused);say(phase,compared?'正在对比所选音轨原声。':'已返回我的首选降噪。');},
  destroy(){if(disposed)return;enabled=false;reset();disposed=true;if(timer)clearInterval(timer);clean.forEach(fn=>fn());for(const s of slots){s.source.disconnect();s.level.disconnect();}nodes.forEach(n=>n.disconnect());URL.revokeObjectURL(silent);}
 };
}
