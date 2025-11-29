// Stats UI Module - core/stats-ui.js
// Displays comprehensive stats and PR leaderboard

import { PRTracker } from './pr-tracker.js';
import { StreakTracker } from './streak-tracker.js';

// ===================================================================
// STATE
// ===================================================================

let currentFilters = {
    equipment: 'all',
    location: 'all',
    sortBy: 'date', // date, weight, reps, volume
    sortOrder: 'desc'
};

// ===================================================================
// STATS VIEW DISPLAY
// ===================================================================

/**
 * Show stats & records view
 */
export async function showStats() {

    const statsSection = document.getElementById('stats-section');
    if (!statsSection) {
        console.error('Stats section not found');
        return;
    }

    statsSection.classList.remove('hidden');

    // Render stats view
    await renderStatsView();
}

/**
 * Render complete stats view
 */
async function renderStatsView() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // Show loading
    container.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="loading-spinner"></div>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Loading your records...</p>
        </div>
    `;

    try {
        // Load streak stats
        const streakStats = await StreakTracker.calculateStreaks();
        const dayFrequency = await StreakTracker.getWorkoutFrequencyByDay();

        const prGroups = PRTracker.getAllPRs();
        const locations = PRTracker.getLocations();

        // Transform PR data to individual records with value field
        const allPRs = [];
        for (const group of prGroups) {
            const { exercise, equipment, prs } = group;

            if (prs.maxWeight) {
                allPRs.push({
                    exercise,
                    equipment,
                    type: 'maxWeight',
                    value: `${prs.maxWeight.weight} lbs × ${prs.maxWeight.reps}`,
                    date: prs.maxWeight.date,
                    location: prs.maxWeight.location
                });
            }

            if (prs.maxReps) {
                allPRs.push({
                    exercise,
                    equipment,
                    type: 'maxReps',
                    value: `${prs.maxReps.reps} reps @ ${prs.maxReps.weight} lbs`,
                    date: prs.maxReps.date,
                    location: prs.maxReps.location
                });
            }

            if (prs.maxVolume) {
                allPRs.push({
                    exercise,
                    equipment,
                    type: 'maxVolume',
                    value: `${prs.maxVolume.volume} lbs (${prs.maxVolume.reps} × ${prs.maxVolume.weight})`,
                    date: prs.maxVolume.date,
                    location: prs.maxVolume.location
                });
            }
        }

        // Get unique equipment types from PRs
        const equipmentTypes = [...new Set(allPRs.map(pr => pr.equipment))];

        container.innerHTML = `
            ${renderStreakStats(streakStats)}
            ${renderFrequencyStats(dayFrequency)}
            ${renderFilters(equipmentTypes, locations)}
            ${renderPRLeaderboard(allPRs)}
        `;
    } catch (error) {
        console.error('❌ Error rendering stats:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Error loading stats</p>
            </div>
        `;
    }
}

// ===================================================================
// STREAK & FREQUENCY STATS
// ===================================================================

