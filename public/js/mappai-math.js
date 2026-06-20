/*
 * mappai-math.js — Utility matematiche PURE (Tier 1 extraction)
 * -------------------------------------------------------------
 * Estratte da app.js senza alterarne il comportamento.
 * Modulo UMD: browser (window.*) + Node (require) per i test.
 *
 * Caricare in index.html PRIMA di app.js. Vedi docs/rules/06-modules-and-extraction.md
 *
 * API: window.MappAIMath = { cosineSimilarity }
 * Alias globale: window.cosineSimilarity
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.MappAIMath = api;
        window.cosineSimilarity = api.cosineSimilarity;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na  += a[i] * a[i];
            nb  += b[i] * b[i];
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom > 0 ? dot / denom : 0;
    }

    return { cosineSimilarity };
});
