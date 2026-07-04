// Equipment Library UI Module - core/ui/equipment-library-ui.js
// Gym-centric equipment management page

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { confirmSheet, promptSheet } from './confirm-sheet.js';
import { db, doc, updateDoc, arrayUnion, arrayRemove, deleteField, writeBatch } from '../data/firebase-config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { clearAllWorkoutsCache } from '../data/data-manager.js';
import { EQUIPMENT_CATALOG } from '../data/equipment-catalog.js';
import {
    loadEquipmentCatalog,
    resolveCatalogRef,
    augmentStaticCatalog,
    buildCatalogRef,
} from '../data/equipment-catalog-firestore.js';
import { getSessionLocation } from '../features/location-service.js';
import { reverseGeocode } from '../features/geocoding.js';
import { getExercisePRs } from '../features/pr-tracker.js';
import { findBestMatch } from '../data/fuzzy-match.js';
import { suggestExercisesForMachine } from '../features/machine-exercise-matcher.js';

let workoutManager = null;
let allEquipment = [];
let allLocations = [];        // user's saved gym locations (cached on open)
let currentLocationFilter = null;
let currentSearchTerm = '';

// Pocket Inventory redesign — three-tab IA on the Equipment Library landing.
// 'gyms'    : My gyms — gym cards + stat strip + orphan banner (default)
// 'library' : Library — body-part grouped compact rows (the existing personal list)
// 'catalog' : Catalog — global brand tile grid + popular-at-current-gym
let currentTab = 'gyms';

// Gym detail state — when non-null, renderEquipmentLibrary renders the gym
// detail view (body-part chips + grouped compact rows) instead of the tabs.
// `currentGymDetail` is { name, id } where id may be null for derived gyms
// (a gym name that only appears on equipment.locations[] with no doc).
let currentGymDetail = null;
let currentBpFilter = 'All';

// Brand catalog drill-down — { slug, name } when active, null otherwise.
// Renders inside the Catalog tab when set; back returns to the tab.
let currentBrandCatalog = null;

// Catalog tab search term (filters across all brands + machines). Persists
// across renders so toggling tabs doesn't drop the user's query.
let catalogSearchTerm = '';

// The Library tab is body-part grouped. (A legacy "By Brand" sub-view existed
// but was never surfaced in the redesigned UI; its dead render/toggle path was
// removed rather than carried forward.)

// Phase 6: scan-history state. unlinkedEquipment is populated lazily on the
// first library open (background scan); the review view rebuilds from it.
// dismissedUnlinked is per-session — names the user said "ignore" to. The
// banner hides automatically when (unlinked - dismissed) is empty.
let unlinkedEquipment = null;       // Map<name, {exercises, locations, count}> | null
const dismissedUnlinked = new Set(); // names dismissed this session
let scanReviewActive = false;       // when true, library shows the review list instead of the normal grid
// When set, the next openEquipmentLibrary() paint renders THIS equipment's
// detail instead of the list. Lets callers (e.g. quick-edit "Full details")
// route to a detail page without racing the list's async Firestore reads.
let _pendingDetailId = null;

/** Ask the library's next paint to open a specific equipment's detail page
 *  instead of the list. Race-free replacement for the old setTimeout guess. */
export function setPendingEquipmentDetail(id) {
    _pendingDetailId = id || null;
}

function getManager() {
    if (!workoutManager) workoutManager = new FirebaseWorkoutManager(AppState);
    return workoutManager;
}

// Equipment-type icons. The `color` field here is documentary — actual colors
// come from the .equip-row__icon--{type} modifier classes in equipment-library.css
// which read --equip-{type} tokens. Keep "Machine" for legacy data; v3 migration
// reclassifies most to Plate-Loaded / Selectorized via catalog match.
const EQUIPMENT_TYPE_ICONS = {
    'Plate-Loaded': { icon: 'fa-cog',           color: 'var(--equip-plate-loaded)' },
    Selectorized:   { icon: 'fa-th-list',       color: 'var(--equip-selectorized)' },
    Machine:        { icon: 'fa-cog',           color: 'var(--equip-machine)' },
    Cable:          { icon: 'fa-link',          color: 'var(--equip-cable)' },
    Barbell:        { icon: 'fa-dumbbell',      color: 'var(--equip-barbell)' },
    Dumbbell:       { icon: 'fa-dumbbell',      color: 'var(--equip-dumbbell)' },
    Bench:          { icon: 'fa-couch',         color: 'var(--equip-bench)' },
    Rack:           { icon: 'fa-border-all',    color: 'var(--equip-rack)' },
    Cardio:         { icon: 'fa-heartbeat',     color: 'var(--equip-cardio)' },
    Bodyweight:     { icon: 'fa-child',         color: 'var(--equip-bodyweight)' },
    Other:          { icon: 'fa-wrench',        color: 'var(--equip-other)' },
};

// Body part classification + display config
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

const BODY_PART_ORDER = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Multi-Use'];

/**
 * Classify an exercise name into a body part group.
 */
function classifyExerciseBodyPart(exerciseName) {
    const name = exerciseName.toLowerCase();
    if (/chest press|bench press|pec deck|pec fly|fly.*chest|incline press|decline press|push.?up|dips.*press|chest/.test(name)) return 'Chest';
    if (/row|lat pull|pull.?down|pull.?up|chin.?up|deadlift|back ext|reverse fly|shrug|face pull/.test(name)) return 'Back';
    if (/shoulder press|overhead press|military press|lateral raise|front raise|rear delt|arnold|upright row/.test(name)) return 'Shoulders';
    if (/curl|tricep|bicep|pushdown|skull crush|hammer curl|preacher|dip(?!.*press)|kickback|extension.*arm/.test(name)) return 'Arms';
    if (/squat|leg press|leg curl|leg ext|lunge|calf|glute|hip|hamstring|quad|romanian|hack squat|step.?up/.test(name)) return 'Legs';
    if (/ab|crunch|plank|sit.?up|core|oblique|wood.?chop|cable twist|russian twist|hanging leg/.test(name)) return 'Core';
    if (/treadmill|bike|elliptical|rower|run|sprint|stair|jump rope|cardio/.test(name)) return 'Cardio';
    return 'Multi-Use';
}

/**
 * Build Body Part → Exercise → Equipment[] hierarchy.
 * Inverts the equipment.exerciseTypes array to group by exercise first.
 */
function buildEquipmentHierarchy(equipment) {
    const exerciseToEquipment = {};
    for (const equip of equipment) {
        const exercises = equip.exerciseTypes || [];
        for (const exName of exercises) {
            if (!exerciseToEquipment[exName]) exerciseToEquipment[exName] = [];
            exerciseToEquipment[exName].push(equip);
        }
    }

    const hierarchy = {};
    for (const [exName, equips] of Object.entries(exerciseToEquipment)) {
        const bodyPart = classifyExerciseBodyPart(exName);
        if (!hierarchy[bodyPart]) hierarchy[bodyPart] = {};
        hierarchy[bodyPart][exName] = equips;
    }
    return hierarchy;
}

// ===================================================================
// EQUIPMENT LIST PAGE
// ===================================================================

export async function openEquipmentLibrary() {
    const section = document.getElementById('equipment-library-section');
    if (!section) return;

    section.classList.remove('hidden');
    scanReviewActive = false; // always land on the normal list, not the review view

    // Parallel-load equipment + locations + catalog so the My gyms tab has
    // everything it needs on first paint. Catalog has its own internal cache,
    // so the second call (if any) is a no-op.
    const [equipment, locations] = await Promise.all([
        getManager().getUserEquipment(),
        getManager().getUserLocations(),
    ]);
    allEquipment = equipment;
    allLocations = locations;
    // Cache for cross-module access (plate calculator, weight calculations)
    AppState._cachedEquipment = allEquipment;

    // Routed here to open a specific equipment's detail (e.g. quick-edit "Full
    // details")? Render it via this same async path so the list can never paint
    // over it — the equipment cache is already warm above, so no extra read.
    if (_pendingDetailId) {
        const id = _pendingDetailId;
        _pendingDetailId = null;
        await openEquipmentDetail(id);
        return;
    }

    // Catalog: prefer AppState (populated by app-init) but kick off a load if
    // it isn't there yet. Render immediately with augmented-static fallback.
    if (!AppState.equipmentCatalog) {
        loadEquipmentCatalog()
            .then((cat) => {
                AppState.equipmentCatalog = cat;
                renderEquipmentLibrary();
            })
            .catch((err) => console.error('Catalog load failed:', err));
    }

    renderEquipmentLibrary();

    // Background scan for workout-history equipment names that don't appear in
    // the library. Non-blocking — banner appears on the next render once the
    // scan completes.
    scanForUnlinkedEquipment().then(() => {
        if (!scanReviewActive) renderEquipmentLibrary();
    }).catch((err) => {
        console.error('❌ Equipment scan failed:', err);
    });
}

/**
 * Synchronous getter for the equipment catalog. Returns the Firestore-loaded
 * catalog if available; otherwise an in-memory augmentation of the static
 * fallback so My gyms / Catalog rendering never has to wait.
 */
function getCatalogSync() {
    return AppState.equipmentCatalog || augmentStaticCatalog(EQUIPMENT_CATALOG);
}

/**
 * Phase 6 — scan workout history for equipment name strings that don't match
 * any record in the user's equipment library. Stores results in module-scoped
 * `unlinkedEquipment` for the banner + review view to render.
 *
 * Names are compared after normalization (lowercase, collapsed whitespace) so
 * trivial casing differences don't trigger false positives.
 */
async function scanForUnlinkedEquipment() {
    const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // Build the "known" set from EVERY identity string an equipment record
    // exposes: display name, function alone (catalog-promoted equipment's
    // canonical link value is often just the function), and every alias
    // the user has attached via prior link operations. Without alias +
    // function awareness, successfully-linked orphans re-appeared on the
    // next scan because linkOrphanToSuggestion rewrites workout equipment
    // to `equipment.function || equipment.name` — which didn't match the
    // scan's name-only lookup for records where those differ (e.g., Pec
    // Deck with name "Hammer Strength Select — Pec Deck" and function
    // "Pec Deck"). The user was stuck in a link-then-reappear loop.
    const knownNorm = new Set();
    for (const e of allEquipment || []) {
        if (e.name) knownNorm.add(norm(e.name));
        if (e.function) knownNorm.add(norm(e.function));
        for (const alias of e.aliases || []) {
            if (alias) knownNorm.add(norm(alias));
        }
    }
    const workouts = await getManager().getUserWorkouts();
    const found = new Map();

    for (const w of workouts) {
        const exercises = w.exercises || {};
        for (const key of Object.keys(exercises)) {
            const ex = exercises[key];
            const equipName = ex?.equipment;
            if (!equipName) continue;
            if (knownNorm.has(norm(equipName))) continue;

            if (!found.has(equipName)) {
                found.set(equipName, {
                    // Map of exerciseName → usage count so we can show the
                    // user where each orphan was actually used (most-used
                    // first). Multiple exercise names can share an orphan
                    // when the user renamed across sessions.
                    exerciseCounts: new Map(),
                    locations: new Set(),
                    lastDate: null,
                    lastWorkoutId: null,   // for the "View last session" link
                    lastSets: null,        // sample sets from the most recent session
                    count: 0,
                });
            }
            const entry = found.get(equipName);
            const exName = ex.name || ex.machine;
            if (exName) {
                entry.exerciseCounts.set(exName, (entry.exerciseCounts.get(exName) || 0) + 1);
            }
            if (w.location) entry.locations.add(w.location);
            if (w.date && (!entry.lastDate || w.date > entry.lastDate)) {
                entry.lastDate = w.date;
                entry.lastWorkoutId = w.id;
                // Snapshot up to 3 sets from this exercise on the most
                // recent session — concrete numbers help the user recall
                // what machine they were actually using.
                const sets = (ex.sets || [])
                    .filter(s => s && (s.reps || s.weight))
                    .slice(0, 3)
                    .map(s => `${s.reps || '?'}×${s.weight || 'BW'}${s.weight && s.originalUnit ? ` ${s.originalUnit}` : ''}`);
                entry.lastSets = sets.length > 0 ? sets.join(' · ') : null;
            }
            entry.count++;
        }
    }

    unlinkedEquipment = found;
}

function getUnlinkedActive() {
    if (!unlinkedEquipment) return [];
    return [...unlinkedEquipment.entries()]
        .filter(([name]) => !dismissedUnlinked.has(name))
        .map(([name, meta]) => ({ name, ...meta }));
}

/** Switch the library content area to the scan review list. */
export function reviewDiscoveredEquipment() {
    scanReviewActive = true;
    renderEquipmentLibrary();
}

/** Render the review list — one row per unlinked name with Add / Link / Skip. */
function renderScanReview() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    const items = getUnlinkedActive();
    // Compute fuzzy-match suggestions once per render. Threshold 0.6 to surface
    // a suggestion; 0.85 is the auto-link confidence floor (matches handoff).
    const itemsWithSuggestions = items.map((item) => ({
        ...item,
        suggestion: findBestSuggestion(item.name, allEquipment, 0.6),
    }));
    const autoLinkable = itemsWithSuggestions.filter((it) => it.suggestion && it.suggestion.score >= 0.85);

    // Rewrite the page header for the review view (back + title + Auto-link).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        const subtitle = `${items.length} orphan name${items.length !== 1 ? 's' : ''} · ${items.reduce((s, i) => s + i.count, 0)} sessions affected`;
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="exitScanReview()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title-block">
                    <div class="page-header__title">Reconcile history</div>
                    <div class="page-header__subtitle">${escapeHtml(subtitle)}</div>
                </div>
            </div>
            ${autoLinkable.length > 0 ? `
                <button class="page-header__save" onclick="autoLinkAllOrphans()">
                    Auto-link ${autoLinkable.length}
                </button>
            ` : ''}
        `;
        staticHeader.dataset.mutated = '1';
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state-compact">
                <i class="fas fa-check-circle"></i>
                <p>All caught up</p>
                <p class="empty-state-hint">Every machine in your workout history is in the library.</p>
            </div>
        `;
        return;
    }

    const rowsHTML = itemsWithSuggestions.map((item) => {
        // exerciseCounts is a Map<name, count> from scanForUnlinkedEquipment;
        // sort most-used first so the user sees the dominant exercise.
        const exerciseEntries = item.exerciseCounts
            ? [...item.exerciseCounts.entries()].sort((a, b) => b[1] - a[1])
            : [];
        const locationStr = [...item.locations].join(', ');
        const metaParts = [
            `${item.count} session${item.count !== 1 ? 's' : ''}`,
            item.lastDate ? `last ${relativeTime(item.lastDate)}` : null,
            locationStr,
        ].filter(Boolean).join(' · ');

        // Most-used exercise gets the "primary" treatment with its session
        // count — secondary exercises follow as small chips. This is what
        // the user actually needs to identify the orphan: "oh right, that's
        // the cable I used for 4 face pull sessions".
        const exercisesHTML = exerciseEntries.length > 0
            ? `<div class="scan-review-row__exercises">
                    <i class="fas fa-dumbbell"></i>
                    <span class="scan-review-row__exercise-primary">${escapeHtml(exerciseEntries[0][0])}</span>
                    <span class="scan-review-row__exercise-count">×${exerciseEntries[0][1]}</span>
                    ${exerciseEntries.slice(1).map(([n, c]) => `
                        <span class="scan-review-row__exercise-chip">${escapeHtml(n)} ×${c}</span>
                    `).join('')}
                </div>`
            : `<div class="scan-review-row__exercises scan-review-row__exercises--empty">
                    <i class="fas fa-question-circle"></i>
                    <span>No exercise name recorded for this equipment in any session</span>
                </div>`;

        // Sample sets from the most recent session help concretize the
        // identity — concrete numbers like "10×135 lbs" make it easy to
        // remember which machine.
        const lastSetsHTML = item.lastSets
            ? `<div class="scan-review-row__sets">
                    <i class="fas fa-history"></i>
                    <span>${escapeHtml(item.lastSets)}</span>
                </div>`
            : '';

        // Primary action: Link-to-suggestion when present; otherwise plain Link
        // which opens the manual picker. Add and Skip are always available.
        const hasSuggestion = !!item.suggestion;
        const primaryAction = hasSuggestion
            ? `<button class="btn btn-primary btn-small" onclick="linkOrphanToSuggestion('${escapeAttr(item.name)}', '${escapeAttr(item.suggestion.id)}')">
                   <i class="fas fa-link"></i> Link
               </button>`
            : `<button class="btn btn-primary btn-small" onclick="openManualLinkPicker('${escapeAttr(item.name)}')">
                   <i class="fas fa-link"></i> Link…
               </button>`;

        // Secondary "Other…" only meaningful when a suggestion exists (lets
        // user override the auto-match with a manually-picked target).
        const otherAction = hasSuggestion ? `
            <button class="btn btn-text btn-small" onclick="openManualLinkPicker('${escapeAttr(item.name)}')">Other…</button>
        ` : '';

        const suggestionPreview = hasSuggestion ? `
            <div class="scan-review-row__suggest">
                <i class="fas fa-wand-magic-sparkles"></i>
                <span class="scan-review-row__suggest-name">→ ${escapeHtml(item.suggestion.name)}</span>
                <span class="scan-review-row__suggest-score">${Math.round(item.suggestion.score * 100)}%</span>
            </div>
        ` : '';

        return `
            <div class="scan-review-row">
                <div class="scan-review-row__info">
                    <div class="scan-review-row__name">"${escapeHtml(item.name)}"</div>
                    ${exercisesHTML}
                    ${lastSetsHTML}
                    <div class="scan-review-row__meta">${escapeHtml(metaParts)}</div>
                    ${suggestionPreview}
                </div>
                <div class="scan-review-row__actions">
                    ${primaryAction}
                    ${otherAction}
                    <button class="btn btn-text btn-small" onclick="addUnlinkedEquipment('${escapeAttr(item.name)}')">Add new</button>
                    <button class="btn btn-text btn-small" onclick="dismissUnlinkedEquipment('${escapeAttr(item.name)}')">Skip</button>
                    <button class="btn btn-text btn-small scan-review-row__delete" onclick="deleteOrphanFromHistory('${escapeAttr(item.name)}')" aria-label="Delete from history"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="scan-review">
            <div class="scan-review__hint">
                These equipment names appear in your workout history but aren't in your library.
                <strong>Link</strong> maps an orphan name to an existing machine and rewrites past sessions. <strong>Add</strong> creates a new entry. <strong>Skip</strong> ignores it for this session.
            </div>
            <div class="scan-review__list">${rowsHTML}</div>
        </div>
    `;
}

/**
 * Find the best library-match suggestion for an orphan name. Wraps the generic
 * `findBestMatch` from fuzzy-match.js with the equipment-record shape.
 */
function findBestSuggestion(orphanName, equipment, threshold) {
    if (!Array.isArray(equipment)) return null;
    const candidates = equipment.map((eq) => ({ ...eq, name: eq.function || eq.name }));
    const best = findBestMatch(orphanName, candidates, threshold);
    if (!best) return null;
    return { id: best.candidate.id, name: best.candidate.name, score: best.score };
}

/**
 * Link an orphan name to an existing equipment record. Adds the orphan as an
 * alias on the equipment doc AND rewrites workout history (exercise.equipment
 * string) so historical sessions correctly reference the canonical name.
 *
 * Batched: Firestore batch can hold 500 writes — chunks accordingly.
 */
export async function linkOrphanToSuggestion(orphanName, equipmentId) {
    try {
        const equipment = allEquipment.find((e) => e.id === equipmentId);
        if (!equipment) throw new Error(`Equipment ${equipmentId} not found`);

        const userId = AppState.currentUser.uid;
        const canonicalName = equipment.function || equipment.name;

        // 1. Add the orphan as an alias on the equipment doc
        const aliases = Array.isArray(equipment.aliases) ? [...equipment.aliases] : [];
        if (!aliases.includes(orphanName)) aliases.push(orphanName);
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { aliases });

        // 2. Rewrite workout history — for every workout that references the
        // orphan name in exercise.equipment, swap to canonicalName. Batched.
        const workouts = await getManager().getUserWorkouts();
        const affected = workouts.filter((w) => {
            const exs = w.exercises || {};
            return Object.keys(exs).some((k) => exs[k]?.equipment === orphanName);
        });

        // Firestore batch limit is 500; chunk safely. Track how many commits
        // actually landed — a mid-sequence failure used to leave history
        // half-migrated behind a success-looking toast. The operation is
        // re-runnable: rewritten workouts drop out of the `affected` filter,
        // so running the link again finishes only the remainder.
        const CHUNK = 400;
        let rewritten = 0;
        let batchError = null;
        try {
            for (let i = 0; i < affected.length; i += CHUNK) {
                const chunk = affected.slice(i, i + CHUNK);
                const batch = writeBatch(db);
                for (const w of chunk) {
                    const exs = { ...(w.exercises || {}) };
                    let touched = false;
                    for (const k of Object.keys(exs)) {
                        if (exs[k]?.equipment === orphanName) {
                            exs[k] = { ...exs[k], equipment: canonicalName };
                            touched = true;
                        }
                    }
                    if (touched) {
                        batch.set(doc(db, 'users', userId, 'workouts', w.id), { ...w, exercises: exs, lastUpdated: new Date().toISOString() });
                    }
                }
                await batch.commit();
                rewritten += chunk.length;
            }
        } catch (err) {
            batchError = err;
            console.error('❌ Orphan-link batch failed mid-sequence:', err);
        }
        // Rewrote workout docs — downstream loadAllWorkouts consumers (dashboard,
        // history) must not serve the pre-rewrite cache for the next 5 minutes.
        if (rewritten > 0) clearAllWorkoutsCache();

        // 3. Refresh state
        allEquipment = await getManager().getUserEquipment();
        AppState._cachedEquipment = allEquipment;
        if (batchError) {
            showNotification(
                `Linked "${orphanName}" — updated ${rewritten} of ${affected.length} sessions. Link again to finish the rest`,
                'warning'
            );
        } else {
            if (unlinkedEquipment) unlinkedEquipment.delete(orphanName);
            showNotification(`Linked "${orphanName}" to ${canonicalName} · ${affected.length} session${affected.length !== 1 ? 's' : ''} updated`, 'success');
        }
        renderEquipmentLibrary();
    } catch (err) {
        console.error('❌ Link failed:', err);
        showNotification(`Couldn't link — try again`, 'error');
    }
}

// ===================================================================
// MANUAL LINK PICKER — pick a library equipment to link an orphan to
// ===================================================================
let manualLinkState = null; // { orphanName, search }

