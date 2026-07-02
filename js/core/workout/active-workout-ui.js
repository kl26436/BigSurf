// Active Workout V2 — Wizard-style one-exercise-at-a-time UI
// Main controller: header, pills, hero, equipment, last session, set rows, footer

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, convertWeight } from '../ui/ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { getCategoryIcon, Config, debugLog } from '../utils/config.js';
import { debouncedSaveWorkoutData, saveWorkoutData, getLastSessionDefaults, loadAllWorkouts } from '../data/data-manager.js';
import { getNextInGroup, isLastInGroupRound, groupExercises, ungroupExercise } from '../features/superset-manager.js';
import { haptic } from '../utils/haptics.js';
import { navigateTo } from '../ui/navigation.js';
import { ensureFreshBodyWeight } from '../features/bodyweight-prompt.js';
import { scheduleRestNotification, cancelRestNotification, isFCMAvailable } from '../utils/push-notification-manager.js';
import { convertYouTubeUrl } from './exercise-ui.js';

// ===================================================================
// STATE
// ===================================================================

let currentExerciseIdx = 0;
let exerciseMenuOpen = false;
let workoutMenuOpen = false;
let durationInterval = null;

// Rest timer state. restTimerEndsAt is the authoritative target timestamp —
// display is always recomputed from it, so a stale setInterval after iOS
// backgrounding can't drift. restTimerRemaining mirrors the computed value
// for the view helpers that still read it.
let restTimerInterval = null;
let restTimerRemaining = 0;
let restTimerDuration = 0;
let restTimerEndsAt = 0;
let restTimerActive = false;
// After the countdown hits zero the banner stays in a "Ready" state instead of
// vanishing — from across the rack the old 600ms flash-then-hide was easy to
// miss. It clears when the next set is logged (startRestTimer) or dismissed.
let restTimerDone = false;

// When the app comes back from the lock screen / another app, setInterval
// will resume but the next tick may not fire for up to a second. Force an
// immediate recompute of both timers so the display snaps to real elapsed
// time instead of waiting.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;

        // Workout duration (aw-title)
        if (durationInterval && AppState.workoutStartTime) {
            const elapsed = Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 1000);
            const elapsedEl = document.querySelector('.aw-title__elapsed');
            if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsed);
        }

        // Rest timer
        if (restTimerActive && restTimerEndsAt > 0) {
            restTimerRemaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
            updateRestTimerDisplay();
            if (restTimerRemaining <= 0) onRestTimerComplete();
        }
    });

    // Outside-click closes the workout / exercise overflow menus. The menus
    // are rendered inline in the active-workout DOM and have no inherent
    // dismiss behavior — without this listener, only tapping the toggle
    // button or a menu item closes them, which doesn't match the user's
    // expectation that tapping "off" the menu should dismiss it.
    document.addEventListener('click', (e) => {
        if (!exerciseMenuOpen && !workoutMenuOpen) return;
        const t = e.target;
        // Click came from inside the menu OR the toggle button — let the
        // existing click handlers do their thing.
        if (t.closest?.('.aw-ex-menu, .aw-workout-menu, .aw-menu, .aw-exercise-menu-toggle, [onclick*="awToggleExerciseMenu"], [onclick*="awToggleWorkoutMenu"]')) {
            return;
        }
        // Click was somewhere else — close.
        exerciseMenuOpen = false;
        workoutMenuOpen = false;
        // Re-render so the menu DOM disappears.
        if (typeof renderAll === 'function') renderAll();
    });
}

// ===================================================================
// PUBLIC API — called from window
// ===================================================================

/**
 * Initialize and render the v2 active workout UI.
 * Called from startWorkout() after AppState is set up.
 */
export function renderActiveWorkout() {
    const container = document.getElementById('active-workout');
    if (!container || !AppState.currentWorkout) return;

    // Reset wizard state
    currentExerciseIdx = 0;
    exerciseMenuOpen = false;
    workoutMenuOpen = false;

    // Start duration timer
    startDurationTimer();

    // Render full UI
    renderAll();
}

/**
 * Re-render the full wizard UI (called after state changes).
 */
export function renderAll() {
    const container = document.getElementById('active-workout');
    if (!container || !AppState.currentWorkout) return;

    const exercises = AppState.currentWorkout.exercises || [];
    const exerciseCount = exercises.length;
    if (exerciseCount === 0) return;

    // Clamp index
    if (currentExerciseIdx >= exerciseCount) currentExerciseIdx = exerciseCount - 1;
    if (currentExerciseIdx < 0) currentExerciseIdx = 0;

    const exercise = exercises[currentExerciseIdx];
    const savedEx = AppState.savedData?.exercises?.[`exercise_${currentExerciseIdx}`] || {};
    const groupId = savedEx.group || exercise.group || null;

    // Check if in superset mode
    const inSuperset = !!groupId;
    const pairedExercises = [];
    if (inSuperset) {
        exercises.forEach((ex, i) => {
            const sEx = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
            if ((sEx.group || ex.group) === groupId) {
                pairedExercises.push({ ex, idx: i, saved: sEx });
            }
        });
    }

    // If current exercise is bodyweight and we haven't resolved BW yet, trigger prompt
    if (isBodyweightExercise(exercise) && AppState.currentSessionBodyWeightLbs == null) {
        // Fire the prompt (async) — it will call renderAll() when resolved
        ensureFreshBodyWeight().then((result) => {
            if (result != null) renderAll();
        });
    }

    let bodyContent;
    if (inSuperset && pairedExercises.length > 1) {
        bodyContent = renderSupersetMode(pairedExercises, groupId);
    } else {
        bodyContent = renderExerciseView(exercise, currentExerciseIdx, savedEx);
    }

    container.innerHTML = `
        ${renderWorkoutHeader()}
        ${renderProgressPills()}
        ${renderRestTimerBanner()}
        <div class="aw-body">
            ${bodyContent}
        </div>
        ${renderFooter()}
    `;

    // Scroll current pill into view + auto-size any notes textareas to their content
    requestAnimationFrame(() => {
        const pill = container.querySelector('.aw-pill.current');
        pill?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        container.querySelectorAll('.aw-notes__textarea').forEach(awAutoGrowNotes);
    });
}

// ===================================================================
// HEADER
// ===================================================================

