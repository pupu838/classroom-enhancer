// Stable content-context loader. Only page code is remote; GM and tokens stay here.
async function loadClassroomRuntime(GM,origin,fallback){
 const key='ce-runtime-cache-v1',status=text=>{document.documentElement.dataset.ceUpdateStatus=text;};
 const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
 const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;};
 let current=fallback;
 try{const cached=await GM.getValue(key,null);if(cached&&/^\d+\.\d+\.\d+$/.test(cached.version)&&typeof cached.source==='string'&&cached.source.length<1500000&&await sha(cached.source)===cached.sha256&&!newer(fallback.version,cached.version))current=cached;}catch{}
 async function get(path,timeout){const r=await GM.xmlHttpRequest({url:origin+path,method:'GET',responseType:'text',timeout});if(r.status!==200)throw Error('更新服务器暂时不可用');return r.responseText||r.response;}
 async function check(){
  const manifest=JSON.parse(await get('/tablet-release.json?check='+Date.now(),4000));
  if(manifest.schema!=='ce-runtime/1'||!/^\d+\.\d+\.\d+$/.test(manifest.version)||!/^[a-f0-9]{64}$/.test(manifest.sha256)||manifest.path!=='/tablet/runtime/'+manifest.sha256+'.js')throw Error('更新信息校验失败');
  if(manifest.minimumBridge>1){status('加载组件需要升级，请从安装页更新一次。');return null;}
  if(newer(current.version,manifest.version))return null;
  if(manifest.sha256===current.sha256){status('已是最新版本；播放期间不会更换代码。');return current;}
  const source=await get(manifest.path,8000);if(typeof source!=='string'||source.length>1500000||await sha(source)!==manifest.sha256)throw Error('更新文件校验失败');
  const release={version:manifest.version,sha256:manifest.sha256,source};await GM.setValue(key,release);return release;
 }
 let launched=false;
 const pending=check().then(release=>{if(release&&launched&&release.sha256!==current.sha256)status('新版 '+release.version+' 已准备，下次重新打开页面自动使用。');return release;}).catch(()=>{status('更新检查暂不可用，正在使用已保存的版本。');return null;});
 const release=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve(null),1800))]);
 if(release)current=release;launched=true;
 if(release)status('当前 '+current.version+'；重新打开页面自动检查更新。');
 const timer=setInterval(()=>{if(document.visibilityState==='visible')check().then(next=>{if(next&&next.sha256!==current.sha256)status('新版 '+next.version+' 已准备，下次重新打开页面自动使用。');}).catch(()=>{});},10*60*1000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});return current.source;
}
