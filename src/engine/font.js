// Tiny 3x5 procedural pixel font (no external font files needed).
// Each glyph is 15 chars: 5 rows of 3, '1' = pixel on.

const G = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011',
  D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111',
  J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101010001', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111',
  '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100110101010', '7': '111001010010010', '8': '010101010101010',
  '9': '010101011001110',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100',
  ':': '000010000010000', '!': '010010010000010', '?': '110001010000010',
  '-': '000000111000000', "'": '010010000000000', '/': '001001010100100',
  '(': '001010010010001', ')': '100010010010100', '+': '000010111010000',
  '_': '000000000000111', '>': '100010001010100', '<': '001010100010001',
  '"': '101101000000000', '=': '000111000111000', '%': '101001010100101',
};

const cache = new Map(); // `${char}|${color}` -> 3x5 canvas

function glyphCanvas(ch, color) {
  const key = ch + '|' + color;
  let c = cache.get(key);
  if (c) return c;
  const data = G[ch] || G['?'];
  c = document.createElement('canvas');
  c.width = 3; c.height = 5;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let i = 0; i < 15; i++) {
    if (data[i] === '1') g.fillRect(i % 3, (i / 3) | 0, 1, 1);
  }
  cache.set(key, c);
  return c;
}

export function textWidth(str, scale = 1) {
  return str.length === 0 ? 0 : (str.length * 4 - 1) * scale;
}

export function drawText(ctx, str, x, y, opts = {}) {
  const { scale = 1, color = '#ffffff', align = 'left', shadow = null, outline = null } = opts;
  str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  let px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
  const py = Math.round(y);
  if (outline) {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) {
      drawRun(ctx, str, px + ox * scale, py + oy * scale, scale, outline);
    }
  } else if (shadow) {
    drawRun(ctx, str, px + scale, py + scale, scale, shadow);
  }
  drawRun(ctx, str, px, py, scale, color);
  return w;
}

function drawRun(ctx, str, px, py, scale, color) {
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch !== ' ') {
      ctx.drawImage(glyphCanvas(ch, color), px, py, 3 * scale, 5 * scale);
    }
    px += 4 * scale;
  }
}
