# Big Surf — UX Deep Dive, October 2026

*Written 2026-10-26 (late) against the working tree at `96a0a79` (DS-1…DS-5, LB-5). Companion mock-ups: `mockups/ux-deep-dive-2026-10.html`. Every finding cites a file:line in that tree; line numbers drift, so search the selector or string if one is off. Rules referenced are CLAUDE.md "Design System Rules" (DS 1–10), "User-Facing Copy Rules" (C 1–11) and the shell rules (SH-5). Fix phases are tagged **UD-n**, sized S/M/L, one phase = one PR, dev-deploy gate — same shape as the AP/SH/DS docs. Counts come from a ripgrep pass over `index.html`, `js/` and `styles/`; the regex is stated where a count matters.*

**Trigger (Kevin, 10/26):** "A deep dive of the app's UX to ensure consistency across the app, recommendations on the top 5 UX / workflow improvements, and mock-up options for each. Prioritize usability and style."

**Scope note:** this is a source audit, not a phone session. The shell audit (SH-0) and the persona re-review remain the phone-side checks; this doc covers what the code *promises* on every screen — headers, actions, rows, sheets, copy, numbers — and where those promises disagree.

---

## 0. Verdict

**The primitives are right; the app doesn't use them yet.** Since July the codebase has acquired one sheet (`openSheet`, 41 call sites), one confirm (`confirmSheet`, 50), one header (`.page-header`, 40 of 41 headers carry a `__back`), one chip, one search field, a page lock derived from the DOM, a tokenized palette (94.8 % of `font-size` declarations are tokens; 0 raw hex in pages; 0 native dialogs). The DS/SH/AP work landed. What's left is the layer *above* the primitives — the one no script checks:

