// Exercise UI Module - core/workout/exercise-ui.js
// Handles exercise card rendering, set management, equipment changes, video, and unit management

import { AppState } from '../utils/app-state.js';
import {
    showNotification,
    convertWeight,
    updateProgress,
    escapeHtml,
    escapeAttr,
    openModal,
} from '../ui/ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { getExerciseGroups, groupExercises, ungroupExercise } from '../features/superset-manager.js';
import { saveWorkoutData, debouncedSaveWorkoutData, loadExerciseHistory, getLastSessionDefaults } from '../data/data-manager.js';
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
import { Config, CATEGORY_COLORS } from '../utils/config.js';
import { haptic } from '../utils/haptics.js';
import { getWorkoutCategory } from '../ui/template-selection.js';

// ===================================================================
// INLINE CARD EVENT DELEGATION
// ===================================================================

let inlineCardDelegationSetup = false;

function setupInlineCardDelegation() {
    if (inlineCardDelegationSetup) return;
    const exerciseList = document.getElementById('exercise-list');
    if (!exerciseList) return;
    inlineCardDelegationSetup = true;

    exerciseList.addEventListener('click', (e) => {
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
        } else if (action === 'toggleInlineProgress') {
            toggleInlineProgress(
                btn.dataset.exercise,
                btn.dataset.equipment,
                parseInt(btn.dataset.index, 10),
                btn
            );
        }
    });
}

// ===================================================================
// EXERCISE REORDER MODE
// ===================================================================

let reorderMode = false;

export function toggleReorderMode() {
    reorderMode = !reorderMode;
    const container = document.getElementById('exercise-list');
    const btn = document.getElementById('btn-reorder');

    if (!container) return;

    if (reorderMode) {
        container.classList.add('reorder-mode');
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Done';
        initTouchReorder(container);
    } else {
        container.classList.remove('reorder-mode');
        if (btn) btn.innerHTML = '<i class="fas fa-arrows-alt-v"></i> Reorder';
    }
}

function initTouchReorder(container) {
    const cards = container.querySelectorAll('.exercise-card');
    cards.forEach((card) => {
        const handle = document.createElement('div');
        handle.className = 'exercise-drag-handle';
        handle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        card.insertBefore(handle, card.firstChild);

        let startY = 0;
        let currentY = 0;
        let dragging = false;
        let placeholder = null;

        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            dragging = true;
            startY = e.touches[0].clientY;
            card.classList.add('dragging');

            placeholder = document.createElement('div');
            placeholder.className = 'exercise-card-placeholder';
            placeholder.style.height = card.offsetHeight + 'px';
            card.parentNode.insertBefore(placeholder, card.nextSibling);

            card.style.position = 'fixed';
            card.style.left = '16px';
            card.style.right = '16px';
            card.style.width = container.offsetWidth - 32 + 'px';
            card.style.top = card.getBoundingClientRect().top + 'px';
            card.style.zIndex = '1000';
        }, { passive: false });

        handle.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            e.preventDefault();
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            const rect = card.getBoundingClientRect();
            card.style.top = (rect.top + diff) + 'px';
            startY = currentY;

            // Find which card we're hovering over
            const siblings = [...container.querySelectorAll('.exercise-card:not(.dragging)')];
            for (const sibling of siblings) {
                const sibRect = sibling.getBoundingClientRect();
                const sibMiddle = sibRect.top + sibRect.height / 2;
                if (currentY < sibMiddle && placeholder.nextSibling !== sibling) {
                    container.insertBefore(placeholder, sibling);
                    break;
                } else if (currentY > sibMiddle && placeholder !== sibling.nextSibling) {
                    container.insertBefore(placeholder, sibling.nextSibling);
                }
            }
        }, { passive: false });

        handle.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            card.classList.remove('dragging');
            card.style.position = '';
            card.style.left = '';
            card.style.right = '';
            card.style.width = '';
            card.style.top = '';
            card.style.zIndex = '';

            // Insert card where placeholder is
            if (placeholder && placeholder.parentNode) {
                container.insertBefore(card, placeholder);
                placeholder.remove();
            }

            // Read new order from DOM and update AppState
            const newOrder = [...container.querySelectorAll('.exercise-card')].map(c => parseInt(c.dataset.index));
            applyExerciseReorder(newOrder);
        });
    });
}

function applyExerciseReorder(newOrder) {
    if (!AppState.currentWorkout) return;

    const oldExercises = AppState.currentWorkout.exercises;
    const oldSavedData = { ...AppState.savedData.exercises };

    // Reorder exercises array
    AppState.currentWorkout.exercises = newOrder.map(i => oldExercises[i]);

    // Remap saved data keys
    const newSavedData = {};
    newOrder.forEach((oldIndex, newIndex) => {
        if (oldSavedData[`exercise_${oldIndex}`]) {
            newSavedData[`exercise_${newIndex}`] = oldSavedData[`exercise_${oldIndex}`];
        }
    });
    AppState.savedData.exercises = newSavedData;

    // Remap exercise units
    const oldUnits = { ...AppState.exerciseUnits };
    AppState.exerciseUnits = {};
    newOrder.forEach((oldIndex, newIndex) => {
        if (oldUnits[oldIndex]) {
            AppState.exerciseUnits[newIndex] = oldUnits[oldIndex];
        }
    });

    debouncedSaveWorkoutData(AppState);
    renderExercises();

    // Re-enter reorder mode if still active
    if (reorderMode) {
        const container = document.getElementById('exercise-list');
        if (container) {
            container.classList.add('reorder-mode');
            initTouchReorder(container);
        }
    }
}

// ===================================================================
// SWIPE-TO-DELETE
// ===================================================================

