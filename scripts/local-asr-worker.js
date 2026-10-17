// Runs in a dedicated worker. No school credentials or cloud API requests.
let pipe=null,busy=false,device='wasm';
const send=value=>self.postMessage(value);
const cleanText=value=>{const text=String(value||'').trim().slice(0,240),han=(text.match(/[\u3400-\u9fff]/g)||[]).length,letters=(text.match(/[a-zA-Z]/g)||[]).length;return letters>20&&han<letters*.25?'':text;};
self.onmessage=async({data:d})=>{
 try{
  if(d.type==='init'){
   const {pipeline,env}=await import(d.libraryURL);
   env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths=d.wasmBase;
   // Explicitly cache the engine too; model caching alone is insufficient for
   // Safari's worker fetches. Report its download rather than hanging at 100%.
   const originalFetch=self.fetch.bind(self);let engineCache=null;try{engineCache=await caches.open('ce-local-asr-engine-v1');}catch{}
   self.fetch=async(input,options)=>{const url=typeof input==='string'?input:input.url||String(input);if(!url.startsWith(d.wasmBase)||!url.endsWith('.wasm'))return originalFetch(input,options);
    let saved;try{saved=await engineCache?.match(url);}catch{}if(saved){send({type:'notice',message:'正在载入本机识别引擎缓存…'});return saved;}
    const response=await originalFetch(input,options);if(!response.ok||!response.body)return response;const reader=response.body.getReader(),total=Number(response.headers.get('content-length'))||0;let loaded=0;
    const stream=new ReadableStream({async pull(controller){try{const item=await reader.read();if(item.done){controller.close();return;}loaded+=item.value.length;send({type:'progress',file:'识别引擎',loaded,progress:total?Math.floor(loaded/total*100):0});controller.enqueue(item.value);}catch(e){controller.error(e);}},cancel:()=>reader.cancel()});
    const monitored=new Response(stream,{status:response.status,headers:response.headers});try{engineCache?.put(url,monitored.clone()).catch(()=>{});}catch{}return monitored;
   };
   const progress_callback=p=>{if(p.status==='progress')send({type:'progress',file:p.file,progress:Math.floor(p.progress||0)});};
   // Quantized Whisper currently produced corrupted mixed-language output on
   // the tested WebGPU path. Prefer deterministic WASM for this small model.
   if(!pipe){device='wasm';pipe=await pipeline('automatic-speech-recognition','onnx-community/whisper-tiny',{device,dtype:'q8',progress_callback});}
   send({type:'ready',device});return;
  }
  if(d.type==='transcribe'&&pipe&&!busy){busy=true;const begin=performance.now();try{let energy=0;for(const x of d.audio)energy+=x*x;if(energy/d.audio.length<1e-7){send({type:'result',id:d.id,text:'',seconds:0});return;}
   const result=await pipe(d.audio,{language:'chinese',task:'transcribe',return_timestamps:false,max_new_tokens:64,do_sample:false,repetition_penalty:1.15,no_repeat_ngram_size:4});send({type:'result',id:d.id,text:cleanText(result.text),seconds:(performance.now()-begin)/1000});
  }finally{busy=false;}}
 }catch(e){send({type:'error',id:d.id,message:String(e.message||e).slice(0,280)});busy=false;}
};
