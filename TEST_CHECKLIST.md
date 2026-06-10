# TEST_CHECKLIST — Retro Kart GP (Day 1)

Run `python3 -m http.server 8000`, open <http://localhost:8000>.

## Automated checks already done this session (headless browser)
- [x] Game boots with zero console errors/warnings
- [x] Retro BIOS boot screen renders (asset report lines), skippable with Enter
- [x] Boot → Title → Menu → Select → Race → Results → Menu full loop
- [x] Race HUD shows always-on speedometer (KMH) and FPS readout
- [x] Music/SFX volume settings (0–100% in 10% steps) apply live and persist
- [x] Audio unlocks from a mouse click as well as a keypress
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
