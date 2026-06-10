// WebAudio: procedural chiptune music, synth SFX, and a kart engine voice.
// If decoded music assets exist they are used instead of the sequencer.

const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Songs are described as chord progressions; the sequencer arpeggiates them.
// chords: [rootMidi, minor?] — one chord per bar, 16 sixteenth-steps per bar.
const SONGS = {
  title: {
    bpm: 104,
    chords: [[48, 0], [45, 1], [41, 0], [43, 0]], // C  Am  F  G
    lead: [0, -1, -1, 1, -1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1],
    bassSteps: [0, 4, 8, 12],
    kick: [0, 8], snare: [], hatEvery: 4,
    leadVol: 0.10, bassVol: 0.15,
  },
  race: {
    bpm: 150,
    chords: [[45, 1], [48, 0], [41, 0], [43, 0]], // Am  C  F  G
    lead: [0, 0, 1, 2, 3, -1, 2, 1, 0, -1, 3, 2, 1, 2, 3, -1],
    bassSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    kick: [0, 8], snare: [4, 12], hatEvery: 2,
    leadVol: 0.085, bassVol: 0.13,
  },
};

class AudioSys {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.musicOn = true;
    this.sfxOn = true;
    this.assetBuffers = new Map(); // key -> ArrayBuffer
    this.decoded = new Map();      // key -> AudioBuffer
    this.seq = null;
    this.musicSource = null;
    this.currentSong = null;
    this.engine = null;
  }

  attachAssets(audioMap) { this.assetBuffers = audioMap; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.55 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.7 : 0;
      this.sfxGain.connect(this.master);
      // Shared 1s white-noise buffer for percussion / drift hiss
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Decode any downloaded music in the background
      for (const [key, buf] of this.assetBuffers) {
        this.ctx.decodeAudioData(buf.slice(0)).then((ab) => {
          this.decoded.set(key, ab);
        }).catch(() => {});
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  setMusicOn(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.02);
  }
  setSfxOn(on) {
    this.sfxOn = on;
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.02);
  }

  duckMusic(d) {
    if (this.musicGain && this.musicOn) {
      this.musicGain.gain.setTargetAtTime(d ? 0.18 : 0.55, this.ctx.currentTime, 0.1);
    }
  }

  // ---- generic voices ----------------------------------------------------

  _tone({ f0, f1 = null, dur = 0.08, type = 'square', vol = 0.4, when = 0, dest = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.1, vol = 0.3, type = 'bandpass', freq = 2000, q = 1, when = 0, dest = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- named SFX ---------------------------------------------------------

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'move': this._tone({ f0: 660, f1: 880, dur: 0.05, vol: 0.25 }); break;
      case 'select': this._tone({ f0: 660, dur: 0.06, vol: 0.3 }); this._tone({ f0: 990, dur: 0.1, vol: 0.3, when: 0.06 }); break;
      case 'back': this._tone({ f0: 440, f1: 220, dur: 0.1, vol: 0.25 }); break;
      case 'count': this._tone({ f0: 440, dur: 0.12, vol: 0.45 }); break;
      case 'go': this._tone({ f0: 880, dur: 0.35, vol: 0.5 }); break;
      case 'hop': this._tone({ f0: 300, f1: 520, dur: 0.08, type: 'triangle', vol: 0.3 }); break;
      case 'boost': this._tone({ f0: 180, f1: 900, dur: 0.35, type: 'sawtooth', vol: 0.35 }); break;
      case 'spark': this._tone({ f0: 1200, f1: 1800, dur: 0.06, vol: 0.2 }); break;
      case 'item_tick': this._tone({ f0: 1046, dur: 0.03, vol: 0.18 }); break;
      case 'item_get': this._tone({ f0: 784, dur: 0.07, vol: 0.3 }); this._tone({ f0: 1175, dur: 0.12, vol: 0.3, when: 0.07 }); break;
      case 'lap': [523, 659, 784, 1046].forEach((f, i) => this._tone({ f0: f, dur: 0.1, vol: 0.3, when: i * 0.08 })); break;
      case 'final_lap': [784, 784, 1046].forEach((f, i) => this._tone({ f0: f, dur: 0.12, vol: 0.35, when: i * 0.12 })); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this._tone({ f0: f, dur: 0.16, vol: 0.35, when: i * 0.13 })); break;
      case 'thud': this._noise({ dur: 0.12, vol: 0.4, type: 'lowpass', freq: 300 }); this._tone({ f0: 120, f1: 60, dur: 0.1, type: 'triangle', vol: 0.4 }); break;
      case 'wrong': this._tone({ f0: 330, f1: 160, dur: 0.25, type: 'sawtooth', vol: 0.25 }); break;
    }
  }

  // ---- music -------------------------------------------------------------

  playMusic(name) {
    if (!this.ctx) { this.currentSong = name; return; }
    if (this.currentSong === name && (this.seq || this.musicSource)) return;
    this.stopMusic();
    this.currentSong = name;
    const assetKey = name === 'title' ? 'music_title' : 'music_race';
    const buf = this.decoded.get(assetKey);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.musicSource = src;
      return;
    }
    this._startSeq(SONGS[name]);
  }

  stopMusic() {
    if (this.musicSource) { try { this.musicSource.stop(); } catch {} this.musicSource = null; }
    if (this.seq) { clearInterval(this.seq.timer); this.seq = null; }
    this.currentSong = null;
  }

  _startSeq(song) {
    const stepDur = 60 / song.bpm / 4;
    this.seq = {
      song, stepDur, step: 0,
      nextT: this.ctx.currentTime + 0.06,
      timer: setInterval(() => this._pump(), 40),
    };
  }

  _pump() {
    const s = this.seq;
    if (!s) return;
    while (s.nextT < this.ctx.currentTime + 0.2) {
      this._playStep(s.song, s.step, s.nextT, s.stepDur);
      s.step = (s.step + 1) % (s.song.chords.length * 16);
      s.nextT += s.stepDur;
    }
  }

  _playStep(song, step, t, stepDur) {
    const bar = (step / 16) | 0;
    const sub = step % 16;
    const [root, minor] = song.chords[bar % song.chords.length];
    const tones = [root + 12, root + 12 + (minor ? 3 : 4), root + 19, root + 24];
    const when = t - this.ctx.currentTime;
    // lead arpeggio (square)
    const li = song.lead[sub];
    if (li >= 0) {
      this._tone({
        f0: midiFreq(tones[li]), dur: stepDur * 0.9, type: 'square',
        vol: song.leadVol, when, dest: this.musicGain,
      });
    }
    // bass (triangle)
    if (song.bassSteps.includes(sub)) {
      const note = sub === 14 ? root + 7 : root;
      this._tone({
        f0: midiFreq(note), dur: stepDur * 1.6, type: 'triangle',
        vol: song.bassVol, when, dest: this.musicGain,
      });
    }
    // drums
    if (song.kick.includes(sub)) {
      this._tone({ f0: 120, f1: 40, dur: 0.1, type: 'sine', vol: 0.4, when, dest: this.musicGain });
    }
    if (song.snare.includes(sub)) {
      this._noise({ dur: 0.09, vol: 0.18, freq: 1800, when, dest: this.musicGain });
    }
    if (sub % song.hatEvery === 0) {
      this._noise({ dur: 0.03, vol: 0.06, type: 'highpass', freq: 6000, when, dest: this.musicGain });
    }
  }

  // ---- engine voice -------------------------------------------------------

  engineStart() {
    if (!this.ctx || this.engine) return;
    const e = {};
    e.osc = this.ctx.createOscillator();
    e.osc.type = 'sawtooth';
    e.osc.frequency.value = 55;
    e.osc2 = this.ctx.createOscillator();
    e.osc2.type = 'square';
    e.osc2.frequency.value = 57;
    e.filter = this.ctx.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.frequency.value = 500;
    e.gain = this.ctx.createGain();
    e.gain.gain.value = 0;
    e.osc.connect(e.filter);
    e.osc2.connect(e.filter);
    e.filter.connect(e.gain).connect(this.sfxGain);
    // drift / off-road hiss
    e.noise = this.ctx.createBufferSource();
    e.noise.buffer = this.noiseBuf;
    e.noise.loop = true;
    e.noiseFilter = this.ctx.createBiquadFilter();
    e.noiseFilter.type = 'bandpass';
    e.noiseFilter.frequency.value = 2600;
    e.noiseGain = this.ctx.createGain();
    e.noiseGain.gain.value = 0;
    e.noise.connect(e.noiseFilter).connect(e.noiseGain).connect(this.sfxGain);
    e.osc.start(); e.osc2.start(); e.noise.start();
    this.engine = e;
  }

  engineUpdate(speed01, { drift = false, boost = false, offroad = false } = {}) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    let f = 52 + 190 * speed01 + (boost ? 55 : 0);
    if (offroad) f += Math.sin(t * 40) * 12;
    e.osc.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 1.01 + 2, t, 0.05);
    e.filter.frequency.setTargetAtTime(350 + 1400 * speed01 + (boost ? 800 : 0), t, 0.08);
    e.gain.gain.setTargetAtTime(0.04 + 0.05 * speed01, t, 0.08);
    const hiss = (drift ? 0.10 : 0) + (offroad ? 0.06 * speed01 : 0);
    e.noiseGain.gain.setTargetAtTime(hiss, t, 0.06);
    e.noiseFilter.frequency.setTargetAtTime(offroad && !drift ? 900 : 2600, t, 0.05);
  }

  engineStop() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.noiseGain.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      try { e.osc.stop(); e.osc2.stop(); e.noise.stop(); } catch {}
    }, 300);
    this.engine = null;
  }
}

export const audio = new AudioSys();
