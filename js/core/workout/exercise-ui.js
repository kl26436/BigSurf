// Exercise UI Module - core/workout/exercise-ui.js
// Handles exercise card rendering, set management, equipment changes, video, and unit management

import { AppState } from '../utils/app-state.js';
import {
    showNotification,
    convertWeight,
    updateProgress,
    setHeaderMode,
    escapeHtml,
    escapeAttr,
} from '../ui/ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { setBottomNavVisible } from '../ui/navigation.js';
import { saveWorkoutData, debouncedSaveWorkoutData, loadExerciseHistory } from '../data/data-manager.js';
import {
    getSessionLocation,
    lockLocation,
    isLocationLocked,
    updateLocationIndicator,
} from '../features/location-service.js';
import {
    restoreTimerFromAppState,
    saveActiveTimerState,
    restoreActiveTimerState,
    restoreModalRestTimer,
    autoStartRestTimer,
} from './rest-timer.js';

// ===================================================================
// EVENT DELEGATION FOR EXERCISE MODAL
// ===================================================================

let exerciseModalDelegationSetup = false;

function setupExerciseModalDelegation() {
    if (exerciseModalDelegationSetup) return;
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;
    exerciseModalDelegationSetup = true;

    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'loadExerciseHistory') {
            window.loadExerciseHistory(btn.dataset.exercise, parseInt(btn.dataset.index, 10));
        } else if (action === 'showExerciseVideoAndToggleButton') {
            window.showExerciseVideoAndToggleButton(
                btn.dataset.video,
                btn.dataset.exercise,
                parseInt(btn.dataset.index, 10)
            );
        }
    });
}

// ===================================================================
// EXERCISE RENDERING AND MANAGEMENT
// ===================================================================

export function renderExercises() {
    const container = document.getElementById('exercise-list');
    if (!container || !AppState.currentWorkout) return;

    container.innerHTML = '';

    // Render each exercise card
    AppState.currentWorkout.exercises.forEach((exercise, index) => {
        const card = createExerciseCard(exercise, index);
        container.appendChild(card);
    });

    // Show empty state if no exercises
    if (AppState.currentWorkout.exercises.length === 0) {
        container.innerHTML += `
            <div class="empty-workout-message">
                <i class="fas fa-dumbbell"></i>
                <h3>No exercises in this workout</h3>
                <p>Use the "Add Exercise" button above to get started!</p>
            </div>
        `;
    }

    updateProgress(AppState);
}

/**
 * Incrementally update a single exercise card without rebuilding the entire list.
 * Used after set updates to avoid DOM thrashing.
 * Falls back to full re-render if the card cannot be found.
 */
export function updateExerciseCard(exerciseIndex) {
    const container = document.getElementById('exercise-list');
    if (!container || !AppState.currentWorkout) {
        renderExercises();
        return;
    }

    const existingCard = container.querySelector(`.exercise-card[data-index="${exerciseIndex}"]`);
    if (!existingCard) {
        // Card not found (e.g., newly added exercise) - do full render
        renderExercises();
        return;
    }

    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    if (!exercise) {
        renderExercises();
        return;
    }

    // Create updated card and replace only the changed one
    const newCard = createExerciseCard(exercise, exerciseIndex);
    existingCard.replaceWith(newCard);

    updateProgress(AppState);
}

function generateQuickSetsHtml(exercise, exerciseIndex, unit) {
    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    const targetSets = exercise.sets || 3;

    let html = '<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">';

    for (let setIndex = 0; setIndex < targetSets; setIndex++) {
        const set = savedSets[setIndex] || {};
        const isCompleted = set.reps && set.weight;

        if (isCompleted) {
            // Convert stored lbs weight to display unit
            let displayWeight = set.weight; // stored in lbs
            if (set.weight && unit === 'kg') {
                displayWeight = Math.round(set.weight * 0.453592); // Convert lbs to kg, rounded to whole number
            }

            html += `
                <div style="background: var(--success); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">
                    Set ${setIndex + 1}: ${set.reps} × ${displayWeight} ${unit}
                </div>
            `;
        } else {
            // Show incomplete sets as gray placeholders
            html += `
                <div style="background: var(--bg-tertiary); color: var(--text-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; border: 1px dashed var(--border);">
                    Set ${setIndex + 1}
                </div>
            `;
        }
    }

    html += '</div>';
    return html;
}

