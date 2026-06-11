// Procedural sprite baking: karts (16 pseudo-3D view angles), item boxes,
// trees, arrow signs. Drawn at 4x then nearest-downscaled for a chunky
// pixel-art look. If a Kenney sprite sheet is present in /assets it could
// replace these (hookup planned, see HANDOFF).

import { TAU } from '../engine/math.js';
import { drawText } from '../engine/font.js';

const SS = 4; // supersample factor

function downscale(big, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(big, 0, 0, w, h);
  return c;
}

// Draw one kart viewed from angle phi (0 = seen from behind, facing away).
function drawKartView(g, cx, baseY, phi, colors, scale) {
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const tilt = 0.5;
  // body coords: fx = forward, sy = right, hz = height
  const proj = (fx, sy, hz) => {
    const depth = fx * cosP - sy * sinP;
    const lateral = fx * sinP + sy * cosP;
    return { x: cx + lateral * scale, y: baseY - depth * tilt * scale - hz * scale, d: depth };
  };
  const parts = [];
  // wheels
  for (const [fx, sy] of [[7, -6.5], [7, 6.5], [-7, -7], [-7, 7]]) {
    const p = proj(fx, sy, 0);
    parts.push({
      d: p.d, draw: () => {
        g.fillStyle = '#1a1a20';
        g.beginPath();
        g.ellipse(p.x, p.y, 3.4 * scale, 2.9 * scale, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#4a4a52';
        g.beginPath();
        g.ellipse(p.x, p.y - 0.8 * scale, 1.5 * scale, 1.2 * scale, 0, 0, TAU);
        g.fill();
      },
    });
  }
  // chassis (quad from projected corners)
  const corners = [[9, -4.5], [9, 4.5], [-8, 5.5], [-8, -5.5]].map(([fx, sy]) => proj(fx, sy, 2));
  parts.push({
    d: 0.5, draw: () => {
      g.fillStyle = colors.body;
      g.beginPath();
      g.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) g.lineTo(corners[i].x, corners[i].y);
      g.closePath();
      g.fill();
      g.strokeStyle = '#101018';
      g.lineWidth = scale * 0.7;
      g.stroke();
      // nose stripe
      const n1 = proj(9, 0, 2.5), n2 = proj(3, 0, 2.5);
      g.strokeStyle = colors.accent;
      g.lineWidth = 2 * scale;
      g.beginPath(); g.moveTo(n1.x, n1.y); g.lineTo(n2.x, n2.y); g.stroke();
    },
  });
  // rear wing
  const w1 = proj(-8.5, -5, 5), w2 = proj(-8.5, 5, 5);
  parts.push({
    d: w1.d, draw: () => {
      g.strokeStyle = colors.accent;
      g.lineWidth = 2.2 * scale;
      g.beginPath(); g.moveTo(w1.x, w1.y); g.lineTo(w2.x, w2.y); g.stroke();
    },
  });
  // driver helmet
  const hp = proj(-1.5, 0, 6);
  parts.push({
    d: hp.d * 0.9, draw: () => {
      g.fillStyle = colors.helmet;
      g.beginPath(); g.arc(hp.x, hp.y, 3 * scale, 0, TAU); g.fill();
      g.strokeStyle = '#101018'; g.lineWidth = scale * 0.6; g.stroke();
      // visor faces the kart's forward direction
      if (cosP < -0.2) {
        const vp = proj(0.5, 0, 6.2);
        g.fillStyle = '#202838';
        g.beginPath(); g.ellipse(vp.x, vp.y, 1.8 * scale, 1.2 * scale, 0, 0, TAU); g.fill();
      }
    },
  });
  parts.sort((a, b) => b.d - a.d); // larger depth = farther from viewer, draw first
  for (const p of parts) p.draw();
}

export const KART_FW = 30;
export const KART_FH = 26;
export const KART_FRAMES = 16;

export function makeKartSheet(colors) {
  const big = document.createElement('canvas');
  big.width = KART_FW * SS * KART_FRAMES;
  big.height = KART_FH * SS;
  const g = big.getContext('2d');
  for (let i = 0; i < KART_FRAMES; i++) {
    const phi = (i / KART_FRAMES) * TAU;
    drawKartView(g, (i + 0.5) * KART_FW * SS, KART_FH * SS - 7 * SS, phi, colors, SS * 0.95);
  }
  return downscale(big, KART_FW * KART_FRAMES, KART_FH);
}

