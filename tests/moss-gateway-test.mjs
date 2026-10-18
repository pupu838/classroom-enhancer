import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMossGateway,MOSS_MODEL} from '../cloud/moss_gateway.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
let calls=0;const input=Buffer.alloc(100,7),output=Buffer.alloc(44+32000);
const body={mode:'moss-segment',model:MOSS_MODEL,data:input.toString('base64'),sha256:sha(input),trimSeconds:.5,duration:1};
const good={protocol:'ce-moss-segment/1',model:MOSS_MODEL,inputSha256:sha(input),trimSeconds:.5,duration:1,sampleRate:16000,samples:16000,pcmScale:4,data:output.toString('base64'),sha256:sha(output)};
const disabled=createMossGateway();assert.equal((await disabled({mode:'moss-health'})).ready,false);await assert.rejects(()=>disabled(body),/尚未开通/);
const relay=createMossGateway({url:'https://private.example/enhance',token:'server-only-'.repeat(5),enabled:true,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://private.example/enhance');assert.equal(options.headers.Authorization,'Bearer '+'server-only-'.repeat(5));assert(!options.body.includes('server-only'));return Response.json(good);}});
assert.equal((await relay({mode:'moss-health'})).ready,true);assert.equal(calls,0,'readiness must never spin up a billable GPU');
assert.deepEqual(await relay(body),good);assert.equal(calls,1);await assert.rejects(()=>relay({...body,sha256:'0'.repeat(64)}),/校验失败/);assert.equal(calls,1);
for(const change of [{samples:15999},{inputSha256:'0'.repeat(64)},{pcmScale:1},{trimSeconds:0},{sha256:'0'.repeat(64)}]){const broken=createMossGateway({url:'https://private.example/enhance',token:'x'.repeat(40),enabled:true,fetcher:async()=>Response.json({...good,...change})});await assert.rejects(()=>broken(body),/校验失败/);}
const redirect=createMossGateway({url:'https://private.example/enhance',token:'x'.repeat(40),enabled:true,fetcher:async()=>new Response(null,{status:302})});await assert.rejects(()=>redirect(body),/暂不可用/);
const missingProxy=createMossGateway({url:'https://private.example.modal.run/enhance',token:'x'.repeat(40),enabled:true});assert.equal((await missingProxy({mode:'moss-health'})).ready,false);
const protectedRelay=createMossGateway({url:'https://private.example.modal.run/enhance',token:'x'.repeat(40),proxyKey:'wk-'+'a'.repeat(20),proxySecret:'ws-'+'b'.repeat(20),enabled:true,fetcher:async(url,options)=>{assert.equal(options.headers['Modal-Key'],'wk-'+'a'.repeat(20));assert.equal(options.headers['Modal-Secret'],'ws-'+'b'.repeat(20));return Response.json(good);}});assert.deepEqual(await protectedRelay(body),good);
console.log('PASS unconfigured gate, no GPU readiness call, authenticated bounded forwarding, input/output hashes, duration and scale validation');
