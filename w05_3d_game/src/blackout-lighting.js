// The opening sequence only overrides presentation. Repair progress and the
// simulation's powerOn flag remain authoritative for gameplay.
export function blackoutVisualLighting(state){
  const enabled=Boolean(state),intro=state?.introLighting??null,blackout=intro==='blackout';
  const powerOn=!enabled||intro==='mains'||intro===null&&Boolean(state.powerOn);
  const emergencyOn=enabled&&!blackout;
  return{enabled,intro,blackout,powerOn,emergencyOn,key:`${enabled}/${powerOn}/${emergencyOn}/${blackout}`};
}
