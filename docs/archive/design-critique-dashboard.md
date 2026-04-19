# Design Critique: Dashboard + Active Workout

**Stage:** Final polish &nbsp;·&nbsp; **Focus:** Usability & flow, visual hierarchy, consistency
**Reviewed:** `js/core/ui/dashboard-ui.js`, `js/core/workout/active-workout-ui.js`, `styles/pages/dashboard-v2.css`, `styles/pages/active-workout-v2.css`

---

# Part 1 — Dashboard

## Overall Impression

A well-organized health-style stack: greeting → active pill → 3-chip hero → insight → For Today → Training → Body → PRs. The structure works. The biggest opportunities are (1) the **dismissable insight** has a dangerous tap target, (2) the **body weight delta makes a values judgment** the app shouldn't be making, (3) the **two greens** (success vs. primary) compete, and (4) **inline-style violations** are scattered through the render functions.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Insight card dismisses on tap-anywhere.** `onclick="dismissInsight()"` is on the entire `.dash-insight`. A user trying to read or expand the insight kills it for the day with no undo. | 🔴 Critical | Add an explicit `×` button (32 px tap target) on the right; remove the card-level click handler. If insights ever become navigable, use the card click for that — never for dismissal. |
| **Body-weight delta encodes a goal direction the app never asked about.** Losing weight is shown in green (`up` class = success), gaining in red. A user *bulking* sees "↑ 2.0 lb" in red after a successful week. | 🔴 Critical | Either remove the color (just show ↑/↓ neutral), or add a `weightGoal: 'lose' \| 'gain' \| 'maintain'` setting and color accordingly. Default to neutral until set. |
| **Avatar circle is empty.** `.dash-greeting__avatar` has no initials, no FA user icon, no photo — just a circle that opens settings. Reads like a placeholder. | 🟡 Moderate | Show first initial of the user's display name on a colored background, OR use `fa-user` muted, OR drop the avatar entirely and put a settings icon in the top-right. |
| **Stale muscle groups are double-de-emphasized:** sorted to the bottom *and* dropped to `opacity: 0.55`. Reads as disabled — users may think they're not tappable. | 🟡 Moderate | Pick one signal. The `.stale-warn` line + sort order is enough; drop the opacity (or cap it at 0.8). |
| **"Most used" badge threshold is `count > 3`.** A user who's only logged 2 Tuesdays still has a "most-used" template — but no badge. The most-used template should always carry the label when ranked first. | 🟢 Minor | Show "Most used" when `isMostUsed && count >= 1`, or replace the badge with a subtle gold dot. |
| **Insight is dismissed *for the day*, not until next change.** A relevant deload-week insight could be killed by a tap and never resurface. | 🟢 Minor | Track `insightDismissedKey` (a hash of the insight content) so a *new* insight reappears even if today's was dismissed. |
| **"For Tuesday" → "All →" link** lands on the workout selector, not on a Tuesday-filtered list. The pre-filter context is lost. | 🟢 Minor | Pass `?day=tuesday` (or whatever your routing pattern is) so the destination opens already filtered. |

## Visual Hierarchy

- **What draws the eye first:** The streak chip — it's the only one with a gradient. Correct: streak = momentum, the most motivating number on the page.
- **What competes:** The body-weight chip with a colored delta (red/green) sometimes shouts louder than streak (especially when the delta is high). The deltas should not exceed the streak's visual weight.
- **Reading flow:** Top-down works (greeting → pill → chips → insight → today → training → body → PRs). Good "above the fold" priority.
- **Emphasis problems:**
  - **Body-part cards are dense** — icon + title + chev + 2-cell stats grid + sparkline + (optional) volume delta + (optional) stale warn. Six muscle cards at ~140 px each = ~840 px before scroll. The Training section dominates the page even though it's mid-stack.
  - **`bp-card__icon` at 26 px** is undersized relative to the icon's importance as a primary identifier. The active-workout `aw-hero__icon` at 44 px is the better proportion.
  - **`bp-cell__label` and `hero-chip__label` use `0.56rem`/`0.58rem`** (≈9 px). Below the practical readability threshold for labels.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Inline styles in JS | `renderHeroChipRow`, `renderTrainingSection`, `renderRecentPRs`, `renderCompositionCard`, `renderConnectPrompt` all use `style="..."` for color, margin-top, font-size. Direct violation of the CLAUDE.md rule. | Replace with utility classes (`.mt-section`, `.text-muted`, `.icon--warm`) or move into the V2 CSS file. |
