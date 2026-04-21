// App Initialization Module - core/app-initialization.js
// Handles application startup, authentication, and global setup

import {
    auth,
    provider,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    db,
    doc,
    getDoc,
    setDoc,
} from './data/firebase-config.js';
import { GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { AppState } from './utils/app-state.js';
import { debugLog } from './utils/config.js';
import { showNotification, setTodayDisplay, initModalScrollLock, openModal, closeModal, escapeHtml } from './ui/ui-helpers.js';
import { loadWorkoutPlans } from './data/data-manager.js'; // ADD loadWorkoutData here
import { getExerciseLibrary } from './data/exercise-library.js';
import { getWorkoutHistory } from './workout/workout-history.js';
import { initializeWorkoutManagement } from './workout/workout-management-ui.js';
import { initializeErrorHandler, startConnectionMonitoring } from './utils/error-handler.js';

// ===================================================================
// LOADING SCREEN MANAGEMENT
// ===================================================================

export function showLoadingScreen(message = 'Initializing...') {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingMessage = document.getElementById('loading-message');

    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
        loadingScreen.style.opacity = '1';
    }

    if (loadingMessage && message) {
        loadingMessage.textContent = message;
    }
}

export function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

export function showSignInPrompt() {
    const loadingScreen = document.getElementById('loading-screen');
    const signInPrompt = document.getElementById('loading-signin-prompt');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const loadingMessage = document.getElementById('loading-message');

    // Ensure loading screen is visible and covers everything
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
        loadingScreen.style.opacity = '1';
        loadingScreen.style.display = 'flex';
    }

    // Hide spinner and message
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    if (loadingMessage) loadingMessage.style.display = 'none';

    // Show sign-in prompt
    if (signInPrompt) {
        signInPrompt.classList.remove('hidden');
        signInPrompt.style.display = 'block';
    }

    // Hide header and bottom nav when on sign-in screen
    const header = document.querySelector('.header');
    const bottomNav = document.querySelector('.bottom-nav');
    if (header) header.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';

    // Set up sign-in button in loading screen
    const loadingSignInBtn = document.getElementById('loading-signin-btn');
    if (loadingSignInBtn) {
        loadingSignInBtn.onclick = () => {
            signIn();
        };
    }
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const signInPrompt = document.getElementById('loading-signin-prompt');
    const header = document.querySelector('.header');
    const bottomNav = document.querySelector('.bottom-nav');

    // Restore header and nav (they were hidden for sign-in screen)
    if (header) header.style.display = '';
    if (bottomNav) bottomNav.style.display = '';

    // Hide sign-in prompt
    if (signInPrompt) {
        signInPrompt.classList.add('hidden');
        signInPrompt.style.display = 'none';
    }

    if (loadingScreen) {
        // Immediately hide, then add hidden class after fade
        loadingScreen.style.opacity = '0';
        loadingScreen.style.display = 'none'; // Force hide immediately
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 300); // Match CSS transition time
    }
}

// ===================================================================
// MAIN APP INITIALIZATION
// ===================================================================

export function initializeWorkoutApp() {
    // Show loading screen immediately
    showLoadingScreen('Initializing...');

    // Initialize global error handling FIRST
    initializeErrorHandler();

    // Lock body scroll when modals are open (iOS fix)
    initModalScrollLock();

    try {
        updateLoadingMessage('Loading exercise library...');

        // Initialize exercise library BEFORE auth (so it's always available)
        const exerciseLibrary = getExerciseLibrary(AppState);
        exerciseLibrary.initialize();
        window.exerciseLibrary = exerciseLibrary;

        updateLoadingMessage('Initializing workout history...');

        // Initialize workout history
        const workoutHistory = getWorkoutHistory(AppState);
        workoutHistory.initialize();
        window.workoutHistory = workoutHistory;

        // Start connection monitoring
        startConnectionMonitoring(db);
    } catch (error) {
        console.error('Error initializing modules:', error);
        showNotification('Error initializing app modules', 'error');
    }

    // Set up authentication listener first (this will handle redirect result)
    setupAuthenticationListener();
}

export function initializeEnhancedWorkoutSelector() {
    setupWorkoutFilters();
    setupWorkoutSearch();

    if (AppState.workoutPlans && AppState.workoutPlans.length > 0) {
        renderInitialWorkouts();
    }
}

// ===================================================================
// AUTHENTICATION
// ===================================================================

