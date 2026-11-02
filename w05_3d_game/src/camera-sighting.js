import * as THREE from '../vendor/three.module.js';
const shown=node=>{for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;};
const inside=(node,root)=>{for(let p=node;p;p=p.parent)if(p===root)return true;return false;};
// Three real body samples, checked against the same meshes and animated doors
// that produced the camera frame. No readback, global enemy radar or extra render.
export class CameraSighting{
 constructor(){this.focus=new THREE.Vector3();this.scene=null;this.meshes=[];this.blockers=[];this.ray=new THREE.Raycaster();this.points=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];this.ndc=new THREE.Vector3();this.direction=new THREE.Vector3();this.origin=new THREE.Vector3();this.hits=[];}
 collectBlockers(scene,root){
  if(this.scene!==scene){this.scene=scene;this.meshes=[];scene.traverse(n=>{if(n.isMesh)this.meshes.push(n);});}
  this.blockers.length=0;
  for(const mesh of this.meshes)if(shown(mesh)&&!inside(mesh,root))this.blockers.push(mesh);
  return this.blockers;
 }
 nearWall(scene,origin,direction,enemyRoot){
  this.ray.set(origin,direction);this.ray.near=.015;this.ray.far=3;this.hits.length=0;
  this.ray.intersectObjects(this.collectBlockers(scene,enemyRoot),false,this.hits);
  return this.hits.some(hit=>{const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;return m?.visible!==false&&(!m?.transparent||m.opacity>=.5);});
 }
 visible(scene,camera,rig){
  const root=rig?.root;if(!root||!shown(root))return false;
  camera.updateMatrixWorld(true);root.updateWorldMatrix(true,true);camera.getWorldPosition(this.origin);
  if(rig.head)rig.head.getWorldPosition(this.points[0]);else this.points[0].set(0,1.6,0).applyMatrix4(root.matrixWorld);
  this.points[1].set(0,1,0).applyMatrix4((rig.body??root).matrixWorld);
  this.points[2].set(0,.5,0).applyMatrix4((rig.body??root).matrixWorld);
  let blockers=null;
  for(const point of this.points){
   const distance=this.origin.distanceTo(point);if(distance<camera.near||distance>40)continue;
   this.ndc.copy(point).project(camera);if(Math.abs(this.ndc.x)>1||Math.abs(this.ndc.y)>1||Math.abs(this.ndc.z)>1)continue;
   this.direction.copy(point).sub(this.origin).normalize();this.ray.set(this.origin,this.direction);this.ray.near=0;this.ray.far=Math.max(0,distance-.025);this.hits.length=0;
   blockers??=this.collectBlockers(scene,root);
   this.ray.intersectObjects(blockers,false,this.hits);
   const blocked=this.hits.some(hit=>{const material=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;return material?.visible!==false&&(!material?.transparent||material.opacity>=.5);});
   if(!blocked){this.focus.copy(point);return true;}
  }
  return false;
 }
}
