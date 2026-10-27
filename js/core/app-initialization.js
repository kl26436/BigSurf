// App Initialization Module - core/app-initialization.js
// Handles application startup, authentication, and global setup

import {
    auth,
    onAuthStateChanged,
    signInWithPopup,
    getRedirectResult,
    signOut,
    db,
    doc,
    getDoc,
    setDoc,
} from './data/firebase-config.js';
import { GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { AppState } from './utils/app-state.js';
import { debugLog, perfMark } from './utils/config.js';
import { showNotification, setTodayDisplay, initModalScrollLock, openModal, closeModal, escapeHtml } from './ui/ui-helpers.js';
import { loadWorkoutPlans } from './data/data-manager.js'; // ADD loadWorkoutData here
import { getExerciseLibrary } from './data/exercise-library.js';
import { getWorkoutHistory } from './workout/workout-history.js';
import { initializeWorkoutManagement } from './workout/workout-management-ui.js';
import { initializeErrorHandler, startConnectionMonitoring } from './utils/error-handler.js';

// ===================================================================
// LOADING SCREEN MANAGEMENT
// ===================================================================

export function showLoadingScreen(message = 'Initializing…') {
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
// KEYBOARD-AWARE FOCUS HANDLER
// ===================================================================

let _keyboardFocusHandlerInstalled = false;
function installKeyboardAwareFocusHandler() {
    if (_keyboardFocusHandlerInstalled) return;
    _keyboardFocusHandlerInstalled = true;
    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
        // Wait for the keyboard animation, then center the input in the
        // visible area. Browsers without `interactive-widget=resizes-content`
        // still benefit from this because scrollIntoView respects the
        // visualViewport on most modern engines.
        setTimeout(() => {
            try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* noop */ }
            // iOS Safari's scrollIntoView silently no-ops inside top-layer
            // <dialog> elements (7/15 report: workout-notes textarea in
            // #workout-completion-modal, 278px overhang after scroll should
            // have fired). Verify against the visualViewport and manually
            // scroll the nearest scrollable ancestor if the input is still
            // occluded.
            requestAnimationFrame(() => forceScrollInputIntoView(t));
        }, 300);

        // Silent health check for the recurring "search results hidden under
        // keyboard" report class. Waits past the keyboard animation + our
        // scrollIntoView, then measures the input's bottom against the
        // visualViewport height. If the input is behind the keyboard, log
        // with the surrounding sheet/modal context so I can see which
        // screen still fails despite the last round of fixes.
        setTimeout(() => scheduleKeyboardOcclusionCheck(t), 600);
    });
}

// Fallback for iOS Safari + top-layer <dialog>: walk up looking for the nearest
// element that actually scrolls, then set its scrollTop so the input sits above
// the keyboard with a small breathing pad.
function forceScrollInputIntoView(input) {
    if (!input || !input.isConnected) return;
    if (document.activeElement !== input) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const rect = input.getBoundingClientRect();
    const bottomPad = 16;
    // Visible band in layout-viewport coords is [offsetTop, offsetTop+height]
    // — iOS scrolls the layout viewport when it brings an input into view, so
    // ignoring offsetTop flagged (and tried to scroll) inputs that were fine.
    const overhang = Math.round(rect.bottom - (vv.offsetTop + vv.height) + bottomPad);
    if (overhang <= 0) return; // already visible; nothing to do

    // Find the closest scrollable ancestor. A scrollable element has
    // overflow-y auto|scroll AND scrollHeight > clientHeight. Fall back to
    // the document element if nothing scrolls internally.
    let el = input.parentElement;
    while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        const canScroll = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
        if (canScroll) break;
        el = el.parentElement;
    }
    const scroller = (el && el !== document.body) ? el : document.scrollingElement || document.documentElement;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollTop + overhang;
}

// Rate-limit the keyboard-occlusion detector to once per 5 minutes. Was
// firing on every set-input focus during a workout (14+ hits in one 7/7
// session), each of which is a Firestore write that piled up on the
// reconnecting channel after a backgrounding cycle. One report per session
// is enough to diagnose the pattern; more is just spam that contributed
// to the "app slows down" report.
let _lastOcclusionLog = 0;

