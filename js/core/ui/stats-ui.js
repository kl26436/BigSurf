// Stats UI Module - core/stats-ui.js
// Progress tracking with exercise charts

import { PRTracker } from '../features/pr-tracker.js';
import { StreakTracker } from '../features/streak-tracker.js';
import { ExerciseProgress } from '../features/exercise-progress.js';
import { setBottomNavVisible, navigateTo, updateBottomNavActive } from './navigation.js';
import { setHeaderMode, escapeHtml, escapeAttr, displayWeight } from './ui-helpers.js';
import { AppState } from '../utils/app-state.js';
import { CATEGORY_ICONS } from '../utils/config.js';
import { renderBodyWeightChartSection, renderBodyWeightChart, destroyBodyWeightChart } from '../features/body-measurements-ui.js';

// ===================================================================
// STATE
// ===================================================================

let currentChart = null;
let weeklyVolumeChart = null;
let selectedExerciseKey = null;
let selectedTimeRange = '3M';
let selectedChartType = 'weight'; // 'weight', 'volume', '1rm'
let exerciseList = [];
let exerciseHierarchy = {};
let selectedCategory = null;
let selectedExercise = null;

// ===================================================================
// SMART DEFAULTS
// ===================================================================

/**
 * Find the most frequently logged exercise based on session counts in the hierarchy.
 * Uses the sessionCount already computed by ExerciseProgress.getExerciseHierarchy().
 */
function getMostFrequentExercise(hierarchy, exList) {
    let bestExercise = null;
    let bestCount = 0;

    for (const [category, exercises] of Object.entries(hierarchy)) {
        for (const [exerciseName, variants] of Object.entries(exercises)) {
            // Sum session counts across all equipment variants
            const totalSessions = variants.reduce((sum, v) => sum + (v.sessionCount || 0), 0);
            if (totalSessions > bestCount) {
                bestCount = totalSessions;
                bestExercise = {
                    category,
                    exerciseName,
                    equipmentKey: variants[0]?.key,
                };
            }
        }
    }

    return bestExercise;
}

/**
 * Calculate a simple linear regression trend line for chart data.
 */
function calculateTrendLine(data) {
    if (!data || data.length < 2) return [];

    const n = data.length;
    const values = data.map(d => (typeof d === 'object' ? d.y || d : d));
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = values.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return values.map((_, i) => Math.round((slope * i + intercept) * 10) / 10);
}

// ===================================================================
// MAIN VIEW
// ===================================================================

/**
 * Show stats & progress view
 */
export async function showStats(preSelectedExerciseKey = null) {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) {
        console.error('Stats section not found');
        return;
    }

    // Hide all other sections first
    const sections = [
        'dashboard',
        'workout-selector',
        'active-workout',
        'workout-history-section',
        'workout-management-section',
        'exercise-manager-section',
        'location-management-section',
    ];
    sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Hide main header (page uses section-header-row like Exercise Library)
    setHeaderMode(false);

    statsSection.classList.remove('hidden');
    setBottomNavVisible(true);
    updateBottomNavActive('stats');

    await renderProgressView(preSelectedExerciseKey);
}

/**
 * Close stats view
 */
export function closeStats() {
    const statsSection = document.getElementById('stats-section');
    if (statsSection) {
        statsSection.classList.add('hidden');
    }

    // Destroy charts to prevent memory leaks
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    if (weeklyVolumeChart) {
        weeklyVolumeChart.destroy();
        weeklyVolumeChart = null;
    }
    destroyBodyWeightChart();

    // Restore main header when returning to dashboard
    setHeaderMode(true);
    setBottomNavVisible(true);
    navigateTo('dashboard');
}

/**
 * Render the progress view
 */
