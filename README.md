# Stickchers — Stickman Archery for the Solana dApp Store

Repo: https://github.com/qzMalekuz/stickchers

Turn-based stickman archery (Stickman Archer style) built with Expo / React
Native for the **CLOCK IN Solana Mobile hackathon**. Two modes — **vs AI** and
**multiplayer rooms** with shareable 6-letter codes — plus an **in-game shop**
of archer skins paid in SOL. The wallet **is** the account: Mobile Wallet
Adapter (MWA) authorizes, Sign in with Solana creates the Supabase session,
purchases are SOL transfers signed in the wallet and verified on-chain before
the skin unlocks.

Stack: React Native Skia (UI-thread rendering + fixed-step physics in
Reanimated worklets), `@wallet-ui/react-native-kit` + `@solana/kit` (MWA),
Supabase (auth, rooms, realtime, purchases, edge functions), PostHog, Sentry,
EAS Build/Update, from the Bitwise Expo boilerplate.

## Hackathon facts (verified 2026-09-29)

- Submissions close **Oct 8, 2026 23:59 PT** (2026-10-09 06:59 UTC). Winners Nov 10.
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

Play vs AI, haptics/vibration settings, local high score, skin preview. Wallet
connect works too (MWA only). Multiplayer, the shop's unlock step, and the
leaderboard need Supabase (below).

## Project layout

```
index.js / polyfill.js         entry: installs react-native-quick-crypto BEFORE any Solana import
src/app/
  index.tsx                    menu: Play vs AI · Multiplayer · Shop · Sign in with wallet
  game.tsx                     HUD + result sheet; /game?mode=ai | ?mode=online&code=&role=&seed=
  lobby.tsx                    create room (code + share) / join by code
  shop.tsx                     skins grid, pay in SOL or SKR, SKR balance, restore, equip
  leaderboard.tsx              global best runs by wallet, your best + day streak
  settings.tsx                 haptics + vibration toggles, sign out, legal, updates, delete account
src/game/
  GameCanvas.tsx               Skia scene, fixed-step (120 Hz) physics, pan gesture, AI + remote shots,
                               particles, screen shake, hit flashes, arrow trail, stuck arrows
  scenery.tsx / menu-backdrop  painted dusk backdrop (sky, sun, clouds, mountains, trees); animated menu scene
  stickman.ts / skins.ts       procedural stickman, hats, skin catalog with SOL + SKR prices (placeholders)
  aim.ts / rng.ts / constants  ballistics solver, adaptive AI noise, seeded layouts, tuning
  haptics.ts / store.ts        expo-haptics + Vibration; zustand persisted settings, streak, accuracy, owned skins
src/solana/
  config.ts                    cluster, RPC, app identity (wallet sheet), SKR mint + treasury
  auth.ts                      useWalletAuth: MWA authorize → Sign in with Solana → Supabase session
  skr.ts                       useSkrBalance (token account via kit RPC), SKR TransferChecked builder
  payments.ts                  buySkin (SOL or SKR) via MWA → verify-purchase; pending-purchase restore
  WalletButton.tsx             sign in / sign out
src/audio/
  sound.ts                     preloaded SFX pools, per-screen music crossfade, ducking, Settings toggles
  useScreenMusic.ts            plays a screen's track on focus
src/multiplayer/useRoom.ts     rooms table + Realtime channel (presence, shot/result/skin broadcasts)
supabase/
  schema.sql                   profiles, scores, leaderboard, purchases, rooms + join_room()
  functions/verify-purchase    checks the transfer on-chain, grants the skin (service role)
  functions/delete-account     account deletion
assets/audio/                  CC0 music + SFX (credits in CREDITS.md)
scripts/extract-unitypackage.sh  pull PNG/WAV out of a Unity .unitypackage into gitignored assets/licensed/
docs/ASSETS.md                 asset sources, licensing, and the Unity Asset Store workflow
.eas/workflows/                build the dApp Store APK on push to main
.github/workflows/             PR preview QR (EAS Update) + automated PR review
```

## How the pieces work

**Game loop.** Drag anywhere and pull back like a slingshot; a dotted arc
previews the shot; release fires. Headshot = 100, body = 50, both archers have
100 HP. All simulation runs on the UI thread in shared values with a fixed
1/120 s step; only discrete events cross to JS for haptics, HUD and the
multiplayer channel. `matter-js` is installed for a future ragdoll death.

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

