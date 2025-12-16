// Stats UI Module - core/stats-ui.js
// Progress tracking with exercise charts

import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { ExerciseProgress } from '../features/exercise-progress.js';
import { setBottomNavVisible, navigateTo, updateBottomNavActive } from './navigation.js';
import { setHeaderMode } from './ui-helpers.js';
import { AppState } from '../utils/app-state.js';

// ===================================================================
// STATE
// ===================================================================

let currentChart = null;
let selectedExerciseKey = null;
let selectedTimeRange = '3M';
let exerciseList = [];
let exerciseHierarchy = {};
let selectedCategory = null;
let selectedExercise = null;

// ===================================================================
// MAIN VIEW
// ===================================================================

/**
 * Show stats & progress view
 */
export async function showStats() {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) {
        console.error('Stats section not found');
        return;
    }

    // Hide all other sections first
    const sections = ['dashboard', 'workout-selector', 'active-workout', 'workout-history-section',
                      'workout-management-section', 'exercise-manager-section', 'location-management-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Hide main header (Progress page has its own header with back button)
    setHeaderMode(false);

    statsSection.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('stats');

    await renderProgressView();
}

/**
 * Close stats view
 */
export function closeStats() {
    const statsSection = document.getElementById('stats-section');
    if (statsSection) {
        statsSection.classList.add('hidden');
    }

    // Destroy chart to prevent memory leaks
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    // Restore main header when returning to dashboard
    setHeaderMode(true);
    setBottomNavVisible(true);
    navigateTo('dashboard');
}

/**
 * Render the progress view
 */