async function scheduleKeyboardOcclusionCheck(input) {
    if (!input || !input.isConnected) return;
    if (document.activeElement !== input) return; // user moved on; not our problem

    const vv = window.visualViewport;
    // No visualViewport → can't reliably tell if keyboard is up; skip.
    if (!vv) return;

    const rect = input.getBoundingClientRect();
    // Threshold: input's bottom edge sitting BELOW the visible viewport by
    // more than a hair. On iOS Safari, when the keyboard covers the input,
    // rect.bottom stays at its layout-viewport position but vv.height
    // shrinks — the diff is the occluded distance.
    // Same offsetTop-aware band as forceScrollInputIntoView — three of the
    // Aug/Sep "occlusion" hits had offsetTop 119–236 and were false positives.
    const overhang = Math.round(rect.bottom - (vv.offsetTop + vv.height));
    if (overhang <= 8) return;

    // Rate-limit: 5 minutes between captures per session.
    const now = Date.now();
    if (now - _lastOcclusionLog < 5 * 60 * 1000) return;
    _lastOcclusionLog = now;

    try {
        const { captureWarning } = await import('./utils/error-handler.js');
        const sheet = input.closest('.aw-sheet, .modal, .field-search--sticky');
        captureWarning(
            `Keyboard occluding input — ${overhang}px overhang below viewport`,
            'installKeyboardAwareFocusHandler',
            {
                overhang,
                inputRect: {
                    top: Math.round(rect.top),
                    bottom: Math.round(rect.bottom),
                    height: Math.round(rect.height),
                },
                inputTag: input.tagName,
                inputId: input.id || null,
                inputPlaceholder: input.placeholder || null,
                inputClasses: input.className || null,
                surroundingSheet: sheet ? {
                    id: sheet.id || null,
                    classes: sheet.className,
                    computedBottom: getComputedStyle(sheet).bottom,
                    inlineBottom: sheet.style.bottom || null,
                } : null,
                visualViewport: {
                    height: Math.round(vv.height),
                    offsetTop: Math.round(vv.offsetTop),
                },
                windowInnerHeight: window.innerHeight,
                kbInsetVar: getComputedStyle(document.documentElement)
                    .getPropertyValue('--kb-inset').trim() || null,
                userAgent: navigator.userAgent || null,
                platform: navigator.platform || null,
            }
        );
    } catch {
        // Diagnostic must never break input focus.
    }
}

