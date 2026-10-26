// Active Workout V2 — Wizard-style one-exercise-at-a-time UI
// Main controller: header, pills, hero, equipment, last session, set rows, footer

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, convertWeight } from '../ui/ui-helpers.js';
import { getExerciseName, exerciseNameMatches } from '../utils/workout-helpers.js';
import { getCategoryIcon, Config, debugLog } from '../utils/config.js';
import { debouncedSaveWorkoutData, saveWorkoutData, getLastSessionDefaults, loadAllWorkouts } from '../data/data-manager.js';
import { buildExerciseSessions, computeOverloadNudge, progressionTarget, weightIncrement, deloadNudgeText } from '../features/progression.js';
import { selectRotation } from '../features/exercise-rotation.js';
import { getNextInGroup, isLastInGroupRound, groupExercises, ungroupExercise } from '../features/superset-manager.js';
import { haptic } from '../utils/haptics.js';
import { navigateTo } from '../ui/navigation.js';
import { ensureFreshBodyWeight } from '../features/bodyweight-prompt.js';
import { scheduleRestNotification, cancelRestNotification, isFCMAvailable } from '../utils/push-notification-manager.js';
import { convertYouTubeUrl } from './exercise-ui.js';
import { confirmSheet } from '../ui/confirm-sheet.js';
import { openSheet as openSheetPrimitive, closeSheet } from '../ui/sheet.js';
import { EQUIPMENT_CATALOG } from '../data/equipment-catalog.js';
import { augmentStaticCatalog } from '../data/equipment-catalog-helpers.js';
import { ownedEquipmentKeys, searchCatalogMachines, matchesAllTokens } from '../data/catalog-search.js';
import {
    mergeSeededSets, isBlankSet, isTouchedSet, historyFromSameMachine, seedSetsFromLastSession, seedSetsFromTemplate,
    plateRelativeDisplay, reindexAfterDelete, rpePromptSetIndex, plateRelativeNudge,
} from './set-seeding.js';
import { planInlineEquipment, knownBrands, suggestedBaseWeight } from '../data/equipment-create.js';
import { composeEquipmentName } from '../utils/equipment-name.js';
import { suggestMachinesForExercise } from '../features/exercise-machine-matcher.js';
import { getEquipmentAtLocation, getExercisesAtLocation } from '../features/equipment-planner.js';
import { programHeartbeat } from '../features/program-session.js';

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

    // 7/10 fix: if the user briefly went back to dashboard mid-rest, cleanup()
    // cleared the setInterval but left the timer STATE (restTimerActive +
    // restTimerEndsAt) intact — so on re-entry the banner rendered a stuck
    // stale value with nothing to tick it. restTimerEndsAt is the authoritative
    // timestamp; resume by recomputing from it, or trip the "done" state if
    // it already elapsed while we were away.
    resumeRestTimerIfActive();

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
    // Freestyle / just-emptied workout: show a first-exercise prompt instead of
    // a blank screen. The add-exercise sheet is usually already open on top.
    if (exerciseCount === 0) {
        container.innerHTML = `
            ${renderWorkoutHeader()}
            <div class="aw-empty">
                <div class="aw-empty__icon"><i class="fas fa-dumbbell"></i></div>
                <div class="aw-empty__title">No exercises yet</div>
                <div class="aw-empty__sub">Add your first exercise to start logging.</div>
                <button class="aw-empty__add" onclick="awAddExercise()"><i class="fas fa-plus"></i> Add exercise</button>
            </div>
        `;
        return;
    }

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

    // Program presence (5.7.2): the same quiet week-N-of-M signal the
    // dashboard heartbeat shows, folded into the existing meta line. Renders
    // nothing without an active program.
    let programMeta = '';
    try {
        const hb = programHeartbeat(AppState._activeProgram, AppState.getTodayDateString());
        if (hb) programMeta = ` · week ${hb.week} of ${hb.weeks}`;
    } catch { /* no program, no line */ }
    // AP-6: say what kind of session this is, so "week 6 of 6" never sits
    // above a card that disagrees with it.
    const intentMeta = AppState.savedData?.sessionIntent?.mode === 'deload' ? ' · deload' : '';

    return `
        <div class="page-header page-header--workout">
            <button class="aw-back" onclick="awConfirmExit()" aria-label="Back to dashboard" title="Back to dashboard">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="aw-title">
                <div class="aw-title__name">${escapeHtml(workoutName)}${locName ? ` <span class="aw-title__loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(locName)}</span>` : ''}</div>
                <div class="aw-title__elapsed">${elapsed}</div>
                ${exerciseCount > 0 ? `<div class="aw-title__meta">Exercise ${currentExerciseIdx + 1}/${exerciseCount}${programMeta}${intentMeta}</div>` : ''}
            </div>
            ${Config.LIVE_COACH_ENABLED ? `
            <button class="aw-coach" onclick="openLiveCoach()" aria-label="Ask your coach" title="Ask your coach">
                <i class="fas fa-robot"></i>
            </button>` : ''}
            <button class="aw-menu" onclick="awToggleWorkoutMenu()" aria-label="Workout options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        ${workoutMenuOpen ? renderWorkoutMenu() : ''}
    `;
}

function renderWorkoutMenu() {
    const isDeload = AppState.savedData?.sessionIntent?.mode === 'deload';
    return `
        <div class="aw-workout-menu">
            <button class="aw-ex-menu__item" onclick="awAddExercise()">
                <i class="fas fa-plus"></i> Add exercise
            </button>
            <button class="aw-ex-menu__item" onclick="awCloseMenus(); awToggleSessionDeload();">
                <i class="fas fa-feather"></i> ${isDeload ? 'Back to a normal session' : 'Make this a lighter session'}
            </button>
            <button class="aw-ex-menu__item" onclick="saveActiveWorkoutAsTemplate(); awCloseMenus();">
                <i class="fas fa-bookmark"></i> Save as template
            </button>
            <button class="aw-ex-menu__item" onclick="changeWorkoutLocation(); awCloseMenus();">
                <i class="fas fa-map-marker-alt"></i> Change location
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item" onclick="showMidWorkoutSummary(); awCloseMenus();">
                <i class="fas fa-chart-bar"></i> Session summary
            </button>
            <button class="aw-ex-menu__item" onclick="exportWorkoutDataAsCSV(); awCloseMenus();">
                <i class="fas fa-file-export"></i> Export session
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item" onclick="awCloseMenus(); awFinishWorkout();">
                <i class="fas fa-flag-checkered"></i> Finish workout
            </button>
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

    // Phase 7 — always-present "+" so mid-workout add-exercise isn't buried in
    // the kebab menu. Additive; the menu item stays.
    const addPill = `<button class="aw-pill aw-pill--add" onclick="awAddExercise()" aria-label="Add exercise" title="Add exercise"><i class="fas fa-plus"></i></button>`;

    return `<div class="aw-pills">${pills}${addPill}</div>`;
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
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestAdd30()" aria-label="Add 30 seconds" title="Add 30 seconds">+30s</button>
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestSkip()" aria-label="Skip rest" title="Skip rest">Skip</button>
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
                <span class="aw-rest-timer__label">Ready for your next set</span>
            </div>
            <div class="aw-rest-timer__controls">
                <button class="aw-rest-timer__btn" onclick="awRestDismiss()" aria-label="Dismiss" title="Dismiss">Dismiss</button>
            </div>`;
}

function startRestTimer(duration) {
    clearRestTimer();
    // One-shot override from an applied live-coach rest proposal (Phase 6).
    if (AppState._nextRestOverride) {
        duration = AppState._nextRestOverride;
        AppState._nextRestOverride = null;
    }
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

// Restart the tick interval from the persisted endsAt when we re-enter the
// page after a dashboard side-trip. Elapsed-during-away → immediately shows
// the "Ready" state. No-op unless a rest is actually still armed.
export function resumeRestTimerIfActive() {
    if (!restTimerActive || restTimerEndsAt <= 0) return;
    if (restTimerInterval) return; // already ticking (defensive)

    restTimerRemaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
    if (restTimerRemaining <= 0) {
        // Rest ended while we were away — swap into the persistent "Ready"
        // state instead of stranding the countdown at 0.
        onRestTimerComplete();
        return;
    }
    restTimerInterval = setInterval(() => {
        restTimerRemaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
        updateRestTimerDisplay();
        if (restTimerRemaining <= 0) onRestTimerComplete();
    }, 1000);
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

/**
 * ?debug only (AP-2): untouched rows should be exactly what the seeder makes
 * of the card's history. When they aren't, log autofill_mismatch (persisted
 * warning, deduped per session) with both arrays so the report carries data.
 * Skipped for sessions whose rows are deliberately reshaped after autofill
 * (a program heavy week / coach-applied adjustment).
 */
const _mismatchLogged = new Set();
function checkAutofillMismatch(exercise, idx, savedEx) {
    try {
        const dbg = exercise._autofillDebug;
        if (!dbg || dbg.source !== 'history' || !Array.isArray(exercise._lastSessionSets)) return;
        const intent = AppState.savedData?.sessionIntent || null;
        if (AppState.savedData?.sessionLabel && intent?.mode !== 'deload') return;
        const expected = seedSetsFromLastSession(
            exercise._lastSessionSets, exercise._progression, intent, dbg.seedUnit,
            exercise._progressionInc || (dbg.seedUnit === 'kg' ? 2.5 : 5),
            { alreadyLight: dbg.recovery, fallbackUnit: AppState.globalUnit || 'lbs', fromTarget: seedFromTarget(exercise, { date: exercise._lastSessionDate }) });
        const diffs = [];
        (savedEx.sets || []).forEach((row, i) => {
            const want = expected[i];
            if (!want || isTouchedSet(row)) return;
            if ((row.weight ?? null) !== (want.weight ?? null) || (row.reps ?? null) !== (want.reps ?? null)) {
                diffs.push({ i, row: { weight: row.weight ?? null, reps: row.reps ?? null }, expected: { weight: want.weight ?? null, reps: want.reps ?? null } });
            }
        });
        if (diffs.length === 0) return;
        const exName = getExerciseName(exercise);
        const sig = `${idx}|${exName}|${JSON.stringify(diffs)}`;
        if (_mismatchLogged.has(sig)) return;
        _mismatchLogged.add(sig);
        import('../utils/error-handler.js').then(({ captureWarning }) => captureWarning(
            `autofill_mismatch: ${exName}`, 'renderExerciseView', {
                exerciseIdx: idx, exerciseName: exName, diffs,
                card: exercise._lastSessionSets.map(s => ({ weight: s.weight ?? null, reps: s.reps ?? null, originalUnit: s.originalUnit || null })),
                autofill: dbg,
            })).catch(() => { /* diagnostic only */ });
    } catch {
        // diagnostic must never break render
    }
}

function renderExerciseView(exercise, idx, savedEx) {
    const category = getCategory(exercise);
    const iconClass = getCategoryIcon(exercise.category || category) || 'fas fa-dumbbell';
    const exName = getExerciseName(exercise);
    const targetSets = exercise.sets || 3;
    const targetReps = exercise.defaultReps || exercise.reps || '?';
    const completedSets = (savedEx.sets || []).filter(s => s.completed).length;
    const remaining = Math.max(0, targetSets - completedSets);

    const equipmentName = savedEx.equipment || exercise.equipment || exercise.machine || null;
    const equipmentId = savedEx.equipmentId || exercise.equipmentId || null;
    const isBW = isBodyweightExercise(exercise);
    const equipDoc = getEquipmentDoc(equipmentName, equipmentId);
    const hasBaseWeight = !isBW && equipDoc && equipDoc.baseWeight > 0;

    // Equipment unit memory: a machine the user has flipped to kg opens in kg
    // (preferredUnit persisted on the equipment doc by awToggleUnit). Only
    // fills the gap — an explicit toggle this session always wins.
    if (equipDoc?.preferredUnit && AppState.exerciseUnits?.[idx] === undefined) {
        if (!AppState.exerciseUnits) AppState.exerciseUnits = {};
        AppState.exerciseUnits[idx] = equipDoc.preferredUnit;
    }
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
        if (equipmentName) contextBanner += renderEquipLine(equipmentName, idx, equipmentId);
    } else {
        contextBanner = renderEquipLine(equipmentName, idx, equipmentId);
    }

    // Same set table for ALL exercise types — always Reps | Weight | ✓
    const sets = buildSetRows(exercise, idx, savedEx, unit, hasBaseWeight ? equipDoc.baseWeight : 0);
    if (Config.DEBUG_MODE) checkAutofillMismatch(exercise, idx, savedEx);

    // Autofill hint: shown once per USER (persisted in settings), not once per
    // exercise name — after you've learned what the dashed numbers mean, the
    // styling alone is enough on every future lift.
    const showAutofillHint = sets.hasAutofill && !AppState.settings?.autofillHintSeen;
    if (showAutofillHint) {
        if (!AppState.settings) AppState.settings = {};
        AppState.settings.autofillHintSeen = true; // sync, so re-renders don't re-show
        import('../ui/settings-ui.js')
            .then((m) => m.updateSetting('autofillHintSeen', true))
            .catch(() => { /* hint persistence is a bonus, never a blocker */ });
    }

    // Weight column label
    let weightLabel = unit;
    if (isBW) weightLabel = `Added ${unit}`;
    else if (hasBaseWeight) weightLabel = `Plates ${unit}`;

    // Form video lives in the exercise cog menu (renderExerciseMenu) — an
    // occasional-use action doesn't earn a standing hero icon.

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

function renderEquipLine(equipmentName, idx, equipmentId = null) {
    const eq = getEquipmentDoc(equipmentName, equipmentId);
    let baseWeightStr = '';
    if (eq?.baseWeight) {
        const bwUnit = eq.baseWeightUnit || 'lb';
        baseWeightStr = ` · ${eq.baseWeight} ${bwUnit} ${eq.type === 'barbell' ? 'bar' : 'base'}`;
    }
    // Machine settings ("Seat 4 · Pin 13") fold into the same line — one row,
    // one tap target (opens the equipment picker). Editing settings and
    // equipment details lives in the exercise cog menu.
    let settingsStr = '';
    const exercise = AppState.currentWorkout?.exercises?.[idx];
    if (eq && exercise) {
        const pairs = eq.exerciseSettings?.[getExerciseName(exercise)] || [];
        if (pairs.length) settingsStr = ' · ' + pairs.map(p => `${p.label} ${p.value}`.trim()).join(' · ');
    }
    const label = equipmentName
        ? escapeHtml(equipmentName + baseWeightStr + settingsStr)
        : 'Choose equipment';
    return `
        <button type="button" class="aw-equip-line" onclick="awOpenEquipmentSheet(${idx})"
                aria-label="${equipmentName ? `Change equipment — ${escapeAttr(equipmentName)}` : 'Choose equipment'}">
            <i class="fas fa-cog" aria-hidden="true"></i>
            <span class="aw-equip-line__name">${label}</span>
            <i class="fas fa-chevron-right aw-equip-line__chev" aria-hidden="true"></i>
        </button>
    `;
}

/**
 * Open the equipment quick-edit sheet (Tier 3 Phase 7 / F5) with the current
 * exercise offered as a suggested link. Dynamic import — the module is new,
 * so it can never be version-skewed against a stale cached copy.
 */
export async function awQuickEditEquipment(exerciseIdx, equipName) {
    const exercise = AppState.currentWorkout?.exercises?.[exerciseIdx];
    const exName = exercise ? getExerciseName(exercise) : null;
    try {
        const { openEquipmentQuickEdit } = await import('../ui/equipment-quick-edit.js');
        openEquipmentQuickEdit(equipName, { contextExercise: exName });
    } catch (e) {
        console.error('Quick edit failed to open:', e);
    }
}

// Machine settings render inline on the equipment line (renderEquipLine);
// editing them lives in the exercise cog menu → awOpenSettingsSheet.

// ── Machine settings edit sheet (Tier 3 3.2) ──
let _settingsSheetState = null; // { idx, exName, equipmentId, equipmentName, pairs }

export function awOpenSettingsSheet(idx) {
    const exercise = AppState.currentWorkout?.exercises?.[idx];
    if (!exercise) return;
    const exName = getExerciseName(exercise);
    const savedExForSheet = AppState.savedData?.exercises?.[`exercise_${idx}`];
    const equipName = savedExForSheet?.equipment || exercise.equipment;
    const equipId = savedExForSheet?.equipmentId || exercise.equipmentId || null;
    const eq = getEquipmentDoc(equipName, equipId);
    if (!eq?.id) return;
    _settingsSheetState = {
        idx,
        exName,
        equipmentId: eq.id,
        equipmentName: eq.name,
        pairs: (eq.exerciseSettings?.[exName] || []).map(p => ({ ...p })),
    };
    renderSettingsSheet();
}

function renderSettingsSheet() {
    const st = _settingsSheetState;
    if (!st) return;

    const rows = st.pairs.map((p, i) => `
        <div class="settings-edit-row">
            <input class="settings-edit-row__label" value="${escapeAttr(p.label)}" placeholder="Label"
                   oninput="awSettingsField(${i}, 'label', this.value)">
            <input class="settings-edit-row__value" value="${escapeAttr(p.value)}" placeholder="Value"
                   oninput="awSettingsField(${i}, 'value', this.value)">
            <button type="button" class="settings-edit-row__remove" onclick="awSettingsRemove(${i})" aria-label="Remove">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    const suggested = ['Seat', 'Pad', 'Pin', 'Grip', 'Handles'];
    const body = `
        <div id="settings-sheet-rows">
            ${rows || '<div class="settings-edit-empty">How is this machine set up for you? Add a setting below.</div>'}
        </div>
        <div class="settings-suggest-chips">
            ${suggested.map(s => `<button type="button" class="aw-fastpath-chip" onclick="awSettingsAdd('${s}')">${s}</button>`).join('')}
            <button type="button" class="aw-fastpath-chip" onclick="awSettingsAdd('')">Custom…</button>
        </div>
    `;

    openSheet({
        title: 'Machine settings',
        subtitle: `${st.equipmentName} · ${st.exName}`,
        body,
        actions: [
            { label: 'Close', onClick: 'awCloseSheet()' },
            { label: 'Save settings', onClick: 'awSaveSettingsSheet()', primary: true },
        ],
    });
}

