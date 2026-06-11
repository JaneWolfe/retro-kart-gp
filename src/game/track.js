// "Sunset Loop": the day-1 circuit. Builds the 2048x2048 mode-7 ground
// texture, a half-resolution surface-type map, evenly spaced centerline
// samples for AI/progress, item boxes, boost pads and decorations.

import { catmullRom, mulberry32, TAU } from '../engine/math.js';

export const WORLD = 4096; // power of two (mode-7 sampler wraps via bitmask)
export const ROAD_W = 120;
export const N_SAMPLES = 1440;

export const SURF = { GRASS: 0, ROAD: 1, CURB: 2, DIRT: 3, BOOST: 4, JUMP: 5, WALL: 8 };
export const SURF_NAMES = { 0: 'GRASS', 1: 'ROAD', 2: 'CURB', 3: 'DIRT', 4: 'BOOST', 5: 'JUMP', 8: 'WALL' };

// barrier centerline distance from the road centerline
const WALL_OFF = ROAD_W / 2 + 50;

// "Sunset Loop GP" — one lap, in driving order:
// village boulevard (start) -> right sweep -> forest S-curves -> top-right
// corner -> tunnel through the hill -> hairpin -> ramp straight with a jump
// over a dirt gap -> U-bend -> lakeside -> final corner -> finish.
// Shortcut A cuts the U-bend (dirt); Shortcut B is a jump-entry alley
// between village houses cutting the final corner.
const CONTROL = [
  { x: 650, y: 3450 },   // A start straight
  { x: 1500, y: 3520 },  // B village mid
  { x: 2350, y: 3480 },  // C village end
  { x: 3100, y: 3300 },  // D right sweep
  { x: 3550, y: 2800 },  // E up the right side
  { x: 3350, y: 2300 },  // F S-in
  { x: 3600, y: 1800 },  // G S-out (forest)
  { x: 3400, y: 1250 },  // H top-right corner
  { x: 2850, y: 950 },   // I tunnel entrance
  { x: 2250, y: 850 },   // J tunnel mid
  { x: 1700, y: 900 },   // K tunnel exit
  { x: 1150, y: 800 },   // L run to hairpin
  { x: 650, y: 1000 },   // M hairpin apex
  { x: 900, y: 1500 },   // N hairpin exit
  { x: 1600, y: 1900 },  // O ramp straight mid
  { x: 2300, y: 2300 },  // P straight end
  { x: 2500, y: 2850 },  // Q U-bend east
  { x: 1900, y: 3050 },  // R lakeside curve
  { x: 1150, y: 3050 },  // S lake south shore
  { x: 700, y: 3200 },   // T final corner
];

