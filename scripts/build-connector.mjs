import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
execFileSync('npm',['exec','--yes','--package=esbuild@0.25.12','--','esbuild','scripts/school-connector.mjs','--bundle','--format=iife','--target=es2022','--minify','--outfile=portal/school-connector.js'],{stdio:'inherit'});
const source=readFileSync('portal/school-connector.js','utf8');
writeFileSync('portal/Classroom_Connector.user.js',`// ==UserScript==\n// @name 西农课堂自动选课与音轨提取\n// @namespace classroom-enhancer\n// @version 0.4.0\n// @match https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*\n// @run-at document-idle\n// @grant none\n// @inject-into page\n// ==/UserScript==\n`+source);
mkdirSync('connector-extension',{recursive:true});copyFileSync('portal/school-connector.js','connector-extension/connector.js');copyFileSync('portal/MP4BOX-LICENSE.txt','connector-extension/MP4BOX-LICENSE.txt');
writeFileSync('connector-extension/manifest.json',JSON.stringify({manifest_version:3,name:'西农课堂连接器',version:'0.4.0',description:'使用学校当前登录读取课程与回放，在浏览器内提取原始音轨。',content_scripts:[{matches:['https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*'],js:['connector.js'],world:'MAIN',run_at:'document_idle'}]},null,2));
execFileSync('python3',['-c',"import zipfile;from pathlib import Path\nwith zipfile.ZipFile('portal/Classroom_Connector_Edge.zip','w',zipfile.ZIP_DEFLATED) as z:\n for f in sorted(Path('connector-extension').iterdir()):z.write(f,f.name)"]);
