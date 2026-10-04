// ==UserScript==
// @name         西农云课堂增强
// @namespace    local.nwa.classroom
// @version      0.1.0
// @description  全屏可调字幕、本地人声增强和底噪采样降噪；仅学校云课堂生效
// @match        https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
'use strict';
if(document.getElementById('nwa-classroom-host'))return;
const WORKLET_SOURCE="// Local STFT spectral subtraction. No network, model, microphone, or telemetry.\nclass ClassroomDenoise extends AudioWorkletProcessor {\n  constructor() {\n    super(); this.n=1024; this.h=512; this.pos=0; this.strength=1.2;\n    this.input=new Float32Array(512); this.previous=new Float32Array(512);\n    this.output=new Float32Array(512); this.tail=new Float32Array(512);\n    this.noise=null; this.sum=new Float64Array(1024); this.cal=0; this.count=0;\n    this.port.onmessage=({data:d})=>{\n      if(d.type==='strength') this.strength=d.value;\n      if(d.type==='calibrate'){this.sum.fill(0);this.count=0;this.cal=Math.ceil(sampleRate*1.5/512);}\n    };\n  }\n  fft(re,im,inverse=false) {\n    const n=re.length;\n    for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}\n    for(let len=2;len<=n;len<<=1){const a=(inverse?2:-2)*Math.PI/len;for(let i=0;i<n;i+=len){for(let j=0;j<len/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=i+j,q=k+len/2;const tr=c*re[q]-s*im[q],ti=s*re[q]+c*im[q];re[q]=re[k]-tr;im[q]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}}\n    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}\n  }\n  frame(){\n    const re=new Float64Array(1024),im=new Float64Array(1024);\n    for(let i=0;i<1024;i++)re[i]=(i<512?this.previous[i]:this.input[i-512])*Math.sin(Math.PI*i/1024);\n    this.previous.set(this.input);this.fft(re,im);\n    if(this.cal>0){for(let i=0;i<1024;i++)this.sum[i]+=re[i]*re[i]+im[i]*im[i];this.count++;if(--this.cal===0){this.noise=Float64Array.from(this.sum,x=>x/this.count);this.port.postMessage({type:'calibrated'});}}\n    if(this.noise && this.cal===0) for(let i=0;i<1024;i++){const p=re[i]*re[i]+im[i]*im[i];const g=Math.sqrt(Math.max(.015,1-this.strength*this.noise[i]/(p+1e-12)));re[i]*=g;im[i]*=g;}\n    this.fft(re,im,true);\n    for(let i=0;i<512;i++){this.output[i]=this.tail[i]+re[i]*Math.sin(Math.PI*i/1024);this.tail[i]=re[i+512]*Math.sin(Math.PI*(i+512)/1024);}\n  }\n  process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out.length)return true;for(let i=0;i<out[0].length;i++){let x=0;if(input.length){for(const ch of input)x+=ch[i]||0;x/=input.length;}this.input[this.pos]=x;const y=this.output[this.pos];for(const ch of out)ch[i]=y;if(++this.pos===512){this.pos=0;this.frame();}}return true;}\n}\nregisterProcessor('classroom-denoise',ClassroomDenoise);\n";
const KEY='nwa-classroom-enhancer-v1';
const defaults={size:28,x:50,y:84,opacity:65,color:'#ffffff',captions:true,gain:6,strength:1.2};
let cfg={...defaults};try{cfg={...cfg,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
let rootVideo=null,anchor=null,audioState=null,pending=false,epoch=0,lastRoute=location.hash;
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
</style>
<button id="open" aria-expanded="false">课堂增强</button>
<section id="panel" hidden><h3>云课堂增强 · 试用版</h3>
<label>显示字幕<input id="captions" type="checkbox"></label>
<label>字号 <span id="sizeVal"></span><input id="size" type="range" min="16" max="64" step="1"></label>
<label>水平位置<input id="x" type="range" min="10" max="90"></label>
<label>垂直位置<input id="y" type="range" min="10" max="92"></label>
<label>背景透明度<input id="opacity" type="range" min="0" max="100"></label>
<label>文字颜色<input id="color" type="color"></label>
<div class="row"><button id="fullscreen">带字幕全屏</button><button id="webfull">网页铺满</button><button id="reset">重置字幕</button></div>
<p class="note">字幕可直接拖动。iPad 请用上方“带字幕全屏”，避免系统原生视频全屏。字幕文字沿用学校转写，可能有错字。</p>
<hr><h3>人声增强与底噪抑制</h3>
<label>增益 <span id="gainVal"></span><input id="gain" type="range" min="0" max="15" step="1"></label>
<label>降噪强度<input id="strength" type="range" min="0" max="3" step="0.1"></label>
<div class="row"><button id="audio">启用音频增强</button><button id="noise" disabled>采样底噪 1.5 秒</button></div>
<p class="note">先启用，再在老师不说话、只有背景噪声时采样。低强度更自然；不能消除所有聊天声或恢复没录清的词。处理在本机进行，需额外加载一条音轨。</p>
<div id="status" role="status">等待视频与网站字幕。</div></section><div id="caption" aria-label="课堂字幕"></div>`;
const $=id=>shadow.getElementById(id);document.documentElement.append(host);
const css=document.createElement('style');css.textContent=`.nwa-stage{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;z-index:2147483500!important;background:#000!important;margin:0!important;padding:0!important;}.nwa-stage video{width:100%!important;height:100%!important;object-fit:contain!important}.nwa-stage .video-js{height:100%!important;width:100%!important;padding:0!important} .nwa-stage .other-frame{display:none!important}`;document.documentElement.append(css);
let stage=null;let captionDetected=false;
function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg))}catch{}}
function status(t){$('status').textContent=t;}
function paint(){const c=$('caption');c.style.fontSize=cfg.size+'px';c.style.color=cfg.color;c.style.background=`rgba(0,0,0,${1-cfg.opacity/100})`;c.hidden=!cfg.captions;$('sizeVal').textContent=cfg.size;$('gainVal').textContent=cfg.gain+' dB';position();}
for(const k of Object.keys(defaults)){const el=$(k);if(!el)continue;if(el.type==='checkbox')el.checked=cfg[k];else el.value=cfg[k];el.addEventListener('input',()=>{cfg[k]=el.type==='checkbox'?el.checked:el.type==='color'?el.value:Number(el.value);save();paint();if(audioState){audioState.gain.gain.setTargetAtTime(10**(cfg.gain/20),audioState.ctx.currentTime,.04);audioState.worklet?.port.postMessage({type:'strength',value:cfg.strength});}});}
$('open').onclick=()=>{const p=$('panel');p.hidden=!p.hidden;$('open').setAttribute('aria-expanded',String(!p.hidden));};
$('reset').onclick=()=>{for(const k of ['size','x','y','opacity','color']){cfg[k]=defaults[k];$(k).value=cfg[k]}save();paint();};
function chooseVideo(){const all=[...document.querySelectorAll('video')];return all.filter(v=>v.getBoundingClientRect().width>0).sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height})[0]||null;}
function position(){if(!rootVideo)return;const r=rootVideo.getBoundingClientRect();$('caption').style.left=(r.left+r.width*cfg.x/100)+'px';$('caption').style.top=(r.top+r.height*cfg.y/100)+'px';$('caption').style.maxWidth=Math.max(0,r.width*.88)+'px';}
function refresh(){
  if(location.hash!==lastRoute){lastRoute=location.hash;stopAudio();exitStage();}
  const v=chooseVideo();rootVideo=v;host.style.display=v?'block':'none';if(!v)return;
  anchor=v.closest('.video-js')||v.parentElement;
  const fs=document.fullscreenElement||document.webkitFullscreenElement;
  if(fs && fs.tagName!=='VIDEO'){if(host.parentElement!==fs)fs.append(host);}else if(!fs && host.parentElement!==document.documentElement)document.documentElement.append(host);
  const src=document.querySelector('.captions-right');const text=src?.textContent.trim()||'';
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
$('caption').onpointermove=e=>{if(!dragging||!rootVideo)return;const r=rootVideo.getBoundingClientRect();cfg.x=Math.max(10,Math.min(90,(e.clientX-r.left)/r.width*100));cfg.y=Math.max(10,Math.min(92,(e.clientY-r.top)/r.height*100));$('x').value=cfg.x;$('y').value=cfg.y;paint();};
$('caption').onpointerup=()=>{dragging=false;save()};$('caption').onpointercancel=()=>{dragging=false;save()};
function waitMedia(a){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('音频加载超时')),12000);const ready=()=>done();const fail=()=>done(Error('音频服务器未允许跨域处理，或媒体加载失败'));function done(err){clearTimeout(timer);a.removeEventListener('canplay',ready);a.removeEventListener('error',fail);err?reject(err):resolve()}a.addEventListener('canplay',ready);a.addEventListener('error',fail);a.load();});}
function stopAudio(message){epoch++;pending=false;const s=audioState;audioState=null;if(s){clearInterval(s.timer);s.clean.forEach(f=>f());s.a.pause();s.a.removeAttribute('src');s.a.load();for(const [v,m]of s.mutes)if(v.isConnected)v.muted=m;s.ctx.close().catch(()=>{});} $('audio').textContent='启用音频增强';$('audio').disabled=false;$('noise').disabled=true;if(message)status(message);}
async function startAudio(){
 if(pending)return;const video=rootVideo;if(!video || !video.currentSrc){status('请先播放录像，再启用音频增强。');return;}
 if(video.readyState<2){status('原视频尚未载入；请等录像能正常播放后再启用。');return;}
 const videos=[...document.querySelectorAll('video')];const master=videos.find(v=>!v.muted&&v.volume>0)||video;
 const src=master.currentSrc;if(!src || src.startsWith('blob:')){status('此视频源暂不支持安全的独立音频处理，继续使用原声。');return;}
 pending=true;const ticket=++epoch;$('audio').disabled=true;status('正在检查音频接入；原声继续播放…');
 let ctx,a;try{
   ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
   a=new Audio();a.crossOrigin='anonymous';a.preload='auto';a.src=src;
   await waitMedia(a);if(ticket!==epoch){a.removeAttribute('src');a.load();await ctx.close();return;}
   const source=ctx.createMediaElementSource(a),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),gain=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
   hp.type='highpass';hp.frequency.value=100;lp.type='lowpass';lp.frequency.value=6500;presence.type='peaking';presence.frequency.value=2200;presence.Q.value=.8;presence.gain.value=2;
   gain.gain.value=10**(cfg.gain/20);limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;
   source.connect(hp);hp.connect(lp);let tail=lp,worklet=null;
   if(ctx.audioWorklet){let u;try{u=typeof chrome!=='undefined'&&chrome.runtime?.id?chrome.runtime.getURL('denoise-worklet.js'):URL.createObjectURL(new Blob([WORKLET_SOURCE],{type:'text/javascript'}));await ctx.audioWorklet.addModule(u);worklet=new AudioWorkletNode(ctx,'classroom-denoise');tail.connect(worklet);tail=worklet;worklet.port.postMessage({type:'strength',value:cfg.strength});worklet.port.onmessage=({data})=>{if(data.type==='calibrated')status('底噪采样完成，频谱降噪已开启。可降低强度减少失真。');};}catch{}finally{if(u?.startsWith('blob:'))URL.revokeObjectURL(u);}}
   tail.connect(presence);presence.connect(gain);gain.connect(limiter);limiter.connect(ctx.destination);
   a.currentTime=master.currentTime;a.playbackRate=master.playbackRate;a.volume=master.volume;a.preservesPitch=true;
   if(ticket!==epoch){a.pause();a.removeAttribute('src');a.load();await ctx.close();return;}
   const mutes=new Map(videos.map(v=>[v,v.muted]));const clean=[];
   const s={a,ctx,gain,worklet,mutes,clean,master,src,timer:null};audioState=s;
   const on=(e,f)=>{master.addEventListener(e,f);clean.push(()=>master.removeEventListener(e,f));};
   const sync=()=>{if(audioState!==s)return;if(!master.isConnected||master.currentSrc!==src){stopAudio('录像已切换，已恢复原声；请重新启用增强。');return;}if(Math.abs(a.currentTime-master.currentTime)>.18)a.currentTime=master.currentTime;a.playbackRate=master.playbackRate;};
   on('seeking',sync);on('ratechange',sync);on('pause',()=>a.pause());on('waiting',()=>a.pause());on('ended',()=>a.pause());on('playing',()=>{sync();a.play().catch(()=>stopAudio('音频播放被浏览器阻止，已恢复原声。'));});
   for(const [v]of mutes){const volumeChange=()=>{if(audioState!==s)return;if(v===master)a.volume=v.volume;if(!v.muted){stopAudio('检测到原播放器音量/声道切换，已恢复原声。');}};v.muted=true;setTimeout(()=>{if(audioState===s){v.addEventListener('volumechange',volumeChange);clean.push(()=>v.removeEventListener('volumechange',volumeChange));}},0);}
   a.addEventListener('error',()=>stopAudio('增强音轨加载失败，已恢复原声。'),{once:true});
   if(!master.paused)await a.play();s.timer=setInterval(sync,300);pending=false;$('audio').disabled=false;$('audio').textContent='恢复原声';$('noise').disabled=!worklet;
   status(worklet?'人声滤波与增益已开启。请在无讲话片段采样底噪，启用频谱降噪。':'人声滤波与增益已开启；浏览器限制了频谱处理，降噪采样不可用。');
 }catch(e){if(audioState)stopAudio();else{a?.pause();if(a){a.removeAttribute('src');a.load()}ctx?.close().catch(()=>{});}pending=false;$('audio').disabled=false;status((e.message||'音频处理不可用')+'。原视频与原声保留。');}
}
$('audio').onclick=()=>audioState?stopAudio('已恢复原声。'):startAudio();
$('noise').onclick=()=>{audioState?.worklet?.port.postMessage({type:'calibrate'});status('采样中 1.5 秒：此时应只有底噪，没有老师讲话。');};
window.addEventListener('pagehide',()=>stopAudio());window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
setInterval(refresh,180);refresh();paint();
})();
