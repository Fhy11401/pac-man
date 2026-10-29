import * as THREE from 'three';
import './style.css';

// Soul Maze: all world, control and gameplay tuning stays in one place.
const CONFIG = Object.freeze({
  rows: 32, cols: 32, cellSize: 2.4, wallHeight: 2.8, corridorWidth: 2.4,
  playerRadius: .42, enemyRadius: .46, eyeHeight: 1.25,
  walkSpeed: 3.0, sprintSpeed: 4.5, acceleration: 16, deceleration: 22,
  staminaMax: 100, staminaDrain: 30, staminaRegen: 21, mouseSensitivity: .0022,
  fov: 80, enemyPatrolSpeed: 1.35, enemyChaseSpeed: 2.75, enemySearchSpeed: 1.8,
  enemyViewDistance: 15, enemyViewAngle: Math.PI * .72, demoDuration: 26000
});

// Fixed hand-designed wall plan. The open 30×30 interior is shaped by varied partial walls,
// preserving loops and alternate routes while remaining easy to edit for future levels.
function createFixedMap(){
  const grid=Array.from({length:CONFIG.rows},(_,z)=>Array.from({length:CONFIG.cols},(_,x)=>(x===0||z===0||x===CONFIG.cols-1||z===CONFIG.rows-1)?'#':'.'));
  const horizontal=(z,from,to,gaps=[])=>{for(let x=from;x<=to;x++)if(!gaps.includes(x))grid[z][x]='#';};
  const vertical=(x,from,to,gaps=[])=>{for(let z=from;z<=to;z++)if(!gaps.includes(z))grid[z][x]='#';};
  horizontal(3,2,14,[8]); horizontal(3,17,29,[23]);
  horizontal(7,4,25,[10,19]); horizontal(11,2,12,[6]); horizontal(11,16,29,[22]);
  horizontal(15,3,27,[14,21]); horizontal(19,2,14,[8]); horizontal(19,17,29,[25]);
  horizontal(23,4,25,[12,20]); horizontal(27,2,12,[5]); horizontal(27,16,29,[23]);
  vertical(5,4,12,[8]); vertical(10,14,21,[17]); vertical(15,4,10,[7]);
  vertical(20,12,18,[15]); vertical(25,20,28,[24]); vertical(28,4,14,[9]);
  grid[2][2]='P'; grid[29][29]='G'; return grid.map(row=>row.join(''));
}
const MAP=createFixedMap();
const START={x:2,z:2};
const ENEMY_START={x:29,z:29};
const EXIT_CELL={x:2,z:29};
const FRAGMENT_CELLS=[{x:4,z:2},{x:12,z:2},{x:20,z:2},{x:26,z:6},{x:8,z:10},{x:22,z:14},{x:4,z:20},{x:14,z:24},{x:26,z:26},{x:20,z:30}];
const PATROL_CELLS=[{x:28,z:2},{x:28,z:17},{x:18,z:17},{x:18,z:29},{x:29,z:29}];
const CARDINALS=[{x:0,z:-1},{x:1,z:0},{x:0,z:1},{x:-1,z:0}];
const $=id=>document.getElementById(id);
const ui={hud:$('hud'),menu:$('menu'),pause:$('pause'),result:$('result'),objective:$('objective'),fragments:$('fragments'),stamina:$('stamina'),time:$('time'),enemyState:$('enemyState'),menuMessage:$('menuMessage'),resultTitle:$('resultTitle'),resultText:$('resultText'),resultEyebrow:$('resultEyebrow'),demoBadge:$('demoBadge'),crosshair:$('crosshair')};

