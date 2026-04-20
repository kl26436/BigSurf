// Settings UI Module - core/ui/settings-ui.js
// User-configurable settings with Firestore persistence

import { AppState } from '../utils/app-state.js';
import { Config, APP_VERSION } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr, formatHeight, parseHeightToCm } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { db, doc, setDoc, getDoc, collection, getDocs, deleteDoc, writeBatch } from '../data/firebase-config.js';
import { exportWorkoutData } from '../data/data-manager.js';

// Default settings — merged with user overrides on load
const DEFAULT_SETTINGS = {
    // Workout
    weightUnit: 'lbs',
    restTimerDuration: 90,
    restTimerAutoStart: true,
    restTimerVibration: true,
    restTimerSound: false,

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

    // Profile (user can override Firebase auth displayName; other fields are opt-in)
    profileName: null,       // override display name; null = use Firebase auth
    profileHeightCm: null,   // number (cm); convert display per unit pref
    profileBirthday: null,   // YYYY-MM-DD
    profileExperience: null, // 'beginner' | 'intermediate' | 'advanced'

    // Meta
    hasCompletedOnboarding: false,
    seenTips: [],
};

let saveTimeout = null;

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
    const parse = parseType === 'int' ? 'parseInt(this.dataset.val)' : `this.dataset.val`;
    return `<div class="segmented">${options.map(o =>
        `<button class="${o.value === currentValue ? 'active' : ''}" data-val="${o.value}"
            onclick="updateSetting('${settingKey}', ${parseType === 'int' ? o.value : `'${o.value}'`}); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${escapeHtml(o.label)}</button>`
    ).join('')}</div>`;
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
                    <div class="srow-icon ic-purple"><i class="fas fa-map-marker-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Auto-detect gym</div>
                        <div class="srow-desc">Use GPS to match saved locations</div>
                    </div>
                    ${toggleBtn('autoDetectLocation', s.autoDetectLocation !== false)}
                </div>
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

            <!-- Data -->
            <div class="group-label">Data</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="exportWorkoutData(window.AppState)">
                    <div class="srow-icon ic-muted"><i class="fas fa-download"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Export workouts</div>
                        <div class="srow-desc">Download CSV or JSON</div>
                    </div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
                <div class="srow srow--clickable" onclick="showImportModal()">
                    <div class="srow-icon ic-muted"><i class="fas fa-upload"></i></div>
                    <div class="srow-info"><div class="srow-name">Import</div></div>
                    <i class="fas fa-chevron-right srow-chev"></i>
                </div>
            </div>

            <!-- Danger zone (account-level actions only — Delete all data lives
                 one more tap away on the Profile detail page to prevent mis-taps) -->
            <div class="group-label group-label--danger">Danger zone</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="signOutUser()">
                    <div class="srow-icon ic-danger"><i class="fas fa-sign-out-alt"></i></div>
                    <div class="srow-info"><div class="srow-name srow-name--danger">Sign out</div></div>
                </div>
                <div class="srow srow--clickable" onclick="rebuildPRsFromSettings()">
                    <div class="srow-icon ic-muted"><i class="fas fa-sync-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Rebuild PRs</div>
                        <div class="srow-desc">Recalculate from workout history</div>
                    </div>
                </div>
            </div>

            <div class="settings-footer">
                Big Surf v${escapeHtml(APP_VERSION)}
            </div>
        </div>
    `;

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

    const experienceOptions = [
        { value: 'beginner', label: 'Beginner', desc: '< 1 year consistent training', icon: 'fa-seedling' },
        { value: 'intermediate', label: 'Intermediate', desc: '1–3 years training', icon: 'fa-fire' },
        { value: 'advanced', label: 'Advanced', desc: '3+ years, know your lifts', icon: 'fa-bolt' },
    ];

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
            footer: `<button class="btn-redesign onb-btn-full" onclick="onboardingNext()">Get Started <i class="fas fa-arrow-right"></i></button>`,
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
                <div class="onb-chips">${chipHTML(experienceOptions, 'experienceLevel', s.experienceLevel || 'intermediate', false)}</div>
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
                <div class="onb-title">Body-weight goal</div>
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
                <div class="onb-title">Your units</div>
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
                <button class="btn-redesign onb-btn-wide" onclick="completeOnboarding()"><i class="fas fa-check"></i> All set!</button>
            `,
        },
    ];

    const step = steps[onboardingStep] || steps[0];

    overlay.innerHTML = `
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
export function editBodyWeightGoal() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const unitLabel = s.weightUnit === 'kg' ? 'kg' : 'lb';
    const current = s.bodyWeightGoal != null ? String(s.bodyWeightGoal) : '';
    const next = prompt(`Target weight in ${unitLabel} (blank to clear):`, current);
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
    const exp = s.profileExperience
        ? s.profileExperience.charAt(0).toUpperCase() + s.profileExperience.slice(1)
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

            <div class="group-label group-label--danger">Danger zone</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="confirmDeleteAllData()">
                    <div class="srow-icon ic-danger"><i class="fas fa-trash"></i></div>
                    <div class="srow-info">
                        <div class="srow-name srow-name--danger">Delete all data</div>
                        <div class="srow-desc">Permanently remove all workouts, templates, equipment, and settings</div>
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
export function editProfileName() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const current = s.profileName || AppState.currentUser?.displayName || '';
    const next = prompt('Display name:', current);
    if (next != null) {
        updateSetting('profileName', next.trim() || null);
        renderProfileDetail();
    }
}
export function editProfileHeight() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const usesImperial = s.weightUnit === 'lbs';
    const current = s.profileHeightCm != null
        ? (usesImperial ? formatHeight(s.profileHeightCm, 'lbs') : String(Math.round(s.profileHeightCm)))
        : '';
    const promptLabel = usesImperial
        ? 'Height (e.g. 5\'10" or 70in):'
        : 'Height in cm:';
    const next = prompt(promptLabel, current);
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
export function editProfileBirthday() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const current = s.profileBirthday || '';
    const next = prompt('Birthday (YYYY-MM-DD):', current);
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
export function editProfileExperience() {
    const s = AppState.settings || DEFAULT_SETTINGS;
    const current = s.profileExperience || '';
    const next = prompt('Experience (beginner / intermediate / advanced):', current);
    if (next != null) {
        const cleaned = next.trim().toLowerCase();
        if (cleaned === '' || ['beginner', 'intermediate', 'advanced'].includes(cleaned)) {
            updateSetting('profileExperience', cleaned || null);
            renderProfileDetail();
        } else {
            showNotification('Use beginner / intermediate / advanced', 'warn');
        }
    }
}
export function closeProfile() { navigateTo('settings-section'); }

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
            showNotification('Failed to rebuild PRs', 'error');
        }
    } catch (error) {
        console.error('PR rebuild failed:', error);
        showNotification('Failed to rebuild PRs', 'error');
    }
}

