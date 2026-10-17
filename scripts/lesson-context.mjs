// Keep player, audio and captions on the same school lesson identifier.
export function classroomLessonId(scope=window){
 const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;
 const pick=params=>{for(const key of ['id','videoId','videoInfoId','videoinfoId','lectureId']){const value=valid(params.get(key));if(value)return value;}return null;};
 const hash=scope.location.hash||'',queryAt=hash.indexOf('?');
 const fromHash=pick(new URLSearchParams(queryAt<0?'':hash.slice(queryAt+1)));
 if(fromHash)return fromHash;
 const fromSearch=pick(new URLSearchParams(scope.location.search||''));if(fromSearch)return fromSearch;
 // Vue sometimes has already resolved the route while the address bar is changing.
 const route=scope.document.querySelector('#app')?.__vue__?.$route;
 if(route&&(!route.fullPath||route.fullPath===hash.slice(1))){
  const fromRoute=pick(new URLSearchParams(route.query||{}));if(fromRoute)return fromRoute;
 }
 return null;
}