| Hard-coded font sizes | `dashboard-v2.css` uses `0.56rem`, `0.58rem`, `0.62rem`, `0.74rem`, `0.82rem`, `0.95rem`, `1.25rem` instead of `var(--font-*)` tokens. | Map to existing tokens (`--font-2xs`, `--font-xs`, `--font-sm`, `--font-md`, `--font-lg`). If tokens don't cover the small label sizes, add them. |
| Two dashboards still loaded | `index.css` imports both `dashboard.css` (V1, ~30 kB) *and* `dashboard-v2.css`. V1 contains `streak-box`, `pr-item-new`, `in-progress-card` etc. that are no longer rendered. | Audit V1 selectors for "in use" status — most are likely dead. Move shared bits (`stats-section-header`, `view-more-link`) to a base file and delete V1 to halve the dashboard CSS payload. |
| Section headers | Composition section calls itself "Body" when data exists, "Composition" in the empty `connect-card` state. | Pick one label and stick with it across both states. |
| Reused `.bp-card__chev` | Used inside `.bw-card-head` (Body Weight card) and `.bc-card` (Body Composition). The naming says "this belongs to bp-card." | Rename to `.dash-chev` or extract a shared `.row-chev` utility. Class names should describe the element, not its origin. |
| Color tokens vs. hard RGBA | `.hero-chip--streak` uses literal `rgba(247, 168, 101, 0.15)` and `rgba(247, 168, 101, 0.25)` instead of a `--highlight-warm-bg` token. Same in `.ic-chest`/`.ic-back`/`.ic-legs` (push/pull/legs RGBA literals). | Replace with `color-mix(in srgb, var(--highlight-warm) 15%, transparent)` or named bg tokens (`--cat-push-bg` exists for shoulders/arms/core; add for chest/back/legs). |
| `rw-` (recommended workout) prefix | Opaque abbreviation. Could mean recent-workout, recommended, row-workout, ranked-workout. | Rename to `.dash-template-row` (or use the canonical `.row-card` per CLAUDE.md). |
| Weekday derivation | `renderForToday` computes `dayName` from a hand-coded array; the same week-day work could happen in one helper. | Centralize in `date-helpers.js`. |

## What Works Well

- **The 3-chip hero is the right pattern** — Streak / Week / Body weight is exactly the metric set a returning user wants at a glance.
- **Insight is dismissable per day** — small pieces of guidance that don't accumulate noise.
- **Training cards sort recently-trained → stale** — correct prioritization.
- **Sparklines per muscle group** add density without adding clutter.
- **"For Tuesday"** with day-of-week ranking is a delightful touch — turns the dashboard into a personal recommender.
- **Body composition card collapses to a `connect-card` empty state** when no data — proper progressive disclosure.
- **Active pill timer updates every 30 s** — minimal battery, still feels live.

---

# Part 2 — Active Workout

## Overall Impression

