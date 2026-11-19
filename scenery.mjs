import { stateAt, AU_KM } from './engine.mjs';

export function moonDisplay(moon,jd,parentRadius,parentPhysicalRadius) {
  if(jd<moon.states[0][0]||jd>moon.states.at(-1)[0])return null;
  const {position}=stateAt(moon.states,jd);
  const distance=Math.hypot(...position),orbitKm=distance*AU_KM;
  const displayDistance=parentRadius*(1.4+Math.log1p(orbitKm/parentPhysicalRadius)*.65);
  return {
    offset:position.map(value=>value/distance*displayDistance),
    radius:Math.min(parentRadius*.15,Math.max(.06,parentRadius*moon.radiusKm/parentPhysicalRadius*3)),
    orbitKm,
  };
}

export function meteoroidScenery() {
  return Array.from({length:18},(_,i)=>({
    t:.055+i*.051,
    x:(i%2===0?1:-1)*(10+(Math.sin(i*12.7)+1)*5),
    y:Math.sin(i*2.7)*7,
    size:.35+(Math.sin(i*7.9)+1)*.45,
    phase:i*1.7,
  }));
}
