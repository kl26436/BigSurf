// AI Coach UI Module - core/features/ai-coach-ui.js
// Client-side UI for the AI Training Coach (Phase 17.4)
// Handles modal, prompt cards, freeform input, and coach history display

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from '../ui/ui-helpers.js';
import { TrainingInsights } from './training-insights.js';
import { Config, debugLog } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

// ===================================================================
// AI COACH MODAL
// ===================================================================

/**
 * Show the AI Coach modal with chat UI.
 * @param {string} [prefillContext] - Optional exercise name for pre-filled plateau context
 */
export function showAICoach(prefillContext) {
    const modal = document.getElementById('ai-coach-modal');
    if (!modal) return;

    const content = modal.querySelector('.coach-content');
    if (!content) return;

    content.innerHTML = `
        <div class="coach-chat-container">
            <div id="coach-chat-area" class="coach-chat-area">
                <div id="coach-empty-state" class="coach-empty-state">
                    <div class="coach-hero">
                        <div class="coach-hero-icon"><i class="fas fa-robot"></i></div>
                        <div class="coach-hero-title">Ask anything</div>
                        <div class="coach-hero-sub">I know your training history. Try:</div>
                    </div>

                    <div class="coach-prompt-list">
                        <div class="prompt-card" onclick="askCoach('Why has my bench press stalled? Suggest a deload strategy.')">
                            <div class="prompt-icon"><i class="fas fa-chart-line"></i></div>
                            <div class="prompt-txt">Why has my <strong>bench press</strong> stalled? Suggest a deload.</div>
                        </div>
                        <div class="prompt-card" onclick="askCoach('Analyze my volume distribution and identify any muscle groups I am neglecting or overtraining.')">
                            <div class="prompt-icon prompt-icon--warning"><i class="fas fa-balance-scale"></i></div>
                            <div class="prompt-txt">Check my <strong>push / pull volume</strong> balance this month.</div>
                        </div>
                        <div class="prompt-card" onclick="askCoach('Plan a 5-day training split optimized for my goals and recent performance.')">
                            <div class="prompt-icon prompt-icon--warm"><i class="fas fa-calendar-alt"></i></div>
                            <div class="prompt-txt">Plan a <strong>5-day split</strong> for my goals.</div>
                        </div>
                        <div class="prompt-card" onclick="askCoach('Help me plan a deload week. I am feeling beat up and need recovery.')">
                            <div class="prompt-icon prompt-icon--core"><i class="fas fa-running"></i></div>
                            <div class="prompt-txt">Help me deload next week — I'm feeling beat up.</div>
                        </div>
                    </div>
                </div>

                <div id="coach-chat-messages" class="chat-wrap"></div>
            </div>

            <div class="chat-input">
                <input id="coach-chat-input" type="text" placeholder="Ask your coach anything\u2026"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();sendCoachMessage();}">
                <button class="chat-send" onclick="sendCoachMessage()"><i class="fas fa-arrow-up"></i></button>
            </div>
        </div>
    `;

    openModal(modal);

    // If prefill context, auto-ask about a plateau
    if (prefillContext) {
        setTimeout(() => {
            askCoach(`My ${prefillContext} has plateaued. Analyze my recent data for this exercise and suggest strategies to break through.`);
        }, 300);
    }
}

/**
 * Close the AI Coach modal.
 */
export function closeAICoach() {
    const modal = document.getElementById('ai-coach-modal');
    if (modal) closeModal(modal);
}

/**
 * Send a message from the chat input bar.
 */
