// Settings UI Module - core/ui/settings-ui.js
// User-configurable settings with Firestore persistence

import { AppState } from '../utils/app-state.js';
import { Config, APP_VERSION } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr, formatHeight, parseHeightToCm } from './ui-helpers.js';
import { confirmSheet, promptSheet } from './confirm-sheet.js';
import { openSheet, closeSheet } from './sheet.js';
import { navigateTo, navigateBack } from './navigation.js';
import { db, doc, setDoc, getDoc } from '../data/firebase-config.js';
import { confirmDeleteAccount } from './delete-account.js';
import { exportWorkoutData } from '../data/data-manager.js';
import { isManualDeloadActive, manualDeloadEnd, MANUAL_DELOAD_WEIGHT_PCT, weekOverrideOf } from '../features/session-intent.js';
import { pickPrimaries, applyPrimaryChoice, PATTERN_LABELS } from '../features/progress-scoreboard.js';
import { inferPattern } from '../features/movement-patterns.js';
import { isFCMAvailable, getPushSubscription, initializeFCM, scheduleRestNotification } from '../utils/push-notification-manager.js';

// Default settings — merged with user overrides on load
const DEFAULT_SETTINGS = {
    // Workout
    weightUnit: 'lbs',
    restTimerDuration: 90,
    restTimerAutoStart: true,
    restTimerVibration: true,
    restTimerSound: false,
    // Log RPE (rate of perceived exertion, 6–10) on the heaviest set. Off by
    // default so casual users aren't taxed; opt-in shows one chip row per exercise.
    trackRpe: false,
    // Manual deload week (AP-10) — { from: 'YYYY-MM-DD', weeks: 1, weightPct: -30 }
    // or null. Expires by its date window; no cleanup job. A program's own
    // week target wins when both exist (session-intent.js).
    manualDeload: null,
    // AP-23b — the generalized week override that replaced manualDeload:
    // { from, weeks, weightPct?, setDelta?, label?, reason? } or null. Set by
    // this page's Deload toggle or the coach's "lighter this week" card;
    // beats the program's week for its window (session-intent.js).
    weekOverride: null,
    // Active-workout autofill hint ("Pre-filled from last session…") is shown
    // once per user, ever — flipped true the first time it renders.
    autofillHintSeen: false,

    // Goals
    weeklyGoal: 5,
    // 'lose' | 'gain' | 'maintain' | null (neutral). Controls body-weight delta color
    // on the dashboard hero chip. Null = color-neutral (no assumed direction).
    weightGoal: null,
    // Target body weight in the user's preferred unit (lbs or kg, matching weightUnit).
    // Used for the goal line on the body-weight detail chart + hero "Goal" stat.
    bodyWeightGoal: null,

    // Plate Calculator
    plateLbs: [45, 35, 25, 10, 5, 2.5],
    plateKg: [20, 15, 10, 5, 2.5, 1.25],
    plateBarLbs: 45,
    plateBarKg: 20,

    // AI coach profile — grounds the coach's answers in who it's talking to.
    // Experience deliberately reuses profileExperience (one source of truth).
    coachGoal: null,      // 'cut' | 'bulk' | 'recomp' | 'strength' | 'general' | null
    coachInjuries: null,  // free text — safety-critical, the coach must program around it
    coachNotes: null,     // free text — schedule constraints, preferences
    weeklyCoachReview: true, // Monday digest push + review doc (server checks this)
    reportCard: false,       // TP-2 — Sunday 19:30 report card instead of the Monday digest (server checks this)
    timeZone: null,          // TP-2 — IANA zone for the Sunday schedule; null = America/Chicago
    liveCoachTts: false, // live coach reads answers aloud (Phase 10)

    // Profile (user can override Firebase auth displayName; other fields are opt-in)
    profileName: null,       // override display name; null = use Firebase auth
    profileHeightCm: null,   // number (cm); convert display per unit pref
    profileBirthday: null,   // YYYY-MM-DD
    profileExperience: null, // 'beginner' | 'intermediate' | 'advanced'

    // Dashboard / drill-down time range (W/M/3M/6M/Y/All). One canonical range
    // shared by the dashboard hero and every drill-down; persisted so the pick
    // survives reloads. Matches DEFAULT_RANGE in range-filter.js.
    dashboardRange: 'M',

    // Meta
    hasCompletedOnboarding: false,
    seenTips: [],
    // How many times the freestyle "Save as workout" completion banner was
    // dismissed. After a few, the ask shrinks to a quiet one-line link — the
    // freestyler persona never converts, and a full banner forever reads as
    // the app insisting he's using it wrong. Never disappears entirely.
    freestyleSaveDismissals: 0,
    // Dismissed coach insight-chip signatures (e.g. 'plateau:bench press') —
    // dismissal is final per finding; capped at 20 in coachChipDismiss.
    dismissedCoachChips: [],
    // CP-7 line-gap answers (`${gym}|${catalogMachineId}`) — yes/no/not sure
    // are all final for that machine at that gym; capped at 200.
    lineGapAnswers: [],

    // Migration flags (set true after one-time migrations have run).
    // Not user-configurable — checked by app-initialization.js on login.
    equipmentMigrationV2: false,
    equipmentMigrationV3: false,
};

let saveTimeout = null;

// Single source of truth for the experience level picker — used both by
// onboarding step 2 and the Profile detail editor (showExperiencePicker).
// Keep labels / descriptions / icons in sync across both surfaces.
const EXPERIENCE_OPTIONS = [
    { value: 'beginner',     label: 'Beginner',     desc: '< 1 year consistent training', icon: 'fa-seedling' },
    { value: 'intermediate', label: 'Intermediate', desc: '1–3 years training',           icon: 'fa-fire' },
    { value: 'advanced',     label: 'Advanced',     desc: '3+ years, know your lifts',    icon: 'fa-bolt' },
];

/**
 * Load user settings from Firestore and merge with defaults.
 * Called once on app initialization after auth.
 */
export async function loadUserSettings() {
    if (!AppState.currentUser) return;

    try {
        const settingsDoc = await getDoc(doc(db, 'users', AppState.currentUser.uid, 'preferences', 'settings'));
        const userSettings = settingsDoc.exists() ? settingsDoc.data() : {};

        // Merge: user overrides take precedence, defaults fill gaps
        AppState.settings = { ...DEFAULT_SETTINGS, ...userSettings };

        // Apply to runtime config
        applySettingsToConfig();
    } catch (error) {
        console.error('❌ Error loading settings:', error);
        AppState.settings = { ...DEFAULT_SETTINGS };
    }
}

/**
 * Apply loaded settings to the runtime Config object.
 */
function applySettingsToConfig() {
    const s = AppState.settings;
    if (s.restTimerDuration) Config.DEFAULT_REST_TIMER_SECONDS = s.restTimerDuration;
    if (s.weightUnit) AppState.globalUnit = s.weightUnit;
    if (s.weeklyGoal) Config.WEEKLY_GOAL = s.weeklyGoal;
    // Seed the shared range from the persisted pick so dashboard + drill-downs
    // open on the user's last-used range instead of the cold-start default.
    if (s.dashboardRange) AppState.dashboardRange = s.dashboardRange;
}

/**
 * Update a single setting. Saves immediately (debounced).
 */
export function updateSetting(key, value) {
    if (!AppState.settings) AppState.settings = { ...DEFAULT_SETTINGS };
    AppState.settings[key] = value;
    applySettingsToConfig();
    debouncedSaveSettings();
}

/**
 * Debounced save to Firestore (500ms).
 */