function renderWorkoutHeader() {
    const workoutName = AppState.savedData?.workoutType || AppState.currentWorkout?.name || 'Workout';
    const exerciseCount = AppState.currentWorkout.exercises.length;
    const elapsedSeconds = AppState.workoutStartTime
        ? Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 1000)
        : 0;
    const elapsed = formatElapsed(elapsedSeconds);
    const location = AppState.savedData?.location;
    const locName = typeof location === 'object' ? location?.name : location;

    return `
        <div class="aw-header">
            <button class="aw-back" onclick="awConfirmExit()" aria-label="Exit workout" title="Exit workout">
                <i class="fas fa-times"></i>
            </button>
            <div class="aw-title">
                <div class="aw-title__name">${escapeHtml(workoutName)}${locName ? ` <span class="aw-title__loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(locName)}</span>` : ''}</div>
                <div class="aw-title__elapsed">${elapsed}</div>
                <div class="aw-title__meta">Exercise ${currentExerciseIdx + 1}/${exerciseCount}</div>
            </div>
            <button class="aw-menu" onclick="awToggleWorkoutMenu()" aria-label="Workout options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        ${workoutMenuOpen ? renderWorkoutMenu() : ''}
    `;
}

function renderWorkoutMenu() {
    return `
        <div class="aw-workout-menu">
            <button class="aw-ex-menu__item" onclick="awAddExercise()">
                <i class="fas fa-plus"></i> Add exercise
            </button>
            <button class="aw-ex-menu__item" onclick="saveActiveWorkoutAsTemplate(); awCloseMenus();">
                <i class="fas fa-bookmark"></i> Save as template
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item" onclick="showMidWorkoutSummary(); awCloseMenus();">
                <i class="fas fa-chart-bar"></i> Session summary
            </button>
            <button class="aw-ex-menu__item" onclick="exportWorkoutDataAsCSV(); awCloseMenus();">
                <i class="fas fa-file-export"></i> Export session
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item danger" onclick="awCancelWorkout()">
                <i class="fas fa-times"></i> Cancel workout
            </button>
        </div>
    `;
}

// ===================================================================
// PROGRESS PILLS
// ===================================================================

function renderProgressPills() {
    const exercises = AppState.currentWorkout.exercises;
    const pills = exercises.map((ex, i) => {
        const saved = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
        const isComplete = saved.completed === true;
        const isCurrent = i === currentExerciseIdx;
        const group = saved.group || ex.group || null;

        const classes = ['aw-pill'];
        if (isComplete) classes.push('done');
        if (isCurrent) classes.push('current');
        if (group) classes.push('superset');

        const label = group ? `${group}.` : `${i + 1}.`;
        const name = shortName(getExerciseName(ex));
        const check = isComplete ? ' ✓' : '';

        return `<button class="${classes.join(' ')}" onclick="awJumpTo(${i})">${label} ${escapeHtml(name)}${check}</button>`;
    }).join('');

    return `<div class="aw-pills">${pills}</div>`;
}

function shortName(name) {
    if (!name) return '?';
    // The pill row scrolls horizontally, so we can afford readable labels.
    // A hard 12-char cut turned "Hammer Strength Flat" into "Hammer Str…",
    // which tells you nothing. Prefer cutting on a word boundary so the label
    // stays legible at a glance between sets.
    const MAX = 18;
    if (name.length <= MAX) return name;
    const clipped = name.slice(0, MAX);
    const lastSpace = clipped.lastIndexOf(' ');
    if (lastSpace >= 10) return clipped.slice(0, lastSpace) + '…';
    return clipped.trimEnd() + '…';
}

// ===================================================================
// REST TIMER BANNER
// ===================================================================

function renderRestTimerBanner() {
    if (restTimerDone) {
        return `<div class="aw-rest-timer aw-rest-timer--done" id="aw-rest-banner">${restBannerDoneInner()}</div>`;
    }
    const pct = restTimerDuration > 0 ? ((restTimerDuration - restTimerRemaining) / restTimerDuration * 100) : 0;
    return `
        <div class="aw-rest-timer ${restTimerActive ? '' : 'hidden'}" id="aw-rest-banner">
            <div class="aw-rest-timer__icon"><i class="fas fa-clock"></i></div>
            <div class="aw-rest-timer__info">
                <span class="aw-rest-timer__label">Rest</span>
                <span class="aw-rest-timer__time" id="aw-rest-time">${formatTimer(restTimerRemaining)}</span>
            </div>
            <div class="aw-rest-timer__controls">
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestAdd30()" aria-label="Add 30 seconds">+30s</button>
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestSkip()" aria-label="Skip rest">Skip</button>
            </div>
            <div class="aw-rest-timer__bar">
                <div class="aw-rest-timer__bar-fill" id="aw-rest-fill" style="--rest-pct: ${pct}%"></div>
            </div>
        </div>
    `;
}

// The "Ready" banner shown once the countdown ends. Stays put (no auto-hide) so
// a lifter who looks up from the rack still sees it; tapping anywhere dismisses.
function restBannerDoneInner() {
    return `
            <div class="aw-rest-timer__icon"><i class="fas fa-check"></i></div>
            <div class="aw-rest-timer__info">
                <span class="aw-rest-timer__label">Rest done</span>
                <span class="aw-rest-timer__time">Ready for your next set</span>
            </div>
            <div class="aw-rest-timer__controls">
                <button class="aw-rest-timer__btn" onclick="awRestDismiss()" aria-label="Dismiss">Dismiss</button>
            </div>`;
}

function startRestTimer(duration) {
    clearRestTimer();
    restTimerDuration = duration || Config.DEFAULT_REST_TIMER_SECONDS;
    restTimerEndsAt = Date.now() + restTimerDuration * 1000;
    restTimerRemaining = restTimerDuration;
    restTimerActive = true;
    restTimerDone = false;

    // Schedule server-side push so the user gets a lock-screen notification
    // when rest ends. The local JS timer only runs while the app is open;
    // push is what wakes them if the phone is locked.
    if (isFCMAvailable()) {
        const exercise = AppState.currentWorkout?.exercises?.[currentExerciseIdx];
        const name = exercise ? (getExerciseName(exercise) || 'your next set') : 'your next set';
        scheduleRestNotification(restTimerDuration, name).catch(() => {});
    }

    // Show banner
    const banner = document.getElementById('aw-rest-banner');
    if (banner) banner.classList.remove('hidden', 'aw-rest-timer--done');
    updateRestTimerDisplay();

    // Each tick recomputes from restTimerEndsAt so a paused setInterval
    // (iOS backgrounding) catches up as soon as it resumes.
    restTimerInterval = setInterval(() => {
        restTimerRemaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
        updateRestTimerDisplay();

        if (restTimerRemaining <= 0) {
            onRestTimerComplete();
        }
    }, 1000);
}

function updateRestTimerDisplay() {
    const timeEl = document.getElementById('aw-rest-time');
    const fillEl = document.getElementById('aw-rest-fill');
    if (timeEl) timeEl.textContent = formatTimer(restTimerRemaining);
    if (fillEl) {
        const pct = restTimerDuration > 0 ? ((restTimerDuration - restTimerRemaining) / restTimerDuration * 100) : 0;
        fillEl.style.setProperty('--rest-pct', `${pct}%`);
    }
}

function onRestTimerComplete() {
    clearRestTimer();
    restTimerActive = false;
    restTimerDone = true;
    haptic('complete');

    // Swap the banner into its persistent "Ready" state in place. This fires
    // from a timer tick (no renderAll around it), so we update the DOM directly;
    // the state flag keeps any later re-render consistent.
    const banner = document.getElementById('aw-rest-banner');
    if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('aw-rest-timer--done', 'flash');
        banner.innerHTML = restBannerDoneInner();
    }
}

function clearRestTimer() {
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
        restTimerInterval = null;
    }
}

export function awRestAdd30() {
    if (!restTimerActive) return;
    restTimerEndsAt += 30 * 1000;
    restTimerDuration += 30;
    restTimerRemaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
    updateRestTimerDisplay();

    // Reschedule the push so it fires at the new end time. scheduleRestNotification
    // cancels any existing notification for this user before creating the new one.
    if (isFCMAvailable()) {
        const exercise = AppState.currentWorkout?.exercises?.[currentExerciseIdx];
        const name = exercise ? (getExerciseName(exercise) || 'your next set') : 'your next set';
        const remaining = Math.max(1, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
        scheduleRestNotification(remaining, name).catch(() => {});
    }
}

export function awRestSkip() {
    clearRestTimer();
    restTimerActive = false;
    restTimerDone = false;
    restTimerRemaining = 0;
    restTimerEndsAt = 0;
    const banner = document.getElementById('aw-rest-banner');
    if (banner) banner.classList.add('hidden');
    // Cancel the server-side push so it doesn't fire after the user has
    // already moved on.
    cancelRestNotification().catch(() => {});
}

// Dismiss the "Ready" banner once the user has seen it (or is moving on without
// logging another set). Replaces the old awEditRestDuration no-op.
export function awRestDismiss() {
    restTimerDone = false;
    restTimerActive = false;
    const banner = document.getElementById('aw-rest-banner');
    if (banner) {
        banner.classList.remove('aw-rest-timer--done', 'flash');
        banner.classList.add('hidden');
    }
}

// ===================================================================
// EXERCISE VIEW (single exercise)
// ===================================================================

function renderExerciseView(exercise, idx, savedEx) {
    const category = getCategory(exercise);
    const iconClass = getCategoryIcon(exercise.category || category) || 'fas fa-dumbbell';
    const exName = getExerciseName(exercise);
    const targetSets = exercise.sets || 3;
    const targetReps = exercise.defaultReps || exercise.reps || '?';
    const completedSets = (savedEx.sets || []).filter(s => s.completed).length;
    const remaining = Math.max(0, targetSets - completedSets);

    const equipmentName = savedEx.equipment || exercise.equipment || exercise.machine || null;
    const isBW = isBodyweightExercise(exercise);
    const equipDoc = getEquipmentDoc(equipmentName);
    const hasBaseWeight = !isBW && equipDoc && equipDoc.baseWeight > 0;
    const unit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';
    const lastSessionHtml = renderLastSessionCard(exName, idx);
    const notes = savedEx.notes || '';

    // Context banner: BW banner first for bodyweight exercises, then the
    // equipment line if a piece of equipment is actually being used (e.g.,
    // Pull-up at a Power Tower, Dip at a Dip Station). Showing both keeps
    // the bodyweight tracking signal AND lets the user see / change what
    // gym equipment they're on without overcrowding — equipment line is
    // already compact and the BW banner stays the visual lead.
    let contextBanner;
    if (isBW) {
        contextBanner = renderBWBanner();
        if (equipmentName) contextBanner += renderEquipLine(equipmentName, idx);
    } else {
        contextBanner = renderEquipLine(equipmentName, idx);
    }

    // Same set table for ALL exercise types — always Reps | Weight | ✓
    const sets = buildSetRows(exercise, idx, savedEx, unit);

    // Autofill hint: show the first time each exercise appears with pre-filled
    // values. Tracked per exercise name (not once per session) — otherwise the
    // second exercise shows dashed numbers with no explanation and reads like
    // the app invented them. Once you've seen the hint for a given lift, the
    // dashed styling alone is enough on later visits.
    const hintSeen = AppState._autofillHintSeen || (AppState._autofillHintSeen = new Set());
    const showAutofillHint = sets.hasAutofill && !hintSeen.has(exName);
    if (showAutofillHint) hintSeen.add(exName);

    // Weight column label
    let weightLabel = unit;
    if (isBW) weightLabel = `Added ${unit}`;
    else if (hasBaseWeight) weightLabel = `Plates ${unit}`;

    // Form video — resolved during autofill into exercise._formVideoUrl, so
    // surfacing it here is a sync read. Shows a small play icon in the hero
    // top row when a video is available; tap fires the existing
    // showExerciseVideo modal. Hidden when there's no video so it doesn't
    // clutter exercises that don't have one configured.
    const videoUrl = exercise._formVideoUrl || null;
    const videoBtn = videoUrl
        ? `<button class="aw-hero__video" onclick="awShowFormVideo('${escapeAttr(videoUrl)}', '${escapeAttr(exName)}')" aria-label="Form video" title="Form video"><i class="fas fa-play-circle"></i></button>`
        : '';

    // Plate calculator — one tap from the lift for barbell / plate-loaded gear.
    // Show it when the equipment takes plates: either a recorded bar/base weight
    // OR a plate-loaded / barbell equipment type (many plate-loaded machines,
    // e.g. an Arsenal vertical chest press, have no base weight recorded but
    // still load plates). Hidden for bodyweight and selectorized/machine gear.
    // Opens the existing popover; openPlateCalcPopover is wired in main.js.
    const equipType = (equipDoc?.equipmentType || equipDoc?.type || '').toLowerCase();
    const isPlateLoadable = equipType.includes('plate') || equipType.includes('barbell');
    const showPlates = !isBW && !!equipDoc && (equipDoc.baseWeight > 0 || isPlateLoadable);
    const platesBtn = showPlates
        ? `<button class="aw-hero__plates" onclick="openPlateCalcPopover(${idx})" aria-label="Plate calculator" title="Plate calculator"><i class="fas fa-calculator"></i></button>`
        : '';

    return `
        <div class="aw-hero">
            <div class="aw-hero__top">
                <div class="aw-hero__icon tint-${category}"><i class="${iconClass}"></i></div>
                <div class="aw-hero__name">
                    <div class="aw-hero__title">${escapeHtml(exName)}</div>
                    <div class="aw-hero__sub">${completedSets > 0 ? `Set ${completedSets} done · ${remaining} left` : `${targetSets} sets · ${targetReps} reps target`}</div>
                </div>
                ${platesBtn}
                ${videoBtn}
                <button class="aw-hero__more" onclick="awToggleExerciseMenu(${idx})" aria-label="Edit exercise" title="Edit exercise"><i class="fas fa-cog"></i></button>
            </div>
            ${contextBanner}
            ${lastSessionHtml}
        </div>
        ${exerciseMenuOpen ? renderExerciseMenu(idx) : ''}
        <div class="aw-sets-header">
            <span class="aw-sets-header__label"></span>
            <span class="aw-sets-header__label">Reps</span>
            <span class="aw-sets-header__label">${weightLabel}</span>
            <button class="aw-sets-header__unit" onclick="awToggleUnit(${idx})" title="Tap to switch unit" aria-label="Switch weight unit (currently ${unit})">${unit}</button>
        </div>
        ${showAutofillHint ? '<div class="aw-autofill-hint"><i class="fas fa-magic"></i> Pre-filled from last session · tap ✓ to confirm or edit values</div>' : ''}
        <div class="aw-sets">
            ${sets.html}
            <div class="aw-set-actions">
                <button class="aw-remove-set" onclick="awRemoveSet(${idx})"><i class="fas fa-minus"></i> Remove</button>
                <button class="aw-add-set" onclick="awAddSet(${idx})"><i class="fas fa-plus"></i> Add set</button>
            </div>
        </div>
        <div class="aw-notes">
            <textarea class="aw-notes__textarea" placeholder="Exercise notes…" rows="1"
                oninput="awAutoGrowNotes(this)"
                onchange="awSaveNotes(${idx}, this.value)">${escapeHtml(notes)}</textarea>
        </div>
    `;
}

function renderEquipLine(equipmentName, idx) {
    const eq = getEquipmentDoc(equipmentName);
    let baseWeightStr = '';
    if (eq?.baseWeight) {
        const bwUnit = eq.baseWeightUnit || 'lb';
        baseWeightStr = ` · ${eq.baseWeight} ${bwUnit} ${eq.type === 'barbell' ? 'bar' : 'base'}`;
    }
    return `
        <div class="aw-equip-line">
            <i class="fas fa-cog"></i>
            <span class="aw-equip-line__name">${equipmentName ? escapeHtml(equipmentName) + baseWeightStr : 'Choose equipment'}</span>
            <button class="aw-equip-line__change" onclick="awOpenEquipmentSheet(${idx})" aria-label="Change equipment"><i class="fas fa-exchange-alt"></i> Change</button>
        </div>
    `;
}

function renderBWBanner() {
    const bw = AppState.currentSessionBodyWeightLbs;
    const unit = AppState.globalUnit || 'lbs';

    if (!bw) {
        // No BW set — show prominent prompt to tap
        return `
            <div class="bw-banner bw-banner--prompt" onclick="ensureFreshBodyWeight().then(function(r) { if(r) renderAll(); })">
                <i class="fas fa-weight"></i>
                <div class="bw-banner__info">
                    <div class="bw-banner__weight">Body weight not set</div>
                    <div class="bw-banner__hint">Tap to enter your weight for accurate volume tracking</div>
                </div>
                <i class="fas fa-chevron-right bw-banner__chev"></i>
            </div>
        `;
    }

    const display = `${Math.round(bw * 10) / 10}`;
    return `
        <div class="bw-banner">
            <i class="fas fa-weight"></i>
            <div class="bw-banner__info">
                <div class="bw-banner__weight">Body weight: ${display} ${unit}</div>
                <div class="bw-banner__hint">Auto-filled · used for total volume</div>
            </div>
            <button class="bw-banner__edit" onclick="editBodyWeight().then(function() { renderAll(); })">Edit</button>
        </div>
    `;
}

function getEquipmentDoc(equipmentName) {
    if (!equipmentName || !AppState._cachedEquipment) return null;
    return AppState._cachedEquipment.find(e => e.name?.toLowerCase() === equipmentName.toLowerCase()) || null;
}

/**
 * Progressive-overload nudge for the last-session card: takes last session's
 * heaviest working set and suggests the next step up (smallest standard plate
 * jump for the display unit). Returns a short label or null (no usable weight).
 * Grounded only in last session — not the multi-session plateau engine — so it
 * stays synchronous and self-contained. Pure; mirrored in
 * tests/unit/beat-last-session.test.js.
 */
function nextTargetFor(lastSets, displayUnit) {
    if (!Array.isArray(lastSets) || lastSets.length === 0) return null;
    let topLbs = 0, topSet = null;
    for (const s of lastSets) {
        if (!s || !s.weight || !s.reps) continue;
        if ((s.type || 'working') === 'warmup') continue;
        const lbs = convertWeight(s.weight, s.originalUnit || 'lbs', 'lbs');
        if (lbs > topLbs) { topLbs = lbs; topSet = s; }
    }
    if (!topSet) return null;
    const inc = displayUnit === 'kg' ? 2.5 : 5;
    const topDisplay = convertWeight(topSet.weight, topSet.originalUnit || 'lbs', displayUnit);
    const next = Math.round((topDisplay + inc) * 10) / 10;
    return `Beat it — try ${next} ${displayUnit}`;
}

/**
 * Build this exercise's per-session progression history from the full workout
 * log — one entry per completed session, most-recent-first, each with the
 * heaviest working set's weight (in display unit) and the max reps achieved at
 * that weight. Grouped by exercise NAME (matching the training-insights
 * plateau engine), so it reads the same progression the dashboard insights do.
 */
function buildExerciseSessions(allWorkouts, exName, displayUnit) {
    if (!Array.isArray(allWorkouts) || !exName) return [];
    const sessions = [];
    for (const w of allWorkouts) {
        if (!w || !w.exercises || !w.date || !w.completedAt || w.cancelledAt) continue;
        for (const [k, ex] of Object.entries(w.exercises)) {
            const name = w.exerciseNames?.[k] || ex?.name || ex?.machine;
            if (name !== exName) continue;
            const working = (ex.sets || []).filter(s =>
                s && s.completed !== false && s.weight && (s.type || 'working') !== 'warmup');
            if (working.length === 0) break;
            let topWeight = 0;
            for (const s of working) {
                topWeight = Math.max(topWeight, convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit));
            }
            topWeight = Math.round(topWeight * 10) / 10;
            let topReps = 0, maxReps = 0;
            for (const s of working) {
                maxReps = Math.max(maxReps, s.reps || 0);
                const w2 = Math.round(convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit) * 10) / 10;
                if (w2 === topWeight) topReps = Math.max(topReps, s.reps || 0);
            }
            sessions.push({ date: w.date, topWeight, topReps, maxReps });
            break; // one entry per workout
        }
    }
    sessions.sort((a, b) => b.date.localeCompare(a.date));
    return sessions;
}

/**
 * Smart progressive-overload coach for the last-session card. Reads the
 * multi-session history and applies double-progression logic:
 *   1. Plateau (3+ sessions at the same top weight) → add weight / back-off.
 *   2. Hit the rep target at this weight → add weight.
 *   3. Just went up last session → consolidate before pushing again.
 *   4. Below the rep target → chase a rep first.
 *   5. Not enough signal → simple next-step suggestion.
 * Pure; mirrored in tests/unit/beat-last-session.test.js.
 */
function computeOverloadNudge(sessions, displayUnit, repTarget) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = displayUnit === 'kg' ? 2.5 : 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;

    // 1) Plateau — same top weight three sessions running.
    if (sessions.length >= 3 && sessions[1].topWeight === W && sessions[2].topWeight === W) {
        const repsClimbing = (sessions[0].maxReps || 0) > (sessions[2].maxReps || 0);
        return repsClimbing
            ? `3 sessions at ${W} ${displayUnit} — reps are climbing, go ${next} next`
            : `Stalled at ${W} ${displayUnit} for 3 sessions — try ${next} or a back-off set`;
    }
    // 2) Double progression — hit the rep target, time to add weight.
    if (rt && R >= rt) {
        return `${R} reps at ${W} ${displayUnit} — bump to ${next}`;
    }
    // 3) Went up last session — lock it in before the next jump.
    if (sessions.length >= 2 && W > sessions[1].topWeight) {
        return `Up from ${sessions[1].topWeight} — own ${W} ${displayUnit} for ${rt || R || 'your'} reps`;
    }
    // 4) Below the rep target — chase a rep first.
    if (rt && R > 0 && R < rt) {
        return `Add a rep — aim ${R + 1}×${W} ${displayUnit} toward ${rt}`;
    }
    // 5) Fallback — simple progressive step.
    return `Beat it — try ${next} ${displayUnit}`;
}

function renderLastSessionCard(exerciseName, idx) {
    // Check if we have cached last session data on the exercise
    const exercise = AppState.currentWorkout.exercises[idx];
    const lastDefaults = exercise._lastSessionSets;
    if (!lastDefaults || lastDefaults.length === 0) return '';

    const daysAgo = exercise._lastSessionDaysAgo || '?';
    const daysLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

    // Convert each set's weight to the user's display unit so a kg-logged
    // session shows correctly when the user is now in lb mode (and vice versa).
    const displayUnit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';
    const summary = lastDefaults.map(s => {
        const w = s.weight || 0;
        const r = s.reps || 0;
        const from = s.originalUnit || 'lbs';
        const dw = w > 0 ? convertWeight(w, from, displayUnit) : 0;
        return `${r}×${dw}`;
    }).join(' · ');

    // If the autofill came from a DIFFERENT equipment than the one currently
    // selected (the name-only fallback in getLastSessionDefaults), surface
    // a tappable info glyph next to the history icon. Equipment names can be
    // long ("Hammer Strength MTS — Iso-Lateral Bench Press") so we don't
    // inline them — the user taps to see the source name in a toast.
    const currentEquip = exercise.equipment || null;
    const sourceEquip = exercise._lastSessionEquipment || null;
    const equipMismatch = currentEquip && sourceEquip && currentEquip !== sourceEquip;
    const sourceGlyph = equipMismatch
        ? `<button class="aw-last__src-btn" onclick="awShowLastSessionSource(${idx})" aria-label="Show source equipment">
               <i class="fas fa-info-circle"></i>
           </button>`
        : '';

    // Overload nudge — only for weighted lifts (a bodyweight "try +5" is noise).
    // Prefer the smart multi-session coach hydrated by loadAutofillForExercise;
    // fall back to the simple last-session step until it's computed.
    const nudge = isBodyweightExercise(exercise)
        ? null
        : (exercise._overloadNudge || nextTargetFor(lastDefaults, displayUnit));
    const nudgeHtml = nudge
        ? `<div class="aw-last__nudge"><i class="fas fa-bolt" aria-hidden="true"></i> ${nudge}</div>`
        : '';

    return `
        <div class="aw-last${equipMismatch ? ' aw-last--cross-equip' : ''}">
            <div class="aw-last__icons">
                <i class="fas fa-history"></i>
                ${sourceGlyph}
            </div>
            <div class="aw-last__info">
                <div class="aw-last__label">Last session · ${daysLabel}</div>
                <div class="aw-last__val">${summary} ${displayUnit}</div>
                ${nudgeHtml}
            </div>
            <button class="aw-last__progress" onclick="showExerciseDetail('${escapeAttr(exerciseName)}')" aria-label="View ${escapeAttr(exerciseName)} progress">
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
        </div>
    `;
}

/**
 * Tapping the info glyph on a cross-equipment last-session card surfaces
 * the source equipment as a toast so users can see the full machine name
 * without it wrapping inline on the card.
 */
export function awShowLastSessionSource(idx) {
    const exercise = AppState.currentWorkout?.exercises?.[idx];
    const sourceEquip = exercise?._lastSessionEquipment;
    if (!sourceEquip) return;
    showNotification(`Last session: ${sourceEquip}`, 'info', 4000);
}

/**
 * V2-native form video viewer. The legacy showExerciseVideo() in
 * exercise-ui.js looks for #exercise-video-section / #exercise-video-iframe
 * DOM nodes that only existed in the V1 exercise modal — they were never
 * rendered by the V2 wizard, so the play button I wired to it silently
 * no-op'd. This builds a self-contained fullscreen overlay with a YouTube
 * embed and tears it down on backdrop tap, ESC, or close button.
 */
export function awShowFormVideo(url, exerciseName) {
    if (!url) return;
    // Strip any existing video overlay first so rapid taps don't stack.
    document.getElementById('aw-form-video-overlay')?.remove();

    const embedUrl = convertYouTubeUrl(url);
    if (!embedUrl) {
        showNotification('No form video available', 'info', 1500);
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'aw-form-video-overlay';
    overlay.className = 'aw-form-video-overlay';
    overlay.innerHTML = `
        <div class="aw-form-video">
            <div class="aw-form-video__header">
                <div class="aw-form-video__title">${escapeHtml(exerciseName || 'Form video')}</div>
                <button class="aw-form-video__close" onclick="awCloseFormVideo()" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="aw-form-video__frame">
                <iframe src="${escapeAttr(embedUrl)}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
            </div>
        </div>
    `;
    // Backdrop click (outside the .aw-form-video card) closes the viewer.
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) awCloseFormVideo();
    });
    // ESC closes too — common iOS gesture for "back out of this".
    const onKey = (e) => {
        if (e.key === 'Escape') awCloseFormVideo();
    };
    document.addEventListener('keydown', onKey);
    overlay.dataset.keyHandler = '1';
    overlay._onKey = onKey;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('aw-form-video-overlay--show'));
}

export function awCloseFormVideo() {
    const overlay = document.getElementById('aw-form-video-overlay');
    if (!overlay) return;
    if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
    overlay.classList.remove('aw-form-video-overlay--show');
    setTimeout(() => overlay.remove(), 200);
}

// ===================================================================
// SET ROWS
// ===================================================================

function ensurePersistentSets(idx, targetSets) {
    const key = `exercise_${idx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    const persistent = AppState.savedData.exercises[key];
    if (!persistent.sets) persistent.sets = [];
    while (persistent.sets.length < targetSets) {
        persistent.sets.push({ reps: null, weight: null, completed: false });
    }
    return persistent;
}

