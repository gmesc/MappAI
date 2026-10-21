/* =========================================================================
   mappai-figure-core.js — LA LETTURA DELLE FIGURE DEI PDF, le regole (ADR 0024, packet 0113, lotto 2)

   Una scheda PDF ha spesso del testo che è in verità un'immagine: lo schema
   delle investiture, le didascalie di una foto, un documento fotografato, le
   formule spezzate di una pagina di matematica. Quando un PDF entra in CREA
   le sue figure si RITAGLIANO, uno SMISTAMENTO locale e gratuito decide
   quante chiamate costa ogni ritaglio (0, 1 o 2), due letture svizzere
   (Gemma titolare, Qwen controllo) si CONFRONTANO RIGA PER RIGA e il testo
   verde e giallo entra nella pagina fra marcatori, col giallo segnato; il
   rosso resta fuori finché il docente non lo guarda in ELABORA.

   Qui stanno SOLO le decisioni (invariante 4): stati di pagina, soglie,
   fusione, tetto, riconoscitore delle formule spezzate (R-D), smistamento,
   coda del prompt, lettore delle risposte, pulizia (R7), accordo (R5), stato
   (R1, R0), marcatori e segni, innesto delle formule, identità, scelta dei
   modelli, stima, payload e schema del `.figure.json`. Il modulo
   (`mappai-figure.js`, lotto 3) MISURA e CHIAMA: disegna i ritagli sul
   canvas, fa girare Tesseract, conta i colori, manda le immagini; non
   decide nulla. Le soglie vivono solo qui, come costanti con nome: i numeri
   vengono dal banco (`banco-figure-4.js`, tornata 4 del 17/10/2026) e dalla
   misura riga per riga del 18/10.

   Logica pura: niente DOM, niente `window`, niente rete, niente memoria del
   browser (l'interruttore lo legge il modulo e lo passa ad `attiva`). Si
   prova in Node (`tests/figure-core.test.js`).
   ========================================================================= */