async function renderProgressView(preSelectedKey = null) {
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

        // Pre-select exercise from key (e.g. "Bench Press|Hammer Strength")
        if (preSelectedKey) {
            const [exName] = preSelectedKey.split('|');
            for (const [cat, exercises] of Object.entries(exerciseHierarchy)) {
                if (exercises[exName]) {
                    selectedCategory = cat;
                    selectedExercise = exName;
                    const match = exercises[exName].find((eq) => eq.key === preSelectedKey);
                    selectedExerciseKey = match ? match.key : exercises[exName][0]?.key;
                    break;
                }
            }
        }

        // Show empty state if no exercise data exists
        if (Object.keys(exerciseHierarchy).length === 0) {
            container.innerHTML = `
                <div class="progress-page">
                    <div class="section-header-row">
                        <h2 class="section-title"><i class="fas fa-chart-line"></i> Progress</h2>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas fa-chart-line"></i></div>
                        <div class="empty-state-title">Not enough data yet</div>
                        <div class="empty-state-description">Complete a few workouts to see your progress charts and personal records.</div>
                        <button class="btn btn-primary" onclick="navigateTo('workout')">
                            <i class="fas fa-play"></i> Start Workout
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        // Smart default: pick the most frequently logged exercise in the last 30 days
        if (!selectedCategory && Object.keys(exerciseHierarchy).length > 0) {
            const best = getMostFrequentExercise(exerciseHierarchy, exerciseList);
            if (best) {
                selectedCategory = best.category;
                selectedExercise = best.exerciseName;
                selectedExerciseKey = best.equipmentKey;
            } else {
                // Fallback to first category/exercise
                selectedCategory = Object.keys(exerciseHierarchy)[0];
            }
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
                <!-- Section Header (consistent with other pages) -->
                <div class="section-header-row">
                    <h2 class="section-title"><i class="fas fa-chart-line"></i> Progress</h2>
                </div>

                <!-- Summary Cards -->
                ${renderSummaryCards(streaks)}

                <!-- Exercise Selector -->
                ${renderExerciseSelector()}

                <!-- Headline Stat (populated after chart loads) -->
                <div id="headline-stat-container"></div>

                <!-- Chart Section -->
                <div class="progress-chart-section">
                    <!-- Chart Type Toggle -->
                    <div class="chart-type-toggle">
                        ${[
                            { key: 'weight', label: 'Weight', icon: 'fa-dumbbell' },
                            { key: 'volume', label: 'Volume', icon: 'fa-chart-bar' },
                            { key: '1rm', label: 'Est. 1RM', icon: 'fa-trophy' },
                        ].map(
                            (type) => `
                            <button class="chart-type-btn ${selectedChartType === type.key ? 'active' : ''}"
                                    data-action="setChartType" data-chart-type="${type.key}">
                                <i class="fas ${type.icon}"></i>
                                ${type.label}
                            </button>
                        `
                        ).join('')}
                    </div>

                    <!-- Time Range Picker -->
                    <div class="time-range-picker">
                        ${['1M', '3M', '6M', '1Y', 'ALL']
                            .map(
                                (range) => `
                            <button class="time-range-btn ${selectedTimeRange === range ? 'active' : ''}"
                                    data-action="setTimeRange" data-range="${range}">
                                ${range}
                            </button>
                        `
                            )
                            .join('')}
                    </div>

                    <!-- Chart Container -->
                    <div class="chart-container">
                        <canvas id="progress-chart"></canvas>
                    </div>
                </div>

                <!-- Collapsible secondary sections -->
                <div id="session-history" class="session-history">
                    <!-- Populated after exercise selection -->
                </div>

                <div id="weekly-volume-section" class="weekly-volume-section">
                    <!-- Populated after data loads -->
                </div>

                <div id="body-part-section" class="body-part-section">
                    <!-- Populated after data loads -->
                </div>

                <div id="heat-map-section" class="heat-map-section">
                    <!-- Populated after data loads -->
                </div>

                <div id="pr-timeline-section" class="pr-timeline-section">
                    <!-- Populated after data loads -->
                </div>

                <!-- Body Weight Chart (Phase 12.3) -->
                ${renderBodyWeightChartSection()}
            </div>
        `;

        // Event delegation for stats page interactions
        container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'selectCategory' && window.selectProgressCategory) window.selectProgressCategory(target.dataset.category);
            else if (action === 'selectEquipment' && window.selectProgressExercise) window.selectProgressExercise(target.dataset.equipmentKey);
            else if (action === 'setChartType' && window.setProgressChartType) window.setProgressChartType(target.dataset.chartType);
            else if (action === 'setTimeRange' && window.setProgressTimeRange) window.setProgressTimeRange(target.dataset.range);
        });

        // Render chart for selected exercise
        if (selectedExerciseKey) {
            await renderExerciseChart(selectedExerciseKey, selectedTimeRange);
        } else {
            renderNoDataMessage();
        }

        // Render additional sections
        await Promise.all([renderWeeklyVolumeChart(), renderBodyPartDistribution(), renderHeatMapCalendar(), renderPRTimeline(), renderBodyWeightChart()]);
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
                    <i class="fas fa-list-check"></i>
                </div>
                <div class="summary-value">${totalExercises}</div>
                <div class="summary-label">Exercises</div>
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
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                <div class="empty-state-description">Complete workouts to track progress</div>
            </div>
        `;
    }

    // Use shared category icons (keyed by lowercase)
    const categoryIcons = CATEGORY_ICONS;

    // Get exercises for selected category
    const exercises = selectedCategory ? Object.keys(exerciseHierarchy[selectedCategory] || {}) : [];

    // Get equipment for selected exercise
    const equipmentList =
        selectedCategory && selectedExercise ? exerciseHierarchy[selectedCategory]?.[selectedExercise] || [] : [];

    return `
        <div class="exercise-selector-hierarchy">
            <!-- Category Pills -->
            <div class="category-pills">
                ${Object.keys(exerciseHierarchy)
                    .map(
                        (cat) => `
                    <button class="category-pill ${selectedCategory === cat ? 'active' : ''}"
                            data-action="selectCategory" data-category="${escapeAttr(cat)}">
                        <i class="fas ${categoryIcons[cat.toLowerCase()] || 'fa-dumbbell'}"></i>
                        ${escapeHtml(cat)}
                    </button>
                `
                    )
                    .join('')}
            </div>

            <!-- Exercise Dropdown -->
            ${
                exercises.length > 0
                    ? `
                <div class="exercise-row">
                    <div class="exercise-dropdown">
                        <label class="selector-label">Exercise</label>
                        <select id="exercise-select" class="exercise-select" onchange="selectProgressExerciseName(this.value)">
                            ${exercises
                                .map(
                                    (ex) => `
                                <option value="${escapeAttr(ex)}" ${selectedExercise === ex ? 'selected' : ''}>${escapeHtml(ex)}</option>
                            `
                                )
                                .join('')}
                        </select>
                    </div>
                </div>
            `
                    : ''
            }

            <!-- Equipment Pills (collapsed when >1 variant) -->
            ${
                equipmentList.length > 1
                    ? `
                <details class="equipment-filter-details">
                    <summary class="equipment-filter-toggle">
                        <span>Equipment: ${escapeHtml(equipmentList.find(eq => eq.key === selectedExerciseKey)?.equipment || 'All')}</span>
                        <span class="equipment-filter-count">${equipmentList.length}</span>
                        <i class="fas fa-chevron-down"></i>
                    </summary>
                    <div class="equipment-pill-row">
                        ${equipmentList
                            .map(
                                (eq) => `
                            <button class="equipment-pill ${selectedExerciseKey === eq.key ? 'active' : ''}"
                                    data-action="selectEquipment" data-equipment-key="${escapeAttr(eq.key)}">
                                ${escapeHtml(eq.equipment || 'Default')}
                                <span class="equipment-count">${eq.sessionCount}</span>
                            </button>
                        `
                            )
                            .join('')}
                    </div>
                </details>
            `
                    : equipmentList.length === 1
                    ? '' // Only one equipment option — don't show the filter
                    : ''
            }
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
    const chartData = await ExerciseProgress.getChartData(exerciseKey, timeRange, selectedChartType);

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
    const u = AppState.globalUnit || 'lbs';
    const cw = (w) => displayWeight(w, 'lbs', u).value; // convert weight shorthand

    // Chart config varies by type
    const chartConfigs = {
        weight: {
            type: 'line',
            label: `Max Weight (${u})`,
            color: '#1dd3b0',
            bgColor: 'rgba(29, 211, 176, 0.1)',
            yLabel: (v) => cw(v) + ' ' + u,
            tooltipLabel: (tip) => [
                `Weight: ${cw(tip.weight)} ${u}`,
                `Reps: ${tip.reps}`,
                tip.location ? `Location: ${tip.location}` : '',
            ].filter(Boolean),
        },
        volume: {
            type: 'bar',
            label: `Session Volume (${u})`,
            color: '#5856d6',
            bgColor: 'rgba(88, 86, 214, 0.6)',
            yLabel: (v) => { const cv = cw(v); return cv >= 1000 ? (cv / 1000).toFixed(1) + 'k' : cv + ' ' + u; },
            tooltipLabel: (tip) => [
                `Volume: ${cw(tip.volume || 0).toLocaleString()} ${u}`,
                `Max Weight: ${cw(tip.weight)} ${u} × ${tip.reps}`,
                tip.location ? `Location: ${tip.location}` : '',
            ].filter(Boolean),
        },
        '1rm': {
            type: 'line',
            label: `Estimated 1RM (${u})`,
            color: '#ff9500',
            bgColor: 'rgba(255, 149, 0, 0.1)',
            yLabel: (v) => cw(v) + ' ' + u,
            tooltipLabel: (tip) => [
                `Est. 1RM: ${cw(tip.estimated1RM)} ${u}`,
                `Based on: ${cw(tip.weight)} ${u} × ${tip.reps}`,
                tip.location ? `Location: ${tip.location}` : '',
            ].filter(Boolean),
        },
    };

    const config = chartConfigs[selectedChartType] || chartConfigs.weight;

    // Calculate trend line for line charts
    const trendData = config.type === 'line' ? calculateTrendLine(chartData.data) : [];

    const datasets = [
        {
            label: config.label,
            data: chartData.data,
            borderColor: config.color,
            backgroundColor: config.bgColor,
            borderWidth: 2,
            fill: config.type === 'line',
            tension: 0.3,
            pointRadius: config.type === 'line' ? 4 : undefined,
            pointBackgroundColor: config.type === 'line' ? config.color : undefined,
            pointBorderColor: config.type === 'line' ? config.color : undefined,
            pointHoverRadius: config.type === 'line' ? 6 : undefined,
            borderRadius: config.type === 'bar' ? 4 : undefined,
        },
    ];

    // Add trend line as second dataset for line charts
    if (trendData.length > 0) {
        datasets.push({
            label: 'Trend',
            data: trendData,
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            tension: 0,
        });
    }

    currentChart = new Chart(ctx, {
        type: config.type,
        data: {
            labels: chartData.labels,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
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
                        title: function (context) {
                            const idx = context[0].dataIndex;
                            return chartData.tooltips[idx]?.date || '';
                        },
                        label: function (context) {
                            const idx = context.dataIndex;
                            const tip = chartData.tooltips[idx];
                            return config.tooltipLabel(tip);
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                    },
                    ticks: {
                        color: '#7a8a9e',
                        maxRotation: 45,
                        minRotation: 0,
                    },
                },
                y: {
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                    },
                    ticks: {
                        color: '#7a8a9e',
                        callback: function (value) {
                            return config.yLabel(value);
                        },
                    },
                    beginAtZero: selectedChartType === 'volume',
                },
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        },
    });

    // Render headline stat above chart
    renderHeadlineStat(chartData);

    // Render session history
    await renderSessionHistory(exerciseKey, timeRange);
}

