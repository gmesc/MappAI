/* =========================================================================
   mappai-dossier-fonte-core.js — LA SCHEDA È LA FONTE DEL DOSSIER (0069)

   ADR 0016 (rev. 1). Per un dossier da immagine la revisione non aveva fonte:
   `review.sources` nasceva dal testo delle fonti caricate (`content`), che per
   una foto è vuoto per costruzione. G2 confrontava i materiali col nulla, le
   evidenze non nascevano (`empty_page`) e i rimandi restavano «da verificare».
   Il testo intanto c'era: la scheda che il docente ha letto e corretto.

   Qui, e solo qui (invariante 4), le regole:
     · `fontiDaScheda`  la scheda → le fonti della revisione, una «pagina» per
                        blocco della griglia (`BLOCCHI`, letti e mai modificati),
                        con titolo, testo e un'identità che dipende dal testo;
     · `registraConferma` la conferma del docente in CREA, con la foto accanto
                        ai campi → una review APPROVATA, costruita attraversando
                        il cancello di `mappai-review-core.js` (createReview →
                        beginApproval → completeApproval), mai scavalcandolo:
                        lo snapshot di nodi e fonti resta, quindi se la scheda
                        cambia dopo, `gate` risponde `stale_revision` da sé;
     · `decidi`         al checkpoint della pipeline: si usa la conferma (niente
                        G1) o si torna alla strada di prima;
     · `fontiDelPannello` che cosa mostra il pannello della fonte in G2.

   LA CONDIZIONE (ADR 0016): la scheda vale come fonte PERCHÉ una persona l'ha
   validata con la foto davanti. Senza `conFoto` la conferma non si registra.

   Interruttore (inv. 1): localStorage `mappai_dossier_fonte_scheda`, ACCESO di
   default dal 12/10 (0088; Giacomo, 09/10: «di default accendi l'interruttore») —
   lo spegne solo '0'. Spento, un dossier fa esattamente quello che faceva prima
   del packet. Fino al 12/10 partiva SPENTO e lo accendeva solo '1'.

   Logica pura: niente DOM, niente `window` nelle funzioni, niente localStorage
   (chi chiama passa il suo `storage`). Dipende da `mappai-visione-core.js` e da
   `mappai-review-core.js`, letti e mai modificati.
   ========================================================================= */
