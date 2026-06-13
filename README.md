# Retro Kart GP

An original SNES/N64-inspired kart racer for desktop browsers. Vanilla
HTML/CSS/JS with ES modules and Canvas 2D — no build step, no dependencies.

**Play it now:** <https://janewolfe.github.io/retro-kart-gp/>

## Modes

- **Grand Prix** — race 3 AI rivals with items and boost pads.
- **Time Trial** — solo, no items, pure lap times.

Options cover display mode, CRT scanlines, music/SFX volume, difficulty
(easy/normal/hard), lap count (1/3/5), and reduced motion. A standard
gamepad works out of the box (stick/dpad steer, A gas/select, B brake,
X item, bumpers drift, Start pause).

## Run locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. (A local server is required because the game
uses ES modules; opening `index.html` directly will not work.)

## Controls

| Key | Action |
| --- | --- |
| Arrows | Drive / navigate menus |
| Space | Hop + drift (hold while steering; release for mini-turbo) |
| X / Right Shift | Use item |
| Enter | Select / start |
| Esc / P | Pause / back |
| R | Recover to track (rematch on results screen) |
| M | Mute |
| F | Fullscreen |
| C | Camera (near / far / high) |
| ` | Debug overlay |

## Display

Two internal resolutions, selectable in Options: 426x240 retro widescreen
(default) and 320x240 CRT 4:3 with optional scanlines. The canvas is scaled
with integer device-pixel scaling and `image-rendering: pixelated`, so it
stays sharp on hi-DPI monitors.

## The track: Sunset Loop GP

One full kart-game level (~55s laps, 3-lap races): a village boulevard under
a SUNSET GP banner, forest S-curves, a tunnel through the hill, a hairpin, a
ramp jump over a dirt gap, a lakeside run — plus two risky dirt shortcuts
(slower surface, shorter line) and boost pads. Buildings, trees, and posts
are solid; barriers bounce you back on the rest of the lap.

## Assets

The game is fully playable with zero downloaded assets — all art and audio
have procedural fallbacks. To use the CC0 asset plan, drop files into
`/assets` (see `assets/README.md` for the expected paths).
