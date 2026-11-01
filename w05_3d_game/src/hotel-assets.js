import * as THREE from '../vendor/three.module.js';

const fabric={normalMap:'pbr/Fabric030_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/Fabric030_1K-JPG_Roughness.jpg'};
const files={
  paper:{map:'damask-v290.png',...fabric,normalScale:.10,detailMultiplier:10},
  referenceWood:{map:'pbr/Wood051_1K-JPG_Color.jpg',normalMap:'pbr/Wood051_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/Wood051_1K-JPG_Roughness.jpg',normalScale:.18,rotation:Math.PI/2},
  referencePlaster:{map:'pbr/PaintedPlaster017_1K-JPG_Color.jpg',normalMap:'pbr/PaintedPlaster017_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/PaintedPlaster017_1K-JPG_Roughness.jpg',normalScale:.15},
  wood:{map:'pbr/Wood051_1K-JPG_Color.jpg',normalMap:'pbr/Wood051_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/Wood051_1K-JPG_Roughness.jpg',normalScale:.28,rotation:Math.PI/2},
  plaster:{map:'pbr/PaintedPlaster017_1K-JPG_Color.jpg',normalMap:'pbr/PaintedPlaster017_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/PaintedPlaster017_1K-JPG_Roughness.jpg',normalScale:.20},
  leather:{normalMap:'pbr/Leather037_1K-JPG_NormalGL.jpg',roughnessMap:'pbr/Leather037_1K-JPG_Roughness.jpg',normalScale:.32},
  fabric:{...fabric,normalScale:.24},
  carpet:{map:'carpet-v280.png',...fabric,normalScale:.25,detailMultiplier:10},
  art:{map:'paintings-v270.png'},
};
const channels=['map','normalMap','roughnessMap'];
const images=new Map();
function sourceFor(file){
  if(!images.has(file))images.set(file,new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(new THREE.Source(image));image.onerror=()=>resolve(null);
    image.src=new URL('../assets/materials/'+file,import.meta.url).href;
  }));
  return images.get(file);
}

// Color, tangent-space normals and roughness are separate source files, never inferred from color.
// Images decode once by filename; atlas variants and microdetail layers share a GPU source.
// Each scene owns its texture handles. NormalGL and roughness remain linear (NoColorSpace).
// A slider rebuild may dispose the old scene before decoding finishes: never attach to it.
export async function applyHotelAsset(material,key,{repeat=[1,1],offset=[0,0],bump=0,detailRepeat,normalScale,rotation}={}){
  const asset=files[key];if(!asset)return {key,loaded:false,reason:'unknown asset'};
  let disposed=false;const onDispose=()=>{disposed=true;};material.addEventListener('dispose',onDispose);
  const names=channels.filter(name=>asset[name]),sources=await Promise.all(names.map(name=>sourceFor(asset[name])));
  material.removeEventListener('dispose',onDispose);
  if(disposed||sources.some(source=>!source))return {key,loaded:false,disposed};
  const previousMap=material.map,previousTextures=new Set();
  for(let i=0;i<names.length;i++){
    const channel=names[i],texture=new THREE.Texture();texture.source=sources[i];texture.name=asset[channel];
    texture.colorSpace=channel==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    const uvRepeat=channel==='map'?repeat:detailRepeat??repeat.map(value=>value*(asset.detailMultiplier??1));
    texture.repeat.set(...uvRepeat);texture.offset.set(...offset);texture.rotation=(rotation??asset.rotation??0)+(channel==='map'?0:asset.detailRotation??0);
    // Atlas offsets are measured from (0,0); only a rotated surface pivots around its center.
    if(texture.rotation)texture.center.set(.5,.5);
    texture.anisotropy=8;texture.needsUpdate=true;texture.userData.hotelAssetOwned=true;
    if(material[channel]?.userData.hotelAssetOwned)previousTextures.add(material[channel]);material[channel]=texture;
  }
  if(names.includes('normalMap')){
    const strength=normalScale??asset.normalScale??1;material.normalScale.set(...(Array.isArray(strength)?strength:[strength,strength]));
    if(material.bumpMap?.userData.hotelAssetOwned)previousTextures.add(material.bumpMap);material.bumpMap=null;
  }else if(bump&&names.includes('map')){material.bumpMap=material.map;material.bumpScale=bump;}
  // The fallback color maps are material-owned; other fallback maps may be shared grain textures.
  // Do not dispose a shared roughness/bump fallback just because one material has upgraded.
  if(names.includes('map')&&previousMap)previousTextures.add(previousMap);
  const retained=new Set(Object.values(material).filter(value=>value?.isTexture));
  for(const texture of previousTextures)if(!retained.has(texture))texture.dispose();
  material.needsUpdate=true;
  return {key,loaded:true,channels:names};
}
