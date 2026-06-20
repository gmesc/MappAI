/*
 * mappai-text-utils.js — Utility di testo PURE (Tier 1 extraction)
 * ----------------------------------------------------------------
 * Estratte da app.js senza alterarne il comportamento.
 * Modulo UMD: usabile sia nel browser (window.*) sia in Node (require) per i test.
 *
 * Caricare in index.html PRIMA di app.js (app.js delega a questo modulo).
 * Vedi docs/rules/06-modules-and-extraction.md
 *
 * API: window.MappAITextUtils = { cleanLabel, getLabelLines, extractDateFromLabel, stripHTML }
 * Alias globali (retrocompatibilità con i moduli esistenti che usano window.cleanLabel ecc.):
 *   window.cleanLabel, window.getLabelLines, window.extractDateFromLabel, window.stripHTML
 *
 * NOTA: stripHTML dipende dal DOM (document) → non testabile in Node headless.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.MappAITextUtils = api;
        window.cleanLabel = api.cleanLabel;
        window.getLabelLines = api.getLabelLines;
        window.extractDateFromLabel = api.extractDateFromLabel;
        window.stripHTML = api.stripHTML;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function cleanLabel(str) {
        if (!str) return "";
        let s = String(str).split('\\n').join('\n').trim();

        // Normalizza apostrofi e virgolette tipografiche → ASCII.
        // Evita problemi di encoding PDF (jsPDF non codifica correttamente U+2018/U+2019)
        // e garantisce coerenza del testo (es. ''89' non diventa 'SQ' nel PDF).
        s = s.replace(/[‘’‛ʼ]/g, "'")  // ' ' ‛ ʼ → '
            .replace(/[“”‟]/g, '"');        // " " ‟ → "

        // Rimuove decorazioni markdown che alcuni modelli (es. Mistral) iniettano
        // nelle label: grassetto/corsivo, marcatori di lista/heading, virgolette enfatiche.
        // 1. Grassetto/corsivo markdown che avvolge tutta la label: **x**, *x*, __x__, _x_
        s = s.replace(/^(\*\*|__)(.+?)\1$/, '$2').replace(/^(\*|_)(.+?)\1$/, '$2');
        // 2. Marcatori di lista/heading/citazione a inizio label: + * - # >
        s = s.replace(/^[\s>#*+\-]+/, '');
        // 3. Marcatori markdown residui a fine label: ** * _
        s = s.replace(/(\*\*|__|\*|_)+$/, '');
        // 4. Grassetto markdown INLINE in mezzo alla label: (**Data**: x) -> (Data: x)
        s = s.replace(/(\*\*|__)(.+?)\1/g, '$2');
        // 5. Virgolette (dritte o tipografiche) che avvolgono l'intera label
        s = s.replace(/^["'«»“”„](.+?)["'«»“”„]$/, '$1');
        // 6. Marcatore "..." o "…" residuo a fine label (troncamento del modello)
        s = s.replace(/[\s.…]*(\.{3}|…)\s*$/, '');
        // 7. Liste enumerate tra parentesi nei label L1 (artefatto AI con lenses attive):
        //    "Figure Chiave (Stalin, Churchill, Tito, ...)" → "Figure Chiave"
        //    Attivato solo se la parentesi contiene almeno una virgola (è una lista, non un'espressione).
        s = s.replace(/\s*\([^)]*,[^)]*\)\s*/g, '').trim();

        return s.trim();
    }

    function getLabelLines(str) {
        if (!str) return [];
        return String(str).split('\n');
    }

    /**
     * Se una label inizia con una data (4 cifre o abbreviazione 'NN o NN),
     * restituisce { date, name }. Altrimenti null.
     * Esempi: "1989 Caduta Muro" → {date:"1989", name:"Caduta Muro"}
     *         "'89-'90 Transizione" → {date:"'89-'90", name:"Transizione"}
     */
    function extractDateFromLabel(label) {
        if (!label) return null;
        // Forma lunga: 1989 o 1980-1989 o 1980–1989
        const m4 = label.match(/^(\d{4}(?:\s*[-–]\s*\d{4})?)\s+(.+)/);
        if (m4) return { date: m4[1].trim(), name: m4[2].trim() };
        // Forma breve italiana: '89 o '80-'89
        const m2 = label.match(/^('[0-9]{2}(?:\s*[-–]\s*'?[0-9]{2})?)\s+(.+)/);
        if (m2) return { date: m2[1].trim(), name: m2[2].trim() };
        return null;
    }

    function stripHTML(html) {
        let tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }

    return { cleanLabel, getLabelLines, extractDateFromLabel, stripHTML };
});
