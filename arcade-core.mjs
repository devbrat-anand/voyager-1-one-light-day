import { clamp, toJulian, stateAt } from './engine.mjs';

export const MILESTONE_UTC = '2026-11-18T10:16:07Z';
export const asDate = text => new Date(text.includes('T') ? text : `${text}T00:00:00Z`);
export const ENCOUNTER_WINDOWS = [
  {planet:'jupiter',start:'1979-02-23',end:'1979-03-15'},
  {planet:'saturn',start:'1980-11-02',end:'1980-11-22'},
  {planet:null,start:'2012-08-15',end:'2012-09-04'},
  {planet:null,start:'2026-10-29',end:MILESTONE_UTC},
];
const milestones = {
  1977:{name:'A little Earth takes flight',duration:80,story:'Voyager 1 launches on 5 September 1977. Our bundled JPL flight coverage begins on 6 September. Carry the golden record into the first year of an extraordinary journey.'},
  1979:{name:'Jupiter slingshot',planet:'jupiter',duration:95,story:'Voyager 1 sweeps past Jupiter on 5 March. Watch the giant and its moons during the encounter, gather golden records and intercept violet UFO bonuses.'},
  1980:{name:'Saturn farewell',planet:'saturn',duration:100,story:'Voyager 1 passes Saturn on 12 November, encounters Titan and heads out of the planetary plane. One last giant before the long dark.'},
  1990:{name:'The Pale Blue Dot',duration:80,story:'Voyager 1 turns its cameras homeward for the Family Portrait, including the Pale Blue Dot. This level follows the real route; it is not a live camera view.'},
  1998:{name:'Farther than any spacecraft',duration:80,story:'Voyager 1 overtakes Pioneer 10 as the most distant human-made object from the Sun. Keep the pickup streak alive as Earth grows more distant.'},
  2004:{name:'Across the termination shock',duration:85,story:'Voyager 1 crosses the termination shock, where the solar wind slows abruptly. Follow the real trajectory; the boundary is not a visible wall.'},
  2012:{name:'Beyond the heliopause',duration:100,story:'On 25 August, Voyager 1 crosses the heliopause into interstellar space. The stars are distant sky references, not nearby destinations.'},
  2026:{name:'One light-day from home',duration:100,story:'Fly to 18 November 2026, 10:16:07 UTC: NASA’s announced one-light-day milestone. A signal needs a full day to cross the distance back to Earth.'},
};
export const CHAPTERS = Array.from({length:50},(_,i)=>{
  const year=1977+i,milestone=milestones[year];
  return {
    id:String(year),year,planet:milestone?.planet??null,milestone:Boolean(milestone),
    name:milestone?.name??(year<2012?'The long outward journey':'Through interstellar space'),
    start:year===1977?'1977-09-06':`${year}-01-01`,
    end:year===2026?MILESTONE_UTC:`${year+1}-01-01`,
    duration:milestone?.duration??45,
    story:milestone?.story??`${year}. ${year-1977} years beyond launch. ${year<2012?'Voyager 1 continues outward through the outer heliosphere.':'Voyager 1 travels through interstellar space, still within the Sun’s wider gravitational domain.'} Follow this year’s real JPL route and build your score on the way to one light-day.`,
  };
});
export const TRANSITION_SECONDS = 4;
export const PICKUP_RADII = Object.freeze({coin:1.05*1.25,ufo:1.3*1.25,pulse:2.65});
export function createTransition(completedIndex) {
  return completedIndex<CHAPTERS.length-1?{nextIndex:completedIndex+1,remaining:TRANSITION_SECONDS}:null;
}
export function stepTransition(transition,dt,paused=false) {
  if(!transition||paused||dt<=0)return transition;
  return {...transition,remaining:Math.max(0,transition.remaining-dt)};
}

