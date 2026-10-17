import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
let Processor;globalThis.sampleRate=48000;globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){}};}};globalThis.registerProcessor=(name,cls)=>{Processor=cls;};
const bundle=await build({entryPoints:['scripts/rnnoise-worklet.mjs'],define:{__RNNOISE_WASM_BASE64__:JSON.stringify(readFileSync('node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm').toString('base64'))},bundle:true,format:'esm',target:'safari16',write:false});await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const processor=new Processor();processor.port.onmessage({data:{type:'strength',value:1}});let noise=12345,inputEnergy=0,outEnergy=0,max=0;
const input=new Float32Array(128),output=new Float32Array(128);const start=performance.now();
for(let frame=0;frame<48_000/128*10;frame++){for(let i=0;i<128;i++){noise=(noise*1664525+1013904223)>>>0;input[i]=(noise/2**32-.5)*.05;}processor.process([[input]],[[output]]);if(frame>375){for(let i=0;i<128;i++){assert(Number.isFinite(output[i]));inputEnergy+=input[i]**2;outEnergy+=output[i]**2;max=Math.max(max,Math.abs(output[i]));}}}
const ms=performance.now()-start;assert(outEnergy<inputEnergy*.8);assert(ms<10000,'processing must beat real time');assert(max<1);console.log({pass:'RNNoise actual WASM 10 seconds continuous render, finite output, noise energy reduced',energyRatio:outEnergy/inputEnergy,computeMs:Math.round(ms)});
