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
import { TrainingInsights } from '../features/training-insights.js';
import { detectLocation, getSessionLocation } from '../features/location-service.js';
import {
    getEquipmentAtLocation,
    getExercisesAtLocation,
    checkTemplateCompatibility,
} from '../features/equipment-planner.js';
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

    // Show skeleton loading state
    container.innerHTML = `
        <div class="skeleton skeleton-card" style="height: 140px;"></div>
        <div class="skeleton skeleton-card" style="height: 56px;"></div>
        <div class="skeleton skeleton-card" style="height: 48px;"></div>
    `;

    try {
        // Load all stats in parallel
        const wm = new FirebaseWorkoutManager(AppState);
        const [streaks, weeklyStats, suggestedWorkouts, todaysWorkout, inProgressWorkout, insightsData] =
            await Promise.all([
                StreakTracker.calculateStreaks(),
                StatsTracker.getWeeklyStats(),
                getSuggestedWorkoutsForToday(),
                getTodaysCompletedWorkout(),
                getInProgressWorkoutData(),
                TrainingInsights.loadInsightsData().catch(() => ({ recentWorkouts: [], allWorkouts: [] })),
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
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                    <div class="empty-state-title">No workouts yet</div>
                    <div class="empty-state-description">Start your first workout to see your progress, streaks, and personal records here.</div>
                    <button class="btn btn-primary" onclick="navigateTo('workout')">
                        <i class="fas fa-play"></i> Start Workout
                    </button>
                </div>
                ${renderHeroWorkoutCard(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType, [])}
            `;
        } else {
            // Phase 2: Focused dashboard — "What should I do right now?"
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

            // Compact stats data
            const totalPRs = PRTracker.getAllPRs?.()?.length || recentPRs.length;
            const thisMonthWorkouts = streaks?.workoutsThisMonth || 0;
            const totalWorkouts = streaks?.totalWorkouts || 0;

            // Collapsible PRs
            const prListHtml = renderCollapsiblePRList(recentPRs);
            const collapsiblePRs = prListHtml ? renderCollapsibleSection('Recent PRs', prListHtml) : '';

            container.innerHTML = `
                ${renderHeroWorkoutCard(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType, insightsData.allWorkouts || [])}
                ${renderCompactProgress(weekCount, weeklyGoal, streaks, volumeChangePercent)}
                ${showInsight ? renderSingleInsight(topInsight) : ''}
                ${renderCompactStats(totalPRs, thisMonthWorkouts, totalWorkouts)}
                ${collapsiblePRs}
            `;
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

        // Event delegation for suggested workout cards (hero card + remaining items)
        container.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="startSuggestedWorkout"]');
            if (!card) return;
            startSuggestedWorkout(card.dataset.templateId, card.dataset.isDefault === 'true');
        });

        // Async-detect location and add equipment badges to hero card (Phase 16)
        if (hasWorkouts && suggestedWorkouts.length > 0) {
            appendEquipmentBadges(container, suggestedWorkouts, wm);
        }

        // First-use tip — point new users to the More menu
        showFirstUseTip('more-menu');
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
// PHASE 2: DASHBOARD OVERHAUL — NEW FOCUSED COMPONENTS
// ===================================================================

/**
 * Hero Workout Card — primary dashboard CTA.
 * Shows the first suggested workout for today with a big START button.
 */
function renderHeroWorkoutCard(suggestedWorkouts, completedWorkoutTypes, inProgressWorkoutType, allWorkouts) {
    // Filter out in-progress and completed workouts
    const available = (suggestedWorkouts || []).filter(w => {
        const name = w.name || w.day;
        if (inProgressWorkoutType && name === inProgressWorkoutType) return false;
        if (completedWorkoutTypes.includes(name)) return false;
        return true;
    });

    const suggested = available[0] || null;

    // Check if all today's workouts are done
    const allScheduled = (suggestedWorkouts || []).filter(w => {
        const name = w.name || w.day;
        return !(inProgressWorkoutType && name === inProgressWorkoutType);
    });
    const allCompleted = allScheduled.length > 0 && allScheduled.every(w =>
        completedWorkoutTypes.includes(w.name || w.day)
    );

    if (allCompleted && allScheduled.length > 0) {
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        return `
            <div class="hero-workout-card hero-card">
                <div class="hero-workout-header">
                    <span class="hero-workout-category">Complete</span>
                </div>
                <h2 class="hero-workout-name">${dayName} Done!</h2>
                <div class="hero-workout-meta">${allScheduled.length === 1 ? 'You crushed your workout today!' : `All ${allScheduled.length} scheduled workouts complete!`}</div>
                <button class="btn-hero-start btn-hero-secondary" onclick="navigateTo('workout')">
                    <i class="fas fa-plus"></i> Add Another
                </button>
            </div>
        `;
    }

    if (!suggested) {
        return `
            <div class="hero-workout-card hero-card">
                <div class="hero-workout-header">
                    <span class="hero-workout-category">Today</span>
                </div>
                <h2 class="hero-workout-name">Start a Workout</h2>
                <div class="hero-workout-meta">Pick from your templates</div>
                <button class="btn-hero-start" onclick="navigateTo('workout')">
                    <i class="fas fa-play"></i> Choose Workout
                </button>
            </div>
        `;
    }

    const workoutName = suggested.name || suggested.day;
    const templateId = suggested.id || suggested.name;
    const isDefault = suggested.isDefault || false;
    const exerciseCount = suggested.exercises?.length || 0;
    const estimatedMinutes = Math.round(exerciseCount * 3.5);
    const category = getWorkoutCategory(workoutName);
    const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];

    // Find "last X days ago" from loaded workout data
    let lastDaysAgo = null;
    if (allWorkouts && allWorkouts.length > 0) {
        for (const w of allWorkouts) {
            if (w.workoutType === workoutName && w.date) {
                const parts = w.date.split('-');
                const wDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = Math.floor((today - wDate) / (1000 * 60 * 60 * 24));
                lastDaysAgo = diff;
                break; // allWorkouts is sorted desc, so first match is most recent
            }
        }
    }

    const lastText = lastDaysAgo !== null
        ? (lastDaysAgo === 0 ? 'Today' : lastDaysAgo === 1 ? 'Yesterday' : `${lastDaysAgo} days ago`)
        : null;

    // Remaining suggested workouts (compact list)
    const remaining = available.slice(1);
    const remainingHtml = remaining.length > 0 ? `
        <div class="hero-remaining-workouts">
            ${remaining.map(w => {
                const name = w.name || w.day;
                const tid = w.id || w.name;
                const def = w.isDefault || false;
                const cat = getWorkoutCategory(name);
                const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other'];
                return `
                    <div class="hero-remaining-item" data-action="startSuggestedWorkout" data-template-id="${escapeAttr(tid)}" data-is-default="${def}">
                        <div class="hero-remaining-bar" style="background: ${color}"></div>
                        <span class="hero-remaining-name">${escapeHtml(name)}</span>
                        <i class="fas fa-play-circle"></i>
                    </div>
                `;
            }).join('')}
        </div>
    ` : '';

    return `
        <div class="hero-workout-card hero-card" data-action="startSuggestedWorkout" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}">
            <div class="hero-workout-header">
                <span class="hero-workout-category" style="color: ${categoryColor}">${escapeHtml(category)}</span>
                ${lastText ? `<span class="hero-workout-last">Last: ${lastText}</span>` : ''}
            </div>
            <h2 class="hero-workout-name">${escapeHtml(workoutName)}</h2>
            <div class="hero-workout-meta">
                <span><i class="fas fa-dumbbell"></i> ${exerciseCount} exercises</span>
                <span><i class="fas fa-clock"></i> ~${estimatedMinutes} min</span>
            </div>
            <button class="btn-hero-start" onclick="event.stopPropagation(); startSuggestedWorkout('${escapeAttr(templateId)}', ${isDefault})">
                <i class="fas fa-play"></i> Start Workout
            </button>
        </div>
        ${remainingHtml}
    `;
}

/**
 * Compact Progress Block — streak + progress bar + week comparison.
 * Replaces the large weekly goal ring.
 */
function renderCompactProgress(weekCount, weeklyGoal, streaks, volumeChangePercent) {
    const progressPercent = weeklyGoal > 0 ? Math.min((weekCount / weeklyGoal) * 100, 100) : 0;
    const isComplete = weekCount >= weeklyGoal;
    const streak = streaks?.currentStreak || 0;

    let changeHtml = '';
    if (volumeChangePercent !== null) {
        const isUp = volumeChangePercent >= 0;
        const changeClass = isUp ? 'up' : 'down';
        changeHtml = `<span class="progress-change ${changeClass}">${isUp ? '+' : ''}${volumeChangePercent}% vol</span>`;
    }

    return `
        <div class="progress-block hero-card hero-card-flat">
            <div class="progress-block-top">
                <span class="progress-streak">${streak > 0 ? `<i class="fas fa-fire"></i> ${streak} day streak` : 'No active streak'}</span>
                ${changeHtml}
            </div>
            <div class="progress-bar-row">
                <div class="progress-bar-track">
                    <div class="progress-bar-fill ${isComplete ? 'complete' : ''}" style="width: ${progressPercent}%"></div>
                </div>
                <span class="progress-bar-label">${weekCount}/${weeklyGoal}</span>
            </div>
        </div>
    `;
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
 * Compact Stats Row — single inline row of key stats.
 */
function renderCompactStats(totalPRs, thisMonthWorkouts, totalWorkouts) {
    return `
        <div class="stats-row-compact">
            <div class="stat-item-compact">
                <span class="stat-value-compact">${totalPRs}</span>
                <span class="stat-label-compact">PRs</span>
            </div>
            <div class="stat-divider-compact"></div>
            <div class="stat-item-compact">
                <span class="stat-value-compact">${thisMonthWorkouts}</span>
                <span class="stat-label-compact">This Month</span>
            </div>
            <div class="stat-divider-compact"></div>
            <div class="stat-item-compact">
                <span class="stat-value-compact">${totalWorkouts}</span>
                <span class="stat-label-compact">Total</span>
            </div>
        </div>
    `;
}

/**
 * Collapsible section wrapper using <details>.
 */
function renderCollapsibleSection(title, contentHtml, defaultOpen = false) {
    if (!contentHtml || contentHtml.trim() === '') return '';
    return `
        <details class="collapsible-section" ${defaultOpen ? 'open' : ''}>
            <summary class="collapsible-header">
                <span>${escapeHtml(title)}</span>
                <i class="fas fa-chevron-down collapsible-chevron"></i>
            </summary>
            <div class="collapsible-body">
                ${contentHtml}
            </div>
        </details>
    `;
}

/**
 * Render compact PR list for collapsible section.
 */
function renderCollapsiblePRList(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';
    return recentPRs.slice(0, 3).map(pr => {
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
    }).join('');
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
// HELPERS
// ===================================================================

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
// EQUIPMENT BADGES ON SUGGESTED WORKOUTS (Phase 16.1)
// ===================================================================

/**
 * Async-detect location and add equipment availability badges to today's suggested workout cards.
 * Non-blocking — cards render immediately, badges appear when GPS resolves.
 */
async function appendEquipmentBadges(container, suggestedWorkouts, wm) {
    try {
        const [savedLocations, savedEquipment] = await Promise.all([
            wm.getUserLocations(),
            wm.getUserEquipment(),
        ]);

        if (!savedLocations.length || !savedEquipment.length) return;

        // Detect current gym
        let locationName = getSessionLocation();
        if (!locationName) {
            const result = await detectLocation(savedLocations);
            if (result.location) {
                locationName = result.location.name;
            }
        }
        if (!locationName) return;

        const locationEquipment = getEquipmentAtLocation(savedEquipment, locationName);
        if (locationEquipment.length === 0) return;

        const availableExercises = getExercisesAtLocation(locationEquipment);
        if (availableExercises.size === 0) return;

        // Check each suggested workout and inject a badge
        for (const workout of suggestedWorkouts) {
            const compatibility = checkTemplateCompatibility(workout, availableExercises);
            const templateId = workout.id || workout.name;

            // Find the card in the DOM by template ID
            const card = container.querySelector(
                `[data-action="startSuggestedWorkout"][data-template-id="${CSS.escape(templateId)}"]`
            );
            if (!card) continue;

            // Find the meta row to append the badge (Phase 2: hero card uses .hero-workout-meta)
            const metaRow = card.querySelector('.hero-workout-meta') || card.querySelector('.suggested-meta-row');
            const compactMeta = card.querySelector('.hero-remaining-name');

            if (compatibility.compatible) {
                if (metaRow) {
                    metaRow.insertAdjacentHTML('beforeend',
                        `<span class="equipment-badge-ok"><i class="fas fa-check-circle"></i> ${escapeHtml(locationName)}</span>`
                    );
                } else if (compactMeta) {
                    compactMeta.insertAdjacentHTML('beforeend',
                        ` · <span class="equipment-badge-ok"><i class="fas fa-check-circle"></i> ${escapeHtml(locationName)}</span>`
                    );
                }
            } else if (compatibility.missing > 0) {
                const msg = `${compatibility.missing} exercise${compatibility.missing !== 1 ? 's' : ''} need other equipment`;
                if (metaRow) {
                    metaRow.insertAdjacentHTML('beforeend',
                        `<span class="equipment-badge-warn"><i class="fas fa-exclamation-triangle"></i> ${msg}</span>`
                    );
                } else if (compactMeta) {
                    compactMeta.insertAdjacentHTML('beforeend',
                        ` · <span class="equipment-badge-warn"><i class="fas fa-exclamation-triangle"></i> ${msg}</span>`
                    );
                }
            }
        }
    } catch (error) {
        // Non-critical — cards work fine without badges
        console.error('❌ Error adding equipment badges:', error);
    }
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
