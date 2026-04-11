// Enhanced Exercise Library Module - core/exercise-library.js
import { showNotification, escapeHtml, openModal, closeModal } from '../ui/ui-helpers.js';

export function getExerciseLibrary(appState) {
    let isOpen = false;
    let currentContext = null; // 'template', 'workout-add', 'manual-workout'
    let currentExercises = [];
    let filteredExercises = [];
    let recentExercises = [];
    let favoriteExercises = []; // Array of exercise name strings

    return {
        initialize() {
            // Exercise library ready
        },

        async loadFavorites() {
            try {
                const { doc, db, getDoc } = await import('./firebase-config.js');
                const favRef = doc(db, 'users', appState.currentUser.uid, 'preferences', 'favorites');
                const snap = await getDoc(favRef);
                if (snap.exists()) {
                    favoriteExercises = snap.data().exercises || [];
                } else {
                    favoriteExercises = [];
                }
            } catch {
                favoriteExercises = [];
            }
        },

        async toggleFavorite(exerciseName) {
            try {
                const { doc, db, setDoc } = await import('./firebase-config.js');
                const favRef = doc(db, 'users', appState.currentUser.uid, 'preferences', 'favorites');
                const idx = favoriteExercises.indexOf(exerciseName);
                if (idx >= 0) {
                    favoriteExercises.splice(idx, 1);
                } else {
                    favoriteExercises.push(exerciseName);
                }
                await setDoc(favRef, { exercises: favoriteExercises }, { merge: true });
                this.renderExercises(); // Re-render to update star icons
            } catch (err) {
                console.error('Error toggling favorite:', err);
                showNotification('Error saving favorite', 'error');
            }
        },

        isFavorite(exerciseName) {
            return favoriteExercises.includes(exerciseName);
        },

        async openForManualWorkout() {
            if (!appState.currentUser) {
                showNotification('Please sign in to add exercises', 'warning');
                return;
            }

            currentContext = 'manual-workout';

            const modal = document.getElementById('exercise-library-modal');
            const modalTitle = document.querySelector('#exercise-library-modal .modal-title');

            if (modalTitle) {
                modalTitle.textContent = 'Add Exercise to Manual Workout';
            }

            await this.loadAndShow();
        },

        async openForTemplate(template) {
            currentContext = 'template';
            appState.addingToTemplate = true;
            appState.templateEditingContext = template;

            const modal = document.getElementById('exercise-library-modal');
            const modalTitle = document.querySelector('#exercise-library-modal .modal-title');

            if (modalTitle) {
                modalTitle.textContent = 'Add Exercise to Template';
            }

            await this.loadAndShow();
        },

        async openForWorkoutAdd() {
            if (!appState.currentUser || !appState.currentWorkout) {
                showNotification('No active workout to add exercises to', 'warning');
                return;
            }

            currentContext = 'workout-add';

            const modal = document.getElementById('exercise-library-modal');
            const modalTitle = document.querySelector('#exercise-library-modal .modal-title');

            if (modalTitle) {
                modalTitle.textContent = 'Add Exercise to Workout';
            }

            await this.loadAndShow();
        },

        async loadAndShow() {
            const modal = document.getElementById('exercise-library-modal');
            if (!modal) return;

            openModal(modal);
            isOpen = true;

            try {
                await this.loadExercises();
                // Load recent exercises and favorites in parallel
                try {
                    const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
                    const workoutManager = new FirebaseWorkoutManager(appState);
                    const [recent] = await Promise.all([
                        workoutManager.getMostUsedExercises(8),
                        this.loadFavorites(),
                    ]);
                    recentExercises = recent;
                } catch {
                    recentExercises = [];
                }
                this.renderExercises();
                this.setupEventHandlers();
            } catch (error) {
                console.error('Error loading exercises:', error);
                currentExercises = appState.exerciseDatabase || [];
                filteredExercises = [...currentExercises];
                this.setupEventHandlers();
            }
        },

        async loadExercises() {
            try {
                const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(appState);
                currentExercises = await workoutManager.getExerciseLibrary();
                filteredExercises = [...currentExercises];
            } catch (error) {
                console.error('Error loading exercises:', error);
                currentExercises = appState.exerciseDatabase || [];
                filteredExercises = [...currentExercises];
            }
        },

        renderExercises() {
            const grid = document.getElementById('exercise-library-grid');
            if (!grid) return;

            if (filteredExercises.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <h3>No Exercises Found</h3>
                        <p>Try adjusting your search or filters.</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = '';

            // Favorites section
            if (favoriteExercises.length > 0) {
                const favSection = document.createElement('div');
                favSection.className = 'favorites-section';
                const favExercises = favoriteExercises
                    .map(name => currentExercises.find(ex => (ex.name || ex.machine) === name) || { name, machine: name })
                    .filter(Boolean);
                if (favExercises.length > 0) {
                    favSection.innerHTML = `
                        <div class="quick-add-label"><i class="fas fa-star" style="color: gold; margin-right: 4px;"></i> Favorites</div>
                        <div class="quick-add-chips">
                            ${favExercises.map((ex) => `<button class="quick-add-chip favorite-chip" data-exercise-name="${escapeHtml(ex.name || ex.machine)}" data-equipment="${escapeHtml(ex.equipment || '')}">${escapeHtml(ex.name || ex.machine)}</button>`).join('')}
                        </div>
                    `;
                    grid.appendChild(favSection);
                }
            }

            // Quick Add chips for recently used exercises
            if (recentExercises.length > 0) {
                const quickAddSection = document.createElement('div');
                quickAddSection.className = 'quick-add-section';
                quickAddSection.innerHTML = `
                    <div class="quick-add-label">Quick Add</div>
                    <div class="quick-add-chips">
                        ${recentExercises.map((ex) => `<button class="quick-add-chip" data-exercise-name="${escapeHtml(ex.name)}" data-equipment="${escapeHtml(ex.equipment)}">${escapeHtml(ex.name)}</button>`).join('')}
                    </div>
                `;
                grid.appendChild(quickAddSection);
            }

            filteredExercises.forEach((exercise, index) => {
                const card = this.createExerciseCard(exercise, index);
                grid.appendChild(card);
            });

            // Setup click handlers using event delegation
            this.setupExerciseButtonHandlers(grid);
        },

        setupExerciseButtonHandlers(grid) {
            grid.addEventListener('click', (e) => {
                // Handle favorite toggle
                const favBtn = e.target.closest('.favorite-toggle');
                if (favBtn) {
                    e.stopPropagation();
                    const name = favBtn.dataset.favorite;
                    if (name) this.toggleFavorite(name);
                    return;
                }

                // Handle Quick Add chip clicks — route through the same context-based selection
                const chip = e.target.closest('.quick-add-chip');
                if (chip) {
                    const name = chip.dataset.exerciseName;
                    const equipment = chip.dataset.equipment;
                    const exercise = currentExercises.find((ex) => (ex.name || ex.machine) === name) || { name, equipment };
                    this.handleExerciseSelection(exercise);
                    return;
                }

                const btn = e.target.closest('.exercise-add-btn');
                if (!btn) return;

                const index = parseInt(btn.dataset.index);
                const exercise = filteredExercises[index];
                if (!exercise) return;

                this.handleExerciseSelection(exercise);
            });
        },

        handleExerciseSelection(exercise) {
            switch (currentContext) {
                case 'manual-workout':
                    if (window.addToManualWorkoutFromLibrary) {
                        window.addToManualWorkoutFromLibrary(exercise);
                    }
                    break;
                case 'template':
                    if (window.addExerciseToTemplateFromLibrary) {
                        window.addExerciseToTemplateFromLibrary(exercise);
                    }
                    break;
                case 'workout-add':
                    if (window.confirmExerciseAddToWorkout) {
                        window.confirmExerciseAddToWorkout(JSON.stringify(exercise));
                    }
                    break;
                default:
                    if (window.selectExerciseGeneric) {
                        window.selectExerciseGeneric(exercise.name || exercise.machine, JSON.stringify(exercise));
                    }
            }
        },

        // FIXED createExerciseCard function - uses index to avoid JSON escaping issues
        createExerciseCard(exercise, index) {
            const card = document.createElement('div');
            card.className = 'library-exercise-card';
            card.dataset.exerciseIndex = index;

            let actionButton = '';

            switch (currentContext) {
                case 'manual-workout':
                    actionButton = `
                        <button class="btn btn-primary btn-small exercise-add-btn" data-index="${index}">
                            <i class="fas fa-plus"></i> Add Exercise
                        </button>
                    `;
                    break;

                case 'template':
                    actionButton = `
                        <button class="btn btn-primary btn-small exercise-add-btn" data-index="${index}">
                            <i class="fas fa-plus"></i> Add to Template
                        </button>
                    `;
                    break;

                case 'workout-add':
                    actionButton = `
                        <button class="btn btn-success btn-small exercise-add-btn" data-index="${index}">
                            <i class="fas fa-plus"></i> Add to Workout
                        </button>
                    `;
                    break;

                default:
                    actionButton = `
                        <button class="btn btn-secondary btn-small exercise-add-btn" data-index="${index}">
                            <i class="fas fa-check"></i> Select
                        </button>
                    `;
            }

            const exerciseName = exercise.name || exercise.machine;
            const isFav = this.isFavorite(exerciseName);
            card.innerHTML = `
                <div class="library-exercise-header-row">
                    <h5>${escapeHtml(exerciseName)}</h5>
                    <button class="btn-icon favorite-toggle ${isFav ? 'active' : ''}" data-favorite="${escapeHtml(exerciseName)}" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="library-exercise-info">
                    ${escapeHtml(exercise.bodyPart || 'General')} • ${escapeHtml(exercise.equipmentType || 'Machine')}
                    ${exercise.isCustom ? ' • Custom' : ''}
                </div>
                <div class="library-exercise-stats">
                    ${exercise.sets || 3} sets × ${exercise.reps || 10} reps @ ${exercise.weight || 50} lbs
                </div>
                <div class="library-exercise-actions">
                    ${actionButton}
                </div>
            `;

            return card;
        },

        setupEventHandlers() {
            // Search functionality
            const searchInput = document.getElementById('exercise-library-search');
            if (searchInput) {
                searchInput.oninput = () => this.filterExercises();
            }

            // Filter dropdowns
            const bodyPartFilter = document.getElementById('body-part-filter');
            const equipmentFilter = document.getElementById('equipment-filter');

            if (bodyPartFilter) {
                bodyPartFilter.onchange = () => this.filterExercises();
            }
            if (equipmentFilter) {
                equipmentFilter.onchange = () => this.filterExercises();
            }
        },

        filterExercises() {
            const searchQuery = document.getElementById('exercise-library-search')?.value.toLowerCase() || '';
            const bodyPartFilter = document.getElementById('body-part-filter')?.value || '';
            const equipmentFilter = document.getElementById('equipment-filter')?.value || '';

            filteredExercises = currentExercises.filter((exercise) => {
                // Text search
                const matchesSearch =
                    !searchQuery ||
                    exercise.name?.toLowerCase().includes(searchQuery) ||
                    exercise.machine?.toLowerCase().includes(searchQuery) ||
                    exercise.bodyPart?.toLowerCase().includes(searchQuery) ||
                    exercise.equipmentType?.toLowerCase().includes(searchQuery) ||
                    (exercise.tags && exercise.tags.some((tag) => tag.toLowerCase().includes(searchQuery)));

                // Body part filter
                const matchesBodyPart =
                    !bodyPartFilter || exercise.bodyPart?.toLowerCase() === bodyPartFilter.toLowerCase();

                // Equipment filter
                const matchesEquipment =
                    !equipmentFilter || exercise.equipmentType?.toLowerCase() === equipmentFilter.toLowerCase();

                return matchesSearch && matchesBodyPart && matchesEquipment;
            });

            this.renderExercises();
        },

        async refresh() {
            if (isOpen) {
                await this.loadExercises();
                this.renderExercises();
            }
        },

        close() {
            const modal = document.getElementById('exercise-library-modal');
            if (modal) {
                closeModal(modal);
            }

            // Reset state
            isOpen = false;
            currentContext = null;
            appState.swappingExerciseIndex = null;
            appState.addingExerciseToWorkout = false;
            appState.addingToTemplate = false;
            appState.insertAfterIndex = null;
            appState.templateEditingContext = null;

            // Clear search and filters
            const searchInput = document.getElementById('exercise-library-search');
            const bodyPartFilter = document.getElementById('body-part-filter');
            const equipmentFilter = document.getElementById('equipment-filter');

            if (searchInput) searchInput.value = '';
            if (bodyPartFilter) bodyPartFilter.value = '';
            if (equipmentFilter) equipmentFilter.value = '';

            // Reset modal title
            const modalTitle = document.querySelector('#exercise-library-modal .modal-title');
            if (modalTitle) {
                modalTitle.textContent = 'Exercise Library';
            }
        },
    };
}

// Missing function - add at the bottom
function selectExerciseGeneric(exerciseDataOrName, exerciseJson) {
    try {
        let exercise;

        // Handle different parameter formats
        if (arguments.length === 2) {
            // Format: selectExerciseGeneric('Exercise Name', 'jsonString')
            const exerciseName = exerciseDataOrName;
            exercise = typeof exerciseJson === 'string' ? JSON.parse(exerciseJson) : exerciseJson;
        } else if (arguments.length === 1) {
            // Format: selectExerciseGeneric(exerciseObject) or selectExerciseGeneric('Exercise Name')
            if (typeof exerciseDataOrName === 'string') {
                // Just a name string - create a simple exercise object
                exercise = {
                    name: exerciseDataOrName,
                    machine: exerciseDataOrName,
                };
            } else {
                // Full exercise object
                exercise = exerciseDataOrName;
            }
        } else {
            throw new Error('Invalid parameters');
        }

        // Close the library modal
        const modal = document.getElementById('exercise-library-modal');
        if (modal) {
            closeModal(modal);
        }
    } catch (error) {
        console.error('Error in selectExerciseGeneric:', error);
        showNotification('Error selecting exercise', 'error');
    }
}

// Make it globally available
window.selectExerciseGeneric = selectExerciseGeneric;
