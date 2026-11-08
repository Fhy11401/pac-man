// Runs on the night clock, so pausing cannot consume the reveal.
export class DiscoveryWarning{
  constructor(element){this.element=element;this.game=null;this.started=0;this.duration=4.6;}
  trigger(game){this.game=game;this.started=game.elapsed;}
  update(game,visible){
    const age=game.elapsed-this.started;
    this.element.hidden=!visible||this.game!==game||age<0||age>=this.duration;
    if(!this.element.hidden)this.element.style.opacity=String(Math.max(0,Math.min(1,age/.18,(this.duration-age)/.8)));
  }
}
