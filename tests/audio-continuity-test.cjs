const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let Processor,allocations=0;
const track=Type=>new Proxy(Type,{construct(target,args){allocations++;return Reflect.construct(target,args);}});
vm.runInNewContext(fs.readFileSync('denoise-worklet.js','utf8'),{AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},sampleRate:48000,registerProcessor:(_name,Class)=>Processor=Class,Float32Array:track(Float32Array),Float64Array:track(Float64Array),Uint16Array:track(Uint16Array),Math,Number});
const p=new Processor(),atStart=allocations,input=new Float32Array(48000),output=new Float32Array(48000);
for(let i=0;i<input.length;i++)input[i]=.2*Math.sin(2*Math.PI*440*i/48000);
for(let start=0;start<input.length;start+=128){const source=input.subarray(start,start+128),dest=output.subarray(start,start+128);p.process([[source]],[[dest]]);}
assert.equal(allocations,atStart,'render loop allocated typed arrays');
let error=0,energy=0;for(let i=2048;i<output.length;i++){error+=(output[i]-input[i-1024])**2;energy+=input[i-1024]**2;assert(Number.isFinite(output[i]));}
assert(error/energy<1e-10,'bypass has gaps or phase discontinuity');
let seed=123;const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return(seed/4294967296-.5)*.08;};
p.port.onmessage({data:{type:'calibrate'}});for(let block=0;block<600;block++)p.process([[Float32Array.from({length:128},noise)]],[[new Float32Array(128)]]);
let x=0,y=0;for(let block=0;block<400;block++){const a=Float32Array.from({length:128},noise),b=new Float32Array(128);p.process([[a]],[[b]]);for(let i=0;i<128;i++){x+=a[i]**2;y+=b[i]**2;}}
assert(y/x<.8,'calibrated noise was not reduced');assert.equal(allocations,atStart);
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('audio-sync.js','utf8'),context);
for(let now=1000;now<10000;now+=750)assert.equal(context.planAudioSync(20.2,20,1,now,0).seek,null,'small drift must not cause seeks');
assert.equal(context.planAudioSync(23,20,1,2000,1000).seek,null);assert.equal(context.planAudioSync(23,20,1,5000,1000).seek,23);assert.equal(context.planAudioSync(100,20,1,1000,900,true).seek,100);
console.log('PASS continuous DSP bypass, no render allocations, noise power ratio '+(y/x).toFixed(3)+', gentle sync without repeated tiny seeks');
