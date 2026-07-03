# Traveler flow — Tier 3 design

*2026-07-02 — workflow narrative + design decisions for 3.1 (planner UI), 3.2 (machine settings memory), 3.3 (travel-mode framing). Companion mockup: [mockups/traveler-journey.html](../mockups/traveler-journey.html).*

The promise we're building toward: **"Log a hotel gym in 2 minutes, keep your program on the road."** Tiers 0–2 made the data layer honest and the stocking flow fast. Tier 3 is where the app *gives something back* for that data: it tells you what you can do here, and it remembers how you set up every machine.

---

## The journey, end to end

Persona: multi-gym user lands in Austin for a 3-day work trip, walks into the Marriott's small gym Monday morning. Chest day per program.

### Step 1 — Arrival (shipped, Tier 2.4 + 2.1)
Opens app → GPS finds no saved gym within radius → gym-picker sheet ("Couldn't find you — pick your gym") with **New gym** escape hatch → names it "Marriott Austin". Gym-detail empty state offers **Add from catalog** / **Copy from another gym**.

### Step 2 — Stock the gym in ~2 minutes (shipped, Tier 0)
Quick-adds 6 machines from the catalog search. Each add promotes to an equipment doc, gym-tags it, infers `exerciseTypes` via the machine-name matcher. This is the input the planner has been waiting for.

### Step 3 — "What can I do here?" ← NEW (3.1)
Goes to the Workouts page. Because a session gym is known, each workout card carries a **compatibility badge**:

- **Fully compatible** → green check chip: `✓ Possible here`
- **Partially compatible** → warm chip: `4 of 6 here`
- **No positive evidence** → neutral chip: `Not mapped here yet` — no dimming, no hard negative (see D6)

A **gym context chip** sits above the list (`At Marriott Austin ▾`) — tap to switch gym or clear. A `Possible here` filter pill joins the category pills.

