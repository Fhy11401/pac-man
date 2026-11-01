import {SCARE_TURN_SECONDS} from './presentation.js';
import {OPENING_STRIKE_AT,OPENING_STRIKE_DURATION} from './opening-timing.js';
export const OPENING_REVEAL_AT=OPENING_STRIKE_AT+OPENING_STRIKE_DURATION*.74;
export const DEATH_LUNGE_SECONDS=.22;
export const DEATH_REVEAL_AT=SCARE_TURN_SECONDS+.12;
export const SCARE_VOICE_OFFSET=.12;
export function faceReveal(elapsed,at){return elapsed>=at?1:0;}
export class ScareCueGate{
  constructor(){this.reset();}
  reset(){this.death=null;this.opening=false;}
  deathCue(death,elapsed){if(elapsed<DEATH_REVEAL_AT||this.death===death)return false;this.death=death;return true;}
  openingCue(){if(!this.opening)return false;this.opening=false;return true;}
}
