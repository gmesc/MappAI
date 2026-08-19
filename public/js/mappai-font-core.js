/*
 * mappai-font-core.js — IL CATALOGO DEI CARATTERI, in un posto solo (18/8/26)
 * -----------------------------------------------------------------------------
 * Core PURO (zero DOM, zero jsPDF) dietro le due scelte di carattere:
 *
 *   · Cabina › Aspetto e leggibilità  → il carattere di TUTTA l'app, e quindi
 *     di tutto ciò che l'app genera: mappe, quiz, flashcard, sintesi, fogli;
 *   · ELABORA › l'editor di un documento → il carattere di QUEL documento,
 *     che vince sul globale e viaggia con la sua sorgente.
 *
 * ── PERCHÉ È UN CORE E NON UNA COSTANTE NEL CSS ──────────────────────────────
 * Perché un carattere qui non è solo una veste: i fogli stampabili
 * (quiz cartacei, flashcard, foglio dei nodi) decidono l'a-capo CONTANDO i
 * caratteri, senza misurare niente nel browser — è la proprietà per cui
 * mappai-print-layout.js produce una carta giusta anche in un'anteprima senza
 * JavaScript, in printToPDF e in un PDF fatto con jsPDF. Quel conto ha bisogno
 * di sapere quanto è largo un carattere in QUESTO carattere. Se il numero vive
 * nel CSS, il foglio non lo può leggere.
 *
 * ── LE DUE METRICHE, E PERCHÉ SONO DUE ───────────────────────────────────────
 * Misurate da tools/font/prepara-font.py sul testo VERO dei vault (891 nodi,
 * ~284.000 caratteri): per ogni carattere si cerca l'advance più STRETTO che
 * non fa sbordare nessuna riga, simulando l'a-capo vero di print-layout.
 *
 *   advance     — il corpo del testo (minuscolo/misto)
 *   headAdvance — le TESTATE, che sono maiuscole E spaziate (setCharSpace)
 *
 * ⚠️ Non si deriva l'una dall'altra. Finora il foglio faceva
 * `headAdvance = advance + headLetterSpacing` (0,612 + 0,06 = 0,672), e con
 * Space Mono funziona perché è monospazio. Sui caratteri proporzionali no: le
 * maiuscole sono molto più larghe della media, e la somma darebbe 0,560 dove
 * ne servono 0,710 — le testate sborderebbero del 27%. Le due metriche si
 * dichiarano separate, e chi impagina usa quella giusta.
 *
 * ── ORDINE DI GRANDEZZA, PER NON SPAVENTARSI ─────────────────────────────────
 * TestMe e Atkinson sono più STRETTI di Space Mono sul testo italiano reale
 * (0,44 em contro 0,61): con la vecchia costante non sborderebbero mai, ma il
 * foglio riserverebbe il 38% di spazio in più del necessario e il motore
 * rimpicciolirebbe il corpo più del dovuto — che su un carattere scelto per
 * leggere meglio è il risultato rovesciato. Da qui l'advance per carattere.
 *
 * UMD: window.MappAIFontCore (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIFontCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function _s(v) { return String(v == null ? '' : v).trim(); }

    // Le emoji prendono il glifo dal PRIMO carattere dello stack che ce l'ha:
    // Noto Color Emoji va messo SUBITO DOPO il carattere di testo e PRIMA di
    // qualunque ripiego generico, o su macOS si cade sull'emoji di sistema.
    // (regola emoji Android di MappAI — vale per ogni stack che emettiamo)
    var EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji'";

    var DEFAULT = 'space-mono';

    /*
     * Il catalogo. Un carattere nuovo è una riga qui: da questa lista escono i
     * due selettori, lo stack CSS, le @font-face, le metriche del foglio e la
     * registrazione in jsPDF. Nessun altro posto elenca i caratteri.
     *
     *   id          la chiave che si scrive in localStorage e nella sorgente
     *               di un documento — non cambia mai, è un dato salvato
     *   famiglia    il nome della famiglia CSS, e la chiave ESATTA che jsPDF e
     *               svg2pdf si aspettano (con gli apici o un ripiego accanto
     *               svg2pdf non la trova: trappola già pagata in d3-render)
     *   file        i tagli in public/fonts/ (Regular e Bold sempre; il corsivo
     *               solo dove esiste davvero)
     *   modulo      il file base64 per jsPDF, caricato A RICHIESTA
     *   globale     il nome che quel modulo espone su window
     *   advance/headAdvance   vedi sopra
     *   note        che cosa il docente deve sapere, detto nel selettore
     */
    var FONTS = [
        {
            id: 'space-mono',
            famiglia: 'Space Mono',
            etichetta: 'Space Mono',
            descrizione: 'Il carattere storico di MappAI. Monospazio: ogni lettera occupa lo stesso spazio.',
            file: { normale: 'SpaceMono-Regular.ttf', grassetto: 'SpaceMono-Bold.ttf' },
            ripiego: 'monospace',
            modulo: 'vendor/spacemono-font.js',
            globale: 'MappAISpaceMono',
            /* i byte da mettere DENTRO un documento (sottoinsieme + WOFF) */
            incorpora: 'vendor/space-mono-incorpora.js',
            incorporaGlobale: 'MappAIInc_space_mono',
            // Storici: il foglio è tarato su questi da sempre e le carte già
            // stampate ci corrispondono. Misurando oggi verrebbe 0,605/0,645 —
            // cioè margine, non errore. Non si toccano: cambiarli ricomporrebbe
            // fogli che oggi escono giusti.
            advance: 0.612,
            headAdvance: 0.672,
            corsivo: true
        },
        {
            id: 'testme-sans',
            // ⚠️ «TM Sans» e non «TestMe Sans»: il carattere che l'app spedisce
            // ha i glifi scientifici cuciti dentro (tools/font/prepara-font.py),
            // ed è quindi una versione MODIFICATA — la OFL di TestMe dichiara
            // «Reserved Font Name TestMe» e vieta a una versione modificata di
            // portare quel nome. La paternità resta nella descrizione, che è
            // dove la licenza vuole che stia. L'`id` non cambia: è un dato
            // salvato nei documenti e nelle impostazioni.
            famiglia: 'TM Sans',
            etichetta: 'TM Sans',
            descrizione: 'Carattere ad alta leggibilità derivato da TestMe (Perondi/Romei, a sua volta da Titillium). Senza corsivo.',
            file: { normale: 'TestMeSans-Regular.ttf', grassetto: 'TestMeSans-Bold.ttf' },
            ripiego: 'sans-serif',
            modulo: 'vendor/testme-sans-font.js',
            globale: 'MappAIFont_testme_sans',
            /* i byte da mettere DENTRO un documento (sottoinsieme + WOFF) */
            incorpora: 'vendor/testme-sans-incorpora.js',
            incorporaGlobale: 'MappAIInc_testme_sans',
            advance: 0.500,
            headAdvance: 0.710,
            corsivo: false
        },
        {
            id: 'testme-alt',
            // vedi la nota su 'testme-sans': stesso motivo, stesso nome nuovo
            famiglia: 'TM Alt',
            etichetta: 'TM Alt',
            descrizione: 'La variante di TestMe (Perondi/Romei) con le lettere che si scambiano più spesso (b d p q) disegnate diverse. Senza corsivo.',
            file: { normale: 'TestMeAlt-Regular.ttf', grassetto: 'TestMeAlt-Bold.ttf' },
            ripiego: 'sans-serif',
            modulo: 'vendor/testme-alt-font.js',
            globale: 'MappAIFont_testme_alt',
            /* i byte da mettere DENTRO un documento (sottoinsieme + WOFF) */
            incorpora: 'vendor/testme-alt-incorpora.js',
            incorporaGlobale: 'MappAIInc_testme_alt',
            advance: 0.500,
            headAdvance: 0.710,
            corsivo: false
        },
        {
            id: 'atkinson',
            famiglia: 'Atkinson Hyperlegible',
            etichetta: 'Atkinson Hyperlegible',
            descrizione: 'Disegnato dal Braille Institute per chi vede poco: lettere simili rese diverse. Ha anche il corsivo.',
            file: {
                normale: 'Atkinson-Regular.ttf', grassetto: 'Atkinson-Bold.ttf',
                corsivo: 'Atkinson-Italic.ttf', corsivoGrassetto: 'Atkinson-BoldItalic.ttf'
            },
            ripiego: 'sans-serif',
            modulo: 'vendor/atkinson-font.js',
            globale: 'MappAIFont_atkinson',
            /* i byte da mettere DENTRO un documento (sottoinsieme + WOFF) */
            incorpora: 'vendor/atkinson-incorpora.js',
            incorporaGlobale: 'MappAIInc_atkinson',
            advance: 0.485,
            headAdvance: 0.710,
            corsivo: true
        }
    ];

    var PER_ID = {};
    for (var i = 0; i < FONTS.length; i++) PER_ID[FONTS[i].id] = FONTS[i];

    /** L'elenco per i due selettori, nell'ordine in cui va mostrato. */
    function elenco() { return FONTS.slice(); }

    function valido(id) { return !!PER_ID[_s(id)]; }

    /** La scheda del carattere; un id ignoto NON lancia: ripiega sul default. */
    function font(id) { return PER_ID[_s(id)] || PER_ID[DEFAULT]; }

    /**
     * Chi comanda: il documento, poi l'app, poi il default.
     * È la regola dell'intera feature — la scelta di ELABORA vale per QUEL
     * documento, la scelta della Cabina per tutto il resto.
     */
    function risolvi(idDocumento, idGlobale) {
        if (valido(idDocumento)) return _s(idDocumento);
        if (valido(idGlobale)) return _s(idGlobale);
        return DEFAULT;
    }

    /**
     * Lo stack CSS. Le emoji stanno DENTRO lo stack, mai solo dichiarate in una
     * variabile: è il bug già pagato in MappAI (emoji di sistema al posto di Noto).
     */
    function stackDi(id) {
        var f = font(id);
        return "'" + f.famiglia + "', " + EMOJI + ", " + f.ripiego;
    }

    /** Le due metriche che servono a impaginare un foglio stampabile. */
    function metriche(id) {
        var f = font(id);
        return { advance: f.advance, headAdvance: f.headAdvance, mono: f.id === 'space-mono' };
    }

    /**
     * Le regole @font-face, con i file di public/fonts/.
     * `base` è il prefisso del percorso: '' dentro l'app (dove il CSS sta in
     * public/css/ e risolve da sé), un URL o un data: URI altrove.
     */
    function facce(id, base) {
        var f = font(id);
        var pre = base == null ? 'fonts/' : base;
        var out = [];
        function faccia(file, peso, stile) {
            if (!file) return;
            out.push("@font-face{font-family:'" + f.famiglia + "';src:url('" + pre + file +
                "') format('truetype');font-weight:" + peso + ";font-style:" + stile +
                ";font-display:swap;}");
        }
        faccia(f.file.normale, 400, 'normal');
        faccia(f.file.grassetto, 700, 'normal');
        faccia(f.file.corsivo, 400, 'italic');
        faccia(f.file.corsivoGrassetto, 700, 'italic');
        return out.join('\n');
    }

    /** Tutte le facce del catalogo: è quello che carica il foglio dell'app. */
    function tutteLeFacce(base) {
        return FONTS.map(function (f) { return facce(f.id, base); }).join('\n');
    }

    /**
     * Il carattere ha il corsivo vero? Dove non ce l'ha (TestMe) il browser
     * inclina il tondo, e chi stampa deve poterlo dire invece di prometterlo.
     */
    function haCorsivo(id) { return !!font(id).corsivo; }

    return {
        DEFAULT: DEFAULT, EMOJI: EMOJI, FONTS: FONTS,
        elenco: elenco, valido: valido, font: font, risolvi: risolvi,
        stackDi: stackDi, metriche: metriche,
        facce: facce, tutteLeFacce: tutteLeFacce, haCorsivo: haCorsivo
    };
});
