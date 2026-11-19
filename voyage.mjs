import * as THREE from 'three';
import { CHAPTERS, PICKUP_RADII, ENCOUNTER_WINDOWS, asDate, buildRoute, routeFrame, createRun, stepRun, coinOffset, pickupOffset, createTransition, stepTransition } from './arcade-core.mjs';
import { stateAt, fromJulian, toJulian, AU_KM } from './engine.mjs';
import { SKY_REFERENCES, eclipticDirection, starField } from './sky.mjs';
import moonData from './data/moons.json';
import { moonDisplay, meteoroidScenery } from './scenery.mjs';
import jupiterURL from './assets/2k_jupiter.jpg';
import saturnURL from './assets/2k_saturn.jpg';
import uranusURL from './assets/2k_uranus.jpg';
import neptuneURL from './assets/2k_neptune.jpg';
import earthURL from './assets/2k_earth_daymap.jpg';
import skyURL from './assets/2k_stars_milky_way.jpg';
import ringURL from './assets/2k_saturn_ring_alpha.png';

const $ = id => document.getElementById(id);
const v = a => new THREE.Vector3(...a);
const dateFormat = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const radiusKm = {jupiter:71492,saturn:60268,uranus:25559,neptune:24764,earth:6378};
const textures = {jupiter:jupiterURL,saturn:saturnURL,uranus:uranusURL,neptune:neptuneURL,earth:earthURL};

function spacecraft() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color:0xc9d2d7,metalness:.7,roughness:.38});
  const foil = new THREE.MeshStandardMaterial({color:0xb89952,metalness:.65,roughness:.5});
  const black = new THREE.MeshStandardMaterial({color:0x202530,metalness:.3,roughness:.65});
  const mesh = (geometry,material,x,y,z) => {
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);group.add(object);return object;
  };
  mesh(new THREE.CylinderGeometry(.65,.65,.6,10),foil,0,0,0);
  const points=Array.from({length:25},(_,i)=>{
    const r=i/24*1.6;return new THREE.Vector2(r,.34+r*r*.24);
  });
  const dish=mesh(new THREE.LatheGeometry(points,48),new THREE.MeshStandardMaterial({
    color:0xe9e8dc,metalness:.35,roughness:.5,side:THREE.DoubleSide}),0,.28,0);
  dish.rotation.x=.25;
  const rod=(a,b,r=.025,material=metal)=>{
    const delta=b.clone().sub(a);
    const object=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material,0,0,0);
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return object;
  };
  for(let i=0;i<3;i++){
    const angle=i/3*Math.PI*2;
    rod(new THREE.Vector3(Math.cos(angle)*1.3,1.1,Math.sin(angle)*1.3),new THREE.Vector3(0,2.1,0));
  }
  mesh(new THREE.CylinderGeometry(.13,.21,.4,12),metal,0,2.1,0);
  rod(new THREE.Vector3(.2,0,0),new THREE.Vector3(4,-.7,.3),.045);
  for(let i=0;i<3;i++) {
    const rtg=mesh(new THREE.CylinderGeometry(.25,.25,.6,12),black,2.4+i*.65,-.45-i*.12,.3);
    rtg.rotation.z=Math.PI/2;
    for(let j=0;j<4;j++)mesh(new THREE.BoxGeometry(.04,.7,.7),metal,2.2+i*.65+j*.12,-.45-i*.12,.3);
  }
  rod(new THREE.Vector3(-.2,0,0),new THREE.Vector3(-5.4,.15,-.3),.025);
  mesh(new THREE.BoxGeometry(.22,.22,.22),black,-5.4,.15,-.3);
  rod(new THREE.Vector3(0,-.2,0),new THREE.Vector3(-2,-2.3,0),.012);
  rod(new THREE.Vector3(0,-.2,0),new THREE.Vector3(1,-2.6,.6),.012);
  const record=mesh(new THREE.CylinderGeometry(.25,.25,.03,32),foil,0,-.32,.3);
  record.rotation.x=Math.PI/2;
  group.scale.setScalar(.52);
  return group;
}

