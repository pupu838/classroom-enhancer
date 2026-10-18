// Add the user-selected preset without changing its gain or invalidating the
// existing private audition link. The fragment key is read from a local file.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createDecipheriv,createCipheriv,randomBytes} from 'node:crypto';
const output=resolve(process.argv[2]||'../outputs');
const url=new URL(readFileSync(join(output,'iPad试听入口.txt'),'utf8').trim());
const key=Buffer.from(url.hash.slice(1),'base64url');
const current=readFileSync('portal/audio-lab.html','utf8');
const pack=JSON.parse(current.match(/const PACK=(.+);\r?\n/)[1]);
const encrypted=Buffer.from(pack.cipher,'base64');
const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(pack.iv,'base64'));
decipher.setAuthTag(encrypted.subarray(-16));
const data=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8'));
const preference=JSON.parse(readFileSync('docs/preferred-audition.json','utf8').replace(/^\uFEFF/,''));
if(preference.schema!=='ce-audition/1'||preference.settings.model!=='moss')throw Error('Unexpected preferred profile');
const {model,mix,...eq}=preference.settings;
const chosen={id:'12',label:'我的首选',model,mix,eq};
data.presets=data.presets.filter(p=>p.id!=='12');data.presets.push(chosen);
const payload=JSON.stringify(data),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const cipherText=Buffer.concat([cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
const template=readFileSync('scripts/audio-audition.html','utf8');
writeFileSync('portal/audio-lab.html',template.replace('__AUDIO_DATA__',JSON.stringify({iv:iv.toString('base64'),cipher:cipherText.toString('base64')})));
writeFileSync(join(output,'课堂声音试听台.html'),template.replace('__AUDIO_DATA__',JSON.stringify({plain:data})));
console.log({preset:chosen.id,label:chosen.label,settings:preference.settings,existingLinkPreserved:true});
