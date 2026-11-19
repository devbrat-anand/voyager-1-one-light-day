import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAPTERS, ENCOUNTER_WINDOWS, MILESTONE_UTC, TRANSITION_SECONDS, PICKUP_RADII, buildRoute, routeFrame, createRun, stepRun, coinOffset, pickupOffset, createTransition, stepTransition } from '../arcade-core.mjs';
import { stateAt, fromJulian } from '../engine.mjs';
import { SKY_REFERENCES, eclipticDirection } from '../sky.mjs';

const data = JSON.parse(await readFile(new URL('../data/ephemeris.json', import.meta.url), 'utf8'));

test('all 50 years follow actual Voyager 1 3D ephemeris states', () => {
  for (const chapter of CHAPTERS) {
    const route = buildRoute(data, chapter);
    for (const t of [0, .3, .7, 1]) {
      const frame = routeFrame(route, t);
      const reference = stateAt(data.bodies.voyager1.states, frame.jd).position;
      assert.deepEqual(frame.position, reference);
      assert.ok(Math.abs(Math.hypot(...frame.forward)-1)<1e-10);
      assert.ok(Math.abs(frame.right.reduce((sum,v,i)=>sum+v*frame.up[i],0))<1e-10);
    }
    assert.ok(route.distanceAU > 0);
    assert.equal(createRun(chapter).coins.length, 45);
    assert.equal(createRun(chapter).ufos.length, 6);
  }
});

test('coins are swept through between frames instead of tunneling past the ship', () => {
  const run = createRun(CHAPTERS[0]);
  const t = run.coins[0].t, offset = coinOffset(run.coins[0]);
  const state = { ...run, progress:t-.001, x:offset[0], y:offset[1], vx:0, vy:0 };
  const next = stepRun(state,{x:0,y:0,boost:false},1);
  assert.equal(next.collected,1);
  assert.equal(next.coins[0].status,'collected');
  assert.ok(next.score >= 100);
});

test('missing coins resets combo, while collected coins cannot score twice', () => {
  let state=createRun(CHAPTERS[0]);
  state={...state,progress:state.coins[0].t-.001,x:4,y:3,combo:3};
  const missed=stepRun(state,{x:0,y:0,boost:false},1);
  assert.equal(missed.coins[0].status,'missed');
  assert.equal(missed.combo,0);
  const offset=coinOffset(state.coins[0]);
  state={...state,x:offset[0],y:offset[1]};
  const collected=stepRun(state,{x:0,y:0,boost:false},1);
  const again=stepRun(collected,{x:0,y:0,boost:false},0.01);
  assert.equal(again.score,collected.score);
});

test('keyboard steering remains within the arcade corridor', () => {
  let state=createRun(CHAPTERS[0]);
  for(let i=0;i<1000;i++) state=stepRun(state,{x:1,y:1,boost:false},.1);
  assert.ok(state.x <= 4 && state.y <= 3);
  assert.ok(state.progress <= 1);
});

test('paused and completed runs never advance or award points', () => {
  const state={...createRun(CHAPTERS[0]),paused:true};
  assert.equal(stepRun(state,{x:1,y:1,boost:true},1),state);
  const done={...state,paused:false,complete:true};
  assert.equal(stepRun(done,{x:1,y:1,boost:true},1),done);
});

test('boost consumes finite charge, regenerates and cannot exceed its bounds', () => {
  let boosted=createRun(CHAPTERS[0]), normal=createRun(CHAPTERS[0]);
  for(let i=0;i<30;i++) {
    boosted=stepRun(boosted,{x:0,y:0,boost:true},.1);
    normal=stepRun(normal,{x:0,y:0,boost:false},.1);
  }
  assert.ok(boosted.progress>normal.progress);
  assert.ok(boosted.charge<normal.charge);
  for(let i=0;i<300;i++) boosted=stepRun(boosted,{x:0,y:0,boost:false},.1);
  assert.ok(boosted.charge<=1 && boosted.charge>=0);
});

