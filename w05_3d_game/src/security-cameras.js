import * as THREE from '../vendor/three.module.js';
import {MAP_CENTER,CELL_SIZE} from './world.js';
import * as layout from './blackout-layout.js';

const defaultLayout=[{id:'corridor',label:'东翼走廊',code:'CAM 01',description:'东翼走廊实时画面',position:{x:18.1,z:12.2,y:2.35},target:{x:18,z:8,y:1.05},fov:78}];
export const SECURITY_CHANNELS=Object.freeze((layout.SECURITY_CAMERA_LAYOUT??defaultLayout).map(channel=>Object.freeze({...channel,position:Object.freeze({...channel.position}),target:Object.freeze({...channel.target})})));

export const SECURITY_FRAME_INTERVAL=1/15;
export const SECURITY_MAX_SIZE=Object.freeze({width:960,height:540});

export function securityCameraPoses(corridorWidth=1.8,unit=CELL_SIZE,channels=SECURITY_CHANNELS){
  const world=(x,z,y)=>new THREE.Vector3((x-MAP_CENTER.x)*unit,y,(z-MAP_CENTER.z)*unit);
  if(!Number.isFinite(corridorWidth)||corridorWidth<=0||!Number.isFinite(unit)||unit<=0)throw new RangeError('Invalid surveillance scale');
  return channels.map(({position,target,fov=78})=>{
    for(const point of [position,target])if(!point||!['x','z','y'].every(key=>Number.isFinite(point[key])))throw new TypeError('Invalid camera position');
    if(!Number.isFinite(fov)||fov<20||fov>120)throw new RangeError('Invalid camera field of view');
    const from=world(position.x,position.z,position.y),to=world(target.x,target.z,target.y);
    if(from.distanceToSquared(to)<1e-8)throw new RangeError('Camera target must differ from its position');
    return{position:from,target:to,fov};
  });
}

export function securityFeedSize(width,height){
  const w=Number.isFinite(width)&&width>0?width:SECURITY_MAX_SIZE.width,h=Number.isFinite(height)&&height>0?height:w*9/16;
  const scale=Math.min(1,w/SECURITY_MAX_SIZE.width,h/SECURITY_MAX_SIZE.height);
  return{width:Math.max(1,Math.floor(SECURITY_MAX_SIZE.width*scale)),height:Math.max(1,Math.floor(SECURITY_MAX_SIZE.height*scale))};
}

// Owns only cameras and the existing canvas's presentation. There is no second
// renderer, render target, readback, simulation clock or requestAnimationFrame.
export class SecurityCameras {
  constructor({renderer,film,home,corridorWidth=1.8,unit=CELL_SIZE,channels=SECURITY_CHANNELS,onChange=()=>{},resizePlayer=()=>{}}){
    this.renderer=renderer;this.film=film;this.home=home;this.channels=channels;this.onChange=onChange;this.resizePlayer=resizePlayer;
    this.cameras=securityCameraPoses(corridorWidth,unit,channels).map((pose,index)=>{const camera=new THREE.PerspectiveCamera(pose.fov,16/9,.045,70);camera.name=`security-${channels[index].id}`;camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld(true);return camera;});
    this.active=false;this.channel=0;this.disposed=false;this.clock=0;this.dirty=false;this.power=null;this.frames=0;this.host=null;this.original=null;
    this.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(!this.disposed&&this.active)this.resize();}):null;
  }
  get camera(){return this.cameras[this.channel];}
  get selected(){return this.channels[this.channel];}
  set(active,channel=0,container){
    if(this.disposed)return false;
    if(!active){if(!this.active)return false;this.close();return true;}
    if(!container||typeof container.appendChild!=='function'||!this.cameras.length)return false;
    const index=typeof channel==='string'?this.channels.findIndex(item=>item.id===channel):Math.trunc(channel),next=Number.isFinite(index)&&index>=0&&index<this.cameras.length?index:0;
    const changed=!this.active||this.channel!==next||this.host!==container;
    if(!changed)return false;
    const canvas=this.renderer.domElement;
    if(!this.active){this.original={parent:canvas.parentNode??this.home,next:canvas.nextSibling,cssText:canvas.style.cssText};this.active=true;}
    if(this.host!==container){this.observer?.disconnect();container.appendChild(canvas);this.host=container;canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';this.observer?.observe(container);}
    this.channel=next;this.clock=0;this.dirty=true;this.power=null;this.resize();this.onChange(true,this.selected);return true;
  }
  resize(){
    if(!this.active||this.disposed)return;
    const bounds=this.host.getBoundingClientRect?.()??{},size=securityFeedSize(bounds.width||this.host.clientWidth,bounds.height||this.host.clientHeight);
    if(this.width!==size.width||this.height!==size.height||this.renderer.getPixelRatio()!==1){this.width=size.width;this.height=size.height;this.renderer.setPixelRatio(1);this.renderer.setSize(size.width,size.height,false);this.film.resize();this.dirty=true;}
  }
  shouldRender(dt,powerOn){
    if(!this.active||this.disposed)return false;
    if(this.power!==Boolean(powerOn)){this.power=Boolean(powerOn);this.dirty=true;}
    this.clock+=Number.isFinite(dt)?Math.max(0,dt):0;
    if(!this.dirty&&this.clock+1e-9<SECURITY_FRAME_INTERVAL)return false;
    this.clock=this.dirty?0:this.clock%SECURITY_FRAME_INTERVAL;this.dirty=false;return true;
  }
  draw(scene,{powerOn=false,baseExposure=.672,contactStrength=.45}={}){
    if(!this.active||this.disposed)return false;
    const exposure=this.renderer.toneMappingExposure,sensor=this.film.finish?.uniforms.securityInfrared,previousSensor=sensor?.value;
    const fog=scene.fog,previousFog=fog?.isFog?{near:fog.near,far:fog.far}:null;
    try{
      this.renderer.toneMappingExposure=baseExposure*(powerOn?1:18);if(sensor)sensor.value=powerOn?0:1;
      if(previousFog){fog.near=16;fog.far=50;}
      this.film.render(scene,this.camera,undefined,Math.min(.45,Math.max(0,contactStrength)));this.frames++;return true;
    }finally{this.renderer.toneMappingExposure=exposure;if(sensor)sensor.value=previousSensor;if(previousFog){fog.near=previousFog.near;fog.far=previousFog.far;}}
  }
  close(resize=true){
    if(!this.active)return;
    this.observer?.disconnect();const canvas=this.renderer.domElement,original=this.original,parent=original?.parent??this.home;
    if(parent){if(original?.next?.parentNode===parent)parent.insertBefore(canvas,original.next);else parent.appendChild(canvas);}
    if(original)canvas.style.cssText=original.cssText;
    this.active=false;this.host=null;this.original=null;this.width=null;this.height=null;this.clock=0;this.dirty=false;this.power=null;
    if(resize)this.resizePlayer();this.onChange(false,null);
  }
  dispose(){if(this.disposed)return;this.close(false);this.observer?.disconnect();this.disposed=true;this.cameras.length=0;this.observer=null;}
}
