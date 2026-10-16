'use strict';
const SCHOOL='https://ylb.nwafu.edu.cn',SCHOOL_URL=SCHOOL+'/TeachingCenterStudentWeb/index.html#/courseIndex.htm';
const $=id=>document.getElementById(id);let school=null,channel=null,poll=null,connected=false,activeCourse=null;
const courseMap=new Map(),episodeMap=new Map(),urls=[];
function status(text){$('status').textContent=text;}
function send(type,extra={}){if(!school||school.closed)throw Error('学校页面已关闭，请重新连接');school.postMessage({ce:'workbench-v1',channel,type,...extra},SCHOOL);}
function connect(){school=window.open(SCHOOL_URL,'ce-school-connection');if(!school){status('请允许打开学校登录页面，再点连接。');return;}channel=crypto.randomUUID();connected=false;clearInterval(poll);status('请在学校页面完成登录。已配置连接器时会自动读取课程。');let count=0;poll=setInterval(()=>{if(school.closed||++count>180){clearInterval(poll);if(!connected)status('未检测到连接器。请按下方说明配置一次，再重新连接。');return;}if(!connected)send('hello');},1000);}
$('login').onclick=connect;
$('refresh').onclick=()=>{try{send('courses');status('正在刷新课程…');}catch(e){status(e.message);}};
function renderCourses(items,term){courseMap.clear();$('course-list').replaceChildren();$('term').textContent=term||'当前学期';for(const c of items){if(!c||typeof c.id!=='string'||typeof c.name!=='string')continue;courseMap.set(c.id,c);const b=document.createElement('button');b.className='course';b.disabled=!c.recording;const name=document.createElement('strong'),sub=document.createElement('span');name.textContent=c.name;sub.textContent=c.recording?(c.teachers||'查看可用回放'):'暂无可用回放';b.append(name,sub);b.onclick=()=>{activeCourse=c.id;$('selected-course').textContent=c.name;$('episode-list').replaceChildren();episodeMap.clear();status('正在获取课次…');send('replays',{courseId:c.id});};$('course-list').append(b);}$('welcome').hidden=true;$('catalog').hidden=false;status(`已连接，读取到 ${courseMap.size} 门课程。`);}
function renderEpisodes(data){if(data.courseId!==activeCourse)return;$('episode-list').replaceChildren();episodeMap.clear();for(const r of data.items){if(!r||typeof r.id!=='string')continue;episodeMap.set(r.id,r);const label=document.createElement('label'),cb=document.createElement('input'),text=document.createElement('span');cb.type='checkbox';cb.value=r.id;const title=document.createElement('strong'),date=document.createElement('small');title.textContent=r.name;date.textContent=r.date;smallStyle(date);text.append(title,date);label.append(cb,text);$('episode-list').append(label);}$('more').hidden=!data.hasMore;$('extract').disabled=!episodeMap.size;status(`已列出 ${episodeMap.size} 个课次，勾选后点击自动提取。`);}
function smallStyle(e){e.style.display='block';}
$('more').onclick=()=>send('replays',{courseId:activeCourse,more:true});
$('select-all').onchange=e=>{for(const cb of $('episode-list').querySelectorAll('input'))cb.checked=e.target.checked;};
$('extract').onclick=()=>{const ids=[...$('episode-list').querySelectorAll('input:checked')].map(e=>e.value);if(!ids.length){status('请先勾选课次。');return;}if(ids.length>20){status('每次最多20个课次，请分批选择。');return;}$('extract').disabled=true;$('cancel').disabled=false;send('extract',{ids});status('正在自动读取音轨并提取音频。iPad 请切换到学校页面并保持前台。');};
$('cancel').onclick=()=>send('cancel');
window.addEventListener('message',event=>{const d=event.data;if(event.origin!==SCHOOL||event.source!==school||!d||d.ce!=='school-connector-v1'||d.channel!==channel)return;
 if(d.type==='connected'&&!connected){connected=true;clearInterval(poll);$('refresh').disabled=false;send('courses');status('已连接学校页面，正在读取课程…');}
 if(d.type==='catalog'&&Array.isArray(d.courses))renderCourses(d.courses,d.term);
 if(d.type==='replays'&&Array.isArray(d.items))renderEpisodes(d);
 if(d.type==='progress'){status(String(d.text||''));$('progress').value=Number(d.percent)||0;}
 if(d.type==='audio'&&d.blob instanceof Blob&&d.blob.size>0&&d.blob.size<300*1024*1024){const url=URL.createObjectURL(d.blob);urls.push(url);const box=document.createElement('article'),title=document.createElement('h3'),audio=document.createElement('audio'),a=document.createElement('a');title.textContent=String(d.name||'课堂音频');audio.controls=true;audio.src=url;a.href=url;a.download=String(d.name||'lecture.m4a');a.textContent=`保存音频 · ${(d.blob.size/1024/1024).toFixed(1)} MB`;box.append(title,audio,a);$('results').prepend(box);$('results-section').hidden=false;}
 if(d.type==='done'||d.type==='error'){$('extract').disabled=false;$('cancel').disabled=true;if(d.type==='done'){$('progress').value=100;status('提取完成，音频可以试听或保存。');}else status(String(d.message||'提取失败'));}
});
window.addEventListener('pagehide',()=>{clearInterval(poll);for(const url of urls)URL.revokeObjectURL(url);});
