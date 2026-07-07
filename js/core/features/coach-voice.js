// Coach voice (Phase 10) — dictation in, optional speech out.
//
// Web Speech API prototype per the plan: a mic button on the coach and
// live-coach inputs (hands are chalky, typing mid-set is misery), and a
// "read answers aloud" toggle for live mode. Feature-detected — no mic
// button renders on browsers without SpeechRecognition. If this earns usage,
// the upgrade path is Capacitor-native speech plugins for noisy gyms.

import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';
import { showNotification } from '../ui/ui-helpers.js';

const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

export function dictationSupported() {
    return !!SR;
}

let _recognition = null;
let _activeBtn = null;

/**
 * Toggle dictation into the input with the given id. The mic button gets
 * .listening while active; final results append to the input's value.
 */
export function toggleCoachDictation(inputId, btn) {
    if (!SR) return;
    if (_recognition) { stopDictation(); return; }

    const input = document.getElementById(inputId);
    if (!input) return;

    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;

    const baseText = input.value ? `${input.value.trim()} ` : '';
    rec.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        input.value = baseText + transcript;
    };
    rec.onerror = (e) => {
        debugLog('dictation error:', e.error);
        if (e.error === 'not-allowed') showNotification('Allow microphone access to dictate', 'warning');
        stopDictation();
    };
    rec.onend = () => {
        // onend fires after final results (or silence) — leave the text in
        // the input for review; sending stays a deliberate tap.
        stopDictation();
        input.focus();
    };

    _recognition = rec;
    _activeBtn = btn || null;
    _activeBtn?.classList.add('listening');
    try { rec.start(); } catch (e) { debugLog('dictation start failed:', e); stopDictation(); }
}

function stopDictation() {
    try { _recognition?.stop(); } catch { /* already stopped */ }
    _recognition = null;
    _activeBtn?.classList.remove('listening');
    _activeBtn = null;
}

/** Mic button markup — empty string when unsupported (feature-detect). */
export function micButtonHtml(inputId, extraClass = '') {
    if (!SR) return '';
    return `
        <button class="coach-mic ${extraClass}" onclick="toggleCoachDictation('${inputId}', this)" aria-label="Dictate">
            <i class="fas fa-microphone"></i>
        </button>
    `;
}

// ── Speech out (live mode: "read answers aloud") ────────────────────

export function ttsSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function ttsEnabled() {
    return !!AppState.settings?.liveCoachTts;
}

/**
 * Read a coach answer aloud (live mode only, behind the toggle). Strips
 * markdown-ish syntax so headers/bullets don't get spoken as symbols.
 */
export function speakCoachAnswer(text) {
    if (!ttsSupported() || !ttsEnabled() || !text) return;
    try {
        window.speechSynthesis.cancel(); // one answer at a time
        const clean = text
            .replace(/[#*_`]/g, '')
            .replace(/^\s*[-•]\s*/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return;
        const utterance = new window.SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        debugLog('tts failed:', e);
    }
}

export function stopSpeaking() {
    if (ttsSupported()) window.speechSynthesis.cancel();
}

/** The live-sheet TTS toggle button (hidden when unsupported). */
export function ttsToggleHtml() {
    if (!ttsSupported()) return '';
    return `
        <button class="coach-tts-toggle ${ttsEnabled() ? 'on' : ''}" onclick="toggleLiveCoachTts(this)"
                aria-label="Read answers aloud" title="Read answers aloud">
            <i class="fas fa-volume-up"></i>
        </button>
    `;
}

export function toggleLiveCoachTts(btn) {
    const next = !ttsEnabled();
    btn?.classList.toggle('on', next);
    if (!next) stopSpeaking();
    import('../ui/settings-ui.js')
        .then(m => m.updateSetting('liveCoachTts', next))
        .catch(() => { /* setting persists next session at worst */ });
}

// Self-wire — these handlers render from voice/live template strings.
if (typeof window !== 'undefined') {
    window.toggleCoachDictation = toggleCoachDictation;
    window.toggleLiveCoachTts = toggleLiveCoachTts;
}
