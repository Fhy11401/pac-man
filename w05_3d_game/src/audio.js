const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function proximityMix(distance,occluded=false){
  const near=clamp(1-distance/7.5),presence=clamp(1-distance/10);
  return {heartGain:.38*near*near,heartInterval:60/(62+94*near),footGain:.66*presence**1.35*(occluded?.62:1),voiceGain:.29*near*(occluded?.72:1)};
}
export class Sound {
  constructor(){this.muted=false;this.ctx=null;this.master=null;this.stride=0;this.enemyStride=0;this.foot=0;this.playing=false;this.heartClock=0;this.voiceClock=2;this.voices=new Set();}
  unlock(){try{if(!this.ctx){
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.8;
    const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=14;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.18;
    this.master.connect(limiter).connect(this.ctx.destination);this.output=limiter;
    this.threat=this.ctx.createGain();this.threat.gain.value=0;this.threat.connect(this.master);
    this.effects=this.ctx.createGain();this.effects.connect(this.master);
    this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*1.4,this.ctx.sampleRate);
    const n=this.noise.getChannelData(0);let last=0;for(let i=0;i<n.length;i++){last=.75*last+(Math.random()*2-1)*.25;n[i]=last*2;}
    this.ambient=this.ctx.createGain();this.ambient.gain.value=.018;this.ambient.connect(this.threat);
    for(const f of [42,63.18]){const osc=this.ctx.createOscillator();osc.type='sine';osc.frequency.value=f;osc.connect(this.ambient);osc.start();}
  }this.ctx.resume().catch(()=>{});}catch{}}
  setPlaying(value){if(value===this.playing)return;this.playing=value;if(this.ctx)this.threat.gain.setTargetAtTime(value?1:0,this.ctx.currentTime,.035);if(!value){this.heartClock=0;this.voiceClock=1.5;}}
  setPaused(value){if(this.ctx)this.effects.gain.setTargetAtTime(value?0:1,this.ctx.currentTime,.015);}
  toggle(){this.muted=!this.muted;if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.8,this.ctx.currentTime,.025);return this.muted;}
  ready(){return this.ctx&&this.ctx.state==='running'&&!this.muted;}
  track(source,nodes,end){this.voices.add(source);source.onended=()=>{this.voices.delete(source);for(const n of [source,...nodes])n.disconnect();};source.stop(end);}
  tone(freq,duration=.18,type='sine',volume=.16,delay=0,pan=0,bus=this.effects,endFrequency=freq){
    if(!this.ready())return;const now=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain(),stereo=this.ctx.createStereoPanner();
    osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),now+duration);stereo.pan.value=pan;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain).connect(stereo).connect(bus);osc.start(now);this.track(osc,[gain,stereo],now+duration+.02);
  }
  noiseBurst(volume,pan,duration,frequency,bus=this.threat,delay=0,endFrequency=frequency){
    if(!this.ready())return;const now=this.ctx.currentTime+delay,source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain(),stereo=this.ctx.createStereoPanner();
    source.buffer=this.noise;source.loop=true;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(frequency,now);filter.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);stereo.pan.value=pan;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    source.connect(filter).connect(gain).connect(stereo).connect(bus);source.start(now);this.track(source,[filter,gain,stereo],now+duration+.03);
  }
  step(volume,pan,enemy=false){
    this.noiseBurst(volume,pan,enemy?.19:.10,enemy?1250:650);
    this.tone(enemy?108:140,enemy?.17:.09,'sine',volume*.7,0,pan,this.threat,enemy?44:85);
    if(enemy)this.noiseBurst(volume*.65,pan,.055,2300,this.threat,.025,900);
  }
  heartbeat(volume){
    for(const [delay,mult] of [[0,1],[.16,.68]]){
      this.tone(94,.15,'sine',volume*mult,delay,0,this.threat,43);
      this.tone(174,.09,'triangle',volume*.22*mult,delay,0,this.threat,83);
      this.noiseBurst(volume*.25,0,.075,150,this.threat,delay,70);
    }
  }
  growl(volume,pan,scare=false){
    const bus=scare?this.effects:this.threat;
    this.noiseBurst(volume,pan,scare?.85:.9,scare?1900:640,bus,0,scare?420:300);
    for(let i=0;i<4;i++){
      const delay=i*.11,level=volume*(1-i*.15);
      this.tone(scare?260-i*19:94+i*13,.32,'sawtooth',level*.27,delay,pan,bus,scare?78:52);
      this.tone(scare?390:147,.25,'triangle',level*.18,delay,pan,bus,scare?120:83);
    }
  }
  event(name,count=0){
    if(name==='collect'){const f=[660,740,830,988,1108,1244,1320,1480][count%8];this.tone(f,.12,'triangle',.085);this.tone(f*1.5,.09,'sine',.02,.025);}
    if(name==='unlock')[165,220,165,220].forEach((f,i)=>this.tone(f,.3,'triangle',.1,i*.2));
    if(name==='won')[330,440,554,660].forEach((f,i)=>this.tone(f,.6,'sine',.12,i*.16));
    if(name==='hit'){this.growl(.62,0,true);this.tone(120,.45,'triangle',.35,0,0,this.effects,33);}
    if(name==='tablet')this.noiseBurst(.1,0,.18,900,this.effects,0,350);
    if(name==='start'||name==='respawn'){this.stride=0;this.enemyStride=0;this.heartClock=0;this.voiceClock=1.4;this.tone(220,.25,'sine',.07);}
  }
  update(dt,speed,d,pan,occluded,escape,enemySpeed=0){
    if(!this.playing)return;
    const mix=proximityMix(d,occluded);
    if(speed>.05){this.stride+=speed*2.4*dt;if(this.stride>=2.1){this.stride%=2.1;this.foot++;this.step(.105,(this.foot%2?1:-1)*.15);}}else this.stride=1.5;
    if(enemySpeed>.02){this.enemyStride+=enemySpeed*2.4*dt;if(this.enemyStride>=1.65){this.enemyStride%=1.65;if(mix.footGain>.01)this.step(mix.footGain,pan,true);}}
    this.heartClock-=dt;if(mix.heartGain>.001&&this.heartClock<=0){this.heartbeat(mix.heartGain);this.heartClock=mix.heartInterval;}
    this.voiceClock-=dt;if(mix.voiceGain>.025&&enemySpeed>.02&&this.voiceClock<=0){this.growl(mix.voiceGain,pan);this.voiceClock=escape?3.8:4.6+Math.random()*1.6;}
  }
}
