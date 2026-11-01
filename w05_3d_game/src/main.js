import {createGame,tick} from './core.js';
import {SHARDS,RULES,START_YAW,IS_MAP_DRAFT,MAP_DRAFT_ERROR,MAP_DOCUMENT,isInSafeRoom,distance} from './world.js';
import {DemoController,DEMO_TIME_LIMIT} from './demo.js';
import {WorldView} from './view.js';
import {drawMap} from './map-view.js';
import {dangerGlowOpacity,hasMazeSight} from './visibility.js';
import {Sound} from './audio.js';
import {MouseLook,MouseResistance,MOUSE_RADIANS_PER_PIXEL} from './look-input.js';
import {DEFAULT_TUNING,TUNING_GROUPS,TUNING_FIELDS,MOVEMENT_KEYS,formatTuning} from './tuning.js';
const mouseLook=new MouseLook(),mouseResistance=new MouseResistance();
import {stableFrameDt,captureScareLook,scareLookPose,QuickTurn} from './presentation.js';
const quickTurn=new QuickTurn();
let tabletShown=true,scareLook=null,pendingInteract=false;
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
let game=createGame(settings),bot=new DemoController(),view,screen='notice',mode='human',yaw=START_YAW,pitch=0,keys=new Set(),hadPointerLock=false;
let renderDirty=true,sceneReady=false,loadingActive=true,noticeAcknowledged=false,loadingSequence=0,progressUnsubscribe=null,loadingReturn=null;
const loadingKeys=new Set(),loadingOverlay=$('asset-loading');
const startLabel=$('start-button').innerHTML,startControls=['start-button','demo-restart','restart-pause','restart-result'];
const exitLabel='出口';
if(IS_MAP_DRAFT){
  document.title=`永夜旅馆 · ${MAP_DOCUMENT.name} · 草稿试玩 · v2.10.0`;
  document.querySelector('.chapter').textContent='DRAFT PREVIEW · 草稿试玩';
  document.querySelector('.build-label').textContent='THE NIGHT HOTEL / v2.10.0 / 本地草稿';
  $('map-editor-return')?.removeAttribute('hidden');
  $('minimap').setAttribute('aria-label','随朝向旋转的地图，显示草稿的水晶与出口');
}
let lastFrame=performance.now(),sceneTime=0,uiTimer=0,toastUntil=0,resultDelay=0,demoClock=0,pickupUntil=0;
const time=v=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(Math.floor(v%60)).padStart(2,'0')}`,hide=(id,v)=>$(id).hidden=v;
function clearKeys(){keys.clear();pendingInteract=false;}
function announce(s,ms=2600){$('toast').textContent=s;toastUntil=performance.now()+ms;$('toast').classList.add('show');}
function releasePointer(){mouseResistance.reset();mouseLook.setLocked(false);hadPointerLock=false;if(document.pointerLockElement)document.exitPointerLock();}
function requestPointer(){mouseLook.setLocked(document.pointerLockElement===view.renderer.domElement);const fallback=()=>announce('按住鼠标左键转向，也可用 ← →',2200);try{view.renderer.domElement.requestPointerLock?.()?.catch(fallback);}catch{fallback();}}
function updateScreen(){
  renderDirty=true;
  hide('error-panel',screen!=='error');
  hide('content-notice',screen!=='notice');
  hide('menu',!['menu','settings','developer'].includes(screen));hide('hud',['menu','settings','developer','notice','error'].includes(screen));hide('pause-panel',!['paused','settings'].includes(screen));hide('developer-panel',screen!=='developer');hide('result',screen!=='result');hide('pause-button',!['playing','paused'].includes(screen));hide('demo-bar',mode!=='demo'||screen!=='playing');hide('respawn',game.phase!=='respawn'||screen!=='playing');
  document.body.dataset.screen=screen;document.body.dataset.phase=game.phase;
  for(const id of ['content-notice','menu','hud','pause-panel','developer-panel','result','error-panel','map-editor-return'])$(id).inert=loadingActive||$(id).hidden;
  $('menu').inert=loadingActive||['settings','developer'].includes(screen)||$('menu').hidden;$('hud').inert=loadingActive||screen!=='playing';
  const inSettings=screen==='settings';$('pause-title').textContent=inSettings?'夜班设置':'已暂停';$('resume-button').innerHTML=inSettings?'返回主菜单 <span>›</span>':'继续探索 <span>›</span>';hide('restart-pause',inSettings);hide('menu-pause',inSettings);
  sound.setPlaying(!loadingActive&&screen==='playing'&&game.phase==='playing'&&game.entryOpened&&!isInSafeRoom(game.player));sound.setPaused(loadingActive||screen!=='playing');
  if(loadingActive)return;
  if(screen==='notice')$('notice-continue').focus({preventScroll:true});
  if(screen==='paused'||screen==='settings')$('resume-button').focus();if(screen==='result')$('restart-result').focus();if(screen==='developer'){$('fov-setting').focus({preventScroll:true});$('developer-panel').querySelector('.modal-content').scrollTop=0;}
}
function start(nextMode='human'){
  if(loadingActive||!sceneReady||!noticeAcknowledged)return;
  quickTurn.cancel();
  rebuildCorridors();if(!sceneReady)return;mode=nextMode;game=createGame(settings);bot=new DemoController();yaw=START_YAW;pitch=0;clearKeys();mouseLook.cancelDrag();mouseResistance.reset();demoClock=0;resultDelay=0;screen='playing';tabletShown=true;scareLook=null;sound.unlock();sound.setPaused(false);sound.event('start');$('toast').classList.remove('show');updateScreen();updateHUD();if(mode==='human')requestPointer();else releasePointer();lastFrame=performance.now();
  if(mode==='human')announce('WASD 移动 · 靠近木板按 E 拆开，或按住 W + Shift 冲破。 Move with WASD. Press E near the boards, or hold W + Shift to break through.',7000);
}
function menu(message=(IS_MAP_DRAFT?`草稿试玩 · ${MAP_DOCUMENT.name} · `:'')+'电脑键盘与鼠标游玩 · 建议佩戴耳机'){
  quickTurn.cancel();
  screen='menu';clearKeys();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();game=createGame(settings);yaw=START_YAW;pitch=0;mode='human';$('menu-note').textContent=message;$('toast').classList.remove('show');$('danger-glow').style.opacity=0;$('pickup-glow').style.opacity=0;document.body.classList.remove('escape');updateScreen();
}
function pause(message='时间与巡夜人都已暂停。'){if(screen!=='playing')return;quickTurn.cancel();screen='paused';clearKeys();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();$('pause-note').textContent=message;updateScreen();}
function resume(){if(loadingActive||!sceneReady)return;if(screen==='settings'){menu();return;}if(screen!=='paused')return;screen='playing';sound.unlock();lastFrame=performance.now();updateScreen();if(mode==='human')requestPointer();}
function showResult(){
  quickTurn.cancel();
  screen='result';releasePointer();clearKeys();const won=game.phase==='won';$('result-label').textContent=mode==='demo'?'DEMO COMPLETE':won?'CHECKED OUT':'STILL CHECKED IN';$('result-title').textContent=won?'你离开了旅馆':'你被留在了这里';$('result-copy').textContent=won?(mode==='demo'?`自动演示已收集全部记忆碎片，并从${exitLabel}离开。`:`你带着遗落的记忆，从${exitLabel}离开了旅馆。`):'三次机会已经用尽。记住岔路，留意红光，再试一次。';$('result-count').textContent=`${game.collected.size} / ${SHARDS.length}`;$('result-time').textContent=time(game.elapsed);$('result-lives').textContent=game.lives;$('restart-result').innerHTML=(mode==='demo'?'我来试试':'再探索一次')+' <span>›</span>';resultDelay=mode==='demo'?7:0;$('demo-return').textContent=mode==='demo'?'7 秒后返回主菜单':'';$('toast').classList.remove('show');updateScreen();
}
function updateHUD(){
  const left=SHARDS.length-game.collected.size,unlocked=left===0,safe=isInSafeRoom(game.player);
  $('collected').textContent=String(left).padStart(3,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'◆':'◇').join(' ');$('lives').setAttribute('aria-label',`剩余 ${game.lives} 条命`);$('exit-state').textContent=!game.entryOpened?'SAFE · E 拆板 / W + Shift 冲破':safe?'SAFE · 接待处安全屋':unlocked?`前往${exitLabel}`:'收集记忆碎片';
  updateDangerGlow();$('countdown').textContent=Math.max(1,Math.ceil(game.respawn));$('respawn-lives').textContent=`剩余 ${game.lives} 次机会 · 收集进度已保留`;document.body.classList.toggle('escape',unlocked);
  const up=tabletShown&&game.phase==='playing';$('tablet').classList.toggle('stowed',!up);$('tablet').setAttribute('aria-hidden',String(!up));$('tablet-toggle').setAttribute('aria-expanded',String(up));const tabletLabel=`<kbd>Space</kbd> ${tabletShown?'收起地图':'展开地图'}`;if($('tablet-toggle').innerHTML!==tabletLabel)$('tablet-toggle').innerHTML=tabletLabel;
}
function updateDangerGlow(){
  $('danger-glow').style.opacity=screen==='playing'&&game.phase==='playing'&&game.entryOpened&&!isInSafeRoom(game.player)?dangerGlowOpacity(game.player,game.enemy,settings.corridorWidth):0;
}
function manualInput(dt){
  yaw+=quickTurn.step(dt);
  if(keys.has('arrowleft'))yaw+=dt*2.65;if(keys.has('arrowright'))yaw-=dt*2.65;
  const forward=(keys.has('keyw')?1:0)-(keys.has('keys')?1:0),side=(keys.has('keyd')?1:0)-(keys.has('keya')?1:0),shift=keys.has('shiftleft')||keys.has('shiftright');
  const interact=pendingInteract;pendingInteract=false;
  return{x:-Math.sin(yaw)*forward+Math.cos(yaw)*side,z:-Math.cos(yaw)*forward-Math.sin(yaw)*side,heading:yaw,run:settings.autorun?!shift:shift,interact};
}
function toggleSound(){sound.unlock();const muted=sound.toggle();$('mute-button').textContent=muted?'声音 关':'声音 开';$('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'取消静音':'静音');}
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function showLoadingProgress(progress={stage:'setup',ratio:0}){
  const stage=progress.stage??'setup',ratio=Math.max(0,Math.min(1,Number(progress.ratio)||0)),percent=Math.floor(ratio*100);
  const labels={setup:['整理旅馆空间…','ARRANGING THE HOTEL'],assets:['读取旅馆材质…','READING MATERIALS'],upload:['准备场景贴图…','PREPARING SURFACES'],warmup:['准备灯光与画面…','PREPARING THE LIGHTS'],ready:['夜班准备完成','YOUR SHIFT IS READY']};
  const [label,english]=labels[stage]??labels.setup;
  if($('loading-stage').textContent!==label)$('loading-stage').textContent=label;
  $('loading-stage-en').textContent=english;$('loading-percent').textContent=`${percent}%`;$('loading-fill').style.transform=`scaleX(${ratio})`;
  $('loading-progress').setAttribute('aria-valuenow',String(percent));$('loading-progress').setAttribute('aria-valuetext',`${label} ${percent}%`);
  $('loading-detail').textContent=stage==='assets'&&progress.total?`材质 ${progress.completed} / ${progress.total}`:stage==='upload'&&progress.total?`贴图 ${progress.completed} / ${progress.total}`:stage==='ready'?(noticeAcknowledged?'返回本次设置，准备继续。':'接下来请阅读内容提示。'):'正在为这次夜班准备场景。';
  loadingOverlay.dataset.stage=stage;
}
function beginLoading(){
  const sequence=++loadingSequence;progressUnsubscribe?.();progressUnsubscribe=null;
  loadingReturn={screen,focus:document.activeElement,scroll:$('developer-panel').querySelector('.modal-content').scrollTop};
  loadingActive=true;sceneReady=false;quickTurn.cancel();clearKeys();mouseLook.cancelDrag();releasePointer();
  loadingOverlay.hidden=false;loadingOverlay.classList.remove('is-complete');document.body.dataset.loading='true';
  for(const id of startControls)$(id).disabled=true;
  $('start-button').innerHTML='<span>布置夜班中…</span><small>PREPARING THE HOTEL</small><b>…</b>';
  showLoadingProgress();updateScreen();loadingOverlay.focus({preventScroll:true});return sequence;
}
function loadingError(error,sequence){
  if(sequence!==loadingSequence)return;loadingSequence++;progressUnsubscribe?.();progressUnsubscribe=null;
  loadingActive=false;sceneReady=false;loadingOverlay.hidden=true;document.body.dataset.loading='false';
  screen='error';updateScreen();$('error-message').textContent=error?.message||'场景未能载入，请刷新重试。';$('reload-page').focus({preventScroll:true});console.error(error);
}
function watchViewReady(sequence){
  const pending=view;let unsubscribe=()=>{};
  const release=()=>{unsubscribe();unsubscribe=()=>{};if(progressUnsubscribe===release)progressUnsubscribe=null;};
  unsubscribe=pending.onLoadingProgress?.(progress=>{if(view===pending&&sequence===loadingSequence)showLoadingProgress(progress);})??(()=>{});progressUnsubscribe=release;
  pending.ready.then(async()=>{
    release();if(view!==pending||sequence!==loadingSequence)return;
    showLoadingProgress({stage:'ready',ratio:1});await nextPaint();if(view!==pending||sequence!==loadingSequence)return;
    loadingOverlay.classList.add('is-complete');await new Promise(resolve=>setTimeout(resolve,reduced?0:200));if(view!==pending||sequence!==loadingSequence)return;
    loadingActive=false;sceneReady=true;renderDirty=true;loadingOverlay.hidden=true;document.body.dataset.loading='false';
    for(const id of startControls)$(id).disabled=false;$('start-button').innerHTML=startLabel;lastFrame=performance.now();updateScreen();
    if(screen==='menu')$('start-button').focus({preventScroll:true});
    else if(screen!=='notice'&&loadingReturn?.screen===screen){loadingReturn.focus?.focus?.({preventScroll:true});if(screen==='developer')$('developer-panel').querySelector('.modal-content').scrollTop=loadingReturn.scroll;}
  }).catch(error=>{release();if(view===pending)loadingError(error,sequence);});
}
async function buildView(sequence){
  await nextPaint();if(sequence!==loadingSequence)return;
  try{
    if(MAP_DRAFT_ERROR)throw new Error(MAP_DRAFT_ERROR);
    view?.dispose();view=new WorldView($('scene'),settings);watchViewReady(sequence);installLook(view.renderer.domElement);applySettings();
  }catch(error){loadingError(error,sequence);}
}
function rebuildCorridors(){
  if(view?.corridorWidth===settings.corridorWidth&&view?.ceilingHeight===settings.ceilingHeight)return;
  buildView(beginLoading());
}
document.addEventListener('keydown',event=>{
  if(event.code==='F5'||((event.ctrlKey||event.metaKey)&&event.code==='KeyR'))return;
  if(!loadingActive&&!event.repeat)loadingKeys.delete(event.code);
  if(loadingActive)loadingKeys.add(event.code);
  if(loadingActive||loadingKeys.has(event.code)){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('keyup',event=>loadingKeys.delete(event.code),true);
document.addEventListener('click',event=>{
  if(loadingActive&&!loadingOverlay.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}
},true);
function applySettings(){
  renderDirty=true;
  $('zoom-setting').checked=settings.zoom;
  sound.setMusicVolume(settings.music);$('music-setting').value=settings.music;$('music-value').textContent=`${Math.round(settings.music*100)}%`;
  if(view){view.horizontalFov=settings.fov;view.renderer.toneMappingExposure=.96*settings.brightness;view.motionTuning={...settings};view.motionEnabled=settings.motion;view.eyeHeight=settings.eyeHeight;}
  for(const field of TUNING_FIELDS){$(field.key+'-setting').value=settings[field.key];$(field.key+'-value').textContent=formatTuning(field,settings[field.key]);}
  for(const key of MOVEMENT_KEYS)game.tuning[key]=settings[key];
}
function audioOccluded(){return !hasMazeSight(game.player,game.enemy,settings.corridorWidth);}
function frame(now){
  requestAnimationFrame(frame);const dt=stableFrameDt((now-lastFrame)/1000);lastFrame=now;if(document.hidden||loadingActive||!sceneReady||!view)return;if(screen!=='playing'&&!renderDirty&&!(screen==='result'&&mode==='demo'))return;if(!['paused','settings','developer'].includes(screen))sceneTime+=dt;
  if(screen==='playing'){
    const input=game.phase==='playing'?(mode==='demo'?bot.input(game,dt):manualInput(dt)):{x:0,z:0};
    if(mode==='demo'&&game.phase==='playing'){yaw=bot.yaw;pitch=0;}
    const events=tick(game,input,dt);for(const event of events){sound.event(event,game.collected.size);if(event==='collect')pickupUntil=now+130;if(event==='unlock'){announce(`记忆已集齐。前往${exitLabel}，离开旅馆。`,4000);}if(event==='hit'){quickTurn.cancel();scareLook=captureScareLook(game.player,game.enemy,yaw,pitch);clearKeys();mouseLook.cancelDrag();mouseResistance.reset();updateScreen();}if(event==='relocate'){yaw=START_YAW;pitch=0;scareLook=null;updateScreen();}if(event==='respawn')updateScreen();if(event==='won'||event==='lost')showResult();}
    if(events.includes('boards-break'))announce('木板已经破开。找回记忆，留意巡夜人。 The way is open. Collect the memories and watch for the attendant.',3500);
    sound.setPlaying(screen==='playing'&&game.phase==='playing'&&game.entryOpened&&!isInSafeRoom(game.player));
    if(mode==='demo'){demoClock+=dt;if(demoClock>DEMO_TIME_LIMIT&&screen==='playing')menu('演示超时，未完成通关。可重播或人工游玩。');}
  }else if(screen==='result'&&mode==='demo'){resultDelay-=dt;$('demo-return').textContent=`${Math.max(0,Math.ceil(resultDelay))} 秒后返回主菜单`;if(resultDelay<=0)menu(game.phase==='won'?'Demo 已成功通关。现在轮到你了。':'Demo 未成功通关，可重播或人工游玩。');}
  if(now>toastUntil)$('toast').classList.remove('show');$('pickup-glow').style.opacity=now<pickupUntil&&screen==='playing'?.75:0;
  uiTimer+=dt;if(uiTimer>=.07){updateHUD();uiTimer=0;}
  if(screen==='playing')updateDangerGlow();
  if(game.phase==='caught'&&scareLook){const pose=scareLookPose(scareLook,RULES.caughtSeconds-game.caught);yaw=pose.yaw;pitch=pose.pitch;}
  if(screen==='playing'||renderDirty){view.render(game,yaw,pitch,sceneTime,dt,screen==='playing',mode==='demo'?.65:1);renderDirty=false;}
  if(screen==='playing'&&game.phase==='playing'){
    const d=distance(game.player,game.enemy),dx=game.enemy.x-game.player.x,dz=game.enemy.z-game.player.z,pan=Math.max(-1,Math.min(1,(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d)));
    const safe=!game.entryOpened||isInSafeRoom(game.player);
    sound.update(dt,Math.hypot(game.playerVelocity.x,game.playerVelocity.z),safe?Infinity:d,safe?0:pan,safe||audioOccluded(),game.collected.size===SHARDS.length,safe?0:Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z),view.playerMotion.steps);
  }
  if(tabletShown&&screen==='playing'&&game.phase==='playing')drawMap($('minimap'),game,yaw,settings.zoom,settings.localMapScale);
  const caughtTime=RULES.caughtSeconds-game.caught;
  $('death-shade').style.opacity=screen==='playing'?(game.phase==='caught'?Math.max(0,Math.min(1,(caughtTime-.72)/.25)):game.phase==='respawn'?Math.min(1,game.respawn/.3):0):0;
  $('respawn').style.opacity=Math.min(1,game.respawn/.3);

}
function toggleTablet(){if(screen!=='playing'||game.phase!=='playing')return;tabletShown=!tabletShown;sound.event('tablet');updateHUD();}
$('tablet-toggle').onclick=toggleTablet;
$('notice-continue').onclick=()=>{if(loadingActive||!sceneReady||screen!=='notice')return;noticeAcknowledged=true;menu();$('start-button').focus({preventScroll:true});};
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
  if(code==='keye'&&screen==='playing'&&mode==='human'){e.preventDefault();if(!e.repeat)pendingInteract=true;return;}
  if(screen==='playing'&&mode==='human'&&['keyw','keya','keys','keyd','shiftleft','shiftright','arrowleft','arrowright'].includes(code)){e.preventDefault();keys.add(code);}
});window.addEventListener('keyup',e=>keys.delete(e.code.toLowerCase()));
function canLook(){return !loadingActive&&sceneReady&&screen==='playing'&&game.phase==='playing'&&mode==='human';}
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
window.addEventListener('blur',()=>{clearKeys();cancelDrag();if(screen==='playing')pause('窗口失去焦点，游戏已自动暂停。');});
document.addEventListener('visibilitychange',()=>{renderDirty=true;if(document.hidden){cancelDrag();if(screen==='playing')pause('页面已切换，游戏已自动暂停。');}});
$('reload-page').onclick=()=>location.reload();
document.querySelectorAll('.total-shards').forEach(e=>e.textContent=SHARDS.length);
buildView(beginLoading());requestAnimationFrame(frame);