| # | Dimension | State | Evidence (counts, file:line) |
|---|---|---|---|
| 1 | **List rows** | ❌ | `.row-card` is **22 of ~180** row renders (12 %). 47 other flex-row classes in use: `.srow` 40, `.js-row` 26, `.aw-ex-menu__item` 14, `.more-menu-item` 11, `.location-item` 8, `.function-picker__row` 8, `.template-row` 6, `.aw-add-ex-row` 6, `.equip-row` 4, `.detail-row` 4, `.dash-week-row` 4, `.dash-alt-row` 4 … Regex: selector ending `-row|__row|-item|__item|-entry` with `display:flex` + `align-items:center`. |
| 2 | **What a row promises** | ❌ | Tappable rows with a chevron ≈ 49, without ≈ 130. Two rows *look* tappable and aren't (`.detail-row` has `cursor:pointer` + `:active` scale but no `onclick`, metric-detail.css:113 / metric-detail-ui.js:228, :281; `.d-pr-row` is styled like `.pr-row`, which opens the lift, but has no handler, muscle-group-detail-ui.js:148). One *is* tappable and doesn't look it (`.rc-line`, report-card-ui.js:174, no cursor/chevron, report-card.css:62). Profile `.srow`s have `onclick` without `srow--clickable`, so no pressed state (settings-ui.js:918–952). |
| 3 | **Section heads** | ❌ | 10 classes at 4 sizes: `.sec-head` 34 (`--font-base`), `.group-label` 12 (raw 0.7 rem, uppercase), `.dash-section-head` 9 (`--font-sm`), `.d-sec-head` 9 (`--font-xs` uppercase), `.section-title` 8, `.more-menu-section-title` 4, `.equip-group-header` 3, `.gym-detail__group-header` 2, `.template-editor__section-label` 1, `.field-label` used as a head (report-card-ui.js:163). The uppercase "eyebrow" style exists in **51 rule blocks across 20 files with 7 letter-spacing values** (0.02–0.08 em, 0.5 px). |
| 4 | **Overlays** | ⚠️ (1 left) | Everything is on `openSheet`/`confirmSheet`/`<dialog>` except the **More menu**: static `#more-menu` (index.html:1375–1450) with its own drag handler (`setupBottomSheetDrag`, navigation.js:746–809, 80 px threshold vs the primitive's 60), hard-coded `z-index: 750/740` (nav.css:195/171) **above `--z-toast` 700**, no Escape, no `inert`, no focus trap. Also still their own fixed roots: `.onboarding-overlay` (settings.css:53), `.aw-form-video-overlay`, `.aw-workout-menu`/`.aw-ex-menu` popovers, three toast roots (`.notification` nav.css:4 — dead, `.app-toast`, `.weh-undo-toast`). The Brand/Line/Function picker is still a `dialog.modal` (`#function-picker-modal`, equipment-library-ui.js:3899). |
| 5 | **Back navigation** | ⚠️ | 24 of 55 back buttons don't call `navigateBack()` directly; 12 of those delegate to it inside a closer, **8 close by `.hidden` toggle** (`closeExerciseLibrary` workout-management-ui.js:398, `closeWorkoutDetailModal` workout-history-ui.js:299, `closeWeightHistory` body-measurements-ui.js:383, `closeDexaUploadModal/History/Detail` dexa-scan-ui.js:247/748/960, `closeGymDetail`/`closeBrandCatalog` equipment-library-ui.js:1282/1831). `workout-detail-section` is in `SECTION_IDS` (navigation.js:17) **but has no `routeToView` case** → `navigateBack()` onto it falls to the dashboard (:342–344). 24 fixed `navigateTo('dashboard'|…)` exits, 12 of them in workout-session.js. Equipment mutates its header `innerHTML` for five sub-views (equipment-library-ui.js:364, 741, 906, 947, 1855, 3100, 3462, 4223) instead of entering a section, so system back leaves the whole page. |
| 6 | **Doors (duplicate entry points)** | ❌ | Start a workout: **13** doors. Finish a workout: 3 (⋮ active-workout-ui.js:284, footer flip :1386, "All" sheet :4049). Add exercise mid-workout: 3 (⋮ :264, dashed `+` pill :320, "All" :4039). Edit equipment: 3. Resume: 3 surfaces, one dead. Cancel-confirm copy: **4 variants, one contradictory** (active-workout-ui.js:1906, workout-session.js:1502, dashboard-ui.js:1777, workout-session.js:144 "you'll lose any unsaved progress"). More menu duplicates the tab bar ("AI Coach", "Your workouts") and Settings ("Sign out"). |
| 7 | **Missing doors** | ❌ | Plan, Goals, Report card and the weight-entry form are **not in the More menu**. The Home plan line disappears when `planCardModel` returns null (dashboard-ui.js:602/612); the report card is 3 taps off-Sunday; "Body measurements" in More opens the chart (`openMetricDetail('body-weight')`, index.html:1414), and with zero entries that page has no "Log entry" button and tells you to go to Settings, which has no weight path (metric-detail-ui.js:333–338). "Manage locations" is hidden when you have zero gyms (dashboard-ui.js:1733–1736) — the first-gym path is invisible from More. The gym detail page (`showLocationDetail`, location-ui.js:927 — radius, size, note) has **no caller**. |
| 8 | **Words for one thing** | ❌ | gym / location / place: "Locations", "Manage locations", "Your gyms", "My gyms", "Add new location", aria "Rename gym" on a Locations row. Coach: "Coach" (nav) / "AI Coach" (More :1403, page ai-coach-ui.js:198) / "AI coach profile" (settings-ui.js:423). Plan: "Your plan" / "View plan" / "See the plan" / "Program" (settings-ui.js:262, :481) / "block" in ids. Weight logging: "Body measurements" / "Log body weight" / "Add weight" / "Log entry" / "Log measurements" / "Save entry". Body: "Body" (Home) / "Composition" (page) / "Body composition" (dead page). Add: 33 "Add", 9 "+", 7 "New", 3 "Create"; gym creation alone has 4 labels. |
| 9 | **Numbers, dates, units** | ❌ | Set notation flips **reps×weight** (dashboard-ui.js:1266, :1446; muscle :136; exercise chips :268) ↔ **weight×reps** (dashboard-ui.js:1195; muscle :67; exercise :129/:156; block-ui.js:250/:339); history badges are reps-first but carry `· RPE 8` (workout-history.js:1355). Dates on one path: "Oct 14" (workout-history.js:1551) / "10/14/2026" (:1233) / "Tuesday, October 14" (:1151) / ISO "2026-10-20" (body-measurements-ui.js:49). Relative time: **~14 implementations, 0 `Intl.RelativeTimeFormat`**; "4d", "4 days", "2 wk" (no "ago"), "42m" vs "42 min". Units: hard-coded `lb` on muscle (:71/:139/:154) and composition (:122–126/:179/:194) pages vs `userWeightUnit()` elsewhere. Jargon leaks: `RPE 8` (workout-history.js:1355), `@8` (exercise-detail-ui.js:268), "Deload on through …" rendered from `override.label` (settings-ui.js:226/233). |
| 10 | **Icons** | ⚠️ | 13 of 16 concepts use ≥ 2 glyphs: gym/location 6 icons, coach 6 (`fa-robot` nav vs `fa-brain` More/Settings), history 6, body weight 4 (More renders `fa-weight-scale`, elsewhere `fa-weight`/`fa-balance-scale`), settings 4 (`fa-cog` also means "Edit exercise" on the lift screen, :647). `fa-times` carries 5 meanings in 43 sites. |
| 11 | **Primary-action placement** | ⚠️ | 5 placements across 20 pages. Three pages render the **same save twice** (header "Save" + footer "✓ Save …": Log measurements body-measurements-ui.js:64/:129, New exercise workout-management-ui.js:724/:779, Add past workout index.html:770/:831). Editor has a 28 px "+" (templates.css:629) *and* a full-width "+ Add exercise"; its empty state points at the 28 px one (template-selection.js:1113). `page-header__save` is used for *create* ("+ New", index.html:848, :491, :340). `btn-small` 20 vs `btn-sm` 18. |
| 12 | **Color semantics** | ⚠️ | `--danger` on **~20 of 78** non-destructive rules (11 trend-down deltas, Arms category tint ×2, set types ×2, statuses); `--warning` spans 7 meanings (stale, "new" badge, undo toast, warm-up, Cardio, dirty, BMI); `--highlight-warm` means "selected" on two active-workout rules (`.js-row.selected` :861, checkbox :959) next to the superset rule it's reserved for. 0 danger on dismiss/close/back — the DS-5 rule held. |
| 13 | **Form fields** | ⚠️ | Five classes for one text field: `.field-input`, `.qe-field__input` (equipment-quick-edit.js:160), `.add-field__input` (equipment-library-ui.js:4288), `.form-input` (index.html:604, DEXA), `.input-field` (:985). Chips as `<div onclick>` (exercise-manager-ui.js:540, equipment-library-ui.js:3288, location-ui.js:992) vs `<button class="chip">` (index.html:940); a third chip class `.add-type-chip` (:4278). |
| 14 | **Typography** | 🟢 | 46 raw `font-size` sites (5.2 %) in 22 distinct values — bodyweight.css 17, grouped-rows.css 8, fields.css 5, chips.css 4; 8 distinct `font-weight`s. Within budget; listed so DS-6 can ratchet. |

**What's clean, confirmed:** every `confirmSheet` has a named `confirmLabel`; the only "Cancel" label left is "Cancel workout" (a real action); 0 `window.confirm/alert/prompt`; 0 `env(safe-area-inset-top)` outside the primitives; every `.page-header` has exactly one back and no `×`; Goals, Report card, Plan, DEXA history and the discovery rows are on `.row-card` + `openSheet` + three-part empty states — the newest pages are the most consistent, which says the rules work when they're followed from the start.

---

## 1. Why it drifted — and what stops it

Same lesson as the DS and SH audits, one layer up: **a pattern without a budget regresses.** `design-audit.js` guards tokens; `shell-audit.js` guards overlays and headers; nothing guards *rows, heads, doors, formatters or words*. Each of the 14 rows above is a pattern that lives only in prose. So, as before, every candidate below ends with the budget that keeps it fixed (UD-6).

---

## 2. The top five

Ranked by (usability impact × how many screens it touches), with style weight where the fix is visual. Each has 2–3 options in the mock-up file; the pick is stated.

### UD-1 — One map of the app: the More menu and the missing doors (M) — *candidate 1*

**Why:** the four newest surfaces (Plan, Goals, Report card, weight entry) are reachable only through conditional Home rows or three-deep paths; the More menu is the last legacy overlay and lists three things the tab bar already has.

**Evidence:** More menu contents index.html:1375–1450; "AI Coach" :1401 duplicates the Coach tab :1176; "Your workouts" :1384 duplicates the FAB :1179; "Sign out" :1444 duplicates settings-ui.js:578. Plan doors: Home program line dashboard-ui.js:624 (vanishes when `_planCard` is null, :602), Workouts-tab row template-selection.js:450, coach receipts, report card — none in More. Report card: Home Sun/Mon row report-card-ui.js:390, else Progress → row (dashboard-ui.js:1708) or Settings row (settings-ui.js:470). Weight: More → `openMetricDetail` chart (index.html:1414); zero-entry dead end metric-detail-ui.js:333–338. Locations hidden at 0 gyms dashboard-ui.js:1733. More-menu mechanics: navigation.js:617–809; nav.css:171/195 z-index vs tokens.css:246.

**Options (mock-up §1):**
- **A · Grouped sheet.** `#more-menu` becomes `openSheet({ id:'more', size:'auto' })` rendered from a small model; groups *Your training* (Your plan · Goals · Report card · Progress), *Your body* (Log weight · Body & scans), *Your gym* (Exercises · Equipment · Gyms · Plate calculator); account row carries Settings + Sign out; Error log moves under Settings. Rows may carry a quiet status (week kind, "2 on track", last weight). Delete `setupBottomSheetDrag`, `scheduleStuckMenuCheck` (the diagnostic for a bug the primitive can't have), the `.more-menu*` CSS and the dead `.notification` toast root.
- **B · Plan tab.** The bottom nav becomes Home · Plan · ▶ · History · More; Coach moves to a header button on Home and Plan (it is already a header button during a workout, active-workout-ui.js:249). Goals and Report card hang off the Plan page header. A product call — it matches "think once, execute daily" (action plan §4.0) but demotes the coach.

**Pick:** A now; B when you decide where the coach lives. A is one evening and removes the only legacy overlay left.

**Acceptance:** every page in `SECTION_IDS` that a user can want is one tap from More or on the tab bar; `grep -c "more-menu" js styles index.html` → 0; a toast fired with More open renders above it; Escape/system-back close More like any sheet; "Gyms" shows with zero gyms and says "Add your first".

### UD-2 — One lift screen: one door per action (S/M) — *candidate 2*

**Why:** the active workout is the surface the product rules protect ("minimal distraction, one canonical door per action, unit toggle stays visible"), and it has crept: ~29 tappables for a 6-exercise × 3-set workout against the ~22 target, three doors each for Finish / Add exercise / Equipment, four cancel sentences, and the one control you use most is the smallest.

**Evidence (active-workout-ui.js unless noted):** tappables in DOM order :240 back, :249 coach, :252 ⋮, :315 pills ×N, :320 `+` pill, :356–357 rest +30s/Skip, :635 plates, :647 cog, :695 equipment line, :1032 last-session row, :657 unit pill, :1232–1252 reps/weight/✓ ×sets, :663 Remove, :664 Add set, :668 notes, :1383 All, :1386 Next/Finish. Finish doors :284, :1386, :4049. Add doors :264, :320, :4039. Equipment doors :695, :1294 (cog → quick-edit), :2749 (`.js-row__more`). Unit pill `min-height: 24px` (active-workout-v2.css:520); `.aw-footer` sticky with no `env(safe-area-inset-bottom)` (css:732–742) while `.bottom-nav` and `.sheet__footer` have it. Cancel copy ×4 (see §0 row 6). Resume surfaces: hero dashboard-ui.js:353, pill :397, `#resume-workout-banner` index.html:237 — the banner writes `#resume-sets-completed`/`#resume-progress-fill` (app-initialization.js:1114/1148) but index.html has `#resume-stat-sets`/`#resume-progress-ring` (:254/:249), and `renderDashboard` hides it unconditionally (dashboard-ui.js:149) — dead.

**Options (mock-up §2):**
- **A · Fewest doors.** Delete the `+` pill; "All" sheet footer keeps Reorder / Superset / Close only; Finish = footer flip + ⋮; Remove-set becomes swipe-left on a row (one-time hint); unit toggle becomes an `lb | kg` segmented at 36 px in the sets header; footer gets the inset. 29 → 22 tappables.
- **B · Finish is a button.** Footer All · Next · Finish (ghost; flips to primary when every set is done); Finish leaves ⋮ and "All"; Export moves to History detail. 23 tappables, zero hidden finishes. Note: you removed a footer finish in the July calm pass — this is a quieter version, not the flag.
- **Both:** one `confirmCancelWorkout()` with one sentence ("Sets you've logged are kept as a cancelled session." · Cancel workout / Keep lifting) called from ⋮, Home hero and start-while-running; delete the resume banner and `showInProgressWorkoutPrompt`.

**Pick:** A plus the cancel table. B only if the phone session shows people hunting for Finish (the footer already flips the moment the last set is checked).

**Acceptance:** exercise view tappables ≤ 22 (count with the HUD snap); `awFinishWorkout` and `awAddExercise` each have exactly two callers; unit toggle ≥ 36 px; footer bottom ≥ `env(safe-area-inset-bottom)`; `grep -rn "cancelled session\|unsaved progress\|incomplete entry" js` → one site.

### UD-3 — One row, one head, one field — and a rule for what a row promises (M) — *candidate 3, the style pass*

**Why:** this is the single biggest visual inconsistency by count (rows 1–3 and 13 in §0) and the one that produces real usability bugs: rows that invite a tap and ignore it.

**The rule (write it into CLAUDE.md DS-1):** a list item is `.row-card`. Its trailing slot says what a tap does — **chevron = opens a page · value only = static · control (play / toggle / ⋯) = acts on the row**. No `cursor:pointer` without a handler; no handler without a chevron or control.

**Evidence:** §0 rows 1–3; `.detail-row` metric-detail.css:113 vs metric-detail-ui.js:228/:281; `.d-pr-row` muscle-group-detail-ui.js:148; `.rc-line` report-card-ui.js:174; Profile `.srow` settings-ui.js:918–952 vs grouped-rows.css:125. Heads: `.d-sec-head` detail-pages.css:224; `.sec-head` page-header.css:221; `.dash-section-head` dashboard-v2.css:90; `.detail-breakdown-head` metric-detail.css:82; `.field-label` as head report-card-ui.js:163; `.detail-page-header__title` (`--font-lg`, metric-detail.css:6) inside a `.page-header--detail` whose siblings use `.d-title` (`--font-md`, detail-pages.css:21). Fields: §0 row 13.

**Options (mock-up §3):**
- **A · Titled heads.** `.row-card` + the dashboard's `.dash-section-head` (h3 + meta / "Label →") become the only two; `.d-sec-head`, `.sec-head`, `.detail-breakdown-head`, `.equip-group-header`, `.gym-detail__group-header`, `.template-editor__section-label` migrate; `.group-label` stays for grouped settings only.
- **B · Eyebrow heads.** Same row rule; the uppercase eyebrow becomes the one head, Home included (quieter, more Apple-Health; eyebrows can't carry long titles).
- **C · One field** (independent): `.field` + `.field-label` + `.field-input` (44 px) everywhere; chips are `<button class="chip">`; Type pickers are chip rows; Save lives in the footer only (header "Save" duplicates go).

**Pick:** A + C. A keeps Home as the V3 decision left it; the row rule is the real win.

**Order of migration (by use count):** `.srow` (40, keep as the grouped-settings row but give it the trailing rule) → `.js-row` (26) → `.aw-ex-menu__item` / `.more-menu-item` (menus — become sheet rows in UD-1) → `.location-item`, `.function-picker__row`, `.template-row`, `.aw-add-ex-row`, `.equip-row`, `.detail-row`, `.dash-week-row`, `.dash-alt-row`, `.exercise-card-new`, `.library-exercise-card`, `.recent-workout-item`, `.workout-picker-item`, `.manual-library-item`, `.d-exercise-row`, `.d-pr-row`, `.pr-row`, `.rc-line`.

**Acceptance:** `rowClassesOutsideCardsCss` budget (UD-6) ratchets from 47 to ≤ 5 (menus and set rows may keep component names); `.detail-row` / `.d-pr-row` open the lift; `.rc-line` shows a chevron; every `cursor:pointer` rule in `styles/pages` has a matching handler (one grep).

### UD-4 — Past workouts: a real page, one way to write a set (M) — *candidate 4*

**Why:** the workout detail is the second most visited read surface after Home and it's a modal–page hybrid with a stuck title, a delete button beside the primary, and the app's numbers vocabulary at its most inconsistent.

**Evidence:** `#workout-detail-section` is a `.full-page-section` opened with `openModal()` (workout-history.js:1343) yet listed in `SECTION_IDS` (navigation.js:17) with no `routeToView` case (:342–344); closer toggles `.hidden` (workout-history-ui.js:299); `#workout-detail-title` set to "Edit workout" (edit-history-inline.js:732) and never restored (`showFixedWorkoutModal` only rewrites the body, workout-history.js:1319–1343); inline `.modal-actions` Edit / Repeat / Save as workout / **Delete** (:1303–1315); body `<h3>Push A - 10/14/2026</h3>` (hyphen, :1320) under a static page title; "Exercises & Sets" title case (:1334); `· RPE ${set.rpe}` (:1355); `'m'` duration (:624); bottom nav visible under the overlay (app-shell.css:153). Dead renderers reference `#workoutModal`/`#modalBody` which don't exist (workout-history.js:745–785, :1380–1409 — throw if reached from :1109/:1210). Two parallel detail modals already noted in July (UX-AUDIT-2026-07 §5) — still both present. Fix-a-typo = 6 taps.

**Options (mock-up §4):**
- **A · Routed page.** `navigateTo('workout-detail')` with a `routeToView` case; header title = workout name, subtitle `Tue, Oct 14 · Love Field · 42 min`; stat strip; footer **Repeat workout** (primary) + **Edit** (secondary); ⋯ overflow for Save as workout / Export / Delete; set badges `6 × 185 lb · 8/10`. Delete the `#workoutModal` renderers and `showWorkoutDetailModal`'s Resume/Repeat/Delete variant (workout-history-ui.js:254).
- **B · Edit in place.** Same page; tap a set to edit it inline, ✓ saves that set through `once()` with the existing undo toast; footer is Repeat only; structural edits live behind ⋯ → "Edit exercises". Fix-a-typo = 4 taps, never leaves the page.
- **Both · the formatter table** (plain-language.js + date-helpers): `formatSet(set, unit)` → `6 × 185 lb`; `formatDateShort` → `Tue, Oct 14`; `formatRelative` → `3d ago` (dense) / `3 days ago` (sentence); `formatDuration` → `42 min`; effort → `8/10` (`effortTag` exists); unit → `userWeightUnit()`, never a literal. ~40 call sites (list in §0 row 9); delete workout-history.js's private `formatRelativeDate` (:1540), `formatRelativeTimestamp` (body-measurements-ui.js:166), `formatTimeAgo` (template-selection.js:561), `relativeTime` (equipment-library-ui.js:2839) and the 8 inline builders.

**Pick:** A + the formatters first; B as the follow-up once the page is routed.

**Acceptance:** back from detail returns to History (or Home, whichever opened it) — never falls through `default`; title resets after an edit; `grep -rnE "×\\$\\{[^}]*weight|\\bRPE\\b|'m'" js` → 0 in user strings; one relative-time implementation (`Intl.RelativeTimeFormat` or one helper) — budget `relativeTimeImplementations: 1`.

### UD-5 — Gyms & machines: one word, one add flow, gym-aware by default (M) — *candidate 5*

**Why:** this cluster has the longest tap counts in the app, two unrelated flows for the same job, a finished page nobody can reach, and six names for one noun.

**Evidence (equipment-library-ui.js unless noted):** header "+ Add equipment" (index.html:1292) → `showAddEquipmentFlow` → save without a gym (:4351–4362) → detail → Locations "+ Add" (≈12 taps) vs gym quick-add (6); the restored header after detail loses the camera and reads "+ Add" (:3464–3474; `dataset.mutated` never set :904–907 vs :3098–3107). Two add-gym flows: GPS/address/map dialog (index.html:589, location-ui.js) vs name-only `promptSheet` (:2186). `showLocationDetail` (location-ui.js:927) has no caller — radius, gym level (TP-7), "what's here" note and delete-from-detail are dead UI; the Locations row tap only pans the map (:338). Catalog row tap writes an equipment doc (`openCatalogMachine` → `promoteCatalogToEquipment`, :1306–1337, toast "Added …"). Internal words shipped: "Orphans" (:2121), "mapped / picker / rotate" (:2499–2500). Three machine editors with different models: identity sheet (autosave + pickers, :3259–3306), quick-edit (explicit Save + free text, equipment-quick-edit.js:77–93), legacy `#equipment-editor-section` (index.html:1045). The brand/line/function picker is still a `dialog.modal` (:3899). Library search is gated behind an icon toggle with `type="text"` and no `aria-label` (:2412/:2431) while Catalog's is always visible (:2597). Name table: §0 row 8.

**Options (mock-up §5):**
- **A · Gym-first.** Equipment opens with a gym context row ("At Love Field · 24 machines · Switch gym"); the search field *is* the add (the workout picker's `planInlineEquipment` slot, reused); tabs This gym / All machines / Catalog; Catalog is read-only with an explicit "Add to ‹gym›" per row; header "+ Add equipment", the add flow and the function-picker dialog are deleted. Add at current gym: 6–12 → 3 taps.
- **B · Gyms page.** The Locations page becomes **Gyms**; rows open the built detail (map, radius, level, note, machines, ⋯ rename/re-pin/delete); one add-gym flow (GPS → map → name) reachable from Gyms and from Equipment's "Switch gym"; the name-only prompt goes.
- **C · Merged.** One page "Gyms & equipment" (Gyms → B's detail · All machines · Catalog); location-ui.js folds into equipment-library-ui.js; "Not at a gym yet" replaces orphans. Biggest refactor; do it after SH-3b finishes migrating this file's overlays.
- **All:** the word table — **gym** for the place, **machine** for the thing, **equipment** for the page; "Add a machine at ‹gym›", "Add a gym" as rows, not header links.

**Pick:** A + B now (mostly deletion), C later.

**Acceptance:** add-at-current-gym ≤ 3 taps from More; `showLocationDetail` has a caller and the pen/trash row buttons are gone; `grep -rniE "location" js/core/features/location-ui.js js/core/ui/equipment-library-ui.js index.html | grep -v "locationId\|locations\[\|location-\|'location'"` finds no user-visible "location"; Catalog tap writes nothing until "Add to"; `grep -c "function-picker" js styles index.html` → 0.

---

## 3. Screen-by-screen notes (what else the sweep found)

Short, by cluster; anything already in §0/§2 isn't repeated. 🔴 misleads or blocks · 🟡 real drag · 🟢 polish.

**Home / Progress / drill-downs**
- 🟡 Dashboard head links disagree: "Edit" / "Progress →" / "Details →" (dashboard-ui.js:1172/:1126/:1407).
- 🟡 `.dash-program-line` is a `role="button"` at `padding: 6px 4px; font-size: var(--font-2xs)` (dashboard-v2.css:565) — the only Home row under 44 px.
- 🟡 Drill-down pages use `.d-content { padding-bottom: 80px }` (detail-pages.css:242) instead of `--nav-clearance` — lose the home-indicator inset that Plan/Goals/Report card have.
- 🟡 `showMuscleGroupDetail` force-sets `AppState.dashboardRange = 'W'` (navigation.js:841), so Exercise detail lands on W via muscle group and on the persisted range via Home — same page, different window by path.
- 🟡 Metric detail: 3 of 4 `DETAIL_RENDERERS` unreachable (metric-detail-ui.js:35–38); `metric-card-base.js` imported nowhere, `metric-card.css` has no consumer; `window.setDashboardRange` (main.js:767) has no renderer. "Strength · top lifts" uses a hard-coded big-4 list (:271) while Home "Main lifts" uses the user's picks.
- 🟡 Goals event row has a chevron but the tap goes straight to a destructive "Remove X?" confirm (goals-ui.js:132 → :400). `reportCardBuildNow` uses ad-hoc `btn.disabled` instead of `once()` (report-card-ui.js:312–327).
- 🟡 DEXA upload/history are `.full-page-section`s outside `SECTION_IDS` and `OVERLAY_SELECTOR` (dexa-scan-ui.js:201/:742; navigation.js:12; page-lock.js:18) — system back runs beneath them.
- 🟢 Composition: "Water %" (:70) vs "Other %" (metric-detail :500) for the same remainder; "Upload DEXA scan"/"Add weight" use the old `.dash-template-play` circle (:208/:250).

**Workouts tab / editor**
- 🟡 Three competing starts above the fold (`.quick-start-cta` template-selection.js:660, `.tpl-suggested` :913, per-row `.tpl-start` :957) plus the "Your plan" group; `.tpl-start` is 40 px (templates.css:209).
- 🟡 Header is the last `.section-header-row` (index.html:363) with a `.btn-primary` "New" — the only header-level primary button in the app; "New" vs "Plan a workout" (:599) for the same action.
- 🟡 Editor: 28 px "+" (templates.css:629) + full-width add; empty state points at the small one (:1113); `.te-row` reorder arrows and steppers are the July items still open.
- 🟢 "Schedule: Thu" / "Scheduled Thu" / "Usually Thu" — three phrasings (:1218–1223).

**Active workout (beyond UD-2)**
- 🔴 `completeWorkout` guards on `.btn-finish` (workout-session.js:546), a selector that exists nowhere; `awFinishWorkout` (:1921) doesn't use `once()` — a second tap during the PR `await` (:609) runs save/PR/summary twice.
- 🔴 "Session summary" (mid-workout) reads `AppState.currentWorkout.startedAt/.workoutType` (workout-session.js:1394/:1411), which live on `savedData` — shows "0m" and "Workout"; reuses the completion `<dialog>` with `aria-label="Workout complete"` and a title-case "Back to Workout" (:1435).
- 🔴 `continueInProgressWorkout` hides 8 sections by hand (workout-session.js:1577–1593) instead of `enterSection('active-workout')` — sections not in that list (block, goals, settings, coach, editor, equipment) stay visible under a resumed workout from the FAB; the back guard isn't synced.
- 🟡 Equipment sheet rows `.js-row` vs add-exercise rows `.aw-add-ex-row`; three group-title classes, two with identical CSS (active-workout-v2.css:840–849 vs 1197–1204); shared add sheet puts "Create…" last (:3775), the active one first (:3513); equipment sheet footer says "Done", every other picker "Close".
- 🟡 Legacy `#rest-timer` (index.html:564–576) is dead; `rest-timer.js` only serves it; `ui-helpers.js:235` targets a non-existent `#workout-rest-timer`.
- 🟡 `exercise-ui.js` (2,800 lines): only `convertYouTubeUrl` and `resolveFormVideo` are reachable; `showExerciseVideo` from History (workout-history.js:880) needs `#exercise-video-section`, which doesn't exist → silent no-op. Dead UI still carries banned copy ("Ready!", v1 cards).
- 🟡 Manual entry step 2 has two Save doors (index.html:770/:831); `window.exerciseLibrary.openForManualWorkout` (manual-workout.js:526) has no definition in the audited tree (js/core/data was not staged — verify against `exercise-library.js`); if absent, manual custom workouts can only add exercises by typed name.
- 🟢 Under-44 px: rest `+30s`/Skip ~24 px (css:229), pills 26 px (css:99), plates 34 px (:303), `.js-row__move` 28×24 (:970).

**History / exercises / body**
- 🔴 `showCreateExerciseForm({ initialName })` (template-selection.js:1532) — the function takes no parameter (workout-management-ui.js:699); the typed name is dropped.
- 🔴 Withings "Sync now?" confirm: backdrop/Escape resolves `false` → opens "Disconnect Withings?" (main.js:941–955; confirm-sheet.js:62–69) — a dismiss becomes a destructive path.
- 🔴 `deleteWeightEntry` (body-measurements-ui.js:391) and `clearAllErrors` (error-log-ui.js:103, wipes Firestore) have no confirm; the live metric-detail delete does (:92).
- 🟡 Two create-exercise forms with two data models: dialog "Category" (workout-management-ui.js:713–733, header + footer save) vs page "Body part / Focus / Movement" (exercise-manager-ui.js:566–581, footer only); the dialog nests a `.page-header` inside a `<dialog>` (:719).
- 🟡 Three exercise-row classes (`.exercise-card-new`, `.library-exercise-card`, `.recent-workout-item`/`.workout-picker-item`); exercise manager stacks a second header with its own back under the page header (index.html:917, `aria-label="Go back"`).
- 🟡 History search widens to all history while the calendar stays month-scoped (workout-history.js:519–528); empty calendar days start a manual workout but nothing says so.
- 🟡 Dead pages: `#weight-history-section` (`showWeightHistory` no caller, main.js:869 only; one-tap delete without confirm :391–395), `renderBodyWeightChart` Chart.js (no canvas), `renderDexaCard` (no caller). CLAUDE.md still calls Chart.js "the ONLY Chart.js usage" — it's zero.
- 🟡 Plate calculator body isn't a scroll container (index.html:1310; plate-calculator.css:9–11; utilities.css:149–160).
- 🟡 Error log is a `.modal` dialog opened with raw `showModal()` (error-log-ui.js:62) bypassing `openModal` (no focus trap, no back-guard layer event); `showNotification(..., 'warn')` isn't a variant (:212; ui-helpers.js:33–36 collapses warn/warning/info).
- 🟢 Body-weight entry "Last" shows raw `184 lbs · 2026-10-20` (body-measurements-ui.js:48–49); DEXA detail's ⋯ has one hidden destructive item (dexa-scan-ui.js:781); "DEXA History"/"DEXA Scan" title case (index.html:1246, dexa-scan-ui.js:31).

**Equipment / locations / settings / coach (beyond UD-5)**
- 🔴 "Deload on through Sun, Nov 1" rendered from `override.label` (settings-ui.js:226/:233) — the TP-0 ban, in Settings.
- 🟡 Onboarding offers a 180 s rest timer (settings-ui.js:774); Settings offers 60/90/120 (:306–310) — pick 180 and nothing is selected. Onboarding "Maintain" vs Settings "Keep" for the weight goal (:677 vs :333).
- 🟡 7 unlabeled `.toggle` buttons (no `aria-label`/`aria-pressed`, settings-ui.js:249, :369–468); onboarding options are `<div onclick>` (:686) and reused inside the experience sheet (:1382).
- 🟡 Coach is the only tab with a back button (`closeAICoach` chat → landing → `navigateBack`, ai-coach-ui.js:396–403), and system back (navigation.js:877–898) bypasses the chat→landing step. Proposal confirms "Start session" vs "Make it so" (:1195/:1238). History header says "Past reviews" (:1593) for all conversations.
- 🟡 First-use tip `'workout-selector'` targets `.workout-option:first-child` (first-use-tips.js:10) — no such class exists; the tip never renders. `'more-menu'` tip says "Equipment library" (:16); the page is "Equipment".
- 🟡 `.sec-head__action` "+ Add"/"+ Assign" has no min-height (page-header.css:240–247) ≈ 16 px; `.page-header__icon-btn` 36 px (page-header.css:150); `.coach-chip__dismiss`, `.live-proposal__dismiss`, `.dash-alt-row__dismiss`, `.gym-new-banner__dismiss` at `--tap-sm` (shell-audit's 4).
- 🟢 Toast: `.app-toast` is `bottom: 80px` with no inset (toast.css:10); `.bottom-nav`/`.more-menu` write `env(safe-area-inset-bottom)` directly (app-shell.css:32/38, nav.css:200) — SH-5 covers only the top inset.

---

## 4. Bugs found along the way (verified against source)

| # | Bug | Where | Fix (phase) |
|---|---|---|---|
| B1 | Finish has no double-tap guard; `completeWorkout` guards a non-existent `.btn-finish` | workout-session.js:546, :609; active-workout-ui.js:1921 | `once('finish', …)` — UD-2 |
| B2 | Mid-workout "Session summary" shows "0m"/"Workout" (reads `currentWorkout.startedAt`) | workout-session.js:1394, :1411 | read `savedData` — UD-2 |
| B3 | Resume banner stats target ids that don't exist, then the banner is hidden on render | app-initialization.js:1114/1148 vs index.html:249/254; dashboard-ui.js:149 | delete the banner — UD-2 |
| B4 | Resume hides sections by hand; back guard not synced | workout-session.js:1577–1593 | `enterSection('active-workout')` — UD-2 |
| B5 | `workout-detail-section` in `SECTION_IDS` with no route; title stuck "Edit workout" | navigation.js:17/:342; edit-history-inline.js:732 | UD-4 |
| B6 | Dead `#workoutModal` renderers throw if reached | workout-history.js:745–785, :1380–1409 | delete — UD-4 |
| B7 | `showCreateExerciseForm({ initialName })` drops the name | template-selection.js:1532 vs workout-management-ui.js:699 | pass it through — UD-3 C |
| B8 | Withings sync confirm: dismiss → Disconnect sheet | main.js:941–955 | separate sheet with two actions — UD-1 |
| B9 | Two destructive actions with no confirm | body-measurements-ui.js:391; error-log-ui.js:103 | `confirmSheet` — UD-4 |
| B10 | "Deload" rendered to the user | settings-ui.js:226/:233 | `weekKindLabel` — UD-1 |
| B11 | Zero-entry body-weight page has no log button, points to Settings | metric-detail-ui.js:333–338 | always pass `breakdownAction` — UD-1 |
| B12 | `showLocationDetail` unreachable | location-ui.js:927 (callers: main.js only) | UD-5 |
| B13 | Equipment header loses camera / reads "+ Add" after detail | equipment-library-ui.js:3464–3474 | UD-5 (header deleted) |
| B14 | Catalog row tap creates an equipment doc | equipment-library-ui.js:1306–1337 | UD-5 |
| B15 | "Manage locations" hidden at zero gyms | dashboard-ui.js:1733–1736 | UD-1 |
| B16 | First-use tip never renders (`.workout-option` doesn't exist) | first-use-tips.js:10 | retarget or delete — UD-6 |
| B17 | Onboarding 180 s rest option has no Settings representation | settings-ui.js:774 vs :306–310 | add 180 — UD-6 |
| B18 | `.detail-row` / `.d-pr-row` look tappable, aren't | metric-detail.css:113; muscle-group-detail-ui.js:148 | UD-3 |
| B19 | DEXA pages outside `SECTION_IDS`/`OVERLAY_SELECTOR` | dexa-scan-ui.js:201/:742 | route them — UD-4 |
| B20 | History "Watch form video" no-ops (`#exercise-video-section` missing) | workout-history.js:880 → exercise-ui.js:2627 | rewire to `awShowFormVideo` — UD-6 |

Dead code worth deleting in one PR (UD-6): `exercise-ui.js` minus two helpers (~2,800 lines), `rest-timer.js` + `#rest-timer`, `#resume-workout-banner` + `showInProgressWorkoutPrompt`, `#weight-history-section` + `renderBodyWeightChart` + Chart.js, `renderDexaCard`, `metric-card-base.js` + `metric-card.css`, 3 of 4 `DETAIL_RENDERERS`, `window.setDashboardRange`, `.notification` toast root, `scheduleStuckMenuCheck`, `.exercise-modal` CSS, `deleteWorkout` in workout-history-ui.js:248 (calls undefined `deleteWorkoutFromCalendar`).

---

## 5. UD-6 — Guardrails: make the pattern rules executable (S/M)

Extend `scripts/design-audit.js` `BUDGETS`, each starting at today's count and ratcheting as UD-1…5 land; `--strict` fails CI:

```js
rowClassesOutsideCardsCss: 47,        // flex+center rows named -row/-item/-entry outside cards.css (allow-list: aw-set-row, srow, menu rows until UD-1)
sectionHeadClasses: 10,               // classes used as section heads → 2 (dash-section-head, group-label)
eyebrowLetterSpacingValues: 7,        // distinct letter-spacing values on uppercase rules → 2
pointerWithoutHandler: 2,             // styles with cursor:pointer whose class never carries onclick/role=button in js/
fixedDestinationBacks: 8,             // back buttons that .hidden-toggle or navigateTo a fixed page → 0
sectionsInSectionIdsWithoutRoute: 1,  // workout-detail-section → 0
overlayRootsOutsideSheetCss: 13,      // already in shell-audit; More menu brings it to 12
relativeTimeImplementations: 14,      // → 1
hardcodedUnitLiterals: 9,             // 'lb'|'lbs'|'kg' inside template strings next to a number → 0
duplicateSaveButtons: 3,              // pages rendering page-header__save AND a footer save → 0
```

`scripts/copy-lint.mjs` additions: `RPE|@\d` in user strings; `\d+\s?×\s?\d+` must be reps-first (flag `(lb|kg)\s*×`); banned words extended with **location** (user copy), **orphan**, **mapped**, **picker**, **program** (user copy; "plan" is the word); a one-word-per-concept table for coach / gym / machine / plan / log weight that the lint reads.

CLAUDE.md: add **DS-1b (what a row promises)** and the **formatter rule** ("never compose a set, date, duration or unit in a template — call the formatter") under User-Facing Copy; correct the Chart.js sentence (zero usages after UD-6); replace "There is NO shared sheet primitive" if any copy survives; note the More menu is an `openSheet` after UD-1.

`docs/ux-shell-checklist.md` gains two lines: (9) open More with a toast showing — the toast is on top; (10) tap one row of each kind on a drill-down page — chevron rows open, value rows don't move.

---

## 6. Phase index and order

| Phase | Size | Candidate | One-line |
|---|---|---|---|
| UD-1 | M | 1 | More menu → `openSheet`, regrouped, de-duplicated; doors for Plan / Goals / Report card / Log weight / Gyms; B8, B10, B11, B15 |
| UD-2 | S/M | 2 | Lift screen: delete `+` pill, "All"-sheet Finish/Add, Remove button; lb|kg segmented 36 px; footer inset; one cancel sentence; B1–B4 |
| UD-3 | M | 3 | `.row-card` + the trailing rule everywhere; one section head; one `.field`; chips as buttons; B7, B18 |
| UD-4 | M | 4 | Workout detail routed; Repeat/Edit footer + ⋯; the five formatters at ~40 sites; B5, B6, B9, B19 |
| UD-5 | M | 5 | Gym context on Equipment; search-to-add replaces the add flow + function-picker dialog; gym detail wired; one add-gym flow; read-only catalog; the word table; B12–B14 |
| UD-6 | S/M | — | design-audit budgets, copy-lint words and formatter rule, CLAUDE.md DS-1b, checklist lines, dead-code deletion; B16, B17, B20 |

**Order:** UD-6's budgets first at today's counts (you can't see drift without them — same as DS-5 and SH-5), then UD-2 (the surface you use daily; smallest), UD-1 (one evening, unblocks the newest pages), UD-4 (formatters touch every page, so do them before the row pass restyles the same lines), UD-3, UD-5. Then the persona re-review (Marcus + Sam, test account only) with the §2 acceptance lines as the brief.

**How to use with Claude Code / Copilot:** paste a UD-n block plus its §0 rows as the task; the mock-up section is the visual spec; the acceptance lines are the merge check. UD-3's migration list and UD-4's formatter call sites are mechanical, grep-verifiable fan-out tasks; UD-1 and UD-2 touch product decisions (B options) and are yours.

---

## 7. As built (2026-10-27, branch `ux-deep-dive`, on dev)

| Phase | State | What landed | Still open |
|---|---|---|---|
| UD-6 | partly | `scripts/ux-audit.js` budgets in `audit:design:strict` (rows 53→50, heads 10→9, hidden-by-hand 7→2, no-route 1→0, "… ago" 13→4, words 93→3); CLAUDE.md DS-1b, §8c formatter table, word table; checklist 9–10; B16, B17; toggles labelled; dead weight-history page, metric-card-base + 3 metric renderers, resume banner deleted | `exercise-ui.js` / `rest-timer.js` (exports still have callers — needs a careful pass), Chart.js script tag + `renderBodyWeightChart`, `.set-chip__rpe`, B20 |
| UD-2 | ✅ | "+" pill, "All"-sheet Add/Finish, picker-row ⋯, Remove button gone; swipe-left removes a set with Undo + one-time tip; lb\|kg segmented 36 px; footer inset; rest buttons 36 px; one cancel sentence (`CANCEL_WORKOUT_MESSAGE`); B1–B4 | phone check of the swipe |
| UD-1 | ✅ (A) | `more-menu.js`; Plan / Goals / Report card / Log weight / Body & scans / Gyms doors; error log under Settings; B8, B10, B11, B15 | option B (Plan tab) is a product call |
| UD-4 | ✅ (A + formatters) | routed `workout-detail`; Edit · Repeat footer, ⋯ Save as workout / Delete; `formatSet` / `unitLabel` / `formatDateShort` / `formatRelative` / `formatDuration` at ~90 sites; B5, B6, B9, B19 | option B (edit a set in place) |
| UD-3 | partly | DS-1b written; B18 (dead rows deleted, weigh-in rows static, report-card chevrons, Goals event row, Profile presses); one `.field-input`; duplicate header Saves removed; B7 | the row/head migration list in §2 UD-3 |
| UD-5 | partly (B) | Gyms page: rows open the gym's page (B12), "Add a gym" row, "Pin it here"; read-only catalog + explicit Add (B14); one header restore (B13); word table | option A (gym-first Equipment, search-to-add, function-picker dialog, name-only add-gym prompt) |

