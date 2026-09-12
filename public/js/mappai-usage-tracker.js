'use strict';
/*
 * mappai-usage-tracker.js — tracker consumi AI lato renderer.
 * Espone window.MappAIUsage:
 *   - setContext(cat, sub): tagga il flusso corrente (chiamato dai moduli
 *     PRIMA di ogni fetchModelAPI; sticky finché non cambia)
 *   - current(): snapshot del contesto (fetchModelAPI lo cattura all'entrata)
 *   - record({provider, model, inTok, outTok, ctx?, cat?, sub?, project?,
 *             n?, stop?, tetto?, thoughts?}):
 *     scrive una riga nel registro su disco (IPC usage-log-append);
 *     fallback localStorage in browser (test/harness)
 *   - readAll(): tutti i record (disco o fallback)
 * I record NON contengono costi: si calcolano a display-time (dashboard).
 */
(function () {
    const LS_KEY = 'mappai_usage_log';
    const LS_CAP = 4000;

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    let _ctx = { cat: 'other', sub: 'misc' };

    function setContext(cat, sub) {
        _ctx = { cat: cat || 'other', sub: sub || 'misc' };
    }
    function current() {
        return { cat: _ctx.cat, sub: _ctx.sub };
    }

    function _project() {
        const st = _getAppState() || {};
        let label = st.rootNodeLabel;
        if (!label) {
            try {
                const root = ((st.db && st.db.nodes) || []).find(n => n.level === 0);
                label = root && root.label;
            } catch (e) { /* noop */ }
        }
        return {
            project: String(label || '').trim() || 'Senza titolo',
            projectId: (window.StorageManager && window.StorageManager.currentProjectId) || null
        };
    }

    function record(entry) {
        try {
            const e = entry || {};
            const inTok = Number(e.inTok) || 0;
            const outTok = Number(e.outTok) || 0;
            if (!inTok && !outTok) return; // risposta senza usage: niente riga
            const c = e.ctx || (e.cat ? { cat: e.cat, sub: e.sub } : _ctx);
            const p = _project();
            const rec = {
                ts: new Date().toISOString(),
                provider: e.provider === 'infomaniak' ? 'infomaniak' : 'google',
                model: String(e.model || '?'),
                inTok, outTok,
                cat: c.cat || 'other', sub: c.sub || 'misc',
                project: e.project || p.project,
                projectId: e.projectId != null ? e.projectId : p.projectId
            };
            /* I QUATTRO CAMPI DIAGNOSTICI (12/9) — vedi il commento in
               `fetchModelAPI`. Si scrivono solo quando dicono qualcosa:
               `n` e `thoughts` mancano dove non esistono (una chiamata senza
               array non chiede un numero di cose; senza pensiero i token di
               pensiero sono zero), e la loro ASSENZA è quindi un'informazione,
               non un buco. `stop` e `tetto` valgono per ogni chiamata vera.
               ⚠️ Chi legge il registro deve reggere le righe VECCHIE, che non
               hanno nessuno dei quattro: il file è append-only dal 24 luglio. */
            const stop = e.stop != null ? String(e.stop) : null;
            const tetto = Number(e.tetto) || 0;
            const thoughts = Number(e.thoughts) || 0;
            const n = Number(e.n) || 0;
            if (n) rec.n = n;
            if (thoughts) rec.thoughts = thoughts;
            if (stop) rec.stop = stop;
            if (tetto) rec.tetto = tetto;
            if (window.electronAPI && window.electronAPI.usageLogAppend) {
                window.electronAPI.usageLogAppend(rec); // fire-and-forget
                return;
            }
            // Fallback browser (harness/test): localStorage con cap FIFO
            const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
            arr.push(rec);
            while (arr.length > LS_CAP) arr.shift();
            localStorage.setItem(LS_KEY, JSON.stringify(arr));
        } catch (err) {
            console.warn('[usage] record fallito (non bloccante):', err);
        }
    }

    async function readAll() {
        if (window.electronAPI && window.electronAPI.usageLogRead) {
            try {
                const res = await window.electronAPI.usageLogRead();
                return (res && res.success && Array.isArray(res.records)) ? res.records : [];
            } catch (e) { return []; }
        }
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
        catch (e) { return []; }
    }

    window.MappAIUsage = { setContext, current, record, readAll };
})();
