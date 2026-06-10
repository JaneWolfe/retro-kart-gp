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

class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
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

  isDown(action) { return this.down.has(action); }
  justPressed(action) { return this.pressed.has(action); }

  endFrame() {
    this.pressed.clear();
    this.anyPressed = false;
  }
}

export const input = new Input();