Expanding a partially-compatible card shows per-exercise availability as **glanceable status only — no buttons, no actions** (Kevin's call: soliciting fixes in the browse context makes every glance feel like homework). Available exercises render normally; unmapped ones dim slightly with a quiet `Not mapped` trailing label (never "no X here" — that claims an absence, see D6), plus one footer line: `2 not mapped — pick machines or swaps when you start. Asked once, remembered.` "Not mapped" simply means this gym hasn't encountered the exercise yet — it is *not* a re-ask of anything the user answered (D10 removes skipped exercises from this view entirely). Resolution lives in exactly two active moments: the start sheet (Step 4, one-time per D10) and the mid-workout picker (F2).

### Step 4 — Start with substitutions ← NEW (3.1)
Starting a partial workout raises a sheet: `2 exercises aren't mapped at Marriott Austin` with per-exercise choices in priority order — **Machine** (point at equipment here; links it and resolves the row), **Swap** (gym-filtered exercise picker), or **Skip today** — plus `Keep them anyway` (maybe the badge is wrong; never block the user). Machine links persist (they heal the gym map); swaps/skips apply to the session only and never mutate the template — but they're **remembered per gym and pre-filled next visit** (D10), so the sheet degrades to a one-tap `Start workout` instead of re-asking.

### Step 5 — Work out; machines remember you ← NEW (3.2)
On each exercise, the equipment line grows a **settings chip row**: `Seat 4 · Pin 13 · Handles narrow`. First time on a machine, the row shows a ghost chip `+ Note settings`; tapping opens a bottom sheet with quick fields (seat, pad, pin/weight, grip, free-text). Saved per **equipment doc + exercise name** — since equipment identity is per-gym, "Seat 4" on the Marriott iso-press never collides with the home gym's.

Settings show read-only at set time (one tap to edit). No prompts, no required fields — this feature only exists for people who want it, and it must cost zero taps to ignore.

### Step 6 — Return home (nothing to do)
Home gym auto-detected → every workout is `✓ Possible here` → badges collapse to nothing (see decision below). Home machine settings unchanged. The travel gym persists for the next trip.

---

## The first visit — workout-first (this is also new-user onboarding)

The journey above assumes Step 2 happened: someone deliberately stocked the gym before working out. That's **library-first**, and it's not how a first visit actually goes. It's leg day, you walk into the Marriott gym, and the question is "where do I squat?" — not "time to catalog this room." The gym should get mapped **as a byproduct of doing the workout**, not as a prerequisite.

And this is bigger than travel: **until the community gym DB (Phase 19) exists, every brand-new user's home gym is an unmapped gym.** The first-visit flow *is* new-user activation. A new user who signs up, starts their usual workout, and hits dead ends at every exercise churns before the multi-gym magic ever gets a chance to matter. Same code paths, much bigger audience.

Most of the plumbing already exists (mid-workout catalog add, auto-associate, gym-tagging, the matcher). What's missing is connective tissue at four moments:

### F1 — Don't lie about availability at an unmapped gym
`categorizeTemplates` at a gym with zero equipment marks *everything* "Not possible here" — leg day looks impossible when the truth is "unknown." When a gym has fewer than ~3 mapped machines, badges switch to a neutral state: a single banner (`New gym — start a workout and it'll get mapped as you go`) and **no** per-card badges. False negatives at the exact moment of first impression are the worst possible bug.

### F2 — The empty picker should suggest, not shrug (escape hatches first)
Mid-workout, exercise = Leg Press, gym has nothing mapped. Today the picker shows empty sections plus "Add from catalog" (a generic search). The new sheet, top to bottom:

1. **Fast paths first** (per D0 — the lowest-friction option gets the best real estate). Three levels of caring:
   - `Skip equipment` — proceed with no equipment, **permanently for this exercise** (D10): the equipment expectation is cleared, all availability surfaces go quiet for it everywhere, toast with undo. No doc created, nothing to maintain, never asked again.
   - `Free weights` — one tap reveals `Dumbbells` / `Barbell` (one extra tap for this path only — the split matters because PRs are segmented per exercise+equipment, and a 100 lb dumbbell press is not a 100 lb barbell press).
   - `Cable machine` — creates a generic gym-tagged `Cable machine` equipment doc (type Cable, no brand, no catalog ref). Most people don't care which cable stack it was; renameable later via quick-edit (F5) if they ever do.
2. **Catalog search.**
3. **Matches for [exercise]** — the machine matcher run **in reverse** (exercise name → likely catalog machines) as one-tap add rows. One tap = created, gym-tagged, exercise-linked, selected (the Tier 0.3 pipeline, already built).
4. **Browse full catalog** link.

Burying the simple options under the clever ones would punish exactly the users D0 protects.

### F3 — Replace exercise should be gym-aware
`awReplaceExercise` currently opens the full exercise library (~everything, unfiltered). When the gym genuinely can't do an exercise (no squat rack at the Marriott), replace should lead with **"Possible at this gym"** — same body part first — fed by `rankExercisesForLocation` over whatever's been mapped so far, with the full library one tap below. This is the planner's best data, currently unwired at its most useful moment.

### F4 — Pay off the mapping at completion
The user just did invisible work. Completion summary gets one line: `You mapped 5 machines at Marriott Austin — next time you'll see what's possible before you start.` That sentence teaches the whole feature loop for free.

### F5 — Equipment quick-edit sheet (the "editing is a pain" fix)
The equipment detail view is a full-page form (name, brand picker, line, function, type, links, gyms) — right for deliberate curation, wrong for "fix this machine's name" or "this machine also does rows" mid-flow. Add a quick-edit bottom sheet reachable from anywhere a machine appears (picker row ⋯, gym detail, workout equipment line): rename, exercise-link chips (add/remove), gym tags, and a `Full details` escape to the big form. 80% of edits, 20% of the navigation.

---

## Design decisions

### D0 — Equipment is enrichment, never a gate
Not every user cares about equipment; plenty just want to log `Bench Press 3×10 @ 135` and go. The entire equipment/location system must be **invisible until engaged with**:

- Logging sets never requires equipment. `Choose equipment` stays a passive line, not a blocker; every sheet in this doc opens only on a user tap.
- **If the user has zero equipment docs, the availability system is silent** — no gym chip nagging, no banners, no `Not mapped yet` chips on every card (which would read as a to-do list they never signed up for). First engagement anywhere (one machine added, one gym mapped) turns it on.
- The F1 banner appears once per gym and is dismissible.
- Settings memory is a ghost chip, not a prompt (Step 5).

The wedge users self-select into the depth; stats-only users should never learn the system exists. This principle outranks every other decision below — when a flow can either prompt or stay quiet, it stays quiet.

### D1 — Where does the pre-workout gym come from?
Compatibility needs a location *before* a workout starts, but GPS detection currently runs at workout start. Decision: the Workouts page runs the same `detectLocation` → nearest-saved-gym match on view entry (cached per app session), rendered as the gym context chip. Manual override via the chip. If no GPS and no pick, chip reads `Set gym for availability` and no badges render — the page works exactly as today.

### D2 — Badges only when they carry information
At your primary gym everything is possible; a page of green checks is noise. Decision: **fully-compatible badges are suppressed when every visible workout is fully compatible.** The moment at least one workout is partial or unmapped (i.e., you're somewhere interesting), all badges render, including the green ones — the contrast is the message. This makes travel mode *emergent* rather than a toggle.

### D3 — Never block on a badge
`exerciseTypes` inference is conservative and will have holes. Badges are advisory: incompatible workouts stay startable, the substitution sheet always has `Keep them anyway`, and starting an "unavailable" exercise then picking equipment auto-associates and self-heals the mapping (existing behavior). The badge should earn trust by being right, not by being enforced.

### D4 — Settings memory is structured-lite
Not free-text (can't render chips, can't scan at a glance), not a rigid schema (machines vary wildly). Decision: per equipment-doc, per exercise-name, an ordered list of `{label, value}` pairs with suggested labels (Seat, Pad, Pin, Grip) plus custom. Stored on the equipment doc:

```
equipment/{id}.exerciseSettings: {
  "Bench Press": [ {label: "Seat", value: "4"}, {label: "Grip", value: "narrow"} ]
}
```

Existing `notes` field stays as-is (general notes about the machine); settings are per-exercise.

### D5 — Session substitutions don't touch templates
Swap/skip at start-time modifies the in-flight workout only. If the user wants a permanent "travel variant," that's what Duplicate is for. (Auto-offering "save as Marriott Austin variant?" after the workout is a candidate follow-up, not v1.)

### D6 — Evidence per workout, never a hard negative (v1)
The killer case: two days at the Marriott doing legs and back, return next month for chest. The gym now has 8 mapped machines, so any gym-level "is this gym explored?" threshold passes — and Chest & Triceps would badge `Not possible here` about a room the app has only seen the leg-and-back half of. A false negative that sneaks back a month later.

The fix: explored-ness is **per-workout evidence**, not a gym-level threshold.

- **Positive counts are always safe**: `✓ Possible here` and `4 of 6 here` only ever claim what mapped equipment supports.
- **Zero matches never claims impossibility**: the badge reads `Not mapped here yet` (or `Chest not mapped here yet`) — neutral, no dimming, an invitation. Starting it drops into the F2 flow, where last visit's machines already populate the picker's "At this gym" section (the multi-station mapped for pulldowns is right there for chest day).
- **Hard `Not possible here` doesn't exist in v1.** The genuinely cable-free hotel gym reads "not mapped" forever — acceptable cost. Candidates for earning true negatives later: a user-set "that's everything here" toggle per gym, or broad body-part coverage heuristics. Not now.

F1's zero-equipment banner is just the degenerate case of this rule: no positive evidence for *anything* → one banner instead of a page of identical neutral chips.

The payoff loop compounds across visits: completion says `You mapped 4 more machines at Marriott Austin — 12 total`, and the gym gets explored body-part by body-part, which is how anyone actually learns a gym.

### D7 — Reverse matching is suggestions, not truth
Exercise→machine suggestions (F2) reuse `machine-exercise-matcher.js` logic in reverse against the catalog. Same conservative posture as the forward direction: suggestions are ranked candidates the user confirms with a tap, never auto-added. A bad suggestion costs a glance; a silent wrong add pollutes the gym map.

### D8 — Replace is a re-skin, not a new flow
Gym-aware replace (F3) is the shared add-exercise sheet with a "Possible at this gym" section on top — not a new picker. Same `onSelect` contract, same sheet, one extra section renderer. Keeps the two-picker problem from coming back.

### D9 — Fix the map before changing the plan
"Missing" almost never means the gym can't do the exercise — it means **no machine is linked to it yet**. Generic equipment (multi-stations, cable stacks, dumbbells, an adjustable bench) covers a huge share of exercises, so the most common resolution is one tap: point at the machine, the link is created (auto-associate, existing behavior), the badge flips, and every future visit benefits. Therefore, everywhere a missing exercise is *actionable* (the substitution sheet and the mid-workout picker — the expanded card is status-only per Step 3), **Pick machine is the primary action and Swap exercise is the fallback** — never the other way around. Swapping first would train users that the app second-guesses their program whenever its map has a hole it could have fixed instead.

### D10 — Never ask twice (skip is remembered)
The failure mode that kills this whole feature: "every time I work out I have to do this equipment thing." Skipping must be a remembered answer, not a dismissal that resets next session. Two mechanics:

- **`Skip equipment` (picker fast path) is permanent per exercise.** It doesn't just close the sheet — it records that this exercise doesn't track equipment (clear the equipment expectation on the template exercise; equipment-less exercises are already always-available in `checkTemplateCompatibility`). Every nag surface — badges, expanded-card missing rows, the substitution sheet — goes quiet for that exercise, at every gym, immediately. Toast with undo: `Won't ask about equipment for Cable Fly again` + `Undo`. Transparent, reversible, one-time.
- **The substitution sheet pre-fills from last time.** Per-gym resolutions are remembered: a machine link is permanent anyway; a swap/skip choice pre-selects itself on the next visit so the sheet is a one-tap `Start workout`, not a fresh interrogation. Exercises resolved by a machine link don't reappear at all.

Re-engagement is symmetric and passive: the `Choose equipment` line during a workout never went away (it's a passive line per D0) — picking equipment there turns tracking back on for that exercise. No settings page, no mode.

Corollary: a user who skips everything converges to templates with no equipment expectations — at which point the availability system has nothing to say and effectively disappears for them, which is exactly D0's intent arrived at from the other direction.

---

## Build notes

- **3.1 data is free.** `categorizeTemplates` / `checkTemplateCompatibility` / `rankExercisesForLocation` are pure, tested, and unused. The work is: gym-context resolution on the Workouts page, badge rendering in the selector rows, filter pill, expanded-row availability treatment, substitution sheet.
- **3.2 data layer:** `exerciseSettings` map on equipment docs + save path in firebase-workout-manager; UI is a chip row on `aw-equip-line` + one bottom sheet (standard `aw-sheet` pattern). Display in the picker too (`Seat 4` sub-line) — cheap and reinforces the value.
- **First-visit work (F1–F5):** F1 (unknown state) is a guard clause inside the 3.1 badge renderer — ship them together, never separately (badges without F1 actively harm first impressions). F2 needs the reverse matcher (new pure module, testable like the forward one). F3 is a section added to the shared add-exercise sheet. F4 is one line in the completion summary. F5 is a standalone `aw-sheet` + save paths that already exist in firebase-workout-manager.
- **Sequencing:** 3.1 badges + F1 together first, then F2 + F3 (the first-visit spine — also the new-user activation path), F4 alongside, substitution sheet, 3.2 settings memory, F5 quick-edit whenever — it's independent.
- Usual gates: `npm test` + `npm run lint` + `npm run audit:design`, dev deploy first.

## Open questions for Kevin

1. **Gym chip placement** — above the search bar (mockup shows this) or inside the header block next to the "Workouts" title?
2. **Incompatible cards** — dim in place (mockup) or collapse into a "Not possible here (2)" group at the bottom?
3. ~~Substitution sheet default~~ — **resolved 2026-07-02: preselect Keep.** Rows default to keeping the exercise as-is (the badge might be wrong — D3); `Start workout` stays one tap and nothing is ever silently dropped. Skip/Swap remain explicit per-row choices, remembered per gym (D10).
4. **Settings chips at set time** — always visible, or collapsed behind a gear icon when >2 chips? (Mockup shows always visible; small screens may disagree.)
5. **Dashboard travel card** — when at a gym that isn't your most-used one, show a "You're at Marriott Austin — 2 of 5 workouts possible" hero card? Included in mockup as an optional screen; could be v2.
6. ~~Unknown-state threshold~~ — resolved by D6: per-workout evidence, no gym-level threshold, no hard negatives in v1.
6b. **Neutral-chip volume** — at an engaged user's lightly-mapped gym, does `Not mapped here yet` on several cards read as an invitation or a nag? Candidate softening: show it only on the workout categories the user actually trains.
7. **F2 fast paths** — settled on `Skip equipment` / `Free weights` / `Cable machine`, placed first (Kevin's call: three levels of caring — skip, generic bucket, or exact machine below). Remaining: does the `Free weights` → Dumbbells/Barbell follow-up tap earn its keep (PR segmentation) or should it just be two top-level chips?
8. **Quick-edit entry points** — ⋯ on picker rows + gym-detail rows + the active-workout equipment line, or fewer to start?
9. **New-user onboarding tie-in** — should onboarding end by steering into "start your first workout" (leaning on F1–F4) instead of any library setup step?