/**
 * Open the manual link picker for an orphan. Lists all of the user's library
 * equipment (search-filterable). Tapping one commits the link.
 */
export function openManualLinkPicker(orphanName) {
    if (!orphanName) return;
    manualLinkState = { orphanName, search: '' };
    renderManualLinkSheet();
}

function renderManualLinkSheet() {
    closeManualLinkSheetImmediate();
    if (!manualLinkState) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'mlp-sheet-backdrop';
    backdrop.onclick = () => closeManualLinkPicker();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'mlp-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Link to existing</div>
            <div class="aw-sheet__subtitle">Map "${escapeHtml(manualLinkState.orphanName)}" to a machine in your library</div>
        </div>
        <div class="aw-sheet__body" id="mlp-sheet-body">${renderManualLinkBody()}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="closeManualLinkPicker()">Cancel</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
        const input = document.getElementById('mlp-search-input');
        if (input) input.focus();
    });
}

function renderManualLinkBody() {
    if (!manualLinkState) return '';
    const term = manualLinkState.search.trim().toLowerCase();

    let filtered = allEquipment;
    if (term) {
        filtered = filtered.filter((eq) =>
            (eq.name || '').toLowerCase().includes(term) ||
            (eq.function || '').toLowerCase().includes(term) ||
            (eq.brand || '').toLowerCase().includes(term) ||
            (eq.line || '').toLowerCase().includes(term)
        );
    }

    // Sort by best-similarity to orphan name (most likely match first)
    const orphan = manualLinkState.orphanName;
    filtered = [...filtered].sort((a, b) => {
        const sa = findBestMatch(orphan, [{ name: a.function || a.name }], 0)?.score || 0;
        const sb = findBestMatch(orphan, [{ name: b.function || b.name }], 0)?.score || 0;
        return sb - sa;
    });

    const searchHTML = `
        <div class="qa-sheet__search">
            <input type="text" id="mlp-search-input"
                   class="qa-sheet__search-input"
                   placeholder="Search your library…"
                   value="${escapeAttr(manualLinkState.search)}"
                   oninput="setManualLinkSearch(this.value)">
            <span class="qa-sheet__result-count">${filtered.length} result${filtered.length !== 1 ? 's' : ''}</span>
        </div>
    `;

    if (filtered.length === 0) {
        return searchHTML + `<div class="qa-sheet__empty">No matches in your library.</div>`;
    }

    const rowsHTML = filtered.map((eq) => {
        const type = eq.equipmentType || 'Other';
        const typeInfo = EQUIPMENT_TYPE_ICONS[type] || EQUIPMENT_TYPE_ICONS.Other;
        const typeColorClass = `equip-row__icon--${slugType(type)}`;
        const displayName = eq.function || eq.name;
        const subtitleParts = [eq.brand, eq.line].filter(Boolean).join(' · ');
        const score = findBestMatch(orphan, [{ name: displayName }], 0)?.score || 0;
        const scoreBadge = score >= 0.5 ? `<span class="mlp-row__score">${Math.round(score * 100)}%</span>` : '';
        return `
            <div class="qa-row" onclick="selectManualLinkTarget('${escapeAttr(eq.id)}')"
                 role="button">
                <span></span>
                <span class="qa-row__icon ${typeColorClass}"><i class="fas ${typeInfo.icon}"></i></span>
                <div class="qa-row__info">
                    <div class="qa-row__name">${escapeHtml(displayName)}</div>
                    <div class="qa-row__meta">${escapeHtml(subtitleParts || type)}</div>
                </div>
                ${scoreBadge}
            </div>
        `;
    }).join('');

    return searchHTML + rowsHTML;
}

export function setManualLinkSearch(term) {
    if (!manualLinkState) return;
    manualLinkState.search = term;
    const body = document.getElementById('mlp-sheet-body');
    if (!body) return;
    const focused = document.activeElement;
    const isSearchFocused = focused?.id === 'mlp-search-input';
    const caret = isSearchFocused ? focused.selectionStart : null;
    body.innerHTML = renderManualLinkBody();
    if (isSearchFocused) {
        const input = document.getElementById('mlp-search-input');
        if (input) {
            input.focus();
            if (caret !== null) {
                try { input.setSelectionRange(caret, caret); } catch { /* ignore */ }
            }
        }
    }
}

/**
 * Commit a manually-picked link. Same backend operation as the suggested
 * link path — adds the alias + rewrites workout history.
 */
export async function selectManualLinkTarget(equipmentId) {
    if (!manualLinkState) return;
    const orphan = manualLinkState.orphanName;
    closeManualLinkPicker();
    // Reuse the same link routine
    await linkOrphanToSuggestion(orphan, equipmentId);
}

export function closeManualLinkPicker() {
    const backdrop = document.getElementById('mlp-sheet-backdrop');
    const sheet = document.getElementById('mlp-sheet');
    if (backdrop) backdrop.classList.remove('visible');
    if (sheet) sheet.classList.remove('visible');
    setTimeout(() => closeManualLinkSheetImmediate(), 300);
    manualLinkState = null;
}

function closeManualLinkSheetImmediate() {
    const backdrop = document.getElementById('mlp-sheet-backdrop');
    const sheet = document.getElementById('mlp-sheet');
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
}

/**
 * Auto-link every orphan whose suggestion score is ≥ 0.85. Sequential so we
 * surface partial progress + can abort cleanly on error.
 */
export async function autoLinkAllOrphans() {
    const items = getUnlinkedActive().map((it) => ({
        ...it,
        suggestion: findBestSuggestion(it.name, allEquipment, 0.6),
    }));
    const targets = items.filter((it) => it.suggestion && it.suggestion.score >= 0.85);

    if (targets.length === 0) {
        showNotification('No high-confidence matches to auto-link', 'info');
        return;
    }

    const confirmed = await confirmSheet({
        title: `Auto-link ${targets.length} orphan${targets.length !== 1 ? 's' : ''}?`,
        message: 'Only matches with at least 85% confidence get linked.',
        confirmLabel: 'Auto-link',
    });
    if (!confirmed) return;

    for (const t of targets) {
        await linkOrphanToSuggestion(t.name, t.suggestion.id);
    }
}

// Expose findBestSuggestion (the equipment-shape wrapper) for tests in the
// rare case they need the UI-layer adapter; the underlying pure scorer
// (`diceSimilarity`) is tested directly via `data/fuzzy-match.js`.
export const __scanInternals = { findBestSuggestion };

/** Exit the review view and return to the normal library list. */
export function exitScanReview() {
    scanReviewActive = false;
    // Restore the standard page header
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Equipment</div>
            </div>
            <button class="page-header__save" onclick="showAddEquipmentFlow()">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
    }
    renderEquipmentLibrary();
}

/** Create an equipment doc for a discovered name, then refresh + remove from list. */
export async function addUnlinkedEquipment(name) {
    try {
        const result = await getManager().getOrCreateEquipment(name);
        if (result) {
            // Re-read library so the new doc shows up everywhere
            allEquipment = await getManager().getUserEquipment();
            AppState._cachedEquipment = allEquipment;
            // Drop from the unlinked map (now linked) — also rescan in case more changed
            if (unlinkedEquipment) unlinkedEquipment.delete(name);
            showNotification(`${name} added to library`, 'success', 1500);
            renderEquipmentLibrary();
        }
    } catch (err) {
        console.error('❌ Failed to add unlinked equipment:', err);
        showNotification("Couldn't add equipment", 'error');
    }
}

/** Hide the row for this session. Doesn't persist (next session re-prompts). */
export function dismissUnlinkedEquipment(name) {
    dismissedUnlinked.add(name);
    if (getUnlinkedActive().length === 0) {
        // Auto-exit review when nothing remains
        exitScanReview();
    } else {
        renderEquipmentLibrary();
    }
}

/**
 * Permanently strip an orphan equipment name from workout history. Useful when
 * the user has typo / duplicate / test-data names they never want to map.
 * Walks every workout that referenced the orphan and clears the `equipment`
 * field on those exercises; the workout itself stays so set/rep data isn't lost.
 */
export async function deleteOrphanFromHistory(orphanName) {
    if (!orphanName) return;
    const sessionCount = unlinkedEquipment?.get(orphanName)?.count || 0;
    const confirmed = await confirmSheet({
        title: `Delete "${orphanName}" from ${sessionCount} workout session${sessionCount !== 1 ? 's' : ''}?`,
        message: 'This clears the equipment label only — your sets and reps stay intact.',
        confirmLabel: 'Delete label',
        cancelLabel: 'Keep label',
        destructive: true,
    });
    if (!confirmed) {
        return;
    }
    try {
        const userId = AppState.currentUser.uid;
        const workouts = await getManager().getUserWorkouts();
        const affected = workouts.filter((w) => {
            const exs = w.exercises || {};
            return Object.keys(exs).some((k) => exs[k]?.equipment === orphanName);
        });

        const CHUNK = 400;
        for (let i = 0; i < affected.length; i += CHUNK) {
            const batch = writeBatch(db);
            for (const w of affected.slice(i, i + CHUNK)) {
                const exs = { ...(w.exercises || {}) };
                let touched = false;
                for (const k of Object.keys(exs)) {
                    if (exs[k]?.equipment === orphanName) {
                        const { equipment, ...rest } = exs[k];
                        exs[k] = rest;
                        touched = true;
                    }
                }
                if (touched) {
                    batch.set(
                        doc(db, 'users', userId, 'workouts', w.id),
                        { ...w, exercises: exs, lastUpdated: new Date().toISOString() }
                    );
                }
            }
            await batch.commit();
        }
        if (affected.length > 0) clearAllWorkoutsCache();

        if (unlinkedEquipment) unlinkedEquipment.delete(orphanName);
        showNotification(`Removed "${orphanName}" from ${affected.length} workout${affected.length !== 1 ? 's' : ''}`, 'success', 2000);
        if (getUnlinkedActive().length === 0) {
            exitScanReview();
        } else {
            renderEquipmentLibrary();
        }
    } catch (err) {
        console.error('❌ Failed to delete orphan from history:', err);
        showNotification("Couldn't delete orphan — try again", 'error');
    }
}

function renderEquipmentLibrary() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Phase 6: when the user is in the review view, render that instead of the list.
    if (scanReviewActive) {
        renderScanReview();
        return;
    }

    // Gym detail view (Phase 1 step 6) — drilled-down view of one gym.
    if (currentGymDetail) {
        renderGymDetail(container);
        return;
    }

    // Brand catalog drill-down — invoked from the Catalog tab.
    if (currentBrandCatalog) {
        renderBrandCatalog(container);
        return;
    }

    // Ensure the static page-header is restored if we just exited a sub-view.
    restoreLibraryHeader();

    // Pocket Inventory IA: compact tabs across the top, content per tab.
    const tabsHTML = renderCompactTabs();
    let tabBody;
    if (currentTab === 'gyms') {
        tabBody = renderMyGymsTab();
    } else if (currentTab === 'catalog') {
        tabBody = renderCatalogTab();
    } else {
        tabBody = renderLibraryTab();
    }

    container.innerHTML = tabsHTML + tabBody;

    // Post-render: walk mix segments to set their flexGrow from the data
    // attribute, avoiding inline `style=` (design audit constraint).
    applyGymMixBarFlex(container);
}

/**
 * Restore the static page-header to its index.html state. Used when exiting
 * the gym detail view back to the tabs.
 */
function restoreLibraryHeader() {
    const section = document.getElementById('equipment-library-section');
    const header = section?.querySelector('.page-header');
    if (!header || header.dataset.mutated !== '1') return;
    header.innerHTML = `
        <div class="page-header__left">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="page-header__title">Equipment</div>
        </div>
        <button class="page-header__save" onclick="showAddEquipmentFlow()" aria-label="Add equipment">
            <i class="fas fa-plus"></i> Add equipment
        </button>
    `;
    delete header.dataset.mutated;
}

/**
 * Render the gym detail screen: page header (back + gym name + "+ Add"),
 * body-part chip strip, grouped compact rows of equipment at this gym.
 */
