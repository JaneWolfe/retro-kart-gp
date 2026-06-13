// Original racers — no resemblance to any existing kart franchise.
export const RACERS = [
  {
    id: 'blaze', name: 'BLAZE',
    colors: { body: '#d8383c', accent: '#ffd83d', helmet: '#f0f0f0' },
    uiColor: '#ff6a5e',
    stats: { speed: 1.0, grip: 0.92 },
  },
  {
    id: 'minty', name: 'MINTY',
    colors: { body: '#2cb59a', accent: '#ffffff', helmet: '#ffd1e8' },
    uiColor: '#4fe3c0',
    stats: { speed: 0.94, grip: 1.08 },
  },
  {
    id: 'volt', name: 'VOLT',
    colors: { body: '#e8b020', accent: '#3050d0', helmet: '#202030' },
    uiColor: '#ffd83d',
    stats: { speed: 0.97, grip: 1.0 },
  },
  {
    id: 'onyx', name: 'ONYX',
    colors: { body: '#5a3f8f', accent: '#ff5ca8', helmet: '#c0c0d0' },
    uiColor: '#b08aff',
    stats: { speed: 1.03, grip: 0.85 },
  },
];

export const DEFAULT_LAPS = 3;
export const LAP_OPTIONS = [1, 3, 5];
export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'];

// AI tuning per difficulty: base skill and rubber-band behavior
export const DIFFICULTY_TUNING = {
  EASY: { skill: 0.87, rubberGain: 0.0003, rubberMin: 0.85, rubberMax: 1.04 },
  NORMAL: { skill: 0.93, rubberGain: 0.00045, rubberMin: 0.9, rubberMax: 1.1 },
  HARD: { skill: 0.985, rubberGain: 0.0006, rubberMin: 0.97, rubberMax: 1.13 },
};

export const TRACKS = [
  { id: 'sunset', name: 'SUNSET LOOP GP', locked: false },
  { id: 'neon', name: 'NEON HARBOR', locked: true },
  { id: 'powder', name: 'POWDER PASS', locked: true },
];

export const MODES = {
  gp: { name: 'GRAND PRIX', blurb: 'RACE 3 RIVALS WITH ITEMS' },
  tt: { name: 'TIME TRIAL', blurb: 'SOLO. NO ITEMS. PURE LAPS.' },
};
