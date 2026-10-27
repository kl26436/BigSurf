# Big Surf — Design System & Copy Conformance Audit, October 2026

*Written 2026-10-25 against the working tree at `e1fcc45` (22 commits past this morning's `8844b94`: SH-0/1/2, AP-13/14/19–24, AU-1…15). Every finding cites a file:line; search the selector or string if a number has drifted. Rules referenced are CLAUDE.md "Design System Rules" (DS 1–10) and "User-Facing Copy Rules" (C 1–11). Fix phases are tagged **DS-n**, sized S/M.*

**Trigger (Kevin, 10/25):** "Verify the system design is still right and we're still following the copy and color rules — e.g. the Cancel button in the new quick-add equipment form in active workout isn't red. Make sure the last few months of edits haven't screwed anything up."

---

## 0. Verdict

**Mostly intact. The machine-checked rules are all green; the drift is in the rules the scripts don't check.** `npm run audit:design` passes every budget (inline styles 10/15, raw font-size 10/12, raw radius 0, raw rgba 2/2, raw hex 0, duplicate classes 3/5, bare backdrops 0). The 10 remaining inline styles are all CSS custom properties (`--bar-width`, `--dot-color`…), which DS-8 explicitly allows; the 10 raw font sizes are the documented hero/micro one-offs. Copy lints: 0 "please", 0 "cannot", 0 "successfully", 0 "Are you sure" in user strings.

**The Cancel button is correct as built — by your own rule.** `active-workout-v2.css:4-10` defines the color semantics: `--danger` (red) = *destructive* actions (remove set, cancel workout). Collapsing the add-equipment form discards nothing that exists yet, so it is a dismiss, not a destroy — and every other dismiss in the app is neutral (`.aw-sheet__action` default, `.btn-secondary`, `.btn-ghost`, `.active-pill__cancel` muted). Red is only ever used on `Cancel workout` (⋮ menu, `active-workout-ui.js:282`), delete rows, and `confirmSheet({destructive:true})`. Making this Cancel red would break the one place red is doing real work in the app — the live workout. **What *is* wrong with that button:** (a) its label — C-3 says buttons name the action, not "Cancel"; (b) it uses a different button vocabulary (`.btn.btn-secondary`, `active-workout-ui.js:2515`) than the identical form in the equipment library (`.btn-ghost` + `.btn-redesign`, `equipment-library-ui.js:1626-1627`). Fix is in DS-1 below. If you *want* "cancel = red" as a rule, that's a rule change, not a bug — decide it once and write it into the semantics block; I'd advise against it.

What drifted, ranked by how much it undermines the system:

| # | Rule | Status | Evidence |
|---|---|---|---|
| 1 | DS-3 one chip pattern | ❌ | `.filter-pill` and `.onb-chip` — the two classes the rule names as "don't create" — still exist and are used (`utilities.css:425`; `equipment-library-ui.js:2509-2512, 3127-3132`; `exercise-manager-ui.js:147`; settings onboarding ×2). Plus ~12 more chip-shaped families: `quick-add-chip`, `qe-chip`, `vol-chip`, `aw-fastpath-chip`, `coach-chip`, `unit-chip`, `category-pill`, `d-pill`, `bs-sub-chip`, `aw-sheet__chip` (CSS still defined ×4, used ×6). Some are legitimately different shapes (badges); most are `.chip`/`.chip--sm` with a local name. |
| 2 | DS-4 one search field | ❌ | Rule says the sheet-search wrappers "have all been migrated." 3 of 10 search inputs use `.field-search`. The others: `.qa-sheet__search-input` ×3 (`equipment-library-ui.js:1611` custom name, quick-add search, +1), `.function-picker__search`, `.equip-lib-search equip-assign-search` (`:3647`), bare inputs at `active-workout-ui.js:2402` (the equipment sheet — now pinned by `openSheet({search})`, so check whether it should adopt `.field-search` classes or the sheet owns it), `:3521`, `:3683`, `index.html:1009` (`.form-input`). |
| 3 | Buttons: one `.btn-*` system (implied by `buttons.css` + DS-9/10) | ⚠️ | 5 button vocabularies for the same shape: `.btn/.btn-primary/.btn-secondary` (buttons.css), `.btn-redesign` + `.btn-ghost` (**defined in `page-header.css:286-320`**, not buttons.css), `.aw-sheet__action[.primary/.warm/.danger]` (active-workout-v2.css:985), `.btn-icon` (modals.css:598), `.btn-icon-sm` (history.css:329). Same form, two vocabularies: AW add-equipment form vs library custom form (see verdict). |
| 4 | C-3 action-first labels | ⚠️ | 12 × `>Cancel<` buttons (`ai-coach-ui.js:1928`, `equipment-library-ui.js:613,1539,1626,2136`, `error-log-ui.js:204`, `exercise-manager-ui.js:1893`, `settings-ui.js:1163,1305,1436`, `template-selection.js:648`, `active-workout-ui.js:2515`); 1 × `>No<` chip (`equipment-library-ui.js:2615`, paired with "Yes" presumably — chips answering a question are an acceptable exception, but "Not this gym" / "Yes, here" reads better). |
| 5 | C-6 never native dialogs | ❌ (1) | `window.confirm("Delete this weight entry? …")` at `metric-detail-ui.js:94`. Rule says native dialogs were fully migrated in 2026-07 and must not be reintroduced — this one came back. Should be `confirmSheet({ confirmLabel:'Delete entry', destructive:true })`. |
| 6 | C-1 sentence case | ⚠️ | 21 user-visible Title Case strings (see §2 list). Half are in `exercise-ui.js:807-826, 1460, 1567` (overflow menu: `Swap Exercise`, `Show Last Workout`, `Edit Defaults`, `Form Video`, `Hide Video`, `Avg Heart Rate`, `Recent Sessions`) — **first confirm that menu is still reachable from the V2 wizard**; if not, delete it (AP-13 pattern) rather than re-case it. Real ones: `Run Cleanup` / `Not Now` (`app-initialization.js:845,849`), `New Location Detected` / `Change Location` (`index.html:840,873`), `Available Plates` (`plate-calculator.js:113`), `Assign Exercise` (`equipment-library-ui.js:3644`), `Confirm Reassignment` (`exercise-manager-ui.js:1863`), `Strength · Top Lifts` (`metric-detail-ui.js:295`), `Quick Add` (`workout-management-ui.js:481`), `Workout Notes:` (`workout-history.js:900`), `Test Notification` (`push-notification-manager.js:259`). |
| 7 | C-4 punctuation | ⚠️ (3) | Three-dot ellipsis in user copy: `Loading saved errors...` (`error-log-ui.js:92`), `Scanning workouts...` (`exercise-manager-ui.js:1854`). Exclamation on a success toast: `` `"${name}" saved!` `` (`ai-coach-ui.js:1984`) — C-4/C-5 say success toasts don't get `!`. |
| 8 | C-9 terminology ("template" never exposed) | ⚠️ (3) | `settings-ui.js:926` "…all workouts, templates, equipment, and settings"; `app-initialization.js:799` "N template(s) will be updated"; `data-export-import.js:233` label `Templates`. |
| 9 | C-10 icon-only buttons need `aria-label` | ⚠️ (5) | `.d-back` ×3 (`composition-detail-ui.js:41`, `exercise-detail-ui.js:108`, `muscle-group-detail-ui.js:51`), `plate-calculator.js:397` (close ×), `error-log-ui.js:318` (expand chevron). |
| 10 | DS-2 one page header | ⚠️ | `.d-back` is a **fourth** back-button implementation (`detail-pages.css:16`; 44 px, so SH-2a covered its size) alongside `.page-header__back`, `.aw-header`, `.edit-exercise-header`. Already in the shell plan as UX-4 / SH-4 — noting it here so the header migration includes the three drill-down pages. |
| 11 | DS-10 no duplicate class defs | ⚠️ (3) | `.equipment-locations-empty` (nav.css + exercise-lib.css), `.exercise-list-container` (exercise-lib.css + **reset.css**), `.page-header__actions` (page-header.css + equipment-library.css). Within budget (5) but the budget should be 0. |
| 12 | DS-5 color semantics (`--highlight-warm` = superset only) | ✅/⚠️ | Used in 15 AW rules (superset — fine) but also `ai-coach.css` ×5, `compat-badge.css` ×3, `grouped-rows.css`, `dashboard-v2.css`, `history.css`. The AW comment scopes the rule to the active workout page, so this is not a violation — but it means orange means "superset" on one page and "coach / compatible / warning-ish" elsewhere. Decide once whether warm is a page-local or app-wide semantic and write it in `tokens.css`. |
| 13 | **The rules doc itself is stale** | ❌ | DS-2 says `.section-header-row` is *the* pinned header; `page-header.css:134` calls it "legacy" and `.page-header` has 19 uses vs 1. DS-3 and DS-4 both claim migrations that aren't complete (above). `scripts/copy-lint.sh` is unusable — its title-case grep matches code and its ellipsis grep matches every spread operator, so the output is hundreds of lines nobody reads. **A lint nobody can run is why #4–#8 accumulated.** |

Not drift, confirmed fine: inline styles are all `--custom-prop` (DS-8 ok); raw font sizes are the documented one-offs; no raw colors anywhere; `sheet.css`, `shell-hud.css`, `block.css` (new this week) pass every token rule; all `confirmSheet` calls carry a named `confirmLabel`; empty states checked on 6 pages follow the three-part shape.

---

## 1. Why it drifted — and the one fix that stops it

Every ❌ above is a rule that lives only in prose. `design-audit.js` enforces the *token* rules (DS-5/6/7/8/10) and those are clean. The *pattern* rules (DS-1–4, buttons) and the *copy* rules have no script, and `copy-lint.sh` is too noisy to act on. Same lesson as the action plan and the shell plan: **a rule without a budget regresses.** So the fix list ends with a lint that extracts only user-visible strings and fails `--strict` on each copy rule, plus pattern budgets in `design-audit.js`.

---

## 2. Fix phases

### DS-1 — The add-equipment form, both copies (S) — the trigger

- `active-workout-ui.js:2515-2516`: label `Cancel` → `Back to list` (it collapses the form and returns to the search results — name that). Keep it neutral (not red). Use the same classes as the library form, or better, migrate **both** forms to `.btn-ghost` / `.btn-primary` once DS-3 picks the vocabulary.
- `equipment-library-ui.js:1626`: same label rule (`Back to results`), same classes.
- Both forms should render the same chips (`.chip.chip--sm`) and the same field classes (`.field`, `.field-label`, `.field-input`) — the AW form already does; the library form uses `.qa-sheet__search-input` for a name field (DS-4 violation) → `.field-input`.
- Acceptance: the two forms are visually identical screenshots apart from the extra Brand/Unit fields in AW.

### DS-2 — Copy fixes (S) — all 30 lines in one PR

- `metric-detail-ui.js:94` → `confirmSheet({ title:'Delete this weight entry?', body:"This can't be undone.", confirmLabel:'Delete entry', destructive:true })`.
- 12 `Cancel` labels → action names. Suggested: sheets that pick something → `Keep current` / `Close`; the coach reset → `Keep thread`; bug report → `Discard report`; reassign → `Keep assignment`; onboarding experience picker → `Back`. Pick one word per concept and reuse it (C-5 "one canonical phrasing").
- Title case list (#6) → sentence case, after confirming `exercise-ui.js` overflow menu reachability (delete if dead).
- `...` → `…` ×2; `saved!` → `saved` ×1; "templates" → "workouts" ×3 (`settings-ui.js:926`, `app-initialization.js:799`, `data-export-import.js:233`).
- `aria-label` on the 5 icon-only buttons (`Back`, `Close`, `Show details`).

### DS-3 — One button vocabulary (M)

Decide: `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-icon`, sizes `.btn-sm` / `.btn-block`. Then:
- Move `.btn-redesign` and `.btn-ghost` out of `page-header.css:286-320` into `buttons.css`; alias `.btn-redesign` → `.btn-primary` and delete after the 9 call sites migrate. Move `.btn-icon` (modals.css:598) and `.btn-icon-sm` (history.css:329) into buttons.css as `.btn-icon` / `.btn-icon.btn-sm`.
- `.aw-sheet__action` stays as the sheet-footer layout class but its colors come from the same modifiers: `.aw-sheet__action.btn-primary` etc. (or `sheet.css` defines `.sheet__action` once and `aw-sheet__action` dies with SH-3).
- `page-header__save` (20 uses) is fine as a header-specific element.
- Test: `tests/unit/button-vocab.test.js` — every rendered `<button` in `js/` carries one of the allowed classes or a documented component class; same shape as `window-wiring.test.js`.

### DS-4 — Chips and search fields: finish the migrations the rules claim (M)

- `.filter-pill` → `.chip.chip--sm` (+ `.active`); delete `utilities.css:425-445`; update the two `querySelectorAll('.filter-pill')` sites.
- `.onb-chip` is a selectable card, not a chip — rename to `.onb-option` (BEM, DS-9) so the rule's name list is true again.
- `quick-add-chip`, `qe-chip`, `coach-chip`, `unit-chip`, `category-pill`, `d-pill`, `bs-sub-chip` → audit each: if it's `.chip` with a color, use `.chip` + a modifier (`chip--cat-push` exists); if it's a badge (non-interactive, inline), it's allowed but should be named `*-badge`. `aw-sheet__chip` CSS ×4 → delete once the 6 uses are `.chip`.
- Search: every `placeholder="Search…"` input inside `.field-search` (with `--sticky` where pinned). `qa-sheet__search-input` → `.field-search`; `.function-picker__search`, `.equip-lib-search` → `.field-search`. For inputs inside `openSheet({search})`, the primitive should render `.field-search` markup itself so callers can't drift.

### DS-5 — Guardrails: make the prose rules executable (S/M)

1. **`scripts/copy-lint.mjs`** (replace `copy-lint.sh`): extract only user-visible strings — text between `>` and `<` in template literals, arguments of `showNotification`/`confirmSheet`/`promptSheet`, `placeholder=`, `aria-label=`, `title:`/`confirmLabel:` — skipping comments, `console.*`, `debugLog`, `debug-utilities.js`, catalog/data files. Check: Title Case outside an exception list (brands, categories, weekdays, acronyms — seed from CLAUDE.md C-1 and the catalog brand names), `Please`, `...`, `!` on a success toast, `Are you sure`, `successfully`, `cannot`, `>Cancel<`/`>OK<`/`>Submit<`, `template` in user copy, `window.confirm|alert|prompt(`, icon-only `<button>` without `aria-label`. Print file:line + the string; `--strict` exits 1 on any hit. Today's counts become the baseline; ratchet to 0 with DS-2.
2. **`design-audit.js` budgets** — add: `buttonClassesOutsideButtonsCss` (any `.btn*` selector defined outside buttons.css → 0), `chipLikeClassesOutsideChipsCss` (`*chip*|*pill*` selectors outside chips.css, allow-list `*-badge`), `searchInputsOutsideFieldSearch` (→ 0), `backButtonImplementations` (selectors matching `back` outside page-header.css → 0, pairs with SH-4), `nativeDialogs` (→ 0). Tighten: `inlineStylesInJs` 15→10, `rawFontSizeInPages` 12→10, `duplicateClassDefs` 5→3 now, →0 after fixing the three.
3. **`npm run check`** = `lint` + `audit:design:strict` + `copy-lint --strict` + `test`; CLAUDE.md "Quality Checks Before Declaring Work Done" points at it. One command, or none of this sticks.
4. **Fix the rules doc.** DS-2 → `.page-header` is the one header (`.section-header-row` legacy, 1 use). DS-3/DS-4 → state the real status and point at the budgets instead of claiming "migrated". Add a **Buttons** rule (DS-3 above) and a **Color semantics** rule lifted from `active-workout-v2.css:4-10` into `tokens.css` as the app-wide meaning of primary/success/warm/danger/warning — with the decision on `--highlight-warm` (#12) written down.

---

## 3. Phase index

| Phase | Size | One-line |
|---|---|---|
| DS-1 | S | add-equipment form ×2: action-named back button, same classes, same fields |
| DS-2 | S | 30 copy fixes: native confirm, 12 Cancels, 21 title-case, …/!, "template", 5 aria-labels |
| DS-3 | M | one button vocabulary in buttons.css; retire `.btn-redesign`, move `.btn-ghost`/`.btn-icon*`; button-vocab test |
| DS-4 | M | chips → `.chip` (kill `.filter-pill`, rename `.onb-chip`); every search input → `.field-search` |
| DS-5 | S/M | `copy-lint.mjs` with real string extraction, pattern budgets in design-audit, `npm run check`, rules doc corrected |

**Order:** DS-5 step 1 first (you can't see drift without the lint), then DS-1 + DS-2 together, then DS-3, DS-4. Total ≈ 2 evenings of mechanical work; DS-2 and DS-4 are good agent tasks because every item is a grep-verifiable before/after.
