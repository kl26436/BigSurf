// AI Coach UI Module - core/features/ai-coach-ui.js
// Client-side UI for the AI Training Coach (Phase 17.4)
// Handles modal, prompt cards, freeform input, and coach history display

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, convertWeight } from '../ui/ui-helpers.js';
import { formatRelativeDate } from '../utils/date-helpers.js';
import { navigateTo, navigateBack } from '../ui/navigation.js';
import { TrainingInsights } from './training-insights.js';
import { Config, debugLog, getCategoryIcon } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { formatCoachResponse } from './coach-markdown.js';
import {
    buildProfileContext, buildPRContext, buildTemplatesContext,
    setTypeMarker, templatesChangedNote,
} from './coach-context.js';

/**
 * Iterate a workout's exercises with `name` resolved from the workout-level
 * `exerciseNames` map (persisted exercises carry no inline name). Inlined
 * rather than imported from aggregators.js: prod pins JS for a year, so a
 * cross-module export would crash on version skew. Keep in sync with the
 * copies in aggregators.js / training-insights.js.
 */
function withResolvedNames(workout) {
    const exercises = workout?.exercises || {};
    return Object.entries(exercises).map(([key, ex]) => ({
        ...ex,
        name: ex?.name || ex?.machine || workout?.exerciseNames?.[key] || null,
    }));
}

// Conversation history for the current chat session. Each entry is
// { role: 'user' | 'assistant', content: string }. The Cloud Function
// sends the full thread to Claude so the model can carry context across
// turns instead of forgetting the topic between sends.
let _coachConversation = [];
// Template names as of the thread's first turn — context is only attached
// once, so mid-conversation template changes get a one-line freshness note
// instead of a full context resend.
let _coachThreadTemplateNames = null;

// ===================================================================
// AI COACH MODAL
// ===================================================================

/**
 * Compute personalized prompt cards from AppState.workouts.
 * Prioritizes contextual prompts (stalled lifts, volume imbalance, deload),
 * then fills remaining slots with generic starter prompts. Always returns 4.
 */
function getContextualPrompts() {
    const workouts = AppState.workouts || [];
    const exerciseDatabase = AppState.exerciseDatabase || [];
    const prompts = [];

    if (workouts.length > 0) {
        try {
            const plateaus = TrainingInsights.detectPlateaus(workouts);
            if (plateaus.length > 0) {
                const p = plateaus[0];
                const name = p.exercise;
                prompts.push({
                    icon: 'fa-chart-line',
                    iconClass: '',
                    text: `My ${name} has stalled at ${p.weight} ${AppState.globalUnit || 'lbs'} across ${p.sessions} sessions. Analyze my recent data and suggest strategies to break through.`,
                    html: `Why has my <strong>${escapeHtml(name.toLowerCase())}</strong> stalled? Suggest a deload.`,
                });
            }
        } catch (e) { debugLog('coach prompts: plateau check failed', e); }

        try {
            const volumes = TrainingInsights.analyzeWeeklyVolume(workouts.slice(0, 20), exerciseDatabase);
            const low = volumes.find(v => v.status === 'low');
            const high = volumes.find(v => v.status === 'high');
            if (low) {
                prompts.push({
                    icon: 'fa-balance-scale',
                    iconClass: 'coach-prompt-card__icon--warning',
                    text: `My ${low.bodyPart} volume is only ${low.weeklySets} working sets per week. How should I rebalance my program to hit all muscle groups?`,
                    html: `My <strong>${escapeHtml(low.bodyPart)}</strong> volume is low — how do I rebalance?`,
                });
            } else if (high) {
                prompts.push({
                    icon: 'fa-balance-scale',
                    iconClass: 'coach-prompt-card__icon--warning',
                    text: `My ${high.bodyPart} volume is ${high.weeklySets} sets per week. Am I overtraining? How should I adjust?`,
                    html: `Am I overtraining <strong>${escapeHtml(high.bodyPart)}</strong>?`,
                });
            }
        } catch (e) { debugLog('coach prompts: volume check failed', e); }

        try {
            const deload = TrainingInsights.checkDeloadNeeded(workouts);
            if (deload?.needed) {
                prompts.push({
                    icon: 'fa-running',
                    iconClass: 'coach-prompt-card__icon--core',
                    text: `I've trained hard for ${deload.consecutiveHardWeeks} consecutive weeks. Plan a deload week for me.`,
                    html: `Plan a <strong>deload week</strong> — I've gone hard ${deload.consecutiveHardWeeks} weeks straight.`,
                });
            }
        } catch (e) { debugLog('coach prompts: deload check failed', e); }
    }

    const usedIcons = new Set(prompts.map(p => p.icon));
    const fallbacks = [
        {
            icon: 'fa-calendar-alt',
            iconClass: 'coach-prompt-card__icon--warm',
            text: 'Plan a 5-day training split optimized for my goals and recent performance.',
            html: `Plan a <strong>5-day split</strong> for my goals.`,
        },
        {
            icon: 'fa-balance-scale',
            iconClass: 'coach-prompt-card__icon--warning',
            text: 'Analyze my volume distribution and identify any muscle groups I am neglecting or overtraining.',
            html: `Check my <strong>push / pull volume</strong> balance this month.`,
        },
        {
            icon: 'fa-chart-line',
            iconClass: '',
            text: 'Summarize my training trends over the last month and highlight wins and concerns.',
            html: `Summarize my <strong>training trends</strong> this month.`,
        },
        {
            icon: 'fa-running',
            iconClass: 'coach-prompt-card__icon--core',
            text: "Help me plan a deload week. I am feeling beat up and need recovery.",
            html: `Help me deload — I'm feeling beat up.`,
        },
    ];

    for (const fb of fallbacks) {
        if (prompts.length >= 4) break;
        if (!usedIcons.has(fb.icon)) {
            prompts.push(fb);
            usedIcons.add(fb.icon);
        }
    }

    return prompts.slice(0, 4);
}

