# Dashboard v2 — Implementation Spec (Consolidation)

**Self-contained spec. This is the only implementation file Claude Code needs to read for this work.**

It supersedes `HEALTH-DASHBOARD-IMPLEMENTATION.md` (delete when V2 ships). It relies on prereq work that has already been implemented in `DASHBOARD-IMPLEMENTATION.md` (MD 1), `EQUIPMENT-WEIGHT-IMPLEMENTATION.md` (MD 2), and `PAGES-REDESIGN-IMPLEMENTATION.md` (MD 3), but the relevant pieces of those MDs are audited and summarized below — you do NOT need to re-read them.

**Mockup**: `mockups/dashboard-final-v2.html` (full dashboard + Chest drill-down + Legs drill-down + Bench Press drill-down)

---

## Prerequisite verification (audited against current codebase)

Before starting V2 work, the following existing implementations are confirmed shipped. V2 builds on these — do NOT re-implement.

### From MD 1 (Dashboard foundation + active workout) — ✓ ALL SHIPPED

| Item | Status | Location |
|------|--------|----------|
| `setWorkoutActiveState(active)` toggling `body.workout-active` | ✓ shipped | `js/core/ui/navigation.js:415` |
| 5-tab bottom nav with `bottom-nav__fab` + `fa-dumbbell` | ✓ shipped | `index.html` + `styles/pages/app-shell.css:93-118` |
| FAB animations (lift + rock + ring pulses) on `body.workout-active` | ✓ shipped | `styles/pages/app-shell.css` with `@keyframes fab-lift`, `fab-ring`, `dumbbell-shake` |
| `renderActiveWorkoutPill()` + pill timer | ✓ shipped | `js/core/ui/dashboard-ui.js:221, 270, 289` |
| `styles/components/active-pill.css` | ✓ shipped | imported in index.css |
| `renderHeroWorkoutCard()` removed | ✓ shipped | confirmed absent |
| Hybrid dashboard render order (greeting → pill → metrics → week timeline → insight → recent → PRs) | ✓ shipped | `dashboard-ui.js:74-200` |
| `startWorkoutFromHistory()` one-tap restart | ✓ shipped | `dashboard-ui.js:648` |

**V2 impact**: The foundation is ready. V2 just reshuffles the render order (moves Insight + For Today up, adds Training + Composition, removes the current metrics grid in favor of the new hero chip row) and adds the drill-down pages.

### From MD 2 (Equipment base weight + bodyweight) — ✓ ALL SHIPPED

| Item | Status | Location |
|------|--------|----------|
| Equipment `baseWeight` + `baseWeightUnit` fields + migration | ✓ shipped | `js/core/data/schema-migration.js:177-208` |
| `getSetTotalWeight(set, equipment)` (handles plate + bodyweight) | ✓ shipped | `js/core/utils/weight-calculations.js:36` |
| `getSetVolume(set, equipment)` | ✓ shipped | `weight-calculations.js:62` |
| Set schema `bodyWeight` / `addedWeight` / `isBodyweight` fields | ✓ shipped | `exercise-ui.js:1348-1350` |
| `getLatestBodyWeight()` returning `{ weight, unit, ageInDays }` | ✓ shipped | `app-state.js:20` |
| `ensureFreshBodyWeight()` prompt flow | ✓ shipped | `js/core/features/bodyweight-prompt.js:19` |
| Bodyweight exercise UI with BW banner + added-weight row | ✓ shipped | `exercise-ui.js:693-1308` |
| Equipment edit form conditional "Base weight" field | ✓ shipped | `schema-migration.js:107-119` |

**V2 impact**: All volume and max-weight aggregations in V2 route through `getSetTotalWeight()` — same function that already handles both plate-loaded and bodyweight work correctly. Just call it.

### From MD 3 (Pages redesign) — ✓ ENOUGH FOR V2

| Item | Status | Notes |
|------|--------|-------|
| `.page-header`, `.btn-save`, `.page-title` | ✓ shipped | `styles/components/page-header.css` |
| `.field`, `.field-label`, `.field-input` | ✓ shipped | `styles/components/fields.css` |
| `.chip-row`, `.chip`, category chip actives | ✓ shipped | `styles/components/chips.css` |
| `.segmented` | ✓ shipped | `styles/components/segmented-control.css` |
| `.s-group`, `.s-row` (aka `.group` / `.srow`) | ✓ shipped | `styles/components/grouped-rows.css` |
| `.empty-state` | ✓ shipped | `styles/components/empty-states.css` |

**V2 impact**: V2 reuses page-header, fields, chips, empty-state, and grouped-rows patterns. All present. The old legacy `forms.css` is still in the tree but **not used by V2** — it can be deleted in a later cleanup pass, not blocking.

**Not verified (but NOT blocking V2)**: Create Exercise form polish, DEXA detail stat-card redesign, AI Coach prompt-card redesign. These are MD 3 items V2 doesn't depend on.

### Missing prereqs that DO block V2 — tiny additions

Only two CSS tokens. Add them before starting V2 work:

