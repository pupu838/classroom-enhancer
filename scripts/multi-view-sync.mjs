// The clock video always remains the master; optional camera angles must never
// starve its audio or force repeated MP4 range downloads during rebuffering.
export function bufferedAhead(video){
 const t=video.currentTime,b=video.buffered;
 if(!b||typeof b.length!=='number')return null;
 try{
  for(let i=0;i<b.length;i++)if(b.start(i)<=t+.05&&b.end(i)>t)return Math.max(0,b.end(i)-t);
  return 0;
 }catch{return null;}
}

export function createMultiViewSync({clock,clockId,views,onState=()=>{},interval=250}){
 let selected=new Set([clockId]),buffering=false,disposed=false,conserving=false,stableSince=0;
 const clean=[],lastSeek=new Map(),pendingPlay=new Set(),blocked=new Set(),states=new Map(),needsAlign=new Set();
 const state=(id,value)=>{if(states.get(id)!==value){states.set(id,value);onState(id,value);}};
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);clean.push(()=>target.removeEventListener(event,handler));};
 const baseOffset=views.find(view=>view.id===clockId)?.offset||0;
 function pauseOthers(){for(const view of views)if(view.video!==clock)view.video.pause();}
 function mainNeedsBandwidth(now){
  if(clock.paused||clock.seeking)return conserving;
  const ahead=bufferedAhead(clock);
  const starved=buffering||clock.readyState<3||(ahead!==null&&ahead<1.5);
  if(starved){conserving=true;stableSince=0;return true;}
  if(!conserving)return false;
  // Hysteresis: do not repeatedly start/stop secondary streams at the
  // threshold. Unknown buffered ranges recover after stable playback.
  if(ahead!==null&&ahead>=8){conserving=false;stableSince=0;return false;}
  if(ahead===null){
   if(!stableSince)stableSince=now;
   if(now-stableSince>=3000){conserving=false;stableSince=0;return false;}
  }
  return true;
 }
 function sync(force=false){
  if(disposed)return;
  const canonical=clock.currentTime+baseOffset,now=Date.now();
  const prioritizing=mainNeedsBandwidth(now);
  for(const view of views){
   const v=view.video;if(v===clock)continue;v.muted=true;
   if(!selected.has(view.id)){
    if(v.preload!=='none')v.preload='none';
    v.pause();state(view.id,'hidden');continue;
   }
   if(prioritizing){
    // Pause helpers BEFORE any seeks or play requests. The master audio gets
    // time to establish a healthy buffered lead.
    if(v.preload!=='none')v.preload='none';
    v.pause();state(view.id,'priority');continue;
   }
   if(v.preload!=='auto')v.preload='auto';
   if(v.error){v.pause();state(view.id,'error');continue;}
   const target=canonical-(view.offset||0),duration=v.duration;
   if(target<0||Number.isFinite(duration)&&target>=duration-.03){v.pause();state(view.id,'absent');continue;}
   if(v.readyState<1){state(view.id,'loading');continue;}
   const drift=target-v.currentTime;
   // Never seek a stream that has no future media, unless the user explicitly
   // dragged the master timeline. Retries here can discard buffered ranges.
   const explicit=force||needsAlign.has(view.id),maySeek=explicit||v.readyState>=3;
   if(maySeek&&!v.seeking&&Math.abs(drift)>.04&&(explicit||Math.abs(drift)>1.5&&now-(lastSeek.get(view.id)||0)>4000)){
    v.currentTime=target;lastSeek.set(view.id,now);needsAlign.delete(view.id);
   }else if(Math.abs(drift)<=.04)needsAlign.delete(view.id);
   if(!v.seeking&&v.readyState>=3){
    const correction=Math.abs(drift)>.12?Math.max(-.035,Math.min(.035,drift*.1)):0;
    const rate=clock.playbackRate*(1+correction);
    if(Math.abs(v.playbackRate-rate)>.0001)v.playbackRate=rate;
   }
   if(clock.paused||clock.seeking||buffering){v.pause();state(view.id,'paused');continue;}
   if(v.readyState<3)state(view.id,'loading');else if(!blocked.has(view.id))state(view.id,'playing');
   if(v.readyState>=3&&v.paused&&!pendingPlay.has(view.id)&&!blocked.has(view.id)){
    pendingPlay.add(view.id);Promise.resolve(v.play()).catch(error=>{if(error?.name!=='AbortError'){blocked.add(view.id);state(view.id,'blocked');}}).finally(()=>pendingPlay.delete(view.id));
   }
  }
 }
 listen(clock,'play',()=>{blocked.clear();sync();});
 listen(clock,'playing',()=>{buffering=false;blocked.clear();sync();});
 listen(clock,'waiting',()=>{buffering=true;conserving=true;pauseOthers();sync();});
 listen(clock,'pause',pauseOthers);listen(clock,'ended',pauseOthers);
 listen(clock,'seeking',()=>{pauseOthers();sync(true);});listen(clock,'seeked',()=>sync(true));
 listen(clock,'ratechange',()=>sync());
 for(const view of views){if(view.video===clock)continue;
  listen(view.video,'loadedmetadata',()=>sync());
  listen(view.video,'canplay',()=>{blocked.delete(view.id);sync();});
  listen(view.video,'waiting',()=>{if(selected.has(view.id))state(view.id,'loading');});
  listen(view.video,'error',()=>{blocked.add(view.id);state(view.id,'error');});
 }
 const timer=setInterval(()=>sync(),interval);
 return {setVisible(ids){const next=new Set(ids);for(const id of next)if(!selected.has(id))needsAlign.add(id);selected=next;blocked.clear();sync();},sync,destroy(){disposed=true;clearInterval(timer);clean.forEach(fn=>fn());pauseOthers();},getVisible:()=>[...selected],isConserving:()=>conserving};
}