export function createExerciseCard(exercise, index) {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.index = index;

    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;
    const savedSets = AppState.savedData.exercises?.[`exercise_${index}`]?.sets || [];

    // Calculate completion status
    const completedSets = savedSets.filter((set) => set && set.reps && set.weight).length;
    const totalSets = exercise.sets || 3;

    // Use the larger of completedSets or totalSets for display to avoid showing 4/3
    const displayTotal = Math.max(completedSets, totalSets);

    // Fix: Exercise is only completed when ALL sets are done
    const isCompleted = completedSets >= totalSets && completedSets > 0;

    if (isCompleted) {
        card.classList.add('completed');
        // Don't collapse - show full exercise with green border indicator
    }

    // Calculate progress percentage using displayTotal to avoid >100%
    const progressPercent = displayTotal > 0 ? Math.min((completedSets / displayTotal) * 100, 100) : 0;

    // Build equipment display string
    let equipmentDisplay = '';
    if (exercise.equipment) {
        equipmentDisplay = exercise.equipment;
        if (exercise.equipmentLocation) {
            equipmentDisplay += ` @ ${exercise.equipmentLocation}`;
        }
    }

    // Get exercise name with fallback
    const exerciseName = getExerciseName(exercise);

    // Build card DOM programmatically (avoids innerHTML with user data)
    const titleRow = document.createElement('div');
    titleRow.className = 'exercise-title-row';
    titleRow.style.cursor = 'pointer';
    titleRow.addEventListener('click', () => window.focusExercise(index));

    const h3 = document.createElement('h3');
    h3.className = 'exercise-title';
    h3.textContent = exerciseName;
    titleRow.appendChild(h3);

    if (equipmentDisplay) {
        const eqTag = document.createElement('div');
        eqTag.className = 'exercise-equipment-tag';
        eqTag.textContent = equipmentDisplay;
        titleRow.appendChild(eqTag);
    }
    card.appendChild(titleRow);

    const progressRow = document.createElement('div');
    progressRow.className = 'exercise-progress-row';
    progressRow.style.cursor = 'pointer';
    progressRow.addEventListener('click', () => window.focusExercise(index));

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-bar-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = `${progressPercent}%`;
    progressTrack.appendChild(progressFill);
    progressRow.appendChild(progressTrack);

    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.textContent = `${completedSets}/${displayTotal}`;
    progressRow.appendChild(progressText);
    card.appendChild(progressRow);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'exercise-actions-row';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-text btn-text-danger';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.deleteExerciseFromWorkout(index);
    });
    const trashIcon = document.createElement('i');
    trashIcon.className = 'fas fa-trash-alt';
    deleteBtn.appendChild(trashIcon);
    deleteBtn.appendChild(document.createTextNode(' Delete'));
    actionsRow.appendChild(deleteBtn);
    card.appendChild(actionsRow);

    return card;
}

export function focusExercise(index) {
    if (!AppState.currentWorkout) return;
    setupExerciseModalDelegation();

    AppState.focusedExerciseIndex = index;
    const exercise = AppState.currentWorkout.exercises[index];
    const modal = document.getElementById('exercise-modal');
    const title = document.getElementById('modal-exercise-title');
    const content = document.getElementById('exercise-content');

    if (!modal || !title || !content) {
        console.error('Modal elements not found:', { modal: !!modal, title: !!title, content: !!content });
        return;
    }

    // Build title with icons for edit/change
    const equipmentText = exercise.equipment
        ? `${exercise.equipment}${exercise.equipmentLocation ? ' @ ' + exercise.equipmentLocation : ''}`
        : null;

    const exerciseName = getExerciseName(exercise);
    // Build title with programmatic DOM (avoids innerHTML with user data)
    title.textContent = '';
    const nameText = document.createTextNode(exerciseName + ' ');
    title.appendChild(nameText);

    const editLink = document.createElement('a');
    editLink.href = '#';
    editLink.className = 'exercise-edit-icon';
    editLink.setAttribute('aria-label', 'Edit exercise defaults');
    editLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.editExerciseDefaults(exerciseName);
    });
    const editIcon = document.createElement('i');
    editIcon.className = 'fas fa-pen';
    editLink.appendChild(editIcon);
    title.appendChild(editLink);

    title.appendChild(document.createElement('br'));

    const subtitleSpan = document.createElement('span');
    subtitleSpan.className = 'modal-equipment-subtitle';
    subtitleSpan.textContent = (equipmentText || 'No equipment') + ' ';
    const changeLink = document.createElement('a');
    changeLink.href = '#';
    changeLink.className = 'equipment-change-icon';
    changeLink.setAttribute('aria-label', 'Change equipment');
    changeLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.changeExerciseEquipment(index);
    });
    const changeIcon = document.createElement('i');
    changeIcon.className = 'fas fa-sync-alt';
    changeLink.appendChild(changeIcon);
    subtitleSpan.appendChild(changeLink);
    title.appendChild(subtitleSpan);

    // Define currentUnit FIRST
    const currentUnit = AppState.exerciseUnits[index] || AppState.globalUnit;

    // Generate the HTML content (this creates the unit toggle)
    content.innerHTML = generateExerciseTable(exercise, index, currentUnit);

    // NOW find and set up the unit toggle (after it's been created)
    const unitToggle = modal.querySelector('.exercise-unit-toggle .unit-toggle');

    if (unitToggle) {
        unitToggle.querySelectorAll('.unit-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setExerciseUnit(index, btn.dataset.unit);
            });
        });
    }

    modal.showModal();

    // Hide nav when exercise modal is open (no hamburger needed - has X to close)
    setHeaderMode(false);
    setBottomNavVisible(false);

    // Restore rest timer from AppState if it exists for this exercise
    if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === index) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            restoreTimerFromAppState(index);
        }, 50);
    }
}

