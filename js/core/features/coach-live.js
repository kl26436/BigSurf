// Live in-workout coach (Phase 6) — the coach under the bar.
//
// A bottom sheet over the active workout: sees the sets you just logged,
// answers in seconds (cheap fast model server-side), and returns PROPOSALS
// (next target / swap / add exercise / rest) that only change the workout
// when the user taps Apply. Design principle: pull, not push — the sheet
// exists only after the coach button is tapped, closing it stops the stream,
// and nothing mutates without a tap.
//
// The active workout is client-owned state; applies route through the SAME
// exported mutation paths the wizard uses (awInsertExercise/awSelectEquipment/
// savedData writes + debouncedSaveWorkoutData) — never a parallel write path.

import { AppState } from '../utils/app-state.js';
import { Config, debugLog } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr } from '../ui/ui-helpers.js';
import { formatCoachResponse } from './coach-markdown.js';
import { getEquipmentAtLocation } from './equipment-planner.js';
import { findBestMatch } from '../data/fuzzy-match.js';
import { debouncedSaveWorkoutData } from '../data/data-manager.js';
import {
    renderActiveWorkout,
    awInsertExercise,
    awSelectEquipment,
} from '../workout/workout-core.js';
import { micButtonHtml, ttsToggleHtml, speakCoachAnswer, stopSpeaking } from './coach-voice.js';

// Ephemeral per-session thread (never saved to coachHistory).
let _liveThread = [];
let _liveThreadSession = null;
let _liveAbort = null;
let _pendingProposals = new Map(); // proposalId → proposal
let _proposalSeq = 0;

// ===================================================================
// LIVE CONTEXT (~500 tokens — NOT the full training context)
// ===================================================================

/**
 * Compact snapshot of the workout in progress. Pure: state injected so tests
 * don't need the real AppState.
 */
export function buildLiveWorkoutContext({
    currentWorkout, savedData, globalUnit = 'lbs', equipment = [], elapsedMinutes = 0,
} = {}) {
    if (!currentWorkout || !savedData) return 'No workout in progress.';

    const lines = [];
    const loc = savedData.location;
    const gym = typeof loc === 'object' ? loc?.name : loc;
    lines.push(`Workout: ${savedData.workoutType || currentWorkout.name || 'Workout'} · ${elapsedMinutes} min elapsed${gym ? ` · at ${gym}` : ''}`);
    if (savedData.readiness?.score) {
        lines.push(`Readiness today: ${savedData.readiness.score}/5${savedData.readiness.note ? ` ("${savedData.readiness.note}")` : ''}`);
    }
    lines.push(`Unit: ${globalUnit}`);

    // Per-exercise state — done sets vs plan; the first incomplete is "current".
    const exercises = currentWorkout.exercises || [];
    let currentMarked = false;
    exercises.forEach((ex, idx) => {
        const name = ex.machine || ex.name || 'Exercise';
        const saved = savedData.exercises?.[`exercise_${idx}`] || {};
        const done = (saved.sets || []).filter(s => s.completed && (s.reps || s.weight));
        const doneStr = done.map(s => `${s.reps || '?'}×${s.weight || 'BW'}${s.type && s.type !== 'working' ? ` (${s.type})` : ''}`).join(', ');
        const planned = ex.sets || 3;
        const isCurrent = !currentMarked && done.length < planned && !saved.completed;
        if (isCurrent) currentMarked = true;
        const equip = saved.equipment || ex.equipment;
        lines.push(`${isCurrent ? '→ ' : ''}${name}${equip ? ` [${equip}]` : ''}: ${done.length}/${planned} sets${doneStr ? ` — ${doneStr}` : ''}${saved.notes ? ` — note: "${saved.notes}"` : ''}`);
    });

    // Equipment available at this gym (so swaps are grounded in reality).
    if (gym && equipment.length) {
        const here = getEquipmentAtLocation(equipment, gym).map(e => e.name).filter(Boolean);
        if (here.length) {
            lines.push(`Equipment at ${gym} (${here.length}): ${here.slice(0, 30).join(', ')}${here.length > 30 ? ', …' : ''}`);
        }
    }

    return lines.join('\n');
}

// Quick-prompt chips, computed from live state.
function quickChips() {
    const chips = ['What weight next?', "Machine's taken", 'Something hurts'];
    const elapsed = AppState.workoutStartTime
        ? Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 60000) : 0;
    if (elapsed >= 40) chips.push('Cut this short');
    return chips;
}

// ===================================================================
// SHEET
// ===================================================================

