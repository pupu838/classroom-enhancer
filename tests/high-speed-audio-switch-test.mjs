import assert from 'node:assert/strict';
import {createLiveAudio} from '../scripts/live-audio.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
globalThis.window=new EventTarget();
class Param{constructor(){this.value=1;}setTargetAtTime(v){this.value=v;}}
class Node{constructor(){this.gain=new Param();}connect(){}disconnect(){}}
class Context{
 constructor(){this.destination=new Node();this.currentTime=0;this.sampleRate=48000;}
 createGain(){return new Node();}
 createMediaElementSource(){return new Node();}
 createAnalyser(){return new Node();}
 async resume(){}
 async close(){}
}
window.AudioContext=Context;
const media=[];
globalThis.Audio=class extends EventTarget{
 constructor(){super();this._currentTime=0;this.readyState=1;this.seeking=false;this.paused=true;this.playbackRate=1;this.seeks=0;this.buffered=null;this.rejectNext=false;media.push(this);}
 get currentTime(){return this._currentTime;}
 set currentTime(t){
  this._currentTime=t;this.seeks++;this.seeking=true;this.readyState=1;
  setTimeout(()=>{this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('canplay'));},75);
 }
 load(){this.readyState=1;}
 async play(){if(this.rejectNext){this.rejectNext=false;throw Error('blocked');}this.paused=false;}
 pause(){this.paused=true;}
 removeAttribute(){}
};
async function scenario(rate){
 media.length=0;
 const clock=new EventTarget();
 Object.assign(clock,{volume:.7,muted:false,currentTime:100,playbackRate:rate,paused:false,seeking:false,pauses:0,resumes:0});
 clock.pause=()=>{clock.pauses++;clock.paused=true;clock.dispatchEvent(new Event('pause'));};
 clock.play=async()=>{clock.resumes++;clock.paused=false;clock.dispatchEvent(new Event('playing'));};
 const warnings=[];
 const bank=createLiveAudio({clock,clockId:'teacher',views:[
  {id:'teacher',offset:0,url:'https://example.test/teacher.mp4',label:'老师'},
  {id:'room',offset:0,url:'https://example.test/room.mp4',label:'教室'},
  {id:'slides',offset:0,url:'https://example.test/slides.mp4',label:'课件'}
 ],workletSource:'',onStatus:s=>warnings.push(s)});
 const tick=setInterval(()=>{
  if(!clock.paused)clock.currentTime+=rate*.025;
  for(const a of media)if(!a.paused&&!a.seeking&&a.readyState>=3)a._currentTime+=a.playbackRate*.025;
 },25);
 try{
  // First stage opens the silent candidate. Keep the original clock sounding.
  const first=bank.select('room');
  await delay(45);
  assert.equal(clock.paused,false,rate+'x: original video must play while candidate is cold');
  const a=media[1];
  a.readyState=4;a.dispatchEvent(new Event('canplay'));
  await first;
  assert.equal(bank.state().activeId,'room',rate+'x: independent audio must become selected');
  assert.equal(clock.paused,false,rate+'x: video resumes automatically');
  assert.equal(a.paused,false,rate+'x: selected audio resumes automatically');
  assert.equal(clock.pauses,1,rate+'x: final alignment uses one brief pause');
  assert.equal(clock.resumes,1,rate+'x: video resumes exactly once');
  assert.equal(a.playbackRate,rate);
  assert(Math.abs(clock.currentTime-a.currentTime)<.75,rate+'x: audio must start within sync window');
  assert(a.seeks<=3,rate+'x: no infinite range-seek loop');
  // Switch again at full speed. Old audio must stay active while next track buffers.
  const second=bank.select('slides');
  await delay(45);
  assert.equal(bank.state().activeId,'room',rate+'x: old track stays selected until new track warms');
  assert.equal(clock.paused,false,rate+'x: old playback must not freeze during initial preload');
  const b=media[2];b.readyState=4;b.dispatchEvent(new Event('canplay'));
  await second;
  assert.equal(bank.state().activeId,'slides',rate+'x: second switch must succeed');
  assert.equal(clock.paused,false);
  assert.equal(clock.pauses,2,rate+'x: one bounded pause per switch');
  assert.equal(clock.resumes,2,rate+'x: clock resumed after second handoff');
  await delay(550);
  assert.equal(bank.state().activeId,'slides',rate+'x: sync checker must not immediately force native fallback');
  assert(!warnings.some(s=>s.includes('恢复主音轨')),rate+'x: no false fallback');
 }finally{clearInterval(tick);bank.destroy();}
}
for(const rate of [2,3,4,5])await scenario(rate);
console.log('PASS 2x/3x/4x/5x independent audio switch with bounded final alignment, no false fallback');