function renderNoDataMessage() {
    // Clear headline stat
    const headline = document.getElementById('headline-stat-container');
    if (headline) headline.innerHTML = '';

    const history = document.getElementById('session-history');
    if (history) history.innerHTML = '';
}

// ===================================================================
// HEADLINE STAT
// ===================================================================

function renderHeadlineStat(chartData) {
    const container = document.getElementById('headline-stat-container');
    if (!container) return;

    if (!chartData || !chartData.data || chartData.data.length === 0) {
        container.innerHTML = '';
        return;
    }

    const u = AppState.globalUnit || 'lbs';
    const current = chartData.data[chartData.data.length - 1];
    const oldest = chartData.data[0];
    const currentVal = typeof current === 'object' ? current.y || current : current;
    const oldestVal = typeof oldest === 'object' ? oldest.y || oldest : oldest;

    const currentDisplay = displayWeight(currentVal, 'lbs', u).value;
    const percentChange = oldestVal > 0 ? Math.round(((currentVal - oldestVal) / oldestVal) * 100) : 0;
    const direction = percentChange >= 0 ? 'up' : 'down';
    const arrow = percentChange >= 0 ? '↑' : '↓';
    const rangeLabel = getTimeRangeLabel(selectedTimeRange);

    container.innerHTML = `
        <div class="headline-stat">
            <span class="headline-value">${currentDisplay} ${u}</span>
            <span class="headline-trend ${direction}">${arrow} ${Math.abs(percentChange)}%</span>
            <span class="headline-range">${rangeLabel}</span>
        </div>
    `;
}

