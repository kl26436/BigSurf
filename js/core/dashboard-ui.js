// Dashboard UI Module - core/dashboard-ui.js
// Unified dashboard with stats page layout, weekly goals, and in-progress workout

import { StatsTracker } from './stats-tracker.js';
import { showNotification, setHeaderMode } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from './pr-tracker.js';
import { StreakTracker } from './streak-tracker.js';
import { AppState } from './app-state.js';
import { FirebaseWorkoutManager } from './firebase-workout-manager.js';
import { db, collection, query, where, getDocs, orderBy } from './firebase-config.js';

// Timer interval for live rest countdown on dashboard
let dashboardRestTimerInterval = null;

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
        // Schema v3.0: Use loadWorkoutsByDate which handles both old and new schemas
        if (!workoutData || workoutData.completedAt || workoutData.cancelledAt) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const { loadWorkoutsByDate } = await import('./data-manager.js');
            const yesterdayWorkouts = await loadWorkoutsByDate(AppState, yesterdayStr);

            // Find any incomplete workout from yesterday
            const incompleteYesterday = yesterdayWorkouts.find(w =>
                !w.completedAt && !w.cancelledAt
            );

            if (incompleteYesterday) {
                workoutData = incompleteYesterday;
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
                // Schema v3.0: Use docId if available, fall back to date for old schema
                const docId = workoutData.docId || workoutData.workoutId || workoutData.date;
                const workoutRef = doc(db, "users", AppState.currentUser.uid, "workouts", docId);

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
            const timeElement = document.getElementById('resume-time-ago');

            if (card && nameElement) {
                nameElement.textContent = workoutData.workoutType;

                // Calculate sets and exercises completed
                let completedSets = 0;
                let totalSets = 0;
                let completedExercises = 0;
                let totalExercises = 0;

                // Get total sets from saved originalWorkout (if exercises were added/deleted) or template
                const exerciseSource = workoutData.originalWorkout?.exercises || (workoutPlan && workoutPlan.exercises);
                if (exerciseSource) {
                    totalExercises = exerciseSource.length;
                    exerciseSource.forEach(exercise => {
                        totalSets += exercise.sets || 3;
                    });
                }

                // Get completed sets and exercises from saved data
                if (workoutData.exercises) {
                    Object.values(workoutData.exercises).forEach(exercise => {
                        if (exercise.sets && exercise.sets.length > 0) {
                            const exerciseSets = exercise.sets.filter(set => set.reps && set.weight);
                            completedSets += exerciseSets.length;
                            if (exercise.completed || exerciseSets.length > 0) {
                                completedExercises++;
                            }
                        }
                    });
                }

                // Update progress bar
                const percentage = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;
                const progressBar = document.getElementById('resume-progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${percentage}%`;
                }

                // Update stat boxes
                const statSets = document.getElementById('resume-stat-sets');
                const statExercises = document.getElementById('resume-stat-exercises');
                const statTime = document.getElementById('resume-stat-time');
                const statRest = document.getElementById('resume-stat-rest');

                if (statSets) {
                    statSets.textContent = `${completedSets}/${totalSets}`;
                }
                if (statExercises) {
                    statExercises.textContent = `${completedExercises}/${totalExercises}`;
                }
                if (statTime) {
                    const minutes = Math.floor(hoursSinceStart * 60);
                    if (minutes < 60) {
                        statTime.textContent = `${minutes}m`;
                    } else {
                        const hours = Math.floor(minutes / 60);
                        const mins = minutes % 60;
                        statTime.textContent = `${hours}h ${mins}m`;
                    }
                }
                if (statRest) {
                    // Start live timer update for rest countdown
                    startDashboardRestTimer();
                }

                // Calculate time ago for header
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

// Dashboard state for expanded sections
let dashboardExpandedSections = {
    insights: false,
    badges: false,
    prs: false
};

/**
 * Start live rest timer updates on dashboard
 */
function startDashboardRestTimer() {
    // Clear any existing interval
    if (dashboardRestTimerInterval) {
        clearInterval(dashboardRestTimerInterval);
    }

    const updateRestDisplay = () => {
        const statRest = document.getElementById('resume-stat-rest');
        if (!statRest) {
            stopDashboardRestTimer();
            return;
        }

        if (AppState.activeRestTimer && !AppState.activeRestTimer.completed) {
            const { startTime, pausedTime, duration, isPaused } = AppState.activeRestTimer;
            const elapsed = isPaused ? 0 : Math.floor((Date.now() - startTime - pausedTime) / 1000);
            const timeLeft = Math.max(0, duration - elapsed);

            if (timeLeft > 0) {
                statRest.textContent = `${timeLeft}s`;
            } else {
                statRest.textContent = 'Go!';
                AppState.activeRestTimer.completed = true;
            }
        } else if (AppState.activeRestTimer?.completed) {
            statRest.textContent = 'Go!';
        } else {
            statRest.textContent = '--';
        }
    };

    // Update immediately
    updateRestDisplay();

    // Then update every second
    dashboardRestTimerInterval = setInterval(updateRestDisplay, 1000);
}

/**
 * Stop dashboard rest timer updates
 */
function stopDashboardRestTimer() {
    if (dashboardRestTimerInterval) {
        clearInterval(dashboardRestTimerInterval);
        dashboardRestTimerInterval = null;
    }
}

/**
 * Render dashboard content - Unified stats page layout
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
        // Load all stats in parallel - same as stats page plus dashboard-specific data
        const [
            streaks,
            weeklyStats,
            insights,
            badges,
            suggestedWorkouts,
            todaysWorkout,
            inProgressWorkout
        ] = await Promise.all([
            StreakTracker.calculateStreaks(),
            StatsTracker.getWeeklyStats(),
            calculateDashboardInsights(),
            calculateDashboardBadges(),
            getSuggestedWorkoutsForToday(),
            getTodaysCompletedWorkout(),
            getInProgressWorkoutData()
        ]);

        await PRTracker.loadPRData();
        const recentPRs = PRTracker.getRecentPRs(3);

        const weekCount = weeklyStats.workouts.length;
        const weeklyGoal = 5;
        const completedWorkoutTypes = todaysWorkout ? [todaysWorkout.workoutType] : [];
        const inProgressWorkoutType = inProgressWorkout?.workoutType || null;

        // Build the unified dashboard with stats page layout
        // Note: In-progress workout is shown via resume-workout-banner in HTML, not here
        container.innerHTML = `
            ${renderWeeklyGoalSection(weekCount, weeklyGoal, weeklyStats)}
            ${renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType)}
            ${renderDashboardStreakBoxes(streaks)}
            ${renderDashboardInsightsSection(insights)}
            ${renderDashboardBadgesSection(badges)}
            ${renderDashboardPRsSection(recentPRs)}
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
// WEEKLY GOAL SECTION (Hero with progress ring)
// ===================================================================

/**
 * Render weekly goal section with progress ring and stats
 */
function renderWeeklyGoalSection(weekCount, weeklyGoal, weeklyStats) {
    const percentage = Math.min((weekCount / weeklyGoal) * 100, 100);
    const circumference = 2 * Math.PI * 36; // radius = 36 (smaller)
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const isComplete = weekCount >= weeklyGoal;
    const remaining = Math.max(weeklyGoal - weekCount, 0);

    return `
        <div class="stats-section-header">
            <span class="stats-section-title">This Week's Goal</span>
            <span class="weekly-goal-status-inline ${isComplete ? 'complete' : ''}">
                ${isComplete ? 'Complete!' : `${remaining} to go`}
            </span>
        </div>

        <div class="weekly-goal-card compact">
            <div class="weekly-goal-content">
                <div class="weekly-progress-ring-wrap">
                    <svg class="weekly-progress-ring" width="80" height="80">
                        <circle
                            class="ring-bg"
                            stroke="rgba(64, 224, 208, 0.15)"
                            stroke-width="6"
                            fill="transparent"
                            r="36"
                            cx="40"
                            cy="40"
                        />
                        <circle
                            class="ring-progress"
                            stroke="${isComplete ? '#4ade80' : 'var(--primary)'}"
                            stroke-width="6"
                            fill="transparent"
                            r="36"
                            cx="40"
                            cy="40"
                            stroke-linecap="round"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${strokeDashoffset}"
                            transform="rotate(-90 40 40)"
                        />
                    </svg>
                    <div class="ring-center-text">
                        <span class="ring-count">${weekCount}</span>
                        <span class="ring-goal">/ ${weeklyGoal}</span>
                    </div>
                </div>
                <div class="weekly-stats-grid">
                    <div class="weekly-stat-box">
                        <span class="weekly-stat-value">${weeklyStats.sets}</span>
                        <span class="weekly-stat-label">Sets</span>
                    </div>
                    <div class="weekly-stat-box">
                        <span class="weekly-stat-value">${weeklyStats.exercises}</span>
                        <span class="weekly-stat-label">Exercises</span>
                    </div>
                    <div class="weekly-stat-box">
                        <span class="weekly-stat-value">${weeklyStats.minutes}</span>
                        <span class="weekly-stat-label">Minutes</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===================================================================
// IN-PROGRESS WORKOUT CARD
// ===================================================================

/**
 * Get in-progress workout data for display
 */
async function getInProgressWorkoutData() {
    try {
        const { loadTodaysWorkout } = await import('./data-manager.js');

        // Check today first
        let workoutData = await loadTodaysWorkout(AppState);

        // If no incomplete workout today, check yesterday
        if (!workoutData || workoutData.completedAt || workoutData.cancelledAt) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const { getDoc, doc } = await import('./firebase-config.js');
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
            // Check if too old (> 3 hours)
            const workoutStart = new Date(workoutData.startedAt);
            const hoursSinceStart = (Date.now() - workoutStart.getTime()) / (1000 * 60 * 60);

            if (hoursSinceStart > 3) {
                return null; // Will be auto-handled by checkForInProgressWorkout
            }

            // Calculate sets info
            let completedSets = 0;
            let totalSets = 0;

            const exerciseSource = workoutData.originalWorkout?.exercises || [];
            exerciseSource.forEach(exercise => {
                totalSets += exercise.sets || 3;
            });

            if (workoutData.exercises) {
                Object.values(workoutData.exercises).forEach(exercise => {
                    if (exercise.sets) {
                        completedSets += exercise.sets.filter(set => set.reps && set.weight).length;
                    }
                });
            }

            return {
                ...workoutData,
                completedSets,
                totalSets,
                minutesElapsed: Math.floor(hoursSinceStart * 60)
            };
        }

        return null;
    } catch (error) {
        console.error('Error getting in-progress workout:', error);
        return null;
    }
}

/**
 * Render in-progress workout section with header and card
 */
function renderInProgressSection(workout) {
    const percentage = workout.totalSets > 0
        ? Math.round((workout.completedSets / workout.totalSets) * 100)
        : 0;

    const timeDisplay = workout.minutesElapsed < 60
        ? `${workout.minutesElapsed} min`
        : `${(workout.minutesElapsed / 60).toFixed(1)}h`;

    const workoutName = workout.workoutType || 'Workout';

    return `
        <div class="stats-section-header">
            <span class="stats-section-title">In Progress</span>
        </div>

        <div class="in-progress-card" onclick="continueInProgressWorkout()">
            <div class="in-progress-header">
                <div class="in-progress-icon">
                    <i class="fas fa-play-circle"></i>
                </div>
                <div class="in-progress-info">
                    <div class="in-progress-label">IN PROGRESS</div>
                    <div class="in-progress-name">${workoutName}</div>
                </div>
                <div class="in-progress-arrow">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            <div class="in-progress-stats">
                <div class="progress-stat">
                    <i class="fas fa-check-circle"></i>
                    <span>${workout.completedSets}/${workout.totalSets} sets</span>
                </div>
                <div class="progress-stat">
                    <i class="fas fa-clock"></i>
                    <span>${timeDisplay}</span>
                </div>
            </div>
            <div class="in-progress-bar-wrap">
                <div class="in-progress-bar" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}

// ===================================================================
// DASHBOARD STREAK BOXES (Same as stats page)
// ===================================================================

function renderDashboardStreakBoxes(stats) {
    const streakData = stats || { currentStreak: 0, longestStreak: 0, totalWorkouts: 0 };

    return `
        <div class="stats-section-header">
            <span class="stats-section-title">Streaks</span>
        </div>

        <div class="stats-streak-row">
            <div class="streak-box ${streakData.currentStreak > 0 ? 'active' : ''}">
                <div class="streak-box-icon fire">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="streak-box-label">CURRENT STREAK</div>
                <div class="streak-box-value">${streakData.currentStreak} days</div>
            </div>
            <div class="streak-box">
                <div class="streak-box-icon trophy">
                    <i class="fas fa-trophy"></i>
                </div>
                <div class="streak-box-label">LONGEST STREAK</div>
                <div class="streak-box-value">${streakData.longestStreak} days</div>
            </div>
            <div class="streak-box">
                <div class="streak-box-icon total">
                    <i class="fas fa-dumbbell"></i>
                </div>
                <div class="streak-box-label">TOTAL WORKOUTS</div>
                <div class="streak-box-value">${streakData.totalWorkouts}</div>
            </div>
        </div>
    `;
}

// ===================================================================
// DASHBOARD INSIGHTS SECTION (Same as stats page)
// ===================================================================

function renderDashboardInsightsSection(insights) {
    const data = insights || {};
    const isExpanded = dashboardExpandedSections.insights;

    return `
        <div class="stats-section-header" onclick="toggleDashboardSection('insights')">
            <span class="stats-section-title">Insights</span>
            <span class="view-more-link">${isExpanded ? 'Less' : 'View More'}</span>
        </div>

        <div class="insights-grid">
            <div class="insight-box">
                <div class="insight-label">Day of Week</div>
                <div class="insight-value">${data.topDays || 'N/A'}</div>
            </div>
            <div class="insight-box">
                <div class="insight-label">Time of Day</div>
                <div class="insight-value">${data.timeOfDay || 'N/A'}</div>
            </div>
            <div class="insight-box">
                <div class="insight-label">Most Used Location</div>
                <div class="insight-value">${data.topLocation || 'N/A'}</div>
            </div>
            <div class="insight-box">
                <div class="insight-label">Most Used Workout</div>
                <div class="insight-value">${data.topWorkout || 'N/A'}</div>
            </div>
            ${isExpanded ? `
            <div class="insight-box">
                <div class="insight-label">Total Volume This Month</div>
                <div class="insight-value">${data.totalVolume || 'N/A'}</div>
            </div>
            <div class="insight-box">
                <div class="insight-label">Avg Duration</div>
                <div class="insight-value">${data.avgDuration || 'N/A'}</div>
            </div>
            ` : ''}
        </div>
    `;
}

// ===================================================================
// DASHBOARD BADGES SECTION (Same as stats page)
// ===================================================================

function renderDashboardBadgesSection(badges) {
    const badgesList = badges || [];
    const isExpanded = dashboardExpandedSections.badges;
    const earnedBadges = badgesList.filter(b => b.earned);

    return `
        <div class="stats-section-header" onclick="toggleDashboardSection('badges')">
            <span class="stats-section-title">Badges</span>
            <span class="view-more-link">${isExpanded ? 'Less' : 'View All'}</span>
        </div>

        <div class="badges-row-preview">
            ${earnedBadges.length > 0 ? earnedBadges.slice(0, 4).map(badge => `
                <div class="badge-preview-item ${badge.colorClass}">
                    <div class="badge-preview-icon">
                        <i class="${badge.icon}"></i>
                        ${badge.countBadge ? `<span class="badge-count-overlay">${badge.countBadge}</span>` : ''}
                    </div>
                    <span class="badge-preview-label">${badge.shortName}</span>
                </div>
            `).join('') : `
                <div class="badges-empty-msg">Complete workouts to earn badges!</div>
            `}
        </div>

        ${isExpanded ? renderDashboardBadgesExpanded(badgesList) : ''}
    `;
}

function renderDashboardBadgesExpanded(badges) {
    const earned = badges.filter(b => b.earned);
    const inProgress = badges.filter(b => !b.earned);

    return `
        <div class="badges-expanded">
            ${earned.length > 0 ? `
                <div class="badges-grid-section">
                    <h4>Earned</h4>
                    <div class="badges-full-grid">
                        ${earned.map(badge => `
                            <div class="badge-full-item ${badge.colorClass}">
                                <div class="badge-full-icon">
                                    <i class="${badge.icon}"></i>
                                    ${badge.countBadge ? `<span class="badge-count-overlay">${badge.countBadge}</span>` : ''}
                                </div>
                                <span class="badge-full-name">${badge.name}</span>
                                <span class="badge-full-desc">${badge.description}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${inProgress.length > 0 ? `
                <div class="badges-grid-section">
                    <h4>In Progress</h4>
                    <div class="badges-full-grid">
                        ${inProgress.map(badge => `
                            <div class="badge-full-item locked">
                                <div class="badge-full-icon">
                                    <i class="${badge.icon}"></i>
                                </div>
                                <span class="badge-full-name">${badge.name}</span>
                                <span class="badge-full-progress">${badge.progress || ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ===================================================================
// DASHBOARD RECENT PRS SECTION (Same as stats page)
// ===================================================================

function renderDashboardPRsSection(recentPRs) {
    const prs = recentPRs || [];
    const isExpanded = dashboardExpandedSections.prs;
    const totalPRCount = PRTracker.getTotalPRCount();

    return `
        <div class="stats-section-header mt-lg" onclick="toggleDashboardSection('prs')">
            <span class="stats-section-title">Recent PRs</span>
            <span class="view-more-link">${isExpanded ? 'Less' : 'View All'}</span>
        </div>

        <div class="prs-card-new">
            ${prs.length > 0 ? `
                <div class="prs-list-new">
                    ${prs.slice(0, 3).map(pr => renderDashboardPRItem(pr)).join('')}
                </div>
            ` : `
                <div class="prs-empty-new">
                    <p>No PRs recorded yet</p>
                    <p class="prs-hint">PRs tracked from ${formatDateShortDash(PRTracker.getPRCutoffDate())}</p>
                </div>
            `}

            ${isExpanded ? renderDashboardPRsExpanded() : ''}
        </div>
    `;
}

function renderDashboardPRItem(pr) {
    const dateDisplay = formatRelativeDateDash(pr.date);

    return `
        <div class="pr-item-new">
            <div class="pr-item-icon">
                <i class="fas fa-dumbbell"></i>
            </div>
            <div class="pr-item-content">
                <div class="pr-item-exercise">${pr.exercise}</div>
                <div class="pr-item-details">
                    <span class="pr-item-type">MAX WEIGHT</span>
                    <span class="pr-item-value">${pr.weight} lb x ${pr.reps}</span>
                    <span class="pr-item-meta">${dateDisplay}${pr.location ? ` - ${pr.location}` : ''}</span>
                </div>
            </div>
        </div>
    `;
}

function renderDashboardPRsExpanded() {
    const prsByBodyPart = PRTracker.getPRsByBodyPart();
    const bodyParts = Object.keys(prsByBodyPart).sort();

    if (bodyParts.length === 0) {
        return `<div class="prs-expanded-empty">Complete workouts to start tracking PRs</div>`;
    }

    return `
        <div class="prs-browser">
            ${bodyParts.map(bodyPart => {
                const exercises = prsByBodyPart[bodyPart];
                const exerciseCount = Object.keys(exercises).length;

                return `
                    <div class="pr-bodypart-group">
                        <div class="pr-bodypart-header" onclick="toggleDashboardPRBodyPart('${bodyPart}')">
                            <span class="pr-bodypart-name">${bodyPart}</span>
                            <span class="pr-bodypart-count">${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}</span>
                            <i class="fas fa-chevron-down pr-chevron"></i>
                        </div>
                        <div class="pr-bodypart-content" id="dash-pr-group-${bodyPart.replace(/\s+/g, '-')}">
                            ${Object.entries(exercises).map(([exerciseName, equipmentPRs]) => `
                                <div class="pr-exercise-item">
                                    <div class="pr-exercise-title">${exerciseName}</div>
                                    ${Object.entries(equipmentPRs).map(([equipment, prs]) => `
                                        <div class="pr-equipment-item">
                                            <span class="pr-equip-name">${equipment}</span>
                                            <span class="pr-equip-value">${prs.maxWeight?.weight || 0} lbs x ${prs.maxWeight?.reps || 0}</span>
                                            <span class="pr-equip-date">${formatDateShortDash(prs.maxWeight?.date)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ===================================================================
// DASHBOARD TOGGLE FUNCTIONS
// ===================================================================

export function toggleDashboardSection(section) {
    dashboardExpandedSections[section] = !dashboardExpandedSections[section];
    renderDashboard();
}

export function toggleDashboardPRBodyPart(bodyPart) {
    const groupId = `dash-pr-group-${bodyPart.replace(/\s+/g, '-')}`;
    const group = document.getElementById(groupId);
    const header = group?.previousElementSibling;

    if (group) {
        group.classList.toggle('collapsed');
        header?.classList.toggle('collapsed');
    }
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
// DASHBOARD INSIGHTS CALCULATION
// ===================================================================

async function calculateDashboardInsights() {
    if (!AppState.currentUser) return null;

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(
            workoutsRef,
            where('completedAt', '!=', null),
            orderBy('completedAt', 'desc')
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;

        const workouts = [];
        snapshot.forEach(doc => workouts.push({ id: doc.id, ...doc.data() }));

        const dayCount = {};
        const hourCount = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        const locationCount = {};
        const workoutTypeCount = {};
        let totalDuration = 0;
        let monthlyVolume = 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        workouts.forEach(workout => {
            if (workout.completedAt) {
                const date = new Date(workout.completedAt);
                const day = date.toLocaleDateString('en-US', { weekday: 'short' });
                dayCount[day] = (dayCount[day] || 0) + 1;

                const hour = date.getHours();
                if (hour >= 5 && hour < 12) hourCount.morning++;
                else if (hour >= 12 && hour < 17) hourCount.afternoon++;
                else if (hour >= 17 && hour < 21) hourCount.evening++;
                else hourCount.night++;

                if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
                    if (workout.exercises) {
                        Object.values(workout.exercises).forEach(exercise => {
                            if (exercise.sets) {
                                exercise.sets.forEach(set => {
                                    if (set.weight && set.reps) {
                                        monthlyVolume += set.weight * set.reps;
                                    }
                                });
                            }
                        });
                    }
                }
            }

            if (workout.location) {
                locationCount[workout.location] = (locationCount[workout.location] || 0) + 1;
            }

            if (workout.workoutType) {
                workoutTypeCount[workout.workoutType] = (workoutTypeCount[workout.workoutType] || 0) + 1;
            }

            if (workout.totalDuration) {
                totalDuration += workout.totalDuration;
            }
        });

        const topDaysArr = Object.entries(dayCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topDays = topDaysArr.map(d => d[0]).join(', ');

        const timeEntries = Object.entries(hourCount).sort((a, b) => b[1] - a[1]);
        const timeOfDay = timeEntries[0][1] > 0 ? capitalize(timeEntries[0][0]) : 'N/A';

        const topLocationEntry = Object.entries(locationCount).sort((a, b) => b[1] - a[1])[0];
        const topLocation = topLocationEntry ? topLocationEntry[0] : null;

        const topWorkoutEntry = Object.entries(workoutTypeCount).sort((a, b) => b[1] - a[1])[0];
        const topWorkout = topWorkoutEntry ? topWorkoutEntry[0] : null;

        const avgDurationMins = workouts.length > 0 ? Math.round((totalDuration / workouts.length) / 60) : 0;

        const formattedVolume = monthlyVolume > 0
            ? (monthlyVolume >= 1000 ? `${(monthlyVolume / 1000).toFixed(1)}k lbs` : `${monthlyVolume.toLocaleString()} lbs`)
            : 'N/A';

        return {
            topDays: topDays || 'N/A',
            timeOfDay,
            topLocation,
            topWorkout,
            avgDuration: avgDurationMins > 0 ? `${avgDurationMins} min` : 'N/A',
            totalVolume: formattedVolume
        };

    } catch (error) {
        console.error('Error calculating insights:', error);
        return null;
    }
}

// ===================================================================
// DASHBOARD BADGES CALCULATION
// ===================================================================

async function calculateDashboardBadges() {
    try {
        const streaks = await StreakTracker.calculateStreaks();
        const prCount = PRTracker.getTotalPRCount();

        const workoutManager = new FirebaseWorkoutManager(AppState);
        const locations = await workoutManager.getUserLocations();
        const locationCount = locations.length;

        const allBadges = [
            {
                id: 'consistency',
                name: 'Consistency',
                shortName: 'Consistency',
                description: 'Maintained a 7-day streak',
                icon: 'fas fa-check',
                colorClass: 'badge-turquoise',
                check: () => streaks && streaks.longestStreak >= 7
            },
            {
                id: 'workouts-100',
                name: '100 Workouts',
                shortName: '100 Workouts',
                description: 'Completed 100 workouts',
                icon: 'fas fa-dumbbell',
                colorClass: 'badge-gold',
                countBadge: streaks && streaks.totalWorkouts >= 50 ? '50' : null,
                check: () => streaks && streaks.totalWorkouts >= 50,
                progress: streaks ? `${Math.min(streaks.totalWorkouts, 100)}/100` : '0/100'
            },
            {
                id: 'heavy-lifter',
                name: '100 Lbs Lifted',
                shortName: '100 Lbs Lifted',
                description: 'Lifted 100+ lbs in a single set',
                icon: 'fas fa-weight-hanging',
                colorClass: 'badge-teal',
                check: () => prCount >= 1
            },
            {
                id: 'pr-streak',
                name: 'PR Streak',
                shortName: 'PR Streak',
                description: 'Set PRs on consecutive days',
                icon: 'fas fa-calendar-check',
                colorClass: 'badge-purple',
                check: () => prCount >= 5,
                progress: `${Math.min(prCount, 5)}/5 PRs`
            },
            {
                id: 'first-workout',
                name: 'First Workout',
                shortName: 'First',
                description: 'Completed your first workout',
                icon: 'fas fa-star',
                colorClass: 'badge-gold',
                check: () => streaks && streaks.totalWorkouts >= 1
            },
            {
                id: 'streak-30',
                name: '30-Day Streak',
                shortName: '30 Days',
                description: 'Worked out 30 days in a row',
                icon: 'fas fa-fire-alt',
                colorClass: 'badge-orange',
                check: () => streaks && streaks.longestStreak >= 30,
                progress: streaks ? `${Math.min(streaks.longestStreak, 30)}/30 days` : '0/30 days'
            },
            {
                id: 'explorer',
                name: 'Explorer',
                shortName: 'Explorer',
                description: 'Worked out at 5+ locations',
                icon: 'fas fa-map-marker-alt',
                colorClass: 'badge-teal',
                check: () => locationCount >= 5,
                progress: `${Math.min(locationCount, 5)}/5 locations`
            },
            {
                id: 'pr-hunter',
                name: 'PR Hunter',
                shortName: 'PRs',
                description: 'Set 10 personal records',
                icon: 'fas fa-trophy',
                colorClass: 'badge-gold',
                check: () => prCount >= 10,
                progress: `${Math.min(prCount, 10)}/10 PRs`
            }
        ];

        return allBadges.map(badge => ({
            ...badge,
            earned: badge.check()
        }));
    } catch (error) {
        console.error('Error calculating badges:', error);
        return [];
    }
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

function formatRelativeDateDash(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = date.toISOString().split('T')[0];
    const todayOnly = today.toISOString().split('T')[0];
    const yesterdayOnly = yesterday.toISOString().split('T')[0];

    if (dateOnly === todayOnly) return 'Today';
    if (dateOnly === yesterdayOnly) return 'Yesterday';

    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateShortDash(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
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
function renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes = [], inProgressWorkoutType = null) {
    if (!suggestedWorkouts || suggestedWorkouts.length === 0) {
        return ''; // Don't show section if no suggestions
    }

    // Filter out the in-progress workout (it has its own section)
    const filteredWorkouts = inProgressWorkoutType
        ? suggestedWorkouts.filter(w => (w.name || w.day) !== inProgressWorkoutType)
        : suggestedWorkouts;

    if (filteredWorkouts.length === 0) {
        return ''; // Don't show section if only workout is in-progress
    }

    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    // Check if all remaining suggested workouts are completed
    const allCompleted = filteredWorkouts.every(workout => {
        const workoutName = workout.name || workout.day;
        return completedWorkoutTypes.includes(workoutName);
    });

    // If all workouts are done, show a single congrats banner
    if (allCompleted && filteredWorkouts.length > 0) {
        const completedCount = filteredWorkouts.length;
        return `
            <div class="congrats-banner">
                <div class="congrats-icon">
                    <i class="fas fa-trophy"></i>
                </div>
                <div class="congrats-content">
                    <div class="congrats-title">${dayName} Complete!</div>
                    <div class="congrats-message">
                        ${completedCount === 1
                            ? `You crushed your workout today!`
                            : `You completed all ${completedCount} scheduled workouts!`}
                    </div>
                </div>
            </div>
        `;
    }

    const workoutCards = filteredWorkouts.map(workout => {
        const workoutName = workout.name || workout.day;
        const templateId = workout.id || workout.name;
        const isDefault = workout.isDefault || false;
        const isCompleted = completedWorkoutTypes.includes(workoutName);
        const exerciseCount = workout.exercises?.length || 0;

        if (isCompleted) {
            // Completed workout - show small congrats card
            return `
                <div class="suggested-card suggested-completed">
                    <div class="suggested-completed-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="suggested-info">
                        <div class="suggested-name">${workoutName}</div>
                        <div class="suggested-status">Done - Nice work!</div>
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
        <div class="stats-section-header">
            <span class="stats-section-title">${dayName} Workouts</span>
        </div>

        <div class="suggested-list">
            ${workoutCards}
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
