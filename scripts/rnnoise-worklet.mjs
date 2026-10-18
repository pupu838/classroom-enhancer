// Classic RNNoise model: small enough to ship inside the existing auto-update
// limit. Compile synchronously once when loading the worklet, never per frame.
import createModule from '@jitsi/rnnoise-wasm/dist/rnnoise.js';
const base64=__RNNOISE_WASM_BASE64__,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',table=new Int16Array(128);for(let i=0;i<alphabet.length;i++)table[alphabet.charCodeAt(i)]=i;
const binary=new Uint8Array(base64.length*3/4-(base64.endsWith('==')?2:base64.endsWith('=')?1:0));let n=0,bits=0,at=0;for(let i=0;i<base64.length&&base64[i]!=='=';i++){n=(n<<6)|table[base64.charCodeAt(i)];bits+=6;if(bits>=8){bits-=8;binary[at++]=(n>>bits)&255;}}
const rn={wasmBinary:binary,instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(binary),imports);receive(instance);return instance.exports;}};createModule(rn);
class VoiceDenoise extends AudioWorkletProcessor{
 constructor(){super();this.state=rn._rnnoise_create(0);this.ptr=rn._malloc(480*4);this.pos=0;this.frame=new Float32Array(480);this.previous=new Float32Array(480);this.out=new Float32Array(480);this.strength=.7;this.bypassed=false;this.port.onmessage=({data})=>{if(data.type==='reset'||data.type==='bypass'){if(data.type==='bypass')this.bypassed=!!data.value;this.pos=0;this.out.fill(0);this.previous.fill(0);rn._rnnoise_destroy(this.state);this.state=rn._rnnoise_create(0);}if(data.type==='strength')this.strength=Math.max(0,Math.min(1,Number(data.value)||0));};}
 process(inputs,outputs){const input=inputs[0],output=outputs[0];if(!output?.length)return true;if(this.bypassed){for(let i=0;i<output[0].length;i++){let x=0;for(const channel of input||[])x+=channel[i]||0;if(input?.length)x/=input.length;for(const channel of output)channel[i]=x;}return true;}const heap=rn.HEAPF32,offset=this.ptr>>2;
  for(let i=0;i<output[0].length;i++){let x=0;for(const channel of input||[])x+=channel[i]||0;if(input?.length)x/=input.length;this.frame[this.pos]=x;const y=this.out[this.pos];for(const channel of output)channel[i]=y;
   if(++this.pos===480){this.pos=0;for(let k=0;k<480;k++)heap[offset+k]=this.frame[k]*32768;rn._rnnoise_process_frame(this.state,this.ptr,this.ptr);for(let k=0;k<480;k++)this.out[k]=this.previous[k]*(1-this.strength)+heap[offset+k]/32768*this.strength;this.previous.set(this.frame);}
  }return true;
 }
}
registerProcessor('classroom-rnnoise',VoiceDenoise);
