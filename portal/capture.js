(() => {
  if (location.origin !== 'https://ylb.nwafu.edu.cn') { alert('请先在学校云课堂打开一节课程回放。'); return; }
  const videos = [...document.querySelectorAll('video')];
  const tracks = videos.map((v,i) => ({ index:i, url:v.currentSrc || v.querySelector('source')?.src || '', duration:Number.isFinite(v.duration)?v.duration:null, muted:v.muted })).filter(t=>/^https:\/\/lzm\d+\.nwafu\.edu\.cn\/bkt-lanz-record\/[A-Za-z0-9_./-]+\.mp4$/.test(t.url));
  if (!tracks.length) { alert('尚未读取到课程音轨，请先播放回放，再重试。'); return; }
  const data = {schema:'classroom-media-job-v1',createdAt:new Date().toISOString(),title:document.title,replayUrl:location.href,tracks};
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='classroom-media-job.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
})();
