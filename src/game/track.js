// "Sunset Loop": the day-1 circuit. Builds the 2048x2048 mode-7 ground
// texture, a half-resolution surface-type map, evenly spaced centerline
// samples for AI/progress, item boxes, boost pads and decorations.

import { catmullRom, mulberry32, TAU } from '../engine/math.js';

export const WORLD = 2048;
export const ROAD_W = 120;
export const N_SAMPLES = 720;

export const SURF = { GRASS: 0, ROAD: 1, CURB: 2, BOOST: 4 };

// Closed circuit control points, clockwise-ish, start on the bottom straight.
const CONTROL = [
  { x: 430, y: 1690 },
  { x: 900, y: 1760 },
  { x: 1400, y: 1700 },
  { x: 1740, y: 1380 },
  { x: 1700, y: 980 },
  { x: 1460, y: 740 },
  { x: 1190, y: 880 },
  { x: 1010, y: 660 },
  { x: 680, y: 440 },
  { x: 360, y: 640 },
  { x: 290, y: 1080 },
  { x: 250, y: 1420 },
];

function buildSamples() {
  // Dense pass for arc length, then uniform resample
  const dense = [];
  const n = CONTROL.length;
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < 60; s++) {
      dense.push(catmullRom(p0, p1, p2, p3, s / 60));
    }
  }
  let total = 0;
  const lens = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(total);
  }
  const samples = [];
  let di = 0;
  for (let i = 0; i < N_SAMPLES; i++) {
    const target = (i / N_SAMPLES) * total;
    while (lens[di + 1] < target && di < dense.length - 1) di++;
    const a = dense[di], b = dense[(di + 1) % dense.length];
    const t = (target - lens[di]) / Math.max(1e-6, lens[di + 1] - lens[di]);
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  for (let i = 0; i < N_SAMPLES; i++) {
    const a = samples[i], b = samples[(i + 1) % N_SAMPLES];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    a.dx = (b.x - a.x) / d;
    a.dy = (b.y - a.y) / d;
  }
  return { samples, length: total };
}

function tracePath(ctx, samples) {
  ctx.beginPath();
  ctx.moveTo(samples[0].x, samples[0].y);
  for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y);
  ctx.closePath();
}