// ===================================================================
// DELETE ALL DATA (Phase F §4 danger action)
// ===================================================================

// Every user-scoped Firestore subcollection known to this app. Kept here
// (not auto-discovered) because new subcollections must be opted into the
// wipe intentionally — losing data is cheap, leaking it isn't.
const USER_SUBCOLLECTIONS = [
    'workouts',
    'workoutTemplates',
    'equipment',
    'locations',
    'customExercises',
    'exerciseOverrides',
    'measurements',
    'dexa',
    'coachHistory',
];
// Single-doc preference paths to clear alongside the subcollections.
const USER_PREFERENCE_DOCS = ['settings', 'favorites'];

/**
 * Two-step confirm then wipe all user data. Final step signs the user out so
 * they land on the auth screen with a clean slate.
 */
export async function confirmDeleteAllData() {
    const first = window.confirm(
        'Delete ALL your data?\n\n' +
        'This permanently removes every workout, template, equipment entry, ' +
        'location, measurement, DEXA scan, coach conversation, and preference. ' +
        'This cannot be undone.\n\nContinue?'
    );
    if (!first) return;

    const typed = window.prompt('Type DELETE in all caps to confirm:');
    if (typed !== 'DELETE') {
        showNotification('Deletion cancelled', 'info', 2000);
        return;
    }

    showNotification('Deleting your data…', 'info', 10000);
    try {
        const { deletedDocs } = await deleteAllUserData();
        showNotification(`Deleted ${deletedDocs} records. Signing out…`, 'success', 3000);

        // Sign out so the UI doesn't try to render against a wiped profile.
        const { signOutUser } = await import('../app-initialization.js');
        await signOutUser();
    } catch (error) {
        console.error('❌ Delete all data failed:', error);
        showNotification('Delete failed — some data may remain. Try again or contact support.', 'error', 5000);
    }
}

/**
 * Delete every user-scoped doc in Firestore. Returns total deleted count.
 * Uses batched writes (500/batch limit) to stay under Firestore caps.
 */
async function deleteAllUserData() {
    if (!AppState.currentUser) {
        throw new Error('Not signed in');
    }
    const uid = AppState.currentUser.uid;
    let deletedDocs = 0;

    for (const subPath of USER_SUBCOLLECTIONS) {
        const snap = await getDocs(collection(db, 'users', uid, subPath));
        deletedDocs += await deleteDocsInBatches(snap.docs);
    }

    // Preference docs live under preferences/{settings,favorites} — best-effort
    // delete; missing docs just resolve without error.
    for (const prefName of USER_PREFERENCE_DOCS) {
        try {
            await deleteDoc(doc(db, 'users', uid, 'preferences', prefName));
            deletedDocs++;
        } catch (err) {
            // Non-fatal — the doc may not exist for this user.
            console.warn(`Could not delete preferences/${prefName}:`, err);
        }
    }

    // Reset in-memory state so any surviving render pass sees empty data.
    AppState.settings = null;
    AppState.workouts = [];
    AppState.workoutPlans = [];

    return { deletedDocs };
}

async function deleteDocsInBatches(docs) {
    const BATCH_LIMIT = 500;
    let total = 0;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const slice = docs.slice(i, i + BATCH_LIMIT);
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
        total += slice.length;
    }
    return total;
}
