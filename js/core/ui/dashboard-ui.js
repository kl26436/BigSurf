// Dashboard UI Module — V2 Health-style dashboard with drill-down navigation
// Sections: Greeting → Active Pill → Hero Chips → Insight → For Today → Training → Composition → Recent PRs

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, convertWeight } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString, getDayName } from '../utils/date-helpers.js';
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
        <div class="skeleton skeleton-card dash-skel--hero"></div>
        <div class="skeleton skeleton-card dash-skel--strip"></div>
        <div class="skeleton skeleton-card dash-skel--row"></div>
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
            // Dismiss-by-content-hash so a NEW insight resurfaces even if today's was
            // dismissed (replaces the old "dismissed for the day" logic).
            const dismissedHash = AppState.settings?.insightDismissedHash;
            const insightHash = topInsight ? hashInsight(topInsight) : null;
            const showInsight = topInsight && insightHash !== dismissedHash;

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
            // Withings stores in kg with unit:'kg', manual entries may vary
            const storedUnit = e.unit || 'lbs';
            const dw = displayWeight(e.weight, storedUnit, userUnit);
            return { ...e, displayWeight: dw.value, displayUnit: dw.label };
        });
        const latest = converted[converted.length - 1];
        const first = converted[0];

        // Use last 30 days for delta, not full 90
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];
        const monthEntries = converted.filter(e => e.date >= thirtyDaysStr);
        const monthFirst = monthEntries.length > 0 ? monthEntries[0] : first;
        const delta = latest.displayWeight - monthFirst.displayWeight;

        return { latest, entries: converted, delta, unit: latest.displayUnit || userUnit };
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
    const displayName = AppState.currentUser?.displayName || AppState.currentUser?.email || '';
    const initial = (displayName.trim().charAt(0) || '?').toUpperCase();
    return `
        <div class="dash-greeting">
            <div class="dash-greeting__text">
                <h2>${greeting}</h2>
                <span>${dateStr}</span>
            </div>
            <div class="dash-greeting__avatar" onclick="navigateTo('settings')" aria-label="Open settings">${escapeHtml(initial)}</div>
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
    const deltaDirClass = getBwDeltaDirectionClass(bwDelta);

    return `
        <div class="hero-chip-row">
            <div class="hero-chip hero-chip--streak">
                <div class="hero-chip__icon hero-chip__icon--warm"><i class="fas fa-fire"></i></div>
                <div class="hero-chip__val">${streak}</div>
                <div class="hero-chip__label">Streak</div>
            </div>
            <div class="hero-chip">
                <div class="hero-chip__icon hero-chip__icon--primary"><i class="fas fa-bullseye"></i></div>
                <div class="hero-chip__val">${weekDone}<span class="hero-chip__unit">/${weekGoal}</span></div>
                <div class="hero-chip__label">This week</div>
            </div>
            <div class="hero-chip">
                <div class="hero-chip__icon hero-chip__icon--shoulders"><i class="fas fa-weight"></i></div>
                <div class="hero-chip__val">${bwVal != null ? bwVal : '—'}<span class="hero-chip__unit">${bwVal != null ? ` ${bwUnit}` : ''}</span></div>
                ${bwDelta != null ? `<div class="hero-chip__delta ${deltaDirClass}">${bwDelta < 0 ? '↓' : '↑'} ${Math.abs(bwDelta).toFixed(1)} ${bwUnit}</div>` : '<div class="hero-chip__label">Body weight</div>'}
            </div>
        </div>
    `;
}

// Color a body-weight delta only when the user has told us their goal direction.
// Default (no goal set) is neutral — we never assume lose-is-good / gain-is-bad.
function getBwDeltaDirectionClass(delta) {
    if (delta == null) return '';
    const goal = AppState.settings?.weightGoal;
    if (!goal || goal === 'maintain') return '';
    const losing = delta < 0;
    const gaining = delta > 0;
    if (goal === 'lose' && losing) return 'hero-chip__delta--good';
    if (goal === 'lose' && gaining) return 'hero-chip__delta--bad';
    if (goal === 'gain' && gaining) return 'hero-chip__delta--good';
    if (goal === 'gain' && losing) return 'hero-chip__delta--bad';
    return '';
}

// ===================================================================
// INSIGHT
// ===================================================================

function renderDashboardInsight(insight) {
    if (!insight) return '';
    return `
        <div class="dash-insight">
            <i class="fas ${insight.icon || 'fa-lightbulb'}"></i>
            <div class="dash-insight-text">${escapeHtml(insight.message)}</div>
            <button class="dash-insight__close" onclick="dismissInsight()" aria-label="Dismiss insight">
                <i class="fas fa-times"></i>
            </button>
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
    const dayName = getDayName();
    const dayKey = dayName.toLowerCase();
    const ranked = getTemplatesForDayOfWeek(templates, allWorkouts, dow)
        .map(r => ({
            ...r,
            scheduled: Array.isArray(r.template.suggestedDays) && r.template.suggestedDays.includes(dayKey),
        }))
        .sort((a, b) => {
            if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
            return b.count - a.count;
        });

    const visible = ranked.filter(r => r.count > 0 || r.scheduled).slice(0, 4);
    if (visible.length === 0) return '';

    return `
        <div class="dash-section-head">
            <h3>For ${dayName}</h3>
            <a onclick="openWorkoutSelectorForDay('${escapeAttr(dayName)}')">All →</a>
        </div>
        ${visible.map((r, i) => renderForTodayRow(r, i === 0, dayName)).join('')}
    `;
}

