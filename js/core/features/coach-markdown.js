// Coach response markdown → HTML — pure, dependency-free.
//
// The coach's answers arrive as light markdown. This is deliberately NOT a
// full markdown parser: it handles exactly what the model emits (bold,
// bullets, numbered lists, ###/## headers, inline code) and nothing else.
// The model routinely echoes user-stored strings verbatim (workout names,
// notes, memory facts), so raw text is HTML-escaped BEFORE the markdown
// passes — the only tags in the output are the ones this function emits.

/**
 * @param {string} text - raw model text
 * @returns {string} HTML for a chat bubble
 */
export function formatCoachResponse(text) {
    if (!text) return '';

    let html = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Inline code first, so later passes don't chew on backtick contents.
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Headers — the model uses ###/## for section breaks; render small
        // (styled in ai-coach.css), # folded into h3 (rare, same weight).
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^##? (.+)$/gm, '<h3>$1</h3>');

    // Numbered lists → <ol>. Items keep a sentinel attr until the very end so
    // the <ul> pass below can't re-wrap them; newlines inside a wrapped list
    // are dropped so the later \n→<br> pass doesn't litter list interiors.
    html = html.replace(/^\d+[.)] (.+)$/gm, '<li data-n>$1</li>');
    html = html.replace(/(<li data-n>.*<\/li>\n?)+/g,
        (m) => `<ol>${m.replace(/\n/g, '')}</ol>\n`);

    // Bullets → <ul>
    html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>\n`);

    // Sentinel off — safe now that both wrap passes have run.
    html = html.replace(/ data-n/g, '');

    // Paragraphs + line breaks (same behavior the coach always had).
    html = html
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.+)/, '<p>$1</p>');

    // Tidy the worst seam artifacts: no <br> or empty <p> hugging a block.
    html = html
        .replace(/<br>(<\/?(?:h3|h4|ul|ol)>)/g, '$1')
        .replace(/(<\/?(?:h3|h4|ul|ol)>)<br>/g, '$1')
        .replace(/<p><\/p>/g, '');

    return html;
}