export function awSettingsField(i, key, value) {
    const p = _settingsSheetState?.pairs?.[i];
    if (p) p[key] = value;
}

export function awSettingsAdd(label) {
    const st = _settingsSheetState;
    if (!st) return;
    st.pairs.push({ label: label || '', value: '' });
    renderSettingsSheet();
    // Focus the fresh row's first empty field.
    setTimeout(() => {
        const rows = document.querySelectorAll('#settings-sheet-rows .settings-edit-row');
        const last = rows[rows.length - 1];
        (label ? last?.querySelector('.settings-edit-row__value')
               : last?.querySelector('.settings-edit-row__label'))?.focus();
    }, 100);
}

export function awSettingsRemove(i) {
    const st = _settingsSheetState;
    if (!st) return;
    st.pairs.splice(i, 1);
    renderSettingsSheet();
}

export async function awSaveSettingsSheet() {
    const st = _settingsSheetState;
    if (!st) { awCloseSheet(); return; }
    _settingsSheetState = null;
    awCloseSheet();
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        const ok = await mgr.saveEquipmentExerciseSettings(st.equipmentId, st.exName, st.pairs);
        if (ok) {
            AppState._cachedEquipment = await mgr.getUserEquipment();
            renderAll();
            showNotification('Settings saved', 'success');
        } else {
            showNotification("Couldn't save — try again", 'error');
        }
    } catch (e) {
        console.error('Settings save failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
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

// Resolve an equipment doc id-first (survives equipment renames), then fall back
// to name match. equipmentId comes from the backfilled `equipmentId` field on the
// exercise/savedEx; when absent or unmatched we resolve by name exactly as before.
function getEquipmentDoc(equipmentName, equipmentId = null) {
    const list = AppState._cachedEquipment;
    if (!list) return null;
    if (equipmentId) {
        const byId = list.find(e => e.id === equipmentId);
        if (byId) return byId;
    }
    if (!equipmentName) return null;
    return list.find(e => e.name?.toLowerCase() === equipmentName.toLowerCase()) || null;
}

/**
 * Progressive-overload nudge for the last-session card: takes last session's
 * heaviest working set and suggests the next step up (smallest standard plate
 * jump for the display unit). Returns a short label or null (no usable weight).
 * Grounded only in last session — not the multi-session plateau engine — so it
 * stays synchronous and self-contained. Pure; mirrored in
 * tests/unit/beat-last-session.test.js.
 */
/** Deload line off last session's top working set (fallback when the multi-session nudge is missing). */
function deloadLineFor(lastSets, displayUnit, exercise, intent) {
    let top = null, topLbs = 0;
    for (const s of lastSets || []) {
        if (!s || !s.weight || (s.type || 'working') === 'warmup') continue;
        const lbs = convertWeight(s.weight, s.originalUnit || 'lbs', 'lbs');
        if (lbs > topLbs) { topLbs = lbs; top = s; }
    }
    if (!top) return null;
    const W = Math.round(convertWeight(top.weight, top.originalUnit || 'lbs', displayUnit) * 10) / 10;
    const inc = exercise._progressionInc || weightIncrement(displayUnit,
        displayUnit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs);
    const rt = exercise.defaultReps || exercise.reps || null;
    return deloadNudgeText(W, top.reps || 0, rt, intent, displayUnit, inc);
}

/**
 * Build this exercise's per-session progression history from the full workout
 * log — one entry per completed session, most-recent-first, each with the
 * heaviest working set's weight (in display unit) and the max reps achieved at
 * that weight. Grouped by exercise NAME (matching the training-insights
 * plateau engine), so it reads the same progression the dashboard insights do.
 */
// buildExerciseSessions + computeOverloadNudge moved to the pure, tested
// js/core/features/progression.js (Phase 5.7.3). Imported at the top of this
// file; call sites unchanged.

/**
 * AU-10(a) / AU-11 — seed rows from the target instead of copying the last
 * session when that session was skipped as light, or the target came from an
 * earlier session. Keeps rows, card and coach on one number.
 */
function seedFromTarget(exercise, lastSession) {
    const p = exercise?._progression;
    if (!p) return false;
    if (p.warning === 'light-session' && p.fromSession) return true;
    const skipped = exercise._progressionSessions?.lightSkipped || [];
    return !!lastSession?.date && skipped.some(x => x.date === lastSession.date);
}

function renderLastSessionCard(exerciseName, idx) {
    // Check if we have cached last session data on the exercise
    const exercise = AppState.currentWorkout.exercises[idx];
    const lastDefaults = exercise._lastSessionSets;
    if (!lastDefaults || lastDefaults.length === 0) return '';

    const daysAgo = exercise._lastSessionDaysAgo || '?';
    const daysLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;

    // Convert each set's weight to the user's display unit so a kg-logged
    // session shows correctly when the user is now in lb mode (and vice versa).
    const displayUnit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';

    // Plate-relative on base-weight gear: history stores totals, but the
    // number the user needs at the rack is what to load (8/12 report). The
    // nudge uses the same plate-relative sets so "+10" lands on 280, not 390.
    const savedExForCard = AppState.savedData?.exercises?.[`exercise_${idx}`];
    const cardEquip = getEquipmentDoc(
        savedExForCard?.equipment || exercise.equipment || null,
        savedExForCard?.equipmentId || exercise.equipmentId || null
    );
    const base = (!isBodyweightExercise(exercise) && cardEquip?.baseWeight > 0) ? cardEquip.baseWeight : 0;
    const plateSets = base > 0
        ? lastDefaults.map(s => {
            // getLastSessionDefaults already returns the typed plate load for
            // sets that recorded one; only legacy totals need the base removed.
            const alreadyPlates = typeof s._plateWeight === 'number' && s._equipBaseWeight > 0;
            return alreadyPlates ? s : { ...s, weight: Math.max(0, (s.weight || 0) - base) };
        })
        : lastDefaults;

    const summary = plateSets.map(s => {
        const w = s.weight || 0;
        const r = s.reps || 0;
        const from = s.originalUnit || 'lbs';
        const dw = w > 0 ? convertWeight(w, from, displayUnit) : 0;
        return `${r}×${dw}`;
    }).join(' · ');
    const unitTag = base > 0 ? `${displayUnit} plates` : displayUnit;

    // Overload nudge — only for weighted lifts (a bodyweight "try +5" is noise),
    // and never off a different machine's numbers.
    //   · Deload session (AP-7): the deload line, from every entry path — the
    //     smart nudge carries it; the fallback is computed here, never "Beat it".
    //   · Other adjusted session (heavy week): no generic bump advice — the
    //     adjustment set today's targets and the two would conflict.
    //   · Base-weight gear: the multi-session nudge is plate-relative when the
    //     last session recorded its plate load; with legacy totals the same
    //     stall ladder runs on plate-relative weights (AU-3 — the single-
    //     session "Beat it — try N" fallback is gone).
    //   · No nudge yet (autofill hasn't landed, or history couldn't load):
    //     show nothing rather than a guess outside the ladder.
    const intent = AppState.savedData?.sessionIntent || null;
    const lastPlatesKnown = plateSets.length > 0
        && plateSets.every(s => typeof s._plateWeight === 'number' && s._equipBaseWeight > 0);
    let nudge;
    if (isBodyweightExercise(exercise) || exercise._lastSessionOtherMachine) {
        nudge = null;
    } else if (intent?.mode === 'deload') {
        nudge = (base > 0 && !lastPlatesKnown ? null : exercise._overloadNudge)
            || deloadLineFor(plateSets, displayUnit, exercise, intent);
    } else if (AppState.savedData?.sessionLabel) {
        nudge = null;
    } else if (base > 0) {
        nudge = (lastPlatesKnown && exercise._overloadNudge) || plateRelativeNudge(exercise._progressionSessions, {
            base, baseUnit: cardEquip?.baseWeightUnit || 'lbs', unit: displayUnit,
            repTarget: exercise.defaultReps || exercise.reps || null,
            inc: exercise._progressionInc || weightIncrement(displayUnit, displayUnit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs),
            intent,
        });
    } else {
        nudge = exercise._overloadNudge || null;
    }
    const nudgeHtml = nudge
        ? `<div class="aw-last__nudge"><i class="fas fa-bolt" aria-hidden="true"></i> ${nudge}</div>`
        : '';

    // History that came from a DIFFERENT machine (the strict match fell back
    // to name-only) says so. Unlabeled, a freshly created machine showed its
    // predecessor's numbers as its own — "it loaded my old equipment with it"
    // (9/29).
    // Same-machine is the matcher's call (id first, then name) — a machine
    // renamed in quick-edit matches by id and must not read "from Old Name"
    // (AP-3).
    const fromEquip = exercise._lastSessionEquipment || '';
    const fromTag = fromEquip && exercise._lastSessionOtherMachine
        ? ` · from ${escapeHtml(fromEquip)}`
        : '';

    // One read-only fact, one tap target: the whole row opens the exercise's
    // progress detail. The unit pill (duplicate of the sets-header toggle) and
    // the cross-equipment info glyph earned their keep less than the calm.
    // ?debug overlay (AP-2): screenshot this line when card and rows disagree.
    const dbg = Config.DEBUG_MODE ? exercise._autofillDebug : null;
    const debugHtml = dbg
        ? `<div class="aw-last__debug">${escapeHtml([
            dbg.tier || 'no history',
            dbg.sameMachine ? 'same machine' : 'other machine',
            `query=${dbg.query || '—'}`,
            `from=${dbg.from || '—'}`,
            `seeded=${dbg.seeded}/${dbg.total} (${dbg.source})`,
            `intent=${dbg.intent}${dbg.recovery ? ' · src deload' : ''}`,
            `gen=${dbg.gen}`,
            dbg.trigger,
        ].join(' · '))}</div>`
        : '';

    return `
        <button type="button" class="aw-last" onclick="showExerciseDetail('${escapeAttr(exerciseName)}')"
                aria-label="View ${escapeAttr(exerciseName)} progress">
            <i class="fas fa-history" aria-hidden="true"></i>
            <div class="aw-last__info">
                <div class="aw-last__val">Last: ${summary} ${unitTag} · ${daysLabel}${fromTag}</div>
                ${nudgeHtml}
                ${debugHtml}
            </div>
            <i class="fas fa-chevron-right aw-last__chev" aria-hidden="true"></i>
        </button>
    `;
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

// `baseWeight` (> 0 only for plate-loaded gear with a recorded bar/base) makes
// the weight column show what's ON the machine, not the stored total. Storage
// stays total (PRs/volume/history compare like-for-like); only display and the
// entered→stored conversion in awToggleSet are plate-relative. 8/12 report:
// "machine base is 90, I did 270 — show me 270 next week, not 380".
function buildSetRows(exercise, idx, savedEx, unit, baseWeight = 0) {
    const targetSets = exercise.sets || 3;
    const persistent = ensurePersistentSets(idx, targetSets);
    const sets = persistent.sets;

    let hasAutofill = false;
    let currentSetIdx = sets.findIndex(s => !s.completed);
    if (currentSetIdx < 0) currentSetIdx = sets.length;

    const unitLabel = unit || 'lbs';
    const rpeSetIdx = AppState.settings?.trackRpe ? rpePromptSetIndex(sets) : -1;

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

        // RPE row (opt-in via settings.trackRpe) — effort chips under the
        // heaviest completed working set only (AP-22: the fatigue rule reads
        // the top set; one tap per exercise), plus any set already rated.
        // Rendered as a sibling of the set row so the set grid and
        // awToggleSet's row indexing are untouched.
        const showRpe = !!AppState.settings?.trackRpe && set.completed && (si === rpeSetIdx || set.rpe != null);
        const rpeRow = showRpe
            ? `<div class="aw-rpe-row">
                <span class="aw-rpe-row__label">Effort${exercise._rpeTarget ? ` · aim ${exercise._rpeTarget}` : ''}</span>
                ${[6, 7, 8, 9, 10].map(v => `<button class="aw-rpe-chip${set.rpe === v ? ' active' : ''}" onclick="awSetRpe(${idx}, ${si}, ${v})" aria-label="Effort ${v} of 10">${v}</button>`).join('')}
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
        // Plate-relative view (AP-4 / D6): see set-seeding#plateRelativeDisplay.
        const weightShown = displayWeight(plateRelativeDisplay(set, baseWeight));
        const weightVal = set._userEdited || set.completed ? (weightShown ?? '') : '';
        const repsVal = set._userEdited || set.completed ? (set.reps ?? '') : '';
        const weightPlaceholder = !set._userEdited && !set.completed && weightShown != null ? weightShown : unitLabel;
        const repsPlaceholder = !set._userEdited && !set.completed && set.reps != null ? set.reps : 'reps';

        // 5.7.3 — ↑ marker on an earned-bump suggestion (until the user edits it).
        const suggestBump = set._suggested && !set._userEdited && !set.completed;
        const lighter = !!set._adjusted && !set._userEdited && !set.completed;
        const suggestMarker = suggestBump
            ? '<span class="aw-set-row__suggest" aria-label="Suggested progression — heavier than last time" title="Suggested — you hit your reps last time">↑</span>'
            : lighter
                ? `<span class="aw-set-row__suggest aw-set-row__suggest--lighter" aria-label="${set._adjusted === 'deload' ? 'Lighter week — lighter than last time' : 'Back-off — lighter than last time'}" title="${set._adjusted === 'deload' ? 'Lighter week — lighter than last time' : 'Back-off — drop and rebuild'}">↓</span>`
                : '';

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
                ${beatBadge}${suggestMarker}
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

    // Occasional-use actions demoted here from standing buttons: form video
    // (was a hero icon), machine settings + equipment quick-edit (were extra
    // tap targets on the equipment line).
    const exName = getExerciseName(exercise);
    const equipName = savedEx.equipment || exercise.equipment || null;
    const equipId = savedEx.equipmentId || exercise.equipmentId || null;
    const eq = getEquipmentDoc(equipName, equipId);
    const videoUrl = exercise._formVideoUrl || null;

    return `
        <div class="aw-ex-menu">
            ${videoUrl ? `
            <button class="aw-ex-menu__item" onclick="awShowFormVideo('${escapeAttr(videoUrl)}', '${escapeAttr(exName)}'); awCloseMenus();">
                <i class="fas fa-play-circle"></i> Form video
            </button>` : ''}
            ${eq?.id ? `
            <button class="aw-ex-menu__item" onclick="awCloseMenus(); awOpenSettingsSheet(${idx});">
                <i class="fas fa-sliders-h"></i> Machine settings
            </button>` : ''}
            ${equipName ? `
            <button class="aw-ex-menu__item" onclick="awCloseMenus(); awQuickEditEquipment(${idx}, '${escapeAttr(equipName)}');">
                <i class="fas fa-ellipsis-h"></i> Edit equipment
            </button>` : ''}
            ${videoUrl || equipName || eq?.id ? '<div class="aw-ex-menu__divider"></div>' : ''}
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

    // Early finish (leaving before every set is done) lives in the kebab menu
    // and the "All" sheet — no standing shortcut button. The primary button
    // still flips to "Finish workout" the moment everything is complete.
    return `
        <div class="aw-footer">
            <button class="aw-footer__list-btn" onclick="awOpenJumpSheet()">
                <i class="fas fa-list"></i> All
            </button>
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
async function maybeCelebratePR(exercise, set, equipName, equipId = null) {
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
        // Pass the stable id — the PR store is id-keyed, so a name-only lookup
        // reads null for id-keyed machines and the celebration silently dies.
        const pr = PRTracker.checkForNewPR(exName, set.reps, total, equipName, equipId);
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
        const equipDoc = getEquipmentDoc(equipName, savedEx.equipmentId || exercise.equipmentId || null);

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

        // Equipment with base weight: total = base + entered (plate) weight.
        // `enteredWeight` is plate weight when the user typed it (or when the
        // row was un-completed, which restores _plateWeight). An untouched
        // autofill value is a stored TOTAL from history — subtract the base
        // first, or confirming "380" re-adds 90 and logs 470 (the 8/12 confusion).
        if (!isBW && equipDoc?.baseWeight > 0) {
            const baseWeight = equipDoc.baseWeight || 0;
            const plateWeight = (userTypedWeight || set._plateWeight != null)
                ? enteredWeight
                : Math.max(0, enteredWeight - baseWeight);
            set._plateWeight = plateWeight; // remember what user typed
            set._equipBaseWeight = baseWeight;
            set.weight = plateWeight + baseWeight; // store the TOTAL
        }

        haptic('tap');

        // B3 — live PR moment (fire-and-forget; never blocks logging).
        maybeCelebratePR(exercise, set, equipName,
            savedEx.equipmentId || exercise.equipmentId || equipDoc?.id || null);

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

export async function awDeleteExercise(idx) {
    const exercises = AppState.currentWorkout.exercises;
    const name = getExerciseName(exercises[idx]);
    const ok = await confirmSheet({
        title: `Remove ${name} from workout?`,
        confirmLabel: 'Remove exercise',
        cancelLabel: 'Keep exercise',
        destructive: true,
    });
    if (!ok) return;
    removeExerciseAt(idx);
    renderAll();
}

/**
 * Drop one exercise from the live session — no confirm (callers that need
 * one ask first; the live coach's skip card IS the confirmation). Every
 * index-keyed map shifts with the exercises (D10: exerciseUnits didn't, so
 * the deleted slot's kg flag landed on whatever slid in).
 */
export function removeExerciseAt(idx) {
    const exercises = AppState.currentWorkout?.exercises;
    if (!exercises || idx < 0 || idx >= exercises.length) return false;
    exercises.splice(idx, 1);
    AppState.savedData.exercises = reindexAfterDelete(AppState.savedData.exercises, idx);
    if (AppState.exerciseUnits) AppState.exerciseUnits = reindexAfterDelete(AppState.exerciseUnits, idx);
    // An autofill still in flight for a shifted slot must not land on the
    // exercise that slid into it.
    for (let i = idx; i <= exercises.length; i++) _autofillGen.set(i, (_autofillGen.get(i) || 0) + 1);

    if (currentExerciseIdx >= exercises.length) {
        currentExerciseIdx = Math.max(0, exercises.length - 1);
    }
    exerciseMenuOpen = false;
    debouncedSaveWorkoutData(AppState);
    return true;
}

/**
 * Replace an exercise mid-workout (Tier 3 Phase 3 / F3). Gym-aware: when a
 * session gym is set, the shared add-exercise sheet leads with a "Possible at
 * [gym]" section (same body part first) fed by the planner's mapped-exercise
 * data — the most useful moment for that data. D8: same sheet, one extra
 * section, not a new picker. Falls back to the plain sheet with no gym.
 * (The legacy exercise-ui replaceExercise flow is untouched.)
 */
export async function awReplaceExercise(idx) {
    exerciseMenuOpen = false;
    awCloseMenus();

    const current = AppState.currentWorkout?.exercises?.[idx];
    if (!current) return;
    const currentName = getExerciseName(current);
    const currentCategory = (current.category || '').toLowerCase();

    let gymSection = null;
    try {
        const sessionLoc = AppState.savedData?.location;
        const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;
        if (locName) {
            if (!AppState._cachedEquipment) {
                const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
                AppState._cachedEquipment = await new FirebaseWorkoutManager(AppState).getUserEquipment();
            }
            const atGym = getEquipmentAtLocation(AppState._cachedEquipment || [], locName);
            const available = getExercisesAtLocation(atGym);
            available.delete(currentName);
            if (available.size > 0) {
                const library = AppState.exerciseDatabase || [];
                const entries = [...available].map(n =>
                    library.find(ex => (ex.name || ex.machine) === n) || { name: n }
                );
                entries.sort((a, b) => {
                    const aCat = (a.category || '').toLowerCase() === currentCategory ? 0 : 1;
                    const bCat = (b.category || '').toLowerCase() === currentCategory ? 0 : 1;
                    return aCat - bCat
                        || (a.name || a.machine || '').localeCompare(b.name || b.machine || '');
                });
                gymSection = { gym: locName, exercises: entries.slice(0, 8) };
            }
        }
    } catch (e) {
        debugLog('Gym-aware replace section failed:', e);
    }

    openSharedAddExerciseSheet({
        title: 'Replace exercise',
        targetWorkoutLabel: `Replacing ${currentName}`,
        alreadyAdded: (AppState.currentWorkout.exercises || []).map(getExerciseName),
        gymSection,
        onSelect: (exerciseRecord) => commitReplaceExercise(idx, exerciseRecord),
        onCreateRequested: (query) => awCreateAndReplaceExercise(idx, query),
    });
}

/**
 * Create a brand-new library exercise from the Replace sheet and swap it
 * straight into the slot. The Add sheet has had this since Phase 4; Replace
 * did not, so a machine the user had never logged before dead-ended the swap
 * ("need to add new exercises easily from swap / active exercise menu",
 * 8/20). Mirrors awCreateAndInsertExercise, then reuses commitReplaceExercise
 * so the swap semantics stay in exactly one place.
 */
export async function awCreateAndReplaceExercise(idx, rawName) {
    const name = (rawName || '').trim();
    if (!name) return;
    if (!AppState.currentUser) {
        showNotification('Sign in to add custom exercises', 'warning');
        return;
    }

    // Inherit the body part of the exercise being replaced — a swap is
    // almost always like-for-like, so this lands the new entry in the right
    // bucket without asking.
    const current = AppState.currentWorkout?.exercises?.[idx];
    const bodyPart = current?.bodyPart || current?.category || 'Chest';

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        await mgr.saveCustomExercise({
            name,
            machine: name,
            bodyPart,
            equipmentType: 'Machine',
            sets: current?.sets || 3,
            reps: current?.defaultReps || current?.reps || 10,
            weight: 0,
            video: '',
        });

        const refreshed = await mgr.getExerciseLibrary();
        if (Array.isArray(refreshed)) AppState.exerciseDatabase = refreshed;

        const record = (AppState.exerciseDatabase || [])
            .find(ex => (ex.name || ex.machine) === name) || { name };

        awCloseSheet();
        commitReplaceExercise(idx, record);
        showNotification(`Created "${name}"`, 'success');
    } catch (err) {
        console.error('awCreateAndReplaceExercise failed:', err);
        showNotification("Couldn't create exercise — try again", 'error');
    }
}

/** Swap the exercise at `idx` — same semantics as the legacy confirmExerciseReplace. */
function commitReplaceExercise(idx, exercise) {
    const exerciseName = getExerciseName(exercise);
    AppState.currentWorkout.exercises[idx] = {
        machine: exerciseName,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 0,
        video: exercise.video || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
        category: exercise.category || null,
    };

    // New exercise = fresh start for logged data at this slot
    const exerciseKey = `exercise_${idx}`;
    if (AppState.savedData.exercises?.[exerciseKey]) {
        delete AppState.savedData.exercises[exerciseKey];
    }

    saveWorkoutData(AppState);
    renderAll();
    loadAutofillForExercise(idx, { reseed: true, trigger: 'replace' });
    showNotification(`Replaced with ${exerciseName}`, 'success');
}

export async function awConfirmExit() {
    // No confirm — the back-arrow reads as "leave to dashboard", not "end
    // workout". Nothing is discarded: currentWorkout + savedData stay in
    // AppState, the dumbbell FAB / duration pill on the dashboard signal
    // that the workout is still running, and Resume from either surface
    // brings the user right back. Killing the workout entirely lives on
    // "Cancel workout" in the kebab menu, which keeps its own confirm.
    // Prior modal-confirm was 7/8 friction — user leaves on purpose,
    // shouldn't have to answer "Are you sure?" every time.
    cleanup();
    navigateTo('dashboard');
}

export async function awCancelWorkout() {
    const ok = await confirmSheet({
        title: 'Cancel this workout?',
        message: 'Logged sets will be saved as a cancelled session.',
        confirmLabel: 'Cancel workout',
        cancelLabel: 'Keep lifting',
        destructive: true,
    });
    if (!ok) return;
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
        const ok = await confirmSheet({
            title: `Finish workout with ${incompleteSets} incomplete set${incompleteSets > 1 ? 's' : ''}?`,
            confirmLabel: 'Finish workout',
            cancelLabel: 'Keep lifting',
        });
        if (!ok) return;
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
            { label: 'Close', onClick: 'awCloseSheet()' },
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

// ── F2 fast paths + reverse-matcher suggestions (Tier 3 Phase 2) ──
// "Three levels of caring": skip / generic bucket / exact machine. The
// lowest-friction options get the best real estate (traveler-flow D0).
let equipFreeWeightsOpen = false;   // "Free weights" revealed Dumbbells/Barbell
let awMachineSuggestions = [];      // last-rendered reverse-matcher results
let awCatalogSearchResults = [];    // last-rendered inline catalog search results

/**
 * Fast-path chip row rendered at the top of the equipment sheets.
 * `handlers` supplies the onclick strings per surface (workout vs shared).
 */
function renderEquipFastPathsHTML(handlers) {
    return `
        <div class="aw-equip-fastpaths">
            ${handlers.skip ? `
                <button type="button" class="aw-fastpath-chip" onclick="${handlers.skip}">
                    <i class="fas fa-ban"></i> Skip equipment
                </button>` : ''}
            ${equipFreeWeightsOpen ? `
                <button type="button" class="aw-fastpath-chip" onclick="${handlers.dumbbells}">
                    <i class="fas fa-dumbbell"></i> Dumbbells
                </button>
                <button type="button" class="aw-fastpath-chip" onclick="${handlers.barbell}">
                    <i class="fas fa-grip-lines"></i> Barbell
                </button>` : `
                <button type="button" class="aw-fastpath-chip" onclick="${handlers.freeWeights}">
                    <i class="fas fa-dumbbell"></i> Free weights
                </button>`}
            <button type="button" class="aw-fastpath-chip" onclick="${handlers.cable}">
                <i class="fas fa-stream"></i> Cable machine
            </button>
        </div>
    `;
}

/**
 * Find-or-create a generic (brand-less, catalog-less) equipment doc of a
 * type — the "Cable machine" / "Dumbbells" buckets. Reuses an existing
 * generic doc at the session gym (or by exact name anywhere) so repeated
 * fast-path taps never spawn duplicates.
 */
async function resolveGenericEquipment(type, name) {
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;
    const all = AppState._cachedEquipment || [];
    const isGeneric = (eq) => eq.equipmentType === type
        && (!eq.brand || eq.brand === 'Unknown') && !eq.catalogRef;

    let doc = null;
    if (locName) {
        doc = all.find(eq => isGeneric(eq)
            && (eq.locations || []).some(l => (l || '').toLowerCase() === locName.toLowerCase()));
    }
    if (!doc) doc = all.find(eq => (eq.name || '').toLowerCase() === name.toLowerCase());
    if (!doc) {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        // The one writer (AP-13) — it puts the new doc into the cache itself.
        doc = await mgr.getOrCreateEquipment(name, {
            equipmentType: type,
            baseWeight: suggestedBaseWeight(type, AppState.globalUnit || 'lbs'),
            baseWeightUnit: AppState.globalUnit === 'kg' ? 'kg' : 'lbs',
            ...(locName ? { locations: [locName] } : {}),
            createdVia: 'fast-path',
            knownEquipment: all,
        });
    }
    return doc;
}

export function awEquipFreeWeights(exerciseIdx) {
    equipFreeWeightsOpen = true;
    renderEquipmentSheet(exerciseIdx);
}

export async function awEquipFastPath(exerciseIdx, type, name) {
    try {
        const doc = await resolveGenericEquipment(type, name);
        if (!doc) { showNotification("Couldn't save — try again", 'error'); return; }
        equipFreeWeightsOpen = false;
        // awSelectEquipment gym-tags + exercise-links (auto-associate) + selects.
        await awSelectEquipment(exerciseIdx, doc.name, doc.id || null);
    } catch (e) {
        console.error('Fast-path equipment failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

export function awSharedEquipFreeWeights() {
    equipFreeWeightsOpen = true;
    renderSharedEquipmentSheet();
}

export async function awSharedEquipFastPath(type, name) {
    if (!_sharedEquipmentContext) return;
    try {
        const doc = await resolveGenericEquipment(type, name);
        if (!doc) return;
        equipFreeWeightsOpen = false;
        await awSharedSelectEquipment(doc.name);
    } catch (e) {
        console.error('Fast-path equipment failed:', e);
    }
}

/**
 * "Skip equipment" — permanent per exercise (traveler-flow D10). Clears the
 * equipment expectation on the live workout AND the source template, so
 * every availability surface (badges, sheets, pickers) goes quiet for this
 * exercise everywhere, immediately. Undoable from the toast.
 */
export async function awSkipEquipment(exerciseIdx) {
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    if (!exercise) return;
    const exName = getExerciseName(exercise);
    const key = `exercise_${exerciseIdx}`;
    const prevLive = exercise.equipment || null;

    exercise.equipment = null;
    if (AppState.savedData?.exercises?.[key]) {
        AppState.savedData.exercises[key].equipment = null;
    }
    const prevTemplate = await setTemplateEquipmentForExercise(exName, null);

    debouncedSaveWorkoutData(AppState);
    awCloseSheet();
    renderAll();

    showNotification(`Won't ask about equipment for ${exName} again`, 'info', 0, {
        label: 'Undo',
        onClick: async () => {
            exercise.equipment = prevLive;
            if (AppState.savedData?.exercises?.[key]) {
                AppState.savedData.exercises[key].equipment = prevLive;
            }
            if (prevTemplate !== undefined) {
                await setTemplateEquipmentForExercise(exName, prevTemplate);
            }
            debouncedSaveWorkoutData(AppState);
            renderAll();
        },
    });
}

/**
 * Set (or clear) the equipment expectation for an exercise on the current
 * workout's source template. Returns the previous value, or undefined when
 * the template/exercise couldn't be found (nothing was written).
 */
async function setTemplateEquipmentForExercise(exName, equipment) {
    try {
        const tplName = AppState.savedData?.workoutType;
        if (!tplName) return undefined;
        const tpl = (AppState.workoutPlans || []).find(p => (p.name || p.day) === tplName);
        if (!tpl) return undefined;
        const exercises = Array.isArray(tpl.exercises)
            ? tpl.exercises
            : Object.values(tpl.exercises || {});
        const target = exercises.find(e => (e.name || e.machine) === exName);
        if (!target) return undefined;

        const prev = target.equipment || null;
        target.equipment = equipment;
        tpl.exercises = exercises;

        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        const payload = {
            id: tpl.id || tpl.day,
            name: tpl.name || tpl.day,
            exercises,
            suggestedDays: Array.isArray(tpl.suggestedDays) ? tpl.suggestedDays : [],
        };
        if (tpl.category) payload.category = tpl.category;
        if (!tpl.isCustom) payload.overridesDefault = payload.id;
        await mgr.saveWorkoutTemplate(payload);
        return prev;
    } catch (e) {
        console.error('Template equipment update failed:', e);
        return undefined;
    }
}

/**
 * One-tap add for a reverse-matcher suggestion: find-or-create the catalog
 * machine as an equipment doc, then select it — awSelectEquipment auto-
 * associates it with the session gym on the equipment doc (the single source
 * of truth; the old location.equipment[] mirror is gone). Created, gym-tagged,
 * exercise-linked, selected.
 */
export async function awPickSuggestedMachine(exerciseIdx, suggestionIdx) {
    const s = awMachineSuggestions[suggestionIdx];
    if (!s) return;
    try {
        const eq = await addCatalogMachineDoc(s);
        if (!eq) { showNotification("Couldn't save — try again", 'error'); return; }
        await awSelectEquipment(exerciseIdx, eq.name, eq.id || null);
    } catch (e) {
        console.error('Suggested machine add failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

/**
 * Location line for a picker row. Off-gym equipment gets an explicit
 * "At <gym>" prefix so picking a machine that lives at another gym is a
 * visible choice, not a surprise when it later "moves" (selection
 * auto-associates it with the session gym).
 */
function equipLocationCue(eq, locName) {
    const locs = eq.locations || [];
    if (locs.length === 0) return '';
    const offGym = locName && !locs.some(l => (l || '').toLowerCase() === locName.toLowerCase());
    return `${offGym ? 'At ' : ''}${locs.join(', ')}`;
}

export async function awOpenEquipmentSheet(exerciseIdx) {
    exerciseMenuOpen = false;
    equipSearchQuery = '';
    equipSheetShowAll = false;
    equipFreeWeightsOpen = false;

    // Open instantly — from the cache, or empty — never on a network read
    // (AP-11). Then refresh (the user may have added a machine via the
    // library mid-workout) and redraw the list when it lands, as long as
    // this exercise's picker is still the one open.
    if (!Array.isArray(AppState._cachedEquipment)) AppState._cachedEquipment = [];
    renderEquipmentSheet(exerciseIdx);
    // Nothing linked to this exercise yet → the next move is typing. Focus in
    // the tap's own call stack so iOS actually raises the keyboard. With
    // machines to tap, the keyboard would only hide them.
    const exName = getExerciseName(AppState.currentWorkout.exercises[exerciseIdx]);
    const linked = AppState._cachedEquipment.some(eq => (eq.exerciseTypes || []).some(n => n.toLowerCase() === exName.toLowerCase()));
    if (!linked) document.getElementById('aw-equip-search')?.focus({ preventScroll: true });
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        AppState._cachedEquipment = await mgr.getUserEquipment();
    } catch (e) {
        debugLog('Failed to load equipment:', e);
    }
    const listEl = document.getElementById('aw-equip-list');
    if (listEl && listEl.dataset.exerciseIdx === String(exerciseIdx)) {
        listEl.innerHTML = buildEquipListHTML(exerciseIdx);
        if (!_equipAddForm) refreshEquipAddSlot();
    }
}

// ── Inline catalog search (the mid-workout "add the machine I'm standing at") ──
// The picker used to search only equipment you already own, so searching for a
// machine you hadn't added yet dead-ended on "No matches" — and the add path
// was a SEPARATE sheet behind a footer button, with its own search box you had
// to retype the query into, a checkbox, and a commit button. These helpers put
// the catalog in the SAME search box: one query finds owned + addable, and one
// tap creates, gym-tags, exercise-links and selects the machine. The search
// itself lives in data/catalog-search.js (pure, unit-tested).

/**
 * Catalog in the AUGMENTED shape — stable machine ids and a brand `name`,
 * matching what the library's getCatalogSync serves. The raw EQUIPMENT_CATALOG
 * export uses `brand:` and gives machines no id, so reading it directly here
 * silently produced undefined catalogRefs and brand names on every suggestion
 * row. Memoized: augmenting ~1.4k machines on each keystroke isn't free.
 */
let _augmentedCatalog = null;
function awCatalog() {
    if (AppState.equipmentCatalog) return AppState.equipmentCatalog;
    if (!_augmentedCatalog) _augmentedCatalog = augmentStaticCatalog(EQUIPMENT_CATALOG);
    return _augmentedCatalog;
}

/** One-tap "add this and use it" row for a catalog machine. */
function catalogAddRowHTML(machine, onclick) {
    const meta = [machine.brandName, machine.type].filter(Boolean).join(' · ');
    return `
        <div class="js-row" onclick="${onclick}">
            <div class="js-row__icon js-row__icon--add"><i class="fas fa-plus"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">${escapeHtml(machine.name)}</div>
                <div class="js-row__meta">${escapeHtml(meta)} · Tap to add</div>
            </div>
        </div>
    `;
}

// ── Inline add: one door (AP-11) + in-place details (AP-14) ──────────
// Type the machine you're standing at; the row pinned under the search
// field either offers the one you probably already own ("Use …") or adds
// what you typed in one tap — gym-tagged, linked to this exercise, in its
// unit, selected, sheet closed. The chevron opens name / brand / type /
// unit / base weight in place; there is no separate form anymore.

let _equipSheetScope = null;   // { kind:'aw', idx } | { kind:'shared' }
let _equipAddForm = null;      // the expanded details draft, or null
let _equipAddBusy = false;     // one write at a time from add / catalog rows
const EQUIP_FORM_TYPES = ['Plate-Loaded', 'Selectorized', 'Machine', 'Cable', 'Barbell', 'Dumbbell', 'Bench', 'Other'];

/** Who the add row is creating for: gym, exercise and unit of the open sheet. */
function equipAddContext() {
    const scope = _equipSheetScope;
    const sessionLoc = AppState.savedData?.location;
    const locName = (typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc) || null;
    if (scope?.kind === 'aw') {
        const ex = AppState.currentWorkout?.exercises?.[scope.idx];
        return {
            scope, locName,
            exerciseName: ex ? getExerciseName(ex) : null,
            unit: AppState.exerciseUnits?.[scope.idx] || AppState.globalUnit || 'lbs',
        };
    }
    return { scope, locName, exerciseName: _sharedEquipmentContext?.exerciseName || null, unit: AppState.globalUnit || 'lbs' };
}

function planFromSearch({ force = false } = {}) {
    const c = equipAddContext();
    return planInlineEquipment({
        query: equipSearchQuery, exerciseName: c.exerciseName, gymName: c.locName, unit: c.unit,
        owned: AppState._cachedEquipment || [], catalog: awCatalog(), force,
    });
}

/** Search field + the add slot, pinned together at the top of the sheet. */
function equipSearchHeadHTML(oninput) {
    return `
        <div class="aw-equip-head${_equipAddForm ? ' aw-equip-head--form' : ''}" id="aw-equip-head">
            <div class="field-search">
                <i class="fas fa-search" aria-hidden="true"></i>
                <input id="aw-equip-search" type="text" placeholder="Search or type a new machine…" autocomplete="off"
                       aria-label="Search equipment" value="${escapeAttr(equipSearchQuery)}" oninput="${oninput}">
            </div>
            <div id="aw-equip-add-slot">${equipAddSlotHTML()}</div>
        </div>
    `;
}

function refreshEquipAddSlot() {
    const slot = document.getElementById('aw-equip-add-slot');
    if (slot) slot.innerHTML = equipAddSlotHTML();
    document.getElementById('aw-equip-head')?.classList.toggle('aw-equip-head--form', !!_equipAddForm);
}

function equipAddSlotHTML() {
    if (_equipAddForm) return equipAddFormHTML();
    const query = (equipSearchQuery || '').trim();
    if (query.length < 2) {
        // Always-visible door (10/25: the AP-11 rewrite only showed the add
        // row after typing, so mid-workout there was no visible way to add a
        // machine). One tap opens the in-place form with the keyboard up.
        const { locName } = equipAddContext();
        return `
            <div class="aw-equip-add">
                <div class="js-row aw-equip-add__row" id="aw-equip-add-new" role="button" tabindex="0" onclick="awEquipAddExpand()">
                    <div class="js-row__icon js-row__icon--add"><i class="fas fa-plus" aria-hidden="true"></i></div>
                    <div class="js-row__info">
                        <div class="js-row__name">Add a new machine${locName ? ` at ${escapeHtml(locName)}` : ''}</div>
                        <div class="js-row__meta">Or type its name above</div>
                    </div>
                </div>
            </div>
        `;
    }
    const plan = planFromSearch();
    if (plan.action === 'invalid') return '';
    if (plan.action === 'use-existing') {
        // An exact name is already the first owned row below — nothing to add.
        if (plan.how === 'exact') return '';
        return `
            <div class="aw-equip-add">
                <div class="js-row" role="button" tabindex="0" onclick="awEquipAddUseExisting()">
                    <div class="js-row__icon js-row__icon--equip"><i class="fas fa-check" aria-hidden="true"></i></div>
                    <div class="js-row__info">
                        <div class="js-row__name">Use “${escapeHtml(plan.existing.name)}”</div>
                        <div class="js-row__meta">Looks like one you already have</div>
                    </div>
                </div>
                <button type="button" class="btn-text aw-equip-add__anyway" onclick="awEquipAddCreate(true)">Add “${escapeHtml(query)}” as a new machine</button>
            </div>
        `;
    }
    const d = plan.doc;
    const c = equipAddContext();
    const meta = [d.equipmentType, d.preferredUnit, d.baseWeight ? `base ${d.baseWeight}` : null].filter(Boolean).join(' · ');
    return `
        <div class="aw-equip-add">
            <div class="js-row aw-equip-add__row" id="aw-equip-add-row" role="button" tabindex="0" onclick="awEquipAddCreate(false)">
                <div class="js-row__icon js-row__icon--add"><i class="fas fa-plus" aria-hidden="true"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">Add “${escapeHtml(d.name)}”${c.locName ? ` at ${escapeHtml(c.locName)}` : ''}</div>
                    <div class="js-row__meta">${escapeHtml(meta)}</div>
                </div>
                <button type="button" class="js-row__more" onclick="event.stopPropagation(); awEquipAddExpand()" aria-label="Add with details">
                    <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
            </div>
        </div>
    `;
}

function equipAddPreviewText() {
    const f = _equipAddForm;
    if (!f) return '';
    const name = composeEquipmentName({ brand: f.brand, function: f.name }) || f.name;
    const { locName } = equipAddContext();
    return `Saves as ${name}${locName ? ` · adds to ${locName}` : ''}`;
}

function equipAddFormHTML() {
    const f = _equipAddForm;
    const brands = knownBrands(AppState._cachedEquipment || [], awCatalog()).slice(0, 300);
    return `
        <div class="aw-equip-add aw-equip-add--form">
            <div class="field">
                <div class="field-label">Name</div>
                <input id="aw-equip-add-name" class="field-input" type="text" autocomplete="off" enterkeyhint="done"
                       value="${escapeAttr(f.name)}" oninput="awEquipAddField('name', this.value)">
            </div>
            <div class="field">
                <div class="field-label">Brand · optional</div>
                <input id="aw-equip-add-brand" class="field-input" type="text" list="aw-equip-brands" autocomplete="off"
                       value="${escapeAttr(f.brand)}" oninput="awEquipAddField('brand', this.value)">
                <datalist id="aw-equip-brands">${brands.map(b => `<option value="${escapeAttr(b)}"></option>`).join('')}</datalist>
            </div>
            <div class="field">
                <div class="field-label">Type</div>
                <div class="chips" id="aw-equip-add-types">
                    ${EQUIP_FORM_TYPES.map(t => `<button type="button" class="chip chip--sm${t === f.type ? ' active' : ''}" data-type="${t}" aria-pressed="${t === f.type}" onclick="awEquipAddField('type', '${t}')">${t}</button>`).join('')}
                </div>
            </div>
            <div class="field">
                <div class="field-label">Unit · base weight (empty sled or bar)</div>
                <div class="aw-new-equip__base-row">
                    <div class="segmented" id="aw-equip-add-unit">
                        ${['lbs', 'kg'].map(u => `<button type="button" class="${u === f.unit ? 'active' : ''}" data-unit="${u}" aria-pressed="${u === f.unit}" onclick="awEquipAddField('unit', '${u}')">${u === 'lbs' ? 'lb' : 'kg'}</button>`).join('')}
                    </div>
                    <input id="aw-equip-add-base" class="field-input aw-new-equip__base-input" type="number" inputmode="decimal" step="0.5" min="0"
                           placeholder="0" aria-label="Base weight" value="${escapeAttr(f.base)}" oninput="awEquipAddField('base', this.value)">
                </div>
            </div>
            <div class="aw-equip-add__preview" id="aw-equip-add-preview">${escapeHtml(equipAddPreviewText())}</div>
            <div class="aw-equip-add__actions">
                <button type="button" class="btn btn-secondary" onclick="awEquipAddCollapse()">Cancel</button>
                <button type="button" class="btn btn-primary" id="aw-equip-add-save" onclick="awEquipAddCommitForm()">Add and use</button>
            </div>
        </div>
    `;
}

/** "Browse by body part" — the catalog quick-add, carrying the query over. */
function browseCatalogRowHTML(onclick, locName) {
    const q = (equipSearchQuery || '').trim();
    return `
        <div class="aw-equip-section">
            <div class="js-row" role="button" tabindex="0" onclick="${onclick}">
                <div class="js-row__icon js-row__icon--add"><i class="fas fa-list" aria-hidden="true"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">Browse by body part</div>
                    <div class="js-row__meta">${q ? `Catalog for “${escapeHtml(q)}”` : 'The machine catalog'} · adds to ${escapeHtml(locName)}</div>
                </div>
            </div>
        </div>
    `;
}

function selectEquipFromScope(scope, eq) {
    if (scope?.kind === 'aw') return awSelectEquipment(scope.idx, eq.name, eq.id || null);
    return awSharedSelectEquipment(eq.name);
}

/**
 * The one create path from the picker: plan (dedupe, brand, type, unit,
 * gym, exercise) → the one writer → select → close → say what happened.
 */
async function equipAddCreate({ force = false, draft = null } = {}) {
    if (_equipAddBusy) return;
    const c = equipAddContext();
    if (!c.scope) return;
    const owned = AppState._cachedEquipment || [];
    const plan = planInlineEquipment({
        query: draft ? draft.name : equipSearchQuery,
        exerciseName: c.exerciseName, gymName: c.locName,
        unit: draft?.unit || c.unit, brand: draft?.brand || null, type: draft?.type || null,
        baseWeight: draft ? draft.base : null,
        owned, catalog: awCatalog(), force,
    });
    if (plan.action === 'invalid') { showNotification(plan.error, 'warning'); return; }
    if (plan.action === 'use-existing') { await selectEquipFromScope(c.scope, plan.existing); return; }

    _equipAddBusy = true;
    const row = document.getElementById('aw-equip-add-row');
    const saveBtn = document.getElementById('aw-equip-add-save');
    row?.setAttribute('aria-busy', 'true');
    row?.classList.add('disabled');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.setAttribute('aria-busy', 'true'); }
    try {
        haptic('tap');
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        const eq = await mgr.getOrCreateEquipment(plan.doc.name, { ...plan.doc, knownEquipment: owned });
        if (!eq) { showNotification("Couldn't save — try again", 'error'); return; }
        const created = !owned.some(e => e.id === eq.id);
        if (created && c.locName) AppState._sessionMappedEquipment?.add(eq.name);
        equipSearchQuery = '';
        _equipAddForm = null;
        await selectEquipFromScope(c.scope, eq);
        if (!created) {
            showNotification(`Using ${eq.name}`, 'success', 2500);
        } else if (c.locName) {
            showNotification(`${eq.name} added to ${c.locName}`, 'success', 2500);
        } else if (c.scope.kind === 'aw' && typeof window.changeWorkoutLocation === 'function') {
            // No gym yet: create anyway, offer to set one — never leave the workout.
            showNotification(`${eq.name} added — no gym set`, 'info', 6000, {
                label: 'Set gym',
                onClick: () => window.changeWorkoutLocation(),
            });
        } else {
            showNotification(`${eq.name} added`, 'success', 2500);
        }
    } catch (e) {
        console.error('❌ Add equipment failed:', e);
        showNotification("Couldn't save — try again", 'error');
    } finally {
        _equipAddBusy = false;
        if (row?.isConnected) { row.removeAttribute('aria-busy'); row.classList.remove('disabled'); }
        if (saveBtn?.isConnected) { saveBtn.disabled = false; saveBtn.removeAttribute('aria-busy'); }
    }
}

export function awEquipAddCreate(force = false) {
    return equipAddCreate({ force: !!force });
}

export function awEquipAddUseExisting() {
    const plan = planFromSearch();
    if (plan.action === 'use-existing') return selectEquipFromScope(_equipSheetScope, plan.existing);
    return null;
}

export function awEquipAddExpand() {
    const c = equipAddContext();
    const plan = planFromSearch({ force: true });
    const d = plan.action === 'create' ? plan.doc : null;
    _equipAddForm = {
        name: d ? (d.brand ? (d.function || '') : d.name) : (equipSearchQuery || '').trim(),
        brand: d?.brand || '',
        type: d?.equipmentType || 'Machine',
        unit: c.unit === 'kg' ? 'kg' : 'lbs',
        base: d?.baseWeight ? String(d.baseWeight) : '',
    };
    refreshEquipAddSlot();
    const name = document.getElementById('aw-equip-add-name');
    if (name && !name.value) name.focus();
}

export function awEquipAddCollapse() {
    _equipAddForm = null;
    refreshEquipAddSlot();
}

/** Form edits update the draft in place — no re-render, so focus survives. */
export function awEquipAddField(field, value) {
    const f = _equipAddForm;
    if (!f) return;
    if (field === 'type') {
        if (!EQUIP_FORM_TYPES.includes(value)) return;
        f.type = value;
        document.querySelectorAll('#aw-equip-add-types .chip').forEach(btn => {
            const on = btn.dataset.type === value;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', String(on));
        });
        // A blank base weight picks up the type's usual one (a bar is 45).
        const baseInput = document.getElementById('aw-equip-add-base');
        if (baseInput && !baseInput.value) {
            const sug = suggestedBaseWeight(value, f.unit);
            if (sug) { baseInput.value = sug; f.base = String(sug); }
        }
    } else if (field === 'unit') {
        if (value !== 'lbs' && value !== 'kg') return;
        f.unit = value;
        document.querySelectorAll('#aw-equip-add-unit button').forEach(btn => {
            const on = btn.dataset.unit === value;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', String(on));
        });
    } else if (field === 'name' || field === 'brand' || field === 'base') {
        f[field] = String(value ?? '');
    } else {
        return;
    }
    const preview = document.getElementById('aw-equip-add-preview');
    if (preview) preview.textContent = equipAddPreviewText();
}

export async function awEquipAddCommitForm() {
    const f = _equipAddForm;
    if (!f) return;
    if (!f.name.trim() && !f.brand.trim()) {
        showNotification('Add a name', 'warning');
        document.getElementById('aw-equip-add-name')?.focus();
        return;
    }
    const base = f.base === '' ? null : Math.max(0, parseFloat(f.base) || 0);
    // Brand + name compose through the planner (composeEquipmentName).
    await equipAddCreate({
        force: true,
        draft: { name: f.name.trim() || f.brand.trim(), brand: f.name.trim() ? f.brand.trim() : '', type: f.type, unit: f.unit, base },
    });
}

/**
 * Build the scrollable list for the active-workout equipment picker.
 *
 * Split out of renderEquipmentSheet so SEARCH re-renders the same markup: the
 * old search path had its own stripped-down renderer that dropped the
 * sections, the "None" row and every add affordance, which is exactly what
 * made "search for the machine → No matches → stuck" the default experience.
 */
function buildEquipListHTML(exerciseIdx) {
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    const currentEquip = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`]?.equipment || exercise.equipment;
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const allEquipment = AppState._cachedEquipment || [];
    const searching = !!(equipSearchQuery || '').trim();

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
        return list.filter(eq => eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q)
            || matchesAllTokens(`${eq.name || ''} ${eq.brand || ''} ${eq.equipmentType || ''}`, q));
    };

    const renderRow = (eq) => {
        const isCurrent = eq.name === currentEquip;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locStr = equipLocationCue(eq, locName);
        // Saved machine settings for THIS exercise ("Seat 4 · Pin 13") —
        // cheap reminder of which machine you dialed in (Tier 3 3.2).
        const settingsStr = (eq.exerciseSettings?.[exName] || [])
            .map(p => `${p.label} ${p.value}`).join(' · ');
        return `
            <div class="js-row ${isCurrent ? 'current' : ''}" onclick="awSelectEquipment(${exerciseIdx}, '${escapeAttr(eq.name)}', '${escapeAttr(eq.id || '')}' || null)">
                <div class="js-row__icon js-row__icon--equip"><i class="fas fa-cog"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(eq.name)}${isCurrent ? ' ✓' : ''}</div>
                    <div class="js-row__meta">${eq.equipmentType || 'Equipment'}${baseWeight}${locStr ? ` · <i class="fas fa-map-marker-alt js-row__loc-icon"></i> ${escapeHtml(locStr)}` : ''}</div>
                    ${settingsStr ? `<div class="js-row__meta js-row__meta--settings">${escapeHtml(settingsStr)}</div>` : ''}
                </div>
                <button class="js-row__more" onclick="event.stopPropagation(); awQuickEditEquipment(${exerciseIdx}, '${escapeAttr(eq.name)}')" aria-label="Edit ${escapeAttr(eq.name)}">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
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

    // Reverse-matcher suggestions (F2): when nothing is mapped to this
    // exercise yet, suggest likely catalog machines as one-tap adds instead
    // of shrugging. Machines already in the library are excluded. Suppressed
    // while searching — the catalog section below answers the query directly.
    let matchesSection = '';
    if (!searching && forThisExercise.length === 0) {
        const have = new Set(allEquipment.map(eq => eq.catalogRef).filter(Boolean));
        awMachineSuggestions = suggestMachinesForExercise(exName, awCatalog())
            .filter(s => !have.has(s.catalogRef));
        if (awMachineSuggestions.length > 0) {
            matchesSection = `
                <div class="aw-equip-section">
                    <div class="aw-equip-section__title">Matches for ${escapeHtml(exName)}</div>
                    ${awMachineSuggestions.map((s, i) => catalogAddRowHTML(s, `awPickSuggestedMachine(${exerciseIdx}, ${i})`)).join('')}
                </div>
            `;
        }
    } else {
        awMachineSuggestions = [];
    }

    // The point of the whole change: the same query that filters your library
    // also searches the catalog, and every result is a single tap away from
    // being created, gym-tagged, linked to this exercise and selected.
    let catalogSection = '';
    if (searching) {
        const owned = ownedEquipmentKeys(allEquipment);
        awCatalogSearchResults = searchCatalogMachines(equipSearchQuery, awCatalog(), { owned });
        if (awCatalogSearchResults.length > 0) {
            catalogSection = `
                <div class="aw-equip-section">
                    <div class="aw-equip-section__title">Add from catalog</div>
                    ${awCatalogSearchResults.map((m, i) => catalogAddRowHTML(m, `awAddCatalogMachine(${exerciseIdx}, ${i})`)).join('')}
                </div>
            `;
        }
    } else {
        awCatalogSearchResults = [];
    }

    // The add / use-existing row is the slot pinned under the search field
    // (AP-11) — not in this list. Browsing the catalog by body part lives on
    // as the last row; it needs a gym to tag and carries the query over.
    const browseRow = locName ? browseCatalogRowHTML(`awOpenCatalogQuickAdd(${exerciseIdx})`, locName) : '';

    return `
        ${renderSection(`For ${escapeHtml(exName)}`, forThisExercise, 'No equipment assigned to this exercise yet')}
        ${matchesSection}
        ${locName ? renderSection(`At ${escapeHtml(locName)}`, atThisGym, `No equipment saved at ${escapeHtml(locName)} yet`) : ''}
        ${otherSectionHTML}
        ${catalogSection}
        ${searching ? '' : noneRow}
        ${browseRow}
    `;
}

function renderEquipmentSheet(exerciseIdx) {
    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    if (_equipSheetScope?.kind !== 'aw' || _equipSheetScope.idx !== exerciseIdx) _equipAddForm = null;
    _equipSheetScope = { kind: 'aw', idx: exerciseIdx };

    const body = `
        ${renderEquipFastPathsHTML({
            skip: `awSkipEquipment(${exerciseIdx})`,
            freeWeights: `awEquipFreeWeights(${exerciseIdx})`,
            dumbbells: `awEquipFastPath(${exerciseIdx}, 'Dumbbell', 'Dumbbells')`,
            barbell: `awEquipFastPath(${exerciseIdx}, 'Barbell', 'Barbell')`,
            cable: `awEquipFastPath(${exerciseIdx}, 'Cable', 'Cable machine')`,
        })}
        ${equipSearchHeadHTML(`awEquipSearch(${exerciseIdx}, this.value)`)}
        <div id="aw-equip-list" data-exercise-idx="${exerciseIdx}">
            ${buildEquipListHTML(exerciseIdx)}
        </div>
    `;

    // One door (AP-11): type the machine, tap the row under the field. The
    // footer's old "New machine" form is the slot's expand chevron now.
    openSheet({
        title: 'Choose equipment',
        subtitle: exName,
        body,
        actions: [
            { label: 'Done', onClick: 'awCloseSheet()', primary: true },
        ],
    });
}

/**
 * Find-or-create the equipment doc for a catalog machine and refresh the
 * picker's cache. Shared by the reverse-matcher suggestions and the inline
 * catalog search results. getOrCreateEquipment does the dedup, so a machine
 * that already exists under a slightly different spelling is reused.
 */
async function addCatalogMachineDoc(machine) {
    const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
    const mgr = new FirebaseWorkoutManager(AppState);
    const c = equipAddContext();
    // composeEquipmentName is THE composer (AP-13) — this used to build the
    // name inline, a third spelling of the same rule.
    const name = composeEquipmentName({ brand: machine.brandName, line: machine.lineName, function: machine.name });
    return mgr.getOrCreateEquipment(name, {
        brand: machine.brandName,
        line: machine.lineName,
        function: machine.name,
        equipmentType: machine.type,
        catalogRef: machine.catalogRef,
        baseWeight: suggestedBaseWeight(machine.type, c.unit),
        baseWeightUnit: c.unit,
        preferredUnit: c.unit,
        ...(c.locName ? { locations: [c.locName] } : {}),
        ...(c.exerciseName ? { exerciseTypes: [c.exerciseName] } : {}),
        createdVia: 'catalog',
        knownEquipment: AppState._cachedEquipment || [],
    });
}

/**
 * One-tap add for an inline catalog search result: create the doc, then
 * select it — awSelectEquipment gym-tags it and links it to this exercise,
 * so "type three letters, tap, lift" is the whole flow.
 */
export async function awAddCatalogMachine(exerciseIdx, resultIdx) {
    const m = awCatalogSearchResults[resultIdx];
    if (!m || _equipAddBusy) return;
    _equipAddBusy = true;
    try {
        haptic('tap');
        const eq = await addCatalogMachineDoc(m);
        if (!eq) { showNotification("Couldn't save — try again", 'error'); return; }
        await awSelectEquipment(exerciseIdx, eq.name, eq.id || null);
    } catch (e) {
        console.error('Catalog machine add failed:', e);
        showNotification("Couldn't save — try again", 'error');
    } finally {
        _equipAddBusy = false;
    }
}

/**
 * "Add from catalog" mid-workout: open the equipment library's quick-add
 * sheet in place, scoped to the session gym. On commit the machine is
 * promoted to an equipment doc (gym-tagged + exercise-mapped); if exactly
 * one was added, select it for this exercise — the user is standing in
 * front of it. Falls back to the navigate-to-library bridge when no gym is
 * set (quick-add needs a gym to tag).
 */
export function awOpenCatalogQuickAdd(exerciseIdx) {
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;
    // window.* rather than an import: openQuickAddSheet has been window-wired
    // since the quick-add shipped. No gym (or no quick-add): stay in the
    // workout and type it — never navigate away (AP-11).
    if (!locName || typeof window.openQuickAddSheet !== 'function') {
        document.getElementById('aw-equip-search')?.focus({ preventScroll: true });
        return;
    }
    const initialSearch = (equipSearchQuery || '').trim();
    awCloseSheet();
    window.openQuickAddSheet(locName, {
        initialSearch,
        onDone: (added) => {
            added.forEach(eq => AppState._sessionMappedEquipment?.add(eq.name));
            if (added.length === 1) {
                awSelectEquipment(exerciseIdx, added[0].name, added[0].id || null);
            } else {
                // Zero or several added — reopen the picker so they choose.
                awOpenEquipmentSheet(exerciseIdx);
            }
        },
    });
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
    equipFreeWeightsOpen = false;

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

/**
 * Build the scrollable list for the shared (template / edit-history) picker.
 * Mirrors buildEquipListHTML so search re-renders the real markup instead of
 * the old stripped-down "No matches" dead end — same wall, same fix, but kept
 * as a parallel path per the active-workout safety rule.
 */
function buildSharedEquipListHTML() {
    const ctx = _sharedEquipmentContext;
    if (!ctx) return '';

    const exName = ctx.exerciseName;
    const currentEquip = ctx.currentEquipment;
    // Use session location if there happens to be one (e.g., user is editing a
    // template while detected at a gym), otherwise omit the "At {gym}" section.
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const allEquipment = AppState._cachedEquipment || [];
    const searching = !!(equipSearchQuery || '').trim();

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
        return list.filter(eq => eq.name?.toLowerCase().includes(q) || (eq.equipmentType || '').toLowerCase().includes(q)
            || matchesAllTokens(`${eq.name || ''} ${eq.brand || ''} ${eq.equipmentType || ''}`, q));
    };

    const renderRow = (eq) => {
        const isCurrent = eq.name === currentEquip;
        const baseWeight = eq.baseWeight ? ` · ${eq.baseWeight} ${eq.baseWeightUnit || 'lb'}` : '';
        const locStr = equipLocationCue(eq, locName);
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

    // Catalog quick-add needs a gym to tag machines to — only offer the browse
    // row when a session location is known.
    const catalogRow = locName ? browseCatalogRowHTML('awSharedOpenCatalogQuickAdd()', locName) : '';

    // Same inline catalog search as the workout picker: a template edit hits
    // the identical "I don't own this machine yet" wall.
    let catalogSection = '';
    if (searching) {
        const owned = ownedEquipmentKeys(allEquipment);
        awCatalogSearchResults = searchCatalogMachines(equipSearchQuery, awCatalog(), { owned });
        if (awCatalogSearchResults.length > 0) {
            catalogSection = `
                <div class="aw-equip-section">
                    <div class="aw-equip-section__title">Add from catalog</div>
                    ${awCatalogSearchResults.map((m, i) => catalogAddRowHTML(m, `awSharedAddCatalogMachine(${i})`)).join('')}
                </div>
            `;
        }
    } else {
        awCatalogSearchResults = [];
    }

    return `
        ${renderSection(`For ${escapeHtml(exName)}`, forThisExercise, 'No equipment assigned to this exercise yet')}
        ${locName ? renderSection(`At ${escapeHtml(locName)}`, atThisGym, `No equipment saved at ${escapeHtml(locName)} yet`) : ''}
        ${renderSection('Other equipment', otherEquipment, 'No other equipment saved')}
        ${catalogSection}
        ${searching ? '' : noneRow}
        ${catalogRow}
    `;
}

function renderSharedEquipmentSheet() {
    const ctx = _sharedEquipmentContext;
    if (!ctx) return;
    if (_equipSheetScope?.kind !== 'shared') _equipAddForm = null;
    _equipSheetScope = { kind: 'shared' };

    const exName = ctx.exerciseName;

    const body = `
        ${renderEquipFastPathsHTML({
            // No Skip here: the shared sheet's None row already clears the
            // template's equipment field, which IS the skip semantic (D10).
            freeWeights: `awSharedEquipFreeWeights()`,
            dumbbells: `awSharedEquipFastPath('Dumbbell', 'Dumbbells')`,
            barbell: `awSharedEquipFastPath('Barbell', 'Barbell')`,
            cable: `awSharedEquipFastPath('Cable', 'Cable machine')`,
        })}
        ${equipSearchHeadHTML('awSharedEquipSearch(this.value)')}
        <div id="aw-equip-list">
            ${buildSharedEquipListHTML()}
        </div>
    `;

    openSheet({
        title: 'Choose equipment',
        subtitle: exName,
        body,
        actions: [
            { label: 'Keep current', onClick: 'awSharedCancelEquipment()' },
            { label: 'Done', onClick: 'awCloseSheet()', primary: true },
        ],
    });
}

export function awSharedEquipSearch(query) {
    equipSearchQuery = query;
    // Re-render through the SAME builder the sheet uses — the search input
    // lives outside #aw-equip-list, so focus and caret survive.
    const listEl = document.getElementById('aw-equip-list');
    if (!listEl || !_sharedEquipmentContext) return;
    listEl.innerHTML = buildSharedEquipListHTML();
    if (!_equipAddForm) refreshEquipAddSlot();
}

/**
 * One-tap add for an inline catalog search result in the shared picker:
 * create the equipment doc, then hand its name back through onSelect exactly
 * as if the row had already been in the list.
 */
export async function awSharedAddCatalogMachine(resultIdx) {
    const m = awCatalogSearchResults[resultIdx];
    if (!_sharedEquipmentContext || !m || _equipAddBusy) return;
    _equipAddBusy = true;
    try {
        haptic('tap');
        const eq = await addCatalogMachineDoc(m);
        if (!eq) { showNotification("Couldn't save — try again", 'error'); return; }
        await awSharedSelectEquipment(eq.name);
    } catch (e) {
        console.error('Catalog machine add failed:', e);
        showNotification("Couldn't save — try again", 'error');
    } finally {
        _equipAddBusy = false;
    }
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
 * Shared-sheet variant of awOpenCatalogQuickAdd: quick-add a catalog machine
 * at the session gym, then deliver it through the caller's onSelect just as
 * if it had been tapped in the list. Zero-or-many adds reopen the sheet.
 */
export function awSharedOpenCatalogQuickAdd() {
    const ctx = _sharedEquipmentContext;
    if (!ctx) return;
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;
    if (!locName || typeof window.openQuickAddSheet !== 'function') return;
    const initialSearch = (equipSearchQuery || '').trim();
    awCloseSheet();
    window.openQuickAddSheet(locName, {
        initialSearch,
        onDone: async (added) => {
            if (added.length === 1) {
                const cb = ctx.onSelect;
                _sharedEquipmentContext = null;
                try { await cb(added[0].name); } catch (e) { console.error('Shared equipment onSelect threw:', e); }
            } else {
                _sharedEquipmentContext = ctx;
                renderSharedEquipmentSheet();
            }
        },
    });
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
    // Re-render through the SAME builder the sheet uses — the search input
    // lives outside #aw-equip-list, so focus and caret survive.
    const listEl = document.getElementById('aw-equip-list');
    if (!listEl) return;
    listEl.innerHTML = buildEquipListHTML(exerciseIdx);
    if (!_equipAddForm) refreshEquipAddSlot();
}

export async function awSelectEquipment(exerciseIdx, equipName, equipId = null) {
    const key = `exercise_${exerciseIdx}`;
    if (!AppState.savedData.exercises[key]) {
        AppState.savedData.exercises[key] = { sets: [] };
    }
    // Resolve the id when the caller didn't pass one (name-unique case only —
    // getEquipmentDoc falls back to name match).
    const resolvedId = equipId || (equipName ? (getEquipmentDoc(equipName)?.id || null) : null);

    AppState.savedData.exercises[key].equipment = equipName || null;
    // D5 — "None" is a choice: autofill must not re-adopt last session's
    // machine onto an exercise the user deliberately cleared.
    if (equipName) delete AppState.savedData.exercises[key].equipmentExplicitNone;
    else AppState.savedData.exercises[key].equipmentExplicitNone = true;
    // CRITICAL: keep the stable id in lockstep with the name. Leaving the OLD
    // machine's id here made every id-first resolver (base weight, plate calc,
    // settings sheet, PR keying) read the wrong equipment doc after a swap —
    // e.g. a plate-loaded machine's 45 lb base silently added to cable sets.
    AppState.savedData.exercises[key].equipmentId = resolvedId;

    // Also update template exercise
    if (AppState.currentWorkout.exercises[exerciseIdx]) {
        AppState.currentWorkout.exercises[exerciseIdx].equipment = equipName || null;
        AppState.currentWorkout.exercises[exerciseIdx].equipmentId = resolvedId;
    }

    // Auto-associate: add current location + exercise to equipment if not already there
    if (equipName) {
        const eq = getEquipmentDoc(equipName, resolvedId);
        const exName = getExerciseName(AppState.currentWorkout.exercises[exerciseIdx]);
        const sessionLoc = AppState.savedData?.location;
        const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

        if (eq) {
            let needsUpdate = false;
            // Add current location if not present
            if (locName && !(eq.locations || []).some(l => l.toLowerCase() === locName.toLowerCase())) {
                eq.locations = [...(eq.locations || []), locName];
                needsUpdate = true;
                // F4: gym-tagged during this session → counts toward the
                // completion "you mapped N machines" payoff.
                AppState._sessionMappedEquipment?.add(eq.name);
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
                    const payload = { locations: eq.locations, exerciseTypes: eq.exerciseTypes };
                    // Dual-write locationIds[] (Phase 8b step 4). Session gyms are
                    // resolved/created at workout start, so _cachedLocations is warm;
                    // only override when we resolved ids so a cold cache can't clobber.
                    const { resolveLocationId } = await import('../data/location-id-resolver.js');
                    const locDocs = AppState._cachedLocations || [];
                    const ids = [...new Set((eq.locations || [])
                        .map(n => resolveLocationId(n, locDocs).id).filter(Boolean))];
                    if (ids.length) { payload.locationIds = ids; eq.locationIds = ids; }
                    await updateDoc(eqRef, payload);
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

    // AP-12 — the machine's own unit (kg plates at an lbs gym) wins: switch
    // the exercise and convert what's already on the rows.
    const picked = equipName ? getEquipmentDoc(equipName, resolvedId) : null;
    const curUnit = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';
    if (picked?.preferredUnit && picked.preferredUnit !== curUnit) {
        if (!AppState.exerciseUnits) AppState.exerciseUnits = {};
        AppState.exerciseUnits[exerciseIdx] = picked.preferredUnit;
        convertSetsUnit(AppState.savedData.exercises[key].sets, curUnit, picked.preferredUnit);
    }

    debouncedSaveWorkoutData(AppState);
    awCloseSheet();
    renderAll();

    // Refetch autofill so the last-session card + placeholders update to
    // the new equipment's history (the cache key is equipment-specific, so
    // this triggers a fresh fetch). renderAll inside loadAutofillForExercise
    // handles the second redraw once data lands.
    loadAutofillForExercise(exerciseIdx, { reseed: true, trigger: 'equipment' });
}

// ===================================================================
// ADD EXERCISE SHEET
// ===================================================================

let addExerciseFilter = 'All';
let addExerciseSearch = '';
// Which workout session the filter belongs to (savedData.startedAt). The filter
// PERSISTS across sheet opens within one workout — a leg-day freestyler adding
// 6-8 exercises shouldn't re-tap "Legs" on every single open — and resets when
// a different workout starts.
let addExerciseFilterSession = null;

// Exercise-picker taxonomy — browse by BODY PART, matching the exercise library
// and the dashboard drill-downs. Push/Pull is a workout-programming concept, not
// an exercise attribute, and library exercises carry `bodyPart` (never a
// `category`), so we filter + label on body part and fold sub-parts into the
// seven canonical buckets. Both add-exercise sheets in this file share this.
const AW_EX_CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];
/**
 * Library plus every exercise name that only lives in the user's templates or
 * logged history. Coach-built templates name exercises freely, so a lift the
 * user does every week can be absent from exerciseDatabase — and then the
 * swap/add sheets couldn't find it ("I've used that exercise every week, now
 * I can't find it", 9/29). Extras bucket as Other and search like any row.
 */
function withWorkoutOnlyExercises(library) {
    const have = new Set(library.map((ex) => (ex.name || ex.machine || '').toLowerCase()));
    const extras = new Map();
    const consider = (name, category) => {
        const n = (name || '').trim();
        const k = n.toLowerCase();
        if (!n || have.has(k) || extras.has(k)) return;
        extras.set(k, { name: n, machine: n, bodyPart: category || '', _workoutOnly: true });
    };
    for (const t of AppState.workoutPlans || []) {
        for (const ex of t.exercises || []) consider(ex.machine || ex.name, ex.category || t.category);
    }
    for (const w of AppState.workouts || []) {
        for (const n of Object.values(w.exerciseNames || {})) consider(n, null);
    }
    return extras.size ? [...library, ...extras.values()] : library;
}

function awExerciseBucket(ex) {
    const bp = (ex.bodyPart || ex.category || '').toLowerCase();
    if (bp.includes('chest') || bp.includes('pec')) return 'Chest';
    if (bp.includes('back') || bp.includes('lat') || bp.includes('trap')) return 'Back';
    if (bp.includes('leg') || bp.includes('glute') || bp.includes('quad') ||
        bp.includes('hamstring') || bp.includes('calf') || bp.includes('calve')) return 'Legs';
    if (bp.includes('shoulder') || bp.includes('delt')) return 'Shoulders';
    if (bp.includes('arm') || bp.includes('bicep') || bp.includes('tricep') ||
        bp.includes('forearm')) return 'Arms';
    if (bp.includes('core') || bp.startsWith('ab') || bp.includes('oblique')) return 'Core';
    if (bp.includes('cardio')) return 'Cardio';
    return 'Other';
}

/**
 * Open the add-exercise sheet. `seedFilter` (optional) pre-parks the body-part
 * filter — the freestyle quick-start passes its focus so "Legs" chosen at start
 * is already selected on the first open. Only Legs/Core/Cardio map 1:1 (Push/
 * Pull span several body parts, so they fall back to All). Within one workout
 * the filter then sticks across opens; search always starts blank.
 */
export function awAddExercise(seedFilter = null) {
    awCloseMenus();
    const session = AppState.savedData?.startedAt || null;
    const validSeed = typeof seedFilter === 'string' && AW_EX_CATEGORIES.includes(seedFilter)
        ? seedFilter : null;
    if (session !== addExerciseFilterSession) {
        addExerciseFilterSession = session;
        addExerciseFilter = validSeed || 'All';
    } else if (validSeed) {
        addExerciseFilter = validSeed;
    }
    addExerciseSearch = '';

    // Freestyle memory (lazy) — a RESUMED freestyle session reaches this sheet
    // without startFreestyleWorkout's precompute. Hydrate once in the
    // background, then refresh the list in place. `null` = in-flight guard
    // (the list builder only renders the section for a real array).
    if (AppState.savedData?.isFreestyle && AppState._freestyleRecent === undefined) {
        AppState._freestyleRecent = null;
        (async () => {
            try {
                const [{ loadAllWorkouts }, mem] = await Promise.all([
                    import('../data/data-manager.js'),
                    import('../features/freestyle-memory.js'),
                ]);
                AppState._freestyleRecent = mem.getRecentFreestyleExercises(await loadAllWorkouts(AppState));
                updateAddExerciseList();
            } catch {
                AppState._freestyleRecent = [];
            }
        })();
    }

    renderAddExerciseSheet();
}

/**
 * The add-exercise list inner HTML — ONE builder shared by the initial sheet
 * render and the in-place filter/search updates (they used to duplicate this
 * markup and drift).
 *
 * Sections, in order:
 *   1. "+ Create <typed>" row when the search has no exact match.
 *   2. Freestyle memory — "Recent" (exercises this user actually freestyled
 *      recently, deduped, matching the active body-part filter, minus ones
 *      already in this workout). Only for freestyle sessions, only when not
 *      searching. This is what makes leg-day #10 open onto HIS list instead
 *      of the full library.
 *   3. The filtered library (capped at 50).
 */
function buildAddExerciseListHTML() {
    const library = withWorkoutOnlyExercises(AppState.exerciseDatabase || []);
    let filtered = library;

    if (addExerciseFilter !== 'All') {
        filtered = filtered.filter(ex => awExerciseBucket(ex) === addExerciseFilter);
    }
    if (addExerciseSearch) {
        const q = addExerciseSearch.toLowerCase();
        filtered = filtered.filter(ex =>
            exerciseNameMatches(ex, q)
        );
    }

    // Show an inline "+ Create" row when the search yields no exact match —
    // create + insert in one tap instead of a detour through the library.
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

    let recentHTML = '';
    if (!trimmed && AppState.savedData?.isFreestyle && Array.isArray(AppState._freestyleRecent)) {
        const inWorkout = new Set((AppState.currentWorkout?.exercises || [])
            .map(e => (e.machine || e.name || '').toLowerCase()));
        const recent = AppState._freestyleRecent
            .filter(r => r.name && !inWorkout.has(r.name.toLowerCase()))
            .filter(r => addExerciseFilter === 'All' || awExerciseBucket(r) === addExerciseFilter)
            .slice(0, 5);
        if (recent.length) {
            recentHTML = `<div class="aw-add-ex-group">Recent</div>`
                + recent.map(r => `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(r.name)}')">
                    <span class="aw-add-ex-row__name">${escapeHtml(r.name)}</span>
                    <span class="aw-add-ex-row__cat">${escapeHtml(r.bodyPart || '')}</span>
                </div>`).join('')
                + `<div class="aw-add-ex-group">All exercises</div>`;
        }
    }

    const rowsHTML = filtered.slice(0, 50).map(ex => {
        const name = ex.name || ex.machine || 'Unknown';
        const cat = ex.bodyPart || '';
        return `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(name)}')">
            <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
            <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
        </div>`;
    }).join('');

    return createRowHTML + recentHTML + rowsHTML
        + (filtered.length > 50 ? `<div class="aw-add-ex-truncated">Showing 50 of ${filtered.length} — refine your search</div>` : '')
        + (filtered.length === 0 && !createRowHTML && !recentHTML ? '<div class="aw-add-ex-empty">No exercises found</div>' : '');
}

function renderAddExerciseSheet() {
    const chips = AW_EX_CATEGORIES.map(c =>
        `<button class="aw-sheet__chip ${c === addExerciseFilter ? 'active' : ''}" onclick="awSetAddFilter('${c}')">${c}</button>`
    ).join('');

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search exercises…" value="${escapeAttr(addExerciseSearch)}"
                   oninput="awSetAddSearch(this.value)"
                   onfocus="setTimeout(() => this.scrollIntoView({ block: 'start' }), 200)">
        </div>
        <div class="aw-sheet__chips">${chips}</div>
        <div id="aw-add-exercise-list">${buildAddExerciseListHTML()}</div>
    `;

    openSheet({
        title: 'Add exercise',
        subtitle: `${AppState.currentWorkout.exercises.length} exercises in workout`,
        body,
        actions: [
            { label: 'Close', onClick: 'awCloseSheet()' },
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
    listEl.innerHTML = buildAddExerciseListHTML();
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
    loadAutofillForExercise(idx, { reseed: true, trigger: 'insert' });

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

    // Default the new exercise's body part to the active filter — falls back to
    // 'Chest' when "All" is selected so it lands in a real bucket.
    const bodyPart = addExerciseFilter && addExerciseFilter !== 'All' ? addExerciseFilter : 'Chest';

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const mgr = new FirebaseWorkoutManager(AppState);
        await mgr.saveCustomExercise({
            name,
            machine: name,
            bodyPart,
            equipmentType: 'Machine',
            sets: 3,
            reps: 10,
            weight: 0,
            video: '',
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

export function openSharedAddExerciseSheet({ targetWorkoutLabel, alreadyAdded, onSelect, onCreateRequested, title, gymSection }) {
    if (typeof onSelect !== 'function') {
        console.error('openSharedAddExerciseSheet: onSelect is required');
        return;
    }
    awCloseMenus();
    _sharedAddSearch = '';
    _sharedAddFilter = 'All';
    const addedSet = new Set((alreadyAdded || []).map(n => (n || '').toLowerCase()).filter(Boolean));
    _sharedAddExerciseContext = {
        title: title || 'Add exercise',
        targetWorkoutLabel: targetWorkoutLabel || '',
        alreadyAdded: addedSet,
        onSelect,
        onCreateRequested: typeof onCreateRequested === 'function' ? onCreateRequested : null,
        // F3: optional leading "Possible at [gym]" group — {gym, exercises[]}
        gymSection: gymSection || null,
    };
    renderSharedAddExerciseSheet();
}

function renderSharedAddExerciseSheet() {
    const ctx = _sharedAddExerciseContext;
    if (!ctx) return;

    const chips = AW_EX_CATEGORIES.map(c =>
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
        title: ctx.title || 'Add exercise',
        subtitle: ctx.targetWorkoutLabel,
        body,
        actions: [
            { label: 'Close', onClick: 'awSharedAddCancel()' },
        ],
    });
}

function getFilteredSharedAddExercises() {
    const library = withWorkoutOnlyExercises(AppState.exerciseDatabase || []);
    let filtered = library;
    if (_sharedAddFilter !== 'All') {
        filtered = filtered.filter(ex => awExerciseBucket(ex) === _sharedAddFilter);
    }
    if (_sharedAddSearch) {
        const q = _sharedAddSearch.toLowerCase();
        filtered = filtered.filter(ex => exerciseNameMatches(ex, q));
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
        const cat = ex.bodyPart || '';
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

    // F3: leading "Possible at [gym]" group (same rows, one extra section —
    // D8). Hidden while searching/filtering so results stay tight.
    let gymHtml = '';
    if (ctx.gymSection && !_sharedAddSearch && _sharedAddFilter === 'All'
        && ctx.gymSection.exercises?.length > 0) {
        gymHtml = `
            <div class="aw-add-ex-group-title">Possible at ${escapeHtml(ctx.gymSection.gym)}</div>
            ${ctx.gymSection.exercises.map(renderRow).join('')}
            <div class="aw-add-ex-group-title">All exercises</div>
        `;
    }

    const rowsHtml = gymHtml + slice.map(renderRow).join('');
    const truncated = filtered.length > 50
        ? `<div class="aw-add-ex-truncated">Showing 50 of ${filtered.length} — refine your search</div>`
        : '';

    // "Create [query]" row whenever a query is typed and the caller supports
    // creation — not only on zero results. Gating it on an empty result set
    // meant any partial match ("Cable row" while typing "Cable row wide")
    // hid the row, which read as "no way to save the exercise I created"
    // (8/20 swap-menu reports).
    let createRow = '';
    if (_sharedAddSearch && ctx.onCreateRequested) {
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

/**
 * Convert a set list to `toUnit` in place, each set from its OWN
 * originalUnit (an autofilled set can be in a different unit than the
 * exercise). The typed plate number travels with the total (D7) — left in
 * the old unit, completion would read 120 kg as 120 lbs of plates.
 */
function convertSetsUnit(sets, fallbackFrom, toUnit) {
    for (const set of sets || []) {
        const from = set.originalUnit || fallbackFrom;
        if (set.weight != null && set.weight > 0) set.weight = convertWeight(set.weight, from, toUnit);
        if (typeof set._plateWeight === 'number' && set._plateWeight > 0) {
            set._plateWeight = convertWeight(set._plateWeight, from, toUnit);
        }
        set.originalUnit = toUnit;
    }
}

export function awToggleUnit(exerciseIdx) {
    const current = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';
    const newUnit = current === 'lbs' ? 'kg' : 'lbs';
    if (!AppState.exerciseUnits) AppState.exerciseUnits = {};
    AppState.exerciseUnits[exerciseIdx] = newUnit;

    // Equipment unit memory — remember the flip on the equipment doc so this
    // machine opens in the right unit next session (renderExerciseView reads
    // preferredUnit back). Keyed on the doc, so two same-named machines at
    // different gyms each keep their own. Fire-and-forget: memory is a bonus.
    {
        const memKey = `exercise_${exerciseIdx}`;
        const memSaved = AppState.savedData?.exercises?.[memKey];
        const memEx = AppState.currentWorkout?.exercises?.[exerciseIdx];
        const memDoc = getEquipmentDoc(
            memSaved?.equipment || memEx?.equipment || null,
            memSaved?.equipmentId || memEx?.equipmentId || null);
        if (memDoc?.id && memDoc.preferredUnit !== newUnit) {
            memDoc.preferredUnit = newUnit; // keep the cache in sync immediately
            import('../data/firebase-workout-manager.js')
                .then(({ FirebaseWorkoutManager }) =>
                    new FirebaseWorkoutManager(AppState).updateEquipment(memDoc.id, { preferredUnit: newUnit }))
                .catch(() => { /* offline / race — cache already updated */ });
        }
    }

    // Convert existing set values. Use each set's OWN originalUnit as the
    // source — an autofilled set may be in a different unit than the current
    // exerciseUnits value. Using `current` blindly caused 70 lbs autofill to
    // be mis-converted as if it were 70 kg when the user toggled.
    const key = `exercise_${exerciseIdx}`;
    const savedEx = AppState.savedData.exercises[key];
    convertSetsUnit(savedEx?.sets, current, newUnit);

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
        const equipDoc = getEquipmentDoc(savedEx?.equipment || exercise?.equipment || null, savedEx?.equipmentId || exercise?.equipmentId || null);
        const hasBaseWeight = !isBW && equipDoc && equipDoc.baseWeight > 0;
        let weightLabel = newUnit;
        if (isBW) weightLabel = `Added ${newUnit}`;
        else if (hasBaseWeight) weightLabel = `Plates ${newUnit}`;
        const labels = document.querySelectorAll('.aw-sets-header .aw-sets-header__label');
        if (labels.length >= 3) labels[2].textContent = weightLabel;

        // Update weight inputs to the new unit. Only a typed or logged row
        // has a VALUE; an autofilled row keeps its number in the placeholder
        // (D7: writing it as a value made the next check-off read it as typed
        // and log plates + base).
        const base = hasBaseWeight ? equipDoc.baseWeight : 0;
        (savedEx?.sets || []).forEach((set, setIdx) => {
            const input = document.querySelector(`.aw-set-row[data-set-idx="${setIdx}"] input[data-field="weight"]`);
            if (!input || document.activeElement === input) return;
            const shown = plateRelativeDisplay(set, base);
            if (set._userEdited || set.completed) {
                input.value = shown != null ? shown : '';
            } else {
                input.value = '';
                input.placeholder = shown != null ? shown : newUnit;
            }
        });

        // Re-render the last-session row in place so its summary numbers and
        // unit label reflect the new unit.
        const lastCard = document.querySelector('.aw-last');
        if (lastCard) {
            const cardHtml = renderLastSessionCard(getExerciseName(exercise), exerciseIdx);
            if (cardHtml) lastCard.outerHTML = cardHtml;
        }
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
                { label: '<i class="fas fa-flag-checkered"></i> Finish', onClick: 'awCloseSheet(); awFinishWorkout();' },
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

// SH-3a — every active-workout sheet (equipment, add exercise, superset,
// machine settings, the "All" list…) renders through the shared primitive
// (js/core/ui/sheet.js): keyboard inset, page lock, inert, focus, Escape,
// swipe-down, stacking. Bodies and their handlers are unchanged; the sheet
// keeps id "aw-sheet" so in-place updates (chips, lists) still find it, and
// re-opening it re-renders in place.
function openSheet({ title, titleColor, subtitle, body, actions }) {
    openSheetPrimitive({
        id: 'aw-sheet', titleHTML: title, titleColor, subtitle, bodyHTML: body, actions,
    });
}

function closeSheetImmediate() {
    closeSheet('aw-sheet', { immediate: true });
}

export function awCloseSheet() {
    closeSheet('aw-sheet');
}

// ===================================================================
// AUTOFILL — load last session defaults for all exercises
// ===================================================================

export async function loadAutofillForAllExercises({ trigger = 'start', reseed = false } = {}) {
    const exercises = AppState.currentWorkout.exercises;
    for (let i = 0; i < exercises.length; i++) {
        await loadAutofillForExercise(i, { trigger, reseed });
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
    exerciseIdx,
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

    // Skip supersets — the equipment surfaced is legitimately shared with a
    // grouped partner exercise (Calf Raise + Leg Press was the 7/2 false
    // positive). Explicit group on the exercise OR on savedEx.
    const exercise = AppState.currentWorkout?.exercises?.[exerciseIdx];
    const savedEx = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`];
    if (exercise?.group || savedEx?.group) return;

    const cachedEquipment = Array.isArray(AppState._cachedEquipment) ? AppState._cachedEquipment : [];
    const surfacedLC = surfaced.toLowerCase();
    const match = cachedEquipment.find(e => (e.name || '').toLowerCase() === surfacedLC);

    // Workout-partner heuristic: if the surfaced equipment is assigned to
    // ANY exercise in the current workout, it's likely a legitimate
    // relationship — either implicit superset that lost the group flag or
    // shared-equipment cluster. Also covers the case where the current
    // workout template has this equipment on another exercise.
    const workoutExercises = AppState.currentWorkout?.exercises || [];
    const surfacedIsWorkoutPartner = workoutExercises.some((ex, i) => {
        if (i === exerciseIdx) return false;
        const partnerEq = AppState.savedData?.exercises?.[`exercise_${i}`]?.equipment
            || ex.equipment
            || null;
        return partnerEq && partnerEq.toLowerCase() === surfacedLC;
    });
    if (surfacedIsWorkoutPartner) return;

    const missingFromLibrary = !match;
    const locationMismatch = !!queryLocation && !!match &&
        !(match.locations || []).some(l => l && l.toLowerCase() === queryLocation.toLowerCase());
    const notLinkedToExercise = !!match &&
        !(match.exerciseTypes || []).some(n => n && n.toLowerCase() === exerciseName.toLowerCase());

    // Only trigger on GENUINE leak signals: equipment doesn't exist in the
    // library, or it exists but isn't linked to this exercise. Location
    // mismatch alone is not a leak — it's the location fallback tier
    // working as designed (user at gym A, no history there, fell back to
    // gym B session). Kept in context if some other signal fires so the
    // resolution chain is visible.
    if (!missingFromLibrary && !notLinkedToExercise) return;

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
    } catch {
        // Diagnostic must never break autofill.
    }
}

// Per-slot generation counter: a newer autofill for the same exercise slot
// supersedes an older one still waiting on the network. Without it, quick
// A→B→C taps let the last resolver own the card and the first own the rows.
const _autofillGen = new Map();

/** Which path asked for an autofill — rides on every autofill_trace (AP-2). */
const AUTOFILL_TRIGGERS = ['start', 'resume', 'edit', 'equipment', 'replace', 'insert', 'location', 'coach', 'intent'];

/**
 * One structured autofill_trace per prefill (AP-2): what was asked, what the
 * history lookup returned, and whether rows were seeded (and if not, why).
 * Quiet + session-only, so it lands on the Error Log page for "screenshot
 * this when it looks wrong" without touching the badge or the persisted
 * store. Diagnostic must never break autofill.
 */
async function logAutofillTrace(trace) {
    try {
        const { captureTrace } = await import('../utils/error-handler.js');
        captureTrace(`autofill_trace: ${trace.exerciseName} · ${trace.trigger}`, 'loadAutofillForExercise', trace);
    } catch {
        // never break autofill
    }
}

/**
 * Load last-session history for one exercise and seed its set rows.
 *
 * `reseed` is for paths that CHANGE what the slot is (replace, add, switch
 * machine): render has already padded blank rows by then, so every untouched
 * row is replaced from the new history. Start/resume leave it off — there a
 * row with numbers in it may be a program adjustment that re-seeding from raw
 * history would undo, so only all-blank rows get filled.
 *
 * `trigger` names the path (AUTOFILL_TRIGGERS) for the trace.
 */
export async function loadAutofillForExercise(idx, { reseed = false, trigger = null } = {}) {
    const exercise = AppState.currentWorkout.exercises[idx];
    if (!exercise) return;
    const t0 = Date.now();
    const gen = (_autofillGen.get(idx) || 0) + 1;
    _autofillGen.set(idx, gen);
    const superseded = () => _autofillGen.get(idx) !== gen;
    const exName = getExerciseName(exercise);
    const key = `exercise_${idx}`;
    const savedEx = AppState.savedData?.exercises?.[key];
    // AP-6: what today's session is for (deload / heavy / build). Set once at
    // start or resume; every seed and nudge below reads it.
    const intent = AppState.savedData?.sessionIntent || null;
    // Prefer the equipment the USER actually picked for this exercise (which
    // lives on savedEx after awSelectEquipment) over the template's default.
    // Without this, autofill ran with the template's stale equipment and
    // overwrote whatever the user just chose — and on a reordered exercise it
    // could point to a machine that wasn't even at the current gym.
    const equipName = savedEx?.equipment || exercise.equipment || null;
    const equipId = savedEx?.equipment ? (savedEx.equipmentId || null) : (exercise.equipmentId || null);
    // Location-aware autofill: prefer last-session matches at the current gym
    // so users on multiple gyms get the right numbers for "this exercise here".
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;

    const trace = {
        exerciseIdx: idx,
        exerciseName: exName,
        trigger: AUTOFILL_TRIGGERS.includes(trigger) ? trigger : (trigger || 'unknown'),
        gen,
        reseed,
        superseded: false,
        queryEquipment: equipName,
        queryEquipmentId: equipId,
        queryLocation: locName || null,
        queryLocationType: typeof sessionLoc,
        intent: intent ? { mode: intent.mode, source: intent.source, weightPct: intent.weightPct ?? null } : null,
        resolved: null,
        seed: null,
        unit: {
            exerciseUnit: AppState.exerciseUnits?.[idx] || null,
            globalUnit: AppState.globalUnit || null,
        },
        durationMs: null,
    };
    const finishTrace = () => {
        trace.durationMs = Date.now() - t0;
        logAutofillTrace(trace);
    };
    const bail = () => {
        trace.superseded = true;
        finishTrace();
    };

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
        if (superseded()) return bail();
    }

    // Equipment-change call sites pass a stale `_lastSessionSets` from the
    // previous equipment. Clear it so the card doesn't flash old data while
    // the new query is in flight, and so a null result on the new equipment
    // genuinely hides the card instead of leaving stale data on screen.
    delete exercise._lastSessionSets;
    delete exercise._lastSessionDaysAgo;
    delete exercise._lastSessionEquipment;
    delete exercise._overloadNudge;
    delete exercise._progression;
    delete exercise._rotateSuggestion;
    delete exercise._lastSessionOtherMachine;
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
    } catch {
        exercise._formVideoUrl = null;
    }
    if (superseded()) return bail();

    try {
        // preferBuild: seed from the last NON-deload session when one exists
        // (a deload's 65% rows must not become next week's starting point).
        const lastSession = await getLastSessionDefaults(exName, equipName, locName, equipId, { preferBuild: true });
        if (superseded()) return bail();
        // History from a DIFFERENT machine stays on the card as a labelled
        // reference ("from X") but never seeds the rows or a bump target —
        // a new machine starts fresh (10/23: "for prefill, I'd just start fresh").
        const sameMachine = historyFromSameMachine(equipName, equipId, lastSession);
        trace.resolved = lastSession ? {
            found: true,
            tier: lastSession.tier || null,
            cacheHit: !!lastSession.cacheHit,
            sameMachine,
            equipment: lastSession.equipment || null,
            equipmentId: lastSession.equipmentId || null,
            location: lastSession.location || null,
            date: lastSession.date || null,
            recovery: !!lastSession.recovery,
            setsCount: (lastSession.sets || []).length,
            sourceUnits: [...new Set((lastSession.sets || []).map(s => s.originalUnit || 'lbs'))],
            platesKnownCount: (lastSession.sets || []).filter(s => typeof s._plateWeight === 'number' && s._equipBaseWeight > 0).length,
        } : { found: false };
        trace.baseWeight = getEquipmentDoc(equipName, equipId)?.baseWeight || 0;
        // Silent health check: if the surfaced last-session equipment
        // doesn't exist in the user's library, or came from an exercise
        // history record that never actually linked this equipment, that's
        // an equipment-leak signal (the 6/9 report class). Auto-log with
        // the full resolution chain so I can see any remaining leak paths
        // my write-side fix didn't close. Non-blocking, best-effort.
        maybeLogEquipmentLeak({
            exerciseIdx: idx,
            exerciseName: exName,
            queryEquipment: equipName,
            queryLocation: locName,
            lastSession,
            templateEquipment: exercise.equipment || null,
            userPickedEquipment: savedEx?.equipment || null,
        });
        if (lastSession && lastSession.sets) {
            exercise._lastSessionSets = lastSession.sets;
            exercise._lastSessionDate = lastSession.date || null;
            // Capture the source equipment so the card can show "from <other
            // machine>" when the strict-match-failed fallback fired.
            exercise._lastSessionEquipment = lastSession.equipment || null;
            exercise._lastSessionOtherMachine = !sameMachine;
            // Calculate days ago from the date string (YYYY-MM-DD)
            if (lastSession.date) {
                const sessionDate = new Date(lastSession.date + 'T12:00:00');
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                exercise._lastSessionDaysAgo = Math.round((today - sessionDate) / (1000 * 60 * 60 * 24));
            }

            // No progression target off another machine's numbers.
            if (sameMachine) {
                // Smart overload nudge — multi-session progression coaching for the
                // last-session card. Reads the cached workout log (cheap); a failure
                // just leaves the simple last-session fallback in renderLastSessionCard.
                try {
                    const allWorkouts = await loadAllWorkouts(AppState);
                    trace.allWorkoutsCount = Array.isArray(allWorkouts) ? allWorkouts.length : null;
                    const nudgeUnit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';
                    // Deload sessions are left out (AP-7) — a light week isn't a strength signal.
                    // AU-12 — this machine's series only (sameMachine already gates the nudge).
                    const sessions = buildExerciseSessions(allWorkouts, exName, nudgeUnit, {
                        machine: equipName || equipId ? { name: equipName, id: equipId } : null,
                    });
                    const repTarget = exercise.defaultReps || exercise.reps || null;
                    // Plate-aware jump: without 2.5s the smallest real barbell
                    // move is 10, not 5 — one increment feeds BOTH the advisory
                    // string and the seeded targets so they can never disagree.
                    const plates = nudgeUnit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
                    const progInc = weightIncrement(nudgeUnit, plates);
                    exercise._progressionInc = progInc;
                    exercise._progressionSessions = sessions; // AU-3: plate-relative card nudge
                    // AU-11 (2/2) — set rows (and live mode, which reads _progression) pass today:
                    // a lift untouched for 6+ weeks restarts at its last weight.
                    const todayStr = AppState.getTodayDateString?.() || null;
                    exercise._overloadNudge = computeOverloadNudge(sessions, nudgeUnit, repTarget, progInc, intent, todayStr);
                    // 5.7.3 — structured target next to the advisory string: today's
                    // recommended weight/reps + a stall flag. A deload intent
                    // short-circuits to action 'deload' (no bump, no stall rung).
                    exercise._progression = progressionTarget(sessions, nudgeUnit, repTarget, progInc, intent, todayStr);
                    // CP-4 — stall rung 3 hands off to the variety engine: name
                    // the stalest same-pattern machine at this gym in the nudge.
                    // Equipment may not be cached yet; then the plain string stands.
                    if (exercise._progression?.rotate && Array.isArray(AppState._cachedEquipment)) {
                        const library = AppState.exerciseDatabase || [];
                        const { swaps } = selectRotation({
                            exercises: [{ machine: exName, role: 'accessory', equipment: AppState.savedData?.exercises?.[key]?.equipment || exercise.equipment }],
                            equipment: AppState._cachedEquipment, location: locName || null,
                            lookup: (n) => library.find(e => (e.name || e.machine) === n),
                        });
                        if (swaps[0]) {
                            exercise._rotateSuggestion = swaps[0];
                            exercise._overloadNudge = `${exercise._progression.weight} ${nudgeUnit} has had its run — swap in ${swaps[0].to} (${swaps[0].equipment}, ${swaps[0].reason})`;
                        }
                    }
                } catch (e) {
                    debugLog('overload nudge failed', e);
                }
            }
            if (superseded()) return bail();
        }

        if (!AppState.savedData.exercises[key]) {
            AppState.savedData.exercises[key] = { sets: [] };
        }
        const sx = AppState.savedData.exercises[key];

        // Copy equipment from template ONLY if the user hasn't already
        // chosen something. Overwriting sx.equipment unconditionally was
        // the source of the "machines linked to exercises that don't have
        // them" report after a reorder — autofill clobbered the user's
        // pick with the template's default.
        if (!sx.equipment && exercise.equipment && !sx.equipmentExplicitNone) sx.equipment = exercise.equipment;
        // If the user hasn't picked equipment AND there's no template
        // default, but the last session at this gym used something, adopt
        // that. Makes "no equipment set" workflows pull through cleanly.
        // Only adopt history equipment that still resolves to a real
        // library doc. An unresolvable name is exactly the "started as
        // the wrong machine" leak: on 7/21 "Pec Deck" surfaced "Gymleco",
        // which matched nothing in the library (missingFromLibrary), yet
        // was written onto the exercise as though the user had picked it.
        if (!sx.equipment && !sx.equipmentExplicitNone && lastSession?.equipment && lastSession.location === locName) {
            const adopted = getEquipmentDoc(lastSession.equipment, lastSession.equipmentId || null);
            if (adopted) {
                sx.equipment = adopted.name || lastSession.equipment;
                // Name and id move together (D5) — an adopted name with a
                // stale or missing id sent id-first resolvers to the wrong doc.
                sx.equipmentId = adopted.id || null;
            }
        }
        if (exercise.group) sx.group = exercise.group;
        // A deload week's effort cap shows as the RPE "aim" whatever path started it.
        if (intent?.mode === 'deload' && intent.rpeTarget && !exercise._rpeTarget) exercise._rpeTarget = intent.rpeTarget;

        const fromHistory =!!(lastSession && lastSession.sets && sameMachine);
        const progUnit = AppState.exerciseUnits?.[idx] || AppState.globalUnit || 'lbs';
        const seeded = fromHistory
            ? seedSetsFromLastSession(
                lastSession.sets, exercise._progression, intent, progUnit,
                exercise._progressionInc || (progUnit === 'kg' ? 2.5 : 5),
                { alreadyLight: !!lastSession.recovery, fallbackUnit: AppState.globalUnit || 'lbs', fromTarget: seedFromTarget(exercise, lastSession) })
            // No history on this machine — template defaults. The template's
            // weight only when there's no history anywhere (a NEW machine
            // starts fresh) and the gear has no base weight (a template
            // number can't say whether it's plates or a total).
            : seedSetsFromTemplate(exercise, intent, {
                useTemplateWeight: !lastSession && !(getEquipmentDoc(equipName, equipId)?.baseWeight > 0),
                inc: exercise._progressionInc || weightIncrement(progUnit, progUnit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs),
                unit: progUnit,
            });

        const before = sx.sets || [];
        const allBlank = before.every(isBlankSet);
        trace.seed = {
            source: fromHistory ? 'history' : 'template',
            setsBefore: before.length,
            untouchedBefore: before.filter(s => !isTouchedSet(s)).length,
            attempted: reseed || allBlank,
            setsSeeded: 0,
            reasonNotSeeded: null,
        };
        if (reseed || allBlank) {
            sx.sets = mergeSeededSets(sx.sets, seeded);
            trace.seed.setsSeeded = sx.sets.filter(s => !isTouchedSet(s)).length;
        } else {
            trace.seed.reasonNotSeeded = 'rows already hold numbers (start/resume keeps them)';
        }
        // ?debug overlay + mismatch check read this (AP-2).
        exercise._autofillDebug = {
            trigger: trace.trigger, gen,
            query: equipName || null,
            from: lastSession?.equipment || null,
            tier: lastSession?.tier || null,
            sameMachine,
            source: trace.seed.source,
            seeded: trace.seed.setsSeeded,
            total: (sx.sets || []).length,
            recovery: !!lastSession?.recovery,
            seedUnit: progUnit,
            intent: intent?.mode || 'build',
        };
    } catch (err) {
        debugLog('Autofill failed for', exName, err);
        trace.error = err?.message || String(err);
    }

    finishTrace();

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
    if (exercise.equipment || exercise.equipmentId) {
        const eq = getEquipmentDoc(exercise.equipment, exercise.equipmentId);
        if (eq?.equipmentType === 'Bodyweight') return true;
    }
    const name = exercise.machine || exercise.name || '';
    return BODYWEIGHT_PATTERNS.test(name);
}

export function startDurationTimer() {
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
/**
 * AP-10 — flag THIS session as a deload (or undo it) without a program.
 * Rewrites the intent, then re-seeds every untouched row so the numbers on
 * screen follow: lighter with ↓ markers, or back to last time's targets.
 * Logged and typed sets are never touched.
 */
export async function awToggleSessionDeload() {
    if (!AppState.savedData) return;
    const { sessionOnlyDeloadIntent, MANUAL_DELOAD_WEIGHT_PCT } = await import('../features/session-intent.js');
    const wasDeload = AppState.savedData.sessionIntent?.mode === 'deload';
    if (wasDeload) {
        AppState.savedData.sessionIntent = {
            mode: 'build', weightPct: null, setDelta: null, repRange: null, rpeTarget: null,
            label: null, week: null, weeks: null, source: 'none', reason: 'Lighter session turned off',
        };
        if (/deload|recovery|light(?:er)? (?:week|session)/i.test(AppState.savedData.sessionLabel || '')) delete AppState.savedData.sessionLabel;
    } else {
        AppState.savedData.sessionIntent = sessionOnlyDeloadIntent();
        AppState.savedData.sessionLabel = 'Lighter session';
    }
    haptic('tap');
    await loadAutofillForAllExercises({ trigger: 'intent', reseed: true });
    renderAll();
    debouncedSaveWorkoutData(AppState);
    showNotification(wasDeload
        ? 'Back to a normal session'
        : `Lighter session — open sets are ${Math.abs(MANUAL_DELOAD_WEIGHT_PCT)}% lighter`, 'success', 2500);
}

export function getCurrentExerciseIdx() { return currentExerciseIdx; }
export function setCurrentExerciseIdx(idx) { currentExerciseIdx = idx; }

// Same-file window wiring for handlers rendered only by this module's own
// template strings — immune to main.js version skew (prod caches JS 1 year).
window.awOpenCatalogQuickAdd = awOpenCatalogQuickAdd;
window.awSharedOpenCatalogQuickAdd = awSharedOpenCatalogQuickAdd;
window.awSkipEquipment = awSkipEquipment;
window.awEquipFreeWeights = awEquipFreeWeights;
window.awEquipFastPath = awEquipFastPath;
window.awSharedEquipFreeWeights = awSharedEquipFreeWeights;
window.awSharedEquipFastPath = awSharedEquipFastPath;
window.awPickSuggestedMachine = awPickSuggestedMachine;
window.awAddCatalogMachine = awAddCatalogMachine;
window.awEquipAddCreate = awEquipAddCreate;
window.awEquipAddUseExisting = awEquipAddUseExisting;
window.awEquipAddExpand = awEquipAddExpand;
window.awEquipAddCollapse = awEquipAddCollapse;
window.awEquipAddField = awEquipAddField;
window.awEquipAddCommitForm = awEquipAddCommitForm;
window.awToggleSessionDeload = awToggleSessionDeload;
window.awSharedAddCatalogMachine = awSharedAddCatalogMachine;
window.awQuickEditEquipment = awQuickEditEquipment;
window.awOpenSettingsSheet = awOpenSettingsSheet;
window.awSettingsField = awSettingsField;
window.awSettingsAdd = awSettingsAdd;
window.awSettingsRemove = awSettingsRemove;
window.awSaveSettingsSheet = awSaveSettingsSheet;