function initSwipeToDelete(card, exerciseIndex) {
    let startX = 0;
    let currentX = 0;
    let swiping = false;
    const THRESHOLD = 80; // px to trigger delete reveal

    const header = card.querySelector('.exercise-card-header');
    if (!header) return;

    // Create delete action behind the card
    const deleteAction = document.createElement('div');
    deleteAction.className = 'exercise-swipe-delete';
    deleteAction.innerHTML = '<i class="fas fa-trash-alt"></i>';
    deleteAction.addEventListener('click', () => {
        if (confirm('Remove this exercise?')) {
            deleteExerciseFromWorkout(exerciseIndex);
        }
    });
    card.style.position = 'relative';
    card.style.overflow = 'hidden';
    card.insertBefore(deleteAction, card.firstChild);

    header.addEventListener('touchstart', (e) => {
        // Don't swipe if in reorder mode or if card is expanded
        if (reorderMode) return;
        startX = e.touches[0].clientX;
        currentX = startX;
        swiping = true;
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        // Only allow left swipe (negative diff)
        if (diff > 10) {
            // Right swipe - reset
            header.style.transform = '';
            return;
        }

        if (diff < -10) {
            e.preventDefault();
            const clampedDiff = Math.max(diff, -120);
            header.style.transform = `translateX(${clampedDiff}px)`;
            header.style.transition = 'none';
        }
    }, { passive: false });

    header.addEventListener('touchend', () => {
        if (!swiping) return;
        swiping = false;
        const diff = currentX - startX;

        header.style.transition = 'transform 0.2s ease';
        if (diff < -THRESHOLD) {
            // Reveal delete button
            header.style.transform = `translateX(-80px)`;
        } else {
            // Snap back
            header.style.transform = '';
        }
    });

    // Tap anywhere else to dismiss swipe
    document.addEventListener('touchstart', (e) => {
        if (!card.contains(e.target) && header.style.transform) {
            header.style.transition = 'transform 0.2s ease';
            header.style.transform = '';
        }
    }, { passive: true });
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

    // Wrap consecutive same-group cards in superset group containers
    wrapSupersetGroups(container);

    // Show empty state if no exercises
    if (AppState.currentWorkout.exercises.length === 0) {
        container.insertAdjacentHTML('beforeend', `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                <div class="empty-state-title">No exercises in this workout</div>
                <div class="empty-state-description">Use the "Add Exercise" button above to get started!</div>
            </div>
        `);
    }

    // Sort completed exercises to bottom
    reorderExercisesByCompletion(container);

    updateProgress(AppState);
}

const SUPERSET_COLORS = ['var(--primary)', 'var(--warning)', 'var(--highlight-warm)', 'var(--cat-push)', 'var(--cat-pull)'];

function wrapSupersetGroups(container) {
    const cards = Array.from(container.querySelectorAll('.exercise-card[data-group]'));
    if (!cards.length) return;

    // Collect groups in DOM order
    const groupMap = {};
    cards.forEach(card => {
        const g = card.dataset.group;
        if (!groupMap[g]) groupMap[g] = [];
        groupMap[g].push(card);
    });

    const groupLetters = Object.keys(groupMap).sort();

    groupLetters.forEach((letter, gi) => {
        const groupCards = groupMap[letter];
        if (groupCards.length < 2) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'superset-group';
        wrapper.dataset.group = letter;
        wrapper.style.setProperty('--superset-color', SUPERSET_COLORS[gi % SUPERSET_COLORS.length]);

        // Label
        const label = document.createElement('div');
        label.className = 'superset-group-label';
        const typeLabel = groupCards.length === 2 ? 'Superset' : 'Circuit';
        label.textContent = `${typeLabel} ${letter}`;
        wrapper.appendChild(label);

        // Insert wrapper before first card, move all group cards into it
        groupCards[0].parentNode.insertBefore(wrapper, groupCards[0]);
        groupCards.forEach(card => wrapper.appendChild(card));
    });
}

