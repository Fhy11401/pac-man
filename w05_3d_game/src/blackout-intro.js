// A short visual sequence; the actual hotel power objective stays unrepaired.
export const INTRO_STAGES=Object.freeze([
  {mode:'mains',duration:1.35,event:null},
  {mode:'blackout',duration:.95,event:'mains-fail'},
  {mode:'backup',duration:1.25,event:'backup-start'},
]);
export class BlackoutIntro{
  constructor({onEvent=()=>{},onComplete=()=>{}}={}){this.onEvent=onEvent;this.onComplete=onComplete;this.active=false;this.game=null;}
  start(game){this.stop();if(!game.blackout)return;this.game=game;this.index=0;this.remaining=INTRO_STAGES[0].duration;this.active=true;game.blackout.introLighting=INTRO_STAGES[0].mode;}
  update(dt){
    if(!this.active||!Number.isFinite(dt)||dt<=0)return;
    this.remaining-=Math.min(dt,.1);
    while(this.active&&this.remaining<=0){
      if(++this.index>=INTRO_STAGES.length){const game=this.game;this.stop();this.onComplete(game);break;}
      const next=INTRO_STAGES[this.index];this.remaining+=next.duration;this.game.blackout.introLighting=next.mode;this.onEvent(next.event);
    }
  }
  stop(){if(this.game?.blackout)delete this.game.blackout.introLighting;this.active=false;this.game=null;}
}
