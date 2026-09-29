# CLOCK IN — A Solana Mobile Hackathon (reference)

Compiled 2026-09-29 from the official site (https://solanamobile.radiant.nexus/, its JS bundle and
`align-api.radiant.nexus`), the Terms & Conditions PDF, the Solana Mobile blog post, and press coverage.
The T&Cs are the binding document; the site copy is a summary.

## Basics

| Item | Value |
|---|---|
| Name | Clock In — A Solana Mobile Hackathon |
| Organizer | Radiants DAO Ltd. (British Virgin Islands), in partnership with Solana Mobile |
| Official site / registration | https://solanamobile.radiant.nexus/ (redirect targets: solanamobile.com/hackathon, docs.solanamobile.com/hackathon) |
| Platform | Align (Radiants). On-chain hackathon address `H5jQCFppZBd6wq2XLpazBjJMeLAn1HJSmrT9PpTLM1kb` |
| Contact | hackathon@radiant.nexus |
| Discord | https://discord.gg/qGcWhr8WB (weekly technical workshops) |
| Terms / Privacy | https://solanamobile.radiant.nexus/legal/clock-in-terms.pdf, /legal/clock-in-privacy.pdf |
| Kickoff | Sep 9 2026, 11am ET, on "Shipped, the Solana Mobile Livestream" |
| Blog announcement | https://solanamobile.com/blog/clock-in-the-solana-mobile-hackathon |

## Timeline (from the Align API, UTC)

| Milestone | UTC | Pacific |
|---|---|---|
| Registration + submissions open | 2026-09-08 16:00 | Sep 8, 9:00am PT |
| **Submissions close** | **2026-10-09 06:59** | **Oct 8, 11:59pm PT** |
| Judging opens | 2026-10-10 07:00 | Oct 10 |
| Judging closes | 2026-11-09 07:59 | Nov 8/9 |
| Winners announced | Nov 10 2026 (site copy) | |
| Prize distribution | 2026-11-11 03:00 | Nov 10, 7pm PT |
| dApp Store publish deadline for winners | 30 calendar days after winners are announced (~Dec 10) | |

Register before the sign-up deadline (same as submission close) to be eligible to submit. No late entries.

## Prizes ($135k total: $125k USDC + $10k SKR)

| Place | Prize |
|---|---|
| 1st | $30,000 USDC + a Seeker device for each team member |
| 2nd | $25,000 USDC |
| 3rd | $20,000 USDC |
| 4th | $15,000 USDC |
| 5th | $10,000 USDC |
| 6th–10th | $5,000 USDC each |
| Best SKR integration (bonus, separate) | $10,000 in $SKR |

All winners also get: featured dApp Store placement ("over 100,000 eyeballs"), marketing and launch support
from official Solana Mobile channels, and a feedback call with Anatoly Yakovenko.

Note: CryptoBriefing's "10 × $10k + 5 × $5k" breakdown is the *previous* MONOLITH hackathon's structure and
is wrong for Clock In.

## Tracks

Single main competition, judged as one category ("Clock In Hackathon" track). Plus the bonus SKR
Integration prize. The submission form asks: "Does your application have an SKR integration? If so, how?"

## Judging

**Official criteria (T&Cs §8.1 and site), four equal 25% weights:**

1. **Stickiness & PMF** — resonates with the Seeker community, creates habits, drives daily engagement.
2. **User Experience** — intuitive, polished, enjoyable; quality of the mobile experience.
3. **Innovation / X-factor** — novel, creative, differentiated from existing products.
4. **Presentation & Demo Quality** — clarity of the idea; does the demo showcase the core concept.

What judges look at: completion (demo video), technical depth (GitHub commits), mobile-optimized UX and use
of mobile features, meaningful interaction with the Solana network, clarity and vision of the presentation.
Judges may weigh compliance with the mobile-specific requirements.

**Align platform "global scoring criteria" (returned by the API, used by the AI Coach / judge UI):**
AI 20, SKR Integration 20, UX 15, UI 15, Innovation 15, Ecosystem Impact 15. This conflicts with the T&Cs;
the T&Cs prevail legally, but AI and SKR usage are clearly emphasized by the organizers. Treat both as signals.

**Judges:** Anatoly Yakovenko (Co-founder, Solana Labs), Mert Mumtaz (CEO, Helius), Chase Barker
(Solana Foundation), Akshay Rajan (BD & Ecosystem, Solana Mobile), Beeman (Dev Marketing & Relations,
Solana Mobile), Voynich and A2nkF/Ilias (Security Researchers, Ethelsec).