// Navigate to the workout selector, pre-sorted by how often each template is
// used on the chosen day of week. AppState flag is consumed by workout-session.
export function openWorkoutSelectorForDay(dayName) {
    AppState._workoutSelectorDayFilter = dayName;
    window.bottomNavTo?.('workout');
}

function renderForTodayRow({ template, count, scheduled }, isMostUsed, dayName) {
    const category = template.category || getWorkoutCategory(template.name || template.day) || 'other';
    const icon = getCategoryIcon(category);
    const exCount = template.exercises ? template.exercises.length : 0;
    const usageText = count > 0
        ? `${count} ${count === 1 ? 'time' : 'times'} on ${dayName}s`
        : `Scheduled for ${dayName}s`;
    const badge = scheduled
        ? '<span class="dash-template-count">Scheduled</span>'
        : (isMostUsed && count >= 1 ? '<span class="dash-template-count">Most used</span>' : '');

    return `
        <div class="dash-template-row" onclick="startWorkout('${escapeAttr(template.day || template.name || template.id)}')">
            <div class="dash-template-icon cat-bg-${category.toLowerCase()}"><i class="${icon}"></i></div>
            <div class="dash-template-info">
                <div class="dash-template-name">
                    ${escapeHtml(template.name || template.day)}
                    ${badge}
                </div>
                <div class="dash-template-meta">${exCount} exercises · ${usageText}</div>
            </div>
            <button class="dash-template-play" onclick="event.stopPropagation(); startWorkout('${escapeAttr(template.day || template.name || template.id)}')">
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
            <span class="dash-section-head__meta">This week</span>
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
                <i class="fas fa-chevron-right dash-chev"></i>
            </div>
            <div class="bp-card__grid">
                <div class="bp-cell">
                    <div class="bp-cell__label"><i class="fas fa-trophy bp-cell__icon--gold"></i> ${heroShort} Max</div>
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

    const hasDexa = scan && (scan.totalBodyFat != null || scan.muscleMass != null);
    const hasBw = bwData != null;
    if (!hasDexa && !hasBw) return renderConnectPrompt();

    let html = `
        <div class="dash-section-head">
            <h3>Composition</h3>
        </div>
    `;

    // --- Card 1: Body Weight (with Withings badge + sparkline) ---
    if (hasBw) {
        const source = bwData.latest.source === 'withings' ? '<span class="bw-badge">Withings</span>' : '';
        const weightStr = bwData.latest.displayWeight.toFixed(1);
        const deltaStr = bwData.delta != null
            ? `<div class="bw-delta">${bwData.delta < 0 ? '↓' : '↑'} ${Math.abs(bwData.delta).toFixed(1)} ${bwData.unit} · 30 days</div>`
            : '';

        // Build sparkline from entries if available
        let sparkHtml = '';
        if (bwData.entries && bwData.entries.length > 2) {
            const points = bwData.entries.map((e, i) => ({ x: i, y: e.displayWeight }));
            sparkHtml = `<div class="bw-spark">${chartSparkline({ points, color: 'var(--primary)', width: 280, height: 32 })}</div>`;
        }

        html += `
            <div class="bc-card" onclick="showCompositionDetail()">
                <div class="bw-card-head">
                    <i class="fas fa-weight bw-card-head__icon--primary"></i>
                    <span class="bw-card-title">Body Weight</span>
                    ${source}
                    <i class="fas fa-chevron-right dash-chev"></i>
                </div>
                <div class="bw-card-value">${weightStr} <span class="bw-card-unit">${bwData.unit}</span></div>
                ${deltaStr}
                ${sparkHtml}
            </div>
        `;
    }

    // --- Card 2: Body Composition (DEXA donut) ---
    if (hasDexa) {
        const fatPct = Math.round(scan.totalBodyFat || 0);
        const musclePct = scan.muscleMass && scan.totalWeight
            ? Math.round(scan.muscleMass / scan.totalWeight * 100)
            : 0;
        const waterPct = Math.max(0, 100 - fatPct - musclePct);
        const segments = [
            { label: `Muscle ${musclePct}%`, value: musclePct, color: 'var(--cat-legs)' },
            { label: `Fat ${fatPct}%`, value: fatPct, color: 'var(--cat-pull)' },
            { label: `Water ${waterPct}%`, value: waterPct, color: 'var(--primary)' },
        ];

        // Days since DEXA
        let dexaAgo = '';
        if (scan.date) {
            const daysAgo = Math.round((Date.now() - new Date(scan.date).getTime()) / 86400000);
            if (daysAgo <= 1) dexaAgo = 'Today';
            else if (daysAgo < 7) dexaAgo = `${daysAgo} days ago`;
            else dexaAgo = `${Math.round(daysAgo / 7)} weeks ago`;
        }

        // Muscle change from previous scan
        let muscleDelta = '';
        if (scan._prevMuscleMass != null && scan.muscleMass != null) {
            const d = scan.muscleMass - scan._prevMuscleMass;
            muscleDelta = ` · Muscle ${d >= 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)} lb`;
        }

        html += `
            <div class="bc-card bc-card--composition" onclick="showCompositionDetail()">
                <div class="bw-card-head">
                    <span class="bw-card-title">Body Composition</span>
                    <i class="fas fa-chevron-right dash-chev"></i>
                </div>
                <div class="bc-row">
                    ${chartDonut({ segments, size: 60 })}
                    <div class="bc-legend">
                        ${segments.map(s => `<div class="bc-leg"><div class="bc-dot" style="--dot-color:${s.color};"></div>${s.label}</div>`).join('')}
                    </div>
                </div>
                ${dexaAgo ? `<div class="bc-dexa-ago">Last DEXA: ${dexaAgo}${muscleDelta}</div>` : ''}
            </div>
        `;
    }

    return html;
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
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `;
}