function renderGymDetail(container) {
    const { name, id } = currentGymDetail;
    const items = gatherGymEquipment(name, id);

    // Page header mutation: back button returns to My gyms tab; Add button
    // will open the Quick-add sheet (Phase 2 step 7). Until then it's a stub.
    const section = document.getElementById('equipment-library-section');
    const header = section?.querySelector('.page-header');
    if (header) {
        const machineCount = items.length;
        const brandSet = new Set();
        items.forEach((it) => { if (it.brand) brandSet.add(it.brand); });
        const lastVisit = currentGymDetail.lastVisit
            ? `· ${relativeTime(currentGymDetail.lastVisit)}`
            : '';
        const subtitle = `${machineCount} machine${machineCount !== 1 ? 's' : ''} · ${brandSet.size} brand${brandSet.size !== 1 ? 's' : ''} ${lastVisit}`.trim();
        header.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeGymDetail()" aria-label="Back to My gyms">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title-block">
                    <div class="page-header__title">${escapeHtml(name)}</div>
                    <div class="page-header__subtitle">${escapeHtml(subtitle)}</div>
                </div>
            </div>
            <button class="page-header__save" onclick="openQuickAddSheet('${escapeAttr(name)}')" aria-label="Add equipment from catalog">
                <i class="fas fa-plus"></i> Add from catalog
            </button>
        `;
        header.dataset.mutated = '1';
    }

    // Body-part chip strip — counts per body part across this gym's items.
    const bpCounts = countByBodyPart(items);
    const bpChips = ['All', ...BODY_PART_ORDER].filter((bp) => bp === 'All' || bpCounts[bp]);
    const chipStripHTML = `
        <div class="chips gym-detail__chips">
            ${bpChips.map((bp) => {
                const isActive = currentBpFilter === bp;
                const count = bp === 'All' ? items.length : (bpCounts[bp] || 0);
                return `
                    <button class="chip${isActive ? ' active' : ''}"
                            onclick="setGymBpFilter('${escapeAttr(bp)}')"
                            aria-pressed="${isActive}">
                        ${escapeHtml(bp)}
                        <span class="chip__count">${count}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    // Apply body-part filter
    const filtered = currentBpFilter === 'All'
        ? items
        : items.filter((it) => (it.bodyPart || 'Multi-Use') === currentBpFilter);

    // Empty state when filter yields nothing. The all-filter blank slate is
    // the make-or-break moment for a new gym — give it real starting points
    // (catalog quick-add, clone another gym) instead of a bare hint.
    if (filtered.length === 0) {
        const isAllEmpty = currentBpFilter === 'All';
        const sourceGyms = isAllEmpty ? gymsWithEquipment(name) : [];
        container.innerHTML = chipStripHTML + `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>${isAllEmpty ? 'No equipment yet' : `No equipment for ${currentBpFilter} yet`}</p>
                <p class="empty-state-hint">${isAllEmpty ? 'Add machines as you use them, or start from another gym.' : 'Try another body part or add more equipment'}</p>
                ${isAllEmpty ? `
                    <div class="empty-state-actions">
                        <button class="btn btn-primary btn-small" onclick="openQuickAddSheet('${escapeAttr(name)}')">
                            <i class="fas fa-plus"></i> Add from catalog
                        </button>
                        ${sourceGyms.length > 0 ? `
                            <button class="btn btn-secondary btn-small" onclick="openCopyFromGymSheet('${escapeAttr(name)}')">
                                <i class="fas fa-copy"></i> Copy from another gym
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        return;
    }

    // Group by body part for rendering
    const grouped = new Map();
    for (const it of filtered) {
        const bp = it.bodyPart || 'Multi-Use';
        if (!grouped.has(bp)) grouped.set(bp, []);
        grouped.get(bp).push(it);
    }
    const orderedBPs = BODY_PART_ORDER.filter((bp) => grouped.has(bp));

    const groupsHTML = orderedBPs.map((bp) => {
        const config = BODY_PART_CONFIG[bp] || BODY_PART_CONFIG['Multi-Use'];
        const rows = grouped.get(bp).map(renderGymDetailRow).join('');
        return `
            <div class="gym-detail__group-header">
                <i class="${config.icon}"></i>
                <span class="gym-detail__group-name">${escapeHtml(bp)}</span>
                <span class="gym-detail__group-count">${grouped.get(bp).length}</span>
            </div>
            ${rows}
        `;
    }).join('');

    container.innerHTML = chipStripHTML + `<div class="equip-lib-list">${groupsHTML}</div>`;
}

/**
 * Render a single compact row for the gym detail page. Uses the 4-column grid
 * (icon | info | type-pill | last-used) from .equip-row--compact.
 */
function renderGymDetailRow(item) {
    const typeInfo = EQUIPMENT_TYPE_ICONS[item.type] || EQUIPMENT_TYPE_ICONS.Other;
    const typeColorClass = `equip-row__icon--${slugType(item.type)}`;
    const metaParts = [item.brand, item.line].filter(Boolean).join(' · ');
    const onclickRef = item.source === 'legacy'
        ? `openEquipmentDetail('${escapeAttr(item.id)}')`
        : `openCatalogMachine('${escapeAttr(item.id)}')`;
    return `
        <div class="equip-row equip-row--compact" onclick="${onclickRef}">
            <div class="equip-row__icon ${typeColorClass}">
                <i class="fas ${typeInfo.icon}"></i>
            </div>
            <div class="equip-row__info">
                <div class="equip-row__name">${escapeHtml(item.name)}</div>
                ${metaParts ? `<div class="equip-row__meta">${escapeHtml(metaParts)}</div>` : ''}
            </div>
            <span class="equip-row__type-pill ${typeColorClass}">${escapeHtml(item.type || 'Other')}</span>
            <span class="equip-row__last">${item.lastUsed ? relativeTime(item.lastUsed) : ''}</span>
        </div>
    `;
}

/**
 * Build the unified item list for a gym (legacy equipment.locations[] + new
 * location.equipment[] catalog refs). Normalized to a single shape so the
 * renderer doesn't care about the source. Deduped across BOTH sources so a
 * machine that exists both as a legacy record and as a catalog ref only
 * appears once (legacy wins because it carries richer per-user data —
 * baseWeight, notes, exerciseTypes). Stale duplicate catalog refs (from
 * before the addLocationEquipment transaction landed) are also collapsed.
 */
function gatherGymEquipment(gymName, locationId) {
    const catalog = getCatalogSync();
    const items = [];
    // Tracks identity keys we've already emitted so we don't double-render.
    // Identity = catalogRef when known, otherwise normalized name.
    const seen = new Set();
    const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // Legacy first — these carry per-user data (baseWeight, notes, etc.) so
    // we want them to win when they overlap with a catalog ref.
    for (const eq of allEquipment) {
        if (!(eq.locations || []).includes(gymName)) continue;
        const fnName = eq.function || eq.name || '—';
        const key = `legacy:${norm(fnName)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // If the legacy record resolves to a known catalog ref, also reserve
        // that slot so the catalog half of the union doesn't re-emit it.
        if (eq.brand && eq.line && fnName) {
            const ref = buildCatalogRef(eq.brand, eq.line, fnName);
            if (ref) seen.add(`catalog:${ref}`);
        }
        items.push({
            id: eq.id,
            name: fnName,
            brand: eq.brand && eq.brand !== 'Unknown' ? eq.brand : null,
            line: eq.line || null,
            type: eq.equipmentType || 'Other',
            bodyPart: inferBodyPartFromEquipment(eq),
            lastUsed: eq.lastUsed || null,
            source: 'legacy',
        });
    }

    // New: catalog refs on the location doc. Dedupe by catalogRef so stale
    // pre-transaction-fix dupes collapse to a single row at render time.
    const loc = locationId ? allLocations.find((l) => l.id === locationId) : null;
    const catalogRefs = (loc && Array.isArray(loc.equipment)) ? loc.equipment : [];
    for (const ref of catalogRefs) {
        if (!ref || !ref.catalogRef) continue;
        const key = `catalog:${ref.catalogRef}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const resolved = resolveCatalogRef(ref.catalogRef, catalog);
        if (!resolved) continue;
        const { brand, line, machine } = resolved;
        // Also reserve the legacy slot so a future legacy entry with the same
        // name doesn't double-render alongside this one.
        seen.add(`legacy:${norm(machine.name)}`);
        items.push({
            id: ref.catalogRef,
            name: ref.nickname || machine.name,
            brand: brand.name,
            line: line.name,
            type: machine.type || line.type || 'Other',
            bodyPart: machine.bodyPart || 'Multi-Use',
            lastUsed: null, // catalog refs don't track use directly yet
            source: 'catalog',
        });
    }

    // If the location doc had stale duplicate catalogRefs, schedule a one-shot
    // self-healing write — collapse the array on disk so the data eventually
    // matches what the UI shows. Fire-and-forget; the read path already
    // dedupes so the user doesn't have to wait.
    if (loc && catalogRefs.length > 0) {
        const uniqueRefs = [];
        const seenRefs = new Set();
        for (const r of catalogRefs) {
            if (!r?.catalogRef || seenRefs.has(r.catalogRef)) continue;
            seenRefs.add(r.catalogRef);
            uniqueRefs.push(r);
        }
        if (uniqueRefs.length < catalogRefs.length) {
            const dupeCount = catalogRefs.length - uniqueRefs.length;
            healDuplicateLocationEquipment(loc.id, uniqueRefs);
            // Silent self-report: healing kicks in — this is our chance to
            // measure whether the write-side deduper is receding or still
            // getting fed dupes. Same pattern as the more-menu detector:
            // captureWarning → errorLogs → visible in bug log. Fire once
            // per healing invocation (which is already gated by
            // _healingLocations to one-per-location per lifecycle).
            (async () => {
                try {
                    const { captureWarning } = await import('../utils/error-handler.js');
                    // Count occurrences per catalogRef so we can see whether
                    // it's "one ref repeated N times" or "N refs each dupe'd
                    // once" — those hint at different write-side causes.
                    const refCounts = {};
                    for (const r of catalogRefs) {
                        if (!r?.catalogRef) continue;
                        refCounts[r.catalogRef] = (refCounts[r.catalogRef] || 0) + 1;
                    }
                    const worst = Object.entries(refCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([ref, count]) => ({ ref, count }));
                    captureWarning(
                        `Gym equipment healing: ${dupeCount} duplicate catalogRef(s) at "${gymName}"`,
                        'gatherGymEquipment',
                        {
                            gymName,
                            locationId: loc.id,
                            totalRefsBefore: catalogRefs.length,
                            totalRefsAfter: uniqueRefs.length,
                            duplicatesRemoved: dupeCount,
                            uniqueCatalogRefs: uniqueRefs.length,
                            worstOffenders: worst,
                        }
                    );
                } catch { /* diagnostic must never break render */ }
            })();
        }

        // Promote each catalog ref to a legacy equipment record so it shows
        // up in the active-workout picker, search, and every other surface
        // that reads from users/{uid}/equipment. Fire-and-forget — the gym
        // view already shows them via the dedup, and once promoted the rest
        // of the app picks them up on next read.
        migrateLocationCatalogRefs(loc.id, gymName);
    }

    // Sort within each body part: brand → name
    items.sort((a, b) => {
        const bpCmp = (a.bodyPart || '').localeCompare(b.bodyPart || '');
        if (bpCmp !== 0) return bpCmp;
        const brCmp = (a.brand || '').localeCompare(b.brand || '');
        if (brCmp !== 0) return brCmp;
        return a.name.localeCompare(b.name);
    });

    return items;
}

// Track healing writes in-flight so we don't fire multiple times for the
// same location during a rapid re-render cascade.
const _healingLocations = new Set();

async function healDuplicateLocationEquipment(locationId, deduped) {
    if (_healingLocations.has(locationId)) return;
    _healingLocations.add(locationId);
    try {
        const userId = AppState.currentUser?.uid;
        if (!userId) return;
        await updateDoc(doc(db, 'users', userId, 'locations', locationId), {
            equipment: deduped,
        });
        // Refresh the cached locations so the next render reads the cleaned
        // value (preserves the UI dedup either way, but avoids re-firing).
        const loc = allLocations.find((l) => l.id === locationId);
        if (loc) loc.equipment = deduped;
    } catch (err) {
        console.error('healDuplicateLocationEquipment failed:', err);
    } finally {
        _healingLocations.delete(locationId);
    }
}

// Track migrations in-flight per location so we don't re-fire while one is
// already running. Cleared after each finishes.
const _migratingLocations = new Set();

/**
 * Background pass: for every catalogRef on a location doc, promote it to a
 * legacy equipment record (tagged with this gym). One-shot per gym view
 * render — runs the first time we render a location whose catalog refs
 * haven't been promoted. After this lands, the equipment shows up in the
 * active-workout picker, search, and all other library views.
 */
async function migrateLocationCatalogRefs(locationId, gymName) {
    if (_migratingLocations.has(locationId)) return;
    const loc = allLocations.find((l) => l.id === locationId);
    const refs = Array.isArray(loc?.equipment) ? loc.equipment : [];
    if (refs.length === 0) return;

    // Only run if at least one ref isn't already represented by a legacy
    // record at this gym — saves a round-trip when everything's migrated.
    const needsMigration = refs.some((r) => {
        if (!r?.catalogRef) return false;
        const resolved = resolveCatalogRef(r.catalogRef, getCatalogSync());
        if (!resolved) return false;
        const nameLC = resolved.machine.name.toLowerCase();
        return !allEquipment.some((eq) =>
            (eq.catalogRef === r.catalogRef
                || (eq.function || '').toLowerCase() === nameLC
                || (eq.name || '').toLowerCase() === nameLC)
            && (eq.locations || []).includes(gymName)
        );
    });
    if (!needsMigration) return;

    _migratingLocations.add(locationId);
    try {
        for (const ref of refs) {
            if (!ref?.catalogRef) continue;
            await promoteCatalogToEquipment(ref.catalogRef, gymName);
        }
    } catch (err) {
        console.error('migrateLocationCatalogRefs failed:', err);
    } finally {
        _migratingLocations.delete(locationId);
    }
}

/**
 * Determine an equipment record's primary body part. Uses the first exercise
 * type as a hint (via classifyExerciseBodyPart) and falls back to Multi-Use.
 */
function inferBodyPartFromEquipment(eq) {
    if (Array.isArray(eq.exerciseTypes) && eq.exerciseTypes.length > 0) {
        return classifyExerciseBodyPart(eq.exerciseTypes[0]);
    }
    return 'Multi-Use';
}

/**
 * Build the canonical display name for a catalog machine. Same format the
 * Add-equipment flow uses so promoted records and manually-added records
 * collide on name in getOrCreateEquipment's fuzzy match.
 */
function catalogDisplayName(brand, line, machineName) {
    if (brand && line && machineName) return `${brand} ${line} — ${machineName}`;
    if (brand && machineName)         return `${brand} — ${machineName}`;
    if (machineName)                  return machineName;
    return brand || '';
}

/**
 * Suggest exerciseTypes for a machine name from the in-memory exercise
 * library. Conservative by design — see machine-exercise-matcher.js.
 */
function suggestMachineExercises(machineName) {
    const names = (AppState.exerciseDatabase || [])
        .map((ex) => ex.name || ex.machine)
        .filter(Boolean);
    return suggestExercisesForMachine(machineName, names);
}

/**
 * Find-or-create a legacy equipment record (users/{uid}/equipment) that
 * represents a catalog machine. This is the unification point: the rest of
 * the app — active-workout equipment picker, exercise assignment, form
 * videos, base weight — all read from `users/{uid}/equipment`, not from
 * the catalog. Promoting on first touch means catalog-added equipment
 * actually shows up when the user goes to assign it during a workout.
 *
 * When `gymName` is provided, the location is appended to the record's
 * `locations[]` array so the gym view still includes it.
 *
 * Returns the equipment record (or null on failure).
 */
async function promoteCatalogToEquipment(catalogRef, gymName = null, { refresh = true } = {}) {
    const catalog = getCatalogSync();
    const resolved = resolveCatalogRef(catalogRef, catalog);
    if (!resolved) return null;

    const { brand, line, machine } = resolved;
    const name = catalogDisplayName(brand.name, line.name, machine.name);
    const type = machine.type || line.type || 'Other';
    const baseWeight = BASE_WEIGHT_SUGGESTIONS[type] || 0;

    try {
        const result = await getManager().getOrCreateEquipment(
            name,
            {
                brand: brand.name,
                line: line.name,
                function: machine.name,
                equipmentType: type,
                baseWeight,
                baseWeightUnit: 'lbs',
                catalogRef,
                // Catalog entries carry no exercise mapping — infer it from the
                // machine name so the promoted doc shows up under "For <exercise>"
                // in the workout picker and counts toward planner compatibility.
                // Only applies on create; existing docs keep their exerciseTypes.
                exerciseTypes: suggestMachineExercises(machine.name),
            },
            null,
        );
        if (!result) return null;

        // Tag the location AFTER the create so getOrCreateEquipment's exact-
        // name short-circuit returns the existing record cleanly. Skip if the
        // location is already present.
        if (gymName && !(result.locations || []).includes(gymName)) {
            await getManager().addLocationToEquipment(result.id, gymName);
            result.locations = [...(result.locations || []), gymName];
        }

        // Refresh the module-level cache so the rest of the page sees the new
        // record without forcing a full reload. Batch callers (quick-add)
        // pass refresh:false and reload once after the loop instead.
        if (refresh) {
            await refreshEquipmentCaches();
        }

        return allEquipment.find((e) => e.id === result.id) || result;
    } catch (err) {
        console.error('promoteCatalogToEquipment failed:', err);
        return null;
    }
}

/**
 * Reload the module-level equipment cache AND the app-wide cache the
 * active-workout picker reads (AppState._cachedEquipment). Every write path
 * that changes equipment↔gym tags must end here, otherwise a workout started
 * right after the change sees stale equipment.
 */
async function refreshEquipmentCaches() {
    const allRefreshed = await getManager().getUserEquipment();
    allEquipment = allRefreshed;
    AppState._cachedEquipment = allRefreshed;
    return allRefreshed;
}

/**
 * Doc-side counterpart of removeLocationEquipment: when a catalog machine is
 * untagged from a gym, remove the gym from any promoted equipment doc that
 * represents that machine. Uses the same matcher as migrateLocationCatalogRefs
 * so pre-catalogRef promotions (name matches) are covered too.
 */
async function untagGymFromPromotedDocs(catalogRef, gymName) {
    const resolved = resolveCatalogRef(catalogRef, getCatalogSync());
    const nameLC = resolved ? resolved.machine.name.toLowerCase() : null;
    const matches = allEquipment.filter((eq) =>
        (eq.catalogRef === catalogRef
            || (nameLC && ((eq.function || '').toLowerCase() === nameLC
                || (eq.name || '').toLowerCase() === nameLC)))
        && (eq.locations || []).includes(gymName)
    );
    for (const eq of matches) {
        const locations = (eq.locations || []).filter((l) => l !== gymName);
        await getManager().updateEquipment(eq.id, { locations });
        eq.locations = locations;
    }
    if (matches.length > 0) {
        AppState._cachedEquipment = allEquipment;
    }
}

/**
 * Location-array counterpart for doc-side edits: when a promoted equipment
 * doc gains/loses a gym from the equipment-detail page, mirror the change
 * onto that gym's location.equipment[] so the gym view and quick-add's
 * "already at this gym" state stay truthful.
 */
async function syncCatalogRefOnLocation(catalogRef, gymName, shouldExist) {
    if (!catalogRef || !gymName) return;
    const loc = allLocations.find((l) => l.name === gymName);
    if (!loc?.id) return;
    try {
        if (shouldExist) {
            await getManager().addLocationEquipment(loc.id, [{ catalogRef }]);
        } else {
            await getManager().removeLocationEquipment(loc.id, catalogRef);
        }
        const items = Array.isArray(loc.equipment) ? loc.equipment : [];
        loc.equipment = shouldExist
            ? (items.some((e) => e.catalogRef === catalogRef)
                ? items
                : [...items, { catalogRef, nickname: '', notes: '', addedAt: new Date().toISOString() }])
            : items.filter((e) => e.catalogRef !== catalogRef);
    } catch (err) {
        // Non-fatal: the doc is the source of truth; the gym-view merge heals
        // stale arrays on next render.
        console.error('syncCatalogRefOnLocation failed:', err);
    }
}

/**
 * Count items per body part. Returns a plain object keyed by body part name.
 */
function countByBodyPart(items) {
    const counts = {};
    for (const it of items) {
        const bp = it.bodyPart || 'Multi-Use';
        counts[bp] = (counts[bp] || 0) + 1;
    }
    return counts;
}

/**
 * After a render that includes gym cards, walk all `.gym-card__mix-seg`
 * elements and set their flex-grow from `data-mix-flex`. Truly-dynamic styling
 * is allowed via element.style.* per CLAUDE.md design rule #8.
 */
function applyGymMixBarFlex(root) {
    const segs = root.querySelectorAll('.gym-card__mix-seg[data-mix-flex]');
    segs.forEach((seg) => {
        const flex = parseFloat(seg.dataset.mixFlex) || 1;
        seg.style.flexGrow = String(flex);
    });
}

/**
 * Switch the active library tab. No-op if the tab is already active.
 */
export function setEquipmentTab(tab) {
    if (tab === currentTab) return;
    if (!['gyms', 'library', 'catalog'].includes(tab)) return;
    currentTab = tab;
    renderEquipmentLibrary();
}

/**
 * Open the gym detail screen for a specific gym. `locationIdOrNull` is the
 * users/{uid}/locations/{id} doc id; if no doc exists (gym name only appears
 * on equipment records), pass null + fallbackName.
 */
export function openGymDetail(locationIdOrNull, fallbackName) {
    const loc = locationIdOrNull
        ? allLocations.find((l) => l.id === locationIdOrNull)
        : null;
    const gymName = loc?.name || fallbackName;
    if (!gymName) return;
    currentGymDetail = {
        name: gymName,
        id: loc?.id || null,
        lastVisit: loc?.lastVisit || null,
    };
    currentBpFilter = 'All';
    renderEquipmentLibrary();
}

/**
 * Exit the gym detail screen and return to the My gyms tab.
 */
export function closeGymDetail() {
    currentGymDetail = null;
    currentBpFilter = 'All';
    currentTab = 'gyms';
    renderEquipmentLibrary();
}

/**
 * Switch the body-part filter on the gym detail page.
 */
export function setGymBpFilter(bp) {
    if (bp === currentBpFilter) return;
    currentBpFilter = bp;
    renderEquipmentLibrary();
}

// Module state for the catalog machine detail view — used so the toggle
// handler can re-render the page after each gym change without losing context.
let _catalogDetailRef = null;

/**
 * Catalog machine tap. Unified detail flow: promote the catalog ref to a
 * legacy equipment record (find-or-create), then route to the rich
 * openEquipmentDetail page so the user sees ONE consistent surface across
 * the library, gym view, catalog, and active workout. The legacy record
 * is what every other part of the app (active-workout picker, exercise
 * assignment, form videos) reads from.
 */
export async function openCatalogMachine(catalogRef) {
    const catalog = getCatalogSync();
    const resolved = resolveCatalogRef(catalogRef, catalog);
    if (!resolved) {
        showNotification('Catalog machine not found', 'error');
        return;
    }

    // Make sure caches are warm before promotion (so we find existing records
    // by name) and the rich detail page can render.
    try {
        const locs = await getManager().getUserLocations();
        if (Array.isArray(locs)) allLocations = locs;
    } catch { /* fall back to whatever's already cached */ }

    const equipment = await promoteCatalogToEquipment(catalogRef);
    if (!equipment) {
        showNotification("Couldn't open equipment — try again", 'error');
        return;
    }
    _catalogDetailRef = null;
    await openEquipmentDetail(equipment.id);
}

function renderCatalogMachineDetail() {
    if (!_catalogDetailRef) return;
    const catalog = getCatalogSync();
    const resolved = resolveCatalogRef(_catalogDetailRef, catalog);
    if (!resolved) return;

    const { brand, line, machine } = resolved;
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Swap the static page header for the detail variant — title is the
    // machine name; back routes through backToEquipmentList so any
    // returnTo context still works.
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">${escapeHtml(machine.name)}</div>
            </div>
        `;
    }

    const type = machine.type || line.type || 'Other';
    const typeInfo = EQUIPMENT_TYPE_ICONS[type] || EQUIPMENT_TYPE_ICONS.Other;
    const bodyPart = machine.bodyPart || 'Multi-Use';

    // Determine which of the user's gyms already have this machine. We match
    // BOTH the canonical catalog ref AND legacy name-only entries so older
    // tags (set before catalogRef was stored) still count.
    const machineNameLC = machine.name.toLowerCase();
    const gymStates = allLocations.map((loc) => {
        const items = Array.isArray(loc.equipment) ? loc.equipment : [];
        const hasIt = items.some((e) =>
            e.catalogRef === _catalogDetailRef
            || (e.name && e.name.toLowerCase() === machineNameLC)
        );
        return { id: loc.id, name: loc.name, hasIt };
    });

    const metaParts = [brand.name, line.name, type, bodyPart].filter(Boolean);
    const gymRowsHTML = gymStates.length === 0
        ? `<div class="empty-state-compact">
                <i class="fas fa-map-marker-alt"></i>
                <p>No gyms saved yet</p>
                <p class="empty-state-hint">Start a workout to stamp a gym, then come back here to tag equipment.</p>
            </div>`
        : gymStates.map((g) => `
            <button class="cm-gym-row${g.hasIt ? ' cm-gym-row--on' : ''}"
                    onclick="toggleCatalogMachineAtGym('${escapeAttr(g.id)}')">
                <i class="fas ${g.hasIt ? 'fa-check-circle' : 'fa-circle'} cm-gym-row__check"></i>
                <span class="cm-gym-row__name">${escapeHtml(g.name)}</span>
                <span class="cm-gym-row__status">${g.hasIt ? 'At this gym' : 'Tap to add'}</span>
            </button>
        `).join('');

    // Exercises linked to this machine. Spec keeps this empty for now (Kevin
    // populates the mapping over time) — show a hint instead of nothing.
    const exerciseList = Array.isArray(machine.exercises) ? machine.exercises
        : (machine.exercises?.primary || []);
    const exercisesHTML = exerciseList.length > 0
        ? `<ul class="cm-exercise-list">
                ${exerciseList.map((e) => `<li>${escapeHtml(typeof e === 'string' ? e : (e.name || ''))}</li>`).join('')}
            </ul>`
        : `<p class="cm-hint">No exercises mapped to this machine yet.</p>`;

    container.innerHTML = `
        <div class="cm-detail">
            <div class="cm-header">
                <div class="cm-header__icon equip-row__icon--${slugType(type)}">
                    <i class="fas ${typeInfo.icon}"></i>
                </div>
                <div class="cm-header__info">
                    <div class="cm-header__name">${escapeHtml(machine.name)}</div>
                    <div class="cm-header__meta">${escapeHtml(metaParts.join(' · '))}</div>
                </div>
            </div>

            <div class="cm-section">
                <div class="cm-section__title">At your gyms</div>
                <div class="cm-gym-list">${gymRowsHTML}</div>
            </div>

            <div class="cm-section">
                <div class="cm-section__title">Exercises</div>
                ${exercisesHTML}
            </div>
        </div>
    `;
}

// Tracks in-flight toggles by `${locationId}|${catalogRef}` so a double-tap
// during the Firestore round-trip doesn't queue a duplicate add.
const _inFlightCatalogToggles = new Set();

/**
 * Toggle a catalog machine on/off for one of the user's gyms — used from
 * the gym list on the catalog machine detail page. Optimistic: updates the
 * in-memory location and re-renders immediately so the user gets instant
 * feedback, then reconciles with the server response.
 */
export async function toggleCatalogMachineAtGym(locationId) {
    if (!_catalogDetailRef || !locationId) return;
    const key = `${locationId}|${_catalogDetailRef}`;
    if (_inFlightCatalogToggles.has(key)) return;     // ignore double-tap
    _inFlightCatalogToggles.add(key);

    const loc = allLocations.find((l) => l.id === locationId);
    if (!loc) { _inFlightCatalogToggles.delete(key); return; }

    const items = Array.isArray(loc.equipment) ? loc.equipment : [];
    const hasIt = items.some((e) => e.catalogRef === _catalogDetailRef);

    // Optimistic local update — paint the new state immediately so the
    // user sees the checkmark / status flip on tap, not after the round-trip.
    if (hasIt) {
        loc.equipment = items.filter((e) => e.catalogRef !== _catalogDetailRef);
    } else {
        loc.equipment = [...items, { catalogRef: _catalogDetailRef, nickname: '', notes: '', addedAt: new Date().toISOString() }];
    }
    renderCatalogMachineDetail();

    try {
        if (hasIt) {
            await getManager().removeLocationEquipment(locationId, _catalogDetailRef);
            // Mirror onto the promoted equipment doc so the workout picker
            // stops offering this machine "At <gym>".
            await untagGymFromPromotedDocs(_catalogDetailRef, loc.name);
            showNotification(`Removed from ${loc.name}`, 'success', 1200);
        } else {
            await getManager().addLocationEquipment(locationId, [{ catalogRef: _catalogDetailRef }]);
            // Promote so the machine exists as a real equipment doc tagged to
            // this gym — visible to the workout picker immediately.
            await promoteCatalogToEquipment(_catalogDetailRef, loc.name);
            showNotification(`Added to ${loc.name}`, 'success', 1200);
        }
        // Reconcile with the server in case anything else changed.
        const refreshed = await getManager().getUserLocations();
        allLocations = refreshed;
        renderCatalogMachineDetail();
    } catch (err) {
        console.error('Toggle catalog machine at gym failed:', err);
        // Roll back the optimistic update.
        loc.equipment = items;
        renderCatalogMachineDetail();
        showNotification("Couldn't save — try again", 'error');
    } finally {
        _inFlightCatalogToggles.delete(key);
    }
}

// ===================================================================
// QUICK-ADD SHEET — bulk-tag catalog machines to a gym (Phase 2 step 7)
// ===================================================================
//
// Module-local state for the active quick-add session. The sheet is global
// (one open at a time) so state lives outside any per-render scope.
let quickAddState = null;
// Shape: { gymName, gymId, selected: Set<catalogRef>, search, bpFilter,
//          alreadyTagged: Set<catalogRef>, allMachines: Array<flatMachine> }

/**
 * Open the Quick-add sheet for `gymName`. If a location doc exists for the
 * gym, prefill alreadyTagged from its `equipment[]` array.
 *
 * `onDone(addedEquipment)` — optional callback fired after a successful
 * commit with the promoted equipment docs, instead of re-rendering the
 * library. Lets the active-workout picker open this sheet inline and select
 * the machine the user just added.
 */
export async function openQuickAddSheet(gymName, { onDone = null } = {}) {
    if (!gymName) return;

    // Mid-workout callers reach this before the library has ever rendered.
    // Fetch locations so we find the existing gym doc — commitQuickAdd would
    // otherwise create a duplicate location for a gym that already exists.
    if (allLocations.length === 0) {
        try {
            const locs = await getManager().getUserLocations();
            if (Array.isArray(locs)) allLocations = locs;
        } catch { /* proceed; commitQuickAdd creates the doc if truly missing */ }
    }

    const loc = allLocations.find((l) => l.name === gymName);
    const alreadyTagged = new Set(
        (loc?.equipment || []).map((e) => e.catalogRef).filter(Boolean)
    );

    quickAddState = {
        gymName,
        gymId: loc?.id || null,
        selected: new Set(),
        search: '',
        bpFilter: 'All',
        alreadyTagged,
        allMachines: flattenCatalogMachines(),
        customOpen: false,
        customName: '',
        customType: 'Plate-Loaded',
        onDone: typeof onDone === 'function' ? onDone : null,
    };

    renderQuickAddSheet();
}

/**
 * Build a flat list of all catalog machines for filtering. Each entry carries
 * its full context (brand, line) so search + grouping is efficient.
 */
function flattenCatalogMachines() {
    const catalog = getCatalogSync();
    const flat = [];
    for (const brand of catalog) {
        for (const line of brand.lines || []) {
            for (const machine of line.machines || []) {
                flat.push({
                    catalogRef: machine.id,
                    name: machine.name,
                    brandName: brand.name,
                    lineName: line.name,
                    type: machine.type || line.type || 'Other',
                    bodyPart: machine.bodyPart || 'Multi-Use',
                });
            }
        }
    }
    return flat;
}

/**
 * Filter and group the catalog by the active search + body-part filter.
 * Returns Map<bodyPart, machine[]> ordered by BODY_PART_ORDER.
 */
function filterQuickAddCatalog() {
    if (!quickAddState) return new Map();
    const { allMachines, search, bpFilter } = quickAddState;
    const term = search.trim().toLowerCase();

    const filtered = allMachines.filter((m) => {
        if (bpFilter !== 'All' && m.bodyPart !== bpFilter) return false;
        if (!term) return true;
        return (
            m.name.toLowerCase().includes(term) ||
            m.brandName.toLowerCase().includes(term) ||
            m.lineName.toLowerCase().includes(term) ||
            m.type.toLowerCase().includes(term)
        );
    });

    const grouped = new Map();
    for (const m of filtered) {
        const bp = m.bodyPart;
        if (!grouped.has(bp)) grouped.set(bp, []);
        grouped.get(bp).push(m);
    }
    for (const list of grouped.values()) {
        list.sort((a, b) => {
            const brCmp = a.brandName.localeCompare(b.brandName);
            if (brCmp !== 0) return brCmp;
            return a.name.localeCompare(b.name);
        });
    }
    return new Map(
        BODY_PART_ORDER.filter((bp) => grouped.has(bp)).map((bp) => [bp, grouped.get(bp)])
    );
}

/**
 * Build and mount the Quick-add sheet DOM. Reuses the `.aw-sheet` CSS shell
 * for visual consistency with the active workout sheets.
 */
function renderQuickAddSheet() {
    // Cleanup any previous instance
    closeQuickAddSheetImmediate();
    if (!quickAddState) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'qa-sheet-backdrop';
    backdrop.onclick = () => closeQuickAddSheet();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'qa-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'qa-sheet-title');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title" id="qa-sheet-title">Add equipment</div>
            <div class="aw-sheet__subtitle">at ${escapeHtml(quickAddState.gymName)}</div>
        </div>
        <div class="aw-sheet__body" id="qa-sheet-body">${renderQuickAddBody()}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="closeQuickAddSheet()">Cancel</button>
            <button class="aw-sheet__action primary" id="qa-add-btn" onclick="commitQuickAdd()" disabled>
                <span class="qa-sheet__action-counter" id="qa-counter">0</span>
                <span id="qa-add-label">Add to gym</span>
            </button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
        // Auto-focus the search so the keyboard rises immediately
        const input = document.getElementById('qa-search-input');
        if (input) input.focus();
    });
}

/**
 * Render just the scrollable body — called on search/chip/check changes to
 * avoid recreating the whole sheet (preserves animation + scroll position).
 */
function renderQuickAddBody() {
    const { search, bpFilter, selected, alreadyTagged } = quickAddState;
    const grouped = filterQuickAddCatalog();
    const totalResults = [...grouped.values()].reduce((s, list) => s + list.length, 0);

    const bpChips = ['All', ...BODY_PART_ORDER];
    const chipsHTML = `
        <div class="chips qa-sheet__bp-chips" id="qa-bp-chips">
            ${bpChips.map((bp) => `
                <button class="chip${bpFilter === bp ? ' active' : ''}"
                        onclick="setQuickAddBp('${escapeAttr(bp)}')"
                        aria-pressed="${bpFilter === bp}">
                    ${escapeHtml(bp)}
                </button>
            `).join('')}
        </div>
    `;

    const searchHTML = `
        <div class="qa-sheet__search">
            <input type="text" id="qa-search-input"
                   class="qa-sheet__search-input"
                   placeholder="Search catalog…"
                   value="${escapeAttr(search)}"
                   oninput="setQuickAddSearch(this.value)">
            <span class="qa-sheet__result-count">${totalResults} result${totalResults !== 1 ? 's' : ''}</span>
        </div>
    `;

    let resultsHTML;
    if (totalResults === 0) {
        resultsHTML = `<div class="qa-sheet__empty">No matches in the catalog.</div>`;
    } else {
        resultsHTML = [...grouped.entries()].map(([bp, machines]) => `
            <div class="qa-sheet__group-header">
                <span class="qa-sheet__group-name">${escapeHtml(bp)}</span>
                <span class="qa-sheet__group-count">${machines.length}</span>
            </div>
            ${machines.map((m) => renderQuickAddRow(m, selected.has(m.catalogRef), alreadyTagged.has(m.catalogRef))).join('')}
        `).join('');
    }

    // "Can't find it?" — create a custom equipment inline when the catalog is
    // missing a machine. Saved as a standalone equipment doc tagged to this gym
    // (locations[]), so it shows in the gym detail alongside catalog items.
    const { customOpen, customName, customType } = quickAddState;
    const customHTML = customOpen
        ? `
        <div class="qa-custom">
            <div class="qa-custom__title">Add custom equipment</div>
            <input type="text" id="qa-custom-name" class="qa-sheet__search-input qa-custom__name"
                   placeholder="Equipment name" value="${escapeAttr(customName)}"
                   oninput="setQuickAddCustomName(this.value)">
            <div class="chips qa-custom__types">
                ${EQUIPMENT_TYPES_LIST.map((t) => `
                    <button class="chip${customType === t ? ' active' : ''}"
                            onclick="setQuickAddCustomType('${escapeAttr(t)}')"
                            aria-pressed="${customType === t}">${escapeHtml(t)}</button>
                `).join('')}
            </div>
            <div class="qa-custom__actions">
                <button class="btn-ghost qa-custom__cancel" onclick="toggleQuickAddCustom()">Cancel</button>
                <button class="btn-redesign qa-custom__save" onclick="commitQuickAddCustom()">Add ${escapeHtml(customType)}</button>
            </div>
        </div>`
        : `<button class="qa-custom__open" onclick="toggleQuickAddCustom()"><i class="fas fa-plus"></i> Can't find it? Add custom equipment</button>`;

    return searchHTML + chipsHTML + resultsHTML + customHTML;
}

/**
 * Render a single check-row for a catalog machine.
 */
function renderQuickAddRow(machine, isChecked, isDisabled) {
    const typeInfo = EQUIPMENT_TYPE_ICONS[machine.type] || EQUIPMENT_TYPE_ICONS.Other;
    const typeColorClass = `equip-row__icon--${slugType(machine.type)}`;
    const classes = ['qa-row'];
    if (isChecked && !isDisabled) classes.push('is-checked');
    if (isDisabled) classes.push('is-disabled');

    const clickHandler = isDisabled
        ? ''
        : `onclick="toggleQuickAddRow('${escapeAttr(machine.catalogRef)}')"`;

    const meta = isDisabled
        ? 'Already at this gym'
        : `${escapeHtml(machine.brandName)} · ${escapeHtml(machine.lineName)}`;

    return `
        <div class="${classes.join(' ')}" ${clickHandler}
             role="checkbox" aria-checked="${isChecked}" aria-disabled="${isDisabled}">
            <span class="qa-row__check"></span>
            <span class="qa-row__icon ${typeColorClass}"><i class="fas ${typeInfo.icon}"></i></span>
            <div class="qa-row__info">
                <div class="qa-row__name">${escapeHtml(machine.name)}</div>
                <div class="qa-row__meta">${meta}</div>
            </div>
            <span class="equip-row__type-pill ${typeColorClass} qa-row__pill">${escapeHtml(machine.type)}</span>
        </div>
    `;
}

/**
 * Toggle a row's checked state. Re-renders the body so the row visually
 * flips, and updates the counter + Add-button enabled state.
 */
export function toggleQuickAddRow(catalogRef) {
    if (!quickAddState) return;
    if (quickAddState.alreadyTagged.has(catalogRef)) return;
    if (quickAddState.selected.has(catalogRef)) {
        quickAddState.selected.delete(catalogRef);
    } else {
        quickAddState.selected.add(catalogRef);
    }
    rerenderQuickAddBody();
    updateQuickAddActionBar();
}

/**
 * Update the search filter on the Quick-add sheet.
 */
export function setQuickAddSearch(term) {
    if (!quickAddState) return;
    quickAddState.search = term;
    rerenderQuickAddBody();
}

/**
 * Update the body-part filter on the Quick-add sheet.
 */
export function setQuickAddBp(bp) {
    if (!quickAddState || bp === quickAddState.bpFilter) return;
    quickAddState.bpFilter = bp;
    rerenderQuickAddBody();
}

/**
 * Toggle the inline "add custom equipment" form at the bottom of the sheet.
 */
export function toggleQuickAddCustom() {
    if (!quickAddState) return;
    quickAddState.customOpen = !quickAddState.customOpen;
    rerenderQuickAddBody();
}

/**
 * Store the custom equipment name WITHOUT re-rendering, so typing keeps focus.
 */
export function setQuickAddCustomName(name) {
    if (!quickAddState) return;
    quickAddState.customName = name;
}

/**
 * Pick the custom equipment type (re-renders to reflect the active chip + the
 * "Add <type>" button label).
 */
export function setQuickAddCustomType(type) {
    if (!quickAddState) return;
    quickAddState.customType = type;
    rerenderQuickAddBody();
}

/**
 * Create a custom (non-catalog) equipment tagged to this gym and refresh.
 */
export async function commitQuickAddCustom() {
    if (!quickAddState) return;
    const name = (quickAddState.customName || '').trim();
    if (!name) { showNotification('Add a name', 'warning'); return; }
    const type = quickAddState.customType || 'Other';

    try {
        const { gymName, onDone } = quickAddState;
        let { gymId } = quickAddState;
        if (!gymId) {
            const newLoc = await getManager().saveLocation({ name: gymName });
            gymId = newLoc.id;
            allLocations.push(newLoc);
        }
        // Standalone equipment doc tagged to the gym via locations[] — the gym
        // detail merges these with catalog refs, so it shows there right away.
        const equipmentId = await getManager().saveEquipment({
            name,
            equipmentType: type,
            locations: [gymName],
            exerciseTypes: suggestMachineExercises(name),
        });
        await refreshEquipmentCaches();

        closeQuickAddSheet();
        showNotification(`${name} added to ${gymName}`, 'success');
        if (onDone) {
            const created = allEquipment.find((e) => e.id === equipmentId) || { id: equipmentId, name };
            try { await onDone([created]); } catch (e) { console.error('Quick-add onDone threw:', e); }
        } else {
            renderEquipmentLibrary();
        }
    } catch (err) {
        console.error('❌ Custom equipment add failed:', err);
        showNotification(`Couldn't save — try again`, 'error');
    }
}

function rerenderQuickAddBody() {
    const body = document.getElementById('qa-sheet-body');
    if (!body) return;
    // Preserve focus + cursor on the search input across re-renders
    const focused = document.activeElement;
    const isSearchFocused = focused?.id === 'qa-search-input';
    const caret = isSearchFocused ? focused.selectionStart : null;

    body.innerHTML = renderQuickAddBody();

    if (isSearchFocused) {
        const input = document.getElementById('qa-search-input');
        if (input) {
            input.focus();
            if (caret !== null) {
                try { input.setSelectionRange(caret, caret); } catch { /* ignore */ }
            }
        }
    }
}

function updateQuickAddActionBar() {
    const counter = document.getElementById('qa-counter');
    const btn = document.getElementById('qa-add-btn');
    const label = document.getElementById('qa-add-label');
    if (!counter || !btn || !label) return;
    const count = quickAddState?.selected.size || 0;
    counter.textContent = String(count);
    btn.disabled = count === 0;
    label.textContent = count === 0 ? 'Add to gym' : `Add to ${escapeHtml(quickAddState.gymName)}`;
}

/**
 * Commit the selected machines to the gym's `location.equipment[]`. Creates
 * the location doc if needed (for derived gyms with no location record yet).
 */
export async function commitQuickAdd() {
    if (!quickAddState) return;
    const selected = [...quickAddState.selected];
    if (selected.length === 0) return;

    const btn = document.getElementById('qa-add-btn');
    if (btn) btn.disabled = true;

    try {
        let { gymId } = quickAddState;
        // If no doc exists yet, create one so we have a stable id.
        if (!gymId) {
            const newLoc = await getManager().saveLocation({ name: quickAddState.gymName });
            gymId = newLoc.id;
            // Reflect the new location in the cached array so My gyms refresh works
            allLocations.push(newLoc);
        }

        const items = selected.map((catalogRef) => ({ catalogRef }));
        const added = await getManager().addLocationEquipment(gymId, items);

        // Promote each machine to a real equipment doc NOW, not lazily on the
        // next gym-view render. This is what makes quick-added machines show
        // up in the active-workout picker immediately — the whole point of
        // adding equipment at a new gym.
        const { gymName, onDone } = quickAddState;
        const promoted = [];
        for (const catalogRef of selected) {
            const eq = await promoteCatalogToEquipment(catalogRef, gymName, { refresh: false });
            if (eq) promoted.push(eq);
        }
        await refreshEquipmentCaches();

        // Refresh local locations cache so the gym detail / My gyms reflect the change
        const refreshed = await getManager().getUserLocations();
        allLocations = refreshed;

        closeQuickAddSheet();
        showNotification(`Added ${added.length} machine${added.length !== 1 ? 's' : ''} to ${gymName}`, 'success');
        if (onDone) {
            // Opened from another surface (active workout) — hand the promoted
            // docs back instead of re-rendering the hidden library section.
            try { await onDone(promoted); } catch (e) { console.error('Quick-add onDone threw:', e); }
        } else {
            renderEquipmentLibrary();
        }
    } catch (err) {
        console.error('❌ Quick-add commit failed:', err);
        showNotification(`Couldn't save — try again`, 'error');
        if (btn) btn.disabled = false;
    }
}

/**
 * Dismiss the Quick-add sheet without saving.
 */
export function closeQuickAddSheet() {
    const backdrop = document.getElementById('qa-sheet-backdrop');
    const sheet = document.getElementById('qa-sheet');
    if (backdrop) backdrop.classList.remove('visible');
    if (sheet) sheet.classList.remove('visible');
    setTimeout(() => closeQuickAddSheetImmediate(), 300);
    quickAddState = null;
}

function closeQuickAddSheetImmediate() {
    const backdrop = document.getElementById('qa-sheet-backdrop');
    const sheet = document.getElementById('qa-sheet');
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
}

/**
 * Drill into a brand from the Catalog tab. Sets state and re-renders into the
 * brand-detail view (lines + machines, with an Add-to-gym affordance per row).
 */
export function openBrandCatalog(brandSlug) {
    const catalog = getCatalogSync();
    const brand = catalog.find((b) => b.slug === brandSlug);
    if (!brand) {
        showNotification('Brand not found in catalog', 'error');
        return;
    }
    currentBrandCatalog = { slug: brand.slug, name: brand.name };
    renderEquipmentLibrary();
}

/**
 * Exit the brand catalog drill-down back to the Catalog tab.
 */
export function closeBrandCatalog() {
    currentBrandCatalog = null;
    currentTab = 'catalog';
    renderEquipmentLibrary();
}

/**
 * Render the brand-detail view: header (back + brand name + machine count),
 * then lines + machines as compact rows. Tapping a machine offers to add it
 * to the current GPS gym (or prompts for a gym pick when no GPS).
 */
function renderBrandCatalog(container) {
    const catalog = getCatalogSync();
    const brand = catalog.find((b) => b.slug === currentBrandCatalog.slug);
    if (!brand) {
        closeBrandCatalog();
        return;
    }

    const machineCount = (brand.lines || []).reduce((s, l) => s + (l.machines?.length || 0), 0);
    const lineCount = brand.lines?.length || 0;

    // Mutate the page-header for the brand-detail view (back returns to Catalog).
    const section = document.getElementById('equipment-library-section');
    const header = section?.querySelector('.page-header');
    if (header) {
        header.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeBrandCatalog()" aria-label="Back to Catalog">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title-block">
                    <div class="page-header__title">${escapeHtml(brand.name)}</div>
                    <div class="page-header__subtitle">${lineCount} line${lineCount !== 1 ? 's' : ''} · ${machineCount} machine${machineCount !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `;
        header.dataset.mutated = '1';
    }

    // Lines + machines as compact rows
    const linesHTML = (brand.lines || []).map((line) => {
        const machinesHTML = (line.machines || []).map((m) => {
            const type = m.type || line.type || 'Other';
            const typeInfo = EQUIPMENT_TYPE_ICONS[type] || EQUIPMENT_TYPE_ICONS.Other;
            const typeColorClass = `equip-row__icon--${slugType(type)}`;
            const owned = findOwnedForCatalogMachine(m);
            const onClick = owned
                ? `openEquipmentDetail('${escapeAttr(owned.id)}')`
                : `openCatalogMachineAddToGym('${escapeAttr(m.id)}')`;
            return `
                <div class="equip-row equip-row--compact" onclick="${onClick}">
                    <div class="equip-row__icon ${typeColorClass}">
                        <i class="fas ${typeInfo.icon}"></i>
                    </div>
                    <div class="equip-row__info">
                        <div class="equip-row__name">${escapeHtml(m.name)}</div>
                        <div class="equip-row__meta">${owned ? 'In your equipment' : escapeHtml(m.bodyPart || 'Multi-Use')}</div>
                    </div>
                    <span class="equip-row__type-pill ${typeColorClass}">${escapeHtml(type)}</span>
                    <i class="fas ${owned ? 'fa-pen' : 'fa-plus'} equip-row__last" aria-hidden="true" title="${owned ? 'Owned — edit' : 'Add to a gym'}"></i>
                </div>
            `;
        }).join('');

        return `
            <div class="line-header">
                <div class="line-header__name">
                    <i class="fas fa-layer-group"></i>
                    ${escapeHtml(line.name)}
                </div>
                <div class="line-header__count">${line.machines?.length || 0} machine${line.machines?.length !== 1 ? 's' : ''}</div>
            </div>
            ${machinesHTML}
        `;
    }).join('');

    container.innerHTML = `<div class="equip-lib-list">${linesHTML}</div>`;
}

/**
 * From the brand-detail drill-down or catalog search, tapping a machine offers
 * to add it to a gym. Routing:
 *   - 0 gyms saved        → toast asking to save one first
 *   - 1 gym saved          → auto-add
 *   - 2+ gyms, GPS matches → auto-add to GPS gym
 *   - 2+ gyms, no GPS match → open the gym picker sheet (no typing)
 */
/**
 * The user's owned equipment doc matching a catalog machine, or null. Same
 * predicate commitCatalogAdd uses (catalogRef / name / function) — lets catalog
 * browse + search rows offer "edit" for machines you already own instead of
 * only "add to gym" (P1: catalog tap had no edit path for owned machines).
 */
function findOwnedForCatalogMachine(machine) {
    if (!machine) return null;
    const nameLC = (machine.name || '').toLowerCase();
    return allEquipment.find((eq) =>
        eq.catalogRef === machine.id
        || (eq.name || '').toLowerCase() === nameLC
        || (eq.function || '').toLowerCase() === nameLC
    ) || null;
}

export async function openCatalogMachineAddToGym(catalogRef) {
    const catalog = getCatalogSync();
    const resolved = resolveCatalogRef(catalogRef, catalog);
    if (!resolved) {
        showNotification('Catalog machine not found', 'error');
        return;
    }

    const machineName = resolved.machine.name;
    const sessionGym = getSessionLocation();
    const gymNames = new Set();
    allLocations.forEach((l) => gymNames.add(l.name));
    allEquipment.forEach((eq) => (eq.locations || []).forEach((l) => l && gymNames.add(l)));
    const gymList = [...gymNames].sort();

    if (gymList.length === 0) {
        showNotification('Save a gym first (start a workout to stamp a location)', 'info');
        return;
    }

    let targetGym = sessionGym && gymList.includes(sessionGym) ? sessionGym : null;
    if (!targetGym && gymList.length === 1) {
        targetGym = gymList[0];
    }
    if (!targetGym) {
        // Multiple gyms, GPS unknown — let the user tap to choose. The picker
        // pre-highlights the GPS gym when one is detected (even if not saved).
        openGymPickerSheet({
            title: `Add ${machineName}`,
            subtitle: 'Pick the gym to add it to',
            gyms: gymList,
            currentGym: sessionGym,
            onSelect: (gymName) => commitCatalogAdd(catalogRef, machineName, gymName),
        });
        return;
    }

    await commitCatalogAdd(catalogRef, machineName, targetGym);
}

/**
 * Inner write step for openCatalogMachineAddToGym. Unified semantics: a
 * catalog "Add to gym" now creates (or finds) a legacy equipment record
 * AND tags the gym on it. Previously this only wrote a catalogRef onto
 * location.equipment[], which the active-workout picker and equipment
 * library list don't read from — that's why catalog-added machines didn't
 * show up when the user went to assign them during a workout.
 */
async function commitCatalogAdd(catalogRef, machineName, gymName) {
    try {
        let loc = allLocations.find((l) => l.name === gymName);
        if (!loc) {
            const newLoc = await getManager().saveLocation({ name: gymName });
            allLocations.push(newLoc);
            loc = newLoc;
        }

        // Promote: find-or-create the legacy equipment record for this catalog
        // machine and tag the gym on it. promoteCatalogToEquipment is
        // idempotent — re-clicking "Add" on the same machine just returns
        // the existing record with the location already present.
        const machineNameLC = (machineName || '').toLowerCase();
        const existingForGym = allEquipment.find((eq) =>
            (eq.catalogRef === catalogRef
                || (eq.name || '').toLowerCase() === machineNameLC
                || (eq.function || '').toLowerCase() === machineNameLC)
            && (eq.locations || []).includes(gymName)
        );
        const equipment = await promoteCatalogToEquipment(catalogRef, gymName);
        if (!equipment) {
            showNotification("Couldn't save — try again", 'error');
            return;
        }
        // Mirror onto location.equipment[] so the catalog detail page's
        // "At this gym" state and quick-add's already-tagged set stay truthful.
        await syncCatalogRefOnLocation(catalogRef, gymName, true);
        if (existingForGym) {
            showNotification(`${machineName} is already at ${gymName}`, 'info');
            return;
        }
        showNotification(`Added ${machineName} to ${gymName}`, 'success');
    } catch (err) {
        console.error('Add to gym failed:', err);
        showNotification("Couldn't save — try again", 'error');
    }
}

// ===================================================================
// GYM PICKER SHEET — tap-to-select gym list (no text input, no typos)
// ===================================================================
let gymPickerOnSelect = null;

/**
 * Open the gym picker bottom sheet. Single-select, GPS-detected gym is
 * highlighted at the top with a "Here" badge when present.
 *
 * Args: { title, subtitle, gyms: string[], currentGym: string|null,
 *         onSelect: (gymName) => void }
 */
/**
 * Names of gyms (other than `excludeGym`) that have at least one equipment
 * doc — the candidate sources for copy-from-gym.
 */
function gymsWithEquipment(excludeGym) {
    const exclude = (excludeGym || '').toLowerCase();
    const names = new Set();
    for (const eq of allEquipment) {
        for (const l of (eq.locations || [])) {
            if (l && l.toLowerCase() !== exclude) names.add(l);
        }
    }
    return [...names].sort();
}

/**
 * "Copy from another gym" (Tier 2.1): pick a source gym, then clone its
 * equipment list onto `targetGym` — one tap instead of re-adding machine by
 * machine at a hotel/second gym.
 */
export function openCopyFromGymSheet(targetGym) {
    if (!targetGym) return;
    const sources = gymsWithEquipment(targetGym);
    if (sources.length === 0) {
        showNotification('No other gym has equipment to copy', 'info');
        return;
    }
    openGymPickerSheet({
        title: 'Copy equipment',
        subtitle: `Every machine at the gym you pick is added to ${targetGym}`,
        gyms: sources,
        currentGym: null,
        onSelect: (sourceGym) => commitCopyFromGym(sourceGym, targetGym),
    });
}

async function commitCopyFromGym(sourceGym, targetGym) {
    try {
        const srcLC = sourceGym.toLowerCase();
        const tgtLC = targetGym.toLowerCase();
        const source = allEquipment.filter((eq) =>
            (eq.locations || []).some((l) => (l || '').toLowerCase() === srcLC)
        );
        const toAdd = source.filter((eq) =>
            !(eq.locations || []).some((l) => (l || '').toLowerCase() === tgtLC)
        );
        if (toAdd.length === 0) {
            showNotification(`Everything at ${sourceGym} is already at ${targetGym}`, 'info');
            return;
        }

        const userId = AppState.currentUser.uid;
        const batch = writeBatch(db);
        for (const eq of toAdd) {
            batch.update(doc(db, 'users', userId, 'equipment', eq.id), {
                locations: [...(eq.locations || []), targetGym],
            });
        }
        await batch.commit();

        // Mirror catalogRefs onto the target gym's location doc so quick-add's
        // already-tagged state and the catalog detail page stay truthful.
        const refs = toAdd
            .filter((eq) => eq.catalogRef)
            .map((eq) => ({ catalogRef: eq.catalogRef }));
        if (refs.length > 0) {
            let loc = allLocations.find((l) => l.name === targetGym);
            if (!loc) {
                loc = await getManager().saveLocation({ name: targetGym });
                allLocations.push(loc);
            }
            try {
                await getManager().addLocationEquipment(loc.id, refs);
            } catch (e) {
                // Non-fatal: docs are the source of truth; arrays heal on render.
                console.error('Copy-from-gym catalogRef mirror failed:', e);
            }
            const refreshedLocs = await getManager().getUserLocations();
            if (Array.isArray(refreshedLocs)) allLocations = refreshedLocs;
        }

        await refreshEquipmentCaches();
        showNotification(`Copied ${toAdd.length} machine${toAdd.length !== 1 ? 's' : ''} from ${sourceGym}`, 'success');
        renderEquipmentLibrary();
    } catch (err) {
        console.error('❌ Copy from gym failed:', err);
        showNotification("Couldn't copy — try again", 'error');
    }
}

export function openGymPickerSheet({ title, subtitle, gyms, currentGym, onSelect }) {
    gymPickerOnSelect = onSelect;
    closeGymPickerSheetImmediate();

    // Sort: current gym first if known, then alphabetical
    const sorted = [...gyms].sort((a, b) => {
        if (a === currentGym) return -1;
        if (b === currentGym) return 1;
        return a.localeCompare(b);
    });

    const rowsHTML = sorted.map((g) => {
        const isHere = g === currentGym;
        return `
            <div class="qa-row${isHere ? ' is-checked' : ''}" onclick="commitGymPick('${escapeAttr(g)}')" role="button">
                <span></span>
                <span class="qa-row__icon equip-row__icon--machine"><i class="fas fa-map-marker-alt"></i></span>
                <div class="qa-row__info">
                    <div class="qa-row__name">${escapeHtml(g)}${isHere ? '<span class="gym-card__here-pill">Here</span>' : ''}</div>
                </div>
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </div>
        `;
    }).join('');

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'gp-sheet-backdrop';
    backdrop.onclick = () => closeGymPickerSheet();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'gp-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">${escapeHtml(title || 'Pick a gym')}</div>
            ${subtitle ? `<div class="aw-sheet__subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="aw-sheet__body">${rowsHTML}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="closeGymPickerSheet()">Cancel</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
}

export function commitGymPick(gymName) {
    const cb = gymPickerOnSelect;
    closeGymPickerSheet();
    if (cb) cb(gymName);
}

export function closeGymPickerSheet() {
    const backdrop = document.getElementById('gp-sheet-backdrop');
    const sheet = document.getElementById('gp-sheet');
    if (backdrop) backdrop.classList.remove('visible');
    if (sheet) sheet.classList.remove('visible');
    setTimeout(() => closeGymPickerSheetImmediate(), 300);
    gymPickerOnSelect = null;
}

function closeGymPickerSheetImmediate() {
    const backdrop = document.getElementById('gp-sheet-backdrop');
    const sheet = document.getElementById('gp-sheet');
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
}

/**
 * Render the three-tab strip (My gyms / Library / Catalog) with live counts.
 */
function renderCompactTabs() {
    const catalog = getCatalogSync();
    const totalCatalog = catalog.reduce((sum, b) => sum + (b.lines || []).reduce((s, l) => s + (l.machines?.length || 0), 0), 0);

    const tabs = [
        { id: 'gyms',    label: 'My gyms', count: allLocations.length },
        { id: 'library', label: 'Library', count: allEquipment.length },
        { id: 'catalog', label: 'Catalog', count: formatCount(totalCatalog) },
    ];
    return `
        <div class="compact-tabs" role="tablist" aria-label="Equipment library tabs">
            ${tabs.map((t) => `
                <button class="compact-tabs__tab${currentTab === t.id ? ' is-active' : ''}"
                        role="tab" aria-selected="${currentTab === t.id}"
                        onclick="setEquipmentTab('${t.id}')">
                    ${escapeHtml(t.label)}
                    <span class="compact-tabs__count">${escapeHtml(String(t.count))}</span>
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Format a large count like 1364 as "1.3k" for the tab pill.
 */
function formatCount(n) {
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

/**
 * Render the My gyms tab — stat strip + orphan banner + gym cards.
 */
function renderMyGymsTab() {
    const stats = computeGymStats();
    const unlinked = getUnlinkedActive();

    // Stat strip: gyms / machines / brands / orphans
    const brandSet = new Set();
    allEquipment.forEach((e) => { if (e.brand && e.brand !== 'Unknown') brandSet.add(e.brand); });
    const stripCards = [
        { value: stats.length, label: 'Gyms' },
        { value: allEquipment.length, label: 'Machines' },
        { value: brandSet.size, label: 'Brands' },
        { value: unlinked.length, label: 'Orphans', warning: unlinked.length > 0 },
    ];
    const stripHTML = `
        <div class="stat-strip">
            ${stripCards.map((c) => `
                <div class="stat-strip__card${c.warning ? ' stat-strip__card--warning' : ''}">
                    <div class="stat-strip__value">${c.value}</div>
                    <div class="stat-strip__label">${escapeHtml(c.label)}</div>
                </div>
            `).join('')}
        </div>
    `;

    const scanBannerHTML = unlinked.length > 0 ? `
        <div class="scan-banner" onclick="reviewDiscoveredEquipment()" role="button" tabindex="0">
            <div class="scan-banner__icon"><i class="fas fa-history"></i></div>
            <div class="scan-banner__text">
                <div class="scan-banner__title">${unlinked.length} machine${unlinked.length !== 1 ? 's' : ''} found in history</div>
                <div class="scan-banner__sub">Not yet in your library</div>
            </div>
            <button class="scan-banner__btn" onclick="event.stopPropagation(); reviewDiscoveredEquipment()">Review</button>
        </div>
    ` : '';

    const addGymBtn = `
        <button class="add-gym-btn" onclick="addGymPrompt()">
            <i class="fas fa-plus"></i> Add a gym
        </button>
    `;

    if (stats.length === 0) {
        return scanBannerHTML + `
            <div class="empty-state-compact">
                <i class="fas fa-map-marker-alt"></i>
                <p>No gyms saved yet</p>
                <p class="empty-state-hint">Add one now, or it saves automatically when you start a workout there.</p>
                ${addGymBtn}
            </div>
        `;
    }

    // Kick off background reverse-geocoding for any gym with lat/long but no
    // saved address. Non-blocking — the cards render now with coordinates
    // (or no subtitle) and refresh when the address resolves.
    backfillGymAddresses(stats);

    const cardsHTML = stats.map(renderGymCard).join('');
    return stripHTML + scanBannerHTML + `
        <div class="gym-card-list">${cardsHTML}</div>
        ${addGymBtn}
    `;
}

/**
 * Pre-create a gym by name (Phase 8a) — closes the chicken-and-egg where gyms
 * only existed as a side effect of GPS-stamping a workout, so you couldn't set
 * one up to tag equipment to it before training there. Name-only; GPS gets
 * stamped naturally on the first workout at that gym.
 */
export async function addGymPrompt() {
    const name = await promptSheet({
        title: 'Add a gym',
        placeholder: "e.g. Gold's Gym Downtown",
        confirmLabel: 'Add gym',
    });
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (allLocations.some((l) => l.name?.toLowerCase() === trimmed.toLowerCase())) {
        showNotification(`${trimmed} is already saved`, 'info');
        return;
    }
    try {
        const newLoc = await getManager().saveLocation({ name: trimmed });
        if (newLoc) allLocations.push(newLoc);
        showNotification(`${trimmed} added`, 'success');
        openEquipmentLibrary(); // re-render My gyms with the new card
    } catch (err) {
        console.error('Add gym failed:', err);
        showNotification("Couldn't add gym — try again", 'error');
    }
}

/**
 * For any gym lacking an `address` but carrying lat/long, fetch a city/state
 * via Nominatim and persist back to the location doc. Throttled internally by
 * the geocoding module (1 req/sec, single in-flight queue, in-memory cached).
 */
function backfillGymAddresses(stats) {
    for (const gym of stats) {
        if (!gym.id) continue;
        const loc = allLocations.find((l) => l.id === gym.id);
        if (!loc) continue;
        if (loc.address) continue;
        if (loc._geocodeAttempted) continue;
        if (loc.latitude == null || loc.longitude == null) continue;

        loc._geocodeAttempted = true;
        reverseGeocode(loc.latitude, loc.longitude)
            .then(async (res) => {
                if (!res || !res.displayString) return;
                try {
                    await getManager().updateLocation(loc.id, { address: res.displayString });
                    loc.address = res.displayString;
                    // Re-render if we're still on My gyms so the new address shows up
                    if (currentTab === 'gyms' && !currentGymDetail && !currentBrandCatalog) {
                        renderEquipmentLibrary();
                    }
                } catch (err) {
                    console.warn('Failed to persist geocoded address:', err);
                }
            })
            .catch((err) => console.warn('Geocode failed:', err));
    }
}

/**
 * Compute per-gym summary stats: machine count, type mix, lastVisit, isCurrent.
 * Combines legacy `equipment.locations[]` (each equipment doc carries gym names)
 * with the new `location.equipment[]` catalog refs introduced by Phase 0.
 */
function computeGymStats() {
    const currentGym = getSessionLocation();
    const catalog = getCatalogSync();

    // Union of all gym names: saved location docs + any gym name referenced
    // by an equipment record's `locations[]` (covers gyms that have equipment
    // but no canonical location doc yet — common before locations were added
    // as first-class).
    const gymNames = new Set();
    allLocations.forEach((loc) => gymNames.add(loc.name));
    allEquipment.forEach((eq) => (eq.locations || []).forEach((l) => l && gymNames.add(l)));

    const locByName = new Map(allLocations.map((l) => [l.name, l]));

    const stats = [];
    for (const name of gymNames) {
        const loc = locByName.get(name);

        // Legacy: equipment docs tagged with this gym name
        const legacyAtGym = allEquipment.filter((e) => (e.locations || []).includes(name));

        // New: catalog refs on the location doc itself
        const catalogRefs = (loc && Array.isArray(loc.equipment)) ? loc.equipment : [];

        const typeCounts = new Map();
        const bump = (type) => {
            const t = type || 'Other';
            typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
        };
        legacyAtGym.forEach((e) => bump(e.equipmentType));
        catalogRefs.forEach((item) => {
            const resolved = resolveCatalogRef(item.catalogRef, catalog);
            bump(resolved?.machine?.type || resolved?.line?.type);
        });

        const typeMix = [...typeCounts.entries()]
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count);

        // Build a human-readable location subtitle. Prefer the persisted
        // `address` (set by the reverse-geocoder backfill), then fall back to
        // shortened coordinates. Missing → null so the meta line just skips it.
        let locationStr = loc?.address || null;
        if (!locationStr && loc?.latitude != null && loc?.longitude != null) {
            const lat = Number(loc.latitude).toFixed(3);
            const lng = Number(loc.longitude).toFixed(3);
            locationStr = `${lat}, ${lng}`;
        }

        stats.push({
            name,
            locationStr,
            lastVisit: loc?.lastVisit || null,
            count: legacyAtGym.length + catalogRefs.length,
            typeMix,
            isCurrent: !!currentGym && currentGym === name,
            id: loc?.id || null,
        });
    }

    // Sort: current gym first, then by count desc, then alphabetical
    stats.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
    });

    return stats;
}

/**
 * Render a single gym card with the type-mix bar + legend.
 */
function renderGymCard(gym) {
    const typeSlug = (t) => slugType(t);
    // Mix segments carry their proportion as a data attribute. Inline `style=`
    // would blow the design-audit budget; instead applyGymMixBarFlex() walks
    // the rendered DOM and sets `element.style.flexGrow` (allowed per the
    // truly-dynamic-values exception in CLAUDE.md design rule #8).
    const mixBar = gym.typeMix.length > 0
        ? gym.typeMix.map((m) =>
            `<div class="gym-card__mix-seg gym-card__mix-seg--${typeSlug(m.type)}" data-mix-flex="${m.count}"></div>`
        ).join('')
        : `<div class="gym-card__mix-seg gym-card__mix-seg--other" data-mix-flex="1"></div>`;

    const legend = gym.typeMix.slice(0, 4).map((m) => `
        <span class="gym-card__legend-item">
            <span class="gym-card__legend-dot gym-card__legend-dot--${typeSlug(m.type)}"></span>
            <span class="gym-card__legend-label">${escapeHtml(typeShortLabel(m.type))}</span>
            <span class="gym-card__legend-count">${m.count}</span>
        </span>
    `).join('');

    // Only include parts we actually have — never fall back to a "no address"
    // placeholder when the data isn't there.
    const metaParts = [
        gym.locationStr,
        gym.lastVisit ? `Last visit ${relativeTime(gym.lastVisit)}` : null,
    ].filter(Boolean).join(' · ');

    const onclickArg = gym.id ? `'${escapeAttr(gym.id)}'` : `null, '${escapeAttr(gym.name)}'`;

    return `
        <button class="gym-card${gym.isCurrent ? ' is-here' : ''}"
                onclick="openGymDetail(${onclickArg})"
                aria-label="${escapeAttr(gym.name)}, ${gym.count} machines${gym.isCurrent ? ', you are here' : ''}">
            <div class="gym-card__head">
                <div class="gym-card__info">
                    <span class="gym-card__name">${escapeHtml(gym.name)}${gym.isCurrent ? '<span class="gym-card__here-pill">Here</span>' : ''}</span>
                    ${metaParts ? `<span class="gym-card__meta">${escapeHtml(metaParts)}</span>` : ''}
                </div>
                <span class="gym-card__count">${gym.count}</span>
                <i class="fas fa-chevron-right gym-card__chev"></i>
            </div>
            <div class="gym-card__mix" aria-hidden="true">${mixBar}</div>
            <div class="gym-card__legend">${legend}</div>
        </button>
    `;
}

/**
 * Render the Library tab — search + (existing) location filter + body-part-grouped
 * compact rows.
 */
function renderLibraryTab() {
    // Collect all locations for filter pills (legacy filter — kept for now)
    const locationSet = new Set();
    allEquipment.forEach((eq) => {
        (eq.locations || []).forEach((l) => locationSet.add(l));
    });
    const locations = Array.from(locationSet).sort();

    // Apply search filter
    let filtered = allEquipment;
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter((eq) =>
            eq.name?.toLowerCase().includes(term) ||
            eq.brand?.toLowerCase().includes(term) ||
            eq.line?.toLowerCase().includes(term) ||
            eq.function?.toLowerCase().includes(term) ||
            eq.equipmentType?.toLowerCase().includes(term) ||
            (eq.exerciseTypes || []).some((t) => t.toLowerCase().includes(term))
        );
    }
    if (currentLocationFilter) {
        filtered = filtered.filter((eq) =>
            (eq.locations || []).includes(currentLocationFilter)
        );
    }

    // The search toggle must always be present — someone with no saved gyms
    // still needs to search their equipment. Only the location filter pills
    // are gated on having locations.
    const filterHTML = `
        <div class="equip-filter-row">
            <button class="btn-icon-sm" onclick="toggleEquipmentSearch()" aria-label="Search">
                <i class="fas fa-search"></i>
            </button>
            ${locations.length > 0 ? `
            <div class="equip-location-pills">
                <button class="filter-pill ${!currentLocationFilter ? 'active' : ''}"
                        onclick="filterEquipmentByLocation(null)">All gyms</button>
                ${locations.map((loc) => `
                    <button class="filter-pill ${currentLocationFilter === loc ? 'active' : ''}"
                            onclick="filterEquipmentByLocation('${escapeAttr(loc)}')">${escapeHtml(loc)}</button>
                `).join('')}
            </div>` : ''}
        </div>
    `;

    const searchHTML = `
        <div class="equip-search-bar ${currentSearchTerm ? '' : 'hidden'}" id="equip-search-bar">
            <div class="equip-lib-search ${currentSearchTerm ? 'equip-lib-search--with-clear' : ''}">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search equipment, brand, line, exercises…"
                       value="${escapeAttr(currentSearchTerm)}"
                       oninput="filterEquipmentBySearch(this.value)"
                       onfocus="setTimeout(() => this.scrollIntoView({ block: 'start' }), 200)">
                ${currentSearchTerm ? `<button class="equip-lib-search__clear" onclick="filterEquipmentBySearch('')" aria-label="Clear search">✕</button>` : ''}
            </div>
        </div>
    `;

    let listHTML;
    if (filtered.length === 0) {
        listHTML = currentSearchTerm ? `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>No matches found</p>
                <p class="empty-state-hint">Try a different brand, line, or exercise name.</p>
            </div>
        ` : `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>No equipment yet</p>
                <p class="empty-state-hint">Equipment gets saved as you use it in workouts — or add it from the Catalog tab.</p>
            </div>
        `;
    } else {
        listHTML = renderBodyPartView(filtered);
    }

    return filterHTML + searchHTML +
        `<div class="equip-lib-list equip-lib-list--compact" id="equip-lib-list-wrap">${listHTML}</div>`;
}

/**
 * Render the Catalog tab — sticky search at the top, then either the brand
 * tile grid + "Popular at <gym>" (default) or flat search results when the
 * user is typing.
 */
function renderCatalogTab() {
    const term = catalogSearchTerm.trim();
    const catalog = getCatalogSync();

    const searchHTML = `
        <div class="qa-sheet__search catalog-search">
            <input type="text" id="catalog-search-input"
                   class="qa-sheet__search-input"
                   placeholder="Search 1.3k catalog machines…"
                   value="${escapeAttr(catalogSearchTerm)}"
                   oninput="setCatalogSearch(this.value)">
            ${term ? `<button class="qa-sheet__result-count catalog-search__clear" onclick="setCatalogSearch('')" aria-label="Clear search">✕</button>` : ''}
        </div>
    `;

    // Search mode — flat machine results across all brands
    if (term) {
        return searchHTML + renderCatalogSearchResults(catalog, term);
    }

    // Browse mode — brand tile grid + popular-at-current-gym
    const tilesHTML = catalog.map((brand) => {
        const lineCount = brand.lines?.length || 0;
        const machineCount = (brand.lines || []).reduce((s, l) => s + (l.machines?.length || 0), 0);
        return `
            <button class="brand-tile" onclick="openBrandCatalog('${escapeAttr(brand.slug)}')">
                <div class="brand-tile__name">${escapeHtml(brand.name)}</div>
                <div class="brand-tile__meta">${lineCount} line${lineCount !== 1 ? 's' : ''} · ${machineCount}</div>
            </button>
        `;
    }).join('');

    const currentGym = getSessionLocation();
    const popularHTML = currentGym ? renderPopularAtGym(currentGym) : '';

    return searchHTML + `
        <div class="brand-tile-grid">${tilesHTML}</div>
        ${popularHTML}
    `;
}

/**
 * Render flat catalog search results — machines that match `term` across
 * name, brand, line, body-part, or type. Grouped by body part to keep dense
 * lists scannable.
 */
function renderCatalogSearchResults(catalog, term) {
    const t = term.toLowerCase();
    const matches = [];
    for (const brand of catalog) {
        for (const line of brand.lines || []) {
            for (const machine of line.machines || []) {
                const hay = `${machine.name} ${brand.name} ${line.name} ${machine.bodyPart || ''} ${machine.type || line.type || ''}`.toLowerCase();
                if (hay.includes(t)) {
                    matches.push({
                        brand,
                        line,
                        machine,
                        type: machine.type || line.type || 'Other',
                    });
                }
            }
        }
    }

    if (matches.length === 0) {
        return `<div class="empty-state-compact catalog-search__empty">
            <i class="fas fa-search"></i>
            <p>No matches for "${escapeHtml(term)}"</p>
            <p class="empty-state-hint">Try a brand name, machine type, or body part.</p>
        </div>`;
    }

    // Group by body part for scannability
    const grouped = new Map();
    for (const m of matches) {
        const bp = m.machine.bodyPart || 'Multi-Use';
        if (!grouped.has(bp)) grouped.set(bp, []);
        grouped.get(bp).push(m);
    }

    const groupsHTML = BODY_PART_ORDER
        .filter((bp) => grouped.has(bp))
        .map((bp) => {
            const items = grouped.get(bp);
            const config = BODY_PART_CONFIG[bp] || BODY_PART_CONFIG['Multi-Use'];
            const rowsHTML = items.map((m) => {
                const typeInfo = EQUIPMENT_TYPE_ICONS[m.type] || EQUIPMENT_TYPE_ICONS.Other;
                const typeColorClass = `equip-row__icon--${slugType(m.type)}`;
                const owned = findOwnedForCatalogMachine(m.machine);
                const onClick = owned
                    ? `openEquipmentDetail('${escapeAttr(owned.id)}')`
                    : `openCatalogMachineAddToGym('${escapeAttr(m.machine.id)}')`;
                return `
                    <div class="equip-row equip-row--compact" onclick="${onClick}">
                        <div class="equip-row__icon ${typeColorClass}">
                            <i class="fas ${typeInfo.icon}"></i>
                        </div>
                        <div class="equip-row__info">
                            <div class="equip-row__name">${escapeHtml(m.machine.name)}</div>
                            <div class="equip-row__meta">${owned ? 'In your equipment' : `${escapeHtml(m.brand.name)} · ${escapeHtml(m.line.name)}`}</div>
                        </div>
                        <span class="equip-row__type-pill ${typeColorClass}">${escapeHtml(m.type)}</span>
                        <i class="fas ${owned ? 'fa-pen' : 'fa-plus'} equip-row__last" aria-hidden="true" title="${owned ? 'Owned — edit' : 'Add to a gym'}"></i>
                    </div>
                `;
            }).join('');
            return `
                <div class="gym-detail__group-header">
                    <i class="${config.icon}"></i>
                    <span class="gym-detail__group-name">${escapeHtml(bp)}</span>
                    <span class="gym-detail__group-count">${items.length}</span>
                </div>
                ${rowsHTML}
            `;
        }).join('');

    return `
        <div class="catalog-search__summary">${matches.length} match${matches.length !== 1 ? 'es' : ''} across ${grouped.size} body part${grouped.size !== 1 ? 's' : ''}</div>
        <div class="equip-lib-list">${groupsHTML}</div>
    `;
}

/**
 * Update the Catalog tab search term. Preserves keyboard focus + caret on the
 * search input across re-renders so typing isn't interrupted.
 */
export function setCatalogSearch(term) {
    catalogSearchTerm = term;
    renderEquipmentLibrary();
    // Restore focus + caret on the search input after re-render
    const input = document.getElementById('catalog-search-input');
    if (input && document.activeElement !== input) {
        input.focus();
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch { /* ignore */ }
    }
}

/**
 * Render the "Popular at <gym>" section — top equipment at the current gym
 * sorted by descending use count across workout history.
 */
function renderPopularAtGym(gymName) {
    const equipAtGym = allEquipment.filter((e) => (e.locations || []).includes(gymName));
    if (equipAtGym.length === 0) return '';

    // Sort by lastUsed desc (proxy for popular until we count workouts)
    const top = [...equipAtGym]
        .sort((a, b) => String(b.lastUsed || '').localeCompare(String(a.lastUsed || '')))
        .slice(0, 8);

    const rowsHTML = top.map((eq) => {
        const typeInfo = EQUIPMENT_TYPE_ICONS[eq.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
        const typeColorClass = `equip-row__icon--${(eq.equipmentType || 'Other').toLowerCase()}`;
        const displayName = eq.function || eq.name || '—';
        return `
            <div class="equip-row equip-row--compact" onclick="openEquipmentDetail('${escapeAttr(eq.id)}')">
                <div class="equip-row__icon ${typeColorClass}">
                    <i class="fas ${typeInfo.icon}"></i>
                </div>
                <div class="equip-row__info">
                    <div class="equip-row__name">${escapeHtml(displayName)}</div>
                    <div class="equip-row__meta">${escapeHtml(eq.brand || 'Unknown')}${eq.line ? ' · ' + escapeHtml(eq.line) : ''}</div>
                </div>
                <span class="equip-row__last">${eq.lastUsed ? relativeTime(eq.lastUsed) : ''}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="popular-at-gym">
            <div class="popular-at-gym__head">
                <i class="fas fa-map-marker-alt"></i>
                Popular at ${escapeHtml(gymName)}
            </div>
            ${rowsHTML}
        </div>
    `;
}

/**
 * Convert an equipment type name to a CSS class slug ("Plate-Loaded" → "plate-loaded").
 */
function slugType(type) {
    return String(type || 'Other').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Short legend label for an equipment type. Keeps the legend compact.
 */
function typeShortLabel(type) {
    const map = {
        'Plate-Loaded': 'Plate',
        Selectorized: 'Stack',
        Machine: 'Machine',
        Cable: 'Cable',
        Rack: 'Rack',
        Bench: 'Bench',
        Cardio: 'Cardio',
        Barbell: 'Barbell',
        Dumbbell: 'Dumbbell',
        Bodyweight: 'Body',
        Other: 'Other',
    };
    return map[type] || 'Other';
}

/**
 * Format an ISO timestamp as a relative time like "3d" / "2 wk" / "1 mo".
 */
/**
 * Compute Pocket Inventory machine-detail stat-grid values: total sessions,
 * heaviest PR across all exercises this equipment supports, and the relative
 * lastUsed timestamp.
 */
function computeEquipmentDetailStats(equipment) {
    const workouts = Array.isArray(AppState.workouts) ? AppState.workouts : [];
    const eqName = equipment.name;
    let sessions = 0;
    for (const w of workouts) {
        const exs = w.exercises || {};
        const hit = Object.keys(exs).some((k) => exs[k]?.equipment === eqName);
        if (hit) sessions += 1;
    }

    let pr = null;
    const exTypes = Array.isArray(equipment.exerciseTypes) ? equipment.exerciseTypes : [];
    for (const exName of exTypes) {
        const prs = getExercisePRs(exName, eqName);
        if (!prs || !prs.maxWeight) continue;
        if (!pr || prs.maxWeight.weight > pr.weight) {
            pr = { weight: prs.maxWeight.weight, reps: prs.maxWeight.reps, exercise: exName };
        }
    }

    return {
        sessions,
        pr,
        lastRel: equipment.lastUsed ? relativeTime(equipment.lastUsed) : '',
    };
}

function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const day = 1000 * 60 * 60 * 24;
    const days = Math.floor(diffMs / day);
    if (days < 1) return 'today';
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)} wk`;
    if (days < 365) return `${Math.floor(days / 30)} mo`;
    return `${Math.floor(days / 365)} yr`;
}

/**
 * Re-render JUST the results list (not the search bar) using the current
 * filters. Used by search/location filtering to avoid blowing away the
 * focused input.
 */
function renderEquipmentLibraryList() {
    const wrap = document.getElementById('equip-lib-list-wrap');
    if (!wrap) {
        // Fallback to full render if the slot doesn't exist yet
        renderEquipmentLibrary();
        return;
    }

    let filtered = allEquipment;
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(eq =>
            eq.name?.toLowerCase().includes(term) ||
            eq.brand?.toLowerCase().includes(term) ||
            eq.line?.toLowerCase().includes(term) ||
            eq.function?.toLowerCase().includes(term) ||
            eq.equipmentType?.toLowerCase().includes(term) ||
            (eq.exerciseTypes || []).some(t => t.toLowerCase().includes(term))
        );
    }
    if (currentLocationFilter) {
        filtered = filtered.filter(eq =>
            (eq.locations || []).includes(currentLocationFilter)
        );
    }

    let html;
    if (filtered.length === 0) {
        html = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>${currentSearchTerm ? 'No matches found' : 'No equipment found'}</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    } else {
        html = renderBodyPartView(filtered);
    }

    wrap.innerHTML = html;
}

/**
 * Render the "By Body Part" view — the equipment library's only grouping.
 * Groups by exercise body part, then by exercise name, then lists equipment.
 */
function renderBodyPartView(filtered) {
    const hierarchy = buildEquipmentHierarchy(filtered);
    let html = '';
    let hasAnyExercise = false;

    for (const bodyPart of BODY_PART_ORDER) {
        const exercises = hierarchy[bodyPart];
        if (!exercises) continue;
        hasAnyExercise = true;

        const exerciseNames = Object.keys(exercises).sort();
        const totalEquipment = exerciseNames.reduce((sum, ex) => sum + exercises[ex].length, 0);
        const config = BODY_PART_CONFIG[bodyPart];

        html += `
            <div class="equip-group-header">
                <div class="equip-group-header__left">
                    <i class="${config.icon}"></i>
                    <span>${bodyPart}</span>
                </div>
                <span class="equip-group-header__count">${exerciseNames.length} exercise${exerciseNames.length !== 1 ? 's' : ''} · ${totalEquipment} machine${totalEquipment !== 1 ? 's' : ''}</span>
            </div>
        `;

        for (const exName of exerciseNames) {
            const equips = exercises[exName];
            const equipId = exName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

            html += `
                <div class="equip-detail-ex-row" onclick="toggleEquipmentExercise('${equipId}')">
                    <div class="equip-detail-ex-row__name">${escapeHtml(exName)}</div>
                    <div class="equip-detail-ex-row__meta">
                        <span class="equip-detail-ex-row__count">${equips.length}</span>
                        <i class="fas fa-chevron-down equip-exercise-chevron" id="chevron-${equipId}"></i>
                    </div>
                </div>
                <div class="equip-nested-list hidden" id="equip-list-${equipId}">
            `;

            for (const equip of equips) {
                const locationNames = (equip.locations || []).join(', ') || '';
                const subtitleParts = [equip.brand, equip.line, locationNames].filter(Boolean);
                const subtitle = subtitleParts.join(' · ');

                html += `
                    <div class="row-card equip-nested-item" onclick="event.stopPropagation(); openEquipmentDetail('${escapeAttr(equip.id)}')">
                        <div class="equip-nested-item__info">
                            <span class="row-card__title">${escapeHtml(equip.name)}</span>
                            ${subtitle ? `<span class="row-card__subtitle">${escapeHtml(subtitle)}</span>` : ''}
                        </div>
                        <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
            }

            html += `</div>`; // close equip-nested-list
        }
    }

    // Equipment with no exercise associations
    const unlinked = filtered.filter(eq => !eq.exerciseTypes || eq.exerciseTypes.length === 0);
    if (unlinked.length > 0) {
        html += `
            <div class="equip-group-header">
                <div class="equip-group-header__left">
                    <i class="fas fa-unlink"></i>
                    <span>Unlinked</span>
                </div>
                <span class="equip-group-header__count">${unlinked.length} machine${unlinked.length !== 1 ? 's' : ''}</span>
            </div>
        `;
        for (const equip of unlinked) {
            const locationNames = (equip.locations || []).join(', ') || '';
            const subtitleParts = [equip.brand, equip.line, locationNames].filter(Boolean);
            const subtitle = subtitleParts.join(' · ');

            html += `
                <div class="row-card equip-nested-item" onclick="openEquipmentDetail('${escapeAttr(equip.id)}')">
                    <div class="equip-nested-item__info">
                        <span class="row-card__title">${escapeHtml(equip.name)}</span>
                        ${subtitle ? `<span class="row-card__subtitle">${escapeHtml(subtitle)}</span>` : ''}
                    </div>
                    <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                </div>
            `;
        }
    }

    if (!hasAnyExercise && unlinked.length === 0) {
        html = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>No equipment found</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    }

    return html;
}

/**
 * Toggle search bar visibility
 */
export function toggleEquipmentSearch() {
    const bar = document.getElementById('equip-search-bar');
    if (bar) {
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
            bar.querySelector('input')?.focus();
        }
    }
}

/**
 * Toggle exercise expand/collapse in the hierarchy
 */
export function toggleEquipmentExercise(equipId) {
    const list = document.getElementById(`equip-list-${equipId}`);
    const chevron = document.getElementById(`chevron-${equipId}`);
    if (!list) return;

    const willOpen = list.classList.contains('hidden');
    list.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('equip-exercise-chevron--open', willOpen);
}

export function filterEquipmentByLocation(location) {
    currentLocationFilter = location;
    // Re-render only the results list — the location pills row is static
    // and doesn't need to be rebuilt for a filter change.
    renderEquipmentLibraryList();
    // Update the active state on the pill row in place.
    document.querySelectorAll('.equip-location-pills .filter-pill').forEach(btn => {
        btn.classList.remove('active');
    });
    const target = location
        ? document.querySelector(`.equip-location-pills [onclick*="'${location.replace(/'/g, "\\'")}"]`)
        : document.querySelector('.equip-location-pills .filter-pill:first-child');
    if (target) target.classList.add('active');
}

export function filterEquipmentBySearch(term) {
    currentSearchTerm = term;
    // CRITICAL: only re-render the results list, NOT the search input.
    // Previously this called renderEquipmentLibrary() which rebuilt the
    // entire DOM including the input, blowing away focus on every keystroke.
    // On iOS that closed the keyboard between characters, making the search
    // unusable.
    renderEquipmentLibraryList();
}

// ===================================================================
// EQUIPMENT DETAIL VIEW
// ===================================================================

export async function openEquipmentDetail(equipmentId) {
    // Find equipment from cache or reload
    let equipment = allEquipment.find(e => e.id === equipmentId);
    if (!equipment) {
        allEquipment = await getManager().getUserEquipment();
        equipment = allEquipment.find(e => e.id === equipmentId);
    }
    if (!equipment) {
        showNotification('Equipment not found', 'error');
        return;
    }

    const typeInfo = EQUIPMENT_TYPE_ICONS[equipment.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
    const exercises = (equipment.exerciseTypes || []).map(name => ({
        name,
        ...findEquipmentExerciseVideo(equipment, name),
    }));
    const locations = equipment.locations || [];
    const notes = equipment.notes || '';

    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Update the static header for detail view (page-header BEM structure).
    // Selector was previously .equip-lib-header which never matched any real
    // element — fixed to target the canonical .page-header in index.html.
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">${escapeHtml(equipment.name)}</div>
            </div>
            <button class="page-header__save" onclick="backToEquipmentList()">Done</button>
        `;
    }

    const currentType = equipment.equipmentType || 'Other';
    const heroFunction = equipment.function || equipment.name || '—';
    const heroSubtitleParts = [equipment.brand, equipment.line].filter(Boolean);
    const heroSubtitle = heroSubtitleParts.join(' · ');
    const heroTypeClass = `equip-row__icon--${currentType.toLowerCase()}`;

    // Compute Pocket Inventory stat grid values (Sessions / PR / Last).
    const detailStats = computeEquipmentDetailStats(equipment);
    const sessionGym = getSessionLocation();

    // Preserve scroll across in-place re-renders so a sheet save doesn't fling
    // the page back to the top — the old full-innerHTML reset's worst tic.
    const prevScroll = container.scrollTop;

    container.innerHTML = `
        <div class="equipment-detail">
            <div class="equip-detail-body">
                <!-- 1. HERO — one tap opens the identity sheet (name/brand/line/function/type) -->
                <div class="equip-detail-hero equip-detail-hero--tap" role="button" tabindex="0"
                     onclick="openEquipmentIdentitySheet('${escapeAttr(equipmentId)}')"
                     aria-haspopup="dialog" aria-label="Edit equipment identity">
                    <div class="equip-detail-hero__icon ${heroTypeClass}">
                        <i class="fas ${typeInfo.icon}"></i>
                    </div>
                    <div class="equip-detail-hero__info">
                        <div class="equip-detail-hero__name">${escapeHtml(heroFunction)}</div>
                        ${heroSubtitle ? `<div class="equip-detail-hero__subtitle">${escapeHtml(heroSubtitle)}</div>` : ''}
                        <span class="equip-detail-hero__type-pill ${heroTypeClass}">${escapeHtml(currentType)}</span>
                    </div>
                    <i class="fas fa-pen equip-detail-hero__edit" aria-hidden="true"></i>
                </div>

                <!-- 2. STAT STRIP — Sessions / PR / Last -->
                <div class="detail-stat-grid">
                    <div class="detail-stat-grid__card">
                        <div class="detail-stat-grid__label">Sessions</div>
                        <div class="detail-stat-grid__value">${detailStats.sessions}</div>
                    </div>
                    <div class="detail-stat-grid__card">
                        <div class="detail-stat-grid__label">PR</div>
                        <div class="detail-stat-grid__value">${detailStats.pr ? `${detailStats.pr.weight}` : '—'}</div>
                        ${detailStats.pr ? `<div class="detail-stat-grid__sub">${detailStats.pr.reps} reps</div>` : ''}
                    </div>
                    <div class="detail-stat-grid__card">
                        <div class="detail-stat-grid__label">Last</div>
                        <div class="detail-stat-grid__value">${detailStats.lastRel || '—'}</div>
                    </div>
                </div>

                <!-- 3. SETUP — base weight (base-weight types only): read-first row → sheet -->
                ${BASE_WEIGHT_TYPES.includes(currentType) ? `
                <div class="sec-head"><h4>Setup</h4></div>
                <div class="row-card" role="button" tabindex="0"
                     onclick="openEquipmentBaseWeightSheet('${escapeAttr(equipmentId)}')" aria-haspopup="dialog">
                    <div class="row-card__icon"><i class="fas fa-weight-hanging"></i></div>
                    <div class="row-card__content">
                        <div class="row-card__title">Base weight</div>
                        <div class="row-card__subtitle">Empty machine / bar</div>
                    </div>
                    <div class="equip-rc-trail">
                        <span class="equip-rc-trail__val">${equipment.baseWeight || 0} ${equipment.baseWeightUnit || 'lbs'}</span>
                        <i class="fas fa-chevron-right" aria-hidden="true"></i>
                    </div>
                </div>` : ''}

                <!-- 4. LOCATIONS — inline chips -->
                <div class="sec-head">
                    <h4>Locations <span class="count">${locations.length}</span></h4>
                    <button class="sec-head__action" onclick="addEquipmentLocation('${escapeAttr(equipmentId)}')">+ Add</button>
                </div>
                <div class="chips equip-locations-chips">
                    ${locations.map((loc) => `
                        <div class="chip active eq-location-chip${sessionGym === loc ? ' eq-location-chip--here' : ''}">
                            <i class="fas fa-map-marker-alt"></i> ${escapeHtml(loc)}
                            ${sessionGym === loc ? '<span class="gym-card__here-pill">Here</span>' : ''}
                            <button class="chip-remove"
                                    onclick="event.stopPropagation(); removeEquipmentLocation('${escapeAttr(equipmentId)}', '${escapeAttr(loc)}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                    ${locations.length === 0 ? '<span class="equip-locations-empty">No locations yet</span>' : ''}
                </div>

                <!-- 5. USED FOR — compact row-cards → per-exercise sheet -->
                <div class="sec-head">
                    <h4>Used for <span class="count">${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span></h4>
                    <button class="sec-head__action" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Assign</button>
                </div>
                ${exercises.map(ex => `
                    <div class="row-card" role="button" tabindex="0"
                         onclick="openEquipmentExerciseSheet('${escapeAttr(equipmentId)}', '${escapeAttr(ex.name)}')" aria-haspopup="dialog">
                        <div class="row-card__icon"><i class="fas fa-dumbbell"></i></div>
                        <div class="row-card__content">
                            <div class="row-card__title">${escapeHtml(ex.name)}</div>
                            <div class="row-card__subtitle">${ex.override ? 'Custom form video' : (ex.inherited ? 'Inherits exercise default' : 'No form video')}</div>
                        </div>
                        <div class="equip-rc-trail">
                            ${ex.effective ? '<i class="fas fa-circle-play equip-rc-trail__video" aria-hidden="true"></i>' : ''}
                            <i class="fas fa-chevron-right" aria-hidden="true"></i>
                        </div>
                    </div>
                `).join('')}
                ${exercises.length === 0 ? '<div class="equip-locations-empty">No exercises yet — tap Assign to link one.</div>' : ''}

                <!-- 6. NOTES — inline -->
                <div class="sec-head"><h4>Notes</h4></div>
                <textarea class="field-input equip-notes"
                          placeholder="e.g., Setting 5 for chest fly, setting 8 for pushdown"
                          oninput="saveEquipmentNotes('${escapeAttr(equipmentId)}', this.value)">${escapeHtml(notes)}</textarea>

                <!-- 7. DANGER — bordered card, honest consequence copy -->
                <div class="equip-danger-card">
                    <button class="danger-action-btn"
                            onclick="deleteEquipmentFromLibrary('${escapeAttr(equipmentId)}')">
                        <i class="fas fa-trash"></i> Delete equipment
                    </button>
                    <div class="equip-danger-card__sub">Your workout history keeps its records — they'll just show as unlinked.</div>
                </div>
            </div>
        </div>
    `;

    if (prevScroll) container.scrollTop = prevScroll;
}

// Resolve an exercise's form-video state for this equipment: an explicit
// per-equipment override, else the exercise-library default it inherits.
// `effective` is what a play button fires (override wins) — mirrors the
// 3-tier resolveFormVideo priority used during an active workout.
function findEquipmentExerciseVideo(equipment, name) {
    const override = equipment.exerciseVideos?.[name] || null;
    let inherited = null;
    if (!override) {
        const lc = (name || '').toLowerCase();
        const match = (AppState.exerciseDatabase || [])
            .find(ex => (ex.name || ex.machine || '').toLowerCase() === lc);
        inherited = match?.video || null;
    }
    return { override, inherited, effective: override || inherited || null };
}

// ── Identity sheet — name / brand / line / function / type behind one tap ──

function renderIdentitySheetBody(equipment) {
    const id = equipment.id;
    const currentType = equipment.equipmentType || 'Other';
    const hasBrand = equipment.brand && equipment.brand !== 'Unknown';
    const brandLabel = hasBrand ? equipment.brand : 'Add';
    const lineLabel = equipment.line || (hasBrand ? 'Add' : 'Pick brand first');
    const funcLabel = equipment.function || 'Add';
    return `
        <div class="field">
            <div class="field-label">Name</div>
            <input class="field-input" value="${escapeAttr(equipment.name)}"
                   onchange="saveEquipmentField('${escapeAttr(id)}', 'name', this.value)">
        </div>
        <div class="field-label">Details</div>
        <button class="equip-id-row" onclick="identitySheetPickField('${escapeAttr(id)}', 'brand')">
            <span class="equip-id-row__k">Brand</span>
            <span class="equip-id-row__v">${escapeHtml(brandLabel)} <i class="fas fa-chevron-right"></i></span>
        </button>
        <button class="equip-id-row" onclick="identitySheetPickField('${escapeAttr(id)}', 'line')">
            <span class="equip-id-row__k">Line</span>
            <span class="equip-id-row__v">${escapeHtml(lineLabel)} <i class="fas fa-chevron-right"></i></span>
        </button>
        <button class="equip-id-row" onclick="identitySheetPickField('${escapeAttr(id)}', 'function')">
            <span class="equip-id-row__k">Function</span>
            <span class="equip-id-row__v">${escapeHtml(funcLabel)} <i class="fas fa-chevron-right"></i></span>
        </button>
        <div class="field-label">Type</div>
        <div class="chips">
            ${EQUIPMENT_TYPES_LIST.map(t => `
                <div class="chip ${currentType === t ? 'active' : ''}"
                     onclick="identitySheetSetType('${escapeAttr(id)}', '${t}')">${t}</div>
            `).join('')}
        </div>
    `;
}

export function openEquipmentIdentitySheet(equipmentId) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    if (!equipment) return;
    mountEquipSheet('equip-identity', {
        title: 'Edit equipment',
        subtitle: 'Identity — everything else stays on the page',
        body: `<div id="equip-identity-body">${renderIdentitySheetBody(equipment)}</div>`,
        actions: `<button class="aw-sheet__action primary" onclick="closeEquipmentIdentitySheet(true, '${escapeAttr(equipmentId)}')">Done</button>`,
        onBackdrop: () => closeEquipmentIdentitySheet(true, equipmentId),
    });
}

export function identitySheetSetType(equipmentId, type) {
    saveEquipmentField(equipmentId, 'equipmentType', type);
    // saveEquipmentField updates the in-memory cache synchronously, so
    // re-rendering the sheet body immediately reflects the new active chip.
    const body = document.getElementById('equip-identity-body');
    const eq = allEquipment.find(e => e.id === equipmentId);
    if (body && eq) body.innerHTML = renderIdentitySheetBody(eq);
}

export function identitySheetPickField(equipmentId, field) {
    // Close the identity sheet first — the field picker (a modal) reopens the
    // detail page on save, so a still-mounted sheet would strand a stale copy
    // over the fresh page.
    closeEquipmentIdentitySheet(false, equipmentId);
    if (field === 'brand') openBrandPicker(equipmentId);
    else if (field === 'line') openLinePicker(equipmentId);
    else openFunctionPicker(equipmentId);
}

export function closeEquipmentIdentitySheet(refresh, equipmentId) {
    dismissEquipSheet('equip-identity');
    if (refresh && equipmentId) openEquipmentDetail(equipmentId);
}

// ── Base-weight sheet ──

export function openEquipmentBaseWeightSheet(equipmentId) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    if (!equipment) return;
    const unit = equipment.baseWeightUnit || 'lbs';
    mountEquipSheet('equip-bw', {
        title: 'Base weight',
        subtitle: 'Empty machine or bar — added to plate weight when logging sets',
        body: `
            <div class="equip-base-weight-row">
                <input type="number" inputmode="decimal" step="0.5"
                       class="equip-base-weight-input" id="equip-bw-input"
                       value="${equipment.baseWeight || 0}"
                       onchange="saveEquipmentBaseWeight('${escapeAttr(equipmentId)}', this.value)">
                <div class="equip-base-weight-unit-toggle">
                    <button class="unit-chip ${unit === 'lbs' ? 'active' : ''}"
                            onclick="setEquipmentBaseWeightUnit('${escapeAttr(equipmentId)}', 'lbs', this)">lb</button>
                    <button class="unit-chip ${unit === 'kg' ? 'active' : ''}"
                            onclick="setEquipmentBaseWeightUnit('${escapeAttr(equipmentId)}', 'kg', this)">kg</button>
                </div>
            </div>
            <div class="equip-base-weight-hint">Shown in the plate calculator and added on top of plate weight.</div>
        `,
        actions: `<button class="aw-sheet__action primary" onclick="closeEquipmentBaseWeightSheet('${escapeAttr(equipmentId)}')">Done</button>`,
        onBackdrop: () => closeEquipmentBaseWeightSheet(equipmentId),
    });
}

export function closeEquipmentBaseWeightSheet(equipmentId) {
    dismissEquipSheet('equip-bw');
    if (equipmentId) openEquipmentDetail(equipmentId);
}

// ── Used-for sheet — Remove / edit form video / open video ──

export function openEquipmentExerciseSheet(equipmentId, exerciseName) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    if (!equipment) return;
    const { override, inherited, effective } = findEquipmentExerciseVideo(equipment, exerciseName);
    mountEquipSheet('equip-uf', {
        title: exerciseName,
        subtitle: 'Form video for this exercise on this equipment',
        body: `
            <div class="field">
                <div class="field-label">Form video URL</div>
                <input type="url" class="field-input" id="equip-uf-video"
                       placeholder="${inherited ? 'Override — leave blank to inherit' : 'YouTube URL'}"
                       value="${escapeAttr(override || '')}"
                       onchange="saveEquipmentExerciseVideoFromLib('${escapeAttr(equipmentId)}', '${escapeAttr(exerciseName)}', this.value)">
                ${inherited ? '<div class="equip-uf-inherits"><i class="fas fa-arrow-up-from-bracket"></i> Inherits exercise default</div>' : ''}
            </div>
            ${effective ? `<button class="equip-sheet-row" onclick="awShowFormVideo('${escapeAttr(effective)}', '${escapeAttr(exerciseName)}')"><i class="fas fa-circle-play"></i> Play form video</button>` : ''}
            <button class="equip-sheet-row equip-sheet-row--danger" onclick="removeExerciseFromEquipSheet('${escapeAttr(equipmentId)}', '${escapeAttr(exerciseName)}')"><i class="fas fa-trash"></i> Remove from this equipment</button>
        `,
        actions: `<button class="aw-sheet__action primary" onclick="closeEquipmentExerciseSheet('${escapeAttr(equipmentId)}')">Done</button>`,
        onBackdrop: () => closeEquipmentExerciseSheet(equipmentId),
    });
}

export function removeExerciseFromEquipSheet(equipmentId, exerciseName) {
    // Close the sheet first; unassignExercise runs its own confirm and then
    // re-renders the detail page.
    dismissEquipSheet('equip-uf');
    unassignExercise(equipmentId, exerciseName);
}

export function closeEquipmentExerciseSheet(equipmentId) {
    dismissEquipSheet('equip-uf');
    if (equipmentId) openEquipmentDetail(equipmentId);
}

// ── Shared aw-sheet mount/dismiss for the equipment-detail sheets ──

function mountEquipSheet(idBase, { title, subtitle, body, actions, onBackdrop }) {
    // Never stack two detail sheets. Hard-remove any existing one synchronously
    // (not the animated dismiss) so a re-open can't collide ids with a sheet
    // still mid-exit — getElementById would otherwise target the wrong node.
    ['equip-identity', 'equip-bw', 'equip-uf'].forEach(base => {
        document.getElementById(`${base}-backdrop`)?.remove();
        document.getElementById(`${base}-sheet`)?.remove();
    });

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = `${idBase}-backdrop`;
    backdrop.onclick = onBackdrop || (() => dismissEquipSheet(idBase));

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = `${idBase}-sheet`;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">${escapeHtml(title)}</div>
            ${subtitle ? `<div class="aw-sheet__subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="aw-sheet__body">${body}</div>
        <div class="aw-sheet__actions">${actions}</div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
}

function dismissEquipSheet(idBase) {
    const backdrop = document.getElementById(`${idBase}-backdrop`);
    const sheet = document.getElementById(`${idBase}-sheet`);
    if (!backdrop && !sheet) return;
    if (backdrop) backdrop.classList.remove('visible');
    if (sheet) sheet.classList.remove('visible');
    setTimeout(() => {
        if (backdrop) backdrop.remove();
        if (sheet) sheet.remove();
    }, 300);
}

export function backToEquipmentList() {
    _catalogDetailRef = null;
    // Always restore the canonical header + list view so a future standalone
    // open of the library shows a clean state, even if we're about to hand
    // control back to a caller via returnTo.
    restoreEquipmentLibraryListView();

    // If we got into the library via a returnTo context (e.g., the exercise
    // editor's "Add equipment" button), hand control back instead of landing
    // on the library list. The caller's returnTo is responsible for restoring
    // its own UI.
    if (_libraryReturnContext?.returnTo) {
        const ctx = _libraryReturnContext;
        _libraryReturnContext = null;
        ctx.returnTo(null);
        return;
    }
    return;
}

function restoreEquipmentLibraryListView() {

    // Restore the canonical .page-header for the list view (matches the
    // markup in index.html so the DOM snaps back to its original shape).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Equipment</div>
            </div>
            <button class="page-header__save" onclick="showAddEquipmentFlow()">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
    }

    renderEquipmentLibrary();
}

// ===================================================================
// EQUIPMENT ACTIONS
// ===================================================================

let notesSaveTimeout = null;

export async function saveEquipmentNotes(equipmentId, notes) {
    if (notesSaveTimeout) clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { notes });
            // Update cache
            const eq = allEquipment.find(e => e.id === equipmentId);
            if (eq) eq.notes = notes;
            showNotification('Saved', 'success', 900);
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }, 800);
}

let assigningToEquipmentId = null;

export function assignExerciseToEquipment(equipmentId) {
    assigningToEquipmentId = equipmentId;
    const equipment = allEquipment.find(e => e.id === equipmentId);
    const existing = new Set(equipment?.exerciseTypes || []);

    const exercises = (AppState.exerciseDatabase || [])
        .map(ex => ({ name: ex.name || ex.machine, bodyPart: ex.bodyPart || ex.category || '' }))
        .filter(ex => ex.name && !existing.has(ex.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    // Group by body part
    const groups = new Map();
    exercises.forEach(ex => {
        const group = ex.bodyPart || 'Other';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(ex);
    });

    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    let listHTML = '';
    for (const [group, items] of groups) {
        listHTML += `<div class="equip-group-header"><div class="equip-group-header__left"><span>${escapeHtml(group)}</span></div><span class="equip-group-header__count">${items.length}</span></div>`;
        listHTML += items.map(ex => `
            <div class="equip-detail-ex-row" onclick="confirmAssignExercise('${escapeAttr(ex.name)}')">
                <div class="equip-detail-ex-row__name">${escapeHtml(ex.name)}</div>
                <div class="row-card__action"><i class="fas fa-plus"></i></div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="equip-detail-page">
            <div class="equip-detail-header">
                <button class="btn-icon" onclick="openEquipmentDetail('${escapeAttr(equipmentId)}')" aria-label="Back">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3>Assign Exercise</h3>
            </div>
            <div class="equip-lib-search equip-assign-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search exercises…" oninput="filterAssignList(this.value)">
            </div>
            <div id="assign-exercise-list">
                ${exercises.length === 0 ? '<div class="empty-state-compact"><p>All exercises already assigned</p></div>' : listHTML}
            </div>
        </div>
    `;
}

export function filterAssignList(term) {
    const items = document.querySelectorAll('#assign-exercise-list .equip-lib-item');
    const lower = term.toLowerCase();
    items.forEach(item => {
        const name = item.querySelector('.row-card__title')?.textContent.toLowerCase() || '';
        item.style.display = name.includes(lower) ? '' : 'none';
    });
}

export async function confirmAssignExercise(exerciseName) {
    if (!assigningToEquipmentId) return;
    const equipmentId = assigningToEquipmentId;

    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), {
            exerciseTypes: arrayUnion(exerciseName),
        });

        // Update cache
        const equipment = allEquipment.find(e => e.id === equipmentId);
        if (equipment) {
            if (!equipment.exerciseTypes) equipment.exerciseTypes = [];
            equipment.exerciseTypes.push(exerciseName);
        }

        showNotification(`Assigned "${exerciseName}"`, 'success', 1500);
        assigningToEquipmentId = null;
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error assigning exercise:', error);
        showNotification("Couldn't assign exercise", 'error');
    }
}

export async function unassignExercise(equipmentId, exerciseName) {
    const confirmed = await confirmSheet({
        title: `Remove "${exerciseName}" from this equipment?`,
        message: "Past workouts won't be affected.",
        confirmLabel: 'Remove exercise',
        cancelLabel: 'Keep exercise',
        destructive: true,
    });
    if (!confirmed) return;

    try {
        const userId = AppState.currentUser.uid;
        const updates = {
            exerciseTypes: arrayRemove(exerciseName),
        };
        // Also remove exercise-specific video if any
        const equipment = allEquipment.find(e => e.id === equipmentId);
        if (equipment?.exerciseVideos?.[exerciseName]) {
            updates[`exerciseVideos.${exerciseName}`] = deleteField();
        }

        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), updates);

        // Update cache
        if (equipment) {
            equipment.exerciseTypes = (equipment.exerciseTypes || []).filter(t => t !== exerciseName);
            if (equipment.exerciseVideos) delete equipment.exerciseVideos[exerciseName];
        }

        showNotification('Exercise removed', 'success', 1500);
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error unassigning exercise:', error);
        showNotification("Couldn't remove exercise", 'error');
    }
}

/**
 * Save video URL from inline input in equipment detail view
 */
export async function saveEquipmentExerciseVideoFromLib(equipmentId, exerciseName, newUrl) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    try {
        const userId = AppState.currentUser.uid;
        const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

        if (!newUrl || newUrl.trim() === '') {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: deleteField() });
            if (equipment?.exerciseVideos) delete equipment.exerciseVideos[exerciseName];
        } else {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: newUrl.trim() });
            if (!equipment.exerciseVideos) equipment.exerciseVideos = {};
            equipment.exerciseVideos[exerciseName] = newUrl.trim();
        }
    } catch (error) {
        console.error('Error saving video:', error);
        showNotification("Couldn't save video", 'error');
    }
}

export async function deleteEquipmentFromLibrary(equipmentId) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    const confirmed = await confirmSheet({
        title: `Delete "${equipment?.name || 'this equipment'}"?`,
        message: "This can't be undone.",
        confirmLabel: 'Delete equipment',
        cancelLabel: 'Keep equipment',
        destructive: true,
    });
    if (!confirmed) return;

    try {
        await getManager().deleteEquipment(equipmentId);
        allEquipment = allEquipment.filter(e => e.id !== equipmentId);

        // Quick-added equipment also lives as a catalogRef on each gym's
        // location.equipment[] — leaving those behind makes a deleted machine
        // reappear in gym views and lets a re-add duplicate it.
        if (equipment?.catalogRef && (equipment.locations || []).length > 0) {
            if (allLocations.length === 0) {
                try {
                    const locs = await getManager().getUserLocations();
                    if (Array.isArray(locs)) allLocations = locs;
                } catch { /* stale refs heal on the next gym-view render */ }
            }
            for (const locName of equipment.locations) {
                await syncCatalogRefOnLocation(equipment.catalogRef, locName, false);
            }
        }

        showNotification('Equipment deleted', 'success', 1500);
        backToEquipmentList();
    } catch (error) {
        console.error('Error deleting equipment:', error);
        showNotification("Couldn't delete equipment", 'error');
    }
}

// ===================================================================
// ADD EQUIPMENT FLOW — 3-step state machine (Phase 3)
//
// Step 1: Pick Brand (existing + catalog + "New Brand")
// Step 2: Pick Line (existing + catalog + "New Line" + "Skip")
// Step 3: Name Function + Type + live preview
//
// The catalog provides a large initial pool of brands/lines; the user's own
// equipment augments it. State lives in `addFlowState` so back/forward and
// "Add Another" preserve the selection.
// ===================================================================

// Type vocabulary matches the v3 spec (EQUIPMENT-OVERHAUL-IMPLEMENTATION.md L60).
// "Machine" stays in the list for legacy records that haven't been reclassified
// yet by the catalog migration; new equipment should pick Plate-Loaded or
// Selectorized instead.
const EQUIPMENT_TYPES_LIST = [
    'Plate-Loaded', 'Selectorized', 'Machine',
    'Cable', 'Barbell', 'Dumbbell', 'Bench', 'Rack',
    'Cardio', 'Bodyweight', 'Other',
];

/** Equipment types that have a meaningful base/bar weight */
const BASE_WEIGHT_TYPES = ['Plate-Loaded', 'Machine', 'Barbell', 'Cable', 'Bench', 'Rack'];

/** Suggested default base weights when switching type */
const BASE_WEIGHT_SUGGESTIONS = {
    Barbell: 45,
    Cable: 5,
};

const addFlowState = {
    brand: null,    // selected brand name
    line: null,     // selected line name (null = skipped)
    func: '',       // typed function name
    type: 'Machine',
    name: null,     // user-edited override; null = use addFlowGeneratedName()
};

// Add-flow suggestion helpers removed — the cascading picker (fieldPickerState
// with mode='add') now calls getDetail{Brand,Line,Function}Suggestions directly
// via computeFieldPickerScope, so there's one code path for both modes.

// ---------------------------------------------------------------------------
// Detail-view datalist suggestions — give the Brand/Line/Function inputs the
// same catalog-backed dropdowns the Add flow has, so users editing existing
// equipment can pick from known options instead of typing free-form (which
// risked typos like "M1" instead of "M-1").
// ---------------------------------------------------------------------------

/**
 * Suggestion-helper return shape: `[{ name, source }]` where `source` is
 * `'catalog'` (from EQUIPMENT_CATALOG) or `'user'` (derived from the user's
 * own equipment records). Catalog entries take priority when a value exists
 * in both — prevents a user's old record with the same name from being
 * labelled as their own custom entry.
 */
function mergeSuggestions(catalogNames, userNames) {
    const catalogSet = new Set(catalogNames.map(n => n.toLowerCase()));
    const out = catalogNames.map(name => ({ name, source: 'catalog' }));
    for (const name of userNames) {
        if (!catalogSet.has(name.toLowerCase())) {
            out.push({ name, source: 'user' });
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function getDetailBrandSuggestions() {
    const userBrands = [...new Set(
        (allEquipment || [])
            .map(e => e.brand)
            .filter(b => b && b !== 'Unknown')
    )];
    const catalogBrands = EQUIPMENT_CATALOG.map(b => b.brand);
    return mergeSuggestions(catalogBrands, userBrands);
}

function getDetailLineSuggestions(brand) {
    if (!brand) return [];
    const brandLC = brand.toLowerCase();
    const userLines = [...new Set(
        (allEquipment || [])
            .filter(e => e.brand?.toLowerCase() === brandLC && e.line)
            .map(e => e.line)
    )];
    const catalogEntry = EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC);
    const catalogLines = catalogEntry ? catalogEntry.lines.map(l => l.name) : [];
    return mergeSuggestions(catalogLines, userLines);
}

/**
 * Returns the machine options shown in the Function picker. Strictly scoped to
 * the given brand + line so the user doesn't get a wall of unrelated machines.
 *   - Both brand + line match catalog → that line's machines.
 *   - Only brand matches → that brand's machines across all its lines.
 *   - Neither matches → user's own custom functions for this combo (no catalog
 *     noise). The picker UI also shows a hint when this happens.
 */
/**
 * Look up the catalog parent brand/line/type for a given machine (function) name,
 * scoped by whatever brand/line context the user has already chosen. Used by the
 * function picker to auto-fill the upstream pickers when the catalog can prove
 * the relationship — picking "Iso-Lateral Bench Press" from the picker should
 * fill in "Hammer Strength · Plate-Loaded" without the user having to back-track.
 *
 * Resolution rules:
 *   - If currentBrand + currentLine match a catalog entry that owns this
 *     machine, no auto-fill is needed (the scope already matches).
 *   - If only currentBrand is set, we look for exactly one line under that
 *     brand that owns the machine. Multiple matches → ambiguous, return null.
 *   - If neither is set, we look across the whole catalog. If exactly one
 *     {brand, line} pair owns the name, return it. Otherwise ambiguous.
 *
 * Returns null when no match is found, when the match is ambiguous, or when
 * the user picked a name that came from their own equipment (not the catalog).
 */
function findCatalogParentsForMachine(machineName, currentBrand, currentLine) {
    const nameLC = (machineName || '').toLowerCase();
    if (!nameLC) return null;
    const brandLC = (currentBrand || '').toLowerCase();
    const lineLC = (currentLine || '').toLowerCase();

    const matches = [];
    for (const brandEntry of EQUIPMENT_CATALOG) {
        if (brandLC && brandLC !== 'unknown' && brandEntry.brand.toLowerCase() !== brandLC) continue;
        for (const lineEntry of brandEntry.lines) {
            if (lineLC && lineEntry.name.toLowerCase() !== lineLC) continue;
            const machine = lineEntry.machines.find(m => m.name.toLowerCase() === nameLC);
            if (machine) {
                matches.push({
                    brand: brandEntry.brand,
                    line: lineEntry.name,
                    type: machine.type || lineEntry.type,
                });
            }
        }
    }

    return matches.length === 1 ? matches[0] : null;
}

function getDetailFunctionSuggestions(brand, line) {
    const brandLC = (brand || '').toLowerCase();
    const lineLC = (line || '').toLowerCase();

    const userFns = [...new Set(
        (allEquipment || [])
            .filter(e =>
                e.brand?.toLowerCase() === brandLC &&
                (e.line || '').toLowerCase() === lineLC &&
                e.function
            )
            .map(e => e.function)
    )];

    let catalogFns = [];
    const brandEntry = brandLC && brandLC !== 'unknown'
        ? EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC)
        : null;

    if (brandEntry) {
        const lineEntry = line
            ? brandEntry.lines.find(l => l.name.toLowerCase() === lineLC)
            : null;
        if (lineEntry) {
            catalogFns = lineEntry.machines.map(m => m.name);
        } else if (!line) {
            catalogFns = brandEntry.lines.flatMap(l => l.machines.map(m => m.name));
        }
    }

    return mergeSuggestions(catalogFns, userFns);
}

// ---------------------------------------------------------------------------
// Generic field picker — one bottom-sheet modal drives selection for Brand,
// Line, and Function. The three openBrandPicker/openLinePicker/openFunctionPicker
// entry points below all delegate here. Cascading clear: changing brand clears
// line + function; changing line clears function.
// ---------------------------------------------------------------------------

const fieldPickerState = {
    mode: 'edit',         // 'edit' | 'add'
    equipmentId: null,    // only used in edit mode
    field: null,          // 'brand' | 'line' | 'function'
    searchTerm: '',
    customMode: false,
};

// Edit-mode entry points — open the picker scoped to an existing equipment doc.
export function openBrandPicker(equipmentId)    { openFieldPicker(equipmentId, 'brand', 'edit'); }
export function openLinePicker(equipmentId)     { openFieldPicker(equipmentId, 'line', 'edit'); }
export function openFunctionPicker(equipmentId) { openFieldPicker(equipmentId, 'function', 'edit'); }

// Add-mode entry points — open the picker scoped to the in-progress addFlowState draft.
export function openAddFlowBrandPicker()    { openFieldPicker(null, 'brand', 'add'); }
export function openAddFlowLinePicker()     { openFieldPicker(null, 'line', 'add'); }
export function openAddFlowFunctionPicker() { openFieldPicker(null, 'function', 'add'); }

function openFieldPicker(equipmentId, field, mode = 'edit') {
    if (mode === 'edit' && !allEquipment.find(e => e.id === equipmentId)) return;
    fieldPickerState.mode = mode;
    fieldPickerState.equipmentId = mode === 'edit' ? equipmentId : null;
    fieldPickerState.field = field;
    fieldPickerState.searchTerm = '';
    fieldPickerState.customMode = false;
    renderFieldPicker();
    openModal('function-picker-modal');
}

/**
 * Build the {options, currentValue, title, scopeLabel, scopeHint, placeholder}
 * for whichever field we're editing. Separating this from the render lets the
 * same modal chrome handle all three pickers.
 */
function computeFieldPickerScope() {
    const { equipmentId, field, mode } = fieldPickerState;
    // In add mode, read from the in-progress addFlowState draft. addFlowState
    // uses `func` for the function field — translate here so downstream logic
    // is identical across both modes.
    const eq = mode === 'add'
        ? { brand: addFlowState.brand, line: addFlowState.line, function: addFlowState.func }
        : (allEquipment.find(e => e.id === equipmentId) || {});

    if (field === 'brand') {
        return {
            options: getDetailBrandSuggestions(),
            currentValue: eq.brand && eq.brand !== 'Unknown' ? eq.brand : null,
            title: 'Select Brand',
            scopeLabel: 'Catalog + your equipment',
            scopeHint: null,
            placeholder: 'e.g., Hammer Strength',
        };
    }

    if (field === 'line') {
        const hasBrand = eq.brand && eq.brand !== 'Unknown';
        return {
            options: hasBrand ? getDetailLineSuggestions(eq.brand) : [],
            currentValue: eq.line || null,
            title: 'Select Line',
            scopeLabel: hasBrand ? eq.brand : 'No brand set',
            scopeHint: hasBrand ? null : 'Set a brand first so we can filter the line list.',
            placeholder: 'e.g., Fit Evo, Plate-Loaded',
        };
    }

    // field === 'function'
    const brand = eq.brand;
    const line = eq.line;
    const brandLC = (brand || '').toLowerCase();
    const brandEntry = brandLC && brandLC !== 'unknown'
        ? EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC)
        : null;
    const lineEntry = brandEntry && line
        ? brandEntry.lines.find(l => l.name.toLowerCase() === line.toLowerCase())
        : null;

    let scopeLabel;
    let scopeHint = null;
    if (brandEntry && lineEntry) {
        scopeLabel = `${brandEntry.brand} · ${lineEntry.name}`;
    } else if (brandEntry && line) {
        scopeLabel = brandEntry.brand;
        scopeHint = `Line "${line}" isn't in the catalog — showing all ${brandEntry.brand} machines.`;
    } else if (brandEntry) {
        scopeLabel = brandEntry.brand;
        scopeHint = 'No line selected — showing every machine for this brand.';
    } else if (brand && brand !== 'Unknown') {
        scopeLabel = brand;
        scopeHint = `Brand "${brand}" isn't in the catalog — showing your custom entries only.`;
    } else {
        scopeLabel = 'No brand set';
        scopeHint = 'Set a brand on this equipment to see catalog machines.';
    }

    return {
        options: getDetailFunctionSuggestions(brand, line),
        currentValue: eq.function || null,
        title: 'Select Function',
        scopeLabel,
        scopeHint,
        placeholder: 'e.g., Leg Extension',
    };
}

function renderFieldPicker() {
    const modal = document.getElementById('function-picker-modal');
    const content = modal?.querySelector('.modal-content');
    if (!modal || !content) return;

    const { equipmentId, field, searchTerm, customMode } = fieldPickerState;
    const { options, currentValue, title, scopeLabel, scopeHint, placeholder } = computeFieldPickerScope();

    const term = searchTerm.trim().toLowerCase();
    const filtered = term
        ? options.filter(o => o.name.toLowerCase().includes(term))
        : options;

    const rowsHTML = filtered.length > 0
        ? filtered.map(opt => `
            <button class="function-picker__row ${opt.name === currentValue ? 'is-current' : ''}"
                    onclick="selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', '${escapeAttr(opt.name)}')">
                <span class="function-picker__row-name">${escapeHtml(opt.name)}</span>
                ${opt.source === 'user' ? '<span class="function-picker__row-source">your equipment</span>' : ''}
                ${opt.name === currentValue ? '<i class="fas fa-check function-picker__row-check"></i>' : ''}
            </button>
        `).join('')
        : `<div class="function-picker__empty">No matches — use Custom below to enter a new one.</div>`;

    const customHTML = customMode
        ? `
            <div class="function-picker__custom-row">
                <input type="text" class="function-picker__custom-input" id="function-picker-custom-input"
                       placeholder="${escapeAttr(placeholder || 'Enter a custom name…')}"
                       value="${escapeAttr(searchTerm)}"
                       onkeydown="if(event.key==='Enter') selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', this.value.trim())">
                <button class="btn btn-primary function-picker__custom-btn"
                        onclick="selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', document.getElementById('function-picker-custom-input').value.trim())">
                    Use
                </button>
            </div>
        `
        : `
            <button class="function-picker__custom-toggle" onclick="showFieldPickerCustom()">
                <i class="fas fa-pen"></i> Custom name…
            </button>
        `;

    content.innerHTML = `
        <div class="function-picker">
            <div class="function-picker__header">
                <h3 class="function-picker__title">${escapeHtml(title)}</h3>
                <div class="function-picker__scope">${escapeHtml(scopeLabel)}</div>
                <button class="close-btn" aria-label="Close" onclick="closeFieldPicker()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${scopeHint ? `<div class="function-picker__hint">${escapeHtml(scopeHint)}</div>` : ''}
            <div class="function-picker__search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search…"
                       value="${escapeAttr(searchTerm)}"
                       oninput="filterFieldPicker(this.value)">
            </div>
            <div class="function-picker__list" id="function-picker-list">${rowsHTML}</div>
            ${customHTML}
        </div>
    `;

    if (customMode) {
        setTimeout(() => {
            const input = document.getElementById('function-picker-custom-input');
            input?.focus();
            input?.setSelectionRange(input.value.length, input.value.length);
        }, 30);
    }
}

/**
 * Re-render JUST the result rows of the function picker — leaves the
 * search input untouched. Previously this re-rendered the whole modal
 * content, blowing away the input on every keystroke and dismissing the
 * iOS keyboard.
 */
function renderFieldPickerList() {
    const list = document.getElementById('function-picker-list');
    if (!list) {
        renderFieldPicker();
        return;
    }
    const { equipmentId, field, searchTerm } = fieldPickerState;
    const { options, currentValue } = computeFieldPickerScope();
    const term = (searchTerm || '').trim().toLowerCase();
    const filtered = term
        ? options.filter(o => o.name.toLowerCase().includes(term))
        : options;
    list.innerHTML = filtered.length > 0
        ? filtered.map(opt => `
            <button class="function-picker__row ${opt.name === currentValue ? 'is-current' : ''}"
                    onclick="selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', '${escapeAttr(opt.name)}')">
                <span class="function-picker__row-name">${escapeHtml(opt.name)}</span>
                ${opt.source === 'user' ? '<span class="function-picker__row-source">your equipment</span>' : ''}
                ${opt.name === currentValue ? '<i class="fas fa-check function-picker__row-check"></i>' : ''}
            </button>
        `).join('')
        : `<div class="function-picker__empty">No matches — use Custom below to enter a new one.</div>`;
}

export function filterFieldPicker(term) {
    fieldPickerState.searchTerm = term || '';
    // Only update the result rows — leaves the search input intact so iOS
    // keeps the keyboard open and focus stays in the field.
    renderFieldPickerList();
}

export function showFieldPickerCustom() {
    fieldPickerState.customMode = true;
    renderFieldPicker();
}

/**
 * Save the picked value for the active field. Cascading clear: changing
 * `brand` nulls both `line` and `function`; changing `line` nulls `function`.
 * Updates Firestore + the local cache, closes the modal, and re-renders the
 * detail page so all three picker rows show the new state.
 */
export async function selectFieldValue(equipmentId, field, value) {
    const v = (value || '').trim();
    if (!v) {
        showNotification('Enter a value', 'error', 1500);
        return;
    }

    // Add mode — route the selection to the in-progress addFlowState draft.
    // addFlowState uses `func` for the function field; cascade clears apply
    // identically (brand → clear line + func; line → clear func).
    if (fieldPickerState.mode === 'add') {
        if (field === 'brand') {
            addFlowState.brand = v;
            addFlowState.line = null;
            addFlowState.func = '';
        } else if (field === 'line') {
            addFlowState.line = v;
            addFlowState.func = '';
        } else {
            addFlowState.func = v;
            // Catalog auto-fill: if the chosen machine name uniquely maps to a
            // brand/line in the catalog, populate the upstream pickers so the
            // user doesn't have to back out and refill them.
            const parents = findCatalogParentsForMachine(v, addFlowState.brand, addFlowState.line);
            if (parents) {
                if (!addFlowState.brand || addFlowState.brand === 'Unknown') addFlowState.brand = parents.brand;
                if (!addFlowState.line) addFlowState.line = parents.line;
                if (parents.type) addFlowState.type = parents.type;
            }
        }
        closeModal('function-picker-modal');
        renderAddFlow();
        return;
    }

    // Edit mode — persist to Firestore + the local cache, then re-render the
    // detail page. Cascade clears are applied in a single update object.
    const update = { [field]: v };
    if (field === 'brand') { update.line = null; update.function = null; }
    if (field === 'line')  { update.function = null; }
    if (field === 'function') {
        // Catalog auto-fill — same logic as add mode but reads the existing doc
        // so we only fill fields the user hasn't already set.
        const eq = allEquipment.find(e => e.id === equipmentId) || {};
        const parents = findCatalogParentsForMachine(v, eq.brand, eq.line);
        if (parents) {
            if (!eq.brand || eq.brand === 'Unknown') update.brand = parents.brand;
            if (!eq.line) update.line = parents.line;
            if (parents.type && !eq.equipmentType) update.equipmentType = parents.type;
        }
    }

    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), update);

        const eq = allEquipment.find(e => e.id === equipmentId);
        if (eq) Object.assign(eq, update);

        closeModal('function-picker-modal');
        openEquipmentDetail(equipmentId);
    } catch (err) {
        console.error(`Error saving ${field}:`, err);
        showNotification(`Couldn't save ${field}`, 'error');
    }
}

