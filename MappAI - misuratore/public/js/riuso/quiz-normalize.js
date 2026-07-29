/**
 * ┌─ COPIA DA MAPPAI — non modificare in loco ────────────────────────────────┐
 * │ Origine : public/js/mappai-docedit-core.js  (MappAI re)                   │
 * │ Commit  : 0751fa4 · Copiato il 28/07/2026                                 │
 * │ Motivo  : gli studySet nel vault esistono in TRE forme storiche diverse   │
 * │           (q/correct · front/back · question/correctIndex, più la forma   │
 * │           a1/a2/a3+correct numerico dei quiz per nodo). Senza             │
 * │           normalizzazione, la lente di verifica (FR-024) leggerebbe       │
 * │           domande vuote — è un bug già capitato in MappAI il 23/07/2026.  │
 * │ Aggiorn.: rileggere l'originale, non correggere qui. Vedi RIUSO.md.       │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisQuizNormalize = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function _txt(v) { return v == null ? '' : String(v).trim(); }

    // Ricostruisce le opzioni dalla forma a1/a2/a3 (quiz per nodo del dungeon
    // e dei rami): correct è un indice 1-based su quelle chiavi.
    function _optsFromAn(item) {
        const out = [];
        for (let i = 1; i <= 6; i++) {
            const v = item['a' + i];
            if (v == null || _txt(v) === '') break;
            out.push(_txt(v));
        }
        return out;
    }

    /**
     * item eterogeneo → { domanda, opzioni[], indiceCorretto, rispostaCorretta, spiegazione }
     * indiceCorretto è 0-based, -1 se non determinabile.
     * Idempotente: normalizzare due volte dà lo stesso risultato.
     */
    function normalizeItem(item) {
        if (!item || typeof item !== 'object') {
            return { domanda: '', opzioni: [], indiceCorretto: -1, rispostaCorretta: '', spiegazione: '' };
        }

        const domanda = _txt(item.q || item.question || item.front || item.domanda);
        const spiegazione = _txt(item.explanation || item.spiegazione || item.why);

        let opzioni = Array.isArray(item.options) ? item.options.map(_txt).filter(Boolean) : [];
        if (!opzioni.length) opzioni = _optsFromAn(item);

        let indiceCorretto = -1;
        let rispostaCorretta = '';

        if (typeof item.correctIndex === 'number') {
            indiceCorretto = item.correctIndex;
        } else if (typeof item.correct === 'number') {
            // Forma a1/a2/a3: 1-based. Forma options+correct numerico: 0-based.
            const base = (!Array.isArray(item.options) && _optsFromAn(item).length) ? 1 : 0;
            indiceCorretto = item.correct - base;
        } else if (item.correct != null || item.back != null) {
            rispostaCorretta = _txt(item.correct != null ? item.correct : item.back);
            const i = opzioni.findIndex(o => o === rispostaCorretta);
            if (i >= 0) indiceCorretto = i;
        }

        if (!rispostaCorretta && indiceCorretto >= 0 && indiceCorretto < opzioni.length) {
            rispostaCorretta = opzioni[indiceCorretto];
        }
        if (indiceCorretto < 0 || indiceCorretto >= opzioni.length) {
            if (!opzioni.length) indiceCorretto = -1;
        }

        return { domanda, opzioni, indiceCorretto, rispostaCorretta, spiegazione };
    }

    // 'mc' se ci sono opzioni multiple, 'tf' se sono due e sembrano Vero/Falso,
    // 'flashcard' se non ci sono opzioni. Serve a raggruppare i set nel report.
    function shapeOfItems(items) {
        const norm = (items || []).map(normalizeItem);
        if (!norm.length) return 'vuoto';
        const conOpzioni = norm.filter(i => i.opzioni.length >= 2);
        if (!conOpzioni.length) return 'flashcard';
        const tutteVF = conOpzioni.every(i =>
            i.opzioni.length === 2 &&
            i.opzioni.every(o => /^(vero|falso|true|false)$/i.test(o)));
        return tutteVF ? 'tf' : 'mc';
    }

    function normalizeSet(set) {
        const items = Array.isArray(set && set.items) ? set.items : [];
        return {
            id: (set && set.id) || '',
            titolo: _txt(set && (set.title || set.titolo)),
            tipo: _txt(set && set.type) || shapeOfItems(items),
            forma: shapeOfItems(items),
            items: items.map(normalizeItem),
        };
    }

    return { normalizeItem, normalizeSet, shapeOfItems };
}));