**File**: `styles/tokens.css`

```css
:root {
    /* Add after the existing --cat-* tokens */
    --cat-shoulders: #56B6C2;
    --cat-shoulders-bg: rgba(86, 182, 194, 0.15);

    /* --cat-arms already exists (#E06C75) but confirm --cat-arms-bg exists too */
    --cat-arms-bg: rgba(224, 108, 117, 0.15); /* add if missing */
}
```

`--cat-chest` and `--cat-back` remain **aliased** — component code uses `--cat-push` for chest, `--cat-pull` for back. Don't add duplicates.

That's it. Everything else V2 needs is already in the codebase.

---

---

## This is a consolidation, not a net-add

The headline: this spec **reduces** codebase size and eliminates duplication, not the other way around. Before writing new code, Claude Code should **delete**:

| Delete | Why |
|--------|-----|
| The Stats tab entirely — `stats-ui.js`, `styles/pages/stats.css`, the `"stats"` case in nav routing | Every Stats analysis has a better home in the new dashboard drill-downs |
| `renderHeroWorkoutCard()` and `.hero-workout-card` / `.btn-hero-start` CSS | Replaced by the new hybrid dashboard — no hero "start workout" button anywhere |
| Any standalone body-weight widget on the current dashboard | Rolled into the Composition card |
| `exercise-progress.js` (if its only caller is Stats) | Its 1RM trend logic moves into the Exercise detail page; check callers before deleting |
| The old 3-card dashboard "Activity" metric cards from Phase 2 WIP (Volume by Body Part, Strength, Body Weight, Body Composition) | Replaced by the 6-muscle-group "Training" section |

After this ships, the bottom nav loses the Stats button — it's **4 buttons + center FAB**: Home · History · (+) · Profile/More · …or whatever layout works. The Stats slot can either be absorbed or replaced by something useful later (Body detail? Plan? TBD).

---

## Prerequisite work — small and targeted

Most of what we need already exists. Here's exactly what's not there:

### 1. `aggregateSessionsPerDayOfWeek()` — NEW
**File**: `js/core/features/metrics/aggregators.js`

```javascript
/**
 * Count how many times each template has been used on each day of the week.
 * @returns Map of templateId → { [dayOfWeek]: count }
 *          dayOfWeek is 0 (Sun) … 6 (Sat)
 */
export function aggregateSessionsPerDayOfWeek(workouts) {
    const map = new Map();
    for (const w of workouts) {
        if (!w.templateId || !w.completedAt) continue;
        const dow = new Date(w.date).getDay();
        if (!map.has(w.templateId)) map.set(w.templateId, Array(7).fill(0));
        map.get(w.templateId)[dow]++;
    }
    return map;
}

/**
 * Return templates ordered by how often they're used on a given day of week.
 * Used for the "For Tuesday" dashboard section.
 */
export function getTemplatesForDayOfWeek(templates, workouts, dow) {
    const counts = aggregateSessionsPerDayOfWeek(workouts);
    return templates
        .map(t => ({ template: t, count: counts.get(t.id)?.[dow] || 0 }))
        .sort((a, b) => b.count - a.count);
}
```

### 2. `getLastTrainedDate(bodyPart)` — NEW
**File**: `js/core/features/metrics/aggregators.js`

```javascript
/**
 * Find the most recent workout that trained this body part.
 * @returns { date: string, daysAgo: number } | null
 */
export function getLastTrainedDate(workouts, bodyPart) {
    let latest = null;
    for (const w of workouts) {
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name, ex.category) !== bodyPart) continue;
            if (!latest || w.date > latest) latest = w.date;
            break;
        }
    }
    if (!latest) return null;
    const daysAgo = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000);
    return { date: latest, daysAgo };
}
```

Staleness threshold: **5 days**. If `daysAgo > 5`, the body-part card renders in stale state (55% opacity + warning line).

### 3. `aggregateBodyPartStats(bodyPart, range)` — NEW (bundles existing functions)
**File**: `js/core/features/metrics/aggregators.js`

```javascript
/**
 * Single entry point for rendering a body-part card or detail page.
 * Bundles classifier + volume + PR + session count + heaviest set + staleness.
 */
export function aggregateBodyPartStats(workouts, bodyPart, range = 'W') {
    const bounds = getRangeBounds(range);
    const prevBounds = getPreviousRangeBounds(range);

    const volume = aggregateVolumeByBodyPart(workouts, bounds)[bodyPart] || 0;
    const prevVolume = prevBounds ? aggregateVolumeByBodyPart(workouts, prevBounds)[bodyPart] || 0 : 0;
    const volumeDeltaPct = prevVolume ? ((volume - prevVolume) / prevVolume * 100) : null;

    const heroLift = getHeroLiftForBodyPart(bodyPart); // "Bench Press" for chest, etc.
    const heaviest = aggregateHeaviestSet(workouts, heroLift, bounds);
    // heaviest = { weight, reps, date, deltaLbs } | null

    const sessions = countSessions(workouts, bodyPart, bounds);
    const lastTrained = getLastTrainedDate(workouts, bodyPart);
    const isStale = lastTrained ? lastTrained.daysAgo > 5 : true;

    const volumeTrend = aggregateVolumeTrend(workouts, bodyPart, bounds); // for sparkline

    return { bodyPart, heroLift, heaviest, volume, volumeDeltaPct, sessions, lastTrained, isStale, volumeTrend };
}
```

