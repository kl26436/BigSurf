// Navigation Module - core/navigation.js
// Handles bottom nav navigation and view switching

// ===================================================================
// NAVIGATION ROUTING
// ===================================================================

const SECTION_IDS = [
    'workout-selector',
    'active-workout',
    'workout-history-section',
    'workout-detail-section',
    'workout-management-section',
    'dashboard',
    'metric-detail-section',
    'muscle-group-detail-section',
    'exercise-detail-section',
    'composition-detail-section',
    'exercise-manager-section',
    'location-management-section',
    'equipment-library-section',
    'plate-calculator-section',
    'settings-section',
    'profile-section',
    'body-measurements-entry-section',
    'ai-coach-section',
    'manual-workout-section',
];

const FADE_DURATION = 150; // ms, matches CSS transition
let fadeTimeout = null;

// ===================================================================
// NAVIGATION BACK STACK
// ===================================================================

const navStack = [];
const MAX_STACK_SIZE = 5;
let skipStackPush = false;

export function navigateBack() {
    const previous = navStack.pop();
    if (previous) {
        skipStackPush = true;
        navigateTo(previous);
        skipStackPush = false;
    } else {
        skipStackPush = true;
        navigateTo('dashboard');
        skipStackPush = false;
    }
}

function getCurrentView() {
    return SECTION_IDS
        .map(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden') ? id : null;
        })
        .find(Boolean) || null;
}

export function navigateTo(view) {
    // Flush any pending inline template edit BEFORE we tear down or hide the
    // current view. Without this, a user who typed a new sets/reps/weight on
    // the workout-selector and tapped a nav button without blurring first
    // would lose the change — the debounce timer wouldn't get a chance to
    // fire. Fire-and-forget; the save is local-first via AppState.
    import('./template-selection.js')
        .then(m => m.flushPendingTemplateEdits?.())
        .catch(() => { /* template-selection not loaded yet — no edits to flush */ });

    // Tear down any orphan overlays attached to <body> before navigating away.
    // The active-workout v2 wizard appends its bottom-sheet (#aw-sheet) and
    // backdrop (#aw-sheet-backdrop) directly to document.body, not inside the
    // active-workout section. Hiding the section doesn't remove them, and the
    // backdrop is position: fixed full-screen — so it silently swallows every
    // click on whatever view we navigate to next.
    const orphanBackdrop = document.getElementById('aw-sheet-backdrop');
    const orphanSheet = document.getElementById('aw-sheet');
    if (orphanBackdrop) orphanBackdrop.remove();
    if (orphanSheet) orphanSheet.remove();

    // Same story for the plate-calculator popover and the form-video overlay —
    // both are appended to <body> and, being position:fixed, would linger on
    // top of the next screen until dismissed by their own close button.
    document.getElementById('plate-calc-popover')?.remove();
    document.getElementById('aw-form-video-overlay')?.remove();

    // The bottom-nav more menu (#more-menu) lives outside the section system,
    // so hiding the source section doesn't dismiss it. bottomNavTo() already
    // closes it before calling navigateTo, but any other code path (in-page
    // CTA, deep link, programmatic redirect) reaches navigateTo directly and
    // would leave the sheet visible across the navigation.
    closeMoreMenu();

    // Push current view onto stack for back navigation
    if (!skipStackPush) {
        const current = getCurrentView();
        if (current && current !== view) {
            navStack.push(current);
            // Cap stack size
            if (navStack.length > MAX_STACK_SIZE) {
                navStack.shift();
            }
        }
    }
    // Find the currently visible section
    const visibleSection = SECTION_IDS
        .map((id) => document.getElementById(id))
        .find((el) => el && !el.classList.contains('hidden'));

    function showTarget() {
        // Hide all sections immediately
        SECTION_IDS.forEach((sectionId) => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('hidden');
                section.classList.remove('section-fade-out');
            }
        });

        // Route to appropriate view
        routeToView(view);
    }

    // Cancel any in-progress fade from a previous navigateTo call
    if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
    }

    if (visibleSection) {
        // Fade out the visible section, then switch
        visibleSection.classList.add('section-fade-out');
        fadeTimeout = setTimeout(showTarget, FADE_DURATION);
    } else {
        // Nothing visible — just show immediately
        showTarget();
    }
}

