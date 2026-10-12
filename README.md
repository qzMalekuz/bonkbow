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
  dotted arc, release. Fixed-step physics, hit zones, 100 HP, turns, and an
  AI opponent that adapts to how well you shoot.
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
| Opponent | Always the AI. There are no online rooms: the app is fully offline, with no server of its own |
| Entry fee | Each duel costs 0.01 SOL (placeholder), paid from your wallet to the treasury before matchmaking. Free when no treasury is set |
| Unchanged | Duel rules, physics, hit zones, AI, wallet connect, on-chain purchases, SKR |

## What is in the repo

Turn-based 3D stickman archery, landscape, built with Expo / React Native for
the **CLOCK IN Solana Mobile hackathon**. Every duel is **vs the AI** and
costs a small **SOL entry fee**; there is also an **in-game shop** of derps,
hats, the Shovel Bow and three maps paid in **SOL or SKR**. The wallet **is**
the account: Mobile Wallet Adapter (MWA) connects it, payments are transfers
signed in the wallet and read back from the chain before anything unlocks.
There is no server: everything the app keeps lives on the device.

Stack: three.js through `@react-three/fiber` on `expo-gl` (one fixed-step
simulation, rendered in 3D), `@wallet-ui/react-native-kit` + `@solana/kit`
(MWA), AsyncStorage + zustand (everything stored), PostHog, Sentry, EAS
Build/Update.

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
and airdrop yourself SOL to test the duel fee and the shop.

Quality gates: `npm run typecheck`, `npm run lint`, `npm run doctor`.

## Offline by design

There is no backend. Duels, the style screen, settings, best runs and streak
all run on the device. The wallet is only needed to pay: with
`EXPO_PUBLIC_TREASURY_ADDRESS` set, each duel takes its entry fee and the shop
sells; with it empty, duels are free and the shop is disabled.

## Project layout

```
index.js / polyfill.js         entry: installs react-native-quick-crypto BEFORE any Solana import
src/app/
  index.tsx                    menu: Play · Style · Shop · Ranks · Sign in with wallet
  match.tsx / game.tsx         entry fee + VS screen, then the duel HUD (always vs the AI)
  result.tsx                   win / lose screen
  shop.tsx                     derps, hats, the Shovel Bow and maps; pay in SOL or SKR, SKR balance, restore, equip
  style.tsx                    pick your derp, hat and bow from what you own
  leaderboard.tsx              local "Best runs" on this phone, your best + day streak
  settings.tsx                 haptics + audio toggles, disconnect, restore purchases, reset local data, legal, updates
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
  auth.ts                      useWalletAuth: MWA connect / disconnect (no session, no server)
  skr.ts                       useSkrBalance (token account via kit RPC), SKR TransferChecked builder
  payments.ts                  pay → memo → read back from chain: buySkin, duel fee + credit, pending + on-chain restore
  WalletButton.tsx             sign in / sign out
src/utils/scores.ts            local best runs (top 20 in AsyncStorage)
src/audio/                     preloaded SFX pools, per-screen music crossfade, ducking
src/ui/                        HUD (turn sign, bars, "-N", head words), emotes, derp thumbnails, loading screen, buttons
assets/audio/                  CC0 music + SFX (credits in CREDITS.md)
site/                          GitHub Pages: landing page, wallet-sheet icon, /privacy, /terms
scripts/                       map optimizer, Unity export scripts
docs/                          DEV_RULES, ASSETS (sources + licensing), HACKATHON, SUBMISSION, trailer
.eas/workflows/                build the dApp Store APK; started from this machine (`bunx eas-cli workflow:run build-android.yml`)
.github/workflows/             publish site/ to Pages, PR preview QR (EAS Update) + automated PR review
.easignore                     EAS upload ignore list: mirrors .gitignore but keeps assets/licensed/; skips docs/ scripts/ dapp-store/
```

## How the pieces work

**Game loop.** Drag anywhere and pull back like a slingshot; a dotted arc
previews the shot; release fires. Damage depends on the zone hit (head, body,
legs); both archers have 100 HP. The duel is one plain simulation object on a
fixed physics step (`src/game3d/sim.ts`), so frame rate never changes a
result; the 3D scene only reads it, and discrete events drive haptics and the
HUD. The comedy (self-bonks, early cheers, late "...ow.", arrow eating) is
also emitted by the sim as events, and none of it changes who wins.

**Audio** (Settings → Audio): menu, battle and shop music crossfade as you
navigate and duck under the win/lose jingle. Bow creak and ratchet ticks
while drawing, twang + whoosh on release, distinct body, headshot, wood and
ground impacts, body drop on a kill, and a subtle click on every button.

**Haptics** (Settings → Feedback): ratchet ticks while drawing, medium impact
on release, heavy on body hit, success + vibration pattern on kill, rigid +
vibration on taking damage, error + long pattern on death.

**Auth = wallet.** `useWalletAuth()` (`src/solana/auth.ts`) is a Mobile
Wallet Adapter connect / disconnect and nothing more: one wallet sheet
(Phantom, Solflare, or Seed Vault on Seeker) authorizes the app and the
connected address is the player. There is no Sign in with Solana and no
session. Signing out disconnects the wallet; purchases stay, because they are
stored on the device.

