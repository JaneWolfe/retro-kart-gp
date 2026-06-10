// Non-race scenes: Title, Menu, Options, Credits, Racer Select, Results.
// Menus render over a slowly orbiting mode-7 view of the track.

import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { drawText, textWidth } from '../engine/font.js';
import { formatTime, TAU } from '../engine/math.js';
import { MODES } from '../engine/display.js';
import { drawSky } from './mode7.js';
import { KART_FW, KART_FH, KART_FRAMES } from './sprites.js';
import { RACERS } from './data.js';

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

    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, 'PRESS ENTER', W / 2, H * 0.62, { align: 'center', scale: 2, color: '#fff', outline: '#181828' });
    }
    drawText(ctx, '(C) 2026 BIG B - ALL ASSETS CC0/ORIGINAL', W / 2, H - 10, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
    if (!audio.unlocked) {
      drawText(ctx, 'PRESS ANY KEY FOR SOUND', W / 2, H * 0.72, { align: 'center', color: '#9090a8', shadow: '#181828' });
    }
  }
}

// ---- Main menu ---------------------------------------------------------------

const MENU_ITEMS = ['QUICK RACE', 'OPTIONS', 'CREDITS'];

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
      if (this.sel === 0) this.game.setScene(new SelectScene(this.game));
      else if (this.sel === 1) this.game.setScene(new OptionsScene(this.game));
      else this.game.setScene(new CreditsScene(this.game));
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t);
    drawText(ctx, 'RETRO KART GP', W / 2, 18, { align: 'center', scale: 2, color: '#ffd83d', outline: '#181828' });
    MENU_ITEMS.forEach((label, i) => {
      const y = H * 0.38 + i * 20;
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
      { label: 'MUSIC', value: p.music ? 'ON' : 'OFF', change: () => { p.music = !p.music; this.game.applyPrefs(); } },
      { label: 'SFX', value: p.sfx ? 'ON' : 'OFF', change: () => { p.sfx = !p.sfx; this.game.applyPrefs(); } },
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
      const y = H * 0.32 + i * 18;
      const sel = i === this.sel;
      if (sel) drawText(ctx, '>', W * 0.18 - 10, y, { scale: 2, color: '#ffd83d' });
      drawText(ctx, row.label, W * 0.18, y, { scale: 2, color: sel ? '#fff' : '#9090a8', shadow: '#181828' });
      drawText(ctx, row.value, W * 0.82, y, { align: 'right', scale: 2, color: sel ? '#4fe3c0' : '#7a8a90', shadow: '#181828' });
    });
    drawText(ctx, 'LEFT/RIGHT OR ENTER: CHANGE', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
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

// ---- Racer select -------------------------------------------------------------------

export class SelectScene {
  constructor(game) { this.game = game; this.t = 0; this.sel = 0; }

  update(dt) {
    this.t += dt;
    if (input.justPressed('left')) { this.sel = (this.sel + RACERS.length - 1) % RACERS.length; audio.sfx('move'); }
    if (input.justPressed('right')) { this.sel = (this.sel + 1) % RACERS.length; audio.sfx('move'); }
    if (input.justPressed('back')) {
      audio.sfx('back');
      this.game.setScene(new MenuScene(this.game));
      return;
    }
    if (input.justPressed('start')) {
      audio.sfx('select');
      this.game.startRace(RACERS[this.sel].id);
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

    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ENTER: RACE!', W / 2, H - 12, { align: 'center', color: '#b8b8cc', shadow: '#181828' });
  }
}

// ---- Results --------------------------------------------------------------------------

export class ResultsScene {
  constructor(game, standings, racerId) {
    this.game = game;
    this.standings = standings;
    this.racerId = racerId;
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
      this.game.startRace(this.racerId);
    }
  }

  render(ctx) {
    const game = this.game;
    const W = game.display.W, H = game.display.H;
    drawBackdrop(game, ctx, this.t, 0.55);
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
}