export function generateExerciseTable(exercise, exerciseIndex, unit) {
    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    const savedNotes = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.notes || '';
    const convertedWeight = convertWeight(exercise.weight, 'lbs', unit);

    // Ensure we have the right number of sets
    while (savedSets.length < exercise.sets) {
        savedSets.push({ reps: '', weight: '' });
    }

    const modalExerciseName = getExerciseName(exercise);
    let html = `
        <!-- Exercise History Reference -->
        <div class="exercise-history-section">
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-small" data-action="loadExerciseHistory" data-exercise="${escapeAttr(modalExerciseName)}" data-index="${exerciseIndex}">
                    <i class="fas fa-history"></i> Show Last Workout
                </button>
                ${
                    exercise.video
                        ? `<button id="show-video-btn-${exerciseIndex}" class="btn btn-primary btn-small" data-action="showExerciseVideoAndToggleButton" data-video="${escapeAttr(exercise.video)}" data-exercise="${escapeAttr(modalExerciseName)}" data-index="${exerciseIndex}">
                        <i class="fas fa-play"></i> Form Video
                    </button>
                    <button id="hide-video-btn-${exerciseIndex}" class="btn btn-secondary btn-small hidden" onclick="hideExerciseVideoAndToggleButton(${exerciseIndex})">
                        <i class="fas fa-times"></i> Hide Video
                    </button>`
                        : ''
                }
            </div>
            <div id="exercise-history-${exerciseIndex}" class="exercise-history-display hidden"></div>
        </div>

        <!-- Exercise Unit Toggle -->
        <div class="exercise-unit-toggle">
            <div class="unit-toggle">
                <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs">lbs</button>
                <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg">kg</button>
            </div>
        </div>

        <!-- In-Modal Rest Timer -->
        <div id="modal-rest-timer-${exerciseIndex}" class="modal-rest-timer hidden">
            <div class="modal-rest-content">
                <div class="modal-rest-exercise">Rest Period</div>
                <div class="modal-rest-display">90s</div>
                <div class="modal-rest-controls">
                    <button class="btn btn-small" onclick="toggleModalRestTimer(${exerciseIndex})" aria-label="Pause timer">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="btn btn-small" onclick="skipModalRestTimer(${exerciseIndex})" aria-label="Skip timer">
                        <i class="fas fa-forward"></i>
                    </button>
                </div>
            </div>
        </div>

        <table class="exercise-table">
            <thead>
                <tr>
                    <th>Set</th>
                    <th>Reps</th>
                    <th>Weight (${unit})</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < exercise.sets; i++) {
        const set = savedSets[i] || { reps: '', weight: '' };

        // Convert stored lbs weight to display unit
        let displayWeight = set.weight || '';
        if (displayWeight && unit === 'kg') {
            displayWeight = Math.round(displayWeight * 0.453592); // Round kg to whole number
        }

        html += `
        <tr>
            <td>Set ${i + 1}</td>
            <td>
                <input type="number" class="set-input" inputmode="numeric"
                       placeholder="${exercise.reps}"
                       value="${set.reps}"
                       onchange="updateSet(${exerciseIndex}, ${i}, 'reps', this.value)">
            </td>
            <td>
                <input type="number" class="set-input" inputmode="decimal"
                       placeholder="${convertedWeight}"
                       value="${displayWeight}"
                       onchange="updateSet(${exerciseIndex}, ${i}, 'weight', this.value)">
            </td>
        </tr>
    `;
    }

    html += `
            </tbody>
        </table>

        <div class="set-controls" style="display: flex; gap: 0.5rem; justify-content: center; margin: 1rem 0;">
            <button class="btn btn-secondary btn-small" onclick="removeSetFromExercise(${exerciseIndex})" title="Remove last set">
                <i class="fas fa-minus"></i> Remove Set
            </button>
            <button class="btn btn-primary btn-small" onclick="addSetToExercise(${exerciseIndex})" title="Add new set">
                <i class="fas fa-plus"></i> Add Set
            </button>
        </div>

        <textarea id="exercise-notes-${exerciseIndex}" class="notes-area" placeholder="Exercise notes..."
                  onchange="saveExerciseNotes(${exerciseIndex})">${escapeHtml(savedNotes)}</textarea>

        <div class="exercise-complete-section" style="margin-top: 1rem; text-align: center;">
            <button class="btn btn-success" onclick="markExerciseComplete(${exerciseIndex})">
                <i class="fas fa-check-circle"></i> Mark Exercise Complete
            </button>
        </div>
    `;

    return html;
}

export { loadExerciseHistory };

// ===================================================================
// SET MANAGEMENT
// ===================================================================

// Track which sets have already shown PR notifications to avoid duplicates
const prNotifiedSets = new Set();

// Check if a set is a PR and show visual feedback
// Returns true if a PR was detected
async function checkSetForPR(exerciseIndex, setIndex) {
    try {
        const exercise = AppState.currentWorkout.exercises[exerciseIndex];
        const exerciseName = getExerciseName(exercise);
        const equipment = exercise.equipment || 'Unknown Equipment';

        const exerciseKey = `exercise_${exerciseIndex}`;
        const set = AppState.savedData.exercises[exerciseKey].sets[setIndex];

        if (!set || !set.reps || !set.weight) return false;

        // Create unique key for this set to track if we've already notified
        const setKey = `${exerciseIndex}-${setIndex}-${set.reps}-${set.weight}`;

        // Skip if we've already notified about this exact set
        if (prNotifiedSets.has(setKey)) {
            return false;
        }

        const { PRTracker } = await import('../features/pr-tracker.js');
        const prCheck = PRTracker.checkForNewPR(exerciseName, set.reps, set.weight, equipment);

        if (prCheck.isNewPR) {
            // Mark this set as notified
            prNotifiedSets.add(setKey);

            // Add PR badge to the set row
            const setRow = document.querySelector(`#exercise-${exerciseIndex} tbody tr:nth-child(${setIndex + 1})`);
            if (setRow && !setRow.querySelector('.pr-badge')) {
                const prBadge = document.createElement('span');
                prBadge.className = 'pr-badge';
                prBadge.innerHTML =
                    ' <i class="fas fa-trophy" style="color: gold; margin-left: 0.5rem; animation: pulse 1s infinite;"></i>';
                prBadge.title = `New ${prCheck.prType
                    .replace('max', '')
                    .replace(/([A-Z])/g, ' $1')
                    .trim()} PR!`;

                const firstCell = setRow.querySelector('td');
                if (firstCell) {
                    firstCell.appendChild(prBadge);
                }
            }

            // For "first time" PRs, only show notification once per exercise
            // For other PR types (maxWeight, maxReps, maxVolume), show for each unique achievement
            const exerciseNotifyKey = `${exerciseIndex}-${prCheck.prType}`;
            const shouldNotify = prCheck.prType === 'first' ? !prNotifiedSets.has(exerciseNotifyKey) : true;

            if (shouldNotify) {
                if (prCheck.prType === 'first') {
                    // Mark the entire exercise as notified for "first" type
                    prNotifiedSets.add(exerciseNotifyKey);
                }

                // Show PR notification
                let prMessage = '\u{1F3C6} NEW PR! ';
                if (prCheck.prType === 'maxWeight') {
                    prMessage += `Max Weight: ${set.weight} lbs \u00D7 ${set.reps}`;
                } else if (prCheck.prType === 'maxReps') {
                    prMessage += `Max Reps: ${set.reps} @ ${set.weight} lbs`;
                } else if (prCheck.prType === 'maxVolume') {
                    prMessage += `Max Volume: ${set.reps * set.weight} lbs`;
                } else if (prCheck.prType === 'first') {
                    prMessage += `First time doing ${exerciseName}!`;
                }
            }

            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking for PR:', error);
        return false;
    }
}

