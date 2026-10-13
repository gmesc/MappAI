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
        (c.links || []).forEach(function (l) { vivi[chiave(l) + '|' + l.rel] = l; });
        var tolti = [], scartati = [];
        var esaminati = [], saltati = [], accettati = [];
        var richiesti = Object.values(vivi).filter(function (l) { return !(l.relNone === true && l.rel === '') && !NEUTRI[String(l.rel || '').toLowerCase()]; });
        richiesti.forEach(function (l) {
            var k = chiave(l), paralleli = richiesti.filter(function (x) { return chiave(x) === k; }).length;
            var candidati = (verdetti || []).filter(function (v) {
                return v && chiave(v) === k && (v.rel === l.rel || (v.rel == null && paralleli === 1));
            });
            var motivo = '', v = candidati[0];
            if (!v) motivo = 'nessun verdetto ricevuto per il nesso';
            else if (candidati.some(function (x) { return x.valido !== v.valido || _norm(x.prova_source) !== _norm(v.prova_source) || _norm(x.prova_target) !== _norm(v.prova_target); })) motivo = 'verdetti duplicati discordanti';
            else if (typeof v.valido !== 'boolean') motivo = 'verdetto privo di esito valido';
            else if (c.frammenti && (!provaContraria(v.prova_source, c.frammenti[v.source], '').ok || !provaContraria(v.prova_target, c.frammenti[v.target], '').ok)) motivo = 'prova degli estremi mancante o non presente nelle frasi mostrate';
            var riga = { source: (l.source && l.source.id) || l.source, target: (l.target && l.target.id) || l.target, rel: l.rel };
            if (motivo) {
                saltati.push(Object.assign({}, riga, { motivo: motivo }));
                if (v) scartati.push(Object.assign({}, v, { perche: motivo }));
            } else { esaminati.push(riga); accettati.push(Object.assign({}, v, { rel: l.rel })); }
        });
        (verdetti || []).forEach(function (v) {
            if (!v || !richiesti.some(function (l) { return chiave(l) === chiave(v) && (v.rel == null || v.rel === l.rel); }))
                scartati.push(Object.assign({}, v, { perche: v && Object.values(vivi).some(function (l) { return chiave(l) === chiave(v) && NEUTRI[String(l.rel || '').toLowerCase()]; }) ? 'arco già neutro: niente da togliere' : 'arco inesistente o non richiesto' }));
        });
        accettati.forEach(function (v) {
            if (!v || v.valido !== false) return;                       // solo i «non regge»
            var k = v.source + '→' + v.target;
            var l = vivi[k + '|' + v.rel];
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
        return { tolti: tolti, scartati: scartati, esaminati: esaminati, saltati: saltati };
    }

    /* Il contratto fonte-intera accetta solo ID del registro locale del giro.
       Questo controllo prova la provenienza, NON il sostegno semantico; tutte
       le correzioni e le rimozioni restano proposte, senza mutare la mappa. */
    function validaFonteIntera(data, ctx) {
        var c = ctx || {}, registro = c.registro;
        if (!data || !Array.isArray(data.nodi) || !Array.isArray(data.link))
            throw new Error('risposta del Giudice priva degli elenchi nodi e link');
        if (!registro || registro.schema !== 'mappai-fonti-giudice@1' ||
            !registro.revisione || !Array.isArray(registro.passaggi))
            throw new Error('registro delle prove assente o non valido');

        var out = { correzioni: [], segnalati: [], scartati: [], linkTolti: [], esitiLink: [],
            nodiEsaminati: [], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] };
        var passaggi = new Map(), nodi = new Map(), link = new Map(), nodiInvalidi = new Map();
        registro.passaggi.forEach(function (p) {
            if (!p || typeof p.id !== 'string' || !p.id.trim() || passaggi.has(p.id))
                throw new Error('registro delle prove con identificativi mancanti o duplicati');
            passaggi.set(p.id, p);
        });
        (c.nodi || []).forEach(function (n) { nodi.set(n.id, n); });
        var id = function (x) { return x && typeof x === 'object' ? x.id : x; };
        var terna = function (l) { return { source: id(l.source), target: id(l.target), rel: l.rel }; };
        var chiave = function (l) { return JSON.stringify([id(l.source), id(l.target), l.rel]); };
        (c.links || []).forEach(function (l) {
            if (!(l.relNone === true && l.rel === '') && !NEUTRI[String(l.rel || '').toLowerCase()])
                link.set(chiave(l), l);
        });
        function scarta(v, perche) {
            out.scartati.push(Object.assign({}, v, { perche: perche }));
        }
        function legacy(v) {
            return ['prova', 'prova_source', 'prova_target', 'valido'].some(function (k) {
                return Object.prototype.hasOwnProperty.call(v, k);
            });
        }
        function risolvi(v, obbligatorie) {
            if (legacy(v)) return { perche: 'campi di prova legacy non ammessi' };
            if (!Array.isArray(v.prove) || (obbligatorie && !v.prove.length))
                return { perche: 'identificativi delle prove mancanti' };
            var viste = new Set(), evidenze = [];
            for (var i = 0; i < v.prove.length; i++) {
                var evidenzaId = v.prove[i], p = passaggi.get(evidenzaId);
                if (typeof evidenzaId !== 'string' || !p)
                    return { perche: 'prova sconosciuta o di una revisione diversa' };
                if (viste.has(evidenzaId)) return { perche: 'identificativo di prova duplicato' };
                viste.add(evidenzaId);
                if (p.citabile !== true || ['original', 'reference'].indexOf(p.origin) < 0 ||
                    typeof p.text !== 'string' || !_norm(p.text) || !p.sourceId || !p.sourceRevision || !p.recordId)
                    return { perche: 'passaggio non ammesso come prova originale' };
                evidenze.push({ evidenzaId: p.id, docId: p.sourceId, sourceRevision: p.sourceRevision,
                    recordId: p.recordId, start: p.start, end: p.end, text: p.text, page: p.page,
                    title: p.title || '', source: p.page ? 'pagina ' + p.page : 'fonte senza pagine', verbatim: true });
            }
            return { evidenze: evidenze };
        }

        // Più difetti distinti possono riguardare lo stesso nodo. Un finding
        // inutilizzabile lascia il nodo fra i residui, senza perdere gli altri.
        var difetti = new Map();
        data.nodi.forEach(function (v) {
            if (!v || !nodi.has(v.id)) { scarta(v, 'nodo inesistente o non richiesto'); return; }
            var k = JSON.stringify([v.id, v.tipo, _norm(v.brano_errato), _norm(v.problema)]);
            if (!difetti.has(k)) difetti.set(k, []);
            difetti.get(k).push(v);
        });
        difetti.forEach(function (vs) {
            var v = vs[0], n = nodi.get(v.id), motivo = '', prove;
            if (vs.length > 1) motivo = 'segnalazione duplicata per il nodo';
            else if (TIPI.indexOf(v.tipo) < 0) motivo = 'tipo di difetto non previsto';
            else if (typeof v.problema !== 'string' || !_norm(v.problema)) motivo = 'motivo della segnalazione mancante';
            else { prove = risolvi(v, true); motivo = prove.perche || ''; }
            if (motivo) {
                vs.forEach(function (x) { scarta(x, motivo); });
                nodiInvalidi.set(v.id, motivo); return;
            }
            var riga = { id: v.id, label: n.label, tipo: v.tipo, problema: _norm(v.problema),
                prove: v.prove.slice(), evidenze: prove.evidenze, prova: prove.evidenze[0].text,
                prima: _norm(n.desc), brano: _norm(v.brano_errato), con: _norm(v.con), soloProposta: true };
            if (TIPI_APPLICABILI.indexOf(v.tipo) >= 0 && v.brano_errato && v.con) {
                var ch = chirurgia(n.desc, v.brano_errato, v.con);
                if (ch.ok) { riga.dopo = ch.nuova; out.correzioni.push(riga); return; }
                riga.perche = ch.perche;
            }
            out.segnalati.push(riga);
        });
        /* Packet 0026 (b): una risposta interrotta porta solo i verdetti già
           CHIUSI. Un nodo che non vi compare non è «senza difetti»: la risposta
           si è fermata prima di arrivarci, quindi resta fra i saltati. */
        var completi = c.completi || {};
        var citati = new Set(data.nodi.map(function (v) { return v && v.id; }));
        nodi.forEach(function (n, nodoId) {
            if (nodiInvalidi.has(nodoId)) out.nodiSaltati.push({ id: nodoId, motivo: nodiInvalidi.get(nodoId) });
            else if (completi.nodi === false && !citati.has(nodoId)) out.nodiSaltati.push({ id: nodoId, motivo: 'risposta interrotta prima di questo nodo' });
            else out.nodiEsaminati.push(nodoId);
        });

        var candidati = new Map();
        data.link.forEach(function (v) {
            if (!v || typeof v.source !== 'string' || typeof v.target !== 'string' ||
                typeof v.rel !== 'string' || !link.has(chiave(v))) {
                scarta(v, 'arco inesistente o non richiesto'); return;
            }
            var k = chiave(v);
            if (!candidati.has(k)) candidati.set(k, []);
            candidati.get(k).push(v);
        });
        link.forEach(function (l, k) {
            var vs = candidati.get(k) || [], v = vs[0], riga = terna(l), motivo = '', prove;
            if (!v) motivo = completi.link === false ? 'risposta interrotta prima di questo nesso' : 'nessun verdetto ricevuto per il nesso';
            else if (vs.length !== 1) motivo = 'verdetti duplicati per il nesso';
            else if (['sostenuto', 'contraddetto', 'non_verificabile'].indexOf(v.esito) < 0) motivo = 'esito del nesso non valido';
            else if (typeof v.problema !== 'string' || !_norm(v.problema)) motivo = 'motivo del verdetto mancante';
            else { prove = risolvi(v, v.esito !== 'non_verificabile'); motivo = prove.perche || ''; }
            if (motivo) {
                out.linkSaltati.push(Object.assign({}, riga, { motivo: motivo }));
                vs.forEach(function (x) { scarta(x, motivo); }); return;
            }
            var esito = Object.assign({}, riga, { esito: v.esito, problema: _norm(v.problema),
                prove: v.prove.slice(), evidenze: prove.evidenze });
            out.esitiLink.push(esito);
            if (v.esito === 'non_verificabile') {
                out.linkSaltati.push(Object.assign({}, riga, { motivo: _norm(v.problema), esito: v.esito })); return;
            }
            out.linkEsaminati.push(riga);
            if (v.esito === 'contraddetto') out.linkTolti.push(Object.assign({}, riga, {
                problema: _norm(v.problema), isCross: !!l.isCross, soloProposta: true, prove: v.prove.slice(),
                prova_source: prove.evidenze[0].text,
                prova_target: (prove.evidenze[1] || prove.evidenze[0]).text,
                evidenze: { source: prove.evidenze.slice(), target: prove.evidenze.slice() }
            }));
        });
        return out;
    }

    /* ── Packet 0026 — i lotti che corrono fino al tetto ─────────────────────
       Il 25/9 tre lotti su Svizzera sono arrivati a 4096 token di uscita con
       62.773 caratteri: JSON seguito da spazio bianco senza fine. V8 li ha
       rifiutati con tre firme diverse e il lotto è andato perso per intero.
       Qui sotto: che cosa si salva di una risposta così, che cosa se ne lascia
       per la diagnosi, e quali lotti una ripresa deve rifare. */

    function _posizioneErrore(messaggio, testo) {
        var m = String(messaggio || '');
        var p = m.match(/position (\d+)/);
        if (p) return Number(p[1]);
        var lc = m.match(/line (\d+) column (\d+)/);
        if (lc) {
            var righe = String(testo).split('\n').slice(0, Number(lc[1]) - 1);
            return righe.reduce(function (s, r) { return s + r.length + 1; }, 0) + Number(lc[2]) - 1;
        }
        return /end of JSON|Unterminated/i.test(m) ? String(testo).length : -1;
    }

    /* Deroga dichiarata all'invariante 8 (salvageTruncatedJSON). Il salvataggio
       generico RICHIUDE le stringhe aperte (mappai-json-salvage.js), e una
       motivazione troncata diventerebbe un verdetto «intero». Qui invece:
       · si tengono solo gli oggetti CHIUSI degli elenchi `nodi` e `link`;
       · una stringa aperta non si richiude mai: l'oggetto che la contiene cade;
       · la risposta si dichiara «non integra», e chi la usa lo sa.
       Le virgolette tipografiche dentro le motivazioni non sono delimitatori. */
    function analizzaRisposta(raw) {
        var grezzo = String(raw == null ? '' : raw);
        // trim PRIMA delle regex: `\s*` davanti a una coda di 58.000 spazi
        // diventa quadratico (1,5 s misurati).
        var testo = grezzo.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
        var inizio = testo ? Math.max(0, grezzo.indexOf(testo)) : 0;
        var errore;
        try {
            return { data: JSON.parse(testo), integra: true, errore: '', posizione: -1, completi: { nodi: true, link: true } };
        } catch (e) { errore = e; }
        var posizione = _posizioneErrore(errore && errore.message, testo);
        var data = null, completi = { nodi: false, link: false };
        var pila = [], inStringa = false, escape = false, inizioStringa = -1;
        var ultimaStringa = null, chiave = null, elenco = null, inizioElemento = -1;
        for (var i = 0; i < testo.length; i++) {
            var ch = testo.charAt(i);
            if (inStringa) {
                if (escape) escape = false;
                else if (ch === '\\') escape = true;
                else if (ch === '"') {
                    inStringa = false;
                    if (pila.length === 1) { try { ultimaStringa = JSON.parse(testo.slice(inizioStringa, i + 1)); } catch (_) { ultimaStringa = null; } }
                }
                continue;
            }
            if (ch === '"') { inStringa = true; inizioStringa = i; continue; }
            if (ch === ':' && pila.length === 1) { chiave = ultimaStringa; continue; }
            if (ch === ',' && pila.length === 1) { chiave = null; ultimaStringa = null; continue; }
            if (ch === '{' || ch === '[') {
                if (!pila.length && ch === '{') data = { };
                if (pila.length === 1 && ch === '[' && (chiave === 'nodi' || chiave === 'link')) {
                    elenco = chiave; data[elenco] = [];
                }
                if (pila.length === 2 && elenco && ch === '{') inizioElemento = i;
                pila.push(ch);
                continue;
            }
            if (ch === '}' || ch === ']') {
                pila.pop();
                if (pila.length === 2 && elenco && ch === '}' && inizioElemento >= 0) {
                    var pezzo = testo.slice(inizioElemento, i + 1), oggetto = null;
                    try { oggetto = JSON.parse(pezzo); }
                    catch (_) { try { oggetto = JSON.parse(pezzo.replace(/[\u0000-\u001f]/g, ' ')); } catch (__) { oggetto = null; } }
                    if (oggetto && typeof oggetto === 'object' && !Array.isArray(oggetto)) data[elenco].push(oggetto);
                    inizioElemento = -1;
                }
                if (pila.length === 1 && ch === ']' && elenco) { completi[elenco] = true; elenco = null; }
                if (!pila.length) break;
            }
        }
        if (data) ['nodi', 'link'].forEach(function (k) { if (!Array.isArray(data[k])) data[k] = []; });
        return { data: data, integra: false, errore: String(errore && errore.message || 'JSON non analizzabile'),
            posizione: posizione >= 0 ? inizio + posizione : -1, completi: completi };
    }

    /* Le corse di spazio bianco si comprimono: un lotto corso a vuoto ne ha
       decine di migliaia, e nel rapporto basta dire quante erano. */
    function _comprimi(t) {
        return String(t).replace(/\s{40,}/g, function (s) {
            return ' ⟨… ' + String(s.length).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' spazi …⟩ ';
        });
    }
    /* L'estratto per la diagnosi: SOLO testo del modello e numeri. Niente
       payload, header, stack o credenziali: finisce in pipeline.json. */
    function estrattoGrezzo(raw, info) {
        var t = String(raw == null ? '' : raw), o = info || {}, pos = Number(o.posizione);
        var out = { lunghezza: t.length, outTok: Number(o.outTok) || 0, tetto: Number(o.tetto) || 0 };
        var bianco = function (i) { return i >= 0 && i < t.length && /\s/.test(t.charAt(i)); };
        // Un taglio non spezza una corsa di spazi: il conteggio compresso è quello vero.
        var taglio = function (a, b) {
            a = Math.max(0, a); b = Math.min(t.length, b);
            while (a > 0 && bianco(a) && bianco(a - 1)) a--;
            while (b < t.length && bianco(b) && bianco(b - 1)) b++;
            return _comprimi(t.slice(a, b));
        };
        if (t.length <= 1200) out.inizio = _comprimi(t);
        else { out.inizio = taglio(0, 600); out.fine = taglio(t.length - 600, t.length); }
        if (pos >= 0) out.posizione = pos;
        if (pos >= 0 && t.length > 1200) out.attorno = taglio(pos - 300, pos + 300);
        if (o.errore) out.errore = String(o.errore).slice(0, 200);
        return out;
    }

    /* Esiti TECNICI: la macchina non ha risposto per intero (tetto, analisi,
       rete, tempo). Non sono verdetti e non lo diventano: si possono rifare. */
    function lottoTecnico(r) {
        return !!r && (r.stato === 'errore' || !!r.tecnico);
    }

    /* Quali lotti rifare. Si ripete SOLO ciò che è fallito per ragioni tecniche,
       e solo se fonte, contratto e modello sono gli stessi del rapporto
       precedente e i lotti hanno gli stessi bersagli; altrimenti si rifà tutto,
       e il motivo lo dice. Precedente: retryPlan dei materiali. */
    function pianoRipresa(rapporto, attuale) {
        var a = attuale || {}, lotti = Array.isArray(a.lotti) ? a.lotti : [];
        var tutto = function (motivo) {
            return { modo: 'completa', motivo: motivo, rifare: lotti.map(function (l) { return l.lotto; }), riusati: {} };
        };
        var r = rapporto;
        if (!r || typeof r !== 'object') return tutto('nessun rapporto precedente');
        if (r.contratto !== a.contratto) return tutto('contratto del controllo diverso');
        if (!r.fonte || !a.revisione || r.fonte.revisione !== a.revisione) return tutto('fonte cambiata dal controllo precedente');
        var m = r.modello;
        if (!m || !m.model) return tutto('modello del controllo precedente non registrato');
        if (!a.modello || m.provider !== a.modello.provider || m.model !== a.modello.model) return tutto('modello diverso dal controllo precedente');
        var esiti = Array.isArray(r.esitiRami) ? r.esitiRami : [];
        if (esiti.length !== lotti.length) return tutto('lotti diversi dal controllo precedente');
        var chiave = function (x) { return JSON.stringify([x.source, x.target, x.rel]); };
        var rifare = [], riusati = {};
        for (var i = 0; i < lotti.length; i++) {
            var l = lotti[i], v = esiti.filter(function (e) { return e && e.lotto === l.lotto; });
            if (v.length !== 1) return tutto('lotti diversi dal controllo precedente');
            v = v[0];
            if (String(v.id) !== String(l.id) || JSON.stringify(v.nodi || []) !== JSON.stringify(l.nodi || []) ||
                !Array.isArray(v.terne) || JSON.stringify(v.terne.map(chiave)) !== JSON.stringify((l.terne || []).map(chiave)))
                return tutto('lotti diversi dal controllo precedente');
            if (lottoTecnico(v)) { rifare.push(l.lotto); continue; }
            var mio = function (row) { return row && typeof row === 'object' && row.lotto === l.lotto; };
            var cop = r.copertura || {}, nodiLotto = new Set(v.nodi || []);
            var righe = {};
            ['correzioni', 'segnalati', 'scartati', 'linkTolti', 'esitiLink'].forEach(function (k) {
                righe[k] = (Array.isArray(r[k]) ? r[k] : []).filter(mio);
            });
            righe.copertura = {
                nodiEsaminati: (cop.nodiEsaminati || []).filter(function (id) { return nodiLotto.has(id); }),
                nodiSaltati: (cop.nodiSaltati || []).filter(mio),
                linkEsaminati: (cop.linkEsaminati || []).filter(mio),
                linkSaltati: (cop.linkSaltati || []).filter(mio)
            };
            riusati[l.lotto] = { esito: JSON.parse(JSON.stringify(v)), righe: JSON.parse(JSON.stringify(righe)) };
        }
        return { modo: 'mirata', motivo: rifare.length ? '' : 'nessun lotto con esito tecnico da ripetere', rifare: rifare, riusati: riusati };
    }

    return {
        analizzaRisposta: analizzaRisposta,
        estrattoGrezzo: estrattoGrezzo,
        lottoTecnico: lottoTecnico,
        pianoRipresa: pianoRipresa,
        TIPI: TIPI,
        TIPI_APPLICABILI: TIPI_APPLICABILI,
        TIPI_SEGNALA: TIPI_SEGNALA,
        DEFAULTS: DEFAULTS,
        provaContraria: provaContraria,
        chirurgia: chirurgia,
        validaVerdetti: validaVerdetti,
        validaLink: validaLink,
        validaFonteIntera: validaFonteIntera
    };
}));