function offsetPath(ctx, samples, off) {
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const x = s.x - s.dy * off, y = s.y + s.dx * off;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function curvatureAt(samples, i, span = 12) {
  const a = samples[i], b = samples[(i + span) % N_SAMPLES];
  // cross product sign: + means turning left (screen coords)
  return a.dx * b.dy - a.dy * b.dx;
}

export function buildTrack() {
  const rng = mulberry32(20260610);
  const { samples, length } = buildSamples();

  // ---- ground texture ----------------------------------------------------
  const tex = document.createElement('canvas');
  tex.width = tex.height = WORLD;
  const g = tex.getContext('2d');

  // grass: two-tone 64px checker + speckle
  g.fillStyle = '#4f9d44';
  g.fillRect(0, 0, WORLD, WORLD);
  g.fillStyle = '#479240';
  for (let y = 0; y < WORLD / 64; y++) {
    for (let x = 0; x < WORLD / 64; x++) {
      if ((x + y) & 1) g.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  g.fillStyle = '#3d8438';
  for (let i = 0; i < 2600; i++) {
    g.fillRect((rng() * WORLD) | 0, (rng() * WORLD) | 0, 3, 3);
  }
  g.fillStyle = '#5cab50';
  for (let i = 0; i < 1800; i++) {
    g.fillRect((rng() * WORLD) | 0, (rng() * WORLD) | 0, 2, 2);
  }

  // road on its own layer so speckle can clip to it
  const road = document.createElement('canvas');
  road.width = road.height = WORLD;
  const rg = road.getContext('2d');
  rg.lineJoin = 'round';
  // curb: white base, red dashes over it
  tracePath(rg, samples);
  rg.lineWidth = ROAD_W + 18;
  rg.strokeStyle = '#e8e4dc';
  rg.stroke();
  rg.setLineDash([26, 26]);
  rg.strokeStyle = '#cf3a30';
  rg.stroke();
  rg.setLineDash([]);
  // asphalt
  rg.lineWidth = ROAD_W;
  rg.strokeStyle = '#63636e';
  rg.stroke();
  // asphalt speckle (clipped onto existing pixels)
  rg.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9000; i++) {
    rg.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    rg.fillRect((rng() * WORLD) | 0, (rng() * WORLD) | 0, 3, 3);
  }
  rg.globalCompositeOperation = 'source-over';
  // edge lines + dashed centerline
  for (const off of [-(ROAD_W / 2 - 6), ROAD_W / 2 - 6]) {
    offsetPath(rg, samples, off);
    rg.lineWidth = 3;
    rg.strokeStyle = 'rgba(235,235,225,0.85)';
    rg.stroke();
  }
  tracePath(rg, samples);
  rg.setLineDash([16, 34]);
  rg.lineWidth = 3;
  rg.strokeStyle = 'rgba(220,200,110,0.8)';
  rg.stroke();
  rg.setLineDash([]);

  // boost pads: pick straights (low curvature), spaced apart
  const boostPads = [];
  const padCandidates = [];
  for (let i = 0; i < N_SAMPLES; i += 4) {
    if (Math.abs(curvatureAt(samples, i, 20)) < 0.06) padCandidates.push(i);
  }
  for (const want of [0.2, 0.55, 0.85]) {
    const target = (want * N_SAMPLES) | 0;
    let best = null, bd = 1e9;
    for (const c of padCandidates) {
      const d = Math.min(Math.abs(c - target), N_SAMPLES - Math.abs(c - target));
      if (d < bd) { bd = d; best = c; }
    }
    if (best != null) boostPads.push(best);
  }
  for (const idx of boostPads) {
    const s = samples[idx];
    rg.save();
    rg.translate(s.x, s.y);
    rg.rotate(Math.atan2(s.dy, s.dx));
    rg.fillStyle = '#e87820';
    for (let k = 0; k < 3; k++) {
      const ox = k * 20 - 20;
      rg.beginPath();
      rg.moveTo(ox + 14, 0);
      rg.lineTo(ox - 4, -18);
      rg.lineTo(ox + 4, -18);
      rg.lineTo(ox + 14 + 8, 0);
      rg.lineTo(ox + 4, 18);
      rg.lineTo(ox - 4, 18);
      rg.closePath();
      rg.fill();
    }
    rg.restore();
  }

  // start / finish checker band at sample 0
  {
    const s = samples[0];
    rg.save();
    rg.translate(s.x, s.y);
    rg.rotate(Math.atan2(s.dy, s.dx));
    const sq = 10, half = (ROAD_W / 2 - 8);
    for (let row = 0; row < 2; row++) {
      for (let j = -Math.floor(half / sq); j < Math.floor(half / sq); j++) {
        rg.fillStyle = (row + j) & 1 ? '#1c1c20' : '#f2f2ee';
        rg.fillRect(row * sq - sq, j * sq, sq, sq);
      }
    }
    rg.restore();
  }

  g.drawImage(road, 0, 0);

  // ---- surface map (half resolution) --------------------------------------
  const SURF_SIZE = 1024;
  const sc = document.createElement('canvas');
  sc.width = sc.height = SURF_SIZE;
  const sg = sc.getContext('2d');
  sg.fillStyle = 'rgb(0,0,0)';
  sg.fillRect(0, 0, SURF_SIZE, SURF_SIZE);
  sg.save();
  sg.scale(0.5, 0.5);
  sg.lineJoin = 'round';
  tracePath(sg, samples);
  sg.lineWidth = ROAD_W + 18;
  sg.strokeStyle = 'rgb(160,0,0)'; // curb
  sg.stroke();
  sg.lineWidth = ROAD_W;
  sg.strokeStyle = 'rgb(80,0,0)';  // road
  sg.stroke();
  sg.fillStyle = 'rgb(240,0,0)';   // boost
  for (const idx of boostPads) {
    const s = samples[idx];
    sg.save();
    sg.translate(s.x, s.y);
    sg.rotate(Math.atan2(s.dy, s.dx));
    sg.fillRect(-30, -20, 70, 40);
    sg.restore();
  }
  sg.restore();
  const sdata = sg.getImageData(0, 0, SURF_SIZE, SURF_SIZE).data;
  const surface = new Uint8Array(SURF_SIZE * SURF_SIZE);
  for (let i = 0; i < surface.length; i++) {
    const r = sdata[i * 4];
    surface[i] = r >= 200 ? SURF.BOOST : r >= 120 ? SURF.CURB : r >= 40 ? SURF.ROAD : SURF.GRASS;
  }

  const surfaceAt = (x, y) => {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return SURF.GRASS;
    return surface[((y >> 1) << 10) | (x >> 1)];
  };

  // ---- decorations ---------------------------------------------------------
  const decor = [];
  for (let i = 0; i < N_SAMPLES; i += 14) {
    if (rng() < 0.45) continue;
    const s = samples[i];
    const side = rng() < 0.5 ? 1 : -1;
    const dist = ROAD_W / 2 + 70 + rng() * 130;
    const x = s.x - s.dy * dist * side;
    const y = s.y + s.dx * dist * side;
    if (x < 60 || y < 60 || x > WORLD - 60 || y > WORLD - 60) continue;
    if (surfaceAt(x | 0, y | 0) !== SURF.GRASS) continue;
    decor.push({ type: 'tree', variant: (rng() * 3) | 0, x, y, size: 30 + rng() * 14 });
  }
  // arrow signs before the two sharpest corners
  const curvs = [];
  for (let i = 0; i < N_SAMPLES; i += 6) {
    curvs.push({ i, c: curvatureAt(samples, i, 16) });
  }
  curvs.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  const used = [];
  for (const cv of curvs) {
    if (used.length >= 2) break;
    if (used.some((u) => Math.min(Math.abs(u - cv.i), N_SAMPLES - Math.abs(u - cv.i)) < 80)) continue;
    used.push(cv.i);
    const before = (cv.i - 26 + N_SAMPLES) % N_SAMPLES;
    for (let k = 0; k < 3; k++) {
      const s = samples[(before + k * 8) % N_SAMPLES];
      const side = cv.c > 0 ? -1 : 1; // outside of the turn
      decor.push({
        type: 'sign',
        dir: cv.c > 0 ? -1 : 1,
        x: s.x - s.dy * (ROAD_W / 2 + 26) * side,
        y: s.y + s.dx * (ROAD_W / 2 + 26) * side,
        size: 24,
      });
    }
  }

  // ---- item boxes ----------------------------------------------------------
  const itemBoxes = [];
  for (const idx of [150, 460]) {
    for (const off of [-34, 0, 34]) {
      const s = samples[idx];
      itemBoxes.push({
        x: s.x - s.dy * off,
        y: s.y + s.dx * off,
        respawn: 0,
      });
    }
  }

  // ---- minimap -------------------------------------------------------------
  const minimap = document.createElement('canvas');
  minimap.width = minimap.height = 64;
  {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const s of samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const pad = 5;
    const sc2 = Math.min((64 - pad * 2) / (maxX - minX), (64 - pad * 2) / (maxY - minY));
    const ox = (64 - (maxX - minX) * sc2) / 2 - minX * sc2;
    const oy = (64 - (maxY - minY) * sc2) / 2 - minY * sc2;
    const mg = minimap.getContext('2d');
    mg.beginPath();
    for (let i = 0; i < N_SAMPLES; i += 4) {
      const s = samples[i];
      const x = s.x * sc2 + ox, y = s.y * sc2 + oy;
      if (i === 0) mg.moveTo(x, y); else mg.lineTo(x, y);
    }
    mg.closePath();
    mg.lineWidth = 6; mg.strokeStyle = 'rgba(10,10,20,0.75)'; mg.stroke();
    mg.lineWidth = 3; mg.strokeStyle = '#cfcfd8'; mg.stroke();
    // start tick
    const s0 = samples[0];
    mg.fillStyle = '#ffd83d';
    mg.fillRect(s0.x * sc2 + ox - 2, s0.y * sc2 + oy - 2, 4, 4);
    minimap.toWorld = null;
    minimap.mapX = (x) => x * sc2 + ox;
    minimap.mapY = (y) => y * sc2 + oy;
  }

  return {
    name: 'SUNSET LOOP',
    texture: tex,
    surfaceAt,
    samples,
    length,
    boostPads,
    itemBoxes,
    decor,
    minimap,
    startGrid(n) {
      const grid = [];
      for (let i = 0; i < n; i++) {
        const idx = (N_SAMPLES - 16 - i * 11 + N_SAMPLES) % N_SAMPLES;
        const s = samples[idx];
        const off = (i % 2 === 0 ? -1 : 1) * 24;
        grid.push({
          x: s.x - s.dy * off,
          y: s.y + s.dx * off,
          heading: Math.atan2(s.dy, s.dx),
          idx,
        });
      }
      return grid;
    },
  };
}

export function nearestSampleIdx(track, x, y, hint) {
  const samples = track.samples;
  if (hint == null) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < N_SAMPLES; i += 4) {
      const s = samples[i];
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    hint = best;
  }
  let best = hint, bd = Infinity;
  for (let k = -24; k <= 24; k++) {
    const i = (hint + k + N_SAMPLES) % N_SAMPLES;
    const s = samples[i];
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
