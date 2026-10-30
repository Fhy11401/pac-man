const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

// Presentation only: neither camera movement nor footfalls can move the collision body.
// Both use the same travelled-distance clock, including strafing and walking backwards.
export class PlayerMotion {
  constructor(){this.reset();}
  reset(){this.phase=0;this.weight=0;this.run=0;this.bob=0;this.sway=0;this.pitch=0;this.steps=0;this.fov=0;this.stability=0;}
  update(speed,dt,tuning,{active=true,motion=true,scale=1,turnRate=0}={}){
    this.steps=0;
    if(!active){this.reset();return this;}
    dt=clamp(dt,0,.1);speed=Math.max(0,speed);
    const steady=clamp((Math.abs(turnRate)-.4)/3.2)*clamp(tuning.turnStability??.8);
    this.stability+=(steady-this.stability)*(1-Math.exp(-dt*(steady>this.stability?22:8)));
    const moving=speed>.05;
    // Shift alone must not widen the view while accelerating or pushing into a wall.
    const running=clamp((speed-tuning.playerSpeed)/Math.max(.1,tuning.sprintSpeed-tuning.playerSpeed));
    this.run+=(running-this.run)*(1-Math.exp(-dt*12));
    this.fov=motion?this.run*tuning.runFov:0;
    const target=moving?clamp(speed/Math.max(.1,tuning.playerSpeed*.6)):0;
    this.weight+=(target-this.weight)*(1-Math.exp(-dt*24));
    if(moving){
      const stride=tuning.walkStride+(tuning.runStride-tuning.walkStride)*running;
      const next=this.phase+speed*2.4*dt/Math.max(.5,stride);
      this.steps=Math.floor(next)-Math.floor(this.phase);this.phase=next;
    }
    const angle=this.phase*Math.PI*2;
    const strength=tuning.walkBob+(tuning.runBob-tuning.walkBob)*this.run;
    const weight=motion?this.weight*scale*strength:0;
    // A short foot plant and longer recovery, with much less lateral float.
    const landing=-.8*Math.cos(angle)-.2*Math.cos(angle*2);
    // Stabilize gait during turning without filtering mouse yaw or changing stride/audio cadence.
    this.bob=landing*(.018+.014*this.run)*weight*(1-.7*this.stability);
    this.sway=Math.sin(angle*.5)*(.005+.004*this.run)*weight*(1-.96*this.stability);
    this.pitch=-Math.cos(angle)*tuning.stepPitch*Math.PI/180*weight*(1-.96*this.stability);
    if(!moving&&this.weight<1e-5){this.weight=0;this.bob=0;this.sway=0;this.pitch=0;}
    return this;
  }
}
