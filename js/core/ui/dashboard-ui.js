// Dashboard UI Module — V2 Health-style dashboard with drill-down navigation
// Sections: Greeting → Active Pill → Hero Chips → Insight → For Today → Training → Composition → Recent PRs

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, convertWeight } from './ui-helpers.js';
import { confirmSheet } from './confirm-sheet.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString, getDayName, formatRelativeDate } from '../utils/date-helpers.js';
import { Config, getCategoryIcon, debugLog } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { loadAllWorkouts } from '../data/data-manager.js';
import { getWorkoutCategory } from './template-selection.js';
import { TrainingInsights } from '../features/training-insights.js';
import { showFirstUseTip } from '../features/first-use-tips.js';
import { updateSetting } from './settings-ui.js';

import {
    aggregateBodyPartStats, getTemplatesForDayOfWeek, aggregateExerciseStats,
    findPRProximity, formatVolume, capitalize,
} from '../features/metrics/aggregators.js';
import { analyzeWeeklyVolume } from '../features/training-insights.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';
import { chartDonut } from '../features/charts/chart-donut.js';
import { chartLine } from '../features/charts/chart-line.js';

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
        // Pace vs last week: unique training days last week THROUGH the same
        // weekday, so a mid-week comparison is apples-to-apples (not partial
        // week vs full week). Computed from the already-loaded workouts — no
        // extra query, no cross-module export (prod pins JS for a year).
        const weekPace = computeWeekPace(allWorkouts);
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
                    <div class="empty-state-title">Start your first workout</div>
                    <div class="empty-state-description">Log a session and Big Surf takes it from there — pre-filling last time's numbers, flagging when you beat them, and coaching your next lift. Tap the dumbbell button below to begin.</div>
                    <ul class="empty-state-points">
                        <li><i class="fas fa-bolt"></i> Smart overload nudges at the rack</li>
                        <li><i class="fas fa-arrow-trend-up"></i> Beat-last-time signals every set</li>
                        <li><i class="fas fa-trophy"></i> PRs and streaks as you go</li>
                    </ul>
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

            // De-dup: today's PRs surface in the banner, so exclude them from
            // the Recent PRs list below to avoid the same win twice on screen.
            const todayStr = AppState.getTodayDateString();
            const todaysPRKeys = new Set(
                recentPRs.filter(pr => pr.date === todayStr).map(prKey)
            );

            // Build V2 layout — lead with "what am I doing today?" (UX-2 /
            // dashboard-v3): For Today first, then a last-session closer, then
            // the demoted stat chips, composition, PRs, and a Progress link
            // (the 6 body-part cards moved to the Progress page).
            container.innerHTML = `
                ${renderGreetingHeader()}
                ${renderActiveWorkoutPill()}
                ${renderForToday(allWorkouts)}
                ${renderLastSessionLine(allWorkouts)}
                ${renderTodayPRBanner(recentPRs)}
                ${renderHeroChipRow(streakDays, weekCount, weeklyGoal, bwData, weekPace, detectDeloadWeek(allWorkouts))}
                ${showInsight ? renderDashboardInsight(topInsight) : ''}
                ${await renderCompositionCard(bwData)}
                ${renderRecentPRs(recentPRs, todaysPRKeys)}
                ${renderProgressLinkRow(allWorkouts, topInsight, showInsight)}
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
        } catch { /* Non-critical */ }

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
        const thirtyDaysStr = getDateString(thirtyDaysAgo);
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
    }, 1000);
}
function stopPillTimer() {
    if (pillTimerInterval) { clearInterval(pillTimerInterval); pillTimerInterval = null; }
}

// ===================================================================
// HERO CHIP ROW — Streak, Week, Body Weight
// ===================================================================

// "This week vs last week" pace, comparing like spans: the current partial week
// against last week THROUGH the same weekday. Returns both a training-day count
// and total volume for each span so the hero chip can show either — sessions
// answers "am I hitting my goal?", volume answers "am I actually doing more?".
// Reads the already-loaded workouts array — no Firestore round-trip.
function computeWeekPace(allWorkouts) {
    const empty = { lastWeekDays: 0, thisWeekVol: 0, lastWeekVol: 0 };
    if (!Array.isArray(allWorkouts)) return empty;
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - dayOfWeek);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
    const lastCutoff = new Date(startOfLastWeek);
    lastCutoff.setDate(startOfLastWeek.getDate() + dayOfWeek); // same weekday, last week

    const thisStart = getDateString(startOfThisWeek);
    const todayStr = getDateString(today);
    const lastStart = getDateString(startOfLastWeek);
    const lastEnd = getDateString(lastCutoff);

    let thisWeekVol = 0;
    let lastWeekVol = 0;
    const lastDays = new Set();
    for (const w of allWorkouts) {
        if (!w || !w.date || !w.completedAt || w.cancelledAt) continue;
        const inThis = w.date >= thisStart && w.date <= todayStr;
        const inLast = w.date >= lastStart && w.date <= lastEnd;
        if (!inThis && !inLast) continue;
        if (inLast) lastDays.add(w.date);
        let vol = 0;
        if (w.exercises) {
            Object.values(w.exercises).forEach(ex => (ex.sets || []).forEach(s => {
                if (s.reps && s.weight) vol += s.reps * s.weight;
            }));
        }
        if (inThis) thisWeekVol += vol;
        if (inLast) lastWeekVol += vol;
    }
    return { lastWeekDays: lastDays.size, thisWeekVol, lastWeekVol };
}

// Flip the "This week" chip between session-pace and volume-pace (persisted).
export function toggleWeekPaceMode() {
    const next = AppState.settings?.weekPaceMode === 'volume' ? 'sessions' : 'volume';
    if (!AppState.settings) AppState.settings = {};
    AppState.settings.weekPaceMode = next;
    updateSetting('weekPaceMode', next);
    showDashboard();
}

// Conservative, honest deload detection using rolling 7-day windows from today
// (contiguous by construction — no ISO-week gap/boundary bugs). A "deload week"
// is: you trained 1..HARD-1 days in the last 7, but each of the prior
// DELOAD_CONSECUTIVE_WEEKS windows was hard (>=HARD days). We deliberately do NOT
// treat a zero-workout week as a deload — that's indistinguishable from a lapse,
// and labeling it "Deload week" would be a lie. (A future explicit "mark this
// week as a deload" control could complement this for the ambiguous cases.)
function detectDeloadWeek(allWorkouts) {
    if (!allWorkouts || allWorkouts.length === 0) return false;
    const HARD = Config.DELOAD_DAYS_PER_WEEK || 5;
    const NEEDED = Config.DELOAD_CONSECUTIVE_WEEKS || 3;
    const today = new Date(getDateString());

    const uniqueDaysInWindow = (startDaysAgo, endDaysAgo) => {
        const set = new Set();
        for (const w of allWorkouts) {
            if (!w.date || !w.completedAt) continue;
            const diff = Math.round((today - new Date(w.date)) / 86400000);
            if (diff >= startDaysAgo && diff <= endDaysAgo) set.add(w.date);
        }
        return set.size;
    };

    const current = uniqueDaysInWindow(0, 6);
    if (current < 1 || current >= HARD) return false;

    let hardWeeks = 0;
    for (let wk = 1; wk <= 8; wk++) {
        if (uniqueDaysInWindow(wk * 7, wk * 7 + 6) >= HARD) hardWeeks++;
        else break;
    }
    return hardWeeks >= NEEDED;
}

function renderHeroChipRow(streak, weekDone, weekGoal, bwData, weekPace = {}, isDeload = false) {
    const bwVal = bwData ? Math.round(bwData.latest.displayWeight) : null;
    const bwUnit = bwData ? bwData.unit : '';
    const bwDelta = bwData ? bwData.delta : null;
    const deltaDirClass = getBwDeltaDirectionClass(bwDelta);

    // Pace vs last week — session count OR total volume, tappable to switch.
    // Only surfaced once there's a prior week to compare against, so a brand-new
    // user isn't shown "+N vs nothing".
    const paceMode = AppState.settings?.weekPaceMode === 'volume' ? 'volume' : 'sessions';
    let weekPaceHtml = '';
    if (paceMode === 'volume') {
        const { thisWeekVol = 0, lastWeekVol = 0 } = weekPace;
        if (lastWeekVol > 0) {
            const pct = Math.round(((thisWeekVol - lastWeekVol) / lastWeekVol) * 100);
            if (pct !== 0) {
                weekPaceHtml = ` · <span class="hero-chip__wowd hero-chip__wowd--${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '↑' : '↓'}${Math.abs(pct)}%</span>`;
            }
        }
    } else {
        const lastDays = weekPace.lastWeekDays || 0;
        const weekDelta = lastDays > 0 ? weekDone - lastDays : null;
        weekPaceHtml = weekDelta
            ? ` · <span class="hero-chip__wowd hero-chip__wowd--${weekDelta > 0 ? 'up' : 'down'}">${weekDelta > 0 ? '↑' : '↓'}${Math.abs(weekDelta)}</span>`
            : '';
    }
    const paceLabel = paceMode === 'volume' ? 'Tap to compare by workouts' : 'Tap to compare by volume';

    return `
        <div class="hero-chip-row">
            <div class="hero-chip hero-chip--streak">
                <div class="hero-chip__icon hero-chip__icon--warm"><i class="fas ${isDeload ? 'fa-battery-half' : 'fa-fire'}"></i></div>
                <div class="hero-chip__val">${streak}</div>
                <div class="hero-chip__label">${isDeload ? 'Deload week' : 'Streak'}</div>
            </div>
            <div class="hero-chip hero-chip--tap" onclick="toggleWeekPaceMode()" role="button" tabindex="0" title="${paceLabel}" aria-label="This week, ${weekDone} of ${weekGoal}. ${paceLabel}">
                <div class="hero-chip__icon hero-chip__icon--primary"><i class="fas fa-bullseye"></i></div>
                <div class="hero-chip__val">${weekDone}<span class="hero-chip__unit">/${weekGoal}</span></div>
                <div class="hero-chip__label">This week${weekPaceHtml}</div>
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

    // Most-recent completed session per workout type — lets each row show
    // "Last done 4d ago · ~52 min" so the user can tell if they're on schedule.
    // allWorkouts is date-desc, so the first match per type is the latest.
    const lastDoneByType = {};
    for (const w of allWorkouts) {
        const type = w.workoutType;
        if (!type || lastDoneByType[type]) continue;
        if (!w.completedAt) continue;
        lastDoneByType[type] = { date: w.date, duration: w.totalDuration || 0 };
    }

    // The top pick renders as a hero with a one-tap start and a PR-proximity
    // hook (UX-2). The rest render as compact rows.
    const [hero, ...rest] = visible;
    const proximity = findPRProximity(
        buildProximityCandidates(hero.template, allWorkouts)
    );

    return `
        <div class="dash-section-head">
            <h3>For ${dayName}</h3>
            <a onclick="openWorkoutSelectorForDay('${escapeAttr(dayName)}')">All →</a>
        </div>
        ${renderForTodayHero(hero, dayName, lastDoneByType, proximity)}
        ${rest.map(r => renderForTodayRow(r, false, dayName, lastDoneByType)).join('')}
    `;
}

/**
 * Build PR-proximity candidates for a template's exercises (UX-2). Uses the
 * unit-safe aggregateExerciseStats for recent bests and PRTracker for the
 * per-exercise PR (max across equipment), both normalized to the display
 * unit. Returns the array findPRProximity consumes.
 */
function buildProximityCandidates(template, allWorkouts) {
    const unit = AppState.globalUnit || 'lbs';
    const exercises = Array.isArray(template.exercises)
        ? template.exercises
        : Object.values(template.exercises || {});
    if (exercises.length === 0) return [];

    // Best PR weight per exercise (across equipment), in the display unit.
    const prByExercise = new Map();
    for (const pr of PRTracker.getRecentPRs(200)) {
        const w = convertWeight(pr.weight, pr.unit || 'lbs', unit);
        const cur = prByExercise.get(pr.exercise);
        if (!cur || w > cur.prWeight) {
            prByExercise.set(pr.exercise, { prWeight: w, equipment: pr.equipment });
        }
    }

    const candidates = [];
    for (const ex of exercises) {
        const name = ex.name || ex.machine;
        if (!name) continue;
        const pr = prByExercise.get(name);
        if (!pr) continue;
        // Recent best over the exercise's last 2 sessions (sessions are
        // date-desc since allWorkouts is), already in the display unit.
        const s = aggregateExerciseStats(allWorkouts, name, 'M');
        if (!s.sessions.length) continue;
        const recentBest = Math.max(
            ...s.sessions.slice(0, 2).flatMap(sess => sess.sets.map(x => x.weight))
        );
        candidates.push({ exercise: name, equipment: pr.equipment, unit, prWeight: pr.prWeight, recentBest });
    }
    return candidates;
}

function renderForTodayHero({ template, count, scheduled }, dayName, lastDoneByType, proximity) {
    const category = template.category || getWorkoutCategory(template.name || template.day) || 'other';
    const icon = getCategoryIcon(category);
    const exCount = template.exercises ? template.exercises.length : 0;
    const startArg = escapeAttr(template.day || template.name || template.id);

    const usageText = scheduled ? `Usually ${dayName}` : (count > 0 ? `${count}× on ${dayName}s` : '');
    const lastDoneText = formatLastDoneMeta(lastDoneByType[template.name || template.day]);
    const meta = [usageText, lastDoneText].filter(Boolean).join(' · ');

    // PR-proximity hook — forward-looking "you're close, go for it".
    let prHook = '';
    if (proximity) {
        const gap = Math.round(proximity.gap * 10) / 10;
        const equip = proximity.equipment && proximity.equipment !== 'Unknown Equipment'
            ? ` (${escapeHtml(proximity.equipment)})` : '';
        prHook = `
            <div class="dash-today-hero__pr">
                <i class="fas fa-trophy"></i>
                <div class="dash-today-hero__pr-txt"><b>${gap} ${proximity.unit} off your ${escapeHtml(proximity.exercise)} PR</b>${equip} — today's the day</div>
            </div>
        `;
    }

    return `
        <div class="dash-today-hero cat-border-${category.toLowerCase()}" onclick="startWorkout('${startArg}')">
            <div class="dash-today-hero__top">
                <div class="dash-today-hero__icon cat-bg-${category.toLowerCase()}"><i class="${icon}"></i></div>
                <div class="dash-today-hero__info">
                    <div class="dash-today-hero__name">${escapeHtml(template.name || template.day)}</div>
                    ${meta ? `<div class="dash-today-hero__meta">${meta} · ${exCount} exercises</div>` : `<div class="dash-today-hero__meta">${exCount} exercises</div>`}
                </div>
                <button class="dash-today-hero__start" onclick="event.stopPropagation(); startWorkout('${startArg}')" aria-label="Start ${escapeAttr(template.name || template.day)}">
                    <i class="fas fa-play"></i>
                </button>
            </div>
            ${prHook}
        </div>
    `;
}

// "Last done 4d ago · ~52 min" from a {date, duration} record, or '' if never.
function formatLastDoneMeta(rec) {
    if (!rec || !rec.date) return '';
    const today = new Date(getDateString());
    const then = new Date(rec.date);
    const days = Math.round((today - then) / 86400000);
    // An unparseable stored date makes `days` NaN, which rendered a literal
    // "Last done NaNd ago". Bail (and surface the bad doc under ?debug).
    if (!Number.isFinite(days)) {
        debugLog('formatLastDoneMeta: unparseable rec.date →', rec.date);
        return '';
    }
    const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
    const mins = Math.round((rec.duration || 0) / 60);
    const durPart = mins > 0 ? ` · ~${mins} min` : '';
    return `Last done ${when}${durPart}`;
}

// Navigate to the workout selector, pre-sorted by how often each template is
// used on the chosen day of week. AppState flag is consumed by workout-session.
export function openWorkoutSelectorForDay(dayName) {
    AppState._workoutSelectorDayFilter = dayName;
    window.bottomNavTo?.('workout');
}

/**
 * Last-session one-liner (UX-2): a closing "here's what you did last time" cue
 * under For Today. Built from the already-loaded workouts — no extra query.
 * Tapping opens that workout in history.
 */
function renderLastSessionLine(allWorkouts) {
    const last = (allWorkouts || []).find(w => w.completedAt && !w.cancelledAt);
    if (!last) return '';

    const when = formatRelativeDate(last.date, { daysAgo: true, weeksAgo: true });
    const mins = Math.round((last.totalDuration || 0) / 60);
    let volume = 0;
    for (const ex of Object.values(last.exercises || {})) {
        for (const s of ex.sets || []) {
            if (s.reps && s.weight) volume += s.reps * s.weight;
        }
    }
    const unit = AppState.globalUnit || 'lbs';
    const parts = [
        `<b>${escapeHtml(last.workoutType || 'Workout')}</b>`,
        when,
        mins > 0 ? `${mins} min` : null,
        volume > 0 ? `${formatVolume(volume)} ${unit} volume` : null,
    ].filter(Boolean).join(' · ');

    return `
        <div class="dash-last-session" onclick="viewWorkout('${escapeAttr(last.id)}')">
            <div class="dash-last-session__check"><i class="fas fa-check"></i></div>
            <div class="dash-last-session__txt">${parts}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `;
}

/**
 * Progress link row (UX-2): replaces the 6 body-part cards on the dashboard
 * with one row carrying the single most actionable headline — the lowest
 * body-part volume vs its weekly target (from analyzeWeeklyVolume), else the
 * top training insight. The cards themselves live on the Progress page now.
 */
function renderProgressLinkRow(allWorkouts, topInsight, showInsight = false) {
    let headline = 'Volume balance, trends, and all your PRs';
    try {
        const weekStart = new Date(getDateString());
        weekStart.setDate(weekStart.getDate() - 7);
        const weekStartStr = getDateString(weekStart);
        const weekWorkouts = (allWorkouts || []).filter(w => w.date >= weekStartStr && w.completedAt);
        const vol = analyzeWeeklyVolume(weekWorkouts, AppState.exerciseDatabase || []);
        const low = vol.filter(v => v.status === 'low').sort((a, b) => a.weeklySets - b.weeklySets)[0];
        if (low) {
            headline = `${capitalize(low.bodyPart)} is low this week — ${low.weeklySets} set${low.weeklySets === 1 ? '' : 's'}`;
        } else if (!showInsight && topInsight?.message) {
            // Only borrow the insight message when the insight card above isn't
            // already showing it — otherwise the same line renders twice.
            headline = topInsight.message;
        }
    } catch { /* fall back to the generic headline */ }

    return `
        <div class="dash-progress-link" onclick="showProgressPage()">
            <div class="dash-progress-link__icon"><i class="fas fa-chart-line"></i></div>
            <div class="dash-progress-link__txt">
                <div class="dash-progress-link__title">Progress</div>
                <div class="dash-progress-link__sub">${escapeHtml(headline)}</div>
            </div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `;
}

function renderForTodayRow({ template, count, scheduled }, isMostUsed, dayName, lastDoneByType = {}) {
    const category = template.category || getWorkoutCategory(template.name || template.day) || 'other';
    const icon = getCategoryIcon(category);
    const exCount = template.exercises ? template.exercises.length : 0;
    const usageText = count > 0
        ? `${count} ${count === 1 ? 'time' : 'times'} on ${dayName}s`
        : `Scheduled for ${dayName}s`;
    const badge = scheduled
        ? '<span class="dash-template-count">Scheduled</span>'
        : (isMostUsed && count >= 1 ? '<span class="dash-template-count">Most used</span>' : '');

    // Second meta line: how long since this workout was last done (and roughly
    // how long it took) — the "am I on schedule?" signal that usage-count alone
    // doesn't give. Omitted entirely if it's never been completed.
    const lastDoneText = formatLastDoneMeta(lastDoneByType[template.name || template.day]);
    const lastDoneHtml = lastDoneText
        ? `<div class="dash-template-meta dash-template-meta--sub">${lastDoneText}</div>`
        : '';

    return `
        <div class="dash-template-row" onclick="startWorkout('${escapeAttr(template.day || template.name || template.id)}')">
            <div class="dash-template-icon cat-bg-${category.toLowerCase()}"><i class="${icon}"></i></div>
            <div class="dash-template-info">
                <div class="dash-template-name">
                    ${escapeHtml(template.name || template.day)}
                    ${badge}
                </div>
                <div class="dash-template-meta">${exCount} exercises · ${usageText}</div>
                ${lastDoneHtml}
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

