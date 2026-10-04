# Stickchers dev rules

Project-specific rules learned while building this game. Every agent and
contributor working in this repo follows them. When a new rule comes up, add it
here (in the right section) in the same change that applies it.

## Running on a device

1. **Default to the dev build with Fast Refresh.** JS/TS changes never need a
   native rebuild: keep Metro running and save — the phone reloads in seconds.
   - Start Metro: `./node_modules/.bin/expo start --dev-client --port 8081 --clear`
     (call the local binary; `npx expo …` gets rewritten by a shell hook here).
   - Phone over USB: `adb reverse tcp:8081 tcp:8081`, then open
     `exp+stickchers://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
   - Metro started from an agent session stops after ~2 h; restart it when it does.
2. **Rebuild natively only when native code changes**: adding/removing a
   library with native code, `app.json` / config-plugin edits (orientation,
   permissions, icons). Build (after the clean in rule 5): `cd android && ./gradlew assembleDebug
   -PreactNativeArchitectures=arm64-v8a`, then `adb install -r
   android/app/build/outputs/apk/debug/app-debug.apk`. Regenerate `android/` with
   `expo prebuild --clean --platform android` only after config changes.
3. **Judge smoothness on optimized JS, not the dev bundle.** Either
   `expo start --dev-client --no-dev --minify` (no rebuild, manual reload) or a
   release build: `SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleRelease
   -PreactNativeArchitectures=arm64-v8a` (debug-signed, installs over the dev
   build; no Metro, no hot reload). Switch back to the dev build afterwards.
4. "Rendered fewer/more hooks than expected" right after an edit is a Fast
   Refresh artifact (a hook was added/removed in a mounted component) — do a
   full reload, it is not a bug.
5. **Clear old builds and caches on every rebuild/reinstall** so nothing piles up:
   - Before a native build: `cd android && ./gradlew clean` (drops old APKs and
     intermediates in `android/app/build`, `android/build`).
   - When (re)starting Metro: add `--clear` (drops stale transformed bundles).
   - On the phone: reinstall in place with `adb install -r` — it replaces the old
     APK. Don't `adb uninstall` unless the signing key changed; that wipes saved
     progress (coins, XP, loadout).
   - Leave the shared `~/.gradle/caches` alone: deleting it only forces every
     dependency to download again.
   - Remove one-off files (screenshots, downloaded bundles) from the scratchpad
     when done with them.
6. macOS has no `timeout`; don't wrap adb/gradle in it.
7. Check `adb devices` before installing; if the phone dropped off, ask the user
   to reconnect/unlock instead of waiting indefinitely.

## 3D / performance (expo-gl + React Three Fiber)

1. **Never change the pixel ratio** (`setDpr`, `gl.setPixelRatio`, `dpr`) on an
   expo-gl canvas: it renders the scene into a corner of the screen.
2. Every `<Canvas>` uses `gl={{ antialias: false }}`; no shadow maps — use the
   rig's contact blob shadow.
3. Materials: Lambert for matte, Phong for glossy; avoid `MeshStandardMaterial`
   on anything that covers many pixels.
4. Keep draw calls low: bake static scenery with `Baker` (Arena.ts), instance
   repeated objects, merge multi-part props into one mesh (arrows are one draw).
5. No per-frame allocations or colour-string parsing in render loops; reuse
   vectors/colours; skip work when nothing changed (particles, trail).
6. Mutable three.js state lives in controller classes (`DuelView`, `StageView`,
   …); components only create, attach and call `frame()` — required by the
   React Compiler lint.
7. `three` must resolve to its ES module build (see `metro.config.js`); its CJS
   entry crashes React Native.
8. Measure before and after perf work: the `[perf]` logcat line in Duel3D
   (fps, sim ms, render ms, draw calls, slow frames). Target 60 fps with
   0–2 slow frames per 3 s on the Pixel 6a. Turn `PERF_LOG` off for shipping.

9. **Hero heads are the sheet's own drawings, shown from four sides.**
   Heroes are seen only from the front, right, back and left (stages and
   showcase turn between those; a swipe snaps to the nearest quarter turn).
   `scripts/heroes/build.sh [id]` cuts each side, plus the front once per
   sheet expression, out of `archer-boys.pdf` into one registered atlas
   (`assets/heroes/<id>_heads.png` + `.json`); `HeroHead.ts` puts it on a
   camera-facing card, crossfades expressions and flips the card for a side
   change (never crossfade two outlines: that ghosts). Page calibration is in
   `HEROES` in `scripts/heroes/sheets.py`. Don't reintroduce 3D head
   reconstruction from the sheets: its in-between angles always smear.

10. **Bodies are skinned meshes posed by the rig.** Plain archers wear the
    Unity Stick Man asset; heroes wear their baked chibi suit. Both go
    through `StickmanBody.ts`, which bends the skeleton to the rig's joints
    each frame (two-bone IK at the mesh's bone lengths). Change poses in
    `Stickman3D.ts`, never in an export; regenerate the Unity export only
    with `scripts/unity/export-stickman.cs` (steps in docs/ASSETS.md). Keep
    the capsule fallback working: the public repo has no licensed files.
    Hero proportions are visual only: the sim's hitboxes (world.ts) are the
    same for every archer.
11. **Character motion has no jumps.** Rig blends are critically damped
    springs (`Blend` in Stickman3D.ts), never exponential easing; an emote's
    clock keeps running while it eases out and a new or restarted emote
    crossfades in; hand targets have a top speed; hand blends swing around
    the shoulder. The character-sheet actions (run, crouch aim, look back)
    are `RigPose` layers with their own `Blend`. New poses must keep hands
    out of the head and torso — check them from front, side, back and 45° in
    the showcase, at every transition (the `reel` action plays them all).
12. **Merge multi-part props into one draw.** The bow and the quiver (with
    its arrows) are one vertex-coloured mesh each, cached per look.
13. **Menu characters spin by touch** through `Turntable.ts`: the yaw is added
    to `rig.root.rotation.y` after `rig.update` (the skin sync is root-relative,
    so this is safe). The gesture view goes above the GL canvas and under the
    menu, whose wrapper is `pointerEvents="box-none"`.
14. **Shop maps are dressed with Unity environment packs, never by hand.**
    `scripts/unity/export-environments.cs` exports the props (flat-colour
    packs baked to one colour per face, painted packs keep 512 px textures),
    then `bun scripts/maps/optimize.ts` caps each prop's triangles; both write
    the gitignored `assets/licensed/maps/` (steps in docs/ASSETS.md).
    `mapProps.ts` merges light props per material and instances heavy ones.
    Layout lives in the `build<Map>` methods of Arena.ts: only low dressing
    (grass, stones, snow) in front of z = -5, nothing tall between the camera
    and the arrows; building fronts face +z. Keep each map near the measured
    budget (~80–130k triangles, ~50 draws, 59–60 fps on the Pixel 6a) and
    keep the procedural fallback working (no licensed files → the map's
    colours on the open landscape). Check layouts offline first with
    `bun scripts/maps/shoot.ts <outDir> grove:aim valley:over snow:wide`
    (`kit:<pack>` lines up a pack's props), then on the phone.

## Game logic

1. Anything that decides an outcome runs on the fixed physics step in
   `sim.ts`; bullet time and visuals may not change results (both multiplayer
   phones must agree).
2. Keep the online protocol as angle + power per shot; the shooter's result
   (`zone`, `hp`, `shield`) is authoritative.
3. Input feel: smooth the aim toward the finger every frame, fire the raw value;
   animations ease (exponential, frame-rate independent) rather than snap.
4. The map rides in the match seed's low two bits (`seedWithMap`,
   `mapOfSeed` in `src/game/maps.ts`): create every match/room seed with
   `randomSeed(equippedMap)`, never `Math.random()` directly, and only
   append to `MAPS` (its index is what the seed carries).

## Assets

1. Only assets we can legally ship: CC0 / OFL, credited in
   `assets/audio/CREDITS.md` (or docs/ASSETS.md). Unity Asset Store packages
   need the user's own download; unpack with `scripts/extract-unitypackage.sh`
   into the gitignored `assets/licensed/`.
2. Launch trailer lives in `docs/trailer/` and is rendered in code from
   `archer-boys.pdf` plus our own audio: no video generators, no scraped footage
   or music. Rebuild with `docs/trailer/tools/build.sh`; edit shots in
   `tools/shots.py`. `build/` and `out/` are gitignored.
3. `archer-boys.pdf` pages are the heroes, in order: 1 Akshay, 2 Beeman,
   3 Chase, 4 M-it, 5 Mert, 6 Tolly (`FACES[id].page` in `src/game/faces.ts`).
   Hero ids are the names (`akshay` … `tolly`; skins `hero_<id>`). The
   trailer's own crops (`docs/trailer/refs`) still use the old nicknames:
   mobile = page 4, fade = page 6.

## Shop

1. The shop sells the six heroes (`SHOP_SKINS`), one paid skin each, and
   the three environment maps (`SHOP_MAPS`, Maps tab; Classic is free), in
   SOL or SKR. Maps were added at the user's request on 2026-10-05. There
   are no other cosmetics: no hats, bows, trails or coin unlocks. "Choose your style" only switches between the classic
   archer and the heroes you own; a locked hero links to the shop. Keep `supabase/functions/verify-purchase` PRICES
   equal to the hero skins in `skins.ts` and the maps in `maps.ts` (map
   purchases use the map id, e.g. `map_snow`, in the same purchases table); old `bro_*` purchase ids map to
   the heroes through `canonicalSkinId`.

## Working with other agents and git

1. Other Claude sessions may edit this repo at the same time. Re-read a file
   before editing it; on surprising changes, check `ListAgents` and coordinate
   with `SendMessage` instead of overwriting.
2. Commit only when asked, on a feature branch (current: `3d-landscape`), with
   no Claude attribution lines.
3. Before calling anything done: `./node_modules/.bin/tsc --noEmit` and
   `./node_modules/.bin/eslint src` must pass, and the change must be checked on
   the device.
