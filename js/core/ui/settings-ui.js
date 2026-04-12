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

    // Plate Calculator
    plateLbs: [45, 35, 25, 10, 5, 2.5],
    plateKg: [20, 15, 10, 5, 2.5, 1.25],
    plateBarLbs: 45,
    plateBarKg: 20,

    // Meta
    hasCompletedOnboarding: false,
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
 * Render the settings page into #settings-content.
 */
export function renderSettings() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const s = AppState.settings || DEFAULT_SETTINGS;

    container.innerHTML = `
        <div class="settings-page">
            <div class="settings-group">
                <h3 class="settings-group-title">Workout</h3>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Weight Unit</span>
                        <span class="settings-description">Default unit for new exercises</span>
                    </div>
                    <div class="settings-control">
                        <select onchange="updateSetting('weightUnit', this.value)">
                            <option value="lbs" ${s.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
                            <option value="kg" ${s.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                        </select>
                    </div>
                </div>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Rest Timer</span>
                        <span class="settings-description">Default duration between sets</span>
                    </div>
                    <div class="settings-control">
                        <select onchange="updateSetting('restTimerDuration', parseInt(this.value))">
                            <option value="30" ${s.restTimerDuration === 30 ? 'selected' : ''}>30s</option>
                            <option value="60" ${s.restTimerDuration === 60 ? 'selected' : ''}>1 min</option>
                            <option value="90" ${s.restTimerDuration === 90 ? 'selected' : ''}>1:30</option>
                            <option value="120" ${s.restTimerDuration === 120 ? 'selected' : ''}>2 min</option>
                            <option value="180" ${s.restTimerDuration === 180 ? 'selected' : ''}>3 min</option>
                            <option value="300" ${s.restTimerDuration === 300 ? 'selected' : ''}>5 min</option>
                        </select>
                    </div>
                </div>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Auto-start Timer</span>
                        <span class="settings-description">Start rest timer after completing a set</span>
                    </div>
                    <div class="settings-control">
                        <label class="toggle-switch">
                            <input type="checkbox" ${s.restTimerAutoStart ? 'checked' : ''} onchange="updateSetting('restTimerAutoStart', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Timer Vibration</span>
                        <span class="settings-description">Vibrate when rest timer expires</span>
                    </div>
                    <div class="settings-control">
                        <label class="toggle-switch">
                            <input type="checkbox" ${s.restTimerVibration ? 'checked' : ''} onchange="updateSetting('restTimerVibration', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="settings-group">
                <h3 class="settings-group-title">Goals</h3>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Weekly Workout Goal</span>
                        <span class="settings-description">Days per week</span>
                    </div>
                    <div class="settings-control">
                        <select onchange="updateSetting('weeklyGoal', parseInt(this.value))">
                            ${[1, 2, 3, 4, 5, 6, 7].map(n =>
                                `<option value="${n}" ${s.weeklyGoal === n ? 'selected' : ''}>${n}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="settings-group">
                <h3 class="settings-group-title">Data</h3>

                <div class="settings-item" style="cursor: pointer;" onclick="exportWorkoutData(window.AppState)">
                    <div class="settings-label">
                        <span class="settings-name">Export Data</span>
                        <span class="settings-description">Download all workouts as JSON</span>
                    </div>
                    <div class="settings-control">
                        <i class="fas fa-download" style="color: var(--primary);"></i>
                    </div>
                </div>

                <div class="settings-item" style="cursor: pointer;" onclick="rebuildPRsFromSettings()">
                    <div class="settings-label">
                        <span class="settings-name">Rebuild PRs</span>
                        <span class="settings-description">Recalculate personal records from workout history</span>
                    </div>
                    <div class="settings-control">
                        <i class="fas fa-sync-alt" style="color: var(--primary);"></i>
                    </div>
                </div>
            </div>

            <div class="settings-group">
                <h3 class="settings-group-title">About</h3>

                <div class="settings-item">
                    <div class="settings-label">
                        <span class="settings-name">Big Surf Workout Tracker</span>
                        <span class="settings-description">v3.0 — Sprint 3</span>
                    </div>
                </div>
            </div>
        </div>
    `;
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

    const steps = [
        // Step 0: Welcome
        `<div class="onboarding-card">
            <div class="onboarding-icon"><i class="fas fa-water"></i></div>
            <h2>Welcome to Big Surf</h2>
            <p>Let's set up your gym in under 30 seconds.</p>
            <button class="btn btn-primary btn-full" onclick="onboardingNext()">Get Started</button>
        </div>`,

        // Step 1: Unit preference
        `<div class="onboarding-card">
            <h2>How do you track weight?</h2>
            <div class="onboarding-choices">
                <button class="btn ${s.weightUnit === 'lbs' ? 'btn-primary' : 'btn-secondary'} btn-large" onclick="updateSetting('weightUnit', 'lbs'); onboardingNext()">
                    <strong>lbs</strong><br><span style="font-size: 0.8rem;">Pounds</span>
                </button>
                <button class="btn ${s.weightUnit === 'kg' ? 'btn-primary' : 'btn-secondary'} btn-large" onclick="updateSetting('weightUnit', 'kg'); onboardingNext()">
                    <strong>kg</strong><br><span style="font-size: 0.8rem;">Kilograms</span>
                </button>
            </div>
        </div>`,

        // Step 2: Weekly goal
        `<div class="onboarding-card">
            <h2>Weekly workout goal?</h2>
            <p>How many days per week do you want to train?</p>
            <div class="onboarding-goal-picker">
                ${[3, 4, 5, 6, 7].map(n => `
                    <button class="onboarding-goal-btn ${(s.weeklyGoal || 5) === n ? 'active' : ''}"
                            onclick="updateSetting('weeklyGoal', ${n}); document.querySelectorAll('.onboarding-goal-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active');">
                        ${n}
                    </button>
                `).join('')}
            </div>
            <button class="btn btn-primary btn-full" style="margin-top: 20px;" onclick="onboardingNext()">Continue</button>
        </div>`,

        // Step 3: Ready
        `<div class="onboarding-card">
            <div class="onboarding-icon"><i class="fas fa-check-circle" style="color: var(--success);"></i></div>
            <h2>You're all set!</h2>
            <p>Start your first workout from the dashboard.</p>
            <button class="btn btn-primary btn-full" onclick="completeOnboarding()">Let's Go</button>
        </div>`,
    ];

    overlay.innerHTML = steps[onboardingStep] || '';
}

export function onboardingNext() {
    onboardingStep++;
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
    showNotification('Rebuilding PRs...', 'info', 2000);
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
