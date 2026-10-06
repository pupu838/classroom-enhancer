// Versioned local classroom packages. No remote requests or credentials.
function installTranscript(shadow,getVideo) {
 const $=id=>shadow.getElementById(id),section=document.createElement('section');section.id='ce-transcript';
 section.innerHTML=`<h3>课堂字幕数据</h3><p id="ct-lesson" class="note"></p><label>导入课堂数据包<input id="ct-file" type="file" accept=".json,application/json"></label><label>字幕来源<select id="ct-source"><option value="school">学校网页字幕</option></select></label><label>字幕延后秒数<input id="ct-offset" type="number" min="-30" max="30" step="0.1" value="0" style="width:80px"></label><p id="ct-info" class="note">未导入数据包；学校字幕尚未核验。</p><details><summary>复核当前字幕</summary><p id="ct-original" class="note"></p><textarea id="ct-edit" aria-label="修订当前字幕" style="width:100%;height:70px"></textarea><label><input id="ct-reviewed" type="checkbox">我已对照音频核对这句话</label><button id="ct-current">读取当前句</button><button id="ct-save">另存修订</button></details><div class="row"><button id="ct-export">导出字幕数据包</button><button id="ct-metadata">导出课次信息</button></div><p id="ct-message" class="note" role="status"></p><hr>`;
 $('panel').prepend(section);
 let key='',pack=null,selected='school',offset=0,token=0,editing=null,fingerprint='',listeners=[],lastIdentity='',restore=0;
 const lesson=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('videoId')||location.pathname+location.hash.split('?')[0];
 const message=s=>$('ct-message').textContent=s;
 function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('classroom-enhancer',1);r.onupgradeneeded=()=>r.result.createObjectStore('transcripts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function storage(value,storageKey=key){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('transcripts',value===undefined?'readonly':'readwrite'),s=tx.objectStore('transcripts');const req=value===undefined?s.get(storageKey):s.put(value,storageKey);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function validate(data){
  if(data?.schema!=='classroom-enhancer/1'||data.lectureId!==key)throw Error('数据包格式不支持，或课次与当前视频不一致。');
  const duration=data.media?.duration;if(!finite(duration)||duration<=0||duration>86400)throw Error('数据包总时长无效。');
  const sourceHash=data.media?.sha256;if(typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('缺少媒体指纹。');
  const ranges=data.coverage?.intervals;if(!Array.isArray(ranges)||ranges.length>20000)throw Error('缺少处理区间。');let end=0;const intervals=ranges.map(r=>{if(!Array.isArray(r)||r.length!==2||!r.every(finite)||r[0]<end-0.001||r[1]<=r[0]||r[1]>duration+.01)throw Error('处理区间乱序、重叠或越界。');end=r[1];return [...r]});
  let edge=0,full=intervals.length>0;for(const r of intervals){if(Math.abs(r[0]-edge)>.01)full=false;edge=r[1]}full=full&&Math.abs(edge-duration)<.01;
  if(!['complete','partial'].includes(data.coverage.status)||(data.coverage.status==='complete'&&!full))throw Error('标记整课完成，但处理区间有缺口。');
  if(!Array.isArray(data.tracks)||!data.tracks.length||data.tracks.length>10)throw Error('字幕轨道数量无效。');let ids=new Set();
  const tracks=data.tracks.map(t=>{if(typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(t.id)||t.id==='school'||ids.has(t.id))throw Error('字幕轨道 ID 无效或重复。');ids.add(t.id);if(!['asr','school','revised'].includes(t.kind)||!Number.isInteger(t.revision)||t.revision<1||t.revision>100000)throw Error('字幕来源/版本无效。');if(!Array.isArray(t.segments)||t.segments.length>50000)throw Error('字幕段数量无效。');let prev=-1,segmentIds=new Set();
   const segments=t.segments.map(c=>{if(typeof c.id!=='string'||c.id.length>100||segmentIds.has(c.id)||!finite(c.start)||!finite(c.end)||c.start<0||c.start<prev||c.end<=c.start||c.end>duration+.05||typeof c.text!=='string'||!c.text.trim()||c.text.length>2000)throw Error('字幕文本或时间无效。');if(!intervals.some(r=>c.start>=r[0]-10&&c.end<=r[1]+10))throw Error('字幕不属于已处理区间。');prev=c.start;segmentIds.add(c.id);return {id:c.id,start:c.start,end:c.end,text:c.text,reviewed:c.reviewed===true,boundaryReview:c.boundaryReview===true,...(typeof c.originalText==='string'?{originalText:c.originalText.slice(0,2000)}:{})};});
   return {id:t.id,kind:t.kind,revision:t.revision,segments,...(typeof t.derivedFrom==='string'?{derivedFrom:t.derivedFrom.slice(0,80)}:{})};});
  return {schema:data.schema,lectureId:key,packageId:String(data.packageId||'').slice(0,100),media:{duration,sha256:sourceHash},coverage:{status:data.coverage.status,intervals},tracks};
 }
 function validMedia(){const v=getVideo();return !pack||!Number.isFinite(v?.duration)||Math.abs(v.duration-pack.media.duration)<=2;}
 function track(){return pack?.tracks.find(t=>t.id===selected);}
 function identity(){return selected==='school'?'school':`${fingerprint}:${selected}:${track()?.revision}:${offset}:${validMedia()}`;}
 function changed(){const id=identity();if(id!==lastIdentity){lastIdentity=id;listeners.forEach(f=>f());}}
 function paint(){
  $('ct-lesson').textContent=`本节课 ID：${key}`;const picker=$('ct-source');picker.replaceChildren(new Option('学校网页字幕','school'));
  for(const t of pack?.tracks||[])picker.add(new Option(`${t.kind==='asr'?'新识别稿':t.kind==='revised'?'修订稿':'学校存档'} · v${t.revision}`,t.id));picker.value=selected;$('ct-offset').value=offset;
  $('ct-info').textContent=!pack?'未导入数据包；学校字幕尚未核验。':!validMedia()?'数据包时长与视频不匹配，导入字幕已停用。':`${pack.coverage.status==='complete'?'已处理整段音频':'仅处理部分课堂'} · ${track()?.segments.length??0} 句（当前来源）。处理完成不代表识别准确；请核对同课次、同音轨及同步。`;
 }
 async function hash(data){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 async function persist(){const current=key;try{await storage({pack,selected,offset,fingerprint});}catch{if(key===current)message('当前可用，但本机保存失败，请导出数据包备份。');}}
 async function route(){const id=lesson();if(id===key)return;key=id;pack=null;selected='school';offset=0;fingerprint='';editing=null;token++;const ticket=++restore;paint();changed();try{const stored=await storage();if(ticket!==restore)return;if(stored?.pack){pack=validate(stored.pack);fingerprint=await hash(pack);if(ticket!==restore)return;selected=pack.tracks.some(t=>t.id===stored.selected)?stored.selected:'school';offset=finite(stored.offset)&&Math.abs(stored.offset)<=30?stored.offset:0;paint();changed();}}catch{if(ticket===restore)message('未能恢复本机字幕，请重新导入。');}}
 function download(name,data){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 $('ct-file').onchange=async()=>{const f=$('ct-file').files[0];if(!f)return;const ticket=++token;++restore;try{if(f.size>8*1024*1024)throw Error('数据包超过 8 MB。');const ready=validate(JSON.parse(await f.text()));const fp=await hash(ready);if(ticket!==token||lesson()!==key)return;const v=getVideo();if(Number.isFinite(v?.duration)&&Math.abs(v.duration-ready.media.duration)>2)throw Error('数据包时长与视频不匹配。');pack=ready;fingerprint=fp;selected='school';editing=null;paint();changed();await persist();message('已导入。请选择字幕来源，并核对几处音画时间。学校原字幕未被覆盖。');}catch(e){if(ticket===token)message('未导入：'+e.message+' 之前的数据保留。');}$('ct-file').value='';};
 $('ct-source').onchange=()=>{selected=$('ct-source').value;editing=null;paint();changed();persist();};
 $('ct-offset').onchange=()=>{const n=Number($('ct-offset').value);if(!finite(n)||Math.abs(n)>30){message('偏移范围为 -30 到 30 秒。');return;}offset=n;changed();persist();};
 function current(){const t=(getVideo()?.currentTime||0)-offset;return track()?.segments.find(c=>c.start<=t&&c.end>t);}
 $('ct-current').onclick=()=>{const c=current();if(!c){message('请先选择导入字幕，并定位到有字幕的时间。');return;}editing={id:c.id,trackId:selected};$('ct-edit').value=c.text;$('ct-original').textContent=`原始记录：${c.originalText||c.text}`;$('ct-reviewed').checked=false;};
 $('ct-save').onclick=async()=>{if(!editing||editing.trackId!==selected){message('请先读取当前句。');return;}const text=$('ct-edit').value.trim();if(!text||text.length>2000){message('修订文本需要 1–2000 字。');return;}const base=track();const id=base.kind==='revised'?base.id:base.id+'-revised';let target=pack.tracks.find(t=>t.id===id);if(!target){if(pack.tracks.length>=10){message('轨道数量已达上限，请导出备份。');return;}target={id,kind:'revised',revision:0,derivedFrom:base.id,segments:base.segments.map(c=>({...c,originalText:c.text}))};pack.tracks.push(target);}const c=target.segments.find(c=>c.id===editing.id);c.text=text;c.reviewed=$('ct-reviewed').checked;target.revision++;selected=id;editing=null;const snapshot=pack,course=key;const fp=await hash(snapshot);if(pack!==snapshot||course!==key)return;fingerprint=fp;paint();changed();await persist();message('修订另存，原识别稿保留。相关大纲需要重新生成。');};
 $('ct-export').onclick=()=>{if(!pack){message('尚无数据包。');return;}download('classroom.json',pack);};
 $('ct-metadata').onclick=()=>download('classroom-lesson.json',{lectureId:key,duration:Number.isFinite(getVideo()?.duration)?getVideo().duration:null});
 const timer=setInterval(()=>{route();if(pack){paintInfo();changed();}},500);
 function paintInfo(){if(!validMedia())$('ct-info').textContent='数据包时长与视频不匹配，导入字幕已停用。';}
 window.addEventListener('pagehide',()=>clearInterval(timer));route();
 return {identity,onChange:f=>listeners.push(f),label:()=>selected==='school'?'学校网页转写（未核验）':`${track()?.kind==='revised'?'修订字幕':'导入识别字幕'} v${track()?.revision} · ${pack?.coverage.status==='complete'?'音频处理完成，内容待核对':'部分课堂'}`,
  activeCues:()=>lesson()!==key||selected==='school'?null:!validMedia()?[]:(track()?.segments||[]).map(c=>({start:c.start+offset,end:c.end+offset,title:c.text,id:c.id})).filter(c=>c.start>=0),
  text:(time,fallback)=>{if(lesson()!==key||selected==='school')return fallback;if(!validMedia())return '';return (track()?.segments||[]).filter(c=>c.start<=time-offset&&c.end>time-offset).map(c=>c.text).join('\n');}};
}