function debouncedSaveSettings() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (!AppState.currentUser) return;
        try {
            await setDoc(
                doc(db, 'users', AppState.currentUser.uid, 'preferences', 'settings'),
                AppState.settings
            );
        } catch (error) {
            console.error('❌ Error saving settings:', error);
        }
    }, 500);
}

/**
 * Helper: build a segmented control HTML string.
 * @param {string} settingKey - The setting to update
 * @param {Array<{value:*, label:string}>} options
 * @param {*} currentValue
 * @param {string} [parseType] - 'int' to parseInt the value
 */
function segmented(settingKey, options, currentValue, parseType) {
    return `<div class="segmented">${options.map(o =>
        `<button class="${o.value === currentValue ? 'active' : ''}" data-val="${o.value}"
            onclick="updateSetting('${settingKey}', ${parseType === 'int' ? o.value : `'${o.value}'`}); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${escapeHtml(o.label)}</button>`
    ).join('')}</div>`;
}

/** "Deload week" settings row (AP-10). */
function manualDeloadRowHTML(s) {
    const today = AppState.getTodayDateString();
    const override = weekOverrideOf(s);
    const on = isManualDeloadActive(override, today);
    return `
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-feather"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Lighter week</div>
                        <div class="srow-desc" id="manual-deload-desc">${escapeHtml(manualDeloadDesc(override, on))}</div>
                    </div>
                    <button class="toggle ${on ? 'on' : ''}" onclick="toggleManualDeload(this)" aria-label="Lighter week" aria-pressed="${on}"></button>
                </div>`;
}

function manualDeloadDesc(override, on) {
    if (!on) return `${Math.abs(MANUAL_DELOAD_WEIGHT_PCT)}% lighter for one week — no program needed`;
    const end = manualDeloadEnd(override);
    const endLabel = end ? new Date(`${end}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const levers = [];
    if (typeof override.weightPct === 'number') levers.push(`${Math.abs(override.weightPct)}% ${override.weightPct < 0 ? 'lighter' : 'heavier'}`);
    if (typeof override.setDelta === 'number' && override.setDelta) levers.push(`${override.setDelta > 0 ? '+' : ''}${override.setDelta} set${Math.abs(override.setDelta) === 1 ? '' : 's'}`);
    if (!levers.length) levers.push(`${Math.abs(MANUAL_DELOAD_WEIGHT_PCT)}% lighter`);
    return `${override.label || 'Deload'} on through ${endLabel} · ${levers.join(' · ')}`;
}

/** Toggle the manual deload week; the next workouts start lighter. */
export function toggleManualDeload(btn) {
    const turnOn = !btn?.classList.contains('on');
    const value = turnOn
        ? { from: AppState.getTodayDateString(), weeks: 1, weightPct: MANUAL_DELOAD_WEIGHT_PCT, label: 'Deload' }
        : null;
    updateSetting('weekOverride', value);
    // The legacy field must not resurrect a window this toggle turned off.
    if (AppState.settings?.manualDeload) updateSetting('manualDeload', null);
    btn?.classList.toggle('on', turnOn);
    btn?.setAttribute('aria-pressed', String(turnOn));
    const desc = document.getElementById('manual-deload-desc');
    if (desc) desc.textContent = manualDeloadDesc(value, turnOn);
    showNotification(turnOn ? 'Lighter week on — workouts you start this week begin lighter' : 'Lighter week off', 'success', 2500);
}

/**
 * Helper: build a toggle button HTML string.
 */
function toggleBtn(settingKey, isOn) {
    return `<button class="toggle ${isOn ? 'on' : ''}" onclick="this.classList.toggle('on'); updateSetting('${settingKey}', this.classList.contains('on'));"></button>`;
}

/**
 * Render the settings page into #settings-content.
 */
/**
 * Passive trust-level indicator (Phase 9): auto mode is toggled through the
 * coach, but checking which mode you're in shouldn't need a chat round trip.
 */
function programTrustDesc() {
    const p = AppState._activeProgram;
    if (p === undefined) return 'Checking…';
    if (!p) return 'No active program — ask the coach to build one';
    const auto = (p.trustLevel || 'propose') === 'auto_confirm';
    return `${p.name || 'Program'} — ${auto ? 'auto mode on, Start confirms each session' : 'propose-only, the coach suggests and you tap'}`;
}