export async function updateSet(exerciseIndex, setIndex, field, value) {
    if (!AppState.currentWorkout || !AppState.savedData.exercises) {
        AppState.savedData.exercises = {};
    }

    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises[exerciseKey]) {
        // Include exercise name and equipment info when initializing
        const currentExercise = AppState.currentWorkout?.exercises?.[exerciseIndex];
        AppState.savedData.exercises[exerciseKey] = {
            sets: [],
            notes: '',
            name: currentExercise?.machine || currentExercise?.name || null,
            equipment: currentExercise?.equipment || null,
            equipmentLocation: currentExercise?.equipmentLocation || null,
        };
    }

    if (!AppState.savedData.exercises[exerciseKey].sets[setIndex]) {
        AppState.savedData.exercises[exerciseKey].sets[setIndex] = {};
    }

    // Convert and validate value
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
        if (field === 'weight') {
            const currentUnit = AppState.exerciseUnits[exerciseIndex] || AppState.globalUnit;
            let weightInLbs = numValue;

            // Convert to lbs if entered in kg
            if (currentUnit === 'kg') {
                weightInLbs = Math.round(numValue * 2.20462);
            }

            // Store weight in lbs and track original unit
            AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = weightInLbs;
            AppState.savedData.exercises[exerciseKey].sets[setIndex].originalUnit = currentUnit;

            // Store both values for reference
            AppState.savedData.exercises[exerciseKey].sets[setIndex].originalWeights = {
                lbs: weightInLbs,
                kg: currentUnit === 'kg' ? numValue : Math.round(weightInLbs * 0.453592),
            };
        } else {
            AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = numValue;
        }
    } else {
        AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = null;
    }

    // Save to Firebase (debounced to batch rapid set updates)
    debouncedSaveWorkoutData(AppState);

    // Update UI - incremental update for the changed exercise card only
    updateExerciseCard(exerciseIndex);

    const setData = AppState.savedData.exercises[exerciseKey].sets[setIndex];

    if (setData.reps && setData.weight) {
        // Lock location on first completed set (can't change location after logging sets)
        if (!isLocationLocked()) {
            lockLocation();
            updateLocationIndicator(getSessionLocation(), true);

            // Record when location was locked
            if (AppState.savedData) {
                AppState.savedData.locationLockedAt = new Date().toISOString();
            }

            // Associate current workout location with any equipment used in this workout
            const sessionLocation = getSessionLocation();
            if (sessionLocation && AppState.currentWorkout?.exercises) {
                associateLocationWithWorkoutEquipment(sessionLocation);
            }
        }

        // Check for PR (returns true if PR was found)
        const isPR = await checkSetForPR(exerciseIndex, setIndex);

        autoStartRestTimer(exerciseIndex, setIndex);

        // Only show generic notification if it's not a PR
        if (!isPR) {
        }
    }
}

export function addSet(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    AppState.currentWorkout.exercises[exerciseIndex].sets =
        (AppState.currentWorkout.exercises[exerciseIndex].sets || 3) + 1;

    updateExerciseCard(exerciseIndex);
}

