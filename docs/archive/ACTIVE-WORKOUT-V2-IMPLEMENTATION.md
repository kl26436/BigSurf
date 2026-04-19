# Active Workout v2 — Implementation Spec

Ship this first — the current active-workout UI is the most critical thing to fix.

**Mockup**: `mockups/active-workout-v2.html`

This is the only MD Claude Code needs for this work. It relies on foundations already shipped from prior MDs (summarized below — do not re-read them).

---

## Prereqs (already shipped)

All verified in the current codebase:

- `setWorkoutActiveState()` + `body.workout-active` + animated dumbbell FAB — `navigation.js:415`, `app-shell.css:93-118`
- `getSetTotalWeight()` / `getSetVolume()` handling plate + bodyweight — `weight-calculations.js:36,62`
- `getLatestBodyWeight()` + `ensureFreshBodyWeight()` BW prompt — `app-state.js:20`, `bodyweight-prompt.js:19`
- Equipment `baseWeight` schema + migration — `schema-migration.js:177-208`
- Auto-fill from last session (cells pre-populated with last workout's values) — already working, do NOT remove

If any of the above is missing, stop and verify before continuing.

---

## Design principles

1. **Focus on one exercise at a time** (wizard) but **never trap the user** — always one tap to jump anywhere.
2. **Minimal chrome** — 48px top header, nothing else fixed above the content.
3. **Last session visible always** — inline per exercise, so you never have to guess weights.
4. **Rest timer is teal**, not yellow. Prominent gradient banner, slides in at the top after a set ✓.
5. **Equipment is a one-line affordance**, not a card. Icon + name + "Change" text button. That's it.
6. **Auto-fill is the happy path** — every set pre-populated with last session's values (dashed muted style). Tap ✓ without editing to confirm.

---

## Page structure (top → bottom)

```
┌──────────────────────────────────────┐
│ ← | Chest & Triceps · 2:34 | ⋮      │   48px header
├──────────────────────────────────────┤
│ [1.Bench ✓][2.Incl DB ·][3.Fly]…   │   progress pills, scrollable, tappable
├──────────────────────────────────────┤
│ 🕐 Rest · 1:12         [+30s][Skip] │   teal gradient banner (when active)
│ ████████░░░░░░░░                    │   progress bar (2px at bottom of banner)
├──────────────────────────────────────┤
│ 💪 Bench Press               ⋯      │   exercise hero (title + more menu)
│    Set 1 done · 3 left              │
│ ⚙ Rogue Power Bar · 45 lb   Change │   inline equipment line
│ 🕐 Last: 135×10 · 185×8 · 205×6…   │   last session card
│                                      │
│ ✨ Pre-filled · tap to edit          │
│  1  [135][10]  ✓                    │   set rows (autofill = dashed muted)
│  2  [185][ 8]  ○   ← current        │
│  3  [205][ 6]  ○                    │
│  4  [225][ 5]  ○                    │
│  + Add set                          │
│                                      │
├──────────────────────────────────────┤
│ [☰ All] [ Next exercise → ]          │   footer
└──────────────────────────────────────┘
```

---

## Files affected

```
js/core/workout/active-workout-ui.js          (NEW — main wizard controller)
js/core/workout/active-workout-pills.js       (NEW — progress pills component)
js/core/workout/rest-timer.js                 (KEEP but rebuild styling)
js/core/workout/jump-sheet.js                 (NEW — "All" drawer)
js/core/workout/superset-link-sheet.js        (NEW — superset selection flow)
js/core/workout/equipment-change-sheet.js     (NEW — compact equipment picker)
js/core/workout/superset-manager.js           (EXTEND — already exists)
js/core/workout/workout-session.js            (EXTEND — finish summary)

styles/pages/active-workout-v2.css            (NEW)
styles/components/rest-timer-v2.css           (NEW — replaces whatever currently styles the timer)

js/main.js                                    (wire window exports)
index.html                                    (update active-workout section markup)
```

---

## 1. Top header + progress pills

Minimal, 48px:

```javascript
function renderWorkoutHeader(session) {
    return `
        <div class="aw-header">
            <button class="aw-back" onclick="confirmExitWorkout()">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="aw-title">
                <div class="aw-title__name">${escapeHtml(session.workoutType)}</div>
                <div class="aw-title__meta">Exercise ${session.currentIdx + 1} of ${session.exerciseCount} · ${formatElapsed(session.elapsedSeconds)}</div>
            </div>
            <button class="aw-menu" onclick="openWorkoutMenu()">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
    `;
}
```

Progress pills — scrollable horizontal list:

```javascript
function renderProgressPills(session) {
    return `
        <div class="aw-pills">
            ${session.exercises.map((ex, i) => {
                const classes = ['aw-pill'];
                if (ex.completed) classes.push('done');
                if (i === session.currentIdx) classes.push('current');
                if (ex.supersetId) classes.push('superset');
                const supersetBadge = ex.supersetId ? `${ex.supersetId}.` : `${i + 1}.`;
                return `<button class="${classes.join(' ')}" onclick="jumpToExercise(${i})">
                    ${supersetBadge} ${shortName(ex.name)} ${ex.completed ? '✓' : ''}
                </button>`;
            }).join('')}
        </div>
    `;
}
```

```css
.aw-header {
    background: var(--bg-app);
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
}
.aw-back, .aw-menu {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: none;
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
    cursor: pointer;
}
.aw-back { background: var(--bg-card); color: var(--text-main); }
.aw-menu { background: transparent; color: var(--text-muted); }
.aw-title { flex: 1; text-align: center; min-width: 0; }
.aw-title__name {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--text-strong);
}
.aw-title__meta {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.aw-pills {
    display: flex;
    gap: 4px;
    padding: 4px 14px 10px;
    border-bottom: 1px solid var(--border-subtle);
    overflow-x: auto;
    scrollbar-width: none;
}
.aw-pills::-webkit-scrollbar { display: none; }
.aw-pill {
    flex-shrink: 0;
    background: transparent;
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius-pill);
    padding: 4px 10px;
    font-size: var(--font-2xs);
    color: var(--text-muted);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--anim-fast);
}
.aw-pill:active { transform: scale(0.95); }
.aw-pill.done {
    background: rgba(54, 196, 107, 0.1);
    border-color: rgba(54, 196, 107, 0.3);
    color: var(--success);
}
.aw-pill.current {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg-app);
    font-weight: 800;
}
.aw-pill.superset {
    border-color: var(--highlight-warm);
    color: var(--highlight-warm);
}
```

---

## 2. Rest timer — teal/primary gradient

**File**: `styles/components/rest-timer-v2.css`

```css
.aw-rest-timer {
    background: linear-gradient(135deg, var(--primary-dark), var(--primary));
    color: var(--bg-app);
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    transition: transform var(--anim-normal), opacity var(--anim-normal);
}
.aw-rest-timer.hidden {
    transform: translateY(-100%);
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
}
.aw-rest-timer__icon {
    width: 26px; height: 26px;
    border-radius: 50%;
    background: rgba(4, 32, 26, 0.18);
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
}
.aw-rest-timer__info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.aw-rest-timer__label {
    font-size: var(--font-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    opacity: 0.7;
}
.aw-rest-timer__time {
    font-size: var(--font-lg);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}
.aw-rest-timer__controls {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
}
.aw-rest-timer__btn {
    background: rgba(4, 32, 26, 0.2);
    border: none;
    color: var(--bg-app);
    padding: 5px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--font-2xs);
    font-weight: 700;
    cursor: pointer;
}
.aw-rest-timer__bar {
    position: absolute;
    bottom: 0;
    left: 0; right: 0;
    height: 2px;
    background: rgba(4, 32, 26, 0.25);
}
.aw-rest-timer__bar-fill {
    height: 100%;
    background: var(--bg-app);
    transition: width 1s linear;
}
```

Behavior:
- Appears when `AppState.restTimer.active === true`
- Auto-starts on set completion using `Config.DEFAULT_REST_TIMER_SECONDS` (or user-configured) — or per-exercise override
- `+30s` adds 30 seconds
- `Skip` sets remaining to 0 and hides the banner
- At 00:00 — flash briefly (scale 1.03 → 1.0) + haptic + optional chime (Settings toggle)
- Tap the timer body to reset / edit duration

---

## 3. Exercise hero + compact equipment

Replace the current big equipment card. Use an **inline line** instead:

```javascript
function renderExerciseHero(exercise) {
    const equipment = AppState.equipment[exercise.equipmentId];
    const isBodyweight = equipment?.type === 'bodyweight';
    const equipName = equipment ? `${equipment.name}${equipment.baseWeight ? ` · ${equipment.baseWeight} lb` : ''}` : 'No equipment';
    return `
        <div class="aw-hero">
            <div class="aw-hero__top">
                <div class="aw-hero__icon tint-${getCategory(exercise)}">
                    <i class="fas ${getCategoryIcon(exercise)}"></i>
                </div>
                <div class="aw-hero__name">
                    <div class="aw-hero__title">${escapeHtml(exercise.name)}</div>
                    <div class="aw-hero__sub">${exercise.targetSets} sets · ${exercise.targetReps} reps target</div>
                </div>
                <button class="aw-hero__more" onclick="openExerciseMenu(${exercise.idx})">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>

            ${isBodyweight ? renderBWBanner(exercise) : renderEquipLine(equipment)}

            ${renderLastSessionCard(exercise)}
        </div>
    `;
}

function renderEquipLine(equipment) {
    return `
        <div class="aw-equip-line">
            <i class="fas fa-cog"></i>
            <span class="aw-equip-line__name">${equipment ? escapeHtml(equipment.name) : 'Choose equipment'}${equipment?.baseWeight ? ` · ${equipment.baseWeight} lb` : ''}</span>
            <button class="aw-equip-line__change" onclick="openEquipmentSheet()">Change</button>
        </div>
    `;
}
```

```css
.aw-hero { padding: 14px 16px 8px; }
.aw-hero__top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
}
.aw-hero__icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-md);
    flex-shrink: 0;
}
.aw-hero__name { flex: 1; min-width: 0; }
.aw-hero__title {
    font-size: var(--font-xl);
    font-weight: 800;
    color: var(--text-strong);
    line-height: 1.1;
}
.aw-hero__sub {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 3px;
}
.aw-hero__more {
    width: 34px; height: 34px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 50%;
    color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
    cursor: pointer;
}

/* Compact equipment line — NO card */
.aw-equip-line {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 2px;
    margin-bottom: 10px;
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.aw-equip-line > i {
    font-size: var(--font-2xs);
    opacity: 0.7;
}
.aw-equip-line__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
    font-weight: 500;
}
.aw-equip-line__change {
    color: var(--primary);
    font-size: var(--font-xs);
    font-weight: 600;
    background: transparent;
    border: none;
    padding: 2px 6px;
    cursor: pointer;
}
```

### Equipment picker sheet (tap "Change")

Compact bottom sheet filtered to valid equipment for the current exercise, sorted by recency at current location:

```javascript
export function openEquipmentSheet() {
    const exercise = AppState.currentExercise;
    const location = AppState.currentLocation;
    const options = getEquipmentOptionsForExercise(exercise.name, location);
    renderSheet({
        title: 'Choose equipment',
        subtitle: exercise.name,
        items: options.map(opt => ({
            icon: 'fa-cog',
            name: opt.name,
            meta: `${opt.baseWeight || 0} lb${opt.type === 'machine' ? ' carriage' : ' bar'} · ${relativeUseDate(opt.lastUsed)}`,
            isCurrent: opt.id === exercise.equipmentId,
            onClick: () => setExerciseEquipment(exercise.idx, opt.id),
        })),
        actions: [
            { label: 'Add equipment', icon: 'fa-plus', onClick: openAddEquipment },
            { label: 'Done', primary: true, onClick: closeSheet },
        ],
    });
}
```

---

## 4. Last session card + autofill

Keep the existing autofill behavior (confirmed shipped). Just restyle:

```javascript
function renderLastSessionCard(exercise) {
    const lastSession = getLastSessionForExercise(exercise.name);
    if (!lastSession) return '';
    const daysAgo = getDaysAgo(lastSession.date);
    const setsSummary = lastSession.sets.map(s => {
        const w = getSetTotalWeight(s, AppState.equipment[s.equipmentId]);
        const tag = s.isPR ? ' <span class="aw-last__pr">PR</span>' : '';
        return `${w}×${s.reps}${tag}`;
    }).join(' · ');
    return `
        <div class="aw-last">
            <i class="fas fa-history"></i>
            <div class="aw-last__info">
                <div class="aw-last__label">Last session · ${daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago'}</div>
                <div class="aw-last__val">${setsSummary}</div>
            </div>
        </div>
    `;
}
```

```css
.aw-last {
    background: var(--bg-card-hi);
    border-radius: 10px;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}
.aw-last > i {
    color: var(--text-muted);
    font-size: var(--font-sm);
}
.aw-last__info { flex: 1; min-width: 0; }
.aw-last__label {
    font-size: 0.58rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}
.aw-last__val {
    font-size: var(--font-xs);
    color: var(--text-main);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
}
.aw-last__pr {
    color: var(--highlight-warm);
    font-weight: 700;
    margin-left: 2px;
}

/* Autofill hint above set table */
.aw-autofill-hint {
    padding: 0 16px 6px;
    font-size: 0.64rem;
    color: var(--text-muted);
}
.aw-autofill-hint > i { color: var(--primary); }
```

### Autofill styling for set inputs

Current inputs fill from last session — make the distinction obvious:

```css
.aw-set-row__input {
    /* CRITICAL: width 100% + min-width 0 + box-sizing border-box so inputs
       don't use the browser-default ~150px width that overflows the grid */
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: var(--bg-app);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 10px 6px;
    color: var(--text-strong);
    font-size: var(--font-md);
    font-weight: 800;
    text-align: center;
    outline: none;
    font-variant-numeric: tabular-nums;
    transition: all var(--anim-fast);
}
.aw-set-row__input:focus { border-color: var(--primary); }

/* Autofilled from last session — dashed muted style */
.aw-set-row__input.autofill {
    color: var(--text-muted);
    font-weight: 600;
    border-style: dashed;
}
.aw-set-row__input.autofill:focus {
    color: var(--text-strong);
    font-weight: 800;
    border-style: solid;
}
```

When user types in an autofilled cell → remove `.autofill` class so it goes solid.

---

## 5. Set rows + completion

```javascript
function renderSetRow(set, idx, isCurrent) {
    const classes = ['aw-set-row'];
    if (set.completed) classes.push('done');
    if (isCurrent) classes.push('current');
    const weightVal = set.completed ? set.weight : (set.weight ?? set.autofillWeight);
    const repsVal = set.completed ? set.reps : (set.reps ?? set.autofillReps);
    const isAutofill = !set.completed && !set.userEdited;
    return `
        <div class="${classes.join(' ')}">
            <div class="aw-set-row__num">${idx + 1}</div>
            <input class="aw-set-row__input ${isAutofill ? 'autofill' : ''} ${set.completed ? 'done-val' : ''}"
                   type="number" inputmode="decimal" step="0.5"
                   value="${weightVal ?? ''}"
                   ${set.completed ? 'readonly' : ''}
                   onchange="markSetEdited(${idx}, 'weight', this.value)">
            <input class="aw-set-row__input ${isAutofill ? 'autofill' : ''} ${set.completed ? 'done-val' : ''}"
                   type="number" inputmode="numeric"
                   value="${repsVal ?? ''}"
                   ${set.completed ? 'readonly' : ''}
                   onchange="markSetEdited(${idx}, 'reps', this.value)">
            <button class="aw-set-row__check ${set.completed ? 'done' : ''}"
                    onclick="toggleSetComplete(${idx})">
                <i class="fas ${set.completed ? 'fa-check' : 'far fa-circle'}"></i>
            </button>
        </div>
    `;
}
```

When user taps ✓:
1. Save weight + reps to the set (use autofill values if not edited)
2. Mark completed
3. Advance `currentSetIdx` to the next incomplete set
4. Start rest timer auto (primary-colored banner slides in)
5. If this was the last set of the current exercise, the **Next exercise** footer button becomes highlighted

```css
.aw-set-row {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    /* 28px num + 38px check + 3×8px gaps = ~90px reserved, leaving ~90px each for inputs on 340px viewport */
    display: grid;
    grid-template-columns: 28px 1fr 1fr 38px;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
    transition: all var(--anim-fast);
}
.aw-set-row.done {
    background: rgba(54, 196, 107, 0.08);
    border-color: rgba(54, 196, 107, 0.2);
}
.aw-set-row.current {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-bg);
}
.aw-set-row__num {
    font-size: var(--font-md);
    font-weight: 800;
    color: var(--text-muted);
}
.aw-set-row.done .aw-set-row__num,
.aw-set-row.current .aw-set-row__num { color: var(--text-strong); }
.aw-set-row__input.done-val {
    background: transparent;
    border: none;
    color: var(--success);
    font-weight: 700;
}
.aw-set-row__check {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--bg-card-hi);
    color: var(--text-muted);
    border: none;
    font-size: var(--font-base);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all var(--anim-fast);
}
.aw-set-row__check:active { transform: scale(0.92); }
.aw-set-row__check.done {
    background: var(--success);
    color: #fff;
}
```

---

## 6. Footer — jump list + next / finish

```javascript
function renderFooter(session) {
    const isLast = session.currentIdx === session.exerciseCount - 1 && allSetsDone(session.exercises[session.currentIdx]);
    return `
        <div class="aw-footer">
            <button class="aw-footer__list-btn" onclick="openJumpSheet()">
                <i class="fas fa-list"></i> All
            </button>
            <button class="aw-footer__next ${isLast ? 'finish' : ''}" onclick="${isLast ? 'finishWorkout()' : 'advanceToNextExercise()'}">
                ${isLast ? '<i class="fas fa-flag-checkered"></i> Finish workout' : 'Next exercise <i class="fas fa-arrow-right"></i>'}
            </button>
        </div>
    `;
}
```

```css
.aw-footer {
    padding: 12px 14px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-app);
    display: flex;
    gap: 8px;
    align-items: center;
}
.aw-footer__list-btn {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    color: var(--text-main);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    font-weight: 600;
    font-size: var(--font-sm);
    display: flex; align-items: center; gap: 6px;
    cursor: pointer;
}
.aw-footer__next {
    flex: 1;
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    border-radius: var(--radius-md);
    padding: 12px;
    font-size: var(--font-base);
    font-weight: 800;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    cursor: pointer;
    transition: transform var(--anim-fast);
}
.aw-footer__next:active { transform: scale(0.98); }
.aw-footer__next.finish {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
}
```

---

## 7. Jump sheet — "All" drawer

**File**: `js/core/workout/jump-sheet.js`

```javascript
export function openJumpSheet() {
    const session = AppState.activeWorkout;
    const done = session.exercises.filter(e => e.completed).length;
    const toGo = session.exerciseCount - done;
    renderSheet({
        title: session.workoutType,
        subtitle: `${done} done · ${toGo} to go`,
        body: session.exercises.map((ex, i) => renderJumpSheetRow(ex, i, i === session.currentIdx)).join(''),
        actions: [
            { label: 'Add', icon: 'fa-plus', onClick: openAddExerciseSheet },
            { label: 'Superset', icon: 'fa-link', onClick: openSupersetLinkSheet },
            { label: 'Done', primary: true, onClick: closeSheet },
        ],
    });
}

function renderJumpSheetRow(ex, idx, isCurrent) {
    let status = '';
    if (ex.completed) status = '<div class="js-row__status done">✓</div>';
    else if (isCurrent) status = '<div class="js-row__status current">●</div>';
    else if (idx === AppState.activeWorkout.currentIdx + 1) status = '<div class="js-row__status">Up next</div>';

    const supersetBadge = ex.supersetId ? `<span class="js-row__superset">SS ${ex.supersetId}</span>` : '';

    return `
        <div class="js-row ${isCurrent ? 'current' : ''}" onclick="jumpToExercise(${idx}); closeSheet();">
            <div class="js-row__icon tint-${getCategory(ex)}"><i class="fas ${getCategoryIcon(ex)}"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">${idx + 1}. ${escapeHtml(ex.name)}${supersetBadge}</div>
                <div class="js-row__meta">${ex.completed ? `${ex.sets.length} sets · ${getAvgWeight(ex)}` : `${ex.targetSets} × ${ex.targetReps}`}</div>
            </div>
            ${status}
        </div>
    `;
}
```

---

## 8. Superset linking — THE critical flow

This is the part that was unclear. Specifically documenting:

### User flow (3 taps total)

1. User taps **All** in the footer → jump sheet opens
2. User taps **Superset** in the sheet actions → sheet re-renders in **select mode** (checkboxes appear)
3. User taps the exercises they want to link (2 or more) → each selected row gets a warm-colored checkmark
4. User taps **"Link N exercises"** in the sheet footer → exercises are saved as a superset group
5. Sheet closes. Exercise pills at the top of the main screen now show paired exercises with warm border.

### Data model — already partially exists in `superset-manager.js`

Each exercise in the active workout has:
```javascript
{
    name: 'Incline DB Press',
    supersetId: 'A',  // or 'B', 'C' — null if not in a superset
    // ... existing fields
}
```

Exercises sharing the same `supersetId` are a group. When any exercise in the group is current, the UI enters **superset mode** (Section 9 below).

### Select-mode sheet render

```javascript
let selectingForSuperset = false;
let selectedForSuperset = new Set();

export function openSupersetLinkSheet() {
    selectingForSuperset = true;
    selectedForSuperset.clear();
    renderSupersetSheet();
}

function renderSupersetSheet() {
    const session = AppState.activeWorkout;
    const count = selectedForSuperset.size;
    renderSheet({
        title: '<i class="fas fa-link"></i> Link as superset',
        titleColor: 'var(--highlight-warm)',
        cancelAction: () => { selectingForSuperset = false; closeSheet(); },
        subtitle: 'Tap exercises to include them. They\'ll alternate sets with shared rest.',
        body: session.exercises.map((ex, i) => renderSupersetSelectRow(ex, i)).join(''),
        actions: [
            { label: 'Cancel', onClick: () => { selectingForSuperset = false; closeSheet(); } },
            {
                label: count >= 2 ? `<i class="fas fa-link"></i> Link ${count} exercises` : `Select ≥ 2`,
                primary: true,
                disabled: count < 2,
                warm: true,
                onClick: confirmSupersetLink,
            },
        ],
    });
}

function renderSupersetSelectRow(ex, idx) {
    // Done exercises can't be added to a superset
    if (ex.completed) {
        return `<div class="js-row" style="opacity:0.5;">
            <div class="js-row__icon"><i class="fas fa-check" style="color:var(--success);"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">${idx + 1}. ${escapeHtml(ex.name)}</div>
                <div class="js-row__meta">Done · can't link</div>
            </div>
        </div>`;
    }

    const selected = selectedForSuperset.has(idx);
    const cb = selected
        ? `<div class="js-row__checkbox checked"><i class="fas fa-check"></i></div>`
        : `<div class="js-row__checkbox"></div>`;

    return `<div class="js-row ${selected ? 'selected' : ''}" onclick="toggleSupersetSelect(${idx})">
        ${cb}
        <div class="js-row__info">
            <div class="js-row__name" style="color:${selected ? 'var(--highlight-warm)' : 'var(--text-strong)'};">${idx + 1}. ${escapeHtml(ex.name)}</div>
            <div class="js-row__meta">${ex.targetSets} × ${ex.targetReps} · ${ex.defaultWeight || '—'} lb</div>
        </div>
    </div>`;
}

window.toggleSupersetSelect = (idx) => {
    if (selectedForSuperset.has(idx)) selectedForSuperset.delete(idx);
    else selectedForSuperset.add(idx);
    renderSupersetSheet();
};

function confirmSupersetLink() {
    const nextGroupId = getNextSupersetGroupId(); // 'A', 'B', 'C', ...
    selectedForSuperset.forEach(idx => {
        AppState.activeWorkout.exercises[idx].supersetId = nextGroupId;
    });
    saveWorkout();
    selectingForSuperset = false;
    selectedForSuperset.clear();
    closeSheet();
    renderActiveWorkout(); // re-render pills with superset borders
}
```

### Unlinking

- In the exercise row overflow menu (⋮): "Unlink from superset" option
- Or in the superset-mode view (Section 9), header has an "Unlink" text button

---

## 9. Superset mode rendering

When `session.exercises[currentIdx].supersetId` is truthy, render both paired exercises stacked:

```javascript
function renderSupersetMode(session) {
    const groupId = session.exercises[session.currentIdx].supersetId;
    const paired = session.exercises.map((ex, i) => ({ ex, i })).filter(e => e.ex.supersetId === groupId);

    return `
        <div class="aw-superset-banner">
            <i class="fas fa-link"></i>
            Superset ${groupId} · alternate between these
            <button class="aw-superset-banner__unlink" onclick="unlinkSuperset('${groupId}')">Unlink</button>
        </div>

        ${paired.map(({ ex, i }) => {
            const isActive = i === session.currentIdx;
            return `
                <div class="aw-ss-ex ${isActive ? 'active' : ''}">
                    <div class="aw-ss-ex__head">
                        <div class="aw-ss-ex__num">${groupId}${paired.indexOf({ ex, i }) + 1}</div>
                        <div class="aw-ss-ex__name">${escapeHtml(ex.name)}</div>
                        <span class="aw-ss-ex__meta">${getAvgWeight(ex)} · ${nextSetLabel(ex)}</span>
                    </div>
                    ${isActive ? renderSetRows(ex.sets, getCurrentSetIdx(ex)) : renderSSPending(ex)}
                </div>
            `;
        }).join('')}
    `;
}
```

When user completes a set in exercise A1, the UI auto-jumps to A2 for its next set (shared rest timer between them). This is what makes supersets feel right.

---

## 10. Add exercise mid-workout

Tap "Add" in the jump sheet → exercise picker with search + category filter:

```javascript
export function openAddExerciseSheet(insertAfterIdx = null) {
    renderSheet({
        title: 'Add exercise',
        subtitle: insertAfterIdx != null ? 'After current' : 'At end',
        searchBar: true,
        categoryChips: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'All'],
        body: renderAddExerciseList(AppState.exerciseDatabase, { categoryFilter: 'all' }),
        onSelect: (exerciseName) => insertExerciseIntoWorkout(exerciseName, insertAfterIdx),
    });
}
```

---

## 11. Finish flow + summary

When user taps Finish:

1. Check for any incomplete sets — if yes, prompt "Finish anyway? 2 sets are incomplete"
2. Mark workout `completedAt: now()`
3. Compute summary: total sets, total volume, duration, new PRs
4. Close workout view, present summary modal
5. User taps "Save & done" → save to Firestore, navigate to dashboard, workout appears in Recent

### Summary modal

```javascript
export function showWorkoutSummary(session) {
    const totalSets = session.exercises.reduce((s, e) => s + e.sets.filter(x => x.completed).length, 0);
    const totalVolume = session.exercises.reduce((s, e) => s + e.sets.filter(x => x.completed).reduce((s2, x) => s2 + getSetVolume(x, AppState.equipment[x.equipmentId]), 0), 0);
    const prs = detectPRsInSession(session);
    const topInsight = getTopInsightForSession(session);

    renderSheet({
        title: '',
        customHeader: `
            <div class="aw-summary-hero">
                <div class="aw-summary-hero__icon"><i class="fas fa-flag-checkered"></i></div>
                <div class="aw-summary-hero__title">Workout complete</div>
                <div class="aw-summary-hero__sub">${escapeHtml(session.workoutType)} · ${formatElapsed(session.totalDuration)}</div>
            </div>
        `,
        body: `
            <div class="aw-summary-stats">
                <div class="aw-summary-stat"><div class="v">${session.exerciseCount}</div><div class="l">Exercises</div></div>
                <div class="aw-summary-stat"><div class="v">${totalSets}</div><div class="l">Sets</div></div>
                <div class="aw-summary-stat"><div class="v">${formatVolumeK(totalVolume)}</div><div class="l">Volume lb</div></div>
            </div>
            ${prs.map(renderPRCelebration).join('')}
            ${topInsight ? renderInsightCard(topInsight) : ''}
        `,
        actions: [
            { label: 'Share', icon: 'fa-share' },
            { label: 'Save & done', primary: true, icon: 'fa-check', onClick: saveAndExitWorkout },
        ],
    });
}
```

---

## Validation checklist

### Visual
- [ ] Header is 48px, minimal (back + title + meta + ⋮)
- [ ] Progress pills scroll horizontally, current one is primary, done are green, supersets have warm border
- [ ] Rest timer is teal gradient (not yellow), appears at top with slide-in, has +30s / Skip buttons
- [ ] Equipment is a single inline line (icon + name · base weight · Change), NOT a card
- [ ] Last session card is compact single line showing "135×10 · 185×8 · 205×6 · 225×5 PR"
- [ ] Autofill hint above set table says "Pre-filled · tap to edit"
- [ ] Autofill cells are dashed + muted; solid + bright when edited or focused
- [ ] Set row ✓ is prominent circle (38px), grey → green on tap
- [ ] Current set row has primary border + box-shadow primary-bg

### Behavior
- [ ] Tap any progress pill → instantly switch to that exercise
- [ ] Tap "All" → drawer with every exercise, tap to jump
- [ ] Tap "Superset" in drawer → select mode with checkboxes
- [ ] Select 2+ exercises → "Link N exercises" button enabled
- [ ] Confirm link → supersetId assigned, pills update, sheet closes
- [ ] When on a superset exercise → superset banner appears + both exercises stacked
- [ ] Tap "Change" on equipment → equipment sheet opens with recent-used ordering
- [ ] Rest timer auto-starts on set ✓
- [ ] Rest timer auto-dismisses at 0:00 with flash + haptic
- [ ] Next button becomes "Finish workout" on last exercise when all sets done
- [ ] Finish flow shows summary with PRs + stats + save

### Data integrity
- [ ] Set completion writes `{ weight, reps, completed: true, originalUnit, type }` plus `bodyWeight`/`addedWeight`/`isBodyweight` for BW exercises
- [ ] Autofill pulls from `getLastSessionForExercise(name)` — cached per session
- [ ] Superset group IDs persist in Firestore
- [ ] Equipment change updates set's `equipmentId` for the current exercise only

---

## Implementation order

1. **Rebuild markup + CSS first** — header, pills, rest timer, hero, equipment line, last session card. Static markup, no logic yet.
2. Wire the existing set completion logic to the new markup.
3. Ensure autofill still works end-to-end.
4. Build jump sheet + "All" button.
5. Build equipment change sheet + Change button.
6. Build superset link sheet (select mode + confirm).
7. Build superset mode render (when currentIdx is in a group, show both exercises).
8. Build add-exercise sheet.
9. Build finish flow + summary modal.
10. Style polish pass + validation checklist.

Do NOT wait on any of the dashboard work — this ships independently and the user is feeling the pain daily.

---

## Tokens used (all already in `styles/tokens.css`)

- Color: `--primary`, `--primary-dark`, `--primary-bg`, `--primary-border`, `--success`, `--warning`, `--danger`, `--highlight-warm`, `--text-*`, `--bg-*`, `--border-*`
- Category: `--cat-push`, `--cat-pull`, `--cat-legs`, `--cat-shoulders`, `--cat-arms`, `--cat-core` (+ -bg variants where available)
- Spacing: `--space-*`, `--gap-items`, `--pad-card-x`
- Radius: `--radius-sm/md/pill`
- Shadows: `--shadow-md`
- Animation: `--anim-fast`, `--anim-normal`, `--anim-slow`, `--ease-out-expo`

Do NOT introduce new tokens. If a value is missing, raise it.
