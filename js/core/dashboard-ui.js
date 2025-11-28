// Dashboard UI Module - core/dashboard-ui.js
// Displays dashboard with stats, quick actions, and recent activity

import { StatsTracker } from './stats-tracker.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// DASHBOARD DISPLAY
// ===================================================================

/**
 * Show dashboard view
 */
export async function showDashboard() {
    console.log('📊 Showing dashboard...');

    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) {
        console.error('Dashboard section not found');
        return;
    }

    // Hide all other sections
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');

    if (workoutSelector) workoutSelector.classList.add('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');

    // Show dashboard
    dashboardSection.classList.remove('hidden');

    // Check for in-progress workout
    await checkForInProgressWorkout();

    // Load and render dashboard data
    await renderDashboard();
}

/**
 * Check if there's an in-progress workout and show resume prompt
 */
async function checkForInProgressWorkout() {
    try {
        const { AppState } = await import('./app-state.js');
        const { loadTodaysWorkout } = await import('./data-manager.js');

        // Check today's workout first
        let workoutData = await loadTodaysWorkout(AppState);

        // If no incomplete workout today, check yesterday (in case workout started before midnight)
        if (!workoutData || workoutData.completedAt || workoutData.cancelledAt) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const { getDoc, doc, db } = await import('./firebase-config.js');
            const yesterdayRef = doc(db, "users", AppState.currentUser.uid, "workouts", yesterdayStr);
            const yesterdaySnap = await getDoc(yesterdayRef);

            if (yesterdaySnap.exists()) {
                const yesterdayData = { id: yesterdaySnap.id, ...yesterdaySnap.data() };
                if (!yesterdayData.completedAt && !yesterdayData.cancelledAt) {
                    workoutData = yesterdayData;
                }
            }
        }

        if (workoutData && !workoutData.completedAt && !workoutData.cancelledAt) {
            // Check if workout is too old (> 3 hours) - probably abandoned
            const workoutStart = new Date(workoutData.startedAt);
            const hoursSinceStart = (Date.now() - workoutStart.getTime()) / (1000 * 60 * 60);

            if (hoursSinceStart > 3) {
                console.log(`⏰ Workout too old (${hoursSinceStart.toFixed(1)}h), auto-completing if it has exercises`);

                // Check if workout has any completed exercises
                const hasCompletedExercises = workoutData.exercises &&
                    Object.values(workoutData.exercises).some(ex => ex.completed || (ex.sets && ex.sets.length > 0));

                const { setDoc, doc, db, deleteDoc } = await import('./firebase-config.js');
                const workoutRef = doc(db, "users", AppState.currentUser.uid, "workouts", workoutData.date);

                if (hasCompletedExercises) {
                    // Auto-complete the workout with its original start date
                    workoutData.completedAt = new Date().toISOString();
                    workoutData.autoCompleted = true; // Flag for tracking
                    await setDoc(workoutRef, workoutData, { merge: true });
                    console.log('✅ Auto-completed abandoned workout:', workoutData.workoutType);
                } else {
                    // No exercises done - delete the empty workout
                    await deleteDoc(workoutRef);
                    console.log('🗑️ Deleted abandoned empty workout:', workoutData.workoutType);
                }

                const card = document.getElementById('resume-workout-banner');
                if (card) card.classList.add('hidden');
                window.inProgressWorkout = null;
                return;
            }

            console.log('🏋️ Found in-progress workout:', workoutData.workoutType, `(${hoursSinceStart.toFixed(1)}h ago)`);

            // Find the workout plan
            const workoutPlan = AppState.workoutPlans.find(plan =>
                plan.day === workoutData.workoutType ||
                plan.name === workoutData.workoutType ||
                plan.id === workoutData.workoutType
            );

            if (!workoutPlan) {
                console.warn('⚠️ Workout plan not found for:', workoutData.workoutType);
                return;
            }

            // Store in-progress workout globally so it can be resumed
            window.inProgressWorkout = {
                ...workoutData,
                originalWorkout: workoutPlan
            };

            // Show resume banner
            const card = document.getElementById('resume-workout-banner');
            const nameElement = document.getElementById('resume-workout-name');
            const setsElement = document.getElementById('resume-sets-completed');
            const timeElement = document.getElementById('resume-time-ago');

            if (card && nameElement) {
                nameElement.textContent = workoutData.workoutType;

                // Calculate sets completed from saved data vs template
                let completedSets = 0;
                let totalSets = 0;

                // Get total sets from original workout template
                if (workoutPlan && workoutPlan.exercises) {
                    workoutPlan.exercises.forEach(exercise => {
                        totalSets += exercise.sets || 3; // Default to 3 if not specified
                    });
                }

                // Get completed sets from saved data
                if (workoutData.exercises) {
                    Object.values(workoutData.exercises).forEach(exercise => {
                        if (exercise.sets) {
                            const exerciseSets = exercise.sets.filter(set => set.reps && set.weight);
                            completedSets += exerciseSets.length;
                        }
                    });
                }

                if (setsElement) {
                    setsElement.textContent = `${completedSets}/${totalSets}`;
                }

                // Calculate time ago
                if (timeElement) {
                    const minutesAgo = Math.floor(hoursSinceStart * 60);
                    if (minutesAgo < 60) {
                        timeElement.textContent = `${minutesAgo} min ago`;
                    } else {
                        timeElement.textContent = `${hoursSinceStart.toFixed(1)}h ago`;
                    }
                }

                card.classList.remove('hidden');
                console.log('✅ Resume banner shown for:', workoutData.workoutType);
            } else {
                console.warn('⚠️ Resume banner elements not found:', { card: !!card, nameElement: !!nameElement });
            }
        } else {
            // Hide resume banner if no workout in progress
            const card = document.getElementById('resume-workout-banner');
            if (card) {
                card.classList.add('hidden');
            }
            window.inProgressWorkout = null;
        }
    } catch (error) {
        console.error('❌ Error checking for in-progress workout:', error);
    }
}