Judges and the AI Coach read a **transcript** of the demo video, not the video itself (they use published
captions, then YouTube auto-captions, then audio transcription). Put the pitch in spoken words / captions.

Judging happens weeks after the deadline; GitHub read access must be granted before submitting.
Judging is based on commits up to the deadline.

## Submission requirements

All four are mandatory, submitted before the deadline via Align:

1. **Functional Android APK** — direct download link.
2. **GitHub repository** with source code (must be accessible to judges; connect GitHub on Align for read-only access; commit history is reviewed).
3. **Demo video** (~3 minutes) showing the app running on a device, not only a simulator. "A video nobody can install is not a submission."
4. **Pitch deck** or brief presentation.

Technical rules:
- Android only. Must integrate the **Solana Mobile Stack and Mobile Wallet Adapter** and interact meaningfully with the Solana network.
- Designed for mobile from the ground up. Direct web ports / PWA wrappers "will score poorly and are unlikely to win."
- Free of malware, lawful, no IP infringement.
- Submissions can be edited while in draft; once the lead completes the final submission agreement, they are locked and team membership is frozen.
- Draft submissions can run the **AI Coach** (0–100 score, once per 2 hours) and one free **security audit** of a public repo per team.

## Eligibility

- 18+ (or age of majority), able to contract, resident in an Eligible Country (list of ~160 countries in T&Cs §4.1; includes US, UK, India, Canada, EU, Australia, etc.). Excluded: Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk/Zaporizhzhia/Kherson and sanctioned persons.
- Solo or teams. Solo and teams are judged identically. Team composition is fixed at submission.
- **One submission per person/team.** Multiple submissions = forfeit. Can't join another team after submitting.
- **Project must have started no earlier than 3 months before launch** (i.e., after ~June 8 2026). Pre-existing projects allowed only with significant new mobile development during the hackathon.
- **Only teams without VC/angel funding (equity, SAFE, SAFT, token purchase, etc.) are eligible for USDC prizes.** Funded teams may still compete for non-USDC prizes.
- Previous winners may enter. You may compete in Colosseum simultaneously. Vibe-coding is allowed as long as the work is your own.
- No Seeker required to build/test: Android emulator or any Android device is fine.

## Winning conditions (post-announcement)

- Results are provisional until all conditions are met.
- **KYC/AML via Sumsub for every team member** on the fixed roster. One member failing can forfeit the whole team's prize.
- **Publish on the Solana dApp Store within 30 calendar days** of the winners announcement (submitting for review doesn't count).
- Technical review incl. code verification, APK checks, authorship verification and follow-up questions.
- Team designates a Team Representative and a Nominated Prize Wallet; one payment to that wallet discharges the organizer. Taxes are on the winners.
- IP stays with the team; organizer gets a non-exclusive license for judging/publicity. Submissions are not confidential.

## Resources linked from the site

- Solana Mobile docs: https://docs.solanamobile.com/get-started/overview
- Android quickstart: https://docs.solanamobile.com/android-native/quickstart
- Using MWA: https://docs.solanamobile.com/android-native/using_mobile_wallet_adapter
- MWA repo + integration guide: https://github.com/solana-mobile/mobile-wallet-adapter
- Tutorial apps: https://github.com/solana-mobile/tutorial-apps
- dApp Store publishing: https://docs.solanamobile.com/dapp-publishing/intro, portal https://publish.solanamobile.com
- Builder grants: https://solanamobile.com/grants
- Wallets: https://solanamobile.com/wallets (Phantom, Solflare), faucet https://faucet.solana.com
- Expo env setup is linked from the site's "Get started" guide, so Expo/RN is an expected path.

## Implications for Monolith

- Deadline is **Oct 8, 11:59pm PT** (Oct 9 06:59 UTC). Plan to finalize on Align a few hours earlier.
- Must ship: APK, public/accessible GitHub repo with a real commit history, ~3 min on-device demo video with captions, pitch deck.
- Add an **SKR integration** (e.g., accept SKR for skins, SKR rewards) to compete for the $10k bonus and the 20-weight platform criterion.
- Consider a visible **AI** element (e.g., the AI opponent is already a fit; surface it in the pitch) given the platform weights.
- Emphasize retention/stickiness (daily play, rooms, leaderboards) and mobile-native UX in the deck.
- Confirm no VC/angel funding, and be ready for Sumsub KYC and a dApp Store listing within 30 days of Nov 10.