test('a chapter ends with all coins classified and a reproducible result', () => {
  let state=createRun(CHAPTERS[0]);
  for(let i=0;i<2000 && !state.complete;i++) state=stepRun(state,{x:0,y:0,boost:false},.1);
  assert.equal(state.complete,true);
  assert.equal(state.progress,1);
  assert.ok(state.coins.every(coin=>coin.status!=='ahead'));
  assert.equal(state.collected,state.coins.filter(coin=>coin.status==='collected').length);
});

test('all encounters include actual three-hour JPL coverage, not just coarse samples', () => {
  const body=data.bodies.voyager1;
  assert.equal(body.encounterQueries.length,4);
  for(const chapter of ENCOUNTER_WINDOWS) {
    const route=buildRoute(data,chapter);
    const samples=body.states.filter(row=>row[0]>=route.samples[0].jd && row[0]<=route.samples.at(-1).jd);
    assert.ok(samples.length>=161);
    for(let i=1;i<samples.length;i++) assert.ok(samples[i][0]-samples[i-1][0]<=.125);
  }
});

test('the final chapter ends exactly at NASA’s announced light-day epoch',()=>{
  assert.equal(CHAPTERS.find(chapter=>chapter.year===2012).planet,null);
  assert.equal(CHAPTERS.at(-1).planet,null);
  assert.equal(CHAPTERS.at(-1).end,MILESTONE_UTC);
  const frame=routeFrame(buildRoute(data,CHAPTERS.at(-1)),1);
  assert.ok(Math.abs(fromJulian(frame.jd).getTime()-Date.parse(MILESTONE_UTC))<2);
});

test('a centered first UFO awards 750, recharges warp and cannot be scored twice',()=>{
  const run=createRun(CHAPTERS[0]),ufo=run.ufos[0];
  const state={...run,coins:[],ufos:[ufo],progress:ufo.t-.001,charge:.2};
  const next=stepRun(state,{x:0,y:0,boost:false},.2);
  assert.equal(next.ufosCollected,1);
  assert.equal(next.collected,0);
  assert.equal(next.score,750);
  assert.equal(next.ufos[0].status,'collected');
  assert.ok(Math.abs(next.charge-.424)<1e-10);
  assert.equal(stepRun(next,{x:0,y:0},.1).score,750);
  assert.equal(state.ufos[0].status,'ahead');
});

test('UFO motion stays within the steering corridor and is centered on its first crossing',()=>{
  const ufos=createRun(CHAPTERS[0]).ufos;
  assert.deepEqual(pickupOffset(ufos[0],ufos[0].t),[0,0]);
  assert.notDeepEqual(pickupOffset(ufos[0],ufos[0].t-.03),pickupOffset(ufos[0],ufos[0].t));
  for(const ufo of ufos)for(let p=0;p<=1;p+=.01){
    const [x,y]=pickupOffset(ufo,p);assert.ok(Math.abs(x)<=3.5&&Math.abs(y)<=2.5);
  }
});

test('missing a UFO preserves a coin combo; mixed crossings score chronologically',()=>{
  const run=createRun(CHAPTERS[0]);
  const ufo={...run.ufos[0],t:.15};
  const missed=stepRun({...run,coins:[],ufos:[ufo],progress:.149,x:4,y:3,combo:4},{x:0,y:0},.2);
  assert.equal(missed.combo,4);assert.equal(missed.ufos[0].status,'missed');assert.equal(missed.score,0);
  const coin={...run.coins[0],t:.151};
  const both=stepRun({...run,coins:[coin],ufos:[ufo],progress:.149},{x:0,y:0},1);
  assert.equal(both.score,750+200);
  assert.equal(both.combo,2);
  const maxed=stepRun({...run,coins:[],ufos:[ufo],progress:.149,combo:7},{x:0,y:0,boost:true},.2);
  assert.equal(maxed.score,3750);
});

