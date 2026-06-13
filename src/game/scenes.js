// Non-race scenes: Title, Menu, Options, Credits, Racer Select, Results.
// Menus render over a slowly orbiting mode-7 view of the track.

import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { drawText, textWidth } from '../engine/font.js';
import { clamp, formatTime, TAU } from '../engine/math.js';
import { MODES } from '../engine/display.js';
import { assets } from '../engine/assets.js';
import { drawSky } from './mode7.js';
import { KART_FW, KART_FH, KART_FRAMES } from './sprites.js';
import { RACERS, TRACKS, DIFFICULTIES, LAP_OPTIONS, MODES as GAME_MODES } from './data.js';

const ORDINALS = ['1ST', '2ND', '3RD', '4TH'];
const ORD_COLORS = ['#ffd83d', '#cfcfd8', '#d89a5a', '#9ab0c8'];

// Shared orbiting-camera backdrop for all menu scenes
export function drawBackdrop(game, ctx, time, dim = 0.45) {
  const W = game.display.W, H = game.display.H;
  game.mode7.setViewport(W, H);
  const a = time * 0.12;
  const cam = {
    x: game.trackCenter.x + Math.cos(a) * 620,
    y: game.trackCenter.y + Math.sin(a) * 620,
    angle: a + Math.PI,
    height: 95,
  };
  drawSky(ctx, game.skyPanorama, cam.angle, W);
  game.mode7.render(ctx, cam);
  if (dim > 0) {
    ctx.fillStyle = `rgba(8,8,20,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function menuNav(items) {
  let idx = null;
  if (input.justPressed('up')) idx = -1;
  if (input.justPressed('down')) idx = 1;
  if (idx !== null) audio.sfx('move');
  return idx;
}

// ---- Boot ------------------------------------------------------------------
// Faux-BIOS power-on screen. Lines appear over ~2s; Enter skips.

export class BootScene {
  constructor(game) { this.game = game; this.t = 0; }

  update(dt) {
    this.t += dt;
    if (this.t > 3.2 || (this.t > 0.7 && input.justPressed('start'))) {
      this.game.setScene(new TitleScene(this.game));
    }
  }

  render(ctx) {
    const W = this.game.display.W, H = this.game.display.H;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);
    const lines = [
      [0.0, 'BIG B SYSTEMS', '#4fe3c0', 2],
      [0.2, 'RETRO KART BIOS V1.0', '#9090a8', 1],
      [0.6, 'MEM CHECK........ 4096K OK', '#7df07d', 1],
      [1.0, `EXTERNAL ASSETS.. ${assets.found}/${assets.total}`, '#7df07d', 1],
      [1.4, 'PROCEDURAL FX.... READY', '#7df07d', 1],
      [1.8, 'SOUND............ READY', '#7df07d', 1],
    ];
    let y = 22;
    for (const [at, text, color, scale] of lines) {
      if (this.t >= at) drawText(ctx, text, 18, y, { color, scale });
      y += 7 * scale + 5;
    }
    if (this.t >= 2.2 && (this.game.prefs.reducedMotion || Math.floor(this.t * 2.2) % 2 === 0)) {
      drawText(ctx, 'BOOT OK - PRESS ENTER', 18, y + 6, { color: '#ffd83d' });
    }
    // blinking cursor block, like a terminal
    if (Math.floor(this.t * 3) % 2 === 0) {
      ctx.fillStyle = '#4fe3c0';
      ctx.fillRect(W - 14, H - 14, 6, 8);
    }
  }
}

// ---- Title -----------------------------------------------------------------

export class TitleScene {
  constructor(game) { this.game = game; this.t = 0; }

  enter() { audio.playMusic('title'); }

  update(dt) {
    this.t += dt;
    if (input.justPressed('start')) {
      audio.sfx('select');
      this.game.setScene(new MenuScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t, 0.25);

    const bob = Math.sin(this.t * 2) * 2;
    drawText(ctx, 'RETRO KART', W / 2, H * 0.16 + bob, { align: 'center', scale: 4, color: '#ffd83d', outline: '#7a2030' });
    drawText(ctx, 'GP', W / 2, H * 0.16 + 24 + bob, { align: 'center', scale: 4, color: '#ff6a5e', outline: '#7a2030' });

    // a kart drives across the bottom every few seconds
    const cycle = 5;
    const ct = (this.t % cycle) / cycle;
    const kx = -40 + ct * (W + 80);
    const racer = RACERS[Math.floor(this.t / cycle) % RACERS.length];
    const sheet = game.sprites.karts[racer.id];
    const frame = 4; // side view, moving right
    ctx.drawImage(sheet, frame * KART_FW, 0, KART_FW, KART_FH, Math.round(kx), H - 46, KART_FW * 2, KART_FH * 2);

    if (game.prefs.reducedMotion || Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'PRESS ENTER', W / 2, H * 0.62, { align: 'center', scale: 2, color: '#fff', outline: '#181828' });
    }
    drawText(ctx, '(C) 2026 BIG B - ALL ASSETS CC0/ORIGINAL', W / 2, H - 10, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
    if (!audio.unlocked) {
      drawText(ctx, 'PRESS ANY KEY FOR SOUND', W / 2, H * 0.72, { align: 'center', color: '#9090a8', shadow: '#181828' });
    }
  }
}

// ---- Main menu ---------------------------------------------------------------

const MENU_ITEMS = ['RACE', 'CONTROLS', 'OPTIONS', 'CREDITS'];

export class MenuScene {
  constructor(game) { this.game = game; this.t = 0; this.sel = 0; }

  enter() { audio.playMusic('title'); } // no-op if already playing

  update(dt) {
    this.t += dt;
    const nav = menuNav();
    if (nav) this.sel = (this.sel + nav + MENU_ITEMS.length) % MENU_ITEMS.length;
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new TitleScene(this.game));
      return;
    }
    if (input.justPressed('start')) {
      audio.sfx('select');
      if (this.sel === 0) this.game.setScene(new ModeSelectScene(this.game));
      else if (this.sel === 1) this.game.setScene(new ControlsScene(this.game));
      else if (this.sel === 2) this.game.setScene(new OptionsScene(this.game));
      else this.game.setScene(new CreditsScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'RETRO KART GP', W / 2, 18, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    MENU_ITEMS.forEach((label, i) => {
      const y = H * 0.36 + i * 18;
      const sel = i === this.sel;
      if (sel) drawText(ctx, '>', W / 2 - textWidth(label, 2) / 2 - 12, y, { scale: 2, color: '#ffd83d' });
      drawText(ctx, label, W / 2, y, { align: 'center', scale: 2, color: sel ? '#fff' : '#9090a8', shadow: '#181828' });
    });
    drawText(ctx, 'ENTER: SELECT   ESC: BACK', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Options -------------------------------------------------------------------

export class OptionsScene {
  constructor(game) { this.game = game; this.t = 0; this.sel = 0; }

  rows() {
    const p = this.game.prefs;
    return [
      { label: 'DISPLAY', value: MODES[p.displayMode].label, change: (d) => { p.displayMode = p.displayMode === 'wide' ? 'crt' : 'wide'; this.game.applyPrefs(); } },
      { label: 'SCANLINES', value: p.scanlines ? 'ON' : 'OFF', change: () => { p.scanlines = !p.scanlines; this.game.applyPrefs(); } },
      { label: 'MUSIC VOL', value: `${Math.round(p.musicVol * 100)}%`, change: (d) => { p.musicVol = clamp(Math.round((p.musicVol + d * 0.1) * 10) / 10, 0, 1); this.game.applyPrefs(); } },
      { label: 'SFX VOL', value: `${Math.round(p.sfxVol * 100)}%`, change: (d) => { p.sfxVol = clamp(Math.round((p.sfxVol + d * 0.1) * 10) / 10, 0, 1); this.game.applyPrefs(); } },
      {
        label: 'DIFFICULTY', value: p.difficulty,
        change: (d) => {
          const i = DIFFICULTIES.indexOf(p.difficulty);
          p.difficulty = DIFFICULTIES[(i + d + DIFFICULTIES.length) % DIFFICULTIES.length];
        },
      },
      {
        label: 'LAPS', value: String(p.laps),
        change: (d) => {
          const i = LAP_OPTIONS.indexOf(p.laps);
          p.laps = LAP_OPTIONS[(i + d + LAP_OPTIONS.length) % LAP_OPTIONS.length];
        },
      },
      { label: 'REDUCED MOTION', value: p.reducedMotion ? 'ON' : 'OFF', change: () => { p.reducedMotion = !p.reducedMotion; } },
      { label: 'BACK', value: '', change: null },
    ];
  }

  update(dt) {
    this.t += dt;
    const rows = this.rows();
    const nav = menuNav();
    if (nav) this.sel = (this.sel + nav + rows.length) % rows.length;
    const row = rows[this.sel];
    if ((input.justPressed('left') || input.justPressed('right') || input.justPressed('start')) && row.change) {
      row.change(input.justPressed('left') ? -1 : 1);
      audio.sfx('select');
      this.game.savePrefs();
    } else if (input.justPressed('start') && !row.change) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
      return;
    }
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'OPTIONS', W / 2, 18, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    this.rows().forEach((row, i) => {
      const y = H * 0.24 + i * 16;
      const sel = i === this.sel;
      if (sel) drawText(ctx, '>', W * 0.18 - 10, y, { scale: 2, color: '#ffd83d' });
      drawText(ctx, row.label, W * 0.18, y, { scale: 2, color: sel ? '#fff' : '#9090a8', shadow: '#181828' });
      drawText(ctx, row.value, W * 0.82, y, { align: 'right', scale: 2, color: sel ? '#4fe3c0' : '#7a8a90', shadow: '#181828' });
    });
    drawText(ctx, 'LEFT/RIGHT OR ENTER: CHANGE', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Controls ------------------------------------------------------------------

const CONTROL_ROWS = [
  ['UP / DOWN', 'ACCELERATE / BRAKE-REVERSE'],
  ['LEFT / RIGHT', 'STEER'],
  ['SPACE (HOLD)', 'HOP + DRIFT, RELEASE = TURBO'],
  ['X OR R-SHIFT', 'USE ITEM'],
  ['ENTER', 'SELECT / START'],
  ['ESC OR P', 'PAUSE / BACK'],
  ['R', 'RECOVER TO TRACK'],
  ['C', 'CAMERA VIEW'],
  ['M', 'MUTE'],
  ['F', 'FULLSCREEN'],
  ['`', 'DEBUG OVERLAY'],
  ['PAD: STICK', 'STEER + MENUS'],
  ['PAD: A / B', 'GAS+SELECT / BRAKE'],
  ['PAD: X RB RT', 'ITEM / DRIFT / GAS'],
  ['PAD: START SEL', 'PAUSE / BACK'],
];

export class ControlsScene {
  constructor(game) { this.game = game; this.t = 0; }

  update(dt) {
    this.t += dt;
    if (input.justPressed('back') || input.justPressed('start')) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t, 0.6);
    drawText(ctx, 'CONTROLS', W / 2, 14, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    const mid = W * 0.46;
    CONTROL_ROWS.forEach(([key, desc], i) => {
      const y = 32 + i * 13;
      drawText(ctx, key, mid - 6, y, { align: 'right', color: '#4fe3c0', shadow: '#181828' });
      drawText(ctx, desc, mid + 6, y, { color: '#e8e8f0', shadow: '#181828' });
    });
    drawText(ctx, 'ESC: BACK', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Credits ---------------------------------------------------------------------

const CREDIT_LINES = [
  ['RETRO KART GP', '#ffd83d'],
  ['AN ORIGINAL KART RACER', '#cfcfd8'],
  ['', '#fff'],
  ['CODE: BIG B', '#fff'],
  ['', '#fff'],
  ['ASSET PLAN (ALL CC0):', '#4fe3c0'],
  ['KENNEY RACING PACK + RACING KIT', '#cfcfd8'],
  ['KENNEY PIXEL UI PACK + FONTS', '#cfcfd8'],
  ['KENNEY INTERFACE SOUNDS', '#cfcfd8'],
  ['OGA: THEME SONG 8-BIT', '#cfcfd8'],
  ['OGA: A BAG OF CHIPS', '#cfcfd8'],
  ['CC0 RETRO MUSIC', '#cfcfd8'],
  ['', '#fff'],
  ['FALLBACK ART + MUSIC: PROCEDURAL', '#9090a8'],
];

export class CreditsScene {
  constructor(game) { this.game = game; this.t = 0; }

  update(dt) {
    this.t += dt;
    if (input.justPressed('back') || input.justPressed('start')) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t, 0.6);
    CREDIT_LINES.forEach(([line, color], i) => {
      drawText(ctx, line, W / 2, 22 + i * 13, { align: 'center', color, shadow: '#181828', scale: i === 0 ? 2 : 1 });
    });
    drawText(ctx, 'ESC: BACK', W / 2, H - 10, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Mode select --------------------------------------------------------------------

export class ModeSelectScene {
  constructor(game) { this.game = game; this.t = 0; this.sel = 0; this.modes = ['gp', 'tt']; }

  update(dt) {
    this.t += dt;
    const nav = menuNav();
    if (nav) this.sel = (this.sel + nav + this.modes.length) % this.modes.length;
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
      return;
    }
    if (input.justPressed('start')) {
      audio.sfx('select');
      this.game.setScene(new SelectScene(this.game, this.modes[this.sel]));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'SELECT MODE', W / 2, 18, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    this.modes.forEach((id, i) => {
      const m = GAME_MODES[id];
      const y = H * 0.34 + i * 42;
      const sel = i === this.sel;
      ctx.fillStyle = sel ? 'rgba(40,40,80,0.9)' : 'rgba(16,16,32,0.75)';
      ctx.fillRect(W * 0.2, y - 6, W * 0.6, 34);
      ctx.strokeStyle = sel ? '#ffd83d' : '#404058';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(W * 0.2 + 0.5, y - 5.5, W * 0.6 - 1, 33);
      if (sel) drawText(ctx, '>', W * 0.2 - 10, y + 2, { scale: 2, color: '#ffd83d' });
      drawText(ctx, m.name, W / 2, y, { align: 'center', scale: 2, color: sel ? '#fff' : '#9090a8', shadow: '#181828' });
      drawText(ctx, m.blurb, W / 2, y + 16, { align: 'center', color: sel ? '#4fe3c0' : '#7a8a90', shadow: '#181828' });
    });
    drawText(ctx, 'ENTER: SELECT   ESC: BACK', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Track select -------------------------------------------------------------------

export class TrackSelectScene {
  constructor(game, mode, racerId) {
    this.game = game;
    this.mode = mode;
    this.racerId = racerId;
    this.t = 0;
    this.sel = 0;
    this.buzzT = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.buzzT > 0) this.buzzT -= dt;
    if (input.justPressed('left')) { this.sel = (this.sel + TRACKS.length - 1) % TRACKS.length; audio.sfx('move'); }
    if (input.justPressed('right')) { this.sel = (this.sel + 1) % TRACKS.length; audio.sfx('move'); }
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new SelectScene(this.game, this.mode));
      return;
    }
    if (input.justPressed('start')) {
      const track = TRACKS[this.sel];
      if (track.locked) {
        audio.sfx('wrong');
        this.buzzT = 0.4;
      } else {
        audio.sfx('select');
        this.game.startRace(this.racerId, this.mode);
      }
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'SELECT TRACK', W / 2, 14, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    drawText(ctx, GAME_MODES[this.mode].name, W / 2, 28, { align: 'center', color: '#4fe3c0', shadow: '#181828' });

    const cardW = Math.floor(W / 3.6);
    const gap = Math.floor((W - cardW * 3) / 4);
    TRACKS.forEach((track, i) => {
      const x = gap + i * (cardW + gap);
      const y = H * 0.26;
      const cardH = H * 0.5;
      const sel = i === this.sel;
      const shake = sel && this.buzzT > 0 ? Math.sin(this.t * 60) * 2 : 0;
      ctx.fillStyle = sel ? 'rgba(40,40,80,0.9)' : 'rgba(16,16,32,0.75)';
      ctx.fillRect(x + shake, y, cardW, cardH);
      ctx.strokeStyle = sel ? (track.locked ? '#ff5050' : '#ffd83d') : '#404058';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + shake + 0.5, y + 0.5, cardW - 1, cardH - 1);

      if (track.locked) {
        // padlock glyph
        const lx = x + shake + cardW / 2, ly = y + cardH * 0.34;
        ctx.strokeStyle = '#7a8a90';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(lx, ly, 8, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#9090a8';
        ctx.fillRect(lx - 11, ly, 22, 16);
        drawText(ctx, 'LOCKED', lx, y + cardH - 30, { align: 'center', color: '#7a8a90', shadow: '#181828' });
      } else {
        const mm = game.track.minimap;
        const ms = Math.min((cardW - 16) / mm.width, (cardH * 0.62) / mm.height);
        ctx.drawImage(mm, Math.round(x + shake + cardW / 2 - (mm.width * ms) / 2), Math.round(y + 8), Math.round(mm.width * ms), Math.round(mm.height * ms));
      }
      drawText(ctx, track.name, x + shake + cardW / 2, y + cardH - 16, {
        align: 'center', color: sel ? '#fff' : '#9090a8', shadow: '#181828',
      });
    });
    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ENTER: RACE!   ESC: BACK', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Racer select -------------------------------------------------------------------

export class SelectScene {
  constructor(game, mode = 'gp') { this.game = game; this.mode = mode; this.t = 0; this.sel = 0; }

  update(dt) {
    this.t += dt;
    if (input.justPressed('left')) { this.sel = (this.sel + RACERS.length - 1) % RACERS.length; audio.sfx('move'); }
    if (input.justPressed('right')) { this.sel = (this.sel + 1) % RACERS.length; audio.sfx('move'); }
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new ModeSelectScene(this.game));
      return;
    }
    if (input.justPressed('start')) {
      audio.sfx('select');
      this.game.setScene(new TrackSelectScene(this.game, this.mode, RACERS[this.sel].id));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'CHOOSE YOUR RACER', W / 2, 16, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });

    const cardW = Math.floor(W / 4.6);
    const gap = Math.floor((W - cardW * 4) / 5);
    RACERS.forEach((r, i) => {
      const x = gap + i * (cardW + gap);
      const y = H * 0.24;
      const cardH = H * 0.5;
      const sel = i === this.sel;
      ctx.fillStyle = sel ? 'rgba(40,40,80,0.9)' : 'rgba(16,16,32,0.75)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = sel ? r.uiColor : '#404058';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);

      // rotating kart preview
      const sheet = game.sprites.karts[r.id];
      const frame = sel ? Math.floor(this.t * 8) % KART_FRAMES : 12;
      const kw = KART_FW * 1.6, kh = KART_FH * 1.6;
      ctx.drawImage(sheet, frame * KART_FW, 0, KART_FW, KART_FH,
        Math.round(x + cardW / 2 - kw / 2), Math.round(y + 12), Math.round(kw), Math.round(kh));

      drawText(ctx, r.name, x + cardW / 2, y + cardH - 38, { align: 'center', scale: 2, color: sel ? '#fff' : '#9090a8', shadow: '#181828' });
      // stat bars
      const bars = [['SPD', r.stats.speed], ['GRP', r.stats.grip]];
      bars.forEach(([label, v], bi) => {
        const by = y + cardH - 20 + bi * 8;
        drawText(ctx, label, x + 5, by, { color: '#9090a8' });
        ctx.fillStyle = '#2a2a40';
        ctx.fillRect(x + 22, by + 1, cardW - 28, 3);
        ctx.fillStyle = r.uiColor;
        ctx.fillRect(x + 22, by + 1, Math.round((cardW - 28) * (v - 0.7) / 0.45), 3);
      });
    });

    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ENTER: NEXT   ESC: BACK', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Results --------------------------------------------------------------------------

export class ResultsScene {
  constructor(game, standings, racerId, mode = 'gp') {
    this.game = game;
    this.standings = standings;
    this.racerId = racerId;
    this.mode = mode;
    this.t = 0;
  }

  enter() { audio.playMusic('title'); }

  update(dt) {
    this.t += dt;
    if (input.justPressed('start') || input.justPressed('back')) {
      audio.sfx('select');
      this.game.setScene(new MenuScene(this.game));
    } else if (input.justPressed('recover')) {
      audio.sfx('select');
      this.game.startRace(this.racerId, this.mode);
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t, 0.55);

    if (this.mode === 'tt') {
      this.renderTimeTrial(ctx, W, H);
      return;
    }
    drawText(ctx, 'RACE RESULTS', W / 2, 16, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    drawText(ctx, game.track.name, W / 2, 30, { align: 'center', color: '#cfcfd8', shadow: '#181828' });

    this.standings.forEach((s, i) => {
      // rows slide in one at a time
      if (this.t < 0.3 + i * 0.25) return;
      const y = H * 0.28 + i * 20;
      drawText(ctx, ORDINALS[i], W * 0.14, y, { scale: 2, color: ORD_COLORS[i], shadow: '#181828' });
      drawText(ctx, s.racer.name, W * 0.32, y, {
        scale: 2,
        color: s.isPlayer ? '#fff' : '#9090a8',
        shadow: '#181828',
      });
      drawText(ctx, formatTime(s.time), W * 0.86, y, { align: 'right', scale: 2, color: '#cfcfd8', shadow: '#181828' });
      if (s.isPlayer) drawText(ctx, '>', W * 0.14 - 10, y, { scale: 2, color: '#ffd83d' });
    });

    const player = this.standings.find((s) => s.isPlayer);
    if (player?.bestLap != null && this.t > 1.5) {
      drawText(ctx, `BEST LAP ${formatTime(player.bestLap)}`, W / 2, H * 0.78, { align: 'center', color: '#4fe3c0', shadow: '#181828' });
    }
    drawText(ctx, 'ENTER: MENU   R: REMATCH', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }

  renderTimeTrial(ctx, W, H) {
    const s = this.standings.find((x) => x.isPlayer) || this.standings[0];
    drawText(ctx, 'TIME TRIAL', W / 2, 16, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    drawText(ctx, this.game.track.name, W / 2, 30, { align: 'center', color: '#cfcfd8', shadow: '#181828' });

    drawText(ctx, 'TOTAL', W * 0.3, H * 0.28, { color: '#9090a8', shadow: '#181828' });
    drawText(ctx, formatTime(s.time), W * 0.3, H * 0.28 + 10, { scale: 2, color: '#fff', shadow: '#181828' });
    drawText(ctx, 'BEST LAP', W * 0.7 - 30, H * 0.28, { color: '#9090a8', shadow: '#181828' });
    drawText(ctx, formatTime(s.bestLap), W * 0.7 - 30, H * 0.28 + 10, { scale: 2, color: '#4fe3c0', shadow: '#181828' });

    (s.lapTimes || []).forEach((lt, i) => {
      if (this.t < 0.3 + i * 0.2) return;
      const y = H * 0.48 + i * 13;
      const best = lt === s.bestLap;
      drawText(ctx, `LAP ${i + 1}`, W * 0.34, y, { color: best ? '#4fe3c0' : '#9090a8', shadow: '#181828' });
      drawText(ctx, formatTime(lt), W * 0.66, y, { align: 'right', color: best ? '#4fe3c0' : '#e8e8f0', shadow: '#181828' });
    });

    drawText(ctx, 'ENTER: MENU   R: RETRY', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}
