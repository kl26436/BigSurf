# Big Surf — Master UX Implementation Guide

> **Purpose**: Single source of truth for transforming Big Surf from a feature-rich app into a focused, world-class workout experience. This guide is designed for Claude Code to implement section-by-section.
>
> **Core philosophy**: Action > Information. Every screen should answer ONE question clearly. Remove, don't add.
>
> **Supersedes**: UX-IMPLEMENTATION-GUIDE.md, UX-VISUAL-POLISH-GUIDE.md, UX-WORLD-CLASS-GUIDE.md (those remain as reference but this guide is the execution plan)

---

## Table of Contents

1. [CSS Token Adoption (Foundation)](#1-css-token-adoption)
2. [Dashboard Overhaul](#2-dashboard-overhaul)
3. [Workout Selector Redesign](#3-workout-selector-redesign)
4. [Active Workout Tightening](#4-active-workout-tightening)
5. [Exercise Card Optimization](#5-exercise-card-optimization)
6. [Set Table & Input Polish](#6-set-table--input-polish)
7. [Stats Page Focus](#7-stats-page-focus)
8. [History Page Cleanup](#8-history-page-cleanup)
9. [Exercise Library Polish](#9-exercise-library-polish)
10. [Equipment Library Polish](#10-equipment-library-polish)
11. [Card & Background Contrast](#11-card--background-contrast)
12. [Typography Hierarchy](#12-typography-hierarchy)
13. [Micro-animations](#13-micro-animations)
14. [Implementation Order](#14-implementation-order)

---

## 1. CSS Token Adoption

**Problem**: 273 hardcoded font-sizes, 457 raw px padding/margin values, 146 scattered rgba() values, 39 raw border-radius values. The token system in `tokens.css` exists but adoption is ~30%. This is why spacing feels inconsistent.

**Goal**: 95%+ token adoption across all CSS files.

### Files to modify (in order)
1. `styles/pages/workout.css` (largest offender)
2. `styles/pages/dashboard.css`
3. `styles/components/nav.css`
4. `styles/pages/templates.css`
5. `styles/pages/stats.css`
6. `styles/pages/exercise-lib.css`
7. `styles/pages/history.css`
8. `styles/pages/settings.css`
9. `styles/pages/body-measurements.css`
10. `styles/pages/plate-calculator.css`
11. `styles/pages/ai-coach.css`
12. `styles/pages/dexa.css`
13. `styles/components/modals.css`
14. `styles/components/forms.css`
15. `styles/components/buttons.css`

### Token mapping reference

**Font sizes** — replace ALL raw rem/px font values:
```
0.65rem → var(--font-2xs)    (add to tokens if missing, value: 0.65rem)
0.75rem → var(--font-xs)
0.8rem  → var(--font-xs)     (close enough, or add --font-xs-plus: 0.8rem)
0.85rem → var(--font-sm)
0.9rem  → var(--font-sm)
0.95rem → var(--font-base)
1rem    → var(--font-base)
1.05rem → var(--font-md)
1.1rem  → var(--font-md)
1.2rem  → var(--font-lg)
1.3rem  → var(--font-lg)
1.4rem  → var(--font-display-sm)
1.5rem  → var(--font-xl)
1.8rem  → var(--font-2xl)
2rem    → var(--font-display)
2.5rem  → var(--font-3xl)
```

If a value doesn't have a close token match, add the token to `tokens.css` first. The goal is zero raw font values in page/component CSS.

**Spacing** — replace ALL raw px padding/margin/gap values:
```
2px  → var(--space-2)
3px  → var(--space-4)   (round to nearest)
4px  → var(--space-4)
6px  → var(--space-6)
8px  → var(--space-8)
10px → var(--space-10)
12px → var(--space-12)
14px → var(--space-16)  (round to nearest grid point)
16px → var(--space-16)
20px → var(--space-20)
24px → var(--space-24)
32px → var(--space-32)
40px → var(--space-32)  (or add --space-40)
```

For card-specific padding, use `var(--pad-card-x)` and `var(--pad-card-y)`.
For section gaps, use `var(--gap-section)` and `var(--gap-items)`.

**Border-radius** — replace ALL raw radius values:
```
4px   → var(--radius-xs)
6px   → var(--radius-xs)
8px   → var(--radius-sm)
10px  → var(--radius-sm)
12px  → var(--radius-md)
16px  → var(--radius-lg)
20px  → var(--radius-pill)  (if pill-shaped, use 999px)
50%   → var(--radius-pill)  (for circles, 50% or 999px)
999px → var(--radius-pill)
```

**Colors** — replace ALL hardcoded rgba/hex values:
```
rgba(255, 255, 255, 0.04) → var(--border-subtle)
rgba(255, 255, 255, 0.06) → var(--border-subtle)
rgba(255, 255, 255, 0.08) → var(--border-light)
rgba(255, 255, 255, 0.1)  → var(--border-light)
rgba(255, 255, 255, 0.12) → var(--border-medium)
rgba(255, 255, 255, 0.15) → var(--border-medium)

rgba(29, 211, 176, 0.05)  → var(--primary-bg-subtle)   ✅ already in tokens.css
rgba(29, 211, 176, 0.08)  → var(--primary-bg-subtle)
rgba(29, 211, 176, 0.12)  → var(--primary-bg)           ✅ already in tokens.css
rgba(29, 211, 176, 0.15)  → var(--primary-bg)
rgba(29, 211, 176, 0.2)   → var(--primary-bg-strong)    ✅ already in tokens.css
rgba(29, 211, 176, 0.3)   → var(--primary-border)       ✅ already in tokens.css

rgba(54, 196, 107, 0.12)  → var(--success-bg)           ✅ already in tokens.css
rgba(54, 196, 107, 0.15)  → var(--success-bg)
rgba(54, 196, 107, 0.2)   → var(--success-border)       ✅ already in tokens.css

rgba(239, 68, 68, 0.15)   → var(--danger-bg)            ✅ already in tokens.css
rgba(239, 68, 68, 0.3)    → var(--danger-border)        ✅ already in tokens.css

rgba(247, 168, 101, 0.15) → var(--warning-bg)           ✅ already in tokens.css

rgba(0, 0, 0, 0.15)       → var(--overlay-subtle)       ✅ already in tokens.css
rgba(0, 0, 0, 0.2)        → var(--overlay-light)        ✅ already in tokens.css
rgba(0, 0, 0, 0.5)        → var(--overlay-medium)       ✅ already in tokens.css

#fff, #ffffff, white       → var(--text-strong) or keep as `white` only for button text on colored backgrounds
#ef4444                    → var(--danger)
#ff9500                    → var(--warning) or var(--cat-core)
#5856d6                    → var(--cat-other) if it's a category color
#02100e                    → replace with appropriate bg token
```

### ⚠️ CRITICAL: Create missing token definitions FIRST

**The current `tokens.css` only defines colors, radius, and shadows.** The entire space scale, font scale, border variants, animation tokens, category colors, layout tokens, and icon/input sizes are **used across the CSS but never defined** — they resolve to nothing/initial values. This is why spacing and typography feel broken.

**Step 0 — before any token adoption work**: Add ALL of the following to `styles/tokens.css` inside the existing `:root { }` block. These are net-new tokens that don't exist yet.

> **Why this matters**: Without these definitions, every `var(--space-8)`, `var(--font-sm)`, `var(--border-light)`, etc. in the CSS resolves to nothing — the browser falls back to initial/inherited values, producing the inconsistent spacing and broken typography. The mockups look clean because they define these tokens locally. This step makes the app match the mockups.

```css
/* =========================================
   SPACING SCALE (4px base grid)
   ========================================= */
--space-2: 2px;
--space-4: 4px;
--space-6: 6px;
--space-8: 8px;
--space-10: 10px;
--space-12: 12px;
--space-16: 16px;
--space-20: 20px;
--space-24: 24px;
--space-32: 32px;
--space-40: 40px;
--space-48: 48px;
--space-80: 80px;

/* =========================================
   LAYOUT TOKENS (card & section spacing)
   ========================================= */
--pad-card-x: 16px;          /* Horizontal padding inside cards */
--pad-card-y: 14px;          /* Vertical padding inside cards */
--pad-page: 18px;            /* Page-level horizontal padding */
--gap-items: 12px;           /* Gap between sibling items in a list */
--gap-section: 24px;         /* Gap between major sections */

/* =========================================
   TYPOGRAPHY SCALE
   ========================================= */
--font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
--font-2xs: 0.65rem;         /* 10.4px — badges, micro labels */
--font-xs: 0.7rem;           /* 11.2px — captions, timestamps */
--font-sm: 0.8rem;           /* 12.8px — secondary text, metadata */
--font-base: 0.9rem;         /* 14.4px — body text, inputs */
--font-md: 1rem;             /* 16px — card titles, nav labels */
--font-lg: 1.15rem;          /* 18.4px — section headers */
--font-xl: 1.4rem;           /* 22.4px — page titles */
--font-2xl: 2rem;            /* 32px — hero stats */
--font-3xl: 2.5rem;          /* 40px — giant display numbers */
--font-display: 2rem;        /* Alias for large display text */
--font-display-sm: 1.4rem;   /* 22.4px — smaller display text */
--font-display-weight: 800;  /* Display font weight — bold/heavy for stat emphasis */

/* =========================================
   BORDER VARIANTS
   ========================================= */
--border-subtle: rgba(255, 255, 255, 0.04);
--border-light: rgba(255, 255, 255, 0.08);
--border-medium: rgba(255, 255, 255, 0.12);
--accent-bar: 3px;           /* Thickness for card accent bar stripes */

/* =========================================
   ANIMATION TOKENS
   ========================================= */
--anim-fast: 100ms;
--anim-normal: 200ms;
--anim-slow: 300ms;
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

/* =========================================
   TOUCH TARGET SIZES (min tap areas, NOT transforms)
   ========================================= */
--tap: 44px;                 /* iOS minimum touch target height */
--tap-sm: 36px;              /* Compact touch target (secondary actions) */

/* =========================================
   CATEGORY COLORS (solid — for text, icons, dots)
   Derived from existing --cat-*-bg tokens in tokens.css.
   These are the solid-color counterparts.
   ========================================= */
--cat-push: #4A90D9;         /* Blue — matches cat-push-bg: rgba(74,144,217) */
--cat-pull: #D94A7A;         /* Pink — matches cat-pull-bg: rgba(217,74,122) */
--cat-legs: #7B4AD9;         /* Purple — matches cat-legs-bg: rgba(123,74,217) */
--cat-core: #4AD9A7;         /* Green — new, for core-focused exercises */
--cat-cardio: #D9A74A;       /* Gold — matches cat-cardio-bg: rgba(217,167,74) */
--cat-other: #64748b;        /* Slate — general fallback */
--cat-arms: #E06C75;         /* For arms-specific if needed */
--cat-fullbody: #56B6C2;     /* For full-body workouts if needed */
--cat-custom: #ABB2BF;       /* For user-created categories */

/* =========================================
   ICON SIZES
   ========================================= */
--icon-xs: 20px;
--icon-sm: 28px;
--icon-md: 40px;
--icon-lg: 48px;
--icon-xl: 56px;

/* =========================================
   INPUT TOKENS
   ========================================= */
--input-height: 44px;        /* iOS minimum touch target */
--bg-input: var(--bg-surface);

/* =========================================
   INTERACTIVE STATE TOKENS
   ========================================= */
--bg-card-hover: rgba(255, 255, 255, 0.04);

/* =========================================
   BADGE SOLID COLORS (text/icon on badge backgrounds)
   ========================================= */
--badge-gold: #ffd700;
--badge-silver: #c0c0c0;
--badge-bronze: #cd7f32;
--badge-purple: #9370db;
--badge-orange: #ff8c00;

/* =========================================
   STAT TOKENS (for stats page)
   ========================================= */
--stat-exercises: var(--primary);
--stat-exercises-bg: var(--primary-bg);
--stat-negative: var(--danger);

/* =========================================
   ADDITIONAL SEMANTIC COLOR TOKENS
   (only add those not already in tokens.css)
   ========================================= */
--warning-rgb: 245, 158, 11; /* For rgba() usage: rgba(var(--warning-rgb), 0.12) */
```

### Tokens already defined in `tokens.css` (no changes needed)

These are already present and correct — do not duplicate:
- Colors: `--primary`, `--primary-dark`, `--success`, `--danger`, `--warning`, `--highlight-warm`, `--highlight-warm-dark`
- Backgrounds: `--bg-app`, `--bg-surface`, `--bg-card`, `--bg-card-hi`, `--bg-secondary`
- Text: `--text-strong`, `--text-main`, `--text-primary`, `--text-muted`, `--text-secondary`
- Borders: `--border`, `--border-accent`
- Radius: `--radius-xs` (4px), `--radius-sm` (12px), `--radius-md` (16px), `--radius-lg` (20px), `--radius-pill` (999px)
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- Semantic colors: `--primary-bg-subtle`, `--primary-bg`, `--primary-bg-strong`, `--primary-border`, `--primary-bg-hover`, intensity variants, `--success-bg`, `--success-border`, `--danger-bg`, `--danger-border`, `--danger-bg-hover`, `--warning-bg`, `--warning-border`, `--warning-bg-subtle`, `--warning-moderate`, overlays, badge backgrounds, streak/highlight tokens, achievement tokens, `--favorite-border`, category backgrounds (`--cat-push-bg`, `--cat-pull-bg`, `--cat-legs-bg`, `--cat-cardio-bg`)

### Radius value alignment note

The mockups use slightly different radius values (6px, 10px, 50px) vs what tokens.css defines (4px, 12px, 16px, 20px, 999px). **Keep the existing tokens.css values** — they are the app's established design language. The mockups are illustrative, not pixel-perfect specs. The token names (`--radius-sm`, `--radius-md`, etc.) are what matter for consistency.

### Validation
After completing token adoption for each file:
- `grep -c 'px\|rem' styles/pages/workout.css` should return close to zero (only dynamic calc() values or 0px/1px borders should remain)
- Visual regression: the app should look identical before and after — this is a refactor, not a redesign

---

## 2. Dashboard Overhaul — REVISED (Metrics-first hybrid)

> **Revision note**: The original Section 2 (Hero Workout Card + compact progress) has been replaced with a **metrics-first hybrid** design. Starting a workout now happens from the nav bar's center (+) button, not from a dashboard CTA. This solves the "giant start button for a workout I don't want to do" problem — the dashboard is informational only, and workout selection is one nav tap away. Mockup: `mockups/dashboard-final.html`.

**Problem (original)**: Dashboard was data-heavy and had a dominant "START WORKOUT" card that was wrong whenever the suggested template didn't match what the user wanted to train that day.

**Goal (revised)**: Dashboard answers "How am I doing?" with tight, glanceable metrics + recent activity. It does NOT answer "What should I do?" — that's the nav-bar (+)'s job.

### New Dashboard Structure (Hybrid)

```
┌─────────────────────────────────┐
│ Good morning             [👤]   │  ← Greeting + avatar
│ Tuesday, April 14               │
├─────────────────────────────────┤
│ ┌──────────┐ ┌──────────────┐  │
│ │ STREAK   │ │  ○ ring 4/5  │  │  ← 2-card metrics grid
│ │ 🔥 21    │ │   This week  │  │
│ │ days     │ │              │  │
│ └──────────┘ └──────────────┘  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ This week       ↑12% volume │ │  ← Week timeline + trend chip
│ │ ● ● ● ● ◉ ○ ○              │ │
│ │ M T W T F S S              │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 💡 Bench has plateaued 3    │ │  ← ONE insight
│ │    sessions. Try a deload.  │ │
│ └─────────────────────────────┘ │
│                                 │
│ Recent Workouts        History→│
│ ┌─────────────────────────────┐ │
│ │ [ic] Chest & Tri   [▶]     │ │  ← Each row has its own play
│ │ [ic] Back & Bi     [▶]     │ │     button for one-tap restart
│ │ [ic] Leg Day       [▶]     │ │
│ └─────────────────────────────┘ │
│                                 │
│ Recent PRs             All→    │
│ 🏆 Bench · +5 lb     225 lb    │
│ 🏆 Deadlift · +10 lb 315 lb    │
└─────────────────────────────────┘
       ↑ no hero CTA — start via nav (+)
```

### Nav bar structure (required change)

The bottom nav becomes a **5-tab with elevated center primary**:

| Position | Label | Icon | Behavior |
|----------|-------|------|----------|
| 1 | Home | `fa-home` | Dashboard (this page) |
| 2 | Stats | `fa-chart-line` | Stats page |
| 3 (center) | — | `fa-plus` | **Workout picker** (elevated green FAB-style, `transform: translateY(-10px)`, `var(--shadow-md)`) |
| 4 | History | `fa-calendar` | History page |
| 5 | More | `fa-ellipsis-h` | More menu (settings, exercise library, equipment, DEXA, etc.) |

Center (+) opens the **Workout page** (Section 3 — unified selector + editor, already implemented). This is the *only* path to start a workout from the dashboard.

### Implementation Details

> **Animation tokens**: All expand/collapse and hover interactions MUST use the already-defined tokens from `tokens.css`: `var(--anim-fast)` (100ms), `var(--anim-normal)` (200ms), `var(--anim-slow)` (300ms), and `var(--ease-out-expo)`. Do NOT introduce new durations. Tap/press feedback uses `transform: scale(0.98)` with `transition: transform var(--anim-fast)`. This matches Section 3 (workout page) and Section 13 (micro-animations) already shipped.

#### 2a. Remove from the current dashboard

**File**: `js/core/ui/dashboard-ui.js`

Delete or disable these (they were part of the v1 hero-card design):
- `renderHeroWorkoutCard()` and all references to it
- `.hero-workout-card` and `.btn-hero-start` CSS in `styles/pages/dashboard.css`
- Any "Suggested Workout" logic pulling today's template into a CTA

Also remove (holdovers from the original data-heavy dashboard):
- DEXA card on dashboard (stays on DEXA detail view only)
- Top Exercise mini-chart (lives on Stats page)
- Multiple insights list (keep only `getTopInsight()`)
- Separate streak section (now merged into the metrics grid)

**File**: `js/core/features/training-insights.js`

Keep `getTopInsight()` returning only the single highest-priority insight. No changes needed if already implemented per v1.

#### 2b. Greeting header

**File**: `js/core/ui/dashboard-ui.js`

```javascript
function renderGreetingHeader() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return `
        <div class="dash-greeting">
            <div class="dash-greeting__text">
                <h2>${greeting}</h2>
                <span>${dateStr}</span>
            </div>
            <div class="dash-greeting__avatar" onclick="showSettings()"></div>
        </div>
    `;
}
```

#### 2c. Metrics grid — Streak + Weekly ring side-by-side

Replaces both the standalone streak card AND the large centered weekly ring.

```javascript
function renderMetricsGrid(streakDays, weekCompleted, weekGoal) {
    const ringPct = Math.min(100, (weekCompleted / weekGoal) * 100);
    const circumference = 107; // 2 * π * 17
    const offset = circumference - (circumference * ringPct / 100);
    return `
        <div class="dash-metrics-grid">
            <div class="hero-card dash-metric dash-metric--streak">
                <div class="dash-metric__label">Streak</div>
                <div class="dash-metric__value">${streakDays}</div>
                <div class="dash-metric__sub">days <i class="fas fa-fire"></i></div>
            </div>
            <div class="hero-card dash-metric dash-metric--ring">
                <svg class="dash-ring-svg" viewBox="0 0 40 40" aria-hidden="true">
                    <circle cx="20" cy="20" r="17" class="dash-ring-track"/>
                    <circle cx="20" cy="20" r="17" class="dash-ring-fill"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"
                            transform="rotate(-90 20 20)"/>
                </svg>
                <div class="dash-metric__ring-info">
                    <div class="dash-metric__value dash-metric__value--sm">${weekCompleted}/${weekGoal}</div>
                    <div class="dash-metric__sub">This week</div>
                </div>
            </div>
        </div>
    `;
}
```

#### 2d. Week timeline — dots + volume trend chip

Replaces the previous "Compact Progress Block" inline progress bar.

```javascript
function renderWeekTimeline(weekWorkouts, volumeDeltaPct) {
    const days = ['M','T','W','T','F','S','S'];
    const todayIdx = (new Date().getDay() + 6) % 7; // Monday=0
    const dotsHtml = days.map((d, i) => {
        const done = weekWorkouts.includes(i);
        const today = i === todayIdx;
        const cls = done ? 'done' : today ? 'today' : '';
        const inner = done ? '<i class="fas fa-check"></i>' : today ? '<i class="fas fa-circle"></i>' : '';
        return `<div class="dash-day"><div class="dash-day__label">${d}</div><div class="dash-day__circle ${cls}">${inner}</div></div>`;
    }).join('');
    const trendSign = volumeDeltaPct >= 0 ? '↑' : '↓';
    const trendCls = volumeDeltaPct >= 0 ? 'trend-up' : 'trend-down';
    return `
        <div class="hero-card dash-timeline">
            <div class="dash-timeline__head">
                <h3>This week</h3>
                <span class="dash-timeline__trend ${trendCls}">${trendSign} ${Math.abs(volumeDeltaPct)}% volume</span>
            </div>
            <div class="dash-timeline__dots">${dotsHtml}</div>
        </div>
    `;
}
```

#### 2e. Single insight card — unchanged from v1

Keep existing `renderSingleInsight()` and `getTopInsight()`. Use `.hero-card` variant with primary-tinted bg.

#### 2f. Recent Workouts list — NEW (this is the key delta)

A list of the last 3–5 unique workouts, each with its own play button for one-tap restart. Uses the existing `.row-card` pattern.

```javascript
function renderRecentWorkoutsList(recentWorkouts) {
    if (!recentWorkouts || recentWorkouts.length === 0) return '';
    const items = recentWorkouts.slice(0, 3).map(w => {
        const category = classifyWorkoutCategory(w.workoutType); // push|pull|legs|core|cardio
        const icon = getCategoryIcon(category);
        const when = relativeDayLabel(w.date); // "Yesterday", "Sunday", "3 days ago"
        const durationMin = Math.round((w.totalDuration || 0) / 60);
        const exCount = Object.keys(w.exercises || {}).length;
        return `
            <div class="row-card dash-recent-row" onclick="startWorkoutFromHistory('${w.id}')">
                <div class="dash-recent__icon cat-bg-${category}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="dash-recent__info">
                    <div class="dash-recent__name">${escapeHtml(w.workoutType)}</div>
                    <div class="dash-recent__meta">${when} · ${exCount} exercises · ${durationMin} min</div>
                </div>
                <button class="dash-recent__play" onclick="event.stopPropagation(); startWorkoutFromHistory('${w.id}')" aria-label="Restart this workout">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `;
    }).join('');
    return `
        <div class="dash-section-head">
            <h3>Recent Workouts</h3>
            <a onclick="showHistory()">History →</a>
        </div>
        ${items}
    `;
}
```

`startWorkoutFromHistory(workoutId)` should:
1. Find the workout doc by ID
2. Find the matching template by `workoutType` name; if found, call `startWorkout(templateId)`
3. If no matching template exists, build a one-off session from the workout's exercises (same data shape as a template start)

Add to `main.js`:
```javascript
import { startWorkoutFromHistory } from './core/ui/dashboard-ui.js';
window.startWorkoutFromHistory = startWorkoutFromHistory;
```

#### 2g. Recent PRs — compact rows

Keep at ~3 items. Tap a row to open PR detail.

```javascript
function renderRecentPRsList(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';
    const items = recentPRs.slice(0, 3).map(pr => `
        <div class="row-card dash-pr-row" onclick="showPRDetail('${pr.exerciseName}')">
            <div class="dash-pr__badge"><i class="fas fa-trophy"></i></div>
            <div class="dash-pr__info">
                <div class="dash-pr__name">${escapeHtml(pr.exerciseName)}</div>
                <div class="dash-pr__meta">${relativeDayLabel(pr.date)} · +${pr.delta} ${pr.unit}</div>
            </div>
            <div class="dash-pr__value">${pr.value} ${pr.unit}</div>
        </div>
    `).join('');
    return `
        <div class="dash-section-head">
            <h3>Recent PRs</h3>
            <a onclick="showPRs()">All →</a>
        </div>
        ${items}
    `;
}
```

#### 2h. Render order in `renderDashboard()`

```javascript
async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    // 1. Greeting
    container.innerHTML += renderGreetingHeader();

    // 2. Metrics grid — streak + weekly ring
    container.innerHTML += renderMetricsGrid(streakDays, weekCompleted, weekGoal);

    // 3. Week timeline with volume trend
    container.innerHTML += renderWeekTimeline(weekWorkouts, volumeDeltaPct);

    // 4. ONE insight (optional)
    const topInsight = getTopInsight(recentWorkouts);
    if (topInsight) container.innerHTML += renderSingleInsight(topInsight);

    // 5. Recent Workouts list (NEW — this is the "A" part of the hybrid)
    container.innerHTML += renderRecentWorkoutsList(recentWorkouts);

    // 6. Recent PRs
    if (recentPRs.length > 0) container.innerHTML += renderRecentPRsList(recentPRs);

    // REMOVED: hero workout card, large centered weekly-goal ring, dedicated streak card,
    // compact stats row, body metrics collapsible (lives on Stats now), DEXA card,
    // multiple insights list
}
```

#### 2i. CSS — Full styles for revised dashboard

**File**: `styles/pages/dashboard.css`

```css
/* ── Greeting ── */
.dash-greeting {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 var(--pad-card-x);
}
.dash-greeting__text h2 {
    font-size: var(--font-xl);
    font-weight: 700;
    color: var(--text-strong);
    margin: 0;
}
.dash-greeting__text span {
    font-size: var(--font-sm);
    color: var(--text-secondary);
}
.dash-greeting__avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--cat-push), var(--cat-pull));
    cursor: pointer;
    transition: transform var(--anim-fast);
}
.dash-greeting__avatar:active { transform: scale(0.95); }

/* ── Metrics grid ── */
.dash-metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-10);
}
.dash-metric {
    padding: var(--pad-card-y) var(--pad-card-x);
}
.dash-metric__label {
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: var(--space-6);
}
.dash-metric__value {
    font-size: var(--font-2xl);
    font-weight: var(--font-display-weight);
    color: var(--text-strong);
    line-height: 1;
    margin-bottom: var(--space-4);
}
.dash-metric__value--sm { font-size: var(--font-lg); }
.dash-metric__sub {
    font-size: var(--font-xs);
    color: var(--text-secondary);
}
.dash-metric--streak {
    background: linear-gradient(135deg, var(--highlight-warm-bg-gradient-start), var(--highlight-warm-bg-gradient-end));
    border: 1px solid var(--highlight-warm-border);
}
.dash-metric--streak .dash-metric__value { color: var(--highlight-warm); }
.dash-metric--streak i { color: var(--highlight-warm); }
.dash-metric--ring {
    display: flex;
    align-items: center;
    gap: var(--space-12);
}
.dash-ring-svg {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
}
.dash-ring-track {
    fill: none;
    stroke: var(--border-light);
    stroke-width: 4;
}
.dash-ring-fill {
    fill: none;
    stroke: var(--primary);
    stroke-width: 4;
    stroke-linecap: round;
    transition: stroke-dashoffset var(--anim-slow) var(--ease-out-expo);
}

/* ── Week timeline ── */
.dash-timeline__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-10);
}
.dash-timeline__head h3 {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-strong);
    margin: 0;
}
.dash-timeline__trend {
    font-size: var(--font-xs);
    font-weight: 600;
    padding: 2px var(--space-8);
    border-radius: var(--radius-pill);
}
.dash-timeline__trend.trend-up {
    color: var(--success);
    background: var(--success-bg);
}
.dash-timeline__trend.trend-down {
    color: var(--danger);
    background: var(--danger-bg);
}
.dash-timeline__dots {
    display: flex;
    justify-content: space-between;
}
.dash-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    flex: 1;
}
.dash-day__label {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
}
.dash-day__circle {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid var(--border-light);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-xs);
    color: var(--text-muted);
    transition: all var(--anim-normal) var(--ease-out-expo);
}
.dash-day__circle.done {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg-app);
}
.dash-day__circle.today {
    border-color: var(--primary);
    color: var(--primary);
}
.dash-day__circle.today i { font-size: 0.4rem; }

/* ── Section header (used by Recent Workouts & Recent PRs) ── */
.dash-section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: var(--space-4) 2px var(--space-10);
}
.dash-section-head h3 {
    font-size: var(--font-base);
    font-weight: 700;
    color: var(--text-strong);
    margin: 0;
}
.dash-section-head a {
    font-size: var(--font-xs);
    color: var(--primary);
    cursor: pointer;
}

/* ── Recent workout row ── */
.dash-recent-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--pad-card-y) var(--pad-card-x);
    transition: transform var(--anim-fast), background var(--anim-fast);
}
.dash-recent-row:active { transform: scale(0.98); }
.dash-recent__icon {
    width: var(--icon-md);
    height: var(--icon-md);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-md);
    flex-shrink: 0;
}
.cat-bg-push { background: var(--cat-push-bg); color: var(--cat-push); }
.cat-bg-pull { background: var(--cat-pull-bg); color: var(--cat-pull); }
.cat-bg-legs { background: var(--cat-legs-bg); color: var(--cat-legs); }
.cat-bg-core { background: rgba(74, 217, 167, 0.15); color: var(--cat-core); }
.cat-bg-cardio { background: var(--cat-cardio-bg); color: var(--cat-cardio); }
.cat-bg-other { background: rgba(100, 116, 139, 0.15); color: var(--cat-other); }
.dash-recent__info { flex: 1; min-width: 0; }
.dash-recent__name {
    font-size: var(--font-base);
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dash-recent__meta {
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.dash-recent__play {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
    cursor: pointer;
    transition: transform var(--anim-fast);
}
.dash-recent__play:active { transform: scale(0.92); }

/* ── Recent PR row ── */
.dash-pr-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--pad-card-y) var(--pad-card-x);
    transition: transform var(--anim-fast);
}
.dash-pr-row:active { transform: scale(0.98); }
.dash-pr__badge {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--achievement-gold-bg);
    color: var(--achievement-gold);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.dash-pr__info { flex: 1; min-width: 0; }
.dash-pr__name {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-strong);
}
.dash-pr__meta {
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.dash-pr__value {
    font-size: var(--font-base);
    font-weight: 700;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
}

/* ── Container spacing ── */
#dashboard-content {
    display: flex;
    flex-direction: column;
    gap: var(--gap-items);
    padding: var(--pad-page) var(--pad-page) var(--space-80);
}
#dashboard-content > * { margin: 0; }
```

### 2j. Nav bar revision (5-tab with center primary)

**File**: `styles/components/nav.css`

Replace the existing 5-tab equal-width layout with an elevated center button:

```css
.bottom-nav {
    display: flex;
    align-items: center;
    justify-content: space-around;
    /* existing height, background, border-top stays */
}
.bottom-nav__btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
    font-size: var(--font-2xs);
    background: none;
    border: none;
    min-height: var(--tap);
    transition: color var(--anim-fast);
}
.bottom-nav__btn.active { color: var(--primary); }
.bottom-nav__btn i { font-size: var(--font-md); }

/* Elevated center primary — opens Workout picker */
.bottom-nav__btn--primary {
    background: var(--primary);
    color: var(--bg-app);
    width: 50px;
    height: 50px;
    border-radius: 50%;
    justify-content: center;
    transform: translateY(-10px);
    box-shadow: var(--shadow-md);
    gap: 0;
    transition: transform var(--anim-fast);
}
.bottom-nav__btn--primary i { font-size: var(--font-lg); }
.bottom-nav__btn--primary:active {
    transform: translateY(-10px) scale(0.92);
}
```

**File**: `index.html` — ensure the nav structure matches:

```html
<nav class="bottom-nav">
    <button class="bottom-nav__btn" onclick="bottomNavTo('dashboard')">
        <i class="fas fa-home"></i><span>Home</span>
    </button>
    <button class="bottom-nav__btn" onclick="bottomNavTo('stats')">
        <i class="fas fa-chart-line"></i><span>Stats</span>
    </button>
    <button class="bottom-nav__btn bottom-nav__btn--primary" onclick="bottomNavTo('workout')" aria-label="Start workout">
        <i class="fas fa-plus"></i>
    </button>
    <button class="bottom-nav__btn" onclick="bottomNavTo('history')">
        <i class="fas fa-calendar"></i><span>History</span>
    </button>
    <button class="bottom-nav__btn" onclick="openMoreMenu()">
        <i class="fas fa-ellipsis-h"></i><span>More</span>
    </button>
</nav>
```

`bottomNavTo('workout')` routes to the unified Workout page (Section 3). No bottom sheet — full page — because that's what we mocked up and agreed on.

### Mockup references

- `mockups/dashboard-final.html` — the hybrid dashboard in context with nav bar
- `mockups/workout-page-flow.html` — three states of the Workout page (collapsed, expanded with inline editor, annotated) — confirms the tap-to-expand/edit flow is intuitive

### Validation

- Dashboard has NO "Start Workout" CTA anywhere — only recent-workout rows with per-row play buttons
- Nav bar center (+) is visually elevated and opens the Workout page
- Streak + ring side-by-side (no separate streak card, no huge centered ring)
- One insight maximum
- Recent Workouts sits between insight and PRs, with 3 items max
- All animations use existing `var(--anim-*)` and `var(--ease-out-expo)` tokens — no hardcoded durations
- `:active` states use `transform: scale(0.9x)` — no opacity or color changes on press
- Category dot colors match `var(--cat-*-bg)` tokens (push=blue, pull=pink, legs=purple, core=green, cardio=gold)

---


## 3. Workout Page — Unified Selector + Editor

**Problem**: Category cards (Push, Pull, Legs, Core, Other) each take ~195px. Two-step flow (tap category → see templates → tap Start) adds friction. Template editing lives on a separate page, requiring navigation away from the workout flow. On iPhone you see ~3 categories before scrolling.

**Goal**: One page, two modes. The "Workout" nav button shows all templates. Tapping a row opens inline editing. Play button starts the workout. No separate template management page needed.

### Current code structure (reference)

- `renderWorkoutSelector()` in `js/core/ui/template-selection.js` — builds the category grid
- `createCategoryCard()` — renders individual ~195px category cards
- Template list appears as a bottom-sheet modal after tapping a category
- `startWorkout(templateId)` in `workout-core.js` — initiates a workout session
- Template editor currently in `workout-management-ui.js` — separate full-page view
- `getLastWorkoutForTemplate()` — fetches last session date (if it exists, needs verification)

### New Structure — Two Modes

**Mode 1: Selector (default)** — flat template list with filter pills and play buttons
**Mode 2: Editor (inline)** — tapping a row expands it into an inline editor

Replace the 5 large category cards with:
1. Category filter pills at the top (horizontal scroll)
2. Flat template list below — sorted by recency
3. Tapping a row expands it inline to show exercises + edit controls

```
┌─────────────────────────────────┐
│ Workouts                 + New  │
├─────────────────────────────────┤
│ [All] [Push] [Pull] [Legs] ... │  ← Filter pills, horizontally scrollable
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🔵 Hard Monday          ▶   │ │  ← Collapsed: row card, ~70px
│ │    7 exercises · Push        │ │     Play button = START
│ │    Last: 135×10, 155×8       │ │     Tap row = EXPAND to edit
│ ├─────────────────────────────┤ │
│ │ 🔵 Monday – Upper Body   ▶  │ │  ← Currently expanded (editing):
│ │    5 exercises · Push        │ │
│ │  ┌───────────────────────┐   │ │
│ │  │ 1. Bench Press        │   │ │  ← Exercise list (reorderable)
│ │  │ 2. Incline DB Press   │   │ │
│ │  │ 3. Cable Flyes        │   │ │
│ │  │ + Add Exercise         │   │ │
│ │  ├───────────────────────┤   │ │
│ │  │ Category: Push    ▼   │   │ │  ← Editable fields
│ │  │ [Rename] [Delete] [⋯] │   │ │  ← Template actions
│ │  └───────────────────────┘   │ │
│ ├─────────────────────────────┤ │
│ │ 🟣 Heavy Pull Day       ▶   │ │
│ │    6 exercises · Pull        │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 3a. Implementation — Filter pills

**File**: `js/core/ui/template-selection.js`

Modify `renderWorkoutSelector()` to render filter pills instead of category cards:

```javascript
function renderCategoryPills(categories, activeCategory) {
    const pills = categories.map(cat => {
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
        return `
            <button class="category-pill ${cat === activeCategory ? 'active' : ''}" 
                    style="${cat === activeCategory ? `background: ${color}; border-color: ${color};` : ''}"
                    onclick="filterTemplates('${cat}')">
                ${getCategoryIcon(cat)} ${cat}
            </button>
        `;
    }).join('');
    
    return `
        <div class="category-pill-row">
            <button class="category-pill ${!activeCategory ? 'active' : ''}" 
                    onclick="filterTemplates(null)">All</button>
            ${pills}
        </div>
    `;
}
```

### 3b. Implementation — Template row cards (collapsed state)

```javascript
function renderTemplateRow(template) {
    const category = template.category || 'Other';
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const isExpanded = expandedTemplateId === template.id;
    
    // Get last workout data for this template
    const lastWorkout = getLastWorkoutForTemplate(template.id);
    
    // Build the detail line: ghost preview if available, otherwise relative time
    let detailHtml = '';
    if (lastWorkout) {
        const exercises = lastWorkout.exercises || {};
        const firstEx = Object.values(exercises)[0];
        const sets = firstEx?.sets?.filter(s => s.reps && s.weight).slice(0, 3) || [];
        if (sets.length > 0) {
            const preview = sets.map(s => `${s.weight}×${s.reps}`).join(', ');
            detailHtml = `<span class="template-row__detail">${preview}</span>`;
        } else {
            detailHtml = `<span class="template-row__detail">${formatTimeAgo(lastWorkout.date)}</span>`;
        }
    } else {
        detailHtml = `<span class="template-row__detail template-row__detail--new">Ready to start</span>`;
    }
    
    // IMPORTANT: Tapping the row EXPANDS it inline for editing (not start, not navigate away).
    // Only the explicit play button starts the workout.
    // This prevents accidental workout starts and keeps everything on one page.
    return `
        <div class="row-card template-row ${isExpanded ? 'expanded' : ''}" onclick="toggleTemplateEdit('${template.id}')">
            <div class="template-row__indicator" style="background: ${color};"></div>
            <div class="row-card__content">
                <div class="row-card__title">${template.name}</div>
                <div class="row-card__subtitle">
                    ${template.exercises.length} exercises · ${category}
                </div>
                ${detailHtml}
            </div>
            <button class="btn-start-small" onclick="event.stopPropagation(); startWorkout('${template.id}')" aria-label="Start ${template.name}">
                <i class="fas fa-play"></i>
            </button>
        </div>
        ${isExpanded ? renderTemplateEditor(template) : ''}
    `;
}
```

### 3c. Implementation — Inline template editor (expanded state)

When a row is tapped, it expands below the row to show the template's exercises and edit controls. No page navigation.

```javascript
let expandedTemplateId = null;

function toggleTemplateEdit(templateId) {
    // Toggle: if already expanded, collapse. Otherwise expand this one.
    expandedTemplateId = (expandedTemplateId === templateId) ? null : templateId;
    renderWorkoutSelector(); // Re-render with expansion state
}

function renderTemplateEditor(template) {
    const exercises = template.exercises || [];
    
    let exerciseListHtml = exercises.map((ex, i) => `
        <div class="template-editor__exercise" draggable="true" data-index="${i}">
            <span class="template-editor__drag-handle"><i class="fas fa-grip-vertical"></i></span>
            <span class="template-editor__exercise-name">${ex.name}</span>
            <span class="template-editor__exercise-sets">${ex.sets?.length || 0} sets</span>
            <button class="template-editor__remove-btn" onclick="event.stopPropagation(); removeExerciseFromTemplate('${template.id}', ${i})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    return `
        <div class="template-editor" onclick="event.stopPropagation()">
            <div class="template-editor__exercise-list">
                ${exerciseListHtml}
                <button class="template-editor__add-btn" onclick="addExerciseToTemplate('${template.id}')">
                    <i class="fas fa-plus"></i> Add Exercise
                </button>
            </div>
            <div class="template-editor__actions">
                <button class="template-editor__action" onclick="renameTemplate('${template.id}')">
                    <i class="fas fa-pen"></i> Rename
                </button>
                <button class="template-editor__action" onclick="duplicateTemplate('${template.id}')">
                    <i class="fas fa-copy"></i> Duplicate
                </button>
                <button class="template-editor__action template-editor__action--danger" onclick="deleteTemplate('${template.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

// Export to window in main.js:
// window.toggleTemplateEdit = toggleTemplateEdit;
// window.removeExerciseFromTemplate = removeExerciseFromTemplate;
// window.addExerciseToTemplate = addExerciseToTemplate;
// window.renameTemplate = renameTemplate;
// window.duplicateTemplate = duplicateTemplate;
// window.deleteTemplate = deleteTemplate;
```

### 3d. Implementation — Sorting and filtering

```javascript
// Sort: most recently used first, then alphabetical
function sortTemplates(templates) {
    return [...templates].sort((a, b) => {
        const aLast = getLastWorkoutDate(a.id);
        const bLast = getLastWorkoutDate(b.id);
        if (aLast && bLast) return bLast.localeCompare(aLast); // Newest first
        if (aLast) return -1; // Used templates before unused
        if (bLast) return 1;
        return a.name.localeCompare(b.name); // Alphabetical fallback
    });
}

// Filter by category
let activeTemplateCategory = null;

function filterTemplates(category) {
    activeTemplateCategory = category;
    renderWorkoutSelector(); // Re-render with filter applied
}
```

Add `window.filterTemplates = filterTemplates;` to `main.js`.

### 3e. Implementation — `getLastWorkoutForTemplate()`

This function may not exist yet. If not, implement it:

```javascript
// In template-selection.js or data-manager.js
function getLastWorkoutForTemplate(templateId) {
    const templateName = getTemplateName(templateId);
    if (!AppState.workoutHistory) return null;
    
    const matching = AppState.workoutHistory
        .filter(w => w.workoutType === templateName && w.completedAt)
        .sort((a, b) => b.date.localeCompare(a.date));
    
    return matching[0] || null;
}

function getLastWorkoutDate(templateId) {
    const last = getLastWorkoutForTemplate(templateId);
    return last?.date || null;
}
```

### 3f. Row tap = Expand editor, Play button = Start

The template row has two distinct tap targets:

1. **Tap anywhere on the row** → Expands the inline editor below the row, showing exercises + edit controls. Tap again to collapse. No page navigation needed.
2. **Tap the green play button** → Starts the workout immediately. The `event.stopPropagation()` prevents the row's expand handler from firing.

This keeps everything on one page. You can scan your templates, quickly edit one, then start another — all without leaving the Workout tab.

### 3f. CSS — Full styles

**File**: `styles/pages/templates.css`

```css
/* ── Category filter pills ── */
.category-pill-row {
    display: flex;
    gap: var(--space-8);
    overflow-x: auto;
    padding: var(--space-8) var(--pad-card-x);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.category-pill-row::-webkit-scrollbar {
    display: none;
}
.category-pill {
    white-space: nowrap;
    padding: var(--space-8) var(--space-16);
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-sm);
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--anim-fast);
}
.category-pill:active {
    transform: scale(0.95);
}
.category-pill.active {
    background: var(--primary);
    color: var(--bg-app);
    border-color: var(--primary);
    font-weight: 600;
}

/* ── Template row cards ── */
.template-row {
    margin-bottom: var(--space-6);
    position: relative;
    overflow: hidden;
    transition: transform var(--anim-fast), box-shadow var(--anim-fast);
}
.template-row:active {
    transform: scale(0.98);
    box-shadow: none;
}

/* Category color indicator — thin left border accent */
.template-row__indicator {
    width: 3px;
    border-radius: 3px;
    flex-shrink: 0;
    align-self: stretch;
}

/* Row content layout */
.template-row .row-card__title {
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--text-strong);
    line-height: 1.3;
}
.template-row .row-card__subtitle {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 2px;
}
.template-row__detail {
    font-size: var(--font-xs);
    color: var(--text-secondary);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
}
.template-row__detail--new {
    color: var(--primary);
    font-weight: 500;
}

/* Edit button (subtle, between content and start) */
.template-row__edit {
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    opacity: 0.5;
}
.template-row__edit:active {
    opacity: 1;
    background: var(--bg-card-hover);
}

/* Start button */
.btn-start-small {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    font-size: var(--font-sm);
    transition: transform var(--anim-fast), opacity var(--anim-fast);
}
.btn-start-small:active {
    transform: scale(0.9);
    opacity: 0.8;
}

/* ── Inline template editor (expanded state) ── */
.template-row.expanded {
    border-color: var(--primary-border);
    box-shadow: var(--shadow-md);
}
.template-editor {
    background: var(--bg-surface);
    border-top: 1px solid var(--border-subtle);
    padding: var(--space-12) var(--pad-card-x);
}
.template-editor__exercise-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-12);
}
.template-editor__exercise {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-12);
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
}
.template-editor__drag-handle {
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: grab;
    opacity: 0.5;
}
.template-editor__exercise-name {
    flex: 1;
    font-size: var(--font-base);
    color: var(--text-strong);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.template-editor__exercise-sets {
    font-size: var(--font-xs);
    color: var(--text-muted);
    flex-shrink: 0;
}
.template-editor__remove-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    flex-shrink: 0;
}
.template-editor__remove-btn:active {
    color: var(--danger);
    opacity: 1;
}
.template-editor__add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    padding: var(--space-10);
    border: 1px dashed var(--border-light);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--primary);
    font-size: var(--font-sm);
    cursor: pointer;
}
.template-editor__add-btn:active {
    background: var(--primary-bg-subtle);
}
.template-editor__actions {
    display: flex;
    gap: var(--space-8);
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--space-12);
}
.template-editor__action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    padding: var(--space-8);
    border: none;
    background: none;
    color: var(--text-secondary);
    font-size: var(--font-xs);
    cursor: pointer;
    border-radius: var(--radius-sm);
}
.template-editor__action:active {
    background: var(--bg-card-hover);
}
.template-editor__action--danger {
    color: var(--danger);
}

/* ── Empty state ── */
.template-empty-state {
    text-align: center;
    padding: var(--space-32) var(--pad-card-x);
    color: var(--text-muted);
}
.template-empty-state__icon {
    font-size: 2rem;
    margin-bottom: var(--space-12);
    opacity: 0.4;
}
.template-empty-state__text {
    font-size: var(--font-sm);
    line-height: 1.5;
    margin-bottom: var(--space-16);
}
.template-empty-state__cta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-10) var(--space-20);
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-sm);
    font-weight: 600;
    cursor: pointer;
}
```

### 3g. Empty state

When there are no templates (new user or filtered to empty category):

```javascript
function renderEmptyTemplateState(isFiltered) {
    if (isFiltered) {
        return `
            <div class="template-empty-state">
                <div class="template-empty-state__icon"><i class="fas fa-filter"></i></div>
                <div class="template-empty-state__text">No templates in this category</div>
            </div>
        `;
    }
    return `
        <div class="template-empty-state">
            <div class="template-empty-state__icon"><i class="fas fa-dumbbell"></i></div>
            <div class="template-empty-state__text">Create your first workout template to get started</div>
            <button class="template-empty-state__cta" onclick="createNewTemplate()">
                <i class="fas fa-plus"></i> Create Template
            </button>
        </div>
    `;
}
```

### 3h. Transition: filter animation

When switching category filters, animate the template list:

```css
/* Template list container */
.template-list {
    transition: opacity var(--anim-fast);
}
.template-list.filtering {
    opacity: 0.5;
}
```

```javascript
// In filterTemplates():
function filterTemplates(category) {
    const list = document.querySelector('.template-list');
    if (list) list.classList.add('filtering');
    
    activeTemplateCategory = category;
    
    // Brief delay for visual feedback, then re-render
    requestAnimationFrame(() => {
        renderWorkoutSelector();
        if (list) list.classList.remove('filtering');
    });
}
```

### Remove
- The 5 large `workout-category-card` elements and their CSS
- The bottom-sheet template list modal
- The `createCategoryCard()` function (or keep for backward compat but don't render)
- The two-step flow: category tap → template list → start
- The separate full-page template editor view — all editing now happens inline on this page
- Any navigation to a separate "manage templates" page (editing is embedded in the selector)

---

## 4. Active Workout Tightening

**Problem**: Sticky header uses ~280px before the first exercise card. The current layout shows: workout name (large), location, timer badge (padded), action buttons row (Finish | Add | More | Cancel), and a progress section — all above the fold. The "Finish Workout" button competes with exercise cards for attention. Secondary actions (Add, More, Cancel) are always visible but rarely used mid-set.

**Goal**: Header ≤ 80px. First exercise card visible without scrolling. Workout feels like a focused, timer-driven session — not a settings panel.

### Current code structure (reference)

- `index.html` contains the `#active-workout` section with the hero, action buttons, and exercise list container
- `js/core/workout/workout-core.js` — `startWorkout()` renders the header and exercise cards
- `js/core/workout/rest-timer.js` — rest timer shows in both header and in-card locations
- Timer display updated by `updateTimerDisplay()` called on interval
- Exercise list container: `#exercise-list` inside `#active-workout`
- Action buttons currently rendered inline in the hero section

### 4a. Compact header — two-row design

Reduce the entire header to two tight rows that stick to the top:

```
┌─────────────────────────────────┐
│ Hard Monday  📍Home  ⋯  ⏱12:34 │  ← Row 1: name, location, overflow, timer (~40px)
│ ████████░░░  3/24 sets · 2/7   │  ← Row 2: progress bar + stats (~28px)
└─────────────────────────────────┘
                                      Total: ~72px (vs ~280px before)
```

**File**: `index.html` — replace the current `#active-workout` hero with:

```html
<div class="compact-hero" id="workout-hero">
    <!-- Row 1: Identity + Timer -->
    <div class="compact-hero__row1">
        <div class="compact-hero__identity">
            <h2 class="compact-hero__title" id="workout-name">Hard Monday</h2>
            <span class="compact-hero__location" id="workout-location">
                <i class="fas fa-map-marker-alt"></i> <span id="location-name">Home</span>
            </span>
        </div>
        <div class="compact-hero__actions">
            <button class="compact-hero__overflow" onclick="toggleWorkoutOverflow()" aria-label="More options">
                <i class="fas fa-ellipsis-h"></i>
            </button>
            <div class="compact-hero__timer" id="workout-timer">
                <i class="fas fa-stopwatch"></i>
                <span id="timer-display">0:00</span>
            </div>
        </div>
    </div>
    
    <!-- Row 2: Progress bar + Stats -->
    <div class="compact-hero__row2">
        <div class="compact-hero__progress-bar">
            <div class="compact-hero__progress-fill" id="workout-progress-fill" style="width: 0%"></div>
        </div>
        <div class="compact-hero__stats">
            <span><strong id="set-count">0</strong>/<strong id="set-total">24</strong> sets</span>
            <span class="stat-dot">·</span>
            <span><strong id="exercise-done-count">0</strong>/<strong id="exercise-total">7</strong> done</span>
        </div>
    </div>
</div>

<!-- Overflow menu (hidden by default) -->
<!-- Contains ALL secondary actions previously spread across the header.
     The "⋯" button is the single entry point. -->
<div id="workout-overflow-menu" class="workout-overflow-menu hidden">
    <!-- Primary actions (previously always-visible buttons) -->
    <button class="workout-overflow-item" onclick="addExerciseToActiveWorkout()">
        <i class="fas fa-plus"></i> Add Exercise
    </button>
    <button class="workout-overflow-item" onclick="saveWorkoutAsTemplate()">
        <i class="fas fa-save"></i> Save as Template
    </button>

    <!-- Divider -->
    <div class="workout-overflow-divider"></div>

    <!-- Info/export actions -->
    <button class="workout-overflow-item" onclick="showWorkoutSummaryPreview()">
        <i class="fas fa-chart-bar"></i> Session Summary
    </button>
    <button class="workout-overflow-item" onclick="exportWorkoutDataAsCSV()">
        <i class="fas fa-file-export"></i> Export Session
    </button>

    <!-- Divider -->
    <div class="workout-overflow-divider"></div>

    <!-- Danger zone -->
    <button class="workout-overflow-item workout-overflow-item--danger" onclick="cancelWorkout()">
        <i class="fas fa-times"></i> Cancel Workout
    </button>
</div>
<!--
  Menu items explained:
  - "Add Exercise" — opens the exercise picker to append to current workout
    (calls existing `addExerciseToActiveWorkout()` from main.js line 426)
  - "Save as Template" — saves current exercise list as a reusable template
    (calls existing `saveWorkoutAsTemplate()` from main.js line 730)
  - "Session Summary" — shows a mid-workout preview of volume, sets, duration
    (new function, lightweight — just renders the summary modal without completing)
  - "Export Session" — exports current workout data as CSV
    (calls existing `exportWorkoutDataAsCSV()` from main.js line 783)
  - "Cancel Workout" — prompts confirmation then discards the session
    (calls existing `cancelWorkout()` from main.js line 380)

  Note: "Reorder Exercises" was in the original plan but no reorder function exists
  in the codebase yet. If added later, insert it after "Add Exercise" with:
    <button class="workout-overflow-item" onclick="reorderExercises()">
        <i class="fas fa-sort"></i> Reorder Exercises
    </button>
-->
```

### 4b. Progress bar — live workout progress

Add a thin progress bar that fills as sets are completed. This gives instant visual feedback without taking space:

```javascript
// In workout-core.js, call after each set completion:
function updateWorkoutProgress() {
    const exercises = AppState.currentWorkout?.exercises || [];
    const saved = AppState.savedData?.exercises || {};
    
    let totalSets = 0;
    let completedSets = 0;
    let completedExercises = 0;
    
    exercises.forEach((ex, i) => {
        const sets = saved[`exercise_${i}`]?.sets || [];
        const exSets = ex.sets || 3;
        totalSets += exSets;
        const done = sets.filter(s => s.reps && s.weight).length;
        completedSets += done;
        if (done >= exSets && done > 0) completedExercises++;
    });
    
    const percent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;
    
    const fill = document.getElementById('workout-progress-fill');
    if (fill) fill.style.width = `${percent}%`;
    
    const setCount = document.getElementById('set-count');
    const setTotal = document.getElementById('set-total');
    const exDone = document.getElementById('exercise-done-count');
    const exTotal = document.getElementById('exercise-total');
    
    if (setCount) setCount.textContent = completedSets;
    if (setTotal) setTotal.textContent = totalSets;
    if (exDone) exDone.textContent = completedExercises;
    if (exTotal) exTotal.textContent = exercises.length;
}
```

Call `updateWorkoutProgress()` from:
- `toggleSetComplete()` — after marking a set done/undone
- `markExerciseComplete()` — after marking an exercise complete
- `addSetToExercise()` / `removeSetFromExercise()` — after set count changes
- `startWorkout()` — initial render

### 4c. Move "Finish Workout" to sticky footer

Move the Finish button from the top action bar to a sticky footer that sits above the bottom nav. The gradient background ensures exercise cards don't feel cut off:

```html
<!-- Add at the bottom of #active-workout, after #exercise-list -->
<div class="workout-footer-bar" id="workout-footer">
    <button class="btn-finish-footer" onclick="completeWorkout()">
        <i class="fas fa-check"></i> Finish Workout
    </button>
</div>
```

**Visual behavior**: The footer should only become prominent when progress > 50% (or at least one exercise is complete). Before that, it's subtler:

```javascript
// In updateWorkoutProgress():
const footer = document.getElementById('workout-footer');
if (footer) {
    footer.classList.toggle('workout-footer--ready', completedExercises > 0);
}
```

### 4d. Overflow menu for secondary actions

Replace the always-visible Add / More / Cancel button row with a single "⋯" overflow:

```javascript
// In workout-core.js or a new workout-overflow.js:
function toggleWorkoutOverflow() {
    const menu = document.getElementById('workout-overflow-menu');
    if (!menu) return;
    
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    
    if (isHidden) {
        // Close on outside tap
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closeHandler);
            }
        };
        // Delay to avoid catching the current click
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }
}
```

Add `window.toggleWorkoutOverflow = toggleWorkoutOverflow;` to `main.js`.

### 4e. Rest timer integration in header

When a rest timer is active, show it in the header stats row instead of as a separate modal. Replace the timer badge temporarily:

```javascript
// In rest-timer.js, when rest timer starts:
function showHeaderRestTimer(seconds) {
    const timerEl = document.getElementById('workout-timer');
    if (!timerEl) return;
    
    timerEl.classList.add('compact-hero__timer--resting');
    // The timer display will show rest countdown instead of workout elapsed
    // Store original timer state to restore after rest completes
}

function hideHeaderRestTimer() {
    const timerEl = document.getElementById('workout-timer');
    if (!timerEl) return;
    
    timerEl.classList.remove('compact-hero__timer--resting');
    // Restore elapsed workout time display
}
```

### 4f. Full CSS

**File**: `styles/pages/workout.css` — add/replace compact hero styles:

```css
/* ── Compact Hero ── */
.compact-hero {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky, 10);
    background: var(--bg-app);
    padding: var(--space-8) var(--pad-card-x) var(--space-6);
    border-bottom: 1px solid var(--border-light);
}

/* Row 1: Identity + Timer */
.compact-hero__row1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 36px;
}
.compact-hero__identity {
    display: flex;
    align-items: baseline;
    gap: var(--space-10);
    min-width: 0; /* Allow text truncation */
    flex: 1;
}
.compact-hero__title {
    font-size: var(--font-md);
    font-weight: 700;
    color: var(--text-strong);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.compact-hero__location {
    font-size: var(--font-xs);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
}
.compact-hero__actions {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    flex-shrink: 0;
}
.compact-hero__overflow {
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
}
.compact-hero__overflow:active {
    background: var(--bg-card-hover);
}

/* Timer badge */
.compact-hero__timer {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-10);
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.06);
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}
.compact-hero__timer i {
    font-size: var(--font-xs);
    opacity: 0.7;
}
/* Rest timer state — pulsing accent color */
.compact-hero__timer--resting {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger);
    animation: timer-pulse 1s ease-in-out infinite;
}
@keyframes timer-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* Row 2: Progress bar + Stats */
.compact-hero__row2 {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    padding-top: var(--space-6);
}
.compact-hero__progress-bar {
    flex: 1;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
}
.compact-hero__progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 2px;
    transition: width var(--anim-normal) ease;
    min-width: 0;
}
.compact-hero__stats {
    display: flex;
    gap: var(--space-6);
    font-size: var(--font-xs);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
}
.compact-hero__stats strong {
    color: var(--text-secondary);
    font-weight: 600;
}
.stat-dot {
    opacity: 0.3;
}

/* ── Workout overflow menu ── */
.workout-overflow-menu {
    position: absolute;
    right: var(--pad-card-x);
    top: 52px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: var(--space-4) 0;
    z-index: var(--z-dropdown, 20);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    min-width: 200px;
}
.workout-overflow-item {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    width: 100%;
    padding: var(--space-12) var(--space-16);
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: var(--font-sm);
    cursor: pointer;
    text-align: left;
}
.workout-overflow-item:active {
    background: var(--bg-card-hover);
}
.workout-overflow-item--danger {
    color: var(--danger);
}
.workout-overflow-divider {
    height: 1px;
    background: var(--border-light);
    margin: var(--space-4) 0;
}

/* ── Finish Workout footer ── */
.workout-footer-bar {
    position: sticky;
    bottom: 60px; /* above bottom nav */
    z-index: var(--z-sticky, 10);
    padding: var(--space-16) var(--pad-card-x) var(--space-12);
    background: linear-gradient(to bottom, transparent 0%, var(--bg-app) 40%);
    pointer-events: none; /* Allow scroll-through on transparent area */
}
.workout-footer-bar > * {
    pointer-events: auto; /* Button itself is clickable */
}
.btn-finish-footer {
    width: 100%;
    min-height: 48px;
    background: var(--success);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-md);
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    opacity: 0.6;
    transition: opacity var(--anim-normal), transform var(--anim-fast);
}
/* Becomes fully opaque when at least one exercise is done */
.workout-footer--ready .btn-finish-footer {
    opacity: 1;
}
.btn-finish-footer:active {
    transform: scale(0.98);
}

/* ── Exercise list spacing ── */
#exercise-list {
    padding: var(--space-8) var(--pad-card-x);
    padding-bottom: 80px; /* Room for sticky footer */
}
```

### Space savings
- Before: ~280px header (name + location + timer badge + action buttons + progress section)
- After: ~72px header (two compact rows + 1px border)
- Net gain: **~208px** more exercise cards visible on first screen
- Finish button moved to bottom — doesn't steal top-of-screen real estate
- Secondary actions hidden behind "⋯" — zero visual noise during active logging

---

## 5. Exercise Card Optimization

**Problem**: Expanded exercise card uses ~480px before the first input is visible. The expanded view shows three zones of chrome before you can log a set: (1) the inline toolbar row (Swap | Equipment | More), (2) the "Show Last Workout" / "View Progress" buttons, (3) the lbs/kg unit toggle. Each takes ~40-50px. Combined with the table header, you scroll past ~200px of non-input UI to reach the first set row.

**Goal**: Expanded card ≤ 260px total. Set inputs visible immediately on expand. All secondary actions behind overflow.

### Current code structure (reference)

- `createExerciseCard()` in `exercise-ui.js` line 442 — builds the collapsed card (header + empty body)
- `expandExercise()` line 645 — populates body with `buildInlineToolbar()` + `generateExerciseTable()`
- `buildInlineToolbar()` line 743 — renders `Swap | Equipment | More` row + hidden overflow menu
- `generateExerciseTable()` line 900 — renders history buttons, unit toggle, rest timer, last-session label, `<table>`, set controls, notes textarea, and mark-complete button
- Ghost values already partially implemented (lines 590-616) — async `getLastSessionDefaults()` populates `.exercise-card-last` on collapsed cards

### 5a. Consolidate all secondary actions into the existing overflow menu

The inline toolbar already has a `More` button with overflow items (Edit Defaults, Superset, Form Video, Delete). Instead of keeping `Swap | Equipment | More` as three separate top-level buttons, move everything into a single overflow triggered from the card header.

**File**: `js/core/workout/exercise-ui.js`

Modify `buildInlineToolbar()` (line 743) to remove the three-button toolbar row entirely. Instead, add a "⋯" button to the card header in `createExerciseCard()`:

```javascript
// In createExerciseCard(), after building the status div (line 546-576):
const overflowBtn = document.createElement('button');
overflowBtn.className = 'exercise-header-overflow';
overflowBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
overflowBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger expand/collapse
    toggleExerciseOverflow(index);
});
status.insertBefore(overflowBtn, status.firstChild); // Before the ring
```

Then replace `buildInlineToolbar()` to return ONLY the hidden overflow menu (no visible toolbar row):

```javascript
function buildInlineToolbar(exercise, index, exerciseName) {
    const currentGroup = exercise.group || AppState.savedData.exercises?.[`exercise_${index}`]?.group;
    const hasNext = (index + 1) < (AppState.currentWorkout?.exercises?.length || 0);
    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;

    let items = '';
    
    // Primary actions (previously top-level buttons)
    items += `<button class="exercise-overflow-item" onclick="replaceExercise(${index})">
        <i class="fas fa-exchange-alt"></i> Swap Exercise</button>`;
    items += `<button class="exercise-overflow-item" onclick="changeExerciseEquipment(${index})">
        <i class="fas fa-sync-alt"></i> Change Equipment</button>`;
    
    // History/progress (previously always-visible buttons in generateExerciseTable)
    items += `<button class="exercise-overflow-item" data-action="loadExerciseHistory" 
        data-exercise="${escapeAttr(exerciseName)}" data-index="${index}">
        <i class="fas fa-history"></i> Show Last Workout</button>`;
    items += `<button class="exercise-overflow-item" data-action="toggleInlineProgress" 
        data-exercise="${escapeAttr(exerciseName)}" data-equipment="${escapeAttr(exercise.equipment || '')}" data-index="${index}">
        <i class="fas fa-chart-line"></i> View Progress</button>`;
    
    // Unit toggle (previously always-visible toggle)
    const otherUnit = unit === 'lbs' ? 'kg' : 'lbs';
    items += `<button class="exercise-overflow-item" onclick="switchExerciseUnit(${index}, '${otherUnit}')">
        <i class="fas fa-weight"></i> Switch to ${otherUnit}</button>`;
    
    // Existing overflow items
    items += `<button class="exercise-overflow-item" onclick="editExerciseDefaults('${escapeAttr(exerciseName)}')">
        <i class="fas fa-pen"></i> Edit Defaults</button>`;
    if (currentGroup) {
        items += `<button class="exercise-overflow-item" onclick="ungroupExerciseFromWorkout(${index})">
            <i class="fas fa-unlink"></i> Ungroup</button>`;
    } else if (hasNext) {
        items += `<button class="exercise-overflow-item" onclick="supersetWithNext(${index})">
            <i class="fas fa-link"></i> Superset</button>`;
    }
    items += `<button class="exercise-overflow-item" id="show-video-btn-${index}" 
        onclick="showExerciseVideoAndToggleButton(${exercise.video ? `'${escapeAttr(exercise.video)}'` : 'null'}, '${escapeAttr(exerciseName)}', ${index})">
        <i class="fas fa-play-circle"></i> Form Video</button>`;
    items += `<button class="exercise-overflow-item exercise-overflow-item--danger" onclick="deleteExerciseFromWorkout(${index})">
        <i class="fas fa-trash-alt"></i> Delete</button>`;

    return `
        <div id="exercise-overflow-${index}" class="exercise-overflow-menu hidden">
            ${items}
        </div>
        <div id="exercise-video-section-inline-${index}" class="video-section hidden">
            <iframe id="exercise-video-iframe-inline-${index}" class="exercise-video-iframe" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
    `;
}
```

**New window export** needed in `main.js`:
```javascript
window.switchExerciseUnit = (index, newUnit) => {
    AppState.exerciseUnits[index] = newUnit;
    // Re-render the expanded card
    const exercise = AppState.currentWorkout.exercises[index];
    refreshExerciseCard(index);
};
```

### 5b. Strip chrome from `generateExerciseTable()`

**File**: `js/core/workout/exercise-ui.js`, function `generateExerciseTable()` (line 900)

Remove these blocks from the generated HTML:

1. **Lines 932-945**: The entire `.exercise-history-section` div (Show Last Workout + View Progress buttons). These are now in the overflow menu.
2. **Lines 947-953**: The `.exercise-unit-toggle` div. Unit switching is now in the overflow menu.
3. **Lines 956-969**: The `.modal-rest-timer` div. The rest timer already shows in the header bar (Section 4). Remove the duplicate in-card timer.

Keep:
- The last-session label (line 971) — this is useful context
- The `<table>` with set rows
- The set controls (Add/Remove set)
- The notes textarea
- The mark-complete button

After removal, the expanded card body becomes:
```
[Last session: Jan 15]           ← ~24px, optional
┌ SET  REPS     WEIGHT (lbs) ✓ ┐ ← ~32px header
│  1   [ 10 ]   [ 110  ] 🔵   ○ │ ← ~44px per row
│  2   [ 10 ]   [ 110  ] 🔵   ○ │
│  3   [  8 ]   [ 120  ] 🔵   ○ │
│  4   [  8 ]   [ 120  ] 🔵   ○ │
└──────────────────────────────┘
     [- Remove]   [+ Add Set]    ← ~40px
[Exercise notes...              ] ← ~36px (single line)
[      ✅ Mark Complete         ] ← ~48px
```
Total: ~24 + 32 + (44 × 4) + 40 + 36 + 48 = **356px for 4 sets** (vs ~480px before).
With 3 sets: ~312px. Both fit on screen with the compact header from Section 4.

### 5c. New expanded card wireframe

```
┌─────────────────────────────────┐
│ Seated Chest Press  ⋯  0/4  ⌄  │  ← Header: overflow btn + ring + chevron
│ Arsenal Strength · Last: 110×10 │  ← Meta: equipment + ghost preview
├─────────────────────────────────┤
│ Last session: Jan 15            │  ← Optional context line
│ SET  REPS      WEIGHT (LBS)  ✓ │  ← Column headers
│  1   [  10  ]  [  110  ]    ○  │  ← Set row (no set type column)
│  2   [  10  ]  [  110  ]    ○  │
│  3   [   8  ]  [  120  ]    ○  │
│  4   [   8  ]  [  120  ]    ○  │
│  [- Remove]     [+ Add Set]    │  ← Set controls
│ [  Exercise notes...        ]  │  ← Notes (1 line, expands on tap)
│ [    ✅ Mark Complete       ]  │  ← Completion button
└─────────────────────────────────┘
```

### 5d. Ghost values in collapsed cards

The current code (lines 590-616) already does async ghost value loading — it calls `getLastSessionDefaults()` and appends a `.exercise-card-last` span. This is good. Two improvements:

1. **Show "Last:" prefix consistently**: The async path (line 601) adds `Last: ${preview}` but the synchronous path (line 498-506) doesn't. Normalize both:

```javascript
// Line 498-506, modify the setPreview format for non-cardio:
if (completedSets > 0) {
    // Current session data — no "Last:" prefix
    setPreview = savedSets
        .filter(s => s && s.reps && s.weight)
        .slice(0, 4)
        .map(s => {
            let w = s.weight;
            if (unit === 'kg') w = Math.round(w * 0.453592 * 2) / 2;
            return `${w}×${s.reps}`;
        })
        .join(', ');
} else {
    setPreview = ''; // Let async ghost value populate
}
```

2. **Cache last-session data**: `getLastSessionDefaults()` hits Firestore on every card render. For a 7-exercise workout, that's 7 queries on load. Add a session cache:

```javascript
// At module scope in exercise-ui.js:
const lastSessionCache = new Map();

async function getCachedLastSession(exerciseName, equipment) {
    const key = `${exerciseName}::${equipment || ''}`;
    if (lastSessionCache.has(key)) return lastSessionCache.get(key);
    const result = await getLastSessionDefaults(exerciseName, equipment);
    lastSessionCache.set(key, result);
    return result;
}

// Clear cache when a new workout starts:
export function clearLastSessionCache() {
    lastSessionCache.clear();
}
```

Replace all calls to `getLastSessionDefaults()` in this file with `getCachedLastSession()`.

### 5e. Compact notes field

Notes should be a single-line input by default that expands to textarea on focus:

```css
/* In styles/pages/workout.css */
.notes-area {
    min-height: 36px;
    max-height: 36px;
    padding: var(--space-8) var(--space-12);
    font-size: var(--font-sm);
    line-height: 1.4;
    transition: min-height var(--anim-normal), max-height var(--anim-normal);
    overflow: hidden;
    resize: none;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    width: 100%;
}
.notes-area:focus {
    min-height: 72px;
    max-height: 120px;
    overflow-y: auto;
    border-color: var(--primary);
    outline: none;
}
.notes-area::placeholder {
    color: var(--text-muted);
}
```

### 5f. Header overflow button CSS

```css
/* In styles/pages/workout.css */
.exercise-header-overflow {
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
}
.exercise-header-overflow:active {
    background: var(--bg-card-hover);
}

/* Overflow menu positioning */
.exercise-overflow-menu {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: var(--space-4) 0;
    margin-bottom: var(--space-8);
}
.exercise-overflow-item {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    width: 100%;
    padding: var(--space-10) var(--space-16);
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: var(--font-sm);
    cursor: pointer;
    text-align: left;
}
.exercise-overflow-item:active {
    background: var(--bg-card-hover);
}
.exercise-overflow-item--danger {
    color: var(--danger);
}
```

### Space savings summary
- Removed: toolbar row (~44px), history buttons row (~44px), unit toggle row (~44px), in-card rest timer (~60px)
- Net savings: **~192px** per expanded card
- Before: ~480px to first set input
- After: ~80px to first set input (header + last-session label)

---

## 6. Set Table & Input Polish

**Problem**: The current set table has three issues: (1) reps and weight inputs aren't equal width — reps is narrower because the weight cell includes the inline plate calculator button, (2) there's a `cycleSetType()` function (line 1342) that was never wired to the UI and doesn't work — set types (warmup, dropset, failure) are not used, (3) the "Remove Set" button is a separate button alongside "Add Set" which creates a two-button row.

**Goal**: Clean, minimal set table. Equal input widths. No set type system. Swipe-to-delete for sets (already partially implemented). Plate calculator accessible but not eating into the weight input width.

### Current code structure (reference)

- `generateExerciseTable()` line 900 — builds the `<table>` with `<thead>` and per-set `<tr>` rows
- Each set row (lines 1008-1037): `set-number-cell` | reps `<input>` | weight `<input>` + `.plate-calc-inline-btn` | `.set-check` button
- `cycleSetType()` line 1342 — dead code, only cycles between 'working' and 'warmup', never called from UI
- `setupSwipeToDeleteInline()` line 781 — already implements swipe-left-to-delete on set rows
- Set controls (lines 1044-1051): "Remove Set" button + "Add Set" button side by side

### 6a. Remove the set type system entirely

**File**: `js/core/workout/exercise-ui.js`

1. Delete the `cycleSetType()` function (lines 1342-1374). It's exported but never called from any onclick handler.

2. In `main.js`, remove `window.cycleSetType` if it exists.

3. In `generateExerciseTable()`, the set number cell (line 1010) already just shows the number — no change needed there. But ensure no future code references `set.type`. The field can remain in Firestore data (it defaults to 'working') but the UI should ignore it.

4. In PR detection (`pr-detection.js` or within exercise-ui.js line 1269), the check `if (set.type === 'warmup') return false` should remain — if old data has warmup-flagged sets they should still be excluded from PRs. But no new sets will ever be flagged as warmup.

### 6b. Equalize input widths

The problem is that the weight `<td>` contains both the input AND the plate calculator button, making the input narrower than the reps input. Fix by making the plate calc button overlay the input rather than sit beside it.

**File**: `js/core/workout/exercise-ui.js`, within the set row HTML (lines 1017-1028):

```html
<td class="set-weight-cell">
    <div class="weight-input-wrapper">
        <input type="number" class="set-input" inputmode="decimal"
               placeholder="${weightPlaceholder}"
               value="${displayWeight}"
               onchange="updateSet(${exerciseIndex}, ${i}, 'weight', this.value)">
        <button class="plate-calc-inline-btn"
            onclick="openPlateCalcPopover(${exerciseIndex})"
            title="Plate calculator"
            aria-label="Calculate plates">
            <i class="fas fa-calculator"></i>
        </button>
    </div>
</td>
```

**File**: `styles/pages/workout.css`

```css
/* Weight input wrapper — plate calc overlays the right edge */
.weight-input-wrapper {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
}
.weight-input-wrapper .set-input {
    width: 100%;
    padding-right: 28px; /* room for plate calc icon */
}
.plate-calc-inline-btn {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
}
.plate-calc-inline-btn:active {
    opacity: 1;
    color: var(--primary);
}

/* Equalize reps and weight columns */
.exercise-table td:nth-child(2),
.exercise-table td:nth-child(3) {
    width: 35%;
}
.exercise-table .set-input {
    width: 100%;
    text-align: center;
    min-height: var(--input-height, 40px);
    font-size: var(--font-md);
    font-weight: 600;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    padding: var(--space-8);
}
.exercise-table .set-input:focus {
    border-color: var(--primary);
    outline: none;
}
.exercise-table .set-input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
    opacity: 0.6;
}
```

### 6c. Simplify set number column

With no set type system, the set number is just a plain number. Keep it clean:

```css
.set-number-cell {
    width: 28px;
    text-align: center;
    font-size: var(--font-sm);
    font-weight: 500;
    color: var(--text-muted);
    padding: 0;
}
```

### 6d. Completed set row styling

The current code adds `.set-row-completed` class (line 1009) and `.set-row-just-completed` for animation (line 1515-1516). Enhance the completed state:

```css
/* Completed set row */
.set-row-completed {
    opacity: 0.7;
}
.set-row-completed .set-input {
    color: var(--text-muted);
    border-color: transparent;
    background: var(--bg-card-hover, rgba(255, 255, 255, 0.03));
}
.set-row-completed .set-number-cell {
    color: var(--success);
}

/* Just-completed flash animation */
.set-row-just-completed {
    animation: set-flash var(--anim-normal) ease;
}
@keyframes set-flash {
    0% { background: rgba(29, 211, 176, 0.15); }
    100% { background: transparent; }
}

/* Completion check button */
.set-check {
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-md);
    color: var(--text-muted);
    padding: 0;
}
.set-check.checked {
    color: var(--success);
}
.set-check:active {
    transform: scale(0.9);
}
```

### 6e. Swipe-to-delete for set removal (replace Remove Set button)

The swipe-to-delete code already exists (`setupSwipeToDeleteInline()` line 781). It triggers `removeSetFromExercise()` when a row is swiped >70px left. Currently it's called during card expansion setup.

Remove the "Remove Set" button from the set controls. Keep only "Add Set":

**File**: `js/core/workout/exercise-ui.js`, lines 1044-1051 — replace:

```javascript
// Old:
html += `
    <div class="set-controls">
        <button class="btn btn-secondary btn-small" onclick="removeSetFromExercise(${exerciseIndex})">
            <i class="fas fa-minus"></i> Remove Set
        </button>
        <button class="btn btn-primary btn-small" onclick="addSetToExercise(${exerciseIndex})">
            <i class="fas fa-plus"></i> Add Set
        </button>
    </div>
`;

// New:
html += `
    <button class="btn-add-set" onclick="addSetToExercise(${exerciseIndex})">
        <i class="fas fa-plus"></i> Add Set
    </button>
`;
```

```css
.btn-add-set {
    width: 100%;
    padding: var(--space-10);
    background: none;
    border: 1px dashed var(--border-light);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--font-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    margin-top: var(--space-8);
}
.btn-add-set:active {
    background: var(--primary-bg-subtle, rgba(29, 211, 176, 0.1));
    color: var(--primary);
    border-color: var(--primary);
}
```

Ensure `setupSwipeToDeleteInline()` is called in `expandExercise()` after the table HTML is inserted into the DOM. It already should be — verify the call exists after `body.innerHTML = ...` is set.

### 6f. Table header cleanup

The current table header shows `Set | Reps | Weight (lbs) | ` (empty th for checkmark). Make it tighter:

```css
.exercise-table thead th {
    font-size: var(--font-xs);
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: var(--space-4) var(--space-8);
    border-bottom: 1px solid var(--border-light);
}
.exercise-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--space-4);
}
.exercise-table tbody td {
    padding: var(--space-6) var(--space-4);
    vertical-align: middle;
}
```

### 6g. Full set row HTML (reference for implementor)

The final set row should look like this:

```html
<tr class="${isSetDone ? 'set-row-completed' : ''}">
    <td class="set-number-cell">${i + 1}</td>
    <td>
        <input type="number" class="set-input" inputmode="numeric"
               placeholder="${repsPlaceholder}"
               value="${set.reps}"
               onchange="updateSet(${exerciseIndex}, ${i}, 'reps', this.value)">
    </td>
    <td class="set-weight-cell">
        <div class="weight-input-wrapper">
            <input type="number" class="set-input" inputmode="decimal"
                   placeholder="${weightPlaceholder}"
                   value="${displayWeight}"
                   onchange="updateSet(${exerciseIndex}, ${i}, 'weight', this.value)">
            <button class="plate-calc-inline-btn"
                onclick="openPlateCalcPopover(${exerciseIndex})"
                title="Plate calculator"
                aria-label="Calculate plates">
                <i class="fas fa-calculator"></i>
            </button>
        </div>
    </td>
    <td class="set-complete-cell">
        <button class="set-check ${isSetDone ? 'checked' : ''}"
                onclick="toggleSetComplete(${exerciseIndex}, ${i})"
                aria-label="Mark set ${i + 1} complete">
            <i class="fas ${isSetDone ? 'fa-check-circle' : 'fa-circle'}"></i>
        </button>
    </td>
</tr>
```

Note: No set type column. No delete button. Delete is swipe-only.

---

## 7. Stats Page Focus

**Problem**: Same issue as dashboard — data-heavy, not action-focused. The stats page renders 9 sections via `renderProgressView()` in `stats-ui.js`: summary cards, category pills, exercise dropdown, equipment pills, chart type toggle, time range picker, chart, exercise stats summary, session history, weekly volume chart, body part distribution, heat map calendar, and PR timeline. It's an analytics dashboard crammed into a phone screen.

**Core question this page answers**: "Am I getting stronger?"

**Goal**: Reduce to 4-5 focused sections. Chart is the hero. Everything else supports it.

### New Stats Page Structure

```
┌─────────────────────────────────┐
│ 📈 Progress                     │
├─────────────────────────────────┤
│  🔥 21      🏋 213     📋 101   │  ← Compact stat row (keep as-is)
│  streak    workouts  exercises  │
├─────────────────────────────────┤
│ [Push] [Pull] [Legs] [Core]... │  ← Category pills (keep)
│                                 │
│ EXERCISE: [Seated Chest Press▼] │  ← Dropdown (smarter default)
│ Current: 110 lbs  ↑ 15% (3M)   │  ← NEW: headline stat
├─────────────────────────────────┤
│ [Weight] [Volume] [Est. 1RM]    │  ← Chart type toggle (keep)
│ ┌─────────────────────────────┐ │
│ │         📈 Chart            │ │  ← Chart (HERO element)
│ │    with trend line overlay  │ │
│ └─────────────────────────────┘ │
│ [1M] [3M] [6M] [1Y] [ALL]      │  ← Time range (keep)
├─────────────────────────────────┤
│ ▼ Session History (collapsed)   │  ← Collapsible
│ ▼ Weekly Volume (collapsed)     │  ← Collapsible  
│ ▼ Body Part Split (collapsed)   │  ← Collapsible
└─────────────────────────────────┘
```

### Implementation Details

#### 7a. Smart default exercise selection

**File**: `js/core/ui/stats-ui.js`

The current default is the first exercise in the first category (alphabetical). Change to most frequently logged exercise in the last 30 days.

Find the function that populates the exercise dropdown (inside `renderExerciseSelector()` or where `exerciseHierarchy` is used to set the initial selection). Replace the default selection logic:

```javascript
// BEFORE: default to first category → first exercise → first equipment
// AFTER: default to most frequently logged exercise this month

function getMostFrequentExercise(exerciseHierarchy, recentWorkouts) {
    // Count exercise occurrences in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const exerciseCounts = {};
    recentWorkouts
        .filter(w => new Date(w.date) >= thirtyDaysAgo)
        .forEach(w => {
            if (w.exercises) {
                Object.values(w.exercises).forEach(ex => {
                    const key = ex.name;
                    exerciseCounts[key] = (exerciseCounts[key] || 0) + 1;
                });
            }
        });
    
    // Find the most frequent exercise that exists in the hierarchy
    let bestExercise = null;
    let bestCount = 0;
    
    for (const [category, exercises] of Object.entries(exerciseHierarchy)) {
        for (const [exerciseName, variants] of Object.entries(exercises)) {
            const count = exerciseCounts[exerciseName] || 0;
            if (count > bestCount) {
                bestCount = count;
                bestExercise = { category, exerciseName, equipment: variants[0]?.equipment };
            }
        }
    }
    
    return bestExercise;
}
```

In `renderProgressView()`, after building `exerciseHierarchy`, call this function and use the result to set the initial `selectedCategory`, `selectedExercise`, and `selectedEquipment` before rendering.

#### 7b. Add headline stat above chart

**File**: `js/core/ui/stats-ui.js`

After the exercise/equipment selection and before the chart, add a prominent stat showing the user's current level and trend:

```javascript
function renderHeadlineStat(chartData, exerciseName, unit) {
    if (!chartData || chartData.length === 0) return '';
    
    const current = chartData[chartData.length - 1].y;
    const oldest = chartData[0].y;
    const percentChange = oldest > 0 ? Math.round(((current - oldest) / oldest) * 100) : 0;
    const direction = percentChange >= 0 ? 'up' : 'down';
    const arrow = percentChange >= 0 ? '↑' : '↓';
    const displayUnit = unit === 'lbs' ? 'lbs' : 'kg';
    
    return `
        <div class="headline-stat">
            <span class="headline-value">${current} ${displayUnit}</span>
            <span class="headline-trend ${direction}">${arrow} ${Math.abs(percentChange)}%</span>
        </div>
    `;
}
```

Insert this HTML into the stats content, between the exercise selector and the chart section. Find where `renderExerciseChart()` output is appended and add the headline stat just before it.

**File**: `styles/pages/stats.css`

```css
/* Headline Stat */
.headline-stat {
    display: flex;
    align-items: baseline;
    gap: var(--space-12);
    padding: var(--space-8) 0 var(--space-16);
}
.headline-value {
    font-size: var(--font-display-sm);
    font-weight: 700;
    color: var(--text-strong);
}
.headline-trend {
    font-size: var(--font-sm);
    font-weight: 600;
    padding: var(--space-2) var(--space-8);
    border-radius: var(--radius-pill);
}
.headline-trend.up {
    color: var(--success);
    background: var(--success-bg);
}
.headline-trend.down {
    color: var(--danger);
    background: var(--danger-bg);
}
```

#### 7c. Collapse equipment pills by default

**File**: `js/core/ui/stats-ui.js`

Find `renderExerciseSelector()` — the section that renders equipment pills (`.equipment-pill` elements). Wrap it in a collapsible container:

```javascript
// In renderExerciseSelector(), change the equipment pills section from always-visible to:
function renderEquipmentSection(variants, selectedEquipment) {
    if (variants.length <= 1) {
        // Only one equipment option — don't show the filter at all
        return '';
    }
    return `
        <details class="equipment-filter-details">
            <summary class="equipment-filter-toggle">
                <span>Equipment: ${selectedEquipment || 'All'}</span>
                <span class="equipment-filter-count">${variants.length}</span>
                <i class="fas fa-chevron-down"></i>
            </summary>
            <div class="equipment-pill-row">
                ${variants.map(v => `
                    <button class="equipment-pill ${v.equipment === selectedEquipment ? 'active' : ''}"
                            onclick="selectEquipment('${v.equipment}')">
                        ${v.equipment} <span class="equipment-count">${v.sessionCount}</span>
                    </button>
                `).join('')}
            </div>
        </details>
    `;
}
```

**File**: `styles/pages/stats.css`

```css
/* Collapsible equipment filter */
.equipment-filter-details {
    margin-bottom: var(--space-12);
}
.equipment-filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    font-size: var(--font-xs);
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-8) 0;
    list-style: none;
}
.equipment-filter-toggle::-webkit-details-marker {
    display: none;
}
.equipment-filter-count {
    background: var(--primary-bg);
    color: var(--primary);
    font-size: var(--font-2xs);
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-pill);
}
.equipment-filter-toggle i {
    margin-left: auto;
    font-size: var(--font-2xs);
    transition: transform var(--anim-normal);
}
details[open] .equipment-filter-toggle i {
    transform: rotate(180deg);
}
.equipment-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
    padding: var(--space-8) 0;
}
```

#### 7d. Add trend line to chart

**File**: `js/core/ui/stats-ui.js`

Find the Chart.js configuration inside `renderExerciseChart()` (the `chartConfigs` object or where `new Chart()` is called). Add a second dataset for the trend line:

```javascript
function calculateTrendLine(data) {
    if (data.length < 2) return [];
    
    // Simple linear regression
    const n = data.length;
    const indices = data.map((_, i) => i);
    const values = data.map(d => d.y);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return data.map((d, i) => ({
        x: d.x,
        y: Math.round((slope * i + intercept) * 10) / 10
    }));
}
```

In the Chart.js config, add the trend line as a second dataset:

```javascript
// After building the primary dataset, add:
const trendData = calculateTrendLine(chartData);

const datasets = [
    {
        // ... existing primary dataset config ...
    },
    {
        label: 'Trend',
        data: trendData,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        tension: 0
    }
];
```

#### 7e. Collapse secondary sections

**File**: `js/core/ui/stats-ui.js`

Find where `renderSessionHistory()`, `renderWeeklyVolumeChart()`, `renderBodyPartDistribution()`, `renderHeatMapCalendar()`, and `renderPRTimeline()` are called in `renderProgressView()`. Wrap each in a `<details>` element:

```javascript
// Replace direct HTML insertion with collapsible wrappers:
function wrapInCollapsible(title, contentHtml, sectionId) {
    return `
        <details class="stats-collapsible" id="${sectionId}">
            <summary class="stats-collapsible-header">
                <span>${title}</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                ${contentHtml}
            </div>
        </details>
    `;
}

// In renderProgressView(), replace:
// container.innerHTML += renderSessionHistory(sessions);
// With:
container.innerHTML += wrapInCollapsible('Session History', renderSessionHistory(sessions), 'session-history-section');
container.innerHTML += wrapInCollapsible('Weekly Volume', renderWeeklyVolumeChart(workouts), 'weekly-volume-section');
container.innerHTML += wrapInCollapsible('Body Part Distribution', renderBodyPartDistribution(workouts), 'body-part-section');
container.innerHTML += wrapInCollapsible('Training Heat Map', renderHeatMapCalendar(workouts), 'heat-map-section');
container.innerHTML += wrapInCollapsible('PR Timeline', renderPRTimeline(prs), 'pr-timeline-section');
```

**Note**: The Chart.js canvases inside collapsed `<details>` elements won't render correctly until opened. Add a listener to initialize charts on first open:

```javascript
document.querySelectorAll('.stats-collapsible').forEach(details => {
    details.addEventListener('toggle', function() {
        if (this.open) {
            // Trigger chart resize for any Chart.js canvas inside
            const canvases = this.querySelectorAll('canvas');
            canvases.forEach(canvas => {
                const chart = Chart.getChart(canvas);
                if (chart) chart.resize();
            });
        }
    });
});
```

**File**: `styles/pages/stats.css`

```css
/* Stats collapsible sections */
.stats-collapsible {
    margin-bottom: var(--gap-items);
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
    overflow: hidden;
}
.stats-collapsible-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-16) var(--pad-card-x);
    cursor: pointer;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-secondary);
    list-style: none;
}
.stats-collapsible-header::-webkit-details-marker {
    display: none;
}
.stats-collapsible-chevron {
    font-size: var(--font-xs);
    color: var(--text-muted);
    transition: transform var(--anim-normal);
}
details[open] > .stats-collapsible-header .stats-collapsible-chevron {
    transform: rotate(180deg);
}
.stats-collapsible-body {
    padding: 0 var(--pad-card-x) var(--pad-card-x);
}
```

#### 7f. Section removal summary

| Section | Action | Reason |
|---------|--------|--------|
| Summary cards (streak/workouts/exercises) | **Keep** | Compact, useful at-a-glance |
| Category pills | **Keep** | Essential for navigation |
| Exercise dropdown | **Keep** — change default | Core interaction |
| Equipment pills | **Collapse** — hidden by default | Rarely needed, noise |
| Headline stat | **Add** — new | Answers "Am I getting stronger?" immediately |
| Chart type toggle | **Keep** | Core interaction |
| Chart | **Keep** — add trend line | Hero element of this page |
| Time range picker | **Keep** | Core interaction |
| Exercise stats summary | **Collapse** | Useful but secondary |
| Session history | **Collapse** | Useful but secondary |
| Weekly volume chart | **Collapse** | Already on dashboard topic |
| Body part distribution | **Collapse** | Interesting but not daily |
| Heat map calendar | **Collapse** | Redundant with History tab |
| PR timeline | **Collapse** | Redundant with dashboard |

### Validation
- The chart should be visible without scrolling on iPhone (within first ~500px)
- Default exercise should be one the user recognizes instantly
- Collapsed sections should lazy-render charts on first open

---

## 8. History Page Cleanup

**Problem**: Calendar with tiny emoji indicators, legend using 40px for rarely needed info, search bar always visible taking 44px, and the "Workouts This Month" list below is a long scroll. The page tries to be both a calendar and a workout browser.

**Core question this page answers**: "What did I do recently?"

**Goal**: Calendar is compact and scannable. Workout list is information-dense.

### Current Structure (from `workout-history.js`)
- `generateCalendarGrid()` renders a 42-cell grid with `getWorkoutIcon()` returning category emoji icons
- `renderRecentWorkoutsList()` renders paginated workout items below
- Legend rendered inline in `generateCalendarGrid()` with id `calendar-legend`
- Search uses `filterBySearch()` + `filterByCategory()` with inputs `history-search-input` and `history-category-filter`

### Implementation Details

#### 8a. Replace emoji workout indicators with colored dots

**File**: `js/core/workout/workout-history.js`

Find the `getWorkoutIcon()` function (or wherever calendar day workout indicators are generated inside `generateCalendarGrid()`). Currently returns emoji-based category icons. Replace with colored dots:

```javascript
function getWorkoutDots(workoutsForDay) {
    if (!workoutsForDay || workoutsForDay.length === 0) return '';
    
    const dots = workoutsForDay.map(w => {
        const category = getCategoryFromWorkoutType(w.workoutType);
        const statusClass = w.cancelledAt ? 'cancelled' : 
                           w.completedAt ? 'completed' : 'incomplete';
        return `<span class="cal-dot cal-dot--${category} cal-dot--${statusClass}"></span>`;
    });
    
    // Max 3 dots visible, show "+N" if more
    const visible = dots.slice(0, 3).join('');
    const overflow = workoutsForDay.length > 3 
        ? `<span class="cal-dot-overflow">+${workoutsForDay.length - 3}</span>` 
        : '';
    
    return `<div class="cal-dot-row">${visible}${overflow}</div>`;
}

function getCategoryFromWorkoutType(workoutType) {
    const type = (workoutType || '').toLowerCase();
    if (type.includes('push') || type.includes('chest') || type.includes('shoulder')) return 'push';
    if (type.includes('pull') || type.includes('back') || type.includes('bicep')) return 'pull';
    if (type.includes('leg') || type.includes('squat') || type.includes('glute')) return 'legs';
    if (type.includes('core') || type.includes('ab')) return 'core';
    return 'other';
}
```

In `generateCalendarGrid()`, replace the current workout icon rendering with `getWorkoutDots(workoutsForDay)`.

**File**: `styles/pages/history.css`

```css
/* Calendar workout dots */
.cal-dot-row {
    display: flex;
    justify-content: center;
    gap: 3px;
    margin-top: var(--space-2);
    min-height: 8px;
}
.cal-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
}
/* Category colors */
.cal-dot--push { background: var(--cat-push); }
.cal-dot--pull { background: var(--cat-pull); }
.cal-dot--legs { background: var(--cat-legs); }
.cal-dot--core { background: var(--cat-core); }
.cal-dot--other { background: var(--cat-other); }

/* Status modifiers */
.cal-dot--cancelled { opacity: 0.3; }
.cal-dot--incomplete { 
    background: transparent;
    border: 1.5px solid currentColor;
}
.cal-dot--incomplete.cal-dot--push { border-color: var(--cat-push); }
.cal-dot--incomplete.cal-dot--pull { border-color: var(--cat-pull); }
.cal-dot--incomplete.cal-dot--legs { border-color: var(--cat-legs); }

.cal-dot-overflow {
    font-size: 8px;
    color: var(--text-muted);
    line-height: 1;
}
```

#### 8b. Remove the legend

**File**: `js/core/workout/workout-history.js`

Find where `calendar-legend` is generated inside `generateCalendarGrid()` (around line 442). Remove or comment out the entire legend HTML block:

```javascript
// REMOVE this block:
// const legendHtml = `
//     <div id="calendar-legend" class="calendar-legend">
//         <span class="legend-item">● Completed</span>
//         ...
//     </div>
// `;
```

The colored dots are self-explanatory — Push is always the same color, Pull another, etc. If users need a reference, the category pills on the Stats page serve that purpose.

**File**: `styles/pages/history.css`

Remove or comment out `.calendar-legend` and `.legend-item` styles.

#### 8c. Collapsible search

**File**: `js/core/workout/workout-history.js` or `index.html`

Find where the search input (`history-search-input`) and category filter (`history-category-filter`) are rendered. Wrap them in a togglable container:

```html
<!-- In the History section header, add a search toggle button -->
<div class="history-header">
    <h2><i class="fas fa-calendar-alt"></i> History</h2>
    <div class="history-header-actions">
        <button class="btn-icon-sm" onclick="toggleHistorySearch()" aria-label="Search">
            <i class="fas fa-search"></i>
        </button>
        <button class="btn-primary-sm" onclick="showManualWorkout()">+ Add Missing</button>
    </div>
</div>

<!-- Search bar — hidden by default -->
<div id="history-search-bar" class="history-search-bar hidden">
    <input type="text" id="history-search-input" placeholder="Search exercises or workouts..." 
           oninput="filterBySearch(this.value)">
    <select id="history-category-filter" onchange="filterByCategory(this.value)">
        <option value="">All Types</option>
        <!-- populated dynamically -->
    </select>
</div>
```

**File**: `js/core/workout/workout-history.js`

```javascript
function toggleHistorySearch() {
    const searchBar = document.getElementById('history-search-bar');
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
        document.getElementById('history-search-input').focus();
    }
}
// Export and add to window in main.js
```

**File**: `styles/pages/history.css`

```css
.history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-12) 0;
}
.history-header-actions {
    display: flex;
    gap: var(--space-8);
    align-items: center;
}
.btn-icon-sm {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: var(--font-sm);
}
.btn-icon-sm:active {
    background: var(--bg-card-hi);
    color: var(--primary);
}
.history-search-bar {
    display: flex;
    gap: var(--space-8);
    padding: var(--space-8) 0 var(--space-16);
    animation: slide-down 0.2s ease-out;
}
.history-search-bar.hidden {
    display: none;
}
@keyframes slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}
.history-search-bar input {
    flex: 1;
}
.history-search-bar select {
    min-width: 120px;
}
```

#### 8d. Improve workout list items

**File**: `js/core/workout/workout-history.js`

Find `renderRecentWorkoutsList()` (line ~461). Currently each `.recent-workout-item` shows workout name, date, duration, exercise count, and status icon. Make the items more information-dense:

```javascript
function renderWorkoutListItem(workout) {
    const category = getCategoryFromWorkoutType(workout.workoutType);
    const exerciseNames = workout.exercises 
        ? Object.values(workout.exercises).map(e => e.name).slice(0, 3).join(', ')
        : '';
    const extraCount = workout.exercises 
        ? Math.max(0, Object.keys(workout.exercises).length - 3)
        : 0;
    const duration = workout.totalDuration 
        ? `${Math.round(workout.totalDuration / 60)}m` 
        : '';
    const setCount = workout.exercises
        ? Object.values(workout.exercises).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0)
        : 0;
    const dateStr = formatRelativeDate(workout.date); // "Today", "Yesterday", "Apr 10"
    
    const statusClass = workout.cancelledAt ? 'cancelled' : 
                        workout.completedAt ? 'completed' : 'incomplete';
    
    return `
        <div class="row-card history-workout-row" 
             data-action="viewWorkoutDetail" data-doc-id="${workout.docId}">
            <div class="cal-dot cal-dot--${category}" style="width: 10px; height: 10px;"></div>
            <div class="row-card__content">
                <div class="row-card__title">${workout.workoutType}</div>
                <div class="row-card__subtitle">${exerciseNames}${extraCount > 0 ? ` +${extraCount}` : ''}</div>
                <div class="row-card__detail">${dateStr} · ${duration} · ${setCount} sets</div>
            </div>
            <div class="history-workout-status history-workout-status--${statusClass}">
                ${statusClass === 'completed' ? '<i class="fas fa-check"></i>' : 
                  statusClass === 'cancelled' ? '<i class="fas fa-times"></i>' : 
                  '<i class="fas fa-minus"></i>'}
            </div>
        </div>
    `;
}
```

**File**: `styles/pages/history.css`

```css
/* History workout list items */
.history-workout-row {
    padding: var(--space-12) var(--space-16);
    margin-bottom: var(--space-4);
}
.history-workout-status {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-pill);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-xs);
    flex-shrink: 0;
}
.history-workout-status--completed {
    background: var(--success-bg);
    color: var(--success);
}
.history-workout-status--cancelled {
    background: var(--danger-bg);
    color: var(--danger);
}
.history-workout-status--incomplete {
    background: var(--warning-bg);
    color: var(--warning);
}
```

#### 8e. Compact the calendar grid

**File**: `styles/pages/history.css`

Tighten the calendar cells to save vertical space:

```css
.calendar-day {
    padding: var(--space-4);
    min-height: 44px;  /* Reduced from whatever it currently is */
    text-align: center;
}
.day-number {
    font-size: var(--font-sm);
    font-weight: 500;
    line-height: 1;
}
```

### Validation
- Calendar + month header should fit in top ~350px on iPhone
- At least 2-3 workout list items visible below the calendar without scrolling
- Search bar hidden by default, revealed with icon tap
- No legend visible
- Category dots use the same colors as Stats category pills

---

## 9. Exercise Library Polish

**Problem**: Exercise items in `exercise-manager-ui.js` use `.exercise-card-new` elements that are text-heavy with no visual differentiation. Large gaps between category groups. No indication of how often the user has done each exercise. The Quick Add and Suggested sections are useful but could be tighter.

**Core question this page answers**: "Which exercise am I looking for?"

### Current Structure (from `exercise-manager-ui.js`)
- `renderExercises()` renders the list grouped by body part
- Each item is `.exercise-card-new` with `.exercise-card-icon`, `.exercise-card-info`, `.exercise-card-name`, and `.exercise-card-edit` button
- Already has equipment type icons mapping (Barbell → `fa-dumbbell`, Machine → `fa-cogs`, Cable → `fa-link`, etc.)
- Two views: Category View (`exercise-category-view`) and List View (`exercise-list-view`)
- `filterAndRenderExercises()` handles search + body part + equipment type filtering

### Implementation Details

#### 9a. Enhance exercise items with usage data

**File**: `js/core/ui/exercise-manager-ui.js`

Find where individual exercise items are rendered (inside `renderExercises()` or `filterAndRenderExercises()`). Add a usage count from workout history:

```javascript
// Add a helper to count exercise usage
function getExerciseUsageCount(exerciseName, workouts) {
    let count = 0;
    workouts.forEach(w => {
        if (w.exercises) {
            Object.values(w.exercises).forEach(ex => {
                if (ex.name === exerciseName) count++;
            });
        }
    });
    return count;
}

