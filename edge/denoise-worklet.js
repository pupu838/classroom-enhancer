// Allocation-free STFT in the audio render thread. No media seeking or network.
class ClassroomDenoise extends AudioWorkletProcessor {
 constructor(){
  super();this.n=1024;this.h=512;this.pos=0;this.strength=.7;
  this.input=new Float32Array(512);this.previous=new Float32Array(512);this.output=new Float32Array(512);this.tail=new Float32Array(512);
  this.re=new Float64Array(1024);this.im=new Float64Array(1024);this.window=new Float64Array(1024);this.cos=new Float64Array(512);this.sin=new Float64Array(512);this.reverse=new Uint16Array(1024);
  this.noise=new Float64Array(1024);this.sum=new Float64Array(1024);this.gains=new Float64Array(1024);this.gains.fill(1);this.calibrated=false;this.cal=0;this.count=0;
  for(let i=0;i<1024;i++){this.window[i]=Math.sin(Math.PI*i/1024);let bits=i,j=0;for(let k=0;k<10;k++){j=(j<<1)|(bits&1);bits>>=1;}this.reverse[i]=j;}
  for(let i=0;i<512;i++){this.cos[i]=Math.cos(2*Math.PI*i/1024);this.sin[i]=Math.sin(2*Math.PI*i/1024);}
  this.port.onmessage=({data:d})=>{if(d.type==='strength'&&Number.isFinite(d.value))this.strength=Math.max(0,Math.min(2,d.value));if(d.type==='calibrate'){this.sum.fill(0);this.count=0;this.cal=Math.ceil(sampleRate*1.5/512);}};
 }
 fft(inverse=false){
  const re=this.re,im=this.im;
  for(let i=0;i<1024;i++){const j=this.reverse[i];if(i<j){let v=re[i];re[i]=re[j];re[j]=v;v=im[i];im[i]=im[j];im[j]=v;}}
  for(let length=2;length<=1024;length<<=1){const half=length>>1,step=1024/length;for(let start=0;start<1024;start+=length){for(let j=0;j<half;j++){const c=this.cos[j*step],s=this.sin[j*step]*(inverse?1:-1),k=start+j,q=k+half,tr=c*re[q]-s*im[q],ti=s*re[q]+c*im[q];re[q]=re[k]-tr;im[q]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}}
  if(inverse)for(let i=0;i<1024;i++){re[i]/=1024;im[i]/=1024;}
 }
 frame(){
  const re=this.re,im=this.im;
  for(let i=0;i<1024;i++){re[i]=(i<512?this.previous[i]:this.input[i-512])*this.window[i];im[i]=0;}
  this.previous.set(this.input);this.fft();
  if(this.cal>0){for(let i=0;i<1024;i++)this.sum[i]+=re[i]*re[i]+im[i]*im[i];this.count++;if(--this.cal===0){for(let i=0;i<1024;i++)this.noise[i]=this.sum[i]/this.count;this.calibrated=true;this.gains.fill(1);this.port.postMessage({type:'calibrated'});}}
  if(this.calibrated&&this.cal===0&&this.strength>0){for(let i=0;i<1024;i++){const power=re[i]*re[i]+im[i]*im[i],target=Math.sqrt(Math.max(.1,1-this.strength*this.noise[i]/(power+1e-12))),gain=this.gains[i]=.8*this.gains[i]+.2*target;re[i]*=gain;im[i]*=gain;}}
  this.fft(true);
  for(let i=0;i<512;i++){this.output[i]=this.tail[i]+re[i]*this.window[i];this.tail[i]=re[i+512]*this.window[i+512];}
 }
 process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out.length)return true;for(let i=0;i<out[0].length;i++){let x=0;if(input?.length){for(const channel of input)x+=channel[i]||0;x/=input.length;}this.input[this.pos]=x;const y=this.output[this.pos];for(const channel of out)channel[i]=y;if(++this.pos===512){this.pos=0;this.frame();}}return true;}
}
registerProcessor('classroom-denoise',ClassroomDenoise);