export function openLiveCoach() {
    if (!Config.LIVE_COACH_ENABLED) return;
    if (!AppState.currentWorkout || !AppState.savedData) {
        showNotification('Start a workout first', 'info');
        return;
    }
    // New workout → fresh ephemeral thread.
    if (_liveThreadSession !== AppState.savedData.startedAt) {
        _liveThread = [];
        _liveThreadSession = AppState.savedData.startedAt;
        _pendingProposals = new Map();
    }
    closeLiveCoachImmediate();

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'live-coach-backdrop';
    backdrop.onclick = closeLiveCoach;

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet live-coach';
    sheet.id = 'live-coach-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Coach');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header live-coach__header">
            <div>
                <div class="aw-sheet__title">Coach</div>
                <div class="aw-sheet__subtitle">Sees your session — answers in seconds</div>
            </div>
            ${ttsToggleHtml()}
        </div>
        <div class="aw-sheet__body live-coach__body" id="live-coach-messages">
            ${_liveThread.length === 0 ? '<div class="live-coach__hint">Ask about your next set, a swap, or anything mid-workout.</div>' : ''}
        </div>
        <div class="live-coach__chips">
            ${quickChips().map(c => `<button class="chip chip--sm" onclick="liveCoachChip('${escapeAttr(c)}')">${escapeHtml(c)}</button>`).join('')}
        </div>
        <div class="live-coach__inputbar">
            <input type="text" id="live-coach-input" class="field-input" placeholder="Ask your coach…" aria-label="Ask your coach"
                   onkeydown="if(event.key==='Enter'){liveCoachSend();}">
            ${micButtonHtml('live-coach-input')}
            <button class="live-coach__send" onclick="liveCoachSend()" aria-label="Send">
                <i class="fas fa-arrow-up"></i>
            </button>
        </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('visible'); sheet.classList.add('visible'); });

    // Re-render prior turns of this session's thread.
    for (const m of _liveThread) {
        if (m.role === 'user') addLiveBubble('user', escapeHtml(stripLiveContext(m.content)));
        else addLiveBubble('bot', formatCoachResponse(m.content));
    }

    maybeOfferReadiness();
}

// ===================================================================
// READINESS CHECK-IN — inline first message (moved from workout start)
// ===================================================================
// Formerly a bottom sheet that popped over EVERY template start. The score is
// only ever consumed here (buildLiveWorkoutContext) and in coach history, so
// it's asked where it's used: first coach open, once per session, skippable
// by simply ignoring it. Non-coach users never see it.

let _readinessOfferedFor = null;

function maybeOfferReadiness() {
    if (AppState.savedData?.readiness || _liveThread.length > 0) return;
    const session = AppState.savedData?.startedAt;
    if (!session || _readinessOfferedFor === session) return;
    _readinessOfferedFor = session;

    const wrap = document.getElementById('live-coach-messages');
    if (!wrap) return;
    document.querySelector('.live-coach__hint')?.remove();
    const bubble = document.createElement('div');
    bubble.className = 'coach-msg coach-msg--bot';
    bubble.id = 'live-readiness';
    bubble.innerHTML = `
        <div>How are you feeling today? One tap — I'll factor it into the load.</div>
        <div class="readiness-scale">
            ${[1, 2, 3, 4, 5].map(n =>
                `<button class="readiness-scale__btn" onclick="liveCoachReadiness(${n})" aria-label="Feeling ${n} of 5">${n}</button>`
            ).join('')}
        </div>
        <div class="readiness-scale__labels"><span>Wrecked</span><span>Great</span></div>
    `;
    wrap.appendChild(bubble);
}

export function liveCoachReadiness(score) {
    if (AppState.savedData) {
        // Additive field on the workout doc — persisted by the normal save
        // path, read back into buildLiveWorkoutContext on the first turn.
        AppState.savedData.readiness = { score };
        debouncedSaveWorkoutData(AppState);
    }
    // Score is saved on the tap; the note is a purely optional follow-up
    // (context/weekly review already read readiness.note when present).
    const bubble = document.getElementById('live-readiness');
    if (bubble) {
        bubble.innerHTML = `
            <div>Feeling ${score}/5 — noted.</div>
            <div class="readiness-note">
                <input type="text" id="live-readiness-note" class="field-input" placeholder="Add a note — optional"
                       maxlength="120" aria-label="Readiness note"
                       onkeydown="if(event.key==='Enter'){liveCoachReadinessNote();}">
                <button class="readiness-note__save" onclick="liveCoachReadinessNote()">Save</button>
            </div>`;
    }
}