export function deleteSet(exerciseIndex, setIndex) {
    if (!AppState.savedData.exercises) return;

    const exerciseKey = `exercise_${exerciseIndex}`;
    if (AppState.savedData.exercises[exerciseKey]?.sets) {
        AppState.savedData.exercises[exerciseKey].sets.splice(setIndex, 1);
        debouncedSaveWorkoutData(AppState);
        updateExerciseCard(exerciseIndex);
    }
}

// Add set from exercise modal (refreshes modal instead of full exercise list)
export function addSetToExercise(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    // Save timer state before re-render
    saveActiveTimerState(exerciseIndex);

    // Increment set count in current workout template
    AppState.currentWorkout.exercises[exerciseIndex].sets =
        (AppState.currentWorkout.exercises[exerciseIndex].sets || 3) + 1;

    // Update only the changed exercise card
    updateExerciseCard(exerciseIndex);

    // Refresh the exercise modal to show new set
    focusExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);
}

// Remove last set from exercise modal (refreshes modal instead of full exercise list)
export function removeSetFromExercise(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const currentSets = AppState.currentWorkout.exercises[exerciseIndex].sets || 3;

    // Don't allow removing if only 1 set remains
    if (currentSets <= 1) {
        return;
    }

    // Save timer state before re-render
    saveActiveTimerState(exerciseIndex);

    // Decrement set count
    AppState.currentWorkout.exercises[exerciseIndex].sets = currentSets - 1;

    // Remove the last set's saved data if it exists
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (AppState.savedData.exercises?.[exerciseKey]?.sets) {
        const lastSetIndex = currentSets - 1;
        if (AppState.savedData.exercises[exerciseKey].sets[lastSetIndex]) {
            AppState.savedData.exercises[exerciseKey].sets.splice(lastSetIndex, 1);
            debouncedSaveWorkoutData(AppState);
        }
    }

    // Update only the changed exercise card
    updateExerciseCard(exerciseIndex);

    // Refresh the exercise modal to show updated sets
    focusExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);
}

export function saveExerciseNotes(exerciseIndex) {
    const notesTextarea = document.getElementById(`exercise-notes-${exerciseIndex}`);
    if (!notesTextarea) return;

    if (!AppState.savedData.exercises) AppState.savedData.exercises = {};

    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises[exerciseKey]) {
        const currentExercise = AppState.currentWorkout?.exercises?.[exerciseIndex];
        AppState.savedData.exercises[exerciseKey] = {
            sets: [],
            notes: '',
            name: currentExercise?.machine || currentExercise?.name || null,
            equipment: currentExercise?.equipment || null,
            equipmentLocation: currentExercise?.equipmentLocation || null,
        };
    }

    AppState.savedData.exercises[exerciseKey].notes = notesTextarea.value;
    debouncedSaveWorkoutData(AppState);
}

export function markExerciseComplete(exerciseIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseKey = `exercise_${exerciseIndex}`;

    if (!AppState.savedData.exercises[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey] = {
            sets: [],
            notes: '',
            name: exercise?.machine || exercise?.name || null,
            equipment: exercise?.equipment || null,
            equipmentLocation: exercise?.equipmentLocation || null,
        };
    }

    // Remove empty sets (sets without both reps AND weight)
    // Only keep sets that have actual data entered
    const existingSets = AppState.savedData.exercises[exerciseKey].sets || [];
    AppState.savedData.exercises[exerciseKey].sets = existingSets.filter((set) => {
        // Keep set if it has reps OR weight (or both)
        return (set.reps && set.reps > 0) || (set.weight && set.weight > 0);
    });

    const keptSets = AppState.savedData.exercises[exerciseKey].sets.length;

    // Update the exercise template to match the actual number of completed sets
    // This ensures the exercise card shows the correct count and marks as complete
    exercise.sets = keptSets;

    saveWorkoutData(AppState);
    updateExerciseCard(exerciseIndex);

    // Close modal properly (this also shows bottom nav)
    closeExerciseModal();
}

function markSetComplete(exerciseIndex, setIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    updateSet(exerciseIndex, setIndex, 'reps', exercise.reps || 10);
    updateSet(exerciseIndex, setIndex, 'weight', exercise.weight || 50);
}

export function deleteExerciseFromWorkout(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const exerciseName = AppState.currentWorkout.exercises[exerciseIndex].machine;

    // Show confirmation dialog
    if (!confirm(`Remove ${exerciseName} from workout?`)) {
        return; // User cancelled
    }

    // Delete the exercise
    AppState.currentWorkout.exercises.splice(exerciseIndex, 1);

    // Remove saved data for this exercise and shift remaining exercises
    if (AppState.savedData.exercises) {
        delete AppState.savedData.exercises[`exercise_${exerciseIndex}`];

        // Shift remaining exercise data
        for (let i = exerciseIndex + 1; i < AppState.currentWorkout.exercises.length + 1; i++) {
            if (AppState.savedData.exercises[`exercise_${i}`]) {
                AppState.savedData.exercises[`exercise_${i - 1}`] = AppState.savedData.exercises[`exercise_${i}`];
                delete AppState.savedData.exercises[`exercise_${i}`];
            }
        }
    }

    saveWorkoutData(AppState);

    // Incremental removal: remove the card from the DOM
    const container = document.getElementById('exercise-list');
    const removedCard = container?.querySelector(`.exercise-card[data-index="${exerciseIndex}"]`);
    if (removedCard) {
        removedCard.remove();
        // Reindex remaining cards after the deleted one (their data-index shifted)
        const remainingCards = container.querySelectorAll('.exercise-card');
        remainingCards.forEach((card) => {
            const idx = parseInt(card.dataset.index, 10);
            if (idx > exerciseIndex) {
                card.dataset.index = idx - 1;
            }
        });
        updateProgress(AppState);
    } else {
        renderExercises();
    }
}

