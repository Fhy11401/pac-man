import {STEMS} from './music-score.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export class DistanceMusicState {
  constructor(){this.reset();}
  reset(){this.near=false;this.hold=0;this.blend=0;}
  update(dt,distance,occluded=false,escape=false,chasing=false){
    dt=Math.max(0,Math.min(.1,dt));
    if(chasing){this.near=true;this.hold=1.5;this.blend=1;}
    else if(distance<=4){this.near=true;this.hold=1.5;}
    else if(distance>=5.2){this.hold=Math.max(0,this.hold-dt);if(this.hold===0)this.near=false;}
    this.blend+=((this.near?1:0)-this.blend)*(1-Math.exp(-dt*3.2));
    const level=.45*(1-clamp((3.2-distance)/2.6)*.25);
    return {far:level*(1-this.blend),near:level*this.blend};
  }
}

export class MusicState {
  constructor(){this.reset();}
  reset(){this.hold=0;this.pressure=0;this.chase=0;this.escape=0;}
  update(dt,distance,occluded,escape,chasing=false){
    dt=Math.max(0,Math.min(.1,dt));
    const pressure=clamp((9-distance)/7)*(occluded?.68:1);
    if(chasing||distance<2.8||(!occluded&&distance<5.8))this.hold=3.5;else this.hold=Math.max(0,this.hold-dt);
    const chase=this.hold>0?1:0;
    const approach=(value,target,rise,fall)=>value+(target-value)*(1-Math.exp(-dt*(target>value?rise:fall)));
    this.pressure=approach(this.pressure,pressure,3.5,.7);
    this.chase=chasing?1:approach(this.chase,chase,2.8,.55);
    this.escape=approach(this.escape,escape?1:0,1.8,1.8);
    // Music yields to nearby footsteps, breathing and the heartbeat.
    const duck=1-clamp((3.2-distance)/2.6)*.32;
    return {exploration:.48*(1-.45*this.chase),tension:.65*this.pressure*duck,chase:.70*Math.max(this.chase,this.escape*.85)*duck,escape:.62*this.escape*duck};
  }
}

export function prepareScore(){
  return new Promise(resolve=>{
    let worker;const finish=value=>{clearTimeout(timeout);worker?.terminate();resolve(value);};
    const timeout=setTimeout(()=>finish(null),15000);
    try{worker=new Worker(new URL('./music-worker.js',import.meta.url),{type:'module'});worker.onmessage=e=>finish(e.data);worker.onerror=()=>finish(null);}catch{finish(null);}
  });
}

export class MusicDirector {
  constructor(context,output,prepared){
    this.ctx=context;this.state=new MusicState();this.keys=STEMS;this.loaded=false;this.active=false;this.offset=0;this.startedAt=0;this.sources=[];this.buffers={};this.volume=.325;
    this.bus=context.createGain();this.bus.gain.value=0;this.bus.connect(output);
    this.gains=Object.fromEntries(STEMS.map(key=>{const node=context.createGain();node.gain.value=key==='exploration'?.48:0;node.connect(this.bus);return[key,node];}));
    this.ready=prepared.then(async score=>{
      if(score)for(const key of STEMS){const buffer=context.createBuffer(1,score.tracks[key].length,score.rate);buffer.copyToChannel(score.tracks[key],0);this.buffers[key]=buffer;}
      // Optional local tracks replace the corresponding original stems. Empty by default.
      try{
        const manifestURL=new URL('../assets/music/tracks.json',import.meta.url),response=await fetch(manifestURL);
        if(!response.ok)return;
        const manifest=await response.json(),loaded={};
        if(manifest.mode==='distance-pair'){
          await Promise.all(['far','near'].map(async key=>{
            if(typeof manifest[key]!=='string')return;
            const url=new URL(manifest[key],manifestURL);if(url.origin!==manifestURL.origin)return;
            try{const file=await fetch(url);if(file.ok)loaded[key]=await context.decodeAudioData(await file.arrayBuffer());}catch{}
          }));
          if(loaded.far&&loaded.near){
            this.keys=['far','near'];this.buffers=loaded;this.state=new DistanceMusicState();
            for(const gain of Object.values(this.gains))gain.disconnect();
            this.gains=Object.fromEntries(this.keys.map(key=>{const node=context.createGain();node.gain.value=key==='far'?.45:0;node.connect(this.bus);return [key,node];}));
          }
          return;
        }
        await Promise.all(STEMS.map(async key=>{
          if(typeof manifest[key]!=='string')return;
          const url=new URL(manifest[key],manifestURL);
          if(url.origin!==manifestURL.origin)return;
          try{const file=await fetch(url);if(file.ok)loaded[key]=await context.decodeAudioData(await file.arrayBuffer());}catch{}
        }));
        Object.assign(this.buffers,loaded);
      }catch{}finally{this.loaded=true;if(this.active)this.startSources();}
    });
  }
  startSources(){
    if(!this.loaded||this.sources.length||!Object.keys(this.buffers).length)return;
    this.startedAt=this.ctx.currentTime;
    for(const key of this.keys){const buffer=this.buffers[key];if(!buffer)continue;const source=this.ctx.createBufferSource(),gate=this.ctx.createGain();source.buffer=buffer;source.loop=true;source.connect(gate).connect(this.gains[key]);source.onended=()=>{source.disconnect();gate.disconnect();};source.start(this.startedAt,this.offset%buffer.duration);this.sources.push({key,source,gate});}
  }
  stopSources(){
    if(!this.sources.length)return;
    this.offset+=this.ctx.currentTime-this.startedAt;
    const now=this.ctx.currentTime;for(const {source,gate} of this.sources){gate.gain.setValueAtTime(1,now);gate.gain.linearRampToValueAtTime(0,now+.045);source.stop(now+.05);}this.sources=[];
  }
  setActive(active){
    this.active=active;const now=this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(active?this.volume:0,now,active?.3:.018);
    // Pause the score timeline along with the game; no queued notes or playback drift.
    if(active)this.startSources();else this.stopSources();
  }
  setVolume(value){this.volume=clamp(value);if(this.active)this.bus.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.08);}
  reset(){this.chasing=false;this.stopSources();this.offset=0;this.state.reset();for(const key of this.keys){const gain=this.gains[key].gain;gain.cancelScheduledValues(this.ctx.currentTime);gain.setValueAtTime(key==='exploration'?.48:key==='far'?.45:0,this.ctx.currentTime);}if(this.active)this.startSources();}
  update(dt,distance,occluded,escape,chasing=false){if(!this.active)return;const immediate=chasing&&!this.chasing;this.chasing=chasing;if(immediate){this.bus.gain.cancelScheduledValues(this.ctx.currentTime);this.bus.gain.setValueAtTime(this.volume,this.ctx.currentTime);}const target=this.state.update(dt,distance,occluded,escape,chasing);for(const key of this.keys){const gain=this.gains[key].gain;if(immediate){gain.cancelScheduledValues(this.ctx.currentTime);gain.setValueAtTime(target[key],this.ctx.currentTime);}else gain.setTargetAtTime(target[key],this.ctx.currentTime,.06);}}
}
