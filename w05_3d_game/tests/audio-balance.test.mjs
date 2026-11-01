import test from 'node:test';
import assert from 'node:assert/strict';
import {proximityMix,Sound} from '../src/audio.js';
import {DistanceMusicState,MusicDirector} from '../src/music.js';

test('heartbeat and enemy footsteps use exactly the same distance and wall attenuation',()=>{
 for(const occluded of [false,true]){let previous=Infinity,interval=0;for(const d of [0,1,3,5,8,10,Infinity]){const mix=proximityMix(d,occluded);assert.equal(mix.heartGain,mix.footGain);assert(mix.footGain<=previous);assert(mix.heartInterval>=interval);previous=mix.footGain;interval=mix.heartInterval;}}
 assert.equal(proximityMix(3,true).heartGain,proximityMix(3).heartGain*.62);
});
test('a chase selects the near track immediately even at a far distance behind a wall',()=>{
 const s=new DistanceMusicState();const mix=s.update(1/60,25,true,false,true);assert.equal(mix.far,0);assert.equal(mix.near,.45);assert.equal(s.blend,1);
 for(let i=0;i<120;i++)assert.equal(s.update(1/60,40,true,false,true).far,0);
 const release=s.update(1/60,25,true,false,false);assert(release.near>0);assert(s.hold>0);
});
test('chase onset writes gain now rather than scheduling a proximity crossfade',()=>{
 const changes=[],gain=k=>({cancelScheduledValues:t=>changes.push([k,'cancel',t]),setValueAtTime:(v,t)=>changes.push([k,'now',v,t]),setTargetAtTime:()=>changes.push([k,'fade'])});
 const d={active:true,volume:.325,bus:{gain:gain('bus')},state:new DistanceMusicState(),keys:['far','near'],ctx:{currentTime:10},gains:{far:{gain:gain('far')},near:{gain:gain('near')}}};
 MusicDirector.prototype.update.call(d,.016,20,true,false,true);assert(changes.some(x=>x[0]==='far'&&x[1]==='now'&&x[2]===0));assert(changes.some(x=>x[0]==='near'&&x[1]==='now'&&x[2]===.45));assert(!changes.some(x=>x[1]==='fade'));
});
test('sound forwards real pursuit state and emits equal envelope gains for nearby footsteps and heartbeats',()=>{
 const sounds=[],s={playing:true,enemyStride:1.64,heartClock:0,voiceClock:999,music:{update:(...args)=>sounds.push(['music',...args])},step:(gain,pan,enemy)=>sounds.push(['step',gain,enemy]),heartbeat:gain=>sounds.push(['heart',gain])};
 Sound.prototype.update.call(s,.02,0,3,0,false,false,1,0,true);assert.equal(sounds.find(x=>x[0]==='music').at(-1),true);assert.equal(sounds.find(x=>x[0]==='step')[1],sounds.find(x=>x[0]==='heart')[1]);
});
