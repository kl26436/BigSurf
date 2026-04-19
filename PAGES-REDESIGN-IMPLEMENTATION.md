# Pages Redesign — Implementation Spec

Combined implementation for all the pages refreshed in the second round of mockups. Covers shared patterns + per-page deltas.

**Mockup references:**
- `mockups/forms-redesign.html` — Create Exercise, Body Measurements, Manual Workout
- `mockups/settings-onboarding-redesign.html` — Settings, Profile, Onboarding (4 steps)
- `mockups/features-redesign.html` — DEXA upload/detail, AI Coach, Equipment edit, Location edit, Bodyweight exercise
- `mockups/create-workout-redesign.html` — Create Workout (already locked in)

**Sibling docs to read first:**
- `DASHBOARD-IMPLEMENTATION.md` — Dashboard + active workout + nav (foundation)
- `EQUIPMENT-WEIGHT-IMPLEMENTATION.md` — Base weight + bodyweight handling

---

## 0. Shared form patterns — DO THIS FIRST

These styles are reused by **every** redesigned form. Build the shared CSS once, then each page just composes the patterns.

> **⚠️ Status (updated during Phase D)**: The §0 patterns below are **already shipped** across existing component files — `styles/components/forms.css` exists and the patterns live in `page-header.css`, `fields.css`, `chips.css`, `buttons.css`, `grouped-rows.css`, `segmented-control.css`, and `empty-states.css`. **Do NOT create a new forms.css.** The class names have also been migrated to BEM (CLAUDE.md Rule 9): `.btn-save` → `.page-header__save`, `.btn-back`/`.back-btn` → `.page-header__back`, `.header-left` → `.page-header__left`, `.page-title` → `.page-header__title`. `.field-label` now uses uppercase + letter-spacing per the spec below. Use this §0 as a visual reference for already-existing components, not as a build list.

### File: `styles/components/forms.css` (already exists — patterns live elsewhere; see note above)

```css
/* ── Page header (sticky, opaque, min-height) ──
   Use this on every full-screen form/page, NOT for modals.
   Follow Sticky Header Discipline rules from the workout-page-flow guide. */
.page-header {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    background: var(--bg-app);
    padding: var(--space-10) var(--pad-card-x);
    padding-top: calc(var(--space-10) + env(safe-area-inset-top, 0px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
    border-bottom: 1px solid var(--border-subtle);
}
.page-header__left {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    min-width: 0;
    flex: 1;
}
.page-header__back {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-main);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-sm);
    cursor: pointer;
    flex-shrink: 0;
}
.page-header__title {
    font-size: var(--font-md);
    font-weight: 700;
    color: var(--text-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.page-header__save {
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    font-size: var(--font-sm);
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
}
.page-header__save:disabled {
    background: var(--bg-card-hi);
    color: var(--text-muted);
    cursor: not-allowed;
}

/* ── Sticky footer with primary CTA ── */
.page-footer {
    position: sticky;
    bottom: 0;
    background: linear-gradient(to top, var(--bg-app) 70%, transparent);
    padding: var(--space-16) var(--pad-card-x) var(--space-20);
    z-index: 50;
}
.btn-primary {
    width: 100%;
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    border-radius: var(--radius-md);
    padding: 14px;
    font-size: var(--font-base);
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    transition: transform var(--anim-fast);
}
.btn-primary:active { transform: scale(0.98); }
.btn-primary:disabled {
    background: var(--bg-card-hi);
    color: var(--text-muted);
    cursor: not-allowed;
    transform: none;
}
.btn-ghost {
    width: 100%;
    background: transparent;
    border: 1px solid var(--border-light);
    color: var(--text-main);
    padding: 14px;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
}

/* ── Field ── */
.field { margin-bottom: var(--space-16); }
.field-label {
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin-bottom: var(--space-6);
    padding-left: 2px;
}
.field-label__hint {
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
    font-size: var(--font-xs);
    margin-left: var(--space-4);
}
.field-helper {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: var(--space-4);
    padding-left: 2px;
    line-height: 1.4;
}
.field-input {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    color: var(--text-strong);
    font-size: var(--font-base);
    font-weight: 500;
    outline: none;
    transition: border-color var(--anim-fast);
    font-family: var(--font);
}
.field-input:focus { border-color: var(--primary); }
.field-input::placeholder { color: var(--text-muted); font-weight: 400; }
textarea.field-input { resize: none; min-height: 80px; }

/* ── Chip row (categories, tags, types) ── */
.chip-row {
    display: flex;
    gap: var(--space-8);
    overflow-x: auto;
    padding-bottom: var(--space-4);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.chip-row::-webkit-scrollbar { display: none; }
.chip {
    flex-shrink: 0;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    font-size: var(--font-sm);
    color: var(--text-secondary);
    font-weight: 500;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    cursor: pointer;
    transition: all var(--anim-fast);
}
.chip i { font-size: 0.85rem; }
.chip:active { transform: scale(0.95); }
.chip.active {
    background: var(--primary-bg);
    border-color: var(--primary-border);
    color: var(--primary);
    font-weight: 600;
}
/* Category-specific active states (matches CATEGORY_COLORS) */
.chip.cat-push.active   { background: rgba(74,144,217,0.12); border-color: rgba(74,144,217,0.4); color: var(--cat-push); }
.chip.cat-pull.active   { background: rgba(217,74,122,0.12); border-color: rgba(217,74,122,0.4); color: var(--cat-pull); }
.chip.cat-legs.active   { background: rgba(123,74,217,0.12); border-color: rgba(123,74,217,0.4); color: var(--cat-legs); }
.chip.cat-core.active   { background: rgba(74,217,167,0.12); border-color: rgba(74,217,167,0.4); color: var(--cat-core); }
.chip.cat-cardio.active { background: rgba(217,167,74,0.12); border-color: rgba(217,167,74,0.4); color: var(--cat-cardio); }

/* ── Day chip (uniform circle, 7-col grid) ── */
.day-chip-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-6);
}
.day-chip {
    aspect-ratio: 1;
    background: var(--bg-card);
    border: 1.5px solid var(--border-subtle);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--anim-fast);
}
.day-chip:active { transform: scale(0.92); }
.day-chip.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg-app);
}

/* ── Segmented control (units, intervals, mutually exclusive) ── */
.segmented {
    display: flex;
    background: var(--bg-card-hi);
    border-radius: var(--radius-pill);
    padding: 3px;
}
.segmented button {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: var(--font-xs);
    font-weight: 600;
    padding: 5px 10px;
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: all var(--anim-fast);
}
.segmented button.active {
    background: var(--primary);
    color: var(--bg-app);
}

/* ── Toggle (replaces checkbox for on/off prefs) ── */
.toggle {
    width: 44px;
    height: 26px;
    background: var(--bg-card-hi);
    border-radius: 999px;
    position: relative;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    transition: background var(--anim-fast);
}
.toggle::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--text-secondary);
    transition: transform var(--anim-fast), background var(--anim-fast);
}
.toggle.on { background: var(--primary); }
.toggle.on::after {
    background: var(--bg-app);
    transform: translateX(18px);
}

/* ── Section header (between fields and lists) ── */
.section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: var(--space-20) 0 var(--space-10);
    padding: 0 2px;
}
.section-head h3 {
    font-size: var(--font-base);
    font-weight: 700;
    color: var(--text-strong);
    margin: 0;
}
.section-head .count {
    font-size: var(--font-xs);
    color: var(--text-muted);
    font-weight: 500;
    margin-left: var(--space-6);
}
.section-head__action {
    background: transparent;
    border: none;
    color: var(--primary);
    font-size: var(--font-xs);
    font-weight: 600;
    cursor: pointer;
}

/* ── Empty state (for blank lists / "Add first X") ── */
.empty-state {
    background: var(--bg-card);
    border: 1.5px dashed var(--border-light);
    border-radius: var(--radius-md);
    padding: 40px 20px;
    text-align: center;
}
.empty-state__icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--primary-bg);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--space-12);
    font-size: var(--font-lg);
}
.empty-state__title {
    font-size: var(--font-base);
    color: var(--text-strong);
    font-weight: 600;
    margin-bottom: var(--space-4);
}
.empty-state__desc {
    font-size: var(--font-sm);
    color: var(--text-muted);
    margin-bottom: var(--space-16);
}

/* ── Stepper (compact ± inline input, e.g. sets/reps defaults) ── */
.stepper {
    display: inline-flex;
    align-items: stretch;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    overflow: hidden;
    width: 120px;
    height: 36px;
}
.stepper button {
    width: 32px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: var(--font-base);
    cursor: pointer;
}
.stepper button:active { background: var(--bg-card-hi); }
.stepper input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-strong);
    font-size: var(--font-sm);
    font-weight: 700;
    text-align: center;
    outline: none;
    font-variant-numeric: tabular-nums;
    width: 40px;
}
.stepper-row {
    display: flex;
    gap: var(--space-16);
    align-items: center;
}
.stepper-label {
    font-size: var(--font-sm);
    color: var(--text-secondary);
    font-weight: 500;
    min-width: 42px;
}

/* ── Settings row (used in Settings page) ── */
.s-group { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; }
.s-group-label {
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin: var(--space-20) 2px var(--space-8);
}
.s-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: 13px var(--space-16);
    border-bottom: 1px solid var(--border-subtle);
    cursor: pointer;
    transition: background var(--anim-fast);
}
.s-row:last-child { border-bottom: none; }
.s-row:active { background: var(--bg-card-hover); }
.s-row__icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
}
.s-row__info { flex: 1; min-width: 0; }
.s-row__name {
    font-size: var(--font-base);
    color: var(--text-strong);
    font-weight: 500;
}
.s-row__desc {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 2px;
}
.s-row__right {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    color: var(--text-muted);
}
.s-row__value {
    color: var(--text-secondary);
    font-size: var(--font-sm);
    font-weight: 500;
}
.s-row__chev { font-size: var(--font-xs); }

/* Icon tints (for s-row__icon, meas-icon, etc.) */
.tint-primary { background: var(--primary-bg); color: var(--primary); }
.tint-warning { background: var(--warning-bg-subtle); color: var(--warning); }
.tint-warm    { background: var(--highlight-warm-bg); color: var(--highlight-warm); }
.tint-danger  { background: var(--danger-bg); color: var(--danger); }
.tint-blue    { background: var(--cat-push-bg); color: var(--cat-push); }
.tint-purple  { background: var(--cat-legs-bg); color: var(--cat-legs); }
.tint-pink    { background: var(--cat-pull-bg); color: var(--cat-pull); }
.tint-muted   { background: var(--bg-card-hi); color: var(--text-secondary); }
```