/**
 * Render the AI Coach page into #ai-coach-section. Does NOT navigate — caller
 * decides. Used both by `showAICoach()` (direct entry) and by navigation.js
 * case 'ai-coach' (tab/more-menu entry) so the section is never empty.
 */
export function renderAICoachSection() {
    const section = document.getElementById('ai-coach-section');
    if (!section) return;

    const prompts = getContextualPrompts();
    const promptsHtml = prompts.map(p => `
                        <div class="coach-prompt-card" onclick="askCoach('${escapeAttr(p.text)}')">
                            <div class="coach-prompt-card__icon${p.iconClass ? ' ' + p.iconClass : ''}"><i class="fas ${p.icon}"></i></div>
                            <div class="coach-prompt-card__text">${p.html}</div>
                        </div>`).join('');

    section.innerHTML = `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeAICoach()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">AI Coach</div>
            </div>
            <button class="page-header__icon-btn" onclick="openCoachHistory()" aria-label="Past conversations"><i class="fas fa-history"></i></button>
        </div>

        <div class="coach-chat-container">
            <div id="coach-chat-area" class="coach-chat-area">
                <div id="coach-empty-state" class="coach-empty-state">
                    <div class="coach-hero">
                        <div class="coach-hero__icon"><i class="fas fa-robot"></i></div>
                        <div class="coach-hero__title">Ask anything</div>
                        <div class="coach-hero__desc">I know your training history.</div>
                    </div>

                    <!-- Past reviews lead when they exist (revealed by loadCoachHistory);
                         the prompt cards below are the "start something new" fallback. -->
                    <div id="coach-history-section" class="coach-history-section hidden"></div>

                    <div class="coach-prompt-intro">Try asking…</div>
                    <div class="coach-prompt-list">${promptsHtml}
                    </div>
                </div>

                <div id="coach-chat-messages" class="coach-chat"></div>
            </div>

            <div class="coach-input-bar">
                <input id="coach-chat-input" type="text" placeholder="Ask your coach anything\u2026"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();sendCoachMessage();}">
                <button class="coach-input-bar__send" onclick="sendCoachMessage()" aria-label="Send"><i class="fas fa-arrow-up"></i></button>
            </div>
        </div>
    `;

    loadCoachHistory();
}

/**
 * Show the AI Coach page. Direct entry point — renders + navigates.
 * @param {string} [prefillContext] - Optional exercise name for pre-filled plateau context
 */
