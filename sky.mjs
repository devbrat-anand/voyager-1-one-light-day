// Approximate J2000 equatorial positions; rendered as distant direction references.
export const SKY_REFERENCES = [
  {name:'Vega',ra:279.2347,dec:38.7837,color:0xb6d5ff,note:'Lyra · distant star'},
  {name:'Altair',ra:297.6958,dec:8.8683,color:0xd9e6ff,note:'Aquila · distant star'},
  {name:'Deneb',ra:310.3580,dec:45.2803,color:0xc2dcff,note:'Cygnus · distant star'},
  {name:'Antares',ra:247.3519,dec:-26.4320,color:0xffae85,note:'Scorpius · distant star'},
  {name:'Polaris',ra:37.9546,dec:89.2641,color:0xffe6bf,note:'Ursa Minor · distant star'},
  {name:'Galactic center',ra:266.4168,dec:-29.0078,color:0xe9bfd7,note:'Sagittarius A* direction · not a nearby object'},
];

export function eclipticDirection(ra,dec) {
  const r=ra*Math.PI/180,d=dec*Math.PI/180,e=23.4392911*Math.PI/180;
  const x=Math.cos(d)*Math.cos(r),y=Math.cos(d)*Math.sin(r),z=Math.sin(d);
  return [x,y*Math.cos(e)+z*Math.sin(e),-y*Math.sin(e)+z*Math.cos(e)];
}

export function starField() {
  let seed=19770905;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const palette=[[.64,.78,1],[.85,.9,1],[1,.86,.67]];
  return [
    {name:'field',count:7200,radius:12000,size:2.4,opacity:.9},
    {name:'bright',count:160,radius:11800,size:4.4,opacity:.95},
    {name:'band',count:7800,radius:11000,size:1.5,opacity:.8},
  ].map(layer=>{
    const positions=[],colors=[];
    for(let i=0;i<layer.count;i++){
      const angle=random()*Math.PI*2;
      let x,y,z;
      if(layer.name==='band'){
        const width=(random()+random()+random()-1.5)*.24,length=Math.hypot(1,width);
        x=Math.cos(angle)/length;y=Math.sin(angle)/length;z=width/length;
        [y,z]=[y*Math.cos(1.05)-z*Math.sin(1.05),y*Math.sin(1.05)+z*Math.cos(1.05)];
      }else{
        z=random()*2-1;
        const radius=Math.sqrt(1-z*z);x=Math.cos(angle)*radius;y=Math.sin(angle)*radius;
      }
      positions.push(x*layer.radius,y*layer.radius,z*layer.radius);
      const tint=random(),color=palette[tint<.16?2:tint<.58?0:1];
      const brightness=layer.name==='bright'?.8+random()*.2:layer.name==='band'?.3+random()*.35:.45+random()*.45;
      colors.push(...color.map(channel=>channel*brightness));
    }
    return {...layer,positions,colors};
  });
}