function buildSamples() {
  // Dense pass for arc length, then uniform resample
  const dense = [];
  const n = CONTROL.length;
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < 160; s++) {
      dense.push(catmullRom(p0, p1, p2, p3, s / 160));
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

// Barrier polylines at ±WALL_OFF from the centerline. Offset paths
// self-intersect at tight corners, which would drop wall fragments onto the
// racing line — so any point that ends up closer than WALL_OFF to *any*
// centerline sample is culled, leaving a gap (runoff) at sharp corner insides.
function buildWallSegments(samples, openings = [], skipRanges = []) {
  const segs = [];
  const minD2 = (WALL_OFF - 4) ** 2;
  const openD2 = 85 ** 2;
  for (const side of [-1, 1]) {
    let cur = null;
    for (let i = 0; i <= N_SAMPLES; i++) {
      const ii = i % N_SAMPLES;
      if (skipRanges.some((r) => ii >= r.a && ii <= r.b)) { cur = null; continue; }
      const s = samples[ii];
      const x = s.x - s.dy * WALL_OFF * side;
      const y = s.y + s.dx * WALL_OFF * side;
      let ok = true;
      for (let j = 0; j < N_SAMPLES; j += 2) {
        const c = samples[j];
        const dx = x - c.x, dy = y - c.y;
        if (dx * dx + dy * dy < minD2) { ok = false; break; }
      }
      // gaps where shortcuts cross the barrier ring
      if (ok) {
        for (const o of openings) {
          const dx = x - o.x, dy = y - o.y;
          if (dx * dx + dy * dy < openD2) { ok = false; break; }
        }
      }
      if (ok) {
        if (!cur) { cur = []; segs.push(cur); }
        cur.push({ x, y });
      } else {
        cur = null;
      }
    }
  }
  return segs.filter((seg) => seg.length > 2);
}

// Trace a sub-range of centerline samples (inclusive, may not wrap)
function traceRange(ctx, samples, a, b, off = 0) {
  ctx.beginPath();
  for (let i = a; i <= b; i++) {
    const s = samples[((i % N_SAMPLES) + N_SAMPLES) % N_SAMPLES];
    const x = s.x - s.dy * off, y = s.y + s.dx * off;
    if (i === a) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

// Interpolate a polyline into evenly spaced points (for painting + culling)
function polyPoints(pts, spacing) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(d / spacing));
    for (let k = 0; k < n; k++) {
      out.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function traceSegments(ctx, segs) {
  ctx.beginPath();
  for (const seg of segs) {
    ctx.moveTo(seg[0].x, seg[0].y);
    for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
  }
}

function curvatureAt(samples, i, span = 12) {
  const a = samples[i], b = samples[(i + span) % N_SAMPLES];
  // cross product sign: + means turning left (screen coords)
  return a.dx * b.dy - a.dy * b.dx;
}

export function buildTrack() {
  const rng = mulberry32(20260610);
  const { samples, length } = buildSamples();

  // ---- feature anchors (resolved to sample indices so layout tweaks are safe)
  const idxNear = (x, y) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < N_SAMPLES; i++) {
      const s = samples[i];
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const at = (i) => samples[((i % N_SAMPLES) + N_SAMPLES) % N_SAMPLES];
  const offPt = (i, off) => {
    const s = at(i);
    return { x: s.x - s.dy * off, y: s.y + s.dx * off };
  };

  const tunnel = { a: idxNear(2850, 950) + 8, b: idxNear(1700, 900) - 8 };
  const jumpIdx = idxNear(1250, 1700);            // ramp on the back straight
  const gap = { a: jumpIdx + 3, b: jumpIdx + 18 }; // dirt gap to fly over
  const hairpinExit = idxNear(900, 1500);
  const villageEnd = idxNear(2350, 3480);

  // Shortcut A: dirt chord across the U-bend (P..R), east of the lake
  const scA = {
    entry: idxNear(2300, 2300) - 6,
    exit: idxNear(1900, 3050) + 14,
  };
  scA.points = polyPoints([
    offPt(scA.entry, 0),
    { x: 2230, y: 2560 },
    { x: 2140, y: 2840 },
    offPt(scA.exit, 0),
  ], 40);
  // Shortcut B: jump-entry alley between village houses, cuts the final corner
  const scB = {
    entry: idxNear(1150, 3050) + 8,
    exit: idxNear(700, 3200) + 10,
  };
  scB.points = polyPoints([
    offPt(scB.entry, 0),
    { x: 1010, y: 3180 },
    { x: 880, y: 3270 },
    offPt(scB.exit, 0),
  ], 40);
  const shortcuts = [scA, scB];
  const shortcutOpenings = [...scA.points, ...scB.points];

  const lake = { x: 1430, y: 2580, rx: 380, ry: 290 };

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
  for (let i = 0; i < 10000; i++) {
    g.fillRect((rng() * WORLD) | 0, (rng() * WORLD) | 0, 3, 3);
  }
  g.fillStyle = '#5cab50';
  for (let i = 0; i < 7000; i++) {
    g.fillRect((rng() * WORLD) | 0, (rng() * WORLD) | 0, 2, 2);
  }

  // lake with a sandy shore (decorative; sits inside the U-bend, off-track)
  {
    g.save();
    g.translate(lake.x, lake.y);
    g.fillStyle = '#d8c08a';
    g.beginPath();
    g.ellipse(0, 0, lake.rx + 42, lake.ry + 42, 0.2, 0, TAU);
    g.fill();
    g.fillStyle = '#2e5fb8';
    g.beginPath();
    g.ellipse(0, 0, lake.rx, lake.ry, 0.2, 0, TAU);
    g.fill();
    // ripple highlights
    g.strokeStyle = 'rgba(150,200,255,0.5)';
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU;
      const rr = 0.2 + rng() * 0.7;
      const cx = Math.cos(a) * lake.rx * rr, cy = Math.sin(a) * lake.ry * rr;
      g.beginPath();
      g.moveTo(cx - 12 - rng() * 14, cy);
      g.lineTo(cx + 12 + rng() * 14, cy);
      g.stroke();
    }
    g.restore();
  }

  // rocky hill the tunnel passes through (road layer paints over the middle)
  {
    traceRange(g, samples, tunnel.a - 14, tunnel.b + 14);
    g.lineCap = 'round';
    g.lineWidth = 470;
    g.strokeStyle = '#4a4254';
    g.stroke();
    g.lineWidth = 400;
    g.strokeStyle = '#564c62';
    g.stroke();
    // rocky speckle along the hill
    for (let i = tunnel.a - 12; i <= tunnel.b + 12; i += 2) {
      const s = at(i);
      for (let k = 0; k < 5; k++) {
        const off = (rng() - 0.5) * 380;
        g.fillStyle = rng() < 0.5 ? '#3c3548' : '#675c74';
        g.fillRect((s.x - s.dy * off + (rng() - 0.5) * 30) | 0, (s.y + s.dx * off + (rng() - 0.5) * 30) | 0, 4, 4);
      }
    }
  }

  // road on its own layer so speckle can clip to it
  const road = document.createElement('canvas');
  road.width = road.height = WORLD;
  const rg = road.getContext('2d');
  rg.lineJoin = 'round';
  // barriers first, so the road paints over any remaining overlap.
  // No barriers through the village — the houses line the road there.
  const wallSegments = buildWallSegments(samples, shortcutOpenings, [
    { a: 6, b: villageEnd - 4 },
  ]);
  rg.lineCap = 'round';
  traceSegments(rg, wallSegments);
  rg.lineWidth = 16;
  rg.strokeStyle = '#23232e';
  rg.stroke();
  rg.lineWidth = 11;
  rg.strokeStyle = '#e8e4dc';
  rg.stroke();
  rg.setLineDash([20, 20]);
  rg.strokeStyle = '#cf3a30';
  rg.stroke();
  rg.setLineDash([]);
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
  for (let i = 0; i < 18000; i++) {
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

  // boost pads at hand-picked spots: village exit, tunnel exit,
  // hairpin exit (carries speed into the jump), after the U-bend
  const boostPads = [
    (villageEnd + 22) % N_SAMPLES,
    (tunnel.b + 26) % N_SAMPLES,
    (hairpinExit + 24) % N_SAMPLES,
    (scA.exit + 40) % N_SAMPLES,
  ];
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

  // dirt shortcuts
  const drawPoly = (ctx2, pts) => {
    ctx2.beginPath();
    ctx2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx2.lineTo(pts[i].x, pts[i].y);
  };
  for (const sc of shortcuts) {
    rg.lineCap = 'round';
    drawPoly(rg, sc.points);
    rg.lineWidth = 52;
    rg.strokeStyle = '#7c6240';
    rg.stroke();
    rg.lineWidth = 44;
    rg.strokeStyle = '#9a7b4f';
    rg.stroke();
    for (const p of sc.points) {
      for (let k = 0; k < 3; k++) {
        rg.fillStyle = rng() < 0.5 ? '#8a6c42' : '#ab8c5e';
        rg.fillRect((p.x + (rng() - 0.5) * 36) | 0, (p.y + (rng() - 0.5) * 36) | 0, 4, 4);
      }
    }
  }

  // dirt gap on the ramp straight (you're meant to fly over it)
  traceRange(rg, samples, gap.a, gap.b);
  rg.lineWidth = ROAD_W - 8;
  rg.strokeStyle = '#8a6c42';
  rg.stroke();
  for (let i = gap.a; i <= gap.b; i++) {
    const s = at(i);
    for (let k = 0; k < 6; k++) {
      const off = (rng() - 0.5) * (ROAD_W - 20);
      rg.fillStyle = rng() < 0.5 ? '#7c6240' : '#9a7b4f';
      rg.fillRect((s.x - s.dy * off) | 0, (s.y + s.dx * off) | 0, 4, 4);
    }
  }

  // ramps: striped launch strips painted across the road
  const paintRamp = (idx, width) => {
    const s = at(idx);
    rg.save();
    rg.translate(s.x, s.y);
    rg.rotate(Math.atan2(s.dy, s.dx));
    rg.fillStyle = '#c8a020';
    rg.fillRect(-4, -width / 2, 26, width);
    rg.fillStyle = '#2a2a30';
    for (let yy = -width / 2; yy < width / 2; yy += 16) {
      rg.beginPath();
      rg.moveTo(-4, yy + 16);
      rg.lineTo(8, yy + 8);
      rg.lineTo(-4, yy);
      rg.closePath();
      rg.fill();
    }
    rg.fillStyle = '#ffd83d';
    rg.fillRect(20, -width / 2, 4, width);
    rg.restore();
  };
  paintRamp(jumpIdx, ROAD_W - 24);

  g.drawImage(road, 0, 0);

  // alley jump strip sits on the shortcut, painted onto the final texture
  const alleyJump = scB.points[1];
  const alleyDir = Math.atan2(scB.points[2].y - scB.points[1].y, scB.points[2].x - scB.points[1].x);
  {
    g.save();
    g.translate(alleyJump.x, alleyJump.y);
    g.rotate(alleyDir);
    g.fillStyle = '#c8a020';
    g.fillRect(-4, -20, 22, 40);
    g.fillStyle = '#2a2a30';
    for (let yy = -20; yy < 20; yy += 13) {
      g.beginPath();
      g.moveTo(-4, yy + 13); g.lineTo(7, yy + 6); g.lineTo(-4, yy);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // ---- surface map (half resolution) --------------------------------------
  const SURF_SIZE = WORLD / 2;
  const SURF_SHIFT = Math.log2(SURF_SIZE);
  const sc = document.createElement('canvas');
  sc.width = sc.height = SURF_SIZE;
  const sg = sc.getContext('2d');
  sg.fillStyle = 'rgb(0,0,0)';
  sg.fillRect(0, 0, SURF_SIZE, SURF_SIZE);
  sg.save();
  sg.scale(0.5, 0.5);
  sg.lineJoin = 'round';
  // walls live in the green channel so antialiased edges against the road
  // (red channel) can't be misread as boost pads
  sg.strokeStyle = 'rgb(0,255,0)';
  sg.lineWidth = 12;
  sg.lineCap = 'round';
  traceSegments(sg, wallSegments);
  sg.stroke();
  tracePath(sg, samples);
  sg.lineWidth = ROAD_W + 18;
  sg.strokeStyle = 'rgb(160,0,0)'; // curb
  sg.stroke();
  sg.lineWidth = ROAD_W;
  sg.strokeStyle = 'rgb(80,0,0)';  // road
  sg.stroke();
  sg.fillStyle = 'rgb(200,0,0)';   // boost
  for (const idx of boostPads) {
    const s = samples[idx];
    sg.save();
    sg.translate(s.x, s.y);
    sg.rotate(Math.atan2(s.dy, s.dx));
    sg.fillRect(-30, -20, 70, 40);
    sg.restore();
  }
  // dirt (blue channel): shortcuts + the gap on the ramp straight
  sg.strokeStyle = 'rgb(0,0,140)';
  sg.lineCap = 'round';
  for (const sc of shortcuts) {
    sg.beginPath();
    sg.moveTo(sc.points[0].x, sc.points[0].y);
    for (let i = 1; i < sc.points.length; i++) sg.lineTo(sc.points[i].x, sc.points[i].y);
    sg.lineWidth = 46;
    sg.stroke();
  }
  traceRange(sg, samples, gap.a, gap.b);
  sg.lineWidth = ROAD_W - 8;
  sg.stroke();
  // jump strips (saturated blue)
  sg.fillStyle = 'rgb(0,0,255)';
  {
    const s = at(jumpIdx);
    sg.save();
    sg.translate(s.x, s.y);
    sg.rotate(Math.atan2(s.dy, s.dx));
    sg.fillRect(-4, -(ROAD_W - 24) / 2, 26, ROAD_W - 24);
    sg.restore();
    sg.save();
    sg.translate(alleyJump.x, alleyJump.y);
    sg.rotate(alleyDir);
    sg.fillRect(-4, -20, 22, 40);
    sg.restore();
  }
  // tunnel tube: tight walls hugging the road edges through the hill
  sg.strokeStyle = 'rgb(0,255,0)';
  sg.lineWidth = 10;
  for (const off of [-(ROAD_W / 2 + 8), ROAD_W / 2 + 8]) {
    traceRange(sg, samples, tunnel.a, tunnel.b, off);
    sg.stroke();
  }
  sg.restore();
  const sdata = sg.getImageData(0, 0, SURF_SIZE, SURF_SIZE).data;
  const surface = new Uint8Array(SURF_SIZE * SURF_SIZE);
  for (let i = 0; i < surface.length; i++) {
    const r = sdata[i * 4];
    const g2 = sdata[i * 4 + 1];
    const b = sdata[i * 4 + 2];
    surface[i] = (g2 >= 100 && r < 40 && b < 100) ? SURF.WALL
      : b >= 220 ? SURF.JUMP
      : b >= 100 ? SURF.DIRT
      : r >= 180 ? SURF.BOOST
      : r >= 120 ? SURF.CURB
      : r >= 40 ? SURF.ROAD
      : SURF.GRASS;
  }

  const surfaceAt = (x, y) => {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return SURF.GRASS;
    return surface[((y >> 1) << SURF_SHIFT) | (x >> 1)];
  };

  // ---- decorations ---------------------------------------------------------
  const decor = [];
  const inIdxRange = (i, a, b) => {
    const n = ((i - a + N_SAMPLES) % N_SAMPLES);
    return n <= ((b - a + N_SAMPLES) % N_SAMPLES);
  };
  const nearLake = (x, y, pad) =>
    ((x - lake.x) / (lake.rx + pad)) ** 2 + ((y - lake.y) / (lake.ry + pad)) ** 2 < 1;
  const nearShortcut = (x, y, pad) =>
    shortcutOpenings.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < pad * pad);

  // start banner + invisible posts holding it up
  {
    const b = offPt(1, 0);
    decor.push({ type: 'banner', x: b.x, y: b.y, size: 170 });
    for (const off of [-72, 72]) {
      const p = offPt(1, off);
      decor.push({ type: 'post', x: p.x, y: p.y, size: 0, invisible: true, solid: true, radius: 9 });
    }
  }
  // grandstand just past the line, outside the left barrier
  {
    const p = offPt(14, -128);
    decor.push({ type: 'grandstand', x: p.x, y: p.y, size: 120, solid: true, radius: 34 });
  }
  // village houses line the boulevard on both sides
  for (let i = 24, v = 0; i < villageEnd - 8; i += 26, v++) {
    for (const side of [-1, 1]) {
      if (rng() < 0.25) continue;
      const p = offPt(i + (side > 0 ? 9 : 0), side * (94 + rng() * 12));
      decor.push({ type: 'house', variant: v % 3, x: p.x, y: p.y, size: 64 + rng() * 10, solid: true, radius: 21 });
      v++;
    }
    if (i % 52 < 26) {
      const lp = offPt(i + 13, (i % 104 < 52 ? 1 : -1) * 76);
      decor.push({ type: 'lamp', x: lp.x, y: lp.y, size: 26, solid: true, radius: 4 });
    }
  }
  // alley houses framing shortcut B (the gap between them IS the alley)
  for (const [pt, ang] of [[scB.points[(scB.points.length * 0.35) | 0], alleyDir], [scB.points[(scB.points.length * 0.65) | 0], alleyDir]]) {
    for (const side of [-1, 1]) {
      decor.push({
        type: 'house', variant: (rng() * 3) | 0,
        x: pt.x - Math.sin(ang) * 58 * side,
        y: pt.y + Math.cos(ang) * 58 * side,
        size: 62, solid: true, radius: 22,
      });
    }
  }
  // tunnel portals + interior lamps (visual only — the tube walls do the work)
  for (const idx of [tunnel.a, tunnel.b]) {
    const p = offPt(idx, 0);
    decor.push({ type: 'portal', x: p.x, y: p.y, size: 168 });
    for (const off of [-74, 74]) {
      const q = offPt(idx, off);
      decor.push({ type: 'post', x: q.x, y: q.y, size: 0, invisible: true, solid: true, radius: 9 });
    }
  }
  for (let i = tunnel.a + 18; i < tunnel.b - 8; i += 22) {
    const p = offPt(i, (i % 44 < 22 ? 1 : -1) * 50);
    decor.push({ type: 'lamp', x: p.x, y: p.y, size: 24 });
  }
  // balloons by the lake shore and the village entrance
  for (const [bx, by] of [[lake.x - lake.rx - 90, lake.y - 120], [lake.x + lake.rx + 70, lake.y + 60], [lake.x, lake.y + lake.ry + 90]]) {
    decor.push({ type: 'balloons', x: bx, y: by, size: 34 });
  }
  {
    const p = offPt(20, -120);
    decor.push({ type: 'balloons', x: p.x, y: p.y, size: 34 });
  }
  // bushes around the lake shore
  for (let k = 0; k < 14; k++) {
    const a = rng() * TAU;
    const x = lake.x + Math.cos(a) * (lake.rx + 70 + rng() * 60);
    const y = lake.y + Math.sin(a) * (lake.ry + 70 + rng() * 60);
    if (surfaceAt(x | 0, y | 0) === SURF.GRASS && !nearShortcut(x, y, 60)) {
      decor.push({ type: 'bush', x, y, size: 16 + rng() * 8 });
    }
  }
  // pine forest everywhere else (skips village, tunnel hill, lake, shortcuts)
  for (let i = 0; i < N_SAMPLES; i += 12) {
    if (rng() < 0.4) continue;
    if (inIdxRange(i, 0, villageEnd) || inIdxRange(i, tunnel.a - 16, tunnel.b + 16)) continue;
    const s = samples[i];
    const side = rng() < 0.5 ? 1 : -1;
    const dist = ROAD_W / 2 + 80 + rng() * 150;
    const x = s.x - s.dy * dist * side;
    const y = s.y + s.dx * dist * side;
    if (x < 60 || y < 60 || x > WORLD - 60 || y > WORLD - 60) continue;
    if (surfaceAt(x | 0, y | 0) !== SURF.GRASS) continue;
    if (nearLake(x, y, 120) || nearShortcut(x, y, 90)) continue;
    decor.push({ type: 'tree', variant: (rng() * 3) | 0, x, y, size: 30 + rng() * 14, solid: true, radius: 9 });
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
  for (const idx of [60, (tunnel.b + 45) % N_SAMPLES, (scA.entry - 40 + N_SAMPLES) % N_SAMPLES]) {
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
    // lake
    mg.fillStyle = 'rgba(70,120,210,0.85)';
    mg.beginPath();
    mg.ellipse(lake.x * sc2 + ox, lake.y * sc2 + oy, lake.rx * sc2, lake.ry * sc2, 0.2, 0, TAU);
    mg.fill();
    // dirt shortcuts
    mg.lineWidth = 1.5;
    mg.strokeStyle = 'rgba(190,150,90,0.9)';
    for (const sc of shortcuts) {
      mg.beginPath();
      mg.moveTo(sc.points[0].x * sc2 + ox, sc.points[0].y * sc2 + oy);
      for (const p of sc.points) mg.lineTo(p.x * sc2 + ox, p.y * sc2 + oy);
      mg.stroke();
    }
    // tunnel section darker
    mg.lineWidth = 3;
    mg.strokeStyle = '#55506a';
    mg.beginPath();
    for (let i = tunnel.a; i <= tunnel.b; i += 4) {
      const s = at(i);
      if (i === tunnel.a) mg.moveTo(s.x * sc2 + ox, s.y * sc2 + oy);
      else mg.lineTo(s.x * sc2 + ox, s.y * sc2 + oy);
    }
    mg.stroke();
    // start tick
    const s0 = samples[0];
    mg.fillStyle = '#ffd83d';
    mg.fillRect(s0.x * sc2 + ox - 2, s0.y * sc2 + oy - 2, 4, 4);
    minimap.toWorld = null;
    minimap.mapX = (x) => x * sc2 + ox;
    minimap.mapY = (y) => y * sc2 + oy;
  }

  return {
    name: 'SUNSET LOOP GP',
    texture: tex,
    surfaceAt,
    samples,
    length,
    boostPads,
    itemBoxes,
    decor,
    solids: decor.filter((d) => d.solid),
    tunnels: [tunnel],
    shortcuts,
    lake,
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

export function nearestSampleIdx(track, x, y, hint, wide = false) {
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
  const win = wide ? 90 : 24;
  let best = hint, bd = Infinity;
  for (let k = -win; k <= win; k++) {
    const i = (hint + k + N_SAMPLES) % N_SAMPLES;
    const s = samples[i];
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