/**
 * "Beat last time" badge for a completed set vs the same-index set from last
 * session. Weights are normalized to lbs before comparing so a kg-logged
 * session still compares correctly against a lb one. Returns { label } when
 * the set beat last time (heavier, or same weight for more reps), else null —
 * matched and below sets get no badge (celebrate the win, don't nag the rest).
 * Pure + self-contained (kept in this file, not a cross-module export — prod
 * pins JS for a year); logic mirrored in tests/unit/beat-last-session.test.js.
 */
function beatBadgeFor(set, lastSet, displayUnit) {
    if (!set || !lastSet) return null;
    const curW = set.weight, curR = set.reps;
    const lastW = lastSet.weight, lastR = lastSet.reps;
    if (!curW || !curR || !lastW || !lastR) return null;
    const cw = convertWeight(curW, set.originalUnit || 'lbs', 'lbs');
    const lw = convertWeight(lastW, lastSet.originalUnit || 'lbs', 'lbs');
    const EPS = 0.6; // ~½ kg rounding tolerance
    if (cw > lw + EPS) {
        const now = convertWeight(curW, set.originalUnit || 'lbs', displayUnit);
        const then = convertWeight(lastW, lastSet.originalUnit || 'lbs', displayUnit);
        const dw = Math.round((now - then) * 10) / 10;
        return { label: `▲ +${dw}` };
    }
    if (Math.abs(cw - lw) <= EPS && curR > lastR) {
        const dr = curR - lastR;
        return { label: `▲ +${dr} rep${dr > 1 ? 's' : ''}` };
    }
    return null;
}

function buildSetRows(exercise, idx, savedEx, unit) {
    const targetSets = exercise.sets || 3;
    const persistent = ensurePersistentSets(idx, targetSets);
    const sets = persistent.sets;

    let hasAutofill = false;
    let currentSetIdx = sets.findIndex(s => !s.completed);
    if (currentSetIdx < 0) currentSetIdx = sets.length;

    const unitLabel = unit || 'lbs';

    const rows = sets.map((set, si) => {
        const isCurrent = si === currentSetIdx;
        const isAutofill = !set.completed && !set._userEdited && (set.weight != null || set.reps != null);
        if (isAutofill) hasAutofill = true;

        const classes = ['aw-set-row'];
        if (set.completed) classes.push('done');
        if (isCurrent) classes.push('current');

        // "Beat last time" — for a completed set, compare to the same-index set
        // from last session and flag a green ▲ badge when the user out-lifted
        // it. Nothing for matched/below sets: surface the win, don't nag.
        const lastSet = set.completed ? exercise._lastSessionSets?.[si] : null;
        const beat = beatBadgeFor(set, lastSet, unitLabel);
        if (beat) classes.push('aw-set-row--beat');
        const beatBadge = beat
            ? `<span class="aw-set-row__beat" aria-label="Beat last session">${beat.label}</span>`
            : '';

        // RPE row (opt-in via settings.trackRpe) — effort chips under each
        // completed set. Rendered as a sibling of the set row so the set grid
        // and awToggleSet's row indexing are untouched.
        const showRpe = !!AppState.settings?.trackRpe && set.completed;
        const rpeRow = showRpe
            ? `<div class="aw-rpe-row">
                <span class="aw-rpe-row__label">RPE</span>
                ${[6, 7, 8, 9, 10].map(v => `<button class="aw-rpe-chip${set.rpe === v ? ' active' : ''}" onclick="awSetRpe(${idx}, ${si}, ${v})" aria-label="RPE ${v}">${v}</button>`).join('')}
            </div>`
            : '';

        // Placeholder shows the autofill / last-session weight for an un-edited
        // set, but it must be converted to the current display unit — otherwise
        // a 154 lbs autofill looks like "154" in a kg-mode field, which (a)
        // misleads the user and (b) gets captured as 154 kg if they hit check
        // without typing.
        const displayWeight = (raw) => {
            if (raw == null) return raw;
            const from = set.originalUnit || unitLabel;
            if (from === unitLabel) return Math.round(raw * 10) / 10;
            return convertWeight(raw, from, unitLabel);
        };
        const weightShown = displayWeight(set.weight);
        const weightVal = set._userEdited || set.completed ? (weightShown ?? '') : '';
        const repsVal = set._userEdited || set.completed ? (set.reps ?? '') : '';
        const weightPlaceholder = !set._userEdited && !set.completed && weightShown != null ? weightShown : unitLabel;
        const repsPlaceholder = !set._userEdited && !set.completed && set.reps != null ? set.reps : 'reps';

        return `
            <div class="${classes.join(' ')}" data-set-idx="${si}">
                <div class="aw-set-row__num">${si + 1}</div>
                <input class="aw-set-row__input ${isAutofill ? 'autofill' : ''} ${set.completed ? 'done-val' : ''}"
                       type="number" inputmode="numeric"
                       data-field="reps"
                       value="${repsVal}"
                       placeholder="${repsPlaceholder}"
                       ${set.completed ? 'readonly' : ''}
                       onfocus="this.select()"
                       onchange="awUpdateSet(${idx}, ${si}, 'reps', this.value)">
                <input class="aw-set-row__input ${isAutofill ? 'autofill' : ''} ${set.completed ? 'done-val' : ''}"
                       type="number" inputmode="decimal" step="0.5"
                       data-field="weight"
                       value="${weightVal}"
                       placeholder="${weightPlaceholder}"
                       ${set.completed ? 'readonly' : ''}
                       onfocus="this.select()"
                       onchange="awUpdateSet(${idx}, ${si}, 'weight', this.value)">
                <button class="aw-set-row__check ${set.completed ? 'done' : ''}"
                        onclick="awToggleSet(${idx}, ${si})"
                        aria-label="${set.completed ? 'Unmark set' : 'Mark set complete'}">
                    <i class="${set.completed ? 'fas fa-check' : 'far fa-circle'}" aria-hidden="true"></i>
                </button>
                ${beatBadge}
            </div>
            ${rpeRow}
        `;
    }).join('');

    return { html: rows, hasAutofill };
}

/**
 * Bodyweight exercise set rows: only Reps input + computed Total/rep (read-only)
 */
// ===================================================================
// EXERCISE MENU
// ===================================================================

function renderExerciseMenu(idx) {
    const exercise = AppState.currentWorkout.exercises[idx];
    const savedEx = AppState.savedData?.exercises?.[`exercise_${idx}`] || {};
    const group = savedEx.group || exercise.group;

    return `
        <div class="aw-ex-menu">
            <button class="aw-ex-menu__item" onclick="awReplaceExercise(${idx})">
                <i class="fas fa-exchange-alt"></i> Swap exercise
            </button>
            <div class="aw-ex-menu__divider"></div>
            ${group
                ? `<button class="aw-ex-menu__item" onclick="awUnlinkSuperset(${idx})"><i class="fas fa-unlink"></i> Unlink from superset</button>`
                : ''
            }
            <button class="aw-ex-menu__item danger" onclick="awDeleteExercise(${idx})">
                <i class="fas fa-trash"></i> Remove exercise
            </button>
        </div>
    `;
}

// ===================================================================
// SUPERSET MODE
// ===================================================================

function renderSupersetMode(pairedExercises, groupId) {
    const stacked = pairedExercises.map(({ ex, idx, saved }, pi) => {
        const isActive = idx === currentExerciseIdx;
        const exName = getExerciseName(ex);
        const completedSets = (saved.sets || []).filter(s => s.completed).length;
        const totalSets = ex.sets || 3;
        const nextSetLabel = completedSets >= totalSets ? 'Done' : `Set ${completedSets + 1} of ${totalSets}`;

        if (isActive) {
            return `
                <div class="aw-ss-ex active">
                    <div class="aw-ss-ex__head">
                        <div class="aw-ss-ex__num">${groupId}${pi + 1}</div>
                        <div class="aw-ss-ex__name">${escapeHtml(exName)}</div>
                        <span class="aw-ss-ex__meta">${nextSetLabel}</span>
                    </div>
                    ${renderExerciseView(ex, idx, saved)}
                </div>
            `;
        } else {
            return `
                <div class="aw-ss-ex" onclick="awJumpTo(${idx})">
                    <div class="aw-ss-ex__head">
                        <div class="aw-ss-ex__num">${groupId}${pi + 1}</div>
                        <div class="aw-ss-ex__name">${escapeHtml(exName)}</div>
                        <span class="aw-ss-ex__meta">${nextSetLabel}</span>
                    </div>
                    <div class="aw-ss-pending">${completedSets}/${totalSets} sets done · tap to switch</div>
                </div>
            `;
        }
    }).join('');

    return `
        <div class="aw-superset-banner">
            <i class="fas fa-link"></i>
            Superset ${groupId} · alternate between these
            <button class="aw-superset-banner__unlink" onclick="awUnlinkSupersetGroup('${escapeAttr(groupId)}')">Unlink</button>
        </div>
        ${stacked}
    `;
}

// ===================================================================
// FOOTER
// ===================================================================

function renderFooter() {
    const exercises = AppState.currentWorkout.exercises;

    // Show "Finish" the moment EVERY exercise has all its sets completed,
    // not just when the user is on the last exercise. Previously, if the
    // user completed exercises out of order they'd have to tap "Next" all
    // the way to the end before the button switched — confusing because the
    // workout was already done.
    const allExercisesDone = exercises.length > 0 && exercises.every((_, i) => {
        const ex = AppState.savedData?.exercises?.[`exercise_${i}`];
        const sets = ex?.sets;
        return sets && sets.length > 0 && sets.every(s => s.completed);
    });

    // Once any set is logged, offer an always-available finish so a skipped
    // warmup (or finishing early) doesn't trap the user tapping "Next" to the
    // end. awFinishWorkout confirms if sets are still incomplete. Hidden once
    // the primary button has itself become "Finish" (would be redundant).
    const hasProgress = exercises.some((_, i) =>
        AppState.savedData?.exercises?.[`exercise_${i}`]?.sets?.some(s => s.completed));
    const showFinishShortcut = hasProgress && !allExercisesDone;

    return `
        <div class="aw-footer">
            <button class="aw-footer__list-btn" onclick="awOpenJumpSheet()">
                <i class="fas fa-list"></i> All
            </button>
            ${showFinishShortcut
                ? `<button class="aw-footer__finish" onclick="awFinishWorkout()" aria-label="Finish workout" title="Finish workout"><i class="fas fa-flag-checkered"></i></button>`
                : ''}
            <button class="aw-footer__next ${allExercisesDone ? 'finish' : ''}" onclick="${allExercisesDone ? 'awFinishWorkout()' : 'awNextExercise()'}">
                ${allExercisesDone
                    ? '<i class="fas fa-flag-checkered"></i> Finish workout'
                    : 'Next exercise <i class="fas fa-arrow-right"></i>'
                }
            </button>
        </div>
    `;
}

