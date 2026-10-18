// Build a private, same-segment audition from existing float32 research outputs.
// Usage: node scripts/build-audio-audition.mjs RESEARCH_DIR OUTPUT_DIR
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,createCipheriv} from 'node:crypto';
const [research,outArg]=process.argv.slice(2);if(!research||!outArg)throw Error('research and output directories required');
const out=resolve(outArg);mkdirSync(out,{recursive:true});const audioDir=join(out,'试听片段');mkdirSync(audioDir,{recursive:true});
const tmp=join(out,'.audio-build');mkdirSync(tmp,{recursive:true});
const ff=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{maxBuffer:16e6});
const load=(file,rate=48000,lag=0)=>{const dest=join(tmp,file+'.f32');ff(['-f','f32le','-ar',String(rate),'-ac','1','-i',join(research,file+'.f32'),'-af',`atrim=start=${2+lag/rate}:duration=25,asetpts=PTS-STARTPTS,aresample=48000`,'-f','f32le',dest]);const b=readFileSync(dest);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
const models={raw:load('lecture-30s'),rn:load('rnnoise-full',48000,480),gt:load('gtcrn-full-aligned'),df:load('deepfilter-24db-aligned'),moss:load('mossformergan-full-16k',16000),wpe:load('wpe_online_16k',16000)};
const saveFloat=(path,data)=>writeFileSync(path,new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
// spawnSync exposes successful ffmpeg's stderr (where measurement lives).
const {spawnSync}=await import('node:child_process');
function match(data,name){const path=join(tmp,name+'-in.f32');saveFloat(path,data);const r=spawnSync('ffmpeg',['-hide_banner','-nostats','-f','f32le','-ar','48000','-ac','1','-i',path,'-af','loudnorm=I=-20:TP=-2:LRA=7:print_format=json','-f','null','-'],{encoding:'utf8',maxBuffer:2e6});if(r.status!==0)throw Error(r.stderr);const measured=JSON.parse(r.stderr.match(/\{[\s\S]*\}/)[0]);const gain=Math.min(10**((-20-Number(measured.input_i))/20),10**((-2-Number(measured.input_tp))/20));return Float32Array.from(data,v=>v*gain);}
const assets={};for(const [key,data] of Object.entries(models)){models[key]=match(data,key);const source=join(tmp,key+'.f32');saveFloat(source,models[key]);const dest=join(tmp,key+'.m4a');ff(['-f','f32le','-ar','48000','-ac','1','-i',source,'-c:a','aac','-b:a','128k',dest]);assets[key]=readFileSync(dest).toString('base64');}
const presets=[
 ['00','原声','raw',0,{}],['01','原声 · 低中频减弱','raw',0,{body:-4,presence:2,highpass:100,lowpass:7800}],
 ['02','RNNoise · 轻','rn',.3,{}],['03','RNNoise · 中','rn',.7,{}],['04','RNNoise · 全量','rn',1,{}],
 ['05','GTCRN · 混合','gt',.5,{}],['06','GTCRN · 全量','gt',1,{}],
 ['07','DeepFilterNet · 混合','df',.5,{}],['08','DeepFilterNet · 全量','df',1,{}],
 ['09','MossFormerGAN · 混合','moss',.5,{}],['10','MossFormerGAN · 全量','moss',1,{}],
 ['11','WPE 去混响试验','wpe',1,{}]
].map(([id,label,model,mix,eq])=>({id,label,model,mix,eq}));
const preference=JSON.parse(readFileSync('docs/preferred-audition.json','utf8').replace(/^\uFEFF/,''));
const {model:preferredModel,mix:preferredMix,...preferredEq}=preference.settings;
presets.push({id:'12',label:'我的首选',model:preferredModel,mix:preferredMix,eq:preferredEq});
for(const preset of presets.filter(p=>p.id!=='12')){const raw=models.raw,processed=models[preset.model];let data=Float32Array.from(raw,(v,i)=>v*(1-preset.mix)+(processed[i]||0)*preset.mix);const file=join(tmp,'mix.f32');saveFloat(file,data);const filters=preset.id==='01'?'highpass=f=100,lowpass=f=7800,equalizer=f=450:t=q:w=0.8:g=-4,equalizer=f=2200:t=q:w=0.8:g=2,':'';const filtered=join(tmp,'filtered.f32');ff(['-f','f32le','-ar','48000','-ac','1','-i',file,'-af',filters+'anull','-f','f32le',filtered]);const bytes=readFileSync(filtered);data=match(new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)),preset.id);saveFloat(file,data);ff(['-f','f32le','-ar','48000','-ac','1','-i',file,'-c:a','aac','-b:a','128k',join(audioDir,preset.id+'_'+preset.label.replaceAll(' · ','_')+'.m4a')]);}
const payload=JSON.stringify({assets,presets,duration:25});
const template=readFileSync('scripts/audio-audition.html','utf8');
writeFileSync(join(out,'课堂声音试听台.html'),template.replace('__AUDIO_DATA__',JSON.stringify({plain:JSON.parse(payload)})));
// The public portal stores ciphertext only; the fragment key stays in the user's link.
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
writeFileSync('portal/audio-lab.html',template.replace('__AUDIO_DATA__',JSON.stringify({iv:iv.toString('base64'),cipher:encrypted.toString('base64')})));
const url='https://classroom-enhancer-global-5rcwipvd.edgeone.dev/audio-lab.html#'+key.toString('base64url');writeFileSync(join(out,'iPad试听入口.txt'),url+'\n');
writeFileSync(join(out,'试听说明.txt'),'同一课堂 3:02–3:27，12 组 25 秒试听。响度约 -20 LUFS，单独片段经过固定增益匹配。网页内模型基底已匹配响度，混合时响度可能略有变化。\n09/10 为离线计算的强模型候选，尚未接入课堂实时播放；这台电脑计算 30 秒音频约 3 分钟。\n课堂助手的实时调节仍使用 RNNoise，开放滤波、均衡、增益和混合控制，不代表已解决混响。\n网页试听的设置仅适用于该试听页，可导出；包含强模型的试听设置不能直接导入课堂实时调节。\n网页链接的 # 后部分是试听访问钥匙，请完整复制。\n');
console.log(JSON.stringify({clips:presets.length,seconds:25,assets:Object.keys(assets).length,htmlBytes:readFileSync(join(out,'课堂声音试听台.html')).length}));
