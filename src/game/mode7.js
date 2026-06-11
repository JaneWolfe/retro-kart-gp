// Mode-7 style floor renderer: per-scanline affine sampling of the 2048x2048
// ground texture into an ImageData buffer. The texture wraps, so driving off
// the map shows tiled grass.

export const CAMERA_MODES = [
  { name: 'NEAR', back: 130, height: 38 },
  { name: 'FAR', back: 165, height: 52 },
  { name: 'HIGH', back: 200, height: 110 },
];

export class Mode7 {
  constructor(textureCanvas) {
    // texture must be square with a power-of-two size (the sampler wraps
    // coordinates with a bitmask)
    const size = textureCanvas.width;
    this.texMask = size - 1;
    this.texShift = Math.log2(size);
    const g = textureCanvas.getContext('2d');
    this.tex = new Uint32Array(
      g.getImageData(0, 0, size, size).data.buffer
    );
    this.w = 0;
  }

  setViewport(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    this.horizonY = Math.round(h * 0.4);
    this.floorH = h - this.horizonY;
    this.img = new ImageData(w, this.floorH);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.focal = (w / 2) / Math.tan((60 * Math.PI / 180) / 2);
    // distance fog, rebuilt per size
    this._fog = null;
  }

  // cam: {x, y, angle, height}
  render(ctx, cam) {
    const { w, floorH, focal, buf, tex, texMask, texShift } = this;
    const cosA = Math.cos(cam.angle), sinA = Math.sin(cam.angle);
    const halfW = w / 2;
    let o = 0;
    for (let sy = 0; sy < floorH; sy++) {
      const d = (cam.height * focal) / (sy + 1);
      const step = d / focal;
      const stepX = -sinA * step;
      const stepY = cosA * step;
      let wx = cam.x + cosA * d - stepX * halfW;
      let wy = cam.y + sinA * d - stepY * halfW;
      for (let sx = 0; sx < w; sx++) {
        buf[o++] = tex[((wy & texMask) << texShift) | (wx & texMask)];
        wx += stepX;
        wy += stepY;
      }
    }
    ctx.putImageData(this.img, 0, this.horizonY);
    // distance fog: darken toward the horizon
    if (!this._fog) {
      const fog = ctx.createLinearGradient(0, this.horizonY, 0, this.horizonY + floorH * 0.45);
      fog.addColorStop(0, 'rgba(30,16,48,0.55)');
      fog.addColorStop(1, 'rgba(30,16,48,0)');
      this._fog = fog;
    }
    ctx.fillStyle = this._fog;
    ctx.fillRect(0, this.horizonY, w, floorH * 0.45);
  }

  // Project a world point to screen. Returns null when behind the camera.
  project(cam, wx, wy) {
    const cosA = Math.cos(cam.angle), sinA = Math.sin(cam.angle);
    const dx = wx - cam.x, dy = wy - cam.y;
    const depth = dx * cosA + dy * sinA;
    if (depth < 6) return null;
    const lateral = -dx * sinA + dy * cosA;
    return {
      x: this.w / 2 + (lateral * this.focal) / depth,
      y: this.horizonY + (cam.height * this.focal) / depth,
      scale: this.focal / depth,
      depth,
    };
  }
}

// Pre-rendered wrapping sky panorama (sunset gradient, sun, hills, clouds).
export function buildSkyPanorama(w, skyH, rng) {
  const panW = w * 6; // 60° hfov -> panorama is 6 screens wide
  const c = document.createElement('canvas');
  c.width = panW;
  c.height = skyH;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, skyH);
  grad.addColorStop(0, '#1a1040');
  grad.addColorStop(0.45, '#5a2a6e');
  grad.addColorStop(0.8, '#c2566e');
  grad.addColorStop(1, '#f0925a');
  g.fillStyle = grad;
  g.fillRect(0, 0, panW, skyH);
  // sun
  const sunX = panW * 0.25, sunY = skyH * 0.72;
  for (let r = 26; r >= 12; r -= 7) {
    g.fillStyle = r > 12 ? 'rgba(255,200,120,0.18)' : '#ffd27a';
    g.beginPath();
    g.arc(sunX, sunY, r, 0, Math.PI * 2);
    g.fill();
  }
  // clouds
  g.fillStyle = 'rgba(255,170,170,0.5)';
  for (let i = 0; i < 10; i++) {
    const cx = rng() * panW, cy = skyH * (0.2 + rng() * 0.4);
    const cw = 30 + rng() * 50;
    g.fillRect(cx, cy, cw, 4);
    g.fillRect(cx + 8, cy - 3, cw * 0.6, 3);
  }
  // two hill silhouettes (frequencies chosen so the panorama tiles seamlessly)
  const hills = (base, amp1, amp2, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, skyH);
    const k1 = (Math.PI * 2 * 3) / panW, k2 = (Math.PI * 2 * 7) / panW;
    for (let x = 0; x <= panW; x += 4) {
      g.lineTo(x, base - Math.sin(x * k1) * amp1 - Math.sin(x * k2 + 1.3) * amp2);
    }
    g.lineTo(panW, skyH);
    g.closePath();
    g.fill();
  };
  hills(skyH * 0.78, 11, 5, '#3a2050');
  hills(skyH * 0.9, 8, 4, '#2a1840');
  // haze line at the horizon
  g.fillStyle = 'rgba(255,180,130,0.35)';
  g.fillRect(0, skyH - 2, panW, 2);
  return c;
}

export function drawSky(ctx, panorama, angle, w) {
  const panW = panorama.width;
  const frac = angle / (Math.PI * 2);
  let off = Math.round(((frac * panW) % panW + panW) % panW);
  ctx.drawImage(panorama, off, 0, Math.min(panW - off, w), panorama.height, 0, 0, Math.min(panW - off, w), panorama.height);
  if (panW - off < w) {
    const rem = w - (panW - off);
    ctx.drawImage(panorama, 0, 0, rem, panorama.height, panW - off, 0, rem, panorama.height);
  }
}
