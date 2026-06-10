// Optional downloaded assets (per the asset plan). Everything in the game
// has a procedural fallback, so missing files are fine — we just report them.
//
// Asset plan sources (all CC0):
//   Kenney Racing Pack / Racing Kit  -> kart & prop sprites
//   Kenney Pixel UI Pack             -> UI panels
//   Kenney Fonts                     -> display font
//   Kenney Interface Sounds          -> menu sfx
//   OpenGameArt "Theme Song [8-bit]" -> title music
//   OpenGameArt "A Bag of Chips"     -> race music
//   CC0 Retro Music                  -> extra tracks (future)

export const MANIFEST = [
  { key: 'music_title', type: 'audio', src: 'assets/audio/music/theme_song_8bit.ogg' },
  { key: 'music_race', type: 'audio', src: 'assets/audio/music/a_bag_of_chips.ogg' },
  { key: 'sfx_move', type: 'audio', src: 'assets/audio/ui/click_001.ogg' },
  { key: 'sfx_select', type: 'audio', src: 'assets/audio/ui/confirmation_001.ogg' },
  { key: 'karts', type: 'image', src: 'assets/images/karts/karts_sheet.png' },
  { key: 'ui_panel', type: 'image', src: 'assets/images/ui/panel_pixel.png' },
];

export const assets = {
  images: new Map(),   // key -> HTMLImageElement
  audio: new Map(),    // key -> ArrayBuffer (decoded later, once AudioContext exists)
  found: 0,
  total: MANIFEST.length,

  async loadAll(onProgress) {
    let done = 0;
    await Promise.all(MANIFEST.map(async (entry) => {
      try {
        const res = await fetch(entry.src);
        if (!res.ok) throw new Error(`${res.status}`);
        if (entry.type === 'image') {
          const blob = await res.blob();
          const img = new Image();
          img.src = URL.createObjectURL(blob);
          await img.decode();
          this.images.set(entry.key, img);
        } else if (entry.type === 'audio') {
          this.audio.set(entry.key, await res.arrayBuffer());
        }
        this.found++;
      } catch {
        // Missing asset: procedural fallback will be used.
      } finally {
        done++;
        onProgress?.(done / MANIFEST.length);
      }
    }));
    return this;
  },
};
