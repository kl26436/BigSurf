// UI utility functions
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        border: 1px solid var(--${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'});
        z-index: 10000;
        animation: slideDown 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export function setTodayDisplay() {
    const today = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    const todayDateDisplay = document.getElementById('today-date-display');
    if (todayDateDisplay) {
        todayDateDisplay.textContent = `Today - ${today.toLocaleDateString('en-US', options)}`;
    }
}

export function convertWeight(weight, fromUnit, toUnit) {
    // Handle corrupted or invalid weights
    if (!weight || isNaN(weight) || weight <= 0) return 0;
    if (weight > 1000) return '??'; // Clearly corrupted
    
    if (fromUnit === toUnit) return Math.round(weight);
    
    if (fromUnit === 'lbs' && toUnit === 'kg') {
        return Math.round(weight * 0.453592 * 10) / 10; // 1 decimal for kg
    } else if (fromUnit === 'kg' && toUnit === 'lbs') {
        return Math.round(weight * 2.20462); // Whole number for lbs
    }
    
    return weight;
}

export function updateProgress(state) {
    if (!state.currentWorkout || !state.savedData.exercises) return;

    let completedSets = 0;
    let totalSets = 0;

    state.currentWorkout.exercises.forEach((exercise, index) => {
        totalSets += exercise.sets;
        const sets = state.savedData.exercises[`exercise_${index}`]?.sets || [];
        const exerciseCompletedSets = sets.filter(set => set && set.reps && set.weight).length;
        completedSets += exerciseCompletedSets;
    });

    const progressEl = document.getElementById('workout-progress-display');
    if (progressEl) {
        progressEl.textContent = `${completedSets}/${totalSets} sets`;
    }
}

/**
 * Manage header visibility based on active section
 * Shows full header with logo on dashboard/history, shows standalone hamburger on busy pages
 * @param {boolean} showFullHeader - true for dashboard/history, false for active workout/workout library/exercise manager
 */
export function setHeaderMode(showFullHeader) {
    const mainHeader = document.getElementById('main-header');
    const standaloneMenu = document.getElementById('standalone-menu-toggle');

    if (showFullHeader) {
        // Show full header with logo
        if (mainHeader) mainHeader.style.display = 'flex';
        if (standaloneMenu) standaloneMenu.style.display = 'none';
    } else {
        // Hide header, show standalone hamburger
        if (mainHeader) mainHeader.style.display = 'none';
        if (standaloneMenu) standaloneMenu.style.display = 'flex';
    }
}