(function (root, factory) {
    var vc = null, rc = null;
    try {
        if (typeof module !== 'undefined' && module.exports) {
            vc = require('./mappai-visione-core.js');
            rc = require('./mappai-review-core.js');
        }
    } catch (e) { vc = null; rc = null; }
    var CORE = factory(
        function () { return vc || (root && root.MappAIVisioneCore) || null; },
        function () { return rc || (root && root.MappAIReviewCore) || null; });
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (root) root.MappAIDossierFonteCore = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (visioneCore, reviewCore) {
    'use strict';

    var CHIAVE = 'mappai_dossier_fonte_scheda';
    var SCHEMA = 'mappai-dossier-fonte@1';
    var TIPO = 'scheda';

    function VC() { return visioneCore() || {}; }
    function RC() { return reviewCore() || {}; }
    var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };

    /* ── l'interruttore ─────────────────────────────────────────────────────
       `storage` è un oggetto con `getItem` (localStorage nel browser). Acceso salvo
       '0'. Un errore di lettura, o nessun `storage`, vale «spento»: la strada di
       prima è quella sicura, e i chiamanti (che avvolgono la chiamata in un
       try/catch) rispondono lo stesso (0088, B9). */
    function acceso(storage) {
        try { return !!storage && typeof storage.getItem === 'function' && storage.getItem(CHIAVE) !== '0'; }
        catch (e) { return false; }
    }

    /* ── è una scheda? ──────────────────────────────────────────────────────
       Lo stesso riconoscimento del core di CREA (`schedaPerProiezione`): almeno
       un blocco della griglia come oggetto. Un titolo da solo non è una scheda. */
    function _eScheda(x) {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
        return (VC().BLOCCHI || []).some(function (bl) { return x[bl.id] && typeof x[bl.id] === 'object' && !Array.isArray(x[bl.id]); });
    }

    /* L'impronta del testo: FNV-1a a 32 bit, due semi (come `hash` di review-core,
       che non è esportato). È un'identità, non una firma di sicurezza. */
    function _impronta(s) {
        var a = 2166136261, b = 3339675911;
        s = String(s);
        for (var i = 0; i < s.length; i++) {
            a = Math.imul(a ^ s.charCodeAt(i), 16777619);
            b = Math.imul(b ^ s.charCodeAt(i), 2246822519);
        }
        return ('0000000' + (a >>> 0).toString(16)).slice(-8) + ('0000000' + (b >>> 0).toString(16)).slice(-8);
    }

    /* ── LE FONTI DI UN DOSSIER ────────────────────────────────────────────────
       Una fonte per blocco PIENO (un blocco vuoto non è una pagina: è lo stesso
       criterio di `nodiDaScheda`, quindi le pagine sono tante quanti i rami).
       Il testo della pagina è quello dei campi pieni come li scrive
       `testoBlocco` — esattamente la `desc` del ramo; il titolo del blocco sta
       in `title`. (Al primo giro il titolo stava anche in testa al testo, per far
       trovare qualcosa alla ricerca per parole: dal giro 2 un ramo del dossier
       riceve la sua pagina intera — `paginaDelRamo` — e quella riga non serve più.)
       L'identità: `scheda-<n>-<blocco>-<impronta del testo>`. Stabile fra due
       chiamate sulla stessa scheda (gli `[[src-…]]` che il generatore vede sono
       quelli che la revisione risolve), diversa se il testo cambia (l'indice
       delle evidenze si rifà, inv. 6). Il numero tiene l'ordine della griglia
       anche dopo che review-core ordina le fonti a modo suo. */
    function fontiDaScheda(sch) {
        if (!_eScheda(sch)) return [];
        var C = VC(), out = [];
        (C.BLOCCHI || []).forEach(function (bl, i) {
            var campi = C.testoBlocco ? C.testoBlocco(sch, bl.id) : '';
            if (!campi || !String(campi).trim()) return;
            var testo = String(campi);
            var id = 'scheda-' + (i + 1) + '-' + bl.id + '-' + _impronta(bl.id + '\n' + testo);
            out.push({ id: id, docId: id, title: bl.titolo, type: TIPO, pages: [{ n: 0, text: testo }] });
        });
        return out;
    }

    /* Le fonti di una revisione SONO la scheda? Tutte, e almeno una. */
    function eFonteScheda(sources) {
        if (!Array.isArray(sources) || !sources.length) return false;
        return sources.every(function (s) { return s && s.type === TIPO && Array.isArray(s.pages); });
    }

    /* ── LA CONFERMA, ATTRAVERSO IL CANCELLO ───────────────────────────────────
       La review nasce come qualunque altra (`createReview`), si approva con la
       verifica personale del docente (`beginApproval` con `manualReview`: è il
       gesto «ho verificato personalmente», fatto con la foto accanto) e si chiude
       con la revisione del contenuto calcolata a parte (`completeApproval`). Lo
       snapshot approvato è quello dei nodi del dossier (`nodiDaScheda`) e delle
       pagine: è ciò che `gate` confronterà dopo la generazione.
       `opts.conFoto` deve essere VERO: senza la foto accanto ai campi la scheda
       non diventa fonte (ADR 0016). `opts.now` = ISO, per i test. */
    function registraConferma(sch, opts) {
        var o = opts || {};
        if (o.conFoto !== true || !_eScheda(sch)) return null;
        /* giro 7: una lettura fallita non diventa fonte, da nessuna strada */
        if (letturaFallita(sch)) return null;
        var R = RC(), C = VC();
        if (!R.createReview || !R.beginApproval || !R.completeApproval || !C.nodiDaScheda) return null;
        var sources = fontiDaScheda(sch);
        if (!sources.length) return null;
        var db = C.nodiDaScheda(sch);
        var base = R.createReview({ db: db, sources: sources, report: null, checkStatus: 'unavailable',
            generationId: 'scheda-' + _impronta(JSON.stringify(sources.map(function (s) { return s.id; }))),
            now: o.now || null });
        var avvio = R.beginApproval(base, db, { manualReview: true, now: o.now || null });
        if (!avvio.ok) return null;
        var r = R.completeApproval(avvio.review, R.revision(db, sources));
        r.fonteScheda = { schema: SCHEMA, confermataIl: o.now || null, conFoto: true };
        return r;
    }

    function _confermata(r) {
        return !!(r && r.initial && r.initial.status === 'approved' && r.fonteScheda && r.fonteScheda.conFoto === true);
    }

    /* Lo stato del riquadro: 'da_confermare' · 'confermata' · e, se la scheda è
       cambiata dopo la conferma, la ragione del cancello ('stale_revision'). */
    function statoConferma(sch, conferma) {
        if (!_confermata(conferma) || !_eScheda(sch)) return 'da_confermare';
        var g = RC().gate(conferma, VC().nodiDaScheda(sch), fontiDaScheda(sch));
        return g.allowed ? 'confermata' : (g.reason || 'stale_revision');
    }

    /* ── AL CHECKPOINT DELLA PIPELINE ──────────────────────────────────────────
       o = { acceso, dossier (config.dossier), conferma (la review registrata in
       CREA), db (la mappa viva) }. Si usa la conferma solo se:
         · l'interruttore è acceso (M4);
         · il lavoro è un dossier da immagine — una mappa da fonte testuale non
           ha `config.dossier` e passa da G1 come sempre (M6);
         · la conferma c'è, è approvata e porta la foto;
         · il cancello passa sia sulla scheda del giro sia sulla mappa viva:
           un contenuto cambiato dopo la conferma → `stale_revision` (M5).
       → { usa: true, motivo: 'approved', review } | { usa: false, motivo } */
    function decidi(o) {
        o = o || {};
        if (o.acceso !== true) return { usa: false, motivo: 'spento' };
        if (!_eScheda(o.dossier)) return { usa: false, motivo: 'non_dossier' };
        if (!_confermata(o.conferma)) return { usa: false, motivo: 'non_confermata' };
        var R = RC(), C = VC();
        var g = R.gate(o.conferma, C.nodiDaScheda(o.dossier), fontiDaScheda(o.dossier));
        if (!g.allowed) return { usa: false, motivo: g.reason || 'stale_revision' };
        if (o.db) {
            var vivo = R.gate(o.conferma, o.db, o.conferma.sources);
            if (!vivo.allowed) return { usa: false, motivo: vivo.reason || 'stale_revision' };
        }
        return { usa: true, motivo: 'approved', review: clone(o.conferma) };
    }

    /* La review del giro: una copia della conferma con cartella, progetto e
       configurazione — campi che non entrano nella revisione del contenuto. */
    function perIlGiro(review, meta) {
        if (!review || typeof review !== 'object') return null;
        var m = meta || {}, r = clone(review);
        r.vaultPath = m.vaultPath || '';
        r.projectId = m.projectId || null;
        r.config = clone(m.config || {});
        if (m.now) r.updatedAt = m.now;
        return r;
    }

    /* ── LA PAGINA DEL RAMO (giro 2, decisione A di Giacomo) ───────────────────
       Le evidenze di un ramo si cercavano con la sua etichetta (BM25 sulle frasi
       della fonte). Per un dossier l'etichetta è il titolo del blocco, che nei
       campi non compare: misurato su una scheda vera, i pacchetti erano fatti di
       intestazioni («Carta d'identità Genere della fonte:») e «CDU», «1949»,
       «rovine» non arrivavano al generatore. Qui il ramo riceve PER INTERO la
       pagina del suo blocco, una riga per campo, verbatim, senza ricerca.
       Quale blocco: dall'id del nodo, `fonte_<blocco>` (lo conia `nodiDaScheda`, e
       la pipeline ci filtra già le categorie: `String(b.id).replace(/^fonte_/,'')`)
       — non cambia se il docente rinomina il nodo né con la lingua; se l'id non è
       quello, dal titolo del blocco. Quale record: quello la cui fonte è la pagina
       di quel blocco (`scheda-<n>-<blocco>-…`, l'identità di `fontiDaScheda`).
       L'id di ogni riga è quello di `idUnita` di evidence-core (non esportata):
       la stessa formula, come `idFrase` di mappai-affermazioni-core.js; la guardia è
       tests/dossier-fonte.test.js, che lo confronta con l'id di `costruisciPacchetto`.
       o = { nodi (il ramo, radice per prima), records (dell'indice) }
       → { blocco, unita: [{ id, text, page, title, sourceId, origin, punteggio }] } | null
       null = non è un ramo della scheda: chi chiama fa la strada di sempre. */
    function _bloccoDelNodo(n) {
        if (!n || typeof n !== 'object') return null;
        var bl = VC().BLOCCHI || [];
        var m = /^fonte_([a-z]+)$/i.exec(String(n.id == null ? '' : n.id));
        if (m) for (var i = 0; i < bl.length; i++) if (bl[i].id === m[1]) return bl[i];
        var et = String(n.label == null ? '' : n.label).replace(/\s+/g, ' ').trim();
        for (var j = 0; j < bl.length; j++) if (et && bl[j].titolo === et) return bl[j];
        return null;
    }
    function _bloccoDellaFonte(sourceId) {
        var m = /^scheda-\d+-([a-z]+)-[0-9a-f]+$/i.exec(String(sourceId == null ? '' : sourceId));
        return m ? m[1] : null;
    }
    function _idUnita(sourceId, page, text) {
        return 'ev-' + String(RC().revision({ items: [{ id: 'ev', value: [sourceId, page, text] }] }, [])).slice(3);
    }
    function paginaDelRamo(o) {
        o = o || {};
        var nodi = Array.isArray(o.nodi) ? o.nodi : [];
        var bl = _bloccoDelNodo(nodi[0]);
        if (!bl || !RC().revision) return null;
        var rec = (Array.isArray(o.records) ? o.records : []).filter(function (r) {
            return r && r.origin === 'original' && _bloccoDellaFonte(r.sourceId) === bl.id && typeof r.text === 'string';
        })[0];
        if (!rec) return null;
        var unita = rec.text.split('\n').map(function (r) { return r.trim(); }).filter(Boolean).map(function (riga) {
            return { id: _idUnita(rec.sourceId, rec.page, riga), text: riga, page: rec.page, title: rec.title,
                sourceId: rec.sourceId, origin: rec.origin, punteggio: 0 };
        });
        return unita.length ? { blocco: bl.id, unita: unita } : null;
    }

    /* ── TUTTO NEL RIQUADRO (giro 3, gate 3 del 02/10: «Sì, tutto nel riquadro») ──
       Al primo passo del gate la scheda si validava ancora nella superficie dello
       0067 (`montaSuperficie`, al posto del form di CREA) e il riquadro compariva
       solo dopo «Usa questa fonte»: due validazioni. Con l'interruttore acceso la
       superficie non si apre per le fonti di CREA; la scheda letta entra fra le
       fonti NON confermata, e il riquadro è l'unico posto dove la si corregge,
       si scelgono i materiali e la si conferma.
       `soloRiquadro`: si salta la superficie SOLO se l'interruttore è acceso, la
       scheda nasce da una fonte di CREA (`nuovaScheda` col file in mano: il wizard
       «Da che cosa» la chiama senza file, e l'editor di ELABORA non passa di qui)
       e il guscio di CREA può montare il riquadro — altrimenti la scheda non
       avrebbe un posto dove validarsi, e vale la superficie di prima. */
    function soloRiquadro(o) {
        o = o || {};
        return o.acceso === true && o.daCrea === true && o.guscio === true;
    }
    /* Che cosa CONTA come contenuto della scheda (entra nello snapshot della
       conferma, cioè nei nodi e nelle pagine) e che cosa è una scelta dei
       materiali (sta in `scheda.opzioni`, che `nodiDaScheda` e `fontiDaScheda` non
       leggono: cambiarla non invalida la conferma). Le chiavi delle opzioni sono
       quelle dei campi di `_sezioniOpzioni` (mappai-visione.js). */
    var OPZIONE = /^(?:(?:oq|fc|mc)\.(?:on|n|cat\.[a-z]+|ang\.[a-z_]+)|syn\.(?:on|audio))$/;
    function campoDelRiquadro(chiave) {
        var k = String(chiave == null ? '' : chiave);
        if (k === 'titolo') return 'contenuto';
        var pz = k.split('.');
        if (pz.length === 2) {
            var bl = (VC().BLOCCHI || []).filter(function (b) { return b.id === pz[0]; })[0];
            if (bl && bl.campi.some(function (c) { return c.id === pz[1]; })) return 'contenuto';
        }
        return OPZIONE.test(k) ? 'opzione' : null;
    }
    /* Si può confermare? La foto VISTA (decodificata, accanto ai campi: ADR 0016)
       e almeno le righe che chiedeva «Usa questa fonte» (`schedaPronta`, la stessa
       soglia: la superficie non c'è più, la regola resta). */
    /* ── LA LETTURA FALLITA (giro 7, guasto visto in Electron il 03/10) ─────────
       Un modello ha risposto con un JSON rotto (una chiave persa, una graffa
       mancante): `normalizzaAnalisi` (visione-core, non si tocca) cade nel suo
       ripiego e mette TUTTA la risposta grezza in «Descrizione», con gli altri
       campi vuoti. Una scheda così non è una scheda: non si conferma e non diventa
       fonte. Si riconosce da DUE cose insieme — una sola non basta:
         · «Descrizione» piena e TUTTI gli altri campi della griglia vuoti (è la
           forma del ripiego);
         · la descrizione ha l'aria di una risposta grezza: comincia con «{» o con
           un recinto ```, o contiene una chiave della griglia fra virgolette
           («"identita":», «"osservazione":»…).
       Una scheda vera con la sola descrizione scritta dal docente NON è fallita. */
    function letturaFallita(sch) {
        if (!_eScheda(sch)) return false;
        var C = VC(), desc = '', altri = 0;
        (C.BLOCCHI || []).forEach(function (bl) {
            var src = (sch[bl.id] && typeof sch[bl.id] === 'object') ? sch[bl.id] : {};
            bl.campi.forEach(function (c) {
                var v = String(src[c.id] == null ? '' : src[c.id]).trim();
                if (bl.id === 'osservazione' && c.id === 'descrizione') desc = v;
                else if (v) altri++;
            });
        });
        if (!desc || altri) return false;
        var chiavi = (C.BLOCCHI || []).map(function (bl) { return bl.id; }).join('|');
        return /^(\{|```)/.test(desc) || new RegExp('"(' + chiavi + ')"\\s*:').test(desc);
    }
    function puoConfermare(sch, o) {
        o = o || {};
        if (!_eScheda(sch)) return { ok: false, motivo: 'scheda' };
        if (letturaFallita(sch)) return { ok: false, motivo: 'lettura' };
        if (o.fotoVista !== true) return { ok: false, motivo: 'foto' };
        var C = VC();
        if (C.schedaPronta && !C.schedaPronta(sch)) return { ok: false, motivo: 'poco' };
        return { ok: true, motivo: '' };
    }

    /* ── IL NOME DELLE PROVE IN G2 (giro 9, Giacomo al gate 3) ──────────────────
       Sulla scheda «Prova 1, 2, 3, 4» non dice niente: le prove si chiamano come
       la PARTE della scheda che citano («Carta d'identità», «Che cosa si vede»…).
       La parte si ricava dall'identità della pagina (`scheda-<n>-<blocco>-…`, di
       `fontiDaScheda`) e il nome da `BLOCCHI`. Due prove nella stessa parte: la
       seconda «(2)», la terza «(3)». `pagine` = le pagine delle prove, in ordine
       ({ docId|id, title }). Se anche UNA non è una pagina della scheda (un PDF, una
       lista mista) → null: chi chiama tiene «Prova n», come prima. */
    function etichetteProve(pagine) {
        if (!Array.isArray(pagine)) return null;
        var bl = VC().BLOCCHI || [], visti = {}, out = [];
        for (var i = 0; i < pagine.length; i++) {
            var p = pagine[i] || {};
            var id = _bloccoDellaFonte(p.docId || p.id);
            var b = id ? bl.filter(function (x) { return x.id === id; })[0] : null;
            if (!b) return null;
            visti[b.id] = (visti[b.id] || 0) + 1;
            out.push(b.titolo + (visti[b.id] > 1 ? ' (' + visti[b.id] + ')' : ''));
        }
        return out;
    }

    /* ── IL NOME DEL BLOCCO NEI RIMANDI DEL TESTO (giro 10, Giacomo al gate 3) ───
       `referenceView` del grounding (vietato: lì si risolve, non si rende) numera i
       rimandi: «[Scheda 2]». Sulla scheda il numero non dice niente: qui, sulla
       sua uscita, ogni rimando la cui fonte è una pagina della scheda prende il
       NOME del blocco, «[Che cosa si vede]». Due rimandi diversi allo stesso blocco
       hanno nomi distinti («(2)», giro 10b). Si restituisce una COPIA della vista
       con `text` e le `label` del `mapping` rinominate, così `restoreReferenceIds`
       rimette gli id veri. Un rimando senza fonte («da verificare») e ogni fonte che
       non è la scheda (un PDF) restano come sono: allora la vista esce identica. */
    function rimandiConNome(vista) {
        if (!vista || typeof vista !== 'object' || !Array.isArray(vista.mapping)) return vista;
        var bl = VC().BLOCCHI || [];
        var out = clone(vista), testo = String(out.text == null ? '' : out.text), visti = {};
        /* giro 10b: il `mapping` ha un elemento per id, nell'ordine in cui gli id
           compaiono nel testo. Due id DIVERSI dello stesso blocco (due righe-campo,
           due unità) prendono nomi distinti, come i bottoni del giro 9 — «[Che cosa
           si vede]», poi «[Che cosa si vede (2)]» — così `restoreReferenceIds` resta
           biunivoco e ogni rimando torna al SUO id. Lo stesso id tiene lo stesso nome. */
        out.mapping.forEach(function (m) {
            if (!m || !m.source || !m.label) return;
            var id = _bloccoDellaFonte(m.source.docId || m.source.id);
            var b = id ? bl.filter(function (x) { return x.id === id; })[0] : null;
            if (!b) return;
            /* giro 16: un nome già nel testo (scritto a mano, o già dato a una nota)
               non si riusa: `restoreReferenceIds` lo trasformerebbe in un id anche
               dove il docente non ha toccato niente */
            var k = visti[b.id] || 0, nuova;
            do { k++; nuova = '[' + b.titolo + (k > 1 ? ' (' + k + ')' : '') + ']'; } while (testo.indexOf(nuova) >= 0);
            visti[b.id] = k;
            testo = testo.split(m.label).join(nuova);
            m.label = nuova;
        });
        out.text = testo;
        return out;
    }

    /* ── LE NOTE NUMERICHE DELLA SINTESI (giro 15, Giacomo al gate 3) ───────────
       In G2 la Sintesi di un dossier si leggeva «… espansionista [4]». Quel `[n]` è
       l'idx di `item.citations`: i numeri appartengono all'ITEM (`citationRegistry`),
       non al registro globale. Sulla scheda come fonte ogni `[n]` che punta a una
       pagina-scheda si legge col nome del suo blocco: «[Che cosa prova questa
       fonte]». È solo RESA: il dato salvato resta `[n]`, e `ripristinaNote` lo
       rimette. Ogni occorrenza ha il suo nome (due note uguali, anche attaccate,
       restano due); due numeri dello stesso blocco hanno nomi distinti («(2)»); un
       nome già scritto nel testo o già preso da un rimando (`occupate`) non si
       riusa, altrimenti al ritorno diventerebbe un numero. Un `[n]` senza pagina,
       un PDF, un item senza citazioni: il testo resta com'è. */
    function noteConNome(testo, citazioni, occupate) {
        var t = String(testo == null ? '' : testo);
        var bl = VC().BLOCCHI || [], perN = {}, perBlocco = {}, nomi = {}, note = [];
        var prese = (Array.isArray(occupate) ? occupate : []).map(String);
        (Array.isArray(citazioni) ? citazioni : []).forEach(function (c) {
            var n = c ? Number(c.idx) : NaN;
            if (!Number.isInteger(n) || n < 1 || perN[n]) return;
            var id = _bloccoDellaFonte(c.docId);
            var b = id ? bl.filter(function (x) { return x.id === id; })[0] : null;
            if (b) { perN[n] = b; (perBlocco[b.id] = perBlocco[b.id] || []).push(n); }
        });
        Object.keys(perBlocco).forEach(function (id) { perBlocco[id].sort(function (a, b) { return a - b; }); });
        var re = /\[(\d+)\]/g, m;
        while ((m = re.exec(t))) {
            var n = Number(m[1]), b = perN[n];
            if (!b || String(n) !== m[1] || nomi[n]) continue;
            /* giro 16: il suffisso è il RANGO di n fra gli idx dell'item dello stesso
               blocco, non l'ordine di comparsa: così ogni pezzo di testo (Occorrenze,
               fetta compatta, bozza e anteprima) dà lo stesso nome alla stessa nota.
               Il do/while resta come guardia contro i nomi già scritti o già presi. */
            var k = perBlocco[b.id].indexOf(n), nome;
            do { k++; nome = '[' + b.titolo + (k > 1 ? ' (' + k + ')' : '') + ']'; } while (t.indexOf(nome) >= 0 || prese.indexOf(nome) >= 0);
            nomi[n] = nome; prese.push(nome);
            note.push({ label: nome, n: n });
        }
        if (!note.length) return { text: t, note: [] };
        return {
            text: t.replace(/\[(\d+)\]/g, function (tutto, d) { return nomi[d] && String(Number(d)) === d ? nomi[d] : tutto; }),
            note: note
        };
    }
    function ripristinaNote(testo, note) {
        var t = String(testo == null ? '' : testo);
        (Array.isArray(note) ? note : []).forEach(function (x) {
            if (x && x.label && Number.isInteger(x.n)) t = t.split(x.label).join('[' + x.n + ']');
        });
        return t;
    }

    /* ── UN NOME CORRETTO A MANO (giro 16, nota 5) ─────────────────────────────
       Se il docente scrive DENTRO un nome («[Che cosa si vedi]»), al ritorno quel
       nome non è più un'etichetta: la nota sparisce e all'allievo arriva testo fra
       parentesi. Non si blocca, si avvisa. `richiamiRotti(valore, { prima,
       etichette })` cerca nel valore GIÀ ripristinato le parentesi quadre che
       somigliano al titolo di un blocco (lo cominciano, o ne distano poco: un
       refuso, un pezzo tolto, un «(n)» cambiato) e che non sono un'etichetta della
       vista né c'erano già nel testo salvato (`prima`). */
    function _norm(s) {
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
    }
    function _distanza(a, b) {
        var riga = [], i, j;
        for (j = 0; j <= b.length; j++) riga[j] = j;
        for (i = 1; i <= a.length; i++) {
            var diag = riga[0]; riga[0] = i;
            for (j = 1; j <= b.length; j++) {
                var su = riga[j];
                riga[j] = Math.min(riga[j] + 1, riga[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
                diag = su;
            }
        }
        return riga[b.length];
    }
    function richiamiRotti(valore, o) {
        o = o || {};
        var t = String(valore == null ? '' : valore), prima = String(o.prima == null ? '' : o.prima);
        var etichette = Array.isArray(o.etichette) ? o.etichette.map(String) : [];
        var titoli = (VC().BLOCCHI || []).map(function (b) { return _norm(b.titolo); });
        var out = [], re = /\[([^\[\]\n]{1,80})\]/g, m;
        while ((m = re.exec(t))) {
            var tutto = m[0];
            if (out.indexOf(tutto) >= 0 || etichette.indexOf(tutto) >= 0 || prima.indexOf(tutto) >= 0) continue;
            var c = _norm(m[1]).replace(/\s*\(\d+\)$/, '');
            if (!c) continue;
            if (titoli.some(function (ti) { return c.indexOf(ti) === 0 || _distanza(c, ti) <= Math.floor(ti.length / 3); })) out.push(tutto);
        }
        return out;
    }

    /* ── LA HOME DI UN PROGETTO IN ELABORA (giro 11, Giacomo al gate 3) ─────────
       Per un dossier da foto la tabella «Fonte» mostrava «Testo» (vuoto: da una
       foto non nasce testo) e la scheda «Analisi della fonte» finiva in fondo, fra
       gli altri materiali. Ora, a interruttore acceso e per un dossier: in «Fonte»
       la scheda (le voci `an:` di `_materiali`, che si aprono come oggi) e
       l'immagine originale in `Allegati/` (`foto` = il suo percorso relativo, o ''
       se non c'è: nessuna riga vuota); fuori dal resto la scheda (niente doppioni)
       e le voci «Testo»/«PDF» della fonte. Spento, o un progetto da PDF: il gruppo
       di sempre (le voci di tipo «Fonte»), il resto com'è.
       o = { acceso, dossier, materiali, foto } → { fonte, resto } */
    function fonteDellaHome(o) {
        o = o || {};
        var lista = Array.isArray(o.materiali) ? o.materiali : [];
        var eFonte = function (m) { return m && m.tipo === 'Fonte'; };
        if (o.acceso !== true || o.dossier !== true) {
            return { fonte: lista.filter(eFonte), resto: lista.filter(function (m) { return !eFonte(m); }) };
        }
        var eAnalisi = function (m) { return m && /^an:/.test(String(m.id)); };
        var fonte = lista.filter(eAnalisi);
        var foto = String(o.foto == null ? '' : o.foto);
        if (foto) fonte.push({ id: 'disk:' + foto, titolo: foto.split('/').pop(), tipo: 'Fonte', data: 0, archivio: false, voce: false, cls: '', disc: '' });
        return { fonte: fonte, resto: lista.filter(function (m) { return !eFonte(m) && !eAnalisi(m); }) };
    }

    /* ── COME SI MOSTRA UN FILE DEL VAULT IN ELABORA (giro 12) ───────────────────
       L'immagine originale di un dossier (circa 8,6 MB al gate 3) andava
       all'iframe come indirizzo `data:` di 11 MB: Chromium non naviga oltre i 2 MB
       e l'iframe restava bianco in silenzio. Un'immagine si mostra con un <img> e
       un blob URL ('img'); HTML in `srcdoc` ('srcdoc'); il resto (PDF, audio, altro)
       resta all'iframe `data:` ('data'), coi tipi di sempre — l'espressione di
       `_montaFile` prima di questo giro, per quei file identica. */
    function anteprimaFile(relPath) {
        var p = String(relPath == null ? '' : relPath);
        if (/\.html?$/i.test(p)) return { modo: 'srcdoc', mime: 'text/html' };
        if (/\.pdf$/i.test(p)) return { modo: 'data', mime: 'application/pdf' };
        if (/\.(mp3|m4a|wav)$/i.test(p)) return { modo: 'data', mime: 'audio/mpeg' };
        if (/\.jpe?g$/i.test(p)) return { modo: 'img', mime: 'image/jpeg' };
        if (/\.png$/i.test(p)) return { modo: 'img', mime: 'image/png' };
        if (/\.webp$/i.test(p)) return { modo: 'img', mime: 'image/webp' };
        if (/\.gif$/i.test(p)) return { modo: 'img', mime: 'image/gif' };
        return { modo: 'data', mime: 'application/octet-stream' };
    }

    /* ── IL PANNELLO DELLA FONTE IN G2 ─────────────────────────────────────────
       o = { sources (della review), dossier (config.dossier), acceso }.
         · la scheda è già la fonte → le sue pagine, l'immagine, i rimandi
           agganciati. Decide il DATO, come per le etichette di G2: un dossier nato
           con l'interruttore acceso e riaperto a spento resta coerente (nota 7);
         · non un dossier, o spento → le fonti di sempre, niente immagine;
         · un dossier generato PRIMA (fonti vuote), interruttore acceso → le pagine
           ricavate dalla scheda, solo da leggere: i rimandi restano senza aggancio. */
    function fontiDelPannello(o) {
        o = o || {};
        var sources = Array.isArray(o.sources) ? o.sources : [];
        if (eFonteScheda(sources)) return { sources: sources, immagine: true, agganciate: true };
        if (o.acceso !== true || !_eScheda(o.dossier)) return { sources: sources, immagine: false, agganciate: false };
        return { sources: fontiDaScheda(o.dossier), immagine: true, agganciate: false };
    }

    return {
        CHIAVE: CHIAVE,
        SCHEMA: SCHEMA,
        acceso: acceso,
        fontiDaScheda: fontiDaScheda,
        eFonteScheda: eFonteScheda,
        registraConferma: registraConferma,
        statoConferma: statoConferma,
        decidi: decidi,
        perIlGiro: perIlGiro,
        paginaDelRamo: paginaDelRamo,
        etichetteProve: etichetteProve,
        rimandiConNome: rimandiConNome,
        noteConNome: noteConNome,
        ripristinaNote: ripristinaNote,
        richiamiRotti: richiamiRotti,
        fonteDellaHome: fonteDellaHome,
        anteprimaFile: anteprimaFile,
        soloRiquadro: soloRiquadro,
        campoDelRiquadro: campoDelRiquadro,
        puoConfermare: puoConfermare,
        letturaFallita: letturaFallita,
        fontiDelPannello: fontiDelPannello
    };
});
