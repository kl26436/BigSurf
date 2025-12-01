// Dashboard UI Module - core/dashboard-ui.js
// Displays dashboard with stats, quick actions, and recent activity

import { StatsTracker } from './stats-tracker.js';
import { showNotification, setHeaderMode } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';

// ===================================================================
// DASHBOARD DISPLAY
// ===================================================================

/**
 * Show dashboard view
 */
export async function showDashboard() {

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

    // Show full header with logo on dashboard
    setHeaderMode(true);

    // Show bottom nav and set active tab
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');

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
                } else {
                    // No exercises done - delete the empty workout
                    await deleteDoc(workoutRef);
                }

                const card = document.getElementById('resume-workout-banner');
                if (card) card.classList.add('hidden');
                window.inProgressWorkout = null;
                return;
            }

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
            // Use workoutData.originalWorkout if it exists (contains modified exercise list)
            // Only fall back to workoutPlan template if originalWorkout wasn't saved
            window.inProgressWorkout = {
                ...workoutData,
                originalWorkout: workoutData.originalWorkout || workoutPlan
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

                // Get total sets from saved originalWorkout (if exercises were added/deleted) or template
                const exerciseSource = workoutData.originalWorkout?.exercises || (workoutPlan && workoutPlan.exercises);
                if (exerciseSource) {
                    exerciseSource.forEach(exercise => {
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
 * Render dashboard content - New sleek design
 */
async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="dashboard-loading">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        // Load all stats in parallel
        const [
            streak,
            weeklyStats,
            recentPRs,
            suggestedWorkouts,
            todaysWorkout
        ] = await Promise.all([
            StatsTracker.calculateWorkoutStreak(),
            StatsTracker.getWeeklyStats(),
            StatsTracker.getRecentPRs(3),
            getSuggestedWorkoutsForToday(),
            getTodaysCompletedWorkout()
        ]);

        const weekCount = weeklyStats.workouts.length;
        const weeklyGoal = 5;

        // Check which suggested workouts were already done today
        const completedWorkoutTypes = todaysWorkout ? [todaysWorkout.workoutType] : [];

        // Render new sleek dashboard
        container.innerHTML = `
            ${renderProgressRingHero(weekCount, weeklyGoal, weeklyStats)}
            ${renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes)}
            ${renderStreakCard(streak)}
            ${renderRecentPRsNew(recentPRs)}
        `;
    } catch (error) {
        console.error('❌ Error rendering dashboard:', error);
        container.innerHTML = `
            <div class="dashboard-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading dashboard</p>
                <button class="btn btn-primary" onclick="showDashboard()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

/**
 * Get today's completed workout (if any)
 */
async function getTodaysCompletedWorkout() {
    try {
        const { AppState } = await import('./app-state.js');
        const { loadTodaysWorkout } = await import('./data-manager.js');
        const workout = await loadTodaysWorkout(AppState);
        return workout && workout.completedAt ? workout : null;
    } catch {
        return null;
    }
}

// ===================================================================
// PROGRESS RING HERO SECTION
// ===================================================================

/**
 * Render the progress ring hero with weekly stats
 */
function renderProgressRingHero(weekCount, weeklyGoal, weeklyStats) {
    const percentage = Math.min((weekCount / weeklyGoal) * 100, 100);
    const circumference = 2 * Math.PI * 54; // radius = 54
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const isComplete = weekCount >= weeklyGoal;

    return `
        <div class="hero-card">
            <div class="hero-content">
                <div class="progress-ring-container">
                    <svg class="progress-ring" width="140" height="140">
                        <circle
                            class="progress-ring-bg"
                            stroke="rgba(64, 224, 208, 0.15)"
                            stroke-width="10"
                            fill="transparent"
                            r="54"
                            cx="70"
                            cy="70"
                        />
                        <circle
                            class="progress-ring-progress"
                            stroke="${isComplete ? '#4ade80' : 'var(--primary)'}"
                            stroke-width="10"
                            fill="transparent"
                            r="54"
                            cx="70"
                            cy="70"
                            stroke-linecap="round"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${strokeDashoffset}"
                            transform="rotate(-90 70 70)"
                        />
                    </svg>
                    <div class="progress-ring-text">
                        <span class="progress-count">${weekCount}</span>
                        <span class="progress-goal">/ ${weeklyGoal}</span>
                    </div>
                </div>
                <div class="hero-info">
                    <h2 class="hero-title">This Week</h2>
                    <p class="hero-subtitle">${isComplete ? 'Goal achieved!' : `${weeklyGoal - weekCount} more to go`}</p>
                </div>
            </div>
            <div class="hero-stats">
                <div class="hero-stat">
                    <span class="hero-stat-value">${weeklyStats.sets}</span>
                    <span class="hero-stat-label">Sets</span>
                </div>
                <div class="hero-stat-divider"></div>
                <div class="hero-stat">
                    <span class="hero-stat-value">${weeklyStats.exercises}</span>
                    <span class="hero-stat-label">Exercises</span>
                </div>
                <div class="hero-stat-divider"></div>
                <div class="hero-stat">
                    <span class="hero-stat-value">${weeklyStats.minutes}</span>
                    <span class="hero-stat-label">Minutes</span>
                </div>
            </div>
        </div>
    `;
}

// ===================================================================
// STREAK CARD
// ===================================================================

function renderStreakCard(streak) {
    if (streak === 0) {
        return `
            <div class="dashboard-card streak-card">
                <div class="card-icon streak-icon-inactive">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="card-content">
                    <div class="card-title">Start a Streak</div>
                    <div class="card-subtitle">Work out today to begin</div>
                </div>
            </div>
        `;
    }

    return `
        <div class="dashboard-card streak-card streak-active">
            <div class="card-icon streak-icon">
                <i class="fas fa-fire"></i>
            </div>
            <div class="card-content">
                <div class="card-value">${streak}</div>
                <div class="card-label">Day Streak</div>
            </div>
            <div class="streak-flame"></div>
        </div>
    `;
}

// ===================================================================
// RECENT PRS (New sleek design)
// ===================================================================

function renderRecentPRsNew(recentPRs) {
    if (recentPRs.length === 0) {
        return `
            <div class="dashboard-card prs-card prs-empty">
                <div class="card-header">
                    <div class="card-icon trophy-icon">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <h3 class="card-title">Recent PRs</h3>
                </div>
                <div class="prs-empty-content">
                    <p>Hit a new max weight (5+ reps) to see it here</p>
                </div>
            </div>
        `;
    }

    const prsList = recentPRs.map(pr => `
        <div class="pr-row">
            <div class="pr-exercise-name">${pr.exercise}</div>
            <div class="pr-weight-value">${pr.weight} <span class="pr-unit">lbs</span></div>
            <div class="pr-reps-badge">${pr.reps} reps</div>
        </div>
    `).join('');

    return `
        <div class="dashboard-card prs-card">
            <div class="card-header">
                <div class="card-icon trophy-icon">
                    <i class="fas fa-trophy"></i>
                </div>
                <h3 class="card-title">Recent PRs</h3>
            </div>
            <div class="prs-list">
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
        // Load all user templates (this already filters out hidden templates)
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const allTemplates = await workoutManager.getUserWorkoutTemplates();

        // Filter to templates with today in suggestedDays array
        // Also ensure we skip any hidden or deleted templates
        const suggested = allTemplates.filter(template => {
            // Skip hidden templates (double check)
            if (template.isHidden || template.deleted) {
                return false;
            }

            // Check new array format (suggestedDays)
            if (template.suggestedDays && Array.isArray(template.suggestedDays)) {
                return template.suggestedDays.includes(dayOfWeek);
            }
            // Backwards compatibility: check old single-day format
            if (template.suggestedDay) {
                return template.suggestedDay === dayOfWeek;
            }
            return false;
        });
        return suggested;
    } catch (error) {
        console.error('❌ Error loading suggested workouts:', error);
        return [];
    }
}

/**
 * Render suggested workouts section (new design with completion status)
 */
function renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes = []) {
    if (!suggestedWorkouts || suggestedWorkouts.length === 0) {
        return ''; // Don't show section if no suggestions
    }

    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    const workoutCards = suggestedWorkouts.map(workout => {
        const workoutName = workout.name || workout.day;
        const templateId = workout.id || workout.name;
        const isDefault = workout.isDefault || false;
        const isCompleted = completedWorkoutTypes.includes(workoutName);
        const exerciseCount = workout.exercises?.length || 0;

        if (isCompleted) {
            return `
                <div class="suggested-card suggested-completed">
                    <div class="suggested-completed-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="suggested-info">
                        <div class="suggested-name">${workoutName}</div>
                        <div class="suggested-status">Completed today</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="suggested-card" onclick="startSuggestedWorkout('${templateId}', ${isDefault})">
                <div class="suggested-icon">
                    <i class="fas fa-dumbbell"></i>
                </div>
                <div class="suggested-info">
                    <div class="suggested-name">${workoutName}</div>
                    <div class="suggested-meta">${exerciseCount} exercises</div>
                </div>
                <div class="suggested-arrow">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section">
            <div class="section-header">
                <h3 class="section-title-new">
                    <i class="fas fa-calendar-day"></i>
                    ${dayName}
                </h3>
            </div>
            <div class="suggested-list">
                ${workoutCards}
            </div>
        </div>
    `;
}

/**
 * Old render function kept for backwards compatibility
 */
function renderSuggestedWorkouts(suggestedWorkouts) {
    return renderSuggestedWorkoutsNew(suggestedWorkouts, []);
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
