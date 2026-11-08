import * as THREE from '../vendor/three.module.js';

export const FRIENDLY_MOSAIC_ROWS=30;
export function mosaicGrid(width,height){
  const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1),rows=Math.min(FRIENDLY_MOSAIC_ROWS,Math.floor(h));
  return{x:Math.max(1,Math.min(Math.floor(w),Math.round(rows*w/h))),y:rows};
}

// Presentation only. A stationary creature still needs a new shadow map when a
// door lifts, swings or flexes; none of these visual options touch AI lighting.
export function updateEnemyWarning(light,previous,{x,z,heading,enabled,friendly=false,doorProgress=0,roomDoors={}}){
  // The friendly cone's highest ray still slopes down: a floor warning without
  // washing the ceiling or revealing the upper corridor in a blackout.
  const reach=friendly?2.6:5;
  light.position.set(x,1.05,z);light.target.position.set(x+Math.sin(heading)*reach,.03,z+Math.cos(heading)*reach);
  light.angle=friendly?Math.PI/10.5:Math.PI/5.2;light.distance=friendly?7:12;light.penumbra=friendly?.42:.3;
  light.intensity=enabled?(friendly?60:110):0;
  if(!enabled){light.shadow.needsUpdate=false;previous.enabled=false;return;}
  const occlusion=[doorProgress,...Object.keys(roomDoors).sort().flatMap(id=>[id,roomDoors[id]?.progress??1,roomDoors[id]?.bashPulse??0])].join('/');
  if(!previous.enabled||previous.friendly!==friendly||Math.abs(x-previous.x)>1e-6||Math.abs(z-previous.z)>1e-6||Math.abs(heading-previous.heading)>1e-6||previous.occlusion!==occlusion){
    light.shadow.needsUpdate=true;Object.assign(previous,{enabled:true,friendly,x,z,heading,occlusion});
  }
}

// Twelve small screen-space line quads: one draw, no extra render target and no
// duplicated enemy mesh. Corner brackets stay outside the face at any distance.
export class EnemyXray {
  constructor(){
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(72*3),3).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.MeshBasicMaterial({color:0xffda8a,transparent:true,opacity:.88,depthTest:false,depthWrite:false,toneMapped:false});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.scene.add(this.mesh);
    this.size=new THREE.Vector2();this.origin=new THREE.Vector3();this.point=new THREE.Vector3();this.frames=0;this.disposed=false;
  }
  warmup(renderer){if(!this.disposed)renderer.compile(this.scene,this.camera);}
  draw(renderer,camera,enemy){
    if(this.disposed||!enemy?.visible)return false;
    enemy.getWorldPosition(this.origin);this.point.copy(this.origin).applyMatrix4(camera.matrixWorldInverse);if(this.point.z>=-.08)return false;
    renderer.getDrawingBufferSize(this.size);const ratio=renderer.getPixelRatio(),width=this.size.x/ratio,height=this.size.y/ratio;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const sx of [-1,1])for(const sz of [-1,1])for(const y of [.02,2.01]){
      this.point.set(this.origin.x+sx*.40,this.origin.y+y,this.origin.z+sz*.27).project(camera);
      const x=(this.point.x*.5+.5)*width,py=(.5-this.point.y*.5)*height;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,py);bottom=Math.max(bottom,py);
    }
    if(![left,right,top,bottom].every(Number.isFinite)||right<0||left>width||bottom<0||top>height)return false;
    const cx=(left+right)/2,cy=(top+bottom)/2,halfW=Math.max(9,(right-left)/2+6),halfH=Math.max(15,(bottom-top)/2+6);left=cx-halfW;right=cx+halfW;top=cy-halfH;bottom=cy+halfH;
    const lx=Math.min(18,halfW*.45),ly=Math.min(18,halfH*.30),segments=[];
    for(const x of [left,right])for(const y of [top,bottom]){segments.push([x,y,x+(x===left?lx:-lx),y],[x,y,x,y+(y===top?ly:-ly)]);}
    const diamond=[[cx,top-17],[cx+4,top-13],[cx,top-9],[cx-4,top-13]];diamond.forEach((p,i)=>segments.push([...p,...diamond[(i+1)%4]]));
    const positions=this.geometry.attributes.position;let vertex=0;
    for(const [x0,y0,x1,y1] of segments){const length=Math.hypot(x1-x0,y1-y0),nx=-(y1-y0)/length,ny=(x1-x0)/length,points=[[x0+nx,y0+ny],[x1+nx,y1+ny],[x1-nx,y1-ny],[x0-nx,y0-ny]];
      for(const index of [0,1,2,0,2,3]){const [x,y]=points[index];positions.setXYZ(vertex++,x/width*2-1,1-y/height*2,0);}
    }
    positions.needsUpdate=true;
    const clear=renderer.autoClear,reset=renderer.info.autoReset;
    try{renderer.autoClear=false;renderer.info.autoReset=false;renderer.render(this.scene,this.camera);this.frames++;return true;}
    finally{renderer.autoClear=clear;renderer.info.autoReset=reset;}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.geometry.dispose();this.material.dispose();this.scene.clear();}
}

// Devices without an HDR renderable target still get actual pixelation. This
// tiny nearest-filtered target is used only for the short friendly scare pass.
export class MosaicFallback {
  constructor(renderer){
    this.renderer=renderer;this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);this.geometry=new THREE.PlaneGeometry(2,2);
    this.material=new THREE.ShaderMaterial({uniforms:{source:{value:this.target.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,vUv);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:true});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.scene.add(this.mesh);this.size=new THREE.Vector2();this.disposed=false;
  }
  resize(){this.renderer.getDrawingBufferSize(this.size);const grid=mosaicGrid(this.size.x,this.size.y);if(this.target.width!==grid.x||this.target.height!==grid.y)this.target.setSize(grid.x,grid.y);}
  warmup(scene,camera,overlayScene,overlayCamera){const r=this.renderer,target=r.getRenderTarget();try{this.resize();r.setRenderTarget(this.target);r.compile(scene,camera);r.compile(overlayScene,overlayCamera);r.setRenderTarget(null);r.compile(this.scene,this.camera);}finally{r.setRenderTarget(target);}}
  render(scene,camera,overlay){
    const r=this.renderer,target=r.getRenderTarget(),clear=r.autoClear,reset=r.info.autoReset;
    try{this.resize();r.setRenderTarget(this.target);r.render(scene,camera);r.autoClear=false;r.info.autoReset=false;overlay?.();r.autoClear=clear;r.setRenderTarget(target);r.render(this.scene,this.camera);}
    finally{r.setRenderTarget(target);r.autoClear=clear;r.info.autoReset=reset;}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.target.dispose();this.geometry.dispose();this.material.dispose();this.scene.clear();}
}
