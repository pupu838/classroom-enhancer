import Artplayer from 'artplayer';
import {createMultiViewSync} from './multi-view-sync.mjs';
import {classroomLessonId} from './lesson-context.mjs';
import {cleanLayout,viewRects,boundRect} from './view-layout.mjs';
import {createLiveAudio} from './live-audio.mjs';

const css=`
.ce-native-hidden{display:none!important}#ce-multiview{width:100%;background:#101621;border:1px solid #354358;border-radius:12px;overflow:hidden;color:#f5f7fb;font:14px system-ui;position:relative}
#ce-multiview *{box-sizing:border-box}#ce-multiview .ce-view-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px;background:#182335}
#ce-multiview button,#ce-multiview select{font:inherit;color:#fff;background:#26364c;border:1px solid #4c607c;border-radius:7px;padding:8px 11px;cursor:pointer;touch-action:manipulation}#ce-multiview .ce-sound-volume{width:78px;accent-color:#fb7299}#ce-multiview .art-control-volume{display:none!important}
#ce-multiview button[aria-pressed=true]{background:#8d3558;border-color:#fb7299}#ce-multiview button:disabled{opacity:.4}#ce-multiview .ce-player-stage{width:100%;aspect-ratio:16/9;min-height:210px}
#ce-multiview[data-count="2"] .ce-player-stage{aspect-ratio:32/9}#ce-multiview .ce-view-grid{position:absolute;inset:0;display:grid;background:#000;gap:3px;z-index:0}
#ce-multiview .ce-view-cell{position:relative;min-width:0;min-height:0;background:#000;overflow:hidden}#ce-multiview .ce-view-cell video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;z-index:0}
#ce-multiview .ce-view-cell.ce-clock-hidden{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden}#ce-multiview .ce-view-cell[hidden]{display:none!important}
#ce-multiview .ce-view-grid[data-count="2"]{grid-template-columns:1fr 1fr}#ce-multiview .ce-view-grid[data-count="3"]{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}#ce-multiview .ce-view-grid[data-count="3"] .ce-view-cell[data-order="0"]{grid-row:1/3}
#ce-multiview .ce-angle-label{position:absolute;top:8px;left:8px;padding:4px 8px;border-radius:5px;background:#0009;pointer-events:none;font-size:12px;z-index:1}
#ce-multiview .ce-angle-message{position:absolute;left:10px;right:10px;bottom:58px;text-align:center;pointer-events:none;color:#f8d1de;background:#0008;border-radius:4px;font-size:12px}
#ce-multiview .ce-view-note{margin:0;padding:7px 12px;color:#c0cee1;font-size:12px;min-height:30px;line-height:1.5}
#ce-multiview .art-video-player{--art-theme:#fb7299;--art-control-height:44px;--art-control-icon-size:34px}#ce-multiview .art-video-player>.art-mask{background:transparent}
#ce-multiview .art-video-player .art-video{object-fit:contain}#ce-multiview .art-bottom{z-index:6}#ce-multiview .art-mask{z-index:2}#ce-multiview .art-loading{z-index:5}
#ce-multiview.nwa-stage{display:flex;flex-direction:column}#ce-multiview.nwa-stage .ce-player-stage{flex:1;min-height:0;aspect-ratio:auto}#ce-multiview.nwa-stage .ce-view-toolbar{flex-shrink:0}
@media(max-width:600px){#ce-multiview .ce-view-toolbar{gap:5px;padding:7px}#ce-multiview button,#ce-multiview select{font-size:12px;padding:8px}#ce-multiview .ce-player-stage{min-height:205px}}
#ce-multiview .ce-player-stage{position:relative;overflow:hidden}
#ce-multiview .ce-player-stage>.art-video-player{position:absolute!important;inset:0;width:100%!important;height:100%!important}
#ce-multiview .ce-view-grid{display:block!important;z-index:3;pointer-events:none}
#ce-multiview .ce-view-cell{position:absolute;pointer-events:none}
#ce-multiview .ce-clock-hidden{width:1px!important;height:1px!important;left:0!important;top:0!important}
#ce-multiview .ce-layout-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px;background:#172437;border-bottom:1px solid #456}
#ce-multiview .ce-layout-tools[hidden]{display:none!important}#ce-multiview .ce-layout-tools label{display:flex;gap:8px;align-items:center}#ce-multiview .ce-layout-tools input{max-width:120px}
#ce-multiview .ce-resize{display:none;position:absolute;right:3px;bottom:3px;width:30px;height:30px;padding:0;touch-action:none;z-index:4;background:#fb7299;color:#fff}
#ce-multiview.ce-layout-editing .ce-view-cell:not(.ce-clock-hidden){outline:2px dashed #fb7299;outline-offset:-2px}
#ce-multiview.ce-layout-editing .ce-angle-label{pointer-events:auto;cursor:move;touch-action:none;z-index:4}
#ce-multiview.ce-layout-editing .ce-resize{display:block;pointer-events:auto;cursor:nwse-resize}
#ce-multiview:fullscreen{display:flex;flex-direction:column;height:100%;border-radius:0}
#ce-multiview:-webkit-full-screen{display:flex;flex-direction:column;height:100%;border-radius:0}
#ce-multiview:fullscreen .ce-player-stage{flex:1;min-height:0;aspect-ratio:auto!important}
#ce-multiview:-webkit-full-screen .ce-player-stage{flex:1;min-height:0;aspect-ratio:auto!important}
#ce-multiview.nwa-stage .ce-player-stage{aspect-ratio:auto!important}
#ce-multiview .ce-layout-tools,#ce-multiview .ce-view-note,#ce-multiview .ce-view-toolbar{flex-shrink:0}
#ce-multiview .ce-transport{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;background:#182335;flex-shrink:0;z-index:10;position:relative}
#ce-multiview .ce-transport button{min-width:44px;min-height:44px}#ce-multiview .ce-seek{flex:1;min-width:120px;height:32px;accent-color:#fb7299;touch-action:pan-x}
#ce-multiview .ce-time{font-variant-numeric:tabular-nums;font-size:12px}#ce-multiview .ce-audio-track{max-width:150px}#ce-multiview .art-bottom{display:none!important}
#ce-multiview{display:flex;flex-direction:column}#ce-multiview .ce-player-stage{flex:0 1 auto;min-height:120px}
#ce-multiview:fullscreen,#ce-multiview:-webkit-full-screen,#ce-multiview.nwa-stage{max-height:none!important}
`;
const lessonId=()=>classroomLessonId();

