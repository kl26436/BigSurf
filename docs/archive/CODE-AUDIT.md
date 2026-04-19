# Big Surf Code & Mockup Audit

**Date**: April 18, 2026  
**Purpose**: Identify inconsistencies, broken functionality, missing implementations, and cleanup needed across code, CSS, mockups, and implementation MDs.

---

## Critical Bugs (Will Crash or Break Functionality)

### 1. `toggleRestTimer()` and `skipRestTimer()` — Functions Don't Exist

**Location**: `index.html` lines 646 and 649  
**Problem**: The header rest timer HTML has `onclick="toggleRestTimer()"` and `onclick="skipRestTimer()"`, but these functions are never defined or exported to `window`. The actual functions in `rest-timer.js` are named `toggleModalRestTimer()` and `skipModalRestTimer()` (which take an `exerciseIndex` argument), plus `skipHeaderRestTimer()`.  
**Impact**: Clicking pause or skip on the header rest timer throws a ReferenceError. Timer is stuck once started.  
**Fix**: Either rename the HTML handlers to match the exported functions, or create `toggleRestTimer` / `skipRestTimer` wrapper functions and export them to `window` in `main.js`.

---

## Moderate Issues (Working but Inconsistent or Messy)

### 2. Duplicate CSS Files (Old + New Both Loaded)

**Files**:
- `styles/pages/dashboard.css` (1,196 lines) — OLD dashboard styles
- `styles/pages/dashboard-v2.css` (388 lines) — NEW dashboard styles
- `styles/pages/workout.css` (1,138 lines) — OLD workout styles
- `styles/pages/active-workout-v2.css` (1,053 lines) — NEW workout styles

**Problem**: Both old and new versions are imported in `styles/index.css`. This creates ~2,300 lines of dead CSS with potential cascade conflicts where old rules override new ones unpredictably.  
**Fix**: After confirming V2 pages work correctly, remove old `dashboard.css` and `workout.css` from `index.css` imports (keep files briefly for rollback, then delete).

### 3. Inline Styles in JavaScript (Violates CLAUDE.md Rules)

**Worst offenders**:
- `js/core/features/ai-coach-ui.js` — Inline styles on prompt card icons (`style="background:rgba(...);"`)
- `js/core/app-initialization.js` — Loading screen uses `element.style.opacity` and `element.style.display` 
- `js/core/data/data-manager.js` — Template literals with inline `style=` attributes
- `js/core/workout/exercise-ui.js` — Multiple `style=` attributes on set rows and form elements
- `js/core/workout/active-workout-ui.js` — Color and sizing inline styles

**Fix**: Extract all inline styles into CSS classes. For dynamic values (percentages, positions), use CSS custom properties set via JS.

### 4. Hardcoded Colors in CSS Components

**Files**:
- `styles/components/page-header.css` line 46: `color: #04201a;`
- `styles/components/grouped-rows.css` line 138: `background: #04201a;`
- `styles/components/segmented-control.css` line 29: `color: #04201a;`

**Fix**: Replace with `var(--bg-app)` or appropriate token from `tokens.css`.

### 5. Page Header CSS Class Names Don't Match Spec

**Problem**: `styles/components/page-header.css` uses `.btn-save`, `.page-title` class names, but `PAGES-REDESIGN-IMPLEMENTATION.md` specifies BEM naming: `.page-header__save`, `.page-header__title`.  
**Impact**: Pages using the old class names work; pages trying to follow the spec won't get styled.  
**Fix**: Standardize on one naming convention (BEM preferred) and update all references.

---

## Missing Implementations

### 6. Drill-Down Page CSS Partially Missing

**Status**: `styles/pages/detail-pages.css` exists with `.d-header`, `.d-back`, etc. — the shared drill-down shell is styled.  
**What's missing**: Some chart and set-chip classes from the mockup (`dashboard-final-v2.html`) may not be fully ported. The composition detail page may be missing some specific styles.  
**Fix**: Cross-reference `mockups/dashboard-final-v2.html` CSS blocks against `detail-pages.css` and `dashboard-v2.css` to find any gaps.