export function renderSettings() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const s = AppState.settings || DEFAULT_SETTINGS;
    const user = AppState.currentUser;
    const displayName = user?.displayName || 'User';
    const email = user?.email || '';
    const photoURL = user?.photoURL || '';

    container.innerHTML = `
        <div class="settings-page">

            <!-- Profile card -->
            <div class="profile-card" onclick="openProfile()">
                <div class="profile-avatar">
                    ${photoURL ? `<img src="${escapeAttr(photoURL)}" alt="">` : ''}
                </div>
                <div class="profile-info">
                    <div class="profile-name">${escapeHtml(displayName)}</div>
                    <div class="profile-email">${escapeHtml(email)}</div>
                </div>
                <i class="fas fa-chevron-right profile-card__chev"></i>
            </div>

            <!-- Preferences -->
            <div class="group-label">Preferences</div>
            <div class="group">
                <div class="srow">
                    <div class="srow-icon ic-blue"><i class="fas fa-weight-hanging"></i></div>
                    <div class="srow-info"><div class="srow-name">Weight unit</div></div>
                    ${segmented('weightUnit', [
                        { value: 'lbs', label: 'lb' },
                        { value: 'kg', label: 'kg' },
                    ], s.weightUnit)}
                </div>
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-stopwatch"></i></div>
                    <div class="srow-info"><div class="srow-name">Rest timer</div></div>
                    ${segmented('restTimerDuration', [
                        { value: 60, label: '60s' },
                        { value: 90, label: '90s' },
                        { value: 120, label: '120s' },
                    ], s.restTimerDuration, 'int')}
                </div>
                <div class="srow">
                    <div class="srow-icon ic-warm"><i class="fas fa-bullseye"></i></div>
                    <div class="srow-info"><div class="srow-name">Weekly goal</div></div>
                    ${segmented('weeklyGoal', [
                        { value: 3, label: '3' },
                        { value: 4, label: '4' },
                        { value: 5, label: '5' },
                        { value: 6, label: '6' },
                    ], s.weeklyGoal, 'int')}
                </div>
                <div class="srow srow--stacked">
                    <div class="srow-head">
                        <div class="srow-icon ic-primary"><i class="fas fa-weight"></i></div>
                        <div class="srow-info">
                            <div class="srow-name">Body weight goal</div>
                            <div class="srow-desc">Tints the delta on your dashboard</div>
                        </div>
                    </div>
                    ${segmented('weightGoal', [
                        { value: '', label: 'Off' },
                        { value: 'lose', label: 'Lose' },
                        { value: 'maintain', label: 'Keep' },
                        { value: 'gain', label: 'Gain' },
                    ], s.weightGoal || '', 'string')}
                </div>
                <div class="srow srow--clickable" onclick="editBodyWeightGoal()">
                    <div class="srow-icon ic-warm"><i class="fas fa-bullseye"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Target weight</div>
                        <div class="srow-desc">Shown as a goal line on your weight chart</div>
                    </div>
                    <div class="srow-right">
                        <span class="srow-value">${s.bodyWeightGoal != null
                            ? `${s.bodyWeightGoal} ${s.weightUnit === 'kg' ? 'kg' : 'lb'}`
                            : 'Not set'}</span>
                        <i class="fas fa-chevron-right srow-chev"></i>
                    </div>
                </div>
                <div class="srow srow--clickable" onclick="restartOnboarding()">
                    <div class="srow-icon ic-muted"><i class="fas fa-flag-checkered"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Re-run onboarding</div>
                        <div class="srow-desc">Revisit the setup questions to update your answers</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
            </div>

            <!-- Training -->
            <div class="group-label">Training</div>
            <div class="group">
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-bell"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Rest timer sound</div>
                        <div class="srow-desc">Chime when rest period ends</div>
                    </div>
                    ${toggleBtn('restTimerSound', s.restTimerSound)}
                </div>
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-play-circle"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Auto-start timer</div>
                        <div class="srow-desc">Start rest timer after completing a set</div>
                    </div>
                    ${toggleBtn('restTimerAutoStart', s.restTimerAutoStart)}
                </div>
                <div class="srow">
                    <div class="srow-icon ic-warning"><i class="fas fa-mobile-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Timer vibration</div>
                        <div class="srow-desc">Vibrate when rest timer expires</div>
                    </div>
                    ${toggleBtn('restTimerVibration', s.restTimerVibration)}
                </div>
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-gauge-high"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Track effort</div>
                        <div class="srow-desc">Rate how hard your heaviest set felt (6–10) on each exercise</div>
                    </div>
                    ${toggleBtn('trackRpe', s.trackRpe)}
                </div>
                ${manualDeloadRowHTML(s)}
                <div class="srow srow--clickable" onclick="openPrimaryLiftsSheet()">
                    <div class="srow-icon ic-primary"><i class="fas fa-chart-line"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Main lifts</div>
                        <div class="srow-desc">${escapeHtml(primaryLiftsDesc())}</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="openGoalsPage()">
                    <div class="srow-icon ic-primary"><i class="fas fa-bullseye"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Goals</div>
                        <div class="srow-desc">Lifts, body weight, days a week — and the dates you're training for</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow">
                    <div class="srow-icon ic-purple"><i class="fas fa-map-marker-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Auto-detect gym</div>
                        <div class="srow-desc">Use GPS to match saved locations</div>
                    </div>
                    ${toggleBtn('autoDetectLocation', s.autoDetectLocation !== false)}
                </div>
            </div>

            <!-- AI coach profile -->
            <div class="group-label">AI coach profile</div>
            <div class="group">
                <div class="srow srow--stack">
                    <div class="srow-info">
                        <div class="srow-name">Goal</div>
                        <div class="srow-desc">Frames every recommendation the coach makes</div>
                    </div>
                    ${segmented('coachGoal', [
                        { value: 'cut', label: 'Cut' },
                        { value: 'bulk', label: 'Bulk' },
                        { value: 'recomp', label: 'Recomp' },
                        { value: 'strength', label: 'Strength' },
                        { value: 'general', label: 'General' },
                    ], s.coachGoal)}
                </div>
                <div class="srow srow--clickable" onclick="editCoachInjuries()">
                    <div class="srow-icon ic-warning"><i class="fas fa-band-aid"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Injuries or limitations</div>
                        <div class="srow-desc">${escapeHtml(s.coachInjuries || 'None listed — the coach programs around these')}</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="editCoachNotes()">
                    <div class="srow-icon ic-blue"><i class="fas fa-sticky-note"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Coach notes</div>
                        <div class="srow-desc">${escapeHtml(s.coachNotes || 'Schedule, preferences — anything the coach should know')}</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="openCoachMemorySheet()">
                    <div class="srow-icon ic-purple"><i class="fas fa-brain"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">What your coach remembers</div>
                        <div class="srow-desc">Facts saved from your conversations — view and delete</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-calendar-week"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Weekly coach review</div>
                        <div class="srow-desc">A short Monday digest of your training week</div>
                    </div>
                    ${toggleBtn('weeklyCoachReview', s.weeklyCoachReview !== false)}
                </div>
                <div class="srow srow--clickable" onclick="openReportCard()">
                    <div class="srow-icon ic-primary"><i class="fas fa-clipboard-check"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Sunday report card</div>
                        <div class="srow-desc">${s.reportCard === true ? 'On — your week in one page, Sunday 7:30 pm' : 'Your week in one page, Sunday night — instead of the Monday review'}</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="settingsProgramRowTap()">
                    <div class="srow-icon ic-primary"><i class="fas fa-flag-checkered"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Program</div>
                        <div class="srow-desc" id="program-trust-desc">${escapeHtml(programTrustDesc())}</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="openWeekPlanSheet()">
                    <div class="srow-icon ic-blue"><i class="fas fa-calendar-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Week plan</div>
                        <div class="srow-desc">One workout per day — powers the dashboard's Today card</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
            </div>

            <!-- Notifications (diagnostics) -->
            <div class="group-label">Notifications</div>
            <div class="group" id="notif-diag-group">
                ${renderNotificationDiagnostics()}
            </div>

            <!-- Connections -->
            <div class="group-label">Connections</div>
            <div class="group">
                <div id="withings-settings-item" class="srow srow--clickable" onclick="handleWithingsSettingsAction()">
                    <div class="srow-icon ic-blue"><i class="fas fa-link"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Withings</div>
                        <div class="srow-desc" id="withings-status-text">Weight & body composition</div>
                    </div>
                    <div class="srow-right" id="withings-status-icon">
                        <span class="srow-connect">Connect</span>
                    </div>
                </div>
            </div>

            <!-- Manage -->
            <div class="group-label">Manage</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="navigateTo('location')">
                    <div class="srow-icon ic-muted"><i class="fas fa-map-marker-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Locations</div>
                        <div class="srow-desc">Your gyms</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="navigateTo('equipment-library')">
                    <div class="srow-icon ic-muted"><i class="fas fa-dumbbell"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Equipment</div>
                        <div class="srow-desc">Machines &amp; gear</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="rebuildPRsFromSettings()">
                    <div class="srow-icon ic-muted"><i class="fas fa-sync-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Rebuild PRs</div>
                        <div class="srow-desc">Recalculate from workout history</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
            </div>

            <!-- Data -->
            <div class="group-label">Data</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="exportWorkoutData(window.AppState)">
                    <div class="srow-icon ic-muted"><i class="fas fa-download"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Export all data</div>
                        <div class="srow-desc">Download everything as a JSON file</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="exportDataForAI(window.AppState)">
                    <div class="srow-icon ic-muted"><i class="fas fa-robot"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Export for ChatGPT</div>
                        <div class="srow-desc">JSON with workouts, body weight &amp; DEXA</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="showImportModal()">
                    <div class="srow-icon ic-muted"><i class="fas fa-upload"></i></div>
                    <div class="srow-info"><div class="srow-name">Import</div></div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
            </div>

            <!-- Danger zone. Delete account sits here, not a tap deeper, because
                 Apple requires it to be easy to find (and the privacy policy
                 says "Settings → Delete account"); the confirm sheet + typed
                 DELETE step is what guards against mis-taps. -->
            <div class="group-label group-label--danger">Danger zone</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="signOutUser()">
                    <div class="srow-icon ic-danger"><i class="fas fa-sign-out-alt"></i></div>
                    <div class="srow-info"><div class="srow-name srow-name--danger">Sign out</div></div>
                </div>
                <div class="srow srow--clickable" onclick="confirmDeleteAccount()">
                    <div class="srow-icon ic-danger"><i class="fas fa-user-xmark"></i></div>
                    <div class="srow-info">
                        <div class="srow-name srow-name--danger">Delete account</div>
                        <div class="srow-desc">Permanently erase your account and all your data</div>
                    </div>
                </div>
            </div>

            <div class="settings-footer">
                Big Surf v${escapeHtml(APP_VERSION)}
            </div>
        </div>
    `;

    // Program row hydrates once the active program is known (same hydrate-once
    // pattern as the dashboard — undefined means not fetched yet).
    if (AppState._activeProgram === undefined) {
        import('../features/program-session.js').then(async m => {
            await m.loadActiveProgram();
            const el = document.getElementById('program-trust-desc');
            if (el) el.textContent = programTrustDesc();
        }).catch(() => {});
    }

    // Update Withings connection status after DOM is ready
    if (window._withingsConnected !== undefined && window.updateWithingsUI) {
        window.updateWithingsUI(window._withingsConnected);
    } else {
        import('../features/withings-integration.js').then(({ getWithingsStatus }) => {
            getWithingsStatus().then(status => {
                if (window.updateWithingsUI) {
                    window._withingsConnected = status.connected;
                    window.updateWithingsUI(status.connected, status.lastSync);
                }
            });
        });
    }
}

