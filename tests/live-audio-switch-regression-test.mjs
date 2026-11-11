import assert from 'node:assert/strict';
import {createLiveAudio} from '../scripts/live-audio.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
globalThis.window=new EventTarget();
class Param{constructor(){this.value=1;}setTargetAtTime(value){this.value=value;}}
class Node{constructor(){this.gain=new Param();}connect(){}disconnect(){}}
class Context{constructor(){this.destination=new Node();this.currentTime=0;this.sampleRate=48000;}createGain(){return new Node();}createMediaElementSource(){return new Node();}createAnalyser(){return new Node();}async resume(){}async close(){}}
const media=[];
globalThis.Audio=class extends EventTarget{
 constructor(){super();this._time=0;this.seeks=0;this.readyState=4;this.paused=true;this.seeking=false;this.playbackRate=1;media.push(this);}
 get currentTime(){return this._time;}
 set currentTime(value){this._time=value;this.seeks++;}
 load(){}
 async play(){this.paused=false;}
 pause(){this.paused=true;}
 removeAttribute(){}
};
window.AudioContext=Context;
const clock=new EventTarget();
Object.assign(clock,{volume:.7,muted:false,currentTime:40,playbackRate:1,paused:false,seeking:false});
const messages=[];
const audio=createLiveAudio({
 clock,clockId:'teacher',
 views:[{id:'teacher',offset:0,url:'https://example.test/teacher.mp4',label:'老师'},{id:'room',offset:0,url:'https://example.test/room.mp4',label:'教室'},{id:'slides',offset:0,url:'https://example.test/slides.mp4',label:'课件'}],
 workletSource:'',onStatus:text=>messages.push(text)
});
const tick=setInterval(()=>{
 clock.currentTime+=.025;
 for(const a of media)if(!a.paused&&a.readyState>=3)a._time+=a.playbackRate*.025;
},25);
try{
 await audio.select('room');
 assert.equal(audio.state().activeId,'room');
 assert(clock.muted,'native master is muted only after external audio is ready');
 const track=media[0],before=track.seeks;
 clock.currentTime+=.25;
 await wait(650);
 assert.equal(track.seeks,before,'normal drift must not trigger MP4 seeks');
 assert(track.playbackRate>1,'gentle rate correction may close small drift');
 await audio.select('room');
 assert.equal(track.seeks,before,'reselecting an active track must be a no-op');
 clock.currentTime+=8;
 await wait(2400);
 assert.equal(audio.state().activeId,'teacher','large drift falls back rather than looping seeks');
 assert.equal(track.seeks,before,'drift recovery must not issue repeated hard seeks');
 assert.equal(clock.muted,false,'the original master audio must become audible again');
 assert(messages.some(x=>x.includes('持续不同步')));
 await audio.select('room');
 assert.equal(audio.state().activeId,'room');
 track.readyState=2;
 await wait(2100);
 assert.equal(audio.state().activeId,'room','a brief buffer stall must preserve the selected audio');
 track.readyState=4;
 await wait(1000);
 assert.equal(audio.state().activeId,'room','the same track must resume when data arrives');
 assert(Math.abs(clock.currentTime-track.currentTime)<.5,'one resync recovers the lost progress');
 track.readyState=2;
 await wait(6200);
 assert.equal(audio.state().activeId,'teacher','an extended buffer stall restores the audible master');
 assert.equal(clock.muted,false);
 console.log('PASS no repeat seeks on audio drift, stable switch, drift/buffering fallback to original audio');
}finally{clearInterval(tick);audio.destroy();}