// (renderTrainingSection removed in UX-2 — the 6 body-part cards live on the
// Progress page now; the dashboard links out via renderProgressLinkRow.)

function renderBodyPartCard(s, volumeByPart) {
    const hv = s.heaviest;
    const heroShort = s.heroLift ? s.heroLift.split(' ')[0] : '';
    const sparkColor = bodyPartColor(s.bodyPart);
    const unit = AppState.globalUnit || 'lbs';
    // Peak-weight delta vs last period — the number a lifter actually chases.
    // Only render when there's a real change (0 is noise).
    const pd = s.heaviestDeltaWeight;
    const peakDeltaHtml = (pd != null && pd !== 0)
        ? `<div class="bp-cell__sub ${pd < 0 ? 'down' : ''}">${pd > 0 ? '↑' : '↓'} ${Math.abs(pd)} ${unit}</div>`
        : '';

    // Sets/week vs MEV/MRV target (UX-2) — answers "should I care?" directly.
    // Fed from analyzeWeeklyVolume; absent bodyparts read 0 sets (Low).
    const chipHtml = renderVolumeChip(volumeByPart, s.bodyPart);

    return `
        <div class="bp-card ${s.isStale ? 'stale' : ''}" onclick="showMuscleGroupDetail('${s.bodyPart}')">
            <div class="bp-card__head">
                <div class="bp-card__label">
                    <div class="bp-card__icon ${BP_TINTS[s.bodyPart]}"><i class="fas ${BP_ICONS[s.bodyPart]}"></i></div>
                    ${capitalize(s.bodyPart)}
                    ${chipHtml}
                </div>
                <i class="fas fa-chevron-right dash-chev"></i>
            </div>
            <div class="bp-card__grid">
                <div class="bp-cell">
                    <div class="bp-cell__label"><i class="fas fa-trophy bp-cell__icon--gold"></i> ${heroShort} Max</div>
                    <div class="bp-cell__val">${hv ? `${hv.reps}<span class="bp-cell__unit">×${hv.weight}</span>` : '—'}</div>
                    ${peakDeltaHtml}
                </div>
                <div class="bp-cell">
                    <div class="bp-cell__label">Volume · wk</div>
                    <div class="bp-cell__val">${formatVolume(s.volume)}<span class="bp-cell__unit"> ${unit}</span></div>
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

/**
 * Sets/week volume chip for a body-part card (UX-2): Low / On target / High
 * vs the MEV/MRV band (Config.VOLUME_MEV..MRV). `volumeByPart` is a Map of
 * lowercase body part → weekly working sets. Renders nothing without the map.
 */
function renderVolumeChip(volumeByPart, bodyPart) {
    if (!volumeByPart) return '';
    const sets = volumeByPart.get(bodyPart) || 0;
    if (sets < Config.VOLUME_MEV) {
        return `<span class="vol-chip vol-chip--low">Low · ${sets} set${sets === 1 ? '' : 's'}</span>`;
    }
    if (sets > Config.VOLUME_MRV) {
        return `<span class="vol-chip vol-chip--high">High · ${sets} sets</span>`;
    }
    return `<span class="vol-chip vol-chip--good">On target</span>`;
}

/** Weekly working sets per lowercase body part, over the last 7 days (UX-2). */
function weeklyVolumeByBodyPart(allWorkouts) {
    // `new Date(getDateString())` with no arg returns Invalid Date — getDateString('')
    // yields '' → `new Date('')` is invalid → setDate on it stays invalid → the
    // second getDateString call blew up on toISOString(). That crashed the whole
    // Progress page render (7/3 unhandledrejection cluster). Use a valid Date
    // directly and only stringify at the end.
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = getDateString(weekStart);
    const weekWorkouts = (allWorkouts || []).filter(w => w.date >= weekStartStr && w.completedAt);
    const analysis = analyzeWeeklyVolume(weekWorkouts, AppState.exerciseDatabase || []);
    const map = new Map();
    for (const v of analysis) map.set((v.bodyPart || '').toLowerCase(), v.weeklySets);
    return map;
}

// ===================================================================
// COMPOSITION CARD
// ===================================================================

async function renderCompositionCard(bwData) {
    let scan = null;
    let prevScan = null;
    try {
        const { getLatestDexaScan, loadDexaHistory } = await import('../features/dexa-scan.js');
        scan = await getLatestDexaScan();
        // Pull previous scan too for the muscle-delta line. loadDexaHistory
        // returns descending by date; index 1 is the second-most-recent.
        if (scan) {
            const history = await loadDexaHistory();
            if (history && history.length > 1) prevScan = history[1];
        }
    } catch { /* no dexa */ }

    // Field on the scan doc is `totalLeanMass`, not `muscleMass`. Reading
    // `scan.muscleMass` always came back undefined, so muscle% was 0 and
    // water% absorbed the gap — the donut + legend never matched the actual
    // scan. Use totalLeanMass throughout.
    const hasDexa = scan && (scan.totalBodyFat != null || scan.totalLeanMass != null);
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

        // Build sparkline from the last 30 days only, so it matches the
        // "· 30 days" delta caption (UX-2 — the window was 90d before).
        let sparkHtml = '';
        if (bwData.entries && bwData.entries.length > 2) {
            const thirtyAgo = new Date();
            thirtyAgo.setDate(thirtyAgo.getDate() - 30);
            const thirtyStr = getDateString(thirtyAgo);
            let recent = bwData.entries.filter(e => e.date >= thirtyStr);
            if (recent.length < 2) recent = bwData.entries.slice(-8); // fallback: last few
            const points = recent.map((e, i) => ({ x: i, y: e.displayWeight }));
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
        const leanPct = scan.totalLeanMass && scan.totalWeight
            ? Math.round(scan.totalLeanMass / scan.totalWeight * 100)
            : 0;
        // Anything left over (bone, water, etc.) — labeled "Other" so users
        // don't see "Water" inflated past reality.
        const otherPct = Math.max(0, 100 - fatPct - leanPct);
        const segments = [
            { label: `Lean ${leanPct}%`, value: leanPct, color: 'var(--cat-legs)' },
            { label: `Fat ${fatPct}%`, value: fatPct, color: 'var(--cat-pull)' },
            { label: `Other ${otherPct}%`, value: otherPct, color: 'var(--primary)' },
        ];

        // Days since DEXA
        let dexaAgo = '';
        if (scan.date) {
            const daysAgo = Math.round((Date.now() - new Date(scan.date).getTime()) / 86400000);
            if (daysAgo <= 1) dexaAgo = 'Today';
            else if (daysAgo < 7) dexaAgo = `${daysAgo} days ago`;
            else dexaAgo = `${Math.round(daysAgo / 7)} weeks ago`;
        }

        // Lean-mass change from previous scan
        let muscleDelta = '';
        const prevLean = prevScan?.totalLeanMass;
        if (prevLean != null && scan.totalLeanMass != null) {
            const d = scan.totalLeanMass - prevLean;
            // Prefer the scan's own unit; fall back to user's display unit
            // rather than hardcoding 'lb' so kg-mode users don't see "Lean
            // ↑ 1.5 lb" when their scan was in kg.
            const unit = scan.massUnit || AppState.globalUnit || 'lb';
            muscleDelta = ` · Lean ${d >= 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)} ${unit}`;
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

// Hype moment: if any PR landed today, surface it up top rather than leaving
// it buried in the quiet list at the bottom. Exclamation is allowed here — a
// PR is one of the few genuinely exciting moments (copy rule 4).
function renderTodayPRBanner(recentPRs) {
    if (!recentPRs || recentPRs.length === 0) return '';
    const today = AppState.getTodayDateString();
    const todays = recentPRs.filter(pr => pr.date === today);
    if (todays.length === 0) return '';

    const first = todays[0];
    const label = todays.length === 1
        ? `New PR — ${escapeHtml(first.exercise)} · ${first.reps}×${convertWeight(first.weight, first.unit || 'lbs', AppState.globalUnit)} ${AppState.globalUnit}`
        : `${todays.length} new PRs today!`;

    // With multiple PRs, opening an overlay listing all of them beats a
    // single-exercise drill-down that hides the other winners (the 7/2
    // report: "shows 2 PRs today but tapping only shows one exercise").
    const onclick = todays.length === 1
        ? `showExerciseDetail('${escapeAttr(first.exercise)}')`
        : `showTodaysPRs()`;

    return `
        <div class="dash-pr-banner" onclick="${onclick}">
            <div class="dash-pr-banner__badge"><i class="fas fa-trophy"></i></div>
            <div class="dash-pr-banner__text">${label}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `;
}

/**
 * Open an overlay listing every PR the user hit today, each row tappable to
 * drill into that exercise's detail. Built dynamically so we don't need a
 * dedicated modal element in index.html; teardown on backdrop tap or close
 * button restores focus + removes listeners.
 */
export function showTodaysPRs() {
    const today = AppState.getTodayDateString();
    const recentPRs = window.PRTracker?.getRecentPRs?.(30) || [];
    const todays = recentPRs.filter(pr => pr.date === today);
    if (todays.length === 0) return;

    document.getElementById('dash-todays-prs-overlay')?.remove();

    const unit = AppState.globalUnit || 'lbs';
    const rows = todays.map(pr => `
        <button type="button" class="dash-todays-prs__row" data-exercise="${escapeAttr(pr.exercise)}">
            <div class="dash-todays-prs__badge"><i class="fas fa-trophy"></i></div>
            <div class="dash-todays-prs__info">
                <div class="dash-todays-prs__name">${escapeHtml(pr.exercise)}</div>
                <div class="dash-todays-prs__meta">${pr.reps} reps</div>
            </div>
            <div class="dash-todays-prs__val">${convertWeight(pr.weight, pr.unit || 'lbs', unit)} ${unit}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </button>
    `).join('');

    const overlay = document.createElement('div');
    overlay.id = 'dash-todays-prs-overlay';
    overlay.className = 'dash-todays-prs-overlay';
    overlay.innerHTML = `
        <div class="dash-todays-prs">
            <div class="dash-todays-prs__header">
                <div class="dash-todays-prs__title">Today's PRs</div>
                <button class="dash-todays-prs__close" aria-label="Close" data-close><i class="fas fa-times"></i></button>
            </div>
            <div class="dash-todays-prs__list">${rows}</div>
        </div>
    `;

    const close = () => {
        overlay.classList.remove('dash-todays-prs-overlay--show');
        setTimeout(() => overlay.remove(), 200);
    };
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-close]')) {
            close();
            return;
        }
        const row = e.target.closest('.dash-todays-prs__row');
        if (row) {
            const ex = row.dataset.exercise;
            close();
            if (ex && typeof window.showExerciseDetail === 'function') {
                window.showExerciseDetail(ex);
            }
        }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('dash-todays-prs-overlay--show'));
}

/**
 * PR meta line: "3d ago · 6 reps · Hammer Strength". The machine is named
 * (PRTracker segments PRs per equipment, so a PR belongs to a specific
 * machine) unless it's the "Unknown Equipment" fallback (UX-1).
 */
function prMetaLine(pr) {
    const parts = [formatRelativeDate(pr.date, { daysAgo: true }), `${pr.reps} reps`];
    if (pr.equipment && pr.equipment !== 'Unknown Equipment') {
        parts.push(escapeHtml(pr.equipment));
    }
    return parts.join(' · ');
}

/** Stable key for a PR (exercise + equipment) — used to de-dup surfaces. */
function prKey(pr) {
    return `${pr.exercise}|${pr.equipment || ''}`;
}

function renderRecentPRs(recentPRs, excludeKeys = null) {
    let list = recentPRs || [];
    if (excludeKeys && excludeKeys.size > 0) {
        list = list.filter(pr => !excludeKeys.has(prKey(pr)));
    }
    if (list.length === 0) return '';
    return `
        <div class="dash-section-head dash-section-head--tight">
            <h3>Recent PRs</h3>
        </div>
        ${list.slice(0, 3).map(pr => `
            <div class="pr-row" onclick="showExerciseDetail('${escapeAttr(pr.exercise)}')">
                <div class="pr-badge"><i class="fas fa-trophy"></i></div>
                <div class="pr-info">
                    <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                    <div class="pr-meta">${prMetaLine(pr)}</div>
                </div>
                <div class="pr-val">${convertWeight(pr.weight, pr.unit || 'lbs', AppState.globalUnit)} ${AppState.globalUnit}</div>
            </div>
        `).join('')}
    `;
}

// ===================================================================
// PROGRESS PAGE — consolidated stats destination (volume trend, body-part
// trends, PR table). Lives here so it can reuse aggregateBodyPartStats,
// renderBodyPartCard, chartSparkline, PRTracker and StreakTracker — all
// already imported — without new cross-module exports.
// ===================================================================

// Total training volume per rolling 7-day window, oldest→newest for chartLine.
function weeklyVolumeSeries(allWorkouts, weeks = 12) {
    const today = new Date(getDateString());
    const buckets = new Array(weeks).fill(0);
    for (const w of allWorkouts) {
        if (!w.date || !w.completedAt || !w.exercises) continue;
        const diff = Math.round((today - new Date(w.date)) / 86400000);
        if (diff < 0) continue;
        const wk = Math.floor(diff / 7);
        if (wk >= weeks) continue;
        Object.values(w.exercises).forEach(ex => (ex.sets || []).forEach(s => {
            if (s.reps && s.weight) buckets[wk] += s.reps * s.weight;
        }));
    }
    return buckets.map((y, i) => ({ x: i, y })).reverse();
}

function renderProgressSummary(streak, sessions, prCount) {
    return `
        <div class="progress-summary">
            <div class="progress-summary__cell">
                <div class="progress-summary__val">${streak}</div>
                <div class="progress-summary__label">Day streak</div>
            </div>
            <div class="progress-summary__cell">
                <div class="progress-summary__val">${sessions}</div>
                <div class="progress-summary__label">Workouts</div>
            </div>
            <div class="progress-summary__cell">
                <div class="progress-summary__val">${prCount}</div>
                <div class="progress-summary__label">PRs</div>
            </div>
        </div>
    `;
}

function renderVolumeTrend(series) {
    if (!series.some(p => p.y > 0)) return '';
    const maxY = Math.max(...series.map(p => p.y));
    return `
        <div class="dash-section-head dash-section-head--tight">
            <h3>Weekly volume</h3>
            <span class="dash-section-head__meta">Last ${series.length} weeks</span>
        </div>
        <div class="progress-card">
            <div class="progress-chart">${chartLine({
                points: series, width: 320, height: 120, color: 'var(--primary)', fill: true,
                ariaLabel: `Weekly training volume over the last ${series.length} weeks`,
                axes: { yMax: formatVolume(maxY), yMin: '0', xStart: `${series.length}w ago`, xEnd: 'Now' },
            })}</div>
        </div>
    `;
}

function renderPRTable(prs) {
    if (!prs || prs.length === 0) {
        return `
            <div class="dash-section-head dash-section-head--tight"><h3>Personal records</h3></div>
            <div class="progress-empty">No PRs yet. Beat a previous set and it'll show up here.</div>
        `;
    }
    return `
        <div class="dash-section-head dash-section-head--tight"><h3>Personal records</h3></div>
        ${prs.map(pr => `
            <div class="pr-row" onclick="showExerciseDetail('${escapeAttr(pr.exercise)}')">
                <div class="pr-badge"><i class="fas fa-trophy"></i></div>
                <div class="pr-info">
                    <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                    <div class="pr-meta">${prMetaLine(pr)}</div>
                </div>
                <div class="pr-val">${convertWeight(pr.weight, pr.unit || 'lbs', AppState.globalUnit)} ${AppState.globalUnit}</div>
            </div>
        `).join('')}
    `;
}

export async function renderProgressPage() {
    const container = document.getElementById('progress-content');
    if (!container) return;

    // Prefer the dashboard's cached full history; fall back to a fresh load.
    let allWorkouts = AppState.workouts;
    if (!allWorkouts || allWorkouts.length === 0) {
        allWorkouts = await loadAllWorkouts(AppState);
        AppState.workouts = allWorkouts;
    }

    const [streaks] = await Promise.all([
        StreakTracker.calculateStreaks(),
        PRTracker.loadPRData(),
    ]);
    const streakDays = streaks?.currentStreak || 0;
    const prs = PRTracker.getRecentPRs(15);
    const totalSessions = allWorkouts.filter(w => w.completedAt).length;
    const series = weeklyVolumeSeries(allWorkouts, 12);

    const stats = BODY_PARTS.map(bp => aggregateBodyPartStats(allWorkouts, bp, 'W'));
    stats.sort((a, b) => {
        if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
        return (a.lastTrained?.daysAgo || 999) - (b.lastTrained?.daysAgo || 999);
    });
    const volumeByPart = weeklyVolumeByBodyPart(allWorkouts);

    container.innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div>
                    <div class="d-title">Progress</div>
                    <div class="d-subtitle">${totalSessions} ${totalSessions === 1 ? 'workout' : 'workouts'} logged</div>
                </div>
            </div>
        </div>
        <div class="d-content">
            <div class="progress-page">
                ${renderProgressSummary(streakDays, totalSessions, prs.length)}
                ${renderVolumeTrend(series)}
                <div class="dash-section-head dash-section-head--tight">
                    <h3>Training balance</h3>
                    <span class="dash-section-head__meta">sets/wk vs target</span>
                </div>
                ${stats.map(s => renderBodyPartCard(s, volumeByPart)).join('')}
                ${renderPRTable(prs)}
            </div>
        </div>
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

export async function confirmCancelActiveWorkout() {
    const confirmed = await confirmSheet({
        title: 'Cancel this workout?',
        message: 'Logged sets are saved as an incomplete entry.',
        confirmLabel: 'Cancel workout',
        cancelLabel: 'Keep going',
        destructive: true,
    });
    if (!confirmed) return;
    stopPillTimer();
    document.getElementById('active-workout-pill')?.remove();
    // Pass true so cancelWorkout() doesn't show a second confirm dialog —
    // the pill button already confirmed once.
    window.cancelWorkout?.(true);
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
                showNotification(`Workout "${workoutType}" not found — pick from your list`, 'info');
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

