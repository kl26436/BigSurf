// Dashboard UI Module - core/dashboard-ui.js
// Unified dashboard with stats page layout, weekly goals, and in-progress workout

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString } from '../utils/date-helpers.js';
import { Config, CATEGORY_COLORS, getCategoryIcon } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { getWorkoutCategory } from './template-selection.js';
import { TrainingInsights } from '../features/training-insights.js';
import { showFirstUseTip } from '../features/first-use-tips.js';
import { updateSetting } from './settings-ui.js';

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

    // Load and render dashboard data (pill handles in-progress indicator now)
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
 * Render dashboard content - Unified stats page layout
 */
async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Show skeleton loading state
    container.innerHTML = `
        <div class="skeleton skeleton-card" style="height: 140px;"></div>
        <div class="skeleton skeleton-card" style="height: 56px;"></div>
        <div class="skeleton skeleton-card" style="height: 48px;"></div>
    `;

    try {
        // Load all stats in parallel
        const wm = new FirebaseWorkoutManager(AppState);
        const [streaks, weeklyStats, recentWorkouts, insightsData] =
            await Promise.all([
                StreakTracker.calculateStreaks(),
                StatsTracker.getWeeklyStats(),
                StatsTracker.getRecentWorkouts(10),
                TrainingInsights.loadInsightsData().catch(() => ({ recentWorkouts: [], allWorkouts: [] })),
            ]);

        await PRTracker.loadPRData();
        const recentPRs = PRTracker.getRecentPRs(3);

        // Use uniqueDays to count workout days (not total workouts)
        const weekCount = weeklyStats.uniqueDays || weeklyStats.workouts.length;
        const weeklyGoal = AppState.settings?.weeklyGoal || 5;
        const streakDays = streaks?.currentStreak || 0;

        // Hide the HTML resume banner — dashboard is informational only now
        const resumeBanner = document.getElementById('resume-workout-banner');
        if (resumeBanner) resumeBanner.classList.add('hidden');

        // Check if user has any workout history
        const hasWorkouts = streaks && streaks.totalWorkouts > 0;

        if (!hasWorkouts) {
            // Show welcome empty state for new users
            container.innerHTML = `
                ${renderGreetingHeader()}
                ${renderActiveWorkoutPill()}
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                    <div class="empty-state-title">No workouts yet</div>
                    <div class="empty-state-description">Tap the dumbbell button below to start your first workout.</div>
                </div>
            `;
            if (AppState.currentWorkout || window.inProgressWorkout) startPillTimer();
        } else {
            // Phase 2 Revised: Metrics-first informational dashboard
            const volumeChangePercent = await getVolumeChangePercent();

            // Get top single insight
            const exerciseDatabase = AppState.exerciseDatabase || [];
            const topInsight = TrainingInsights.getTopInsight(
                insightsData.recentWorkouts,
                insightsData.allWorkouts,
                exerciseDatabase
            );

            // Check if insight was dismissed today
            const insightDismissedDate = AppState.settings?.insightDismissedDate;
            const todayStr = getDateString(new Date());
            const showInsight = topInsight && insightDismissedDate !== todayStr;

            container.innerHTML = `
                ${renderGreetingHeader()}
                ${renderActiveWorkoutPill()}
                ${renderMetricsGrid(streakDays, weekCount, weeklyGoal)}
                ${renderWeekTimeline(weeklyStats, volumeChangePercent)}
                ${showInsight ? renderSingleInsight(topInsight) : ''}
                ${renderRecentWorkoutsList(recentWorkouts)}
                ${renderRecentPRsList(recentPRs)}
            `;

            // Start pill timer if active workout exists
            if (AppState.currentWorkout || window.inProgressWorkout) startPillTimer();
        }

        // Conditionally hide "Manage Locations" in More menu if no locations exist
        try {
            const locations = await wm.getUserLocations();
            const locMenuItem = document.getElementById('more-menu-locations');
            if (locMenuItem) {
                locMenuItem.classList.toggle('hidden', !locations || locations.length === 0);
            }
        } catch (e) {
            // Non-critical — leave menu item visible on error
        }

        // First-use tip — point new users to the More menu
        showFirstUseTip('more-menu');
    } catch (error) {
        console.error('❌ Error rendering dashboard:', error);
        container.innerHTML = `
            <div class="dashboard-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading dashboard</p>
                <button class="btn btn-primary" onclick="navigateTo('dashboard')">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}


// ===================================================================
// PHASE 2 REVISED: METRICS-FIRST DASHBOARD COMPONENTS
// ===================================================================

/**
 * Greeting header — time-of-day greeting + date + avatar.
 */
function renderGreetingHeader() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return `
        <div class="dash-greeting">
            <div class="dash-greeting__text">
                <h2>${greeting}</h2>
                <span>${dateStr}</span>
            </div>
            <div class="dash-greeting__avatar" onclick="navigateTo('settings')"></div>
        </div>
    `;
}

/**
 * Active workout pill — compact indicator below greeting.
 * Returns empty string if no workout in progress.
 */
function renderActiveWorkoutPill() {
    // Check both active workout state AND in-progress workout detected on load
    const inProgress = window.inProgressWorkout;
    const hasActiveWorkout = AppState.currentWorkout || inProgress;
    if (!hasActiveWorkout) return '';

    // Prefer live session data, fall back to in-progress workout from load
    const workoutType = AppState.savedData?.workoutType
        || AppState.currentWorkout?.workoutType
        || inProgress?.workoutType
        || 'Workout';
    const exercises = AppState.savedData?.exercises || inProgress?.exercises || {};
    const total = AppState.currentWorkout?.exercises?.length || Object.keys(exercises).length;
    const done = Object.values(exercises).filter(e => e.completed).length;
    const startedAt = AppState.savedData?.startedAt
        || AppState.currentWorkout?.startedAt
        || inProgress?.startedAt;
    const elapsedSeconds = startedAt
        ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
        : 0;
    const elapsed = formatPillElapsed(elapsedSeconds);

    return `
        <div class="active-pill-wrap" id="active-workout-pill">
            <div class="active-pill" onclick="resumeActiveWorkout()">
                <div class="active-pill__pulse"></div>
                <div class="active-pill__info">
                    <div class="active-pill__name">${escapeHtml(workoutType)}</div>
                    <div class="active-pill__meta">${done}/${total} · ${elapsed}</div>
                </div>
                <button class="active-pill__resume" aria-label="Resume workout"
                        onclick="event.stopPropagation(); resumeActiveWorkout()">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <div class="active-pill__cancel-row">
                <button class="active-pill__cancel" onclick="confirmCancelActiveWorkout()">
                    <i class="fas fa-times"></i> Cancel workout
                </button>
            </div>
        </div>
    `;
}

function formatPillElapsed(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

let pillTimerInterval = null;
function startPillTimer() {
    stopPillTimer();
    pillTimerInterval = setInterval(() => {
        const pill = document.querySelector('.active-pill__meta');
        const inProgress = window.inProgressWorkout;
        if (!pill || (!AppState.currentWorkout && !inProgress)) {
            stopPillTimer();
            return;
        }
        const exercises = AppState.savedData?.exercises || inProgress?.exercises || {};
        const total = AppState.currentWorkout?.exercises?.length || Object.keys(exercises).length;
        const done = Object.values(exercises).filter(e => e.completed).length;
        const startedAt = AppState.savedData?.startedAt || AppState.currentWorkout?.startedAt || inProgress?.startedAt;
        const elapsedSeconds = startedAt
            ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
            : 0;
        pill.textContent = `${done}/${total} · ${formatPillElapsed(elapsedSeconds)}`;
    }, 30000);
}
function stopPillTimer() {
    if (pillTimerInterval) { clearInterval(pillTimerInterval); pillTimerInterval = null; }
}

/**
 * Metrics grid — streak card + weekly ring side-by-side.
 */
function renderMetricsGrid(streakDays, weekCompleted, weekGoal) {
    const ringPct = weekGoal > 0 ? Math.min(100, (weekCompleted / weekGoal) * 100) : 0;
    const circumference = 107; // 2 * π * 17
    const offset = circumference - (circumference * ringPct / 100);
    return `
        <div class="dash-metrics-grid">
            <div class="hero-card dash-metric dash-metric--streak">
                <div class="dash-metric__label">Streak</div>
                <div class="dash-metric__value">${streakDays}</div>
                <div class="dash-metric__sub">days <i class="fas fa-fire"></i></div>
            </div>
            <div class="hero-card dash-metric dash-metric--ring">
                <svg class="dash-ring-svg" viewBox="0 0 40 40" aria-hidden="true">
                    <circle cx="20" cy="20" r="17" class="dash-ring-track"/>
                    <circle cx="20" cy="20" r="17" class="dash-ring-fill"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"
                            transform="rotate(-90 20 20)"/>
                </svg>
                <div class="dash-metric__ring-info">
                    <div class="dash-metric__value dash-metric__value--sm">${weekCompleted}/${weekGoal}</div>
                    <div class="dash-metric__sub">This week</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Week timeline — day dots (M-S) with checkmarks + volume trend chip.
 */
function renderWeekTimeline(weeklyStats, volumeDeltaPct) {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const todayIdx = new Date().getDay(); // Sunday=0

    // Build set of which day-of-week indices had workouts this week
    const workoutDayIndices = new Set();
    if (weeklyStats.workouts) {
        weeklyStats.workouts.forEach(w => {
            if (w.date) {
                const parts = w.date.split('-');
                const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                workoutDayIndices.add(d.getDay()); // Sunday=0
            }
        });
    }

    const dotsHtml = days.map((d, i) => {
        const done = workoutDayIndices.has(i);
        const today = i === todayIdx;
        const cls = done ? 'done' : today ? 'today' : '';
        const inner = done ? '<i class="fas fa-check"></i>' : today ? '<i class="fas fa-circle"></i>' : '';
        return `<div class="dash-day"><div class="dash-day__label">${d}</div><div class="dash-day__circle ${cls}">${inner}</div></div>`;
    }).join('');

    let trendHtml = '';
    if (volumeDeltaPct !== null) {
        const trendSign = volumeDeltaPct >= 0 ? '↑' : '↓';
        const trendCls = volumeDeltaPct >= 0 ? 'trend-up' : 'trend-down';
        trendHtml = `<span class="dash-timeline__trend ${trendCls}">${trendSign} ${Math.abs(volumeDeltaPct)}% volume</span>`;
    }

    return `
        <div class="hero-card dash-timeline">
            <div class="dash-timeline__head">
                <h3>This week</h3>
                ${trendHtml}
            </div>
            <div class="dash-timeline__dots">${dotsHtml}</div>
        </div>
    `;
}

/**
 * Recent Workouts list — last 3 unique workouts with per-row play buttons.
 */
function renderRecentWorkoutsList(recentWorkouts) {
    if (!recentWorkouts || recentWorkouts.length === 0) return '';

    // Deduplicate by workoutType — show most recent of each type
    const seen = new Set();
    const unique = [];
    for (const w of recentWorkouts) {
        if (w.workoutType && !seen.has(w.workoutType)) {
            seen.add(w.workoutType);
            unique.push(w);
        }
        if (unique.length >= 3) break;
    }
    if (unique.length === 0) return '';

    const items = unique.map(w => {
        const category = getWorkoutCategory(w.workoutType);
        const icon = getCategoryIcon(category);
        const when = formatRelativeDateDash(w.date);
        const durationMin = Math.round((w.totalDuration || 0) / 60);
        const exCount = w.exercises ? Object.keys(w.exercises).length : 0;
        const metaParts = [when, exCount > 0 ? `${exCount} exercises` : null, durationMin > 0 ? `${durationMin} min` : null].filter(Boolean).join(' · ');

        return `
            <div class="row-card dash-recent-row" onclick="startWorkoutFromHistory('${escapeAttr(w.id)}')">
                <div class="dash-recent__icon cat-bg-${category.toLowerCase()}">
                    <i class="${icon}"></i>
                </div>
                <div class="dash-recent__info">
                    <div class="dash-recent__name">${escapeHtml(w.workoutType)}</div>
                    <div class="dash-recent__meta">${metaParts}</div>
                </div>
                <button class="dash-recent__play" onclick="event.stopPropagation(); startWorkoutFromHistory('${escapeAttr(w.id)}')" aria-label="Restart this workout">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `;
    }).join('');

    return `
        <div class="dash-section-head">
            <h3>Recent Workouts</h3>
            <a onclick="navigateTo('history')">History →</a>
        </div>
        ${items}
    `;
}

/**
 * Recent PRs list — compact rows with trophy badges.
 */
function renderRecentPRsList(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';

    const items = recentPRs.slice(0, 3).map(pr => {
        const when = formatRelativeDateDash(pr.date);
        return `
            <div class="row-card dash-pr-row">
                <div class="dash-pr__badge"><i class="fas fa-trophy"></i></div>
                <div class="dash-pr__info">
                    <div class="dash-pr__name">${escapeHtml(pr.exercise)}</div>
                    <div class="dash-pr__meta">${when} · ${pr.reps} reps</div>
                </div>
                <div class="dash-pr__value">${pr.weight} lbs</div>
            </div>
        `;
    }).join('');

    return `
        <div class="dash-section-head">
            <h3>Recent PRs</h3>
            <a onclick="navigateTo('stats')">All →</a>
        </div>
        ${items}
    `;
}

/**
 * Start a workout from the Recent Workouts list.
 * Finds the matching template and starts it, or builds a one-off from history.
 */
export async function startWorkoutFromHistory(workoutId) {
    try {
        // Load the historical workout
        const { getDoc, doc, db } = await import('../data/firebase-config.js');
        const workoutRef = doc(db, 'users', AppState.currentUser.uid, 'workouts', workoutId);
        const snap = await getDoc(workoutRef);
        if (!snap.exists()) {
            showNotification('Workout not found', 'warning');
            return;
        }
        const workout = snap.data();
        const workoutType = workout.workoutType;

        // Try to find a matching template
        const wm = new FirebaseWorkoutManager(AppState);
        const templates = await wm.getUserWorkoutTemplates();
        const match = templates.find(t => (t.name || t.day) === workoutType);

        if (match) {
            const { selectTemplate } = await import('./template-selection.js');
            await selectTemplate(match.id || match.name, match.isDefault || false);
        } else {
            // No matching template — start directly from the historical workout's exercises
            const { startWorkoutFromExercises } = await import('../workout/workout-core.js');
            if (typeof startWorkoutFromExercises === 'function') {
                await startWorkoutFromExercises(workoutType, workout.exercises);
            } else {
                // Fallback: navigate to workout selector
                showNotification(`Template "${workoutType}" not found — pick from your list`, 'info');
                const { bottomNavTo } = await import('./navigation.js');
                bottomNavTo('workout');
            }
        }
    } catch (error) {
        console.error('❌ Error starting workout from history:', error);
        showNotification('Error starting workout', 'error');
    }
}

/**
 * Single Insight Card — shows only the top-priority insight with actionable text.
 */
function renderSingleInsight(insight) {
    if (!insight) return '';

    const severityClass = {
        warning: 'insight-warning',
        info: 'insight-info',
        success: 'insight-success',
    };
    const cls = severityClass[insight.severity] || 'insight-info';

    return `
        <div class="insight-card-compact hero-card hero-card-flat ${cls}">
            <button class="insight-dismiss" onclick="dismissInsight()" aria-label="Dismiss">
                <i class="fas fa-times"></i>
            </button>
            <div class="insight-content">
                <span class="insight-icon"><i class="fas ${insight.icon}"></i></span>
                <p class="insight-text">${escapeHtml(insight.message)}</p>
            </div>
        </div>
    `;
}

/**
 * Dismiss the insight for the rest of the day.
 */
export function dismissInsight() {
    const todayStr = getDateString(new Date());
    updateSetting('insightDismissedDate', todayStr);
    const card = document.querySelector('.insight-card-compact');
    if (card) card.remove();
}

export function resumeActiveWorkout() {
    stopPillTimer();
    // Use window exports to avoid circular import with workout-session
    if (window.continueInProgressWorkout) {
        window.continueInProgressWorkout();
    } else {
        window.bottomNavTo?.('workout');
    }
}

export function confirmCancelActiveWorkout() {
    if (!confirm('Cancel this workout? Logged sets will be saved as an incomplete entry.')) return;
    stopPillTimer();
    document.getElementById('active-workout-pill')?.remove();
    window.cancelWorkout?.();
}

/**
 * Calculate volume change percentage between this week and last week.
 * Returns null if no comparison data available.
 */
async function getVolumeChangePercent() {
    try {
        const thisWeek = await StatsTracker.getWeeklyStats();
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

        if (lastWeekVolume === 0) return null;
        return Number(((thisWeekVolume - lastWeekVolume) / lastWeekVolume * 100).toFixed(0));
    } catch {
        return null;
    }
}

// ===================================================================
// HELPERS
// ===================================================================

function formatRelativeDateDash(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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

