# Free art & audio assets for the stickman archery game

Researched 2026-09-29. Target: 2D stickman archery (Byril "Stickman Archer"
style) rendered with React Native Skia.

## Status (2026-09-30)

**Audio is integrated.** All of it is CC0 and committed under `assets/audio/`
(about 1.6 MB, mono MP3). Credits: `assets/audio/CREDITS.md`. Playback lives
in `src/audio/sound.ts`: pooled sound effects plus one looping music track per
screen that crossfades on navigation (menu, battle, shop), ducks under
win/lose jingles, pauses in the background, and honours Settings → Audio.

**Graphics are procedural** (Skia, no image files): painted dusk sky, sun glow,
drifting clouds, two mountain ranges, tree line, grass, stone pillars, contact
shadows, arrows with heads and fletching, motion trail, blood/spark/dust
particles, screen shake, hit flashes, animated bow draw. See
`src/game/scenery.tsx` and `src/game/GameCanvas.tsx`. This keeps the APK small
and lets every piece animate; image assets below are optional upgrades.

## How to use Unity Asset Store packs

Unity Asset Store downloads require a signed-in Unity ID, so they can't be
fetched automatically. The flow:

1. Sign in at assetstore.unity.com and press **Add to My Assets** on each free
   pack (links in the Unity table below).
2. Install Unity Hub plus any Unity Editor version, create an empty 2D project,
   open **Window → Package Manager → My Assets**, and **Download** each pack.
   Unity caches the raw `.unitypackage` file here, so you don't need to import it:
   - macOS: `~/Library/Unity/Asset Store-5.x/<Publisher>/<Category>/<Pack>.unitypackage`
   - Windows: `%APPDATA%\Unity\Asset Store-5.x\...`
3. Extract the images and audio without Unity:
   ```bash
   scripts/extract-unitypackage.sh ~/Library/Unity/Asset\ Store-5.x/.../Pack.unitypackage
   ```
   Files land in `assets/licensed/<Pack>/`, which is gitignored.
4. Reference them with `require('../../assets/licensed/...')`. For audio, add
   the clip to the `SFX` or `MUSIC` map in `src/audio/sound.ts`. For images,
   load with Skia's `useImage` and draw with `<Image>` inside the canvas.

Keep Unity files out of the public repo (EULA). EAS cloud builds only see
committed files, so for a cloud build either switch to the CC0 equivalents or
zip the folder, upload the zip as a file-type EAS environment variable, and
unzip it in an `eas-build-pre-install` npm script. Local builds
(`npx expo run:android`) pick up the gitignored folder directly.

## Key finding: there is no free stickman pack on the Unity Asset Store