export function showAICoach(prefillContext) {
    renderAICoachSection();
    navigateTo('ai-coach-section');

    // Warm the equipment cache so buildTrainingContext can include the user's
    // actual gym inventory in the prompt. Fire-and-forget — if it lands
    // before the first askCoach call, great; if not, the next call picks it up.
    if (!AppState._cachedEquipment || AppState._cachedEquipment.length === 0) {
        (async () => {
            try {
                const wm = new FirebaseWorkoutManager(AppState);
                AppState._cachedEquipment = await wm.getUserEquipment();
            } catch { /* non-fatal — coach still works without equipment */ }
        })();
    }

    // If prefill context, auto-ask about a plateau
    if (prefillContext) {
        setTimeout(() => {
            askCoach(`My ${prefillContext} has plateaued. Analyze my recent data for this exercise and suggest strategies to break through.`);
        }, 300);
    }
}

/**
 * Close the AI Coach page — returns to whatever was previously visible.
 */
export function closeAICoach() {
    navigateBack();
}

/**
 * Reset to the empty state so the history list (and starter prompts) is visible.
 * Called from the history icon in the page-header.
 */
export function openCoachHistory() {
    const chatMessages = document.getElementById('coach-chat-messages');
    if (chatMessages) chatMessages.innerHTML = '';
    const emptyState = document.getElementById('coach-empty-state');
    if (emptyState) emptyState.classList.remove('hidden');
    loadCoachHistory();
    document.getElementById('coach-chat-area')?.scrollTo({ top: 0, behavior: 'smooth' });
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
    bubble.className = `coach-msg coach-msg--${role}`;
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
        showNotification('Type a question', 'warning');
        return;
    }

    // Add user bubble
    addChatBubble('user', escapeHtml(question.trim()));

    // Add loading bubble
    const loadingBubble = addChatBubble('bot', `
        <div class="coach-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Analyzing your training data…</span>
        </div>
    `);

    try {
        // Build training context locally. We pull the FULL workout history
        // (cached for 5 min via data-manager) so the coach can spot trends
        // over months instead of just the last 8 weeks. loadInsightsData's
        // 8-week window is too narrow once a user has any meaningful history.
        const { loadAllWorkouts } = await import('../data/data-manager.js');
        const allWorkouts = await loadAllWorkouts(AppState);
        let healthSummary = '';
        try {
            healthSummary = await buildHealthSummary(AppState.globalUnit || 'lbs');
        } catch (e) { debugLog('coach: health summary failed', e); }

        // PRs — the coach can't say "that's 95% of your all-time best" without
        // the record book. Non-fatal if unavailable.
        let prList = [];
        try {
            const { PRTracker } = await import('./pr-tracker.js');
            await PRTracker.loadPRData?.();
            prList = PRTracker.getAllPRs?.() || [];
        } catch (e) { debugLog('coach: PRs unavailable', e); }

        const context = buildTrainingContext(allWorkouts, healthSummary, prList);

        // Append the user's turn to the running conversation. The first user
        // turn gets the training context prepended so Claude grounds its
        // answers in real numbers; subsequent turns just carry the question —
        // plus a one-line freshness note when the template list changed since
        // the thread started (context is never resent whole).
        const templateNames = (AppState.workoutPlans || []).map(t => t.name || t.day).filter(Boolean);
        let userTurn;
        if (_coachConversation.length === 0) {
            _coachThreadTemplateNames = templateNames;
            userTurn = `Here is my recent training data:\n\n${context}\n\nQuestion: ${question.trim()}`;
        } else {
            const note = templatesChangedNote(_coachThreadTemplateNames || [], templateNames);
            if (note) _coachThreadTemplateNames = templateNames;
            userTurn = note + question.trim();
        }
        _coachConversation.push({ role: 'user', content: userTurn });

        // Streaming first (first words in ~2s), falling back to the buffered
        // callable so the coach is never LESS reliable than it was.
        let recommendation = await streamCoachResponse(question.trim(), loadingBubble);

        if (recommendation == null) {
            // Fallback: the legacy buffered callable. Reset the bubble to a
            // spinner in case the stream died mid-render.
            if (loadingBubble) {
                loadingBubble.innerHTML = `
                    <div class="coach-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Analyzing your training data…</span>
                    </div>
                `;
            }
            const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
            const functions = getFunctions();
            const getRecommendation = httpsCallable(functions, 'getTrainingRecommendation');
            const result = await getRecommendation({
                messages: _coachConversation,
                question: question.trim(),
                context,
            });
            recommendation = result.data.recommendation;
            if (loadingBubble) {
                loadingBubble.innerHTML = formatCoachResponse(recommendation);
            }
        }

        // Track the assistant's reply so the next user message includes it.
        // History is saved SERVER-side on both paths (the old extra client-side
        // save produced duplicate coachHistory docs).
        _coachConversation.push({ role: 'assistant', content: recommendation });

    } catch (error) {
        console.error('AI Coach error:', error);

        // The user turn didn't produce an answer — drop it so a retry doesn't
        // send a double question.
        if (_coachConversation[_coachConversation.length - 1]?.role === 'user') {
            _coachConversation.pop();
        }

        const errorMessage = error.message || '';
        let errorHtml;

        if (errorMessage.includes('resource-exhausted') || errorMessage.includes('limit') || errorMessage.includes('rate')) {
            errorHtml = `<i class="fas fa-clock text-warning coach-msg-icon"></i> Daily coach limit reached — try again tomorrow. Your dashboard insights are always available.`;
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
 * Stream the coach's answer into `bubble` via the v2 SSE endpoint.
 * Returns the full response text, or null when the caller should fall back to
 * the buffered callable (endpoint missing, network error, stream died before
 * finishing). Throws ONLY for the rate-limit case — falling back would just
 * burn another quota unit on the same refusal.
 */
async function streamCoachResponse(question, bubble) {
    let acc = '';
    try {
        const token = await AppState.currentUser?.getIdToken?.();
        if (!token || !Config.COACH_STREAM_URL) return null;

        const resp = await fetch(Config.COACH_STREAM_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ messages: _coachConversation, question }),
        });
        if (resp.status === 429) throw new Error('resource-exhausted');
        if (!resp.ok || !resp.body) return null;

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;

        while (!done) {
            const { value, done: rDone } = await reader.read();
            if (rDone) break;
            buffer += decoder.decode(value, { stream: true });
            let sep;
            while ((sep = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;
                let ev;
                try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

                if (ev.type === 'status' && bubble && !acc) {
                    bubble.innerHTML = `
                        <div class="coach-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>${escapeHtml(ev.text || 'Thinking…')}</span>
                        </div>
                    `;
                } else if (ev.type === 'delta') {
                    acc += ev.text || '';
                    if (bubble) bubble.innerHTML = formatCoachResponse(acc);
                    scrollCoachChatIfNearBottom();
                } else if (ev.type === 'done') {
                    acc = ev.fullText || acc;
                    if (bubble) bubble.innerHTML = formatCoachResponse(acc);
                    scrollCoachChatIfNearBottom();
                    done = true;
                } else if (ev.type === 'error') {
                    debugLog('coach stream error event:', ev.message);
                    return null; // fall back to the callable
                }
            }
        }
        // Stream ended without a `done` event → treat as failure, fall back.
        return done ? acc : null;
    } catch (e) {
        if ((e.message || '').includes('resource-exhausted')) throw e;
        debugLog('coach stream failed, falling back:', e);
        return null;
    }
}

