# Stickchers launch trailer

A 60-second, 1920×1080, fully 3D launch film: six archers, six arenas, nobody
loses. The creative script is [SCRIPT.md](SCRIPT.md). This file documents how
the film is built.

Everything is rendered in code with Blender (Eevee) from the game's own 3D
heroes and arenas. No video generator, stock footage or third-party music.

| Piece | Where |
|---|---|
| Finished film (H.264 + AAC, −14 LUFS) | `out/stickchers-launch-60.mp4` |
| One-command rebuild | `tools/build.sh` |
| Shots: staging, timing, camera, sound cues | `rig/shots/sNN.py` |
| Heroes, bow, arrows, prop kits from the game's assets | `rig/game_assets.py`, `rig/props.py` |
| Posing and the action library (IK, sheet poses) | `rig/actions.py` |
| Arenas (palettes from `themes.ts`, kits from `mapProps.ts`) | `rig/arenas.py` |
| Sky, light, fog, particles, grade | `rig/scene.py` |
| Camera moves: dolly, orbit, rack focus, arrow-cam, shake | `rig/camera.py` |
| Deterministic arrow flights | `rig/arrows.py` |
| Score + sound effects | `tools/audio60.py` (instruments from `tools/music.py`) |
| Cards, lower thirds, gameplay flash, final encode, cut-downs | `tools/assemble.py` |

`build/` and `out/` are gitignored.

## Rebuild

Needs Blender 5.x (`brew install --cask blender`), ffmpeg, and Python 3 with
pillow, numpy and scipy.

```bash
tools/build.sh                 # everything: render all shots, sound, three films (about 2 h on an M4)
rig/render_all.sh              # only the 3D render, resumable (finished frames are kept)
python3 tools/audio60.py       # only the soundtrack
python3 tools/assemble.py      # only the 60 s film from what is rendered
python3 tools/assemble.py --cut 30
python3 tools/assemble.py --cut 15
```

Working on one shot:

```bash
blender -b -P rig/render.py -- --shot 13 --sheet --q review    # contact sheet, a frame every 0.5 s
blender -b -P rig/render.py -- --shot 13 --frame 45 --q review # one frame -> build/stills/
blender -b -P rig/render.py -- --shot 13 --save                # build/blend/s13.blend to open in Blender
python3 tools/assemble.py --preview                            # film with whatever is rendered so far
```

`--q draft` is half-res with no blur, `review` half-res with blur and fog,
`final` 1080p.

## Where the characters come from

The characters follow `archer-boys.pdf`, not the game's meshes.

- **Heads** are the sheet's own renders. `rig/assets/heads/` holds every
  turnaround view and facial expression of each hero, cut out of the PDF
  (4x upscaled, 512 px from hair top to chin). A head is a camera-facing card;
  after a shot is built, `bake_heads` (`rig/game_assets.py`) picks, per frame,
  the sheet view that matches the angle the head is seen from, and the front
  view's expression. A side the sheet did not draw uses its mirror image.
- **Bodies** are the game's skinned chibi suits (`rig/assets/heroes/*_body.json`)
  squashed to the sheet's proportions (`BODY_SQUASH`): the head is about half the
  character's height. The bow rides the hand on an unscaled mount.

An earlier build textured the game's 3D head meshes instead; they distort off
their front and side views and were dropped.

## Shots

Timing lives in each shot file (`START, END`), with the hero and lower-third
window (`HERO`, `LOWER`) and sound cues (`CUES`). `tools/assemble.py` and
`tools/audio60.py` read them from there.

| Time | Shot | File |
|---|---|---|
| 0:00–0:07 | Arrowhead, bowstring, blood-moon arena, six bows taken, `SIX ARCHERS. ONE ARENA.` | `s01`–`s04`, cards |
| 0:07–0:31 | Entrances: Akshay (meadow), Beeman (moonlit woods), Chase (elder forest), M-it (rainy town), Mert (colosseum), Tolly (snow village) | `s06`–`s11` |
| 0:31–0:33 | `AIM.` | card |
| 0:33–0:40.5 | Arrow-cam duel: Beeman fires, Chase pivots behind the fir, answers; Beeman leans out of the way | `s13`–`s15` |
| 0:40.5–0:44.5 | M-it's rooftop run and airborne counter | `s16`, `s17` |
| 0:44.5–0:47 | Mert walks through arrows and catches the last | `s18` |
| 0:47–0:51 | Tolly's snow dodge; Akshay's windmill ricochet | `s19`, `s20` |
| 0:51–0:52.5 | Gameplay flash | `rig/assets/gameplay/` |
| 0:52.5–0:58 | Walk-out and the frozen volley | `s22`, `s23` |
| 0:58–1:00 | Logo and arrow sting | `s24` |

## Before publishing

- **Gameplay flash.** `rig/assets/gameplay/` is the game's own duel code run in
  a browser harness (from the earlier trailer build), trimmed to aim and
  release so no hit is shown. It predates the current hero heads. Replace it
  with a device capture: 45 frames, `f_0014.jpg`–`f_0058.jpg`.
- **Likenesses.** All six heroes are real people. Get each person's written OK.
- **Credit line.** The logo card has no hackathon or Solana Mobile marks; add
  them in `s24.py` only after confirming the logo-use rules.
- **Cut-downs.** The 30 s and 15 s films reuse the master's picture and slice
  its soundtrack at the cuts. They are on the beat but not re-scored.
- Cards are drawn with Pillow in `assemble.py` rather than HTML + Chromium as
  the script proposed: same result, one less dependency.

## The earlier 41-second sprite cut

`tools/shots.py`, `engine.py`, `render.py`, `cut.py`, `mix.py` and `refs/` build
the first trailer (9:16, 2D sprites cut from the character sheets). It is kept
for reference; only `music.py`'s instruments are reused by the new film.
