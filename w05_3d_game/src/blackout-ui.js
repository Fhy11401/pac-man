import {RoomItemHUD} from './room-item-ui.js';
import {POWER_SECTORS,restoredCount} from './power-grid.js';
import {blackoutVisualLighting} from './blackout-lighting.js';
import {MAP,MAP_CENTER,CELL_SIZE,ENTRY_GATE,MAP_DOCUMENT,isInSafeRoom,edgeIsOpen} from './world.js';
import {SECURITY_CHANNELS} from './security-cameras.js';
import {SecurityCoverage} from './security-coverage.js';
import {BLACKOUT_LAYOUT as L,BLACKOUT_RULES as R} from './blackout-layout.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const seconds=value=>Math.max(0,Math.ceil(Number(value)||0));
const time=value=>`${Math.floor(seconds(value)/60).toString().padStart(2,'0')}:${(seconds(value)%60).toString().padStart(2,'0')}`;
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const monitorClock=value=>{const elapsed=Math.max(0,Math.floor(Number(value)||0));return [Math.floor(elapsed/3600),Math.floor(elapsed/60)%60,elapsed%60].map(part=>String(part).padStart(2,'0')).join(':');};

export function securityMapNavigation(){
  const cells=[];MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{if(tile!=='#')cells.push({x,z});}));
  const minX=Math.min(...cells.map(p=>p.x))-1.5,minZ=Math.min(...cells.map(p=>p.z))-1.5;
  const width=Math.max(...cells.map(p=>p.x))+1.5-minX,height=Math.max(...cells.map(p=>p.z))+1.5-minZ;
  let floors='',walls='';
  for(const {x,z} of cells){
    floors+=`M${x-.5} ${z-.5}h1v1h-1Z`;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!edgeIsOpen({x,z},{x:x+dx,z:z+dz}))walls+=dx?`M${x+dx*.5} ${z-.5}v1`:`M${x-.5} ${z+dz*.5}h1`;
  }
  // Nearby cameras share a corridor. Their labels separate without moving
  // the physical anchor: a short line connects each label to its camera.
  const offsets={'reception':{x:1.2},'room-201':{z:-.9},'room-202':{x:-.5},'entry-201':{z:.25},'south-west':{z:.2},'south-east':{z:.2},'west-hall':{z:-2.4},'east-hall':{z:-2.4}};
  const seeds=SECURITY_CHANNELS.map(channel=>{
    const p=channel.position,o=offsets[channel.id]??{},x=Math.max(8,Math.min(92,(p.x+(o.x??0)-minX)/width*100)),y=Math.max(8,Math.min(92,(p.z+(o.z??0)-minZ)/height*100));
    return{id:channel.id,x,y,anchor:{x:p.x,z:p.z},label:{x:minX+x*width/100,z:minZ+y*height/100}};
  });
  const placed=[];
  for(const seed of [...seeds].sort((a,b)=>Math.min(a.x,100-a.x,a.y,100-a.y)-Math.min(b.x,100-b.x,b.y,100-b.y))){
    const candidates=[{x:seed.x,y:seed.y}];for(let y=8;y<=92;y+=2)for(let x=8;x<=92;x+=2)candidates.push({x,y});
    candidates.sort((a,b)=>(a.x-seed.x)**2+(a.y-seed.y)**2-((b.x-seed.x)**2+(b.y-seed.y)**2));
    const at=candidates.find(p=>placed.every(other=>Math.abs(p.x-other.x)>=13.6||Math.abs(p.y-other.y)>=10.7))??candidates[0];
    placed.push({...seed,...at,label:{x:minX+at.x*width/100,z:minZ+at.y*height/100}});
  }
  const buttons=seeds.map(seed=>placed.find(p=>p.id===seed.id));
  const connectors=buttons.map(p=>`<path d="M${p.anchor.x} ${p.anchor.z}L${p.label.x} ${p.label.z}"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${width} ${height}" aria-hidden="true"><path d="${floors}" fill="#252525"/><path id="monitor-coverage" d=""/><path d="${walls}" fill="none" stroke="#ababab" stroke-width=".11"/><g fill="none" stroke="#a0a0a0" stroke-width=".09">${connectors}</g><path id="monitor-direction" d=""/></svg>`;
  return{minX,minZ,width,height,buttons,svg};
}

