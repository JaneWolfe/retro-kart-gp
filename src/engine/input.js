// Keyboard input mapped to game actions.
// up/down/left/right drive & navigate, drift=Space, item=X/RightShift,
// start=Enter, back=Esc, pause=P, recover=R, mute=M, fullscreen=F,
// camera=C, debug=Backquote.

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Space: 'drift',
  KeyX: 'item',
  ShiftRight: 'item',
  Enter: 'start',
  Escape: 'back',
  KeyP: 'pause',
  KeyR: 'recover',
  KeyM: 'mute',
  KeyF: 'fullscreen',
  KeyC: 'camera',
  Backquote: 'debug',
};

// Gamepad mapping (standard layout):
//   left stick X / dpad -> steer + menu nav, A -> select + gas, B -> back +
//   brake, X/Y -> item, bumpers -> drift, RT/LT -> gas/brake, Start -> pause.
// 'accel'/'brake' are race-only aliases so A/B can also mean select/back
// in menus without scrolling them.
const GP_DEADZONE = 0.35;

class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.gpDown = new Set();      // actions currently held on the gamepad
    this.gamepadConnected = false;
    this.anyPressed = false;
    this.onFirstInteraction = null; // used to unlock audio
    this._interacted = false;
  }

  init() {
    window.addEventListener('keydown', (e) => {
      const action = KEYMAP[e.code];
      if (action) e.preventDefault();
      if (!this._interacted) {
        this._interacted = true;
        this.onFirstInteraction?.();
      }
      if (e.repeat) return;
      this.anyPressed = true;
      if (action) {
        this.down.add(action);
        this.pressed.add(action);
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (action) this.down.delete(action);
    });
    // Clicks also count as the unlocking gesture (for audio autoplay policy)
    window.addEventListener('pointerdown', () => {
      if (!this._interacted) {
        this._interacted = true;
        this.onFirstInteraction?.();
      }
    });
    // Avoid stuck keys when the window loses focus
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(action) { return this.down.has(action) || this.gpDown.has(action); }
  justPressed(action) { return this.pressed.has(action); }

  // Call once per update step, before scenes read input
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) { if (p && p.connected) { gp = p; break; } }
    this.gamepadConnected = !!gp;
    const next = new Set();
    if (gp) {
      const b = (i) => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] || 0;
      if (ax < -GP_DEADZONE || b(14)) next.add('left');
      if (ax > GP_DEADZONE || b(15)) next.add('right');
      if (b(12)) next.add('up');
      if (b(13)) next.add('down');
      if (b(0)) { next.add('start'); next.add('accel'); }
      if (b(1)) next.add('brake'); // brake only — 'back' would pause mid-race
      if (b(2) || b(3)) next.add('item');
      if (b(4) || b(5)) next.add('drift');
      if (b(6)) next.add('brake');
      if (b(7)) next.add('accel');
      if (b(8)) next.add('back');  // select button backs out of menus
      if (b(9)) next.add('pause');
    }
    for (const a of next) {
      if (!this.gpDown.has(a)) this.pressed.add(a);
    }
    this.gpDown = next;
  }

  endFrame() {
    this.pressed.clear();
    this.anyPressed = false;
  }
}

export const input = new Input();