Every 2D stickman pack on the Unity Asset Store is paid ("Stickman Animation
Pack" $49.99, "Hero Stickman 2D" $4.99, "2D Stickman Action Combat Platformer
Pack"). Nobody publishes a free stickman with bow-draw / aim / shoot frames.

**Recommended path (what Byril-style games actually do):** draw the stickman
procedurally in Skia — a circle head plus line segments for torso and limbs.
This gives you free ragdoll deaths via the physics engine (each segment is a
body) and lets the bow arm rotate to the exact aim angle. Use downloaded assets
only for bow/arrow, backgrounds, UI, fonts, and audio. `src/game/stickman.ts`
already draws the stickman this way.

Fallback if you want sprite-based characters: the CC0 itch.io stickman below
(idle / damage / death frames) with a separate bow sprite rotated at the hand.

## Top picks

| Category | Pick | License | Why |
|---|---|---|---|
| Stickman (sprites) | Animated Stick Figure Character 2D Free CC0 — RGS_Dev, itch.io | CC0 | 12 animations incl. Idle / Damage / Death, 512x512 PNG sheets + .blend source. No bow anim. |
| Bow & arrow | Unity "2D Bow - IS Bow And Arrow" (ILLYRIS_STUDIO) + OpenGameArt "bow and arrow spritesheet" (johnnytal) | Unity EULA / CC0 | Medieval bow + arrow textures; the OGA sheet has bow-draw frames (play reversed for release). |
| Background | Unity "Free 2D Cartoon Parallax Background" (CPasteGame) | Unity EULA | Most-favorited free 2D environment pack (1,904 favs). Layered sky/hills. |
| UI | Kenney UI Pack 2.0 | CC0 | 430 PNGs — buttons, panels, sliders. Beats the Unity button packs. |
| SFX | Unity "FREE Casual Game SFX Pack" (Dustyroom) + Kenney Impact Sounds + Freesound "Arrow Whoosh 1" | Unity EULA / CC0 / CC0 | UI pops; arrow-hit and body-drop thuds; arrow flight. |
| Music | Unity "Free - Casual & Relaxing Game Music Pack" (SLD Audio) | Unity EULA | 80 MB of loops. |
| Font | Kenney Fonts | CC0 | Pixel/blocky game fonts, TTF. |
| Hit / blood FX | Skia particles (circles) or Kenney Particle Pack | CC0 | Nothing free on Unity; procedural is cheaper anyway. |

## Unity Asset Store (all $0, Extension Asset, Standard Unity Asset Store EULA)

| Name | Publisher | URL | Size / Unity | Updated | Rating | Contents (inferred, page body doesn't render server-side) |
|---|---|---|---|---|---|---|
| FREE 2D Archers Sprites | HONETi | https://assetstore.unity.com/packages/2d/characters/free-2d-archers-sprites-18748 | 13.3 MB / 4.3.4 | Dec 2017 | 94 ratings, 1,136 favs | Cartoon archer characters (not stickman) |
| 2D Bow - IS Bow And Arrow | ILLYRIS_STUDIO | https://assetstore.unity.com/packages/2d/textures-materials/2d-bow-is-bow-and-arrow-174003 | 3.2 MB / 2018.4+ | Jul 2020 | 161 favs | Bow + arrow textures, medieval/fantasy |
| Free 2D Cartoon Parallax Background | CPasteGame | https://assetstore.unity.com/packages/2d/environments/free-2d-cartoon-parallax-background-205812 | 2.0 MB / 2020.3 | Mar 2022 | 23 reviews, 1,904 favs | Layered cartoon sky/hills PNGs |
| Free Casual Buttons Pack | traint | https://assetstore.unity.com/packages/2d/gui/free-casual-buttons-pack-307406 | 9.9 MB / 2022.3 | Jan 2025 | 106 favs | Casual button PNGs |
| FREE Casual Game SFX Pack | Dustyroom | https://assetstore.unity.com/packages/audio/sound-fx/free-casual-game-sfx-pack-54116 | 8.6 MB / 2021.3+ | Aug 2024 | 338 reviews, 7,217 favs | UI clicks, pops, jumps, coins |
| FREE CASUAL PACK SFX | mk.matheusklein | https://assetstore.unity.com/packages/audio/sound-fx/free-casual-pack-sfx-197054 | 30 MB / 2020.3+ | Dec 2022 | 4 reviews, 131 favs | Casual/UI SFX |
| Free - Casual & Relaxing Game Music Pack | SLD Audio | https://assetstore.unity.com/packages/audio/music/free-casual-relaxing-game-music-pack-262740 | 80.4 MB / 2021.3 | Oct 2023 | 6 reviews, 315 favs | Music loops |

### Extracting PNG/WAV from a .unitypackage without Unity

A `.unitypackage` is a gzipped tar. Each asset is a folder containing `asset`
(the raw file bytes, PNG/WAV intact) and `pathname` (its original path).

```bash
mkdir extracted && tar -xzf Some.unitypackage -C extracted
# rename every "asset" blob to its original filename
cd extracted && for d in */; do
  [ -f "$d/asset" ] && mkdir -p "out/$(dirname "$(cat "$d/pathname")")" && cp "$d/asset" "out/$(cat "$d/pathname")"
done
```

Sprite-sheet slicing data lives in `asset.meta` (Unity YAML) — re-slice by hand.

## Other sources

| Name | Source | URL | License | Formats | Notes |
|---|---|---|---|---|---|
| Animated Stick Figure Character 2D Free CC0 | RGS_Dev, itch.io | https://rgsdev.itch.io/animated-stick-figure-character-2d-free-cc0 | CC0 | 512x512 PNG sheets (26 MB) + .blend | Idle, Walk, Run, Jump, Damage, Death, attacks. 5.0/17 ratings |
| bow and arrow spritesheet | johnnytal, OpenGameArt | https://opengameart.org/content/bow-and-arrow-spritesheet | CC0 | bow.png | Bow-draw frames; Kenney-derived |
| UI Pack 2.0 | Kenney | https://kenney.nl/assets/ui-pack | CC0 | 430 PNG | Buttons, panels, sliders |
| Interface Sounds | Kenney | https://kenney.nl/assets/interface-sounds | CC0 | 100 files | UI click/button |
| Impact Sounds | Kenney | https://kenney.nl/assets/impact-sounds | CC0 | 130 files | Arrow hit, ragdoll thud |
| Kenney Fonts | Kenney | https://kenney.nl/assets/kenney-fonts | CC0 | 11 TTF | Game fonts |
| Particle Pack | Kenney | https://kenney.nl/assets/particle-pack | CC0 | PNG | Hit sparks / smoke (not fetched) |
| New Platformer Pack | Kenney | https://kenney.nl/assets/new-platformer-pack | CC0 | PNG | Ground / pillar tiles (not fetched) |
| Arrow Whoosh 1 | Ali_6868, Freesound | https://freesound.org/people/Ali_6868/sounds/384908/ | CC0 | WAV 44.1k/16-bit, 0.81 s | Arrow flight. Search Freesound "bow release" filtered CC0 for the twang |
| Free 2D Elf Sprite Sheets (archer) | CraftPix | https://free-game-assets.itch.io/free-2d-elf-sprite-sheets | CraftPix free (commercial OK, no redistribution) | PNG | Cartoon archer alternative (not fetched) |
| Stickman Pack | OctoPyte, itch.io | https://octopyte.itch.io/stickman-pack | **CC BY-NC 4.0 — do not use** | pixel sheet | Non-commercial; unusable in a monetized app |

## Licensing notes for the Solana dApp Store

- **CC0** (Kenney, RGS_Dev, OGA, Freesound items above): no restrictions. Safe to
  commit to a public GitHub repo (the hackathon requires one).
- **Unity Asset Store EULA**: commercial use and distribution inside an APK are
  fine; redistributing the raw assets is not. The EULA is written around Unity,
  so use in a React Native app is a gray area for art/audio content. **Do not
  commit Unity Asset Store files to the public repo** — keep them in a gitignored
  `assets/licensed/` folder and copy in at build time, or prefer the CC0 picks.
- **CraftPix free**: commercial OK, attribution not required, no resale.
- **CC BY-NC**: excluded — the game will be on a store.
- The dApp Store publisher policy adds no extra asset-license rules.
