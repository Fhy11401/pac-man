import {NIGHTS,nightClock} from './night-session.js';
import {securityMapNavigation} from './blackout-ui.js';
import {isInSafeRoom} from './world.js';
import {BLACKOUT_RULES} from './blackout-layout.js';
const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
export class NightUI{
  constructor({navigate,back,start,changeSetting,resetSettings,fullscreen,officeAction}){
    this.root=document.getElementById('night-shell');
    const by=id=>document.getElementById(id);this.by=by;
    const grid=by('night-cards'),map=securityMapNavigation().svg.replace(/id="[^"]*"/g,'');
    for(const night of NIGHTS){const button=document.createElement('button');button.type='button';button.className='night-card';button.disabled=!night.available;button.innerHTML=`<span class="night-card-number">0${night.number}</span><span class="night-card-map" aria-hidden="true">${night.available?map:''}</span><strong>Night ${night.number}</strong><small>${night.available?'停电之夜 / BLACKOUT':'未开放 / UNAVAILABLE'}</small>`;button.setAttribute('aria-label',`Night ${night.number} · ${night.available?'停电之夜，开始游戏':'未开放'}`);if(night.available)button.onclick=()=>start();grid.append(button);}
    by('night-select-button').onclick=()=>navigate('nights');by('tools-button').onclick=()=>navigate('tools');by('shell-back').onclick=back;
    for(const button of document.querySelectorAll('[data-settings-tab]'))button.onclick=()=>this.selectSettings(button.dataset.settingsTab);
    for(const input of document.querySelectorAll('[data-ui-setting]'))input.addEventListener('input',()=>changeSetting(input.dataset.uiSetting,input.type==='checkbox'?input.checked:Number(input.value)));
    by('option-reset').onclick=resetSettings;by('option-fullscreen').onclick=fullscreen;
    for(const list of this.root.querySelectorAll('[role=tablist]'))list.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...list.querySelectorAll('[role=tab]')],current=buttons.indexOf(document.activeElement);if(current<0)return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[index].click();buttons[index].focus();});
    for(const button of document.querySelectorAll('[data-office-action]'))button.onclick=()=>officeAction(button.dataset.officeAction);
    document.addEventListener('fullscreenchange',()=>text(by('option-fullscreen'),document.fullscreenElement?'退出全屏 / WINDOWED':'进入全屏 / FULLSCREEN'));
    this.selectSettings('audio');
  }
  selectSettings(tab){this.settingsTab=tab;for(const b of document.querySelectorAll('[data-settings-tab]')){b.setAttribute('aria-selected',String(b.dataset.settingsTab===tab));b.tabIndex=b.dataset.settingsTab===tab?0:-1;}for(const panel of document.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==tab;}
  syncSettings(settings){for(const input of document.querySelectorAll('[data-ui-setting]')){const value=settings[input.dataset.uiSetting];if(input.type==='checkbox')input.checked=Boolean(value);else input.value=value;const output=this.by(input.id+'-value');if(output)text(output,input.dataset.uiSetting==='fov'?`${value}°`:input.dataset.uiSetting==='sensitivity'?`${Number(value).toFixed(1)}×`:`${Math.round(value*100)}%`);}text(this.by('option-fullscreen'),document.fullscreenElement?'退出全屏 / WINDOWED':'进入全屏 / FULLSCREEN');}
  show(screen,{continuable,settings,custom}){
    const open=['nights','tools','options'].includes(screen);this.root.hidden=!open;this.root.inert=!open;this.root.dataset.page=screen;
    for(const panel of document.querySelectorAll('[data-shell-page]'))panel.hidden=panel.dataset.shellPage!==screen;
    text(this.by('shell-title'),{nights:'NIGHT SELECT',tools:'TOOLS',options:'SETTINGS'}[screen]??'');
    text(this.by('shell-subtitle'),{nights:'选择夜班',tools:'游戏工具',options:'游戏设置'}[screen]??'');
    this.by('continue-button').disabled=!continuable;this.by('continue-button').title=continuable?'继续本次页面中暂停的夜班':'本次页面尚无进行中的夜班';
    this.by('continue-note').hidden=!continuable;this.by('continue-note').textContent=custom?'CUSTOM NIGHT · 本次页面':'NIGHT 1 · 本次页面';
    document.body.dataset.night=custom?'custom':'1';this.syncSettings(settings);
    if(open&&this.lastScreen!==screen)this.by('shell-title').focus({preventScroll:true});this.lastScreen=screen;
  }
  update(game,{active=false,intro=false,callBusy=false,custom=false}={}){
    const b=game.blackout,office=active&&!intro&&!callBusy&&game.phase==='playing'&&b&&isInSafeRoom(game.player)&&!b.monitor&&!b.monitorConnecting&&!b.hidden;
    this.by('office-controls').hidden=!office;this.by('office-controls').inert=!office;
    for(const button of this.by('office-controls').querySelectorAll('button'))button.disabled=!office;
    if(office){const label=b.doorProgress>0&&b.doorProgress<1?'MOVING':b.doorClosed?'CLOSED':'OPEN';text(this.by('office-door-state'),label);this.by('office-door').setAttribute('aria-pressed',String(b.doorClosed));this.by('office-light').setAttribute('aria-pressed',String(b.flashlight));text(this.by('office-light-state'),b.flashlight?'ON':'OFF');text(this.by('office-power'),b.powerOn?'MAINS ONLINE':'BACKUP ONLINE');}
    const visible=active&&!intro&&game.phase==='playing'&&Boolean(b);this.by('night-readout').hidden=!visible;
    if(visible){text(this.by('night-clock'),nightClock(game.elapsed));text(this.by('night-number'),custom?'CUSTOM NIGHT':'NIGHT 1');text(this.by('night-battery'),`${Math.round(b.battery/BLACKOUT_RULES.batterySeconds*100)}%`);text(this.by('night-power'),b.powerOn?'ON':'OFF');this.by('night-battery-meter').value=b.battery/BLACKOUT_RULES.batterySeconds;}
  }
}