export function makeItemBox() {
  const s = 18, big = document.createElement('canvas');
  big.width = big.height = s * SS;
  const g = big.getContext('2d');
  const c = (s * SS) / 2;
  g.save();
  g.translate(c, c);
  g.rotate(Math.PI / 4);
  const grad = g.createLinearGradient(-c * 0.6, -c * 0.6, c * 0.6, c * 0.6);
  grad.addColorStop(0, '#3ee0d8');
  grad.addColorStop(0.5, '#7a5cff');
  grad.addColorStop(1, '#ff5ca8');
  g.fillStyle = grad;
  g.globalAlpha = 0.88;
  g.fillRect(-c * 0.58, -c * 0.58, c * 1.16, c * 1.16);
  g.globalAlpha = 1;
  g.strokeStyle = '#ffffff';
  g.lineWidth = SS;
  g.strokeRect(-c * 0.58, -c * 0.58, c * 1.16, c * 1.16);
  g.restore();
  const small = downscale(big, s, s);
  const sg = small.getContext('2d');
  drawText(sg, '?', s / 2, s / 2 - 2.5, { color: '#ffffff', align: 'center', shadow: '#303060' });
  return small;
}

export function makeTree(rng) {
  const w = 26, h = 42;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  const cx = (w * SS) / 2;
  g.fillStyle = '#6b4226';
  g.fillRect(cx - 2 * SS, (h - 8) * SS, 4 * SS, 8 * SS);
  const greens = ['#1d6e35', '#27843f', '#33994a'];
  let top = 2 * SS;
  for (let i = 0; i < 3; i++) {
    const half = (11 - i * 2.6) * SS * (0.9 + rng() * 0.2);
    const bh = 13 * SS;
    g.fillStyle = greens[i];
    g.beginPath();
    g.moveTo(cx, top);
    g.lineTo(cx - half, top + bh);
    g.lineTo(cx + half, top + bh);
    g.closePath();
    g.fill();
    top += 8 * SS;
  }
  return downscale(big, w, h);
}

export function makeSign(dir) { // dir: -1 chevron points left, 1 right
  const w = 20, h = 26;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  const cx = (w * SS) / 2;
  g.fillStyle = '#777';
  g.fillRect(cx - 1.5 * SS, 12 * SS, 3 * SS, 14 * SS);
  g.fillStyle = '#e8b020';
  g.fillRect(cx - 9 * SS, 0, 18 * SS, 13 * SS);
  g.strokeStyle = '#222';
  g.lineWidth = SS;
  g.strokeRect(cx - 9 * SS, 0, 18 * SS, 13 * SS);
  g.strokeStyle = '#222';
  g.lineWidth = 2.5 * SS;
  for (const off of [-4, 2]) {
    g.beginPath();
    g.moveTo(cx + (off - 2 * dir) * SS, 2.5 * SS);
    g.lineTo(cx + (off + 2 * dir) * SS, 6.5 * SS);
    g.lineTo(cx + (off - 2 * dir) * SS, 10.5 * SS);
    g.stroke();
  }
  return downscale(big, w, h);
}

const HOUSE_PALETTES = [
  { wall: '#d8c8a8', roof: '#a04038', trim: '#7a5c3a' },
  { wall: '#b8c8d8', roof: '#3a5a8a', trim: '#5a6a7a' },
  { wall: '#d8b890', roof: '#6a8a4a', trim: '#8a6a4a' },
];

