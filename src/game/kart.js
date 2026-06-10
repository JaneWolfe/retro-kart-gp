// Arcade kart physics: velocity vector with grip blending toward the heading,
// hop-to-drift with mini-turbo charge, boost, and surface effects.

import { clamp, wrapAngle, TAU } from '../engine/math.js';
import { nearestSampleIdx, N_SAMPLES, SURF, WORLD } from './track.js';

const BASE_MAX_SPEED = 230;   // world units / s
const ACCEL = 300;
const BRAKE = 420;
const REVERSE_MAX = 70;
const DRAG = 1.1;             // exponential drag rate
const TURN_RATE = 2.3;        // rad/s at full lock

export class Kart {
  constructor({ x, y, heading, racer, isPlayer = false, sampleIdx = 0 }) {
    this.racer = racer;
    this.isPlayer = isPlayer;
    this.x = x; this.y = y;
    this.heading = heading;
    this.vx = 0; this.vy = 0;
    this.speed = 0;          // signed forward speed
    this.steerVis = 0;       // smoothed steer for sprite frame
    this.hopT = 0;
    this.zOff = 0;           // visual hop height
    this.drift = null;       // { dir, charge, level }
    this.boostT = 0;
    this.padCooldown = 0;
    this.surface = SURF.ROAD;
    this.speedScale = 1;     // AI rubber-band hook
    // race progress
    this.sampleIdx = sampleIdx;
    // anti-cheat: must reach mid-track before a lap counts.
    // Starts true so the initial start-line crossing (grid is behind the line) registers.
    this.passedHalf = true;
    this.lap = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.finished = false;
    this.finishTime = null;
    this.raceTime = 0;
    this.wrongWayT = 0;
    // items
    this.item = null;        // 'turbo'
    this.itemRoll = 0;
    this.events = [];        // per-frame audio/FX events consumed by the scene
  }

  get maxSpeed() {
    let m = BASE_MAX_SPEED * this.racer.stats.speed * this.speedScale;
    if (this.boostT > 0) m *= 1.32;
    else if (this.surface === SURF.GRASS) m *= 0.45;
    return m;
  }

  // ctl: { throttle:0..1, brake:0..1, steer:-1..1, drift:bool, useItem:bool, recover:bool }
  update(dt, ctl, track, racing) {
    this.events.length = 0;
    const grip = this.racer.stats.grip;

    if (ctl.recover) this.recover(track);

    // ---- timers ----
    if (this.boostT > 0) this.boostT -= dt;
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (this.hopT > 0) {
      this.hopT -= dt;
      this.zOff = Math.sin((1 - this.hopT / 0.26) * Math.PI) * 5;
      if (this.hopT <= 0) this.zOff = 0;
    }
    if (racing) this.raceTime += dt;

    // ---- surface ----
    this.surface = track.surfaceAt(this.x | 0, this.y | 0);
    if (this.surface === SURF.BOOST && this.padCooldown <= 0 && racing) {
      this.boostT = Math.max(this.boostT, 0.85);
      this.padCooldown = 1.2;
      this.events.push('boost');
    }

    // ---- drift state machine ----
    if (racing && ctl.driftPressed && this.hopT <= 0 && !this.drift && Math.abs(this.speed) > 30) {
      this.hopT = 0.26;
      this.events.push('hop');
    }
    if (ctl.drift && !this.drift && this.hopT > 0 && Math.abs(ctl.steer) > 0.3 &&
        this.speed > this.maxSpeed * 0.35) {
      this.drift = { dir: Math.sign(ctl.steer), charge: 0, level: 0 };
    }
    if (this.drift) {
      if (!ctl.drift || this.speed < this.maxSpeed * 0.2) {
        // release: mini-turbo
        if (this.drift.level === 2) { this.boostT = Math.max(this.boostT, 0.95); this.events.push('boost'); }
        else if (this.drift.level === 1) { this.boostT = Math.max(this.boostT, 0.5); this.events.push('boost'); }
        this.drift = null;
      } else {
        this.drift.charge += dt * (0.65 + Math.abs(ctl.steer) * 0.6);
        const lvl = this.drift.charge >= 2.3 ? 2 : this.drift.charge >= 1.1 ? 1 : 0;
        if (lvl !== this.drift.level) {
          this.drift.level = lvl;
          this.events.push('spark');
        }
      }
    }

    // ---- steering ----
    const speedMag = Math.hypot(this.vx, this.vy);
    const speedFactor = clamp(speedMag / 55, 0, 1) * (1 - clamp(speedMag / (BASE_MAX_SPEED * 1.4), 0, 1) * 0.35);
    if (this.drift) {
      const d = this.drift.dir;
      const turn = d * (1.35 + 0.85 * clamp(ctl.steer * d, -0.6, 1));
      this.heading += turn * TURN_RATE * 0.78 * speedFactor * dt;
    } else {
      const rev = this.speed < -5 ? -1 : 1;
      this.heading += ctl.steer * TURN_RATE * speedFactor * grip * rev * dt;
    }
    this.heading = wrapAngle(this.heading);
    this.steerVis += ((this.drift ? this.drift.dir * 1.6 : ctl.steer) - this.steerVis) * Math.min(1, 10 * dt);

    // ---- forward dynamics ----
    const cosH = Math.cos(this.heading), sinH = Math.sin(this.heading);
    let fwd = this.vx * cosH + this.vy * sinH;
    let lat = -this.vx * sinH + this.vy * cosH;

    const cap = this.maxSpeed;
    if (racing) {
      // throttle only pushes below the cap, so the cap actually holds
      if (ctl.throttle > 0 && fwd >= -5 && fwd < cap) fwd += ACCEL * ctl.throttle * dt;
      if (ctl.brake > 0) {
        if (fwd > 5) fwd -= BRAKE * ctl.brake * dt;
        else fwd = Math.max(fwd - ACCEL * 0.5 * dt, -REVERSE_MAX);
      }
    }
    if (this.boostT > 0 && fwd < cap) fwd += ACCEL * 0.9 * dt;

    // drag + decay back to the cap when over it (e.g. boost just ended)
    fwd *= Math.exp(-DRAG * dt * (ctl.throttle > 0 || this.boostT > 0 ? 0.25 : 1));
    if (fwd > cap) fwd += (cap - fwd) * Math.min(1, 6 * dt);

    // lateral grip (drifting slides, grass slides a bit)
    let gripRate = 9 * grip;
    if (this.drift) gripRate = 2.1;
    else if (this.surface === SURF.GRASS) gripRate = 4.5;
    lat *= Math.exp(-gripRate * dt);
    // drifting flings you outward slightly
    if (this.drift) lat -= this.drift.dir * 36 * dt;

    this.speed = fwd;
    this.vx = cosH * fwd - sinH * lat;
    this.vy = sinH * fwd + cosH * lat;
    const prevX = this.x, prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // barrier bounce: never enter a wall cell; reflect off the track-parallel
    // barrier with some restitution and scrape losses
    if (track.surfaceAt(this.x | 0, this.y | 0) === SURF.WALL) {
      const sm = track.samples[this.sampleIdx];
      const px = -sm.dy, py = sm.dx; // lateral unit vector
      const latOff = (this.x - sm.x) * px + (this.y - sm.y) * py;
      const sgn = latOff >= 0 ? 1 : -1;
      const nx = -px * sgn, ny = -py * sgn; // wall normal, toward centerline
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        this.vx -= 1.45 * vn * nx;
        this.vy -= 1.45 * vn * ny;
      }
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.speed *= 0.8;
      this.x = prevX + nx * 1.5;
      this.y = prevY + ny * 1.5;
      this.drift = null;
      if (Math.abs(vn) > 30) this.events.push('wall');
    }

