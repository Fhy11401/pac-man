export const MOUSE_RADIANS_PER_PIXEL=.00165;
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