function mapKey(x,z){return `${x},${z}`;}
function walkableCell(x,z){return z>=0&&z<CONFIG.rows&&x>=0&&x<CONFIG.cols&&MAP[z][x]!=='#';}
function worldAt(x,z,y=0){return new THREE.Vector3((x-(CONFIG.cols-1)/2)*CONFIG.cellSize,y,(z-(CONFIG.rows-1)/2)*CONFIG.cellSize);}
function cellAtWorld(x,z){return {x:Math.max(0,Math.min(CONFIG.cols-1,Math.floor(x/CONFIG.cellSize+CONFIG.cols/2))),z:Math.max(0,Math.min(CONFIG.rows-1,Math.floor(z/CONFIG.cellSize+CONFIG.rows/2)))};}
function sameCell(a,b){return a&&b&&a.x===b.x&&a.z===b.z;}
function distance2D(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function reachableFrom(start){const seen=new Set([mapKey(start.x,start.z)]),queue=[start];while(queue.length){const c=queue.shift();for(const d of CARDINALS){const n={x:c.x+d.x,z:c.z+d.z},k=mapKey(n.x,n.z);if(walkableCell(n.x,n.z)&&!seen.has(k)){seen.add(k);queue.push(n);}}}return seen;}
function assertMap(){
  if(MAP.length!==CONFIG.rows||MAP.some(row=>row.length!==CONFIG.cols))throw new Error('Soul Maze 地图必须严格为 32×32。');
  if(MAP[0].includes('.')||MAP.at(-1).includes('.')||MAP.some(row=>row[0]!=='#'||row.at(-1)!=='#'))throw new Error('地图外围必须完整封闭。');
  const starts=MAP.flatMap((row,z)=>[...row].flatMap((c,x)=>c==='P'?[{x,z}]:[]));const enemies=MAP.flatMap((row,z)=>[...row].flatMap((c,x)=>c==='G'?[{x,z}]:[]));
  if(starts.length!==1||enemies.length!==1||!sameCell(starts[0],START)||!sameCell(enemies[0],ENEMY_START))throw new Error('地图出生点数据无效。');
  if(!walkableCell(EXIT_CELL.x,EXIT_CELL.z)||FRAGMENT_CELLS.some(p=>!walkableCell(p.x,p.z)))throw new Error('出口或灵魂碎片位于墙内。');
  const reachable=reachableFrom(starts[0]);if(!reachable.has(mapKey(EXIT_CELL.x,EXIT_CELL.z))||!reachable.has(mapKey(enemies[0].x,enemies[0].z))||FRAGMENT_CELLS.some(p=>!reachable.has(mapKey(p.x,p.z))))throw new Error('关键目标存在不可达位置。');
  return {reachable};
}
const mapData=assertMap();

let scene,camera,renderer,clock,playerVisual,enemyVisual,exitVisual,fragmentVisuals=new Map();
let state='menu',collected=new Set(),startTime=0,demoStarted=0,demoTimer=null,muted=false,audioContext=null,ambientOsc=null,ambientGain=null;
let playerPos=worldAt(START.x,START.z,CONFIG.eyeHeight),playerVelocity=new THREE.Vector3(),stamina=CONFIG.staminaMax,playerYaw=0,playerPitch=0;
let enemy={pos:worldAt(ENEMY_START.x,ENEMY_START.z,.5),facing:new THREE.Vector3(0,0,-1),state:'PATROL',patrolIndex:0,path:[],pathIndex:0,repath:0,lastSeen:worldAt(START.x,START.z),searchTime:0,alerted:false};
let keys=new Set(),demoHeading=0,demoPathTimer=0;

function material(color,emissive=color,intensity=.2){return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:.7,metalness:.1});}
function createWallVisual(){const group=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(CONFIG.cellSize*.94,CONFIG.wallHeight,CONFIG.cellSize*.94),material(0x18263a,0x101c32,.65));mesh.position.y=CONFIG.wallHeight/2;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return group;}
function createEnemyVisual(){const group=new THREE.Group();const root=new THREE.Group();root.name='visualRoot';const body=new THREE.Mesh(new THREE.SphereGeometry(CONFIG.enemyRadius,20,14),material(0xd83c68,0x9c173f,.7));body.position.y=.65;root.add(body);const eye=material(0xffd7df,0xff6b92,.9);[-.14,.14].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),eye);e.position.set(x,.78,-.4);root.add(e);});group.add(root);group.userData.visualRoot=root;group.userData.body=body;return group;}
function createFragmentVisual(){const group=new THREE.Group();const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.34,0),material(0x9df5ff,0x3bd9ff,1));crystal.position.y=.55;group.add(crystal);const halo=new THREE.PointLight(0x41ddff,1.8,5);halo.position.y=.55;group.add(halo);return group;}
function createExitVisual(){const group=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.8,.11,12,32),material(0xff536f,0xff1f48,.8));ring.rotation.x=Math.PI/2;ring.position.y=.08;group.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,2.3,12),material(0xff536f,0xff1f48,.7));beam.position.y=1.1;group.add(beam);group.userData.ring=ring;group.userData.beam=beam;return group;}