// ===================================================================
// ACTIONS — Set completion, navigation, menus
// ===================================================================

export function awJumpTo(idx) {
    exerciseMenuOpen = false;
    workoutMenuOpen = false;
    currentExerciseIdx = idx;
    renderAll();
}

export function awNextExercise() {
    const exercises = AppState.currentWorkout.exercises;
    const isComplete = (i) => {
        const ex = AppState.savedData?.exercises?.[`exercise_${i}`];
        const sets = ex?.sets;
        return sets && sets.length > 0 && sets.every(s => s.completed);
    };

    // Prefer the next sequential incomplete exercise. Falls through to wrap
    // around when the user did the last exercise first — without this, they'd
    // be stuck on the last index forever because idx+1 is out of bounds.
    for (let i = currentExerciseIdx + 1; i < exercises.length; i++) {
        if (!isComplete(i)) { awJumpTo(i); return; }
    }
    for (let i = 0; i < currentExerciseIdx; i++) {
        if (!isComplete(i)) { awJumpTo(i); return; }
    }

    // Everything's complete — the footer should have flipped to "Finish
    // workout" but defend against stale state by jumping forward if we can.
    if (currentExerciseIdx < exercises.length - 1) {
        awJumpTo(currentExerciseIdx + 1);
    }
}

// Sets already celebrated this session, keyed by exercise+equipment+weight+reps
// so two sets at the same new top weight in one workout don't double-fire (PRs
// are only persisted at workout completion, so prData can't self-suppress
// mid-session).
const _prCelebrated = new Set();

/**
 * B3 — live PR moment. On a completed working set, check it against the user's
 * stored PRs (recorded pre-workout) and fire an immediate haptic + toast when
 * it's a new max-weight or max-reps PR. Detection only — the set is still
 * recorded normally at workout completion. Fire-and-forget (async PR load) so
 * it never blocks the log-a-set path. Skips 'first' (first-ever attempt isn't
 * beating anything) and 'maxVolume' (fires too often to feel earned).
 */
async function maybeCelebratePR(exercise, set, equipName) {
    try {
        if (!set || !set.reps || !set.weight) return;
        if ((set.type || 'working') === 'warmup') return;
        const exName = getExerciseName(exercise) || exercise?.name || exercise?.machine || null;
        if (!exName) return;
        const total = set.weight; // already includes base/BW weight at this point
        const key = `${exName}__${equipName || ''}__${Math.round(total * 10) / 10}__${set.reps}`;
        if (_prCelebrated.has(key)) return;

        const { PRTracker } = await import('../features/pr-tracker.js');
        await PRTracker.loadPRData?.();
        const pr = PRTracker.checkForNewPR(exName, set.reps, total, equipName);
        if (pr?.isNewPR && (pr.prType === 'maxWeight' || pr.prType === 'maxReps')) {
            _prCelebrated.add(key);
            haptic('pr');
            const unit = set.originalUnit || AppState.globalUnit || 'lbs';
            const what = pr.prType === 'maxWeight' ? 'Weight PR' : 'Rep PR';
            showNotification(`${what}! ${set.reps}×${Math.round(total * 10) / 10} ${unit}`, 'success', 3500);
        }
    } catch (e) {
        debugLog('live PR check failed', e);
    }
}

export function awToggleSet(exerciseIdx, setIdx) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    const savedEx = AppState.savedData.exercises[key];
    if (!savedEx.sets) savedEx.sets = [];

    // Ensure set exists
    while (savedEx.sets.length <= setIdx) {
        savedEx.sets.push({ reps: null, weight: null, completed: false });
    }

    const set = savedEx.sets[setIdx];

    if (set.completed) {
        // UN-COMPLETE: allow user to fix mistakes
        set.completed = false;
        set._userEdited = true; // keep values visible after unchecking

        // Restore the user-entered weight (undo the total calculation)
        if (set.isBodyweight && set.addedWeight != null) {
            set.weight = set.addedWeight; // show just the added weight for editing
        } else if (set._plateWeight != null) {
            set.weight = set._plateWeight; // show just the plate weight for editing
        }

        // Also un-complete the exercise if it was marked complete
        savedEx.completed = false;

        haptic('tap');
    } else {
        // COMPLETE the set
        const exercise = AppState.currentWorkout.exercises[exerciseIdx];
        const isBW = isBodyweightExercise(exercise);
        const equipName = savedEx.equipment || exercise.equipment || exercise.machine || null;
        const equipDoc = getEquipmentDoc(equipName);

        // Read current input values from DOM — always Reps (0), Weight (1)
        const allRows = document.querySelectorAll('.aw-sets .aw-set-row');
        const row = allRows[setIdx];
        const currentUnit = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';
        let userTypedWeight = false;
        if (row) {
            const inputs = row.querySelectorAll('input');
            if (inputs[0]) set.reps = parseInt(inputs[0].value, 10) || set.reps || 0;
            if (inputs[1]) {
                const typed = parseFloat(inputs[1].value);
                if (!isNaN(typed) && typed > 0) {
                    // User typed a fresh weight in the current display unit
                    set.weight = typed;
                    userTypedWeight = true;
                } else {
                    // Empty input → keep whatever set.weight already held (autofill)
                    set.weight = set.weight || 0;
                }
            }
        }
        set.completed = true;
        set._userEdited = true;
        // Only stamp originalUnit = currentUnit when the user actually typed a
        // value in the current display unit. When falling back to an autofilled
        // value, preserve the autofill's own originalUnit so history conversion
        // stays correct — otherwise a 154 lbs autofill gets re-tagged as 154 kg.
        if (userTypedWeight) {
            set.originalUnit = currentUnit;
        } else if (!set.originalUnit) {
            set.originalUnit = currentUnit;
        }

        // Store the user-entered value before computing total
        const enteredWeight = set.weight || 0;

        // Bodyweight: total = BW + entered (added) weight
        if (isBW) {
            set.isBodyweight = true;
            set.bodyWeight = AppState.currentSessionBodyWeightLbs || 0;
            set.bodyWeightUnit = 'lbs';
            set.addedWeight = enteredWeight;
            set.weight = set.bodyWeight + enteredWeight; // store the TOTAL
        }

        // Equipment with base weight: total = base + entered (plate) weight
        if (!isBW && equipDoc?.baseWeight > 0) {
            const baseWeight = equipDoc.baseWeight || 0;
            set._plateWeight = enteredWeight; // remember what user typed
            set._equipBaseWeight = baseWeight;
            set.weight = enteredWeight + baseWeight; // store the TOTAL
        }

        haptic('tap');

        // B3 — live PR moment (fire-and-forget; never blocks logging).
        maybeCelebratePR(exercise, set, equipName);

        // Check if exercise is complete (all target sets done)
        const targetSets = exercise.sets || 3;
        const completedCount = savedEx.sets.filter(s => s.completed).length;
        if (completedCount >= targetSets) {
            savedEx.completed = true;
        }

        // Superset: auto-jump to next in group
        const group = savedEx.group || exercise.group;
        if (group) {
            const nextIdx = getNextInGroup(exerciseIdx, AppState.savedData.exercises);
            const isLastInRound = isLastInGroupRound(exerciseIdx, setIdx, AppState.currentWorkout.exercises, AppState.savedData);

            // Advance currentExerciseIdx BEFORE starting rest timer so the push
            // notification names the next exercise the user will do — not the
            // one they just finished.
            if (nextIdx !== null && nextIdx !== exerciseIdx) {
                currentExerciseIdx = nextIdx;
            }

            if (isLastInRound) {
                startRestTimer(Config.DEFAULT_REST_TIMER_SECONDS);
            }
        } else {
            startRestTimer(Config.DEFAULT_REST_TIMER_SECONDS);
        }
    }

    // Save and re-render
    debouncedSaveWorkoutData(AppState);
    window.inProgressWorkout = { ...AppState.savedData, originalWorkout: AppState.currentWorkout };
    renderAll();
}

export function awUpdateSet(exerciseIdx, setIdx, field, value) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    const savedEx = AppState.savedData.exercises[key];
    if (!savedEx.sets) savedEx.sets = [];

    while (savedEx.sets.length <= setIdx) {
        savedEx.sets.push({ reps: null, weight: null, completed: false });
    }

    const set = savedEx.sets[setIdx];
    if (field === 'weight') {
        set.weight = parseFloat(value) || null;
    } else if (field === 'reps') {
        set.reps = parseInt(value, 10) || null;
    }
    set._userEdited = true;
    set.originalUnit = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';

    debouncedSaveWorkoutData(AppState);
}

/**
 * Set (or clear) a completed set's RPE. Tapping the already-active value
 * clears it. Only meaningful when settings.trackRpe is on.
 */
