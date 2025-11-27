// Enhanced Exercise Library Module - core/exercise-library.js
import { showNotification } from './ui-helpers.js';

export function getExerciseLibrary(appState) {
    let isOpen = false;
    let currentContext = null; // 'template', 'workout-add', 'manual-workout'
    let currentExercises = [];
    let filteredExercises = [];

    return {
        initialize() {
            console.log('📚 Exercise Library initialized');
        },

        // REMOVED: openForSwap() - Replaced by delete + add workflow

        // ADD THE MISSING openForManualWorkout FUNCTION
        async openForManualWorkout() {
            if (!appState.currentUser) {
                showNotification('Please sign in to add exercises', 'warning');
                return;
            }

            currentContext = 'manual-workout';
            console.log(' Context set to:', currentContext);
            
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

            console.log(' loadAndShow called with context:', currentContext);

            modal.classList.remove('hidden');
            isOpen = true;

            try {
                await this.loadExercises();
                this.renderExercises();
                this.setupEventHandlers(); // ← ADD THIS LINE
                console.log(` Loaded ${filteredExercises.length} exercises for context: ${currentContext}`);
            } catch (error) {
                console.error('Error loading exercises:', error);
                currentExercises = appState.exerciseDatabase || [];
                filteredExercises = [...currentExercises];
                this.setupEventHandlers(); // ← ADD THIS LINE HERE TOO
            }
        },

        async loadExercises() {
            try {
                const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(appState); // ← Fixed: use lowercase
                currentExercises = await workoutManager.getExerciseLibrary();
                filteredExercises = [...currentExercises];
                
                console.log(` Loaded ${currentExercises.length} exercises for context: ${currentContext}`);
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
            filteredExercises.forEach(exercise => {
                const card = this.createExerciseCard(exercise);
                grid.appendChild(card);
            });
        },

        // FIXED createExerciseCard function (only one version)
        createExerciseCard(exercise) {
            const card = document.createElement('div');
            card.className = 'library-exercise-card';
            
            // Debug logging
            console.log(' Creating exercise card with context:', currentContext);
            console.log(' Exercise name:', exercise.name || exercise.machine);
            
            let actionButton = '';
            const exerciseJson = JSON.stringify(exercise).replace(/"/g, '&quot;');
            
            switch (currentContext) {
                // REMOVED: 'swap' case - Replaced by delete + add workflow

                case 'manual-workout':
                    console.log(' Using manual-workout case');
                    actionButton = `
                        <button class="btn btn-primary btn-small" onclick='addToManualWorkoutFromLibrary("${exerciseJson}")'>
                            <i class="fas fa-plus"></i> Add Exercise
                        </button>
                    `;
                    break;
                    
                case 'template':
                    actionButton = `
                        <button class="btn btn-primary btn-small" onclick="addExerciseToTemplateFromLibrary(${exerciseJson})">
                            <i class="fas fa-plus"></i> Add to Template
                        </button>
                    `;
                    break;
                    
                case 'workout-add':
                    actionButton = `
                        <button class="btn btn-success btn-small" onclick="confirmExerciseAddToWorkout('${exerciseJson}')">
                            <i class="fas fa-plus"></i> Add to Workout
                        </button>
                    `;
                    break;
                    
                default:
                    console.log(' Using default case, currentContext is:', currentContext);
                    actionButton = `
                        <button class="btn btn-secondary btn-small" onclick="selectExerciseGeneric('${exercise.name || exercise.machine}', '${exerciseJson}')">
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
        
        console.log(' Generic exercise selection:', exercise);
        
        // Close the library modal
        const modal = document.getElementById('exercise-library-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        // Show selection feedback
        showNotification(`Selected "${exercise.name || exercise.machine}"`, 'success');
        
    } catch (error) {
        console.error('Error in selectExerciseGeneric:', error);
        showNotification('Error selecting exercise', 'error');
    }
}

// Make it globally available
window.selectExerciseGeneric = selectExerciseGeneric;