function initScene(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0x03050a);scene.fog=new THREE.Fog(0x03050a,10,42);camera=new THREE.PerspectiveCamera(CONFIG.fov,innerWidth/innerHeight,.08,90);camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('gameCanvas').appendChild(renderer.domElement);clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x50627d,0x03040a,.65));const keyLight=new THREE.DirectionalLight(0x9eb6d5,.55);keyLight.position.set(8,18,4);scene.add(keyLight);const redLight=new THREE.PointLight(0xf03a63,5,18);redLight.position.copy(worldAt(28,2,2.2));scene.add(redLight);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.cols*CONFIG.cellSize,CONFIG.rows*CONFIG.cellSize),material(0x090f19,0x050910,.18));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const wallRoot=new THREE.Group();wallRoot.name='mapVisuals';scene.add(wallRoot);MAP.forEach((row,z)=>[...row].forEach((char,x)=>{if(char==='#'){const wall=createWallVisual();wall.position.copy(worldAt(x,z));wallRoot.add(wall);}}));
  playerVisual=new THREE.Group();playerVisual.name='playerLogicRoot';scene.add(playerVisual);enemyVisual=createEnemyVisual();scene.add(enemyVisual);exitVisual=createExitVisual();exitVisual.position.copy(worldAt(EXIT_CELL.x,EXIT_CELL.z));scene.add(exitVisual);FRAGMENT_CELLS.forEach(point=>{const visual=createFragmentVisual();visual.position.copy(worldAt(point.x,point.z));fragmentVisuals.set(mapKey(point.x,point.z),visual);scene.add(visual);});
  window.addEventListener('resize',resize);document.addEventListener('pointerlockchange',onPointerLockChange);renderer.domElement.addEventListener('click',()=>{if(state==='playing'&&document.pointerLockElement!==renderer.domElement)requestPointerLockSafely();});resize();resetRound();requestAnimationFrame(loop);
}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function updateCamera(){camera.position.set(playerPos.x,CONFIG.eyeHeight,playerPos.z);camera.rotation.x=playerPitch;camera.rotation.y=playerYaw;camera.rotation.z=0;}
function updateEnemyVisual(){if(!enemyVisual)return;enemyVisual.position.copy(enemy.pos);enemyVisual.rotation.y=Math.atan2(enemy.facing.x,-enemy.facing.z);const body=enemyVisual.userData.body;if(body){const chasing=enemy.state==='CHASE';body.material.color.setHex(chasing?0xff365f:0xd83c68);body.material.emissive.setHex(chasing?0xff123d:0x9c173f);}}
function resetRound(){collected.clear();playerPos.copy(worldAt(START.x,START.z));playerVelocity.set(0,0,0);stamina=CONFIG.staminaMax;playerYaw=0;playerPitch=0;enemy.pos.copy(worldAt(ENEMY_START.x,ENEMY_START.z,.5));enemy.facing.set(0,0,-1);enemy.state='PATROL';enemy.patrolIndex=0;enemy.path=[];enemy.pathIndex=0;enemy.repath=0;enemy.lastSeen.copy(playerPos);enemy.searchTime=0;enemy.alerted=false;startTime=performance.now();demoStarted=startTime;demoPathTimer=0;for(const visual of fragmentVisuals.values())visual.visible=true;updateExitVisual();updateEnemyVisual();updateCamera();updateHUD();}
function requestPointerLockSafely(){try{const result=renderer.domElement.requestPointerLock?.();if(result&&typeof result.catch==='function')result.catch(()=>{ui.menuMessage.textContent='鼠标锁定被浏览器拒绝，但仍可使用键盘进入迷宫。';});}catch(error){console.warn('Pointer Lock unavailable; keyboard controls remain active.',error);ui.menuMessage.textContent='鼠标锁定不可用，但仍可使用键盘进入迷宫。';}}
function startRound(mode='playing'){clearTimeout(demoTimer);resetRound();state=mode;ui.menu.classList.add('hidden');ui.pause.classList.add('hidden');ui.result.classList.add('hidden');ui.hud.classList.remove('hidden');ui.crosshair.classList.toggle('hidden',mode==='demo');ui.demoBadge.classList.toggle('hidden',mode!=='demo');startAmbient();if(mode==='playing')requestPointerLockSafely();}
function enterMenu(message='收集全部灵魂碎片后，出口才会解锁。'){clearTimeout(demoTimer);stopAmbient();keys.clear();state='menu';ui.hud.classList.add('hidden');ui.pause.classList.add('hidden');ui.result.classList.add('hidden');ui.crosshair.classList.add('hidden');ui.demoBadge.classList.add('hidden');ui.menu.classList.remove('hidden');ui.menuMessage.textContent=message;if(document.pointerLockElement)document.exitPointerLock();}
function onPointerLockChange(){if(state==='playing'&&document.pointerLockElement!==renderer.domElement)pauseGame();}
function pauseGame(){if(state!=='playing')return;state='paused';keys.clear();ui.pause.classList.remove('hidden');ui.crosshair.classList.add('hidden');if(document.pointerLockElement)document.exitPointerLock();}
function resumeGame(){if(state!=='paused')return;state='playing';ui.pause.classList.add('hidden');ui.crosshair.classList.remove('hidden');requestPointerLockSafely();}

