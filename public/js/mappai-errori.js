/*
 * mappai-errori.js — REGISTRO LOCALE DEGLI ERRORI (15/8/26)
 * ---------------------------------------------------------------------------
 * Non è telemetria e non è un crash reporter: NIENTE parte da qui. Le righe si
 * scrivono in `Diagnostica/errori.jsonl` sul computer del docente; la Cabina le
 * mostra e le allega alla segnalazione, che parte solo quando è lui a premere
 * «invia» nel suo programma di posta.
 *
 * Perché esiste: fino a oggi un errore non lasciava traccia. La segnalazione
 * diceva «si è chiuso» o «non funziona» — vero, e non diagnosticabile. Con il
 * registro la stessa segnalazione porta il messaggio esatto, il file e la riga,
 * il provider e il modello attivi.
 *
 * Le due difese che servono davvero (un registro che si riempie da solo è
 * peggio di nessun registro):
 *   - DEDUP: lo stesso errore nella stessa posizione non fa una riga nuova,
 *     alza un contatore. Un errore dentro un ciclo di disegno ne produce
 *     centinaia al secondo, e scriverli tutti riempirebbe il disco.
 *   - TETTO di sessione: oltre `CAP` errori distinti si smette di registrare e
 *     lo si dichiara nell'ultima riga, invece di fingere che non sia successo.
 *
 * Kill-switch: localStorage `mappai_error_log='0'`.
 * Namespace: window.MappAIErrori. Caricare DOPO app.js.
 */
