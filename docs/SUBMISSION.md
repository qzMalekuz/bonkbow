# CLOCK IN submission checklist — Monolith

Deadline: **Oct 8 2026, 11:59 pm PT** (Oct 9 06:59 UTC). Finalize on Align a few
hours early; the lead's final submission locks the team and the entry. Facts
behind every item: [HACKATHON.md](./HACKATHON.md).

## Required artifacts (all four, or it's not a submission)

- [ ] **Android APK** — `npm run build:apk` (EAS profile `dapp-store`). Upload the
      `.apk` somewhere with a direct download link (GitHub Release works).
      Install it on a physical Android phone and play a full run before submitting.
- [ ] **GitHub repository** — public (or judges granted read access via Align's
      GitHub connect). Judges read the *commit history*: commit early and often,
      with messages that describe the work. A single "initial commit" reads as
      zero technical depth.
- [ ] **Demo video (~3 min)** — must show the app running **on a device**, not
      an emulator. Judges and the Align AI Coach read a **transcript**, so
      narrate everything on screen and upload with captions (YouTube auto-captions
      are the fallback). Script below.
- [ ] **Pitch deck** — 8–10 slides. Outline below.

## Technical requirements the judges verify

- [x] Android-only, produces a working APK.
- [x] **Solana Mobile Stack**: Mobile Wallet Adapter (`@wallet-ui/react-native-kit`)
      for connect, Sign in with Solana, `signMessage`, `sendTransaction`. On Seeker
      the wallet is Seed Vault, so keys never touch the app.
- [x] **Meaningful on-chain interaction**: skin purchases are SOL or SKR
      transfers signed in the wallet and verified server-side before unlocking.
- [x] **SKR integration** (bonus prize, 20% of the Align score): shop prices in
      SKR (≈20% under SOL), an SKR-only "Seeker" skin, live SKR balance from the
      wallet's token account. Server verifies the SPL transfer lands in a
      treasury-owned SKR account.
- [x] **AI** (20% of the Align score): adaptive AI opponent whose aim tightens
      with your lifetime hit rate, plus a rules-based post-run coach.
- [x] **Mobile-first**: Skia + Reanimated UI-thread rendering, slingshot gesture,
      haptics/vibration patterns, daily streak, portrait-only.
- [ ] Publish on the **Solana dApp Store** within 30 days of Nov 10 if we win
      (README → "Ship to the Solana dApp Store").

## Before building the submission APK

- [ ] `EXPO_PUBLIC_SOLANA_CLUSTER=mainnet-beta` + a dedicated RPC URL
      (Helius/Triton) as EAS env vars.
- [ ] `EXPO_PUBLIC_TREASURY_ADDRESS` = a wallet you control (hardware/Seed Vault).
- [ ] `EXPO_PUBLIC_SKR_MINT` empty on mainnet (defaults to the real mint) — or
      set to your devnet test mint for a devnet demo build.
- [ ] Supabase: `schema.sql` applied, Web3 Wallet provider on, anonymous sign-in
      on, `verify-purchase` + `delete-account` deployed, secrets
      `SOLANA_RPC_URL`, `TREASURY_ADDRESS`, `SKR_MINT` set.
- [ ] Real prices in `src/game/skins.ts` **and** `verify-purchase/index.ts`.
- [ ] Privacy + terms pages live at `https://monolith.bitwise.app/{privacy,terms}`
      (or change `src/utils/legal.ts` and `APP_IDENTITY.uri`).
- [ ] `npm run typecheck && npm run lint && npm run doctor` clean.

## Align form answers (draft)

**Does your application have an SKR integration? If so, how?**
Yes. SKR is the shop's native currency: every cosmetic can be bought in SKR at
~20% under its SOL price, the "Seeker" skin is SKR-only, and the shop shows the
player's live SKR balance read from their token account. Payments are
`TransferChecked` instructions pinned to the SKR mint, signed in the wallet via
Mobile Wallet Adapter, and verified on-chain by a Supabase edge function before
the skin unlocks — the client never grants itself anything.

**Prior VC / angel funding?** No. (Required for USDC eligibility — confirm.)

## Demo video script (≈3 min, narrate everything)

1. **0:00–0:20 Hook.** Seeker in hand. "Monolith is stickman archery for the
   Solana dApp Store. Your wallet is your account." Show the home screen.
2. **0:20–1:00 Core loop.** Play vs AI: draw, dotted arc, release, headshot,
   haptics callout. Point at the "ADAPTIVE AI · 62%" chip: "the AI aims as well
   as I do — it reads my lifetime hit rate."
3. **1:00–1:25 Coach.** Die on purpose. Read the coach tip aloud. Streak stat.
4. **1:25–2:10 Wallet + SKR.** Tap Sign in with wallet → Seed Vault sheet →
   Sign in with Solana. Open Shop: SKR balance, "Pay in SKR" toggle, buy the
   Seeker skin, approve in wallet, skin equips. Say: "the server verified that
   transfer on-chain before unlocking it."
5. **2:10–2:45 Multiplayer.** Create room, share code, second phone joins,
   two shots exchanged, "opponent left" forfeit.
6. **2:45–3:00 Close.** Leaderboard by wallet. "Expo, Skia, MWA, Supabase.
   Shipping to the dApp Store."

## Pitch deck outline

1. Title + one-liner + team.
2. Why mobile archery on Seeker: 60-second sessions, one-thumb play, crypto
   natives already hold SKR.
3. Product demo stills: play, shop, multiplayer.
4. Wallet = account (MWA + Sign in with Solana + Seed Vault).
5. SKR integration: pricing, SKR-only cosmetics, verified transfers.
6. Adaptive AI + coach (stickiness loop: streak, leaderboard, rematches).
7. Architecture diagram: RN/Skia → MWA → Solana; Supabase auth/realtime/edge.
8. Traction plan: dApp Store listing, SKR seasons, tournaments with SKR pots.
9. Roadmap + ask.