// ===================================================================
// EXERCISE ADDITION AND SWAPPING
// ===================================================================

export function addExerciseToActiveWorkout() {
    if (!AppState.currentWorkout) {
        return;
    }

    if (!AppState.currentUser) {
        alert('Please sign in to add exercises');
        return;
    }

    // Open the exercise library modal for adding to active workout
    const modal = document.getElementById('exercise-library-modal');
    if (modal) {
        // Set flag so we know exercises should be added to active workout
        window.addingToActiveWorkout = true;
        modal.classList.remove('hidden');

        // Load exercises into the modal
        if (window.openExerciseLibrary) {
            window.openExerciseLibrary('activeWorkout');
        }
    }
}

export function confirmExerciseAddToWorkout(exerciseData) {
    if (!AppState.currentWorkout) return false;

    let exercise;
    try {
        if (typeof exerciseData === 'string') {
            const cleanJson = exerciseData.replace(/&quot;/g, '"');
            exercise = JSON.parse(cleanJson);
        } else {
            exercise = exerciseData;
        }
    } catch (e) {
        console.error('Error parsing exercise data:', e);
        return false;
    }

    const exerciseName = getExerciseName(exercise);

    // Check for duplicate exercise in current workout
    const isDuplicate = AppState.currentWorkout.exercises.some(
        (ex) => ex.machine === exerciseName || ex.name === exerciseName
    );

    if (isDuplicate) {
        showNotification(`"${exerciseName}" is already in this workout`, 'warning');
        return false;
    }

    // Add exercise to current workout (include equipment if provided)
    const newExercise = {
        machine: exerciseName,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
    };

    AppState.currentWorkout.exercises.push(newExercise);

    // Save and update UI
    saveWorkoutData(AppState);

    // Incremental append: add just the new card without rebuilding the list
    const container = document.getElementById('exercise-list');
    if (container) {
        // Remove empty-state message if present
        const emptyMsg = container.querySelector('.empty-workout-message');
        if (emptyMsg) emptyMsg.remove();

        const newIndex = AppState.currentWorkout.exercises.length - 1;
        const card = createExerciseCard(newExercise, newIndex);
        container.appendChild(card);
        updateProgress(AppState);
    } else {
        renderExercises();
    }

    // Close exercise library
    if (window.exerciseLibrary && window.exerciseLibrary.close) {
        window.exerciseLibrary.close();
    }

    return true;
}

// REMOVED: swapExercise() and confirmExerciseSwap() - Replaced by delete + add workflow

export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.close();
    }

    // Show nav again when exercise modal closes (if still in active workout)
    // Keep header hidden (no logo) during active workout
    if (AppState.currentWorkout) {
        setHeaderMode(false);
        setBottomNavVisible(true);
    }

    // Save current timer state to AppState before closing (for restore on reopen)
    if (AppState.focusedExerciseIndex !== null) {
        const modalTimer = document.getElementById(`modal-rest-timer-${AppState.focusedExerciseIndex}`);
        if (modalTimer && modalTimer.timerData && !modalTimer.classList.contains('hidden')) {
            // Update AppState with current timeLeft so timer resumes correctly on reopen
            if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === AppState.focusedExerciseIndex) {
                // Store the current remaining time as the new duration baseline
                AppState.activeRestTimer.duration = modalTimer.timerData.timeLeft;
                AppState.activeRestTimer.startTime = Date.now();
                AppState.activeRestTimer.pausedTime = 0;
                AppState.activeRestTimer.isPaused = modalTimer.timerData.isPaused;
            }

            // Cancel animation frame (timer continues via AppState)
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
        }
    }

    AppState.focusedExerciseIndex = null;
}

// ===================================================================
// EQUIPMENT CHANGE DURING WORKOUT
// ===================================================================

// Store the exercise index that's being edited for equipment
let pendingEquipmentChangeIndex = null;

export async function changeExerciseEquipment(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseName = getExerciseName(exercise);

    // Store the index for the callback
    pendingEquipmentChangeIndex = exerciseIndex;

    // Set flag to indicate we're changing equipment (not adding new exercise)
    window.changingEquipmentDuringWorkout = true;

    // Open the equipment picker modal
    const modal = document.getElementById('equipment-picker-modal');

    const { populateEquipmentPicker } = await import('../ui/equipment-picker.js');
    await populateEquipmentPicker({
        exerciseName,
        currentEquipment: exercise.equipment || null,
        currentLocation: exercise.equipmentLocation || null,
        sessionLocation: getSessionLocation(),
    });

    if (modal) modal.classList.remove('hidden');
}