function reorderExercisesByCompletion(container) {
    if (!container) container = document.getElementById('exercise-list');
    if (!container) return;

    const cards = Array.from(container.querySelectorAll('.exercise-card'));
    const incomplete = cards.filter(c => !c.classList.contains('completed'));
    const completed = cards.filter(c => c.classList.contains('completed'));

    if (completed.length === 0 || incomplete.length === 0) return;

    // Remove existing separator
    const oldSep = container.querySelector('.completed-separator');
    if (oldSep) oldSep.remove();

    const fragment = document.createDocumentFragment();
    incomplete.forEach(card => fragment.appendChild(card));

    const separator = document.createElement('div');
    separator.className = 'completed-separator';
    separator.innerHTML = '<span>Completed</span>';
    fragment.appendChild(separator);

    completed.forEach(card => fragment.appendChild(card));
    container.appendChild(fragment);

    // Auto-scroll to the next incomplete exercise
    requestAnimationFrame(() => {
        const next = container.querySelector('.exercise-card:not(.completed)');
        if (next) {
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
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
        renderExercises();
        return;
    }

    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    if (!exercise) {
        renderExercises();
        return;
    }

    // If this card is currently expanded, only update the header portion
    if (expandedExerciseIndex === exerciseIndex) {
        const newCard = createExerciseCard(exercise, exerciseIndex);
        const newHeader = newCard.querySelector('.exercise-card-header');
        const existingHeader = existingCard.querySelector('.exercise-card-header');
        if (newHeader && existingHeader) {
            existingHeader.replaceWith(newHeader);
            // Re-add expanded class since the new header doesn't have it
            existingCard.classList.add('expanded');
        }
        updateProgress(AppState);
        return;
    }

    // Create updated card and replace only the changed one
    const newCard = createExerciseCard(exercise, exerciseIndex);
    existingCard.replaceWith(newCard);

    updateProgress(AppState);
}

export function createExerciseCard(exercise, index) {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.index = index;

    // Read group from workout exercise or saved data
    const group = exercise.group || AppState.savedData.exercises?.[`exercise_${index}`]?.group || null;
    if (group) {
        card.dataset.group = group;
    }

    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;
    const isCardio = exercise.exerciseType === 'cardio';
    const savedEx = AppState.savedData.exercises?.[`exercise_${index}`] || {};
    const savedSets = savedEx.sets || [];

    // Calculate completion status
    let completedSets, totalSets, displayTotal;
    if (isCardio) {
        completedSets = savedEx.cardio?.duration ? 1 : 0;
        totalSets = 1;
        displayTotal = 1;
    } else {
        completedSets = savedSets.filter((set) => set && set.reps && set.weight).length;
        totalSets = exercise.sets || 3;
        displayTotal = Math.max(completedSets, totalSets);
    }

    // Fix: Exercise is only completed when ALL sets are done
    const isCompleted = completedSets >= totalSets && completedSets > 0;

    if (isCompleted) {
        card.classList.add('completed');
    }

    // Calculate progress percentage using displayTotal to avoid >100%
    const progressPercent = displayTotal > 0 ? Math.min((completedSets / displayTotal) * 100, 100) : 0;

    // Get exercise name with fallback
    const exerciseName = getExerciseName(exercise);

    // Build equipment + summary line
    let metaParts = [];
    if (exercise.equipment) {
        metaParts.push(exercise.equipment);
    }
    // Information-dense summary: show current or last session set data
    let setPreview;
    if (isCardio) {
        const cardio = savedEx.cardio || {};
        const parts = [];
        if (cardio.duration) parts.push(`${cardio.duration}min`);
        if (cardio.distance) parts.push(`${cardio.distance}mi`);
        if (cardio.calories) parts.push(`${cardio.calories}cal`);
        setPreview = parts.join(' · ');
    } else {
        setPreview = savedSets
            .filter(s => s && s.reps && s.weight)
            .slice(0, 4)
            .map(s => {
                let w = s.weight;
                if (unit === 'kg') w = Math.round(w * 0.453592 * 2) / 2;
                return `${w}×${s.reps}`;
            })
            .join(', ');
    }

    // ── HEADER (always visible) ──
    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.addEventListener('click', () => {
        window.toggleExerciseExpansion(index);
    });

    const headerInfo = document.createElement('div');
    headerInfo.className = 'exercise-card-info';

    const h3 = document.createElement('h3');
    h3.className = 'exercise-title';
    h3.textContent = exerciseName;
    headerInfo.appendChild(h3);

    const meta = document.createElement('div');
    meta.className = 'exercise-card-meta';
    if (exercise.equipment) {
        const eqSpan = document.createElement('span');
        eqSpan.textContent = exercise.equipment;
        meta.appendChild(eqSpan);
    }
    if (setPreview) {
        const previewSpan = document.createElement('span');
        previewSpan.className = 'exercise-card-last';
        previewSpan.textContent = setPreview;
        meta.appendChild(previewSpan);
    } else if (completedSets === 0) {
        const hint = document.createElement('span');
        hint.className = 'exercise-card-hint';
        hint.textContent = 'Tap to log sets';
        meta.appendChild(hint);
    }
    headerInfo.appendChild(meta);
    header.appendChild(headerInfo);

    // Right side: overflow + count + chevron
    const status = document.createElement('div');
    status.className = 'exercise-card-status';

    // Overflow button (⋯) — opens exercise overflow menu
    const overflowBtn = document.createElement('button');
    overflowBtn.className = 'exercise-header-overflow';
    overflowBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
    overflowBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger expand/collapse
        const menu = document.getElementById(`exercise-overflow-${index}`);
        if (menu) menu.classList.toggle('hidden');
    });
    status.appendChild(overflowBtn);

    // SVG mini progress ring
    const category = getWorkoutCategory(AppState.currentWorkout?.workoutType || AppState.savedData?.workoutType || '');
    const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const ringColor = isCompleted ? 'var(--success)' : categoryColor;
    const circumference = 2 * Math.PI * 12;
    const offset = circumference - (progressPercent / 100) * circumference;

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'exercise-mini-ring');
    ring.setAttribute('width', '28');
    ring.setAttribute('height', '28');
    ring.setAttribute('viewBox', '0 0 28 28');
    ring.innerHTML = `
        <circle cx="14" cy="14" r="12" stroke="rgba(255,255,255,0.06)" stroke-width="2.5" fill="none"/>
        <circle cx="14" cy="14" r="12" stroke="${ringColor}" stroke-width="2.5" fill="none"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 14 14)"/>
    `;
    status.appendChild(ring);

    const countText = document.createElement('span');
    countText.className = 'exercise-card-count';
    countText.textContent = `${completedSets}/${displayTotal}`;
    status.appendChild(countText);

    const chevron = document.createElement('i');
    chevron.className = 'fas fa-chevron-down exercise-card-chevron';
    status.appendChild(chevron);

    header.appendChild(status);
    card.appendChild(header);

    // ── SWIPE-TO-DELETE ──
    initSwipeToDelete(card, index);

    // ── BODY (hidden, populated on expand) ──
    const body = document.createElement('div');
    body.className = 'exercise-card-body';
    body.id = `exercise-body-${index}`;
    card.appendChild(body);

    // Async: load last session preview for cards with no current data
    if (!setPreview) {
        getLastSessionDefaults(exerciseName, exercise.equipment || null).then(lastSession => {
            if (!lastSession?.sets?.length) return;
            const preview = lastSession.sets
                .filter(s => s.reps && s.weight)
                .slice(0, 4)
                .map(s => {
                    let w = s.weight;
                    if (unit === 'kg') w = Math.round(w * 0.453592 * 2) / 2;
                    return `${w}×${s.reps}`;
                })
                .join(', ');
            if (preview) {
                const metaEl = card.querySelector('.exercise-card-meta');
                if (metaEl) {
                    // Remove hint if present
                    const hint = metaEl.querySelector('.exercise-card-hint');
                    if (hint) hint.remove();
                    const lastSpan = document.createElement('span');
                    lastSpan.className = 'exercise-card-last';
                    lastSpan.textContent = `Last: ${preview}`;
                    metaEl.appendChild(lastSpan);
                }
            }
        }).catch(() => {});
    }

    return card;
}

// ===================================================================
// INLINE EXERCISE EXPANSION (accordion pattern)
// ===================================================================

let expandedExerciseIndex = null;

export async function toggleExerciseExpansion(index) {
    if (!AppState.currentWorkout) return;

    // If same card, collapse it
    if (expandedExerciseIndex === index) {
        collapseExercise(index);
        return;
    }

    // Collapse previously expanded card
    if (expandedExerciseIndex !== null) {
        collapseExercise(expandedExerciseIndex);
    }

    // Expand the new card
    await expandExercise(index);
}

async function expandExercise(index) {
    const card = document.querySelector(`.exercise-card[data-index="${index}"]`);
    const body = document.getElementById(`exercise-body-${index}`);
    if (!card || !body) return;

    const exercise = AppState.currentWorkout.exercises[index];
    if (!exercise) return;

    expandedExerciseIndex = index;
    AppState.focusedExerciseIndex = index;

    // Setup inline card event delegation (once)
    setupInlineCardDelegation();

    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;
    const exerciseName = getExerciseName(exercise);

    // Build inline toolbar (Swap | Equipment | More)
    const toolbarHtml = buildInlineToolbar(exercise, index, exerciseName);

    // Generate the set table (reuse existing function)
    const tableHtml = await generateExerciseTable(exercise, index, unit);

    body.innerHTML = toolbarHtml + tableHtml;

    // Setup unit toggle event listeners
    const unitToggle = body.querySelector('.unit-toggle');
    if (unitToggle) {
        unitToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setExerciseUnit(index, btn.dataset.unit);
            });
        });
    }

    // Add expanded class and animate
    card.classList.add('expanded');
    body.style.maxHeight = body.scrollHeight + 'px';

    // After transition, remove max-height constraint so content can grow
    const onTransitionEnd = () => {
        body.style.maxHeight = 'none';
        body.removeEventListener('transitionend', onTransitionEnd);
    };
    body.addEventListener('transitionend', onTransitionEnd);

    // Scroll card into view
    setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Focus first empty input for immediate typing
    setTimeout(() => {
        const emptyInput = body.querySelector('.set-input:not([value]), .set-input[value=""]');
        if (emptyInput) emptyInput.focus();
    }, 350);

    // Setup swipe-to-delete on set rows
    setupSwipeToDeleteInline(index, body);

    // Restore rest timer from AppState if it exists for this exercise
    if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === index) {
        setTimeout(() => {
            restoreTimerFromAppState(index);
        }, 50);
    }
}

