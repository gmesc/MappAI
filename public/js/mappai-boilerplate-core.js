/*
 * mappai-boilerplate-core.js — rilevamento intestazioni/piè di pagina ricorrenti
 * -------------------------------------------------------------------------
 * Le schede didattiche ripetono su ogni pagina un'intestazione/piè ("Storia IV
 * Media · La Guerra Fredda · pag. 3"). Estratte in testo, quelle righe inquinano
 * l'evidenziazione/analisi di ELABORA e il corpus di GENERAZIONE della mappa.
 * Questo core PURO le rileva (righe corte, ripetute ≥ minRepeats, con i numeri
 * di pagina normalizzati) e le rimuove. Deterministico, zero AI, testato in Node.
 *
 * UMD: window.MappAIBoilerplate (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIBoilerplate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Chiave di confronto: spazi collassati, minuscolo, numeri → '#' (così
    // "pag. 3" e "pag. 4" collassano nella stessa intestazione).
    function _norm(line) {
        return String(line == null ? '' : line)
            .replace(/\s+/g, ' ').trim().toLowerCase()
            .replace(/\d+/g, '#');
    }
    function _words(line) { return String(line || '').trim().split(/\s+/).filter(Boolean).length; }

    // Righe "da boilerplate": corte (≤ maxWords), non vuote (≥ minLen), la cui
    // forma normalizzata ricorre ≥ minRepeats volte nel testo.
    function findRepeatedLines(text, opts) {
        opts = opts || {};
        var minRepeats = opts.minRepeats || 3;
        var maxWords = opts.maxWords || 14;
        var minLen = opts.minLen || 3;
        var counts = {};
        String(text == null ? '' : text).split('\n').forEach(function (ln) {
            var t = ln.trim();
            if (t.length < minLen || _words(t) > maxWords) return;
            var k = _norm(t);
            if (!k || k === '#') return;              // solo numeri → non è un'intestazione utile
            if (!counts[k]) counts[k] = { count: 0, sample: t };
            counts[k].count++;
        });
        var out = [];
        Object.keys(counts).forEach(function (k) {
            if (counts[k].count >= minRepeats) out.push({ key: k, count: counts[k].count, sample: counts[k].sample });
        });
        out.sort(function (a, b) { return b.count - a.count; });
        return out;
    }

    // Rimuove le righe boilerplate dal testo. → { text, removed:[{key,count,sample}], count }
    function stripBoilerplate(text, opts) {
        opts = opts || {};
        var minLen = opts.minLen || 3, maxWords = opts.maxWords || 14;
        var reps = findRepeatedLines(text, opts);
        if (!reps.length) return { text: String(text == null ? '' : text), removed: [], count: 0 };
        var bad = {};
        reps.forEach(function (r) { bad[r.key] = 1; });
        var kept = [], removed = 0;
        String(text == null ? '' : text).split('\n').forEach(function (ln) {
            var t = ln.trim();
            if (t.length >= minLen && _words(t) <= maxWords && bad[_norm(t)]) { removed++; return; }
            kept.push(ln);
        });
        return { text: kept.join('\n'), removed: reps, count: removed };
    }

    return { findRepeatedLines: findRepeatedLines, stripBoilerplate: stripBoilerplate, _norm: _norm };
});
