# Bonk Bow — the world's least coordinated archers

Formerly *Stickchers*. Repo, package id (`com.bonkbow.app`), URL scheme (`bonkbow://`) and EAS project are all Bonk Bow now.

Repo: https://github.com/qzMalekuz/bonkbow

> **They have bows. That's about it.**

## The idea

Bonk Bow is a turn-based stickman archery duel where **the archers are
idiots**. Two scrawled stickmen stand on facing cliffs and take turns trying to
shoot each other. They hold the bow backwards, eat the arrows, fire straight up
and get hit by their own shot a few seconds later, dodge directly into things,
and celebrate before anything has landed. They are completely confident the
whole time.

The joke is the gap between the two halves of the game:

- **The game underneath is a real one.** Drag back like a slingshot, read the
  dotted arc, release. Fixed-step physics, hit zones, 100 HP, turns, an AI
  opponent that adapts to how well you shoot, and online rooms where both
  phones run the same simulation.
- **The archers on top of it are useless.** Every draw, miss, hit and win is
  performed by someone who has no idea how a bow, or a body, works.

Winning should feel like an accident you get to take credit for.

### What it should feel like

- **Deadpan.** Nobody in the game knows they are funny. No winking at the
  player, no joke captions explaining the joke.
- **Dumb, not mean.** The humour is about fictional stickmen being bad at
  archery. It is never about real people or real conditions.
- **Hand-made.** Wobbly ink lines, lumpy heads, heavy-lidded eyes that wander
  off on their own, a bit of drool, and a "bonk".
- **Small sounds, big confidence.** A wonky band, slide whistles, a bonk, and a
  stickman giving a thumbs-up from the floor.

### The archers

There is no fixed cast of heroes. Archers come from a **pool of derps**: the
same stick body with a different scrawled head and one stupid habit each
(`src/game/derps.ts`). Every archer does every bit now and then; his habit
just comes up a lot more.

| Archer | Head | Habit |
|---|---|---|
| Gary (free) | bean | Accuracy: no. Confidence: yes. Celebrates early. |
| Tall Steve | pea, long neck | Neck: too much. Shoots straight up a lot. |
| Doug | slab | Eats the arrows. |
| Kevin | bean | Faces the wrong way. Committed to it. |
| Some Guy | slab | The usual opponent. 847 wins. Visibly bored. |

On top of the head go **hats** (top hat, party hat, propeller cap, traffic
cone, paper crown, cooking pot, viking helmet, arrow through the head, fish,
chef hat). They do not help. And there is the **Shovel Bow**, added because
someone in the comments asked for it. None of it changes a shot: hitboxes,
damage and physics are the same for every archer.

### Launch video

`docs/trailer/out/bonkbow-60s.mp4` (60 s), `bonkbow-20s.mp4` and
`bonkbow-game848-30s.mp4`: drawn entirely in code in the game's scrawled style.
Rebuild with `python3 docs/trailer/tools/derpy60.py` (about two minutes).

## Where the build is today

The app has been pivoted to Bonk Bow. What a match looks like now:

| | The build |
|---|---|
| Archers | The derps above: one 3D stick body with a hand-scrawled paper head (ink outline, wandering eyes, heavy lids, drool) that always faces the camera and redraws itself a few times a second like the videos |
| Behaviour | Deterministic comedy beats on top of a fair duel: wrong-way draws, the odd arrow eaten, shots that go straight up and come back down on the shooter (a harmless bonk), celebrating while the arrow is still flying, noticing a hit a moment late ("...ow."), a deadpan stare at the camera after a miss. Presentation only: the sim decides every outcome the same way as before |
| HUD | Like the videos: a scrawled "YOUR TURN / HIS TURN" sign that ducks out of the way while anyone aims, "SUDDEN DEATH" when both archers are down to a third of their health, "-N" floating off the bar that was hit, "BONK" / "...ow." / "nailed it" over heads |
| Shop | Derps, hats, the Shovel Bow and three maps, in SOL or SKR |
| Maps | Unchanged: the 3D arenas (Classic, plus the three shop maps) |
| Name | **Bonk Bow** everywhere: app, repo, `com.bonkbow.app`, `bonkbow://`, EAS and Sentry projects |
| Unchanged | Duel rules, physics, hit zones, AI, multiplayer rooms, wallet sign-in, on-chain purchases, SKR |