function cellBlocked(x,z){return !walkableCell(x,z);}
function circleBlocked(x,z,radius){const center=cellAtWorld(x,z),range=Math.ceil(radius/CONFIG.cellSize)+1;for(let cz=center.z-range;cz<=center.z+range;cz++)for(let cx=center.x-range;cx<=center.x+range;cx++)if(cellBlocked(cx,cz)){const wall=worldAt(cx,cz);const nearX=clamp(x,wall.x-CONFIG.cellSize/2,wall.x+CONFIG.cellSize/2);const nearZ=clamp(z,wall.z-CONFIG.cellSize/2,wall.z+CONFIG.cellSize/2);if((x-nearX)**2+(z-nearZ)**2<radius*radius)return true;}return false;}
function moveWithCollision(position,delta,radius){const steps=Math.max(1,Math.ceil(Math.max(Math.abs(delta.x),Math.abs(delta.z))/(CONFIG.cellSize*.16)));const sx=delta.x/steps,sz=delta.z/steps;for(let i=0;i<steps;i++){if(!circleBlocked(position.x+sx,position.z,radius))position.x+=sx;if(!circleBlocked(position.x,position.z+sz,radius))position.z+=sz;}}
function collectNearby(){for(const point of FRAGMENT_CELLS){const k=mapKey(point.x,point.z);if(!collected.has(k)&&distance2D(playerPos,worldAt(point.x,point.z))<.78){collected.add(k);fragmentVisuals.get(k).visible=false;playTone(620,.11,'triangle');updateExitVisual();updateHUD();}}}
function updateExitVisual(){const unlocked=collected.size===FRAGMENT_CELLS.length;exitVisual.userData.ring.material.color.setHex(unlocked?0x6dffb3:0xff536f);exitVisual.userData.ring.material.emissive.setHex(unlocked?0x27d982:0xff1f48);exitVisual.userData.beam.material.color.setHex(unlocked?0x6dffb3:0xff536f);}
function atExit(){return distance2D(playerPos,worldAt(EXIT_CELL.x,EXIT_CELL.z))<.9;}

