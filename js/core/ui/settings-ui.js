// Settings UI Module - core/ui/settings-ui.js
// User-configurable settings with Firestore persistence

import { AppState } from '../utils/app-state.js';
import { Config } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr } from './ui-helpers.js';
import { db, doc, setDoc, getDoc } from '../data/firebase-config.js';
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

    // Plate Calculator
    plateLbs: [45, 35, 25, 10, 5, 2.5],
    plateKg: [20, 15, 10, 5, 2.5, 1.25],
    plateBarLbs: 45,
    plateBarKg: 20,

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
        <div class="settings-page" style="padding: 14px 16px 80px;">

            <!-- Profile card -->
            <div class="profile-card">
                <div class="profile-avatar">
                    ${photoURL ? `<img src="${escapeAttr(photoURL)}" alt="">` : ''}
                </div>
                <div class="profile-info">
                    <div class="profile-name">${escapeHtml(displayName)}</div>
                    <div class="profile-email">${escapeHtml(email)}</div>
                </div>
                <i class="fas fa-chevron-right" style="color: var(--text-muted);"></i>
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
                <div class="srow">
                    <div class="srow-icon ic-primary"><i class="fas fa-weight"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Body weight goal</div>
                        <div class="srow-desc">Colors the delta on the dashboard</div>
                    </div>
                    ${segmented('weightGoal', [
                        { value: '', label: 'Off' },
                        { value: 'lose', label: 'Lose' },
                        { value: 'maintain', label: 'Maintain' },
                        { value: 'gain', label: 'Gain' },
                    ], s.weightGoal || '', 'string')}
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
                        <span style="color: var(--primary); font-size: 0.74rem; font-weight: 600;">Connect</span>
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

            <!-- Danger zone -->
            <div class="group-label group-label--danger">Danger zone</div>
            <div class="group">
                <div class="srow srow--clickable" onclick="signOutUser()">
                    <div class="srow-icon ic-danger"><i class="fas fa-sign-out-alt"></i></div>
                    <div class="srow-info"><div class="srow-name" style="color: var(--danger);">Sign out</div></div>
                </div>
                <div class="srow srow--clickable" onclick="rebuildPRsFromSettings()">
                    <div class="srow-icon ic-muted"><i class="fas fa-sync-alt"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Rebuild PRs</div>
                        <div class="srow-desc">Recalculate from workout history</div>
                    </div>
                </div>
            </div>

            <div style="text-align: center; margin-top: 20px; font-size: 0.7rem; color: var(--text-muted);">
                Big Surf v3.1 · Equipment Weight + Bodyweight Tracking
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
    onboardingStep = 0;

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
    const totalSteps = 4;

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
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;">
                    <img src="BigSurfNoBG.png" alt="Big Surf" style="width:120px;height:120px;object-fit:contain;margin:0 auto 18px;" onerror="this.style.display='none'">
                    <div class="onb-title">Welcome to<br>Big Surf</div>
                    <div class="onb-desc">Track your lifts, hit PRs, see trends. Let's set up your profile in under a minute.</div>
                </div>
            `,
            footer: `<button class="btn-redesign" style="flex:1;" onclick="onboardingNext()">Get Started <i class="fas fa-arrow-right"></i></button>`,
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
                <button class="btn-redesign" style="flex:2;" onclick="onboardingNext()">Next <i class="fas fa-arrow-right"></i></button>
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
                <button class="btn-redesign" style="flex:2;" onclick="onboardingNext()">Next <i class="fas fa-arrow-right"></i></button>
            `,
        },

        // Step 3: Units & Preferences
        {
            body: `
                <div class="onb-icon-hero ic-blue"><i class="fas fa-sliders-h"></i></div>
                <div class="onb-title">Your units</div>
                <div class="onb-desc">Set defaults. Changeable later in Settings.</div>

                <div style="margin-bottom:12px;">
                    <div class="group-label" style="margin-top:0;">Weight</div>
                    <div class="segmented" style="background:var(--bg-card);padding:4px;">
                        <button style="padding:10px;" class="${s.weightUnit === 'lbs' ? 'active' : ''}" onclick="updateSetting('weightUnit','lbs'); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">Pounds (lb)</button>
                        <button style="padding:10px;" class="${s.weightUnit === 'kg' ? 'active' : ''}" onclick="updateSetting('weightUnit','kg'); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">Kilograms (kg)</button>
                    </div>
                </div>
                <div style="margin-bottom:12px;">
                    <div class="group-label" style="margin-top:0;">Rest timer default</div>
                    <div class="segmented" style="background:var(--bg-card);padding:4px;">
                        ${[60, 90, 120, 180].map(v => {
                            const label = v < 120 ? `${v}s` : `${v / 60} min`;
                            return `<button style="padding:10px;" class="${s.restTimerDuration === v ? 'active' : ''}" onclick="updateSetting('restTimerDuration',${v}); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">${label}</button>`;
                        }).join('')}
                    </div>
                </div>
            `,
            footer: `
                <button class="btn-ghost" onclick="onboardingBack()">Back</button>
                <button class="btn-redesign" style="flex:2;" onclick="completeOnboarding()"><i class="fas fa-check"></i> All set!</button>
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
    renderOnboardingStep();
}

export function onboardingBack() {
    if (onboardingStep > 0) onboardingStep--;
    renderOnboardingStep();
}

export function completeOnboarding() {
    updateSetting('hasCompletedOnboarding', true);

    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.remove();
}

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
