import {securityRoomFurniture,ROOM_BED_STRUCTURE} from './security-room-layout.js';
import {CELL_SIZE} from './world.js';

export const BED_HIDE_SECONDS=.55;
export const BED_EYE_HEIGHT=ROOM_BED_STRUCTURE.eyeHeight;
export const BED_UNDERSIDE=ROOM_BED_STRUCTURE.underside;
const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};

// Entries are on the long sides, between the real legs. Their standing centres
// clear the solid bed collider even at the largest developer body radius.
export function getBedHideSpots(width,playerRadius=.19){
  if(!Number.isFinite(playerRadius)||playerRadius<=0)throw new RangeError('Invalid bed approach clearance');
  return securityRoomFurniture(width).map(({room,bed})=>{
    const foot=Math.cos(bed.angle),target={x:bed.x,z:bed.z+foot*.10/CELL_SIZE},offset=bed.halfX+playerRadius+.04;
    return{id:`bed:${room.id}`,roomId:room.id,bedId:bed.id,target,approaches:[{x:bed.x-offset,z:target.z},{x:bed.x+offset,z:target.z}],eyeHeight:BED_EYE_HEIGHT,seconds:BED_HIDE_SECONDS};
  });
}
export function bedHidePose(roomId,width,playerRadius=.19){return getBedHideSpots(width,playerRadius).find(spot=>spot.roomId===roomId||spot.id===roomId);}

// Lower outside the mattress first, then crawl horizontally. Reverse that order
// on exit. Simulation and presentation share this exact curve; yaw is untouched.
export function bedTransitionPose(from,to,progress,entering,standingEyeHeight=1.65){
  const t=clamp(progress),movement=entering?ease((t-.45)/.55):ease(t/.55),height=entering?1-ease(t/.45):ease((t-.55)/.45);
  return{position:{x:from.x+(to.x-from.x)*movement,z:from.z+(to.z-from.z)*movement},eyeHeight:BED_EYE_HEIGHT+(standingEyeHeight-BED_EYE_HEIGHT)*height};
}

export function bedViewHeight(blackout,standingEyeHeight=1.65){
  if(!blackout?.bedHide)return standingEyeHeight;
  const transition=blackout.bedTransition;
  return transition?bedTransitionPose(transition.from,transition.to,transition.progress,transition.entering,standingEyeHeight).eyeHeight:BED_EYE_HEIGHT;
}
