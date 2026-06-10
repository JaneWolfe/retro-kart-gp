# Asset drop-in guide

Everything is optional — the game generates procedural fallbacks for any
missing file. Paths checked at boot (see `src/engine/assets.js` MANIFEST):

| Path | Source (all CC0) |
| --- | --- |
| `audio/music/theme_song_8bit.ogg` | OpenGameArt "Theme Song [8-bit]" (title music) |
| `audio/music/a_bag_of_chips.ogg` | OpenGameArt "A Bag of Chips" (race music) |
| `audio/ui/click_001.ogg` | Kenney Interface Sounds (menu move) |
| `audio/ui/confirmation_001.ogg` | Kenney Interface Sounds (menu select) |
| `images/karts/karts_sheet.png` | Kenney Racing Pack (not wired up yet — see HANDOFF) |
| `images/ui/panel_pixel.png` | Kenney Pixel UI Pack (not wired up yet) |

Planned but not yet referenced: Kenney Racing Kit (props), Kenney Fonts,
CC0 Retro Music (extra tracks).