## What is in the repo

Turn-based 3D stickman archery, landscape, built with Expo / React Native for
the **CLOCK IN Solana Mobile hackathon**. Two modes — **vs AI** and
**multiplayer rooms** with shareable 6-letter codes — plus an **in-game shop**
of derps, hats, the Shovel Bow and three maps paid in **SOL or SKR**. The wallet **is**
the account: Mobile Wallet Adapter (MWA) authorizes, Sign in with Solana
creates the Supabase session, purchases are transfers signed in the wallet and
verified on-chain before anything unlocks.

Stack: three.js through `@react-three/fiber` on `expo-gl` (one fixed-step
simulation, rendered in 3D), `@wallet-ui/react-native-kit` + `@solana/kit`
(MWA), Supabase (auth, rooms, realtime, purchases, edge functions), PostHog,
Sentry, EAS Build/Update.

## Hackathon facts (verified 2026-09-29)

- Submissions close **Oct 12, 2026** (extended from Oct 8, 23:59 PT). Winners Nov 10.
- Required: functional **Android APK**, judge-accessible **GitHub repo** (commit
  history is reviewed), ~3-min on-device **demo video** (judges read the
  transcript), **pitch deck**.
- Judging (T&Cs): stickiness & PMF, UX, innovation, presentation — 25% each.
  Align platform weights: AI 20 · SKR 20 · UX 15 · UI 15 · Innovation 15 ·
  Ecosystem 15. Winners publish on the **Solana dApp Store** within 30 days.
- Separate **$10k SKR prize** for a meaningful SKR integration → the shop is
  SKR-native (see below).
- Full research: [docs/HACKATHON.md](docs/HACKATHON.md). Submission checklist,
  demo script and deck outline: [docs/SUBMISSION.md](docs/SUBMISSION.md).

## Run it

MWA and the crypto polyfill are native modules, so **Expo Go does not work** —
use a development build.

```bash
cp .env.example .env.local          # fill in what you have; blanks are fine
npm run android                     # builds + installs the dev client on a connected device/emulator
# or in the cloud:
npm run build:dev                   # eas build -p android --profile development
npm start                           # Metro, once a dev build is installed
```

Test wallets without a Seeker: Phantom/Solflare on the device, or the Mock MWA
wallet from the Solana Mobile docs. Stay on devnet (`EXPO_PUBLIC_SOLANA_CLUSTER=devnet`)
and airdrop yourself SOL to test the shop.

Quality gates: `npm run typecheck`, `npm run lint`, `npm run doctor`. (Edge
functions are Deno and excluded from ESLint; use `deno lint supabase/functions`.)

## What works without any backend

Play vs AI, the style screen, haptics and audio settings, local best score and
streak. Wallet connect works too (MWA only). Multiplayer, the shop's unlock
step, and the leaderboard need Supabase (below); the shop also needs
`EXPO_PUBLIC_TREASURY_ADDRESS`.

## Project layout