Add to `styles/index.css`:
```css
@import './components/forms.css';
```

---

## 1. Create Exercise

**Mockup**: `mockups/forms-redesign.html` (top section)
**File**: `js/core/ui/exercise-manager-ui.js` (rewrite the create-exercise modal/page)

### Render

```javascript
function renderCreateExercisePage(existing = null) {
    const ex = existing || { name: '', category: '', defaultSets: 3, defaultReps: 10, equipment: null, notes: '', videoUrl: '' };

    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeCreateExercise()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">${existing ? 'Edit Exercise' : 'New Exercise'}</div>
            </div>
            <button class="page-header__save" id="ce-save" ${isValid(ex) ? '' : 'disabled'}>Save</button>
        </div>

        <div class="content">
            <div class="field">
                <div class="field-label">Name</div>
                <input class="field-input" id="ce-name" value="${escapeHtml(ex.name)}" placeholder="e.g. Bulgarian Split Squat">
            </div>

            <div class="field">
                <div class="field-label">Category</div>
                <div class="chip-row" id="ce-category">
                    ${renderCategoryChips(ex.category)}
                </div>
            </div>

            <div class="field">
                <div class="field-label">Default sets &amp; reps</div>
                <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px 16px; display:flex; flex-direction:column; gap:10px;">
                    <div class="stepper-row">
                        <div class="stepper-label">Sets</div>
                        <div class="stepper" data-field="defaultSets">
                            <button onclick="adjustStepper('defaultSets', -1)">−</button>
                            <input value="${ex.defaultSets}" inputmode="numeric">
                            <button onclick="adjustStepper('defaultSets', 1)">+</button>
                        </div>
                    </div>
                    <div class="stepper-row">
                        <div class="stepper-label">Reps</div>
                        <div class="stepper" data-field="defaultReps">
                            <button onclick="adjustStepper('defaultReps', -1)">−</button>
                            <input value="${ex.defaultReps}" inputmode="numeric">
                            <button onclick="adjustStepper('defaultReps', 1)">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="field">
                <div class="field-label">Equipment</div>
                ${ex.equipment ? renderEquipmentRow(ex.equipment) : renderEquipmentEmptyState()}
            </div>

            <div class="section-head">
                <h3>More details</h3>
                <i class="fas fa-chevron-down" style="color:var(--text-muted);"></i>
            </div>
            <div class="ce-more" id="ce-more" hidden>
                <div class="field">
                    <div class="field-label">Notes</div>
                    <textarea class="field-input" id="ce-notes" placeholder="Form cues, range of motion, etc.">${escapeHtml(ex.notes)}</textarea>
                </div>
                <div class="field">
                    <div class="field-label">Form video URL (optional)</div>
                    <input class="field-input" id="ce-video" placeholder="YouTube or direct video link" value="${escapeHtml(ex.videoUrl)}">
                </div>
            </div>
        </div>

        <div class="page-footer">
            <button class="btn-primary" onclick="saveExercise()" ${isValid(ex) ? '' : 'disabled'}>
                <i class="fas fa-check"></i> Save Exercise
            </button>
        </div>
    `;
}

