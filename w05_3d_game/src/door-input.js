// Keyboard and mouse share one continuous door gesture.
export class DoorInput{
  constructor(){this.sources=new Set();}
  get held(){return this.sources.size>0;}
  press(source){const began=!this.held;this.sources.add(source);return began?'door-press':null;}
  release(source){if(!this.sources.delete(source))return null;return this.held?null:'door-release';}
  clear(){this.sources.clear();}
}