/**
 * Auto-scroll the chat as chunks arrive — but only when the user is already
 * near the bottom, so manual scroll-up to reread isn't fought.
 */
function scrollCoachChatIfNearBottom() {
    const chatArea = document.getElementById('coach-chat-area');
    if (!chatArea) return;
    const distanceFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    if (distanceFromBottom < 160) {
        chatArea.scrollTop = chatArea.scrollHeight;
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
    // New chat → drop the in-memory conversation thread.
    _coachConversation = [];
    _coachThreadTemplateNames = null;
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
function buildTrainingContext(workouts, healthSummary = '', prList = []) {
    if (!workouts || workouts.length === 0) return 'No workout data available.';

    const weeks = getWeeksSpan(workouts);
    const exerciseDatabase = AppState.exerciseDatabase || [];

    // Who the coach is talking to comes first — goal/experience/injuries
    // reframe everything below it.
    let summary = buildProfileContext(AppState.settings || {});
    if (summary) summary += '\n';

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

    // Key lift trends (max weight per exercise, last 5 sessions).
    // Normalize every set to the user's display unit so a mixed-unit log
    // doesn't read as "225 -> 100 -> 225" when the 100 is actually kg.
    const unit = AppState.globalUnit || 'lbs';
    const liftTrends = {};
    for (const workout of workouts) {
        if (!workout.exercises) continue;
        for (const ex of withResolvedNames(workout)) {
            if (!ex.name || !ex.sets) continue;
            const normalized = ex.sets
                // Warmups out — a 45 lb warmup polluting a max-weight trend
                // reads as a strength crash that never happened.
                .filter(s => s.weight && s.type !== 'warmup')
                .map(s => convertWeight(s.weight, s.originalUnit || 'lbs', unit));
            const maxW = Math.max(...normalized, 0);
            if (maxW === 0) continue;
            if (!liftTrends[ex.name]) liftTrends[ex.name] = [];
            liftTrends[ex.name].push(maxW);
        }
    }

    // Show top 12 most-trained exercises with up to 8 recent max-weight points
    // each. Enough resolution for the coach to spot a plateau or steady climb
    // without overwhelming the prompt with every PR in history.
    const topLifts = Object.entries(liftTrends)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 12);

    if (topLifts.length > 0) {
        summary += `\nKey lift trends (max weight in ${unit}, recent sessions, newest first):\n`;
        topLifts.forEach(([name, weights]) => {
            const recent = weights.slice(0, 8);
            summary += `${name}: ${recent.join(' -> ')} ${unit}\n`;
        });
    }

    // Personal records — lets the coach anchor advice to all-time bests.
    const prBlock = buildPRContext(prList);
    if (prBlock) summary += `\n${prBlock}`;

    // Saved workouts — "plan my week" should adjust what exists, not reinvent.
    const templatesBlock = buildTemplatesContext(AppState.workoutPlans || []);
    if (templatesBlock) summary += `\n${templatesBlock}`;

    // Training frequency
    const avgDaysPerWeek = weeks > 0 ? (workouts.length / weeks).toFixed(1) : workouts.length;
    summary += `\nAvg training days/week: ${avgDaysPerWeek}\n`;
    summary += `Total workouts analyzed: ${workouts.length} over ${weeks} weeks\n`;

    // User preferences
    const goal = AppState.settings?.weeklyGoal || 5;
    summary += `\nUnit: ${unit} | Weekly goal: ${goal} days\n`;

    // Recent workout details — gives the coach actual sets/reps to ground
    // recommendations in, not just aggregates. Notes are included because
    // that's where struggles, pain, and form cues live. 30 workouts covers
    // ~6-8 weeks at typical training frequency, enough to spot real trends
    // without burning unbounded tokens on multi-year histories.
    const RECENT_DETAIL_CAP = 30;
    const recent = [...workouts]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, RECENT_DETAIL_CAP);
    if (recent.length > 0) {
        summary += `\nRecent workouts (most recent first):\n`;
        for (const w of recent) {
            const wName = w.workoutType || 'Workout';
            const loc = w.location || '';
            summary += `\n${w.date} · ${wName}${loc ? ` @ ${loc}` : ''}\n`;
            for (const ex of withResolvedNames(w)) {
                if (!ex.name) continue;
                const equip = ex.equipment ? ` [${ex.equipment}]` : '';
                const sets = (ex.sets || [])
                    .filter(s => s.completed !== false && (s.reps || s.weight))
                    .map(s => {
                        const wt = s.weight ? convertWeight(s.weight, s.originalUnit || unit, unit) : 0;
                        return `${s.reps || '?'}×${wt || 'BW'}${setTypeMarker(s)}`;
                    })
                    .join(', ');
                const notes = ex.notes ? ` — note: "${ex.notes}"` : '';
                summary += `  • ${ex.name}${equip}: ${sets || '(no sets)'}${notes}\n`;
            }
        }
    }

    // Equipment library — the coach can't recommend "use the Hammer Strength
    // chest press" if it doesn't know which machines exist at the user's gym.
    const equipment = AppState._cachedEquipment || [];
    if (equipment.length > 0) {
        summary += `\nAvailable equipment (${equipment.length} pieces):\n`;
        // Group by gym so the coach can suggest gym-specific routines.
        const byLocation = {};
        for (const eq of equipment) {
            const locs = (eq.locations && eq.locations.length > 0) ? eq.locations : ['Unspecified'];
            for (const loc of locs) {
                if (!byLocation[loc]) byLocation[loc] = [];
                byLocation[loc].push(`${eq.name}${eq.equipmentType ? ` (${eq.equipmentType})` : ''}`);
            }
        }
        for (const [loc, items] of Object.entries(byLocation)) {
            summary += `  @ ${loc}: ${items.slice(0, 40).join(', ')}${items.length > 40 ? `, …+${items.length - 40} more` : ''}\n`;
        }
    }

    // Body composition — weight/body-fat trend + full DEXA history with
    // scan-to-scan deltas and lean-mass imbalances. Built async (hits
    // Firestore) and passed in so this function stays synchronous.
    if (healthSummary) summary += healthSummary;

    return summary;
}

