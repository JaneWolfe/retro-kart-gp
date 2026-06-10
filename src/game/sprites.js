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
    bolt: makeBoltIcon(),
  };
}
