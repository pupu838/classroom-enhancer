// Small drift is corrected by a gentle rate change, never repeated tiny seeks.
function planAudioSync(masterTime,audioTime,baseRate,now,lastSeek,force=false){
 const drift=masterTime-audioTime;
 if(force||Math.abs(drift)>1.5&&now-lastSeek>3000)return {seek:Math.max(0,masterTime),rate:baseRate};
 const correction=Math.abs(drift)>.06?Math.max(-.02,Math.min(.02,drift*.08)):0;
 return {seek:null,rate:baseRate*(1+correction)};
}
