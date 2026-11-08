import * as THREE from '../vendor/three.module.js';

// Short-range obscurance from the main render's depth. Half resolution, no
// second geometry pass and no temporal history that could ghost during turns.
export class ContactAO {
  constructor(depth){
    this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending,
      uniforms:{depthMap:{value:depth},inverseProjection:{value:new THREE.Matrix4()},projection:{value:new THREE.Matrix4()},size:{value:new THREE.Vector2()},radius:{value:.24}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`varying vec2 vUv;uniform sampler2D depthMap;
        uniform mat4 inverseProjection;uniform mat4 projection;uniform vec2 size;uniform float radius;
        vec3 pointAt(vec2 uv){float d=texture2D(depthMap,uv).x;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
        void main(){
          float depth=texture2D(depthMap,vUv).x;
          if(depth>=.999999){gl_FragColor=vec4(1.,100.,0.,1.);return;}
          vec3 p=pointAt(vUv),dx=dFdx(p),dy=dFdy(p);vec3 n=normalize(cross(dx,dy));
          if(dot(n,-p)<0.)n=-n;
          float noise=fract(52.9829189*fract(dot(floor(vUv*size),vec2(.06711056,.00583715))));
          vec2 projectedRadius=vec2(projection[0][0],projection[1][1])*radius/max(-p.z,.05)*.5;
          float obscurance=0.;
          for(int i=0;i<12;i++){
            float fi=float(i),a=fi*2.39996323+noise*6.2831853;
            vec2 uv=vUv+vec2(cos(a),sin(a))*projectedRadius*sqrt((fi+.5)/12.);
            if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
            vec3 delta=pointAt(uv)-p;float distance=length(delta);
            float horizon=max(dot(n,delta)/max(distance,.0001)-.10,0.);
            float range=1.-smoothstep(radius*.25,radius,distance);
            obscurance+=horizon*range;
          }
          gl_FragColor=vec4(clamp(1.-obscurance*.27,.50,1.),-p.z,0.,1.);
        }`});
  }
  resize(width,height){this.target.setSize(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));this.material.uniforms.size.value.set(this.target.width,this.target.height);}
  update(camera){this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);this.material.uniforms.projection.value.copy(camera.projectionMatrix);}
  dispose(){this.target.dispose();this.material.dispose();}
}