export function closeFieldPicker() {
    closeModal('function-picker-modal');
}

function addFlowGeneratedName() {
    const { brand, line, func } = addFlowState;
    if (brand && line && func) return `${brand} ${line} — ${func}`;
    if (brand && func)         return `${brand} — ${func}`;
    if (brand && line)         return `${brand} ${line}`;
    if (func)                  return func;
    return brand || '';
}

// Optional return context — when set, confirmAddEquipment / backToEquipmentList
// hand control back to the caller (exercise editor, active workout) instead of
// landing on the library list. Cleared by clearLibraryReturnContext() when the
// trip completes so the next standalone open of the library works normally.
let _libraryReturnContext = null;

export function clearLibraryReturnContext() {
    _libraryReturnContext = null;
}

/**
 * Set a return context BEFORE opening any library entry point
 * (openEquipmentDetail, showAddEquipmentFlow). The library will route back to
 * `returnTo(equipmentOrNull)` instead of the library list when the user is
 * done. Use this when calling into the library from another page so you can
 * restore that page's UI on return.
 */
export function setLibraryReturnContext({ assignToExercise = null, returnTo = null } = {}) {
    _libraryReturnContext = {
        assignToExercise,
        returnTo: typeof returnTo === 'function' ? returnTo : null,
    };
}

