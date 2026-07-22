/*
 * mappai-boilerplate-core.js — rilevamento intestazioni/piè di pagina ricorrenti
 * -------------------------------------------------------------------------
 * Le schede didattiche ripetono su ogni pagina un'intestazione/piè ("Storia IV
 * Media   La Guerra Fredda   pag. …"). Estratte in testo inquinano
 * l'evidenziazione/analisi di ELABORA e il corpus di GENERAZIONE.
 *
 * DUE modi di rilevamento (l'estrazione PDF di MappAI concatena TUTTA la pagina
 * in UNA riga — `items.map(i=>i.str).join(" ")+"\n"` — quindi l'header non è una
 * riga a sé, ma il PREFISSO di ogni riga-pagina):
 *   A) AFFISSO comune: prefisso/suffisso di parole ripetuto tra le righe lunghe
 *      (pagine) → è l'header/footer, rimosso da ogni pagina.
 *   B) RIGHE corte ripetute standalone (estrazioni che preservano le righe).
 * I numeri di pagina sono normalizzati ('pag. 3' ≡ 'pag. 4'). Deterministico.
 *
 * UMD: window.MappAIBoilerplate (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIBoilerplate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function _normWord(w) { return String(w).toLowerCase().replace(/\d+/g, '#'); }
    function _norm(line) {
        return String(line == null ? '' : line).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\d+/g, '#');
    }
    function _words(line) { return String(line || '').trim().split(/\s+/).filter(Boolean); }
    function _affixKey(words, n, side) {
        var slice = side === 'prefix' ? words.slice(0, n) : words.slice(words.length - n);
        return slice.map(_normWord).join(' ');
    }

    // Migliore affisso (prefisso o suffisso) ripetuto tra gli array di parole:
    // il PIÙ LUNGO (fino a maxLen parole) che ricorre ≥ minRepeats volte. Le
    // righe devono avere almeno margin parole di corpo oltre l'affisso (per non
    // divorare righe corte). → { n, key, count } | null.
    function _bestAffix(wordArrays, side, minRepeats, maxLen, margin) {
        for (var n = maxLen; n >= 3; n--) {
            var counts = {};
            for (var i = 0; i < wordArrays.length; i++) {
                var w = wordArrays[i];
                if (w.length < n + margin) continue;
                var k = _affixKey(w, n, side);
                counts[k] = (counts[k] || 0) + 1;
            }
            var bk = null, bc = 0;
            for (var key in counts) { if (counts[key] > bc) { bc = counts[key]; bk = key; } }
            if (bk && bc >= minRepeats) return { n: n, key: bk, count: bc };
        }
        return null;
    }

    // Righe "da boilerplate" standalone (modo B): corte, ripetute ≥ minRepeats.
    function findRepeatedLines(text, opts) {
        opts = opts || {};
        var minRepeats = opts.minRepeats || 3, maxWords = opts.maxWords || 14, minLen = opts.minLen || 3;
        var counts = {};
        String(text == null ? '' : text).split('\n').forEach(function (ln) {
            var t = ln.trim();
            if (t.length < minLen || _words(t).length > maxWords) return;
            var k = _norm(t);
            if (!k || k === '#') return;
            if (!counts[k]) counts[k] = { count: 0, sample: t };
            counts[k].count++;
        });
        var out = [];
        Object.keys(counts).forEach(function (k) { if (counts[k].count >= minRepeats) out.push({ key: k, count: counts[k].count, sample: counts[k].sample }); });
        out.sort(function (a, b) { return b.count - a.count; });
        return out;
    }

    // Rimuove header/footer dal testo (affisso comune + righe corte ripetute).
    // → { text, removed:[{type,sample,count}], count }
    function stripBoilerplate(text, opts) {
        opts = opts || {};
        var minRepeats = opts.minRepeats || 3, maxWords = opts.maxWords || 14, minLen = opts.minLen || 3;
        var maxAffix = opts.maxAffix || 12, longMin = opts.longMin || 12, margin = opts.affixMargin || 3;
        var lines = String(text == null ? '' : text).split('\n');
        var removed = [], count = 0;

        // ── A) affisso comune tra le righe lunghe (una-riga-per-pagina) ──────
        var wordArrays = lines.map(_words);
        var longIdx = [];
        wordArrays.forEach(function (w, i) { if (w.length >= longMin) longIdx.push(i); });
        if (longIdx.length >= minRepeats) {
            var longW = longIdx.map(function (i) { return wordArrays[i]; });
            var head = _bestAffix(longW, 'prefix', minRepeats, maxAffix, margin);
            var foot = _bestAffix(longW, 'suffix', minRepeats, maxAffix, margin);
            if (head || foot) {
                longIdx.forEach(function (i) {
                    var w = wordArrays[i], changed = false, sampleH = '', sampleF = '';
                    if (head && w.length > head.n + margin && _affixKey(w, head.n, 'prefix') === head.key) { sampleH = w.slice(0, head.n).join(' '); w = w.slice(head.n); changed = true; }
                    if (foot && w.length > foot.n + margin && _affixKey(w, foot.n, 'suffix') === foot.key) { sampleF = w.slice(w.length - foot.n).join(' '); w = w.slice(0, w.length - foot.n); changed = true; }
                    if (changed) { lines[i] = w.join(' '); count++; }
                });
                if (head) removed.push({ type: 'header', sample: longW.find(function (w) { return _affixKey(w, head.n, 'prefix') === head.key; }).slice(0, head.n).join(' '), count: head.count });
                if (foot) removed.push({ type: 'footer', sample: longW.find(function (w) { return _affixKey(w, foot.n, 'suffix') === foot.key; }).slice(-foot.n).join(' '), count: foot.count });
            }
        }

        // ── B) righe corte ripetute standalone ──────────────────────────────
        var reps = findRepeatedLines(lines.join('\n'), opts);
        if (reps.length) {
            var bad = {}; reps.forEach(function (r) { bad[r.key] = 1; removed.push({ type: 'line', sample: r.sample, count: r.count }); });
            var kept = [];
            lines.forEach(function (ln) {
                var t = ln.trim();
                if (t.length >= minLen && _words(t).length <= maxWords && bad[_norm(t)]) { count++; return; }
                kept.push(ln);
            });
            lines = kept;
        }

        return { text: lines.join('\n'), removed: removed, count: count };
    }

    return { findRepeatedLines: findRepeatedLines, stripBoilerplate: stripBoilerplate, _norm: _norm };
});