function collapseExercise(index) {
    const card = document.querySelector(`.exercise-card[data-index="${index}"]`);
    const body = document.getElementById(`exercise-body-${index}`);
    if (!card || !body) return;

    // Save rest timer state before collapse
    if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === index) {
        saveActiveTimerState();
    }

    // Animate collapse: set max-height to current height first, then to 0
    body.style.maxHeight = body.scrollHeight + 'px';
    // Force reflow
    body.offsetHeight; // eslint-disable-line no-unused-expressions
    body.style.maxHeight = '0';

    card.classList.remove('expanded');
    expandedExerciseIndex = null;
    AppState.focusedExerciseIndex = null;

    // Clear body after animation
    setTimeout(() => {
        body.innerHTML = '';
    }, 300);

    // Update the card header to reflect changes
    updateExerciseCard(index);
}

function buildInlineToolbar(exercise, index, exerciseName) {
    const currentGroup = exercise.group || AppState.savedData.exercises?.[`exercise_${index}`]?.group;
    const hasNext = (index + 1) < (AppState.currentWorkout?.exercises?.length || 0);
    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;
    const otherUnit = unit === 'lbs' ? 'kg' : 'lbs';

    let items = '';

    // Primary actions (previously top-level toolbar buttons)
    items += `<button class="exercise-overflow-item" onclick="replaceExercise(${index})"><i class="fas fa-exchange-alt"></i> Swap Exercise</button>`;
    items += `<button class="exercise-overflow-item" onclick="changeExerciseEquipment(${index})"><i class="fas fa-sync-alt"></i> Change Equipment</button>`;

    // History/progress (previously always-visible buttons in generateExerciseTable)
    items += `<button class="exercise-overflow-item" data-action="loadExerciseHistory" data-exercise="${escapeAttr(exerciseName)}" data-index="${index}"><i class="fas fa-history"></i> Show Last Workout</button>`;
    items += `<button class="exercise-overflow-item" data-action="toggleInlineProgress" data-exercise="${escapeAttr(exerciseName)}" data-equipment="${escapeAttr(exercise.equipment || '')}" data-index="${index}"><i class="fas fa-chart-line"></i> View Progress</button>`;

    // Edit defaults
    items += `<button class="exercise-overflow-item" onclick="editExerciseDefaults('${escapeAttr(exerciseName)}')"><i class="fas fa-pen"></i> Edit Defaults</button>`;

    // Superset/Ungroup
    if (currentGroup) {
        items += `<button class="exercise-overflow-item" onclick="ungroupExerciseFromWorkout(${index})"><i class="fas fa-unlink"></i> Ungroup</button>`;
    } else if (hasNext) {
        items += `<button class="exercise-overflow-item" onclick="supersetWithNext(${index})"><i class="fas fa-link"></i> Superset</button>`;
    }

    // Video
    items += `<button class="exercise-overflow-item" id="show-video-btn-${index}" onclick="showExerciseVideoAndToggleButton(${exercise.video ? `'${escapeAttr(exercise.video)}'` : 'null'}, '${escapeAttr(exerciseName)}', ${index})"><i class="fas fa-play-circle"></i> Form Video</button>`;
    items += `<button class="exercise-overflow-item hidden" id="hide-video-btn-${index}" onclick="hideExerciseVideoAndToggleButton(${index})"><i class="fas fa-times"></i> Hide Video</button>`;

    // Delete
    items += `<button class="exercise-overflow-item exercise-overflow-item--danger" onclick="deleteExerciseFromWorkout(${index})"><i class="fas fa-trash-alt"></i> Delete</button>`;

    // No visible toolbar row — only the hidden overflow menu + video section
    return `
        <div id="exercise-overflow-${index}" class="exercise-overflow-menu hidden">
            ${items}
        </div>
        <div id="exercise-history-${index}" class="exercise-history-display hidden"></div>
        <div id="exercise-progress-${index}" class="exercise-progress-display hidden"></div>
        <div id="exercise-video-section-inline-${index}" class="video-section hidden">
            <iframe id="exercise-video-iframe-inline-${index}" class="exercise-video-iframe" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
    `;
}

function setupSwipeToDeleteInline(exerciseIndex, container) {
    const rows = container.querySelectorAll('.exercise-table tbody tr');
    rows.forEach((row) => {
        let startX = 0;
        let currentX = 0;
        let swiping = false;

        row.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            currentX = startX;
            swiping = true;
            row.style.transition = 'none';
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            if (!swiping) return;
            currentX = e.touches[0].clientX;
            const diff = startX - currentX;
            if (diff > 0 && diff < 100) {
                row.style.transform = `translateX(-${diff}px)`;
                row.style.background = `linear-gradient(to left, rgba(239, 68, 68, ${diff / 100 * 0.3}) 0%, transparent ${diff}px)`;
            }
        }, { passive: true });

        row.addEventListener('touchend', () => {
            if (!swiping) return;
            swiping = false;
            const diff = startX - currentX;
            row.style.transition = 'transform 0.2s ease';
            if (diff > 70) {
                row.style.transform = 'translateX(-100%)';
                row.style.opacity = '0';
                setTimeout(() => {
                    removeSetFromExercise(exerciseIndex);
                }, 200);
            } else {
                row.style.transform = 'translateX(0)';
                row.style.background = '';
            }
        });
    });
}

export function supersetWithNext(index) {
    if (!AppState.currentWorkout) return;
    const nextIndex = index + 1;
    if (nextIndex >= AppState.currentWorkout.exercises.length) return;

    // Ensure savedData.exercises entries exist for both
    if (!AppState.savedData.exercises) AppState.savedData.exercises = {};
    for (const idx of [index, nextIndex]) {
        const key = `exercise_${idx}`;
        if (!AppState.savedData.exercises[key]) {
            const ex = AppState.currentWorkout.exercises[idx];
            AppState.savedData.exercises[key] = {
                sets: [],
                notes: '',
                name: ex?.machine || ex?.name || null,
                equipment: ex?.equipment || null,
            };
        }
    }

    groupExercises([index, nextIndex], AppState.savedData.exercises);

    // Also set on the workout exercise objects so it persists
    AppState.currentWorkout.exercises[index].group = AppState.savedData.exercises[`exercise_${index}`].group;
    AppState.currentWorkout.exercises[nextIndex].group = AppState.savedData.exercises[`exercise_${nextIndex}`].group;

    debouncedSaveWorkoutData(AppState);

    if (expandedExerciseIndex !== null) {
        collapseExercise(expandedExerciseIndex);
    }

    renderExercises();
}