Hero lift map (hardcoded for v1 — can become user-configurable later):
```javascript
const HERO_LIFT_BY_BODY_PART = {
    chest: 'Bench Press',
    back: 'Weighted Pull-up', // or Barbell Row
    legs: 'Deadlift',
    shoulders: 'Overhead Press',
    arms: 'Barbell Curl',
    core: 'Plank', // time-based, handle as duration not weight
};
```

### 4. `aggregateExerciseStats(exerciseName, range)` — NEW
**File**: `js/core/features/metrics/aggregators.js`

For the Level 3 exercise detail page. Returns max weight, heaviest set, 1RM series, volume, recent sessions, best sets table.

```javascript
export function aggregateExerciseStats(workouts, exerciseName, range = 'All') {
    const bounds = getRangeBounds(range);
    const sessions = [];
    const bestSets = []; // all-time

    for (const w of workouts) {
        const d = new Date(w.date);
        if (d < bounds.start || d > bounds.end) continue;
        const matching = Object.values(w.exercises || {}).filter(e => e.name === exerciseName);
        if (matching.length === 0) continue;

        const sessionSets = matching.flatMap(e => e.sets || []).filter(s => s.completed);
        if (sessionSets.length === 0) continue;

        sessions.push({ date: w.date, sets: sessionSets });
        bestSets.push(...sessionSets);
    }

    const allSets = bestSets;
    const maxWeight = Math.max(...allSets.map(s => getSetTotalWeight(s, AppState.equipment[s.equipmentId])));
    const heaviestSet = allSets.reduce((best, s) => {
        const tw = getSetTotalWeight(s, AppState.equipment[s.equipmentId]);
        return (!best || tw > best.totalWeight || (tw === best.totalWeight && s.reps > best.reps)) ? { ...s, totalWeight: tw } : best;
    }, null);
    const est1RM = Math.max(...allSets.map(s => estimate1RM(getSetTotalWeight(s, AppState.equipment[s.equipmentId]), s.reps)));
    const totalVolume = allSets.reduce((sum, s) => sum + getSetVolume(s, AppState.equipment[s.equipmentId]), 0);

    // Heaviest weight per session — for the trend chart
    const trend = sessions.map(({ date, sets }) => ({
        date,
        y: Math.max(...sets.map(s => getSetTotalWeight(s, AppState.equipment[s.equipmentId]))),
    }));

    // Top 4 best sets ever by 1RM
    const topSets = [...allSets]
        .map(s => ({ ...s, totalWeight: getSetTotalWeight(s, AppState.equipment[s.equipmentId]), est1RM: estimate1RM(getSetTotalWeight(s, AppState.equipment[s.equipmentId]), s.reps) }))
        .sort((a, b) => b.est1RM - a.est1RM)
        .slice(0, 4);

    return { maxWeight, heaviestSet, est1RM, totalVolume, sessions, topSets, trend };
}
```

### 5. Combo chart — bars + line overlay — NEW
**File**: `js/core/features/charts/chart-combo-bars-line.js`

```javascript
export function chartComboBarsLine({ bars, line, width, height, barColor, lineColor, padding = 8 }) {
    if (bars.length === 0) return '<svg></svg>';
    const yMax = Math.max(...bars.map(b => b.y), ...line.map(p => p.y)) || 1;
    const xStep = (width - padding * 2) / Math.max(1, bars.length);
    const yToPx = y => height - padding - (y / yMax) * (height - padding * 2);

    const barEls = bars.map((b, i) => {
        const x = padding + i * xStep;
        const barW = xStep * 0.7;
        const barH = (height - padding) - yToPx(b.y);
        const opacity = 0.3 + (i / bars.length) * 0.55; // fade to full
        return `<rect x="${x.toFixed(1)}" y="${yToPx(b.y).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${barColor}" opacity="${opacity.toFixed(2)}" rx="2"/>`;
    }).join('');

    const linePath = line.map((p, i) => {
        const x = padding + i * xStep + xStep * 0.35;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yToPx(p.y).toFixed(1)}`;
    }).join(' ');

    const dots = line.map((p, i) => {
        const x = padding + i * xStep + xStep * 0.35;
        const isLast = i === line.length - 1;
        const isPR = p.pr;
        const r = isLast ? 4 : isPR ? 3 : 2.5;
        const stroke = isLast ? `stroke="var(--bg-card)" stroke-width="2"` : '';
        const fill = isPR ? 'var(--badge-gold)' : lineColor;
        return `<circle cx="${x.toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="${r}" fill="${fill}" ${stroke}/>`;
    }).join('');

    return `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${[1,2,3].map(i => `<line x1="0" y1="${(height/4)*i}" x2="${width}" y2="${(height/4)*i}" stroke="var(--border-light)" stroke-dasharray="2,4"/>`).join('')}
            ${barEls}
            <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
        </svg>
    `;
}
```

### 6. Set-chip renderer — NEW
**File**: `js/core/ui/render-helpers.js`

```javascript
/**
 * Render a session's sets as inline chips. PR sets get gold tint.
 */
