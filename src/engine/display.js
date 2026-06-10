// Canvas display manager: internal retro resolutions scaled up with
// integer device-pixel scaling so the image stays sharp on hi-DPI monitors.

export const MODES = {
  wide: { w: 426, h: 240, label: 'WIDE 426X240' },
  crt: { w: 320, h: 240, label: 'CRT 320X240' },
};

export class Display {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.scanlinesEl = document.getElementById('scanlines');
    this.mode = 'wide';
    this.scanlines = false;
    window.addEventListener('resize', () => this.resize());
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  setMode(name) {
    if (!MODES[name]) name = 'wide';
    this.mode = name;
    this.canvas.width = MODES[name].w;
    this.canvas.height = MODES[name].h;
    this.resize();
  }

  setScanlines(on) {
    this.scanlines = on;
    this.scanlinesEl.hidden = !on;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;
    // Integer scale in *device* pixels keeps every texel square and sharp
    const scale = Math.max(1, Math.floor(Math.min(availW / this.W, availH / this.H)));
    const cssW = (this.W * scale) / dpr;
    const cssH = (this.H * scale) / dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    if (this.scanlinesEl) {
      const s = this.scanlinesEl.style;
      s.width = `${cssW}px`;
      s.height = `${cssH}px`;
    }
    // Changing canvas size resets context state
    this.ctx.imageSmoothingEnabled = false;
  }

  toggleFullscreen() {
    const el = document.getElementById('game-container');
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }
}
