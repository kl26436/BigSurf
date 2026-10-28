// Dashboard UI Module — V2 Health-style dashboard with drill-down navigation
// Sections: Greeting → Active Pill → Hero Chips → Insight → For Today → Training → Composition → Recent PRs

import { StatsTracker } from '../features/stats-tracker.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, convertWeight, formatSet, unitLabel, escapeJsArg } from './ui-helpers.js';
import { once } from './busy.js';
import { openSheet, closeSheet } from './sheet.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { AppState } from '../utils/app-state.js';
import { getDateString, getDayName, formatRelativeDate, formatRelative, formatDuration } from '../utils/date-helpers.js';
import { Config, getCategoryIcon, debugLog, perfMark, perfReport } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { loadAllWorkouts } from '../data/data-manager.js';
import { getWorkoutCategory } from './template-selection.js';
import { TrainingInsights } from '../features/training-insights.js';
import { showFirstUseTip } from '../features/first-use-tips.js';
import { satisfiedDays, todayCard, weekDates, loadWeekPlan, reflowWeek, DAY_KEYS, DAY_LABELS, dayKeyOf } from '../features/week-plan.js';
import { buildWeekStrip, splitWorkoutTitle, heroStats, liftBadge, weeklyE1rmSeries } from '../features/home-model.js';
import { describeStuck } from '../features/plain-language.js';
import {
    loadActiveProgram, programSessionForToday,
    programNoticeForToday, programCompletionForToday,
    programBlockStats, trailingWeekLight,
} from '../features/program-session.js';

import {
    aggregateBodyPartStats, getTemplatesForDayOfWeek, aggregateExerciseStats,
    findPRProximity, formatVolume, capitalize, aggregateConditioning,
} from '../features/metrics/aggregators.js';
import { getRangeBounds } from '../features/metrics/range-filter.js';
import { analyzeWeeklyVolume } from '../features/training-insights.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';
import { chartLine } from '../features/charts/chart-line.js';
import { buildScoreboard } from '../features/progress-scoreboard.js';
import { weightIncrement } from '../features/progression.js';
import { DASHBOARD_BODY_PARTS } from '../features/exercise-taxonomy.js';

// ===================================================================
// CONSTANTS
// ===================================================================

// LB-3 — the six cards come from the one taxonomy (Glutes/Calves fold into
// legs, Abs into core — see exercise-taxonomy.js#dashboardBodyPart).
const BODY_PARTS = DASHBOARD_BODY_PARTS;
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

// A render that started earlier must not paint over a newer one.
let _dashRenderSeq = 0;