// ===================================================================
// ONBOARDING
// ===================================================================

let onboardingStep = 0;

/**
 * Check if onboarding should show. Called after auth + settings load.
 */
export async function checkOnboarding() {
    if (!AppState.currentUser) return;
    if (AppState.settings?.hasCompletedOnboarding) return;

    showOnboarding();
}

function showOnboarding() {
    // Resume from the step the user last saw. Clamped to valid range so a stale
    // persisted value (e.g. after adding/removing a step) can't out-of-bounds.
    const totalSteps = 5;
    const saved = AppState.settings?.onboardingStep;
    onboardingStep = (typeof saved === 'number' && saved >= 0 && saved < totalSteps) ? saved : 0;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    document.body.appendChild(overlay);

    renderOnboardingStep();
}

function renderOnboardingStep() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    const s = AppState.settings || {};
    const totalSteps = 5;

    // Progress dots
    const dots = Array.from({ length: totalSteps }, (_, i) =>
        `<div class="onb-dot ${i <= onboardingStep ? 'active' : ''}"></div>`
    ).join('');

    const goalOptions = [
        { value: 3, label: 'Casual · 3x / week', desc: 'Just getting started' },
        { value: 4, label: 'Balanced · 4x / week', desc: 'Most lifters' },
        { value: 5, label: 'Serious · 5x / week', desc: 'PPL split or Upper/Lower' },
        { value: 6, label: 'Hard · 6x / week', desc: 'Advanced training' },
    ];

    // Experience options live at module scope (EXPERIENCE_OPTIONS) so the
    // Profile detail picker can reuse them without duplicating labels/icons.

    const weightGoalOptions = [
        { value: 'lose',     label: 'Lose',     desc: 'Cutting — downward is good',  icon: 'fa-arrow-trend-down' },
        { value: 'maintain', label: 'Maintain', desc: 'Holding weight steady',       icon: 'fa-equals' },
        { value: 'gain',     label: 'Gain',     desc: 'Bulking — upward is good',    icon: 'fa-arrow-trend-up' },
    ];

    function chipHTML(options, settingKey, currentValue, isNumeric) {
        return options.map(o => {
            const selected = (isNumeric ? o.value === (currentValue || 5) : o.value === currentValue);
            const parseVal = isNumeric ? o.value : `'${o.value}'`;
            return `
                <div class="onb-chip ${selected ? 'selected' : ''}"
                     onclick="updateSetting('${settingKey}', ${parseVal}); document.querySelectorAll('.onb-chip').forEach(c=>c.classList.remove('selected')); this.classList.add('selected');">
                    <div class="onb-chip-icon ${selected ? 'ic-primary' : 'ic-muted'}">
                        ${o.icon ? `<i class="fas ${o.icon}"></i>` : o.value}
                    </div>
                    <div class="onb-chip-info">
                        <div class="onb-chip-name">${o.label}</div>
                        <div class="onb-chip-desc">${o.desc}</div>
                    </div>
                    ${selected ? '<div class="onb-chip-check"><i class="fas fa-check"></i></div>' : ''}
                </div>
            `;
        }).join('');
    }

    const steps = [
        // Step 0: Welcome
        {
            body: `
                <div class="onb-welcome-body">
                    <img class="onb-welcome-logo" src="BigSurfNoBG.png" alt="Big Surf" onerror="this.classList.add('hidden')">
                    <div class="onb-title">Welcome to<br>Big Surf</div>
                    <div class="onb-desc">Track your lifts, hit PRs, see trends. Let's set up your profile in under a minute.</div>
                </div>
            `,
            footer: `<button class="btn-redesign onb-btn-full" onclick="onboardingNext()">Get started <i class="fas fa-arrow-right"></i></button>`,
        },

        // Step 1: Weekly Goal
        {
            body: `
                <div class="onb-icon-hero ic-warm"><i class="fas fa-bullseye"></i></div>
                <div class="onb-title">How often?</div>
                <div class="onb-desc">How many workouts per week are you aiming for? You can change this anytime.</div>
                <div class="onb-chips">${chipHTML(goalOptions, 'weeklyGoal', s.weeklyGoal, true)}</div>
            `,
            footer: `
                <button class="btn-ghost" onclick="onboardingBack()">Back</button>
                <button class="btn-redesign onb-btn-wide" onclick="onboardingNext()">Next <i class="fas fa-arrow-right"></i></button>
            `,
        },

        // Step 2: Experience
        {
            body: `
                <div class="onb-icon-hero ic-warning"><i class="fas fa-star"></i></div>
                <div class="onb-title">Experience level</div>
                <div class="onb-desc">We'll use this to suggest starting weights and form tips.</div>
                <div class="onb-chips">${chipHTML(EXPERIENCE_OPTIONS, 'profileExperience', s.profileExperience || s.experienceLevel || 'intermediate', false)}</div>
            `,
            footer: `
                <button class="btn-ghost" onclick="onboardingBack()">Back</button>
                <button class="btn-redesign onb-btn-wide" onclick="onboardingNext()">Next <i class="fas fa-arrow-right"></i></button>
            `,
        },

        // Step 3: Body-weight goal direction (optional)
        {
            body: `
                <div class="onb-icon-hero ic-shoulders"><i class="fas fa-weight"></i></div>
                <div class="onb-title">Weight goal</div>
                <div class="onb-desc">Pick one so we can color your weight trend correctly. Skip to stay neutral — you can set it later.</div>
                <div class="onb-chips">${chipHTML(weightGoalOptions, 'weightGoal', s.weightGoal, false)}</div>
            `,
            footer: `
                <button class="btn-ghost" onclick="onboardingBack()">Back</button>
                <button class="btn-ghost" onclick="onboardingSkipWeightGoal()">Skip</button>
                <button class="btn-redesign onb-btn-wide" onclick="onboardingNext()">Next <i class="fas fa-arrow-right"></i></button>
            `,
        },

        // Step 4: Units & Preferences
        {
            body: `
                <div class="onb-icon-hero ic-blue"><i class="fas fa-sliders-h"></i></div>
                <div class="onb-title">Units</div>
                <div class="onb-desc">Set defaults. Changeable later in Settings.</div>

                <div class="onb-unit-group">
                    <div class="group-label">Weight</div>
                    <div class="segmented onb-segmented">
                        <button class="${s.weightUnit === 'lbs' ? 'active' : ''}" onclick="updateSetting('weightUnit','lbs'); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">Pounds (lb)</button>
                        <button class="${s.weightUnit === 'kg' ? 'active' : ''}" onclick="updateSetting('weightUnit','kg'); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">Kilograms (kg)</button>
                    </div>
                </div>
                <div class="onb-unit-group">
                    <div class="group-label">Rest timer default</div>
                    <div class="segmented onb-segmented">
                        ${[60, 90, 120, 180].map(v => {
                            const label = v < 120 ? `${v}s` : `${v / 60} min`;
                            return `<button class="${s.restTimerDuration === v ? 'active' : ''}" onclick="updateSetting('restTimerDuration',${v}); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${label}</button>`;
                        }).join('')}
                    </div>
                </div>
            `,
            footer: `
                <button class="btn-ghost" onclick="onboardingBack()">Back</button>
                <button class="btn-redesign onb-btn-wide" onclick="completeOnboarding()"><i class="fas fa-check"></i> All set</button>
            `,
        },
    ];

    const step = steps[onboardingStep] || steps[0];

    overlay.innerHTML = `
        <button class="onb-skip" onclick="completeOnboarding()">Skip for now</button>
        <div class="onb-content">
            <div class="onb-progress">${dots}</div>
            ${step.body}
        </div>
        <div class="onb-footer">${step.footer}</div>
    `;
}

export function onboardingNext() {
    onboardingStep++;
    updateSetting('onboardingStep', onboardingStep);
    renderOnboardingStep();
}

export function onboardingBack() {
    if (onboardingStep > 0) onboardingStep--;
    updateSetting('onboardingStep', onboardingStep);
    renderOnboardingStep();
}

// Skip the body-weight goal step — explicitly clear any stored value so the
// dashboard stays color-neutral (per Phase A rule: never assume a direction).
export function onboardingSkipWeightGoal() {
    updateSetting('weightGoal', null);
    onboardingNext();
}

/** Prompt-based editor for Target weight (in the user's unit). */
export async function editBodyWeightGoal() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const unitLabel = s.weightUnit === 'kg' ? 'kg' : 'lb';
    const current = s.bodyWeightGoal != null ? String(s.bodyWeightGoal) : '';
    const next = await promptSheet({
        title: `Target weight in ${unitLabel}`,
        message: 'Leave blank to clear your goal.',
        initialValue: current,
        confirmLabel: 'Save',
    });
    if (next == null) return;
    if (next.trim() === '') {
        updateSetting('bodyWeightGoal', null);
        renderSettings();
        return;
    }
    const n = parseFloat(next);
    if (!isFinite(n) || n <= 0) {
        showNotification('Enter a positive number', 'warn');
        return;
    }
    updateSetting('bodyWeightGoal', Math.round(n * 10) / 10);
    renderSettings();
}

export function completeOnboarding() {
    updateSetting('hasCompletedOnboarding', true);
    // Clear the resume-step marker so any future re-run starts from step 0.
    updateSetting('onboardingStep', 0);

    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.remove();
}

/**
 * Re-run onboarding from Settings (Phase F §6 follow-up C).
 * Does NOT clear existing preference values — re-running lets the user
 * update their answers. Existing selections appear pre-selected in each chip.
 */
export function restartOnboarding() {
    updateSetting('hasCompletedOnboarding', false);
    updateSetting('onboardingStep', 0);
    onboardingStep = 0;

    // Remove any stale overlay left over from a prior session.
    const existing = document.getElementById('onboarding-overlay');
    if (existing) existing.remove();

    showOnboarding();
}

// ===================================================================
// PROFILE DETAIL (§5)
// ===================================================================

/** Open the Profile detail page. */
export function openProfile() {
    navigateTo('profile-section');
    renderProfileDetail();
}

/** Render the Profile detail page with editable fields. */
export function renderProfileDetail() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    const s = AppState.settings || DEFAULT_SETTINGS;
    const user = AppState.currentUser;
    const authName = user?.displayName || 'User';
    const email = user?.email || '';
    const photoURL = user?.photoURL || '';
    const displayName = s.profileName || authName;

    // Height display follows weightUnit: lbs → ft/in, kg → cm. Storage stays cm.
    const heightDisplay = s.profileHeightCm != null
        ? formatHeight(s.profileHeightCm, s.weightUnit)
        : 'Not set';
    const birthdayDisplay = formatBirthday(s.profileBirthday);
    // Fall back to the legacy `experienceLevel` key so answers entered during
    // earlier onboarding builds still display here. Writes always go to
    // profileExperience going forward.
    const expKey = s.profileExperience || s.experienceLevel;
    const exp = expKey
        ? expKey.charAt(0).toUpperCase() + expKey.slice(1)
        : 'Not set';

    container.innerHTML = `
        <div class="profile-detail">
            <div class="profile-hero">
                <div class="profile-hero__avatar">
                    ${photoURL ? `<img src="${escapeAttr(photoURL)}" alt="">` : escapeHtml((displayName || '?').charAt(0).toUpperCase())}
                </div>
                <div class="profile-hero__name">${escapeHtml(displayName)}</div>
                <div class="profile-hero__email">${escapeHtml(email)}</div>
            </div>

            <div class="group-label">Account</div>
            <div class="group">
                <div class="srow" onclick="editProfileName()">
                    <div class="srow-icon ic-primary"><i class="fas fa-user"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Name</div>
                    </div>
                    <div class="srow-right">
                        <span class="srow-value">${escapeHtml(displayName)}</span>
                        <i class="fas fa-chevron-right srow-chev"></i>
                    </div>
                </div>
            </div>

            <div class="group-label">Fitness profile</div>
            <div class="group">
                <div class="srow" onclick="editProfileHeight()">
                    <div class="srow-icon ic-blue"><i class="fas fa-ruler-vertical"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Height</div>
                    </div>
                    <div class="srow-right">
                        <span class="srow-value">${escapeHtml(heightDisplay)}</span>
                        <i class="fas fa-chevron-right srow-chev"></i>
                    </div>
                </div>
                <div class="srow" onclick="editProfileBirthday()">
                    <div class="srow-icon ic-warm"><i class="fas fa-birthday-cake"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Birthday</div>
                    </div>
                    <div class="srow-right">
                        <span class="srow-value">${escapeHtml(birthdayDisplay)}</span>
                        <i class="fas fa-chevron-right srow-chev"></i>
                    </div>
                </div>
                <div class="srow" onclick="editProfileExperience()">
                    <div class="srow-icon ic-purple"><i class="fas fa-medal"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Experience</div>
                    </div>
                    <div class="srow-right">
                        <span class="srow-value">${escapeHtml(exp)}</span>
                        <i class="fas fa-chevron-right srow-chev"></i>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/** Render a stored YYYY-MM-DD birthday as "MMM yyyy" (e.g. "Mar 1988"). */