export function sendCoachMessage() {
    const input = document.getElementById('coach-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    askCoach(text);
}

// ===================================================================
// ASK COACH (Cloud Function call)
// ===================================================================

/**
 * Add a chat bubble to the conversation area.
 * @param {'user'|'bot'} role
 * @param {string} html - innerHTML for the bubble
 */
function addChatBubble(role, html) {
    // Hide empty state on first message
    const emptyState = document.getElementById('coach-empty-state');
    if (emptyState) emptyState.classList.add('hidden');

    const wrap = document.getElementById('coach-chat-messages');
    if (!wrap) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-msg ${role}`;
    bubble.innerHTML = html;
    wrap.appendChild(bubble);

    // Scroll to bottom
    const chatArea = document.getElementById('coach-chat-area');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;

    return bubble;
}

/**
 * Call the Cloud Function and display the response as chat bubbles.
 * @param {string} question - The user's question
 */
export async function askCoach(question) {
    if (!question || !question.trim()) {
        showNotification('Please enter a question', 'warning');
        return;
    }

    // Add user bubble
    addChatBubble('user', escapeHtml(question.trim()));

    // Add loading bubble
    const loadingBubble = addChatBubble('bot', `
        <div class="coach-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Analyzing your training data...</span>
        </div>
    `);

    try {
        // Build training context locally
        const { recentWorkouts, allWorkouts } = await TrainingInsights.loadInsightsData();
        const context = buildTrainingContext(allWorkouts);

        // Call Cloud Function
        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
        const functions = getFunctions();
        const getRecommendation = httpsCallable(functions, 'getTrainingRecommendation');

        const result = await getRecommendation({
            question: question.trim(),
            context,
        });

        const recommendation = result.data.recommendation;

        // Replace loading bubble with actual response
        if (loadingBubble) {
            loadingBubble.innerHTML = formatCoachResponse(recommendation);
        }

        // Save to history
        await saveCoachSession(question.trim(), recommendation);

    } catch (error) {
        console.error('AI Coach error:', error);

        const errorMessage = error.message || '';
        let errorHtml;

        if (errorMessage.includes('once per day') || errorMessage.includes('rate limit')) {
            errorHtml = `<i class="fas fa-clock text-warning coach-msg-icon"></i> Coach is available once per day. Check back tomorrow, or review your training insights on the dashboard.`;
        } else if (errorMessage.includes('not-found') || errorMessage.includes('internal')) {
            errorHtml = `<i class="fas fa-cloud text-muted coach-msg-icon"></i> AI Coach requires Cloud Functions to be deployed. The rules-based insights on your dashboard are always available.`;
        } else {
            errorHtml = `<i class="fas fa-exclamation-circle text-muted coach-msg-icon"></i> Unable to reach coach. Check your connection and try again.`;
        }

        if (loadingBubble) {
            loadingBubble.innerHTML = errorHtml;
        }
    }
}

/**
 * Reset the coach UI to show empty state again.
 */
export function resetCoachUI() {
    const emptyState = document.getElementById('coach-empty-state');
    const chatMessages = document.getElementById('coach-chat-messages');

    if (emptyState) emptyState.classList.remove('hidden');
    if (chatMessages) chatMessages.innerHTML = '';
}

// ===================================================================
// TRAINING CONTEXT BUILDER
// ===================================================================

/**
 * Build a token-efficient summary of training data for the Claude API.
 * Aim for ~1500-2000 tokens of context to keep API costs low.
 *
 * @param {Array} workouts - Recent workouts (up to 8 weeks)
 * @returns {string} Compact training summary
 */
function buildTrainingContext(workouts) {
    if (!workouts || workouts.length === 0) return 'No workout data available.';

    const weeks = getWeeksSpan(workouts);
    const exerciseDatabase = AppState.exerciseDatabase || [];

    let summary = '';

    // Volume by muscle group (last 4 weeks worth)
    const fourWeekWorkouts = workouts.filter(w => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 28);
        return w.date >= cutoff.toISOString().slice(0, 10);
    });

    const volume = TrainingInsights.analyzeWeeklyVolume(fourWeekWorkouts, exerciseDatabase);
    if (volume.length > 0) {
        summary += 'Weekly volume (sets/muscle, last 4 weeks avg):\n';
        volume.forEach(v => {
            summary += `${v.bodyPart}: ${v.weeklySets} sets (${v.status})\n`;
        });
    }

    // Key lift trends (max weight per exercise, last 5 sessions)
    const liftTrends = {};
    for (const workout of workouts) {
        if (!workout.exercises) continue;
        for (const ex of Object.values(workout.exercises)) {
            if (!ex.name || !ex.sets) continue;
            const maxW = Math.max(...ex.sets.filter(s => s.weight).map(s => s.weight), 0);
            if (maxW === 0) continue;
            if (!liftTrends[ex.name]) liftTrends[ex.name] = [];
            liftTrends[ex.name].push(maxW);
        }
    }

    // Show top 8 most-trained exercises
    const topLifts = Object.entries(liftTrends)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8);

    if (topLifts.length > 0) {
        summary += '\nKey lift trends (max weight, recent sessions):\n';
        topLifts.forEach(([name, weights]) => {
            const recent = weights.slice(0, 5);
            summary += `${name}: ${recent.join(' -> ')}\n`;
        });
    }

    // Training frequency
    const avgDaysPerWeek = weeks > 0 ? (workouts.length / weeks).toFixed(1) : workouts.length;
    summary += `\nAvg training days/week: ${avgDaysPerWeek}\n`;
    summary += `Total workouts analyzed: ${workouts.length} over ${weeks} weeks\n`;

    // User preferences
    const unit = AppState.globalUnit || 'lbs';
    const goal = AppState.settings?.weeklyGoal || 5;
    summary += `\nUnit: ${unit} | Weekly goal: ${goal} days\n`;

    return summary;
}

/**
 * Calculate the number of weeks spanned by workouts.
 */
function getWeeksSpan(workouts) {
    if (workouts.length === 0) return 0;
    const dates = workouts.map(w => w.date).filter(Boolean).sort();
    const first = new Date(dates[0]);
    const last = new Date(dates[dates.length - 1]);
    return Math.max(1, Math.ceil((last - first) / (7 * 24 * 60 * 60 * 1000)));
}

// ===================================================================
// RESPONSE FORMATTING
// ===================================================================

/**
 * Format the Claude API response for display.
 * Converts markdown-style bullet points and bold to HTML.
 */
function formatCoachResponse(text) {
    if (!text) return '';

    return text
        // Bold text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Bullet points
        .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
        // Wrap consecutive <li> in <ul>
        .replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`)
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Wrap in paragraphs
        .replace(/^(.+)/, '<p>$1</p>');
}

