// Bound memory and latency: retain at most one recent six-second chunk while
// inference is busy. Old speech is dropped instead of accumulating forever.
export class CaptionQueue{
 constructor(){this.reset();}
 reset(){this.blocks=[];this.length=0;this.end=0;this.lastEnd=null;this.rate=1;}
 push(pcm,end,rate=1){if(this.lastEnd!==null&&(Math.abs(end-this.lastEnd)>(pcm.length/16000*rate+2)||rate!==this.rate))this.reset();this.rate=rate;this.lastEnd=end;this.end=end;this.blocks.push(pcm);this.length+=pcm.length;while(this.length>16000*6&&this.blocks.length>1){this.length-=this.blocks.shift().length;}}
 take(){if(this.length<16000*6)return null;const audio=new Float32Array(this.length);let offset=0;for(const block of this.blocks){audio.set(block,offset);offset+=block.length;}const end=this.end;this.blocks=[];this.length=0;return {audio,end};}
}
