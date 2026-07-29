/**
 * ┌─ COPIA DA MAPPAI — non modificare in loco ────────────────────────────────┐
 * │ Origine : public/js/mappai-desc-fidelity.js  (MappAI re)                  │
 * │ Commit  : 0751fa4 · Copiato il 28/07/2026                                 │
 * │ Motivo  : la copertura della fonte (FR-022) deve produrre numeri coerenti │
 * │           con quelli dell'app principale. Stessa tokenizzazione, stesso   │
 * │           stemming, stesse stopword — altrimenti «copertura» qui e        │
 * │           «groundedness» là misurerebbero cose diverse con lo stesso nome.│
 * │ Aggiorn.: rileggere l'originale, non correggere qui. Vedi RIUSO.md.       │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisItTokens = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Lunghezza radice per il match di flessioni ("occupa-" copre
    // occupare/occupazione/occupata). Sotto i 6 char troppi falsi positivi.
    const STEM_LEN = 6;

    // Solo parole >= 4 lettere arrivano qui, quindi bastano le funzionali lunghe.
    const STOPWORDS = new Set([
        'della', 'delle', 'dello', 'degli', 'alla', 'alle', 'agli', 'allo',
        'dalla', 'dalle', 'dagli', 'dallo', 'nella', 'nelle', 'negli', 'nello',
        'sulla', 'sulle', 'sugli', 'sullo', 'questo', 'questa', 'questi', 'queste',
        'quello', 'quella', 'quelli', 'quelle', 'come', 'dove', 'quando', 'perche',
        'anche', 'ancora', 'dopo', 'prima', 'senza', 'sopra', 'sotto', 'verso',
        'ogni', 'tutto', 'tutta', 'tutti', 'tutte', 'altro', 'altra', 'altri',
        'altre', 'loro', 'suoi', 'essa', 'esso', 'essi', 'esse', 'quindi',
        'inoltre', 'infatti', 'invece', 'mentre', 'durante', 'tramite', 'attraverso',
        'sono', 'erano', 'essere', 'stato', 'stata', 'stati', 'state',
        'avere', 'aveva', 'hanno', 'viene', 'veniva', 'vengono', 'venne',
        'fare', 'fatto', 'fatta', 'puo', 'sara', 'furono',
        'that', 'this', 'these', 'those', 'with', 'from', 'were', 'been',
        'have', 'their', 'which', 'would', 'could', 'should', 'about',
        'after', 'before', 'also', 'only', 'other', 'every', 'some',
        'there', 'where', 'when', 'while', 'through', 'because', 'being'
    ]);

    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // à→a, é→e
            .replace(/[’´`]/g, "'");
    }

    // Parole-contenuto: >= 4 lettere non-stopword, oppure numeri (>= 2 cifre).
    function contentWords(text) {
        return normalize(text)
            .split(/[^a-z0-9]+/)
            .filter(w => w
                && !STOPWORDS.has(w)
                && (/\d/.test(w) ? w.length >= 2 : w.length >= 4));
    }

    function buildSourceIndex(sourceText) {
        const words = new Set();
        const stems = new Set();
        for (const w of contentWords(sourceText)) {
            words.add(w);
            if (w.length >= STEM_LEN) stems.add(w.slice(0, STEM_LEN));
        }
        return { words, stems };
    }

    // Quota di parole-contenuto di `testo` presenti nell'indice. null se il
    // testo non ha parole-contenuto (una frase di sole funzionali).
    function groundedness(testo, indiceOTesto) {
        const idx = (indiceOTesto && indiceOTesto.words instanceof Set)
            ? indiceOTesto
            : buildSourceIndex(indiceOTesto);
        const ws = contentWords(testo);
        if (!ws.length) return null;
        let hit = 0;
        for (const w of ws) {
            if (idx.words.has(w)) { hit++; continue; }
            if (w.length >= STEM_LEN && idx.stems.has(w.slice(0, STEM_LEN))) hit++;
        }
        return hit / ws.length;
    }

    return { STEM_LEN, STOPWORDS, normalize, contentWords, buildSourceIndex, groundedness };
}));
