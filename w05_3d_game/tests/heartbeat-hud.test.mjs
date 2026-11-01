import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound} from '../src/audio.js';
import {heartbeatVisual,HeartbeatHUD} from '../src/heartbeat-hud.js';

test('HUD follows the actual fallback audio attacks at both slow and fast rates',()=>{
  for(const interval of [.95,.34]){
    const tones=[],sound=Object.create(Sound.prototype);Object.assign(sound,{ctx:{currentTime:10},ready:()=>true,tone:(...args)=>tones.push(args),noiseBurst(){}});
    sound.heartbeat(.66,interval);assert.equal(sound.heartBeat.at,10);assert.equal(tones[2][4],sound.heartBeat.gap);
    const a=heartbeatVisual(sound.heartBeat,10+.025),b=heartbeatVisual(sound.heartBeat,10+sound.heartBeat.gap+.025);
    assert.ok(a.scale>1.15&&b.scale>1.1);assert.equal(heartbeatVisual(sound.heartBeat,20).scale,1);
    for(let i=0;i<300;i++)heartbeatVisual(sound.heartBeat,10+i/1000);
    assert.deepEqual(heartbeatVisual(sound.heartBeat,10+.025),a,'rendering does not advance a second clock');
  }
});

test('HUD uses audible output time, stays still when muted, and respects reduced motion',()=>{
  const nodes={'.heartbeat-icon':{style:{}},'.heartbeat-trace':{style:{}},'.heartbeat-sweep':{style:{}}},element={hidden:true,style:{},querySelector:s=>nodes[s]},hud=new HeartbeatHUD(element);
  const sound={playing:true,ctx:{currentTime:12,getOutputTimestamp:()=>({contextTime:10.025})},heartBeat:{at:10,gap:.15,gain:.66,interval:.65}};
  hud.update(sound,{visible:true});assert.equal(element.hidden,false);assert.match(nodes['.heartbeat-icon'].style.transform,/scale\(1\.18/);
  hud.update(sound,{visible:true,reduced:true});assert.equal(nodes['.heartbeat-icon'].style.transform,'translate(0px,0px) rotate(0deg) scale(1)');
  sound.muted=true;hud.update(sound,{visible:true});assert.equal(nodes['.heartbeat-icon'].style.transform,'translate(0px,0px) rotate(0deg) scale(1)');
  hud.update(sound,{visible:false});assert.equal(element.hidden,true);
});
