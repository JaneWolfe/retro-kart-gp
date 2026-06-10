# HANDOFF — Retro Kart GP (2026-06-10, Day 1 complete + Day 2 track rules)

## State: playable vertical slice, verified in-browser

Full game loop works end to end with zero console errors at 60 FPS:
BIOS-style boot screen → title → menu/options/credits → racer select
(4 original racers) → 3-lap race on "Sunset Loop" vs 3 AI → results with
times/best lap → menu. The Day-1 spec is fully met: boot screen, PRESS
ENTER title, menu, pixel-perfect 426x240/320x240 scaling, input manager,
scene manager, drivable kart, HUD with speed + FPS, audio unlock on
keypress or click, and localStorage settings (display mode, music volume,
SFX volume, CRT scanlines).

Day 2 track rules are also in: red/white barriers ring the circuit ~50 units
off the road edge (SURF.WALL in the surface map's green channel), with
reflect-and-scrape bounce physics (restitution 0.45, 20% speed loss, never
tunnels — verified by driving into a wall at 230 u/s). The HUD has a
checkpoint-validity lamp (CP --/OK), the debug overlay reports surface name,
checkpoint state and wall-hit count, and the main menu gained a CONTROLS
page listing every binding.
Verified headlessly (screenshots + state inspection); the **drift feel has
not been hand-tested** — only AI/straight-line driving was verified live.

No assets are downloaded yet; everything on screen/speaker is procedural
(that path is fully exercised). `assets/README.md` documents drop-in paths.

## Architecture (all vanilla ES modules, no build)

- `src/main.js` — game object, prefs (localStorage), fixed-timestep loop
  (60 Hz update, max 5 catch-up steps), scene manager, global keys (M/F/`),
  toasts. `window.rk` exposes the game object in the console.
- `src/engine/` — `display.js` (426x240 wide / 320x240 CRT, integer
  device-pixel scaling, scanline overlay, fullscreen), `input.js` (action
  map, justPressed/isDown), `audio.js` (WebAudio: procedural chiptune
  sequencer w/ chord-arp songs, synth SFX, engine voice; decodes and prefers
  /assets music when present), `assets.js` (MANIFEST + graceful 404s),
  `font.js` (3x5 bitmap font, glyph cache), `math.js`.
- `src/game/` — `track.js` (Catmull-Rom centerline → 2048² ground texture,
  1024² surface-type map GRASS/ROAD/CURB/BOOST, 720 uniform samples for
  AI/progress, item boxes, boost pads, decor, minimap, start grid),
  `mode7.js` (per-scanline affine floor renderer into ImageData + sprite
  projection + sky panorama), `kart.js` (velocity-vector physics, grip
  blending, hop→drift→mini-turbo, boost, lap validation, collisions),
  `ai.js` (lookahead chase + corner braking + stuck recovery), `race.js`
  (scene: countdown/race/finish, camera, particles, items, pause, debug),
  `hud.js`, `scenes.js` (boot/title/menu/options/credits/select/results over
  an orbiting mode-7 backdrop), `sprites.js` (procedural baking: 16-angle
  pseudo-3D kart sheets, item box, trees, signs), `data.js` (racers, laps).

## Tuning constants worth knowing

- `kart.js`: BASE_MAX_SPEED 230, ACCEL 300, TURN_RATE 2.3, drift charge
  thresholds 1.1s/2.3s → 0.5s/0.95s mini-turbo, boost ×1.32, grass ×0.45.
- `ai.js`: cornerLimit `(90 + 200·e^(−2.6·turn)) · skill`; rubber-band in
  `race.js` clamps AI speedScale to ±10% based on sample gap to player.
- `mode7.js`: 60° hFOV, horizon at 40% height; cameras NEAR/FAR/HIGH.
- Lap counting: crossing sample window 0±40 with `passedHalf` checkpoint
  (sample 360±60) required — blocks cross-country lap exploits.

## Known bugs / honest limitations

1. **Drift handling untested by a human.** Physics verified numerically only.
   The outward-fling force (36 u/s²) and drift turn rates may need tuning.
2. Trees and arrow signs have **no collision** — karts drive through them.
   (Barriers DO collide as of Day 2; trees sit outside the barriers anyway.)
   Barrier self-intersection at tight corners initially dropped wall
   fragments onto the racing line (felt like invisible bounces at the
   chicane) — fixed by culling barrier points that fall closer than
   WALL_OFF to any centerline sample, which leaves intentional runoff gaps
   at sharp corner insides. Verified: zero wall cells within ±95 of the
   centerline, zero wall hits over a full autopilot race.
3. Item roulette always resolves to Turbo (single item type, by design today,
   but the flashing roulette implies variety that isn't there).
4. AI never drifts and has no engine audio (player only).
5. Far ground rows shimmer (no mip-mapping on the mode-7 sampler); partially
   hidden by the horizon fog gradient.
6. Standings for karts that haven't finished use a crude pace extrapolation —
   their displayed times can be a few seconds off plausible.
7. Esc both pauses and exits fullscreen (browser behavior); P is the
   reliable pause inside fullscreen.
8. `python http.server` sends no cache headers; Chrome served stale modules
   during development. **Hard-reload (Cmd+Shift+R) after editing files.**
9. Kart sprites sit ~1px above their shadow at some angles (baking margin).
10. Background-tab music scheduling relies on a throttled setInterval; brief
    stutter possible when returning (race auto-pauses, menus don't).
11. The countdown's red/green light panel is plain; intro camera pan would
    help the start feel less abrupt.

## Suggested Day 2 priorities

1. Hand-tune drift feel + mini-turbo strength (the core fun).
2. Item variety: at least one offensive (puck/shell-alike, original styling)
   and one hazard (oil slick); make the roulette honest.
3. Download + wire the CC0 assets (music first — biggest mood upgrade;
   `audio.js` already prefers decoded asset buffers).
4. Collision circles for trees/signs (data already in `track.decor`).
5. A second track (track.js already takes any control-point list) and a
   simple 2-track GP points mode.
6. AI drift usage + per-kart engine audio with distance attenuation.
7. Title-screen attract mode (autopilot ghost race — autopilot already works).

## Dev environment notes

- Run: `python3 -m http.server 8000` from the repo root.
- `.claude/launch.json` exists for the IDE preview panel, but the sandboxed
  preview server cannot read this Documents folder (macOS TCC) — the
  workaround used today: run the real server in a terminal, keep the preview
  on port 8001, and navigate its browser to `http://127.0.0.1:8000`.
- A `python3 -m http.server 8000` instance may still be running from today's
  session (started in the background).
