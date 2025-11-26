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

    // Show dashboard, hide other sections
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

        const todaysData = await loadTodaysWorkout(AppState);

        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            console.log('🏋️ Found in-progress workout:', todaysData.workoutType);

            // Find the workout plan
            const workoutPlan = AppState.workoutPlans.find(plan =>
                plan.day === todaysData.workoutType ||
                plan.name === todaysData.workoutType ||
                plan.id === todaysData.workoutType
            );

            if (!workoutPlan) {
                console.warn('⚠️ Workout plan not found for:', todaysData.workoutType);
                return;
            }

            // Store in-progress workout globally so it can be resumed
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: workoutPlan
            };

            // Show resume banner
            const card = document.getElementById('resume-workout-banner');
            const nameElement = document.getElementById('resume-workout-name');

            if (card && nameElement) {
                nameElement.textContent = todaysData.workoutType;
                card.classList.remove('hidden');
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
            recentPRs
        ] = await Promise.all([
            StatsTracker.calculateWorkoutStreak(),
            StatsTracker.getWorkoutsThisWeek(),
            StatsTracker.getWorkoutsThisMonth(),
            StatsTracker.getRecentWorkouts(3),
            StatsTracker.getLastWorkout(),
            StatsTracker.getRecentPRs(5)
        ]);

        // Render dashboard
        container.innerHTML = `
            ${renderStatsCards(streak, weekCount, monthCount)}
            ${renderQuickActions(lastWorkout)}
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
