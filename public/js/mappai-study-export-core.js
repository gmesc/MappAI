/*
 * mappai-study-export-core.js — infrastruttura condivisa fra i due export di
 * studio "Sintesi di ramo" (mappai-branch-synthesis.js, motore AI) e "Stampa
 * dossier" (mappai-print-dossier.js, motore deterministico). (11/7/26)
 * -------------------------------------------------------------------------
 * I due moduli hanno funzione OPPOSTA (la Sintesi riscrive in prosa con l'AI,
 * il Dossier ripete le descrizioni verbatim) ma condividono l'IMPALCATURA:
 * raccolta dei nodi del ramo + apertura della finestra di stampa. Qui vive
 * quel poco che era davvero duplicato; CSS, struttura pagina e citazioni
 * restano nei rispettivi moduli perché sono due linguaggi visivi distinti.
 *
 * Caricato PRIMA dei due consumatori in index.html. Usa il binding globale
 * `appState` (classic script post-app.js, come i moduli fratelli) e il
 * canonico `window.getDescendants` (mappai-flashcards-sr.js).
 */
(function () {
    'use strict';

    function _t(k, f) { return window.t ? window.t(k, f) : f; }

    /**
     * Nodi di un ramo, con la stessa semantica usata storicamente da Sintesi e
     * Dossier: in MindMap = tutti i nodi del gruppo (root incluso); in KG =
     * root + discendenti (cross-link inclusi, ciclo-safe via getDescendants).
     * Ordinati per livello di default (L0→L…): il root resta sempre in testa
     * (ha il livello minimo del proprio sottoalbero).
     *
     * @param {string} rootId
     * @param {{sortByLevel?: boolean}} [opts]  sortByLevel:false preserva
     *        l'ordine di raccolta (usato da chi vuole l'ordine "grezzo").
     * @returns {Array} nodi (riferimenti a appState.db.nodes)
     */
    function collectBranchNodes(rootId, opts) {
        opts = opts || {};
        const db = (typeof appState !== 'undefined' ? appState : window.appState).db;
        const root = db.nodes.find(function (n) { return n.id === rootId; });
        if (!root) return [];

        const byLevel = function (a, b) { return (a.level || 0) - (b.level || 0); };

        // MindMap: il ramo È il gruppo (colore/macro-area). Root incluso.
        if ((typeof appState !== 'undefined' ? appState : window.appState).extractionMode === 'mindmap') {
            return db.nodes.filter(function (n) { return n.group === root.group; }).sort(byLevel);
        }

        // KG: root + discendenti (BFS ciclo-safe), deduplicati.
        const seen = new Set([root.id]);
        const list = [root];
        (window.getDescendants ? window.getDescendants(rootId) : []).forEach(function (n) {
            if (!seen.has(n.id)) { seen.add(n.id); list.push(n); }
        });
        return opts.sortByLevel === false ? list : list.sort(byLevel);
    }

    /**
     * Apre una finestra di stampa con l'HTML dato. Centralizza la gestione del
     * popup bloccato e (opzionale) la stampa automatica / il toast di successo.
     *
     * @param {string} fullHtml  documento HTML completo (<!DOCTYPE html>…)
     * @param {{blockedMsg?:string, blockedLevel?:string, successMsg?:string,
     *          autoPrint?:boolean, autoPrintDelay?:number}} [opts]
     * @returns {Window|null}  la finestra aperta, o null se popup bloccato.
     */
    function openPrintable(fullHtml, opts) {
        opts = opts || {};
        const win = window.open('', '_blank');
        if (!win) {
            window.showToast(
                opts.blockedMsg || _t('tst_popup_blocked', 'Popup bloccato — abilita i popup'),
                opts.blockedLevel || 'warning'
            );
            return null;
        }
        win.document.write(fullHtml);
        win.document.close();
        if (opts.autoPrint) {
            setTimeout(function () {
                try { win.focus(); win.print(); } catch (e) { /* utente ha già chiuso */ }
            }, opts.autoPrintDelay || 800);
        }
        if (opts.successMsg) window.showToast(opts.successMsg, 'success');
        return win;
    }

    window.MappAIStudyExport = { collectBranchNodes: collectBranchNodes, openPrintable: openPrintable };

    /* ── Archivio documenti di studio (Sintesi + Dossier) ─────────────────────
     * Un docente genera una volta e riapre/condivide senza rigenerare. Lo store
     * vive in localStorage: metadati + HTML stampabile completo, cap a DOCS_CAP voci.
     * 0077 (ADR 0018, punto 1 e scelta 3 (a)), interruttore `mappai_documenti_in_cartella`
     * ('1' = acceso): il testo di ogni documento va in un file della cartella della sua
     * mappa (`Documenti/`), e nel cassetto resta la voce snella. Le scelte stanno nel
     * core puro `mappai-documenti-core.js`; qui l'I/O. Senza quel core (il reader) o
     * con `electronAPI.__studente`, l'archivio fa quello che faceva prima.
     * B4 (vale anche spento): `_docsWrite` non scarta e non svuota mai l'archivio. */
    const DOCS_KEY = 'mappai_saved_documents';
    const DOCS_CAP = 30; // 005-landing-insegna: era 12; la landing Insegna ci vive sopra
    // Tipi di documento archiviabili (005): synthesis/dossier storici + fogli nodi/timeline
    // + 'causal' (Catena dei perché, deterministico — 19/7/26)
    // 'quizpaper' e 'flashsheet' = fogli cartacei generati dall'editor documenti di
    // ELABORA (quiz stampabile, foglio flashcard) → richiamabili da INSEGNA.
    const DOC_KINDS = ['synthesis', 'dossier', 'nodesheet', 'timeline', 'map', 'causal', 'quizpaper', 'flashsheet', 'analisi'];

    function _docsRead() {
        try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); }
        catch (e) { return []; }
    }
    /* B4 (0077). Nell'app del docente (vale anche a interruttore spento): se la
       lista non entra non si scarta nessun documento e non si scrive mai '[]' —
       prima la quota piena buttava via i più vecchi, e un documento solo troppo
       grande svuotava l'archivio intero.
       Nel reader («Via di mezzo», Giacomo 05/10): come prima si scartano i più
       vecchi (in coda) finché il nuovo entra — l'allievo non ha un modo di togliere
       documenti — ma mai '[]': se nemmeno uno entra, la lista di prima resta intatta.
       Torna quante voci ha scritto, o 0 se non ha toccato niente. */
    function _docsWrite(arr) {
        const list = arr.slice();
        try { localStorage.setItem(DOCS_KEY, JSON.stringify(list)); return list.length; }
        catch (e) { }
        if (_reader()) {
            while (list.length > 1) {
                list.pop();
                try { localStorage.setItem(DOCS_KEY, JSON.stringify(list)); return list.length; } catch (e) { }
            }
        }
        console.warn('[StudyDocs] memoria rapida piena: l\'elenco non entra, nessun documento è stato tolto');
        return 0;
    }
    /* il reader: senza il core dei documenti, o con l'adattatore dell'allievo */
    function _reader() {
        try { return !window.MappAIDocumentiCore || !!(window.electronAPI && window.electronAPI.__studente); }
        catch (e) { return true; }
    }
    function _activeClassName() {
        try {
            const c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
            return (c && c.name) || null;
        } catch (e) { return null; }
    }

    // Disciplina attiva coerente con la classe attiva ('' se ambigua o assente).
    function _activeDiscipline() {
        try {
            const CL = window.MappAIClasses;
            return (CL && CL.effectiveDiscipline) ? (CL.effectiveDiscipline() || '') : '';
        } catch (e) { return ''; }
    }

    // save({kind,title,mapName,cls?,disc?,html?,pdf?}) → id. Dedup per (kind|title|mapName):
    // rigenerare lo stesso ramo AGGIORNA la voce invece di duplicare.
    // pdf = data-URI (Foglio nodi = jsPDF, non HTML): riaperto con window.open.
    // Id univoco. `Date.now()` da solo NON basta: la pipeline «Genera materiali»
    // archivia quiz, flashcard, foglio nodi e sintesi in raffica, e due documenti
    // salvati nello stesso millisecondo finivano con lo STESSO id — get() e
    // remove() poi colpivano il documento sbagliato.
    let _docSeq = 0;
    function _newDocId(arr) {
        let id;
        do { _docSeq = (_docSeq + 1) % 100000; id = 'doc_' + Date.now() + '_' + _docSeq; }
        while (arr.some(d => d.id === id));
        return id;
    }
    /* ── 0077: i documenti nella cartella della mappa ────────────────────────── */
    const SWITCH_KEY = 'mappai_documenti_in_cartella';
    const MIGRA_RITARDO = 5000;       // a riposo dopo l'avvio
    const MIGRA_RIPROVA = 30000;      // se l'app è occupata, si riprova
    const MIGRA_TENTATIVI = 40;
    function _DC() { return window.MappAIDocumentiCore || null; }
    function _api() { return window.electronAPI || null; }
    function _acceso() { try { return localStorage.getItem(SWITCH_KEY) === '1'; } catch (e) { return false; } }
    /* Leggere i file: l'app del docente col core. Mai il reader (`__studente`):
       l'assenza di `electronAPI` non basta, il reader ne ha uno suo. */
    function _lettore() {
        const a = _api();
        return !!(_DC() && a && !a.__studente && typeof a.readVaultFile === 'function' && typeof a.getAllVaults === 'function');
    }
    /* Scrivere (e migrare, e mandare nel Cestino): in più, l'interruttore acceso. */
    function _scrittore() {
        const a = _api();
        return _lettore() && _acceso() && typeof a.saveVaultFile === 'function';
    }
    function _registro(msg) {
        try { console.warn('[StudyDocs] ' + msg); } catch (e) { }
        try { if (window.MappAIErrori && window.MappAIErrori.registra) window.MappAIErrori.registra({ dove: 'documenti', messaggio: msg }); } catch (e) { }
    }
    function _avviso(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg, 'error'); } catch (e) { } }
    /* 0082 (B3 (a); ADR 0018 rev. 1, C3): il taglio oltre il tetto, per i due posti
       che mettono una voce in testa all'elenco. Oggi esce la voce più vecchia anche
       quando porta il testo (l'unica copia del documento, senza file nella
       cartella). Con `mappai_cassetto_solo_indice` acceso (lettore unico in
       `MappAIVistaCore`, inv. 6) e col core, decide `oltreIlTetto`: escono prima le
       voci snelle (il loro file è nella cartella), una col testo mai. La voce in
       testa è quella che si sta salvando: resta fuori dal conto, come col taglio di
       oggi (che non la toglie mai). Se l'elenco passa il tetto lo dice un avviso,
       una volta nella sessione: si ripeterebbe a ogni salvataggio. Spento, o senza
       uno dei due core (il reader non ha `mappai-documenti-core.js`): il taglio di
       oggi. Toglie da `arr` (sul posto, come `splice`) e restituisce chi è uscito. */
    let _oltreDetto = false;
    function _taglia(arr) {
        const VC = window.MappAIVistaCore, DC = _DC();
        let solo = false;
        try { solo = !!(VC && VC.cassettoSoloIndice && VC.cassettoSoloIndice()); } catch (e) { solo = false; }
        if (!solo || !DC || typeof DC.oltreIlTetto !== 'function') return arr.length > DOCS_CAP ? arr.splice(DOCS_CAP) : [];
        if (arr.length <= DOCS_CAP) return [];
        const r = DC.oltreIlTetto(arr.slice(1), DOCS_CAP - 1);
        arr.splice.apply(arr, [1, arr.length - 1].concat(r.voci));
        if (r.oltre && !_oltreDetto) {
            _oltreDetto = true;
            _registro('L\'elenco dei documenti ha ' + arr.length + ' voci, oltre il tetto di ' + DOCS_CAP +
                ': le voci col testo non escono finché il loro file non è nella cartella della mappa.');
            try {
                if (typeof window.showToast === 'function') window.showToast(_t('sdoc_oltre_tetto',
                    'L\'elenco dei documenti ha più di {n} voci: i documenti che stanno solo nella memoria rapida dell\'app restano nell\'elenco finché non sono nella cartella della mappa.')
                    .replace('{n}', DOCS_CAP), 'warning');
            } catch (e) { }
        }
        return r.via;
    }
    function _progettoAttuale() {
        try { return (typeof StorageManager !== 'undefined' && StorageManager) ? StorageManager.currentProjectId : null; }
        catch (e) { return null; }
    }
    function _occupata() {
        try { if (window.MappAIGen && window.MappAIGen.attiva && window.MappAIGen.attiva()) return true; } catch (e) { }
        try { if (window.MappAIPipeline && window.MappAIPipeline.occupata && window.MappAIPipeline.occupata()) return true; } catch (e) { }
        return false;
    }
    function _chiave(d) { return d.kind + '|' + d.title + '|' + d.mapName; }
    function _utf8(b64) {
        const bin = atob(b64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(u);
    }

    /* Lo specchio in memoria (B2 (a)): il testo dei documenti che stanno nella
       cartella, letto all'avvio un file alla volta. `get` resta sincrono. */
    const _specchio = new Map();      // id → voce intera
    /* salvati «non entra»: il file si sta scrivendo. id → { ver, prima }, dove
       `prima` è la versione di prima che sta già in un file (per non perderla in
       `get` se la scrittura della nuova fallisce) */
    const _inAttesa = new Map();
    /* la versione di ogni documento: cresce a ogni save e remove, così una
       scrittura partita prima non rimette nello specchio una versione vecchia */
    const _ver = new Map();
    function _nuovaVersione(id) { const n = (_ver.get(id) || 0) + 1; _ver.set(id, n); return n; }
    let _elenco = null, _elencoFresco = false;
    let _codaP = Promise.resolve();
    /* un'operazione sul disco alla volta */
    function _accoda(fn) {
        const p = _codaP.then(function () { return fn(); }).catch(function (e) {
            _registro('Documenti: operazione sul disco interrotta (' + ((e && e.message) || e) + ').');
            return null;
        });
        _codaP = p;
        return p;
    }
    /* P1: l'elenco delle cartelle, uno per sessione, rifatto quando un id non si trova */
    async function _cartelle(rifai) {
        if (_elenco && !rifai) return _elenco;
        let l = null;
        try { l = await _api().getAllVaults(); } catch (e) { l = null; }
        _elenco = Array.isArray(l) ? l : [];
        _elencoFresco = true;
        return _elenco;
    }
    async function _cartellaPer(id) {
        const DC = _DC();
        let r = DC.cartellaPerId(id, await _cartelle(false));
        if (r.esito === 'nessuna' && !_elencoFresco) r = DC.cartellaPerId(id, await _cartelle(true));
        return r;
    }
    /* La cartella dichiara ANCORA quell'id? Si legge il suo index.yaml (colonna 0,
       come main.js:3295-3297): l'elenco può essere vecchio di un riordino. */
    async function _confermaId(vaultPath, id) {
        let r = null;
        try { r = await _api().readVaultFile({ vaultPath: vaultPath, relPath: 'index.yaml' }); } catch (e) { r = null; }
        if (!r || !r.ok || typeof r.base64 !== 'string') return false;
        let testo;
        try { testo = _utf8(r.base64); } catch (e) { return false; }
        return _DC().idDaIndice(testo) === id;
    }
    /* La cartella di un id, confermata dal suo index.yaml. Se non torna (o non si
       legge), l'elenco si rifà UNA volta e si riprova; poi niente. */
    async function _cartellaSicura(id, rifai) {
        const DC = _DC();
        let r = rifai ? DC.cartellaPerId(id, await _cartelle(true)) : await _cartellaPer(id);
        if (r.esito !== 'una') return r;
        if (await _confermaId(r.vault.fullPath, id)) return r;
        if (!rifai) {
            r = DC.cartellaPerId(id, await _cartelle(true));
            if (r.esito !== 'una') return r;
            if (await _confermaId(r.vault.fullPath, id)) return r;
        }
        return { esito: 'non confermata da index.yaml', n: 1 };
    }
    /* Scrive il file, lo rilegge, lo confronta. Ogni scrittura con potaVarianti:
       false — con true il main manda nel Cestino gli HTML di `Sorgenti/`.
       `toccato`: il file sul disco è stato scritto (la versione di prima non c'è più). */
    async function _scriviFile(piena, vaultPath) {
        const DC = _DC(), a = _api();
        const rel = DC.nomeFile(piena);
        if (!rel) return { ok: false, motivo: 'nome del file' };
        const dati = { vaultPath: vaultPath, relPath: rel, potaVarianti: false };
        if (DC.tipo(piena) === 'pdf') dati.base64 = piena.pdf; else dati.text = piena.html;
        let w = null;
        try { w = await a.saveVaultFile(dati); } catch (e) { w = { ok: false, error: e && e.message }; }
        if (!w || !w.ok) return { ok: false, motivo: 'scrittura (' + ((w && w.error) || '?') + ')', inesistente: !!(w && w.error === 'vault inesistente') };
        let r = null;
        try { r = await a.readVaultFile({ vaultPath: vaultPath, relPath: rel }); } catch (e) { r = { ok: false, error: e && e.message }; }
        if (!r || !r.ok) return { ok: false, toccato: true, motivo: 'rilettura (' + ((r && r.error) || '?') + ')' };
        if (!DC.rilettaUguale(piena, r.base64, _utf8)) return { ok: false, toccato: true, motivo: 'il file riletto non è identico' };
        return { ok: true, rel: rel };
    }
    /* Il file nella cartella confermata di quell'id. Se la scrittura risponde
       «vault inesistente» (la cartella si è spostata nel frattempo), l'elenco si
       rifà e si riprova una volta. */
    async function _scriviPerId(piena, id) {
        let r = await _cartellaSicura(id, false);
        if (r.esito !== 'una') return { ok: false, motivo: 'cartella ' + r.esito };
        let w = await _scriviFile(piena, r.vault.fullPath);
        if (!w.ok && w.inesistente) {
            r = await _cartellaSicura(id, true);
            if (r.esito !== 'una') return { ok: false, motivo: 'cartella ' + r.esito };
            w = await _scriviFile(piena, r.vault.fullPath);
        }
        return w;
    }
    /* Una voce col testo nel cassetto → il file, e SOLO dopo la rilettura uguale
       la voce snella. `perNome`: le voci vecchie, senza progetto (migrazione). */
    async function _porta(id, perNome) {
        const DC = _DC();
        const ver = _ver.get(id) || 0;
        const v = _docsRead().find(function (d) { return d.id === id; });
        if (!v || !(v.html || v.pdf)) return { esito: 'gia' };
        let prog = DC.progetto(v.progetto);
        if (v.progetto && !prog) return { esito: 'resta', motivo: 'id non valido' };
        if (!prog) {
            if (!perNome) return { esito: 'resta', motivo: 'senza progetto' };
            /* una sola ricerca per nome; poi la cartella si cerca per l'id che porta,
               che deve essere di UNA cartella sola (`_scriviPerId`) */
            const n = DC.cartellaPerNome(v.mapName, await _cartelle(false), window.cleanLabel);
            if (n.esito !== 'una') return { esito: 'resta', motivo: 'cartella ' + n.esito };
            prog = n.progetto;
        }
        const w = await _scriviPerId(v, prog);
        if (!w.ok) return { esito: 'resta', motivo: w.motivo };
        const ora = _docsRead();
        const i = ora.findIndex(function (d) { return d.id === id; });
        if (i < 0) return { esito: 'resta', motivo: 'tolta nel frattempo' };
        const cur = ora[i];
        if (cur.html !== v.html || cur.pdf !== v.pdf || cur.date !== v.date) return { esito: 'resta', motivo: 'cambiata nel frattempo' };
        const snella = DC.voceSnella(Object.assign({}, cur, { progetto: prog }), w.rel);
        ora[i] = snella;
        if (_docsWrite(ora) <= 0) return { esito: 'resta', motivo: 'memoria rapida' };
        /* solo se nel frattempo nessun save più recente ha preso il suo posto */
        if ((_ver.get(id) || 0) === ver && !_inAttesa.has(id)) {
            _specchio.set(id, DC.pienaDaFile(snella, DC.tipo(cur) === 'pdf' ? DC.corpoPdf(cur.pdf) : cur.html));
        }
        return { esito: 'spostata' };
    }
    /* Un file nello specchio (all'avvio, e per rimettere la versione di prima). */
    async function _leggiNelloSpecchio(v) {
        const DC = _DC(), a = _api();
        if (!DC.relValido(v.rel)) return 'percorso';
        const r = await _cartellaPer(v.progetto);
        if (r.esito !== 'una') return 'cartella ' + r.esito;
        let res = null;
        try { res = await a.readVaultFile({ vaultPath: r.vault.fullPath, relPath: v.rel }); } catch (e) { res = null; }
        if (!res || !res.ok || typeof res.base64 !== 'string') return (res && res.error) || 'non letto';
        let contenuto;
        try { contenuto = (v.hasPdf && !v.hasHtml) ? res.base64 : _utf8(res.base64); } catch (e) { return 'decodifica'; }
        if (!_specchio.has(v.id)) _specchio.set(v.id, DC.pienaDaFile(v, contenuto));
        return '';
    }
    /* «Non entra» (4.2 punto 4; «Numero subito, rischio dichiarato», Giacomo 05/10):
       il testo non sta nel cassetto. Prima il file; se è riletto uguale entra la voce
       snella; se no il documento esce dallo specchio, e un avviso lo dice. */
    async function _primaIlFile(entry, ver) {
        const DC = _DC();
        const id = entry.id;
        const attuale = function () { const a = _inAttesa.get(id); return !!a && a.ver === ver; };
        const fallito = function (motivo, toccato, soloCartella) {
            if (!attuale()) return;
            const prima = _inAttesa.get(id).prima;
            _inAttesa.delete(id);
            _specchio.delete(id);
            const vecchia = _docsRead().find(function (d) { return d.id === id && d.rel && !d.html && !d.pdf; });
            _registro('Documento non salvato («' + entry.title + '»): memoria rapida piena e ' + motivo + '. Gli altri documenti restano.');
            if (vecchia && !toccato) {
                /* la versione di prima sta intatta nel suo file: get continua a darla */
                if (prima) _specchio.set(id, prima);
                else _accoda(function () { return _leggiNelloSpecchio(vecchia); });
                _avviso(_t('sdoc_modifiche_non_salvate', 'Le modifiche al documento «{t}» non sono state salvate: la memoria rapida dell\'app è piena e non è stato possibile scriverle nella cartella della mappa. Resta la versione di prima.').replace('{t}', entry.title));
                return;
            }
            _avviso(soloCartella
                ? _t('sdoc_solo_cartella', 'Il documento «{t}» è nella cartella della mappa (Documenti), ma l\'elenco dei documenti è pieno: da qui non si riapre.').replace('{t}', entry.title)
                : _t('sdoc_non_salvato_cartella', 'Il documento «{t}» non è stato salvato: la memoria rapida dell\'app è piena e non è stato possibile scriverlo nella cartella della mappa. Gli altri documenti sono al sicuro.').replace('{t}', entry.title));
        };
        if (!attuale()) return;
        const w = await _scriviPerId(entry, entry.progetto);
        if (!w.ok) return fallito(w.motivo, !!w.toccato);
        if (!attuale()) {
            /* un save più recente ha preso il suo posto (e scriverà lui), oppure il documento è stato tolto */
            const vivo = _inAttesa.has(id) || _docsRead().some(function (d) { return d.id === id; });
            if (!vivo) _registro('Documento tolto mentre si scriveva: il suo file resta nella cartella (' + w.rel + ').');
            return;
        }
        const arr = _docsRead();
        const k = _chiave(entry);
        const j = arr.findIndex(function (d) { return d.id === id || _chiave(d) === k; });
        const vecchia = j >= 0 ? arr[j] : null;
        if (j >= 0) arr.splice(j, 1);
        arr.unshift(DC.voceSnella(entry, w.rel));
        const via = _taglia(arr);   // 0082: spento, il taglio di oggi
        if (_docsWrite(arr) <= 0) {
            if (vecchia && vecchia.id === id && vecchia.rel === w.rel && !vecchia.html && !vecchia.pdf) {
                /* la voce snella di prima punta già a questo file, che ora porta la versione nuova */
                _inAttesa.delete(id);
                _registro('Documento «' + entry.title + '» scritto nella cartella; l\'elenco non si è aggiornato (memoria rapida piena).');
                return;
            }
            return fallito('l\'elenco non entra', true, true);
        }
        _inAttesa.delete(id);
        _specchio.set(id, entry);
        via.forEach(function (d) { _specchio.delete(d.id); });
    }
    /* All'avvio: i file delle voci snelle, uno alla volta, nello specchio. */
    async function _caricaSpecchio() {
        if (!_lettore()) return;
        const voci = _docsRead().filter(function (d) { return d && d.rel && !d.html && !d.pdf; });
        const mancano = [];
        for (const v of voci) {
            const errore = await _leggiNelloSpecchio(v);
            if (errore) mancano.push(v.title + ' (' + errore + ')');
        }
        if (mancano.length) _registro('Documenti: ' + mancano.length + ' non letti dalla cartella e non riapribili per ora: ' + mancano.join('; ') + '.');
    }
    /* La migrazione (4.4): «prima copia, poi togli», a riposo, una voce alla volta. */
    function _migra() {
        if (!_scrittore()) return Promise.resolve({ saltata: true, spostate: 0, rimaste: [] });
        if (_occupata()) return Promise.resolve({ rinviata: true, spostate: 0, rimaste: [] });
        return _accoda(async function () {
            const DC = _DC();
            const piano = DC.pianoMigrazione(_docsRead());
            const rimaste = piano.restano.slice();
            let spostate = 0, rinviata = false;
            for (let i = 0; i < piano.daSpostare.length; i++) {
                const id = piano.daSpostare[i];
                if (_occupata()) {
                    rinviata = true;
                    piano.daSpostare.slice(i).forEach(function (x) { rimaste.push({ id: x, motivo: 'app occupata' }); });
                    break;
                }
                const r = await _porta(id, true);
                if (r.esito === 'spostata') spostate++;
                else if (r.esito === 'resta') rimaste.push({ id: id, motivo: r.motivo });
            }
            if (spostate || rimaste.length) {
                const conti = {};
                rimaste.forEach(function (x) { conti[x.motivo] = (conti[x.motivo] || 0) + 1; });
                const perche = Object.keys(conti).map(function (m) { return conti[m] + ' per ' + m; }).join(', ');
                _registro('Documenti nella cartella della mappa: ' + spostate + ' spostati, ' + rimaste.length +
                    ' rimasti nella memoria rapida' + (perche ? ' (' + perche + ')' : '') + '.');
            }
            return { spostate: spostate, rimaste: rimaste, rinviata: rinviata };
        });
    }
    function _programma(n) {
        if (!_scrittore()) return;
        if (!_docsRead().some(function (d) { return d && (d.html || d.pdf); })) return;
        setTimeout(function () {
            _migra().then(function (r) { if (r && r.rinviata && n + 1 < MIGRA_TENTATIVI) _programma(n + 1); });
        }, n ? MIGRA_RIPROVA : MIGRA_RITARDO);
    }
    let _prontoFatto;
    const _pronto = new Promise(function (r) { _prontoFatto = r; });
    function _parti() {
        _accoda(_caricaSpecchio).then(function () { _prontoFatto(); _programma(0); });
    }
    /* il core e files-core caricano dopo questo file: si parte a pagina letta */
    if (typeof document !== 'undefined' && document && document.readyState === 'loading' && document.addEventListener) {
        document.addEventListener('DOMContentLoaded', _parti, { once: true });
    } else {
        _parti();
    }

    function saveDoc(rec) {
        const arr = _docsRead();
        const DC = _DC();
        _elencoFresco = false;      // una mappa nuova può avere una cartella che l'elenco non ha ancora
        const entry = {
            id: rec.id || _newDocId(arr),
            kind: DOC_KINDS.indexOf(rec.kind) >= 0 ? rec.kind : 'dossier',
            title: rec.title || 'Documento',
            mapName: rec.mapName || '',
            cls: rec.cls !== undefined ? rec.cls : _activeClassName(),
            // Disciplina della mappa che ha generato il documento (29/7) → colonna
            // DISCIPLINA in ELABORA/INSEGNA senza risalire al progetto a ogni render.
            disc: rec.disc !== undefined ? rec.disc : _activeDiscipline(),
            date: Date.now(),
            html: rec.html || '',
            // n. di carte oltre la soglia di caratteri: INSEGNA ci mette il badge
            // «da rivedere» sulla riga del foglio flashcard.
            overLimit: parseInt(rec.overLimit, 10) || 0,
            pdf: rec.pdf || ''
        };
        const key = _chiave(entry);
        const idx = arr.findIndex(d => _chiave(d) === key);
        let esistente = idx >= 0 ? arr[idx] : arr.find(d => d.id === entry.id);
        if (idx >= 0) { entry.id = arr[idx].id; arr.splice(idx, 1); }
        else {
            /* un «non entra» della stessa chiave il cui file si sta ancora scrivendo:
               non è nel cassetto, ma è lo stesso documento (stesso id) */
            _inAttesa.forEach(function (_a, pid) {
                const e = _specchio.get(pid);
                if (!esistente && e && _chiave(e) === key) { entry.id = pid; esistente = e; }
            });
        }
        /* P1 (0077): il documento ricorda il progetto a cui appartiene, per id.
           Solo nell'app del docente col core, e solo un id nella forma che l'app conia.
           Una voce che esiste già (stessa chiave o stesso id) TIENE il suo progetto:
           risalvarla con un'altra mappa aperta non la sposta. Solo una voce nuova
           prende il progetto aperto. */
        let prog = '';
        if (DC && _lettore()) prog = esistente ? DC.progetto(esistente.progetto) : DC.progetto(_progettoAttuale());
        if (prog) entry.progetto = prog;
        const ver = _nuovaVersione(entry.id);
        arr.unshift(entry);
        /* oltre il tetto la voce più vecchia esce dall'elenco; il suo file, se
           c'è, resta nella cartella (niente si cancella). 0082: con il cassetto
           solo indice acceso esce prima una voce snella, mai una col testo */
        const via = _taglia(arr);
        /* `_docsWrite` torna 0 quando la lista non entra, e allora non ha toccato
           niente (B4). Dirlo con `null` permette al chiamante di non promettere un
           archivio che non c'è. */
        if (_docsWrite(arr) > 0) {
            via.forEach(function (d) { _specchio.delete(d.id); _inAttesa.delete(d.id); });
            _specchio.delete(entry.id); _inAttesa.delete(entry.id);   // il testo ora è nel cassetto
            if (prog && _scrittore()) {
                const id = entry.id;
                _accoda(function () {
                    return _porta(id, false).then(function (r) {
                        if (r && r.esito === 'resta') _registro('Documento «' + entry.title + '» rimasto nella memoria rapida: ' + r.motivo + '.');
                    });
                });
            }
            return entry.id;
        }
        /* il testo non entra: prima il file, se c'è dove scriverlo (4.2 punto 4).
           L'id torna SUBITO («Numero subito, rischio dichiarato», Giacomo 05/10): il
           documento sta nello specchio finché il file non è scritto e riletto. */
        if (DC && DC.esitoNonEntra({ acceso: _acceso(), scrittore: _scrittore(), progetto: prog, tipo: DC.tipo(entry) }) === 'file-prima') {
            /* la versione di prima che sta già in un file, se c'è */
            const prima = _inAttesa.has(entry.id) ? _inAttesa.get(entry.id).prima : _specchio.get(entry.id);
            _inAttesa.set(entry.id, { ver: ver, prima: prima });
            _specchio.set(entry.id, entry);
            _accoda(function () { return _primaIlFile(entry, ver); });
            return entry.id;
        }
        _registro('Documento non salvato («' + entry.title + '»): la memoria rapida è piena. Nessun altro documento è stato tolto.');
        /* un avviso solo a interruttore acceso: spento basta il registro, e i
           chiamanti che controllano il `null` hanno già il loro messaggio */
        if (_scrittore()) _avviso(_t('sdoc_non_salvato', 'Il documento «{t}» non è stato salvato: la memoria rapida dell\'app è piena. Gli altri documenti sono al sicuro.').replace('{t}', entry.title));
        return null;
    }
    // list() → SOLO metadati (niente html: array leggero per il rendering).
    // `hasHtml`/`hasPdf` dicono COSA c'è dentro senza portarselo appresso: chi
    // deve mostrare solo i documenti riapribili filtra su questi. (Filtrare su
    // `d.html`, che qui non c'è mai, svuotava silenziosamente gli elenchi.)
    // 0077: una voce snella porta `hasHtml`/`hasPdf` da sé (il testo è nel file).
    function listDocs() {
        return _docsRead().map(d => ({
            id: d.id, kind: d.kind, title: d.title, mapName: d.mapName, cls: d.cls, disc: d.disc || '',
            date: d.date, overLimit: d.overLimit || 0,
            hasHtml: !!(d.html || d.hasHtml), hasPdf: !!(d.pdf || d.hasPdf)
        }));
    }
    /* get: la voce col testo, come prima. Una voce snella (0077) si restituisce
       intera dallo specchio, e `null` finché il suo file non è letto o se non si
       trova (i chiamanti dicono già «Documento non disponibile»). */
    function getDoc(id) {
        /* un salvataggio «non entra» in corso: la versione nuova è nello specchio */
        if (_inAttesa.has(id) && _specchio.has(id)) return Object.assign({}, _specchio.get(id));
        const v = _docsRead().find(d => d.id === id);
        if (!v) return null;
        if (v.html || v.pdf || !v.rel) return v;
        return _specchio.has(id) ? Object.assign({}, _specchio.get(id)) : null;
    }
    /* remove: la voce esce dall'elenco; il suo file va nel Cestino (inv. 13).
       Fuori da Mappe (`delete-vault-file` lo rifiuta) il file resta, e il registro lo dice. */
    async function _cestina(v) {
        const a = _api(), DC = _DC();
        if (!_scrittore() || typeof a.deleteVaultFile !== 'function' || !DC.relValido(v.rel)) {
            _registro('Documento tolto dall\'elenco: il suo file resta nella cartella (' + v.rel + ').');
            return;
        }
        /* la cartella confermata dal suo index.yaml: mai il Cestino di un omonimo */
        const r = await _cartellaSicura(v.progetto, false);
        if (r.esito !== 'una') { _registro('Documento tolto dall\'elenco: cartella ' + r.esito + ', il suo file resta (' + v.rel + ').'); return; }
        let res = null;
        try { res = await a.deleteVaultFile({ vaultPath: r.vault.fullPath, relPath: v.rel }); } catch (e) { res = { ok: false, error: e && e.message }; }
        if (!res || !res.ok) _registro('Documento tolto dall\'elenco: il suo file resta nella cartella (' + v.rel + ', ' + ((res && res.error) || '?') + ').');
    }
    function removeDoc(id) {
        const arr = _docsRead();
        const v = arr.find(d => d.id === id);
        _docsWrite(arr.filter(d => d.id !== id));
        _nuovaVersione(id);
        _specchio.delete(id); _inAttesa.delete(id);
        if (v && v.rel && !v.html && !v.pdf && _lettore()) _accoda(function () { return _cestina(v); });
    }

    /* `pronto()`: per chi vuole aspettare che lo specchio sia caricato.
       `_migra` e `_coda` servono alle prove e alla console. */
    window.MappAIStudyDocs = {
        save: saveDoc, list: listDocs, get: getDoc, remove: removeDoc,
        pronto: function () { return _pronto; },
        _migra: _migra,
        _coda: function () { return _codaP; }
    };

    console.log('[MappAI] mappai-study-export-core.js caricato ✓');
})();