export function makeHouse(variant) {
  const w = 56, h = 52;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  const pal = HOUSE_PALETTES[variant % HOUSE_PALETTES.length];
  const W2 = w * SS;
  // walls
  g.fillStyle = pal.wall;
  g.fillRect(4 * SS, 22 * SS, (w - 8) * SS, (h - 22) * SS);
  g.strokeStyle = '#2a2430';
  g.lineWidth = SS;
  g.strokeRect(4 * SS, 22 * SS, (w - 8) * SS, (h - 22) * SS);
  // roof
  g.fillStyle = pal.roof;
  g.beginPath();
  g.moveTo(0, 24 * SS);
  g.lineTo(W2 / 2, 2 * SS);
  g.lineTo(W2, 24 * SS);
  g.closePath();
  g.fill();
  g.strokeStyle = '#241c28';
  g.stroke();
  // roof shading stripes
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 4; i++) {
    g.fillRect((6 + i * 12) * SS, (8 + i * 4) * SS, 8 * SS, 2 * SS);
  }
  // chimney
  g.fillStyle = pal.trim;
  g.fillRect((w - 18) * SS, 4 * SS, 6 * SS, 12 * SS);
  // door
  g.fillStyle = pal.trim;
  g.fillRect((w / 2 - 5) * SS, (h - 16) * SS, 10 * SS, 16 * SS);
  g.fillStyle = '#ffd83d';
  g.fillRect((w / 2 + 1) * SS, (h - 9) * SS, 2 * SS, 2 * SS);
  // lit windows
  g.fillStyle = '#ffd27a';
  for (const wx of [10, w - 18]) {
    g.fillRect(wx * SS, 28 * SS, 8 * SS, 8 * SS);
    g.strokeStyle = '#2a2430';
    g.strokeRect(wx * SS, 28 * SS, 8 * SS, 8 * SS);
  }
  return downscale(big, w, h);
}

export function makeGrandstand() {
  const w = 96, h = 50;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  // stand body
  g.fillStyle = '#5a5a68';
  g.fillRect(2 * SS, 16 * SS, (w - 4) * SS, (h - 16) * SS);
  g.strokeStyle = '#23232e';
  g.lineWidth = SS;
  g.strokeRect(2 * SS, 16 * SS, (w - 4) * SS, (h - 16) * SS);
  // tiered rows of crowd (random bright pixels)
  const crowd = ['#ff6a5e', '#ffd83d', '#4fe3c0', '#b08aff', '#f0f0f0', '#e8915a'];
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 3; row++) {
    const ry = (20 + row * 9) * SS;
    g.fillStyle = '#3c3c48';
    g.fillRect(4 * SS, ry + 5 * SS, (w - 8) * SS, 3 * SS);
    for (let cx = 6; cx < w - 6; cx += 4) {
      if (rnd() < 0.82) {
        g.fillStyle = crowd[(rnd() * crowd.length) | 0];
        g.fillRect(cx * SS, ry, 3 * SS, 4 * SS);
      }
    }
  }
  // striped awning
  for (let cx = 0; cx < w; cx += 12) {
    g.fillStyle = (cx / 12) % 2 ? '#e8e4dc' : '#cf3a30';
    g.fillRect(cx * SS, 8 * SS, 12 * SS, 8 * SS);
  }
  g.fillStyle = '#23232e';
  g.fillRect(0, 14 * SS, w * SS, 2 * SS);
  return downscale(big, w, h);
}

export function makeBanner() {
  // drawn at 1x — mostly rectangles and text, supersampling would blur it
  const w = 150, h = 46;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // posts
  g.fillStyle = '#3c3c48';
  g.fillRect(2, 8, 5, h - 8);
  g.fillRect(w - 7, 8, 5, h - 8);
  // board
  g.fillStyle = '#1c4a8a';
  g.fillRect(0, 4, w, 18);
  g.strokeStyle = '#101820';
  g.strokeRect(0.5, 4.5, w - 1, 17);
  // checker trim
  for (let cx = 0; cx < w; cx += 5) {
    g.fillStyle = (cx / 5) % 2 ? '#f0f0ee' : '#1c1c20';
    g.fillRect(cx, 4, 5, 3);
    g.fillStyle = (cx / 5) % 2 ? '#1c1c20' : '#f0f0ee';
    g.fillRect(cx, 19, 5, 3);
  }
  drawText(g, 'SUNSET GP', w / 2, 9, { align: 'center', color: '#ffd83d', shadow: '#0a1020' });
  // little flags on the posts
  g.fillStyle = '#ff6a5e';
  g.beginPath(); g.moveTo(4, 0); g.lineTo(14, 3); g.lineTo(4, 6); g.fill();
  g.fillStyle = '#4fe3c0';
  g.beginPath(); g.moveTo(w - 4, 0); g.lineTo(w - 14, 3); g.lineTo(w - 4, 6); g.fill();
  return c;
}

