export const layoutDefaults={arrangement:'auto',ratio:50,height:100,rects:{},selected:[],mode:'single'};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));
export function boundRect(rect){const w=clamp(rect.w,12,100),h=clamp(rect.h,12,100);return {x:clamp(rect.x,0,100-w),y:clamp(rect.y,0,100-h),w,h};}
export function cleanLayout(value={}){
 const arrangement=['auto','row','column','focus','free'].includes(value.arrangement)?value.arrangement:'auto',rects={};
 for(const id of ['teacher','room','slides'])if(value.rects?.[id])rects[id]=boundRect(value.rects[id]);
 return {arrangement,ratio:clamp(value.ratio??50,20,80),height:clamp(value.height??100,60,160),aspect:clamp(value.aspect??16/9,.25,6),rects,selected:[...new Set((Array.isArray(value.selected)?value.selected:[]).filter(id=>['teacher','room','slides'].includes(id)))],mode:['single','mix','all'].includes(value.mode)?value.mode:'single'};
}
export function viewRects(ids,layout,portrait=false){
 const arrangement=layout.arrangement==='auto'?(portrait?'column':ids.length===3?'focus':'row'):layout.arrangement,n=ids.length,ratio=layout.ratio||50,out={};
 ids.forEach((id,i)=>{
  if(arrangement==='free'&&layout.rects[id]){out[id]=boundRect(layout.rects[id]);return;}
  if(n===1){out[id]={x:0,y:0,w:100,h:100};return;}
  if(arrangement==='focus'&&n===3){out[id]=i===0?{x:0,y:0,w:ratio,h:100}:{x:ratio,y:(i-1)*50,w:100-ratio,h:50};return;}
  const column=arrangement==='column'||arrangement==='free'&&portrait,first=ratio,other=(100-first)/(n-1),at=i===0?0:first+(i-1)*other,size=i===0?first:other;
  out[id]=column?{x:0,y:at,w:100,h:size}:{x:at,y:0,w:size,h:100};
 });
 return {rects:out,arrangement,aspect:arrangement==='free'?layout.aspect||16/9:n===1?16/9:arrangement==='column'?16/(9*n):arrangement==='row'?16*n/9:16/9};
}
