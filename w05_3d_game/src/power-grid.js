import {HOTEL_DOCUMENT,MAP_DOCUMENT,isInSafeRoom,key,pathTo} from './world.js';
import {resolvePowerLayout} from './power-layout.js';
const layout=resolvePowerLayout({...HOTEL_DOCUMENT,map:MAP_DOCUMENT});
export const POWER_SECTORS=Object.freeze(layout.sectors.map(Object.freeze));
export const sectorAt=point=>layout.sectorAt(point);
export function circuitProgress(state,panel){return state?.powerOn?1:state?.circuits?.[panel.id]??0;}
export function isAreaPowered(state,point){return !state||Boolean(state.powerOn)||isInSafeRoom(point)||circuitProgress(state,sectorAt(point))>=1;}
export function restoredCount(state){return POWER_SECTORS.filter(p=>circuitProgress(state,p)>=1).length;}
export function powerSignature(state){return POWER_SECTORS.map(p=>circuitProgress(state,p)>=1?1:0).join('');}
const objectiveCache=new WeakMap();
export function nextPowerPanel(state,from){
  const cell={x:Math.round(from.x),z:Math.round(from.z)},token=`${key(cell)}/${powerSignature(state)}`,cached=objectiveCache.get(state);
  if(cached?.token===token)return cached.panel;
  const panel=POWER_SECTORS.filter(p=>circuitProgress(state,p)<1).map(panel=>({panel,distance:pathTo(cell,panel).length||Infinity})).sort((a,b)=>a.distance-b.distance)[0]?.panel??POWER_SECTORS[0];
  objectiveCache.set(state,{token,panel});return panel;
}