export function awSetRpe(exerciseIdx, setIdx, value) {
    const savedEx = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`];
    const set = savedEx?.sets?.[setIdx];
    if (!set) return;
    set.rpe = set.rpe === value ? null : value;
    debouncedSaveWorkoutData(AppState);
    renderAll();
}

export function awAddSet(exerciseIdx) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    const savedEx = AppState.savedData.exercises[key];
    if (!savedEx.sets) savedEx.sets = [];
    savedEx.sets.push({ reps: null, weight: null, completed: false });

    // Also update the template exercise target
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    if (exercise) exercise.sets = (exercise.sets || 3) + 1;

    debouncedSaveWorkoutData(AppState);
    renderAll();
}


export function awRemoveSet(exerciseIdx) {
    const key = `exercise_${exerciseIdx}`;
    const savedEx = AppState.savedData.exercises?.[key];
    if (!savedEx?.sets?.length) return;

    // Don't remove the last set
    if (savedEx.sets.length <= 1) return;

    savedEx.sets.pop();

    // Update template exercise target
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    if (exercise && exercise.sets > 1) exercise.sets--;

    debouncedSaveWorkoutData(AppState);
    renderAll();
}

export function awSaveNotes(exerciseIdx, value) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    AppState.savedData.exercises[key].notes = value;
    debouncedSaveWorkoutData(AppState);
}

export function awAutoGrowNotes(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// ===================================================================
// MENU ACTIONS
// ===================================================================

export function awToggleExerciseMenu(_idx) {
    exerciseMenuOpen = !exerciseMenuOpen;
    workoutMenuOpen = false;
    renderAll();
}

export function awToggleWorkoutMenu() {
    workoutMenuOpen = !workoutMenuOpen;
    exerciseMenuOpen = false;
    renderAll();
}

export function awCloseMenus() {
    exerciseMenuOpen = false;
    workoutMenuOpen = false;
    renderAll();
}

export function awDeleteExercise(idx) {
    const exercises = AppState.currentWorkout.exercises;
    const name = getExerciseName(exercises[idx]);
    if (!confirm(`Remove ${name} from workout?`)) return;

    exercises.splice(idx, 1);

    // Rebuild savedData exercises
    const newExercises = {};
    exercises.forEach((ex, i) => {
        const newKey = `exercise_${i}`;
        if (i >= idx) {
            newExercises[newKey] = AppState.savedData.exercises[`exercise_${i + 1}`] || { sets: [] };
        } else {
            newExercises[newKey] = AppState.savedData.exercises[`exercise_${i}`] || { sets: [] };
        }
    });
    AppState.savedData.exercises = newExercises;

    if (currentExerciseIdx >= exercises.length) {
        currentExerciseIdx = Math.max(0, exercises.length - 1);
    }
    exerciseMenuOpen = false;
    debouncedSaveWorkoutData(AppState);
    renderAll();
}

export function awReplaceExercise(idx) {
    exerciseMenuOpen = false;
    awCloseMenus();
    // Delegate to existing replace exercise logic
    if (window.replaceExercise) {
        window.replaceExercise(idx);
    }
}

export function awConfirmExit() {
    if (AppState.savedData && Object.keys(AppState.savedData.exercises || {}).length > 0) {
        const hasSets = Object.values(AppState.savedData.exercises).some(ex =>
            ex.sets?.some(s => s.completed)
        );
        if (hasSets) {
            if (!confirm('Leave workout? Your progress is saved and you can resume later.')) return;
        }
    }
    cleanup();
    navigateTo('dashboard');
}

export function awCancelWorkout() {
    if (!confirm('Cancel workout? Logged sets will be saved as a cancelled session.')) return;
    // Delegate to the canonical cancelWorkout() so AppState.reset() runs and
    // the dashboard doesn't still think a workout is active. Skip its inner
    // confirm since we just showed one.
    cleanup();
    window.cancelWorkout?.(true);
}

export async function awFinishWorkout() {
    // Check for incomplete sets
    const exercises = AppState.currentWorkout.exercises;
    let incompleteSets = 0;
    exercises.forEach((ex, i) => {
        const saved = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
        const targetSets = ex.sets || 3;
        const completedSets = (saved.sets || []).filter(s => s.completed).length;
        incompleteSets += Math.max(0, targetSets - completedSets);
    });

    if (incompleteSets > 0) {
        if (!confirm(`Finish anyway? ${incompleteSets} set${incompleteSets > 1 ? 's are' : ' is'} incomplete.`)) return;
    }

    cleanup();

    // Delegate to existing completeWorkout which handles PRs, saving, summary
    if (window.completeWorkout) {
        window.completeWorkout();
    }
}

// ===================================================================
// SUPERSET ACTIONS
// ===================================================================

export function awUnlinkSuperset(idx) {
    exerciseMenuOpen = false;
    ungroupExercise(idx, AppState.savedData.exercises);
    debouncedSaveWorkoutData(AppState);
    renderAll();
}

export function awUnlinkSupersetGroup(groupId) {
    const exercises = AppState.savedData.exercises;
    for (const key of Object.keys(exercises)) {
        if (exercises[key].group === groupId) {
            exercises[key].group = null;
        }
    }
    debouncedSaveWorkoutData(AppState);
    renderAll();
}

// ===================================================================
// JUMP SHEET (All exercises drawer)
// ===================================================================

export function awOpenJumpSheet() {
    awCloseMenus();
    reorderMode = false;
    renderJumpSheetContent();
}

// ===================================================================
// SUPERSET LINK SHEET
// ===================================================================

const selectedForSuperset = new Set();

export function awOpenSupersetSheet() {
    selectedForSuperset.clear();
    renderSupersetSheet();
}

function renderSupersetSheet() {
    const exercises = AppState.currentWorkout.exercises;
    const count = selectedForSuperset.size;

    const body = exercises.map((ex, i) => {
        const saved = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
        const isComplete = saved.completed === true;
        const exName = getExerciseName(ex);

        if (isComplete) {
            // Completed exercises can't be added to a new superset. Show a muted
            // strike-through row + "Done" pill so it doesn't read as "selected"
            // (which a green check mark would imply).
            return `<div class="js-row disabled js-row--done">
                <div class="js-row__info">
                    <div class="js-row__name">${i + 1}. ${escapeHtml(exName)}</div>
                    <div class="js-row__meta">Can't link completed exercises</div>
                </div>
                <span class="js-row__done-pill">Done</span>
            </div>`;
        }

        const selected = selectedForSuperset.has(i);
        const cb = selected
            ? '<div class="js-row__checkbox checked"><i class="fas fa-check"></i></div>'
            : '<div class="js-row__checkbox"></div>';

        return `<div class="js-row ${selected ? 'selected' : ''}" onclick="awToggleSupersetSelect(${i})">
            ${cb}
            <div class="js-row__info">
                <div class="js-row__name">${i + 1}. ${escapeHtml(exName)}</div>
                <div class="js-row__meta">${ex.sets || 3} × ${ex.defaultReps || '?'}</div>
            </div>
        </div>`;
    }).join('');

    openSheet({
        title: '<i class="fas fa-link"></i> Link as superset',
        titleColor: 'var(--highlight-warm)',
        subtitle: 'Tap exercises to include. They\'ll alternate sets with shared rest.',
        body,
        actions: [
            { label: 'Cancel', onClick: 'awCloseSheet()' },
            {
                label: count >= 2 ? `<i class="fas fa-link"></i> Link ${count} exercises` : 'Select ≥ 2',
                onClick: 'awConfirmSupersetLink()',
                warm: true,
                disabled: count < 2,
            },
        ],
    });
}

export function awToggleSupersetSelect(idx) {
    if (selectedForSuperset.has(idx)) selectedForSuperset.delete(idx);
    else selectedForSuperset.add(idx);
    renderSupersetSheet();
}

export function awConfirmSupersetLink() {
    const indices = Array.from(selectedForSuperset);
    const groupId = groupExercises(indices, AppState.savedData.exercises);

    // Also set group on template exercises
    indices.forEach(idx => {
        if (AppState.currentWorkout.exercises[idx]) {
            AppState.currentWorkout.exercises[idx].group = groupId;
        }
    });

    selectedForSuperset.clear();
    saveWorkoutData(AppState);
    awCloseSheet();
    renderAll();
}

// ===================================================================
// EQUIPMENT CHANGE SHEET
// ===================================================================

let equipSearchQuery = '';

// Toggle for the active-workout picker: when at a gym, the "Other equipment"
// section is hidden by default so the user only sees what's actually at this
// location. They can tap "Show all" to expand it (e.g. to find a machine that
// hasn't been gym-tagged yet). State lives per-sheet open, reset on close.
let equipSheetShowAll = false;

export async function awOpenEquipmentSheet(exerciseIdx) {
    exerciseMenuOpen = false;
    equipSearchQuery = '';
    equipSheetShowAll = false;

    // Always refresh equipment from Firestore on open — the user may have
    // promoted catalog equipment via the library mid-workout. Without this
    // the picker keeps showing the stale cache and the just-added machine
    // doesn't appear ("never showed up nor came up in search" was the bug).
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        AppState._cachedEquipment = await mgr.getUserEquipment();
    } catch (e) {
        debugLog('Failed to load equipment:', e);
        if (!AppState._cachedEquipment) AppState._cachedEquipment = [];
    }

    renderEquipmentSheet(exerciseIdx);
}

function renderEquipmentSheet(exerciseIdx) {
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    const currentEquip = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`]?.equipment || exercise.equipment;
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const allEquipment = AppState._cachedEquipment || [];

    // Categorize equipment into sections
    const forThisExercise = [];
    const atThisGym = [];
    const otherEquipment = [];

    allEquipment.forEach(eq => {
        const isAssigned = (eq.exerciseTypes || []).some(n => n.toLowerCase() === exName.toLowerCase());
        const isAtLocation = locName && (eq.locations || []).some(l => l.toLowerCase() === locName.toLowerCase());

        if (isAssigned) {
            forThisExercise.push(eq);
        } else if (isAtLocation) {
            atThisGym.push(eq);
        } else {
            otherEquipment.push(eq);
        }
    });

    // Apply search
    const applySearch = (list) => {
        if (!equipSearchQuery) return list;
        const q = equipSearchQuery.toLowerCase();
        return list.filter(eq => eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q));
    };

    const renderRow = (eq) => {
        const isCurrent = eq.name === currentEquip;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locs = (eq.locations || []);
        const locStr = locs.length > 0 ? locs.join(', ') : '';
        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awSelectEquipment(${exerciseIdx}, '${escapeAttr(eq.name)}')">
                <div class="js-row__icon js-row__icon--equip"><i class="fas fa-cog"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(eq.name)}${isCurrent ? ' ✓' : ''}</div>
                    <div class="js-row__meta">${eq.equipmentType || 'Equipment'}${baseWeight}${locStr ? ` · <i class="fas fa-map-marker-alt js-row__loc-icon"></i> ${escapeHtml(locStr)}` : ''}</div>
                </div>
            </div>
        `;
    };

    // When searching: hide empty sections (keeps results tight).
    // When not searching: show ALL sections with a placeholder so emptiness is consistent
    // across all three groups rather than only the primary "For exercise" group.
    const renderSection = (title, list, emptyMsg) => {
        const filtered = applySearch(list);
        if (filtered.length === 0 && equipSearchQuery) return '';
        return `
            <div class="aw-equip-section">
                <div class="aw-equip-section__title">${title}</div>
                ${filtered.length > 0 ? filtered.map(renderRow).join('') : `<div class="aw-equip-section__empty">${emptyMsg}</div>`}
            </div>
        `;
    };

    const noneRow = `
        <div class="js-row js-row--none ${!currentEquip ? 'current' : ''}" onclick="awSelectEquipment(${exerciseIdx}, '')">
            <div class="js-row__icon js-row__icon--equip"><i class="fas fa-times"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">None${!currentEquip ? ' ✓' : ''}</div>
                <div class="js-row__meta">No equipment for this exercise</div>
            </div>
        </div>
    `;

    // When a gym is detected, hide the "Other equipment" pile by default —
    // the user just wants to see what's at their current location. They can
    // expand via a "Show all equipment" button or by searching. This was the
    // 6/2 complaint "shows all equipment not just what's loaded for this
    // location".
    const showOther = !locName || equipSheetShowAll || !!equipSearchQuery;
    const otherSectionHTML = showOther
        ? renderSection('Other equipment', otherEquipment, 'No other equipment saved')
        : (otherEquipment.length > 0
            ? `<div class="aw-equip-section">
                    <button class="aw-equip-show-all" onclick="awEquipShowAll(${exerciseIdx})">
                        Show all equipment (${otherEquipment.length} more)
                    </button>
                </div>`
            : '');

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search equipment…" value="${escapeAttr(equipSearchQuery)}" oninput="awEquipSearch(${exerciseIdx}, this.value)">
        </div>
        <div id="aw-equip-list">
            ${renderSection(`For ${escapeHtml(exName)}`, forThisExercise, 'No equipment assigned to this exercise yet')}
            ${locName ? renderSection(`At ${escapeHtml(locName)}`, atThisGym, `No equipment saved at ${escapeHtml(locName)} yet`) : ''}
            ${otherSectionHTML}
            ${noneRow}
        </div>
    `;

    openSheet({
        title: 'Choose equipment',
        subtitle: exName,
        body,
        actions: [
            // Route to the equipment library's full add flow (cascading
            // Brand → Line → Function picker driven by the catalog) instead
            // of the bare-bones manual form. Users wanted catalog browsing
            // when adding equipment, not just a name field.
            { label: '<i class="fas fa-plus"></i> Add from catalog', onClick: `awGoToEquipmentLibrary()` },
            { label: 'Done', onClick: 'awCloseSheet()', primary: true },
        ],
    });
}

/**
 * Bridge: close the active-workout equipment sheet and navigate to the
 * equipment library's add flow. The user adds via the catalog (cascading
 * Brand → Line → Function), then returns to active workout via the dumbbell
 * nav button — the workout is preserved in AppState so they pick up where
 * they left off.
 */
export function awGoToEquipmentLibrary() {
    awCloseSheet();
    // Navigate to equipment library and immediately open the add flow.
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('equipment-library');
    }
    // Opening the add flow needs to happen AFTER the section is visible.
    setTimeout(() => {
        if (typeof window.showAddEquipmentFlow === 'function') {
            window.showAddEquipmentFlow();
        }
    }, 200);
}

// ===================================================================
// SHARED EQUIPMENT SHEET (Phase 3.4)
// Same UI as awOpenEquipmentSheet, but driven by a caller-supplied
// callback instead of writing to AppState. The active-workout flow
// (awOpenEquipmentSheet / awSelectEquipment / awEquipSearch) is left
// completely untouched — this is a parallel path so template-editor
// and other surfaces can reuse the picker without risk to live workouts.
// ===================================================================

let _sharedEquipmentContext = null;
// Shape: { exerciseName, currentEquipment, onSelect, onCancel? }

export async function openSharedEquipmentSheet({ exerciseName, currentEquipment, onSelect, onCancel }) {
    if (typeof onSelect !== 'function') {
        console.error('openSharedEquipmentSheet: onSelect is required');
        return;
    }
    awCloseMenus();
    equipSearchQuery = '';

    // Lazy-load equipment cache (same pattern as awOpenEquipmentSheet)
    if (!AppState._cachedEquipment || AppState._cachedEquipment.length === 0) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const mgr = new FirebaseWorkoutManager(AppState);
            AppState._cachedEquipment = await mgr.getUserEquipment();
        } catch (e) {
            debugLog('Failed to load equipment for shared sheet:', e);
            AppState._cachedEquipment = [];
        }
    }

    _sharedEquipmentContext = {
        exerciseName,
        currentEquipment: currentEquipment || null,
        onSelect,
        onCancel: typeof onCancel === 'function' ? onCancel : null,
    };
    renderSharedEquipmentSheet();
}

function renderSharedEquipmentSheet() {
    const ctx = _sharedEquipmentContext;
    if (!ctx) return;

    const exName = ctx.exerciseName;
    const currentEquip = ctx.currentEquipment;
    // Use session location if there happens to be one (e.g., user is editing a
    // template while detected at a gym), otherwise omit the "At {gym}" section.
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const allEquipment = AppState._cachedEquipment || [];

    const forThisExercise = [];
    const atThisGym = [];
    const otherEquipment = [];

    allEquipment.forEach(eq => {
        const isAssigned = (eq.exerciseTypes || []).some(n => n.toLowerCase() === exName.toLowerCase());
        const isAtLocation = locName && (eq.locations || []).some(l => l.toLowerCase() === locName.toLowerCase());
        if (isAssigned) forThisExercise.push(eq);
        else if (isAtLocation) atThisGym.push(eq);
        else otherEquipment.push(eq);
    });

    const applySearch = (list) => {
        if (!equipSearchQuery) return list;
        const q = equipSearchQuery.toLowerCase();
        return list.filter(eq => eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q));
    };

    const renderRow = (eq) => {
        const isCurrent = eq.name === currentEquip;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locs = (eq.locations || []);
        const locStr = locs.length > 0 ? locs.join(', ') : '';
        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awSharedSelectEquipment('${escapeAttr(eq.name)}')">
                <div class="js-row__icon js-row__icon--equip"><i class="fas fa-cog"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(eq.name)}${isCurrent ? ' ✓' : ''}</div>
                    <div class="js-row__meta">${eq.equipmentType || 'Equipment'}${baseWeight}${locStr ? ` · <i class="fas fa-map-marker-alt js-row__loc-icon"></i> ${escapeHtml(locStr)}` : ''}</div>
                </div>
            </div>
        `;
    };

    const renderSection = (title, list, emptyMsg) => {
        const filtered = applySearch(list);
        if (filtered.length === 0 && equipSearchQuery) return '';
        return `
            <div class="aw-equip-section">
                <div class="aw-equip-section__title">${title}</div>
                ${filtered.length > 0 ? filtered.map(renderRow).join('') : `<div class="aw-equip-section__empty">${emptyMsg}</div>`}
            </div>
        `;
    };

    const noneRow = `
        <div class="js-row js-row--none ${!currentEquip ? 'current' : ''}" onclick="awSharedSelectEquipment('')">
            <div class="js-row__icon js-row__icon--equip"><i class="fas fa-times"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">None${!currentEquip ? ' ✓' : ''}</div>
                <div class="js-row__meta">No equipment for this exercise</div>
            </div>
        </div>
    `;

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search equipment…" value="${escapeAttr(equipSearchQuery)}" oninput="awSharedEquipSearch(this.value)">
        </div>
        <div id="aw-equip-list">
            ${renderSection(`For ${escapeHtml(exName)}`, forThisExercise, 'No equipment assigned to this exercise yet')}
            ${locName ? renderSection(`At ${escapeHtml(locName)}`, atThisGym, `No equipment saved at ${escapeHtml(locName)} yet`) : ''}
            ${renderSection('Other equipment', otherEquipment, 'No other equipment saved')}
            ${noneRow}
        </div>
    `;

    openSheet({
        title: 'Choose equipment',
        subtitle: exName,
        body,
        actions: [
            { label: 'Cancel', onClick: 'awSharedCancelEquipment()' },
            { label: 'Done', onClick: 'awCloseSheet()', primary: true },
        ],
    });
}