// Apply the selected equipment to the current workout exercise
export async function applyEquipmentChange(equipmentName, equipmentLocation, equipmentVideo = null) {
    if (pendingEquipmentChangeIndex === null || !AppState.currentWorkout) {
        window.changingEquipmentDuringWorkout = false;
        return;
    }

    const exerciseIndex = pendingEquipmentChangeIndex;
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseName = getExerciseName(exercise);

    // Update the exercise with new equipment
    exercise.equipment = equipmentName || null;
    exercise.equipmentLocation = equipmentLocation || null;

    // Also update in savedData.exercises if it exists
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (AppState.savedData?.exercises?.[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey].equipment = equipmentName || null;
        AppState.savedData.exercises[exerciseKey].equipmentLocation = equipmentLocation || null;
    }

    // Save equipment to Firebase if it's new (include video)
    if (equipmentName) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            await workoutManager.getOrCreateEquipment(equipmentName, equipmentLocation, exerciseName, equipmentVideo);
        } catch (error) {
            console.error('\u274C Error saving equipment:', error);
        }
    }

    // Save workout data (debounced — equipment change is a UI-triggered auto-save)
    debouncedSaveWorkoutData(AppState);

    // Update UI — only the affected card
    updateExerciseCard(exerciseIndex);

    // Refresh the modal if it's still open
    if (AppState.focusedExerciseIndex === exerciseIndex) {
        focusExercise(exerciseIndex);
    }

    // Clean up
    pendingEquipmentChangeIndex = null;
    window.changingEquipmentDuringWorkout = false;
}

// ===================================================================
// UNIT MANAGEMENT
// ===================================================================

export function setGlobalUnit(unit) {
    if (AppState.globalUnit === unit) return; // No change needed

    AppState.globalUnit = unit;

    // Update global unit toggle
    document.querySelectorAll('.global-settings .unit-btn')?.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.unit === unit);
    });

    // Update all exercises that don't have individual unit preferences
    if (AppState.currentWorkout) {
        AppState.currentWorkout.exercises.forEach((exercise, index) => {
            if (!AppState.exerciseUnits[index]) {
                AppState.exerciseUnits[index] = unit;
            }
        });

        renderExercises();
        debouncedSaveWorkoutData(AppState); // Save unit preferences
    }
}

export function setExerciseUnit(exerciseIndex, unit) {
    if (!AppState.currentWorkout || exerciseIndex >= AppState.currentWorkout.exercises.length) return;

    // Just change the display unit preference
    AppState.exerciseUnits[exerciseIndex] = unit;

    // PRESERVE TIMER STATE BEFORE REFRESHING MODAL
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    let timerState = null;

    if (modalTimer && modalTimer.timerData && !modalTimer.classList.contains('hidden')) {
        timerState = {
            isActive: true,
            isPaused: modalTimer.timerData.isPaused || false,
            timeLeft: modalTimer.timerData.timeLeft,
            exerciseLabel: modalTimer.querySelector('.modal-rest-exercise')?.textContent,
            startTime: modalTimer.timerData.startTime,
            pausedTime: modalTimer.timerData.pausedTime,
        };

        if (modalTimer.timerData.animationFrame) {
            cancelAnimationFrame(modalTimer.timerData.animationFrame);
        }
    }

    // No weight conversion - weights stay in lbs, only display changes

    // Update modal display
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.querySelectorAll('.unit-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.unit === unit);
        });

        const exercise = AppState.currentWorkout.exercises[exerciseIndex];
        const content = document.getElementById('exercise-content');
        if (content) {
            content.innerHTML = generateExerciseTable(exercise, exerciseIndex, unit);

            // Re-setup unit toggle event listeners
            const unitToggle = modal.querySelector('.exercise-unit-toggle .unit-toggle');
            if (unitToggle) {
                unitToggle.querySelectorAll('.unit-btn').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        setExerciseUnit(exerciseIndex, btn.dataset.unit);
                    });
                });
            }

            // RESTORE TIMER STATE
            if (timerState && timerState.isActive) {
                restoreModalRestTimer(exerciseIndex, timerState);
            }
        }
    }

    // Refresh the affected card only
    updateExerciseCard(exerciseIndex);

    // Save unit preference (debounced — unit toggle is a UI-triggered auto-save)
    debouncedSaveWorkoutData(AppState);
}

// ===================================================================
// NAVIGATION HELPERS
// ===================================================================

export async function editExerciseDefaults(exerciseName) {
    // Find the exercise in the database by name
    const exercise = AppState.exerciseDatabase.find((ex) => (ex.name || ex.machine) === exerciseName);

    if (!exercise) {
        return;
    }

    // Close the exercise modal first
    closeExerciseModal();

    // Set flag to indicate we're editing from active workout
    window.editingFromActiveWorkout = true;

    // Open the exercise manager and edit this exercise
    const { openExerciseManager, editExercise } = await import('../ui/exercise-manager-ui.js');
    openExerciseManager();

    // Small delay to let the manager UI load
    setTimeout(() => {
        const exerciseId = exercise.id || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        editExercise(exerciseId);
    }, 100);
}

// ===================================================================
// VIDEO FUNCTIONS
// ===================================================================