(function (root, factory) {
    var CORE = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (root) root.MappAIFigureCore = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var VERSIONE = '0113-lotto7';

    /* i18n nei moduli provati in Node: mai `window.t` diretto (invariante 14). Qui nessuna
       chiave nuova: i testi del core (legenda, note, riga della stima) sono costanti in due
       lingue scelte con `opz.lingua`; le chiavi dei dizionari arrivano col lotto 6. */
    function _tSafe(k, f) {
        try {
            var w = typeof globalThis !== 'undefined' ? globalThis : null;
            if (w && typeof w.t === 'function' && w.document) return w.t(k, f);
        } catch (e) { /* in Node non esiste: resta l'italiano */ }
        return f;
    }

    /* ── LE SOGLIE, tutte qui (ADR 0024 §5.2-5.6, §6) ───────────────────────────
       Misurate sul banco: 9 PDF, 114 pagine, 23 ritagli nati digitali e di
       formule, 65 foto. Provvisorie quelle dello smistamento (0,70, 3 sequenze,
       90 %): si rivedono al gate 3 e sull'insieme di prova separato (§7). */
    var SOGLIE = {
        AREA_MIN_PCT: 4,            // un'immagine si tiene se copre almeno il 4 % della pagina; nessuna clausola sui pixel
        FUSIONE_PT: 2,              // immagini che si toccano o si sovrappongono (≤ 2 pt) si fondono (Word spezza a strisce)
        MARGINE_PCT: 3,             // margine per lato del ritaglio, tagliato dove c'è testo tipografico
        TETTO_RITAGLI: 6,           // per pagina, contati SOLO i ritagli che costano chiamate
        PPI_MIN: 110, PPI_MAX: 220, // risoluzione nativa per asse, limitata
        MAX_BYTE: 1200 * 1024,      // limite del gateway Infomaniak sul base64
        QUALITA_INIZIO: 85, QUALITA_MIN: 65, QUALITA_PASSO: 10, SCALA_RIDUZIONE: 0.85, TENTATIVI_MAX: 6,
        SCANSIONE_CAR: 50,          // lettere e cifre sotto cui la pagina può essere una scansione…
        SCANSIONE_AREA_PCT: 60,     // …se un'immagine (fusa) copre almeno il 60 %…
        SCANSIONE_QUOTA_PDF: 0.5,   // …e solo se almeno metà delle pagine del PDF sono così
        TESTO_IMMAGINI_N: 20, TESTO_IMMAGINI_H_PT: 20, TESTO_IMMAGINI_CAR: 300, // il corpo del testo fatto di immagini
        TESTO_IMMAGINI_FUSIONE_PT: 6, TESTO_IMMAGINI_BLOCCO_PT: 14,          // righe-immagine → blocchi di paragrafo
        FORMULE_CAR_MIN: 20,        // sotto non si cercano formule spezzate
        TINTE_PIATTE: 0.70,         // quota degli 8 colori più frequenti: sotto è una foto, da qui in su un disegno
        /* Parole piene NUOVE di Tesseract che mandano un ritaglio in «testo» (2 chiamate insieme). Misurata nel packet 0114 col
           Tesseract WASM dell'app su 76 ritagli del banco: con 2 sei foto in più vanno a una chiamata, ma tre carte del GEO con
           testo scendono a «foto»; la confidenza media non separa (testo vero a 49, rumore fino a 58). Giacomo, 20/10: «regola
           di oggi». Errore nella direzione sicura: una foto con una parola di rumore paga 2 chiamate. */
        PAROLE_NUOVE: 1,
        DOPPIONE_SEQUENZE: 3,       // sequenze di tre parole piene di Tesseract…
        DOPPIONE_QUOTA: 0.90,       // …di cui il 90 % già nel tipografico della pagina
        PAROLA_PIENA: 4,            // lettere da cui una parola «pesa»
        R5_RIGA_ORDINE: 0.80,       // parole in ordine fra la riga del titolare e quella del controllo
        R5_CONTENUTA: 0.90,         // oppure contenuta in una riga del controllo lunga almeno il doppio
        R5_CONTENUTA_LUNGHEZZA: 2,
        R5_FINESTRA_MAX: 3,         // righe consecutive del controllo prese insieme (2 o 3: freccia, frase, freccia sola in mezzo; rev. 1, punto 2)
        R5_FORMULE_PCT: 95,         // accordo sugli atomi di formula sotto cui la regione è gialla
        R5_ROSSO_PCT: 50,           // accordo complessivo sotto cui il ritaglio è rosso
        R1_QUOTA_PCT: 40,           // risposta con meno del 40 % delle parole di Tesseract → rosso…
        R1_TESSERACT_MIN: 8,        // …se Tesseract ne legge almeno 8 (non sulle formule)
        TEMPERATURA: 0, TOKEN_USCITA: 2048, ATTESA_MS: 60000, CHIAMATE_IN_VOLO: 3,
        TOK_PROMPT: 130, TOK_IMG_TITOLARE: 280, TOK_IMG_CONTROLLO: 780, TOK_USCITA: 220, TOK_USCITA_FOTO: 120, TOK_USCITA_FORMULE: 250
    };

    var MODELLI = {
        TITOLARE: 'google/gemma-4-31B-it',
        CONTROLLO: 'Qwen/Qwen3.5-122B-A10B-FP8',
        GOOGLE: 'gemini-4-argon',
        TENDINA_PREDEFINITO: 'Qwen/Qwen3.5-122B-A10B-FP8'
    };

    /* Il segno in linea attorno alla sola parte gialla, e la legenda che lo spiega
       al modello della generazione (bivio E1: la riga sta NEL TESTO, in testa al
       blocco della pagina, così arriva a tutte le fasi anche con un override). */
    var SEGNO_APRE = '⟦da controllare: ', SEGNO_CHIUDE = '⟧';
    var LEGENDA = {
        it: '⟦da controllare: …⟧ = testo letto da un\'immagine, incerto: usalo solo se il resto della fonte lo conferma.',
        en: '⟦da controllare: …⟧ = text read from an image, uncertain: use it only if the rest of the source confirms it.'
    };
    var MARC = {
        it: { figure: ['[Figure della pagina N]', '[/Figure]'], testoImmagini: ['[Testo a immagini della pagina N, OCR locale]', '[/Testo a immagini]'], formule: ['[Formule della pagina N]', '[/Formule]'] },
        en: { figure: ['[Figures of page N]', '[/Figures]'], testoImmagini: ['[Text as images of page N, local OCR]', '[/Text as images]'], formule: ['[Formulas of page N]', '[/Formulas]'] }
    };

    /* ── parole e normalizzazione (come nel banco) ─────────────────────────── */
    function norm(s) {
        return String(s || '')
            .replace(/[①②③④⑤]/g, function (c) { return String('①②③④⑤'.indexOf(c) + 1); })
            .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    function parole(s) { return norm(s).split(' ').filter(Boolean); }
    /* «piena»: pesa nel confronto riga per riga (≥ 4 lettere o con una cifra) */
    function parolaPiena(w) { return w.length >= SOGLIE.PAROLA_PIENA || /\d/.test(w); }
    /* «piena di lettere»: quella che manda un ritaglio in «testo» (una cifra isolata su una foto è rumore) */
    function parolaPienaLettere(w) { return new RegExp('^[a-z]{' + SOGLIE.PAROLA_PIENA + ',}$').test(w); }
    function lcs(a, b) {
        var prev = new Array(b.length + 1).fill(0);
        for (var i = 1; i <= a.length; i++) {
            var cur = new Array(b.length + 1).fill(0);
            for (var j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
            prev = cur;
        }
        return prev[b.length];
    }
    function compatta(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function r1(x) { return Math.round(x * 10) / 10; }
    function lingua(opz) { return opz && opz.lingua === 'en' ? 'en' : 'it'; }

    /* ── attiva (invariante 6): «CREA sì, ELABORA no» in un punto solo ─────────
       L'interruttore `mappai_figure` è acceso di serie salvo '0'; l'Output non
       c'entra (il terzo argomento si accetta e si ignora, perché nessuno sia
       tentato di farne una condizione). */
    function attiva(interruttore, origine) {
        var acceso = interruttore == null || String(interruttore) !== '0';
        return acceso && origine === 'crea';
    }

    /* ── geometria: fusione, margine, risoluzione ──────────────────────────── */
    function fondi(immagini, tol) {
        var r = (immagini || []).map(function (im) { return Object.assign({}, im, { x0: im.x, y0: im.y, x1: im.x + im.w, y1: im.y + im.h }); });
        r.sort(function (a, b) { return a.x0 - b.x0; });
        var padre = r.map(function (_, i) { return i; });
        var trova = function (i) { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
        for (var i = 0; i < r.length; i++) {
            for (var j = i + 1; j < r.length && r[j].x0 <= r[i].x1 + tol; j++) {
                if (r[j].y0 <= r[i].y1 + tol && r[i].y0 <= r[j].y1 + tol) padre[trova(i)] = trova(j);
            }
        }
        var gruppi = {};
        r.forEach(function (im, i) { var k = trova(i); (gruppi[k] = gruppi[k] || []).push(im); });
        return Object.keys(gruppi).map(function (k) {
            var membri = gruppi[k];
            var x0 = Math.min.apply(null, membri.map(function (m) { return m.x0; })), y0 = Math.min.apply(null, membri.map(function (m) { return m.y0; }));
            var x1 = Math.max.apply(null, membri.map(function (m) { return m.x1; })), y1 = Math.max.apply(null, membri.map(function (m) { return m.y1; }));
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, membri: membri };
        });
    }
    /* righe vicine nella stessa colonna → blocchi di paragrafo (per il «testo a immagini») */
    function fondiVerticale(righe, gap) {
        var r = righe.map(function (g) { return Object.assign({}, g, { x0: g.x, y0: g.y, x1: g.x + g.w, y1: g.y + g.h }); }).sort(function (a, b) { return a.y0 - b.y0; });
        var blocchi = [];
        r.forEach(function (g) {
            var b = null;
            for (var i = 0; i < blocchi.length; i++) { var c = blocchi[i]; if (g.y0 <= c.y1 + gap && g.x0 <= c.x1 + 20 && c.x0 <= g.x1 + 20) { b = c; break; } }
            if (b) { b.x0 = Math.min(b.x0, g.x0); b.y0 = Math.min(b.y0, g.y0); b.x1 = Math.max(b.x1, g.x1); b.y1 = Math.max(b.y1, g.y1); b.membri = b.membri.concat(g.membri || [g]); }
            else blocchi.push({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, membri: (g.membri || [g]).slice() });
        });
        return blocchi.map(function (b) { return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, membri: b.membri }; });
    }
    function interseca(r, x0, y0, x1, y1) { return r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0; }
    /* margine per lato, tagliato sul lato dove una riga tipografica entra nella fascia del margine */
    function conMargine(g, pct, W, H, righe) {
        var mx = g.w * pct / 100, my = g.h * pct / 100;
        var tagliati = [];
        /* Ogni fascia copre solo il lato suo, senza gli angoli: una didascalia sopra
           l'immagine che comincia un decimo di punto più a sinistra toglieva anche
           il margine sinistro (UDII4 p1-1 sulle righe di pdf.js, lotto 7, 19/10). */
        var fasce = {
            alto: [g.x, g.y - my, g.x + g.w, g.y],
            basso: [g.x, g.y + g.h, g.x + g.w, g.y + g.h + my],
            sinistra: [g.x - mx, g.y, g.x, g.y + g.h],
            destra: [g.x + g.w, g.y, g.x + g.w + mx, g.y + g.h]
        };
        var m = { alto: my, basso: my, sinistra: mx, destra: mx };
        Object.keys(fasce).forEach(function (lato) {
            var f = fasce[lato];
            if ((righe || []).some(function (r) { return interseca(r, f[0], f[1], f[2], f[3]); })) { m[lato] = 0; tagliati.push(lato); }
        });
        var x0 = Math.max(0, g.x - m.sinistra), y0 = Math.max(0, g.y - m.alto);
        var x1 = Math.min(W, g.x + g.w + m.destra), y1 = Math.min(H, g.y + g.h + m.basso);
        return { rett: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, tagliati: tagliati };
    }
    function rettArr(g) { return [r1(g.x), r1(g.y), r1(g.w), r1(g.h)]; }
    function ppiLimitato(xy) {
        var massimo = Math.max.apply(null, xy);
        var fattore = massimo > SOGLIE.PPI_MAX ? SOGLIE.PPI_MAX / massimo : massimo < SOGLIE.PPI_MIN ? SOGLIE.PPI_MIN / massimo : 1;
        return xy.map(function (v) { return Math.round(v * fattore * 1000) / 1000; });
    }
    function pixelDi(rett, ppi) { return [Math.max(1, Math.round(rett.w * ppi[0] / 72)), Math.max(1, Math.round(rett.h * ppi[1] / 72))]; }
    /* il piano per stare sotto 1,2 MB: qualità 85 → 65 a scatti di 10, poi scala ×0,85, al più sei tentativi */
    function pianoCompressione() {
        var piano = [], q = SOGLIE.QUALITA_INIZIO, scala = 1;
        for (var t = 0; t < SOGLIE.TENTATIVI_MAX; t++) {
            piano.push({ tentativo: t + 1, qualita: q, scala: scala });
            if (q > SOGLIE.QUALITA_MIN) q -= SOGLIE.QUALITA_PASSO; else scala = scala * SOGLIE.SCALA_RIDUZIONE;
        }
        return piano;
    }

    /* ── lo stato della pagina (§5.2) ──────────────────────────────────────────
       `pagina`: { numero, larghezza, altezza, caratteri (lettere e cifre), immagini: [{x,y,w,h,px:[w,h]}],
                  righe: [{x0,y0,x1,y1,testo}] }. `opz.pdfScansione` lo dice `statiPdf` (serve tutto il PDF). */
    function contaCaratteri(pagina) {
        if (typeof pagina.caratteri === 'number') return pagina.caratteri;
        return (String(pagina.testo || '').match(/[\p{L}\p{N}]/gu) || []).length;
    }
    function geometriaScansione(pagina) {
        var W = pagina.larghezza, H = pagina.altezza, car = contaCaratteri(pagina);
        var gruppi = fondi(pagina.immagini, SOGLIE.FUSIONE_PT);
        var coperta = 0;
        gruppi.forEach(function (g) { g.areaPct = g.w * g.h / (W * H) * 100; if (g.areaPct > coperta) coperta = g.areaPct; });
        return { scansione: car < SOGLIE.SCANSIONE_CAR && coperta >= SOGLIE.SCANSIONE_AREA_PCT, copertaPct: r1(coperta), caratteri: car, gruppi: gruppi };
    }
    function statoPagina(pagina, opz) {
        opz = opz || {};
        var W = pagina.larghezza, H = pagina.altezza;
        var geo = geometriaScansione(pagina);
        var car = geo.caratteri, gruppi = geo.gruppi;
        var scansione = geo.scansione && !!opz.pdfScansione;
        var basse = (pagina.immagini || []).filter(function (im) { return im.h <= SOGLIE.TESTO_IMMAGINI_H_PT; });
        var testoImmagini = !scansione && basse.length >= SOGLIE.TESTO_IMMAGINI_N && car < SOGLIE.TESTO_IMMAGINI_CAR;
        var tenuti = gruppi.filter(function (g) { return g.areaPct >= SOGLIE.AREA_MIN_PCT; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
        var formule = car >= SOGLIE.FORMULE_CAR_MIN && (pagina.righe || []).length ? regioniFormule(pagina.righe, W, H) : { regioni: [], righeFormula: [], spezzate: 0, regionePagina: null };
        var blocchi = testoImmagini ? fondiVerticale(fondi(basse, SOGLIE.TESTO_IMMAGINI_FUSIONE_PT), SOGLIE.TESTO_IMMAGINI_BLOCCO_PT).sort(function (a, b) { return a.y - b.y || a.x - b.x; }) : [];
        var stato = scansione ? 'scansione' : testoImmagini ? 'testo-immagini' : tenuti.length ? 'ritagli' : formule.regioni.length ? 'formule' : 'nulla';
        return { numero: pagina.numero, stato: stato, caratteri: car, gruppi: gruppi, tenuti: tenuti, scartati: gruppi.length - tenuti.length,
            copertaPct: geo.copertaPct, geometriaScansione: geo.scansione, tuttaPagina: geo.scansione && !scansione && tenuti.length > 0,
            formule: formule, blocchi: blocchi };
    }
    /* lo stato di tutte le pagine di un PDF: «scansione» scatta solo se almeno metà delle pagine hanno quella geometria */
    function statiPdf(pagine) {
        var n = (pagine || []).length;
        var quante = (pagine || []).filter(function (p) { return geometriaScansione(p).scansione; }).length;
        var pdfScansione = n > 0 && quante / n >= SOGLIE.SCANSIONE_QUOTA_PDF;
        return { pdfScansione: pdfScansione, quotaScansione: n ? quante / n : 0, pagineScansione: quante,
            stati: (pagine || []).map(function (p) { return statoPagina(p, { pdfScansione: pdfScansione }); }) };
    }

    /* 0114, lotto 4 (D5; revisione 1 dell'ADR, punto 6): un PDF scansione che resta senza testo per la mappa — nessuna lettera
       nel testo tipografico (`caratteri` della prova a secco, da `getTextContent`) e nessun blocco delle figure né formule
       innestate entrati (`lettura.pagine`), perché Google non l'ha letto («No», o nessuna chiave). È il caso dell'avviso
       del modulo; senza `lettura` vale la sola prova. */
    function scansioneNonLetta(prova, lettura) {
        if (!prova || !prova.pdfScansione) return false;
        if (lettura && lettura.dossier && lettura.dossier.google === 'si') return false;
        var car = (prova.pagine || []).reduce(function (n, p) { return n + (Number(p && p.caratteri) || 0); }, 0);
        if (car > 0) return false;
        return !((lettura && lettura.pagine) || []).some(function (p) { return p && (p.blocco || p.testoSostitutivo); });
    }

    /* ── i ritagli (§5.3, sorgente R-A) ───────────────────────────────────── */
    function ritagli(pagina, opz) {
        opz = opz || {};
        var st = opz.stato || statoPagina(pagina, opz);
        var W = pagina.larghezza, H = pagina.altezza, n = pagina.numero;
        var gruppi = st.stato === 'testo-immagini' ? st.tenuti.filter(function (g) { return g.h > SOGLIE.TESTO_IMMAGINI_H_PT; }) : st.stato === 'ritagli' ? st.tenuti : [];
        return gruppi.map(function (g, k) {
            var cm = conMargine(g, SOGLIE.MARGINE_PCT, W, H, pagina.righe);
            var conPx = g.membri.filter(function (im) { return im.px && im.w > 0 && im.h > 0; });
            var ppiNativi = conPx.length
                ? [Math.max.apply(null, conPx.map(function (im) { return im.px[0] / im.w * 72; })), Math.max.apply(null, conPx.map(function (im) { return im.px[1] / im.h * 72; }))]
                : [200, 200];
            var ppi = ppiLimitato(ppiNativi);
            return { k: k + 1, nome: 'p' + n + '-' + (k + 1), pagina: n, rett: cm.rett, rettPt: rettArr(cm.rett), oggettoPt: rettArr(g),
                areaPct: r1(g.areaPct), membri: g.membri.length, marginiTagliati: cm.tagliati,
                ppiNativi: ppiNativi.map(function (v) { return Math.round(v * 100) / 100; }), ppi: ppi, pixel: pixelDi(cm.rett, ppi),
                tuttaPagina: !!st.tuttaPagina && g.areaPct >= SOGLIE.SCANSIONE_AREA_PCT };
        });
    }
    /* il tetto: 6 ritagli con chiamate per pagina; passano quelli con più parole di Tesseract */
    function applicaTetto(lista) {
        var conChiamate = [], saltati = [];
        (lista || []).forEach(function (r, i) { (r.chiamate > 0 ? conChiamate : saltati).push(Object.assign({ _i: i }, r)); });
        var ordinati = conChiamate.slice().sort(function (a, b) { return (b.paroleTesseract || 0) - (a.paroleTesseract || 0) || a._i - b._i; });
        var letti = ordinati.slice(0, SOGLIE.TETTO_RITAGLI), fuori = ordinati.slice(SOGLIE.TETTO_RITAGLI);
        var pulito = function (r) { var c = Object.assign({}, r); delete c._i; return c; };
        letti.sort(function (a, b) { return a._i - b._i; }); fuori.sort(function (a, b) { return a._i - b._i; });
        return { letti: letti.map(pulito), oltreTetto: fuori.map(function (r) { return Object.assign(pulito(r), { chiamate: 0, nonLetto: 'oltre il tetto' }); }),
            saltati: saltati.map(pulito), paginaGialla: fuori.length > 0 };
    }

    /* ── R-D: formule spezzate nel testo tipografico ──────────────────────────
       Righe con coordinate ({x0,y0,x1,y1,testo}). Una riga «di formula» non ha parole
       di ≥ 3 lettere e ha una cifra o una variabile e un segno; un «frammento» è un
       pezzo di ≤ 4 caratteri (numeratore, denominatore, esponente). Spezzata = un
       frammento impilato sopra/sotto un'altra riga di formula o accanto su una riga
       diversa. Esclusi marcatori di elenco, celle di tabella (parole alla stessa
       altezza), colonne di ≥ 3 numeri. Sul banco: le due pagine giuste di Teoria
       diseq, zero falsi sugli altri sei PDF. */
    var SEGNI = /[−\-+±×·⋅*\/=<>≤≥≠≈∞√^]/;
    function rigaFormula(s) {
        var t = String(s || '').trim();
        if (!t) return false;
        if (/\p{L}{3,}/u.test(t.replace(/\b(cm|km|Fr|CHF|kg|m²|m2)\b/g, ''))) return false;
        return /[0-9]|\b[xyzabn]\b/.test(t) && (SEGNI.test(t) || /[()\[\]]/.test(t));
    }
    function frammento(s) {
        var t = String(s || '').trim();
        if (!(t.length > 0 && t.length <= 4 && /[0-9xyzabn]/.test(t) && /^[−\-+±×·⋅*\/=<>≤≥≠∞0-9xyzabn()\[\]{}.,;:!'"#$%&]+$/.test(t))) return false;
        return !/^[0-9]{1,2}[.)]$|^[a-z][.)]$/.test(t);
    }
    function regioniFormule(righe, W, H) {
        righe = righe || [];
        var vuoto = { regioni: [], righeFormula: [], spezzate: 0, regionePagina: null, esempio: '' };
        var conLettere = righe.filter(function (r) { return /\p{L}{3,}/u.test(r.testo); });
        var stessaRigaDi = function (a, b) { return Math.abs(a.y0 - b.y0) <= 1.5 && Math.abs(a.y1 - b.y1) <= 1.5; };
        var cellaOTabella = function (r) { return conLettere.some(function (l) { return stessaRigaDi(l, r) && l !== r; }); };
        var cand = righe.filter(function (r) { return (rigaFormula(r.testo) || frammento(r.testo)) && !(frammento(r.testo) && cellaOTabella(r)); });
        var framm = cand.filter(function (r) { return frammento(r.testo); });
        var inColonna = function (r) {
            return framm.filter(function (o) { return o !== r && o.x0 <= r.x1 + 2 && r.x0 <= o.x1 + 2 && Math.abs((o.y0 + o.y1) / 2 - (r.y0 + r.y1) / 2) <= 2.5 * Math.max(o.y1 - o.y0, r.y1 - r.y0); }).length >= 2;
        };
        var spezzate = cand.filter(function (a) {
            return cand.some(function (b) {
                if (a === b) return false;
                if (!frammento(a.testo) && !frammento(b.testo)) return false;
                if ((frammento(a.testo) && inColonna(a)) || (frammento(b.testo) && inColonna(b))) return false;
                var hA = a.y1 - a.y0, hB = b.y1 - b.y0;
                var xVicini = a.x0 <= b.x1 + 40 && b.x0 <= a.x1 + 40;
                var yOver = a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
                var xOver = a.x0 <= b.x1 + 2 && b.x0 <= a.x1 + 2;
                var gapV = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
                var impilate = xOver && gapV <= 1.0 * Math.max(hA, hB);
                var stessaRiga = Math.abs(a.y0 - b.y0) <= 1.5 && Math.abs(a.y1 - b.y1) <= 1.5;
                return xVicini && !stessaRiga && (yOver || impilate);
            });
        });
        if (!spezzate.length) return Object.assign(vuoto, { righeFormula: cand });
        var ord = spezzate.slice().sort(function (a, b) { return a.y0 - b.y0; });
        var regioni = [];
        ord.forEach(function (r) {
            var q = regioni[regioni.length - 1];
            if (q && r.y0 <= q.y1 + 20) { q.y1 = Math.max(q.y1, r.y1); q.y0 = Math.min(q.y0, r.y0); q.x0 = Math.min(q.x0, r.x0); q.x1 = Math.max(q.x1, r.x1); q.n++; }
            else regioni.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, n: 1 });
        });
        var y0 = Math.min.apply(null, regioni.map(function (q) { return q.y0; })), y1 = Math.max.apply(null, regioni.map(function (q) { return q.y1; }));
        for (var giro = 0; giro < 20; giro++) {
            var cresciuto = false;
            cand.forEach(function (r) {
                if (frammento(r.testo) && spezzate.indexOf(r) < 0) return; // un numero di pagina isolato non allarga la regione
                if (r.y1 >= y0 - 120 && r.y0 <= y1 + 120) { if (r.y0 < y0) { y0 = r.y0; cresciuto = true; } if (r.y1 > y1) { y1 = r.y1; cresciuto = true; } }
            });
            if (!cresciuto) break;
        }
        var mx = Math.max(0, Math.min(30, W * 0.05));
        var regionePagina = { x: mx, y: Math.max(0, y0 - 8), w: W - 2 * mx, h: Math.min(H, y1 + 8) - Math.max(0, y0 - 8) };
        return { regioni: regioni.map(function (q) { return { x: mx, y: q.y0 - 6, w: W - 2 * mx, h: q.y1 - q.y0 + 12, righe: q.n }; }),
            righeFormula: cand, spezzate: spezzate.length, righeSpezzate: spezzate, regionePagina: regionePagina,
            esempio: spezzate.slice(0, 4).map(function (r) { return r.testo; }).join(' | ') };
    }
    /* le righe tipografiche che cadono in una regione (per `innesta`) */
    function righeNellaRegione(righe, regione) {
        var out = [];
        (righe || []).forEach(function (r, i) { if (r.y0 < regione.y + regione.h && r.y1 > regione.y) out.push(i); });
        return out;
    }

    /* ── lo smistamento (§5.4): quante chiamate costa un ritaglio ─────────────
       `m`: { formule, tesseractCaricato, testoTesseract, testoTipografico, tintePiatte }.
       Cinque casi nell'ordine; il 3 viene prima del 4 apposta (la foto con
       didascalie è a toni continui ma porta parole). Tesseract non caricato: il
       caso 2 non si controlla (resta `pulisci` a valle), i casi 3-5 dai pixel. */
    function doppione(testoTesseract, testoTipografico) {
        var piene = parole(testoTesseract).filter(parolaPienaLettere);
        var tipo = parole(testoTipografico).filter(parolaPienaLettere);
        var trigrammi = {};
        for (var i = 0; i + 2 < tipo.length; i++) trigrammi[tipo[i] + ' ' + tipo[i + 1] + ' ' + tipo[i + 2]] = true;
        var sequenze = 0, presenti = 0;
        for (var j = 0; j + 2 < piene.length; j++) { sequenze++; if (trigrammi[piene[j] + ' ' + piene[j + 1] + ' ' + piene[j + 2]]) presenti++; }
        var quota = sequenze ? presenti / sequenze : 0;
        return { doppione: sequenze >= SOGLIE.DOPPIONE_SEQUENZE && quota >= SOGLIE.DOPPIONE_QUOTA, sequenze: sequenze, presenti: presenti, quota: quota };
    }
    function smista(m) {
        m = m || {};
        var tess = !!m.tesseractCaricato && m.testoTesseract != null;
        var tinte = typeof m.tintePiatte === 'number' ? m.tintePiatte : 0;
        var paroleTess = tess ? parole(m.testoTesseract) : [];
        var base = { paroleTesseract: paroleTess.length, tintePiatte: tinte, senzaTesseract: !tess };
        if (m.formule) return Object.assign(base, { caso: 1, chiamate: 2, motivo: 'formule', insieme: true, controlloDopo: false });
        if (tess) {
            var d = doppione(m.testoTesseract, m.testoTipografico);
            if (d.doppione) return Object.assign(base, { caso: 2, chiamate: 0, motivo: 'doppione', insieme: false, controlloDopo: false, quotaDoppione: d.quota });
            var noteTipo = {};
            parole(m.testoTipografico).forEach(function (w) { noteTipo[w] = true; });
            var nuove = paroleTess.filter(function (w) { return parolaPienaLettere(w) && !noteTipo[w]; });
            if (nuove.length >= SOGLIE.PAROLE_NUOVE) return Object.assign(base, { caso: 3, chiamate: 2, motivo: 'testo', insieme: true, controlloDopo: false, paroleNuove: nuove.length });
        }
        if (tinte < SOGLIE.TINTE_PIATTE) return Object.assign(base, { caso: 4, chiamate: 1, motivo: 'foto', insieme: false, controlloDopo: true });
        return Object.assign(base, { caso: 5, chiamate: 1, motivo: 'disegno', insieme: false, controlloDopo: true });
    }
    /* dopo la risposta del titolare, nei casi 4 e 5: «nessun testo» ferma (0 chiamate in più), testo letto → parte il controllo */
    function dopoTitolare(decisione, letturaTitolare) {
        var l = letturaTitolare && typeof letturaTitolare === 'object' ? letturaTitolare : lettore(letturaTitolare);
        if (!decisione || !decisione.controlloDopo) return Object.assign({}, decisione, { controllo: decisione ? decisione.chiamate >= 2 : false, fermo: false });
        if (l.nessunTesto) return Object.assign({}, decisione, { controllo: false, fermo: true, chiamate: 1, motivo: decisione.motivo + ', nessun testo' });
        return Object.assign({}, decisione, { controllo: true, fermo: false, chiamate: 2, caso: decisione.caso === 4 ? 3 : decisione.caso, motivo: decisione.caso === 4 ? 'testo' : decisione.motivo });
    }

    /* ── il prompt (§5.5): il testo della console più la coda del core ─────────
       Il contratto strutturale (i cinque tag, «nessun testo», l'àncora) non sta
       nel testo modificabile in console: un override svuotato non lo toglie. */
    var CODA = {
        it: { tipo: 'Nella prima riga scrivi solo il tipo fra parentesi quadre: [SCHEMA], [DOCUMENTO], [ESERCIZIO], [FOTO], [TESTO].',
            nessunTesto: 'Se nell\'immagine non c\'è nessun testo (una fotografia, un disegno, un\'icona), dopo la riga del tipo scrivi solo "nessun testo", senza descrivere l\'immagine.',
            ancoraApre: '--- Testo tipografico della pagina ---', ancoraChiude: '--- fine del testo tipografico ---' },
        en: { tipo: 'On the first line write only the type in square brackets: [DIAGRAM], [DOCUMENT], [EXERCISE], [PHOTO], [TEXT].',
            nessunTesto: 'If the image has no text at all (a photograph, a drawing, an icon), after the type line write only "no text", without describing the image.',
            ancoraApre: '--- Typeset text of the page ---', ancoraChiude: '--- end of the typeset text ---' }
    };
    function prompt(tipo, testoConsole, opz) {
        opz = opz || {};
        var L = CODA[lingua(opz)], parti = [];
        var base = String(testoConsole || '').trim();
        if (base) parti.push(base);
        tipo = String(tipo || 'FIGURA').toUpperCase();
        if (tipo === 'FIGURA') parti.push(L.tipo, L.nessunTesto);
        else if (tipo === 'SCANSIONE') parti.push(L.nessunTesto);
        var testo = parti.join(' ');
        if ((tipo === 'FORMULE' || tipo === 'PAGINA') && opz.testoTipografico != null && testo.indexOf(L.ancoraApre) < 0) {
            testo += '\n\n' + L.ancoraApre + '\n' + String(opz.testoTipografico).trim() + '\n' + L.ancoraChiude;
        }
        return testo;
    }

    /* ── il lettore delle risposte, bilingue ──────────────────────────────── */
    var TAG = { SCHEMA: 'SCHEMA', DIAGRAM: 'SCHEMA', DOCUMENTO: 'DOCUMENTO', DOCUMENT: 'DOCUMENTO', ESERCIZIO: 'ESERCIZIO', EXERCISE: 'ESERCIZIO', FOTO: 'FOTO', PHOTO: 'FOTO', TESTO: 'TESTO', TEXT: 'TESTO' };
    var NESSUN_TESTO = /^\s*\[?\s*(nessun testo|no text|non c'?è testo|senza testo|nessuna formula|no formula)\s*\]?\.?\s*$/i;
    function lettore(risposta) {
        var righe = String(risposta || '').replace(/```[a-z]*/gi, '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
        var tipo = 'TESTO', senzaTag = true;
        if (righe.length) {
            var m = /^\[\s*([A-Za-z]{3,20})\s*\]\s*(.*)$/.exec(righe[0]) || /^([A-Za-z]{3,20})$/.exec(righe[0]);
            if (m && TAG[m[1].toUpperCase()]) {
                tipo = TAG[m[1].toUpperCase()]; senzaTag = false;
                var resto = (m[2] || '').trim();
                righe = (resto ? [resto] : []).concat(righe.slice(1));
            }
        }
        var nessunTesto = righe.length === 0 || (righe.length === 1 && NESSUN_TESTO.test(righe[0]));
        if (nessunTesto) righe = [];
        return { tipo: tipo, senzaTag: senzaTag, nessunTesto: nessunTesto, righe: righe, testo: righe.join('\n') };
    }
    var NUMERO_IN_TESTA = /^\s*\(?(\d{1,2}|[a-z])[.)]\s*/i;
    /* le formule lette: «n) formula → soluzione», una per riga */
    function lettoreFormule(testo) {
        var out = [];
        String(testo || '').split('\n').forEach(function (l) {
            l = l.trim(); if (!l) return;
            var n = '', m = /^\s*\(?(\d{1,2}|[a-z])[.)]\s+(.+)$/.exec(l);
            if (m) { n = m[1]; l = m[2]; }
            var pezzi = l.split(/\s*(?:→|->|=>)\s*/);
            var formula = pezzi[0].trim(), soluzione = pezzi.slice(1).join(' → ').trim();
            if (!formula || !(rigaFormula(formula) || /[=<>≤≥]/.test(formula) || /\\frac|\\leq|\\geq/.test(formula))) return;
            out.push({ n: n, formula: formula, soluzione: soluzione });
        });
        return out;
    }

    /* ── R7, pulizia: frasi d'apertura, crediti, righe già nel tipografico ──── */
    var CHIACCHIERE = [/^\s*(ecco|certo|certamente|di seguito|qui sotto|here is|here's|sure)[^\n]*\n/i, /^\s*(trascrizione|transcription)\s*:?\s*\n/i, /^\s*\*\*?(trascrizione|transcription)[^\n]*\n/i];
    var CREDITI = /(©|\bfoto\s*:|\bphoto\s*:|getty|mondadori portfolio|de agostini|shutterstock|alamy|biblioteca [a-z]+ (centrale|nazionale)|universal images)/i;
    function pulisci(testo, testoTipografico, opz) {
        opz = opz || {};
        var t = String(testo || '').replace(/```[a-z]*/gi, ''), tolte = 0;
        CHIACCHIERE.forEach(function (re) { var prima = t; t = t.replace(re, ''); if (t !== prima) tolte++; });
        var tipo = opz.formule ? '' : ' ' + norm(testoTipografico) + ' ';
        var righe = [];
        t.split('\n').forEach(function (l) {
            l = l.trim();
            if (!l) return;
            if (CREDITI.test(l)) { tolte++; return; }
            if (tipo.trim()) {
                var n = norm(l.replace(NUMERO_IN_TESTA, ''));
                if (n && n.split(' ').length >= 2 && tipo.indexOf(' ' + n + ' ') >= 0) { tolte++; return; }
            }
            righe.push(l);
        });
        return { testo: righe.join('\n'), righe: righe, tolte: tolte };
    }

    /* ── le formule: normalizzazione e atomi (per l'accordo e per `innesta`) ── */
    function latexPiano(s) {
        return String(s || '').replace(/\$/g, '').replace(/\\(left|right)/g, '').replace(/\\geq?/g, '≥').replace(/\\leq?/g, '≤').replace(/\\infty/g, '∞').replace(/\\cdot/g, '·')
            .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)');
    }
    function normFormula(s) {
        return String(s || '').toLowerCase().replace(/\$/g, '').replace(/\\(left|right)/g, '').replace(/\\geq?/g, '>=').replace(/\\leq?/g, '<=').replace(/\\infty/g, 'inf').replace(/\\cdot/g, '*')
            .replace(/[−–]/g, '-').replace(/[·⋅×]/g, '*').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/∞/g, 'inf')
            .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\s+/g, '')
            .replace(/(\d)\.(?=[a-z])/g, '$1')                                   // «3.x» = 3x (il punto di moltiplicazione di Gemma; gate 3)
            .replace(/\(([a-z0-9]{1,3}(?:\/[a-z0-9]{1,3})?)\)/g, '$1')            // (x) → x, (x/6) → x/6 (gate 3)
            .replace(/\*(?=[a-z(])/g, '').replace(/(\d)x/g, '$1x');
    }
    function atomiFormula(testo) {
        var atomi = [];
        String(testo || '').split('\n').forEach(function (riga) {
            var pre = latexPiano(riga).replace(/^\s*\(?\d{1,2}[.)]\s*/, '')
                .replace(/\b(?!(?:cm|km|kg|fr|chf|inf)\b)[a-zà-ü]{2,}\b/g, ' ')
                .replace(/\b[A-ZÀ-Ü]{3,}\b/g, ' ')
                /* il «;» non spezza: separa i capi di un intervallo («]-∞; -5[», con o senza spazio: gate 3, p.4 rossa a torto) */
                .replace(/→|↦|\s:\s|,(?=\s)|[?!]/g, '§');
            normFormula(pre).split('§').forEach(function (pezzo) {
                (pezzo.match(/[0-9a-z()\[\]\/\-+*<>=;.]+/g) || []).forEach(function (a) { if (a.length >= 3 && /[=<>\/+\-*]/.test(a) && /[0-9a-z]/.test(a)) atomi.push(a); });
            });
        });
        return atomi;
    }

    /* ── R5, l'accordo fra le due letture, riga per riga (§5.6) ──────────────
       Una riga del titolare è verde se il controllo ha una riga che la contiene
       con TUTTE le sue parole piene: parole in ordine ≥ 80 %, oppure contenuta
       (≥ 90 %) in una riga del controllo lunga almeno il doppio (Qwen fonde le
       colonne di una tabella). Il numero d'ordine in testa non conta. Le righe
       che ha solo il controllo sono «forse manca»: si mostrano in ELABORA, non
       entrano nel testo. Misura del 18/10 (`p2-coppia/riga-per-riga.js`, regola
       stretta): righe inventate o con refusi verdi 0 su 129.
       Sugli schemi (tutte e due le letture dicono SCHEMA) si contano anche le
       etichette con la loro molteplicità (4 valvassini contro 3 = giallo); sulle
       formule gli atomi normalizzati col minimo delle due coperture. */
    function senzaNumero(l) { return String(l).replace(NUMERO_IN_TESTA, ''); }
    function insiemePiene(ws) { var s = {}; ws.filter(parolaPiena).forEach(function (w) { s[w] = true; }); return s; }
    /* Revisione 1 dell'ADR, punto 2 (packet 0114). Dopo l'abbinamento uno a uno di sempre, una riga del titolare ancora
       gialla prova le FINESTRE di 2 e 3 righe CONSECUTIVE del controllo, unite: è verde se la finestra la contiene con la
       stessa regola (parole in ordine ≥ 80 %, tutte le parole piene) e ogni riga della finestra sta, per l'80 % delle sue
       parole, dentro la riga del titolare. È il caso dello schema di p.2 di UDII4 al gate 3:
       Gemma scrive «Feudi → Consiglio e aiuto» su una riga, Qwen «Feudi» e «Consiglio e aiuto» su due. Righe sparse non
       valgono (Giacomo, bivio 5: «solo consecutive»), e la finestra prende solo righe libere o già della riga stessa: un
       abbinamento resta uno a uno (4 valvassini contro 3 resta giallo). Poi i «forse manca»: le righe del controllo
       rimaste libere ma contenute, con tutte le parole piene, in una riga del titolare (gialla o verde) non si elencano;
       restano nel `.figure.json` dentro la lettura del controllo. Le righe prese da una finestra tornano in `inFinestra`:
       sugli schemi non si contano come etichette sole. */
    function abbina(rg, rq) {
        var usate = {}, contenitori = {}, esito = [], daRiga = {}, inFinestra = {};
        var pq = rq.map(function (l) { return parole(senzaNumero(l)); });
        var pieneQ = pq.map(insiemePiene);
        var pg = rg.map(function (l) { return parole(senzaNumero(l)); });
        rg.forEach(function (l, i) {
            var a = pg[i], best = -1, bs = 0, contenuta = false;
            pq.forEach(function (b, j) {
                if (!b.length || !a.length) return;
                var c = lcs(a, b), sim = c / Math.max(a.length, b.length), cont = c / a.length;
                if (b.length >= SOGLIE.R5_CONTENUTA_LUNGHEZZA * a.length && cont >= SOGLIE.R5_CONTENUTA && cont > bs) { best = j; bs = cont; contenuta = true; }
                else if (!usate[j] && sim >= SOGLIE.R5_RIGA_ORDINE && sim > bs) { best = j; bs = sim; contenuta = false; }
            });
            var stretta = best >= 0 && a.filter(parolaPiena).every(function (w) { return pieneQ[best][w]; });
            var verde = best >= 0 && stretta;
            if (best >= 0) { if (contenuta) contenitori[best] = true; else { usate[best] = true; daRiga[best] = i; } }
            esito.push({ testo: l, verde: verde, abbinata: best >= 0 ? best : null, contenuta: contenuta, piene: a.filter(parolaPiena).length });
        });
        esito.forEach(function (r, i) {
            var a = pg[i];
            if (r.verde || !a.length) return;
            var piene = a.filter(parolaPiena);
            for (var k = 2; k <= SOGLIE.R5_FINESTRA_MAX; k++) {
                for (var j = 0; j + k <= rq.length; j++) {
                    var libere = true, b = [];
                    for (var h = j; h < j + k; h++) {
                        if ((usate[h] && daRiga[h] !== i) || contenitori[h]) { libere = false; break; }
                        // ogni riga della finestra è un pezzo di QUESTA riga (≥ 80 % delle sue parole, in ordine): una parola presa
                        // da una freccia vicina che parla d'altro non fa verde (UDII4 p.2 a sinistra, «VASSALLO → valvassore»)
                        if (pq[h].length && lcs(pq[h], a) / pq[h].length < SOGLIE.R5_RIGA_ORDINE) { libere = false; break; }
                        b = b.concat(pq[h]);
                    }
                    if (!libere || !b.length) continue;
                    var sim = lcs(a, b) / Math.max(a.length, b.length), s = insiemePiene(b);
                    if (sim < SOGLIE.R5_RIGA_ORDINE || !piene.every(function (w) { return s[w]; })) continue;
                    if (r.abbinata != null && !r.contenuta && daRiga[r.abbinata] === i) { usate[r.abbinata] = false; delete daRiga[r.abbinata]; }
                    for (h = j; h < j + k; h++) { usate[h] = true; daRiga[h] = i; inFinestra[h] = true; }
                    r.verde = true; r.abbinata = j; r.finestra = k;
                    return;
                }
            }
        });
        var pieneG = pg.map(insiemePiene);
        var forseManca = [];
        rq.forEach(function (l, j) {
            if (usate[j] || contenitori[j]) return;
            var piene = pq[j].filter(parolaPiena);
            if (!piene.length) return;
            if (pieneG.some(function (s) { return piene.every(function (w) { return s[w]; }); })) return;
            forseManca.push(l);
        });
        return { righe: esito, forseManca: forseManca, inFinestra: inFinestra };
    }
    var FRECCIA = /→|->|=>/;
    function etichetteDi(righe) {
        var m = {};
        righe.forEach(function (l) { if (FRECCIA.test(l)) return; var w = parole(l); if (w.length && w.length <= 3) { var k = w.join(' '); m[k] = (m[k] || 0) + 1; } });
        return m;
    }
    function accordo(titolare, controllo, opz) {
        opz = opz || {};
        var T = titolare && typeof titolare === 'object' ? titolare : lettore(titolare);
        var C = controllo && typeof controllo === 'object' ? controllo : lettore(controllo);
        var modo = opz.formule ? 'formule' : (T.tipo === 'SCHEMA' && C.tipo === 'SCHEMA') ? 'schema' : 'righe';
        if (modo === 'formule') {
            var a = atomiFormula(T.testo), b = atomiFormula(C.testo);
            var sacco = {}; b.forEach(function (x) { sacco[x] = (sacco[x] || 0) + 1; });
            var comuni = 0; a.forEach(function (x) { if (sacco[x] > 0) { comuni++; sacco[x]--; } });
            var pct = a.length && b.length ? Math.round(100 * Math.min(comuni / a.length, comuni / b.length)) : (a.length || b.length ? 0 : 100);
            var insiemeB = {}; b.forEach(function (x) { insiemeB[x] = true; });
            var righeF = T.righe.map(function (l) { var at = atomiFormula(l); return { testo: l, verde: at.length > 0 && at.every(function (x) { return insiemeB[x]; }), atomi: at.length }; });
            var insiemeA = {}; a.forEach(function (x) { insiemeA[x] = true; });
            var forse = C.righe.filter(function (l) { var at = atomiFormula(l); return at.length && at.some(function (x) { return !insiemeA[x]; }); });
            return { modo: modo, righe: righeF, forseManca: forse, accordoPct: pct, atomi: { titolare: a.length, controllo: b.length, comuni: comuni }, etichetteDiverse: [], titolare: T, controllo: C };
        }
        var ab = abbina(T.righe, C.righe);
        var verdi = ab.righe.filter(function (r) { return r.verde; }).length;
        var pctR = T.righe.length ? Math.round(100 * verdi / T.righe.length) : 0;
        var diverse = [];
        if (modo === 'schema') {
            var ea = etichetteDi(T.righe), eb = etichetteDi(C.righe.filter(function (l, j) { return !ab.inFinestra[j]; }));
            Object.keys(ea).forEach(function (k) { if ((eb[k] || 0) !== ea[k]) diverse.push(k + ' ' + ea[k] + '/' + (eb[k] || 0)); });
            Object.keys(eb).forEach(function (k) { if (!ea[k]) diverse.push(k + ' 0/' + eb[k]); });
        }
        return { modo: modo, righe: ab.righe, forseManca: ab.forseManca, accordoPct: pctR, etichetteDiverse: diverse, titolare: T, controllo: C };
    }

    /* ── lo stato del ritaglio (§5.6): verde, giallo, rosso, non letto ─────────
       `esito`: { accordo, letture (1|2), provider ('infomaniak'|'google'), titolare, controllo, formule, paroleTesseract }.
       Verde = accordo fra due modelli, non una verifica; con Google una lettura sola = giallo, mai verde. */
    function stato(esito) {
        esito = esito || {};
        var motivi = [];
        var A = esito.accordo || null;
        var T = esito.titolare || (A && A.titolare) || null, C = esito.controllo || (A && A.controllo) || null;
        var righeDi = function (L) { return L ? L.righe.map(function (t) { return { testo: t, verde: false }; }) : []; };
        if (esito.provider === 'google') {
            if (!T || !T.righe.length) return { stato: 'rosso', motivi: ['lettura vuota'], righe: [] };
            return { stato: 'giallo', motivi: ['una lettura sola (Google): mai verde'], righe: righeDi(T), forseManca: [] };
        }
        if ((esito.letture || 0) < 2) return { stato: 'non letto', motivi: ['una lettura sola: si ritenta al CREA successivo'], righe: righeDi(T), forseManca: [] };
        if ((T && !T.righe.length) || (C && !C.righe.length) || (A && !T && !A.righe.length)) return { stato: 'rosso', motivi: ['r1 lettura vuota'], righe: [], forseManca: [] };
        if (!A && T && C) A = accordo(T, C, { formule: !!esito.formule });
        if (!A) return { stato: 'rosso', motivi: ['nessun accordo da misurare'], righe: righeDi(T), forseManca: [] };
        var paroleRisposta = parole(T ? T.testo : A.righe.map(function (r) { return r.testo; }).join('\n')).length;
        if (!esito.formule && A.modo !== 'formule' && typeof esito.paroleTesseract === 'number' && esito.paroleTesseract >= SOGLIE.R1_TESSERACT_MIN) {
            var quota = Math.round(100 * paroleRisposta / esito.paroleTesseract);
            if (quota < SOGLIE.R1_QUOTA_PCT) return { stato: 'rosso', motivi: ['r1 corta (' + quota + ' % delle parole di Tesseract)'], righe: A.righe, forseManca: A.forseManca };
        }
        if (A.accordoPct < SOGLIE.R5_ROSSO_PCT) return { stato: 'rosso', motivi: ['r5 accordo ' + A.accordoPct + ' %'], righe: A.righe, forseManca: A.forseManca };
        var tutteVerdi = A.righe.length > 0 && A.righe.every(function (r) { return r.verde; });
        var verde;
        if (A.modo === 'formule') {
            verde = A.accordoPct >= SOGLIE.R5_FORMULE_PCT && tutteVerdi;
            if (!verde) motivi.push('r5 formule ' + A.accordoPct + ' %');
        } else {
            verde = tutteVerdi && !A.forseManca.length && !A.etichetteDiverse.length;
            if (!tutteVerdi) motivi.push('r5 righe divergenti ' + A.righe.filter(function (r) { return !r.verde; }).length);
            if (A.forseManca.length) motivi.push('forse manca ' + A.forseManca.length);
            if (A.etichetteDiverse.length) motivi.push('r5 etichette diverse (' + A.etichetteDiverse.slice(0, 3).join(', ') + ')');
        }
        return { stato: verde ? 'verde' : 'giallo', motivi: motivi, righe: A.righe, forseManca: A.forseManca, accordoPct: A.accordoPct };
    }
    /* R0: la lettura sola di Tesseract, decisa dallo stato di pagina (§5.9) */
    /* Le note sono testo del `.figure.json`, non dell'interfaccia: fisse, in due lingue
       (le chiavi dei dizionari per ELABORA arrivano col lotto 6, nel modulo). */
    var NOTE_R0 = {
        it: { ocr: 'letto da un OCR locale, senza controllo', google: 'una lettura sola (Google)', parziale: 'parziale' },
        en: { ocr: 'read by a local OCR, without a check', google: 'a single reading (Google)', parziale: 'parziale' }
    };
    function statoR0(tipoPagina, opz) {
        opz = opz || {};
        var N = NOTE_R0[lingua(opz)];
        if (tipoPagina === 'testo-immagini') return { stato: 'giallo', entra: true, nota: N.ocr };
        if (tipoPagina === 'scansione') {
            if (opz.google) return { stato: 'giallo', entra: true, nota: N.google };
            return { stato: 'rosso', entra: false, nota: N.parziale };
        }
        return { stato: null, entra: false, nota: '' };
    }

    /* ── i marcatori (§5.7): un blocco su UNA riga per pagina ──────────────────
       Spazi compattati: il corpus passa per stripBoilerplate e stripStructuralLines,
       che su righe separate toglievano marcatori ed etichette in maiuscolo. Il
       segno ⟦da controllare: …⟧ attorno alla sola parte gialla; la legenda in
       testa al blocco solo se quel blocco ha almeno un segno. */
    function segno(testo) { return SEGNO_APRE + compatta(testo) + SEGNO_CHIUDE; }
    /* La coda del blocco (revisione 1 dell'ADR, punto 6; Giacomo, 20/10: «sì al punto»). L'àncora (`mappai-anchor-core.js`)
       compatta ogni spazio, a capo compreso, e taglia le frasi dopo `.!?;:` seguiti da uno spazio: una coda attaccata
       all'ultima frase («…minori.⟧ [/Figure]», o senza punto) finiva nelle citazioni. Qui l'ultima frase del blocco chiude con
       la sua punteggiatura (un punto se non ne ha), POI uno spazio, POI il segno `⟧` e il marcatore: la coda resta un
       frammento di una parola, che l'àncora scarta (meno di 5 parole). Il testo letto non perde nulla; guadagna al più un punto. */
    function blocco(apreChiude, n, pezzi, conSegno, L) {
        var dentro = compatta(pezzi.filter(Boolean).join(' '));
        if (!dentro) return '';
        var chiudeSegno = dentro.slice(-SEGNO_CHIUDE.length) === SEGNO_CHIUDE;
        if (chiudeSegno) dentro = dentro.slice(0, -SEGNO_CHIUDE.length).replace(/\s+$/, '');
        if (!/[.!?;:]$/.test(dentro)) dentro += '.';
        return compatta(apreChiude[0].replace('N', String(n)) + ' ' + (conSegno ? LEGENDA[L] + ' ' : '') + dentro + ' ' + (chiudeSegno ? SEGNO_CHIUDE + ' ' : '') + apreChiude[1]);
    }
    /* `letture`: [{ stato, righe: [{testo, verde}] }] — entrano solo verde e giallo; righe gialle consecutive in un segno solo */
    function marcatoriFigure(n, letture, opz) {
        var L = lingua(opz), pezzi = [], conSegno = false;
        (letture || []).forEach(function (l) {
            if (!l || (l.stato !== 'verde' && l.stato !== 'giallo')) return;
            var gialle = [];
            var chiudi = function () { if (gialle.length) { pezzi.push(segno(gialle.join(' '))); conSegno = true; gialle = []; } };
            (l.righe || []).forEach(function (r) {
                var t = compatta(typeof r === 'string' ? r : r.testo);
                if (!t) return;
                if (r.verde === false) gialle.push(t); else { chiudi(); pezzi.push(t); }
            });
            chiudi();
        });
        return blocco(MARC[L].figure, n, pezzi, conSegno, L);
    }
    /* R0: ogni blocco letto da Tesseract entra col giallo fisso; un blocco vuoto non entra */
    function marcatoriTestoImmagini(n, blocchi, opz) {
        var L = lingua(opz);
        var pezzi = (blocchi || []).map(compatta).filter(Boolean).map(segno);
        return blocco(MARC[L].testoImmagini, n, pezzi, pezzi.length > 0, L);
    }
    function formulaInRiga(f) { return (f.n ? f.n + ') ' : '') + compatta(f.formula) + (f.soluzione ? ' → ' + compatta(f.soluzione) : ''); }
    /* la regione gialla delle formule: le formule lette fra marcatori propri, segnate */
    function marcatoriFormule(n, formule, opz) {
        var L = lingua(opz);
        var dentro = (formule || []).filter(function (f) { return f && f.formula; }).map(formulaInRiga).join(' ; ');
        return blocco(MARC[L].formule, n, dentro ? [segno(dentro)] : [], !!dentro, L);
    }
    /* Il blocco va sulla STESSA riga della pagina (ADR §5.7: «una riga per pagina,
       accodata alla riga tipografica»). Su una riga sua diventava una riga del
       corpus di CREA, e con tre pagine illustrate il «modo A» di stripBoilerplate
       toglieva «[Figure della pagina N] ⟦da controllare…» come intestazione
       ripetuta (misurato il 19/10, lotto 7: 3 aperture su 3 perse). */
    function accoda(testoPagina, bloccoTesto) {
        if (!bloccoTesto) return testoPagina;
        var t = String(testoPagina || '').replace(/\s+$/, '');
        return t ? t + ' ' + bloccoTesto : bloccoTesto;
    }

    /* ── innesta (§5.7): le formule al posto delle righe spezzate ──────────────
       Regione verde: dalla regione si tolgono i frammenti (e le righe di formula che
       la formula letta già contiene), ogni formula si inserisce dopo la riga di
       consegna col suo numero; senza numero in fondo alla regione; una formula già
       integra nel tipografico non si inserisce. Gialla: nessuna riga si toglie, le
       formule si accodano fra [Formule della pagina N]. Rossa: testo com'è. */
    function innesta(o) {
        o = o || {};
        var righe = (o.righe || []).slice(), idx = (o.indiciRegione || []).slice().sort(function (a, b) { return a - b; });
        var formule = (o.formule || []).filter(function (f) { return f && f.formula; });
        if (!idx.length || o.stato === 'rosso' || !formule.length) return { righe: righe, inserite: 0, tolte: 0 };
        var ultimo = idx[idx.length - 1];
        if (o.stato !== 'verde') {
            var b = marcatoriFormule(o.pagina, formule, o);
            righe.splice(ultimo + 1, 0, b);
            return { righe: righe, inserite: formule.length, tolte: 0 };
        }
        var inRegione = {}; idx.forEach(function (i) { inRegione[i] = true; });
        var testoRegione = normFormula(idx.map(function (i) { return righe[i]; }).join('\n'));
        var daInserire = formule.filter(function (f) { var nf = normFormula(f.formula); return nf.length >= 3 && testoRegione.indexOf(nf) < 0; });
        var normInserite = daInserire.map(function (f) { return normFormula(f.formula); });
        var nuove = [], tolte = 0, inserite = 0, perNumero = {}, senzaN = [], cursore = 0;
        daInserire.forEach(function (f) { if (f.n) (perNumero[String(f.n).toLowerCase()] = perNumero[String(f.n).toLowerCase()] || []).push(f); else senzaN.push(f); });
        righe.forEach(function (l, i) {
            if (inRegione[i]) {
                var nf = normFormula(l);
                var consegna = NUMERO_IN_TESTA.exec(l);
                if (frammento(l)) { tolte++; }
                else if (!consegna && rigaFormula(l) && nf.length >= 3 && normInserite.some(function (x) { return x !== nf && x.indexOf(nf) >= 0; })) { tolte++; }
                else {
                    nuove.push(l);
                    if (consegna) {
                        var k = consegna[1].toLowerCase();
                        (perNumero[k] || []).forEach(function (f) { nuove.push(formulaInRiga(Object.assign({}, f, { n: '' }))); inserite++; });
                        delete perNumero[k];
                    }
                }
                if (i === ultimo) cursore = nuove.length;   // dove finisce la regione, anche se la sua ultima riga è un frammento tolto
            } else nuove.push(l);
        });
        /* le formule senza una riga di consegna si accodano in fondo alla regione. Prima stava dentro il ramo
           della riga tenuta: con una regione che finisce con un frammento (Teoria diseq p.4 finisce con due
           denominatori) non scattava mai e le formule lette si perdevano in silenzio (lotto 3, 19/10). */
        var finali = [];
        Object.keys(perNumero).forEach(function (k) { perNumero[k].forEach(function (f) { finali.push(formulaInRiga(f)); inserite++; }); });
        senzaN.forEach(function (f) { finali.push(formulaInRiga(f)); inserite++; });
        if (finali.length) nuove.splice.apply(nuove, [cursore, 0].concat(finali));
        return { righe: nuove, inserite: inserite, tolte: tolte };
    }

    /* ── identità: impronta del PDF + pagina + rettangolo in punti ───────────── */
    function impronta(stringa) {
        var s = String(stringa == null ? '' : stringa), h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
            h2 ^= c; h2 = Math.imul(h2, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 13;
        }
        return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
    }
    function identita(improntaPdf, pagina, rett) {
        var arr = Array.isArray(rett) ? rett : [rett.x, rett.y, rett.w, rett.h];
        return String(improntaPdf) + ':p' + String(pagina) + ':' + arr.map(function (v) { return String(r1(Number(v))); }).join(',');
    }

    /* ── modelloPer (§5.5): chi legge, col ripiego sulla tendina «Modello per le foto» ─
       `chiave`: { infomaniak, google } (presenza, mai il valore in giro); `catalogo`: le
       righe vive della tendina (lista, o { righe, tendina }). Google parte solo con la
       chiave Google e mai col token Infomaniak; la scansione a Infomaniak non va. */
    function modelloPer(tipo, provider, chiave, catalogo) {
        tipo = String(tipo || 'FIGURA').toUpperCase();
        provider = provider === 'google' ? 'google' : 'infomaniak';
        var k = typeof chiave === 'string' ? (provider === 'google' ? { google: chiave } : { infomaniak: chiave }) : (chiave || {});
        var righe = Array.isArray(catalogo) ? catalogo : (catalogo && Array.isArray(catalogo.righe) ? catalogo.righe : null);
        var tendina = (catalogo && !Array.isArray(catalogo) && catalogo.tendina) || MODELLI.TENDINA_PREDEFINITO;
        var locale = function (motivo) { return { provider: provider, titolare: null, controllo: null, letture: 0, locale: true, ripiego: false, sempreGiallo: false, motivo: motivo }; };
        if (provider === 'google') {
            if (!k.google) return locale('senza chiave Google: strada locale');
            return { provider: 'google', titolare: MODELLI.GOOGLE, controllo: null, letture: 1, locale: false, ripiego: false, sempreGiallo: true, motivo: 'Google: una lettura, giallo' };
        }
        if (!k.infomaniak) return locale('senza token Infomaniak: strada locale');
        if (tipo === 'SCANSIONE') return locale('la pagina scansionata non va a Infomaniak: Tesseract, o Google su domanda');
        var disponibile = function (id) {
            if (!righe) return true;
            return righe.some(function (r) { return r && typeof r.id === 'string' && r.id.toLowerCase() === id.toLowerCase() && !/retir|ritir|deprec|disabl|unavail/i.test(String(r.infoStatus || r.info_status || '')); });
        };
        var ripiego = false;
        var titolare = MODELLI.TITOLARE, controllo = MODELLI.CONTROLLO;
        if (!disponibile(titolare)) { titolare = tendina; ripiego = true; }
        if (!disponibile(controllo)) { controllo = tendina; ripiego = true; }
        return { provider: 'infomaniak', titolare: titolare, controllo: controllo, letture: 2, locale: false, ripiego: ripiego, sempreGiallo: false,
            stessoModello: titolare.toLowerCase() === controllo.toLowerCase(), motivo: ripiego ? 'ripiego sulla tendina «Modello per le foto»' : 'coppia di serie' };
    }

    /* ── la stima prima del clic (§5.7): titolare e controllo sommati, è un tetto ── */
    function stima(decisioni, prezzi, opz) {
        opz = opz || {};
        prezzi = prezzi || {};
        var pT = prezzi.titolare || { in: 0, out: 0 }, pC = prezzi.controllo || { in: 0, out: 0 };
        var daLeggere = 0, foto = 0, disegni = 0, doppioni = 0, chiamateMax = 0, costo = 0;
        var costoDi = function (p, tokIn, tokOut) { return ((p.in || 0) * tokIn + (p.out || 0) * tokOut) / 1e6; };
        (decisioni || []).forEach(function (d) {
            if (!d) return;
            if (d.caso === 2) doppioni++;
            if (d.caso === 4) foto++;
            if (d.caso === 5) disegni++;
            if (!(d.chiamate > 0)) return;
            daLeggere++; chiamateMax += d.chiamate;
            var out = d.caso === 1 ? SOGLIE.TOK_USCITA_FORMULE : (d.caso === 4 || d.caso === 5) ? SOGLIE.TOK_USCITA_FOTO : SOGLIE.TOK_USCITA;
            costo += costoDi(pT, SOGLIE.TOK_PROMPT + SOGLIE.TOK_IMG_TITOLARE, out);
            if (d.chiamate >= 2) costo += costoDi(pC, SOGLIE.TOK_PROMPT + SOGLIE.TOK_IMG_CONTROLLO, out);
        });
        var riga = '';
        if (daLeggere || doppioni) {
            if (lingua(opz) === 'en') riga = 'Reading the figures: ' + daLeggere + (daLeggere === 1 ? ' crop' : ' crops') + ' to read (' + foto + (foto === 1 ? ' photo' : ' photos') + ' with one reading, ' + doppioni + (doppioni === 1 ? ' duplicate' : ' duplicates') + ' skipped)';
            else riga = 'Lettura delle figure: ' + daLeggere + (daLeggere === 1 ? ' ritaglio' : ' ritagli') + ' da leggere (' + foto + ' foto a una lettura, ' + doppioni + (doppioni === 1 ? ' doppione saltato' : ' doppioni saltati') + ')';
        }
        return { daLeggere: daLeggere, foto: foto, disegni: disegni, doppioni: doppioni, chiamateMax: chiamateMax, costoCHF: costo, riga: riga };
    }

    /* ── il payload delle letture (§5.5): il ponte lo rispetta con `_respectTemp` e `penalita: false` ── */
    function payloadLettura(opz) {
        opz = opz || {};
        return {
            generationConfig: { temperature: SOGLIE.TEMPERATURA, _respectTemp: true, maxOutputTokens: SOGLIE.TOKEN_USCITA },
            penalita: false, pensiero: false, immagini: true, attesaMs: SOGLIE.ATTESA_MS, inVolo: SOGLIE.CHIAMATE_IN_VOLO,
            mime: opz.mime || 'image/jpeg'
        };
    }

    /* ── lo schema del `.figure.json` (§5.7): una testata per PDF, una voce per ritaglio ──
       Percorsi relativi, mai assoluti (ADR 0011, inv. 7); si scrive solo se il vault c'è (lo decide il modulo). */
    function percorsoRelativo(p) {
        var s = String(p || '');
        if (!s || /^(\/|\\\\|[A-Za-z]:[\\/])/.test(s)) throw new Error('il .figure.json vuole un percorso relativo al vault, non «' + s + '»');
        return s.replace(/\\/g, '/');
    }
    var dossier = {
        nuovo: function (t) {
            t = t || {};
            return { versione: 1, impronta: String(t.impronta || ''), file: percorsoRelativo(t.file), pagine: t.pagine || null, creato: new Date().toISOString(),
                aggiornato: null, google: null, ritagli: [], chiamate: {}, stati: { verdi: 0, gialli: 0, rossi: 0, nonLetti: 0 }, parziali: 0 };
        },
        ritaglio: function (v) {
            v = v || {};
            return Object.assign({ identita: null, pagina: null, rettPt: null, tipo: null, motivo: null, caso: null, chiamate: null, modelli: null, ppi: null, qualita: null,
                data: new Date().toISOString(), stato: null, letture: null, gialle: [], forseManca: [], testoCorretto: null, nota: null }, v);
        },
        trova: function (d, identita) {
            var r = ((d && d.ritagli) || []).filter(function (x) { return x.identita === identita; });
            return r.length ? r[0] : null;
        },
        /* 0114, lotto 4 (D5): col «Sì» a Google dopo un «No» una pagina scansione letta da Tesseract (rosso «parziale») si
           rilegge con Google al CREA successivo; senza `opz.google` tutto come prima. */
        daRileggere: function (voce, opz) {
            if (!voce) return false;
            if (voce.stato === 'non letto') return true;
            return !!(opz && opz.google) && voce.tipo === 'SCANSIONE' && !!voce.modelli && voce.modelli.titolare === 'tesseract';
        },
        /* 0114 (revisione 1 dell'ADR, punto 3): «controllata dal docente» non è uno stato nuovo, si deduce. Vale per un rosso o un
           giallo con `confermato` (la figura intera) e per un giallo le cui righe gialle stanno TUTTE in `righeConfermate`
           (riga per riga, confronto con `compatta`). Il verde non ha bisogno di conferma: non è «controllata». */
        controllata: function (v) {
            if (!v || (v.stato !== 'giallo' && v.stato !== 'rosso')) return false;
            if (v.confermato) return true;
            if (v.stato !== 'giallo' || !v.righeConfermate || !v.righeConfermate.length) return false;
            var gialle = (v.righe || []).filter(function (r) { return r && r.verde === false; });
            if (!gialle.length) return false;
            var ok = {};
            v.righeConfermate.forEach(function (t) { ok[compatta(t)] = true; });
            return gialle.every(function (r) { return !!ok[compatta(r.testo)]; });
        },
        /* Il contatore della colonna di ELABORA, in UN posto solo (§5 del packet 0114, inv. 6): gialli non controllati,
           rossi non confermati, non letti. */
        daControllare: function (d) {
            var self = this;
            return ((d && d.ritagli) || []).filter(function (v) {
                if (!v) return false;
                if (v.stato === 'non letto') return true;
                return (v.stato === 'giallo' || v.stato === 'rosso') && !self.controllata(v);
            }).length;
        },
        /* La data di una voce per la riconciliazione: la più recente fra lettura, correzione, conferma e ultimo gesto. */
        dataDi: function (v) {
            return [v && v.data, v && v.corretto, v && v.confermato, v && v.toccato].filter(Boolean).sort().pop() || '';
        },
        /* Deposito e vault (revisione 1 dell'ADR, punto 1): per ogni ritaglio vince la voce con la data più recente; la
           risposta a Google viene dal dossier aggiornato per ultimo (o da quello che ce l'ha). `cambiaA`/`cambiaB` dicono
           se il risultato è diverso da A o da B, cioè chi va riscritto. Un dossier solo si tiene com'è. */
        unisci: function (a, b) {
            if (!a || !b) { var uno = a || b || null; return { dossier: uno, cambiaA: !a && !!b, cambiaB: !b && !!a }; }
            var self = this, perId = {}, ordine = [], cambiaA = false, cambiaB = false;
            a.ritagli.forEach(function (v) { perId[v.identita] = { a: v }; ordine.push(v.identita); });
            b.ritagli.forEach(function (v) { if (!perId[v.identita]) { perId[v.identita] = {}; ordine.push(v.identita); } perId[v.identita].b = v; });
            var ritagli = ordine.map(function (id) {
                var x = perId[id];
                if (!x.b) { cambiaB = true; return x.a; }
                if (!x.a) { cambiaA = true; return x.b; }
                var da = self.dataDi(x.a), db = self.dataDi(x.b);
                if (db > da) { cambiaA = true; return x.b; }
                if (da > db) cambiaB = true;
                return x.a;
            });
            var recenteB = String(b.aggiornato || '') > String(a.aggiornato || '');
            var google = (recenteB ? (b.google || a.google) : (a.google || b.google)) || null;
            if (google !== (a.google || null)) cambiaA = true;
            if (google !== (b.google || null)) cambiaB = true;
            var d = Object.assign({}, a, { ritagli: ritagli, google: google });
            this.riassumi(d);
            return { dossier: d, cambiaA: cambiaA, cambiaB: cambiaB };
        },
        riassumi: function (d) {
            var r = { ritagli: 0, saltati: 0, stati: { verdi: 0, gialli: 0, rossi: 0, nonLetti: 0 }, chiamate: {}, parziali: 0 };
            ((d && d.ritagli) || []).forEach(function (v) {
                r.ritagli++;
                if (v.stato === 'verde') r.stati.verdi++; else if (v.stato === 'giallo') r.stati.gialli++; else if (v.stato === 'rosso') r.stati.rossi++;
                else if (v.stato === 'non letto') r.stati.nonLetti++; else r.saltati++;
                if (v.nota === 'parziale') r.parziali++;
                var mod = v.modelli || {};
                ['titolare', 'controllo'].forEach(function (ruolo) { if (mod[ruolo] && v.letture && v.letture[ruolo] != null) r.chiamate[mod[ruolo]] = (r.chiamate[mod[ruolo]] || 0) + 1; });
            });
            if (d) { d.stati = r.stati; d.chiamate = r.chiamate; d.parziali = r.parziali; d.aggiornato = new Date().toISOString(); }
            return r;
        }
    };

    return {
        VERSIONE: VERSIONE, SOGLIE: SOGLIE, MODELLI: MODELLI, LEGENDA: LEGENDA, SEGNO_APRE: SEGNO_APRE, SEGNO_CHIUDE: SEGNO_CHIUDE, CODA: CODA, MARC: MARC,
        norm: norm, parole: parole, parolaPiena: parolaPiena, parolaPienaLettere: parolaPienaLettere, lcs: lcs, compatta: compatta,
        attiva: attiva,
        fondi: fondi, fondiVerticale: fondiVerticale, conMargine: conMargine, ppiLimitato: ppiLimitato, pixelDi: pixelDi, pianoCompressione: pianoCompressione,
        geometriaScansione: geometriaScansione, statoPagina: statoPagina, statiPdf: statiPdf, scansioneNonLetta: scansioneNonLetta, ritagli: ritagli, applicaTetto: applicaTetto,
        rigaFormula: rigaFormula, frammento: frammento, regioniFormule: regioniFormule, righeNellaRegione: righeNellaRegione,
        doppione: doppione, smista: smista, dopoTitolare: dopoTitolare,
        prompt: prompt, lettore: lettore, lettoreFormule: lettoreFormule, pulisci: pulisci,
        latexPiano: latexPiano, normFormula: normFormula, atomiFormula: atomiFormula,
        accordo: accordo, stato: stato, statoR0: statoR0,
        marcatori: { figure: marcatoriFigure, testoImmagini: marcatoriTestoImmagini, formule: marcatoriFormule, accoda: accoda, segno: segno },
        innesta: innesta,
        impronta: impronta, identita: identita,
        modelloPer: modelloPer, stima: stima, payloadLettura: payloadLettura,
        dossier: dossier,
        _tSafe: _tSafe
    };
});
