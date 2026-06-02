/**
 * mappai-latex.js
 * Rendering LaTeX/KaTeX e supporto formule STEM per MappAI
 * Dipende da: KaTeX (CDN), app.js (window.openSourceModal)
 */

// ── Configurazione KaTeX ─────────────────────────────────
const KATEX_OPTIONS = {
    delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
    ],
    throwOnError: false,
    errorColor: '#cc0000',
    strict: false
};

/**
 * Renderizza formule LaTeX in un elemento DOM.
 * Chiamata dopo ogni iniezione di contenuto nel source-modal.
 */
window.renderLatexInElement = function(element) {
    if (!element) return;
    if (typeof renderMathInElement === 'undefined') {
        console.warn('[LaTeX] KaTeX auto-render non disponibile');
        return;
    }
    try {
        renderMathInElement(element, KATEX_OPTIONS);
    } catch(e) {
        console.warn('[LaTeX] Errore rendering:', e);
    }
};

/**
 * Renderizza una singola formula e restituisce l'HTML.
 * @param {string} formula - Testo LaTeX senza delimitatori
 * @param {boolean} display - true = blocco, false = inline
 */
window.renderLatexFormula = function(formula, display = false) {
    if (typeof katex === 'undefined') return formula;
    try {
        return katex.renderToString(formula, {
            displayMode: display,
            throwOnError: false,
            strict: false
        });
    } catch(e) {
        return `<span class="latex-error" title="${e.message}">${formula}</span>`;
    }
};

/**
 * Rileva se un testo contiene formule LaTeX.
 */
window.hasLatexContent = function(text) {
    if (!text) return false;
    return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/.test(text);
};

/**
 * Patch di window.openSourceModal:
 * Dopo ogni apertura del modale, esegue il rendering KaTeX
 * sul contenuto iniettato in #source-modal-body.
 * Usa MutationObserver per intercettare l'iniezione asincrona.
 */
(function patchSourceModalForLatex() {
    const targetId = 'source-modal-body';
    let observer = null;

    function startObserving() {
        const target = document.getElementById(targetId);
        if (!target) return;

        observer = new MutationObserver(function(mutations) {
            const hasContent = mutations.some(
                function(m) { return m.addedNodes.length > 0; }
            );
            if (hasContent) {
                // Piccolo delay per permettere il completamento
                // dell'iniezione HTML
                setTimeout(function() {
                    window.renderLatexInElement(target);
                }, 50);
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true
        });
    }

    // Attende che il DOM sia pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }
})();

/**
 * Aggiunge stili CSS per le formule renderizzate da KaTeX.
 */
(function addLatexStyles() {
    const style = document.createElement('style');
    style.textContent = [
        '/* KaTeX display mode */',
        '.katex-display { margin: 12px 0; overflow-x: auto; overflow-y: hidden; }',
        '/* KaTeX inline */',
        '.katex { font-size: 1.05em; }',
        '/* Errore LaTeX */',
        '.latex-error { color: #cc0000; font-family: monospace; font-size: 0.9em; background: #fff0f0; padding: 2px 4px; border-radius: 3px; }',
        '/* Blocco formula in dossier PDF */',
        '.formula-block { background: #f8fafc; border-left: 3px solid #6366f1; border-radius: 6px; padding: 12px 16px; margin: 8px 0; overflow-x: auto; }',
        '/* Formula inline nel testo */',
        '.formula-inline { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; }'
    ].join('\n');
    document.head.appendChild(style);
})();

console.log('[MappAI] mappai-latex.js caricato \u2713');
