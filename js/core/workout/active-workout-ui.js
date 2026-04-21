// Active Workout V2 — Wizard-style one-exercise-at-a-time UI
// Main controller: header, pills, hero, equipment, last session, set rows, footer

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, convertWeight, openModal, closeModal } from '../ui/ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { getCategoryIcon, Config, debugLog } from '../utils/config.js';
import { getSetTotalWeight, getSetVolume } from '../utils/weight-calculations.js';
import { debouncedSaveWorkoutData, saveWorkoutData, getLastSessionDefaults, clearLastSessionCache } from '../data/data-manager.js';
import { getNextInGroup, getExerciseGroups, isLastInGroupRound, groupExercises, ungroupExercise } from '../features/superset-manager.js';
import { haptic } from '../utils/haptics.js';
import { navigateTo, setWorkoutActiveState } from '../ui/navigation.js';
import { ensureFreshBodyWeight } from '../features/bodyweight-prompt.js';

// ===================================================================
// STATE
// ===================================================================

let currentExerciseIdx = 0;
let exerciseMenuOpen = false;
let workoutMenuOpen = false;
let durationInterval = null;
let elapsedSeconds = 0;

// Rest timer state
let restTimerInterval = null;
let restTimerRemaining = 0;
let restTimerDuration = 0;
let restTimerActive = false;

// Track if exercises were reordered for template save prompt
let exercisesReordered = false;

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
    let pairedExercises = [];
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
            <button class="aw-menu" onclick="awToggleWorkoutMenu()">
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
                <i class="fas fa-plus"></i> Add Exercise
            </button>
            <button class="aw-ex-menu__item" onclick="saveActiveWorkoutAsTemplate(); awCloseMenus();">
                <i class="fas fa-bookmark"></i> Save as Template
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item" onclick="showMidWorkoutSummary(); awCloseMenus();">
                <i class="fas fa-chart-bar"></i> Session Summary
            </button>
            <button class="aw-ex-menu__item" onclick="exportWorkoutDataAsCSV(); awCloseMenus();">
                <i class="fas fa-file-export"></i> Export Session
            </button>
            <div class="aw-ex-menu__divider"></div>
            <button class="aw-ex-menu__item danger" onclick="awCancelWorkout()">
                <i class="fas fa-times"></i> Cancel Workout
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
    // Truncate to ~12 chars for pill display
    return name.length > 14 ? name.substring(0, 12) + '…' : name;
}

// ===================================================================
// REST TIMER BANNER
// ===================================================================

function renderRestTimerBanner() {
    const pct = restTimerDuration > 0 ? ((restTimerDuration - restTimerRemaining) / restTimerDuration * 100) : 0;
    return `
        <div class="aw-rest-timer ${restTimerActive ? '' : 'hidden'}" id="aw-rest-banner" onclick="awEditRestDuration()">
            <div class="aw-rest-timer__icon"><i class="fas fa-clock"></i></div>
            <div class="aw-rest-timer__info">
                <span class="aw-rest-timer__label">Rest</span>
                <span class="aw-rest-timer__time" id="aw-rest-time">${formatTimer(restTimerRemaining)}</span>
            </div>
            <div class="aw-rest-timer__controls">
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestAdd30()">+30s</button>
                <button class="aw-rest-timer__btn" onclick="event.stopPropagation(); awRestSkip()">Skip</button>
            </div>
            <div class="aw-rest-timer__bar">
                <div class="aw-rest-timer__bar-fill" id="aw-rest-fill" style="--rest-pct: ${pct}%"></div>
            </div>
        </div>
    `;
}

