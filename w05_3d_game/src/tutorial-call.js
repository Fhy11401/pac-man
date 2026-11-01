const lesson=(title,pairs)=>Object.freeze({
  title,text:pairs.map(pair=>pair[0]).join(''),voice:pairs.map(pair=>pair[1]).join(' '),
  sentences:Object.freeze(pairs.map(([text,voice,at])=>Object.freeze({text,voice,at,seconds:Math.max(3.4,Math.min(9,text.length/4.8+1.1))}))),
});
export const TUTORIAL_LINES=Object.freeze([
  lesson('夜班须知',[
  [
    "喂，我是夜班主管。",
    "Hey. It's the night manager.",
    0
  ],
  [
    "备用电源已经启动，但旅馆其他地方都黑了。",
    "The backup power is running, but the rest of the hotel has gone completely dark.",
    2.195532
  ],
  [
    "找到配电箱，恢复主电源，然后安全回来。",
    "Find the electrical panel, restore the main power, and make your way back here safely.",
    6.623617
  ],
  [
    "出发前，你得先了解一下巡夜人。",
    "Before you head out, there's something you need to know about the attendant.",
    11.904255
  ],
  [
    "在黑暗走廊里，他靠声音找到你。",
    "In the dark corridors, it relies on sound to find you.",
    15.571489
  ],
  [
    "走路不会发出声音，慢慢来。",
    "Walking won't make a sound, so take your time.",
    19.156596
  ],
  [
    "按住 Shift 奔跑。",
    "Hold Shift to run.",
    22.015745
  ],
  [
    "记住，奔跑会发出声音。",
    "Just remember, running makes noise.",
    23.754043
  ],
  [
    "想引开巡夜人，按 1 拨响 201 客房，按 2 拨响 202。",
    "To lure the attendant away, press one to ring room two oh one, or two for room two oh two.",
    26.194043
  ],
  [
    "点按 E 开门会发声；按住 E 可以安静操作。",
    "Tap E for a noisy door; hold E for silence.",
    32.888085
  ],
  [
    "如果他看见你藏起来，就可能进房间搜查。",
    "If it sees you hide, it may search your room.",
    36.745532
  ],
  [
    "在配电箱前按住 E 八秒；维修进度会保留。",
    "Hold E at the panel for eight seconds; progress saves.",
    39.605106
  ],
  [
    "恢复照明后，你也会暴露在灯光下。",
    "Restored lights expose you.",
    43.417872
  ],
  [
    "回到监控室，把他留在外面，再关上门。",
    "Return to the control room, leave it outside, and close the door.",
    45.228511
  ],
  [
    "你有三条命。用掉的物资不会返还。祝你好运。",
    "Three lives. Used supplies stay spent. Good luck.",
    49.722128
  ]
]),
]);