/**
 * Open the catalog-aware Add Equipment flow.
 *
 * When called with `{ assignToExercise, returnTo }`, the new equipment is
 * auto-associated with that exercise on save and `returnTo(equipment)` is
 * invoked instead of opening the equipment detail view. Used by the exercise
 * editor to add new equipment without leaving the page.
 */
export function showAddEquipmentFlow(opts = {}) {
    addFlowState.brand = null;
    addFlowState.line = null;
    addFlowState.func = '';
    addFlowState.type = 'Machine';
    addFlowState.name = null;
    if (opts.assignToExercise || opts.returnTo) {
        _libraryReturnContext = {
            assignToExercise: opts.assignToExercise || null,
            returnTo: typeof opts.returnTo === 'function' ? opts.returnTo : null,
        };
    }
    renderAddFlow();
}

/**
 * Single-page Add Equipment form. Uses the same cascading Brand → Line →
 * Function picker as the detail view (opened via openAddFlow*Picker entry
 * points that set fieldPickerState.mode = 'add'). Type is a chip row below
 * the pickers; preview string shows the generated display name.
 */
function renderAddFlow() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Page header — back always returns to the list (no more steps).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Add Equipment</div>
            </div>
        `;
    }

    const { brand, line, func, type, name } = addFlowState;
    const displayedName = name ?? (addFlowGeneratedName() || '');
    const hintHidden = name !== null;

    container.innerHTML = `
        <div class="add-flow">
            <div class="add-step__label">New Equipment</div>
            <div class="add-step__hint">Pick a brand, its product line, then the specific machine.</div>

            <div class="field">
                <div class="field-label">Brand</div>
                <button class="field-picker-row" onclick="openAddFlowBrandPicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!brand ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(brand || 'Select a brand…')}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="field">
                <div class="field-label">Line</div>
                <button class="field-picker-row" onclick="openAddFlowLinePicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!line ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(line || (brand ? 'Select a line…' : 'Pick brand first'))}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="field">
                <div class="field-label">Function</div>
                <button class="field-picker-row" onclick="openAddFlowFunctionPicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!func ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(func || (brand ? 'Select a function…' : 'Pick brand first'))}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="add-field">
                <div class="add-field__label">Type</div>
                <div class="add-type-chips">
                    ${EQUIPMENT_TYPES_LIST.map((t) => `
                        <button class="add-type-chip ${type === t ? 'is-active' : ''}"
                                onclick="addFlowSetType('${t}')">
                            ${t}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="add-field">
                <div class="add-field__label">Name</div>
                <input type="text" class="add-field__input" id="add-flow-name"
                       value="${escapeAttr(displayedName)}"
                       oninput="addFlowSetName(this.value)">
                <div class="add-step__hint" id="add-flow-name-hint"${hintHidden ? ' hidden' : ''}>Auto-named from your picks — edit if needed</div>
            </div>

            <div class="add-step__actions">
                <button class="btn btn-primary" onclick="confirmAddEquipment()">
                    <i class="fas fa-plus"></i> Add Equipment
                </button>
                ${line ? `
                    <button class="btn btn-secondary" onclick="confirmAddEquipment(true)">
                        Add Another to ${escapeHtml(line)}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

export function addFlowSetType(type) {
    if (!EQUIPMENT_TYPES_LIST.includes(type)) return;
    addFlowState.type = type;
    renderAddFlow();
}

// Update the user's name override as they type. Skip the re-render — the input
// holds its own value during typing (full re-renders drop focus on iOS). The
// hint visibility is toggled directly so the "auto-named" affordance vanishes
// the moment the user starts customizing.
export function addFlowSetName(value) {
    const trimmed = (value || '').trim();
    addFlowState.name = trimmed === '' ? null : trimmed;
    const hint = document.getElementById('add-flow-name-hint');
    if (hint) hint.hidden = addFlowState.name !== null;
}

export async function confirmAddEquipment(addAnother = false) {
    const { brand, line, func, type } = addFlowState;
    const cleanFunc = (func || '').trim();

    if (!cleanFunc) {
        showNotification('Enter a function name (e.g., Leg Press)', 'error', 2000);
        return;
    }

    const name = (addFlowState.name && addFlowState.name.trim()) || addFlowGeneratedName();
    const defaultBW = BASE_WEIGHT_SUGGESTIONS[type] || 0;

    // When opened with `assignToExercise`, the new equipment's exerciseTypes
    // gets pre-populated so the caller's exercise picks it up immediately.
    const assignTo = _libraryReturnContext?.assignToExercise || null;

    try {
        const result = await getManager().getOrCreateEquipment(
            name,
            {
                brand: brand || null,
                line: line || null,
                function: cleanFunc,
                equipmentType: type,
                baseWeight: defaultBW,
                baseWeightUnit: 'lbs',
            },
            assignTo,
        );
        if (!result) {
            showNotification("Couldn't add equipment", 'error');
            return;
        }
        allEquipment = await getManager().getUserEquipment();
        AppState._cachedEquipment = allEquipment;

        if (addAnother) {
            showNotification(`Added — ${name}`, 'success', 1200);
            // Stay on step 3, keep brand+line+type, clear function and name override
            // so the next entry generates a fresh name from the new function.
            addFlowState.func = '';
            addFlowState.name = null;
            renderAddFlow();
            setTimeout(() => {
                document.getElementById('add-flow-func')?.focus();
            }, 30);
        } else {
            showNotification('Equipment added', 'success', 1500);
            const ctx = _libraryReturnContext;
            if (ctx?.returnTo) {
                _libraryReturnContext = null;
                // Reset the library to its canonical list view so a future
                // standalone open isn't stuck on the Add Equipment screen.
                restoreEquipmentLibraryListView();
                ctx.returnTo(result);
            } else {
                openEquipmentDetail(result.id);
            }
        }
    } catch (error) {
        console.error('Error adding equipment:', error);
        showNotification("Couldn't add equipment", 'error');
    }
}

// ===================================================================
// BASE WEIGHT ACTIONS
// ===================================================================

let fieldSaveTimeout = null;

export async function removeEquipmentLocation(equipmentId, locationName) {
    try {
        const eq = allEquipment.find(e => e.id === equipmentId);
        if (!eq) return;
        const locations = (eq.locations || []).filter(l => l !== locationName);
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { locations });
        eq.locations = locations;
        AppState._cachedEquipment = allEquipment;
        // Mirror onto the gym's location.equipment[] so the gym view and
        // quick-add's "already at this gym" state stay truthful.
        if (eq.catalogRef) {
            await syncCatalogRefOnLocation(eq.catalogRef, locationName, false);
        }
        // Re-render detail page
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error removing location:', error);
    }
}

/**
 * Add a gym to this equipment's locations[]. Reuses the tap-to-select gym
 * picker (no typos), excluding gyms the equipment is already in. Mirrors
 * removeEquipmentLocation — writes the locations array, mutates the cache,
 * and re-renders the detail page.
 */
export function addEquipmentLocation(equipmentId) {
    const eq = allEquipment.find(e => e.id === equipmentId);
    if (!eq) return;

    // Gather every known gym (saved locations + any name already on equipment),
    // then drop the ones this equipment is already tagged to.
    const current = new Set(eq.locations || []);
    const gymNames = new Set();
    allLocations.forEach((l) => l?.name && gymNames.add(l.name));
    allEquipment.forEach((e) => (e.locations || []).forEach((l) => l && gymNames.add(l)));
    const available = [...gymNames].filter((g) => !current.has(g)).sort();

    if (available.length === 0) {
        const msg = gymNames.size === 0
            ? 'Save a gym first (start a workout to stamp a location)'
            : `Already at every gym`;
        showNotification(msg, 'info');
        return;
    }

    openGymPickerSheet({
        title: `Add ${eq.name || 'equipment'} to a gym`,
        subtitle: 'Pick the gym to add it to',
        gyms: available,
        currentGym: getSessionLocation(),
        onSelect: (gymName) => commitEquipmentLocation(equipmentId, gymName),
    });
}

async function commitEquipmentLocation(equipmentId, gymName) {
    try {
        const eq = allEquipment.find(e => e.id === equipmentId);
        if (!eq) return;
        if ((eq.locations || []).includes(gymName)) {
            showNotification(`Already at ${gymName}`, 'info');
            return;
        }
        const locations = [...(eq.locations || []), gymName];
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { locations });
        eq.locations = locations;
        AppState._cachedEquipment = allEquipment;
        if (eq.catalogRef) {
            await syncCatalogRefOnLocation(eq.catalogRef, gymName, true);
        }
        showNotification(`Added to ${gymName}`, 'success', 1200);
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error adding location:', error);
        showNotification("Couldn't save — try again", 'error');
    }
}