// Track keyboard inset via visualViewport so fixed pinned sections can shrink
// instead of being hidden behind the on-screen keyboard. iOS Safari before 17
// (and other engines that ignore interactive-widget=resizes-content) leaves the
// layout viewport at full height — without this, scroll containers extend
// behind the keyboard and the focused input's nearby results are hidden.
let _keyboardInsetTrackerInstalled = false;
function installKeyboardInsetTracker() {
    if (_keyboardInsetTrackerInstalled) return;
    if (typeof window === 'undefined' || !window.visualViewport) return;
    _keyboardInsetTrackerInstalled = true;
    const vv = window.visualViewport;

    // Compute + apply --kb-inset. Cheap; safe to fire on every viewport
    // event. Kept separate from the (throttled) follow-up scroll so we
    // don't accidentally miss inset updates when the scroll is skipped.
    const updateInset = () => {
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
        // SH-2b — sheet footers step aside while the keyboard is up.
        document.documentElement.classList.toggle('kb-open', inset > 40);
    };

    // If the focused input is now behind the keyboard, re-scroll it into
    // view. Throttled by two guards:
    //   1) rAF-coalesced so a burst of viewport events during keyboard
    //      animation runs the check ONCE per frame, not per event.
    //   2) A 500ms cooldown after each fire so we don't stack overlapping
    //      smooth-scroll animations — those confuse the browser and were
    //      the source of the 7/7 "screen slows down after backgrounding
    //      and tapping a set" report.
    let _followupScheduled = false;
    let _lastFollowupAt = 0;
    const scheduleFollowupScroll = () => {
        if (_followupScheduled) return;
        _followupScheduled = true;
        requestAnimationFrame(() => {
            _followupScheduled = false;
            const now = Date.now();
            if (now - _lastFollowupAt < 500) return;
            const el = document.activeElement;
            if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
            const rect = el.getBoundingClientRect();
            if (rect.bottom > vv.offsetTop + vv.height - 8) {
                _lastFollowupAt = now;
                // This is the pass that actually lands after the keyboard
                // finishes animating (the focusin one-shot at 300ms often
                // runs before the viewport has shrunk). It must use the manual
                // scroller: scrollIntoView no-ops inside top-layer <dialog>s,
                // which is why the completion-modal notes box kept firing the
                // occlusion detector Jul–Sep despite the 7/15 fix.
                forceScrollInputIntoView(el);
            }
        });
    };

    const update = () => {
        updateInset();
        scheduleFollowupScroll();
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Self-heal paths. iOS Safari occasionally drops the visualViewport.resize
    // event when an input is blurred as part of a page transition — leaving
    // --kb-inset stranded at the keyboard height. When that happens, any
    // element anchored to --kb-inset (previously the more menu) opens
    // floating in the middle of the screen. These extra triggers force a
    // recompute at moments the app naturally comes back into focus so a
    // stranded value corrects itself within a few hundred ms.
    //
    // Only recompute the inset (cheap) — don't schedule a follow-up scroll
    // on the self-heal paths. The 7/7 "app slows down after backgrounding
    // and tapping a set" report was partly caused by visibilitychange
    // firing a scrollIntoView on foreground, then again on the burst of
    // visualViewport events during keyboard re-open.
    document.addEventListener('focusout', () => setTimeout(updateInset, 50));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateInset();
    });
    window.addEventListener('focus', updateInset);
    window.addEventListener('pageshow', updateInset);
    updateInset();
}

// ===================================================================
// MAIN APP INITIALIZATION
// ===================================================================

export function initializeWorkoutApp() {
    // Show loading screen immediately
    showLoadingScreen('Initializing…');

    // Initialize global error handling FIRST
    initializeErrorHandler();

    // Lock body scroll when modals are open (iOS fix)
    initModalScrollLock();

    // Keep focused inputs visible above the soft keyboard (Phase 0).
    // Combined with `interactive-widget=resizes-content` on the viewport meta
    // and dvh-based sheet heights, this prevents bottom-anchored search
    // results from rendering under the on-screen keyboard.
    installKeyboardAwareFocusHandler();
    installKeyboardInsetTracker();

    // SH-0 — ?debug shell HUD (lazy: never loaded without ?debug).
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
        import('./utils/shell-hud.js')
            .then(m => m.installShellHud({ autoSnap: params.has('snap') }))
            .catch(() => { /* debug aid only */ });
    }

    try {
        updateLoadingMessage('Loading exercise library…');

        // Initialize exercise library BEFORE auth (so it's always available)
        const exerciseLibrary = getExerciseLibrary(AppState);
        exerciseLibrary.initialize();
        window.exerciseLibrary = exerciseLibrary;

        updateLoadingMessage('Initializing workout history…');

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

        await signInWithPopup(auth, signInProvider);

        // Show loading screen with initialization message
        const loadingScreen = document.getElementById('loading-screen');
        const loadingMessage = document.getElementById('loading-message');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            loadingScreen.style.opacity = '1';
        }
        if (loadingMessage) {
            loadingMessage.textContent = 'Initializing…';
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
            showNotification('Popup blocked — allow popups and try again', 'warning');
        } else if (error.code !== 'auth/cancelled-popup-request') {
            showNotification('Sign-in failed — try again', 'error');
        }
    } finally {
        signingIn = false;
    }
}