export function ungroupExerciseFromWorkout(index) {
    if (!AppState.currentWorkout || !AppState.savedData.exercises) return;

    const key = `exercise_${index}`;
    const group = AppState.savedData.exercises[key]?.group;
    if (!group) return;

    ungroupExercise(index, AppState.savedData.exercises);

    // Sync back to workout exercise objects
    for (let i = 0; i < AppState.currentWorkout.exercises.length; i++) {
        const exKey = `exercise_${i}`;
        if (AppState.savedData.exercises[exKey]) {
            AppState.currentWorkout.exercises[i].group = AppState.savedData.exercises[exKey].group || null;
        }
    }

    debouncedSaveWorkoutData(AppState);

    if (expandedExerciseIndex !== null) {
        collapseExercise(expandedExerciseIndex);
    }

    renderExercises();
}


// ===================================================================
// CONTENT CONTAINER HELPER
// ===================================================================

/**
 * Returns the expanded card body for the given exercise, or null if not expanded.
 */
function getExerciseContentContainer(exerciseIndex) {
    if (expandedExerciseIndex === exerciseIndex) {
        return document.getElementById(`exercise-body-${exerciseIndex}`);
    }
    return null;
}

export async function generateExerciseTable(exercise, exerciseIndex, unit) {
    const isCardio = exercise.exerciseType === 'cardio';

    // Cardio exercises get a different input layout
    if (isCardio) {
        return generateCardioTable(exercise, exerciseIndex);
    }

    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    const savedNotes = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.notes || '';
    const convertedWeight = convertWeight(exercise.weight, 'lbs', unit);

    // Ensure we have the right number of sets
    while (savedSets.length < exercise.sets) {
        savedSets.push({ reps: '', weight: '' });
    }

    // Fetch last session defaults for placeholder text
    const modalExerciseName = getExerciseName(exercise);
    let lastSession = null;
    try {
        lastSession = await getLastSessionDefaults(modalExerciseName, exercise.equipment || null);
    } catch (_) { /* fall back to template defaults */ }

    // Format last session date label
    let lastSessionLabel = '';
    if (lastSession?.date) {
        const d = new Date(lastSession.date + 'T00:00:00');
        lastSessionLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    let html = `
        <div class="exercise-table-header">
            ${lastSessionLabel ? `<span class="last-session-label"><i class="fas fa-history"></i> ${lastSessionLabel}</span>` : '<span></span>'}
            <div class="unit-toggle">
                <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs">lbs</button>
                <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg">kg</button>
            </div>
        </div>

        <table class="exercise-table">
            <thead>
                <tr>
                    <th>Set</th>
                    <th>Reps</th>
                    <th>Weight (${unit})</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < exercise.sets; i++) {
        const set = savedSets[i] || { reps: '', weight: '' };
        const isSetDone = !!(set.completed || (set.reps && set.weight));

        // Convert stored lbs weight to display unit
        let displayWeight = set.weight || '';
        if (displayWeight && unit === 'kg') {
            displayWeight = Math.round(displayWeight * 0.453592 * 2) / 2; // Round kg to nearest 0.5
        }

        // Determine placeholder from last session or template defaults
        let repsPlaceholder = exercise.reps;
        let weightPlaceholder = convertedWeight;
        if (lastSession?.sets?.[i]) {
            const ls = lastSession.sets[i];
            if (ls.reps) repsPlaceholder = ls.reps;
            if (ls.weight) {
                weightPlaceholder = unit === 'kg'
                    ? Math.round(ls.weight * 0.453592 * 2) / 2
                    : ls.weight;
            }
        }

        html += `
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
    `;
    }

    html += `
            </tbody>
        </table>

        <div class="set-controls">
            <button class="btn-set-control btn-set-control--remove" onclick="removeSetFromExercise(${exerciseIndex})" title="Remove last set">
                <i class="fas fa-minus"></i> Remove
            </button>
            <button class="btn-set-control btn-set-control--add" onclick="addSetToExercise(${exerciseIndex})" title="Add new set">
                <i class="fas fa-plus"></i> Add Set
            </button>
        </div>

        <textarea id="exercise-notes-${exerciseIndex}" class="notes-area" placeholder="Exercise notes..."
                  onchange="saveExerciseNotes(${exerciseIndex})">${escapeHtml(savedNotes)}</textarea>

        <div class="exercise-complete-section">
            <button class="btn btn-success" onclick="markExerciseComplete(${exerciseIndex})">
                <i class="fas fa-check-circle"></i> Mark Exercise Complete
            </button>
        </div>
    `;

    return html;
}

/**
 * Generate cardio-specific input layout (duration, distance, calories).
 */
function generateCardioTable(exercise, exerciseIndex) {
    const saved = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`] || {};
    const savedNotes = saved.notes || '';
    const cardioData = saved.cardio || {};

    return `
        <div class="cardio-input-grid">
            <div class="cardio-field">
                <label>Duration</label>
                <div class="cardio-input-row">
                    <input type="number" class="set-input" inputmode="numeric"
                           placeholder="30" value="${cardioData.duration || ''}"
                           onchange="updateCardioField(${exerciseIndex}, 'duration', this.value)">
                    <span class="cardio-unit">min</span>
                </div>
            </div>
            <div class="cardio-field">
                <label>Distance</label>
                <div class="cardio-input-row">
                    <input type="number" class="set-input" inputmode="decimal" step="0.1"
                           placeholder="3.0" value="${cardioData.distance || ''}"
                           onchange="updateCardioField(${exerciseIndex}, 'distance', this.value)">
                    <span class="cardio-unit">mi</span>
                </div>
            </div>
            <div class="cardio-field">
                <label>Calories</label>
                <div class="cardio-input-row">
                    <input type="number" class="set-input" inputmode="numeric"
                           placeholder="300" value="${cardioData.calories || ''}"
                           onchange="updateCardioField(${exerciseIndex}, 'calories', this.value)">
                    <span class="cardio-unit">cal</span>
                </div>
            </div>
            <div class="cardio-field">
                <label>Avg Heart Rate</label>
                <div class="cardio-input-row">
                    <input type="number" class="set-input" inputmode="numeric"
                           placeholder="145" value="${cardioData.heartRate || ''}"
                           onchange="updateCardioField(${exerciseIndex}, 'heartRate', this.value)">
                    <span class="cardio-unit">bpm</span>
                </div>
            </div>
        </div>

        ${cardioData.duration ? `
        <div class="cardio-pace">
            ${cardioData.distance && cardioData.duration
                ? `Pace: ${(cardioData.duration / cardioData.distance).toFixed(1)} min/mi`
                : ''}
        </div>` : ''}

        <textarea id="exercise-notes-${exerciseIndex}" class="notes-area" placeholder="Exercise notes..."
                  onchange="saveExerciseNotes(${exerciseIndex})">${escapeHtml(savedNotes)}</textarea>

        <div class="exercise-complete-section">
            <button class="btn btn-success" onclick="markExerciseComplete(${exerciseIndex})">
                <i class="fas fa-check-circle"></i> Mark Complete
            </button>
        </div>
    `;
}