export function renderSetChips(sets) {
    return sets.map(s => {
        const w = getSetTotalWeight(s, AppState.equipment[s.equipmentId]);
        const isPR = s.isPR === true;
        const cls = isPR ? 'set-chip set-chip--pr' : 'set-chip';
        return `<span class="${cls}">${w}×${s.reps}${isPR ? ' PR' : ''}</span>`;
    }).join(' ');
}
```

### 7. Navigation — extend section IDs
**File**: `js/core/ui/navigation.js`

Add to `SECTION_IDS`:
```javascript
'muscle-group-detail-section',
'exercise-detail-section',
```

Add route handlers:
```javascript
export function showMuscleGroupDetail(bodyPart) {
    AppState.activeMuscleGroup = bodyPart;
    navigateTo('muscle-group-detail');
    renderMuscleGroupDetail(bodyPart);
}
export function showExerciseDetail(exerciseName) {
    AppState.activeExercise = exerciseName;
    navigateTo('exercise-detail');
    renderExerciseDetail(exerciseName);
}
window.showMuscleGroupDetail = showMuscleGroupDetail;
window.showExerciseDetail = showExerciseDetail;
```

Back button at each level uses existing `navigateBack()`.

### 8. Tokens
Already covered above in the Prerequisite verification section. The two missing tokens (`--cat-shoulders` + `--cat-shoulders-bg`, and confirming `--cat-arms-bg`) should be added first before any other V2 work.

---

## Dashboard structure (top → bottom)

```
┌───────────────────────────────┐
│ Greeting + avatar             │
├───────────────────────────────┤
│ Active workout pill (if any)  │
├───────────────────────────────┤
│ Streak │ Week │ Body weight   │  ← 3-chip hero row
├───────────────────────────────┤
│ 💡 Insight (ONE, actionable)  │
├───────────────────────────────┤
│ For Tuesday ┌─────┐           │
│   Leg Day [▶]  Most used      │  ← today's workouts
│   Back & Bi [▶]               │     ordered by most-used
│   Core [▶]                    │     on this day of week
├───────────────────────────────┤
│ Training                      │
│ ┌───────────────────────────┐ │
│ │ 💪 Chest          [→]     │ │
│ │ Bench Max 225×5  Vol 10.2k│ │  ← 6 muscle group cards
│ │ ━━━━━━━━━━━━━━━━━━━       │ │     (Variant C split layout)
│ └───────────────────────────┘ │
│ ... Back, Legs, Shoulders     │
│ Arms, Core (stale if >5 days) │
├───────────────────────────────┤
│ Composition                   │
│ ⊕ Muscle 38% Fat 18% Water 44%│  ← body comp donut + weight
│ Body weight 184.2 · ↓1.2 lb   │
├───────────────────────────────┤
│ Recent PRs                    │
│ 🏆 Bench Press   225 lb       │
│ 🏆 Pull-up       BW+45        │
└───────────────────────────────┘
```

### Render order in `renderDashboard()`

```javascript
export async function renderDashboard() {
    const c = document.getElementById('dashboard-content');
    c.innerHTML = '';

    c.insertAdjacentHTML('beforeend', renderGreeting());
    c.insertAdjacentHTML('beforeend', renderActiveWorkoutPill());  // returns '' if no active
    c.insertAdjacentHTML('beforeend', renderHeroChipRow());         // streak + week + body weight
    c.insertAdjacentHTML('beforeend', renderDashboardInsight());    // ONE insight, or ''
    c.insertAdjacentHTML('beforeend', renderForToday());            // "For Tuesday"
    c.insertAdjacentHTML('beforeend', renderTrainingSection());     // 6 muscle group cards
    c.insertAdjacentHTML('beforeend', renderCompositionCard());     // donut + weight
    c.insertAdjacentHTML('beforeend', renderRecentPRs(3));
}
```

---

## Section specs

### Hero chip row

```javascript
function renderHeroChipRow() {
    const streak = getCurrentStreak(AppState.workouts);
    const { done, goal } = getWeeklyProgress();
    const bw = getLatestBodyWeight();
    const bwDelta = bw ? getBodyWeightDelta(30) : null; // lb change over 30d
    return `
        <div class="hero-chip-row">
            <div class="hero-chip hero-chip--streak">
                <i class="fas fa-fire"></i>
                <div class="hero-chip__val">${streak}</div>
                <div class="hero-chip__label">Streak</div>
            </div>
            <div class="hero-chip">
                <i class="fas fa-bullseye" style="color:var(--primary);"></i>
                <div class="hero-chip__val">${done}<span class="hero-chip__unit">/${goal}</span></div>
                <div class="hero-chip__label">This week</div>
            </div>
            <div class="hero-chip">
                <i class="fas fa-weight" style="color:var(--cat-shoulders);"></i>
                <div class="hero-chip__val">${bw ? Math.round(bw.weight) : '—'}<span class="hero-chip__unit">${bw ? 'lb' : ''}</span></div>
                ${bwDelta != null ? `<div class="hero-chip__delta ${bwDelta < 0 ? 'up' : 'down'}">${bwDelta < 0 ? '↓' : '↑'} ${Math.abs(bwDelta).toFixed(1)} lb</div>` : '<div class="hero-chip__label">No data</div>'}
            </div>
        </div>
    `;
}
```

### "For today" section

```javascript
function renderForToday() {
    const dow = new Date().getDay();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
    const templates = getTemplatesForDayOfWeek(AppState.templates, AppState.workouts, dow).slice(0, 4);
    if (templates.length === 0) return '';
    return `
        <div class="dash-section-head">
            <h3>For ${dayName}</h3>
            <a onclick="bottomNavTo('workout')">All →</a>
        </div>
        ${templates.map((t, i) => renderForTodayRow(t, i === 0)).join('')}
    `;
}

