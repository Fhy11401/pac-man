const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const ENEMY_VOICE_FILES=Object.freeze(Object.fromEntries(['search','spotted','chase','jumpscare'].map(key=>[key,new URL(`../assets/audio/enemy/${key}.wav`,import.meta.url)])));
export async function loadEnemyVoiceData(fetcher=globalThis.fetch){
  return Object.fromEntries(await Promise.all(Object.entries(ENEMY_VOICE_FILES).map(async([key,url])=>{
    try{const response=await fetcher(url);return[key,response.ok?await response.arrayBuffer():null];}catch{return[key,null];}
  })));
}
export function enemyVoiceMix(distance,pan=0,occluded=false){
  const presence=Number.isFinite(distance)?clamp(1-Math.max(0,distance)/11):0;
  return {gain:.9*presence**1.4*(occluded?.45:1),pan:clamp(pan,-1,1),cutoff:occluded?850:4800};
}

// Simulation time drives cadence; inaudible state changes never queue a late alert.
export class EnemyVoiceCadence{
  constructor(random=Math.random){this.random=random;this.reset();}
  reset(){this.mode='silent';this.alertCooldown=0;this.searchWait=2+this.random()*2;this.chaseWait=5+this.random()*3;}
  update(dt,{mode,active,audible}){
    const previous=this.mode;this.mode=mode;
    if(!active||mode==='silent')return null;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);
    this.alertCooldown=Math.max(0,this.alertCooldown-dt);
    this.searchWait=Math.max(0,this.searchWait-dt);this.chaseWait=Math.max(0,this.chaseWait-dt);
    const pursuing=mode==='chase'||mode==='locker',wasPursuing=previous==='chase'||previous==='locker';
    if(pursuing&&!wasPursuing){
      this.chaseWait=5+this.random()*3;
      if(this.alertCooldown===0){this.alertCooldown=4.5;if(audible)return 'spotted';}
    }
    if(!audible)return null;
    if(pursuing&&this.chaseWait===0){this.chaseWait=5+this.random()*3;return 'chase';}
    if((mode==='search'||mode==='investigate')&&this.searchWait===0){this.searchWait=8+this.random()*6;return 'search';}
    return null;
  }
}

export class EnemyVoice{
  constructor(ctx,spatialBus,cinematicBus,bytes,random=Math.random){
    this.ctx=ctx;this.spatialBus=spatialBus;this.cinematicBus=cinematicBus;this.random=random;
    this.cadence=new EnemyVoiceCadence(random);this.buffers={};this.active=new Set();this.spatial=null;
    this.ready=Promise.resolve(bytes).then(data=>Promise.all(Object.entries(data??{}).map(async([key,bytes])=>{
      if(!bytes)return;try{this.buffers[key]=await ctx.decodeAudioData(bytes);}catch{}
    }))).catch(()=>{});
  }
  stop(spatialOnly=false){
    const now=this.ctx.currentTime;
    for(const voice of this.active){
      if(spatialOnly&&!voice.spatial)continue;
      voice.level.gain.cancelScheduledValues(now);voice.level.gain.setTargetAtTime(0,now,.008);
      try{voice.source.stop(now+.035);}catch{}
      if(this.spatial===voice)this.spatial=null;
    }
  }
  reset(){this.stop();this.cadence.reset();}
  play(kind,{mix={gain:1,pan:0,cutoff:4800},delay=0,maxDuration=Infinity,offset=0,cinematic=false}={}){
    const buffer=this.buffers[kind];if(!buffer)return false;
    this.stop(!cinematic);
    const ctx=this.ctx,at=ctx.currentTime+delay,source=ctx.createBufferSource(),level=ctx.createGain(),envelope=ctx.createGain(),filter=ctx.createBiquadFilter(),stereo=ctx.createStereoPanner();
    const rate=cinematic?1:.98+this.random()*.04,duration=Math.min((buffer.duration-offset)/rate,maxDuration),end=at+duration;
    source.buffer=buffer;source.playbackRate.value=rate;filter.type='lowpass';filter.Q.value=.55;filter.frequency.value=mix.cutoff;
    const emphasis=kind==='spotted'?1.15:kind==='chase'?.9:1;
    level.gain.value=mix.gain*emphasis;stereo.pan.value=mix.pan;
    envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(1,at+.006);
    envelope.gain.setValueAtTime(1,Math.max(at+.006,end-.055));envelope.gain.linearRampToValueAtTime(0,end);
    source.connect(filter).connect(level).connect(envelope).connect(stereo).connect(cinematic?this.cinematicBus:this.spatialBus);
    const voice={kind,source,level,envelope,filter,stereo,spatial:!cinematic,emphasis,at,end};this.active.add(voice);if(!cinematic)this.spatial=voice;
    source.onended=()=>{this.active.delete(voice);if(this.spatial===voice)this.spatial=null;for(const node of [source,filter,level,envelope,stereo])node.disconnect();};
    source.start(at,offset);source.stop(end+.01);return true;
  }
  update(dt,{mode,distance,pan,occluded,active}){
    const mix=enemyVoiceMix(distance,pan,occluded),kind=this.cadence.update(dt,{mode,active,audible:mix.gain>.025});
    if(!active||mode==='silent'){if(this.spatial)this.stop(true);return;}
    if(kind)this.play(kind,{mix});
    if(this.spatial){const voice=this.spatial,now=this.ctx.currentTime;voice.level.gain.setTargetAtTime(mix.gain*voice.emphasis,now,.035);voice.stereo.pan.setTargetAtTime(mix.pan,now,.035);voice.filter.frequency.setTargetAtTime(mix.cutoff,now,.06);}
  }
}