export { loadExerciseHistory };

async function toggleInlineProgress(exerciseName, equipment, exerciseIndex, btn) {
    const display = document.getElementById(`exercise-progress-${exerciseIndex}`);
    if (!display) return;

    // Toggle visibility
    if (!display.classList.contains('hidden')) {
        display.classList.add('hidden');
        btn.innerHTML = '<i class="fas fa-chart-line"></i> View Progress';
        return;
    }

    btn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Progress';
    display.classList.remove('hidden');
    display.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const { db, collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('lastUpdated', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        const sessions = [];
        const today = AppState.getTodayDateString();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.date === today) return;
            if (!data.completedAt || !data.exercises) return;

            // Find matching exercise
            for (const [key, exData] of Object.entries(data.exercises)) {
                if (!exData?.sets?.length) continue;
                const idx = key.replace('exercise_', '');
                const exName = data.exerciseNames?.[key]
                    || data.originalWorkout?.exercises?.[idx]?.machine
                    || exData.name;
                if (exName !== exerciseName) continue;

                // Equipment filter if specified
                const exEquip = exData.equipment || data.originalWorkout?.exercises?.[idx]?.equipment || null;
                if (equipment && exEquip && equipment !== exEquip) continue;

                // Get best set (highest weight)
                const validSets = exData.sets.filter(s => s && s.reps && s.weight);
                if (validSets.length === 0) continue;

                const bestSet = validSets.reduce((best, s) => s.weight > best.weight ? s : best, validSets[0]);
                const totalVolume = validSets.reduce((sum, s) => sum + (s.reps * s.weight), 0);

                sessions.push({
                    date: data.date,
                    bestWeight: bestSet.weight,
                    bestReps: bestSet.reps,
                    totalSets: validSets.length,
                    totalVolume,
                    equipment: exEquip,
                });
                break;
            }
        });

        if (sessions.length === 0) {
            display.innerHTML = '<p class="inline-muted-text">No previous sessions found</p>';
            return;
        }

        // Sort by date ascending for the chart, take last 10
        sessions.sort((a, b) => a.date.localeCompare(b.date));
        const recent = sessions.slice(-10);

        const unit = AppState.exerciseUnits[exerciseIndex] || AppState.globalUnit;
        const maxWeight = Math.max(...recent.map(s => s.bestWeight));
        const minWeight = Math.min(...recent.map(s => s.bestWeight));
        const weightRange = maxWeight - minWeight || 1;

        // Build inline progress: bar chart + session list
        let html = '<div class="inline-progress">';
        html += '<div class="inline-progress-title">Recent Sessions</div>';
        html += '<div class="inline-progress-chart">';

        for (const s of recent) {
            const d = new Date(s.date + 'T00:00:00');
            const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const barHeight = Math.max(20, ((s.bestWeight - minWeight) / weightRange) * 80 + 20);
            const displayWt = unit === 'kg' ? Math.round(s.bestWeight * 0.453592 * 2) / 2 : s.bestWeight;

            html += `
                <div class="inline-progress-bar-col">
                    <div class="inline-progress-bar-label">${displayWt}</div>
                    <div class="inline-progress-bar" style="height: ${barHeight}%"></div>
                    <div class="inline-progress-bar-date">${dateLabel}</div>
                </div>`;
        }
        html += '</div>';

        // Summary stats
        const latest = recent[recent.length - 1];
        const first = recent[0];
        const weightDiff = latest.bestWeight - first.bestWeight;
        const displayDiff = unit === 'kg' ? Math.round(weightDiff * 0.453592 * 2) / 2 : weightDiff;
        const trendIcon = weightDiff > 0 ? 'fa-arrow-up' : weightDiff < 0 ? 'fa-arrow-down' : 'fa-minus';
        const trendColor = weightDiff > 0 ? 'var(--success)' : weightDiff < 0 ? 'var(--danger)' : 'var(--text-muted)';

        html += `<div class="inline-progress-summary">
            <span>${sessions.length} sessions total</span>
            <span style="color: ${trendColor}"><i class="fas ${trendIcon}"></i> ${displayDiff > 0 ? '+' : ''}${displayDiff} ${unit}</span>
        </div>`;
        html += '</div>';

        display.innerHTML = html;
    } catch (error) {
        console.error('Error loading inline progress:', error);
        display.innerHTML = '<p class="inline-muted-text">Error loading progress</p>';
    }
}

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
        if (set.type === 'warmup') return false;

        // Create unique key for this set to track if we've already notified
        const setKey = `${exerciseIndex}-${setIndex}-${set.reps}-${set.weight}`;

        // Skip if we've already notified about this exact set
        if (prNotifiedSets.has(setKey)) {
            return false;
        }

        const { PRTracker } = await import('../features/pr-tracker.js');
        const prCheck = PRTracker.checkForNewPR(exerciseName, set.reps, set.weight, equipment);

        if (prCheck.isNewPR) {
            haptic('pr');
            // Mark this set as notified
            prNotifiedSets.add(setKey);

            // Add PR badge to the set row
            const setRow = document.querySelector(`#exercise-${exerciseIndex} tbody tr:nth-child(${setIndex + 1})`);
            if (setRow && !setRow.querySelector('.pr-badge')) {
                const prBadge = document.createElement('span');
                prBadge.className = 'pr-badge';
                prBadge.innerHTML =
                    ' <i class="fas fa-trophy text-badge-gold" style="margin-left: 0.5rem; animation: pulse 1s infinite;"></i>';
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

/**
 * Cycle set type: working → warmup → dropset → failure → working
 */
// cycleSetType removed — set types (warmup/dropset/failure) are not used in the UI

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

export function toggleSetComplete(exerciseIndex, setIndex) {
    if (!AppState.currentWorkout) return;

    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises) AppState.savedData.exercises = {};
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

    if (!AppState.savedData.exercises[exerciseKey].sets[setIndex]) {
        AppState.savedData.exercises[exerciseKey].sets[setIndex] = {};
    }

    const set = AppState.savedData.exercises[exerciseKey].sets[setIndex];
    const wasCompleted = !!(set.completed || (set.reps && set.weight));

    if (wasCompleted) {
        // Uncomplete: clear the completed flag
        set.completed = false;
    } else {
        // Complete: use entered values or placeholder defaults
        const exercise = AppState.currentWorkout.exercises[exerciseIndex];
        if (!set.reps) set.reps = exercise.reps || 10;
        if (!set.weight) set.weight = exercise.weight || 0;
        set.completed = true;

        // Haptic feedback on completion
        haptic('success');

        // Auto-start rest timer
        autoStartRestTimer(exerciseIndex, setIndex);
    }

    debouncedSaveWorkoutData(AppState);
    updateExerciseCard(exerciseIndex);

    // Update the set row UI in the modal or inline card
    const contentContainer = getExerciseContentContainer(exerciseIndex);
    const row = contentContainer?.querySelector(`.exercise-table tbody tr:nth-child(${setIndex + 1})`);
    if (row) {
        const isNowDone = !!(set.completed || (set.reps && set.weight));
        row.classList.toggle('set-row-completed', isNowDone);

        // Animation on completion
        if (isNowDone) {
            row.classList.add('set-row-just-completed');
            setTimeout(() => row.classList.remove('set-row-just-completed'), 600);
        }

        const checkBtn = row.querySelector('.set-check');
        if (checkBtn) {
            checkBtn.classList.toggle('checked', isNowDone);
            checkBtn.querySelector('i').className = `fas ${isNowDone ? 'fa-check-circle' : 'fa-circle'}`;
            // Bounce animation
            if (isNowDone) {
                checkBtn.classList.add('just-checked');
                setTimeout(() => checkBtn.classList.remove('just-checked'), 300);
            }
        }
    }

    // Check if all sets are completed — auto-mark exercise complete
    const allSets = AppState.savedData.exercises[exerciseKey].sets;
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const totalSets = exercise.sets || 3;
    const completedCount = allSets.filter(s => s && (s.completed || (s.reps && s.weight))).length;
    if (completedCount >= totalSets) {
        AppState.savedData.exercises[exerciseKey].completed = true;
        // Re-sort exercise list to move completed to bottom
        reorderExercisesByCompletion();
    } else {
        AppState.savedData.exercises[exerciseKey].completed = false;
    }

    // Update compact hero progress
    if (window.updateWorkoutProgress) window.updateWorkoutProgress();
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

    // Refresh the content view (inline card or modal)
    expandExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);

    // Update compact hero progress
    if (window.updateWorkoutProgress) window.updateWorkoutProgress();
}

