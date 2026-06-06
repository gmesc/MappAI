// mappai-undo.js
// Stack undo leggero per operazioni distruttive (elimina nodo, elimina link,
// fondi nodi, cambia link). Max 10 snapshot. Ctrl/Cmd+Z globale.
// Usa pushUndoSnapshot('label') PRIMA di ogni operazione distruttiva.

(function () {
    'use strict';

    const MAX_UNDO = 10;

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    // Stack condiviso — accessibile da console per debug
    window.undoStack = [];

    // Chiamata PRIMA di ogni operazione distruttiva.
    // label: stringa breve che descrive l'azione (es. "Elimina Nodo: Economia")
    window.pushUndoSnapshot = function (label) {
        const state = _getAppState();
        if (!state || !state.db) return;
        try {
            const snapshot = {
                label: label || 'Azione',
                nodes: JSON.parse(JSON.stringify(state.db.nodes || [])),
                links: JSON.parse(JSON.stringify(state.db.links.map(l => ({
                    source: typeof l.source === 'object' ? l.source.id : l.source,
                    target: typeof l.target === 'object' ? l.target.id : l.target,
                    rel: l.rel,
                    isCross: l.isCross,
                    bidirectional: l.bidirectional
                })))),
                sourcesDict: JSON.parse(JSON.stringify(state.db.sourcesDict || {})),
                customColors: JSON.parse(JSON.stringify(state.db.customColors || {}))
            };
            window.undoStack.push(snapshot);
            if (window.undoStack.length > MAX_UNDO) window.undoStack.shift();
            _updateUndoUI();
        } catch (e) {
            console.warn('[Undo] Snapshot fallito:', e.message);
        }
    };

    // Ripristina l'ultimo snapshot e ri-renderizza.
    window.undoLastAction = function () {
        if (window.undoStack.length === 0) {
            if (typeof window.showToast === 'function') window.showToast('Nulla da annullare', 'info');
            return;
        }
        const snapshot = window.undoStack.pop();
        const state = _getAppState();
        if (!state || !state.db) return;
        state.db.nodes = snapshot.nodes;
        state.db.links = snapshot.links;
        state.db.sourcesDict = snapshot.sourcesDict;
        state.db.customColors = snapshot.customColors;
        // renderGraph è definita in app.js come var locale — accesso diretto
        try {
            if (typeof renderGraph === 'function') renderGraph();
            else if (typeof window.renderGraph === 'function') window.renderGraph();
        } catch (e) {
            console.warn('[Undo] renderGraph fallito:', e.message);
        }
        if (typeof window.updateDegreeStats === 'function') window.updateDegreeStats();
        _updateUndoUI();
        if (typeof window.showToast === 'function') window.showToast('Annullato: ' + snapshot.label, 'success');
    };

    // Aggiorna lo stato visivo del bottone #undo-action-btn
    function _updateUndoUI() {
        const btn = document.getElementById('undo-action-btn');
        if (!btn) return;
        const n = window.undoStack.length;
        btn.disabled = n === 0;
        btn.style.opacity = n === 0 ? '0.4' : '1';
        const countEl = btn.querySelector('.undo-count');
        if (countEl) countEl.textContent = n > 0 ? ' (' + n + ')' : '';
        const top = n > 0 ? window.undoStack[n - 1].label : '';
        btn.title = n > 0 ? 'Annulla: ' + top : 'Nulla da annullare';
    }

    // Esponi per l'aggiornamento UI da altri moduli
    window.updateUndoButton = _updateUndoUI;

    // Ctrl+Z / Cmd+Z globale (non intercetta quando focus è in input/textarea)
    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return;
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        window.undoLastAction();
    });

})();
