// Night selection and custom presets do not change source-controlled defaults.
export const NIGHTS=Object.freeze(Array.from({length:5},(_,index)=>Object.freeze({number:index+1,available:index===0})));
export function customPreset(value={}){
  const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
  return {threat:Math.round(clamp(value.threat,1,20,10)),battery:Math.round(clamp(value.battery,30,90,90)),lives:Math.round(clamp(value.lives,1,3,3))};
}
export function threatMultiplier(preset){return preset?.threat===undefined?1:.55+customPreset(preset).threat*.045;}
export function configureNight(game,preset){
  if(!preset||!game.blackout)return;const selected=customPreset(preset);
  game.lives=selected.lives;game.blackout.battery=selected.battery;
  game.tuning.enemySpeed*=threatMultiplier(selected);game.tuning.escapeEnemySpeed*=threatMultiplier(selected);
}
export function canContinue(game,started){return Boolean(started&&game&&['playing','caught','respawn'].includes(game.phase));}
export function nightClock(elapsed){const minutes=Math.floor(Math.max(0,Number(elapsed)||0)/60),hour=Math.floor(minutes/60)%24;return `${hour%12||12}:${String(minutes%60).padStart(2,'0')} ${hour<12?'AM':'PM'}`;}
