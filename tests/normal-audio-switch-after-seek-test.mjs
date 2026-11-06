import assert from 'node:assert/strict';
import {createLiveAudio} from '../scripts/live-audio.mjs';

globalThis.window=new EventTarget();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Param{constructor(){this.value=1;}setTargetAtTime(v){this.value=v;}}
class Node{constructor(){this.gain=new Param();}connect(){}disconnect(){}}
class Context{
 constructor(){this.currentTime=0;this.sampleRate=48000;this.destination=new Node();}
 createGain(){return new Node();}
 createMediaElementSource(){return new Node();}
 createAnalyser(){return new Node();}
 async resume(){}
 async close(){}
}
window.AudioContext=Context;
const elements=[];
globalThis.Audio=class extends EventTarget{
 constructor(){super();this._currentTime=0;this.seeking=false;this.readyState=0;this.paused=true;this.playbackRate=1;this.bufferAfterSeek=false;this.seeks=0;elements.push(this);}
 get currentTime(){return this._currentTime;}
 set currentTime(value){
  this._currentTime=value;this.seeks++;this.bufferAfterSeek=false;
  this.seeking=true;this.readyState=1;
  setTimeout(()=>{this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('canplay'));},55);
 }
 get buffered(){
  const self=this;
  return {length:self.bufferAfterSeek?1:0,start:()=>0,end:()=>self._currentTime+3};
 }
 load(){this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'));}
 async play(){this.paused=false;this.bufferAfterSeek=!this.seeking&&this.readyState>=3;}
 pause(){this.paused=true;}
 removeAttribute(){}
};
const clock=new EventTarget();
Object.assign(clock,{volume:.8,muted:false,currentTime:100,playbackRate:1,paused:false,seeking:false});
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
 const first=elements[1];
 assert.equal(bank.state().activeId,'room','normal-speed switch should keep room audio');
 assert.equal(clock.muted,true,'master audio mutes only once candidate plays');
 assert.equal(first.paused,false,'candidate starts playback after seek');
 assert(first.seeks>=2,'test must exercise final alignment seek');
 assert.equal(first.bufferAfterSeek,true,'candidate needs play() AFTER final seek to refill buffer');
 assert(!statuses.some(message=>message.includes('恢复主音轨')),'no spurious fallback to teacher');
 await bank.select('slides');
 assert.equal(bank.state().activeId,'slides','second normal-speed switch succeeds');
 assert(!statuses.some(message=>message.includes('恢复主音轨')),'second switch must not fall back');
 console.log('PASS 1x audio switch after seeks: play before buffer validation; no false teacher fallback');
}finally{bank.destroy();}
