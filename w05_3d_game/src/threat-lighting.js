// A shared exposure uniform darkens the face even under security infrared.
// Geometry/textures remain shared, and no shader recompilation occurs per frame.
export function enableThreatShadow(material){
  const exposure={value:1};material.userData.threatExposure=exposure;
  material.onBeforeCompile=shader=>{
    shader.uniforms.threatExposure=exposure;
    shader.fragmentShader='uniform float threatExposure;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb *= threatExposure;\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey=()=>'hotel-threat-shadow-v1';
}
export function setThreatExposure(materials={},value){
  for(const material of Object.values(materials))if(material?.userData?.threatExposure)material.userData.threatExposure.value=value;
}