let signingIn = false; // Prevent multiple simultaneous sign-in attempts
let manualSignOut = false; // Track manual sign-out to prevent auth listener interference

export async function signIn() {
    // Prevent multiple popups from opening
    if (signingIn) {
        return;
    }

    try {
        signingIn = true;

        // Create a provider instance with account selection prompt
        const signInProvider = new GoogleAuthProvider();
        signInProvider.setCustomParameters({
            prompt: 'select_account',
        });

        const result = await signInWithPopup(auth, signInProvider);

        // Show loading screen with initialization message
        const loadingScreen = document.getElementById('loading-screen');
        const loadingMessage = document.getElementById('loading-message');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            loadingScreen.style.opacity = '1';
        }
        if (loadingMessage) {
            loadingMessage.textContent = 'Initializing...';
            loadingMessage.style.display = 'block';
        }

        // Hide sign-in prompt, show spinner
        const signInPrompt = document.getElementById('loading-signin-prompt');
        const loadingSpinner = document.querySelector('.loading-spinner');
        if (signInPrompt) {
            signInPrompt.classList.add('hidden');
            signInPrompt.style.display = 'none';
        }
        if (loadingSpinner) loadingSpinner.style.display = 'block';
    } catch (error) {
        console.error('Sign-in error:', error.code, error.message);

        if (error.code === 'auth/popup-closed-by-user') {
            showNotification('Sign-in cancelled', 'info');
        } else if (error.code === 'auth/popup-blocked') {
            showNotification('Popup blocked - please allow popups and try again', 'warning');
        } else if (error.code !== 'auth/cancelled-popup-request') {
            showNotification('Sign-in failed. Please try again.', 'error');
        }
    } finally {
        signingIn = false;
    }
}

export async function signOutUser() {
    try {
        // Set flag BEFORE calling signOut to prevent auth listener from running
        manualSignOut = true;

        // Hide all content sections
        const sections = [
            'workout-selector',
            'active-workout',
            'workout-history-section',
            'workout-management-section',
            'exercise-manager-section',
            'dashboard',
            'muscle-group-detail-section',
            'exercise-detail-section',
            'composition-detail-section',
        ];

        sections.forEach((sectionId) => {
            const section = document.getElementById(sectionId);
            if (section) section.classList.add('hidden');
        });

        // Hide resume workout banner if showing
        const resumeBanner = document.getElementById('resume-workout-banner');
        if (resumeBanner) resumeBanner.classList.add('hidden');

        // Hide the header auth section and show proper loading screen
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.add('hidden');

        // Show loading screen with sign-in prompt (same as fresh page load)
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            loadingScreen.style.opacity = '1';
        }

        showSignInPrompt();

        // NOW sign out (auth listener will skip UI updates due to flag)
        await signOut(auth);

        // Clear app state completely
        AppState.currentUser = null;
        AppState.currentWorkout = null;
        AppState.savedData = {};
        AppState.workoutStartTime = null;
        AppState.workoutPauseStartTime = null;
        AppState.totalPausedTime = 0;
        window.inProgressWorkout = null;

        // Reset flag after a delay to allow auth state change to complete
        setTimeout(() => {
            manualSignOut = false;
        }, 500);
    } catch (error) {
        console.error('Sign-out error:', error);
        showNotification('Error signing out', 'error');
        manualSignOut = false;
    }
}

export function showUserInfo(user) {
    // Hide main auth section entirely
    const authSection = document.getElementById('auth-section');
    if (authSection) {
        authSection.classList.add('hidden');
        authSection.style.display = 'none';
    }

    // Update More menu email
    const moreMenuEmail = document.getElementById('more-menu-email');
    if (moreMenuEmail) moreMenuEmail.textContent = user.email || '';
}

export function hideUserInfo() {
    // Show main auth section
    const authSection = document.getElementById('auth-section');
    if (authSection) authSection.classList.remove('hidden');

}

