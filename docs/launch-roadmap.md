# Big Surf — launch & monetization roadmap

*2026-07-02. The master plan for "can this app generate side income, and what's the path?" Companion to [multigym-assessment.md](multigym-assessment.md) (the product/technical roadmap). This doc covers everything else.*

**Goal:** modest recurring side income; learning the process is a first-class outcome. **Positioning:** the tracker for people who train at more than one gym — per-gym equipment, GPS detection, travel-friendly. **Non-goal:** competing with Hevy on general tracking.

Each item is tagged with who does it: **[You]** (accounts, consoles, decisions), **[CC]** (Claude Code, in-repo), **[CW]** (Cowork — research, docs, review, browser).

---

## 1. Cost control & infrastructure safety — mostly done

- ✅ Per-user daily caps + `maxInstances` on the three Opus-calling functions (in code, needs deploy + verify) **[CC]**
- ✅ `errorLogs` rules tightened **[CC — deployed with next rules push]**
- ☐ Anthropic console: set a monthly spend limit on the API key — the only true hard cap in the stack **[You, 5 min]**
- ☐ Google Cloud: budget + alerts at 50/80/100% of ~$25/mo **[You, 5 min]**
- ☐ Later, before real users: billing kill-switch extension (auto-disable at threshold) **[You + CC]**
- Fixed costs to expect: Apple $99/yr, Google Play $25 once, domain ~$15/yr, Anthropic API usage (capped), Firebase (likely $0–20/mo at small scale)

## 2. Security & privacy hygiene

- ✅ Firestore rules audited — per-user scoping is solid
- ☐ Rotate the VAPID private key out of source into a secret (required before the repo is ever shared) **[CC]**
- ☐ In-app account deletion flow — deletes auth user + all Firestore subcollections + storage. **Apple requires this for App Store approval**; it's also the backbone of privacy compliance **[CC]**
- ☐ Data export ("download my data" JSON) — partially exists via data-export-import.js; confirm it covers everything **[CC]**
- ☐ Review what the AI Coach sends to the API (training data summaries are fine; make sure nothing identifying rides along) **[CW review]**

## 3. Legal & business formation

Don't over-build this before revenue. Sequence:

- ☐ **Privacy policy + Terms of Service** — needed at app-store submission, not before. Fitness/body data (weight, DEXA body composition) deserves plain, honest language. Generate with a reputable template service, then review. Host at a public URL **[CW draft → You review]**
- ☐ **"Not medical advice" disclaimer** in ToS + a line in the AI Coach UI **[CW + CC]**
- ☐ **Business entity:** start as sole proprietor (0 cost, fine for app-store income). Form an LLC when revenue is real or if the AI-coaching angle grows (liability surface) **[You, later]**
- ☐ **Tax note:** app-store payouts are self-employment income; keep a simple ledger from day one **[You]**
- ✅ **Name check** (2026-07-02, informational — not legal advice):
  - **App stores: clear.** No "Big Surf" fitness/workout app on the App Store or Google Play; nearest neighbors are surf-training apps (Surf Athlete etc.), a different niche.
  - **USPTO: the software/fitness lane is open.** Two live "BIG SURF" registrations exist — Inland Oceans, Inc. (Class 41, *water amusement park rides*; the defunct Tempe waterpark, mark live through May 2028) and Dehner Distillery (Class 33, spirits). Neither covers software. The only ever Class 9 software "BIG SURF" (Everi Games, slot machines) was **cancelled in 2021**, and a 1990s Class 42 mark is long dead. Practical risk of using the name: low. When revenue justifies it, file your own mark (Class 9 + 41 fitness-training + 42); the waterpark's Class 41 registration could get cited by an examiner despite the very different goods, so budget for an attorney response at that point.
  - **Domains:** nothing meaningful is hosted at bigsurf.app or bigsurf.com; functions code already uses support@bigsurf.app — confirm at your registrar whether you hold bigsurf.app; if not, register it (~$15/yr) before any public posting.
  - **SEO note:** Google results for "big surf" are waterpark nostalgia + surfing. Use the full name "Big Surf Workout Tracker" as the store listing title and in content so search intent disambiguates.