// Remove last set from exercise (refreshes inline card or modal)
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

    // Refresh the content view (inline card or modal)
    expandExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);

    // Update compact hero progress
    if (window.updateWorkoutProgress) window.updateWorkoutProgress();
}

/**
 * Update a cardio field (duration, distance, calories, heartRate).
 */
export function updateCardioField(exerciseIndex, field, value) {
    if (!AppState.savedData.exercises) AppState.savedData.exercises = {};

    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises[exerciseKey]) {
        const currentExercise = AppState.currentWorkout?.exercises?.[exerciseIndex];
        AppState.savedData.exercises[exerciseKey] = {
            sets: [],
            name: getExerciseName(currentExercise),
        };
    }

    if (!AppState.savedData.exercises[exerciseKey].cardio) {
        AppState.savedData.exercises[exerciseKey].cardio = {};
    }

    const numVal = parseFloat(value);
    if (!isNaN(numVal) && numVal > 0) {
        AppState.savedData.exercises[exerciseKey].cardio[field] = numVal;
    } else {
        delete AppState.savedData.exercises[exerciseKey].cardio[field];
    }

    // Mark as having data for completion detection
    if (AppState.savedData.exercises[exerciseKey].cardio.duration) {
        AppState.savedData.exercises[exerciseKey].completed = true;
    }

    debouncedSaveWorkoutData(AppState);
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
    haptic('complete');
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

    // Collapse the inline card and re-sort completed exercises to bottom
    collapseExercise(exerciseIndex);
    reorderExercisesByCompletion();

    // Update compact hero progress
    if (window.updateWorkoutProgress) window.updateWorkoutProgress();
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
    const modal = document.getElementById('exercise-library-section');
    if (modal) {
        // Set flag so we know exercises should be added to active workout
        window.addingToActiveWorkout = true;
        openModal(modal);

        // Load exercises into the modal
        if (window.openExerciseLibrary) {
            window.openExerciseLibrary('activeWorkout');
        }
    }
}