export function awSharedEquipSearch(query) {
    equipSearchQuery = query;
    const listEl = document.getElementById('aw-equip-list');
    if (!listEl || !_sharedEquipmentContext) return;

    const ctx = _sharedEquipmentContext;
    const allEquipment = AppState._cachedEquipment || [];
    const q = query.toLowerCase();
    const matches = allEquipment.filter(eq =>
        eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q)
    );
    const renderRow = (eq) => {
        const isCurrent = eq.name === ctx.currentEquipment;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locs = (eq.locations || []);
        const locStr = locs.length > 0 ? locs.join(', ') : '';
        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awSharedSelectEquipment('${escapeAttr(eq.name)}')">
                <div class="js-row__icon js-row__icon--equip"><i class="fas fa-cog"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(eq.name)}${isCurrent ? ' ✓' : ''}</div>
                    <div class="js-row__meta">${eq.equipmentType || 'Equipment'}${baseWeight}${locStr ? ` · <i class="fas fa-map-marker-alt js-row__meta-pin"></i> ${escapeHtml(locStr)}` : ''}</div>
                </div>
            </div>
        `;
    };
    listEl.innerHTML = matches.length > 0
        ? matches.map(renderRow).join('')
        : '<div class="aw-sheet__empty">No matches</div>';
}

export async function awSharedSelectEquipment(equipName) {
    const ctx = _sharedEquipmentContext;
    if (!ctx) { awCloseSheet(); return; }
    const cb = ctx.onSelect;
    _sharedEquipmentContext = null;
    awCloseSheet();
    try { await cb(equipName); } catch (e) { console.error('Shared equipment onSelect threw:', e); }
}

export function awSharedCancelEquipment() {
    const ctx = _sharedEquipmentContext;
    _sharedEquipmentContext = null;
    awCloseSheet();
    if (ctx?.onCancel) {
        try { ctx.onCancel(); } catch (e) { console.error('Shared equipment onCancel threw:', e); }
    }
}

/**
 * Expand the "Other equipment" section of the active-workout equipment
 * picker. Used by the "Show all equipment" button in the gym-filtered view.
 */
export function awEquipShowAll(exerciseIdx) {
    equipSheetShowAll = true;
    renderEquipmentSheet(exerciseIdx);
}

export function awEquipSearch(exerciseIdx, query) {
    equipSearchQuery = query;
    // Re-render just the list content, preserving the search input focus
    const listEl = document.getElementById('aw-equip-list');
    if (!listEl) return;

    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const currentEquip = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`]?.equipment || exercise.equipment;
    const allEquipment = AppState._cachedEquipment || [];
    const q = query.toLowerCase();

    // Filter all equipment by search
    const matches = allEquipment.filter(eq =>
        eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q)
    );

    const renderRow = (eq) => {
        const isCurrent = eq.name === currentEquip;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locs = (eq.locations || []);
        const locStr = locs.length > 0 ? locs.join(', ') : '';
        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awSelectEquipment(${exerciseIdx}, '${escapeAttr(eq.name)}')">
                <div class="js-row__icon js-row__icon--equip"><i class="fas fa-cog"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(eq.name)}${isCurrent ? ' ✓' : ''}</div>
                    <div class="js-row__meta">${eq.equipmentType || 'Equipment'}${baseWeight}${locStr ? ` · <i class="fas fa-map-marker-alt js-row__meta-pin"></i> ${escapeHtml(locStr)}` : ''}</div>
                </div>
            </div>
        `;
    };

    listEl.innerHTML = matches.length > 0
        ? matches.map(renderRow).join('')
        : '<div class="aw-sheet__empty">No matches</div>';
}

export async function awSelectEquipment(exerciseIdx, equipName) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    AppState.savedData.exercises[key].equipment = equipName || null;

    // Also update template exercise
    if (AppState.currentWorkout.exercises[exerciseIdx]) {
        AppState.currentWorkout.exercises[exerciseIdx].equipment = equipName || null;
    }

    // Auto-associate: add current location + exercise to equipment if not already there
    if (equipName) {
        const eq = getEquipmentDoc(equipName);
        const exName = getExerciseName(AppState.currentWorkout.exercises[exerciseIdx]);
        const sessionLoc = AppState.savedData?.location;
        const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

        if (eq) {
            let needsUpdate = false;
            // Add current location if not present
            if (locName && !(eq.locations || []).some(l => l.toLowerCase() === locName.toLowerCase())) {
                eq.locations = [...(eq.locations || []), locName];
                needsUpdate = true;
            }
            // Add exercise type if not present
            if (exName && !(eq.exerciseTypes || []).some(n => n.toLowerCase() === exName.toLowerCase())) {
                eq.exerciseTypes = [...(eq.exerciseTypes || []), exName];
                needsUpdate = true;
            }
            if (needsUpdate && eq.id) {
                try {
                    const { doc, db, updateDoc } = await import('../data/firebase-config.js');
                    const eqRef = doc(db, 'users', AppState.currentUser.uid, 'equipment', eq.id);
                    await updateDoc(eqRef, { locations: eq.locations, exerciseTypes: eq.exerciseTypes });
                    // Phase C: one-time toast so auto-associate isn't a silent write
                    if (locName) {
                        showNotification(`Added ${equipName} to ${locName}`, 'silent', 2500);
                    }
                } catch (e) {
                    // Non-critical — equipment association will work next time
                    debugLog('Equipment auto-associate failed:', e);
                }
            }
        }
    }

    debouncedSaveWorkoutData(AppState);
    awCloseSheet();
    renderAll();

    // Refetch autofill so the last-session card + placeholders update to
    // the new equipment's history (the cache key is equipment-specific, so
    // this triggers a fresh fetch). renderAll inside loadAutofillForExercise
    // handles the second redraw once data lands.
    loadAutofillForExercise(exerciseIdx);
}

export function awQuickAddEquipment(exerciseIdx) {
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const types = ['Machine', 'Barbell', 'Dumbbell', 'Cable', 'Bench', 'Rack', 'Bodyweight', 'Other'];
    const defaultType = guessEquipmentType(exercise);

    const body = `
        <div class="field">
            <div class="field-label">Name</div>
            <input id="aw-new-equip-name" class="field-input" type="text" placeholder="e.g. Hammer Strength Incline">
        </div>
        <div class="field">
            <div class="field-label">Type</div>
            <div class="aw-sheet__chips" id="aw-new-equip-type">
                ${types.map(t => `<button class="aw-sheet__chip ${t === defaultType ? 'active' : ''}" onclick="document.querySelectorAll('#aw-new-equip-type .aw-sheet__chip').forEach(c=>c.classList.remove('active'));this.classList.add('active')" data-type="${t}">${t}</button>`).join('')}
            </div>
        </div>
        <div class="field">
            <div class="field-label">Base weight (empty bar/carriage)</div>
            <div class="aw-new-equip__base-row">
                <input id="aw-new-equip-base" class="field-input aw-new-equip__base-input" type="number" inputmode="decimal" step="0.5" placeholder="0" value="">
                <span class="aw-new-equip__base-unit">lb</span>
            </div>
        </div>
        ${locName ? `<div class="aw-new-equip__location-hint"><i class="fas fa-map-marker-alt"></i> Will be added to ${escapeHtml(locName)}</div>` : ''}
    `;

    openSheet({
        title: 'New equipment',
        subtitle: `For ${exName}`,
        body,
        actions: [
            { label: 'Cancel', onClick: `awOpenEquipmentSheet(${exerciseIdx})` },
            { label: '<i class="fas fa-check"></i> Create & use', onClick: `awSaveNewEquipment(${exerciseIdx})`, primary: true },
        ],
    });

    // Focus name input
    setTimeout(() => document.getElementById('aw-new-equip-name')?.focus(), 300);
}

// Best-guess default equipment-type based on the exercise's name/category.
// Used by the "New equipment" form so the user doesn't have to re-pick the chip.
function guessEquipmentType(exercise) {
    const name = (exercise?.name || exercise?.machine || '').toLowerCase();
    const cat = (exercise?.category || '').toLowerCase();

    if (/\bpull[- ]?up|\bpush[- ]?up|\bdip\b|\bplank\b|\bsit[- ]?up|crunch|burpee|\bchin[- ]?up/.test(name)) return 'Bodyweight';
    if (/\bcable\b|lat pulldown|tricep pushdown|face pull/.test(name)) return 'Cable';
    if (/\bdumbbell\b|\bdb\b|\bdbs\b|curl|fly\b|lateral raise|front raise/.test(name)) return 'Dumbbell';
    if (/\bbarbell\b|\bbb\b|squat|deadlift|bench press|overhead press|ohp\b|\brow\b|clean|snatch/.test(name)) return 'Barbell';
    if (cat === 'cardio') return 'Machine';
    if (cat === 'core') return 'Bodyweight';
    return 'Machine';
}

export async function awSaveNewEquipment(exerciseIdx) {
    const nameInput = document.getElementById('aw-new-equip-name');
    const baseInput = document.getElementById('aw-new-equip-base');
    const activeType = document.querySelector('#aw-new-equip-type .aw-sheet__chip.active');

    const name = nameInput?.value?.trim();
    if (!name) {
        nameInput?.classList.add('input-error');
        setTimeout(() => nameInput?.classList.remove('input-error'), 600);
        // Inline error message so users know *why* the pulse happened.
        let errEl = document.getElementById('aw-new-equip-name-error');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.id = 'aw-new-equip-name-error';
            errEl.className = 'field__error';
            errEl.textContent = 'Name required';
            nameInput?.parentElement?.appendChild(errEl);
        }
        nameInput?.focus();
        return;
    }
    // Clear any existing error message on success
    document.getElementById('aw-new-equip-name-error')?.remove();

    const equipType = activeType?.dataset?.type || 'Machine';
    const baseWeight = parseFloat(baseInput?.value) || 0;
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        // Create equipment in Firebase
        const eqData = {
            name,
            equipmentType: equipType,
            baseWeight,
            baseWeightUnit: 'lb',
            locations: locName ? [locName] : [],
            exerciseTypes: [exName],
            exerciseVideos: {},
        };

        const docRef = await workoutManager.saveEquipment(eqData);

        // Add to local cache
        const newEq = { id: docRef?.id || `eq_${Date.now()}`, ...eqData };
        if (!AppState._cachedEquipment) AppState._cachedEquipment = [];
        AppState._cachedEquipment.push(newEq);

        // Select it for this exercise
        awSelectEquipment(exerciseIdx, name);
        showNotification(`${name} created`, 'success');
    } catch (err) {
        console.error('Error creating equipment:', err);
        showNotification("Couldn't create equipment", 'error');
    }
}

// ===================================================================
// ADD EXERCISE SHEET
// ===================================================================

let addExerciseFilter = 'All';
let addExerciseSearch = '';

export function awAddExercise() {
    awCloseMenus();
    addExerciseFilter = 'All';
    addExerciseSearch = '';
    renderAddExerciseSheet();
}

function renderAddExerciseSheet() {
    const library = AppState.exerciseDatabase || [];
    let filtered = library;

    if (addExerciseFilter !== 'All') {
        filtered = filtered.filter(ex => {
            const cat = (ex.category || '').toLowerCase();
            return cat === addExerciseFilter.toLowerCase();
        });
    }
    if (addExerciseSearch) {
        const q = addExerciseSearch.toLowerCase();
        filtered = filtered.filter(ex =>
            (ex.name || ex.machine || '').toLowerCase().includes(q)
        );
    }

    const categories = ['All', 'Push', 'Pull', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];
    const chips = categories.map(c =>
        `<button class="aw-sheet__chip ${c === addExerciseFilter ? 'active' : ''}" onclick="awSetAddFilter('${c}')">${c}</button>`
    ).join('');

    // Show an inline "+ Create" row when the search yields no exact match.
    // Without this, a user trying to add a new exercise mid-workout had to
    // close the sheet, navigate to the exercise library to create it, then
    // come back and find it in the list. Now they can create + insert in one
    // tap. We show it whenever the user has typed a search string and no
    // exact-name match exists in the filtered results.
    const trimmed = (addExerciseSearch || '').trim();
    const exactMatch = trimmed && filtered.some(ex =>
        (ex.name || ex.machine || '').toLowerCase() === trimmed.toLowerCase()
    );
    const createRowHTML = trimmed && !exactMatch
        ? `<div class="aw-add-ex-row aw-add-ex-row--create" onclick="awCreateAndInsertExercise('${escapeAttr(trimmed)}')">
                <i class="fas fa-plus-circle"></i>
                <span class="aw-add-ex-row__name">Create "${escapeHtml(trimmed)}"</span>
                <span class="aw-add-ex-row__cat">New</span>
            </div>`
        : '';

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search exercises…" value="${escapeAttr(addExerciseSearch)}"
                   oninput="awSetAddSearch(this.value)"
                   onfocus="setTimeout(() => this.scrollIntoView({ block: 'start' }), 200)">
        </div>
        <div class="aw-sheet__chips">${chips}</div>
        <div id="aw-add-exercise-list">
            ${createRowHTML}
            ${filtered.slice(0, 50).map(ex => {
                const name = ex.name || ex.machine || 'Unknown';
                const cat = ex.category || '';
                return `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(name)}')">
                    <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
                    <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
                </div>`;
            }).join('')}
            ${filtered.length > 50 ? `<div class="aw-add-ex-truncated">Showing 50 of ${filtered.length} — refine your search</div>` : ''}
            ${filtered.length === 0 && !createRowHTML ? '<div class="aw-add-ex-empty">No exercises found</div>' : ''}
        </div>
    `;

    openSheet({
        title: 'Add exercise',
        subtitle: `${AppState.currentWorkout.exercises.length} exercises in workout`,
        body,
        actions: [
            { label: 'Cancel', onClick: 'awCloseSheet()' },
        ],
    });
}

export function awSetAddFilter(cat) {
    addExerciseFilter = cat;

    // Update chips active state in-place
    document.querySelectorAll('#aw-sheet .aw-sheet__chips .aw-sheet__chip').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === cat);
    });

    // Update exercise list in-place
    updateAddExerciseList();
}

function updateAddExerciseList() {
    const listEl = document.getElementById('aw-add-exercise-list');
    if (!listEl) return;

    const library = AppState.exerciseDatabase || [];
    let filtered = library;
    if (addExerciseFilter !== 'All') {
        filtered = filtered.filter(ex => (ex.category || '').toLowerCase() === addExerciseFilter.toLowerCase());
    }
    if (addExerciseSearch) {
        const q = addExerciseSearch.toLowerCase();
        filtered = filtered.filter(ex => (ex.name || ex.machine || '').toLowerCase().includes(q));
    }

    const trimmed = (addExerciseSearch || '').trim();
    const exactMatch = trimmed && filtered.some(ex =>
        (ex.name || ex.machine || '').toLowerCase() === trimmed.toLowerCase()
    );
    const createRowHTML = trimmed && !exactMatch
        ? `<div class="aw-add-ex-row aw-add-ex-row--create" onclick="awCreateAndInsertExercise('${escapeAttr(trimmed)}')">
                <i class="fas fa-plus-circle"></i>
                <span class="aw-add-ex-row__name">Create "${escapeHtml(trimmed)}"</span>
                <span class="aw-add-ex-row__cat">New</span>
            </div>`
        : '';

    const rowsHTML = filtered.slice(0, 50).map(ex => {
        const name = ex.name || ex.machine || 'Unknown';
        const cat = ex.category || '';
        return `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(name)}')">
            <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
            <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
        </div>`;
    }).join('');

    listEl.innerHTML = createRowHTML + (rowsHTML || (createRowHTML ? '' : '<div class="aw-sheet__empty aw-sheet__empty--large">No exercises found</div>'));
}

export function awSetAddSearch(query) {
    addExerciseSearch = query;
    updateAddExerciseList();
}

export function awInsertExercise(exerciseName) {
    const library = AppState.exerciseDatabase || [];
    const template = library.find(ex => (ex.name || ex.machine) === exerciseName);

    const newExercise = template
        ? JSON.parse(JSON.stringify(template))
        : { name: exerciseName, sets: 3, defaultReps: 10, category: 'Push' };

    // Add to workout
    AppState.currentWorkout.exercises.push(newExercise);

    // Initialize saved data for new exercise
    const idx = AppState.currentWorkout.exercises.length - 1;
    AppState.savedData.exercises[`exercise_${idx}`] = { sets: [] };

    // Load autofill for the new exercise
    loadAutofillForExercise(idx);

    debouncedSaveWorkoutData(AppState);
    awCloseSheet();

    // Jump to new exercise
    awJumpTo(idx);
    showNotification(`${exerciseName} added`, 'success');
}

