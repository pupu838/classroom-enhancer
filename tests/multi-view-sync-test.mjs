import assert from 'node:assert/strict';
import {createMultiViewSync} from '../scripts/multi-view-sync.mjs';
import {schoolVideoSources} from '../scripts/school-video-sources.mjs';
const file=(name,startTime,voiceStaus=1,voicePriority=999)=>({outerIp:'https://lzm1.nwafu.edu.cn',videoStorePath:`/bkt-lanz-record/${name}.mp4`,startTime,voiceStaus,voicePriority});
const sources=schoolVideoSources({teacherViewFiles:[file('teacher','2026-10-17 08:00:02')],studentViewFiles:[file('room','2026-10-17 08:00:00',0,1)],vgaViewFiles:[file('slides','2026-10-17 08:00:01')]});
assert.equal(sources.clockId,'room');assert.deepEqual(sources.views.map(v=>v.offset),[2,0,1]);
assert.throws(()=>schoolVideoSources({teacherViewFiles:[file('a',0,0),file('b',10,0)]}),/多个独立/);
class Video extends EventTarget{constructor(){super();this._time=0;this.seeks=0;this.duration=1000;this.paused=false;this.readyState=4;this.seeking=false;this.playbackRate=1;this.muted=false;}get currentTime(){return this._time;}set currentTime(v){this._time=v;this.seeks++;}pause(){this.paused=true;}async play(){this.paused=false;}}
const clock=new Video(),room=new Video(),slides=new Video(),events=[];clock.currentTime=100;
const sync=createMultiViewSync({clock,clockId:'teacher',views:[{id:'teacher',video:clock,offset:0},{id:'room',video:room,offset:2},{id:'slides',video:slides,offset:0}],onState:(id,state)=>events.push({id,state}),interval:100000});
try{
 sync.setVisible(['teacher','room','slides']);assert.equal(room.currentTime,98);assert.equal(slides.currentTime,100);assert(room.muted&&slides.muted);assert.equal(clock.muted,false);
 const before=room.seeks;room._time=97.8;sync.sync();assert.equal(room.seeks,before);assert(room.playbackRate>1&&room.playbackRate<=1.035);
 clock.currentTime=123;sync.setVisible(['room']);assert.equal(clock.currentTime,123);assert.equal(room.currentTime,121);assert.equal(slides.paused,true);
 clock.playbackRate=1.75;clock.dispatchEvent(new Event('ratechange'));assert(Math.abs(room.playbackRate-1.75)<.001);
 clock.paused=true;clock.dispatchEvent(new Event('pause'));assert.equal(room.paused,true);
 clock.paused=false;clock.dispatchEvent(new Event('playing'));await Promise.resolve();await Promise.resolve();assert.equal(room.paused,false);
 clock.dispatchEvent(new Event('waiting'));assert.equal(room.paused,true);sync.sync();assert.equal(room.paused,true);
 clock.dispatchEvent(new Event('playing'));await Promise.resolve();await Promise.resolve();assert.equal(room.paused,false);
 clock.currentTime=100;
 clock.buffered={length:1,start:()=>0,end:()=>clock.currentTime+.5};
 sync.setVisible(['room','slides']);sync.sync();assert(sync.isConserving());assert.equal(room.paused,true,'pause helper videos to reserve bandwidth for clock audio');
 assert(events.some(event=>event.id==='room'&&event.state==='priority'),'indicate audio priority while buffering');
 clock.buffered={length:1,start:()=>0,end:()=>clock.currentTime+5};
 sync.sync();assert(sync.isConserving(),'hysteresis must prevent repeated helper rebuffering');
 clock.buffered={length:1,start:()=>0,end:()=>clock.currentTime+10};
 sync.sync();await Promise.resolve();await Promise.resolve();assert(!sync.isConserving(),'recover secondary video once master audio has safe lead');
 delete clock.buffered;
 clock.currentTime=1;sync.sync(true);assert(events.some(event=>event.id==='room'&&event.state==='absent'));
 console.log('PASS three-view timing offsets, angle switch, audio-priority buffering hysteresis, play/pause sync, no tiny-drift hard seeks');
}finally{sync.destroy();}