### 7. Stats Page Not Fully Deleted

**Status**: `stats-ui.js` is confirmed GONE — good. But check if:
- Any "stats" route references remain in navigation
- The stats nav tab is fully removed from bottom nav HTML
- Any imports reference the deleted file

This appears clean based on audit — just flag for verification.

---

## Cleanup Needed

### 8. Obsolete Implementation MDs

These files are cluttering the project root and may confuse future Claude Code sessions:

| File | Status | Action |
|------|--------|--------|
| `UX-IMPLEMENTATION-GUIDE.md` | Superseded by Master | Delete |
| `UX-MASTER-IMPLEMENTATION-GUIDE.md` | Partially superseded by V2 MDs | Keep for nav reference, mark sections as done |
| `UX-VISUAL-POLISH-GUIDE.md` | May be stale | Review, delete if covered by V2 |
| `UX-WORLD-CLASS-GUIDE.md` | May be stale | Review, delete if covered by V2 |
| `DASHBOARD-IMPLEMENTATION.md` | Phase 1, shipped | Can delete (V2 supersedes) |
| `EQUIPMENT-WEIGHT-IMPLEMENTATION.md` | Shipped | Can delete |
| `ENHANCEMENTS.md` | Unknown status | Review |
| `PLAN.md` | Old planning doc | Review, likely delete |
| `workout-app-backlog.md` | Old backlog | Review |

### 9. Obsolete Mockups

Several mockups are superseded by final versions:

| File | Status | Action |
|------|--------|--------|
| `mockups/dashboard-final.html` | Superseded by `dashboard-final-v2.html` | Delete |
| `mockups/dashboard-options.html` | Design exploration, done | Delete |
| `mockups/dashboard-health-style.html` | Design exploration, done | Delete |
| `mockups/dashboard-active-workout.html` | Merged into V2 | Delete |
| `mockups/dashboard-bodypart-options.html` | Design exploration, done | Can keep for reference or delete |
| `mockups/active-workout-options.html` | Design exploration, done | Can keep for reference or delete |
| `mockups/active-workout-locked.html` | Superseded by `active-workout-v2.html` | Delete |
| `mockups/stats-redesign.html` | Stats absorbed into dashboard | Delete |

**Keep**: `active-workout-v2.html`, `dashboard-final-v2.html`, `forms-redesign.html`, `settings-onboarding-redesign.html`, `features-redesign.html`, `create-workout-redesign.html`, `workout-page-flow.html`

---

## Consistency Checklist

### What's Consistent (Good)
- Navigation module (`navigation.js`) is clean and complete — all 14 section IDs present in HTML
- Bottom nav 5-tab structure with FAB dumbbell — working
- More menu bottom sheet with drag-to-dismiss — working
- Design tokens in `tokens.css` are comprehensive
- Component CSS files match PAGES-REDESIGN spec (chips, fields, grouped-rows, segmented-control all exist)
- `editBodyWeight()` IS properly exported to window (initial audit concern was wrong — verified it's in `main.js:813`)
- `awMoveExercise()` IS properly exported (in `active-workout-ui.js:1489`, imported in `main.js:117`, assigned to `window:552`)

### What's Inconsistent
- Old + new CSS loaded simultaneously (dashboard, workout)
- Mix of inline styles and CSS classes in feature modules
- Hardcoded hex values in 3 component CSS files
- Page header class names diverge from BEM spec
- Header rest timer onclick handlers reference non-existent functions

---

## Recommended Fix Order

1. **Fix rest timer crash** — wire up `toggleRestTimer` / `skipRestTimer` (5 min fix)
2. **Remove old CSS imports** — drop `dashboard.css` and `workout.css` from `index.css` after testing (verify no regressions)
3. **Fix hardcoded colors** — replace 3 hex values with tokens
4. **Clean up inline styles** — prioritize `ai-coach-ui.js` and `exercise-ui.js`
5. **Delete obsolete mockups** — reduce confusion for future sessions
6. **Delete obsolete MDs** — keep only active implementation docs
7. **Standardize page-header class names** — pick BEM or current, not both
