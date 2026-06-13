// AI driver: chases a lookahead point on the racing line with a personal
// lateral offset, brakes for corners, recovers when stuck, and gets a mild
// rubber-band on top speed (applied by the race scene via kart.speedScale).
// Phase B: drifts on sustained corners, uses items with intent, and takes
// shortcuts on high difficulty.

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
    // displacement-based stuck detection (catches wall-pinned crawling,
    // which keeps speed just above the naive threshold)
    this.stuckX = kart.x;
    this.stuckY = kart.y;
    this.stuckClock = 0;
    this.itemDelay = 1 + (seed % 5) * 0.7;
    // drifting state
    this.drifting = false;
    this.driftT = 0;
    this.hopArmed = false;
    // shortcut state
    this.scPath = null;
    this.scCooldown = 0;
  }

  getControls(dt, time, race = null) {
    const k = this.kart, t = this.track;
    const speed = Math.hypot(k.vx, k.vy);

    if (this.scCooldown > 0) this.scCooldown -= dt;

    // stuck → back up briefly
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      return { throttle: 0, brake: 1, steer: 0, drift: false, driftPressed: false, useItem: false };
    }
    if (speed < 18 && k.spinT <= 0) {
      this.stuckT += dt;
      if (this.stuckT > 1.6) { this.stuckT = 0; this.reverseT = 0.8; this.scPath = null; }
    } else this.stuckT = 0;
    this.stuckClock += dt;
    if (this.stuckClock > 1.5) {
      if (Math.hypot(k.x - this.stuckX, k.y - this.stuckY) < 35 && k.spinT <= 0) {
        this.reverseT = 0.9;
        this.scPath = null;
      }
      this.stuckX = k.x;
      this.stuckY = k.y;
      this.stuckClock = 0;
    }

    // maybe commit to a shortcut (high difficulty only)
    if (!this.scPath && this.scCooldown <= 0 && race?.allowShortcuts && t.shortcuts) {
      for (const sc of t.shortcuts) {
        const d = (sc.entry - k.sampleIdx + N_SAMPLES) % N_SAMPLES;
        if (d > 0 && d < 8 && Math.random() < 0.03) {
          this.scPath = { pts: sc.points, i: 1 };
          break;
        }
      }
    }

    // target: shortcut waypoint or lookahead on the racing line
    let tx, ty, turnAmt;
    if (this.scPath) {
      const pt = this.scPath.pts[this.scPath.i];
      tx = pt.x; ty = pt.y;
      if (Math.hypot(pt.x - k.x, pt.y - k.y) < 34) {
        this.scPath.i++;
        if (this.scPath.i >= this.scPath.pts.length) { this.scPath = null; this.scCooldown = 8; }
      }
      turnAmt = 0; // dirt chords are straight-ish; no corner braking
    } else {
      const look = 10 + Math.min(26, speed * 0.09) | 0;
      const idx = (k.sampleIdx + look) % N_SAMPLES;
      const s = t.samples[idx];
      const wander = this.lineOffset + Math.sin(time * 0.4 + this.offsetPhase) * 12;
      tx = s.x - s.dy * wander;
      ty = s.y + s.dx * wander;
      const far = t.samples[(k.sampleIdx + 34) % N_SAMPLES];
      turnAmt = Math.abs(wrapAngle(Math.atan2(far.dy, far.dx) - Math.atan2(s.dy, s.dx)));
    }
    const desired = Math.atan2(ty - k.y, tx - k.x);
    const diff = wrapAngle(desired - k.heading);
    const steer = clamp(diff / 0.45, -1, 1);

    // corner speed control
    const cornerLimit = (90 + 200 * Math.exp(-turnAmt * 2.6)) * this.skill;
    let throttle = 1, brake = 0;
    if (!this.scPath && speed > cornerLimit) { throttle = 0; brake = turnAmt > 0.5 ? 0.7 : 0; }
    if (k.surface === SURF.GRASS) throttle = 1; // power through grass back to the road

    // drift on sustained corners (skilled drivers, decent speed, on asphalt)
    let drift = false, driftPressed = false;
    if (this.drifting) {
      this.driftT += dt;
      drift = true;
      // hold the slide while still steering into it; bail on straights/slow
      if (this.driftT > 2.2 || speed < 90 || k.spinT > 0 ||
          (this.driftT > 0.5 && Math.abs(steer) < 0.22 && turnAmt < 0.18)) {
        this.drifting = false;
        drift = false;
      }
    } else if (
      this.skill >= 0.9 && !this.scPath && k.surface === SURF.ROAD && !k.airborne &&
      speed > 150 && turnAmt > 0.3 && turnAmt < 0.9 && Math.abs(steer) > 0.35
    ) {
      this.drifting = true;
      this.driftT = 0;
      driftPressed = true;
      drift = true;
    }

    // items with intent
    let useItem = false;
    if (k.item) {
      this.itemDelay -= dt;
      if (this.itemDelay <= 0) {
        if (k.item === 'turbo') useItem = turnAmt < 0.25;
        else if (k.item === 'shield') useItem = true;
        else if (k.item === 'puck' && race) useItem = this.targetAhead(race) != null;
        else if (k.item === 'oil' && race) useItem = this.chaserBehind(race) != null;
        if (useItem) this.itemDelay = 2 + Math.random() * 3;
      }
    }

    return { throttle, brake, steer, drift, driftPressed, useItem };
  }

  targetAhead(race) {
    const k = this.kart;
    const cos = Math.cos(k.heading), sin = Math.sin(k.heading);
    for (const o of race.karts) {
      if (o === k || o.finished) continue;
      const dx = o.x - k.x, dy = o.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d > 30 && d < 280 && (dx * cos + dy * sin) / d > 0.92) return o;
    }
    return null;
  }

  chaserBehind(race) {
    const k = this.kart;
    const cos = Math.cos(k.heading), sin = Math.sin(k.heading);
    for (const o of race.karts) {
      if (o === k || o.finished) continue;
      const dx = o.x - k.x, dy = o.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d < 150 && (dx * cos + dy * sin) / d < -0.3) return o;
    }
    return null;
  }
}