function formatBirthday(iso) {
    if (!iso) return 'Not set';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** Prompt-based editors for each profile field. */
export async function editCoachInjuries() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const next = await promptSheet({
        title: 'Injuries or limitations',
        message: 'The coach never programs exercises that load these without flagging it.',
        initialValue: s.coachInjuries || '',
        placeholder: 'e.g. bad left shoulder, no deep squats',
        confirmLabel: 'Save',
    });
    if (next != null) {
        updateSetting('coachInjuries', next.trim() || null);
        renderSettings();
    }
}

export async function editCoachNotes() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const next = await promptSheet({
        title: 'Coach notes',
        message: 'Schedule constraints, style preferences — anything durable.',
        initialValue: s.coachNotes || '',
        placeholder: 'e.g. 45-minute lunch sessions, hates burpees',
        confirmLabel: 'Save',
    });
    if (next != null) {
        updateSetting('coachNotes', next.trim() || null);
        renderSettings();
    }
}

// ── Coach memory transparency (Phase 4) ─────────────────────────────
// The coach stores durable facts via its remember_fact tool. Users must be
// able to SEE and REMOVE that memory — this sheet is the window into it.

export async function openCoachMemorySheet() {
    if (!AppState.currentUser) return;

    let facts;
    try {
        const snap = await getDoc(doc(db, 'users', AppState.currentUser.uid, 'preferences', 'coachMemory'));
        facts = snap.exists() ? (snap.data().facts || []) : [];
    } catch (e) {
        console.error('❌ Coach memory load failed:', e);
        showNotification("Couldn't load coach memory", 'error');
        return;
    }

    // SH-3b: chrome from the sheet primitive; re-opening replaces in place.
    openSheet({
        id: 'coach-memory-sheet',
        title: 'What your coach remembers',
        subtitle: 'Saved from your conversations — delete anything',
        bodyId: 'coach-memory-body',
        bodyHTML: renderCoachMemoryBody(facts),
        actions: [{ label: 'Done', onClick: 'closeCoachMemorySheet()', primary: true }],
    });
}