function inputVector(){const x=(keys.has('d')?1:0)-(keys.has('a')?1:0),z=(keys.has('w')?1:0)-(keys.has('s')?1:0);return new THREE.Vector2(x,z);}
function updatePlayer(dt){let input=inputVector(),demo=false;if(state==='demo'){demo=true;input.set(0,1);updateDemoHeading(dt);}let desired=new THREE.Vector3();const forward=new THREE.Vector3(Math.sin(playerYaw),0,-Math.cos(playerYaw)),right=new THREE.Vector3(Math.cos(playerYaw),0,Math.sin(playerYaw));if(input.lengthSq()>0){input.normalize();desired.copy(forward).multiplyScalar(input.y).addScaledVector(right,input.x);desired.normalize();}let sprinting=!demo&&keys.has('shift')&&input.lengthSq()>0&&stamina>0;if(sprinting){stamina=Math.max(0,stamina-CONFIG.staminaDrain*dt);}else stamina=Math.min(CONFIG.staminaMax,stamina+CONFIG.staminaRegen*dt);const maxSpeed=demo?CONFIG.walkSpeed:(sprinting?CONFIG.sprintSpeed:CONFIG.walkSpeed);const target=desired.multiplyScalar(maxSpeed);const rate=target.lengthSq()>0?CONFIG.acceleration:CONFIG.deceleration;playerVelocity.x=THREE.MathUtils.damp(playerVelocity.x,target.x,rate,dt);playerVelocity.z=THREE.MathUtils.damp(playerVelocity.z,target.z,rate,dt);moveWithCollision(playerPos,new THREE.Vector3(playerVelocity.x*dt,0,playerVelocity.z*dt),CONFIG.playerRadius);collectNearby();if(atExit()&&collected.size===FRAGMENT_CELLS.length)finish('won');if(atExit()&&collected.size<FRAGMENT_CELLS.length&&Math.random()<dt*.8)playTone(180,.035,'sine');updateCamera();}