async function renderProgressView() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // Show loading
    container.innerHTML = `
        <div class="stats-loading">
            <div class="spinner"></div>
            <p>Loading progress data...</p>
        </div>
    `;

    try {
        // Load exercise list and hierarchy
        exerciseList = await ExerciseProgress.getExerciseList();
        exerciseHierarchy = await ExerciseProgress.getExerciseHierarchy();

        // Get streak data for summary
        const streaks = await StreakTracker.calculateStreaks();

        // Auto-select first category and exercise if none selected
        if (!selectedCategory && Object.keys(exerciseHierarchy).length > 0) {
            selectedCategory = Object.keys(exerciseHierarchy)[0];
        }
        if (selectedCategory && !selectedExercise) {
            const exercises = Object.keys(exerciseHierarchy[selectedCategory] || {});
            if (exercises.length > 0) {
                selectedExercise = exercises[0];
            }
        }
        // Auto-select first equipment for the exercise
        if (selectedCategory && selectedExercise && !selectedExerciseKey) {
            const equipment = exerciseHierarchy[selectedCategory]?.[selectedExercise];
            if (equipment && equipment.length > 0) {
                selectedExerciseKey = equipment[0].key;
            }
        }

        container.innerHTML = `
            <div class="progress-page">
                <!-- Header -->
                <div class="progress-header">
                    <button class="btn-back" onclick="closeStats()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <h2>Progress</h2>
                    <div style="width: 40px;"></div>
                </div>

                <!-- Summary Cards -->
                ${renderSummaryCards(streaks)}

                <!-- Exercise Selector -->
                ${renderExerciseSelector()}

                <!-- Chart Section -->
                <div class="progress-chart-section">
                    <!-- Time Range Picker -->
                    <div class="time-range-picker">
                        ${['1M', '3M', '6M', '1Y', 'ALL'].map(range => `
                            <button class="time-range-btn ${selectedTimeRange === range ? 'active' : ''}"
                                    onclick="setProgressTimeRange('${range}')">
                                ${range}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Chart Container -->
                    <div class="chart-container">
                        <canvas id="progress-chart"></canvas>
                    </div>

                    <!-- Stats Below Chart -->
                    <div id="exercise-stats-summary" class="exercise-stats-summary">
                        <!-- Populated after chart loads -->
                    </div>
                </div>

                <!-- Session History -->
                <div id="session-history" class="session-history">
                    <!-- Populated after exercise selection -->
                </div>

                <!-- Body Part Distribution -->
                <div id="body-part-section" class="body-part-section">
                    <!-- Populated after data loads -->
                </div>

                <!-- Consistency Heat Map -->
                <div id="heat-map-section" class="heat-map-section">
                    <!-- Populated after data loads -->
                </div>

                <!-- PR Timeline -->
                <div id="pr-timeline-section" class="pr-timeline-section">
                    <!-- Populated after data loads -->
                </div>
            </div>
        `;

        // Render chart for selected exercise
        if (selectedExerciseKey) {
            await renderExerciseChart(selectedExerciseKey, selectedTimeRange);
        } else {
            renderNoDataMessage();
        }

        // Render additional sections
        await Promise.all([
            renderBodyPartDistribution(),
            renderHeatMapCalendar(),
            renderPRTimeline()
        ]);

    } catch (error) {
        console.error('Error rendering progress view:', error);
        container.innerHTML = `
            <div class="progress-header">
                <button class="btn-back" onclick="closeStats()">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h2>Progress</h2>
                <div style="width: 40px;"></div>
            </div>
            <div class="stats-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading progress data</p>
            </div>
        `;
    }
}

// ===================================================================
// SUMMARY CARDS
// ===================================================================

function renderSummaryCards(streaks) {
    const totalExercises = exerciseList.length;
    const totalSessions = exerciseList.reduce((sum, ex) => sum + ex.sessionCount, 0);

    return `
        <div class="progress-summary-cards">
            <div class="summary-card">
                <div class="summary-icon fire">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="summary-value">${streaks?.currentStreak || 0}</div>
                <div class="summary-label">Day Streak</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon workouts">
                    <i class="fas fa-dumbbell"></i>
                </div>
                <div class="summary-value">${streaks?.totalWorkouts || 0}</div>
                <div class="summary-label">Workouts</div>
            </div>
            <div class="summary-card">
                <div class="summary-icon exercises">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div class="summary-value">${totalExercises}</div>
                <div class="summary-label">Tracked</div>
            </div>
        </div>
    `;
}

// ===================================================================
// EXERCISE SELECTOR (Hierarchical: Category > Exercise > Equipment)
// ===================================================================

function renderExerciseSelector() {
    if (Object.keys(exerciseHierarchy).length === 0) {
        return `
            <div class="no-exercises-msg">
                <i class="fas fa-dumbbell"></i>
                <p>Complete workouts to track progress</p>
            </div>
        `;
    }

    // Category icons
    const categoryIcons = {
        'Push': 'fa-hand-paper',
        'Pull': 'fa-fist-raised',
        'Legs': 'fa-running',
        'Core': 'fa-child',
        'Other': 'fa-dumbbell'
    };

    // Get exercises for selected category
    const exercises = selectedCategory ? Object.keys(exerciseHierarchy[selectedCategory] || {}) : [];

    // Get equipment for selected exercise
    const equipmentList = (selectedCategory && selectedExercise)
        ? (exerciseHierarchy[selectedCategory]?.[selectedExercise] || [])
        : [];

    return `
        <div class="exercise-selector-hierarchy">
            <!-- Category Pills -->
            <div class="category-pills">
                ${Object.keys(exerciseHierarchy).map(cat => `
                    <button class="category-pill ${selectedCategory === cat ? 'active' : ''}"
                            onclick="selectProgressCategory('${cat}')">
                        <i class="fas ${categoryIcons[cat] || 'fa-dumbbell'}"></i>
                        ${cat}
                    </button>
                `).join('')}
            </div>

            <!-- Exercise Dropdown -->
            ${exercises.length > 0 ? `
                <div class="exercise-row">
                    <div class="exercise-dropdown">
                        <label class="selector-label">Exercise</label>
                        <select id="exercise-select" class="exercise-select" onchange="selectProgressExerciseName(this.value)">
                            ${exercises.map(ex => `
                                <option value="${ex}" ${selectedExercise === ex ? 'selected' : ''}>${ex}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            ` : ''}

            <!-- Equipment Pills -->
            ${equipmentList.length > 0 ? `
                <div class="equipment-section">
                    <label class="selector-label">Equipment</label>
                    <div class="equipment-pills">
                        ${equipmentList.map(eq => `
                            <button class="equipment-pill ${selectedExerciseKey === eq.key ? 'active' : ''}"
                                    onclick="selectProgressExercise('${eq.key}')">
                                ${eq.equipment || 'Default'}
                                <span class="equipment-count">${eq.sessionCount}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ===================================================================
// CHART RENDERING
// ===================================================================

/**
 * Render progress chart for selected exercise
 */
async function renderExerciseChart(exerciseKey, timeRange) {
    const chartData = await ExerciseProgress.getChartData(exerciseKey, timeRange);

    // Destroy existing chart
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    const canvas = document.getElementById('progress-chart');
    if (!canvas) return;

    if (chartData.data.length === 0) {
        renderNoDataMessage();
        return;
    }

    const ctx = canvas.getContext('2d');

    // Chart.js configuration
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Max Weight (lbs)',
                data: chartData.data,
                borderColor: '#1dd3b0',
                backgroundColor: 'rgba(29, 211, 176, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#1dd3b0',
                pointBorderColor: '#1dd3b0',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 25, 35, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#b8c5d6',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            const idx = context[0].dataIndex;
                            return chartData.tooltips[idx]?.date || '';
                        },
                        label: function(context) {
                            const idx = context.dataIndex;
                            const tip = chartData.tooltips[idx];
                            return [
                                `Weight: ${tip.weight} lbs`,
                                `Reps: ${tip.reps}`,
                                tip.location ? `Location: ${tip.location}` : ''
                            ].filter(Boolean);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255,255,255,0.05)'
                    },
                    ticks: {
                        color: '#7a8a9e',
                        maxRotation: 45,
                        minRotation: 0
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255,255,255,0.05)'
                    },
                    ticks: {
                        color: '#7a8a9e',
                        callback: function(value) {
                            return value + ' lbs';
                        }
                    },
                    beginAtZero: false
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });

    // Render stats summary
    renderExerciseStatsSummary(chartData.stats);

    // Render session history
    await renderSessionHistory(exerciseKey, timeRange);
}

function renderNoDataMessage() {
    const container = document.getElementById('exercise-stats-summary');
    if (container) {
        container.innerHTML = `
            <div class="no-chart-data">
                <i class="fas fa-chart-line"></i>
                <p>No data for selected time range</p>
            </div>
        `;
    }

    const history = document.getElementById('session-history');
    if (history) {
        history.innerHTML = '';
    }
}

// ===================================================================
// STATS SUMMARY
// ===================================================================

function renderExerciseStatsSummary(stats) {
    const container = document.getElementById('exercise-stats-summary');
    if (!container || !stats) return;

    const improvementClass = stats.improvement >= 0 ? 'positive' : 'negative';
    const improvementIcon = stats.improvement >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-value">${stats.currentWeight}<span class="stat-unit">lbs</span></div>
                <div class="stat-label">Current</div>
            </div>
            <div class="stat-box highlight">
                <div class="stat-value">${stats.maxWeight}<span class="stat-unit">lbs</span></div>
                <div class="stat-label">PR</div>
                ${stats.prReps ? `<div class="stat-detail">× ${stats.prReps} reps</div>` : ''}
            </div>
            <div class="stat-box">
                <div class="stat-value ${improvementClass}">
                    <i class="fas ${improvementIcon}"></i>
                    ${Math.abs(stats.improvement)}
                </div>
                <div class="stat-label">Change</div>
                <div class="stat-detail">${stats.improvementPercent}%</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${stats.sessionCount}</div>
                <div class="stat-label">Sessions</div>
            </div>
        </div>
    `;
}

// ===================================================================
// SESSION HISTORY
// ===================================================================

async function renderSessionHistory(exerciseKey, timeRange) {
    const container = document.getElementById('session-history');
    if (!container) return;

    const progressData = await ExerciseProgress.getExerciseProgressData(exerciseKey, timeRange);

    if (!progressData || progressData.sessions.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Show most recent sessions first (reversed)
    const sessions = [...progressData.sessions].reverse().slice(0, 10);

    container.innerHTML = `
        <div class="history-section">
            <div class="history-header">
                <span>Recent Sessions</span>
                <span class="history-count">${progressData.sessions.length} total</span>
            </div>
            <div class="history-list">
                ${sessions.map(session => `
                    <div class="history-item">
                        <div class="history-date">${formatDate(session.date)}</div>
                        <div class="history-details">
                            <span class="history-weight">${session.maxWeight} lbs</span>
                            <span class="history-reps">× ${session.maxReps}</span>
                        </div>
                        ${session.location && session.location !== 'Unknown' ? `
                            <div class="history-location">
                                <i class="fas fa-map-marker-alt"></i> ${session.location}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ===================================================================
// EVENT HANDLERS
// ===================================================================

/**
 * Handle category selection (Push/Pull/Legs/etc)
 */
export async function selectProgressCategory(category) {
    selectedCategory = category;

    // Auto-select first exercise in category
    const exercises = Object.keys(exerciseHierarchy[category] || {});
    if (exercises.length > 0) {
        selectedExercise = exercises[0];

        // Auto-select first equipment
        const equipment = exerciseHierarchy[category][selectedExercise];
        if (equipment && equipment.length > 0) {
            selectedExerciseKey = equipment[0].key;
        }
    } else {
        selectedExercise = null;
        selectedExerciseKey = null;
    }

    // Re-render the selector and chart
    await updateSelectorAndChart();
}

/**
 * Handle exercise name selection (from dropdown)
 */
export async function selectProgressExerciseName(exerciseName) {
    selectedExercise = exerciseName;

    // Auto-select first equipment for this exercise
    const equipment = exerciseHierarchy[selectedCategory]?.[exerciseName];
    if (equipment && equipment.length > 0) {
        selectedExerciseKey = equipment[0].key;
    } else {
        selectedExerciseKey = null;
    }

    // Re-render the selector and chart
    await updateSelectorAndChart();
}

/**
 * Handle equipment/exercise key selection
 */
export async function selectProgressExercise(key) {
    selectedExerciseKey = key;

    // Update equipment pill states
    document.querySelectorAll('.equipment-pill').forEach(pill => {
        pill.classList.toggle('active', pill.onclick.toString().includes(key));
    });

    await renderExerciseChart(key, selectedTimeRange);
}

/**
 * Update selector HTML and chart after selection change
 */
async function updateSelectorAndChart() {
    // Re-render selector
    const selectorContainer = document.querySelector('.exercise-selector-hierarchy');
    if (selectorContainer) {
        selectorContainer.outerHTML = renderExerciseSelector();
    }

    // Render chart if we have a selection
    if (selectedExerciseKey) {
        await renderExerciseChart(selectedExerciseKey, selectedTimeRange);
    } else {
        renderNoDataMessage();
    }
}

/**
 * Handle time range change
 */
export async function setProgressTimeRange(range) {
    selectedTimeRange = range;

    // Update button states
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === range);
    });

    if (selectedExerciseKey) {
        await renderExerciseChart(selectedExerciseKey, range);
    }

    // Also update body part distribution which uses time range
    await renderBodyPartDistribution();
}

// ===================================================================
// BODY PART DISTRIBUTION (Donut Chart)
// ===================================================================

let bodyPartChart = null;

async function renderBodyPartDistribution() {
    const container = document.getElementById('body-part-section');
    if (!container) return;

    const distribution = await ExerciseProgress.getBodyPartDistribution(selectedTimeRange);

    if (distribution.labels.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="section-card">
            <div class="section-card-header">
                <h3><i class="fas fa-chart-pie"></i> Volume by Muscle Group</h3>
            </div>
            <div class="body-part-content">
                <div class="donut-chart-container">
                    <canvas id="body-part-chart"></canvas>
                </div>
                <div class="body-part-legend">
                    ${distribution.labels.map((label, i) => `
                        <div class="legend-item">
                            <span class="legend-color" style="background: ${distribution.colors[i]}"></span>
                            <span class="legend-label">${label}</span>
                            <span class="legend-value">${distribution.percentages[i]}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Render donut chart
    const canvas = document.getElementById('body-part-chart');
    if (!canvas) return;

    if (bodyPartChart) {
        bodyPartChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    bodyPartChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: distribution.labels,
            datasets: [{
                data: distribution.data,
                backgroundColor: distribution.colors,
                borderColor: 'rgba(0,0,0,0.3)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 25, 35, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#b8c5d6',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const vol = context.raw;
                            const formatted = vol >= 1000 ? `${(vol/1000).toFixed(1)}k` : vol;
                            return `${formatted} lbs total`;
                        }
                    }
                }
            }
        }
    });
}

// ===================================================================
// CONSISTENCY HEAT MAP
// ===================================================================

async function renderHeatMapCalendar() {
    const container = document.getElementById('heat-map-section');
    if (!container) return;

    const heatMapData = await ExerciseProgress.getHeatMapData();

    if (heatMapData.weeks.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Day labels
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    container.innerHTML = `
        <div class="section-card">
            <div class="section-card-header">
                <h3><i class="fas fa-fire"></i> Consistency</h3>
                <span class="heat-map-label">Last 12 weeks</span>
            </div>
            <div class="heat-map-container">
                <div class="heat-map-days">
                    ${dayLabels.map(d => `<div class="heat-map-day-label">${d}</div>`).join('')}
                </div>
                <div class="heat-map-grid">
                    ${heatMapData.weeks.map(week => `
                        <div class="heat-map-week">
                            ${week.map(day => `
                                <div class="heat-map-cell intensity-${day.intensity} ${day.isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''}"
                                     title="${day.date}: ${day.sets} sets">
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="heat-map-legend">
                <span class="heat-map-legend-label">Less</span>
                <div class="heat-map-cell intensity-0"></div>
                <div class="heat-map-cell intensity-1"></div>
                <div class="heat-map-cell intensity-2"></div>
                <div class="heat-map-cell intensity-3"></div>
                <div class="heat-map-cell intensity-4"></div>
                <span class="heat-map-legend-label">More</span>
            </div>
        </div>
    `;
}

// ===================================================================
// PR TIMELINE
// ===================================================================

async function renderPRTimeline() {
    const container = document.getElementById('pr-timeline-section');
    if (!container) return;

    const timeline = await ExerciseProgress.getPRTimeline(8);

    if (timeline.length === 0) {
        container.innerHTML = `
            <div class="section-card">
                <div class="section-card-header">
                    <h3><i class="fas fa-trophy"></i> PR Timeline</h3>
                </div>
                <div class="pr-timeline-empty">
                    <i class="fas fa-medal"></i>
                    <p>Complete workouts to set PRs!</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="section-card">
            <div class="section-card-header">
                <h3><i class="fas fa-trophy"></i> PR Timeline</h3>
            </div>
            <div class="pr-timeline">
                ${timeline.map((pr, i) => `
                    <div class="pr-timeline-item ${i === 0 ? 'latest' : ''}">
                        <div class="pr-timeline-marker">
                            <i class="fas fa-star"></i>
                        </div>
                        <div class="pr-timeline-content">
                            <div class="pr-timeline-date">${formatDateRelative(pr.date)}</div>
                            <div class="pr-timeline-exercise">${pr.exercise}</div>
                            <div class="pr-timeline-details">
                                <span class="pr-timeline-weight">${pr.weight} lbs</span>
                                <span class="pr-timeline-reps">× ${pr.reps}</span>
                                ${pr.equipment && pr.equipment !== 'Unknown' ? `
                                    <span class="pr-timeline-equipment">${pr.equipment}</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ===================================================================
// HELPERS
// ===================================================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

function formatDateRelative(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

// ===================================================================
// LEGACY EXPORTS (keep for backwards compatibility)
// ===================================================================

export function toggleStatsSection() {}
export function togglePRBodyPart() {}
export function filterPRs() {}
export function clearPRFilters() {}
