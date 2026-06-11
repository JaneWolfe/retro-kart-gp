# ROADMAP — Retro Kart GP

Constraints that shape everything: vanilla JS + Canvas 2D, no build step,
static hosting (`python3 -m http.server`), all assets CC0/procedural,
no Nintendo IP. The mode-7 look is the identity — we deepen it, we don't
replace it with WebGL.

## Phase A — Complete the game shell (parked Day-3 work)

Menus and modes; everything later hangs off this.
- Mode select: Grand Prix / Time Trial (TT = solo, no items, lap focus).
- Track select with locked placeholder slots.
- Options: difficulty (AI skill + rubber-band), lap count (1/3/5),
  reduced motion (calmer camera, fewer particles, no blinking).
- Gamepad support (Gamepad API), maps alongside keyboard.
- Deploy to GitHub Pages (static — zero code changes; instant shareability).

## Phase B — Items v2 + smarter AI

Make the roulette honest and racing spicy.
- Items: turbo (kept), projectile puck (bounces off barriers), oil slick
  (spin-out hazard), bubble shield (blocks one hit). Original styling only.
- AI: uses items with intent, drifts on long corners, occasionally takes
  shortcuts at higher difficulty.
- Spin-out state for karts (hit by puck / oil): spin animation + recovery.

## Phase C — Time Trial ghosts + split-screen 2P (the realistic multiplayer)

- Ghost recording: position/heading stream @ 30 Hz, delta-compressed to
  localStorage; ghost renders as a translucent kart. Best-lap ghost per track.
- Ghost sharing: serialize to a compact string for copy-paste racing.
- Local split-screen: two stacked/side-by-side viewports (total mode-7 pixel
  cost is unchanged when split), P2 on WASD + Shift/Q items, dual HUD,
  shared minimap, 2-human results. CRT mode = vertical split.

## Phase D — "True 3D feel" pass (still Canvas 2D)

- Pass-under depth split: sprites split into under/over layers vs kart
  depth, so the start banner and tunnel portals become real gates you drive
  under (kills the billboard clip-through).
- Sprite stacking for buildings/portals/grandstand: ~16 baked horizontal
  slices per object parallax under camera rotation and read as 3D.
- Tunnel v2: per-column wall/ceiling rendering while inside (the tunnel path
  is known, so this is cheap raycast math), replacing the overlay; light
  falloff + lamp glow + simple reverb on the engine voice.
- Stretch: banked-corner visual shear on the mode-7 rows.

## Phase E — More world: tracks, GP, world map

- Track 2 "NEON HARBOR" (night city: neon palette, dark sky panorama,
  headlights) and Track 3 "POWDER PASS" (snow: low-grip ice patches).
  The track builder already takes arbitrary control points + feature anchors.
- Grand Prix flow: 3-track cup, points table between races, podium scene.
- World map screen: stylized island with circuit markers, cup progress —
  the "immersive, professional" front door of the game.
- Ambient life everywhere: chimney smoke, flags, birds, water animation,
  weather overlay (rain/snow), day variants.

## Phase F — Audio & theater polish

- Drop in the CC0 asset-plan music (audio.js already prefers decoded files);
  per-track themes.
- AI kart engine sounds with distance attenuation + simple doppler.
- Race intro camera flyby, landing squash, position-change stingers,
  results podium with fanfare.

## Explicitly NOT planned (and why)

- Online real-time multiplayer: needs a server + prediction/rollback;
  incompatible with static hosting and weeks of netcode for a niche payoff.
  Ghost-string sharing (Phase C) covers the social itch serverlessly.
- WebGL/three.js rewrite: would erase the mode-7 identity and the
  no-build-step constraint. The Phase D tricks buy the 3D feel instead.
- Track editor: fun, but content (Phase E) beats tooling at this scale.

## Suggested order & rough effort

A (1 day) → B (1 day) → C (1-2 days) → D (1-2 days) → E (2 days) → F (1 day).
Each phase ships playable, verified, and committed like the previous days.
