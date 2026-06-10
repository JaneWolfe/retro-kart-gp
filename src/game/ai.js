// AI driver: chases a lookahead point on the racing line with a personal
// lateral offset, brakes for corners, recovers when stuck, and gets a mild
// rubber-band on top speed (applied by the race scene via kart.speedScale).

import { clamp, wrapAngle } from '../engine/math.js';
import { N_SAMPLES, SURF } from './track.js';

export class AIController {
  constructor(kart, track, skill = 1, seed = 0) {
    this.kart = kart;
    this.track = track;
    this.skill = skill;          // 0.85..1.05 — scales corner speed & reactions
    this.lineOffset = ((seed % 3) - 1) * 16;
    this.offsetPhase = seed * 2.1;
    this.stuckT = 0;
    this.reverseT = 0;
    this.itemDelay = 1 + (seed % 5) * 0.7;
  }

  getControls(dt, time) {
    const k = this.kart, t = this.track;
    const speed = Math.hypot(k.vx, k.vy);

    // stuck → back up briefly
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      return { throttle: 0, brake: 1, steer: 0, drift: false, driftPressed: false, useItem: false };
    }
    if (speed < 18) {
      this.stuckT += dt;
      if (this.stuckT > 1.6) { this.stuckT = 0; this.reverseT = 0.8; }
    } else this.stuckT = 0;

    // lookahead target with a slowly wandering lateral offset
    const look = 10 + Math.min(26, speed * 0.09) | 0;
    const idx = (k.sampleIdx + look) % N_SAMPLES;
    const s = t.samples[idx];
    const wander = this.lineOffset + Math.sin(time * 0.4 + this.offsetPhase) * 12;
    const tx = s.x - s.dy * wander;
    const ty = s.y + s.dx * wander;
    const desired = Math.atan2(ty - k.y, tx - k.x);
    const diff = wrapAngle(desired - k.heading);
    const steer = clamp(diff / 0.45, -1, 1);

    // corner speed: compare direction now vs further ahead
    const far = t.samples[(k.sampleIdx + 34) % N_SAMPLES];
    const turnAmt = Math.abs(wrapAngle(Math.atan2(far.dy, far.dx) - Math.atan2(s.dy, s.dx)));
    const cornerLimit = (90 + 200 * Math.exp(-turnAmt * 2.6)) * this.skill;
    let throttle = 1, brake = 0;
    if (speed > cornerLimit) { throttle = 0; brake = turnAmt > 0.5 ? 0.7 : 0; }
    if (k.surface === SURF.GRASS) throttle = 1; // power through grass back to the road

    // use a held turbo on straights
    let useItem = false;
    if (k.item === 'turbo') {
      this.itemDelay -= dt;
      if (this.itemDelay <= 0 && turnAmt < 0.25) {
        useItem = true;
        this.itemDelay = 2 + Math.random() * 3;
      }
    }

    return { throttle, brake, steer, drift: false, driftPressed: false, useItem };
  }
}