    // ---- items ----
    if (this.itemRoll > 0) {
      this.itemRoll -= dt;
      if (this.itemRoll <= 0) {
        this.item = 'turbo';
        this.events.push('item_get');
      }
    }
    if (ctl.useItem && this.item === 'turbo' && racing) {
      this.item = null;
      this.boostT = Math.max(this.boostT, 1.2);
      this.events.push('boost');
    }

    // way off the map? snap back onto the track
    if (this.x < -120 || this.y < -120 || this.x > WORLD + 120 || this.y > WORLD + 120) {
      this.recover(track);
    }

    // ---- progress / laps ----
    const prev = this.sampleIdx;
    this.sampleIdx = nearestSampleIdx(track, this.x, this.y, prev);
    const half = N_SAMPLES >> 1;
    if (Math.abs(this.sampleIdx - half) < 60) this.passedHalf = true;
    if (racing && !this.finished) {
      if (prev > N_SAMPLES - 40 && this.sampleIdx < 40) {
        if (this.passedHalf) {
          this.passedHalf = false;
          this.lap++;
          if (this.lap > 1) this.lapTimes.push(this.raceTime - this.lapStart);
          this.lapStart = this.raceTime;
          this.events.push(this.lap > 1 ? 'lap' : 'lap_first');
        }
      } else if (prev < 40 && this.sampleIdx > N_SAMPLES - 40) {
        this.lap--;             // crossed the line backwards
        this.passedHalf = true; // re-crossing forward restores the lap
      }
    }

    // wrong-way detection
    const s = track.samples[this.sampleIdx];
    const along = this.vx * s.dx + this.vy * s.dy;
    if (racing && along < -25) this.wrongWayT += dt;
    else this.wrongWayT = 0;
  }

  get totalProgress() {
    return this.lap * N_SAMPLES + this.sampleIdx;
  }

  recover(track) {
    const s = track.samples[this.sampleIdx];
    this.x = s.x;
    this.y = s.y;
    this.heading = Math.atan2(s.dy, s.dx);
    this.vx = this.vy = this.speed = 0;
    this.drift = null;
    this.wrongWayT = 0;
  }
}

// Pairwise circle collision: push apart, dampen, report impacts.
export function resolveKartCollisions(karts) {
  const hits = [];
  const R = 19;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= R || d === 0) continue;
      dx /= d; dy /= d;
      const push = (R - d) / 2;
      a.x -= dx * push; a.y -= dy * push;
      b.x += dx * push; b.y += dy * push;
      const rel = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
      if (rel < 0) {
        const imp = -rel * 0.55;
        a.vx -= dx * imp; a.vy -= dy * imp;
        b.vx += dx * imp; b.vy += dy * imp;
        if (imp > 25) hits.push({ a, b, imp });
      }
    }
  }
  return hits;
}