/**
 * Build a body-composition section for the coach: weight + body-fat trend from
 * tracked measurements (Withings/manual) plus full DEXA history with
 * scan-to-scan deltas and lean-mass asymmetry. Returns '' when no data.
 * Kept async + separate from buildTrainingContext because it reads Firestore.
 */
async function buildHealthSummary(unit) {
    let out = '';

    // --- Weight + body-fat trend (Withings scale / manual entries) ---
    try {
        const { loadBodyWeightHistory } = await import('./body-measurements.js');
        const hist = await loadBodyWeightHistory(365); // ascending by date, deduped
        if (hist.length > 0) {
            const toUnit = (e) => convertWeight(e.weight, e.unit || 'lbs', unit);
            const newest = hist[hist.length - 1];
            const wNow = toUnit(newest);
            out += `\nBody weight & composition (tracked, latest ${newest.date}): ${wNow} ${unit}`;
            if (newest.bodyFat != null) out += `, ${newest.bodyFat}% body fat`;
            if (newest.muscleMass != null) out += `, ${convertWeight(newest.muscleMass, 'kg', unit)} ${unit} muscle mass`;
            out += `\n`;

            // Change vs the earliest entry within each look-back window.
            // Guard the arithmetic: a malformed newest.date makes newestMs NaN
            // and then new Date(NaN).toISOString() throws RangeError, which
            // used to bubble up as an unhandled rejection and crash the whole
            // context build. Skip cleanly on invalid input.
            const newestMs = new Date(newest.date).getTime();
            const changeOver = (days) => {
                if (!Number.isFinite(newestMs)) return null;
                const cutoffMs = newestMs - days * 86400000;
                const cutoff = new Date(cutoffMs);
                if (!Number.isFinite(cutoff.getTime())) return null;
                const cutoffStr = cutoff.toISOString().slice(0, 10);
                const past = hist.find(e => e.date >= cutoffStr);
                return (!past || past.date === newest.date) ? null : { from: toUnit(past), date: past.date };
            };
            for (const days of [30, 90, 365]) {
                const past = changeOver(days);
                if (!past) continue;
                const diff = Math.round((wNow - past.from) * 10) / 10;
                out += `  ${days === 365 ? '1-yr' : days + '-day'} change: ${diff > 0 ? '+' : ''}${diff} ${unit} (from ${past.from} on ${past.date})\n`;
            }

            // Monthly trajectory (last reading per month, up to 12 months) so the
            // coach sees the shape of the cut/bulk, not just two endpoints.
            const byMonth = new Map();
            for (const e of hist) byMonth.set(e.date.slice(0, 7), e); // ascending → last wins
            const months = [...byMonth.entries()].slice(-12);
            if (months.length >= 3) {
                out += `  Monthly trend:\n`;
                for (const [ym, e] of months) {
                    out += `    ${ym}: ${toUnit(e)} ${unit}${e.bodyFat != null ? ` · ${e.bodyFat}% BF` : ''}\n`;
                }
            }
        }
    } catch (e) { debugLog('coach health: weight history failed', e); }

    // --- DEXA history (lean/fat/regional) ---
    try {
        const { loadDexaHistory, compareDexaScans, analyzeImbalances } = await import('./dexa-scan.js');
        const scans = await loadDexaHistory(50); // newest-first
        if (scans.length > 0) {
            out += `\nDEXA scans (${scans.length} total, newest first):\n`;
            for (const s of scans.slice(0, 5)) {
                const mu = s.massUnit || 'lbs';
                const parts = [];
                if (s.totalBodyFat != null) parts.push(`${s.totalBodyFat}% body fat`);
                if (s.totalLeanMass != null) parts.push(`${s.totalLeanMass} ${mu} lean`);
                if (s.totalFatMass != null) parts.push(`${s.totalFatMass} ${mu} fat`);
                if (s.totalWeight != null) parts.push(`${s.totalWeight} ${mu} total`);
                if (s.vat != null) parts.push(`VAT ${s.vat}`);
                if (s.rmr != null) parts.push(`RMR ${s.rmr} cal/day`);
                if (s.boneDensity?.tScore != null) parts.push(`bone T-score ${s.boneDensity.tScore}`);
                out += `  ${s.date}: ${parts.join(' · ')}\n`;
            }
            // Metabolic / fat-distribution markers from the most recent scan.
            const n = scans[0];
            const metab = [];
            if (n.agRatio != null) metab.push(`A/G ratio ${n.agRatio}${n.agRatio < 1 ? ' (healthy)' : ' (elevated)'}`);
            if (n.androidFatPct != null) metab.push(`android ${n.androidFatPct}%`);
            if (n.gynoidFatPct != null) metab.push(`gynoid ${n.gynoidFatPct}%`);
            if (n.totalBMC != null) metab.push(`bone mineral content ${n.totalBMC} ${n.massUnit || 'lbs'}`);
            if (n.vatVolume != null) metab.push(`VAT volume ${n.vatVolume} in³`);
            if (metab.length > 0) out += `  Latest metabolic/distribution: ${metab.join(' · ')}\n`;
            if (scans.length >= 2) {
                const d = compareDexaScans(scans[1], scans[0]); // (older, newer)
                if (d) {
                    const bits = [];
                    if (d.totalLeanMass != null) bits.push(`lean ${d.totalLeanMass > 0 ? '+' : ''}${d.totalLeanMass}`);
                    if (d.totalFatMass != null) bits.push(`fat ${d.totalFatMass > 0 ? '+' : ''}${d.totalFatMass}`);
                    if (d.totalBodyFat != null) bits.push(`body fat ${d.totalBodyFat > 0 ? '+' : ''}${d.totalBodyFat}%`);
                    if (bits.length) out += `  Since previous scan (${d.daysBetween} days): ${bits.join(' · ')}\n`;
                }
            }
            const imbalances = analyzeImbalances(scans[0]);
            if (imbalances.length > 0) {
                out += `  Lean-mass asymmetry (latest scan): `
                    + imbalances.map(i => `${i.region.toLowerCase()} — ${i.weaker.toLowerCase()} side ${i.percentDiff}% smaller (${i.severity})`).join('; ')
                    + `\n`;
            }
        }
    } catch (e) { debugLog('coach health: dexa failed', e); }

    return out;
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

// (formatCoachResponse moved to coach-markdown.js — pure, unit-tested, and
// extended with headers / numbered lists / inline code.)

// ===================================================================
// COACH HISTORY
// ===================================================================

// (saveCoachSession removed — the server writes coachHistory on both the
// streaming and callable paths; the client-side write was a duplicate.)

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
                <span>Past reviews</span>
            </div>
            ${sessions.map(s => `
                <div class="coach-history-item" onclick="showPastCoachSession('${escapeHtml(s.id)}')">
                    <div class="coach-history-question">${escapeHtml(truncate(s.question, 60))}</div>
                    <div class="coach-history-date">${formatRelativeDate(s.timestamp, { daysAgo: true })}</div>
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
        label.innerHTML = `<i class="fas fa-history"></i> From ${formatRelativeDate(session.timestamp, { daysAgo: true })}`;
        botBubble.insertBefore(label, botBubble.firstChild);
    }
}

// ===================================================================
// WORKOUT BUILDER
// ===================================================================

// Holds the generated template while user reviews it
let _pendingTemplate = null;

/**
 * Regenerate throws away the whole preview — including any exercises the user
 * removed or alternatives they swapped in — so confirm before discarding it.
 * Wired at the bottom of this file (not main.js) so the button template and
 * its handler can't version-skew apart under prod's year-long JS cache.
 */
export async function confirmRegenerateWorkout() {
    const { confirmSheet } = await import('../ui/confirm-sheet.js');
    const ok = await confirmSheet({
        title: 'Regenerate workout?',
        message: 'This replaces the preview below with a fresh one.',
        confirmLabel: 'Regenerate',
    });
    if (ok) showWorkoutBuilder();
}

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
                <input type="text" id="builder-custom-focus" class="coach-textarea" placeholder="Or type a custom focus… (e.g. Arms, Chest & Tris)">
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
            <span>Building your ${escapeHtml(focus)} workout…</span>
        </div>
    `);

    try {
        // Build exercise library context
        const exerciseLibrary = buildExerciseLibraryContext();
        // Pull full history so the generator can set weights from real
        // numbers, not stale 8-week-old ones.
        const { loadAllWorkouts } = await import('../data/data-manager.js');
        const allWorkouts = await loadAllWorkouts(AppState);
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
            loadingBubble.innerHTML = `<i class="fas fa-exclamation-circle text-muted coach-msg-icon"></i> Couldn't generate workout. ${escapeHtml(error.message || 'Try again.')}`;
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
                <button class="btn btn-secondary btn-small" onclick="confirmRegenerateWorkout()">
                    <i class="fas fa-redo"></i> Regenerate
                </button>
            </div>

            <div class="preview-exercise-list">
                ${exerciseCards}
            </div>

            <div class="preview-actions">
                <button class="btn btn-primary" onclick="saveGeneratedTemplate()">
                    <i class="fas fa-save"></i> Save as workout
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
    const botBubbles = wrap.querySelectorAll('.coach-msg--bot');
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

        const savedId = await wm.saveWorkoutTemplate(templateData);

        // Refresh workout plans in AppState
        const templates = await wm.getUserWorkoutTemplates();
        AppState.workoutPlans = templates;

        const exerciseCount = templateData.exercises.length;
        _pendingTemplate = null;

        showNotification(`"${templateData.name}" saved!`, 'success');

        // Stay in the coach and surface an action card so the user can jump
        // straight to the new template (matches PAGES-REDESIGN §8 spec).
        addChatBubble('bot', renderActionCard({
            templateId: savedId,
            name: templateData.name,
            category: templateData.category,
            exerciseCount,
            descLabel: 'Saved',
        }));

    } catch (error) {
        console.error('Error saving generated template:', error);
        showNotification("Couldn't save workout", 'error');
    }
}

/**
 * Render a coach action card (spec §8). Used when the bot completes an action
 * the user can drill into — e.g. template created/updated.
 */
function renderActionCard({ templateId, name, category, exerciseCount, descLabel }) {
    const iconClass = getCategoryIcon(category);
    const catKey = (category || 'other').toLowerCase();
    return `
        <div class="coach-action-card" onclick="openCoachTemplate('${escapeAttr(templateId)}')">
            <div class="coach-action-card__icon coach-action-card__icon--${catKey}"><i class="${iconClass}"></i></div>
            <div class="coach-action-card__body">
                <div class="coach-action-card__title">${escapeHtml(name)}</div>
                <div class="coach-action-card__desc">${escapeHtml(descLabel)} · ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}</div>
            </div>
            <i class="fas fa-chevron-right coach-action-card__chev"></i>
        </div>
    `;
}

/**
 * Open a template from a coach action card — closes the coach and routes to
 * the template editor in workout-management.
 */
export function openCoachTemplate(templateId) {
    if (!templateId) return;
    closeAICoach();
    // Wait for navigation transition so the template editor opens on top of
    // the returned-to section rather than racing the fade-out.
    setTimeout(() => {
        if (typeof window.editTemplate === 'function') {
            window.editTemplate(templateId, false);
        }
    }, 200);
}

// ===================================================================
// HELPERS
// ===================================================================

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

// Self-wire handlers referenced only from this module's own template strings,
// so template + handler ship together and can't version-skew under prod's
// year-long JS cache. (Most of this file's handlers are wired via main.js.)
window.confirmRegenerateWorkout = confirmRegenerateWorkout;