function renderForTodayRow({ template, count }, isMostUsed) {
    const category = template.category || 'other';
    return `
        <div class="rw-row" onclick="startWorkout('${template.id}')">
            <div class="rw-icon cat-bg-${category}"><i class="fas ${getCategoryIcon(category)}"></i></div>
            <div class="rw-info">
                <div class="rw-name">
                    ${escapeHtml(template.name)}
                    ${isMostUsed && count > 3 ? `<span class="rw-count">Most used</span>` : ''}
                </div>
                <div class="rw-meta">${template.exercises.length} exercises · ${count} ${count === 1 ? 'time' : 'times'} on ${dayName(new Date().getDay())}s</div>
            </div>
            <button class="rw-play" onclick="event.stopPropagation(); startWorkout('${template.id}')">
                <i class="fas fa-play"></i>
            </button>
        </div>
    `;
}
```

### Training section — 6 muscle group cards

```javascript
const BODY_PARTS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
const BP_ICONS = { chest: 'fa-hand-paper', back: 'fa-fist-raised', legs: 'fa-walking', shoulders: 'fa-arrows-alt-v', arms: 'fa-hand-rock', core: 'fa-bullseye' };
const BP_TINTS = { chest: 'ic-chest', back: 'ic-back', legs: 'ic-legs', shoulders: 'ic-shoulders', arms: 'ic-arms', core: 'ic-core' };

function renderTrainingSection() {
    const stats = BODY_PARTS.map(bp => aggregateBodyPartStats(AppState.workouts, bp, 'W'));
    // Order by last-trained desc, stale ones at the bottom
    stats.sort((a, b) => {
        if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
        return (a.lastTrained?.daysAgo || 999) - (b.lastTrained?.daysAgo || 999);
    });
    return `
        <div class="dash-section-head">
            <h3>Training</h3>
            <a onclick="showMetricRangePicker()">This week</a>
        </div>
        ${stats.map(renderBodyPartCard).join('')}
    `;
}

