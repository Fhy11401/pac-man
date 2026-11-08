import * as THREE from '../vendor/three.module.js';
import {applyHotelAsset} from './hotel-assets.js';

// These are coordinates in the unmodified reference PNG, measured from its
// top-left corner. This photograph patch is separate from the rebuilt tiles.
export const REFERENCE_PHOTO=Object.freeze({
  width:2132,height:1202,
  corners:Object.freeze({
    topLeft:Object.freeze([1710,300]),topRight:Object.freeze([2120,153]),
    bottomRight:Object.freeze([2120,985]),bottomLeft:Object.freeze([1710,780]),
  }),
});

function photoHomography(){
  const {width,height,corners}=REFERENCE_PHOTO;
  // Plane UV (0,0) is bottom-left. Image coordinates are top-left, while a
  // normal Three Texture upload flips the source Y axis into bottom-left UV.
  const points=[corners.bottomLeft,corners.bottomRight,corners.topRight,corners.topLeft].map(([x,y])=>[x/width,1-y/height]);
  const [p0,p1,p2,p3]=points,dx1=p1[0]-p2[0],dx2=p3[0]-p2[0],dx3=p0[0]-p1[0]+p2[0]-p3[0];
  const dy1=p1[1]-p2[1],dy2=p3[1]-p2[1],dy3=p0[1]-p1[1]+p2[1]-p3[1],denominator=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/denominator,h=(dx1*dy3-dx3*dy1)/denominator;
  return new THREE.Matrix3().set(
    p1[0]-p0[0]+g*p1[0],p3[0]-p0[0]+h*p3[0],p0[0],
    p1[1]-p0[1]+g*p1[1],p3[1]-p0[1]+h*p3[1],p0[1],
    g,h,1,
  );
}

const projection=photoHomography();

// CPU counterpart used to verify corner correspondence and the sampled region.
export function referencePhotoUv(u,v){
  const point=new THREE.Vector3(u,v,1).applyMatrix3(projection);
  return new THREE.Vector2(point.x/point.z,point.y/point.z);
}

let sourcePromise;
function photoSource(){
  if(!sourcePromise)sourcePromise=new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(new THREE.Source(image));image.onerror=()=>resolve(null);
    image.src=new URL('../assets/materials/reference/source-reference.png',import.meta.url).href;
  });
  return sourcePromise;
}

async function loadPhoto(material){
  let disposed=false;const onDispose=()=>{disposed=true;};material.addEventListener('dispose',onDispose);
  const source=await photoSource();material.removeEventListener('dispose',onDispose);
  if(disposed||!source)return{key:'referencePhoto',loaded:false,disposed};
  const texture=new THREE.Texture();texture.source=source;texture.name='reference/source-reference.png';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.anisotropy=8;texture.userData.hotelAssetOwned=true;texture.needsUpdate=true;
  material.map=texture;material.needsUpdate=true;
  return{key:'referencePhoto',loaded:true,channels:['map'],source:'unmodified user reference',projection:'homography'};
}

export function createReferencePhotoMaterial(assetJobs=[]){
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color(4.5,4.5,4.5),roughness:.96,metalness:0,envMapIntensity:.06});
  material.name='original-reference-wallpaper';
  material.userData.referencePhoto={...REFERENCE_PHOTO,source:'reference/source-reference.png'};
  material.onBeforeCompile=shader=>{
    shader.uniforms.referencePhotoHomography={value:projection};
    shader.fragmentShader='uniform mat3 referencePhotoHomography;\n'+shader.fragmentShader;
    // Project in the fragment shader, after perspective-correct plane UV
    // interpolation. Both triangles therefore evaluate the same rational map;
    // baking four corner UVs alone would leave a diagonal distortion seam.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec3 photoPosition=referencePhotoHomography*vec3(vMapUv,1.0);
        vec4 sampledDiffuseColor=texture2D(map,photoPosition.xy/photoPosition.z);
        diffuseColor*=sampledDiffuseColor;
      #endif
    `);
  };
  material.customProgramCacheKey=()=> 'reference-photo-homography-v1';
  assetJobs.push(loadPhoto(material),applyHotelAsset(material,'fabric',{repeat:[3,6.6],normalScale:.065}));
  return material;
}
