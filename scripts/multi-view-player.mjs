import Artplayer from 'artplayer';
import {createMultiViewSync} from './multi-view-sync.mjs';
import {classroomLessonId} from './lesson-context.mjs';

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
 let art,sync,activated=false,destroyed=false;
 const clean=[],snapshots=[],views=[],cells=new Map(),messages=new Map(),angleButtons=new Map();
 let selected=[sources.views.find(view=>view.id==='teacher')?.id||primary.id];
 const currentOriginal=originalVideos.find(video=>!video.paused&&!video.muted&&video.volume>0)||originalVideos.find(video=>!video.muted&&video.volume>0)||originalVideos[0];
 const originalInfo=sources.views.find(view=>view.url===(currentOriginal.currentSrc||currentOriginal.src));
 const captionCues=[];try{for(const track of Array.from(currentOriginal.textTracks||[]))for(const cue of Array.from(track.cues||[]))captionCues.push({start:cue.startTime+(originalInfo?.offset||0),end:cue.endTime+(originalInfo?.offset||0),text:cue.text});}catch{}
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);clean.push(()=>target.removeEventListener(event,handler));};
 function showState(id,state){const el=messages.get(id);if(!el)return;el.textContent=({loading:'该路正在缓冲…',blocked:'点一次播放继续此画面',error:'该路暂时无法播放，可切换其他角度',absent:'这个时间段没有该路画面'})[state]||'';el.hidden=!el.textContent;}
 function render(){
  const count=selected.length;root.dataset.count=String(count);grid.dataset.count=String(count);
  for(const view of views){const cell=cells.get(view.id),order=selected.indexOf(view.id);cell.classList.toggle('ce-clock-hidden',order<0&&view.id===primary.id);cell.hidden=order<0&&view.id!==primary.id;cell.dataset.order=String(order);cell.style.order=String(Math.max(0,order));angleButtons.get(view.id)?.setAttribute('aria-pressed',String(order>=0));}
  sync?.setVisible(selected);note.textContent='一条进度控制所有画面；切换视角保留当前进度。声音固定使用课堂主音轨。';
 }
 function select(id){
  if(mode.value==='single')selected=[id];
  else{mode.value='mix';selected=selected.includes(id)?selected.length>1?selected.filter(value=>value!==id):selected:[...selected,id];}
  render();
 }
 let grid;
 function restore(user=true,message='已恢复学校播放器。',resume=true){
  if(destroyed)return;destroyed=true;
  const canonical=(art?.video.currentTime||0)+primary.offset,wasPlaying=art&&!art.video.paused,sound=window.__CE_AUDIO_CONTROL__,volume=sound?.getVolume()??art?.video.volume??1,muted=sound?.getMuted()??art?.video.muted??false;
  if(activated)window.dispatchEvent(new Event('ce-player-changing'));
  sync?.destroy();clean.forEach(fn=>fn());
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
   cell.append(video,label,message);grid.append(cell);cells.set(source.id,cell);messages.set(source.id,message);views.push({...source,video});
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