/**
 * Persist a brand-new exercise to the user's library AND drop it straight
 * into the active workout. Wires the "Create [search]" row in the
 * Add-exercise sheet — previously the user had to bail out of the workout,
 * navigate to the exercise library to create it, then come back. Defaults
 * use the active category filter when one is selected so the new exercise
 * lands in a sensible bucket.
 */
export async function awCreateAndInsertExercise(rawName) {
    const name = (rawName || '').trim();
    if (!name) return;
    if (!AppState.currentUser) {
        showNotification('Sign in to add custom exercises', 'warning');
        return;
    }

    // Use the current category filter as the default — falls back to Push
    // when "All" is selected so we have a non-empty body part.
    const category = addExerciseFilter && addExerciseFilter !== 'All' ? addExerciseFilter : 'Push';

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        const result = await mgr.saveCustomExercise({
            name,
            machine: name,
            bodyPart: category,
            equipmentType: 'Machine',
            sets: 3,
            reps: 10,
            weight: 0,
            video: '',
            category,
        });

        // Refresh the in-memory exercise database so future renders + the
        // jump-to-existing path find this exercise without re-querying.
        const refreshed = await mgr.getExerciseLibrary();
        if (Array.isArray(refreshed)) AppState.exerciseDatabase = refreshed;

        // awInsertExercise will hit AppState.exerciseDatabase first and
        // hydrate from the saved template if found; otherwise it falls back
        // to a name-only exercise. Either way the workout gets the new entry.
        awInsertExercise(name);
        showNotification(`Created "${name}"`, 'success');
    } catch (err) {
        console.error('awCreateAndInsertExercise failed:', err);
        showNotification("Couldn't create exercise — try again", 'error');
    }
}

// ===================================================================
// SHARED ADD-EXERCISE SHEET (Phase 4)
// Parallel path that mirrors awAddExercise's UI but is driven by a
// caller-supplied callback. Active-workout flow (awAddExercise +
// awInsertExercise) is untouched — code duplication is a deliberate
// safety tradeoff so live sessions can't regress.
// ===================================================================

let _sharedAddExerciseContext = null;
// Shape: { targetWorkoutLabel: string, alreadyAdded: Set<string>, onSelect: (exerciseRecord) => void|Promise, onCreateRequested?: (query: string) => void }
let _sharedAddSearch = '';
let _sharedAddFilter = 'All';

export function openSharedAddExerciseSheet({ targetWorkoutLabel, alreadyAdded, onSelect, onCreateRequested }) {
    if (typeof onSelect !== 'function') {
        console.error('openSharedAddExerciseSheet: onSelect is required');
        return;
    }
    awCloseMenus();
    _sharedAddSearch = '';
    _sharedAddFilter = 'All';
    const addedSet = new Set((alreadyAdded || []).map(n => (n || '').toLowerCase()).filter(Boolean));
    _sharedAddExerciseContext = {
        targetWorkoutLabel: targetWorkoutLabel || '',
        alreadyAdded: addedSet,
        onSelect,
        onCreateRequested: typeof onCreateRequested === 'function' ? onCreateRequested : null,
    };
    renderSharedAddExerciseSheet();
}

function renderSharedAddExerciseSheet() {
    const ctx = _sharedAddExerciseContext;
    if (!ctx) return;

    const categories = ['All', 'Push', 'Pull', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];
    const chips = categories.map(c =>
        `<button class="aw-sheet__chip ${c === _sharedAddFilter ? 'active' : ''}" onclick="awSharedAddSetFilter('${c}')">${c}</button>`
    ).join('');

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search exercises…" value="${escapeAttr(_sharedAddSearch)}" oninput="awSharedAddSetSearch(this.value)">
        </div>
        <div class="aw-sheet__chips">${chips}</div>
        <div id="aw-shared-add-list">
            ${renderSharedAddListBody()}
        </div>
    `;

    openSheet({
        title: 'Add exercise',
        subtitle: ctx.targetWorkoutLabel,
        body,
        actions: [
            { label: 'Cancel', onClick: 'awSharedAddCancel()' },
        ],
    });
}

function getFilteredSharedAddExercises() {
    const library = AppState.exerciseDatabase || [];
    let filtered = library;
    if (_sharedAddFilter !== 'All') {
        filtered = filtered.filter(ex => (ex.category || '').toLowerCase() === _sharedAddFilter.toLowerCase());
    }
    if (_sharedAddSearch) {
        const q = _sharedAddSearch.toLowerCase();
        filtered = filtered.filter(ex => (ex.name || ex.machine || '').toLowerCase().includes(q));
    }
    return filtered;
}

function renderSharedAddListBody() {
    const ctx = _sharedAddExerciseContext;
    if (!ctx) return '';

    const filtered = getFilteredSharedAddExercises();
    const slice = filtered.slice(0, 50);

    const renderRow = (ex) => {
        const name = ex.name || ex.machine || 'Unknown';
        const cat = ex.category || '';
        const isAdded = ctx.alreadyAdded.has(name.toLowerCase());
        if (isAdded) {
            return `<div class="aw-add-ex-row aw-add-ex-row--added">
                <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
                <span class="aw-add-ex-row__cat">Added</span>
            </div>`;
        }
        return `<div class="aw-add-ex-row" onclick="awSharedAddInsert('${escapeAttr(name)}')">
            <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
            <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
        </div>`;
    };

    const rowsHtml = slice.map(renderRow).join('');
    const truncated = filtered.length > 50
        ? `<div class="aw-add-ex-truncated">Showing 50 of ${filtered.length} — refine your search</div>`
        : '';

    // "Create [query]" row when the search returned nothing AND a query is set.
    let createRow = '';
    if (filtered.length === 0 && _sharedAddSearch && ctx.onCreateRequested) {
        createRow = `<div class="aw-add-ex-row aw-add-ex-row--create" onclick="awSharedAddCreate('${escapeAttr(_sharedAddSearch)}')">
            <span class="aw-add-ex-row__name"><i class="fas fa-plus"></i> Create &quot;${escapeHtml(_sharedAddSearch)}&quot;</span>
        </div>`;
    }

    const empty = (filtered.length === 0 && !createRow)
        ? '<div class="aw-add-ex-empty">No exercises found</div>'
        : '';

    return rowsHtml + truncated + empty + createRow;
}

function updateSharedAddListInPlace() {
    const listEl = document.getElementById('aw-shared-add-list');
    if (!listEl) return;
    listEl.innerHTML = renderSharedAddListBody();
}

export function awSharedAddSetFilter(cat) {
    _sharedAddFilter = cat;
    document.querySelectorAll('#aw-sheet .aw-sheet__chips .aw-sheet__chip').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === cat);
    });
    updateSharedAddListInPlace();
}

export function awSharedAddSetSearch(query) {
    _sharedAddSearch = query;
    updateSharedAddListInPlace();
}

export async function awSharedAddInsert(exerciseName) {
    const ctx = _sharedAddExerciseContext;
    if (!ctx) { awCloseSheet(); return; }
    const library = AppState.exerciseDatabase || [];
    const exerciseRecord = library.find(ex => (ex.name || ex.machine) === exerciseName)
        || { name: exerciseName, machine: exerciseName };
    const cb = ctx.onSelect;
    _sharedAddExerciseContext = null;
    awCloseSheet();
    try { await cb(exerciseRecord); } catch (e) { console.error('Shared add-exercise onSelect threw:', e); }
}

export function awSharedAddCreate(query) {
    const ctx = _sharedAddExerciseContext;
    if (!ctx || !ctx.onCreateRequested) { awCloseSheet(); return; }
    const cb = ctx.onCreateRequested;
    _sharedAddExerciseContext = null;
    awCloseSheet();
    try { cb(query); } catch (e) { console.error('Shared add-exercise onCreateRequested threw:', e); }
}

export function awSharedAddCancel() {
    _sharedAddExerciseContext = null;
    awCloseSheet();
}

// ===================================================================
// UNIT TOGGLE
// ===================================================================

export function awToggleUnit(exerciseIdx) {
    const current = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';
    const newUnit = current === 'lbs' ? 'kg' : 'lbs';
    if (!AppState.exerciseUnits) AppState.exerciseUnits = {};
    AppState.exerciseUnits[exerciseIdx] = newUnit;

    // Convert existing set values. Use each set's OWN originalUnit as the
    // source — an autofilled set may be in a different unit than the current
    // exerciseUnits value. Using `current` blindly caused 70 lbs autofill to
    // be mis-converted as if it were 70 kg when the user toggled.
    const key = `exercise_${exerciseIdx}`;
    const savedEx = AppState.savedData.exercises[key];
    if (savedEx?.sets) {
        savedEx.sets.forEach(set => {
            if (set.weight != null && set.weight > 0) {
                const from = set.originalUnit || current;
                set.weight = convertWeight(set.weight, from, newUnit);
            }
            set.originalUnit = newUnit;
        });
    }

    debouncedSaveWorkoutData(AppState);

    // Surgical DOM update — preserve input focus (Phase C polish: don't call renderAll).
    // If the current exercise in view matches, update the unit toggle label + weight
    // column label + every weight input in place. Any other exercise stays stale
    // until its view is opened (same as today).
    if (exerciseIdx === currentExerciseIdx) {
        const unitBtn = document.querySelector('.aw-sets-header__unit');
        if (unitBtn) unitBtn.textContent = newUnit;

        // Update the weight column label (lbs / kg / Added lbs / Plates lbs)
        const exercise = AppState.currentWorkout.exercises[exerciseIdx];
        const isBW = isBodyweightExercise(exercise);
        const equipDoc = getEquipmentDoc(savedEx?.equipment || exercise?.equipment || null);
        const hasBaseWeight = !isBW && equipDoc && equipDoc.baseWeight > 0;
        let weightLabel = newUnit;
        if (isBW) weightLabel = `Added ${newUnit}`;
        else if (hasBaseWeight) weightLabel = `Plates ${newUnit}`;
        const labels = document.querySelectorAll('.aw-sets-header .aw-sets-header__label');
        if (labels.length >= 3) labels[2].textContent = weightLabel;

        // Update weight input values to the new unit
        (savedEx?.sets || []).forEach((set, setIdx) => {
            const input = document.querySelector(`.aw-set-row[data-set-idx="${setIdx}"] input[data-field="weight"]`);
            if (input && document.activeElement !== input) {
                input.value = set.weight != null ? set.weight : '';
            }
        });
    }
}

// ===================================================================
// REORDER EXERCISES
// ===================================================================

let reorderMode = false;

export function awToggleReorder() {
    reorderMode = !reorderMode;
    renderJumpSheetContent();
}

export function awMoveExercise(fromIdx, direction) {
    const toIdx = fromIdx + direction;
    const exercises = AppState.currentWorkout.exercises;
    if (toIdx < 0 || toIdx >= exercises.length) return;

    // Swap in template
    [exercises[fromIdx], exercises[toIdx]] = [exercises[toIdx], exercises[fromIdx]];

    // Swap in savedData
    const savedExercises = AppState.savedData.exercises;
    const fromKey = `exercise_${fromIdx}`;
    const toKey = `exercise_${toIdx}`;
    const fromData = savedExercises[fromKey] || { sets: [] };
    const toData = savedExercises[toKey] || { sets: [] };
    savedExercises[fromKey] = toData;
    savedExercises[toKey] = fromData;

    // Swap exerciseUnits too — keyed by index, so without this the unit
    // assignment desyncs after a reorder. Same root cause as the
    // savedData swap above: index-keyed per-exercise state must move
    // with its exercise.
    if (AppState.exerciseUnits) {
        const fromUnit = AppState.exerciseUnits[fromIdx];
        const toUnit = AppState.exerciseUnits[toIdx];
        if (toUnit !== undefined) AppState.exerciseUnits[fromIdx] = toUnit;
        else delete AppState.exerciseUnits[fromIdx];
        if (fromUnit !== undefined) AppState.exerciseUnits[toIdx] = fromUnit;
        else delete AppState.exerciseUnits[toIdx];
    }

    // Update current index if needed
    if (currentExerciseIdx === fromIdx) currentExerciseIdx = toIdx;
    else if (currentExerciseIdx === toIdx) currentExerciseIdx = fromIdx;

    debouncedSaveWorkoutData(AppState);
    window.inProgressWorkout = { ...AppState.savedData, originalWorkout: AppState.currentWorkout };

    // Re-render the jump sheet in place
    renderJumpSheetContent();
}

function renderJumpSheetContent() {
    const exercises = AppState.currentWorkout.exercises;
    const done = exercises.filter((ex, i) => {
        const saved = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
        return saved.completed;
    }).length;
    const toGo = exercises.length - done;

    const body = exercises.map((ex, i) => {
        const saved = AppState.savedData?.exercises?.[`exercise_${i}`] || {};
        const isComplete = saved.completed === true;
        const isCurrent = i === currentExerciseIdx;
        const group = saved.group || ex.group;
        const category = getCategory(ex);
        const iconClass = getCategoryIcon(ex.category || category) || 'fas fa-dumbbell';
        const exName = getExerciseName(ex);
        const targetSets = ex.sets || 3;
        const completedSets = (saved.sets || []).filter(s => s.completed).length;

        const supersetBadge = group ? `<span class="js-row__superset">SS ${group}</span>` : '';

        if (reorderMode) {
            return `
                <div class="js-row ${isCurrent ? 'current' : ''}">
                    <div class="js-row__reorder-btns">
                        <button class="js-row__move" onclick="awMoveExercise(${i}, -1)" ${i === 0 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-up"></i>
                        </button>
                        <button class="js-row__move" onclick="awMoveExercise(${i}, 1)" ${i === exercises.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <div class="js-row__info">
                        <div class="js-row__name">${i + 1}. ${escapeHtml(exName)}${supersetBadge}</div>
                        <div class="js-row__meta">${isComplete ? `${completedSets} sets done` : `${completedSets}/${targetSets} sets`}</div>
                    </div>
                </div>
            `;
        }

        let status = '';
        if (isComplete) status = '<div class="js-row__status done">✓</div>';
        else if (isCurrent) status = '<div class="js-row__status current">●</div>';

        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awJumpTo(${i}); awCloseSheet();">
                <div class="js-row__icon tint-${category}"><i class="${iconClass}"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${i + 1}. ${escapeHtml(exName)}${supersetBadge}</div>
                    <div class="js-row__meta">${isComplete ? `${completedSets} sets done` : `${completedSets}/${targetSets} sets`}</div>
                </div>
                ${status}
            </div>
        `;
    }).join('');

    openSheet({
        title: AppState.savedData?.workoutType || 'Workout',
        subtitle: `${done} done · ${toGo} to go`,
        body,
        actions: [
            { label: '<i class="fas fa-plus"></i> Add', onClick: 'awAddExercise()' },
            {
                label: reorderMode
                    ? '<i class="fas fa-check"></i> Done reordering'
                    : '<i class="fas fa-arrows-alt-v"></i> Reorder',
                onClick: 'awToggleReorder()',
                primary: reorderMode,
            },
            ...(!reorderMode ? [
                { label: '<i class="fas fa-link"></i> Superset', onClick: 'awOpenSupersetSheet()', warm: true },
            ] : []),
            { label: 'Close', onClick: 'awCloseSheet(); awEndReorder();', primary: !reorderMode },
        ],
    });
}