// Cache usage counts once when the library opens
let exerciseUsageCounts = null;
function buildUsageCache(workouts) {
    exerciseUsageCounts = {};
    workouts.forEach(w => {
        if (w.exercises) {
            Object.values(w.exercises).forEach(ex => {
                exerciseUsageCounts[ex.name] = (exerciseUsageCounts[ex.name] || 0) + 1;
            });
        }
    });
}
```

When rendering each exercise card, add the count badge:

```javascript
// In the exercise card template, add after the exercise name:
const usageCount = exerciseUsageCounts?.[exercise.name] || 0;
const usageBadge = usageCount > 0 
    ? `<span class="exercise-usage-badge">×${usageCount}</span>` 
    : '';

// Updated card template:
`<div class="exercise-card-new" data-action="exerciseCardClick" data-exercise-id="${exercise.id}">
    <div class="exercise-card-icon"><i class="${getEquipmentTypeIcon(exercise.equipmentType)}"></i></div>
    <div class="exercise-card-info">
        <span class="exercise-card-name">${exercise.name}</span>
        <span class="exercise-card-meta">${exercise.bodyPart}${exercise.equipmentType ? ' · ' + exercise.equipmentType : ''}</span>
    </div>
    ${usageBadge}
    <button class="exercise-card-edit" data-action="editExercise" data-exercise-id="${exercise.id}">EDIT</button>
</div>`
```

**File**: `styles/pages/exercise-lib.css`

```css
/* Exercise usage badge */
.exercise-usage-badge {
    font-size: var(--font-2xs);
    font-weight: 600;
    color: var(--text-muted);
    background: var(--border-light);
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-pill);
    flex-shrink: 0;
    margin-right: var(--space-8);
}

