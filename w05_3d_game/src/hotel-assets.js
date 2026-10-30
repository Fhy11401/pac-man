import * as THREE from '../vendor/three.module.js';

const files={paper:'damask-v270.png',wood:'walnut-v270.png',carpet:'carpet-v270.png',art:'paintings-v270.png'};
const images=new Map();
function sourceFor(key){
  if(!images.has(key))images.set(key,new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(new THREE.Source(image));image.onerror=()=>resolve(null);
    image.src=new URL('../assets/materials/'+files[key],import.meta.url).href;
  }));
  return images.get(key);
}

// Images decode once; atlas variants share a GPU source. Each scene owns its texture handles.
// A slider rebuild may dispose the old scene before decoding finishes: never attach to it.
export async function applyHotelAsset(material,key,{repeat=[1,1],offset=[0,0],bump=0}={}){
  let disposed=false;const onDispose=()=>{disposed=true;};material.addEventListener('dispose',onDispose);
  const source=await sourceFor(key);material.removeEventListener('dispose',onDispose);
  if(disposed||!source)return {key,loaded:false,disposed};
  const texture=new THREE.Texture();texture.source=source;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...repeat);texture.offset.set(...offset);texture.anisotropy=8;texture.needsUpdate=true;
  const previous=material.map;material.map=texture;
  if(bump){material.bumpMap=texture;material.bumpScale=bump;}
  previous?.dispose();material.needsUpdate=true;
  return {key,loaded:true};
}
