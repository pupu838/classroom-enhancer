// Public controls describe audible filtering; they do not claim to remove reverb.
export const audioDefaults={gain:3,strength:.7,highpass:100,lowpass:6500,bass:0,body:0,presence:2,treble:0,ceiling:-8};
const ranges={gain:[-12,15],strength:[0,1],highpass:[20,400],lowpass:[3000,20000],bass:[-12,12],body:[-12,12],presence:[-12,12],treble:[-12,12],ceiling:[-18,-1]};
export function normalizeAudio(values={},base=audioDefaults){const out={};for(const [key,[min,max]] of Object.entries(ranges)){const n=Number(values[key]??base[key]);out[key]=Math.max(min,Math.min(max,Number.isFinite(n)?n:audioDefaults[key]));}return out;}
export const audioPresets={flat:{gain:0,strength:0,highpass:20,lowpass:20000,bass:0,body:0,presence:0,treble:0,ceiling:-1},gentle:{gain:1,strength:.25,highpass:70,lowpass:7800,bass:0,body:-2,presence:0,treble:-1,ceiling:-4},speech:{gain:2,strength:.5,highpass:120,lowpass:7200,bass:-2,body:-4,presence:3,treble:0,ceiling:-5}};
