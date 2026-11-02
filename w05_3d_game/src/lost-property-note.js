import {BLACKOUT_LAYOUT as L} from './blackout-layout.js';
import {ITEMS} from './room-items.js';
export function propertyEntries(records){return records.map(r=>({room:String(L.rooms.find(room=>room.id===r.roomId)?.room??'—'),...ITEMS[r.kind]}));}
export function propertyTranscript(records){return '酒店客房检查清单 / Hotel room checklist. '+propertyEntries(records).map(r=>`Room ${r.room}: ${r.name}. 桌面 / Desk. 待取回 / To collect.`).join(' ');}
export function drawPropertyNote(canvas,records){
 canvas.width=1024;canvas.height=1280;const c=canvas.getContext('2d');
 c.fillStyle='#e5ddc7';c.fillRect(0,0,1024,1280);
 let seed=7183;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<32000;i++){c.fillStyle=rand()>.5?'#fffbea09':'#55412a08';c.fillRect(rand()*1024,rand()*1280,1+rand()*3,1+rand()*2);}
 const edge=c.createRadialGradient(500,600,180,510,640,900);edge.addColorStop(0,'#f9f1d500');edge.addColorStop(1,'#76512830');c.fillStyle=edge;c.fillRect(0,0,1024,1280);
 const fold=c.createLinearGradient(0,631,0,649);fold.addColorStop(0,'#3e291500');fold.addColorStop(.45,'#3e291516');fold.addColorStop(.54,'#ffffe85c');fold.addColorStop(1,'#3e291500');c.fillStyle=fold;c.fillRect(0,631,1024,18);
 c.fillStyle='#31332f';c.font='bold 58px SimSun, serif';c.fillText('酒店客房检查清单',78,165);
 c.font='27px Georgia';c.fillText('HOTEL ROOM CHECKLIST',80,215);
 c.strokeStyle='#58574d';c.lineWidth=2;c.beginPath();c.moveTo(78,262);c.lineTo(944,262);c.stroke();
 c.font='27px SimSun, serif';c.fillText('房号',80,340);c.fillText('遗留物品',280,340);c.fillText('已取回',815,340);
 c.font='20px Georgia';c.fillText('ROOM',80,375);c.fillText('ITEMS LEFT BEHIND',280,375);c.fillText('COLLECTED',812,375);
 propertyEntries(records).forEach((r,i)=>{const y=474+i*290;
  c.fillStyle='#30332f';c.font='bold 64px Georgia';c.fillText(r.room,80,y+32);
  const [zh,en]=r.name.split(' / ');c.font='42px SimSun, serif';c.fillText(zh,280,y);c.font='29px Georgia';c.fillText(en,280,y+48);
  c.fillStyle='#67695f';c.font='26px SimSun, serif';c.fillText('桌面 / Desk',280,y+102);
  c.strokeStyle='#53574e';c.lineWidth=2;c.strokeRect(842,y-18,46,46);
  c.strokeStyle='#6b6e6159';c.lineWidth=1;c.beginPath();c.moveTo(80,y+176);c.lineTo(944,y+176);c.stroke();
 });
 return canvas;
}
export class LostPropertyUI{
 constructor({onClose}){this.el=document.getElementById('property-note');this.canvas=document.getElementById('property-note-paper');this.close=document.getElementById('property-note-close');this.close.onclick=onClose;this.game=null;}
 update(game,active){
  const show=Boolean(active&&game.phase==='playing'&&game.blackout?.noteOpen),was=this.el.hidden;
  this.el.hidden=!show;this.el.inert=!show;document.body.classList.toggle('reading-property-note',show);
  if(!show)return;
  if(this.game!==game){this.game=game;drawPropertyNote(this.canvas,game.blackout.lostProperty);this.canvas.setAttribute('aria-label',propertyTranscript(game.blackout.lostProperty));}
  if(was)this.close.focus({preventScroll:true});
 }
}