The wizard pattern (one exercise at a time, swipeable progress pills, sticky footer) is the right choice for the gym context — minimum scrolling, thumb-reachable controls, clear "what's next" CTA. The biggest issues are (1) **two greens that read as the same state** in the progress pills, (2) **the unit toggle is mis-labeled** (button shows the *other* unit), (3) **two kebab menus** on one screen, and (4) **hard-coded RGBA values** that bypass the design tokens.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Unit-toggle button shows the *opposite* unit.** `${unit === 'lbs' ? 'kg' : 'lbs'}` — so when active unit is lbs, button reads "kg." Users tap "kg" expecting it to confirm/highlight, and instead it switches *to* kg. Reverse-action label. | 🔴 Critical | Show the *active* unit in the button (so it reads "lbs" when lbs is active), and use a segmented control affordance (`lbs / kg` with one highlighted) so users see the toggle, not a guess. |
| **"Done" green vs. "Current" primary green look the same at a glance** in the pill row. Done sets are `rgba(success, 0.1)` background; current is solid `--primary` background — both green. From 60 cm away, hard to find your place. | 🔴 Critical | Make "current" pill use `--highlight-warm` (which is also your superset color — but you can pair: superset=outline-warm, current=fill-warm) so the active pill is unmistakably distinct. Or keep current as primary green and switch "done" to a check-only outline pill (no fill). |
| **Two kebab menus on one screen** (workout-level top-right + exercise-level inside hero) with overlapping options (cancel, summary, swap, equipment). Users can't predict which kebab does what. | 🟡 Moderate | Differentiate visually and semantically: workout kebab → all-workout actions (`fa-ellipsis-v`); exercise hero → use a labeled "Edit exercise" button or `fa-cog`, not another kebab. |
| **Back button is just a chevron with `awConfirmExit`.** Users may not realize it confirms — the icon implies a step-back, not a "leave workout?" decision. | 🟡 Moderate | Replace with an explicit `Pause` or `Exit` micro-label, or use `fa-times` (close) which more clearly implies "exit." A back chevron at the top-left of an active workout is ambiguous. |
| **Autofill hint banner is persistent** — every time the user revisits an exercise with prefilled values, the explanation shows. After the 5th workout, it's noise. | 🟡 Moderate | Show the hint only once per workout (or on first autofill experience), then suppress with `AppState.settings.autofillHintSeen`. |
| **Body-weight banner: chevron is primary-colored, the rest is muted.** The actionable surface (the whole banner) is gray. Users may not realize the banner is tappable. | 🟡 Moderate | Tint the entire `bw-banner--prompt` with `--primary-bg-subtle`, brighten the icon, and make "Tap to enter" copy primary-colored. The chevron alone doesn't carry the affordance. |
| **`.aw-sets-header__unit` toggle is `0.55 rem` (≈8.8 px) text inside a small button** — under WCAG AA size and a tough tap target. | 🟡 Moderate | Bump to `var(--font-2xs)` and 32-px min tap height. Or move the unit toggle into the exercise menu (out of the table). |
| **Notes textarea is `rows="1"` with no auto-grow JS** — long notes scroll inside a one-line box. | 🟢 Minor | Add an `oninput` auto-grow handler (set `style.height = scrollHeight + 'px'`), or render as a clearly tappable "Add note" button that opens a sheet. |
| **Pill row scrolls horizontally** without preview indicator (no fade or scrollbar). On 12-exercise workouts, you can't see the rest. | 🟢 Minor | Add a left/right gradient fade on `.aw-pills` to signal scrollability. |
| **Footer "All" button** is muted gray next to a bright primary "Next" button. Users may miss it. | 🟢 Minor | Add a subtle icon-only border or lift the contrast slightly (`bg-card-hi` instead of `bg-card`). |

## Visual Hierarchy

- **What draws the eye first:** The exercise hero title (`aw-hero__title`, font-xl, weight 800). Correct — that's the user's current focus.
- **What competes:** The rest-timer banner, when active, is a full-bleed gradient and outshines the hero. That's actually correct *during* rest (the user wants to see the countdown), but it stays prominent even after the timer hits 0 (until the 600 ms hide animation completes).
- **Reading flow:** Header → pills → (rest timer) → exercise icon+title → equipment → last session → set table → notes → footer. Strong, top-down, mobile-native.
- **Emphasis problems:**
  - **Header meta ("Exercise 3 of 7 · 22:14")** is muted/2xs. The elapsed time is the workout's heartbeat — promote it. Consider showing duration in larger type, with "Exercise 3/7" smaller below.
  - **Done set rows fade their inputs to `border: none; background: transparent;`** while active rows have boxed inputs. Good — completed values feel "settled," editable values feel "live."
  - **The "Add set" dashed button** sits at the same indent as the set rows, which is fine. But it's the same visual weight as the column labels above — slight over-emphasis for a secondary action.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Hard-coded RGBA tints | `aw-set-row.done` uses `rgba(54, 196, 107, 0.08)` and `0.2` directly. The `aw-hero__icon.tint-*` rules use literal `rgba(74, 144, 217, 0.15)` etc. for push/pull/legs/cardio/core — bypassing your `--cat-*` tokens. | Use `color-mix(in srgb, var(--success) 8%, transparent)` (or define `--success-bg-subtle`) and `var(--cat-push-bg)` etc. Centralize tints in `tokens.css`. |
