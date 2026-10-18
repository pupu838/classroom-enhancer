import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('portal/tablet/moss-assets.json','utf8'));
assert.equal(manifest.schema,'ce-moss-assets/1');assert.equal(manifest.precision,'float32');
assert.deepEqual(manifest.input,[1,2,401,201]);
for(const item of [manifest.files.model,manifest.files.sdk,manifest.files.mjs,...manifest.files.wasm]){
 assert(item.path.startsWith('/tablet/vendor/'));assert(!item.path.includes('..'));
 const b=readFileSync('portal'+item.path);assert.equal(b.length,item.bytes);assert(b.length<20*1024*1024);assert.equal(createHash('sha256').update(b).digest('hex'),item.sha256);
}
const preferred=JSON.parse(readFileSync('docs/preferred-audition.json','utf8').replace(/^\uFEFF/,''));
assert.deepEqual(preferred.settings,{model:'moss',mix:1,gain:0,highpass:400,lowpass:20000,bass:-12,body:-12,presence:-12,treble:-12,ceiling:-1});
const worker=readFileSync('portal/moss-check-worker.js','utf8');assert(!worker.includes('__CE_AUDIO_PREPARE__'));assert(!worker.includes('nwafu.edu.cn'));
console.log('PASS pinned FP32 model/runtime integrity, bounded assets, exact selected profile; device check does not access school audio');
