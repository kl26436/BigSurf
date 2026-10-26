// Navigation Module - core/navigation.js
// Handles bottom nav navigation and view switching

import { resetPageLock } from './page-lock.js';
import { closeAllSheets, closeTopSheet, sheetDepth } from './sheet.js';
import { createBackGuard } from './back-guard.js';

// ===================================================================
// NAVIGATION ROUTING
// ===================================================================

const SECTION_IDS = [
    'workout-selector',
    'workout-editor-section',
    'active-workout',
    'workout-history-section',
    'workout-detail-section',
    'dashboard',
    'metric-detail-section',
    'muscle-group-detail-section',
    'exercise-detail-section',
    'progress-section',
    'block-section',
    'goals-section',               // TP-1
    'reportcard-section',          // TP-2
    'composition-detail-section',
    'exercise-manager-section',
    'edit-exercise-section',       // SH-6 — the exercise library's edit page
    'equipment-editor-section',    // SH-6 — its legacy equipment editor
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
// SH-6 — 10 deep (dashboard → progress → muscle → exercise → equipment →
// … must survive), with top-dedupe in navigateTo.
const MAX_STACK_SIZE = 10;

/** The section a view name lands on — so 'history' and 'workout-history-section' compare equal. */
const VIEW_ALIASES = {
    history: 'workout-history-section', 'workout-history': 'workout-history-section',
    workout: 'workout-selector', 'start-workout': 'workout-selector', templates: 'workout-selector', 'workout-management': 'workout-selector',
    'workout-editor': 'workout-editor-section',
    equipment: 'equipment-library-section', location: 'location-management-section',
    exercises: 'exercise-manager-section',
};
function sectionOf(view) {
    if (!view) return null;
    if (VIEW_ALIASES[view]) return VIEW_ALIASES[view];
    if (SECTION_IDS.includes(view)) return view;
    return SECTION_IDS.includes(`${view}-section`) ? `${view}-section` : view;
}
let skipStackPush = false;

/** Push the page we're leaving (or pop, when `view` is the one below it). */
function recordNavigation(view, { replace = false } = {}) {
    const current = getCurrentView();
    const top = navStack[navStack.length - 1];
    if (!current || sectionOf(current) === sectionOf(view)) return;
    if (top && sectionOf(top) === sectionOf(view)) {
        navStack.pop();
    } else if (!replace && (!top || sectionOf(top) !== sectionOf(current))) {
        navStack.push(current);
        if (navStack.length > MAX_STACK_SIZE) navStack.shift();
    }
}

/**
 * SH-6 — for flows that paint a page themselves (workout start, the exercise
 * library's edit page and equipment hand-offs): record it in the back stack
 * and the back guard exactly as navigateTo would, without re-running the
 * route, fading, or closing sheets the flow may still have open.
 * `replace: true` swaps the current page instead of stacking on it (the
 * live workout's "edit exercise" passes through the library without
 * leaving it in the back path).
 */
export function enterSection(view, { replace = false } = {}) {
    const target = sectionOf(view);
    recordNavigation(view, { replace });
    SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== target);
    });
    backGuard.sync();
}

/** The back stack, oldest first (tests / ?debug). */
export function navStackSnapshot() {
    return [...navStack];
}

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

    // The form-video overlay is appended to <body> and, being position:fixed,
    // would linger on top of the next screen until dismissed by its own close.
    document.getElementById('aw-form-video-overlay')?.remove();
    // SH-2b sheets close with the page they belong to. SH-2a — the lock is
    // derived from what's open, so removing the sheets above releases it;
    // this also drops any explicit lockPage() hold.
    closeAllSheets();
    resetPageLock();

    // The bottom-nav more menu (#more-menu) lives outside the section system,
    // so hiding the source section doesn't dismiss it. bottomNavTo() already
    // closes it before calling navigateTo, but any other code path (in-page
    // CTA, deep link, programmatic redirect) reaches navigateTo directly and
    // would leave the sheet visible across the navigation.
    closeMoreMenu();

    // Push current view onto stack for back navigation. SH-6 — going
    // "forward" to the view that's on top of the stack IS going back (a
    // fixed "back to dashboard" link must not leave a dashboard ↔ detail
    // loop behind it), and the same view is never pushed twice in a row.
    if (!skipStackPush) recordNavigation(view);
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
        backGuard.sync();
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

        case 'workout-editor':
            showWorkoutEditorView();
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

        case 'progress':
            showProgressView();
            break;

        case 'block':
            showBlockView();
            break;

        case 'goals':
            showGoalsView();
            break;

        case 'reportcard':
            showReportCardView();
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

        // SH-6 — reached only by going BACK to them (forward entry is
        // enterSection from exercise-manager-ui); their state is still in place.
        case 'edit-exercise':
            document.getElementById('edit-exercise-section')?.classList.remove('hidden');
            if (window.setHeaderMode) window.setHeaderMode(false);
            import('./exercise-manager-ui.js')
                .then(m => m.resumeEditExerciseSection?.())
                .catch(() => {});
            break;

        case 'equipment-editor':
            document.getElementById('equipment-editor-section')?.classList.remove('hidden');
            if (window.setHeaderMode) window.setHeaderMode(false);
            break;

        case 'templates':
        case 'workout-management':
            // Legacy route names — the workout-management section was removed
            // in Phase 9; both route to the unified workout-selector.
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
    // Re-entry can happen without a re-render — this route only un-hides the
    // section — so the resume hook inside renderActiveWorkout is not
    // guaranteed to run. Ask for it directly: it no-ops when the interval is
    // already ticking, and revives a countdown whose interval was cleared
    // while the user was off on another tab (7/22 "froze at 1:28").
    import('../workout/active-workout-ui.js')
        .then(m => {
            m.resumeRestTimerIfActive?.();
            // Same story for the elapsed clock: cleanup() on the way out
            // clears its interval and only a full re-render restarted it
            // (9/29 "timer stopped when I left the active workout").
            m.startDurationTimer?.();
        })
        .catch(() => {});
    // Hide BOTH the main header (no logo during workouts) AND the bottom nav.
    // The active workout has its own footer (All / Next exercise / Finish)
    // so a second bar underneath is redundant. The 7/8 "nav bar came back
    // after leaving off exercise and reopening" report — workout start
    // hides the nav, but any route round-trip flipped it back on because
    // this function called setBottomNavVisible(true).
    setBottomNavVisible(false);
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