export async function saveEquipmentField(equipmentId, field, value) {
    // Optimistic local update — mutate the in-memory cache FIRST so any
    // re-render triggered alongside this save (e.g., onchange cascades)
    // sees the new value. The Firestore write is still debounced.
    const eq = allEquipment.find(e => e.id === equipmentId);
    if (eq) eq[field] = value;

    if (fieldSaveTimeout) clearTimeout(fieldSaveTimeout);
    fieldSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { [field]: value });
            showNotification('Saved', 'success', 900);
        } catch (error) {
            console.error(`Error saving equipment ${field}:`, error);
        }
    }, 600);
}

let baseWeightSaveTimeout = null;

export async function saveEquipmentBaseWeight(equipmentId, value) {
    const numValue = parseFloat(value);
    const baseWeight = (!isNaN(numValue) && numValue >= 0) ? numValue : 0;

    if (baseWeightSaveTimeout) clearTimeout(baseWeightSaveTimeout);
    baseWeightSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { baseWeight });
            const eq = allEquipment.find(e => e.id === equipmentId);
            if (eq) eq.baseWeight = baseWeight;
            showNotification('Saved', 'success', 900);
        } catch (error) {
            console.error('Error saving base weight:', error);
            showNotification("Couldn't save base weight", 'error');
        }
    }, 600);
}

