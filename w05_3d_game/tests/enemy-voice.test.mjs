import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EnemyVoice,EnemyVoiceCadence,enemyVoiceMix,loadEnemyVoiceData,ENEMY_VOICE_FILES} from '../src/enemy-voice.js';
import {Sound} from '../src/audio.js';
import {DEATH_REVEAL_AT,OPENING_REVEAL_AT} from '../src/scare-timing.js';
import {OPENING_CUT_AT} from '../src/opening-timing.js';
import {RULES} from '../src/world.js';

test('alert triggers once on pursuit onset and mode flicker cannot spam it',()=>{
  const c=new EnemyVoiceCadence(()=>.5),run=mode=>c.update(1/60,{mode,active:true,audible:true});
  assert.equal(run('patrol'),null);assert.equal(run('chase'),'spotted');
  for(let i=0;i<180;i++)assert.notEqual(run(i%2?'chase':'search'),'spotted');
  for(let i=0;i<180;i++)run('patrol');assert.equal(run('chase'),'spotted');
});
test('search and pursuit calls have sparse cadence at different frame rates; patrol stays quiet',()=>{
  for(const fps of [30,60,144])for(const mode of ['search','investigate','chase','patrol']){
    const c=new EnemyVoiceCadence(()=>.5),events=[];
    for(let i=0;i<fps*30;i++){const kind=c.update(1/fps,{mode,active:true,audible:true});if(kind)events.push({kind,at:i/fps});}
    if(mode==='patrol'){assert.equal(events.length,0);continue;}
    const repeated=events.filter(e=>e.kind!=='spotted');assert(repeated.length>=2&&repeated.length<=5);
    for(let i=1;i<repeated.length;i++){const gap=repeated[i].at-repeated[i-1].at;assert(gap>=(mode==='chase'?5:8));assert(gap<=(mode==='chase'?8.1:14.1));}
  }
});
test('pausing freezes cadence and inaudible state changes cannot queue a late spotted scream',()=>{
  const c=new EnemyVoiceCadence(()=>.5);c.update(.02,{mode:'chase',active:true,audible:false});
  assert.equal(c.update(.02,{mode:'chase',active:true,audible:true}),null);
  const left=c.chaseWait;for(let i=0;i<100;i++)c.update(.1,{mode:'chase',active:false,audible:true});assert.equal(c.chaseWait,left);
  c.reset();assert.equal(c.mode,'silent');assert.equal(c.alertCooldown,0);
});
test('distance, wall filtering and stereo pan stay bounded and attenuate monotonically',()=>{
  let previous=Infinity;for(const d of [0,1,3,6,10,11,Infinity]){const mix=enemyVoiceMix(d,4);assert(mix.gain<=previous);previous=mix.gain;assert.equal(mix.pan,1);}
  const open=enemyVoiceMix(3,-2),wall=enemyVoiceMix(3,-2,true);assert(wall.gain<open.gain);assert(wall.cutoff<open.cutoff);assert.equal(wall.pan,-1);assert.equal(enemyVoiceMix(Infinity).gain,0);
});
function audioContext(){
  const nodes=[],param=()=>({value:1,calls:[],setValueAtTime(...a){this.calls.push(['set',...a]);},linearRampToValueAtTime(...a){this.calls.push(['ramp',...a]);},setTargetAtTime(...a){this.calls.push(['target',...a]);},cancelScheduledValues(...a){this.calls.push(['cancel',...a]);}});
  const node=()=>{const n={connect(){return this;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  return {nodes,currentTime:2,decodeAudioData:async()=>({duration:1.1}),createGain:()=>Object.assign(node(),{gain:param()}),createBiquadFilter:()=>Object.assign(node(),{frequency:param(),Q:param()}),createStereoPanner:()=>Object.assign(node(),{pan:param()}),createBufferSource:()=>Object.assign(node(),{playbackRate:param(),starts:[],stops:[],start(...a){this.starts.push(a);},stop(...a){this.stops.push(a);}})};
}
test('sample playback follows spatial changes, bounds cinematic duration, and releases every node',async()=>{
  const ctx=audioContext(),v=new EnemyVoice(ctx,{}, {},{search:new ArrayBuffer(1),jumpscare:new ArrayBuffer(1)},()=>.5);await v.ready;
  assert(v.play('search',{mix:enemyVoiceMix(1)}));const spatial=v.spatial;
  v.update(.016,{mode:'search',distance:8,pan:-.8,occluded:true,active:true});assert(spatial.stereo.pan.calls.some(c=>c[1]===-.8));assert(spatial.filter.frequency.calls.some(c=>c[1]===850));
  assert(v.play('jumpscare',{cinematic:true,delay:.22,maxDuration:.48}));assert.equal(v.spatial,null);
  const scream=[...v.active].find(x=>x.kind==='jumpscare');assert.equal(scream.at,2.22);assert(Math.abs(scream.end-2.70)<1e-9);assert.equal(scream.source.playbackRate.value,1);
  const stops=scream.source.stops.length;v.stop(true);assert.equal(scream.source.stops.length,stops,'playing state changes do not cancel a cinematic');
  v.stop();assert(scream.source.stops.at(-1)[0]<scream.at,'pause cancels pending audio before its onset');
  for(const voice of [...v.active])voice.source.onended();assert.equal(v.active.size,0);assert(ctx.nodes.every(n=>n.disconnected));
});
test('a missing or invalid asset cannot delay a cue or prevent other clips from loading',async()=>{
  const bytes=await loadEnemyVoiceData(async url=>{if(url.pathname.endsWith('/chase.wav'))throw Error('offline');return {ok:!url.pathname.endsWith('/search.wav'),arrayBuffer:async()=>new ArrayBuffer(1)};});
  assert.equal(bytes.chase,null);assert.equal(bytes.search,null);
  const ctx=audioContext(),v=new EnemyVoice(ctx,{}, {},bytes);assert.equal(v.play('spotted'),false);await v.ready;assert(v.buffers.spotted);assert.equal(v.play('search'),false);
  ctx.decodeAudioData=async()=>{throw Error('invalid audio');};const broken=new EnemyVoice(ctx,{}, {},bytes);await broken.ready;assert.equal(broken.play('spotted'),false);
});
test('contact stays quiet until the render-triggered impact; opening cue ends at the power cut',()=>{
  const calls=[],s={enemyVoice:{stop(){}},vocalScare:(...a)=>{calls.push(a);return true;},tone(){},opening:{play(){}},stopEnemyVoice:()=>calls.push('stop')};
  Sound.prototype.event.call(s,'hit');assert.equal(calls.length,0);Sound.prototype.event.call(s,'scare-impact');assert.deepEqual(calls[0],[0,RULES.caughtSeconds-DEATH_REVEAL_AT]);
  Sound.prototype.event.call(s,'lens-strike');assert.equal(calls[1][0],0);assert(Math.abs(calls[1][1]-(OPENING_CUT_AT-OPENING_REVEAL_AT))<1e-9);
  Sound.prototype.event.call(s,'mains-fail');assert.equal(calls.at(-1),'stop');
});
test('shipped recordings are bounded mono PCM with intact metadata and headroom',async()=>{
  let total=0;for(const url of Object.values(ENEMY_VOICE_FILES)){
    const data=await readFile(url);total+=data.length;assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
    let offset=12,pcm,format;while(offset+8<=data.length){const id=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);if(id==='fmt ')format=data.subarray(offset+8,offset+8+size);if(id==='data')pcm=data.subarray(offset+8,offset+8+size);offset+=8+size+(size%2);}
    assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),1);assert.equal(format.readUInt32LE(4),48000);assert.equal(format.readUInt16LE(14),16);
    let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i))/32768);assert(peak>.05&&peak<.71);assert(pcm.length/96000<1.7);
  }assert(total<500000);
});