/* Exercise card meta line (body part + equipment type) */
.exercise-card-meta {
    display: block;
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: var(--space-2);
}
```

#### 9b. Tighten category group spacing

**File**: `styles/pages/exercise-lib.css`

Find the styles for category headers within the exercise list. Reduce the gap:

```css
/* Category group headers in exercise list */
.exercise-group-header,
.exercise-category-title {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--text-strong);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-16) 0 var(--space-8);
    margin: 0;
    border-bottom: 1px solid var(--border-subtle);
}

/* Reduce gap between last item and next header */
.exercise-card-new:last-child {
    margin-bottom: 0;
}
```

#### 9c. Improve Quick Add chips

**File**: `styles/pages/exercise-lib.css` or `styles/pages/templates.css`

The Quick Add chips (`.quick-add-chip`) and Suggested For Location chips already work. Tighten their styling:

```css
.quick-add-chip {
    padding: var(--space-6) var(--space-12);
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-xs);
    cursor: pointer;
    white-space: nowrap;
}
.quick-add-chip:active {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
}
```

#### 9d. Sort exercises by relevance

**File**: `js/core/ui/exercise-manager-ui.js`

When rendering the exercise list, sort within each category group: favorites first, then by usage count (most used → least used), then alphabetical for unused exercises.

```javascript
function sortExercisesByRelevance(exercises, favorites, usageCounts) {
    return [...exercises].sort((a, b) => {
        // Favorites first
        const aFav = favorites.includes(a.id) ? 1 : 0;
        const bFav = favorites.includes(b.id) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        
        // Then by usage count
        const aCount = usageCounts?.[a.name] || 0;
        const bCount = usageCounts?.[b.name] || 0;
        if (aCount !== bCount) return bCount - aCount;
        
        // Then alphabetical
        return a.name.localeCompare(b.name);
    });
}
```

Apply this sort before rendering each category group.

### Validation
- Exercise items should show body part + equipment type on a second line
- Usage badges ("×28") visible on frequently used exercises
- Most-used exercises appear first within their category
- Gaps between category sections are ≤ 24px

---

## 10. Equipment Library Redesign — Body Type → Exercise → Equipment

**Problem**: The equipment library currently groups by location → brand. This answers "what does this gym have?" but the real question is **"what machines can I use for Seated Chest Press?"** or **"what chest exercises do I have equipment for?"** The hierarchy should be: Body Part → Exercise → Equipment (multiple machines per exercise).

**Core question this page answers**: "What equipment do I have for [exercise], and what exercises target [body part]?"

### Current Structure (from `equipment-library-ui.js`)
- `renderEquipmentLibrary()` at line 47 is the main render function
- Currently groups by location first, then by brand alphabetically
- Each item uses `.row-card.equip-lib-item` with `.row-card__icon`, `.row-card__content`, `.row-card__action`
- Filter by location dropdown and search bar in `.equip-lib-toolbar`
- `openEquipmentDetail()` drills into a single piece of equipment
- Equipment documents have fields: `name`, `brand`, `locations` (array), `exercises` (map of exercise names → settings), `exerciseVideos` (map)

### New hierarchy

```
Chest (body type)
├─ Seated Chest Press (exercise)         ← collapsible
│    ├─ Arsenal Strength Plated          ← equipment row
│    ├─ Hammer Strength ISO-Lateral
│    └─ Cybex Eagle
├─ Incline Chest Press (exercise)
│    ├─ Arsenal Strength Plated
│    └─ Panatta Incline Machine
├─ Pec Deck (exercise)
│    └─ Gymleco
└─ Dips (exercise)
     ├─ Panatta Dips Press Machine
     └─ Bodyweight (no equipment)