| Inline `style="position: relative;"` on `.aw-body` | Violates "no inline styles in JS" rule. | Add `position: relative` to the `.aw-body` declaration in CSS. |
| Inline `style="color:..."` on chevron in BW banner | Same rule. | Use a class like `.bw-banner__chev` or extend `--primary` color via CSS. |
| Magic dark RGBAs in rest-timer | `rgba(4, 32, 26, 0.18)`, `rgba(4, 32, 26, 0.2)`, `rgba(4, 32, 26, 0.25)` — opaque dark color picked to layer over the green gradient. | Add a `--rest-timer-overlay` token (or use `color-mix(in srgb, var(--bg-app) 80%, transparent)`). |
| Two kebab icons | Both use `fa-ellipsis-v`. Same icon, different scope. | Differentiate per the usability note above. |
| `aw-` prefix is consistent ✓ | Strong namespacing for the V2 module. Good. | — |
| `.aw-bw-banner` vs `.bw-banner` | Two banner classes for the same concept. JS renders `.bw-banner` (per `renderBWBanner`); CSS only has `.aw-bw-banner`. **The styles never apply** unless there's a fallback declaration elsewhere. | Verify and rename one to match the other. Likely a bug — the banner is currently unstyled. |
| Border-radius drift | `aw-hero__icon` uses `12px`, `aw-set-row` uses `var(--radius-md)`, `aw-set-row__input` uses `8px`, `bw-banner` uses `10px`. Five different radii on one screen. | Pick from `--radius-sm/md/lg` and standardize. |
| Pill colors | `current` = `--primary` (green); `superset` border = `--highlight-warm` (orange); `superset.current` = `--highlight-warm` fill. Color jumps from green to orange on entering a superset. | OK — but document the rule: orange = superset context. Make sure there's no other use of `--highlight-warm` on this screen that would dilute that meaning. |
| Animations | `transition: all var(--anim-fast)` on `.aw-set-row` and other elements. `all` is expensive on mobile. | Specify properties: `transition: background var(--anim-fast), border-color var(--anim-fast)`. |

## What Works Well

- **One exercise at a time** is the right wizard pattern for the gym — minimal scrolling, thumb-friendly.
- **Sticky header + sticky footer** keeps the primary nav controls always reachable.
- **Set rows with inline rep / weight / check** put logging in a single horizontal swipe-and-tap motion. Excellent for between-set flow.
- **Autofill state (dashed border + muted text)** elegantly communicates "this is a guess — confirm or change." Strong final-polish detail.
- **Rest timer banner with `+30s` and `Skip`** covers the two real use cases without over-engineering.
- **Pill auto-scrolls into view** after each `renderAll` — small thing, big UX win.
- **Equipment line shows base weight inline** (`Hammer Strength · 45 lb bar`) — saves a drill-down.
- **Last-session card with summary** (`135×10 · 145×8 · 145×6`) is concise and immediately useful.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) used in inputs and the timer — keeps numbers steady. Disciplined.

---

# Cross-Page Priority Recommendations

Ranked by impact, low-effort first.

1. **Fix the unit-toggle label.** Show the *active* unit, not the inactive one. This is a 1-line fix that removes a daily papercut. (Active Workout)
2. **Differentiate "current" from "done" in the pill row.** They both read green. Either swap "current" to warm or convert "done" to a check-outline-only chip with no background fill. (Active Workout)
3. **Decouple weight delta color from a hidden goal direction.** Either show neutral, or ask the user once during onboarding ("Are you trying to lose, gain, or maintain?") and color accordingly. (Dashboard)
4. **Add an explicit dismiss `×` to the insight card.** Remove the card-level click handler. Accidental dismissal of guidance is worse than no guidance. (Dashboard)
5. **Verify `.bw-banner` styles exist.** JS renders `.bw-banner` but CSS defines `.aw-bw-banner`. The bodyweight banner may be currently unstyled. (Active Workout)
6. **Sweep inline styles** out of both render functions. CLAUDE.md is explicit. ~20 violations between the two pages. (Both)
7. **Replace hard-coded RGBA tints with tokens or `color-mix()`.** Two pages, ~15 tint literals. (Both)
8. **Audit `dashboard.css` (V1) for dead code.** `streak-box`, `pr-item-new`, `in-progress-card`, etc. likely unused — could halve the dashboard CSS payload. (Dashboard)
9. **Differentiate the two kebabs.** Workout-scope kebab + exercise-scope action button (icon + label, not another kebab). (Active Workout)
10. **Consolidate radii and font sizes.** `dashboard-v2.css` uses raw rem; `active-workout-v2.css` mixes `8px / 10px / 12px / radius-md`. Final-polish moment. (Both)

---

## Files Touched (for the fix pass)

- `js/core/ui/dashboard-ui.js` — sweep inline styles, fix delta color, add insight `×`, swap avatar
- `js/core/workout/active-workout-ui.js` — unit toggle label, kebab differentiation, autofill-once, `position: relative` to CSS
- `styles/pages/dashboard-v2.css` — token sweep, RGBA → color-mix, rename `bp-card__chev`, font tokens
- `styles/pages/active-workout-v2.css` — verify `bw-banner` selector, RGBA tokens, radius standardization, current/done pill colors
- `styles/pages/dashboard.css` — dead-code audit
- `styles/tokens.css` — add missing `--cat-*-bg` for chest/back/legs and `--success-bg-subtle`, `--rest-timer-overlay`
