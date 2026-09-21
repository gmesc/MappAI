// ══════════════════════════════════════════════════════════════════════════
// MappAI — La misura delle evidenze (passo 6 del piano Evidence, ADR 0002)
// ══════════════════════════════════════════════════════════════════════════
//
// A che cosa serve. La pipeline delle evidenze si chiude con un NUMERO, non con
// «la nuova strada produce testo»: sulla STESSA mappa si costruiscono i fogli di
// domande due volte — interruttore spento, poi acceso — e si confrontano sugli
// stessi nodi. Perché quel confronto sia possibile, ogni giro deve lasciare una
// traccia che sopravviva alla sessione: fino a ieri il conto dei tenuti e degli
// scartati finiva in una `console.warn` e al giro dopo non c'era più.
//
// Che cosa fa questo file. Tiene il giro in corso in memoria e lo scrive in
//   userData/MappAI-Pipeline/<runId>/misura-evidenze.json
// via `electronAPI.savePipelineArtifact` — lo stesso stampo, best-effort e mai
// bloccante, di `mappai-l1-checkpoint.js:103`. Fuori da Electron (l'app dello
// studente su iPad) `electronAPI` non esiste: qui non succede niente e la
// generazione prosegue.
//
// Che cosa NON fa. Aritmetica (invariante 4): raccoglie ciò che l'unico punto di
// scarto — `generateDynamicQuiz` in `mappai-study-session.js` — ha già in mano, e
// a contare è `MappAIPipelineCore.riassuntoScarti`, che si prova in Node. E non
// cambia NIENTE di ciò che l'utente vede: nessun modale, nessun toast, nessun
// secondo interruttore (invariante 1 — l'interruttore delle evidenze resta uno,
// `mappai_evidence`, e la traccia si scrive comunque, acceso o spento: un giro
// non tracciato è un giro da rifare).
//
// L'identità del giro si dichiara quando il giro COMINCIA (invariante 20-bis):
// progetto, interruttore, provider e modello di quel momento. Un giro nuovo
// nasce quando cambia il progetto, quando cambia lo stato dell'interruttore —
// ed è esattamente ciò che succede fra i due giri della misura — oppure dopo un
// quarto d'ora di silenzio.
//
// Dalla console:
//   MappAIMisuraEvidenze.stato()    — il giro in corso, in una riga
//   MappAIMisuraEvidenze.chiudi()   — scrive subito e chiude
//   MappAIMisuraEvidenze.giro()     — il riassunto, come finisce sul disco
// ══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.MappAIMisuraEvidenze) return;   // trappola 22: due copie = due stati

    var FILE = 'misura-evidenze.json';
    var ATTESA_SCRITTURA = 2000;      // ms: si scrive quando il foglio successivo non arriva
    var SILENZIO_NUOVO_GIRO = 15 * 60 * 1000;

    // appState è `let` (non su window): il pattern di dev-console-metrics.js
    function _stato() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _core() { return window.MappAIPipelineCore; }

    var giro = null;      // { runId, progetto, quando, interruttore, provider, modello, fogli: [], ultimo }
    var timer = null;

    function _acceso() {
        try {
            var EV = window.MappAIEvidence;
            return !!(EV && typeof EV.acceso === 'function' && EV.acceso());
        } catch (e) { return false; }
    }
    function _progetto() {
        var st = _stato();
        try {
            return (st && st.rootNodeLabel) ||
                (window._getTimelineProjectName ? window._getTimelineProjectName() : '') || 'MappAI';
        } catch (e) { return 'MappAI'; }
    }
    /* Provider e modello del MOMENTO, non quelli che hanno generato la mappa: a
       scrivere le domande è il modello scelto adesso. Stessa lettura di
       `mappai-material-pipeline.js:1426` (`config.aiContext`). */
    function _provider() {
        var st = _stato();
        return (st && st.aiProvider) || '';
    }
    function _modello() {
        try {
            var el = document.getElementById('model-select');
            if (el && el.value) return el.value;
            var k = _provider() === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
            return localStorage.getItem(k) || '';
        } catch (e) { return ''; }
    }

    function _runId(progetto, acceso, quando) {
        var d = quando instanceof Date ? quando : new Date();
        var p = function (n) { return String(n).padStart(2, '0'); };
        var stampo = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
            p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
        var nome = String(progetto || 'mappa')
            .replace(/[^a-z0-9àèéìòù]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
            .toLowerCase().slice(0, 40) || 'mappa';
        /* Lo stato dell'interruttore nel NOME della cartella: le due cartelle
           della misura si riconoscono senza aprirle, e `confronta.mjs` le si
           passa nell'ordine giusto al primo colpo. */
        return stampo + '_' + nome + '_evidenze-' + (acceso ? 'on' : 'off');
    }

    /* Il giro in corso vale ancora? Cambia progetto o cambia interruttore → è un
       altro giro, e sono proprio i due gesti della misura. Il silenzio lungo è la
       rete per chi torna a generare il giorno dopo senza aver chiuso l'app. */
    function _giroBuono(progetto, acceso) {
        if (!giro) return false;
        if (giro.progetto !== progetto) return false;
        if (giro.interruttore !== (acceso ? 'acceso' : 'spento')) return false;
        return (Date.now() - giro.ultimo) <= SILENZIO_NUOVO_GIRO;
    }
    function _apri(progetto, acceso) {
        var ora = new Date();
        giro = {
            runId: _runId(progetto, acceso, ora),
            progetto: progetto,
            quando: ora.toISOString(),
            interruttore: acceso ? 'acceso' : 'spento',
            provider: _provider(),
            modello: _modello(),
            fogli: [],
            ultimo: Date.now()
        };
        console.info('[Misura evidenze] giro «' + giro.runId + '» · interruttore ' + giro.interruttore);
        return giro;
    }

    // ── la scrittura (best-effort, mai bloccante) ──────────────────────────
    function _scrivi() {
        timer = null;
        if (!giro || !giro.fogli.length) return Promise.resolve({ success: false, error: 'giro vuoto' });
        var C = _core();
        if (!C || typeof C.riassuntoScarti !== 'function') return Promise.resolve({ success: false, error: 'core assente' });
        var riassunto;
        try { riassunto = C.riassuntoScarti(giro); }
        catch (e) { console.warn('[Misura evidenze] riassunto fallito (non bloccante):', e && e.message); return Promise.resolve({ success: false }); }
        try {
            var api = window.electronAPI;
            if (!api || typeof api.savePipelineArtifact !== 'function') {
                // Fuori da Electron (app dello studente): si tace e si prosegue.
                return Promise.resolve({ success: false, error: 'electronAPI non disponibile' });
            }
            return Promise.resolve(api.savePipelineArtifact({
                runId: giro.runId, fileName: FILE, content: JSON.stringify(riassunto, null, 2)
            })).catch(function (e) {
                console.warn('[Misura evidenze] scrittura fallita (non bloccante):', e && e.message);
                return { success: false };
            });
        } catch (e) {
            console.warn('[Misura evidenze] scrittura fallita (non bloccante):', e && e.message);
            return Promise.resolve({ success: false });
        }
    }
    function _programmaScrittura() {
        try {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { _scrivi(); }, ATTESA_SCRITTURA);
        } catch (e) { _scrivi(); }
    }

    /* Il pacchetto servito a QUESTO ramo, dalla traccia in memoria delle
       evidenze (`MappAIEvidence.ultimeTracce()`, una voce per ramo servito, con
       `area` = l'etichetta pulita del nodo — la stessa che la pipeline passa
       qui come `nodeLabel`). Si LEGGE, non si riscrive (il file delle evidenze
       è vietato a questo lavoro). Spento non c'è nessuna traccia, e va bene:
       il foglio dichiara zero id serviti perché zero gliene sono stati serviti. */
    function _pacchettoDelRamo(area) {
        try {
            var EV = window.MappAIEvidence;
            if (!EV || typeof EV.ultimeTracce !== 'function') return null;
            var tracce = EV.ultimeTracce() || [];
            var chiave = String(area == null ? '' : area).normalize('NFC').trim();
            for (var i = tracce.length - 1; i >= 0; i--) {
                var t = tracce[i];
                if (t && String(t.area == null ? '' : t.area).normalize('NFC').trim() === chiave) return t;
            }
            return null;
        } catch (e) { return null; }
    }

    // ── l'unico ingresso: un foglio di domande appena filtrato ──────────────
    /* `dati` = ciò che il punto di scarto ha già in mano:
         { area, tipo, angolo, materiale, ricevute, tenute, scartati }
       Niente conti qui dentro: `ids` esce da `idEvidenze` (la sola fonte del
       formato degli identificatori) e tutto il resto lo conta il core. */
    function foglio(dati) {
        try {
            var d = dati && typeof dati === 'object' ? dati : {};
            var C = _core();
            if (!C || typeof C.idEvidenze !== 'function') return null;
            var materiale = typeof d.materiale === 'string' ? d.materiale : '';
            var progetto = _progetto(), acceso = _acceso();
            if (!_giroBuono(progetto, acceso)) _apri(progetto, acceso);
            var traccia = _pacchettoDelRamo(d.area);
            giro.fogli.push({
                area: d.area, tipo: d.tipo, angolo: d.angolo,
                quando: new Date().toISOString(),
                ids: C.idEvidenze(materiale),
                caratteri: materiale.length,
                query: traccia ? traccia.query : '',
                unitaScartate: traccia ? traccia.scartate : 0,
                ricevute: Array.isArray(d.ricevute) ? d.ricevute : [],
                tenute: Array.isArray(d.tenute) ? d.tenute : [],
                scartati: Array.isArray(d.scartati) ? d.scartati : []
            });
            giro.ultimo = Date.now();
            _programmaScrittura();
            return giro.runId;
        } catch (e) {
            console.warn('[Misura evidenze] foglio non registrato (non bloccante):', e && e.message);
            return null;
        }
    }

    function chiudi() {
        try { if (timer) { clearTimeout(timer); timer = null; } } catch (e) { /* noop */ }
        var p = _scrivi();
        var finito = giro;
        giro = null;
        return Promise.resolve(p).then(function (r) {
            if (finito && r && r.success) console.info('[Misura evidenze] scritto: ' + (r.path || FILE));
            return r;
        });
    }

    function riassunto() {
        var C = _core();
        if (!giro || !C || typeof C.riassuntoScarti !== 'function') return null;
        return C.riassuntoScarti(giro);
    }

    function stato() {
        if (!giro) { console.info('[Misura evidenze] nessun giro in corso'); return null; }
        var r = riassunto();
        var t = r ? r.totali : null;
        console.info('[Misura evidenze] ' + giro.runId + ' · interruttore ' + giro.interruttore +
            (t ? (' · ' + t.rami + ' rami, ' + t.fogli + ' fogli, ' + t.ricevute + ' domande ricevute, ' +
                t.conId + ' con un id valido, ' + t.scartate + ' scartate') : ''));
        return r;
    }

    window.MappAIMisuraEvidenze = {
        FILE: FILE,
        foglio: foglio,
        chiudi: chiudi,
        giro: riassunto,
        stato: stato
    };
    console.log('[MappAIMisuraEvidenze] traccia dei fogli di domande caricata (passo 6)');
})();