// ===================================================================
// STATS SUMMARY
// ===================================================================

function renderExerciseStatsSummary(stats) {
    const container = document.getElementById('exercise-stats-summary');
    if (!container || !stats) return;

    const improvementClass = stats.improvement >= 0 ? 'positive' : 'negative';
    const improvementIcon = stats.improvement >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';

    const trendIcon = stats.trend === 'up' ? 'fa-arrow-trend-up' : stats.trend === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';
    const trendLabel = stats.trend === 'up' ? 'Trending Up' : stats.trend === 'down' ? 'Trending Down' : 'Plateau';

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
        <div class="trend-indicator trend-${stats.trend || 'flat'}">
            <i class="fas ${trendIcon}"></i> ${trendLabel}
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

    // Detect which sessions were PRs at the time (ascending order)
    const prDates = new Set();
    let runningMax = 0;
    for (const s of progressData.sessions) {
        if (s.maxWeight > runningMax) {
            runningMax = s.maxWeight;
            prDates.add(s.date);
        }
    }

    // Show most recent sessions first (reversed)
    const sessions = [...progressData.sessions].reverse().slice(0, 10);
    const allTimeMax = progressData.stats?.maxWeight || 0;

    container.innerHTML = `
        <details class="stats-collapsible" id="session-history-details">
            <summary class="stats-collapsible-header">
                <span>Recent Sessions</span>
                <span class="stats-collapsible-meta">${progressData.sessions.length} total</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                <div class="history-list">
                    ${sessions
                        .map(
                            (session) => `
                        <div class="history-item ${prDates.has(session.date) ? 'history-item--pr' : ''}">
                            <div class="history-date">
                                ${formatDate(session.date)}
                                ${prDates.has(session.date) ? '<span class="pr-badge"><i class="fas fa-trophy"></i> PR</span>' : ''}
                            </div>
                            <div class="history-details">
                                <span class="history-weight ${session.maxWeight === allTimeMax ? 'history-weight--best' : ''}">${displayWeight(session.maxWeight, 'lbs', AppState.globalUnit || 'lbs').value} ${AppState.globalUnit || 'lbs'}</span>
                                <span class="history-reps">&times; ${session.maxReps}</span>
                            </div>
                            ${
                                session.location && session.location !== 'Unknown'
                                    ? `
                                <div class="history-location">
                                    <i class="fas fa-map-marker-alt"></i> ${escapeHtml(session.location)}
                                </div>
                            `
                                    : ''
                            }
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        </details>
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
    document.querySelectorAll('.equipment-pill').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.equipmentKey === key);
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
    document.querySelectorAll('.time-range-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.textContent.trim() === range);
    });

    if (selectedExerciseKey) {
        await renderExerciseChart(selectedExerciseKey, range);
    }

    // Re-render all time-dependent sections
    await Promise.all([
        renderWeeklyVolumeChart(),
        renderBodyPartDistribution(),
        renderHeatMapCalendar(),
        renderPRTimeline(),
    ]);
}