export function setupAuthenticationListener() {
    // Handle redirect result (user coming back from Google sign-in)
    getRedirectResult(auth)
        .then((result) => {
            // Handled by onAuthStateChanged
        })
        .catch((error) => {
            if (
                error.code &&
                error.code !== 'auth/popup-closed-by-user' &&
                error.code !== 'auth/cancelled-popup-request'
            ) {
                console.error('Redirect sign-in error:', error);
                showNotification('Sign-in failed. Please try again.', 'error');
            }
        });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            AppState.currentUser = user;

            // Update UI
            showUserInfo(user);

            // Update loading message
            updateLoadingMessage('Loading your workouts...');

            // Check and run schema migration if needed (v3.0 - multiple workouts per day)
            try {
                const { checkAndMigrateOnLogin, migrateEquipmentBaseWeight } = await import('./data/schema-migration.js');
                const migrationResult = await checkAndMigrateOnLogin(user.uid);
                if (migrationResult.migrated > 0) {
                    debugLog(`✅ Migrated ${migrationResult.migrated} workouts to schema v3.0`);
                }
                // Equipment base weight migration (v3.1) — idempotent, safe to run every login
                await migrateEquipmentBaseWeight(user.uid);
            } catch (migrationError) {
                // Migration errors shouldn't block login - just log them
                console.error('Migration check failed:', migrationError);
            }

            // Load user settings first (affects unit display, rest timer, etc.)
            const { loadUserSettings, checkOnboarding } = await import('./ui/settings-ui.js');
            await loadUserSettings();

            // Equipment migration v2 — dry-run first, prompt user on destructive changes.
            // Non-blocking: failures don't prevent login.
            checkEquipmentMigrationV3(user.uid).catch((err) => {
                console.error('❌ Equipment migration v2 check failed (non-fatal):', err);
            });

            // Load ALL data FIRST (loadWorkoutPlans loads both plans AND exercises)
            await loadWorkoutPlans(AppState);

            // Load PR tracking data
            const { PRTracker } = await import('./features/pr-tracker.js');
            await PRTracker.loadPRData();

            // Initialize background notifications
            const { initializeNotifications } = await import('./utils/notification-helper.js');
            await initializeNotifications();

            // Initialize Firebase Cloud Messaging for iOS background/lock screen notifications
            try {
                const { initializeFCM } = await import('./utils/push-notification-manager.js');
                await initializeFCM();
            } catch (e) {
                // FCM not available or not configured - local notifications still work
            }

            // Validate and refresh user data
            await validateUserData();

            // THEN check for in-progress workouts (now plans will be loaded!)
            await checkForInProgressWorkoutEnhanced();

            // Hide loading screen - data is ready!
            setTimeout(async () => {
                debugLog('✅ Auth complete, hiding loading screen...');
                hideLoadingScreen();

                // Show dashboard by default - use dynamic import to avoid timing issues
                try {
                    debugLog('📊 Importing dashboard-ui...');
                    const { showDashboard } = await import('./ui/dashboard-ui.js');
                    debugLog('📊 Calling showDashboard...');
                    await showDashboard();
                    debugLog('📊 Dashboard should be visible now');

                    // Process pending Withings OAuth callback + auto-sync on load
                    try {
                        const { processPendingWithingsCallback, getWithingsStatus, syncWithingsWeight } = await import('./features/withings-integration.js');
                        await processPendingWithingsCallback();
                        // Check status and auto-sync if connected (non-blocking)
                        getWithingsStatus().then(async (status) => {
                            if (window.updateWithingsUI) {
                                window._withingsConnected = status.connected;
                                window.updateWithingsUI(status.connected, status.lastSync);
                            }
                            // Auto-sync last 7 days on each app load if connected
                            if (status.connected && !status.expired) {
                                try {
                                    await syncWithingsWeight(7, { silent: true });
                                } catch (syncErr) {
                                    // Silent fail — don't bother user if background sync fails
                                    console.error('❌ Withings auto-sync failed:', syncErr);
                                }
                            }
                        });
                    } catch (e) {
                        console.error('❌ Withings post-auth processing failed:', e);
                    }

                    // Show onboarding if first login
                    checkOnboarding();
                } catch (e) {
                    console.error('❌ Error showing dashboard:', e);
                    // Fallback to window.navigateTo if available
                    if (window.navigateTo) {
                        window.navigateTo('dashboard');
                    }
                }
            }, 500);
        } else {
            AppState.currentUser = null;

            // If this is a manual sign-out, don't run this code (it's already handled)
            if (manualSignOut) {
                return;
            }

            // Hide all content sections
            const sections = [
                'workout-selector',
                'active-workout',
                'workout-history-section',
                'workout-management-section',
                'exercise-manager-section',
                'dashboard',
                'muscle-group-detail-section',
            'exercise-detail-section',
            'composition-detail-section',
            ];

            sections.forEach((sectionId) => {
                const section = document.getElementById(sectionId);
                if (section) section.classList.add('hidden');
            });

            // Hide header auth section
            const authSection = document.getElementById('auth-section');
            if (authSection) authSection.classList.add('hidden');

            // Show loading screen with sign-in prompt
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) loadingScreen.classList.remove('hidden');

            showSignInPrompt();
        }
    });
}

