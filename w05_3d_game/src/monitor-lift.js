import {BLACKOUT_RULES} from './blackout-layout.js';
export function monitorLiftPose(progress,rect,viewport,reduced=false){
  const p=Math.max(0,Math.min(1,progress)),ease=p*p*(3-2*p);
  return {x:reduced?0:rect.left*(1-ease),y:reduced?0:rect.top*(1-ease),
    sx:reduced?1:rect.width/viewport.width+(1-rect.width/viewport.width)*ease,
    sy:reduced?1:rect.height/viewport.height+(1-rect.height/viewport.height)*ease,
    tilt:reduced?0:-18*(1-ease),opacity:reduced?ease:1};
}
export class MonitorLift{
  constructor(root,phone){this.root=root;this.phone=phone;this.active=false;}
  update(game,visible,reduced=false){
    const remaining=game.blackout?.monitorConnecting??0,active=visible&&game.phase==='playing'&&remaining>0;
    this.root.hidden=!active;document.body.classList.toggle('monitor-lifting',active);
    if(!active){this.active=false;return;}
    if(!this.active){this.rect=this.phone.getBoundingClientRect();this.active=true;}
    const p=monitorLiftPose(1-remaining/BLACKOUT_RULES.monitorConnectSeconds,this.rect,{width:innerWidth,height:innerHeight},reduced);
    this.root.style.transform=`translate(${p.x}px,${p.y}px) scale(${p.sx},${p.sy}) rotateX(${p.tilt}deg)`;
    this.root.style.opacity=String(p.opacity);
  }
}