export function makeTunnelPortal() {
  const w = 120, h = 64;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  const cx = (w / 2) * SS;
  // rocky face
  g.fillStyle = '#564c62';
  g.beginPath();
  g.moveTo(0, h * SS);
  g.quadraticCurveTo(0, 6 * SS, cx, 2 * SS);
  g.quadraticCurveTo(w * SS, 6 * SS, w * SS, h * SS);
  g.closePath();
  g.fill();
  let seed = 777;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rnd() < 0.5 ? '#4a4254' : '#675c74';
    g.fillRect((rnd() * w) * SS, (4 + rnd() * (h - 8)) * SS, 3 * SS, 3 * SS);
  }
  // stone arch ring
  g.strokeStyle = '#8a8296';
  g.lineWidth = 5 * SS;
  g.beginPath();
  g.arc(cx, h * SS, 34 * SS, Math.PI, 0);
  g.stroke();
  // the opening
  g.fillStyle = '#0c0a14';
  g.beginPath();
  g.arc(cx, h * SS, 31 * SS, Math.PI, 0);
  g.fill();
  return downscale(big, w, h);
}

export function makeBalloons() {
  const w = 30, h = 42;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  const cols = ['#ff5c5c', '#ffd83d', '#4f9cff'];
  const pos = [[8, 8], [20, 6], [14, 14]];
  g.strokeStyle = 'rgba(240,240,240,0.8)';
  g.lineWidth = SS * 0.8;
  pos.forEach(([bx, by], i) => {
    g.beginPath();
    g.moveTo(bx * SS, (by + 6) * SS);
    g.lineTo((w / 2) * SS, (h - 6) * SS);
    g.stroke();
    g.fillStyle = cols[i];
    g.beginPath();
    g.ellipse(bx * SS, by * SS, 6 * SS, 7 * SS, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect((bx - 2) * SS, (by - 3) * SS, 2 * SS, 2 * SS);
  });
  g.fillStyle = '#7a5c3a';
  g.fillRect((w / 2 - 4) * SS, (h - 7) * SS, 8 * SS, 6 * SS);
  return downscale(big, w, h);
}

export function makeLamp() {
  const w = 12, h = 30;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  g.fillStyle = '#3c3c48';
  g.fillRect((w / 2 - 1) * SS, 6 * SS, 2 * SS, (h - 6) * SS);
  g.fillRect((w / 2 - 3) * SS, (h - 2) * SS, 6 * SS, 2 * SS);
  // warm glow
  g.fillStyle = 'rgba(255,210,122,0.35)';
  g.beginPath();
  g.arc((w / 2) * SS, 5 * SS, 5 * SS, 0, TAU);
  g.fill();
  g.fillStyle = '#ffd27a';
  g.beginPath();
  g.arc((w / 2) * SS, 5 * SS, 2.5 * SS, 0, TAU);
  g.fill();
  return downscale(big, w, h);
}

export function makeBush(rng) {
  const w = 22, h = 16;
  const big = document.createElement('canvas');
  big.width = w * SS; big.height = h * SS;
  const g = big.getContext('2d');
  for (const [bx, by, r] of [[7, 10, 6], [14, 9, 6.5], [11, 6, 5]]) {
    g.fillStyle = ['#27843f', '#1d6e35', '#33994a'][(rng() * 3) | 0];
    g.beginPath();
    g.arc(bx * SS, by * SS, r * SS, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ['#ff8ab0', '#ffd83d', '#f0f0f0'][(rng() * 3) | 0];
    g.fillRect((4 + rng() * 14) * SS, (4 + rng() * 8) * SS, 1.5 * SS, 1.5 * SS);
  }
  return downscale(big, w, h);
}

export function makeBoltIcon() {
  const s = 12;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd83d';
  g.beginPath();
  g.moveTo(8, 0); g.lineTo(3, 7); g.lineTo(6, 7);
  g.lineTo(4, 12); g.lineTo(10, 5); g.lineTo(7, 5);
  g.closePath();
  g.fill();
  return c;
}

export function buildSprites(racers, rng) {
  const karts = {};
  for (const r of racers) karts[r.id] = makeKartSheet(r.colors);
  return {
    karts,
    itemBox: makeItemBox(),
    trees: [makeTree(rng), makeTree(rng), makeTree(rng)],
    signL: makeSign(-1),
    signR: makeSign(1),
    houses: [makeHouse(0), makeHouse(1), makeHouse(2)],
    grandstand: makeGrandstand(),
    banner: makeBanner(),
    portal: makeTunnelPortal(),
    balloons: makeBalloons(),
    lamp: makeLamp(),
    bushes: [makeBush(rng), makeBush(rng)],
    bolt: makeBoltIcon(),
  };
}
