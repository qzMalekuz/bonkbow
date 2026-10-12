# CLOCK IN submission checklist — Bonk Bow

Deadline: **Oct 12 2026** (extended from Oct 8, 11:59 pm PT). Finalize on Align a few
hours early; the lead's final submission locks the team and the entry. Facts
behind every item: [HACKATHON.md](./HACKATHON.md).

## The pitch

**Bonk Bow: stickman archery played by idiots. They have bows. That's about it.**

Two scrawled stickmen on facing cliffs take turns shooting each other. The
duel underneath is a real one: drag back like a slingshot, read the dotted
arc, release; fixed-step physics, hit zones, and an AI that adapts to how
well you shoot. The archers on top of it are useless: they eat the arrows, fire
straight up and bonk themselves, face the wrong way, celebrate before
anything lands, and notice they have been hit a moment late. Deadpan, dumb,
never mean. Winning feels like an accident you get to take credit for.

The wallet is the account (Mobile Wallet Adapter), each duel costs a small
SOL entry fee, and the shop sells derps, hats ("they do not help") and a
Shovel Bow that someone in the comments asked for, in SOL or SKR, checked
on-chain. The app is fully offline: no server, everything kept on the phone.

Judges read the repo and a **transcript** of the demo video: every joke has to
work as a sentence, so the narration describes what the archer is doing.

## Blockers

The app has no server any more: wallet connect, the duel fee, the shop and
restore all talk only to the wallet and the Solana RPC. What is left:

- [x] **Backend.** None needed. Purchases and duel fees are read back from
      the chain by the app and stored on the device.
- [ ] **Env vars.** None are required: the treasury is built into
      `src/solana/config.ts` (`EXPO_PUBLIC_TREASURY_ADDRESS` overrides it),
      so every build charges the duel fee and sells the shop. A mainnet build also needs `EXPO_PUBLIC_SOLANA_CLUSTER` +
      `EXPO_PUBLIC_SOLANA_RPC_URL` (unset means devnet), and
      `EXPO_PUBLIC_SKR_MINT` only for SKR on devnet (blank on mainnet).
- [ ] **EAS project.** The project behind `extra.eas.projectId` is still
      named `stickchers` on expo.dev while `app.json` says `bonkbow`, so every
      `eas` command (build, update, env, workflow) fails with "Slug … does
      not match". Rename it to `bonkbow` in the project's settings on
      expo.dev, then check `bunx eas-cli env:list`. OTA is configured. Builds are started from this machine
      (`bunx eas-cli workflow:run build-android.yml` or `npm run build:apk`),
      never from a GitHub push.
- [ ] **App site.** `site/` (landing page, `icon.png` for the wallet sheet,
      `/privacy`, `/terms`) is ready and `.github/workflows/pages.yml`
      publishes it to `https://qzmalekuz.github.io/bonkbow/`, which the app
      already points at. Enable Pages with source "GitHub Actions"; that needs
      the repo public (or a paid plan).
- [ ] **Hero images in git history.** Real-person likenesses are out of
      the tree (`docs/trailer/refs/` and `docs/trailer/rig/assets/gameplay/`
      were untracked and gitignored on 2026-10-13), but history still has
      them: `assets/faces/`, `assets/heroes/`, `scripts/heroes/`,
      `archer-boys.pdf`, `docs/trailer/rig/assets/heroes/`, `docs/trailer/refs/`,
      `docs/trailer/rig/assets/gameplay/` (and two local stashes). Scrub all of
      them (e.g. `git filter-repo --invert-paths --path …`) and force-push
      before the repo goes public.
- [ ] **GitHub.** `main` is pushed and current, but the repo is private.
      Make it public (after the scrub) or install the Radiants Align GitHub
      app on it before submitting. Judges only see commits pushed before the
      deadline.
- [ ] **Real prices and a real duel fee** before any mainnet build: shop
      prices in `src/game/skins.ts` / `src/game/maps.ts` and
      `DUEL_FEE_LAMPORTS` in `src/solana/config.ts` are placeholders.
- [ ] **End-to-end test on the phone**: connect Solflare, pay a duel fee,
      buy one item in SOL and one in SKR on devnet, reinstall and restore
      purchases from the chain.

## Required artifacts (all four, or it's not a submission)

- [ ] **Android APK** — `npm run build:apk` (EAS profile `dapp-store`). Upload the
      `.apk` somewhere with a direct download link (GitHub Release works).
      Install it on a physical Android phone and play a full run before submitting.
- [ ] **GitHub repository** — "a repository someone else can clone and run".
      Judges read the *commit history*.
- [ ] **Demo video (~3 min)** — must show the app running **on a device**, not
      an emulator. Judges and the Align AI Coach read a **transcript**, so
      narrate everything on screen and upload with captions (YouTube auto-captions
      are the fallback). Script below.
- [ ] **Pitch deck** — 8–10 slides. Outline below.

The Align form also asks for: what mobile development is new for the
hackathon, the SKR integration (staking integrations do not count), and prior
VC/angel funding. Keep secrets out of the submission text; Align rejects them.

## Technical requirements the judges verify

- [x] Android-only, built for mobile from the ground up (no web port).
- [x] **Solana Mobile Stack**: Mobile Wallet Adapter (`@wallet-ui/react-native-kit`
      4.3 on `@solana-mobile/mobile-wallet-adapter-protocol` 2.3) for connect
      and `sendTransactions` (Phantom, Solflare, Seed Vault). The provider
      wraps the whole app (`src/app/_layout.tsx`); on Seeker the wallet is Seed
      Vault, so keys never touch the app.