export function liveCoachReadinessNote() {
    const note = (document.getElementById('live-readiness-note')?.value || '').trim();
    const bubble = document.getElementById('live-readiness');
    if (note && AppState.savedData?.readiness) {
        AppState.savedData.readiness.note = note;
        debouncedSaveWorkoutData(AppState);
    }
    if (bubble) {
        const score = AppState.savedData?.readiness?.score;
        bubble.innerHTML = `Feeling ${score ?? '–'}/5${note ? ` — "${escapeHtml(note)}"` : ' — noted.'}`;
    }
}

export function closeLiveCoach() {
    // Closing stops the stream — no "wait!". And the voice.
    stopSpeaking();
    try { _liveAbort?.abort(); } catch { /* already done */ }
    _liveAbort = null;
    const backdrop = document.getElementById('live-coach-backdrop');
    const sheet = document.getElementById('live-coach-sheet');
    backdrop?.classList.remove('visible');
    sheet?.classList.remove('visible');
    setTimeout(closeLiveCoachImmediate, 300);
}

function closeLiveCoachImmediate() {
    document.getElementById('live-coach-backdrop')?.remove();
    document.getElementById('live-coach-sheet')?.remove();
}

function stripLiveContext(content) {
    // First turn carries the live-state block; show only the question.
    const marker = '\nQuestion: ';
    const i = content.indexOf(marker);
    return i === -1 ? content : content.slice(i + marker.length);
}

function addLiveBubble(role, html) {
    const wrap = document.getElementById('live-coach-messages');
    if (!wrap) return null;
    document.querySelector('.live-coach__hint')?.remove();
    const bubble = document.createElement('div');
    bubble.className = `coach-msg coach-msg--${role}`;
    bubble.innerHTML = html;
    wrap.appendChild(bubble);
    wrap.scrollTop = wrap.scrollHeight;
    return bubble;
}

export function liveCoachChip(text) {
    const input = document.getElementById('live-coach-input');
    if (input) input.value = text;
    liveCoachSend();
}

export async function liveCoachSend() {
    const input = document.getElementById('live-coach-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    if (input) input.value = '';

    addLiveBubble('user', escapeHtml(text));
    const bubble = addLiveBubble('bot', `
        <div class="coach-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Thinking…</span>
        </div>
    `);

    // First turn carries the compact live state.
    const elapsedMinutes = AppState.workoutStartTime
        ? Math.floor((Date.now() - AppState.workoutStartTime.getTime()) / 60000) : 0;
    const userTurn = _liveThread.length === 0
        ? `Live workout state:\n${buildLiveWorkoutContext({
            currentWorkout: AppState.currentWorkout,
            savedData: AppState.savedData,
            globalUnit: AppState.globalUnit,
            equipment: AppState._cachedEquipment || [],
            elapsedMinutes,
        })}\n\nQuestion: ${text}`
        : text;
    _liveThread.push({ role: 'user', content: userTurn });

    // Watchdog: gyms are dead zones — if the stream goes silent for 15s,
    // abort into the normal error bubble instead of spinning forever.
    let lastEventAt = Date.now();
    let watchdog = null;

    try {
        const token = await AppState.currentUser?.getIdToken?.();
        if (!token) throw new Error('unauthenticated');
        _liveAbort = new AbortController();
        watchdog = setInterval(() => {
            if (Date.now() - lastEventAt > 15000) _liveAbort?.abort('timeout');
        }, 5000);

        const resp = await fetch(Config.COACH_STREAM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ mode: 'live', messages: _liveThread }),
            signal: _liveAbort.signal,
        });
        if (resp.status === 429) {
            _liveThread.pop();
            if (bubble) bubble.innerHTML = `<i class="fas fa-clock text-warning coach-msg-icon"></i> Daily live-coach limit reached — the full coach tab still works.`;
            return;
        }
        if (!resp.ok || !resp.body) throw new Error(`stream ${resp.status}`);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let acc = '';
        let finished = false;

        while (!finished) {
            const { value, done } = await reader.read();
            if (done) break;
            lastEventAt = Date.now();
            buffer += decoder.decode(value, { stream: true });
            let sep;
            while ((sep = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;
                let ev;
                try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

                if (ev.type === 'delta') {
                    acc += ev.text || '';
                    if (bubble) bubble.innerHTML = formatCoachResponse(acc);
                    const wrap = document.getElementById('live-coach-messages');
                    if (wrap) wrap.scrollTop = wrap.scrollHeight;
                } else if (ev.type === 'proposal' && ev.proposal) {
                    renderProposalCard(ev.proposal, bubble);
                } else if (ev.type === 'status' && bubble && !acc) {
                    bubble.innerHTML = `
                        <div class="coach-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>${escapeHtml(ev.text || 'Working…')}</span>
                        </div>`;
                } else if (ev.type === 'done') {
                    acc = ev.fullText || acc;
                    if (bubble) bubble.innerHTML = formatCoachResponse(acc || '…');
                    finished = true;
                } else if (ev.type === 'error') {
                    throw new Error(ev.message || 'stream error');
                }
            }
        }
        _liveThread.push({ role: 'assistant', content: acc });
        speakCoachAnswer(acc); // live mode TTS — no-op unless the toggle is on
    } catch (e) {
        _liveThread.pop();
        // Manual close (sheet dismissed) stays silent; a watchdog timeout or
        // network failure gets the honest bubble.
        const timedOut = _liveAbort?.signal?.reason === 'timeout';
        if (e?.name === 'AbortError' && !timedOut) return;
        debugLog('live coach failed:', e);
        if (bubble) bubble.innerHTML = `<i class="fas fa-exclamation-circle text-muted coach-msg-icon"></i> Couldn't reach the coach — try again.`;
    } finally {
        if (watchdog) clearInterval(watchdog);
        _liveAbort = null;
    }
}

