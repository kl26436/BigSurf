// Clean Workout History Module with Calendar View - core/workout-history.js
import { showNotification } from './ui-helpers.js';

export function getWorkoutHistory(appState) {
    let currentHistory = [];
    let filteredHistory = [];
    
    // Calendar-specific state
    let currentCalendarDate = new Date();
    let calendarWorkouts = {};
    let firstWorkoutDate = null; // Track the earliest workout date

    return {
        currentHistory,
        filteredHistory,
        currentCalendarDate,
        calendarWorkouts,
        firstWorkoutDate,

        initialize() {
            console.log('📊 Workout History initialized with calendar view');
            this.setupEventListeners();
        },

        setupEventListeners() {
            // Search functionality
            const searchInput = document.querySelector('.search-input');
            const clearSearchBtn = document.querySelector('#clear-search');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filterHistory(e.target.value);
                });
            }

            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    this.filterHistory('');
                });
            }

            // Setup modal close handler
            const modal = document.getElementById('workoutModal');
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.closeWorkoutDetailModal();
                    }
                });
            }
        },

        // Core data loading
        async loadHistory() {
            if (!appState.currentUser) return;

            try {
                const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(appState);
                
                this.currentHistory = await workoutManager.getUserWorkouts();
                this.filteredHistory = [...this.currentHistory];

                // Find the earliest workout date
                if (this.currentHistory.length > 0) {
                    const dates = this.currentHistory
                        .map(workout => workout.date)
                        .filter(date => date) // Remove null/undefined dates
                        .sort();
                    
                    if (dates.length > 0) {
                        this.firstWorkoutDate = dates[0];
                        console.log(` First workout date found: ${this.firstWorkoutDate}`);
                    }
                }

                console.log(` Loaded ${this.currentHistory.length} workout entries`);

            } catch (error) {
                console.error('❌ Error loading workout history:', error);
                showNotification('Error loading workout history', 'error');
            }
        },

        // Calendar Methods
        async initializeCalendar() {
            await this.loadHistory();
            await this.loadCalendarWorkouts();
            this.updateCalendarDisplay();
        },

        async loadCalendarWorkouts() {
            if (!appState.currentUser) return;
            
            try {
                const year = this.currentCalendarDate.getFullYear();
                const month = this.currentCalendarDate.getMonth();
                
                console.log(` Loading workouts for ${year}-${month + 1}`);
                
                // Clear existing calendar workouts
                this.calendarWorkouts = {};
                
                this.currentHistory.forEach(workout => {
                    if (!workout.date) {
                        console.warn('Workout missing date:', workout);
                        return;
                    }
                    
                    // FIX: Handle date parsing correctly to avoid timezone issues
                    let workoutDate;
                    if (typeof workout.date === 'string') {
                        // If it's a date string like "2025-09-01", parse it as local date
                        const dateParts = workout.date.split('-');
                        if (dateParts.length === 3) {
                            // Create date in local timezone to avoid offset issues
                            workoutDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                        } else {
                            // Fallback to regular parsing
                            workoutDate = new Date(workout.date);
                        }
                    } else {
                        // Handle Date objects or timestamps
                        workoutDate = new Date(workout.date);
                    }
                    
                    // Check if this workout is in the current calendar month
                    if (workoutDate.getFullYear() === year && workoutDate.getMonth() === month) {
                        // Use the original date string as the key to avoid timezone conversion
                        const dateKey = workout.date.split('T')[0]; // Remove time component if present
                        this.calendarWorkouts[dateKey] = this.formatWorkoutForCalendar(workout);
                        
                        console.log(`Added workout: ${dateKey} - ${workout.workoutType}`);
                    }
                });
                
                console.log(` Loaded ${Object.keys(this.calendarWorkouts).length} workouts for calendar`);
                console.log('Calendar workouts:', Object.keys(this.calendarWorkouts));
                
            } catch (error) {
                console.error('❌ Error loading calendar workouts:', error);
            }
        },

        formatWorkoutForCalendar(workout) {
            // Determine workout category
            let category = 'other';
            const workoutType = workout.workoutType?.toLowerCase() || '';
            
            if (workoutType.includes('push') || workoutType.includes('chest') || workoutType.includes('shoulder') || workoutType.includes('tricep')) {
                category = 'push';
            } else if (workoutType.includes('pull') || workoutType.includes('back') || workoutType.includes('bicep')) {
                category = 'pull';
            } else if (workoutType.includes('leg') || workoutType.includes('quad') || workoutType.includes('glute') || workoutType.includes('hamstring')) {
                category = 'legs';
            } else if (workoutType.includes('cardio') || workoutType.includes('core')) {
                category = 'cardio';
            }
            
            // Determine status
            let status = 'completed';
            if (workout.cancelledAt) {
                status = 'cancelled';
            } else if (workout.progress && workout.progress.percentage < 100) {
                status = 'partial';
            }
            
            // FIX: Duration calculation - handle both minutes and milliseconds
            const duration = this.formatDuration(this.getWorkoutDuration(workout)) || 'Quick session';
            
            // Convert exercise data
            const exercises = [];
            if (workout.exercises && workout.exerciseNames) {
                Object.keys(workout.exercises).forEach(exerciseKey => {
                    const exerciseData = workout.exercises[exerciseKey];
                    const exerciseName = workout.exerciseNames[exerciseKey] || exerciseKey;

                    // Get video from original workout template
                    const exerciseIndex = exerciseKey.replace('exercise_', '');
                    const video = workout.originalWorkout?.exercises?.[exerciseIndex]?.video || '';

                    if (exerciseData && exerciseData.sets) {
                        exercises.push({
                            name: exerciseName,
                            sets: exerciseData.sets.filter(set => set && (set.reps || set.weight)),
                            notes: exerciseData.notes || '',
                            video: video
                        });
                    }
                });
            }
            
            return {
                name: workout.workoutType || 'Workout',
                category: category,
                status: status,
                progress: workout.progress?.percentage || (status === 'completed' ? 100 : 0),
                duration: duration,
                exercises: exercises,
                rawData: workout
            };
        },

        previousMonth() {
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
            this.initializeCalendar();
        },

        nextMonth() {
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
            this.initializeCalendar();
        },
       
        updateCalendarDisplay() {
        const monthName = this.currentCalendarDate.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        // Use the correct selector that we confirmed exists
        const monthElement = document.querySelector('.current-month');
        if (monthElement) {
            monthElement.textContent = monthName;
            console.log(' Updated month display:', monthName);
        } else {
            console.error('❌ Could not find .current-month element');
        }
        
        this.generateCalendarGrid();
    },

      generateCalendarGrid() {
    // Enhanced element finding with fallback creation
    let calendarGrid = document.getElementById('calendarGrid');
    
    // If not found by ID, try other selectors
    if (!calendarGrid) {
        calendarGrid = document.querySelector('.calendar-grid') || 
                      document.querySelector('[class*="calendar-grid"]');
    }
    
    // If still not found, create it
    if (!calendarGrid) {
        console.log(' Calendar grid not found, creating it...');
        
        const container = document.querySelector('.calendar-container') || 
                         document.querySelector('[class*="calendar"]') ||
                         document.getElementById('workout-history-section');
        
        if (container) {
            calendarGrid = document.createElement('div');
            calendarGrid.id = 'calendarGrid';
            calendarGrid.className = 'calendar-grid';
            container.appendChild(calendarGrid);
            console.log(' Calendar grid created');
        } else {
            console.error('❌ Cannot find calendar container');
            return;
        }
    }
    
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
    
    // Get today's date in local timezone for proper comparison
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    let html = '';
    let currentDate = new Date(startDate);
    
    // Generate 6 weeks (42 days) to fill calendar grid
    for (let i = 0; i < 42; i++) {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const isCurrentMonth = currentDate.getMonth() === month;
        const isToday = dateStr === todayStr;
        const isFutureDate = currentDate > today;
        
        // Check if this date is before the first workout
        const isBeforeFirstWorkout = this.firstWorkoutDate ? dateStr < this.firstWorkoutDate : false;
        
        const workout = this.calendarWorkouts[dateStr];
        
        let dayClass = 'calendar-day';
        if (!isCurrentMonth) {
            dayClass += ' other-month empty-day'; // Add empty-day class for styling
        }
        if (isToday) dayClass += ' today';
        
        // UPDATED: Remove the old onclick and add data attributes instead
        html += `<div class="${dayClass}" data-date="${dateStr}"`;
        
        // Add cursor pointer style if there's a workout
        if (workout && isCurrentMonth) {
            html += ` style="cursor: pointer;"`;
        }
        
        html += `>`;
        
        // Only show content for current month days
        if (isCurrentMonth) {
            html += `<div class="day-number">${currentDate.getDate()}</div>`;
            
            if (workout) {
                html += this.getWorkoutIcon(workout);
                html += `<div class="workout-status status-${workout.status}">
                    ${workout.status === 'completed' ? 'Complete' : workout.progress + '%'}
                </div>`;
            } else if (isCurrentMonth && !isFutureDate && !isBeforeFirstWorkout && !isToday) {
                // Only show red X for past dates that are AFTER the first workout date
                html += `<div class="no-workout">
                    <i class="fas fa-times"></i>
                </div>`;
            }
        }
        // Other month days are completely empty
        
        html += '</div>';
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    calendarGrid.innerHTML = html;
    console.log(' Calendar grid populated with', calendarGrid.children.length, 'days');
    
    // ADDED: Setup click events after rendering
    this.setupCalendarClickEvents();
},

        getWorkoutIcon(workout) {
            const iconMap = {
                'push': '<i class="fas fa-hand-paper"></i>',
                'pull': '<i class="fas fa-fist-raised"></i>', 
                'legs': '<i class="fas fa-walking"></i>',
                'cardio': '<i class="fas fa-heartbeat"></i>',
                'core': '<i class="fas fa-heartbeat"></i>',
                'other': '<i class="fas fa-dumbbell"></i>'
            };
            
            const icon = iconMap[workout.category] || iconMap['other'];
            return `<div class="workout-icon ${workout.category}">${icon}</div>`;
        },

        showWorkoutDetail(date, workoutName) {
        const modal = document.getElementById('workoutModal');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');
        
        if (!modal || !title || !body) return;
        
        // FIXED: Create timezone-safe date display
        let displayDate;
        if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Add noon time to prevent timezone shift
            const safeDate = new Date(date + 'T12:00:00');
            displayDate = safeDate.toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric'
            });
        } else {
            displayDate = 'Unknown Date';
        }
        title.textContent = `${workoutName} - ${displayDate}`;
        
        const workout = this.calendarWorkouts[date];
        if (!workout) {
            body.innerHTML = '<p>No workout data available for this date.</p>';
            modal.style.display = 'flex';
            return;
        }
        
        body.innerHTML = this.generateWorkoutDetailHTML(workout, date);
        modal.style.display = 'flex';
    },

       generateWorkoutDetailHTML(workout, date) {
        let exerciseHTML = '';
        
        if (workout.exercises && workout.exercises.length > 0) {
            workout.exercises.forEach(exercise => {
                exerciseHTML += `
                    <div style="background: var(--bg-tertiary); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; border: 1px solid var(--border);">
                        <h4 style="color: var(--primary); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-trophy" style="color: var(--warning);"></i>
                            ${exercise.name}
                        </h4>
                        
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <th style="text-align: left; padding: 0.75rem; color: var(--text-secondary);">Set</th>
                                    <th style="text-align: left; padding: 0.75rem; color: var(--text-secondary);">Reps</th>
                                    <th style="text-align: left; padding: 0.75rem; color: var(--text-secondary);">Weight</th>
                                </tr>
                            </thead>
                            <tbody>`;
                
                if (exercise.sets && exercise.sets.length > 0) {
                    exercise.sets.forEach((set, index) => {
                        if (set && (set.reps || set.weight)) {
                            exerciseHTML += `
                                <tr style="background: rgba(40, 167, 69, 0.1); border-bottom: 1px solid rgba(40, 167, 69, 0.2);">
                                    <td style="padding: 0.75rem; color: var(--text-primary);">Set ${index + 1}</td>
                                    <td style="padding: 0.75rem; color: var(--text-primary);">${set.reps || '-'}</td>
                                    <td style="padding: 0.75rem; color: var(--text-primary);">${set.weight ? set.weight + ' lbs' : '-'}</td>
                                </tr>`;
                        }
                    });
                } else {
                    exerciseHTML += `
                        <tr>
                            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-secondary); font-style: italic;">No sets recorded</td>
                        </tr>`;
                }
                
                exerciseHTML += `</tbody></table>`;

                if (exercise.notes) {
                    exerciseHTML += `
                        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 6px; margin-top: 1rem; border-left: 3px solid var(--primary);">
                            <strong style="color: var(--primary); display: block; margin-bottom: 0.5rem;">Notes:</strong>
                            <span style="color: var(--text-primary);">${exercise.notes}</span>
                        </div>`;
                }

                if (exercise.video) {
                    exerciseHTML += `
                        <div style="margin-top: 1rem;">
                            <button class="btn btn-primary btn-small" onclick="showExerciseVideo('${exercise.video}', '${exercise.name}')">
                                <i class="fas fa-play"></i> Watch Form Video
                            </button>
                        </div>`;
                }

                exerciseHTML += `</div>`;
            });
        } else {
            exerciseHTML = `
                <div style="background: var(--bg-tertiary); padding: 2rem; border-radius: 8px; text-align: center; color: var(--text-secondary);">
                    <i class="fas fa-dumbbell" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>No exercise data available for this workout.</p>
                </div>`;
        }
        
        // Add manual workout notes if they exist
        let notesSection = '';
        if (workout.rawData && workout.rawData.manualNotes) {
            notesSection = `
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--info);">
                    <strong style="color: var(--info); display: block; margin-bottom: 0.5rem;">Workout Notes:</strong>
                    <span style="color: var(--text-primary);">${workout.rawData.manualNotes}</span>
                </div>`;
        }
        
        // Create action buttons based on workout status
        let actionButtons = '';
        if (workout.status === 'cancelled' || workout.status === 'partial') {
            actionButtons = `
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn btn-danger" onclick="deleteWorkoutFromCalendar('${date}')">
                        <i class="fas fa-trash"></i> Delete This Workout
                    </button>
                    <button class="btn btn-secondary" onclick="workoutHistory.repeatWorkout('${date}')">
                        <i class="fas fa-redo"></i> Repeat Workout
                    </button>
                </div>
            `;
        } else {
            actionButtons = `
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="workoutHistory.repeatWorkout('${date}')">
                        <i class="fas fa-redo"></i> Repeat Workout
                    </button>
                    <button class="btn btn-danger" onclick="deleteWorkoutFromCalendar('${date}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
        }
        
        // Format workout times
        const rawData = workout.rawData || {};
        const startTime = rawData.startedAt ? new Date(rawData.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
        const endTime = rawData.completedAt ? new Date(rawData.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
        const totalDuration = rawData.totalDuration ? this.formatDuration(rawData.totalDuration) : workout.duration;

        return `
            <div style="margin-bottom: 1.5rem;">
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.75rem 1rem; align-items: center;">
                    <strong style="color: var(--text-secondary);">Status:</strong>
                    <span style="color: ${workout.status === 'completed' ? 'var(--success)' : workout.status === 'cancelled' ? 'var(--danger)' : 'var(--warning)'};">
                        <i class="fas fa-${workout.status === 'completed' ? 'check-circle' : workout.status === 'cancelled' ? 'times-circle' : 'exclamation-circle'}"></i>
                        ${workout.status.charAt(0).toUpperCase() + workout.status.slice(1)}
                    </span>

                    ${startTime ? `
                        <strong style="color: var(--text-secondary);">Started:</strong>
                        <span style="color: var(--text-primary);">
                            <i class="fas fa-clock"></i> ${startTime}
                        </span>
                    ` : ''}

                    ${endTime ? `
                        <strong style="color: var(--text-secondary);">Finished:</strong>
                        <span style="color: var(--text-primary);">
                            <i class="fas fa-flag-checkered"></i> ${endTime}
                        </span>
                    ` : ''}

                    <strong style="color: var(--text-secondary);">Duration:</strong>
                    <span style="color: var(--primary); font-weight: 600;">
                        <i class="fas fa-stopwatch"></i> ${totalDuration || 'Unknown'}
                    </span>

                    <strong style="color: var(--text-secondary);">Progress:</strong>
                    <span style="color: var(--text-primary);">
                        ${workout.progress || 0}%
                        <div style="background: var(--bg-tertiary); height: 6px; border-radius: 3px; overflow: hidden; margin-top: 4px;">
                            <div style="background: var(--primary); height: 100%; width: ${workout.progress || 0}%; transition: width 0.3s ease;"></div>
                        </div>
                    </span>
                </div>
            </div>
            ${notesSection}
            <div style="margin-bottom: 1rem;">
                <h3 style="color: var(--text-primary); margin-bottom: 1rem;">
                    <i class="fas fa-dumbbell"></i> Exercises & Sets
                </h3>
                ${exerciseHTML}
            </div>
            ${actionButtons}
        `;
    },

 
        closeWorkoutDetailModal() {
            const modal = document.getElementById('workoutModal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        // Setup calendar day click events
setupCalendarClickEvents() {
    // Wait a bit for the calendar to render, then add click events
    setTimeout(() => {
        document.querySelectorAll('.calendar-day').forEach(day => {
            const hasWorkout = day.querySelector('.workout-icon');
            if (hasWorkout) {
                day.addEventListener('click', (event) => {
                    event.preventDefault();
                    const dateStr = day.getAttribute('data-date');
                    const dayNumber = day.querySelector('.day-number');
                    
                    if (dayNumber && dateStr) {
                        console.log(' Clicked workout day:', dateStr);
                        
                        const calendarWorkout = this.calendarWorkouts[dateStr];
                        if (calendarWorkout) {
                            const fullWorkout = this.currentHistory.find(w => w.date === dateStr);
                            
                            if (fullWorkout) {
                                this.showFixedWorkoutModal(fullWorkout);
                            } else {
                                this.showFixedBasicModal(dateStr, calendarWorkout);
                            }
                        }
                    }
                });
            }
        });
        console.log(' Calendar click events setup complete');
    }, 100);
},

// Enhanced modal with corrected duration calculation
// TEMPORARY DEBUG FUNCTION - Add this to your workout-history.js to debug:

showFixedWorkoutModal(workout) {
    // Use the correct modal elements that actually exist
    const modal = document.getElementById('workout-detail-modal');
    const content = document.getElementById('workout-detail-content');
    
    if (!modal || !content) {
        console.error('❌ Modal elements not found');
        return;
    }
    
    // FIX 3: Timezone-safe date display
    let displayDate;
    if (workout.date && workout.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const safeDate = new Date(workout.date + 'T12:00:00');
        displayDate = safeDate.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric'
        });
    } else {
        displayDate = 'Unknown Date';
    }
    
    // CORRECTED: Duration calculation - totalDuration is stored in SECONDS
    let formattedDuration;
    if (workout.totalDuration && workout.totalDuration > 0) {
        // totalDuration is in seconds, convert to milliseconds for formatDuration
        formattedDuration = this.formatDuration(workout.totalDuration * 1000);
    } else {
        // Fallback: try to calculate from timestamps
        const durationMs = this.getWorkoutDuration(workout);
        formattedDuration = this.formatDuration(durationMs);
    }
    
    // Generate exercises HTML
    let exerciseHTML = '';
    if (workout.exercises && workout.originalWorkout?.exercises) {
        workout.originalWorkout.exercises.forEach((originalExercise, index) => {
            const exerciseKey = `exercise_${index}`;
            const exerciseData = workout.exercises[exerciseKey];
            const exerciseName = workout.exerciseNames?.[exerciseKey] || originalExercise.machine || 'Unknown Exercise';

            exerciseHTML += `
                <div class="exercise-detail-item" style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">
                    <h5 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">${exerciseName}</h5>
                    ${this.generateSetsHTML(exerciseData?.sets || [])}
                    ${exerciseData?.notes ? `<p style="margin-top: 0.5rem; font-style: italic; color: var(--text-secondary);">Notes: ${exerciseData.notes}</p>` : ''}
                </div>
            `;
        });
    } else {
        exerciseHTML = '<p>No exercise details available</p>';
    }

    // Create action buttons based on workout status
    const workoutStatus = workout.status || this.getWorkoutStatus(workout);
    let actionButtons = '';
    if (workoutStatus === 'cancelled' || workoutStatus === 'partial') {
        actionButtons = `
            <button class="btn btn-danger" onclick="deleteWorkoutFromCalendar('${workout.date}')">
                <i class="fas fa-trash"></i> Delete This Workout
            </button>
            <button class="btn btn-secondary" onclick="workoutHistory.repeatWorkout('${workout.date}')">
                <i class="fas fa-redo"></i> Repeat Workout
            </button>`;
    } else {
        actionButtons = `
            <button class="btn btn-secondary" onclick="workoutHistory.repeatWorkout('${workout.date}')">
                <i class="fas fa-redo"></i> Repeat Workout
            </button>
            <button class="btn btn-danger" onclick="deleteWorkoutFromCalendar('${workout.date}')">
                <i class="fas fa-trash"></i> Delete
            </button>`;
    }

    // Set the modal content
    content.innerHTML = `
        <div class="workout-header">
            <h3>${workout.workoutType} - ${displayDate}</h3>
        </div>

        <div class="workout-detail-summary" style="margin-bottom: 2rem;">
            <div class="workout-meta" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                <div><strong>Status:</strong> ${workoutStatus}</div>
                <div><strong>Duration:</strong> ${formattedDuration}</div>
                <div><strong>Progress:</strong> ${this.calculateProgress(workout)}%</div>
            </div>
        </div>

        <div class="workout-exercises">
            <h3>Exercises & Sets</h3>
            ${exerciseHTML}
        </div>

        <div class="modal-actions" style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            ${actionButtons}
            <button class="btn btn-secondary" onclick="closeWorkoutDetailModal()">Close</button>
        </div>
    `;
    
    // Show the modal - remove hidden class and make it visible
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    console.log(' Workout modal displayed with correct duration:', formattedDuration);
},

generateSetsHTML(sets) {
    if (!sets || sets.length === 0) {
        return '<p style="color: var(--text-secondary);">No sets recorded</p>';
    }
    
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">';
    sets.forEach((set, index) => {
        if (set && (set.reps || set.weight)) {
            html += `<span style="background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.9rem;">Set ${index + 1}: ${set.reps || 0} × ${set.weight || 0} lbs</span>`;
        }
    });
    html += '</div>';
    return html;
},

calculateProgress(workout) {
    if (!workout.exercises || !workout.originalWorkout?.exercises) return 0;
    
    let totalSets = 0;
    let completedSets = 0;
    
    Object.keys(workout.exercises).forEach(key => {
        const exercise = workout.exercises[key];
        if (exercise.sets) {
            totalSets += exercise.sets.length;
            completedSets += exercise.sets.filter(set => set.reps && set.weight).length;
        }
    });
    
    return totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
},

    // Basic modal for calendar workouts without full details
    showFixedBasicModal(date, calendarWorkout) {
        const modal = document.getElementById('workoutModal');
        const content = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        
        // Fix date display for basic modal too
        const safeDate = new Date(date + 'T12:00:00');
        const displayDate = safeDate.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric', 
            year: 'numeric'
        });
        
        if (modalTitle) {
            modalTitle.textContent = `${calendarWorkout.name} - ${displayDate}`;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 1rem;">
                    <strong style="color: var(--text-secondary);">Status:</strong>
                    <span style="color: var(--success);">${calendarWorkout.status}</span>
                    <strong style="color: var(--text-secondary);">Category:</strong>
                    <span style="color: var(--text-primary);">${calendarWorkout.category}</span>
                </div>
            </div>
            <p style="color: var(--text-secondary); font-style: italic;">Limited workout details available. This workout may have been logged manually or sync data is incomplete.</p>
        `;
        
        modal.style.display = 'flex';
    },

        // Search functionality adapted for calendar
        filterHistory(searchTerm) {
            if (!searchTerm || searchTerm.trim() === '') {
                this.filteredHistory = [...this.currentHistory];
                return;
            }

            const query = searchTerm.toLowerCase().trim();
            this.filteredHistory = this.currentHistory.filter(workout => {
                if (!workout) return false;

                // Search in workout type/name
                if (workout.workoutType?.toLowerCase().includes(query)) return true;

                // Search in date
                if (workout.date?.includes(query)) return true;

                // Search in exercise names
                if (workout.exerciseNames) {
                    const exerciseValues = Object.values(workout.exerciseNames);
                    if (exerciseValues.some(name => name.toLowerCase().includes(query))) return true;
                }

                // Search in manual notes
                if (workout.manualNotes?.toLowerCase().includes(query)) return true;

                // Search in status
                if (this.getWorkoutStatus(workout).toLowerCase().includes(query)) return true;

                return false;
            });

            // Note: Calendar doesn't re-render on search like table view would
            console.log(`Filtered to ${this.filteredHistory.length} workouts`);
        },

        // Workout management functions
        async deleteWorkout(workoutId) {
            if (!appState.currentUser) return;

            const workout = this.currentHistory.find(w => w.id === workoutId);
            if (!workout) return;

            const confirmDelete = confirm(`Delete workout "${workout.workoutType}" from ${new Date(workout.date).toLocaleDateString()}?\n\nThis cannot be undone.`);
            if (!confirmDelete) return;

            try {
                const { deleteDoc, doc, db } = await import('./firebase-config.js');
                await deleteDoc(doc(db, "users", appState.currentUser.uid, "workouts", workoutId));

                // Remove from local arrays
                this.currentHistory = this.currentHistory.filter(w => w.id !== workoutId);
                this.filteredHistory = this.filteredHistory.filter(w => w.id !== workoutId);

                // Refresh calendar if currently shown
                await this.loadCalendarWorkouts();
                this.generateCalendarGrid();

                showNotification('Workout deleted successfully', 'success');

            } catch (error) {
                console.error('Error deleting workout:', error);
                showNotification('Failed to delete workout. Please try again.', 'error');
            }
        },

        repeatWorkout(date) {
            const workout = this.calendarWorkouts[date];
            if (!workout) return;

            console.log('Repeat workout:', workout);
            this.closeWorkoutDetailModal();

            // Start a workout using the workout type/name
            if (typeof window.startWorkout === 'function') {
                window.startWorkout(workout.workoutType);
            } else {
                console.error('❌ startWorkout function not available');
                alert('Cannot start workout. Please refresh the page.');
            }
        },

        // Helper functions
        getWorkoutStatus(workout) {
            if (workout.cancelledAt) return 'cancelled';
            if (workout.completedAt) return 'completed';
            if (workout.progress && workout.progress.percentage < 100) return 'partial';
            return 'incomplete';
        },

        getWorkoutDuration(workout) {
    // Method 1: Use stored totalDuration (in seconds)
        if (workout.totalDuration && workout.totalDuration > 0) {
            return workout.totalDuration * 1000; // Convert to milliseconds
        }
        
        // Method 2: Calculate from timestamps (multiple field name variations)
        const startTime = workout.startedAt || workout.startTime;
        const endTime = workout.completedAt || workout.finishedAt;
        
        if (startTime && endTime) {
            return new Date(endTime) - new Date(startTime);
        }
        
        // Method 3: If workout is completed but no duration, estimate based on sets
        if (workout.completedAt && workout.exercises) {
            const totalSets = Object.values(workout.exercises).reduce((count, exercise) => {
                return count + (exercise.sets ? exercise.sets.filter(set => set.reps && set.weight).length : 0);
            }, 0);
            
            // Estimate 2 minutes per set (reasonable assumption)
            if (totalSets > 0) {
                return totalSets * 2 * 60 * 1000; // Convert to milliseconds
            }
        }
        
        return 0;
    },
        formatDuration(durationMs) {
            if (!durationMs || durationMs <= 0) return 'N/A';
            
            const minutes = Math.floor(durationMs / 60000);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                return `${hours}h ${minutes % 60}m`;
            }
            return `${minutes}m`;
        },
 };
}

// Put this AFTER the entire export function, not inside the object
    window.deleteWorkoutFromCalendar = async function(date) {
        if (!window.workoutHistory) return;
        
        const workout = window.workoutHistory.calendarWorkouts[date];
        if (!workout || !workout.rawData) return;
        
        if (confirm(`Delete workout from ${new Date(date).toLocaleDateString()}? This cannot be undone.`)) {
            try {
                const { deleteDoc, doc, db } = await import('./firebase-config.js');
                await deleteDoc(doc(db, "users", AppState.currentUser.uid, "workouts", date));
                
                // Remove from calendar
                delete window.workoutHistory.calendarWorkouts[date];
                window.workoutHistory.generateCalendarGrid();
                window.workoutHistory.closeWorkoutDetailModal();
                
                showNotification('Workout deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting workout:', error);
                showNotification('Failed to delete workout', 'error');
            }
        }
    };