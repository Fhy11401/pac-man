import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHeartbeatData,playHeartbeatSample} from '../src/heartbeat-sample.js';
test('recorded heartbeats preserve pitch and tighten attack spacing with faster heart rates',()=>{
 function run(interval){const starts=[],tracks=[],sound={heartbeatClip:{},ready:()=>true,threat:{},track:(source,nodes,end)=>tracks.push(end),ctx:{currentTime:2,createBiquadFilter:()=>({frequency:{value:0},gain:{value:0},connect(){return this;}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}}),createBufferSource:()=>({playbackRate:{value:0},connect(){return this;},start(at,offset,duration){starts.push({at,offset,duration,rate:this.playbackRate.value});}})}};assert(playHeartbeatSample(sound,.4,interval));return{starts,tracks};}
 const calm=run(.96),near=run(.337);assert(calm.starts[1].at>near.starts[1].at);assert(calm.starts.every(s=>s.rate===1));assert(near.starts.every(s=>s.rate===1));assert.deepEqual(calm.starts.map(s=>s.offset),[0,.31]);assert(near.tracks.every(t=>t<3));
});

test('recorded pulse shaping preserves distance scaling and cleans up every audio node',()=>{
 function render(volume){const levels=[],filters=[],cleanups=[];const sound={heartbeatClip:{},ready:()=>true,threat:{},track:(source,nodes)=>cleanups.push(nodes),ctx:{currentTime:0,createBiquadFilter:()=>{const node={frequency:{},gain:{},connect(){return this;}};filters.push(node);return node;},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(v){if(v>0)levels.push(v);}},connect(){return this;}}),createBufferSource:()=>({playbackRate:{},connect(){return this;},start(){}})}};playHeartbeatSample(sound,volume,.5);return{levels,filters,cleanups};}
 const near=render(.6),far=render(.2);assert.equal(near.levels.length,2);
 near.levels.forEach((gain,i)=>assert(Math.abs(gain/far.levels[i]-3)<1e-10));
 assert(near.filters.some(n=>n.type==='lowshelf'&&n.gain.value<0));assert(near.filters.some(n=>n.type==='highshelf'&&n.gain.value>0));
 assert(near.filters.every(n=>near.cleanups.some(nodes=>nodes.includes(n))));
});
test('missing recordings use the procedural fallback and loading failures remain contained',async()=>{
 assert.equal(playHeartbeatSample({heartbeatClip:null},.5,.6),false);assert.equal(await loadHeartbeatData(async()=>({ok:false})),null);assert.equal(await loadHeartbeatData(async()=>{throw Error('offline');}),null);
});
