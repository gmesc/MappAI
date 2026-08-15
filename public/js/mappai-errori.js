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

    window.MappAIErrori = {
        registra: registra, ultimi: ultimi, blocco: blocco,
        pulisci: pulisci, apriCartella: apriCartella, attivo: attivo,
        CAP: CAP
    };
    console.log('[MappAIErrori] registro locale degli errori attivo');
})();
