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
const GRAVITY = 520;          // u/s^2 while airborne (ramp jumps)
const DIRT_SPEED = 0.8;       // dirt shortcut speed-cap factor
const GRASS_SPEED = 0.45;

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
    this.z = 0;              // airborne height (ramp jumps)
    this.vz = 0;
    this.jumpCooldown = 0;
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
    // items (rolled/used by the race scene)
    this.item = null;        // 'turbo' | 'puck' | 'oil' | 'shield'
    this.itemRoll = 0;
    this.shield = false;     // active bubble, blocks one hit
    // spin-out (hit by puck / oil)
    this.spinT = 0;
    this.spinCooldown = 0;
    this.spinAngle = 0;      // visual rotation while spinning
    this.events = [];        // per-frame audio/FX events consumed by the scene
  }

  get airborne() { return this.z > 0; }

  get maxSpeed() {
    let m = BASE_MAX_SPEED * this.racer.stats.speed * this.speedScale;
    if (this.boostT > 0) m *= 1.32;
    else if (this.airborne) { /* no surface penalty in the air */ }
    else if (this.surface === SURF.GRASS) m *= GRASS_SPEED;
    else if (this.surface === SURF.DIRT) m *= DIRT_SPEED;
    return m;
  }

  // Spin out (puck/oil hit). Returns false if shielded or recently spun.
  spinOut() {
    if (this.spinT > 0 || this.spinCooldown > 0 || this.airborne) return false;
    if (this.shield) {
      this.shield = false;
      this.events.push('shield_pop');
      return false;
    }
    this.spinT = 1.1;
    this.spinAngle = 0;
    this.drift = null;
    this.boostT = 0;
    this.events.push('spin');
    return true;
  }

  // ctl: { throttle:0..1, brake:0..1, steer:-1..1, drift:bool, useItem:bool, recover:bool }
  update(dt, ctl, track, racing) {
    this.events.length = 0;
    const grip = this.racer.stats.grip;

    if (ctl.recover) this.recover(track);

    // spinning: controls are gone until it ends
    if (this.spinT > 0) {
      this.spinT -= dt;
      this.spinAngle += 11.4 * dt; // ~2 full turns over the spin
      ctl = { throttle: 0, brake: 0, steer: 0, drift: false, driftPressed: false, useItem: false };
      if (this.spinT <= 0) {
        this.spinAngle = 0;
        this.spinCooldown = 1.2;
      }
    } else if (this.spinCooldown > 0) {
      this.spinCooldown -= dt;
    }

    // ---- timers ----
    if (this.boostT > 0) this.boostT -= dt;
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    if (this.hopT > 0) {
      this.hopT -= dt;
      this.zOff = Math.sin((1 - this.hopT / 0.26) * Math.PI) * 5;
      if (this.hopT <= 0) this.zOff = 0;
    }
    if (racing) this.raceTime += dt;

    // ---- airborne arc (ramp jumps) ----
    if (this.z > 0 || this.vz !== 0) {
      this.z += this.vz * dt;
      this.vz -= GRAVITY * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.events.push('land');
      }
    }

    // ---- surface ----
    this.surface = track.surfaceAt(this.x | 0, this.y | 0);
    if (this.surface === SURF.BOOST && this.padCooldown <= 0 && !this.airborne && racing) {
      this.boostT = Math.max(this.boostT, 0.85);
      this.padCooldown = 1.2;
      this.events.push('boost');
    }
    // ramp launch
    if (this.surface === SURF.JUMP && !this.airborne && this.jumpCooldown <= 0 && racing) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > BASE_MAX_SPEED * 0.3) {
        this.vz = 110 + sp * 0.42;
        this.z = 0.01;
        this.jumpCooldown = 0.5;
        this.drift = null;
        this.hopT = 0;
        this.events.push('jump');
      }
    }

    // ---- drift state machine ----
    if (racing && ctl.driftPressed && this.hopT <= 0 && !this.drift && !this.airborne && Math.abs(this.speed) > 30) {
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
    if (this.airborne) {
      // heading locked in the air
    } else if (this.drift) {
      const d = this.drift.dir;
      const turn = d * (1.35 + 0.85 * clamp(ctl.steer * d, -0.6, 1));
      this.heading += turn * TURN_RATE * 0.78 * speedFactor * dt;
    } else {
      const rev = this.speed < -5 ? -1 : 1;
      this.heading += ctl.steer * TURN_RATE * speedFactor * grip * rev * dt;
    }
    this.heading = wrapAngle(this.heading);
    const steerTarget = this.airborne ? 0 : (this.drift ? this.drift.dir * 1.6 : ctl.steer);
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, 10 * dt);

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
    if (this.spinT > 0) fwd *= Math.exp(-2.4 * dt); // spinning sheds speed fast
    if (fwd > cap) fwd += (cap - fwd) * Math.min(1, 6 * dt);

    // lateral grip (drifting slides, grass/dirt slide a bit, air has none)
    let gripRate = 9 * grip;
    if (this.airborne) gripRate = 0.1;
    else if (this.drift) gripRate = 2.1;
    else if (this.surface === SURF.GRASS) gripRate = 4.5;
    else if (this.surface === SURF.DIRT) gripRate = 6;
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

    // (item roll/use handling lives in the race scene — it needs positions
    // and spawns world entities like pucks and oil slicks)

    // way off the map? snap back onto the track
    if (this.x < -120 || this.y < -120 || this.x > WORLD + 120 || this.y > WORLD + 120) {
      this.recover(track);
    }

    // ---- progress / laps ----
    // shortcuts/jumps can skip samples faster than the cheap local search
    // tolerates, so widen it while off the asphalt racing line
    const wide = this.airborne || this.surface === SURF.DIRT || this.surface === SURF.JUMP;
    const prev = this.sampleIdx;
    this.sampleIdx = nearestSampleIdx(track, this.x, this.y, prev, wide);
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

// Karts vs solid decor (houses, trees, posts...): push out + reflect,
// same flavor as the barrier bounce.
export function resolveSolidCollisions(karts, solids) {
  for (const k of karts) {
    for (const s of solids) {
      const R = s.radius + 10;
      const dx = k.x - s.x, dy = k.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      k.x = s.x + nx * R;
      k.y = s.y + ny * R;
      const vn = k.vx * nx + k.vy * ny;
      if (vn < 0) {
        k.vx -= 1.4 * vn * nx;
        k.vy -= 1.4 * vn * ny;
        k.vx *= 0.8;
        k.vy *= 0.8;
        k.speed *= 0.8;
        k.drift = null;
        if (-vn > 40) k.events.push('wall');
      }
    }
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
