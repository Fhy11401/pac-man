import * as THREE from '../vendor/three.module.js';
import {ContactAO} from './contact-ao.js';

const vertex=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const material=(fragment,uniforms)=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});

// HDR light diffusion at one sixteenth of the scene's pixel count. One scene
// render, a bright pass, two separable blurs, then a single tone/color conversion.
// No history buffer, camera blur, chromatic fringe or animated film grain.
export class FilmLight {
  constructor(renderer){
    this.renderer=renderer;this.enabled=renderer.extensions.has('EXT_color_buffer_float');
    if(!this.enabled)return;
    const gl=renderer.getContext();
    this.color=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,gl.getParameter(gl.MAX_SAMPLES)),depthBuffer:true,stencilBuffer:false});
    this.color.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.color.resolveDepthBuffer=true;
    this.contact=new ContactAO(this.color.depthTexture);
    this.a=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});this.b=this.a.clone();
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.geometry=new THREE.PlaneGeometry(2,2);this.quad=new THREE.Mesh(this.geometry);this.quad.frustumCulled=false;this.scene.add(this.quad);
    this.bright=material(`varying vec2 vUv;uniform sampler2D source;uniform vec2 texel;
      vec3 lightAt(vec2 uv){vec3 c=texture2D(source,uv).rgb;float b=max(c.r,max(c.g,c.b));float soft=clamp((b-.8)/.8,0.,1.);return c*max(b-1.2,soft*soft*.20)/max(b,.0001);}
      void main(){vec3 c=lightAt(vUv)*.4;c+=lightAt(vUv+texel*vec2(-1.,-1.))*.15;c+=lightAt(vUv+texel*vec2(1.,-1.))*.15;c+=lightAt(vUv+texel*vec2(-1.,1.))*.15;c+=lightAt(vUv+texel*vec2(1.,1.))*.15;gl_FragColor=vec4(min(c,vec3(12.)),1.);}`,
      {source:{value:this.color.texture},texel:{value:new THREE.Vector2()}});
    this.blur=material(`varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;
      void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=(texture2D(source,vUv+direction*1.384615).rgb+texture2D(source,vUv-direction*1.384615).rgb)*.316216;c+=(texture2D(source,vUv+direction*3.230769).rgb+texture2D(source,vUv-direction*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`,
      {source:{value:this.a.texture},direction:{value:new THREE.Vector2()}});
    this.finish=material(`varying vec2 vUv;uniform sampler2D source;uniform sampler2D bloom;uniform float strength;
      uniform sampler2D contactMap;uniform sampler2D depthMap;uniform mat4 inverseProjection;uniform vec2 contactTexel;uniform float contactStrength;
      float contactVisibility(){
        float d=texture2D(depthMap,vUv).x;vec4 p=inverseProjection*vec4(vUv*2.-1.,d*2.-1.,1.);float z=-p.z/p.w;
        float total=0.,weight=0.;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          vec2 s=texture2D(contactMap,vUv+vec2(float(x),float(y))*contactTexel).rg;
          float w=exp(-abs(s.y-z)*45.)/(1.+float(x*x+y*y));total+=s.x*w;weight+=w;
        }
        return weight>.001?total/weight:1.;
      }
      void main(){vec3 base=texture2D(source,vUv).rgb;
        float ao=1.;if(contactStrength>0.)ao=mix(1.,contactVisibility(),contactStrength);vec3 c=base*ao+texture2D(bloom,vUv).rgb*strength;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,{source:{value:this.color.texture},bloom:{value:this.a.texture},strength:{value:.12},contactMap:{value:this.contact.target.texture},depthMap:{value:this.color.depthTexture},inverseProjection:{value:new THREE.Matrix4()},contactTexel:{value:new THREE.Vector2()},contactStrength:{value:.85}});
    this.finish.toneMapped=true;
    this.size=new THREE.Vector2();this.resize();
  }
  resize(){
    if(!this.enabled)return;this.renderer.getDrawingBufferSize(this.size);
    const width=this.size.x,height=this.size.y,w=Math.max(1,Math.ceil(width/4)),h=Math.max(1,Math.ceil(height/4));
    this.color.setSize(width,height);this.a.setSize(w,h);this.b.setSize(w,h);this.bright.uniforms.texel.value.set(1/width,1/height);this.blurWidth=w;this.blurHeight=h;
    this.contact.resize(width,height);this.finish.uniforms.contactTexel.value.set(1/this.contact.target.width,1/this.contact.target.height);
  }
  warmup(scene,camera,scareScene,scareCamera){
    const r=this.renderer,previous=r.getRenderTarget();
    if(!this.enabled){r.compile(scene,camera);r.compile(scareScene,scareCamera);return;}
    // Shader variants depend on render target (HDR has no in-material tone map).
    // Compile the actual gameplay variants before input, not their screen variants.
    try{
      r.setRenderTarget(this.color);r.compile(scene,camera);r.compile(scareScene,scareCamera);
      for(const m of [this.bright,this.blur,this.contact.material]){this.quad.material=m;r.setRenderTarget(this.a);r.compile(this.scene,this.camera);}
      this.quad.material=this.finish;r.setRenderTarget(null);r.compile(this.scene,this.camera);
    }finally{r.setRenderTarget(previous);}
  }
  render(scene,camera,overlay,contactStrength=.85){
    const r=this.renderer;
    // Respect caller-owned targets used by diagnostics or future reflection captures.
    if(!this.enabled||r.getRenderTarget()){r.render(scene,camera);overlay?.();return;}
    const autoReset=r.info.autoReset;r.info.autoReset=true;
    r.setRenderTarget(this.color);r.render(scene,camera);r.info.autoReset=false;
    this.contact.update(camera);this.finish.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);this.finish.uniforms.contactStrength.value=contactStrength;
    if(contactStrength>0.){this.quad.material=this.contact.material;r.setRenderTarget(this.contact.target);r.render(this.scene,this.camera);}
    // Resolve world depth before the scare overlay clears it. Scares bypass AO.
    const autoClear=r.autoClear;r.autoClear=false;r.setRenderTarget(this.color);overlay?.();r.autoClear=autoClear;
    this.quad.material=this.bright;r.setRenderTarget(this.a);r.render(this.scene,this.camera);
    this.quad.material=this.blur;this.blur.uniforms.source.value=this.a.texture;this.blur.uniforms.direction.value.set(1.6/this.blurWidth,0);r.setRenderTarget(this.b);r.render(this.scene,this.camera);
    this.blur.uniforms.source.value=this.b.texture;this.blur.uniforms.direction.value.set(0,1.6/this.blurHeight);r.setRenderTarget(this.a);r.render(this.scene,this.camera);
    this.quad.material=this.finish;r.setRenderTarget(null);r.render(this.scene,this.camera);r.info.autoReset=autoReset;
  }
  dispose(){if(!this.enabled)return;this.contact.dispose();for(const target of [this.color,this.a,this.b])target.dispose();for(const m of [this.bright,this.blur,this.finish])m.dispose();this.geometry.dispose();}
}
