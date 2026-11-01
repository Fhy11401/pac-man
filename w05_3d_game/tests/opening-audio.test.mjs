import test from 'node:test';
import assert from 'node:assert/strict';
import {openingSamples,OpeningAudio} from '../src/opening-audio.js';
test('opening effects contain audible sustained energy without clipping',()=>{
 for(const kind of ['monitor-watch','mains-fail','backup-start']){const data=openingSamples(kind,24000);assert(data.length>=24000*2.5);assert(data.every(x=>Number.isFinite(x)&&Math.abs(x)<1));const tail=data.slice(24000,48000),rms=Math.sqrt(tail.reduce((s,x)=>s+x*x,0)/tail.length);assert(rms>.01,`${kind}: ${rms}`);}
});
test('generator resumes at its paused cursor and stop invalidates its ended callback',()=>{
 const sources=[],ctx={currentTime:0,sampleRate:1000,createBuffer:(_,length,rate)=>({duration:length/rate,copyToChannel(){}}),createBufferSource(){const s={connect(){},disconnect(){},start(_,offset){this.offset=offset;},stop(){}};sources.push(s);return s;}};
 const sound=new OpeningAudio(ctx,{});sound.play('backup-start');ctx.currentTime=1.2;sound.setPaused(true);assert.equal(sound.offset,1.2);ctx.currentTime=9;sound.setPaused(false);assert.equal(sources[1].offset,1.2);sources[0].onended();assert.equal(sound.source,sources[1]);sound.stop();sources[1].onended();assert.equal(sound.source,null);assert.equal(sound.buffer,null);
});

test('the impact is short and bounded, after a substantially quieter anticipation beat',()=>{
 const rate=24000,bed=openingSamples('monitor-watch',rate),hit=openingSamples('lens-strike',rate);
 const rms=data=>Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);
 assert.equal(hit.length,rate*.48);assert.ok(hit.every(x=>Number.isFinite(x)&&Math.abs(x)<.8));
 const quiet=rms(bed.slice(rate*12,rate*12.6)),impact=rms(hit.slice(0,rate*.12));assert.ok(impact>quiet*20);assert.equal(hit[0],0);
});
