# Bonk Bow pivot — handoff notes

Written 2026-10-07 at the end of a long design session. Read this before working on the app:
it records what was decided, what exists, what does not, and what the app work is.

## The decision

The game is no longer "six hero archers". It is **Bonk Bow: stickman archery played by idiots.**

- Two stickmen on facing cliffs take turns shooting each other (the duel that already exists).
- The archers hold the bow backwards, eat the arrows, fire straight up and get hit by their own
  shot, dodge into things, celebrate early, and stay completely confident.
- Tone: deadpan. Dumb, never mean. The humour is about fictional stickmen being bad at archery,
  never about real people or conditions.
- Tagline: **"They have bows. That's about it."**
- The owner's own word for the style is a slur. Never use it in code, file names, commits, store
  copy or captions. Say "derpy", "goofy" or "idiots".

Sequence agreed with the owner: **videos first, app after.** The videos validated; the app was
pivoted on 2026-10-12 (see "Where the app is" below).

## What has been done

### Name
Display name is **Bonk Bow** (was Stickchers): `app.json` `name`, the menu wordmark
(`src/app/index.tsx`), wallet app identity (`src/solana/config.ts`), README, docs, audio credits.

**Renamed on 2026-10-12 at the owner's request:** repo (`qzMalekuz/bonkbow`), folder
(`~/Developer/bonkbow`), npm `name`, Expo `slug` (`bonkbow`), URL `scheme` (`bonkbow://`),
package `com.bonkbow.app`, Sentry project string, GitHub Pages URLs. The EAS project keeps its
`projectId`; rename it to `bonkbow` on expo.dev so the slug matches, and rename the Sentry
project the same way. Installed dev builds with the old package id are a different app now.

### Concept doc
`README.md` top sections ("The idea", "The archers", "Where the build is today") describe the
new identity and a table of what today's build still is. Everything below that line describes
the code as it is.

### Videos (all 2D, hand-scrawled, drawn in code with Pillow; no 3D, no AI video)
In `docs/trailer/tools/`, each rebuilds in 1–3 minutes; outputs in `docs/trailer/out/` (gitignored)
and copies on the owner's Desktop:

| File | Script | What |
|---|---|---|
| `bonkbow-5s.mp4` | `derpy.py` | the first derpy clip the owner liked; the house style |
| `bonkbow-20s.mp4` | `derpy20.py` | the duel as the game plays it (health bars, turn sign, aim arc) |
| `bonkbow-60s.mp4` | `derpy60.py` | launch video: duel + "meet the archers" + features + chaos |
| `bonkbow-shovel-30s.mp4`, `-v2` | `derpy30.py`, `derpy30b.py` | shovel-bow gags (owner disliked v2) |
| **`bonkbow-game848-30s.mp4`** (32 s) | `derpy30c.py` | **the one to post**: Steve has lost 847 games, builds the shovel bow from a fan comment, a finger aims it, he wins by accident; credit card "someone in the comments said add this. so we did." |
| `bonkbow-softlaunch-20s.mp4` | `rig/shots/s41–s48`, Blender | 3D cinematic version; superseded by the 2D style |

Shared drawing helpers live in `derpy.py` (`Pen` wobbly line, `stickman`, `bow`, `arrow`,
`text`, `stars`) and `derpy20.py` (`world` cliffs, `hud`, `para` arcs). Sound is synthesised
(`tuba`, `toot`, `slide`, `bonk` in `derpy60.py`) plus the game's CC0 SFX from
`assets/audio/sfx`. Nobody has listened to the audio: it is placed by timing only.

### Characters (the videos and the app share this cast)
| Archer | Head | Habit |
|---|---|---|
| Gary | bean | accuracy: no, confidence: yes |
| Tall Steve | pea, long neck | neck: too much; builds the shovel bow |
| Doug | slab | eats the arrows |
| Kevin | bean | faces the wrong way |
| "some guy" | slab | the opponent; yawns, chews an arrow, 847 wins |

Head shapes are `HEADS` in `derpy.py` (bean / pea / slab). Faces: heavy uneven lids, eyes that
wander independently, big grin or "o", drool. Speech is scrawled text above the head.

### Community
The game-848 video answers a comment by **@chauhan2903** ("Add this please" + a photo of a man
with a tree-sized bow and a shovel). The video says "shovel bow: in the game soon." That is a
public promise; either build it or soften the line in `derpy30c.py` (`credit()`).

## Where the app is (done 2026-10-12)

Kept unchanged: duel rules, fixed-step sim, hit zones, AI, wallet sign-in, on-chain SOL/SKR
purchases, maps. What changed (all shipped in the working tree):

1. **Archers.** The cast is `src/game/derps.ts` (Gary, Tall Steve, Doug, Kevin, Some Guy),
   drawn as wobbly ink by `src/game3d/DerpHead.ts` + `ink.ts` on the same stick body, and as
   SVG thumbnails by `src/ui/DerpThumb.tsx`. Hats and the Shovel Bow are there too. The hero
   files, assets, scripts, the hero sheet PDF, the `hero_*` price rows and the legacy id map
   are gone.
2. **Behaviour.** In `src/game3d/sim.ts`: early cheers, wrong-way draws, arrow snacks and
   yawns, self-bonk when a shot goes straight up, delayed "ow", staring at the camera after
   a miss, Some Guy smug. Each archer's habit makes his gag likely. Rolls come off a seeded
   stream (`mulberry32(seed)`). Nothing changes a hit.
3. **Look.** Still three.js, but the heads are hand-scrawled ink on paper (the videos' outlines
   from `derpy.py`, wobbling), so the app and the clips read as one thing.
4. **Shop.** Derps, hats ("they do not help"), the Shovel Bow and maps, in SOL or SKR:
   `src/game/skins.ts`, `cosmetics.ts`, `shop.tsx`; payments are checked against those prices
   in `src/solana/payments.ts`.
5. **Shovel bow.** Shipped: giant bow, shovel projectile, recoil throws the shooter onto his back
   (`Stickman3D.ts`), digs in deeper on landing (`Duel3D.tsx`). Same physics as an arrow.
6. **Copy.** Wordmark BONK BOW with the tagline; tips and shop blurbs are derp-themed. `docs/SUBMISSION.md` and the README describe the new game.

Later (2026-10-13) the app went fully offline: no server, no online rooms (every duel is vs the
AI, with a small SOL entry fee), wallet sign-in is a plain MWA connect, and payments are read
back from the chain by the app and stored on the device. The README has the details.

Still open: the player's own 'bonk' habit (Tall Steve) does nothing, since the player aims; the
AI is the one that fires straight up. The dev showcase (`/showcase`) swaps its projectile with
the bow now.

## Constraints and facts

- Hackathon: CLOCK IN (Solana Mobile × Radiants). Submissions close **Oct 12 2026** (extended from Oct 8).
  Judges read the GitHub repo and a transcript of the demo video. `docs/HACKATHON.md`,
  `docs/SUBMISSION.md`.
- Expo SDK project; use `npx expo install`; run `npx tsc --noEmit` and `npx expo lint` before
  calling anything done (both pass as of this note). `docs/DEV_RULES.md` has the device rules.
- Audio in the app is CC0 (`assets/audio/CREDITS.md`). The game's own `battle.mp3` is a
  chiptune, not the videos' oom-pah band.
- Nothing from this session is committed. `git status` shows the rename and docs changes; the
  trailer tools are under `docs/trailer/`.
- The owner compares output against ChatGPT-made videos; code-drawn 2D is what they liked.
  Avoid proposing 3D hero rebuilds again.
