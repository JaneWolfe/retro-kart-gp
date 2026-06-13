# HANDOFF — Retro Kart GP (2026-06-13: Phase A game shell complete)

## NEW: Phase A (roadmap) — modes, options, gamepad, deployed

- Live at <https://janewolfe.github.io/retro-kart-gp/> (repo is now PUBLIC —
  required for Pages on the free plan; relative asset paths already worked
  under the /retro-kart-gp/ subpath).
- Flow: Menu → Mode select (GRAND PRIX / TIME TRIAL) → Kart select →
  Track select (Sunset Loop GP + two locked placeholder cards that buzz) →
  Race. Time Trial = solo, no item boxes, LAST/BEST lap HUD top-left,
  per-lap results screen (R retries with the same mode).
- New persisted options: DIFFICULTY (EASY/NORMAL/HARD →
  `DIFFICULTY_TUNING` in data.js: AI skill + rubber-band strength/clamps),
  LAPS (1/3/5 → `race.totalLaps`, `TOTAL_LAPS` constant removed),
  REDUCED MOTION (fewer particles, tighter camera damp, no blinking text).
- Gamepad (input.js `pollGamepad`, standard mapping): stick/dpad steer+nav,
  A = select+gas ('accel' alias so menus don't scroll), B = brake only
  (deliberately NOT 'back' — it would pause mid-race), X/Y item, bumpers
  drift, LT brake, RT gas, Select = back, Start = pause. Verified by
  stubbing navigator.getGamepads. NOT yet tested with a physical pad.

---

# Previous handoff (2026-06-11: Sunset Loop GP world update)

## NEW: Sunset Loop GP (full kart-game level)

The world grew to 4096x4096 (`WORLD` in track.js; mode7.js derives its
sampling mask from the texture size). One lap ≈ 12,800 units ≈ 55s
(AI best laps 57–60s, races ~2.6 min). Layout in driving order: village
boulevard (start banner, grandstand, solid houses, lamps) → forest S-curves →
top-right corner → tunnel through a painted hill (portal billboards, interior
lamps, full-screen ceiling/dim overlay via `RaceScene.renderTunnelOverlay`,
tube walls at road-edge ±68) → hairpin → ramp straight (JUMP strip launches
airborne arc over a DIRT gap) → U-bend → lakeside → finish. Two dirt
shortcuts: A cuts the U-bend, B is a jump-entry alley between houses cutting
the final corner. The mid-track checkpoint (`passedHalf`) sits inside the
tunnel, so laps can't be cheated around it.

New systems: surfaces DIRT (cap ×0.8) and JUMP (blue channel of the surface
map; walls stay in green); airborne kart state (`z`/`vz`, gravity 520,
heading locked, no surface caps in air); `nearestSampleIdx` widens its search
window ±24→±90 on dirt/air so shortcuts can't break progress tracking;
`resolveSolidCollisions` makes houses/trees/posts solid (fixes old known bug
2); `buildWallSegments` takes shortcut openings + skip-ranges (no barriers
through the village — houses line the street there). All verified headless:
probes for surface classification, corridor wall scan, jump arc (peak ~56,
clears the gap), shortcut progress trace, house ram, 60 FPS held.

---

# Previous handoff (2026-06-10, Day 1 complete + Day 2 track rules)

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

1. **Drift handling and the new level are untested by a human.** Physics and
   layout verified numerically/visually headless; jump feel, shortcut
   worthiness, and tunnel pacing need a real driver.
2. ~~Trees have no collision~~ — fixed by `resolveSolidCollisions` (houses,
   trees, lamps, banner/portal posts are all solid). Signs remain
   non-solid decorations. Banner/portal arches are camera-facing billboards:
   they skew when passed at an angle (accepted retro illusion). House
   sprites' visual edges may kiss the curb at max size; their collision
   circles stay off the lane (verified ≥63 units from centerline vs 60 lane
   half-width).
3. Shortcut B's alley is tight by design; AI never takes shortcuts (classic
   behavior, also keeps them honest).
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