// Phase 3b — the workout editor lives on its own page. The target template is
// held in template-selection's module state (set by showWorkoutEditor before
// navigating), so this just un-hides the section and re-renders it.
async function showWorkoutEditorView() {
    const section = document.getElementById('workout-editor-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('workout');
    try {
        const { renderActiveWorkoutEditor } = await import('./template-selection.js');
        renderActiveWorkoutEditor();
    } catch (err) {
        console.error('Error rendering workout editor:', err);
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

async function showProgressView() {
    const section = document.getElementById('progress-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderProgressPage } = await import('./dashboard-ui.js');
    await renderProgressPage();
}

// AP-24 — the program by week and day.
async function showBlockView() {
    const section = document.getElementById('block-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderBlockPage } = await import('./block-ui.js');
    await renderBlockPage();
}

// TP-1 — goals, their status, the dates the plan aims at.
async function showGoalsView() {
    const section = document.getElementById('goals-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderGoalsPage } = await import('./goals-ui.js');
    await renderGoalsPage();
}

// TP-2 — the Sunday report card.
async function showReportCardView() {
    const section = document.getElementById('reportcard-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('dashboard');
    const { renderReportCardPage } = await import('./report-card-ui.js');
    await renderReportCardPage();
}

// Entry point for onclick handlers (window-bound in main.js).
export function showProgressPage() {
    navigateTo('progress');
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
        case 'workout': {
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
        }
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
        } catch {
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
    if (AppState) {
        AppState.activeMuscleGroup = bodyPart;
        // Body-part cards are a weekly view ("Volume · wk", sets/wk vs target),
        // so open the drill-down on the same week — otherwise the numbers visibly
        // jump between the card you tapped and the page you land on. Not persisted:
        // picking a range in the drill-down still sticks via setMuscleRange.
        AppState.dashboardRange = 'W';
    }
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
// ===================================================================
// BACK GESTURE (SH-6) — system back (Android, iOS edge swipe) does an
// in-app back instead of leaving the app. See back-guard.js.
// ===================================================================

function topDialog() {
    const open = [...document.querySelectorAll('dialog[open]')];
    return open[open.length - 1] || null;
}

function moreMenuOpen() {
    return !!document.getElementById('more-menu')?.classList.contains('visible');
}

function canGoBackInApp() {
    if (typeof document === 'undefined') return false;
    if (topDialog() || sheetDepth() > 0 || moreMenuOpen()) return true;
    const current = getCurrentView();
    return navStack.length > 0 || (!!current && current !== 'dashboard');
}

/** One back step, innermost layer first. */
function goBackInApp() {
    const dlg = topDialog();
    if (dlg) {
        // confirmSheet/promptSheet resolve on 'cancel'; openModal dialogs close.
        const ev = new Event('cancel', { cancelable: true });
        dlg.dispatchEvent(ev);
        if (!ev.defaultPrevented && dlg.open) {
            if (typeof window.closeModal === 'function') window.closeModal(dlg);
            else dlg.close();
        }
        return;
    }
    // A non-dismissible sheet (BW prompt, a save in flight) only closes from its own buttons.
    if (sheetDepth() > 0) { closeTopSheet({ dismissOnly: true }); return; }
    if (moreMenuOpen()) { closeMoreMenu(); return; }
    // Leaving the live workout goes through its own confirm, like its ← button.
    if (getCurrentView() === 'active-workout' && typeof window.awConfirmExit === 'function') {
        window.awConfirmExit();
        return;
    }
    navigateBack();
}

const backGuard = createBackGuard({
    history: typeof window !== 'undefined' ? window.history : { pushState() {}, back() {} },
    canGoBack: canGoBackInApp,
    goBack: goBackInApp,
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', () => backGuard.onPopState());
    // Sheets and dialogs announce open/close so the guard follows them.
    document.addEventListener('bigsurf:layer', () => backGuard.sync());
}
