/*
 * mappai-questions-core.js — estrazione delle DOMANDE/ESERCIZI dalla fonte
 * -------------------------------------------------------------------------
 * Le schede didattiche contengono esercizi con domande ("A cosa servì il Piano
 * Marshall?", "Completa la tabella…", "Spiega perché…"). Questo core PURO le
 * recupera dal testo fonte (deterministico, zero AI) per riusarle nei quiz.
 *
 * Segnali: frasi che finiscono con '?'; incipit imperativi da consegna
 * ("Completa", "Spiega", "Indica", "Rispondi", "Con i dati…"…). Deduplica,
 * filtra rumore (troppo corte/lunghe), conserva l'ordine di apparizione.
 *
 * UMD: window.MappAIQuestions (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIQuestions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Verbi/incipit di consegna (esercizi imperativi senza '?').
    var IMPERATIVE = /^(?:\d+\s*[.)]\s*|[a-z]\s*[.)]\s*)?(rispondi|completa|indica|spiega|descrivi|elenca|osserva|confronta|calcola|scrivi|collega|associa|scegli|sottolinea|riassumi|definisci|motiva|argomenta|individua|distingui|classifica|ordina|con i dati|con l['aeiou]|in base a|dopo aver letto)\b/i;
    // Incipit interrogativi tipici (per frasi senza '?' finale ma chiaramente domande).
    var WH = /^(?:\d+\s*[.)]\s*|[a-z]\s*[.)]\s*)?(perch[ée]|quali|qual['e]|quale|come mai|come|che cosa|cosa|chi|quando|dove|quanto|quanti|quante)\b/i;

    function _clean(s) {
        return String(s == null ? '' : s)
            .replace(/^\s*(?:\d+\s*[.)]\s*|[a-z]\s*[.)]\s*)/i, '')   // via "a." / "1)" iniziale
            .replace(/\s+/g, ' ').trim();
    }
    function _words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }
    function _key(s) { return _clean(s).toLowerCase().replace(/[^\p{L}\p{N}?]+/gu, ' ').replace(/\s+/g, ' ').trim(); }

    // Spezza il testo in unità-frase conservando la punteggiatura finale.
    function _units(text) {
        return String(text == null ? '' : text)
            .replace(/\r/g, '')
            .split(/(?<=[.!?…])\s+|\n+/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    /**
     * Estrae le domande/consegne dalla fonte.
     * @param {string} text
     * @param {{minWords?:number, maxWords?:number, cap?:number}} [opts]
     * @returns {Array<{text:string, type:'question'|'task'}>}
     */
    function extractQuestions(text, opts) {
        opts = opts || {};
        var minWords = opts.minWords || 4, maxWords = opts.maxWords || 45, cap = opts.cap || 100;
        var out = [], seen = {};
        _units(text).forEach(function (u) {
            var raw = u.trim();
            var isQ = /\?\s*$/.test(raw);
            var body = _clean(raw);
            var w = _words(body);
            if (w < minWords || w > maxWords) return;
            var type = null;
            if (isQ) type = 'question';
            else if (IMPERATIVE.test(raw)) type = 'task';
            else if (WH.test(raw)) type = 'question';   // domanda senza '?' (raro nell'estratto)
            if (!type) return;
            var k = _key(body);
            if (!k || seen[k]) return;
            seen[k] = 1;
            out.push({ text: body, type: type });
        });
        return out.slice(0, cap);
    }

    return { extractQuestions: extractQuestions, _units: _units };
});