test('pulse widens pickup radius for 1.8 seconds and has a 14-second cooldown',()=>{
  const run=createRun(CHAPTERS[0]),coin=run.coins[0];
  const state={...run,coins:[coin],ufos:[],progress:coin.t-.001,x:2,y:0};
  const without=stepRun(state,{x:0,y:0},.2);
  const withPulse=stepRun(state,{x:0,y:0,pulse:true},.2);
  assert.equal(without.score,0);assert.equal(withPulse.score,100);
  assert.equal(withPulse.pulseRemaining,1.6);assert.equal(withPulse.pulseCooldown,13.8);
  const waiting=stepRun(withPulse,{x:0,y:0,pulse:true},2);
  assert.equal(waiting.pulseRemaining,0);assert.equal(waiting.pulseCooldown,11.8);
  const ready=stepRun(waiting,{x:0,y:0},12);
  assert.equal(ready.pulseCooldown,0);
  assert.ok(stepRun(ready,{x:0,y:0,pulse:true},.1).pulseRemaining>1.6);
});

test('gold and UFO reach is 25% wider, with inclusive circular boundaries and unchanged pulse reach',()=>{
  assert.equal(PICKUP_RADII.coin,1.05*1.25);
  assert.equal(PICKUP_RADII.ufo,1.3*1.25);
  assert.equal(PICKUP_RADII.pulse,2.65);
  for(const kind of ['coin','ufo']){
    const run=createRun(CHAPTERS[0]),pickup=kind==='coin'?run.coins[0]:run.ufos[0];
    const radius=PICKUP_RADII[kind],oldRadius=radius/1.25;
    for(const [x,y,hit] of [
      [(oldRadius+radius)/2,0,true],[radius,0,true],[radius+.001,0,false],
      [0,-radius,true],[radius*.8,radius*.8,false],
    ]){
      const state={...run,coins:kind==='coin'?[pickup]:[],ufos:kind==='ufo'?[pickup]:[],
        progress:pickup.t,x,y};
      const result=stepRun(state,{x:0,y:0},.01);
      assert.equal(result.score,hit?(kind==='coin'?100:750):0,`${kind} at (${x}, ${y})`);
      assert.equal(stepRun(result,{x:0,y:0},.01).score,result.score);
    }
    for(const [x,hit] of [[2.65,true],[2.651,false]]){
      const state={...run,coins:kind==='coin'?[pickup]:[],ufos:kind==='ufo'?[pickup]:[],
        progress:pickup.t,x};
      assert.equal(stepRun(state,{x:0,y:0,pulse:true},.01).score,hit?(kind==='coin'?100:750):0);
    }
  }
});

test('pulse collisions use the moment of crossing, not just the end-of-frame state',()=>{
  const run=createRun(CHAPTERS[0]);
  const state={...run,ufos:[],x:2,coins:[{...run.coins[0],t:.01},{...run.coins[0],t:.03}]};
  const result=stepRun(state,{x:0,y:0,pulse:true},4);
  assert.equal(result.coins[0].status,'collected');
  assert.equal(result.coins[1].status,'missed');
});

test('all UFO statuses are resolved on completion and replay starts clean',()=>{
  let run=createRun(CHAPTERS[3]);
  while(!run.complete)run=stepRun(run,{x:0,y:0},.1);
  assert.ok(run.ufos.every(ufo=>ufo.status!=='ahead'));
  assert.equal(run.ufosCollected,run.ufos.filter(ufo=>ufo.status==='collected').length);
  assert.ok(run.ufosCollected>0);
  const replay=createRun(CHAPTERS[3]);
  assert.equal(replay.ufosCollected,0);assert.equal(replay.pulseCooldown,0);assert.equal(replay.score,0);
});

test('named references transform J2000 equatorial positions to unit ecliptic directions',()=>{
  assert.deepEqual(eclipticDirection(0,0),[1,0,0]);
  const north=eclipticDirection(0,90);
  assert.ok(Math.abs(north[1]-Math.sin(23.4392911*Math.PI/180))<1e-12);
  for(const reference of SKY_REFERENCES)assert.ok(Math.abs(Math.hypot(...eclipticDirection(reference.ra,reference.dec))-1)<1e-12);
});