Back (body type)
├─ Lat Pulldown (exercise)
│    ├─ Arsenal Strength
│    └─ Cable Station
...
```

Key features:
- **Body part headers** are sticky section dividers
- **Exercise rows** are collapsible — show equipment count, tap to expand
- **Equipment rows** nested under each exercise — show brand, locations
- **Location filter pills** at top as a secondary filter
- **Quick-add**: During an active workout, tapping equipment on an exercise opens a picker that lets you add new equipment inline

### 10a. Data transformation — Build the hierarchy

**File**: `js/core/ui/equipment-library-ui.js`

The equipment documents store an `exercises` map (exercise name → settings). We invert this to build exercise → equipment[] groupings, then classify each exercise into a body part:

```javascript
/**
 * Build the Body Part → Exercise → Equipment hierarchy.
 * Inverts the equipment.exercises map so we group by exercise first.
 * 
 * @param {Array} allEquipment - Array of equipment documents from Firestore
 * @param {string|null} filterLocation - Optional location filter
 * @returns {Object} { bodyPart: { exercise: [equipment, ...], ... }, ... }
 */
function buildEquipmentHierarchy(allEquipment, filterLocation = null) {
    // Step 1: Filter by location if needed
    const equipment = filterLocation
        ? allEquipment.filter(e => (e.locations || []).includes(filterLocation))
        : allEquipment;
    
    // Step 2: Invert — build exerciseName → [equipment] map
    const exerciseToEquipment = {};
    for (const equip of equipment) {
        const exercises = Object.keys(equip.exercises || {});
        for (const exName of exercises) {
            if (!exerciseToEquipment[exName]) exerciseToEquipment[exName] = [];
            exerciseToEquipment[exName].push(equip);
        }
    }
    
    // Step 3: Classify each exercise into a body part
    const hierarchy = {};
    for (const [exName, equips] of Object.entries(exerciseToEquipment)) {
        const bodyPart = classifyExerciseBodyPart(exName);
        if (!hierarchy[bodyPart]) hierarchy[bodyPart] = {};
        hierarchy[bodyPart][exName] = equips;
    }
    
    return hierarchy;
}