- GDPR/CCPA reality check: at solo scale, the practical requirements are the deletion flow (§2), the export, and an honest privacy policy. Full compliance programs come much later, if ever needed.

## 4. Product readiness (see multigym-assessment.md for detail)

The product roadmap is the other doc; the launch-blocking subset is:

- ✅ Tier 0/1/2 equipment-gym integrity + UX fixes (all shipped to dev 2026-07-02) **[CC]**

### Unified execution queue (decided 2026-07-02)

One queue across [ux-overhaul-plan-2026-07.md](ux-overhaul-plan-2026-07.md) and [tier3-implementation-plan.md](tier3-implementation-plan.md) — one phase per PR, dev-deploy gate each. Rationale: editor reaches canonical shape before badges land on it (UX-3 before T3-1); equipment-detail restructure and quick-edit sheet are adjacent (UX-4 → T3-7).

1. ✅ UX-0 backdrop unification (S) — shipped 2026-07-02; bare-backdrop check added to design audit
2. ✅ UX-3 day chips + editor ergonomics (S) — shipped 2026-07-02
3. ✅ T3-1 gym chip + badges + F1 (M) — shipped 2026-07-02
4. ✅ T3-2 picker fast paths + reverse matcher (M) — shipped 2026-07-02
5. ✅ T3-3 gym-aware replace + availability rows (M) — shipped 2026-07-02
6. ✅ T3-4 substitution sheet (M) — shipped 2026-07-02; rows preselect **Keep** per decision
7. ✅ T3-5 completion payoff (S) — shipped 2026-07-02
8. ☐ T3-6 machine settings memory (M)
9. ☐ UX-1 equipment-aware trends + chart axes (M)
10. ☐ UX-2 dashboard reorder (M)
11. ☐ UX-4 equipment detail restructure (L)
12. ☐ T3-7 equipment quick-edit sheet (M)
13. ☐ UX-5 + UX-6 fit-and-finish + docs (interleave as filler)

- ☐ **Offline support** — Firestore offline persistence. Gyms have bad signal; this is table stakes before charging **[CC]**
- ☐ Onboarding pass — a stranger's first 5 minutes, not yours. Test on someone who's never seen it **[You + CW critique]**
- ☐ The travel-mode flagship features (copy-from-gym, "what can I do here") — these are the *reason to pay*, so they precede monetization **[CC, mockups via CW first]**

## 5. App store (the technical path to distribution)

The app is a web app; stores are where fitness-app discovery happens. Plan:

