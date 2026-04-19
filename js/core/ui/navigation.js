// Navigation Module - core/navigation.js
// Handles bottom nav navigation and view switching

// ===================================================================
// NAVIGATION ROUTING
// ===================================================================

const SECTION_IDS = [
    'workout-selector',
    'active-workout',
    'workout-history-section',
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
            showWorkoutManagement();
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

async function showAICoachView() {
    const { showAICoach } = await import('../features/ai-coach-ui.js');
    if (showAICoach) showAICoach();
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
    setHeaderMode('equipment');
    const { openEquipmentLibrary } = await import('./equipment-library-ui.js');
    openEquipmentLibrary();
}

async function showPlateCalculator() {
    const section = document.getElementById('plate-calculator-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('more');
    setHeaderMode('plate-calculator');
    const { initPlateCalculatorPage } = await import('../features/plate-calculator.js');
    initPlateCalculatorPage();
}

async function showSettings() {
    const section = document.getElementById('settings-section');
    if (section) section.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('more');
    setHeaderMode('settings');
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
            showAICoachView();
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
        menu.classList.toggle('visible', !isVisible);
        overlay.classList.toggle('visible', !isVisible);

        // Update ARIA state
        if (moreBtn) {
            moreBtn.setAttribute('aria-expanded', !isVisible);
        }

        // Setup drag-to-dismiss on open
        if (!isVisible) {
            setupBottomSheetDrag(menu, overlay);
        }
    }
}

// Close more menu
export function closeMoreMenu() {
    const menu = document.getElementById('more-menu');
    const overlay = document.getElementById('more-menu-overlay');
    const moreBtn = document.querySelector('[data-tab="more"]');

    if (menu) menu.classList.remove('visible');
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

    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
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
        setTimeout(() => {
            if (sheet) sheet.style.transform = '';
        }, 300);
    }, { passive: true });
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