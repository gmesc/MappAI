// ══════════════════════════════════════════════════════════════════════════
// MappAI — Evidenze (cucitura fra `mappai-evidence-core.js`, la revisione e il vault)
// ══════════════════════════════════════════════════════════════════════════
//
// Passi 2 e 3 del piano Evidence (ADR 0002, docs/tasks/0002-evidence-indice.md,
// docs/tasks/0003-evidence-materiale-ramo.md).
// Alla riapertura di un progetto — da `MappAIReview.restore`, che tutti e
// quattro i percorsi di apertura attraversano — costruisce, o rilegge se non è
// stantio, `evidenze.json` nella RADICE del vault: l'indice delle evidenze,
// derivato dalle pagine che la revisione conserva in pipeline.json. Poi, quando
// la pipeline dei materiali chiede il materiale di un ramo (`_branchMaterial`),
// `materialeRamo` le dà il pacchetto di frasi vere della fonte al posto delle
// desc. Zero chiamate a modelli, nessun reranker: `punteggi` resta vuoto finché
// la misura del passo 6 non dice che serve.
//
// Qui vivono SOLO l'interruttore, l'IPC e lo stato in memoria; la logica è nel
// core, provata in Node (invariante 4). Il file è dell'app, derivato e
// ricostruibile a costo zero (invariante 7): MAI in `Materiale Studio/`, dove
// ogni .json diventa un materiale fantasma.
//
// Kill-switch: localStorage `mappai_evidence` = '1' accende; spento di default
// (ADR 0002), e spento nulla cambia, riga per riga. Dalla console, finché non
// c'è la spunta in Configurazione AI (passo 4):
//   MappAIEvidence.accendi()  ·  MappAIEvidence.spegni()
//   MappAIEvidence.indice()   ·  MappAIEvidence.pacchetto('neutralità')
//   MappAIEvidence.ultimeTracce()   — i rami serviti alla pipeline, con gli id
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.MappAIEvidence) return;   // trappola 22: un modulo caricato due volte tiene due stati

    var FILE = 'evidenze.json';          // un segmento solo = la radice del vault (files-core, sanitizeVaultRelPath)

    function _state() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _core() { return window.MappAIEvidenceCore; }
    function _acceso() {
        try { return localStorage.getItem('mappai_evidence') === '1'; } catch (e) { return false; }
    }
    function accendi() {
        try { localStorage.setItem('mappai_evidence', '1'); } catch (e) { /* senza localStorage resta spento */ }
        console.log('[Evidenze] acceso: alla prossima apertura di un progetto l\'indice si costruisce (evidenze.json nella radice del vault)');
    }
    function spegni() {
        try { localStorage.setItem('mappai_evidence', '0'); } catch (e) { /* idem */ }
        console.log('[Evidenze] spento: nessuna lettura né scrittura; un evidenze.json già scritto resta e non disturba');
    }

    /* Decodifica simmetrica a readManifest (mappai-review.js): base64 → testo. */
    function _testo(res) {
        if (res.text != null) return String(res.text);
        return new TextDecoder().decode(Uint8Array.from(atob(res.base64), function (c) { return c.charCodeAt(0); }));
    }
    /* → { presente, indice, motivo }. Assente e illeggibile sono due esiti,
       non due errori: il primo dà «costruito», il secondo «rifatto». */
    async function _leggi(vaultPath) {
        var api = window.electronAPI;
        if (!api || typeof api.readVaultFile !== 'function') return { presente: false, motivo: 'readVaultFile non disponibile' };
        var res = await api.readVaultFile({ vaultPath: vaultPath, relPath: FILE });
        if (!res || !res.ok) return { presente: false, motivo: (res && res.error) || 'lettura fallita' };
        try { return { presente: true, indice: JSON.parse(_testo(res)) }; }
        catch (e) { return { presente: true, indice: null, motivo: 'JSON illeggibile' }; }
    }
    /* Scrittura non atomica, accettata (piano, decisione 3): il file è
       ricostruibile. `potaVarianti: false` di proposito — il preload lo mette a
       true da sé, e in main.js quello cestina i gemelli orfani di
       `Materiale Studio/` dopo OGNI scrittura: l'indice non è un materiale e
       aprire un progetto non deve innescare una potatura. */
    async function _scrivi(vaultPath, indice) {
        var api = window.electronAPI;
        if (!api || typeof api.saveVaultFile !== 'function') return { ok: false, error: 'saveVaultFile non disponibile' };
        var res = await api.saveVaultFile({ vaultPath: vaultPath, relPath: FILE, text: JSON.stringify(indice, null, 2), potaVarianti: false });
        return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || 'scrittura fallita' };
    }
    function _conta(indice) {
        var f = indice.fonti.length, p = indice.records.length;
        return f + (f === 1 ? ' fonte, ' : ' fonti, ') + p + (p === 1 ? ' pagina' : ' pagine');
    }

    /* Chiamata da R.restore e NON attesa: il disegno della mappa non aspetta il
       disco. Non lancia mai — ogni ramo restituisce { stato } e lo dice in
       console, tranne «spento», che tace. Dopo ogni await si ricontrolla che il
       progetto sia ancora quello (invariante 20-bis): la memoria è del vault
       attivo, e un indice arrivato in ritardo non deve sostituirla. */
    async function suApertura(vaultPath, fontiEsplicite) {
        try {
            if (!_acceso()) return { stato: 'spento' };
            var st = _state();
            if (!st || st.activeVaultPath !== vaultPath) { console.log('[Evidenze] progetto cambiato: indice non costruito'); return { stato: 'progetto cambiato' }; }
            var C = _core(), R = window.MappAIReview;
            if (!C || !R || typeof R.sources !== 'function') { console.log('[Evidenze] core o revisione non caricati: indice non costruito'); return { stato: 'non disponibile' }; }
            var fonti = fontiEsplicite === undefined ? R.sources() : fontiEsplicite;
            if (!Array.isArray(fonti) || !fonti.length) { console.log('[Evidenze] senza fonti: niente da indicizzare'); return { stato: 'senza fonti' }; }

            var letto = await _leggi(vaultPath);
            if (st.activeVaultPath !== vaultPath) { console.log('[Evidenze] progetto cambiato durante la lettura: indice scartato'); return { stato: 'progetto cambiato' }; }
            var indice, stato, motivo = '';
            if (letto.presente && letto.indice && !C.indiceStantio(letto.indice, fonti)) {
                indice = letto.indice; stato = 'riletto';
            } else {
                indice = C.costruisciIndice(fonti);
                stato = letto.presente ? 'rifatto' : 'costruito';
                var esito = await _scrivi(vaultPath, indice);
                if (st.activeVaultPath !== vaultPath) { console.log('[Evidenze] progetto cambiato durante la scrittura: indice non tenuto in memoria'); return { stato: 'progetto cambiato' }; }
                if (!esito.ok) { stato = 'non scritto'; motivo = esito.error; }
            }
            st._evidenze = { vaultPath: vaultPath, indice: indice };
            console.log('[Evidenze] ' + stato + ': ' + _conta(indice) + (motivo ? ' (' + motivo + ')' : ''));
            return { stato: stato, motivo: motivo, fonti: indice.fonti.length, pagine: indice.records.length };
        } catch (e) {
            console.warn('[Evidenze] errore: ' + ((e && e.message) || e));
            return { stato: 'errore', motivo: (e && e.message) || String(e) };
        }
    }

    /* L'indice in memoria del vault attivo, o null. È ciò che il passo 3 leggerà. */
    function indice() {
        var st = _state();
        var e = st && st._evidenze;
        return e && e.indice && st.activeVaultPath === e.vaultPath ? e.indice : null;
    }
    /* Il pacchetto per una query: la prova dalla console oggi, la porta del
       passo 3 domani. Nessun voto esterno qui: `punteggi` arriva col reranker. */
    function pacchetto(query, opts) {
        if (!_acceso()) return null;
        var i = indice();
        if (!i) return null;
        var o = opts && typeof opts === 'object' ? opts : {};
        return _core().costruisciPacchetto({ records: i.records, query: query, tetto: o.tetto, punteggi: o.punteggi });
    }

    /* ── IL MATERIALE DI UN RAMO PER LA PIPELINE (passo 3) ─────────────────────
       Il tetto del pacchetto di un ramo: il doppio delle 8 frasi che
       `_passaggiDelRamo` chiedeva a BM25, e lo stesso budget in caratteri del
       taglio di `_branchMaterial` (12.000, mappai-material-pipeline.js:150) —
       UN budget solo (invariante 6). Da tarare al passo 6, con un numero. */
    var TETTO_RAMO = { unita: 16, caratteri: 12000 };
    var TRACCE_MAX = 50;

    function _pulisci(x) { return window.cleanLabel ? window.cleanLabel(x) : String(x || '').trim(); }

    /* La traccia in memoria per la misura del passo 6: una voce per ramo servito,
       le più vecchie escono oltre TRACCE_MAX. Niente disco. */
    function _traccia(voce) {
        var st = _state();
        if (!st) return;
        if (!Array.isArray(st._evidenzeTracce)) st._evidenzeTracce = [];
        st._evidenzeTracce.push(voce);
        while (st._evidenzeTracce.length > TRACCE_MAX) st._evidenzeTracce.shift();
    }
    function ultimeTracce() {
        var st = _state();
        return st && Array.isArray(st._evidenzeTracce) ? st._evidenzeTracce.slice() : [];
    }

    /* SINCRONA, come `_branchMaterial` che la chiama dentro un giro sincrono.
       `nodi` = il ramo, radice per prima, come `all` nella pipeline. Spento, o
       senza indice del vault attivo → null: la pipeline segue la strada vecchia.
       La query è la STESSA di `_passaggiDelRamo` (riga 196): le etichette pulite
       unite da uno spazio — una verità sola. Nessun `punteggi`: il reranker non
       c'è. Un ramo di cui la fonte non parla dà `materiale: ''` e la pipeline lo
       salta: è la fedeltà che si misura, non un guasto da coprire con le desc. */
    function materialeRamo(nodi, opts) {
        if (!_acceso()) return null;
        var i = indice();
        if (!i) return null;
        var o = opts && typeof opts === 'object' ? opts : {};
        var lista = (Array.isArray(nodi) ? nodi : []).filter(function (n) { return n && typeof n === 'object'; });
        var puliti = lista.map(function (n) { return { label: _pulisci(n.label), desc: n.desc || n.content || '' }; });
        var area = puliti.length ? puliti[0].label : '';
        var query = puliti.map(function (n) { return n.label; }).join(' ');
        var pacchetto = _core().costruisciPacchetto({ records: i.records, query: query, tetto: o.tetto || TETTO_RAMO });
        var r = _core().materialeRamo({ area: area, nodi: puliti, pacchetto: pacchetto, conDesc: !!o.conDesc });
        var ids = pacchetto.unita.map(function (u) { return u.id; });
        _traccia({ quando: new Date().toISOString(), area: area, query: query, ids: ids, scartate: r.scartate, caratteri: r.caratteri });
        return { materiale: r.materiale, unita: r.unita, scartate: r.scartate, caratteri: r.caratteri, query: query, ids: ids };
    }

    window.MappAIEvidence = { FILE: FILE, TETTO_RAMO: TETTO_RAMO, acceso: _acceso, accendi: accendi, spegni: spegni, suApertura: suApertura, indice: indice, pacchetto: pacchetto, materialeRamo: materialeRamo, ultimeTracce: ultimeTracce };
})();
