import assert from 'node:assert/strict';
import {createLiveAudio} from '../scripts/live-audio.mjs';

globalThis.window=new EventTarget();
const elements=[];
globalThis.Audio=class extends EventTarget{
 constructor(){super();this._currentTime=0;this.seeking=false;this.readyState=0;this.paused=true;this.playbackRate=1;this.seeks=0;elements.push(this);}
 get currentTime(){return this._currentTime;}
 set currentTime(value){
  this._currentTime=value;this.seeks++;
  this.seeking=true;this.readyState=1;
 }
 get buffered(){return {length:1,start:()=>0,end:()=>this._currentTime+.15};}
 load(){this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'));}
 async play(){
  this.paused=false;
  if(this.readyState<3){
   await new Promise(resolve=>setTimeout(resolve,55));
   this.seeking=false;this.readyState=3;
   this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('canplay'));
  }
 }
 pause(){this.paused=true;}
 removeAttribute(){}
};
const clock=new EventTarget();
Object.assign(clock,{volume:.8,muted:false,currentTime:100,playbackRate:1,paused:false,seeking:false});
clock.pause=()=>{clock.paused=true;clock.dispatchEvent(new Event('pause'));};
clock.play=async()=>{clock.paused=false;clock.dispatchEvent(new Event('playing'));};
const statuses=[];
const bank=createLiveAudio({
 clock,clockId:'teacher',views:[
  {id:'teacher',offset:0,url:'https://example.test/teacher.mp4',label:'老师'},
  {id:'room',offset:0,url:'https://example.test/room.mp4',label:'教室'},
  {id:'slides',offset:0,url:'https://example.test/slides.mp4',label:'课件'}
 ],workletSource:'',onStatus:message=>statuses.push(message)
});
try{
 const switching=bank.select('room');
 setTimeout(()=>{clock.currentTime+=1.5;},20);
 await switching;
 const first=elements[0];
 assert.equal(bank.state().activeId,'room','normal-speed switch should keep room audio');
 assert.equal(clock.muted,true,'master audio mutes only once candidate plays');
 assert.equal(first.muted,false,'independent raw audio must be audible');
 assert.equal(first.crossOrigin,undefined,'raw audio must not request CORS');
 assert.equal(first.paused,false,'candidate starts playback after seek');
 assert(first.seeks>=2,'test must exercise final alignment seek');
 assert.equal(first.readyState,3,'candidate is playable with less than 350ms of reported buffer');
 assert(!statuses.some(message=>message.includes('恢复主音轨')),'no spurious fallback to teacher');
 await bank.select('slides');
 assert.equal(bank.state().activeId,'slides','second normal-speed switch succeeds');
 assert(!statuses.some(message=>message.includes('恢复主音轨')),'second switch must not fall back');
 const cancelled=bank.select('room');
 assert.equal(bank.state().wantedId,'room');
 assert.equal(bank.state().activeId,'slides','the old track remains audible while loading');
 await bank.select('teacher');
 assert.equal(await cancelled,false,'a newer selection cancels the previous handoff');
 assert.equal(bank.state().activeId,'teacher');
 assert.equal(first.paused,true,'cancelled tracks cannot continue playing');
 assert.equal(clock.muted,false);
 clock.pause();
 await bank.select('slides');
 assert.equal(bank.state().activeId,'slides','a paused player can select a different track');
 assert.equal(bank.state().media.paused,true,'selection does not start a paused player');
 console.log('PASS 1x audio switch after seeks: play before buffer validation; no false teacher fallback');
}finally{bank.destroy();}