const subtract = (a,b) => a.map((v,i)=>v-b[i]);
const normalize = a => { const length=Math.hypot(...a); return a.map(v=>v/length); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function buildRoute(data, chapter) {
  const start=toJulian(asDate(chapter.start));
  const end=toJulian(asDate(chapter.end));
  const states=data.bodies.voyager1.states;
  if(states[0][0]>start||states.at(-1)[0]<end) {
    throw new RangeError(`Voyager 1 data does not cover the ${chapter.name} chapter`);
  }
  const samples=[];
  let distanceAU=0, previous=null;
  for(let i=0;i<=600;i++) {
    const jd=start+(end-start)*i/600, position=stateAt(states,jd).position;
    if(previous) distanceAU+=Math.hypot(...subtract(position,previous));
    samples.push({jd,position,distance:distanceAU}); previous=position;
  }
  return {chapter,states,samples,distanceAU};
}

export function routeFrame(route, progress) {
  const distance=clamp(progress,0,1)*route.distanceAU;
  let low=0, high=route.samples.length-1;
  while(high-low>1) {
    const mid=(low+high)>>1;
    if(route.samples[mid].distance<=distance) low=mid; else high=mid;
  }
  const a=route.samples[low], b=route.samples[high];
  const t=(distance-a.distance)/(b.distance-a.distance);
  const jd=a.jd+(b.jd-a.jd)*t, state=stateAt(route.states,jd);
  const forward=normalize(state.velocity);
  const reference=Math.abs(forward[2])>.98?[0,1,0]:[0,0,1];
  const right=normalize(cross(forward,reference)), up=normalize(cross(right,forward));
  return {jd,position:state.position,forward,right,up};
}

export function createRun(chapter) {
  const variant=(chapter.year??1977)-1977;
  return {chapter:chapter.id,duration:chapter.duration,progress:0,x:0,y:0,vx:0,vy:0,
    score:0,collected:0,combo:0,maxCombo:0,charge:1,boosting:false,elapsed:0,
    ufosCollected:0,pulseRemaining:0,pulseCooldown:0,
    paused:false,complete:false,
    coins:Array.from({length:45},(_,i)=>({
      t:.035+i*.021, lane:i<3?0:Math.round(Math.sin(Math.floor(i/3)*1.7+variant*.61)),
      height:i<6?0:Math.round(Math.sin(Math.floor(i/6)*2.1+variant*.43)), status:'ahead',
    })),
    ufos:Array.from({length:6},(_,i)=>({
      t:.15+i*.14,lane:i===0?0:Math.round(Math.sin(i*2.7)),
      height:i===0?0:Math.round(Math.cos(i*1.9+variant*.3)),phase:i===0?0:i*1.3+variant*.2,status:'ahead',kind:'ufo',
    })),
  };
}

export function coinOffset(coin) { return [coin.lane*2.7,coin.height*1.8]; }

export function pickupOffset(pickup,progress) {
  const [x,y]=coinOffset(pickup);
  if(pickup.kind!=='ufo')return [x,y];
  const phase=(progress-pickup.t)*55+pickup.phase;
  return [clamp(x+Math.sin(phase)*1.5,-3.5,3.5),clamp(y+Math.sin(phase*.7)*.8,-2.5,2.5)];
}

export function stepRun(state,input,dt) {
  if(state.paused || state.complete || dt<=0) return state;
  const boosting=Boolean(input.boost && state.charge>.08);
  dt=Math.min(dt,(1-state.progress)*state.duration/(boosting?1.8:1));
  let charge=clamp(state.charge+dt*(boosting?-.28:.12),0,1);
  const activate=Boolean(input.pulse && state.pulseCooldown<=0);
  const pulseRemaining=Math.max(0,(activate?1.8:state.pulseRemaining)-dt);
  const pulseCooldown=Math.max(0,(activate?14:state.pulseCooldown)-dt);
  const steer=1-Math.exp(-7*dt);
  const vx=state.vx+(clamp(input.x,-1,1)*6-state.vx)*steer;
  const vy=state.vy+(clamp(input.y,-1,1)*5-state.vy)*steer;
  const x=clamp(state.x+vx*dt,-4,4), y=clamp(state.y+vy*dt,-3,3);
  const progress=Math.min(1,state.progress+dt/state.duration*(boosting?1.8:1));
  let {score,collected,combo,maxCombo,ufosCollected}=state;
  let coins=state.coins,ufos=state.ufos;
  const crossed=[
    ...state.coins.map((pickup,index)=>({pickup,index,kind:'coin'})),
    ...state.ufos.map((pickup,index)=>({pickup,index,kind:'ufo'})),
  ].filter(({pickup})=>pickup.status==='ahead'&&pickup.t<=progress).sort((a,b)=>a.pickup.t-b.pickup.t);
  for(const {pickup,index,kind} of crossed) {
    const fraction=clamp((pickup.t-state.progress)/(progress-state.progress),0,1);
    const shipX=state.x+(x-state.x)*fraction, shipY=state.y+(y-state.y)*fraction;
    const [cx,cy]=pickupOffset(pickup,pickup.t);
    const pulseAtCrossing=(activate?1.8:state.pulseRemaining)>dt*fraction;
    const hit=Math.hypot(shipX-cx,shipY-cy)<=PICKUP_RADII[pulseAtCrossing?'pulse':kind];
    if(hit) {
      if(kind==='ufo'){ufosCollected++;charge=clamp(charge+.2,0,1);}else collected++;
      combo++;maxCombo=Math.max(maxCombo,combo);
      score+=(kind==='ufo'?750:100)*Math.min(combo,5);
    } else if(kind==='coin')combo=0;
    if(kind==='coin') {
      if(coins===state.coins)coins=state.coins.slice();
      coins[index]={...pickup,status:hit?'collected':'missed'};
    } else {
      if(ufos===state.ufos)ufos=state.ufos.slice();
      ufos[index]={...pickup,status:hit?'collected':'missed'};
    }
  }
  return {...state,x,y,vx,vy,progress,charge,boosting,elapsed:state.elapsed+dt,
    score,collected,combo,maxCombo,coins,ufos,ufosCollected,pulseRemaining,pulseCooldown,complete:progress>=1};
}
