// Clean Workout History Module with Calendar View - core/workout-history.js
import { showNotification, escapeHtml, escapeAttr, displayWeight, formatSet, unitLabel } from '../ui/ui-helpers.js';
import { getDateString, formatDateShort, formatDuration, formatRelativeDate } from '../utils/date-helpers.js';
import { enterSection, navigateBack } from '../ui/navigation.js';
import { getExerciseName, formatStatus, formatCategory, CATEGORY_LABELS } from '../utils/workout-helpers.js';
import { debugLog, CATEGORY_ICONS } from '../utils/config.js';
import { classifyBodyPart } from '../features/metrics/aggregators.js';
import { DASHBOARD_BODY_PARTS } from '../features/exercise-taxonomy.js';
import { confirmSheet } from '../ui/confirm-sheet.js';

export function getWorkoutHistory(appState) {
    const currentHistory = [];
    const filteredHistory = [];

    // Calendar-specific state
    const currentCalendarDate = new Date();
    const calendarWorkouts = {};
    const firstWorkoutDate = null; // Track the earliest workout date

    // Resolve a workout's display name. Older saves may contain a slugified
    // template id (e.g. "chest___push") in workoutType instead of the pretty
    // name. Prefer the matched template's name/day; fall back to trimmed
    // workoutType; last resort "Workout".
    function resolveWorkoutDisplayName(workout) {
        const raw = (workout?.workoutType || '').trim();
        const templateId = workout?.templateId || null;
        const plans = appState?.workoutPlans || [];

        // First try templateId (stored separately since Phase that added it).
        if (templateId) {
            const byId = plans.find((p) => p.id === templateId);
            if (byId) return byId.name || byId.day || raw || 'Workout';
        }

        // If raw looks like a slug (all lowercase/digits/underscore, no space),
        // try matching it as a template id.
        if (raw && /^[a-z0-9_]+$/.test(raw)) {
            const bySlug = plans.find((p) => p.id === raw);
            if (bySlug) return bySlug.name || bySlug.day || raw;
        }

        return raw || 'Workout';
    }

    return {
        currentHistory,
        filteredHistory,
        currentCalendarDate,
        calendarWorkouts,
        firstWorkoutDate,
        resolveWorkoutDisplayName,

        initialize() {
            this.setupEventListeners();
        },

        setupEventListeners() {
            // Search functionality
            const searchInput = document.querySelector('.search-input');
            const clearSearchBtn = document.querySelector('#clear-search');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filterHistory(e.target.value);
                });
            }

            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    this.filterHistory('');
                });
            }

            // Event delegation for workout history UI
            // Handles: workout picker items, action buttons, video buttons, recent workout items
            const actionHandler = (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const action = el.dataset.action;
                const docId = el.dataset.docId;

                switch (action) {
                    case 'selectFromPicker':
                        window.workoutHistory.selectWorkoutFromPicker(
                            el.dataset.date,
                            parseInt(el.dataset.index, 10)
                        );
                        break;
                    case 'showExerciseVideo':
                        window.showExerciseVideo(el.dataset.video, el.dataset.exercise);
                        break;
                    case 'editWorkout':
                        // Inline edit lives in edit-history-inline.js; the old
                        // editHistoricalWorkout (active-workout takeover) is
                        // kept on window as a fallback for any caller we
                        // haven't migrated.
                        if (typeof window.enterHistoricalEditMode === 'function') {
                            window.enterHistoricalEditMode(docId);
                        } else {
                            window.editHistoricalWorkout(docId);
                        }
                        break;
                    case 'deleteWorkout':
                        window.deleteWorkoutById(docId);
                        break;
                    case 'repeatWorkout':
                        window.repeatWorkout(docId);
                        break;
                    case 'resumeWorkout':
                        window.resumeWorkoutById(docId);
                        break;
                    case 'saveAsTemplate': {
                        const workoutData = window.workoutHistory.currentHistory.find(
                            (w) => (w.docId || w.id) === docId
                        );
                        if (workoutData && workoutData.rawData) {
                            window.saveWorkoutAsTemplate(workoutData.rawData);
                        } else if (workoutData) {
                            window.saveWorkoutAsTemplate(workoutData);
                        }
                        break;
                    }
                    case 'showFixedWorkout':
                        window.workoutHistory.showFixedWorkoutModal(
                            window.workoutHistory.currentHistory.find(
                                (w) => (w.docId || w.id) === docId
                            ),
                            0
                        );
                        break;
                }
            };

            // The ⋯ sheet (workout-history-ui.js#openWorkoutDetailMenu) runs its
            // rows through the same handler.
            this._actionHandler = actionHandler;

            // workout-detail-section shares the same action handler
            const detailModal = document.getElementById('workout-detail-section');
            if (detailModal) {
                detailModal.addEventListener('click', actionHandler);
            }

            // Recent workouts list (on the history section itself)
            const historySection = document.getElementById('workout-history-section');
            if (historySection) {
                historySection.addEventListener('click', actionHandler);
            }
        },

        // Core data loading
        async loadHistory() {
            debugLog('🔄 loadHistory called...');
            if (!appState.currentUser) {
                debugLog('❌ loadHistory: No user');
                return;
            }

            try {
                const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(appState);

                this.currentHistory = await workoutManager.getUserWorkouts();
                debugLog(`📊 loadHistory: Loaded ${this.currentHistory.length} workouts`);
                this.filteredHistory = [...this.currentHistory];

                // Find the earliest workout date
                if (this.currentHistory.length > 0) {
                    const dates = this.currentHistory
                        .map((workout) => workout.date)
                        .filter((date) => date) // Remove null/undefined dates
                        .sort();

                    if (dates.length > 0) {
                        this.firstWorkoutDate = dates[0];
                    }
                }
            } catch (error) {
                console.error('❌ Error loading workout history:', error);
                showNotification('Error loading workout history', 'error');
            }
        },

        // Calendar Methods
        async initializeCalendar() {
            await this.loadHistory();
            this.populateCategoryFilter();
            await this.loadCalendarWorkouts();
            this.updateCalendarDisplay();
        },

        async loadCalendarWorkouts() {
            debugLog('🔄 loadCalendarWorkouts called...');
            if (!appState.currentUser) return;

            try {
                const year = this.currentCalendarDate.getFullYear();
                const month = this.currentCalendarDate.getMonth();
                debugLog(
                    `📅 Loading workouts for ${year}-${month + 1}, currentHistory has ${this.currentHistory.length} workouts`
                );

                // Clear existing calendar workouts
                // Schema v3.0: Store ARRAY of workouts per date to support multiple workouts per day
                this.calendarWorkouts = {};

                this.currentHistory.forEach((workout) => {
                    if (!workout.date) {
                        console.warn('Workout missing date:', workout);
                        return;
                    }

                    // FIX: Handle date parsing correctly to avoid timezone issues
                    let workoutDate;
                    if (typeof workout.date === 'string') {
                        // If it's a date string like "2025-09-01", parse it as local date
                        const dateParts = workout.date.split('-');
                        if (dateParts.length === 3) {
                            // Create date in local timezone to avoid offset issues
                            workoutDate = new Date(
                                parseInt(dateParts[0]),
                                parseInt(dateParts[1]) - 1,
                                parseInt(dateParts[2])
                            );
                        } else {
                            // Fallback to regular parsing
                            workoutDate = new Date(workout.date);
                        }
                    } else {
                        // Handle Date objects or timestamps
                        workoutDate = new Date(workout.date);
                    }

                    // Check if this workout is in the current calendar month
                    if (workoutDate.getFullYear() === year && workoutDate.getMonth() === month) {
                        // Use the original date string as the key to avoid timezone conversion
                        const dateKey = getDateString(workout.date);
                        const formattedWorkout = this.formatWorkoutForCalendar(workout);

                        // Schema v3.0: Store as array to support multiple workouts per day
                        if (!this.calendarWorkouts[dateKey]) {
                            this.calendarWorkouts[dateKey] = [];
                        }
                        this.calendarWorkouts[dateKey].push(formattedWorkout);
                    }
                });

                // Sort workouts by start time within each day (most recent first)
                Object.keys(this.calendarWorkouts).forEach((dateKey) => {
                    this.calendarWorkouts[dateKey].sort((a, b) => {
                        const timeA = a.rawData?.startedAt ? new Date(a.rawData.startedAt).getTime() : 0;
                        const timeB = b.rawData?.startedAt ? new Date(b.rawData.startedAt).getTime() : 0;
                        return timeB - timeA; // Most recent first
                    });
                });
            } catch (error) {
                console.error('❌ Error loading calendar workouts:', error);
            }
        },

        formatWorkoutForCalendar(workout) {
            // Prefer the canonical `workout.category` field; fall back to name-based
            // inference for legacy entries that don't carry one.
            let category = workout.category || 'other';
            if (category === 'other') {
                const workoutType = workout.workoutType?.toLowerCase() || '';
                if (
                    workoutType.includes('push') ||
                    workoutType.includes('chest') ||
                    workoutType.includes('shoulder') ||
                    workoutType.includes('tricep')
                ) {
                    category = 'push';
                } else if (workoutType.includes('pull') || workoutType.includes('back') || workoutType.includes('bicep')) {
                    category = 'pull';
                } else if (
                    workoutType.includes('leg') ||
                    workoutType.includes('quad') ||
                    workoutType.includes('glute') ||
                    workoutType.includes('hamstring')
                ) {
                    category = 'legs';
                } else if (workoutType.includes('cardio') || workoutType.includes('core')) {
                    category = 'cardio';
                }
            }

            // Determine status
            let status = 'completed';
            if (workout.cancelledAt) {
                status = 'cancelled';
            } else if (!workout.completedAt) {
                // No completedAt means workout is still in progress
                status = 'incomplete';
            } else if (workout.progress && workout.progress.percentage < 100) {
                status = 'partial';
            }

            // FIX: Duration calculation - handle both minutes and milliseconds
            const durationMs = this.getWorkoutDuration(workout);
            const duration = durationMs > 0 ? formatDuration(durationMs / 1000) : '';

            // Convert exercise data
            const exercises = [];
            if (workout.exercises && workout.exerciseNames) {
                Object.keys(workout.exercises).forEach((exerciseKey) => {
                    const exerciseData = workout.exercises[exerciseKey];
                    const exerciseName = workout.exerciseNames[exerciseKey] || exerciseKey;

                    // Get video from original workout template
                    const exerciseIndex = exerciseKey.replace('exercise_', '');
                    const video = workout.originalWorkout?.exercises?.[exerciseIndex]?.video || '';

                    if (exerciseData && exerciseData.sets) {
                        exercises.push({
                            name: exerciseName,
                            sets: exerciseData.sets.filter((set) => set && (set.reps || set.weight)),
                            notes: exerciseData.notes || '',
                            video: video,
                        });
                    }
                });
            }

            return {
                name: resolveWorkoutDisplayName(workout),
                category: category,
                status: status,
                progress: workout.progress?.percentage || (status === 'completed' ? 100 : 0),
                duration: duration,
                exercises: exercises,
                rawData: workout,
                // Schema v3.0: Include docId for operations (delete, edit, etc.)
                docId: workout.docId || workout.id || workout.date,
            };
        },

        previousMonth() {
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
            this.initializeCalendar();
        },

        nextMonth() {
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
            this.initializeCalendar();
        },

        updateCalendarDisplay() {
            const monthName = this.currentCalendarDate.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
            });

            // Use the correct selector that we confirmed exists
            const monthElement = document.querySelector('.current-month');
            if (monthElement) {
                monthElement.textContent = monthName;
            } else {
                console.error('❌ Could not find .current-month element');
            }

            this.generateCalendarGrid();
        },

        generateCalendarGrid() {
            debugLog(
                `🔄 generateCalendarGrid called, calendarWorkouts has ${Object.keys(this.calendarWorkouts).length} dates`
            );
            // Enhanced element finding with fallback creation
            let calendarGrid = document.getElementById('calendarGrid');

            // If not found by ID, try other selectors
            if (!calendarGrid) {
                calendarGrid =
                    document.querySelector('.calendar-grid') || document.querySelector('[class*="calendar-grid"]');
            }

            // If still not found, create it
            if (!calendarGrid) {
                const container =
                    document.querySelector('.calendar-container') ||
                    document.querySelector('[class*="calendar"]') ||
                    document.getElementById('workout-history-section');

                if (container) {
                    calendarGrid = document.createElement('div');
                    calendarGrid.id = 'calendarGrid';
                    calendarGrid.className = 'calendar-grid';
                    container.appendChild(calendarGrid);
                } else {
                    console.error('❌ Cannot find calendar container');
                    return;
                }
            }

            const year = this.currentCalendarDate.getFullYear();
            const month = this.currentCalendarDate.getMonth();

            const firstDay = new Date(year, month, 1);
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

            // Get today's date in local timezone for proper comparison
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            let html = '';
            const currentDate = new Date(startDate);

            // Generate 6 weeks (42 days) to fill calendar grid
            for (let i = 0; i < 42; i++) {
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                const isCurrentMonth = currentDate.getMonth() === month;
                const isToday = dateStr === todayStr;

                const workout = this.calendarWorkouts[dateStr];

                let dayClass = 'calendar-day';
                if (!isCurrentMonth) {
                    dayClass += ' other-month empty-day';
                }
                if (isToday) dayClass += ' today';
                if (workout && isCurrentMonth) {
                    dayClass += ' has-workout';
                }

                html += `<div class="${dayClass}" data-date="${dateStr}">`;

                // Only show content for current month days
                if (isCurrentMonth) {
                    html += `<div class="day-number">${currentDate.getDate()}</div>`;

                    if (workout) {
                        html += this.getWorkoutIcon(workout);
                    } else {
                        // Rest day — no icon, just the day number (neutral, no negative reinforcement)
                    }
                }
                // Other month days are completely empty

                html += '</div>';
                currentDate.setDate(currentDate.getDate() + 1);
            }

            calendarGrid.innerHTML = html;

            // Render calendar legend
            let legendEl = document.getElementById('calendar-legend');
            if (!legendEl) {
                legendEl = document.createElement('div');
                legendEl.id = 'calendar-legend';
                legendEl.className = 'calendar-legend';
                calendarGrid.parentNode?.insertBefore(legendEl, calendarGrid.nextSibling);
            }
            // Build legend from categories actually used this month
            const usedCategories = new Set();
            Object.values(this.calendarWorkouts).forEach(workouts => {
                const arr = Array.isArray(workouts) ? workouts : [workouts];
                arr.forEach(w => usedCategories.add((w.category || 'other').toLowerCase()));
            });

            // Phase C polish: hide the legend entirely when there are fewer than 4
            // distinct categories this month — icons are self-explanatory for small sets.
            if (usedCategories.size < 4) {
                legendEl.innerHTML = '';
                legendEl.classList.add('hidden');
            } else {
                legendEl.classList.remove('hidden');
                const categoryItems = [...usedCategories].map(cat => {
                    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
                    const label = CATEGORY_LABELS[cat] || formatCategory(cat);
                    return `<span class="legend-item"><i class="fas ${icon} cal-icon cal-icon--${cat}"></i> ${label}</span>`;
                }).join('');

                legendEl.innerHTML = `
                    ${categoryItems}
                    <span class="legend-item"><span class="legend-dot today"></span> Today</span>
                `;
            }

            // ADDED: Setup click events after rendering
            this.setupCalendarClickEvents();

            // Render paginated recent workouts list below calendar
            this.recentWorkoutsPage = 1;
            this.renderRecentWorkoutsList();
        },

        // Paginated recent workouts list below calendar
        ITEMS_PER_PAGE: 10,
        recentWorkoutsPage: 1,

        renderRecentWorkoutsList() {
            const container = document.getElementById('recent-workouts-list');
            if (!container) return;

            const year = this.currentCalendarDate.getFullYear();
            const month = this.currentCalendarDate.getMonth();
            const searchTerm = this.historySearchTerm || '';
            const catFilter = this.historyCategoryFilter || '';
            const isFiltering = !!(searchTerm || catFilter);

            // When a search or category filter is active, look across ALL history
            // so "show me every Bench session" spans time — not just whatever
            // month the calendar happens to be showing. Unfiltered, stay
            // month-scoped so the list matches the calendar above it.
            const monthWorkouts = this.currentHistory
                .filter((w) => {
                    if (!w.date) return false;
                    const parts = w.date.split('-');
                    if (parts.length !== 3) return false;
                    if (!isFiltering && (parseInt(parts[0]) !== year || parseInt(parts[1]) - 1 !== month)) return false;

                    // Muscle-group filter — workout must contain at least one
                    // exercise classified into the selected group.
                    if (catFilter) {
                        const hasGroup = Object.entries(w.exercises || {}).some(([key, ex]) => {
                            const name = ex?.name || ex?.machine || w.exerciseNames?.[key] || '';
                            return classifyBodyPart(name) === catFilter;
                        });
                        if (!hasGroup) return false;
                    }

                    // Search filter — match workout type or exercise names.
                    // Names live inline (ex.name / ex.machine, newer saves) OR in
                    // a parallel exerciseNames map keyed by "exercise_N" (older
                    // saves), so check both — mirrors the row's own name resolution
                    // below. Checking only ex.name silently misses older workouts.
                    if (searchTerm) {
                        const typeMatch = (w.workoutType || '').toLowerCase().includes(searchTerm);
                        if (typeMatch) return true;
                        return Object.entries(w.exercises || {}).some(([key, ex]) => {
                            const name = ex?.name || ex?.machine || w.exerciseNames?.[key] || '';
                            return name.toLowerCase().includes(searchTerm);
                        });
                    }

                    return true;
                })
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            if (monthWorkouts.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-calendar-alt"></i>
                        <h3>${isFiltering ? 'No matching workouts' : 'No workouts this month'}</h3>
                        <p>${isFiltering ? 'Try a different exercise or workout name.' : 'Complete a workout and it will show up here.'}</p>
                    </div>
                `;
                return;
            }

            const visibleCount = this.recentWorkoutsPage * this.ITEMS_PER_PAGE;
            const visibleWorkouts = monthWorkouts.slice(0, visibleCount);
            const hasMore = monthWorkouts.length > visibleCount;

            const heading = searchTerm
                ? `Search results (${monthWorkouts.length})`
                : catFilter
                    ? `${catFilter.charAt(0).toUpperCase() + catFilter.slice(1)} workouts (${monthWorkouts.length})`
                    : 'Workouts this month';
            let html = `<h3 class="recent-workouts-heading">${escapeHtml(heading)}</h3>`;
            html += '<div class="recent-workouts-items">';

            visibleWorkouts.forEach((workout) => {
                const workoutType = resolveWorkoutDisplayName(workout);
                const displayDate = formatRelativeDate(workout.date);
                const exerciseCount = workout.exercises ? Object.keys(workout.exercises).length : 0;
                const durationMin = workout.totalDuration ? Math.floor(workout.totalDuration / 60) : 0;
                const docId = workout.docId || workout.id || workout.date;
                const status = workout.cancelledAt ? 'cancelled' : workout.completedAt ? 'completed' : 'incomplete';

                // Get exercise names for subtitle. Names may live directly on
                // the exercise object (newer saves) or in a parallel
                // workout.exerciseNames map keyed by "exercise_N" (older saves).
                const exerciseNames = workout.exercises
                    ? Object.entries(workout.exercises)
                        .map(([key, ex]) => ex?.name || ex?.machine || workout.exerciseNames?.[key] || '')
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(', ')
                    : '';
                const extraCount = exerciseCount > 3 ? exerciseCount - 3 : 0;

                // Count total sets
                const setCount = workout.exercises
                    ? Object.values(workout.exercises).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0)
                    : 0;

                // Determine category for dot color
                const wt = (workoutType || '').toLowerCase();
                let cat = 'other';
                if (wt.includes('push') || wt.includes('chest') || wt.includes('shoulder') || wt.includes('tricep')) cat = 'push';
                else if (wt.includes('pull') || wt.includes('back') || wt.includes('bicep')) cat = 'pull';
                else if (wt.includes('leg') || wt.includes('quad') || wt.includes('glute') || wt.includes('hamstring')) cat = 'legs';
                else if (wt.includes('cardio') || wt.includes('core')) cat = 'cardio';

                const catIcon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;

                html += `
                    <div class="recent-workout-item" data-action="showFixedWorkout" data-doc-id="${escapeAttr(docId)}">
                        <div class="workout-picker-icon ${cat}">
                            <i class="fas ${catIcon}"></i>
                        </div>
                        <div class="recent-workout-info">
                            <div class="recent-workout-name">${escapeHtml(workoutType)}</div>
                            ${exerciseNames ? `<div class="recent-workout-exercises">${escapeHtml(exerciseNames)}${extraCount > 0 ? ' +' + extraCount : ''}</div>` : ''}
                            <div class="recent-workout-meta">${displayDate}${durationMin > 0 ? ' · ' + formatDuration(workout.totalDuration) : ''}${setCount > 0 ? ' · ' + setCount + ' sets' : ''}</div>
                        </div>
                        <div class="history-workout-status history-workout-status--${status}" aria-label="${status === 'completed' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'Incomplete'}">
                            ${status === 'completed' ? '<i class="fas fa-check" aria-hidden="true"></i>' :
                              status === 'cancelled' ? '<i class="fas fa-times" aria-hidden="true"></i>' :
                              '<i class="fas fa-circle-half-stroke" aria-hidden="true"></i>'}
                        </div>
                    </div>
                `;
            });

            html += '</div>';

            if (hasMore) {
                html += `<button class="btn btn-secondary btn-block recent-workouts-load-more" onclick="window.workoutHistory.loadMoreRecentWorkouts()">Load more</button>`;
            }

            container.innerHTML = html;
        },

        loadMoreRecentWorkouts() {
            this.recentWorkoutsPage++;
            this.renderRecentWorkoutsList();
        },

        // Search & filter state
        historySearchTerm: '',
        historyCategoryFilter: '',

        filterBySearch(queryStr) {
            this.historySearchTerm = queryStr.toLowerCase().trim();
            this.recentWorkoutsPage = 1;

            // Show/hide clear button
            const clearBtn = document.getElementById('history-search-clear');
            if (clearBtn) clearBtn.classList.toggle('hidden', !this.historySearchTerm);

            this.renderRecentWorkoutsList();
        },

        filterByCategory(category) {
            this.historyCategoryFilter = category;
            this.recentWorkoutsPage = 1;
            this.renderRecentWorkoutsList();
        },

        clearSearch() {
            this.historySearchTerm = '';
            this.historyCategoryFilter = '';
            const input = document.getElementById('history-search-input');
            const select = document.getElementById('history-category-filter');
            const clearBtn = document.getElementById('history-search-clear');
            if (input) input.value = '';
            if (select) select.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            this.recentWorkoutsPage = 1;
            this.renderRecentWorkoutsList();
        },

        toggleHistorySearch() {
            const searchBar = document.getElementById('history-search-bar');
            if (searchBar) {
                searchBar.classList.toggle('hidden');
                if (!searchBar.classList.contains('hidden')) {
                    const input = document.getElementById('history-search-input');
                    if (input) input.focus();
                }
            }
        },

        /** Populate the filter dropdown with the MUSCLE GROUPS that actually
         *  appear in the user's history (chest, back, legs…) — not raw workout
         *  names. "Show me chest sessions" is what people want to filter by, and
         *  raw workoutType values (often internal slugs) read as noise. Hides the
         *  select when nothing classifiable exists. */
        populateCategoryFilter() {
            const select = document.getElementById('history-category-filter');
            if (!select) return;

            const present = new Set();
            this.currentHistory.forEach(w => {
                Object.entries(w.exercises || {}).forEach(([key, ex]) => {
                    const name = ex?.name || ex?.machine || w.exerciseNames?.[key] || '';
                    const bp = classifyBodyPart(name);
                    if (bp && bp !== 'other') present.add(bp);
                });
            });

            // Canonical display order (matches the dashboard's body-part cards).
            const ORDER = DASHBOARD_BODY_PARTS;
            const groups = ORDER.filter(bp => present.has(bp));

            let html = '<option value="">All muscle groups</option>';
            groups.forEach(bp => {
                const label = bp.charAt(0).toUpperCase() + bp.slice(1);
                html += `<option value="${escapeAttr(bp)}">${escapeHtml(label)}</option>`;
            });
            select.innerHTML = html;
            select.classList.toggle('hidden', groups.length === 0);
        },

        getWorkoutIcon(workouts) {
            // Schema v3.0: workouts is an array — render small category icons
            const workoutArray = Array.isArray(workouts) ? workouts : [workouts];

            const icons = workoutArray.slice(0, 2).map(w => {
                const cat = (w.category || 'other').toLowerCase();
                const statusClass = w.status === 'cancelled' ? 'cal-icon--cancelled' :
                                   w.status === 'completed' ? '' : 'cal-icon--incomplete';
                const iconClass = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
                return `<i class="fas ${iconClass} cal-icon cal-icon--${cat} ${statusClass}"></i>`;
            }).join('');

            const overflow = workoutArray.length > 2
                ? `<span class="cal-dot-overflow">+${workoutArray.length - 2}</span>`
                : '';

            return `<div class="cal-icon-row">${icons}${overflow}</div>`;
        },

        /**
         * Leave the detail page — back to wherever it was opened from
         * (History, Home…). Flows that go somewhere else (Repeat, Resume)
         * don't call this: the next page's navigation hides it.
         */
        closeWorkoutDetailModal() {
            const section = document.getElementById('workout-detail-section');
            if (section && !section.classList.contains('hidden')) navigateBack();
        },

        // Get workout details by date/id/docId
        // Schema v3.0: calendarWorkouts now stores arrays, need to search through them
        getWorkoutDetails(workoutId) {
            // Search through all calendar workouts (now arrays)
            for (const date in this.calendarWorkouts) {
                const workouts = this.calendarWorkouts[date];
                if (!Array.isArray(workouts)) continue;

                for (const workout of workouts) {
                    // Check by docId (new schema), id, or date
                    if (
                        workout.docId === workoutId ||
                        workout.id === workoutId ||
                        workout.rawData?.docId === workoutId ||
                        workout.rawData?.id === workoutId
                    ) {
                        // Ensure date field is set
                        workout.date = workout.date || workout.rawData?.date || date;
                        return workout;
                    }
                }
            }

            // Fallback: Check if workoutId is a date and return first workout for that date
            if (this.calendarWorkouts[workoutId] && this.calendarWorkouts[workoutId].length > 0) {
                const workout = this.calendarWorkouts[workoutId][0];
                workout.date = workout.date || workoutId;
                return workout;
            }

            return null;
        },

        // Setup calendar day click events
        setupCalendarClickEvents() {
            // Wait a bit for the calendar to render, then add click events
            setTimeout(() => {
                // Empty current-month days → start a manual workout prefilled
                // to that date. (Padding days from other months stay inert.)
                document.querySelectorAll('.calendar-day:not(.has-workout):not(.other-month)').forEach((day) => {
                    day.addEventListener('click', () => {
                        const dateStr = day.getAttribute('data-date');
                        if (dateStr) window.showAddManualWorkoutModal?.(dateStr);
                    });
                });

                document.querySelectorAll('.calendar-day.has-workout').forEach((day) => {
                    if (day) {
                        day.addEventListener('click', (event) => {
                            event.preventDefault();
                            const dateStr = day.getAttribute('data-date');
                            const dayNumber = day.querySelector('.day-number');

                            if (dayNumber && dateStr) {
                                // Visual link: scroll the matching list row into view and
                                // flash a brief highlight so calendar<->list correspondence is obvious.
                                this.flashListRowForDate(dateStr);

                                const calendarWorkouts = this.calendarWorkouts[dateStr];
                                if (calendarWorkouts && calendarWorkouts.length > 0) {
                                    // Schema v3.0: Handle multiple workouts per day
                                    if (calendarWorkouts.length === 1) {
                                        // Single workout - show directly
                                        const fullWorkout = this.currentHistory.find(
                                            (w) =>
                                                w.date === dateStr &&
                                                (w.docId === calendarWorkouts[0].docId ||
                                                    w.id === calendarWorkouts[0].docId)
                                        );
                                        if (fullWorkout) {
                                            this.showFixedWorkoutModal(fullWorkout, 0);
                                        } else {
                                            this.showFixedBasicModal(dateStr, calendarWorkouts[0], 0);
                                        }
                                    } else {
                                        // Multiple workouts - show picker
                                        this.showWorkoutPickerModal(dateStr, calendarWorkouts);
                                    }
                                }
                            }
                        });
                    }
                });
            }, 100);
        },

        // Flash a brief selected-state on the recent-workouts list row whose date matches.
        // Gives the user a visual breadcrumb when tapping calendar days.
        flashListRowForDate(dateStr) {
            const row = document.querySelector(
                `.recent-workouts-list .recent-workout-item[data-doc-id*="${dateStr}"]`
            );
            if (!row) return;
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('is-selected');
            setTimeout(() => row.classList.remove('is-selected'), 1500);
        },

        // Schema v3.0: Show picker when multiple workouts on same day
        showWorkoutPickerModal(date, workouts) {
            const content = document.getElementById('workout-detail-content');
            if (!content) return;

            // The date is the page title (set below).
            let pickerHTML = `
        <div class="workout-picker">
    `;

            workouts.forEach((workout, index) => {
                const startTime = workout.rawData?.startedAt
                    ? new Date(workout.rawData.startedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                      })
                    : '';

                const statusIcon =
                    workout.status === 'completed'
                        ? '<i class="fas fa-check-circle text-success"></i>'
                        : workout.status === 'cancelled'
                          ? '<i class="fas fa-times-circle text-danger"></i>'
                          : '<i class="fas fa-exclamation-circle text-warning"></i>';

                pickerHTML += `
            <div class="workout-picker-item" data-action="selectFromPicker" data-date="${escapeAttr(date)}" data-index="${index}">
                <div class="workout-picker-icon ${workout.category}">
                    <i class="fas ${CATEGORY_ICONS[(workout.category || 'other').toLowerCase()] || CATEGORY_ICONS.other}"></i>
                </div>
                <div class="workout-picker-info">
                    <div class="workout-picker-name">${escapeHtml(workout.name)}</div>
                    <div class="workout-picker-meta">
                        ${startTime ? startTime + ' &bull; ' : ''}${escapeHtml(String(workout.duration || ''))} ${statusIcon}
                    </div>
                </div>
                <i class="fas fa-chevron-right text-secondary"></i>
            </div>
        `;
            });

            pickerHTML += '</div>';
            content.innerHTML = pickerHTML;
            const titleEl = document.getElementById('workout-detail-title');
            const subEl = document.getElementById('workout-detail-subtitle');
            if (titleEl) titleEl.textContent = formatDateShort(date) || 'Workouts';
            if (subEl) subEl.textContent = `${workouts.length} workouts`;
            document.getElementById('workout-detail-footer')?.classList.add('hidden');
            document.getElementById('workout-detail-more')?.classList.add('hidden');
            enterSection('workout-detail-section');
        },

        selectWorkoutFromPicker(date, index) {
            const workouts = this.calendarWorkouts[date];
            if (!workouts || !workouts[index]) return;

            const workout = workouts[index];
            // Find by exact ID match first (workout.docId was set from workout.id in formatWorkoutForCalendar)
            const fullWorkout = this.currentHistory.find((w) => w.id === workout.docId || w.docId === workout.docId);

            if (fullWorkout) {
                this.showFixedWorkoutModal(fullWorkout, index);
            } else {
                this.showFixedBasicModal(date, workout, index);
            }
        },

        /**
         * UD-4 — the workout detail PAGE (routed: navigation.js case
         * 'workout-detail'; back = navigateBack). Title is the workout,
         * subtitle "Tue, Oct 14 · Love Field · 42 min"; Repeat / Edit in the
         * footer, Save as workout / Delete behind ⋯ (Delete no longer sits
         * next to the primary). Sets are written by formatSet.
         */
        showFixedWorkoutModal(workout, _workoutIndex = 0) {
            const section = document.getElementById('workout-detail-section');
            const content = document.getElementById('workout-detail-content');
            if (!section || !content || !workout) return;

            // Schema v3.0: Use docId for all operations
            const docId = workout.docId || workout.id || workout.date;
            this._detailDocId = docId;
            const unit = appState.globalUnit || 'lbs';

            let durationSec = Number(workout.totalDuration) || 0;
            if (durationSec <= 0) durationSec = Math.round((this.getWorkoutDuration(workout) || 0) / 1000);
            const loc = typeof workout.location === 'object' ? workout.location?.name : workout.location;
            const subtitle = [
                formatDateShort(workout.date),
                loc || '',
                durationSec > 0 ? formatDuration(durationSec) : '',
            ].filter(Boolean).join(' · ');

            const titleEl = document.getElementById('workout-detail-title');
            const subEl = document.getElementById('workout-detail-subtitle');
            if (titleEl) titleEl.textContent = resolveWorkoutDisplayName(workout);
            if (subEl) subEl.textContent = subtitle;

            // Exercises — the name opens that lift's page.
            let exerciseHTML = '';
            if (workout.exercises && workout.originalWorkout?.exercises) {
                workout.originalWorkout.exercises.forEach((originalExercise, index) => {
                    const exerciseKey = `exercise_${index}`;
                    const exerciseData = workout.exercises[exerciseKey];
                    const exerciseName =
                        workout.exerciseNames?.[exerciseKey] || getExerciseName(originalExercise);
                    exerciseHTML += `
                <div class="exercise-detail-item">
                    <button type="button" class="exercise-summary__name" onclick="showExerciseDetail('${escapeAttr(exerciseName)}')">
                        <span>${escapeHtml(exerciseName)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i>
                    </button>
                    ${this.generateSetsHTML(exerciseData?.sets || [], unit)}
                    ${exerciseData?.notes ? `<p class="exercise-notes">${escapeHtml(exerciseData.notes)}</p>` : ''}
                </div>
            `;
                });
            } else {
                exerciseHTML = '<p class="no-sets-text">No exercise details saved for this workout.</p>';
            }

            const workoutStatus = workout.status || this.getWorkoutStatus(workout);
            const stats = this.detailStats(workout);
            const statusLine = workoutStatus === 'completed' ? '' : `
        <div class="wd-status wd-status--${escapeAttr(workoutStatus)}">${escapeHtml(formatStatus(workoutStatus))}</div>`;

            content.innerHTML = `${statusLine}
        <div class="wd-stats">
            <div class="wd-stat"><span class="wd-stat__value">${stats.exercises}</span><span class="wd-stat__label">exercise${stats.exercises === 1 ? '' : 's'}</span></div>
            <div class="wd-stat"><span class="wd-stat__value">${stats.sets}</span><span class="wd-stat__label">set${stats.sets === 1 ? '' : 's'}</span></div>
            <div class="wd-stat"><span class="wd-stat__value">${stats.volume}</span><span class="wd-stat__label">${unitLabel(unit)} moved</span></div>
        </div>
        ${workout.sessionLabel ? `<div class="wd-session">${escapeHtml(workout.sessionLabel)}${workout.basedOn ? ' · from your plan' : ''}</div>` : ''}
        <div class="workout-exercises">${exerciseHTML}</div>
    `;

            // Footer: the two things you come here to do. An unfinished
            // session resumes instead of repeating.
            const id = escapeAttr(docId);
            const primary = workoutStatus === 'incomplete'
                ? `<button class="btn btn-primary" data-action="resumeWorkout" data-doc-id="${id}"><i class="fas fa-play"></i> Resume workout</button>`
                : `<button class="btn btn-primary" data-action="repeatWorkout" data-doc-id="${id}"><i class="fas fa-redo"></i> Repeat workout</button>`;
            const footer = document.getElementById('workout-detail-footer');
            if (footer) {
                footer.innerHTML = `
                <button class="btn btn-secondary" data-action="editWorkout" data-doc-id="${id}"><i class="fas fa-pen"></i> Edit</button>
                ${primary}`;
                footer.classList.remove('hidden');
            }
            document.getElementById('workout-detail-more')?.classList.remove('hidden');

            content.scrollTop = 0;
            enterSection('workout-detail-section');
        },

        /** Counts for the stat strip: exercises with a logged set, sets, volume in the user's unit. */
        detailStats(workout) {
            const unit = appState.globalUnit || 'lbs';
            let exercises = 0, sets = 0, volume = 0;
            Object.values(workout.exercises || {}).forEach((ex) => {
                const done = (ex?.sets || []).filter((st) => st && (st.reps || st.weight));
                if (done.length) exercises++;
                sets += done.length;
                done.forEach((st) => {
                    const w = displayWeight(st.weight || 0, st.originalUnit || 'lbs', unit).value;
                    volume += (Number(st.reps) || 0) * w;
                });
            });
            const v = Math.round(volume);
            return { exercises, sets, volume: v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString('en-US') };
        },

        generateSetsHTML(sets, unit = appState.globalUnit || 'lbs') {
            if (!sets || sets.length === 0) {
                return '<p class="no-sets-text">No sets logged</p>';
            }

            let html = '<div class="sets-list">';
            sets.forEach((set) => {
                if (set && (set.reps || set.weight)) {
                    html += `<span class="set-badge">${escapeHtml(formatSet(set, unit))}</span>`;
                }
            });
            html += '</div>';
            return html;
        },

        calculateProgress(workout) {
            if (!workout.exercises || !workout.originalWorkout?.exercises) return 0;

            let totalSets = 0;
            let completedSets = 0;

            Object.keys(workout.exercises).forEach((key) => {
                const exercise = workout.exercises[key];
                if (exercise.sets) {
                    totalSets += exercise.sets.length;
                    completedSets += exercise.sets.filter((set) => set.reps && set.weight).length;
                }
            });

            return totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
        },

        // A calendar entry whose full doc isn't loaded: the same page, from
        // what the calendar knows (it used to target a #workoutModal that
        // doesn't exist and threw).
        showFixedBasicModal(date, calendarWorkout) {
            const raw = calendarWorkout?.rawData || {};
            this.showFixedWorkoutModal({
                ...raw,
                date: raw.date || date,
                docId: calendarWorkout?.docId || raw.docId,
                workoutType: raw.workoutType || calendarWorkout?.name,
                status: calendarWorkout?.status || raw.status,
            }, 0);
        },

        // Search functionality adapted for calendar
        filterHistory(searchTerm) {
            if (!searchTerm || searchTerm.trim() === '') {
                this.filteredHistory = [...this.currentHistory];
                return;
            }

            const query = searchTerm.toLowerCase().trim();
            this.filteredHistory = this.currentHistory.filter((workout) => {
                if (!workout) return false;

                // Search in workout type/name
                if (workout.workoutType?.toLowerCase().includes(query)) return true;

                // Search in date
                if (workout.date?.includes(query)) return true;

                // Search in exercise names
                if (workout.exerciseNames) {
                    const exerciseValues = Object.values(workout.exerciseNames);
                    if (exerciseValues.some((name) => name.toLowerCase().includes(query))) return true;
                }

                // Search in manual notes
                if (workout.manualNotes?.toLowerCase().includes(query)) return true;

                // Search in status
                if (this.getWorkoutStatus(workout).toLowerCase().includes(query)) return true;

                return false;
            });

            // Note: Calendar doesn't re-render on search like table view would
        },

        // Workout management functions
        async deleteWorkout(workoutId) {
            if (!appState.currentUser) return;

            const workout = this.currentHistory.find((w) => w.id === workoutId);
            if (!workout) return;

            const confirmDelete = await confirmSheet({
                title: `Delete "${resolveWorkoutDisplayName(workout)}" from ${formatDateShort(workout.date)}?`,
                message: "This can't be undone.",
                confirmLabel: 'Delete workout',
                cancelLabel: 'Keep workout',
                destructive: true,
            });
            if (!confirmDelete) return;

            try {
                const { deleteDoc, doc, db } = await import('../data/firebase-config.js');
                await deleteDoc(doc(db, 'users', appState.currentUser.uid, 'workouts', workoutId));

                // Remove from local arrays
                this.currentHistory = this.currentHistory.filter((w) => w.id !== workoutId);
                this.filteredHistory = this.filteredHistory.filter((w) => w.id !== workoutId);

                // Invalidate the dashboard's full-history cache (data-manager.js)
                // so streaks / body-part stats reflect the deletion next render.
                const { clearAllWorkoutsCache } = await import('../data/data-manager.js');
                clearAllWorkoutsCache();

                // Refresh calendar if currently shown
                await this.loadCalendarWorkouts();
                this.generateCalendarGrid();

                showNotification('Workout deleted', 'success');
            } catch (error) {
                console.error('Error deleting workout:', error);
                showNotification("Couldn't delete workout — try again", 'error');
            }
        },

        repeatWorkout(date) {
            const workout = this.calendarWorkouts[date];
            if (!workout) return;

            // Get workout name from formatted object or rawData
            const workoutName = workout.name || workout.rawData?.workoutType || 'Workout';
            this.closeWorkoutDetailModal();

            // Start a workout using the workout type/name
            if (typeof window.startWorkout === 'function') {
                window.startWorkout(workoutName);
            } else {
                console.error('❌ startWorkout function not available');
                showNotification("Couldn't start workout — refresh the page", 'error');
            }
        },

        // Helper functions
        getWorkoutStatus(workout) {
            if (workout.cancelledAt) return 'cancelled';
            if (workout.completedAt) return 'completed';
            if (workout.progress && workout.progress.percentage < 100) return 'partial';
            return 'incomplete';
        },

        getWorkoutDuration(workout) {
            // Method 1: Use stored totalDuration (in seconds)
            if (workout.totalDuration && workout.totalDuration > 0) {
                return workout.totalDuration * 1000; // Convert to milliseconds
            }

            // Method 2: Calculate from timestamps (multiple field name variations)
            const startTime = workout.startedAt || workout.startTime;
            const endTime = workout.completedAt || workout.finishedAt;

            if (startTime && endTime) {
                return new Date(endTime) - new Date(startTime);
            }

            // Method 3: If workout is completed but no duration, estimate based on sets
            if (workout.completedAt && workout.exercises) {
                const totalSets = Object.values(workout.exercises).reduce((count, exercise) => {
                    return count + (exercise.sets ? exercise.sets.filter((set) => set.reps && set.weight).length : 0);
                }, 0);

                // Estimate 2 minutes per set (reasonable assumption)
                if (totalSets > 0) {
                    return totalSets * 2 * 60 * 1000; // Convert to milliseconds
                }
            }

            return 0;
        },
    };
}

// Delete workout by document ID
debugLog('🗑️ Registering deleteWorkoutById on window...');
window.deleteWorkoutById = async function (docId) {
    debugLog('🗑️ deleteWorkoutById called with:', docId);

    if (!window.workoutHistory) {
        console.error('❌ workoutHistory not initialized');
        return;
    }

    // Find the workout in history to get its date for display
    const workout = window.workoutHistory.currentHistory.find(
        (w) => w.docId === docId || w.id === docId || w.date === docId
    );

    const displayDate = workout?.date ? formatDateShort(workout.date) : 'this date';

    const confirmDelete = await confirmSheet({
        title: `Delete workout from ${displayDate}?`,
        message: "This can't be undone.",
        confirmLabel: 'Delete workout',
        cancelLabel: 'Keep workout',
        destructive: true,
    });
    if (confirmDelete) {
        try {
            debugLog(`🗑️ Deleting workout: ${docId}`);
            const { deleteDoc, doc, db } = await import('../data/firebase-config.js');
            const { AppState } = await import('../utils/app-state.js');

            if (!AppState.currentUser?.uid) {
                console.error('❌ No user logged in');
                showNotification('You must be logged in to delete workouts', 'error');
                return;
            }

            debugLog(`🗑️ Calling deleteDoc for users/${AppState.currentUser.uid}/workouts/${docId}`);
            const docRef = doc(db, 'users', AppState.currentUser.uid, 'workouts', docId);
            await deleteDoc(docRef);
            debugLog('✅ Firebase delete successful');

            // Verify the document is actually gone by trying to fetch it from server
            const { getDocs, collection, query, where } = await import('../data/firebase-config.js');

            // Force a fresh query from the server to verify deletion
            const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
            const q = query(workoutsRef, where('__name__', '==', docId));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                console.error('❌ Document still exists after delete! Found', snapshot.size, 'docs');
                showNotification('Delete may not have saved — refresh to check', 'warning');
            } else {
                debugLog('✅ Verified: Document no longer exists on server');
            }

            // Close the modal first so user sees immediate feedback
            window.workoutHistory.closeWorkoutDetailModal();

            // Remove from local arrays immediately (Firestore cache may not refresh instantly)
            const beforeCount = window.workoutHistory.currentHistory.length;
            window.workoutHistory.currentHistory = window.workoutHistory.currentHistory.filter(
                (w) => w.id !== docId && w.docId !== docId
            );
            window.workoutHistory.filteredHistory = window.workoutHistory.filteredHistory.filter(
                (w) => w.id !== docId && w.docId !== docId
            );
            debugLog(
                `🗑️ Removed from local arrays: ${beforeCount} -> ${window.workoutHistory.currentHistory.length}`
            );

            // Refresh calendar display with updated local data
            debugLog('🔄 Refreshing calendar display...');
            await window.workoutHistory.loadCalendarWorkouts();
            window.workoutHistory.generateCalendarGrid();
            debugLog('✅ Calendar refreshed');

            showNotification('Workout deleted', 'success');
        } catch (error) {
            console.error('❌ Error deleting workout:', error);
            showNotification("Couldn't delete workout — try again", 'error');
        }
    }
};