/**
 * Render dashboard content
 */
async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="loading-spinner"></div>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Loading your stats...</p>
        </div>
    `;

    try {
        // Load all stats in parallel
        const [
            streak,
            weekCount,
            monthCount,
            recentWorkouts,
            lastWorkout,
            recentPRs,
            suggestedWorkouts
        ] = await Promise.all([
            StatsTracker.calculateWorkoutStreak(),
            StatsTracker.getWorkoutsThisWeek(),
            StatsTracker.getWorkoutsThisMonth(),
            StatsTracker.getRecentWorkouts(3),
            StatsTracker.getLastWorkout(),
            StatsTracker.getRecentPRs(5),
            getSuggestedWorkoutsForToday()
        ]);

        // Render dashboard
        container.innerHTML = `
            ${renderStatsCards(streak, weekCount, monthCount)}
            ${renderQuickActions(lastWorkout)}
            ${renderSuggestedWorkouts(suggestedWorkouts)}
            ${renderRecentPRs(recentPRs)}
            ${renderRecentWorkouts(recentWorkouts)}
        `;

        console.log('✅ Dashboard rendered successfully');
    } catch (error) {
        console.error('❌ Error rendering dashboard:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Error loading dashboard</p>
                <button class="btn btn-primary" onclick="showDashboard()" style="margin-top: 1rem;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

// ===================================================================
// STATS CARDS
// ===================================================================

function renderStatsCards(streak, weekCount, monthCount) {
    return `
        <div class="stats-grid">
            <!-- Workout Streak -->
            <div class="stat-card ${streak > 0 ? 'stat-card-highlight' : ''}">
                <div class="stat-icon">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${streak}</div>
                    <div class="stat-label">Day Streak</div>
                </div>
            </div>

            <!-- This Week -->
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-calendar-week"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${weekCount}</div>
                    <div class="stat-label">This Week</div>
                </div>
            </div>

            <!-- This Month -->
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${monthCount}</div>
                    <div class="stat-label">This Month</div>
                </div>
            </div>
        </div>
    `;
}

// ===================================================================
// QUICK ACTIONS
// ===================================================================

function renderQuickActions(lastWorkout) {
    const hasLastWorkout = lastWorkout !== null;

    return `
        <div class="dashboard-section">
            <h3 class="section-title">Quick Start</h3>
            <div class="quick-actions-grid">
                <!-- Start New Workout -->
                <button class="quick-action-btn" onclick="navigateTo('start-workout')">
                    <i class="fas fa-dumbbell"></i>
                    <span>Start Workout</span>
                </button>

                <!-- Repeat Last Workout -->
                <button class="quick-action-btn ${!hasLastWorkout ? 'disabled' : ''}"
                        onclick="${hasLastWorkout ? `repeatLastWorkout('${lastWorkout?.id}')` : 'void(0)'}"
                        ${!hasLastWorkout ? 'disabled' : ''}>
                    <i class="fas fa-redo"></i>
                    <span>${hasLastWorkout ? 'Repeat Last' : 'No History'}</span>
                </button>

                <!-- View History -->
                <button class="quick-action-btn" onclick="navigateTo('history')">
                    <i class="fas fa-history"></i>
                    <span>History</span>
                </button>

                <!-- Location -->
                <button class="quick-action-btn" onclick="navigateTo('location')">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>Location</span>
                </button>
            </div>
        </div>
    `;
}

// ===================================================================
// RECENT PRS
// ===================================================================

function renderRecentPRs(recentPRs) {
    if (recentPRs.length === 0) {
        return `
            <div class="dashboard-section">
                <h3 class="section-title">Recent PRs</h3>
                <div class="empty-state">
                    <i class="fas fa-trophy" style="font-size: 2rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>No personal records yet</p>
                    <p style="font-size: 0.875rem; color: var(--text-secondary);">Complete workouts to start tracking PRs</p>
                </div>
            </div>
        `;
    }

    const prsList = recentPRs.map(pr => `
        <div class="pr-item">
            <div class="pr-icon">
                <i class="fas fa-trophy"></i>
            </div>
            <div class="pr-content">
                <div class="pr-exercise">${pr.exercise}</div>
                <div class="pr-details">
                    <span class="pr-badge">${pr.label}</span>
                    <span class="pr-value">${pr.value}</span>
                </div>
                <div class="pr-meta">
                    ${pr.equipment} • ${formatDate(pr.date)} ${pr.location ? `• ${pr.location}` : ''}
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="dashboard-section">
            <h3 class="section-title">
                Recent PRs
                <button class="btn-text" onclick="navigateTo('stats')">View All</button>
            </h3>
            <div class="pr-list">
                ${prsList}
            </div>
        </div>
    `;
}

// ===================================================================
// RECENT WORKOUTS
// ===================================================================

function renderRecentWorkouts(recentWorkouts) {
    if (recentWorkouts.length === 0) {
        return `
            <div class="dashboard-section">
                <h3 class="section-title">Recent Workouts</h3>
                <div class="empty-state">
                    <i class="fas fa-calendar-check" style="font-size: 2rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>No completed workouts yet</p>
                    <button class="btn btn-primary" onclick="navigateTo('start-workout')" style="margin-top: 1rem;">
                        <i class="fas fa-dumbbell"></i> Start Your First Workout
                    </button>
                </div>
            </div>
        `;
    }

    const workoutsList = recentWorkouts.map(workout => {
        const date = new Date(workout.completedAt);
        const duration = Math.floor(workout.totalDuration / 60); // minutes
        const exerciseCount = Object.keys(workout.exercises || {}).length;

        return `
            <div class="workout-item" onclick="showWorkoutDetail('${workout.id}')">
                <div class="workout-header">
                    <h4>${workout.workoutType || 'Workout'}</h4>
                    <span class="workout-date">${formatDate(workout.date)}</span>
                </div>
                <div class="workout-stats">
                    <span><i class="fas fa-clock"></i> ${duration} min</span>
                    <span><i class="fas fa-list"></i> ${exerciseCount} exercises</span>
                    ${workout.location ? `<span><i class="fas fa-map-marker-alt"></i> ${workout.location}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section">
            <h3 class="section-title">
                Recent Workouts
                <button class="btn-text" onclick="navigateTo('history')">View All</button>
            </h3>
            <div class="workout-list">
                ${workoutsList}
            </div>
        </div>
    `;
}

