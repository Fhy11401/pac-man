import {CELL_SIZE} from './world.js';
import * as THREE from '../vendor/three.module.js';
import {securityRoomFurniture} from './security-room-layout.js';
import {knockdownPose} from './room-items.js';

export function createItemModel(kind){
  const root=new THREE.Group();root.name=`pickup-${kind}`;
  const wood=new THREE.MeshStandardMaterial({color:0x9a6136,roughness:.65});
  const rubber=new THREE.MeshStandardMaterial({color:0x1c252a,roughness:.7});
  const metal=new THREE.MeshStandardMaterial({color:0xabb8bd,roughness:.28,metalness:.82});
  const tape=new THREE.MeshStandardMaterial({color:0xcfc9b4,roughness:.95});
  const mesh=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  const tube=(points,r,material)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),material);
  if(kind==='stick'){
    mesh(new THREE.BoxGeometry(.83,.026,.026),wood,-.04,.017,0);
    const blade=new THREE.Shape();blade.moveTo(.34,-.014);blade.lineTo(.39,-.014);blade.quadraticCurveTo(.45,.02,.43,.085);blade.lineTo(.28,.13);blade.quadraticCurveTo(.24,.13,.26,.08);blade.lineTo(.37,.05);blade.closePath();
    const shape=new THREE.ExtrudeGeometry(blade,{depth:.018,bevelEnabled:true,bevelSize:.003,bevelThickness:.002,bevelSegments:1,steps:1});shape.rotateX(Math.PI/2);mesh(shape,wood,0,.03,0);
    mesh(new THREE.BoxGeometry(.19,.031,.031),rubber,-.35,.017,0);
    for(let i=0;i<8;i++)mesh(new THREE.BoxGeometry(.008,.033,.033),tape,-.43+i*.022,.017,0);
    mesh(new THREE.BoxGeometry(.09,.003,.028),tape,.07,.032,0);
  }else{
    tube([[-.12,.022,-.09],[-.13,.022,0],[-.08,.022,.075],[.03,.022,.085],[.09,.022,.025],[.025,.022,-.015]],.009,rubber);
    tube([[-.12,.022,-.05],[-.045,.022,-.04],[.025,.022,-.09]],.007,rubber);
    tube([[-.12,.022,-.09],[-.105,.025,-.15],[-.075,.025,-.17]],.006,metal);
    tube([[.025,.022,-.09],[.015,.025,-.15],[-.015,.025,-.17]],.006,metal);
    for(const x of [-.075,-.015])mesh(new THREE.SphereGeometry(.012,8,6),rubber,x,.025,-.17);
    mesh(new THREE.CylinderGeometry(.032,.035,.018,20),metal,.025,.025,-.015);
    mesh(new THREE.CylinderGeometry(.026,.026,.002,20),tape,.025,.035,-.015);
  }
  return root;
}

export function applyKnockdown(model,state){
  model.root.rotation.x=0;model.root.rotation.z=0;
  if(!state)return;
  const p=knockdownPose(state.elapsed);
  model.root.rotation.x=p.angle;model.root.position.y+=p.lift*model.root.scale.y;
  model.body.rotation.x-=p.fold*.12;
  for(const limb of model.limbs){
    limb.node.rotation.x=limb.leg?-.35*p.fold:-.7*p.fold;
    if(limb.knee)limb.knee.rotation.x=.8*p.fold;
    if(limb.elbow)limb.elbow.rotation.x=-1.1*p.fold;
  }
}

export class RoomItemView{
  constructor(scene,world,width){
    this.world=world;this.width=width;this.group=new THREE.Group();this.group.name='room-items';scene.add(this.group);
    this.models=new Map(['stick','stethoscope'].map(kind=>{const model=createItemModel(kind);this.group.add(model);return[kind,model];}));
    this.swing=createItemModel('stick');this.swing.name='held-stick-swing';this.group.add(this.swing);
    this.points=securityRoomFurniture(width);this.lastGame=null;
    this.point=new THREE.Vector3();this.local=new THREE.Vector3();
    this.echo=document.createElement('div');this.echo.id='enemy-footstep-echo';this.echo.hidden=true;
    this.echo.innerHTML='<span class="echo-rings"></span><svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-16 24 24)"><ellipse cx="15" cy="14" rx="5" ry="9"/><ellipse cx="15" cy="30" rx="4" ry="5"/><ellipse cx="32" cy="20" rx="5" ry="9"/><ellipse cx="32" cy="36" rx="4" ry="5"/></g></svg><span class="echo-direction">◆</span><small></small>';
    document.body.append(this.echo);this.echoLabel=this.echo.querySelector('small');
  }
  update(game,camera,active){
    const b=game.blackout;this.group.visible=Boolean(b);
    for(const [kind,model] of this.models){
      const item=b?.roomItems?.find(p=>p.kind===kind),entry=item&&this.points.find(p=>p.room.id===item.roomId);
      model.visible=Boolean(entry);
      if(entry){model.position.copy(this.world(entry.desk.x,entry.desk.z,.827));model.rotation.y=entry.desk.angle;}
    }
    const strike=game.elapsed-(b?.strikeAt??-Infinity);this.swing.visible=active&&game.phase==='playing'&&strike>=0&&strike<.4;
    if(this.swing.visible){const t=strike/.4;this.swing.position.set(.4-.6*Math.sin(t*Math.PI),-.32,-.55);this.swing.position.applyQuaternion(camera.quaternion).add(camera.position);this.swing.quaternion.copy(camera.quaternion);this.swing.rotateZ(-.8+2.4*Math.sin(t*Math.PI));this.swing.rotateX(.5);}
    const show=active&&game.phase==='playing'&&b?.inventory==='stethoscope'&&!b.monitor&&!b.monitorConnecting&&!b.introLighting;
    this.echo.hidden=!show;if(!show)return;
    this.point.copy(this.world(game.enemy.x,game.enemy.z,.35));this.local.copy(this.point).applyMatrix4(camera.matrixWorldInverse);this.point.project(camera);
    let x=this.point.x,y=-this.point.y,behind=this.local.z>=0;
    if(behind){x=this.local.x>=0?2:-2;y=0;}
    const edge=behind||Math.abs(x)>.86||Math.abs(y)>.75;
    if(edge){const scale=Math.max(Math.abs(x)/.86,Math.abs(y)/.75,1);x/=scale;y/=scale;}
    this.echo.style.left=`${(x*.5+.5)*100}%`;this.echo.style.top=`${(y*.5+.5)*100}%`;
    this.echo.dataset.edge=String(edge);this.echo.dataset.moving=String(!b.knockdown&&Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z)>.02);
    this.echo.style.setProperty('--echo-direction',`${Math.atan2(y,x)}rad`);
    const label=b.knockdown?'倒地 / DOWN':`${Math.round(Math.hypot(game.enemy.x-game.player.x,game.enemy.z-game.player.z)*CELL_SIZE)} m`;
    if(this.echoLabel.textContent!==label)this.echoLabel.textContent=label;
    this.echo.setAttribute('aria-label',`敌人位置 / Enemy location · ${label}`);
  }
  dispose(){this.echo.remove();this.group.removeFromParent();const geometries=new Set(),materials=new Set();this.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
}