export function convertYouTubeUrl(url) {
    if (!url) return url;

    let videoId = null;

    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('youtube.com/watch?v=')[1].split('&')[0];
    } else if (url.includes('youtube.com/embed/')) {
        return url; // Already in embed format
    }

    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
    }

    return url; // Return original if not a YouTube URL
}

export function showExerciseVideo(videoUrl, exerciseName) {
    const videoSection = document.getElementById('exercise-video-section');
    const iframe = document.getElementById('exercise-video-iframe');

    if (!videoSection || !iframe) return;

    const embedUrl = convertYouTubeUrl(videoUrl);

    // Check if it's a valid URL (not a placeholder)
    if (!embedUrl || embedUrl.includes('example') || (embedUrl === videoUrl && !embedUrl.includes('youtube'))) {
        return;
    }

    iframe.src = embedUrl;
    videoSection.classList.remove('hidden');
}

export function hideExerciseVideo() {
    const videoSection = document.getElementById('exercise-video-section');
    const iframe = document.getElementById('exercise-video-iframe');

    if (videoSection) videoSection.classList.add('hidden');
    if (iframe) iframe.src = '';
}

// Wrapper functions to handle button toggling
export function showExerciseVideoAndToggleButton(videoUrl, exerciseName, exerciseIndex) {
    showExerciseVideo(videoUrl, exerciseName);

    // Hide "Form Video" button, show "Hide Video" button
    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);

    if (showBtn) showBtn.classList.add('hidden');
    if (hideBtn) hideBtn.classList.remove('hidden');
}

export function hideExerciseVideoAndToggleButton(exerciseIndex) {
    hideExerciseVideo();

    // Show "Form Video" button, hide "Hide Video" button
    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);

    if (showBtn) showBtn.classList.remove('hidden');
    if (hideBtn) hideBtn.classList.add('hidden');
}

// ===================================================================
// EXERCISE HISTORY INTEGRATION
// ===================================================================

// Load last workout hint - shows quick summary without full history
export async function loadLastWorkoutHint(exerciseName, exerciseIndex) {
    const hintDiv = document.getElementById(`last-workout-hint-${exerciseIndex}`);
    if (!hintDiv || !AppState.currentUser) {
        if (hintDiv) hintDiv.remove();
        return;
    }

    try {
        const { collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
        const { db } = await import('../data/firebase-config.js');

        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('lastUpdated', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);

        const today = AppState.getTodayDateString();
        let lastWorkoutData = null;

        querySnapshot.forEach((doc) => {
            if (lastWorkoutData) return; // Already found

            const data = doc.data();
            if (data.date === today) return; // Skip today

            // Search for this exercise
            if (data.exerciseNames) {
                for (const [key, name] of Object.entries(data.exerciseNames)) {
                    if (name === exerciseName && data.exercises?.[key]?.sets?.length > 0) {
                        const sets = data.exercises[key].sets;
                        const completedSets = sets.filter((s) => s && (s.reps || s.weight));
                        if (completedSets.length > 0) {
                            lastWorkoutData = {
                                date: data.date,
                                sets: completedSets,
                            };
                            break;
                        }
                    }
                }
            }
        });

        if (lastWorkoutData) {
            const avgReps = Math.round(
                lastWorkoutData.sets.reduce((sum, s) => sum + (s.reps || 0), 0) / lastWorkoutData.sets.length
            );
            const avgWeight = Math.round(
                lastWorkoutData.sets.reduce((sum, s) => sum + (s.weight || 0), 0) / lastWorkoutData.sets.length
            );

            hintDiv.innerHTML = `
                <i class="fas fa-history"></i>
                <strong>Last:</strong> ${lastWorkoutData.sets.length} sets \u00D7 ${avgReps} reps \u00D7 ${avgWeight} lbs
                <span style="color: var(--text-secondary); margin-left: 0.5rem;">(${new Date(lastWorkoutData.date).toLocaleDateString()})</span>
            `;
        } else {
            hintDiv.innerHTML = `<i class="fas fa-info-circle"></i> No previous workout found for this exercise`;
        }
    } catch (error) {
        console.error('Error loading last workout hint:', error);
        hintDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Could not load previous workout`;
    }
}

// ===================================================================
// LOCATION-EQUIPMENT ASSOCIATION (used by updateSet)
// ===================================================================

/**
 * Associate the current workout location with all equipment used in the workout
 * Called when location is locked (first set logged)
 */
async function associateLocationWithWorkoutEquipment(locationName) {
    if (!locationName || !AppState.currentWorkout?.exercises) return;

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        // Get all equipment from user's collection
        const allEquipment = await workoutManager.getUserEquipment();
        if (!allEquipment || allEquipment.length === 0) return;

        // Loop through exercises in the workout that have equipment
        for (const exercise of AppState.currentWorkout.exercises) {
            const equipmentName = exercise.equipment;
            if (!equipmentName) continue;

            // Find matching equipment by name
            const matchingEquipment = allEquipment.find((eq) => eq.name === equipmentName);
            if (matchingEquipment && matchingEquipment.id) {
                // Add the workout's location to this equipment
                await workoutManager.addLocationToEquipment(matchingEquipment.id, locationName);
            }
        }
    } catch (error) {
        console.error('\u274C Error associating location with equipment:', error);
    }
}