function routeToView(view) {
    // Normalize: getCurrentView() returns section IDs like 'muscle-group-detail-section'
    // but callers may pass view names like 'muscle-group-detail'. Handle both.
    const normalized = view.replace(/-section$/, '');

    switch (normalized) {
        case 'dashboard':
            showDashboard();
            break;

        case 'active-workout':
            showActiveWorkout();
            break;

        case 'workout':
        case 'start-workout':
        case 'workout-selector':
            showWorkoutSelector();
            break;

        case 'metric-detail':
            showMetricDetail();
            break;

        case 'muscle-group-detail':
            showMuscleGroupDetailView();
            break;

        case 'exercise-detail':
            showExerciseDetailView();
            break;

        case 'composition-detail':
            showCompositionDetailView();
            break;

        case 'history':
        case 'workout-history':
            showHistory();
            break;

        case 'location':
        case 'location-management':
            showLocationManagement();
            break;

        case 'exercises':
        case 'exercise-manager':
            openExerciseManager();
            break;

        case 'templates':
        case 'workout-management':
            // Phase 1: route to the unified workout-selector. The legacy
            // workout-management-section is retired in Phase 9; for now it
            // stays in the DOM but is unreachable from any nav entry point.
            showWorkoutSelector();
            break;

        case 'equipment':
        case 'equipment-library':
            showEquipmentLibrary();
            break;

        case 'plate-calculator':
            showPlateCalculator();
            break;

        case 'settings':
            showSettings();
            break;

        case 'profile': {
            // navigateTo() hides all sections — we need to un-hide the target.
            // openProfile() handles rendering the content before navigateTo runs.
            const profileSection = document.getElementById('profile-section');
            if (profileSection) profileSection.classList.remove('hidden');
            setBottomNavVisible(true);
            break;
        }

        case 'body-measurements-entry': {
            const bmSection = document.getElementById('body-measurements-entry-section');
            if (bmSection) bmSection.classList.remove('hidden');
            setBottomNavVisible(true);
            break;
        }

        case 'manual-workout': {
            // showAddManualWorkoutModal renders content before calling navigateTo.
            const mwSection = document.getElementById('manual-workout-section');
            if (mwSection) mwSection.classList.remove('hidden');
            setBottomNavVisible(true);
            break;
        }

        case 'ai-coach': {
            // Ensure the section is populated. showAICoach() renders before
            // navigating, but direct navigateTo('ai-coach') (tab bar, more menu)
            // lands here with an empty section on first visit.
            const coachSection = document.getElementById('ai-coach-section');
            if (coachSection) {
                if (!coachSection.firstElementChild) {
                    // Lazy-render on first visit via tab/more-menu entry.
                    import('../features/ai-coach-ui.js').then(m => m.renderAICoachSection?.());
                }
                coachSection.classList.remove('hidden');
            }
            setBottomNavVisible(true);
            break;
        }

        default:
            console.warn(`Unknown view: ${view}`);
            showDashboard();
    }
}

// ===================================================================
// VIEW FUNCTIONS
// ===================================================================

async function showDashboard() {
    const { showDashboard: showDash } = await import('./dashboard-ui.js');
    if (showDash) {
        showDash();
    }
}

