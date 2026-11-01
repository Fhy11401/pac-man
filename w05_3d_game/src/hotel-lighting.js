import * as THREE from '../vendor/three.module.js';
import {MAP,isOpen,edgeIsOpen} from './world.js';

// A tiny, prefiltered room probe gives varnish, brass and crystal a real reflection
// response. Built once per renderer, never captured during gameplay.
export function hotelEnvironment(renderer){
  const room=new THREE.Scene();room.background=new THREE.Color(.035,.029,.022);
  const geometry=new THREE.BoxGeometry(1,1,1),materials=[];
  const panel=(colour,intensity,x,y,z,sx,sy,sz)=>{
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(colour).multiplyScalar(intensity),side:THREE.DoubleSide});materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);room.add(mesh);
  };
  panel('#bdb3a0',.16,0,0,0,8,6,18);
  // Warm overhead bowls and the long, soft reflections on painted wall joinery.
  for(const z of [-6,0,6])panel('#fff0d2',4.5,0,2.8,z,1.3,.025,1.3);
  panel('#d9c3a0',.60,-3.8,.4,0,.02,2.6,12);
  panel('#a7b1ac',.24,3.8,.7,0,.02,2.2,12);
  const generator=new THREE.PMREMGenerator(renderer);
  const target=generator.fromScene(room,.06,.1,30,{size:128});
  generator.dispose();geometry.dispose();materials.forEach(m=>m.dispose());
  return target;
}

function stripTexture(){
  const canvas=document.createElement('canvas');canvas.width=8;canvas.height=128;
  const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.18,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,8,128);
  return new THREE.CanvasTexture(canvas);
}

// Static contact occlusion, in two instanced draws. This adds depth at skirting
// and ceiling joints without a full-resolution screen-space AO pass.
export function addContactOcclusion(view,world,unit){
  const edges=[];
  MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{if(tile==='#')return;
    for(const d of [{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}])if(!edgeIsOpen({x,z},{x:x+d.x,z:z+d.z})&&!isOpen(x+d.x,z+d.z))edges.push({x,z,...d,cellX:x,cellZ:z});
  }));
  const material=new THREE.MeshBasicMaterial({map:stripTexture(),transparent:true,depthWrite:false,toneMapped:false,opacity:.30,polygonOffset:true,polygonOffsetFactor:-1});
  const floor=new THREE.InstancedMesh(new THREE.PlaneGeometry(unit,.18),material,edges.length);
  const ceiling=new THREE.InstancedMesh(new THREE.PlaneGeometry(unit,.12).rotateZ(Math.PI),material,edges.length);
  const dummy=new THREE.Object3D();
  edges.forEach((e,i)=>{
    const along=.5-view.wallInset;
    dummy.position.copy(world(e.cellX+e.x*(along-.09/unit),e.cellZ+e.z*(along-.09/unit),.018));
    dummy.rotation.set(-Math.PI/2,0,e.a);dummy.updateMatrix();floor.setMatrixAt(i,dummy.matrix);
    dummy.position.copy(world(e.cellX+e.x*(along-.06/unit),e.cellZ+e.z*(along-.06/unit),view.ceilingHeight-.012));
    dummy.rotation.set(Math.PI/2,0,-e.a);dummy.updateMatrix();ceiling.setMatrixAt(i,dummy.matrix);
  });
  floor.name='skirting-contact-occlusion';ceiling.name='ceiling-contact-occlusion';
  floor.computeBoundingSphere();ceiling.computeBoundingSphere();view.scene.add(floor,ceiling);
}

// Restrained optical glow around the ten nearby ceiling fixtures, one draw.
// Depth testing lets actual walls/doors occlude it; no full-screen blur pass.
export function lampHalos(count){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d'),g=c.createRadialGradient(32,32,2,32,32,32);
  g.addColorStop(0,'rgba(255,237,192,.48)');g.addColorStop(.32,'rgba(255,231,179,.17)');g.addColorStop(1,'rgba(255,224,160,0)');c.fillStyle=g;c.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,opacity:.32,toneMapped:false}),count);
  mesh.name='nearby-lamp-halos';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);return mesh;
}