export async function signOutUser() {
    try {
        // Set flag BEFORE calling signOut to prevent auth listener from running
        manualSignOut = true;
        // PF-3 — the next account's first dashboard paint shows the skeleton, not ours.
        document.getElementById('dashboard-content')?.removeAttribute('data-rendered');
        import('./data/server-sync.js').then(({ stopWatchingServerWrites }) => stopWatchingServerWrites()).catch(() => {});

        // Hide all content sections
        const sections = [
            'workout-selector',
            'active-workout',
            'workout-history-section',
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
}

export function hideUserInfo() {
    // Show main auth section
    const authSection = document.getElementById('auth-section');
    if (authSection) authSection.classList.remove('hidden');

}

/**
 * PF-1 — one-time login maintenance, after the dashboard paints. Each step
 * reads a whole collection, so each runs until it completes cleanly once and
 * then never again (a flag on preferences/settings, already in memory).
 */
async function runLoginMaintenance(uid) {
    const { updateSetting } = await import('./ui/settings-ui.js');
    const s = AppState.settings || {};
    if (!s.schemaV3Checked || !s.equipmentBaseWeightChecked) {
        const { checkAndMigrateOnLogin, migrateEquipmentBaseWeight } = await import('./data/schema-migration.js');
        if (!s.schemaV3Checked) {
            const r = await checkAndMigrateOnLogin(uid);
            if (r?.success) updateSetting('schemaV3Checked', true);
            if (r?.migrated > 0) {
                debugLog(`✅ Migrated ${r.migrated} workouts to schema v3.0`);
                const { clearAllWorkoutsCache } = await import('./data/data-manager.js');
                clearAllWorkoutsCache();
            }
        }
        if (!s.equipmentBaseWeightChecked) {
            const touched = await migrateEquipmentBaseWeight(uid);
            if (touched !== null) updateSetting('equipmentBaseWeightChecked', true);
        }
    }
    perfMark('maintenance:done');
}

/** PF-1 — notifications + push registration, never on the launch path. */
function startNotificationsInBackground() {
    (async () => {
        try {
            const { initializeNotifications } = await import('./utils/notification-helper.js');
            await initializeNotifications();
        } catch (e) { console.error('❌ Notifications init failed (non-fatal):', e); }
        try {
            const { initializeFCM } = await import('./utils/push-notification-manager.js');
            await initializeFCM();
        } catch {
            // FCM not available or not configured - local notifications still work
        }
        perfMark('notifications:done');
    })();
}

/** After the launch batch: if the exercise library fell back, retry it (was validateUserData's job). */
function retryLibraryIfFellBack() {
    import('./data/firebase-workout-manager.js').then(({ defaultLibraryFellBack }) => {
        if (typeof defaultLibraryFellBack === 'function' && defaultLibraryFellBack() && _libraryRetryCount < LIBRARY_RETRY_DELAYS_MS.length) {
            setTimeout(() => { refreshExerciseDatabase(); }, LIBRARY_RETRY_DELAYS_MS[_libraryRetryCount++]);
        }
    }).catch(() => {});
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
                showNotification('Sign-in failed — try again', 'error');
            }
        });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            AppState.currentUser = user;

            // Update UI
            showUserInfo(user);

            // Update loading message
            updateLoadingMessage('Loading your workouts…');

            perfMark('auth:user');

            // PF-1 — ONE parallel batch before the first paint. Everything the
            // dashboard needs starts now; nothing a user can't see (migrations,
            // push registration, the old duplicate library load) waits in front
            // of it. Only loadUserSettings has an ordering need (unit, rest
            // timer) and nothing in this batch reads settings while it fetches.
            const [{ loadUserSettings, checkOnboarding }, { PRTracker }, dm] = await Promise.all([
                import('./ui/settings-ui.js'),
                import('./features/pr-tracker.js'),
                import('./data/data-manager.js'),
            ]);
            // The dashboard's history read joins the batch (not awaited): it
            // fills the 5-minute cache, so renderDashboard finds it warm.
            dm.loadAllWorkouts(AppState).then(() => perfMark('auth:workouts')).catch(() => {});
            const [, , , todaysData] = await Promise.all([
                loadUserSettings().then(() => perfMark('auth:settings')),
                loadWorkoutPlans(AppState).then(() => perfMark('auth:plans')),
                PRTracker.loadPRData().then(() => perfMark('auth:prs')),
                dm.loadTodaysWorkout(AppState).catch(() => null).then((d) => { perfMark('auth:today'); return d; }),
            ]);
            // validateUserData() used to repeat loadWorkoutPlans' six queries
            // here; its only lasting job was the library retry after a fallback.
            retryLibraryIfFellBack();

            // Equipment migration v2 — dry-run first, prompt user on destructive changes.
            // Non-blocking: failures don't prevent login.
            checkEquipmentMigrationV3(user.uid).catch((err) => {
                console.error('❌ Equipment migration v2 check failed (non-fatal):', err);
            });

            // Kick off equipment catalog load (Firestore → falls back to static).
            // Non-blocking: UI can render before this resolves; consumers await
            // loadEquipmentCatalog() at their point of use.
            import('./data/equipment-catalog-firestore.js')
                .then(({ loadEquipmentCatalog }) => loadEquipmentCatalog())
                .then((catalog) => {
                    AppState.equipmentCatalog = catalog;
                    debugLog(`📦 Equipment catalog ready: ${catalog.length} brands`);
                })
                .catch((err) => console.error('❌ Catalog load failed (non-fatal):', err));

            // In-progress workout check, from the doc the batch already read.
            await checkForInProgressWorkoutEnhanced(todaysData);
            perfMark('auth:in-progress');

            // Data is ready — no timing delay (the old 500 ms setTimeout).
            {
                debugLog('✅ Auth complete, hiding loading screen...');
                hideLoadingScreen();

                try {
                    const { showDashboard } = await import('./ui/dashboard-ui.js');
                    await showDashboard();

                    // PF-1 — after the paint, in the background: login
                    // maintenance (flag-gated, so a whole-collection scan runs
                    // once per account, not every launch) and notifications /
                    // push (the callable's cold start no longer blocks launch).
                    runLoginMaintenance(user.uid).catch((err) => console.error('❌ Login maintenance failed (non-fatal):', err));
                    startNotificationsInBackground();
                    // TP-6 j — coach / Sunday-roll writes reach this phone.
                    import('./data/server-sync.js').then(({ watchServerWrites }) => watchServerWrites(user.uid)).catch(() => {});

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

                    // Notification deep link (cold start): the weekly-review
                    // push opens /?open=weekly-review. Handle it only after
                    // auth + dashboard so the coach page has data to render.
                    try {
                        const params = new URLSearchParams(window.location.search);
                        if (params.get('open') === 'report-card') {
                            const week = params.get('week');
                            params.delete('open');
                            params.delete('week');
                            const qs = params.toString();
                            window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
                            const { openReportCard } = await import('./ui/report-card-ui.js');
                            openReportCard(week);
                        } else if (params.get('open') === 'weekly-review') {
                            params.delete('open');
                            const qs = params.toString();
                            window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
                            const { openLatestWeeklyReview } = await import('./features/ai-coach-ui.js');
                            openLatestWeeklyReview();
                        }
                    } catch (deepLinkErr) {
                        console.error('❌ Notification deep link failed:', deepLinkErr);
                    }
                } catch (e) {
                    console.error('❌ Error showing dashboard:', e);
                    // Fallback to window.navigateTo if available
                    if (window.navigateTo) {
                        window.navigateTo('dashboard');
                    }
                }
            }
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
            `<li><strong>${preview.templatesAffected}</strong> workout${preview.templatesAffected !== 1 ? 's' : ''} will be updated</li>`
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
            <h3>Equipment cleanup ready</h3>
            <ul class="migration-prompt__summary">${summaryItems.join('')}</ul>
            ${renamesHtml}
            <p class="migration-prompt__hint">
                Tip: download a backup first. If anything looks wrong after cleanup,
                you'll have a JSON snapshot of your equipment and workouts.
            </p>
            <div class="migration-prompt__actions">
                <button class="btn btn-primary" onclick="executeEquipmentMigration()">Run cleanup</button>
                <button class="btn btn-secondary" onclick="downloadEquipmentMigrationBackup()">
                    <i class="fas fa-download"></i> Download backup
                </button>
                <button class="btn btn-text" onclick="dismissEquipmentMigration()">Not now</button>
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

