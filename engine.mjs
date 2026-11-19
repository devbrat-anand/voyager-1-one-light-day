export const AU_KM = 149597870.7;
export const C_KM_S = 299792.458;
const DAY_MS = 86400000;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const toJulian = date => date.getTime() / DAY_MS + 2440587.5;
export const fromJulian = jd => new Date((jd - 2440587.5) * DAY_MS);

export function stateAt(states, jd) {
  if (!Number.isFinite(jd) || states.length < 2 || jd < states[0][0] || jd > states.at(-1)[0]) {
    throw new RangeError('Date is outside the bundled JPL ephemeris coverage.');
  }
  let low = 0, high = states.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (states[mid][0] <= jd) low = mid;
    else high = mid;
  }
  const a = states[low], b = states[high], h = b[0] - a[0], t = (jd - a[0]) / h;
  const position = [], velocity = [];
  for (let i = 1; i <= 3; i++) {
    position.push((2*t**3 - 3*t**2 + 1)*a[i] + (t**3 - 2*t**2 + t)*h*a[i+3]
      + (-2*t**3 + 3*t**2)*b[i] + (t**3 - t**2)*h*b[i+3]);
    velocity.push((6*t**2 - 6*t)*a[i]/h + (3*t**2 - 4*t + 1)*a[i+3]
      + (-6*t**2 + 6*t)*b[i]/h + (3*t**2 - 2*t)*b[i+3]);
  }
  return { position, velocity };
}

export function missionStats(probe, earth) {
  const distanceAU = Math.hypot(...probe.position.map((v, i) => v - earth.position[i]));
  return {
    distanceAU,
    distanceKm: distanceAU * AU_KM,
    sunAU: Math.hypot(...probe.position),
    lightSeconds: distanceAU * AU_KM / C_KM_S,
    speedKmS: Math.hypot(...probe.velocity) * AU_KM / 86400,
  };
}

export function flyby(impactRadii, speedKmS) {
  if (!Number.isFinite(impactRadii) || !Number.isFinite(speedKmS) || impactRadii <= 0 || speedKmS <= 0) {
    throw new RangeError('Flyby distance and approach speed must be positive.');
  }
  const mu = 126686534, radius = 71492, b = impactRadii * radius;
  const eccentricity = Math.sqrt(1 + b*b*speedKmS**4 / mu**2);
  const periapsisKm = mu / speedKmS**2 * (eccentricity - 1);
  const angle = 2 * Math.atan(mu / (b * speedKmS**2));
  return {
    periapsisKm, altitudeKm: periapsisKm - radius,
    deflectionDeg: angle * 180 / Math.PI,
    deltaVelocityKmS: 2 * speedKmS * Math.sin(angle / 2),
    eccentricity, safe: periapsisKm > radius + 1000,
  };
}

export function signalQuality(x, y, targetX, targetY) {
  return Math.exp(-4 * Math.log(2) * ((x-targetX)**2 + (y-targetY)**2) / 0.12**2);
}

export function advanceLink(state, quality, seconds) {
  if (state.complete) return state;
  const bits = Math.min(2048, state.bits + 160 * clamp(quality, 0, 1) * Math.max(0, seconds));
  return { bits, seconds: state.seconds + Math.max(0, seconds), complete: bits >= 2048 };
}

export function createPowerState() {
  return { year: 2026, available: 206, temperature: -38, science: 0,
    mag: true, pws: true, complete: false, failed: false };
}

export function powerDemand(plan) {
  return 136 + (plan.mag ? 8 : 0) + (plan.pws ? 10 : 0)
    + ({ full: 24, eco: 14, off: 0 }[plan.heater])
    + ({ full: 20, low: 10 }[plan.radio]);
}

export function advancePower(state, plan) {
  const reject = message => ({ ok: false, state, message });
  if (state.complete || state.failed) return reject('Scenario ended. Reset to try another power plan.');
  if (!['full', 'eco', 'off'].includes(plan.heater) || !['full', 'low'].includes(plan.radio)
      || typeof plan.mag !== 'boolean' || typeof plan.pws !== 'boolean') {
    return reject('Choose a valid heater, radio, and instrument configuration.');
  }
  if ((!state.mag && plan.mag) || (!state.pws && plan.pws)) {
    return reject('You cannot restart an instrument powered down in this scenario.');
  }
  const demand = powerDemand(plan);
  if (demand > state.available) return reject(`Power budget exceeded by ${demand - state.available} W. Reduce a load before advancing.`);
  const temperature = state.temperature + ({ full: 2, eco: -1.6, off: -7 }[plan.heater]);
  const failed = temperature < -50 || (!plan.mag && !plan.pws);
  const next = {
    ...state, year: state.year + 1, available: state.available - 4,
    temperature: Math.min(-32, temperature),
    mag: plan.mag, pws: plan.pws,
    science: state.science + (failed ? 0 : (Number(plan.mag) + Number(plan.pws)) * (plan.radio === 'full' ? 100 : 50)),
    failed, complete: !failed && state.year + 1 >= 2032,
  };
  return { ok: true, state: next, message: failed
    ? (temperature < -50 ? 'Fuel lines froze. The link is lost.' : 'No science instruments remain. The science mission has ended.')
    : next.complete ? '2032. Still listening. You kept interstellar science alive.'
    : `${next.year}: ${next.available} W available. Plan the next year.` };
}