function startRestTimer(duration) {
    clearRestTimer();
    restTimerDuration = duration || Config.DEFAULT_REST_TIMER_SECONDS;
    restTimerRemaining = restTimerDuration;
    restTimerActive = true;

    // Show banner
    const banner = document.getElementById('aw-rest-banner');
    if (banner) banner.classList.remove('hidden');
    updateRestTimerDisplay();

    restTimerInterval = setInterval(() => {
        restTimerRemaining--;
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
    haptic('complete');

    const banner = document.getElementById('aw-rest-banner');
    if (banner) {
        banner.classList.add('flash');
        setTimeout(() => banner.classList.add('hidden'), 600);
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
    restTimerRemaining += 30;
    restTimerDuration += 30;
    updateRestTimerDisplay();
}

export function awRestSkip() {
    clearRestTimer();
    restTimerActive = false;
    restTimerRemaining = 0;
    const banner = document.getElementById('aw-rest-banner');
    if (banner) banner.classList.add('hidden');
}

export function awEditRestDuration() {
    // Tap timer body — no-op for now (could open duration picker)
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

    // Context banner: BW banner for bodyweight, equipment line for everything else
    let contextBanner;
    if (isBW) {
        contextBanner = renderBWBanner();
    } else {
        contextBanner = renderEquipLine(equipmentName, idx);
    }

    // Same set table for ALL exercise types — always Reps | Weight | ✓
    const sets = buildSetRows(exercise, idx, savedEx, unit);

    // Autofill hint: show only the first time it appears per workout session.
    // After the user sees the explanation once, subsequent exercises with autofill
    // don't repeat it (the dashed styling is enough of a cue after first exposure).
    const showAutofillHint = sets.hasAutofill && !AppState._autofillHintShown;
    if (showAutofillHint) AppState._autofillHintShown = true;

    // Weight column label
    let weightLabel = unit;
    if (isBW) weightLabel = `Added ${unit}`;
    else if (hasBaseWeight) weightLabel = `Plates ${unit}`;

    return `
        <div class="aw-hero">
            <div class="aw-hero__top">
                <div class="aw-hero__icon tint-${category}"><i class="${iconClass}"></i></div>
                <div class="aw-hero__name">
                    <div class="aw-hero__title">${escapeHtml(exName)}</div>
                    <div class="aw-hero__sub">${completedSets > 0 ? `Set ${completedSets} done · ${remaining} left` : `${targetSets} sets · ${targetReps} reps target`}</div>
                </div>
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
            <button class="aw-sets-header__unit" onclick="awToggleUnit(${idx})" title="Tap to switch unit">${unit}</button>
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
            <button class="aw-equip-line__change" onclick="awOpenEquipmentSheet(${idx})">Change</button>
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

function renderLastSessionCard(exerciseName, idx) {
    // Check if we have cached last session data on the exercise
    const exercise = AppState.currentWorkout.exercises[idx];
    const lastDefaults = exercise._lastSessionSets;
    if (!lastDefaults || lastDefaults.length === 0) return '';

    const daysAgo = exercise._lastSessionDaysAgo || '?';
    const daysLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

    const summary = lastDefaults.map(s => {
        const w = s.weight || 0;
        const r = s.reps || 0;
        return `${w}×${r}`;
    }).join(' · ');

    return `
        <div class="aw-last">
            <i class="fas fa-history"></i>
            <div class="aw-last__info">
                <div class="aw-last__label">Last session · ${daysLabel}</div>
                <div class="aw-last__val">${summary}</div>
            </div>
        </div>
    `;
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

        const weightVal = set._userEdited || set.completed ? (set.weight ?? '') : '';
        const repsVal = set._userEdited || set.completed ? (set.reps ?? '') : '';
        const weightPlaceholder = !set._userEdited && !set.completed && set.weight != null ? set.weight : unitLabel;
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
                       onchange="awUpdateSet(${idx}, ${si}, 'reps', this.value)">
                <input class="aw-set-row__input ${isAutofill ? 'autofill' : ''} ${set.completed ? 'done-val' : ''}"
                       type="number" inputmode="decimal" step="0.5"
                       data-field="weight"
                       value="${weightVal}"
                       placeholder="${weightPlaceholder}"
                       ${set.completed ? 'readonly' : ''}
                       onchange="awUpdateSet(${idx}, ${si}, 'weight', this.value)">
                <button class="aw-set-row__check ${set.completed ? 'done' : ''}"
                        onclick="awToggleSet(${idx}, ${si})">
                    <i class="${set.completed ? 'fas fa-check' : 'far fa-circle'}"></i>
                </button>
            </div>
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
                <i class="fas fa-exchange-alt"></i> Swap Exercise
            </button>
            <button class="aw-ex-menu__item" onclick="awOpenEquipmentSheet(${idx})">
                <i class="fas fa-cog"></i> Change Equipment
            </button>
            <div class="aw-ex-menu__divider"></div>
            ${group
                ? `<button class="aw-ex-menu__item" onclick="awUnlinkSuperset(${idx})"><i class="fas fa-unlink"></i> Unlink from superset</button>`
                : ''
            }
            <button class="aw-ex-menu__item danger" onclick="awDeleteExercise(${idx})">
                <i class="fas fa-trash"></i> Remove Exercise
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
    const isLast = currentExerciseIdx === exercises.length - 1;
    const savedEx = AppState.savedData?.exercises?.[`exercise_${currentExerciseIdx}`] || {};
    const allDone = isLast && (savedEx.sets || []).every(s => s.completed) && (savedEx.sets || []).length > 0;

    return `
        <div class="aw-footer">
            <button class="aw-footer__list-btn" onclick="awOpenJumpSheet()">
                <i class="fas fa-list"></i> All
            </button>
            <button class="aw-footer__next ${allDone ? 'finish' : ''}" onclick="${allDone ? 'awFinishWorkout()' : 'awNextExercise()'}">
                ${allDone
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
    if (currentExerciseIdx < exercises.length - 1) {
        awJumpTo(currentExerciseIdx + 1);
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
        if (row) {
            const inputs = row.querySelectorAll('input');
            if (inputs[0]) set.reps = parseInt(inputs[0].value, 10) || set.reps || 0;
            if (inputs[1]) set.weight = parseFloat(inputs[1].value) || set.weight || 0;
        }
        set.completed = true;
        set._userEdited = true;
        set.originalUnit = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';

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

            if (isLastInRound) {
                startRestTimer(Config.DEFAULT_REST_TIMER_SECONDS);
            }

            if (nextIdx !== null && nextIdx !== exerciseIdx) {
                currentExerciseIdx = nextIdx;
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

export function awToggleExerciseMenu(idx) {
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
        const oldKey = `exercise_${i >= idx ? i + 1 : i}`;
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
    if (!confirm('Cancel this workout? All progress will be lost.')) return;
    AppState.savedData.cancelledAt = new Date().toISOString();
    saveWorkoutData(AppState);
    cleanup();
    setWorkoutActiveState(false);
    window.inProgressWorkout = null;
    navigateTo('dashboard');
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

    // Flag reorder so completeWorkout's template detection picks it up
    if (exercisesReordered) {
        window._awExercisesReordered = true;
    }

    cleanup();
    exercisesReordered = false;

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

let selectedForSuperset = new Set();

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

export async function awOpenEquipmentSheet(exerciseIdx) {
    exerciseMenuOpen = false;
    equipSearchQuery = '';

    // Ensure equipment is loaded (lazy-load on first use)
    if (!AppState._cachedEquipment || AppState._cachedEquipment.length === 0) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const mgr = new FirebaseWorkoutManager(AppState);
            AppState._cachedEquipment = await mgr.getUserEquipment();
        } catch (e) {
            debugLog('Failed to load equipment:', e);
            AppState._cachedEquipment = [];
        }
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

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search equipment…" value="${escapeAttr(equipSearchQuery)}" oninput="awEquipSearch(${exerciseIdx}, this.value)">
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
            { label: '<i class="fas fa-plus"></i> New', onClick: `awQuickAddEquipment(${exerciseIdx})` },
            { label: 'Done', onClick: 'awCloseSheet()', primary: true },
        ],
    });
}

export function awEquipSearch(exerciseIdx, query) {
    equipSearchQuery = query;
    // Re-render just the list content, preserving the search input focus
    const listEl = document.getElementById('aw-equip-list');
    if (!listEl) return;

    const exercise = AppState.currentWorkout.exercises[exerciseIdx];
    const exName = getExerciseName(exercise);
    const currentEquip = AppState.savedData?.exercises?.[`exercise_${exerciseIdx}`]?.equipment || exercise.equipment;
    const sessionLoc = AppState.savedData?.location;
    const locName = typeof sessionLoc === 'object' ? sessionLoc?.name : sessionLoc;
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
        showNotification('Failed to create equipment', 'error');
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

    const body = `
        <div class="field-search field-search--sticky">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search exercises…" value="${escapeAttr(addExerciseSearch)}" oninput="awSetAddSearch(this.value)">
        </div>
        <div class="aw-sheet__chips">${chips}</div>
        <div id="aw-add-exercise-list">
            ${filtered.slice(0, 50).map(ex => {
                const name = ex.name || ex.machine || 'Unknown';
                const cat = ex.category || '';
                return `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(name)}')">
                    <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
                    <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
                </div>`;
            }).join('')}
            ${filtered.length > 50 ? `<div class="aw-add-ex-truncated">Showing 50 of ${filtered.length} — refine your search</div>` : ''}
            ${filtered.length === 0 ? '<div class="aw-add-ex-empty">No exercises found</div>' : ''}
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

    listEl.innerHTML = filtered.slice(0, 50).map(ex => {
        const name = ex.name || ex.machine || 'Unknown';
        const cat = ex.category || '';
        return `<div class="aw-add-ex-row" onclick="awInsertExercise('${escapeAttr(name)}')">
            <span class="aw-add-ex-row__name">${escapeHtml(name)}</span>
            <span class="aw-add-ex-row__cat">${escapeHtml(cat)}</span>
        </div>`;
    }).join('') || '<div class="aw-sheet__empty aw-sheet__empty--large">No exercises found</div>';
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

// ===================================================================
// UNIT TOGGLE
// ===================================================================

export function awToggleUnit(exerciseIdx) {
    const current = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs';
    const newUnit = current === 'lbs' ? 'kg' : 'lbs';
    if (!AppState.exerciseUnits) AppState.exerciseUnits = {};
    AppState.exerciseUnits[exerciseIdx] = newUnit;

    // Convert existing set values
    const key = `exercise_${exerciseIdx}`;
    const savedEx = AppState.savedData.exercises[key];
    if (savedEx?.sets) {
        savedEx.sets.forEach(set => {
            if (set.weight != null && set.weight > 0) {
                set.weight = convertWeight(set.weight, current, newUnit);
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

    // Track reorder for template save prompt
    exercisesReordered = true;

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

let sheetOpen = false;

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

    sheetOpen = true;
}

function closeSheetImmediate() {
    const backdrop = document.getElementById('aw-sheet-backdrop');
    const sheet = document.getElementById('aw-sheet');
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
    sheetOpen = false;
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
    sheetOpen = false;
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

async function loadAutofillForExercise(idx) {
    const exercise = AppState.currentWorkout.exercises[idx];
    if (!exercise) return;
    const exName = getExerciseName(exercise);
    const equipName = exercise.equipment || null;

    try {
        const lastSession = await getLastSessionDefaults(exName, equipName);
        if (lastSession && lastSession.sets) {
            exercise._lastSessionSets = lastSession.sets;
            // Calculate days ago from the date string (YYYY-MM-DD)
            if (lastSession.date) {
                const sessionDate = new Date(lastSession.date + 'T12:00:00');
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                exercise._lastSessionDaysAgo = Math.round((today - sessionDate) / (1000 * 60 * 60 * 24));
            }

            // Pre-fill saved data sets if not already filled
            const key = `exercise_${idx}`;
            if (!AppState.savedData.exercises[key]) {
                AppState.savedData.exercises[key] = { sets: [] };
            }
            const savedEx = AppState.savedData.exercises[key];

            // Copy equipment and group from template
            if (exercise.equipment) savedEx.equipment = exercise.equipment;
            if (exercise.group) savedEx.group = exercise.group;

            if (!savedEx.sets || savedEx.sets.length === 0) {
                savedEx.sets = lastSession.sets.map(s => ({
                    weight: (s.weight && s.weight > 0) ? s.weight : null,
                    reps: (s.reps && s.reps > 0) ? s.reps : null,
                    completed: false,
                    originalUnit: s.originalUnit || AppState.globalUnit || 'lbs',
                }));
            }
        } else {
            // No last session — initialize empty sets from template defaults
            const key = `exercise_${idx}`;
            if (!AppState.savedData.exercises[key]) {
                AppState.savedData.exercises[key] = { sets: [] };
            }
            const savedEx = AppState.savedData.exercises[key];
            if (exercise.equipment) savedEx.equipment = exercise.equipment;
            if (exercise.group) savedEx.group = exercise.group;

            if (!savedEx.sets || savedEx.sets.length === 0) {
                const targetSets = exercise.sets || 3;
                savedEx.sets = Array.from({ length: targetSets }, () => ({
                    weight: exercise.defaultWeight || null,
                    reps: exercise.defaultReps || null,
                    completed: false,
                }));
            }
        }
    } catch (err) {
        debugLog('Autofill failed for', exName, err);
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
    elapsedSeconds = 0;

    // Calculate elapsed from start time
    if (AppState.workoutStartTime) {
        elapsedSeconds = Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 1000);
    }

    durationInterval = setInterval(() => {
        elapsedSeconds++;
        // Surgically update just the elapsed number — no re-render, no meta rewrite
        const elapsedEl = document.querySelector('.aw-title__elapsed');
        if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsedSeconds);
    }, 1000);
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

function getLocationImports() {
    // These are already loaded by workout-session.js, just access them
    return {
        lockLocation: () => {},
        isLocationLocked: () => false,
        getSessionLocation: () => null,
        updateLocationIndicator: () => {},
    };
}

// Export current index for external use
export function getCurrentExerciseIdx() { return currentExerciseIdx; }
export function setCurrentExerciseIdx(idx) { currentExerciseIdx = idx; }