/**
 * Handle chart type change (Weight / Volume / Est. 1RM)
 */
export async function setProgressChartType(chartType) {
    selectedChartType = chartType;

    // Update button states
    document.querySelectorAll('.chart-type-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.chartType === chartType);
    });

    if (selectedExerciseKey) {
        await renderExerciseChart(selectedExerciseKey, selectedTimeRange);
    }
}

// ===================================================================
// WEEKLY VOLUME BAR CHART
// ===================================================================

async function renderWeeklyVolumeChart() {
    const container = document.getElementById('weekly-volume-section');
    if (!container) return;

    const volumeData = await ExerciseProgress.getWeeklyVolumeData(selectedTimeRange);

    if (volumeData.maxVolume === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <details class="stats-collapsible" id="weekly-volume-details">
            <summary class="stats-collapsible-header">
                <span>Weekly Volume</span>
                <span class="stats-collapsible-meta">${getTimeRangeLabel(selectedTimeRange)}</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                <div class="chart-container weekly-volume-chart-container">
                    <canvas id="weekly-volume-chart"></canvas>
                </div>
            </div>
        </details>
    `;

    // Lazy-init chart on first open (canvas has 0 dimensions when collapsed)
    const details = document.getElementById('weekly-volume-details');
    if (details) {
        const initChart = () => {
            details.removeEventListener('toggle', initChart);
            createWeeklyVolumeChart(volumeData);
        };
        details.addEventListener('toggle', initChart);
    }
}

function createWeeklyVolumeChart(volumeData) {
    const canvas = document.getElementById('weekly-volume-chart');
    if (!canvas) return;

    if (weeklyVolumeChart) {
        weeklyVolumeChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    weeklyVolumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: volumeData.labels,
            datasets: [
                {
                    label: 'Weekly Volume',
                    data: volumeData.data,
                    backgroundColor: volumeData.data.map((v) =>
                        v > 0 ? 'rgba(29, 211, 176, 0.7)' : 'rgba(255,255,255,0.05)'
                    ),
                    borderColor: volumeData.data.map((v) =>
                        v > 0 ? '#1dd3b0' : 'rgba(255,255,255,0.1)'
                    ),
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 25, 35, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#b8c5d6',
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            const vol = context.raw;
                            if (vol === 0) return 'No workouts';
                            const formatted = vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol;
                            return `Volume: ${formatted} lbs`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: '#7a8a9e',
                        maxRotation: 45,
                        font: { size: 10 },
                    },
                },
                y: {
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                    },
                    ticks: {
                        color: '#7a8a9e',
                        callback: function (value) {
                            return value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value;
                        },
                    },
                    beginAtZero: true,
                },
            },
        },
    });
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
        <details class="stats-collapsible" id="body-part-details">
            <summary class="stats-collapsible-header">
                <span>Volume by Muscle Group</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                <div class="body-part-content">
                    <div class="donut-chart-container">
                        <canvas id="body-part-chart"></canvas>
                    </div>
                    <div class="body-part-legend">
                        ${distribution.labels
                            .map(
                                (label, i) => `
                            <div class="legend-item">
                                <span class="legend-color" style="background: ${distribution.colors[i]}"></span>
                                <span class="legend-label">${escapeHtml(label)}</span>
                                <span class="legend-value">${distribution.percentages[i]}%</span>
                            </div>
                        `
                            )
                            .join('')}
                    </div>
                </div>
            </div>
        </details>
    `;

    // Lazy-init chart on first open
    const details = document.getElementById('body-part-details');
    if (details) {
        const initChart = () => {
            details.removeEventListener('toggle', initChart);
            createBodyPartChart(distribution);
        };
        details.addEventListener('toggle', initChart);
    }
}

function createBodyPartChart(distribution) {
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
            datasets: [
                {
                    data: distribution.data,
                    backgroundColor: distribution.colors,
                    borderColor: 'rgba(0,0,0,0.3)',
                    borderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 25, 35, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#b8c5d6',
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            const vol = context.raw;
                            const formatted = vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol;
                            return `${formatted} lbs total`;
                        },
                    },
                },
            },
        },
    });
}

