// Retro Kart GP — bootstrap, game loop, scene manager, global hotkeys.

import { Display } from './engine/display.js';
import { input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { assets } from './engine/assets.js';
import { drawText } from './engine/font.js';
import { mulberry32 } from './engine/math.js';
import { buildTrack } from './game/track.js';
import { Mode7, buildSkyPanorama } from './game/mode7.js';
import { buildSprites } from './game/sprites.js';
import { RACERS } from './game/data.js';
import { BootScene, MenuScene, ResultsScene } from './game/scenes.js';
import { RaceScene } from './game/race.js';

const PREFS_KEY = 'retro-kart-gp-prefs';

const game = {
  display: new Display(),
  prefs: {
    displayMode: 'wide', scanlines: false, musicVol: 0.7, sfxVol: 0.8, muted: false,
    difficulty: 'NORMAL', laps: 3, reducedMotion: false,
  },
  scene: null,
  debug: false,
  fps: 60,
  toastText: null,
  toastT: 0,
  skyPanorama: null,

  setScene(scene) {
    this.scene?.leave?.();
    this.scene = scene;
    scene.enter?.();
  },

  startRace(racerId, mode = 'gp') {
    this.setScene(new RaceScene(this, { racerId, mode }));
  },

  showResults(standings, racerId, mode = 'gp') {
    this.setScene(new ResultsScene(this, standings, racerId, mode));
  },

  quitToMenu() {
    this.setScene(new MenuScene(this));
  },

  toast(text) {
    this.toastText = text;
    this.toastT = 1.6;
  },

  loadPrefs() {
    try {
      Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {});
    } catch {}
  },

  savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch {}
  },

  applyPrefs() {
    const p = this.prefs;
    if (this.display.mode !== p.displayMode) {
      this.display.setMode(p.displayMode);
      this.rebuildSky();
    }
    this.display.setScanlines(p.scanlines);
    audio.setMusicVolume(p.musicVol);
    audio.setSfxVolume(p.sfxVol);
    audio.setMuted(p.muted);
  },

  rebuildSky() {
    const W = this.display.W, H = this.display.H;
    this.skyPanorama = buildSkyPanorama(W, Math.round(H * 0.4), mulberry32(7));
  },
};

function drawLoadingScreen(progress) {
  const ctx = game.display.ctx;
  const W = game.display.W, H = game.display.H;
  ctx.fillStyle = '#101020';
  ctx.fillRect(0, 0, W, H);
  drawText(ctx, 'RETRO KART GP', W / 2, H * 0.35, { align: 'center', scale: 3, color: '#ffd83d', outline: '#7a2030' });
  drawText(ctx, 'LOADING...', W / 2, H * 0.55, { align: 'center', color: '#cfcfd8' });
  ctx.fillStyle = '#2a2a40';
  ctx.fillRect(W / 2 - 50, H * 0.62, 100, 5);
  ctx.fillStyle = '#4fe3c0';
  ctx.fillRect(W / 2 - 50, H * 0.62, Math.round(100 * progress), 5);
}

function handleGlobalKeys() {
  if (input.justPressed('mute')) {
    game.prefs.muted = audio.toggleMute();
    game.savePrefs();
    game.toast(game.prefs.muted ? 'MUTED' : 'SOUND ON');
  }
  if (input.justPressed('fullscreen')) {
    game.display.toggleFullscreen();
  }
  if (input.justPressed('debug')) {
    game.debug = !game.debug;
    game.toast(game.debug ? 'DEBUG ON' : 'DEBUG OFF');
  }
}

function drawToast(ctx) {
  if (game.toastT <= 0) return;
  const W = game.display.W, H = game.display.H;
  ctx.globalAlpha = Math.min(1, game.toastT * 2.5);
  drawText(ctx, game.toastText, W / 2, H - 24, { align: 'center', color: '#ffd83d', outline: '#181828' });
  ctx.globalAlpha = 1;
}

async function init() {
  game.loadPrefs();
  game.display.setMode(game.prefs.displayMode);
  game.display.setScanlines(game.prefs.scanlines);
  input.init();
  input.onFirstInteraction = () => {
    audio.unlock();
    audio.setMusicVolume(game.prefs.musicVol);
    audio.setSfxVolume(game.prefs.sfxVol);
    audio.setMuted(game.prefs.muted);
    // restart whatever song the current scene wanted
    if (audio.currentSong) {
      const song = audio.currentSong;
      audio.currentSong = null;
      audio.playMusic(song);
    }
  };

  drawLoadingScreen(0);
  await assets.loadAll((p) => drawLoadingScreen(p));
  audio.attachAssets(assets.audio);

  // build procedural content
  game.sprites = buildSprites(RACERS, mulberry32(99));
  game.track = buildTrack();
  game.mode7 = new Mode7(game.track.texture);
  game.rebuildSky();
  {
    let cx = 0, cy = 0;
    for (const s of game.track.samples) { cx += s.x; cy += s.y; }
    game.trackCenter = { x: cx / game.track.samples.length, y: cy / game.track.samples.length };
  }

  // auto-pause the race when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.scene instanceof RaceScene && !game.scene.paused) {
      game.scene.paused = true;
      audio.engineUpdate(0, {});
    }
  });

  window.rk = game; // console access for debugging

  game.setScene(new BootScene(game));
  requestAnimationFrame(loop);
}

// Fixed-timestep update with render decoupled
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let fpsAvg = 60;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was hidden; don't catapult the simulation
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  game.fps = fpsAvg;

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    input.pollGamepad();
    handleGlobalKeys();
    game.scene.update(STEP);
    if (game.toastT > 0) game.toastT -= STEP;
    input.endFrame();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;

  game.scene.render(game.display.ctx);
  drawToast(game.display.ctx);
}

init();
