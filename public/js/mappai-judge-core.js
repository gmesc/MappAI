// ══════════════════════════════════════════════════════════════════════════
// MappAI — Judge Core (il giudice: che cosa si accetta di un verdetto)
// ══════════════════════════════════════════════════════════════════════════
//
// PERCHÉ ESISTE (12 settembre 2026). L'àncora misura la fedeltà LESSICALE e non
// vede l'errore che conta. Sulla generazione vera esce 0,78-0,82 con ZERO nodi
// sotto soglia, e intanto la fonte dice che era LA GERMANIA ad aver bisogno di
// franchi svizzeri mentre la desc dice che era la Svizzera a ottenere valuta:
// le parole vengono tutte dalla fonte, è il senso a essere girato. Per quella
// classe di errore serve un lettore, non un contatore.
//
// ⚠️ PERCHÉ IL GIUDICE NON RISCRIVE LE DESCRIZIONI. Il progetto è passato da un
// ventaglio di cinque proposte, ognuna con un avversario incaricato di demolirla.
// Quattro su cinque hanno convenuto, e uno l'ha MISURATO facendo girare le
// guardie proposte sul caso vero: correggere «la Svizzera aveva bisogno di
// franchi» in «la Germania…» e fare lo scambio INVERSO producono numeri
// IDENTICI. Nessun controllo lessicale sa distinguere la correzione dalla
// corruzione proprio sulla classe di errore per cui il giudice esiste. Quindi:
//   · in prosa non si riscrive niente, mai;
//   · si accetta solo la CHIRURGIA — il giudice copia la porzione esatta della
//     desc che è sbagliata e propone che cosa metterci, e il codice fa una
//     sostituzione di stringa sola, verificabile con due confronti;
//   · tutto il resto diventa una riga di rapporto per il docente.
//
// La citazione deve stare nelle frasi mostrate. La novità lessicale NON prova
// una contraddizione: uno scambio di soggetti conserva tutte le parole. Le
// proposte restano consultabili anche senza parole nuove; in quel caso non
// sono ammesse alle correzioni automatiche del percorso legacy.
//
// UMD puro → testabile in Node: tests/judge-core.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-desc-fidelity.js'));
    } else {
        root.MappAIJudgeCore = factory(root.MappAIDescFidelity);
    }
}(typeof self !== 'undefined' ? self : this, function (FID) {
    'use strict';

    /* I difetti LOCALI si sostituiscono con una forbice: sono una porzione di
       testo sbagliata dentro una frase giusta. Gli altri due no — «questo fatto
       non sta nella fonte» non si corregge cambiando tre parole, si toglie o si
       riscrive il nodo, e quella è una decisione del docente. */
    var TIPI_APPLICABILI = ['soggetto-invertito', 'data-attribuita-male', 'termine-sostituito'];
    /* ⚠️ «fatto-non-nella-fonte» È STATO TOLTO (12/9), e la ragione sta in due
       generazioni vere: su VENTI segnalazioni, VENTI erano di quel tipo, e quasi
       tutte dicevano «nelle frasi fornite per questo nodo non si menziona X»
       mentre X stava nel documento, in un'altra frase. Esempio: «non si fa
       menzione dell'annessione dell'Austria nel 1938», che nella fonte c'è.
       Il giudice vede una FINESTRA — le citazioni del nodo più altre frasi delle
       stesse pagine — e da una finestra si può dire «questo testo dice il
       contrario», mai «questa cosa non esiste». Chiedergli un'assenza era
       chiedergli l'unica cosa che non può sapere, e produceva solo falsi
       allarmi che consumano l'attenzione del docente.
       Resta `fatto-contraddetto`: le frasi mostrate dicono un'altra cosa. */
    var TIPI_SEGNALA = ['fatto-contraddetto', 'nesso-non-nella-fonte'];
    var TIPI = TIPI_APPLICABILI.concat(TIPI_SEGNALA);

    var DEFAULTS = {
        maxBrano: 12,        // parole: oltre, non è una forbice ma una riscrittura
        crescita: 1.6,       // quanto può allungarsi la sostituzione rispetto al brano
        maxPerRamo: 3        // quante correzioni si applicano in un ramo, al massimo
    };

    function _parole(t) {
        if (FID && typeof FID.contentWords === 'function') return FID.contentWords(t);
        return String(t || '').toLowerCase().match(/[a-zàèéìòóùü]{4,}/g) || [];
    }
    function _norm(t) {
        return String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    }
    // confronto « morbido » per ritrovare un frammento: spazi e punteggiatura
    // non contano, perché il modello ricopia quasi sempre con una virgola in meno
    function _piatto(t) {
        return String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /* Verifica la provenienza della citazione, NON la correttezza semantica
       del verdetto. Una proposta con lo stesso lessico richiede il docente. */
    function provaContraria(prova, frammenti, desc) {
        var p = _piatto(prova);
        if (!p || p.length < 8) return { ok: false, perche: 'prova troppo corta' };
        var dentro = (frammenti || []).some(function (f) {
            return _piatto(f).indexOf(p) >= 0;
        });
        if (!dentro) return { ok: false, perche: 'prova non è fra le frasi mostrate' };
        var nellaDesc = {};
        _parole(desc).forEach(function (w) { nellaDesc[w] = 1; });
        var nuove = _parole(prova).filter(function (w) { return !nellaDesc[w]; });
        return { ok: true, nuove: nuove, soloProposta: !nuove.length };
    }

    /* LA CHIRURGIA. `brano` deve comparire nella desc com'è, e `con` deve essere
       una cosa diversa e non più lunga di tanto. Due confronti di stringa: non
       c'è nessuna soglia da tarare, ed è il motivo per cui questa strada è
       accettabile mentre la riscrittura in prosa non lo è. */
    function chirurgia(desc, brano, con, opts) {
        var o = Object.assign({}, DEFAULTS, opts || {});
        var d = _norm(desc), b = _norm(brano), c = _norm(con);
        if (!d || !b || !c) return { ok: false, perche: 'brano o sostituzione mancanti' };
        if (b.split(/\s+/).length > o.maxBrano) return { ok: false, perche: 'brano troppo lungo: è una riscrittura' };
        if (_piatto(b) === _piatto(c)) return { ok: false, perche: 'la sostituzione è uguale al brano' };
        if (c.split(/\s+/).length > Math.max(3, Math.ceil(b.split(/\s+/).length * o.crescita))) {
            return { ok: false, perche: 'la sostituzione è molto più lunga del brano' };
        }
        var i = d.indexOf(b);
        if (i < 0) {
            /* ripiego morbido: il modello ha ricopiato con una virgola in meno.
               Si cerca sul testo appiattito e si risale alla porzione vera, così
               la sostituzione resta una sola e verificabile. */
            var pd = _piatto(d), pb = _piatto(b);
            if (pd.indexOf(pb) < 0) return { ok: false, perche: 'il brano non compare nella descrizione' };
            var re = new RegExp(b.split(/\s+/).map(function (w) {
                return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('[^a-zA-Z0-9à-ÿ]+'), 'i');
            var m = d.match(re);
            if (!m) return { ok: false, perche: 'il brano non compare nella descrizione' };
            return { ok: true, nuova: _norm(d.replace(m[0], c)) };
        }
        return { ok: true, nuova: _norm(d.slice(0, i) + c + d.slice(i + b.length)) };
    }

    /* Che cosa si accetta dell'intera risposta del giudice, per un ramo.
       Ogni verdetto esce in una di tre condizioni: `applicato` (chirurgia
       riuscita), `segnalato` (difetto vero ma non da forbice, o chirurgia non
       verificabile), `scartato` (il verdetto stesso non regge). */
    function validaVerdetti(verdetti, ctx) {
        var c = ctx || {};
        var o = Object.assign({}, DEFAULTS, c.opts || {});
        var perId = {};
        (c.nodi || []).forEach(function (n) { perId[n.id] = n; });
        var applicati = [], segnalati = [], scartati = [];

        (verdetti || []).forEach(function (v) {
            var scarta = function (perche) { scartati.push(Object.assign({}, v, { id: v && v.id, perche: perche })); };
            if (!v || !v.id || !perId[v.id]) return scarta('nodo inesistente');
            if (TIPI.indexOf(v.tipo) < 0) return scarta('tipo di difetto non previsto');
            var n = perId[v.id];
            var frammenti = (c.frammenti && c.frammenti[v.id]) || [];
            if (!frammenti.length) return scarta('nodo senza frasi mostrate');

            var pc = provaContraria(v.prova, frammenti, n.desc || '');
            if (!pc.ok) return scarta(pc.perche);

            var riga = { id: v.id, label: n.label, tipo: v.tipo, problema: v.problema || '', prova: _norm(v.prova),
                prima: _norm(n.desc), brano: _norm(v.brano_errato), con: _norm(v.con), soloProposta: pc.soloProposta };

            if (TIPI_APPLICABILI.indexOf(v.tipo) < 0) { segnalati.push(riga); return; }
            if (!v.brano_errato || !v.con) { segnalati.push(riga); return; }
            var ch = chirurgia(n.desc, v.brano_errato, v.con, o);
            if (!ch.ok) { riga.perche = ch.perche; segnalati.push(riga); return; }
            riga.brano = _norm(v.brano_errato);
            riga.con = _norm(v.con);
            riga.prima = _norm(n.desc);
            riga.dopo = ch.nuova;
            if (!o.proposalOnly && applicati.length >= o.maxPerRamo) {
                riga.perche = 'oltre il tetto di correzioni per ramo';
                segnalati.push(riga); return;
            }
            applicati.push(riga);
        });

        return { applicati: applicati, segnalati: segnalati, scartati: scartati };
    }

    /* I NESSI. Il giudice DEGRADA e basta: non promuove mai un arco neutro a un
       verbo causale, perché inventare un nesso è precisamente il difetto che
       stiamo inseguendo — e perché un arco nasce «include» quando il flag delle
       linking words è spento, cioè quasi sempre.
       Si valutano solo gli archi che un verbo ce l'hanno già. */
    var NEUTRI = { 'include': 1, 'includes': 1, 'correlato a': 1, 'related to': 1, 'dettagli': 1, 'approfondisce': 1 };

    function validaLink(verdetti, ctx) {
        var c = ctx || {};
        var chiave = function (l) {
            var id = function (x) { return (x && typeof x === 'object') ? x.id : x; };
            return id(l.source) + '→' + id(l.target);
        };
        var vivi = {};
        (c.links || []).forEach(function (l) { vivi[chiave(l)] = l; });
        var tolti = [], scartati = [];
        (verdetti || []).forEach(function (v) {
            if (!v || v.valido !== false) return;                       // solo i «non regge»
            var k = v.source + '→' + v.target;
            var l = vivi[k];
            if (!l) { scartati.push({ k: k, perche: 'arco inesistente' }); return; }
            if (NEUTRI[String(l.rel || '').toLowerCase()]) {
                scartati.push({ k: k, perche: 'arco già neutro: niente da togliere' }); return;
            }
            if (c.frammenti) {
                var ps = provaContraria(v.prova_source, c.frammenti[v.source], '');
                var pt = provaContraria(v.prova_target, c.frammenti[v.target], '');
                if (!ps.ok || !pt.ok) {
                    scartati.push(Object.assign({}, v, { k: k, perche: 'prova degli estremi mancante o non presente nelle frasi mostrate' }));
                    return;
                }
            }
            tolti.push({ source: v.source, target: v.target, rel: l.rel, problema: v.problema || '', isCross: !!l.isCross,
                prova_source: _norm(v.prova_source), prova_target: _norm(v.prova_target) });
        });
        return { tolti: tolti, scartati: scartati };
    }

    return {
        TIPI: TIPI,
        TIPI_APPLICABILI: TIPI_APPLICABILI,
        TIPI_SEGNALA: TIPI_SEGNALA,
        DEFAULTS: DEFAULTS,
        provaContraria: provaContraria,
        chirurgia: chirurgia,
        validaVerdetti: validaVerdetti,
        validaLink: validaLink
    };
}));
