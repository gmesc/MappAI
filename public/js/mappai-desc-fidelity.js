// ══════════════════════════════════════════════════════════════════════════
// MappAI — Desc Fidelity (groundedness deterministica, zero AI calls)
// ══════════════════════════════════════════════════════════════════════════
//
// Misura quanto le 'desc' dei nodi sono ANCORATE alla fonte: frazione delle
// parole-contenuto della desc presenti nel corpus sorgente (match esatto o
// per radice a 6 caratteri, per coprire le flessioni italiane:
// "occupazione" ↔ "occupare"). Nata dal bug "desc romanzate" (5 lug 2026):
// il modello scriveva metafore e motivazioni non presenti nella fonte
// ("come un funambolo", "terrore che Hitler...").
//
// È un'euristica: punteggi bassi = desc probabilmente inventata/drammatizzata;
// non certifica la correttezza di quelle alte. Consumatori:
//  - dev-console-metrics.js → riga "groundedness" in MappAIMetrics.report()
//  - enrichThinDescs (app.js) → riscrive anche le desc poco ancorate
//
// UMD puro (nessuna dipendenza da appState nel core) → testabile in Node:
// tests/desc-fidelity.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIDescFidelity = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Lunghezza radice per il match di flessioni ("occupa-" copre
    // occupare/occupazione/occupata). Sotto i 6 char troppi falsi positivi.
    const STEM_LEN = 6;

    // Soglia sotto cui una desc è considerata "poco ancorata" alla fonte.
    const DEFAULT_THRESHOLD = 0.45;

    // Solo parole >= 4 lettere arrivano qui (le più corte sono già scartate),
    // quindi bastano le funzionali lunghe più comuni IT+EN.
    const STOPWORDS = new Set([
        // IT — preposizioni articolate, dimostrativi, avverbi comuni
        'della', 'delle', 'dello', 'degli', 'alla', 'alle', 'agli', 'allo',
        'dalla', 'dalle', 'dagli', 'dallo', 'nella', 'nelle', 'negli', 'nello',
        'sulla', 'sulle', 'sugli', 'sullo', 'questo', 'questa', 'questi', 'queste',
        'quello', 'quella', 'quelli', 'quelle', 'come', 'dove', 'quando', 'perche',
        'anche', 'ancora', 'dopo', 'prima', 'senza', 'sopra', 'sotto', 'verso',
        'ogni', 'tutto', 'tutta', 'tutti', 'tutte', 'altro', 'altra', 'altri',
        'altre', 'loro', 'suoi', 'essa', 'esso', 'essi', 'esse', 'quindi',
        'inoltre', 'infatti', 'invece', 'mentre', 'durante', 'tramite', 'attraverso',
        // IT — ausiliari e verbi funzionali frequenti
        'sono', 'erano', 'essere', 'stato', 'stata', 'stati', 'state',
        'avere', 'aveva', 'hanno', 'viene', 'veniva', 'vengono', 'venne',
        'fare', 'fatto', 'fatta', 'puo', 'sono', 'sara', 'furono',
        // EN
        'that', 'this', 'these', 'those', 'with', 'from', 'were', 'been',
        'have', 'their', 'which', 'would', 'could', 'should', 'about',
        'after', 'before', 'also', 'only', 'other', 'every', 'some',
        'there', 'where', 'when', 'while', 'through', 'because', 'being'
    ]);

    function _normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // à→a, é→e
            .replace(/[’´`]/g, "'");
    }

    // Parole-contenuto: >= 4 lettere non-stopword, oppure numeri (>= 2 cifre).
    function contentWords(text) {
        return _normalize(text)
            .split(/[^a-z0-9]+/)
            .filter(w => w
                && !STOPWORDS.has(w)
                && (/\d/.test(w) ? w.length >= 2 : w.length >= 4));
    }

    // Indice riusabile del corpus (parole esatte + radici). Passarlo a
    // groundedness() quando si valutano molti nodi sullo stesso corpus.
    function buildSourceIndex(sourceText) {
        const words = new Set();
        const stems = new Set();
        for (const w of contentWords(sourceText)) {
            words.add(w);
            if (w.length >= STEM_LEN) stems.add(w.slice(0, STEM_LEN));
        }
        return { words, stems };
    }

    // → 0..1, oppure null se la desc non ha parole-contenuto.
    function groundedness(desc, sourceIndexOrText) {
        const idx = (sourceIndexOrText && sourceIndexOrText.words instanceof Set)
            ? sourceIndexOrText
            : buildSourceIndex(sourceIndexOrText);
        const ws = contentWords(desc);
        if (!ws.length) return null;
        let hit = 0;
        for (const w of ws) {
            if (idx.words.has(w)) { hit++; continue; }
            if (w.length >= STEM_LEN && idx.stems.has(w.slice(0, STEM_LEN))) hit++;
        }
        return hit / ws.length;
    }

    // Analizza tutti i nodi (level >= 1) contro un corpus sorgente.
    // Ritorna null se il corpus è troppo piccolo per una metrica sensata.
    function analyzeNodes(nodes, sourceText, opts) {
        const threshold = (opts && opts.threshold) || DEFAULT_THRESHOLD;
        const idx = buildSourceIndex(sourceText);
        if (idx.words.size < 30) return null;
        const rows = [];
        for (const n of nodes || []) {
            if (!n || (n.level == null ? 0 : n.level) < 1) continue;
            const score = groundedness(n.desc, idx);
            if (score === null) continue;
            rows.push({ id: n.id, label: n.label, level: n.level, score: Number(score.toFixed(3)) });
        }
        if (!rows.length) return null;
        const sorted = rows.slice().sort((a, b) => a.score - b.score);
        const avg = rows.reduce((a, r) => a + r.score, 0) / rows.length;
        return {
            avg: Number(avg.toFixed(3)),
            count: rows.length,
            threshold,
            below: sorted.filter(r => r.score < threshold).length,
            worst: sorted.slice(0, 5),
            rows
        };
    }

    // ── Integrazione app (facoltativa: il core resta puro) ──────────────────
    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : (typeof window !== 'undefined' ? window.appState : null); }
        catch (e) { return (typeof window !== 'undefined' ? window.appState : null); }
    }

    // Corpus dallo stato app: fonti caricate + sourcesDict + chunks verbatim.
    // sourcesDict/chunks coprono i vault riaperti, dove sources è vuoto.
    function corpusFromState(state) {
        const parts = [];
        ((state && state.sources) || []).forEach(s => { if (s && s.content) parts.push(s.content); });
        const sd = (state && state.db && state.db.sourcesDict) || {};
        Object.keys(sd).forEach(k => (sd[k] || []).forEach(e => { if (e && e.text) parts.push(e.text); }));
        (((state && state.db) || {}).nodes || []).forEach(n => (n.chunks || []).forEach(c => { if (c) parts.push(c); }));
        return parts.join('\n');
    }

    function analyzeCurrentMap(opts) {
        const state = _getAppState();
        if (!state || !state.db || !Array.isArray(state.db.nodes)) return null;
        return analyzeNodes(state.db.nodes, corpusFromState(state), opts);
    }

    return {
        STEM_LEN,
        DEFAULT_THRESHOLD,
        contentWords,
        buildSourceIndex,
        groundedness,
        analyzeNodes,
        corpusFromState,
        analyzeCurrentMap
    };
}));
