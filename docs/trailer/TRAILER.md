# Stickchers launch trailer

> The 60-second heroic cut is scripted in [SCRIPT.md](SCRIPT.md) (six entrances,
> dodge-and-answer duels, group volley). This file documents the 41-second
> sprite build that exists today.

A 41-second, 9:16 character short: six archers trying to outplay each other in a
moonlit ruin. Rendered entirely in code from `archer-boys.pdf` and the game's own
assets. No video generator, stock footage or third-party music is involved.

| Piece | Where |
|---|---|
| Finished trailer, 1080x1920, 30 fps, H.264 + AAC | `out/stickchers-trailer.mp4` |
| One-command rebuild, about four minutes | `tools/build.sh` |
| The eleven shots: staging, timing, camera | `tools/shots.py` |
| Renderer: arena, lighting, characters, effects, grade | `tools/engine.py` |
| Original score, synthesised with numpy | `tools/music.py` |
| Sound-effect cue sheet and final mix | `tools/mix.py` |
| Pose sprites cut from the PDF, 10 per hero | `refs/<hero>_<pose>.png` |

`build/` and `out/` are gitignored. Preview single frames while editing with
`python3 tools/render.py stills 8.1 15.5 38.6`, which writes `build/sheet.png`.

## Cast

Names are the in-game hero names from `src/game/faces.ts`. All share one build:
big chibi head, matte black suit, round black mitten hands, wooden recurve bow.

| Hero | PDF page | Identity locks | Role in the trailer |
|---|---|---|---|
| **The Smile** | 1 | Black textured quiff with a fade, full short black beard, wide grin | The instigator. Peeks, grins, gets nearly shot. |
| **Shades** | 2 | Bald, black sunglasses, grey beard, thin stickman limbs, white-fletched arrows, no quiver | The cold professional. Opens the film and takes the hero shot. |
| **Curls** | 3 | Big golden-brown curls, thin moustache | The suspicious one. Ducks, looks back, loses the gameplay duel. |
| **Mobile** | 4 | Short swept brown hair, clean-shaven, big smile, collared jacket | Cheerfully reckless. Fires at Curls and later the wrong way. |
| **The Beard** | 5 | Bald, heavy brows, big black beard, crossed chest straps, scowl | The grump. Slow turn, long stare, revenge. |
| **The Fade** | 6 | Short dark hair, stubble, large round eyes, zip jacket | The wide-eyed one. Reacts to everything. |

Characters appear only as the sheet art: body poses from the turnaround and
action rows, and the expression heads from `assets/faces/` for close-ups.
Nothing is redrawn, so identity cannot drift. The trade-off is that motion is
pose-to-pose with squash, stretch, bob and lean, not full limb animation.

## Shots

| # | Time | Shot | What happens |
|---|---|---|---|
| 1 | 0.0–3.5 | Quiet before the chaos | Tilt down from the blood moon to Shades alone. He raises his bow. The Smile peeks out from a pillar. |
| 2 | 3.5–7.0 | The challenge | Letterboxed stand-off. Split-screen eye close-ups. The Smile breaks into a goofy grin. |
| 3 | 7.0–10.0 | First arrow | Close-up of the bow at full draw, release, the arrow skims The Smile's hair, shock face. Card: ONE ARENA. |
| 4 | 10.0–14.0 | Chaos begins | Four one-second cuts joined by whip pans: sprint, crouch shot, chase, jump shot. |
| 5 | 14.0–18.5 | Character comedy | Mobile shoots at Curls, Curls ducks, the arrow hits a post beside The Beard. Silence. Slow turn, glare, draw. Mobile's face. |
| 6 | 18.5–23.5 | Archery montage | Six half-second hero shots, then one arrow in slow motion into a target. |
| 7 | 23.5–27.5 | The six | Camera travels along all six, each doing one thing in character. Card: SIX ARCHERS. |
| 8 | 27.5–31.5 | Escalation | Crossfire, a jump over a crouching archer, Mobile falls back and fires into the sky, the arrow lands at The Fade's feet. Card: ZERO CHILL. |
| 9 | 31.5–34.5 | Hero moment | Slow-motion Shades, glint on the glasses, release, arrow into the lens, cut to black. |
| 10 | 34.5–37.5 | Game reveal | Gameplay-style duel with aim arc, drag control, health bars and a headshot. |
| 11 | 37.5–41.0 | Title | Group shot. Shades fires off-screen, everyone jumps. STICKCHERS, AIM. SHOOT. SURVIVE., COMING SOON. |

## Sound

The score is original: 120 BPM in D minor with a drone and plucked strings for
the stand-off, a chromatic bass groove with claps and hats for the chaos, and
a harder four-on-the-floor variant for the montage and title. It stops dead at
15.5 s for the stare, drops to a filtered pulse under the slow-motion arrow, and
falls to a heartbeat for the hero shot. Sound effects are the game's own CC0
files from `assets/audio/sfx/`. The mix is normalised to about -13 LUFS.

## Before publishing

- Shot 10 is a stylised recreation, not a screen recording. Swap in real capture
  from the Android build if the trailer must show the actual interface.
- The six heroes are likenesses of real people. Get each person's consent first.
- The end card says COMING SOON and shows no date. Change it in `S11` in
  `tools/shots.py` at launch.
