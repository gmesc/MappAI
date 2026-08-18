// ══════════════════════════════════════════════════════════════════════════
// MappAI — EDITOR DOCUMENTI (modalità «Documenti» del tab ELABORA)
// ══════════════════════════════════════════════════════════════════════════
//
// ELABORA lavora sulla FONTE (modalità «Fonte»). Qui lavora sugli OUTPUT già
// generati: quiz (V/F, scelta multipla, domande proprie), flashcard e sintesi.
//
// Principio: si edita la SORGENTE (gli item del set di studio, i blocchi della
// sintesi) e la resa resta quella dei builder di stampa esistenti — l'editor
// mostra il FOGLIO, non una sua imitazione: stesse misure, stessi colori,
// stessa gerarchia tipografica di buildQuizSetHtml / _buildSynthesisPrintHtml.
// Così quello che il docente vede a schermo è quello che esce dalla stampante.
//
// Dipendenze: mappai-docedit-core.js (modello puro, undo, sanitizzazione),
// mappai-quiz-print.js (builder foglio), mappai-branch-synthesis.js (sintesi),
// mappai-print-dossier.js (foglio flashcard PDF), mappai-study-export-core.js
// (archivio documenti). Caricato DOPO mappai-elabora.js.
//
// Font: le DIMENSIONI non sono modificabili — dipendono dal tipo di campo
// (titolo / testo / note), come nel foglio stampato. Il docente può cambiare
// solo corsivo, grassetto, sottolineato e colore.
(function () {
    'use strict';

    function _appState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function t(k, f) { return window.t ? window.t(k, f) : f; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function DE() { return window.MappAIDocEdit; }
    function toast(msg, kind) { if (window.showToast) window.showToast(msg, kind || 'info'); }

    // ── stato di modulo ─────────────────────────────────────────────────────
    let _view = 'list';        // 'list' | 'doc'
    let _kind = null;          // 'quiz' | 'flashcards' | 'synthesis' | 'nodesheet' | 'causal'
    let _doc = null;           // documento editabile corrente (quiz/flashcard)
    let _srcSet = null;        // set di studio di provenienza (per il round-trip)
    let _syn = null;           // { data, blocks:[{tag,html}], base:[…], archiveId }
    let _sheet = null;         // foglio nodi: { fmt, bg, depth, cards:[…], excluded:[…] }
    let _cc = null;            // catena dei perché: { sections:[{kind,label,rows:[…]}] }
    let _nsMenu = -1;          // card con il menu «+ contenuto» aperto (-1 = nessuno)
    // Sintesi: quale menu dei tipi è aperto. i = «cambia il tipo del blocco i»;
    // -100 - i = «aggiungi un blocco sotto il blocco i». -1 = nessuno.
    let _bMenu = -1;
    let _hist = null;          // cronologia annulla (core)
    let _dirty = false;
    const _flashFmt = '2x2v';   // unico formato del foglio flashcard
    let _flashBack = false;
    let _stylesInjected = false;
    let _mapKey = null;        // mappa da cui viene il documento aperto (vedi _currentMapKey)

    // Identità della mappa aperta: id di progetto + titolo. Serve a impedire che un
    // documento aperto su una mappa venga salvato dentro un'altra (in ELABORA si
    // cambia progetto senza uscire dal tab).
    function _currentMapKey() {
        const s = _appState();
        let pid = null;
        try { if (typeof StorageManager !== 'undefined') pid = StorageManager.currentProjectId || null; } catch (e) { }
        return (pid || '') + '|' + ((s && s.rootNodeLabel) || '');
    }
    function _sameMap() { return _mapKey === null || _mapKey === _currentMapKey(); }

    // ── DIMENSIONE DELL'ANTEPRIMA ───────────────────────────────────────────
    // Quanto è grande il foglio a schermo, deciso dal docente e ricordato PER
    // TIPO di documento: il foglio dei nodi si guarda da lontano (tante card
    // insieme), la sintesi da vicino (si legge). Un solo valore per tutti
    // avrebbe costretto a rimetterlo a mano a ogni cambio di documento.
    const ZOOM_KEY = 'mappai_doc_zoom_';
    function _zoom() {
        try {
            const raw = localStorage.getItem(ZOOM_KEY + (_kind || 'doc'));
            if (raw != null) return DE().nearestZoom(raw);
        } catch (e) { /* default */ }
        return 1;
    }
    function _saveZoom(v) { try { localStorage.setItem(ZOOM_KEY + (_kind || 'doc'), String(v)); } catch (e) { } }

    /** − / + sulla dimensione dell'anteprima. Non tocca il documento: niente undo, niente «da salvare». */
    function zoomStep(dir) {
        const next = DE().stepZoom(_zoom(), dir);
        _saveZoom(next);
        _paintZoom();
    }
    function zoomReset() { _saveZoom(1); _paintZoom(); }

    /** Il carattere di QUESTO documento. '' = torna a quello della Cabina.
     *  ⚠️ A differenza dello zoom, questo È una modifica del documento: si
     *  segna «da salvare» e finisce nella sorgente, perché è ciò che uscirà
     *  dalla stampante anche fra un mese. */
    /* Il carattere del documento APERTO, qualunque sia il suo genere.
       ⚠️ Ogni genere tiene il suo stato in una variabile diversa (`_doc` per
       quiz e domande aperte, `_syn` per la sintesi, `_sheet` per il foglio dei
       nodi, `_cc` per la catena): leggendo solo `_doc` — come faceva la prima
       stesura — il selettore si disegnava anche sulla SINTESI e non faceva
       niente. Un comando inerte è peggio di un comando assente. */
    function _fontCorrente() {
        if (_kind === 'synthesis') return (_syn && _syn.data && _syn.data.font) || '';
        if (_kind === 'nodesheet') return (_sheet && _sheet.font) || '';
        if (_kind === 'causal') return (_cc && _cc.font) || '';
        return (_doc && _doc.font) || '';
    }
    function _scriviFontCorrente(val) {
        if (_kind === 'synthesis') { if (!_syn || !_syn.data) return false; _syn.data.font = val; return true; }
        if (_kind === 'nodesheet') { if (!_sheet) return false; _sheet.font = val; return true; }
        if (_kind === 'causal') { if (!_cc) return false; _cc.font = val; return true; }
        if (!_doc) return false;
        _doc.font = val; return true;
    }

    /** Accende o spegne una sezione generata della sintesi (catena · Note).
     *  È una modifica del DOCUMENTO — si segna «da salvare» e finisce nella
     *  sorgente — non un'opzione di stampa che vale per una volta sola. */
    function mostraSezione(campo, on) {
        if (_kind !== 'synthesis' || !_syn || !_syn.data) return;
        if (campo !== 'mostraCausale' && campo !== 'mostraNote') return;
        const val = !!on;
        if ((_syn.data[campo] !== false) === val) return;
        _syn.data[campo] = val;
        _dirty = true;
        render();
    }

    function setFont(id) {
        const C = window.MappAIFontCore;
        const val = (C && C.valido(id)) ? id : '';
        if (_fontCorrente() === val) return;
        if (!_scriviFontCorrente(val)) return;
        _dirty = true;
        render();
    }


    /** Applica la dimensione senza ridisegnare (un re-render sposterebbe il cursore). */
    function _paintZoom() {
        const host = _host(); if (!host) return;
        const z = _zoom();
        host.querySelectorAll('.de-sheet').forEach(function (el) { el.style.setProperty('--de-user', z); });
        const lbl = host.querySelector('#de-zoom-lbl');
        if (lbl) lbl.textContent = Math.round(z * 100) + '%';
        const box = host.querySelector('.de-zoom');
        if (box) box.classList.toggle('changed', z !== 1);
    }

    const COLOR_KEY = 'mappai_doc_colors';
    function _slots() {
        try {
            const raw = JSON.parse(localStorage.getItem(COLOR_KEY) || 'null');
            if (Array.isArray(raw) && raw.length) return raw.slice(0, DE().COLOR_SLOTS);
        } catch (e) { /* default */ }
        return DE().DEFAULT_SLOTS.slice();
    }
    function _saveSlots(arr) { try { localStorage.setItem(COLOR_KEY, JSON.stringify(arr)); } catch (e) { } }

    function _host() { return document.getElementById('elab-doc-host'); }

    // ── elenco documenti disponibili ────────────────────────────────────────
    function _sets() {
        const s = _appState();
        return ((s && s.db && s.db.studySets) || []).filter(x => x && Array.isArray(x.items) && x.items.length);
    }
    function _synthesisEntries() {
        const out = [];
        try {
            const cur = window.MappAIBranchSynthesis && window.MappAIBranchSynthesis.getData && window.MappAIBranchSynthesis.getData();
            if (cur) out.push({ id: 'current', title: cur.branchLabel || t('de_synth', 'Sintesi'), live: true });
        } catch (e) { /* nessuna sintesi in memoria */ }
        try {
            const s = _appState();
            const mapNow = (s && s.rootNodeLabel) || '';
            const docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [];
            // `hasHtml`, non `html`: l'elenco dell'archivio porta i soli metadati
            // (il corpo si legge con get(id) all'apertura).
            docs.filter(d => d.kind === 'synthesis' && d.hasHtml !== false)
                .forEach(d => out.push({
                    id: d.id, title: d.title, date: d.date, mapName: d.mapName || '',
                    // Le sintesi di ALTRE mappe restano visibili — nasconderle
                    // sarebbe l'ennesimo elenco vuoto senza spiegazione — ma
                    // vanno in fondo e la riga dice a quale mappa appartengono.
                    other: !!(mapNow && d.mapName && d.mapName !== mapNow)
                }));
        } catch (e) { /* archivio vuoto */ }
        out.sort(function (a, b) { return (a.other ? 1 : 0) - (b.other ? 1 : 0); });
        return out;
    }

    /* ── «HO UN DOCUMENTO APERTO» ────────────────────────────────────────────
       Gemello di `mappai-doc-uscito`. L'editor si disegna SOLO dentro
       `#elab-doc-host`, che esiste quando la console ELABORA è in modalità
       documento: un'apertura che arriva da fuori (il percorso «Crea un
       documento → Quiz → Le scrivo io») caricava il documento in memoria e
       non mostrava NIENTE — l'utente vedeva l'elenco di prima e concludeva,
       giustamente, che il gesto non aveva funzionato.
       Annuncia l'EDITOR e non chi lo apre: è l'unico che sa di aver caricato
       qualcosa, e così ogni ingresso — anche quelli di domani — è coperto.
       La console ignora l'eco delle proprie aperture (è già in editing). */
    function _annunciaAperto(dettaglio) {
        try { document.dispatchEvent(new CustomEvent('mappai-doc-aperto', { detail: dettaglio || {} })); }
        catch (e) { /* un annuncio mancato non deve impedire l'apertura */ }
    }

    // ── apertura documenti ──────────────────────────────────────────────────
    function openSet(setId) {
        const set = _sets().find(s => s.id === setId);
        if (!set) { toast(t('de_no_set', 'Set non trovato'), 'warning'); return; }
        _srcSet = set;
        _doc = DE().docFromSet(set);
        _kind = _doc.kind;
        _syn = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        _annunciaAperto({ kind: _kind, setId: setId });
    }

    /* ══ DOMANDE APERTE — l'editor (11/8/26) ══════════════════════════════════
       La sorgente non è un set di studio (le domande aperte non ci entrano: il
       player pretende opzioni) ma la VOCE D'ARCHIVIO, cioè il foglio HTML che
       la pipeline salva con la sua sorgente incorporata. Da lì `setFromHtml`
       ricostruisce gli item — la stessa strada dei quiz cartacei di INSEGNA, e
       il motivo per cui in archivio va l'HTML e non il PDF.
       `docId` = id della voce in `MappAIStudyDocs`. */
    function openOpenQuestions(docId) {
        const store = window.MappAIStudyDocs;
        const doc = store && store.get ? store.get(docId) : null;
        if (!doc || !doc.html) { toast(t('de_oq_no_src', 'Non trovo la sorgente di questo documento.'), 'warning'); return false; }
        const QP = window.MappAIQuizPrint;
        const set = QP && QP.setFromHtml ? QP.setFromHtml(doc.html) : null;
        if (!set || !Array.isArray(set.items) || !set.items.length) {
            /* un foglio senza sorgente incorporata è un documento che si può
               guardare e stampare, non correggere: dirlo è meglio che aprire un
               editor vuoto */
            toast(t('de_oq_no_items', 'Questo foglio non porta con sé le domande: si può stampare, ma non correggere qui.'), 'warning');
            return false;
        }
        _srcSet = null;
        _openDocId = docId;
        _doc = {
            id: set.id || docId,
            title: set.title || doc.title || t('de_oq', 'Domande aperte'),
            kind: 'openq',
            items: DE().normOpenItems(set.items)
        };
        _kind = 'openq';
        _syn = null; _sheet = null; _cc = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        _annunciaAperto({ kind: 'openq', docId: docId });
        return true;
    }
    /* La voce d'archivio da cui il documento aperto viene, e su cui torna a
       scriversi: senza, un salvataggio creerebbe una seconda voce a ogni giro. */
    let _openDocId = null;

    /* Le macro-aree della mappa, per i chip delle domande aperte. Sono i rami
       veri (L1), non una lista scritta a mano: la domanda dichiara quali aree
       richiede, e quelle devono esistere nella mappa. */
    function _macroAree() {
        const s = _appState();
        const nodes = (s && s.db && s.db.nodes) || [];
        const isMM = s && s.extractionMode === 'mindmap';
        let rami = isMM ? nodes.filter(n => (n.level || 0) === 1) : nodes.filter(n => (n.level || 0) <= 1);
        const nomi = rami.map(n => String((window.cleanLabel ? window.cleanLabel(n.label) : n.label) || '').trim()).filter(Boolean);
        /* le aree già scritte nel documento restano scegliibili anche se la
           mappa nel frattempo è cambiata: toglierle dall'elenco farebbe sparire
           un chip che il foglio mostra */
        (_doc && _doc.items || []).forEach(it => (it.areas || []).forEach(a => {
            if (a && !nomi.some(n => n.toLowerCase() === String(a).toLowerCase())) nomi.push(a);
        }));
        return nomi;
    }

    // Dal foglio completo di una sintesi si recupera il solo CORPO (.bs-body):
    // header, citazioni e lettore audio restano quelli del builder, che li
    // ricostruisce al salvataggio. Una regex sola per l'archivio e per il file
    // del vault: sono lo stesso documento, scritto dallo stesso builder — due
    // copie divergerebbero al primo ritocco alla struttura del foglio.
    function _synthesisBody(html) {
        const src = String(html || '');
        const m = /<div class="bs-body">([\s\S]*?)<\/div>\s*(?:<div class="bs-footer|<script|<\/body)/i.exec(src);
        return m ? m[1] : src;
    }

    /* Voce naturale già incorporata nel file (data-URI) + cue map del karaoke.
       ⚠️ Vanno raccolte e ridate al builder al salvataggio: `blocksFromHtml`
       conosce solo h3/h4/p/li/blockquote e i `<div>`, quindi un `<audio>` non
       diventa un blocco — riscrivere il file senza recuperarlo qui vorrebbe dire
       cancellare la voce naturale a chi ha solo corretto un refuso.
       (Il file della pipeline non ne ha: `buildHtml(data)` è chiamato senza opts
       e l'MP3 sta accanto come file separato. Questo copre gli altri.) */
    function _embeddedAudio(html) {
        const src = String(html || '');
        const a = /<audio[^>]*id="ap-audio"[^>]*>[\s\S]*?<source[^>]*src="([^"]*)"[^>]*type="([^"]*)"/i.exec(src);
        if (!a) return null;
        let cues = null;
        const c = /<script[^>]*id="ap-cues"[^>]*>([\s\S]*?)<\/script>/i.exec(src);
        if (c) { try { cues = JSON.parse(c[1]); } catch (e) { cues = null; } }
        return { audioDataUri: a[1], audioMime: a[2] || 'audio/wav', cues: cues };
    }

    // ⚠️ `read-vault-file` ritorna SEMPRE base64 (è nato per i PDF): il testo va
    // decodificato con `TextDecoder`, perché `atob` da solo rende BYTE e non
    // caratteri UTF-8 — «Elettricità» diventerebbe «ElettricitÃ ». Stessa cura
    // già presa in mappai-elabora.js (_testoDaBase64).
    function _textFromBase64(b64) {
        try {
            const bin = atob(String(b64 || ''));
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(buf);
        } catch (e) { return ''; }
    }

    function openSynthesis(id) {
        const BS = window.MappAIBranchSynthesis;
        let data = null, html = '', archiveId = null, archiveTitle = null;
        if (id === 'current' && BS && BS.getData) {
            data = BS.getData();
            html = (BS.bodyHtml && BS.bodyHtml(data)) || '';
        } else if (window.MappAIStudyDocs) {
            const rec = window.MappAIStudyDocs.get(id);
            if (rec && rec.html) {
                archiveId = rec.id; archiveTitle = rec.title;
                html = _synthesisBody(rec.html);
                data = { branchLabel: rec.title, mapName: rec.mapName, rawText: '', archived: true };
            }
        }
        if (!data) { toast(t('de_no_synth', 'Nessuna sintesi disponibile: generane una dal menu «Materiali di studio».'), 'warning'); return; }
        const blocks = DE().blocksFromHtml(html);
        if (!blocks.length) { toast(t('de_synth_empty', 'La sintesi non contiene testo editabile.'), 'warning'); return; }
        _syn = {
            data: data, blocks: blocks, base: JSON.parse(JSON.stringify(blocks)),
            archiveId: archiveId, archiveTitle: archiveTitle, id: id
        };
        _kind = 'synthesis'; _doc = null; _srcSet = null;
        _bMenu = -1;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        /* 🐛 17/8: le DUE aperture della sintesi erano le sole a non annunciarsi.
           L'annuncio era stato messo il 13/8 su quiz, domande aperte, foglio dei
           nodi e catena, e il commento sopra dichiara «ogni ingresso, anche
           quelli di domani»: queste due erano rimaste indietro. Conseguenza —
           una sintesi aperta da fuori dalla console (dal percorso «Crea un
           documento», o dopo averla appena generata) caricava tutto in memoria e
           non disegnava NIENTE, perché `#elab-doc-host` non esiste finché la
           console non è in modalità documento. Lo stesso sintomo dei quiz. */
        _annunciaAperto({ kind: 'synthesis', synId: id });
    }

    /* Sintesi aperta dal FILE che sta nel vault — non dalla memoria di sessione.
       È il caso normale, non un ripiego: il nome «Sintesi -VERDE.html» lo scrive
       solo la pipeline dei materiali, che gira in silenzio (`runWholeMap({silent:
       true})`) e quindi non passa mai dal modale dove la sintesi verrebbe
       archiviata. Nessun record in MappAIStudyDocs, e `_lastSynthesis` è memoria
       di sessione che nessuno persiste: riaperto il progetto è `null`. Il file su
       disco, invece, c'è sempre — ed è la fonte di verità (decisione del 9/8).

       opts = { vaultPath, relPath, title, mapName }
       → Promise<boolean>: true = documento caricato (chi chiama può ridisegnare);
         false = ha rinunciato, e l'utente è GIÀ stato avvisato. Non lancia mai. */
    async function openSynthesisFromVault(opts) {
        const o = opts || {};
        const vaultPath = o.vaultPath, relPath = o.relPath;
        if (!vaultPath || !relPath) {
            toast(t('de_vault_doc_ko', 'Non riesco a leggere questo documento dalla cartella della mappa.'), 'warning');
            return false;
        }
        /* ⚠️ LA COPIA CON LA VOCE NON SI APRE QUI (10/8/26). È un prodotto
           finito: porta l'MP3 dentro (~8 MB) e serve a essere consegnata, non
           corretta. Aprendola, `_saveSynthesisFile` la riscriverebbe sopra sé
           stessa e la renderebbe editabile di fatto — con l'audio conservato o
           lasciato cadere a seconda di quanto è stato toccato il testo.
           La guardia sta QUI e non solo in chi apre: la console di ELABORA già
           non la elenca, ma questa funzione è esportata e chiunque può
           chiamarla. La difesa va dove accade il danno. */
        if (/(^|\/)Sintesi-voce\b/i.test(String(relPath))) {
            toast(t('de_voce_non_editabile', 'Questa è la copia con la voce, da consegnare: si corregge la sintesi normale e poi si rigenera la voce.'), 'warning');
            return false;
        }
        const api = window.electronAPI;
        if (!api || !api.readVaultFile) { toast(t('de_need_app', 'Richiede l\'app desktop.'), 'warning'); return false; }

        let html = '';
        try {
            const res = await api.readVaultFile({ vaultPath: vaultPath, relPath: relPath });
            if (!res || !res.ok || !res.base64) {
                toast(t('de_vault_doc_ko', 'Non riesco a leggere questo documento dalla cartella della mappa.') +
                    (res && res.error ? ' (' + res.error + ')' : ''), 'error');
                return false;
            }
            html = _textFromBase64(res.base64);
        } catch (e) {
            toast(t('de_vault_doc_ko', 'Non riesco a leggere questo documento dalla cartella della mappa.') + ' (' + e.message + ')', 'error');
            return false;
        }

        const blocks = html ? DE().blocksFromHtml(_synthesisBody(html)) : [];
        if (!blocks.length) { toast(t('de_synth_empty', 'La sintesi non contiene testo editabile.'), 'warning'); return false; }

        const data = {
            branchLabel: o.title || relPath.split('/').pop().replace(/\.html?$/i, ''),
            mapName: o.mapName || '',
            rawText: '',
            /* Il perno del salvataggio: da QUALE file viene questo documento.
               Senza, «Salva» dovrebbe inventarsi un nome — ed è così che nascono
               le seconde copie divergenti nella stessa cartella. */
            fromVault: { vaultPath: vaultPath, relPath: relPath }
        };
        _syn = {
            data: data, blocks: blocks, base: JSON.parse(JSON.stringify(blocks)),
            archiveId: null, archiveTitle: null, id: relPath,
            vaultAudio: _embeddedAudio(html)
        };
        _kind = 'synthesis'; _doc = null; _srcSet = null;
        _bMenu = -1;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        /* Come `openSynthesis`: senza annuncio, una sintesi aperta dal vault da
           fuori dalla console non trova `#elab-doc-host` e non si vede. */
        _annunciaAperto({ kind: 'synthesis', dalVault: relPath });
        return true;
    }

    // ── FOGLIO DEI NODI ─────────────────────────────────────────────────────
    // Una card per nodo, ognuna col PROPRIO tipo di contenuto (solo titolo ·
    // titolo + spazio da scrivere · titolo + parole chiave · titolo + descrizione).
    // Il foglio storico applicava lo stesso tipo a tutte le card: qui il docente
    // lo decide card per card, e quello che vede è la card che esce dalla
    // stampante (stesse proporzioni, stesse soglie di testo).
    function NS() { return window.MappAINodeSheet; }

    /** Nodi della mappa fino alla profondità scelta, già ripuliti per la stampa. */
    function _sheetNodes(depth) {
        const s = _appState();
        const all = (s && s.db && s.db.nodes) || [];
        const max = (depth == null || depth === 'all') ? null : parseInt(depth, 10);
        return all
            .filter(n => (max == null || isNaN(max)) ? true : (n.level || 0) <= max)
            .map(n => ({
                id: n.id,
                label: (window.cleanLabel ? window.cleanLabel(n.label) : String(n.label || '')),
                desc: String(n.desc || n.content || '').trim()
            }));
    }
    /** Livello massimo presente nella mappa (per il selettore di profondità). */
    function _maxLevel() {
        const s = _appState();
        return ((s && s.db && s.db.nodes) || []).reduce((m, n) => Math.max(m, n.level || 0), 0);
    }
    function _nodeById(id) {
        const s = _appState();
        return ((s && s.db && s.db.nodes) || []).find(n => n.id === id) || null;
    }

    /* ── QUALE COPIA SI STA CORREGGENDO (11/8/26) ────────────────────────────
       Foglio dei nodi e catena vivono DENTRO il progetto, e finora ce n'era uno
       solo per mappa. Col clone ce ne può essere più d'uno: `_clone` dice quale
       — '' è l'originale, dov'era. Dove leggere e dove riscrivere lo sa
       `mappai-clona-core.js`, una regola sola per tutti e due i generi. */
    let _clone = '';
    function _CLN() { return (typeof window !== 'undefined' && window.MappAIClona) || null; }
    function _leggiDoc(db, campo) {
        const C = _CLN();
        return C ? C.leggiDoc(db, campo, _clone) : (db && db[campo]) || null;
    }
    function _scriviDoc(db, campo, valore) {
        const C = _CLN();
        if (C) { C.scriviDoc(db, campo, _clone, valore); return; }
        db[campo] = valore;                     /* senza il core: comportamento storico */
    }

    function openNodeSheet(clone) {
        _clone = (_CLN() ? _CLN().pulisci(clone) : (clone || ''));
        if (!NS()) { toast(t('de_ns_no_core', 'Modulo del foglio nodi non caricato.'), 'error'); return; }
        const s = _appState();
        if (!((s && s.db && s.db.nodes) || []).length) { toast(t('de_ns_no_nodes', 'Questa mappa non ha nodi.'), 'warning'); return; }
        const saved = _leggiDoc(s.db, 'nodeSheet');
        let doc;
        if (saved && Array.isArray(saved.cards) && saved.cards.length) {
            doc = NS().normDoc(saved);
            doc.excluded = Array.isArray(saved.excluded) ? saved.excluded.slice() : [];
            // La mappa può essere cambiata dopo l'ultimo salvataggio: i nodi nuovi
            // entrano col solo titolo, quelli spariti escono. I testi rivisti dal
            // docente restano com'erano.
            const sync = NS().syncCards(doc.cards, _sheetNodes(doc.depth), { exclude: doc.excluded });
            doc.cards = sync.cards;
            if (sync.added || sync.removed) {
                toast(t('de_ns_synced', 'Foglio riallineato alla mappa: {a} card nuove, {r} rimosse.')
                    .replace('{a}', sync.added).replace('{r}', sync.removed), 'info');
            }
        } else {
            doc = NS().docFromNodes(_sheetNodes('all'), {
                fmt: '2x2', layout: 'title', depth: 'all',
                title: (s && s.rootNodeLabel) || ''
            });
            doc.excluded = [];
        }
        _sheet = doc;
        _kind = 'nodesheet'; _doc = null; _syn = null; _srcSet = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _nsMenu = -1;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        _annunciaAperto({ kind: 'nodesheet', dallaMappa: 'nodesheet', clone: _clone || '' });
    }

    function _nsSnapshot(label) {
        if (!_hist) return;
        _hist.push({ cards: _sheet.cards, fmt: _sheet.fmt, bg: _sheet.bg, depth: _sheet.depth, excluded: _sheet.excluded }, label);
    }

    // ── CATENA DEI PERCHÉ ───────────────────────────────────────────────────
    // I nessi si estraggono dalla mappa in modo deterministico, quindi grezzo:
    // qui il docente li sistema. La revisione vive nel PROGETTO (come il foglio
    // dei nodi), non nell'archivio: l'archivio tiene documenti già resi, e
    // rileggere le righe da un HTML stampato sarebbe fragile.
    function CC() { return window.MappAICausalCore; }
    function CCU() { return window.MappAICausal; }

    function openCausal(clone) {
        _clone = (_CLN() ? _CLN().pulisci(clone) : (clone || ''));
        if (!CC() || !CCU()) { toast(t('de_cc_no_core', 'Modulo della catena dei perché non caricato.'), 'error'); return; }
        const s = _appState();
        const saved = _leggiDoc(s && s.db, 'causalDoc');
        let doc = null;
        if (saved && CC().countRows(saved)) {
            doc = CC().normDoc(saved);
        } else {
            const chains = CCU().buildForCurrentMap();
            if (!chains || !chains.total) {
                toast(t('cc_empty', 'Nessun nesso causa-effetto trovato: servono verbi significativi sui link o connettivi (perché, quindi…) nelle descrizioni.'), 'warning');
                return;
            }
            doc = CC().docFromChains(chains, {
                root: t('cc_general', 'In generale'),
                cross: t('cc_cross', 'Ponti tra i rami')
            });
        }
        _cc = doc;
        _kind = 'causal'; _doc = null; _syn = null; _sheet = null; _srcSet = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
        _annunciaAperto({ kind: 'causal', dallaMappa: 'causal', clone: _clone || '' });
    }

    function _ccSnapshot(label) { if (_hist) _hist.push({ cc: _cc }, label); }
    function _ccTouch() { _dirty = true; _paintDirty(); }

    /** Riga → campo. Chiamata dall'input: nessun re-render, il cursore resta dov'è. */
    function _commitCc(el) {
        const si = parseInt(el.getAttribute('data-si'), 10);
        const ri = parseInt(el.getAttribute('data-ri'), 10);
        const f = el.getAttribute('data-cc');
        if (isNaN(si) || isNaN(ri) || !f || !_cc) return;
        _cc = CC().setRowField(_cc, si, ri, f, el.innerText.replace(/\n+/g, ' '));
        _ccTouch();
    }
    function ccFamily(si, ri, fam) {
        _ccSnapshot(t('de_cc_op_fam', 'famiglia del nesso'));
        _cc = CC().setRowField(_cc, si, ri, 'family', fam);
        _ccTouch(); render();
    }
    /** Causa ⇄ contrasto: cambia la freccia e il significato della riga. */
    function ccType(si, ri) {
        const cur = _cc.sections[si] && _cc.sections[si].rows[ri];
        if (!cur) return;
        _ccSnapshot(t('de_cc_op_type', 'tipo di nesso'));
        _cc = CC().setRowField(_cc, si, ri, 'type', cur.type === 'contrast' ? 'cause' : 'contrast');
        _ccTouch(); render();
    }
    function ccAdd(si, ri) {
        _ccSnapshot(t('de_cc_op_add', 'aggiungi nesso'));
        _cc = CC().insertRow(_cc, si, ri);
        _ccTouch(); render();
    }
    function ccDel(si, ri) {
        _ccSnapshot(t('de_cc_op_del', 'elimina nesso'));
        _cc = CC().removeRow(_cc, si, ri);
        _ccTouch(); render();
    }
    function ccMove(si, ri, dir) {
        _ccSnapshot(t('de_cc_op_move', 'sposta nesso'));
        _cc = CC().moveRow(_cc, si, ri, dir);
        _ccTouch(); render();
    }

    function _ccChains() { return CC().chainsFromDoc(_cc); }
    function _ccHtml() { return CCU().buildDocHtml(_ccChains(), CCU().mapName(), _fontCorrente()); }

    async function _saveCausal() {
        const s = _appState();
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }
        /* ⚠️ 13/8: salvare NON contesta più i campi vuoti. Un documento su cui
           si lavora per giorni è incompleto quasi sempre, e la domanda aveva
           una risposta sola. I problemi si contestano dove il documento esce:
           «Stampa» e «Crea PDF» (`_problemiAccettati`). */
        const out = CC().normDoc(_cc);
        if (!CC().countRows(out)) {
            // Documento svuotato: senza questa guardia il salvataggio lascerebbe
            // `causalDoc` vuoto e stampa e PDF tornerebbero all'estrazione grezza
            // senza dirlo (chainsForOutput ripiega sulla mappa).
            toast(t('de_cc_empty_doc', 'La catena non ha più nessi: aggiungine almeno uno prima di salvare.'), 'warning');
            return;
        }
        _cc = out;
        _scriviDoc(s.db, 'causalDoc', out);
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        // L'archivio tiene la versione RESA: INSEGNA e «Documenti salvati» la
        // riaprono senza passare dall'editor.
        try {
            if (window.MappAIStudyDocs && window.MappAIStudyDocs.save) {
                window.MappAIStudyDocs.save({
                    kind: 'causal', title: t('cc_doc_title', 'Catena dei perché'),
                    mapName: CCU().mapName(), html: _ccHtml()
                });
            }
        } catch (e) { console.warn('[DocEditor] archivio catena:', e); }
        _dirty = false; _paintDirty();
        toast(t('de_cc_saved', '✓ Catena salvata — {n} nessi, validi per stampa, PDF e vault').replace('{n}', CC().countRows(out)), 'success');
        render();
    }

    function nsSetFmt(v) {
        _nsSnapshot(t('de_ns_op_fmt', 'formato foglio'));
        const before = _sheet.cards;
        const next = NS().setFmt(_sheet, v);
        _sheet.fmt = next.fmt;
        _sheet.cards = next.cards;
        // 3×4: card troppo piccola per un contenuto sotto il titolo → il tipo
        // torna «solo titolo». Lo diciamo, invece di farlo di nascosto.
        const lost = before.filter(c => c.layout !== 'title').length;
        if (!NS().allowsContent(_sheet.fmt) && lost) {
            toast(t('de_ns_fmt_reset', 'Con 3 × 4 entra solo il titolo: {n} card hanno perso il contenuto sotto (torna a 2 × 2 per riaverlo).').replace('{n}', lost), 'warning');
        }
        _dirty = true; _nsMenu = -1; render();
    }
    function nsSetBg(v) {
        _sheet.bg = (v === 'grid') ? 'grid' : 'none';
        _dirty = true; render();
    }
    function nsSetDepth(v) {
        _nsSnapshot(t('de_ns_op_depth', 'profondità del foglio'));
        _sheet.depth = (v === 'all') ? 'all' : parseInt(v, 10);
        const sync = NS().syncCards(_sheet.cards, _sheetNodes(_sheet.depth), { exclude: _sheet.excluded });
        _sheet.cards = sync.cards;
        _dirty = true; _nsMenu = -1; render();
    }

    /** Menu «+ contenuto» di una card (apri/chiudi). */
    function nsMenu(i) {
        if (!NS().allowsContent(_sheet.fmt)) {
            toast(t('de_ns_only_title', 'Con il formato 3 × 4 nella card entra solo il titolo.'), 'info');
            return;
        }
        _nsMenu = (_nsMenu === i) ? -1 : i;
        render();
    }

    /**
     * Dà (o toglie) un contenuto alla card. Passando da «solo titolo» a
     * qualunque altro tipo il titolo smette di essere centrato e sale in alto:
     * lo fa la resa, qui cambia solo il tipo di contenuto. I campi vuoti vengono
     * riempiti con quello che la mappa già sa (figli del nodo → parole chiave,
     * descrizione del nodo → testo della scheda); se la mappa non ha nulla, la
     * card resta vuota e la si scrive a mano.
     */
    function nsSetLayout(i, layout) {
        _nsSnapshot(t('de_ns_op_layout', 'contenuto della card'));
        const card = _sheet.cards[i] || {};
        const node = _nodeById(card.id);
        const prefill = {};
        if (layout === 'keywords' && node && typeof window._fallbackKeywords === 'function') {
            try { prefill.keywords = window._fallbackKeywords(node) || []; } catch (e) { /* niente prefill */ }
        }
        if (layout === 'card' && node) prefill.desc = String(node.desc || node.content || '').trim();
        _sheet.cards = NS().setLayout(_sheet.cards, i, layout, prefill);
        _dirty = true; _nsMenu = -1; render();
    }
    /** Applica lo stesso tipo di contenuto a tutte le card (punto di partenza). */
    function nsSetAll(layout) {
        if (!NS().allowsContent(_sheet.fmt) && layout !== 'title') {
            toast(t('de_ns_only_title', 'Con il formato 3 × 4 nella card entra solo il titolo.'), 'info');
            return;
        }
        _nsSnapshot(t('de_ns_op_layout_all', 'contenuto di tutte le card'));
        _sheet.cards = NS().setAllLayouts(_sheet.cards, layout, function (c) {
            const node = _nodeById(c.id);
            const p = {};
            if (layout === 'keywords' && node && typeof window._fallbackKeywords === 'function') {
                try { p.keywords = window._fallbackKeywords(node) || []; } catch (e) { }
            }
            if (layout === 'card' && node) p.desc = String(node.desc || node.content || '').trim();
            return p;
        });
        _dirty = true; _nsMenu = -1; render();
    }

    function nsAddKeyword(i) {
        _nsSnapshot(t('de_ns_op_kw', 'parola chiave'));
        const before = (_sheet.cards[i] && _sheet.cards[i].keywords.length) || 0;
        _sheet.cards = NS().addKeyword(_sheet.cards, i, '');
        if ((_sheet.cards[i].keywords.length) === before) {
            toast(t('de_ns_kw_max', 'Sette parole chiave sono il massimo che entra nella card.'), 'info');
            return;
        }
        _dirty = true; render();
        setTimeout(function () {
            const el = _host() && _host().querySelector('[data-i="' + i + '"][data-ns="kw:' + before + '"]');
            if (el) el.focus();
        }, 30);
    }
    function nsDelKeyword(i, ki) {
        _nsSnapshot(t('de_ns_op_kw_del', 'elimina parola chiave'));
        _sheet.cards = NS().removeKeyword(_sheet.cards, i, ki);
        _dirty = true; render();
    }
    function nsMove(i, dir) {
        _nsSnapshot(t('de_ns_op_move', 'sposta card'));
        _sheet.cards = NS().moveCard(_sheet.cards, i, i + dir);
        _dirty = true; _nsMenu = -1; render();
    }
    /** Toglie la card dal FOGLIO (il nodo resta nella mappa). */
    async function nsDelCard(i) {
        const c = _sheet.cards[i]; if (!c) return;
        if (!await _chiedi(t('de_ns_del', 'Togliere questa card dal foglio? Il nodo resta nella mappa.') + '\n\n' + c.label,
            t('de_ns_del_ok', 'Togli la card'))) return;
        _nsSnapshot(t('de_ns_op_del', 'togli card'));
        _sheet.excluded = (_sheet.excluded || []).concat([c.id]);
        _sheet.cards = NS().removeAt(_sheet.cards, i);
        _dirty = true; _nsMenu = -1; render();
    }
    function nsRestoreAll() {
        _nsSnapshot(t('de_ns_op_restore', 'ripristina card'));
        _sheet.excluded = [];
        const sync = NS().syncCards(_sheet.cards, _sheetNodes(_sheet.depth), { exclude: [] });
        _sheet.cards = sync.cards;
        _dirty = true; render();
        toast(t('de_ns_restored', 'Card ripristinate: {n}.').replace('{n}', sync.added), 'success');
    }

    /**
     * Parole chiave con l'AI per le card che le hanno vuote. Stesso motore del
     * foglio automatico (_generateNodeKeywords in mappai-print-dossier.js): qui
     * riempie solo i buchi, senza toccare quello che il docente ha scritto.
     */
    async function nsKeywordsAI() {
        const todo = _sheet.cards
            .map((c, i) => ({ c: c, i: i }))
            .filter(x => x.c.layout === 'keywords' && !x.c.keywords.length)
            .map(x => x.i);
        if (!todo.length) { toast(t('de_ns_kw_none', 'Nessuna card «parole chiave» da riempire: prima dai quel contenuto a una card con «+».'), 'info'); return; }
        const apiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (!apiKey) { toast(t('de_ns_kw_nokey', 'Serve la chiave AI: le parole chiave si possono comunque scrivere a mano.'), 'warning'); return; }
        if (typeof window._generateNodeKeywords !== 'function') { toast(t('de_ns_kw_noengine', 'Motore parole chiave non disponibile.'), 'error'); return; }
        const nodes = todo.map(i => _nodeById(_sheet.cards[i].id)).filter(Boolean);
        if (!nodes.length) { toast(t('de_ns_kw_nonodes', 'Le card da riempire non hanno più un nodo nella mappa.'), 'warning'); return; }
        _nsSnapshot(t('de_ns_op_kw_ai', 'parole chiave AI'));
        try {
            if (window.showLoadingOverlay) window.showLoadingOverlay(true, t('de_ns_kw_wait', 'Genero le parole chiave…'));
            const map = (await window._generateNodeKeywords(nodes, apiKey)) || {};
            let filled = 0;
            todo.forEach(function (i) {
                const id = _sheet.cards[i].id;
                let kw = map[id];
                if (!Array.isArray(kw) || !kw.length) {
                    const n = _nodeById(id);
                    kw = (n && typeof window._fallbackKeywords === 'function') ? window._fallbackKeywords(n) : [];
                }
                if (kw && kw.length) {
                    _sheet.cards[i].keywords = NS().normKeywords(kw);
                    filled++;
                }
            });
            _dirty = true; render();
            toast(t('de_ns_kw_done', 'Parole chiave riempite su {n} card — controllale prima di stampare.').replace('{n}', filled), filled ? 'success' : 'warning');
        } catch (e) {
            toast(t('de_ns_kw_ko', 'Generazione non riuscita') + ': ' + e.message, 'error');
        } finally {
            if (window.showLoadingOverlay) window.showLoadingOverlay(false);
        }
    }

    async function _saveNodeSheet() {
        const s = _appState();
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }
        const out = NS().normDoc(_sheet);
        out.excluded = (_sheet.excluded || []).slice();
        out.editedAt = Date.now();
        _scriviDoc(s.db, 'nodeSheet', out);
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        _dirty = false; _paintDirty();
        toast(t('de_ns_saved', '✓ Foglio nodi salvato — {n} card').replace('{n}', out.cards.length), 'success');
    }

    /** Opzioni di stampa comuni (foglio rivisto → il motore usa le card). */
    function _nsPrintOpts(extra) {
        return Object.assign({
            cards: NS().toPrintCards(_sheet),
            fmt: _sheet.fmt,
            bg: _sheet.bg,
            causal: false,
            tuned: false,
            font: _fontCorrente()
        }, extra || {});
    }
    async function _printNodeSheet(nome) {
        if (typeof window.printAllNodeLabels !== 'function') { toast(t('de_ns_no_engine', 'Motore di stampa non disponibile.'), 'error'); return; }
        const over = NS().overCards(_sheet.cards, _sheet.fmt);
        if (over.length && !await _chiedi(
            t('de_ns_over_confirm', '{n} card hanno più testo di quanto entra nella card stampata: uscirebbero tagliate.').replace('{n}', over.length) +
            '\n\n' + t('de_ns_over_which', 'Card:') + ' ' + over.slice(0, 12).map(o => '#' + (o.i + 1)).join(', ') +
            (over.length > 12 ? '…' : '') + '\n\n' + t('de_ns_print_anyway', 'Stampare comunque?'),
            t('de_ns_print_anyway_ok', 'Stampa comunque'))) return;
        await window.printAllNodeLabels(_nsPrintOpts(nome ? { fileName: nome } : null));
    }

    /* ⚠️ Async come le altre domande (vedi `_chiedi`), ma con una proprietà che
       qui conta: senza modifiche in sospeso NESSUN `await` viene eseguito,
       quindi il corpo resta SINCRONO — e con esso l'annuncio
       `mappai-doc-uscito`, su cui la console conta per togliere l'host PRIMA
       che `render()` cerchi dove disegnare. È il percorso di `esci()`, dove
       `_dirty` è già falso per costruzione. */
    async function backToList() {
        if (_dirty && !await _chiedi(t('de_leave', 'Ci sono modifiche non salvate. Uscire comunque?'),
            t('de_leave_ok', 'Esci senza salvare'))) return;
        _view = 'list'; _doc = null; _syn = null; _sheet = null; _cc = null; _kind = null; _dirty = false; _nsMenu = -1; _bMenu = -1;
        /* ⚠️ Uscire da un documento ANNUNCIA l'uscita (8/8 notte). Nel workspace
           classico la lista dei documenti È la superficie giusta e `render()`
           qui sotto la disegna come sempre. Nella console di ELABORA no: là
           l'elenco vive nella COLONNA e la tela deve tornare al segnaposto —
           senza l'annuncio ricompariva la vecchia superficie di selezione dentro
           l'area, cioè due elenchi degli stessi documenti nella stessa
           schermata. L'evento è sincrono e arriva PRIMA del render: chi lo
           ascolta rimuove l'host, e `render()` non trova dove disegnare. */
        try { document.dispatchEvent(new CustomEvent('mappai-doc-uscito')); } catch (e) { }
        render();
    }

    /* ── L'USCITA: un bottone solo, che dice se salva ─────────────────────────
       Decisione di Giacomo (9/8), valida per tutti e cinque gli editor: il
       bottone conclusivo è un'USCITA e cambia parola secondo lo stato del
       documento — «Esci» quando non c'è niente da salvare, «Salva ed Esci»
       appena si tocca qualcosa. Due bottoni separati («Salva» e «‹ Documenti»)
       lasciavano scegliere fra due cose che si fanno quasi sempre insieme, e
       rendevano comodo proprio il caso che non deve esserlo: uscire buttando
       via il lavoro.
       ⚠️ Se il salvataggio RINUNCIA — validazione rifiutata, set sparito dalla
       mappa, scrittura non riuscita — NON si esce: si perderebbe esattamente
       ciò che si era chiesto di salvare. È la stessa regola di `_conSalvataggio`
       nella console di ELABORA. Il segnale è `_dirty`: chi salva lo abbassa solo
       quando ha davvero scritto. */
    /* ══ I TRE GESTI DELLA BARRA (13/8/26, modello di Giacomo) ═══════════════
       Erano confusi in uno solo: «Salva ed Esci» chiedeva il nome, scriveva il
       PDF nella cartella e lo faceva comparire in INSEGNA. Su un documento a cui
       si lavora per giorni questo produce PDF transitori — pubblicati prima di
       essere finiti — e obbliga a rispondere a domande («che nome?», «ci sono
       campi vuoti, salvo comunque?») a ogni salvataggio.
       Ora salvare non è pubblicare:
         · SALVA ED ESCI → salva la SORGENTE modificabile (memoria, progetto e
           vault) e basta. Niente nome, niente file, niente contestazioni: un
           documento a metà è normale.
         · STAMPA         → apre la stampa su una copia EFFIMERA. Qui i campi
           vuoti si contestano: sta per finire su carta.
         · CREA PDF       → scrive il file in «Materiale Studio/» e lo rende
           visibile nelle tabelle di INSEGNA. È l'atto di pubblicare, e si fa
           quando il documento è pronto.
       ⚠️ Deroga: un documento aperto DA un file del vault (`_origine()` — la
       sintesi, per esempio) continua a riscrivere il SUO file salvando: lì il
       file esiste già ed è la sua casa, non una pubblicazione nuova. */
    async function esci() {
        if (_dirty) {
            let ok;
            try { ok = await _salvaDoveVive(); }
            catch (e) {
                toast(t('de_exit_ko', 'Salvataggio non riuscito: resto nel documento.') +
                    (e && e.message ? ' (' + e.message + ')' : ''), 'error');
                return;
            }
            if (!ok) return;      // ha rinunciato, e l'ha già detto
            if (_dirty) return;
        }
        // Qui `_dirty` è falso per costruzione: `backToList()` non chiede
        // conferma, quindi non esegue nessun `await` e resta sincrona (con
        // essa l'annuncio dell'uscita, su cui la console conta).
        return backToList();
    }

    /* «Crea PDF»: il gesto che PUBBLICA. Chiede il nome solo a chi non ce l'ha,
       scrive in «Materiale Studio/» e da lì il materiale compare in INSEGNA. */
    async function creaPdf() {
        /* Anche qui i problemi si contestano: il PDF finisce fra i materiali
           che la classe vede, ed è l'ultimo momento in cui dirlo. */
        if (!await _problemiAccettati()) return;
        const esito = await _salvaConNome();
        if (esito === null) return;              // ha rinunciato: nessun file
        if (esito === false) return;             // non si è potuto scrivere: già detto
    }

    // ── cronologia ──────────────────────────────────────────────────────────
    function _snapshot(label) {
        if (!_hist) return;
        if (_kind === 'nodesheet') return _nsSnapshot(label);
        if (_kind === 'causal') return _ccSnapshot(label);
        _hist.push(_kind === 'synthesis' ? { blocks: _syn.blocks } : { items: _doc.items, title: _doc.title }, label);
    }
    function undo() {
        if (!_hist || !_hist.canUndo()) { toast(t('de_no_undo', 'Niente da annullare'), 'info'); return; }
        const prev = _hist.undo();
        if (!prev) return;
        if (_kind === 'synthesis') { _syn.blocks = prev.state.blocks; _bMenu = -1; }
        else if (_kind === 'nodesheet') {
            _sheet.cards = prev.state.cards;
            _sheet.fmt = prev.state.fmt; _sheet.bg = prev.state.bg;
            _sheet.depth = prev.state.depth; _sheet.excluded = prev.state.excluded || [];
            _nsMenu = -1;
        }
        else if (_kind === 'causal') { _cc = prev.state.cc; }
        else { _doc.items = prev.state.items; _doc.title = prev.state.title; }
        _dirty = true;
        render();
        toast(t('de_undone', 'Annullato') + (prev.label ? ': ' + prev.label : ''), 'info');
    }

    // ── modifiche quiz ──────────────────────────────────────────────────────
    function _commitField(i, path, value) {
        /* ⚠️ Le domande aperte hanno le LORO funzioni: `setField` normalizza
           verso la forma del quiz e butterebbe traccia, righe e aree senza
           dire niente (c'è un test che lo fissa). */
        _doc.items = (_kind === 'openq')
            ? DE().setOpenField(_doc.items, i, path, value)
            : DE().setField(_doc.items, i, path, value);
        _dirty = true;
        _paintDirty();
    }
    /* Un'area si accende o si spegne (il core tiene il tetto di due). */
    function oqArea(i, nome) {
        _snapshot(t('de_oq_op_area', 'aree della domanda'));
        _doc.items = DE().setOpenField(_doc.items, i, 'area:' + nome);
        _dirty = true; render();
    }
    /* Il LIVELLO della domanda, cambiato a mano (13/8 sera).
       Lo dichiara l'AI quando genera, ma è chi CORREGGE ad avere l'ultima
       parola: una domanda d'avvio a cui si aggiunge un collegamento non è più
       un avvio, e il foglio delle tracce continuerebbe a dire di sì. */
    function oqLivello(i, valore) {
        _snapshot(t('de_oq_op_liv', 'livello della domanda'));
        _doc.items = DE().setOpenField(_doc.items, i, 'livello', valore);
        _dirty = true; render();
    }
    function addQuestion(after) {
        _snapshot(t('de_op_add_q', 'aggiungi domanda'));
        const at = (after == null) ? _doc.items.length : after + 1;
        _doc.items = DE().insertAt(_doc.items, at, DE().blankItemFor(_doc));
        _dirty = true; render();
        setTimeout(function () {
            const el = _host() && _host().querySelector('[data-i="' + at + '"][data-f="question"]');
            if (el) el.focus();
        }, 30);
    }
    async function delQuestion(i) {
        const label = DE().plainText(_doc.items[i] && _doc.items[i].question) || ('#' + (i + 1));
        if (!await _chiedi(t('de_del_q', 'Eliminare la domanda') + ' ' + (i + 1) + '?\n\n' + label.slice(0, 120),
            t('de_del_ok', 'Elimina'))) return;
        _snapshot(t('de_op_del_q', 'elimina domanda'));
        _doc.items = DE().removeAt(_doc.items, i);
        _dirty = true; render();
    }
    function moveQ(i, dir) {
        _snapshot(t('de_op_move', 'sposta domanda'));
        _doc.items = DE().moveItem(_doc.items, i, i + dir);
        _dirty = true; render();
    }
    function addOption(i) {
        _snapshot(t('de_op_add_opt', 'aggiungi opzione'));
        _doc.items = DE().addOption(_doc.items, i);
        _dirty = true; render();
    }
    function delOption(i, oi) {
        _snapshot(t('de_op_del_opt', 'elimina opzione'));
        _doc.items = DE().removeOption(_doc.items, i, oi);
        _dirty = true; render();
    }
    function setCorrect(i, oi) {
        _snapshot(t('de_op_correct', 'risposta corretta'));
        _doc.items = DE().setField(_doc.items, i, 'correctIndex', oi);
        _dirty = true; _paintDirty();
        const host = _host();
        if (host) {
            host.querySelectorAll('.de-opt[data-i="' + i + '"]').forEach(function (el) {
                el.classList.toggle('correct', String(el.getAttribute('data-oi')) === String(oi));
            });
        }
    }

    // ── modifiche sintesi ───────────────────────────────────────────────────
    function _commitBlock(i, html) {
        if (!_syn.blocks[i]) return;
        _syn.blocks[i].html = html;
        _dirty = true;
        _paintDirty();
    }
    /** Apre/chiude il menu «che tipo è questo blocco». */
    function blockMenu(i) { _bMenu = (_bMenu === i) ? -1 : i; render(); }
    /** Apre/chiude il menu «che tipo di blocco aggiungo qui sotto». */
    function blockAddMenu(i) { const k = -100 - i; _bMenu = (_bMenu === k) ? -1 : k; render(); }

    function setBlockTag(i, tag) {
        _bMenu = -1;
        // Il core potrebbe essere una versione più vecchia (cache del browser):
        // meglio un avviso che un menu che non fa niente senza dire perché.
        if (!DE().setBlockTag) { toast(t('de_tag_no_core', 'Ricarica la pagina: il modulo dei documenti è una versione precedente.'), 'warning'); render(); return; }
        const next = DE().setBlockTag(_syn.blocks, i, tag);
        if (next === _syn.blocks || next[i].tag === _syn.blocks[i].tag) { render(); return; }
        _snapshot(t('de_op_tag_b', 'cambia tipo di blocco'));
        _syn.blocks = next;
        _dirty = true; render();
    }

    function addBlock(i, tag) {
        _bMenu = -1;
        _snapshot(t('de_op_add_b', 'aggiungi blocco'));
        _syn.blocks = DE().insertBlock(_syn.blocks, i + 1, tag || 'p');
        _dirty = true; render();
        setTimeout(function () {
            const el = _host() && _host().querySelector('[data-b="' + (i + 1) + '"]');
            if (el) el.focus();
        }, 30);
    }
    async function delBlock(i) {
        if (!await _chiedi(t('de_del_b', 'Eliminare questo blocco di testo?'), t('de_del_ok', 'Elimina'))) return;
        _snapshot(t('de_op_del_b', 'elimina blocco'));
        _syn.blocks = DE().removeBlock(_syn.blocks, i);
        _dirty = true; render();
    }
    function moveBlock(i, dir) {
        _snapshot(t('de_op_move_b', 'sposta blocco'));
        _syn.blocks = DE().moveBlock(_syn.blocks, i, i + dir);
        _dirty = true; render();
    }

    // Stile inline: execCommand è l'unica via su contenteditable. Per grassetto/
    // corsivo/sottolineato serve styleWithCSS SPENTO (produce <b>/<i>/<u>); per il
    // colore ACCESO (produce <span style="color:…">). Il sanitizer del core tiene
    // entrambe le forme (e converte <font color> se il motore la produce).
    function fmt(cmd) {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) { toast(t('de_select_first', 'Seleziona prima il testo da formattare'), 'info'); return; }
        _snapshot(t('de_op_style', 'stile testo'));
        try {
            document.execCommand('styleWithCSS', false, false);
            document.execCommand(cmd, false, null);
        } catch (e) { /* motore senza execCommand */ }
        _syncFocusedBlock();
    }
    function applyColor(hex) {
        const col = DE().normColor(hex);
        if (!col) return;
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) { toast(t('de_select_first', 'Seleziona prima il testo da formattare'), 'info'); return; }
        _snapshot(t('de_op_color', 'colore testo'));
        try {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('foreColor', false, col);
        } catch (e) { /* motore senza execCommand */ }
        _syncFocusedBlock();
        const arr = DE().pushColorSlot(_slots(), col);
        _saveSlots(arr);
        _paintSlots(arr);
    }
    async function eyedropper() {
        if (typeof window.EyeDropper !== 'function') { toast(t('de_no_eyedropper', 'Pipetta non disponibile in questa finestra'), 'warning'); return; }
        try {
            const res = await new window.EyeDropper().open();
            if (res && res.sRGBHex) applyColor(res.sRGBHex);
        } catch (e) { /* annullata dall'utente */ }
    }
    // Dopo un execCommand il DOM è cambiato: riporta l'HTML nel modello.
    function _syncFocusedBlock() {
        const el = document.activeElement;
        if (!el || !el.hasAttribute || !el.hasAttribute('data-b')) return;
        _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML);
    }

    // ── salvataggio ─────────────────────────────────────────────────────────
    function save() {
        if (_kind === 'synthesis') return _saveSynthesis();
        if (_kind === 'nodesheet') return _saveNodeSheet();
        if (_kind === 'causal') return _saveCausal();
        if (_kind === 'openq') return _saveOpenq();
        return _saveQuiz();
    }

    /* Le domande aperte vivono NELL'ARCHIVIO (non in `studySets`): salvare
       vuol dire riscrivere quella voce, con dentro il foglio rigenerato dal
       builder — che è ciò che porta la sorgente aggiornata per la volta dopo.
       Il PDF nella cartella della mappa lo riscrive «Stampa», come per gli
       altri generi: qui non si tocca il disco. */
    async function _saveOpenq() {
        const store = window.MappAIStudyDocs;
        if (!store || !store.save) { toast(t('de_oq_no_store', 'Archivio dei documenti non disponibile.'), 'error'); return; }
        const s = _appState();
        const html = _openqHtml();
        try {
            /* ⚠️ NON si passa `id`. `saveDoc` deduplica per (kind|title|mapName) e
               in quel caso riusa da sé l'id della voce che sostituisce; passarlo
               a mano quando il TITOLO è cambiato produrrebbe invece due record
               con lo STESSO id — la chiave nuova non combacia, quindi la voce si
               aggiunge invece di sostituire, e `get(id)` diventa ambiguo.
               Il titolo cambiato si gestisce qui: si toglie la voce di prima,
               altrimenti resterebbe accanto alla nuova col nome vecchio. */
            const vecchia = _openDocId ? (store.get ? store.get(_openDocId) : null) : null;
            if (vecchia && String(vecchia.title || '') !== String(_doc.title || '') && store.remove) {
                store.remove(_openDocId);
            }
            _openDocId = store.save({
                kind: 'quizpaper', title: _doc.title, html: html,
                mapName: (s && s.rootNodeLabel) || ''
            }) || _openDocId;
        } catch (e) {
            toast(t('de_oq_save_ko', 'Salvataggio non riuscito') + ': ' + (e.message || e), 'error');
            return;
        }
        _dirty = false; _paintDirty();
        toast(t('de_saved', '✓ Documento salvato') + ' — ' + _doc.items.length + ' ' + t('de_questions', 'domande'), 'success');
    }
    function _openqHtml(includeAnswers) {
        const s = _appState();
        return window.buildOpenQuestionsHtml(
            { id: _doc.id, title: _doc.title, type: 'Domande aperte', items: _doc.items },
            { mapName: (s && s.rootNodeLabel) || '', includeBar: false, includeAnswers: includeAnswers !== false,
              font: _fontCorrente() });
    }

    /* ⚠️ In ELECTRON `confirm()` è un dialog NATIVO del main process e BLOCCA
       il renderer: l'app resta immobile finché non si risponde, e da CDP il
       dominio Page non lo vede nemmeno («No dialog is showing») — sembra un
       crash. Erano gli ultimi due pezzi fuori dal motore dei modali, ed erano
       proprio sulla strada di «Stampa» (che dall'9/8 passa dal salvataggio):
       in ELABORA v2, dove «Modifica» è a un clic, si incontravano subito.
       Ora la domanda è un modale del motore → `_saveQuiz` diventa ASINCRONA, e
       con essa `save()`. I due chiamanti la attendono già (`_salvaDoveVive` con
       `await`, la console con `Promise.resolve`); chi non l'aspetta ottiene una
       Promise ignorata, che è ciò che otteneva prima da una funzione void. */
    async function _chiedi(testo, conferma) {
        const M = window.MappAIModal;
        if (M && M.conferma) return await M.conferma({ testo: testo, conferma: conferma });
        return confirm(testo);   /* ripiego dove il motore non c'è (banchi, harness) */
    }

    /* ══ DOVE VIVE DAVVERO UN SET (13/8) ═════════════════════════════════════
       🐛 Difetto trovato da Giacomo usando l'app: un quiz creato a mano spariva
       dagli elenchi di ELABORA (e dal selettore delle live), mentre il suo PDF
       e la voce d'archivio restavano — quindi ricompariva in INSEGNA. Sembrava
       che si fosse spostato; in realtà non era mai stato scritto.
       Il set sta in `appState.db.studySets` e si salvava SOLO con
       `saveCurrentProject`. Ma una mappa aperta dal DISCO può non avere un
       progetto in localStorage: lì quel salvataggio non ha dove scrivere, e al
       ricaricamento il set non c'è più. Sul disco resta il file — che ELABORA
       non elenca fra le sorgenti, perché un PDF non è modificabile.
       La pipeline non aveva il problema perché chiude sempre con `saveVault`.
       Questa funzione fa le DUE scritture, ed è l'unica strada per entrambe. */
    function _persistiSet() {
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        var s = _appState();
        var vp = s && s.activeVaultPath;
        if (!vp || !window.electronAPI || !window.electronAPI.saveVault || !window.buildVaultMapData) return;
        try {
            window.electronAPI.saveVault({ folderPath: vp, mapData: window.buildVaultMapData() })
                .then(function () {
                    /* e lo si DICE: gli elenchi già aperti (ELABORA, INSEGNA)
                       mostrerebbero altrimenti quello che c'era prima — è il
                       motivo per cui un materiale nuovo «ci metteva molto ad
                       apparire»: non arrivava, arrivava al giro dopo. */
                    try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vp }); } catch (e) { }
                })
                .catch(function () { /* best-effort: il set è comunque in memoria */ });
        } catch (e) { /* idem */ }
    }

    async function _saveQuiz() {
        const s = _appState();
        // La mappa è cambiata sotto i piedi (cambio progetto in ELABORA): salvare
        // qui inietterebbe il quiz in un progetto che non è il suo.
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }

        const sets = (s.db.studySets = s.db.studySets || []);
        const idx = sets.findIndex(x => x.id === _srcSet.id);
        const updated = DE().applyToSet(_srcSet, _doc);
        updated.editedAt = Date.now();
        // Set sparito dalla mappa (eliminato altrove, o progetto ricaricato): meglio
        // dirlo che ricrearlo in silenzio dove non era.
        if (idx < 0) {
            if (!await _chiedi(t('de_set_gone', 'Questo set non è più nella mappa (eliminato o mappa ricaricata). Vuoi aggiungerlo di nuovo?'),
                t('de_set_gone_ok', 'Aggiungilo'))) return;
            sets.push(updated);
        } else {
            sets[idx] = updated;
        }
        _srcSet = updated;
        _persistiSet();
        try { if (typeof window.renderStudySets === 'function') window.renderStudySets(); } catch (e) { }
        _dirty = false; _paintDirty();
        toast(t('de_saved', '✓ Documento salvato') + ' — ' + _doc.items.length + ' ' +
            (_kind === 'flashcards' ? t('de_cards', 'carte') : t('de_questions', 'domande')), 'success');
        _archivePaper();
    }

    // Archivio documenti (INSEGNA → «Quiz cartacei»): il foglio stampabile viene
    // salvato come HTML, così è richiamabile per QR/stampa senza rigenerarlo.
    function _archivePaper() {
        try {
            if (!window.MappAIStudyDocs || _kind === 'synthesis') return;
            const s = _appState();
            const isFlash = _kind === 'flashcards';
            const html = isFlash
                ? window.buildFlashcardSetHtml(_srcSet, { includeBar: true })
                : window.buildQuizSetHtml(_srcSet, { includeBar: true });
            window.MappAIStudyDocs.save({
                kind: isFlash ? 'flashsheet' : 'quizpaper',
                // L'archivio deduplica per kind|titolo|mappa: due set diversi con lo
                // stesso titolo (MC e V/F dello stesso ramo) si sovrascriverebbero →
                // il tipo entra nel titolo quando non c'è già.
                title: _archiveTitle(),
                mapName: (s && s.rootNodeLabel) || '',
                // carte oltre soglia → badge «da rivedere» in INSEGNA
                overLimit: isFlash ? _overCards().length : 0,
                html: html
            });
        } catch (e) { console.warn('[DocEditor] archivio non aggiornato:', e); }
    }
    function _archiveTitle() {
        const base = _doc.title || (_srcSet && _srcSet.title) || t('de_quiz', 'Quiz');
        const type = (_srcSet && _srcSet.type) || _doc.type || '';
        if (!type || base.toLowerCase().indexOf(type.toLowerCase()) >= 0) return base;
        return base + ' · ' + type;
    }

    function _saveSynthesis() {
        const BS = window.MappAIBranchSynthesis;
        if (!BS) return;
        // Documento che viene da un file del vault: si riscrive QUEL file.
        // ⚠️ Qui la guardia `_sameMap()` non si applica ed è giusto così: la
        // destinazione è scritta nel documento (`fromVault`), non dedotta dalla
        // mappa aperta — cambiare progetto in ELABORA non può farla sbagliare.
        if (_syn && _syn.data && _syn.data.fromVault) return _saveSynthesisFile();
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }
        // Zero blocchi = documento svuotato: salvarlo farebbe ricomparire in stampa
        // il testo originale dell'AI (il builder torna alla sorgente), senza dirlo.
        if (!_syn.blocks.filter(b => b.tag !== 'raw').length) {
            toast(t('de_synth_no_blocks', 'La sintesi non ha più testo: aggiungi almeno un paragrafo prima di salvare.'), 'warning');
            return;
        }
        const data = Object.assign({}, _syn.data, { editedBlocks: JSON.parse(JSON.stringify(_syn.blocks)) });
        // L'audio con voce naturale è allineato ai BLOCCHI: se il testo letto cambia
        // i cue non corrispondono più → si invalida e va rigenerato.
        if (DE().audioStale(_syn.base, _syn.blocks)) {
            data._audioBlob = null; data._audioUrl = null; data._cues = null;
        }
        if (_syn.id === 'current' && BS.setData) BS.setData(data);
        _syn.data = data;
        _syn.base = JSON.parse(JSON.stringify(_syn.blocks));
        try {
            if (_syn.archiveId && window.MappAIStudyDocs) {
                // Documento riaperto dall'archivio: si aggiorna QUELLA voce (stesso
                // id e stesso titolo → stessa chiave di dedup).
                window.MappAIStudyDocs.save({
                    id: _syn.archiveId, kind: 'synthesis',
                    title: _syn.archiveTitle || data.branchLabel || t('de_synth', 'Sintesi'),
                    mapName: data.mapName || '', html: BS.buildPrintHtml(data)
                });
            } else if (BS.archiveDoc) {
                BS.archiveDoc(data);   // stessa chiave dell'auto-salvataggio: aggiorna, non duplica
            }
        } catch (e) { console.warn('[DocEditor] archivio sintesi:', e); }
        _dirty = false; _paintDirty();
        toast(t('de_saved_synth', '✓ Sintesi salvata — il testo rivisto vale per stampa, PDF e condivisione'), 'success');
    }

    /* Riscrive il file da cui il documento è stato aperto — stesso percorso,
       stesso nome. Nessun suffisso «(rivista)»: quel nome era il ripiego di
       quando l'editor non sapeva da dove veniva il documento, e lasciava due
       sintesi divergenti nella stessa cartella. Il file che si è aperto è il
       file che si salva; i nomi dei materiali sono un lavoro a sé. */
    /* Il foglio della sintesi pronto per il disco, con la voce naturale se il
       testo non è cambiato. Uno solo, per «Salva» e per «Stampa»: due copie di
       questa logica divergerebbero al primo ritocco, e a divergere sarebbe
       proprio la sorte dell'audio.
       ⚠️ La voce naturale è agganciata ai BLOCCHI: se il testo letto cambia, i
       cue non corrispondono più → si lascia cadere e lo si dice, invece di
       riscrivere un karaoke fuori sincrono.
       → { data, text, audioPerso } */
    function _synFoglio() {
        const BS = window.MappAIBranchSynthesis;
        const data = Object.assign({}, _syn.data, { editedBlocks: JSON.parse(JSON.stringify(_syn.blocks)) });
        const stale = DE().audioStale(_syn.base, _syn.blocks);
        if (stale) { data._audioBlob = null; data._audioUrl = null; data._cues = null; }
        const audio = (!stale && _syn.vaultAudio) ? _syn.vaultAudio : null;
        return {
            data: data,
            /* il carattere del documento viaggia con la resa (18/8) */
            text: BS.buildPrintHtml(data, Object.assign({ font: _fontCorrente() }, audio || {})),
            audioPerso: !!(_syn.vaultAudio && !audio)
        };
    }

    /** Il documento aperto ha ancora del testo? (svuotarlo e salvare farebbe
        ricomparire in stampa il testo originale dell'AI, senza dirlo) */
    function _synHaTesto() {
        if (_syn.blocks.filter(b => b.tag !== 'raw').length) return true;
        toast(t('de_synth_no_blocks', 'La sintesi non ha più testo: aggiungi almeno un paragrafo prima di salvare.'), 'warning');
        return false;
    }

    async function _saveSynthesisFile() {
        const BS = window.MappAIBranchSynthesis;
        const fv = _syn && _syn.data && _syn.data.fromVault;
        if (!BS || !fv) return;
        if (!window.electronAPI || !window.electronAPI.saveVaultFile) {
            toast(t('de_need_app', 'Richiede l\'app desktop.'), 'warning'); return;
        }
        if (!_synHaTesto()) return;
        const foglio = _synFoglio();
        const data = foglio.data;
        try {
            const out = await window.electronAPI.saveVaultFile({
                vaultPath: fv.vaultPath, relPath: fv.relPath, text: foglio.text
            });
            if (!out || !out.ok) {
                toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + (out && out.error ? ': ' + out.error : ''), 'error');
                return;
            }
            // La voce c'era ma il testo è cambiato: è caduta, e va detto — non è
            // un dettaglio interno, è un file in meno da dare agli allievi.
            const audioPerso = foglio.audioPerso;
            _syn.data = data;
            _syn.base = JSON.parse(JSON.stringify(_syn.blocks));
            if (audioPerso) _syn.vaultAudio = null;   // caduta una volta, non riappare al salvataggio dopo
            // Chi scrive su disco lo DICE: senza questo annuncio gli elenchi già
            // aperti continuerebbero a mostrare la data di scrittura vecchia.
            try {
                if (window.MappAIVaults) window.MappAIVaults.segnala('doc-salvato', { vaultPath: fv.vaultPath, relPath: fv.relPath });
            } catch (e) { /* canale assente: il salvataggio è comunque avvenuto */ }
            _dirty = false; _paintDirty();
            toast(audioPerso
                ? t('de_saved_synth_file_audio', '✓ Sintesi salvata — il testo è cambiato: la voce naturale va rigenerata')
                : t('de_saved_synth_file', '✓ Sintesi salvata nella cartella della mappa'), 'success');
        } catch (e) {
            toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + ': ' + e.message, 'error');
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // IL NOME DEL FILE — si chiede, non si indovina
    // ══════════════════════════════════════════════════════════════════════
    // Fino a ieri «Stampa» apriva il foglio e basta, e «Nel vault» scriveva un
    // file con un nome deciso dal codice, sovrascrivendo in silenzio quello che
    // c'era. Da oggi il gesto è uno solo: si dà un nome, si scrive, si stampa.
    // La parte fissa (tipo di materiale, mappa, marcatore della taratura) la
    // mette `buildFileName`, unica fonte della convenzione — comporre nomi a
    // mano qui spegnerebbe il riconoscimento per prefisso su cui si reggono il
    // raggruppamento per genere e il bottone «Modifica» delle colonne.

    function PC() { return window.MappAIPipelineCore; }

    /** Nome della mappa a cui appartiene il documento aperto. */
    function _mapName() {
        if (_kind === 'synthesis' && _syn && _syn.data && _syn.data.mapName) return _syn.data.mapName;
        if (_kind === 'causal' && CCU()) { try { return CCU().mapName(); } catch (e) { /* ripiego sotto */ } }
        const s = _appState();
        return (s && s.rootNodeLabel) || '';
    }

    /** Il file da cui il documento è stato aperto (solo la sintesi ce l'ha). */
    function _origine() {
        return (_kind === 'synthesis' && _syn && _syn.data && _syn.data.fromVault) ? _syn.data.fromVault : null;
    }
    /* La taratura la DICHIARA il nome del file di partenza, non un'ipotesi: se
       si riapre «Sintesi-Il Clima -VERDE.html», il marcatore resta dov'era. Per
       i documenti che nascono qui non c'è taratura da dichiarare. */
    function _tarato() {
        const o = _origine();
        return !!(o && / -VERDE\.[A-Za-z0-9]+$/.test(o.relPath));
    }

    /* ── 🐛 IL NOME DELLA COPIA DEVE ENTRARE NEL NOME DEL FILE (11/8/26) ─────
       La copia LEGGEVA il suo file ma ne SCRIVEVA un altro: il nome si componeva
       da genere + mappa e basta, quindi stampando «Scelta Multipla - verifica
       ottobre» usciva «Quiz-MC-<Mappa>.pdf» — cioè SOPRA il file
       dell'originale, in silenzio e senza modo di accorgersene se non aprendo
       la cartella. È il guasto che i test di `mappai-clona-core.js` dichiarano
       («un clone senza nome scriverebbe sopra il file dell'originale»): la
       regola c'era, questo lato non la usava.

       Dove sta il nome della copia dipende dal genere, come tutto il resto del
       clone: nel SET per i quiz, nella variabile del documento per il foglio dei
       nodi e la catena, nel TITOLO per le domande aperte (che vengono
       dall'archivio). La sintesi non compare: quella riapre il suo file e
       continua a scrivere lì (`_origine()`), quindi il nome ce l'ha già. */
    function _cloneCorrente() {
        try {
            if (_kind === 'nodesheet' || _kind === 'causal') return _clone || '';
            if (_kind === 'openq') {
                var C = _CLN();
                var base = C ? C.etichetta('Domande aperte', '') : 'Domande Aperte';
                var tt = String((_doc && _doc.title) || '').trim();
                return tt.indexOf(base + ' - ') === 0 ? tt.slice(base.length + 3).trim() : '';
            }
            return (_srcSet && _srcSet.clone) || '';
        } catch (e) { return ''; }
    }

    /** Genere del materiale e suo dettaglio, nella lingua di `buildFileName`. */
    function _genereFile() {
        if (_kind === 'nodesheet') {
            // Ogni card ha il SUO tipo di contenuto: se sono tutte uguali il
            // dettaglio è quello, altrimenti è un foglio misto e lo dice.
            const lay = (_sheet.cards || []).map(c => c.layout);
            const uno = lay.length && lay.every(x => x === lay[0]);
            return { kind: 'nodesheet', dettaglio: uno ? lay[0] : 'misto' };
        }
        if (_kind === 'causal') return { kind: 'causal', dettaglio: '' };
        if (_kind === 'synthesis') {
            // Il ramo distingue due sintesi della stessa mappa. Per un documento
            // che viene da un file il ramo è già nel nome del file: ripeterlo
            // qui lo scriverebbe due volte.
            const lab = (!_origine() && !_syn.data.whole) ? String(_syn.data.branchLabel || '') : '';
            return { kind: 'synthesis', dettaglio: lab };
        }
        if (_kind === 'flashcards') return { kind: 'flashcards', dettaglio: '' };
        if (_kind === 'openq') return { kind: 'open_questions', dettaglio: '' };
        return { kind: (_doc && _doc.quizType === 'tf') ? 'quiz_tf' : 'quiz_mc', dettaglio: '' };
    }

    /* La parte fissa del nome (fino a dove entra quella scelta dal docente) e la
       coda (marcatore della taratura + estensione).
       ⚠️ Per un documento che viene da un file la parte fissa È quella del file:
       si riapre «Sintesi-Il Clima -VERDE.html» e si continua a scrivere lì.
       Ricostruire il nome da capo produrrebbe una seconda copia quasi uguale
       accanto alla prima — ed è così che nascono le cartelle in cui non si
       capisce più quale sia la sintesi buona. */
    function _pezziNome() {
        const o = _origine();
        let pieno;
        if (o) pieno = o.relPath.split('/').pop();
        else {
            const g = _genereFile();
            // Senza il modulo della convenzione si ripiega su un nome onesto ma
            // muto: meglio di un errore, e non capita nell'app (pipeline-core è
            // caricato prima di questo file).
            pieno = PC()
                ? PC().buildFileName(g.kind, null, _tarato(),
                    { mappa: _mapName(), dettaglio: g.dettaglio, nome: _cloneCorrente() })
                : (g.kind + '-' + (_mapName() || 'mappa') + (g.kind === 'synthesis' ? '.html' : '.pdf'));
        }
        const m = /^(.*?)( -VERDE)?(\.[A-Za-z0-9]+)$/.exec(pieno);
        return m
            ? { base: m[1], coda: (m[2] || '') + m[3] }
            : { base: pieno, coda: '' };
    }

    /* Stessa ripulitura di `buildFileName` (che passa da `FilesCore.safeName`):
       la parte scritta dal docente finisce in un nome di file, quindi i
       caratteri che il filesystem rifiuta vanno tolti anche qui. */
    function _safeParte(s) {
        return String(s == null ? '' : s)
            .replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()
            .replace(/[. ]+$/, '');
    }
    function _componiNome(nome) {
        const p = _pezziNome();
        const n = _safeParte(nome);
        return p.base + (n ? '-' + n : '') + p.coda;
    }

    /* Un nome che coincide con il file da cui il documento viene NON è una
       collisione: è lo stesso documento salvato dov'era. Chiederlo ogni volta
       sarebbe una domanda a cui la risposta è sempre la stessa. */
    function _eOrigine(fileName) {
        const o = _origine();
        return !!(o && String(o.relPath).split('/').pop().toLowerCase() === String(fileName).toLowerCase());
    }
    function _collide(fileName, esistenti) {
        if (_eOrigine(fileName)) return false;
        const n = String(fileName).toLowerCase();
        return (esistenti || []).some(x => String(x).toLowerCase() === n);
    }

    /** I file già presenti in `Materiale Studio/`. Elenco vuoto = non lo sappiamo. */
    async function _materialiEsistenti(vaultPath) {
        try {
            const api = window.electronAPI;
            if (!api || !api.vaultMaterialsList) return [];
            const res = await api.vaultMaterialsList({ vaultPath: vaultPath });
            return (res && res.ok && Array.isArray(res.files)) ? res.files.map(f => f.name) : [];
        } catch (e) { return []; }
    }

    /* Chiede la parte di nome scelta dal docente. Il nome che ne risulta si vede
       mentre si scrive — un campo che dice solo «aggiungi un nome» costringe a
       immaginarsi il file che ne esce.
       → Promise<string|null> (null = ha annullato: non si scrive e non si stampa) */
    function _chiediNomeFile(esistenti) {
        const MM = window.MappAIModal;
        const ph = t('de_nome_ph', 'ripasso finale, verifica 2B, …');
        if (!MM || !MM.open) {
            const v = window.prompt(t('de_nome_titolo', 'Che nome dai a questo materiale?') +
                '\n' + _componiNome(''), '');
            return Promise.resolve(v === null ? null : v);
        }
        return MM.open({
            titolo: t('de_nome_titolo', 'Che nome dai a questo materiale?'),
            icona: 'file-pen',
            taglia: 's',
            sezioni: [{
                testo: t('de_nome_testo', 'La prima parte del nome la mette MappAI: dice che materiale è e di quale mappa. Tu aggiungi come lo riconoscerai — puoi anche lasciare vuoto.'),
                campi: [{ id: 'nome', tipo: 'testo', etichetta: ph, valore: '' }]
            }],
            azioni: [
                { id: 'no', etichetta: t('de_cancel', 'Annulla') },
                { id: 'si', etichetta: t('de_nome_ok', 'Salva e stampa'), ruolo: 'primario' }
            ],
            /* Il nome finale si aggiorna sotto le dita. `suApertura` e non
               `__campo`: quell'evento nasce da `change`, che su un campo di testo
               scatta al BLUR — e il blur lo produce il clic sul bottone, che
               ridisegnerebbe il modale sotto il dito prima che il clic arrivi. */
            suApertura: function (box) {
                const inp = box.querySelector('#mmf-nome');
                if (!inp) return;
                const out = document.createElement('span');
                out.className = 'mm-hint de-nome-out';
                const dipingi = function () {
                    const n = _componiNome(inp.value);
                    const gia = _collide(n, esistenti);
                    out.textContent = n + (gia ? '  · ' + t('de_nome_gia', 'un file con questo nome c\'è già') : '');
                    out.style.color = gia ? '#b45309' : '';
                };
                inp.addEventListener('input', dipingi);
                dipingi();
                (inp.closest('.mm-campo-riga') || inp.parentNode).appendChild(out);
            }
        }).then(function (r) { return (r && r.azione === 'si') ? String(r.valori.nome || '') : null; });
    }

    /* Il nome c'è già. Si DICE e si lascia scegliere — decidere al posto suo
       vorrebbe dire o cancellare un file che non si sapeva ci fosse, o
       riempire la cartella di « · 02» che nessuno ha chiesto.
       → Promise<string|null>: il nome con cui scrivere, oppure null (rinuncia). */
    async function _risolviCollisione(fileName, esistenti) {
        const alt = PC() ? PC().nomeLibero(fileName, esistenti) : null;
        const MM = window.MappAIModal;
        if (!MM || !MM.open) {
            if (confirm(t('de_coll_confirm', 'Un file con questo nome c\'è già. Vuoi sovrascriverlo?') + '\n\n' + fileName)) return fileName;
            return alt || null;
        }
        const azioni = [{ id: 'no', etichetta: t('de_cancel', 'Annulla') }];
        if (alt) azioni.push({ id: 'accanto', etichetta: t('de_coll_accanto', 'Salva accanto'), ruolo: 'primario' });
        azioni.push({ id: 'sovra', etichetta: t('de_coll_sovra', 'Sovrascrivi'), ruolo: 'distruttivo' });
        const r = await MM.open({
            titolo: t('de_coll_titolo', 'Un file con questo nome c\'è già'),
            icona: 'alert-triangle',
            taglia: 's',
            /* Senza l'alternativa l'unica azione affermativa è quella che
               cancella un file: Invio non deve poterla scegliere per inerzia.
               Con l'alternativa il primario è «Salva accanto», ed è giusto che
               Invio prenda la strada che non perde niente. */
            invio: !!alt,
            sezioni: [{
                testo: alt
                    ? t('de_coll_testo', '«{n}» è già nella cartella della mappa. Posso sovrascriverlo — quello che c\'è ora si perde — oppure salvare accanto come «{a}».')
                        .replace('{n}', fileName).replace('{a}', alt)
                    : t('de_coll_testo_pieno', '«{n}» è già nella cartella della mappa, e ci sono già troppe varianti dello stesso nome per aggiungerne un\'altra. Posso solo sovrascriverlo, oppure lasciar perdere e dargli un altro nome.')
                        .replace('{n}', fileName)
            }],
            azioni: azioni
        });
        const a = r && r.azione;
        if (a === 'sovra') return fileName;
        if (a === 'accanto') return alt;
        return null;
    }

    /* Che cosa finisce su disco per il documento aperto, dato il nome del file.
       → { vaultPath, relPath, text|base64 } oppure null (con l'avviso già dato).
       ⚠️ Il quiz esce in PDF, ma se il motore headless non c'è si ripiega
       sull'HTML: l'estensione cambia QUI, quindi la collisione va controllata
       dopo — sul nome che finisce davvero sul disco. */
    async function _payloadFile(vaultPath, fileName) {
        const rel = 'Materiale Studio/' + fileName;
        if (_kind === 'nodesheet') {
            const res = await window.printAllNodeLabels(_nsPrintOpts({ toDisk: { vaultPath: vaultPath } }));
            if (!res || !res.ok || !res.base64) { toast(t('de_ns_pdf_ko', 'PDF del foglio nodi non generato.'), 'error'); return null; }
            return { vaultPath: vaultPath, relPath: rel, base64: res.base64 };
        }
        if (_kind === 'causal') {
            /* La convenzione dice `.pdf` per la catena, e il file deve essere
               quello che l'estensione promette: PDF dallo STESSO html del
               documento stampabile, con la stessa impaginazione della pipeline
               (A4 verticale — è una colonna di righe «causa → effetto», non una
               tabella larga). Senza il motore headless si ripiega sull'HTML,
               cambiando anche l'estensione. */
            const html = _ccHtml();
            if (window.electronAPI.htmlToPdf) {
                const res = await window.electronAPI.htmlToPdf({ html: html, options: { pageSize: 'A4', landscape: false } });
                if (res && res.ok && res.base64) return { vaultPath: vaultPath, relPath: rel, base64: res.base64 };
            }
            return { vaultPath: vaultPath, relPath: rel.replace(/\.pdf$/i, '.html'), text: html };
        }
        if (_kind === 'synthesis') {
            if (!_synHaTesto()) return null;
            // `foglio` viaggia a parte e NON entra nella richiesta IPC: serve
            // dopo la scrittura, per la contabilità della voce naturale.
            const foglio = _synFoglio();
            return { vaultPath: vaultPath, relPath: rel, text: foglio.text, foglio: foglio };
        }
        if (_kind === 'openq') {
            /* Come i quiz: il file che resta nella cartella è la copia del
               DOCENTE, con le tracce. La copia per gli allievi si ottiene da
               «Stampa → Senza tracce». */
            const htmlOq = _openqHtml(true);
            if (window.electronAPI.htmlToPdf) {
                const r = await window.electronAPI.htmlToPdf({ html: htmlOq, options: { landscape: false } });
                if (r && r.ok && r.base64) return { vaultPath: vaultPath, relPath: rel, base64: r.base64 };
            }
            return { vaultPath: vaultPath, relPath: rel.replace(/\.pdf$/i, '.html'), text: htmlOq };
        }
        /* Quiz e flashcard: il PDF esce CON le soluzioni (Giacomo, 11/8).
           Prima usciva senza — «la copia per gli allievi» — e c'erano due
           produttori in disaccordo sullo stesso file: la pipeline lo scrive col
           foglio soluzioni da sempre (`buildQuizSetHtml` senza `includeAnswers`
           vale `true`), l'editor senza. Stesso nome, stessa cartella, contenuto
           diverso a seconda di chi l'aveva scritto.
           ⚠️ Il costo, dichiarato: un PDF non si ricostruisce, quindi dal file
           del vault non si ricava più la copia per gli allievi — in INSEGNA
           `printQuizPaper` su un PDF lo apre e basta. Quella copia resta
           raggiungibile dalle due strade che partono dal SET, che è la sorgente
           vera: «Stampa» qui nell'editor (modale «senza soluzioni») e la
           condivisione QR, che agli allievi manda sempre la versione muta. */
        const html = _quizHtml(true, false);
        if (window.electronAPI.htmlToPdf) {
            // Il foglio flashcard è orizzontale: senza questo flag printToPDF lo
            // impagina in verticale e le carte escono tagliate.
            const res = await window.electronAPI.htmlToPdf({ html: html, options: { landscape: _flashLandscape() } });
            if (res && res.ok && res.base64) return { vaultPath: vaultPath, relPath: rel, base64: res.base64 };
        }
        return { vaultPath: vaultPath, relPath: rel.replace(/\.pdf$/i, '.html'), text: html };
    }

    /* Il documento si salva DOVE VIVE: quiz e flashcard nei set di studio del
       progetto, il foglio dei nodi e la catena nel progetto, la sintesi in
       memoria nell'archivio. Il file in «Materiale Studio» è un'altra cosa —
       è la copia che si stampa e si consegna — e scrivere solo quello lascerebbe
       il lavoro fuori dal progetto: riaprendo la mappa le correzioni non ci
       sarebbero più.
       ⚠️ Unica eccezione: la sintesi aperta DA un file. Lì il posto in cui vive
       è il file stesso, e chiamare anche `save()` lo scriverebbe due volte — la
       seconda con un altro nome.
       → false = il salvataggio ha rinunciato, e l'ha già detto. */
    async function _salvaDoveVive() {
        if (_origine()) return true;
        try { await save(); }
        catch (e) {
            toast(t('de_exit_ko', 'Salvataggio non riuscito: resto nel documento.') +
                (e && e.message ? ' (' + e.message + ')' : ''), 'error');
            return false;
        }
        return !_dirty;
    }

    /* Chiede il nome, salva il documento, scrive il file e lo annuncia.
       → Promise<boolean|null>: true = scritto · false = non si è potuto
       scrivere il file (l'utente lo sa, e si stampa lo stesso) · null = si è
       rinunciato, quindi non si stampa nemmeno. */
    async function _salvaConNome() {
        const s = _appState();
        const vaultPath = (_origine() && _origine().vaultPath) || (s && s.activeVaultPath);
        const puoScrivere = !!(window.electronAPI && window.electronAPI.saveVaultFile && vaultPath);
        if (!puoScrivere) {
            // Senza cartella (o fuori dall'app desktop) il file non si può
            // scrivere, ma il documento sì: quello va salvato comunque.
            toast(window.electronAPI && window.electronAPI.saveVaultFile
                ? t('de_print_no_vault', 'Questa mappa non ha ancora una cartella: stampo senza salvare il file.')
                : t('de_print_no_app', 'Fuori dall\'app desktop non posso salvare il file: stampo e basta.'), 'info');
            return (await _salvaDoveVive()) ? false : null;
        }
        const esistenti = await _materialiEsistenti(vaultPath);
        /* 🐛 13/8: il nome si chiedeva SEMPRE, anche a chi lo aveva appena dato
           creando il documento — «Salva ed Esci» lo richiedeva daccapo, e
           lasciandolo vuoto il file perdeva il nome scelto un minuto prima.
           Se il documento ne ha già uno, quello vale: si chiede solo a chi non
           l'ha ancora scelto. Il nome si cambia rinominando il documento, non
           salvandolo. */
        // Il nome si chiede PRIMA di scrivere qualunque cosa: annullarlo deve
        // poter voler dire «lascia tutto com'era».
        /* ⚠️ Quando il nome c'è già si passa la stringa VUOTA, non il nome: la
           parte fissa che `_pezziNome` compone lo contiene di suo (arriva da
           `_cloneCorrente`), e ripeterlo qui darebbe
           «Quiz-MC-Mappa-test-test.pdf». */
        const scelto = _cloneCorrente() ? '' : await _chiediNomeFile(esistenti);
        if (scelto === null) return null;                    // annullato: niente stampa
        if (!await _salvaDoveVive()) return null;            // ha rinunciato: niente stampa

        const payload = await _payloadFile(vaultPath, _componiNome(scelto));
        if (!payload) return false;

        // La collisione si controlla sul nome VERO (l'estensione può essere
        // cambiata costruendo il payload).
        let nomeVero = payload.relPath.split('/').pop();
        if (_collide(nomeVero, esistenti)) {
            const deciso = await _risolviCollisione(nomeVero, esistenti);
            if (!deciso) return null;                        // rinuncia: niente stampa
            nomeVero = deciso;
            payload.relPath = 'Materiale Studio/' + deciso;
        }

        try {
            const out = await window.electronAPI.saveVaultFile({
                vaultPath: payload.vaultPath, relPath: payload.relPath,
                text: payload.text, base64: payload.base64
            });
            if (!out || !out.ok) {
                toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + (out && out.error ? ': ' + out.error : ''), 'error');
                return false;
            }
        } catch (e) {
            toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + ': ' + e.message, 'error');
            return false;
        }

        // Contabilità della sintesi: da qui in poi il documento vive in QUESTO
        // file (un salvataggio successivo non deve tornare su quello di prima),
        // e se la voce naturale è caduta si dice — è un file in meno da dare
        // agli allievi, non un dettaglio interno.
        let audioPerso = false;
        if (payload.foglio) {
            audioPerso = payload.foglio.audioPerso;
            _syn.data = Object.assign({}, payload.foglio.data, {
                fromVault: { vaultPath: vaultPath, relPath: payload.relPath }
            });
            _syn.base = JSON.parse(JSON.stringify(_syn.blocks));
            if (audioPerso) _syn.vaultAudio = null;
        }
        // Chi scrive su disco lo DICE, o gli elenchi già aperti continuerebbero
        // a mostrare quello che c'era prima.
        try {
            if (window.MappAIVaults) window.MappAIVaults.segnala('file-scritto', { vaultPath: vaultPath, relPath: payload.relPath });
        } catch (e) { /* canale assente: la scrittura è comunque avvenuta */ }
        _dirty = false; _paintDirty();
        toast(t('de_print_saved', '✓ {n} salvato in Materiale Studio').replace('{n}', nomeVero) +
            (audioPerso ? ' — ' + t('de_print_audio', 'il testo è cambiato: la voce naturale va rigenerata') : ''), 'success');
        /* Ritorna il NOME con cui il file è stato scritto, non `true`: chi
           stampa deve poterlo riusare. Foglio dei nodi e flashcard escono da
           jsPDF, che apre il dialogo di salvataggio del sistema con un nome
           SUO — e il docente si vedeva proposta una cosa diversa da quella che
           aveva appena scelto. È una stringa, quindi resta vera per i due
           chiamanti che guardano solo `=== null`. */
        return nomeVero;
    }

    // ── uscite: stampa / esporta ────────────────────────────────────────────
    // includeBar:false = niente barra «Stampa/Chiudi» in cima: serve per il PDF
    // (la barra è no-print a schermo, ma nel PDF via printToPDF resterebbe).
    function _quizHtml(includeAnswers, includeBar) {
        const set = DE().applyToSet(_srcSet || { id: _doc.id, title: _doc.title }, _doc);
        /* `font` viaggia col documento fino alla RESA: il foglio stampato e il
           PDF escono nel carattere scelto qui, non in quello dell'app. */
        const opts = { includeAnswers: includeAnswers !== false, includeBar: includeBar !== false,
                       font: _fontCorrente() };
        return (_kind === 'flashcards')
            ? window.buildFlashcardSetHtml(set, opts)
            : window.buildQuizSetHtml(set, opts);
    }

    /* «Stampa» chiede il nome, salva e POI stampa (Giacomo, 9/8). Prima erano
       due gesti — «Nel vault» e «Stampa» — e nessuno dei due diceva che il file
       stava per prendere un nome deciso dal codice e sovrascrivere quello che
       c'era. Su un documento non modificato non si chiede niente: il file
       esiste già o la stampa è quella effimera di sempre. */
    async function print() {
        /* 13/8: stampare non scrive più niente nella cartella — la copia è
           effimera, come la stampa di una pagina qualunque. Il file lo fa
           «Crea PDF», che è un gesto dichiarato.
           I problemi del documento si contestano QUI, perché è qui che finisce
           su carta: salvando invece no, un documento a metà è normale. */
        if (!await _problemiAccettati()) return;
        /* Il nome del file proposto dal dialogo di sistema (foglio nodi e
           flashcard escono da jsPDF) resta quello canonico: `_stampaOra` lo
           compone da sé quando non gliene passiamo uno. */
        return _stampaOra(null);
    }

    /* I problemi del documento, chiesti una volta sola e nel posto giusto.
       ⚠️ Un documento MAI salvato non si contesta: appena creato è vuoto per
       definizione, e la domanda avrebbe una risposta sola. */
    async function _problemiAccettati() {
        let problemi = [];
        try {
            if (_kind === 'openq') problemi = DE().validateOpenDoc(_doc) || [];
            else if (_doc) problemi = DE().validateDoc(_doc) || [];
        } catch (e) { problemi = []; }
        if (!problemi.length) return true;
        return await _chiedi(
            t('de_problems', 'Il documento ha dei problemi:') + '\n\n' +
            problemi.slice(0, 6).map(p => '• ' + p.msg).join('\n') +
            (problemi.length > 6 ? '\n…' : '') + '\n\n' + t('de_print_anyway', 'Stampare comunque?'),
            t('de_print_anyway_ok', 'Stampa comunque'));
    }

    /* `nome` = come si chiama il file appena scritto in `Materiale Studio/`.
       Serve solo ai due generi che escono da jsPDF (foglio dei nodi e
       flashcard): lì «stampare» apre il dialogo di salvataggio del sistema, e
       senza questo si proponeva un nome inventato dal motore di stampa invece
       di quello scelto dal docente. Quiz, sintesi e catena aprono una finestra:
       non c'è nessun nome file di mezzo. */
    function _stampaOra(nome) {
        /* 🐛 12/8/26 — SENZA MODIFICHE IN SOSPESO NON SI CHIEDE NIENTE, e fin qui
           è giusto: il file esiste già. Ma allora `nome` resta vuoto, e i due
           generi che passano da jsPDF ripiegavano sul nome che il motore di
           stampa si inventa — «Foglio-nodi-<Mappa> (rivisto).pdf» — che non sa
           né della COPIA né del dettaglio, quindi propone un file diverso da
           quello che sta nella cartella. È il gemello del difetto chiuso
           l'11/8: là il ramo «salva», qui il ramo «stampa e basta».
           Il nome canonico lo sa già `_componiNome`, che passa da
           `buildFileName` con il nome della copia (`_cloneCorrente`). */
        if (!nome && (_kind === 'nodesheet' || _kind === 'flashcards')) {
            try { nome = _componiNome(''); } catch (e) { /* ripiego del motore */ }
        }
        if (_kind === 'nodesheet') return _printNodeSheet(nome);
        if (_kind === 'openq') return openOpenqModal();
        // La catena ha una resa sola: il documento vero, con modalità esercizio
        // e stampa dentro. Aprirlo archivia anche la versione mostrata.
        if (_kind === 'causal') return CCU().openDoc(_ccChains());
        if (_kind === 'synthesis') {
            const data = Object.assign({}, _syn.data, { editedBlocks: _syn.blocks });
            const html = window.MappAIBranchSynthesis.buildPrintHtml(data);
            return _openPrintable(html);
        }
        if (_kind === 'flashcards') return openFlashModal(nome);
        openAnswersModal();
    }

    /* ── LA CORNICE CONDIVISA nell'ANTEPRIMA (mappai-doc-head.js, 11/8/26) ──
       L'anteprima dell'editor è un'imitazione del foglio stampato: se la testata
       cambia di là e non di qua, l'editor mostra un documento che non esiste.
       Qui si prendono le REGOLE (così i chip sono gli stessi pixel) e i due chip
       di CONTESTO. Il titolo resta scritto dall'editor: è modificabile, e
       `testata()` produce markup fermo.
       Fuori: il foglio dei NODI e le FLASHCARD, che restano com'erano. */
    function _deDH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
    function _deCornice() {
        const DH = _deDH();
        return DH ? DH.stile({ accento: '#4f46e5', pagina: false }) : '';
    }
    function _deChip() {
        const DH = _deDH();
        if (!DH) return '';
        const c = DH.contestoAttivo();
        if (!c.classe && !c.materia) return '';
        return '<div class="mm-dh__r">' +
            (c.classe ? '<span class="mm-dh__c mm-dh__c--cls">' + DH.esc(c.classe) + '</span>' : '') +
            (c.materia ? '<span class="mm-dh__c mm-dh__c--mat">' + DH.esc(c.materia) + '</span>' : '') +
            '</div>';
    }

    function _openPrintable(html) {
        if (window.MappAIStudyExport && window.MappAIStudyExport.openPrintable) {
            return window.MappAIStudyExport.openPrintable(html, {});
        }
        const w = window.open('', '_blank');
        if (!w) { toast(t('de_popup', 'Popup bloccato'), 'warning'); return; }
        w.document.write(html); w.document.close();
    }

    // Modale «con o senza soluzioni» (stesso pattern usato da INSEGNA).
    function openAnswersModal() {
        _modal(t('de_print_quiz', 'Stampa il quiz'), t('de_print_quiz_sub', 'Il foglio soluzioni va in una pagina a parte, in coda.'),
            '<label class="de-radio"><input type="radio" name="de-ans" value="1" checked><span><b>' +
            esc(t('de_with_answers', 'Con soluzioni')) + '</b><small>' + esc(t('de_with_answers_d', 'Copia del docente: domande + foglio soluzioni.')) + '</small></span></label>' +
            '<label class="de-radio"><input type="radio" name="de-ans" value="0"><span><b>' +
            esc(t('de_no_answers', 'Senza soluzioni')) + '</b><small>' + esc(t('de_no_answers_d', 'Copia per gli allievi: solo le domande.')) + '</small></span></label>',
            function (root) {
                const withAns = root.querySelector('input[name="de-ans"]:checked').value === '1';
                _openPrintable(_quizHtml(withAns));
            });
    }

    /* Le due copie del foglio di domande aperte: quella del docente porta le
       TRACCE di correzione in coda, quella per gli allievi no — ed è la stessa
       scelta del quiz, con le stesse parole. */
    function openOpenqModal() {
        _modal(t('de_print_oq', 'Stampa le domande aperte'), t('de_print_oq_sub', 'Le tracce di correzione vanno in una pagina a parte, in coda.'),
            '<label class="de-radio"><input type="radio" name="de-oq" value="1" checked><span><b>' +
            esc(t('de_with_guides', 'Con le tracce')) + '</b><small>' + esc(t('de_with_guides_d', 'Copia del docente: domande + tracce di correzione.')) + '</small></span></label>' +
            '<label class="de-radio"><input type="radio" name="de-oq" value="0"><span><b>' +
            esc(t('de_no_guides', 'Senza tracce')) + '</b><small>' + esc(t('de_no_guides_d', 'Copia per gli allievi: solo le domande e le righe per scrivere.')) + '</small></span></label>',
            function (root) {
                const withG = root.querySelector('input[name="de-oq"]:checked').value === '1';
                _openPrintable(_openqHtml(withG));
            });
    }

    // Modale foglio flashcard: formato + fronte/retro.
    function openFlashModal(nome) {
        // Un solo formato: 2×2 verticale (4 carte da 95×133 mm su A4 in piedi).
        // Niente scelta da fare — il foglio è quello, e le soglie di caratteri
        // mostrate nell'editor valgono per quel formato.
        _modal(t('de_flash_sheet', 'Foglio flashcard'), t('de_flash_sheet_sub', 'A4 verticale, 4 carte per foglio, con linee di taglio.'),
            '<label class="de-radio"><input type="checkbox" id="de-back"' + (_flashBack ? ' checked' : '') + '><span><b>' +
            esc(t('de_duplex', 'Pagina retro separata (stampa fronte/retro)')) + '</b><small>' +
            esc(t('de_duplex_d', 'Senza: domanda sopra e risposta sotto, con la piega a metà carta.')) + '</small></span></label>',
            async function (root) {
                _flashBack = !!root.querySelector('#de-back').checked;
                const s = _appState();
                await window.printFlashcardSheet({
                    items: _doc.items,
                    title: _doc.title || (_srcSet && _srcSet.title) || 'Flashcard',
                    mapName: (s && s.rootNodeLabel) || '',
                    fmt: _flashFmt,
                    backside: _flashBack,
                    fileName: nome || null
                });
            });
    }

    // ── LA VOCE NATURALE NELL'HTML ──────────────────────────────────────────
    // È il file che si consegna all'allievo con DSA, e la voce è il motivo per
    // cui esiste. Finora `exportHtml` chiamava `buildPrintHtml(data)` senza
    // opzioni: l'audio veniva perso in silenzio.

    function _blobToDataUri(blob) {
        return new Promise(function (ok) {
            try {
                const r = new FileReader();
                r.onload = function () { ok(String(r.result || '') || null); };
                r.onerror = function () { ok(null); };
                r.readAsDataURL(blob);
            } catch (e) { ok(null); }
        });
    }
    function _mimeAudio(nome) {
        const e = (/\.([A-Za-z0-9]+)$/.exec(String(nome || '')) || [])[1];
        return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' })[String(e).toLowerCase()] || 'audio/mpeg';
    }

    /* La voce naturale del documento aperto, pronta da incorporare.
       → { audioDataUri, audioMime, cues } | null
       ⚠️ L'MP3 scritto dalla pipeline sta ACCANTO al file, e da solo non porta i
       cue del karaoke (li scrive solo chi incorpora l'audio nell'HTML): senza
       cue il lettore ripiega sulla stima proporzionale, che è quello che fa già
       per gli audio più vecchi. Meglio una sincronia approssimata che il
       silenzio. */
    /** Legge un file audio della cartella e lo trasforma in data-URI. */
    async function _audioDalVault(vaultPath, nome, cues) {
        try {
            const res = await window.electronAPI.readVaultFile({ vaultPath: vaultPath, relPath: 'Materiale Studio/' + nome });
            if (!res || !res.ok || !res.base64) return null;
            const mime = _mimeAudio(nome);
            return { audioDataUri: 'data:' + mime + ';base64,' + res.base64, audioMime: mime, cues: cues || null };
        } catch (e) { return null; }
    }

    async function _voceNaturale() {
        const va = _syn && _syn.vaultAudio;
        const fv = _origine();
        const api = window.electronAPI;
        /* 0. REGISTRATA ADESSO, in questa sessione, per questo documento: vince
              su tutto. Stava al posto 3, DOPO l'audio del file aperto e dopo
              l'MP3 che gli sta accanto nella cartella — e quei due, su una
              sintesi che una voce ce l'ha già, arrivavano sempre primi. Il
              risultato era il guasto peggiore possibile qui: si premeva «Voce»,
              si aspettava la registrazione, e l'HTML usciva con la voce
              VECCHIA, muta sulle frasi appena corrette. Misurato il 17/8 su
              «Il Clima», che ha `Sintesi-audio-Il Clima -VERDE.mp3` nel vault:
              l'export riceveva 59 cue del file vecchio invece di quelli nuovi.
              Un blob in memoria non può che essere il più recente: è nato dal
              testo di adesso, e `voceNaturale()` riallinea `_syn.base` con lui. */
        if (_syn && _syn.data && _syn.data._audioBlob) {
            const uriNuovo = await _blobToDataUri(_syn.data._audioBlob);
            if (uriNuovo) return {
                audioDataUri: uriNuovo,
                audioMime: _syn.data._audioBlob.type || 'audio/wav',
                cues: _syn.data._cues || null
            };
        }
        // 1. Audio già INCORPORATO nel file che si è aperto: è già tutto qui.
        if (va && /^data:/i.test(String(va.audioDataUri || ''))) return va;
        /* 2. Il file del vault non incorpora l'audio: lo RICHIAMA per nome,
              perché sta nella cartella accanto (è la forma leggera scelta dalla
              pipeline). Quel percorso relativo, dentro un HTML scaricato in
              «Download», non punta più a niente: qui si va a prendere il file
              vero e lo si incorpora. I cue del karaoke invece ci sono già nel
              documento — ed è la sincronia buona, non la stima. */
        if (va && va.audioDataUri && fv && api && api.readVaultFile) {
            let nome = String(va.audioDataUri);
            try { nome = decodeURIComponent(nome); } catch (e) { /* già in chiaro */ }
            nome = nome.split('/').pop();
            const daFile = await _audioDalVault(fv.vaultPath, nome, va.cues);
            if (daFile) return daFile;
        }
        /* (Il vecchio passo 3 — «generato in questa sessione» — è salito in
           testa come passo 0: vedi lì il perché.) */
        // 4. Il documento non dichiara nessun audio: si cerca l'MP3 fratello.
        if (!fv || !api || !api.readVaultFile) return null;
        const files = await _materialiEsistenti(fv.vaultPath);
        if (!files.length) return null;
        const mappa = _mapName();
        /* I nomi attesi, dal più preciso al più vecchio: la convenzione ha
           cambiato forma (l'MP3 non portava né la mappa né il marcatore della
           taratura) e sul disco di chi usa MappAI da mesi ci sono entrambe. */
        const attesi = (PC() ? [
            PC().buildFileName('tts', null, _tarato(), { mappa: mappa }),
            PC().buildFileName('tts', null, !_tarato(), { mappa: mappa })
        ] : []).concat(['Sintesi-audio.mp3']);
        let nome = null;
        for (let i = 0; i < attesi.length && !nome; i++) {
            nome = files.filter(f => f.toLowerCase() === String(attesi[i]).toLowerCase())[0] || null;
        }
        if (!nome) {
            // Nessuno dei nomi attesi: se nella cartella c'è UNA sola voce, è
            // quella. Se ce ne sono due non si tira a indovinare quale.
            const soli = files.filter(f => /^Sintesi-audio/i.test(f));
            if (soli.length === 1) nome = soli[0];
        }
        if (!nome) return null;
        // Senza cue il lettore ripiega sulla stima proporzionale: è ciò che fa
        // già per gli audio più vecchi, e una sincronia approssimata è meglio
        // del silenzio.
        return _audioDalVault(fv.vaultPath, nome, null);
    }

    /* ── VOCE NATURALE su una sintesi GIÀ ESISTENTE (17/8) ───────────────────
       Il difetto segnalato da Giacomo: la voce si poteva registrare solo nel
       modale che compare SUBITO DOPO la generazione. Riaperta domani
       dall'archivio o dal vault — cioè nel caso normale, perché una sintesi si
       rivede prima di consegnarla — quella strada non c'era più, e con essa
       spariva l'unico modo di dare l'audio a un allievo dislessico.
       Il motore non si riscrive: è `window.generateSynthesisAudio(data)`, lo
       stesso del modale di risultato. Qui si porta solo il documento aperto.
       ⚠️ Il bottone si mostra SEMPRE su una sintesi, e non è un comando inerte
       (invariante 21): quando non può registrare, il motore dice il perché —
       serve la chiave Google, serve l'app desktop, ci sono modifiche da
       salvare. Nasconderlo lascerebbe il docente a chiedersi dove sia finito.
       ⚠️ Registrare NON è salvare: il blob resta nel documento aperto e viaggia
       con HTML / Stampa / Crea PDF, che sono i tre modi in cui esce di qui. */
    async function voceNaturale() {
        if (_kind !== 'synthesis' || !_syn) return;
        if (!window.generateSynthesisAudio) {
            toast(t('de_voce_ko', 'Il generatore della voce naturale non è caricato.'), 'warning');
            return;
        }
        /* Il testo di ADESSO, blocchi rivisti compresi: si registra quello che
           si vede, non la versione con cui la sintesi era nata. */
        const data = Object.assign({}, _syn.data, {
            editedBlocks: JSON.parse(JSON.stringify(_syn.blocks))
        });
        const res = await window.generateSynthesisAudio(data);
        /* Niente `res` = il motore ha già spiegato perché con un toast suo
           (dirty, chiave mancante, fuori dall'app desktop): un secondo avviso
           qui direbbe la stessa cosa con parole diverse. */
        if (!res || !res.blob) return;
        _syn.data._audioBlob = res.blob;
        _syn.data._cues = res.cues || null;
        /* La firma di partenza si RIALLINEA al testo appena registrato: senza,
           `audioStale(_syn.base, _syn.blocks)` continuerebbe a confrontare la
           voce nuova con i blocchi di quando il documento è stato aperto, e su
           una sintesi corretta prima di registrare l'audio verrebbe scartato
           subito come «già superato». */
        _syn.base = JSON.parse(JSON.stringify(_syn.blocks));
        const scritta = await _scriviCopiaParlante(res);
        /* La cache dei clip si svuota SOLO a copia scritta (regola di Giacomo):
           finché quel file non è sul disco i clip servono ancora, ed è proprio
           il caso in cui la scrittura fallisce che non deve costare una seconda
           registrazione da capo. */
        if (scritta && res.chiavi && window.MappAISynthesis && window.MappAISynthesis.svuotaCache) {
            try { await window.MappAISynthesis.svuotaCache(res.chiavi); } catch (e) { }
        }
    }

    /* ── LA COPIA PARLANTE, nella cartella della mappa ───────────────────────
       🐛 Segnalato da Giacomo (17/8): «la generazione della voce inizia ma il
       file non appare in Materiale Studio». Vero: registrare depositava il blob
       in memoria e si fermava lì — a scrivere il file era solo la pipeline. Chi
       registrava dall'editor otteneva una voce che moriva alla chiusura.
       ⚠️ NON si scrive un MP3 accanto al documento: è la decisione del 10/8, e
       la ragione è che un HTML che PUNTA all'MP3 fratello funziona solo finché i
       due file restano nella stessa cartella — via QR, per email o
       nell'anteprima `srcdoc` il riferimento non risolve e il documento ripiega
       in silenzio sulla voce di sistema. L'audio va DENTRO il documento, in un
       SECONDO file (`Sintesi-voce-<Mappa>.html`): l'editabile resta leggero per
       chi corregge, la copia parlante basta a sé stessa per chi la consegna.
       Il nome lo compone `buildFileName('synthesis_voice', …)`, la stessa
       funzione della pipeline: una seconda convenzione qui spegnerebbe il
       riconoscimento per prefisso su cui si reggono gli elenchi per genere.
       ⚠️ `_syn.vaultAudio` NON si tocca: dichiara l'audio del file APERTO, e
       valorizzarlo farebbe incorporare l'audio anche nell'EDITABILE al
       salvataggio successivo — cioè 8 MB da riaprire a ogni ritocco, che è
       esattamente ciò che i due file separati evitano.
       📌 Ri-registrare SOVRASCRIVE, e va bene così: è la voce dello stesso
       documento, rifatta. Passare da `nomeLibero` produrrebbe un
       «Sintesi-voce-… · 02.html» a ogni ripensamento, cioè una cartella piena di
       versioni fra cui il docente dovrebbe indovinare l'ultima. */
    async function _scriviCopiaParlante(res) {
        const BS = window.MappAIBranchSynthesis;
        const s = _appState();
        const vaultPath = (_origine() && _origine().vaultPath) || (s && s.activeVaultPath);
        if (!BS || !PC() || !window.electronAPI || !window.electronAPI.saveVaultFile || !vaultPath) {
            /* Registrata comunque: vive nel documento aperto e finisce in HTML e
               nella stampa. Manca solo il file, e si dice quale manca. */
            toast(t('de_voce_no_vault', 'Voce registrata, ma non ho una cartella dove scrivere la copia parlante: resta nel documento aperto.'), 'warning');
            return false;
        }
        try {
            const uri = await _blobToDataUri(res.blob);
            if (!uri) throw new Error('data-URI vuoto');
            const data = Object.assign({}, _syn.data, {
                editedBlocks: JSON.parse(JSON.stringify(_syn.blocks))
            });
            const html = BS.buildPrintHtml(data, {
                audioDataUri: uri, audioMime: res.mime || 'audio/mpeg', cues: res.cues || null
            });
            const nome = PC().buildFileName('synthesis_voice', null, _tarato(), { mappa: _mapName() });
            const rel = 'Materiale Studio/' + nome;
            const out = await window.electronAPI.saveVaultFile({ vaultPath: vaultPath, relPath: rel, text: html });
            if (!out || !out.ok) throw new Error((out && out.error) || '?');
            /* Chi scrive su disco lo DICE, o gli elenchi già aperti non se ne
               accorgono (stessa regola di `_saveSynthesisFile`). */
            try {
                if (window.MappAIVaults) window.MappAIVaults.segnala('doc-salvato', { vaultPath: vaultPath, relPath: rel });
            } catch (e) { /* canale assente: il file è comunque scritto */ }
            toast(t('de_voce_ok', '✓ Voce registrata — copia parlante scritta: ') + nome, 'success');
            return true;
        } catch (e) {
            /* Degradabile come nella pipeline: la voce c'è comunque nel documento
               aperto, si perde solo la copia su disco — e si dice il perché. */
            toast(t('de_voce_file_ko', 'Voce registrata, ma la copia parlante non è stata scritta: ') + (e.message || e), 'warning');
            return false;
        }
    }

    // Sintesi: export .html (conserva il lettore TTS e la voce naturale).
    async function exportHtml() {
        if (_kind === 'causal') {
            const name = 'Catena-dei-perche-' + String(CCU().mapName()).replace(/[\\/:*?"<>|]/g, '-') + '.html';
            const blobCc = new Blob([_ccHtml()], { type: 'text/html;charset=utf-8' });
            const aCc = document.createElement('a');
            aCc.href = URL.createObjectURL(blobCc); aCc.download = name;
            document.body.appendChild(aCc); aCc.click();
            setTimeout(function () { URL.revokeObjectURL(aCc.href); aCc.remove(); }, 500);
            toast(t('de_cc_html_done', '✓ HTML scaricato'), 'success');
            return;
        }
        const data = Object.assign({}, _syn.data, { editedBlocks: _syn.blocks });
        /* Se il testo è cambiato rispetto alla registrazione, l'audio NON si
           allega: un karaoke fuori sincrono è peggio del silenzio, e non se ne
           accorgerebbe l'insegnante ma l'allievo, da solo, a casa. */
        const stale = DE().audioStale(_syn.base, _syn.blocks);
        const audio = stale ? null : await _voceNaturale();
        if (stale && (_syn.vaultAudio || _syn.data._audioBlob)) {
            toast(t('de_html_stale', 'HTML senza voce naturale: il testo è cambiato dopo la registrazione, va rigenerata.'), 'warning');
        }
        const html = window.MappAIBranchSynthesis.buildPrintHtml(data, audio || {});
        /* Il nome del file è quello della convenzione (`_componiNome`), non
           «Sintesi-» + l'etichetta del ramo: per un documento aperto dal vault
           quell'etichetta È già il nome del file, e ne usciva «Sintesi-Sintesi-…». */
        const name = _componiNome('').replace(/\.[A-Za-z0-9]+$/, '') + '.html';
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        toast(audio
            ? t('de_html_done_audio', '✓ HTML scaricato — con la voce naturale incorporata')
            : t('de_html_done', '✓ HTML scaricato — il lettore audio resta funzionante'), 'success');
    }

    // Orientamento del foglio da mandare a printToPDF: lo decide la geometria
    // del foglio flashcard (MappAIQuizPrint.flashSheet). I quiz restano verticali.
    function _flashLandscape() {
        if (_kind !== 'flashcards') return false;
        try {
            const QP = window.MappAIQuizPrint;
            return !!(QP && QP.flashSheet && QP.flashSheet().landscape);
        } catch (e) { return false; }
    }

    /* Scrive il foglio in «Materiale Studio». Dalla barra non ci si arriva più —
       il bottone «Nel vault» è stato tolto il 9/8 perché faceva la stessa cosa
       di «Stampa» senza dirlo — ma la funzione resta esposta.
       ⚠️ Non ha più un'implementazione sua: ne aveva una che componeva i nomi
       per conto proprio («Sintesi — <ramo> (rivista).html», «Catena dei perche
       (rivista).html», il quiz col titolo al posto della mappa). Erano nomi nati
       prima che la convenzione fosse una sola, e tenerli in vita voleva dire due
       grafie per lo stesso mestiere: la prossima volta che `buildFileName`
       cambia, una delle due resta indietro — e a restare indietro sarebbe quella
       che nessuno guarda. Ora passa dalla stessa strada di «Stampa»: il nome si
       chiede, la collisione si dichiara, la scrittura si annuncia. */
    async function saveToVault() {
        return _salvaConNome();
    }
    /* «Salva» quando la domanda arriva da FUORI (la console, uscendo da un
       documento con modifiche in sospeso). Passa dalla stessa strada di
       «Stampa» e di «Salva ed Esci»: chiede il nome, avvisa se esiste già, e
       scrive il file — non `save()`, che per quattro generi su cinque tocca
       solo memoria e localStorage e non lascerebbe nessun file.
       → Promise: il nome scritto (stringa) · `false` (documento salvato ma
         file no, ed è già stato detto) · `null` (ha rinunciato: non si esce). */
    async function salvaConNome() {
        return _salvaConNome();
    }

    // ── modale generico (stile .pm-* dell'app) ──────────────────────────────
    function _modal(title, sub, bodyHtml, onOk) {
        const old = document.getElementById('de-modal'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'de-modal';
        m.className = 'fixed inset-0 z-[1200] flex items-center justify-center';
        /* 🐛 «Stampa» non faceva NIENTE su quiz e flashcard, e solo dentro la
           console di ELABORA. Non era la stampa: il file veniva scritto e i
           toast comparivano. Era questo pannello, che nasce a z-index 1200
           mentre la console è un modale del motore a 12100 con un riquadro
           opaco a tutto schermo — il foglio si apriva SOTTO, invisibile, e
           prendeva anche il fuoco. La sintesi funzionava perché esce da
           `window.open`: una finestra nuova allo z-index non deve niente.
           Il piano non si calcola: si CHIEDE al motore, che lo fa salire a ogni
           finestra aperta (stesso gesto di `mappai-cabina.js:114`). Un numero
           fisso più alto tornerebbe a sbagliare appena si impila un modale in
           più. Fuori dalla console `prossimoZ` non c'è o vale la base, e il
           comportamento storico non cambia. */
        try {
            const MM = window.MappAIModal;
            if (MM && MM.prossimoZ) m.style.zIndex = String(MM.prossimoZ());
        } catch (e) { /* senza motore resta la classe di prima */ }
        // Struttura canonica dei modali dell'app (index.html §11): card bianca +
        // header con pm-icon-wrap/pm-title + pm-section + footer a due bottoni.
        m.innerHTML =
            '<div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>' +
            '<div class="relative bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[560px] max-h-[90vh] overflow-y-auto p-6 space-y-5">' +
            '<div class="flex items-center gap-3">' +
            '<div class="pm-icon-wrap"><i data-lucide="printer" class="w-5 h-5 text-indigo-600"></i></div>' +
            '<div><div class="pm-title">' + esc(title) + '</div><div class="pm-subtitle">' + esc(sub) + '</div></div>' +
            '</div>' +
            '<div class="pm-section space-y-2">' + bodyHtml + '</div>' +
            '<div class="flex gap-3">' +
            '<button type="button" class="pm-btn-cancel" id="de-modal-x">' + esc(t('de_cancel', 'Annulla')) + '</button>' +
            '<button type="button" class="pm-btn-primary" id="de-modal-ok"><i data-lucide="printer" class="w-4 h-4"></i>' + esc(t('de_ok', 'Continua')) + '</button>' +
            '</div></div>';
        document.body.appendChild(m);
        if (window.safeCreateIcons) window.safeCreateIcons({ root: m });
        const prevFocus = document.activeElement;
        function close() {
            document.removeEventListener('keydown', onKey, true);
            m.remove();
            try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { }
        }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        document.addEventListener('keydown', onKey, true);
        m.querySelector('#de-modal-x').onclick = close;
        m.querySelector('.absolute').onclick = close;
        m.querySelector('#de-modal-ok').onclick = function () { const r = m; close(); onOk(r); };
        setTimeout(function () { const b = m.querySelector('#de-modal-ok'); if (b) b.focus(); }, 20);
    }

    // ── render ──────────────────────────────────────────────────────────────
    function render() {
        const host = _host();
        if (!host) return;
        _injectStyles();
        /* ⚠️ NELLA CONSOLE LA LISTA NON SI DISEGNA MAI (9/8). L'elenco dei
           documenti è la colonna: la lista dell'editor nell'area sarebbe un
           secondo elenco delle stesse cose. Non basta gestire l'uscita dal
           documento (`backToList` lo annuncia): ci si arriva anche quando
           un'apertura FALLISCE — «Catena dei perché» su una mappa senza nessi
           esce con un avviso e l'editor resta in modalità lista, e Giacomo
           vedeva comparire nell'area la vecchia superficie di selezione.
           Qui si chiude la strada in un punto solo, invece di rincorrere ogni
           apertura che può rinunciare. */
        if (_view !== 'doc' && _inConsole()) { host.innerHTML = ''; return; }
        host.innerHTML = (_view === 'doc') ? _docHtml() : _listHtml();
        if (window.safeCreateIcons) window.safeCreateIcons({ root: host });
        _bind(host);
        _mountTts(host);
        _paintDirty();
        _paintZoom();
    }

    /**
     * Chip di lettura sul foglio sintesi. Il DOM è stato appena riscritto: i
     * chunk del lettore puntavano ai nodi di prima, quindi si invalida sempre —
     * anche quando il chip non c'è (l'utente potrebbe aver chiuso il documento
     * mentre leggeva).
     */
    function _mountTts(host) {
        try { if (window.MappAITTS && window.MappAITTS.invalidate) window.MappAITTS.invalidate(); } catch (e) {}
        if (_view !== 'doc' || _kind !== 'synthesis') return;
        const slot = host.querySelector('#de-tts-slot');
        if (!slot || !window.MappAITTS || !window.MappAITTS.mountSlot) return;
        try { window.MappAITTS.mountSlot(slot); } catch (e) {}
    }

    function _listHtml() {
        const sets = _sets();
        const quiz = sets.filter(s => DE().kindOfSet(s) === 'quiz');
        const flash = sets.filter(s => DE().kindOfSet(s) === 'flashcards');
        const syn = _synthesisEntries();

        function row(icon, title, meta, onclick, badge) {
            return '<button type="button" class="de-row" onclick="' + onclick + '">' +
                '<i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400"></i>' +
                '<span class="de-row-t">' + esc(title) + '</span>' +
                (badge ? '<span class="de-row-b">' + esc(badge) + '</span>' : '') +
                '<span class="de-row-m">' + esc(meta) + '</span>' +
                '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300"></i>' +
                '</button>';
        }
        function group(icon, label, rows, empty) {
            return '<div class="de-group"><div class="de-group-h"><i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400"></i>' +
                esc(label) + '</div>' + (rows || '<div class="de-empty-row">' + esc(empty) + '</div>') + '</div>';
        }

        return '<div class="de-list">' +
            '<div class="de-list-head">' +
            '<div class="de-list-h">' + esc(t('de_hub_h', 'Documenti da elaborare')) + '</div>' +
            '<div class="de-list-p">' + esc(t('de_hub_p', 'Rivedi quello che l\'AI ha generato prima di darlo in mano alla classe: correggi i testi, togli le domande che non servono, aggiungine di tue. Il foglio che vedi qui è quello che esce dalla stampante.')) + '</div>' +
            '</div>' +
            group('list-checks', t('de_g_quiz', 'Quiz e verifiche'),
                quiz.map(s => row('file-question', s.title || t('de_quiz', 'Quiz'),
                    s.items.length + ' ' + t('de_questions', 'domande'),
                    'MappAIDocEditor.openSet(\'' + _q(s.id) + '\')',
                    DE().isTrueFalse(s.items) ? 'V/F' : (s.type || 'MC'))).join(''),
                t('de_g_quiz_e', 'Nessun quiz generato per questa mappa.')) +
            group('layers', t('de_g_flash', 'Flashcard'),
                flash.map(s => row('layers', s.title || 'Flashcard',
                    s.items.length + ' ' + t('de_cards', 'carte'),
                    'MappAIDocEditor.openSet(\'' + _q(s.id) + '\')')).join(''),
                t('de_g_flash_e', 'Nessun set di flashcard.')) +
            group('scissors', t('de_g_ns', 'Foglio dei nodi'), _nsRow(row),
                t('de_g_ns_e', 'Questa mappa non ha nodi da stampare.')) +
            group('file-text', t('de_g_synth', 'Sintesi e catene'),
                syn.map(d => row('file-text', d.title,
                    d.live ? t('de_current', 'in memoria')
                        : (d.other ? d.mapName + ' · ' + _date(d.date) : _date(d.date)),
                    'MappAIDocEditor.openSynthesis(\'' + _q(d.id) + '\')')).join('') + _ccRow(row),
                t('de_g_synth_e', 'Nessuna sintesi: generane una da «Materiali di studio → Sintesi».')) +
            '</div>';
    }

    // Riga «Foglio dei nodi» nell'elenco documenti: c'è sempre (finché la mappa ha
    // nodi), perché il foglio si costruisce dalla mappa — non serve averlo generato
    // prima. Se è già stato rivisto, la riga lo dice e riapre quello.
    function _nsRow(row) {
        const s = _appState();
        const nodes = (s && s.db && s.db.nodes) || [];
        if (!nodes.length || !NS()) return '';
        const saved = (s.db && s.db.nodeSheet) || null;
        const n = (saved && Array.isArray(saved.cards) && saved.cards.length) ? saved.cards.length : nodes.length;
        return row('scissors', t('de_ns', 'Foglio dei nodi') + ' — ' + ((s && s.rootNodeLabel) || ''),
            n + ' ' + t('de_ns_cards', 'card'),
            'MappAIDocEditor.openNodeSheet()',
            saved ? t('de_ns_revised', 'rivisto') : '');
    }

    /**
     * Riga «Catena dei perché», nella stessa sezione delle sintesi: è l'altro
     * documento di testo che si ricava dalla mappa. Come il foglio dei nodi c'è
     * sempre — purché la mappa abbia dei nessi da mostrare — perché si costruisce
     * al volo e non serve averlo generato prima.
     */
    function _ccRow(row) {
        if (!CC() || !CCU()) return '';
        const s = _appState();
        const saved = (s && s.db && s.db.causalDoc) || null;
        let n = saved ? CC().countRows(saved) : 0;
        if (!n) {
            // Estrazione deterministica: costa un conteggio, non una chiamata AI.
            try { const ch = CCU().buildForCurrentMap(); n = (ch && ch.total) || 0; } catch (e) { n = 0; }
        }
        if (!n) return '';
        return row('git-branch-plus', t('cc_doc_title', 'Catena dei perché') + ' — ' + ((s && s.rootNodeLabel) || ''),
            n + ' ' + t(n === 1 ? 'de_cc_nexus' : 'de_cc_nexi', n === 1 ? 'nesso' : 'nessi'),
            'MappAIDocEditor.openCausal()',
            saved ? t('de_ns_revised', 'rivisto') : '');
    }

    function _q(s) { return String(s).replace(/'/g, "\\'"); }
    function _date(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }

    // ── foglio quiz/flashcard editabile ─────────────────────────────────────
    function _docHtml() {
        const sheet = (_kind === 'synthesis') ? _synthSheet()
            : (_kind === 'nodesheet') ? _nodeSheet()
            : (_kind === 'causal') ? _causalSheet()
            : (_kind === 'openq') ? _openqSheet() : _quizSheet();
        /* L'anteprima mostra il carattere del documento, non quello dell'app:
           si sceglie guardando il foglio che uscirà, non un campione. La
           variabile la legge la regola di .de-sheet; senza scelta resta vuota e
           il foglio segue la Cabina come tutto il resto. */
        const _fc = _fontCorrente();
        const fdoc = (_fc && window.MappAIFontCore)
            ? ' de-fontdoc" style="--doc-font:' + window.MappAIFontCore.stackDi(_fc) + '"'
            : '"';
        return '<div class="de-doc">' + _docBar() + '<div class="de-sheet-wrap' + fdoc + '>' + sheet + '</div></div>';
    }

    /* Chi ospita l'editor in questo momento: la console di ELABORA o il
       workspace classico. Cambia quali comandi hanno senso nella barra. */
    function _inConsole() {
        try {
            const C = window.MappAIElaboraConsole;
            return !!(C && C.aperta && C.aperta());
        } catch (e) { return false; }
    }

    function _docBar() {
        const isSyn = _kind === 'synthesis';
        const isNs = _kind === 'nodesheet';
        const isCc = _kind === 'causal';
        const title = isSyn ? (_syn.data.branchLabel || t('de_synth', 'Sintesi'))
            : isNs ? t('de_ns', 'Foglio dei nodi')
            : isCc ? t('cc_doc_title', 'Catena dei perché')
            : (_doc.title || (_kind === 'openq' ? t('de_oq', 'Domande aperte') : t('de_quiz', 'Quiz')));
        return '<div class="de-bar">' +
            /* «‹ Documenti» solo FUORI dalla console (Giacomo, 8/8 notte): là
               l'elenco dei documenti è la COLONNA — sempre a schermo, con la voce
               aperta marcata — quindi un bottone che dice «Documenti» dentro la
               barra del documento è un secondo comando per una cosa che non è
               nascosta. Nel workspace classico invece è l'UNICA uscita dal
               documento e resta: la sua lista occupa lo stesso posto del foglio.
               ⚠️ La condizione la dichiara la console (`aperta()`), non un flag
               letto qui: il flag dice che il cablaggio è acceso, non che in questo
               momento sia lei a ospitare l'editor. */
            (_inConsole() ? '' :
                '<button type="button" class="de-btn de-ghost" onclick="MappAIDocEditor.backToList()">‹ ' + esc(t('de_back', 'Documenti')) + '</button>') +
            '<div class="de-bar-t">' + esc(title) + '<span class="de-dirty" id="de-dirty">•</span></div>' +
            (isSyn ? _styleBar() : '') +
            '<div class="de-spacer"></div>' +
            _sezioniBar() +
            _fontBar() +
            _zoomBar() +
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.undo()" title="' + esc(t('de_undo_tip', 'Annulla l\'ultima operazione')) + '"><i data-lucide="undo-2" class="w-4 h-4"></i> ' + esc(t('de_undo', 'Annulla')) + '</button>' +
            /* «Voce» = registra la voce naturale (Google) su QUESTA sintesi,
               anche se è stata generata giorni fa. Prima si poteva solo nel
               modale che compariva subito dopo la generazione: riaperta
               dall'archivio, la sintesi non aveva più modo di avere l'audio. */
            (isSyn
                ? '<button type="button" class="de-btn" onclick="MappAIDocEditor.voceNaturale()" title="' +
                  esc(t('de_voce_tip', 'Registra la lettura ad alta voce con la voce naturale di Google: resta dentro l\'HTML e nel PDF. Utile agli allievi dislessici.')) +
                  '"><i data-lucide="headphones" class="w-4 h-4"></i> ' + esc(t('de_voce', 'Voce')) + '</button>'
                : '') +
            ((isSyn || isCc)
                ? '<button type="button" class="de-btn" onclick="MappAIDocEditor.exportHtml()" title="' +
                  esc(isCc ? t('de_cc_html_tip', 'Scarica la pagina HTML: dentro c\'è anche la modalità esercizio')
                           : t('de_html_tip', 'Scarica la pagina HTML: conserva il lettore audio')) +
                  '"><i data-lucide="file-code-2" class="w-4 h-4"></i> HTML</button>'
                : '') +
            /* «Nel vault» NON c'è più (Giacomo, 9/8): faceva la stessa cosa di
               «Stampa» senza dirlo — due bottoni per un gesto solo, e il docente
               doveva indovinare quale dei due lasciava il file nella cartella.
               Ora è «Stampa» che chiede il nome, scrive e poi stampa; la
               funzione `saveToVault` resta esportata per chi la chiamasse da
               fuori. */
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.print()" title="' +
            esc(t('de_print_tip2', 'Apre la stampa su una copia effimera: non lascia file nella cartella')) +
            '"><i data-lucide="printer" class="w-4 h-4"></i> ' + esc(t('de_print', 'Stampa')) + '</button>' +
            /* «Crea PDF» = l'atto di PUBBLICARE (13/8, Giacomo): scrive il file
               in «Materiale Studio/» e da lì il materiale compare in INSEGNA.
               Sta separato dal salvataggio perché su un documento a cui si
               lavora per giorni ogni salvataggio avrebbe pubblicato un PDF
               transitorio, già visibile alla classe. */
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.creaPdf()" title="' +
            esc(t('de_pdf_tip', 'Scrive il PDF nella cartella della mappa: da lì compare fra i materiali di INSEGNA')) +
            '"><i data-lucide="file-down" class="w-4 h-4"></i> ' + esc(t('de_pdf', 'Crea PDF')) + '</button>' +
            /* Il bottone conclusivo è l'uscita (vedi `esci()`): tutte e due le
               facce nel markup, `_paintDirty()` accende quella giusta senza
               ridisegnare la barra. */
            '<button type="button" class="de-btn de-primary" id="de-exit" onclick="MappAIDocEditor.esci()">' +
            '<span class="de-exit-clean"><i data-lucide="log-out" class="w-4 h-4"></i> ' + esc(t('de_exit', 'Esci')) + '</span>' +
            '<span class="de-exit-dirty"><i data-lucide="save" class="w-4 h-4"></i> ' + esc(t('de_exit_save', 'Salva ed Esci')) + '</span>' +
            '</button>' +
            '</div>';
    }

    /**
     * Dimensione dell'anteprima: − / percentuale / +. La percentuale è cliccabile
     * e riporta a 100. Il titolo dice a chiare lettere che la stampa non cambia:
     * senza, ingrandire sembra «ci sta più testo nella card».
     */
    /* IL CARATTERE DI QUESTO DOCUMENTO (18/8/26).
       Sta accanto alla dimensione dell'anteprima perché risponde alla stessa
       domanda — «come si legge questo foglio» — ma con una differenza che va
       detta: lo zoom è solo a schermo, il carattere finisce nella STAMPA e nel
       PDF. È scritto nel titolo del comando.

       La prima voce è «Come l'app»: non è un carattere, è la rinuncia a
       sceglierne uno. Senza, per tornare alla Cabina bisognerebbe indovinare
       quale delle quattro voci sia quella attiva là. */
    function _fontBar() {
        const C = window.MappAIFontCore;
        if (!C || !window.MappAIFont || !window.MappAIFont.accesa()) return '';
        const scelto = _fontCorrente();
        const dellApp = C.font(window.MappAIFont.attivo()).etichetta;
        let o = '<option value=""' + (scelto ? '' : ' selected') + '>' +
            esc(t('de_font_app', 'Come l’app')) + ' · ' + esc(dellApp) + '</option>';
        C.elenco().forEach(function (f) {
            o += '<option value="' + esc(f.id) + '"' + (scelto === f.id ? ' selected' : '') + '>' +
                esc(f.etichetta) + '</option>';
        });
        return '<select class="de-ns-sel de-font" onchange="MappAIDocEditor.setFont(this.value)" title="' +
            esc(t('de_font_tip', 'Il carattere di QUESTO documento. A differenza della dimensione dell’anteprima, finisce anche nel foglio stampato e nel PDF.')) +
            '" aria-label="' + esc(t('de_font_lbl', 'Carattere del documento')) + '">' + o + '</select>';
    }

    /* LE DUE SEZIONI DELLA SINTESI (18/8/26).
       «La catena dei perché» e le «Note» sono generate, non editabili, e nel
       foglio stanno in coda al testo. Da qui si accendono e si spengono, e la
       scelta vale per HTML, PDF e stampa insieme — escono tutti dallo stesso
       costruttore.

       ⚠️ Compaiono solo se quel documento quelle sezioni CE LE HA: una spunta
       per una sezione che non esiste è un comando inerte, e non si accorgerebbe
       nessuno che non fa niente perché il risultato è identico in entrambe le
       posizioni.

       ⚠️ E solo sulla sintesi di RAMO: in quella di tutta la mappa le citazioni
       stanno DENTRO il corpo, sezione per sezione, come blocchi già visibili e
       cancellabili a mano — un interruttore lì governerebbe un'altra cosa.

       Il fumetto dice che cosa aggiungono o tolgono: nell'editor quei due pezzi
       non si vedono, e senza spiegazione la spunta sarebbe cieca. */
    function _sezioniBar() {
        if (_kind !== 'synthesis' || !_syn || !_syn.data || _syn.data.whole) return '';
        const d = _syn.data;
        const haCausale = !!(d.causalTriples && d.causalTriples.length);
        const haNote = !!(d.sourcesArr && d.sourcesArr.length);
        if (!haCausale && !haNote) return '';
        function spunta(campo, etichetta, aiuto) {
            const on = d[campo] !== false;
            return '<label class="de-ns-check" data-tip="' + esc(aiuto) + '">' +
                '<input type="checkbox"' + (on ? ' checked' : '') +
                ' onchange="MappAIDocEditor.mostraSezione(\'' + campo + '\', this.checked)"> ' +
                esc(etichetta) + '</label>';
        }
        const dentro =
            (haCausale ? spunta('mostraCausale', t('de_sez_causale', 'Catena dei perché'),
                t('de_sez_causale_tip', 'Il riquadro con i nessi causa-effetto del ramo, in coda al foglio. Spento, non compare né nell’HTML né nel PDF.')) : '') +
            (haNote ? spunta('mostraNote', t('de_sez_note', 'Note'),
                t('de_sez_note_tip', 'Le fonti citate, in coda al foglio. Spente, spariscono anche i richiami [1] [2] dal testo — altrimenti resterebbero puntati a niente.')) : '');

        /* ⚠️ Le due spunte NON stanno nella barra a chiare lettere, e non è una
           preferenza: misurato a 1440px, la barra ha 113px liberi e le due
           etichette ne vogliono 166 — mandavano tutto a capo su due righe
           (51px → 89px). Ci stanno dentro un comando compatto, che ne chiede 85.
           `<details>` e non un menu costruito a mano: è nativo, quindi tastiera,
           `aria-expanded` e chiusura li fa il browser, e non serve una riga di
           JS per posizionarlo.
           Il conteggio nell'etichetta («2 di 2») è quello che salva la spunta
           dall'essere cieca: quei due pezzi nell'editor non si vedono, e senza
           un numero non ci sarebbe modo di sapere da fuori che una è spenta. */
        const tot = (haCausale ? 1 : 0) + (haNote ? 1 : 0);
        const on = (haCausale && d.mostraCausale !== false ? 1 : 0) +
                   (haNote && d.mostraNote !== false ? 1 : 0);
        return '<details class="de-sez"' + (on < tot ? ' data-spente="1"' : '') + '>' +
            '<summary title="' + esc(t('de_sez_tip', 'Che cosa entra nel foglio oltre al testo: la catena dei perché e le note delle fonti.')) + '">' +
            esc(t('de_sez', 'Sezioni')) + ' <b>' + on + '/' + tot + '</b></summary>' +
            '<div class="de-sez-p">' + dentro + '</div></details>';
    }

    function _zoomBar() {
        const z = _zoom();
        const tip = esc(t('de_zoom_tip', 'Quanto è grande il foglio a schermo. Non cambia nulla di quello che esce dalla stampante.'));
        return '<div class="de-zoom' + (z !== 1 ? ' changed' : '') + '" title="' + tip + '">' +
            '<button type="button" class="de-zbtn" onclick="MappAIDocEditor.zoomStep(-1)" aria-label="' +
            esc(t('de_zoom_out', 'Rimpicciolisci l\'anteprima')) + '">−</button>' +
            '<button type="button" class="de-zlbl" id="de-zoom-lbl" onclick="MappAIDocEditor.zoomReset()" title="' +
            esc(t('de_zoom_reset', 'Torna alla dimensione normale')) + '">' + Math.round(z * 100) + '%</button>' +
            '<button type="button" class="de-zbtn" onclick="MappAIDocEditor.zoomStep(1)" aria-label="' +
            esc(t('de_zoom_in', 'Ingrandisci l\'anteprima')) + '">+</button>' +
            '</div>';
    }

    // Barra stile (solo sintesi): niente dimensioni — le decide il tipo di campo.
    function _styleBar() {
        const slots = _slots();
        return '<div class="de-style">' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'bold\')" title="' + esc(t('de_bold', 'Grassetto')) + '"><b>B</b></button>' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'italic\')" title="' + esc(t('de_italic', 'Corsivo')) + '"><i>I</i></button>' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'underline\')" title="' + esc(t('de_underline', 'Sottolineato')) + '"><u>U</u></button>' +
            '<span class="de-sep"></span>' +
            '<input type="color" id="de-color" class="de-color" value="' + esc(slots[0] || '#1e293b') + '" title="' + esc(t('de_color', 'Colore del testo')) + '">' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.eyedropper()" title="' + esc(t('de_pipette', 'Pipetta: prendi un colore dallo schermo')) + '"><i data-lucide="pipette" class="w-4 h-4"></i></button>' +
            '<span class="de-slots" id="de-slots">' + slots.map((c, i) =>
                '<button type="button" class="de-slot" data-c="' + esc(c) + '" style="background:' + esc(c) + '" title="' + esc(t('de_slot', 'Colore salvato') + ' ' + (i + 1)) + '"></button>').join('') + '</span>' +
            '</div>';
    }

    function _paintSlots(arr) {
        const box = document.getElementById('de-slots');
        if (!box) return;
        box.innerHTML = arr.map((c, i) => '<button type="button" class="de-slot" data-c="' + esc(c) + '" style="background:' + esc(c) + '" title="' + esc(t('de_slot', 'Colore salvato') + ' ' + (i + 1)) + '"></button>').join('');
    }

    /* Il pallino «da salvare» E la parola del bottone di uscita, insieme e qui.
       ⚠️ Non basta scrivere l'etichetta in `_docBar()`: dei ventisette punti che
       sporcano il documento, otto NON ridisegnano la barra — e sono proprio
       quelli della digitazione (`_commitBlock`, `_commitField`, `_commitNs`,
       `_commitCc`, `setCorrect`, il titolo del quiz, più `fmt()`/`applyColor()`
       via `_syncFocusedBlock`), che chiamano solo di qui perché un re-render
       sposterebbe il cursore mentre si scrive. Scrivendo, il bottone sarebbe
       rimasto «Esci» su un documento appena riscritto.
       Le due facce stanno GIÀ nel markup, una accesa e una spenta: cambiare
       l'icona vorrebbe dire richiamare `safeCreateIcons`, che è l'hub globale e
       ridisegna le icone di tutta la pagina — a ogni tasto premuto. */
    function _paintDirty() {
        const d = document.getElementById('de-dirty');
        if (d) d.style.visibility = _dirty ? 'visible' : 'hidden';
        const ex = document.getElementById('de-exit');
        if (!ex) return;
        const pulita = ex.querySelector('.de-exit-clean');
        const sporca = ex.querySelector('.de-exit-dirty');
        if (pulita) pulita.style.display = _dirty ? 'none' : 'inline-flex';
        if (sporca) sporca.style.display = _dirty ? 'inline-flex' : 'none';
        ex.setAttribute('title', _dirty
            ? t('de_exit_save_tip2', 'Salva il documento e torna indietro. Il PDF per INSEGNA lo fa «Crea PDF»')
            : t('de_exit_tip', 'Torna indietro: non c\'è niente da salvare'));
    }

    // ── SOGLIA DI CARATTERI DELLE CARTE ──────────────────────────────────────
    // Quanto testo entra davvero in una carta stampata: il numero lo calcola il
    // layout di stampa dalla geometria della carta e dal corpo del testo, quindi
    // cambia se cambia il formato. Qui serve a due cose: dirlo al docente mentre
    // scrive, e far capire perché una carta generata in automatico non è stata
    // stampata (la pipeline salta quelle fuori soglia).
    function _flashLimits() {
        try {
            const PL = window.MappAIPrintLayout;
            const QP = window.MappAIQuizPrint;
            if (!PL) return null;
            const head = (QP && QP.cardHeader)
                ? QP.cardHeader({ title: _doc.title || (_srcSet && _srcSet.title) || '' }, {})
                : null;
            return PL.charLimits(PL.flashGeom(), head);
        } catch (e) { return null; }
    }

    // Carte attualmente fuori soglia (indice + quale campo sfora).
    function _overCards() {
        const L = _flashLimits();
        if (!L || _kind !== 'flashcards') return [];
        try {
            const PL = window.MappAIPrintLayout;
            const items = _doc.items.map(function (it) {
                return {
                    question: DE().plainText(it.question || ''),
                    answer: DE().plainText(it.answer || '')
                };
            });
            return PL.overLimit(items, L);
        } catch (e) { return []; }
    }

    function _countOf(i) {
        const it = _doc.items[i] || {};
        return {
            q: DE().plainText(it.question || '').length,
            a: DE().plainText(it.answer || '').length
        };
    }

    // Aggiorna il contatore di UNA carta senza ri-renderizzare (il re-render
    // sposterebbe il cursore mentre si scrive).
    function _paintCount(i) {
        if (_kind !== 'flashcards') return;
        const host = _host(); if (!host) return;
        const el = host.querySelector('.de-count[data-count="' + i + '"]');
        if (!el) return;
        const L = _flashLimits(); if (!L) return;
        const c = _countOf(i);
        el.textContent = c.q + '/' + L.question + ' · ' + c.a + '/' + L.answer;
        el.className = 'de-count' + ((c.q > L.question || c.a > L.answer) ? ' over' : '');
        el.setAttribute('title', t('de_count_tip', 'Caratteri della domanda e della risposta rispetto al massimo che entra nella carta stampata'));
    }

    // Il foglio: stessa gerarchia del PDF (header card, domanda, opzioni A/B/C).
    /* ══ IL FOGLIO DELLE DOMANDE APERTE ═══════════════════════════════════════
       Gemello del foglio quiz — stessa cornice, stessi comandi di riga — con al
       posto delle opzioni i tre campi che questo genere ha: la TRACCIA di
       correzione, le RIGHE su cui lo studente scriverà, e le AREE della mappa.
       Le aree sono chip che si accendono: le sceglie l'AI, e il docente le
       corregge cliccando. Al massimo due, ed è il core a farlo rispettare
       (`setOpenField`) — qui i chip oltre il tetto si spengono da soli, così la
       regola si VEDE prima di essere contestata. */
    function _openqSheet() {
        const s = _appState();
        const aree = _macroAree();
        const items = _doc.items.map(function (it, i) {
            const scelte = (it.areas || []);
            const attiva = (a) => scelte.some(x => String(x).toLowerCase() === a.toLowerCase());
            const pieno = scelte.length >= DE().OPEN_AREAS_MAX;
            const chips = aree.map(function (a) {
                const on = attiva(a);
                return '<button type="button" class="de-area' + (on ? ' on' : '') + '"' +
                    (!on && pieno ? ' disabled title="' + esc(t('de_oq_max_aree', 'Al massimo due aree per domanda: togline una.')) + '"' : '') +
                    ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
                    ' onclick="MappAIDocEditor.oqArea(' + i + ',\'' + _q(a) + '\')">' + esc(a) + '</button>';
            }).join('');
            /* ── AVVIO / PONTE, accanto al numero della domanda (13/8 sera) ──
               Il livello lo dichiara l'AI, ma è chi corregge ad avere l'ultima
               parola: aggiungendo un collegamento a una domanda d'avvio quella
               smette di esserlo, e le tracce continuerebbero a dire di sì.
               Sta nella TESTATA della domanda e non fra le «Aree» perché non è
               un attributo del contenuto: è che cosa quella domanda chiede.
               ⚠️ Due bottoni-chip, non una tendina: gli stati sono due e si
               vedono entrambi senza aprire niente — e si vede a colpo d'occhio
               com'è graduato il foglio scorrendolo. */
            const liv = String(it.livello || '').toLowerCase() === 'base' ? 'base' : 'ponte';
            const chipLiv = '<span class="de-liv" role="group" aria-label="' +
                esc(t('de_oq_liv_a11y', 'Livello della domanda') + ' — ' + (i + 1)) + '">' +
                ['base', 'ponte'].map(function (v) {
                    const on = liv === v;
                    const et = v === 'base' ? t('de_oq_liv_base', 'Avvio') : t('de_oq_liv_ponte', 'Ponte');
                    const tip = v === 'base'
                        ? t('de_oq_liv_base_tip', 'Si risponde con UN concetto solo: la può affrontare anche chi ha studiato una parte della scheda. Sul foglio degli allievi non si vede — compare solo nelle tue tracce di correzione.')
                        : t('de_oq_liv_ponte_tip', 'Richiede di collegare due o più concetti, o di applicarli a un caso nuovo.');
                    return '<button type="button" class="de-liv-b' + (on ? ' on ' + v : '') + '"' +
                        ' aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(tip) + '"' +
                        ' onclick="MappAIDocEditor.oqLivello(' + i + ',\'' + v + '\')">' + esc(et) + '</button>';
                }).join('') + '</span>';
            return '<div class="de-item">' +
                '<div class="de-item-h">' +
                '<span class="de-qn">' + esc(t('de_q_n', 'Domanda')) + ' ' + (i + 1) + '</span>' +
                chipLiv +
                '<span class="de-item-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.addQuestion(' + i + ')" title="' + esc(t('de_add_after', 'Aggiungi qui sotto')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.delQuestion(' + i + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>' +
                '<div class="de-q" contenteditable="true" role="textbox" aria-label="' +
                esc(t('de_q_n', 'Domanda') + ' ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="question" data-ph="' + esc(t('de_ph_q', 'Scrivi qui la domanda…')) + '">' + esc(it.question) + '</div>' +
                '<div class="de-oq-meta">' +
                '<span class="de-lbl">' + esc(t('de_oq_aree', 'Aree')) + '</span>' +
                '<span class="de-areas">' + (chips || '<span class="de-oq-noaree">' + esc(t('de_oq_noaree', 'La mappa non dichiara macro-aree.')) + '</span>') + '</span>' +
                '<span class="de-lbl de-oq-lbl-righe">' + esc(t('de_oq_righe', 'Righe')) + '</span>' +
                '<input type="number" class="de-lines" min="' + DE().OPEN_LINES_MIN + '" max="' + DE().OPEN_LINES_MAX + '"' +
                ' value="' + (it.lines || 4) + '" data-i="' + i + '" data-oq="lines"' +
                ' aria-label="' + esc(t('de_oq_righe_a11y', 'Righe per la risposta') + ' — ' + (i + 1)) + '"' +
                ' title="' + esc(t('de_oq_righe_tip', 'Quante righe lo studente ha per rispondere: 3 breve, 5 spiegazione, 8 confronto.')) + '">' +
                '</div>' +
                '<div class="de-expl-row"><span class="de-lbl">' + esc(t('de_oq_traccia', 'Traccia')) + '</span>' +
                '<div class="de-expl" contenteditable="true" role="textbox" aria-label="' + esc(t('de_oq_traccia', 'Traccia') + ' — ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="guide" data-ph="' + esc(t('de_ph_guide', 'Che cosa deve contenere una risposta corretta (compare solo nella tua copia)…')) + '">' + esc(it.guide) + '</div></div>' +
                '</div>';
        }).join('');

        return '<div class="de-sheet quiz">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title" contenteditable="true" data-f="title" data-ph="' + esc(t('de_ph_title', 'Titolo del documento')) + '">' + esc(_doc.title) + '</div>' +
            '<div class="de-sheet-sub">' + esc((s && s.rootNodeLabel) || '') + ' · ' + esc(t('de_oq', 'Domande aperte')) + '</div>' +
            _deChip() +
            '<div class="de-badge">' + _doc.items.length + ' ' + esc(t('de_questions', 'domande')) + '</div>' +
            '</div>' +
            '<div class="de-limit">' + esc(t('de_oq_note', 'Le tracce di correzione non compaiono nella copia degli allievi: le stampi solo tu, in coda al foglio. Le righe sono lo spazio vero che lo studente avrà per rispondere.')) + '</div>' +
            items +
            '<button type="button" class="de-addq" onclick="MappAIDocEditor.addQuestion()">+ ' + esc(t('de_add_q', 'domanda')) + '</button>' +
            '</div>';
    }

    function _quizSheet() {
        const s = _appState();
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const isFlash = _kind === 'flashcards';
        const LIM = isFlash ? _flashLimits() : null;
        const items = _doc.items.map(function (it, i) {
            const opts = (it.options || []).map(function (o, oi) {
                const isCorrect = it.correctIndex === oi;
                // La risposta corretta non è segnalata SOLO dal colore: la lettera
                // porta un ✓, ha aria-checked e il titolo lo dice a parole.
                return '<div class="de-opt' + (isCorrect ? ' correct' : '') + '" data-i="' + i + '" data-oi="' + oi + '">' +
                    '<button type="button" class="de-letter" role="radio" aria-checked="' + (isCorrect ? 'true' : 'false') + '"' +
                    ' onclick="MappAIDocEditor.setCorrect(' + i + ',' + oi + ')" title="' +
                    esc(isCorrect ? t('de_is_correct', 'Risposta corretta') : t('de_mark_correct', 'Segna come risposta corretta')) + '">' +
                    (isCorrect ? '✓' : letters[oi]) + '</button>' +
                    '<div class="de-opt-txt" contenteditable="true" role="textbox" aria-label="' +
                    esc(t('de_a11y_opt', 'Opzione') + ' ' + letters[oi] + ' — ' + t('de_q_n', 'Domanda') + ' ' + (i + 1)) + '"' +
                    ' data-i="' + i + '" data-f="option:' + oi + '" data-ph="' + esc(t('de_ph_opt', 'Testo dell\'opzione…')) + '">' + esc(o) + '</div>' +
                    '<button type="button" class="de-x" onclick="MappAIDocEditor.delOption(' + i + ',' + oi + ')" title="' + esc(t('de_del_opt', 'Elimina opzione')) + '">×</button>' +
                    '</div>';
            }).join('');
            return '<div class="de-item">' +
                '<div class="de-item-h">' +
                '<span class="de-qn">' + esc(isFlash ? t('de_card_n', 'Carta') : t('de_q_n', 'Domanda')) + ' ' + (i + 1) + '</span>' +
                // Contatore caratteri: quanto testo entra nella carta stampata.
                (LIM ? (function () {
                    const q = DE().plainText(it.question || '').length;
                    const a = DE().plainText(it.answer || '').length;
                    const over = (q > LIM.question || a > LIM.answer);
                    return '<span class="de-count' + (over ? ' over' : '') + '" data-count="' + i + '" title="' +
                        esc(t('de_count_tip', 'Caratteri della domanda e della risposta rispetto al massimo che entra nella carta stampata')) + '">' +
                        q + '/' + LIM.question + ' · ' + a + '/' + LIM.answer + '</span>';
                })() : '') +
                '<span class="de-item-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.addQuestion(' + i + ')" title="' + esc(t('de_add_after', 'Aggiungi qui sotto')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.delQuestion(' + i + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>' +
                '<div class="de-q" contenteditable="true" role="textbox" aria-label="' +
                esc((isFlash ? t('de_card_n', 'Carta') : t('de_q_n', 'Domanda')) + ' ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="question" data-ph="' + esc(t('de_ph_q', 'Scrivi qui la domanda…')) + '">' + esc(it.question) + '</div>' +
                (isFlash
                    ? '<div class="de-answer"><span class="de-lbl">' + esc(t('de_back_side', 'Retro')) + '</span>' +
                    '<div class="de-a" contenteditable="true" role="textbox" aria-label="' + esc(t('de_back_side', 'Retro') + ' — ' + t('de_card_n', 'Carta') + ' ' + (i + 1)) + '"' +
                    ' data-i="' + i + '" data-f="answer" data-ph="' + esc(t('de_ph_a', 'Risposta sul retro…')) + '">' + esc(it.answer) + '</div></div>'
                    : '<div class="de-opts">' + opts +
                    '<button type="button" class="de-addopt" onclick="MappAIDocEditor.addOption(' + i + ')">+ ' + esc(t('de_add_opt', 'opzione')) + '</button></div>') +
                '<div class="de-expl-row"><span class="de-lbl">' + esc(t('de_expl', 'Spiegazione')) + '</span>' +
                '<div class="de-expl" contenteditable="true" role="textbox" aria-label="' + esc(t('de_expl', 'Spiegazione') + ' — ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="explanation" data-ph="' + esc(t('de_ph_e', 'Perché la risposta è questa (compare solo nelle soluzioni)…')) + '">' + esc(it.explanation) + '</div></div>' +
                '</div>';
        }).join('');

        return '<div class="de-sheet' + (isFlash ? ' flash' : ' quiz') + '">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title" contenteditable="true" data-f="title" data-ph="' + esc(t('de_ph_title', 'Titolo del documento')) + '">' + esc(_doc.title) + '</div>' +
            '<div class="de-sheet-sub">' + esc((s && s.rootNodeLabel) || '') + ' · ' + esc(isFlash ? t('de_flash', 'Flashcard') : t('de_quiz', 'Quiz')) + '</div>' +
            (isFlash ? '' : _deChip()) +
            '<div class="de-badge">' + _doc.items.length + ' ' + esc(isFlash ? t('de_cards', 'carte') : t('de_questions', 'domande')) + '</div>' +
            '</div>' +
            // La regola, scritta: quanto testo entra in una carta e cosa succede
            // a quelle troppo lunghe generate in automatico.
            (LIM ? '<div class="de-limit' + (_overCards().length ? ' warn' : '') + '">' +
                esc(t('de_limit_note', 'Massimo {q} caratteri per la domanda e {a} per la risposta: è quanto entra nella carta stampata. Le carte più lunghe generate in automatico non vengono stampate — accorciale qui.')
                    .replace('{q}', LIM.question).replace('{a}', LIM.answer)) +
                (_overCards().length
                    ? ' <b>' + esc(t('de_limit_over', 'Fuori soglia adesso: {n}.').replace('{n}', _overCards().map(function (o) { return '#' + (o.i + 1); }).join(', '))) + '</b>'
                    : '') +
                '</div>' : '') +
            '<div class="de-sec-title">' + esc(isFlash ? t('de_cards_c', 'Carte') : t('de_questions_c', 'Domande')) + '</div>' +
            // Le carte/domande stanno in una griglia: a schermo largo vanno su due
            // colonne (solo la PREVIEW — la stampa resta a una colonna come prima).
            '<div class="de-items">' + items + '</div>' +
            '<button type="button" class="de-add" onclick="MappAIDocEditor.addQuestion()"><i data-lucide="plus" class="w-4 h-4"></i> ' +
            esc(isFlash ? t('de_add_card', 'Aggiungi una carta') : t('de_add_q', 'Aggiungi una domanda')) + '</button>' +
            '</div>';
    }

    // ── FOGLIO DEI NODI: la card come esce dalla stampante ──────────────────
    // Le card sono disegnate con le PROPORZIONI vere (A4 orizzontale diviso per
    // il formato) e con i corpi del testo in scala: quello che qui sta dentro la
    // card, sta dentro anche sulla carta.
    // Le misure DENTRO la card non sono più pixel calcolati su un foglio da 800:
    // sono FRAZIONI della card stessa (unità `cqw`, la card è il contenitore di
    // misura). Così la card può crescere quanto vuole con la finestra e il testo
    // resta nella stessa proporzione che avrà sulla carta.
    function _nsPx(fmt) {
        const g = NS().geom(fmt);
        const cq = mm => (mm / g.cardW) * 100;           // mm → % della larghezza card
        const pt = p => cq(p * g.PT2MM);                 // pt → idem
        return {
            g: g,
            title: pt(g.titlePt), kw: pt(g.kwPt), desc: pt(g.descPt), cardTitle: pt(g.cardTitlePt),
            padX: cq(g.padX), rule: cq(8)                // 8 mm = passo delle righe guida
        };
    }

    /** Conteggi mostrati sulla card: testo scritto vs testo che ci entra. */
    function _nsCountText(i) {
        const c = _sheet.cards[i]; if (!c) return '';
        const L = NS().charLimits(_sheet.fmt, c.layout, c.label);
        let s = c.label.length + '/' + L.title;
        if (c.layout === 'keywords') s += ' · ' + c.keywords.length + '/' + L.keywords + ' ' + t('de_ns_kw_short', 'parole');
        if (c.layout === 'card') s += ' · ' + c.desc.length + '/' + L.desc;
        return s;
    }
    function _nsOver(i) {
        const c = _sheet.cards[i];
        return c ? NS().overFields(c, _sheet.fmt).length > 0 : false;
    }
    /** Aggiorna badge e bordo di UNA card senza ri-renderizzare (il cursore resta dov'è). */
    function _paintNsCount(i) {
        const host = _host(); if (!host) return;
        const el = host.querySelector('.de-count[data-nscount="' + i + '"]');
        const card = host.querySelector('.de-ns-card[data-card="' + i + '"]');
        const over = _nsOver(i);
        if (el) {
            el.textContent = _nsCountText(i);
            el.className = 'de-count' + (over ? ' over' : '');
        }
        if (card) card.classList.toggle('over', over);
    }

    function _nodeSheet() {
        const s = _appState();
        const NSC = NS();
        const P = _nsPx(_sheet.fmt);
        const g = P.g;
        const canContent = NSC.allowsContent(_sheet.fmt);
        const counts = NSC.countsByLayout(_sheet.cards);
        const over = NSC.overCards(_sheet.cards, _sheet.fmt);
        const maxLv = _maxLevel();

        // Selettore di profondità: le stesse scelte del modale storico.
        let depthOpts = '<option value="all"' + (_sheet.depth === 'all' ? ' selected' : '') + '>' +
            esc(t('de_ns_depth_all', 'Tutti i livelli')) + '</option>';
        for (let lv = 1; lv <= maxLv; lv++) {
            depthOpts += '<option value="' + lv + '"' + (String(_sheet.depth) === String(lv) ? ' selected' : '') + '>' +
                esc(t('de_ns_depth_upto', 'Fino al livello') + ' ' + lv) + '</option>';
        }

        const fmtBtn = (v, label, sub) =>
            '<button type="button" class="de-ns-fmt' + (_sheet.fmt === v ? ' active' : '') + '" onclick="MappAIDocEditor.nsSetFmt(\'' + v + '\')">' +
            esc(label) + '<small>' + esc(sub) + '</small></button>';

        const allBtn = (v, label) =>
            '<button type="button" class="de-ns-all" onclick="MappAIDocEditor.nsSetAll(\'' + v + '\')"' +
            (!canContent && v !== 'title' ? ' disabled title="' + esc(t('de_ns_only_title', 'Con il formato 3 × 4 nella card entra solo il titolo.')) + '"' : '') +
            '>' + esc(label) + '</button>';

        const ctrl =
            '<div class="de-ns-ctrl">' +
            '<div class="de-ns-ctrl-row">' +
            '<span class="de-ns-lbl">' + esc(t('de_ns_fmt', 'Formato foglio')) + '</span>' +
            fmtBtn('3x4', '3 × 4', t('de_ns_fmt_12', '12 per foglio · solo titolo')) +
            fmtBtn('2x2', '2 × 2', t('de_ns_fmt_4', '4 per foglio')) +
            fmtBtn('2x1', '2 × 1', t('de_ns_fmt_2', '2 per foglio')) +
            '<span class="de-spacer"></span>' +
            '<span class="de-ns-lbl">' + esc(t('de_ns_depth', 'Profondità')) + '</span>' +
            '<select class="de-ns-sel" onchange="MappAIDocEditor.nsSetDepth(this.value)">' + depthOpts + '</select>' +
            '<label class="de-ns-check"><input type="checkbox"' + (_sheet.bg === 'grid' ? ' checked' : '') +
            ' onchange="MappAIDocEditor.nsSetBg(this.checked?\'grid\':\'none\')"> ' + esc(t('de_ns_grid', 'Quadretti 5 mm')) + '</label>' +
            '</div>' +
            '<div class="de-ns-ctrl-row">' +
            '<span class="de-ns-lbl">' + esc(t('de_ns_apply_all', 'A tutte le card')) + '</span>' +
            allBtn('title', t('de_ns_l_title', 'Solo titolo')) +
            allBtn('summary', t('de_ns_l_summary', 'Titolo + spazio')) +
            allBtn('keywords', t('de_ns_l_keywords', 'Titolo + parole chiave')) +
            allBtn('card', t('de_ns_l_card', 'Titolo + descrizione')) +
            '<span class="de-spacer"></span>' +
            '<button type="button" class="de-ns-ai" onclick="MappAIDocEditor.nsKeywordsAI()" title="' +
            esc(t('de_ns_ai_tip', 'Riempie con l\'AI solo le card «parole chiave» ancora vuote: quello che hai scritto tu non si tocca.')) + '">' +
            '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i> ' + esc(t('de_ns_ai', 'Parole chiave con AI')) + '</button>' +
            '</div>' +
            '</div>';

        const cards = _sheet.cards.map(function (c, i) {
            const L = NSC.charLimits(_sheet.fmt, c.layout, c.label);
            const isOver = NSC.overFields(c, _sheet.fmt).length > 0;

            let body = '';
            if (c.layout === 'keywords') {
                const kws = c.keywords.map(function (k, ki) {
                    return '<div class="de-ns-kw' + (k.length > L.keyword ? ' over' : '') + '">' +
                        '<div class="de-ns-kw-t" contenteditable="true" role="textbox" aria-label="' +
                        esc(t('de_ns_a11y_kw', 'Parola chiave') + ' ' + (ki + 1) + ' — ' + t('de_ns_a11y_card', 'Card') + ' ' + (i + 1)) + '"' +
                        ' data-i="' + i + '" data-ns="kw:' + ki + '" data-ph="' + esc(t('de_ns_ph_kw', 'parola chiave…')) + '"' +
                        ' style="font-size:' + P.kw.toFixed(2) + 'cqw">' + esc(k) + '</div>' +
                        '<button type="button" class="de-x" onclick="MappAIDocEditor.nsDelKeyword(' + i + ',' + ki + ')" title="' +
                        esc(t('de_ns_kw_del', 'Elimina parola chiave')) + '">×</button></div>';
                }).join('');
                body = '<div class="de-ns-kws">' + kws +
                    (c.keywords.length < NSC.MAX_KEYWORDS
                        ? '<button type="button" class="de-ns-addkw" onclick="MappAIDocEditor.nsAddKeyword(' + i + ')">+ ' + esc(t('de_ns_kw_add', 'parola chiave')) + '</button>'
                        : '') + '</div>';
            } else if (c.layout === 'card') {
                body = '<div class="de-ns-desc" contenteditable="true" role="textbox" aria-label="' +
                    esc(t('de_ns_a11y_desc', 'Descrizione') + ' — ' + t('de_ns_a11y_card', 'Card') + ' ' + (i + 1)) + '"' +
                    ' data-i="' + i + '" data-ns="desc" data-ph="' + esc(t('de_ns_ph_desc', 'Descrizione stampata sulla card…')) + '"' +
                    ' style="font-size:' + P.desc.toFixed(2) + 'cqw">' + esc(c.desc) + '</div>';
            } else if (c.layout === 'summary') {
                // Righe guida: lo spazio dove lo studente scrive a mano. Passo di
                // 8 mm come sul PDF, ma espresso in frazione di card (mai sotto
                // 7px, altrimenti sulle card piccole diventano una campitura).
                const step = 'max(7px,' + P.rule.toFixed(2) + 'cqw)';
                body = '<div class="de-ns-rules" aria-hidden="true" style="background-image:' +
                    'repeating-linear-gradient(to bottom,transparent 0,transparent calc(' + step + ' - 1px),' +
                    '#e2e8f0 calc(' + step + ' - 1px),#e2e8f0 ' + step + ')"></div>';
            }

            // Menu «+»: dà alla card un contenuto sotto il titolo (o glielo toglie).
            const menu = (_nsMenu === i)
                ? '<div class="de-ns-menu">' +
                ['summary', 'keywords', 'card'].map(function (lay) {
                    const lbl = { summary: t('de_ns_l_summary', 'Titolo + spazio'), keywords: t('de_ns_l_keywords', 'Titolo + parole chiave'), card: t('de_ns_l_card', 'Titolo + descrizione') }[lay];
                    const sub = { summary: t('de_ns_l_summary_d', 'righe vuote da riempire a mano'), keywords: t('de_ns_l_keywords_d', 'fino a 7 parole, una per riga'), card: t('de_ns_l_card_d', 'il testo della scheda, giustificato') }[lay];
                    return '<button type="button" class="de-ns-mi' + (c.layout === lay ? ' active' : '') + '" onclick="MappAIDocEditor.nsSetLayout(' + i + ',\'' + lay + '\')">' +
                        '<b>' + esc(lbl) + '</b><small>' + esc(sub) + '</small></button>';
                }).join('') +
                (c.layout !== 'title'
                    ? '<button type="button" class="de-ns-mi de-ns-mi-off" onclick="MappAIDocEditor.nsSetLayout(' + i + ',\'title\')">' +
                    '<b>' + esc(t('de_ns_l_title', 'Solo titolo')) + '</b><small>' + esc(t('de_ns_l_title_d', 'il titolo torna al centro della card')) + '</small></button>'
                    : '') +
                '</div>'
                : '';

            return '<div class="de-ns-card lay-' + c.layout + (isOver ? ' over' : '') + '" data-card="' + i + '">' +
                '<div class="de-ns-head">' +
                '<span class="de-ns-n">#' + (i + 1) + '</span>' +
                '<span class="de-count' + (isOver ? ' over' : '') + '" data-nscount="' + i + '" title="' +
                esc(t('de_ns_count_tip', 'Caratteri scritti rispetto a quelli che entrano davvero nella card stampata')) + '">' +
                esc(_nsCountText(i)) + '</span>' +
                '<span class="de-ns-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.nsMove(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.nsMove(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-ns-plus' + (_nsMenu === i ? ' active' : '') + '"' + (canContent ? '' : ' disabled') +
                ' onclick="MappAIDocEditor.nsMenu(' + i + ')" aria-expanded="' + (_nsMenu === i ? 'true' : 'false') + '" title="' +
                esc(canContent ? t('de_ns_plus_tip', 'Aggiungi un contenuto sotto il titolo') : t('de_ns_only_title', 'Con il formato 3 × 4 nella card entra solo il titolo.')) +
                '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.nsDelCard(' + i + ')" title="' + esc(t('de_ns_del_tip', 'Togli la card dal foglio')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>' +
                // Le proporzioni vere della card stampata stanno QUI, non sulla
                // cornice: la barra degli strumenti non fa parte del foglio.
                // Il corpo è il CONTENITORE DI MISURA (container-type): tutto ciò
                // che sta dentro è espresso in frazioni della sua larghezza. Il
                // padding sta sull'involucro interno, non qui: un contenitore non
                // può misurare sé stesso.
                '<div class="de-ns-body" style="aspect-ratio:' +
                g.cardW.toFixed(2) + ' / ' + g.cardH.toFixed(2) + '">' +
                '<div class="de-ns-inner" style="padding:' + P.padX.toFixed(2) + 'cqw">' +
                '<div class="de-ns-title" contenteditable="true" role="textbox" aria-label="' +
                esc(t('de_ns_a11y_title', 'Titolo della card') + ' ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-ns="label" data-ph="' + esc(t('de_ns_ph_title', 'Titolo…')) + '"' +
                ' style="font-size:' + (c.layout === 'card' ? P.cardTitle : P.title).toFixed(2) + 'cqw">' + esc(c.label) + '</div>' +
                body +
                '</div></div>' + menu +
                '</div>';
        }).join('');

        const nPages = NSC.pages(_sheet.cards.length, _sheet.fmt);
        const limNote = (function () {
            // La regola scritta: quanto testo entra, per il tipo di contenuto più
            // ricco presente sul foglio.
            const L = NSC.charLimits(_sheet.fmt, canContent ? 'keywords' : 'title', '');
            const Lc = NSC.charLimits(_sheet.fmt, 'card', '');
            return t('de_ns_limit', 'In questo formato entrano circa {t} caratteri di titolo, {k} parole chiave (max {kc} caratteri l\'una) e {d} caratteri di descrizione. Le card oltre soglia hanno il badge ambra: sulla carta uscirebbero tagliate.')
                .replace('{t}', L.title).replace('{k}', L.keywords).replace('{kc}', L.keyword || 0).replace('{d}', Lc.desc);
        })();

        // La classe del formato serve al CSS: i fogli a poche card per pagina
        // (2 × 2, 2 × 1) hanno un tetto di larghezza più basso, altrimenti a
        // schermo intero due card sole diventano enormi.
        return '<div class="de-sheet ns fmt-' + esc(_sheet.fmt) + '">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title">' + esc(t('de_ns', 'Foglio dei nodi')) + '</div>' +
            '<div class="de-sheet-sub">' + esc((s && s.rootNodeLabel) || '') + ' · ' +
            esc(t('de_ns_sub', 'A4 orizzontale, card da ritagliare')) + '</div>' +
            '<div class="de-badge">' + _sheet.cards.length + ' ' + esc(t('de_ns_cards', 'card')) + ' · ' +
            nPages + ' ' + esc(nPages === 1 ? t('de_ns_page', 'pagina') : t('de_ns_pages', 'pagine')) + '</div>' +
            '<div class="de-ns-mix">' +
            esc(t('de_ns_l_title', 'Solo titolo')) + ' ' + counts.title + ' · ' +
            esc(t('de_ns_l_summary', 'Titolo + spazio')) + ' ' + counts.summary + ' · ' +
            esc(t('de_ns_l_keywords', 'Titolo + parole chiave')) + ' ' + counts.keywords + ' · ' +
            esc(t('de_ns_l_card', 'Titolo + descrizione')) + ' ' + counts.card +
            '</div>' +
            '</div>' +
            ctrl +
            '<div class="de-limit' + (over.length ? ' warn' : '') + '">' + esc(limNote) +
            (over.length ? ' <b>' + esc(t('de_ns_over', 'Fuori soglia adesso: {n}.').replace('{n}', over.slice(0, 12).map(o => '#' + (o.i + 1)).join(', ')) + (over.length > 12 ? '…' : '')) + '</b>' : '') +
            '</div>' +
            '<div class="de-ns-grid" style="grid-template-columns:repeat(' + g.cols + ',1fr)">' + cards + '</div>' +
            ((_sheet.excluded && _sheet.excluded.length)
                ? '<button type="button" class="de-add" onclick="MappAIDocEditor.nsRestoreAll()"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> ' +
                esc(t('de_ns_restore', 'Rimetti le card tolte dal foglio') + ' (' + _sheet.excluded.length + ')') + '</button>'
                : '') +
            '<div class="de-note">' + esc(t('de_ns_note', 'Le card si stampano nell\'ordine che vedi, con il tratteggio di taglio. Il nodo nella mappa non viene toccato: qui si lavora solo sul foglio.')) + '</div>' +
            '</div>';
    }

    // Foglio sintesi: stessi tag di blocco del documento stampato (h3/h4/p/li)
    // → il lettore audio continua a trovarli.
    // ── FOGLIO: catena dei perché ───────────────────────────────────────────
    // Stessa cornice degli altri editor (testata, riquadri, strumenti di riga) e
    // stessa resa del documento stampato: un nesso è due lati e un connettivo,
    // con il colore della famiglia sulla pastiglia centrale.
    function _causalSheet() {
        const FAMS = CC().CHAIN_FAMILY_LIST;
        const famMeta = function (f) {
            try { return CCU().famMeta(f); } catch (e) { return { color: '#475569', label: f }; }
        };
        const legend = FAMS.map(function (f) {
            const fm = famMeta(f);
            return '<span class="de-cc-leg"><i style="background:' + esc(fm.color) + '"></i>' + esc(fm.label) + '</span>';
        }).join('');

        const secs = _cc.sections.map(function (sec, si) {
            const rows = sec.rows.map(function (r, ri) {
                const fm = famMeta(r.family);
                const arr = r.type === 'contrast' ? '↔' : '→';
                const origin = r.origin === 'link' ? t('cc_from_map', 'dalla mappa')
                    : r.origin === 'desc' ? (t('cc_from_text', 'dal testo') + (r.nodeLabel ? ' · ' + r.nodeLabel : ''))
                    : t('de_cc_manual', 'scritto da te');
                const field = function (f, ph, cls) {
                    return '<span class="' + cls + '" contenteditable="true" role="textbox"' +
                        ' aria-label="' + esc(ph + ' — ' + sec.label + ' ' + (ri + 1)) + '"' +
                        ' data-cc="' + f + '" data-si="' + si + '" data-ri="' + ri + '"' +
                        ' data-ph="' + esc(ph) + '">' + esc(r[f]) + '</span>';
                };
                return '<div class="de-cc-row">' +
                    '<div class="de-cc-line">' +
                    field('left', t('de_cc_ph_left', 'causa…'), 'de-cc-side') +
                    '<span class="de-cc-conn" style="border-color:' + esc(fm.color) + ';color:' + esc(fm.color) + '">' +
                    '<b class="de-cc-arr">' + arr + '</b>' +
                    field('conn', t('de_cc_ph_conn', 'connettivo…'), 'de-cc-conn-txt') +
                    '<b class="de-cc-arr">' + arr + '</b></span>' +
                    field('right', t('de_cc_ph_right', 'effetto…'), 'de-cc-side') +
                    '</div>' +
                    '<div class="de-cc-meta">' +
                    '<span class="de-cc-badge' + (r.origin === 'manual' ? ' de-cc-badge-man' : '') + '">' + esc(origin) + '</span>' +
                    // Famiglia = colore del nesso: quattro pallini, quello attivo cerchiato.
                    '<span class="de-cc-fams" role="group" aria-label="' + esc(t('de_cc_fam', 'Famiglia del nesso')) + '">' +
                    FAMS.map(function (f) {
                        const m = famMeta(f);
                        return '<button type="button" class="de-cc-fam' + (r.family === f ? ' on' : '') + '"' +
                            ' style="background:' + esc(m.color) + '" title="' + esc(m.label) + '"' +
                            ' aria-pressed="' + (r.family === f ? 'true' : 'false') + '"' +
                            ' onclick="MappAIDocEditor.ccFamily(' + si + ',' + ri + ',\'' + f + '\')"></button>';
                    }).join('') + '</span>' +
                    '<span class="de-cc-tools">' +
                    '<button type="button" class="de-t de-cc-type" onclick="MappAIDocEditor.ccType(' + si + ',' + ri + ')" title="' +
                    esc(r.type === 'contrast' ? t('de_cc_to_cause', 'Trasformalo in causa → effetto') : t('de_cc_to_contrast', 'Trasformalo in contrasto ↔')) + '">' + arr + '</button>' +
                    '<button type="button" class="de-t" onclick="MappAIDocEditor.ccMove(' + si + ',' + ri + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                    '<button type="button" class="de-t" onclick="MappAIDocEditor.ccMove(' + si + ',' + ri + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                    '<button type="button" class="de-t" onclick="MappAIDocEditor.ccAdd(' + si + ',' + ri + ')" title="' + esc(t('de_cc_add_here', 'Aggiungi un nesso qui sotto')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                    '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.ccDel(' + si + ',' + ri + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                    '</span></div></div>';
            }).join('');
            return '<div class="de-cc-sec' + (sec.kind === 'cross' ? ' de-cc-sec-cross' : '') + '">' +
                '<div class="de-cc-sec-title">' + esc(sec.label) +
                (sec.kind === 'cross' ? ' <span class="de-cc-sec-tag">' + esc(t('de_cc_bridges', 'fra rami diversi')) + '</span>' : '') +
                '</div>' + rows +
                (sec.truncated ? '<div class="de-cc-trunc">+' + sec.truncated + ' ' + esc(t('cc_truncated', 'altri nessi non mostrati')) + '</div>' : '') +
                '<button type="button" class="de-cc-addrow" onclick="MappAIDocEditor.ccAdd(' + si + ',' + (sec.rows.length - 1) + ')">+ ' + esc(t('de_cc_add', 'nesso')) + '</button>' +
                '</div>';
        }).join('');

        const n = CC().countRows(_cc);
        return '<div class="de-sheet causal">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title">' + esc(t('cc_doc_title', 'Catena dei perché')) + '</div>' +
            '<div class="de-sheet-sub">' + esc(CCU().mapName()) + ' · ' +
            esc(t('cc_footer', 'nessi estratti dalla mappa e dalle descrizioni — nessuna AI')) + '</div>' +
            '<div class="de-badge">' + n + ' ' + esc(n === 1 ? t('de_cc_nexus', 'nesso') : t('de_cc_nexi', 'nessi')) + '</div>' +
            '<div class="de-cc-legend">' + legend + '</div>' +
            '</div>' +
            '<div class="de-limit">' + esc(t('de_cc_note', 'I nessi sono estratti alla lettera da link e descrizioni: qualcuno regge, qualcuno no. Sistema i due lati, cambia il connettivo, togli quelli che non tengono e aggiungi i tuoi. Il colore dice di che famiglia è il nesso.')) + '</div>' +
            secs +
            '<div class="de-note">' + esc(t('de_cc_foot', 'La versione rivista vale per il documento stampabile, per le pagine in coda al foglio dei nodi e per il vault. La mappa non viene toccata.')) + '</div>' +
            '</div>';
    }

    function _synthSheet() {
        const TAGS = { h3: t('de_tag_h3', 'Titolo'), h4: t('de_tag_h4', 'Sottotitolo'), p: t('de_tag_p', 'Testo'), li: t('de_tag_li', 'Elenco'), blockquote: t('de_tag_q', 'Nota') };
        // Il menu dei tipi: sottotitolo esplicativo, così «Nota» non resta un
        // tipo che esiste nel modello ma che nessuno sa come ottenere.
        const TAG_DESC = {
            h3: t('de_tag_h3_d', 'apre una sezione'),
            h4: t('de_tag_h4_d', 'divide la sezione'),
            p: t('de_tag_p_d', 'il testo che si legge'),
            li: t('de_tag_li_d', 'voce puntata'),
            blockquote: t('de_tag_q_d', 'a margine, in corsivo')
        };
        const TAG_ORDER = ['h3', 'h4', 'p', 'li', 'blockquote'];
        /** Menu dei tipi: `mode` 'set' cambia il blocco i, 'add' ne aggiunge uno sotto. */
        const tagMenu = (i, mode, cur) => '<div class="de-b-menu">' +
            TAG_ORDER.map(function (tg) {
                return '<button type="button" class="de-ns-mi' + (mode === 'set' && tg === cur ? ' active' : '') + '"' +
                    ' onclick="MappAIDocEditor.' + (mode === 'set' ? 'setBlockTag' : 'addBlock') + '(' + i + ',\'' + tg + '\')">' +
                    '<b>' + esc(TAGS[tg]) + '</b><small>' + esc(TAG_DESC[tg]) + '</small></button>';
            }).join('') + '</div>';

        const blocks = _syn.blocks.map(function (b, i) {
            // Blocco generato (citazioni numerate, catena dei perché): resta com'è,
            // in posizione. Non si edita — il suo contenuto viene dalla fonte.
            if (b.tag === 'raw') {
                // `data-ap-skip`: il lettore ad alta voce salta il materiale
                // generato, qui come nel documento stampabile.
                return '<div class="de-block de-b-raw">' +
                    '<span class="de-b-tag de-b-tag-off">' + esc(t('de_tag_raw', 'Generato')) + '</span>' +
                    '<div class="de-b-locked" data-ap-skip>' + b.html + '</div>' +
                    '</div>';
            }
            // Il campo editabile porta il TAG VERO del blocco (h3/h4/p/blockquote;
            // «li» diventa un p, un <li> fuori da una lista non è HTML valido).
            // Senza, il lettore non riconoscerebbe i blocchi e leggerebbe tutto
            // il foglio in un fiato, etichette comprese.
            const et = (b.tag === 'li') ? 'p' : b.tag;
            return '<div class="de-block de-b-' + b.tag + '">' +
                // L'etichetta È il selettore del tipo: cliccandola si passa da
                // TESTO a TITOLO, ELENCO, NOTA… Prima il tipo si poteva solo
                // leggere e il «+» aggiungeva sempre e solo un paragrafo: metà
                // dei tipi (nota compresa) era irraggiungibile dall'editor.
                '<button type="button" class="de-b-tag' + (_bMenu === i ? ' active' : '') + '"' +
                ' onclick="MappAIDocEditor.blockMenu(' + i + ')" aria-expanded="' + (_bMenu === i ? 'true' : 'false') +
                '" title="' + esc(t('de_tag_tip', 'Cambia il tipo di questo blocco')) + '">' +
                esc(TAGS[b.tag] || b.tag) + '</button>' +
                (_bMenu === i ? tagMenu(i, 'set', b.tag) : '') +
                (_bMenu === -100 - i ? tagMenu(i, 'add', null) : '') +
                '<' + et + ' class="de-b-txt" contenteditable="true" role="textbox" aria-label="' + esc((TAGS[b.tag] || b.tag) + ' ' + (i + 1)) + '"' +
                ' data-b="' + i + '" data-ph="' + esc(t('de_ph_b', 'Scrivi…')) + '">' + b.html + '</' + et + '>' +
                '<span class="de-b-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveBlock(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveBlock(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t' + (_bMenu === -100 - i ? ' de-t-on' : '') + '" onclick="MappAIDocEditor.blockAddMenu(' + i + ')" title="' + esc(t('de_add_b_tip', 'Aggiungi un blocco qui sotto: scegli il tipo')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.delBlock(' + i + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>';
        }).join('');
        const stale = DE().audioStale(_syn.base, _syn.blocks);
        return '<div class="de-sheet synth">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title">' + esc(_syn.data.branchLabel || t('de_synth', 'Sintesi')) + '</div>' +
            '<div class="de-sheet-sub">' + esc(_syn.data.mapName || '') + ' · ' + esc(t('de_synth', 'Sintesi')) + '</div>' +
            _deChip() +
            // Lettura ad alta voce del testo IN EDITING: il chip legge i blocchi
            // qui sotto, non una copia. L'evidenziazione usa la CSS Custom
            // Highlight API (Range, nessun tag iniettato) → si può leggere un
            // campo contenteditable senza sporcare quello che poi si salva.
            '<div class="de-tts-row"><span class="de-tts-lbl">' + esc(t('de_tts_label', 'Ascolta come suona')) + '</span>' +
            '<span id="de-tts-slot" data-tts-body="#de-blocks"></span></div>' +
            '</div>' +
            (stale ? '<div class="de-warn">' + esc(t('de_audio_stale', 'Il testo è cambiato: la lettura qui sopra segue sempre le tue parole, ma la VOCE NATURALE (se l\'avevi generata) è una registrazione del testo vecchio — va rifatta a modifiche finite.')) + '</div>' : '') +
            '<div class="de-blocks" id="de-blocks">' + blocks + '</div>' +
            '<button type="button" class="de-add" onclick="MappAIDocEditor.addBlock(' + (_syn.blocks.length - 1) + ',\'p\')"><i data-lucide="plus" class="w-4 h-4"></i> ' + esc(t('de_add_block', 'Aggiungi un paragrafo')) + '</button>' +
            /* ⚠️ Questa riga diceva solo «non si modificano da qui», ed era vera
               finché non si poteva farci NIENTE. Da quando esiste «Sezioni» si
               possono spegnere, e lasciarla com'era voleva dire che il foglio
               contraddiceva un comando che ha due dita più in alto. */
            '<div class="de-note">' + esc(t('de_synth_note',
                'Le fonti citate e la catena dei perché sono generate: qui non si modificano, ma da «Sezioni» si può scegliere se farle comparire nel foglio. I richiami [1] [2] restano nel testo e seguono le Note.')) + '</div>' +
            '</div>';
    }

    // Testo di una card del foglio nodi → modello (senza re-render: il cursore
    // resta dov'è; badge e bordo ambra si aggiornano da soli).
    function _commitNs(el) {
        const i = parseInt(el.getAttribute('data-i'), 10);
        if (isNaN(i) || !_sheet) return;
        const ns = el.getAttribute('data-ns');
        const txt = el.innerText.replace(/\n+/g, ' ');
        const m = /^kw:(\d+)$/.exec(ns);
        if (m) _sheet.cards = NS().setKeyword(_sheet.cards, i, parseInt(m[1], 10), txt);
        else if (ns === 'label' || ns === 'desc') _sheet.cards = NS().setField(_sheet.cards, i, ns, txt);
        else return;
        _dirty = true; _paintDirty(); _paintNsCount(i);
    }

    // ── binding ─────────────────────────────────────────────────────────────
    function _bind(host) {
        // Il picker colore è DENTRO l'HTML rigenerato: va riagganciato a ogni render.
        const col = host.querySelector('#de-color');
        if (col) col.addEventListener('change', function () { applyColor(col.value); });

        // Gli altri listener stanno sull'HOST, che `host.innerHTML = …` NON distrugge:
        // senza questa guardia ogni render ne aggiungerebbe una copia (un incolla
        // inserirebbe il testo N volte, Ctrl+Z annullerebbe N operazioni, e la
        // cronologia si riempirebbe di snapshot identici). Il flag muore col nodo:
        // ELABORA ricrea #elab-doc-host a ogni suo render.
        if (host._deBound) return;
        host._deBound = true;

        // testo: si scrive nel modello mentre si digita, senza ri-renderizzare
        // (un re-render sposterebbe il cursore).
        host.addEventListener('input', function (e) {
            const el = e.target;
            if (!el || !el.hasAttribute) return;
            if (el.hasAttribute('data-b')) {
                _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML);
                // Il testo sotto la lettura è cambiato: via i chunk (e stop, se
                // stava leggendo la frase che si sta riscrivendo). Al prossimo
                // ▶ il lettore ricostruisce dal testo di adesso.
                try { if (window.MappAITTS && window.MappAITTS.invalidate) window.MappAITTS.invalidate(); } catch (er) {}
                return;
            }
            if (el.hasAttribute('data-oq')) {
                /* le RIGHE sono un <input number>: l'evento è lo stesso, ma il
                   valore sta in `.value` e non in `.innerText` */
                const io_ = parseInt(el.getAttribute('data-i'), 10);
                if (!isNaN(io_)) _commitField(io_, el.getAttribute('data-oq'), el.value);
                return;
            }
            if (el.hasAttribute('data-ns')) { _commitNs(el); return; }
            if (el.hasAttribute('data-cc')) { _commitCc(el); return; }
            const f = el.getAttribute('data-f');
            if (!f) return;
            if (f === 'title') { _doc.title = el.innerText.replace(/\s+/g, ' ').trim(); _dirty = true; _paintDirty(); return; }
            const i = parseInt(el.getAttribute('data-i'), 10);
            if (isNaN(i)) return;
            _commitField(i, f, el.innerText.replace(/\n+/g, ' '));
            // il contatore caratteri segue la digitazione (senza re-render)
            if (f === 'question' || f === 'answer') _paintCount(i);
        });

        // primo tasto su un campo = punto di ripristino per l'annulla
        host.addEventListener('focusin', function (e) {
            const el = e.target;
            if (el && el.hasAttribute && (el.hasAttribute('data-f') || el.hasAttribute('data-b') || el.hasAttribute('data-ns') || el.hasAttribute('data-cc'))) {
                _snapshot(t('de_op_text', 'modifica testo'));
            }
        });

        // incolla SEMPRE come testo semplice: dal web arriverebbe markup che il
        // foglio non sa rendere (e che il sanitizer butterebbe comunque).
        host.addEventListener('paste', function (e) {
            const el = e.target;
            if (!el || !el.hasAttribute || !(el.hasAttribute('data-f') || el.hasAttribute('data-b') || el.hasAttribute('data-ns') || el.hasAttribute('data-cc'))) return;
            e.preventDefault();
            const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, txt);
        });

        // Ctrl+Z dentro l'editor = annulla del DOCUMENTO. Senza questa cattura
        // finirebbe all'undo globale del grafo (che qui non c'entra nulla).
        host.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault(); e.stopPropagation();
                undo();
            }
        }, true);

        // Invio: nei campi a riga singola non deve creare righe nel foglio; dentro
        // un blocco di sintesi inserisce un <br> (a capo VERO, che sopravvive alla
        // sanitizzazione) invece del <div> del browser, che verrebbe scartato
        // incollando le due righe in una parola sola.
        host.addEventListener('keydown', function (e) {
            const el = e.target;
            if (e.key !== 'Enter' || e.shiftKey || !el || !el.hasAttribute) return;
            if (el.hasAttribute('data-b')) {
                e.preventDefault();
                // insertLineBreak piazza anche il cursore DOPO l'a capo (con un
                // insertHTML('<br>') secco il testo successivo finirebbe prima).
                let ok = false;
                try { ok = document.execCommand('insertLineBreak'); } catch (err) { ok = false; }
                if (!ok) { try { document.execCommand('insertHTML', false, '<br>&#8203;'); } catch (err) { } }
                _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML);
                return;
            }
            // Foglio nodi: nessun campo è multiriga (titolo, parola chiave e
            // descrizione vengono impaginati dal motore di stampa).
            if (el.hasAttribute('data-ns') || el.hasAttribute('data-cc')) { e.preventDefault(); el.blur(); return; }
            const f = el.getAttribute('data-f');
            if (f && f !== 'explanation') { e.preventDefault(); el.blur(); }
        });

        host.addEventListener('click', function (e) {
            const b = e.target.closest ? e.target.closest('.de-slot') : null;
            if (b) applyColor(b.getAttribute('data-c'));
        });
    }

    // ── stili ───────────────────────────────────────────────────────────────
    // Idempotente, e per due vie: il flag di modulo e la presenza del foglio nel
    // documento. Serve la seconda perché ora la chiama anche chi NON apre un
    // editor (la console, per disegnare una barra in stile `.de-bar`), e quel
    // chiamante non sa se un editor sia mai stato montato.
    function _injectStyles() {
        if (_stylesInjected || document.getElementById('de-styles')) { _stylesInjected = true; return; }
        _stylesInjected = true;
        const css = `
${_deCornice()}
#elab-doc-host { height:100%; overflow:auto; background:#f8fafc; }
.de-list { max-width:900px; margin:0 auto; padding:26px 22px 60px; }
.de-list-head { margin-bottom:22px; }
.de-list-h { font-size:17px; font-weight:900; color:#0f172a; }
.de-list-p { font-size:12px; line-height:1.65; color:#64748b; margin-top:6px; max-width:680px; }
.de-group { background:#fff; border:1px solid #e2e8f0; border-radius:14px; margin-bottom:14px; overflow:hidden; }
.de-group-h { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; color:#475569; padding:11px 16px; background:#f8fafc; border-bottom:1px solid #eef2f6; }
.de-row { display:flex; align-items:center; gap:10px; width:100%; padding:11px 16px; background:#fff; border:0; border-top:1px solid #f1f5f9; cursor:pointer; text-align:left; font:inherit; }
.de-row:first-of-type { border-top:0; }
.de-row:hover { background:#eef2ff; }
.de-row-t { font-size:13px; font-weight:700; color:#1e293b; flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.de-row-b { font-size:10px; font-weight:800; color:#4f46e5; background:#ede9fe; border-radius:999px; padding:2px 9px; flex:0 0 auto; }
.de-row-m { font-size:11px; color:#94a3b8; flex:0 0 auto; }
.de-empty-row { padding:14px 16px; font-size:12px; color:#94a3b8; font-style:italic; }

.de-doc { display:flex; flex-direction:column; height:100%; }
.de-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:#fff; border-bottom:1px solid #e2e8f0; flex:0 0 auto; flex-wrap:wrap; }
/* Dentro la CONSOLE la maniglia della colonna sta nell'angolo in alto a sinistra
   dell'area, proprio alla quota della barra. Misurato: copriva i primi 20px del
   titolo — le lettere «Ca» di «Catena…» — e il clic lì finiva alla maniglia.
   La console-EDITOR è l'unica dove l'area sta a padding:0 (la tela è a filo),
   quindi il posto lo riserva la barra; ma il numero è lo STESSO token dell'area
   (--mnc-man-size), non un 46 scritto a mano: se la maniglia cambia taglia
   nell'officina, il respiro la segue. +12px di aria, che il resto della barra
   ha già. Fuori dalla console non serve e non c'è.
   ⚠️ Niente apici inversi in questo commento: è dentro un template literal e
   il primo che capita chiude la stringa (quarta volta nel progetto). */
.mm-console__area .de-bar { padding-left: calc(var(--mnc-man-size, 34px) + 12px); }
.de-bar-t { font-size:13px; font-weight:800; color:#1e293b; }
.de-dirty { color:#f59e0b; font-size:20px; line-height:0; margin-left:4px; visibility:hidden; }
.de-spacer { flex:1 1 auto; }
.de-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:9px; padding:6px 11px; font:700 11px 'Space Mono',var(--emoji-font),monospace; cursor:pointer; }
.de-btn:hover { background:#eef2ff; color:#4f46e5; }
.de-btn.de-primary { background:#4f46e5; border-color:#4f46e5; color:#fff; }
.de-btn.de-primary:hover { background:#4338ca; color:#fff; }
.de-btn.de-ghost { background:#fff; }
/* Le due facce del bottone di uscita: convivono nel markup ed è _paintDirty()
   ad accendere quella giusta (vedi il commento lì). La faccia «sporca» parte
   spenta, così fra la scrittura dell'HTML e il primo ridisegno non lampeggiano
   tutte e due.
   ⚠️ Niente apici inversi qui dentro: questo CSS vive in un template literal. */
.de-btn .de-exit-clean, .de-btn .de-exit-dirty { display:inline-flex; align-items:center; gap:6px; }
.de-btn .de-exit-dirty { display:none; }
.de-style { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; }
.de-sbtn { width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border:0; background:transparent; color:#475569; border-radius:6px; cursor:pointer; font:700 13px 'Space Mono',monospace; }
.de-sbtn:hover { background:#e0e7ff; color:#4f46e5; }
.de-sep { width:1px; height:18px; background:#e2e8f0; margin:0 3px; }
.de-color { width:26px; height:26px; padding:0; border:1px solid #e2e8f0; border-radius:6px; background:none; cursor:pointer; }
.de-slots { display:inline-flex; gap:3px; }
.de-slot { width:16px; height:16px; border-radius:4px; border:1px solid rgba(15,23,42,.18); cursor:pointer; padding:0; }
.de-slot:hover { transform:scale(1.15); }

/* Dimensione dell'anteprima: − 100% + . Sta a destra, staccata dalle azioni del
   documento (salva/stampa): non è una modifica al documento, è come lo si guarda. */
.de-zoom { display:inline-flex; align-items:center; gap:2px; padding:2px 4px; margin-right:4px;
           background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; }
.de-zoom.changed { border-color:#a5b4fc; background:#eef2ff; }
.de-zbtn { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;
           border:0; background:transparent; color:#475569; border-radius:6px; cursor:pointer;
           font:700 14px 'Space Mono',monospace; line-height:1; }
.de-zbtn:hover { background:#e0e7ff; color:#4f46e5; }
.de-zlbl { min-width:44px; border:0; background:transparent; color:#64748b; cursor:pointer;
           font:700 10px 'Space Mono',monospace; }
.de-zoom.changed .de-zlbl { color:#4f46e5; }
.de-zbtn:focus-visible, .de-zlbl:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }

/* Il contenitore di misura: le regole responsive guardano LA LARGHEZZA DI QUESTO
   riquadro, non quella della finestra — l'editor vive in un pannello di ELABORA
   (affiancato alla fonte), quindi le unità di viewport mentirebbero sullo
   spazio davvero disponibile. */
.de-sheet-wrap { flex:1 1 auto; overflow:auto; container-type:inline-size;
                 padding:24px clamp(14px,3%,56px) 80px; }
/* Il foglio: stesse misure del PDF (A4 a 800px, Space Mono, header card).
   --de-max = quanto può allargarsi · --de-zoom = ingrandimento proporzionale
   sugli schermi grandi. Nessuno dei due tocca la stampa: il PDF esce dai builder,
   che non leggono nulla di questa preview. */
/* --de-user = la dimensione scelta dal docente (bottoni − / + nella barra), che
   MOLTIPLICA quella automatica. Il max-width min(…, 100%): con lo zoom il 100%
   vale la larghezza del pannello diviso lo zoom, quindi il foglio si ferma al
   bordo del pannello per costruzione — a qualunque ingrandimento, senza dover
   ricalcolare i tetti a mano. Nulla di tutto questo tocca la stampa: i builder
   del PDF non leggono il CSS dell'anteprima. */
.de-sheet { --de-max:800px; --de-zoom:1; --de-user:1;
            zoom:calc(var(--de-zoom) * var(--de-user));
            width:100%; max-width:min(var(--de-max), 100%); margin:0 auto;
            font-family:var(--doc-font, var(--app-font, 'Space Mono', var(--emoji-font), monospace)); color:#1e293b; }
/* ⚠️ Il carattere del DOCUMENTO nell'anteprima ha bisogno di !important e di
   specificità: style.css porta una regola sull'universale con font-family
   var(--app-font) !important, che batte qualunque regola di modulo non-important
   — compresa quella qui sopra (misurato: il foglio restava in Space Mono con
   Atkinson già scelto). Una classe in più basta a superarla, e la regola vale
   solo quando una scelta c'è davvero: senza .de-fontdoc il foglio segue la
   Cabina come tutto il resto.
   (E niente apici inversi in questo commento: siamo dentro un template literal,
   dove chiuderebbero la stringa — trappola nota, ottava volta.) */
.de-fontdoc .de-sheet, .de-fontdoc .de-sheet * { font-family:var(--doc-font) !important; }
/* Stesse misure della cornice condivisa (mappai-doc-head.js): l'anteprima
   non può essere impaginata diversamente dal foglio che descrive. */
.de-sheet-head { text-align:center; padding:26px 16px 20px; background:#fff; border-radius:16px; margin-bottom:24px; border-bottom:2px solid #4f46e5; }
.de-sheet.flash .de-sheet-head { border-bottom-color:#059669; }
.de-sheet-title { font-size:20px; font-weight:900; color:#1e293b; outline:none; }
.de-sheet-sub { font-size:10px; color:#64748b; margin-top:4px; }
.de-badge { display:inline-block; margin-top:8px; background:#ede9fe; color:#4f46e5; border-radius:999px; padding:2px 12px; font-size:10px; font-weight:bold; }
.de-sheet.flash .de-badge { background:#dcfce7; color:#059669; }
.de-sec-title { font-size:15px; font-weight:900; color:#4f46e5; margin:20px 0 14px; padding-bottom:5px; border-bottom:2px solid #e2e8f0; }
.de-sheet.flash .de-sec-title { color:#059669; }
/* ── Griglia della preview ────────────────────────────────────────────────
   Una colonna di default; due quando il pannello è largo abbastanza perché
   una colonna resti leggibile (~520px l'una). align-items:start = le card
   non si allungano per pareggiare la vicina (altezze diverse = altezze vere).
   L'ordine resta quello di lettura: sinistra→destra, riga per riga, e ogni
   card porta il proprio numero («CARTA 3») — riordinare resta chiaro. */
.de-items { display:grid; grid-template-columns:1fr; gap:16px; align-items:start; }
.de-item { background:#fff; border-radius:12px; padding:16px 20px; border-left:4px solid #4f46e5; }
.de-sheet.flash .de-item { border-left-color:#059669; }
.de-item-h { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.de-qn { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#4f46e5; }
/* Contatore caratteri della carta: nero finché il testo entra, ambra quando no. */
.de-count { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9;
            border-radius:999px; padding:1px 8px; white-space:nowrap; }
.de-count.over { color:#7c2d12; background:#ffedd5; }
/* La regola scritta, in cima al foglio. */
.de-limit { font-size:11px; line-height:1.5; color:#475569; background:#f8fafc;
            border-left:3px solid #94a3b8; border-radius:8px; padding:8px 12px; margin-bottom:14px; }
.de-limit.warn { color:#7c2d12; background:#fff7ed; border-left-color:#f97316; }
.de-sheet.flash .de-qn { color:#059669; }
/* Strumenti di riga: attenuati ma SEMPRE presenti (a opacity:0 sparivano per chi
   naviga da tastiera) e pieni su hover o quando il fuoco entra nella riga. */
.de-item-tools { margin-left:auto; display:inline-flex; gap:2px; opacity:.45; transition:opacity .12s; }
.de-item:hover .de-item-tools, .de-block:hover .de-b-tools,
.de-item:focus-within .de-item-tools, .de-block:focus-within .de-b-tools { opacity:1; }
.de-t:focus-visible, .de-x:focus-visible, .de-letter:focus-visible, .de-slot:focus-visible,
.de-sbtn:focus-visible, .de-addopt:focus-visible, .de-add:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }
.de-t { width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; background:#fff; color:#64748b; border-radius:6px; cursor:pointer; padding:0; }
.de-t:hover { background:#eef2ff; color:#4f46e5; }
.de-t.de-del:hover { background:#fee2e2; color:#dc2626; border-color:#fecaca; }
.de-q { font-size:15px; font-weight:bold; color:#1e293b; line-height:1.55; margin-bottom:12px; outline:none; border-radius:6px; padding:2px 4px; }
.de-opts { display:flex; flex-direction:column; gap:8px; }
.de-opt { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; }
.de-opt.correct { background:#f0fdf4; border-color:#86efac; }
.de-letter { flex-shrink:0; width:24px; height:24px; border-radius:50%; background:#e2e8f0; color:#475569; font:bold 12px 'Space Mono',monospace; display:flex; align-items:center; justify-content:center; border:0; cursor:pointer; }
.de-opt.correct .de-letter { background:#059669; color:#fff; }
.de-opt-txt { font-size:13px; color:#1e293b; line-height:1.5; flex:1 1 auto; outline:none; padding:2px 4px; border-radius:5px; }
.de-x { border:0; background:transparent; color:#64748b; font-size:15px; cursor:pointer; padding:0 4px; line-height:1; }
.de-x:hover { color:#dc2626; }
.de-addopt { align-self:flex-start; margin-top:2px; border:1px dashed #cbd5e1; background:#fff; color:#64748b; border-radius:8px; padding:5px 12px; font:700 11px 'Space Mono',monospace; cursor:pointer; }
.de-addopt:hover { border-color:#4f46e5; color:#4f46e5; }
.de-answer, .de-expl-row { margin-top:12px; }
.de-lbl { display:block; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin-bottom:4px; }
/* DOMANDE APERTE: le aree (chip che si accendono, max due) e le righe. */
/* AVVIO / PONTE nella testata della domanda: due chip, uno acceso.
   ⚠️ margin-right:auto spinge gli strumenti (su · giù · + · cestino) a destra
   come prima — senza, il chip li trascinerebbe verso il centro e la colonna
   dei comandi ballerebbe da una domanda all'altra.
   L'AVVIO è ambra e non verde: non è uno stato «giusto», è un grado di
   difficoltà — il verde lo si legge come una spunta.
   (Niente apici inversi in questo commento: è dentro un template literal.) */
.de-liv { display:inline-flex; gap:4px; margin-right:auto; }
.de-liv-b { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0; background:#fff;
    color:#94a3b8; cursor:pointer; }
.de-liv-b:hover { border-color:#cbd5e1; color:#475569; }
.de-liv-b.on.base { background:#fef3c7; border-color:#fcd34d; color:#92400e; }
.de-liv-b.on.ponte { background:#eef2ff; border-color:#c7d2fe; color:#4338ca; }
.de-liv-b:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }
.de-oq-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:12px; }
.de-oq-meta .de-lbl { margin-bottom:0; }
.de-oq-lbl-righe { margin-left:8px; }
.de-areas { display:inline-flex; gap:6px; flex-wrap:wrap; }
.de-area { font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px;
  border:1px solid #e2e8f0; background:#f8fafc; color:#475569; cursor:pointer; }
.de-area:hover:not(:disabled) { border-color:#99f6e4; background:#f0fdfa; }
.de-area.on { background:#0f766e; border-color:#0f766e; color:#fff; }
/* spenta e non scegliibile: due aree ci sono già. Non si sostituisce a sorpresa. */
.de-area:disabled { opacity:.4; cursor:not-allowed; }
.de-area:focus-visible { outline:2px solid #0f766e; outline-offset:2px; }
.de-lines { width:56px; font-size:12px; padding:3px 6px; border:1px solid #e2e8f0;
  border-radius:8px; font-family:inherit; color:#1e293b; }
.de-oq-noaree { font-size:11px; color:#94a3b8; }
.de-a { font-size:13px; color:#065f46; background:#f0fdf4; border-radius:8px; padding:8px 12px; outline:none; line-height:1.5; }
.de-expl { font-size:11px; color:#475569; font-style:italic; line-height:1.5; background:#f8fafc; border-radius:8px; padding:7px 11px; outline:none; }
[contenteditable]:hover { box-shadow:inset 0 0 0 1px #e2e8f0; }
[contenteditable]:focus { box-shadow:inset 0 0 0 2px #a5b4fc; background:#fff; }
[contenteditable]:empty:before { content:attr(data-ph); color:#64748b; font-style:italic; }
.de-add { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:6px; padding:12px; border:2px dashed #cbd5e1; background:#fff; color:#64748b; border-radius:12px; font:700 12px 'Space Mono',monospace; cursor:pointer; }
.de-add:hover { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }

/* La carta in preview richiama la carta stampata: domanda sopra, piega
   tratteggiata, retro sul fondo verde. Solo resa a schermo — le misure vere
   della stampa restano quelle di mappai-print-layout.js. */
.de-sheet.flash .de-answer { margin-top:14px; padding-top:12px; border-top:1px dashed #cbd5e1; }
.de-sheet.flash .de-item { display:flex; flex-direction:column; }

/* ══ LA SCALA UNICA DELL'EDITOR (13/8 notte — lo standard è Sintesi/Catena) ══
   Prima c'erano DUE modi di occupare il pannello: Sintesi e Catena crescevano
   IN SCALA (zoom a gradini), quiz, domande aperte e flashcard si ALLARGAVANO
   restando a corpo piccolo — colonne da 1400px con testo a 13px, bande chiare
   ai lati, header minuscoli accanto a fogli enormi. Giacomo ha scelto il primo
   modo come standard: stessa larghezza visiva, stessi caratteri per riga della
   stampa (800px), testo che cresce col pannello.
   --de-lad È IL TOKEN: un gradino solo, deciso dalla larghezza del PANNELLO
   (container query sul wrap, non sulla finestra: l'editor può essere
   affiancato alla fonte). Chi deve crescere lo legge; toccando questi cinque
   numeri si ritara TUTTA la scala dell'editor, ogni genere insieme. */
.de-sheet { --de-lad:1; }
@container (min-width:1120px) { .de-sheet { --de-lad:1.3; } }
@container (min-width:1360px) { .de-sheet { --de-lad:1.6; } }
@container (min-width:1700px) { .de-sheet { --de-lad:1.85; } }
@container (min-width:1900px) { .de-sheet { --de-lad:2; } }
@container (min-width:2300px) { .de-sheet { --de-lad:2.4; } }
/* I fogli di TESTO seguono il gradino per intero: sintesi, catena, quiz e
   domande aperte (classe .quiz), flashcard. La larghezza di impaginazione
   resta 800 (i caratteri per riga del foglio stampato); il max-width
   min(…, 100%) fa sì che 800 × gradino non sfori mai il pannello. */
.de-sheet.synth, .de-sheet.causal, .de-sheet.quiz, .de-sheet.flash { --de-zoom:var(--de-lad); }
/* Le flashcard sono contenuto CORTO: dentro la stessa scala reggono due carte
   per riga (colonna visiva ≥ ~560px dal gradino 1.3 in su), tre sui pannelli
   larghi. La griglia divide la larghezza GIÀ scalata: la soglia è visiva.
   ⚠️ Il tetto largo vale SOLO da quando le colonne sono due: a colonna singola
   il foglio resta a 800 come tutti gli altri — misurato: a 1180 la carta
   singola usciva più larga del quiz accanto, e le bande non coincidevano. */
@container (min-width:1120px) { .de-sheet.flash { --de-max:1180px; }
                                .de-sheet.flash .de-items { grid-template-columns:1fr 1fr; } }
@container (min-width:1700px) { .de-sheet.flash .de-items { grid-template-columns:repeat(3,1fr); } }
/* ── Il foglio dei NODI è l'eccezione dichiarata: specchia la stampa A4 e i
   corpi DENTRO le card sono calcolati dalla geometria della carta (px/mm) —
   uno zoom sopra quel calcolo scalerebbe due volte. Quindi le card continuano
   ad ALLARGARSI (è la carta che cresce), e alla scala unica si aggancia la
   sola TESTATA, che era rimasta minuscola accanto a card enormi. */
.de-sheet.ns .de-sheet-head { zoom:var(--de-lad); }
@container (min-width:1120px) { .de-sheet.ns { --de-max:1180px; } }
@container (min-width:1360px) { .de-sheet.ns { --de-max:1400px; } }
@container (min-width:1700px) { .de-sheet.ns { --de-max:1660px; } }
@container (min-width:2300px) { .de-sheet.ns { --de-max:1720px; } }
/* Tetto per formato: con 2 card per riga oltre ~1400 la singola card diventa
   sproporzionata rispetto al resto dell'interfaccia. Il 3 × 4 (3 colonne, card
   piccole) può invece usare tutta la larghezza. */
.de-sheet.ns.fmt-2x2 { --de-max:1400px; }
/* 2 × 1: la card è verticale (138 × 180 mm). Tetto ancora più basso, se no una
   sola card è più alta dello schermo. */
.de-sheet.ns.fmt-2x1 { --de-max:1180px; }

/* (La scala di Sintesi e Catena vive nel token --de-lad qui sopra: era il loro
   modo di crescere, ed è diventato lo standard di tutti i fogli di testo.) */

/* ── Catena dei perché: stessa resa del documento stampato ───────────────── */
.de-sheet.causal .de-sheet-head { border-bottom-color:#4f46e5; }
.de-cc-legend { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:12px; font-size:10px; color:#475569; }
.de-cc-leg i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
.de-cc-sec { background:#fff; border-radius:14px; padding:14px 18px; margin-bottom:14px; }
.de-cc-sec-cross { border:2px dashed #a5b4fc; }
.de-cc-sec-title { font-size:14px; font-weight:900; color:#4f46e5; margin:0 0 8px; padding-bottom:6px; border-bottom:1px solid #eef2ff; }
.de-cc-sec-tag { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
.de-cc-row { padding:7px 0; border-bottom:1px dashed #e2e8f0; }
.de-cc-row:last-of-type { border-bottom:0; }
.de-cc-line { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; line-height:1.7; font-size:11px; }
.de-cc-side { flex:1 1 34%; min-width:120px; color:#334155; outline:none; padding:2px 5px; border-radius:6px; }
.de-cc-conn { display:inline-flex; align-items:baseline; gap:5px; border:1.5px solid; border-radius:9999px;
              padding:1px 9px; font-size:11px; font-weight:700; white-space:nowrap; flex:0 0 auto; }
.de-cc-conn-txt { outline:none; min-width:52px; display:inline-block; }
.de-cc-arr { font-weight:700; }
.de-cc-meta { display:flex; align-items:center; gap:8px; margin-top:3px; flex-wrap:wrap; }
.de-cc-badge { font-size:8.5px; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; }
.de-cc-badge-man { color:#4f46e5; }
.de-cc-fams { display:inline-flex; gap:3px; }
/* Pallini della famiglia: 14px di colore, ma il bersaglio del clic è 22px
   (i pallini stanno in fila e a 14 si sbaglia mira). */
.de-cc-fam { width:22px; height:22px; padding:0; border:0; border-radius:50%; cursor:pointer;
             background-clip:content-box !important; border:4px solid transparent; }
.de-cc-fam.on { outline:2px solid #0f172a; outline-offset:-1px; }
.de-cc-fam:focus-visible { outline:2px solid #4f46e5; outline-offset:1px; }
.de-cc-tools { margin-left:auto; display:inline-flex; gap:2px; opacity:.45; transition:opacity .12s; }
.de-cc-row:hover .de-cc-tools, .de-cc-row:focus-within .de-cc-tools { opacity:1; }
.de-cc-type { font:700 12px 'Space Mono',monospace; }
.de-cc-trunc { margin-top:6px; font-size:10px; color:#94a3b8; font-style:italic; }
.de-cc-addrow { margin-top:8px; border:1px dashed #cbd5e1; background:#fff; color:#64748b;
                border-radius:8px; padding:4px 12px; font:700 11px 'Space Mono',monospace; cursor:pointer; }
.de-cc-addrow:hover { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }

/* Sintesi: le dimensioni del testo dipendono dal tipo di blocco, non dall'utente. */
.de-sheet.synth .de-blocks { background:#fff; border-radius:16px; padding:20px 24px; }
/* align-items:baseline — la targhetta si allinea alla PRIMA RIGA del blocco da
   sola, qualunque siano i corpi in gioco. Con flex-start servivano quattro
   scostamenti a mano (uno per tipo di blocco) da ricalibrare a ogni ritocco
   tipografico: la linea di base non si ricalibra mai. */
.de-block { position:relative; display:flex; align-items:baseline; gap:10px; padding:3px 0; }
/* La colonna delle etichette: larga in CARATTERI (12ch ≥ «SOTTOTITOLO», che è
   la più lunga), non in px — così regge qualunque corpo del testo senza andare
   a capo e senza spingere la colonna del testo. Allineata a DESTRA, contro il
   testo: l'occhio scende su un bordo solo. Il -10px la fa sporgere nel margine
   del foglio: l'etichetta è un'indicazione di servizio, non parte del testo, e
   la colonna del testo resta dov'era (la larghezza compensa lo spostamento). */
/* L'etichetta NON è il documento: è la targhetta che dice che cos'è il blocco.
   Quindi non segue l'ingrandimento del foglio — resta della stessa dimensione a
   schermo a qualunque zoom, e la sua colonna con lei. Si ottiene dividendo il
   corpo per lo zoom in vigore (il foglio poi lo rimoltiplica): 9px sullo schermo,
   sempre. La larghezza, espressa in caratteri (ch), segue il corpo compensato:
   anche la colonna resta ferma e i due bordi di allineamento non si separano
   mentre il documento cresce.
   Il padding-top invece NON si compensa: serve a mettere la targhetta sulla prima
   riga del testo, e quella riga sta in px del foglio, non dello schermo.
   (Longhand e non la scorciatoia «font»: con un calc() la barra prima
   dell'interlinea diventa ambigua e la dichiarazione viene scartata.) */
.de-b-tag { --de-zsum:calc(var(--de-zoom, 1) * var(--de-user, 1));
            flex:0 0 15ch; box-sizing:border-box; min-width:0; white-space:nowrap;
            margin-left:calc(-10px / var(--de-zsum)); padding:0 calc(10px / var(--de-zsum)) 0 0;
            font-family:'Space Mono',monospace; font-weight:700; line-height:1.2;
            font-size:calc(9px / var(--de-zsum));
            text-align:right; text-transform:uppercase;
            letter-spacing:.05em; color:#94a3b8; background:transparent;
            border:0; border-radius:6px; cursor:pointer; }
.de-b-tag:hover, .de-b-tag.active { color:#4f46e5; background:#eef2ff; }
/* Il blocco generato non cambia tipo: la sua etichetta è solo un'etichetta. */
.de-b-tag-off { cursor:default; pointer-events:none; }
.de-b-tag:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }
/* Menu dei tipi di blocco (stessa forma di quello del foglio nodi). */
.de-b-menu { position:absolute; left:0; top:26px; z-index:6; width:min(250px,90%);
             background:#fff; border:1px solid #e2e8f0; border-radius:10px;
             box-shadow:0 12px 28px rgba(15,23,42,.16); padding:4px; }
.de-b-menu .de-ns-mi b { font-size:11px; }
.de-t.de-t-on { background:#eef2ff; color:#4f46e5; border-color:#a5b4fc; }
/* margin:0 — il campo editabile ora è il tag vero (p/h3/h4/blockquote), che
   porterebbe i margini di default del browser. */
.de-b-txt { flex:1 1 auto; outline:none; padding:3px 6px; border-radius:6px; min-height:1.2em; margin:0; }
/* Lettura ad alta voce del testo in editing */
.de-tts-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
.de-tts-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#64748b; }
/* Lo spazio sopra un titolo sta sulla RIGA, non sul testo. Messo sul testo,
   spingeva giù solo la colonna di destra: l'etichetta restava in cima (è l'altro
   elemento della riga) e TITOLO/SOTTOTITOLO risultavano più alti del testo che
   annunciano — 14px e 9px di scarto, misurati. Sulla riga scendono insieme, come
   già accadeva a TESTO e a GENERATO, che margini sopra non ne hanno. */
.de-block + .de-b-h3 { margin-top:12px; }
.de-block + .de-b-h4 { margin-top:8px; }
.de-b-h3 .de-b-txt { font-size:14px; font-weight:900; color:#4f46e5; margin:0 0 4px; }
.de-b-h4 .de-b-txt { font-size:12px; font-weight:700; color:#1e293b; margin:0 0 2px; }
.de-b-p .de-b-txt { font-size:11px; line-height:1.7; color:#334155; }
.de-b-li .de-b-txt { font-size:11px; line-height:1.7; color:#334155; margin-left:18px; list-style:disc; }
.de-b-li .de-b-txt:before { content:'•'; color:#94a3b8; margin-right:7px; }
.de-b-blockquote .de-b-txt { font-size:11px; line-height:1.7; color:#475569; border-left:3px solid #e2e8f0; padding-left:10px; font-style:italic; }
.de-b-txt sup { color:#4f46e5; font-weight:bold; }
/* blocchi generati (citazioni, catena dei perché): visibili, non editabili */
.de-b-locked { flex:1 1 auto; font-size:10px; line-height:1.6; color:#64748b; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px; padding:8px 10px; max-height:140px; overflow:auto; }
.de-b-locked * { font-size:10px !important; color:#64748b !important; }
/* I quattro comandi del blocco erano in fila in alto a destra, SOPRA il testo:
   156px stesi sulla prima riga (misurato: sconfinavano di 153px dentro il
   riquadro). Ora stanno 2×2 in un CORRIDOIO riservato dentro il riquadro, che
   il testo non usa: non coprono mai una parola.
   Perché non fuori a destra: restano 72px e i comandi ne vogliono 156 — e a
   zoom alto lo spazio si riduce ancora, perché il foglio si allarga fino al
   bordo. Perché non nella colonna dell'etichetta a sinistra: quella resta
   costante a schermo mentre i bottoni crescono con lo zoom, quindi prima o poi
   non ci starebbero (provato: 220px contro 88 di colonna).
   Il corridoio invece è espresso nelle stesse unità dei bottoni: cresce con
   loro, e la misura non può divergere.
   ⚠️ Niente apici inversi in questo commento: sta dentro un template literal e
   lo chiuderebbero (quarta volta in questo progetto). */
.de-b-txt { padding-right:58px; }
.de-b-tools { position:absolute; right:2px; top:2px; width:52px;
    display:grid; grid-template-columns:repeat(2,24px); gap:2px;
    opacity:0; transition:opacity .12s; }
.de-warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:9px 13px; font-size:11px; line-height:1.5; margin-bottom:14px; }
.de-note { font-size:10px; color:#64748b; font-style:italic; margin-top:14px; text-align:center; }

/* ── Foglio dei nodi: le card hanno le proporzioni della carta ────────────── */
.de-sheet.ns .de-sheet-head { border-bottom-color:#f97316; }
.de-sheet.ns .de-badge { background:#ffedd5; color:#c2410c; }
.de-ns-mix { font-size:10px; color:#64748b; margin-top:7px; }
.de-ns-ctrl { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px; margin-bottom:14px; }
.de-ns-ctrl-row { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.de-ns-ctrl-row + .de-ns-ctrl-row { margin-top:9px; padding-top:9px; border-top:1px solid #f1f5f9; }
.de-ns-lbl { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#64748b; }
.de-ns-fmt { border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:9px; padding:5px 10px; font:800 11px 'Space Mono',monospace; cursor:pointer; text-align:left; }
.de-ns-fmt small { display:block; font-size:9px; font-weight:400; color:#94a3b8; margin-top:1px; }
.de-ns-fmt.active { border-color:#f97316; background:#fff7ed; color:#c2410c; }
.de-ns-fmt.active small { color:#ea580c; }
.de-ns-sel { border:1px solid #e2e8f0; border-radius:8px; padding:5px 8px; font:700 11px 'Space Mono',monospace; color:#475569; background:#fff; cursor:pointer; }
/* Il comando compatto delle sezioni della sintesi: le due spunte nella barra
   la mandavano a capo (misurato: 113px liberi contro 166 richiesti). */
.de-sez { position:relative; flex:0 0 auto; }
.de-sez > summary { list-style:none; cursor:pointer; border:1px solid #e2e8f0; background:#f8fafc;
                    color:#475569; border-radius:9px; padding:6px 11px; font:700 11px var(--app-font, monospace);
                    white-space:nowrap; user-select:none; }
.de-sez > summary::-webkit-details-marker { display:none; }
.de-sez > summary:hover { background:#eef2ff; color:#4338ca; }
.de-sez[data-spente] > summary { border-color:#fbbf24; background:#fffbeb; color:#92400e; }
.de-sez[open] > summary { background:#eef2ff; color:#4338ca; }
.de-sez-p { position:absolute; top:calc(100% + 6px); right:0; z-index:40; display:flex;
            flex-direction:column; gap:8px; min-width:210px; padding:10px 12px; background:#fff;
            border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 12px 28px rgba(15,23,42,.16); }
.de-sez-p .de-ns-check { white-space:nowrap; }
.de-ns-check { display:inline-flex; align-items:center; gap:6px; font:700 11px 'Space Mono',monospace; color:#475569; cursor:pointer; }
.de-ns-all { border:1px dashed #cbd5e1; background:#fff; color:#64748b; border-radius:8px; padding:5px 10px; font:700 11px 'Space Mono',monospace; cursor:pointer; }
.de-ns-all:hover:not(:disabled) { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }
.de-ns-all:disabled { opacity:.4; cursor:not-allowed; }
.de-ns-ai { display:inline-flex; align-items:center; gap:6px; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:9px; padding:5px 11px; font:700 11px 'Space Mono',monospace; cursor:pointer; }
.de-ns-ai:hover { background:#eef2ff; color:#4f46e5; }
.de-ns-grid { display:grid; gap:10px; }
/* La card: proporzioni reali (aspect-ratio dalla geometria del foglio). */
.de-ns-card { position:relative; background:#fff; border:1px dashed #fb923c; border-radius:10px; display:flex; flex-direction:column; overflow:hidden; }
.de-ns-card.over { border-color:#f59e0b; box-shadow:0 0 0 2px #fef3c7 inset; }
.de-ns-head { display:flex; align-items:center; gap:6px; padding:4px 6px; background:#f8fafc; border-bottom:1px solid #f1f5f9; flex:0 0 auto; }
.de-ns-n { font-size:10px; font-weight:800; color:#c2410c; }
.de-ns-tools { margin-left:auto; display:inline-flex; gap:2px; opacity:.45; transition:opacity .12s; }
.de-ns-card:hover .de-ns-tools, .de-ns-card:focus-within .de-ns-tools { opacity:1; }
.de-ns-plus.active { background:#eef2ff; color:#4f46e5; border-color:#a5b4fc; }
/* box-sizing esplicito: l'aspect-ratio deve valere sul RIQUADRO della card
   (padding compreso), altrimenti le proporzioni a schermo non sono quelle
   della carta. container-type: la card è l'unità di misura di quel che contiene
   (corpi del testo e margini interni sono frazioni di questa larghezza). */
.de-ns-body { box-sizing:border-box; flex:1 1 auto; display:flex; min-height:0; overflow:hidden;
              container-type:inline-size; }
.de-ns-inner { box-sizing:border-box; flex:1 1 auto; min-width:0; min-height:0;
               display:flex; flex-direction:column; overflow:hidden;
              /* Il GRUPPO titolo + contenuto sta al centro della card e cresce nei
                 due versi: una sola parola chiave non spinge il titolo in cima.
                 «safe» = quando il blocco è più alto della card riparte dall'alto,
                 così non si taglia la testa del testo. */
              justify-content:safe center; }
/* Centratura: la regola vale per TUTTI i tipi di contenuto (vedi .de-ns-inner).
   Con «spazio da scrivere» le righe riempiono la card (.de-ns-rules cresce),
   quindi lì il titolo resta in alto — come nel foglio stampato. */
.de-ns-title { font-weight:900; color:#1e293b; line-height:1.25; text-align:center; outline:none; border-radius:5px; word-break:break-word; }
.de-ns-card.lay-card .de-ns-title { text-align:left; line-height:1.2; margin-bottom:4px; }
.de-ns-kws { flex:0 1 auto; display:flex; flex-direction:column; gap:2px; margin-top:5px; overflow:auto; }
.de-ns-kw { display:flex; align-items:center; gap:4px; }
.de-ns-kw-t { flex:1 1 auto; text-align:center; color:#5a5a5a; outline:none; border-radius:4px; padding:1px 3px; word-break:break-word; }
.de-ns-kw.over .de-ns-kw-t { background:#ffedd5; color:#7c2d12; }
.de-ns-addkw { align-self:center; margin-top:3px; border:1px dashed #cbd5e1; background:#fff; color:#94a3b8; border-radius:7px; padding:2px 9px; font:700 10px 'Space Mono',monospace; cursor:pointer; }
.de-ns-addkw:hover { border-color:#4f46e5; color:#4f46e5; }
.de-ns-desc { flex:0 1 auto; color:#1e1e1e; line-height:1.4; text-align:justify; outline:none; border-radius:5px; overflow:auto; word-break:break-word; }
.de-ns-rules { flex:1 1 auto; margin-top:6px; }
.de-ns-menu { position:absolute; right:6px; top:30px; z-index:5; width:min(230px,92%); background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 12px 28px rgba(15,23,42,.16); padding:4px; }
.de-ns-mi { display:block; width:100%; text-align:left; border:0; background:transparent; border-radius:7px; padding:6px 8px; cursor:pointer; font:inherit; }
.de-ns-mi:hover { background:#eef2ff; }
.de-ns-mi b { display:block; font-size:11px; font-weight:800; color:#1e293b; }
.de-ns-mi small { display:block; font-size:10px; color:#94a3b8; margin-top:1px; }
.de-ns-mi.active b { color:#4f46e5; }
.de-ns-mi-off { border-top:1px solid #f1f5f9; margin-top:2px; }
.de-ns-mi-off b { color:#64748b; }

.de-radio { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; margin-bottom:8px; cursor:pointer; }
.de-radio:hover { border-color:#a5b4fc; background:#f8fafc; }
.de-radio b { display:block; font-size:12px; color:#1e293b; }
.de-radio small { display:block; font-size:11px; color:#64748b; margin-top:2px; }
.de-modal-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin:4px 0 8px; }
.de-fmt-row { display:flex; gap:8px; margin-bottom:12px; }
.de-fmt { flex:1 1 0; text-align:center; border:1px solid #e2e8f0; border-radius:10px; padding:10px 6px; cursor:pointer; font-size:13px; font-weight:800; color:#1e293b; }
.de-fmt small { display:block; font-size:10px; font-weight:400; color:#94a3b8; margin-top:3px; }
.de-fmt input { display:none; }
.de-fmt:has(input:checked) { border-color:#4f46e5; background:#eef2ff; color:#4f46e5; }
`;
        const st = document.createElement('style');
        st.id = 'de-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ── superficie pubblica ─────────────────────────────────────────────────
    window.MappAIDocEditor = {
        render: render,
        /* l'editor ha davvero un documento aperto? La console lo chiede dopo un
           tentativo di apertura: se ha rinunciato, torna al suo segnaposto. */
        haDocumento: function () { return _view === 'doc'; },
        reset: function () { _view = 'list'; _doc = null; _syn = null; _sheet = null; _kind = null; _dirty = false; _nsMenu = -1; _bMenu = -1; },
        hasUnsaved: function () { return _dirty; },
        // «Il documento aperto appartiene alla mappa che è aperta adesso?» — ELABORA
        // lo chiede all'entrata per non mostrare i documenti di un'altra mappa.
        sameMap: function () { return _sameMap(); },
        // Che tipo di documento è aperto: serve alla voce naturale, che si
        // genera solo a sintesi salvata (è una registrazione, non segue le
        // modifiche come la lettura a voce di sistema).
        kind: function () { return (_view === 'doc') ? _kind : null; },
        openSet: openSet, openSynthesis: openSynthesis, backToList: backToList,
        creaPdf: creaPdf,
        /* Domande aperte: si aprono dalla voce d'ARCHIVIO (il foglio HTML porta
           la sua sorgente incorporata) — non da `studySets`, dove non entrano. */
        openOpenQuestions: openOpenQuestions, oqArea: oqArea, oqLivello: oqLivello,
        /* L'uscita a due stati (vedi `esci()`). `save()` resta esposta perché la
           console di ELABORA la chiama per conto suo quando si cambia documento
           con del lavoro in sospeso (`_conSalvataggio`). */
        esci: esci,
        // Sintesi dal FILE nel vault (Promise<boolean>: false = ha già avvisato).
        openSynthesisFromVault: openSynthesisFromVault,
        /* Il foglio `.de-bar`/`.de-btn`/`.de-spacer` senza aprire un editor: la
           console disegna la sua barra con le stesse classi, e senza questo lo
           stile arriverebbe solo dopo il primo documento aperto. */
        assicuraStili: _injectStyles,
        // foglio dei nodi
        openNodeSheet: openNodeSheet, nsSetFmt: nsSetFmt, nsSetBg: nsSetBg, nsSetDepth: nsSetDepth,
        nsMenu: nsMenu, nsSetLayout: nsSetLayout, nsSetAll: nsSetAll, nsAddKeyword: nsAddKeyword,
        nsDelKeyword: nsDelKeyword, nsMove: nsMove, nsDelCard: nsDelCard, nsRestoreAll: nsRestoreAll,
        nsKeywordsAI: nsKeywordsAI,
        // catena dei perché
        openCausal: openCausal, ccFamily: ccFamily, ccType: ccType,
        ccAdd: ccAdd, ccDel: ccDel, ccMove: ccMove,
        addQuestion: addQuestion, delQuestion: delQuestion, moveQ: moveQ,
        addOption: addOption, delOption: delOption, setCorrect: setCorrect,
        addBlock: addBlock, delBlock: delBlock, moveBlock: moveBlock,
        blockMenu: blockMenu, blockAddMenu: blockAddMenu, setBlockTag: setBlockTag,
        zoomStep: zoomStep, zoomReset: zoomReset, setFont: setFont, mostraSezione: mostraSezione,
        fmt: fmt, applyColor: applyColor, eyedropper: eyedropper,
        undo: undo, save: save, print: print, exportHtml: exportHtml, saveToVault: saveToVault,
        voceNaturale: voceNaturale,
        salvaConNome: salvaConNome,
        openAnswersModal: openAnswersModal, openFlashModal: openFlashModal
    };

    console.log('[MappAI] mappai-doc-editor.js caricato ✓');
})();