// ===================================================================
// EQUIPMENT MIGRATION V2 (one-time)
// ===================================================================

/**
 * Check whether equipment migration v2 needs to run, and if so either run it
 * silently (non-destructive field normalization only) or prompt the user
 * before committing destructive changes (dedup, rename cascades).
 */
async function checkEquipmentMigrationV3(userId) {
    const { runEquipmentMigrationV3 } = await import('./data/equipment-migration.js');

    const prefsRef = doc(db, 'users', userId, 'preferences', 'settings');
    const prefsSnap = await getDoc(prefsRef);
    if (prefsSnap.data()?.equipmentMigrationV3) {
        return; // Already migrated
    }

    const result = await runEquipmentMigrationV3(userId, { dryRun: true });
    if (!result || !result.preview) return;

    const { duplicatesToMerge, renames, fieldsNormalized, totalRecords } = result.preview;

    // Nothing to migrate (empty library): set the flag and move on
    if (totalRecords === 0) {
        await setDoc(prefsRef, { equipmentMigrationV3: true }, { merge: true });
        return;
    }

    // Destructive changes → prompt the user
    if (duplicatesToMerge > 0 || renames.length > 0) {
        showEquipmentMigrationPrompt(result.preview, userId);
        return;
    }

    // Only field normalization → run silently (no user-visible effect)
    if (fieldsNormalized > 0) {
        await runEquipmentMigrationV3(userId, { dryRun: false });
        debugLog('Equipment migration v2: silent field normalization complete');
        return;
    }

    // Nothing needed beyond setting the flag
    await setDoc(prefsRef, { equipmentMigrationV3: true }, { merge: true });
}

function showEquipmentMigrationPrompt(preview, userId) {
    const modal = document.getElementById('equipment-migration-modal');
    const content = modal?.querySelector('.modal-content');
    if (!modal || !content) {
        console.error('❌ equipment-migration-modal not found in DOM');
        return;
    }

    const summaryItems = [];
    const cm = preview.catalogMatches || { tier1: 0, tier2: 0, tier3: 0, unmatched: 0 };
    const catalogTotal = cm.tier1 + cm.tier2 + cm.tier3;

    if (catalogTotal > 0) {
        summaryItems.push(
            `<li><strong>${catalogTotal}</strong> of ${preview.totalRecords} matched against the equipment catalog</li>`
        );
    }
    if (preview.duplicatesToMerge > 0) {
        summaryItems.push(
            `<li><strong>${preview.duplicatesToMerge}</strong> duplicate${preview.duplicatesToMerge !== 1 ? 's' : ''} will be merged</li>`
        );
    }
    if (preview.fieldsNormalized > 0) {
        summaryItems.push(
            `<li><strong>${preview.fieldsNormalized}</strong> record${preview.fieldsNormalized !== 1 ? 's' : ''} will have brand/line filled in</li>`
        );
    }
    if (preview.workoutsAffected > 0) {
        summaryItems.push(
            `<li><strong>${preview.workoutsAffected}</strong> workout${preview.workoutsAffected !== 1 ? 's' : ''} will be updated</li>`
        );
    }
    if (preview.templatesAffected > 0) {
        summaryItems.push(
            `<li><strong>${preview.templatesAffected}</strong> template${preview.templatesAffected !== 1 ? 's' : ''} will be updated</li>`
        );
    }
    if (cm.unmatched > 0) {
        summaryItems.push(
            `<li class="migration-prompt__summary-muted">${cm.unmatched} unrecognized (string-parsed)</li>`
        );
    }

    const tierLabel = (tier) => {
        if (tier === 1) return 'catalog';
        if (tier === 2) return 'fuzzy';
        if (tier === 3) return 'brand only';
        return 'string';
    };

    const renamesHtml = preview.renames.length > 0
        ? `<details class="migration-prompt__details">
               <summary>Preview name changes (${preview.renames.length})</summary>
               <div class="migration-prompt__rename-list">
                   ${preview.renames.map((r) => `
                       <div class="migration-prompt__rename-item">
                           <div class="migration-prompt__rename-row">
                               <span class="migration-prompt__rename-old">${escapeHtml(r.old)}</span>
                               <i class="fas fa-arrow-right"></i>
                               <span class="migration-prompt__rename-new">${escapeHtml(r.new)}</span>
                               <span class="migration-prompt__tier-badge migration-prompt__tier-badge--${r.tier ?? 0}">${tierLabel(r.tier ?? 0)}</span>
                           </div>
                           ${r.note ? `<div class="migration-prompt__rename-note">${escapeHtml(r.note)}</div>` : ''}
                       </div>
                   `).join('')}
               </div>
           </details>`
        : '';

    content.innerHTML = `
        <div class="migration-prompt">
            <div class="migration-prompt__icon"><i class="fas fa-wrench"></i></div>
            <h3>Equipment Cleanup Ready</h3>
            <ul class="migration-prompt__summary">${summaryItems.join('')}</ul>
            ${renamesHtml}
            <p class="migration-prompt__hint">
                Tip: download a backup first. If anything looks wrong after cleanup,
                you'll have a JSON snapshot of your equipment, workouts, and templates.
            </p>
            <div class="migration-prompt__actions">
                <button class="btn btn-primary" onclick="executeEquipmentMigration()">Run Cleanup</button>
                <button class="btn btn-secondary" onclick="downloadEquipmentMigrationBackup()">
                    <i class="fas fa-download"></i> Download Backup
                </button>
                <button class="btn btn-text" onclick="dismissEquipmentMigration()">Not Now</button>
            </div>
        </div>
    `;

    // Stash userId on the modal so the action handlers can read it
    modal.dataset.userId = userId;
    openModal(modal);
}