function renderCoachMemoryBody(facts) {
    if (!facts.length) {
        return `
            <div class="empty-state-compact">
                <i class="fas fa-brain"></i>
                <p>Nothing remembered yet</p>
                <p class="empty-state-hint">Tell the coach durable things — injuries, schedule, preferences — and they'll show up here.</p>
            </div>
        `;
    }
    return facts.map(f => `
        <div class="js-row">
            <div class="srow-info">
                <div class="srow-name">${escapeHtml(f.text)}</div>
                <div class="srow-desc">${escapeHtml((f.createdAt || '').slice(0, 10))}</div>
            </div>
            <button class="btn-text" onclick="deleteCoachFact('${escapeAttr(f.id)}')" aria-label="Forget this">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

export async function deleteCoachFact(factId) {
    const ok = await confirmSheet({
        title: 'Forget this?',
        message: "The coach won't factor it into future advice.",
        confirmLabel: 'Forget it',
        cancelLabel: 'Keep it',
        destructive: true,
    });
    if (!ok || !AppState.currentUser) return;
    try {
        const ref = doc(db, 'users', AppState.currentUser.uid, 'preferences', 'coachMemory');
        const snap = await getDoc(ref);
        const facts = (snap.exists() ? (snap.data().facts || []) : []).filter(f => f.id !== factId);
        await setDoc(ref, { facts }, { merge: true });
        const body = document.getElementById('coach-memory-body');
        if (body) body.innerHTML = renderCoachMemoryBody(facts);
        showNotification('Forgotten', 'success', 1200);
    } catch (e) {
        console.error('❌ Coach fact delete failed:', e);
        showNotification("Couldn't delete — try again", 'error');
    }
}

export function closeCoachMemorySheet(immediate = false) {
    closeSheet('coach-memory-sheet', { immediate });
}

// ── Main lifts picker (AP-21) ───────────────────────────────────────
// The dashboard scoreboard tracks the exercises tagged role:'primary' in the
// user's templates (else it picks the most-trained compound per movement
// pattern). This sheet makes the tag a choice, not a guess. A primary is
// also never rotated by the variety engine — the same meaning, one field.

const MAX_MAIN_LIFTS = 8;
const normName = (s) => String(s || '').trim().toLowerCase();

/** Active templates the user owns (defaults can't carry a role). */
function editableTemplates() {
    return (AppState.workoutPlans || []).filter(t => t?.isCustom && !t.isDefault && !t.archived && Array.isArray(t.exercises));
}

function taggedPrimaryNames() {
    const out = new Set();
    for (const t of editableTemplates()) {
        for (const ex of t.exercises) if (ex?.role === 'primary') out.add(normName(ex.machine || ex.name));
    }
    return out;
}

function primaryLiftsDesc() {
    const n = taggedPrimaryNames().size;
    return n ? `${n} picked — the dashboard trend tracks these` : 'Picked automatically from your training';
}

export function openPrimaryLiftsSheet() {
    const lifts = new Map();
    for (const t of editableTemplates()) {
        for (const ex of t.exercises) {
            const name = ex?.machine || ex?.name;
            if (!name) continue;
            const key = normName(name);
            const row = lifts.get(key) || { name, pattern: inferPattern({ ...ex, name }), templates: [] };
            row.templates.push(t.name || t.day || 'Workout');
            lifts.set(key, row);
        }
    }
    // Nothing tagged yet → pre-check what the scoreboard picks today, so the
    // user confirms rather than builds from zero.
    let checked = taggedPrimaryNames();
    if (!checked.size) {
        checked = new Set(pickPrimaries({ workouts: AppState.workouts || [], today: AppState.getTodayDateString() })
            .map(p => normName(p.name)));
    }
    const rows = [...lifts.entries()]
        .sort((a, b) => (checked.has(b[0]) - checked.has(a[0])) || a[1].name.localeCompare(b[1].name))
        .map(([key, l]) => {
            const on = checked.has(key);
            const meta = [l.pattern && PATTERN_LABELS[l.pattern], [...new Set(l.templates)].slice(0, 2).join(', ')]
                .filter(Boolean).join(' · ');
            return `
                <div class="js-row ${on ? 'current' : ''}" role="checkbox" aria-checked="${on}" tabindex="0"
                     data-lift="${escapeAttr(key)}" onclick="togglePrimaryLift(this)">
                    <div class="js-row__info">
                        <div class="js-row__name">${escapeHtml(l.name)}</div>
                        <div class="js-row__meta">${escapeHtml(meta)}</div>
                    </div>
                    <i class="${on ? 'fas fa-check-circle' : 'far fa-circle'} js-row__status ${on ? 'done' : ''}" aria-hidden="true"></i>
                </div>`;
        }).join('');

    openSheet({
        id: 'primary-lifts-sheet',
        title: 'Main lifts',
        subtitle: `Your progress trend tracks these — up to ${MAX_MAIN_LIFTS}`,
        bodyId: 'primary-lifts-body',
        bodyHTML: rows || `
            <div class="empty-state-compact">
                <i class="fas fa-dumbbell"></i>
                <p>No saved workouts yet</p>
                <p class="empty-state-hint">Save a workout and its lifts show up here to pick from.</p>
            </div>`,
        actions: rows
            ? [
                { label: 'Keep current', onClick: 'closePrimaryLiftsSheet()' },
                { label: 'Save main lifts', onClick: 'savePrimaryLifts()', primary: true },
            ]
            : [{ label: 'Close', onClick: 'closePrimaryLiftsSheet()' }],
    });
}

export function togglePrimaryLift(row) {
    if (!row) return;
    const turnOn = row.getAttribute('aria-checked') !== 'true';
    if (turnOn && document.querySelectorAll('#primary-lifts-body [aria-checked="true"]').length >= MAX_MAIN_LIFTS) {
        showNotification(`Pick up to ${MAX_MAIN_LIFTS} main lifts`, 'warning');
        return;
    }
    row.setAttribute('aria-checked', String(turnOn));
    row.classList.toggle('current', turnOn);
    const icon = row.querySelector('.js-row__status');
    if (icon) icon.className = `${turnOn ? 'fas fa-check-circle' : 'far fa-circle'} js-row__status ${turnOn ? 'done' : ''}`;
}

export async function savePrimaryLifts() {
    if (!AppState.currentUser) return;
    const chosen = new Set([...document.querySelectorAll('#primary-lifts-body [aria-checked="true"]')]
        .map(r => r.dataset.lift));
    const now = new Date().toISOString();
    const writes = [];
    for (const t of editableTemplates()) {
        const exercises = applyPrimaryChoice(t.exercises, chosen);
        if (!exercises) continue;
        // Merge-write only the exercises array: every other template field
        // (kind, parentTemplateId, usage counts) stays as it is.
        writes.push(setDoc(doc(db, 'users', AppState.currentUser.uid, 'workoutTemplates', t.id),
            { exercises, lastUpdated: now }, { merge: true })
            .then(() => {
                t.exercises = exercises;
                t.lastUpdated = now;
                const twin = (AppState.templates || []).find(x => x.id === t.id);
                if (twin && twin !== t) {
                    twin.exercises = exercises;
                    twin.lastUpdated = now;
                }
            }));
    }
    try {
        await Promise.all(writes);
        closePrimaryLiftsSheet();
        showNotification(chosen.size ? 'Main lifts saved' : 'Main lifts back to automatic', 'success', 2000);
        if (document.getElementById('settings-content')?.offsetParent) renderSettings();
        const dash = document.getElementById('dashboard');
        if (dash && !dash.classList.contains('hidden')) {
            import('./dashboard-ui.js').then(m => m.showDashboard()).catch(() => {});
        }
    } catch (e) {
        console.error('❌ Main lifts save failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

export function closePrimaryLiftsSheet(immediate = false) {
    closeSheet('primary-lifts-sheet', { immediate });
}

// ── Week plan editor (Phase 5.5) ────────────────────────────────────
// One workout per weekday, rest days explicit. Seeds from the day chips
// templates already carry so the user confirms rather than builds from zero.

/** Program row tap: detail sheet when a program is active, coach door when
 *  not — the row used to be a dead end that told you to go type "program". */
export function settingsProgramRowTap() {
    if (AppState._activeProgram) {
        import('../features/program-session.js').then((m) => m.openProgramDetailSheet?.()).catch(() => {});
    } else {
        import('../features/ai-coach-ui.js').then((m) => m.startProgramChat?.()).catch(() => {});
    }
}

export async function openWeekPlanSheet() {
    if (!AppState.currentUser) return;
    const { DAY_KEYS, DAY_LABELS, loadWeekPlan, emptyWeekPlan } = await import('../features/week-plan.js');
    const plan = (AppState._weekPlan !== undefined ? AppState._weekPlan : await loadWeekPlan()) || emptyWeekPlan();
    const templates = (AppState.workoutPlans || []).filter(t => !t.archived && (t.name || t.day));

    // Seed empty days from template day chips (suggestedDays) — confirm, don't build.
    const seeded = { ...plan.days };
    for (const d of DAY_KEYS) {
        if (seeded[d]) continue;
        const match = templates.find(t => Array.isArray(t.suggestedDays)
            && t.suggestedDays.includes(DAY_LABELS[d].toLowerCase()));
        if (match && !(plan.restDays || []).includes(d)) seeded[d] = match.id;
    }

    const options = (selected) => [
        `<option value="" ${!selected ? 'selected' : ''}>Open</option>`,
        `<option value="__rest" ${selected === '__rest' ? 'selected' : ''}>Rest day</option>`,
        ...templates.map(t => `<option value="${escapeAttr(t.id)}" ${selected === t.id ? 'selected' : ''}>${escapeHtml(t.name || t.day)}</option>`),
    ].join('');

    openSheet({
        id: 'week-plan-sheet',
        title: 'Week plan',
        subtitle: 'Missed days shift to your next open day — quietly',
        bodyClass: 'week-plan-editor',
        bodyHTML: `
            ${DAY_KEYS.map(d => `
                <div class="week-plan-editor__row">
                    <div class="week-plan-editor__day">${escapeHtml(DAY_LABELS[d])}</div>
                    <select class="week-plan-editor__select" data-day="${d}" aria-label="${escapeAttr(DAY_LABELS[d])}">
                        ${options((plan.restDays || []).includes(d) ? '__rest' : seeded[d])}
                    </select>
                </div>
            `).join('')}
            ${!AppState._activeProgram ? `
                <div class="week-plan-editor__coach" onclick="startProgramChat()" role="button" tabindex="0">
                    <i class="fas fa-flag-checkered"></i>
                    <span>Want the weeks planned too, lighter weeks included? Ask the coach for a plan</span>
                </div>` : ''}
        `,
        actions: [
            { label: 'Keep current', onClick: 'closeWeekPlanSheet()' },
            { label: 'Save plan', onClick: 'saveWeekPlanFromSheet()', primary: true },
        ],
    });
}

export async function saveWeekPlanFromSheet() {
    const { DAY_KEYS, saveWeekPlan } = await import('../features/week-plan.js');
    const days = {};
    const restDays = [];
    for (const d of DAY_KEYS) {
        const sel = document.querySelector(`#week-plan-sheet select[data-day="${d}"]`);
        const val = sel?.value || '';
        if (val === '__rest') { days[d] = null; restDays.push(d); }
        else days[d] = val || null;
    }
    const ok = await saveWeekPlan(days, restDays);
    closeWeekPlanSheet();
    showNotification(ok ? 'Week plan saved' : "Couldn't save — try again", ok ? 'success' : 'error');
}

