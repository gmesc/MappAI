// ══════════════════════════════════════════════════════════════════════════
// MappAI — Anchor Core (l'àncora: dal nodo alla frase della fonte)
// ══════════════════════════════════════════════════════════════════════════
//
// PERCHÉ ESISTE (11 settembre 2026). Misurato sui vault veri: su 36 nodi di una
// mappa, quelli che portavano una citazione della fonte erano ZERO. Il prompt di
// Fase 3 chiede i `chunks` verbatim, ma `schemaBranch` non li dichiara: su Gemini
// non arrivano mai, e il programma ripiega mettendo in `sourcesDict` la `desc`
// del nodo. Da lì in poi tutto ciò che legge `sourcesDict` — la sintesi, che le
// numera come «Fonti», la scheda del nodo, la misura di fedeltà — lavora su una
// parafrasi credendola una citazione.
//
// COSA FA. Spezza il corpus in frasi UNA volta sola, tenendo il numero di pagina,
// e per ogni nodo trova le frasi che meglio sostengono la sua desc. Zero chiamate
// all'AI. Da questo derivano, gratis, altre tre cose che prima non si potevano
// sapere:
//   · la COPERTURA — quali frasi della fonte non sono finite in nessun nodo;
//   · la FEDELTÀ per nodo — misurata contro le SUE frasi, non contro un corpus
//     che contiene già le desc (`corpusFromState` le include: misurare lì dentro
//     è circolare);
//   · i nessi CRONOLOGICAMENTE impossibili — una causa datata dopo il suo effetto.
//
// UMD puro, nessuna dipendenza da appState → testabile in Node:
// tests/anchor-core.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-deepen-core.js'), require('./mappai-boilerplate-core.js'));
    } else {
        root.MappAIAnchorCore = factory(root.MappAIDeepenCore, root.MappAIBoilerplate);
    }
}(typeof self !== 'undefined' ? self : this, function (DC, BP) {
    'use strict';

    var DEFAULTS = {
        minSentenceWords: 5,     // frasi più corte = rumore (titoli, numeri di pagina)
        maxSentenceChars: 600,   // una "frase" più lunga è quasi sempre un paragrafo mal spezzato
        maxPerNode: 2,           // quante citazioni per nodo (il foglio non ne regge di più)
        relMin: 0.18             // sotto questa somiglianza la frase non è di quel nodo
    };

    // ── tokenizzazione: la stessa del deepening, così due moduli non litigano ──
    function _words(t) {
        if (DC && typeof DC.contentWords === 'function') return DC.contentWords(t);
        return String(t || '').toLowerCase().match(/[a-zàèéìòóùü]{4,}/g) || [];
    }
    function _split(t) {
        if (DC && typeof DC.splitSentences === 'function') return DC.splitSentences(t);
        return String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?;:])\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    /* ── CERCARE nella fonte: BM25 ─────────────────────────────────────────────
       (15 settembre 2026) `ancoraNodi` qui sotto risponde a «quali frasi parlano
       di QUESTO nodo»: query lunga (una desc intera), due citazioni per nodo, e
       un cancello (`relMin`) che esiste per non inventare citazioni. `cercaBM25`
       risponde a un'altra domanda — «dove, nella fonte, si parla di questo?» —
       con una query CORTA scritta da un docente, e non ha cancello: serve un
       elenco ordinato, non un verdetto.

       PERCHÉ BM25 E NON IL PUNTEGGIO DELL'ÀNCORA. Il punteggio di `ancoraNodi` è
       `parole in comune / parole della frase`: non pesa le parole rare e premia
       le frasi CORTE (una riga di tre parole con due in comune fa 0,67; un
       paragrafo di quaranta con quindici fa 0,37). BM25 aggiunge le due cose che
       mancano — l'IDF, che dà peso alla parola rara invece che a «di», e una
       normalizzazione della lunghezza governata da `b` invece che una divisione
       secca.

       MISURATO sul banco di 60 domande italiane di `local-ai/italian-bank.json`,
       sulle STESSE frasi, cambiando solo la funzione di punteggio:

         metodo                       Recall@5 (taratura / verifica)   MRR@20
         punteggio dell'àncora          48,1%  /  74,1%              0,313 / 0,509
         BM25 (questa funzione)         88,9%  /  96,3%              0,726 / 0,858
         SQLite FTS5 vero, riferimento  88,9%  /  96,3%              0,720 / 0,846

       Cioè: in JS puro si ottiene lo STESSO recupero di FTS5 — stessi casi
       mancati (IT-018, IT-020, IT-034) — senza SQLite, senza Python, senza i
       7,4 GB di runtime e modelli. Il banco è piccolo (176 e 53 frasi) e le sue
       etichette attendono ancora una revisione indipendente: questi numeri
       confrontano metodi fra loro, non certificano nulla.

       ⚠️ IL CANCELLO NON VA MESSO QUI. Riusando `relMin: 0.18` come filtro il
       Recall@5 CROLLA a 63,0% / 44,4% — sotto il punteggio vecchio: in un terzo
       dei casi la frase giusta non entra nemmeno fra i candidati. Quella soglia
       è tarata su query lunghe, e su una domanda corta taglia la risposta.

       ⚠️ TOKENIZER SUO, e non `_words`. `contentWords` tiene solo le parole di
       quattro lettere o più e scarta le cifre: «ohm», «Ω», «W» sparirebbero, cioè
       proprio i termini di una domanda di fisica. Qui si fa come `unicode61` di
       SQLite — minuscole, via i diacritici, si spezza sui non alfanumerici — più
       gli stessi alias del worker per i segni che una tastiera non scrive. */

    function _cercaWords(t) {
        return String(t == null ? '' : t)
            .replace(/[Ωω]/g, ' ohm ').replace(/µ/g, ' micro ').replace(/²/g, '2').replace(/³/g, '3')
            .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9]+/).filter(Boolean);
    }

    /* `frasi` = l'uscita di frasiDaPagine. Ritorna le prime `max` in ordine di
       pertinenza: [{ idx, text, page, score, hit }]. `hit` = quanti termini della
       domanda compaiono, utile a spiegare un risultato senza mostrare il punteggio
       grezzo (che non è una percentuale di correttezza e non va presentato come tale). */
    function cercaBM25(frasi, query, opts) {
        var o = Object.assign({ max: 20, k1: 1.2, b: 0.75, maxTermini: 64 }, opts || {});
        var lista = frasi || [];
        if (!lista.length) return [];
        var termini = [];
        _cercaWords(query).forEach(function (w) { if (termini.indexOf(w) < 0) termini.push(w); });
        termini = termini.slice(0, o.maxTermini);
        if (!termini.length) return [];

        var docs = lista.map(function (f) { return _cercaWords(f.text); });
        var N = docs.length, lunghezze = 0, df = {};
        docs.forEach(function (d) {
            lunghezze += d.length;
            var visti = {};
            d.forEach(function (w) { if (!visti[w]) { visti[w] = 1; df[w] = (df[w] || 0) + 1; } });
        });
        var avgdl = lunghezze / N || 1;

        var out = [];
        docs.forEach(function (d, idx) {
            var tf = {};
            d.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
            var score = 0, hit = 0;
            for (var i = 0; i < termini.length; i++) {
                var f = tf[termini[i]];
                if (!f) continue;
                hit++;
                var n = df[termini[i]] || 0;
                var idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
                score += idf * (f * (o.k1 + 1)) / (f + o.k1 * (1 - o.b + o.b * d.length / avgdl));
            }
            if (hit) out.push({ idx: idx, text: lista[idx].text, page: lista[idx].page, score: score, hit: hit });
        });
        /* Ordine STABILE: due passate sullo stesso PDF devono dare la stessa
           lista, come già per ancoraNodi — a parità di punteggio comanda la
           posizione nel documento. */
        out.sort(function (a, b) { return (b.score - a.score) || (a.idx - b.idx); });
        return out.slice(0, o.max).map(function (r) {
            return { idx: r.idx, text: r.text, page: r.page, score: Number(r.score.toFixed(4)), hit: r.hit };
        });
    }

    /* ── LE FRASI, COL NUMERO DI PAGINA ───────────────────────────────────────
       `pagine` = [{ n, text }] come le restituisce il lettore di PDF. Con un
       corpus senza pagine (testo incollato, URL) si passa [{n:0,text:tutto}] e
       il numero di pagina resta 0: la copertura si conta lo stesso, senza la
       riga «pagina 4». */
    function frasiDaPagine(pagine, opts) {
        var o = Object.assign({}, DEFAULTS, opts || {});
        var grezze = [];
        (pagine || []).forEach(function (p) {
            _split(p && p.text).forEach(function (s) {
                if (s.length > o.maxSentenceChars) s = s.slice(0, o.maxSentenceChars);
                var w = _words(s);
                if (w.length < o.minSentenceWords) return;
                grezze.push({ text: s, page: (p && p.n) || 0, words: w });
            });
        });

        /* ── CHE COSA NON PUÒ ESSERE UNA CITAZIONE (11/9, sera) ───────────────
           Misurato sulla prima generazione vera con l'àncora accesa: su 68
           citazioni, **18 erano spazzatura** — 13 volte l'intestazione di pagina
           («Storia IV Media La Seconda Guerra Mondiale pag.») e 5 volte una
           domanda dell'esercizio («La Svizzera ha relazioni economiche…?»).
           Citare una consegna come PROVA di un concetto è peggio che non citare.

           ⚠️ Perché non bastava la pulizia che l'app fa già: `stripBoilerplate`
           lavora RIGA per riga, e una pagina di PDF qui è UNA riga sola (il
           lettore unisce tutti i pezzi con degli spazi). Il filtro va quindi
           messo dopo aver spezzato in frasi — qui. Tre regole:
             · l'INTESTAZIONE si riconosce da sé: la stessa frase su tre o più
               pagine diverse è un piè di pagina, non un'informazione;
             · la CONSEGNA finisce con un punto di domanda: in una scheda
               scolastica è un esercizio, non un fatto;
             · le righe STRUTTURALI (puntini di risposta, «Doc. 2», titoli
               numerati) le riconosce già `mappai-boilerplate-core.js`.
           Tolte anche dal conto della COPERTURA, ed è giusto: una consegna non è
           contenuto da coprire. */
        /* ⚠️ La chiave per riconoscere la ricorrenza tiene SOLO lettere e cifre:
           la stessa intestazione esce dal lettore di PDF con punteggiatura
           diversa da una pagina all'altra («Storia IV Media - - - - - La Seconda
           Guerra Mondiale pag.» su una, senza trattini sulle altre). Con la
           punteggiatura dentro la chiave quella copia restava, e da sola si è
           presa 16 citazioni su 72. */
        /* Non tutte le consegne finiscono con un punto di domanda. In una scheda
           scolastica ce ne sono di imperative — «Attività 15 Esamina la seguente
           tabella», «Leggi il documento e rispondi» — e nella generazione vera
           una di queste era fra le sette frasi che il passaggio di copertura
           avrebbe rimandato al modello come contenuto da recuperare.
           ⚠️ L'imperativo deve stare in TESTA alla frase (o subito dopo un
           «Attività N»): «esamina» in mezzo a un periodo è un verbo come un
           altro, e una regola larga mangerebbe del contenuto vero. */
        var ESERCIZIO = /(^|\bAttivit[àa]\s*\d{1,2}\s+)(esamina|osserva|completa|rispondi|leggi|indica|elenca|sottolinea|ricopia|collega|inserisci|scrivi|calcola|descrivi)\b/i;

        /* ── LA FRASE CHE FINISCE DENTRO UN VUOTO (19/9/2026, sera) ───────────
           Misurato sulla prima generazione col reranker acceso: 7 citazioni su
           96 contenevano i puntini dei vuoti da riempire della scheda, e UNA
           non provava niente — «Dopo il 1940 la volontà di evitare conflitti
           con i nuovi padroni dell'Europa (.....................»: il predicato
           è NEL vuoto, cioè non è nel testo. Era citata su due nodi diversi.
           Sulla fonte vera la regola toglie 1 frase su 47.

           ⚠️ Si SCARTA la frase, non si ripulisce il testo. Le citazioni sono
           verificate carattere per carattere contro le pagine archiviate
           (`mappai-grounding-core.js`, `verifiedAgainst: 'archived-source-text'`):
           una frase riscritta non combacerebbe più e finirebbe in `unverified`.
           Il verbatim È la garanzia che una prova stia nella fonte, e non si tocca.

           ⚠️ Quattro punti minimo: «…» di sospensione è punteggiatura, non un
           vuoto da riempire. E restano dentro — a ragione — la frase col vuoto
           CHIUSO in mezzo a un periodo completo («…dei loro alleati (.......).»)
           e quella che si apre con la coda di un vuoto ma poi un fatto lo dice:
           brutte da leggere, ma il fatto c'è. */
        var TRONCA_NEL_VUOTO = /\.{4,}\s*$/;

        var _chiave = function (t) {
            return String(t).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').replace(/\s+/g, ' ').trim();
        };
        var perTesto = {};
        grezze.forEach(function (f) {
            var k = _chiave(f.text);
            if (!perTesto[k]) perTesto[k] = {};
            perTesto[k][f.page] = 1;
        });
        var out = [];
        grezze.forEach(function (f) {
            var k = _chiave(f.text);
            if (Object.keys(perTesto[k]).length >= 3) return;          // intestazione ricorrente
            if (/\?\s*$/.test(f.text)) return;                         // consegna dell'esercizio
            if (ESERCIZIO.test(f.text)) return;                        // consegna senza punto di domanda
            if (TRONCA_NEL_VUOTO.test(f.text)) return;                 // frase troncata dentro un vuoto da riempire
            if (BP && typeof BP.isStructuralLine === 'function' && BP.isStructuralLine(f.text)) return;
            f.idx = out.length;
            out.push(f);
        });
        return out;
    }

    // Il corpus di MappAI arriva già marcato «[FONTE PDF <nome>]:». Se non
    // conosciamo le pagine, ogni fonte diventa un blocco unico con pagina 0.
    function paginePiatte(testi) {
        return (testi || []).map(function (t, i) { return { n: 0, text: String(t || ''), fonte: i }; });
    }

    /* ── L'ANCORAGGIO ─────────────────────────────────────────────────────────
       Per ogni nodo, le frasi che meglio sostengono la sua desc. Il punteggio è
       la frazione di parole della FRASE che compaiono anche nella desc: premia
       la frase che parla della stessa cosa, non quella lunga che tocca tutto.
       ⚠️ NON è esclusivo (a differenza di `assignResidues` del deepening): due
       nodi possono citare la stessa frase, ed è giusto — un fatto può sostenere
       due concetti. L'esclusività serve al deepening per non generare due volte
       lo stesso figlio; qui servirebbe solo a privare un nodo della sua prova. */
    function ancoraNodi(nodi, frasi, opts) {
        var o = Object.assign({}, DEFAULTS, opts || {});
        var perNodo = {};
        var usate = {};
        (nodi || []).forEach(function (n) {
            if (!n || !n.id) return;
            var testo = (n.desc || n.content || '').trim();
            if (!testo) return;
            var dw = _words(testo);
            if (!dw.length) return;
            var set = {};
            dw.forEach(function (w) { set[w] = 1; });

            var cand = [];
            frasi.forEach(function (f) {
                var hit = 0;
                for (var i = 0; i < f.words.length; i++) if (set[f.words[i]]) hit++;
                if (!hit) return;
                var score = hit / f.words.length;
                if (score < o.relMin) return;
                cand.push({ idx: f.idx, score: score, hit: hit });
            });
            if (!cand.length) return;
            /* ordine stabile: punteggio, poi numero di parole in comune, poi
               posizione nel documento — così due generazioni sullo stesso PDF
               danno le stesse citazioni. */
            cand.sort(function (a, b) {
                return (b.score - a.score) || (b.hit - a.hit) || (a.idx - b.idx);
            });
            var prese = cand.slice(0, o.maxPerNode).map(function (c) {
                usate[c.idx] = 1;
                var f = frasi[c.idx];
                return { text: f.text, page: f.page, score: Number(c.score.toFixed(3)) };
            });
            if (prese.length) perNodo[n.id] = prese;
        });
        return { perNodo: perNodo, usate: usate };
    }

    /* ── IL RERANKER: CHE COSA MANDARGLI, CHE COSA TENERE (16/9/26) ──────────────
       `ancoraNodi` sceglie la frase che ha più parole in comune con la desc, e
       per questo premia le frasi corte e i collegamenti vuoti. Un reranker
       (BAAI/bge-reranker-v2-m3, su Infomaniak) legge insieme nodo e frase e dà
       un voto al SENSO. Qui sta la parte deterministica: la domanda, le frasi
       candidate, le citazioni che restano. La chiamata vera sta in mappai-anchor.js.

       MISURATO sul dossier «Svizzera e 2a GM» (35 nodi dove àncora, BM25 e
       reranker sceglievano frasi diverse, giudicati a mano da Giacomo il 16/9,
       alla cieca):
         metodo      prima frase giusta   frasi proposte giuste
         àncora            28/35             48/67  (72%)
         BM25              22/35             36/64  (56%)
         reranker          32/35             60/70  (86%)
       Contro l'àncora la differenza sulla prima frase (6 nodi a 2) non è ancora
       solida con 35 nodi; contro BM25 sì. Un solo dossier, un solo docente.

       ⚠️ NESSUNA SOGLIA DI QUALITÀ SUL VOTO. Le frasi sbagliate del reranker
       avevano voti di 0,98 e 0,97: qualunque soglia toglieva più frasi giuste che
       sbagliate. `votoMinimo` è solo una rete per il nodo di cui la fonte non
       parla affatto, sotto la più bassa frase giusta osservata (0,024).

       ⚠️ LA DOMANDA È «etichetta. descrizione», la stessa della prova: cambiarla
       vuol dire che i numeri qui sopra non valgono più. */
    var RERANK = { tutteFinoA: 120, prefiltro: 60, maxPerNode: 2, votoMinimo: 0.01 };

    function queryReranker(nodo) {
        return String((nodo && nodo.label) || '').trim() + '. ' + String((nodo && (nodo.desc || nodo.content)) || '').trim();
    }

    /* Indici delle frasi da mandare. Fino a `tutteFinoA` frasi si mandano tutte,
       com'era nella prova. Oltre, BM25 fa da setaccio: su una fonte da 800 frasi
       mandarle tutte per 150 nodi costerebbe 12 milioni di token e minuti di
       attesa; BM25 ha Recall@20 del 100% sul banco italiano. */
    function candidatiReranker(frasi, nodo, opts) {
        var o = Object.assign({}, RERANK, opts || {});
        var lista = frasi || [];
        if (lista.length <= o.tutteFinoA) return lista.map(function (f, i) { return i; });
        var presi = {};
        cercaBM25(lista, queryReranker(nodo), { max: o.prefiltro }).forEach(function (h) { presi[h.idx] = 1; });
        cercaBM25(lista, String((nodo && nodo.label) || ''), { max: Math.ceil(o.prefiltro / 3) }).forEach(function (h) { presi[h.idx] = 1; });
        return Object.keys(presi).map(Number).sort(function (a, b) { return a - b; });
    }

    /* `voti[k]` è il voto della frase `frasi[indici[k]]`. Restano le prime
       `maxPerNode`; a parità di voto vince la frase che viene prima nel documento,
       così due passate sulla stessa risposta danno le stesse citazioni. */
    function citazioniDaVoti(frasi, indici, voti, opts) {
        var o = Object.assign({}, RERANK, opts || {});
        var righe = [];
        (indici || []).forEach(function (i, k) {
            var v = voti ? voti[k] : null;
            if (typeof v !== 'number' || !isFinite(v) || v < o.votoMinimo || !frasi || !frasi[i]) return;
            righe.push({ i: i, v: v });
        });
        righe.sort(function (a, b) { return (b.v - a.v) || (a.i - b.i); });
        return righe.slice(0, o.maxPerNode).map(function (r) {
            return { idx: r.i, text: frasi[r.i].text, page: frasi[r.i].page, score: Number(r.v.toFixed(4)) };
        });
    }

    /* ── LA COPERTURA ─────────────────────────────────────────────────────────
       Quali frasi della fonte non sono finite in nessun nodo. È la misura che
       mancava del tutto: la pagina economica di un dossier poteva sparire da una
       mappa senza che comparisse un avviso da nessuna parte. */
    function copertura(frasi, usate) {
        var perPagina = {};
        (frasi || []).forEach(function (f) {
            var k = f.page || 0;
            if (!perPagina[k]) perPagina[k] = { page: k, tot: 0, coperte: 0, orfane: [] };
            perPagina[k].tot++;
            if (usate && usate[f.idx]) perPagina[k].coperte++;
            else perPagina[k].orfane.push(f.text);
        });
        var pagine = Object.keys(perPagina).map(function (k) {
            var p = perPagina[k];
            p.pct = p.tot ? Math.round((p.coperte / p.tot) * 100) : 0;
            return p;
        }).sort(function (a, b) { return a.page - b.page; });
        var tot = 0, cop = 0;
        pagine.forEach(function (p) { tot += p.tot; cop += p.coperte; });
        return { pagine: pagine, tot: tot, coperte: cop, pct: tot ? Math.round((cop / tot) * 100) : 0 };
    }

    /* ── IL PASSAGGIO DI COPERTURA (12/9) ─────────────────────────────────────
       La copertura dice che una parte della fonte non è entrata in mappa; questo
       decide CHE COSA rimandare al modello perché la recuperi. Misurato: nella
       generazione vera la pagina economica stava al 13%, e il meccanismo per cui
       la Germania aveva bisogno di valuta svizzera — il cuore di quella pagina —
       non c'era in nessun nodo.

       Si prendono le pagine sotto soglia, dalla PIÙ scoperta in giù, e si manda
       solo il loro residuo. Non tutto il corpus: rimandare la fonte intera
       significherebbe rifare la Fase 3, e il modello riprodurrebbe i concetti
       che ha già estratto invece di cercare quelli che ha saltato.

       ⚠️ Una pagina con poche frasi in tutto non si conta: su tre frasi, una
       coperta fa il 33% e sembra un buco quando è solo una pagina corta (una
       copertina, un indice). */
    function orfanePerPassaggio(cop, opts) {
        var o = Object.assign({ soglia: 45, minFrasi: 4, maxCaratteri: 4000, maxFrasi: 30 }, opts || {});
        if (!cop || !cop.pagine) return { frasi: [], pagine: [] };
        var scelte = cop.pagine.filter(function (p) {
            return p.tot >= o.minFrasi && p.pct < o.soglia && p.orfane.length;
        }).sort(function (a, b) { return a.pct - b.pct; });
        var frasi = [], pagine = [], car = 0;
        scelte.forEach(function (p) {
            var prese = 0;
            p.orfane.forEach(function (t) {
                if (frasi.length >= o.maxFrasi || car + t.length > o.maxCaratteri) return;
                frasi.push({ text: t, page: p.page });
                car += t.length; prese++;
            });
            if (prese) pagine.push(p.page);
        });
        return { frasi: frasi, pagine: pagine };
    }

    /* Che cosa si accetta di ciò che il modello propone. Quattro rifiuti, tutti
       verificabili senza chiedere niente a nessuno:
         · un GENITORE che non è una delle macro-aree vere (lo schema lo vincola
           già con un enum, ma un enum su Gemini è una richiesta, non una legge);
         · un'ETICHETTA che nella mappa c'è già — il passaggio serve a recuperare
           ciò che manca, non a rifare ciò che c'è;
         · una PROVA che non sta fra le frasi che gli abbiamo mandato: vuol dire
           che il concetto se l'è portato da fuori, ed è esattamente ciò che
           questo passaggio non deve fare;
         · una desc troppo corta per essere un nodo.
       ⚠️ Il confronto della prova è lessicale e generoso (il modello riformula
       sempre un po'): ferma il concetto inventato, non certifica la verità. */
    function validaProposte(proposte, ctx) {
        var c = ctx || {};
        var idsOk = {}; (c.genitori || []).forEach(function (id) { idsOk[id] = 1; });
        var esistenti = {};
        (c.etichette || []).forEach(function (e) {
            var k = _chiaveEtichetta(e); if (k) esistenti[k] = 1;
        });
        var indice = {};
        (c.frasi || []).forEach(function (f) {
            _words(typeof f === 'string' ? f : f.text).forEach(function (w) { indice[w] = 1; });
        });
        var max = c.max || 8, soglia = (typeof c.soglia === 'number') ? c.soglia : 0.6;
        var ok = [], scartate = [];
        (proposte || []).forEach(function (pz) {
            if (ok.length >= max) { scartate.push({ label: pz && pz.label, perche: 'oltre il tetto' }); return; }
            if (!pz || !pz.label || !pz.desc) { scartate.push({ label: pz && pz.label, perche: 'incompleta' }); return; }
            if (!idsOk[pz.parent]) { scartate.push({ label: pz.label, perche: 'genitore inesistente' }); return; }
            if (String(pz.desc).trim().split(/\s+/).length < 8) { scartate.push({ label: pz.label, perche: 'desc troppo corta' }); return; }
            var k = _chiaveEtichetta(pz.label);
            if (esistenti[k]) { scartate.push({ label: pz.label, perche: 'nodo già presente' }); return; }
            var w = _words(pz.evidenza || '');
            if (w.length < 3) { scartate.push({ label: pz.label, perche: 'senza prova' }); return; }
            var hit = 0;
            for (var i = 0; i < w.length; i++) if (indice[w[i]]) hit++;
            if (hit / w.length < soglia) { scartate.push({ label: pz.label, perche: 'prova fuori dal residuo' }); return; }
            esistenti[k] = 1;                       // niente due proposte uguali fra loro
            ok.push(pz);
        });
        return { proposte: ok, scartate: scartate };
    }

    function _chiaveEtichetta(t) {
        return String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /* ── LA FEDELTÀ, MISURATA BENE ────────────────────────────────────────────
       `MappAIDescFidelity.groundedness` confronta la desc con un corpus. Il
       corpus che l'app gli passava (`corpusFromState`) CONTIENE le desc, quindi
       il punteggio era gonfiato per costruzione. Qui si misura ogni desc contro
       il testo vero della fonte, e si segnalano i nodi sotto soglia. */
    function fedelta(nodi, corpusVero, fid, soglia) {
        if (!fid || typeof fid.groundedness !== 'function') return null;
        var idx = fid.buildSourceIndex(corpusVero);
        var s = (typeof soglia === 'number') ? soglia : (fid.DEFAULT_THRESHOLD || 0.45);
        var righe = [];
        (nodi || []).forEach(function (n) {
            if (!n || !n.id) return;
            var g = fid.groundedness(n.desc || n.content || '', idx);
            if (g === null) return;
            righe.push({ id: n.id, label: n.label, level: n.level, score: Number(g.toFixed(3)), sotto: g < s });
        });
        righe.sort(function (a, b) { return a.score - b.score; });
        var sotto = righe.filter(function (r) { return r.sotto; });
        var media = righe.length ? righe.reduce(function (a, r) { return a + r.score; }, 0) / righe.length : 0;
        return { righe: righe, sotto: sotto, media: Number(media.toFixed(3)), soglia: s };
    }

    /* ── I NESSI IMPOSSIBILI ──────────────────────────────────────────────────
       «Accerchiamento nazista → determina → Comandante Guisan»: l'accerchiamento
       comprende il giugno 1940, Guisan fu eletto nell'agosto 1939. L'effetto
       precede la causa. Non serve un modello per vederlo: bastano gli anni
       scritti nelle due desc.
       ⚠️ DUE LIVELLI, e la differenza conta. Misurato sul caso vero dell'audit:
       il nodo «Accerchiamento Nazista» copre 1938-1940, «Comandante Guisan» il
       1939. Una lettura compatibile ESISTE (il processo comincia nel 1938, la
       nomina è del 1939), quindi dichiararlo impossibile sarebbe falso — ma il
       nesso resta sospetto, perché il fatto centrale della causa (giugno 1940) è
       posteriore all'effetto.
         · `impossibile`  → nessuna lettura regge (il minimo della causa è dopo
                            il massimo dell'effetto): il verbo si può togliere;
         · `da verificare` → la causa si estende oltre l'effetto: si SEGNALA al
                            docente e non si tocca niente.
       Una macchina che non può decidere lo dice, non riscrive. */
    var VERBI_CAUSALI = /^(causa|determina|provoca|produce|genera|permette|consente|porta a|conduce a|precede|innesca|rende possibile)$/i;

    function anni(testo) {
        var out = [];
        var m = String(testo || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g);
        if (m) m.forEach(function (x) { out.push(parseInt(x, 10)); });
        return out;
    }

    function nessiImpossibili(nodi, links) {
        var byId = {};
        (nodi || []).forEach(function (n) { if (n && n.id) byId[n.id] = n; });
        var eid = function (x) { return (x && typeof x === 'object') ? x.id : x; };
        var out = [];
        (links || []).forEach(function (l) {
            if (!l || !l.rel || !VERBI_CAUSALI.test(String(l.rel).trim())) return;
            var a = byId[eid(l.source)], b = byId[eid(l.target)];
            if (!a || !b) return;
            var ca = anni((a.desc || '') + ' ' + (a.label || ''));
            var cb = anni((b.desc || '') + ' ' + (b.label || ''));
            if (!ca.length || !cb.length) return;
            var causaMin = Math.min.apply(null, ca);
            var causaMax = Math.max.apply(null, ca);
            var effettoMax = Math.max.apply(null, cb);
            var livello = (causaMin > effettoMax) ? 'impossibile'
                : (causaMax > effettoMax) ? 'da verificare' : null;
            if (livello) {
                out.push({
                    source: eid(l.source), target: eid(l.target), rel: l.rel,
                    causa: a.label, effetto: b.label,
                    annoCausa: (livello === 'impossibile') ? causaMin : causaMax,
                    annoEffetto: effettoMax,
                    livello: livello
                });
            }
        });
        return out;
    }

    /* ── IL METATESTO ─────────────────────────────────────────────────────────
       Frasi che parlano della MAPPA invece che della storia, finite nei testi per
       l'allievo: il saluto da chat dell'introduzione, e il campo «confini» — che
       serve al modello per sapere che cosa NON mettere in un ramo e che allo
       studente non dice niente.
       ⚠️ Elenco CHIUSO di forme, non una regola su «ramo»/«categoria»: quelle
       parole compaiono legittimamente nei contenuti (il ramo di un albero, una
       categoria grammaticale) e una regola larga le mangerebbe. Ogni frase tolta
       viene restituita, così il rapporto può dirlo. */
    /* ⚠️ `\b` NON si usa accanto a una lettera accentata: in JavaScript il
       confine di parola è calcolato su [A-Za-z0-9_], quindi «è» conta come
       carattere NON di parola e `\bè` non trova mai niente (misurato: la riga
       «questa categoria è separata» passava intatta). Dove il carattere accanto
       è accentato il confine si lascia cadere; dove è ASCII resta, e serve —
       senza, «ram[oi]» morderebbe dentro «programma». */
    var META = [
        /(?:^|\s)(?:ciao|salve|benvenut\w*|buongiorno)\b[^.!?]*[.!?]/i,
        /[^.!?]*\b(?:oggi parliamo|parliamo insieme|vediamo insieme)\b[^.!?]*[.!?]/i,
        /[^.!?]*\becco\b[^.!?]*(?:per i tuoi studenti|panoramica introduttiva)[^.!?]*[.!?]/i,
        /[^.!?]*\b(?:questa categoria|questo ramo|questa macro-?area)\b[^.!?]*(?:è\s*separat\w+|e'\s*separat\w+|\ba parte\b|\besiste come\b|\baltri rami\b|\bnella mappa\b)[^.!?]*[.!?]/i,
        /[^.!?]*\bNON include\b[^.!?]*\b(?:ram[oi]|categori\w+)\b[^.!?]*[.!?]/,
        /[^.!?]*\b(?:in questa mappa|nella mappa)\b[^.!?]*\b(?:ram[oi]|nod[oi]|categori\w+)\b[^.!?]*[.!?]/i,
        /[^.!?]*\bappartengono agli altri rami\b[^.!?]*[.!?]/i
    ];

    function togliMeta(testo) {
        var t = String(testo || '');
        var tolte = [];
        META.forEach(function (re) {
            var g = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
            t = t.replace(g, function (m) { tolte.push(m.trim()); return ' '; });
        });
        t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1').trim();
        return { text: t, tolte: tolte };
    }

    return {
        DEFAULTS: DEFAULTS,
        VERBI_CAUSALI: VERBI_CAUSALI,
        frasiDaPagine: frasiDaPagine,
        paginePiatte: paginePiatte,
        ancoraNodi: ancoraNodi,
        cercaBM25: cercaBM25,
        RERANK: RERANK,
        queryReranker: queryReranker,
        candidatiReranker: candidatiReranker,
        citazioniDaVoti: citazioniDaVoti,
        copertura: copertura,
        orfanePerPassaggio: orfanePerPassaggio,
        validaProposte: validaProposte,
        fedelta: fedelta,
        anni: anni,
        nessiImpossibili: nessiImpossibili,
        togliMeta: togliMeta
    };
}));
