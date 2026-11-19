import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { moonDisplay, meteoroidScenery } from '../scenery.mjs';
import { stateAt, toJulian, AU_KM } from '../engine.mjs';
import { CHAPTERS, ENCOUNTER_WINDOWS, asDate } from '../arcade-core.mjs';
import { starField } from '../sky.mjs';

const data=JSON.parse(await readFile(new URL('../data/moons.json',import.meta.url),'utf8'));
const orbitalRanges={io:[390000,460000],europa:[620000,720000],ganymede:[1000000,1150000],
  callisto:[1750000,2000000],titan:[1100000,1350000],enceladus:[220000,260000]};

test('six named moons have real hourly parent-relative JPL states over their encounter window',()=>{
  assert.equal(Object.keys(data.bodies).length,6);
  for(const [key,moon] of Object.entries(data.bodies)){
    const url=new URL(moon.query),center=moon.parent==='jupiter'?'599':'699';
    assert.equal(url.origin,'https://ssd.jpl.nasa.gov');
    assert.equal(url.searchParams.get('CENTER'),`'500@${center}'`);
    assert.equal(url.searchParams.get('COMMAND'),`'${moon.command}'`);
    const chapter=ENCOUNTER_WINDOWS.find(chapter=>chapter.planet===moon.parent);
    assert.equal(moon.states[0][0],toJulian(asDate(chapter.start)));
    assert.equal(moon.states.at(-1)[0],toJulian(asDate(chapter.end)));
    assert.equal(moon.states.length,481);
    const year=CHAPTERS.find(chapter=>chapter.planet===moon.parent);
    assert.equal(moonDisplay(moon,toJulian(asDate(year.start)),12,71492),null);
    assert.equal(moonDisplay(moon,toJulian(asDate(year.end)),12,71492),null);
    for(let i=0;i<moon.states.length;i++){
      const row=moon.states[i];assert.equal(row.length,7);assert.ok(row.every(Number.isFinite));
      if(i)assert.ok(Math.abs(row[0]-moon.states[i-1][0]-1/24)<1e-8);
      const radius=Math.hypot(...row.slice(1,4))*AU_KM;
      assert.ok(radius>orbitalRanges[key][0]&&radius<orbitalRanges[key][1],`${key} has a physical parent-relative orbit`);
    }
  }
});

test('display compression keeps JPL orbital directions while exposing real orbital distances',()=>{
  for(const moon of Object.values(data.bodies)){
    const jd=moon.states[100][0]+.013;
    const position=stateAt(moon.states,jd).position,length=Math.hypot(...position);
    const display=moonDisplay(moon,jd,12,moon.parent==='jupiter'?71492:60268);
    for(let i=0;i<3;i++)assert.ok(Math.abs(position[i]/length-display.offset[i]/Math.hypot(...display.offset))<1e-10);
    assert.ok(Math.abs(display.orbitKm-length*AU_KM)<1e-6);
    assert.ok(Math.hypot(...display.offset)>12+display.radius);
    assert.ok(display.radius>0&&display.radius<=12*.15);
    assert.equal(moonDisplay(moon,moon.states[0][0]-1,12,71492),null);
    assert.equal(moonDisplay(moon,moon.states.at(-1)[0]+1,12,71492),null);
  }
});

test('moons move with historical time rather than looping on animation-clock time',()=>{
  const moon=data.bodies.io,t=moon.states[0][0];
  assert.notDeepEqual(moonDisplay(moon,t,10,71492).offset,moonDisplay(moon,t+.25,10,71492).offset);
  assert.deepEqual(moonDisplay(moon,t,10,71492),moonDisplay(moon,t,10,71492));
});

test('illustrative meteoroids are deterministic, sparse and outside the steering corridor',()=>{
  const rocks=meteoroidScenery();
  assert.deepEqual(rocks,meteoroidScenery());
  assert.equal(rocks.length,18);
  for(const rock of rocks){
    assert.ok(rock.t>0&&rock.t<1);
    assert.ok(Math.abs(rock.x)-rock.size>4+3);
    assert.ok(rock.size>0&&rock.size<1.3);
  }
});

test('the richer starfield is deterministic, spherical and bounded to three point batches',()=>{
  const layers=starField();
  assert.deepEqual(layers,starField());
  assert.equal(layers.length,3);
  assert.equal(layers.reduce((total,layer)=>total+layer.count,0),15160);
  assert.equal(layers.find(layer=>layer.name==='bright').count,160);
  for(const layer of layers){
    assert.equal(layer.positions.length,layer.count*3);
    assert.equal(layer.colors.length,layer.positions.length);
    assert.ok(layer.size>=1&&layer.size<=4.5);
    assert.ok(layer.opacity>0&&layer.opacity<=1);
    assert.ok(layer.colors.every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=1));
    let warm=0,cool=0;
    for(let i=0;i<layer.positions.length;i+=3){
      assert.ok(Math.abs(Math.hypot(...layer.positions.slice(i,i+3))-layer.radius)<1e-8);
      if(layer.colors[i]>layer.colors[i+2])warm++;
      else cool++;
    }
    assert.ok(warm>layer.count*.1&&warm<layer.count*.22);
    assert.ok(cool>layer.count*.7);
  }
});