// ===================================================================
// CONSISTENCY HEAT MAP
// ===================================================================

async function renderHeatMapCalendar() {
    const container = document.getElementById('heat-map-section');
    if (!container) return;

    const heatMapData = await ExerciseProgress.getHeatMapData(selectedTimeRange);

    if (heatMapData.weeks.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Day labels
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    container.innerHTML = `
        <details class="stats-collapsible" id="heat-map-details">
            <summary class="stats-collapsible-header">
                <span>Consistency</span>
                <span class="stats-collapsible-meta">${getTimeRangeLabel(selectedTimeRange)}</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                <div class="heat-map-container">
                    <div class="heat-map-days">
                        ${dayLabels.map((d) => `<div class="heat-map-day-label">${d}</div>`).join('')}
                    </div>
                    <div class="heat-map-grid">
                        ${heatMapData.weeks
                            .map(
                                (week) => `
                            <div class="heat-map-week">
                                ${week
                                    .map(
                                        (day) => `
                                    <div class="heat-map-cell intensity-${day.intensity} ${day.isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''}"
                                         title="${day.date}: ${day.sets} sets">
                                    </div>
                                `
                                    )
                                    .join('')}
                            </div>
                        `
                            )
                            .join('')}
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
        </details>
    `;
}

// ===================================================================
// PR TIMELINE
// ===================================================================

async function renderPRTimeline() {
    const container = document.getElementById('pr-timeline-section');
    if (!container) return;

    const timeline = await ExerciseProgress.getPRTimeline(8, selectedTimeRange);

    if (timeline.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <details class="stats-collapsible" id="pr-timeline-details">
            <summary class="stats-collapsible-header">
                <span>PR Timeline</span>
                <span class="stats-collapsible-meta">${timeline.length} PRs</span>
                <i class="fas fa-chevron-down stats-collapsible-chevron"></i>
            </summary>
            <div class="stats-collapsible-body">
                <div class="pr-timeline">
                    ${timeline
                        .map(
                            (pr, i) => `
                        <div class="pr-timeline-item ${i === 0 ? 'latest' : ''}">
                            <div class="pr-timeline-marker">
                                <i class="fas fa-star"></i>
                            </div>
                            <div class="pr-timeline-content">
                                <div class="pr-timeline-date">${formatDateRelative(pr.date)}</div>
                                <div class="pr-timeline-exercise">${escapeHtml(pr.exercise)}</div>
                                <div class="pr-timeline-details">
                                    <span class="pr-timeline-weight">${displayWeight(pr.weight, 'lbs', AppState.globalUnit || 'lbs').value} ${AppState.globalUnit || 'lbs'}</span>
                                    <span class="pr-timeline-reps">× ${pr.reps}</span>
                                    ${
                                        pr.equipment && pr.equipment !== 'Unknown'
                                            ? `
                                        <span class="pr-timeline-equipment">${escapeHtml(pr.equipment)}</span>
                                    `
                                            : ''
                                    }
                                </div>
                            </div>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        </details>
    `;
}

// ===================================================================
// HELPERS
// ===================================================================

function getTimeRangeLabel(range) {
    const labels = { '1M': 'Last month', '3M': 'Last 3 months', '6M': 'Last 6 months', '1Y': 'Last year', 'ALL': 'All time' };
    return labels[range] || 'Last 3 months';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
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
        day: 'numeric',
    });
}

// ===================================================================
// LEGACY EXPORTS (keep for backwards compatibility)
// ===================================================================

export function toggleStatsSection() {}
export function togglePRBodyPart() {}
export function filterPRs() {}
export function clearPRFilters() {}
