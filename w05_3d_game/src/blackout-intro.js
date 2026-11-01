import {OPENING_REVEAL_AT} from './scare-timing.js';
// A short visual sequence; the actual hotel power objective stays unrepaired.
import {OPENING_CUT_AT} from './opening-timing.js';
export const INTRO_STAGES=Object.freeze([
  {mode:'mains',shot:'monitor',duration:OPENING_CUT_AT,event:'monitor-watch'},
  {mode:'blackout',shot:'outage',duration:1.4,event:'mains-fail'},
  {mode:'blackout',shot:'crank',duration:3.2,event:'backup-start'},
  {mode:'backup',shot:'return',duration:1.8,event:'backup-ready'},
]);
export class BlackoutIntro{
  constructor({onEvent=()=>{},onComplete=()=>{}}={}){this.onEvent=onEvent;this.onComplete=onComplete;this.active=false;this.game=null;}
  start(game){this.stop();if(!game.blackout)return;this.game=game;this.index=0;this.remaining=INTRO_STAGES[0].duration;this.strikePlayed=false;this.active=true;this.present();this.onEvent(INTRO_STAGES[0].event);}
  present(){const stage=INTRO_STAGES[this.index];Object.assign(this.game.blackout,{introLighting:stage.mode,introShot:stage.shot,introTime:stage.duration-this.remaining});}
  update(dt){
    if(!this.active||!Number.isFinite(dt)||dt<=0)return;
    this.remaining-=Math.min(dt,.1);
    if(this.index===0&&!this.strikePlayed&&OPENING_CUT_AT-this.remaining>=OPENING_REVEAL_AT){this.strikePlayed=true;this.onEvent('lens-strike');}
    while(this.active&&this.remaining<=0){
      if(++this.index>=INTRO_STAGES.length){const game=this.game;this.stop();this.onComplete(game);break;}
      const next=INTRO_STAGES[this.index];this.remaining+=next.duration;this.present();this.onEvent(next.event);
    }
    if(this.active)this.present();
  }
  stop(){if(this.game?.blackout)for(const key of ['introLighting','introShot','introTime'])delete this.game.blackout[key];this.active=false;this.game=null;}
}
