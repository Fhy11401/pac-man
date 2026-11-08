import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackoutUI,securityMapNavigation} from '../src/blackout-ui.js';
import {createGame} from '../src/core.js';

test('the phone has only flashlight and surveillance while Q night vision remains an independent HUD device',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const appMarkup=html.match(/<div class="phone-apps\b[^>]*>(.*?)<\/div>/s)?.[1];assert(appMarkup);
  assert.deepEqual([...appMarkup.matchAll(/<button id="([^"]+)"/g)].map(match=>match[1]),['phone-flashlight','phone-monitor']);
  const ids=new Set([...(html+securityMapNavigation().svg).matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));assert(ids.has('blackout-vision'));assert(ids.has('blackout-battery'));assert(!ids.has('phone-nightvision'));
  class Element{
    querySelector(selector){this.selected??={};return this.selected[selector]??=new Element();}
    remove(){}
    constructor(){this.style={};this.dataset={};this.attributes={};this.children=[];this.listeners={};this.textContent='';this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),remove:(...names)=>names.forEach(name=>this.classes.delete(name))};}
    setAttribute(name,value){this.attributes[name]=value;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=this.listeners[type].filter(handler=>handler!==fn);}focus(){}scrollIntoView(){}
  }
  const elements=Object.fromEntries([...ids].map(id=>[id,new Element()])),body=new Element(),counter=new Element(),label=new Element(),previous=globalThis.document;
  globalThis.document={body,getElementById(id){assert(ids.has(id),`UI references missing HTML element ${id}`);return elements[id];},querySelector(selector){return selector==='.count-label'?label:counter;},createElement(){return new Element();}};
  let ui;
  try{
    const actions=[];ui=new BlackoutUI({onAction:action=>actions.push(action)});const game=createGame({}, {mode:'blackout'});game.blackout.phoneOpen=true;
    ui.update(game,{active:true});for(const id of ['phone-flashlight','phone-monitor']){assert.equal(elements[id].disabled,false);elements[id].listeners.click[0]();}
    assert.deepEqual(actions,[{type:'phone-flashlight'},{type:'phone-monitor'}]);
    game.blackout.nightVision=true;game.blackout.battery=71;ui.update(game,{active:true});assert(body.classes.has('blackout-nightvision'));assert.equal(elements['blackout-vision'].textContent,'夜视开启');assert.equal(elements['blackout-battery'].textContent,'01:11');
    ui.update(game,{active:false});assert.equal(elements['phone-flashlight'].disabled,true);assert.equal(elements['phone-monitor'].disabled,true);assert(!body.classes.has('blackout-nightvision'));
  }finally{ui?.destroy();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
