const clamp=x=>Math.max(0,Math.min(1,x));
// Visuals sample the audio scheduler's timestamp, never a second beat timer.
export function heartbeatVisual(beat,now,reduced=false){
  const age=beat?now-beat.at:Infinity,valid=beat&&age>=0&&age<Math.max(beat.interval,.4)+.18;
  const intensity=valid?clamp(beat.gain/.66):0;
  const attack=t=>t<0?0:Math.sin(Math.PI*clamp(t/.025)/2)**2*Math.exp(-Math.max(0,t-.025)*24);
  const pulse=valid?Math.min(1.6,attack(age)+.64*attack(age-beat.gap)):0;
  const ring=valid?clamp(age/.42):1;
  return{scale:reduced?1:1+pulse*(.14+.18*intensity),x:0,y:0,opacity:valid?.58+.24*intensity+.16*pulse:.32,wave:.35+.55*pulse,offset:valid?.24-clamp(age/Math.max(.3,beat.interval))*1.5:0,
    intensity,ringScale:1+ring*.8,ringOpacity:reduced?0:(1-ring)*.55*intensity};
}
export class HeartbeatHUD{
  constructor(element){this.element=element;this.heart=element.querySelector('.heartbeat-icon');this.wave=element.querySelector('.heartbeat-trace');this.sweep=element.querySelector('.heartbeat-sweep');this.ring=element.querySelector('.heartbeat-ring');}
  update(sound,{visible,reduced=false}={}){
    this.element.hidden=!visible;if(!visible)return;
    const ctx=sound.ctx,timestamp=ctx?.getOutputTimestamp?.(),now=timestamp?.contextTime>0?timestamp.contextTime:ctx?.currentTime??0;
    const beat=sound.playing&&!sound.muted&&!sound.paused?sound.heartBeat:null,p=heartbeatVisual(beat,now,reduced);
    this.element.style.opacity=String(p.opacity);
    this.heart.style.transform=`translate(${p.x}px,${p.y}px) rotate(${p.x*.65}deg) scale(${p.scale})`;
    this.element.style.color=p.intensity>.35?`rgb(${Math.round(164+62*p.intensity)},${Math.round(150-67*p.intensity)},${Math.round(143-64*p.intensity)})`:'#bab9b2';
    if(this.ring){this.ring.style.transform=`scale(${p.ringScale})`;this.ring.style.opacity=String(p.ringOpacity);}
    this.wave.style.opacity=String(p.wave);this.sweep.style.strokeDashoffset=String(p.offset);
  }
}