function renderCategoryChips(selected) {
    const cats = [
        { id: 'push',   label: 'Push',   icon: 'fa-hand-paper',  klass: 'cat-push' },
        { id: 'pull',   label: 'Pull',   icon: 'fa-fist-raised', klass: 'cat-pull' },
        { id: 'legs',   label: 'Legs',   icon: 'fa-walking',     klass: 'cat-legs' },
        { id: 'core',   label: 'Core',   icon: 'fa-bullseye',    klass: 'cat-core' },
        { id: 'cardio', label: 'Cardio', icon: 'fa-heartbeat',   klass: 'cat-cardio' },
        { id: 'arms',   label: 'Arms',   icon: 'fa-hand-rock',   klass: '' },
    ];
    return cats.map(c => `
        <div class="chip ${c.klass} ${selected === c.id ? 'active' : ''}" data-cat="${c.id}" onclick="setCategory('${c.id}')">
            <i class="fas ${c.icon}" style="color:var(--cat-${c.id});"></i> ${c.label}
        </div>
    `).join('');
}

function renderEquipmentEmptyState() {
    return `
        <div class="empty-state">
            <div class="empty-state__icon"><i class="fas fa-cog"></i></div>
            <div class="empty-state__title">Pick equipment</div>
            <div class="empty-state__desc">Bodyweight, barbell, or pick a specific machine</div>
            <button class="btn-primary" style="max-width:200px;margin:0 auto;" onclick="openEquipmentPicker()">Choose equipment</button>
        </div>
    `;
}
```

### Validation
- `name` is non-empty
- `category` is set
- Save button disabled until both pass

---

## 2. Body Measurements

**Mockup**: `mockups/forms-redesign.html` (Body Measurements section)
**File**: `js/core/features/body-measurements-ui.js` (rewrite the entry modal)

### Render

```javascript
function renderBodyMeasurementsEntry() {
    const today = AppState.getTodayDateString();
    const lastBW = getLatestBodyWeight();
    const lastBF = getLatestMetric('bodyFat');
    const lastChest = getLatestMetric('chest');
    // ...etc

    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeBodyMeasurements()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">Log Measurements</div>
            </div>
            <button class="page-header__save" onclick="saveBodyMeasurements()">Save</button>
        </div>

        <div class="content">
            <div class="field">
                <div class="field-label">Date</div>
                <input class="field-input" type="date" value="${today}">
            </div>

            <!-- Hero weight card -->
            <div class="section-head"><h3>Weight</h3></div>
            <div class="bm-weight-card">
                <div class="bm-weight-card__row">
                    <input class="bm-weight-card__input" type="number" step="0.1" inputmode="decimal" value="${lastBW?.weight.toFixed(1) || ''}" placeholder="0.0">
                    <span class="bm-weight-card__unit">lb</span>
                    <div class="bm-weight-card__last">
                        <div class="bm-weight-card__last-label">Last</div>
                        <div class="bm-weight-card__last-val">${lastBW ? `${lastBW.weight.toFixed(1)} lb · ${relativeDay(lastBW.ageInDays)}` : '—'}</div>
                    </div>
                </div>
                <div class="segmented" data-field="weightUnit">
                    <button class="active">lb</button>
                    <button>kg</button>
                </div>
            </div>

            <!-- Body composition -->
            <div class="section-head"><h3>Body composition <span class="count">(optional)</span></h3></div>
            ${renderMeasurementRow('bodyFat', 'Body fat', 'fa-percent', '%', lastBF)}
            ${renderMeasurementRow('muscleMass', 'Muscle mass', 'fa-fire', 'lb', getLatestMetric('muscleMass'))}

            <!-- Circumference -->
            <div class="section-head"><h3>Circumference <span class="count">(optional)</span></h3></div>
            ${renderMeasurementRow('chest', 'Chest', 'fa-ruler-horizontal', 'in', lastChest)}
            ${renderMeasurementRow('waist', 'Waist', 'fa-ruler-horizontal', 'in', getLatestMetric('waist'))}
            ${renderMeasurementRow('arm', 'Arm (L/R avg)', 'fa-ruler-horizontal', 'in', getLatestMetric('arm'))}

            <!-- Import sources -->
            <div class="section-head"><h3>Or import from</h3></div>
            <div class="s-group">
                ${renderImportSource('Withings', 'fa-link', 'tint-blue', isConnected('withings'))}
                ${renderImportSource('Upload DEXA scan', 'fa-x-ray', 'tint-warm', null, 'Upload')}
                ${renderImportSource('Apple Health', 'fa-apple', 'tint-muted', isConnected('appleHealth'))}
            </div>
        </div>

        <div class="page-footer">
            <button class="btn-primary" onclick="saveBodyMeasurements()">
                <i class="fas fa-check"></i> Save Entry
            </button>
        </div>
    `;
}

function renderMeasurementRow(key, name, icon, unit, last) {
    return `
        <div class="bm-row" data-field="${key}">
            <div class="bm-row__icon"><i class="fas ${icon}"></i></div>
            <div class="bm-row__info">
                <div class="bm-row__name">${name}</div>
                <div class="bm-row__prev">${last ? `Last: ${last.value}${unit} · ${relativeDay(last.ageInDays)}` : 'No previous entry'}</div>
            </div>
            <input class="bm-row__input" type="number" step="0.1" inputmode="decimal" placeholder="${last?.value || ''}">
            <div class="bm-row__unit">${unit}</div>
        </div>
    `;
}
```

### Additional CSS — `styles/pages/body-measurements.css`

```css
.bm-weight-card {
    background: linear-gradient(135deg, rgba(86,182,194,0.12), rgba(86,182,194,0.02));
    border: 1px solid rgba(86,182,194,0.25);
    border-radius: var(--radius-md);
    padding: var(--space-16);
    margin-bottom: var(--space-16);
}
.bm-weight-card__row {
    display: flex;
    align-items: baseline;
    gap: var(--space-8);
    margin-bottom: var(--space-10);
}
.bm-weight-card__input {
    background: transparent;
    border: none;
    color: var(--text-strong);
    font-size: 1.5rem;
    font-weight: 800;
    outline: none;
    width: 120px;
    font-variant-numeric: tabular-nums;
}
.bm-weight-card__unit {
    color: var(--cat-shoulders);
    font-size: var(--font-base);
    font-weight: 600;
}
.bm-weight-card__last { flex: 1; text-align: right; }
.bm-weight-card__last-label {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.bm-weight-card__last-val {
    font-size: var(--font-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

.bm-row {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: var(--space-8);
}
.bm-row__icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: var(--bg-card-hi);
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.bm-row__info { flex: 1; min-width: 0; }
.bm-row__name { font-size: var(--font-sm); font-weight: 600; color: var(--text-strong); }
.bm-row__prev { font-size: var(--font-xs); color: var(--text-muted); margin-top: 2px; }
.bm-row__input {
    width: 80px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text-strong);
    font-size: var(--font-base);
    font-weight: 600;
    text-align: right;
    outline: none;
    font-variant-numeric: tabular-nums;
}
.bm-row__unit {
    font-size: var(--font-xs);
    color: var(--text-muted);
    font-weight: 500;
    width: 24px;
    text-align: left;
}
```

### Save logic

Only persist fields the user actually filled (don't save empty/zero). All weights/measurements stored with `originalUnit`.

---

## 3. Manual Workout Entry

**Mockup**: `mockups/forms-redesign.html` (Manual Workout section)
**File**: `js/core/features/manual-workout.js` (rewrite)

The big change: this should **share the same exercise card components** as the active workout. No bespoke "manual entry" UI — just the active-workout component with a different header and disabled timer/auto-completion logic.

### Approach

```javascript
import { renderExerciseCard } from '../workout/exercise-ui.js';

export function startManualWorkout(workoutType, date) {
    AppState.activeWorkout = {
        workoutType,
        date,                    // user-picked, NOT today
        startedAt: new Date(date).toISOString(),
        exercises: {},
        isManual: true,          // flag — disables timer, allows date editing
    };
    renderManualWorkoutPage();
}

function renderManualWorkoutPage() {
    const wo = AppState.activeWorkout;
    return `
        <div class="page-header" style="flex-direction:column; align-items:stretch; gap:8px; padding-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="page-header__left">
                    <button class="page-header__back" onclick="cancelManual()"><i class="fas fa-chevron-left"></i></button>
                    <div>
                        <div class="page-header__eyebrow">Past Workout</div>
                        <div class="page-header__title">${escapeHtml(wo.workoutType)}</div>
                    </div>
                </div>
                <button class="page-header__save" onclick="saveManual()">Save</button>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="chip" onclick="editDate()"><i class="far fa-calendar"></i> ${formatDate(wo.date)}</button>
                <button class="chip" onclick="editDuration()"><i class="far fa-clock"></i> ${formatDuration(wo.totalDuration)}</button>
            </div>
        </div>

        <div class="content">
            ${Object.entries(wo.exercises).map(([idx, ex]) =>
                renderExerciseCard(ex, idx, { isManual: true })
            ).join('')}

            <button class="add-exercise-btn" onclick="openExercisePicker()">
                <i class="fas fa-plus"></i> Add Exercise
            </button>
        </div>

        <div class="page-footer">
            <button class="btn-primary" onclick="saveManual()">
                <i class="fas fa-check"></i> Save Past Workout
            </button>
        </div>
    `;
}
```

### `renderExerciseCard(ex, idx, opts)` — modify to honor `opts.isManual`

```javascript
export function renderExerciseCard(exercise, exerciseIdx, opts = {}) {
    const isManual = opts.isManual === true;
    return `
        <div class="exercise-card ...">
            <!-- existing header -->
            <!-- existing set table -->
            <!-- HIDE rest timer button when isManual -->
            ${isManual ? '' : renderRestTimerButton()}
            <!-- HIDE "Mark Complete" exercise-completion section when isManual (sets are auto-marked complete on input) -->
        </div>
    `;
}
```

### Header CSS additions

```css
.page-header__eyebrow {
    font-size: 0.6rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
}
```

### Save logic

- Mark `wo.completedAt = new Date().toISOString()`
- Persist with `version: '3.0'` and `isManual: true` flag (for filtering in stats if needed)
- Same retry/error handling as live workout save

---

## 4. Settings page

**Mockup**: `mockups/settings-onboarding-redesign.html` (Settings · main + Profile)
**File**: `js/core/ui/settings-ui.js` (rewrite render)

### Render structure

```javascript
function renderSettings() {
    const s = AppState.settings;
    const u = AppState.user;
    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeSettings()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">Settings</div>
            </div>
        </div>
        <div class="content">

            <div class="profile-card" onclick="openProfile()">
                <div class="profile-card__avatar"></div>
                <div class="profile-card__info">
                    <div class="profile-card__name">${escapeHtml(u.displayName)}</div>
                    <div class="profile-card__email">${escapeHtml(u.email)}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>

            <div class="s-group-label">Preferences</div>
            <div class="s-group">
                ${renderInlineSeg('Weight unit', 'fa-weight-hanging', 'tint-blue', s.weightUnit, ['lb','kg'], setWeightUnit)}
                ${renderInlineSeg('Rest timer', 'fa-stopwatch', 'tint-primary', s.restTimer, ['60s','90s','120s'], setRestTimer)}
                ${renderInlineSeg('Weekly goal', 'fa-bullseye', 'tint-warm', String(s.weeklyGoal), ['3','4','5','6'], setWeeklyGoal)}
            </div>

            <div class="s-group-label">Training</div>
            <div class="s-group">
                ${renderToggleRow('Rest timer sound', 'Chime when rest period ends', 'fa-bell', 'tint-primary', s.timerSound, 'timerSound')}
                ${renderToggleRow('PR celebrations', 'Confetti & haptic on new records', 'fa-trophy', 'tint-warning', s.prCelebrations, 'prCelebrations')}
                ${renderToggleRow('Auto-detect gym', 'Use GPS to match saved locations', 'fa-map-marker-alt', 'tint-purple', s.autoLocation, 'autoLocation')}
                ${renderToggleRow('Show warmup sets', null, 'fa-eye', 'tint-muted', s.showWarmups, 'showWarmups')}
            </div>

            <div class="s-group-label">Connections</div>
            <div class="s-group">
                ${renderConnectionRow('Withings', 'Weight & body composition', 'fa-link', 'tint-blue', s.connections.withings)}
                ${renderConnectionRow('Apple Health', 'Sync heart rate & sleep', 'fa-apple', 'tint-muted', s.connections.appleHealth)}
            </div>

            <div class="s-group-label">Data</div>
            <div class="s-group">
                ${renderNavRow('Export workouts', 'Download CSV or JSON', 'fa-download', 'tint-muted', openExport)}
                ${renderNavRow('Import', null, 'fa-upload', 'tint-muted', openImport)}
            </div>

            <div class="s-group-label" style="color:var(--danger);">Danger zone</div>
            <div class="s-group">
                <div class="s-row" onclick="confirmSignOut()">
                    <div class="s-row__icon tint-danger"><i class="fas fa-sign-out-alt"></i></div>
                    <div class="s-row__info"><div class="s-row__name" style="color:var(--danger);">Sign out</div></div>
                </div>
                <div class="s-row" onclick="confirmDeleteAllData()">
                    <div class="s-row__icon tint-danger"><i class="fas fa-trash"></i></div>
                    <div class="s-row__info">
                        <div class="s-row__name" style="color:var(--danger);">Delete all data</div>
                        <div class="s-row__desc">Permanently remove all workouts</div>
                    </div>
                </div>
            </div>

            <div style="text-align:center; margin-top:20px; font-size:var(--font-xs); color:var(--text-muted);">
                Big Surf v${APP_VERSION} · Build ${BUILD_NUMBER}
            </div>
        </div>
    `;
}

// Helpers
function renderInlineSeg(name, icon, tint, value, options, onChange) {
    return `
        <div class="s-row">
            <div class="s-row__icon ${tint}"><i class="fas ${icon}"></i></div>
            <div class="s-row__info"><div class="s-row__name">${name}</div></div>
            <div class="segmented" data-onchange="${onChange.name}">
                ${options.map(o => `<button class="${o === value ? 'active' : ''}" onclick="${onChange.name}('${o}')">${o}</button>`).join('')}
            </div>
        </div>
    `;
}

function renderToggleRow(name, desc, icon, tint, on, key) {
    return `
        <div class="s-row" onclick="toggleSetting('${key}')">
            <div class="s-row__icon ${tint}"><i class="fas ${icon}"></i></div>
            <div class="s-row__info">
                <div class="s-row__name">${name}</div>
                ${desc ? `<div class="s-row__desc">${desc}</div>` : ''}
            </div>
            <button class="toggle ${on ? 'on' : ''}" data-key="${key}"></button>
        </div>
    `;
}

function renderConnectionRow(name, desc, icon, tint, conn) {
    const isConnected = conn?.connected;
    return `
        <div class="s-row" onclick="toggleConnection('${name.toLowerCase()}')">
            <div class="s-row__icon ${tint}"><i class="${name === 'Apple Health' ? 'fab' : 'fas'} ${icon}"></i></div>
            <div class="s-row__info">
                <div class="s-row__name">${name}</div>
                <div class="s-row__desc">${desc}</div>
            </div>
            <div class="s-row__right">
                <span style="color:var(--${isConnected ? 'success' : 'primary'}); font-size:var(--font-xs); font-weight:600;">
                    ${isConnected ? 'Connected' : 'Connect'}
                </span>
            </div>
        </div>
    `;
}

function renderNavRow(name, desc, icon, tint, onClick) {
    return `
        <div class="s-row" onclick="${onClick.name}()">
            <div class="s-row__icon ${tint}"><i class="fas ${icon}"></i></div>
            <div class="s-row__info">
                <div class="s-row__name">${name}</div>
                ${desc ? `<div class="s-row__desc">${desc}</div>` : ''}
            </div>
            <i class="fas fa-chevron-right s-row__chev"></i>
        </div>
    `;
}
```

### CSS — `styles/pages/settings.css`

```css
.profile-card {
    background: linear-gradient(135deg, var(--bg-card-hi), var(--bg-card));
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
    cursor: pointer;
    transition: transform var(--anim-fast);
}
.profile-card:active { transform: scale(0.99); }
.profile-card__avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--cat-push), var(--cat-pull));
    flex-shrink: 0;
}
.profile-card__info { flex: 1; min-width: 0; }
.profile-card__name {
    font-size: var(--font-lg);
    font-weight: 700;
    color: var(--text-strong);
}
.profile-card__email {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 2px;
}
```

### Settings save behavior

Each toggle/segmented change writes immediately (debounced 500ms) to Firestore at `users/{userId}/preferences/settings`, NOT on a page-level Save button.

### Schema

```javascript
// users/{userId}/preferences/settings
{
    weightUnit: 'lb',
    restTimer: 90,
    weeklyGoal: 5,
    timerSound: true,
    prCelebrations: true,
    autoLocation: true,
    showWarmups: false,
    connections: {
        withings: { connected: true, lastSync: '...' },
        appleHealth: { connected: false },
    },
    hasCompletedOnboarding: true,
}
```

---

## 5. Profile detail

**Mockup**: `mockups/settings-onboarding-redesign.html` (Profile detail phone)
**File**: `js/core/ui/settings-ui.js` (new function `renderProfileDetail`)

Just a `Settings`-styled page composed entirely of `s-group` rows. Tap any row → simple inline edit modal (use `prompt()` or a lightweight modal — your call). Avatar tap opens the device camera/photo picker.

```javascript
function renderProfileDetail() {
    const u = AppState.user;
    const p = AppState.profile;
    return `
        <div class="page-header">...Profile</div>
        <div class="content">
            <div class="profile-hero">
                <div class="profile-hero__avatar">
                    <button class="profile-hero__camera" onclick="openAvatarPicker()"><i class="fas fa-camera"></i></button>
                </div>
                <div class="profile-hero__name">${escapeHtml(u.displayName)}</div>
                <div class="profile-hero__email">${escapeHtml(u.email)}</div>
            </div>

            <div class="s-group-label">Account</div>
            <div class="s-group">
                ${renderEditRow('Display name', u.displayName, 'fa-user', 'tint-muted', editName)}
                ${renderEditRow('Email', u.email, 'fa-envelope', 'tint-muted', editEmail)}
            </div>

            <div class="s-group-label">Fitness profile</div>
            <div class="s-group">
                ${renderEditRow('Height', formatHeight(p.height), 'fa-ruler-vertical', 'tint-warm', editHeight)}
                ${renderEditRow('Birthday', formatDate(p.birthday, 'MMM yyyy'), 'fa-calendar', 'tint-primary', editBirthday)}
                ${renderEditRow('Experience level', capitalize(p.experience), 'fa-star', 'tint-blue', editExperience)}
            </div>
        </div>
    `;
}
```

---

## 6. Onboarding (4 steps)

**Mockup**: `mockups/settings-onboarding-redesign.html` (Onboarding · steps 1–4)
**File**: `js/core/ui/settings-ui.js` (the `runOnboarding()` flow already exists; rewrite presentation)

### Steps

1. **Welcome** — BigSurf logo (use `BigSurfNoBG.png`), title, single Get Started CTA
2. **Weekly goal** — chip-style options (3 / 4 / 5 / 6 sessions per week)
3. **Experience level** — chip-style options (Beginner / Intermediate / Advanced)
4. **Units & preferences** — segmented controls for weight unit, rest timer default, body measurement unit

### Flow

```javascript
const ONBOARDING_STEPS = ['welcome', 'goal', 'experience', 'units'];

