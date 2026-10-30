import {createGame,tick} from './core.js';
import {SHARDS,RULES,distance,isOpen} from './world.js';
import {DemoController} from './demo.js';
import {WorldView} from './view.js';
import {drawMap} from './map-view.js';
import {Sound} from './audio.js';
import {MouseLook,MOUSE_RADIANS_PER_PIXEL} from './look-input.js';
const mouseLook=new MouseLook();
import {stableFrameDt,captureScareLook,scareLookPose} from './presentation.js';
let tabletShown=true,scareLook=null;
const $=id=>document.getElementById(id),sound=new Sound(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let settings={fov:94,sensitivity:1,motion:!reduced,autorun:false,zoom:false};
try{const saved=JSON.parse(localStorage.getItem('echo-settings-v2')||'{}');for(const k of ['motion','autorun','zoom'])if(typeof saved[k]==='boolean')settings[k]=saved[k];if(saved.fov>=80&&saved.fov<=108)settings.fov=saved.fov;if(saved.sensitivity>=.5&&saved.sensitivity<=2)settings.sensitivity=saved.sensitivity;}catch{}
let game=createGame(),bot=new DemoController(),view,screen='menu',mode='human',yaw=-Math.PI/2,pitch=0,keys=new Set(),hadPointerLock=false;
let lastFrame=performance.now(),sceneTime=0,uiTimer=0,toastUntil=0,resultDelay=0,demoClock=0,pickupUntil=0;
const time=v=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(Math.floor(v%60)).padStart(2,'0')}`,hide=(id,v)=>$(id).hidden=v;
function announce(s,ms=2600){$('toast').textContent=s;toastUntil=performance.now()+ms;$('toast').classList.add('show');}
function releasePointer(){mouseLook.setLocked(false);hadPointerLock=false;if(document.pointerLockElement)document.exitPointerLock();}
function requestPointer(){mouseLook.setLocked(document.pointerLockElement===view.renderer.domElement);const fallback=()=>announce('按住鼠标左键转向，也可用 ← →',2200);try{view.renderer.domElement.requestPointerLock?.()?.catch(fallback);}catch{fallback();}}
function updateScreen(){
  hide('menu',!['menu','settings'].includes(screen));hide('hud',['menu','settings','error'].includes(screen));hide('pause-panel',!['paused','settings'].includes(screen));hide('result',screen!=='result');hide('pause-button',!['playing','paused'].includes(screen));hide('demo-bar',mode!=='demo'||screen!=='playing');hide('respawn',game.phase!=='respawn'||screen!=='playing');
  document.body.dataset.screen=screen;document.body.dataset.phase=game.phase;$('menu').inert=screen==='settings';$('hud').inert=screen!=='playing';
  const inSettings=screen==='settings';$('pause-title').textContent=inSettings?'游戏设置':'已暂停';$('resume-button').innerHTML=inSettings?'返回主菜单 <span>›</span>':'继续探索 <span>›</span>';hide('restart-pause',inSettings);hide('menu-pause',inSettings);
  sound.setPlaying(screen==='playing'&&game.phase==='playing');sound.setPaused(screen==='paused'||screen==='settings'||screen==='menu');
  if(screen==='paused'||screen==='settings')$('resume-button').focus();if(screen==='result')$('restart-result').focus();
}
function start(nextMode='human'){
  mode=nextMode;game=createGame();bot=new DemoController();yaw=-Math.PI/2;pitch=0;keys.clear();mouseLook.cancelDrag();demoClock=0;resultDelay=0;screen='playing';tabletShown=true;scareLook=null;sound.unlock();sound.setPaused(false);sound.event('start');$('toast').classList.remove('show');updateScreen();updateHUD();if(mode==='human')requestPointer();else releasePointer();lastFrame=performance.now();
}
function menu(message='电脑键盘与鼠标游玩 · 建议佩戴耳机'){
  screen='menu';keys.clear();mouseLook.cancelDrag();releasePointer();game=createGame();yaw=-Math.PI/2;pitch=0;mode='human';$('menu-note').textContent=message;$('toast').classList.remove('show');$('danger-glow').style.opacity=0;$('pickup-glow').style.opacity=0;document.body.classList.remove('escape');updateScreen();
}
function pause(message='时间与巡守者都已暂停。'){if(screen!=='playing')return;screen='paused';keys.clear();mouseLook.cancelDrag();releasePointer();$('pause-note').textContent=message;updateScreen();}
function resume(){if(screen==='settings'){menu();return;}if(screen!=='paused')return;screen='playing';sound.unlock();lastFrame=performance.now();updateScreen();if(mode==='human')requestPointer();}
function showResult(){
  screen='result';releasePointer();keys.clear();const won=game.phase==='won';$('result-label').textContent=mode==='demo'?'DEMO COMPLETE':won?'ARCHIVE COMPLETE':'SIGNAL LOST';$('result-title').textContent=won?'回声已归档':'你迷失在回廊里';$('result-copy').textContent=won?(mode==='demo'?'自动演示已收集全部回声，并成功返回入口。':'所有回声已带回入口。你离开了永夜回廊。'):'三次机会已经用尽。记住岔路，留意红光，再试一次。';$('result-count').textContent=`${game.collected.size} / ${SHARDS.length}`;$('result-time').textContent=time(game.elapsed);$('result-lives').textContent=game.lives;$('restart-result').innerHTML=(mode==='demo'?'我来试试':'再探索一次')+' <span>›</span>';resultDelay=mode==='demo'?7:0;$('demo-return').textContent=mode==='demo'?'7 秒后返回主菜单':'';$('toast').classList.remove('show');updateScreen();
}
function updateHUD(){
  const left=SHARDS.length-game.collected.size,unlocked=left===0,d=distance(game.player,game.enemy);
  $('collected').textContent=String(left).padStart(3,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'◆':'◇').join(' ');$('lives').setAttribute('aria-label',`剩余 ${game.lives} 条命`);$('exit-state').textContent=unlocked?'返回绿色入口':'收集全部回声';
  $('danger-glow').style.opacity=screen==='playing'&&game.phase==='playing'?Math.max(0,(2.7-d)/2.7)*.4:0;$('countdown').textContent=Math.max(1,Math.ceil(game.respawn));$('respawn-lives').textContent=`剩余 ${game.lives} 次机会 · 收集进度已保留`;document.body.classList.toggle('escape',unlocked);
  const up=tabletShown&&game.phase==='playing';$('tablet').classList.toggle('stowed',!up);$('tablet').setAttribute('aria-hidden',String(!up));$('tablet-toggle').setAttribute('aria-expanded',String(up));const tabletLabel=`<kbd>Space</kbd> ${tabletShown?'收起地图':'展开地图'}`;if($('tablet-toggle').innerHTML!==tabletLabel)$('tablet-toggle').innerHTML=tabletLabel;
}
function manualInput(dt){
  if(keys.has('arrowleft'))yaw+=dt*2.65;if(keys.has('arrowright'))yaw-=dt*2.65;
  const forward=(keys.has('keyw')?1:0)-(keys.has('keys')?1:0),side=(keys.has('keyd')?1:0)-(keys.has('keya')?1:0),shift=keys.has('shiftleft')||keys.has('shiftright');
  return{x:-Math.sin(yaw)*forward+Math.cos(yaw)*side,z:-Math.cos(yaw)*forward-Math.sin(yaw)*side,run:settings.autorun?!shift:shift};
}
function toggleSound(){sound.unlock();const muted=sound.toggle();$('mute-button').textContent=muted?'声音 关':'声音 开';$('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'取消静音':'静音');}
function saveSettings(){try{localStorage.setItem('echo-settings-v2',JSON.stringify(settings));}catch{}view.horizontalFov=settings.fov;view.motionEnabled=settings.motion;$('fov-value').textContent=`${settings.fov}°`;$('sensitivity-value').textContent=`${settings.sensitivity.toFixed(1)}×`;}
function audioOccluded(){const d=distance(game.player,game.enemy),steps=Math.ceil(d*3);for(let i=1;i<steps;i++){if(!isOpen(Math.round(game.player.x+(game.enemy.x-game.player.x)*i/steps),Math.round(game.player.z+(game.enemy.z-game.player.z)*i/steps)))return true;}return false;}
function frame(now){
  requestAnimationFrame(frame);const dt=stableFrameDt((now-lastFrame)/1000);lastFrame=now;if(screen!=='paused'&&screen!=='settings')sceneTime+=dt;
  if(screen==='playing'){
    const input=game.phase==='playing'?(mode==='demo'?bot.input(game,dt):manualInput(dt)):{x:0,z:0};
    if(mode==='demo'&&game.phase==='playing'){yaw=bot.yaw;pitch=0;}
    const events=tick(game,input,dt);for(const event of events){sound.event(event,game.collected.size);if(event==='collect')pickupUntil=now+130;if(event==='unlock'){announce('回声已集齐。回到入口，离开这里。',4000);}if(event==='hit'){scareLook=captureScareLook(game.player,game.enemy,yaw,pitch);keys.clear();mouseLook.cancelDrag();updateScreen();}if(event==='relocate'){yaw=-Math.PI/2;pitch=0;scareLook=null;updateScreen();}if(event==='respawn')updateScreen();if(event==='won'||event==='lost')showResult();}
    sound.setPlaying(screen==='playing'&&game.phase==='playing');if(game.phase==='playing'&&screen==='playing'){
      const d=distance(game.player,game.enemy),dx=game.enemy.x-game.player.x,dz=game.enemy.z-game.player.z,pan=Math.max(-1,Math.min(1,(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d)));
      sound.update(dt,Math.hypot(game.playerVelocity.x,game.playerVelocity.z),d,pan,audioOccluded(),game.collected.size===SHARDS.length,Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z));
    }
    if(mode==='demo'){demoClock+=dt;if(demoClock>180&&screen==='playing')menu('演示超时，未完成通关。可重播或人工游玩。');}
  }else if(screen==='result'&&mode==='demo'){resultDelay-=dt;$('demo-return').textContent=`${Math.max(0,Math.ceil(resultDelay))} 秒后返回主菜单`;if(resultDelay<=0)menu(game.phase==='won'?'Demo 已成功通关。现在轮到你了。':'Demo 未成功通关，可重播或人工游玩。');}
  if(now>toastUntil)$('toast').classList.remove('show');$('pickup-glow').style.opacity=now<pickupUntil&&screen==='playing'?.75:0;
  uiTimer+=dt;if(uiTimer>=.07){updateHUD();uiTimer=0;}
  if(game.phase==='caught'&&scareLook){const pose=scareLookPose(scareLook,RULES.caughtSeconds-game.caught);yaw=pose.yaw;pitch=pose.pitch;}
  view.render(game,yaw,pitch,sceneTime,dt,screen==='playing',mode==='demo'?.65:1);
  if(tabletShown&&screen==='playing'&&game.phase==='playing')drawMap($('minimap'),game,yaw,settings.zoom);
  const caughtTime=RULES.caughtSeconds-game.caught;
  $('death-shade').style.opacity=screen==='playing'?(game.phase==='caught'?Math.max(0,Math.min(1,(caughtTime-.72)/.25)):game.phase==='respawn'?Math.min(1,game.respawn/.3):0):0;
  $('respawn').style.opacity=Math.min(1,game.respawn/.3);

}
function toggleTablet(){if(screen!=='playing'||game.phase!=='playing')return;tabletShown=!tabletShown;sound.event('tablet');updateHUD();}
$('tablet-toggle').onclick=toggleTablet;
$('start-button').onclick=()=>start();$('demo-button').onclick=()=>start('demo');$('demo-restart').onclick=()=>start('demo');$('demo-exit').onclick=()=>menu('Demo 已退出。你可以开始人工游玩。');$('pause-button').onclick=()=>pause();$('resume-button').onclick=resume;$('restart-pause').onclick=()=>start(mode);$('restart-result').onclick=()=>start();$('menu-pause').onclick=()=>menu();$('menu-result').onclick=()=>menu();$('mute-button').onclick=toggleSound;$('settings-button').onclick=()=>{screen='settings';$('pause-note').textContent='设置会保存在此浏览器。';updateScreen();};
$('fov-setting').value=settings.fov;$('sensitivity-setting').value=settings.sensitivity;$('motion-setting').checked=settings.motion;$('autorun-setting').checked=settings.autorun;$('zoom-setting').checked=settings.zoom;
$('fov-setting').oninput=e=>{settings.fov=Number(e.target.value);saveSettings();};$('sensitivity-setting').oninput=e=>{settings.sensitivity=Number(e.target.value);saveSettings();};for(const [id,k] of [['motion-setting','motion'],['autorun-setting','autorun'],['zoom-setting','zoom']])$(id).onchange=e=>{settings[k]=e.target.checked;saveSettings();};
window.addEventListener('keydown',e=>{
  const code=e.code.toLowerCase();if(code==='keym'&&!e.repeat)toggleSound();
  if(code==='escape'){if(mode==='demo'&&screen==='playing')menu('Demo 已退出。你可以开始人工游玩。');else if(screen==='playing')pause();else if(screen==='settings')menu();return;}
  if(code==='space'&&screen==='playing'){e.preventDefault();if(!e.repeat)toggleTablet();return;}
  if(code==='tab'&&screen==='playing'){e.preventDefault();if(!e.repeat){settings.zoom=!settings.zoom;$('zoom-setting').checked=settings.zoom;saveSettings();}return;}
  if(screen==='playing'&&mode==='human'&&['keyw','keya','keys','keyd','shiftleft','shiftright','arrowleft','arrowright'].includes(code)){e.preventDefault();keys.add(code);}
});window.addEventListener('keyup',e=>keys.delete(e.code.toLowerCase()));
function canLook(){return screen==='playing'&&game.phase==='playing'&&mode==='human';}
function applyLook(delta){if(!delta)return;yaw-=delta.x*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch-delta.y*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity));}
function cancelDrag(){const canvas=view?.renderer.domElement,id=mouseLook.pointerId;mouseLook.cancelDrag();if(id!==null&&canvas?.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
function installLook(canvas){
  canvas.addEventListener('pointerdown',e=>{
    if(!canLook()||document.pointerLockElement===canvas)return;
    if(mouseLook.beginDrag(e)){e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}}
  });
  canvas.addEventListener('pointermove',e=>{if(canLook()&&document.pointerLockElement!==canvas)applyLook(mouseLook.drag(e));});
  canvas.addEventListener('lostpointercapture',()=>mouseLook.cancelDrag());
  window.addEventListener('pointerup',cancelDrag);window.addEventListener('pointercancel',cancelDrag);
  canvas.addEventListener('pointerleave',e=>{if(!canvas.hasPointerCapture?.(e.pointerId))cancelDrag();});
  window.addEventListener('mousemove',e=>{if(canLook()&&document.pointerLockElement===canvas)applyLook(mouseLook.relative(e));});
}
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===view?.renderer.domElement;mouseLook.setLocked(locked);
  if(locked){hadPointerLock=true;return;}
  if(hadPointerLock&&screen==='playing'&&mode==='human')pause();hadPointerLock=false;
});
window.addEventListener('blur',()=>{keys.clear();cancelDrag();if(screen==='playing')pause('窗口失去焦点，游戏已自动暂停。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();if(screen==='playing')pause('页面已切换，游戏已自动暂停。');}});
try{view=new WorldView($('scene'));saveSettings();document.querySelectorAll('.total-shards').forEach(e=>e.textContent=SHARDS.length);installLook(view.renderer.domElement);menu();requestAnimationFrame(frame);}catch(error){screen='error';updateScreen();hide('error-panel',false);$('error-message').textContent=error.message;console.error(error);}
