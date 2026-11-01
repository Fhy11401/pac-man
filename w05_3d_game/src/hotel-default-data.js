import {DEFAULT_MAP_DOCUMENT} from './default-map-data.js';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const width=56,height=40,tiles=Array.from({length:height},()=>Array(width).fill('#'));
for(let z=0;z<DEFAULT_MAP_DOCUMENT.height;z++)for(let x=0;x<DEFAULT_MAP_DOCUMENT.width;x++)tiles[z][x]=DEFAULT_MAP_DOCUMENT.tiles[z][x];
const line=(x1,z1,x2,z2)=>{for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)tiles[z][x]='*';};
for(const z of [3,10,18,31])line(3,z,49,z);
line(49,3,49,31);line(3,18,3,31);line(28,18,28,31);line(40,15,40,27);line(28,13,36,13);
const halls=[
  {id:'reception',label:'接待大厅 / RECEPTION',type:'reception',bounds:{minX:11,maxX:17,minZ:7,maxZ:11}},
  {id:'lounge',label:'西侧休息厅 / WEST LOUNGE',type:'lounge',bounds:{minX:3,maxX:9,minZ:17,maxZ:21}},
  {id:'banquet',label:'宴会大厅 / BANQUET',type:'banquet',bounds:{minX:36,maxX:44,minZ:9,maxZ:15}},
  {id:'atrium',label:'东侧中庭 / EAST ATRIUM',type:'atrium',bounds:{minX:38,maxX:46,minZ:27,maxZ:33}},
];
for(const {bounds:b} of halls)line(b.minX,b.minZ,b.maxX,b.maxZ);
const camera=(id,label,x,z,tx,tz,description,fov=78)=>({id,label,description,position:{x,z,y:2.45},target:{x:tx,z:tz,y:1.3},fov});
const cameras=[
  camera('reception','接待大厅',11.15,7.2,16.4,10.5,'接待区与中央分流口',87),
  camera('lounge','西侧休息厅',3.15,20.85,8.7,17.3,'休息厅与西翼交通口',87),
  camera('banquet','宴会大厅',36.15,9.15,43.5,14.5,'宴会厅与东翼路线',86),
  camera('atrium','东侧中庭',38.15,27.15,45.7,32.5,'中庭与南侧环廊',86),
  camera('north-junction','北侧交通口',28,3.25,28,10,'北廊与东侧纵廊'),
  camera('east-junction','东侧交通口',49,10.25,49,18,'东翼主通道与配电区'),
  camera('south-junction','南侧交通口',28,30.75,28,22,'南廊与中央连接口'),
  camera('west-junction','西侧交通口',3,10.25,3,16,'西翼与休息厅入口'),
  camera('control-entry','监控室门外',13.15,13,17.8,13,'监控室前厅与机械门',82),
  camera('banquet-entry','宴会厅西入口',35.8,13,28.3,13,'宴会厅连接通道与客房外廊',78),
].map((item,index)=>({...item,code:`CAM ${String(index+1).padStart(2,'0')}`}));

export const HOTEL_DEFAULT_DOCUMENT=freeze({
  format:'night-hotel-layout',version:1,name:'永夜旅馆 · 大厅与环廊',
  map:{...JSON.parse(JSON.stringify(DEFAULT_MAP_DOCUMENT)),name:'永夜旅馆 · 大厅与环廊',width,height,tiles:tiles.map(row=>row.join(''))},
  facilities:{
    power:{id:'power',x:48,z:10,wall:{x:0,z:-1},label:'配电箱'},
    phones:[{id:'phone-a',x:20,z:7,wall:{x:0,z:-1},room:'201'},{id:'phone-b',x:24,z:14,wall:{x:-1,z:0},room:'202'}],
    rooms:[
      {id:'room-201',room:'201',bounds:{minX:20,maxX:21,minZ:7,maxZ:8},door:{x:19.5,z:8,axis:'x',inside:{x:20,z:8},outside:{x:19,z:8}}},
      {id:'room-202',room:'202',bounds:{minX:24,maxX:25,minZ:13,maxZ:14},door:{x:25.5,z:13,axis:'x',inside:{x:25,z:13},outside:{x:26,z:13}}},
    ],
    batteries:[{id:'battery-a',x:20,z:8},{id:'battery-b',x:25,z:14}],
    console:{id:'console',x:15,z:16,wall:{x:-1,z:0}},
    patrol:[{x:28,z:3},{x:49,z:3},{x:49,z:18},{x:40,z:18},{x:40,z:31},{x:28,z:31},{x:3,z:31},{x:3,z:18},{x:13,z:10},{x:28,z:10}],
    halls,cameras,
  },
});
