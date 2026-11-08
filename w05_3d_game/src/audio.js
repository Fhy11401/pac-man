import {OPENING_REVEAL_AT,DEATH_REVEAL_AT,SCARE_VOICE_OFFSET} from './scare-timing.js';
import {EnemyVoice,loadEnemyVoiceData} from './enemy-voice.js';
import {RULES,isInSafeRoom,ENTRY_GATE} from './world.js';
import {OPENING_CUT_AT} from './opening-timing.js';
import {loadHeartbeatData,playHeartbeatSample,heartbeatGap} from './heartbeat-sample.js';
import {OpeningAudio} from './opening-audio.js';
import {MusicDirector,prepareScore} from './music.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {ROOM_DOOR_TIMING} from './blackout-state.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function phoneRingGain(distance,occluded=false){
  // A hotel-wide bell retains a quiet reflected tail behind walls.
  const d=Number.isFinite(distance)?Math.max(0,distance):Infinity;
  return .025+.195/(1+(d/9)**1.6)*(occluded?.62:1);
}
export function quietPreparation(game){return game.blackout?!game.blackout.enemyReleased:!game.entryOpened||isInSafeRoom(game.player);}
export function proximityMix(distance,occluded=false){
  const near=clamp(1-distance/7.5),presence=clamp(1-distance/10);
  const gain=.66*presence**1.35*(occluded?.62:1);
  return {heartGain:gain,heartInterval:60/(62+116*presence),footGain:gain,voiceGain:.29*near*(occluded?.72:1)};
}
export class Sound {
  constructor(){this.masterVolume=1;this.effectsVolume=1;this.muted=false;this.ctx=null;this.master=null;this.stride=0;this.enemyStride=0;this.foot=0;this.playing=false;this.heartClock=0;this.voices=new Set();this.score=prepareScore();this.heartbeatBytes=loadHeartbeatData();this.enemyVoiceBytes=loadEnemyVoiceData();this.musicVolume=.1625;}
  unlock(){try{if(!this.ctx){
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    this.heartbeatReady=this.heartbeatBytes.then(bytes=>bytes?this.ctx.decodeAudioData(bytes):null).then(clip=>this.heartbeatClip=clip).catch(()=>null);
    this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.8*this.masterVolume;
    const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=14;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.18;
    this.master.connect(limiter).connect(this.ctx.destination);this.output=limiter;
    this.threat=this.ctx.createGain();this.threat.gain.value=0;this.threat.connect(this.master);
    this.effects=this.ctx.createGain();this.effects.gain.value=1.2*this.effectsVolume;this.effects.connect(this.master);this.opening=new OpeningAudio(this.ctx,this.effects);
    this.enemyVoice=new EnemyVoice(this.ctx,this.threat,this.effects,this.enemyVoiceBytes);
    this.musicDucking=this.ctx.createGain();this.musicDucking.connect(this.master);
    this.music=new MusicDirector(this.ctx,this.musicDucking,this.score);this.music.setVolume(this.musicVolume);this.music.setActive(this.playing&&!this.muted);
    this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*1.4,this.ctx.sampleRate);
    const n=this.noise.getChannelData(0);let last=0;for(let i=0;i<n.length;i++){last=.75*last+(Math.random()*2-1)*.25;n[i]=last*2;}
    this.ambient=this.ctx.createGain();this.ambient.gain.value=.008;this.ambient.connect(this.threat);
    for(const f of [42,63.18]){const osc=this.ctx.createOscillator();osc.type='sine';osc.frequency.value=f;osc.connect(this.ambient);osc.start();}
  }this.ctx.resume().catch(()=>{});}catch{}}
  setMixVolumes(master=1,effects=1){this.masterVolume=clamp(master);this.effectsVolume=clamp(effects);if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(this.muted?0:.8*this.masterVolume,t,.025);this.effects.gain.setTargetAtTime(this.paused?0:1.2*this.effectsVolume,t,.025);this.threat.gain.setTargetAtTime(this.playing?1.2*this.effectsVolume:0,t,.025);}
  setPlaying(value){if(value===this.playing)return;this.playing=value;this.music?.setActive(value&&!this.muted);if(this.ctx)this.threat.gain.setTargetAtTime(value?1.2*this.effectsVolume:0,this.ctx.currentTime,.035);if(!value){this.heartClock=0;this.enemyVoice?.stop(true);}}
  setPaused(value){this.paused=Boolean(value);if(value)this.stopEnemyVoice();this.opening?.setPaused(this.paused);if(this.ctx)this.effects.gain.setTargetAtTime(value?0:1.2*this.effectsVolume,this.ctx.currentTime,.015);}
  toggle(){this.muted=!this.muted;if(this.muted)this.stopEnemyVoice();if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.8*this.masterVolume,this.ctx.currentTime,.025);this.music?.setActive(this.playing&&!this.muted);return this.muted;}
  stopEnemyVoice(){this.enemyVoice?.stop();if(this.musicDucking){this.musicDucking.gain.cancelScheduledValues(this.ctx.currentTime);this.musicDucking.gain.setValueAtTime(1,this.ctx.currentTime);}}
  vocalScare(delay=0,duration=1){
    if(!this.ready())return false;
    const played=this.enemyVoice?.play('jumpscare',{cinematic:true,mix:{gain:.85,pan:0,cutoff:4800},delay,maxDuration:duration,offset:SCARE_VOICE_OFFSET})??false;
    if(played&&this.musicDucking){const at=this.ctx.currentTime+delay,gain=this.musicDucking.gain;gain.cancelScheduledValues(this.ctx.currentTime);gain.setValueAtTime(1,this.ctx.currentTime);gain.setValueAtTime(1,at);gain.linearRampToValueAtTime(.32,at+.012);gain.setValueAtTime(.32,at+duration);gain.linearRampToValueAtTime(1,at+duration+.25);}
    return played;
  }
  setMusicVolume(value){this.musicVolume=clamp(value);this.music?.setVolume(this.musicVolume);}
  ready(){return this.ctx&&this.ctx.state==='running'&&!this.muted&&!this.paused;}
  track(source,nodes,end){this.voices.add(source);source.onended=()=>{this.voices.delete(source);for(const n of [source,...nodes])n.disconnect();};source.stop(end);}
  tone(freq,duration=.18,type='sine',volume=.16,delay=0,pan=0,bus=this.effects,endFrequency=freq,fullBody=false){
    if(!this.ready())return;const now=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain(),stereo=this.ctx.createStereoPanner();
    osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),now+duration);stereo.pan.value=pan;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.008);
    if(fullBody){gain.gain.linearRampToValueAtTime(volume*.85,now+.025);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.45),now+duration*.58);}
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain).connect(stereo).connect(bus);osc.start(now);this.track(osc,[gain,stereo],now+duration+.02);
  }
  noiseBurst(volume,pan,duration,frequency,bus=this.threat,delay=0,endFrequency=frequency){
    if(!this.ready())return;const now=this.ctx.currentTime+delay,source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain(),stereo=this.ctx.createStereoPanner();
    source.buffer=this.noise;source.loop=true;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(frequency,now);filter.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);stereo.pan.value=pan;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    source.connect(filter).connect(gain).connect(stereo).connect(bus);source.start(now);this.track(source,[filter,gain,stereo],now+duration+.03);
  }
  step(volume,pan,enemy=false){
    const bus=enemy?this.threat:this.effects;
    this.noiseBurst(volume,pan,enemy?.19:.10,enemy?1250:650,bus);
    this.tone(enemy?108:140,enemy?.17:.09,'sine',volume*.7,0,pan,bus,enemy?44:85);
    if(enemy)this.noiseBurst(volume*.65,pan,.055,2300,this.threat,.025,900);
  }
  heartbeat(volume,interval=.65){
    if(this.ready())this.heartBeat={at:this.ctx.currentTime,gain:volume,interval,gap:heartbeatGap(interval)};
    if(playHeartbeatSample(this,volume,interval))return;
    // A sustained body and audible upper harmonics retain the pulse on small
    // speakers; distance attenuation remains shared with enemy footsteps.
    for(const [delay,mult] of [[0,1],[heartbeatGap(interval),.8]]){
      this.tone(118,.23,'sine',volume*1.15*mult,delay,0,this.threat,62,true);
      this.tone(220,.14,'triangle',volume*.5*mult,delay,0,this.threat,120,true);
      this.noiseBurst(volume*.3,0,.085,310,this.threat,delay,140);
    }
  }
  growl(volume,pan,scare=false,offset=0){
    const bus=scare?this.effects:this.threat;
    this.noiseBurst(volume,pan,scare?.85:.9,scare?1900:640,bus,offset,scare?420:300);
    for(let i=0;i<4;i++){
      const delay=offset+i*.11,level=volume*(1-i*.15);
      this.tone(scare?260-i*19:94+i*13,.32,'sawtooth',level*.27,delay,pan,bus,scare?78:52);
      this.tone(scare?390:147,.25,'triangle',level*.18,delay,pan,bus,scare?120:83);
    }
  }
  doorImpact(volume,pan,breaking=false){
    this.tone(105,breaking?.42:.31,'sine',volume*.8,0,pan,this.effects,35);
    this.tone(205,.18,'triangle',volume*.22,.012,pan,this.effects,68);
    this.noiseBurst(volume*.75,pan,breaking?.43:.24,breaking?1800:680,this.effects,0,breaking?320:180);
    this.noiseBurst(volume*.28,pan,.18,1150,this.effects,.06,280);
    if(breaking)this.noiseBurst(volume*.36,-pan*.6,.31,2300,this.effects,.12,420);
  }
  event(name,count=0){
    if(name==='start'||name==='respawn'){this.stopEnemyVoice();this.enemyVoice?.reset();this.music?.reset();}
    if(name==='collect'){const f=[660,740,830,988,1108,1244,1320,1480][count%8];this.tone(f,.12,'triangle',.085);this.tone(f*1.5,.09,'sine',.02,.025);}
    if(name==='unlock')[165,220,165,220].forEach((f,i)=>this.tone(f,.3,'triangle',.1,i*.2));
    if(name==='won')[330,440,554,660].forEach((f,i)=>this.tone(f,.6,'sine',.12,i*.16));
    if(name==='hit')this.enemyVoice?.stop();
    if(name==='scare-impact'){if(!this.vocalScare(0,RULES.caughtSeconds-DEATH_REVEAL_AT))this.growl(.4,0,true);this.tone(120,.36,'triangle',.18,0,0,this.effects,33);}
    if(name==='tablet')this.noiseBurst(.1,0,.18,900,this.effects,0,350);
    if(name==='door'){
      this.noiseBurst(.12,0,.65,350,this.effects,0,90);
      this.tone(92,.58,'triangle',.055,0,0,this.effects,54);
      this.noiseBurst(.16,0,.08,750,this.effects,.57,180);
    }
    if(name==='door-blocked')this.tone(180,.16,'triangle',.055);
    if(name==='room-door-blocked')this.tone(180,.12,'triangle',.035);
    if(name==='room-door'){
      this.noiseBurst(.13,0,.11,1200,this.effects,0,230);
      this.tone(135,.25,'triangle',.045,.035,0,this.effects,72);
      this.noiseBurst(.10,0,.08,550,this.effects,.18,110);
    }
    if(name==='call-connect'){this.tone(620,.09,'sine',.055);this.tone(930,.13,'sine',.045,.10);}
    if(name==='call-end'){this.tone(740,.10,'sine',.045);this.tone(440,.16,'sine',.045,.12);}
    if(name==='call-ring')for(const delay of [0,.2,.45]){this.tone(880,.14,'sine',.08,delay);this.tone(1320,.14,'sine',.035,delay);}
    if(name==='monitor-watch'||name==='lens-strike'||name==='mains-fail'||name==='backup-start')this.opening?.play(name);
    if(name==='lens-strike')this.vocalScare(0,OPENING_CUT_AT-OPENING_REVEAL_AT);
    if(name==='mains-fail')this.stopEnemyVoice();
    if(name==='backup-ready'){this.noiseBurst(.25,0,.13,1100,this.effects);this.tone(115,.25,'triangle',.12);this.tone(660,.18,'sine',.07,.2);}
    if(name==='phone-a'||name==='phone-b'){this.tone(697,.09,'sine',.035);this.tone(1209,.09,'sine',.025);}
    if(name==='power-on'||name==='sector-on'){
      this.noiseBurst(.23,0,.15,600,this.effects,0,120);
      this.tone(55,.8,'triangle',.065,.12,0,this.effects,110);
      [330,440,554].forEach((f,i)=>this.tone(f,.35,'sine',.065,.3+i*.15));
    }
    if(name==='hide'||name==='unhide')this.noiseBurst(.14,0,.3,430,this.effects,0,180);
    if(name==='flashlight'||name==='nightvision'||name==='monitor')this.noiseBurst(.055,0,.055,1600,this.effects,0,500);
    if(name==='item-pickup')this.tone(780,.15,'sine',.09);
    if(name==='item-strike'){this.noiseBurst(.35,0,.16,760,this.effects,0,90);this.tone(85,.22,'triangle',.20,0,0,this.effects,34);this.noiseBurst(.20,0,.25,300,this.effects,.2,60);}
    if(name==='enemy-recovered')this.noiseBurst(.10,0,.3,420,this.effects,0,120);
    if(name==='battery')this.tone(660,.19,'sine',.07,0,0,this.effects,880);
    if(name==='battery-empty'){this.tone(220,.2,'triangle',.05);this.tone(165,.25,'triangle',.05,.23);}
    if(name==='boards-break'){
      this.music?.reset();this.tone(170,.22,'triangle',.22,0,0,this.effects,55);
      for(const [delay,pan,volume] of [[0,-.2,.42],[.07,.3,.3],[.18,-.1,.18]])this.noiseBurst(volume,pan,.16,2100,this.effects,delay,700);
      this.tone(76,.3,'sine',.13,.06,0,this.effects,34);
    }
    if(name==='start'||name==='respawn'){this.stride=0;this.enemyStride=0;this.heartClock=0;this.tone(220,.25,'sine',.07);}
  }
  updateBlackout(dt,game,yaw,sight){
    const state=game.blackout;if(!state)return;
    if(this.blackoutGame!==game){this.blackoutGame=game;this.phoneClocks=[0,0];this.repairStep=0;this.bashSounds=new Map();}
    if(!this.ready())return;
    state.phones.forEach((phone,i)=>{
      if(phone.remaining<=0){this.phoneClocks[i]=0;return;}
      this.phoneClocks[i]-=dt;if(this.phoneClocks[i]>0)return;this.phoneClocks[i]=1.15;
      const source=BLACKOUT_LAYOUT.phones[i],dx=source.x-game.player.x,dz=source.z-game.player.z,d=Math.hypot(dx,dz);
      const gain=phoneRingGain(d,!sight(game,game.player,source)),pan=clamp((Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d),-1,1);
      for(const delay of [0,.17]){this.tone(1550,.12,'sine',gain,delay,pan);this.tone(2070,.13,'sine',gain*.42,delay,pan);this.noiseBurst(gain*.35,pan,.09,2800,this.effects,delay,1200);}
      this.tone(980,.24,'sine',gain*.22,.08,-pan*.45);
    });
    for(const room of [...(BLACKOUT_LAYOUT.rooms??[]),{id:'entry-gate',door:ENTRY_GATE}]){
      const door=room.id==='entry-gate'?state.officeBash:state.roomDoors?.[room.id],last=this.bashSounds.get(room.id);
      const dx=room.door.x-game.player.x,dz=room.door.z-game.player.z,d=Math.hypot(dx,dz);
      const gain=.44/(1+(d/4.5)**1.6),pan=clamp((Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d),-1,1);
      if(door?.bashing){
        const time=Math.max(0,Number(door.bashTime)||0),beat=Math.floor(time/(ROOM_DOOR_TIMING.bashInterval??.5));
        // Game time stops when paused. Repeated render updates cannot replay a hit.
        if(!last||time<last.time||beat!==last.beat)this.doorImpact(gain,pan);
        this.bashSounds.set(room.id,{beat,time});
      }else if(last){
        if(!door?.closed&&last.time>=4.5)this.doorImpact(gain,pan,true);
        this.bashSounds.delete(room.id);
      }
    }
    const repairStep=Math.floor((state.circuits?.[state.activeRepair]??state.repairProgress)*16);
    if(repairStep>this.repairStep&&repairStep<16){this.noiseBurst(.055,0,.1,1100,this.effects,0,400);this.tone(85,.09,'triangle',.025);}
    this.repairStep=repairStep;
  }
  update(dt,speed,d,pan,occluded,escape,enemySpeed=0,playerSteps=0,chasing=false,enemyMode=chasing?'chase':'patrol'){
    // Camera foot plants and audible footfalls share a single distance clock.
    for(let i=0;i<playerSteps;i++){this.foot++;this.step(.105,(this.foot%2?1:-1)*.15);}
    this.enemyVoice?.update(dt,{mode:enemyMode,distance:d,pan,occluded,active:this.playing&&this.ready()});
    if(!this.playing)return;
    this.music?.update(dt,d,occluded,escape,chasing);
    const mix=proximityMix(d,occluded);
    if(enemySpeed>.02){this.enemyStride+=enemySpeed*2.4*dt;if(this.enemyStride>=1.65){this.enemyStride%=1.65;if(mix.footGain>.01)this.step(mix.footGain,pan,true);}}
    this.heartClock=Math.min(this.heartClock,mix.heartInterval)-dt;if(mix.heartGain>.001&&this.heartClock<=0){this.heartbeat(mix.heartGain,mix.heartInterval);this.heartClock=mix.heartInterval;}
  }
}
