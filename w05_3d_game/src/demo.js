import {MOUSE_RADIANS_PER_PIXEL} from './look-input.js';
import { SHARDS, EXIT, distance, cell, routesFrom } from './world.js';
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const shardAt = new Map(SHARDS.map((p, i) => [`${p.x},${p.z}`, i]));
export const DEMO_CAMERA = Object.freeze({ maxTurnSpeed: 5.5, response: 8, lookAhead: .65 });

// A critically damped mouse stroke: velocity rises and settles without a hard turn stop.
export class MouseStroke {
  constructor(){this.velocity=0;}
  step(error,dt){
    if(dt<=0)return 0;
    const w=DEMO_CAMERA.response,e=Math.exp(-w*dt),c=(this.velocity-w*error)*dt;
    let turn=clamp(error+(-error+c)*e,-DEMO_CAMERA.maxTurnSpeed*dt,DEMO_CAMERA.maxTurnSpeed*dt);
    this.velocity=clamp((this.velocity-w*c)*e,-DEMO_CAMERA.maxTurnSpeed,DEMO_CAMERA.maxTurnSpeed);
    if(turn*error>=0&&Math.abs(turn)>Math.abs(error)){turn=error;this.velocity=0;}
    if(Math.abs(error)<.0005&&Math.abs(this.velocity)<.01){turn=error;this.velocity=0;}
    return -turn/MOUSE_RADIANS_PER_PIXEL;
  }
}
export function roundCorners(start,route){
  const points=[start,...route],smooth=[];
  for(let i=1;i<points.length-1;i++){
    const p=points[i],a=points[i-1],b=points[i+1],da=distance(a,p),db=distance(p,b);
    const ix=(p.x-a.x)/da,iz=(p.z-a.z)/da,ox=(b.x-p.x)/db,oz=(b.z-p.z)/db;
    if(da>.5&&db>.5&&Math.abs(ix*ox+iz*oz)<.05){
      const r=.4,entry={x:p.x-ix*r,z:p.z-iz*r},exit={x:p.x+ox*r,z:p.z+oz*r};
      smooth.push(entry,{x:(entry.x+2*p.x+exit.x)/4,z:(entry.z+2*p.z+exit.z)/4},exit);
    }else smooth.push(p);
  }
  if(route.length)smooth.push(points.at(-1));return smooth;
}
// Plans a few corners ahead, but only supplies normal movement and camera input.
export class DemoController {
  constructor() { this.route = []; this.deaths = -1; this.target = null; this.yaw = -Math.PI / 2; this.turnSpeed = 0; this.mouseStroke=new MouseStroke(); this.evadeCooldown=0; this.travel = {x:1,z:0}; }
  plan(game) {
    const cost = p => 1 + Math.max(0, 4 - distance(p, game.enemy)) * 5;
    const planned = new Set(game.collected); let from = cell(game.player), heading = this.travel;
    this.route = distance(game.player, from) > .035 ? [from] : [];
    // Keep a committed look-ahead route, avoiding one-cell camera indecision.
    for (let leg = 0; leg < 5 && this.route.length < 5; leg++) {
      const targets = SHARDS.filter((_, i) => !planned.has(i));
      if (!targets.length) targets.push(EXIT);
      const paths=routesFrom(from,cost);
      let chosen, best = Infinity, goal;
      for (const target of targets) {
        const path = paths.get(target);
        if (!path.length) continue;
        const first = path[1];
        const turnCost = first ? (1 - ((first.x-from.x)*heading.x+(first.z-from.z)*heading.z)) * .8 : 0;
        const score = path.reduce((sum,p)=>sum+cost(p),0) + turnCost;
        if (score < best) { best = score; chosen = path; goal = target; }
      }
      if (!chosen) break;
      for (const p of chosen) { const i = shardAt.get(`${p.x},${p.z}`); if(i!==undefined) planned.add(i); }
      const next = chosen.slice(1);
      if (next.length) { const last = next.at(-1), prev = next.length>1 ? next.at(-2) : from; heading = {x:last.x-prev.x,z:last.z-prev.z}; this.route.push(...next); from=last; }
      this.target = goal;
      if (goal === EXIT) { this.route.push({...EXIT}); break; }
    }
    this.route=roundCorners(game.player,this.route);
  }
  evade(game){
    const from=cell(game.player),paths=routesFrom(from,p=>1+Math.max(0,4-distance(p,game.enemy))*8);let chosen,best=-Infinity;
    for(const target of SHARDS){
      const path=paths.get(target);if(path.length<4||path.length>8)continue;
      const gap=Math.min(...path.slice(1).map(p=>distance(p,game.enemy)));if(gap<1.3)continue;
      const first=path[1],alignment=(first.x-from.x)*this.travel.x+(first.z-from.z)*this.travel.z;
      const score=gap*3+distance(target,game.enemy)*.8+alignment*.8-(this.target?distance(target,this.target)*.08:0);
      if(score>best){best=score;chosen=path;}
    }
    if(chosen){this.route=roundCorners(game.player,[...(distance(game.player,from)>.035?[from]:[]),...chosen.slice(1)]);this.evadeCooldown=2;}
  }
  aim(game, dt) {
    let from=game.player, budget=DEMO_CAMERA.lookAhead, aim=this.route.at(-1);
    for(const point of this.route){const d=distance(from,point);if(d>=budget){aim={x:from.x+(point.x-from.x)*budget/d,z:from.z+(point.z-from.z)*budget/d};break;}budget-=d;from=point;}
    if(!aim || distance(game.player,aim)<.001)return;
    const target=Math.atan2(game.player.x-aim.x,game.player.z-aim.z);let error=wrap(target-this.yaw);
    // Exact about-faces always pick one side rather than alternating at ±pi.
    if(Math.abs(error)>Math.PI-.015)error=Math.abs(error)*(this.turnSpeed<-.01?-1:1);
    const mouseX=this.mouseStroke.step(error,dt);
    this.yaw-=mouseX*MOUSE_RADIANS_PER_PIXEL;this.turnSpeed=this.mouseStroke.velocity;
  }
  input(game, dt) {
    if(game.deaths!==this.deaths){this.route=[];this.deaths=game.deaths;this.yaw=-Math.PI/2;this.turnSpeed=0;this.mouseStroke=new MouseStroke();this.evadeCooldown=0;this.travel={x:1,z:0};}
    if(game.phase!=='playing')return {x:0,z:0};
    // Advance before inertia carries us beyond a waypoint and makes the controller turn back.
    const waypointReach=Math.max(.035,Math.hypot(game.motionVelocity.x,game.motionVelocity.z)*(dt*.5+game.tuning.movementInertia*.5));
    while(this.route.length&&distance(game.player,this.route[0])<waypointReach)this.route.shift();
    if(!this.route.length)this.plan(game);
    if(!this.route.length)return {x:0,z:0};
    this.evadeCooldown=Math.max(0,this.evadeCooldown-dt);
    if(this.evadeCooldown===0&&distance(game.player,game.enemy)<4.5&&this.route.some(p=>distance(p,game.player)<2.5&&distance(p,game.enemy)<1.5))this.evade(game);
    this.aim(game,dt);
    const point=this.route[0],d=distance(game.player,point),dx=(point.x-game.player.x)/Math.max(d,.00001),dz=(point.z-game.player.z)/Math.max(d,.00001);
    const alignment=-Math.sin(this.yaw)*dx-Math.cos(this.yaw)*dz;
    // Slow down for a corner, and finish an about-face before moving away.
    const pace=clamp((alignment+.05)/.9,0,1);
    const scale=Math.min(pace,d/(game.tuning.sprintSpeed*dt));
    if(scale>.01)this.travel={x:dx,z:dz};
    return {x:dx*scale,z:dz*scale,run:true};
  }
}
