import {isAreaPowered,powerSignature} from './power-grid.js';
// The opening sequence only overrides presentation. Repair progress and the
// simulation's powerOn flag remain authoritative for gameplay.
export function blackoutVisualLighting(state,point=null){
  const enabled=Boolean(state),intro=state?.introLighting??null,blackout=intro==='blackout';
  const powerOn=!enabled||intro==='mains'||intro===null&&(point?isAreaPowered(state,point):Boolean(state.powerOn));
  const emergencyOn=enabled&&!blackout;
  return{enabled,intro,blackout,powerOn,emergencyOn,key:`${enabled}/${powerOn}/${emergencyOn}/${blackout}/${powerSignature(state)}`};
}