// One continuous English recording; cue positions follow its final word timings.
export const TUTORIAL_AUDIO_CONFIG=Object.freeze({audioReady:true,confirmedNaturalEnglish:true,language:'en-US',clips:Object.freeze([Object.freeze({src:'../assets/audio/tutorial/night-manager-en.mp3',duration:54.06,cues:Object.freeze(TUTORIAL_LINES[0].sentences.map(sentence=>sentence.at))})])});
export const narrationReady=config=>Boolean(config?.audioReady&&config?.confirmedNaturalEnglish&&/^en(?:-|$)/i.test(config.language??'')&&config.clips?.length===TUTORIAL_LINES.length&&config.clips.every(clip=>typeof clip?.src==='string'&&clip.src.trim()&&!/assets\/audio\/tutorial\/manager-\d+\.wav(?:$|[?#])/i.test(clip.src)));
const sentenceCount=TUTORIAL_LINES.reduce((total,line)=>total+line.sentences.length,0);
const clock=value=>`${Math.floor(value/60).toString().padStart(2,'0')}:${Math.floor(value%60).toString().padStart(2,'0')}`;

export class TutorialCall{
  constructor({onIncoming=()=>{},onOpen=()=>{},onClose=()=>{},onRing=()=>{},sound=null,doc=document,createAudio=()=>new Audio(),audioConfig=TUTORIAL_AUDIO_CONFIG}={}){
    this.onIncoming=onIncoming;this.onOpen=onOpen;this.onClose=onClose;this.onRing=onRing;this.sound=sound;this.audioConfig=audioConfig;this.audioReady=narrationReady(audioConfig);
    this.el=Object.fromEntries(['tablet','tutorial-call','call-hangup','call-answer','call-decline','call-caption','call-caller','call-duration','call-hold','call-hold-label','call-speaker'].map(id=>[id,doc.getElementById(id)]));
    this.state='idle';this.index=0;this.sentenceIndex=0;this.active=true;this.held=false;this.elapsed=0;this.advance=0;this.generation=0;this.playAttempt=0;this.disposed=false;this.audioMode='captions';this.localMuted=false;this.ended=false;
    this.audio=createAudio();this.audio.preload='none';this.audio.volume=.85;this.audio.defaultPlaybackRate=1;this.audio.playbackRate=1;
    this.el['call-hangup'].onclick=()=>this.close();this.el['call-answer'].onclick=()=>{if(this.active&&this.ringing)this.startConnected();};this.el['call-decline'].onclick=()=>this.close();
    this.el['call-hold'].onclick=()=>this.toggleHold();this.el['call-speaker'].onclick=()=>{if(this.active&&this.open&&this.audioMode==='voice'){this.localMuted=!this.localMuted;this.syncMute();}};
    this.syncVisibility();this.syncControls();
  }
  get open(){return this.state==='connected';}
  get ringing(){return this.state==='ringing';}
  get busy(){return this.open||this.ringing;}
  startIncoming(){if(this.disposed)return;this.stop();this.state='ringing';this.ringClock=0;this.ringElapsed=0;this.el['tutorial-call'].dataset.state='ringing';this.el['call-duration'].textContent='酒店内线来电';this.syncVisibility();this.onIncoming();this.onRing();if(this.active)this.el['call-answer'].focus({preventScroll:true});}
  syncVisibility(){const hidden=!this.active||!this.busy;this.el['tutorial-call'].hidden=hidden;this.el['tutorial-call'].inert=hidden;this.el.tablet.dataset.call=String(!hidden);this.el['call-caption'].hidden=hidden||!this.open;}
  syncControls(){
    const state=`${this.held}|${this.audioMode}|${this.audio.muted}`;if(this.controlState===state)return;this.controlState=state;
    this.el['call-hold'].setAttribute('aria-pressed',String(this.held));this.el['call-hold-label'].textContent=this.held?'继续':'保留';
    this.el['call-speaker'].disabled=this.audioMode!=='voice';this.el['call-speaker'].setAttribute('aria-pressed',String(this.audioMode==='voice'&&!this.audio.muted));
    this.el['tutorial-call'].dataset.audioMode=this.audioMode;
  }
  syncMute(){this.audio.muted=Boolean(this.sound?.muted||this.localMuted);this.syncControls();}
  start(){this.startConnected();}
  startConnected(){
    if(this.disposed)return;this.stop();this.state='connected';this.index=0;this.sentenceIndex=0;this.elapsed=0;this.held=false;this.localMuted=false;
    this.el['tutorial-call'].dataset.state='connected';this.el['call-caller'].textContent='夜班主管';this.el['call-duration'].textContent='00:00';this.syncVisibility();this.onOpen();this.playLine();
    if(this.active)this.el['call-hangup'].focus({preventScroll:true});
  }
  connectAudio(){
    if(this.audioSource||!this.sound?.ctx)return;const ctx=this.sound.ctx;
    try{
      this.audioSource=ctx.createMediaElementSource(this.audio);this.highpass=ctx.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=220;
      this.lowpass=ctx.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.frequency.value=3400;
      this.audioSource.connect(this.highpass);this.highpass.connect(this.lowpass);this.lowpass.connect(this.sound.effects??ctx.destination);
    }catch{
      this.highpass?.disconnect?.();this.lowpass?.disconnect?.();
      if(this.audioSource){try{this.audioSource.disconnect();this.audioSource.connect(this.sound.effects??ctx.destination);}catch{}}
    }
  }
  showSentence(index){
    this.sentenceIndex=index;const line=TUTORIAL_LINES[this.index],sentence=line.sentences[index];
    this.el['call-caption'].textContent=sentence.text;
    this.advance=sentence.seconds;
  }
  cueStarts(){
    const line=TUTORIAL_LINES[this.index],clip=this.audioConfig.clips[this.index],cues=clip?.cues;
    if(cues?.length===line.sentences.length&&cues.every((time,i)=>Number.isFinite(time)&&time>=0&&(!i||time>=cues[i-1])))return cues;
    const weight=line.sentences.reduce((total,sentence)=>total+sentence.seconds,0),duration=Number.isFinite(this.audio.duration)&&this.audio.duration>0?this.audio.duration:clip?.duration??weight;
    let at=0;return line.sentences.map(sentence=>{const cue=at;at+=sentence.seconds/weight*duration;return cue;});
  }
  fallback(generation){
    if(generation!==this.generation||this.state!=='connected')return;
    this.playAttempt++;this.audio.pause();this.audioMode='captions';this.ended=false;this.advance=TUTORIAL_LINES[this.index].sentences[this.sentenceIndex].seconds;this.syncControls();
  }
  requestPlay(){
    if(!this.active||this.held||!this.open||this.disposed||this.audioMode!=='voice')return;
    this.syncMute();const generation=this.generation,attempt=++this.playAttempt;
    const failed=()=>{if(this.active&&attempt===this.playAttempt)this.fallback(generation);};
    try{this.audio.play()?.catch(failed);}catch{failed();}
  }
  playLine(){
    if(this.disposed||!this.open)return;
    const generation=++this.generation;this.playAttempt++;this.audio.pause();this.ended=false;this.audioMode=this.audioReady?'voice':'captions';this.showSentence(0);
    this.audio.onended=()=>{if(generation===this.generation&&this.open&&this.audioMode==='voice'){this.showSentence(TUTORIAL_LINES[this.index].sentences.length-1);this.ended=true;this.advance=.7;}};
    this.audio.onerror=()=>this.fallback(generation);this.syncControls();
    if(this.audioReady){this.connectAudio();this.audio.src=new URL(this.audioConfig.clips[this.index].src,import.meta.url).href;this.requestPlay();}
    else{this.audio.removeAttribute?.('src');this.audio.load?.();}
  }
  advanceLesson(){if(++this.index>=TUTORIAL_LINES.length){this.close();return;}this.playLine();}
  next(){
    if(!this.active||!this.open||this.disposed)return;
    if(this.sentenceIndex+1>=TUTORIAL_LINES[this.index].sentences.length){this.advanceLesson();return;}
    this.showSentence(this.sentenceIndex+1);
    if(this.audioMode==='voice'){this.ended=false;try{this.audio.currentTime=this.cueStarts()[this.sentenceIndex];this.requestPlay();}catch{this.fallback(this.generation);}}
  }
  toggleHold(){
    if(!this.active||!this.open||this.disposed)return;this.held=!this.held;
    if(this.held){this.playAttempt++;this.audio.pause();}else if(!this.ended)this.requestPlay();this.syncControls();
  }
  setActive(value){
    value=Boolean(value);this.syncMute();if(this.active===value)return;this.active=value;this.syncVisibility();
    if(!value){this.playAttempt++;this.audio.pause();}
    else if(this.ringing)this.el['call-answer'].focus({preventScroll:true});
    else if(this.open){if(!this.ended)this.requestPlay();this.el['call-hangup'].focus({preventScroll:true});}
  }
  update(dt){
    this.syncMute();if(!this.active||!Number.isFinite(dt)||dt<=0)return;
    if(this.ringing){this.ringClock+=dt;this.ringElapsed+=dt;if(this.ringElapsed>=30){this.close();return;}if(this.ringClock>=3){this.ringClock%=3;this.onRing();}return;}
    if(!this.open)return;
    this.elapsed+=dt;const display=clock(this.elapsed);if(this.el['call-duration'].textContent!==display)this.el['call-duration'].textContent=display;
    if(this.held)return;
    if(this.audioMode==='voice'){
      if(this.ended){this.advance-=dt;if(this.advance<=0)this.advanceLesson();return;}
      const cues=this.cueStarts(),now=Number(this.audio.currentTime)||0;let index=0;for(let i=1;i<cues.length;i++)if(now>=cues[i])index=i;
      if(index!==this.sentenceIndex)this.showSentence(index);return;
    }
    let remaining=dt;
    while(this.open&&remaining>0){if(this.advance>remaining){this.advance-=remaining;break;}remaining-=Math.max(0,this.advance);this.next();}
  }
  stop(){
    this.generation++;this.playAttempt++;this.audio.onended=null;this.audio.onerror=null;this.audio.pause();this.audio.removeAttribute?.('src');this.audio.load?.();
    this.advance=0;this.held=false;this.ended=false;this.state='idle';this.syncVisibility();
  }
  close(){if(!this.busy)return;this.stop();this.onClose();}
  destroy(){
    if(this.disposed)return;this.stop();this.disposed=true;
    for(const id of ['call-hangup','call-answer','call-decline','call-hold','call-speaker'])this.el[id].onclick=null;
    this.audioSource?.disconnect?.();this.highpass?.disconnect?.();this.lowpass?.disconnect?.();this.audioSource=null;this.highpass=null;this.lowpass=null;
  }
}
