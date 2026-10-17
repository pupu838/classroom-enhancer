// The clock video never changes when the visible angles change.
export function createMultiViewSync({clock,clockId,views,onState=()=>{},interval=250}){
 let selected=new Set([clockId]),buffering=false,disposed=false;
 const clean=[],lastSeek=new Map(),pendingPlay=new Set(),blocked=new Set(),states=new Map();
 const state=(id,value)=>{if(states.get(id)!==value){states.set(id,value);onState(id,value);}};
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);clean.push(()=>target.removeEventListener(event,handler));};
 const baseOffset=views.find(view=>view.id===clockId)?.offset||0;
 function pauseOthers(){for(const view of views)if(view.video!==clock)view.video.pause();}
 function sync(force=false){
  if(disposed)return;
  const canonical=clock.currentTime+baseOffset,now=Date.now();
  for(const view of views){
   const v=view.video;if(v===clock)continue;v.muted=true;
   if(!selected.has(view.id)){v.pause();state(view.id,'hidden');continue;}
   if(v.error){v.pause();state(view.id,'error');continue;}
   const target=canonical-(view.offset||0),duration=v.duration;
   if(target<0||Number.isFinite(duration)&&target>=duration-.03){v.pause();state(view.id,'absent');continue;}
   if(v.readyState<1){state(view.id,'loading');continue;}
   const drift=target-v.currentTime;
   if((force||Math.abs(drift)>.8&&now-(lastSeek.get(view.id)||0)>2000)&&Math.abs(drift)>.04&&!v.seeking){v.currentTime=target;lastSeek.set(view.id,now);}
   const correction=!v.seeking&&Math.abs(drift)>.12?Math.max(-.035,Math.min(.035,drift*.1)):0;
   v.playbackRate=clock.playbackRate*(1+correction);
   if(clock.paused||clock.seeking||buffering){v.pause();state(view.id,'paused');continue;}
   if(v.readyState<3)state(view.id,'loading');else if(!blocked.has(view.id))state(view.id,'playing');
   if(v.paused&&!pendingPlay.has(view.id)&&!blocked.has(view.id)){
    pendingPlay.add(view.id);Promise.resolve(v.play()).catch(error=>{if(error?.name!=='AbortError'){blocked.add(view.id);state(view.id,'blocked');}}).finally(()=>pendingPlay.delete(view.id));
   }
  }
 }
 listen(clock,'play',()=>{blocked.clear();sync(true);});
 listen(clock,'playing',()=>{buffering=false;blocked.clear();sync(true);});
 listen(clock,'waiting',()=>{buffering=true;pauseOthers();});
 listen(clock,'pause',pauseOthers);listen(clock,'ended',pauseOthers);
 listen(clock,'seeking',()=>{pauseOthers();sync(true);});listen(clock,'seeked',()=>sync(true));
 listen(clock,'ratechange',()=>sync());
 for(const view of views){if(view.video===clock)continue;
  listen(view.video,'loadedmetadata',()=>sync(true));
  listen(view.video,'canplay',()=>{blocked.delete(view.id);sync(true);});
  listen(view.video,'waiting',()=>{if(selected.has(view.id))state(view.id,'loading');});
  listen(view.video,'error',()=>{blocked.add(view.id);state(view.id,'error');});
 }
 const timer=setInterval(()=>sync(),interval);
 return {setVisible(ids){selected=new Set(ids);blocked.clear();sync(true);},sync,destroy(){disposed=true;clearInterval(timer);clean.forEach(fn=>fn());pauseOthers();},getVisible:()=>[...selected]};
}