function renderStreakStats(stats) {
    if (!stats) {
        return '<div style="padding: 1rem;"><p style="color: var(--text-secondary);">No workout data yet</p></div>';
    }

    return `
        <div class="stats-overview">
            <h2 style="margin: 0 0 1.5rem 0; color: var(--text-primary);">Workout Streaks</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(255, 99, 71, 0.1);">
                        <i class="fas fa-fire" style="color: #ff6347;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Current Streak</div>
                        <div class="stat-value">${stats.currentStreak} ${stats.currentStreak === 1 ? 'day' : 'days'}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(255, 215, 0, 0.1);">
                        <i class="fas fa-trophy" style="color: #ffd700;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Longest Streak</div>
                        <div class="stat-value">${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(64, 224, 208, 0.1);">
                        <i class="fas fa-dumbbell" style="color: #40e0d0;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Total Workouts</div>
                        <div class="stat-value">${stats.totalWorkouts}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(138, 43, 226, 0.1);">
                        <i class="fas fa-calendar-week" style="color: #8a2be2;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">This Week</div>
                        <div class="stat-value">${stats.workoutsThisWeek}</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(50, 205, 50, 0.1);">
                        <i class="fas fa-calendar-alt" style="color: #32cd32;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">This Month</div>
                        <div class="stat-value">${stats.workoutsThisMonth}</div>
                    </div>
                </div>

                ${stats.lastWorkoutDate ? `
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(100, 149, 237, 0.1);">
                        <i class="fas fa-clock" style="color: #6495ed;"></i>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Last Workout</div>
                        <div class="stat-value">${formatDate(stats.lastWorkoutDate)}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderFrequencyStats(dayFrequency) {
    if (!dayFrequency || dayFrequency.length === 0) {
        return '';
    }

    const maxCount = Math.max(...dayFrequency.map(d => d.count));

    return `
        <div class="stats-overview">
            <h2 style="margin: 0 0 1.5rem 0; color: var(--text-primary);">Workout Frequency by Day</h2>
            <div class="frequency-bars">
                ${dayFrequency.map(({ day, count }) => {
                    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return `
                        <div class="frequency-bar-item">
                            <div class="frequency-day">${day.slice(0, 3)}</div>
                            <div class="frequency-bar-track">
                                <div class="frequency-bar-fill" style="width: ${percentage}%;"></div>
                            </div>
                            <div class="frequency-count">${count}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = date.toISOString().split('T')[0];
    const todayOnly = today.toISOString().split('T')[0];
    const yesterdayOnly = yesterday.toISOString().split('T')[0];

    if (dateOnly === todayOnly) return 'Today';
    if (dateOnly === yesterdayOnly) return 'Yesterday';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===================================================================
// FILTERS
// ===================================================================

function renderFilters(equipmentTypes, locations) {
    return `
        <div class="stats-filters">
            <div class="filter-group">
                <label for="equipment-filter">Equipment</label>
                <select id="equipment-filter" onchange="filterPRs('equipment', this.value)" class="filter-select">
                    <option value="all">All Equipment</option>
                    ${equipmentTypes.map(eq => `
                        <option value="${eq}" ${currentFilters.equipment === eq ? 'selected' : ''}>${eq}</option>
                    `).join('')}
                </select>
            </div>

            <div class="filter-group">
                <label for="location-filter">Location</label>
                <select id="location-filter" onchange="filterPRs('location', this.value)" class="filter-select">
                    <option value="all">All Locations</option>
                    ${locations.map(loc => `
                        <option value="${loc.name}" ${currentFilters.location === loc.name ? 'selected' : ''}>${loc.name}</option>
                    `).join('')}
                </select>
            </div>

            <div class="filter-group">
                <label for="sort-filter">Sort By</label>
                <select id="sort-filter" onchange="filterPRs('sortBy', this.value)" class="filter-select">
                    <option value="date" ${currentFilters.sortBy === 'date' ? 'selected' : ''}>Most Recent</option>
                    <option value="weight" ${currentFilters.sortBy === 'weight' ? 'selected' : ''}>Heaviest Weight</option>
                    <option value="reps" ${currentFilters.sortBy === 'reps' ? 'selected' : ''}>Most Reps</option>
                    <option value="volume" ${currentFilters.sortBy === 'volume' ? 'selected' : ''}>Highest Volume</option>
                </select>
            </div>

            <button class="btn btn-secondary btn-small" onclick="clearPRFilters()">
                <i class="fas fa-redo"></i> Reset
            </button>
        </div>
    `;
}

// ===================================================================
// PR LEADERBOARD
// ===================================================================

function renderPRLeaderboard(allPRs) {
    // Apply filters
    let filteredPRs = filterAndSortPRs(allPRs);

    if (filteredPRs.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-trophy" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                <p>No personal records found</p>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">
                    ${currentFilters.equipment !== 'all' || currentFilters.location !== 'all'
                        ? 'Try adjusting your filters'
                        : 'Complete workouts to start tracking PRs'}
                </p>
            </div>
        `;
    }

    // Group PRs by exercise
    const prsByExercise = groupPRsByExercise(filteredPRs);

    return `
        <div class="stats-header">
            <h2>Personal Records</h2>
            <p class="stats-count">${filteredPRs.length} record${filteredPRs.length !== 1 ? 's' : ''} found</p>
        </div>

        <div class="pr-leaderboard">
            ${prsByExercise.map(group => renderExerciseGroup(group)).join('')}
        </div>
    `;
}

function groupPRsByExercise(prs) {
    const groups = {};

    prs.forEach(pr => {
        const key = pr.exercise;
        if (!groups[key]) {
            groups[key] = {
                exercise: pr.exercise,
                records: []
            };
        }
        groups[key].records.push(pr);
    });

    return Object.values(groups);
}

function renderExerciseGroup(group) {
    return `
        <div class="exercise-pr-group">
            <h3 class="exercise-pr-title">
                <i class="fas fa-dumbbell"></i>
                ${group.exercise}
            </h3>
            <div class="pr-records-grid">
                ${group.records.map(record => renderPRCard(record)).join('')}
            </div>
        </div>
    `;
}

function renderPRCard(pr) {
    const prTypeLabels = {
        maxWeight: 'Max Weight',
        maxReps: 'Max Reps',
        maxVolume: 'Max Volume'
    };

    const prTypeIcons = {
        maxWeight: 'weight-hanging',
        maxReps: 'redo',
        maxVolume: 'chart-bar'
    };

    return `
        <div class="pr-record-card">
            <div class="pr-card-header">
                <span class="pr-type-badge ${pr.type}">
                    <i class="fas fa-${prTypeIcons[pr.type]}"></i>
                    ${prTypeLabels[pr.type]}
                </span>
                <span class="pr-equipment-badge">${pr.equipment}</span>
            </div>

            <div class="pr-card-value">
                ${pr.value}
            </div>

            <div class="pr-card-meta">
                <span><i class="fas fa-calendar"></i> ${formatDate(pr.date)}</span>
                ${pr.location ? `<span><i class="fas fa-map-marker-alt"></i> ${pr.location}</span>` : ''}
            </div>
        </div>
    `;
}

// ===================================================================
// FILTERING & SORTING
// ===================================================================

function filterAndSortPRs(allPRs) {
    let filtered = [...allPRs];

    // Apply equipment filter
    if (currentFilters.equipment !== 'all') {
        filtered = filtered.filter(pr => pr.equipment === currentFilters.equipment);
    }

    // Apply location filter
    if (currentFilters.location !== 'all') {
        filtered = filtered.filter(pr => pr.location === currentFilters.location);
    }

    // Apply sorting
    filtered.sort((a, b) => {
        let comparison = 0;

        switch (currentFilters.sortBy) {
            case 'date':
                comparison = b.date.localeCompare(a.date);
                break;

            case 'weight':
                // Extract weight from value string
                const aWeight = extractWeight(a);
                const bWeight = extractWeight(b);
                comparison = bWeight - aWeight;
                break;

            case 'reps':
                const aReps = extractReps(a);
                const bReps = extractReps(b);
                comparison = bReps - aReps;
                break;

            case 'volume':
                const aVol = extractVolume(a);
                const bVol = extractVolume(b);
                comparison = bVol - aVol;
                break;
        }

        return currentFilters.sortOrder === 'desc' ? comparison : -comparison;
    });

    return filtered;
}

function extractWeight(pr) {
    const match = pr.value.match(/(\d+)\s*lbs/);
    return match ? parseInt(match[1]) : 0;
}

function extractReps(pr) {
    const match = pr.value.match(/(\d+)\s*reps?/);
    return match ? parseInt(match[1]) : 0;
}

function extractVolume(pr) {
    if (pr.type === 'maxVolume') {
        const match = pr.value.match(/(\d+)\s*lbs/);
        return match ? parseInt(match[1]) : 0;
    }
    // For other types, calculate volume
    const weight = extractWeight(pr);
    const reps = extractReps(pr);
    return weight * reps;
}

// ===================================================================
// FILTER ACTIONS
// ===================================================================

export function filterPRs(filterType, value) {
    currentFilters[filterType] = value;
    renderStatsView();
}

export function clearPRFilters() {
    currentFilters = {
        equipment: 'all',
        location: 'all',
        sortBy: 'date',
        sortOrder: 'desc'
    };
    renderStatsView();
}

// ===================================================================
// HELPERS
// ===================================================================
// (formatDate is defined above in the STREAK & FREQUENCY STATS section)