function neighbors(cell){return CARDINALS.map(d=>({x:cell.x+d.x,z:cell.z+d.z})).filter(n=>walkableCell(n.x,n.z));}
function heuristic(a,b){return Math.abs(a.x-b.x)+Math.abs(a.z-b.z);}
function findPath(start,target){const s={x:clamp(Math.round(start.x),1,CONFIG.cols-2),z:clamp(Math.round(start.z),1,CONFIG.rows-2)},t={x:clamp(Math.round(target.x),1,CONFIG.cols-2),z:clamp(Math.round(target.z),1,CONFIG.rows-2)};if(!walkableCell(t.x,t.z))return[];const open=[s],came=new Map(),g=new Map([[mapKey(s.x,s.z),0]]),f=new Map([[mapKey(s.x,s.z),heuristic(s,t)]]);while(open.length){open.sort((a,b)=>f.get(mapKey(a.x,a.z))-f.get(mapKey(b.x,b.z)));const current=open.shift(),ck=mapKey(current.x,current.z);if(sameCell(current,t)){const path=[];let node=current;while(!sameCell(node,s)){path.unshift(node);node=came.get(mapKey(node.x,node.z));}return path;}for(const n of neighbors(current)){const nk=mapKey(n.x,n.z),tentative=(g.get(ck)??Infinity)+1;if(tentative<(g.get(nk)??Infinity)){came.set(nk,current);g.set(nk,tentative);f.set(nk,tentative+heuristic(n,t));if(!open.some(o=>sameCell(o,n)))open.push(n);}}}return[];}
function hasLineOfSight(from,to){const dx=to.x-from.x,dz=to.z-from.z,dist=Math.hypot(dx,dz),steps=Math.ceil(dist/.28);for(let i=1;i<steps;i++){const x=from.x+dx*i/steps,z=from.z+dz*i/steps;if(cellBlocked(cellAtWorld(x,z).x,cellAtWorld(x,z).z))return false;}return true;}
function seesPlayer(){const toPlayer=new THREE.Vector3(playerPos.x-enemy.pos.x,0,playerPos.z-enemy.pos.z),distance=toPlayer.length();if(distance>CONFIG.enemyViewDistance||distance<.1)return false;toPlayer.normalize();const facing=new THREE.Vector3(enemy.facing.x,0,enemy.facing.z).normalize();return facing.dot(toPlayer)>Math.cos(CONFIG.enemyViewAngle/2)&&hasLineOfSight(enemy.pos,playerPos);}
function setEnemyState(next){if(enemy.state===next)return;enemy.state=next;ui.enemyState.textContent=next;if(next==='CHASE'){ui.enemyState.classList.add('alert');if(!enemy.alerted){playTone(160,.22,'sawtooth');enemy.alerted=true;}}else if(next==='PATROL'||next==='RETURN'){ui.enemyState.classList.remove('alert');enemy.alerted=false;}}
function enemyTarget(){if(enemy.state==='PATROL')return worldAt(PATROL_CELLS[enemy.patrolIndex].x,PATROL_CELLS[enemy.patrolIndex].z);if(enemy.state==='CHASE')return playerPos;if(enemy.state==='SEARCH')return enemy.lastSeen;return worldAt(PATROL_CELLS[enemy.patrolIndex].x,PATROL_CELLS[enemy.patrolIndex].z);}
function updateEnemy(dt){if(seesPlayer()){enemy.lastSeen.copy(playerPos);enemy.searchTime=4.5;setEnemyState('CHASE');}else if(enemy.state==='CHASE'){enemy.searchTime-=dt;if(enemy.searchTime<=0)setEnemyState('SEARCH');}else if(enemy.state==='SEARCH'){enemy.searchTime-=dt;if(enemy.searchTime<=0)setEnemyState('RETURN');}
  const target=enemyTarget();enemy.repath-=dt;if(enemy.repath<=0||enemy.pathIndex>=enemy.path.length){const targetCell=cellAtWorld(target.x,target.z),enemyCell=cellAtWorld(enemy.pos.x,enemy.pos.z);enemy.path=findPath(enemyCell,targetCell);enemy.pathIndex=0;enemy.repath=enemy.state==='CHASE'?.48:.9;}
  if(enemy.pathIndex<enemy.path.length){const next=worldAt(enemy.path[enemy.pathIndex].x,enemy.path[enemy.pathIndex].z,.5),delta=new THREE.Vector3(next.x-enemy.pos.x,0,next.z-enemy.pos.z),distance=delta.length();if(distance<.18){enemy.pathIndex++;}else{delta.normalize();enemy.facing.lerp(delta,.18).normalize();const speed=enemy.state==='CHASE'?CONFIG.enemyChaseSpeed:enemy.state==='SEARCH'?CONFIG.enemySearchSpeed:CONFIG.enemyPatrolSpeed;moveWithCollision(enemy.pos,delta.multiplyScalar(speed*dt),CONFIG.enemyRadius);}}else if(enemy.state==='PATROL'&&distance2D(enemy.pos,target)<.5){enemy.patrolIndex=(enemy.patrolIndex+1)%PATROL_CELLS.length;enemy.path=[];}
  if(enemy.state==='RETURN'&&distance2D(enemy.pos,target)<.55){setEnemyState('PATROL');enemy.path=[];}if(enemy.state==='SEARCH'&&distance2D(enemy.pos,target)<.55){enemy.path=[];enemy.repath=0;}
  updateEnemyVisual();if(distance2D(playerPos,enemy.pos)<CONFIG.playerRadius+CONFIG.enemyRadius+.05){if(state==='demo'){playerPos.copy(worldAt(START.x,START.z));enemy.pos.copy(worldAt(ENEMY_START.x,ENEMY_START.z,.5));}else finish('lost');}updateHUD();}