export function confirmExerciseAddToWorkout(exerciseData) {
    // If we're replacing an exercise, delegate to the replace handler
    if (window.replacingExerciseIndex !== undefined && window.replacingExerciseIndex !== null) {
        return confirmExerciseReplace(exerciseData);
    }

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
        const emptyMsg = container.querySelector('.empty-state');
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

export function replaceExercise(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    // Store the index we want to replace
    window.replacingExerciseIndex = exerciseIndex;
    window.addingToActiveWorkout = true;

    // Collapse the inline card
    if (expandedExerciseIndex !== null) {
        collapseExercise(expandedExerciseIndex);
    }

    // Open exercise library for selection
    if (window.openExerciseLibrary) {
        window.openExerciseLibrary('activeWorkout');
    }
}

export function confirmExerciseReplace(exerciseData) {
    const replaceIndex = window.replacingExerciseIndex;
    if (replaceIndex === undefined || replaceIndex === null) return false;
    if (!AppState.currentWorkout) return false;

    let exercise;
    try {
        if (typeof exerciseData === 'string') {
            exercise = JSON.parse(exerciseData.replace(/&quot;/g, '"'));
        } else {
            exercise = exerciseData;
        }
    } catch (e) {
        console.error('Error parsing exercise data:', e);
        return false;
    }

    const exerciseName = getExerciseName(exercise);

    // Replace the exercise at the given index
    AppState.currentWorkout.exercises[replaceIndex] = {
        machine: exerciseName,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
    };

    // Clear saved data for this exercise (new exercise = fresh start)
    const exerciseKey = `exercise_${replaceIndex}`;
    if (AppState.savedData.exercises?.[exerciseKey]) {
        delete AppState.savedData.exercises[exerciseKey];
    }

    saveWorkoutData(AppState);
    renderExercises();

    // Clean up
    window.replacingExerciseIndex = undefined;

    // Close exercise library
    if (window.exerciseLibrary?.close) {
        window.exerciseLibrary.close();
    }

    showNotification(`Replaced with ${exerciseName}`, 'success');
    return true;
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

    if (modal) openModal(modal);
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

    // Refresh the expanded card if it's still open
    if (expandedExerciseIndex === exerciseIndex) {
        expandExercise(exerciseIndex);
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

export async function setExerciseUnit(exerciseIndex, unit) {
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

    // Update content in the appropriate container (inline card or modal)
    const content = getExerciseContentContainer(exerciseIndex);
    if (content) {
        const exercise = AppState.currentWorkout.exercises[exerciseIndex];

        // Preserve history/progress visibility before re-render
        const historyEl = document.getElementById(`exercise-history-${exerciseIndex}`);
        const progressEl = document.getElementById(`exercise-progress-${exerciseIndex}`);
        const historyWasVisible = historyEl && !historyEl.classList.contains('hidden');
        const progressWasVisible = progressEl && !progressEl.classList.contains('hidden');
        const progressContent = progressEl?.innerHTML || '';

        if (expandedExerciseIndex === exerciseIndex) {
            // Inline mode: preserve toolbar, regenerate table
            const toolbarHtml = buildInlineToolbar(exercise, exerciseIndex, getExerciseName(exercise));
            const tableHtml = await generateExerciseTable(exercise, exerciseIndex, unit);
            content.innerHTML = toolbarHtml + tableHtml;
        } else {
            content.innerHTML = await generateExerciseTable(exercise, exerciseIndex, unit);
        }

        // Restore history/progress visibility after re-render
        if (historyWasVisible) {
            const newHistoryEl = document.getElementById(`exercise-history-${exerciseIndex}`);
            if (newHistoryEl) {
                newHistoryEl.classList.remove('hidden');
                // Reload with new unit
                if (typeof window.loadExerciseHistory === 'function') {
                    window.loadExerciseHistory(getExerciseName(exercise), exerciseIndex);
                }
            }
        }
        if (progressWasVisible) {
            const newProgressEl = document.getElementById(`exercise-progress-${exerciseIndex}`);
            if (newProgressEl) {
                newProgressEl.innerHTML = progressContent;
                newProgressEl.classList.remove('hidden');
            }
        }

        // Update active unit toggle buttons
        content.querySelectorAll('.unit-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.unit === unit);
        });

        // Re-setup unit toggle event listeners
        const unitToggle = content.querySelector('.unit-toggle');
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

    // Close inline card or exercise modal first
    if (expandedExerciseIndex !== null) {
        collapseExercise(expandedExerciseIndex);
    }

    // Set flag to indicate we're editing from active workout (only if actually in one)
    window.editingFromActiveWorkout = !!AppState.currentWorkout;

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

/**
 * Converts various YouTube URL formats to embeddable format.
 * Handles: watch?v=, youtu.be/, embed/, shorts/
 */
export function convertYouTubeUrl(url) {
    if (!url) return url;

    const pattern = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(pattern);
    if (match) {
        return `https://www.youtube.com/embed/${match[1]}`;
    }

    return url; // Return as-is if not YouTube
}

/**
 * Resolve the best form video for a given exercise + equipment combination.
 * Priority: equipment-specific > equipment general > exercise default > null
 *
 * @param {string} exerciseName
 * @param {string|null} equipmentName
 * @returns {Promise<{url: string|null, source: 'equipment'|'exercise'|null, label: string|null}>}
 */
export async function resolveFormVideo(exerciseName, equipmentName) {
    // 1. Try equipment-specific video
    if (equipmentName) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const allEquipment = await workoutManager.getUserEquipment();
            const equipment = allEquipment.find(eq => eq.name === equipmentName);

            if (equipment) {
                // Priority 1: per-exercise video on this equipment
                if (equipment.exerciseVideos?.[exerciseName]) {
                    return {
                        url: equipment.exerciseVideos[exerciseName],
                        source: 'equipment',
                        label: `Video for ${equipmentName}`,
                    };
                }
                // Priority 2: general equipment video
                if (equipment.video) {
                    return {
                        url: equipment.video,
                        source: 'equipment',
                        label: `Video for ${equipmentName}`,
                    };
                }
            }
        } catch (error) {
            console.error('Error resolving equipment video:', error);
        }
    }

    // 2. Try exercise default video from library
    const exerciseDb = AppState.exerciseDatabase || [];
    const exerciseDef = exerciseDb.find(ex => (ex.name || ex.machine) === exerciseName);
    if (exerciseDef?.video) {
        return {
            url: exerciseDef.video,
            source: 'exercise',
            label: `Default ${exerciseName} form`,
        };
    }

    // 3. No video
    return { url: null, source: null, label: null };
}

export function showExerciseVideo(videoUrl, exerciseName, exerciseIndex) {
    // Try inline video section first, then modal version
    let videoSection, iframe;
    if (exerciseIndex !== undefined) {
        videoSection = document.getElementById(`exercise-video-section-inline-${exerciseIndex}`);
        iframe = document.getElementById(`exercise-video-iframe-inline-${exerciseIndex}`);
    }
    if (!videoSection || !iframe) {
        videoSection = document.getElementById('exercise-video-section');
        iframe = document.getElementById('exercise-video-iframe');
    }

    if (!videoSection || !iframe) return;

    const embedUrl = convertYouTubeUrl(videoUrl);

    // Check if it's a valid URL (not a placeholder)
    if (!embedUrl || embedUrl.includes('example') || (embedUrl === videoUrl && !embedUrl.includes('youtube'))) {
        return;
    }

    iframe.src = embedUrl;
    videoSection.classList.remove('hidden');
}

export function hideExerciseVideo(exerciseIndex) {
    // Try inline video section first, then modal version
    let videoSection, iframe;
    if (exerciseIndex !== undefined) {
        videoSection = document.getElementById(`exercise-video-section-inline-${exerciseIndex}`);
        iframe = document.getElementById(`exercise-video-iframe-inline-${exerciseIndex}`);
    }
    if (!videoSection || !iframe) {
        videoSection = document.getElementById('exercise-video-section');
        iframe = document.getElementById('exercise-video-iframe');
    }

    if (videoSection) videoSection.classList.add('hidden');
    if (iframe) iframe.src = '';
}

/**
 * Show form video with 3-tier resolution and toggle buttons.
 * If videoUrl is provided directly, uses it. Otherwise resolves from equipment/exercise.
 */
export async function showExerciseVideoAndToggleButton(videoUrl, exerciseName, exerciseIndex) {
    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);
    const sourceLabel = document.getElementById(`video-source-label-${exerciseIndex}`);

    let url = videoUrl;
    let label = null;

    // If no direct URL, resolve from equipment/exercise
    if (!url) {
        const exercise = AppState.currentWorkout?.exercises?.[exerciseIndex];
        const equipmentName = exercise?.equipment || null;
        const resolved = await resolveFormVideo(exerciseName, equipmentName);
        url = resolved.url;
        label = resolved.label;
    }

    if (!url) {
        showNotification('No form video available', 'info', 1500);
        return;
    }

    showExerciseVideo(url, exerciseName, exerciseIndex);

    // Update source label if present
    if (sourceLabel && label) {
        sourceLabel.textContent = label;
        sourceLabel.classList.remove('hidden');
    }

    if (showBtn) showBtn.classList.add('hidden');
    if (hideBtn) hideBtn.classList.remove('hidden');
}

export function hideExerciseVideoAndToggleButton(exerciseIndex) {
    hideExerciseVideo(exerciseIndex);

    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);
    const sourceLabel = document.getElementById(`video-source-label-${exerciseIndex}`);

    if (showBtn) showBtn.classList.remove('hidden');
    if (hideBtn) hideBtn.classList.add('hidden');
    if (sourceLabel) sourceLabel.classList.add('hidden');
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