```
index.js / polyfill.js         entry: installs react-native-quick-crypto BEFORE any Solana import
src/app/
  index.tsx                    menu: Play vs AI · Multiplayer · Shop · Style · Sign in with wallet
  match.tsx / game.tsx         VS screen, then the duel HUD; /game?mode=ai | ?mode=online&code=&role=&seed=
  result.tsx                   win / lose screen
  lobby.tsx                    create room (code + share) / join by code
  shop.tsx                     derps, hats, the Shovel Bow and maps; pay in SOL or SKR, SKR balance, restore, equip
  style.tsx                    pick your derp, hat and bow from what you own
  leaderboard.tsx              global best runs by wallet, your best + day streak
  settings.tsx                 haptics + audio toggles, sign out, legal, updates, delete account
src/game/
  skins.ts / maps.ts           what the shop sells, with SOL + SKR prices (placeholders)
  derps.ts / cosmetics.ts      the cast, hats and bows as data + drawing instructions; loadouts
  store.ts / haptics.ts / rng  zustand persisted settings, streak, accuracy, ownership; haptics; seeded RNG
src/game3d/
  sim.ts / world.ts            the duel: fixed-step physics, turns, hit zones, adaptive AI, seeded layouts
  Duel3D.tsx / Arena.ts        the 3D scene and the arenas (themes.ts, mapProps.ts)
  Stickman3D.ts / StickmanBody the archer rig and its skinned body
  DerpHead.ts / ink.ts         the scrawled paper heads and hats, drawn as wobbly ink meshes
  Stage.tsx / SkinStage.tsx    3D sets for the menu, shop, style and result screens
src/solana/
  config.ts                    cluster, RPC, app identity (wallet sheet), SKR mint + treasury
  auth.ts                      useWalletAuth: MWA authorize → Sign in with Solana → Supabase session
  skr.ts                       useSkrBalance (token account via kit RPC), SKR TransferChecked builder
  payments.ts                  buySkin (SOL or SKR) via MWA → verify-purchase; pending-purchase restore
  WalletButton.tsx             sign in / sign out
src/audio/                     preloaded SFX pools, per-screen music crossfade, ducking
src/multiplayer/useRoom.ts     rooms table + Realtime channel (presence, shot/result/skin broadcasts)
src/ui/                        HUD (turn sign, bars, "-N", head words), emotes, derp thumbnails, loading screen, buttons
supabase/
  schema.sql                   profiles, scores, leaderboard, purchases, rooms + join_room()
  functions/verify-purchase    checks the transfer on-chain, grants the item (service role)
  functions/delete-account     account deletion
assets/audio/                  CC0 music + SFX (credits in CREDITS.md)
scripts/                       map optimizer, Unity export scripts
docs/                          DEV_RULES, ASSETS (sources + licensing), HACKATHON, SUBMISSION, trailer
.eas/workflows/                build the dApp Store APK on push to main
.github/workflows/             PR preview QR (EAS Update) + automated PR review
```

## How the pieces work

**Game loop.** Drag anywhere and pull back like a slingshot; a dotted arc
previews the shot; release fires. Damage depends on the zone hit (head, body,
legs); both archers have 100 HP. The duel is one plain simulation object on a
fixed physics step (`src/game3d/sim.ts`), so both multiplayer phones agree; the
3D scene only reads it, and discrete events drive haptics, HUD and the
multiplayer channel. The comedy (self-bonks, early cheers, late "...ow.",
arrow eating) is also emitted by the sim as events, so both phones see the
same gag, and none of it changes who wins.

**Audio** (Settings → Audio): menu, battle and shop music crossfade as you
navigate and duck under the win/lose jingle. Bow creak and ratchet ticks
while drawing, twang + whoosh on release, distinct body, headshot, wood and
ground impacts, body drop on a kill, and a subtle click on every button.

**Haptics** (Settings → Feedback): ratchet ticks while drawing, medium impact
on release, heavy on body hit, success + vibration pattern on kill, rigid +
vibration on taking damage, error + long pattern on death.

**Auth = wallet.** `useWalletAuth().signIn()` opens ONE wallet sheet: MWA
`signIn` (authorize + Sign in with Solana; Seed Vault on Seeker composes and
signs the SIWS message) → the signed message goes to
`supabase.auth.signInWithWeb3({ chain: 'solana', message, signature })` →
Supabase verifies the Ed25519 signature and domain and mints a session whose
`web3` identity *is* the wallet address → a DB trigger copies it to
`profiles.wallet_address` (clients cannot write that column). Wallets without
SIWS fall back to authorize + `signMessages`. The app also keeps an anonymous
Supabase session for guests so runs land on the leaderboard once they sign in;
`useWalletAuth().session` only ever returns a wallet-backed session.

**Shop (SOL or SKR).** `buySkin` builds either a System Program transfer
(SOL) or, for SKR, an idempotent create-treasury-ATA + `TransferChecked`
pinned to the SKR mint and 6 decimals; `sendTransaction` hands it to the wallet
(Seed Vault on Seeker) to sign and send. The signature goes to the
`verify-purchase` edge function, which fetches the confirmed transaction,
checks the destination (for SKR: a token account *owned by* the treasury for
the SKR mint), the amount against **its own** price table and that the
sender/authority is the user's linked wallet, then inserts `purchases`
(service role; clients cannot insert). If verification is interrupted after
the transfer went out, the signature is kept as a pending purchase and retried
next time the shop opens. Ownership is cached in the zustand store and
refreshed on sign-in and on shop open. Prices in `src/game/skins.ts` and the
edge function are placeholders and must match.