**Payments.** Every real-money payment in `src/solana/payments.ts` is one
transaction from the wallet to the treasury: a System Program transfer (SOL)
or, for SKR, an idempotent create-treasury-ATA + `TransferChecked` pinned to
the SKR mint and 6 decimals, plus an SPL memo `bonkbow:<item id>` (or
`bonkbow:duel`). The wallet (Seed Vault on Seeker) signs and sends it. The app
then reads the transaction back from the cluster RPC (`getTransaction`,
jsonParsed, confirmed) and checks that it succeeded, that the memo matches,
and that it moved at least the catalogue price (`src/game/skins.ts` /
`maps.ts`) from the payer to the treasury. Only then is the item stored
locally (`ownedSkins` in `src/game/store.ts`). If the check is interrupted
after the transfer went out, the signature is kept as a pending purchase and
retried next time the shop opens. On a new install,
`restorePurchasesFromChain` rebuilds ownership by scanning the wallet's
signatures for `bonkbow:` memos (on shop open with a wallet connected, and
Settings → Restore purchases). Trade-off: the check runs in the client. The
items are cosmetic, so a patched client only fools itself. Prices are
placeholders.

**Duel entry fee.** Each duel costs `DUEL_FEE_LAMPORTS` (0.01 SOL,
placeholder, `src/solana/config.ts`), paid the same way on the match screen
before matchmaking. A fee that was paid but not used (app killed, slow
confirmation) is kept as a credit in AsyncStorage and spent by the next duel
(`payDuelFee`, `duelCreditStatus`, `spendDuelCredit`). With no
`EXPO_PUBLIC_TREASURY_ADDRESS`, duels are free and the shop is disabled.

**Best runs.** The Ranks screen is a local board: the top 20 runs played on
this phone, kept in AsyncStorage (`src/utils/scores.ts`), plus your best and
day streak. Settings → Reset local data clears everything the app keeps on
the phone; SOL/SKR items come back with Restore purchases.

**SKR integration.** SKR is the shop's native currency: every derp, hat,
bow and map has an SKR price (~20% under SOL), the shop remembers "pay in SKR", and shows a
live balance read from the wallet's associated token account through the MWA
provider's `@solana/kit` RPC client. Mainnet mint
`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` is the default on mainnet-beta;
on devnet set `EXPO_PUBLIC_SKR_MINT` to any 6-decimal test mint.

**Adaptive AI.** The AI's aim noise is a function of the run score and your
lifetime hit rate (kept in the store), so a sharp shooter faces a sharper
opponent (`enemyNoise` in `src/game3d/world.ts`). Offline, instant, no LLM.

## Ship to the Solana dApp Store

1. **Release signing key** (separate from any Play key; losing it means you
   can never update):
   ```bash
   mkdir -p dapp-store && keytool -genkey -v -keystore dapp-store/release.keystore \
     -alias bonkbow -keyalg RSA -keysize 2048 -validity 10000
   ```
   Upload it to EAS (`eas credentials -p android`) so the `dapp-store` profile
   signs with it. `dapp-store/*.keystore` and `*.json` are gitignored.
2. **Build the APK** from this machine: `npm run build:apk` (profile `dapp-store`,
   `buildType: apk`, `autoIncrement` bumps `versionCode`) or
   `bunx eas-cli workflow:run build-android.yml`. Never from a GitHub push: a
   checkout has no `assets/licensed/` (gitignored Unity models), while a local
   upload keeps them through `.easignore`.
3. **Publisher Portal**: create publisher + app, mint the App NFT, grab an API
   key. Needs a mainnet Solana keypair with a little SOL.
4. **Publish**: `npm run publish:dapp-store -- --apk-file ./app.apk --keypair ./dapp-store/publisher-keypair.json --whats-new "v1"`
5. Publish the app site: `site/` (landing page, `icon.png` for the wallet
   sheet, `/privacy`, `/terms`) goes to GitHub Pages through
   `.github/workflows/pages.yml` once Pages is enabled with source "GitHub
   Actions" (the repo must be public on a free plan). `DOMAIN` and
   `SUPPORT_URL` in `src/utils/legal.ts` and `APP_IDENTITY`
   (`src/solana/config.ts`) already point there. Then switch cluster + RPC to
   mainnet, set real prices and a real duel fee, and set
   `EXPO_PUBLIC_TREASURY_ADDRESS` to a wallet you control.

Docs: https://docs.solanamobile.com/dapp-store/publishing-cli ·
https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk

## Services setup

| Service | Steps |
|---|---|
| Solana | `EXPO_PUBLIC_TREASURY_ADDRESS` (receives shop payments and duel fees; empty = free duels, no shop). For mainnet also `EXPO_PUBLIC_SOLANA_CLUSTER`, `EXPO_PUBLIC_SOLANA_RPC_URL` (dedicated RPC), and `EXPO_PUBLIC_SKR_MINT` (devnet test mint; blank on mainnet). |
| Sentry | `EXPO_PUBLIC_SENTRY_DSN`; `eas secret:create --name SENTRY_AUTH_TOKEN`; project in app.json (`bonkbow`); set `SENTRY_ORG` to your org at build time. Every EAS profile sets `SENTRY_DISABLE_AUTO_UPLOAD=true` until a Sentry org exists. |
| PostHog | `EXPO_PUBLIC_POSTHOG_KEY`. Events: `game_started`, `game_over`, `skin_equipped`, `purchase_*`. |
| EAS | Project linked in `app.json`; set every `EXPO_PUBLIC_*` as an EAS env var (cloud builds don't read `.env.local`). OTA is configured (`updates.url`, channels `development` / `preview` / `production` in `eas.json`). |
| GitHub Pages | Settings → Pages → source "GitHub Actions"; the repo must be public on a free plan. `pages.yml` publishes `site/`. |
| GitHub Actions | repo secret `EXPO_TOKEN`, plus the API key read by the PR review workflow (see `.github/workflows/`). |

## Next steps toward submission

The live list, with what is done and what blocks the submission, is in
[docs/SUBMISSION.md](docs/SUBMISSION.md).