function renderOnboardingStep(stepIdx) {
    const step = ONBOARDING_STEPS[stepIdx];
    const total = ONBOARDING_STEPS.length;
    return `
        <div class="onb-content">
            <div class="onb-progress">
                ${ONBOARDING_STEPS.map((_, i) => `<div class="onb-dot ${i <= stepIdx ? 'active' : ''}"></div>`).join('')}
            </div>
            ${step === 'welcome'    ? renderWelcomeStep()    : ''}
            ${step === 'goal'       ? renderGoalStep()       : ''}
            ${step === 'experience' ? renderExperienceStep() : ''}
            ${step === 'units'      ? renderUnitsStep()      : ''}
        </div>
        <div class="onb-footer">
            ${stepIdx > 0 ? `<button class="btn-ghost" onclick="onboardingBack()">Back</button>` : ''}
            <button class="btn-primary" onclick="onboardingNext()" style="${stepIdx === 0 ? 'flex:1' : ''}">
                ${stepIdx === total - 1 ? '<i class="fas fa-check"></i> All set!' :
                  stepIdx === 0 ? 'Get Started <i class="fas fa-arrow-right"></i>' :
                  'Next <i class="fas fa-arrow-right"></i>'}
            </button>
        </div>
    `;
}

function renderWelcomeStep() {
    return `
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align:center;">
            <img src="BigSurfNoBG.png" alt="Big Surf" class="onb-logo" />
            <div class="onb-title">Welcome to<br>Big Surf</div>
            <div class="onb-desc">Track your lifts, hit PRs, see trends. Let's set up your profile in under a minute.</div>
        </div>
    `;
}
```

### CSS — `styles/pages/onboarding.css`

```css
.onb-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 20px 0;
}
.onb-progress {
    display: flex;
    gap: 6px;
    margin-bottom: 24px;
}
.onb-dot {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border-light);
    transition: background var(--anim-normal);
}
.onb-dot.active { background: var(--primary); }