export function awEndReorder() {
    reorderMode = false;
    renderAll(); // re-render pills to reflect new order
}

// ===================================================================
// BOTTOM SHEET UTILITY
// ===================================================================

function openSheet({ title, titleColor, subtitle, body, actions }) {
    closeSheetImmediate();

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'aw-sheet-backdrop';
    backdrop.onclick = () => awCloseSheet();

    const actionsHtml = (actions || []).map(a => {
        const cls = ['aw-sheet__action'];
        if (a.primary) cls.push('primary');
        if (a.warm) cls.push('warm');
        if (a.danger) cls.push('danger');
        return `<button class="${cls.join(' ')}" ${a.disabled ? 'disabled' : ''} onclick="${a.onClick}">${a.label}</button>`;
    }).join('');

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'aw-sheet';
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title" ${titleColor ? `style="--title-color: ${titleColor}"` : ''}>${title}</div>
            ${subtitle ? `<div class="aw-sheet__subtitle">${subtitle}</div>` : ''}
        </div>
        <div class="aw-sheet__body">${body}</div>
        <div class="aw-sheet__actions">${actionsHtml}</div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    // Trigger animation
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
}

function closeSheetImmediate() {
    const backdrop = document.getElementById('aw-sheet-backdrop');
    const sheet = document.getElementById('aw-sheet');
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
}

export function awCloseSheet() {
    const backdrop = document.getElementById('aw-sheet-backdrop');
    const sheet = document.getElementById('aw-sheet');
    if (backdrop) {
        backdrop.classList.remove('visible');
    }
    if (sheet) {
        sheet.classList.remove('visible');
        setTimeout(() => {
            backdrop?.remove();
            sheet?.remove();
        }, 300);
    }
}

// ===================================================================
// AUTOFILL — load last session defaults for all exercises
// ===================================================================

export async function loadAutofillForAllExercises() {
    const exercises = AppState.currentWorkout.exercises;
    for (let i = 0; i < exercises.length; i++) {
        await loadAutofillForExercise(i);
    }
}

/**
 * Silent equipment-leak detector. Fires captureWarning when the last-session
 * autofill surfaces an equipment that shouldn't be linked to the exercise —
 * the class of bug the 6/9 "Shoulder Press paired with Standing Arm" report
 * caught. Cheap enough to run on every autofill: bails out early on the
 * happy path, only escalates to the async import + Firestore write when a
 * suspicious signal exists.
 *
 * Signal criteria (any one triggers a log):
 *   1) The surfaced equipment name doesn't exist in AppState._cachedEquipment
 *      at all (indicates history from a deleted/renamed record leaking in).
 *   2) The surfaced equipment doesn't include the current gym in its
 *      locations[] AND we're at a known gym (indicates the fallback tier
 *      pulled a session from a different gym after location-match failed).
 *   3) The surfaced equipment's exerciseTypes[] doesn't include the current
 *      exercise name (indicates the equipment was never actually linked to
 *      this exercise — the exact "leak" symptom).
 */
async function maybeLogEquipmentLeak({
    exerciseName,
    queryEquipment,
    queryLocation,
    lastSession,
    templateEquipment,
    userPickedEquipment,
}) {
    if (!lastSession || !lastSession.equipment) return;
    const surfaced = lastSession.equipment;

    // Skip the happy path: strict tier matched (query equipment === returned
    // equipment) means the resolution chain worked as intended, no leak.
    if (queryEquipment && surfaced === queryEquipment) return;

    const cachedEquipment = Array.isArray(AppState._cachedEquipment) ? AppState._cachedEquipment : [];
    const surfacedLC = surfaced.toLowerCase();
    const match = cachedEquipment.find(e => (e.name || '').toLowerCase() === surfacedLC);

    const missingFromLibrary = !match;
    const locationMismatch = !!queryLocation && !!match &&
        !(match.locations || []).some(l => l && l.toLowerCase() === queryLocation.toLowerCase());
    const notLinkedToExercise = !!match &&
        !(match.exerciseTypes || []).some(n => n && n.toLowerCase() === exerciseName.toLowerCase());

    if (!missingFromLibrary && !locationMismatch && !notLinkedToExercise) return;

    try {
        const { captureWarning } = await import('../utils/error-handler.js');
        captureWarning(
            `Autofill equipment leak: "${exerciseName}" surfaced "${surfaced}"`,
            'loadAutofillForExercise',
            {
                exerciseName,
                surfacedEquipment: surfaced,
                queryEquipment,
                queryLocation,
                templateEquipment,
                userPickedEquipment,
                lastSessionDate: lastSession.date || null,
                lastSessionLocation: lastSession.location || null,
                signals: {
                    missingFromLibrary,
                    locationMismatch,
                    notLinkedToExercise,
                },
                // Enough of the matched record (if any) to see what was picked.
                matchedEquipmentSummary: match ? {
                    id: match.id || null,
                    name: match.name || null,
                    locations: match.locations || [],
                    exerciseTypesCount: (match.exerciseTypes || []).length,
                    hasCatalogRef: !!match.catalogRef,
                } : null,
                cachedEquipmentCount: cachedEquipment.length,
            }
        );
    } catch (_) {
        // Diagnostic must never break autofill.
    }
}

export async function loadAutofillForExercise(idx) {
    const exercise = AppState.currentWorkout.exercises[idx];
    if (!exercise) return;
    const exName = getExerciseName(exercise);
    const key = `exercise_${idx}`;
    const savedEx = AppState.savedData?.exercises?.[key];
    // Prefer the equipment the USER actually picked for this exercise (which
    // lives on savedEx after awSelectEquipment) over the template's default.
    // Without this, autofill ran with the template's stale equipment and
    // overwrote whatever the user just chose — and on a reordered exercise it
    // could point to a machine that wasn't even at the current gym.
    const equipName = savedEx?.equipment || exercise.equipment || null;
    // Location-aware autofill: prefer last-session matches at the current gym
    // so users on multiple gyms get the right numbers for "this exercise here".
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    // Ensure the equipment cache is loaded so the hero can resolve base weight /
    // plate-loaded type on the very first render. Without this the plate button
    // (and base-weight label) were missing until the user opened the equipment
    // sheet — which is what populated the cache — so a machine already loaded on
    // the exercise showed no plate calculator until re-selected.
    if (!AppState._cachedEquipment || AppState._cachedEquipment.length === 0) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            AppState._cachedEquipment = await new FirebaseWorkoutManager(AppState).getUserEquipment();
        } catch (e) { debugLog('equipment cache load failed', e); }
    }

    // Equipment-change call sites pass a stale `_lastSessionSets` from the
    // previous equipment. Clear it so the card doesn't flash old data while
    // the new query is in flight, and so a null result on the new equipment
    // genuinely hides the card instead of leaving stale data on screen.
    delete exercise._lastSessionSets;
    delete exercise._lastSessionDaysAgo;
    delete exercise._lastSessionEquipment;
    delete exercise._overloadNudge;
    delete exercise._formVideoUrl;

    // Resolve the form video for this exercise+equipment combo so the hero
    // can show a one-tap play button without an async render. 3-tier
    // priority (equipment-specific → equipment default → exercise default)
    // lives in resolveFormVideo. Failures are non-fatal — the button just
    // doesn't show.
    try {
        const { resolveFormVideo } = await import('./exercise-ui.js');
        const formVideo = await resolveFormVideo(exName, equipName);
        exercise._formVideoUrl = formVideo?.url || null;
    } catch (_) {
        exercise._formVideoUrl = null;
    }

    try {
        const lastSession = await getLastSessionDefaults(exName, equipName, locName);
        // Silent health check: if the surfaced last-session equipment
        // doesn't exist in the user's library, or came from an exercise
        // history record that never actually linked this equipment, that's
        // an equipment-leak signal (the 6/9 report class). Auto-log with
        // the full resolution chain so I can see any remaining leak paths
        // my write-side fix didn't close. Non-blocking, best-effort.
        maybeLogEquipmentLeak({
            exerciseName: exName,
            queryEquipment: equipName,
            queryLocation: locName,
            lastSession,
            templateEquipment: exercise.equipment || null,
            userPickedEquipment: savedEx?.equipment || null,
        });
        if (lastSession && lastSession.sets) {
            exercise._lastSessionSets = lastSession.sets;
            // Capture the source equipment so the card can show "from <other
            // machine>" when the strict-match-failed fallback fired.
            exercise._lastSessionEquipment = lastSession.equipment || null;
            // Calculate days ago from the date string (YYYY-MM-DD)
            if (lastSession.date) {
                const sessionDate = new Date(lastSession.date + 'T12:00:00');
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                exercise._lastSessionDaysAgo = Math.round((today - sessionDate) / (1000 * 60 * 60 * 24));
            }

            // Smart overload nudge — multi-session progression coaching for the
            // last-session card. Reads the cached workout log (cheap); a failure
            // just leaves the simple last-session fallback in renderLastSessionCard.
            try {
                const allWorkouts = await loadAllWorkouts(AppState);
                const nudgeUnit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';
                const sessions = buildExerciseSessions(allWorkouts, exName, nudgeUnit);
                const repTarget = exercise.defaultReps || exercise.reps || null;
                exercise._overloadNudge = computeOverloadNudge(sessions, nudgeUnit, repTarget);
            } catch (e) {
                debugLog('overload nudge failed', e);
            }

            // Pre-fill saved data sets if not already filled
            if (!AppState.savedData.exercises[key]) {
                AppState.savedData.exercises[key] = { sets: [] };
            }
            const sx = AppState.savedData.exercises[key];

            // Copy equipment from template ONLY if the user hasn't already
            // chosen something. Overwriting sx.equipment unconditionally was
            // the source of the "machines linked to exercises that don't have
            // them" report after a reorder — autofill clobbered the user's
            // pick with the template's default.
            if (!sx.equipment && exercise.equipment) sx.equipment = exercise.equipment;
            // If the user hasn't picked equipment AND there's no template
            // default, but the last session at this gym used something, adopt
            // that. Makes "no equipment set" workflows pull through cleanly.
            if (!sx.equipment && lastSession.equipment && lastSession.location === locName) {
                sx.equipment = lastSession.equipment;
            }
            if (exercise.group) sx.group = exercise.group;

            if (!sx.sets || sx.sets.length === 0) {
                sx.sets = lastSession.sets.map(s => ({
                    weight: (s.weight && s.weight > 0) ? s.weight : null,
                    reps: (s.reps && s.reps > 0) ? s.reps : null,
                    completed: false,
                    originalUnit: s.originalUnit || AppState.globalUnit || 'lbs',
                }));
            }
        } else {
            // No last session — initialize empty sets from template defaults
            if (!AppState.savedData.exercises[key]) {
                AppState.savedData.exercises[key] = { sets: [] };
            }
            const sx = AppState.savedData.exercises[key];
            // Same as the lastSession branch: preserve user-picked equipment.
            if (!sx.equipment && exercise.equipment) sx.equipment = exercise.equipment;
            if (exercise.group) sx.group = exercise.group;

            if (!sx.sets || sx.sets.length === 0) {
                const targetSets = exercise.sets || 3;
                sx.sets = Array.from({ length: targetSets }, () => ({
                    weight: exercise.defaultWeight || null,
                    reps: exercise.defaultReps || null,
                    completed: false,
                }));
            }
        }
    } catch (err) {
        debugLog('Autofill failed for', exName, err);
    }

    // Re-render so the exercise that's currently in view picks up the freshly
    // loaded last-session card / placeholders. Fire-and-forget callers don't
    // have to remember to do this themselves — and the only cost on a no-op
    // path is one extra renderAll, which is cheap.
    if (idx === currentExerciseIdx) {
        renderAll();
    }
}

// ===================================================================
// UTILITIES
// ===================================================================

function formatElapsed(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimer(seconds) {
    if (seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getCategory(exercise) {
    const cat = (exercise.category || '').toLowerCase();
    if (cat.includes('push') || cat.includes('chest') || cat.includes('tricep')) return 'push';
    if (cat.includes('pull') || cat.includes('back') || cat.includes('bicep')) return 'pull';
    if (cat.includes('leg') || cat.includes('quad') || cat.includes('hamstring') || cat.includes('glute') || cat.includes('calf')) return 'legs';
    if (cat.includes('cardio')) return 'cardio';
    if (cat.includes('core') || cat.includes('ab')) return 'core';
    if (cat.includes('shoulder')) return 'push';
    if (cat.includes('arm')) return 'pull';
    return 'default';
}

/** Bodyweight detection — same as exercise-ui.js */
const BODYWEIGHT_PATTERNS = /pull.?up|chin.?up|dip(?!.*press)|push.?up|bodyweight|body weight|muscle.?up|inverted row|pistol squat|burpee|plank|l-sit|handstand|toes.?to.?bar|hanging/i;

function isBodyweightExercise(exercise) {
    if (exercise.equipment) {
        const list = AppState._cachedEquipment || [];
        const eq = list.find(e => e.name?.toLowerCase() === exercise.equipment.toLowerCase());
        if (eq?.equipmentType === 'Bodyweight') return true;
    }
    const name = exercise.machine || exercise.name || '';
    return BODYWEIGHT_PATTERNS.test(name);
}

function startDurationTimer() {
    clearDurationTimer();

    // Recompute elapsed from AppState.workoutStartTime on every tick instead
    // of incrementing a local counter. iOS pauses setInterval when backgrounded;
    // a counter-based approach loses those seconds forever, but timestamp-based
    // math catches up as soon as the interval resumes.
    const tick = () => {
        if (!AppState.workoutStartTime) return;
        const elapsed = Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 1000);
        const elapsedEl = document.querySelector('.aw-title__elapsed');
        if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsed);
    };

    tick();
    durationInterval = setInterval(tick, 1000);
}

function clearDurationTimer() {
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }
}

function cleanup() {
    clearDurationTimer();
    clearRestTimer();
    exerciseMenuOpen = false;
    workoutMenuOpen = false;
    closeSheetImmediate();
}

// Cleanup: getLocationImports was a stub helper that nothing called.
// Real location helpers are in features/location-service.js.

// Export current index for external use
export function getCurrentExerciseIdx() { return currentExerciseIdx; }
export function setCurrentExerciseIdx(idx) { currentExerciseIdx = idx; }
