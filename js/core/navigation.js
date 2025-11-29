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

export function navigateTo(view) {

    // Close sidebar after navigation
    closeSidebar();

    // Hide all sections
    const sections = [
        'workout-selector',
        'active-workout',
        'workout-history-section',
        'workout-management',
        'dashboard',
        'stats-section',
        'exercise-manager-section'
    ];

    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    // Route to appropriate view
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
            showLocationSelector();
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

function showLocationSelector() {
    const { showLocationSelector: showLocation } = window;
    if (showLocation) {
        showLocation();
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
