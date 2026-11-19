import test from 'node:test';
import assert from 'node:assert/strict';
import { AU_KM, C_KM_S, toJulian, fromJulian, stateAt, missionStats, flyby,
  signalQuality, advanceLink, createPowerState, advancePower } from '../engine.mjs';

test('UTC and Julian dates round-trip without local-time dependence', () => {
  const date = new Date('2000-01-01T12:00:00Z');
  assert.equal(toJulian(date), 2451545);
  assert.equal(fromJulian(toJulian(date)).toISOString(), date.toISOString());
});

test('Hermite interpolation uses endpoint velocities, not linear positions', () => {
  const states = [[0, 0, 0, 0, 0, 0, 0], [2, 8, 0, 0, 12, 0, 0]];
  const result = stateAt(states, 1);
  assert.equal(result.position[0], 1);
  assert.equal(result.velocity[0], 3);
  assert.deepEqual(stateAt(states, 2).position, [8, 0, 0]);
  assert.throws(() => stateAt(states, 3), RangeError);
  assert.throws(() => stateAt(states, -1), RangeError);
});

test('Earth range and radio delay use Earth-relative 3D position', () => {
  const probe = { position: [4, 5, 6], velocity: [0.01, 0, 0] };
  const earth = { position: [1, 1, 6], velocity: [0, 0, 0] };
  const stats = missionStats(probe, earth);
  assert.equal(stats.distanceAU, 5);
  assert.equal(stats.lightSeconds, 5 * AU_KM / C_KM_S);
  assert.equal(stats.speedKmS, 0.01 * AU_KM / 86400);
});

test('Jupiter flyby obeys hyperbolic scattering and detects impact', () => {
  const a = flyby(8, 12);
  assert.ok(a.periapsisKm > 71492);
  assert.ok(a.deflectionDeg > 0 && a.deflectionDeg < 180);
  assert.ok(flyby(12, 12).deflectionDeg < a.deflectionDeg);
  assert.ok(flyby(8, 20).deflectionDeg < a.deflectionDeg);
  assert.equal(flyby(0.5, 12).safe, false);
  assert.throws(() => flyby(-1, 12), RangeError);
});

test('radio beam quality is symmetric and falls off away from target', () => {
  assert.equal(signalQuality(0, 0, 0, 0), 1);
  assert.equal(signalQuality(0.1, 0, 0, 0), signalQuality(-0.1, 0, 0, 0));
  assert.ok(signalQuality(0.5, 0.5, 0, 0) < 0.001);
});

test('link acquires only after receiving a complete frame', () => {
  let state = { bits: 0, seconds: 0, complete: false };
  state = advanceLink(state, 1, 10);
  assert.equal(state.bits, 1600);
  assert.equal(state.complete, false);
  state = advanceLink(state, 1, 3);
  assert.equal(state.complete, true);
  assert.equal(state.bits, 2048);
  assert.deepEqual(advanceLink(state, 1, 100), state);
});

test('a lost signal cannot manufacture progress', () => {
  const state = advanceLink({ bits: 0, seconds: 0, complete: false }, 0, 10);
  assert.equal(state.bits, 0);
  assert.equal(state.seconds, 10);
});

test('power overload is rejected without advancing the year', () => {
  const state = { ...createPowerState(), year: 2030, available: 170 };
  const result = advancePower(state, { mag: true, pws: true, heater: 'full', radio: 'full' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, state);
  assert.match(result.message, /budget/i);
});

test('a feasible power plan finishes six years with science alive', () => {
  let state = createPowerState();
  for (let i = 0; i < 6; i++) {
    const result = advancePower(state, { mag: true, pws: true, heater: 'eco', radio: 'low' });
    assert.equal(result.ok, true);
    state = result.state;
  }
  assert.equal(state.complete, true);
  assert.equal(state.failed, false);
  assert.ok(state.science > 0);
  assert.equal(state.available, 182);
});

test('freezing a probe fails the power challenge and ends advancement', () => {
  let state = createPowerState();
  for (let i = 0; i < 3; i++) {
    state = advancePower(state, { mag: true, pws: true, heater: 'off', radio: 'low' }).state;
  }
  assert.equal(state.failed, true);
  const result = advancePower(state, { mag: true, pws: true, heater: 'full', radio: 'low' });
  assert.equal(result.ok, false);
});

test('powered-down science instruments cannot be restarted in the scenario', () => {
  const state = advancePower(createPowerState(),
    { mag: false, pws: true, heater: 'eco', radio: 'low' }).state;
  const result = advancePower(state, { mag: true, pws: true, heater: 'eco', radio: 'low' });
  assert.equal(result.ok, false);
  assert.match(result.message, /restart/i);
});
