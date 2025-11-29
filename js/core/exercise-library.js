// Enhanced Exercise Library Module - core/exercise-library.js
import { showNotification } from './ui-helpers.js';

export function getExerciseLibrary(appState) {
    let isOpen = false;
    let currentContext = null; // 'template', 'workout-add', 'manual-workout'
    let currentExercises = [];
    let filteredExercises = [];

    return {
        initialize() {
            // Exercise library ready
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

            modal.classList.remove('hidden');
            isOpen = true;

            try {
                await this.loadExercises();
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
            filteredExercises.forEach((exercise, index) => {
                const card = this.createExerciseCard(exercise, index);
                grid.appendChild(card);
            });

            // Setup click handlers using event delegation
            this.setupExerciseButtonHandlers(grid);
        },

        setupExerciseButtonHandlers(grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('.exercise-add-btn');
                if (!btn) return;

                const index = parseInt(btn.dataset.index);
                const exercise = filteredExercises[index];
                if (!exercise) return;

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
            });
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

            card.innerHTML = `
                <h5>${exercise.name || exercise.machine}</h5>
                <div class="library-exercise-info">
                    ${exercise.bodyPart || 'General'} • ${exercise.equipmentType || 'Machine'}
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

            filteredExercises = currentExercises.filter(exercise => {
                // Text search
                const matchesSearch = !searchQuery || 
                    exercise.name?.toLowerCase().includes(searchQuery) ||
                    exercise.machine?.toLowerCase().includes(searchQuery) ||
                    exercise.bodyPart?.toLowerCase().includes(searchQuery) ||
                    exercise.equipmentType?.toLowerCase().includes(searchQuery) ||
                    (exercise.tags && exercise.tags.some(tag => tag.toLowerCase().includes(searchQuery)));

                // Body part filter
                const matchesBodyPart = !bodyPartFilter || 
                    exercise.bodyPart?.toLowerCase() === bodyPartFilter.toLowerCase();

                // Equipment filter
                const matchesEquipment = !equipmentFilter || 
                    exercise.equipmentType?.toLowerCase() === equipmentFilter.toLowerCase();

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
                modal.classList.add('hidden');
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
        }
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
                    machine: exerciseDataOrName 
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
            modal.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Error in selectExerciseGeneric:', error);
        showNotification('Error selecting exercise', 'error');
    }
}

// Make it globally available
window.selectExerciseGeneric = selectExerciseGeneric;