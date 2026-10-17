import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='https://classroom-enhancer-global-5rcwipvd.edgeone.dev';
const version='0.9.0';
// Keep the installed bridge stable; normal app releases use the runtime manifest.
const loaderVersion='0.7.0';
const result=await build({entryPoints:['scripts/school-connector.mjs'],bundle:true,format:'iife',target:'safari16',minify:true,write:false});
const neural=await build({entryPoints:['scripts/rnnoise-worklet.mjs'],define:{__RNNOISE_WASM_BASE64__:JSON.stringify(readFileSync('node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.wasm').toString('base64'))},bundle:true,format:'esm',target:'safari16',minify:true,write:false});
const page=`window.__CE_ASR_WORKER_SOURCE__=${JSON.stringify(readFileSync('scripts/local-asr-worker.js','utf8'))};\n`+`window.__CE_RNNOISE_SOURCE__=${JSON.stringify(neural.outputFiles[0].text)};\n`+`document.documentElement.dataset.ceAppVersion=${JSON.stringify(version)};\n`+readFileSync('edge/content.js','utf8')+'\n'+result.outputFiles[0].text;
const metadata=`// ==UserScript==\n// @name 西农课堂 iPad 字幕助手\n// @namespace classroom-enhancer-tablet\n// @version ${loaderVersion}\n// @description 多视角与三路声音、实时降噪和本机字幕；常规应用更新自动加载\n// @match https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*\n// @match ${origin}/*\n// @run-at document-idle\n// @inject-into content\n// @grant GM.getValue\n// @grant GM.setValue\n// @grant GM.xmlHttpRequest\n// @noframes\n// @downloadURL ${origin}/Classroom_iPad.user.js\n// @updateURL ${origin}/Classroom_iPad.meta.js\n// ==/UserScript==\n`;
const sha256=createHash('sha256').update(page).digest('hex');
mkdirSync('portal/tablet/runtime',{recursive:true});
writeFileSync(`portal/tablet/runtime/${sha256}.js`,page);
writeFileSync('portal/tablet-release.json',JSON.stringify({schema:'ce-runtime/1',version,sha256,path:`/tablet/runtime/${sha256}.js`,minimumBridge:1}));
const source=readFileSync('scripts/tablet-loader.js','utf8')+'\n'+readFileSync('scripts/tablet-bridge.js','utf8').replace('__CE_TABLET_FALLBACK__',()=>JSON.stringify({version,sha256,source:page})).replace('__CE_TABLET_PAGE_SOURCE__','""');
writeFileSync('portal/Classroom_iPad.user.js',metadata+source);writeFileSync(`portal/Classroom_iPad_v${version}.user.js`,metadata+source);writeFileSync('portal/Classroom_iPad.meta.js',metadata);
