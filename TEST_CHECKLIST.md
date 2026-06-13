# TEST_CHECKLIST — Retro Kart GP (Day 1)

Run `python3 -m http.server 8000`, open <http://localhost:8000>.

## Automated checks already done this session (headless browser)
- [x] Game boots with zero console errors/warnings
- [x] Retro BIOS boot screen renders (asset report lines), skippable with Enter
- [x] Boot → Title → Menu → Select → Race → Results → Menu full loop
- [x] Race HUD shows always-on speedometer (KMH) and FPS readout
- [x] Music/SFX volume settings (0–100% in 10% steps) apply live and persist
- [x] Audio unlocks from a mouse click as well as a keypress
- [x] Barriers ring the circuit; driving into one bounces the kart back with
      speed loss, registers a WALL HIT, and never tunnels through
- [x] HUD shows checkpoint validity lamp (CP -- / CP OK) under the lap counter
- [x] Debug overlay shows surface name, checkpoint state, and wall-hit count
- [x] CONTROLS page in the main menu lists every binding
- [x] Sunset Loop GP world (4096 map): village + banner + grandstand, forest,
      tunnel (overlay + portals + tube walls verified), hairpin, ramp jump
      (launch -> clears dirt gap -> lands on road), lake, 60 FPS held
- [x] Both shortcuts surface-classified DIRT end-to-end; driving one slides
      sampleIdx smoothly with no lap glitches, checkpoint flag intact
- [x] Solid decor collision: full-speed ram into a house stops at the
      collision ring, never clips inside
- [x] AI completes laps on the new layout (best laps ~57-60s)
- [x] Mode select -> kart -> track select flow; locked tracks buzz + shake
- [x] Time Trial: solo kart, no item boxes, LAST/BEST HUD, per-lap results
- [x] Difficulty/laps/reduced-motion options change live and persist
- [x] Gamepad mapping verified end-to-end via stubbed Gamepad API
- [x] Deployed to GitHub Pages, repo public

## Manual checks for Phase A
- [ ] Play with a REAL gamepad (only a stubbed pad was tested): steering
      deadzone feel, A/B/X/bumpers/triggers, Start pauses, Select backs out
- [ ] EASY feels beatable, HARD feels pushy (rubber-band tuning)
- [ ] 1-lap and 5-lap races start/finish correctly
- [ ] Reduced motion: no blinking anywhere, calmer camera, sparse particles
- [ ] https://janewolfe.github.io/retro-kart-gp/ plays identically to local
- [x] 60 FPS sustained in race (426x240, debug overlay confirms)
- [x] Speed cap holds: 230 u/s flat, ~303 only during boost pads
- [x] AI completes 3 laps (~57s) and the race auto-finishes to results
- [x] Lap counter requires passing mid-track (no off-road lap exploit)
- [x] CRT 320x240 + scanlines toggle, prefs persist in localStorage
- [x] Pause menu (resume / restart / quit), camera cycle, mute toggle
- [x] AudioContext running, procedural music sequencer active, 0 assets → all fallbacks

## Manual checks needed (need human eyes/ears/hands)

### Boot & title
- [ ] BIOS-style boot screen plays (~3s), Enter skips it after a beat
- [ ] Title shows orbiting track backdrop after boot
- [ ] Title music (procedural chiptune) starts after first key press OR click
- [ ] A kart scrolls across the bottom of the title screen

### Menus
- [ ] Arrow keys + Enter navigate; menu blip/select sounds play
- [ ] Esc backs out of every submenu
- [ ] Controls page is readable in both display modes
- [ ] Options: display mode switches instantly, scanlines visible in CRT mode
- [ ] Music/SFX volume steps (left/right) audibly raise/lower levels independently
- [ ] Credits screen lists asset plan, Esc returns

### Race — feel (most important manual pass)
- [ ] Countdown: 3 beeps + GO, karts can't move before GO
- [ ] Engine pitch rises with speed; idle hum at standstill
- [ ] Steering feels responsive at speed; kart leans into turns visually
- [ ] **Drift: hold Space + steer → hop, then slide; sparks turn cyan (~1.1s)
      then orange (~2.3s); release Space → mini-turbo burst** (tuning feedback wanted)
- [ ] Driving onto grass slows you down hard + dust + engine wobble
- [ ] Hitting a barrier bounces you back with a thud (does it feel fair?)
- [ ] Barrier visuals look right at the tightest corners (no stripe glitches)
- [ ] CP lamp flips to OK at mid-track (inside the tunnel), back to -- at the line

### Sunset Loop GP world (new — feel pass wanted)
- [ ] Ramp jump feels good at full speed; landing short into the dirt gap
      punishes but doesn't feel broken
- [ ] Both shortcuts are findable and worth it with a clean line/boost
      (A: dirt chord across the U-bend; B: jump-entry alley before the finish)
- [ ] Tunnel: overlay fades in/out smoothly, lamps pass by, tube walls bounce
- [ ] Village houses feel solid but never block the racing line
- [ ] Banner/portal arches read OK head-on (they're billboards — known skew
      when passed at an angle)
- [ ] Minimap reads: lake blob, brown shortcut lines, darker tunnel section
- [ ] Boost pads (orange chevrons) give a burst + sound
- [ ] Item box pickup → flashing slot → turbo; X/Right Shift fires it
- [ ] R recovers to the track centerline facing forward
- [ ] Driving backwards for >1.5s shows WRONG WAY
- [ ] Bumping AI karts pushes both apart with a thud
- [ ] C cycles NEAR/FAR/HIGH cameras mid-race
- [ ] Esc/P pauses; engine sound stops while paused; race music ducks on quit

### Race — flow
- [ ] LAP 2 / FINAL LAP messages + jingles at the line
- [ ] Position indicator (1ST–4TH) matches what you see
- [ ] Speedometer reacts to acceleration/grass/boost (turns gold while boosting)
- [ ] Minimap dots track all four karts
- [ ] FINISH! → autopilot drives your kart → results within ~3s
- [ ] Results: standings, times, best lap; Enter → menu, R → rematch

### Display / system
- [ ] F toggles fullscreen; image stays sharp and integer-scaled on a 4K monitor
- [ ] Window resize keeps the canvas crisp (no blur, no distortion)
- [ ] M mutes everywhere; MUTED toast appears; persists across reload
- [ ] Hiding the tab mid-race auto-pauses
- [ ] Backtick shows FPS/speed/surface debug overlay

### Known-bug verification (expected failures, don't file twice)
See HANDOFF.md "Known bugs" — trees/signs have no collision, item is always
turbo, AI doesn't drift, far-distance ground shimmers.
