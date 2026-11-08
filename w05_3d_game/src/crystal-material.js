import * as THREE from '../vendor/three.module.js';

// All fragments share one instanced transmissive material and the renderer's
// half-resolution scene-color capture. Thickness controls optical absorption;
// highlights and background distortion respond to the actual scene.
export function createCrystalMaterial(){
  const material=new THREE.MeshPhysicalMaterial({
    color:0xe3ccfa,metalness:0,roughness:.075,
    ior:1.68,specularIntensity:1,specularColor:0xf1e4ff,
    transmission:.90,thickness:.18,attenuationColor:0x8718c7,attenuationDistance:.24,
    emissive:0x8811cb,emissiveIntensity:.32,
    clearcoat:.5,clearcoatRoughness:.08,envMapIntensity:1.15,
    transparent:false,depthWrite:true,
  });
  material.name='refractive-memory-glass';
  // r180 keeps camera transmission targets in an internal WeakMap. Release
  // this view's capture before destroying its renderer, including HDR variants.
  const samplers=new Set();
  material.onBeforeCompile=shader=>samplers.add(shader.uniforms.transmissionSamplerMap);
  material.addEventListener('dispose',()=>{
    const targets=new Set([...samplers].map(uniform=>uniform?.value?.renderTarget).filter(Boolean));
    targets.forEach(target=>target.dispose());samplers.clear();
  });
  return material;
}
