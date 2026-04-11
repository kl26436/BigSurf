// Dashboard UI Module - core/dashboard-ui.js
// Unified dashboard with stats page layout, weekly goals, and in-progress workout

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString } from '../utils/date-helpers.js';
import { Config, CATEGORY_COLORS } from '../utils/config.js';
import { registerRestDisplayUpdater, unregisterRestDisplayUpdater } from '../utils/rest-display-manager.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { getWorkoutCategory } from './template-selection.js';

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
        const { AppState } = await import('../utils/app-state.js');
        const { loadTodaysWorkout } = await import('../data/data-manager.js');

        // Check today's workout first
        let workoutData = await loadTodaysWorkout(AppState);

        // If no incomplete workout today, check yesterday (in case workout started before midnight)
        // Schema v3.0: Use loadWorkoutsByDate which handles both old and new schemas
        if (!workoutData || workoutData.completedAt || workoutData.cancelledAt) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = getDateString(yesterday);

            const { loadWorkoutsByDate } = await import('../data/data-manager.js');
            const yesterdayWorkouts = await loadWorkoutsByDate(AppState, yesterdayStr);

            // Find any incomplete workout from yesterday
            const incompleteYesterday = yesterdayWorkouts.find((w) => !w.completedAt && !w.cancelledAt);

            if (incompleteYesterday) {
                workoutData = incompleteYesterday;
            }
        }

        if (workoutData && !workoutData.completedAt && !workoutData.cancelledAt) {
            // Check if workout is too old (> 3 hours) - probably abandoned
            const workoutStart = new Date(workoutData.startedAt);
            const hoursSinceStart = (Date.now() - workoutStart.getTime()) / (1000 * 60 * 60);

            if (hoursSinceStart > Config.ABANDONED_WORKOUT_TIMEOUT_HOURS) {
                // Check if workout has any completed exercises
                const hasCompletedExercises =
                    workoutData.exercises &&
                    Object.values(workoutData.exercises).some((ex) => ex.completed || (ex.sets && ex.sets.length > 0));

                const { setDoc, doc, db, deleteDoc } = await import('../data/firebase-config.js');
                const docId = workoutData.docId || workoutData.workoutId;
                const workoutRef = doc(db, 'users', AppState.currentUser.uid, 'workouts', docId);

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
            const workoutPlan = AppState.workoutPlans.find(
                (plan) =>
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
                originalWorkout: workoutData.originalWorkout || workoutPlan,
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
                    exerciseSource.forEach((exercise) => {
                        totalSets += exercise.sets || 3;
                    });
                }

                // Get completed sets and exercises from saved data
                if (workoutData.exercises) {
                    Object.values(workoutData.exercises).forEach((exercise) => {
                        if (exercise.sets && exercise.sets.length > 0) {
                            const exerciseSets = exercise.sets.filter((set) => set.reps && set.weight);
                            completedSets += exerciseSets.length;
                            if (exercise.completed || exerciseSets.length > 0) {
                                completedExercises++;
                            }
                        }
                    });
                }

                // Update progress ring
                const percentage = totalSets > 0 ? (completedSets / totalSets) : 0;
                const circumference = 2 * Math.PI * 24; // radius = 24
                const progressRing = document.getElementById('resume-progress-ring');
                if (progressRing) {
                    const offset = circumference * (1 - percentage);
                    progressRing.style.strokeDasharray = `${circumference}`;
                    progressRing.style.strokeDashoffset = `${offset}`;
                }

                // Update stat values
                const statSets = document.getElementById('resume-stat-sets');
                const statExercises = document.getElementById('resume-stat-exercises');
                const statTime = document.getElementById('resume-stat-time');

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


/**
 * Start live rest timer updates on dashboard
 */
function startDashboardRestTimer() {
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

    registerRestDisplayUpdater('dashboard', updateRestDisplay);
}

/**
 * Stop dashboard rest timer updates
 */
function stopDashboardRestTimer() {
    unregisterRestDisplayUpdater('dashboard');
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
        // Load all stats in parallel
        const [streaks, weeklyStats, suggestedWorkouts, todaysWorkout, inProgressWorkout] =
            await Promise.all([
                StreakTracker.calculateStreaks(),
                StatsTracker.getWeeklyStats(),
                getSuggestedWorkoutsForToday(),
                getTodaysCompletedWorkout(),
                getInProgressWorkoutData(),
            ]);

        await PRTracker.loadPRData();
        const recentPRs = PRTracker.getRecentPRs(3);

        // Use uniqueDays to count workout days (not total workouts)
        const weekCount = weeklyStats.uniqueDays || weeklyStats.workouts.length;
        const weeklyGoal = AppState.settings?.weeklyGoal || 5;
        const completedWorkoutTypes = todaysWorkout ? [todaysWorkout.workoutType] : [];
        const inProgressWorkoutType = inProgressWorkout?.workoutType || null;

        // Check if user has any workout history
        const hasWorkouts = streaks && streaks.totalWorkouts > 0;

        if (!hasWorkouts) {
            // Show welcome empty state for new users
            container.innerHTML = `
                <div class="empty-state empty-state--hero">
                    <i class="fas fa-dumbbell"></i>
                    <h3>No workouts yet</h3>
                    <p>Start your first workout to see your progress, streaks, and personal records here.</p>
                    <button class="btn btn-primary" onclick="navigateTo('workout')">
                        <i class="fas fa-play"></i> Start Workout
                    </button>
                </div>
                ${renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType)}
            `;
        } else {
            // Build the dashboard - focused on "what to do today" and quick glance stats
            const volumeChip = await renderVolumeComparisonChip();
            container.innerHTML = `
                ${renderWeeklyGoalSection(weekCount, weeklyGoal, weeklyStats)}
                ${volumeChip}
                ${renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType)}
                ${renderDashboardStreakBoxes(streaks)}
                ${renderDashboardPRsSection(recentPRs)}
                ${await renderDashboardMiniChart()}
            `;
        }

        // Conditionally hide "Manage Locations" in More menu if no locations exist
        try {
            const wm = new FirebaseWorkoutManager(AppState);
            const locations = await wm.getUserLocations();
            const locMenuItem = document.getElementById('more-menu-locations');
            if (locMenuItem) {
                locMenuItem.classList.toggle('hidden', !locations || locations.length === 0);
            }
        } catch (e) {
            // Non-critical — leave menu item visible on error
        }

        // Event delegation for suggested workout cards
        container.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="startSuggestedWorkout"]');
            if (!card) return;
            startSuggestedWorkout(card.dataset.templateId, card.dataset.isDefault === 'true');
        });
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
        const { AppState } = await import('../utils/app-state.js');
        const { loadTodaysWorkout } = await import('../data/data-manager.js');
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
    const percentage = weeklyGoal > 0 ? Math.min((weekCount / weeklyGoal) * 100, 100) : 0;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const isComplete = weekCount >= weeklyGoal;

    // Build day-of-week dots (Sun=0 through Sat=6)
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const today = new Date();
    const todayDow = today.getDay();

    // Get which days of the week had workouts
    const workoutDays = new Set();
    if (weeklyStats.workouts) {
        weeklyStats.workouts.forEach(w => {
            if (w.date) {
                const parts = w.date.split('-');
                const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                workoutDays.add(d.getDay());
            }
        });
    }

    const dayDotsHtml = dayLabels.map((label, i) => {
        const completed = workoutDays.has(i);
        const isToday = i === todayDow;
        let cls = 'day-dot';
        if (completed) cls += ' completed';
        else if (isToday) cls += ' today';
        return `<span class="${cls}">${label}</span>`;
    }).join('');

    // Calculate total volume for the week
    let totalVolume = 0;
    if (weeklyStats.workouts) {
        weeklyStats.workouts.forEach(w => {
            if (w.exercises) {
                Object.values(w.exercises).forEach(ex => {
                    if (ex.sets) {
                        ex.sets.forEach(s => {
                            if (s.reps && s.weight) {
                                totalVolume += s.reps * s.weight;
                            }
                        });
                    }
                });
            }
        });
    }
    const volumeDisplay = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;

    return `
        <div class="weekly-goal-hero">
            <div class="weekly-ring-container">
                <svg class="weekly-ring" width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="${radius}" stroke="rgba(255,255,255,0.06)" stroke-width="8" fill="none"/>
                    <circle class="ring-progress-animated" cx="60" cy="60" r="${radius}"
                            stroke="${isComplete ? 'var(--success)' : 'var(--primary)'}" stroke-width="8" fill="none"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}"
                            stroke-linecap="round" transform="rotate(-90 60 60)"/>
                </svg>
                <div class="ring-center-text">
                    <span class="ring-count">${weekCount}</span>
                    <span class="ring-goal">of ${weeklyGoal}</span>
                </div>
            </div>

            <div class="week-day-dots">${dayDotsHtml}</div>

            <div class="weekly-stats-row">
                <div class="weekly-stat">
                    <span class="weekly-stat-value">${weeklyStats.sets}</span>
                    <span class="weekly-stat-label">Sets</span>
                </div>
                <div class="weekly-stat-divider"></div>
                <div class="weekly-stat">
                    <span class="weekly-stat-value">${volumeDisplay}</span>
                    <span class="weekly-stat-label">Volume</span>
                </div>
                <div class="weekly-stat-divider"></div>
                <div class="weekly-stat">
                    <span class="weekly-stat-value">${weeklyStats.minutes}</span>
                    <span class="weekly-stat-label">Minutes</span>
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
        const { loadTodaysWorkout } = await import('../data/data-manager.js');

        // Check today first
        let workoutData = await loadTodaysWorkout(AppState);

        // If no incomplete workout today, check yesterday
        if (!workoutData || workoutData.completedAt || workoutData.cancelledAt) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = getDateString(yesterday);

            const { getDoc, doc, db } = await import('../data/firebase-config.js');
            const yesterdayRef = doc(db, 'users', AppState.currentUser.uid, 'workouts', yesterdayStr);
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

            if (hoursSinceStart > Config.ABANDONED_WORKOUT_TIMEOUT_HOURS) {
                return null; // Will be auto-handled by checkForInProgressWorkout
            }

            // Calculate sets info
            let completedSets = 0;
            let totalSets = 0;

            const exerciseSource = workoutData.originalWorkout?.exercises || [];
            exerciseSource.forEach((exercise) => {
                totalSets += exercise.sets || 3;
            });

            if (workoutData.exercises) {
                Object.values(workoutData.exercises).forEach((exercise) => {
                    if (exercise.sets) {
                        completedSets += exercise.sets.filter((set) => set.reps && set.weight).length;
                    }
                });
            }

            return {
                ...workoutData,
                completedSets,
                totalSets,
                minutesElapsed: Math.floor(hoursSinceStart * 60),
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
    const percentage = workout.totalSets > 0 ? Math.round((workout.completedSets / workout.totalSets) * 100) : 0;

    const timeDisplay =
        workout.minutesElapsed < 60 ? `${workout.minutesElapsed} min` : `${(workout.minutesElapsed / 60).toFixed(1)}h`;

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
                    <div class="in-progress-name">${escapeHtml(workoutName)}</div>
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
    const streakData = stats || { currentStreak: 0, longestStreak: 0, totalWorkouts: 0, workoutsThisMonth: 0, workoutDates: [] };
    const isActive = streakData.currentStreak > 0;
    const onFire = streakData.currentStreak >= 7;

    // Build mini month heatmap
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const workoutDateSet = new Set(streakData.workoutDates || []);

    let heatmapHtml = '';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasWorkout = workoutDateSet.has(dateStr);
        const isToday = d === today.getDate();
        let cls = 'heatmap-cell';
        if (hasWorkout) cls += ' active';
        if (isToday) cls += ' today';
        heatmapHtml += `<div class="${cls}" title="${dateStr}"></div>`;
    }

    return `
        <div class="streak-section">
            <div class="streak-hero ${isActive ? 'active' : ''}">
                <div class="streak-flame-wrap">
                    <i class="fas fa-fire streak-flame ${onFire ? 'on-fire' : ''}"></i>
                    <span class="streak-count-overlay">${streakData.currentStreak}</span>
                </div>
                <div class="streak-hero-text">
                    <span class="streak-label">Day Streak</span>
                    <span class="streak-subtext">${isActive ? 'Keep it going!' : 'Start a streak today'}</span>
                </div>
            </div>

            <div class="streak-stats-row">
                <div class="streak-stat">
                    <span class="streak-stat-value">${streakData.longestStreak}</span>
                    <span class="streak-stat-label">Best Streak</span>
                </div>
                <div class="streak-stat">
                    <span class="streak-stat-value">${streakData.workoutsThisMonth || 0}</span>
                    <span class="streak-stat-label">This Month</span>
                </div>
                <div class="streak-stat">
                    <span class="streak-stat-value">${streakData.totalWorkouts}</span>
                    <span class="streak-stat-label">All Time</span>
                </div>
            </div>

            <div class="streak-heatmap">${heatmapHtml}</div>
        </div>
    `;
}



// ===================================================================
// DASHBOARD RECENT PRS SECTION (compact, non-expandable)
// ===================================================================

function renderDashboardPRsSection(recentPRs) {
    const prs = recentPRs || [];

    if (prs.length === 0) return '';

    return `
        <div class="stats-section-header mt-lg">
            <span class="stats-section-title">Recent PRs</span>
            <button class="btn-text-small" onclick="navigateTo('stats')">View all</button>
        </div>

        <div class="pr-achievement-list">
            ${prs
                .slice(0, 3)
                .map((pr) => renderDashboardPRItem(pr))
                .join('')}
        </div>
    `;
}

function renderDashboardPRItem(pr) {
    const dateDisplay = formatRelativeDateDash(pr.date);

    return `
        <div class="pr-achievement-card">
            <div class="pr-achievement-header">
                <i class="fas fa-trophy" style="color: var(--badge-gold);"></i>
                <span class="pr-achievement-exercise">${escapeHtml(pr.exercise)}</span>
                <span class="pr-achievement-date">${dateDisplay}</span>
            </div>
            <div class="pr-achievement-body">
                <span class="pr-achievement-value">${pr.weight} lbs</span>
                <span class="pr-achievement-detail">&times; ${pr.reps} reps</span>
            </div>
        </div>
    `;
}

async function renderVolumeComparisonChip() {
    try {
        const { StatsTracker: ST } = await import('../features/stats-tracker.js');
        // Get this week's and last week's stats
        const thisWeek = await ST.getWeeklyStats();
        // Calculate last week's volume from workouts
        let thisWeekVolume = 0;
        if (thisWeek.workouts) {
            thisWeek.workouts.forEach(w => {
                if (w.exercises) {
                    Object.values(w.exercises).forEach(ex => {
                        if (ex.sets) {
                            ex.sets.forEach(s => {
                                if (s.reps && s.weight) thisWeekVolume += s.reps * s.weight;
                            });
                        }
                    });
                }
            });
        }

        // Query last week
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfLastWeek = new Date(today);
        startOfLastWeek.setDate(today.getDate() - dayOfWeek - 7);
        const endOfLastWeek = new Date(today);
        endOfLastWeek.setDate(today.getDate() - dayOfWeek - 1);

        const { collection, query, where, orderBy, getDocs, db } = await import('../data/firebase-config.js');
        const startStr = getDateString(startOfLastWeek);
        const endStr = getDateString(endOfLastWeek);
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(workoutsRef, where('date', '>=', startStr), where('date', '<=', endStr), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);

        let lastWeekVolume = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.completedAt || data.cancelledAt) return;
            if (data.exercises) {
                Object.values(data.exercises).forEach(ex => {
                    if (ex.sets) {
                        ex.sets.forEach(s => {
                            if (s.reps && s.weight) lastWeekVolume += s.reps * s.weight;
                        });
                    }
                });
            }
        });

        if (lastWeekVolume === 0) return '';

        const trend = ((thisWeekVolume - lastWeekVolume) / lastWeekVolume * 100).toFixed(0);
        const isUp = Number(trend) >= 0;

        return `
            <div class="volume-trend-chip ${isUp ? 'up' : 'down'}">
                <i class="fas fa-arrow-${isUp ? 'up' : 'down'}"></i>
                ${Math.abs(trend)}% vs last week
            </div>
        `;
    } catch {
        return '';
    }
}

// Legacy toggle exports (sections removed, kept for backwards compatibility)
export function toggleDashboardSection() {}
export function toggleDashboardPRBodyPart() {}


// ===================================================================
// DASHBOARD MINI CHART (sparkline for most-trained exercise)
// ===================================================================

async function renderDashboardMiniChart() {
    try {
        const { ExerciseProgress } = await import('../features/exercise-progress.js');
        const exerciseList = await ExerciseProgress.getExerciseList();

        if (exerciseList.length === 0) return '';

        // Pick the exercise with the most sessions
        const topExercise = exerciseList.reduce((best, ex) =>
            ex.sessionCount > best.sessionCount ? ex : best
        );

        const chartData = await ExerciseProgress.getChartData(topExercise.key, '3M');

        if (!chartData || chartData.data.length < 2) return '';

        // Calculate trend
        const first = chartData.data[0];
        const last = chartData.data[chartData.data.length - 1];
        const change = last - first;
        const changePercent = first > 0 ? ((change / first) * 100).toFixed(1) : 0;
        const trendIcon = change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        const trendClass = change >= 0 ? 'positive' : 'negative';

        // Build sparkline points (SVG polyline)
        const width = 280;
        const height = 50;
        const padding = 4;
        const values = chartData.data;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        const points = values.map((val, i) => {
            const x = padding + (i / (values.length - 1)) * (width - padding * 2);
            const y = padding + (1 - (val - min) / range) * (height - padding * 2);
            return `${x},${y}`;
        }).join(' ');

        return `
            <div class="stats-section-header">
                <span class="stats-section-title">Top Exercise</span>
            </div>

            <div class="mini-chart-card" onclick="navigateTo('stats')">
                <div class="mini-chart-header">
                    <div class="mini-chart-exercise">${escapeHtml(topExercise.exercise)}</div>
                    <div class="mini-chart-equipment">${escapeHtml(topExercise.equipment !== 'Unknown' ? topExercise.equipment : '')}</div>
                </div>
                <div class="mini-chart-body">
                    <svg class="mini-chart-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                        <polyline
                            points="${points}"
                            fill="none"
                            stroke="var(--primary)"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                    <div class="mini-chart-stats">
                        <span class="mini-chart-current">${last} lbs</span>
                        <span class="mini-chart-change ${trendClass}">
                            <i class="fas ${trendIcon}"></i>
                            ${Math.abs(change)} lbs (${Math.abs(changePercent)}%)
                        </span>
                        <span class="mini-chart-period">Last 3 months</span>
                    </div>
                </div>
                <div class="mini-chart-tap-hint">
                    <i class="fas fa-chart-line"></i> Tap for full progress
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error rendering mini chart:', error);
        return '';
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

    const dateOnly = getDateString(date);
    const todayOnly = getDateString(today);
    const yesterdayOnly = getDateString(yesterday);

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
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const allTemplates = await workoutManager.getUserWorkoutTemplates();

        // Filter to templates with today in suggestedDays array
        // Also ensure we skip any hidden or deleted templates
        const suggested = allTemplates.filter((template) => {
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
// Category color mapping for workout cards
// CATEGORY_COLORS is now imported from config.js

function renderSuggestedWorkoutsNew(suggestedWorkouts, completedWorkoutTypes = [], inProgressWorkoutType = null) {
    if (!suggestedWorkouts || suggestedWorkouts.length === 0) {
        return '';
    }

    const filteredWorkouts = inProgressWorkoutType
        ? suggestedWorkouts.filter((w) => (w.name || w.day) !== inProgressWorkoutType)
        : suggestedWorkouts;

    if (filteredWorkouts.length === 0) {
        return '';
    }

    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    // Check if all completed
    const allCompleted = filteredWorkouts.every((workout) => {
        const workoutName = workout.name || workout.day;
        return completedWorkoutTypes.includes(workoutName);
    });

    if (allCompleted && filteredWorkouts.length > 0) {
        return `
            <div class="congrats-banner">
                <div class="congrats-icon"><i class="fas fa-trophy"></i></div>
                <div class="congrats-content">
                    <div class="congrats-title">${dayName} Complete!</div>
                    <div class="congrats-message">${filteredWorkouts.length === 1 ? 'You crushed your workout today!' : `You completed all ${filteredWorkouts.length} scheduled workouts!`}</div>
                </div>
            </div>
        `;
    }

    const workoutCards = filteredWorkouts
        .map((workout, index) => {
            const workoutName = workout.name || workout.day;
            const templateId = workout.id || workout.name;
            const isDefault = workout.isDefault || false;
            const isCompleted = completedWorkoutTypes.includes(workoutName);
            const exerciseCount = workout.exercises?.length || 0;
            const category = getWorkoutCategory(workoutName);
            const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];

            // Get muscle group tags from exercises
            const muscleTags = [];
            if (workout.exercises) {
                const bodyParts = new Set();
                workout.exercises.forEach(ex => {
                    if (ex.bodyPart) bodyParts.add(ex.bodyPart);
                });
                bodyParts.forEach(bp => muscleTags.push(bp));
            }

            // Estimate workout time (~3 min per exercise)
            const estimatedMinutes = Math.round(exerciseCount * 3.5);

            if (isCompleted) {
                return `
                <div class="suggested-compact suggested-completed-card">
                    <div class="suggested-compact-bar" style="background: var(--success)"></div>
                    <div class="suggested-compact-info">
                        <span class="suggested-compact-name">${escapeHtml(workoutName)}</span>
                        <span class="suggested-compact-meta">Done!</span>
                    </div>
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                </div>
                `;
            }

            // First non-completed workout gets featured treatment
            if (index === 0 || (index === 1 && completedWorkoutTypes.includes(filteredWorkouts[0].name || filteredWorkouts[0].day))) {
                return `
                <div class="suggested-featured" data-action="startSuggestedWorkout" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}">
                    <div class="suggested-featured-accent" style="background: ${categoryColor}"></div>
                    <div class="suggested-featured-content">
                        <div class="suggested-category-badge" style="background: ${categoryColor}20; color: ${categoryColor}">
                            ${escapeHtml(category)}
                        </div>
                        <h4 class="suggested-featured-name">${escapeHtml(workoutName)}</h4>
                        <div class="suggested-meta-row">
                            <span><i class="fas fa-dumbbell"></i> ${exerciseCount} exercises</span>
                            <span><i class="fas fa-clock"></i> ~${estimatedMinutes} min</span>
                        </div>
                        ${muscleTags.length > 0 ? `
                        <div class="suggested-muscle-tags">
                            ${muscleTags.slice(0, 4).map(t => `<span class="muscle-tag">${escapeHtml(t)}</span>`).join('')}
                        </div>` : ''}
                    </div>
                    <button class="btn btn-primary btn-small">Start</button>
                </div>
                `;
            }

            // Compact cards for subsequent workouts
            return `
            <div class="suggested-compact" data-action="startSuggestedWorkout" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}">
                <div class="suggested-compact-bar" style="background: ${categoryColor}"></div>
                <div class="suggested-compact-info">
                    <span class="suggested-compact-name">${escapeHtml(workoutName)}</span>
                    <span class="suggested-compact-meta">${exerciseCount} exercises</span>
                </div>
                <i class="fas fa-play-circle" style="color: var(--primary); font-size: 1.2rem;"></i>
            </div>
            `;
        })
        .join('');

    return `
        <div class="suggested-section">
            <div class="stats-section-header">
                <span class="stats-section-title">${dayName}'s Workouts</span>
                <button class="btn-text-small" onclick="navigateTo('workout')">See all</button>
            </div>
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
