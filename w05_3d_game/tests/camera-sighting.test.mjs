import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {CameraSighting} from '../src/camera-sighting.js';
function setup(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,16/9,.045,70),root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Object3D();
 camera.position.set(0,1.6,0);camera.lookAt(0,1.1,-5);root.position.z=-5;head.position.y=1.7;root.add(body,head);body.add(new THREE.Mesh(new THREE.BoxGeometry(.7,2,.5),new THREE.MeshBasicMaterial()));scene.add(root);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(3,3,.2),new THREE.MeshBasicMaterial());wall.position.set(5,1.3,-2.5);scene.add(wall);
 const detector=new CameraSighting(),rig={root,body,head};return{scene,camera,root,wall,rig,seen:()=>{scene.updateMatrixWorld(true);return detector.visible(scene,camera,rig);}};
}
test('camera samples reject offscreen, behind-camera, hidden and distant enemies',()=>{const f=setup();assert.equal(f.seen(),true);f.root.position.x=10;assert.equal(f.seen(),false);f.root.position.set(0,0,5);assert.equal(f.seen(),false);f.root.position.z=-50;assert.equal(f.seen(),false);f.root.position.z=-5;f.root.visible=false;assert.equal(f.seen(),false);});
test('opaque walls and a moving door block sightings, while partial cover can reveal the head',()=>{const f=setup();f.wall.position.x=0;assert.equal(f.seen(),false);f.wall.position.x=5;assert.equal(f.seen(),true);f.wall.position.x=0;f.wall.scale.y=.2;f.wall.position.y=.3;assert.equal(f.seen(),true);f.wall.scale.y=1;f.wall.position.y=1.3;assert.equal(f.seen(),false);f.wall.visible=false;assert.equal(f.seen(),true);});
test('transparent overlays do not conceal a visible enemy, but opaque materials do',()=>{const f=setup();f.wall.position.x=0;f.wall.material.transparent=true;f.wall.material.opacity=.1;assert.equal(f.seen(),true);f.wall.material.opacity=1;assert.equal(f.seen(),false);f.wall.material.visible=false;assert.equal(f.seen(),true);});

test('automatic scanning rebounds before a nearby wall fills the camera view',()=>{const f=setup(),sensor=new CameraSighting();f.wall.position.x=0;f.scene.updateMatrixWorld(true);const origin=new THREE.Vector3(0,1.6,0),direction=new THREE.Vector3(0,0,-1);assert.equal(sensor.nearWall(f.scene,origin,direction,f.root),true);f.wall.position.z=-4;f.scene.updateMatrixWorld(true);assert.equal(sensor.nearWall(f.scene,origin,direction,f.root),false);});
