const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict'),{buildSync}=require('esbuild');
(async()=>{const dom=new JSDOM('<video></video>',{url:'https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/index.html#/fullpage/aiClassroom.htm?videoId=lesson-1',runScripts:'outside-only'}),w=dom.window;try{
 w.document.documentElement.dataset.ceTabletBridge='1';w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:800,height:450});
 let calls=0;w.__CE_MOSS_CHECK__=async()=>{calls++;throw Error('withdrawn GPU cannot be called');};
 w.eval(fs.readFileSync('edge/content.js','utf8'));const root=w.document.getElementById('nwa-classroom-host').shadowRoot;
 assert.equal(root.getElementById('ce-moss-start'),null);assert.equal(root.getElementById('ce-moss-ab'),null);
 root.getElementById('open').click();w.dispatchEvent(new w.Event('ce-moss-check'));w.dispatchEvent(new w.Event('ce-audio-state'));await new Promise(r=>setTimeout(r,0));assert.equal(calls,0);
 assert(root.getElementById('ce-cloud-current'));assert(root.getElementById('ce-audio-download'));
 const runtime=buildSync({entryPoints:['scripts/school-connector.mjs'],bundle:true,format:'iife',write:false,target:'safari16'}).outputFiles[0].text;
 for(const withdrawn of ['moss-segment','moss-health','moss-se16k-fp32-v1','__CE_AUDIO_WINDOW__'])assert(!runtime.includes(withdrawn),'withdrawn GPU path remains in runtime: '+withdrawn);
 console.log('PASS GPU denoising removed: no controls, health requests or model pipeline; subtitles and independent audio download retained');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
