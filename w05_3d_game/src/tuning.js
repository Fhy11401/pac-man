// Source-controlled defaults. UI changes live only in the current page.
export const TUNING_GROUPS = [
  {title:'画面与空间',fields:[
    {key:'fov',label:'视野',value:86,min:60,max:110,step:1,unit:'°'},
    {key:'brightness',label:'场景亮度',value:.7,min:.3,max:1.3,step:.05,unit:'%'},
    {key:'corridorWidth',label:'通道净宽',value:1.5,min:1.3,max:2.4,step:.1,unit:'米'},
    {key:'ceilingHeight',label:'走廊层高',value:2.7,min:2.5,max:3.4,step:.05,unit:'米'},
    {key:'eyeHeight',label:'视角眼高',value:1.65,min:1.4,max:1.85,step:.01,unit:'米'},
    {key:'playerRadius',label:'身体宽度',value:.15,min:.12,max:.19,step:.005,unit:'body'},
  ]},
  {title:'步伐与视野',fields:[
    {key:'walkBob',label:'步行起伏',value:1,min:0,max:3,step:.1,unit:'×'},
    {key:'runBob',label:'奔跑起伏',value:2,min:0,max:3,step:.1,unit:'×'},
    {key:'runFov',label:'奔跑视野增量',value:4,min:0,max:10,step:.5,unit:'°'},
    {key:'walkStride',label:'步行步幅',value:1.9,min:1.2,max:2.6,step:.05,unit:'米'},
    {key:'runStride',label:'奔跑步幅',value:2.4,min:1.6,max:3.2,step:.05,unit:'米'},
    {key:'stepPitch',label:'步伐点头',value:.12,min:0,max:.5,step:.01,unit:'°'},
  ]},
  {title:'移动与起跑',fields:[
    {key:'playerSpeed',label:'步行速度',value:1.6,min:1,max:2.4,step:.05,unit:'格/秒'},
    {key:'sprintSpeed',label:'奔跑速度',value:2.8,min:2,max:4,step:.05,unit:'格/秒'},
    {key:'walkStart',label:'步行加速时间',value:.07,min:.02,max:.3,step:.01,unit:'秒'},
    {key:'sprintStart',label:'起跑加速时间',value:.10,min:.04,max:.4,step:.01,unit:'秒'},
    {key:'movementInertia',label:'换向与收势惯性',value:.06,min:0,max:.18,step:.01,unit:'秒'},
    {key:'turnFollow',label:'身体跟随转向',value:1,min:0,max:1,step:.05,unit:'%'},
  ]},
  {title:'鼠标与掉头',fields:[
    {key:'sensitivity',label:'鼠标灵敏度',value:1,min:.5,max:2,step:.1,unit:'×'},
    {key:'mouseFriction',label:'鼠标摩擦',value:.28,min:0,max:.7,step:.02,unit:'%'},
    {key:'mouseAcceleration',label:'鼠标速度增益',value:0,min:0,max:1,step:.05,unit:'%'},
    {key:'quickTurnDuration',label:'180° 掉头时长',value:.32,min:.16,max:.6,step:.01,unit:'秒'},
    {key:'turnStability',label:'转向稳像',value:.8,min:0,max:1,step:.05,unit:'%'},
  ]},
  {title:'敌人追逐',fields:[
    {key:'enemySpeed',label:'普通追逐速度',value:2.05,min:1,max:3.2,step:.05,unit:'格/秒'},
    {key:'escapeEnemySpeed',label:'撤离追逐速度',value:2.4,min:1,max:3.8,step:.05,unit:'格/秒'},
  ]},
  {title:'地图显示',id:'developer-map-options',fields:[
    {key:'localMapScale',label:'局部地图放大',value:2.1,min:1.4,max:3,step:.1,unit:'×'},
  ]},
];
export const TUNING_FIELDS=TUNING_GROUPS.flatMap(group=>group.fields);
export const DEFAULT_TUNING=Object.freeze(Object.fromEntries(TUNING_FIELDS.map(f=>[f.key,f.value])));
export const MOVEMENT_KEYS=['playerSpeed','sprintSpeed','walkStart','sprintStart','movementInertia','turnFollow','enemySpeed','escapeEnemySpeed','playerRadius','corridorWidth'];
export const formatTuning=(field,value)=>field.unit==='body'?`${(value*4.8).toFixed(2)} 米`:field.unit==='%'?`${Math.round(value*100)}%`:field.unit==='°'?`${value}°`:field.unit==='×'?`${value.toFixed(1)}×`:`${value.toFixed(2)} ${field.unit}`;
