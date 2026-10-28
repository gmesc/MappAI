/*
 * mappai-nodesheet-core.js — modello del FOGLIO DEI NODI editabile
 * -----------------------------------------------------------------------------
 * Core PURO (zero DOM, zero AI, zero jsPDF) dietro l'editor del foglio nodi in
 * ELABORA → Documenti, e dietro le misure del foglio stampato.
 *
 * Perché esiste: fino a qui il foglio nodi era una SCELTA GLOBALE (tutte le card
 * con lo stesso contenuto: solo titolo, oppure titolo + spazio, oppure titolo +
 * parole chiave, oppure titolo + descrizione) decisa in un modale e stampata
 * subito. Il docente non poteva né rivedere né mescolare: una card con le parole
 * chiave e la vicina col solo titolo era impossibile.
 *
 * Qui il foglio diventa un DOCUMENTO: una card per nodo, ognuna col PROPRIO
 * tipo di contenuto, il proprio titolo e (dove serve) le proprie parole chiave o
 * la propria descrizione. La resa resta quella del builder di stampa
 * (printAllNodeLabels in mappai-print-dossier.js), che legge queste card: schermo,
 * PDF e vault non possono divergere.
 *
 * Contiene:
 *  - la GEOMETRIA del foglio (A4 orizzontale, margini, griglia per formato e
 *    corpi del testo): è la stessa che disegna il PDF, in un posto solo;
 *  - le SOGLIE DI CARATTERI per titolo, parole chiave e descrizione, ricavate
 *    dalla geometria → il badge ambra dell'editor dice quando il testo non entra
 *    davvero nella card stampata;
 *  - il modello delle card e le operazioni immutabili (tipo di contenuto,
 *    parole chiave, ordine), più la sincronizzazione con i nodi della mappa.
 *
 * UMD: window.MappAINodeSheet (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAINodeSheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function _s(v) { return String(v == null ? '' : v); }
    function _trim(v) { return _s(v).trim(); }
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }

    var PT2MM = 0.352778;
    /* Larghezza di un carattere in em. Space Mono è monospazio (0,612 misurato)
       ed è il default; dal 18/8 il carattere si può cambiare, e chi lo conosce
       (mappai-font.js) annuncia la misura con `setFontMetrics`. Le soglie di
       questo foglio — quanti caratteri entrano nel titolo di una card, quante
       parole chiave ci stanno sotto — dipendono da qui: senza l'annuncio, con
       un carattere più stretto il badge ambra direbbe «non entra» a un testo
       che entra benissimo. */
    var ADVANCE_BASE = 0.612;
    var _adv = ADVANCE_BASE;
    function setFontMetrics(m) { _adv = (m && m.advance > 0) ? m.advance : ADVANCE_BASE; }
    function fontMetrics() { return { advance: _adv }; }

    // ── 1. GEOMETRIA ────────────────────────────────────────────────────────
    // A4 ORIZZONTALE con margini 10/15 mm: sono le misure storiche del foglio
    // nodi. Il foglio flashcard ha misure proprie (mappai-print-layout.js) e non
    // condivide nulla con questo, di proposito.
    var PAGE = { w: 297, h: 210, marginX: 10, marginY: 15 };

    // padX = margine laterale del testo dentro la card · anchorTop = quanto in
    // basso parte il titolo quando la card ha un contenuto sotto (nel layout
    // «solo titolo» il titolo è invece centrato in verticale).
    var PAD = { x: 4, anchorTop: 8, cardX: 4, cardTop: 4, cardBottom: 4, kwGap: 3, descGap: 1.5 };

    // Corpi del testo per formato (pt) e interlinee. Card più grande = testo più
    // grande: sono i numeri con cui il PDF disegna davvero.
    var FMT = {
        '3x4': { cols: 3, rows: 4, titlePt: 22, kwPt: 12, descPt: 11, cardTitlePt: 20, titleOnly: true },
        /* 0128 (Giacomo, 27/10, sul mockup dei corpi: «+3 nel 2×1, +2 nel 2×2»): descrizioni e parole
           chiave più grandi; erano 11/13 nel 2×2 e 13/15 nel 2×1 */
        '2x2': { cols: 2, rows: 2, titlePt: 28, kwPt: 15, descPt: 13, cardTitlePt: 20 },
        '2x1': { cols: 2, rows: 1, titlePt: 32, kwPt: 18, descPt: 16, cardTitlePt: 24 }
    };
    var LINE = { title: 1.3, titleTop: 1.25, kw: 1.55, cardTitle: 1.2, desc: 1.4 };
    /* Il passo di riga della DESCRIZIONE è fisso, non un multiplo del corpo (0122, lotto 3;
       Giacomo sul banco del Foglio, 22/10: «prova interlinea 24px» → «Scelgo la E: interlinea
       24 px fissa, a sinistra»): 24 px a 96 dpi = 18 pt = 6,35 mm, in tutti i formati. Lo leggono
       la capacità (qui), l'editor (in frazione di card) e il PDF. `LINE.desc` resta per chi lo
       legge ancora, ma la descrizione non lo usa più. */
    var DESC_LINE_MM = 6.35;
    /* L'interlinea e lo spazio fra le parole della descrizione (0128, allargamento 1: Giacomo,
       «una spaziatura tra parole che renda facile la lettura»). `DESC_LINE_K` è l'interlinea
       minima in frazione del corpo: il passo è il più largo fra quello fisso e corpo × K, così un
       corpo grande (13 pt del 2×1) non sta più stretto del 2×2. `DESC_WORD_EM` è lo spazio IN PIÙ
       fra le parole, in em. A 0 tutti e due, il passo fisso dello 0122 e lo spazio del carattere. */
    var DESC_LINE_K = 1.6;
    var DESC_WORD_EM = 0.25;
    /* L'INTERLINEA SCELTA DAL DOCENTE (0128, allargamento 5; Giacomo, 27/10, al gate: «vedo i controlli per le
       impostazioni del carattere di keyword e descrizioni, aggiungi anche l'opzione per l'interlinea»). Vale per la
       descrizione, in tutti i formati che la hanno, fra 1,2 e 2 volte il corpo. Scelta, il passo è corpo × interlinea,
       senza il minimo fisso dei 6,35 mm: a 11 pt un'interlinea più stretta deve vedersi. Sta nel computer del docente
       (localStorage); assente = il passo di serie. */
    var INTERLINEA_KEY = 'mappai_nodi_interlinea', INTERLINEA_MIN = 1.2, INTERLINEA_MAX = 2, _interlMem = null;
    function interlinea() {
        var v = null;
        try { v = (typeof localStorage !== 'undefined') ? localStorage.getItem(INTERLINEA_KEY) : _interlMem; } catch (e) { v = _interlMem; }
        var n = Number(v);
        return (v != null && v !== '' && isFinite(n) && n > 0) ? Math.max(INTERLINEA_MIN, Math.min(INTERLINEA_MAX, Math.round(n * 10) / 10)) : null;
    }
    function setInterlinea(k) {
        var v = (k == null) ? null : String(Math.max(INTERLINEA_MIN, Math.min(INTERLINEA_MAX, Math.round((Number(k) || DESC_LINE_K) * 10) / 10)));
        _interlMem = v;
        try {
            if (typeof localStorage !== 'undefined') { if (v == null) localStorage.removeItem(INTERLINEA_KEY); else localStorage.setItem(INTERLINEA_KEY, v); }
        } catch (e) { }
        return interlinea();
    }
    function descPasso(pt) {
        var k = interlinea();
        return k ? k * (pt || 0) * PT2MM : Math.max(DESC_LINE_MM, DESC_LINE_K * (pt || 0) * PT2MM);
    }

    // Tipi di contenuto della card. `title` = solo il nome del nodo, centrato:
    // è il default, ed è l'unico ammesso dal formato 3×4 (card troppo piccola).
    var LAYOUTS = ['title', 'summary', 'keywords', 'card'];
    var MAX_KEYWORDS = 7;        // oltre non entrano nella card, in nessun formato
    var MAX_TITLE_LINES = 3;     // il motore di stampa taglia lì quando c'è contenuto sotto

    function fmtOf(v) { return FMT[_s(v)] ? _s(v) : '2x2'; }
    function layoutOf(v) { return LAYOUTS.indexOf(_s(v)) >= 0 ? _s(v) : 'title'; }
    /** Il formato ammette contenuto sotto il titolo? (3×4 no: card troppo piccola) */
    function allowsContent(fmt) { return !FMT[fmtOf(fmt)].titleOnly; }

    /** Misure della card e corpi del testo per un formato. */
    /* I CORPI SCELTI DAL DOCENTE (0128, allargamento 3; Giacomo, 27/10: «nell'editor se serve inserisci la
       modifica della dimensione del font per aiutare il docente a ottimizzare dimensioni e testi»). Per il 2×2 e
       il 2×1: il corpo delle descrizioni e delle parole chiave, fra 11 e 20 pt. Lo legge `geom`, quindi lo seguono
       la capacità (le soglie dell'editor), l'anteprima e il PDF. Sta nel computer del docente (localStorage);
       assente = i corpi di FMT. */
    var CORPI_KEY = 'mappai_nodi_corpi', _corpiMem = null;
    function _limita(n) { n = Number(n); return isFinite(n) && n > 0 ? Math.max(11, Math.min(20, n)) : null; }
    function corpi() {
        var raw = null;
        try { raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(CORPI_KEY) : _corpiMem; } catch (e) { raw = _corpiMem; }
        var o = {};
        try { o = raw ? JSON.parse(raw) : {}; } catch (e) { o = {}; }
        var out = {};
        ['2x2', '2x1'].forEach(function (k) {
            var c = o && o[k];
            if (!c) return;
            var d = _limita(c.desc), w = _limita(c.kw);
            if (d || w) out[k] = { desc: d, kw: w };
        });
        return out;
    }
    function setCorpi(o) {
        var v = o ? JSON.stringify(o) : null;
        _corpiMem = v;
        try {
            if (typeof localStorage !== 'undefined') { if (v == null) localStorage.removeItem(CORPI_KEY); else localStorage.setItem(CORPI_KEY, v); }
        } catch (e) { }
        return corpi();
    }

    function geom(fmt) {
        var f = FMT[fmtOf(fmt)];
        var cs = corpi()[fmtOf(fmt)] || {};
        return {
            fmt: fmtOf(fmt),
            cols: f.cols, rows: f.rows, perPage: f.cols * f.rows,
            pageW: PAGE.w, pageH: PAGE.h, marginX: PAGE.marginX, marginY: PAGE.marginY,
            cardW: (PAGE.w - 2 * PAGE.marginX) / f.cols,
            cardH: (PAGE.h - 2 * PAGE.marginY) / f.rows,
            padX: PAD.x,
            titlePt: f.titlePt, kwPt: cs.kw || f.kwPt, descPt: cs.desc || f.descPt, cardTitlePt: f.cardTitlePt,
            titleOnly: !!f.titleOnly,
            PT2MM: PT2MM, advance: _adv
        };
    }

    /** Numero di pagine del foglio, dato il numero di card. */
    function pages(nCards, fmt) {
        var g = geom(fmt);
        return Math.ceil(Math.max(0, nCards || 0) / g.perPage);
    }

    function charsPerLine(widthMm, pt) {
        return Math.max(1, Math.floor(widthMm / (_adv * pt * PT2MM)));
    }
    /** Righe occupate da un testo con a-capo sulle parole (parole lunghe spezzate). */
    function lineCount(text, cpl) {
        var s = _s(text).replace(/\s+/g, ' ').trim();
        if (!s) return 0;
        var words = s.split(' ');
        var lines = 1, len = 0;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.length > cpl) {
                if (len > 0) { lines++; len = 0; }
                var chunks = Math.ceil(w.length / cpl);
                lines += chunks - 1;
                len = w.length - (chunks - 1) * cpl;
                continue;
            }
            var need = (len === 0) ? w.length : len + 1 + w.length;
            if (need > cpl) { lines++; len = w.length; }
            else len = need;
        }
        return lines;
    }
    function blockH(nLines, pt, lineH) { return nLines * pt * PT2MM * lineH; }

    /**
     * SOGLIE DI CARATTERI della card, ricavate dalla geometria: è la regola che
     * l'editor mostra al docente (badge ambra) e che dice perché una card troppo
     * lunga esce tagliata dalla stampante.
     *
     * Ritorna { title, titleLines, titleCpl, keyword, keywords, keywordCpl,
     *           desc, descLines, descCpl }.
     * `keywords` = quante parole chiave entrano davvero sotto quel titolo.
     */
    function charLimits(fmt, layout, titleText) {
        var g = geom(fmt);
        var lay = layoutOf(layout);
        if (g.titleOnly) lay = 'title';
        var innerW = g.cardW - 2 * g.padX;
        var waste = 0.9;   // spazio perso dall'a-capo sulle parole
        var round10 = function (n) { return Math.max(10, Math.floor(n / 10) * 10); };

        if (lay === 'title') {
            // Titolo centrato: ha tutta la card.
            var cpl0 = charsPerLine(innerW, g.titlePt);
            var lines0 = Math.max(1, Math.floor((g.cardH - 2 * PAD.cardTop) / (g.titlePt * PT2MM * LINE.title)));
            return {
                title: round10(lines0 * cpl0 * waste), titleLines: lines0, titleCpl: cpl0,
                keyword: 0, keywords: 0, keywordCpl: 0, desc: 0, descLines: 0, descCpl: 0
            };
        }

        if (lay === 'card') {
            // Scheda: titolo compatto in alto (max 3 righe) + descrizione sotto.
            var boxW = g.cardW - 2 * PAD.cardX;
            var tCpl = charsPerLine(boxW, g.cardTitlePt);
            var tUsed = Math.min(MAX_TITLE_LINES, Math.max(1, lineCount(titleText, tCpl) || 1));
            var titleH = PAD.cardTop + blockH(tUsed, g.cardTitlePt, LINE.cardTitle) + PAD.descGap;
            var dAvail = g.cardH - titleH - PAD.cardBottom;
            var dStep = descPasso(g.descPt);   /* passo fisso dello 0122 (lotto 3), o corpo × K (0128) */
            var dLines = Math.max(0, Math.floor(dAvail / dStep));
            /* lo spazio in più fra le parole toglie caratteri alla riga: uno spazio ogni sei caratteri */
            var dCpl = Math.max(1, Math.floor(boxW / ((_adv + DESC_WORD_EM / 6) * g.descPt * PT2MM)));
            return {
                title: round10(MAX_TITLE_LINES * tCpl * waste), titleLines: MAX_TITLE_LINES, titleCpl: tCpl,
                keyword: 0, keywords: 0, keywordCpl: 0,
                desc: round10(dLines * dCpl * waste), descLines: dLines, descCpl: dCpl
            };
        }

        // «summary» (spazio da scrivere a mano) e «keywords»: titolo ancorato in
        // alto, max 3 righe; sotto restano le righe libere.
        var cpl = charsPerLine(innerW, g.titlePt);
        var used = Math.min(MAX_TITLE_LINES, Math.max(1, lineCount(titleText, cpl) || 1));
        var headH = PAD.anchorTop + blockH(used, g.titlePt, LINE.titleTop) + PAD.kwGap;
        var kwStep = g.kwPt * PT2MM * LINE.kw;
        var kwLines = Math.max(0, Math.floor((g.cardH - headH - PAD.cardBottom) / kwStep));
        var kwCpl = charsPerLine(innerW, g.kwPt);
        return {
            title: round10(MAX_TITLE_LINES * cpl * waste), titleLines: MAX_TITLE_LINES, titleCpl: cpl,
            keyword: kwCpl, keywords: Math.min(MAX_KEYWORDS, kwLines), keywordCpl: kwCpl,
            desc: 0, descLines: 0, descCpl: 0
        };
    }

    // ── 2. MODELLO DELLA CARD ───────────────────────────────────────────────
    // Una card per nodo: { id, label, layout, keywords[], desc }.
    // `layout` è PER CARD — è la differenza con il foglio storico, dove il tipo
    // di contenuto valeva per tutte.

    /**
     * Parole chiave ripulite. Le stringhe VUOTE restano: sono la riga appena
     * aggiunta che il docente sta per scrivere — filtrarle qui la farebbe sparire
     * sotto le dita alla prima modifica. Escono di scena alla stampa
     * (toPrintCards) e nei controlli.
     */
    function normKeywords(arr) {
        return (Array.isArray(arr) ? arr : [])
            .map(function (k) { return _trim(k).replace(/\s+/g, ' '); })
            .slice(0, MAX_KEYWORDS);
    }
    /** Solo le parole chiave che finiscono davvero sulla card. */
    function filledKeywords(arr) { return normKeywords(arr).filter(Boolean); }

    function normCard(c) {
        c = c || {};
        return {
            id: _s(c.id),
            label: _trim(c.label).replace(/\s+/g, ' '),
            layout: layoutOf(c.layout),
            keywords: normKeywords(c.keywords),
            desc: _s(c.desc).replace(/\s+/g, ' ').trim()
        };
    }

    /** Nodo della mappa → card. `layout` di default = solo titolo. */
    function cardFromNode(node, layout, extra) {
        node = node || {};
        extra = extra || {};
        return normCard({
            id: node.id,
            label: extra.label != null ? extra.label : node.label,
            layout: layout,
            keywords: extra.keywords || [],
            desc: extra.desc != null ? extra.desc : ''
        });
    }

    /**
     * Documento foglio nodi a partire dai nodi della mappa.
     * opts: { fmt, layout, bg, depth, title, keywords:{nodeId:[…]}, descs:{nodeId:'…'} }
     */
    function docFromNodes(nodes, opts) {
        opts = opts || {};
        var fmt = fmtOf(opts.fmt);
        var lay = allowsContent(fmt) ? layoutOf(opts.layout) : 'title';
        var kw = opts.keywords || {};
        var ds = opts.descs || {};
        return {
            kind: 'nodesheet',
            id: _s(opts.id || 'nodesheet'),
            title: _s(opts.title || ''),
            fmt: fmt,
            bg: (opts.bg === 'grid') ? 'grid' : 'none',
            depth: (opts.depth == null || opts.depth === 'all') ? 'all' : opts.depth,
            cards: (nodes || []).map(function (n) {
                return cardFromNode(n, lay, { keywords: kw[n && n.id], desc: ds[n && n.id] });
            }),
            rev: 0
        };
    }

    /** Documento salvato (progetto) → forma normalizzata, tollerante ai campi mancanti. */
    function normDoc(doc) {
        doc = doc || {};
        var fmt = fmtOf(doc.fmt);
        var cards = (Array.isArray(doc.cards) ? doc.cards : []).map(normCard);
        if (!allowsContent(fmt)) cards = cards.map(function (c) { c.layout = 'title'; return c; });
        return {
            kind: 'nodesheet',
            id: _s(doc.id || 'nodesheet'),
            title: _s(doc.title || ''),
            fmt: fmt,
            bg: (doc.bg === 'grid') ? 'grid' : 'none',
            depth: (doc.depth == null || doc.depth === 'all') ? 'all' : doc.depth,
            cards: cards,
            rev: (typeof doc.rev === 'number') ? doc.rev : 0
        };
    }

    /**
     * Riallinea le card ai nodi ATTUALI della mappa: le card esistenti restano
     * (con il loro tipo di contenuto e i testi del docente), i nodi nuovi
     * arrivano in coda col solo titolo, le card di nodi spariti se ne vanno.
     * Il titolo NON viene riscritto: se il docente l'ha accorciato per farlo
     * stare nella card, riscriverlo dal nodo vanificherebbe il suo lavoro.
     * `opts.exclude` = id delle card tolte a mano dal foglio: non tornano da sole
     * al riallineamento (altrimenti «togli card» durerebbe fino alla riapertura).
     * Ritorna { cards, added, removed }.
     */
    function syncCards(cards, nodes, opts) {
        opts = opts || {};
        var byId = {};
        (Array.isArray(cards) ? cards : []).forEach(function (c) {
            var n = normCard(c);
            if (n.id) byId[n.id] = n;
        });
        var ex = {};
        (opts.exclude || []).forEach(function (id) { ex[_s(id)] = 1; });
        var out = [], added = 0, seen = {};
        (nodes || []).forEach(function (n) {
            var id = _s(n && n.id);
            if (!id || seen[id]) return;
            seen[id] = 1;
            if (byId[id]) { out.push(byId[id]); return; }
            if (ex[id]) return;                       // tolta dal docente: resta fuori
            out.push(cardFromNode(n, opts.layout || 'title'));
            added++;
        });
        var removed = Object.keys(byId).filter(function (id) { return !seen[id]; }).length;
        return { cards: out, added: added, removed: removed };
    }

    // ── 3. operazioni immutabili ────────────────────────────────────────────
    function insertAt(cards, index, card) {
        var arr = (cards || []).slice();
        var i = Math.max(0, Math.min(arr.length, index == null ? arr.length : index));
        arr.splice(i, 0, normCard(card));
        return arr;
    }
    function removeAt(cards, index) {
        var arr = (cards || []).slice();
        if (index < 0 || index >= arr.length) return arr;
        arr.splice(index, 1);
        return arr;
    }
    function moveCard(cards, from, to) {
        var arr = (cards || []).slice();
        if (from < 0 || from >= arr.length) return arr;
        var t = Math.max(0, Math.min(arr.length - 1, to));
        var c = arr.splice(from, 1)[0];
        arr.splice(t, 0, c);
        return arr;
    }

    /**
     * Cambia il tipo di contenuto di UNA card. È il gesto del bottone «+»: la
     * card passa da «solo titolo» a «titolo + qualcosa» e nella resa il titolo
     * smette di essere centrato e sale in alto (lo fa il motore di stampa: qui
     * cambia solo il tipo). `prefill` riempie il campo nuovo se è ancora vuoto.
     */
    function setLayout(cards, index, layout, prefill) {
        var arr = (cards || []).map(normCard);
        if (index < 0 || index >= arr.length) return arr;
        var lay = layoutOf(layout);
        var c = arr[index];
        c.layout = lay;
        if (prefill) {
            if (lay === 'keywords' && !c.keywords.length && prefill.keywords) c.keywords = normKeywords(prefill.keywords);
            if (lay === 'card' && !c.desc && prefill.desc) c.desc = _s(prefill.desc).replace(/\s+/g, ' ').trim();
        }
        arr[index] = c;
        return arr;
    }

    /** path: 'label' | 'desc' */
    function setField(cards, index, path, value) {
        var arr = (cards || []).map(normCard);
        if (index < 0 || index >= arr.length) return arr;
        if (path === 'label' || path === 'desc') arr[index][path] = _s(value).replace(/\s+/g, ' ').trim();
        return arr;
    }

    function addKeyword(cards, index, text) {
        var arr = (cards || []).map(normCard);
        if (index < 0 || index >= arr.length) return arr;
        if (arr[index].keywords.length >= MAX_KEYWORDS) return arr;
        arr[index].keywords = arr[index].keywords.concat([_trim(text)]);
        return arr;
    }
    function setKeyword(cards, index, ki, text) {
        var arr = (cards || []).map(normCard);
        if (index < 0 || index >= arr.length) return arr;
        var k = arr[index].keywords.slice();
        if (ki < 0 || ki >= k.length) return arr;
        k[ki] = _s(text).replace(/\s+/g, ' ').trim();
        arr[index].keywords = k;
        return arr;
    }
    function removeKeyword(cards, index, ki) {
        var arr = (cards || []).map(normCard);
        if (index < 0 || index >= arr.length) return arr;
        var k = arr[index].keywords;
        if (ki < 0 || ki >= k.length) return arr;
        arr[index].keywords = k.slice(0, ki).concat(k.slice(ki + 1));
        return arr;
    }

    /** Cambia il formato del foglio: in 3×4 le card tornano tutte «solo titolo». */
    function setFmt(doc, fmt) {
        var out = normDoc(doc);
        out.fmt = fmtOf(fmt);
        if (!allowsContent(out.fmt)) out.cards = out.cards.map(function (c) { c.layout = 'title'; return c; });
        return out;
    }

    /** Applica lo stesso tipo di contenuto a TUTTE le card (comodo per ripartire). */
    /* ── QUALI CARD TOCCA L'AI DELLE PAROLE CHIAVE ───────────────────────────
       `vuote` = card «parole chiave» senza nemmeno una parola scritta: sono i
       buchi, e riempirle non toglie niente a nessuno. `conKw` = tutte quelle
       con quel contenuto, che è ciò che si riscrive quando di buchi non ce ne
       sono — ed è il caso NORMALE, perché dare quel contenuto a una card la
       riempie subito col ripiego deterministico.
       ⚠️ È la regola che il bottone «Parole chiave con AI» sbagliava fino al
       19/8: guardava solo `vuote`, che è quasi sempre lista vuota (trappola 27,
       una condizione falsa per costruzione), e rispondeva «niente da fare». */
    function keywordTargets(cards) {
        var arr = (cards || []).map(normCard);
        var conKw = [], vuote = [];
        arr.forEach(function (c, i) {
            if (c.layout !== 'keywords') return;
            conKw.push(i);
            if (!filledKeywords(c.keywords).length) vuote.push(i);
        });
        return { conKw: conKw, vuote: vuote };
    }

    function setAllLayouts(cards, layout, prefill) {
        var arr = (cards || []).map(normCard);
        for (var i = 0; i < arr.length; i++) {
            arr = setLayout(arr, i, layout, prefill ? prefill(arr[i], i) : null);
        }
        return arr;
    }

    // ── 4. controlli ────────────────────────────────────────────────────────
    /**
     * Campi di UNA card che non entrano nella card stampata (badge ambra).
     * Ritorna [] se sta tutto dentro; altrimenti ['title'|'keywords'|'desc'…].
     */
    function overFields(card, fmt) {
        var c = normCard(card);
        var L = charLimits(fmt, c.layout, c.label);
        var out = [];
        if (c.label.length > L.title) out.push('title');
        if (c.layout === 'keywords') {
            var kw = filledKeywords(c.keywords);
            if (kw.length > L.keywords) out.push('keywords');
            else if (kw.some(function (k) { return k.length > L.keyword; })) out.push('keywords');
        }
        if (c.layout === 'card' && c.desc.length > L.desc) out.push('desc');
        return out;
    }
    /** Tutte le card fuori soglia: [{ i, fields }]. */
    function overCards(cards, fmt) {
        var out = [];
        (cards || []).forEach(function (c, i) {
            var f = overFields(c, fmt);
            if (f.length) out.push({ i: i, fields: f });
        });
        return out;
    }

    /** Problemi che rendono il foglio inutilizzabile (mostrati, mai bloccanti). */
    function validateDoc(doc) {
        var d = normDoc(doc);
        var out = [];
        if (!d.cards.length) out.push({ index: -1, code: 'empty', msg: 'Nessuna card nel foglio.' });
        d.cards.forEach(function (c, i) {
            if (!c.label) out.push({ index: i, code: 'no-title', msg: 'Card ' + (i + 1) + ': titolo vuoto.' });
            if (c.layout === 'keywords' && !filledKeywords(c.keywords).length) {
                out.push({ index: i, code: 'no-keywords', msg: 'Card ' + (i + 1) + ': nessuna parola chiave (esce col solo titolo).' });
            }
            if (c.layout === 'card' && !c.desc) {
                out.push({ index: i, code: 'no-desc', msg: 'Card ' + (i + 1) + ': descrizione vuota (esce col solo titolo).' });
            }
        });
        return out;
    }

    /**
     * Card pronte per il motore di stampa: stesse chiavi, testi ripuliti, e i
     * campi che il tipo di contenuto non usa azzerati (una card «solo titolo»
     * non deve portarsi dietro parole chiave invisibili).
     */
    function toPrintCards(doc) {
        var d = normDoc(doc);
        return d.cards.map(function (c) {
            return {
                id: c.id,
                label: c.label,
                layout: c.layout,
                keywords: c.layout === 'keywords' ? filledKeywords(c.keywords) : [],
                desc: c.layout === 'card' ? c.desc : ''
            };
        });
    }

    /** Quante card per tipo di contenuto (riepilogo per la barra dell'editor). */
    function countsByLayout(cards) {
        var out = { title: 0, summary: 0, keywords: 0, card: 0 };
        (cards || []).forEach(function (c) { out[layoutOf(c && c.layout)]++; });
        return out;
    }

    return {
        // geometria e soglie
        PT2MM: PT2MM, ADVANCE: ADVANCE_BASE, setFontMetrics: setFontMetrics, fontMetrics: fontMetrics, PAGE: PAGE, PAD: PAD, FMT: FMT, LINE: LINE,
        DESC_LINE_MM: DESC_LINE_MM, DESC_LINE_K: DESC_LINE_K, DESC_WORD_EM: DESC_WORD_EM, descPasso: descPasso,
        corpi: corpi, setCorpi: setCorpi, interlinea: interlinea, setInterlinea: setInterlinea,
        LAYOUTS: LAYOUTS, MAX_KEYWORDS: MAX_KEYWORDS, MAX_TITLE_LINES: MAX_TITLE_LINES,
        fmtOf: fmtOf, layoutOf: layoutOf, allowsContent: allowsContent, geom: geom, pages: pages,
        charsPerLine: charsPerLine, lineCount: lineCount, charLimits: charLimits,
        // modello
        normCard: normCard, normKeywords: normKeywords, filledKeywords: filledKeywords, cardFromNode: cardFromNode,
        docFromNodes: docFromNodes, normDoc: normDoc, syncCards: syncCards,
        // operazioni
        insertAt: insertAt, removeAt: removeAt, moveCard: moveCard, setLayout: setLayout,
        setField: setField, addKeyword: addKeyword, setKeyword: setKeyword, removeKeyword: removeKeyword,
        setFmt: setFmt, setAllLayouts: setAllLayouts, keywordTargets: keywordTargets,
        // controlli
        overFields: overFields, overCards: overCards, validateDoc: validateDoc,
        toPrintCards: toPrintCards, countsByLayout: countsByLayout
    };
});
