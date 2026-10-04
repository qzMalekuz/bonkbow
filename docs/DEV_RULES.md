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

9. **Hero characters are data, not new rigs.** A hero is an entry in
   `src/game3d/heroSpecs.ts` (hair, beard, glasses, colours, resting face) that
   `HeroHead.ts` sculpts onto the shared `StickmanRig`; body, bow, quiver,
   arrows, animation and hitboxes stay common to every archer. Keep each head
   to one merged vertex-coloured mesh plus the moving lids, brows and mouth —
   no textures, no morph targets (expo-gl). Check every change from front,
   side, back and 45° in Settings → Character showcase (dev builds only).

10. **The body mesh is the Unity Stick Man asset, posed by the rig.**
    `StickmanBody.ts` bends its skeleton to the rig's joints each frame
    (two-bone IK at the asset's bone lengths). Change poses in `Stickman3D.ts`,
    never by editing the export; regenerate the export only with
    `scripts/unity/export-stickman.cs` (steps in docs/ASSETS.md). Keep the
    capsule fallback working: the public repo has no licensed files.
11. **Character motion has no jumps.** Rig blends are critically damped
    springs (`Blend` in Stickman3D.ts), never exponential easing; an emote's
    clock keeps running while it eases out and a new or restarted emote
    crossfades in; hand targets have a top speed; hand blends swing around
    the shoulder. New poses must keep hands out of the head and torso — check
    them from front, side, back and 45° in the showcase, at every transition.

## Game logic

1. Anything that decides an outcome runs on the fixed physics step in
   `sim.ts`; bullet time and visuals may not change results (both multiplayer
   phones must agree).
2. Keep the online protocol as angle + power per shot; the shooter's result
   (`zone`, `hp`, `shield`) is authoritative.
3. Input feel: smooth the aim toward the finger every frame, fire the raw value;
   animations ease (exponential, frame-rate independent) rather than snap.

## Assets

1. Only assets we can legally ship: CC0 / OFL, credited in
   `assets/audio/CREDITS.md` (or docs/ASSETS.md). Unity Asset Store packages
   need the user's own download; unpack with `scripts/extract-unitypackage.sh`
   into the gitignored `assets/licensed/`.
2. Launch trailer lives in `docs/trailer/` and is rendered in code from
   `archer-boys.pdf` plus our own audio: no video generators, no scraped footage
   or music. Rebuild with `docs/trailer/tools/build.sh`; edit shots in
   `tools/shots.py`. `build/` and `out/` are gitignored. PDF page 4 is Mobile and
   page 6 is The Fade (see `src/game/faces.ts`).

## Working with other agents and git

1. Other Claude sessions may edit this repo at the same time. Re-read a file
   before editing it; on surprising changes, check `ListAgents` and coordinate
   with `SendMessage` instead of overwriting.
2. Commit only when asked, on a feature branch (current: `3d-landscape`), with
   no Claude attribution lines.
3. Before calling anything done: `./node_modules/.bin/tsc --noEmit` and
   `./node_modules/.bin/eslint src` must pass, and the change must be checked on
   the device.
