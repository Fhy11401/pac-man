import test from 'node:test';
import assert from 'node:assert/strict';
import {ScareCueGate,faceReveal,DEATH_REVEAL_AT,OPENING_REVEAL_AT,SCARE_VOICE_OFFSET} from '../src/scare-timing.js';
import {OPENING_STRIKE_AT,OPENING_STRIKE_DURATION} from '../src/opening-timing.js';
import {GameFullscreen} from '../src/fullscreen.js';
import {attendantMaterials} from '../src/enemy-model.js';
import {setThreatExposure} from '../src/threat-lighting.js';

test('death sound and face reveal share the first visible frame at all frame rates',()=>{
  for(const fps of [24,30,60,144]){
    const gate=new ScareCueGate();let fired=0;
    for(let i=0;i<fps;i++){
      const t=i/fps,cue=gate.deathCue(1,t);
      if(t<DEATH_REVEAL_AT){assert.equal(faceReveal(t,DEATH_REVEAL_AT),0);assert.equal(cue,false);}
      if(cue){fired++;assert.equal(faceReveal(t,DEATH_REVEAL_AT),1);assert(t-DEATH_REVEAL_AT<1/fps);}
      assert.equal(gate.deathCue(1,t),false,'same frame cannot retrigger');
    }
    assert.equal(fired,1);assert(gate.deathCue(2,DEATH_REVEAL_AT+.01));gate.reset();assert(gate.deathCue(1,DEATH_REVEAL_AT));
  }
  assert(OPENING_REVEAL_AT>OPENING_STRIKE_AT);assert(OPENING_REVEAL_AT<OPENING_STRIKE_AT+OPENING_STRIKE_DURATION);assert(SCARE_VOICE_OFFSET>0);
});
test('opening cue survives a paused frame and is consumed once or cancelled by reset',()=>{
  const g=new ScareCueGate();g.opening=true;assert(g.openingCue());assert.equal(g.openingCue(),false);g.opening=true;g.reset();assert.equal(g.openingCue(),false);
});
test('facial shadow changes uniforms without material recompilation or gameplay geometry changes',()=>{
  const m=attendantMaterials(),version=m.porcelain.version,shader={uniforms:{},fragmentShader:'#include <tonemapping_fragment>'};
  m.porcelain.onBeforeCompile(shader);assert(shader.fragmentShader.includes('gl_FragColor.rgb *= threatExposure'));
  setThreatExposure(m,.012);assert.equal(shader.uniforms.threatExposure.value,.012);setThreatExposure(m,1);assert.equal(shader.uniforms.threatExposure.value,1);assert.equal(m.porcelain.version,version);
  const textures=new Set();for(const material of Object.values(m)){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}for(const t of textures)t.dispose();
});
test('fullscreen detects current state and coalesces concurrent requests',async()=>{
  let calls=0,complete;const doc={fullscreenEnabled:true,fullscreenElement:null,documentElement:{requestFullscreen(){calls++;return new Promise(r=>complete=r);}}},f=new GameFullscreen(doc);
  const first=f.ensure(),second=f.ensure();assert.equal(calls,1);assert.equal(first,second);doc.fullscreenElement=doc.documentElement;complete();assert.equal(await first,true);assert.equal(await f.ensure(),true);assert.equal(calls,1);
});
test('denied start fullscreen never defers a request or rejects gameplay',async()=>{
  let calls=0;const doc={fullscreenEnabled:true,documentElement:{requestFullscreen(){calls++;return Promise.reject(Error('activation required'));}}},f=new GameFullscreen(doc);
  assert.equal(await f.ensure(),false);await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);assert.equal(f.pending,null);assert.equal(f.gesture,undefined);
  doc.fullscreenEnabled=false;await f.ensure();assert.equal(calls,1);
  doc.fullscreenEnabled=true;doc.documentElement.requestFullscreen=()=>{throw Error('denied');};assert.equal(await f.ensure(),false);
});
