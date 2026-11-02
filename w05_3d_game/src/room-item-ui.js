import {ITEMS,canUseStick,STUN_SECONDS} from './room-items.js';
import {blackoutSight} from './blackout-state.js';
export const ITEM_ICONS={
  stick:'<path d="M12 5 30 35l8-4 3 5-12 7-5-6L7 8Z"/><path d="m9 11 5-3m-3 7 5-3m-3 7 5-3"/>',
  stethoscope:'<path d="M9 7v11a10 10 0 0 0 20 0V7M19 28v6a10 10 0 0 0 20 0v-6"/><circle cx="39" cy="24" r="5"/><path d="M8 6h4m14 0h4"/>',
};
export class RoomItemHUD{
  constructor(){
    this.root=document.createElement('aside');this.root.id='room-inventory';this.root.hidden=true;this.root.setAttribute('aria-label','道具栏 / Inventory');
    this.root.innerHTML='<svg class="item-icon" viewBox="0 0 48 48" aria-hidden="true"></svg><div class="item-copy"><small class="item-slot">道具 / ITEM · 1 SLOT</small><strong></strong><span class="item-description"></span><p class="item-status" aria-live="polite"></p></div><kbd>V</kbd>';
    document.body.append(this.root);this.icon=this.root.querySelector('svg');this.name=this.root.querySelector('strong');this.description=this.root.querySelector('.item-description');this.status=this.root.querySelector('.item-status');this.key=this.root.querySelector('kbd');this.lastKind=undefined;
  }
  update(game,active){
    const b=game.blackout;this.root.hidden=!active||!b||game.phase!=='playing'||Boolean(b.monitor||b.introLighting);if(this.root.hidden)return;
    const kind=b.inventory,ready=canUseStick(game,blackoutSight);
    if(this.lastKind!==kind){this.lastKind=kind;this.icon.innerHTML=ITEM_ICONS[kind]??'<path d="M10 24h28M24 10v28"/>';this.name.textContent=ITEMS[kind]?.name??'空 / EMPTY';this.description.textContent=ITEMS[kind]?.description??'寻找客房桌上的道具 / Search room desks';}
    this.root.dataset.stunned=String(Boolean(b.knockdown));this.root.dataset.ready=String(ready);this.root.dataset.item=kind??'empty';this.key.hidden=kind!=='stick';
    const status=b.knockdown?`${b.knockdown.elapsed<STUN_SECONDS?`眩晕 / STUN ${Math.ceil(STUN_SECONDS-b.knockdown.elapsed)}s`:'起身 / GETTING UP'} · 速度 / SPEED −10%`:kind==='stick'?(ready?'V 挥击 / STRIKE · 受击自动防卫 / AUTO DEFENSE':'靠近并面向敌人 / FACE ENEMY · 自动防卫 / AUTO DEFENSE'):kind==='stethoscope'?'隔墙侦听中 / LISTENING THROUGH WALLS':'E 拾取 / PICK UP';
    if(this.status.textContent!==status)this.status.textContent=status;
  }
  hide(){this.root.hidden=true;}
  dispose(){this.root.remove();}
}
