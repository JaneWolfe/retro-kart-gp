// The race scene: countdown -> racing -> finish. Owns karts, AI, camera,
// items, particles, audio hooks, pause menu, and all in-race rendering.

import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { drawText } from '../engine/font.js';
import { angleLerp, clamp, damp, TAU } from '../engine/math.js';
import { Kart, resolveKartCollisions, resolveSolidCollisions } from './kart.js';
import { AIController } from './ai.js';
import { CAMERA_MODES, drawSky } from './mode7.js';
import { drawHUD, drawCountdown, drawPauseMenu } from './hud.js';
import { KART_FW, KART_FH, KART_FRAMES } from './sprites.js';
import { RACERS, DIFFICULTY_TUNING } from './data.js';
import { N_SAMPLES, SURF, SURF_NAMES, nearestSampleIdx } from './track.js';

const KART_WORLD_SIZE = 30; // world units across one kart sprite

const PAUSE_ITEMS = ['RESUME', 'RESTART', 'QUIT TO MENU'];
const SPARK_COLORS = [null, '#4fd0ff', '#ffb030'];

export class RaceScene {
  constructor(game, { racerId, mode = 'gp' }) {
    this.game = game;
    this.racerId = racerId;
    this.mode = mode; // 'gp' | 'tt'
  }

  enter() {
    const game = this.game;
    this.track = game.track;
    this.mode7 = game.mode7;
    this.sprites = game.sprites;
    this.totalLaps = game.prefs.laps || 3;
    this.itemsEnabled = this.mode !== 'tt';
    this.allowShortcuts = (DIFFICULTY_TUNING[game.prefs.difficulty] || DIFFICULTY_TUNING.NORMAL).skill >= 0.98;
    this.tuning = DIFFICULTY_TUNING[game.prefs.difficulty] || DIFFICULTY_TUNING.NORMAL;
    this.calm = !!game.prefs.reducedMotion;

    const playerRacer = RACERS.find((r) => r.id === this.racerId) || RACERS[0];
    const others = this.mode === 'tt' ? [] : RACERS.filter((r) => r !== playerRacer);
    const lineup = [playerRacer, ...others];
    const grid = this.track.startGrid(lineup.length);

    this.karts = lineup.map((racer, i) => new Kart({
      x: grid[i].x, y: grid[i].y, heading: grid[i].heading,
      racer, isPlayer: i === 0, sampleIdx: grid[i].idx,
    }));
    this.player = this.karts[0];
    this.ai = new Map();
    this.karts.slice(1).forEach((k, i) => {
      this.ai.set(k, new AIController(k, this.track, this.tuning.skill + i * 0.04, i + 1));
    });
    this.autopilot = null; // takes over the player after the finish line

    for (const box of this.track.itemBoxes) box.respawn = 0;

    this.phase = 'countdown';
    this.countdownT = 3.6;
    this.lastCount = 4;
    this.raceTime = 0;
    this.time = 0;
    this.finishT = 0;
    this.paused = false;
    this.pauseSel = 0;
    this.message = null;
    this.messageT = 0;
    this.messageColor = '#fff';
    this.lapPopupT = 0;
    this.particles = [];
    this.wallHits = 0;   // player barrier impacts (debug overlay)
    this.wallSfxT = 0;
    this.tunnelT = 0;    // tunnel overlay fade 0..1
    this.pucks = [];     // fired projectiles
    this.oils = [];      // dropped slicks
    this.camMode = 0;
    this.cam = {
      x: this.player.x, y: this.player.y,
      angle: this.player.heading, height: CAMERA_MODES[0].height,
    };

    audio.stopMusic();
    audio.engineStart();
  }

  leave() {
    audio.engineStop();
    audio.duckMusic(false);
  }

  showMessage(text, color = '#fff', dur = 1.6) {
    this.message = text;
    this.messageColor = color;
    this.messageT = dur;
  }

  positionOf(kart) {
    let pos = 0;
    for (const k of this.karts) {
      if (k === kart) continue;
      if (k.finished && kart.finished) {
        if (k.finishTime < kart.finishTime) pos++;
      } else if (k.finished) pos++;
      else if (!kart.finished && k.totalProgress > kart.totalProgress) pos++;
    }
    return pos;
  }

  // ---- update --------------------------------------------------------------