- ☐ **Wrap with Capacitor** — your no-build vanilla JS stack is well suited. Keep the web/PWA version live (it's your dev/iterate surface) **[CC, the biggest single technical task in this doc]**
  - Watch items: Google sign-in inside a wrapped WebView needs the Capacitor auth plugin path; push notifications move from Web Push to native (your Cloud Functions already have a native-notification path started); GPS via Capacitor Geolocation plugin
- ☐ **Apple Developer account** ($99/yr) + **Google Play console** ($25) — register early, approvals can take days **[You]**
- ☐ **Apple requirements:** in-app account deletion (§2); privacy "nutrition label" questionnaire; Sign in with Apple is no longer mandatory alongside Google login, but consider adding it anyway (some iOS users won't use Google) 
- ☐ **Google Play gotcha:** personal dev accounts created after Nov 2023 must run a **closed test with 12 opted-in testers for 14 continuous days** before production access. Plan this as your beta (§7) — friends, gym buddies, r/BigSurf-equivalents. Start recruiting early; it's the long pole on the Android timeline **[You]**
- ☐ Store listing assets: screenshots (phone-frame, per-device sizes), short/long description written for ASO keywords ("multi gym workout tracker", "travel workout"), app icon already exists **[CW]**
- ☐ App review dry-run checklist before first submission (login demo account for reviewers, etc.) **[CW]**

## 6. Monetization & billing

- ☐ **Model decision (recommend):** freemium. Free = full logging (never cripple the core; that's the Hevy lesson). Pro ($2–3/mo or ~$30 lifetime) = the multi-gym magic: unlimited gyms, copy-from-gym, "what can I do here", AI coach, DEXA. Free tier caps at e.g. 2 gyms **[You decide, CW pressure-tests]**
- ☐ **RevenueCat** for store IAP/subscriptions (free tier covers you far past this goal; handles receipt validation + cross-platform entitlements) **[CC]**
- ☐ Feature-gating layer in app keyed off entitlement **[CC]**
- ☐ Grandfather your current users (you + friends) as free-forever Pro — cheap goodwill **[You]**
- Pricing sanity from market research: Hevy Pro $2.99/mo, Strong $4.99/mo, Fitbod $15.99/mo. Underprice the giants, don't race to zero.

## 7. Marketing & distribution (the actual bottleneck)

Budget most ongoing time here post-launch. No paid ads — organic only at this scale.

- ☐ **Positioning one-liner** everywhere: "The workout tracker that knows what's in your gym — all of them." **[CW]**
- ☐ **Landing page** (bigsurf.app?) — one page: promise, screenshots, store badges, privacy policy link **[CW/CC]**
- ☐ **Beta = Google's 12-tester requirement = first fans.** Recruit from friends, gym, and Reddit (r/workout, r/GYM weekly threads allow app feedback requests) **[You]**
- ☐ **Launch sequence:** dev-polish → closed beta (2–3 weeks, doubles as Play testing) → App Store + Play release → Reddit posts (the "I built a tracker for people with multiple gyms" indie-maker story does well when honest) → r/AppHype-style communities, Product Hunt optional **[You + CW drafts posts]**
- ☐ **ASO iteration:** monthly keyword/screenshot review once live **[CW, schedulable]**
- ☐ **Content flywheel (cheap, later):** short posts/videos on the travel-workout niche — "hotel gym survival," "how to program around whatever equipment exists" **[You + CW]**

## 8. Operations & support

- ☐ support@bigsurf.app (or alias) + a feedback button in-app (mailto is fine at first) **[You + CC]**
- ☐ Crash/error visibility: errorLogs collection already exists; add a weekly review habit **[CW — schedulable task]**
- ☐ Privacy-respecting analytics (e.g., simple event counts — signups, workouts logged, subscription events). Decide tool when wrapping with Capacitor **[CC]**
- ☐ Status habit: monthly "business health" review — spend, users, revenue, next bets **[CW — schedulable]**

## 9. Metrics & decision points

Keep it brutal and simple. Review monthly:

| Milestone | Signal | If missed |
|---|---|---|
| Beta (month 1–2) | 12+ testers actually logging workouts weekly | Product problem — fix before launch, don't launch into silence |
| Launch +3 months | 100+ installs, some organic (not just your posts) | Distribution problem — iterate ASO/messaging, not features |
| Launch +6 months | First paying subscribers; any conversion at all | Value problem — the Pro tier isn't compelling; revisit gating |
| Launch +12 months | ~$100+/mo recurring | Decision point: double down, coast, or archive with lessons learned |

Total cash at risk to the 12-month decision point: roughly **$150–500** plus your time. The time is the real investment; the money is genuinely small.

## 10. Suggested order of everything

1. **Now:** console spend caps (§1) · deploy + verify the code fixes · Tier 1 product fixes **[You + CC]**
2. **Next 4–6 weeks:** travel-mode features + offline (§4) · picker mockups → build · name check + privacy policy draft (§3) **[CC + CW]**
3. **Then:** Capacitor wrap (§5) · dev accounts · account deletion flow · RevenueCat scaffolding (§6)
4. **Then:** beta/closed test (§5+§7, same activity) · store assets · listing copy
5. **Launch:** stores + Reddit + landing page, then shift energy to §7 marketing loop and §9 monthly reviews