async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    perfMark('dashboard:start');
    const seq = ++_dashRenderSeq;

    // PF-3 — the skeleton only before the session's first paint. After that
    // the previous dashboard stays up while the (cached) reads run, and the
    // swap happens in one go — no flash on tab switches or back from a page.
    if (container.dataset.rendered !== '1') {
        container.innerHTML = `
            <div class="skeleton skeleton-card dash-skel--hero"></div>
            <div class="skeleton skeleton-card dash-skel--strip"></div>
            <div class="skeleton skeleton-card dash-skel--row"></div>
        `;
    }

    try {
        // PF-2 — ONE parallel batch for everything the page shows; wall time
        // is the slowest read, not the sum. Each is session-cached (workouts,
        // weigh-ins, scans, the report-card row) or loaded once (PR doc,
        // week plan, program), so a warm return makes no network trip at all.
        // Streaks, weekly stats and insights all derive from the one workouts
        // list (the 9/29 fix).
        const [allWorkouts, bwData, dexaHistory, reportEntryHTML, planSummary] = await Promise.all([
            loadAllWorkouts(AppState),
            loadBodyWeightData(),
            import('../features/dexa-scan.js').then(m => m.loadDexaHistory(2)).catch(() => []),
            reportCardEntry(),
            // TP-6 c — the "Your plan" card (plan doc, waves, dates; session-cached).
            import('../features/plan.js').then(m => m.loadPlanSummary()).catch(() => null),
            PRTracker.loadPRData(),
            // Week plan (5.5): hydrate once per session (null = none set).
            AppState._weekPlan === undefined ? loadWeekPlan().catch(() => null) : Promise.resolve(),
            // Active program (Phase 9 rung 2): same hydrate-once pattern.
            AppState._activeProgram === undefined ? loadActiveProgram().catch(() => null) : Promise.resolve(),
        ]);
        perfMark('dashboard:data');
        if (seq !== _dashRenderSeq) return;
        _planCard = await planCardModel(planSummary, allWorkouts);
        const [streaks, weeklyStats, insightsData] = await Promise.all([
            StreakTracker.calculateStreaks(allWorkouts),
            StatsTracker.getWeeklyStats(allWorkouts),
            TrainingInsights.loadInsightsData(allWorkouts).catch(() => ({ recentWorkouts: [], allWorkouts: [] })),
        ]);
        const recentPRs = PRTracker.getRecentPRs(3);

        const weekCount = weeklyStats.uniqueDays || weeklyStats.workouts.length;
        const weeklyGoal = AppState.settings?.weeklyGoal || 5;
        const streakDays = streaks?.currentStreak || 0;
        paintHeaderAvatar();

        const hasWorkouts = streaks && streaks.totalWorkouts > 0;
        const firstPaint = container.dataset.rendered !== '1';

        if (!hasWorkouts) {
            container.innerHTML = `
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

            // "For Today" reads the templates already in memory (loaded at
            // launch, refreshed after every edit) — PF-2, not two more queries.
            AppState.templates = AppState.workoutPlans || [];

            // Top insight (uses 8-week data from insightsData, not full history)
            const exerciseDatabase = AppState.exerciseDatabase || [];
            // AP-8: a deload week (program or manual) mutes "add weight" insights.
            let insightIntent = null;
            try {
                const { getSessionIntent, weekOverrideOf } = await import('../features/session-intent.js');
                insightIntent = getSessionIntent({
                    program: AppState._activeProgram || null,
                    today: AppState.getTodayDateString(),
                    manualDeload: weekOverrideOf(AppState.settings),
                });
            } catch { /* plain insights */ }
            const topInsight = TrainingInsights.getTopInsight(
                insightsData.recentWorkouts, insightsData.allWorkouts, exerciseDatabase, { intent: insightIntent }
            );


            // De-dup: today's PRs surface in the banner, so exclude them from
            // the This-week recap below to avoid the same win twice on screen.
            const todayStr = AppState.getTodayDateString();
            const todaysPRKeys = new Set(
                recentPRs.filter(pr => pr.date === todayStr).map(prKey)
            );

            // HOME.md Option B ("Today-first"): one indigo hero that holds the
            // week and today's workout, then Next up / My plan, All workouts,
            // and the main lifts as tiles. The retrospective tail (This week,
            // Body) stays below the fold, unchanged.
            const week = {
                days: buildWeekStrip({
                    workouts: allWorkouts, weekPlan: AppState._weekPlan || null,
                    templates: AppState.templates, today: AppState.getTodayDateString(),
                }),
                done: weekCount, goal: Math.min(7, Math.max(1, weeklyGoal)),
                streak: streakDays, lighter: detectDeloadWeek(allWorkouts),
            };
            container.innerHTML = `
                ${renderActiveWorkoutPill()}
                ${renderProgramCompleteBanner(allWorkouts)}
                ${renderForToday(allWorkouts, week)}
                ${reportEntryHTML}
                ${renderTodayPRBanner(recentPRs)}
                ${renderScoreboardCard(allWorkouts)}
                ${renderThisWeekCard(allWorkouts, recentPRs, todaysPRKeys, topInsight)}
                ${renderBodyCard(bwData, dexaHistory)}
            `;

            if (AppState.currentWorkout || window.inProgressWorkout) startPillTimer();
            // The nav's workout button glows while there's something to do
            // today (nothing logged yet, nothing running) — not as constant noise.
            const trainedToday = week.days.some(d => d.isToday && d.state === 'done');
            document.body.classList.toggle('fab-glow', !trainedToday && !(AppState.currentWorkout || window.inProgressWorkout));
        }
        container.dataset.rendered = '1';
        if (firstPaint) playEntrance(container);
        perfMark('dashboard:painted');
        perfReport();

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
// HEADER AVATAR · ENTRANCE MOTION · THE TODAY HERO'S HEAD
// ===================================================================

/** The settings door lives in the logo bar now (HOME.md header), Home only. */
function paintHeaderAvatar() {
    const el = document.getElementById('header-avatar');
    if (!el) return;
    const displayName = AppState.currentUser?.displayName || AppState.currentUser?.email || '';
    el.textContent = (displayName.trim().charAt(0) || '?').toUpperCase();
}

// The logo bar's hairline fades in once the page scrolls (HOME.md header).
let _headerScrollWired = false;
function wireHeaderScroll() {
    if (_headerScrollWired || typeof window === 'undefined') return;
    _headerScrollWired = true;
    let raf = 0;
    window.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            document.getElementById('main-header')?.classList.toggle('header--scrolled', window.scrollY > 60);
        });
    }, { passive: true });
}

const motionOK = () => typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches;

/**
 * First paint of the session only: the hero, tiles, All workouts and the lift
 * tiles rise in, and the streak / "N up" / lift weights count up from 0.
 * Re-renders (tab switches, data refreshes) paint still.
 */
function playEntrance(container) {
    wireHeaderScroll();
    if (!motionOK()) return;
    container.querySelectorAll('.dash-rise').forEach((el, i) => el.style.setProperty('--rise-i', String(i)));
    container.classList.add('is-entering');
    setTimeout(() => container.classList.remove('is-entering'), 1400);

    const targets = [...container.querySelectorAll('[data-count-to]')]
        .map(el => ({ el, to: Number(el.dataset.countTo), dec: Number(el.dataset.countDec || 0) }))
        .filter(t => Number.isFinite(t.to) && t.to > 0);
    if (!targets.length) return;
    const start = performance.now();
    const step = (now) => {
        const p = Math.min(1, (now - start) / 800);
        const eased = 1 - Math.pow(1 - p, 3);
        for (const t of targets) t.el.textContent = (t.to * eased).toFixed(t.dec);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

const WEEK_DAY_WORDS = { done: 'done', today: 'today', plan: 'planned', rest: 'rest' };

/**
 * The hero's head, shared by every hero state: the date and streak, the
 * week strip (done · today · planned · rest), and a full-bleed divider.
 */
function renderHeroHead(week) {
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    let badge = '';
    if (week.lighter) {
        badge = `<span class="dash-hero__streak-badge dash-hero__streak-badge--calm"><i class="fas fa-battery-half" aria-hidden="true"></i>Lighter week</span>`;
    } else if (week.streak > 0) {
        badge = `<span class="dash-hero__streak-badge" aria-label="${week.streak} day streak"><i class="fas fa-fire" aria-hidden="true"></i><span data-count-to="${week.streak}">${week.streak}</span></span>`;
    }
    const label = `This week: ${week.days.map(d => `${d.dayName} ${WEEK_DAY_WORDS[d.state]}`).join(', ')}`;
    const days = week.days.map(d => `
        <div class="dash-week__day${d.isToday ? ' is-today' : ''}">
            <span class="dash-week__letter">${d.letter}</span>
            <span class="dash-week__dot dash-week__dot--${d.state}">${d.state === 'done' ? '<i class="fas fa-check"></i>' : ''}</span>
        </div>`).join('');
    return `
        <div class="dash-hero__top">
            <span class="dash-hero__date">${dateStr}</span>
            ${badge}
        </div>
        <div class="dash-week" role="img" aria-label="${escapeAttr(label)}">${days}</div>
        <div class="dash-hero__divider" aria-hidden="true"></div>
    `;
}

const weekCountText = (week) => `${week.done} of ${week.goal} this week`;

// Active-workout hero: same shell, the eyebrow shows the running timer and
// the actions become Continue / Cancel. '' when nothing is in progress.
function renderActiveWorkoutHero(week) {
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
    const { title, sub } = splitWorkoutTitle(workoutType);

    return `
        <div class="dash-hero dash-hero--active dash-rise">
            ${renderHeroHead(week)}
            <div class="dash-hero__eyebrow">
                <span class="dash-hero__live-dot" aria-hidden="true"></span>
                In progress · <span id="dash-active-hero-timer">${elapsed}</span>
            </div>
            <div class="dash-hero__title">${escapeHtml(title)}</div>
            <div class="dash-hero__sub">${sub ? `${escapeHtml(sub)} · ` : ''}${done}/${total} exercise${total === 1 ? '' : 's'} done</div>
            <div class="dash-hero__actions">
                <button class="dash-hero__start" onclick="resumeActiveWorkout()" aria-label="Continue workout">
                    <i class="fas fa-play" aria-hidden="true"></i> Continue
                </button>
                <button class="dash-hero__wide dash-hero__wide--danger" onclick="confirmCancelActiveWorkout()" aria-label="Cancel workout">
                    <i class="fas fa-times" aria-hidden="true"></i> Cancel workout
                </button>
            </div>
        </div>
    `;
}

function renderActiveWorkoutPill() {
    const inProgress = window.inProgressWorkout;
    const hasActiveWorkout = AppState.currentWorkout || inProgress;
    if (!hasActiveWorkout) return '';
    // 7/9 clutter reduction: when the For-Today hero is going to render as
    // the active-workout hero (Continue/Cancel), the pill becomes redundant.
    // Only show the pill in the fallback (no templates → no hero possible).
    if ((AppState.templates || []).some(t => !t.archived)) return '';

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
        const heroTimer = document.getElementById('dash-active-hero-timer');
        const inProgress = window.inProgressWorkout;
        if ((!pill && !heroTimer) || (!AppState.currentWorkout && !inProgress)) {
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
        const elapsed = formatPillElapsed(elapsedSeconds);
        if (pill) pill.textContent = `${done}/${total} · ${elapsed}`;
        if (heroTimer) heroTimer.textContent = elapsed;
    }, 1000);
}
function stopPillTimer() {
    if (pillTimerInterval) { clearInterval(pillTimerInterval); pillTimerInterval = null; }
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

// Color a body-weight delta only when the user has told us their goal direction.
// Default (no goal set) is neutral — we never assume lose-is-good / gain-is-bad.
function getBwDeltaDirectionClass(delta) {
    if (delta == null) return '';
    const goal = AppState.settings?.weightGoal;
    if (!goal || goal === 'maintain') return '';
    const losing = delta < 0;
    const gaining = delta > 0;
    if (goal === 'lose' && losing) return 'bw-delta--good';
    if (goal === 'lose' && gaining) return 'bw-delta--bad';
    if (goal === 'gain' && gaining) return 'bw-delta--good';
    if (goal === 'gain' && losing) return 'bw-delta--bad';
    return '';
}

// ===================================================================
// FOR TODAY
// ===================================================================

// Program-end landing: finishing these weeks is a milestone — the dashboard
// says so (gold, like a PR), leading with real numbers. TP-6 c: with a plan
// the next weeks roll on their own, so this never shows; without one it
// offers to turn the plan on (the same thing the Plan page's notice does).
function renderProgramCompleteBanner(allWorkouts = []) {
    if (_planHasDoc) return '';
    const program = AppState._activeProgram;
    const today = AppState.getTodayDateString();
    const done = program ? programCompletionForToday(program, today) : null;
    if (!done) return '';

    const stats = programBlockStats(program, allWorkouts, PRTracker.getRecentPRs(200), today);
    const chips = [];
    if (stats) {
        if (stats.planned > 0) chips.push(`${stats.daysTrained} of ${stats.planned} planned days trained`);
        else if (stats.daysTrained > 0) chips.push(`${stats.daysTrained} days trained`);
        if (stats.prCount > 0) chips.push(`${stats.prCount} PR${stats.prCount === 1 ? '' : 's'}`);
    }
    const statLine = chips.length
        ? `<div class="dash-program-done__stats">${chips.map(c => `<span class="dash-program-done__stat">${escapeHtml(c)}</span>`).join('')}</div>`
        : '';

    return `
        <div class="dash-program-done">
            <div class="dash-program-done__head">
                <i class="fas fa-flag-checkered dash-program-done__icon"></i>
                <div class="dash-program-done__txt">
                    <div class="dash-program-done__title">These weeks are done</div>
                    <div class="dash-program-done__meta">${escapeHtml(done.name)} · ${done.weeks} weeks in the books</div>
                </div>
                <button class="dash-program-done__dismiss" onclick="dismissProgramComplete('${escapeJsArg(done.id)}')" aria-label="Dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${statLine}
            <div class="dash-program-done__meta">Turn on your plan so the next weeks are set up on their own.</div>
            <button class="dash-program-done__cta" onclick="dashEnablePlan()">Keep my plan going</button>
        </div>
    `;
}

// TP-6 c — "My plan" tile beside Next up: the same timeline header the Plan
// page shows (so the two can't disagree) — the week's kind, never "week N of
// M"; the next lighter week, the next date, swaps waiting. The bar is the
// next four weeks by kind (this week lit, a lighter week tinted). Taps into
// the Plan page.
let _planCard = null;   // { name, title, meta, segs } — planSummaryLine + the next 4 weeks
let _planHasDoc = false;

async function planCardModel(summary, allWorkouts) {
    _planHasDoc = !!summary?.plan;
    if (!summary || (!summary.plan && !(summary.programs || []).length)) return null;
    try {
        const [{ buildPlanTimeline, planSummaryLine }, { waitingSwaps }] = await Promise.all([
            import('../features/plan-timeline.js'), import('../features/exercise-rotation.js'),
        ]);
        const templates = AppState.workoutPlans || [];
        const today = AppState.getTodayDateString();
        const tl = buildPlanTimeline({
            plan: summary.plan, weekPlan: AppState._weekPlan || null, programs: summary.programs || [],
            templates, workouts: allWorkouts || [], events: summary.events || [], today,
        });
        if (!summary.plan && !tl.header.thisWeek) return null;
        const line = planSummaryLine(tl.header, { hasPlan: !!summary.plan, waiting: waitingSwaps(tl.activeProgram, templates).length });
        const from = tl.weeks.findIndex(w => w.state === 'current' || w.weekStart > today);
        const segs = from < 0 ? [] : tl.weeks.slice(from, from + 4).map(w => ({ kind: w.kind, current: w.state === 'current' }));
        return {
            name: tl.header.name || 'My plan',
            title: tl.header.paused ? 'Paused' : (tl.header.thisWeek || line.title),
            meta: line.meta, segs,
        };
    } catch (e) {
        debugLog('dashboard: plan card failed', e);
        return null;
    }
}

/** TP-6 c — "these weeks are done" without a plan: turn it on, right here. */
export function dashEnablePlan() {
    return once('plan-enable', async () => {
        const { enablePlanFromProgram } = await import('../features/plan.js');
        if (await enablePlanFromProgram(AppState._activeProgram || {})) {
            showNotification('Plan on — the next weeks are set up on their own', 'success', 2000);
            await renderDashboard();
        } else showNotification("Couldn't turn the plan on — try again", 'error');
    });
}

/**
 * For Today: ONE hero (the week + today's workout + Start), then the Next up
 * / My plan tiles, All workouts, and the quiet one-time setup hints.
 * HOME.md Option B — Start always applies the plan week's targets, so the
 * old "Apply & start" box is gone: one filled button above the fold.
 */
function renderForToday(allWorkouts, week) {
    const dayName = getDayName();
    // Phase 7 — archived workouts drop out of For Today ranking.
    const templates = (AppState.templates || []).filter(t => !t.archived);

    // Most-recent completed session per workout type — the hero's "~35 min"
    // and "last done" read it. allWorkouts is date-desc, so the first match
    // per type is the latest.
    const lastDoneByType = {};
    for (const w of allWorkouts) {
        const type = w.workoutType;
        if (!type || lastDoneByType[type] || !w.completedAt) continue;
        lastDoneByType[type] = { date: w.date, duration: w.totalDuration || 0 };
    }

    // Week plan (5.5): when a plan exists it DECIDES today — the usage-ranked
    // suggestion below becomes the fallback for open/unplanned days.
    const wp = AppState._weekPlan;
    let planCard = null;
    let satisfied = new Set();
    if (wp) {
        const monday = weekDates().mon;
        const weekWos = allWorkouts.filter(w => w.completedAt && !w.cancelledAt && w.date >= monday);
        satisfied = satisfiedDays(wp, weekWos, templates);
        planCard = todayCard(wp, satisfied, new Date());
    }

    const dow = new Date().getDay();
    const dayKey = dayName.toLowerCase();
    const ranked = getTemplatesForDayOfWeek(templates, allWorkouts, dow)
        .map(r => ({
            ...r,
            scheduled: Array.isArray(r.template.suggestedDays) && r.template.suggestedDays.includes(dayKey),
        }))
        .sort((a, b) => {
            if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
            return b.score - a.score;
        });

    // Ranking is recency-decayed (see getTemplatesForDayOfWeek), so a switched
    // routine converges on what you've actually done lately.
    let visible = ranked.filter(r => r.count > 0 || r.scheduled).slice(0, 2);
    // Planned workout takes the hero slot (reflowed: a missed Monday can land
    // here on Wednesday).
    if (planCard?.kind === 'workout') {
        const planned = templates.find(t => t.id === planCard.templateId);
        if (planned) {
            const heroEntry = ranked.find(r => r.template.id === planned.id)
                || { template: planned, count: 0, score: 0, scheduled: true };
            heroEntry.scheduled = true;
            visible = [heroEntry, ...visible.filter(r => r.template.id !== planned.id)].slice(0, 2);
        }
    }

    // 7/9 UX: a workout in progress turns the hero into Continue / Cancel.
    let hero = renderActiveWorkoutHero(week);
    let heroTemplate = null;
    if (!hero) {
        if (templates.length === 0) hero = renderCalmHero(week, 'empty', dayName);
        else if (planCard?.kind === 'rest') hero = renderCalmHero(week, 'rest', dayName);
        else if (planCard?.kind === 'done') hero = renderCalmHero(week, 'done', dayName);
        else if (visible.length === 0) hero = renderCalmHero(week, 'empty', dayName);
        else {
            heroTemplate = visible[0].template;
            hero = renderTodayHero(visible[0], week, dayName, lastDoneByType, allWorkouts, planCard, wp);
        }
    }

    // Next up: the plan's next day that isn't today's workout; without a plan,
    // the usage-ranked runner-up.
    let next = null;
    if (wp) {
        const { effective } = reflowWeek(wp, satisfied, new Date());
        const todayKey = dayKeyOf(new Date());
        for (const key of DAY_KEYS.slice(DAY_KEYS.indexOf(todayKey) + 1)) {
            const t = effective[key] && templates.find(x => x.id === effective[key]);
            if (t && t.id !== heroTemplate?.id) { next = { template: t, day: DAY_LABELS[key] }; break; }
        }
    }
    if (!next) {
        const runnerUp = visible.find(r => r.template.id !== heroTemplate?.id);
        if (runnerUp) next = { template: runnerUp.template, day: null };
    }

    // One-time quiet setup hint when no plan exists — dismissible forever,
    // never a popup (pull, not push).
    const setupRow = (wp === null && templates.length > 0 && !AppState.settings?.weekPlanSetupDismissed) ? `
        <div class="row-card row-card--flat row-card--static dash-alt-row dash-alt-row--setup" id="week-plan-setup-row">
            <i class="fas fa-calendar-week dash-alt-row__icon"></i>
            <div class="dash-alt-row__txt dash-alt-row__txt--muted" onclick="openWeekPlanSheet()" role="button" tabindex="0">Plan your week — one workout per day</div>
            <button class="dash-alt-row__dismiss" onclick="dismissWeekPlanSetup(event)" aria-label="Dismiss">
                <i class="fas fa-times"></i>
            </button>
        </div>` : '';

    // Program door (discoverability review): only one hint at a time — the
    // week-plan hint goes first, since a plan is the natural first rung.
    const programRow = (!setupRow && templates.length > 0 && !_planCard && !AppState._activeProgram && !AppState.settings?.programStarterDismissed) ? `
        <div class="row-card row-card--flat row-card--static dash-alt-row dash-alt-row--setup" id="program-starter-row">
            <i class="fas fa-flag-checkered dash-alt-row__icon"></i>
            <div class="dash-alt-row__txt dash-alt-row__txt--muted" onclick="startProgramChat()" role="button" tabindex="0">Get a 4-week plan built from your workouts</div>
            <button class="dash-alt-row__dismiss" onclick="dismissProgramStarter(event)" aria-label="Dismiss">
                <i class="fas fa-times"></i>
            </button>
        </div>` : '';

    const hints = setupRow || programRow;
    return `
        ${hero}
        ${renderTodayTiles(next, lastDoneByType)}
        <div class="row-card dash-all-workouts dash-rise" onclick="openWorkoutSelectorForDay('${escapeJsArg(dayName)}')" role="button" tabindex="0">
            <div class="row-card__icon"><i class="fas fa-list-ul" aria-hidden="true"></i></div>
            <div class="row-card__content"><div class="row-card__title">All workouts</div></div>
            <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
        </div>
        ${hints ? `<div class="dash-alt-list">${hints}</div>` : ''}
    `;
}

/**
 * The hero when today isn't a workout: rest day, done for today, or nothing
 * planned. Calm — no filled button unless Quick start IS today's way in.
 */
function renderCalmHero(week, kind, dayName) {
    const copy = {
        rest: { eyebrow: `Rest day · ${weekCountText(week)}`, title: 'Rest day', sub: 'Recovery is part of the plan' },
        done: { eyebrow: `Done · ${weekCountText(week)}`, title: 'Done for today', sub: "Today's planned workout is in the books" },
        empty: { eyebrow: `For ${dayName} · ${weekCountText(week)}`, title: 'Nothing planned', sub: 'Start now and add exercises as you go' },
    }[kind];
    const quick = kind === 'empty'
        ? `<button class="dash-hero__start" onclick="openQuickStartSheet()"><i class="fas fa-bolt" aria-hidden="true"></i> Quick start</button>`
        : `<button class="dash-hero__wide" onclick="openQuickStartSheet()"><i class="fas fa-bolt" aria-hidden="true"></i> Quick start</button>`;
    return `
        <div class="dash-hero dash-hero--calm dash-rise">
            ${renderHeroHead(week)}
            <div class="dash-hero__eyebrow">${escapeHtml(copy.eyebrow)}</div>
            <div class="dash-hero__title">${copy.title}</div>
            <div class="dash-hero__sub">${copy.sub}</div>
            <div class="dash-hero__actions">
                ${quick}
                <button class="dash-hero__icon-btn dash-hero__icon-btn--coach" onclick="bottomNavTo('ai-coach')" aria-label="Ask coach">
                    <i class="fas fa-robot" aria-hidden="true"></i>
                </button>
            </div>
        </div>
    `;
}

/** Dismiss the week-plan setup hint forever (quiet, no confirm). */
export function dismissWeekPlanSetup(event) {
    event?.stopPropagation?.();
    document.getElementById('week-plan-setup-row')?.remove();
    import('./settings-ui.js').then(m => m.updateSetting('weekPlanSetupDismissed', true)).catch(() => {});
}
if (typeof window !== 'undefined') {
    window.dismissWeekPlanSetup = dismissWeekPlanSetup;
}

/** Dismiss the program starter hint forever (quiet, no confirm). */
export function dismissProgramStarter(event) {
    event?.stopPropagation?.();
    document.getElementById('program-starter-row')?.remove();
    import('./settings-ui.js').then(m => m.updateSetting('programStarterDismissed', true)).catch(() => {});
}
if (typeof window !== 'undefined') {
    window.dismissProgramStarter = dismissProgramStarter;
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

/**
 * THE hero (HOME.md Option B): the week, "Up today · N of M this week", the
 * workout's name split into title + subtitle, three stat tiles, and Start —
 * which applies this plan week's targets on its own (auto-confirm weeks start
 * the pre-built session; propose weeks apply and start). Quick start and Ask
 * coach sit beside it as icon buttons.
 */
function renderTodayHero({ template, scheduled }, week, dayName, lastDoneByType, allWorkouts, planCard, wp) {
    const exList = Array.isArray(template.exercises) ? template.exercises : Object.values(template.exercises || {});
    const name = template.name || template.day;
    // Only ever a JS string argument (startWorkout / startProgramSession…).
    const startArg = escapeJsArg(template.day || template.name || template.id);
    const { title, sub } = splitWorkoutTitle(name);
    const rec = lastDoneByType[name];

    // Trust rung 2 (auto_confirm): when the plan decided today's hero AND the
    // active program's week adjusts it, Start runs the pre-built session.
    // Propose-only weeks: Start applies the (deterministic) adjustment and
    // starts — no chat round trip, and the default Start habit can't blow
    // past the week the program exists for.
    const heroIsPlanned = planCard?.kind === 'workout' && template.id === planCard.templateId && AppState._activeProgram;
    const today = AppState.getTodayDateString();
    const programSession = heroIsPlanned ? programSessionForToday(AppState._activeProgram, today) : null;
    const programNotice = heroIsPlanned && !programSession ? programNoticeForToday(AppState._activeProgram, today) : null;
    const target = programSession || programNotice;

    // Pre-Start caution: before a program-adjusted HEAVY session after a light
    // trailing week, warn in the moment — the weekly digest is a week late.
    const programCaution = (target && target.weightPct > 0 && wp) ? trailingWeekLight(wp, allWorkouts, today) : null;
    const cautionHook = programCaution?.light ? `
        <div class="dash-hero__note dash-hero__note--caution" onclick="askCoachToReflow()" role="button" tabindex="0"
            aria-label="Light week behind you — trained ${programCaution.trained} of ${programCaution.planned} planned days. Tap to ask the coach to reflow.">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            <div class="dash-hero__note-txt"><b>Light week behind you</b> — ${programCaution.trained} of ${programCaution.planned} planned days. Ease in or tap to reflow.</div>
        </div>` : '';

    // PR-proximity hook — forward-looking "you're close, go for it".
    const proximity = findPRProximity(buildProximityCandidates(template, allWorkouts));
    let prHook = '';
    if (proximity) {
        const gap = Math.round(proximity.gap * 10) / 10;
        const equip = proximity.equipment && proximity.equipment !== 'Unknown Equipment'  // copy-ok: stored fallback key — matched against saved data
            ? ` (${escapeHtml(proximity.equipment)})` : '';
        prHook = `
            <div class="dash-hero__note dash-hero__note--pr">
                <i class="fas fa-trophy" aria-hidden="true"></i>
                <div class="dash-hero__note-txt"><b>${gap} ${unitLabel(proximity.unit)} off your ${escapeHtml(proximity.exercise)} PR</b>${equip} — today's the day</div>
            </div>`;
    }

    // A weight-scaling week says so about the bodyweight moves it can't scale.
    const hasBw = target && target.weightPct && exList.some(e => !(typeof e.weight === 'number' && e.weight > 0));
    const stats = heroStats({ exercises: exList, lastDuration: rec?.duration || 0, target });
    const statsHTML = stats.map(s => `
        <div class="dash-hero__stat">
            <div class="dash-hero__stat-value">${escapeHtml(s.value)}</div>
            <div class="dash-hero__stat-label">${escapeHtml(s.label)}</div>
        </div>`).join('');

    const when = rec?.date ? formatRelative(rec.date) : '';
    const foot = target
        ? [`${target.label} targets applied`, hasBw ? 'bodyweight moves unchanged' : null, when ? `last done ${when}` : null]
        : [scheduled ? `Usually ${dayName}` : null, when ? `last done ${when}` : null];
    const footText = capitalize(foot.filter(Boolean).join(' · '));

    const startCall = programSession ? `startProgramSession('${startArg}')`
        : programNotice ? `applyProgramWeekAndStart('${startArg}')`
            : `startWorkout('${startArg}')`;
    const coachCall = programNotice ? 'askCoachAboutProgramWeek()' : "bottomNavTo('ai-coach')";

    return `
        <div class="dash-hero dash-rise">
            ${renderHeroHead(week)}
            <div class="dash-hero__eyebrow">Up today · ${weekCountText(week)}</div>
            <div class="dash-hero__title">${escapeHtml(title)}</div>
            ${sub ? `<div class="dash-hero__sub">${escapeHtml(sub)}</div>` : ''}
            ${cautionHook}
            ${prHook}
            <div class="dash-hero__stats">${statsHTML}</div>
            <div class="dash-hero__actions">
                <button class="dash-hero__start" onclick="${startCall}" aria-label="Start ${escapeAttr(name)}">
                    <i class="fas fa-play" aria-hidden="true"></i> Start
                </button>
                <button class="dash-hero__icon-btn" onclick="openQuickStartSheet()" aria-label="Quick start">
                    <i class="fas fa-bolt" aria-hidden="true"></i>
                </button>
                <button class="dash-hero__icon-btn dash-hero__icon-btn--coach" onclick="${coachCall}" aria-label="Ask coach">
                    <i class="fas fa-robot" aria-hidden="true"></i>
                </button>
            </div>
            ${footText ? `<div class="dash-hero__foot">${target ? '<i class="fas fa-flag-checkered" aria-hidden="true"></i>' : ''}${escapeHtml(footText)}</div>` : ''}
        </div>
    `;
}

/**
 * Next up (opens that workout) and My plan (opens the Plan page), two
 * columns; one alone spans both. '' when there's neither.
 */
function renderTodayTiles(next, lastDoneByType) {
    const tiles = [];
    if (next) {
        const t = next.template;
        const name = t.name || t.day;
        const category = (t.category || getWorkoutCategory(name) || 'other').toLowerCase();
        const rec = lastDoneByType[name];
        const meta = [next.day, rec?.date ? `last done ${formatRelative(rec.date)}` : null].filter(Boolean).join(' · ');
        tiles.push(`
            <div class="dash-tile" onclick="editTemplate('${escapeJsArg(t.id)}')" role="button" tabindex="0"
                 aria-label="${escapeAttr(`Next up: ${name}${meta ? `. ${meta}` : ''}`)}">
                <div class="dash-tile__eyebrow">Next up</div>
                <div class="dash-tile__title"><i class="${getCategoryIcon(category)} cat-txt-${category}" aria-hidden="true"></i>${escapeHtml(name)}</div>
                ${meta ? `<div class="dash-tile__meta">${escapeHtml(capitalize(meta))}</div>` : ''}
            </div>`);
    }
    const p = _planCard;
    if (p) {
        const bar = p.segs.length ? `
            <div class="dash-tile__bar" aria-hidden="true">
                ${p.segs.map(s => `<span class="dash-tile__seg${s.current ? ' is-current' : ''}${s.kind === 'lighter' ? ' is-lighter' : ''}"></span>`).join('')}
            </div>` : '';
        tiles.push(`
            <div class="dash-tile" onclick="openBlockPage()" role="button" tabindex="0"
                 aria-label="${escapeAttr(`${p.name}: ${p.title}${p.meta ? `. ${p.meta}` : ''} — open your plan`)}">
                <div class="dash-tile__eyebrow">${escapeHtml(p.name)}</div>
                <div class="dash-tile__title">${escapeHtml(p.title)}</div>
                ${bar}
                ${p.meta ? `<div class="dash-tile__meta">${escapeHtml(capitalize(p.meta))}</div>` : ''}
            </div>`);
    }
    if (!tiles.length) return '';
    return `<div class="dash-tiles${tiles.length === 1 ? ' dash-tiles--one' : ''} dash-rise">${tiles.join('')}</div>`;
}

// Navigate to the workout selector, pre-sorted by how often each template is
// used on the chosen day of week. AppState flag is consumed by workout-session.
export function openWorkoutSelectorForDay(dayName) {
    AppState._workoutSelectorDayFilter = dayName;
    window.bottomNavTo?.('workout');
}

/**
 * "This week" grouped card (V3): the retrospective tail — last session, most
 * recent PR, and the single most actionable progress headline — as three
 * divider rows in ONE card instead of three separately-chromed surfaces.
 * The section-head "Progress →" link replaces the old dash-progress-link row.
 */
function renderThisWeekCard(allWorkouts, recentPRs, excludeKeys, topInsight) {
    const unit = AppState.globalUnit || 'lbs';
    const rows = [];

    // Row 1: last completed session (tap → workout detail in history)
    const last = (allWorkouts || []).find(w => w.completedAt && !w.cancelledAt);
    if (last) {
        const when = formatRelativeDate(last.date, { daysAgo: true, weeksAgo: true });
        const mins = Math.round((last.totalDuration || 0) / 60);
        let volume = 0;
        for (const ex of Object.values(last.exercises || {})) {
            for (const s of ex.sets || []) {
                if (s.reps && s.weight) volume += s.reps * s.weight;
            }
        }
        const parts = [
            `<b>${escapeHtml(last.workoutType || 'Workout')}</b>`,
            when,
            mins > 0 ? formatDuration(last.totalDuration) : null,
            volume > 0 ? `${formatVolume(volume)} ${unitLabel(unit)}` : null,
        ].filter(Boolean).join(' · ');
        rows.push(`
            <div class="row-card row-card--flat dash-week-row" onclick="viewWorkout('${escapeJsArg(last.id)}')" role="button" tabindex="0">
                <i class="fas fa-check dash-week-row__icon dash-week-row__icon--done"></i>
                <div class="dash-week-row__txt">${parts}</div>
                <i class="fas fa-chevron-right dash-chev"></i>
            </div>
        `);
    }

    // Row 2: most recent PR not already celebrated in today's banner
    const pr = (recentPRs || []).filter(p => !excludeKeys || !excludeKeys.has(prKey(p)))[0];
    if (pr) {
        rows.push(`
            <div class="row-card row-card--flat dash-week-row" onclick="showExerciseDetail('${escapeJsArg(pr.exercise)}')" role="button" tabindex="0">
                <i class="fas fa-trophy dash-week-row__icon dash-week-row__icon--gold"></i>
                <div class="dash-week-row__txt"><b>${escapeHtml(pr.exercise)} PR</b> · ${convertWeight(pr.weight, pr.unit || 'lbs', unit)} ${unitLabel(unit)} · ${prMetaLine(pr)}</div>
                <i class="fas fa-chevron-right dash-chev"></i>
            </div>
        `);
    }

    // Row 3: the single most actionable headline — lowest body-part volume vs
    // its weekly target, else the top training insight, else a generic teaser.
    // Tap → Progress page, where the full picture lives.
    //
    // A stalled lift is the one finding the coach can actually act on, so it
    // renders as a coach deep-link chip below the card instead (5.7.4) —
    // dismissible, max one, and once dismissed the stall reverts to being an
    // ordinary headline with no coach ask.
    let headline = 'Volume balance, trends, and all your PRs';
    let headIcon = 'fa-chart-line';
    let coachChip = '';
    try {
        // `new Date(getDateString())` was Invalid Date (getDateString() with
        // no arg returns ''), so weekStartStr was '' and this "this week"
        // count silently summed the ENTIRE history (AP-15a). Same fix as
        // weeklyVolumeByBodyPart below.
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekStartStr = getDateString(weekStart);
        const weekWorkouts = (allWorkouts || []).filter(w => w.date >= weekStartStr && w.completedAt);
        const vol = analyzeWeeklyVolume(weekWorkouts, AppState.exerciseDatabase || []);
        const low = vol.filter(v => v.status === 'low').sort((a, b) => a.weeklySets - b.weeklySets)[0];

        if (topInsight?.type === 'plateau' && topInsight.exerciseName) {
            const sig = `plateau:${topInsight.exerciseName.toLowerCase()}`;
            if (!(AppState.settings?.dismissedCoachChips || []).includes(sig)) {
                const n = topInsight.message.match(/(\d+) sessions/)?.[1];
                coachChip = `
                    <div class="coach-chip" role="button" tabindex="0" onclick="coachChipAsk('${escapeJsArg(topInsight.exerciseName)}')">
                        <i class="fas fa-equals coach-chip__icon"></i>
                        <span class="coach-chip__txt">${escapeHtml(topInsight.exerciseName)} stalled${n ? ` ${n} sessions` : ''} · Ask the coach</span>
                        <button class="coach-chip__dismiss" onclick="coachChipDismiss(event, '${escapeJsArg(sig)}')" aria-label="Dismiss">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }
        }

        // AP-22 — a leading fatigue sign outranks a volume gap: it's the
        // one that says "back off" before the numbers do.
        if (topInsight?.type === 'fatigue' || topInsight?.type === 'readiness') {
            headline = topInsight.message;
            headIcon = topInsight.icon;
        } else if (low) {
            headline = `${capitalize(low.bodyPart)} is low — ${low.weeklySets} set${low.weeklySets === 1 ? '' : 's'} in the last 7 days`;
            headIcon = 'fa-exclamation-triangle';
        } else if (topInsight?.message && !coachChip) {
            headline = topInsight.message;
            headIcon = topInsight.icon || 'fa-lightbulb';
        }
    } catch { /* fall back to the generic headline */ }
    rows.push(`
        <div class="row-card row-card--flat dash-week-row" onclick="showProgressPage()" role="button" tabindex="0">
            <i class="fas ${headIcon} dash-week-row__icon"></i>
            <div class="dash-week-row__txt">${escapeHtml(headline)}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `);

    return `
        <div class="sec-head sec-head--compact"><h3>This week</h3><a onclick="showProgressPage()">Progress →</a></div>
        <div class="dash-week-card">${rows.join('')}</div>
        ${coachChip}
    `;
}