.onb-logo {
    width: 120px;
    height: 120px;
    object-fit: contain;
    margin: 0 auto 18px;
}
.onb-icon-hero {
    width: 80px;
    height: 80px;
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin-bottom: 18px;
}
.onb-title {
    font-size: var(--font-2xl);
    font-weight: var(--font-display-weight);
    color: var(--text-strong);
    margin-bottom: var(--space-8);
    line-height: 1.2;
}
.onb-desc {
    font-size: var(--font-base);
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: var(--space-24);
}
.onb-chip {
    background: var(--bg-card);
    border: 1.5px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: var(--space-8);
    cursor: pointer;
    transition: all var(--anim-fast);
}
.onb-chip:active { transform: scale(0.98); }
.onb-chip.selected {
    border-color: var(--primary);
    background: var(--primary-bg);
}
.onb-chip__icon {
    width: 36px; height: 36px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.onb-chip__info { flex: 1; }
.onb-chip__name {
    font-size: var(--font-base);
    font-weight: 600;
    color: var(--text-strong);
}
.onb-chip__desc {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 2px;
}
.onb-chip__check {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--bg-app);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.68rem;
}

.onb-footer {
    padding: 20px;
    display: flex;
    gap: 10px;
    border-top: 1px solid var(--border-subtle);
}
.onb-footer .btn-ghost { flex: 1; }
.onb-footer .btn-primary { flex: 2; }
```

### Save behavior

Each step persists immediately to `users/{userId}/preferences/settings` so partial completion is recoverable. Mark `hasCompletedOnboarding: true` on final "All set!" tap.

---

## 7. DEXA Scan

**Mockup**: `mockups/features-redesign.html` (DEXA Upload + Detail)
**File**: `js/core/features/dexa-scan-ui.js` (rewrite both views)

### Upload page

```javascript
function renderDexaUpload() {
    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeDexaUpload()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">New DEXA Scan</div>
            </div>
            <button class="page-header__save" id="dexa-save" disabled>Save</button>
        </div>
        <div class="content">
            <div class="dexa-drop">
                <div class="dexa-drop__icon"><i class="fas fa-file-upload"></i></div>
                <div class="dexa-drop__title">Upload scan results</div>
                <div class="dexa-drop__desc">PDF or CSV from your DEXA facility</div>
                <button class="btn-primary" style="max-width:160px;margin:0 auto;" onclick="pickDexaFile()">Choose file</button>
            </div>
            <div class="dexa-supports">
                <div class="dexa-supports__pill"><i class="fas fa-file-pdf"></i> Supports PDF</div>
                <div class="dexa-supports__pill"><i class="fas fa-file-csv"></i> CSV / Excel</div>
            </div>

            <div class="section-head"><h3>Or enter manually</h3></div>
            <div class="field"><div class="field-label">Scan date</div><input class="field-input" type="date"></div>
            <div class="field"><div class="field-label">Facility (optional)</div><input class="field-input" placeholder="e.g. DexaFit Boston"></div>
            <div class="field">
                <div class="field-label">Units</div>
                <div class="chip-row">
                    <div class="chip active" onclick="setDexaUnits('imperial')"><i class="fas fa-check"></i> lb / inches</div>
                    <div class="chip" onclick="setDexaUnits('metric')">kg / cm</div>
                </div>
            </div>
        </div>
        <div class="page-footer">
            <button class="btn-primary" onclick="continueToResults()">
                <i class="fas fa-arrow-right"></i> Continue to results
            </button>
        </div>
    `;
}
```

### Detail page

```javascript
function renderDexaDetail(scanId) {
    const scan = AppState.dexaScans[scanId];
    const prev = getPreviousDexaScan(scanId);
    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeDexaDetail()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">DEXA · ${formatDate(scan.date, 'MMM d')}</div>
            </div>
            <button style="background:transparent; border:none; color:var(--text-muted);"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="content">

            <div class="section-head">
                <h3>Summary</h3>
                ${prev ? `<span style="font-size:var(--font-xs);color:var(--text-muted);">vs ${formatDate(prev.date)}</span>` : ''}
            </div>
            <div class="dexa-stat-grid">
                ${renderStatCard('Body fat',  scan.bodyFatPct,  '%',  prev?.bodyFatPct,  true)}
                ${renderStatCard('Lean mass', scan.leanMass,    'lb', prev?.leanMass,    false)}
                ${renderStatCard('Fat mass',  scan.fatMass,     'lb', prev?.fatMass,     true)}
                ${renderStatCard('Bone',      scan.boneMass,    'lb', prev?.boneMass,    false)}
            </div>

            <div class="dexa-insight">
                <i class="fas fa-lightbulb"></i>
                <div>${getDexaInsight(scan, prev)}</div>
            </div>

            <div class="section-head"><h3>Regional lean mass</h3></div>
            ${renderRegionalCard(scan)}

            <div class="section-head"><h3>Visceral fat</h3></div>
            ${renderVisceralCard(scan)}
        </div>
    `;
}

