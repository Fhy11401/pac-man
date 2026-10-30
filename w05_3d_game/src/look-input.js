export const MOUSE_RADIANS_PER_PIXEL=.00165;
// Resist slow strokes more than fast turns. No queued rotation, dead zone or inertia.
export class MouseResistance {
  constructor(){this.reset();}
  reset(){this.lastTime=null;}
  apply(delta,time,strength){
    if(!delta||!Number.isFinite(delta.x)||!Number.isFinite(delta.y)){this.reset();return null;}
    const elapsed=this.lastTime===null?8:time-this.lastTime;
    this.lastTime=Number.isFinite(time)?time:null;
    const dt=Number.isFinite(elapsed)&&elapsed>0&&elapsed<80?Math.max(.5,elapsed):8;
    const speed=Math.hypot(delta.x,delta.y)*1000/dt;
    const gain=1-Math.max(0,Math.min(.7,strength))/(1+speed/700);
    return {x:delta.x*gain,y:delta.y*gain};
  }
}
// Keep locked relative input separate from unlocked drag coordinates.
// Embedded browsers can report a screen-relative movementX jump on re-entry.
const finitePoint=e=>Number.isFinite(e.clientX)&&Number.isFinite(e.clientY);
const safeDelta=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=256&&Math.abs(y)<=256;
export class MouseLook {
  constructor(){this.locked=false;this.skipRelative=false;this.cancelDrag();}
  cancelDrag(){this.dragging=false;this.pointerId=null;this.last=null;}
  setLocked(locked){this.cancelDrag();this.locked=locked;this.skipRelative=locked;}
  beginDrag(e){
    this.cancelDrag();if(this.locked||e.button!==0||!finitePoint(e))return false;
    this.dragging=true;this.pointerId=e.pointerId;this.last={x:e.clientX,y:e.clientY};return true;
  }
  drag(e){
    if(this.locked||!this.dragging)return null;
    // Releasing outside the canvas may not deliver mouseup to that canvas.
    if((e.buttons&1)===0){this.cancelDrag();return null;}
    if(e.pointerId!==this.pointerId||!finitePoint(e))return null;
    const dx=e.clientX-this.last.x,dy=e.clientY-this.last.y;
    this.last={x:e.clientX,y:e.clientY};
    return safeDelta(dx,dy)?{x:dx,y:dy}:null;
  }
  relative(e){
    if(!this.locked)return null;
    // The first event after acquiring lock can contain the cursor recenter offset.
    if(this.skipRelative){this.skipRelative=false;return null;}
    return safeDelta(e.movementX,e.movementY)?{x:e.movementX,y:e.movementY}:null;
  }
}