// ===================================================================
// COACH HISTORY
// ===================================================================

/**
 * Save a coaching session to Firestore.
 */
async function saveCoachSession(question, response) {
    if (!AppState.currentUser) return;

    try {
        const { db, collection, addDoc } = await import('../data/firebase-config.js');
        await addDoc(collection(db, 'users', AppState.currentUser.uid, 'coachHistory'), {
            question,
            response,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        debugLog('Failed to save coach session:', error);
    }
}

/**
 * Load past coaching sessions and render in the modal.
 */
async function loadCoachHistory() {
    if (!AppState.currentUser) return;

    const historySection = document.getElementById('coach-history-section');
    if (!historySection) return;

    try {
        const { db, collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
        const q = query(
            collection(db, 'users', AppState.currentUser.uid, 'coachHistory'),
            orderBy('timestamp', 'desc'),
            limit(5)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const sessions = [];
        snapshot.forEach(doc => sessions.push({ id: doc.id, ...doc.data() }));

        historySection.classList.remove('hidden');
        historySection.innerHTML = `
            <div class="coach-history-header">
                <i class="fas fa-history"></i>
                <span>Past Reviews</span>
            </div>
            ${sessions.map(s => `
                <div class="coach-history-item" onclick="showPastCoachSession('${escapeHtml(s.id)}')">
                    <div class="coach-history-question">${escapeHtml(truncate(s.question, 60))}</div>
                    <div class="coach-history-date">${formatCoachDate(s.timestamp)}</div>
                </div>
            `).join('')}
        `;

        // Store sessions for viewing
        window._coachHistorySessions = sessions;
    } catch (error) {
        debugLog('Failed to load coach history:', error);
    }
}

/**
 * Show a past coaching session in the response area.
 */
export function showPastCoachSession(sessionId) {
    const sessions = window._coachHistorySessions || [];
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Hide empty state and clear current chat
    const emptyState = document.getElementById('coach-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    const chatMessages = document.getElementById('coach-chat-messages');
    if (chatMessages) chatMessages.innerHTML = '';

    // Show past session as chat bubbles
    addChatBubble('user', escapeHtml(session.question));
    const botBubble = addChatBubble('bot', formatCoachResponse(session.response));
    if (botBubble) {
        // Prepend a timestamp label
        const label = document.createElement('div');
        label.className = 'coach-past-label';
        label.innerHTML = `<i class="fas fa-history"></i> From ${formatCoachDate(session.timestamp)}`;
        botBubble.insertBefore(label, botBubble.firstChild);
    }
}

// ===================================================================
// WORKOUT BUILDER
// ===================================================================

// Holds the generated template while user reviews it
let _pendingTemplate = null;

/**
 * Show the workout focus picker inside a bot chat bubble.
 */
export function showWorkoutBuilder() {
    // Hide empty state
    const emptyState = document.getElementById('coach-empty-state');
    if (emptyState) emptyState.classList.add('hidden');

    addChatBubble('user', 'Build me a workout');
    addChatBubble('bot', `
        <div class="builder-focus-picker">
            <h3 class="builder-title">What kind of workout?</h3>
            <div class="builder-focus-grid">
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Push')">
                    <i class="fas fa-hand-paper"></i>
                    <span>Push</span>
                    <span class="builder-focus-hint">Chest, Shoulders, Triceps</span>
                </button>
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Pull')">
                    <i class="fas fa-fist-raised"></i>
                    <span>Pull</span>
                    <span class="builder-focus-hint">Back, Biceps</span>
                </button>
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Legs')">
                    <i class="fas fa-walking"></i>
                    <span>Legs</span>
                    <span class="builder-focus-hint">Quads, Hams, Glutes, Calves</span>
                </button>
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Upper Body')">
                    <i class="fas fa-child"></i>
                    <span>Upper Body</span>
                    <span class="builder-focus-hint">Chest, Back, Shoulders, Arms</span>
                </button>
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Lower Body')">
                    <i class="fas fa-walking"></i>
                    <span>Lower Body</span>
                    <span class="builder-focus-hint">Full leg day</span>
                </button>
                <button class="builder-focus-btn" onclick="generateWorkoutTemplate('Full Body')">
                    <i class="fas fa-child"></i>
                    <span>Full Body</span>
                    <span class="builder-focus-hint">All major groups</span>
                </button>
            </div>
            <div class="builder-custom-wrap">
                <input type="text" id="builder-custom-focus" class="coach-textarea" placeholder="Or type a custom focus... (e.g. Arms, Chest & Tris)">
                <button class="btn btn-primary btn-small" onclick="generateWorkoutTemplate(document.getElementById('builder-custom-focus').value)">
                    <i class="fas fa-magic"></i> Generate
                </button>
            </div>
        </div>
    `);
}

/**
 * Call the Cloud Function to generate a workout template.
 * @param {string} focus - Workout focus (e.g. "Push", "Legs")
 */
export async function generateWorkoutTemplate(focus) {
    if (!focus || !focus.trim()) {
        showNotification('Pick a focus or type one in', 'warning');
        return;
    }

    // Add loading bubble
    const loadingBubble = addChatBubble('bot', `
        <div class="coach-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Building your ${escapeHtml(focus)} workout...</span>
        </div>
    `);

    try {
        // Build exercise library context
        const exerciseLibrary = buildExerciseLibraryContext();
        const { allWorkouts } = await TrainingInsights.loadInsightsData();
        const trainingContext = buildTrainingContext(allWorkouts);
        const unit = AppState.globalUnit || 'lbs';

        // Call Cloud Function
        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
        const functions = getFunctions();
        const generate = httpsCallable(functions, 'generateWorkoutTemplate');

        const result = await generate({
            focus: focus.trim(),
            exerciseLibrary,
            trainingContext,
            unit,
        });

        _pendingTemplate = result.data.template;
        if (loadingBubble) renderTemplatePreview(loadingBubble);

    } catch (error) {
        console.error('Template generation error:', error);
        if (loadingBubble) {
            loadingBubble.innerHTML = `<i class="fas fa-exclamation-circle text-muted coach-msg-icon"></i> Failed to generate workout. ${escapeHtml(error.message || 'Try again.')}`;
        }
    }
}

/**
 * Build a compact list of the user's exercises for the AI prompt.
 */
function buildExerciseLibraryContext() {
    const db = AppState.exerciseDatabase || [];
    if (db.length === 0) return 'No exercises in library.';

    // Group by body part for readability
    const byPart = {};
    for (const ex of db) {
        const part = ex.bodyPart || 'Other';
        if (!byPart[part]) byPart[part] = [];
        byPart[part].push(`${ex.name} (${ex.equipmentType || 'Unknown'})`);
    }

    let out = '';
    for (const [part, exercises] of Object.entries(byPart)) {
        out += `${part}: ${exercises.join(', ')}\n`;
    }
    return out;
}

/**
 * Render the template preview with exercise cards.
 */
function renderTemplatePreview(container) {
    const t = _pendingTemplate;
    if (!t) return;

    const exerciseCards = t.exercises.map((ex, i) => {
        const isNew = ex.fromLibrary === false;
        const altHtml = isNew && ex.alternatives && ex.alternatives.length > 0
            ? `<div class="preview-alts">
                <span class="preview-alts-label">Substitutes:</span>
                ${ex.alternatives.map(alt => `<span class="preview-alt-chip">${escapeHtml(alt)}</span>`).join('')}
               </div>`
            : '';

        const newBadge = isNew
            ? '<span class="preview-new-badge">New</span>'
            : '';

        return `
            <div class="preview-exercise-card ${isNew ? 'preview-exercise-new' : ''}">
                <div class="preview-exercise-header">
                    <span class="preview-exercise-num">${i + 1}</span>
                    <div class="preview-exercise-info">
                        <div class="preview-exercise-name">${escapeHtml(ex.name)} ${newBadge}</div>
                        <div class="preview-exercise-meta">${escapeHtml(ex.bodyPart || '')} &middot; ${escapeHtml(ex.equipmentType || '')}</div>
                    </div>
                    <div class="preview-exercise-prescription">
                        <span class="preview-sets">${ex.sets}&times;${ex.reps}</span>
                        ${ex.weight ? `<span class="preview-weight">${ex.weight} ${AppState.globalUnit || 'lbs'}</span>` : ''}
                    </div>
                </div>
                ${altHtml}
                <button class="preview-remove-btn" onclick="removePreviewExercise(${i})" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="template-preview">
            <div class="preview-header">
                <div>
                    <h3 class="preview-template-name">${escapeHtml(t.name)}</h3>
                    <span class="preview-exercise-count">${t.exercises.length} exercises</span>
                </div>
                <button class="btn btn-secondary btn-small" onclick="showWorkoutBuilder()">
                    <i class="fas fa-redo"></i> Regenerate
                </button>
            </div>

            <div class="preview-exercise-list">
                ${exerciseCards}
            </div>

            <div class="preview-actions">
                <button class="btn btn-primary" onclick="saveGeneratedTemplate()">
                    <i class="fas fa-save"></i> Save as Template
                </button>
                <button class="btn btn-secondary" onclick="resetCoachUI()">Cancel</button>
            </div>
        </div>
    `;
}

/**
 * Remove an exercise from the pending template preview.
 */
export function removePreviewExercise(index) {
    if (!_pendingTemplate || !_pendingTemplate.exercises) return;
    _pendingTemplate.exercises.splice(index, 1);

    // Find the last bot bubble that contains the template preview
    const wrap = document.getElementById('coach-chat-messages');
    if (!wrap) return;
    const botBubbles = wrap.querySelectorAll('.chat-msg.bot');
    const lastBot = botBubbles[botBubbles.length - 1];
    if (lastBot) renderTemplatePreview(lastBot);
}

/**
 * Save the generated template to Firestore.
 */
export async function saveGeneratedTemplate() {
    if (!_pendingTemplate) return;

    try {
        const wm = new FirebaseWorkoutManager(AppState);

        // Map AI output to the template schema
        const templateData = {
            name: _pendingTemplate.name,
            category: (_pendingTemplate.category || 'other').toLowerCase(),
            exercises: _pendingTemplate.exercises.map(ex => ({
                name: ex.name,
                machine: ex.name,
                bodyPart: ex.bodyPart || 'General',
                equipmentType: ex.equipmentType || 'Machine',
                sets: ex.sets || 3,
                reps: ex.reps || 10,
                weight: ex.weight || 0,
                tags: [],
                group: null,
            })),
        };

        await wm.saveWorkoutTemplate(templateData);

        // Refresh workout plans in AppState
        const templates = await wm.getUserWorkoutTemplates();
        AppState.workoutPlans = templates;

        _pendingTemplate = null;

        showNotification(`"${templateData.name}" saved!`, 'success');
        closeAICoach();

    } catch (error) {
        console.error('Error saving generated template:', error);
        showNotification('Failed to save template', 'error');
    }
}

// ===================================================================
// HELPERS
// ===================================================================

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
}

function formatCoachDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