test('a route refuses missing epoch coverage instead of silently clamping JPL data',()=>{
  const truncated={bodies:{voyager1:{states:data.bodies.voyager1.states.slice(-2)}}};
  assert.throws(()=>buildRoute(truncated,CHAPTERS[0]),/does not cover/);
});

test('a long final frame stops simulation time and pulse timing at the finish',()=>{
  const run={...createRun(CHAPTERS[0]),progress:.999};
  const result=stepRun(run,{x:0,y:0,pulse:true},10);
  assert.equal(result.progress,1);
  const remaining=run.duration*.001;
  assert.ok(Math.abs(result.elapsed-remaining)<1e-10);
  assert.ok(Math.abs(result.pulseRemaining-(1.8-remaining))<1e-10);
});

test('50 contiguous calendar-year levels use the approved quiet and milestone durations',()=>{
  assert.equal(CHAPTERS.length,50);
  assert.equal(CHAPTERS[0].start,'1977-09-06');
  assert.equal(CHAPTERS.at(-1).end,MILESTONE_UTC);
  const milestoneYears=[1977,1979,1980,1990,1998,2004,2012,2026];
  assert.deepEqual(CHAPTERS.filter(chapter=>chapter.milestone).map(chapter=>chapter.year),milestoneYears);
  for(const [i,chapter] of CHAPTERS.entries()){
    assert.equal(chapter.year,1977+i);assert.equal(chapter.id,String(chapter.year));
    if(i)assert.equal(CHAPTERS[i-1].end,chapter.start);
    if(chapter.milestone)assert.ok(chapter.duration>=80&&chapter.duration<=100);
    else assert.equal(chapter.duration,45);
  }
  assert.equal(CHAPTERS.reduce((total,chapter)=>total+chapter.duration,0),2610);
});

test('every year finishes in its declared unboosted duration with all pickups classified',()=>{
  for(const chapter of CHAPTERS){
    let run=createRun(chapter);
    while(!run.complete)run=stepRun(run,{x:0,y:0},.5);
    assert.equal(run.progress,1);assert.ok(Math.abs(run.elapsed-chapter.duration)<1e-8);
    assert.ok(run.coins.every(coin=>coin.status!=='ahead'));
    assert.ok(run.ufos.every(ufo=>ufo.status!=='ahead'));
    assert.ok(run.score>=750);
    assert.equal(stepRun(run,{x:0,y:0},1),run);
  }
});

test('annual pickup patterns are varied and reproducible with an approachable opening',()=>{
  assert.deepEqual(createRun(CHAPTERS[1]),createRun(CHAPTERS[1]));
  assert.notDeepEqual(createRun(CHAPTERS[1]).coins,createRun(CHAPTERS[2]).coins);
  for(const chapter of CHAPTERS){
    const run=createRun(chapter);
    assert.deepEqual(coinOffset(run.coins[0]),[0,0]);
    assert.deepEqual(pickupOffset(run.ufos[0],run.ufos[0].t),[0,0]);
  }
});

test('four-second transitions advance only to the immediate next year and never wrap the finale',()=>{
  for(let i=0;i<CHAPTERS.length-1;i++){
    const transition=createTransition(i);
    assert.equal(transition.nextIndex,i+1);assert.equal(transition.remaining,TRANSITION_SECONDS);
    assert.equal(stepTransition(transition,10,true),transition);
    assert.equal(stepTransition(transition,0),transition);
    assert.equal(stepTransition(transition,1).remaining,3);
    assert.equal(stepTransition(stepTransition(transition,1),20).remaining,0);
    assert.equal(transition.remaining,4);
  }
  assert.equal(createTransition(CHAPTERS.length-1),null);
  assert.equal(stepTransition(null,10),null);
});