// ===================================================================
// RECENT PRs
// ===================================================================

function renderRecentPRs(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';
    return `
        <div class="dash-section-head dash-section-head--tight">
            <h3>Recent PRs</h3>
        </div>
        ${recentPRs.slice(0, 3).map(pr => `
            <div class="pr-row">
                <div class="pr-badge"><i class="fas fa-trophy"></i></div>
                <div class="pr-info">
                    <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                    <div class="pr-meta">${formatRelativeDateDash(pr.date)} · ${pr.reps} reps</div>
                </div>
                <div class="pr-val">${convertWeight(pr.weight, pr.unit || 'lbs', AppState.globalUnit)} ${AppState.globalUnit}</div>
            </div>
        `).join('')}
    `;
}

// ===================================================================
// EXPORTED FUNCTIONS (window-bound in main.js)
// ===================================================================

// Tiny, stable content hash — enough to distinguish insights without a crypto lib.
function hashInsight(insight) {
    const src = `${insight.icon || ''}|${insight.message || ''}`;
    let h = 0;
    for (let i = 0; i < src.length; i++) {
        h = ((h << 5) - h) + src.charCodeAt(i);
        h |= 0;
    }
    return `h${h}`;
}

export function dismissInsight() {
    // Remember *which* insight the user dismissed, not just the day.
    // A new insight with a different hash will resurface automatically.
    const card = document.querySelector('.dash-insight');
    const text = card?.querySelector('.dash-insight-text')?.textContent?.trim() || '';
    const icon = card?.querySelector(':scope > i')?.className?.match(/fa-[\w-]+/)?.[0] || '';
    if (text) updateSetting('insightDismissedHash', hashInsight({ icon, message: text }));
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