/**
 * Classify an exercise name into a body part group.
 * Returns one of: 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Multi-Use'
 */
function classifyExerciseBodyPart(exerciseName) {
    const name = exerciseName.toLowerCase();
    
    // Chest
    if (/chest press|bench press|pec deck|pec fly|fly.*chest|incline press|decline press|push.?up|dips.*press|chest/.test(name)) return 'Chest';
    
    // Back
    if (/row|lat pull|pull.?down|pull.?up|chin.?up|deadlift|back ext|reverse fly|shrug|face pull/.test(name)) return 'Back';
    
    // Shoulders
    if (/shoulder press|overhead press|military press|lateral raise|front raise|rear delt|arnold|upright row/.test(name)) return 'Shoulders';
    
    // Arms
    if (/curl|tricep|bicep|pushdown|skull crush|hammer curl|preacher|dip(?!.*press)|kickback|extension.*arm/.test(name)) return 'Arms';
    
    // Legs
    if (/squat|leg press|leg curl|leg ext|lunge|calf|glute|hip|hamstring|quad|romanian|hack squat|step.?up/.test(name)) return 'Legs';
    
    // Core
    if (/ab|crunch|plank|sit.?up|core|oblique|wood.?chop|cable twist|russian twist/.test(name)) return 'Core';
    
    // Cardio
    if (/treadmill|bike|elliptical|rower|run|sprint|stair|jump rope|cardio/.test(name)) return 'Cardio';
    
    return 'Multi-Use';
}