export async function setEquipmentBaseWeightUnit(equipmentId, unit, btn) {
    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { baseWeightUnit: unit });
        const eq = allEquipment.find(e => e.id === equipmentId);
        if (eq) eq.baseWeightUnit = unit;

        // Update toggle UI
        const parent = btn.parentElement;
        parent.querySelectorAll('.unit-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showNotification('Saved', 'success', 900);
    } catch (error) {
        console.error('Error saving base weight unit:', error);
    }
}

// Cleanup: autoParseEquipmentName was deleted — it referenced a
// KNOWN_BRANDS constant that was never defined and the function had
// no callers, so calling it would have crashed with ReferenceError.
// Re-add with a real KNOWN_BRANDS table if equipment-name parsing
// becomes a feature.

// Same-file window wiring for handlers rendered only by this module's own
// template strings — immune to main.js version skew (prod caches JS 1 year).
window.openCopyFromGymSheet = openCopyFromGymSheet;

// Equipment-detail read-first sheets (UX-4c).
window.openEquipmentIdentitySheet = openEquipmentIdentitySheet;
window.closeEquipmentIdentitySheet = closeEquipmentIdentitySheet;
window.identitySheetPickField = identitySheetPickField;
window.identitySheetSetType = identitySheetSetType;
window.openEquipmentBaseWeightSheet = openEquipmentBaseWeightSheet;
window.closeEquipmentBaseWeightSheet = closeEquipmentBaseWeightSheet;
window.openEquipmentExerciseSheet = openEquipmentExerciseSheet;
window.closeEquipmentExerciseSheet = closeEquipmentExerciseSheet;
window.removeExerciseFromEquipSheet = removeExerciseFromEquipSheet;
window.addGymPrompt = addGymPrompt;
