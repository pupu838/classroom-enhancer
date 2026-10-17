import assert from 'node:assert/strict';
import {CaptionQueue} from '../scripts/local-caption-queue.mjs';
const q=new CaptionQueue();for(let i=0;i<11;i++)q.push(new Float32Array(8000).fill(i),i/2);assert.equal(q.take(),null);q.push(new Float32Array(8000).fill(11),5.5);let job=q.take();assert.equal(job.audio.length,96000);assert.equal(job.audio[0],0);assert.equal(job.audio.at(-1),11);
for(let i=0;i<100;i++)q.push(new Float32Array(8000).fill(i),6+i/2);assert(q.length<=96000);job=q.take();assert.equal(job.audio[0],88);assert.equal(job.audio.at(-1),99);
q.push(new Float32Array(8000),100);q.push(new Float32Array(8000),200);assert.equal(q.length,8000,'seek discards stale audio');q.push(new Float32Array(8000),201,2);assert.equal(q.length,8000,'rate switch resets segment');q.reset();assert.equal(q.take(),null);
console.log('PASS local PCM bounded queue, six-second chunks, stale audio discarded on seek/rate, busy inference does not grow memory');