// Body part display config
const BODY_PART_CONFIG = {
    'Chest':     { icon: 'fas fa-compress-arrows-alt', color: 'var(--cat-push)' },
    'Back':      { icon: 'fas fa-arrows-alt-v',        color: 'var(--cat-pull)' },
    'Shoulders': { icon: 'fas fa-arrow-up',             color: 'var(--cat-push)' },
    'Arms':      { icon: 'fas fa-hand-rock',            color: 'var(--cat-pull)' },
    'Legs':      { icon: 'fas fa-shoe-prints',          color: 'var(--cat-legs)' },
    'Core':      { icon: 'fas fa-bullseye',             color: 'var(--cat-core)' },
    'Cardio':    { icon: 'fas fa-heartbeat',            color: 'var(--danger)' },
    'Multi-Use': { icon: 'fas fa-th',                   color: 'var(--text-secondary)' },
};
```

### 10b. Render the hierarchy

```javascript
function renderEquipmentLibrary(allEquipment, filterLocation = null) {
    const hierarchy = buildEquipmentHierarchy(allEquipment, filterLocation);
    const groupOrder = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Multi-Use'];
    
    let html = '';
    for (const bodyPart of groupOrder) {
        const exercises = hierarchy[bodyPart];
        if (!exercises) continue;
        
        const exerciseNames = Object.keys(exercises).sort();
        const totalEquipment = exerciseNames.reduce((sum, ex) => sum + exercises[ex].length, 0);
        const config = BODY_PART_CONFIG[bodyPart];
        
        // Body part header (sticky)
        html += `
            <div class="equip-group-header">
                <div class="equip-group-header__left">
                    <i class="${config.icon}" style="color: ${config.color}"></i>
                    <span>${bodyPart}</span>
                </div>
                <span class="equip-group-header__count">${exerciseNames.length} exercises · ${totalEquipment} machines</span>
            </div>
        `;
        
        // Exercise rows (collapsible, each with nested equipment)
        for (const exName of exerciseNames) {
            const equips = exercises[exName];
            const equipId = exName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            
            html += `
                <div class="equip-exercise-row" onclick="toggleEquipmentExercise('${equipId}')">
                    <div class="equip-exercise-row__name">${exName}</div>
                    <div class="equip-exercise-row__meta">
                        <span class="equip-exercise-row__count">${equips.length} machine${equips.length !== 1 ? 's' : ''}</span>
                        <i class="fas fa-chevron-down equip-exercise-chevron" id="chevron-${equipId}"></i>
                    </div>
                </div>
                <div class="equip-nested-list" id="equip-list-${equipId}" style="display: none;">
            `;
            
            for (const equip of equips) {
                const locationNames = (equip.locations || []).join(', ') || 'No location';
                const brandLabel = equip.brand ? `${equip.brand}` : '';
                
                html += `
                    <div class="row-card equip-nested-item" onclick="event.stopPropagation(); openEquipmentDetail('${equip.id}')">
                        <div class="equip-nested-item__info">
                            <span class="row-card__title">${equip.name}</span>
                            <span class="row-card__subtitle">${brandLabel}${brandLabel && locationNames ? ' · ' : ''}${locationNames}</span>
                        </div>
                        <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
            }
            
            html += `</div>`; // close equip-nested-list
        }
    }
    
    return html;
}

// Toggle exercise expand/collapse
function toggleEquipmentExercise(equipId) {
    const list = document.getElementById(`equip-list-${equipId}`);
    const chevron = document.getElementById(`chevron-${equipId}`);
    if (!list) return;
    
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}
// Export: window.toggleEquipmentExercise = toggleEquipmentExercise; in main.js
```

### 10c. Filter pills — Location as secondary filter

Replace the current location dropdown with filter pills. Location becomes a secondary filter applied on top of the body-part → exercise grouping:

```html
<!-- In the toolbar area -->
<div class="equip-filter-row">
    <button class="search-icon-btn" onclick="toggleEquipmentSearch()">
        <i class="fas fa-search"></i>
    </button>
    <div class="equip-location-pills">
        <button class="filter-pill active" onclick="filterEquipmentByLocation(null)">All Gyms</button>
        <!-- Dynamically rendered from user's locations -->
        <button class="filter-pill" onclick="filterEquipmentByLocation('Home Gym')">Home Gym</button>
        <button class="filter-pill" onclick="filterEquipmentByLocation('Downtown Gym')">Downtown</button>
    </div>
</div>
```

This way the user sees "Chest exercises at Home Gym" or "All arm exercises across all gyms."

### 10d. Quick-add equipment from active workout

When a user is in an active workout and taps the equipment name on an exercise card, the equipment picker should include a "+ Add New" option that creates a new equipment document inline:

```javascript
// In exercise-ui.js, inside the equipment picker flow:
function showEquipmentPicker(exerciseIndex, exerciseName) {
    // Get existing equipment for this exercise
    const existing = getEquipmentForExercise(exerciseName);
    
    let html = existing.map(e => `
        <button class="equip-picker-option" onclick="selectEquipment(${exerciseIndex}, '${e.id}')">
            ${e.name}
            <span class="equip-picker-location">${(e.locations || []).join(', ')}</span>
        </button>
    `).join('');
    
    // Quick-add option at the bottom
    html += `
        <button class="equip-picker-option equip-picker-add" onclick="quickAddEquipment(${exerciseIndex}, '${exerciseName}')">
            <i class="fas fa-plus"></i> Add New Equipment
        </button>
    `;
    
    // Render in a bottom-sheet or inline popover
    showBottomSheet('Choose Equipment', html);
}

// Quick-add: prompts for name, auto-associates with current exercise + location
async function quickAddEquipment(exerciseIndex, exerciseName) {
    const name = prompt('Equipment name (e.g., "Arsenal Strength Flat Bench"):');
    if (!name) return;
    
    const equipmentData = {
        name: name.trim(),
        brand: '',  // Can be edited later in equipment library
        locations: AppState.currentLocation ? [AppState.currentLocation] : [],
        exercises: { [exerciseName]: {} },
    };
    
    const docId = await saveEquipment(equipmentData);
    selectEquipment(exerciseIndex, docId);
    showNotification('Equipment added', 'success');
}
```

### 10e. CSS — Hierarchy styling

```css
/* Body part group header — sticky */
.equip-group-header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-10) var(--space-16);
    background: var(--bg-app);
    border-bottom: 1px solid var(--border-light);
}
.equip-group-header__left {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    font-size: var(--font-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
}
.equip-group-header__left i {
    font-size: var(--font-sm);
}
.equip-group-header__count {
    font-size: var(--font-xs);
    color: var(--text-muted);
    font-weight: 500;
}

/* Exercise row (collapsible) */
.equip-exercise-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-12) var(--space-16);
    cursor: pointer;
    border-bottom: 1px solid var(--border-subtle);
}
.equip-exercise-row:active {
    background: var(--bg-card-hover);
}
.equip-exercise-row__name {
    font-size: var(--font-base);
    font-weight: 600;
    color: var(--text-strong);
}
.equip-exercise-row__meta {
    display: flex;
    align-items: center;
    gap: var(--space-8);
}
.equip-exercise-row__count {
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.equip-exercise-chevron {
    font-size: var(--font-xs);
    color: var(--text-muted);
    transition: transform var(--anim-normal);
}

/* Nested equipment list under an exercise */
.equip-nested-list {
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
}
.equip-nested-item {
    margin: 0;
    padding: var(--space-10) var(--space-16) var(--space-10) var(--space-32);
    border-bottom: 1px solid var(--border-subtle);
    border-radius: 0;
}
.equip-nested-item:last-child {
    border-bottom: none;
}
.equip-nested-item__info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
}

/* Equipment picker (in-workout quick-add) */
.equip-picker-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: var(--space-12) var(--space-16);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-strong);
    font-size: var(--font-base);
    text-align: left;
    cursor: pointer;
}
.equip-picker-option:active {
    background: var(--bg-card-hover);
}
.equip-picker-location {
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.equip-picker-add {
    color: var(--primary);
    gap: var(--space-8);
}

/* Filter row */
.equip-filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-6) var(--space-16);
}
.equip-location-pills {
    display: flex;
    gap: var(--space-6);
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
}
.equip-location-pills::-webkit-scrollbar { display: none; }
```

### 10f. Empty states

```javascript
// Empty groups are simply skipped in renderEquipmentLibrary().
// For filtered views (e.g., filtering by location shows nothing), show:
function renderEmptyEquipment() {
    return `
        <div class="empty-state-compact">
            <i class="fas fa-wrench"></i>
            <p>No equipment found</p>
            <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
        </div>
    `;
}
```

```css
.empty-state-compact {
    text-align: center;
    padding: var(--space-24) var(--space-16);
    color: var(--text-muted);
}
.empty-state-compact i {
    font-size: var(--font-xl);
    opacity: 0.3;
    margin-bottom: var(--space-12);
    display: block;
}
.empty-state-compact p {
    font-size: var(--font-sm);
    margin-bottom: var(--space-8);
}
.empty-state-hint {
    font-size: var(--font-xs);
    color: var(--text-muted);
    opacity: 0.7;
}
```

### Validation
- Equipment grouped by Body Part → Exercise → Equipment (three-level hierarchy)
- Each exercise row shows machine count, expands to reveal individual equipment
- Body part group headers are sticky and show exercise + machine counts
- Location filter as secondary pill filter on top
- Quick-add equipment from inside an active workout (equipment picker + "Add New")
- New equipment auto-associates with current exercise + GPS-detected location
- Equipment library remains the "home base" for organizing and editing
- Searching narrows results across all groups instantly
- Exercises with no clear body part fall into "Multi-Use"

---

## 11. Card & Background Contrast

**Problem**: `--bg-card: #0a0f15` is almost identical to `--bg-app: #05070b`. Cards don't visually separate from background. The `--border-subtle` (opacity 0.04) is nearly invisible.

### Changes

**File**: `styles/tokens.css`

```css
/* Increase card-to-background contrast */
--bg-card: #111820;      /* Was #0a0f15 — bump ~12% lighter */
--bg-card-hi: #172030;   /* Hover/active state */
--bg-surface: #0d1218;   /* Between app and card */

/* Increase border visibility */
--border-subtle: rgba(255, 255, 255, 0.06);  /* Was 0.04 */
--border-light: rgba(255, 255, 255, 0.10);   /* Was 0.08 */
--border-medium: rgba(255, 255, 255, 0.15);  /* Was 0.12 */
```

### Validation
After changing, check these screens:
- Dashboard: cards should be clearly distinct from background
- Active workout: exercise cards should visually "float"
- Equipment library: rows should have visible separation
- Stats: the stat cards should be obvious

---

## 12. Typography Hierarchy

**Problem**: Inconsistent font sizes across the app. No clear visual distinction between display numbers, headings, body text, and labels.

### Rules

Apply these consistently across ALL screens:

1. **Display numbers** (streak count, stat values, progress ring):
   - `font-size: var(--font-display)` or `var(--font-display-sm)`
   - `font-weight: 700` or `800`
   - `color: var(--text-strong)`

2. **Section headings** (card titles, section headers):
   - `font-size: var(--font-md)` 
   - `font-weight: 700`
   - `color: var(--text-strong)`

3. **Body text** (exercise names, descriptions):
   - `font-size: var(--font-base)`
   - `font-weight: 400-600`
   - `color: var(--text-main)` or `var(--text-secondary)`

4. **Labels & captions** (metadata, timestamps, unit labels):
   - `font-size: var(--font-xs)` or `var(--font-2xs)`
   - `font-weight: 500-600`
   - `color: var(--text-muted)`
   - `text-transform: uppercase; letter-spacing: 0.5px` for labels

5. **Input values** (reps, weight in set table):
   - `font-size: var(--font-md)`
   - `font-weight: 600`
   - `color: var(--text-strong)`
   - Centered text

---

## 13. Micro-animations

**Goal**: Add subtle, GPU-accelerated animations that make the app feel alive without affecting performance.

### Only use `transform` and `opacity` (GPU composited)

**File**: Create `styles/animations.css` and add to `styles/index.css`

```css
/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}

/* Card expand/collapse */
.exercise-card-body {
    transition: max-height var(--anim-slow) var(--ease-out-expo),
                opacity var(--anim-normal);
}
.exercise-card:not(.expanded) .exercise-card-body {
    opacity: 0;
}
.exercise-card.expanded .exercise-card-body {
    opacity: 1;
}

/* Set completion flash */
@keyframes set-complete-flash {
    0% { background-color: transparent; }
    30% { background-color: var(--success-bg); }
    100% { background-color: transparent; }
}
.set-row.just-completed {
    animation: set-complete-flash 0.6s ease-out;
}

/* Progress bar fill */
.progress-bar-fill {
    transition: width 0.8s var(--ease-out-expo);
}

/* Chevron rotation */
.exercise-card-chevron {
    transition: transform var(--anim-normal) var(--ease-out-expo);
}

/* Page transitions */
.content-section {
    animation: page-fade-in 0.2s ease-out;
}
@keyframes page-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Bottom sheet slide */
.more-menu {
    transition: transform var(--anim-slow) var(--ease-out-expo);
}

/* Button press feedback */
.btn-hero-start:active,
.btn-finish-footer:active,
.btn-start-small:active {
    transform: scale(0.97);
    transition: transform 0.1s;
}
```

---

## 14. Implementation Order

Execute in this order for maximum impact with minimum risk:

### Phase 1: Foundation (no visual change, pure refactor)
1. **Section 1**: CSS Token Adoption — all files
2. **Section 11**: Card & Background Contrast — tokens.css only
3. **Section 12**: Typography Hierarchy — systematic pass

**Estimated time**: 4-6 hours  
**Risk**: Zero — purely cosmetic, no behavior changes  
**Validation**: App should look identical or slightly better

### Phase 2: Dashboard (biggest user-visible improvement)
4. **Section 2**: Dashboard Overhaul — all subsections

**Estimated time**: 3-4 hours  
**Risk**: Medium — changes data flow and rendering order  
**Validation**: Dashboard should fit on one screen without scrolling. "Start Workout" should be the first thing you see.

### Phase 3: Workout Flow (core daily experience)
5. **Section 3**: Workout Selector Redesign
6. **Section 4**: Active Workout Tightening
7. **Section 5**: Exercise Card Optimization
8. **Section 6**: Set Table & Input Polish

**Estimated time**: 6-8 hours  
**Risk**: High — changes the primary interaction flow  
**Validation**: Starting a workout should be 1 tap from dashboard, 1 tap from workout tab. Exercise logging should show 2+ exercises on screen simultaneously.

### Phase 4: Secondary Screens
9. **Section 7**: Stats Page Focus
10. **Section 8**: History Page Cleanup
11. **Section 9**: Exercise Library Polish
12. **Section 10**: Equipment Library Polish

**Estimated time**: 3-4 hours  
**Risk**: Low — isolated pages  
**Validation**: Each page should have one clear purpose

### Phase 5: Polish
13. **Section 13**: Micro-animations

**Estimated time**: 1-2 hours  
**Risk**: Zero — purely additive  
**Validation**: Test with `prefers-reduced-motion` to ensure animations are skippable

---

## Key Principles to Follow During Implementation

1. **One question per screen**: Dashboard = "What should I do?", Workout = "Log this set", Stats = "Am I improving?", History = "What did I do?"

2. **Remove before adding**: If a section doesn't help answer the screen's core question, remove it or collapse it.

3. **Token everything**: No raw px, rem, hex, or rgba values in page CSS. Everything flows through tokens.css.

4. **Test on mobile**: This app is used on iPhone. Every change should be verified at 390px viewport width.

5. **Ghost values everywhere**: Anywhere the app shows empty inputs or "tap to..." text, show the last session's values as placeholder content instead.

6. **Information density**: A world-class card shows the most useful information in the least space. Row cards (~70px) beat hero cards (~200px) for list items.
