(() => {
'use strict';
if(document.getElementById('nwa-classroom-host'))return;
const WORKLET_SOURCE=__WORKLET_SOURCE__;
const TABLET=document.documentElement.dataset.ceTabletBridge==='1';
const KEY='nwa-classroom-enhancer-v1';
const defaults={size:28,x:50,y:84,opacity:65,color:'#ffffff',captions:true,gain:3,strength:.7};
let cfg={...defaults};try{cfg={...cfg,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
cfg.strength=Math.max(0,Math.min(2,Number(cfg.strength)||0));
let rootVideo=null,anchor=null,audioState=null,pending=false,epoch=0,lastRoute=location.hash,audioPreparation=null;
const host=document.createElement('div');host.id='nwa-classroom-host';
const shadow=host.attachShadow({mode:'open'});
shadow.innerHTML=`<style>
:host{position:fixed;inset:0;z-index:2147483600;pointer-events:none;font:14px system-ui,sans-serif;color:#fff}
*{box-sizing:border-box}button,input,select{font:inherit}button,input,select,label{pointer-events:auto}
button{background:#263044;color:white;border:1px solid #57657b;border-radius:9px;padding:8px 12px;cursor:pointer;touch-action:manipulation}
button:hover{background:#354663}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #83baff}
#open{position:absolute;right:14px;top:14px;background:#162a43;box-shadow:0 3px 18px #0005}
#panel{position:absolute;right:14px;top:60px;width:326px;max-width:calc(100vw - 28px);max-height:75vh;overflow:auto;pointer-events:auto;background:#121d2ff2;border:1px solid #526079;border-radius:14px;padding:16px;box-shadow:0 12px 48px #0008}
[hidden]{display:none!important}h3{font-size:16px;margin:0 0 12px}label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}input[type=range]{width:158px}input[type=color]{width:42px;height:28px}.row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.note{color:#bcc9dc;line-height:1.5;font-size:12px}#status{font-size:12px;line-height:1.5;margin-top:10px;color:#b9ddff}hr{border:0;border-top:1px solid #415068;margin:14px 0}
#caption{position:absolute;transform:translate(-50%,-50%);max-width:88%;width:max-content;white-space:pre-wrap;text-align:center;line-height:1.45;padding:.16em .45em;border-radius:.22em;text-shadow:0 1px 3px #000;font-weight:600;user-select:none;pointer-events:auto;touch-action:none;cursor:move;overflow-wrap:anywhere}
#caption:empty{display:none}
#ce-nav{display:flex;gap:6px;margin:10px 0 16px}#ce-nav button{flex:1;padding:9px 4px}#ce-nav button[aria-selected=true]{background:#315d82;border-color:#83baff}summary{cursor:pointer;padding:9px 0}#panel label{flex-wrap:wrap}#panel input[type=file]{max-width:100%}#panel small{font-size:12px;color:#bcc9dc}
${TABLET?'#open{top:auto;bottom:14px}#panel{top:auto;bottom:62px;width:420px;max-height:80dvh;max-height:80vh}#ct-lesson,#ct-metadata{display:none}':''}
</style>
<button id="open" aria-expanded="false">${TABLET?'课堂助手':'课堂增强'}</button>
<section id="panel" hidden><h3>${TABLET?'课堂助手':'Classroom Enhancer'} <small>${TABLET?'v'+(document.documentElement.dataset.ceAppVersion||'0.7.0'):''}</small></h3>
<nav id="ce-nav" ${TABLET?'':'hidden'}><button data-tab="ce-listen" aria-selected="true">听课</button><button data-tab="ce-library" aria-selected="false">课程与字幕</button><button data-tab="ce-settings" aria-selected="false">设置</button></nav>
<div id="ce-listen"><h3>清晰听课</h3>
<label>增益 <span id="gainVal"></span><input id="gain" type="range" min="0" max="15" step="1"></label>
<label>降噪强度<input id="strength" type="range" min="0" max="2" step="0.1"></label>
<div class="row"><button id="audio">${TABLET?'准备并启用音频增强':'启用音频增强'}</button><button id="noise" disabled>采样底噪 1.5 秒</button></div>
<p class="note">${TABLET?'首次需准备本节纯音轨，期间继续播放原声；准备后会缓存，字幕和增强共用。切换进度或倍速时跟随原播放器。':'先启用音频增强。'} 采样时应只有背景噪声，没有老师讲话。低强度更自然；无法恢复录音里没录清的词。</p>
<div id="status" role="status">等待视频与网站字幕。</div><hr><details ${TABLET?'':'open'}><summary>字幕与全屏设置</summary>
<label>显示字幕<input id="captions" type="checkbox"></label>
<label>字号 <span id="sizeVal"></span><input id="size" type="range" min="16" max="64" step="1"></label>
<label>水平位置<input id="x" type="range" min="10" max="90"></label>
<label>垂直位置<input id="y" type="range" min="10" max="92"></label>
<label>背景透明度<input id="opacity" type="range" min="0" max="100"></label>
<label>文字颜色<input id="color" type="color"></label>
<div class="row"><button id="fullscreen">带字幕全屏</button><button id="webfull">网页铺满</button><button id="reset">重置字幕</button></div>
<p class="note">字幕可直接拖动。iPad 请用上方“带字幕全屏”，避免系统原生视频全屏。字幕按所选来源显示，识别稿可能有错字。</p>
</details></div><div id="ce-library" hidden><div id="ce-courses"></div><details><summary>字幕来源与校对</summary><div id="ce-subtitles"></div></details></div>
<div id="ce-settings" hidden><h3>播放器</h3><button id="ce-player-reset">启用多视角播放器</button><p id="ce-player-message" class="note"></p><h3>字幕服务</h3><button id="ce-connect">连接或更换字幕服务</button><p id="ce-connection" class="note"></p><h3>自动更新</h3><p id="ce-update-status" class="note">重新打开页面时自动检查更新；播放期间保持当前版本。</p></div></section><div id="caption" aria-label="课堂字幕"></div>`;
const $=id=>shadow.getElementById(id);document.documentElement.append(host);
const css=document.createElement('style');css.textContent=`.nwa-stage{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;z-index:2147483500!important;background:#000!important;margin:0!important;padding:0!important;}.nwa-stage video{width:100%!important;height:100%!important;object-fit:contain!important}.nwa-stage .video-js{height:100%!important;width:100%!important;padding:0!important} .nwa-stage .other-frame{display:none!important}`;document.documentElement.append(css);
let stage=null;let captionDetected=false;
function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg))}catch{}}
function status(t){$('status').textContent=t;}
function paint(){const c=$('caption');c.style.fontSize=cfg.size+'px';c.style.color=cfg.color;c.style.background=`rgba(0,0,0,${1-cfg.opacity/100})`;c.hidden=!cfg.captions;$('sizeVal').textContent=cfg.size;$('gainVal').textContent=cfg.gain+' dB';position();}
for(const k of Object.keys(defaults)){const el=$(k);if(!el)continue;if(el.type==='checkbox')el.checked=cfg[k];else el.value=cfg[k];el.addEventListener('input',()=>{cfg[k]=el.type==='checkbox'?el.checked:el.type==='color'?el.value:Number(el.value);save();paint();if(audioState){audioState.gain.gain.setTargetAtTime(10**(cfg.gain/20),audioState.ctx.currentTime,.04);audioState.worklet?.port.postMessage({type:'strength',value:cfg.strength});}});}
function openTab(id){for(const name of ['ce-listen','ce-library','ce-settings'])$(name).hidden=name!==id;for(const button of shadow.querySelectorAll('#ce-nav button'))button.setAttribute('aria-selected',String(button.dataset.tab===id));}
for(const button of shadow.querySelectorAll('#ce-nav button'))button.onclick=()=>openTab(button.dataset.tab);
$('open').onclick=()=>{const p=$('panel');p.hidden=!p.hidden;if(TABLET&&!rootVideo)openTab('ce-library');$('open').setAttribute('aria-expanded',String(!p.hidden));};
$('ce-connect').onclick=()=>{const requestId=crypto.randomUUID();$('ce-connect').disabled=true;const timer=setTimeout(()=>done('连接操作超时，请重试'),65000);function done(message){clearTimeout(timer);window.removeEventListener('message',receive);$('ce-connect').disabled=false;$('ce-connection').textContent=message;}function receive(e){const d=e.data;if(e.source!==window||e.origin!==location.origin||d?.ce!=='cloud-response'||d.requestId!==requestId)return;done(d.ok?(d.data.configured?'字幕服务已连接':'尚未连接字幕服务'):d.error);}window.addEventListener('message',receive);window.postMessage({ce:'cloud-request',requestId,op:'connect'},location.origin);};
$('ce-player-reset').onclick=()=>{if(window.__CE_PLAYER__)window.__CE_PLAYER__.restore();else window.__CE_RETRY_PLAYER__?.();};
$('reset').onclick=()=>{for(const k of ['size','x','y','opacity','color']){cfg[k]=defaults[k];$(k).value=cfg[k]}save();paint();};
function chooseVideo(){const managed=window.__CE_PLAYER__?.getVideo();if(managed?.isConnected)return managed;const all=[...document.querySelectorAll('video')];return all.filter(v=>v.getBoundingClientRect().width>0).sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height})[0]||null;}
function position(){if(!rootVideo)return;const r=window.__CE_PLAYER__?.getRect()||rootVideo.getBoundingClientRect();$('caption').style.left=(r.left+r.width*cfg.x/100)+'px';$('caption').style.top=(r.top+r.height*cfg.y/100)+'px';$('caption').style.maxWidth=Math.max(0,r.width*.88)+'px';}
function refresh(){
  if(location.hash!==lastRoute){lastRoute=location.hash;stopAudio();exitStage();}
  const v=chooseVideo();rootVideo=v;host.style.display=v||TABLET?'block':'none';if(TABLET){$('ce-update-status').textContent=document.documentElement.dataset.ceUpdateStatus||'重新打开页面时自动检查更新；播放期间保持当前版本。';$('ce-player-reset').textContent=window.__CE_PLAYER__?'恢复学校播放器':'启用多视角播放器';$('ce-player-message').textContent=window.__CE_PLAYER__?'老师、教室、课件可切换或组合；共用同一进度与倍速。':document.documentElement.dataset.cePlayerMessage||'打开课次后自动接入多视角播放器。';if(!$('ce-connect').disabled)$('ce-connection').textContent=document.documentElement.dataset.ceCloudConfigured==='1'?'字幕服务已连接。':'字幕服务尚未连接；纯音轨增强可独立使用。';}if(!v){$('caption').textContent='';return;}
  anchor=window.__CE_PLAYER__?.container||v.closest('.video-js')||v.parentElement;
  const fs=document.fullscreenElement||document.webkitFullscreenElement;
  if(fs && fs.tagName!=='VIDEO'){if(host.parentElement!==fs)fs.append(host);}else if(!fs && host.parentElement!==document.documentElement)document.documentElement.append(host);
  const src=document.querySelector('.captions-right');const fallback=window.__CE_PLAYER__?window.__CE_PLAYER__.getCaption(v.currentTime):src?.textContent.trim()||'';const text=transcripts.text(v.currentTime,fallback);
  if($('caption').textContent!==text)$('caption').textContent=text;
  if(text&&!captionDetected){captionDetected=true;if(!audioState&&!pending)status('已找到网站字幕；音频增强未启用。');}
  position();
}
function exitStage(){if(stage){stage.classList.remove('nwa-stage');stage=null;}}
$('webfull').onclick=()=>{if(stage){exitStage();return}if(anchor){stage=anchor;stage.classList.add('nwa-stage');position();}};
$('fullscreen').onclick=async()=>{if(!anchor)return;try{if(document.fullscreenElement){await document.exitFullscreen();return;}const fn=anchor.requestFullscreen||anchor.webkitRequestFullscreen;if(!fn)throw Error();await fn.call(anchor);$('panel').hidden=true;}catch{stage=anchor;stage.classList.add('nwa-stage');status('此浏览器不能进入元素全屏，已改为网页铺满。');}position();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')exitStage()});
document.addEventListener('fullscreenchange',refresh);document.addEventListener('webkitfullscreenchange',refresh);
let dragging=false;
$('caption').onpointerdown=e=>{dragging=true;$('caption').setPointerCapture(e.pointerId);};
$('caption').onpointermove=e=>{if(!dragging||!rootVideo)return;const r=window.__CE_PLAYER__?.getRect()||rootVideo.getBoundingClientRect();cfg.x=Math.max(10,Math.min(90,(e.clientX-r.left)/r.width*100));cfg.y=Math.max(10,Math.min(92,(e.clientY-r.top)/r.height*100));$('x').value=cfg.x;$('y').value=cfg.y;paint();};
$('caption').onpointerup=()=>{dragging=false;save()};$('caption').onpointercancel=()=>{dragging=false;save()};
function waitMedia(a){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('音频加载超时')),12000);const ready=()=>done();const fail=()=>done(Error('音频服务器未允许跨域处理，或媒体加载失败'));function done(err){clearTimeout(timer);a.removeEventListener('canplay',ready);a.removeEventListener('error',fail);err?reject(err):resolve()}a.addEventListener('canplay',ready);a.addEventListener('error',fail);a.load();});}
__AUDIO_SYNC__
function stopAudio(message){epoch++;pending=false;audioPreparation?.abort();audioPreparation=null;const s=audioState;audioState=null;if(s){clearInterval(s.timer);clearTimeout(s.stallTimer);s.clean.forEach(f=>f());s.a.pause();s.a.removeAttribute('src');s.a.load();if(s.objectURL)URL.revokeObjectURL(s.objectURL);for(const [v,m]of s.mutes)if(v.isConnected)v.muted=m;s.ctx.close().catch(()=>{});} $('audio').textContent=TABLET?'准备并启用音频增强':'启用音频增强';$('audio').disabled=false;$('noise').disabled=true;if(message)status(message);window.dispatchEvent(new Event('ce-audio-state'));}
const soundVideo=()=>window.__CE_PLAYER__?.getVideo()||rootVideo;
window.__CE_AUDIO_CONTROL__={getMuted:()=>audioState?!!audioState.a.muted:!!soundVideo()?.muted,getVolume:()=>audioState?audioState.a.volume:soundVideo()?.volume??1,setMuted(value){if(audioState){audioState.a.muted=value;audioState.mutes.set(audioState.master,value);}else if(soundVideo())soundVideo().muted=value;window.dispatchEvent(new Event('ce-audio-state'));},setVolume(value){value=Math.max(0,Math.min(1,value));if(audioState)audioState.a.volume=value;if(soundVideo())soundVideo().volume=value;window.dispatchEvent(new Event('ce-audio-state'));}};
async function startAudio(){
 if(pending)return;const video=rootVideo;if(!video || !video.currentSrc){status('请先播放录像，再启用音频增强。');return;}
 if(video.readyState<2){status('原视频尚未载入；请等录像能正常播放后再启用。');return;}
 const videos=[...document.querySelectorAll('video')];const master=videos.find(v=>!v.muted&&v.volume>0)||video;
 const src=master.currentSrc;if(!src || !TABLET&&src.startsWith('blob:')){status('此视频源暂不支持安全的独立音频处理，继续使用原声。');return;}
 pending=true;const ticket=++epoch;$('audio').disabled=!TABLET;$('audio').textContent=TABLET?'取消准备 · 保留原声':'正在接入…';status('正在检查音频接入；原声继续播放…');
 let ctx,a,objectURL,preparation;try{
   ctx=new (window.AudioContext||window.webkitAudioContext)();a=new Audio();a.preload='auto';
   if(TABLET){const bytes=new Uint8Array(204),v=new DataView(bytes.buffer);for(const [at,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']])for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);v.setUint32(4,196,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,160,true);a.src='data:audio/wav;base64,'+btoa(String.fromCharCode(...bytes));a.volume=0;a.play().catch(()=>{});}
   await ctx.resume();
   if(TABLET){const id=new URLSearchParams(location.hash.split('?')[1]||'').get('id');if(typeof window.__CE_AUDIO_PREPARE__!=='function')throw Error('课堂音轨服务尚未就绪，请刷新页面');audioPreparation=preparation=new AbortController();const blob=await window.__CE_AUDIO_PREPARE__(id,{signal:preparation.signal,onProgress:text=>{if(ticket===epoch)status(text);}});if(audioPreparation===preparation)audioPreparation=null;if(ticket!==epoch){a.pause();await ctx.close();return;}objectURL=URL.createObjectURL(blob);a.pause();a.src=objectURL;}
   else{a.crossOrigin='anonymous';a.src=src;}
   await waitMedia(a);if(ticket!==epoch){a.removeAttribute('src');a.load();if(objectURL)URL.revokeObjectURL(objectURL);await ctx.close();return;}
   const source=ctx.createMediaElementSource(a),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),gain=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
   hp.type='highpass';hp.frequency.value=100;lp.type='lowpass';lp.frequency.value=6500;presence.type='peaking';presence.frequency.value=2200;presence.Q.value=.8;presence.gain.value=2;
   gain.gain.value=10**(cfg.gain/20);limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;
   source.connect(hp);hp.connect(lp);let tail=lp,worklet=null;
   if(ctx.audioWorklet){let u;try{u=typeof chrome!=='undefined'&&chrome.runtime?.id?chrome.runtime.getURL('denoise-worklet.js'):URL.createObjectURL(new Blob([WORKLET_SOURCE],{type:'text/javascript'}));await ctx.audioWorklet.addModule(u);worklet=new AudioWorkletNode(ctx,'classroom-denoise');tail.connect(worklet);tail=worklet;worklet.port.postMessage({type:'strength',value:cfg.strength});worklet.port.onmessage=({data})=>{if(data.type==='calibrated')status('底噪采样完成，频谱降噪已开启。可降低强度减少失真。');};}catch{}finally{if(u?.startsWith('blob:'))URL.revokeObjectURL(u);}}
   tail.connect(presence);presence.connect(gain);gain.connect(limiter);limiter.connect(ctx.destination);
   a.currentTime=master.currentTime;a.playbackRate=master.playbackRate;a.volume=master.volume;a.preservesPitch=true;
   if(ticket!==epoch){a.pause();a.removeAttribute('src');a.load();if(objectURL)URL.revokeObjectURL(objectURL);await ctx.close();return;}
   const mutes=new Map(videos.map(v=>[v,v.muted]));const clean=[];
   const s={a,ctx,gain,worklet,mutes,clean,master,src,objectURL,timer:null,stallTimer:null,lastSeek:0};audioState=s;
   const on=(e,f)=>{master.addEventListener(e,f);clean.push(()=>master.removeEventListener(e,f));};
   const sync=(force=false)=>{if(audioState!==s)return;if(!master.isConnected||master.currentSrc!==src){stopAudio('录像已切换，已恢复原声；请重新启用增强。');return;}if(a.seeking&&!force)return;const now=performance.now(),plan=planAudioSync(master.currentTime,a.currentTime,master.playbackRate,now,s.lastSeek,force);if(plan.seek!==null){a.currentTime=plan.seek;s.lastSeek=now;}a.playbackRate=plan.rate;};
   const play=()=>{if(audioState!==s||master.paused||master.seeking)return;sync();a.play().catch(()=>stopAudio('纯音轨已准备好。浏览器阻止了播放，请再点一次启用音频增强。'));};
   on('seeking',()=>{a.pause();sync(true);});on('seeked',play);on('ratechange',()=>sync());on('pause',()=>a.pause());on('waiting',()=>a.pause());on('ended',()=>a.pause());on('playing',play);
   const watchStall=()=>{clearTimeout(s.stallTimer);s.stallTimer=setTimeout(()=>{if(audioState===s&&!master.paused&&!master.seeking&&a.readyState<3)stopAudio('增强音轨未能连续播放，已自动恢复原声。纯音轨缓存仍保留，可稍后重试。');},1800);};
   a.addEventListener('waiting',watchStall);a.addEventListener('stalled',watchStall);const clearStall=()=>clearTimeout(s.stallTimer);a.addEventListener('playing',clearStall);clean.push(()=>{a.removeEventListener('waiting',watchStall);a.removeEventListener('stalled',watchStall);a.removeEventListener('playing',clearStall);});
   if(worklet)worklet.onprocessorerror=()=>stopAudio('降噪计算未能跟上播放，已自动恢复原声。');
   if(!master.paused){a.volume=0;await a.play();}if(ticket!==epoch)throw Error('已取消音频增强');
   for(const [v]of mutes){const volumeChange=()=>{if(audioState!==s)return;if(v===master)a.volume=v.volume;if(!v.muted){stopAudio('检测到原播放器音量/声道切换，已恢复原声。');}};v.muted=true;setTimeout(()=>{if(audioState===s){v.addEventListener('volumechange',volumeChange);clean.push(()=>v.removeEventListener('volumechange',volumeChange));}},0);}
   a.addEventListener('error',()=>stopAudio('增强音轨加载失败，已恢复原声。'),{once:true});
   a.volume=master.volume;s.timer=setInterval(()=>{if(!master.paused&&!master.seeking)sync();},750);pending=false;$('audio').disabled=false;$('audio').textContent='恢复原声';$('noise').disabled=!worklet;window.dispatchEvent(new Event('ce-audio-state'));
   status(worklet?'人声滤波与增益已开启。请在无讲话片段采样底噪，启用频谱降噪。':'人声滤波与增益已开启；浏览器限制了频谱处理，降噪采样不可用。');
 }catch(e){if(ticket!==epoch){a?.pause();if(objectURL)URL.revokeObjectURL(objectURL);ctx?.close().catch(()=>{});return;}if(audioState)stopAudio();else{a?.pause();if(a){a.removeAttribute('src');a.load()}if(objectURL)URL.revokeObjectURL(objectURL);ctx?.close().catch(()=>{});}pending=false;audioPreparation=null;$('audio').disabled=false;$('audio').textContent=TABLET?'准备并启用音频增强':'启用音频增强';status((e.message||'音频处理不可用')+'。原视频与原声保留。');}
}
$('audio').onclick=()=>audioState||pending?stopAudio('已恢复原声。'):startAudio();
$('noise').onclick=()=>{audioState?.worklet?.port.postMessage({type:'calibrate'});status('采样中 1.5 秒：此时应只有底噪，没有老师讲话。');};
window.addEventListener('pagehide',()=>stopAudio());window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
window.addEventListener('ce-player-changing',()=>{if(audioState||pending)stopAudio('播放器已切换，已恢复原声；缓存保留，可重新启用音频增强。');});
__TRANSCRIPT_MODULE__
const transcripts=installTranscript(shadow,()=>rootVideo);
__LEARNING_MODULE__
if(!TABLET)installLearning(shadow,()=>rootVideo,transcripts);
setInterval(refresh,180);refresh();paint();
})();
