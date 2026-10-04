# CLOCK IN submission checklist — Stickchers

Deadline: **Oct 8 2026, 11:59 pm PT** (Oct 9 06:59 UTC). Finalize on Align a few
hours early; the lead's final submission locks the team and the entry. Facts
behind every item: [HACKATHON.md](./HACKATHON.md).

## Blockers found in the 2026-10-05 audit

The wallet code is wired correctly (see below), but nothing it talks to is set
up yet. Until these are done a build signs in to nothing and sells nothing.

- [ ] **Supabase project.** None exists for Stickchers. Create it, apply
      `supabase/schema.sql`, enable Auth → Web3 Wallet and anonymous sign-in,
      add the app URL to the allowed URLs, deploy `verify-purchase` and
      `delete-account`, set secrets `SOLANA_RPC_URL`, `TREASURY_ADDRESS`,
      `SKR_MINT`.
- [ ] **Env vars.** There is no `.env.local` and no EAS env. Set
      `EXPO_PUBLIC_SUPABASE_URL/KEY`, `EXPO_PUBLIC_SOLANA_CLUSTER`,
      `EXPO_PUBLIC_SOLANA_RPC_URL`, `EXPO_PUBLIC_TREASURY_ADDRESS` (and
      `EXPO_PUBLIC_SKR_MINT` on devnet) locally **and** as EAS env vars.
      Without the treasury the shop says "Shop not configured"; without
      Supabase, sign-in is a bare wallet connect.
- [ ] **EAS project.** `app.json` has no `extra.eas.projectId`; run
      `eas init` before `npm run build:apk`.
- [ ] **App site.** The wallet-sheet identity, the SIWS domain
      (`src/solana/config.ts`) and the privacy/terms links
      (`src/utils/legal.ts`) point at `https://qzmalekuz.github.io/stickchers/`,
      which does not exist yet. Publish GitHub Pages for the repo with
      `favicon.ico`, `/privacy` and `/terms` (or change both files to another
      site we control), and add the URL to Supabase's allowed URLs.
- [ ] **GitHub.** The repo is private and `main` is 9 commits ahead of
      `origin`; the `3d-landscape` branch (the current game) is not pushed.
      Push, then either make the repo public or install the Radiants Align
      GitHub app on it before submitting. Judges only see commits pushed
      before the deadline.
- [ ] **End-to-end test on the phone** once the above exist: sign in with
      Solflare, buy one item in SOL and one in SKR on devnet, restore after
      reinstall, play one room between two phones.

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
      4.3 on `@solana-mobile/mobile-wallet-adapter-protocol` 2.3) for connect,
      Sign in with Solana, `signMessages` fallback and `sendTransactions`. The
      provider wraps the whole app (`src/app/_layout.tsx`); on Seeker the wallet
      is Seed Vault, so keys never touch the app.
- [x] **Meaningful on-chain interaction** (code): hero and map purchases are SOL
      or SKR transfers signed in the wallet and verified server-side before
      unlocking. Not yet exercised end to end: see blockers.
- [x] **SKR integration** (code; bonus prize): every hero and map has an SKR
      price (≈20% under SOL), live SKR balance from the wallet's token account,
      `TransferChecked` pinned to the SKR mint, server checks the transfer lands
      in a treasury-owned SKR account. A payment integration, not staking.
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
- [ ] Real prices in `src/game/skins.ts`, `src/game/maps.ts` **and**
      `verify-purchase/index.ts` (they match today: 0.1 SOL / 2000 SKR per
      hero, 0.05 SOL / 1000 SKR per map, all placeholders).
- [ ] The heroes are likenesses of real people (several are judges): get each
      person's OK, or be ready to swap them.
- [ ] `npm run typecheck && npm run lint && npm run doctor` clean.

## Align form answers (draft)

**Does your application have an SKR integration? If so, how?**
Yes. SKR is the shop's native currency: every hero and map can be bought in SKR
at ~20% under its SOL price, and the shop shows the player's live SKR balance
read from their token account. Payments are
`TransferChecked` instructions pinned to the SKR mint, signed in the wallet via
Mobile Wallet Adapter, and verified on-chain by a Supabase edge function before
the item unlocks — the client never grants itself anything.

**Prior VC / angel funding?** No. (Required for USDC eligibility — confirm.)

## Demo video script (≈3 min, narrate everything)

1. **0:00–0:20 Hook.** Seeker in hand. "Stickchers is stickman archery for the
   Solana dApp Store. Your wallet is your account." Show the home screen.
2. **0:20–1:00 Core loop.** Play vs AI: draw, dotted arc, release, headshot,
   haptics callout. Say: "the AI aims as well as I do — it reads my lifetime
   hit rate."
3. **1:00–1:25 Heroes and maps.** Style screen: spin a hero by touch. Streak stat.
4. **1:25–2:10 Wallet + SKR.** Tap Sign in with wallet → Seed Vault sheet →
   Sign in with Solana. Open Shop: SKR balance, "Pay in SKR" toggle, buy a
   hero, approve in wallet, hero equips. Say: "the server verified that
   transfer on-chain before unlocking it."
5. **2:10–2:45 Multiplayer.** Create room, share code, second phone joins,
   two shots exchanged, "opponent left" forfeit.
6. **2:45–3:00 Close.** Leaderboard by wallet. "Expo, three.js, MWA, Supabase.
   Shipping to the dApp Store."

## Pitch deck outline

1. Title + one-liner + team.
2. Why mobile archery on Seeker: 60-second sessions, one-thumb play, crypto
   natives already hold SKR.
3. Product demo stills: play, shop, multiplayer.
4. Wallet = account (MWA + Sign in with Solana + Seed Vault).
5. SKR integration: SKR pricing on every item, live balance, verified transfers.
6. Adaptive AI (stickiness loop: streak, leaderboard, rematches).
7. Architecture diagram: RN/three.js → MWA → Solana; Supabase auth/realtime/edge.
8. Traction plan: dApp Store listing, SKR seasons, tournaments with SKR pots.
9. Roadmap + ask.
