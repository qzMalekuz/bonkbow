# Bonk Bow dev rules

Project-specific rules learned while building this game. Every agent and
contributor working in this repo follows them. When a new rule comes up, add it
here (in the right section) in the same change that applies it.

## Running on a device

1. **Default to the dev build with Fast Refresh.** JS/TS changes never need a
   native rebuild: keep Metro running and save — the phone reloads in seconds.
   - Start Metro: `./node_modules/.bin/expo start --dev-client --port 8081 --clear`
     (call the local binary; `npx expo …` gets rewritten by a shell hook here).
   - Phone over USB: `adb reverse tcp:8081 tcp:8081`, then open
     `exp+bonkbow://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
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

9. **Derp heads are ink drawings, not models.** `src/game/derps.ts` holds
   every head outline, face and hat as renderer-free drawing instructions
   (`derpDrawing()`, head units, y up, origin at the neck); `game3d/ink.ts`
   turns them into one wobbly, unlit, vertex-coloured mesh (one draw, buffers
   allocated once, redrawn ~12×/s so the line boils like the videos) and
   `DerpHead.ts` stands it on the neck as a card that faces the camera,
   mirrors to the way the archer faces and sits 0.3 m toward the camera so
   arms never cover the face. `ui/DerpThumb.tsx` draws the same instructions
   in SVG. New faces, hats or head shapes go in derps.ts only, and get checked
   in both. Never use the slur the owner uses for the style anywhere: say
   derpy, goofy or idiots.

10. **Bodies are skinned meshes posed by the rig.** Every archer wears the
    Unity Stick Man asset, through `StickmanBody.ts`, which bends the skeleton to the rig's joints
    each frame (two-bone IK at the mesh's bone lengths). Change poses in
    `Stickman3D.ts`, never in an export; regenerate the Unity export only
    with `scripts/unity/export-stickman.cs` (steps in docs/ASSETS.md). Keep
    the capsule fallback working: the public repo has no licensed files.
    Head size, neck length, hats and the shovel bow are visual only: the
    sim's hitboxes (world.ts) are the same for every archer.
11. **Character motion has no jumps.** Rig blends are critically damped
    springs (`Blend` in Stickman3D.ts), never exponential easing; an emote's
    clock keeps running while it eases out and a new or restarted emote
    crossfades in; hand targets have a top speed; hand blends swing around
    the shoulder. The character-sheet actions (run, crouch aim, look back)
    are `RigPose` layers with their own `Blend`. New poses must keep hands
    out of the head and torso — check them from front, side, back and 45° in
    the showcase, at every transition (the `reel` action plays them all).
12. **Merge multi-part props into one draw.** The bow, an arrow and the
    shovel are one vertex-coloured mesh each, cached per look.
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
   `sim.ts`; bullet time and visuals may not change results.
2. Input feel: smooth the aim toward the finger every frame, fire the raw value;
   animations ease (exponential, frame-rate independent) rather than snap.
3. Comedy beats (early cheers, the stare at the camera, the late "ow",
   eating arrows, the wrong-way turn, the self-bonk) live in `sim.ts` as
   presentation: they may use `Math.random()`, but never change a hit,
   damage or turn. A self-bonk resolves as a miss. The AI also fires its
   own derpy shots (straight up, wrong-way draw).
4. The map rides in the match seed's low two bits (`seedWithMap`,
   `mapOfSeed` in `src/game/maps.ts`): create every match seed with
   `randomSeed(equippedMap)`, never `Math.random()` directly, and only
   append to `MAPS` (its index is what the seed carries).

## Assets

1. Only assets we can legally ship: CC0 / OFL, credited in
   `assets/audio/CREDITS.md` (or docs/ASSETS.md). Unity Asset Store packages
   need the user's own download; unpack with `scripts/extract-unitypackage.sh`
   into the gitignored `assets/licensed/`.
2. Videos live in `docs/trailer/` and are drawn in code (Pillow, the
   `tools/derpy*.py` scripts) plus our own audio: no video generators, no
   scraped footage or music. `build/` and `out/` are gitignored.
3. The six heroes (likenesses of real people) were retired on 2026-10-07 for
   the Bonk Bow derps (docs/PIVOT.md) and their ids, assets and price-table
   rows were removed on 2026-10-12. Don't bring back real-person likenesses.

## Shop

1. The shop and "Choose your style" share five sections, in this order:
   Characters (derps), Clothes, Hats, Bows, Arrows (`SECTIONS` in
   `ui/PartThumb.tsx`); the shop adds Maps. Product ids are `<kind>_<id>`
   (`derp_`, `outfit_`, `hat_`, `bow_`, `arrow_`) plus the map ids, all
   listed in `skins.ts` / `maps.ts`. Nothing sold changes a shot.
2. Every item is sold one way only. The originals (four derps, ten hats,
   the Shovel Bow, the three maps) are SOL/SKR: keep their ids and prices
   stable, since purchases are verified against them
   (`solana/payments.ts`). Everything newer costs coins (`COIN_PRICES` in `skins.ts`),
   bought on the device into the store's `coinItems`, which must never feed
   `ownedSkins`. Check ownership with `ownsProduct(id, ownedSkins,
   coinItems)`; an item is free only if it has no price of either kind.
3. New cosmetics are data first: derps and hats in `derps.ts` (hats are
   ink drawings), bows in `BOWS` (colours + scale), clothes and arrows in
   `gear.ts`; the rig builds clothes on the torso and arrows from those
   defs, the UI draws them in `ui/PartThumb.tsx`. Add a coin price, keep
   `sanitizeLoadout` accepting the id, and check it in the showcase.
4. XP, levels and coin rewards live in `progression.ts` only (match pay,
   daily bonus, level-up bonus); a match pays through `store.finishMatch`.
   Coin prices assume ~30–90 coins a match.

## Payments & offline

1. There is no server. Anything that must be kept lives on the device:
   AsyncStorage or the persisted zustand store (`game/store.ts`). Don't add
   a backend or an account system.
2. Every real-money payment goes through `solana/payments.ts`: pay from the
   wallet to the treasury with a `bonkbow:` memo, read the transaction back
   from the chain, then store the item locally. Never unlock anything before
   the chain confirms the payment.
3. Item ids and `priceLamports` / `priceSkr` are what restore checks old
   payments against (memo = id, amount ≥ price). Never rename a paid item's
   id, and don't raise a price casually: older purchases would stop
   restoring.
4. Keep `.easignore` in sync with `.gitignore` (EAS reads it instead), but
   keep `assets/licensed/` uploaded: the APK needs the Unity models.
5. Start EAS builds from the local machine (`bunx eas-cli workflow:run
   build-android.yml` or `eas build`), never from a GitHub push: a checkout
   has no `assets/licensed/`.

## Working with other agents and git

1. Other Claude sessions may edit this repo at the same time. Re-read a file
   before editing it; on surprising changes, check `ListAgents` and coordinate
   with `SendMessage` instead of overwriting.
2. Commit only when asked, on a feature branch (current: `3d-landscape`), with
   no Claude attribution lines.
3. Before calling anything done: `./node_modules/.bin/tsc --noEmit` and
   `./node_modules/.bin/eslint src` must pass, and the change must be checked on
   the device.
