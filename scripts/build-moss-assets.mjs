// Package the validated FP32 graph and pinned ONNX Runtime Web without any
// private classroom audio. Split WASM to fit the static host's per-file limit.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const research=process.argv[2];if(!research)throw Error('research directory required');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const model=readFileSync(join(research,'moss-webgpu.onnx')),wasm=readFileSync(join(research,'package/dist/ort-wasm-simd-threaded.asyncify.wasm'));
const version='moss-fp32-ort130-'+digest(model).slice(0,12),base='tablet/vendor/'+version,dir='portal/'+base;mkdirSync(dir,{recursive:true});
const files={};function asset(name,bytes){writeFileSync(join(dir,name),bytes);return {path:'/'+base+'/'+name,sha256:digest(bytes),bytes:bytes.length};}
files.model=asset('moss-se16k.onnx',model);
files.wasm=[];for(let offset=0;offset<wasm.length;offset+=16*1024*1024)files.wasm.push(asset('ort-'+files.wasm.length+'.bin',wasm.subarray(offset,offset+16*1024*1024)));
files.mjs=asset('ort-wasm-simd-threaded.asyncify.js',readFileSync(join(research,'package/dist/ort-wasm-simd-threaded.asyncify.mjs')));
files.sdk=asset('ort.webgpu.min.js',readFileSync(join(research,'package/dist/ort.webgpu.min.js')));
const manifest={schema:'ce-moss-assets/1',model:'MossFormerGAN_SE_16K',precision:'float32',input:[1,2,401,201],audioSeconds:2.5,version,files};
writeFileSync('portal/tablet/moss-assets.json',JSON.stringify(manifest));
const license=readFileSync('processor/licenses/ONNX-RUNTIME.txt','utf8');writeFileSync(join(dir,'ORT-LICENSE.txt'),license);copyFileSync('processor/licenses/CLEARER-VOICE.txt',join(dir,'MODEL-LICENSE.txt'));copyFileSync('processor/licenses/ONNX-NOTICES.txt',join(dir,'ORT-NOTICES.txt'));
writeFileSync(join(dir,'MODEL-NOTICE.txt'),'MossFormerGAN_SE_16K, Alibaba / ClearerVoice-Studio, Apache-2.0.\nOriginal: https://huggingface.co/alibabasglab/MossFormerGAN_SE_16K\nONNX conversion: https://huggingface.co/TigreGotico/audiosronnx-mossformergan/tree/5f471c9d92dda80c0883cc850227fd878b334b08\nModified for browser compatibility: 132 Einsum operations lowered to equivalent broadcasting/MatMul; static input shapes simplified. Float32 parameters retained. See processor/moss_webgpu_export.py.\n');
console.log({version,totalBytes:model.length+wasm.length,files:Object.keys(files)});