export async function executeEquipmentMigration() {
    const modal = document.getElementById('equipment-migration-modal');
    const userId = modal?.dataset?.userId || AppState.currentUser?.uid;
    if (!userId) return;

    closeModal(modal);
    showNotification('Cleaning up equipment…', 'info', 2000);

    try {
        const { runEquipmentMigrationV3 } = await import('./data/equipment-migration.js');
        const result = await runEquipmentMigrationV3(userId, { dryRun: false });
        const merged = result.merged || 0;
        const cm = result.catalogMatches;
        const catalogIdentified = cm ? cm.tier1 + cm.tier2 : 0;
        const msg = catalogIdentified > 0
            ? `Cleanup done — identified ${catalogIdentified} from catalog, merged ${merged} duplicate${merged !== 1 ? 's' : ''}`
            : `Cleanup done — merged ${merged} duplicate${merged !== 1 ? 's' : ''}`;
        showNotification(msg, 'success', 3500);
    } catch (err) {
        console.error('❌ Equipment migration failed:', err);
        showNotification('Equipment cleanup failed — see console', 'error', 4000);
    }
}

export function dismissEquipmentMigration() {
    const modal = document.getElementById('equipment-migration-modal');
    closeModal(modal);
    // Flag stays false — we'll ask again next session.
}

/**
 * Triggered from the "Download Backup" button in the migration prompt.
 * Fetches equipment + workouts + templates, serializes to JSON, and
 * triggers a browser download. Does not touch the migration flag or
 * close the modal — user still needs to confirm/dismiss after saving.
 */
export async function downloadEquipmentMigrationBackup() {
    const userId = AppState.currentUser?.uid;
    if (!userId) return;

    try {
        showNotification('Preparing backup…', 'info', 1500);
        const { exportPreMigrationSnapshot } = await import('./data/equipment-migration.js');
        const snapshot = await exportPreMigrationSnapshot(userId);

        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bigsurf-equipment-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Backup downloaded', 'success', 2000);
    } catch (err) {
        console.error('❌ Equipment migration backup failed:', err);
        showNotification('Backup failed — see console', 'error', 4000);
    }
}

// ===================================================================
// DATA LOADING AND VALIDATION
// ===================================================================