function renderStatCard(label, val, unit, prevVal, lowerIsBetter) {
    let deltaStr = '';
    if (prevVal != null) {
        const delta = val - prevVal;
        const cls = (delta < 0) === lowerIsBetter ? 'up' : 'down';
        const arrow = delta > 0 ? '↑' : '↓';
        deltaStr = `<div class="stat-card__delta ${cls}">${arrow} ${Math.abs(delta).toFixed(1)}${unit}</div>`;
    }
    return `
        <div class="stat-card">
            <div class="stat-card__label">${label}</div>
            <div class="stat-card__val">${val}<span class="stat-card__unit">${unit}</span></div>
            ${deltaStr}
        </div>
    `;
}
```

### CSS — `styles/pages/dexa.css` (replace existing)

```css
.dexa-drop {
    background: var(--bg-card);
    border: 2px dashed var(--primary-border);
    border-radius: var(--radius-md);
    padding: 40px 20px;
    text-align: center;
    margin-bottom: var(--space-12);
}
.dexa-drop__icon {
    width: 64px; height: 64px;
    border-radius: 50%;
    background: var(--primary-bg);
    color: var(--primary);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto var(--space-12);
    font-size: 1.4rem;
}
.dexa-drop__title { font-size: var(--font-base); color: var(--text-strong); font-weight: 700; margin-bottom: var(--space-4); }
.dexa-drop__desc { font-size: var(--font-sm); color: var(--text-muted); margin-bottom: var(--space-12); }

.dexa-supports {
    display: flex; gap: 8px; justify-content: center;
    margin-bottom: var(--space-20);
}
.dexa-supports__pill {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-pill);
    padding: 6px 12px;
    font-size: var(--font-xs);
    color: var(--text-secondary);
    display: inline-flex; align-items: center; gap: var(--space-6);
}

.dexa-stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-8);
    margin-bottom: var(--space-12);
}
.stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px;
}
.stat-card__label {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: var(--space-4);
}
.stat-card__val {
    font-size: var(--font-xl);
    font-weight: var(--font-display-weight);
    color: var(--text-strong);
    line-height: 1;
}
.stat-card__unit {
    font-size: var(--font-sm);
    color: var(--text-muted);
    font-weight: 500;
    margin-left: 3px;
}
.stat-card__delta {
    font-size: var(--font-xs);
    font-weight: 600;
    margin-top: var(--space-4);
}
.stat-card__delta.up { color: var(--success); }
.stat-card__delta.down { color: var(--danger); }