// ===================================================================
// PROPOSALS — cards with Apply / Dismiss
// ===================================================================

const PROPOSAL_TITLES = {
    next_target: (p) => `Next set: ${[p.weight != null ? `${p.weight} ${AppState.globalUnit || 'lbs'}` : null, p.reps != null ? `${p.reps} reps` : null].filter(Boolean).join(' × ')} — ${p.exercise}`,
    swap: (p) => `Swap ${p.fromExercise} → ${p.toExercise}${p.equipment ? ` (${p.equipment})` : ''}`,
    add_exercise: (p) => `Add ${p.exercise} ${p.sets}×${p.reps}${p.weight != null ? ` @ ${p.weight}` : ''}`,
    rest: (p) => `Rest ${p.seconds}s before the next set`,
};

function renderProposalCard(proposal, streamingBubble) {
    const id = `prop_${++_proposalSeq}`;
    _pendingProposals.set(id, proposal);
    const title = (PROPOSAL_TITLES[proposal.kind] || (() => 'Suggestion'))(proposal);

    const wrap = document.getElementById('live-coach-messages');
    if (!wrap) return;
    const card = document.createElement('div');
    card.className = 'live-proposal';
    card.id = id;
    card.innerHTML = `
        <div class="live-proposal__title">${escapeHtml(title)}</div>
        ${proposal.why ? `<div class="live-proposal__why">${escapeHtml(proposal.why)}</div>` : ''}
        <div class="live-proposal__actions">
            <button class="live-proposal__apply" onclick="applyLiveProposal('${id}')">Apply</button>
            <button class="live-proposal__dismiss" onclick="dismissLiveProposal('${id}')">Dismiss</button>
        </div>
    `;
    wrap.appendChild(card);
    // Keep the in-progress answer as the last bubble.
    if (streamingBubble?.parentElement === wrap) wrap.appendChild(streamingBubble);
    wrap.scrollTop = wrap.scrollHeight;
}

// Dismissal is silent and final — remove the card, say nothing.
export function dismissLiveProposal(id) {
    _pendingProposals.delete(id);
    document.getElementById(id)?.remove();
}

export function applyLiveProposal(id) {
    const p = _pendingProposals.get(id);
    if (!p) return;
    let confirmMsg = null;
    try {
        if (p.kind === 'next_target') confirmMsg = applyNextTarget(p);
        else if (p.kind === 'swap') confirmMsg = applySwap(p);
        else if (p.kind === 'add_exercise') confirmMsg = applyAddExercise(p);
        else if (p.kind === 'rest') confirmMsg = applyRest(p);
    } catch (e) {
        console.error('❌ Apply proposal failed:', e);
    }
    if (!confirmMsg) {
        showNotification("Couldn't apply — do it manually", 'warning');
        return;
    }
    dismissLiveProposal(id);
    addLiveBubble('bot', `<i class="fas fa-check text-primary coach-msg-icon"></i> ${escapeHtml(confirmMsg)}`);
    debouncedSaveWorkoutData(AppState);
    renderActiveWorkout();
}

