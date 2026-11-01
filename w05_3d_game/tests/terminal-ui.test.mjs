import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackoutUI,securityMapNavigation,audibleDoorBash} from '../src/blackout-ui.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {SECURITY_CHANNELS} from '../src/security-cameras.js';
import {createGame} from '../src/core.js';
import {MAP} from '../src/world.js';

test('all camera labels fit the cropped floor plan without overlapping and retain physical anchors',()=>{
  const plan=securityMapNavigation();
  assert.equal(plan.buttons.length,SECURITY_CHANNELS.length);
  const cells=MAP.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x,z}]));
  assert.equal(plan.width,Math.max(...cells.map(p=>p.x))-Math.min(...cells.map(p=>p.x))+3);
  assert.equal(plan.height,Math.max(...cells.map(p=>p.z))-Math.min(...cells.map(p=>p.z))+3);
  for(const [index,button] of plan.buttons.entries()){
    assert(Number.isFinite(button.x)&&Number.isFinite(button.y));
    assert(button.x-6.7>=0&&button.x+6.7<=100&&button.y-5.25>=0&&button.y+5.25<=100);
    assert.deepEqual(button.anchor,{x:SECURITY_CHANNELS[index].position.x,z:SECURITY_CHANNELS[index].position.z});
    for(const other of plan.buttons.slice(index+1))assert(Math.abs(button.x-other.x)>=13.4||Math.abs(button.y-other.y)>=10.5,`${button.id} overlaps ${other.id}`);
  }
});

function fakeDOM(){
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ids=new Set([...(html+securityMapNavigation().svg).matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  class Element{
    constructor(){this.style={};this.dataset={};this.attributes={};this.children=[];this.listeners={};this.textContent='';this.classList={toggle(){},remove(){}};}
    setAttribute(name,value){this.attributes[name]=value;}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(type,fn){this.listeners[type]=fn;}removeEventListener(type){delete this.listeners[type];}focus(){}
  }
  const elements=Object.fromEntries([...ids].map(id=>[id,new Element()]));
  return{elements,document:{body:new Element(),getElementById:id=>{assert(ids.has(id),`missing ${id}`);return elements[id];},querySelector:()=>new Element(),createElement:tag=>{assert.notEqual(tag,'canvas');return new Element();}}};
}

test('opening power readout follows mains, blackout, backup, then the repair objective',()=>{
  const previous=globalThis.document,{elements,document}=fakeDOM();globalThis.document=document;let ui;
  try{
    ui=new BlackoutUI({onAction(){}});const game=createGame({}, {mode:'blackout'});
    for(const [stage,title,power] of [['mains','夜班开始','ON'],['blackout','主电源中断','OFF'],['backup','备用电源在线','AUX'],[null,'修复酒店供电','OFF']]){
      game.blackout.introLighting=stage;ui.update(game,{active:true});
      assert.equal(elements['blackout-objective'].textContent,title);assert.equal(elements['blackout-power-state'].textContent,power);assert.equal(elements.collected.textContent,power);
      assert.equal(game.blackout.powerOn,false,'the cinematic display must not complete the repair');
    }
    game.elapsed=125.8;game.blackout.powerOn=true;game.blackout.hasLeftRoom=true;ui.update(game,{active:true});
    assert.equal(elements['hud-night-clock'].textContent,'02:05');assert.equal(elements['blackout-power-state'].textContent,'ON');assert.equal(elements['blackout-objective'].textContent,'返回监控室并关门');
  }finally{ui?.destroy();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('monitor navigation is static across updates and never replaces the live feed or tutorial overlay',()=>{
  const previous=globalThis.document,{elements,document}=fakeDOM();globalThis.document=document;let ui;
  try{
    ui=new BlackoutUI({onAction(){}});const game=createGame({}, {mode:'blackout'}),plan=elements['monitor-floorplan'].innerHTML,feed={tagName:'CANVAS'};
    elements['monitor-feed'].append(feed);elements['tutorial-call'].hidden=false;elements['tutorial-call'].dataset.state='connected';
    for(let i=0;i<SECURITY_CHANNELS.length;i++){
      game.elapsed=i;ui.update(game,{active:true});ui.setMonitorChannel(i);
      assert.equal(elements['monitor-floorplan'].innerHTML,plan);assert.deepEqual(elements['monitor-feed'].children,[feed]);assert.equal(elements['tutorial-call'].hidden,false);
      assert.equal(elements['tutorial-call'].dataset.state,'connected');assert.equal(ui.channelButtons[i].attributes['aria-pressed'],'true');
    }
  }finally{ui?.destroy();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('bed hiding preserves phone and CCTV controls, while nearby bashing remains visible in surveillance',()=>{
  const previous=globalThis.document,{elements,document}=fakeDOM();globalThis.document=document;let ui;
  try{
    const actions=[];ui=new BlackoutUI({onAction:action=>actions.push(action)});
    const game=createGame({}, {mode:'blackout'}),b=game.blackout,room=L.rooms[0];
    game.player={...room.door};b.hidden=`bed:${room.id}`;b.bedHide={roomId:room.id};
    ui.update(game,{active:true,interaction:{kind:'bed',label:'离开床底'}});
    assert.equal(elements['blackout-hidden'].hidden,false);assert.equal(elements['blackout-interaction-label'].textContent,'离开床底');
    b.phoneOpen=true;ui.update(game,{active:true});assert.equal(elements['phone-monitor'].disabled,false);
    elements['phone-monitor'].listeners.click();assert.deepEqual(actions,[{type:'phone-monitor'}]);
    assert.equal(elements['phone-control-label'].textContent,'返回观察');
    b.phoneOpen=false;b.monitor=true;Object.assign(b.roomDoors[room.id],{bashing:true,bashProgress:.6});
    ui.update(game,{active:true});assert.equal(elements['security-monitor'].hidden,false);
    assert.equal(elements['blackout-door-warning'].hidden,false);assert.equal(elements['blackout-door-warning-value'].textContent,'60%');
    assert.equal(elements['blackout-door-warning-label'].textContent,'房门正在遭到撞击');
    assert.equal(b.hidden,`bed:${room.id}`,'using surveillance must preserve the hiding state');
    ui.update(game,{active:false});assert.equal(elements['blackout-door-warning'].hidden,true);assert.equal(elements['security-monitor'].hidden,true);
  }finally{ui?.destroy();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('door warnings cannot reveal a distant attack or the enemy search state',()=>{
  const game=createGame({}, {mode:'blackout'}),room=L.rooms[0];
  Object.assign(game.blackout.roomDoors[room.id],{bashing:true,bashProgress:.5});
  game.player={x:room.door.x+30,z:room.door.z};assert.equal(audibleDoorBash(game),null);
  game.player={x:room.door.x+3,z:room.door.z};assert.equal(audibleDoorBash(game).progress,.5);
  game.blackout.roomDoors[room.id].bashing=false;game.blackout.enemyRoomSearch={roomId:room.id,phase:'search'};
  assert.equal(audibleDoorBash(game),null);
});