**SKR integration.** SKR is the shop's native currency: every derp, hat,
bow and map has an SKR price (~20% under SOL), the shop remembers "pay in SKR", and shows a
live balance read from the wallet's associated token account through the MWA
provider's `@solana/kit` RPC client. Mainnet mint
`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` is the default on mainnet-beta;
on devnet set `EXPO_PUBLIC_SKR_MINT` to any 6-decimal test mint.

**Adaptive AI.** The AI's aim noise is a function of the run score and your
lifetime hit rate (kept in the store), so a sharp shooter faces a sharper
opponent (`enemyNoise` in `src/game3d/world.ts`). Offline, instant, no LLM.

**Multiplayer.** Host inserts a `rooms` row (6-char code, random seed) and
shares the code; guest calls `join_room(code)` (atomic seat-take). Both open
Realtime channel `room:<code>`: presence shows connection, `shot` broadcasts
the shooter's aim, `result` broadcasts the authoritative outcome from the
shooter's simulation (the receiver mirrors the shot for animation and applies
the result when the arrow lands). Each client draws itself on the left; the
seed gives both the same mirrored layout. Host shoots first; first to 0 HP
loses; a disconnect forfeits.

## Ship to the Solana dApp Store

1. **Release signing key** (separate from any Play key; losing it means you
   can never update):
   ```bash
   mkdir -p dapp-store && keytool -genkey -v -keystore dapp-store/release.keystore \
     -alias bonkbow -keyalg RSA -keysize 2048 -validity 10000
   ```
   Upload it to EAS (`eas credentials -p android`) so the `dapp-store` profile
   signs with it. `dapp-store/*.keystore` and `*.json` are gitignored.
2. **Build the APK**: `npm run build:apk` (profile `dapp-store`, `buildType: apk`,
   `autoIncrement` bumps `versionCode`).
3. **Publisher Portal**: create publisher + app, mint the App NFT, grab an API
   key. Needs a mainnet Solana keypair with a little SOL.
4. **Publish**: `npm run publish:dapp-store -- --apk-file ./app.apk --keypair ./dapp-store/publisher-keypair.json --whats-new "v1"`
5. Publish `https://<domain>/privacy` and `/terms`; set `DOMAIN` and
   `SUPPORT_URL` in `src/utils/legal.ts`; host an icon at
   `APP_IDENTITY.uri` (`src/solana/config.ts`); switch cluster + RPC to
   mainnet; set real prices; set `TREASURY_ADDRESS` to a wallet you control.

Docs: https://docs.solanamobile.com/dapp-store/publishing-cli ·
https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk

## Services setup

| Service | Steps |
|---|---|
| Supabase | Create project → `EXPO_PUBLIC_SUPABASE_URL/KEY`. Run `supabase/schema.sql`. **Auth → Providers → enable Web3 Wallet**; add the app identity URL to allowed URLs. `supabase functions deploy verify-purchase delete-account`. `supabase secrets set SOLANA_RPC_URL=… TREASURY_ADDRESS=…`. |
| Solana | `EXPO_PUBLIC_SOLANA_CLUSTER`, `EXPO_PUBLIC_SOLANA_RPC_URL` (dedicated RPC for mainnet), `EXPO_PUBLIC_TREASURY_ADDRESS`, `EXPO_PUBLIC_SKR_MINT` (devnet test mint; blank on mainnet). Edge function secrets: `SOLANA_RPC_URL`, `TREASURY_ADDRESS`, `SKR_MINT`. |
| Sentry | `EXPO_PUBLIC_SENTRY_DSN`; `eas secret:create --name SENTRY_AUTH_TOKEN`; project in app.json (`bonkbow`); set `SENTRY_ORG` to your org at build time. |
| PostHog | `EXPO_PUBLIC_POSTHOG_KEY`. Events: `game_started`, `game_over`, `skin_equipped`, `purchase_*`. |
| EAS | `eas init`; set every `EXPO_PUBLIC_*` as an EAS env var (cloud builds don't read `.env.local`); `eas update:configure` for OTA. |
| GitHub Actions | repo secret `EXPO_TOKEN`, plus the API key read by the PR review workflow (see `.github/workflows/`). |

## Next steps toward submission

The live list, with what is done and what blocks the submission, is in
[docs/SUBMISSION.md](docs/SUBMISSION.md).