function findExerciseIdx(name) {
    const target = (name || '').trim().toLowerCase();
    const exercises = AppState.currentWorkout?.exercises || [];
    const exact = exercises.findIndex(e => (e.machine || e.name || '').toLowerCase() === target);
    if (exact !== -1) return exact;
    // The model phrases names its own way ("Barbell Bench Press" vs "Bench
    // Press") — fall back to the same fuzzy matcher machine-id uses so Apply
    // doesn't silently no-op over wording.
    const names = exercises.map(e => e.machine || e.name || '');
    const best = findBestMatch(name || '', names, 0.75);
    return best ? names.indexOf(best.match) : -1;
}

function applyNextTarget(p) {
    const idx = findExerciseIdx(p.exercise);
    if (idx === -1) return null;
    const key = `exercise_${idx}`;
    if (!AppState.savedData.exercises[key]) AppState.savedData.exercises[key] = { sets: [] };
    const saved = AppState.savedData.exercises[key];
    const planned = AppState.currentWorkout.exercises[idx].sets || 3;
    if (!saved.sets) saved.sets = [];
    // Target the first incomplete set slot.
    let slot = saved.sets.findIndex(s => !s?.completed);
    if (slot === -1) {
        // No incomplete slot materialized: target the next unlogged slot, or
        // — when every planned set is already logged — append an EXTRA set.
        // Never overwrite a completed set (that would silently un-log it).
        slot = saved.sets.length;
        if (slot >= planned) AppState.currentWorkout.exercises[idx].sets = slot + 1;
    }
    const existing = saved.sets[slot] || {};
    saved.sets[slot] = {
        ...existing,
        ...(p.weight != null ? { weight: p.weight, originalUnit: AppState.globalUnit || 'lbs' } : {}),
        ...(p.reps != null ? { reps: p.reps } : {}),
        completed: false,
    };
    return `Applied — ${p.exercise} next set: ${[p.weight != null ? `${p.weight} ${AppState.globalUnit || 'lbs'}` : null, p.reps != null ? `${p.reps} reps` : null].filter(Boolean).join(' × ')}.`;
}

function applySwap(p) {
    const idx = findExerciseIdx(p.fromExercise);
    if (idx === -1) return null;
    const key = `exercise_${idx}`;
    const saved = AppState.savedData.exercises?.[key];
    const hasCompletedSets = (saved?.sets || []).some(s => s?.completed);

    if (hasCompletedSets) {
        // Work already logged on the old exercise — keep it (history integrity)
        // and add the replacement after it.
        awInsertExercise(p.toExercise);
        const newIdx = AppState.currentWorkout.exercises.length - 1;
        if (p.equipment) awSelectEquipment(newIdx, p.equipment);
        return `Added ${p.toExercise} — ${p.fromExercise}'s logged sets stay.`;
    }

    // Nothing logged → swap in place.
    const ex = AppState.currentWorkout.exercises[idx];
    if (ex.machine) ex.machine = p.toExercise; else ex.name = p.toExercise;
    ex.equipment = p.equipment || null;
    ex.equipmentId = null; // stale id must not survive a swap
    if (saved) { saved.equipment = p.equipment || null; saved.equipmentId = null; }
    if (p.equipment) awSelectEquipment(idx, p.equipment);
    return `Swapped to ${p.toExercise}.`;
}

function applyAddExercise(p) {
    awInsertExercise(p.exercise);
    const idx = AppState.currentWorkout.exercises.length - 1;
    const ex = AppState.currentWorkout.exercises[idx];
    if (p.sets) ex.sets = p.sets;
    if (p.reps) ex.defaultReps = p.reps;
    if (p.weight != null) {
        const key = `exercise_${idx}`;
        if (!AppState.savedData.exercises[key]) AppState.savedData.exercises[key] = { sets: [] };
        AppState.savedData.exercises[key].sets[0] = {
            weight: p.weight, reps: p.reps || null,
            originalUnit: AppState.globalUnit || 'lbs', completed: false,
        };
    }
    return `Added ${p.exercise} ${p.sets}×${p.reps}.`;
}

function applyRest(p) {
    // One-shot override consumed by the next rest-timer start.
    AppState._nextRestOverride = p.seconds;
    return `Next rest set to ${p.seconds}s.`;
}

// Self-wire handlers rendered from this module's own template strings.
// (openLiveCoach renders in active-workout-ui's header → wired via main.js.)
if (typeof window !== 'undefined') {
    window.liveCoachSend = liveCoachSend;
    window.liveCoachChip = liveCoachChip;
    window.liveCoachReadiness = liveCoachReadiness;
    window.liveCoachReadinessNote = liveCoachReadinessNote;
    window.applyLiveProposal = applyLiveProposal;
    window.dismissLiveProposal = dismissLiveProposal;
    window.closeLiveCoach = closeLiveCoach;
}