/** `immediate` (ai-coach-ui's startProgramChat passes true) skips the slide-out. */
export function closeWeekPlanSheet(immediate = false) {
    closeSheet('week-plan-sheet', { immediate });
}

export async function editProfileName() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const current = s.profileName || AppState.currentUser?.displayName || '';
    const next = await promptSheet({
        title: 'Display name',
        initialValue: current,
        confirmLabel: 'Save',
    });
    if (next != null) {
        updateSetting('profileName', next.trim() || null);
        renderProfileDetail();
    }
}
export async function editProfileHeight() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const usesImperial = s.weightUnit === 'lbs';
    const current = s.profileHeightCm != null
        ? (usesImperial ? formatHeight(s.profileHeightCm, 'lbs') : String(Math.round(s.profileHeightCm)))
        : '';
    const next = await promptSheet({
        title: 'Height',
        message: usesImperial ? 'Use a format like 5\'10" or 70in.' : 'Enter a number in cm.',
        initialValue: current,
        confirmLabel: 'Save',
    });
    if (next == null) return;
    if (next.trim() === '') {
        updateSetting('profileHeightCm', null);
        renderProfileDetail();
        return;
    }
    const cm = parseHeightToCm(next, s.weightUnit);
    if (cm == null) {
        showNotification(usesImperial
            ? 'Use a format like 5\'10" or 70in'
            : 'Enter a number in cm', 'warn');
        return;
    }
    updateSetting('profileHeightCm', cm);
    renderProfileDetail();
}
export async function editProfileBirthday() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const current = s.profileBirthday || '';
    const next = await promptSheet({
        title: 'Birthday',
        message: 'Use YYYY-MM-DD format.',
        placeholder: 'YYYY-MM-DD',
        initialValue: current,
        confirmLabel: 'Save',
    });
    if (next != null) {
        const cleaned = next.trim();
        if (cleaned === '' || /^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
            updateSetting('profileBirthday', cleaned || null);
            renderProfileDetail();
        } else {
            showNotification('Use YYYY-MM-DD format', 'warn');
        }
    }
}
/**
 * Open the Experience level picker — same three chip options the user saw
 * in onboarding step 2. Replaces the earlier prompt()-based editor because
 * a free-text prompt let users type anything the validator would then reject.
 */
