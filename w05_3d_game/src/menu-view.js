import * as THREE from '../vendor/three.module.js';

// A separate pose of the existing attendant shares every geometry, material and
// texture. Menu lighting/camera never touches the live enemy or jumpscare pose.
export class MenuView {
  constructor(sourceBody){
    this.scene=new THREE.Scene();this.scene.name='hotel-title-portrait';this.scene.background=new THREE.Color(0x020302);
    this.camera=new THREE.PerspectiveCamera(42,16/9,.045,8);this.camera.name='hotel-title-camera';
    this.portrait=sourceBody.clone(true);this.portrait.name='hotel-title-attendant';this.portrait.position.set(0,-1.54,-1.20);this.portrait.rotation.set(.012,-.18,0);this.portrait.scale.setScalar(1);this.scene.add(this.portrait);
    this.ambient=new THREE.AmbientLight(0xa6b2a3,.065);
    this.key=new THREE.PointLight(0xc8cbb8,.86,4,2);
    this.fill=new THREE.PointLight(0x788b82,.15,4,2);
    this.scene.add(this.ambient,this.key,this.fill);
    this.materials=new Map();this.portrait.traverse(object=>{for(const material of [object.material].flat())if(material?.isMeshStandardMaterial&&!this.materials.has(material))this.materials.set(material,material.envMapIntensity);});
    this.disposed=false;this.kind='menu';this.frames=0;this.configure('menu',16/9);
  }
  configure(outcome,aspect){
    this.kind=['lost','won'].includes(outcome)?outcome:'menu';
    const nextAspect=Number.isFinite(aspect)&&aspect>0?aspect:16/9;
    if(this.camera.aspect!==nextAspect){this.camera.aspect=nextAspect;this.camera.updateProjectionMatrix();}
    const distanceScale=Math.max(1,1.6/nextAspect),halfWidth=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*1.08*distanceScale*nextAspect;
    this.portrait.position.x=halfWidth*.52;this.portrait.position.z=-1.20*distanceScale;this.portrait.visible=this.kind!=='won';
    this.portrait.position.y=this.kind==='lost'?-1.525:-1.54;
    this.portrait.rotation.set(.012,this.kind==='lost'?-.105:-.18,this.kind==='lost'?-.018:0);
    const faceX=this.portrait.position.x;
    this.key.position.set(faceX+.47,.34,this.portrait.position.z+.68);this.fill.position.set(faceX-.46,.02,this.portrait.position.z+.85);
    this.key.color.setHex(this.kind==='lost'?0xb3453c:0xc8cbb8);this.key.intensity=this.kind==='lost'?.72:.86;
    this.fill.color.setHex(this.kind==='lost'?0x6b3432:0x788b82);this.fill.intensity=this.kind==='lost'?.10:.15;
    this.ambient.intensity=this.kind==='lost'?.045:.065;
    this.scene.background.setHex(this.kind==='lost'?0x050102:this.kind==='won'?0x080c0a:0x020302);
    this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
  }
  draw(renderer,film,outcome='menu',aspect=16/9){
    if(this.disposed)return false;
    this.configure(outcome,aspect);
    const exposure=renderer.toneMappingExposure,sensor=film.finish?.uniforms.securityInfrared,previousSensor=sensor?.value,previous=[];
    try{
      // The live scene can be powered off. Portrait reflection is calibrated
      // independently for this pass, then all shared material uniforms restore.
      for(const [material,base] of this.materials){previous.push([material,material.envMapIntensity]);material.envMapIntensity=base*.48;}
      renderer.toneMappingExposure=this.kind==='lost'?.62:this.kind==='won'?.48:.72;if(sensor)sensor.value=0;
      film.render(this.scene,this.camera,undefined,.20);this.frames++;return true;
    }finally{renderer.toneMappingExposure=exposure;if(sensor)sensor.value=previousSensor;for(const [material,value] of previous)material.envMapIntensity=value;}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.scene.clear();this.materials.clear();}
}
