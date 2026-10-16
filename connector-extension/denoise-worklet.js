// Local STFT spectral subtraction. No network, model, microphone, or telemetry.
class ClassroomDenoise extends AudioWorkletProcessor {
  constructor() {
    super(); this.n=1024; this.h=512; this.pos=0; this.strength=1.2;
    this.input=new Float32Array(512); this.previous=new Float32Array(512);
    this.output=new Float32Array(512); this.tail=new Float32Array(512);
    this.noise=null; this.sum=new Float64Array(1024); this.cal=0; this.count=0;
    this.port.onmessage=({data:d})=>{
      if(d.type==='strength') this.strength=d.value;
      if(d.type==='calibrate'){this.sum.fill(0);this.count=0;this.cal=Math.ceil(sampleRate*1.5/512);}
    };
  }
  fft(re,im,inverse=false) {
    const n=re.length;
    for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len<<=1){const a=(inverse?2:-2)*Math.PI/len;for(let i=0;i<n;i+=len){for(let j=0;j<len/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=i+j,q=k+len/2;const tr=c*re[q]-s*im[q],ti=s*re[q]+c*im[q];re[q]=re[k]-tr;im[q]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}}
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
  }
  frame(){
    const re=new Float64Array(1024),im=new Float64Array(1024);
    for(let i=0;i<1024;i++)re[i]=(i<512?this.previous[i]:this.input[i-512])*Math.sin(Math.PI*i/1024);
    this.previous.set(this.input);this.fft(re,im);
    if(this.cal>0){for(let i=0;i<1024;i++)this.sum[i]+=re[i]*re[i]+im[i]*im[i];this.count++;if(--this.cal===0){this.noise=Float64Array.from(this.sum,x=>x/this.count);this.port.postMessage({type:'calibrated'});}}
    if(this.noise && this.cal===0) for(let i=0;i<1024;i++){const p=re[i]*re[i]+im[i]*im[i];const g=Math.sqrt(Math.max(.015,1-this.strength*this.noise[i]/(p+1e-12)));re[i]*=g;im[i]*=g;}
    this.fft(re,im,true);
    for(let i=0;i<512;i++){this.output[i]=this.tail[i]+re[i]*Math.sin(Math.PI*i/1024);this.tail[i]=re[i+512]*Math.sin(Math.PI*(i+512)/1024);}
  }
  process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out.length)return true;for(let i=0;i<out[0].length;i++){let x=0;if(input.length){for(const ch of input)x+=ch[i]||0;x/=input.length;}this.input[this.pos]=x;const y=this.output[this.pos];for(const ch of out)ch[i]=y;if(++this.pos===512){this.pos=0;this.frame();}}return true;}
}
registerProcessor('classroom-denoise',ClassroomDenoise);