  update(dt) {
    this.time += dt;

    if (this.paused) { this.updatePause(); return; }
    if ((input.justPressed('back') || input.justPressed('pause')) && this.phase !== 'finished') {
      this.paused = true;
      this.pauseSel = 0;
      audio.engineUpdate(0, {});
      audio.sfx('back');
      return;
    }
    if (input.justPressed('camera')) {
      this.camMode = (this.camMode + 1) % CAMERA_MODES.length;
      this.game.toast(`CAMERA: ${CAMERA_MODES[this.camMode].name}`);
    }

    if (this.messageT > 0) this.messageT -= dt;
    if (this.lapPopupT > 0) this.lapPopupT -= dt;
    if (this.wallSfxT > 0) this.wallSfxT -= dt;

    // countdown
    if (this.phase === 'countdown') {
      this.countdownT -= dt;
      const count = Math.ceil(this.countdownT);
      if (count !== this.lastCount && count >= 1) {
        this.lastCount = count;
        if (count <= 3) audio.sfx('count');
      }
      if (this.countdownT <= 0) {
        this.phase = 'racing';
        audio.sfx('go');
        audio.playMusic('race');
        this.showMessage('GO!', '#3de05a', 1);
      }
    }

    const racing = this.phase !== 'countdown';
    if (racing) this.raceTime += dt; // keeps running so late AI finishers get real times

    // controls + physics
    for (const kart of this.karts) {
      let ctl;
      if (kart.isPlayer && !this.autopilot) {
        ctl = {
          throttle: input.isDown('up') || input.isDown('accel') ? 1 : 0,
          brake: input.isDown('down') || input.isDown('brake') ? 1 : 0,
          steer: (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0),
          drift: input.isDown('drift'),
          driftPressed: input.justPressed('drift'),
          useItem: input.justPressed('item'),
          recover: input.justPressed('recover'),
        };
      } else if (kart.isPlayer) {
        ctl = this.autopilot.getControls(dt, this.time, this);
      } else {
        ctl = this.ai.get(kart).getControls(dt, this.time, this);
      }
      if (ctl.useItem && racing) this.tryUseItem(kart);
      kart.update(dt, ctl, this.track, racing);
      // item roulette resolves here (needs positions for the weighting)
      if (kart.itemRoll > 0) {
        kart.itemRoll -= dt;
        if (kart.itemRoll <= 0) {
          kart.item = this.rollItem(kart);
          if (kart.isPlayer) audio.sfx('item_get');
        }
      }
      this.handleKartEvents(kart);
    }

    // rubber-band AI top speed toward the player (strength per difficulty)
    for (const k of this.karts) {
      if (k.isPlayer) continue;
      const gap = this.player.totalProgress - k.totalProgress;
      k.speedScale = clamp(1 + gap * this.tuning.rubberGain, this.tuning.rubberMin, this.tuning.rubberMax);
    }

    const hits = resolveKartCollisions(this.karts);
    for (const h of hits) {
      if (h.a.isPlayer || h.b.isPlayer) audio.sfx('thud');
    }
    resolveSolidCollisions(this.karts, this.track.solids);

    // tunnel overlay follows the player
    const inTunnel = this.playerInTunnel();
    this.tunnelT = clamp(this.tunnelT + (inTunnel ? 5 : -5) * dt, 0, 1);

    this.updateItemBoxes(dt);
    this.updatePucks(dt);
    this.updateOils(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    // engine audio follows the player
    const sp = clamp(Math.abs(this.player.speed) / 300, 0, 1);
    audio.engineUpdate(sp, {
      drift: !!this.player.drift,
      boost: this.player.boostT > 0,
      offroad: this.player.surface === SURF.GRASS && sp > 0.05,
    });

    // finish handling
    if (!this.player.finished && this.player.lap > this.totalLaps) {
      this.player.finished = true;
      this.player.finishTime = this.raceTime;
      this.phase = 'finished';
      this.showMessage('FINISH!', '#ffd83d', 3);
      audio.sfx('finish');
      this.autopilot = new AIController(this.player, this.track, 0.9, 0);
    }
    for (const k of this.karts) {
      if (!k.isPlayer && !k.finished && k.lap > this.totalLaps) {
        k.finished = true;
        k.finishTime = this.raceTime;
      }
    }
    if (this.phase === 'finished') {
      this.finishT += dt;
      if (this.finishT > 3 || input.justPressed('start')) {
        this.game.showResults(this.buildStandings(), this.racerId, this.mode);
      }
    }

    // debug helpers
    if (this.game.debug && input.justPressed('item') && this.player.item == null && this.player.itemRoll <= 0) {
      this.player.item = 'turbo';
    }
  }

  playerInTunnel() {
    const idx = this.player.sampleIdx;
    return this.track.tunnels.some((t) => idx >= t.a && idx <= t.b);
  }

  handleKartEvents(kart) {
    for (const ev of kart.events) {
      if (kart.isPlayer) {
        switch (ev) {
          case 'hop': audio.sfx('hop'); break;
          case 'jump': audio.sfx('jump'); break;
          case 'land': audio.sfx('land'); break;
          case 'spin': audio.sfx('spin'); break;
          case 'shield_pop': audio.sfx('shield_pop'); break;
          case 'boost': audio.sfx('boost'); break;
          case 'spark': audio.sfx('spark'); break;
          case 'item_get': audio.sfx('item_get'); break;
          case 'lap':
            this.lapPopupT = 2.5;
            if (kart.lap === this.totalLaps) {
              this.showMessage('FINAL LAP!', '#ff8040');
              audio.sfx('final_lap');
            } else if (kart.lap <= this.totalLaps) {
              this.showMessage(`LAP ${kart.lap}`, '#fff', 1.2);
              audio.sfx('lap');
            }
            break;
        }
      }
      // particles for everyone
      if (ev === 'boost') this.emitBoostFlames(kart);
      if (ev === 'land') {
        for (let i = 0; i < 5; i++) this.emitDust(kart);
      }
      if (ev === 'spin') {
        if (!kart.isPlayer) audio.sfx('spin');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          this.particles.push({
            x: kart.x + Math.cos(a) * 8, y: kart.y + Math.sin(a) * 8,
            vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
            life: 0.4, maxLife: 0.4, size: 4, color: '#d8d8e0',
          });
        }
      }
      if (ev === 'wall') {
        if (kart.isPlayer) {
          this.wallHits++;
          if (this.wallSfxT <= 0) { audio.sfx('thud'); this.wallSfxT = 0.25; }
        }
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: kart.x + (Math.random() - 0.5) * 10,
            y: kart.y + (Math.random() - 0.5) * 10,
            vx: -kart.vx * 0.2, vy: -kart.vy * 0.2,
            life: 0.3, maxLife: 0.3, size: 4, color: '#e8e4dc',
          });
        }
      }
    }
    // continuous particles (reduced motion: far fewer)
    const pRate = this.calm ? 0.15 : 1;
    if (kart.drift && Math.random() < 0.6 * pRate) this.emitDriftSmoke(kart);
    if (kart.surface === SURF.GRASS && Math.abs(kart.speed) > 60 && Math.random() < 0.4 * pRate) {
      this.emitDust(kart);
    }
  }

  // ---- items v2 -------------------------------------------------------------

  // Position-weighted roulette: leaders get tools, backmarkers get speed.
  rollItem(kart) {
    const n = this.karts.length;
    const frac = n > 1 ? this.positionOf(kart) / (n - 1) : 1;
    const table = [
      ['turbo', 0.15 + 0.35 * frac],
      ['puck', 0.35 - 0.12 * frac],
      ['oil', 0.28 - 0.13 * frac],
      ['shield', 0.22 - 0.1 * frac],
    ];
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [item, w] of table) {
      r -= w;
      if (r <= 0) return item;
    }
    return 'turbo';
  }

  tryUseItem(kart) {
    const item = kart.item;
    if (!item) return;
    kart.item = null;
    switch (item) {
      case 'turbo':
        kart.boostT = Math.max(kart.boostT, 1.2);
        if (kart.isPlayer) audio.sfx('boost');
        this.emitBoostFlames(kart);
        break;
      case 'shield':
        kart.shield = true;
        if (kart.isPlayer) audio.sfx('shield_up');
        break;
      case 'puck': {
        const sp = Math.hypot(kart.vx, kart.vy) + 330;
        this.pucks.push({
          x: kart.x + Math.cos(kart.heading) * 16,
          y: kart.y + Math.sin(kart.heading) * 16,
          vx: Math.cos(kart.heading) * sp,
          vy: Math.sin(kart.heading) * sp,
          t: 0, bounces: 0, owner: kart, sampleIdx: kart.sampleIdx,
        });
        audio.sfx('puck_fire');
        break;
      }
      case 'oil':
        this.oils.push({
          x: kart.x - Math.cos(kart.heading) * 24,
          y: kart.y - Math.sin(kart.heading) * 24,
          life: 18, owner: kart, armT: 0.8,
        });
        if (kart.isPlayer) audio.sfx('oil_drop');
        break;
    }
  }

  popPuck(i, color = '#ff8030') {
    const p = this.pucks[i];
    for (let k = 0; k < 6; k++) {
      this.particles.push({
        x: p.x, y: p.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
        life: 0.3, maxLife: 0.3, size: 4, color: k % 2 ? color : '#e8e4dc',
      });
    }
    this.pucks.splice(i, 1);
  }

  updatePucks(dt) {
    const t = this.track;
    for (let i = this.pucks.length - 1; i >= 0; i--) {
      const p = this.pucks[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t > 6 || p.x < -100 || p.y < -100 || p.x > 4196 || p.y > 4196) { this.popPuck(i); continue; }
      p.sampleIdx = nearestSampleIdx(t, p.x, p.y, p.sampleIdx, true);
      // barrier bounce (same normal trick as karts: walls run parallel to track)
      if (t.surfaceAt(p.x | 0, p.y | 0) === SURF.WALL) {
        const sm = t.samples[p.sampleIdx];
        const px = -sm.dy, py = sm.dx;
        const lat = (p.x - sm.x) * px + (p.y - sm.y) * py;
        const sgn = lat >= 0 ? 1 : -1;
        const nx = -px * sgn, ny = -py * sgn;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= 2 * vn * nx; p.vy -= 2 * vn * ny; }
        p.x += nx * 4; p.y += ny * 4;
        if (++p.bounces > 4) { this.popPuck(i); continue; }
        audio.sfx('puck_bounce');
      }
      // solid decor kills it
      let dead = false;
      for (const s of t.solids) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (s.radius + 5) ** 2) { dead = true; break; }
      }
      if (dead) { this.popPuck(i); continue; }
      // kart hits
      for (const k of this.karts) {
        if (k === p.owner && p.t < 0.6) continue;
        const dx = k.x - p.x, dy = k.y - p.y;
        if (dx * dx + dy * dy < 17 * 17) {
          k.spinOut(); // shield handling inside
          this.popPuck(i);
          dead = true;
          break;
        }
      }
      if (dead) continue;
    }
  }

  updateOils(dt) {
    for (let i = this.oils.length - 1; i >= 0; i--) {
      const o = this.oils[i];
      o.life -= dt;
      if (o.armT > 0) o.armT -= dt;
      if (o.life <= 0) { this.oils.splice(i, 1); continue; }
      for (const k of this.karts) {
        if (k === o.owner && o.armT > 0) continue;
        if (k.airborne) continue;
        const dx = k.x - o.x, dy = k.y - o.y;
        if (dx * dx + dy * dy < 16 * 16) k.spinOut();
      }
    }
  }

  updateItemBoxes(dt) {
    if (!this.itemsEnabled) return;
    for (const box of this.track.itemBoxes) {
      if (box.respawn > 0) { box.respawn -= dt; continue; }
      for (const kart of this.karts) {
        if (kart.item || kart.itemRoll > 0) continue;
        const dx = kart.x - box.x, dy = kart.y - box.y;
        if (dx * dx + dy * dy < 20 * 20) {
          box.respawn = 3;
          kart.itemRoll = 0.9;
          if (kart.isPlayer) audio.sfx('item_tick');
          break;
        }
      }
    }
  }

  updateCamera(dt) {
    const mode = CAMERA_MODES[this.camMode];
    const k = this.player;
    // reduced motion: camera tracks tighter, less swing
    this.cam.angle = angleLerp(this.cam.angle, k.heading, damp(this.calm ? 11 : 5.5, dt));
    this.cam.x = k.x - Math.cos(this.cam.angle) * mode.back;
    this.cam.y = k.y - Math.sin(this.cam.angle) * mode.back;
    this.cam.height = mode.height;
  }

  updatePause() {
    if (input.justPressed('up')) { this.pauseSel = (this.pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; audio.sfx('move'); }
    if (input.justPressed('down')) { this.pauseSel = (this.pauseSel + 1) % PAUSE_ITEMS.length; audio.sfx('move'); }
    if (input.justPressed('back') || input.justPressed('pause')) { this.paused = false; return; }
    if (input.justPressed('start')) {
      audio.sfx('select');
      if (this.pauseSel === 0) this.paused = false;
      else if (this.pauseSel === 1) { this.leave(); this.enter(); }
      else this.game.quitToMenu();
    }
  }

  buildStandings() {
    // Unfinished karts get an estimated time from their average pace.
    const list = [...this.karts].sort((a, b) => this.positionOf(a) - this.positionOf(b));
    return list.map((k) => {
      let time = k.finishTime;
      if (time == null) {
        const progress = Math.max(1, k.totalProgress); // samples covered
        const pace = this.raceTime / Math.max(1, progress);
        const remaining = (this.totalLaps + 1) * N_SAMPLES - progress;
        time = this.raceTime + remaining * pace;
      }
      return {
        racer: k.racer,
        isPlayer: k.isPlayer,
        time,
        bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : null,
        lapTimes: k.lapTimes.slice(),
      };
    });
  }

  // ---- particles -------------------------------------------------------------

  emitDriftSmoke(kart) {
    const back = -10;
    for (const side of [-7, 7]) {
      this.particles.push({
        x: kart.x + Math.cos(kart.heading) * back - Math.sin(kart.heading) * side,
        y: kart.y + Math.sin(kart.heading) * back + Math.cos(kart.heading) * side,
        vx: -kart.vx * 0.1, vy: -kart.vy * 0.1,
        life: 0.4, maxLife: 0.4, size: 5,
        color: kart.drift && kart.drift.level > 0 ? SPARK_COLORS[kart.drift.level] : '#d8d8e0',
      });
    }
  }

  emitDust(kart) {
    this.particles.push({
      x: kart.x - Math.cos(kart.heading) * 10 + (Math.random() - 0.5) * 8,
      y: kart.y - Math.sin(kart.heading) * 10 + (Math.random() - 0.5) * 8,
      vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 6, color: '#7a9a50',
    });
  }

  emitBoostFlames(kart) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: kart.x - Math.cos(kart.heading) * 12,
        y: kart.y - Math.sin(kart.heading) * 12,
        vx: -Math.cos(kart.heading) * 60 + (Math.random() - 0.5) * 30,
        vy: -Math.sin(kart.heading) * 60 + (Math.random() - 0.5) * 30,
        life: 0.3, maxLife: 0.3, size: 5,
        color: i % 2 ? '#ff8030' : '#ffd83d',
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---- render -------------------------------------------------------------

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    this.mode7.setViewport(W, H);

    drawSky(ctx, game.skyPanorama, this.cam.angle, W);
    this.mode7.render(ctx, this.cam);

    // gather billboards, sort far-to-near
    const sprites = [];
    const cam = this.cam;
    for (const d of this.track.decor) {
      if (d.invisible) continue;
      const p = this.mode7.project(cam, d.x, d.y);
      if (!p || p.x < -120 || p.x > W + 120) continue;
      const img = this.decorSprite(d);
      if (!img) continue;
      let yOff = 0;
      if (d.type === 'balloons') yOff = -6 - Math.sin(this.time * 1.8 + d.x * 0.01) * 4;
      sprites.push({ p, img, worldSize: d.size, yOff });
    }
    for (const box of this.itemsEnabled ? this.track.itemBoxes : []) {
      if (box.respawn > 0) continue;
      const p = this.mode7.project(cam, box.x, box.y);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      const bob = Math.sin(this.time * 3 + box.x) * 3;
      sprites.push({ p, img: this.sprites.itemBox, worldSize: 16, yOff: -8 - bob, spin: true });
    }
    for (const o of this.oils) {
      const p = this.mode7.project(cam, o.x, o.y);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      sprites.push({ p, oil: o });
    }
    for (const pk of this.pucks) {
      const p = this.mode7.project(cam, pk.x, pk.y);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      sprites.push({ p, puck: pk });
    }
    for (const k of this.karts) {
      const p = this.mode7.project(cam, k.x, k.y);
      if (!p) continue;
      sprites.push({ p, kart: k });
    }
    for (const pt of this.particles) {
      const p = this.mode7.project(cam, pt.x, pt.y);
      if (!p) continue;
      sprites.push({ p, particle: pt });
    }
    sprites.sort((a, b) => b.p.depth - a.p.depth);

    for (const s of sprites) {
      if (s.kart) this.drawKart(ctx, s.kart, s.p);
      else if (s.oil) {
        // flat decal on the road
        const w = 26 * s.p.scale, h = 9 * s.p.scale;
        ctx.globalAlpha = Math.min(0.85, s.oil.life);
        ctx.fillStyle = '#16121f';
        ctx.beginPath();
        ctx.ellipse(s.p.x, s.p.y - h * 0.3, w / 2, h / 2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(120,100,170,0.35)';
        ctx.beginPath();
        ctx.ellipse(s.p.x - w * 0.12, s.p.y - h * 0.4, w * 0.18, h * 0.2, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (s.puck) {
        const r = Math.max(1.5, 6.5 * s.p.scale);
        ctx.fillStyle = '#ff8030';
        ctx.beginPath();
        ctx.ellipse(s.p.x, s.p.y - r * 0.5, r, r * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2a32';
        ctx.beginPath();
        ctx.ellipse(s.p.x, s.p.y - r * 0.8, r, r * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#4a4a55';
        ctx.beginPath();
        ctx.ellipse(s.p.x, s.p.y - r * 0.9, r * 0.6, r * 0.3, 0, 0, TAU);
        ctx.fill();
      } else if (s.particle) {
        const pt = s.particle;
        ctx.globalAlpha = pt.life / pt.maxLife * 0.8;
        ctx.fillStyle = pt.color;
        const sz = Math.max(1, pt.size * s.p.scale * 0.55);
        ctx.fillRect(Math.round(s.p.x - sz / 2), Math.round(s.p.y - sz), Math.round(sz), Math.round(sz));
        ctx.globalAlpha = 1;
      } else {
        const sc = (s.worldSize * s.p.scale) / s.img.width;
        let w = s.img.width * sc;
        const h = s.img.height * sc;
        if (s.spin) w *= 0.55 + 0.45 * Math.abs(Math.cos(this.time * 4));
        ctx.drawImage(s.img, Math.round(s.p.x - w / 2), Math.round(s.p.y - h + (s.yOff || 0) * sc), Math.round(w), Math.round(h));
      }
    }

    if (this.tunnelT > 0.02) this.renderTunnelOverlay(ctx, W, H);

    drawHUD(ctx, this, W, H);
    if (this.phase === 'countdown' || (this.phase === 'racing' && this.raceTime < 1)) {
      drawCountdown(ctx, Math.max(0, Math.ceil(this.countdownT)), W, H);
    }
    if (this.paused) drawPauseMenu(ctx, PAUSE_ITEMS, this.pauseSel, W, H);

    if (game.debug) this.renderDebug(ctx, W, H);
  }

  decorSprite(d) {
    const s = this.sprites;
    switch (d.type) {
      case 'tree': return s.trees[d.variant];
      case 'sign': return d.dir < 0 ? s.signL : s.signR;
      case 'house': return s.houses[d.variant];
      case 'grandstand': return s.grandstand;
      case 'banner': return s.banner;
      case 'portal': return s.portal;
      case 'balloons': return s.balloons;
      case 'lamp': return s.lamp;
      case 'bush': return s.bushes[(d.x | 0) % 2];
      default: return null;
    }
  }

  // Dark ceiling + side shading while driving through the hill
  renderTunnelOverlay(ctx, W, H) {
    const hy = this.mode7.horizonY;
    if (!this._tunnelFx || this._tunnelFx.w !== W) {
      const side = W * 0.2;
      const left = ctx.createLinearGradient(0, 0, side, 0);
      left.addColorStop(0, 'rgba(12,9,20,0.95)');
      left.addColorStop(1, 'rgba(12,9,20,0)');
      const right = ctx.createLinearGradient(W, 0, W - side, 0);
      right.addColorStop(0, 'rgba(12,9,20,0.95)');
      right.addColorStop(1, 'rgba(12,9,20,0)');
      this._tunnelFx = { w: W, side, left, right };
    }
    ctx.globalAlpha = this.tunnelT;
    ctx.fillStyle = '#120d1c';
    ctx.fillRect(0, 0, W, hy + 5);
    ctx.fillStyle = this._tunnelFx.left;
    ctx.fillRect(0, 0, this._tunnelFx.side, H);
    ctx.fillStyle = this._tunnelFx.right;
    ctx.fillRect(W - this._tunnelFx.side, 0, this._tunnelFx.side, H);
    ctx.fillStyle = 'rgba(8,6,16,0.28)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawKart(ctx, kart, p) {
    const sheet = this.sprites.karts[kart.racer.id];
    // pick view frame from heading relative to camera
    let rel = kart.heading - this.cam.angle + kart.spinAngle;
    if (kart.isPlayer) rel += kart.steerVis * 0.22; // steering lean
    let frame = Math.round((rel / TAU) * KART_FRAMES) % KART_FRAMES;
    if (frame < 0) frame += KART_FRAMES;

    const sc = (KART_WORLD_SIZE * p.scale) / KART_FW;
    const w = KART_FW * sc, h = KART_FH * sc;
    const lift = kart.zOff + kart.z; // hop + ramp-jump height
    const x = Math.round(p.x - w / 2);
    const y = Math.round(p.y - h - lift * sc);

    // shadow stays on the ground, shrinking as the kart flies
    const shScale = 1 / (1 + lift * 0.02);
    ctx.fillStyle = 'rgba(10,10,20,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 1, w * 0.34 * shScale, Math.max(1.5, h * 0.10 * shScale), 0, 0, TAU);
    ctx.fill();

    // drift sparks under the wheels
    if (kart.drift && kart.drift.level > 0) {
      ctx.fillStyle = SPARK_COLORS[kart.drift.level];
      for (const side of [-0.3, 0.3]) {
        if (Math.random() < 0.8) {
          ctx.fillRect(Math.round(p.x + w * side - 1), Math.round(p.y - 2 - Math.random() * 3), 2, 2);
        }
      }
    }

    ctx.drawImage(sheet, frame * KART_FW, 0, KART_FW, KART_FH, x, y, Math.round(w), Math.round(h));

    // boost glow
    if (kart.boostT > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 30) * 0.2;
      ctx.fillStyle = '#ff8030';
      ctx.fillRect(x + Math.round(w * 0.3), Math.round(p.y - 2), Math.round(w * 0.4), 2);
      ctx.globalAlpha = 1;
    }

    // shield bubble
    if (kart.shield) {
      const pulse = this.calm ? 0.55 : 0.45 + Math.sin(this.time * 6) * 0.15;
      ctx.strokeStyle = `rgba(79,208,255,${pulse})`;
      ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.beginPath();
      ctx.ellipse(p.x, y + h * 0.55, w * 0.62, h * 0.72, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(79,208,255,0.12)';
      ctx.fill();
    }
  }

  renderDebug(ctx, W, H) {
    const k = this.player;
    const lines = [
      `FPS ${this.game.fps.toFixed(0)}`,
      `SPD ${Math.hypot(k.vx, k.vy).toFixed(0)} SURF ${SURF_NAMES[k.surface]}`,
      `IDX ${k.sampleIdx}/${N_SAMPLES} LAP ${k.lap}`,
      `CHECKPOINT ${k.passedHalf ? 'OK' : 'PENDING'}`,
      `WALL HITS ${this.wallHits}`,
      `AIR ${k.z.toFixed(0)} TUNNEL ${this.playerInTunnel() ? 'Y' : 'N'}`,
      `ITEM ${k.item || '-'} PK ${this.pucks.length} OIL ${this.oils.length}${k.shield ? ' SHLD' : ''}${k.spinT > 0 ? ' SPIN' : ''}`,
      `DRIFT ${k.drift ? k.drift.charge.toFixed(2) : '-'} BOOST ${k.boostT.toFixed(2)}`,
      `CAM ${CAMERA_MODES[this.camMode].name}`,
    ];
    ctx.fillStyle = 'rgba(8,8,20,0.6)';
    ctx.fillRect(2, 30, 132, lines.length * 8 + 4);
    lines.forEach((l, i) => drawText(ctx, l, 5, 33 + i * 8, { color: '#7df07d' }));
  }
}