(function () {
    'use strict';

    /* ⚠️ Caricato due volte, il modulo aggancerebbe DUE ascolti e terrebbe DUE
       tabelle di dedup: ogni errore finirebbe nel registro in doppia copia e la
       difesa contro le ripetizioni non varrebbe più (trovato provandolo). */
    if (typeof window !== 'undefined' && window.MappAIErrori) return;

    var CAP = 200;                 // errori DISTINTI per sessione
    var FINESTRA = 60000;          // ms entro cui lo stesso errore è "lo stesso"
    var LS = 'mappai_errori_recenti';
    var LS_CAP = 50;               // copia in localStorage: quella che la Cabina legge subito
    var visti = {};                // chiave → { n, ts }
    var distinti = 0, troncato = false;

    /* ── SATURAZIONE DEL CASSETTO (16/8) ──────────────────────────────────────
       Il guasto che ha morso davvero non è stato un errore: è stato lo spazio
       finito. `localStorage` si riempie in silenzio, e quando lancia è troppo
       tardi — il salvataggio è già perso. Su un beta tester nessuno può andare
       a guardare, quindi la saturazione si REGISTRA come si registra un errore:
       così viaggia da sola nella segnalazione, senza che debba saperlo.

       ⚠️ QUOTA_MB è un numero MISURATO, non dichiarato dalla piattaforma: sul
       profilo vero il salvataggio ha cominciato a fallire a 45,8 MB occupati.
       Non esiste un'API che dica la quota di localStorage — `navigator.storage
       .estimate()` risponde per TUTTO lo storage dell'origine (disco, cache,
       indexeddb) con numeri nell'ordine dei giga: userebbe un denominatore che
       non c'entra e direbbe sempre «0%», cioè peggio di niente.
       Se un giorno la quota cambia, il sintomo è che l'allarme critico non
       arriva mai o arriva subito: si rimisura e si cambia QUI. */
    var QUOTA_MB = 48;
    var SOGLIE = [
        { pct: 90, livello: 'critico' },   // qui il prossimo salvataggio può non entrare
        { pct: 80, livello: 'alto' },
        { pct: 60, livello: 'avviso' }
    ];
    var RANGO = { avviso: 1, alto: 2, critico: 3 };
    var saturRango = 0;            // il peggio già segnalato in questa sessione
    var ultimoControllo = 0;       // ms, per non rimisurare a ogni salvataggio

    function attivo() {
        try { return localStorage.getItem('mappai_error_log') !== '0'; } catch (e) { return true; }
    }
    function _api() {
        return (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
    }

    /* Contesto: le tre cose che cambiano la diagnosi (chi genera, con che
       modello, su quale mappa) e nient'altro. NON entrano il testo delle fonti,
       le desc dei nodi, i profili di classi e allievi. */
    function _contesto() {
        var c = {};
        try { c.provider = localStorage.getItem('ai_provider') || ''; } catch (e) { }
        try {
            var sel = document.getElementById('model-select');
            if (sel && sel.value) c.modello = sel.value;
        } catch (e) { }
        try {
            var A = window.appState;
            if (A && A.rootNodeLabel) c.mappa = String(A.rootNodeLabel).slice(0, 80);
        } catch (e) { }
        try { c.vista = location.hash || ''; } catch (e) { }
        return c;
    }

    function _mirror(rec) {
        try {
            var arr = JSON.parse(localStorage.getItem(LS) || '[]');
            if (!Array.isArray(arr)) arr = [];
            arr.push(rec);
            if (arr.length > LS_CAP) arr = arr.slice(-LS_CAP);
            localStorage.setItem(LS, JSON.stringify(arr));
        } catch (e) { /* quota piena: il file su disco resta la fonte */ }
    }

    /* Il cuore: una riga per errore distinto, un contatore per le ripetizioni. */
    function registra(dati) {
        if (!attivo()) return null;
        dati = dati || {};
        var msg = String(dati.messaggio || '').slice(0, 500);
        if (!msg) return null;
        var pos = (dati.file || '') + ':' + (dati.riga || '');
        var chiave = dati.dove + '|' + msg + '|' + pos;
        var ora = Date.now();
        var v = visti[chiave];
        if (v && (ora - v.ts) < FINESTRA) {
            v.n++; v.ts = ora;
            /* la ripetizione non è una riga nuova: si aggiorna il conteggio
               dell'ultima, così «100 volte in un minuto» resta leggibile */
            return null;
        }
        visti[chiave] = { n: 1, ts: ora };
        if (distinti >= CAP) {
            if (!troncato) {
                troncato = true;
                _scrivi({ dove: 'registro', messaggio: 'Tetto di ' + CAP + ' errori raggiunto: da qui in poi non si registra più (sessione).' });
            }
            return null;
        }
        distinti++;
        var rec = {
            ts: new Date().toISOString(),
            dove: dati.dove || 'renderer',
            messaggio: msg,
            file: dati.file || '',
            riga: dati.riga || 0,
            stack: String(dati.stack || '').slice(0, 2000),
            ctx: _contesto()
        };
        _scrivi(rec);
        return rec;
    }
    function _scrivi(rec) {
        _mirror(rec);
        var api = _api();
        if (api && api.errorLogAppend) { try { api.errorLogAppend(rec); } catch (e) { } }
    }

    /* Gli ultimi errori: dal DISCO quando c'è (è la fonte), dalla copia in
       localStorage nel browser — così la Cabina mostra qualcosa in entrambi. */
    function ultimi(n) {
        n = n || 10;
        var api = _api();
        if (api && api.errorLogRead) {
            return api.errorLogRead(n).then(function (r) {
                return { records: (r && r.records) || [], totale: (r && r.totale) || 0, file: (r && r.file) || '', disco: true };
            }, function () { return _locali(n); });
        }
        return Promise.resolve(_locali(n));
    }
    function _locali(n) {
        var arr = [];
        try { arr = JSON.parse(localStorage.getItem(LS) || '[]') || []; } catch (e) { arr = []; }
        return { records: arr.slice(-n), totale: arr.length, file: '', disco: false };
    }

    /* Il blocco da allegare alla segnalazione: testo piatto, tagliato corto —
       un'email con 40 stack non la legge nessuno, nemmeno chi l'ha chiesta. */
    function blocco(n) {
        return ultimi(n || 5).then(function (r) {
            if (!r.records.length) return '';
            var righe = r.records.map(function (e) {
                var q = (e.ctx || {});
                return '- ' + (e.ts || '') + ' [' + (e.dove || '') + '] ' + (e.messaggio || '') +
                    (e.file ? '\n  ' + e.file + ':' + (e.riga || 0) : '') +
                    (q.provider || q.modello ? '\n  provider: ' + (q.provider || '—') + ' · modello: ' + (q.modello || '—') : '') +
                    (q.mappa ? '\n  mappa: ' + q.mappa : '');
            });
            return 'ULTIMI ERRORI REGISTRATI (' + r.records.length + ' di ' + r.totale + ')\n' + righe.join('\n');
        });
    }

    function pulisci() {
        visti = {}; distinti = 0; troncato = false;
        try { localStorage.removeItem(LS); } catch (e) { }
        var api = _api();
        if (api && api.errorLogClear) return api.errorLogClear();
        return Promise.resolve({ success: true });
    }
    function apriCartella() {
        var api = _api();
        if (api && api.errorOpenFolder) return api.errorOpenFolder();
        return Promise.resolve({ success: false });
    }

    /* ── Il cassetto: quanto è pieno, e di che cosa ───────────────────────────
       PURA rispetto alle soglie (`livelloSaturazione` si prova senza browser);
       `cassetto()` invece legge localStorage, che è il punto. */
    function livelloSaturazione(pct) {
        for (var i = 0; i < SOGLIE.length; i++) {
            if (pct >= SOGLIE[i].pct) return SOGLIE[i].livello;
        }
        return null;
    }

    function _mb(byte) { return Math.round(byte / 1048576 * 10) / 10; }

    /* Una passata su localStorage: il peso totale, le chiavi più grosse e —
       se il core è a portata — quante voci di progetto sono copie in eccesso.
       Il conto delle copie passa da `MappAITeachCore.anteprimaPotatura`, la
       STESSA funzione della Cabina: due conti diversi per lo stesso numero
       sarebbero due verità, e una delle due sarebbe falsa. */
    function cassetto() {
        var tot = 0, perChiave = [], chiavi = 0;
        try {
            chiavi = localStorage.length;
            for (var i = 0; i < chiavi; i++) {
                var k = localStorage.key(i);
                var v = localStorage.getItem(k) || '';
                var b = k.length + v.length;
                tot += b;
                perChiave.push({ chiave: k, kb: Math.round(b / 1024) });
            }
        } catch (e) { return null; }
        perChiave.sort(function (a, b) { return b.kb - a.kb; });

        var progetti = 0, mappe = 0, copie = 0, copieByte = 0;
        try {
            var P = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            if (Array.isArray(P)) {
                progetti = P.length;
                var TC = (typeof window !== 'undefined') ? window.MappAITeachCore : null;
                if (TC && TC.anteprimaPotatura) {
                    var ant = TC.anteprimaPotatura(P, 1, function (id) {
                        var v = localStorage.getItem(id);
                        return v ? (id.length + v.length) : 0;
                    });
                    copie = ant.via.length;
                    copieByte = ant.byte || 0;
                    mappe = ant.perMappa ? progetti - copie : 0;
                }
            }
        } catch (e) { /* indice illeggibile: il peso totale vale lo stesso */ }

        var pct = Math.round(tot / (QUOTA_MB * 1048576) * 100);
        return {
            byte: tot, MB: _mb(tot), quotaMB: QUOTA_MB, pct: pct,
            livello: livelloSaturazione(pct),
            chiavi: chiavi, progetti: progetti, mappe: mappe,
            copie: copie, copieMB: _mb(copieByte),
            top: perChiave.slice(0, 5)
        };
    }

    /* La riga da lasciare nel registro. Si scrive UNA volta per livello e solo
       quando PEGGIORA: senza, ogni salvataggio ne aggiungerebbe una e il
       registro direbbe cento volte la stessa cosa, che è il modo più veloce di
       rendere illeggibile un registro. (La dedup normale non basta: il testo
       porta i MB, che cambiano ogni volta → sarebbero tutte righe «nuove».) */
    function controllaCassetto(motivo, forza) {
        if (!attivo()) return null;
        var ora = Date.now();
        if (!forza && (ora - ultimoControllo) < FINESTRA) return null;
        ultimoControllo = ora;
        var m = cassetto();
        if (!m) return null;
        var rango = RANGO[m.livello] || 0;
        if (rango && rango > saturRango) {
            saturRango = rango;
            registra({
                dove: 'cassetto',
                messaggio: 'Spazio locale ' + m.livello.toUpperCase() + ': ' + m.pct + '% (' +
                    m.MB + ' MB su ~' + m.quotaMB + ') · ' + m.progetti + ' voci di progetto' +
                    (m.copie ? ', di cui ' + m.copie + ' copie in eccesso (' + m.copieMB + ' MB)' : ', nessuna copia in eccesso') +
                    (m.top.length ? ' · più pesante: ' + m.top[0].chiave + ' (' + m.top[0].kb + ' KB)' : '') +
                    (motivo ? ' [' + motivo + ']' : '')
            });
        }
        return m;
    }

    /* DIAGNOSI — il comando da far incollare a un beta tester. Un blocco solo,
       da rimandare per email: che cosa gira, quanto è pieno il cassetto, gli
       ultimi errori. NON contiene testo delle fonti, desc dei nodi, profili di
       allievi né chiavi API: solo la loro PRESENZA (vedi `chiavi AI`). */
    function diagnosi(n) {
        var righe = ['=== DIAGNOSI MappAI ==='];
        try { righe.push('data: ' + new Date().toISOString()); } catch (e) { }
        try { righe.push('piattaforma: ' + navigator.platform + ' · ' + navigator.userAgent.replace(/^.*(Electron\/[\d.]+).*$/, '$1')); } catch (e) { }
        /* Il MARCATORE di cache, non un numero di versione: in questo repo il
           guasto più frequente non è «che versione hai», è «stai girando il
           JS vecchio perché il browser l'ha servito dalla cache». Il marcatore
           lo dice in un colpo, e un tester che ne mostra uno diverso dal mio
           spiega da solo perché un difetto «corretto» è ancora lì. */
        try {
            var sc = document.querySelector('script[src*="mappai-errori.js"]');
            var mk = sc ? (String(sc.getAttribute('src')).split('?v=')[1] || '—') : '—';
            righe.push('build del JS (marcatore di cache): ' + mk + ' · finestra: ' + (document.title || '—'));
        } catch (e) { }
        try {
            righe.push('chiavi AI: google=' + (localStorage.getItem('gemini_api_key') ? 'sì' : 'no') +
                ' · infomaniak=' + (localStorage.getItem('infomaniak_api_key') ? 'sì' : 'no') +
                ' · provider attivo=' + (localStorage.getItem('ai_provider') || '—'));
        } catch (e) { }
        var m = cassetto();
        if (m) {
            righe.push('cassetto: ' + m.MB + ' MB su ~' + m.quotaMB + ' (' + m.pct + '%)' +
                (m.livello ? ' — ' + m.livello.toUpperCase() : ' — ok'));
            righe.push('  voci di progetto: ' + m.progetti + ' · copie in eccesso: ' + m.copie +
                (m.copie ? ' (' + m.copieMB + ' MB, si liberano da Cabina › Gestione cartelle)' : ''));
            righe.push('  chiavi più pesanti: ' + m.top.map(function (t) { return t.chiave + ' ' + t.kb + 'KB'; }).join(' · '));
        }
        try {
            var f = [];
            ['mappai_stile_manifesto', 'mappai_teach_console', 'mappai_studio_view', 'mappai_error_log',
                'mappai_vista_ridotta', 'mappai_active_class', 'mappai_active_discipline'].forEach(function (k) {
                    var v = localStorage.getItem(k);
                    if (v !== null) f.push(k + '=' + v);
                });
            righe.push('interruttori: ' + (f.length ? f.join(' · ') : '(tutti al default)'));
        } catch (e) { }
        return blocco(n || 8).then(function (b) {
            return righe.join('\n') + '\n\n' + (b || 'Nessun errore registrato.');
        });
    }

    /* ⚠️ Gli ascolti si agganciano UNA volta e non toccano gli handler già
       presenti: `window.onerror` è una proprietà sola, e sovrascriverla
       spegnerebbe in silenzio chi c'era prima. */
    if (typeof window !== 'undefined') {
        window.addEventListener('error', function (ev) {
            if (!ev) return;
            /* un'immagine o uno script che non carica emette lo stesso evento
               ma senza `error`: si registra col nome della risorsa */
            if (!ev.error && ev.target && ev.target !== window && ev.target.tagName) {
                registra({
                    dove: 'risorsa',
                    messaggio: 'Risorsa non caricata: ' + ev.target.tagName.toLowerCase(),
                    file: ev.target.src || ev.target.href || ''
                });
                return;
            }
            registra({
                dove: 'renderer',
                messaggio: ev.message || String(ev.error && ev.error.message || ''),
                file: ev.filename || '', riga: ev.lineno || 0,
                stack: ev.error && ev.error.stack
            });
        }, true);

        window.addEventListener('unhandledrejection', function (ev) {
            var m = ev && ev.reason;
            registra({
                dove: 'promise',
                messaggio: String((m && m.message) || m || 'Promise rifiutata senza motivo'),
                stack: m && m.stack
            });
        });
    }

    var API = {
        registra: registra, ultimi: ultimi, blocco: blocco,
        pulisci: pulisci, apriCartella: apriCartella, attivo: attivo,
        cassetto: cassetto, controllaCassetto: controllaCassetto,
        livelloSaturazione: livelloSaturazione, diagnosi: diagnosi,
        CAP: CAP, QUOTA_MB: QUOTA_MB, SOGLIE: SOGLIE
    };

    if (typeof window !== 'undefined') {
        window.MappAIErrori = API;
        /* Una misura all'avvio: il cassetto già pieno all'apertura è il caso
           peggiore (l'utente non ha ancora fatto niente e il prossimo
           salvataggio può non entrare), e va nel registro prima di qualunque
           lavoro. Ritardata perché al boot `MappAITeachCore` può non esserci
           ancora, e senza di lui il conto delle copie uscirebbe zero — cioè
           una rassicurazione falsa.
           ⚠️ setTimeout e non requestAnimationFrame: a finestra non in primo
           piano il rAF non scatta affatto, e il controllo non partirebbe mai
           (trappola già pagata due volte in questo repo). */
        setTimeout(function () { try { controllaCassetto('avvio', true); } catch (e) { } }, 8000);
        console.log('[MappAIErrori] registro locale degli errori attivo');
    }
    /* Caricabile anche in Node: le soglie si provano senza un browser. */
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
