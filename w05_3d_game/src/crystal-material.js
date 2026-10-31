import * as THREE from '../vendor/three.module.js';

// One depth-tested draw with view-dependent internal facets. This is an optical approximation,
// not screen-space refraction: it samples the scene's existing environment, not a second
// scene capture, so 106 shards keep their shared instancing and normal depth occlusion.
export function createCrystalMaterial(){
  const material=new THREE.MeshPhysicalMaterial({
    color:0x230b30,vertexColors:true,metalness:.02,roughness:.085,
    ior:1.83,specularIntensity:1,specularColor:0xe6c5ff,
    emissive:0x17031f,emissiveIntensity:.08,
    clearcoat:.78,clearcoatRoughness:.055,envMapIntensity:1.8,
    transmission:0,transparent:true,depthWrite:true,
  });
  material.name='faceted-memory-glass';
  material.onBeforeCompile=shader=>{
    const varying='varying vec3 vCrystalPosition; varying vec3 vCrystalNormal; varying vec3 vCrystalView; varying float vCrystalFacet;';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float crystalFacet;\n'+varying)
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCrystalPosition=position;vCrystalNormal=normal;vCrystalFacet=crystalFacet;')
      .replace('#include <project_vertex>',`#include <project_vertex>
        mat3 crystalBasis=mat3(modelViewMatrix);
        #ifdef USE_INSTANCING
          crystalBasis=mat3(modelViewMatrix*instanceMatrix);
        #endif
        vCrystalView=normalize(transpose(crystalBasis)*(-mvPosition.xyz));
      `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+varying)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        vec3 crystalView=normalize(vCrystalView);
        vec3 crystalRay=refract(-crystalView,normalize(vCrystalNormal),.55);
        // A refracted ray crosses fixed internal cuts. Their occlusion/parallax varies
        // with the viewing angle; no animated noise or uniformly glowing purple surface.
        vec3 q=(vCrystalPosition+crystalRay*(.075+.035*vCrystalFacet))/vec3(.085,.30,.085);
        float diagonal=q.y+q.x*.65+q.z*.22;
        float crosscut=q.x-q.y*.25-q.z*.40;
        float cutA=(1.-smoothstep(.10,.23,abs(diagonal+.16)))*smoothstep(-.15,-.03,crosscut);
        float cutB=(1.-smoothstep(.065,.15,abs(diagonal-.50)))*(1.-smoothstep(.08,.20,crosscut));
        float internalFacet=cutA+cutB*.75;
        float depthAbsorption=.65+.35*smoothstep(.12,.9,abs(q.y));
        float facing=clamp(dot(normal,normalize(vViewPosition)),0.,1.);
        float rim=pow(1.-facing,3.);
        float glint=pow(clamp(abs(dot(crystalRay,normalize(vec3(.61,.44,-.66)))),0.,1.),12.);
        float innerLight=exp(-pow(q.x+.2,2.)*2.8-pow(q.y+.1,2.)*1.8);
        vec3 opticalCore=vec3(1.10,.008,1.72)*internalFacet*(.24+innerLight*.95+glint*.9)*depthAbsorption;
        #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
          vec3 viewRay=refract(-normalize(vViewPosition),normal,.55);
          vec3 worldRay=inverseTransformDirection(viewRay,viewMatrix);
          vec3 innerReflection=textureCubeUV(envMap,envMapRotation*worldRay,.12).rgb;
          opticalCore+=innerReflection*vec3(.27,.008,.43)*(.24+internalFacet*.8);
        #endif
        totalEmissiveRadiance+=opticalCore+vec3(.65,.003,.96)*rim*.22;
        diffuseColor.rgb*=.38+.25*internalFacet;
        diffuseColor.a*=clamp(.69+rim*.22+internalFacet*.25,.69,.98);
      `);
  };
  material.customProgramCacheKey=()=> 'memory-glass-v281-1';
  return material;
}