.dexa-insight {
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: var(--space-20);
    display: flex;
    gap: var(--space-10);
    align-items: flex-start;
}
.dexa-insight > i { color: var(--primary); margin-top: 2px; }
.dexa-insight > div {
    font-size: var(--font-sm);
    color: var(--text-main);
    line-height: 1.45;
}

/* Remove all existing chevron-collapsible-section CSS — no more accordion sections */
```

---

## 8. AI Coach

**Mockup**: `mockups/features-redesign.html` (AI Coach empty + conversation)
**File**: `js/core/features/ai-coach-ui.js` (rewrite)

Pattern: **prompt cards in empty state, chat bubbles when active**. Input bar pinned at bottom always.

### Empty state

```javascript
function renderAICoachEmpty() {
    const prompts = getContextualPrompts(); // computed from AppState.workouts
    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeAICoach()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">AI Coach</div>
            </div>
            <button class="page-header__icon-btn" onclick="openCoachHistory()"><i class="fas fa-history"></i></button>
        </div>
        <div class="content" style="padding-bottom:80px;">
            <div class="coach-hero">
                <div class="coach-hero__icon"><i class="fas fa-robot"></i></div>
                <div class="coach-hero__title">Ask anything</div>
                <div class="coach-hero__desc">I know your training history. Try:</div>
            </div>
            ${prompts.map(p => `
                <div class="coach-prompt-card" onclick="askCoach('${escapeAttr(p.text)}')">
                    <div class="coach-prompt-card__icon ${p.tint}"><i class="fas ${p.icon}"></i></div>
                    <div class="coach-prompt-card__text">${p.html}</div>
                </div>
            `).join('')}
        </div>
        <div class="coach-input-bar">
            <input id="coach-input" placeholder="Ask your coach anything…" onkeypress="if(event.key==='Enter') sendCoachMessage()">
            <button class="coach-input-bar__send" onclick="sendCoachMessage()"><i class="fas fa-arrow-up"></i></button>
        </div>
    `;
}
```

### Chat state

```javascript
function renderAICoachChat(session) {
    return `
        <div class="page-header">...</div>
        <div class="content" style="padding-bottom:80px;">
            <div class="coach-chat">
                ${session.messages.map(m => `
                    <div class="coach-msg coach-msg--${m.role}">
                        ${renderMessageContent(m)}
                    </div>
                `).join('')}
                ${session.thinking ? `<div class="coach-msg coach-msg--bot coach-thinking"><i class="fas fa-circle"></i><i class="fas fa-circle"></i><i class="fas fa-circle"></i></div>` : ''}
            </div>
        </div>
        <div class="coach-input-bar">
            <input id="coach-input" placeholder="Reply…" onkeypress="if(event.key==='Enter') sendCoachMessage()">
            <button class="coach-input-bar__send" onclick="sendCoachMessage()"><i class="fas fa-arrow-up"></i></button>
        </div>
    `;
}
```

### Action cards in bot responses

When the bot makes a change (e.g. updates a template), include an embedded action card:

```javascript
function renderActionCard(action) {
    const icon = getCategoryIcon(action.category);
    return `
        <div class="coach-action-card" onclick="openTemplate('${action.templateId}')">
            <i class="fas ${icon}" style="color:var(--cat-${action.category});"></i>
            <div>
                <div class="coach-action-card__title">${escapeHtml(action.label)}</div>
                <div class="coach-action-card__desc">Updated · ${action.exerciseCount} exercises</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:0.7rem;"></i>
        </div>
    `;
}
```

### CSS — `styles/pages/ai-coach.css` (replace existing)

```css
.coach-hero {
    text-align: center;
    padding: 20px 0 24px;
}
.coach-hero__icon {
    width: 64px; height: 64px;
    border-radius: 50%;
    background: var(--primary-bg);
    color: var(--primary);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto var(--space-12);
    font-size: 1.5rem;
}
.coach-hero__title {
    font-size: var(--font-lg);
    color: var(--text-strong);
    font-weight: 700;
    margin-bottom: var(--space-4);
}
.coach-hero__desc { font-size: var(--font-sm); color: var(--text-muted); }

.coach-prompt-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    gap: var(--space-10);
    align-items: flex-start;
    margin-bottom: var(--space-8);
    cursor: pointer;
    transition: transform var(--anim-fast);
}
.coach-prompt-card:active { transform: scale(0.98); }
.coach-prompt-card__icon {
    width: 32px; height: 32px;
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-sm);
    flex-shrink: 0;
}
.coach-prompt-card__text {
    font-size: var(--font-sm);
    color: var(--text-main);
    line-height: 1.4;
}

.coach-chat {
    display: flex;
    flex-direction: column;
}
.coach-msg {
    max-width: 80%;
    padding: 12px 14px;
    border-radius: 18px;
    font-size: var(--font-sm);
    line-height: 1.5;
    margin-bottom: var(--space-8);
    word-wrap: break-word;
}
.coach-msg--user {
    background: var(--primary);
    color: var(--bg-app);
    align-self: flex-end;
    border-bottom-right-radius: 6px;
}
.coach-msg--bot {
    background: var(--bg-card);
    color: var(--text-main);
    align-self: flex-start;
    border: 1px solid var(--border-subtle);
    border-bottom-left-radius: 6px;
}
.coach-msg strong { color: var(--text-strong); }

.coach-action-card {
    background: var(--bg-card-hi);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-top: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-10);
    border: 1px solid var(--border-light);
    cursor: pointer;
}
.coach-action-card__title {
    font-size: var(--font-sm);
    color: var(--text-strong);
    font-weight: 600;
}
.coach-action-card__desc {
    font-size: var(--font-xs);
    color: var(--text-muted);
}

.coach-input-bar {
    position: absolute;
    bottom: 0;
    left: 0; right: 0;
    background: var(--bg-app);
    border-top: 1px solid var(--border-subtle);
    padding: 12px 14px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    display: flex;
    gap: var(--space-8);
    align-items: center;
}
.coach-input-bar input {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-pill);
    padding: 10px 16px;
    color: var(--text-strong);
    font-size: var(--font-base);
    outline: none;
}
.coach-input-bar input:focus { border-color: var(--primary); }
.coach-input-bar__send {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--bg-app);
    border: none;
    display: flex; align-items: center; justify-content: center;
    font-size: var(--font-sm);
    cursor: pointer;
}

.coach-thinking {
    display: inline-flex;
    gap: 4px;
}
.coach-thinking i {
    font-size: 0.4rem;
    animation: thinking-bounce 1.4s ease-in-out infinite;
}
.coach-thinking i:nth-child(2) { animation-delay: 0.2s; }
.coach-thinking i:nth-child(3) { animation-delay: 0.4s; }
@keyframes thinking-bounce {
    0%, 100% { opacity: 0.3; transform: translateY(0); }
    50%      { opacity: 1;   transform: translateY(-3px); }
}
```

### Contextual prompts

Compute these from `AppState.workouts` so suggestions are personalized:

```javascript
function getContextualPrompts() {
    const prompts = [];
    const stalled = findStalledLifts(AppState.workouts);
    if (stalled.length > 0) {
        prompts.push({
            icon: 'fa-chart-line', tint: 'tint-primary',
            text: `Why has my ${stalled[0].name.toLowerCase()} stalled?`,
            html: `Why has my <strong>${escapeHtml(stalled[0].name.toLowerCase())}</strong> stalled? Suggest a deload.`,
        });
    }
    const imbalance = checkVolumeBalance(AppState.workouts);
    if (imbalance) {
        prompts.push({
            icon: 'fa-balance-scale', tint: 'tint-warning',
            text: 'Check my push / pull volume balance this month.',
            html: 'Check my <strong>push / pull volume</strong> balance this month.',
        });
    }
    // Always include
    prompts.push({
        icon: 'fa-calendar-alt', tint: 'tint-warm',
        text: 'Plan a 5-day split for my goals.',
        html: 'Plan a <strong>5-day split</strong> for my goals.',
    });
    prompts.push({
        icon: 'fa-running', tint: 'tint-purple',
        text: "Help me deload next week, I'm feeling beat up.",
        html: "Help me deload next week — I'm feeling beat up.",
    });
    return prompts.slice(0, 4);
}
```

---

## 9. Equipment Edit / Location Edit

**Mockup**: `mockups/features-redesign.html` (Equipment + Location edit)
**File**: `js/core/ui/equipment-library-ui.js` (rewrite both modals)

These largely follow the form patterns from §0. Key specifics:

### Equipment edit additions
- Type chip row + conditional **Base weight** field (see `EQUIPMENT-WEIGHT-IMPLEMENTATION.md`)
- Locations as removable chips (`<button>` inside chip with × to detach)
- "Used for" linked exercises list using `s-row`-style rows
- Destructive "Delete equipment" text-button at the bottom (centered, danger color)

### Location edit additions
- Mini map card (use Leaflet — already in CDN per CLAUDE.md)
- "Use current GPS" pill button
- Match radius as chip row (100m / 500m / 1km)
- Equipment-here list using `s-row` pattern
- Destructive "Delete location" text-button at the bottom

### CSS — `styles/pages/equipment-edit.css` (NEW)

```css
.eq-locations-chips {
    display: flex;
    gap: var(--space-8);
    flex-wrap: wrap;
    margin-bottom: var(--space-8);
}
.eq-location-chip {
    /* extends .chip.active */
    padding-right: 6px;
}
.eq-location-chip__remove {
    background: transparent;
    border: none;
    color: inherit;
    margin-left: var(--space-4);
    cursor: pointer;
    opacity: 0.7;
}
.eq-location-chip__remove:hover { opacity: 1; }

.loc-map-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px;
    margin-bottom: var(--space-12);
}
.loc-map-card__map {
    height: 100px;
    background: linear-gradient(135deg, #1a2838, var(--bg-card));
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-10);
    /* Replace with actual Leaflet map div */
}
.loc-map-card__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.loc-map-card__addr {
    font-size: var(--font-sm);
    color: var(--text-strong);
    font-weight: 600;
}
.loc-map-card__coords {
    font-size: var(--font-xs);
    color: var(--text-muted);
}
.loc-map-card__use-current {
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    color: var(--primary);
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    font-size: var(--font-xs);
    font-weight: 600;
}

.danger-action-row {
    margin-top: var(--space-24);
    text-align: center;
}
.danger-action-row button {
    background: transparent;
    border: none;
    color: var(--danger);
    font-size: var(--font-sm);
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-8);
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
}
```

---

## 10. Validation checklist (covers ALL pages above)

For each redesigned page:
- [ ] Sticky page header at z-100, opaque bg, min-height 56px, includes safe-area-inset-top in padding
- [ ] Save button (when applicable) lives in the top-right of the header AND as primary CTA in sticky footer
- [ ] No `<select>` dropdowns anywhere — replaced with chip rows or segmented controls
- [ ] No raw `<input type="checkbox">` for prefs — replaced with `.toggle`
- [ ] Field labels use uppercase tracking, NO asterisks for "required"
- [ ] All chip rows scroll horizontally on overflow with `scrollbar-width: none`
- [ ] All animations use `var(--anim-*)` tokens only
- [ ] All colors use `var(--*)` tokens — no hardcoded hex
- [ ] Empty states use the `.empty-state` pattern (dashed border + primary icon + CTA)
- [ ] Destructive actions are tinted danger AND require confirmation before executing
- [ ] Disabled save buttons show `--bg-card-hi` + `--text-muted`, no opacity tricks
- [ ] All `:active` press states use `transform: scale(0.95–0.98)` — never opacity
- [ ] Onboarding step 1 uses `BigSurfNoBG.png`, not an FA icon
- [ ] Settings changes auto-save (debounced) — no separate Save button on the main settings page
- [ ] Manual workout uses the same `renderExerciseCard()` as live workouts with `opts.isManual: true`
- [ ] DEXA detail has NO collapsible chevron sections — all content visible
- [ ] AI Coach input bar is always visible at bottom; prompt cards are tappable shortcuts

---

## 11. Order of implementation

1. Create `styles/components/forms.css` with all shared patterns (§0). Add to `styles/index.css`.
2. **Settings page** (high impact, simplest) — auto-saving + segmented controls
3. **Profile detail** (small, builds on settings)
4. **Onboarding** — replaces existing flow with 4 steps using shared patterns
5. **Create Exercise** — completes the create-* form parity (Create Workout already done)
6. **Body Measurements** — including the import-source rows (overlap with Settings is OK)
7. **Manual Workout** — relies on `renderExerciseCard()` refactor with `opts.isManual`
8. **DEXA Upload + Detail** — kill the chevron-collapsible-section CSS once and for all
9. **AI Coach** — including contextual prompt computation
10. **Equipment Edit + Location Edit** — incl. `baseWeight` field from `EQUIPMENT-WEIGHT-IMPLEMENTATION.md`
11. Run validation checklist on every page
12. Audit any remaining modals (Plate Calculator settings, Onboarding subtleties) and apply patterns

---

## 12. Tokens reference

These are the only tokens you may use — defined already in `styles/tokens.css`, do not redefine:

- Animation: `--anim-fast/normal/slow`, `--ease-out-expo`, `--ease-out-back`, `--ease-spring`
- Spacing: `--space-2..--space-80`, `--gap-items`, `--gap-section`, `--pad-page`, `--pad-card-x`, `--pad-card-y`
- Sizing: `--tap` (44px), `--tap-sm` (36px), `--icon-xs..--icon-xl`, `--input-height`, `--accent-bar`
- Radius: `--radius-xs/sm/md/lg/pill`
- Color: full palette including category tints `--cat-*-bg`, achievement gold, highlight warm
- Typography: `--font-2xs..--font-3xl`, `--font-display`, `--font-display-sm`, `--font-display-weight`, `--font` (system stack)
- Z-index: `--z-sticky` (10), `--z-header` (100), `--z-overlay` (350), `--z-modal` (500), `--z-toast` (700)
- Shadows: `--shadow-sm/md/lg`

If a value seems missing, raise it before adding a new token.