// Retries after a fallback load, bounded so a genuinely offline session
// doesn't poll forever: 30 s, then 2 min.
const LIBRARY_RETRY_DELAYS_MS = [30000, 120000];
let _libraryRetryCount = 0;

export async function refreshExerciseDatabase() {
    try {
        if (AppState.currentUser) {
            const { FirebaseWorkoutManager, defaultLibraryFellBack } = await import('./data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const library = await workoutManager.getExerciseLibrary();
            // Never replace a good library with a worse one: a refresh that
            // fell back keeps whatever fuller list is already loaded.
            const fellBack = typeof defaultLibraryFellBack === 'function' && defaultLibraryFellBack();
            const current = AppState.exerciseDatabase;
            if (!fellBack || !Array.isArray(current) || current.length <= library.length) {
                AppState.exerciseDatabase = library;
            }
            if (fellBack && _libraryRetryCount < LIBRARY_RETRY_DELAYS_MS.length) {
                setTimeout(() => { refreshExerciseDatabase(); }, LIBRARY_RETRY_DELAYS_MS[_libraryRetryCount++]);
            } else if (!fellBack) {
                _libraryRetryCount = 0;
            }
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

async function checkForInProgressWorkoutEnhanced(preloaded) {
    try {
        let todaysData = preloaded;
        if (todaysData === undefined) {
            const { loadTodaysWorkout } = await import('./data/data-manager.js');
            todaysData = await loadTodaysWorkout(AppState);
        }

        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            const workoutPlan = (AppState.workoutPlans || []).find(
                (plan) =>
                    plan.day === todaysData.workoutType ||
                    plan.name === todaysData.workoutType ||
                    plan.id === todaysData.workoutType
            );

            // The saved doc carries its own exercise list (originalWorkout);
            // the template lookup is only a fallback for very old docs. This
            // used to `return` when no template matched, which silently
            // stranded every session whose name isn't a saved template —
            // coach-generated names, freestyle, renamed templates. Dashboard
            // then showed "Start workout" (→ the "Keep current workout?"
            // prompt that leads nowhere) and the FAB routed to the workout
            // list (9/18 report).
            let originalWorkout = todaysData.originalWorkout || workoutPlan || null;
            if (!originalWorkout || !Array.isArray(originalWorkout.exercises)) {
                const names = todaysData.exerciseNames || {};
                const exercises = Object.entries(todaysData.exercises || {})
                    .sort(([a], [b]) => (parseInt(a.split('_')[1], 10) || 0) - (parseInt(b.split('_')[1], 10) || 0))
                    .map(([key, ex]) => ({
                        machine: names[key] || ex?.name || ex?.machine || 'Exercise',
                        name: names[key] || ex?.name || ex?.machine || 'Exercise',
                        equipment: ex?.equipment || null,
                        equipmentId: ex?.equipmentId || null,
                        sets: Array.isArray(ex?.sets) && ex.sets.length ? ex.sets.length : 3,
                        reps: 10,
                    }));
                if (exercises.length === 0) return; // nothing to resume
                originalWorkout = { workoutType: todaysData.workoutType, name: todaysData.workoutType, exercises };
            }

            // Store in-progress workout globally
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout,
            };

            // Activate FAB animation to signal active workout
            const { setWorkoutActiveState } = await import('./ui/navigation.js');
            setWorkoutActiveState(true);

            // The Home hero and the workout pill offer Resume (UD-2 — the
            // separate resume banner was a third, dead surface).
        }
    } catch (error) {
        console.error('Error checking for in-progress workout:', error);
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
// GLOBAL SETUP HELPERS
// ===================================================================

export function setupGlobalVariables() {
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
}

// ===================================================================
// SERVICE WORKER REGISTRATION
// ===================================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        // Notification taps while the app is open: the service worker focuses
        // this window and posts the target instead of navigating a fresh one.
        navigator.serviceWorker.addEventListener('message', (event) => {
            const url = String(event.data?.url || '');
            if (event.data?.type === 'notification-click' && url.includes('open=weekly-review')) {
                import('./features/ai-coach-ui.js').then((m) => m.openLatestWeeklyReview?.());
            } else if (event.data?.type === 'notification-click' && url.includes('open=report-card')) {
                const week = (url.match(/week=(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
                import('./ui/report-card-ui.js').then((m) => m.openReportCard?.(week));
            }
        });
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
