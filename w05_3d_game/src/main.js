import {MonitorLift} from './monitor-lift.js';
import {MonitorExitGuard} from './monitor-exit.js';
import {closeBlackoutMonitor} from './blackout-state.js';
import {POWER_SECTORS,restoredCount} from './power-grid.js';
import {NightUI} from './night-ui.js';
import {configureNight,canContinue,threatMultiplier} from './night-session.js';
import {ScareCueGate} from './scare-timing.js';
import {GameFullscreen} from './fullscreen.js';
const scareCues=new ScareCueGate(),gameFullscreen=new GameFullscreen();
import {createGame,tick,getBlackoutInteraction,blackoutSight} from './core.js';
import {BLACKOUT_RULES,BLACKOUT_LAYOUT} from './blackout-layout.js';
import {BlackoutUI} from './blackout-ui.js';
import {BlackoutIntro} from './blackout-intro.js';
import {openingWalk} from './opening-scene.js';
import {TutorialCall} from './tutorial-call.js';
import {DoorInput} from './door-input.js';
import {SHARDS,RULES,START_YAW,IS_MAP_DRAFT,IS_HOTEL_DRAFT,HOTEL_DOCUMENT,MAP_DRAFT_ERROR,MAP_DOCUMENT,isInSafeRoom,distance} from './world.js';
import {DemoController,DEMO_TIME_LIMIT} from './demo.js';
import {WorldView} from './view.js';
import {drawMap} from './map-view.js';
import {dangerGlowOpacity} from './visibility.js';
import {Sound} from './audio.js';
import {HeartbeatHUD} from './heartbeat-hud.js';
import {MouseLook,MouseResistance,MOUSE_RADIANS_PER_PIXEL} from './look-input.js';
import {DEFAULT_TUNING,TUNING_GROUPS,TUNING_FIELDS,MOVEMENT_KEYS,formatTuning} from './tuning.js';
const mouseLook=new MouseLook(),mouseResistance=new MouseResistance();
import {stableFrameDt,captureScareLook,scareLookPose,QuickTurn} from './presentation.js';
const quickTurn=new QuickTurn();
let scareLook=null,pendingInteract=false,pendingActions=[],doorPointerId=null;
let bedLook=null;
const doorInput=new DoorInput();
const $=id=>document.getElementById(id),sound=new Sound(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Defaults change only through source edits; all UI adjustments are page-local.
const DEFAULT_SETTINGS=Object.freeze({...DEFAULT_TUNING,corridorWidth:BLACKOUT_RULES.corridorWidth,motion:!reduced,autorun:false,zoom:true,music:.325,master:1,effects:1,resolution:1,crt:true,friendlyMode:true,enemyXray:false,skipOpening:false});
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
const makeGame=(nextMode='human')=>createGame(settings,nextMode==='demo'||IS_MAP_DRAFT?{}:{mode:'blackout'});
let game=makeGame(),bot=new DemoController(),view,screen='notice',mode='human',yaw=START_YAW,pitch=0,keys=new Set(),hadPointerLock=false;
const monitorExitGuard=new MonitorExitGuard();
const monitorLift=new MonitorLift($('monitor-lift'),$('tablet'));
const heartbeatHUD=new HeartbeatHUD($('heartbeat-hud'));
const blackoutUI=new BlackoutUI({onAction(action){
  if(screen!=='playing'||game.phase!=='playing'||!game.blackout||intro.active||tutorialCall.busy)return;
  if(action.type==='monitor-channel'){renderDirty=true;return;}
  const command={'monitor-close':'monitor','phone-monitor':'monitor','phone-flashlight':'flashlight'}[action.type];
  if(command)pendingActions.push(command);
}});
const tutorialCall=new TutorialCall({sound,onRing:()=>sound.event('call-ring'),
  onIncoming(){game.blackout.phoneOpen=true;clearKeys();releasePointer();updateHUD();},
  onOpen(){sound.unlock();sound.event('call-connect');game.blackout.phoneOpen=true;clearKeys();quickTurn.cancel();releasePointer();updateHUD();},
  onClose(){sound.event('call-end');if(game.blackout)game.blackout.phoneOpen=false;clearKeys();updateHUD();if(screen==='playing'&&game.phase==='playing')requestPointer();},
});
const intro=new BlackoutIntro({onEvent:event=>{if(event==='lens-strike')scareCues.opening=true;else sound.event(event);},onComplete:current=>{if(current===game&&screen==='playing')tutorialCall.startIncoming();}});
let renderDirty=true,sceneReady=false,loadingActive=true,noticeAcknowledged=false,loadingSequence=0,progressUnsubscribe=null,loadingReturn=null;
const loadingKeys=new Set(),loadingOverlay=$('asset-loading');
const startLabel=$('start-button').innerHTML,startControls=['start-button','demo-restart','restart-pause','restart-result'];
const noticeConfirmations=[...document.querySelectorAll('[data-notice-confirm]')];
function updateNoticeConfirmation(){
  const remaining=noticeConfirmations.filter(input=>!input.checked).length;
  $('notice-continue').disabled=loadingActive||!sceneReady||remaining>0;
  $('notice-confirm-status').textContent=remaining?`还需确认 ${remaining} 项 / ${remaining} remaining`:'已完成确认 / Ready to continue';
}
for(const input of noticeConfirmations){input.checked=false;input.addEventListener('change',updateNoticeConfirmation);}
window.addEventListener('pageshow',()=>{if(!noticeAcknowledged){for(const input of noticeConfirmations)input.checked=false;updateNoticeConfirmation();}});
let sessionStarted=false,activeCustom=null,shellReturn='menu';
const nightUI=new NightUI({
  navigate:openShell,back:closeShell,start:preset=>start('human',preset??null),
  changeSetting:(key,value)=>{settings[key]=value;applySettings();},
  resetSettings:()=>{for(const key of ['music','master','effects','resolution','crt','brightness','fov','sensitivity','motion','autorun','friendlyMode','skipOpening'])settings[key]=DEFAULT_SETTINGS[key];applySettings();if(sound.muted)toggleSound();},
  fullscreen:()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else void gameFullscreen.ensure();},
  portrait:angle=>{if(view?.menuView)view.menuView.showcaseAngle=angle;renderDirty=true;}
});
function openShell(next){shellReturn=screen==='paused'?'paused':'menu';screen=next;clearKeys();releasePointer();updateScreen();}
function closeShell(){screen=shellReturn;updateScreen();if(screen==='menu')$('start-button').focus();}
function continueNight(){if(!canContinue(game,sessionStarted)||loadingActive)return;screen='playing';sound.unlock();lastFrame=performance.now();updateScreen();if(!phoneBusy())requestPointer();}
const exitLabel='出口';
if(IS_HOTEL_DRAFT){
  document.title=`永夜旅馆 · ${HOTEL_DOCUMENT.name} · 酒店布局试玩`;
  const back=$('map-editor-return');back.removeAttribute('hidden');back.href='./hotel-editor.html';
}
if(IS_MAP_DRAFT){
  document.title=`永夜旅馆 · ${MAP_DOCUMENT.name} · 草稿试玩 · v2.13.0`;
  $('map-editor-return')?.removeAttribute('hidden');
  $('map-editor-return').href='./editor.html';
  $('minimap').setAttribute('aria-label','随朝向旋转的地图，显示草稿的水晶与出口');
  document.querySelector('.intro-copy').textContent='地图草稿巡检：检查通道、碰撞与收集路线。机关小样请从普通游戏入口进入。';
  document.querySelector('.rules-summary').textContent='WASD 移动 · E 拆开木板 · 收集碎片后返回出口。';
}
let lastFrame=performance.now(),sceneTime=0,uiTimer=0,toastUntil=0,resultDelay=0,demoClock=0,pickupUntil=0;
const time=v=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(Math.floor(v%60)).padStart(2,'0')}`,hide=(id,v)=>$(id).hidden=v;
function clearKeys(){keys.clear();pendingInteract=false;pendingActions=[];doorInput.clear();doorPointerId=null;}
function doorGesture(action){if(action)pendingActions.push(action);}
function phoneBusy(){const b=game.blackout;return intro.active||tutorialCall.busy||Boolean(b&&(b.phoneOpen||b.monitor||b.monitorConnecting>0));}
function closeDeviceView(){
  if(!game.blackout)return;
  closeBlackoutMonitor(game);game.blackout.phoneOpen=false;monitorExitGuard.mark(performance.now());clearKeys();quickTurn.cancel();cancelDrag();releasePointer();updateHUD();renderDirty=true;requestPointer();
}
function protectedRoom(){return game.blackout?isInSafeRoom(game.player)&&game.blackout.doorProgress>=.999&&!isInSafeRoom(game.enemy):!game.entryOpened||isInSafeRoom(game.player);}
function announce(s,ms=2600){$('toast').textContent=s;toastUntil=performance.now()+ms;$('toast').classList.add('show');}
function releasePointer(){mouseResistance.reset();mouseLook.setLocked(false);hadPointerLock=false;if(document.pointerLockElement)document.exitPointerLock();}
function requestPointer(){
  if(!view||screen!=='playing'||mode!=='human'||game.phase!=='playing'||phoneBusy())return;
  // Moving a locked canvas between DOM parents makes browsers release pointer lock.
  // Restore the game canvas before asking for lock, including monitor-close and resume.
  view.setSecurityMonitor(false,blackoutUI.channel,$('monitor-feed'));
  const canvas=view.renderer.domElement;mouseLook.setLocked(document.pointerLockElement===canvas);
  if(document.pointerLockElement===canvas)return;
  const fallback=()=>{if(canLook())announce('点击画面恢复鼠标控制；也可按住左键转向。',3500);};
  try{canvas.requestPointerLock?.()?.catch(fallback);}catch{fallback();}
}
function updateOpeningUI(){
  const shot=intro.active?game.blackout?.introShot:'';document.body.dataset.opening=shot??'';
  $('opening-monitor').hidden=true;
  $('opening-monitor').style.setProperty('--interference',shot==='monitor'?openingWalk(game.blackout.introTime??0).interference:0);
  $('opening-cut').hidden=!['outage','crank'].includes(shot)||screen!=='playing';
  if(shot==='monitor'){$('opening-camera-title').textContent=view?.openingScene?.label??'接待大厅';$('opening-time').textContent=`00:00:${String(Math.floor(game.blackout.introTime??0)).padStart(2,'0')}`;}
}
function updateScreen(){
  renderDirty=true;updateOpeningUI();monitorLift.update(game,screen==='playing',reduced);
  nightUI.show(screen,{continuable:canContinue(game,sessionStarted),settings,custom:activeCustom});
  nightUI.update(game,{active:screen==='playing',intro:intro.active,callBusy:tutorialCall.busy,custom:activeCustom});
  hide('error-panel',screen!=='error');
  hide('content-notice',screen!=='notice');
  hide('menu',!['menu','settings','developer'].includes(screen));hide('hud',['paused','menu','settings','developer','nights','tools','options','notice','error','result'].includes(screen));hide('pause-panel',!['paused','settings'].includes(screen));hide('developer-panel',screen!=='developer');hide('result',screen!=='result');hide('pause-button',!['playing','paused'].includes(screen));hide('demo-bar',mode!=='demo'||screen!=='playing');hide('respawn',game.phase!=='respawn'||screen!=='playing');
  document.body.dataset.screen=screen;document.body.dataset.phase=game.phase;
  for(const id of ['content-notice','menu','hud','pause-panel','developer-panel','result','error-panel','map-editor-return'])$(id).inert=loadingActive||$(id).hidden;
  $('menu').inert=loadingActive||['settings','developer'].includes(screen)||$('menu').hidden;$('hud').inert=loadingActive||screen!=='playing';
  const inSettings=screen==='settings';$('pause-title').textContent=inSettings?'SETTINGS':'PAUSED';$('resume-button').innerHTML=inSettings?'<span>BACK</span><small>返回</small>':'<span>RESUME</span><small>继续夜班</small>';hide('skip-opening',inSettings||!intro.active);hide('restart-pause',inSettings);hide('menu-pause',inSettings);
  sound.setPlaying(!loadingActive&&screen==='playing'&&game.phase==='playing'&&(game.blackout||game.entryOpened)&&(!protectedRoom()||game.blackout?.enemyMode==='chase'));sound.setPaused(loadingActive||screen!=='playing');
  blackoutUI.update(game,{interaction:getBlackoutInteraction(game,yaw),active:!loadingActive&&screen==='playing'&&game.phase==='playing',heading:yaw});
  tutorialCall.setActive(!loadingActive&&screen==='playing'&&game.phase==='playing');
  view?.setSecurityMonitor(!loadingActive&&screen==='playing'&&game.phase==='playing'&&Boolean(game.blackout?.monitor),blackoutUI.channel,$('monitor-feed'));
  updateNoticeConfirmation();
  if(loadingActive)return;
  if(screen==='notice')$('notice-title').focus({preventScroll:true});
  if(screen==='paused'||screen==='settings')$('resume-button').focus();if(screen==='result')$('restart-result').focus();if(screen==='developer'){$('fov-setting').focus({preventScroll:true});$('developer-panel').querySelector('.modal-content').scrollTop=0;}
}
function start(nextMode='human',preset=null){
  if(loadingActive||!sceneReady||!noticeAcknowledged)return;
  if(nextMode==='human')void gameFullscreen.ensure();
  scareCues.reset();quickTurn.cancel();
  rebuildCorridors();if(!sceneReady)return;mode=nextMode;game=makeGame(nextMode);activeCustom=preset;configureNight(game,preset);sessionStarted=nextMode==='human';bot=new DemoController();yaw=START_YAW;pitch=0;clearKeys();mouseLook.cancelDrag();mouseResistance.reset();demoClock=0;resultDelay=0;screen='playing';scareLook=null;sound.unlock();sound.setPaused(false);sound.event('start');$('toast').classList.remove('show');updateScreen();updateHUD();if(mode==='human'&&!game.blackout)requestPointer();else releasePointer();lastFrame=performance.now();
  sound.opening?.stop();intro.stop();tutorialCall.stop();
  if(mode==='human'&&game.blackout){if(settings.skipOpening)tutorialCall.startIncoming();else intro.start(game);updateOpeningUI();updateHUD();}
  else if(mode==='human')announce('地图草稿巡检：WASD 移动，E 拆开木板。草稿沿用收集规则。',5000);
}
function menu(message=(IS_MAP_DRAFT?`草稿试玩 · ${MAP_DOCUMENT.name} · `:'')+'电脑键盘与鼠标游玩 · 建议佩戴耳机'){
  if(canContinue(game,sessionStarted)&&mode==='human'){screen='menu';clearKeys();quickTurn.cancel();releasePointer();updateScreen();updateHUD();return;}
  sessionStarted=false;
  scareCues.reset();sound.opening?.stop();intro.stop();tutorialCall.stop();
  quickTurn.cancel();
  screen='menu';clearKeys();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();game=makeGame();yaw=START_YAW;pitch=0;mode='human';$('menu-note').textContent=message;$('toast').classList.remove('show');$('danger-glow').style.opacity=0;$('pickup-glow').style.opacity=0;document.body.classList.remove('escape');updateScreen();
}
function pause(message='时间与最后的住客都已暂停。'){if(screen!=='playing')return;quickTurn.cancel();screen='paused';clearKeys();mouseLook.cancelDrag();mouseResistance.reset();releasePointer();$('pause-note').textContent=message;updateScreen();}
function resume(){if(loadingActive||!sceneReady)return;if(screen==='settings'){menu();return;}if(screen!=='paused')return;screen='playing';sound.unlock();lastFrame=performance.now();updateScreen();if(mode==='human'&&!phoneBusy())requestPointer();}
function showResult(){
  sessionStarted=false;quickTurn.cancel();
  screen='result';releasePointer();clearKeys();const won=game.phase==='won';$('result-label').textContent=mode==='demo'?'DEMO COMPLETE':won?'SHIFT COMPLETE':'SIGNAL LOST';$('result-title').textContent=won?(game.blackout?'SHIFT COMPLETE':'你离开了旅馆'):'GAME OVER';$('result-copy').textContent=game.blackout?(won?'酒店供电已恢复。机械门已经关闭，最后的住客被留在门外。':'机会已经用尽。留意脚步，用房间电话引开最后的住客，再找机会维修。'):won?`你带着遗落的记忆，从${exitLabel}离开了旅馆。`:'机会已经用尽。记住岔路，留意红光，再试一次。';$('result-count').textContent=game.blackout?(game.blackout.powerOn?'已恢复':'未恢复'):`${game.collected.size} / ${SHARDS.length}`;$('result-time').textContent=time(game.elapsed);$('result-lives').textContent=game.lives;$('restart-result').innerHTML=(mode==='demo'?'我来试试':'RETRY / 再试一次')+' <span>›</span>';resultDelay=mode==='demo'?7:0;$('demo-return').textContent=mode==='demo'?'7 秒后返回主菜单':'';$('toast').classList.remove('show');updateScreen();
}
function updateHUD(){
  nightUI.update(game,{active:screen==='playing',intro:intro.active,callBusy:tutorialCall.busy,custom:activeCustom});
  const left=SHARDS.length-game.collected.size,unlocked=left===0,safe=isInSafeRoom(game.player);
  $('collected').textContent=String(left).padStart(3,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'◆':'◇').join(' ');$('lives').setAttribute('aria-label',`剩余 ${game.lives} 条命`);$('exit-state').textContent=!game.entryOpened?'SAFE · E 拆板 / W + Shift 冲破':safe?'SAFE · 接待处安全屋':unlocked?`前往${exitLabel}`:'收集记忆碎片';
  updateDangerGlow();$('countdown').textContent=Math.max(1,Math.ceil(game.respawn));$('respawn-lives').textContent=`剩余 ${game.lives} 次机会 · 收集进度已保留`;document.body.classList.toggle('escape',unlocked);
  const up=game.phase==='playing';$('tablet').hidden=!up;$('tablet').setAttribute('aria-hidden',String(!up));
  blackoutUI.update(game,{interaction:getBlackoutInteraction(game,yaw),active:screen==='playing'&&game.phase==='playing'&&!loadingActive,heading:yaw});
  document.querySelector('.count-label').textContent=game.blackout?'酒店地图':'剩余碎片';
  document.querySelector('.result-stats>div>span').textContent=game.blackout?'酒店供电':'回收碎片';
  $('respawn').querySelector('h2').textContent=game.blackout?'回到监控室，继续维修。':'回到接待处，继续探索。';
  if(game.blackout){$('respawn-lives').textContent=`剩余 ${game.lives} 次机会 · 维修进度保留`;document.body.classList.toggle('escape',game.blackout.powerOn);}
}
function updateDangerGlow(){
  $('danger-glow').style.opacity=screen==='playing'&&game.phase==='playing'&&(game.blackout||game.entryOpened)&&!protectedRoom()&&blackoutSight(game,game.player,game.enemy)?dangerGlowOpacity(game.player,game.enemy,settings.corridorWidth):0;
}
function manualInput(dt){
  if(intro.active||tutorialCall.busy){clearKeys();return{x:0,z:0,heading:yaw,run:false,interact:false};}
  if(phoneBusy()||game.blackout?.bedTransition)return{x:0,z:0,heading:yaw,run:false,interact:false,action:pendingActions.shift()};
  yaw+=quickTurn.step(dt);
  if(keys.has('arrowleft'))yaw+=dt*2.65;if(keys.has('arrowright'))yaw-=dt*2.65;
  const forward=(keys.has('keyw')?1:0)-(keys.has('keys')?1:0),side=(keys.has('keyd')?1:0)-(keys.has('keya')?1:0),shift=keys.has('shiftleft')||keys.has('shiftright');
  const interact=game.blackout?(keys.has('keye')||doorInput.held):pendingInteract;pendingInteract=false;
  const action=pendingActions.shift();
  return{x:-Math.sin(yaw)*forward+Math.cos(yaw)*side,z:-Math.cos(yaw)*forward-Math.sin(yaw)*side,heading:yaw,run:settings.autorun?!shift:shift,interact,action};
}
function updateBedLook(){
  const b=game.blackout,t=b?.bedTransition;
  if(!t||game.phase!=='playing'){
    if(bedLook?.game===game&&bedLook.entering&&game.phase==='playing'&&b?.bedHide?.id===bedLook.bedId){yaw=bedLook.targetYaw;pitch=0;}
    bedLook=null;return;
  }
  if(bedLook?.id!==t.id||bedLook.game!==game){
    quickTurn.cancel();mouseLook.cancelDrag();mouseResistance.reset();
    const hiding=b.bedHide,target=BLACKOUT_LAYOUT.rooms.find(room=>room.id===hiding?.roomId)?.door??hiding?.exitPoint;
    const dx=(target?.x??game.player.x)-(hiding?.target.x??game.player.x),dz=(target?.z??game.player.z)-(hiding?.target.z??game.player.z);
    const desired=Math.hypot(dx,dz)>.001?Math.atan2(-dx,-dz):yaw,delta=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
    bedLook={game,id:t.id,bedId:hiding?.id,entering:t.entering,fromYaw:yaw,fromPitch:pitch,delta,targetYaw:yaw+delta};
  }
  if(!bedLook.entering)return;
  const p=Math.max(0,Math.min(1,t.progress)),ease=p*p*p*(p*(p*6-15)+10);yaw=bedLook.fromYaw+bedLook.delta*ease;pitch=bedLook.fromPitch*(1-ease);
}
function toggleSound(){sound.unlock();const muted=sound.toggle();$('mute-button').textContent=muted?'OFF / 静音':'ON / 开启';$('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'取消静音':'静音');}
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
  $('notice-friendly-setting').checked=settings.friendlyMode;
  $('enemyXray-setting').checked=settings.enemyXray;
  sound.setMixVolumes(settings.master,settings.effects);nightUI.syncSettings(settings);document.body.classList.toggle('crt-disabled',!settings.crt);
  sound.setMusicVolume(settings.music);
  if(view){if(view.resolutionScale!==settings.resolution){view.resolutionScale=settings.resolution;if(!view.security?.active)view.resizePlayerView();}view.horizontalFov=settings.fov;view.renderer.toneMappingExposure=.96*settings.brightness;view.motionTuning={...settings};view.motionEnabled=settings.motion;view.eyeHeight=settings.eyeHeight;}
  for(const field of TUNING_FIELDS){$(field.key+'-setting').value=settings[field.key];$(field.key+'-value').textContent=formatTuning(field,settings[field.key]);}
  for(const key of MOVEMENT_KEYS)game.tuning[key]=settings[key];
  if(activeCustom){game.tuning.enemySpeed*=threatMultiplier(activeCustom);game.tuning.escapeEnemySpeed*=threatMultiplier(activeCustom);}

}
function audioOccluded(){return !blackoutSight(game,game.player,game.enemy);}
function frame(now){
  requestAnimationFrame(frame);const dt=stableFrameDt((now-lastFrame)/1000);lastFrame=now;if(document.hidden||loadingActive||!sceneReady||!view)return;if(screen!=='playing'&&!renderDirty&&!(screen==='result'&&mode==='demo'))return;if(!['paused','settings','developer'].includes(screen))sceneTime+=dt;
  if(screen==='playing'){
    updateBedLook();
    const input=game.phase==='playing'?(mode==='demo'?bot.input(game,dt):manualInput(dt)):{x:0,z:0};
    if(mode==='demo'&&game.phase==='playing'){yaw=bot.yaw;pitch=0;}
    const wasMonitoring=Boolean(game.blackout?.monitor),wasPhoneBusy=phoneBusy();
    const events=intro.active?[]:tick(game,input,dt);for(const event of events){if(event!=='sector-on'||!events.includes('power-on'))sound.event(event,game.collected.size);if(event==='collect')pickupUntil=now+130;if(event==='unlock'&&!game.blackout){announce(`记忆已集齐。前往${exitLabel}，离开旅馆。`,4000);}if(event==='hit'){quickTurn.cancel();scareLook=captureScareLook(game.player,game.enemy,yaw,pitch);if(view.camera.position.y<settings.eyeHeight-.2)scareLook.targetPitch=Math.atan2(1.64-view.camera.position.y,Math.max(.1,distance(game.player,game.enemy)*2.4));clearKeys();mouseLook.cancelDrag();mouseResistance.reset();updateScreen();}if(event==='relocate'){yaw=START_YAW;pitch=0;scareLook=null;updateScreen();}if(event==='respawn')updateScreen();if(event==='won'||event==='lost')showResult();}
    updateBedLook();
    if(wasMonitoring!==Boolean(game.blackout?.monitor)||wasPhoneBusy!==phoneBusy()){clearKeys();quickTurn.cancel();mouseLook.cancelDrag();updateHUD();if(phoneBusy())releasePointer();else requestPointer();}
    if(tutorialCall.busy&&game.phase!=='playing')tutorialCall.stop();
    intro.update(dt);updateOpeningUI();tutorialCall.update(dt);
    if(events.includes('sector-on')&&!events.includes('power-on'))announce(`${POWER_SECTORS.find(p=>p.id===game.blackout.lastRestored)?.label}已通电（${restoredCount(game.blackout)}/${POWER_SECTORS.length}）。亮区会暴露你，继续维修其他区域。`,5000);
    if(events.includes('power-on'))announce('酒店供电已恢复。最后的住客现在能在灯下看见你：返回监控室，确认它留在门外，再关门。',6500);
    if(events.includes('door-blocked'))announce('门口有阻挡，请离开门轨再关门。',2200);
    if(events.includes('battery-empty'))announce('夜视电池已耗尽。F 可打开手电，留意沿路备用电池。',3500);
    if(events.includes('battery'))announce('已拾取备用电池。',2000);
    if(events.includes('boards-break'))announce('木板已经破开。找回记忆，留意最后的住客。 The way is open. Collect the memories and watch for The Last Guest.',3500);
    sound.setPlaying(screen==='playing'&&game.phase==='playing'&&(game.blackout||game.entryOpened)&&(!protectedRoom()||game.blackout?.enemyMode==='chase'));
    if(mode==='demo'){demoClock+=dt;if(demoClock>DEMO_TIME_LIMIT&&screen==='playing')menu('演示超时，未完成通关。可重播或人工游玩。');}
  }else if(screen==='result'&&mode==='demo'){resultDelay-=dt;$('demo-return').textContent=`${Math.max(0,Math.ceil(resultDelay))} 秒后返回主菜单`;if(resultDelay<=0)menu(game.phase==='won'?'Demo 已成功通关。现在轮到你了。':'Demo 未成功通关，可重播或人工游玩。');}
  if(now>toastUntil)$('toast').classList.remove('show');$('pickup-glow').style.opacity=now<pickupUntil&&screen==='playing'?.75:0;
  uiTimer+=dt;if(uiTimer>=.07){updateHUD();uiTimer=0;}
  if(screen==='playing')updateDangerGlow();
  if(game.phase==='caught'&&scareLook){const pose=scareLookPose(scareLook,RULES.caughtSeconds-game.caught);yaw=pose.yaw;pitch=pose.pitch;}
  if(screen==='playing'||renderDirty){
    view.setSecurityMonitor(screen==='playing'&&game.phase==='playing'&&Boolean(game.blackout?.monitor),blackoutUI.channel,$('monitor-feed'));
    if(['notice','menu','settings','developer','nights','tools','options','result'].includes(screen))view.renderTitle(screen==='result'?(game.phase==='lost'?'lost':'won'):'menu');
    else view.render(game,yaw,pitch,sceneTime,dt,screen==='playing',mode==='demo'?.65:1);
    renderDirty=false;
    // Fire from the displayed simulation frame, never a wall-clock timeout.
    if(screen==='playing'){
      const openingImpact=scareCues.openingCue(),deathImpact=game.phase==='caught'&&scareCues.deathCue(game.deaths,RULES.caughtSeconds-game.caught);
      if(openingImpact||deathImpact){sound.event(openingImpact?'lens-strike':'scare-impact');}
    }
  }
  if(screen==='playing'&&game.phase==='playing'){
    const d=distance(game.player,game.enemy),dx=game.enemy.x-game.player.x,dz=game.enemy.z-game.player.z,pan=Math.max(-1,Math.min(1,(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(.1,d)));
    const safe=protectedRoom();
    sound.update(dt,Math.hypot(game.playerVelocity.x,game.playerVelocity.z),safe?Infinity:d,safe?0:pan,safe||audioOccluded(),game.blackout?game.blackout.powerOn:game.collected.size===SHARDS.length,safe?0:Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z),game.blackout&&!game.sprinting?0:view.playerMotion.steps,game.blackout?.enemyMode==='chase',intro.active?'silent':game.blackout?.enemyMode??(game.entryOpened?'chase':'silent'));
    sound.updateBlackout(dt,game,yaw,blackoutSight);
  }
  if(screen==='playing'&&game.phase==='playing')drawMap($('minimap'),game,yaw,settings.zoom,settings.localMapScale);
  monitorLift.update(game,screen==='playing',reduced);
  heartbeatHUD.update(sound,{visible:screen==='playing'&&game.phase==='playing'&&!intro.active&&!game.blackout?.monitor&&!tutorialCall.busy,reduced});
  const caughtTime=RULES.caughtSeconds-game.caught;
  $('death-shade').style.opacity=screen==='playing'?(game.phase==='caught'?Math.max(0,Math.min(1,(caughtTime-.72)/.25)):game.phase==='respawn'?Math.min(1,game.respawn/.3):0):0;
  $('respawn').style.opacity=Math.min(1,game.respawn/.3);

}
$('notice-continue').onclick=()=>{if(loadingActive||!sceneReady||screen!=='notice'||noticeConfirmations.some(input=>!input.checked))return;noticeAcknowledged=true;menu();$('start-button').focus({preventScroll:true});};
$('skip-opening').onclick=()=>{if(!intro.active||screen!=='paused')return;sound.opening?.stop();sound.stopEnemyVoice();scareCues.reset();screen='playing';clearKeys();lastFrame=performance.now();intro.skip();updateScreen();updateHUD();};
$('start-button').onclick=()=>start();$('demo-restart').onclick=()=>start('demo');$('demo-exit').onclick=()=>menu('Demo 已退出。你可以开始人工游玩。');$('pause-button').onclick=()=>pause();$('resume-button').onclick=resume;$('restart-pause').onclick=()=>start(mode,activeCustom);$('restart-result').onclick=()=>start('human',activeCustom);$('menu-pause').onclick=()=>menu();$('menu-result').onclick=()=>menu();$('mute-button').onclick=toggleSound;$('settings-button').onclick=()=>openShell('options');$('pause-options').onclick=()=>openShell('options');$('continue-button').onclick=continueNight;
$('developer-button').onclick=()=>{screen='developer';updateScreen();};
$('developer-back').onclick=()=>{rebuildCorridors();screen='tools';updateScreen();$('developer-button').focus();};
$('developer-reset').onclick=()=>{for(const field of TUNING_FIELDS)settings[field.key]=DEFAULT_SETTINGS[field.key];settings.zoom=DEFAULT_SETTINGS.zoom;settings.enemyXray=DEFAULT_SETTINGS.enemyXray;applySettings();rebuildCorridors();};
for(const field of TUNING_FIELDS)$(field.key+'-setting').oninput=e=>{settings[field.key]=Number(e.target.value);applySettings();};
$('corridorWidth-setting').onchange=rebuildCorridors;
$('ceilingHeight-setting').onchange=rebuildCorridors;
$('zoom-setting').checked=settings.zoom;
for(const [id,k] of [['zoom-setting','zoom']])$(id).onchange=e=>{settings[k]=e.target.checked;applySettings();};
for(const id of ['notice-friendly-setting'])$(id).onchange=e=>{settings.friendlyMode=e.target.checked;applySettings();};
$('enemyXray-setting').onchange=e=>{settings.enemyXray=e.target.checked;applySettings();};
window.addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  const code=e.code.toLowerCase();
  if(code==='escape'&&!monitorExitGuard.press(e.repeat)){e.preventDefault();return;}
  if(screen==='playing'&&intro.active){e.preventDefault();if(code==='escape'&&!e.repeat)pause();return;}
  if(screen==='playing'&&tutorialCall.busy){if(code==='escape'||code==='tab'){e.preventDefault();if(!e.repeat)tutorialCall.close();}return;}
  if(code==='keym'&&!game.blackout&&!e.repeat&&screen!=='notice'&&screen!=='error')toggleSound();
  if(code==='escape'){if(screen==='playing'&&phoneBusy()){e.preventDefault();closeDeviceView();return;}if(mode==='demo'&&screen==='playing')menu('Demo 已退出。你可以开始人工游玩。');else if(screen==='playing')pause();else if(['nights','tools','options'].includes(screen)){closeShell();}else if(screen==='developer'){screen='tools';updateScreen();$('developer-button').focus();}else if(screen==='settings')menu();return;}
  if(code==='tab'&&screen==='playing'&&game.phase==='playing'&&game.blackout){e.preventDefault();if(!e.repeat)pendingActions.push('phone');return;}
  if(game.blackout?.monitor&&screen==='playing'&&['arrowleft','arrowright'].includes(code)){e.preventDefault();if(!e.repeat)blackoutUI.setMonitorChannel(blackoutUI.channel+(code==='arrowright'?1:-1));return;}
  if(code==='keye'&&screen==='playing'&&game.phase==='playing'&&mode==='human'){e.preventDefault();keys.add(code);if(!e.repeat){pendingInteract=true;if(game.blackout){if(getBlackoutInteraction(game,yaw)?.kind==='room-door')doorGesture(doorInput.press('keyboard'));else pendingActions.push('interact');}}return;}
  if(game.blackout&&screen==='playing'&&game.phase==='playing'&&mode==='human'){
    const action={keyf:'flashlight',keyv:'use-item',keyq:'nightvision',digit1:'phone-a',digit2:'phone-b',keym:'monitor'}[code];
    if(action){e.preventDefault();if(!e.repeat)pendingActions.push(action);return;}
  }
  if(screen==='playing'&&mode==='human'&&['keyw','keya','keys','keyd','shiftleft','shiftright','arrowleft','arrowright'].includes(code)){e.preventDefault();keys.add(code);}
});window.addEventListener('keyup',e=>{const code=e.code.toLowerCase();if(code==='escape')monitorExitGuard.release();keys.delete(code);if(code==='keye'){const action=doorInput.release('keyboard');if(screen==='playing'&&game.phase==='playing')doorGesture(action);}});
function canLook(){return !loadingActive&&sceneReady&&screen==='playing'&&game.phase==='playing'&&mode==='human'&&!phoneBusy();}
function applyLook(delta,time){if(game.blackout?.bedTransition)return;delta=mouseResistance.apply(delta,time,settings.mouseFriction,settings.mouseAcceleration);if(!delta)return;yaw-=delta.x*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch-delta.y*MOUSE_RADIANS_PER_PIXEL*settings.sensitivity));}
function cancelDrag(){const canvas=view?.renderer.domElement,id=mouseLook.pointerId;mouseLook.cancelDrag();mouseResistance.reset();if(id!==null&&canvas?.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
function installLook(canvas){
  canvas.addEventListener('pointerdown',e=>{
    if(canLook()&&game.blackout&&e.button===0&&document.pointerLockElement===canvas&&getBlackoutInteraction(game,yaw)?.kind==='room-door'){
      e.preventDefault();doorPointerId=e.pointerId;doorGesture(doorInput.press(`pointer:${e.pointerId}`));return;
    }
    if(canLook()&&e.button===1){e.preventDefault();if(!game.blackout?.bedTransition&&quickTurn.start(settings.quickTurnDuration)&&reduced)yaw+=quickTurn.step(quickTurn.duration);cancelDrag();return;}
    if(!canLook()||document.pointerLockElement===canvas)return;
    requestPointer();
    if(mouseLook.beginDrag(e)){mouseResistance.reset();e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}}
  });
  canvas.addEventListener('pointermove',e=>{if(canLook()&&document.pointerLockElement!==canvas)applyLook(mouseLook.drag(e),e.timeStamp);});
  canvas.addEventListener('lostpointercapture',()=>mouseLook.cancelDrag());
  canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  canvas.addEventListener('pointerleave',e=>{if(!canvas.hasPointerCapture?.(e.pointerId))cancelDrag();});
}
window.addEventListener('pointerup',e=>{if(e.button===0&&doorPointerId===e.pointerId){const action=doorInput.release(`pointer:${e.pointerId}`);doorPointerId=null;if(screen==='playing'&&game.phase==='playing')doorGesture(action);}cancelDrag();});window.addEventListener('pointercancel',()=>{doorInput.clear();doorPointerId=null;cancelDrag();});
window.addEventListener('mousemove',e=>{if(canLook()&&document.pointerLockElement===view?.renderer.domElement)applyLook(mouseLook.relative(e),e.timeStamp);});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===view?.renderer.domElement&&!canLook()){releasePointer();return;}
  const locked=document.pointerLockElement===view?.renderer.domElement;mouseLook.setLocked(locked);mouseResistance.reset();
  if(locked){hadPointerLock=true;return;}
  if(hadPointerLock&&screen==='playing'&&mode==='human'&&!phoneBusy()&&!monitorExitGuard.recent(performance.now()))pause();hadPointerLock=false;
});
window.addEventListener('resize',()=>{renderDirty=true;});
let wasFullscreen=Boolean(document.fullscreenElement);
document.addEventListener('fullscreenchange',()=>{const active=Boolean(document.fullscreenElement);renderDirty=true;if(wasFullscreen&&!active&&screen==='playing'){const action=monitorExitGuard.browserExit(Boolean(game.blackout&&(game.blackout.monitor||game.blackout.monitorConnecting||game.blackout.phoneOpen)),performance.now());if(action==='close')closeDeviceView();else if(action==='pause')pause();}wasFullscreen=active;});
window.addEventListener('blur',()=>{clearKeys();cancelDrag();if(screen==='playing'&&!monitorExitGuard.recent(performance.now()))pause('窗口失去焦点，游戏已自动暂停。');});
document.addEventListener('visibilitychange',()=>{renderDirty=true;if(document.hidden){cancelDrag();if(screen==='playing')pause('页面已切换，游戏已自动暂停。');}});
window.addEventListener('pagehide',event=>{if(!event.persisted)tutorialCall.destroy();});
$('reload-page').onclick=()=>location.reload();
document.querySelectorAll('.total-shards').forEach(e=>e.textContent=SHARDS.length);
buildView(beginLoading());requestAnimationFrame(frame);
