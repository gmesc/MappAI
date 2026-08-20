/*
 * mappai-active-study-core.js — Helper PURI per lo Studio Attivo
 * ---------------------------------------------------------------
 * Funzioni di misurazione e matching estratte in modulo UMD per essere
 * testabili in Node (`npm test`) e riusabili da altri moduli (study-session,
 * Memory Dungeon). Nessuna dipendenza da appState/DOM.
 *
 * API: window.MappAIActiveStudyCore = { normalizeText, levenshtein, similarity,
 *      labelMatches, wordTokens, jaccardWords, lcsLength, sequenceScore,
 *      answerMatches, rateFromSeconds }
 *
 * Caricare in index.html PRIMA di mappai-active-study.js e mappai-study-session.js.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.MappAIActiveStudyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Stopword minime italiane: bastano a non far dominare gli articoli nel Jaccard.
    const STOPWORDS = new Set(['che', 'per', 'con', 'del', 'della', 'delle', 'dei', 'degli',
        'una', 'uno', 'gli', 'le', 'la', 'il', 'lo', 'di', 'da', 'in', 'su', 'non',
        'più', 'come', 'sono', 'alla', 'allo', 'ai', 'agli', 'nel', 'nella', 'tra', 'fra',
        'the', 'and', 'for', 'with', 'of', 'to', 'a', 'an', 'is', 'are']);

    // lowercase + senza diacritici + solo lettere/numeri/spazi + spazi collassati.
    function normalizeText(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function levenshtein(a, b) {
        a = String(a || ''); b = String(b || '');
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        let prev = new Array(b.length + 1);
        let cur = new Array(b.length + 1);
        for (let j = 0; j <= b.length; j++) prev[j] = j;
        for (let i = 1; i <= a.length; i++) {
            cur[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            }
            const tmp = prev; prev = cur; cur = tmp;
        }
        return prev[b.length];
    }

    // Similarità 0..1 su testo normalizzato (1 = identici).
    function similarity(a, b) {
        const na = normalizeText(a), nb = normalizeText(b);
        const maxLen = Math.max(na.length, nb.length);
        if (!maxLen) return 1;
        return 1 - levenshtein(na, nb) / maxLen;
    }

    // Richiamo digitato (mode 3 "scrivi tu"): tollera refusi ma non risposte diverse.
    function labelMatches(typed, correct, threshold) {
        const thr = (threshold == null) ? 0.75 : threshold;
        return similarity(typed, correct) >= thr;
    }

    function wordTokens(s) {
        return normalizeText(s).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w));
    }

    function jaccardWords(a, b) {
        const A = new Set(wordTokens(a)), B = new Set(wordTokens(b));
        if (!A.size && !B.size) return 1;
        if (!A.size || !B.size) return 0;
        let inter = 0;
        A.forEach(w => { if (B.has(w)) inter++; });
        return inter / (A.size + B.size - inter);
    }

    function lcsLength(a, b) {
        const n = a.length, m = b.length;
        if (!n || !m) return 0;
        let prev = new Array(m + 1).fill(0);
        let cur = new Array(m + 1).fill(0);
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                cur[j] = (a[i - 1] === b[j - 1]) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
            }
            const tmp = prev; prev = cur; cur = tmp; cur.fill(0);
        }
        return prev[m];
    }

    // Credito parziale per il modo 7: una sequenza shiftata di 1 non vale 0.
    // score = elementi in ordine relativo corretto (LCS) - 1 (la testa è data).
    function sequenceScore(studentOrder, originalOrder) {
        const n = originalOrder.length;
        const total = Math.max(n - 1, 1);
        if (!studentOrder || !studentOrder.length) return { score: 0, total, accuracy: 0 };
        const lcs = lcsLength(studentOrder, originalOrder);
        const score = Math.max(lcs - 1, 0);
        return { score, total, accuracy: Math.round(100 * score / total) };
    }

    // Match risposta quiz: uguaglianza normalizzata, oppure contenimento SOLO se
    // le lunghezze sono comparabili ("roma" NON matcha "romania": ratio 4/7 < 0.7).
    function answerMatches(selected, correct) {
        const ns = normalizeText(selected), nc = normalizeText(correct);
        if (!ns || !nc) return false;
        if (ns === nc) return true;
        if (ns.length >= 4 && nc.length >= 4 && (ns.includes(nc) || nc.includes(ns))) {
            return Math.min(ns.length, nc.length) / Math.max(ns.length, nc.length) >= 0.7;
        }
        return false;
    }

    // mode 5: indice del ramo lessicalmente PIÙ DISTANTE dal testo della foglia

    // Fluenza per-item: da secondi impiegati a item/min, cap 30 (anti-click istantaneo).
    function rateFromSeconds(sec) {
        const s = Number(sec);
        if (!isFinite(s) || s <= 0) return null;
        return Math.round(Math.min(60 / s, 30) * 10) / 10;
    }

    return { normalizeText, levenshtein, similarity, labelMatches, wordTokens,
        jaccardWords, lcsLength, sequenceScore, answerMatches, rateFromSeconds };
});
