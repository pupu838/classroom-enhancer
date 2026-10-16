'use strict';
const schoolURL='https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/index.html#/studentAiAssistant.htm';
let job=null;
const $=id=>document.getElementById(id);
function validate(raw){
 if(raw.schema!=='classroom-media-job-v1'||!Array.isArray(raw.tracks)||raw.tracks.length<1||raw.tracks.length>10)throw Error('请选择从课堂采集的任务 JSON。');
 const replay=new URL(raw.replayUrl);if(replay.origin!=='https://ylb.nwafu.edu.cn'||!replay.pathname.startsWith('/TeachingCenterStudentWeb/'))throw Error('回放地址不属于学校云课堂。');
 return {...raw,tracks:raw.tracks.map(t=>{const u=new URL(t.url);if(u.protocol!=='https:'||!/^lzm\d+\.nwafu\.edu\.cn$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(u.pathname)||u.pathname.includes('..'))throw Error('媒体地址校验失败。');return {url:u.href,muted:!!t.muted,duration:Number.isFinite(t.duration)?t.duration:null};})};
}
function update(){
 const select=$('tracks');select.replaceChildren();job.tracks.forEach((t,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`画面 ${i+1} · ${t.muted?'默认静音':'默认发声'}${t.duration?' · '+Math.round(t.duration/60)+' 分钟':''}`;select.append(o);});
 select.value=Math.max(0,job.tracks.findIndex(t=>!t.muted));$('empty').hidden=true;$('task').hidden=false;$('name').textContent='已读取 '+job.tracks.length+' 路课程媒体';$('replay').href=job.replayUrl;$('status').textContent='任务只在当前浏览器内处理；媒体地址不会上传。';command();
}
function command(){const t=job.tracks[Number($('tracks').value)];$('command').value=`python fetch_audio.py '${t.url}' -o lecture.mp3`;}
$('file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>65536)throw Error('任务文件过大。');job=validate(JSON.parse(await f.text()));update();}catch(error){$('status').textContent=error.message;}};
$('tracks').onchange=command;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('command').value);$('status').textContent='命令已复制。需在安装了 Python 和 FFmpeg 的电脑运行。';}catch{$('command').select();$('status').textContent='请长按或手动复制命令。';}};
$('login').href=schoolURL;
fetch('./capture.js').then(r=>{if(!r.ok)throw Error();return r.text();}).then(code=>{$('capture').href='javascript:'+encodeURIComponent(code);$('capture-code').value=code;}).catch(()=>{$('status').textContent='课堂采集工具加载失败，请刷新页面。';});
