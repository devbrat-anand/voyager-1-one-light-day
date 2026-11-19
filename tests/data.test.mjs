import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateAt, toJulian, missionStats } from '../engine.mjs';

const data = JSON.parse(await readFile(new URL('../data/ephemeris.json', import.meta.url), 'utf8'));

test('all seven actual Horizons datasets have valid, ordered, full 3D states', () => {
  assert.equal(Object.keys(data.bodies).length, 7);
  for (const body of Object.values(data.bodies)) {
    assert.ok(body.query.startsWith('https://ssd.jpl.nasa.gov/api/horizons.api?'));
    assert.ok(body.states.length >= 600);
    for (const [i, row] of body.states.entries()) {
      assert.equal(row.length, 7);
      assert.ok(row.every(Number.isFinite));
      if (i) assert.ok(row[0] > body.states[i-1][0]);
    }
  }
});

test('interpolated Voyager 1 agrees with an independent daily Horizons query', () => {
  const jd = toJulian(new Date('2026-11-14T00:00:00Z'));
  const actual = stateAt(data.bodies.voyager1.states, jd);
  const reference = [-32.21561926657422, -137.1704968474147, 99.24508247603869];
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual.position[i]-reference[i]) < 0.000001);
});

test('Voyager 1 is approximately one light-day from Earth in November 2026', () => {
  const jd = toJulian(new Date('2026-11-18T10:16:07Z'));
  const stats = missionStats(stateAt(data.bodies.voyager1.states,jd),stateAt(data.bodies.earth.states,jd));
  assert.ok(Math.abs(stats.lightSeconds-86400)<120);
  assert.ok(stats.sunAU>170 && stats.sunAU<175);
  assert.ok(stats.speedKmS>16 && stats.speedKmS<18);
});