export async function createVoyage(data, sound) {
  const canvas=$('voyage-canvas');
  let renderer;
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  } catch(error) {
    $('voyage-overlay-title').textContent='3D graphics unavailable';
    $('voyage-overlay-story').textContent='This browser could not start WebGL 2. Enable hardware acceleration or try a current Chrome, Firefox or Safari.';
    console.error('Voyager WebGL initialization failed:',error);
    return {setActive(){},pause(){}};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.25;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(58,1,.05,30000);
  const loader=new THREE.TextureLoader();
  const load=async url=>{
    const texture=await loader.loadAsync(url);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  let loaded,skyTexture,ringTexture;
  try {
    [loaded,skyTexture,ringTexture]=await Promise.all([
      Promise.all(Object.entries(textures).map(async([name,url])=>[name,await load(url)])),
      load(skyURL),load(ringURL),
    ]);
  } catch(error) {
    renderer.dispose();
    $('voyage-overlay-title').textContent='Space textures did not load';
    $('voyage-overlay-story').textContent=`Reload the complete game file or rebuild the site. ${error.message}`;
    console.error('Voyager texture initialization failed:',error);
    return {setActive(){},pause(){}};
  }
  const sky=new THREE.Mesh(new THREE.SphereGeometry(16000,48,32),
    new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,color:new THREE.Color(0xc7d2ef).multiplyScalar(1.15),depthWrite:false}));
  sky.rotation.set(.8,.3,-.4);scene.add(sky);
  const skyDetails=new THREE.Group();scene.add(skyDetails);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const glowContext=glowCanvas.getContext('2d');
  if(!glowContext)throw new Error('The sky glow canvas is unavailable');
  const glow=glowContext.createRadialGradient(64,64,0,64,64,64);
  glow.addColorStop(0,'rgba(255,255,255,.55)');glow.addColorStop(.24,'rgba(255,255,255,.18)');glow.addColorStop(1,'rgba(255,255,255,0)');
  glowContext.fillStyle=glow;glowContext.fillRect(0,0,128,128);
  const glowTexture=new THREE.CanvasTexture(glowCanvas);
  for(const [x,y,z,size,color] of [[-3000,2600,-7000,13000,0x526cce],[5000,-2000,3000,12000,0x985eaa],[-4000,-5000,3500,12000,0x258b98]]) {
    const cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
    cloud.position.set(x,y,z);cloud.scale.set(size,size*.7,1);skyDetails.add(cloud);
  }
  const starCanvas=document.createElement('canvas');starCanvas.width=32;starCanvas.height=32;
  const starContext=starCanvas.getContext('2d');
  if(!starContext)throw new Error('The starfield canvas is unavailable');
  const starlight=starContext.createRadialGradient(16,16,0,16,16,16);
  starlight.addColorStop(0,'rgba(255,255,255,1)');starlight.addColorStop(.35,'rgba(255,255,255,.95)');
  starlight.addColorStop(.7,'rgba(255,255,255,.3)');starlight.addColorStop(1,'rgba(255,255,255,0)');
  starContext.fillStyle=starlight;starContext.fillRect(0,0,32,32);
  const starTexture=new THREE.CanvasTexture(starCanvas);
  let starCount=0;
  for(const layer of starField()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(layer.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(layer.colors,3));
    skyDetails.add(new THREE.Points(geometry,new THREE.PointsMaterial({
      map:starTexture,size:layer.size,sizeAttenuation:false,vertexColors:true,transparent:true,
      opacity:layer.opacity,alphaTest:.01,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending})));
    starCount+=layer.count;
  }
  canvas.dataset.skyStars=String(starCount);
  const references=SKY_REFERENCES.map(reference=>{
    const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:reference.color,depthWrite:false,blending:THREE.AdditiveBlending}));
    marker.position.copy(v(eclipticDirection(reference.ra,reference.dec)).multiplyScalar(7500));
    marker.scale.set(85,85,1);skyDetails.add(marker);
    const label=document.createElement('span');label.className='planet-tag sky-tag';
    const title=document.createElement('span');title.textContent=reference.name;
    const note=document.createElement('small');note.textContent=reference.note;
    label.append(title,note);$('planet-labels').append(label);
    return {marker,label};
  });
  scene.add(new THREE.AmbientLight(0xb1c8ec,.6));
  const sun=new THREE.DirectionalLight(0xffeed9,3.8);scene.add(sun);scene.add(sun.target);
  const rim=new THREE.DirectionalLight(0x84b9ff,1.3);rim.position.set(-20,12,-15);scene.add(rim);
  const planets=[];
  for(const [name,map] of loaded) {
    const group=new THREE.Group(), sphere=new THREE.Mesh(new THREE.SphereGeometry(1,80,48),
      new THREE.MeshStandardMaterial({map,roughness:.94,metalness:0}));
    group.add(sphere);
    if(name==='saturn') {
      const geometry=new THREE.RingGeometry(1.25,2.3,160);
      const uv=geometry.attributes.uv, pos=geometry.attributes.position;
      for(let i=0;i<uv.count;i++) {
        const r=Math.hypot(pos.getX(i),pos.getY(i));uv.setXY(i,(r-1.25)/1.05,.5);
      }
      const rings=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
        map:ringTexture,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false,roughness:1}));
      rings.rotation.x=-Math.PI/2;group.add(rings);
      group.rotation.z=.47;
    }
    if(name==='uranus') group.rotation.z=1.7;
    scene.add(group);
    const label=document.createElement('span');label.className='planet-tag';
    const title=document.createElement('span');title.textContent=name[0].toUpperCase()+name.slice(1);
    const distance=document.createElement('small');label.append(title,distance);$('planet-labels').append(label);
    planets.push({name,group,sphere,label,distance});
  }
  let seed=19770905;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const moonPalette={
    io:['#c9ac4b','#715423','#e4d285'],europa:['#cdc4ac','#775448','#f2e7cb'],
    ganymede:['#8e8779','#544b43','#b7b0a1'],callisto:['#736d65','#3d3935','#b4a68f'],
    titan:['#c18a41','#98632c','#e4b66a'],enceladus:['#d6e5e9','#819cae','#f2f5ee'],
  };
  const moonObjects=Object.entries(moonData.bodies).map(([key,moon])=>{
    const surface=document.createElement('canvas');surface.width=256;surface.height=128;
    const context=surface.getContext('2d');
    if(!context)throw new Error('The moon surface canvas is unavailable');
    const palette=moonPalette[key];context.fillStyle=palette[0];context.fillRect(0,0,256,128);
    for(let i=0;i<600;i++){
      const x=random()*256,y=random()*128,r=random()*(key==='titan'?20:5)+.3;
      context.globalAlpha=key==='titan'?.04:.15+random()*.2;context.fillStyle=palette[i%2+1];
      context.beginPath();context.ellipse(x,y,r*1.7,r,random()*Math.PI,0,Math.PI*2);context.fill();
    }
    if(key==='europa'||key==='enceladus'){
      context.strokeStyle=palette[1];context.globalAlpha=.4;context.lineWidth=.6;
      for(let i=0;i<35;i++){
        let x=random()*256,y=random()*128;context.beginPath();context.moveTo(x,y);
        for(let j=0;j<7;j++){x+=random()*24-8;y+=random()*20-10;context.lineTo(x,y);}context.stroke();
      }
    }
    const map=new THREE.CanvasTexture(surface);map.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),new THREE.MeshStandardMaterial({map,roughness:.95}));
    mesh.visible=false;scene.add(mesh);
    const label=document.createElement('span');label.className='planet-tag moon-tag';label.dataset.moon=key;
    const name=document.createElement('span');name.textContent=moon.name;
    const note=document.createElement('small');note.textContent=`${moon.parent==='jupiter'?'Jupiter':'Saturn'} moon · display scale`;
    label.append(name,note);label.hidden=true;$('planet-labels').append(label);
    return {moon,mesh,label};
  });
  $('moon-provenance').textContent='Moon positions: NASA/JPL Horizons, hourly parent-relative ecliptic J2000 states. Exact queries and retrieval dates are included in data/moons.json and the bundled game.';
  const rockGeometry=new THREE.IcosahedronGeometry(1,1);
  const rockVertices=rockGeometry.attributes.position;
  for(let i=0;i<rockVertices.count;i++){
    const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i);
    const scale=1+.18*Math.sin(x*11+y*17+z*13);
    rockVertices.setXYZ(i,x*scale,y*scale*.72,z*scale);
  }
  rockGeometry.computeVertexNormals();
  const rockMaterial=new THREE.MeshStandardMaterial({color:0x79716c,roughness:1,flatShading:true});
  const rocks=meteoroidScenery().map(rock=>{
    const mesh=new THREE.Mesh(rockGeometry,rockMaterial);mesh.scale.setScalar(rock.size);scene.add(mesh);return {...rock,mesh};
  });
  const ship=spacecraft();scene.add(ship);
  const coinGeometry=new THREE.CylinderGeometry(.65,.65,.12,32);
  coinGeometry.rotateX(Math.PI/2);
  const coinMaterial=new THREE.MeshStandardMaterial({color:0xffcd67,emissive:0xb76f0b,
    emissiveIntensity:.7,metalness:.8,roughness:.25});
  const grooveGeometry=new THREE.TorusGeometry(.44,.018,6,40);
  const coins=Array.from({length:45},()=>{
    const group=new THREE.Group();
    group.add(new THREE.Mesh(coinGeometry,coinMaterial));
    for(const z of [-.075,.075]) {
      const groove=new THREE.Mesh(grooveGeometry,new THREE.MeshBasicMaterial({color:0x69400e}));
      groove.position.z=z;group.add(groove);
    }
    scene.add(group);return group;
  });
  const saucerMaterial=new THREE.MeshStandardMaterial({color:0xb8a5da,metalness:.8,roughness:.2,emissive:0x493374,emissiveIntensity:.45});
  const ufoGlow=new THREE.MeshBasicMaterial({color:0xc2a0ff});
  const ufos=Array.from({length:6},()=>{
    const group=new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(.9,24,12),saucerMaterial));
    group.children[0].scale.y=.18;
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.42,20,12),new THREE.MeshStandardMaterial({color:0x78edff,emissive:0x287fa2,metalness:.4,roughness:.12}));
    dome.position.y=.2;dome.scale.y=.7;group.add(dome);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.92,.045,8,40),ufoGlow);
    ring.rotation.x=Math.PI/2;group.add(ring);
    for(let i=0;i<8;i++) {
      const light=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),ufoGlow);
      light.position.set(Math.cos(i*Math.PI/4)*.77,-.13,Math.sin(i*Math.PI/4)*.77);group.add(light);
    }
    scene.add(group);return group;
  });
  const pulseField=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({
    color:0xac91ff,wireframe:true,transparent:true,opacity:.18,depthWrite:false}));
  scene.add(pulseField);
  const pickupHalo=new THREE.Group();
  const haloMaterial=new THREE.MeshBasicMaterial({
    color:0x8edaf4,transparent:true,opacity:.32,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
  const haloFillMaterial=haloMaterial.clone();haloFillMaterial.opacity=.035;
  const haloOutline=new THREE.Mesh(new THREE.RingGeometry(.98,1,64),haloMaterial);
  const haloFill=new THREE.Mesh(new THREE.CircleGeometry(.98,64),haloFillMaterial);
  haloFill.renderOrder=9;haloOutline.renderOrder=10;
  pickupHalo.add(haloFill,haloOutline);pickupHalo.visible=false;scene.add(pickupHalo);
  const gate=new THREE.Group(),gateMaterial=new THREE.MeshBasicMaterial({color:0xf3c878,transparent:true,opacity:.7});
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(6,.045,8,100),gateMaterial));
  const outerGate=new THREE.Mesh(new THREE.TorusGeometry(6.6,.018,6,100),new THREE.MeshBasicMaterial({color:0x8edaf4}));
  gate.add(outerGate);scene.add(gate);
  const gateLabel=document.createElement('span');gateLabel.className='planet-tag';
  gateLabel.textContent='One light-day · fictional finish gate';$('planet-labels').append(gateLabel);
  const burstPositions=new Float32Array(60*3),burstGeometry=new THREE.BufferGeometry();
  burstGeometry.setAttribute('position',new THREE.BufferAttribute(burstPositions,3));
  const burstMaterial=new THREE.PointsMaterial({color:0xf3c878,size:.12,transparent:true,opacity:0,depthWrite:false});
  const burst=new THREE.Points(burstGeometry,burstMaterial);burst.frustumCulled=false;scene.add(burst);
  const pathGeometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:110},()=>new THREE.Vector3()));
  const trail=new THREE.Line(pathGeometry,new THREE.LineBasicMaterial({color:0x7bbbd0,transparent:true,opacity:.25}));
  scene.add(trail);
  let index=0,route,run,started=false,active=!$('voyage').hidden,looking=false,lookYaw=0,lookPitch=0,contextLost=false,skyNames=true;
  let transition=null,journeyTotal=0;
  let encounterPlayed=false,encounterStart=Infinity,encounterEnd=-Infinity;
  const finalIndex=CHAPTERS.length-1,scoreKey='voyager1-years-scores-v1';
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pointer=null,analog={x:0,y:0},previous=performance.now(),pickupUntil=0,lastHUD=0,pulseRequested=false,burstAt=-1000;
  const keys=new Set(),touch=new Set(),best={};
  try {
    const saved=JSON.parse(localStorage.getItem(scoreKey) || '{}')||{};
    for(const chapter of CHAPTERS)if(Number.isFinite(saved[chapter.id])&&saved[chapter.id]>=0)best[chapter.id]=saved[chapter.id];
  } catch(error) {
    $('voyage-accessible-status').textContent='Saved scores unavailable. This flight still works without browser storage.';
    console.warn('Voyager scores unavailable:',error);
  }
  const persist=()=>{
    try {localStorage.setItem(scoreKey,JSON.stringify(best));}
    catch(error) {
      $('voyage-result').textContent+=' Best score could not be saved in this browser.';
      console.warn('Voyager score saving blocked:',error);
    }
  };
  function overlay(title,story,button) {
    $('voyage-overlay').hidden=false;
    $('voyage-overlay-title').textContent=title;
    $('voyage-overlay-story').textContent=story;
    $('voyage-start').textContent=button;
  }
  function syncAudio() {
    const audible=active&&started&&!run.paused&&!looking&&!document.hidden&&document.hasFocus();
    sound.setState({active:audible,flying:audible&&!run.complete,boosting:run.boosting});
  }
  function selectChapter(next,{carry=false}={}) {
    transition=null;
    if(!carry)journeyTotal=0;
    index=next;route=buildRoute(data,CHAPTERS[index]);run=createRun(CHAPTERS[index]);
    started=false;looking=false;lookYaw=0;lookPitch=0;keys.clear();touch.clear();analog={x:0,y:0};pulseRequested=false;
    encounterPlayed=false;
    const encounter=ENCOUNTER_WINDOWS.find(window=>window.start.startsWith(String(CHAPTERS[index].year)));
    encounterStart=encounter?toJulian(asDate(encounter.start)):Infinity;
    encounterEnd=encounter?toJulian(asDate(encounter.end)):-Infinity;
    syncAudio();
    pickupUntil=0;burstAt=-1000;$('voyage-pickup').textContent='';
    $('chapter').value=index;
    $('voyage-overlay-kicker').textContent=`Voyager 1 · ${CHAPTERS[index].name}`;
    overlay(index===finalIndex?'One day of light. One extraordinary journey.':'Carry a little Earth into forever.',CHAPTERS[index].story,`Launch ${CHAPTERS[index].year}`);
    $('voyage-milestone').hidden=index===finalIndex;$('voyage-milestone').disabled=false;
    $('level-transition').hidden=true;$('level-transition').textContent='';
    $('voyage-start').disabled=false;$('voyage-next').hidden=true;$('voyage-result').textContent='';
    $('voyage-pause').disabled=true;$('voyage-pause').textContent='Pause';$('voyage-look').textContent='Look around';
    $('voyage-callout').textContent='Collect the gold. Chase the violet.';
    $('encounter-objects').textContent=CHAPTERS[index].planet==='jupiter'?'Jupiter moons appear during the March encounter':
      CHAPTERS[index].planet==='saturn'?'Saturn moons appear during the November encounter':'Distant stars · illustrative meteoroids';
    updateHUD();
  }
  function showCompletion() {
    const chapter=CHAPTERS[index];
    overlay(index===finalIndex?'One light-day. Still going.':`${chapter.year} complete.`,
      index===finalIndex?`18 November 2026, 10:16:07 UTC. NASA’s announced milestone. ${run.collected} gold records and ${run.ufosCollected} UFOs collected this year.`:
      `${chapter.name}. ${run.collected} of 45 records and ${run.ufosCollected} of 6 UFOs recovered. Best streak: ${run.maxCombo}.`,
      transition?(run.paused?'Continue countdown':`Begin ${CHAPTERS[transition.nextIndex].year} now`):'Start new journey');
    $('voyage-result').textContent=`${run.score.toLocaleString('en-US')} year points · Journey ${journeyTotal.toLocaleString('en-US')}`;
    $('voyage-next').hidden=false;$('voyage-next').textContent=`Replay ${chapter.year}`;
    $('voyage-milestone').hidden=true;$('voyage-pause').disabled=!transition;
    $('voyage-pause').textContent=run.paused?'Resume':'Pause';
    updateTransitionNotice();
  }
  function updateTransitionNotice() {
    $('level-transition').hidden=!transition;
    if(!transition)return;
    const nextYear=CHAPTERS[transition.nextIndex].year;
    const message=run.paused?`Countdown paused · ${nextYear} is next`:`${nextYear} begins in ${Math.ceil(transition.remaining)}s`;
    if($('level-transition').textContent!==message)$('level-transition').textContent=message;
  }
  function advanceYear() {
    const next=transition.nextIndex;
    selectChapter(next,{carry:true});launch();
  }
  function pause() {
    sound.setState({active:false,flying:false,boosting:false});
    keys.clear();touch.clear();analog={x:0,y:0};pulseRequested=false;pointer=null;
    if(!started||(run.complete&&!transition)||run.paused)return;
    run={...run,paused:true};
    if(transition)showCompletion();
    else overlay('Holding position.','The simulation is paused. Your score and collected records are safe.','Resume flight');
    $('voyage-pause').textContent='Resume';
  }
  function launch() {
    if(transition) {
      if(run.paused) {
        run={...run,paused:false};looking=false;lookYaw=0;lookPitch=0;
        $('voyage-look').textContent='Look around';showCompletion();canvas.focus({preventScroll:true});
        syncAudio();
      } else advanceYear();
      return;
    }
    if(run.complete)selectChapter(0);
    const resuming=started&&run.paused;
    started=true;run={...run,paused:false};
    looking=false;lookYaw=0;lookPitch=0;$('voyage-look').textContent='Look around';
    $('voyage-overlay').hidden=true;$('voyage-pause').disabled=false;$('voyage-pause').textContent='Pause';
    $('voyage-accessible-status').textContent=`${CHAPTERS[index].year} begins. Level ${index+1} of ${CHAPTERS.length}.`;
    canvas.focus({preventScroll:true});syncAudio();
    if(!resuming)sound.play('launch');
  }
  function updateHUD() {
    const frame=routeFrame(route,run.progress);
    $('voyage-score').textContent=run.score.toLocaleString('en-US');
    $('voyage-coins').textContent=`${run.collected} / 45 records`;
    $('voyage-ufos').textContent=`${run.ufosCollected} / 6 UFOs`;
    $('journey-score').textContent=`Journey ${(journeyTotal+(run.complete?0:run.score)).toLocaleString('en-US')}`;
    $('voyage-combo').textContent=`×${Math.max(1,Math.min(run.combo,5))}`;
    $('voyage-best').textContent=`Best ${(best[run.chapter]||0).toLocaleString('en-US')}`;
    $('voyage-planet').textContent=CHAPTERS[index].name;
    $('voyage-date').textContent=dateFormat.format(fromJulian(frame.jd));
    $('voyage-level').textContent=`Level ${index+1} / ${CHAPTERS.length} · ${CHAPTERS[index].duration}s${CHAPTERS[index].milestone?' · Milestone':''}`;
    $('voyage-progress').value=run.progress;$('voyage-charge').value=run.charge;
    $('voyage-distance').textContent=`${Math.round(run.progress*100)}% · ${(route.distanceAU*AU_KM*run.progress/1e6).toFixed(1)} million km along JPL route`;
    const earth=stateAt(data.bodies.earth.states,frame.jd).position;
    const hours=Math.hypot(...frame.position.map((value,i)=>value-earth[i]))*AU_KM/299792.458/3600;
    $('voyage-lighttime').textContent=`${hours.toFixed(2)} light-hours from Earth`;
    $('pulse-status').textContent=run.pulseRemaining>0?'Active':run.pulseCooldown>0?`${Math.ceil(run.pulseCooldown)}s`:'Ready';
    $('voyage-pulse').disabled=!started||run.paused||run.complete||run.pulseCooldown>0;
    $('voyage-medal').textContent=run.ufosCollected>=4?'UFO hunter':run.collected>=30?'Golden voyager':run.maxCombo>=5?'Signal streak':'Find your flight line';
    canvas.dataset.progress=run.progress.toFixed(5);
    canvas.dataset.offsetX=run.x.toFixed(3);
    canvas.dataset.offsetY=run.y.toFixed(3);
    canvas.dataset.renderer='webgl2';
    canvas.dataset.complete=String(run.complete);
    canvas.dataset.year=String(CHAPTERS[index].year);
    canvas.dataset.duration=String(CHAPTERS[index].duration);
    canvas.dataset.journeyScore=String(journeyTotal+(run.complete?0:run.score));
    canvas.dataset.nextYear=transition?String(CHAPTERS[transition.nextIndex].year):'';
    canvas.dataset.transitionRemaining=transition?transition.remaining.toFixed(2):'';
    updateTransitionNotice();
  }
  $('voyage-start').addEventListener('click',launch);
  $('voyage-next').addEventListener('click',()=>{selectChapter(index);launch();});
  $('voyage-milestone').addEventListener('click',()=>selectChapter(finalIndex));
  $('voyage-pulse').addEventListener('click',()=>{pulseRequested=true;canvas.focus({preventScroll:true});});
  $('sky-toggle').addEventListener('click',()=>{
    skyNames=!skyNames;$('sky-toggle').textContent=`Sky names ${skyNames?'on':'off'}`;
    $('sky-toggle').setAttribute('aria-pressed',String(skyNames));
  });
  $('chapter').addEventListener('change',()=>selectChapter(Number($('chapter').value)));
  $('voyage-pause').addEventListener('click',()=>run.paused?launch():pause());
  $('voyage-look').addEventListener('click',()=>{
    looking=!looking;
    if(looking)pause();
    $('voyage-look').textContent=looking?'Chase view':'Look around';
    if(looking) {
      $('voyage-overlay').hidden=true;
      $('voyage-accessible-status').textContent='Look around: drag the scene to orbit the spacecraft. Flight is paused.';
    } else {
      lookYaw=0;lookPitch=0;
      if(run.complete)showCompletion();
      else if(run.paused)overlay('Ready to fly again?',CHAPTERS[index].story,'Resume flight');
      else if(!started)overlay('Carry a little Earth into forever.',CHAPTERS[index].story,`Launch ${CHAPTERS[index].year}`);
    }
  });
  const controlKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','Space','KeyP','KeyE'];
  window.addEventListener('keydown',event=>{
    if(!active || $('sources-dialog').open || !controlKeys.includes(event.code)
        || ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;
    event.preventDefault();
    if(event.code==='KeyP'&&!event.repeat){run.paused?launch():pause();return;}
    if(event.code==='KeyE'&&!event.repeat){pulseRequested=true;return;}
    keys.add(event.code);
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  $('sources-dialog').addEventListener('close',()=>keys.clear());
  $('sources-open').addEventListener('click',pause);
  for(const button of document.querySelectorAll('[data-steer]')) {
    button.addEventListener('pointerdown',event=>{
      event.preventDefault();button.setPointerCapture(event.pointerId);touch.add(button.dataset.steer);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>touch.delete(button.dataset.steer));
  }
  canvas.addEventListener('pointerdown',event=>{
    canvas.focus({preventScroll:true});pointer={x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointer)return;
    if(looking) {
      lookYaw+=(event.clientX-pointer.x)*.008;lookPitch=THREE.MathUtils.clamp(lookPitch+(event.clientY-pointer.y)*.006,-1,1);
      pointer={x:event.clientX,y:event.clientY};
    } else {
      analog={x:THREE.MathUtils.clamp((event.clientX-pointer.x)/65,-1,1),
        y:THREE.MathUtils.clamp(-(event.clientY-pointer.y)/65,-1,1)};
    }
  });
  const release=()=>{pointer=null;analog={x:0,y:0};};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();pause();active=false;contextLost=true;
    overlay('The graphics context was lost.','Reload this page to restore the 3D flight.','Reload game');
    $('voyage-start').disabled=true;
  });
  function render(time) {
    const dt=Math.min((time-previous)/1000,.05);previous=time;
    if(active && !document.hidden) {
      const old=run;
      if(started && !looking) {
        const x=Number(keys.has('ArrowRight')||keys.has('KeyD')||touch.has('right'))
          -Number(keys.has('ArrowLeft')||keys.has('KeyA')||touch.has('left'));
        const y=Number(keys.has('ArrowUp')||keys.has('KeyW')||touch.has('up'))
          -Number(keys.has('ArrowDown')||keys.has('KeyS')||touch.has('down'));
        run=stepRun(run,{x:x||analog.x,y:y||analog.y,boost:keys.has('Space')||touch.has('boost'),pulse:pulseRequested},dt);
        pulseRequested=false;
      }
      syncAudio();
      if(run.collected>old.collected||run.ufosCollected>old.ufosCollected) {
        const ufo=run.ufosCollected>old.ufosCollected;
        $('voyage-pickup').textContent=`${ufo?'UFO! ':''}+${run.score-old.score} · ${Math.min(run.combo,5)}×`;
        $('voyage-pickup').classList.toggle('ufo-bonus',ufo);
        pickupUntil=time+850;burstAt=time;burstMaterial.color.set(ufo?0xc0a2ff:0xf3c878);
        sound.play(ufo?'ufo':'record',{combo:Math.min(run.combo,5)});
        if(ufo)$('voyage-callout').textContent='UFO intercepted. Warp charge restored.';
        $('voyage-accessible-status').textContent=`${ufo?'UFO bonus':'Gold record'}. ${run.score-old.score} points. Score ${run.score}.`;
      }
      if(old.pulseCooldown<=0&&run.pulseCooldown>0){sound.play('pulse');$('voyage-callout').textContent='Pickup pulse active. Reach for the next pickup.';}
      const approaching=run.ufos.find(ufo=>ufo.status==='ahead'&&ufo.t-run.progress<.045);
      if(time>pickupUntil&&run.pulseRemaining<=0) {
        $('voyage-callout').textContent=run.complete?(index===finalIndex?'24 hours of light. Still connected.':'A year closer to one light-day.'):
          run.elapsed<3?`${CHAPTERS[index].year} begins · Level ${index+1} of ${CHAPTERS.length}`:
          approaching?'Incoming UFO. Intercept the violet saucer!':'Chain gold records. Save your pulse for UFOs.';
      }
      if(time>pickupUntil)$('voyage-pickup').textContent='';
      if(run.complete&&!old.complete) {
        best[run.chapter]=Math.max(best[run.chapter]||0,run.score);
        journeyTotal+=run.score;transition=createTransition(index);showCompletion();
        $('voyage-accessible-status').textContent=`${CHAPTERS[index].year} complete. ${run.score} points. ${transition?`${CHAPTERS[transition.nextIndex].year} begins in four seconds.`:'Journey complete.'}`;
        sound.play(index===finalIndex?'finale':'complete');persist();
      }
      if(transition&&old.complete) {
        transition=stepTransition(transition,dt,run.paused||looking);
        if(transition.remaining<=0)advanceYear();
      }
      if(time-lastHUD>80){updateHUD();lastHUD=time;}
      const rect=canvas.getBoundingClientRect();
      if(rect.width>0&&rect.height>0) {
        if(canvas.width!==Math.round(rect.width*renderer.getPixelRatio()) || canvas.height!==Math.round(rect.height*renderer.getPixelRatio())) {
          renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
        }
        const frame=routeFrame(route,run.progress),origin=v(frame.position);
        if(started&&!run.paused&&!looking&&!encounterPlayed&&frame.jd>=encounterStart&&frame.jd<=encounterEnd) {
          encounterPlayed=true;sound.play('encounter',{final:index===finalIndex});
        }
        const forward=v(frame.forward),right=v(frame.right),up=v(frame.up);
        // Floating origin prevents precision loss at astronomical world coordinates.
        const units=900/route.distanceAU;
        const world=position=>v(position).sub(origin).multiplyScalar(units);
        const basis=new THREE.Matrix4().makeBasis(right,up,forward.clone().negate());
        const shipPosition=right.clone().multiplyScalar(run.x).addScaledVector(up,run.y);
        ship.position.copy(shipPosition);ship.quaternion.setFromRotationMatrix(basis);
        ship.rotateZ(-run.vx*.065);ship.rotateX(run.vy*.035);
        const portrait=rect.width<rect.height;
        let cameraOffset=forward.clone().multiplyScalar(-15).addScaledVector(up,portrait?3.5:6);
        if(looking) {
          cameraOffset.applyAxisAngle(up,lookYaw);
          cameraOffset.applyAxisAngle(right,lookPitch);
        }
        camera.position.copy(shipPosition).add(cameraOffset);
        camera.up.copy(up);
        const target=CHAPTERS[index].planet;
        const encounterDirection=target?world(stateAt(data.bodies[target].states,frame.jd).position).normalize():forward;
        camera.lookAt(looking?shipPosition:forward.clone().addScaledVector(encounterDirection,.3).normalize().multiplyScalar(36).addScaledVector(up,2));
        camera.updateMatrixWorld();
        const pickupCenter=shipPosition.clone().project(camera);
        const centerX=(pickupCenter.x*.5+.5)*rect.width,centerY=(-pickupCenter.y*.5+.5)*rect.height;
        const marker=$('pickup-center');
        marker.hidden=!started||looking||run.complete||pickupCenter.z<=-1||pickupCenter.z>=1||
          centerX<10||centerX>rect.width-10||centerY<10||centerY>rect.height-10;
        if(!marker.hidden) {
          marker.style.left=`${centerX}px`;marker.style.top=`${centerY}px`;
          marker.classList.toggle('label-left',centerX>rect.width-145);
          marker.classList.toggle('pulse-active',run.pulseRemaining>0);
        }
        const pickupRadius=run.pulseRemaining>0?PICKUP_RADII.pulse:PICKUP_RADII.coin;
        pickupHalo.visible=!marker.hidden;
        pickupHalo.position.copy(shipPosition);pickupHalo.quaternion.setFromRotationMatrix(basis);
        pickupHalo.scale.setScalar(pickupRadius);
        haloMaterial.color.set(run.pulseRemaining>0?0xc0a2ff:0x8edaf4);
        haloFillMaterial.color.copy(haloMaterial.color);
        canvas.dataset.pickupRadius=String(pickupRadius);
        canvas.dataset.pickupHalo=String(pickupHalo.visible);
        sky.position.copy(camera.position);
        skyDetails.position.copy(camera.position);
        sun.position.copy(world([0,0,0]).normalize().multiplyScalar(100));sun.target.position.set(0,0,0);
        rim.position.copy(camera.position).addScaledVector(up,10);
        for(const planet of planets) {
          const position=stateAt(data.bodies[planet.name].states,frame.jd).position;
          planet.group.position.copy(world(position));
          // Keep the enlarged body clear of the actual route even during a close flyby.
          const distance=planet.group.position.length();
          const enlarged=radiusKm[planet.name]/AU_KM*units*42;
          const radius=Math.min(enlarged,Math.max(.12,distance*(planet.name==='saturn'?.12:.2)));
          planet.group.scale.setScalar(radius);
          planet.sphere.rotation.y=frame.jd*.08;
          const projected=planet.group.position.clone().addScaledVector(up,radius*1.2).project(camera);
          const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.94&&Math.abs(projected.y)<.8;
          planet.label.hidden=!visible;
          if(visible) {
            planet.label.style.transform=`translate(${(projected.x*.5+.5)*rect.width}px,${(-projected.y*.5+.5)*rect.height}px)`;
            planet.distance.textContent=`${(distance/units*AU_KM/1e6).toFixed(2)} million km · game scale`;
          }
        }
        const occupied=[];
        for(const object of moonObjects) {
          const parent=planets.find(planet=>planet.name===object.moon.parent);
          const display=target===object.moon.parent?moonDisplay(object.moon,frame.jd,parent.group.scale.x,radiusKm[parent.name]):null;
          object.mesh.visible=Boolean(display);object.label.hidden=true;
          if(!display)continue;
          object.mesh.position.copy(parent.group.position).add(v(display.offset));
          object.mesh.scale.setScalar(display.radius);object.mesh.rotation.y=frame.jd*.2;
          const projected=object.mesh.position.clone().addScaledVector(up,display.radius*1.3).project(camera);
          const px=(projected.x*.5+.5)*rect.width,py=(-projected.y*.5+.5)*rect.height;
          const ray=object.mesh.position.clone().sub(camera.position),parentRay=parent.group.position.clone().sub(camera.position);
          const projection=parentRay.dot(ray)/ray.lengthSq();
          const behindParent=projection>0&&projection<1&&parentRay.clone().addScaledVector(ray,-projection).length()<parent.group.scale.x;
          const visible=!behindParent&&projected.z>-1&&projected.z<1&&px>15&&px<rect.width-165&&py>190&&py<rect.height-160&&
            occupied.every(([x,y])=>Math.abs(x-px)>155||Math.abs(y-py)>40);
          object.label.hidden=!visible;
          if(visible){object.label.style.transform=`translate(${px+8}px,${py}px)`;occupied.push([px,py]);}
        }
        canvas.dataset.moons=moonObjects.filter(object=>object.mesh.visible).map(object=>object.moon.name).join(',');
        for(const reference of references) {
            const projected=reference.marker.getWorldPosition(new THREE.Vector3()).project(camera);
            const px=(projected.x*.5+.5)*rect.width,py=(-projected.y*.5+.5)*rect.height;
            const visible=skyNames&&projected.z>-1&&projected.z<1&&px>25&&px<rect.width-190&&py>230&&py<rect.height-180&&
              occupied.every(([x,y])=>Math.abs(x-px)>180||Math.abs(y-py)>50);
            reference.label.hidden=!visible;
            if(visible){reference.label.style.transform=`translate(${px+10}px,${py}px)`;occupied.push([px,py]);}
        }
        const attr=pathGeometry.attributes.position;
        for(let i=0;i<attr.count;i++) {
          const f=routeFrame(route,Math.min(1,run.progress+i*.0018));
          const p=world(f.position);attr.setXYZ(i,p.x,p.y,p.z);
        }
        attr.needsUpdate=true;pathGeometry.computeBoundingSphere();
        for(const rock of rocks) {
          rock.mesh.visible=rock.t>run.progress-.025&&rock.t<run.progress+.22;
          if(!rock.mesh.visible)continue;
          const f=routeFrame(route,rock.t);
          rock.mesh.position.copy(world(f.position)).addScaledVector(v(f.right),rock.x).addScaledVector(v(f.up),rock.y);
          rock.mesh.rotation.set(rock.phase+(reducedMotion?0:run.elapsed*.08),rock.phase*.6,rock.phase*.3);
        }
        canvas.dataset.meteoroids=String(rocks.filter(rock=>rock.mesh.visible).length);
        run.coins.forEach((coin,i)=>{
          const object=coins[i];
          object.visible=coin.status==='ahead'&&coin.t>=run.progress&&coin.t<run.progress+.19;
          if(!object.visible)return;
          const f=routeFrame(route,coin.t),[x,y]=coinOffset(coin);
          object.position.copy(world(f.position)).addScaledVector(v(f.right),x).addScaledVector(v(f.up),y);
          object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(f.right),v(f.up),v(f.forward).negate()));
          if(!reducedMotion)object.rotateY(time*.002+i);
        });
        run.ufos.forEach((ufo,i)=>{
          const object=ufos[i];object.visible=ufo.status==='ahead'&&ufo.t>=run.progress&&ufo.t<run.progress+.21;
          if(!object.visible)return;
          const f=routeFrame(route,ufo.t),[x,y]=pickupOffset(ufo,run.progress);
          object.position.copy(world(f.position)).addScaledVector(v(f.right),x).addScaledVector(v(f.up),y);
          object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(f.right),v(f.up),v(f.forward).negate()));
          if(!reducedMotion){object.rotateY(run.elapsed*1.6+i);object.rotateZ(Math.sin(run.elapsed*1.3+i)*.15);}
        });
        pulseField.visible=run.pulseRemaining>0;pulseField.position.copy(shipPosition);
        pulseField.scale.setScalar(PICKUP_RADII.pulse*(1+(reducedMotion?0:Math.sin(run.pulseRemaining*12)*.04)));
        pulseField.material.opacity=.08+run.pulseRemaining/1.8*.16;
        gate.visible=index===finalIndex&&run.progress>.77;gateLabel.hidden=true;
        if(gate.visible) {
          const end=routeFrame(route,1);gate.position.copy(world(end.position));
          gate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(end.right),v(end.up),v(end.forward).negate()));
          const projected=gate.position.clone().addScaledVector(up,7).project(camera);
          if(projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.8&&Math.abs(projected.y)<.7) {
            gateLabel.hidden=false;gateLabel.style.transform=`translate(${(projected.x*.5+.5)*rect.width}px,${(-projected.y*.5+.5)*rect.height}px)`;
          }
        }
        const burstAge=(time-burstAt)/1000;
        burst.visible=!reducedMotion&&burstAge>=0&&burstAge<.8;
        if(burst.visible) {
          burst.position.copy(shipPosition);burstMaterial.opacity=1-burstAge/.8;
          for(let i=0;i<60;i++) {
            const theta=i*2.39996,z=1-2*(i+.5)/60,r=Math.sqrt(1-z*z),distance=burstAge*6;
            burstPositions[i*3]=r*Math.cos(theta)*distance;burstPositions[i*3+1]=r*Math.sin(theta)*distance;burstPositions[i*3+2]=z*distance;
          }
          burstGeometry.attributes.position.needsUpdate=true;
        }
        renderer.render(scene,camera);
      }
    }
    requestAnimationFrame(render);
  }
  selectChapter(0);requestAnimationFrame(render);
  return {setActive(value){active=value&&!contextLost;if(!value)pause();},pause};
}