// ===================================================================
// HELPERS
// ===================================================================

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

/**
 * Repeat last workout
 */
export async function repeatLastWorkout(workoutId) {
    if (!workoutId) {
        const lastWorkout = await StatsTracker.getLastWorkout();
        if (!lastWorkout) {
            showNotification('No workout history found', 'warning');
            return;
        }
        workoutId = lastWorkout.id;
    }

    // Use existing showWorkoutDetail and repeat functionality
    const { showWorkoutDetail } = await import('./workout-history-ui.js');
    showWorkoutDetail(workoutId);

    // Trigger repeat button after modal opens
    setTimeout(() => {
        const repeatBtn = document.querySelector('[onclick^="repeatWorkout"]');
        if (repeatBtn) {
            repeatBtn.click();
        }
    }, 500);
}

// ===================================================================
// SUGGESTED WORKOUTS FOR TODAY
// ===================================================================

/**
 * Get workouts suggested for today's day of the week
 */
async function getSuggestedWorkoutsForToday() {
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    try {
        // Load all user templates
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const allTemplates = await workoutManager.getUserWorkoutTemplates();

        // Filter to only templates with suggestedDay matching today
        const suggested = allTemplates.filter(template =>
            template.suggestedDay === dayOfWeek
        );

        console.log(`📅 Found ${suggested.length} workouts suggested for ${dayOfWeek}`);
        return suggested;
    } catch (error) {
        console.error('❌ Error loading suggested workouts:', error);
        return [];
    }
}

/**
 * Render suggested workouts section
 */
function renderSuggestedWorkouts(suggestedWorkouts) {
    if (!suggestedWorkouts || suggestedWorkouts.length === 0) {
        return ''; // Don't show section if no suggestions
    }

    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    const workoutCards = suggestedWorkouts.map(workout => {
        const exerciseCount = workout.exercises?.length || 0;
        const templateId = workout.id || workout.name;
        const isDefault = workout.isDefault || false;

        return `
            <div class="suggested-workout-card" onclick="startSuggestedWorkout('${templateId}', ${isDefault})">
                <div class="suggested-workout-name">${workout.name || workout.day}</div>
                <div class="suggested-workout-meta">
                    <span><i class="fas fa-list"></i> ${exerciseCount} exercises</span>
                    <span class="workout-category">${workout.category || 'Other'}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section suggested-section">
            <h3 class="section-title">
                <i class="fas fa-calendar-day"></i> Suggested for ${dayName}
            </h3>
            <div class="suggested-workouts-grid">
                ${workoutCards}
            </div>
        </div>
    `;
}

/**
 * Start a suggested workout
 */
export async function startSuggestedWorkout(templateId, isDefault = false) {
    try {
        const { selectTemplate } = await import('./template-selection.js');
        await selectTemplate(templateId, isDefault);
    } catch (error) {
        console.error('❌ Error starting suggested workout:', error);
        showNotification('Error starting workout', 'error');
    }
}