**SKR integration.** SKR is the shop's native currency: ~20% under SOL prices,
an SKR-only "Seeker" skin, and a live balance read from the wallet's associated
token account through the MWA provider's `@solana/kit` RPC client. Mainnet
mint `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` is the default on
mainnet-beta; on devnet set `EXPO_PUBLIC_SKR_MINT` to any 6-decimal test mint.

**Adaptive AI + coach.** The AI's aim noise is a function of the run score and
your lifetime hit rate (decayed, in the store), so a sharp shooter faces a
sharper opponent — the HUD shows it as "ADAPTIVE AI · 62%". After each run a
rules-based coach reads the shot log (long vs short misses, accuracy) and gives
one concrete tip. Offline, instant, no LLM.

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
     -alias stickchers -keyalg RSA -keysize 2048 -validity 10000
   ```
   Upload it to EAS (`eas credentials -p android`) so the `dapp-store` profile
   signs with it. `dapp-store/*.keystore` and `*.json` are gitignored.
2. **Build the APK**: `npm run build:apk` (profile `dapp-store`, `buildType: apk`,
   `autoIncrement` bumps `versionCode`).
3. **Publisher Portal**: create publisher + app, mint the App NFT, grab an API
   key. Needs a mainnet Solana keypair with a little SOL.
4. **Publish**: `npm run publish:dapp-store -- --apk-file ./app.apk --keypair ./dapp-store/publisher-keypair.json --whats-new "v1"`
5. Publish `https://<domain>/privacy` and `/terms`; replace `{{DOMAIN}}` /
   `{{SUPPORT_EMAIL}}` in `src/utils/legal.ts`; host an icon at
   `APP_IDENTITY.uri` (`src/solana/config.ts`); switch cluster + RPC to
   mainnet; set real prices; set `TREASURY_ADDRESS` to a wallet you control.

Docs: https://docs.solanamobile.com/dapp-store/publishing-cli ·
https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk

## Services setup

| Service | Steps |
|---|---|
| Supabase | Create project → `EXPO_PUBLIC_SUPABASE_URL/KEY`. Run `supabase/schema.sql`. **Auth → Providers → enable Web3 Wallet**; add the app identity URL to allowed URLs. `supabase functions deploy verify-purchase delete-account`. `supabase secrets set SOLANA_RPC_URL=… TREASURY_ADDRESS=…`. |
| Solana | `EXPO_PUBLIC_SOLANA_CLUSTER`, `EXPO_PUBLIC_SOLANA_RPC_URL` (dedicated RPC for mainnet), `EXPO_PUBLIC_TREASURY_ADDRESS`, `EXPO_PUBLIC_SKR_MINT` (devnet test mint; blank on mainnet). Edge function secrets: `SOLANA_RPC_URL`, `TREASURY_ADDRESS`, `SKR_MINT`. |
| Sentry | `EXPO_PUBLIC_SENTRY_DSN`; `eas secret:create --name SENTRY_AUTH_TOKEN`; org/project in app.json (`bitwise` / `stickchers`). |
| PostHog | `EXPO_PUBLIC_POSTHOG_KEY`. Events: `game_started`, `game_over`, `skin_equipped`, `purchase_*`. |
| EAS | `eas init`; set every `EXPO_PUBLIC_*` as an EAS env var (cloud builds don't read `.env.local`); `eas update:configure` for OTA. |
| GitHub Actions | repo secret `EXPO_TOKEN`, plus the API key read by the PR review workflow (see `.github/workflows/`). |

## Next steps toward submission

- [x] Initial commit pushed to GitHub — keep committing in small, descriptive steps; judges grade commit history
- [ ] `eas init` + `eas update:configure` (adds `updates.url` / `extra.eas.projectId` to app.json — without them OTA and the CI `eas update` jobs are inert), first dev build, test MWA on a real device (Seeker if you have one)
- [ ] Supabase project + schema + Web3 provider + anonymous sign-in, then test SIWS, rooms, a devnet SOL and SKR purchase end to end
- [ ] Real icon, splash; host `favicon.ico` + privacy/terms at `stickchers.bitwise.app`
- [x] Sounds, per-screen music, UI clicks (CC0, `src/audio/`)
- [x] Scenery, particles, screen shake, bow-draw animation
- [ ] Ragdoll death via `matter-js`
- [ ] Rematch in online mode, room timeout handling
- [ ] Demo video + pitch deck ([docs/SUBMISSION.md](docs/SUBMISSION.md))
