import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
const origin='https://classroom-enhancer-global-5rcwipvd.edgeone.dev';
const result=await build({entryPoints:['scripts/school-connector.mjs'],bundle:true,format:'iife',target:'safari16',minify:true,write:false});
const page=readFileSync('edge/content.js','utf8')+'\n'+result.outputFiles[0].text;
const metadata=`// ==UserScript==\n// @name 西农课堂 iPad 字幕助手\n// @namespace classroom-enhancer-tablet\n// @version 0.6.0\n// @description 登录学校、选择课次后自动提取音频并提交字幕识别，回放时自动加载字幕\n// @match https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*\n// @match ${origin}/*\n// @run-at document-idle\n// @inject-into content\n// @grant GM.getValue\n// @grant GM.setValue\n// @grant GM.xmlHttpRequest\n// @noframes\n// @downloadURL ${origin}/Classroom_iPad.user.js\n// @updateURL ${origin}/Classroom_iPad.meta.js\n// ==/UserScript==\n`;
const source=readFileSync('scripts/tablet-bridge.js','utf8').replace('__CE_TABLET_PAGE_SOURCE__',()=>JSON.stringify(page));
writeFileSync('portal/Classroom_iPad.user.js',metadata+source);writeFileSync('portal/Classroom_iPad.meta.js',metadata);