export function audibleDoorBash(game){
  const b=game.blackout;if(!b)return null;
  const candidates=(L.rooms??[]).flatMap(room=>{
    const door=b.roomDoors?.[room.id];if(!door?.bashing)return [];
    const distance=Math.hypot(game.player.x-room.door.x,game.player.z-room.door.z),sameRoom=b.bedHide?.roomId===room.id;
    return distance<=4.5||sameRoom?[{id:room.id,distance,sameRoom,progress:clamp(door.bashProgress)}]:[];
  });
  const d=Math.hypot(game.player.x-ENTRY_GATE.x,game.player.z-ENTRY_GATE.z);
  if(b.officeBash?.bashing&&(isInSafeRoom(game.player)||d<=4.5))candidates.push({id:'entry-gate',office:true,distance:d,sameRoom:isInSafeRoom(game.player),progress:clamp(b.officeBash.bashProgress)});
  return candidates.sort((a,c)=>a.distance-c.distance)[0]??null;
}

export class BlackoutUI{
  constructor({onAction}={}){
    this.inventoryHUD=new RoomItemHUD();
    this.onAction=onAction??(action=>window.dispatchEvent(new CustomEvent('blackout-action',{detail:action})));
    this.el=Object.fromEntries(['blackout-hud','blackout-objective','blackout-objective-note','blackout-power-state','hud-night-clock','blackout-vision','blackout-battery','blackout-battery-fill','blackout-flashlight','blackout-phone-0','blackout-phone-1','blackout-interaction','blackout-interaction-key','blackout-interaction-label','blackout-interaction-note','blackout-repair','blackout-repair-fill','blackout-repair-value','blackout-hidden','blackout-door-warning','blackout-door-warning-label','blackout-door-warning-fill','blackout-door-warning-value','night-vision-layer','security-monitor','monitor-title','monitor-plan','monitor-floorplan','monitor-enemy-marker','monitor-channels','monitor-feed','monitor-code','monitor-mode','monitor-lock','monitor-time','monitor-close','phone-flashlight','phone-monitor','phone-time','phone-control-label','movement-sound','movement-sound-label','collected','exit-state'].map(id=>[id,document.getElementById(id)]));
    this.counter=document.querySelector('.tablet-counter');this.counterLabel=document.querySelector('.count-label');this.minimap=document.getElementById('minimap');this.flashlightState=document.getElementById('phone-flashlight-state');
    this.channel=0;this.active=false;this.monitorVisible=false;this.closePending=false;this.connecting=false;this.listeners=[];this.channelButtons=[];
    const listen=(node,type,fn)=>{node.addEventListener(type,fn);this.listeners.push(()=>node.removeEventListener(type,fn));};
    listen(this.el['monitor-close'],'click',()=>{if(this.monitorVisible&&!this.closePending){this.closePending=true;this.el['monitor-close'].disabled=true;this.onAction({type:'monitor-close'});}});
    this.el['monitor-channels'].replaceChildren();const navigation=this.mapNavigation=securityMapNavigation();
    this.el['monitor-floorplan'].innerHTML=navigation.svg;this.el['monitor-plan'].style.aspectRatio=`${navigation.width} / ${navigation.height}`;
    this.coverage=new SecurityCoverage({tiles:MAP,center:MAP_CENTER,unit:CELL_SIZE,entryGate:ENTRY_GATE,rooms:L.rooms,barriers:MAP_DOCUMENT.barriers});
    this.coveragePath=document.getElementById('monitor-coverage');this.directionPath=document.getElementById('monitor-direction');this.lastCoverage=null;
    for(const [channel,definition] of SECURITY_CHANNELS.entries()){
      const button=document.createElement('button'),label=document.createElement('span'),code=document.createElement('small');
      button.id=`monitor-channel-${channel}`;button.type='button';button.dataset.channel=definition.id;label.textContent=definition.code.replace(/\s/g,'');code.textContent=definition.label;button.setAttribute('aria-label',`${definition.code} · ${definition.label}`);button.title=`${definition.code} · ${definition.label}`;button.style.left=`${navigation.buttons[channel].x}%`;button.style.top=`${navigation.buttons[channel].y}%`;button.append(label,code);this.el['monitor-channels'].append(button);this.channelButtons.push(button);listen(button,'click',()=>this.setMonitorChannel(channel));
    }
    for(const type of ['phone-flashlight','phone-monitor'])listen(this.el[type],'click',()=>{if(this.active&&this.game?.blackout?.phoneOpen&&!this.game.blackout.monitorConnecting)this.onAction({type});});
    listen(this.el['security-monitor'],'keydown',event=>{
      if(event.key!=='Tab'||!this.monitorVisible)return;
      const buttons=[this.el['monitor-close'],...this.channelButtons].filter(node=>!node.disabled),index=buttons.indexOf(document.activeElement);
      event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
    });
    this.setMonitorChannel(0);this.hide();
  }
  setMonitorChannel(channel){
    const next=Math.max(0,Math.min(SECURITY_CHANNELS.length-1,Math.trunc(Number(channel)||0))),changed=next!==this.channel;
    this.channel=next;const selected=SECURITY_CHANNELS[next];
    for(const [index,button] of this.channelButtons.entries())button.setAttribute('aria-pressed',String(index===next));
    setText(this.el['monitor-title'],selected.label);setText(this.el['monitor-code'],selected.code);
    this.el['monitor-feed'].dataset.channel=selected.id;
    this.el['monitor-feed'].setAttribute('aria-label',`${selected.label}实时监控画面。${selected.description}`);
    if(this.monitorVisible)this.updateCoverage();
    if(changed)this.setEnemySighting(null);
    if(changed&&this.monitorVisible)this.onAction({type:'monitor-channel',channel:next});
  }
  setCameraPose(pose){this.cameraPose=pose;if(this.monitorVisible)this.updateCoverage();}
  setEnemySighting(sighting){
    const dot=this.el['monitor-enemy-marker'],selected=SECURITY_CHANNELS[this.channel],map=this.mapNavigation;
    const visible=this.monitorVisible&&sighting?.game===this.game&&sighting?.channel===selected.id&&Number.isFinite(sighting.x)&&Number.isFinite(sighting.z);
    dot.hidden=!visible;this.el['monitor-lock'].hidden=!visible||!sighting.tracking;if(!visible)return;
    dot.style.left=`${(sighting.x-map.minX)/map.width*100}%`;dot.style.top=`${(sighting.z-map.minZ)/map.height*100}%`;
  }
  updateCoverage(){
    const game=this.game,b=game?.blackout;if(!b)return;
    const base=SECURITY_CHANNELS[this.channel],selected=this.cameraPose?.id===base.id?this.cameraPose:base,result=this.coverage.get(selected,{corridorWidth:game.tuning.corridorWidth,ceilingHeight:game.tuning.ceilingHeight??2.7,doorProgress:b.doorProgress,roomDoors:b.roomDoors});
    if(result===this.lastCoverage)return;this.lastCoverage=result;
    this.coveragePath.setAttribute('d',result.path);this.coveragePath.dataset.channel=selected.id;
    const p=selected.position,dx=selected.target.x-p.x,dz=selected.target.z-p.z,length=Math.hypot(dx,dz)||1,ux=dx/length,uz=dz/length;
    this.directionPath.setAttribute('d',`M${p.x+ux*.7} ${p.z+uz*.7}L${p.x-ux*.2-uz*.28} ${p.z-uz*.2+ux*.28}L${p.x-ux*.2+uz*.28} ${p.z-uz*.2-ux*.28}Z`);
  }
  hide(){
    this.inventoryHUD.hide();
    this.active=false;this.monitorVisible=false;this.closePending=false;this.connecting=false;
    for(const id of ['blackout-hud','blackout-interaction','blackout-hidden','blackout-door-warning','night-vision-layer','security-monitor','monitor-enemy-marker','monitor-lock','movement-sound'])this.el[id].hidden=true;
    this.el['security-monitor'].inert=true;this.el['monitor-close'].disabled=false;document.body.classList.remove('blackout-nightvision','blackout-hidden','blackout-monitor-open','blackout-phone-open');
    for(const id of ['phone-flashlight','phone-monitor']){this.el[id].disabled=true;this.el[id].tabIndex=-1;}
  }
  update(game,{interaction=null,active=false,heading=0}={}){
    if(game!==this.game){this.hide();this.game=game;this.setMonitorChannel(0);this.closePending=false;}
    const b=game.blackout;this.inventoryHUD.update(game,active);
    const intro={mains:{title:'夜班开始',note:'市电在线。欢迎来到永夜旅馆。',footer:'夜班开始 · 市电在线',power:'ON'},blackout:{title:'主电源中断',note:'照明失效，等待备用电源响应。',footer:'主电源中断',power:'OFF'},backup:{title:'备用电源在线',note:'监控室照明恢复，酒店主电源仍待维修。',footer:'备用电源在线',power:'AUX'}}[b?.introLighting];
    const powerState=intro?.power??(b?.powerOn?'ON':`${restoredCount(b)} / ${POWER_SECTORS.length}`);
    setText(this.el['hud-night-clock'],monitorClock(game.elapsed).slice(3));setText(this.el['blackout-power-state'],powerState);this.el['blackout-power-state'].dataset.power=String(Boolean(b?.powerOn)||restoredCount(b)>0||Boolean(intro&&powerState!=='OFF'));
    document.body.classList.toggle('blackout-mode',Boolean(b));
    this.counter.setAttribute('aria-label',b?'酒店地图与供电状态':'剩余记忆碎片');setText(this.counterLabel,b?'酒店地图':'碎片地图');
    this.minimap.setAttribute('aria-label',b?'随朝向旋转的局部地图，显示配电箱、客房电话和监控室':'随朝向旋转的地图，玩家前方朝上，显示剩余记忆碎片及出口');
    if(!active||game.phase!=='playing'||!b){this.hide();return;}
    this.active=true;const monitoring=Boolean(b.monitor),connecting=Number(b.monitorConnecting)>0,phoneOpen=Boolean(b.phoneOpen&&!monitoring&&!connecting),night=Boolean(b.nightVision&&b.battery>0&&!monitoring),battery=seconds(b.battery);
    document.body.classList.toggle('blackout-phone-open',phoneOpen);
    for(const id of ['phone-flashlight','phone-monitor']){this.el[id].disabled=!phoneOpen;this.el[id].tabIndex=phoneOpen?0:-1;}
    this.el['phone-flashlight'].setAttribute('aria-pressed',String(Boolean(b.flashlight)));this.el['phone-monitor'].setAttribute('aria-pressed',String(monitoring||connecting));
    setText(this.flashlightState,b.flashlight?'已开启':'已关闭');
    setText(this.el['phone-time'],monitorClock(game.elapsed).slice(0,5));setText(this.el['phone-control-label'],phoneOpen?(b.hidden?'返回观察':'返回行走'):'收起手机 / STOW');
    this.connecting=connecting;
    const noisy=Boolean(!b.hidden&&!b.bedTransition&&game.sprinting&&Math.hypot(game.playerVelocity?.x??0,game.playerVelocity?.z??0)>.1&&!phoneOpen&&!connecting&&!monitoring);
    this.el['movement-sound'].hidden=monitoring;this.el['movement-sound'].dataset.noisy=String(noisy);setText(this.el['movement-sound-label'],noisy?'脚步可被听见':'静步 / SILENT');
    this.el['blackout-hud'].hidden=monitoring;this.el['night-vision-layer'].hidden=!night;
    document.body.classList.toggle('blackout-nightvision',night);document.body.classList.toggle('blackout-hidden',Boolean(b.hidden)&&!monitoring);document.body.classList.toggle('blackout-monitor-open',monitoring);
    const needsNewReturn=b.powerOn&&b.hasLeftRoom===false;
    setText(this.el.collected,powerState);setText(this.el['exit-state'],intro?.footer??(needsNewReturn?'维修已保留 · 重新出门后返回':b.powerOn?'返回监控室 · 关闭机械门':`已供电 ${restoredCount(b)} / ${POWER_SECTORS.length} 区`));
    setText(this.el['blackout-objective'],intro?.title??(needsNewReturn?'重新出门，再安全返回':b.powerOn?'返回监控室并关门':`恢复分区供电 · ${restoredCount(b)} / ${POWER_SECTORS.length}`));
    const returnNote=needsNewReturn?'维修进度已保留。本次复活后须重新出门，再回来关门。':b.doorClosed&&isInSafeRoom(game.player)?'门已合上，走回监控台区域完成夜班。':'回到监控室，在门内合上机械门。';
    setText(this.el['blackout-objective-note'],intro?.note??(b.powerOn?returnNote:'寻找 P 编号配电箱 · 维修声全酒店可闻，亮区会暴露位置。'));
    setText(this.el['blackout-vision'],b.nightVision?'夜视开启':battery?'夜视待机':'电池耗尽');setText(this.el['blackout-battery'],time(b.battery));
    this.el['blackout-battery-fill'].style.transform=`scaleX(${clamp(b.battery/R.batterySeconds)})`;
    this.el['blackout-battery'].classList.toggle('battery-low',battery<=15);
    setText(this.el['blackout-flashlight'],b.flashlight?'手电 开':'手电 关');
    for(const [index] of L.phones.entries()){
      const state=b.phones?.[index]??{},remaining=seconds(state.remaining),cooldown=seconds(state.cooldown);
      setText(this.el[`blackout-phone-${index}`],remaining?`响铃 ${remaining}s`:cooldown?`冷却 ${cooldown}s`:'可拨号');
      this.el[`blackout-phone-${index}`].classList.toggle('is-ringing',remaining>0);
    }
    this.el['blackout-hidden'].hidden=!b.hidden||monitoring;
    const bash=audibleDoorBash(game);this.el['blackout-door-warning'].hidden=!bash;
    if(bash){
      setText(this.el['blackout-door-warning-label'],bash.office?'机械门正在遭到撞击':bash.sameRoom?'房门正在遭到撞击':'近处传来砸门声');
      this.el['blackout-door-warning-fill'].style.transform=`scaleX(${bash.progress})`;
      this.el['blackout-door-warning'].setAttribute('aria-valuenow',String(Math.round(bash.progress*100)));
      setText(this.el['blackout-door-warning-value'],`${Math.round(bash.progress*100)}%`);
    }
    const prompt=Boolean(interaction&&!monitoring&&!phoneOpen&&!connecting);this.el['blackout-interaction'].hidden=!prompt;
    if(prompt){
      const power=interaction.kind==='power',roomDoor=interaction.kind==='room-door',repair=power&&!interaction.complete,progress=clamp(interaction.progress??(power?b.repairProgress:0));
      setText(this.el['blackout-interaction-key'],interaction.kind==='monitor'?'M':'E');
      setText(this.el['blackout-interaction-label'],interaction.label);
      setText(this.el['blackout-interaction-note'],interaction.kind==='note'?'点击纸条或按 E 阅读':interaction.kind==='item'?interaction.note:repair?'维修声：全酒店可闻 · 松开 E 保留进度':roomDoor?'快速操作会发声 · 按住可安静操作':power?(b.powerOn?'返回监控室，在门内合上机械门':'本区已供电 · 寻找其他 P 编号配电箱'):interaction.kind==='battery'?`补充 ${R.batteryPickup} 秒电量，满电时保留`:interaction.kind==='monitor'?'查看监控，危险不会暂停':interaction.kind==='bed'?(b.hidden?'Space 收放手机 · M 查看监控':'按 E 藏身，避免在最后的住客眼前进入'):b.doorClosed?'打开后再通过':'合上门扇');
      this.el['blackout-repair'].hidden=!(repair||roomDoor);this.el['blackout-repair'].setAttribute('aria-label',roomDoor?'客房门静音操作进度':'配电箱维修进度');
      this.el['blackout-repair-fill'].style.transform=`scaleX(${progress})`;setText(this.el['blackout-repair-value'],roomDoor?`${Math.round(progress*100)}%`:`${(progress*R.repairSeconds).toFixed(1)} / ${R.repairSeconds}s`);
      this.el['blackout-repair'].setAttribute('aria-valuenow',String(Math.round(progress*100)));
    }
    this.el['security-monitor'].hidden=!monitoring;this.el['security-monitor'].inert=!monitoring;
    if(monitoring){
      this.updateCoverage();
      if(!this.monitorVisible)this.el['monitor-close'].focus({preventScroll:true});
      const channelPowered=blackoutVisualLighting(b,SECURITY_CHANNELS[this.channel].position).powerOn;
      setText(this.el['monitor-mode'],channelPowered?'彩色监控':'红外监控');setText(this.el['monitor-time'],monitorClock(game.elapsed));
      this.el['security-monitor'].dataset.mode=channelPowered?'color':'infrared';
    }
    else{this.closePending=false;this.el['monitor-close'].disabled=false;}
    this.monitorVisible=monitoring;if(!monitoring)this.setEnemySighting(null);
  }
  destroy(){this.inventoryHUD.dispose();this.hide();this.coverage.clear();for(const remove of this.listeners)remove();this.listeners=[];}
}

export const createBlackoutUI=options=>new BlackoutUI(options);