function renderBodyPartCard(s) {
    const hv = s.heaviest; // { weight, reps, deltaLbs } or null
    return `
        <div class="bp-card ${s.isStale ? 'stale' : ''}" onclick="showMuscleGroupDetail('${s.bodyPart}')">
            <div class="bp-card__head">
                <div class="bp-card__label">
                    <div class="bp-card__icon ${BP_TINTS[s.bodyPart]}"><i class="fas ${BP_ICONS[s.bodyPart]}"></i></div>
                    ${capitalize(s.bodyPart)}
                </div>
                <i class="fas fa-chevron-right bp-card__chev"></i>
            </div>
            <div class="bp-card__grid">
                <div class="bp-cell">
                    <div class="bp-cell__label"><i class="fas fa-trophy" style="color:var(--badge-gold);"></i> ${s.heroLift.split(' ')[0]} Max</div>
                    <div class="bp-cell__val">${hv ? `${hv.weight}<span class="bp-cell__unit">×${hv.reps}</span>` : '—'}</div>
                    ${hv?.deltaLbs > 0 ? `<div class="bp-cell__sub">↑ ${hv.deltaLbs} lb · ${relativeDay(hv.date)}</div>` : ''}
                </div>
                <div class="bp-cell">
                    <div class="bp-cell__label">Volume · wk</div>
                    <div class="bp-cell__val">${formatVolumeK(s.volume)}<span class="bp-cell__unit">lb</span></div>
                    ${s.volumeDeltaPct != null ? `<div class="bp-cell__sub ${s.volumeDeltaPct < 0 ? 'down' : ''}">${s.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(s.volumeDeltaPct).toFixed(0)}%</div>` : ''}
                </div>
            </div>
            ${s.isStale ? `<div class="stale-warn">⚠ Last trained ${s.lastTrained?.daysAgo || '—'} days ago</div>` : renderSparkline(s.volumeTrend, `var(--cat-${s.bodyPart === 'chest' ? 'push' : s.bodyPart === 'back' ? 'pull' : s.bodyPart})`)}
        </div>
    `;
}
```

### Composition card

```javascript
function renderCompositionCard() {
    const latest = getLatestBodyComposition();
    const bw = getLatestBodyWeight();
    const monthDelta = bw ? getBodyWeightDelta(30) : null;
    if (!latest && !bw) return renderConnectPrompt();

    const segments = latest ? [
        { label: `Muscle ${latest.musclePct}%`, value: latest.musclePct, color: 'var(--cat-legs)' },
        { label: `Fat ${latest.fatPct}%`, value: latest.fatPct, color: 'var(--cat-pull)' },
        { label: `Water ${latest.waterPct}%`, value: latest.waterPct, color: 'var(--cat-shoulders)' },
    ] : [];

    return `
        <div class="dash-section-head">
            <h3>Composition</h3>
            <a onclick="showCompositionDetail()">Details →</a>
        </div>
        <div class="bc-card" onclick="showCompositionDetail()">
            <div class="bc-row">
                ${latest ? chartDonut({ segments, size: 60 }) : '<div class="bc-donut-empty"></div>'}
                <div class="bc-legend">
                    ${segments.length ? segments.map(s => `<div class="bc-leg"><div class="bc-dot" style="background:${s.color};"></div>${s.label}</div>`).join('') : '<div class="bc-leg">No DEXA data yet</div>'}
                </div>
                <i class="fas fa-chevron-right bp-card__chev"></i>
            </div>
            ${bw ? `
                <div class="bc-weight">
                    <span>Body weight</span>
                    <span><strong>${bw.weight.toFixed(1)} lb</strong>${monthDelta != null ? ` · ${monthDelta < 0 ? '↓' : '↑'} ${Math.abs(monthDelta).toFixed(1)} lb this month` : ''}</span>
                </div>
            ` : ''}
        </div>
    `;
}
```

---

## Level 2 — Muscle group detail page

**File**: NEW `js/core/ui/muscle-group-detail-ui.js`

Template:

```javascript
export function renderMuscleGroupDetail(bodyPart) {
    const range = AppState.muscleDetailRange || 'M';
    const stats = aggregateBodyPartStats(AppState.workouts, bodyPart, range);
    const exercises = getExercisesForBodyPart(AppState.workouts, bodyPart, range);
    const prs = getPRsForBodyPart(bodyPart);

    document.getElementById('muscle-group-detail-content').innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ${BP_TINTS[bodyPart]}"><i class="fas ${BP_ICONS[bodyPart]}"></i></div>
                <div>
                    <div class="d-title">${capitalize(bodyPart)}</div>
                    <div class="d-subtitle">${stats.sessions} sessions · past ${rangeLabel(range)}</div>
                </div>
            </div>
            <button class="d-menu"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="d-content">
            ${renderRangePills(range, 'setMuscleRange')}
            <div class="d-hero-stats">
                <div class="d-stat">
                    <div class="d-stat__label"><i class="fas fa-trophy" style="color:var(--badge-gold);"></i> Heaviest · ${stats.heroLift.split(' ')[0]}</div>
                    <div class="d-stat__val">${stats.heaviest.weight}<span class="d-stat__unit">× ${stats.heaviest.reps}</span></div>
                    ${stats.heaviest.deltaLbs > 0 ? `<div class="d-stat__delta up">↑ ${stats.heaviest.deltaLbs} lb · ${rangeLabel(range)}</div>` : ''}
                </div>
                <div class="d-stat">
                    <div class="d-stat__label">Total volume</div>
                    <div class="d-stat__val">${formatVolumeK(stats.volume)}<span class="d-stat__unit">lb</span></div>
                    ${stats.volumeDeltaPct != null ? `<div class="d-stat__delta ${stats.volumeDeltaPct >= 0 ? 'up' : 'down'}">${stats.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(stats.volumeDeltaPct).toFixed(0)}% vs prev</div>` : ''}
                </div>
            </div>
            <div class="d-chart-card">
                <div class="d-chart-head">
                    <div class="d-chart-title">Volume &amp; top set weight</div>
                    <div class="d-chart-legend">${stats.volumeDeltaPct != null ? `↑ ${stats.volumeDeltaPct.toFixed(0)}% vs prev` : ''}</div>
                </div>
                ${chartComboBarsLine({ bars: stats.volumeTrend, line: stats.topSetTrend, width: 300, height: 140, barColor: bodyPartColor(bodyPart), lineColor: 'var(--badge-gold)' })}
            </div>
            ${stats.insight ? renderInsightCard(stats.insight) : ''}
            <div class="d-sec-head">Exercises · ${rangeLabel(range)}</div>
            ${exercises.map(ex => renderExerciseRow(ex)).join('')}
            <div class="d-sec-head">${capitalize(bodyPart)} PRs</div>
            ${prs.map(renderPRRow).join('')}
        </div>
    `;
}

function renderExerciseRow(ex) {
    return `
        <div class="d-exercise-row" onclick="showExerciseDetail('${escapeAttr(ex.name)}')">
            ${chartSparkline({ points: ex.trend, color: bodyPartColor(ex.bodyPart), width: 54, height: 24 })}
            <div class="d-ex-info">
                <div class="d-ex-name">${escapeHtml(ex.name)}</div>
                <div class="d-ex-meta">${ex.sessions} sessions · ${ex.sets} sets · best ${ex.heaviest.weight}×${ex.heaviest.reps}</div>
            </div>
            <div class="d-ex-right">
                <div class="d-ex-val">${formatVolumeK(ex.volume)} lb</div>
                ${ex.volumeDeltaPct != null ? `<div class="d-ex-delta ${ex.volumeDeltaPct >= 0 ? '' : 'down'}">${ex.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(ex.volumeDeltaPct).toFixed(0)}%</div>` : ''}
            </div>
        </div>
    `;
}
```

---

## Level 3 — Exercise detail page

**File**: NEW `js/core/ui/exercise-detail-ui.js`

```javascript
export function renderExerciseDetail(exerciseName) {
    const range = AppState.exerciseDetailRange || '6M';
    const s = aggregateExerciseStats(AppState.workouts, exerciseName, range);
    const exerciseMeta = AppState.exerciseDatabase[exerciseName];
    const bodyPart = classifyBodyPart(exerciseName);

    document.getElementById('exercise-detail-content').innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ${BP_TINTS[bodyPart]}"><i class="fas ${BP_ICONS[bodyPart]}"></i></div>
                <div>
                    <div class="d-title">${escapeHtml(exerciseName)}</div>
                    <div class="d-subtitle">${capitalize(bodyPart)} · ${s.sessions.length} sessions all-time</div>
                </div>
            </div>
            <button class="d-menu"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="d-content">
            ${renderRangePills(range, 'setExerciseRange')}

            <!-- Hero stats: Max weight + Heaviest set -->
            <div class="d-hero-stats">
                <div class="d-stat">
                    <div class="d-stat__label"><i class="fas fa-trophy" style="color:var(--badge-gold);"></i> Max weight</div>
                    <div class="d-stat__val">${s.maxWeight}<span class="d-stat__unit">lb</span></div>
                </div>
                <div class="d-stat">
                    <div class="d-stat__label">Heaviest set</div>
                    <div class="d-stat__val">${s.heaviestSet.totalWeight}<span class="d-stat__unit">× ${s.heaviestSet.reps}</span></div>
                    <div class="d-stat__delta up">${relativeDay(s.heaviestSet.date)}</div>
                </div>
            </div>

            <!-- Secondary stats as small pills -->
            <div class="d-pill-row">
                <div class="d-pill">Est. 1RM <strong>${Math.round(s.est1RM)} lb</strong></div>
                <div class="d-pill">Volume (${rangeLabel(range)}) <strong>${formatVolumeK(s.totalVolume)} lb</strong></div>
            </div>

            <!-- Heaviest weight per session -->
            <div class="d-chart-card">
                <div class="d-chart-head">
                    <div class="d-chart-title">Heaviest weight per session</div>
                    <div class="d-chart-legend">↑ ${s.trend[s.trend.length-1]?.y - s.trend[0]?.y} lb vs ${rangeLabel(range)} ago</div>
                </div>
                ${chartLine({ points: s.trend, width: 300, height: 140, color: bodyPartColor(bodyPart), fill: true })}
            </div>

            <!-- Equipment + form video -->
            <div class="d-equip-row">
                ${renderEquipmentCard(exerciseMeta?.equipment)}
                ${renderFormVideoThumb(exerciseMeta?.videoUrl, exerciseMeta?.equipmentVideos)}
            </div>

            ${renderExerciseInsight(s)}

            <div class="d-sec-head">Best sets ever</div>
            ${renderBestSetsTable(s.topSets)}

            <div class="d-sec-head">Recent sessions</div>
            ${s.sessions.slice(0, 3).map(renderSessionRow).join('')}
            ${s.sessions.length > 3 ? `<button class="d-see-all">See all ${s.sessions.length} sessions →</button>` : ''}

            ${exerciseMeta?.notes ? `
                <div class="d-sec-head">Notes</div>
                <div class="d-notes">${escapeHtml(exerciseMeta.notes)}</div>
            ` : ''}
        </div>
    `;
}