export function editProfileExperience() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    // Legacy fallback: pre-unification users have their choice under
    // `experienceLevel`. Read it so the picker pre-selects correctly even
    // before they re-save.
    const current = s.profileExperience || s.experienceLevel || null;

    const chips = EXPERIENCE_OPTIONS.map(o => {
        const isSelected = current === o.value;
        return `
            <div class="onb-chip ${isSelected ? 'selected' : ''}"
                 onclick="selectProfileExperience('${o.value}')">
                <div class="onb-chip-icon ${isSelected ? 'ic-primary' : 'ic-muted'}">
                    <i class="fas ${o.icon}"></i>
                </div>
                <div class="onb-chip-info">
                    <div class="onb-chip-name">${escapeHtml(o.label)}</div>
                    <div class="onb-chip-desc">${escapeHtml(o.desc)}</div>
                </div>
                ${isSelected ? '<div class="onb-chip-check"><i class="fas fa-check"></i></div>' : ''}
            </div>
        `;
    }).join('');

    // SH-3b: was a hand-built .picker-overlay; now the shared sheet primitive.
    openSheet({
        id: 'profile-exp-picker',
        title: 'Experience level',
        className: 'exp-picker-sheet',
        bodyHTML: `<div class="onb-chips">${chips}</div>`,
        actions: [{ label: 'Close', onClick: 'closeProfileExperiencePicker()' }],
    });
}

export function selectProfileExperience(value) {
    updateSetting('profileExperience', value);
    closeProfileExperiencePicker();
    renderProfileDetail();
}

export function closeProfileExperiencePicker() {
    closeSheet('profile-exp-picker');
}
// SH-6 — one back system: back to wherever the profile was opened from
// (only Settings today, but navigateBack never strands a new entry point).
export function closeProfile() { navigateBack(); }

/**
 * Rebuild PRs from settings page — recalculates from full workout history.
 */
export async function rebuildPRsFromSettings() {
    try {
        const { rebuildPRsFromHistory } = await import('../features/pr-tracker.js');
        const result = await rebuildPRsFromHistory();
        if (result.success) {
            showNotification(`PRs rebuilt from ${result.workoutsProcessed} workouts`, 'success', 2000);
        } else {
            showNotification("Couldn't rebuild PRs", 'error');
        }
    } catch (error) {
        console.error('PR rebuild failed:', error);
        showNotification("Couldn't rebuild PRs", 'error');
    }
}

// ===================================================================
// DELETE ACCOUNT (launch blocker 11b)
// ===================================================================

// ===================================================================
// NOTIFICATION DIAGNOSTICS
// ===================================================================

function getNotificationDiagnostics() {
    const isStandalone =
        (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
        || navigator.standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const swSupported = 'serviceWorker' in navigator;
    const pushSupported = 'PushManager' in window;
    const permission = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
    const subscribed = isFCMAvailable();
    const sub = getPushSubscription();

    return {
        installed: isStandalone,
        isIOS,
        swSupported,
        pushSupported,
        permission,
        subscribed,
        endpoint: sub?.endpoint || null,
    };
}

function statusRow(iconClass, iconTint, name, desc, statusText, statusTone) {
    const toneClass = statusTone === 'ok' ? 'notif-status--ok'
        : statusTone === 'warn' ? 'notif-status--warn'
        : statusTone === 'err' ? 'notif-status--err'
        : '';
    return `
        <div class="srow">
            <div class="srow-icon ${iconTint}"><i class="fas ${iconClass}"></i></div>
            <div class="srow-info">
                <div class="srow-name">${escapeHtml(name)}</div>
                <div class="srow-desc">${escapeHtml(desc)}</div>
            </div>
            <div class="srow-right">
                <span class="srow-value notif-status ${toneClass}">${escapeHtml(statusText)}</span>
            </div>
        </div>
    `;
}

function renderNotificationDiagnostics() {
    const d = getNotificationDiagnostics();

    const rows = [];

    rows.push(statusRow(
        'fa-mobile-alt', 'ic-blue',
        'PWA installation',
        d.installed ? 'Running as installed app' : 'Open in Safari — Add to Home Screen for lock-screen push',
        d.installed ? 'Installed' : 'Browser tab',
        d.installed ? 'ok' : 'warn',
    ));

    rows.push(statusRow(
        'fa-shield-alt', 'ic-primary',
        'Notification permission',
        d.permission === 'granted' ? 'You granted permission to notify'
            : d.permission === 'denied' ? 'Blocked — re-enable in browser settings'
            : 'Not asked yet',
        d.permission === 'granted' ? 'Granted'
            : d.permission === 'denied' ? 'Blocked'
            : 'Not asked',
        d.permission === 'granted' ? 'ok' : d.permission === 'denied' ? 'err' : 'warn',
    ));

    rows.push(statusRow(
        'fa-cog', 'ic-muted',
        'Service worker',
        d.swSupported ? 'Required to receive background push' : 'Not supported in this browser',
        d.swSupported ? 'Supported' : 'Unsupported',
        d.swSupported ? 'ok' : 'err',
    ));

    rows.push(statusRow(
        'fa-bell', 'ic-warm',
        'Push subscription',
        d.subscribed ? 'Ready to receive scheduled notifications' : 'No subscription — sign-in + permission needed',
        d.subscribed ? 'Ready' : 'Missing',
        d.subscribed ? 'ok' : 'err',
    ));

    let actionRow = '';
    if (d.permission !== 'granted') {
        actionRow = `
            <div class="srow srow--clickable" onclick="notifDiagEnable()">
                <div class="srow-icon ic-primary"><i class="fas fa-bell"></i></div>
                <div class="srow-info">
                    <div class="srow-name">Enable notifications</div>
                    <div class="srow-desc">Request permission and set up push subscription</div>
                </div>
                <i class="fas fa-chevron-right srow-chev"></i>
            </div>
        `;
    } else if (d.subscribed) {
        actionRow = `
            <div class="srow srow--clickable" onclick="notifDiagTest()">
                <div class="srow-icon ic-primary"><i class="fas fa-paper-plane"></i></div>
                <div class="srow-info">
                    <div class="srow-name">Send test (10s delay)</div>
                    <div class="srow-desc">Lock your phone now to test lock-screen delivery</div>
                </div>
                <i class="fas fa-chevron-right srow-chev"></i>
            </div>
        `;
    }

    const iosHint = d.isIOS && !d.installed ? `
        <div class="notif-ios-hint">
            <i class="fas fa-info-circle"></i>
            On iOS, lock-screen push requires iOS 16.4+ and the app added to Home Screen. Safari tabs can't receive web push.
        </div>
    ` : '';

    return rows.join('') + actionRow + iosHint;
}

export async function notifDiagEnable() {
    const ok = await initializeFCM();
    if (ok) {
        showNotification('Notifications enabled', 'success');
    } else {
        showNotification('Could not enable — check browser permission', 'error');
    }
    // Re-render so diagnostics reflect new state
    const group = document.getElementById('notif-diag-group');
    if (group) group.innerHTML = renderNotificationDiagnostics();
}

export async function notifDiagTest() {
    const id = await scheduleRestNotification(10, 'Test notification');
    if (id) {
        showNotification('Test scheduled for 10s — lock your phone now', 'success');
    } else {
        showNotification('Test failed — check push subscription', 'error');
    }
}

// Self-wire handlers rendered only from this module's own template strings
// (cache-skew rule): the Delete account row, the coach-memory sheet + its row.
window.confirmDeleteAccount = confirmDeleteAccount;
window.openCoachMemorySheet = openCoachMemorySheet;
window.deleteCoachFact = deleteCoachFact;
window.closeCoachMemorySheet = closeCoachMemorySheet;
window.openWeekPlanSheet = openWeekPlanSheet;
window.settingsProgramRowTap = settingsProgramRowTap;
window.saveWeekPlanFromSheet = saveWeekPlanFromSheet;
window.closeWeekPlanSheet = closeWeekPlanSheet;
window.toggleManualDeload = toggleManualDeload;
window.openPrimaryLiftsSheet = openPrimaryLiftsSheet;
window.togglePrimaryLift = togglePrimaryLift;
window.savePrimaryLifts = savePrimaryLifts;
window.closePrimaryLiftsSheet = closePrimaryLiftsSheet;
