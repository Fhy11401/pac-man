// Source-controlled defaults. UI changes live only in the current page.
export const TUNING_GROUPS = [
  {title:'画面与起伏',fields:[
    {key:'fov',label:'视野',value:80,min:60,max:110,step:1,unit:'°'},
    {key:'brightness',label:'场景亮度',value:.7,min:.3,max:1.3,step:.05,unit:'%'},
    {key:'walkBob',label:'步行起伏',value:1,min:0,max:3,step:.1,unit:'×'},
    {key:'runBob',label:'奔跑起伏',value:2,min:0,max:3,step:.1,unit:'×'},
  ]},
  {title:'移动与起跑',fields:[
    {key:'playerSpeed',label:'步行速度',value:1.6,min:1,max:2.4,step:.05,unit:'格/秒'},
    {key:'sprintSpeed',label:'奔跑速度',value:2.8,min:2,max:4,step:.05,unit:'格/秒'},
    {key:'walkStart',label:'步行加速时间',value:.07,min:.02,max:.3,step:.01,unit:'秒'},
    {key:'sprintStart',label:'起跑加速时间',value:.16,min:.04,max:.4,step:.01,unit:'秒'},
    {key:'movementInertia',label:'换向与收势惯性',value:.06,min:0,max:.18,step:.01,unit:'秒'},
  ]},
  {title:'鼠标手感',fields:[
    {key:'sensitivity',label:'鼠标灵敏度',value:1,min:.5,max:2,step:.1,unit:'×'},
    {key:'mouseFriction',label:'鼠标摩擦',value:.28,min:0,max:.7,step:.02,unit:'%'},
  ]},
  {title:'敌人追逐',fields:[
    {key:'enemySpeed',label:'普通追逐速度',value:2.05,min:1,max:3.2,step:.05,unit:'格/秒'},
    {key:'escapeEnemySpeed',label:'撤离追逐速度',value:2.4,min:1,max:3.8,step:.05,unit:'格/秒'},
  ]},
  {title:'通道与身体',fields:[
    {key:'corridorWidth',label:'通道净宽',value:1.5,min:1.3,max:2.4,step:.1,unit:'米'},
    {key:'eyeHeight',label:'视角眼高',value:1.62,min:1.4,max:1.85,step:.01,unit:'米'},
    {key:'playerRadius',label:'身体宽度',value:.16,min:.12,max:.19,step:.005,unit:'body'},
  ]},
];
export const TUNING_FIELDS=TUNING_GROUPS.flatMap(group=>group.fields);
export const DEFAULT_TUNING=Object.freeze(Object.fromEntries(TUNING_FIELDS.map(f=>[f.key,f.value])));
export const MOVEMENT_KEYS=['playerSpeed','sprintSpeed','walkStart','sprintStart','movementInertia','enemySpeed','escapeEnemySpeed','playerRadius','corridorWidth'];
export const formatTuning=(field,value)=>field.unit==='body'?`${(value*4.8).toFixed(2)} 米`:field.unit==='%'?`${Math.round(value*100)}%`:field.unit==='°'?`${value}°`:field.unit==='×'?`${value.toFixed(1)}×`:`${value.toFixed(2)} ${field.unit}`;
