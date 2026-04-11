// Navigation Module - core/navigation.js
// Handles sidebar navigation and view switching

// ===================================================================
// SIDEBAR CONTROLS
// ===================================================================

export function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
}

export function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ===================================================================
// NAVIGATION ROUTING
// ===================================================================

const SECTION_IDS = [
    'workout-selector',
    'active-workout',
    'workout-history-section',
    'workout-management-section',
    'dashboard',
    'stats-section',
    'exercise-manager-section',
    'location-management-section',
];

const FADE_DURATION = 150; // ms, matches CSS transition
let fadeTimeout = null;

export function navigateTo(view) {
    // Close sidebar after navigation
    closeSidebar();

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
    switch (view) {
        case 'dashboard':
            showDashboard();
            break;

        case 'active-workout':
            showActiveWorkout();
            break;

        case 'start-workout':
            showWorkoutSelector();
            break;

        case 'stats':
            showStats();
            break;

        case 'history':
            showHistory();
            break;

        case 'location':
            showLocationManagement();
            break;

        case 'exercises':
            openExerciseManager();
            break;

        case 'templates':
            showWorkoutManagement();
            break;

        default:
            console.warn(`Unknown view: ${view}`);
            showWorkoutSelector();
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

async function showStats() {
    const { showStats: showStatsView } = await import('./stats-ui.js');
    if (showStatsView) {
        showStatsView();
    }
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
        case 'workout':
            // Check if there's an active workout
            const { AppState } = window;
            if (AppState && AppState.currentWorkout) {
                navigateTo('active-workout');
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

    bottomNav.querySelectorAll('.bottom-nav-item').forEach((item) => {
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
        const isHidden = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !isHidden);
        overlay.classList.toggle('hidden', !isHidden);

        // Update ARIA state
        if (moreBtn) {
            moreBtn.setAttribute('aria-expanded', !isHidden);
        }
    }
}

// Close more menu
export function closeMoreMenu() {
    const menu = document.getElementById('more-menu');
    const overlay = document.getElementById('more-menu-overlay');

    if (menu) menu.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

// Show/hide bottom nav based on current page
export function setBottomNavVisible(visible) {
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
        bottomNav.classList.toggle('hidden', !visible);
    }
    // Also toggle body class for hamburger visibility
    document.body.classList.toggle('no-bottom-nav', !visible);
}
