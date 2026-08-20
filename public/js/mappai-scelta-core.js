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

    /* ── IL GIUDIZIO DI RICHIAMO ─────────────────────────────────────────────
       Ogni domanda è una TRACCIA DI RECUPERO, e l'esercizio è riconoscere quali
       riaccendono le proprie conoscenze. I quattro chip dicono quello — non una
       preferenza («mi piace», «è chiara») ma quanto la domanda ha acceso:
         subito    → mi viene in mente subito
         partenza  → so da dove partire
         vago      → mi dice qualcosa, ma vago
         niente    → non mi accende niente
       ⚠️ `niente` si dà anche a una domanda che NON si prende, ed è il dato più
       interessante per il docente: un richiamo che non funziona. Per questo il
       giudizio vive in `stato.letture` e non dentro la risposta.
       Sono chip e non un campo libero perché sul telefono una riflessione per
       domanda si scrive solo se costa un tocco, e perché quattro valori si
       contano mentre venti frasi no; il campo libero resta accanto. */
    var CHIP = ['subito', 'partenza', 'vago', 'niente'];
    /* i chip che dichiarano un'attivazione (tutti tranne `niente`): serve al
       profilo, e scritto una volta sola non si può sbagliare a elencarlo */
    function accende(chip) { return CHIP.indexOf(_s(chip)) >= 0 && _s(chip) !== 'niente'; }

    /* La configurazione dell'attività. `minimo` è l'unica leva numerica; le
       altre sono interruttori del docente (in-app: dello studente stesso).
       ⚠️ I tre spenti sono spenti apposta: sono passi IN PIÙ dopo la consegna,
       e chi li accende deve saperlo. */
    var CFG_DEFAULT = {
        minimo: 3,
        minimoAree: 2,           /* quante macro-aree almeno: una sola è la mappa da uno spiraglio */
        sogliaAree: 2,           /* sotto due aree CON UN NOME il passo delle aree non ha che chiedere */
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
            out[k] = (typeof CFG_DEFAULT[k] === 'number')
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
                    /* ⚠️ Nei set veri `correct` è la STRINGA della risposta, non
                       un indice: lo schema di `generateDynamicQuiz` dichiara
                       `correct: STRING`. Prima si cerca fra le opzioni (come fa
                       `dynItemToLive` in live-teacher), poi si accetta un indice
                       numerico — 1-based o 0-based. Senza il primo ramo NESSUNA
                       domanda a scelta multipla aveva una risposta esatta. */
                    var ci = -1;
                    if (it.correctIndex != null) ci = Number(it.correctIndex);
                    else if (typeof it.correct === 'string' && it.correct) {
                        var cc = _chiave(it.correct);
                        for (var oi = 0; oi < v.opzioni.length; oi++) {
                            if (_chiave(v.opzioni[oi]) === cc) { ci = oi; break; }
                        }
                        if (ci < 0) {
                            var nn = parseInt(it.correct, 10);
                            if (!isNaN(nn)) ci = (nn >= 1 && nn <= v.opzioni.length) ? nn - 1 : nn;
                        }
                    } else if (typeof it.correct === 'number') ci = Number(it.correct) - 1;
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

    /* ── LE MACRO-AREE ───────────────────────────────────────────────────────
       Il primo passo dell'attività: dichiarare dove ci si sente sicuri. Ogni
       area dice QUANTE domande porta, perché una scelta si fa vedendo quanto
       costa — la stessa ragione per cui il bento mostra la stima delle chiamate.
       ⚠️ Il conteggio va fatto sul pool CAMPIONATO, o si prometterebbero 35
       domande dove se ne leggeranno 7. */
    function aree(pool) {
        return perRamo(pool).map(function (g) {
            var base = 0;
            g.domande.forEach(function (v) { if (v.livello === 'base') base++; });
            return { ramo: g.ramo, quante: g.domande.length, base: base, ponte: g.domande.length - base };
        });
    }

    /* Il pool ridotto alle aree scelte. ⚠️ Nessuna area scelta = TUTTO: un
       filtro che non filtra è più prudente di un elenco vuoto, e copre i vault
       vecchi dove il ramo non c'è (là le aree non si possono nemmeno scegliere). */
    function filtraPerAree(pool, scelte) {
        var a = (scelte || []).slice();
        if (!a.length) return (pool || []).slice();
        return (pool || []).filter(function (v) { return a.indexOf(v.ramo || '') >= 0; });
    }

    /* ── IL CAMPIONAMENTO: una domanda per (area × angolo) ───────────────────
       La generazione produce 5 domande per ramo PER ANGOLO: sette angoli fanno
       35 domande per ramo, ~175 su una mappa da cinque macro-aree. Su 175
       nessuno legge — si cerca la prima che si sa, che è il contrario
       dell'esercizio.
       Dove tagliare lo dice la struttura, non il caso: i sette ANGOLI sono sette
       TIPI DI RICHIAMO diversi sullo stesso contenuto, le cinque varianti dello
       stesso angolo sono lo stesso richiamo riscritto (l'angolo è assoluto nel
       prompt). Le cinque servono al docente, che ne fa le righe A e B di una
       verifica; a chi deve riconoscere quale taglio lo accende servono i sette
       tagli. Quindi: una per coppia (ramo, angolo), scelta col SEME dello
       studente — deterministica al rientro, diversa fra due studenti, così la
       classe copre tutto il materiale senza che nessuno legga tutto.
       ⚠️ Le altre varianti non si perdono: restano nei fogli del vault. */
    function unaPerAngolo(pool, seed) {
        var per = {}, ordine = [];
        (pool || []).forEach(function (v) {
            var k = (v.ramo || '') + '|' + (v.angle || '');
            if (!per[k]) { per[k] = []; ordine.push(k); }
            per[k].push(v);
        });
        var out = [];
        ordine.forEach(function (k) {
            /* il seme entra con la CHIAVE: due gruppi non devono pescare tutti
               lo stesso indice, o uno studente avrebbe sempre la prima domanda
               di ogni angolo e un altro sempre l'ultima */
            out.push(mescola(per[k], _s(seed) + '|' + k)[0]);
        });
        /* si rimette l'ordine del pool di partenza: `perRamo` e la lettura
           contano su quello (i rami nell'ordine della mappa) */
        var tenuti = {};
        out.forEach(function (v) { tenuti[v.id] = 1; });
        return (pool || []).filter(function (v) { return tenuti[v.id]; });
    }

    /* Il percorso a tre passi serve? No quando il primo passo non ha niente da
       chiedere: meno di due aree CON UN NOME (i fogli vecchi non portano il
       ramo, e su quel vault le aree non esistono). ⚠️ Non è una soglia sul
       NUMERO di domande: dopo il campionamento sono poche per costruzione, e una
       soglia sul totale sarebbe vera sempre — cioè un passo che c'è e non serve
       (trappola 27, al contrario). */
    function passiUtili(pool, cfg) {
        var c = normalizzaCfg(cfg);
        var conNome = aree(pool).filter(function (a) { return a.ramo; });
        return conNome.length >= c.sogliaAree;
    }

    /* Si può passare alle domande? Come la consegna: dice che cosa manca, non
       vieta. `nessuna_domanda` non nasce dall'elenco (un'area vuota non si
       mostra) ma da uno stato vecchio, dove l'area c'era e il vault è cambiato. */
    function validaAree(pool, stato, cfg) {
        var c = normalizzaCfg(cfg);
        var scelte = (stato && stato.aree) || [];
        var motivi = [];
        if (scelte.length < c.minimoAree) motivi.push({ id: 'sotto_minimo_aree', quante: c.minimoAree - scelte.length, minimo: c.minimoAree, scelte: scelte.length });
        else if (!filtraPerAree(pool, scelte).length) motivi.push({ id: 'nessuna_domanda' });
        return { ok: !motivi.length, motivi: motivi };
    }

    /* ── LO STATO DELLO STUDENTE ─────────────────────────────────────────────
       { aree: [...], fase, letture: { <id>: {chip, nota} },
         risposte: { <id>: {testo|scelta, auto} }, note, evitata }

       DUE registri, e la separazione è di sostanza:
       · `letture` = che cosa mi ha ACCESO leggendo la domanda. Si dà a qualunque
         domanda, anche a una che non si prende — «non mi accende niente» è il
         dato più interessante per il docente, e dentro la risposta non ci
         sarebbe mai stato posto.
       · `risposte` = che cosa ho RISPOSTO. Solo per le domande prese.
       Una domanda è SCELTA se ha una voce in `risposte`; è SCRITTA se quella
       voce porta una risposta vera. Sono due cose diverse: si può prendere una
       domanda e lasciarla a metà, e il contatore lo dice. */
    function _risposte(stato) { return (stato && stato.risposte) || {}; }
    function _letture(stato) { return (stato && stato.letture) || {}; }
    function scritta(r) {
        if (!r) return false;
        if (r.scelta != null && r.scelta !== '') return true;
        return !!_trim(r.testo);
    }
    function conteggio(pool, stato) {
        var R = _risposte(stato), L = _letture(stato), scelte = 0, fatte = 0, lette = 0, spente = 0;
        (pool || []).forEach(function (v) {
            var l = L[v.id];
            if (l && CHIP.indexOf(_s(l.chip)) >= 0) { lette++; if (!accende(l.chip)) spente++; }
            if (!(v.id in R)) return;
            scelte++;
            if (scritta(R[v.id])) fatte++;
        });
        return { scelte: scelte, scritte: fatte, totale: (pool || []).length, lette: lette, spente: spente };
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
                per[a] = { angle: a, totale: 0, scelte: 0, scritte: 0, evitate: 0, chip: {}, base: 0, ponte: 0, letti: 0, spenti: 0 };
                ordine.push(a);
            }
            return per[a];
        }
        var L = _letture(stato);
        (pool || []).forEach(function (v) {
            var r = riga(v.angle || '');
            r.totale++;
            /* il giudizio di richiamo si conta SEMPRE, anche su una domanda non
               presa: è lì che sta «questo taglio non mi dice niente» */
            var l = L[v.id];
            if (l && CHIP.indexOf(_s(l.chip)) >= 0) {
                r.chip[l.chip] = (r.chip[l.chip] || 0) + 1;
                r.letti++;
                if (!accende(l.chip)) r.spenti++;
            }
            var a = R[v.id];
            if (a) {
                r.scelte++;
                if (scritta(a)) r.scritte++;
                if (v.livello === 'base') r.base++; else r.ponte++;
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
            maiPresi: righe.filter(function (r) { return r.totale && !r.scelte; }).map(function (r) { return r.angle; }),
            /* le aree dichiarate al primo passo: «mi sento sicuro su Oceani e
               Atmosfera» è una risposta metacognitiva, e nel report vale quanto
               le risposte scritte */
            aree: ((stato && stato.aree) || []).slice(),
            /* i tagli che non hanno acceso NIENTE dove sono stati letti: è la
               riga che dice quale tipo di richiamo non funziona per lui */
            spenti: righe.filter(function (r) { return r.letti && r.spenti === r.letti; }).map(function (r) { return r.angle; })
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

    /* La gemella per le AREE: quante volte una macro-area è stata scelta al
       primo passo, e da quanti allievi è stata lasciata fuori. «Nessuno si sente
       sicuro sugli Oceani» è una domanda per il docente, non un voto agli
       allievi. */
    function calorAree(pool, stati) {
        var per = {}, ordine = [];
        aree(pool).forEach(function (a) {
            if (!a.ramo) return;                 /* il gruppo senza nome non è un'area */
            per[a.ramo] = { ramo: a.ramo, quante: a.quante, sceltaDa: 0, evitataDa: 0 };
            ordine.push(a.ramo);
        });
        (stati || []).forEach(function (st) {
            var scelte = (st && st.aree) || [];
            ordine.forEach(function (r) {
                if (scelte.indexOf(r) >= 0) per[r].sceltaDa++; else per[r].evitataDa++;
            });
        });
        return ordine.map(function (r) { return per[r]; })
            .sort(function (x, y) { return (y.evitataDa - x.evitataDa) || (x.ramo < y.ramo ? -1 : 1); });
    }


    /* ── LO STATO CHE ARRIVA DA FUORI ────────────────────────────────────────
       In Live lo stato lo manda il TELEFONO: è una frontiera di fiducia, e
       quello che ne esce finisce su disco e nel report. Qui si tiene solo ciò
       che si riconosce — id che esistono davvero nel pool di QUELLO studente,
       chip del vocabolario, testi capati — e si scarta il resto in silenzio:
       un client che manda spazzatura non deve poter gonfiare un file né far
       comparire una domanda che non gli era stata servita.
       Una funzione sola, perché la usano il server e il guscio in-app. */
    var MAX_TESTO = 4000, MAX_NOTA = 300, MAX_NOTE = 2000;
    /* Un testo che arriva dalla rete si capa E si ripulisce: i caratteri di
       controllo `JSON.stringify` li scrive `\u0001`, sei byte per carattere —
       un testo al tetto ne pesava sei volte tanto su disco. */
    function _cap(x, n) { return _s(x).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n); }
    /* `{}` eredita `constructor`, `toString`, `hasOwnProperty`: senza questa
       guardia una chiave inventata dal telefono passava il controllo «esiste nel
       pool», e `__proto__` cambiava il prototipo dell'oggetto salvato. */
    function _ha(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function normalizzaStato(pool, stato) {
        stato = stato || {};
        var validi = {};
        (pool || []).forEach(function (v) { validi[v.id] = v; });
        /* ⚠️ `fase` nasce VUOTA, non a 'scegli': è la view che decide da dove si
           parte (`passiUtili` → il passo delle aree), e un valore di ripiego
           scritto qui rendeva quel ramo morto per chiunque normalizzi lo stato
           prima di passarlo — cioè per il server e per il guscio in-app. Il
           passo ① esisteva e non ci si arrivava mai. */
        var out = { aree: [], fase: '', letture: {}, risposte: {}, bozze: {}, note: '', evitata: null };

        var rami = {};
        (pool || []).forEach(function (v) { if (v.ramo) rami[v.ramo] = 1; });
        (Array.isArray(stato.aree) ? stato.aree : []).forEach(function (r) {
            r = _trim(r);
            if (rami[r] && out.aree.indexOf(r) < 0) out.aree.push(r);
        });

        var f = _s(stato.fase);
        out.fase = (f === 'aree' || f === 'rispondi' || f === 'scegli') ? f : '';

        var L = stato.letture || {};
        Object.keys(L).forEach(function (id) {
            if (!_ha(validi, id) || !L[id] || typeof L[id] !== 'object') return;
            var l = {}, c = _s(L[id].chip);
            if (CHIP.indexOf(c) >= 0) l.chip = c;
            var n = _trim(_cap(L[id].nota, MAX_NOTA));
            if (n) l.nota = n;
            if (l.chip || l.nota) out.letture[id] = l;
        });

        function _risposta(v, src) {
            var r = {};
            if (v.tipo === 'mc') {
                /* ⚠️ Senza opzioni non esiste indice valido: un tetto di ripiego
                   lasciava entrare un «98» che `scritta()` contava come risposta,
                   e con quello si arrivava al minimo di consegna a mani vuote. */
                var quante = (v.opzioni || []).length;
                var i = parseInt(src.scelta, 10);
                if (quante && i >= 0 && i < quante) r.scelta = i;
            } else {
                var t = _cap(src.testo, MAX_TESTO);
                if (_trim(t)) r.testo = t;
            }
            var a = parseInt(src.auto, 10);
            if (a >= 1 && a <= 3) r.auto = a;
            return r;
        }
        var R = stato.risposte || {};
        Object.keys(R).forEach(function (id) {
            if (!_ha(validi, id) || !R[id] || typeof R[id] !== 'object') return;
            /* una domanda PRESA e lasciata vuota è un dato: la voce resta, e il
               contatore la conta fra le «scelte» ma non fra le «scritte» */
            out.risposte[id] = _risposta(validi[id], R[id]);
        });

        /* Le domande LASCIATE: la view ci parcheggia la risposta invece di
           buttarla, e senza questo ciclo il parcheggio non sopravviveva al
           rientro — cioè l'unico gesto della schermata che distrugge lavoro. */
        var B = stato.bozze || {};
        Object.keys(B).forEach(function (id) {
            if (!_ha(validi, id) || !B[id] || typeof B[id] !== 'object') return;
            out.bozze[id] = _risposta(validi[id], B[id]);
        });

        out.note = _cap(stato.note, MAX_NOTE);
        if (stato.evitata && _ha(validi, _s(stato.evitata.id))) {
            out.evitata = { id: _s(stato.evitata.id), why: _trim(_cap(stato.evitata.why, MAX_NOTA)) };
        }
        return out;
    }

    var CORE = {
        ANGOLI: angoli, CHIP: CHIP, accende: accende,
        CFG_DEFAULT: CFG_DEFAULT, normalizzaCfg: normalizzaCfg,
        aree: aree, filtraPerAree: filtraPerAree, unaPerAngolo: unaPerAngolo,
        passiUtili: passiUtili, validaAree: validaAree,
        angoloDalTitolo: angoloDalTitolo,
        poolDaFogli: poolDaFogli, pubblico: pubblico,
        mescola: mescola, perRamo: perRamo,
        scritta: scritta, conteggio: conteggio, validaConsegna: validaConsegna,
        profilo: profilo, evitata: evitata, calorClasse: calorClasse, calorAree: calorAree,
        normalizzaStato: normalizzaStato
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (typeof window === 'undefined') return;
    if (window.MappAIScelta) return;          /* due caricamenti = due stati (trappola 22) */
    window.MappAIScelta = CORE;
}());
