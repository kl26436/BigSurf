// Dashboard UI Module — V2 Health-style dashboard with drill-down navigation
// Sections: Greeting → Active Pill → Hero Chips → Insight → For Today → Training → Composition → Recent PRs

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString } from '../utils/date-helpers.js';
import { Config, getCategoryIcon } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { loadAllWorkouts } from '../data/data-manager.js';
import { getWorkoutCategory } from './template-selection.js';
import { TrainingInsights } from '../features/training-insights.js';
import { showFirstUseTip } from '../features/first-use-tips.js';
import { updateSetting } from './settings-ui.js';

import {
    aggregateBodyPartStats, getTemplatesForDayOfWeek,
    formatVolume, capitalize, BP_TO_CAT,
} from '../features/metrics/aggregators.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';
import { chartDonut } from '../features/charts/chart-donut.js';

// ===================================================================
// CONSTANTS
// ===================================================================

const BODY_PARTS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
const BP_ICONS = {
    chest: 'fa-hand-paper', back: 'fa-fist-raised', legs: 'fa-walking',
    shoulders: 'fa-arrows-alt-v', arms: 'fa-hand-rock', core: 'fa-bullseye',
};
const BP_TINTS = {
    chest: 'ic-chest', back: 'ic-back', legs: 'ic-legs',
    shoulders: 'ic-shoulders', arms: 'ic-arms', core: 'ic-core',
};

function bodyPartColor(bp) {
    const map = { chest: 'var(--cat-push)', back: 'var(--cat-pull)', legs: 'var(--cat-legs)', shoulders: 'var(--cat-shoulders)', arms: 'var(--cat-arms)', core: 'var(--cat-core)' };
    return map[bp] || 'var(--text-muted)';
}

// ===================================================================
// DASHBOARD DISPLAY
// ===================================================================

export async function showDashboard() {
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) {
        console.error('Dashboard section not found');
        return;
    }

    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');
    if (workoutSelector) workoutSelector.classList.add('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');

    dashboardSection.classList.remove('hidden');
    setHeaderMode(true);
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');

    await renderDashboard();
}

// ===================================================================
// MAIN RENDER
// ===================================================================

