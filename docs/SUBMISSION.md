# CLOCK IN submission checklist — Bonk Bow

Deadline: **Oct 12 2026** (extended from Oct 8, 11:59 pm PT). Finalize on Align a few
hours early; the lead's final submission locks the team and the entry. Facts
behind every item: [HACKATHON.md](./HACKATHON.md).

## The pitch

**Bonk Bow: stickman archery played by idiots. They have bows. That's about it.**

Two scrawled stickmen on facing cliffs take turns shooting each other. The
duel underneath is a real one: drag back like a slingshot, read the dotted
arc, release; fixed-step physics, hit zones, shields, an AI that adapts to
how well you shoot, and online rooms where both phones run the same
simulation. The archers on top of it are useless: they eat the arrows, fire
straight up and bonk themselves, face the wrong way, celebrate before
anything lands, and notice they have been hit a moment late. Deadpan, dumb,
never mean. Winning feels like an accident you get to take credit for.

The wallet is the account (Mobile Wallet Adapter + Sign in with Solana), and
the shop sells derps, hats ("they do not help") and a Shovel Bow that
someone in the comments asked for, in SOL or SKR, verified on-chain.

Judges read the repo and a **transcript** of the demo video: every joke has to
work as a sentence, so the narration describes what the archer is doing.

## Blockers found in the 2026-10-05 audit

The wallet code is wired correctly (see below), but nothing it talks to is set
up yet. Until these are done a build signs in to nothing and sells nothing.

- [ ] **Supabase project.** None exists for Bonk Bow, and creating one was
      refused on 2026-10-05: the account is at Supabase's limit of two active
      free projects. Free a slot or use a paid org, then create it, apply
      `supabase/schema.sql`, enable Auth → Web3 Wallet and anonymous sign-in,
      add the app URL to the allowed URLs, deploy `verify-purchase` and
      `delete-account`, set secrets `SOLANA_RPC_URL`, `TREASURY_ADDRESS`,
      `SKR_MINT`.
- [ ] **Env vars.** `EXPO_PUBLIC_TREASURY_ADDRESS` is set in EAS (all
      environments) and in `.env.local`. Still missing in both:
      `EXPO_PUBLIC_SUPABASE_URL/KEY`, and for a mainnet build
      `EXPO_PUBLIC_SOLANA_CLUSTER` + `EXPO_PUBLIC_SOLANA_RPC_URL` (unset means
      devnet; `EXPO_PUBLIC_SKR_MINT` is needed for SKR on devnet). Without
      Supabase, sign-in is a bare wallet connect.
- [x] **EAS project.** `@qzmalekuz/bonkbow`, linked in `app.json`.
- [ ] **App site.** The wallet-sheet identity, the SIWS domain
      (`src/solana/config.ts`) and the privacy/terms links
      (`src/utils/legal.ts`) point at `https://qzmalekuz.github.io/bonkbow/`,
      which does not exist yet. Publish GitHub Pages for the repo with
      `favicon.ico`, `/privacy` and `/terms` (or change both files to another
      site we control), and add the URL to Supabase's allowed URLs.
- [ ] **GitHub.** `main` is pushed and current, but the repo is private.
      Make it public or install the Radiants Align GitHub app on it before
      submitting. Judges only see commits pushed before the deadline.
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
- [x] **Meaningful on-chain interaction** (code): derp, hat, Shovel Bow and map
      purchases are SOL or SKR transfers signed in the wallet and verified server-side before
      unlocking. Not yet exercised end to end: see blockers.
- [x] **SKR integration** (code; bonus prize): every derp, hat, bow and map has
      an SKR price (≈20% under SOL), live SKR balance from the wallet's token account,
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
      `verify-purchase/index.ts` (they match today, all placeholders:
      0.05 SOL / 1000 SKR per derp, 0.02 SOL / 400 SKR per hat,
      0.08 SOL / 1600 SKR for the Shovel Bow, 0.05 SOL / 1000 SKR per map).
- [ ] `npm run typecheck && npm run lint && npm run doctor` clean.

## Align form answers (draft)

**Does your application have an SKR integration? If so, how?**
Yes. SKR is the shop's native currency: every archer, hat, bow and map can be
bought in SKR at ~20% under its SOL price, and the shop shows the player's live SKR balance
read from their token account. Payments are
`TransferChecked` instructions pinned to the SKR mint, signed in the wallet via
Mobile Wallet Adapter, and verified on-chain by a Supabase edge function before
the item unlocks — the client never grants itself anything.

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
   Sign in with Solana. Open Shop: SKR balance, "Pay in SKR" toggle, buy the
   Shovel Bow, approve in wallet, it equips. "Someone in the comments asked
   for a shovel bow, so we added it. The server verified that SKR transfer
   on-chain before unlocking it."
5. **2:10–2:45 Multiplayer.** Create room, share code, second phone joins, two
   shots exchanged, both low: "Sudden death. Both phones run the same
   simulation, so they agree on every bonk." "Opponent left" forfeit.
6. **2:45–3:00 Close.** Leaderboard by wallet. "Bonk Bow. Expo, three.js,
   Mobile Wallet Adapter, Supabase. Shipping to the dApp Store."

## Pitch deck outline

1. Title: **Bonk Bow**, "They have bows. That's about it.", team.
2. The idea: a real archery duel performed by archers who are bad at it.
   Stills from the launch videos.
3. Why mobile and Seeker: 60-second turns, one thumb, clips people share,
   crypto natives already hold SKR.
4. Product: play, comedy beats (bonk, "...ow.", early cheer), shop, rooms.
5. Wallet = account (MWA + Sign in with Solana + Seed Vault).
6. SKR integration: SKR price on every item, live balance, verified transfers.
7. Adaptive AI + stickiness loop: streak, leaderboard, rematches, new derps and
   hats as drops.
8. Architecture: RN/three.js fixed-step sim → MWA → Solana; Supabase
   auth/realtime/edge.
9. Community: the Shovel Bow came from a comment on the launch video; more
   derps and hats the same way. dApp Store listing, SKR seasons.
10. Roadmap + ask.
