/*
 * mappai-scelta-core.js — la logica PURA delle attività «a scelta»
 * ---------------------------------------------------------------------------
 * Lo studente riceve TUTTE le domande che una mappa ha prodotto — i fogli
 * «Domande aperte» generati uno per angolo, o i set a scelta multipla — con
 * l'ANGOLO NASCOSTO, e sceglie a quali rispondere. Qui dentro c'è solo la
 * regola: che cosa entra nel mucchio, in che ordine lo vede uno studente, come
 * si raggruppa, quando si può consegnare, che profilo ne esce.
 *
 * Perché un core a sé (inv. 4): la stessa regola gira in tre posti che non si
 * assomigliano — il server LAN (Node), la pagina servita al telefono, e l'app
 * dentro un modale. Scritta nella UI si potrebbe provare solo aprendo la UI.
 *
 * Che cosa NON fa: non legge il disco, non conosce `appState`, non disegna
 * niente e non decide QUANDO mostrare l'angolo (quello lo decide chi trasporta:
 * in Live l'angolo resta sul server fino alla consegna).
 *
 * UMD: `module.exports` per Node, `window.MappAIScelta` per il browser.
 */
(function () {
    'use strict';

    /* ── Gli ANGOLI: una fonte sola ───────────────────────────────────────────
       L'elenco vero è `QUIZ_ANGLES` (mappai-study-session.js) e la pipeline lo
       legge da `PipelineCore.angoliMulti()`. Qui si prende da lì; il ripiego
       serve a Node quando il core gira da solo. Un terzo elenco scritto a mano
       divergerebbe al primo angolo aggiunto (inv. 6). */
    var _ANGOLI_FALLBACK = ['definizione', 'causa', 'conseguenza', 'esempio', 'confronto', 'eccezione', 'applicazione'];
    var PC = (function () {
        try {
            if (typeof require !== 'undefined' && typeof window === 'undefined') return require('./mappai-pipeline-core.js');
        } catch (e) { /* il core della pipeline non c'è: si usa il ripiego */ }
        return (typeof window !== 'undefined' && window.MappAIPipelineCore) ? window.MappAIPipelineCore : null;
    })();
    function angoli() {
        if (PC && PC.angoliMulti) {
            var a = PC.angoliMulti();
            if (a && a.length) return a;
        }
        return _ANGOLI_FALLBACK.slice();
    }

    /* Le quattro risposte a «perché questa?». Sono CHIP e non un campo libero
       perché sul telefono una riflessione per domanda si scrive solo se costa un
       tocco — e perché quattro valori si contano, mentre venti frasi no. Il
       campo libero resta accanto, per chi ha qualcosa da aggiungere. */
    var CHIP = ['so', 'curioso', 'chiara', 'altre_oscure'];

    /* La configurazione dell'attività. `minimo` è l'unica leva numerica; le
       altre sono interruttori del docente (in-app: dello studente stesso).
       ⚠️ I tre spenti sono spenti apposta: sono passi IN PIÙ dopo la consegna,
       e chi li accende deve saperlo. */
    var CFG_DEFAULT = {
        minimo: 3,
        osservazioni: true,      /* il campo libero in fondo */
        reveal: true,            /* dopo la consegna: il profilo per angolo */
        perRamo: true,           /* le domande raggruppate per macro-area */
        perche_no: false,        /* una domanda evitata: «perché no?» */
        autovalutazione: false,  /* «sicuro · così così · a caso» per risposta */
        secondo_giro: false      /* «prova una che hai evitato» */
    };
    function normalizzaCfg(cfg) {
        cfg = cfg || {};
        var out = {};
        Object.keys(CFG_DEFAULT).forEach(function (k) {
            out[k] = (k === 'minimo')
                ? Math.max(0, Math.min(50, parseInt(cfg[k], 10) || CFG_DEFAULT[k]))
                : (cfg[k] == null ? CFG_DEFAULT[k] : !!cfg[k]);
        });
        return out;
    }

    function _s(x) { return String(x == null ? '' : x); }
    function _trim(x) { return _s(x).replace(/\s+/g, ' ').trim(); }
    /* Confronto fra testi: serve alla dedup e a niente altro. Minuscolo, accenti
       scomposti e via (l'accento esiste in due forme, guida trappola 25), e ogni
       cosa che non sia lettera o cifra diventa uno SPAZIO — non il nulla:
       togliendo l'apostrofo senza rimpiazzarlo, «cos'è» e «cos è» resterebbero
       due chiavi diverse, cioè la dedup non troverebbe proprio i casi per cui
       esiste (due fogli con angoli diversi ripetono la stessa domanda scritta
       in due modi). Per la stessa ragione il trattino separa: nel titolo di un
       foglio è ciò che divide i pezzi del nome. */
    function _chiave(x) {
        var t = _s(x).toLowerCase();
        if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /* ── L'ANGOLO DAL TITOLO ─────────────────────────────────────────────────
       I fogli generati prima del 19/8 non portano l'angolo dentro la sorgente:
       ce l'hanno solo nel nome (`Domande-aperte-<Mappa>-causa`, e `misto` per
       «auto»). Si legge da lì, e si guarda l'ULTIMO pezzo del nome perché il
       titolo di una copia può contenere qualunque parola («verifica di ottobre
       - causa»). Niente da leggere → '' , che vuol dire «angolo non noto»: nel
       profilo diventa una voce a sé, non un angolo indovinato. */
    function angoloDalTitolo(titolo) {
        var t = _chiave(titolo);
        if (!t) return '';
        var parole = t.split(' ');
        var elenco = angoli();
        for (var i = parole.length - 1; i >= 0; i--) {
            var p = parole[i];
            if (p === 'misto' || p === 'auto') return 'auto';
            if (elenco.indexOf(p) >= 0) return p;
        }
        return '';
    }

    /* Un id STABILE per la domanda: la stessa domanda dello stesso foglio deve
       avere lo stesso id a ogni apertura, o il rientro dello studente non
       ritroverebbe le sue risposte. Non è una firma crittografica: è un'etichetta
       corta e ripetibile (djb2 in base 36). */
    function _hash(s) {
        var h = 5381;
        s = _s(s);
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    /* ── IL MUCCHIO ──────────────────────────────────────────────────────────
       `fogli` = [{titolo, angle, tipo, items}] — li legge chi ha accesso al
       disco (Fase D/E), qui arrivano già aperti. `tipo` vale 'open' o 'mc' e
       cambia SOLO il campo della risposta: la scelta, i chip, il profilo sono
       gli stessi, ed è la ragione per cui la superficie è una sola.
       ⚠️ DEDUP fra fogli: sette angoli sullo stesso ramo ripetono qualche
       domanda parola per parola. Vince il PRIMO foglio (quindi l'ordine con cui
       arrivano conta, ed è quello dei file); la copia scartata non si perde del
       tutto — il suo angolo entra in `anche`, così il profilo sa che quella
       domanda apparteneva a due tagli. */
    function poolDaFogli(fogli) {
        var out = [], visti = {};
        (fogli || []).forEach(function (f, fi) {
            if (!f) return;
            var tipo = (f.tipo === 'mc') ? 'mc' : 'open';
            var ang = _s(f.angle) || angoloDalTitolo(f.titolo);
            var titolo = _trim(f.titolo);
            (f.items || []).forEach(function (it, i) {
                if (!it) return;
                var testo = _trim(it.question || it.domanda || it.q || it.stem || '');
                if (!testo) return;
                var k = _chiave(testo);
                if (visti[k] != null) {
                    var g = out[visti[k]];
                    if (ang && g.angle !== ang && g.anche.indexOf(ang) < 0) g.anche.push(ang);
                    return;
                }
                var v = {
                    id: _hash(titolo + '|' + i + '|' + k),
                    tipo: tipo,
                    testo: testo,
                    angle: ang,
                    anche: [],
                    /* il ramo lo dichiara l'item (la pipeline lo scrive dal
                       19/8); i fogli più vecchi non ce l'hanno e finiscono nel
                       gruppo senza nome, che è la verità e non un difetto */
                    ramo: _trim(it.ramo || it.l1 || (Array.isArray(it.areas) ? it.areas[0] : '')),
                    livello: (_s(it.livello).toLowerCase() === 'base') ? 'base' : 'ponte',
                    foglio: titolo,
                    traccia: _trim(it.guide || it.traccia || '')
                };
                if (tipo === 'mc') {
                    var opz = Array.isArray(it.options) ? it.options.slice()
                        : [it.a1, it.a2, it.a3].filter(function (x) { return x != null; });
                    v.opzioni = opz.map(_trim).filter(Boolean);
                    /* la soluzione NON entra nel pool che si serve al telefono:
                       chi trasporta la toglie (come `publicQuestions` in Live).
                       Qui si conserva perché l'in-app corregge in locale. */
                    var ci = (it.correctIndex != null) ? Number(it.correctIndex)
                        : (typeof it.correct === 'number' ? Number(it.correct) - 1 : -1);
                    v.giusta = (ci >= 0 && ci < v.opzioni.length) ? ci : -1;
                }
                visti[k] = out.length;
                out.push(v);
            });
        });
        return out;
    }

    /* Il pool SENZA le soluzioni: è ciò che si manda a un telefono. Una funzione
       sola, così nessuno se la riscrive dimenticando un campo (è lo stesso
       principio della whitelist di `publicQuestions` in Live). */
    function pubblico(pool) {
        return (pool || []).map(function (v) {
            var p = { id: v.id, tipo: v.tipo, testo: v.testo, ramo: v.ramo, livello: v.livello };
            if (v.tipo === 'mc') p.opzioni = (v.opzioni || []).slice();
            if (v.traccia) p.traccia = v.traccia;
            return p;           /* niente `angle`, niente `giusta`, niente `foglio` */
        });
    }

    /* ── L'ORDINE ────────────────────────────────────────────────────────────
       Mescolato, ma con un seme: lo stesso studente ritrova lo stesso ordine
       quando rientra (altrimenti la domanda che stava scrivendo si sposta), e
       due studenti vedono ordini diversi — che è il punto di un'attività in cui
       si sceglie. LCG a 32 bit: non serve casualità vera, serve ripetibilità. */
    function mescola(pool, seed) {
        var arr = (pool || []).slice();
        var s = 0, sd = _s(seed);
        for (var i = 0; i < sd.length; i++) s = (s * 31 + sd.charCodeAt(i)) >>> 0;
        if (!s) s = 1;
        for (var j = arr.length - 1; j > 0; j--) {
            s = (1664525 * s + 1013904223) >>> 0;
            var k = s % (j + 1);
            var t = arr[j]; arr[j] = arr[k]; arr[k] = t;
        }
        return arr;
    }

    /* Le domande raggruppate per macro-area, nell'ordine in cui i rami compaiono
       nel pool (che è quello dei fogli, cioè quello della mappa). Il gruppo
       senza nome va IN CODA: sono le domande dei fogli vecchi, e metterle in
       cima farebbe cominciare da ciò che l'app sa di meno. */
    function perRamo(pool) {
        var ordine = [], per = {};
        (pool || []).forEach(function (v) {
            var r = v.ramo || '';
            if (!per[r]) { per[r] = []; ordine.push(r); }
            per[r].push(v);
        });
        var senza = ordine.indexOf('');
        if (senza >= 0) { ordine.splice(senza, 1); ordine.push(''); }
        return ordine.map(function (r) { return { ramo: r, domande: per[r] }; });
    }

    /* ── LO STATO DELLO STUDENTE ─────────────────────────────────────────────
       { risposte: { <id>: {testo|scelta, chip, nota, auto} }, note, evitata }
       Una domanda è SCELTA se ha una voce in `risposte`; è SCRITTA se quella
       voce porta una risposta vera. Sono due cose diverse: si può prendere una
       domanda e lasciarla a metà, e il contatore lo dice. */
    function _risposte(stato) { return (stato && stato.risposte) || {}; }
    function scritta(r) {
        if (!r) return false;
        if (r.scelta != null && r.scelta !== '') return true;
        return !!_trim(r.testo);
    }
    function conteggio(pool, stato) {
        var R = _risposte(stato), scelte = 0, fatte = 0;
        (pool || []).forEach(function (v) {
            if (!(v.id in R)) return;
            scelte++;
            if (scritta(R[v.id])) fatte++;
        });
        return { scelte: scelte, scritte: fatte, totale: (pool || []).length };
    }

    /* Si può consegnare? Non è un divieto: chi vuole consegnare comunque lo fa
       (la superficie chiede conferma). Qui si dice solo CHE COSA manca, e si
       dice in righe distinte perché sono rimedi diversi. */
    function validaConsegna(pool, stato, cfg) {
        var c = normalizzaCfg(cfg);
        var n = conteggio(pool, stato);
        var motivi = [];
        if (n.scritte < c.minimo) motivi.push({ id: 'sotto_minimo', quante: c.minimo - n.scritte, minimo: c.minimo, scritte: n.scritte });
        var vuote = n.scelte - n.scritte;
        if (vuote > 0) motivi.push({ id: 'scelte_vuote', quante: vuote });
        return { ok: !motivi.length, motivi: motivi, conteggio: n };
    }

    /* ── IL PROFILO: che cosa ho scelto, senza saperlo ───────────────────────
       È il pezzo per cui l'attività esiste. Per ogni angolo: quante domande di
       quel taglio c'erano, quante ne ho prese, quante ne ho scritte, e con che
       motivo. `evitate` non è «totale − scelte» a caso: è il numero che si legge
       come «di questo taglio non ne ho voluta nessuna».
       ⚠️ Le domande senza angolo noto (fogli vecchi) finiscono in `''`: dirlo è
       meglio che spalmarle sugli altri. */
    function profilo(pool, stato) {
        var R = _risposte(stato);
        var per = {}, ordine = [];
        function riga(a) {
            if (!per[a]) {
                per[a] = { angle: a, totale: 0, scelte: 0, scritte: 0, evitate: 0, chip: {}, base: 0, ponte: 0 };
                ordine.push(a);
            }
            return per[a];
        }
        (pool || []).forEach(function (v) {
            var r = riga(v.angle || '');
            r.totale++;
            var a = R[v.id];
            if (a) {
                r.scelte++;
                if (scritta(a)) r.scritte++;
                if (v.livello === 'base') r.base++; else r.ponte++;
                var ch = _s(a.chip);
                if (CHIP.indexOf(ch) >= 0) r.chip[ch] = (r.chip[ch] || 0) + 1;
            } else r.evitate++;
        });
        var righe = ordine.map(function (a) { return per[a]; })
            .sort(function (x, y) { return (y.scelte - x.scelte) || (x.angle < y.angle ? -1 : 1); });
        var n = conteggio(pool, stato);
        return {
            righe: righe,
            conteggio: n,
            /* l'angolo più scelto e quello mai preso: sono le due frasi che si
               possono dire allo studente senza fargli leggere una tabella */
            preferito: (righe[0] && righe[0].scelte) ? righe[0].angle : '',
            maiPresi: righe.filter(function (r) { return r.totale && !r.scelte; }).map(function (r) { return r.angle; })
        };
    }

    /* Una domanda EVITATA da riproporre: serve a «perché no?» e al secondo giro.
       Si pesca dall'angolo meno scelto — è lì che la domanda «come mai questo
       taglio non l'hai voluto» ha una risposta interessante — e a parità si usa
       il seme, così non è sempre la prima dell'elenco. Null se ha preso tutto. */
    function evitata(pool, stato, seed) {
        var R = _risposte(stato);
        var libere = (pool || []).filter(function (v) { return !(v.id in R); });
        if (!libere.length) return null;
        var p = profilo(pool, stato);
        var peso = {};
        p.righe.forEach(function (r) { peso[r.angle] = r.scelte; });
        var min = Math.min.apply(null, libere.map(function (v) { return peso[v.angle || ''] || 0; }));
        var cand = libere.filter(function (v) { return (peso[v.angle || ''] || 0) === min; });
        return mescola(cand, _s(seed) + '|evitata')[0] || null;
    }

    /* ── LA CLASSE ───────────────────────────────────────────────────────────
       Quanti allievi hanno EVITATO del tutto ogni angolo. È la riga che dice
       qualcosa al docente su come ha insegnato, non solo su chi ha studiato: se
       le eccezioni non le prende nessuno, la domanda è sua. */
    function calorClasse(pool, stati) {
        var per = {};
        (pool || []).forEach(function (v) {
            var a = v.angle || '';
            if (!per[a]) per[a] = { angle: a, evitatoDa: 0, scelteTotali: 0, allievi: 0 };
        });
        (stati || []).forEach(function (st) {
            var p = profilo(pool, st);
            p.righe.forEach(function (r) {
                if (!per[r.angle]) per[r.angle] = { angle: r.angle, evitatoDa: 0, scelteTotali: 0, allievi: 0 };
                per[r.angle].allievi++;
                per[r.angle].scelteTotali += r.scelte;
                if (r.totale && !r.scelte) per[r.angle].evitatoDa++;
            });
        });
        return Object.keys(per).map(function (a) { return per[a]; })
            .sort(function (x, y) { return (y.evitatoDa - x.evitatoDa) || (x.angle < y.angle ? -1 : 1); });
    }

    var CORE = {
        ANGOLI: angoli, CHIP: CHIP, CFG_DEFAULT: CFG_DEFAULT, normalizzaCfg: normalizzaCfg,
        angoloDalTitolo: angoloDalTitolo,
        poolDaFogli: poolDaFogli, pubblico: pubblico,
        mescola: mescola, perRamo: perRamo,
        scritta: scritta, conteggio: conteggio, validaConsegna: validaConsegna,
        profilo: profilo, evitata: evitata, calorClasse: calorClasse
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (typeof window === 'undefined') return;
    if (window.MappAIScelta) return;          /* due caricamenti = due stati (trappola 22) */
    window.MappAIScelta = CORE;
}());