export async function validateUserData() {
    if (!AppState.currentUser) return;

    try {
        await refreshExerciseDatabase();

        const { FirebaseWorkoutManager } = await import('./data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
    } catch (error) {
        console.error('Error validating user data:', error);
        showNotification('Error loading user data', 'warning');
    }
}

export async function refreshExerciseDatabase() {
    try {
        if (AppState.currentUser) {
            const { FirebaseWorkoutManager } = await import('./data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
        } else {
            const exerciseResponse = await fetch('./data/exercises.json');
            if (exerciseResponse.ok) {
                AppState.exerciseDatabase = await exerciseResponse.json();
            }
        }
    } catch (error) {
        console.error('Error refreshing exercise database:', error);
    }
}

export function fillTemplateValues() {
    if (AppState.workoutPlans) {
        AppState.workoutPlans.forEach((plan) => {
            if (plan.exercises) {
                plan.exercises.forEach((exercise) => {
                    exercise.sets = exercise.sets || 3;
                    exercise.reps = exercise.reps || 10;
                    exercise.weight = exercise.weight || 50;
                });
            }
        });
    }
}

// ===================================================================
// IN-PROGRESS WORKOUT CHECK
// ===================================================================

async function checkForInProgressWorkoutEnhanced() {
    try {
        const { loadTodaysWorkout } = await import('./data/data-manager.js');
        const todaysData = await loadTodaysWorkout(AppState);

        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            // Validate workout plan exists
            const workoutPlan = AppState.workoutPlans.find(
                (plan) =>
                    plan.day === todaysData.workoutType ||
                    plan.name === todaysData.workoutType ||
                    plan.id === todaysData.workoutType
            );

            if (!workoutPlan) {
                return;
            }

            // Store in-progress workout globally
            // Use todaysData.originalWorkout if it exists (contains modified exercise list)
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: todaysData.originalWorkout || workoutPlan,
            };

            // Activate FAB animation to signal active workout
            const { setWorkoutActiveState } = await import('./ui/navigation.js');
            setWorkoutActiveState(true);

            // Show in-progress workout prompt
            showInProgressWorkoutPrompt(todaysData);
        }
    } catch (error) {
        console.error('Error checking for in-progress workout:', error);
    }
}

function showInProgressWorkoutPrompt(workoutData) {
    if (window.showingProgressPrompt) return;
    window.showingProgressPrompt = true;

    // Update card elements
    const card = document.getElementById('resume-workout-banner');
    const nameElement = document.getElementById('resume-workout-name');
    const setsElement = document.getElementById('resume-sets-completed');
    const timeElement = document.getElementById('resume-time-ago');

    if (card && nameElement) {
        // Set workout name
        nameElement.textContent = workoutData.workoutType;

        // Calculate sets completed
        let completedSets = 0;
        let totalSets = 0;
        if (workoutData.exercises) {
            Object.keys(workoutData.exercises).forEach((key) => {
                const exercise = workoutData.exercises[key];
                if (exercise && exercise.sets) {
                    exercise.sets.forEach((set) => {
                        totalSets++;
                        if (set.reps && set.weight) completedSets++;
                    });
                }
            });
        }
        if (setsElement) {
            setsElement.textContent = `${completedSets}/${totalSets} sets`;
        }

        // Update progress bar
        const progressFill = document.getElementById('resume-progress-fill');
        if (progressFill && totalSets > 0) {
            const progressPercent = Math.min((completedSets / totalSets) * 100, 100);
            progressFill.style.width = `${progressPercent}%`;
        }

        // Calculate time ago
        if (timeElement && workoutData.startedAt) {
            const startTime = new Date(workoutData.startedAt);
            const now = new Date();
            const diffMs = now - startTime;
            const diffMins = Math.floor(diffMs / 60000);

            let timeAgo;
            if (diffMins < 1) timeAgo = 'just now';
            else if (diffMins < 60) timeAgo = `${diffMins} min ago`;
            else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
            else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;

            timeElement.textContent = timeAgo;
        }

        // Show the card
        card.classList.remove('hidden');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Fallback to old confirm dialog if card elements not found
        console.warn('Resume card elements not found, using fallback confirm dialog');
        const workoutDate = new Date(workoutData.date).toLocaleDateString();
        const message = `You have an in-progress "${workoutData.workoutType}" workout from ${workoutDate}.\n\nWould you like to continue where you left off?`;

        setTimeout(() => {
            if (confirm(message)) {
                import('./workout/workout-core.js').then((module) => {
                    module.continueInProgressWorkout();
                });
            } else {
                import('./workout/workout-core.js').then((module) => {
                    module.discardInProgressWorkout();
                });
            }
            window.showingProgressPrompt = false;
        }, 1000);
    }
}

// ===================================================================
// GLOBAL EVENT LISTENERS
// ===================================================================