function updateDemoHeading(dt){demoPathTimer-=dt;if(demoPathTimer<=0){const target=FRAGMENT_CELLS.find(p=>!collected.has(mapKey(p.x,p.z)))||EXIT_CELL;const path=findPath(cellAtWorld(playerPos.x,playerPos.z),target);const next=path[0]||target;const worldTarget=worldAt(next.x,next.z),dx=worldTarget.x-playerPos.x,dz=worldTarget.z-playerPos.z;demoHeading=Math.atan2(dx,-dz);demoPathTimer=.55;}playerYaw=demoHeading;playerPitch=0;}
function updateHUD(){ui.fragments.textContent=`${collected.size}/${FRAGMENT_CELLS.length}`;ui.objective.textContent=collected.size===FRAGMENT_CELLS.length?'出口已解锁 · 找到红色信标并逃脱':`收集灵魂碎片 ${collected.size}/${FRAGMENT_CELLS.length} · 出口锁定`;const percent=Math.round(stamina);ui.stamina.textContent=`${percent}%`;ui.stamina.classList.toggle('stamina-low',percent<25);const elapsed=Math.floor((performance.now()-startTime)/1000);ui.time.textContent=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;ui.enemyState.textContent=enemy.state;}
function finish(result){if(state==='won'||state==='lost')return;if(state==='demo'){enterMenu(`Demo 已完成 · 已收集 ${collected.size}/${FRAGMENT_CELLS.length} 个碎片`);return;}state=result;keys.clear();stopAmbient();if(document.pointerLockElement)document.exitPointerLock();ui.crosshair.classList.add('hidden');ui.demoBadge.classList.add('hidden');ui.resultEyebrow.textContent=result==='won'?'ESCAPE COMPLETE':'CAUGHT IN THE MAZE';ui.resultTitle.textContent=result==='won'?'YOU ESCAPED':'GAME OVER';ui.resultText.textContent=result==='won'?`出口已开启 · 收集 ${collected.size}/${FRAGMENT_CELLS.length} 个灵魂碎片`:`追猎者抓住了你 · 收集 ${collected.size}/${FRAGMENT_CELLS.length} 个灵魂碎片`;ui.result.classList.remove('hidden');playTone(result==='won'?880:90,.35,result==='won'?'triangle':'sawtooth');}
function playTone(freq,duration,type){if(muted)return;try{const AudioCtor=window.AudioContext||window.webkitAudioContext;audioContext??=new AudioCtor();if(audioContext.state==='suspended')audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch(e){/* Browsers may block audio until a gesture. */}}
function startAmbient(){if(muted)return;try{const AudioCtor=window.AudioContext||window.webkitAudioContext;audioContext??=new AudioCtor();ambientOsc?.stop();ambientOsc=audioContext.createOscillator();ambientGain=audioContext.createGain();ambientOsc.type='sine';ambientOsc.frequency.value=52;ambientGain.gain.value=.012;ambientOsc.connect(ambientGain).connect(audioContext.destination);ambientOsc.start();}catch(e){/* Optional atmosphere. */}}
function stopAmbient(){try{ambientOsc?.stop();}catch(e){}ambientOsc=null;ambientGain=null;}
function toggleMute(){muted=!muted;$('muteButton').textContent=muted?'🔇':'🔊';if(muted)stopAmbient();else{startAmbient();playTone(420,.08,'sine');}}
function onPointerMove(event){if(state!=='playing'||document.pointerLockElement!==renderer.domElement)return;playerYaw-=event.movementX*CONFIG.mouseSensitivity;playerPitch=clamp(playerPitch-event.movementY*CONFIG.mouseSensitivity,-Math.PI*.46,Math.PI*.46);updateCamera();}
function onKeyDown(event){const k=event.key.toLowerCase();if(k==='escape'){if(state==='demo')enterMenu('Demo 已退出。');return;}if(state==='playing'&&(k==='w'||k==='a'||k==='s'||k==='d'||k==='shift')){event.preventDefault();keys.add(k);}}
function onKeyUp(event){keys.delete(event.key.toLowerCase());}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05);if(state==='playing'||state==='demo'){updatePlayer(dt);updateEnemy(dt);if(state==='demo'&&performance.now()-demoStarted>CONFIG.demoDuration)enterMenu('Demo 已结束 · 点击进入迷宫开始游戏');}if(state==='playing'||state==='demo'){for(const visual of fragmentVisuals.values())if(visual.visible){visual.rotation.y+=dt;visual.position.y=.48+Math.sin(performance.now()*.003+visual.position.x)*.08;}exitVisual.userData.ring.rotation.z+=dt*.8;}updateCamera();renderer.render(scene,camera);}

window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);document.addEventListener('mousemove',onPointerMove);
$('startButton').addEventListener('click',()=>startRound('playing'));$('demoButton').addEventListener('click',()=>startRound('demo'));$('resumeButton').addEventListener('click',resumeGame);$('pauseMenuButton').addEventListener('click',()=>enterMenu());$('restartButton').addEventListener('click',()=>startRound('playing'));$('menuButton').addEventListener('click',()=>enterMenu());$('exitDemo').addEventListener('click',()=>enterMenu('Demo 已退出。'));$('muteButton').addEventListener('click',toggleMute);initScene();
