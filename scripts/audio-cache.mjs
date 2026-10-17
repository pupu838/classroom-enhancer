const memory=new Map();
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ce-lesson-audio',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readAudio(id,url){
 const local=memory.get(id);if(local?.url===url)return local.blob;
 let db;try{db=await open();const item=await new Promise((resolve,reject)=>{const r=db.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(item?.url===url&&item.blob?.size>0){memory.clear();memory.set(id,item);return item.blob;}}catch{}finally{db?.close();}return null;
}
export async function saveAudio(id,url,blob){
 memory.clear();memory.set(id,{id,url,blob});if(blob.size>80*1024*1024)return;
 let db;try{db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('audio','readwrite'),s=tx.objectStore('audio');s.put({id,url,blob,at:Date.now()});const r=s.getAll();r.onsuccess=()=>{for(const item of r.result.sort((a,b)=>b.at-a.at).slice(3))s.delete(item.id);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}catch{}finally{db?.close();}
}
