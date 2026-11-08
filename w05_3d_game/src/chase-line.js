// Remember travel direction, not camera yaw. Darkness hides turns, not a
// person continuing down an already acquired corridor.
export const DARK_TURN_SECONDS=1.5;
const copy=p=>({x:p.x,z:p.z});
const length=v=>Math.hypot(v.x,v.z);
const dot=(a,b)=>a.x*b.x+a.z*b.z;
function axis(v,fallback={x:0,z:1}){return length(v)<.12?copy(fallback):Math.abs(v.x)>Math.abs(v.z)?{x:Math.sign(v.x),z:0}:{x:0,z:Math.sign(v.z)};}
export function acquireChaseLine(point,velocity,lit,from){
 const direction=axis(velocity,axis({x:point.x-from.x,z:point.z-from.z}));
 return{origin:copy(point),point:copy(point),direction,lit,corner:null,missingSince:null,rushTarget:null};
}
export function advanceChaseLine(line,{point,velocity,lit,visible,hidden=false,now,sight,project}){
 if(visible&&!hidden){
  const next=acquireChaseLine(point,velocity,lit,line.point);if(length(velocity)<.12)next.direction=copy(line.direction);
  Object.assign(line,next);return{kind:'track',point:copy(point)};
 }
 const delta={x:point.x-line.origin.x,z:point.z-line.origin.z},step={x:point.x-line.point.x,z:point.z-line.point.z};
 const direction=axis(velocity,line.direction),turned=dot(direction,line.direction)<.5;
 // A lit corner supplies a remembered route even when the wall briefly hides
 // the person. An unlit corner never updates this route or its heading.
 if(!hidden&&line.missingSince===null&&turned&&line.lit&&length(step)<=1&&sight(line.point,point)){
  line.corner=copy(line.point);line.origin=copy(line.point);line.direction=direction;line.point=copy(point);line.lit=lit;
  return{kind:'track',point:copy(point)};
 }
 const lateral=Math.abs(delta.x*line.direction.z-delta.z*line.direction.x),forward=dot(step,line.direction)>=-.15;
 if(!hidden&&!turned&&lateral<=.35&&forward&&sight(line.origin,point)){
  line.point=copy(point);line.lit=lit;line.missingSince=null;line.rushTarget=null;
  return{kind:'track',point:copy(point)};
 }
 if(line.missingSince===null){line.missingSince=now;line.rushTarget=project(line.point,line.direction);}
 return now-line.missingSince>=DARK_TURN_SECONDS-1e-7?{kind:'lost'}:{kind:'rush',point:copy(line.rushTarget)};
}