export function setupEventListeners() {
    setTimeout(() => {
        setupSignInListeners();
    }, 500);
    setupOtherEventListeners();
}

function setupSignInListeners() {
    const signInButtons = document.querySelectorAll('#sign-in-btn, #loading-signin-btn');

    signInButtons.forEach((btn) => {
        btn.onclick = null;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (typeof window.signIn === 'function') {
                window.signIn();
            } else {
                console.error(' window.signIn is not a function');
            }
        });
    });

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOutUser();
        });
    }
}

function setupOtherEventListeners() {
    // Global unit toggle
    const globalUnitToggle = document.querySelector('.global-settings .unit-toggle');
    if (globalUnitToggle) {
        globalUnitToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('unit-btn')) {
                import('./workout/workout-core.js').then((module) => {
                    module.setGlobalUnit(e.target.dataset.unit);
                });
            }
        });
    }

    // Close modal buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-modal') || e.target.closest('.close-modal')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeModal(modal);
            }
        }
    });

    // Close modal on backdrop click (div modals and dialog modals)
    document.addEventListener('click', (e) => {
        // For div modals: clicking the overlay background
        if (e.target.classList.contains('modal') && e.target.tagName !== 'DIALOG') {
            closeModal(e.target);
        }
        // For dialog modals: clicking outside .modal-content closes the dialog
        if (e.target.tagName === 'DIALOG' && e.target.classList.contains('modal')) {
            const rect = e.target.querySelector('.modal-content')?.getBoundingClientRect();
            if (rect && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) {
                closeModal(e.target);
            }
        }
    });

    // ESC key to close modals (dialog handles ESC natively, this covers div modals)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal:not(.hidden):not(dialog)');
            if (activeModal) {
                closeModal(activeModal);
            }
        }
    });
}

export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('workout-search') || document.getElementById('exercise-search');
            if (searchInput) {
                searchInput.focus();
            }
        }

        // Space to pause/resume timer
        if (e.key === ' ' && AppState.globalRestTimer) {
            e.preventDefault();
            // Toggle timer pause (would need to implement pause functionality)
        }

        // ESC to close any open div modals (dialog modals handle ESC natively)
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal:not(.hidden):not(dialog)');
            if (activeModal) {
                e.preventDefault();
                closeModal(activeModal);
            }
        }
    });
}

// ===================================================================
// WORKOUT SELECTOR SETUP
// ===================================================================

function setupWorkoutFilters() {
    const filterButtons = document.querySelectorAll('.workout-filter-btn');
    filterButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const category = e.target.dataset.category;
            filterWorkoutsByCategory(category);
        });
    });
}

function setupWorkoutSearch() {
    const searchInput = document.getElementById('workout-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounceWorkoutSearch);
    }
}

function filterWorkoutsByCategory(category) {
    // Update active filter
    document.querySelectorAll('.workout-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Import and use template selection module
    import('./ui/template-selection.js').then((module) => {
        module.filterTemplates(category);
    });
}

function debounceWorkoutSearch(event) {
    clearTimeout(debounceWorkoutSearch.timeout);
    debounceWorkoutSearch.timeout = setTimeout(() => {
        const query = event.target.value;

        // Import and use template selection module
        import('./ui/template-selection.js').then((module) => {
            module.searchTemplates(query);
        });
    }, 300);
}

function renderInitialWorkouts() {
    // Import and use template selection module
    import('./ui/template-selection.js').then((module) => {
        module.loadTemplatesByCategory();
    });
}

// ===================================================================
// GLOBAL SETUP HELPERS
// ===================================================================

export function setupGlobalVariables() {
    window.showingProgressPrompt = false;
    window.historyListenersSetup = false;
}

export function initializeModules() {
    try {
        initializeWorkoutManagement(AppState);
        setTodayDisplay();
    } catch (error) {
        console.error('Error initializing modules:', error);
        showNotification('Some features may not work properly', 'warning');
    }
}

// ===================================================================
// MAIN ENTRY POINT
// ===================================================================

export function startApplication() {
    registerServiceWorker();
    setupGlobalVariables();
    initializeWorkoutApp();
    setupEventListeners();
    setupKeyboardShortcuts();
    initializeModules();
    initializeEnhancedWorkoutSelector();
}

// ===================================================================
// SERVICE WORKER REGISTRATION
// ===================================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('./service-worker.js')
                .then((registration) => {
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showNotification('App update available! Refresh to update.', 'info');
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }
}
