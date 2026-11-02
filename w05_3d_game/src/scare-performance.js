const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Absolute scare time keeps the impact identical at different display refresh rates.
export function scarePerformance(age,{reduced=false}={}){
 const attack=smooth(age/.075),hold=age<0?0:attack,beat=age<0?0:age;
 const snap=Math.sin(beat*51)+.42*Math.sin(beat*93+.7),jerk=Math.sin(beat*67+.8)+.32*Math.sin(beat*109);
 return{mouth:hold*(.92+.08*Math.sin(beat*31)**2),x:reduced?0:hold*snap*.012,y:reduced?0:hold*jerk*.010,
 pitch:reduced?0:hold*Math.sin(beat*58)*.065,yaw:reduced?0:hold*snap*.075,roll:reduced?0:hold*jerk*.085,zoom:1+(reduced?0:hold*(.035+.025*Math.sin(beat*43))),backdrop:hold};
}
export function scareTargetHeight(aspect){return Math.min(3.8,Math.max(2.8,2.4*Math.sqrt(Math.max(.5,aspect))));}
export function setScareMouth(head,amount){head.traverse(mesh=>{if(mesh.morphTargetInfluences)mesh.morphTargetInfluences[0]=clamp(amount);});}