- [x] **Meaningful on-chain interaction** (code): every duel's SOL entry fee
      and every derp, hat, Shovel Bow and map purchase is a transfer to the
      treasury signed in the wallet, tagged with a `bonkbow:` memo. The app
      reads each transaction back from the chain (success, memo, amount to the
      treasury from the payer) before unlocking, and restores purchases on a
      new install from the wallet's on-chain history. Not yet exercised end to
      end: see blockers.
- [x] **SKR integration** (code; bonus prize): every derp, hat, bow and map has
      an SKR price (≈20% under SOL), live SKR balance from the wallet's token account,
      `TransferChecked` pinned to the SKR mint, and the app checks on-chain
      that the transfer reached the treasury before unlocking. A payment
      integration, not staking.
- [x] **AI**: adaptive AI opponent whose aim tightens with your lifetime hit
      rate (`enemyNoise`). There is no post-run coach and no HUD chip for it;
      don't claim either in the video or deck unless they are built.
- [x] **Mobile-first**: 3D on `expo-gl`, slingshot gesture, haptics patterns,
      daily streak, landscape-only, touch-spun characters.
- [ ] Publish on the **Solana dApp Store** within 30 days of Nov 10 if we win
      (README → "Ship to the Solana dApp Store").

## Before building the submission APK

- [ ] `EXPO_PUBLIC_SOLANA_CLUSTER=mainnet-beta` + a dedicated RPC URL
      (Helius/Triton) as EAS env vars — or a deliberate devnet demo build.
- [ ] `EXPO_PUBLIC_TREASURY_ADDRESS` = a wallet you control (hardware/Seed Vault).
- [ ] `EXPO_PUBLIC_SKR_MINT` empty on mainnet (defaults to the real mint) — or
      set to your devnet test mint for a devnet demo build.
- [ ] Real prices in `src/game/skins.ts` and `src/game/maps.ts` (all
      placeholders today: 0.05 SOL / 1000 SKR per derp, 0.02 SOL / 400 SKR
      per hat, 0.08 SOL / 1600 SKR for the Shovel Bow, 0.05 SOL / 1000 SKR per
      map) and a real `DUEL_FEE_LAMPORTS` (placeholder 0.01 SOL). Restore
      checks payments against these prices, so set them once and don't raise
      them later.
- [ ] `npm run typecheck && npm run lint && npm run doctor` clean.

## Align form answers (draft)

**Does your application have an SKR integration? If so, how?**
Yes. SKR is the shop's native currency: every archer, hat, bow and map can be
bought in SKR at ~20% under its SOL price, and the shop shows the player's live SKR balance
read from their token account. Payments are
`TransferChecked` instructions pinned to the SKR mint, signed in the wallet via
Mobile Wallet Adapter, tagged with a memo naming the item, and read back from
the chain (memo, amount, treasury, payer) before the item unlocks. A new
install restores purchases from the wallet's on-chain history.

**Prior VC / angel funding?** No. (Required for USDC eligibility — confirm.)

## Demo video script (≈3 min, narrate everything)

Deadpan delivery: say what happens, never explain the joke.

1. **0:00–0:20 Hook.** Seeker in hand, home screen. "This is Bonk Bow. It's
   stickman archery, played by idiots. They have bows. That's about it. Your
   wallet is your account."
2. **0:20–1:05 Core loop.** Play vs AI. "Drag back to aim, the dots show the
   arc, let go to fire." Land a hit: "That minus thirty-four came off his
   health bar. He'll notice in a second." (the "...ow." pops late). Let the
   rival shoot straight up: "He has shot straight up. It is coming back down.
   On him." (BONK). Mention the haptics. "The AI aims about as well as I do:
   it reads my lifetime hit rate."
3. **1:05–1:30 The archers.** Style screen, spin a derp by touch. "Gary.
   Accuracy no, confidence yes. Doug eats the arrows. Tall Steve has too much
   neck. Hats do not help. Nothing here changes a shot; the duel stays fair."
4. **1:30–2:10 Wallet + SKR.** Tap Sign in with wallet → Seed Vault sheet →
   connected. Open Shop: SKR balance, "Pay in SKR" toggle, buy the Shovel
   Bow, approve in wallet, it equips. "Someone in the comments asked for a
   shovel bow, so we added it. The app read that SKR transfer back from the
   chain before unlocking it."
5. **2:10–2:45 Entry fee.** Tap Play: the match screen asks for the duel's
   entry fee, approve it in the wallet, matchmaking starts. "Every duel costs
   a hundredth of a SOL. If the app dies after you paid, the fee carries over to
   the next one." Both archers low: "Sudden death."
6. **2:45–3:00 Close.** Best runs on this phone. "Bonk Bow. Expo, three.js,
   Mobile Wallet Adapter, Solana. No server. Shipping to the dApp Store."

## Pitch deck outline

1. Title: **Bonk Bow**, "They have bows. That's about it.", team.
2. The idea: a real archery duel performed by archers who are bad at it.
   Stills from the launch videos.
3. Why mobile and Seeker: 60-second turns, one thumb, clips people share,
   crypto natives already hold SKR.
4. Product: play vs the AI, comedy beats (bonk, "...ow.", early cheer), duel
   entry fee, shop.
5. Wallet = account (MWA + Seed Vault).
6. SKR integration: SKR price on every item, live balance, verified transfers.
7. Adaptive AI + stickiness loop: streak, best runs, rematches, new derps and
   hats as drops.
8. Architecture: RN/three.js fixed-step sim → MWA → Solana; payments read
   back from the chain, everything else on the device. No server.
9. Community: the Shovel Bow came from a comment on the launch video; more
   derps and hats the same way. dApp Store listing, SKR seasons.
10. Roadmap + ask.