function originalRegions(videos){
 let common=videos[0]?.parentElement;
 while(common&&!videos.every(video=>common.contains(video)))common=common.parentElement;
 const tallest=Math.max(0,...videos.map(video=>video.getBoundingClientRect().height));
 if(common&&common!==document.body&&common!==document.documentElement&&common.id!=='app'&&common.getBoundingClientRect().height<=Math.max(600,tallest*1.8))return [common];
 return [...new Set(videos.map(video=>video.closest('.video-js')||video.parentElement).filter(Boolean))];
}

export async function mountMultiViewPlayer({sources,originalVideos,PlayerClass=Artplayer,onRestore=()=>{}}){
 if(document.getElementById('ce-multiview'))throw Error('播放器已经接入');
 const primary=sources.views.find(view=>view.id===sources.clockId);if(!primary)throw Error('缺少主音轨画面');
 if(!document.getElementById('ce-multiview-style')){const style=document.createElement('style');style.id='ce-multiview-style';style.textContent=css;document.documentElement.append(style);}
 const regions=originalRegions(originalVideos);if(!regions[0])throw Error('学校播放区域尚未加载');
 const root=document.createElement('section');root.id='ce-multiview';root.dataset.count='1';
 root.innerHTML='<div class="ce-view-toolbar"><strong>多视角</strong><select aria-label="画面布局"><option value="single">单画面</option><option value="mix">自由组合</option><option value="all">三路同屏</option></select><span class="ce-view-angles"></span><select class="ce-rate" aria-label="播放速度"><option value="0.75">0.75 倍速</option><option value="1" selected>1 倍速</option><option value="1.25">1.25 倍速</option><option value="1.5">1.5 倍速</option><option value="1.75">1.75 倍速</option><option value="2">2 倍速</option><option value="2.5">2.5 倍速</option><option value="3">3 倍速</option></select><button class="ce-sound-toggle">静音</button><input class="ce-sound-volume" aria-label="音量" type="range" min="0" max="1" step="0.05"><button class="ce-multi-full">多画面全屏</button><button class="ce-native-restore">恢复学校播放器</button></div><div class="ce-player-stage"></div><p class="ce-view-note" role="status">正在载入课堂画面，学校原声继续播放…</p>';
 regions[0].before(root);
 const stage=root.querySelector('.ce-player-stage'),note=root.querySelector('.ce-view-note'),mode=root.querySelector('select'),buttons=root.querySelector('.ce-view-angles');
 const layoutKey='ce-view-layout-v1';let layout=cleanLayout();try{layout=cleanLayout(JSON.parse(localStorage.getItem(layoutKey)||'{}'));}catch{}
 const layoutButton=document.createElement('button');layoutButton.className='ce-layout-edit';layoutButton.textContent='调整布局';root.querySelector('.ce-view-toolbar').append(layoutButton);
 const tools=document.createElement('div');tools.className='ce-layout-tools';tools.hidden=true;
 tools.innerHTML='<label>排布<select class="ce-arrangement" aria-label="画面排列"><option value="auto">自适应</option><option value="row">左右排列</option><option value="column">上下排列</option><option value="focus">主副画面</option><option value="free">自由摆放</option></select></label><label>首画面比例<input class="ce-layout-ratio" aria-label="首画面比例" type="range" min="20" max="80"></label><label>画布高度<input class="ce-layout-height" aria-label="画布高度" type="range" min="60" max="160" step="10"></label><label>调整顺序<select class="ce-order-view" aria-label="调整顺序"></select></label><button class="ce-order-before">前移</button><button class="ce-order-after">后移</button><button class="ce-layout-reset">恢复默认布局</button><small>自由摆放：拖动角度名称换位置，拖动右下角调整大小。布局会自动保存。</small>';
 stage.before(tools);
 let art,sync,audio,activated=false,destroyed=false;
 const clean=[],snapshots=[],views=[],cells=new Map(),messages=new Map(),angleButtons=new Map();
 let selected=layout.selected.filter(id=>sources.views.some(view=>view.id===id));if(!selected.length)selected=[sources.views.find(view=>view.id==='teacher')?.id||primary.id];mode.value=layout.mode;
 const arrangement=tools.querySelector('.ce-arrangement'),ratio=tools.querySelector('.ce-layout-ratio'),height=tools.querySelector('.ce-layout-height'),orderView=tools.querySelector('.ce-order-view');arrangement.value=layout.arrangement;ratio.value=layout.ratio;height.value=layout.height;
 const currentOriginal=originalVideos.find(video=>!video.paused&&!video.muted&&video.volume>0)||originalVideos.find(video=>!video.muted&&video.volume>0)||originalVideos[0];
 const originalInfo=sources.views.find(view=>view.url===(currentOriginal.currentSrc||currentOriginal.src));
 const captionCues=[];try{for(const track of Array.from(currentOriginal.textTracks||[]))for(const cue of Array.from(track.cues||[]))captionCues.push({start:cue.startTime+(originalInfo?.offset||0),end:cue.endTime+(originalInfo?.offset||0),text:cue.text});}catch{}
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);clean.push(()=>target.removeEventListener(event,handler));};
 function showState(id,state){const el=messages.get(id);if(!el)return;el.textContent=({loading:'该路正在缓冲…',blocked:'点一次播放继续此画面',error:'该路暂时无法播放，可切换其他角度',absent:'这个时间段没有该路画面'})[state]||'';el.hidden=!el.textContent;}
 function render(){
  const count=selected.length;root.dataset.count=String(count);grid.dataset.count=String(count);
  const result=viewRects(selected,layout,window.innerHeight>window.innerWidth);root.dataset.layout=result.arrangement;stage.style.aspectRatio=String(result.aspect/(layout.height/100));root.classList.toggle('ce-layout-editing',!tools.hidden&&layout.arrangement==='free');
  root.style.maxHeight=Math.max(300,window.innerHeight-Math.max(0,root.getBoundingClientRect().top)-12)+'px';
  for(const view of views){const cell=cells.get(view.id),order=selected.indexOf(view.id);cell.classList.toggle('ce-clock-hidden',order<0&&view.id===primary.id);cell.hidden=order<0&&view.id!==primary.id;cell.dataset.order=String(order);cell.style.order=String(Math.max(0,order));angleButtons.get(view.id)?.setAttribute('aria-pressed',String(order>=0));const r=result.rects[view.id];if(r)Object.assign(cell.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%'});}
  const previous=orderView.value;orderView.replaceChildren(...selected.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=sources.views.find(view=>view.id===id).label;return option;}));if(selected.includes(previous))orderView.value=previous;
  layout.selected=[...selected];layout.mode=mode.value;try{localStorage.setItem(layoutKey,JSON.stringify(layout));}catch{}
  sync?.setVisible(selected);note.textContent='下方公共播放栏始终可见。画面和音频可独立切换，共用同一进度。';
 }
 function select(id){
  if(mode.value==='single')selected=[id];
  else{mode.value='mix';selected=selected.includes(id)?selected.length>1?selected.filter(value=>value!==id):selected:[...selected,id];}
  render();
 }
 let grid;
 layoutButton.onclick=()=>{tools.hidden=!tools.hidden;layoutButton.textContent=tools.hidden?'调整布局':'完成布局';render();};
 arrangement.onchange=()=>{if(arrangement.value==='free'){const current=viewRects(selected,layout,window.innerHeight>window.innerWidth);layout.rects={...current.rects,...layout.rects};layout.aspect=current.aspect;}layout.arrangement=arrangement.value;render();};
 ratio.oninput=()=>{layout.ratio=Number(ratio.value);render();};height.oninput=()=>{layout.height=Number(height.value);render();};
 const reorder=step=>{const index=selected.indexOf(orderView.value),next=index+step;if(index>=0&&next>=0&&next<selected.length){[selected[index],selected[next]]=[selected[next],selected[index]];render();}};
 tools.querySelector('.ce-order-before').onclick=()=>reorder(-1);tools.querySelector('.ce-order-after').onclick=()=>reorder(1);
 tools.querySelector('.ce-layout-reset').onclick=()=>{layout=cleanLayout();arrangement.value=layout.arrangement;ratio.value=layout.ratio;height.value=layout.height;render();};
 listen(window,'resize',()=>render());
 function dragHandle(handle,id,resizing){
  let drag=null;
  listen(handle,'pointerdown',event=>{if(layout.arrangement!=='free'||tools.hidden)return;const rect=viewRects(selected,layout).rects[id],box=grid.getBoundingClientRect();drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,rect,box};handle.setPointerCapture(event.pointerId);event.stopPropagation();event.preventDefault();});
  listen(handle,'pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const dx=(event.clientX-drag.x)/drag.box.width*100,dy=(event.clientY-drag.y)/drag.box.height*100;layout.rects[id]=boundRect(resizing?{...drag.rect,w:drag.rect.w+dx,h:drag.rect.h+dy}:{...drag.rect,x:drag.rect.x+dx,y:drag.rect.y+dy});render();event.stopPropagation();event.preventDefault();});
  for(const event of ['pointerup','pointercancel'])listen(handle,event,e=>{if(drag)e.stopPropagation();drag=null;});
  listen(handle,'click',event=>{if(layout.arrangement==='free'&&!tools.hidden){event.stopPropagation();event.preventDefault();}});
  listen(handle,'keyup',event=>{if(layout.arrangement==='free'&&event.key.startsWith('Arrow')){event.stopPropagation();event.preventDefault();}});
  listen(handle,'keydown',event=>{const moves={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]},move=moves[event.key];if(!move||layout.arrangement!=='free')return;event.stopPropagation();event.preventDefault();const r=viewRects(selected,layout).rects[id];layout.rects[id]=boundRect(resizing?{...r,w:r.w+move[0],h:r.h+move[1]}:{...r,x:r.x+move[0],y:r.y+move[1]});render();});
 }
 function restore(user=true,message='已恢复学校播放器。',resume=true){
  if(destroyed)return;destroyed=true;
  const canonical=(art?.video.currentTime||0)+primary.offset,wasPlaying=art&&!art.video.paused,sound=window.__CE_AUDIO_CONTROL__,volume=sound?.getVolume()??art?.video.volume??1,muted=sound?.getMuted()??art?.video.muted??false;
  if(activated)window.dispatchEvent(new Event('ce-player-changing'));
  sync?.destroy();audio?.destroy();if(window.__CE_LIVE_AUDIO__===audio)delete window.__CE_LIVE_AUDIO__;window.dispatchEvent(new Event('ce-audio-state'));clean.forEach(fn=>fn());
  if(window.__CE_PLAYER__?.container===root)delete window.__CE_PLAYER__;
  const assistant=document.getElementById('nwa-classroom-host');if(assistant&&root.contains(assistant))document.documentElement.append(assistant);
  for(const view of views)if(view.video!==art?.video){view.video.pause();view.video.removeAttribute('src');view.video.load();}
  art?.destroy(false);root.remove();
  for(const region of regions)region.classList.remove('ce-native-hidden');
  for(const saved of snapshots){const video=saved.video;video.muted=saved.muted;video.preload=saved.preload;if(resume&&(video.currentSrc||video.src)===saved.src&&(!video.src||video.src===saved.src)){const info=sources.views.find(view=>view.url===saved.src);try{video.currentTime=Math.max(0,canonical-(info?.offset||0));}catch{}}}
  if(activated){currentOriginal.volume=volume;currentOriginal.muted=muted;}
  if(resume&&activated&&wasPlaying&&currentOriginal.isConnected)currentOriginal.play().catch(()=>{});
  onRestore({user,message});
 }
 try{
  art=new PlayerClass({container:stage,url:primary.url,type:'mp4',theme:'#fb7299',lang:'zh-cn',volume:currentOriginal.volume,autoplay:false,mutex:false,setting:true,playbackRate:true,hotkey:true,fullscreen:false,fullscreenWeb:false,pip:false,playsInline:true,miniProgressBar:true,moreVideoAttr:{preload:'metadata',playsInline:true,'webkit-playsinline':'true'}});
  grid=document.createElement('div');grid.className='ce-view-grid';art.template.$player.prepend(grid);
  for(const source of sources.views){
   const video=source.id===primary.id?art.video:document.createElement('video');
   if(video!==art.video){video.src=source.url;video.preload='metadata';video.muted=true;video.playsInline=true;video.setAttribute('webkit-playsinline','true');}
   const cell=document.createElement('div');cell.className='ce-view-cell';cell.dataset.view=source.id;
   const label=document.createElement('span');label.className='ce-angle-label';label.textContent=source.label;
   const message=document.createElement('span');message.className='ce-angle-message';message.hidden=true;
   const resize=document.createElement('button');resize.className='ce-resize';resize.textContent='↘';resize.setAttribute('aria-label','调整'+source.label+'画面大小');label.tabIndex=0;label.setAttribute('aria-label','移动'+source.label+'画面');cell.append(video,label,message,resize);grid.append(cell);cells.set(source.id,cell);messages.set(source.id,message);views.push({...source,video});dragHandle(label,source.id,false);dragHandle(resize,source.id,true);
   const button=document.createElement('button');button.textContent=source.label;button.dataset.view=source.id;button.onclick=()=>select(source.id);buttons.append(button);angleButtons.set(source.id,button);
  }
  for(const [id,label] of [['teacher','老师'],['room','教室'],['slides','课件']])if(!angleButtons.has(id)){const button=document.createElement('button');button.textContent=label+'（无画面）';button.disabled=true;buttons.append(button);}
  mode.onchange=()=>{if(mode.value==='all')selected=sources.views.map(view=>view.id);else if(mode.value==='single')selected=[selected[0]];render();};
  root.querySelector('.ce-native-restore').onclick=()=>restore(true);
  root.querySelector('.ce-multi-full').onclick=()=>{document.getElementById('nwa-classroom-host')?.shadowRoot?.getElementById('fullscreen')?.click();};
  const soundButton=root.querySelector('.ce-sound-toggle'),volume=root.querySelector('.ce-sound-volume');
  const refreshSound=()=>{const sound=window.__CE_AUDIO_CONTROL__;soundButton.textContent=(sound?sound.getMuted():art.video.muted)?'取消静音':'静音';volume.value=sound?sound.getVolume():art.video.volume;};
  soundButton.onclick=()=>{const sound=window.__CE_AUDIO_CONTROL__;if(sound)sound.setMuted(!sound.getMuted());else art.video.muted=!art.video.muted;refreshSound();};
  volume.oninput=()=>{const sound=window.__CE_AUDIO_CONTROL__;if(sound)sound.setVolume(Number(volume.value));else art.video.volume=Number(volume.value);};
  listen(window,'ce-audio-state',refreshSound);listen(art.video,'volumechange',refreshSound);
  const rate=root.querySelector('.ce-rate');rate.onchange=()=>{art.playbackRate=Number(rate.value);};listen(art.video,'ratechange',()=>{rate.value=String(art.video.playbackRate);});
  render();
  await new Promise((resolve,reject)=>{if(art.video.readyState>=1){resolve();return;}const timer=setTimeout(()=>finish(Error('新播放器读取媒体超时')),12000);function finish(error){clearTimeout(timer);art.video.removeEventListener('loadedmetadata',ready);art.video.removeEventListener('error',fail);error?reject(error):resolve();}const ready=()=>finish(),fail=()=>finish(Error('新播放器未能读取学校视频'));art.video.addEventListener('loadedmetadata',ready);art.video.addEventListener('error',fail);});
  if(destroyed)throw Error('播放器接入已取消');
  const target=currentOriginal.currentTime+(originalInfo?.offset||0)-primary.offset,wasPlaying=!currentOriginal.paused;
  window.dispatchEvent(new Event('ce-player-changing'));
  for(const video of originalVideos){snapshots.push({video,muted:video.muted,preload:video.preload,src:video.currentSrc||video.src});video.pause();video.muted=true;video.preload='none';listen(video,'play',()=>{if(!destroyed)video.pause();});}
  for(const region of regions)region.classList.add('ce-native-hidden');
  art.video.currentTime=Math.max(0,Math.min(Number.isFinite(art.video.duration)?Math.max(0,art.video.duration-.05):target,target));art.video.playbackRate=currentOriginal.playbackRate;
  sync=createMultiViewSync({clock:art.video,clockId:primary.id,views,onState:showState});activated=true;
  audio=createLiveAudio({clock:art.video,clockId:primary.id,views,workletSource:window.__CE_WORKLET_SOURCE__,onStatus:message=>window.dispatchEvent(new CustomEvent('ce-live-audio-status',{detail:message}))});window.__CE_LIVE_AUDIO__=audio;
  const transport=document.createElement('div');transport.className='ce-transport';transport.innerHTML='<button class="ce-play" aria-label="播放或暂停">播放</button><button class="ce-back" aria-label="后退10秒">−10秒</button><input class="ce-seek" aria-label="播放进度" type="range" min="0" max="1" step="0.1" value="0"><span class="ce-time"></span><button class="ce-forward" aria-label="前进10秒">+10秒</button><label>音频 <select class="ce-audio-track" aria-label="选择音频"></select></label><span class="ce-audio-message" role="status"></span>';stage.after(transport);
  const play=transport.querySelector('.ce-play'),seek=transport.querySelector('.ce-seek'),time=transport.querySelector('.ce-time'),audioSelect=transport.querySelector('.ce-audio-track'),audioMessage=transport.querySelector('.ce-audio-message');
  for(const view of views){const option=document.createElement('option');option.value=view.id;option.textContent=view.label+'音频';audioSelect.append(option);}audioSelect.value=primary.id;
  const format=value=>{value=Math.max(0,Math.floor(value||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');};let scrubbing=false;
  function updateTransport(){if(destroyed)return;play.textContent=art.video.paused?'播放':'暂停';const duration=art.video.duration;if(Number.isFinite(duration)){seek.max=String(duration);if(!scrubbing)seek.value=String(art.video.currentTime);}time.textContent=format(art.video.currentTime)+' / '+format(duration);}
  play.onclick=()=>{if(art.video.paused){audio.state().ctx?.resume().catch(()=>{});art.video.play().catch(()=>{note.textContent='播放被浏览器暂时阻止，请再点一次播放。';});}else art.video.pause();};
  const jump=delta=>{art.video.currentTime=Math.max(0,Math.min(art.video.duration||Infinity,art.video.currentTime+delta));updateTransport();};transport.querySelector('.ce-back').onclick=()=>jump(-10);transport.querySelector('.ce-forward').onclick=()=>jump(10);
  seek.oninput=()=>{scrubbing=true;time.textContent=format(Number(seek.value))+' / '+format(art.video.duration);};seek.onchange=()=>{art.video.currentTime=Number(seek.value);scrubbing=false;updateTransport();};
  audioSelect.onchange=async()=>{audioMessage.textContent='正在接入，当前声音继续…';try{await audio.select(audioSelect.value);audioMessage.textContent='已切换';}catch(e){audioMessage.textContent=e.message;}audioSelect.value=audio.state().activeId;};
  listen(window,'ce-audio-state',()=>{audioSelect.value=audio.state().activeId;refreshSound();});
  for(const event of ['play','pause','timeupdate','durationchange','loadedmetadata','seeked'])listen(art.video,event,updateTransport);updateTransport();
  const api={container:root,getVideo:()=>art.video,getRect:()=>stage.getBoundingClientRect(),restore:()=>restore(true),dispose:()=>restore(false,'',false),select,setVisible(ids){selected=[...new Set(ids.filter(id=>views.some(view=>view.id===id)))];if(!selected.length)selected=[primary.id];mode.value=selected.length===1?'single':'mix';render();},getCaption(time){const canonical=time+primary.offset;return captionCues.find(cue=>canonical>=cue.start&&canonical<cue.end)?.text||'';},getViews:()=>views,art};
  window.__CE_PLAYER__=api;
  refreshSound();
  listen(art.video,'error',()=>restore(false,'新播放器读取失败，已恢复学校播放器。'));
  render();if(wasPlaying)art.video.play().catch(()=>{note.textContent='已保留播放进度。点播放器中间的播放按钮继续。';});
  return api;
 }catch(error){restore(false,error.message);throw error;}
}

export function installMultiViewPlayer(getSources){
 let current=null,pending=null,blockedLesson=null,lastAttempt=0,dead=false;
 async function check(force=false){
  if(dead)return;const id=lessonId();
  if(current&&current.id!==id){current.api.dispose();current=null;}
  if(current&&!current.api.container.isConnected){current.api.dispose();current=null;blockedLesson=null;lastAttempt=0;}
  if(!id){if(force)throw Error('未识别到当前课次，请从课程列表进入一节回放');return;}
  if(current)return;
  if(pending){if(force)throw Error('正在读取视频资料，请稍候再试');return;}
  if(!force&&(blockedLesson===id||Date.now()-lastAttempt<10000))return;
  const originals=[...document.querySelectorAll('video')].filter(video=>!video.closest('#ce-multiview'));if(!originals.some(video=>video.currentSrc||video.src)){if(force)throw Error('学校视频地址尚未加载，请先在原播放器点一次播放');return;}
  lastAttempt=Date.now();const ticket={id};pending=ticket;
  let timeout;
  try{const sources=await Promise.race([getSources(id),new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('学校视频资料读取超时，请稍后重试')),15000);})]);clearTimeout(timeout);if(dead||lessonId()!==id)return;const api=await mountMultiViewPlayer({sources,originalVideos:originals,onRestore:({message})=>{blockedLesson=id;current=null;if(message)document.documentElement.dataset.cePlayerMessage=message;}});if(dead||lessonId()!==id){api.dispose();return;}current={id,api};}
  catch(error){document.documentElement.dataset.cePlayerMessage=error.message;if(force)throw error;}
  finally{clearTimeout(timeout);if(pending===ticket)pending=null;}
 }
 window.__CE_RETRY_PLAYER__=()=>{blockedLesson=null;lastAttempt=0;return check(true);};
 const timer=setInterval(()=>check(),750);window.addEventListener('pagehide',()=>{dead=true;clearInterval(timer);current?.api.dispose();},{once:true});check();
}
