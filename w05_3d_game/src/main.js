import {createGame,tick} from './core.js';
import {SHARDS,RULES,distance,isOpen} from './world.js';
import {DemoController} from './demo.js';
import {WorldView} from './view.js';
import {drawMap} from './map-view.js';
import {dangerGlowOpacity} from './visibility.js';
import {Sound} from './audio.js';
import {MouseLook,MouseResistance,MOUSE_RADIANS_PER_PIXEL} from './look-input.js';
import {DEFAULT_TUNING,TUNING_GROUPS,TUNING_FIELDS,MOVEMENT_KEYS,formatTuning} from './tuning.js';
const mouseLook=new MouseLook(),mouseResistance=new MouseResistance();
import {stableFrameDt,captureScareLook,scareLookPose,QuickTurn} from './presentation.js';
const quickTurn=new QuickTurn();
let tabletShown=true,scareLook=null;
const $=id=>document.getElementById(id),sound=new Sound(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Defaults change only through source edits; all UI adjustments are page-local.
const DEFAULT_SETTINGS=Object.freeze({...DEFAULT_TUNING,motion:!reduced,autorun:false,zoom:true,music:.65});
let settings={...DEFAULT_SETTINGS};
for(const group of TUNING_GROUPS){
 const section=group.id?$(group.id):document.createElement('fieldset');
 if(!group.id){const legend=document.createElement('legend');legend.textContent=group.title;section.append(legend);}
 for(const field of group.fields){
  const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');
  label.htmlFor=field.key+'-setting';label.textContent=field.label;output.id=field.key+'-value';label.append(output);
  Object.assign(input,{id:field.key+'-setting',type:'range',min:field.min,max:field.max,step:field.step,value:field.value});section.append(label,input);
 }
 if(!group.id)$('developer-fields').insertBefore(section,$('developer-map-options'));
}
let game=createGame(settings),bot=new DemoController(),view,screen='menu',mode='human',yaw=-Math.PI/2,pitch=0,keys=new Set(),hadPointerLock=false;
let renderDirty=true,sceneReady=false;
const startLabel=$('start-button').innerHTML,startControls=['start-button','demo-restart','restart-pause','restart-result'];
let lastFrame=performance.now(),sceneTime=0,uiTimer=0,toastUntil=0,resultDelay=0,demoClock=0,pickupUntil=0;
const time=v=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(Math.floor(v%60)).padStart(2,'0')}`,hide=(id,v)=>$(id).hidden=v;
function announce(s,ms=2600){$('toast').textContent=s;toastUntil=performance.now()+ms;$('toast').classList.add('show');}
function releasePointer(){mouseResistance.reset();mouseLook.setLocked(false);hadPointerLock=false;if(document.pointerLockElement)document.exitPointerLock();}
function requestPointer(){mouseLook.setLocked(document.pointerLockElement===view.renderer.domElement);const fallback=()=>announce('按住鼠标左键转向，也可用 ← →',2200);try{view.renderer.domElement.requestPointerLock?.()?.catch(fallback);}catch{fallback();}}
function updateScreen(){
  renderDirty=true;
  hide('content-notice',screen!=='notice');
  hide('menu',!['menu','settings','developer'].includes(screen));hide('hud',['menu','settings','developer','notice','error'].includes(screen));hide('pause-panel',!['paused','settings'].includes(screen));hide('developer-panel',screen!=='developer');hide('result',screen!=='result');hide('pause-button',!['playing','paused'].includes(screen));hide('demo-bar',mode!=='demo'||screen!=='playing');hide('respawn',game.phase!=='respawn'||screen!=='playing');
  document.body.dataset.screen=screen;document.body.dataset.phase=game.phase;$('menu').inert=['settings','developer'].includes(screen);$('hud').inert=screen!=='playing';
  const inSettings=screen==='settings';$('pause-title').textContent=inSettings?'夜班设置':'已暂停';$('resume-button').innerHTML=inSettings?'返回主菜单 <span>›</span>':'继续探索 <span>›</span>';hide('restart-pause',inSettings);hide('menu-pause',inSettings);
  sound.setPlaying(screen==='playing'&&game.phase==='playing');sound.setPaused(screen!=='playing');
  if(screen==='notice')$('notice-continue').focus({preventScroll:true});
  if(screen==='paused'||screen==='settings')$('resume-button').focus();if(screen==='result')$('restart-result').focus();if(screen==='developer'){$('fov-setting').focus({preventScroll:true});$('developer-panel').querySelector('.modal-content').scrollTop=0;}
}
function start(nextMode='human'){
  if(!sceneReady)return;
  quickTurn.cancel();
  rebuildCorridors();if(!sceneReady)return;mode=nextMode;game=createGame(settings);bot=new DemoController();yaw=-Math.PI/2;pitch=0;keys.clear();mouseLook.cancelDrag();mouseResistance.reset();demoClock=0;resultDelay=0;screen='playing';tabletShown=true;scareLook=null;sound.unlock();sound.setPaused(false);sound.event('start');$('toast').classList.remove('show');updateScreen();updateHUD();if(mode==='human')requestPointer();else releasePointer();lastFrame=performance.now();
}
function menu(message='电脑键盘与鼠标游玩 · 建议佩戴耳机'){
  quickTurn.cancel();
  screen='menu';keys.clear();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();game=createGame(settings);yaw=-Math.PI/2;pitch=0;mode='human';$('menu-note').textContent=message;$('toast').classList.remove('show');$('danger-glow').style.opacity=0;$('pickup-glow').style.opacity=0;document.body.classList.remove('escape');updateScreen();
}
function pause(message='时间与巡夜人都已暂停。'){if(screen!=='playing')return;quickTurn.cancel();screen='paused';keys.clear();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();$('pause-note').textContent=message;updateScreen();}
function resume(){if(screen==='settings'){menu();return;}if(screen!=='paused')return;screen='playing';sound.unlock();lastFrame=performance.now();updateScreen();if(mode==='human')requestPointer();}
function showResult(){
  quickTurn.cancel();
  screen='result';releasePointer();keys.clear();const won=game.phase==='won';$('result-label').textContent=mode==='demo'?'DEMO COMPLETE':won?'CHECKED OUT':'STILL CHECKED IN';$('result-title').textContent=won?'你离开了旅馆':'你被留在了这里';$('result-copy').textContent=won?(mode==='demo'?'自动演示已收集全部记忆碎片，并成功返回大堂。':'遗落的记忆已带回大堂。这一夜，终于结束。'):'三次机会已经用尽。记住岔路，留意红光，再试一次。';$('result-count').textContent=`${game.collected.size} / ${SHARDS.length}`;$('result-time').textContent=time(game.elapsed);$('result-lives').textContent=game.lives;$('restart-result').innerHTML=(mode==='demo'?'我来试试':'再探索一次')+' <span>›</span>';resultDelay=mode==='demo'?7:0;$('demo-return').textContent=mode==='demo'?'7 秒后返回主菜单':'';$('toast').classList.remove('show');updateScreen();
}
function updateHUD(){
  const left=SHARDS.length-game.collected.size,unlocked=left===0;
  $('collected').textContent=String(left).padStart(3,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'◆':'◇').join(' ');$('lives').setAttribute('aria-label',`剩余 ${game.lives} 条命`);$('exit-state').textContent=unlocked?'返回大堂出口':'收集记忆碎片';
  updateDangerGlow();$('countdown').textContent=Math.max(1,Math.ceil(game.respawn));$('respawn-lives').textContent=`剩余 ${game.lives} 次机会 · 收集进度已保留`;document.body.classList.toggle('escape',unlocked);
  const up=tabletShown&&game.phase==='playing';$('tablet').classList.toggle('stowed',!up);$('tablet').setAttribute('aria-hidden',String(!up));$('tablet-toggle').setAttribute('aria-expanded',String(up));const tabletLabel=`<kbd>Space</kbd> ${tabletShown?'收起地图':'展开地图'}`;if($('tablet-toggle').innerHTML!==tabletLabel)$('tablet-toggle').innerHTML=tabletLabel;
}
function updateDangerGlow(){
  $('danger-glow').style.opacity=screen==='playing'&&game.phase==='playing'?dangerGlowOpacity(game.player,game.enemy,settings.corridorWidth):0;
}
function manualInput(dt){
  yaw+=quickTurn.step(dt);
  if(keys.has('arrowleft'))yaw+=dt*2.65;if(keys.has('arrowright'))yaw-=dt*2.65;
  const forward=(keys.has('keyw')?1:0)-(keys.has('keys')?1:0),side=(keys.has('keyd')?1:0)-(keys.has('keya')?1:0),shift=keys.has('shiftleft')||keys.has('shiftright');
  return{x:-Math.sin(yaw)*forward+Math.cos(yaw)*side,z:-Math.cos(yaw)*forward-Math.sin(yaw)*side,heading:yaw,run:settings.autorun?!shift:shift};
}
function toggleSound(){sound.unlock();const muted=sound.toggle();$('mute-button').textContent=muted?'声音 关':'声音 开';$('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'取消静音':'静音');}
function watchViewReady(){
  const pending=view;sceneReady=false;
  for(const id of startControls)$(id).disabled=true;
  $('start-button').innerHTML='<span>布置夜班中…</span><small>PREPARING THE HOTEL</small><b>…</b>';
  pending.ready.then(()=>{
    if(view!==pending)return;
    sceneReady=true;renderDirty=true;
    for(const id of startControls)$(id).disabled=false;
    $('start-button').innerHTML=startLabel;
  }).catch(error=>{
    if(view!==pending)return;
    screen='error';updateScreen();hide('error-panel',false);$('error-message').textContent=error.message;console.error(error);
  });
}
function rebuildCorridors(){
  if(view.corridorWidth===settings.corridorWidth&&view.ceilingHeight===settings.ceilingHeight)return;
  view.dispose();view=new WorldView($('scene'),settings);watchViewReady();installLook(view.renderer.domElement);applySettings();
}
function applySettings(){
  renderDirty=true;
  $('zoom-setting').checked=settings.zoom;
  sound.setMusicVolume(settings.music);$('music-setting').value=settings.music;$('music-value').textContent=`${Math.round(settings.music*100)}%`;
  view.horizontalFov=settings.fov;view.renderer.toneMappingExposure=.96*settings.brightness;view.motionTuning={...settings};view.motionEnabled=settings.motion;view.eyeHeight=settings.eyeHeight;
  for(const field of TUNING_FIELDS){$(field.key+'-setting').value=settings[field.key];$(field.key+'-value').textContent=formatTuning(field,settings[field.key]);}
  for(const key of MOVEMENT_KEYS)game.tuning[key]=settings[key];
}
function audioOccluded(){const d=distance(game.player,game.enemy),steps=Math.ceil(d*3);for(let i=1;i<steps;i++){if(!isOpen(Math.round(game.player.x+(game.enemy.x-game.player.x)*i/steps),Math.round(game.player.z+(game.enemy.z-game.player.z)*i/steps)))return true;}return false;}
function frame(now){
  requestAnimationFrame(frame);const dt=stableFrameDt((now-lastFrame)/1000);lastFrame=now;if(document.hidden)return;if(screen!=='playing'&&!renderDirty&&!(screen==='result'&&mode==='demo'))return;if(!['paused','settings','developer'].includes(screen))sceneTime+=dt;
  if(screen==='playing'){
    const input=game.phase==='playing'?(mode==='demo'?bot.input(game,dt):manualInput(dt)):{x:0,z:0};
    if(mode==='demo'&&game.phase==='playing'){yaw=bot.yaw;pitch=0;}
    const events=tick(game,input,dt);for(const event of events){sound.event(event,game.collected.size);if(event==='collect')pickupUntil=now+130;if(event==='unlock'){announce('记忆已集齐。回到大堂，离开旅馆。',4000);}if(event==='hit'){quickTurn.cancel();scareLook=captureScareLook(game.player,game.enemy,yaw,pitch);keys.clear();mouseLook.cancelDrag();mouseResistance.reset();updateScreen();}if(event==='relocate'){yaw=-Math.PI/2;pitch=0;scareLook=null;updateScreen();}if(event==='respawn')updateScreen();if(event==='won'||event==='lost')showResult();}
    sound.setPlaying(screen==='playing'&&game.phase==='playing');
    if(mode==='demo'){demoClock+=dt;if(demoClock>180&&screen==='playing')menu('演示超时，未完成通关。可重播或人工游玩。');}
  }else if(screen==='result'&&mode==='demo'){resultDelay-=dt;$('demo-return').textContent=`${Math.max(0,Math.ceil(resultDelay))} 秒后返回主菜单`;if(resultDelay<=0)menu(game.phase==='won'?'Demo 已成功通关。现在轮到你了。':'Demo 未成功通关，可重播或人工游玩。');}
  if(now>toastUntil)$('toast').classList.remove('show');$('pickup-glow').style.opacity=now<pickupUntil&&screen==='playing'?.75:0;
  uiTimer+=dt;if(uiTimer>=.07){updateHUD();uiTimer=0;}
  if(screen==='playing')updateDangerGlow();
  if(game.phase==='caught'&&scareLook){const pose=scareLookPose(scareLook,RULES.caughtSeconds-game.caught);yaw=pose.yaw;pitch=pose.pitch;}
  if(screen==='playing'||renderDirty){view.render(game,yaw,pitch,sceneTime,dt,screen==='playing',mode==='demo'?.65:1);renderDirty=false;}
  if(screen==='playing'&&game.phase==='playing'){
    const d=distance(game.player,game.enemy),dx=game.enemy.x-game.player.x,dz=game.enemy.z-game.player.z,pan=Math.max(-1,Math.min(1,(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d)));
    sound.update(dt,Math.hypot(game.playerVelocity.x,game.playerVelocity.z),d,pan,audioOccluded(),game.collected.size===SHARDS.length,Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z),view.playerMotion.steps);
  }
  if(tabletShown&&screen==='playing'&&game.phase==='playing')drawMap($('minimap'),game,yaw,settings.zoom,settings.localMapScale);
  const caughtTime=RULES.caughtSeconds-game.caught;
  $('death-shade').style.opacity=screen==='playing'?(game.phase==='caught'?Math.max(0,Math.min(1,(caughtTime-.72)/.25)):game.phase==='respawn'?Math.min(1,game.respawn/.3):0):0;
  $('respawn').style.opacity=Math.min(1,game.respawn/.3);

}
function toggleTablet(){if(screen!=='playing'||game.phase!=='playing')return;tabletShown=!tabletShown;sound.event('tablet');updateHUD();}
$('tablet-toggle').onclick=toggleTablet;
$('notice-continue').onclick=()=>{menu();$('start-button').focus({preventScroll:true});};
$('start-button').onclick=()=>start();$('demo-restart').onclick=()=>start('demo');$('demo-exit').onclick=()=>menu('Demo 已退出。你可以开始人工游玩。');$('pause-button').onclick=()=>pause();$('resume-button').onclick=resume;$('restart-pause').onclick=()=>start(mode);$('restart-result').onclick=()=>start();$('menu-pause').onclick=()=>menu();$('menu-result').onclick=()=>menu();$('mute-button').onclick=toggleSound;$('settings-button').onclick=()=>{screen='settings';$('pause-note').textContent='设置仅在本次页面有效，刷新后恢复默认。';updateScreen();};
$('developer-button').onclick=()=>{screen='developer';updateScreen();};
$('developer-back').onclick=()=>{rebuildCorridors();menu();$('developer-button').focus();};
$('developer-reset').onclick=()=>{for(const field of TUNING_FIELDS)settings[field.key]=DEFAULT_SETTINGS[field.key];settings.zoom=DEFAULT_SETTINGS.zoom;applySettings();rebuildCorridors();};
for(const field of TUNING_FIELDS)$(field.key+'-setting').oninput=e=>{settings[field.key]=Number(e.target.value);applySettings();};
$('corridorWidth-setting').onchange=rebuildCorridors;
$('ceilingHeight-setting').onchange=rebuildCorridors;
$('motion-setting').checked=settings.motion;$('autorun-setting').checked=settings.autorun;$('zoom-setting').checked=settings.zoom;
$('music-setting').oninput=e=>{settings.music=Number(e.target.value);applySettings();};
for(const [id,k] of [['motion-setting','motion'],['autorun-setting','autorun'],['zoom-setting','zoom']])$(id).onchange=e=>{settings[k]=e.target.checked;applySettings();};
window.addEventListener('keydown',e=>{
  const code=e.code.toLowerCase();if(code==='keym'&&!e.repeat&&screen!=='notice'&&screen!=='error')toggleSound();
  if(code==='escape'){if(mode==='demo'&&screen==='playing')menu('Demo 已退出。你可以开始人工游玩。');else if(screen==='playing')pause();else if(['settings','developer'].includes(screen)){const back=screen==='developer'?'developer-button':'settings-button';menu();$(back).focus();}return;}
  if(code==='space'&&screen==='playing'){e.preventDefault();if(!e.repeat)toggleTablet();return;}
  if(screen==='playing'&&mode==='human'&&['keyw','keya','keys','keyd','shiftleft','shiftright','arrowleft','arrowright'].includes(code)){e.preventDefault();keys.add(code);}
});window.addEventListener('keyup',e=>keys.delete(e.code.toLowerCase()));
function canLook(){return screen==='playing'&&game.phase==='playing'&&mode==='human';}
function applyLook(delta,time){delta=mouseResistance.apply(delta,time,settings.mouseFriction,settings.mouseAcceleration);if(!delta)return;yaw-=delta.x*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch-delta.y*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity));}
function cancelDrag(){const canvas=view?.renderer.domElement,id=mouseLook.pointerId;mouseLook.cancelDrag();mouseResistance.reset();if(id!==null&&canvas?.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
function installLook(canvas){
  canvas.addEventListener('pointerdown',e=>{
    if(canLook()&&e.button===1){e.preventDefault();if(quickTurn.start(settings.quickTurnDuration)&&reduced)yaw+=quickTurn.step(quickTurn.duration);cancelDrag();return;}
    if(!canLook()||document.pointerLockElement===canvas)return;
    if(mouseLook.beginDrag(e)){mouseResistance.reset();e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}}
  });
  canvas.addEventListener('pointermove',e=>{if(canLook()&&document.pointerLockElement!==canvas)applyLook(mouseLook.drag(e),e.timeStamp);});
  canvas.addEventListener('lostpointercapture',()=>mouseLook.cancelDrag());
  canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  canvas.addEventListener('pointerleave',e=>{if(!canvas.hasPointerCapture?.(e.pointerId))cancelDrag();});
}
window.addEventListener('pointerup',cancelDrag);window.addEventListener('pointercancel',cancelDrag);
window.addEventListener('mousemove',e=>{if(canLook()&&document.pointerLockElement===view?.renderer.domElement)applyLook(mouseLook.relative(e),e.timeStamp);});
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===view?.renderer.domElement;mouseLook.setLocked(locked);mouseResistance.reset();
  if(locked){hadPointerLock=true;return;}
  if(hadPointerLock&&screen==='playing'&&mode==='human')pause();hadPointerLock=false;
});
window.addEventListener('resize',()=>{renderDirty=true;});
window.addEventListener('blur',()=>{keys.clear();cancelDrag();if(screen==='playing')pause('窗口失去焦点，游戏已自动暂停。');});
document.addEventListener('visibilitychange',()=>{renderDirty=true;if(document.hidden){cancelDrag();if(screen==='playing')pause('页面已切换，游戏已自动暂停。');}});
try{view=new WorldView($('scene'),settings);watchViewReady();applySettings();document.querySelectorAll('.total-shards').forEach(e=>e.textContent=SHARDS.length);installLook(view.renderer.domElement);menu();screen='notice';updateScreen();requestAnimationFrame(frame);}catch(error){screen='error';updateScreen();hide('error-panel',false);$('error-message').textContent=error.message;console.error(error);}