function showMetricDetail() {
    const section = document.getElementById('metric-detail-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
}

function showActiveWorkout() {
    const activeWorkout = document.getElementById('active-workout');
    if (activeWorkout) {
        activeWorkout.classList.remove('hidden');
    }
    // Show nav on active workout, but hide main header (no logo during workouts)
    setBottomNavVisible(true);
    const { setHeaderMode } = window;
    if (setHeaderMode) setHeaderMode(false);

    // Re-render the wizard so any mutations made elsewhere (equipment library
    // edits, exercise renames, body-weight toggle on a machine, etc.) are
    // reflected. Without this, isBodyweightExercise() and friends still see
    // the cached pre-edit equipment state.
    if (typeof window.renderAll === 'function' && window.AppState?.currentWorkout) {
        window.renderAll();
    }
}

function showWorkoutSelector() {
    const { showWorkoutSelector: showSelector } = window;
    if (showSelector) {
        showSelector();
    } else {
        const section = document.getElementById('workout-selector');
        if (section) section.classList.remove('hidden');
    }
}

async function showMuscleGroupDetailView() {
    const section = document.getElementById('muscle-group-detail-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderMuscleGroupDetail } = await import('./muscle-group-detail-ui.js');
    const { AppState } = await import('../utils/app-state.js');
    renderMuscleGroupDetail(AppState.activeMuscleGroup);
}

async function showExerciseDetailView() {
    const section = document.getElementById('exercise-detail-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderExerciseDetail } = await import('./exercise-detail-ui.js');
    const { AppState } = await import('../utils/app-state.js');
    renderExerciseDetail(AppState.activeExercise);
}

async function showCompositionDetailView() {
    const section = document.getElementById('composition-detail-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderCompositionDetail } = await import('./composition-detail-ui.js');
    renderCompositionDetail();
}

function showHistory() {
    const { showWorkoutHistory } = window;
    if (showWorkoutHistory) {
        showWorkoutHistory();
    }
}

function showLocationManagement() {
    const { showLocationManagement: showManagement } = window;
    if (showManagement) {
        showManagement();
    }
}

async function showEquipmentLibrary() {
    const section = document.getElementById('equipment-library-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('more');
    if (window.setHeaderMode) window.setHeaderMode('equipment');
    const { openEquipmentLibrary } = await import('./equipment-library-ui.js');
    openEquipmentLibrary();
}

async function showPlateCalculator() {
    const section = document.getElementById('plate-calculator-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('more');
    if (window.setHeaderMode) window.setHeaderMode('plate-calculator');
    const { initPlateCalculatorPage } = await import('../features/plate-calculator.js');
    initPlateCalculatorPage();
}

async function showSettings() {
    const section = document.getElementById('settings-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('more');
    if (window.setHeaderMode) window.setHeaderMode('settings');
    const { renderSettings } = await import('./settings-ui.js');
    renderSettings();
}

function openExerciseManager() {
    const { openExerciseManager: openManager } = window;
    if (openManager) {
        openManager();
    }
}

function showWorkoutManagement() {
    const { showWorkoutManagement: showManagement } = window;
    if (showManagement) {
        showManagement();
    }
}

// ===================================================================
// BOTTOM NAVIGATION
// ===================================================================

// Navigate via bottom nav with tab state management
export function bottomNavTo(tab) {
    // Close more menu if open
    closeMoreMenu();

    // Update active tab
    updateBottomNavActive(tab);

    // Navigate to appropriate view
    switch (tab) {
        case 'dashboard':
            navigateTo('dashboard');
            break;
        case 'history':
            navigateTo('history');
            break;
        case 'ai-coach':
            navigateTo('ai-coach');
            break;
        case 'workout':
            // Check if there's an active workout (live session or detected on load)
            const { AppState } = window;
            if (AppState && AppState.currentWorkout) {
                navigateTo('active-workout');
            } else if (window.inProgressWorkout) {
                // Resume in-progress workout detected on app load
                if (window.continueInProgressWorkout) {
                    window.continueInProgressWorkout();
                } else {
                    navigateTo('start-workout');
                }
            } else {
                navigateTo('start-workout');
            }
            break;
        case 'more':
            toggleMoreMenu();
            break;
    }
}

// Update bottom nav active state with ARIA
export function updateBottomNavActive(tab) {
    const bottomNav = document.getElementById('bottom-nav');
    if (!bottomNav) return;

    bottomNav.querySelectorAll('.bottom-nav__btn, .bottom-nav__fab').forEach((item) => {
        if (item.dataset.tab === tab) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        } else {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        }
    });
}

// Toggle more menu visibility with ARIA
export function toggleMoreMenu() {
    const menu = document.getElementById('more-menu');
    const overlay = document.getElementById('more-menu-overlay');
    const moreBtn = document.querySelector('[data-tab="more"]');

    if (menu && overlay) {
        const isVisible = menu.classList.contains('visible');

        // Belt-and-suspenders: wipe any inline transform/transition BEFORE
        // toggling visibility. If the previous close was interrupted mid-
        // animation and left inline styles behind, the CSS class-based
        // animation can't move the sheet because the inline styles win.
        // The user was seeing "stuck halfway open" as the residue of an
        // earlier drag/gesture that never got a clean cleanup. Nuking here
        // guarantees every open starts from the CSS-defined baseline.
        menu.style.transform = '';
        menu.style.transition = '';

        menu.classList.toggle('visible', !isVisible);
        overlay.classList.toggle('visible', !isVisible);

        // Update ARIA state
        if (moreBtn) {
            moreBtn.setAttribute('aria-expanded', !isVisible);
        }

        // Setup drag-to-dismiss on open + schedule a health check for the
        // "stuck halfway open" report class. If it recurs after the current
        // fix set, the check auto-logs to Firestore with full diagnostic
        // state so we can see exactly what's stranding the sheet without
        // asking the user to reproduce with dev tools open.
        if (!isVisible) {
            setupBottomSheetDrag(menu, overlay);
            scheduleStuckMenuCheck(menu, overlay);
        }
    }
}

/**
 * 350ms after the more menu opens (past the CSS transition), verify its
 * bottom edge is actually flush with the viewport bottom. If it isn't, the
 * sheet is floating — the exact "stuck halfway" symptom — so we snapshot
 * the diagnostic state (kb-inset var, inline styles, visualViewport, menu
 * rect) and persist it as a warning via the standard errorLogs pipeline.
 * Zero user impact when everything's fine; automatic bug report when not.
 */
function scheduleStuckMenuCheck(menu, overlay) {
    setTimeout(async () => {
        // If the user already closed it, nothing to check.
        if (!menu.classList.contains('visible')) return;

        const rect = menu.getBoundingClientRect();
        // How far the sheet's bottom edge sits ABOVE the viewport bottom.
        // A properly anchored bottom sheet should have gap ≈ 0. > 20px means
        // it's floating in mid-screen — the stuck-halfway case.
        const gap = Math.round(window.innerHeight - rect.bottom);
        if (gap <= 20) return;

        try {
            const { captureWarning } = await import('../utils/error-handler.js');
            const rootStyle = getComputedStyle(document.documentElement);
            const menuComputed = getComputedStyle(menu);
            const vv = window.visualViewport ? {
                height: Math.round(window.visualViewport.height),
                offsetTop: Math.round(window.visualViewport.offsetTop),
                scale: window.visualViewport.scale,
            } : null;

            captureWarning(
                `More menu stuck-halfway — ${gap}px floating gap below sheet`,
                'toggleMoreMenu',
                {
                    gap,
                    menuRect: {
                        top: Math.round(rect.top),
                        bottom: Math.round(rect.bottom),
                        height: Math.round(rect.height),
                    },
                    windowInnerHeight: window.innerHeight,
                    windowInnerWidth: window.innerWidth,
                    // The suspected root cause vector: kb-inset stranded non-zero.
                    kbInsetVar: rootStyle.getPropertyValue('--kb-inset').trim() || null,
                    // Computed values so we can see what CSS/inline combined into.
                    menuComputedBottom: menuComputed.bottom,
                    menuComputedTransform: menuComputed.transform,
                    menuComputedTransition: menuComputed.transition,
                    // Inline styles — any residue from drag or elsewhere.
                    menuInlineStyles: {
                        transform: menu.style.transform || null,
                        transition: menu.style.transition || null,
                        bottom: menu.style.bottom || null,
                        cssText: menu.style.cssText || null,
                    },
                    overlayVisible: !!overlay && overlay.classList.contains('visible'),
                    visualViewport: vv,
                    userAgent: navigator.userAgent || null,
                    platform: navigator.platform || null,
                    devicePixelRatio: window.devicePixelRatio || null,
                }
            );
        } catch (_) {
            // Never let the diagnostic itself break the app.
        }
    }, 350);
}

// Close more menu
export function closeMoreMenu() {
    const menu = document.getElementById('more-menu');
    const overlay = document.getElementById('more-menu-overlay');
    const moreBtn = document.querySelector('[data-tab="more"]');

    if (menu) {
        menu.classList.remove('visible');
        // Hard-reset any inline transform/transition the drag handler set.
        // If a drag was interrupted (iOS swipe-back, app backgrounded), the
        // touchend cleanup never ran and the sheet was left with
        // `transform: translateY(<px>)` + `transition: none` — overriding
        // the CSS close animation. The menu would visibly stick at whatever
        // position the user's finger left it, and the only escape was
        // closing the app entirely.
        menu.style.transform = '';
        menu.style.transition = '';
    }
    if (overlay) overlay.classList.remove('visible');
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
}

// Drag-to-dismiss for bottom sheet
function setupBottomSheetDrag(sheet, overlay) {
    const handle = sheet.querySelector('.bottom-sheet-handle');
    if (!handle || handle._dragSetup) return;
    handle._dragSetup = true;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    // Always-safe cleanup: clear inline transform/transition the drag set so
    // a class-based close animation can run. Used both on natural touchend
    // and on the iOS-interrupt paths below.
    const resetInlineStyles = () => {
        sheet.style.transition = '';
        sheet.style.transform = '';
    };

    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        sheet.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            sheet.style.transform = `translateY(${diff}px)`;
        }
    }, { passive: true });

    handle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        sheet.style.transition = 'transform 0.3s ease';
        const diff = currentY - startY;
        if (diff > 80) {
            closeMoreMenu();
        } else {
            sheet.style.transform = 'translateY(0)';
        }
        // Reset transform after close animation
        setTimeout(resetInlineStyles, 300);
    }, { passive: true });

    // iOS fires touchcancel when the OS preempts the gesture (system
    // back-swipe, app switcher, multitasking). Without this, isDragging
    // stayed true, the inline `transition: none` stuck, and the sheet was
    // frozen wherever the finger left it — the "stuck partial open" the
    // user reported. Same handler for touchend without a real touchend.
    const handleCancel = () => {
        if (!isDragging) return;
        isDragging = false;
        resetInlineStyles();
    };
    handle.addEventListener('touchcancel', handleCancel, { passive: true });
    // Belt-and-suspenders: if the page becomes hidden mid-drag (background,
    // tab switch), clean up so coming back doesn't show the half-open sheet.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handleCancel();
    });
}

/**
 * Show/hide the bottom navigation bar.
 * Used when entering/leaving full-screen views (active workout, exercise library, etc.)
 */
export function setBottomNavVisible(visible) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    nav.classList.toggle('hidden', !visible);
}

/**
 * Toggle the body.workout-active class so the dumbbell FAB animates
 * (and any other "workout in progress" affordances activate).
 */
export function setWorkoutActiveState(active) {
    document.body.classList.toggle('workout-active', !!active);
}

// ===================================================================
// DASHBOARD DRILL-DOWN NAVIGATION
// ===================================================================

export function showMuscleGroupDetail(bodyPart) {
    const { AppState } = window;
    if (AppState) AppState.activeMuscleGroup = bodyPart;
    navigateTo('muscle-group-detail');
}

export function showCompositionDetail() {
    navigateTo('composition-detail');
}

export function showExerciseDetail(exerciseName) {
    const { AppState } = window;
    if (AppState) AppState.activeExercise = exerciseName;
    navigateTo('exercise-detail');
}