async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `
        <div class="skeleton skeleton-card" style="height: 140px;"></div>
        <div class="skeleton skeleton-card" style="height: 56px;"></div>
        <div class="skeleton skeleton-card" style="height: 48px;"></div>
    `;

    try {
        const wm = new FirebaseWorkoutManager(AppState);
        const [streaks, weeklyStats, allWorkouts, insightsData] =
            await Promise.all([
                StreakTracker.calculateStreaks(),
                StatsTracker.getWeeklyStats(),
                loadAllWorkouts(AppState),
                TrainingInsights.loadInsightsData().catch(() => ({ recentWorkouts: [], allWorkouts: [] })),
            ]);

        await PRTracker.loadPRData();
        const recentPRs = PRTracker.getRecentPRs(3);

        const weekCount = weeklyStats.uniqueDays || weeklyStats.workouts.length;
        const weeklyGoal = AppState.settings?.weeklyGoal || 5;
        const streakDays = streaks?.currentStreak || 0;

        const resumeBanner = document.getElementById('resume-workout-banner');
        if (resumeBanner) resumeBanner.classList.add('hidden');

        const hasWorkouts = streaks && streaks.totalWorkouts > 0;

        if (!hasWorkouts) {
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
            // Cache full history for drill-down pages
            AppState.workouts = allWorkouts;

            // Load templates for "For Today" section
            try {
                const templates = await wm.getUserWorkoutTemplates();
                AppState.templates = templates || [];
            } catch { AppState.templates = []; }

            // Top insight (uses 8-week data from insightsData, not full history)
            const exerciseDatabase = AppState.exerciseDatabase || [];
            const topInsight = TrainingInsights.getTopInsight(
                insightsData.recentWorkouts, insightsData.allWorkouts, exerciseDatabase
            );
            const insightDismissedDate = AppState.settings?.insightDismissedDate;
            const todayStr = getDateString(new Date());
            const showInsight = topInsight && insightDismissedDate !== todayStr;

            // Body weight data
            const bwData = await loadBodyWeightData();

            // Build V2 layout
            container.innerHTML = `
                ${renderGreetingHeader()}
                ${renderActiveWorkoutPill()}
                ${renderHeroChipRow(streakDays, weekCount, weeklyGoal, bwData)}
                ${showInsight ? renderDashboardInsight(topInsight) : ''}
                ${renderForToday(allWorkouts)}
                ${renderTrainingSection(allWorkouts)}
                ${await renderCompositionCard(bwData)}
                ${renderRecentPRs(recentPRs)}
            `;

            if (AppState.currentWorkout || window.inProgressWorkout) startPillTimer();
        }

        // Conditionally hide "Manage Locations" in More menu
        try {
            const locations = await wm.getUserLocations();
            const locMenuItem = document.getElementById('more-menu-locations');
            if (locMenuItem) {
                locMenuItem.classList.toggle('hidden', !locations || locations.length === 0);
            }
        } catch (e) { /* Non-critical */ }

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
// BODY WEIGHT HELPER
// ===================================================================

async function loadBodyWeightData() {
    try {
        const { loadBodyWeightHistory } = await import('../features/body-measurements.js');
        const { displayWeight } = await import('./ui-helpers.js');
        const entries = await loadBodyWeightHistory(90);
        if (!entries || entries.length === 0) return null;

        const userUnit = AppState.globalUnit || 'lbs';
        const converted = entries.map(e => {
            const dw = displayWeight(e.weight, e.unit || 'lbs', userUnit);
            return { ...e, displayWeight: dw.value, displayUnit: dw.label };
        });
        const latest = converted[converted.length - 1];
        const first = converted[0];
        const delta = latest.displayWeight - first.displayWeight;

        return { latest, delta, unit: latest.displayUnit || userUnit };
    } catch {
        return null;
    }
}

// ===================================================================
// GREETING + ACTIVE PILL
// ===================================================================

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

function renderActiveWorkoutPill() {
    const inProgress = window.inProgressWorkout;
    const hasActiveWorkout = AppState.currentWorkout || inProgress;
    if (!hasActiveWorkout) return '';

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

// ===================================================================
// HERO CHIP ROW — Streak, Week, Body Weight
// ===================================================================

function renderHeroChipRow(streak, weekDone, weekGoal, bwData) {
    const bwVal = bwData ? Math.round(bwData.latest.displayWeight) : null;
    const bwUnit = bwData ? bwData.unit : '';
    const bwDelta = bwData ? bwData.delta : null;

    return `
        <div class="hero-chip-row">
            <div class="hero-chip hero-chip--streak">
                <div class="hero-chip__icon"><i class="fas fa-fire" style="color:var(--highlight-warm);"></i></div>
                <div class="hero-chip__val">${streak}</div>
                <div class="hero-chip__label">Streak</div>
            </div>
            <div class="hero-chip">
                <div class="hero-chip__icon"><i class="fas fa-bullseye" style="color:var(--primary);"></i></div>
                <div class="hero-chip__val">${weekDone}<span class="hero-chip__unit">/${weekGoal}</span></div>
                <div class="hero-chip__label">This week</div>
            </div>
            <div class="hero-chip">
                <div class="hero-chip__icon"><i class="fas fa-weight" style="color:var(--cat-shoulders);"></i></div>
                <div class="hero-chip__val">${bwVal != null ? bwVal : '—'}<span class="hero-chip__unit">${bwVal != null ? ` ${bwUnit}` : ''}</span></div>
                ${bwDelta != null ? `<div class="hero-chip__delta ${bwDelta < 0 ? 'up' : 'down'}">${bwDelta < 0 ? '↓' : '↑'} ${Math.abs(bwDelta).toFixed(1)} ${bwUnit}</div>` : '<div class="hero-chip__label">Body weight</div>'}
            </div>
        </div>
    `;
}

// ===================================================================
// INSIGHT
// ===================================================================

function renderDashboardInsight(insight) {
    if (!insight) return '';
    return `
        <div class="dash-insight" onclick="dismissInsight()">
            <i class="fas ${insight.icon || 'fa-lightbulb'}"></i>
            <div class="dash-insight-text">${escapeHtml(insight.message)}</div>
        </div>
    `;
}

// ===================================================================
// FOR TODAY
// ===================================================================

function renderForToday(allWorkouts) {
    const templates = AppState.templates || [];
    if (templates.length === 0) return '';

    const dow = new Date().getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
    const ranked = getTemplatesForDayOfWeek(templates, allWorkouts, dow).slice(0, 4);
    if (ranked.length === 0 || ranked[0].count === 0) return '';

    return `
        <div class="dash-section-head">
            <h3>For ${dayName}</h3>
            <a onclick="bottomNavTo('workout')">All →</a>
        </div>
        ${ranked.filter(r => r.count > 0).map((r, i) => renderForTodayRow(r, i === 0, dayName)).join('')}
    `;
}

function renderForTodayRow({ template, count }, isMostUsed, dayName) {
    const category = template.category || getWorkoutCategory(template.name || template.day) || 'other';
    const icon = getCategoryIcon(category);
    const exCount = template.exercises ? template.exercises.length : 0;

    return `
        <div class="rw-row" onclick="startWorkout('${escapeAttr(template.id || template.name)}')">
            <div class="rw-icon cat-bg-${category.toLowerCase()}"><i class="${icon}"></i></div>
            <div class="rw-info">
                <div class="rw-name">
                    ${escapeHtml(template.name || template.day)}
                    ${isMostUsed && count > 3 ? '<span class="rw-count">Most used</span>' : ''}
                </div>
                <div class="rw-meta">${exCount} exercises · ${count} ${count === 1 ? 'time' : 'times'} on ${dayName}s</div>
            </div>
            <button class="rw-play" onclick="event.stopPropagation(); startWorkout('${escapeAttr(template.id || template.name)}')">
                <i class="fas fa-play"></i>
            </button>
        </div>
    `;
}

// ===================================================================
// TRAINING SECTION — 6 muscle group cards
// ===================================================================

function renderTrainingSection(allWorkouts) {
    const stats = BODY_PARTS.map(bp => aggregateBodyPartStats(allWorkouts, bp, 'W'));
    // Sort: recently trained first, stale at bottom
    stats.sort((a, b) => {
        if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
        return (a.lastTrained?.daysAgo || 999) - (b.lastTrained?.daysAgo || 999);
    });

    return `
        <div class="dash-section-head">
            <h3>Training</h3>
            <span style="font-size:var(--font-xs);color:var(--text-muted);">This week</span>
        </div>
        ${stats.map(renderBodyPartCard).join('')}
    `;
}

function renderBodyPartCard(s) {
    const hv = s.heaviest;
    const heroShort = s.heroLift ? s.heroLift.split(' ')[0] : '';
    const sparkColor = bodyPartColor(s.bodyPart);

    return `
        <div class="bp-card ${s.isStale ? 'stale' : ''}" onclick="showMuscleGroupDetail('${s.bodyPart}')">
            <div class="bp-card__head">
                <div class="bp-card__label">
                    <div class="bp-card__icon ${BP_TINTS[s.bodyPart]}"><i class="fas ${BP_ICONS[s.bodyPart]}"></i></div>
                    ${capitalize(s.bodyPart)}
                </div>
                <i class="fas fa-chevron-right bp-card__chev"></i>
            </div>
            <div class="bp-card__grid">
                <div class="bp-cell">
                    <div class="bp-cell__label"><i class="fas fa-trophy" style="color:var(--badge-gold);"></i> ${heroShort} Max</div>
                    <div class="bp-cell__val">${hv ? `${hv.weight}<span class="bp-cell__unit">×${hv.reps}</span>` : '—'}</div>
                </div>
                <div class="bp-cell">
                    <div class="bp-cell__label">Volume · wk</div>
                    <div class="bp-cell__val">${formatVolume(s.volume)}<span class="bp-cell__unit"> lb</span></div>
                    ${s.volumeDeltaPct != null ? `<div class="bp-cell__sub ${s.volumeDeltaPct < 0 ? 'down' : ''}">${s.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(s.volumeDeltaPct).toFixed(0)}%</div>` : ''}
                </div>
            </div>
            ${s.isStale
                ? `<div class="stale-warn">⚠ Last trained ${s.lastTrained?.daysAgo || '—'} days ago</div>`
                : `<div class="bp-spark">${chartSparkline({ points: s.volumeTrend, color: sparkColor, width: 280, height: 24 })}</div>`
            }
        </div>
    `;
}

// ===================================================================
// COMPOSITION CARD
// ===================================================================

async function renderCompositionCard(bwData) {
    let scan = null;
    try {
        const { getLatestDexaScan } = await import('../features/dexa-scan.js');
        scan = await getLatestDexaScan();
    } catch { /* no dexa */ }

    // DEXA fields are at top level: scan.totalBodyFat, scan.totalWeight, scan.muscleMass, etc.
    const hasDexa = scan && (scan.totalBodyFat != null || scan.muscleMass != null);
    const hasBw = bwData != null;
    if (!hasDexa && !hasBw) return renderConnectPrompt();

    let segments = [];
    if (hasDexa) {
        const fatPct = scan.totalBodyFat || 0;
        const musclePct = scan.muscleMass && scan.totalWeight
            ? Math.round(scan.muscleMass / scan.totalWeight * 100)
            : 0;
        const waterPct = Math.max(0, 100 - fatPct - musclePct);
        if (fatPct > 0 || musclePct > 0) {
            segments = [
                { label: `Muscle ${musclePct}%`, value: musclePct, color: 'var(--cat-legs)' },
                { label: `Fat ${fatPct}%`, value: fatPct, color: 'var(--cat-pull)' },
                { label: `Water ${waterPct}%`, value: waterPct, color: 'var(--cat-shoulders)' },
            ];
        }
    }

    return `
        <div class="dash-section-head">
            <h3>Composition</h3>
            <a onclick="showCompositionDetail()">Details →</a>
        </div>
        <div class="bc-card" onclick="showCompositionDetail()"
            <div class="bc-row">
                ${segments.length ? chartDonut({ segments, size: 60 }) : '<div class="bc-donut-empty"></div>'}
                <div class="bc-legend">
                    ${segments.length
                        ? segments.map(s => `<div class="bc-leg"><div class="bc-dot" style="background:${s.color};"></div>${s.label}</div>`).join('')
                        : '<div class="bc-leg">No DEXA data yet</div>'}
                </div>
                <i class="fas fa-chevron-right bp-card__chev"></i>
            </div>
            ${hasBw ? `
                <div class="bc-weight">
                    <span>Body weight</span>
                    <span><strong>${bwData.latest.displayWeight.toFixed(1)} ${bwData.unit}</strong>${bwData.delta != null ? ` · ${bwData.delta < 0 ? '↓' : '↑'} ${Math.abs(bwData.delta).toFixed(1)} ${bwData.unit} this month` : ''}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function renderConnectPrompt() {
    return `
        <div class="dash-section-head">
            <h3>Composition</h3>
        </div>
        <div class="connect-card" onclick="showCompositionDetail()">
            <i class="fas fa-circle-nodes"></i>
            <div class="connect-card__info">
                <div class="connect-card__title">Track Body Composition</div>
                <div class="connect-card__sub">Upload a DEXA scan or log body weight</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text-muted);"></i>
        </div>
    `;
}

// ===================================================================
// RECENT PRs
// ===================================================================

function renderRecentPRs(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';
    return `
        <div class="dash-section-head" style="margin-top:4px;">
            <h3>Recent PRs</h3>
        </div>
        ${recentPRs.slice(0, 3).map(pr => `
            <div class="pr-row">
                <div class="pr-badge"><i class="fas fa-trophy"></i></div>
                <div class="pr-info">
                    <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                    <div class="pr-meta">${formatRelativeDateDash(pr.date)} · ${pr.reps} reps</div>
                </div>
                <div class="pr-val">${pr.weight} lb</div>
            </div>
        `).join('')}
    `;
}

// ===================================================================
// EXPORTED FUNCTIONS (window-bound in main.js)
// ===================================================================

export function dismissInsight() {
    const todayStr = getDateString(new Date());
    updateSetting('insightDismissedDate', todayStr);
    const card = document.querySelector('.dash-insight');
    if (card) card.remove();
}

export function resumeActiveWorkout() {
    stopPillTimer();
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

export async function startWorkoutFromHistory(workoutId) {
    try {
        const { getDoc, doc, db } = await import('../data/firebase-config.js');
        const workoutRef = doc(db, 'users', AppState.currentUser.uid, 'workouts', workoutId);
        const snap = await getDoc(workoutRef);
        if (!snap.exists()) {
            showNotification('Workout not found', 'warning');
            return;
        }
        const workout = snap.data();
        const workoutType = workout.workoutType;

        const wm = new FirebaseWorkoutManager(AppState);
        const templates = await wm.getUserWorkoutTemplates();
        const match = templates.find(t => (t.name || t.day) === workoutType);

        if (match) {
            const { selectTemplate } = await import('./template-selection.js');
            await selectTemplate(match.id || match.name, match.isDefault || false);
        } else {
            const { startWorkoutFromExercises } = await import('../workout/workout-core.js');
            if (typeof startWorkoutFromExercises === 'function') {
                await startWorkoutFromExercises(workoutType, workout.exercises);
            } else {
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

// ===================================================================
// HELPERS
// ===================================================================

function formatRelativeDateDash(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
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
