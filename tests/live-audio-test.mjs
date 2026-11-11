import assert from 'node:assert/strict';
import {createLiveAudio} from '../scripts/live-audio.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));globalThis.window=new EventTarget();globalThis.__CE_AUDIO_PREPARE__=()=>{throw Error('must never download');};
class Param{constructor(){this.value=1;}setTargetAtTime(v){this.value=v;}}class Node{constructor(){for(const k of ['gain','frequency','Q','threshold','knee','ratio','attack','release'])this[k]=new Param();}connect(){}disconnect(){}}
class Context{constructor(){this.destination=new Node();this.currentTime=0;this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}createGain(){return new Node();}createMediaElementSource(){return new Node();}createAnalyser(){return new Node();}createBiquadFilter(){return new Node();}createDynamicsCompressor(){return new Node();}async resume(){}async close(){}}
const media=[];let rejectProcessedSlides=false;
globalThis.Audio=class extends EventTarget{
 constructor(){super();this.currentTime=0;this.readyState=4;this.paused=true;this.seeking=false;media.push(this);}
 load(){}
 async play(){
  if(rejectProcessedSlides&&this.crossOrigin&&this.src.endsWith('/slides.mp4'))throw new DOMException('Media host refused CORS','NotSupportedError');
  this.paused=false;
 }
 pause(){this.paused=true;}
 removeAttribute(){}
};
window.AudioContext=Context;window.__CE_RNNOISE_SOURCE__='fixture';globalThis.AudioWorkletNode=class extends Node{constructor(){super();this.port={postMessage(){}};}};
const clock=new EventTarget();Object.assign(clock,{volume:.8,muted:false,currentTime:100,playbackRate:2,paused:false,seeking:false,isConnected:true});
const bank=createLiveAudio({clock,views:[{id:'teacher',offset:2,url:'https://example/teacher.mp4'},{id:'room',offset:8,url:'https://example/room.mp4'},{id:'slides',offset:0,url:'https://example/slides.mp4'}],clockId:'teacher',workletSource:''});
try{await bank.select('teacher');assert.equal(clock.currentTime,100);assert.equal(media.length,0,'direct master audio must not open duplicate MP4 streams');assert.equal(clock.muted,false);await bank.setEnhanced(true);assert.equal(media[0].currentTime,100);assert(clock.muted);assert(bank.state().enhanced&&bank.state().neural);bank.update({gain:-6,strength:.25,body:-4,highpass:120});assert.equal(bank.state().tuning.gain,-6);assert.equal(bank.state().tuning.body,-4);bank.update({presence:Infinity,highpass:900});assert.equal(bank.state().tuning.highpass,400);assert(Number.isFinite(bank.state().tuning.presence));await bank.select('room');assert.equal(media[1].currentTime,94);assert.equal(clock.currentTime,100);assert.equal(media[1].playbackRate,2);assert(bank.state().enhanced);clock.playbackRate=5;clock.dispatchEvent(new Event('ratechange'));assert.equal(media[1].playbackRate,5,'5x master speed must reach independently selected audio');clock.playbackRate=2;clock.dispatchEvent(new Event('ratechange'));
 const pending=bank.select('slides');const slides=media.find(a=>a.src?.endsWith('/slides.mp4'));slides.readyState=1;await wait(10);assert.equal(bank.state().activeId,'room');assert.equal(media[1].paused,false,'current audio must continue while target buffers');slides.readyState=4;slides.dispatchEvent(new Event('canplay'));await pending;assert.equal(bank.state().activeId,'slides');assert.equal(slides.currentTime,102);assert.equal(clock.currentTime,100);
 await bank.setEnhanced(false);assert(!bank.state().enhanced);assert.equal(bank.state().activeId,'slides');assert.equal(clock.muted,true,'bypass stays on selected audio');bank.setVolume(.3);bank.setMuted(true);assert.equal(bank.getVolume(),.3);assert.equal(bank.getMuted(),true);
 clock.dispatchEvent(new Event('waiting'));await wait(600);assert.equal(slides.paused,true,'buffered clock must pause audio');clock.dispatchEvent(new Event('playing'));await wait(5);assert.equal(slides.paused,false);clock.currentTime=200;clock.dispatchEvent(new Event('seeking'));assert.equal(slides.currentTime,202);
 await bank.setEnhanced(false);await bank.select('teacher');assert.equal(clock.muted,true,'user muted setting is preserved on direct-master fallback');assert.equal(bank.state().started,false,'direct-master mode stops redundant external audio');
 await bank.setEnhanced(true);
 rejectProcessedSlides=true;
 await bank.select('slides');
 assert.equal(bank.state().activeId,'slides','CORS failure for optional effects must retain the chosen track in raw mode');
 assert.equal(bank.state().enhanced,false);
 assert.equal(media.at(-1).crossOrigin,undefined);
 assert.equal(media.at(-1).muted,true,'raw mode respects user mute');
 console.log('PASS direct audio, lazy MP4 streams, offsets, switches, buffering, volume, effects and raw fallback');
}finally{bank.destroy();}
