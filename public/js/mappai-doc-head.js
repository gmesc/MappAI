/* MappAI — LA CORNICE DEL DOCUMENTO: testata e piè, in un posto solo (11/8/26)
 *
 *     const H = MappAIDocHead;
 *     documento = '<style>' + H.stile({ accento:'#4f46e5', logo, mappa:'Sistema Terra' }) + '</style>'
 *               + H.testata({ titolo:'Nodo: Il Clima', tipo:'Quiz', mappa:'Sistema Terra',
 *                             classe:'2A', materia:'Geografia', badge:'12 domande' })
 *               + corpo;
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────
 * La stessa testata a card era scritta NOVE volte, con nove misure diverse:
 * quiz e domande aperte (.qp-header), sintesi (.bs-header), timeline
 * (.tl-header), catena dei perché (.cc-header),
 * documento di studio (.sd-header), report Live (.lr-header) e Tutor
 * (.tr-header), più l'anteprima dell'editor (.de-sheet-head). Il dossier ne
 * aveva una decima, di tutt'altra forma. Padding 24/26/28, bordo 2px o 3px,
 * margine 18/22/24/28, il glossario senza fondo, tre formati di data e sette
 * stringhe di brand nel piè. Nessuna di quelle differenze era una decisione:
 * erano copie invecchiate ognuna per conto suo. Cambiare «la testata» voleva
 * dire aprire nove file e sperare di non dimenticarne uno.
 *
 * ── CHE COSA DICE LA TESTATA (deciso da Giacomo, 11/8/26) ────────────────────
 * Titolo · CLASSE · MATERIA. Le due coordinate con cui un docente ritrova le
 * cose sono la classe e la materia — sono le colonne delle tabelle di INSEGNA
 * e i due livelli della cartella su disco (Mappe/<classe>/<materia>/) — e fino
 * a oggi non comparivano su NESSUN foglio stampato. Un quiz fotocopiato e
 * lasciato sulla cattedra non diceva per chi era. I due chip riusano i colori
 * delle tabelle (classe indaco, materia ambra): stessa informazione, stessa
 * veste, così si riconoscono senza leggerli.
 *
 * ── IL PIÈ È NEI MARGIN-BOX DI @page, E NON È UN DETTAGLIO TECNICO ───────────
 * Giacomo ha chiesto il numero di pagina. Un contatore di pagine NON si può
 * scrivere in un elemento del documento: `counter(page)` fuori da @page vale 0
 * (misurato). Le tre strade sono state provate davvero, con Electron, su un
 * documento di tre pagine:
 *
 *   | tecnica                        | pag. 1 | pag. 2-3 | numero | logo |
 *   | position:fixed (il dossier)    |   NO   |    sì    |   no   |  sì  |
 *   | footerTemplate di printToPDF   |   sì   |    sì    |   sì   |  sì  |
 *   | margin-box di @page            |   sì   |    sì    |   sì   |  sì  |
 *
 * Si è scelto il MARGIN-BOX perché è l'unico che vive dentro il documento:
 * l'HTML salvato nel vault, aperto da un collega o da uno studente, si stampa
 * coi suoi numeri di pagina senza passare dal nostro processo. Il
 * `footerTemplate` funziona altrettanto bene ma solo per i PDF che scriviamo
 * noi (IPC html-to-pdf); il `position:fixed` è quello che il dossier usa oggi,
 * e la prova ha mostrato che **salta la prima pagina** — un difetto vero, che
 * migrando il dossier a questa cornice si chiude da sé.
 *
 * ⚠️ IL LOGO VA PASSATO GIÀ PICCOLO. Un margin-box rende `content: url(...)`
 * alla dimensione INTRINSECA dell'immagine: il logo vero dell'app è 1024×1024 e
 * nella prova ha coperto mezza pagina spingendo fuori il numero. Si passa un
 * data-URI di ~24px (in-app: `logoPiccolo()` qui sotto, che lo riduce una volta
 * sola e lo tiene in cache). Senza logo la cornice funziona lo stesso.
 *
 * Puro: nessun DOM, nessun appState, nessuna dipendenza. UMD → i test girano in
 * Node. L'unico pezzo che tocca il browser è `logoPiccolo()`, che si arrende in
 * silenzio dove non c'è un canvas.
 *
 * FUORI AMBITO, per decisione di Giacomo: il materiale da RITAGLIARE (foglio
 * dei nodi, flashcard) non usa questa cornice e resta com'è; Consumi è una pagina
 * a parte. I REPORT (Live, Tutor, iPad) usano la cornice dal packet 0132 (Giacomo,
 * 27/10: «tutti i report devono avere degli stili allineati e coerenti»): titolo
 * con `stile({ report: true })`, corpo con `stileReport()`, misure in `REPORT`.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIDocHead = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* i18n: le stringhe arrivano da fuori quando c'è `window.t`, altrimenti
       valgono i ripieghi italiani. MAI `window.t` diretto: questo modulo gira
       anche in Node, dove `window` non esiste (regola 13 del progetto). */
    function _t(k, f) {
        try {
            if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(k, f);
        } catch (e) { /* noop */ }
        return f;
    }

    // ── MISURE ───────────────────────────────────────────────────────────────
    // Un posto solo. Erano nove serie di numeri; questa è quella che vince, ed
    // è la mediana delle nove (padding 26, bordo 2px, margine 24) — non un
    // gusto nuovo, così nessun documento cambia più di quanto serve.
    var M = {
        padTop: 26, padX: 16, padBottom: 20,   // px
        raggio: 16,
        bordo: 2,                              // px, colore = accento
        margineSotto: 24,
        titolo: 20, titoloPeso: 900,
        sotto: 10,
        chip: 10,
        badge: 10,
        pie: 9,                                // pt, dentro il margin-box
        logo: 24                               // px, lato del logo nel piè
    };

    var COL = {
        inchiostro: '#1e293b',
        tenue: '#64748b',
        classeFondo: '#eef2ff', classeTesto: '#4338ca',   // indaco = classe (tabelle INSEGNA)
        materiaFondo: '#fef3c7', materiaTesto: '#92400e', // ambra = materia (tabelle INSEGNA)
        badgeFondo: '#ede9fe', badgeTesto: '#4f46e5',
        piePagina: '#94a3b8'
    };

    var ACCENTO = '#4f46e5';

    /* LE MISURE DEI REPORT (0132). Il modello è il foglio delle domande aperte (`buildOpenQuestionsHtml`): ogni numero
       viene da lì, scritto una volta perché i report del LIVE, del Tutor e dell'iPad lo leggano da qui invece di averne
       una copia ciascuno. Di nuovo ci sono il titolo (Giacomo, 27/10: «Il foglio delle aperte ma con un corpo del titolo
       di 3pt più grandi»: 15 pt → 18 pt = 24 px) e l'interlinea della risposta (D1: «13px ma aumenta l'interlinea»,
       poi «Interlinea delle risposte: 2,0»; il foglio ha 1,6). */
    var REPORT = {
        titolo: 24,                 // px = 18 pt
        corpo: '12pt',              // il body del foglio delle aperte
        sezione: 15,                // .oq-section-title
        occhiello: 11,              // «DOMANDA n»
        domanda: '13pt',            // h3 della domanda
        risposta: 13,               // il riquadro della risposta
        rispostaInterlinea: 2,
        larghezza: 800,
        /* IL VERDE DEI REPORT (gate del 28/10, Giacomo): uno solo per le giuste — filo, quadratini, segmenti — e per il filo dei
           riquadri delle risposte e le barre dei report delle domande aperte, che avevano il verde acqua del genere («alle linee
           verticali dei campi della risposta e a tutti i quadratini o le barre che usano il verde applica il verde chiaro») */
        verde: '#16a34a'
    };
    /* gli esiti: filo, fondo, testo, quadratino (fondo, segno) — testo e segno ≥ 4,5:1 sul loro fondo (invariante 16),
       con UNA deroga decisa da Giacomo al gate del 28/10: il quadratino delle giuste ha lo stesso verde del filo delle
       risposte giuste («devono avere lo stesso tipo di verde applicato alla linea verde verticale», poi «Chiaro per tutti»),
       e il ✓ bianco su #16a34a fa 3,30:1 */
    var ESITO = {
        ok: [REPORT.verde, '#f0fdf4', '#15803d', REPORT.verde, '#fff'],
        ko: ['#dc2626', '#fef2f2', '#b91c1c', '#dc2626', '#fff'],
        vuota: ['#94a3b8', '#f8fafc', '#475569', '#e2e8f0', '#475569'],
        mano: ['#7c3aed', '#f5f3ff', '#6d28d9', '#7c3aed', '#fff']
    };
    /* le emoji d'identità nello stack EFFETTIVO del corpo, non solo dichiarate (regola globale del progetto) */
    var EMOJI = "'MappAI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji'";

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* Le stringhe dei margin-box sono VALORI CSS, non HTML: si quotano, e
       dentro le virgolette solo la barra rovescia e le virgolette vanno
       protette. Un a-capo dentro una content string invalida la dichiarazione
       e il piè sparisce SENZA errori — quindi si appiattisce. */
    function escCss(s) {
        return String(s == null ? '' : s)
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/[\r\n]+/g, ' ')
            /* ⚠️ il valore sta dentro un <style>: un «</style>» nel nome della mappa
               chiudeva il foglio e il resto diventava HTML della pagina stampata (25/9).
               `\3c ` è l'escape CSS di «<»: a schermo resta «<». */
            .replace(/</g, '\\3c ');
    }

    /* Data del documento: **GG/MM/AAAA, senza ora** (decisione di Giacomo,
       11/8/26). Il formato è quello che il progetto ha già fissato per le
       tabelle (regola §10.15); i nove fogli ne usavano tre diversi
       (`toLocaleString`, `toLocaleDateString`, un formatter a mano) e due di
       essi stampavano anche l'ora.
       ⚠️ L'ora NON è un'opzione spenta: non si scrive. Su un foglio di studio
       il minuto in cui è stato generato non dice niente a nessuno, e su due
       copie della stessa scheda fa sembrare diverso ciò che è identico. */
    function data(d) {
        var x = (d instanceof Date) ? d : (d ? new Date(d) : new Date());
        if (isNaN(x.getTime())) return '';
        function p(n) { return String(n).padStart(2, '0'); }
        return p(x.getDate()) + '/' + p(x.getMonth() + 1) + '/' + x.getFullYear();
    }

    // ── LO STILE ─────────────────────────────────────────────────────────────
    /* o: { accento?, logo?, brand?, mappa?, numeriPagina? (default true),
     *      pagina? ({ size?, margine? }) | false, piePagina? (default true) }
     * Ritorna le REGOLE (senza il tag <style>): chi chiama lo mette dove vuole,
     * anche dentro un blocco che ha già altre regole sue.
     */
    function stile(o) {
        o = o || {};
        var acc = o.accento || ACCENTO;
        var css = [
            '.mm-dh { text-align:center; padding:' + M.padTop + 'px ' + M.padX + 'px ' + M.padBottom + 'px;',
            '   background:#fff; border-radius:' + M.raggio + 'px; margin-bottom:' + M.margineSotto + 'px;',
            '   border-bottom:' + M.bordo + 'px solid ' + acc + '; page-break-after:avoid; break-after:avoid; }',
            /* `margin:0` perché dall'11/9 il titolo è un <h1> vero e non più un
               <div>: senza, il margine di default del browser scollerebbe la
               testata di ogni foglio. Il titolo DEVE essere un'intestazione —
               è da lì che il PDF taggato ricava la struttura per chi legge con
               un lettore di schermo (`generateTaggedPDF`, main.js). */
            '.mm-dh__t { font-size:' + M.titolo + 'px; font-weight:' + M.titoloPeso + '; color:' + COL.inchiostro + '; margin:0; line-height:1.25; }',
            '.mm-dh__s { font-size:' + M.sotto + 'px; color:' + COL.tenue + '; margin-top:4px; }',
            /* La riga dei chip esiste solo se c'è almeno un chip: un contenitore
               vuoto lascerebbe 8px di aria che nessuno ha chiesto. */
            '.mm-dh__r { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; margin-top:8px; }',
            '.mm-dh__c { display:inline-block; border-radius:999px; padding:2px 10px;',
            '   font-size:' + M.chip + 'px; font-weight:700; }',
            '.mm-dh__c--cls { background:' + COL.classeFondo + '; color:' + COL.classeTesto + '; }',
            '.mm-dh__c--mat { background:' + COL.materiaFondo + '; color:' + COL.materiaTesto + '; }',
            '.mm-dh__b { display:inline-block; border-radius:999px; padding:2px 12px;',
            '   font-size:' + M.badge + 'px; font-weight:700;',
            '   background:' + COL.badgeFondo + '; color:' + COL.badgeTesto + '; }',
            '.mm-dh-pie { text-align:center; margin-top:32px; font-size:9px; color:' + COL.piePagina + ';',
            '   border-top:1px solid #f1f5f9; padding-top:12px; }',
            /* In stampa il fondo bianco su bianco non serve e l'ombra nemmeno:
               resta il filo d'accento, che è ciò che separa la testata dal corpo. */
            '@media print { .mm-dh { box-shadow:none; } }'
        ];
        /* il titolo dei REPORT (0132): 24 px. I fogli dei materiali restano a 20 */
        if (o.report) css.push('.mm-dh__t { font-size:' + REPORT.titolo + 'px; }');
        if (o.pagina !== false) css.push(regolePagina(o));
        return css.join('\n');
    }

    // ── LA VESTE DEI REPORT (0132) ───────────────────────────────────────────
    /* o: { accento?, fondoAccento?, filoRisposta? }. Le classi `mm-rp-*`: sezione, scheda col filo d'accento, occhiello «DOMANDA n»,
     * domanda, riquadro della risposta (+ `--ok`, `--ko`, `--vuota`, `--mano`), esiti, riepilogo coi quadratini.
     * Va DOPO `stile({ report: true })`, che porta la testata e la pagina. Come `stile`, ritorna le regole senza <style>.
     */
    function stileReport(o) {
        o = o || {};
        var R = REPORT, acc = o.accento || ACCENTO, fondo = o.fondoAccento || '#f0fdfa', filo = o.filoRisposta || acc;
        var css = [
            '*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box}',
            'body{font-family:var(--doc-font, \'Space Mono\'), ' + EMOJI + ', monospace;font-size:' + R.corpo + ';color:' + COL.inchiostro + ';' +
                'margin:0 auto;padding:24px 32px;max-width:' + R.larghezza + 'px;background:#f8fafc}',
            '.no-print{display:block}',
            '@media print{.no-print{display:none !important}body{background:#fff;padding:10px}}',
            '.mm-rp-sez{font-size:' + R.sezione + 'px;font-weight:900;color:' + acc + ';margin:20px 0 14px;padding-bottom:5px;' +
                'border-bottom:2px solid #e2e8f0;page-break-after:avoid;break-after:avoid}',
            '.mm-rp-card{background:#fff;border-radius:12px;padding:18px 22px;margin-bottom:16px;border-left:4px solid ' + acc + ';' +
                'page-break-inside:avoid;break-inside:avoid}',
            /* LA STAMPA (gate del 28/10, Giacomo: «nel report allievi l'intestazione della pagina ha un problema di formattazione
               perché si spezza su due fogli»). La scheda di un allievo è più lunga di una pagina: col «non spezzarti» Chrome la
               spingeva alla pagina dopo e si portava dietro mezza testata. Le schede lunghe (`--lunga`) si spezzano fra una
               domanda e l'altra; la testata, il riepilogo e ogni domanda restano interi. */
            '.mm-dh{page-break-inside:avoid;break-inside:avoid}',
            '.mm-rp-card--lunga{page-break-inside:auto;break-inside:auto}',
            '.mm-rp-riep{page-break-inside:avoid;break-inside:avoid}',
            /* nei report di classe le domande di un allievo stanno nella sua scheda, separate da un filo (D2) */
            '.mm-rp-voce{border-top:1px solid #e2e8f0;margin-top:16px;padding-top:14px;page-break-inside:avoid;break-inside:avoid}',
            '.mm-rp-occ{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:' + R.occhiello + 'px;font-weight:700;' +
                'text-transform:uppercase;letter-spacing:.06em;color:' + acc + ';margin-bottom:8px}',
            '.mm-rp-chip{font-weight:700;letter-spacing:.04em;color:#475569;background:#f1f5f9;border-radius:999px;padding:2px 9px;text-transform:none}',
            '.mm-rp-dom{font-size:' + R.domanda + ';font-weight:bold;margin:0 0 14px;color:' + COL.inchiostro + ';line-height:1.55}',
            '.mm-rp-ris{white-space:pre-wrap;border-left:3px solid ' + filo + ';background:' + fondo + ';padding:8px 12px;' +
                'font-size:' + R.risposta + 'px;line-height:' + R.rispostaInterlinea + ';color:' + COL.inchiostro + '}',
            '.mm-rp-ris + .mm-rp-ris{margin-top:8px}',
            '.mm-rp-et{display:block;font-size:' + R.occhiello + 'px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}',
            '.mm-rp-spieg{font-size:' + R.risposta + 'px;font-style:italic;line-height:1.6;color:#475569;margin-top:10px}',
            '.mm-rp-testo{font-size:' + R.risposta + 'px;line-height:1.6;color:#334155}',
            '.mm-rp-tenue{font-size:' + R.occhiello + 'px;color:#64748b}',
            /* il riepilogo: chi e la percentuale grandi quanto il titolo, poi i quadratini delle domande */
            '.mm-rp-riga{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
            '.mm-rp-num{font-size:' + R.titolo + 'px;font-weight:900;line-height:1}',
            '.mm-rp-chi{font-size:' + R.titolo + 'px;font-weight:900;line-height:1;color:' + COL.inchiostro + '}',
            '.mm-rp-strip{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px}',
            '.mm-rp-pill{width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
                'font-size:' + R.risposta + 'px;font-weight:700;color:#fff}',
            '.mm-rp-bar{display:flex;height:24px;border-radius:6px;overflow:hidden;margin-top:4px}',
            '.mm-rp-seg{display:flex;align-items:center;justify-content:center;font-size:' + R.occhiello + 'px;font-weight:700;color:#fff;min-width:0}',
            '.mm-rp-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:' + R.occhiello + 'px;color:#475569;margin:0 0 16px}',
            '.mm-rp-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}',
            '.mm-rp-fila{display:flex;gap:12px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:' + R.risposta + 'px;line-height:1.5;' +
                'page-break-inside:avoid;break-inside:avoid}',
            '.mm-rp-fila:last-child{border-bottom:0}',
            '.mm-rp-anno{font-weight:900;color:' + acc + ';flex:0 0 5ch}',
            '.mm-rp-emoji{display:inline-block;width:1em;height:1em;vertical-align:-0.15em}',
            '.mm-rp-esito{font-weight:700;letter-spacing:.04em;border-radius:999px;padding:1px 9px;text-transform:none}'
        ];
        Object.keys(ESITO).forEach(function (k) {
            var e = ESITO[k];
            css.push('.mm-rp-ris--' + k + '{border-left-color:' + e[0] + ';background:' + e[1] + '}');
            css.push('.mm-rp-ris--' + k + ' .mm-rp-et{color:' + e[2] + '}');
            css.push('.mm-rp-esito--' + k + '{color:' + e[2] + ';background:' + e[1] + ';border:1px solid ' + e[0] + '}');
            css.push('.mm-rp-pill--' + k + ',.mm-rp-seg--' + k + ',.mm-rp-dot--' + k + '{background:' + e[3] + ';color:' + e[4] + '}');
        });
        return css.join('\n');
    }

    /* Le regole di @page: il formato del foglio e il PIÈ, che vive qui dentro.
       Separata da `stile` perché un documento con un formato suo (una griglia da
       ritagliare, un foglio orizzontale) può volere la testata e non queste. */
    function regolePagina(o) {
        o = o || {};
        var p = o.pagina || {};
        var size = p.size || 'A4';
        var margine = p.margine || '15mm 15mm 20mm';
        return '@page { size:' + size + '; margin:' + margine + ';\n' +
            (o.piePagina === false ? '' : pieDichiarazioni(o)) + '\n}';
    }

    /* SOLO i margin-box del piè, senza il blocco @page che li contiene. Serve ai
       documenti che un @page proprio ce l'hanno già e non lo possono cedere: la
       sintesi ha margini suoi (20mm, misurati) e una scala tipografica di stampa
       tutta sua; il dossier ha un piè che deve stare a filo del bordo fisico. A
       quelli si dà il piè da incastrare, non una seconda regola @page che
       entrerebbe in conflitto con la loro. */
    function pieDichiarazioni(o) {
        o = o || {};
        var righe = [];
        /* Sinistra: il logo (se c'è) e il marchio. Il logo DEVE essere già
           piccolo — vedi la nota in testa al file. */
        var sx = [];
        if (o.logo) sx.push('url("' + escCss(o.logo) + '")');
        var marchio = o.brand || _t('dh_brand', 'MappAI · insegnai.ch');
        if (o.mappa) marchio += ' · ' + o.mappa;
        sx.push('"' + escCss(marchio) + '"');
        /* ⚠️ Il piè segue il carattere del DOCUMENTO, non uno scritto qui.
           Fino al 18/8 queste due righe dicevano 'Space Mono' a chiare lettere,
           ed erano le ultime rimaste: si vedevano solo misurando il PDF prodotto
           (pdffonts diceva SpaceMono-Regular su un documento chiesto in TestMe).
           Il motivo per cui non saltavano all'occhio è che sul Mac di Giacomo
           Space Mono È installato: quelle due si risolvevano davvero. Su un
           computer senza, sarebbero uscite in Helvetica. */
        righe.push('  @bottom-left { content: ' + sx.join(' ') + ';');
        righe.push('     font-family:var(--doc-font, \'Space Mono\', monospace); font-size:' + M.pie + 'pt; color:' + COL.piePagina + '; }');

        if (o.numeriPagina !== false) {
            /* «pagina 2 di 7». Il totale conta: senza, chi tiene in mano il
               foglio 2 non sa se ne mancano altri — ed è la ragione per cui
               Giacomo l'ha chiesto. Le due parole passano da _t perché il
               documento è autoconsistente e la stringa ci viene cotta dentro. */
            var pre = _t('dh_pagina', 'pagina');
            var di = _t('dh_di', 'di');
            righe.push('  @bottom-right { content: "' + escCss(pre) + ' " counter(page) " ' + escCss(di) + ' " counter(pages);');
            righe.push('     font-family:var(--doc-font, \'Space Mono\', monospace); font-size:' + M.pie + 'pt; color:' + COL.piePagina + '; }');
        }
        return righe.join('\n');
    }

    // ── LA TESTATA ───────────────────────────────────────────────────────────
    /* d: { titolo, tipo?, mappa?, classe?, materia?, data? (Date|string|già
     *      formattata), badge?, badgeId?, soloSchermo? }
     * `soloSchermo` avvolge la card in `no-print`: serve ai fogli il cui
     * stampato è solo il contenuto (il dossier oggi fa così).
     */
    function testata(d) {
        d = d || {};
        var sotto = [];
        if (d.mappa) sotto.push(esc(d.mappa));
        if (d.tipo) sotto.push(esc(d.tipo));
        /* `data` accetta anche una stringa già pronta: i chiamanti che oggi
           passano `now` non devono riformattarla per forza — ma se passano una
           Date (o niente) esce il formato unico. `data:false` la toglie: senza
           quel valore un foglio non potrebbe NON avere una data, perché
           l'assenza vale «oggi» (ed è il default giusto: tutti e nove i fogli
           storici una data la mostrano). */
        var dt = (d.data === false) ? ''
            : (typeof d.data === 'string' && d.data) ? d.data
                : data(d.data);
        if (dt) sotto.push(esc(dt));

        var chip = [];
        if (d.classe) chip.push('<span class="mm-dh__c mm-dh__c--cls">' + esc(d.classe) + '</span>');
        if (d.materia) chip.push('<span class="mm-dh__c mm-dh__c--mat">' + esc(d.materia) + '</span>');
        /* `badgeId`: il badge di alcuni fogli è VIVO — la timeline lo riscrive
           quando si accende la modalità esercizio, e lo trova per id. Senza
           questo parametro, migrare quel foglio avrebbe spento il contatore
           senza che nulla lo segnalasse. */
        if (d.badge) {
            chip.push('<span class="mm-dh__b"' + (d.badgeId ? ' id="' + esc(d.badgeId) + '"' : '') + '>' +
                esc(d.badge) + '</span>');
        }

        var html = '<div class="mm-dh">' +
            '<h1 class="mm-dh__t">' + esc(d.titolo || '') + '</h1>' +
            (sotto.length ? '<div class="mm-dh__s">' + sotto.join(' · ') + '</div>' : '') +
            (chip.length ? '<div class="mm-dh__r">' + chip.join('') + '</div>' : '') +
            '</div>';
        return d.soloSchermo ? '<div class="no-print">' + html + '</div>' : html;
    }

    // ── IL PIÈ CHE SI VEDE A SCHERMO ─────────────────────────────────────────
    /* I margin-box di @page esistono SOLO in stampa: a schermo — nella finestra
       del documento, nell'anteprima dentro ELABORA — non c'è nessun piè. Questo
       blocco lo rimette, ed è `no-print` perché in stampa il suo mestiere lo fa
       già il margin-box: senza quella classe il piè uscirebbe DUE volte, una in
       fondo al flusso e una in fondo alla pagina.
       Chiude anche le sette stringhe di marchio diverse che i nove fogli si
       erano scritti per conto loro. */
    function pieSchermo(o) {
        o = o || {};
        var parti = [o.brand || _t('dh_brand', 'MappAI · insegnai.ch')];
        if (o.mappa) parti.push(esc(o.mappa));
        var dt = (o.data === false) ? '' : (typeof o.data === 'string' && o.data ? o.data : data(o.data));
        if (dt) parti.push(esc(dt));
        return '<div class="mm-dh-pie no-print">' + parti.join(' · ') + '</div>';
    }

    // ── IL LOGO, RIDOTTO UNA VOLTA SOLA ──────────────────────────────────────
    /* Ritorna una Promise col data-URI del logo a `lato` px (default 24), o ''
       dove non si può fare (Node, nessun canvas, file assente). Il risultato è
       in cache: la riduzione costa una decodifica di un PNG da 1024², e i
       documenti si generano a raffica.
       ⚠️ Non è solo una questione di margin-box: il dossier incorpora oggi il
       PNG INTERO (228 KB → ~300 KB di base64) in ogni file che scrive. */
    var _cacheLogo = {};
    function logoPiccolo(src, lato) {
        lato = lato || M.logo;
        src = src || 'MappAI_icon.png';
        var chiave = src + '@' + lato;
        if (_cacheLogo[chiave]) return _cacheLogo[chiave];
        var p = new Promise(function (risolvi) {
            try {
                if (typeof document === 'undefined' || typeof Image === 'undefined') return risolvi('');
                var img = new Image();
                img.onload = function () {
                    try {
                        var c = document.createElement('canvas');
                        c.width = c.height = lato;
                        c.getContext('2d').drawImage(img, 0, 0, lato, lato);
                        risolvi(c.toDataURL('image/png'));
                    } catch (e) { risolvi(''); }
                };
                img.onerror = function () { risolvi(''); };
                img.src = src;
            } catch (e) { risolvi(''); }
        });
        _cacheLogo[chiave] = p;
        return p;
    }

    // ── CHI È IL DESTINATARIO ────────────────────────────────────────────────
    /* { classe, materia } del CONTESTO ATTIVO, quando il chiamante non le sa.
       Chi genera un documento dentro la pipeline le conosce già (config) e le
       passa: quelle vincono sempre. Chi stampa al volo dalla mappa no, e il
       contesto attivo è l'unica risposta che l'app abbia — la stessa che
       governa in che cartella il file finirà.

       ⚠️⚠️ COL CONTESTO SU UN ALLIEVO LA TESTATA RESTA MUTA — decisione di
       Giacomo dell'11/8/26, per la privacy. Un foglio stampato gira: finisce
       sul banco, nella fotocopiatrice, in una pila sulla cattedra. Il nome
       della classe lì è un'etichetta; il nome di una persona con misure
       compensative è un dato che non deve viaggiare su carta.

       La regola è scritta QUI e non lasciata dedurre. L'app dichiara che classe
       e allievo si escludono (scegliere l'allievo azzera la classe), quindi
       `getActive()` tornerebbe già `null` da sé — ma una decisione sulla privacy
       non si appoggia a un invariante che vive in un altro file e che qualcuno
       potrebbe cambiare per un'altra buona ragione: se un allievo è attivo, si
       esce prima, e basta. Vale anche per la MATERIA, che senza classe resterebbe
       da sola in una testata altrimenti vuota.

       Non pura per forza (legge lo stato dell'app): in Node ritorna vuoto. */
    function contestoAttivo() {
        var vuoto = { classe: '', materia: '' };
        try {
            if (typeof window === 'undefined') return vuoto;
            var CL = window.MappAIClasses;
            if (!CL) return vuoto;
            // La guardia della privacy, per prima e senza scorciatoie.
            try {
                if (CL.activeStudentName && CL.activeStudentName()) return vuoto;
            } catch (e) { return vuoto; }   // nel dubbio non si scrive
            var cls = CL.getActive && CL.getActive();
            if (!cls || !cls.name) return vuoto;
            var mat = '';
            try {
                mat = CL.effectiveDiscipline ? (CL.effectiveDiscipline(cls) || '')
                    : (CL.activeDiscipline ? (CL.activeDiscipline() || '') : '');
            } catch (e) { mat = ''; }
            return { classe: cls.name, materia: mat };
        } catch (e) { return vuoto; }
    }

    /* Scorciatoia per i builder: unisce ciò che il chiamante ha dichiarato col
       contesto attivo, senza che ogni foglio riscriva le stesse tre righe. */
    function conContesto(d) {
        d = d || {};
        if (d.classe && d.materia) return d;
        var c = contestoAttivo();
        var out = {};
        for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
        if (!out.classe) out.classe = c.classe;
        if (!out.materia) out.materia = c.materia;
        return out;
    }

    /* ── LA LINGUA DICHIARATA DEL DOCUMENTO (11/9) ────────────────────────────
       Era «it» fissa in ogni foglio stampabile: su una mappa in inglese una voce
       sintetica legge l'inglese con la pronuncia italiana. Segue la lingua delle
       MAPPE (non quella dell'interfaccia: sono due impostazioni diverse, regola
       14); con «auto» ripiega sulla lingua dei prompt. Sta qui perché qui vive
       tutto l'arredo dei documenti stampabili, e così esiste una definizione
       sola per i quattro fogli che la usano. */
    function lingua() {
        try {
            var g = (typeof window !== 'undefined') ? window : {};
            var l = (typeof g.getMapLanguage === 'function') ? g.getMapLanguage() : 'it';
            if (l === 'it' || l === 'en') return l;
            return (typeof g.getPromptLanguage === 'function' && g.getPromptLanguage() === 'en') ? 'en' : 'it';
        } catch (e) { return 'it'; }
    }

    return {
        lingua: lingua,
        stile: stile,
        stileReport: stileReport,
        REPORT: REPORT,
        regolePagina: regolePagina,
        pieDichiarazioni: pieDichiarazioni,
        testata: testata,
        data: data,
        pieSchermo: pieSchermo,
        contestoAttivo: contestoAttivo,
        conContesto: conContesto,
        logoPiccolo: logoPiccolo,
        esc: esc,
        escCss: escCss,
        MISURE: M,
        COLORI: COL,
        ACCENTO: ACCENTO
    };
}));