// ===================================================================
// MAIN LIFTS SCOREBOARD (AP-21) — "am I progressing?" in one glance
// ===================================================================

const SB_TREND_LABEL = {
    up: 'Up', down: 'Down', flat: 'Holding', new: 'New this month', idle: 'Not trained in 4 weeks',
};
const SB_PATTERN_CHIP = { under: 'low', 'in-range': 'good', over: 'high', recovery: 'muted' };
const LIFT_TONE_COLOR = {
    up: 'var(--success)', stuck: 'var(--warning)', down: 'var(--danger)', flat: 'var(--text-muted)', new: 'var(--primary)',
};

/**
 * Best estimated 1RM per main lift, this 4-week window vs the one before
 * (progress-scoreboard.js — the coach and the weekly review quote the same
 * object), as tiles (HOME.md): the first lift spans both columns; each shows
 * its estimated max, the 4-week change (or Stuck, from the stall ladder) and
 * a six-week sparkline. Placed under For Today: the hero stays the page's one
 * primary action; this is the answer to "is it working?".
 */
function renderScoreboardCard(allWorkouts) {
    const unit = AppState.globalUnit || 'lbs';
    const today = AppState.getTodayDateString();
    let sb;
    try {
        const plates = unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
        const templates = (AppState.templates && AppState.templates.length) ? AppState.templates : (AppState.workoutPlans || []);
        sb = buildScoreboard({
            workouts: allWorkouts,
            templates,
            unit,
            today,
            config: { patternTarget: Config.PATTERN_TARGET_SETS, mrv: Config.VOLUME_MRV, increment: weightIncrement(unit, plates) },
            library: AppState.exerciseDatabase || [],
        });
    } catch (e) {
        debugLog('scoreboard failed', e);
        return '';
    }

    const trended = sb.primaries.filter(p => p.trend === 'up' || p.trend === 'flat' || p.trend === 'down');
    const up = trended.filter(p => p.trend === 'up').length;
    const meta = trended.length
        ? `<span class="sec-head__meta dash-lifts__meta"><span data-count-to="${up}">${up}</span> of ${trended.length} up · 4 weeks</span>`
        : '';
    const head = `
        <div class="sec-head sec-head--compact dash-lifts__head">
            <h3>Main lifts</h3>
            ${meta}
            <a onclick="openPrimaryLiftsSheet()">Edit</a>
        </div>`;

    if (!sb.primaries.length) {
        return `<div class="dash-lifts dash-rise">${head}
            <div class="dash-week-card">
                <div class="sb-card__empty">
                    <b>No main-lift trend yet</b>
                    Log your compound lifts for a few weeks and the 4-week trend shows up here.
                </div>
            </div></div>`;
    }

    // The "N of M up" count rides the head; a warning headline (a lift down
    // two windows running, a pattern under target) or "still building" says
    // itself under it.
    const note = sb.headlineKind !== 'up' && sb.headline
        ? `<div class="dash-lifts__note dash-lifts__note--${sb.headlineKind}">${escapeHtml(sb.headline)}</div>`
        : '';

    const tiles = sb.primaries.map((p, i) => {
        const trend = p.trend || 'idle';
        const badge = liftBadge(p);
        const value = p.e1rmNow ?? p.e1rmPrev;
        const valueStr = value != null ? `${value} ${unitLabel(unit)}` : '—';
        const wide = i === 0;
        const series = weeklyE1rmSeries(allWorkouts, p, unit, today, 6);
        const spark = series.length >= 2
            ? chartSparkline({
                points: series.map((y, x) => ({ x, y })), color: LIFT_TONE_COLOR[badge.tone],
                width: wide ? 120 : 52, height: 20, strokeWidth: 1.75, dot: true,
            })
            : '';
        const hint = p.rung > 0
            ? capitalize(describeStuck({ rung: p.rung }).split(' — ').pop())
            // AP-22 — effort climbing at the same load: a leading fatigue sign.
            : (p.fatigue ? 'Effort rising at the same weight' : '');
        const repPR = p.repPR
            ? `<div class="dash-lift__rep">Rep PR ${formatSet({ reps: p.repPR.reps, weight: p.repPR.weight, originalUnit: unit }, unit, { effort: false })}</div>`
            : '';
        const valueHTML = value != null
            ? `<span data-count-to="${value}" data-count-dec="${value % 1 ? 1 : 0}">${value}</span><span class="dash-lift__unit">${unitLabel(unit)}</span>`
            : '—';
        return `
            <div class="dash-lift${wide ? ' dash-lift--wide' : ''}${p.rung > 0 ? ' dash-lift--stuck' : ''}" onclick="showExerciseDetail('${escapeJsArg(p.name)}')" role="button" tabindex="0"
                 aria-label="${escapeAttr(`${p.name}: ${p.rung > 0 ? 'Stuck' : SB_TREND_LABEL[trend]}, estimated max ${valueStr}`)}">
                <div class="dash-lift__top">
                    <span class="dash-lift__name">${escapeHtml(p.name)}</span>
                    <span class="dash-lift__badge dash-lift__badge--${badge.tone}">${badge.text}</span>
                </div>
                <div class="dash-lift__bottom">
                    <span class="dash-lift__value">${valueHTML}</span>
                    ${spark}
                </div>
                ${hint ? `<div class="dash-lift__hint">${escapeHtml(hint)}</div>` : ''}
                ${repPR}
            </div>`;
    }).join('');

    const patterns = sb.patterns.map(pt => `
        <span class="vol-badge vol-badge--${SB_PATTERN_CHIP[pt.status] || 'muted'}"
              aria-label="${escapeAttr(`${pt.label}: ${pt.setsThisWeek} sets in the last 7 days`)}">${escapeHtml(pt.label)} ${pt.setsThisWeek}</span>`).join('');

    const debug = Config.DEBUG_MODE
        ? `<div class="sb-card__debug">now ${sb.window.from}→${sb.window.to} · prev ${sb.window.prevFrom}→${sb.window.prevTo}</div>`
        : '';

    return `
        <div class="dash-lifts dash-rise">
            ${head}
            ${note}
            <div class="dash-lifts__grid">${tiles}</div>
            <div class="sb-patterns" aria-label="Sets per movement pattern, last 7 days">${patterns}</div>
            ${debug}
        </div>`;
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
        ? `<div class="bp-cell__sub ${pd < 0 ? 'down' : ''}">${pd > 0 ? '↑' : '↓'} ${Math.abs(pd)} ${unitLabel(unit)}</div>`
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
                    <div class="bp-cell__val">${hv ? formatSet({ reps: hv.reps, weight: hv.weight, originalUnit: unit }, unit, { effort: false }) : '—'}</div>
                    ${peakDeltaHtml}
                </div>
                <div class="bp-cell">
                    <div class="bp-cell__label">Volume · wk</div>
                    <div class="bp-cell__val">${formatVolume(s.volume)}<span class="bp-cell__unit"> ${unitLabel(unit)}</span></div>
                    ${s.volumeDeltaPct != null ? `<div class="bp-cell__sub ${s.volumeDeltaPct < 0 ? 'down' : ''}">${s.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(s.volumeDeltaPct).toFixed(0)}%</div>` : ''}
                </div>
            </div>
            ${s.isStale
                ? `<div class="stale-warn">⚠ ${s.lastTrained?.date ? `Last trained ${formatRelative(s.lastTrained.date)}` : 'Not trained recently'}</div>`
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
        return `<span class="vol-badge vol-badge--low">Low · ${sets} set${sets === 1 ? '' : 's'}</span>`;
    }
    if (sets > Config.VOLUME_MRV) {
        return `<span class="vol-badge vol-badge--high">High · ${sets} sets</span>`;
    }
    return `<span class="vol-badge vol-badge--good">On target</span>`;
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
// BODY CARD — weight + composition merged into one surface (V3)
// ===================================================================

function renderBodyCard(bwData, dexaHistory = []) {
    // PF-2 — one two-scan read (newest first) instead of "latest" then the
    // whole history for index 1.
    const scan = dexaHistory?.[0] || null;
    const prevScan = dexaHistory?.[1] || null;

    // Field on the scan doc is `totalLeanMass`, not `muscleMass` — see
    // composition-detail-ui for the original donut bug this guards against.
    const hasDexa = scan && (scan.totalBodyFat != null || scan.totalLeanMass != null);
    const hasBw = bwData != null;
    if (!hasDexa && !hasBw) return renderConnectPrompt();

    // --- Weight block ---
    let weightHtml = '';
    if (hasBw) {
        const source = bwData.latest.source === 'withings' ? '<span class="bw-badge">Withings</span>' : '';
        const weightStr = bwData.latest.displayWeight.toFixed(1);
        const deltaDirClass = getBwDeltaDirectionClass(bwData.delta);
        const deltaStr = bwData.delta != null
            ? `<span class="bw-delta ${deltaDirClass}">${bwData.delta < 0 ? '↓' : '↑'} ${Math.abs(bwData.delta).toFixed(1)} · 30 days</span>`
            : '';

        // Sparkline over the last 30 days, matching the delta caption. Muted
        // stroke on purpose — the hero owns the page's accent color.
        let sparkHtml = '';
        if (bwData.entries && bwData.entries.length > 2) {
            const thirtyAgo = new Date();
            thirtyAgo.setDate(thirtyAgo.getDate() - 30);
            const thirtyStr = getDateString(thirtyAgo);
            let recent = bwData.entries.filter(e => e.date >= thirtyStr);
            if (recent.length < 2) recent = bwData.entries.slice(-8); // fallback: last few
            const points = recent.map((e, i) => ({ x: i, y: e.displayWeight }));
            sparkHtml = `<div class="bw-spark">${chartSparkline({ points, color: 'var(--text-very-muted)', width: 280, height: 26 })}</div>`;
        }

        weightHtml = `
            <div class="dash-body-card__weight">
                <span class="bw-card-value">${weightStr} <span class="bw-card-unit">${unitLabel(bwData.unit)}</span></span>
                ${deltaStr}
                ${source}
            </div>
            ${sparkHtml}
        `;
    }

    // --- Composition line (one quiet row; the donut lives in the detail page) ---
    let compHtml = '';
    if (hasDexa) {
        const fatPct = Math.round(scan.totalBodyFat || 0);
        const leanPct = scan.totalLeanMass && scan.totalWeight
            ? Math.round(scan.totalLeanMass / scan.totalWeight * 100)
            : 0;

        const dexaAgo = scan.date ? formatRelative(scan.date) : '';

        let muscleDelta = '';
        const prevLean = prevScan?.totalLeanMass;
        if (prevLean != null && scan.totalLeanMass != null) {
            const d = scan.totalLeanMass - prevLean;
            // Prefer the scan's own unit; fall back to user's display unit
            // rather than hardcoding 'lb' so kg-mode users don't see "Lean
            // ↑ 1.5 lb" when their scan was in kg.
            const unit = scan.massUnit || AppState.globalUnit || 'lbs';
            muscleDelta = ` · Lean ${d >= 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)} ${unitLabel(unit)}`;
        }

        const parts = [
            leanPct ? `Lean ${leanPct}%` : null,
            `Fat ${fatPct}%`,
            dexaAgo ? `DEXA ${dexaAgo}` : null,
        ].filter(Boolean).join(' · ');
        // The composition line keeps its own tap → composition page, even
        // though the card's weight tap now goes to the weight-first detail.
        compHtml = `<div class="dash-body-card__comp${hasBw ? ' dash-body-card__comp--split' : ''}" onclick="event.stopPropagation(); showCompositionDetail()">${parts}${muscleDelta}</div>`;
    }

    // Owner call: tapping your weight must never land on a DEXA-led view.
    // With a weight logged, the card tap opens the weight-first detail page;
    // the composition line and the Details link still open the composition page.
    return `
        <div class="sec-head sec-head--compact"><h3>Body</h3><a onclick="showCompositionDetail()">Details →</a></div>
        <div class="dash-body-card" onclick="${hasBw ? "openMetricDetail('body-weight')" : 'showCompositionDetail()'}" role="button" tabindex="0">
            ${weightHtml}
            ${compHtml}
        </div>
    `;
}

function renderConnectPrompt() {
    return `
        <div class="sec-head sec-head--compact">
            <h3>Body</h3>
        </div>
        <div class="connect-card" onclick="showCompositionDetail()">
            <i class="fas fa-circle-nodes"></i>
            <div class="connect-card__info">
                <div class="connect-card__title">Track body composition</div>
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
        ? `New PR — ${escapeHtml(first.exercise)} · ${formatSet({ reps: first.reps, weight: first.weight, originalUnit: first.unit || 'lbs' }, AppState.globalUnit || 'lbs', { effort: false })}`
        : `${todays.length} new PRs today!`;

    // With multiple PRs, opening an overlay listing all of them beats a
    // single-exercise drill-down that hides the other winners (the 7/2
    // report: "shows 2 PRs today but tapping only shows one exercise").
    const onclick = todays.length === 1
        ? `showExerciseDetail('${escapeJsArg(first.exercise)}')`
        : `showTodaysPRs()`;

    return `
        <div class="dash-pr-banner" onclick="${onclick}">
            <div class="dash-pr-banner__badge"><i class="fas fa-trophy"></i></div>
            <div class="dash-pr-banner__text">${label}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </div>
    `;
}

// Same element id the old overlay had, so any lookup by id still finds it.
const TODAYS_PRS_SHEET_ID = 'dash-todays-prs-overlay';

/**
 * Open a sheet listing every PR the user hit today, each row tappable to
 * drill into that exercise's detail. Built dynamically so we don't need a
 * dedicated modal element in index.html; the sheet primitive owns teardown
 * (backdrop, Close, Escape, swipe-down) and focus restore.
 */
export function showTodaysPRs() {
    const today = AppState.getTodayDateString();
    // Use the imported PRTracker, not window.PRTracker — window assignment
    // happens post-init and can be racy on first render (was: banner tap
    // silently no-op'd because window.PRTracker was undefined).
    const recentPRs = PRTracker.getRecentPRs(30) || [];
    const todays = recentPRs.filter(pr => pr.date === today);
    if (todays.length === 0) return;

    const unit = AppState.globalUnit || 'lbs';
    const rows = todays.map(pr => `
        <button type="button" class="row-card row-card--flat dash-todays-prs__row" data-exercise="${escapeAttr(pr.exercise)}">
            <div class="dash-todays-prs__badge"><i class="fas fa-trophy"></i></div>
            <div class="dash-todays-prs__info">
                <div class="dash-todays-prs__name">${escapeHtml(pr.exercise)}</div>
                <div class="dash-todays-prs__meta">${pr.reps} reps</div>
            </div>
            <div class="dash-todays-prs__val">${convertWeight(pr.weight, pr.unit || 'lbs', unit)} ${unitLabel(unit)}</div>
            <i class="fas fa-chevron-right dash-chev"></i>
        </button>
    `).join('');

    // SH-3b — a list you tap through, so it renders through the sheet
    // primitive (backdrop, Escape, swipe-down, page lock, inert, focus).
    // Re-opening replaces it in place.
    const { body } = openSheet({
        id: TODAYS_PRS_SHEET_ID,
        className: 'dash-todays-prs-sheet',
        title: "Today's PRs",
        bodyHTML: `<div class="dash-todays-prs__list">${rows}</div>`,
        actions: [{ label: 'Close', onClick: 'closeTodaysPRs()' }],
    });

    // The primitive ignores backdrop taps in the first 300 ms (iOS phantom click).
    body.addEventListener('click', (e) => {
        const row = e.target.closest('.dash-todays-prs__row');
        if (!row) return;
        const ex = row.dataset.exercise;
        closeTodaysPRs();
        if (ex && typeof window.showExerciseDetail === 'function') {
            window.showExerciseDetail(ex);
        }
    });
}

export function closeTodaysPRs() {
    closeSheet(TODAYS_PRS_SHEET_ID);
}
if (typeof window !== 'undefined') window.closeTodaysPRs = closeTodaysPRs;
if (typeof window !== 'undefined') window.dashEnablePlan = dashEnablePlan;

// Equipment is stored as "Brand [Line] — Function". On a PR row the function
// duplicates the exercise name shown right above it (e.g. equipment "MegaMass —
// 45 Degree Linear Row" under the exercise *45 Degree Linear Row*), so keep
// just the brand/line prefix before the em dash.
function equipShortName(name) {
    if (!name) return '';
    return name.split(' — ')[0].trim() || name;
}

/**
 * PR meta line: "3 days ago · 6 reps · Hammer Strength". The machine is named
 * (PRTracker segments PRs per equipment, so a PR belongs to a specific
 * machine) unless it's the "Unknown Equipment" fallback (UX-1).
 */
function prMetaLine(pr) {
    const parts = [formatRelativeDate(pr.date, { daysAgo: true }), `${pr.reps} reps`];
    if (pr.equipment && pr.equipment !== 'Unknown Equipment') {  // copy-ok: stored fallback key — matched against saved data
        parts.push(escapeHtml(equipShortName(pr.equipment)));
    }
    return parts.join(' · ');
}

/** Stable key for a PR (exercise + equipment) — used to de-dup surfaces. */
function prKey(pr) {
    return `${pr.exercise}|${pr.equipment || ''}`;
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

/**
 * Conditioning line (July decision). Hidden for anyone who has never logged
 * cardio — a pure lifter shouldn't get a nag row.
 */
export function renderConditioningLine(c) {
    if (!c || !c.lastDate) return '';
    const n = c.sessions;
    let title = n === 0
        ? 'No cardio in the last 7 days'
        : `${n} ${n === 1 ? 'session' : 'sessions'} in the last 7 days`;
    if (n > 0 && c.minutesComplete && c.minutes > 0) title += ` · ${formatDuration(c.minutes * 60)}`;
    const sub = n === 0 ? `Last cardio: ${formatRelativeDate(c.lastDate)}` : '';
    return `
        <div class="row-card row-card--static progress-conditioning">
            <div class="row-card__icon progress-conditioning__icon"><i class="fas fa-heart-pulse"></i></div>
            <div class="row-card__content">
                <div class="row-card__title">Conditioning</div>
                <div class="row-card__subtitle">${escapeHtml(title)}</div>
                ${sub ? `<div class="row-card__detail">${escapeHtml(sub)}</div>` : ''}
            </div>
        </div>
    `;
}

function renderVolumeTrend(series) {
    if (!series.some(p => p.y > 0)) return '';
    const maxY = Math.max(...series.map(p => p.y));
    return `
        <div class="sec-head sec-head--compact sec-head--tight">
            <h3>Weekly volume</h3>
            <span class="sec-head__meta">Last ${series.length} weeks</span>
        </div>
        <div class="progress-card">
            <div class="progress-chart">${chartLine({
                points: series, width: 320, height: 120, color: 'var(--primary)', fill: true,
                ariaLabel: `Weekly training volume over the last ${series.length} weeks`,
                axes: { yMax: formatVolume(maxY), yMin: '0', xStart: `${series.length}w ago`, xEnd: 'Now' },  // copy-ok: the axis's span, not when something happened
            })}</div>
        </div>
    `;
}

function renderPRTable(prs) {
    if (!prs || prs.length === 0) {
        return `
            <div class="sec-head sec-head--compact sec-head--tight"><h3>Personal records</h3></div>
            <div class="progress-empty">No PRs yet. Beat a previous set and it'll show up here.</div>
        `;
    }
    return `
        <div class="sec-head sec-head--compact sec-head--tight"><h3>Personal records</h3></div>
        ${prs.map(pr => `
            <div class="row-card pr-row" onclick="showExerciseDetail('${escapeJsArg(pr.exercise)}')">
                <div class="pr-badge"><i class="fas fa-trophy"></i></div>
                <div class="pr-info">
                    <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                    <div class="pr-meta">${prMetaLine(pr)}</div>
                </div>
                <div class="pr-val">${convertWeight(pr.weight, pr.unit || 'lbs', AppState.globalUnit)} ${unitLabel(AppState.globalUnit)}</div>
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
    const conditioning = aggregateConditioning(allWorkouts, getRangeBounds('W'));

    container.innerHTML = `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
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
                <div class="row-card" onclick="openGoalsPage()">
                    <div class="row-card__icon"><i class="fas fa-bullseye"></i></div>
                    <div class="row-card__content">
                        <div class="row-card__title">Goals</div>
                        <div class="row-card__subtitle">Where you are against each one</div>
                    </div>
                    <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
                </div>
                <div class="row-card" onclick="openReportCard()">
                    <div class="row-card__icon"><i class="fas fa-clipboard-check"></i></div>
                    <div class="row-card__content">
                        <div class="row-card__title">Report card</div>
                        <div class="row-card__subtitle">Your week in one page, every Sunday night</div>
                    </div>
                    <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
                </div>
                ${renderVolumeTrend(series)}
                <div class="sec-head sec-head--compact sec-head--tight">
                    <h3>Training balance</h3>
                    <span class="sec-head__meta">sets/wk vs target</span>
                </div>
                ${stats.map(s => renderBodyPartCard(s, volumeByPart)).join('')}
                ${renderConditioningLine(conditioning)}
                ${renderPRTable(prs)}
            </div>
        </div>
    `;
}

// PF-3 — data changed behind the page (another device's workout landed in the
// background refresh, a Withings sync wrote weigh-ins): repaint in place if
// the dashboard is what's on screen.
if (typeof window !== 'undefined') {
    window.addEventListener('bigsurf:data-changed', () => {
        const section = document.getElementById('dashboard');
        if (section && !section.classList.contains('hidden')) renderDashboard();
    });
}

/** TP-2 — Sunday / Monday: this week's report card, one row under For Today. */
async function reportCardEntry() {
    try {
        const { reportCardEntryHTML } = await import('./report-card-ui.js');
        return await reportCardEntryHTML();
    } catch {
        return '';
    }
}

// ===================================================================
// EXPORTED FUNCTIONS (window-bound in main.js)
// ===================================================================

export function resumeActiveWorkout() {
    stopPillTimer();
    if (window.continueInProgressWorkout) {
        window.continueInProgressWorkout();
    } else {
        window.bottomNavTo?.('workout');
    }
}

export async function confirmCancelActiveWorkout() {
    // cancelWorkout() owns the confirm and its one sentence (UD-2).
    const cancelled = await window.cancelWorkout?.();
    if (!cancelled) return;
    stopPillTimer();
    document.getElementById('active-workout-pill')?.remove();
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


// Pull-to-refresh (owner's gym bug log): re-pull plan/program/workout caches.
import('../utils/pull-to-refresh.js').then(({ registerPullToRefresh }) => {
    registerPullToRefresh(
        () => {
            const section = document.getElementById('dashboard');
            return !!section && !section.classList.contains('hidden');
        },
        async () => {
            AppState._weekPlan = undefined;
            AppState._activeProgram = undefined;
            await import('../features/plan.js').then(m => m.clearPlanCache()).catch(() => {});
            const { clearAllWorkoutsCache } = await import('../data/data-manager.js');
            clearAllWorkoutsCache();
            await renderDashboard();
        }
    );
}).catch(() => { /* non-critical enhancement */ });
