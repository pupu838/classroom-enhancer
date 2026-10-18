// Tencent Function URL CAM signing. Used only on the authenticated server.
// https://cloud.tencent.com/document/product/583/96100
import {createHash,createHmac} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,s)=>createHmac('sha256',key).update(s).digest();
export const isTencentMossUrl=url=>!!url&&['.tencentscf.com','.scf.tencentcs.com'].some(s=>url.hostname.endsWith(s));
export const tencentMossReady=c=>!!c&&typeof c.secretId==='string'&&c.secretId.length>=16&&typeof c.secretKey==='string'&&c.secretKey.length>=16&&/^\d{5,20}$/.test(c.uin||'');
export function tencentMossHeaders(url,payload,credentials,timestamp=Math.floor(Date.now()/1000)){
 if(!isTencentMossUrl(url)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!tencentMossReady(credentials))throw Error('Tencent Moss CAM configuration incomplete');
 const date=new Date(timestamp*1000).toISOString().slice(0,10),scope=date+'/scf/tc3_request';
 const canonical='POST\n'+url.pathname+'\n\ncontent-type:application/json\nhost:'+url.host+'\n\ncontent-type;host\n'+sha(payload);
 const signing=hmac(hmac(hmac('TC3'+credentials.secretKey,date),'scf'),'tc3_request');
 const signature=createHmac('sha256',signing).update('TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+sha(canonical)).digest('hex');
 return {'Content-Type':'application/json',Authorization:`TC3-HMAC-SHA256 Credential=${credentials.secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,'X-Scf-Cam-Uin':credentials.uin,'X-Scf-Cam-Timestamp':String(timestamp),...(credentials.sessionToken?{'X-Scf-Cam-Token':credentials.sessionToken}:{})};
}
