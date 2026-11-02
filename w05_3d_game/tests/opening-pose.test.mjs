import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {attendantMaterials,createAttendant,cloneAttendant} from '../src/enemy-model.js';
import {poseAttendant,sampleAttendantGait} from '../src/attendant-motion.js';
import {prepareOpeningBody,poseOpeningCrawl,openingWalk,anchorOpeningNeck} from '../src/opening-scene.js';
import {OPENING_REVEAL_AT} from '../src/scare-timing.js';
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
const materials=attendantMaterials(),source=createAttendant(materials),model=cloneAttendant(source),copies=prepareOpeningBody(model);
test('opening body has its own readable materials; facial masking and gameplay assets stay independent',()=>{
 assert.notEqual(copies.get(materials.coat),materials.coat);assert(copies.get(materials.coat).color.r>materials.coat.color.r);
 assert.equal(copies.get(materials.porcelain).userData.threatExposure,undefined);
 assert.equal(source.body.children[0].morphTargetInfluences,undefined);
 const collar=model.body.children.find(o=>o.isMesh&&o.position.y>1);assert(collar);assert.equal(collar.morphTargetInfluences,undefined,'collar geometry uses its own local origin and must not deform with the hem');
 assert.notEqual(model.body.children[0].geometry,source.body.children[0].geometry);
 assert.equal(model.head.children[1].material,source.head.children[1].material);
 for(let t=0;t<OPENING_REVEAL_AT;t+=.01)assert.equal(openingWalk(t).faceExposure,0);
 assert.equal(openingWalk(OPENING_REVEAL_AT).faceExposure,1);
});
test('folding and crawling keep hips attached, limb lengths fixed and rendered surfaces above the floor',()=>{
 const point=new THREE.Vector3(),hip=new THREE.Vector3();let minimum=Infinity;
 for(let t=7.55;t<10.55;t+=.025){
   for(const l of model.limbs){l.node.position.z=0;l.node.rotation.z=0;}
   poseAttendant(model,sampleAttendantGait(0,0,0,0));const pose=openingWalk(t);poseOpeningCrawl(model,pose,t);
   model.head.rotation.x=-model.body.rotation.x;anchorOpeningNeck(model);model.root.updateMatrixWorld(true);
   const neck=new THREE.Vector3(0,-.18,-.02).applyMatrix4(model.head.matrix);assert(neck.distanceTo(new THREE.Vector3(0,1.46,.006))<1e-9,'neck base remains attached while head counter-rotates');
   for(const l of model.limbs.filter(l=>l.leg)){
     hip.set(l.side*.13,.8,0).applyMatrix4(model.body.matrix);if(pose.crawl>0)assert(hip.distanceTo(l.node.position)<1e-9);
     assert.equal(l.knee.position.length(),.38);assert.equal(l.ankle.position.length(),.38);
   }
   model.root.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,m=o.geometry.morphAttributes.position?.[0],w=o.morphTargetInfluences?.[0]??0;
     for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i);if(m&&w){point.x+=(m.getX(i)-point.x)*w;point.y+=(m.getY(i)-point.y)*w;point.z+=(m.getZ(i)-point.z)*w;}point.applyMatrix4(o.matrixWorld);minimum=Math.min(minimum,point.y);assert(point.y>=-.002,`${o.parent.name}: floor intersection at ${t.toFixed(3)} (${point.y})`);}
   });
 }
 assert(minimum<.08,'grounded rather than floating');
});