function renderSessionRow(session) {
    const hasPR = session.sets.some(s => s.isPR);
    return `
        <div class="d-session-row">
            <div class="d-session-row__head">
                <div class="d-session-row__date">${formatSessionDate(session.date)}</div>
                ${hasPR ? '<div class="d-session-row__pr"><i class="fas fa-trophy"></i> PR</div>' : ''}
            </div>
            <div class="d-session-row__chips">${renderSetChips(session.sets)}</div>
        </div>
    `;
}
```

---

## CSS additions

**File**: NEW `styles/pages/dashboard-v2.css` — covers hero chips, body-part cards, training section, composition card, for-today rows.

**File**: NEW `styles/pages/muscle-group-detail.css` + `styles/pages/exercise-detail.css` — shared patterns from `d-*` classes shown in mockup.

**File**: NEW `styles/components/set-chips.css`:

```css
.set-chip {
    background: var(--bg-card-hi);
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    font-size: var(--font-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}
.set-chip--pr {
    background: rgba(255, 215, 0, 0.14);
    color: var(--badge-gold);
    font-weight: 700;
}
```

Copy the CSS from the mockup `mockups/dashboard-final-v2.html` — it's all token-based and production-ready.

---

## Validation checklist

### Prereq work
- [ ] `aggregateSessionsPerDayOfWeek()` returns correct counts across 7 days
- [ ] `getLastTrainedDate()` returns `daysAgo` correctly for each body part
- [ ] `aggregateBodyPartStats()` returns hero-lift heaviest set, volume with delta, session count, staleness flag
- [ ] `aggregateExerciseStats()` returns max weight, heaviest set with reps, 1RM estimate, total volume, trend series, top 4 best sets
- [ ] `chartComboBarsLine()` renders correctly on both muscle-group detail pages (Chest + Legs)
- [ ] Gold PR dots appear on the line overlay where `p.pr === true`
- [ ] `--cat-shoulders` and `--cat-arms` tokens added, used everywhere instead of hardcoded hex

### Dashboard
- [ ] Section order matches: Greeting → Active pill → Hero chips → Insight → For today → Training → Composition → Recent PRs
- [ ] Hero chip row shows Streak, Weekly progress, Body weight delta
- [ ] "For [day]" shows today's day-of-week, templates ordered by frequency
- [ ] "Most used" chip appears only on top row and only when count ≥ 3
- [ ] Training section has 6 cards in order chest/back/legs/shoulders/arms/core (or by recency — confirm with design)
- [ ] Stale cards (>5 days) render at 55% opacity with warning line
- [ ] Sparkline hides when stale, warning shows instead
- [ ] Composition card shows donut from latest DEXA or empty state prompt
- [ ] Recent PRs shows top 3

### Drill-down navigation
- [ ] Tap body-part card → muscle group detail page
- [ ] Muscle group page shows heaviest heroLift set, not 1RM, as primary stat
- [ ] Exercise rows on muscle-group page are tappable
- [ ] Tap exercise row → exercise detail page
- [ ] Back button at every level returns to previous
- [ ] Back button from dashboard does nothing or closes app (matches iOS behavior)

### Stats tab deletion
- [ ] Stats tab button removed from bottom nav
- [ ] `"stats"` case removed from `bottomNavTo()` routing
- [ ] `stats-ui.js` deleted
- [ ] `styles/pages/stats.css` deleted
- [ ] `exercise-progress.js` deleted (unless used elsewhere — grep first)
- [ ] Any Stats-only aggregators that duplicate dashboard ones deleted
- [ ] Any import of `stats-ui.js` removed from `main.js`

### Consolidation audit
- [ ] `renderHeroWorkoutCard()` deleted, all callers updated
- [ ] `.hero-workout-card` and `.btn-hero-start` CSS deleted
- [ ] Any standalone body-weight dashboard widget deleted (rolled into Composition)
- [ ] `HEALTH-DASHBOARD-IMPLEMENTATION.md` deleted after implementation
- [ ] Old dashboard sections from Phase 1 that don't fit the new structure removed (week timeline? volume by body part card? — remove the duplicates)

---

## Implementation order

Follow this strictly — each step builds on the previous and includes deletions before additions so we never have two conflicting implementations live at once.

1. **Delete dead code first**: `stats-ui.js`, `styles/pages/stats.css`, `renderHeroWorkoutCard`, `.hero-workout-card` / `.btn-hero-start` CSS. Remove `"stats"` from nav routing. Update `main.js` imports.
2. Add the 2 missing tokens: `--cat-shoulders`, `--cat-arms` (+ -bg variants)
3. Add the 4 missing aggregator functions (2 primitive, 2 bundles)
4. Add the combo chart primitive + set-chips renderer
5. Add the 2 new section IDs + route handlers to navigation.js
6. Build dashboard v2 render functions + CSS; wire `renderDashboard()` to new composition
7. Build muscle-group detail page
8. Build exercise detail page
9. Run validation checklist
10. Delete `HEALTH-DASHBOARD-IMPLEMENTATION.md` — it's replaced by this
11. Update references in `DASHBOARD-IMPLEMENTATION.md` to point here for the dashboard body

---

## Final note

This is the only spec Claude Code should read for V2. Everything it needs — what's already shipped, what's missing, what to build, what to delete — is in this file. Ignore `HEALTH-DASHBOARD-IMPLEMENTATION.md` and delete it after V2 ships. `DASHBOARD-IMPLEMENTATION.md`, `EQUIPMENT-WEIGHT-IMPLEMENTATION.md`, and `PAGES-REDESIGN-IMPLEMENTATION.md` are historical records of work already done and don't need to be opened.
