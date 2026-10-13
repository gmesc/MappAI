/*
 * mappai-pdf-testo-core.js — il testo di una pagina PDF senza spazi inventati
 * -------------------------------------------------------------------------
 * Packet 0044 (26-28/09/2026). pdf.js spezza una riga in più pezzi anche A METÀ
 * PAROLA (cambio di font, crenatura, legature, comandi separati) e gli spazi veri
 * li codifica già da sé: uno " " dentro `str` o come pezzo a sé quando il vuoto
 * supera 0,1·corpo, e `hasEOL` a fine riga. Incollando SEMPRE i pezzi con uno
 * spazio, l'app inventava «Henr i», «neutrali tà», «L a Svizzera», «Federale ,»,
 * e da `extractPdfPages` il difetto arrivava a prompt, àncora, evidenze, ricerca
 * locale e giudice.
 *
 * Qui il testo si ricostruisce con gli spazi che pdf.js codifica, più una rete
 * geometrica per i pochi confini che pdf.js non segna (cambio di riga, vuoto in
 * avanti, ritorno indietro, apice/pedice con una cifra). Rispetto all'unione
 * vecchia cambiano SOLO gli spazi: la sequenza dei caratteri non-spazio è la
 * stessa (misurato su 3.752 + 754 pagine). Nessun pezzo ridisegnato si salta.
 *
 *   testoPagina(items, { nativa = true })  → una riga, spazi compattati, niente
 *        bordi. Con `nativa:false` è unisciVecchio(items) e nient'altro
 *        (interruttore `mappai_pdf_unione_nativa = '0'` in extractPdfPages).
 *   unisciVecchio(items)  → l'unione di prima, byte per byte. UNICA definizione
 *        rimasta (inv. 6): app.js non ne tiene una copia.
 *   unisciRete(items, opzioni, conta)  → senza compattare; `conta(motivo)` per
 *        ogni spazio che la rete aggiunge o toglie (misure e test).
 *   indiceSenzaSpazi(items) / chiaveSenzaSpazi(s)  → per l'evidenziazione di
 *        ELABORA (`_matchColoredItems`): il confronto ignora gli spazi, quindi
 *        ritrova sia il testo vecchio («Henr i») sia il nuovo («Henri»).
 *   intestazioniRipetute(pagine, opzioni) / chiaveRipetuta(s)  → packet 0045:
 *        le righe ripetute nella fascia alta o bassa di molte pagine, per il
 *        testo che va al MODELLO (`testoPerModello` di extractPdfPages).
 *
 * Tabella dei casi, misure e limiti: docs/tasks/0044-pdf-spazi-inventati.md §4
 * e, per le intestazioni, docs/tasks/0045-intestazioni-dalla-posizione.md §4.
 * Test: tests/pdf-testo-core.test.js (in Node, senza pdf.js: i viewport sono finti).
 *
 * UMD: window.MappAIPdfTesto (browser) / module.exports (Node/test). Nessuna
 * dipendenza. Il reader (iPad) copia app.js ma non chiama mai extractPdfPages:
 * questo core non entra nella sua sincronizzazione.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIPdfTesto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIUSURA = /^[.,;:!?)\]}»”’%…]/u, APERTURA = /[(\[{«“‘'’]$/u;

    // = l'unione di app.js:575 fino al 0044, byte per byte: NIENTE filtro sui
    // pezzi senza `str` (marked content), che `join` rende ''.
    function unisciVecchio(items) { return (items || []).map(it => it.str).join(' '); }

    function geo(it) {
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        return { s: it.str, x: t[4], y: t[5], a: t[0], b: t[1], w: it.width || 0, h: it.height || Math.hypot(t[2], t[3]) || 0 };
    }

    // c rispetto a p, nel verso della riga di p (in punti)
    function rel(p, c) {
        const n = Math.hypot(p.a, p.b) || 1, ux = p.a / n, uy = p.b / n, nc = Math.hypot(c.a, c.b) || 1;
        const dx = c.x - p.x, dy = c.y - p.y;
        return {
            stessoVerso: Math.abs(ux - c.a / nc) < 0.05 && Math.abs(uy - c.b / nc) < 0.05,
            avanti: dx * ux + dy * uy, perp: -dx * uy + dy * ux, H: Math.max(p.h, c.h) || 10
        };
    }

    function prossimoPieno(items, i) {
        for (let j = i + 1; j < items.length; j++) {
            const x = items[j];
            if (typeof x.str === 'string' && x.str.trim()) return x;
            if (x && x.hasEOL) return null;
        }
        return null;
    }

    /* I motivi della rete, con le soglie misurate il 26/09 (in frazioni
       dell'altezza del corpo):
       - 'finto'    pezzo " " largo ~0 fra due pezzi che si toccano (< kFinto):
                    NON separa (maiuscoletto da Word «I TALIA», «[1] .» di jsPDF);
       - 'riga'     cambio di riga o di verso senza hasEOL: spazio;
       - 'avanti'   vuoto in avanti > k senza spazio codificato: spazio («10 a)»);
       - 'indietro' ritorno indietro > kNeg: spazio, tranne dopo un'apertura o
                    prima di una chiusura (punteggiatura dopo il corsivo);
       - 'apice'    apice o pedice con una cifra: spazio («2002 1», «1 La»);
                    i pedici chimici («H2O») restano attaccati. */
    function unisciRete(items, { k = 0.2, kNeg = 0.15, kRiga = 0.5, kFinto = 0.05 } = {}, conta = () => {}) {
        let out = '', prev = null, sep = true;
        for (let i = 0; i < (items || []).length; i++) {
            const it = items[i];
            if (typeof it.str !== 'string') continue;                              // marked content
            const s = it.str;
            if (!s.trim()) {                                                       // pezzo di solo spazio, o vuoto
                if (it.hasEOL) { out += ' '; sep = true; continue; }
                if (!s.length) continue;
                const nx = prossimoPieno(items, i);
                if (prev && !sep && nx && !/^\s/.test(nx.str)) {                   // spazio FINTO: i vicini si toccano
                    const r = rel(prev, geo(nx));
                    if (r.stessoVerso && Math.abs(r.perp) <= kRiga * r.H && (r.avanti - prev.w) / r.H < kFinto) { conta('finto'); continue; }
                }
                out += s; sep = true; continue;
            }
            const cur = geo(it);
            if (prev && !sep && !/\s$/.test(prev.s) && !/^\s/.test(s)) {           // confine SENZA spazio codificato
                const r = rel(prev, cur), gap = (r.avanti - prev.w) / r.H;
                const apice = (cur.h < 0.85 * prev.h && r.perp > 0.12 * r.H && /^\p{Nd}/u.test(s)) ||
                              (prev.h < 0.85 * cur.h && r.perp < -0.12 * r.H && /\p{Nd}$/u.test(prev.s));
                const motivo = !(r.stessoVerso && Math.abs(r.perp) <= kRiga * r.H) ? 'riga'
                    : gap > k ? 'avanti'
                    : (gap < -kNeg && !CHIUSURA.test(s) && !APERTURA.test(prev.s)) ? 'indietro'
                    : apice ? 'apice' : '';
                if (motivo) { out += ' '; conta(motivo); }
            }
            out += s + (it.hasEOL ? ' ' : '');
            sep = !!it.hasEOL;
            prev = cur;
        }
        return out;
    }

    // Il testo della pagina: UNA riga (niente \n: la pretendono stripBoilerplate
    // modo A, registroGiudice e Gulpease), spazi compattati, bordi tolti.
    function testoPagina(items, { nativa = true } = {}) {
        return nativa ? unisciRete(items).replace(/\s+/g, ' ').trim() : unisciVecchio(items);
    }

    /* ── Per l'evidenziazione di ELABORA ─────────────────────────────────────
       Si abbassa CARATTERE PER CARATTERE (per punto di codice), non la stringa
       intera: `toLowerCase` sulla stringa intera è sensibile al contesto sul
       sigma greco (Σ a fine parola → ς, altrove σ), carattere per carattere no.
       E il sigma finale ς si porta su σ, sulle DUE strade: la chiave in ELABORA
       parte da una frase già abbassata per intero (`_normKey`), che a fine parola
       ha già ς, mentre il PDF in maiuscolo dà Σ → σ. Stessa lunghezza (una unità
       → una unità), quindi l'allineamento con `pezzo` non cambia.
       `toLowerCase` può ALLUNGARE («İ» → «i̇», 2 unità): `pezzo` ha una voce per
       OGNI unità di codice di `testo`, allineata 1:1. */
    function _basso(ch) {
        const l = ch.toLowerCase();
        return l === 'ς' ? 'σ' : l;
    }

    function indiceSenzaSpazi(items) {
        const parti = [], pezzo = [];
        (items || []).forEach((it, idx) => {
            if (!it || typeof it.str !== 'string') return;                          // marked content
            for (const ch of it.str) {
                if (/\s/.test(ch)) continue;
                const l = _basso(ch);
                parti.push(l);
                for (let u = 0; u < l.length; u++) pezzo.push(idx);
            }
        });
        return { testo: parti.join(''), pezzo };
    }

    function chiaveSenzaSpazi(s) {
        let out = '';
        for (const ch of String(s == null ? '' : s)) if (!/\s/.test(ch)) out += _basso(ch);
        return out;
    }

    /* ── Le intestazioni ripetute, dalla POSIZIONE (packet 0045, 28/09) ──────
       La regola di Giacomo («sequenze di parole che si ripetono identiche in
       tutte le pagine») più la posizione: un pezzo di riga è un'intestazione o
       un piè di pagina se lo stesso testo cade nella fascia alta o bassa della
       pagina (il 10% dell'altezza) su almeno metà delle pagine, e su almeno 3.
       Il filtro di prima (`stripBoilerplate`, modo A) cerca le parole comuni
       all'INIZIO o alla FINE della riga-pagina e manca le intestazioni che pdf.js
       mette in mezzo al suo ordine di lettura; resta dopo, come seconda passata.

       La chiave tiene solo lettere e cifre, con le cifre rese uguali: la stessa
       intestazione esce con punteggiatura diversa da una pagina all'altra, e
       «pag. 3» vale come «pag. 4». Almeno due lettere: un numero di pagina nudo
       resta nel testo.

       ⚠️ La chiave RAGGRUPPA, non decide (riparazione del 28/09). Con le cifre
       rese uguali, anche «Art. 3», «Art. 7», «Art. 9» in cima a tre pagine di un
       regolamento, o «Settimana 6», «Settimana 7», «Settimana 11» di un piano
       settimanale, avevano la stessa chiave e sparivano: testo che CAMBIA da una
       pagina all'altra, cioè contenuto. Dentro un gruppo, quindi, i numeri
       contano così:
         · o sono un CONTATORE DI PAGINA: ogni numero o resta fermo o cresce di
           uno a ogni pagina (numero − indice di pagina costante, anche con uno
           scarto: «p. 47» sulla prima pagina del PDF), e almeno uno cresce, su
           TUTTE le pagine dove il pezzo compare — un contatore di pagina non
           salta («pagina 3 di 36», «ISW | 3»); basta un numero che cambia in
           altro modo (la data di una lezione) e il pezzo è contenuto;
         · o sono IDENTICI: allora si contano solo le pagine con gli stessi
           numeri («© OECD 2026», «piano generato il 31.08.2026»).
       Un numero di più di 6 cifre non fa da contatore. Rischio residuo: un testo
       che per caso cresce di uno con la pagina (un articolo o una domanda per
       pagina) si scambia per un numero di pagina.

       Entra `pagine: [{ items, vp }]`, con `vp = { height, punto(x, y) → [x', y'] }`
       nelle coordinate del viewport a scala 1 (y verso il basso, rotazione della
       pagina già applicata: in app.js `page.getViewport({ scale: 1 })` e
       `convertToViewportPoint`). Esce `{ escludi, elenco }`: per ogni pagina il
       Set degli indici dei pezzi da togliere, e l'elenco
       `[{ testo, fascia: 'alto'|'basso', pagine }]` per il registro.
       Il testo per il modello di una pagina è
       `testoPagina(items.filter((_, i) => !escludi[p].has(i)))`: SOLO il prompt
       lo usa; pagine, àncora, evidenze e revisione tengono il testo intero.
       Algoritmo, misure (743 PDF, 2,91% dei caratteri) e rischi:
       docs/tasks/0045-intestazioni-dalla-posizione.md §4. */
    function chiaveRipetuta(s) {
        return String(s).toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}\p{N}#]+/gu, '');
    }

    // i numeri di un pezzo, nell'ordine e come stringhe: «pagina 3 di 36» → ['3', '36']
    function _numeri(testo) {
        return String(testo).match(/\d+/g) || [];
    }

    // vero se in TUTTE le occorrenze (una per pagina) ogni numero o resta
    // identico o segue la pagina — numero − p costante — e almeno uno la segue
    function _contatoreDiPagina(occ) {
        if (occ.length < 2) return false;
        const primo = occ[0].numeri, k = primo.length;
        if (!k || occ.some(o => o.numeri.length !== k)) return false;
        let segue = 0;
        for (let j = 0; j < k; j++) {
            if (occ.every(o => o.numeri[j] === primo[j])) continue;          // fermo
            const scarto = Number(primo[j]) - occ[0].p;
            if (!occ.every(o => o.numeri[j].length <= 6 && Number(o.numeri[j]) - o.p === scarto)) return false;
            segue++;
        }
        return segue > 0;
    }

    function intestazioniRipetute(pagine, { banda = 0.1, quota = 0.5, minPagine = 3, gapSegmento = 1.5 } = {}) {
        const n = pagine.length, escludi = pagine.map(() => new Set()), elenco = [];
        if (n < minPagine) return { escludi, elenco };
        const perChiave = new Map();
        pagine.forEach((pg, p) => {
            const pts = [];
            (pg.items || []).forEach((it, i) => {
                if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) return;
                const [x, y] = pg.vp.punto(it.transform[4], it.transform[5]), rel = y / pg.vp.height;
                const fascia = rel < banda ? 'alto' : rel > 1 - banda ? 'basso' : null;
                if (!fascia) return;
                pts.push({ i, x, y, w: it.width || 0, h: it.height || 10, s: it.str, fascia });
            });
            pts.sort((a, b) => a.y - b.y || a.x - b.x);
            const righe = [];                                  // stessa riga se |Δy| <= metà altezza
            pts.forEach(q => {
                const r = righe.find(r => r.fascia === q.fascia && Math.abs(r.y - q.y) <= 0.5 * Math.max(r.h, q.h));
                if (r) r.pts.push(q); else righe.push({ y: q.y, h: q.h, fascia: q.fascia, pts: [q] });
            });
            const visti = new Set();
            righe.forEach(r => {
                r.pts.sort((a, b) => a.x - b.x);
                // segmenti: un vuoto > 1,5·altezza separa «Storia IV Media» da «pag. 3»
                let seg = [r.pts[0]];
                const segs = [seg];
                for (let k = 1; k < r.pts.length; k++) {
                    const a = r.pts[k - 1], b = r.pts[k];
                    if (b.x - (a.x + a.w) > gapSegmento * Math.max(a.h, b.h)) { seg = [b]; segs.push(seg); } else seg.push(b);
                }
                segs.forEach(sg => {
                    const testo = sg.map(q => q.s).join(' ').replace(/\s+/g, ' ').trim(), c = chiaveRipetuta(testo);
                    if (!/\p{L}{2}/u.test(c) || visti.has(c)) return;          // almeno due lettere: un numero di pagina nudo resta
                    visti.add(c);
                    if (!perChiave.has(c)) perChiave.set(c, { fascia: r.fascia, occ: [] });
                    perChiave.get(c).occ.push({ p, testo, numeri: _numeri(testo), idx: sg.map(q => q.i) });
                });
            });
        });
        const soglia = Math.max(minPagine, Math.ceil(n * quota));
        const togli = (occ, fascia) => {                       // occ: una occorrenza per pagina
            if (occ.length < soglia) return;
            occ.forEach(o => o.idx.forEach(i => escludi[o.p].add(i)));
            elenco.push({ testo: occ[0].testo, fascia, pagine: occ.length });
        };
        perChiave.forEach(g => {
            if (_contatoreDiPagina(g.occ)) { togli(g.occ, g.fascia); return; }
            const perNumeri = new Map();                       // altrimenti: numeri identici
            g.occ.forEach(o => {
                const k = o.numeri.join(',');
                if (!perNumeri.has(k)) perNumeri.set(k, []);
                perNumeri.get(k).push(o);
            });
            perNumeri.forEach(occ => togli(occ, g.fascia));
        });
        return { escludi, elenco };
    }

    return {
        testoPagina: testoPagina, unisciVecchio: unisciVecchio, unisciRete: unisciRete,
        indiceSenzaSpazi: indiceSenzaSpazi, chiaveSenzaSpazi: chiaveSenzaSpazi,
        intestazioniRipetute: intestazioniRipetute, chiaveRipetuta: chiaveRipetuta
    };
});
