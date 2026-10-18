// Runs only on explicit request; this worker never opens school media.
self.onmessage=async({data})=>{
 if(data.type!=='start')return;
 let session;
 const progress=(stage,extra={})=>postMessage({type:'progress',stage,...extra});
 try{
  const base=new URL(data.origin),response=await fetch(new URL('/tablet/moss-assets.json',base),{cache:'no-store'});if(!response.ok)throw Error('检测组件暂时无法读取');const manifest=await response.json();
  if(manifest.schema!=='ce-moss-assets/1'||manifest.precision!=='float32')throw Error('检测组件版本不匹配');
  const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('浏览器没有提供可用的图形加速');
  const adapterInfo={vendor:adapter.info?.vendor||'',architecture:adapter.info?.architecture||''};
  async function asset(item){if(!item.path.startsWith('/tablet/vendor/')||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>20*1024*1024)throw Error('组件地址异常');const r=await fetch(new URL(item.path,base),{cache:'force-cache'});if(!r.ok)throw Error('组件下载失败：'+r.status);const bytes=await r.arrayBuffer();if(bytes.byteLength!==item.bytes)throw Error('组件下载不完整');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw Error('组件校验未通过');return bytes;}
  progress('download',{label:'首次准备模型与组件，后续可使用缓存…'});
  // Fetch and validate the SDK before importScripts; the same immutable URL is cached.
  await asset(manifest.files.sdk);importScripts(new URL(manifest.files.sdk.path,base).href);
  const parts=[];for(let i=0;i<manifest.files.wasm.length;i++){progress('download',{label:'准备组件 '+(i+1)+' / '+manifest.files.wasm.length});parts.push(new Uint8Array(await asset(manifest.files.wasm[i])));}
  const wasm=new Uint8Array(parts.reduce((n,v)=>n+v.length,0));let at=0;for(const part of parts){wasm.set(part,at);at+=part.length;}
  const model=await asset(manifest.files.model);await asset(manifest.files.mjs);
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmBinary=wasm;ort.env.wasm.wasmPaths={mjs:new URL(manifest.files.mjs.path,base).href};
  progress('initialize',{label:'正在启动你选中的 Moss 模型…'});const began=performance.now();
  session=await ort.InferenceSession.create(model,{executionProviders:['webgpu'],graphOptimizationLevel:'all'});
  const initializationMs=performance.now()-began,input=new Float32Array(2*401*201);let random=123456789;
  for(let i=0;i<input.length;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;input[i]=(random/4294967296-.5)*1.5;}
  const tensor=new ort.Tensor('float32',input,[1,2,401,201]),times=[];
  for(let round=0;round<3;round++){
   progress('running',{round:round+1,label:'检测 '+(round+1)+' / 3，首轮包含启动准备…'});
   const t=performance.now(),result=await session.run({spec:tensor}),output=result[session.outputNames[0]];
   const values=await output.getData();if(values.length!==input.length||!values.every(Number.isFinite))throw Error('模型未产生有效结果');times.push(performance.now()-t);output.dispose();
  }
  const steadyMs=(times[1]+times[2])/2;
  postMessage({type:'result',report:{schema:'ce-moss-device/1',model:manifest.model,version:manifest.version,precision:'float32',adapter:adapterInfo,initializationMs,timesMs:times,audioSeconds:2.5,computeSeconds:steadyMs/1000,computeRatio:steadyMs/2500,headroomFor1x:steadyMs<1875,headroomFor2x:steadyMs<937.5,userAgent:data.userAgent}});
 }catch(e){postMessage({type:'error',error:e.message||String(e)});}
 finally{try{await session?.release();}catch{}}
};
