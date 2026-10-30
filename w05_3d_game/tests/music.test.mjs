import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicState,MusicDirector} from '../src/music.js';
import {composeScore,STEMS,SCORE_SECONDS} from '../src/music-score.js';

function settle(state,distance,occluded=false,escape=false,seconds=12){let mix;for(let i=0;i<seconds*60;i++)mix=state.update(1/60,distance,occluded,escape);return mix;}
test('Music escalates from exploration to tension, chase and escape, leaving room for close footsteps',()=>{
  const far=settle(new MusicState(),12),medium=settle(new MusicState(),7),chase=settle(new MusicState(),4),close=settle(new MusicState(),.8),escape=settle(new MusicState(),12,false,true);
  assert.equal(far.chase,0);assert.equal(far.escape,0);assert.equal(far.tension,0);assert.ok(far.exploration>0);
  assert.ok(medium.tension>far.tension);assert.equal(medium.chase,0);assert.ok(chase.chase>.6);assert.ok(close.chase<chase.chase);
  assert.ok(escape.escape>.6);assert.ok(escape.chase>.5);
});
test('Walls reduce tension and chase holds across corners instead of repeatedly restarting',()=>{
  const exposed=settle(new MusicState(),5),hidden=settle(new MusicState(),5,true);assert.equal(hidden.chase,0);assert.ok(hidden.tension<exposed.tension);
  const state=new MusicState();settle(state,4);const behindCorner=settle(state,7,true,false,2);assert.ok(behindCorner.chase>.65);
  const released=settle(state,12,true,false,15);assert.ok(released.chase<.001);state.reset();assert.equal(state.hold,0);assert.equal(state.chase,0);
});
test('Original music stems are finite, loop aligned, non-silent and have bounded headroom',()=>{
  const {rate,tracks}=composeScore(8000);
  for(const key of STEMS){const samples=tracks[key];assert.equal(samples.length,rate*SCORE_SECONDS);let peak=0,energy=0;
    for(const v of samples){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v;}
    assert.ok(peak<=.651);assert.ok(Math.sqrt(energy/samples.length)>.02);assert.ok(Math.abs(samples[0]-samples.at(-1))<.12,`${key} loop seam`);
  }
});
test('Repeated activation, pause, resume and restart keep exactly one source per stem',async()=>{
  const sources=[],param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},cancelScheduledValues(){},linearRampToValueAtTime(){}});
  const ctx={currentTime:0,createGain(){return{gain:param(),connect(){return this;},disconnect(){}};},createBuffer(channels,length,rate){return{duration:length/rate,copyToChannel(){}};},createBufferSource(){const source={connect(){return this;},disconnect(){},start(time,offset){this.offset=offset;},stop(){this.stopped=true;}};sources.push(source);return source;}};
  const director=new MusicDirector(ctx,{},Promise.resolve(composeScore(8000)));await director.ready;
  director.setActive(true);director.setActive(true);assert.equal(director.sources.length,4);assert.equal(sources.length,4);
  ctx.currentTime=2;director.setActive(false);assert.equal(director.sources.length,0);assert.ok(sources.every(s=>s.stopped));
  ctx.currentTime=10;director.setActive(true);assert.equal(director.sources.length,4);assert.ok(sources.slice(-4).every(s=>s.offset===2));
  director.reset();assert.equal(director.sources.length,4);assert.ok(sources.slice(-4).every(s=>s.offset===0));director.setActive(false);
});
