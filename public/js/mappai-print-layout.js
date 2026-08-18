/**
 * mappai-print-layout.js — i NUMERI del FOGLIO FLASHCARD, in un posto solo.
 *
 * ⚠️ AMBITO: solo le flashcard. Il foglio con le etichette dei nodi
 * (printAllNodeLabels in mappai-print-dossier.js) è una funzione SEPARATA e
 * INDIPENDENTE, con misure proprie: non legge nulla da qui e non deve farlo.
 *
 * Perché esiste: lo stesso foglio flashcard esce da due motori diversi
 * (HTML/CSS per la stampa dal browser e la conversione printToPDF, jsPDF per il
 * PDF scaricato). Finché le misure vivevano dentro i due builder, i due fogli
 * divergevano di qualche millimetro a ogni ritocco. Qui c'è UNA definizione; i
 * due builder la leggono e si limitano a disegnare.
 *
 * Puro: nessun DOM, nessun appState. UMD → usabile nei test Node.
 * Unità: MILLIMETRI per la geometria, PUNTI (pt) per i corpi del testo.
 *
 * Modello utente: le misure si possono sovrascrivere senza toccare il codice
 * (localStorage 'mappai_print_layout', oppure importModel(json)); exportModel()
 * restituisce il modello corrente, da salvare o passare a un'altra macchina.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIPrintLayout = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STORE_KEY = 'mappai_print_layout';

    // ── DEFAULT ──────────────────────────────────────────────────────────────
    // I valori qui sotto SONO il foglio: cambiarli cambia stampa, PDF e vault.
    var DEFAULTS = {
        // Foglio A4. In orizzontale 297×210, in verticale 210×297.
        page: { w: 297, h: 210 },

        flash: {
            // Margini di pagina: identici al foglio dei nodi.
            margins: { x: 10, y: 15 },
            // Tolleranza sottratta a ogni carta: l'arrotondamento del motore di
            // stampa non deve spingere l'ultima riga sulla pagina successiva.
            bleed: 0.2,
            formats: {
                '2x2': { cols: 2, rows: 2, landscape: true },
                '2x2v': { cols: 2, rows: 2, landscape: false },   // 4 carte, A4 verticale
                '2x1': { cols: 2, rows: 1, landscape: true },     // 2 carte grandi
                '3x2': { cols: 3, rows: 2, landscape: true },
                '4x3': { cols: 4, rows: 3, landscape: true },
                '2x3': { cols: 2, rows: 3, landscape: false },
                '2x4': { cols: 2, rows: 4, landscape: false }
            },
            card: {
                radius: 3,        // mm — raggio del bordo di taglio (0 = spigolo vivo)
                padX: 4,          // mm — margine laterale del testo
                padTop: 1.5,      // mm — sopra la testata (metà domanda)
                padBottom: 2.5,   // mm
                backPadTop: 1.3,  // mm — sopra l'etichetta RISPOSTA (metà risposta)
                splitPct: 50,     // % di altezza della metà domanda
                headGap: 1.2,     // mm — fra testata e domanda
                lblGap: 0.8,      // mm — fra «RISPOSTA» e il testo
                explGap: 1.2      // mm — fra risposta e spiegazione
            },
            // Corpi di partenza per formato. Non sono fissi: il foglio cerca il
            // corpo più grande a cui NESSUNA carta sborda (uguale per tutte).
            type: {
                // q = corpo della domanda · a = corpo della risposta (se assente
                // deriva da answerRatio) · grow:false = corpo FISSO, scende solo
                // se una carta non ci sta, non cresce mai oltre q.
                '2x2v': { q: 13, a: 13, head: 9, min: 8, grow: false },   // formato scelto
                '2x2': { q: 18, head: 9, min: 8 },
                '2x1': { q: 22, head: 10, min: 9 },
                '3x2': { q: 14, head: 8, min: 6 },
                '4x3': { q: 10.5, head: 6.5, min: 5 },
                '2x3': { q: 15, head: 8.5, min: 6 },
                '2x4': { q: 12.5, head: 8, min: 5.5 },
                qMaxRatio: 1.6,    // tetto della domanda = q × questo
                aMaxRatio: 1.25,   // tetto della risposta (mai oltre la domanda)
                answerRatio: 0.8,  // corpo di partenza della risposta = q × questo
                explRatio: 1,      // spiegazione: STESSO corpo della risposta (in corsivo)
                lineH: 1.35,       // interlinea
                headLineH: 1.3,
                step: 0.25,        // granularità della ricerca del corpo
                floor: 6,          // corpo sotto il quale non si scende MAI (leggibilità)
                // Larghezza di un carattere in em. Space Mono è monospazio
                // (misurato: 0,612): l'a-capo si calcola esattamente qui, senza
                // browser → il foglio non dipende da uno script a runtime.
                advance: 0.612,
                // La testata è spaziata (letter-spacing): ogni carattere occupa
                // di più. Senza contarlo, «TEMA: …» andava a capo una riga più
                // del previsto e la domanda sbordava dalla sua metà.
                headLetterSpacing: 0.06,
                // Quota della carta assegnata alla domanda: un NUMERO la fissa
                // (50 = carta divisa a metà, piega al centro), 'auto' la calcola
                // dal testo restando fra splitMin e splitMax.
                split: 50, splitMin: 38, splitMax: 66
            },
            // Linee di taglio. 'card' = un rettangolo tratteggiato per carta
            // (resa del foglio dei nodi); 'grid' = linee continue da bordo a
            // bordo del blocco di carte, più comode con la taglierina.
            cut: {
                style: 'card',
                color: '#ff8a00',
                width: 0.35,       // mm
                dash: [1, 1],      // mm acceso/spento (vuoto = linea piena)
                marks: false,      // crocini di taglio nel margine di pagina
                markLen: 4,        // mm
                markGap: 1.5       // mm fra fine carta e inizio crocino
            },
            fold: { color: '#cbd5e1', width: 0.2, dash: [0.8, 1.2], inset: 4 },
            // Etichette della carta. VUOTE = non stampate: la seconda riga della
            // testata è la sola area tematica (senza «TEMA:») e la risposta parte
            // subito, senza la scritta «RISPOSTA». Più aria per il testo.
            labels: { themePrefix: '', answer: '' },
            colors: {
                back: '#f0fdf4',   // fondo della metà risposta
                accent: '#059669', // riga 1 della testata (mappa)
                muted: '#64748b',  // riga 2 (TEMA) ed etichetta RISPOSTA
                ink: '#1e293b',
                expl: '#475569'
            },
            // Cap della spiegazione sulla carta (caratteri).
            explMax: 220,
            // SOGLIE DI CARATTERI — la regola editoriale che il docente vede.
            // Non sono inventate: si ricavano dalla geometria della carta al
            // corpo dichiarato (vedi charLimits). `waste` tiene conto dello
            // spazio perso dall'a-capo sulle parole; `explLinesReserved` è lo
            // spazio che la risposta lascia alla spiegazione quando c'è.
            // Un numero esplicito qui SOVRASCRIVE quello calcolato.
            limits: { waste: 0.9, explLinesReserved: 2, question: null, answer: null, explanation: null },
            // Testo a bandiera (non giustificato): è la resa consigliata per i
            // lettori dislessici — niente spaziature irregolari fra le parole —
            // ed è anche l'unica che jsPDF sa riprodurre uguale all'HTML.
            justify: false
        }
    };

    // ── merge / modello utente ───────────────────────────────────────────────
    function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

    // Merge profondo NON distruttivo: gli array si sostituiscono (dash, ecc.).
    function merge(base, over) {
        if (!isObj(over)) return clone(base);
        var out = clone(base);
        Object.keys(over).forEach(function (k) {
            if (isObj(out[k]) && isObj(over[k])) out[k] = merge(out[k], over[k]);
            else if (over[k] !== undefined) out[k] = clone(over[k]);
        });
        return out;
    }
    function clone(v) {
        if (Array.isArray(v)) return v.slice();
        if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clone(v[k]); }); return o; }
        return v;
    }

    function readStore() {
        try {
            if (typeof localStorage === 'undefined') return null;
            var raw = localStorage.getItem(STORE_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            return isObj(obj) ? obj : null;
        } catch (e) { return null; }
    }
    function writeStore(obj) {
        try {
            if (typeof localStorage === 'undefined') return false;
            if (obj == null) localStorage.removeItem(STORE_KEY);
            else localStorage.setItem(STORE_KEY, JSON.stringify(obj));
            return true;
        } catch (e) { return false; }
    }

    var _override = null;   // override in memoria (ha la precedenza sul disco)

    // Tokens correnti = default + modello utente.
    function get() { return merge(DEFAULTS, _override || readStore() || {}); }

    // Applica un modello (solo in memoria se persist=false).
    function setModel(obj, persist) {
        _override = isObj(obj) ? clone(obj) : null;
        if (persist !== false) writeStore(_override);
        return get();
    }
    function clearModel() { _override = null; writeStore(null); return get(); }
    function exportModel() { return JSON.stringify(get(), null, 2); }
    function importModel(json) {
        var obj = (typeof json === 'string') ? JSON.parse(json) : json;
        if (!isObj(obj)) throw new Error('modello non valido: atteso un oggetto');
        var bad = validate(merge(DEFAULTS, obj));
        if (bad.length) throw new Error('modello non valido: ' + bad.join(' · '));
        return setModel(obj, true);
    }

    // Controlli minimi: un modello sbagliato non deve produrre fogli vuoti o
    // carte più grandi della pagina (fallirebbero in silenzio, in stampa).
    function validate(tk) {
        var errs = [];
        var f = (tk && tk.flash) || {};
        if (!f.formats || !Object.keys(f.formats).length) errs.push('flash.formats vuoto');
        if (!(f.margins && f.margins.x >= 0 && f.margins.y >= 0)) errs.push('flash.margins negativi');
        Object.keys(f.formats || {}).forEach(function (k) {
            var fmt = f.formats[k];
            if (!(fmt.cols > 0 && fmt.rows > 0)) errs.push('formato ' + k + ': cols/rows non validi');
            var g = geom(k, tk);
            if (g.cardW <= 2 * (f.card ? f.card.padX : 0)) errs.push('formato ' + k + ': carta più stretta dei margini interni');
            if (g.cardH <= 8) errs.push('formato ' + k + ': carta troppo bassa');
        });
        var t = f.type || {};
        if (!(t.lineH > 0.8)) errs.push('flash.type.lineH fuori scala');
        if (!(t.step > 0 && t.step <= 2)) errs.push('flash.type.step fuori scala');
        return errs;
    }

    // ── geometria del foglio flashcard ───────────────────────────────────────
    // Default: 2×2 VERTICALE (4 carte da 95×133 mm su A4 in piedi) — è il
    // formato scelto per le flashcard: carta alta, domande lunghe respirano.
    var FLASH_DEFAULT_FMT = '2x2v';

    function r2(n) { return Math.round(n * 100) / 100; }

    // Misure derivate di un formato. Sempre definita: chiave sconosciuta → 2x2.
    function geom(fmtKey, tokens) {
        var tk = tokens || get();
        var F = tk.flash;
        var key = (F.formats && F.formats[fmtKey]) ? fmtKey : FLASH_DEFAULT_FMT;
        // il carattere in vigore comanda; senza annuncio vale il modello
        var f = F.formats[key] || F.formats[FLASH_DEFAULT_FMT];
        var pageW = f.landscape ? tk.page.w : tk.page.h;
        var pageH = f.landscape ? tk.page.h : tk.page.w;
        var cw = (pageW - 2 * F.margins.x) / f.cols;
        var rh = (pageH - 2 * F.margins.y) / f.rows;
        var type = merge(F.type[key] || F.type[FLASH_DEFAULT_FMT], {});
        // Corpo della risposta: esplicito (type.a) o derivato dalla domanda.
        var aRatio = (type.a != null) ? (type.a / type.q) : F.type.answerRatio;
        // grow:false → il corpo non cresce mai oltre quello dichiarato.
        var qMax = (type.grow === false) ? type.q : r2(type.q * F.type.qMaxRatio);
        return {
            key: key, cols: f.cols, rows: f.rows, landscape: !!f.landscape,
            pageW: pageW, pageH: pageH,
            marginX: F.margins.x, marginY: F.margins.y,
            cardW: r2(cw - F.bleed), cardH: r2(rh - F.bleed),
            gridW: r2(cw * f.cols), gridH: r2(rh * f.rows),
            perPage: f.cols * f.rows,
            q: type.q, head: type.head, min: type.min,
            qMax: qMax,
            aStart: r2(type.q * aRatio),
            aMax: r2(type.q * F.type.aMaxRatio),
            explRatio: F.type.explRatio, lineH: F.type.lineH,
            headLineH: F.type.headLineH, step: F.type.step,
            // parametri dell'impaginazione deterministica (vedi fitFlash)
            floor: F.type.floor, advance: _adv(F),
            headAdvance: _advHead(F),
            answerRatio: aRatio,
            splitMode: F.type.split, splitMin: F.type.splitMin, splitMax: F.type.splitMax,
            card: clone(F.card), cut: clone(F.cut), fold: clone(F.fold),
            colors: clone(F.colors), explMax: F.explMax, limits: clone(F.limits),
            labels: clone(F.labels || { themePrefix: '', answer: '' }),
            justify: !!F.justify,
            headLetterSpacing: F.type.headLetterSpacing || 0
        };
    }

    /* ══ LE METRICHE DEL CARATTERE IN VIGORE ═══════════════════════════════
       Questo modulo impagina CONTANDO i caratteri (charsPerLine): è la
       proprietà per cui una carta esce giusta anche senza JavaScript, in
       printToPDF e in un PDF fatto con jsPDF. Il conto però dipende da QUALE
       carattere si sta usando, e dal 18/8 non è più solo Space Mono.

       Le metriche arrivano da fuori invece che essere lette da `window`: questo
       modulo gira anche in Node, nei test. Chi conosce il carattere
       (mappai-font.js) le annuncia una volta, e i chiamanti di flashGeom non
       cambiano di una riga.

       ⚠️ `headAdvance` si DICHIARA, non si somma: le testate sono maiuscole e
       spaziate, e sui caratteri proporzionali `advance + letterSpacing` sta
       sotto del 27% a quello che serve davvero. Se chi annuncia non lo dichiara
       si ricade sulla somma, che è il comportamento storico di Space Mono. */
    function setFontMetrics(m) {
        _fm = (m && m.advance > 0) ? { advance: m.advance, headAdvance: m.headAdvance || 0 } : null;
    }
    function fontMetrics() { return _fm ? { advance: _fm.advance, headAdvance: _fm.headAdvance } : null; }

    function formats() { return Object.keys(get().flash.formats); }

    // Riquadri delle carte di UNA pagina, in mm dall'angolo della pagina.
    function cardBoxes(g) {
        var out = [];
        var stepX = g.cardW + (g.gridW / g.cols - g.cardW);   // passo = larghezza piena
        var stepY = g.cardH + (g.gridH / g.rows - g.cardH);
        for (var r = 0; r < g.rows; r++) {
            for (var c = 0; c < g.cols; c++) {
                out.push({
                    x: r2(g.marginX + c * stepX), y: r2(g.marginY + r * stepY),
                    w: g.cardW, h: g.cardH, row: r, col: c, slot: r * g.cols + c
                });
            }
        }
        return out;
    }

    // Linee di taglio a GRIGLIA: segmenti continui da bordo a bordo del blocco
    // (una passata di taglierina taglia tutta la colonna/riga) più, se richiesti,
    // i crocini nel margine di pagina.
    function cutLines(g) {
        var segs = [];
        var x0 = g.marginX, y0 = g.marginY;
        var x1 = r2(x0 + g.gridW), y1 = r2(y0 + g.gridH);
        var i;
        for (i = 0; i <= g.cols; i++) {
            var x = r2(x0 + i * (g.gridW / g.cols));
            segs.push({ x1: x, y1: y0, x2: x, y2: y1, kind: 'v' });
        }
        for (i = 0; i <= g.rows; i++) {
            var y = r2(y0 + i * (g.gridH / g.rows));
            segs.push({ x1: x0, y1: y, x2: x1, y2: y, kind: 'h' });
        }
        return segs;
    }

    // Crocini di taglio: trattini corti FUORI dal blocco carte, dentro il
    // margine di pagina. Servono quando le linee non si stampano sul foglio.
    function cropMarks(g) {
        var m = [], len = g.cut.markLen, gap = g.cut.markGap;
        var x0 = g.marginX, y0 = g.marginY;
        var x1 = r2(x0 + g.gridW), y1 = r2(y0 + g.gridH);
        var i, x, y;
        for (i = 0; i <= g.cols; i++) {
            x = r2(x0 + i * (g.gridW / g.cols));
            m.push({ x1: x, y1: r2(y0 - gap - len), x2: x, y2: r2(y0 - gap), kind: 'top' });
            m.push({ x1: x, y1: r2(y1 + gap), x2: x, y2: r2(y1 + gap + len), kind: 'bottom' });
        }
        for (i = 0; i <= g.rows; i++) {
            y = r2(y0 + i * (g.gridH / g.rows));
            m.push({ x1: r2(x0 - gap - len), y1: y, x2: r2(x0 - gap), y2: y, kind: 'left' });
            m.push({ x1: r2(x1 + gap), y1: y, x2: r2(x1 + gap + len), y2: y, kind: 'right' });
        }
        // Un crocino non deve finire fuori dal foglio.
        return m.filter(function (s) {
            return s.x1 >= 0 && s.y1 >= 0 && s.x2 <= g.pageW && s.y2 <= g.pageH;
        });
    }

    // ── ricerca del corpo del testo ──────────────────────────────────────────
    // Bisezione sul corpo: il più grande a cui il predicato `fits` è vero.
    // Il predicato lo fornisce il motore (DOM nel foglio HTML, metriche del
    // font in jsPDF): qui c'è solo la ricerca, uguale per tutti e due.
    function bestPt(fits, minPt, maxPt, step) {
        var st = step || 0.25;
        var lo = minPt, hi = maxPt, best = minPt, it;
        if (fits(maxPt)) return maxPt;
        for (it = 0; it < 24 && hi - lo > st; it++) {
            var mid = Math.round(((lo + hi) / 2) / st) * st;
            if (mid <= lo) break;
            if (fits(mid)) { best = mid; lo = mid; } else { hi = mid - st; }
        }
        return Math.max(minPt, Math.round(best / st) * st);
    }

    var PT2MM = 0.352778;

    /* Le metriche del CARATTERE in vigore (vedi setFontMetrics più sotto).
       null = nessun annuncio → valgono quelle del modello, cioè Space Mono. */
    var _fm = null;
    function _adv(F) { return (_fm && _fm.advance) || F.type.advance; }
    function _advHead(F) {
        if (_fm && _fm.headAdvance) return _fm.headAdvance;
        return r2(_adv(F) + (F.type.headLetterSpacing || 0));
    }

    // Altezza in mm di un testo mandato a capo su `width` mm.
    // measure(text, pt) → larghezza in mm (la fornisce il motore).
    function textHeight(lines, pt, lineH) { return lines * pt * PT2MM * (lineH || 1.35); }

    // A capo automatico su parole. measureWidth(str) → mm al corpo corrente.
    // Una parola più larga della colonna (un termine tecnico lunghissimo) viene
    // SPEZZATA: altrimenti il motore la disegnerebbe fuori dalla carta, sopra la
    // carta accanto — e il conteggio delle righe (lineCount, che la spezza)
    // direbbe una cosa diversa da quello che finisce sul foglio.
    function wrapLines(text, measureWidth, width) {
        var words = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().split(' ');
        if (!words[0]) return [];
        var lines = [], cur = '';
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (measureWidth(w) > width) {          // nessuno spazio dove andare a capo
                if (cur) { lines.push(cur); cur = ''; }
                var rest = w;
                while (measureWidth(rest) > width) {
                    var lo = 1, hi = rest.length - 1, cut = 1;
                    while (lo <= hi) {              // il pezzo più lungo che ci sta
                        var mid = (lo + hi) >> 1;
                        if (measureWidth(rest.slice(0, mid)) <= width) { cut = mid; lo = mid + 1; }
                        else hi = mid - 1;
                    }
                    lines.push(rest.slice(0, cut));
                    rest = rest.slice(cut);
                }
                cur = rest;
                continue;
            }
            var next = cur ? cur + ' ' + w : w;
            if (measureWidth(next) <= width || !cur) cur = next;
            else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        return lines;
    }

    // ── impaginazione del testo nelle carte (deterministica) ─────────────────
    // Space Mono è MONOSPAZIO: l'a-capo si conta in caratteri, senza misurare
    // nulla nel browser. Perciò il corpo del testo si può decidere QUI, mentre
    // si costruisce il foglio, e non serve nessuno script a runtime: la carta
    // esce giusta anche in un'anteprima senza JavaScript, in printToPDF, o in
    // un PDF fatto con jsPDF.

    // Quanti caratteri stanno in una riga larga `widthMm` al corpo `pt`.
    function charsPerLine(widthMm, pt, advance) {
        return Math.max(1, Math.floor(widthMm / ((advance || 0.612) * pt * PT2MM)));
    }

    // Righe occupate da un testo con a-capo sulle parole (le parole più lunghe
    // della riga vengono spezzate, come fa il browser con word-break).
    function lineCount(text, cpl) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
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
            if (need <= cpl) { len = need; }
            else { lines++; len = w.length; }
        }
        return lines;
    }

    // Altezza in mm di un blocco di testo.
    function blockH(lines, pt, lh) { return lines * pt * PT2MM * (lh || 1.35); }

    // Taglia un testo alle righe disponibili, con i puntini di sospensione.
    // Ultima spiaggia: si usa solo se nemmeno al corpo minimo il testo ci sta.
    function clampToLines(text, cpl, maxLines) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        if (!s || maxLines <= 0) return '';
        if (lineCount(s, cpl) <= maxLines) return s;
        var ell = '…';
        // Il budget in caratteri non basta: l'a-capo sulle parole spreca la coda
        // di ogni riga, e anche il carattere «…» può far nascere una riga in più.
        // Si aggiungono parole finché il testo tagliato, PUNTINI COMPRESI, sta
        // davvero nelle righe concesse.
        var words = s.split(' '), acc = '';
        for (var i = 0; i < words.length; i++) {
            var cand = (acc ? acc + ' ' + words[i] : words[i]).replace(/[\s.,;:]+$/, '');
            if (lineCount(cand + ell, cpl) > maxLines) break;
            acc = cand;
        }
        if (!acc) {                       // una sola parola più lunga di tutto lo spazio
            acc = s.slice(0, Math.max(1, cpl * maxLines));
            while (acc.length > 1 && lineCount(acc + ell, cpl) > maxLines) acc = acc.slice(0, -1);
        }
        var out = acc + ell;
        return lineCount(out, cpl) <= maxLines ? out : ell;   // ultima rete
    }

    // Altezze richieste dalle due metà di una carta, a un dato corpo.
    function cardNeeds(item, g, headLines, pt) {
        var innerW = g.cardW - 2 * g.card.padX;
        var qLines = lineCount(item.question, charsPerLine(innerW, pt.q, g.advance));
        var aLines = lineCount(item.answer, charsPerLine(innerW, pt.a, g.advance));
        var eLines = pt.e && item.explanation
            ? lineCount(item.explanation, charsPerLine(innerW, pt.e, g.advance)) : 0;
        var front = g.card.padTop
            + blockH(headLines, pt.head, g.headLineH) + g.card.headGap
            + blockH(qLines, pt.q, g.lineH) + g.card.padBottom;
        // L'etichetta «RISPOSTA» occupa una riga: se è vuota (default), quella
        // riga va al testo della risposta.
        var lbl = (g.labels && g.labels.answer) ? blockH(1, pt.head, g.headLineH) + g.card.lblGap : 0;
        var back = g.card.backPadTop + lbl
            + blockH(aLines, pt.a, g.lineH)
            + (eLines ? g.card.explGap + blockH(eLines, pt.e, g.lineH) : 0)
            + g.card.padBottom;
        return { front: front, back: back, qLines: qLines, aLines: aLines, eLines: eLines };
    }

    /**
     * SOGLIE DI CARATTERI della carta, ricavate dalla geometria.
     * Sono la regola che il docente vede nell'editor e che filtra le carte
     * generate in automatico: «una domanda oltre N caratteri non entra».
     * Il motore di impaginazione resta l'ultima difesa (rimpicciolisce, toglie
     * la spiegazione, accorcia con «…»), ma su carta è meglio non arrivarci.
     *
     * g: geometria (flashGeom) · head: {root, theme} (la testata ruba spazio
     * alla domanda: più è lunga, meno caratteri restano).
     * Ritorna { question, answer, explanation, qLines, aLines, cpl }.
     */
    function charLimits(g, head, opts) {
        opts = opts || {};
        var L = g.limits || { waste: 0.9, explLinesReserved: 2 };
        var innerW = g.cardW - 2 * g.card.padX;
        var split = (opts.split != null) ? opts.split
            : (g.splitMode === 'auto' ? g.card.splitPct : (typeof g.splitMode === 'number' ? g.splitMode : g.card.splitPct));
        var headCpl = charsPerLine(innerW, g.head, g.headAdvance || g.advance);
        var headStrings = (head && head.lines) || (head ? [head.root || '', head.theme || ''] : ['', '']);
        var headLines = head
            ? headStrings.reduce(function (n, s) { return n + lineCount(s, headCpl); }, 0)
            : 2;
        var qStep = g.q * PT2MM * g.lineH;
        var aPt = Math.min(g.q, Math.max(g.floor, g.q * (g.answerRatio || 0.8)));
        var aStep = aPt * PT2MM * g.lineH;
        var ePt = aPt * g.explRatio;
        var eStep = ePt * PT2MM * g.lineH;

        var frontAvail = g.cardH * split / 100 - g.card.padTop
            - blockH(headLines, g.head, g.headLineH) - g.card.headGap - g.card.padBottom;
        var lblH = (g.labels && g.labels.answer)
            ? blockH(1, g.head, g.headLineH) + g.card.lblGap : 0;
        var backAvail = g.cardH * (100 - split) / 100 - g.card.backPadTop
            - lblH - g.card.padBottom;

        var qLines = Math.max(1, Math.floor(frontAvail / qStep));
        var eLines = (opts.withExpl === false) ? 0 : (L.explLinesReserved || 0);
        var backForAnswer = backAvail - (eLines ? g.card.explGap + eLines * eStep : 0);
        var aLines = Math.max(1, Math.floor(backForAnswer / aStep));

        var qCpl = charsPerLine(innerW, g.q, g.advance);
        var aCpl = charsPerLine(innerW, aPt, g.advance);
        var eCpl = charsPerLine(innerW, ePt, g.advance);
        var w = L.waste || 0.9;
        // Arrotondati per DIFETTO alla decina: un numero tondo è una regola che
        // il docente ricorda («massimo 180 caratteri»), e sta dal lato sicuro.
        var round10 = function (n) { return Math.max(10, Math.floor(n / 10) * 10); };
        return {
            question: (L.question != null) ? L.question : round10(qLines * qCpl * w),
            answer: (L.answer != null) ? L.answer : round10(aLines * aCpl * w),
            explanation: (L.explanation != null) ? L.explanation
                : Math.min(g.explMax, round10(eLines * eCpl * w)),
            qLines: qLines, aLines: aLines, cpl: qCpl, headLines: headLines, split: split
        };
    }

    /**
     * Vincolo di stampa da appendere al prompt di generazione delle flashcard.
     * Tre righe: costa ~30 token e fa risparmiare al docente il lavoro di
     * accorciare a mano. URL e formule sono banditi perché sono blocchi che non
     * si spezzano: escono dalla carta e non c'entrano nulla con una flashcard.
     */
    function promptRule(g, head, lang) {
        var L = charLimits(g || geom(), head || null);
        if (String(lang || 'it').slice(0, 2).toLowerCase() === 'en') {
            return '\n\nPRINT LIMITS (the card is physical): question max ' + L.question +
                ' characters, answer max ' + L.answer + '. Be concise and complete within that space. ' +
                'Never use URLs, web addresses, code or formulas.';
        }
        return '\n\nVINCOLI DI STAMPA (la carta è fisica): domanda max ' + L.question +
            ' caratteri, risposta max ' + L.answer + '. Stai dentro quello spazio restando completo. ' +
            'Non usare mai URL, indirizzi web, codice o formule.';
    }

    // Carte fuori soglia: quelle che il docente deve accorciare a mano.
    // items già normalizzati ({question, answer, explanation}).
    function overLimit(items, limits) {
        var out = [];
        (items || []).forEach(function (it, i) {
            var q = String((it && it.question) || '').length;
            var a = String((it && it.answer) || '').length;
            if (q > limits.question || a > limits.answer) {
                out.push({
                    i: i, question: q, answer: a,
                    tooLong: (q > limits.question ? (a > limits.answer ? 'entrambe' : 'domanda') : 'risposta')
                });
            }
        });
        return out;
    }

    function sizesFor(qPt, g) {
        var a = Math.min(qPt, Math.max(g.floor, qPt * (g.answerRatio || 0.8)));
        // Anche la spiegazione ha un minimo leggibile: senza questo clamp con
        // corpi bassi finiva a 4-5 pt, cioè illeggibile su carta. Alzandola qui
        // se ne accorge anche la ricerca del corpo (misura e disegno restano
        // coerenti): al massimo scatta la degradazione già prevista, che la
        // toglie del tutto invece di stamparla in miniatura.
        return { q: qPt, a: r2(a), e: r2(Math.max(g.floor, a * g.explRatio)), head: g.head };
    }

    /**
     * Sceglie i corpi del testo (e la posizione della piega) perché NESSUNA
     * carta sbordi. Deterministico: stessa risposta a ogni chiamata, in Node
     * come nel browser.
     *
     * items: [{question, answer, explanation}] · head: {root, theme}
     * opts.policy 'uniform' (un corpo per tutto il foglio, resa da foglio nodi)
     *             'card'    (ogni carta al corpo più grande che regge)
     * Ritorna { split, q, a, e, head, perCard[], dropExpl, clip[] }.
     */
    function fitFlash(items, g, head, opts) {
        opts = opts || {};
        var list = (items || []).map(function (it) {
            return {
                question: (it && it.question) || '',
                answer: (it && it.answer) || '',
                explanation: (opts.withExpl === false) ? '' : ((it && it.explanation) || '')
            };
        });
        var innerW = g.cardW - 2 * g.card.padX;
        // La testata è spaziata → carattere più largo (headAdvance).
        var headCpl = charsPerLine(innerW, g.head, g.headAdvance || g.advance);
        // Si contano le righe delle stringhe DAVVERO stampate: le compone il
        // chiamante (che sa se mette un prefisso, e su quale ripiego cade se la
        // mappa non ha un titolo). Contare qualcos'altro significa promettere
        // spazio che sul foglio non c'è → ultima riga tagliata.
        var headStrings = (head && head.lines) || [
            (head && head.root) || '',
            (head && head.theme) || ''
        ];
        var headLines = headStrings.reduce(function (n, s) { return n + lineCount(s, headCpl); }, 0);
        // Piega: fissa (numero, es. 50 = carta divisa a metà) oppure 'auto'.
        var splitFixed = (g.splitMode === 'auto') ? null
            : (typeof g.splitMode === 'number' ? g.splitMode : g.card.splitPct);
        var splits = [];
        if (splitFixed != null) splits.push(splitFixed);
        else for (var s = g.splitMin; s <= g.splitMax + 0.01; s += 2) splits.push(Math.round(s * 10) / 10);

        // Fronte/retro: le due facce stanno su carte INTERE (pagine diverse),
        // non su due metà della stessa carta.
        var duplex = !!opts.duplex;

        function fitsAll(qPt, split, subset) {
            var pt = sizesFor(qPt, g);
            var fH = duplex ? g.cardH : g.cardH * split / 100;
            var bH = duplex ? g.cardH : g.cardH - fH;
            var arr = subset || list;
            for (var i = 0; i < arr.length; i++) {
                var n = cardNeeds(arr[i], g, headLines, pt);
                if (n.front > fH || n.back > bH) return false;
            }
            return true;
        }

        function bestFor(split, subset) {
            var lo = g.floor, hi = g.qMax, st = g.step;
            if (fitsAll(hi, split, subset)) return hi;
            if (!fitsAll(lo, split, subset)) return null;   // non ci sta nemmeno al minimo
            var best = lo;
            for (var it = 0; it < 24 && hi - lo > st; it++) {
                var mid = Math.round(((lo + hi) / 2) / st) * st;
                if (mid <= lo) break;
                if (fitsAll(mid, split, subset)) { best = mid; lo = mid; } else { hi = mid - st; }
            }
            return best;
        }

        // Cerca la coppia (piega, corpo) migliore: prima il corpo più grande,
        // a parità la piega più vicina alla metà (carta più equilibrata).
        function search(subset) {
            var win = null;
            splits.forEach(function (sp) {
                var q = bestFor(sp, subset);
                if (q == null) return;
                if (!win || q > win.q + 0.001 ||
                    (Math.abs(q - win.q) < 0.001 && Math.abs(sp - 50) < Math.abs(win.split - 50))) {
                    win = { split: sp, q: q };
                }
            });
            return win;
        }

        // Toglie la spiegazione SOLO alle carte che senza non ci starebbero:
        // le altre la tengono. Sacrificare tutto il foglio per una carta lunga
        // sarebbe una perdita di contenuto gratuita.
        function senzaSpiegazioniDoveServe(subset, qPt, split) {
            var pt = sizesFor(qPt, g);
            var bH = duplex ? g.cardH : g.cardH * (100 - split) / 100;
            var tolte = 0;
            var out2 = subset.map(function (it) {
                var copia = { question: it.question, answer: it.answer, explanation: it.explanation };
                if (copia.explanation && cardNeeds(copia, g, headLines, pt).back > bH) {
                    copia.explanation = ''; tolte++;
                }
                return copia;
            });
            return { items: out2, tolte: tolte };
        }

        var dropExpl = 0;                 // quante carte hanno perso la spiegazione
        var win = search();
        var conSpiegazioni = list.some(function (it) { return it.explanation; });
        var target = g.qMax;              // corpo dichiarato (grow:false → è anche il massimo)
        if (conSpiegazioni && (!win || win.q < target - 0.001)) {
            // Il corpo richiesto non si raggiunge con tutte le spiegazioni.
            var alt = null;
            splits.forEach(function (sp) {
                var d = senzaSpiegazioniDoveServe(list, target, sp);
                if (!fitsAll(target, sp, d.items)) return;
                if (!alt || d.tolte < alt.tolte ||
                    (d.tolte === alt.tolte && Math.abs(sp - 50) < Math.abs(alt.split - 50))) {
                    alt = { split: sp, q: target, items: d.items, tolte: d.tolte };
                }
            });
            if (alt && (!win || alt.q > win.q + 0.001)) {
                list = alt.items; win = { split: alt.split, q: alt.q }; dropExpl = alt.tolte;
            } else {
                // Nemmeno così: si tolgono tutte e si cerca il corpo massimo.
                var quante = list.filter(function (it) { return it.explanation; }).length;
                var senza = list.map(function (it) {
                    return { question: it.question, answer: it.answer, explanation: '' };
                });
                var win2 = search(senza);
                // Se non ci sta niente nemmeno al corpo minimo (win e win2 nulli),
                // la spiegazione va tolta lo stesso: è la prima cosa che sacrifica
                // spazio, prima di accorciare la risposta con i puntini.
                if ((win2 && (!win || win2.q > win.q + 0.001)) || (!win && !win2)) {
                    dropExpl = quante;
                    list = senza;
                    if (win2) win = win2;
                }
            }
        }
        if (!win) win = { split: splitFixed != null ? splitFixed : 50, q: g.floor };

        var out = {
            split: win.split, dropExpl: dropExpl, clip: [], policy: opts.policy === 'card' ? 'card' : 'uniform'
        };
        var uni = sizesFor(win.q, g);
        out.q = uni.q; out.a = uni.a; out.e = uni.e; out.head = uni.head;
        out.headLines = headLines;

        // Corpo per singola carta: stessa piega (il foglio si piega uguale),
        // ma ogni carta prende il corpo più grande che regge.
        out.perCard = list.map(function (it) {
            var q = bestFor(out.split, [it]);
            var pt = sizesFor(q == null ? g.floor : q, g);
            return { q: pt.q, a: pt.a, e: pt.e };
        });

        // Chi sborda anche al corpo minimo: si segna, e il builder taglia con «…»
        // invece di lasciare che la stampante mangi mezza frase.
        var floorPt = sizesFor(g.floor, g);
        var fH = duplex ? g.cardH : g.cardH * out.split / 100;
        var bH = duplex ? g.cardH : g.cardH - fH;
        list.forEach(function (it, i) {
            var n = cardNeeds(it, g, headLines, floorPt);
            if (n.front > fH) {
                var availQ = fH - g.card.padTop - blockH(headLines, floorPt.head, g.headLineH)
                    - g.card.headGap - g.card.padBottom;
                out.clip.push({
                    i: i, where: 'question',
                    maxLines: Math.max(1, Math.floor(availQ / (floorPt.q * PT2MM * g.lineH))),
                    cpl: charsPerLine(g.cardW - 2 * g.card.padX, floorPt.q, g.advance)
                });
            }
            if (n.back > bH) {
                var availA = bH - g.card.backPadTop - blockH(1, floorPt.head, g.headLineH)
                    - g.card.lblGap - g.card.padBottom
                    - (n.eLines ? g.card.explGap + blockH(n.eLines, floorPt.e, g.lineH) : 0);
                out.clip.push({
                    i: i, where: 'answer',
                    maxLines: Math.max(1, Math.floor(availA / (floorPt.a * PT2MM * g.lineH))),
                    cpl: charsPerLine(g.cardW - 2 * g.card.padX, floorPt.a, g.advance)
                });
            }
        });

        // TESTI DEFINITIVI: è questo che i due motori devono disegnare — già
        // senza le spiegazioni tolte e già accorciati con «…» dove il testo non
        // ci stava nemmeno al corpo minimo. Così HTML e PDF non possono
        // divergere applicando ognuno le proprie regole.
        out.items = list.map(function (it) {
            return { question: it.question, answer: it.answer, explanation: it.explanation };
        });
        out.clip.forEach(function (c) {
            var it = out.items[c.i];
            if (!it) return;
            if (c.where === 'question') it.question = clampToLines(it.question, c.cpl, c.maxLines);
            else it.answer = clampToLines(it.answer, c.cpl, c.maxLines);
        });
        return out;
    }

    return {
        STORE_KEY: STORE_KEY,
        DEFAULTS: DEFAULTS,
        PT2MM: PT2MM,
        charsPerLine: charsPerLine,
        lineCount: lineCount,
        blockH: blockH,
        clampToLines: clampToLines,
        cardNeeds: cardNeeds,
        fitFlash: fitFlash,
        charLimits: charLimits,
        promptRule: promptRule,
        overLimit: overLimit,
        get: get,
        setModel: setModel,
        clearModel: clearModel,
        exportModel: exportModel,
        importModel: importModel,
        validate: validate,
        merge: merge,
        flashGeom: geom, setFontMetrics: setFontMetrics, fontMetrics: fontMetrics,
        flashFormats: formats,
        cardBoxes: cardBoxes,
        cutLines: cutLines,
        cropMarks: cropMarks,
        bestPt: bestPt,
        textHeight: textHeight,
        wrapLines: wrapLines
    };
}));
