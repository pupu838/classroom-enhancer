import {getStore} from '@edgeone/pages-blob';
import {asrClient} from '../../cloud/tencent-asr.mjs';
import {createService} from '../../cloud/tablet-service.mjs';
import {createMossGateway} from '../../cloud/moss_gateway.mjs';
import {timingSafeEqual} from 'node:crypto';
export default async function onRequest({request,env}){
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const config={...process.env,...env};
 if(!config.CE_API_TOKEN||config.CE_API_TOKEN.length<32||!config.TENCENT_SECRET_ID||!config.TENCENT_SECRET_KEY)return json({error:'后台尚未完成识别服务配置'},503);
 try{const store=getStore({name:'classroom-private-v1',consistency:'strong'});
  if(new URL(request.url).searchParams.get('op')==='pair'){
   if(request.method!=='POST')return json({error:'请求方法无效'},405);
   const text=await request.text();if(text.length>200)return json({error:'连接码无效'},400);const code=JSON.parse(text).code,expected=config.CE_PAIR_CODE;
   if(typeof code!=='string'||!expected||Buffer.byteLength(code)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return json({error:'连接码无效'},401);
   if(await store.get('pair-used/'+expected,{consistency:'strong'}))return json({error:'此连接码已使用，需要生成新连接码'},409);
   await store.set('pair-used/'+expected,'used');return json({token:config.CE_API_TOKEN});
  }
  const asr=asrClient(config.TENCENT_SECRET_ID,config.TENCENT_SECRET_KEY);const moss=createMossGateway({url:config.CE_MOSS_URL,token:config.CE_MOSS_TOKEN,proxyKey:config.CE_MOSS_PROXY_KEY,proxySecret:config.CE_MOSS_PROXY_SECRET,enabled:config.CE_MOSS_ENABLED==='1'});const service=createService({store,asr,moss,secret:config.CE_API_TOKEN,sweepSecret:config.CE_SWEEP_TOKEN,origin:new URL(request.url).origin});return json(await service(request));}
 catch(e){return json({error:e.status?e.message:'后台暂时不可用，请稍后查询任务状态'},e.status||500);}
}
