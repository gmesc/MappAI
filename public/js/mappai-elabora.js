// ══════════════════════════════════════════════════════════════════════════
// MappAI — ELABORA (guscio del co-docente, tab landing tra Costruisci e Insegna)
// ══════════════════════════════════════════════════════════════════════════
//
// Ambiente DOCENTE post-generazione: split-screen fonte ↔ analisi. Mostra il
// profilo descrittivo del materiale + le card di arricchimento (citazioni
// VERBATIM dalla fonte) prodotte da mappai-enrich-core (deterministico, zero AI).
//
// Principi (spec 012): descrittivo mai giudicante · advisory mai gate ·
// anti-fabbricazione (citazione verbatim, mai testo AI) · attrito/fluency.
//
// Decisioni utente (22/7/26):
//  1) "+Aggiungi citazione" → apre il MODALE EDIT esistente precompilato (il
//     docente ritocca e salva). Percorso di scrittura UNICO (openEditModal).
//  2) Lavora sulla MAPPA CORRENTE (appState.db). Nessun picker.
//  3) Il materiale aggiunto (testo/PDF) è PERSISTITO in appState.sources.
//  4) Grassetto/rich-text = dopo (giuntura pronta: si scrive via edit modal).
//
// Emoji: Android/Noto (var(--emoji-font)), scelta utente per questo tab.
// Icone/azioni passano da un dispatcher unico → nuovi tipi di card si innestano.
(function () {
    'use strict';

    function _appState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    /* ── I DATI DELLA MAPPA ENTRANO COME DATI (25/9/2026) ────────────────────
       All'apertura di ELABORA la fonte, l'albero e le card si compongono in un
       solo `innerHTML`, con i valori del vault ricevuto da un collega: gli id
       dei nodi dentro `onclick="…('…')"` protetti dal solo apice, i colori di
       `customColors` dentro `style="…"` così com'erano, il livello e la
       profondità del triage senza escape. Qui dentro ogni codice ha
       `window.electronAPI`, cioè il disco del docente.
       L'escape è quello del nucleo (mappai-html-sicuro.js, caricato prima): i
       cinque caratteri, apice compreso; senza, un ripiego che fa lo stesso. */
    function esc(s) {
        if (window.MappAIHtmlSicuro && window.MappAIHtmlSicuro.esc) return window.MappAIHtmlSicuro.esc(s);
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    }
    /* Un DATO dentro un gestore in linea (`onclick="MappAIElabora.f(…)"`).
       L'escape da solo non basta: il parser HTML scioglie `&#39;` e `&quot;`
       PRIMA che il codice parta. `JSON.stringify` scrive un letterale di
       stringa JS valido (virgolette, barre, a capo), l'escape lo tiene dentro
       l'attributo: alla funzione arriva il valore intero, come argomento. */
    function _js(v) { return esc(JSON.stringify(String(v == null ? '' : v))); }
    /* Un colore dei DATI che entra in uno `style="…"`: passa solo un colore —
       `#rgb`, `#rrggbb`, `rgb()`/`rgba()` con `normColor` dell'editor dei
       documenti (caricato prima), e senza di lui gli esadecimali. Torna sempre
       `#rrggbb`, oppure null: chi chiama ripiega sul colore di sempre. */
    function _coloreSicuro(v) {
        const DE = window.MappAIDocEdit;
        if (DE && DE.normColor) return DE.normColor(v);
        const c = String(v == null ? '' : v).trim().toLowerCase();
        const m = /^#([0-9a-f]{3})$/.exec(c);
        if (m) return '#' + m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2];
        return /^#[0-9a-f]{6}$/.test(c) ? c : null;
    }
    function t(k, f) { return window.t ? window.t(k, f) : f; }

    // emoji Noto per concetto (rese col font emoji Android via classe .elab-emo)
    const EMO = { triage: '🧠', signal: '💡', coverage: '💬', gap: '🔗', add: '📄', cite: '➕', ignore: '✖️', search: '🔍', pencil: '✏️' };
    const emo = k => '<span class="elab-emo">' + (EMO[k] || '') + '</span>';

    let _R = null;                 // ultimo risultato analyzeEnrichment
    let _ignored = new Set();      // card ignorate in sessione (chiave)
    let _stylesInjected = false;
    let _forceEmpty = false;       // uscita manuale dal workspace fullscreen → torna al picker
    // MODALITÀ di elaborazione: 'source' = lavoro sulla fonte (analisi, copertura,
    // evidenziazione); 'docs' = lavoro sui documenti di output già generati (quiz,
    // flashcard, sintesi, foglio dei nodi) — editor in mappai-doc-editor.js.
    // Si ENTRA sempre dai DOCUMENTI (scelta utente 27/7/26): è il motivo per cui si
    // apre ELABORA. L'analisi della fonte resta a un clic sul segmento.
    let _mode = 'docs';
    let _srcView = 'text';         // vista pannello fonte: 'text' | 'pdf' | 'figure' (0113/0114)
    let _figNome = null;           // 0114: la vista «Figure» di UN PDF (la riga della tabella); null = tutti
    let _manScossa = false;        // 0118: il chip della maniglia si scuote alla PRIMA apparizione, non a ogni `render`
    let _rightView = 'cards';      // vista pannello destro: 'cards' | 'tree'
    let _treeCollapsed = new Set();// nodi collassati nell'albero ELABORA (indipendente dalla sidebar)
    let _dragId = null;            // nodo trascinato nell'albero (drag&drop → sposta)
    let _mergePick = null;         // nodo sorgente di «Fondi in…» in attesa del target
    let _pdfIdx = 0;               // PDF selezionato nella vista anteprima
    let _pdfToken = 0;             // annulla render PDF concorrenti/obsoleti
    let _pdfSeq = 0;               // contatore MONOTONO di sessione (id univoci cross-progetto)
    const _pdfFiles = new Map();   // sourceId → File (PDF aggiunti in ELABORA, sessione)
    /* A QUALE vault appartengono le fonti che stanno in `appState.sources`.
       Serve a distinguere «ci sono già fonti» da «ci sono le fonti GIUSTE»:
       senza, aprendo una seconda mappa si tenevano quelle della prima. `null`
       = non lo sappiamo (mappa nuova, fonti caricate da CREA prima che il vault
       esistesse): in quel caso la prima apertura di un vault le sostituisce. */
    let _fontiDiVault = null;
    /* 0059: e DI QUALE elenco parla `_fontiDiVault` — l'array stesso, non il suo
       contenuto. «Carica un progetto» (`loadSavedProject`) sostituisce tutto
       `appState` e le fonti con lui, senza passare di qui: `_fontiDiVault`
       restava il vault di prima e, riaprendo quel vault, il ripristino teneva
       le fonti dell'altro progetto. Si assegnano sempre insieme. */
    let _fontiLista = null;

    function hasMap() {
        const s = _appState();
        return !!(s && s.db && Array.isArray(s.db.nodes) && s.db.nodes.length > 1 && s.extractionMode === 'mindmap');
    }

    // #1: rimuove le intestazioni/piè di pagina ricorrenti (default ON, kill-switch
    // 'mappai_strip_boilerplate'='0') → non inquinano evidenziazione/analisi/export.
    function _stripBoilerplateOn() { try { return localStorage.getItem('mappai_strip_boilerplate') !== '0'; } catch (e) { return true; } }
    function _corpus() {
        const s = _appState();
        try {
            let c = (window.MappAIDescFidelity && window.MappAIDescFidelity.corpusFromState(s)) || '';
            if (c && window.MappAIBoilerplate && _stripBoilerplateOn()) {
                c = window.MappAIBoilerplate.stripBoilerplate(c).text;
                // #1: righe strutturali (domande, «Doc. N», titoli, righe vuote) fuori dal
                // corpus → non vengono evidenziate come contenuto della mappa.
                if (window.MappAIBoilerplate.stripStructuralLines) c = window.MappAIBoilerplate.stripStructuralLines(c).text;
            }
            return c;
        } catch (e) { return ''; }
    }

    // ── entrata nel tab ─────────────────────────────────────────────────────
    function open() {
        if ((_appState() || {}).extractionMode === 'lettura') {
            const reading = window.MappAIPercorsoLettura;
            if (reading && typeof reading.openCurrent === 'function') return reading.openCurrent();
            window.showAlert(t('alert_error_title', 'Errore'), t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'));
            return;
        }
        // ── Cablaggio bento (8/8): ELABORA diventa una CONSOLE ────────────────
        // Colonna dei documenti + area a tutta larghezza con l'editor vero.
        // ⚠️ La console apre il workspace classico per la FONTE (è un ponte
        // dichiarato): quella chiamata passa `_daConsole` per non rimbalzare
        // qui dentro all'infinito. Col flag spento non cambia nulla.
        try {
            if (!open._daConsole && window.MappAIElaboraConsole &&
                window.MappAIElaboraConsole.attiva && window.MappAIElaboraConsole.attiva()) {
                window.MappAIElaboraConsole.open();
                return;
            }
        } catch (e) { /* console assente: si prosegue col workspace storico */ }
        // Ogni ENTRATA in ELABORA riparte dai Documenti (il segmento resta lì per
        // passare alla fonte). Solo qui, non in render(): dentro la sessione il
        // tab scelto dal docente non deve saltare via da solo.
        _mode = 'docs';
        // Editor rimasto aperto su un ALTRO progetto (si cambia mappa senza passare
        // dal picker): azzeralo, così i Documenti sono quelli della mappa corrente.
        // Con modifiche non salvate lo lasciamo stare — le perderemmo in silenzio, e
        // il salvataggio ha già la sua guardia sulla mappa sbagliata.
        try {
            const DE = window.MappAIDocEditor;
            if (DE && DE.sameMap && !DE.sameMap() && !(DE.hasUnsaved && DE.hasUnsaved())) DE.reset();
        } catch (e) { /* editor assente */ }
        _injectStyles(); render();
    }

    /* L'analisi che serve a disegnare la fonte: struttura + copertura + marcatori
       + i PDF raccolti, con lo stato di vista normalizzato. Stava dentro
       `render()`; ora la chiamano render() e `renderSource()` (la console), così
       la fonte non può essere analizzata in due modi diversi. */
    function _analisi() {
        const EC = window.MappAIEnrichCore;
        if (!EC) return null;
        const s = _appState();
        let structural = [];
        try {
            if (window.MappAIStructureAnalyzer) {
                structural = window.MappAIStructureAnalyzer.analyzeStructure(s.db.nodes, s.db.links, { mode: s.extractionMode }).suggestions || [];
            }
        } catch (e) { /* soft */ }
        _R = EC.analyzeEnrichment(s, { structuralSuggestions: structural });
        _buildMarks(_R, s);
        const pdfs = _collectPdfs();
        if (_srcView === 'pdf' && !pdfs.length) _srcView = 'text';
        if (_pdfIdx >= pdfs.length) _pdfIdx = 0;
        return { s: s, R: _R, pdfs: pdfs };
    }

    /* ── LA FONTE DENTRO LA CONSOLE ───────────────────────────────────────────
       `mountSource(el)` dice: da ora la fonte si disegna LÌ. Il guard in testa a
       `render()` è il pezzo che fa funzionare tutto il resto senza riscriverlo:
       i comandi della fonte (segmenti testo/PDF, Card/Albero, «Ignora
       intestazioni», ignora/aggiungi citazione…) chiamano `render()` da sempre —
       con l'host acceso, quella chiamata ridisegna nella console invece di
       riaprire il workspace a tutto schermo. Zero gestori duplicati.
       ⚠️ `isConnected`: la console si ridisegna sostituendo il riquadro, quindi
       l'host di un giro prima è staccato dal documento — e disegnarci dentro
       vorrebbe dire scrivere in un nodo che nessuno vede. */
    let _srcHost = null;
    /* opts = { view:'text'|'pdf', pdfIdx:n } — la vista si passa QUI e non con i
       setter: `setSrcView`/`setPdfIdx` chiamano `render()`, e chiamati prima del
       montaggio (con l'host del giro precedente già staccato dal documento)
       riaprirebbero il workspace a tutto schermo. Un disegno solo, alla fine. */
    function mountSource(el, opts) {
        if (!el) return false;
        _srcHost = el;
        _mode = 'source';
        /* Vault salvato prima dell'indice delle fonti: il PDF c'è, il testo no.
           Lo si estrae ADESSO — che è il momento in cui serve — e il risultato
           finisce nel vault, così la volta dopo è già pronto. Non si attende: la
           fonte si disegna subito con quello che c'è, e il ridisegno arriva quando
           il testo è pronto (`renderSource` è idempotente). */
        try {
            _completaTestiMancanti().then(function (n) { if (n) renderSource(); }).catch(function () { });
        } catch (e) { }
        if (opts) {
            if (opts.view) _srcView = (opts.view === 'pdf') ? 'pdf' : (opts.view === 'figure' ? 'figure' : 'text');   // 'figure': 0114, dalla tabella «Figure»
            if (opts.pdfIdx != null) _pdfIdx = opts.pdfIdx | 0;
            _figNome = (_srcView === 'figure' && opts.pdfNome) ? String(opts.pdfNome) : null;
        }
        _injectStyles();
        return renderSource();
    }
    function unmountSource() { _srcHost = null; _pdfToken++; _figPdfChiudi(); }   // 0118: le pagine del PDF a destra si liberano con la console
    function renderSource() {
        if (!_srcHost || !_srcHost.isConnected) return false;
        if (!hasMap()) { _srcHost.innerHTML = '<div class="elab-empty">' + t('el_no_map', 'Nessuna mappa aperta.') + '</div>'; return false; }
        const a = _analisi();
        if (!a) { _srcHost.innerHTML = '<div class="elab-empty">' + t('el_no_engine', 'Motore di analisi non disponibile.') + '</div>'; return false; }
        _srcHost.innerHTML = _sourceBodyHTML(a.s, a.R, a.pdfs);
        if (window.safeCreateIcons) window.safeCreateIcons({ root: _srcHost });
        _montaManiglia(_srcHost);   // 0118
        if (_srcView === 'pdf' && a.pdfs.length) _mountPdf(a.pdfs);
        if (_srcView === 'figure') { _figMonta(); _figPdfMonta(); }
        return true;
    }
    /* ── 0096: l'interruttore dei comandi della fonte (Giacomo, 14/10) ──────
       Acceso se manca o vale '1'. Con '0' tornano la barra a sinistra, «Aggiungi
       PDF» sempre premibile, l'export di prima e la doppia barra della Catena
       (la console lo chiede a `comandiFonte`). Restano accesi comunque i guasti:
       il modale di prima e il velo dell'export prendono il piano dal motore. */
    function comandiFonte() {
        try { return localStorage.getItem('mappai_comandi_fonte') !== '0'; } catch (e) { return true; }
    }
    /* ── 0118: la maniglia fra fonte e analisi, e il PDF a destra nella vista «Figure» ──
       Due interruttori, accesi salvo '0' (invariante 1). La maniglia è quella del Banco
       (`MappAIManiglia`, regole in `mappai-maniglia-core.js`): la fonte si chiude oltre il
       bordo SINISTRO. La preferenza `mappai_elabora_fonte` è una per le due viste; la
       predefinita 0,535 tiene le proporzioni di prima (1,15fr : 1fr). `render` riscrive
       `#ec-src`, quindi si rimonta dopo ogni disegno. */
    function _manigliaAccesa() {
        try { return localStorage.getItem('mappai_elabora_maniglia') !== '0'; } catch (e) { return true; }
    }
    function _figPdfAccesa() {
        try { return localStorage.getItem('mappai_figure_pdf_destra') !== '0'; } catch (e) { return true; }
    }
    function _montaManiglia(root) {
        if (!root || !root.querySelector || !window.MappAIManiglia) return null;
        const split = root.querySelector('.elab-split-man');
        const man = split && split.querySelector('.elab-maniglia');
        const pannello = split && split.querySelector('.elab-pane');   // il primo: la fonte
        if (!man || !pannello) return null;
        _manScossa = true;
        const fig = _srcView === 'figure' && _figPdfAccesa();   // a sinistra le figure, a destra il PDF
        return window.MappAIManiglia.monta({
            contenitore: split, pannello, maniglia: man,
            chiave: 'mappai_elabora_fonte', variabile: '--elab-fonte-w', lato: 'sinistra',
            minPannello: 280, minAltro: 320, predefinita: 0.535, stretta: '(max-width: 900px)',
            etichette: fig ? {
                apri: t('el_split_open_fig', 'Riapri le figure: trascina o fai clic'),
                sposta: t('el_split_move_fig', 'Sposta il confine fra le figure e il PDF; oltre il bordo sinistro le figure si chiudono')
            } : {
                apri: t('el_split_open', 'Riapri la fonte: trascina o fai clic'),
                sposta: t('el_split_move', 'Sposta il confine fra fonte e analisi; oltre il bordo sinistro la fonte si chiude')
            }
        });
    }
    /* «il PDF della scheda didattica è già allegato» (0096, B): un PDF che ELABORA sa
       mostrare — in memoria, aggiunto qui, o letto da `Fonti/`/`Allegati/` dopo un
       riavvio. Un PDF perso (vault di prima dello 0059 senza copia) non conta: lì
       il docente deve poterlo rimettere. */
    function haPdf() { return _collectPdfs().length > 0; }
    function motivoPdfGia() {
        return t('el_add_pdf_gia', 'Il PDF della scheda è già allegato: un progetto ne ha uno solo.');
    }
    /* i comandi della fonte per la console: gli stessi gesti della barra del
       workspace, dichiarati come DATI perché lì la barra è della console. */
    function sourceActions() {
        /* «blocco sempre» (Giacomo, 14/10): niente secondo PDF, anche se diverso.
           Il bottone resta al suo posto, spento, e il fumetto dice perché. */
        const giaPdf = comandiFonte() && haPdf();
        return [
            { id: 'src-questions', etichetta: t('el_questions', 'Domande della fonte'), icona: 'help-circle' },
            { id: 'src-hl', etichetta: t('el_export_hl', 'Esporta evidenziata'), icona: 'file-output' },
            { id: 'src-areas', etichetta: t('el_export_areas', 'Esporta per aree'), icona: 'files' },
            { id: 'src-text', etichetta: t('el_add_text', 'Incolla testo'), icona: 'clipboard-paste' },
            giaPdf
                ? { id: 'src-pdf', etichetta: t('el_add_pdf', 'Aggiungi PDF'), icona: 'plus', ruolo: 'primario', spento: true, fumetto: motivoPdfGia() }
                : { id: 'src-pdf', etichetta: t('el_add_pdf', 'Aggiungi PDF'), icona: 'plus', ruolo: 'primario' }
        ];
    }
    function runSourceAction(id) {
        if (id === 'src-questions') return openQuestions();
        if (id === 'src-hl') return exportHighlightedPdf();
        if (id === 'src-areas') return exportAreas();
        if (id === 'src-text') return addTextPrompt();
        if (id === 'src-pdf') return pickPdf();
    }

    function render() {
        // Anche i render differiti della landing rispettano la console del percorso.
        if (_appState()?.extractionMode === 'lettura') { _teardownOverlay(); return; }
        /* la fonte è montata nella console: si ridisegna lì, e il workspace a
           tutto schermo non si apre nemmeno */
        if (_srcHost && _srcHost.isConnected) { if (renderSource()) return; }
        /* 🐛 preesistente, trovato l'8/8 notte: la landing chiama `render()` per
           suo conto — la ri-sincronizzazione dei vault dopo l'ingresso in ELABORA
           (`_ensureFreshAndRerender`) e il filtro classe — e con la console aperta
           quel render costruiva il WORKSPACE a tutto schermo dietro di lei
           (misurato: `#elab-overlay` presente con la console aperta). Con la
           console in piedi la superficie di ELABORA è la console: qui non c'è
           niente da disegnare, e chi ridisegna è lei. */
        try {
            var C = window.MappAIElaboraConsole;
            if (C && C.aperta && C.aperta()) { _teardownOverlay(); return; }
        } catch (e) { /* console assente: si prosegue col workspace storico */ }
        const host = document.getElementById('elabora-content');
        if (!host) return;
        _injectStyles();
        // Empty-state (picker mappe) resta dentro la landing (#elabora-content). Il
        // WORKSPACE vive invece in un overlay a livello di body (#elab-overlay, portal):
        // .glass-card conserva un transform residuo (animate-fade-in forwards) che crea
        // un containing-block e romperebbe position:fixed del fullscreen.
        if (!hasMap() || _forceEmpty) {
            _teardownOverlay();
            host.innerHTML = _emptyState(); _renderProjects();
            if (window.safeCreateIcons) window.safeCreateIcons();
            return;
        }
        const overlay = _ensureOverlay();
        const a = _analisi();
        if (!a) { overlay.innerHTML = '<div class="elab-empty">' + t('el_no_engine', 'Motore di analisi non disponibile.') + '</div>'; return; }
        const pdfs = a.pdfs;
        host.innerHTML = '';
        overlay.innerHTML = _shell(a.s, _R, pdfs);
        document.body.classList.add('elab-fullscreen');
        if (window.safeCreateIcons) window.safeCreateIcons({ root: overlay });
        if (_mode === 'docs') {
            // L'editor documenti si disegna da sé nel proprio host: mantiene lo stato
            // (documento aperto, cronologia annulla) tra un render e l'altro.
            if (window.MappAIDocEditor) window.MappAIDocEditor.render();
            return;
        }
        _montaManiglia(overlay);   // 0118
        if (_srcView === 'pdf' && pdfs.length) _mountPdf(pdfs);
        if (_srcView === 'figure') { _figMonta(); _figPdfMonta(); }
    }

    // portal a livello di body (sfugge al containing-block di .glass-card)
    function _ensureOverlay() {
        let el = document.getElementById('elab-overlay');
        if (!el) { el = document.createElement('div'); el.id = 'elab-overlay'; document.body.appendChild(el); }
        _hookEditSave();
        return el;
    }

    // saveEditNode ri-renderizza canvas+sidebar ma NON l'analisi ELABORA:
    // wrap una-volta per ricalcolare quando il workspace è aperto.
    let _saveHooked = false;
    function _hookEditSave() {
        if (_saveHooked || typeof window.saveEditNode !== 'function') return;
        _saveHooked = true;
        const orig = window.saveEditNode;
        window.saveEditNode = function () {
            orig.apply(this, arguments);
            if (document.getElementById('elab-overlay')) render();
        };
    }
    function _teardownOverlay() {
        _pdfToken++; // annulla eventuale render PDF ancora in corso
        const el = document.getElementById('elab-overlay');
        if (el) { el.remove(); if (_figPdf && !(_srcHost && _srcHost.isConnected)) _figPdfChiudi(); }   // 0118: il PDF a destra era dell'overlay
        document.body.classList.remove('elab-fullscreen');
    }

    // ── viste ───────────────────────────────────────────────────────────────
    function _emptyState() {
        // Sezione allineata a Insegna «Progetti esistenti» (#4, 22/7): stesse classi
        // teach-section-card + teach-filter-seg + tabella condivisa (fileTable).
        return '<div class="elab-empty">' +
            '<div class="elab-empty-emo elab-emo">' + EMO.pencil + '</div>' +
            '<div class="elab-empty-h">' + t('el_empty_h', 'Scegli una mappa da elaborare') + '</div>' +
            '<div class="elab-empty-p">' + t('el_empty_p', 'ELABORA analizza una mappa già generata: profilo del materiale, copertura della fonte e suggerimenti per arricchirla — senza modifiche automatiche.') + '</div>' +
            '</div>' +
            '<div class="teach-section-card">' +
              '<div class="w-full flex items-center justify-between px-5 py-3 bg-slate-50">' +
                '<span class="flex items-center gap-2 text-sm font-bold text-slate-600">' +
                  '<i data-lucide="folder-open" class="w-4 h-4 text-indigo-400"></i>' + t('ui_teach_projects', 'Progetti esistenti') +
                '</span>' +
                '<div class="inline-flex rounded-full bg-slate-100 p-1 shadow-inner">' +
                  '<button type="button" id="elab-filter-all" class="teach-filter-seg px-3 py-1.5 rounded-full text-[11px] font-bold transition-all" onclick="window.MappAITeach && window.MappAITeach.setClassFilter(\'all\')">' + t('ui_teach_filter_all', 'Tutti') + '</button>' +
                  '<button type="button" id="elab-filter-class" class="teach-filter-seg px-3 py-1.5 rounded-full text-[11px] font-bold transition-all" onclick="window.MappAITeach && window.MappAITeach.setClassFilter(\'active\')">' + t('ui_teach_filter_class', 'Classe') + '</button>' +
                '</div>' +
              '</div>' +
              '<div id="elab-projects" class="px-3 py-3"></div>' +
            '</div>';
    }

    function _renderProjects() {
        // Layout tabella IDENTICO a Insegna (Tipo/Titolo/Classe/Data), senza
        // Riprendi/QR; riga → openProject. Il renderer vive in landing-teach dove i
        // riferimenti (StorageManager const, fileTable…) sono in scope corretto.
        if (window.MappAITeach && window.MappAITeach.renderElaboraProjects) {
            window.MappAITeach.renderElaboraProjects('elab-projects');
        }
        // stato attivo del toggle filtro (applyFilterSeg gira solo in applyMode)
        var f = 'all'; try { f = localStorage.getItem('mappai_teach_class_filter') === 'active' ? 'active' : 'all'; } catch (e) { }
        var a = document.getElementById('elab-filter-all'), c = document.getElementById('elab-filter-class');
        if (a) a.classList.toggle('active', f === 'all');
        if (c) c.classList.toggle('active', f === 'active');
    }

    // click su una mappa in ELABORA: carica il progetto (window.loadSavedProject È
    // su window), poi entra in elaborazione sulla mappa caricata.
    function openProject(id) {
        if (typeof window.loadSavedProject === 'function') {
            // cambio progetto: libera i PDF della sessione precedente e resetta la
            // vista fonte (evita di ereditare un'anteprima PDF di un'altra mappa).
            _pdfFiles.clear(); _srcView = 'text'; _pdfIdx = 0; _figNome = null;
            _forceEmpty = false;
            // L'editor documenti resterebbe aperto sul documento della mappa
            // precedente: azzeralo (i quiz appartengono alla loro mappa).
            if (window.MappAIDocEditor) {
                if (window.MappAIDocEditor.hasUnsaved && window.MappAIDocEditor.hasUnsaved() &&
                    !confirm(t('el_docs_unsaved', 'Ci sono modifiche non salvate nel documento. Uscire comunque?'))) return;
                window.MappAIDocEditor.reset();
            }
            // Aprendo un progetto da ELABORA si entra dai DOCUMENTI: è il motivo
            // per cui ci si arriva (rivedere quiz, flashcard e sintesi prima di
            // stamparli). L'analisi della fonte resta a un clic sul segmento.
            _mode = 'docs';
            /* 0082 (B4 (a)): col cassetto solo indice acceso un progetto senza copia
               si apre dalla cartella, e la mappa cambia dopo la lettura del disco:
               `dopoApertura` aspetta la promessa di `loadSavedProject`, poi lo stesso
               ritardo di oggi. Spento, il setTimeout di oggi senza attesa. */
            const apri = function () { setTimeout(function () { openFromMap(); }, 350); };
            if (typeof StorageManager !== 'undefined' && StorageManager.dopoApertura) StorageManager.dopoApertura(window.loadSavedProject(id), apri);
            else { window.loadSavedProject(id); apri(); }
        }
    }

    // esce dal workspace fullscreen e torna al picker ELABORA (non alla mappa)
    function exitWorkspace() { _forceEmpty = true; render(); }

    function _shell(s, R, pdfs) {
        pdfs = pdfs || [];
        const mapName = esc(s.rootNodeLabel || 'Mappa');
        const corpus = _corpus();
        const nCards = (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId)).length +
            (R.text.signals || []).filter(x => !_ignored.has('sig:' + x.key)).length +
            (R.structural || []).filter((x, i) => !_ignored.has('str:' + i)).length;

        // Selettore di MODALITÀ: la fonte da una parte, i documenti già prodotti
        // dall'altra. Le azioni della barra valgono solo per la modalità «Fonte»
        // (in «Documenti» le uscite sono nella barra dell'editor).
        const modeSeg =
            '<div class="elab-srcseg elab-modeseg">' +
              '<button type="button" class="elab-seg' + (_mode === 'source' ? ' active' : '') + '" onclick="MappAIElabora.setMode(\'source\')" title="' + t('el_mode_src_tip', 'Analisi della fonte: copertura, evidenziazione, suggerimenti') + '">' + t('el_mode_src', 'Fonte') + '</button>' +
              '<button type="button" class="elab-seg' + (_mode === 'docs' ? ' active' : '') + '" onclick="MappAIElabora.setMode(\'docs\')" title="' + t('el_mode_docs_tip', 'Rivedi quiz, flashcard e sintesi già generati prima di stamparli o condividerli') + '">' + t('el_mode_docs', 'Documenti') + '</button>' +
            '</div>';

        const srcActions =
            '<button type="button" class="elab-btn" onclick="MappAIElabora.openQuestions()" title="' + t('el_questions_tip', 'Recupera le domande/esercizi della fonte per usarle in un quiz') + '">❓ ' + t('el_questions', 'Domande della fonte') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.exportHighlightedPdf()" title="' + t('el_export_hl_tip', 'Esporta il PDF originale con le frasi evidenziate per macro-area (fonte solo-testo → documento riflowato)') + '">📄 ' + t('el_export_hl', 'Esporta evidenziata') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.exportAreas()" title="' + t('el_export_areas_tip', 'Raccoglie le frasi della fonte per macro-area, stampabile/PDF') + '">📑 ' + t('el_export_areas', 'Esporta per aree') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.addTextPrompt()">' + emo('pencil') + ' ' + t('el_add_text', 'Incolla testo') + '</button>' +
            '<button type="button" class="elab-btn elab-primary" onclick="MappAIElabora.pickPdf()">' + emo('add') + ' ' + t('el_add_pdf', 'Aggiungi PDF') + '</button>' +
            '<input type="file" id="elab-pdf-input" accept="application/pdf,.pdf" class="hidden" onchange="MappAIElabora.onPdf(this)">';

        const sourceBody = _sourceBodyHTML(s, R, pdfs);

        return '' +
        '<div class="elab-ws">' +
          '<div class="elab-bar">' +
            '<button type="button" class="elab-btn elab-ghost" onclick="MappAIElabora.backToMap()">‹ ' + t('el_back_to_map', 'Mappa') + '</button>' +
            '<div class="elab-title">' + emo('search') + ' ' + mapName + ' <span class="elab-crumb">· ' + t('el_crumb', 'elaborazione') + '</span></div>' +
            modeSeg +
            '<div class="elab-spacer"></div>' +
            (_mode === 'source' ? srcActions : '') +
            '<button type="button" class="elab-close" onclick="MappAIElabora.exitWorkspace()" title="' + t('el_exit', 'Chiudi ed esci dal fullscreen') + '">✕</button>' +
          '</div>' +
          (_mode === 'docs' ? '<div id="elab-doc-host"></div>' : sourceBody) +
        '</div>';
    }

    /* ── il CORPO della fonte, staccato dalla pagina che lo conteneva ──────────
       Era scritto dentro `_shell`, cioè dentro il workspace a tutto schermo: la
       console poteva solo APRIRE quel workspace (il «ponte» dell'8/8). Ora è una
       funzione sua e le due superfici la chiamano entrambe — una scrittura, due
       posti, nessuna copia da tenere allineata. Quello che resta in `_shell` è
       la CORNICE (barra, segmenti, uscita): nella console quei comandi ce li ha
       la console. */
    function _sourceBodyHTML(s, R, pdfs) {
        const corpus = _corpus();
        const nCards = (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId)).length +
            (R.text.signals || []).filter(x => !_ignored.has('sig:' + x.key)).length +
            (R.structural || []).filter((x, i) => !_ignored.has('str:' + i)).length;
        /* 0118: la barra fra fonte e analisi è la maniglia (`mappai-maniglia.js`, montata da `_montaManiglia` dopo il disegno);
           con `mappai_elabora_maniglia` = '0' torna la barra fissa di 9 px. Nella vista «Figure», con `mappai_figure_pdf_destra`
           acceso, lo split destro è il PDF originale (Giacomo, 21/10: «analisi e struttura dell'albero in questa fase non servono»). */
        const man = _manigliaAccesa() && !!window.MappAIManiglia;   // senza il modulo, la barra di prima: mai una maniglia muta
        const srcPane = _srcPaneHTML(corpus, pdfs);   // prima della destra: decide se la vista «Figure» resta (`_srcView`)
        const figPdf = _srcView === 'figure' && _figPdfAccesa();
        return '' +
          _triageStrip(s, R) +
          '<div class="elab-split' + (man ? ' elab-split-man' + (_manScossa ? '' : ' elab-scuoti') : '') + '">' +
            srcPane +
            (man ? '<div class="elab-maniglia"></div>' : '<div class="elab-divider"><span class="elab-grip"></span></div>') +
            (figPdf ? _figPdfPaneHTML() :
            '<section class="elab-pane">' +
              '<div class="elab-pane-head"><span class="elab-lbl">' + t('el_analysis', 'Analisi &amp; suggerimenti') + '</span>' +
                '<div class="elab-srcseg">' +
                  '<button type="button" class="elab-seg' + (_rightView === 'cards' ? ' active' : '') + '" onclick="MappAIElabora.setRightView(\'cards\')">' + t('el_view_cards', 'Card') + '</button>' +
                  '<button type="button" class="elab-seg' + (_rightView === 'tree' ? ' active' : '') + '" onclick="MappAIElabora.setRightView(\'tree\')">' + t('el_view_tree', 'Albero') + '</button>' +
                '</div>' +
                '<div class="elab-spacer"></div><span class="elab-lbl elab-muted">' + (_rightView === 'tree' ? ((s.db.nodes || []).length + ' ' + t('el_nodes', 'nodi')) : (nCards + ' ' + t('el_to_see', 'da vedere'))) + '</span></div>' +
              (_rightView === 'tree'
                ? '<div class="elab-pane-body">' + _treeHTML(s, R) + '</div>'
                : '<div class="elab-pane-body"><div class="elab-stack">' +
                    _signalsHTML(R) + _coverageHTML(R) + _structuralHTML(R) +
                    (nCards === 0 ? '<div class="elab-done">' + emo('coverage') + ' ' + t('el_all_good', 'Materiale ben coperto — nessun suggerimento in sospeso.') + '</div>' : '') +
                  '</div></div>') +
            '</section>') +
          '</div>' +
          _legend();
    }

    function _triageStrip(s, R) {
        const tr = s.mmTriage;
        let tt, td, verdict;
        if (tr && tr.essentialDepth) {
            const type = { taxonomic: 'tassonomico', procedural: 'procedurale', 'causal-narrative': 'causale/narrativo', mixed: 'misto' }[tr.contentType] || tr.contentType;
            tt = t('el_triage_t', 'Struttura della fonte') + ' · ' + esc(type);
            td = esc(tr.rationale || t('el_triage_d', 'Il contenuto essenziale vive fino al livello indicato.'));
            verdict = t('el_essential', 'essenziale') + ' · L' + esc(tr.essentialDepth);
        } else {
            // fallback deterministico (nessun triage salvato) — dai segnali di testo
            tt = t('el_profile', 'Profilo del materiale');
            td = (R.text.words || 0) + ' ' + t('el_words', 'parole') + ' · ' + (R.text.sentences || 0) + ' ' + t('el_sentences', 'frasi') + ' · ' +
                (R.text.connectives.causale.count || 0) + ' ' + t('el_causal', 'nessi causali');
            if (R.text.gulpease && R.text.gulpease.avg != null) {
                td += ' · ' + t('el_gulpease', 'leggibilità (Gulpease)') + ' ' + R.text.gulpease.avg;
            }
            verdict = t('el_deterministic', 'analisi locale');
        }
        return '<div class="elab-triage">' +
            '<span class="elab-ti">' + emo('triage') + '</span>' +
            '<div><div class="elab-tt">' + tt + '</div><div class="elab-td">' + td + '</div></div>' +
            '<span class="elab-verdict">' + verdict + '</span>' +
        '</div>';
    }

    // ── ancoraggio bidirezionale fonte ↔ card (task «boost» 22/7) ────────────
    // _marks: frase normalizzata → {ci, ri, nodeId} sui residui delle card VISIBILI
    // (stessi indici filtrati di _coverageHTML/addCitation — coerenza garantita
    // perché render() ricalcola tutto dopo ogni ignore()).
    let _marks = null;
    let _covIdx = null;   // indice lessicale di ciò che è GIÀ nelle schede (label+desc)

    function _normKey(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

    // ── colori delle MACRO-AREE (22/7) ───────────────────────────────────────
    // Il colore di un nodo = colore del suo GROUP (tutto il ramo L1 lo condivide),
    // preso da customColors o dalla colorScale globale — identico a _treeRow.
    let _covUnits = null;     // [{ group, color, index }] — unità di confronto lessicale
    let _covThreshold = 0.65; // soglia containment per il colore PIENO (cuore del concetto)
    let _covWeak = 0.5;       // soglia inferiore per il colore TENUE (associazione moderata:
    //                           frase rilevante ma "riassunta" dalla mappa — es. pagine narrative)
    // A/B: legacy = confronto per MACRO-AREA (indice = desc di TUTTI i nodi del
    // gruppo, soglia 0.6) → colorava quasi ogni frase (il lessico della fonte è
    // quasi tutto nelle desc). Nuovo (default): confronto per NODO (indice = la
    // SOLA desc del nodo, soglia 0.65) → colora solo le frasi che sono davvero il
    // cuore di un concetto specifico; il generico/non-coperto resta pulito.
    function _hlLegacy() { try { return localStorage.getItem('mappai_elab_highlight_legacy') === '1'; } catch (e) { return false; } }
    function _nodeGroupOf(n) { return (n && n.level === 0) ? 0 : (n ? n.group : undefined); }
    /* Il colore di un gruppo passa da `_coloreSicuro`: da qui escono i colori
       di TUTTO il modulo — evidenziazione della fonte e del PDF, albero, i due
       documenti esportati (`_areaSections`, `_highlightedDocBody`), la legenda.
       Un `customColors` che non è un colore vale «nessun colore personale». */
    function _groupColorOf(grp) {
        const s = _appState();
        try {
            const cc = s.db.customColors || {};
            if (cc[grp] !== undefined) { const c = _coloreSicuro(cc[grp]); if (c) return c; }
            if (typeof colorScale !== 'undefined' && colorScale && colorScale[grp]) return colorScale[grp];
        } catch (e) { /* soft */ }
        return '#94a3b8';
    }
    /* colore → rgba con alpha. Prima un `rgb(…)` o un testo qualunque tornavano
       così com'erano, cioè dentro `style="…"`: ora il colore passa da
       `_coloreSicuro` (che scrive `#rrggbb`) e il resto diventa il grigio. */
    function _rgba(color, a) {
        const n = parseInt((_coloreSicuro(color) || '#94a3b8').slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function _buildMarks(R, s) {
        _marks = new Map();
        const cards = (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId));
        cards.forEach((c, ci) => {
            (c.residue || []).forEach((r, ri) => {
                _marks.set(_normKey(r.text), { ci: ci, ri: ri, nodeId: c.nodeId });
            });
        });
        // Unità di confronto del "coperto": per-NODO (default) o per-MACRO-AREA
        // (legacy). Una frase si attribuisce all'unità con la miglior sovrapposizione
        // lessicale sopra soglia → colore della macro-area di quel nodo/gruppo.
        _covIdx = null; _covUnits = null;
        const legacy = _hlLegacy();
        _covThreshold = legacy ? 0.6 : 0.65;
        _covWeak = legacy ? _covThreshold : 0.5;   // legacy = nessun tier tenue
        try {
            const D = window.MappAIDeepenCore;
            if (D && D.buildCoverageIndex && s && s.db) {
                _covUnits = [];
                if (legacy) {
                    const byGroup = new Map();
                    (s.db.nodes || []).forEach(n => {
                        const g = _nodeGroupOf(n);
                        if (g === undefined || g === null) return;
                        if (!byGroup.has(g)) byGroup.set(g, []);
                        byGroup.get(g).push((n.label || '') + ' ' + (n.desc || n.content || ''));
                    });
                    byGroup.forEach((arr, g) => _covUnits.push({ group: g, color: _groupColorOf(g), index: D.buildCoverageIndex(arr.join('\n')) }));
                } else {
                    (s.db.nodes || []).forEach(n => {
                        const g = _nodeGroupOf(n);
                        if (g === undefined || g === null) return;
                        const txt = (n.label || '') + ' ' + (n.desc || n.content || '');
                        if (String(txt).trim().split(/\s+/).length < 5) return;   // nodi senza desc utile
                        _covUnits.push({ group: g, color: _groupColorOf(g), index: D.buildCoverageIndex(txt) });
                    });
                }
            }
        } catch (e) { _covUnits = null; }
    }

    // colore+area della macro-area che copre una frase (o null).
    // { color, group, kind:'res'|'cov', ci, ri }
    function _sentColor(sent) {
        const m = _marks && _marks.get(_normKey(sent));
        if (m) {
            const n = _node(m.nodeId);
            const g = _nodeGroupOf(n);
            return { color: _groupColorOf(g), group: g, kind: 'res', ci: m.ci, ri: m.ri };
        }
        if (_covUnits && _covUnits.length) {
            try {
                const D = window.MappAIDeepenCore;
                let best = null;
                for (let i = 0; i < _covUnits.length; i++) {
                    const v = _covUnits[i];
                    if (!v.index || !D || !D.lexicalOverlap) continue;
                    const ov = D.lexicalOverlap(sent, v.index);
                    if (ov && ov.total >= 3 && ov.containment >= _covWeak && (!best || ov.containment > best.c)) {
                        best = { c: ov.containment, color: v.color, group: v.group };
                    }
                }
                // Graduata: colore PIENO se ≥ soglia (cuore del concetto), TENUE se
                // solo moderato (frase rilevante ma riassunta dalla mappa).
                if (best) return { color: best.color, group: best.group, kind: 'cov', strength: best.c >= _covThreshold ? 'strong' : 'weak' };
            } catch (e) { /* soft */ }
        }
        return null;
    }

    // classifica una frase della fonte per il testo: residuo (cliccabile) > coperta
    // > neutra, evidenziata nel COLORE della macro-area di appartenenza.
    function _sentMark(sent) {
        const sc = _sentColor(sent);
        if (sc && sc.kind === 'res') {
            const style = ' style="background:' + _rgba(sc.color, 0.20) + ';box-shadow:inset 0 -2px 0 ' + _rgba(sc.color, 0.85) + '"';
            return { cls: 'elab-s elab-s-res', attr: ' id="elab-src-c' + sc.ci + '-r' + sc.ri + '" onclick="MappAIElabora.revealCard(' + sc.ci + ')" title="' + t('el_res_tip', 'Nella fonte, non ancora nella scheda — clicca per vedere la card') + '"' + style };
        }
        if (sc && sc.kind === 'cov') {
            const a = sc.strength === 'weak' ? 0.13 : 0.32;   // graduata: tenue vs pieno
            const style = ' style="background:linear-gradient(transparent 60%,' + _rgba(sc.color, a) + ' 60%)"';
            return { cls: 'elab-s elab-s-cov', attr: style };
        }
        return { cls: 'elab-s', attr: '' };
    }

    // ── #5: raccolta delle frasi della fonte PER MACRO-AREA ──────────────────
    // Ogni frase della fonte attribuita a una macro-area (residuo o coperta)
    // finisce nella sezione di quell'area, nel suo colore. Aree ordinate per group.
    function _areaSections() {
        const s = _appState();
        const D = window.MappAIDeepenCore;
        if (!s || !s.db || !D || !D.splitSentences) return [];
        const l1Label = new Map();   // group → etichetta L1
        (s.db.nodes || []).forEach(n => {
            if (n.level === 1) {
                const g = _nodeGroupOf(n);
                if (g != null && !l1Label.has(g)) l1Label.set(g, window.cleanLabel ? window.cleanLabel(n.label) : (n.label || ''));
            }
        });
        const buckets = new Map();   // group → { label, color, items[] }
        const seen = new Set();
        D.splitSentences(_corpus() || '').forEach(sn => {
            const key = _normKey(sn);
            if (key.length < 8 || seen.has(key)) return;   // dedup + salta rumore
            const c = _sentColor(sn);
            if (!c || c.group == null) return;
            seen.add(key);
            if (!buckets.has(c.group)) buckets.set(c.group, { label: l1Label.get(c.group) || t('el_area_other', 'Altra area'), color: _groupColorOf(c.group), items: [] });
            buckets.get(c.group).items.push(esc(sn));
        });
        return [...buckets.entries()].sort((a, b) => a[0] - b[0])
            .map(e => ({ heading: e[1].label, color: e[1].color, items: e[1].items }));
    }

    // ── #3: scheda della fonte CON gli highlight per macro-area (ordine di lettura) ──
    // Corpo = paragrafi della fonte con le frasi evidenziate nel colore dell'area
    // (stessa logica del pannello, ma con stili inline print-safe).
    /* `opts` (0096, D1: le spunte del menu valgono anche per il solo testo):
       `graded:false` lascia evidenziati solo i concetti centrali (pieno), come nel
       PDF; `legend` (solo dal menu) mette in testa la chiave colore → macro-area.
       Senza `opts` il documento è quello di prima. */
    function _highlightedDocBody(opts) {
        opts = opts || {};
        const D = window.MappAIDeepenCore;
        const corpus = _corpus();
        if (!D || !D.splitSentences || !corpus) return '';
        const SD = window.MappAIStudyDoc;
        const paras = corpus.split(/\n{2,}/).filter(p => p.trim());
        const colorate = [];
        const corpo = '<div class="sd-source">' + paras.map(p => {
            const trimmed = p.trim();
            const sents = D.splitSentences(trimmed);
            if (!sents || !sents.length) return '<p>' + esc(trimmed) + '</p>';
            return '<p>' + sents.map(sn => {
                const sc = _sentColor(sn);
                if (!sc || (opts.graded === false && sc.strength === 'weak')) return esc(sn);
                colorate.push(sc);
                const a = sc.strength === 'weak' ? 0.13 : 0.32;
                const style = (sc.kind === 'res')
                    ? 'background:' + SD.rgba(sc.color, 0.20) + ';box-shadow:inset 0 -2px 0 ' + SD.rgba(sc.color, 0.85)
                    : 'background:linear-gradient(transparent 60%,' + SD.rgba(sc.color, a) + ' 60%)';
                return '<span style="' + style + '">' + esc(sn) + '</span>';
            }).join(' ') + '</p>';
        }).join('') + '</div>';
        const residui = colorate.some(sc => sc.kind === 'res');
        return (opts.legend ? _legendaTesto(_legendFor(colorate), opts.graded !== false, residui) : '') + corpo;
    }
    /* La legenda del solo testo (0096): le stesse voci della pagina-legenda del PDF
       (`_drawLegendPage`), in un riquadro in testa al documento. I campioni sono
       segnati come le frasi del testo, così la chiave si legge accanto al testo.
       `residui` (gate dello 0096, Giacomo: «perché certe righe sono evidenziate e
       sono anche sottolineate?»): il solo testo sottolinea le frasi che stanno
       nella fonte e non ancora nella scheda (i residui della copertura, `_marks`),
       e la legenda lo dice — con le parole della legenda di ELABORA (`el_leg_res`).
       Nel PDF quelle frasi escono colorate come le altre: lì la riga non serve. */
    function _legendaTesto(voci, graduata, residui) {
        if (!voci || !voci.length) return '';
        const SD = window.MappAIStudyDoc;
        const segno = (c, a) => '<span style="display:inline-block;width:28px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:8px;background:' + SD.rgba(c, a) + '"></span>';
        const riga = 'margin:4px 0';
        const primo = voci[0].color;
        return '<div class="sd-legenda" style="margin:0 0 18px;padding:12px 16px;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:10px;page-break-inside:avoid">' +
            '<div style="font-weight:700;margin-bottom:6px">' + esc(t('el_legend_title', 'Legenda dei colori')) + '</div>' +
            voci.map(v => '<div style="' + riga + '">' + segno(v.color, 0.32) + esc(v.label || '—') + '</div>').join('') +
            (graduata
                ? '<div style="margin-top:8px;font-weight:700">' + esc(t('el_legend_intensity', 'Intensità del colore')) + '</div>' +
                '<div style="' + riga + '">' + segno(primo, 0.32) + esc(t('el_legend_full', 'Pieno = concetto centrale della mappa')) + '</div>' +
                '<div style="' + riga + '">' + segno(primo, 0.13) + esc(t('el_legend_weak', 'Tenue = argomento presente ma riassunto dalla mappa')) + '</div>'
                : '') +
            (residui
                ? '<div style="' + riga + (graduata ? '' : ';margin-top:8px') + '"><span style="display:inline-block;width:28px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:8px;background:' +
                SD.rgba(primo, 0.20) + ';box-shadow:inset 0 -2px 0 ' + SD.rgba(primo, 0.85) + '"></span>' +
                esc(t('el_legend_res', 'Sottolineata = nella fonte, non ancora nella scheda')) + '</div>'
                : '') +
            '</div>';
    }

    /* Il nome del file della scheda evidenziata (gate dello 0096, Giacomo 15/10: «quando salvo
       la scheda il nome dei file diventa '[nome progetto] - Scheda evidenziata.pdf'»): lo stesso
       per il PDF evidenziato e per il solo testo salvato in PDF (che prende il nome dal suo
       <title>). Il nome del progetto è quello della CARTELLA (ADR 0021); senza cartella, il
       titolo della mappa. Si tolgono solo i caratteri che un nome di file non può avere. */
    function nomeProgetto() {
        const s = _appState() || {};
        const cartella = String(s.activeVaultPath || '').split(/[\\/]/).filter(Boolean).pop() || '';
        return String(cartella || s.rootNodeLabel || t('el_map', 'Mappa')).replace(/[\\/:*?"<>|]+/g, '-').trim();
    }
    function _nomeSchedaEvidenziata() {
        return nomeProgetto() + ' - ' + t('el_scheda_evidenziata', 'Scheda evidenziata');
    }

    function exportHighlighted(opts) {
        if (!window.MappAIStudyDoc) { if (window.showToast) showToast(t('el_export_nolib', 'Costruttore documento non disponibile.'), 'error'); return; }
        const body = _highlightedDocBody(opts);
        if (!body) { if (window.showToast) showToast(t('el_no_source_doc', 'Nessuna fonte da esportare.'), 'warning'); return; }
        const s = _appState();
        const lang = (window.getMapLanguage && window.getMapLanguage() === 'en') ? 'en' : 'it';
        const html = window.MappAIStudyDoc.buildHtml({
            title: t('el_doc_hl_title', 'Scheda con evidenziazioni'),
            mapName: (s && s.rootNodeLabel) || t('el_map', 'Mappa'),
            subtitle: t('el_crumb', 'elaborazione'),
            bodyHtml: body,
            lang: lang,
            titoloFile: comandiFonte() ? _nomeSchedaEvidenziata() : ''
        });
        window.MappAIStudyDoc.openDoc(html, { successMsg: t('el_doc_opened', 'Documento aperto — stampa o salva in PDF.') });
    }

    // Legenda: macro-aree DAVVERO presenti nell'export (frasi colorate) →
    // [{ label (L1), color }], in ordine di gruppo.
    function _legendFor(colored) {
        const s = _appState();
        const l1 = new Map();
        ((s && s.db && s.db.nodes) || []).forEach(n => {
            if (n.level === 1) { const g = _nodeGroupOf(n); if (g != null && !l1.has(g)) l1.set(g, window.cleanLabel ? window.cleanLabel(n.label) : (n.label || '')); }
        });
        const byG = new Map();
        (colored || []).forEach(cs => { if (cs.group == null || byG.has(cs.group)) return; byG.set(cs.group, cs.color); });
        return [...byG.entries()].sort((a, b) => a[0] - b[0]).map(e => ({ label: l1.get(e[0]) || t('el_area_other', 'Altra area'), color: e[1] }));
    }
    function _hexRgb(hex) {
        let c = String(hex || '').trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(c)) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        if (!/^[0-9a-f]{6}$/i.test(c)) c = '64748b';
        const n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function _mixWhite(hex, f) { const rgb = _hexRgb(hex); const m = x => Math.round(x + (255 - x) * (1 - f)); return [m(rgb[0]), m(rgb[1]), m(rgb[2])]; }

    // Disegna la pagina-legenda con jsPDF (pastiglie colore + intensità + brand).
    function _drawLegendPage(doc, jsPDF, legend, W, H, mapName) {
        const mx = 54; let y = 78;
        doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F');
        doc.setTextColor(30, 41, 59); doc.setFont(undefined, 'bold'); doc.setFontSize(22);
        doc.text(t('el_legend_title', 'Legenda dei colori'), mx, y); y += 20;
        doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
        doc.text((mapName ? mapName + ' · ' : '') + t('el_legend_sub', 'ogni colore = una macro-area della mappa'), mx, y); y += 34;
        doc.setFontSize(12);
        legend.forEach(e => {
            if (y > H - 150) return;
            const rgb = _hexRgb(e.color);
            doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(mx, y - 11, 28, 15, 3, 3, 'F');
            doc.setTextColor(30, 41, 59); doc.text(String(e.label || '—'), mx + 40, y); y += 26;
        });
        y += 20;
        doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
        doc.text(t('el_legend_intensity', 'Intensità del colore'), mx, y); y += 22;
        doc.setFont(undefined, 'normal'); doc.setFontSize(11); doc.setTextColor(51, 65, 85);
        const sample = (legend[0] && legend[0].color) || '#4f46e5';
        let rgb = _hexRgb(sample);
        doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(mx, y - 11, 28, 15, 3, 3, 'F');
        doc.text(t('el_legend_full', 'Pieno = concetto centrale della mappa'), mx + 40, y); y += 24;
        const lite = _mixWhite(sample, 0.32);
        doc.setFillColor(lite[0], lite[1], lite[2]); doc.roundedRect(mx, y - 11, 28, 15, 3, 3, 'F');
        doc.text(t('el_legend_weak', 'Tenue = argomento presente ma riassunto dalla mappa'), mx + 40, y); y += 30;
        doc.setFontSize(9); doc.setTextColor(148, 163, 184);
        doc.text('MappAI · insegnai.ch', mx, H - 44);
    }

    function _pdfLibOk() { return typeof pdfjsLib !== 'undefined' && !!(window.jspdf && window.jspdf.jsPDF); }

    // Voce del bottone «Esporta evidenziata». Dallo 0096 apre SEMPRE il menu delle
    // due versioni; con l'interruttore spento, la strada di prima: fonte solo-testo
    // → documento riflowato, PDF presente → il modale di configurazione del PDF.
    function exportHighlightedPdf() {
        const pdfs = _collectPdfs();
        if (comandiFonte() && window.MappAIModal && window.MappAIModal.open) return _apriMenuEsporta(pdfs);
        if (!pdfs.length) return exportHighlighted();   // fonte solo-testo → riflow
        if (!_pdfLibOk()) {
            if (window.showToast) showToast(t('el_pdf_export_fallback', 'Esporto la versione testo (PDF non disponibile).'), 'info');
            return exportHighlighted();
        }
        _openPdfExportModal(pdfs);
    }

    /* ── IL MENU di «Esporta evidenziata» (0096, C) ─────────────────────────
       Giacomo, 14/10: «il bottone esporta evidenziata non apre il menu di
       esportazione, e serve poter esportare sia la versione PDF sottolineata che la
       versione solo testo sottolineata. il tipo di scheda da esportare è quello
       attivo nella vista». Il menu lo disegna il motore, che chiede il suo piano:
       si vede sopra la console (inv. 11; il modale di prima nasceva a 1002, sotto
       i 12100 della console, e il bottone sembrava morto). Parte dalla versione
       della vista attiva (`_srcView`); senza PDF resta il solo testo. Le due spunte
       valgono per tutte e due le versioni (D1). Le marcature sono quelle di
       sempre, colori per macro-area. */
    async function _apriMenuEsporta(pdfs) {
        const pdfOk = pdfs.length > 0 && _pdfLibOk();
        const suPdf = pdfOk && _srcView === 'pdf';
        const campi = pdfOk ? [
            { id: 'ver-pdf', tipo: 'radio', gruppo: 'versione', etichetta: t('el_exp_pdf', 'PDF evidenziato'),
                aiuto: t('el_pdfexp_sub', 'Il PDF originale con le frasi evidenziate per macro-area.'), valore: suPdf },
            { id: 'ver-testo', tipo: 'radio', gruppo: 'versione', etichetta: t('el_exp_testo', 'Solo testo evidenziato'),
                aiuto: t('el_exp_testo_d', 'Il testo della fonte con le stesse evidenziazioni, in una pagina da stampare.'), valore: !suPdf }
        ] : [{ id: 'solo-testo', tipo: 'nota',
            etichetta: pdfs.length ? t('el_pdf_export_fallback', 'Esporto la versione testo (PDF non disponibile).')
                : t('el_exp_solo_testo', 'Questo progetto non ha un PDF: si esporta il testo.') }];
        if (pdfOk && pdfs.length > 1) {
            campi.push({ id: 'quale', tipo: 'scelta', etichetta: t('el_pdfexp_which', 'Quale PDF'), valore: String(_pdfIdx),
                opzioni: pdfs.map((p, i) => ({ valore: String(i), etichetta: p.name || ('PDF ' + (i + 1)) })) });
        }
        campi.push(
            { id: 'legenda', tipo: 'spunta', etichetta: t('el_legend_title', 'Legenda dei colori'),
                aiuto: t('el_exp_legend_d', 'La chiave colore → macro-area: una pagina iniziale nel PDF, un riquadro in testa nel testo.'), valore: true },
            { id: 'moderate', tipo: 'spunta', etichetta: t('el_pdfexp_graded', 'Includi le associazioni moderate (tenue)'),
                aiuto: t('el_pdfexp_graded_d', 'Deseleziona per evidenziare solo i concetti centrali (pieno).'), valore: true }
        );
        const r = await window.MappAIModal.open({
            titolo: t('el_exp_titolo', 'Esporta la fonte evidenziata'), icona: 'file-output', taglia: 'm',
            sezioni: [{ campi: campi }],
            azioni: [
                { id: 'no', etichetta: t('el_q_cancel', 'Annulla') },
                { id: 'si', etichetta: t('el_exp_go', 'Esporta'), ruolo: 'primario' }
            ]
        });
        if (!r || r.azione !== 'si') return false;
        const v = r.valori || {};
        const opts = { legend: v.legenda !== false, graded: v.moderate !== false };
        if (pdfOk && v['ver-pdf']) {
            opts.pdfIdx = pdfs.length > 1 ? (parseInt(v.quale, 10) || 0) : _pdfIdx;
            return _runPdfExport(pdfs, opts);
        }
        return exportHighlighted(opts);
    }

    // Modale di configurazione dell'export PDF (app-styled): opzioni prima del
    // salvataggio, invece del dialog OS diretto. Dallo 0096 serve solo con
    // l'interruttore `mappai_comandi_fonte` a '0'.
    function _openPdfExportModal(pdfs) {
        const old = document.getElementById('elab-pdfexp-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'elab-pdfexp-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:1002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font:inherit';
        try { const MM = window.MappAIModal; if (MM && MM.prossimoZ) ov.style.zIndex = String(MM.prossimoZ()); } catch (e) { /* senza motore resta il 1002 del cssText; dentro la console (12100) finiva sotto: inv. 11, trappola 52 (0096) */ }
        const row = (id, label, desc, checked) =>
            '<label style="display:flex;gap:11px;align-items:flex-start;padding:11px 13px;border:1px solid #eef2f6;border-radius:12px;cursor:pointer;margin-bottom:9px">' +
            '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' style="margin-top:2px;width:17px;height:17px;accent-color:#4f46e5;flex:0 0 auto">' +
            '<span><span style="display:block;font-size:13px;font-weight:700;color:#1e293b">' + esc(label) + '</span>' +
            '<span style="display:block;font-size:11px;color:#64748b;margin-top:2px">' + esc(desc) + '</span></span></label>';
        let pdfSel = '';
        if (pdfs.length > 1) {
            pdfSel = '<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:5px">' + esc(t('el_pdfexp_which', 'Quale PDF')) + '</div>' +
                '<select id="elab-pdfexp-sel" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font:inherit">' +
                pdfs.map((p, i) => '<option value="' + i + '"' + (i === _pdfIdx ? ' selected' : '') + '>' + esc(p.name || ('PDF ' + (i + 1))) + '</option>').join('') + '</select></div>';
        }
        ov.innerHTML =
            '<div style="background:#fff;border-radius:18px;max-width:520px;width:100%;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3)">' +
            '<div style="padding:18px 22px;border-bottom:1px solid #eef2f6">' +
            '<div style="font-size:16px;font-weight:900;color:#1e293b">📄 ' + t('el_pdfexp_title', 'Esporta il PDF evidenziato') + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:3px">' + t('el_pdfexp_sub', 'Il PDF originale con le frasi evidenziate per macro-area.') + '</div></div>' +
            '<div style="padding:16px 20px">' + pdfSel +
            row('elab-pdfexp-legend', t('el_pdfexp_legend', 'Pagina-legenda dei colori'), t('el_pdfexp_legend_d', 'Una pagina iniziale con la chiave colore→macro-area.'), true) +
            row('elab-pdfexp-graded', t('el_pdfexp_graded', 'Includi le associazioni moderate (tenue)'), t('el_pdfexp_graded_d', 'Deseleziona per evidenziare solo i concetti centrali (pieno).'), true) +
            '</div>' +
            '<div style="padding:14px 22px;border-top:1px solid #eef2f6;display:flex;justify-content:flex-end;gap:10px">' +
            '<button type="button" id="elab-pdfexp-cancel" class="elab-btn elab-ghost">' + t('el_q_cancel', 'Annulla') + '</button>' +
            '<button type="button" id="elab-pdfexp-go" class="elab-btn elab-primary">' + t('el_pdfexp_go', 'Esporta PDF') + '</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => { ov.remove(); };
        if (window.MappAIVelo) window.MappAIVelo.monta(ov, close);   /* 0122 lotto 4b2: velo, piano, sfondo bloccato ed Esc li fa MappAIVelo (mappai-velo.js) */
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('#elab-pdfexp-cancel').onclick = close;
        ov.querySelector('#elab-pdfexp-go').onclick = () => {
            const opts = {
                legend: ov.querySelector('#elab-pdfexp-legend').checked,
                graded: ov.querySelector('#elab-pdfexp-graded').checked,
                pdfIdx: pdfs.length > 1 ? (+ov.querySelector('#elab-pdfexp-sel').value) : _pdfIdx
            };
            close();
            _runPdfExport(pdfs, opts);
        };
    }

    // #3 (fedeltà): esporta il PDF ORIGINALE con gli highlight per macro-area
    // bruciati sopra (raster, una immagine per pagina, impaginazione preservata).
    // opts: { pdfIdx, legend:bool, graded:bool }.
    async function _runPdfExport(pdfs, opts) {
        opts = opts || {};
        const entry = pdfs[(opts.pdfIdx != null ? opts.pdfIdx : _pdfIdx)] || pdfs[0];
        /* il velo sopra la console (0096): a 9999 restava sotto i 12100, e per tutta
           la durata dell'export non si vedeva niente */
        _veloPdf(true, t('el_pdf_export_run', 'Esporto il PDF evidenziato…'));
        try {
            let colored = _coloredSentences();
            if (opts.graded === false) colored = colored.filter(c => c.strength !== 'weak');   // solo concetti centrali
            const buf = await entry.file.arrayBuffer();
            // isEvalSupported:false — CVE-2024-4367: pdf.js 3.4.120 compila i glifi dei
            // font con `new Function`, e un PDF costruito ad arte esegue JS nell'app
            const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
            const U = (window.pdfjsLib && pdfjsLib.Util) ? pdfjsLib.Util : null;
            const jsPDF = window.jspdf.jsPDF;
            const SCALE = 2, CAP = 60;
            const n = Math.min(pdf.numPages, CAP);
            let doc = null;
            // Pagina-legenda in testa: pastiglia colore + nome per ogni macro-area
            // presente + spiegazione delle intensità (pieno/tenue).
            const legend = (opts.legend === false) ? [] : _legendFor(colored);
            if (legend.length) {
                const p1 = await pdf.getPage(1);
                const v1 = p1.getViewport({ scale: 1 });
                const or0 = v1.width > v1.height ? 'l' : 'p';
                const s0 = _appState();
                doc = new jsPDF({ orientation: or0, unit: 'pt', format: [v1.width, v1.height] });
                _drawLegendPage(doc, jsPDF, legend, v1.width, v1.height, (s0 && s0.rootNodeLabel) || '');
            }
            for (let i = 1; i <= n; i++) {
                const page = await pdf.getPage(i);
                const vp1 = page.getViewport({ scale: 1 });        // pt per il formato pagina
                const vp = page.getViewport({ scale: SCALE });     // canvas ad alta risoluzione
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                if (colored.length) {
                    try {
                        const tc = await page.getTextContent();
                        const itemColor = _matchColoredItems(tc, colored);
                        if (itemColor.size) {
                            ctx.save(); ctx.globalCompositeOperation = 'multiply';
                            itemColor.forEach((info, idx) => {
                                const it = tc.items[idx]; if (!it || !it.transform) return;
                                const tx = U ? U.transform(vp.transform, it.transform) : it.transform;
                                const fontH = Math.hypot(tx[2], tx[3]) || ((it.height || 10) * SCALE);
                                const width = (it.width || 0) * SCALE; if (width <= 0) return;
                                const a = info.strength === 'weak' ? 0.16 : 0.4;
                                ctx.fillStyle = window.MappAIStudyDoc ? window.MappAIStudyDoc.rgba(info.color, a) : info.color;
                                ctx.fillRect(tx[4], tx[5] - fontH, width, fontH);
                            });
                            ctx.restore();
                        }
                    } catch (e) { /* pagina senza text layer: resta il canvas nudo */ }
                }
                const img = canvas.toDataURL('image/jpeg', 0.82);
                const orient = vp1.width > vp1.height ? 'l' : 'p';
                if (!doc) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [vp1.width, vp1.height] });
                else doc.addPage([vp1.width, vp1.height], orient);
                doc.addImage(img, 'JPEG', 0, 0, vp1.width, vp1.height);
            }
            _veloPdf(false);
            if (!doc) return exportHighlighted(opts);
            const s = _appState();
            const name = comandiFonte() ? _nomeSchedaEvidenziata() + '.pdf'
                : String((s && s.rootNodeLabel) || 'scheda').replace(/[^\w\-]+/g, '_').slice(0, 50) + '-evidenziata.pdf';
            doc.save(name);
            if (window.showToast) showToast(t('el_pdf_export_done', 'PDF evidenziato salvato.'), 'success');
        } catch (e) {
            _veloPdf(false);
            console.warn('[elabora] export PDF evidenziato fallito:', e && e.message);
            if (window.showToast) showToast(t('el_pdf_export_fail', 'Export PDF non riuscito, esporto la versione testo.'), 'warning');
            exportHighlighted(opts);
        }
    }

    // ── Domande della fonte → quiz (idea utente a) ───────────────────────────
    // Recupera le domande/esercizi dalla fonte e le usa come set di studio aperto.
    function openQuestions() {
        if (!window.MappAIQuestions) { if (window.showToast) showToast(t('el_q_nolib', 'Estrattore domande non disponibile.'), 'error'); return; }
        const qs = window.MappAIQuestions.extractQuestions(_corpus());
        if (!qs.length) { if (window.showToast) showToast(t('el_q_none', 'Nessuna domanda o esercizio trovato nella fonte.'), 'warning'); return; }
        const old = document.getElementById('elab-q-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'elab-q-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:1002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font:inherit';
        try { const MM = window.MappAIModal; if (MM && MM.prossimoZ) ov.style.zIndex = String(MM.prossimoZ()); } catch (e) { /* senza motore resta il 1002 del cssText; dentro la console (12100) finiva sotto: inv. 11, trappola 52 */ }
        const rows = qs.map((q, i) =>
            '<label class="elab-q-row" style="display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-radius:10px;cursor:pointer">' +
            '<input type="checkbox" data-qi="' + i + '" checked style="margin-top:3px;width:16px;height:16px;accent-color:#4f46e5;flex:0 0 auto">' +
            '<span style="flex:1;min-width:0"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:' + (q.type === 'task' ? '#b45309' : '#4f46e5') + ';margin-right:7px">' + (q.type === 'task' ? t('el_q_task', 'consegna') : t('el_q_question', 'domanda')) + '</span>' +
            '<span style="font-size:13px;color:#1e293b;line-height:1.5">' + esc(q.text) + '</span></span></label>'
        ).join('');
        ov.innerHTML =
            '<div style="background:#fff;border-radius:18px;max-width:720px;width:100%;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3)">' +
            '<div style="padding:18px 22px;border-bottom:1px solid #eef2f6">' +
            '<div style="font-size:16px;font-weight:900;color:#1e293b">❓ ' + t('el_q_title', 'Domande della fonte') + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:3px">' + t('el_q_sub', 'Recuperate dalla fonte. Seleziona quelle da mettere nel set di studio.') + ' · ' + qs.length + '</div></div>' +
            '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f1f5f9">' +
            '<button type="button" id="elab-q-all" class="elab-btn elab-tiny elab-ghost">' + t('el_q_all', 'Seleziona tutto') + '</button>' +
            '<button type="button" id="elab-q-none" class="elab-btn elab-tiny elab-ghost">' + t('el_q_clear', 'Deseleziona') + '</button></div>' +
            '<div id="elab-q-list" style="overflow-y:auto;padding:8px 10px;flex:1">' + rows + '</div>' +
            '<div style="padding:14px 22px;border-top:1px solid #eef2f6;display:flex;justify-content:flex-end;gap:10px">' +
            '<button type="button" id="elab-q-cancel" class="elab-btn elab-ghost">' + t('el_q_cancel', 'Annulla') + '</button>' +
            '<button type="button" id="elab-q-create" class="elab-btn elab-primary">' + t('el_q_create', 'Crea set di studio') + '</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => { ov.remove(); };
        if (window.MappAIVelo) window.MappAIVelo.monta(ov, close);   /* 0122 lotto 4b2: velo, piano, sfondo bloccato ed Esc li fa MappAIVelo (mappai-velo.js) */
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('#elab-q-cancel').onclick = close;
        ov.querySelector('#elab-q-all').onclick = () => ov.querySelectorAll('#elab-q-list input').forEach(c => c.checked = true);
        ov.querySelector('#elab-q-none').onclick = () => ov.querySelectorAll('#elab-q-list input').forEach(c => c.checked = false);
        ov.querySelector('#elab-q-create').onclick = () => {
            const picked = [];
            ov.querySelectorAll('#elab-q-list input:checked').forEach(c => { const q = qs[+c.dataset.qi]; if (q) picked.push(q.text); });
            if (!picked.length) { if (window.showToast) showToast(t('el_q_pick', 'Seleziona almeno una domanda.'), 'warning'); return; }
            _createSetFromQuestions(picked);
            close();
        };
    }

    function _createSetFromQuestions(texts) {
        const s = _appState();
        if (!s || !s.db) return;
        s.db.studySets = s.db.studySets || [];
        const items = texts.map(t2 => ({ question: t2, answer: '', explanation: '' }));
        const id = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        s.db.studySets.push({
            id: id,
            title: t('el_q_setname', 'Domande della fonte'),
            mode: 'quiz', type: t('el_q_settype', 'Aperte'),
            items: items, material: '', angle: 'auto', quantity: items.length,
            date: new Date().toISOString(), origin: 'elabora-questions'
        });
        if (window.renderStudySets) window.renderStudySets();
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        if (window.showToast) showToast(t('el_q_created', '{n} domande aggiunte come set di studio.').replace('{n}', items.length), 'success');
    }

    // Esporta il documento "frasi per area tematica" (#5) via il costruttore condiviso.
    function exportAreas() {
        if (!window.MappAIStudyDoc) { if (window.showToast) showToast(t('el_export_nolib', 'Costruttore documento non disponibile.'), 'error'); return; }
        const sections = _areaSections();
        if (!sections.length) { if (window.showToast) showToast(t('el_no_areas', 'Nessuna frase attribuita a una macro-area. Serve una mappa con macro-aree e una fonte.'), 'warning'); return; }
        const s = _appState();
        const mapName = (s && s.rootNodeLabel) || t('el_map', 'Mappa');
        const lang = (window.getMapLanguage && window.getMapLanguage() === 'en') ? 'en' : 'it';
        const html = window.MappAIStudyDoc.buildHtml({
            title: t('el_doc_areas_title', 'Frasi della fonte per area tematica'),
            mapName: mapName,
            subtitle: t('el_crumb', 'elaborazione'),
            sections: sections,
            lang: lang
        });
        window.MappAIStudyDoc.openDoc(html, { successMsg: t('el_doc_opened', 'Documento aperto — stampa o salva in PDF.') });
    }

    // click su frase-residuo → scrolla e lampeggia la card corrispondente
    function revealCard(ci) {
        const el = document.getElementById('elab-card-cov-' + ci);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('elab-card-flash'); void el.offsetWidth; el.classList.add('elab-card-flash');
    }

    // click su citazione nella card → scrolla e lampeggia la frase nella fonte
    function revealInSource(ci, ri) {
        const go = () => {
            const el = document.getElementById('elab-src-c' + ci + '-r' + ri);
            if (!el) { if (window.showToast) showToast(t('el_src_far', 'Frase oltre l\'anteprima della fonte'), 'info'); return; }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.remove('elab-flash'); void el.offsetWidth; el.classList.add('elab-flash');
        };
        if (_srcView === 'pdf') { _srcView = 'text'; render(); setTimeout(go, 60); }
        else go();
    }

    // ── ALBERO editabile (task «boost» 22/7) ─────────────────────────────────
    // Renderer DEDICATO (non renderTreeView: quella ricostruisce la sidebar e
    // userebbe la lista piatta per group). Gerarchia REALE da appState.db.links
    // (source=padre → target=figlio, skip isCross), come _recalcLevels.
    /* L'id di un nodo dentro i gestori in linea dell'albero: un letterale JS
       intero, virgolette comprese (vedi `_js`). Prima si raddoppiava il solo
       apice, e un id con `"` o con `\'` usciva dall'attributo o dalla stringa. */
    function _qid(id) { return _js(id); }

    function _treeHTML(s, R) {
        const nodes = s.db.nodes || [], links = s.db.links || [];
        const byId = new Map(nodes.map(n => [n.id, n]));
        const lvl = id => { const n = byId.get(id); return n && n.level != null ? n.level : 99; };
        // Gerarchia ROBUSTA: NON basarsi su !isCross. In MM i link ROOT→L1 sono
        // marcati isCross by-design (la radice non condivide group con le L1) →
        // saltarli lasciava l'albero con la sola radice. Per ogni nodo si sceglie
        // UN padre = la sorgente entrante col livello più alto ANCORA sotto il
        // livello del nodo (= antenato diretto), indipendentemente da isCross.
        const parentOf = new Map();
        links.forEach(l => {
            const sid = (l.source && typeof l.source === 'object') ? l.source.id : l.source;
            const tid = (l.target && typeof l.target === 'object') ? l.target.id : l.target;
            if (!byId.has(sid) || !byId.has(tid) || sid === tid) return;
            if (lvl(sid) >= lvl(tid)) return;                 // solo archi verso il basso
            const cur = parentOf.get(tid);
            if (cur === undefined || lvl(sid) > lvl(cur)) parentOf.set(tid, sid);
        });
        const kids = new Map();
        parentOf.forEach((pid, cid) => { if (!kids.has(pid)) kids.set(pid, []); kids.get(pid).push(cid); });
        // orfani (nessun arco verso il basso li raggiunge): agganciali alla radice
        // o alla prima L1 → nessun nodo generato resta invisibile.
        const rootN = nodes.find(n => n.level === 0);
        const l1s = nodes.filter(n => n.level === 1);
        const fallbackParent = rootN ? rootN.id : (l1s[0] ? l1s[0].id : null);
        nodes.forEach(n => {
            if (n.level === 0) return;
            if (parentOf.has(n.id)) return;
            if (n.level === 1 && !rootN) return;              // niente radice → le L1 restano radici
            const pid = (n.level === 1) ? rootN.id : fallbackParent;
            if (pid && pid !== n.id) { parentOf.set(n.id, pid); if (!kids.has(pid)) kids.set(pid, []); kids.get(pid).push(n.id); }
        });
        // badge: copertura (card visibili) e issue strutturali per nodo
        const covByNode = new Map();
        (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId)).forEach((c, ci) => covByNode.set(c.nodeId, { ci: ci, res: (c.residue || []).length }));
        const strByNode = new Map();
        (R.structural || []).forEach(x => { if (x && x.nodeId) strByNode.set(x.nodeId, (strByNode.get(x.nodeId) || 0) + 1); });

        const root = nodes.find(n => n.level === 0);
        const roots = root ? [root] : nodes.filter(n => n.level === 1);
        const visited = new Set();
        const rows = [];
        const walk = (id, depth) => {
            if (visited.has(id)) return; visited.add(id);
            const n = byId.get(id); if (!n) return;
            const ch = (kids.get(id) || []).map(cid => byId.get(cid)).filter(Boolean);
            rows.push(_treeRow(n, depth, ch.length, covByNode, strByNode));
            if (_treeCollapsed.has(id)) return;
            ch.sort((a, b) => ((a.level || 0) - (b.level || 0)) || String(a.label || '').localeCompare(String(b.label || '')))
              .forEach(c => walk(c.id, depth + 1));
        };
        roots.forEach(r => walk(r.id, 0));

        const hint = _mergePick
            ? '<div class="elab-tree-hint">' + emo('gap') + ' ' + t('el_merge_pick', 'Clicca il nodo di DESTINAZIONE per fondere') + ' «' + esc((byId.get(_mergePick) || {}).label || '') + '» — <a href="#" onclick="event.preventDefault();MappAIElabora.cancelMergePick()">' + t('el_cancel', 'annulla') + '</a></div>'
            : '<div class="elab-tree-hint elab-muted">' + t('el_tree_help', 'Trascina un nodo su un altro per spostarlo · doppio click per modificarlo') + '</div>';
        return '<div class="elab-tree">' + hint + rows.join('') + '</div>';
    }

    function _treeRow(n, depth, nChildren, covByNode, strByNode) {
        const grp = (n.level === 0) ? 0 : n.group;
        const color = _groupColorOf(grp);          // lo stesso colore della fonte, filtrato
        const cov = covByNode.get(n.id);
        const nStr = strByNode.get(n.id) || 0;
        const words = String(n.desc || n.content || '').split(/\s+/).filter(Boolean).length;
        const qid = _qid(n.id);
        const isRoot = n.level === 0;
        const chev = nChildren
            ? '<span class="elab-tw-chev" onclick="event.stopPropagation();MappAIElabora.toggleTreeRow(' + qid + ')">' + (_treeCollapsed.has(n.id) ? '▸' : '▾') + '</span>'
            : '<span class="elab-tw-chev elab-tw-leaf"></span>';
        let badges = '';
        if (cov) badges += '<span class="elab-tb elab-tb-res" title="' + t('el_tb_res_tip', 'Frasi della fonte non ancora nella scheda — clicca per la card') + '" onclick="event.stopPropagation();MappAIElabora.gotoNodeCard(' + qid + ')">' + cov.res + '</span>';
        else if (words >= 25) badges += '<span class="elab-tb elab-tb-cov" title="' + t('el_tb_cov_tip', 'Scheda coperta dalla fonte') + '">✓</span>';
        if (nStr) badges += '<span class="elab-tb elab-tb-str" title="' + t('el_tb_str_tip', 'Suggerimenti strutturali su questo nodo') + '">' + nStr + '</span>';
        badges += '<span class="elab-tb elab-tb-w" title="' + t('el_tb_w_tip', 'Parole nella descrizione') + '">' + words + 'w</span>';
        const acts =
            '<span class="elab-ta" title="' + t('el_ta_rename', 'Rinomina') + '" onclick="event.stopPropagation();MappAIElabora.renameNode(' + qid + ')">✎</span>' +
            '<span class="elab-ta" title="' + t('el_ta_edit', 'Modifica contenuto') + '" onclick="event.stopPropagation();MappAIElabora.editNode(' + qid + ')">📝</span>' +
            '<span class="elab-ta" title="' + t('el_ta_child', 'Aggiungi figlio') + '" onclick="event.stopPropagation();MappAIElabora.addChild(' + qid + ')">＋</span>' +
            (!isRoot ? '<span class="elab-ta" title="' + t('el_ta_merge', 'Fondi in un altro nodo…') + '" onclick="event.stopPropagation();MappAIElabora.startMergePick(' + qid + ')">⇄</span>' : '');
        return '<div class="elab-tr' + (_mergePick === n.id ? ' elab-tr-picked' : '') + '" style="padding-left:' + (10 + depth * 18) + 'px"' +
            (!isRoot ? ' draggable="true" ondragstart="MappAIElabora.treeDragStart(event,' + qid + ')"' : '') +
            ' ondragover="event.preventDefault();this.classList.add(\'elab-tr-over\')" ondragleave="this.classList.remove(\'elab-tr-over\')"' +
            ' ondrop="this.classList.remove(\'elab-tr-over\');MappAIElabora.treeDrop(event,' + qid + ')"' +
            ' onclick="MappAIElabora.treeRowClick(' + qid + ')" ondblclick="MappAIElabora.editNode(' + qid + ')">' +
            chev + '<span class="elab-tw-dot" style="background:' + esc(color) + '"></span>' +
            '<span class="elab-tw-lbl' + (isRoot ? ' elab-tw-root' : '') + '">' + esc(window.cleanLabel ? window.cleanLabel(n.label) : n.label) + '</span>' +
            '<span class="elab-tw-lvl">L' + (n.level != null ? esc(n.level) : '?') + '</span>' +
            '<span class="elab-spacer"></span>' + badges + '<span class="elab-ta-wrap">' + acts + '</span>' +
        '</div>';
    }

    // ── azioni albero ────────────────────────────────────────────────────────
    function _node(id) { const s = _appState(); return (s.db.nodes || []).find(n => n.id === id) || null; }
    function _guard(n, verbo) { return !(window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(n, verbo)); }

    function setRightView(v) { _rightView = (v === 'tree') ? 'tree' : 'cards'; render(); }
    // Cambio di modalità: se l'editor documenti ha modifiche non salvate, si chiede
    // conferma qui (uscendo dalla modalità il DOM dell'editor viene distrutto).
    function setMode(v) {
        const next = (v === 'docs') ? 'docs' : 'source';
        if (next === _mode) return;
        if (_mode === 'docs' && window.MappAIDocEditor && window.MappAIDocEditor.hasUnsaved && window.MappAIDocEditor.hasUnsaved()) {
            if (!confirm(t('el_docs_unsaved', 'Ci sono modifiche non salvate nel documento. Uscire comunque?'))) return;
            window.MappAIDocEditor.reset();
        }
        _mode = next;
        render();
    }
    function toggleTreeRow(id) { if (_treeCollapsed.has(id)) _treeCollapsed.delete(id); else _treeCollapsed.add(id); render(); }

    function treeRowClick(id) {
        if (_mergePick) { _confirmMerge(id); return; }
        // click semplice: se il nodo ha una card di copertura → mostrala
        gotoNodeCard(id);
    }

    function gotoNodeCard(nodeId) {
        if (!_R) return;
        const cards = (_R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId));
        const ci = cards.findIndex(c => c.nodeId === nodeId);
        if (ci < 0) return;
        _rightView = 'cards'; render();
        setTimeout(() => revealCard(ci), 60);
    }

    function renameNode(id) {
        const n = _node(id); if (!n || !_guard(n, 'rinomina')) return;
        const cur = window.cleanLabel ? window.cleanLabel(n.label) : n.label;
        window.showPrompt(t('el_rename_p', 'Nuova etichetta del nodo:'), cur, (v) => {
            if (!v) return;
            n.label = v;
            if (typeof renderGraph === 'function') renderGraph();
            render();
        });
    }

    function editNode(id) {
        const n = _node(id); if (!n) return;
        if (typeof window.openEditModal === 'function') window.openEditModal(n);
    }

    // replica di ctxAction('add_child') (nessuna funzione esportata esiste) con
    // i 2 fix del blueprint: group ereditato dal padre + guardWrite + undo.
    function addChild(parentId) {
        const s = _appState();
        const p = _node(parentId); if (!p || !_guard(p, 'aggiungi figlio')) return;
        window.showPrompt(t('el_child_p', 'Nome del nuovo nodo figlio:'), '', (label) => {
            if (!label) return;
            if (typeof window.pushUndoSnapshot === 'function') window.pushUndoSnapshot('aggiungi figlio');
            const id = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
            s.db.nodes.push({
                id: id, label: label, content: '', desc: '',
                level: (p.level || 0) + 1, group: (p.level === 0) ? undefined : p.group,
                studyStatus: 'none', chunks: [], x: (p.x || 0) + 30, y: (p.y || 0) + 30
            });
            // figlio diretto del ROOT = nuova L1 → group libero (regola 9)
            if (p.level === 0) {
                const used = new Set(s.db.nodes.map(n => n.group).filter(g => g !== undefined));
                let g = 1; while (used.has(g)) g++;
                s.db.nodes[s.db.nodes.length - 1].group = g;
            }
            s.db.links.push({ source: p.id, target: id, rel: 'collegato_a' });
            if (typeof updateDegreeStats === 'function') updateDegreeStats();
            if (typeof renderGraph === 'function') renderGraph();
            render();
        });
    }

    // drag&drop = SPOSTA (reparent): guardie CICLO e root, poi verbo via
    // showLinkFamilyPrompt (parent per primo) → executeRelink (livelli+group interni)
    function treeDragStart(ev, id) { _dragId = id; try { ev.dataTransfer.setData('text/plain', id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { } }

    function treeDrop(ev, targetId) {
        ev.preventDefault();
        const aId = _dragId; _dragId = null;
        if (!aId || aId === targetId) return;
        const A = _node(aId), B = _node(targetId);
        if (!A || !B) return;
        if (A.level === 0) { if (window.showToast) showToast(t('el_no_move_root', 'Il nodo radice non si può spostare'), 'error'); return; }
        // niente cicli: mai su se stesso o su un proprio discendente
        try {
            if (typeof window.getDescendantIds === 'function') {
                const desc = window.getDescendantIds(A.id);
                const set = desc instanceof Set ? desc : new Set(desc || []);
                if (set.has(B.id)) { if (window.showToast) showToast(t('el_no_cycle', 'Non puoi spostare un nodo dentro un suo discendente'), 'error'); return; }
            }
        } catch (e) { /* soft */ }
        if (!_guard(A, 'sposta') || !_guard(B, 'sposta')) return;
        if (typeof window.showLinkFamilyPrompt === 'function' && typeof window.executeRelink === 'function') {
            window.showLinkFamilyPrompt(
                window.cleanLabel ? window.cleanLabel(B.label) : B.label,
                window.cleanLabel ? window.cleanLabel(A.label) : A.label,
                (rel) => { if (rel) { window.executeRelink(A, B, rel); render(); } }
            );
        }
    }

    // «Fondi in…»: pattern startMergeMode ma locale all'albero
    function startMergePick(id) { _mergePick = id; render(); }
    function cancelMergePick() { _mergePick = null; render(); }
    function _confirmMerge(targetId) {
        const aId = _mergePick;
        if (aId === targetId) { cancelMergePick(); return; }
        const A = _node(aId), B = _node(targetId);
        _mergePick = null;
        if (!A || !B || typeof window.executeMerge !== 'function') { render(); return; }
        const doIt = () => { window.executeMerge(A, B); render(); };
        if (typeof window.showConfirm === 'function') {
            window.showConfirm(
                t('el_merge_t', 'Fondere i nodi?'),
                '«' + (window.cleanLabel ? window.cleanLabel(A.label) : A.label) + '» ' + t('el_merge_m', 'verrà fuso in') + ' «' + (window.cleanLabel ? window.cleanLabel(B.label) : B.label) + '». ' + t('el_merge_w', 'Operazione annullabile solo con Ctrl+Z.'),
                doIt
            );
        } else doIt();
    }

    /* ══ TESTO DELLE FIGURE (packet 0113, lotto 8; ADR 0024 §5.6-5.8) ════════
       La terza vista della fonte: il testo letto dalle immagini del PDF in CREA,
       dal dossier `.figure.json` (in memoria nella stessa seduta, dal vault dopo
       un riavvio: `MappAIFigure.trovaDossier`). Prima i ritagli dove le due
       letture divergono e i «forse manca», con l'immagine del ritaglio accanto;
       poi gli esclusi, con la conferma; poi le letture concordi; in fondo foto,
       doppioni, «nessun testo» e oltre il tetto, con «Leggi comunque». Il lessico è
       quello dell'ADR §5.6 (mai i colori da soli). I gesti chiamano il modulo:
       `leggiUno`, `rileggiPagina` (solo con la chiave Google, con la riga d'avviso
       prima), `correggi`, `conferma`; il modulo riscrive il `.figure.json` dove
       `Fonti/` c'è (ADR 0011 rev. 1). L'elenco dei toponimi non è nel repo
       (ADR 0024 §8): nessuna parola sottolineata. */
    let _figCercati = new Set();   // nomi dei PDF già cercati nel vault (una volta per seduta)
    let _figDossier = new Map();   // nome → dossier letto dal vault
    let _figProve = new Map();     // nome → prova a secco rifatta qui (per rileggere dopo un riavvio)
    let _figIndice = [];           // k → { nome, src, file, impronta, dossier, voce }
    let _figInCorso = new Set();   // k dei gesti in corso
    const _figAperte = new Set();  // 0114, dal gate 3: le schede controllate che il docente ha riaperto (per identità del ritaglio)
    let _figToken = 0;
    let _figStiliOk = false;
    function _figModulo() { const MF = window.MappAIFigure; return MF && MF.dossierDi && MF.trovaDossier ? MF : null; }
    /* le fonti PDF del progetto con, se c'è, il loro dossier: in memoria (impronta sulla fonte o sul file) o dal vault */
    function _figFonti() {
        const MF = _figModulo(); if (!MF) return [];
        const s = _appState(); const out = [];
        let daCercare = [];
        (s && s.sources || []).forEach(src => {
            if (!src) return;
            const file = _pdfFiles.get(src.id) || src.file;
            const nome = src.name || (file && file.name) || (src.vaultRel ? src.vaultRel.split('/').pop() : '');
            const nm = String(nome).toLowerCase();
            const isPdf = src.type === 'pdf' || nm.endsWith('.pdf') || (file && file.type === 'application/pdf');
            if (!isPdf || !nome) return;
            const impronta = (src._figure && src._figure.impronta) || (file && file._letturaFigure && file._letturaFigure.dossier && file._letturaFigure.dossier.impronta) || (file && file._figure && file._figure.impronta) || null;
            let dossier = (impronta && MF.dossierDi(impronta)) || _figDossier.get(nome) || null;
            if (!dossier && !_figCercati.has(nome)) daCercare.push({ src, nome });
            if (dossier) out.push({ src, file, nome, impronta: dossier.impronta, dossier });
        });
        if (daCercare.length) _figCerca(daCercare);
        return out;
    }
    /* dal vault, una volta per nome: quando arriva qualcosa si ridisegna */
    function _figCerca(voci) {
        const MF = _figModulo(); const s = _appState();
        let trovati = 0;
        const catena = voci.reduce((p, e) => p.then(() => {
            _figCercati.add(e.nome);
            const vp = e.src.vaultDi || (s && s.activeVaultPath);
            if (!vp) return;
            return Promise.resolve(MF.trovaDossier({ nome: e.nome, vaultPath: vp })).then(d => { if (d) { _figDossier.set(e.nome, d); trovati++; } }).catch(() => { });
        }), Promise.resolve());
        catena.then(() => { if (trovati) { render(); _figAnnuncia(); } }).catch(() => { });
    }
    /* 0114 (trappola 15): la tabella «Figure» della console mostra un numero scritto qui; ogni gesto lo annuncia */
    function _figAnnuncia() {
        try { if (typeof CustomEvent === 'function' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('mappai-figure-cambiata')); } catch (e) { }
    }
    const FIG_ORDINE = { giallo: 0, rosso: 1, 'non letto': 2, verde: 3, saltato: 4 };
    function _figStato(v) { return v.stato || 'saltato'; }
    function _figCore() { return window.MappAIFigureCore || null; }
    /* 0114 (revisione 1 dell'ADR 0024, punto 3): «controllata dal docente» si DEDUCE dal dossier, nel core; il contatore
       della tabella «Figure» è UNA funzione del core (`dossier.daControllare`, §5 del packet, inv. 6): la vista non decide stati. */
    function _figControllata(v) { const C = _figCore(); return !!(C && C.dossier && C.dossier.controllata && C.dossier.controllata(v)); }
    function _figChiusa(v) { return _figControllata(v) && !_figAperte.has(v.identita); }
    function _figDaControllare(d) { const C = _figCore(); return (C && C.dossier && C.dossier.daControllare) ? C.dossier.daControllare(d) : 0; }
    /* le quattro sezioni della vista (bivio 2): 0 da controllare (gialli e rossi non controllati, non letti) · 1 controllate dal
       docente · 2 due letture concordi · 3 senza lettura (foto, doppioni, oltre il tetto) */
    function _figSezione(v) {
        const st = _figStato(v);
        if (st === 'non letto') return 0;
        // 0114, dal gate 3 (Giacomo, 21/10): una figura controllata non va in una sezione sua, resta al suo posto e si chiude
        if (st === 'giallo' || st === 'rosso') return 0;
        return st === 'verde' ? 2 : 3;
    }
    /* l'interruttore di «Va bene così» (bivio 3, si sceglie al gate 3): 'figura' | 'riga' | 'entrambe' (di serie) */
    function _figVaBene() {
        let m = null; try { m = localStorage.getItem('mappai_figure_vabene'); } catch (e) { }
        return (m === 'figura' || m === 'riga') ? m : 'entrambe';
    }
    /* le voci delle fonti, nell'ordine della vista: per sezione, poi per stato, nome e pagina. `nome` limita a UN PDF (la riga
       della tabella «Figure» della console); un nome che non corrisponde a nessuna fonte mostra tutto. */
    function _figVoci(nome) {
        _figIndice = [];
        let fonti = _figFonti();
        if (nome) { const sel = fonti.filter(e => e.nome === nome); if (sel.length) fonti = sel; }
        fonti.forEach(e => {
            (e.dossier.ritagli || []).forEach(voce => { _figIndice.push({ nome: e.nome, src: e.src, file: e.file, impronta: e.impronta, dossier: e.dossier, voce }); });
        });
        _figIndice.forEach((x, k) => { x.k = k; });
        return _figIndice.slice().sort((a, b) => (_figSezione(a.voce) - _figSezione(b.voce)) || (FIG_ORDINE[_figStato(a.voce)] - FIG_ORDINE[_figStato(b.voce)]) || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0) || ((a.voce.pagina || 0) - (b.voce.pagina || 0)));
    }
    /* per la tabella «Figure» della console (0114, D2): una riga per PDF con dossier — quante figure lette, quante da
       controllare (core), quante controllate dal docente */
    function figTabella() {
        return _figFonti().map(e => {
            const ritagli = e.dossier.ritagli || [];
            return { nome: e.nome, daControllare: _figDaControllare(e.dossier), totale: ritagli.length, controllate: ritagli.filter(_figControllata).length };
        });
    }
    function _figEtichetta(v) {
        if (v.stato === 'verde') return t('fig_stato_concordi', 'due letture concordi');
        if (v.stato === 'giallo') return t('fig_stato_divergono', 'le due letture divergono: controlla');
        if (v.stato === 'rosso') return t('fig_stato_escluso', 'escluso');
        if (v.stato === 'non letto') return t('fig_stato_non_letto', 'non letto');
        return t('fig_stato_saltato', 'senza lettura');
    }
    function _figChiaveGoogle() {
        try { return !!(window.getProviderKey && window.getProviderKey('google')); } catch (e) { return false; }
    }
    /* le righe della scheda: `verde` dall'accordo, `confermata` se il docente ha detto «va bene» su quella riga (righeConfermate) */
    function _figRighe(v) {
        const C = _figCore();
        let righe;
        if (v.righe && v.righe.length) righe = v.righe.map(r => ({ testo: r.testo, verde: r.verde !== false }));
        else {
            const grezzo = (v.letture && (v.letture.titolare || v.letture.controllo)) || '';
            righe = (!grezzo || !C) ? [] : C.lettore(grezzo).righe.map(x => ({ testo: x, verde: v.stato === 'verde' }));
        }
        const ok = {};
        if (C) (v.righeConfermate || []).forEach(x => { ok[C.compatta(x)] = true; });
        righe.forEach(r => { r.confermata = !!(C && ok[C.compatta(r.testo)]); });
        return righe;
    }
    /* La scheda (bivio 2 del packet 0114): immagine e righe, SENZA bottoni; i gesti stanno nella barra sotto (`_figBarra`).
       Sul giallo non ancora controllato per intero, con l'interruttore ≠ 'figura', ogni riga gialla ha la spunta «va bene». */
    function _figCard(x) {
        const v = x.voce, k = x.k, st = _figStato(v);
        const inCorso = _figInCorso.has(k);
        const pagina = t('fig_pagina', 'pagina {n}').replace('{n}', String(v.pagina || '?'));
        const scansione = v.tipo === 'SCANSIONE';
        const righe = _figRighe(v);
        const controllata = _figControllata(v);
        const chiusa = _figChiusa(v);
        const spunte = st === 'giallo' && !v.confermato && _figVaBene() !== 'figura';
        let h = '<article class="elab-fig-card elab-fig-' + esc(st.replace(' ', '-')) + (chiusa ? ' elab-fig-chiusa' : '') + '" data-fig-k="' + k + '" data-fig-id="' + esc(v.identita) + '" data-fig-stato="' + esc(st) + '"' + (controllata ? ' data-fig-controllata="1"' : '') + '>';
        /* 0114, dal gate 3 (Giacomo, 21/10): la figura controllata resta al suo posto, chiusa; la testata la riapre e la richiude */
        const apri = controllata ? ' role="button" tabindex="0" aria-expanded="' + (chiusa ? 'false' : 'true') + '" onclick="MappAIElabora.figApri(' + k + ')"' +
            ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();MappAIElabora.figApri(' + k + ')}"' : '';
        h += '<div class="elab-fig-top' + (controllata ? ' elab-fig-apri' : '') + '"' + apri + '><span class="elab-fig-pag">' + esc(pagina) + '</span>' +
            (v.tipo ? '<span class="elab-fig-tipo">' + esc(v.tipo) + '</span>' : '') +
            '<span class="elab-fig-stato">' + esc(_figEtichetta(v)) + '</span>' +
            (controllata ? '<span class="elab-fig-badge elab-fig-badge-ok">' + esc(t('fig_confermato', 'controllata')) + '</span>' : '') +
            (v.testoCorretto ? '<span class="elab-fig-badge">' + esc(t('fig_corretto', 'corretto dal docente')) + '</span>' : '') +
            '</div>';
        if (chiusa) return h + '</article>';
        const note = [v.motivo, v.nota].filter(Boolean).join(' · ');
        if (note) h += '<div class="elab-fig-nota">' + esc(note) + '</div>';
        const conImmagine = (st === 'giallo' || st === 'rosso' || st === 'non letto');
        h += '<div class="elab-fig-corpo">';
        if (conImmagine) h += '<div class="elab-fig-imgw"><img class="elab-fig-img" data-fig-img="' + k + '" alt=""></div>';
        h += '<div class="elab-fig-testo">';
        if (st === 'rosso' && !scansione && v.letture && v.letture.titolare && v.letture.controllo) {
            // l'escluso: le due letture, così il docente sa che cosa conferma
            h += '<div class="elab-fig-lbl">' + esc(t('fig_lettura_titolare', 'Lettura del titolare')) + '</div><pre class="elab-fig-pre">' + esc(v.letture.titolare) + '</pre>' +
                '<div class="elab-fig-lbl">' + esc(t('fig_lettura_controllo', 'Lettura di controllo')) + '</div><pre class="elab-fig-pre">' + esc(v.letture.controllo) + '</pre>';
        } else if (righe.length) {
            h += '<div class="elab-fig-righe">' + righe.map((r, i) => {
                const ok = r.verde || r.confermata || !!v.confermato;
                const cls = 'elab-fig-riga' + (ok ? '' : ' elab-fig-riga-div');
                if (spunte && !r.verde) {
                    return '<div class="' + cls + '"><label><input type="checkbox" data-fig-riga="' + i + '"' + (r.confermata ? ' checked' : '') + (inCorso ? ' disabled' : '') +
                        ' onchange="MappAIElabora.figVaBeneRiga(' + k + ',' + i + ',this.checked)"> <span class="elab-fig-badge">' + esc(t('fig_va_bene_riga', 'va bene')) + '</span> ' + esc(r.testo) + '</label></div>';
                }
                return '<div class="' + cls + '">' + esc(r.testo) + '</div>';
            }).join('') + '</div>';
        }
        if (v.forseManca && v.forseManca.length) {
            h += '<div class="elab-fig-righe">' + v.forseManca.map(l => '<div class="elab-fig-riga elab-fig-riga-forse"><span class="elab-fig-forse">' + esc(t('fig_forse_manca', 'forse manca')) + '</span> ' + esc(l) + '</div>').join('') + '</div>';
        }
        /* 0114, dal gate 3 (Giacomo, 21/10): per le schede con molte righe gialle, un colpo solo — prima di «Testo corretto» */
        const daSpuntare = spunte ? righe.filter(r => !r.verde && !r.confermata).length : 0;
        if (daSpuntare >= 2) {
            h += '<div class="elab-fig-tutte"><button type="button" class="elab-btn elab-tiny"' + (inCorso ? ' disabled' : '') + ' onclick="MappAIElabora.figVaBeneTutte(' + k + ')">' +
                esc(t('fig_va_bene_tutte', 'Spunta tutte le righe')) + '</button></div>';
        }
        // la casella del testo corretto: su ogni ritaglio letto (non sui saltati e non sui «non letti»)
        if (st === 'giallo' || st === 'verde' || st === 'rosso') {
            h += '<label class="elab-fig-lbl" for="elab-fig-tx-' + k + '">' + esc(t('fig_testo_corretto', 'Testo corretto')) + '</label>' +
                '<textarea class="elab-fig-tx" id="elab-fig-tx-' + k + '" rows="3">' + esc(v.testoCorretto || '') + '</textarea>';
        }
        return h + '</div></div></article>';
    }
    /* La barra d'azione SOTTO la scheda (Giacomo, bivio 2): «Leggi comunque» (foto, doppioni, non letti), «Rileggi» (escluso),
       «Rileggi con Google» (scansione, solo con la chiave), «Conferma il testo» (escluso), «Va bene così» (giallo non controllato,
       interruttore ≠ 'riga'), «Salva la correzione» (ogni ritaglio letto). Riusa `.elab-actions` e i bottoni della fonte. */
    function _figBarra(x) {
        const v = x.voce, k = x.k, st = _figStato(v);
        if (_figChiusa(v)) return '';
        const inCorso = _figInCorso.has(k);
        const scansione = v.tipo === 'SCANSIONE', testoImm = v.tipo === 'TESTO-IMMAGINI', formule = v.tipo === 'FORMULE';
        const righe = _figRighe(v);
        const corregibile = (st === 'giallo' || st === 'verde' || st === 'rosso');
        const azioni = [];
        const occupato = inCorso ? ' disabled' : '';
        const leggi = t('fig_leggi_comunque', 'Leggi comunque'), rileggi = t('fig_rileggi', 'Rileggi'), inCorsoT = t('fig_in_corso', 'Leggo…');
        if (!scansione && !testoImm && !formule && (st === 'saltato' || st === 'non letto' || st === 'rosso')) {
            azioni.push('<button type="button" class="elab-btn elab-tiny' + (st === 'rosso' ? ' elab-ghost' : '') + '"' + occupato + ' onclick="MappAIElabora.figLeggi(' + k + ')">' + esc(inCorso ? inCorsoT : (st === 'rosso' ? rileggi : leggi)) + '</button>');
        }
        if (scansione && _figChiaveGoogle()) {
            azioni.push('<button type="button" class="elab-btn elab-tiny"' + occupato + ' onclick="MappAIElabora.figRileggiGoogle(' + k + ')">' + esc(inCorso ? inCorsoT : t('fig_rileggi_google', 'Rileggi con Google')) + '</button>' +
                '<span class="elab-fig-avviso">' + esc(t('fig_avviso_google', 'Il testo esce dalla Svizzera. Con la chiave gratuita Google può usarlo per i suoi prodotti e farlo leggere a persone. Non farlo se nel PDF ci sono lavori o nomi di allievi.')) + '</span>');
        }
        if (st === 'rosso' && !v.confermato && righe.length) {
            azioni.push('<button type="button" class="elab-btn elab-tiny elab-primary"' + occupato + ' onclick="MappAIElabora.figConferma(' + k + ')">' + esc(t('fig_conferma', 'Conferma il testo')) + '</button>');
        }
        if (st === 'giallo' && !_figControllata(v) && _figVaBene() !== 'riga') {
            azioni.push('<button type="button" class="elab-btn elab-tiny elab-primary"' + occupato + ' onclick="MappAIElabora.figConferma(' + k + ')">' + esc(t('fig_va_bene', 'Va bene così')) + '</button>');
        }
        if (corregibile) {
            azioni.push('<button type="button" class="elab-btn elab-tiny"' + occupato + ' onclick="MappAIElabora.figSalva(' + k + ')">' + esc(t('fig_salva', 'Salva la correzione')) + '</button>');
        }
        return azioni.length ? '<div class="elab-actions elab-fig-azioni" data-fig-barra="' + k + '">' + azioni.join('') + '</div>' : '';
    }
    function _figureHTML(fig) {
        _figStili();
        const sez = [[], [], [], []];
        fig.forEach(x => { sez[_figSezione(x.voce)].push(x); });
        const nFonti = new Set(fig.map(x => x.nome)).size;
        const blocco = x => '<div data-fig-blocco="' + x.k + '">' + _figCard(x) + _figBarra(x) + '</div>';
        /* 0118: col PDF a destra il blocco su cui si clicca (o dove entra il fuoco) è la figura su cui si lavora: un gestore solo,
           sul contenitore, che risale al blocco; il contorno della scelta lo mette `_figPdfMonta` dopo il disegno */
        const gesti = _figPdfAccesa() ? ' onclick="MappAIElabora.figDa(event)" onfocusin="MappAIElabora.figDa(event)"' : '';
        const sezione = (titolo, arr, n) => arr.length ? '<div class="elab-sec-lbl elab-lbl">' + esc(titolo) + ' · ' + (n === undefined ? arr.length : n) + '</div>' + arr.map(blocco).join('') : '';
        return '<div class="elab-stack elab-fig"' + gesti + '>' +
            '<div class="elab-fig-head"><div class="elab-fig-h">' + esc(t('fig_sezione', 'Testo delle figure')) + '</div>' +
            '<div class="elab-fig-intro">' + esc(t('fig_intro', 'Il testo letto dalle immagini del PDF: due letture confrontate riga per riga. Qui controlli, correggi e sblocchi; il testo corretto vince alla generazione successiva.')) +
            (nFonti > 1 ? ' · ' + nFonti + ' PDF' : '') + '</div></div>' +
            sezione(t('fig_sez_controlla', 'Da controllare'), sez[0], sez[0].filter(x => !_figControllata(x.voce)).length) +
            sezione(t('fig_stato_concordi', 'due letture concordi'), sez[2]) +
            sezione(t('fig_sez_saltati', 'Senza lettura: foto, doppioni, oltre il tetto'), sez[3]) +
            '</div>';
    }
    function _figStili() {
        if (_figStiliOk || !document.head) return; _figStiliOk = true;
        const st = document.createElement('style');
        st.id = 'elab-fig-styles';
        /* 0114, dal gate 3 (Giacomo, 21/10: «usa i token per la gerarchia delle dimensioni dei font definite per gli editor»):
           i corpi dalla famiglia di mappai-modal-tokens.css (titolo · testo · etichetta · aiuto · sezione) e i testi da rivedere al
           corpo di LETTURA (--mm-fs-lettura, quello degli item dell'editor); una colonna sola, l'immagine sopra, centrata e larga
           quanto la scheda («rendere l'immagine più grande»); la figura controllata si chiude e la testata la riapre. */
        st.textContent = '.elab-fig{max-width:760px}' +
            '.elab-fig-head{padding:2px 0 6px}.elab-fig-h{font-weight:700;font-size:var(--mm-fs-titolo)}.elab-fig-intro{font-size:var(--mm-fs-testo);color:var(--esoft);margin-top:3px;line-height:1.5}' +
            '.elab-fig-card{border:1px solid var(--eline);border-radius:12px;background:var(--epanel);box-shadow:0 1px 2px rgba(15,23,42,.05);padding:11px 13px}' +
            '.elab-fig-giallo{border-color:var(--enoticel)}.elab-fig-rosso{border-color:var(--eline2);background:var(--epanel2)}' +
            '.elab-fig-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:var(--mm-fs-testo)}.elab-fig-apri{cursor:pointer}' +
            '.elab-fig-pag{font-weight:700}.elab-fig-tipo{font-size:var(--mm-fs-sez);font-weight:700;letter-spacing:.05em;color:var(--efaint)}' +
            '.elab-fig-stato{font-weight:700;color:var(--eink2)}.elab-fig-giallo .elab-fig-stato{color:var(--enotice)}.elab-fig-verde .elab-fig-stato{color:var(--egood)}' +
            '.elab-fig-badge{font-size:var(--mm-fs-label);font-weight:700;padding:2px 8px;border-radius:999px;background:var(--egoods);color:var(--egood)}' +
            '.elab-fig-badge-ok{text-transform:uppercase;letter-spacing:.08em}' +
            '.elab-fig-nota{font-size:var(--mm-fs-aiuto);color:var(--efaint);margin-top:2px}' +
            '.elab-fig-corpo{display:flex;flex-direction:column;gap:12px;margin-top:8px}' +
            '.elab-fig-imgw{align-self:center;width:100%}.elab-fig-img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;border:1px solid var(--eline);border-radius:8px;background:var(--epanel2);min-height:40px}' +   /* locale: 70vh, un ritaglio alto non deve spingere la barra fuori dallo schermo */
            '.elab-fig-testo{min-width:0}' +
            '.elab-fig-righe{font-size:var(--mm-fs-lettura);line-height:1.55;color:var(--eink)}.elab-fig-riga{padding:1px 6px;border-radius:5px}' +
            '.elab-fig-riga-div{background:var(--enotices);box-shadow:inset 3px 0 0 var(--enoticel)}' +
            '.elab-fig-riga-forse{color:var(--esoft)}.elab-fig-forse{font-size:var(--mm-fs-label);font-weight:700;color:var(--egap);background:var(--egaps);padding:1px 6px;border-radius:999px;margin-right:4px}' +
            '.elab-fig-tutte{margin-top:8px}' +
            '.elab-fig-lbl{font-size:var(--mm-fs-label);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--efaint);margin:8px 0 3px;display:block}' +
            '.elab-fig-pre{font:inherit;font-size:var(--mm-fs-lettura);white-space:pre-wrap;margin:0;color:var(--eink2);line-height:1.5}' +
            '.elab-fig-tx{font:inherit;font-size:var(--mm-fs-lettura);width:100%;box-sizing:border-box;border:1px solid var(--eline2);border-radius:8px;padding:6px 8px;color:var(--eink);background:var(--epanel)}' +
            '.elab-fig-azioni{align-items:center}.elab-fig-avviso{font-size:var(--mm-fs-aiuto);color:var(--esoft);flex:1 1 220px;line-height:1.45}';
        document.head.appendChild(st);
    }
    /* le immagini dei ritagli, dopo il disegno: dal PDF già aperto della prova a secco, altrimenti dal file con pdf.js; `ritaglia` del modulo */
    function _figMonta() {
        const token = ++_figToken;
        const MF = _figModulo(); if (!MF || !MF.ritaglia) return;
        const imgs = document.querySelectorAll('img[data-fig-img]');
        if (!imgs || !imgs.length) return;
        const docs = new Map();
        const docDi = x => {
            if (!docs.has(x.nome)) docs.set(x.nome, _figDocDi(x));
            return docs.get(x.nome);
        };
        let catena = Promise.resolve();
        Array.prototype.forEach.call(imgs, img => {
            catena = catena.then(() => {
                if (token !== _figToken) return;
                const x = _figIndice[Number(img.getAttribute('data-fig-img'))];
                if (!x || !x.voce.rettPt) return;
                const r = x.voce.rettPt, rett = { x: r[0], y: r[1], w: r[2], h: r[3] };
                const ppi = x.voce.tipo === 'SCANSIONE' ? 30 : 72;
                return docDi(x).then(pdf => pdf.getPage(x.voce.pagina)).then(page => MF.ritaglia(page, rett, [ppi, ppi])).then(res => {
                    if (token !== _figToken || !res) return;
                    img.src = res.dataUrl;
                }).catch(() => { /* senza immagine resta il testo */ });
            });
        });
    }
    /* il documento pdf.js di un PDF con figure: dalla prova a secco già aperta, dal file con pdf.js, altrimenti dal vault */
    function _figDocDi(x) {
        const prova = x.src && x.src._figure;
        if (prova && prova._pdf && prova._pdf.getPage) return Promise.resolve(prova._pdf);
        if (_figProve.get(x.nome) && _figProve.get(x.nome)._pdf) return Promise.resolve(_figProve.get(x.nome)._pdf);
        if (typeof pdfjsLib !== 'undefined' && x.file && typeof x.file.arrayBuffer === 'function') return x.file.arrayBuffer().then(buf => pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise);
        return _figBytesDalVault(x.nome).then(bytes => pdfjsLib.getDocument({ isEvalSupported: false, data: bytes }).promise);
    }

    /* ── 0118: il PDF originale a destra nella vista «Figure» ──────────────────────────
       Giacomo, 21/10: «lo split destro con la fonte originale aperta al posto che le CARD delle
       analisi o la struttura dell'albero». Si apre alla pagina della PRIMA figura della vista; un
       clic o il fuoco su una scheda portano il PDF alla pagina di quella figura e ci spostano un
       riquadro sul ritaglio letto (`rettPt`, in punti della pagina con l'origine in alto a sinistra,
       come lo usa `ritaglia`). Il riquadro è in percentuale della pagina: segue la larghezza della
       colonna quando la maniglia si sposta.
       ⚠️ La vista «Figure» chiama `render()` a ogni gesto (`_figDopo`): il PDF NON si ridisegna.
       Le pagine vivono in un elemento che resta (`_figPdf.el`) e a ogni disegno si riappende allo
       slot, con lo scorrimento di prima. Niente tetto di 30 pagine: si rendono quelle che si vedono
       (IntersectionObserver) e quella della figura scelta. */
    let _figPdf = null;            // { nome, el, pdf, n, pagine[], dim{}, rese:Set, top, riq, sel, attesa }
    let _figSel = null;            // identità del ritaglio su cui si lavora
    let _figPdfVoci = [];          // le voci della vista, nell'ordine in cui si vedono
    function _figVoceSel(voci) {
        return voci.find(x => x.voce.identita === _figSel) || voci[0] || null;
    }
    function _figPdfPaneHTML() {
        _figPdfVoci = _figVoci(_figNome);
        const x = _figVoceSel(_figPdfVoci);
        const nome = x ? x.nome : (_figNome || '');
        const pagina = x ? (x.voce.pagina || 1) : '';
        return '<section class="elab-pane elab-figpdf-pane" data-figpdf-nome="' + esc(nome) + '" data-figpdf-pagina="' + esc(String(pagina)) + '">' +
            '<div class="elab-pane-head"><span class="elab-lbl">' + t('fig_pdf_titolo', 'PDF originale') + '</span>' +
            '<span class="elab-figpdf-nome">' + esc(nome) + '</span><div class="elab-spacer"></div>' +
            '<span class="elab-lbl elab-muted" data-figpdf-info>' + esc(_figPdfInfo(pagina)) + '</span></div>' +
            '<div class="elab-figpdf-slot"></div>' +
            '</section>';
    }
    function _figPdfInfo(pagina) {
        if (!pagina) return '';
        const n = _figPdf && _figPdf.n;
        return n ? t('fig_pdf_pagina_di', 'pagina {n} di {m}').replace('{n}', String(pagina)).replace('{m}', String(n))
            : t('fig_pagina', 'pagina {n}').replace('{n}', String(pagina));
    }
    /* il riquadro del ritaglio, in % della pagina (pura: la provano i test) */
    function _figRiquadro(voce, dim) {
        const r = voce && voce.rettPt;
        if (!r || !dim || !(dim[0] > 0) || !(dim[1] > 0)) return null;
        const pc = (a, b) => Math.max(0, Math.min(100, a / b * 100));
        return { left: pc(r[0], dim[0]), top: pc(r[1], dim[1]), width: pc(r[2], dim[0]), height: pc(r[3], dim[1]) };
    }
    function _figPdfMonta() {
        const slot = document.querySelector('.elab-figpdf-slot');
        if (!slot) return;
        const x = _figVoceSel(_figPdfVoci);
        if (!x) { slot.innerHTML = '<div class="elab-pdf-loading">' + t('fig_pdf_nessuna', 'Nessuna figura in questo PDF.') + '</div>'; return; }
        _figSegnaScelta(x.k);
        const nuovo = !_figPdf || _figPdf.chiave !== _figPdfChiave(x);
        if (nuovo) { _figPdfChiudi(); _figPdfApri(x); }
        const st = _figPdf;
        slot.appendChild(st.el);
        if (!nuovo && st.top) st.el.scrollTop = st.top;   // riappeso: lo scorrimento di prima, non un salto
        _figPdfVai(st, x, nuovo);
    }
    /* lo stesso PDF = stessa impronta e stesso nome: due mappe con un PDF omonimo non si scambiano le pagine */
    function _figPdfChiave(x) { return (x.impronta || (x.dossier && x.dossier.impronta) || '') + '|' + x.nome; }
    /* il PDF a destra si chiude: l'osservatore si stacca, le pagine si liberano; il documento si distrugge solo se l'ha aperto
       questo pannello (mai quello della prova a secco, che serve ancora a ritagli e riletture) */
    function _figPdfChiudi() {
        const st = _figPdf; _figPdf = null;
        if (!st) return;
        try { if (st.io) st.io.disconnect(); } catch (e) { }
        try { if (st.proprio && st.pdf && st.pdf.destroy) st.pdf.destroy(); } catch (e) { }
        st.pagine = []; st.rese.clear();
        if (st.el && st.el.remove) st.el.remove();
    }
    function _figPdfApri(x) {
        const el = document.createElement('div');
        el.className = 'elab-figpdf';
        const st = { chiave: _figPdfChiave(x), nome: x.nome, el, pdf: null, proprio: false, io: null, n: 0, pagine: [], dim: {}, rese: new Set(), top: 0, riq: null, sel: null, attesa: null };
        _figPdf = st;
        el.addEventListener('scroll', () => { st.top = el.scrollTop; });
        el.innerHTML = '<div class="elab-pdf-loading">' + t('el_pdf_loading', 'Caricamento PDF…') + '</div>';
        const condivisi = [x.src && x.src._figure && x.src._figure._pdf, _figProve.get(x.nome) && _figProve.get(x.nome)._pdf];
        let doc;
        try { doc = _figDocDi(x); } catch (e) { doc = Promise.reject(e); }
        Promise.resolve(doc).then(pdf => {
            const proprio = !!pdf && condivisi.indexOf(pdf) < 0;
            if (_figPdf !== st || !pdf) { if (proprio && pdf.destroy) pdf.destroy(); return; }
            st.pdf = pdf; st.proprio = proprio; st.n = pdf.numPages || 0;
            return pdf.getPage(1).then(p1 => {
                if (_figPdf !== st) return;
                const vp = p1.getViewport({ scale: 1 });
                st.dim[1] = [vp.width, vp.height];
                el.innerHTML = '';
                const io = st.io = (typeof IntersectionObserver === 'function')
                    ? new IntersectionObserver(voci => voci.forEach(v => { if (v.isIntersecting) _figPdfRendi(st, Number(v.target.getAttribute('data-figpdf-pagina'))); }), { root: el, rootMargin: '800px 0px' })
                    : null;
                for (let n = 1; n <= st.n; n++) {
                    const w = document.createElement('div');
                    w.className = 'elab-figpdf-pag';
                    w.setAttribute('data-figpdf-pagina', String(n));
                    w.style.aspectRatio = vp.width + ' / ' + vp.height;   // finché non si rende, la misura della prima pagina
                    el.appendChild(w); st.pagine.push(w);
                    if (io) io.observe(w);
                }
                const a = st.attesa; st.attesa = null;
                if (a) _figPdfVai(st, a.x, a.scorri);
            });
        }).catch(() => {
            if (_figPdf !== st) return;
            el.innerHTML = '<div class="elab-pdf-loading">' + t('fig_pdf_manca', 'Il PDF originale non è disponibile: le figure restano da controllare a sinistra.') + '</div>';
        });
    }
    function _figPdfRendi(st, n) {
        if (!st.pdf || !(n >= 1) || n > st.n || st.rese.has(n)) return Promise.resolve();
        st.rese.add(n);
        return st.pdf.getPage(n).then(page => {
            const vp = page.getViewport({ scale: 1 }), w = st.pagine[n - 1];
            st.dim[n] = [vp.width, vp.height];
            w.style.aspectRatio = vp.width + ' / ' + vp.height;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scala = Math.min(2.5, Math.max(320, st.el.clientWidth || 640) * dpr / vp.width);
            const v = page.getViewport({ scale: scala });
            const c = document.createElement('canvas');
            c.className = 'elab-figpdf-canvas';
            c.width = Math.round(v.width); c.height = Math.round(v.height);
            return page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.then(() => {
                if (st.proprio && page.cleanup) page.cleanup();
                if (_figPdf !== st) return;
                w.insertBefore ? w.insertBefore(c, w.firstChild) : w.appendChild(c);
                if (st.sel && (st.sel.voce.pagina || 1) === n) _figPdfRiq(st, st.sel);   // la misura vera della pagina
            });
        }).catch(() => { st.rese.delete(n); });
    }
    function _figPdfRiq(st, x) {
        const n = Math.min(Math.max(1, x.voce.pagina | 0 || 1), st.n || 1), w = st.pagine[n - 1];
        if (!w) return;
        if (!st.riq) st.riq = document.createElement('div');
        st.riq.className = 'elab-figpdf-riq elab-figpdf-riq-' + _figStato(x.voce).replace(' ', '-');
        const q = _figRiquadro(x.voce, st.dim[n] || st.dim[1]);
        if (q) { st.riq.style.left = q.left + '%'; st.riq.style.top = q.top + '%'; st.riq.style.width = q.width + '%'; st.riq.style.height = q.height + '%'; }
        w.appendChild(st.riq);
    }
    function _figPdfVai(st, x, scorri) {
        st.sel = x;
        if (!st.pagine.length) { st.attesa = { x, scorri: scorri || (st.attesa && st.attesa.scorri) }; return; }
        const n = Math.min(Math.max(1, x.voce.pagina | 0 || 1), st.n);
        _figPdfRendi(st, n);
        _figPdfRiq(st, x);
        if (scorri) { const w = st.pagine[n - 1]; st.el.scrollTop = Math.max(0, (w.offsetTop || 0) - 12); st.top = st.el.scrollTop; }
        const info = document.querySelector('[data-figpdf-info]');
        if (info) info.textContent = _figPdfInfo(x.voce.pagina || 1);
        const pane = document.querySelector('.elab-figpdf-pane');
        if (pane) pane.setAttribute('data-figpdf-pagina', String(x.voce.pagina || 1));
    }
    /* il gesto della scheda (clic o fuoco dentro il suo blocco): la figura su cui si lavora */
    function figMostra(k) {
        const x = _figIndice[k];
        if (!x || x.voce.identita === _figSel) return;
        _figSel = x.voce.identita;
        _figSegnaScelta(k);
        if (_figPdf && _figPdf.chiave === _figPdfChiave(x)) _figPdfVai(_figPdf, x, true);
        else render();   // una scheda di un altro PDF (vista di tutti i PDF): il pannello si ridisegna su quello
    }
    function figDa(ev) {
        const b = ev && ev.target && ev.target.closest ? ev.target.closest('[data-fig-blocco]') : null;
        if (b) figMostra(Number(b.getAttribute('data-fig-blocco')));
    }
    function _figSegnaScelta(k) {
        document.querySelectorAll('[data-fig-blocco]').forEach(b => { if (b.getAttribute('data-fig-blocco') === String(k)) b.classList.add('elab-fig-sel'); else b.classList.remove('elab-fig-sel'); });
    }
    /* per i test e la diagnosi: dove sta il PDF a destra */
    function figPdfStato() {
        const st = _figPdf, x = st && st.sel;
        return {
            nome: st ? st.nome : null, chiave: st ? st.chiave : null, pagine: st ? st.n : 0, montate: st ? st.pagine.length : 0,
            pagina: x ? (x.voce.pagina || 1) : null, sel: x ? x.voce.identita : null,
            riquadro: x ? _figRiquadro(x.voce, st.dim[x.voce.pagina || 1] || st.dim[1]) : null
        };
    }

    /* la prova a secco per rileggere: quella della fonte (stessa seduta), altrimenti rifatta qui dal file (zero chiamate) */
    function _figProva(x) {
        const MF = _figModulo();
        const prova = x.src && x.src._figure;
        if (prova && prova.pagine && prova._pdf) return Promise.resolve(prova);
        if (_figProve.has(x.nome)) return Promise.resolve(_figProve.get(x.nome));
        if (!MF.prova) return Promise.reject(new Error(t('el_pdf_nolib', 'Visualizzatore PDF non disponibile.')));
        const byte = (x.file && typeof x.file.arrayBuffer === 'function') ? x.file.arrayBuffer() : _figBytesDalVault(x.nome);
        return byte.then(buf => MF.prova(buf, { nome: x.nome })).then(pr => { _figProve.set(x.nome, pr); return pr; });
    }
    /* Su una mappa riaperta dal vault la fonte non ha un `File`: il PDF si legge da `Fonti/<nome>` con `readVaultFile`
       (gate 3, 19/10: le immagini dei ritagli restavano vuote e «Leggi comunque» diceva «PDF non disponibile»). */
    function _figBytesDalVault(nome) {
        const api = window.electronAPI, vp = appState.activeVaultPath;
        if (!api || !api.readVaultFile || !vp || typeof pdfjsLib === 'undefined') return Promise.reject(new Error('PDF non disponibile'));
        return Promise.resolve(api.readVaultFile({ vaultPath: vp, relPath: 'Fonti/' + nome })).then(r => {
            if (!r || !r.ok || !r.base64) throw new Error((r && r.error) || 'PDF non disponibile');
            const bin = atob(r.base64), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        });
    }
    /* il vault in cui scrivere il .figure.json: solo dove `Fonti/` c'è già (ADR 0011 rev. 1), altrimenti si resta in memoria */
    async function _figVault(x) {
        const s = _appState();
        const vp = (x.src && x.src.vaultDi) || (s && s.activeVaultPath);
        if (!vp) return null;
        const elenco = await _elencoFonti(vp);
        return (elenco && elenco.length) ? vp : null;
    }
    function _figOpz(x, vp) { return { nome: x.nome, vaultPath: vp, origine: 'elabora' }; }
    function _figDopo(k, p) {
        _figInCorso.add(k); render();
        return p.then(v => { _figInCorso.delete(k); render(); _figAnnuncia(); return v; }, e => {
            _figInCorso.delete(k); render(); _figAnnuncia();
            if (window.showToast) window.showToast(String(e && e.message || e), 'error');
            return null;
        });
    }
    function figLeggi(k) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.leggiUno || !x || _figInCorso.has(k)) return Promise.resolve(null);
        return _figDopo(k, Promise.all([_figProva(x), _figVault(x)]).then(r => MF.leggiUno(r[0], x.voce.identita, _figOpz(x, r[1]))).then(v => {
            if (v && window.showToast) window.showToast(t('fig_letto', 'Ritaglio letto: {stato}').replace('{stato}', _figEtichetta(v)), v.stato === 'verde' ? 'success' : 'info');
            return v;
        }));
    }
    function figRileggiGoogle(k) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.rileggiPagina || !x || _figInCorso.has(k)) return Promise.resolve(null);
        if (!_figChiaveGoogle()) { if (window.showToast) window.showToast(t('fig_serve_google', 'Serve la chiave Google nel cassetto: Google non parte mai da solo.'), 'warning'); return Promise.resolve(null); }
        const MM = window.MappAIModal;
        if (!MM || typeof MM.open !== 'function') return Promise.resolve(null);
        // la riga d'avviso dell'ADR §5.8, prima dell'invio; «Annulla» è la scelta di serie
        return Promise.resolve(MM.open({
            titolo: t('fig_rileggi_google', 'Rileggi con Google'), icona: 'scan-text', taglia: 's',
            sezioni: [{ testo: t('fig_avviso_google', 'Il testo esce dalla Svizzera. Con la chiave gratuita Google può usarlo per i suoi prodotti e farlo leggere a persone. Non farlo se nel PDF ci sono lavori o nomi di allievi.') }],
            azioni: [{ id: 'si', etichetta: t('fig_leggi_google', 'Leggi con Google') }, { id: 'no', etichetta: t('el_q_cancel', 'Annulla'), ruolo: 'primario' }]
        })).then(r => {
            if (!r || r.azione !== 'si') return null;
            return _figDopo(k, Promise.all([_figProva(x), _figVault(x)]).then(q => MF.rileggiPagina(q[0], x.voce.identita, Object.assign(_figOpz(x, q[1]), { google: true }))).then(v => {
                if (v && window.showToast) window.showToast(t('fig_letto', 'Ritaglio letto: {stato}').replace('{stato}', _figEtichetta(v)), 'info');
                return v;
            }));
        }, () => null);
    }
    function figConferma(k) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.conferma || !x || _figInCorso.has(k)) return Promise.resolve(null);
        _figAperte.delete(x.voce.identita);   // 0114, dal gate 3: controllata → si chiude
        return _figDopo(k, _figVault(x).then(vp => MF.conferma(x.impronta, x.voce.identita, _figOpz(x, vp))));
    }
    /* 0114: la spunta «va bene» su una riga gialla (interruttore ≠ 'figura'); `on === false` la toglie */
    function figVaBeneRiga(k, i, on) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.confermaRiga || !x || _figInCorso.has(k)) return Promise.resolve(null);
        const r = _figRighe(x.voce)[i | 0];
        if (!r) return Promise.resolve(null);
        return _figDopo(k, _figVault(x).then(vp => MF.confermaRiga(x.impronta, x.voce.identita, r.testo, Object.assign(_figOpz(x, vp), { togli: on === false }))));
    }
    /* 0114, dal gate 3 (Giacomo, 21/10): «Spunta tutte le righe» — la spunta di `figVaBeneRiga` su ogni riga gialla non ancora
       spuntata, una dopo l'altra (deposito e vault riscritti a ogni riga, come la spunta a mano); la scheda poi si chiude */
    function figVaBeneTutte(k) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.confermaRiga || !x || _figInCorso.has(k)) return Promise.resolve(null);
        _figAperte.delete(x.voce.identita);
        const testi = _figRighe(x.voce).filter(r => !r.verde && !r.confermata).map(r => r.testo);
        if (!testi.length) return Promise.resolve(null);
        return _figDopo(k, _figVault(x).then(vp => testi.reduce((p, testo) => p.then(() => MF.confermaRiga(x.impronta, x.voce.identita, testo, _figOpz(x, vp))), Promise.resolve(null))));
    }
    /* la testata di una scheda controllata: la riapre (per correggere o rivedere) e la richiude */
    function figApri(k) {
        const x = _figIndice[k];
        if (!x || !x.voce || !x.voce.identita) return;
        if (_figAperte.has(x.voce.identita)) _figAperte.delete(x.voce.identita); else _figAperte.add(x.voce.identita);
        render();
    }
    /* `testo` facoltativo: senza, si legge la casella della scheda */
    function figSalva(k, testo) {
        const MF = _figModulo(), x = _figIndice[k];
        if (!MF || !MF.correggi || !x || _figInCorso.has(k)) return Promise.resolve(null);
        if (testo === undefined) { const el = document.getElementById('elab-fig-tx-' + k); testo = el ? el.value : ''; }
        return _figDopo(k, _figVault(x).then(vp => MF.correggi(x.impronta, x.voce.identita, testo, _figOpz(x, vp))).then(v => {
            if (v && window.showToast) window.showToast(t('fig_salvato', 'Correzione salvata: vince alla generazione successiva.'), 'success');
            return v;
        }));
    }
    /* il .figure.json di ogni fonte PDF letta, da flushSourcesToVault (una chiamata): un guasto non ferma niente */
    async function _figScriviDossier(vp, fonti, fileDi) {
        const MF = _figModulo(); if (!MF || !MF.scriviDossier) return 0;
        let n = 0;
        for (const src of fonti) {
            if (!src) continue;
            const f = fileDi.get(src);
            const impronta = (src._figure && src._figure.impronta) || (f && f._letturaFigure && f._letturaFigure.dossier && f._letturaFigure.dossier.impronta) || (f && f._figure && f._figure.impronta) || null;
            if (!impronta) continue;
            const d = MF.dossierDi(impronta);
            if (!d || !d.ritagli || !d.ritagli.length) continue;
            try {
                const r = await MF.scriviDossier(vp, impronta);
                if (r && r.ok) n++; else console.warn('[ELABORA] .figure.json non scritto: ' + (r && r.error));
            } catch (e) { console.warn('[ELABORA] .figure.json non scritto: ' + (e && e.message)); }
        }
        return n;
    }

    // pannello fonte a sinistra: testo estratto OPPURE anteprima del PDF originale
    function _srcPaneHTML(corpus, pdfs) {
        const hasPdf = pdfs.length > 0;
        /* 0113: la terza vista, «Testo delle figure», c'è solo se qualche PDF ha un dossier delle figure */
        /* 0114 (D1): il segmento «Figure» non c'è più — la vista si apre dalla tabella «Figure» della console (una riga per
           PDF, `mountSource` con `view: 'figure'`); `_srcView === 'figure'` resta la strada interna. `_figNome` limita a quel PDF. */
        const fig = _figVoci(_srcView === 'figure' ? _figNome : null);
        const haFig = fig.length > 0;
        if (_srcView === 'figure' && !haFig) _srcView = 'text';
        let head = '<div class="elab-pane-head"><span class="elab-lbl">' + t('el_source', 'Materiale · fonte') + '</span>' +
            '<button type="button" class="elab-bpchip' + (_stripBoilerplateOn() ? ' on' : '') + '" onclick="MappAIElabora.toggleBoilerplate()" title="' + t('el_bp_tip', 'Ignora intestazioni e piè di pagina ricorrenti della scheda (evidenziazione, analisi, export e generazione)') + '">' + (_stripBoilerplateOn() ? '✓ ' : '') + t('el_bp_toggle', 'Ignora intestazioni') + '</button>';
        if (hasPdf) {
            head += '<div class="elab-spacer"></div><div class="elab-srcseg">' +
                '<button type="button" class="elab-seg' + (_srcView === 'text' ? ' active' : '') + '" onclick="MappAIElabora.setSrcView(\'text\')">' + t('el_view_text', 'Testo') + '</button>' +
                '<button type="button" class="elab-seg' + (_srcView === 'pdf' ? ' active' : '') + '" onclick="MappAIElabora.setSrcView(\'pdf\')">' + t('el_view_pdf', 'PDF') + '</button>' +
            '</div>';
        }
        head += '</div>';
        let body;
        if (_srcView === 'figure' && haFig) {
            body = '<div class="elab-pane-body">' + _figureHTML(fig) + '</div>';
        } else if (_srcView === 'pdf' && hasPdf) {
            let picker;
            if (pdfs.length > 1) {
                picker = '<select class="elab-pdfsel" onchange="MappAIElabora.setPdfIdx(this.selectedIndex)">' +
                    pdfs.map((p, i) => '<option' + (i === _pdfIdx ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>';
            } else {
                picker = '<span class="elab-pdfname">' + esc(pdfs[_pdfIdx] ? pdfs[_pdfIdx].name : (pdfs[0] && pdfs[0].name) || 'PDF') + '</span>';
            }
            body = '<div class="elab-pane-body elab-pdf-body">' +
                '<div class="elab-pdfbar">' + emo('add') + ' ' + picker + '<span class="elab-pdfinfo" id="elab-pdf-info"></span></div>' +
                '<div id="elab-pdf-scroll" class="elab-pdf-scroll"><div class="elab-pdf-loading">' + t('el_pdf_loading', 'Carico il PDF…') + '</div></div>' +
            '</div>';
        } else {
            body = '<div class="elab-pane-body"><div class="elab-reading">' + _sourceHTML(corpus) + '</div></div>';
        }
        return '<section class="elab-pane">' + head + body + '</section>';
    }

    // Raccoglie i PDF disponibili: quelli aggiunti in ELABORA (File in _pdfFiles),
    // i PDF del progetto ancora in memoria (src.file), e — dopo un riavvio — gli
    // originali salvati in <vault>/Fonti/ (src.vaultRel → pseudo-File che legge i
    // byte via IPC read-vault-file; _mountPdf usa solo .arrayBuffer, drop-in).
    function _collectPdfs() {
        const s = _appState(); const out = []; const seen = new Set();
        const add = (name, file, key) => {
            if (!file || typeof file.arrayBuffer !== 'function') return;
            const k = key || ((name || '') + ':' + (file.size || 0));
            if (seen.has(k)) return; seen.add(k);
            out.push({ name: name || 'PDF', file });
        };
        try {
            (s.sources || []).forEach(src => {
                const ef = _pdfFiles.get(src.id);
                if (ef) { add(src.name || 'PDF', ef); return; }
                const f = src.file;
                const nm = (src.name || (f && f.name) || '').toLowerCase();
                if (f && typeof f.arrayBuffer === 'function' && ((f.type === 'application/pdf') || nm.endsWith('.pdf'))) { add(src.name || (f && f.name) || 'PDF', f); return; }
                // read-back dal vault (dopo reload il File è morto → {})
                /* 0059 D12: dal vault in cui `vaultRel` vale (`vaultDi`), non da
                   quello aperto: dopo «Esporta nel Vault» in una cartella nuova il
                   PDF di `Allegati/` sta ancora nel vault di prima, e cercato nel
                   nuovo dava «Impossibile aprire il PDF». Solo lettura. Senza
                   `vaultDi` (schede di prima dello 0059) il vault aperto, come prima.
                   La chiave dice anche il vault: lo stesso `vaultRel` in due vault
                   sono due file. */
                const vpPdf = src.vaultDi || s.activeVaultPath;
                if (src.vaultRel && vpPdf && window.electronAPI && window.electronAPI.readVaultFile) {
                    add(src.name || 'PDF', _vaultPseudoFile(vpPdf, src.vaultRel, s.activeVaultPath), 'vault:' + vpPdf + '|' + src.vaultRel);
                }
            });
        } catch (e) { /* soft */ }
        return out;
    }

    // pseudo-File: espone solo .arrayBuffer() sui byte letti via IPC (cacheata)
    /* `ripiego` (0059 D12): il vault aperto, se la lettura da `vaultPath` (il
       `vaultDi` della fonte) non riesce. INSEGNA che sposta la mappa aperta
       aggiorna `activeVaultPath` e non il `vaultDi` delle fonti (D9): senza
       ripiego, il PDF di una mappa spostata non si aprirebbe più, e prima dello
       0059 si apriva. */
    function _vaultPseudoFile(vaultPath, relPath, ripiego) {
        let cached = null;
        const leggi = async function (vp) {
            const r = await window.electronAPI.readVaultFile({ vaultPath: vp, relPath: relPath });
            if (!r || !r.ok) throw new Error(r && r.error || 'read-vault-file fallita');
            return r;
        };
        return {
            name: relPath.split('/').pop(),
            arrayBuffer: async function () {
                if (cached) return cached;
                let res;
                try { res = await leggi(vaultPath); }
                catch (e) {
                    if (!ripiego || ripiego === vaultPath) throw e;
                    res = await leggi(ripiego);
                }
                const bin = atob(res.base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                cached = bytes.buffer;
                return cached;
            }
        };
    }

    // Frasi della fonte con colore di macro-area (per l'highlight sul PDF).
    // { n: frase normalizzata, color }. Salta le frasi neutre.
    function _coloredSentences() {
        try {
            const D = window.MappAIDeepenCore;
            if (!D || !D.splitSentences) return [];
            const corpus = _corpus();
            if (!corpus) return [];
            const out = [];
            D.splitSentences(corpus).forEach(sn => {
                const c = _sentColor(sn);
                if (c && c.color) out.push({ n: _normKey(sn), color: c.color, strength: c.strength || 'strong', group: c.group });
            });
            return out;
        } catch (e) { return []; }
    }

    // Disegna rettangoli colorati sopra il canvas di UNA pagina PDF, sulle parole
    // che appartengono a una frase colorata (best-effort: text layer pdf.js +
    // match della frase normalizzata nel testo concatenato della pagina).
    // Matching condiviso (anteprima DOM + export PDF): quali text item della
    // pagina cadono in una frase colorata. → Map(item idx → colore).
    // (0044, 28/9/26) Il confronto IGNORA gli spazi: indice e chiave senza spazi
    // dal core MappAIPdfTesto. Così ritrova sia il testo vecchio («Henr i») sia
    // il nuovo («Henri»): regge con mappai_pdf_unione_nativa = '0' e sui vault
    // salvati prima. La chiave è chiaveSenzaSpazi(cs.n), mai cs.n così com'è:
    // _normKey abbassa la stringa intera, l'indice carattere per carattere, e sul
    // sigma finale greco le due strade divergono. `pezzo` è allineato 1:1 alle
    // unità di `testo`. Core assente → Map vuota, come quando non c'è testo.
    function _matchColoredItems(tc, colored) {
        const items = (tc && tc.items) || [];
        const itemColor = new Map();
        const T = window.MappAIPdfTesto;
        if (!T || !items.length || !colored || !colored.length) return itemColor;
        const indice = T.indiceSenzaSpazi(items), testo = indice.testo, pezzo = indice.pezzo;
        if (!testo) return itemColor;
        colored.forEach(cs => {
            const chiave = T.chiaveSenzaSpazi(cs && cs.n);
            if (chiave.length < 8) return;
            const strong = cs.strength !== 'weak';
            let from = 0, pos;
            while ((pos = testo.indexOf(chiave, from)) >= 0) {
                const end = pos + chiave.length - 1;
                for (let ci = pos; ci <= end; ci++) {
                    const it = pezzo[ci], prev = itemColor.get(it);
                    if (!prev || (prev.strength === 'weak' && strong)) itemColor.set(it, { color: cs.color, strength: strong ? 'strong' : 'weak' });
                }
                from = pos + chiave.length;
            }
        });
        return itemColor;
    }

    function _paintPdfHighlights(wrap, tc, vpCss, scaleCss, colored) {
        const items = (tc && tc.items) || [];
        const itemColor = _matchColoredItems(tc, colored);
        if (!itemColor.size) return;
        const U = (window.pdfjsLib && pdfjsLib.Util) ? pdfjsLib.Util : null;
        const layer = document.createElement('div');
        layer.className = 'elab-pdf-hllayer';
        itemColor.forEach((info, idx) => {
            const it = items[idx];
            if (!it || !it.transform) return;
            const tx = U ? U.transform(vpCss.transform, it.transform) : it.transform;
            const fontH = Math.hypot(tx[2], tx[3]) || ((it.height || 10) * scaleCss);
            const width = (it.width || 0) * scaleCss;
            if (width <= 0) return;
            const hl = document.createElement('div');
            hl.className = 'elab-pdf-hl';
            hl.style.left = tx[4] + 'px';
            hl.style.top = (tx[5] - fontH) + 'px';
            hl.style.width = width + 'px';
            hl.style.height = fontH + 'px';
            hl.style.background = _rgba(info.color, info.strength === 'weak' ? 0.14 : 0.34);
            layer.appendChild(hl);
        });
        wrap.appendChild(layer);
    }

    /* ── 0118, dal gate 3: il PDF della vista «PDF» segue la larghezza della colonna ──
       La larghezza di una pagina è quella della colonna meno il margine; una pagina si disegna (o si RIdisegna) in un
       canvas nuovo, e solo a disegno finito prende il posto del vecchio: niente lampo bianco, lo scorrimento non salta. */
    let _pdfRO = null;             // l'osservatore della colonna del PDF (uno solo: il disegno nuovo stacca il vecchio)
    function _pdfLarghezza(scroll) { return Math.max(320, (scroll.clientWidth || 640) - 28); }
    async function _pdfDisegnaPagina(page, wrap, wCss, colored, token) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (wCss / vp1.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.className = 'elab-pdf-page';
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        if (token !== _pdfToken) return false;
        wrap.innerHTML = '';   // il canvas vecchio e le sue evidenziazioni
        wrap.appendChild(canvas);
        // Highlight colorati sul PDF: text layer pdf.js + match delle frasi (in px della larghezza disegnata).
        if (colored.length) {
            try {
                const tc = await page.getTextContent();
                if (token !== _pdfToken) return false;
                const vpCss = page.getViewport({ scale: wCss / vp1.width });
                _paintPdfHighlights(wrap, tc, vpCss, wCss / vp1.width, colored);
            } catch (e) { /* best-effort: senza text layer resta il canvas */ }
        }
        return true;
    }
    /* a barra ferma (300 ms senza cambi, e non durante il trascinamento) le pagine si ridisegnano alla larghezza nuova,
       una dopo l'altra, al loro posto */
    function _pdfOsserva(scroll, wCss, pagine, colored, token) {
        if (_pdfRO) { try { _pdfRO.disconnect(); } catch (e) { } _pdfRO = null; }
        if (typeof ResizeObserver !== 'function' || !pagine.length) return;
        let larga = wCss, timer = null, inCorso = false;
        const ro = _pdfRO = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(rifai, 300); });
        async function rifai() {
            if (token !== _pdfToken || !scroll.isConnected) { ro.disconnect(); if (_pdfRO === ro) _pdfRO = null; return; }
            if (inCorso || (scroll.closest && scroll.closest('.is-trascinando'))) { timer = setTimeout(rifai, 250); return; }
            const w = _pdfLarghezza(scroll);
            if (Math.abs(w - larga) < 12) return;
            larga = w; inCorso = true;
            pagine.forEach(p => { p.wrap.style.width = w + 'px'; });   // subito tutte alla misura nuova (il canvas scala), poi il disegno nitido
            try {
                for (const p of pagine) {
                    if (token !== _pdfToken || !scroll.isConnected) return;
                    if (await _pdfDisegnaPagina(p.page, p.wrap, w, colored, token) === false) return;
                    if (Math.abs(_pdfLarghezza(scroll) - w) >= 12) break;   // la colonna è cambiata ancora: riparte dal timer
                }
            } finally { inCorso = false; }
        }
        ro.observe(scroll);
    }

    // Render pagine PDF su canvas via pdf.js (già caricato, worker configurato).
    // Token-guardato: switch/teardown annulla i render obsoleti.
    async function _mountPdf(pdfs) {
        const token = ++_pdfToken;
        const scroll = document.getElementById('elab-pdf-scroll');
        const info = document.getElementById('elab-pdf-info');
        if (!scroll) return;
        const entry = pdfs[_pdfIdx] || pdfs[0]; if (!entry) return;
        if (typeof pdfjsLib === 'undefined') { scroll.innerHTML = '<div class="elab-pdf-loading">' + t('el_pdf_nolib', 'Visualizzatore PDF non disponibile.') + '</div>'; return; }
        const CAP = 30;
        try {
            const buf = await entry.file.arrayBuffer();
            if (token !== _pdfToken) return;
            const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;   // CVE-2024-4367, vedi _runPdfExport
            if (token !== _pdfToken) return;
            const total = pdf.numPages;
            const n = Math.min(total, CAP);
            if (info) info.textContent = (total > n ? (n + '/' + total) : String(total)) + ' ' + t('el_pdf_pages', 'pagine');
            scroll.innerHTML = '';
            const wCss = _pdfLarghezza(scroll);
            // Frasi della fonte con colore di macro-area (per l'highlight PDF).
            const colored = _coloredSentences();
            const pagine = [];
            for (let i = 1; i <= n; i++) {
                if (token !== _pdfToken) return;
                const page = await pdf.getPage(i);
                if (token !== _pdfToken) return;
                const vp1 = page.getViewport({ scale: 1 });
                const wrap = document.createElement('div');
                wrap.className = 'elab-pdf-pagewrap';
                /* 0118, dal gate 3 (Giacomo, 21/10: «quando restringo l'immagine si deforma»): larghezza in px ma
                   proporzioni fisse — se la colonna si stringe (la maniglia) la pagina si rimpicciolisce intera invece
                   di schiacciarsi; a barra ferma `_pdfOsserva` la ridisegna alla larghezza nuova. */
                wrap.style.width = wCss + 'px'; wrap.style.aspectRatio = vp1.width + ' / ' + vp1.height;
                scroll.appendChild(wrap);
                if (await _pdfDisegnaPagina(page, wrap, wCss, colored, token) === false) return;
                pagine.push({ page, wrap });
            }
            if (token !== _pdfToken) return;
            _pdfOsserva(scroll, wCss, pagine, colored, token);
            if (total > n) {
                const more = document.createElement('div');
                more.className = 'elab-pdf-loading';
                more.textContent = t('el_pdf_cap', 'Anteprima limitata alle prime ') + n + t('el_pdf_cap2', ' pagine.');
                scroll.appendChild(more);
            }
        } catch (e) {
            if (token !== _pdfToken) return;
            scroll.innerHTML = '<div class="elab-pdf-loading">' + t('el_pdf_err', 'Impossibile aprire il PDF.') + '</div>';
        }
    }

    function setSrcView(v) { _srcView = (v === 'pdf') ? 'pdf' : (v === 'figure' ? 'figure' : 'text'); if (v === 'figure') _figNome = null; render(); }   // 'figure': «Testo delle figure» (0113), tutti i PDF
    // #1: attiva/disattiva l'esclusione delle intestazioni/piè ricorrenti.
    function toggleBoilerplate() {
        const on = _stripBoilerplateOn();
        try { localStorage.setItem('mappai_strip_boilerplate', on ? '0' : '1'); } catch (e) { }
        render();
    }
    function setPdfIdx(i) { _pdfIdx = i | 0; render(); }

    function _sourceHTML(corpus) {
        if (!corpus || corpus.trim().length < 40) {
            return '<div class="elab-nosrc">' + emo('add') + ' ' + t('el_no_source', 'Nessuna fonte nel progetto. Aggiungi un testo o un PDF per analizzare la copertura.') + '</div>' + _dropzone();
        }
        // MAI troncare la fonte (richiesta utente 22/7): l'anteprima mostra il testo
        // INTERO — troncarlo depotenzia ELABORA (analisi e ancoraggio lavorano su
        // tutta la fonte). Ogni paragrafo, ogni frase.
        const paras = corpus.split(/\n{2,}/).filter(p => p.trim());
        const D = window.MappAIDeepenCore;
        const paraHTML = paras.map(p => {
            const trimmed = p.trim();
            // frasi wrappate in span classificati (residuo/coperta/neutra) per
            // l'ancoraggio bidirezionale; senza splitter → paragrafo piatto
            if (!D || !D.splitSentences) return '<p>' + esc(trimmed) + '</p>';
            const sents = D.splitSentences(trimmed);
            if (!sents || !sents.length) return '<p>' + esc(trimmed) + '</p>';
            return '<p>' + sents.map(sn => {
                const mk = _sentMark(sn);
                return '<span class="' + mk.cls + '"' + mk.attr + '>' + esc(sn) + '</span>';
            }).join(' ') + '</p>';
        }).join('');
        return paraHTML + _dropzone();
    }
    function _dropzone() {
        return '<div class="elab-dropzone" onclick="MappAIElabora.pickPdf()">' +
            '<span class="elab-emo elab-drop-emo">' + EMO.add + '</span>' +
            '<div><b>' + t('el_drop_h', 'Aggiungi materiale') + '</b><div class="elab-hint">' + t('el_drop_p', 'Un testo o un PDF si uniscono alla fonte → nuove citazioni per colmare i vuoti') + '</div></div>' +
        '</div>';
    }

    function _card(kind, iconKey, cls, title, meta, sev, sevCls, bodyHTML, ignoreKey, domId) {
        if (_ignored.has(ignoreKey)) return '';
        return '<div class="elab-card"' + (domId ? ' id="' + domId + '"' : '') + '>' +
            '<div class="elab-card-top"><span class="elab-icw ' + cls + '">' + emo(iconKey) + '</span>' +
            '<div><div class="elab-card-h">' + title + '</div>' + (meta ? '<div class="elab-card-meta">' + meta + '</div>' : '') + '</div>' +
            (sev ? '<span class="elab-sev ' + sevCls + '">' + sev + '</span>' : '') + '</div>' +
            '<div class="elab-card-body">' + bodyHTML + '</div></div>';
    }

    function _signalsHTML(R) {
        const sig = (R.text.signals || []).filter(x => !_ignored.has('sig:' + x.key));
        if (!sig.length) return '';
        let out = '<div class="elab-sec-lbl elab-lbl">' + t('el_sec_profile', 'Profilo del materiale') + '</div>';
        sig.forEach(x => {
            const body = esc(x.suggestion) +
                '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(' + _js('sig:' + x.key) + ')">' + t('el_ignore', 'Ignora') + '</button></div>';
            out += _card('sig', 'signal', 'notice', esc(x.observation), null, t('el_notice', 'da valutare'), 'notice', body, 'sig:' + x.key);
        });
        return out;
    }

    function _coverageHTML(R) {
        const cards = (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId));
        if (!R.coverage.hasSource) {
            return '<div class="elab-sec-lbl elab-lbl">' + t('el_sec_coverage', 'Copertura della fonte') + '</div>' +
                '<div class="elab-note-soft">' + t('el_cov_nosrc', 'Fonte insufficiente per misurare la copertura. Aggiungi materiale.') + '</div>';
        }
        if (!cards.length) return '';
        let out = '<div class="elab-sec-lbl elab-lbl">' + t('el_sec_coverage', 'Copertura della fonte') + '</div>';
        cards.forEach((c, ci) => {
            const meta = c.wordCount + ' ' + t('el_words', 'parole') + (c.groundedness != null ? ' · ' + t('el_anchor', 'ancoraggio') + ' ' + c.groundedness.toFixed(2) : '');
            let body = t('el_cov_intro', 'La fonte contiene testo su questo nodo non ancora nella scheda:');
            c.residue.forEach((r, ri) => {
                // la citazione è cliccabile → rivela la frase nella fonte (ancoraggio);
                // il bottone ferma la propagazione per non far scattare anche il reveal
                body += '<div class="elab-quote elab-quote-link" onclick="MappAIElabora.revealInSource(' + ci + ',' + ri + ')" title="' + t('el_quote_tip', 'Clicca per vedere la frase nella fonte') + '">«' + esc(r.text) + '»' +
                    '<span class="elab-new">+' + r.newWords + ' ' + t('el_new_words', 'parole nuove') + '</span>' +
                    '<div class="elab-actions">' +
                    '<button type="button" class="elab-btn elab-tiny elab-primary" onclick="event.stopPropagation();MappAIElabora.addCitation(' + ci + ',' + ri + ')">' + emo('cite') + ' ' + t('el_add_cite', 'Aggiungi citazione') + '</button>' +
                    '</div></div>';
            });
            body += '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(' + _js('cov:' + c.nodeId) + ')">' + emo('ignore') + ' ' + t('el_ignore_node', 'Ignora questo nodo') + '</button></div>';
            out += _card('cov', 'coverage', 'good', esc(c.label), meta, t('el_enrichable', 'arricchibile'), 'good', body, 'cov:' + c.nodeId, 'elab-card-cov-' + ci);
        });
        return out;
    }

    function _structuralHTML(R) {
        const items = (R.structural || []).map((x, i) => ({ x, i })).filter(o => !_ignored.has('str:' + o.i)).slice(0, 6);
        if (!items.length) return '';
        let out = '<div class="elab-sec-lbl elab-lbl">' + t('el_sec_structure', 'Struttura') + '</div>';
        items.forEach(o => {
            const msg = esc(o.x.message || o.x.title || o.x.type || '');
            const body = msg + '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(\'str:' + o.i + '\')">' + t('el_ignore', 'Ignora') + '</button></div>';
            out += _card('str', 'gap', 'gap', esc(o.x.label || t('el_struct_hint', 'Suggerimento strutturale')), null, null, 'gap', body, 'str:' + o.i);
        });
        return out;
    }

    function _legend() {
        return '<div class="elab-legend">' +
            '<div class="elab-k"><span class="elab-sw elab-sw-good"></span> ' + t('el_leg_cov', 'coperto dalla scheda') + '</div>' +
            '<div class="elab-k"><span class="elab-sw elab-sw-res"></span> ' + t('el_leg_res', 'nella fonte, non ancora nella scheda') + '</div>' +
            '<div class="elab-k elab-muted" style="margin-left:auto">' + t('el_leg_note', 'Nessun voto · citazioni verbatim · «Aggiungi» apre il nodo, non scrive testo AI') + '</div>' +
        '</div>';
    }

    // ── azioni (dispatcher) ─────────────────────────────────────────────────
    function addCitation(cardIdx, sentIdx) {
        if (!_R) return;
        const cards = (_R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId));
        const card = cards[cardIdx]; if (!card) return;
        const sent = card.residue[sentIdx]; if (!sent) return;
        const s = _appState();
        const node = (s.db.nodes || []).find(n => n.id === card.nodeId);
        if (!node) { if (window.showToast) showToast(t('el_node_gone', 'Nodo non trovato'), 'error'); return; }
        if (typeof window.openEditModal === 'function') {
            // decisione 1(B): apre l'edit modal precompilato con la citazione appesa
            window.openEditModal(node, sent.text);
        } else if (window.showToast) {
            showToast(t('el_no_editor', 'Editor nodo non disponibile'), 'error');
        }
    }

    function ignore(key) { _ignored.add(key); render(); }

    /* «Aggiungi PDF» (0059). `#elab-pdf-input` lo costruisce solo la vista
       vecchia (:387): dalla console di ELABORA il bottone non trovava niente e
       non faceva niente. Senza quel campo se ne crea uno al volo, SENZA id (un
       secondo `#elab-pdf-input` sarebbe un doppione quando la vista vecchia
       torna). Staccato dal documento la finestra di sistema può non aprirsi:
       sta nascosto in `body` e se ne va sia alla scelta sia all'annullamento. */
    function pickPdf() {
        /* 0096 (B): con un PDF già allegato non si apre la finestra di sistema. Il
           bottone della console è già spento: qui si fermano le altre strade (la
           zona «Aggiungi materiale» in fondo al testo, un clic programmato). */
        if (comandiFonte() && haPdf()) { if (window.showToast) showToast(motivoPdfGia(), 'info'); return; }
        const el = document.getElementById('elab-pdf-input');
        if (el) { el.click(); return; }
        if (!document.body) return;
        const campo = document.createElement('input');
        campo.type = 'file';
        campo.accept = 'application/pdf,.pdf';
        campo.style.display = 'none';
        const togli = () => { try { campo.remove(); } catch (e) { } };
        campo.onchange = () => { const p = onPdf(campo); togli(); return p; };   // onPdf legge il file prima di tornare
        campo.oncancel = togli;
        document.body.appendChild(campo);
        campo.click();
    }

    /* ── IL VELO E IL LUCCHETTO DI «AGGIUNGI PDF» (0059, D10) ────────────────
       Un PDF lungo si legge per secondi, e intanto il docente poteva aprire un
       altro progetto: il PDF e `fonti.json` finivano mezzi di qua e mezzi di
       là. Dalla scelta del file alla fine della scrittura (PDF in `Fonti/` e
       `fonti.json`) c'è il velo «Lettura del PDF…», e l'app è occupata:
       `mappaiOccupato()` (mappai-material-pipeline.js) lo chiede a
       `letturaPdfAttiva()` e avvisa con `motivoLetturaPdf()`, sul modello di
       `MappAIGen.attiva()`/`motivo()`. Così «Riprendi», «Apri Vault», INSEGNA,
       la briciola e l'elenco di ELABORA non cambiano mappa a metà.
       Il velo è `#loading-overlay`, a 9999 nel foglio, e la console di ELABORA
       sta a 12100: il piano si chiede al motore (inv. 11, trappola 52). Alla
       fine lo z-index in linea si toglie: chi usa il velo dopo (CREA, la
       pipeline, che lo porta dentro `#build-content`) lo ritrova com'era. */
    let _letturaPdf = false;
    function letturaPdfAttiva() { return _letturaPdf; }
    function motivoLetturaPdf() { return t('el_pdf_busy', 'Sto leggendo il PDF, riprova tra poco.'); }
    /* `testo` (0096): lo stesso velo serve anche all'export del PDF evidenziato,
       che a 9999 restava sotto la console. Senza, «Lettura del PDF…». */
    function _veloPdf(acceso, testo) {
        let el = null;
        try { el = document.getElementById('loading-overlay'); } catch (e) { }
        if (acceso) {
            try { const MM = window.MappAIModal; if (el && MM && MM.prossimoZ) el.style.zIndex = String(MM.prossimoZ()); } catch (e) { /* senza motore resta il 9999 del foglio */ }
            try { if (window.showLoadingOverlay) window.showLoadingOverlay(true, testo || t('el_pdf_reading', 'Lettura del PDF…')); } catch (e) { }
        } else {
            try { if (window.showLoadingOverlay) window.showLoadingOverlay(false); } catch (e) { }
            try { if (el) el.style.zIndex = ''; } catch (e) { }
        }
    }

    async function onPdf(input) {
        const file = input && input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (typeof window.extractTextFromPDF !== 'function') { if (window.showToast) showToast(t('el_no_pdf', 'Lettore PDF non disponibile'), 'error'); return; }
        /* D10: con l'app già occupata (una generazione, la pipeline, un altro
           PDF in lettura) non si comincia, e l'avviso lo dà `mappaiOccupato`,
           come agli altri guardiani: così il velo non è mai conteso. Si chiede
           PRIMA di chiudere il lucchetto, o risponderebbe «occupata» a sé stessa. */
        if (window.mappaiOccupato && window.mappaiOccupato()) return;
        if (window.showToast) showToast(t('el_reading_pdf', 'Lettura PDF…'), 'info');
        _letturaPdf = true;
        _veloPdf(true);
        try {
            const text = await window.extractTextFromPDF(file);
            if (!text || text.trim().length < 40) { if (window.showToast) showToast(t('el_pdf_empty', 'PDF senza testo estraibile'), 'error'); return; }
            /* si ATTENDE la scrittura (PDF in Fonti/, poi fonti.json): chi ha
               premuto il bottone ritrova il file sul disco quando onPdf finisce */
            await _persistSource('pdf', text, file.name || 'PDF', file);
            /* 0096 (B): `render()` a console aperta ridisegna solo la fonte, non la
               barra: senza questo «Aggiungi PDF» resterebbe premibile fino al
               prossimo ridisegno */
            try { const C = window.MappAIElaboraConsole; if (comandiFonte() && C && C.ridisegna) C.ridisegna(); } catch (e) { }
        } catch (e) {
            if (window.showToast) showToast(t('el_pdf_err', 'Errore lettura PDF'), 'error');
        } finally {
            /* sempre: anche col PDF senza testo e con un errore di lettura o di scrittura */
            _letturaPdf = false;
            _veloPdf(false);
        }
    }

    function addTextPrompt() {
        const doIt = (text) => { if (text && text.trim().length >= 40) _persistSource('text', text.trim(), t('el_pasted', 'Testo incollato')); else if (window.showToast) showToast(t('el_text_short', 'Testo troppo corto (min ~40 caratteri)'), 'error'); };
        if (typeof window.showPrompt === 'function') {
            window.showPrompt(t('el_paste_h', 'Incolla il materiale da aggiungere alla fonte'), '', doIt, { multiline: true });
        } else {
            const v = window.prompt(t('el_paste_h', 'Incolla il materiale da aggiungere alla fonte'));
            doIt(v || '');
        }
    }

    // decisione 3: PERSISTENTE — spinge nelle sources del progetto e salva.
    // Il File del PDF resta in memoria (sessione) in _pdfFiles per l'anteprima;
    // in più, se il progetto ha un vault attivo, l'ORIGINALE viene scritto in
    // <vault>/Fonti/ e il path RELATIVO persiste su src.vaultRel (regola DAL:
    // mai path assoluti) → l'anteprima sopravvive ai riavvii via read-vault-file.
    /* 0059: restituisce la PROMESSA della scrittura. Un PDF va in `Fonti/` anche
       su un vault vecchio (l'eccezione firmata dell'ADR 0011 rev. 1: «Aggiungi
       PDF» di un file nuovo), e poi si riscrive `fonti.json` — senza, su un vault
       che l'indice lo aveva già, il PDF aggiunto spariva alla riapertura. Un
       testo incollato riscrive l'indice solo dove `Fonti/` c'è già. */
    function _persistSource(type, content, name, file) {
        const s = _appState();
        if (!s.sources) s.sources = [];
        // id MONOTONO di sessione (mai riusato tra progetti) → niente collisione in
        // _pdfFiles quando si cambia mappa (bug: PDF di un progetto nell'altro).
        /* 0059: e mai l'id di una fonte che c'è già. Il contatore riparte da 0 a
           ogni avvio, mentre `fonti.json` gli id li conserva: dopo un riavvio
           «elab_pdf_1» poteva essere la fonte appena ripristinata, `_pdfFiles`
           dava a quella il File della nuova, e il flush su un altro vault
           scriveva i byte di un PDF sotto il nome dell'altro. */
        let id;
        do { id = 'elab_' + type + '_' + (++_pdfSeq); } while (_pdfFiles.has(id) || s.sources.some(x => x && x.id === id));
        const src = { id: id, type: type, content: content, file: null, name: name, origin: 'elabora' };
        s.sources.push(src);
        /* Una fonte aggiunta a mano appartiene alla mappa aperta ADESSO: senza
           questa riga il ripristino la scambierebbe per roba di un'altra mappa
           e la butterebbe via alla prima riapertura. */
        if (s.activeVaultPath) { _fontiDiVault = s.activeVaultPath; _fontiLista = s.sources; }
        /* Il vault e le fonti si fissano ORA (invariante 20-bis): la scrittura di
           un PDF grande dura, e se intanto si apre un'altra mappa l'indice va nel
           vault dove è andato il PDF, con le fonti di quel vault — non in quello
           attivo alla fine, che può essere un vault vecchio senza `Fonti/`. */
        const vp = s.activeVaultPath || null;
        const fonti = s.sources;
        let scrittura;
        if (file) {
            _pdfFiles.set(id, file);
            _srcView = 'pdf';                                  // mostra subito il PDF appena aggiunto
            const idx = _collectPdfs().findIndex(p => p.file === file);
            if (idx >= 0) _pdfIdx = idx;
            scrittura = _saveOriginalToVault(src, file, { aggiunta: true, vaultPath: vp })
                .then(esito => esito ? salvaIndiceFonti({ pdfScritto: true, vaultPath: vp, fonti }).then(() => esito) : esito);
        } else {
            scrittura = salvaIndiceFonti({ vaultPath: vp, fonti });   // solo dove Fonti/ c'è già
        }
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        if (window.showToast) showToast(t('el_added', 'Materiale aggiunto alla fonte — ricalcolo…'), 'success');
        render();   // corpusFromState include ora la nuova source → nuove card
        return Promise.resolve(scrittura).catch(() => false);
    }

    /* ── IL PDF DELLA FONTE STA IN `Fonti/` (packet 0059, ADR 0011 rev. 1) ─────
       La regola — che cosa si scrive, dove, con quale nome, che cosa si mostra —
       sta in `mappai-fonti-core.js`; qui l'I/O. Il core si chiede AL MOMENTO
       della chiamata: senza, ELABORA legge come prima e in `Fonti/` non scrive
       niente, e lo dice una volta sola in console. */
    let _senzaCoreDetto = false;
    function _fontiCore() {
        const FO = window.MappAIFontiCore;
        if (FO) return FO;
        if (!_senzaCoreDetto) {
            _senzaCoreDetto = true;
            try { console.warn('[ELABORA] MappAIFontiCore assente: le fonti si leggono come prima, in Fonti/ non si scrive'); } catch (e) { }
        }
        return null;
    }
    /* L'interruttore `mappai_fonte_in_fonti` (acceso di default, '0' lo spegne):
       unico lettore della chiave. Governa la sola SCRITTURA della pipeline e del
       ramo 1 di `ensureProjectVault`; la lettura da `Fonti/` e da `Allegati/`
       resta accesa comunque. Senza core è spento: la strada nuova non c'è. */
    function fonteInFonti() {
        const FO = _fontiCore();
        if (!FO) return false;
        let v = null;
        try { v = localStorage.getItem('mappai_fonte_in_fonti'); } catch (e) { v = null; }
        return FO.interruttoreAcceso(v);
    }
    /* Gli elenchi del vault. `vault-sources-list` (main.js:1285) risponde
       `files: []` sia per una `Fonti/` assente sia per una vuota (per la regola
       sono la stessa cosa), e `ok:false` «vault inesistente» se la cartella del
       vault non c'è: anche quello è un elenco vuoto — lì niente si può
       scrivere, `save-vault-file` risponde lo stesso errore. Ogni altro caso
       (senza vault, permessi, una cartella che non si legge, il canale che
       manca o fallisce) dà `null`: ELENCO NON DISPONIBILE, che non è un elenco
       vuoto. Chi scrive, con `null`, nel dubbio non scrive: né il PDF
       (sembrerebbe mancare e se ne farebbe un doppione) né l'indice (i suoi
       `vaultRel` sembrerebbero senza file e se ne andrebbero). Chi legge lo
       tratta come vuoto.
       Di `Allegati/` si usa solo il nome: il `relPath` che dà il processo
       principale è sbagliato (main.js:1267). */
    async function _elencoFonti(vp) {
        const api = window.electronAPI;
        if (!vp || !api || !api.vaultSourcesList) return null;
        try {
            const r = await api.vaultSourcesList({ vaultPath: vp });
            if (r && r.ok !== false && Array.isArray(r.files)) return r.files.filter(Boolean);
            if (r && r.ok === false && /^vault inesistente/.test(String(r.error || ''))) return [];
            return null;
        } catch (e) { return null; }
    }
    async function _elencoAllegati(vp) {
        const api = window.electronAPI;
        if (!vp || !api || !api.vaultMaterialsList) return [];
        try {
            const r = await api.vaultMaterialsList({ vaultPath: vp, dir: 'Allegati' });
            return (r && r.ok !== false && Array.isArray(r.files)) ? r.files.filter(Boolean) : [];
        } catch (e) { return []; }
    }
    /* Stessi byte? L'elenco dà metadati, non contenuto (trappola 45): i byte si
       leggono. Le due codifiche base64 (btoa qui, Buffer nel processo principale)
       sono canoniche, quindi stessa stringa ⇔ stessi byte. Un file illeggibile —
       sopra i 50 MB `read-vault-file` risponde ok:false — conta come diverso. */
    async function _stessiByte(vp, rel, b64) {
        try {
            const r = await window.electronAPI.readVaultFile({ vaultPath: vp, relPath: rel });
            return !!(r && r.ok && typeof r.base64 === 'string' && r.base64 === b64);
        } catch (e) { return false; }
    }

    /* Scrive il PDF originale in <vault>/Fonti/ e annota `src.vaultRel` e
       `src.vaultDi` (il vault in cui quel percorso vale; resta in memoria e
       nella scheda del progetto, mai in un file del vault). È l'UNICO scrittore
       del PDF della fonte (inv. 6); `copySourcesTo` fa solo la copia per
       l'allievo.
       opts = { aggiunta, vaultNuovo }: senza nessuno dei due scrive solo dove
       `Fonti/` c'è già (la regola operativa, dal core).
       Un file con gli stessi byte già in `Fonti/` si ADOTTA invece di farne una
       seconda copia; altrimenti il primo nome libero di `PipelineCore.nomeLibero`
       (« · 02» … « · 99»). Due chiamate per la stessa fonte sullo stesso vault
       (la pipeline e il ramo 1 in gara) condividono la stessa scrittura.
       `opts.vaultPath`: il vault fissato da chi ha cominciato (inv. 20-bis);
       senza, quello attivo adesso.
       Restituisce 'scritto' | 'adottato' | false. */
    const _scrittureInCorso = new Map();   // vault + id della fonte → promessa
    function _saveOriginalToVault(src, file, opts) {
        const o = opts || {};
        const s = _appState();
        const api = window.electronAPI;
        const vp = ('vaultPath' in o) ? o.vaultPath : (s && s.activeVaultPath);
        if (!vp || !src || !file || !api || !api.saveVaultFile) return Promise.resolve(false);
        const chiave = vp + '\u0000' + src.id;
        if (_scrittureInCorso.has(chiave)) return _scrittureInCorso.get(chiave);
        const p = _scriviOriginale(src, file, vp, o).catch(() => false)
            .then(esito => { _scrittureInCorso.delete(chiave); return esito; });
        _scrittureInCorso.set(chiave, p);
        return p;
    }
    async function _scriviOriginale(src, file, vp, opts) {
        const api = window.electronAPI;
        const FO = _fontiCore();
        if (!FO) return false;
        try {
            const FC = window.MappAIFilesCore;
            const ext = opts.extension === '.docx' ? '.docx' : '.pdf';
            const grezzo = String(src.name || file.name || 'fonte').replace(ext === '.docx' ? /\.docx$/i : /\.pdf$/i, '');
            const nome = ((FC && FC.safeName) ? FC.safeName(grezzo, 'fonte') : 'fonte') + ext;
            const buf = await file.arrayBuffer();
            let bin = ''; const bytes = new Uint8Array(buf);
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            const b64 = btoa(bin);
            /* ifAbsent non sovrascrive mai: se il nome scelto si è occupato fra
               l'elenco e la scrittura, si rifà l'elenco — al massimo tre volte.
               Un nome NASCOSTO all'elenco (comincia per «.», `FO.nomeNascosto`)
               rifacendo l'elenco non compare, e il giro dopo sceglierebbe lo
               stesso nome: lo si impara dalla risposta della scrittura
               (`nascosti`), e questo non conta fra i tre giri — ogni volta si
               aggiunge un nome, e i nomi liberi finiscono (« · 99»). */
            const nascosti = [];
            for (let giro = 0; giro <= 3 + nascosti.length; giro++) {
                const elenco = await _elencoFonti(vp);
                if (!elenco) return false;                                     // elenco non disponibile: nel dubbio non si scrive
                const esistenti = elenco.concat(nascosti);                     // i nomi imparati: per nomeLibero, non per i gemelli
                if (!FO.puoScrivereFonti({ vaultNuovo: !!opts.vaultNuovo, fontiPresente: esistenti.length > 0, aggiunta: !!opts.aggiunta })) return false;
                const uguali = [];
                /* 0070: il core storico riconosce i gemelli con suffisso PDF.
                   Si adatta soltanto il nome dato al confronto; il percorso e
                   i byte scritti restano DOCX. Stesse regole di deduplicazione. */
                const docxNames = ext === '.docx' ? new Map(esistenti.filter(e => e && /\.docx$/i.test(e.name))
                    .map(e => [e.name.replace(/\.docx$/i, '.pdf'), e.name])) : null;
                const candidates = docxNames ? esistenti.filter(e => e && /\.docx$/i.test(e.name))
                    .map(e => Object.assign({}, e, { name: e.name.replace(/\.docx$/i, '.pdf') })) : esistenti;
                const twins = FO.gemelli(docxNames ? nome.replace(/\.docx$/i, '.pdf') : nome, candidates, bytes.length)
                    .map(n => docxNames ? docxNames.get(n) : n);
                for (const g of twins) {
                    if (await _stessiByte(vp, 'Fonti/' + g, b64)) uguali.push(g);
                }
                const scelta = FO.sceltaNome(nome, esistenti, uguali);
                if (!scelta) {
                    console.warn('[ELABORA] «' + nome + '»: in Fonti/ ci sono già l\'originale e 98 varianti, il PDF non si scrive');
                    return false;
                }
                let esito = false, rel = '';
                if (scelta.adotta) {
                    rel = 'Fonti/' + scelta.adotta; esito = 'adottato';        // stessi byte: nessuna seconda copia
                } else {
                    rel = 'Fonti/' + scelta.scrivi;
                    const res = await api.saveVaultFile({ vaultPath: vp, relPath: rel, base64: b64, ifAbsent: true, potaVarianti: false });
                    if (res && res.ok) esito = 'scritto';
                    else if (res && res.exists) {
                        if (!FO.nomeNascosto(scelta.scrivi)) continue;         // occupato nel frattempo: si rifà l'elenco
                        /* nascosto e occupato: stessi byte → si adotta, come un
                           gemello; altrimenti è un nome preso, e si va oltre */
                        if (await _stessiByte(vp, rel, b64)) esito = 'adottato';
                        else { nascosti.push(scelta.scrivi); continue; }
                    }
                    else return false;                                         // errore diverso dalla collisione → stop
                }
                src.vaultRel = rel;
                src.vaultDi = vp;
                try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
                return esito;
            }
            return false;
        } catch (e) { return false; /* soft: l'anteprima in-sessione resta comunque; senza PipelineCore il core fallisce, e non si scrive */ }
    }

    /* Copia i PDF originali delle fonti in una cartella del vault (2/8). Dallo
       0059 la chiama solo la pipeline di CREA, per due cose: la COPIA per
       l'allievo in «Allegati/», sotto la spunta «Manda la fonte all'allievo»
       (primo tempo dell'ADR 0011 rev. 1: il pacchetto dell'allievo non contiene
       «Fonti/»), e, a interruttore `mappai_fonte_in_fonti` spento, la strada di
       prima, dove quella copia era l'unico PDF del vault. Il PDF della fonte in
       «Fonti/» non passa di qui: lo scrive `_saveOriginalToVault`, e ce lo
       porta `flushSourcesToVault`. Questa non tocca `vaultRel` né l'indice: se
       lo facesse, l'anteprima seguirebbe la copia e ci ritroveremmo due
       originali che si contendono lo stesso ruolo. Tiene il suo ciclo « · 0N»
       (al decimo tentativo « · 010»), dichiarato dal packet. */
    async function copySourcesTo(vaultPath, cartella) {
        const s = _appState();
        const api = window.electronAPI;
        if (!s || !vaultPath || !api || !api.saveVaultFile || !s.sources) return 0;
        const FC = window.MappAIFilesCore;
        let n = 0;
        for (const src of s.sources) {
            const f = _pdfFiles.get(src.id) || src.file;
            if (!f || typeof f.arrayBuffer !== 'function') continue;
            const nm = (src.name || f.name || '').toLowerCase();
            const isPdf = (f.type === 'application/pdf') || nm.endsWith('.pdf') || src.type === 'pdf';
            if (!isPdf) continue;
            try {
                const base = (FC && FC.safeName) ? FC.safeName(String(src.name || f.name || 'fonte').replace(/\.pdf$/i, ''), 'fonte') : 'fonte';
                const buf = await f.arrayBuffer();
                let bin = ''; const bytes = new Uint8Array(buf);
                const CHUNK = 0x8000;
                for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                const b64 = btoa(bin);
                for (let k = 0; k < 10; k++) {
                    const rel = cartella + '/' + base + (k ? ' · 0' + (k + 1) : '') + '.pdf';
                    const res = await api.saveVaultFile({ vaultPath, relPath: rel, base64: b64, ifAbsent: true });
                    if (res && res.ok) { n++; break; }
                    if (!res || !res.exists) break;      // errore vero → si passa oltre
                }
            } catch (e) { /* una fonte che non si copia non ferma le altre */ }
        }
        return n;
    }

    /* 0059: opts = { vaultNuovo } — vero se il vault nasce da questa stessa
       azione (la pipeline di CREA, il ramo 2 di `ensureProjectVault`, «Salva
       vault» su una cartella senza `index.yaml`). Su un vault che c'era e senza
       `Fonti/` non si scrive NIENTE, indice compreso (ADR 0011 rev. 1: i vault
       vecchi si leggono). Chi scrivere lo dice il core: il vecchio salto cieco
       «ha già un vaultRel» lasciava il secondo vault di due generazioni di fila
       senza il suo PDF, perché quel `vaultRel` era del primo.
       Restituisce true se ha scritto qualcosa. */
    async function flushSourcesToVault(opts) {
        const o = opts || {};
        const s = _appState();
        if (!s || !s.activeVaultPath || !s.sources) return false;
        const FO = _fontiCore();
        if (!FO) return false;
        /* il vault e le fonti si fissano ORA (inv. 20-bis): PDF, `.txt` e indice
           vanno tutti nel vault da cui il flush è partito, anche se a metà se ne
           apre un altro */
        const vp = s.activeVaultPath;
        const fonti = s.sources;
        /* E i File, prima della prima attesa: un «Aggiungi PDF» fatto prima che
           il vault esistesse ha il File solo in `_pdfFiles`, e il ripristino di
           un'altra mappa aperta a metà lo svuota — il PDF non arrivava più nel
           vault da cui il flush era partito. */
        const fileDi = new Map(fonti.filter(Boolean).map(src => [src, _pdfFiles.get(src.id) || src.file]));
        const vaultNuovo = !!o.vaultNuovo;
        const percorsoLettura = s.extractionMode === 'lettura';
        /* L'elenco di `Fonti/` dice se la cartella c'è e quali file ci sono
           davvero. Non disponibile (`null`): nel dubbio non si scrive niente. */
        const elenco = await _elencoFonti(vp);
        if (!elenco) return false;
        const fontiPresente = elenco.length > 0;
        if (!FO.puoScrivereFonti({ vaultNuovo, fontiPresente })) return false;
        let pdfScritto = false;
        for (const src of fonti.slice()) {
            if (!src) continue;
            const f = fileDi.get(src);
            const haFile = !!(f && typeof f.arrayBuffer === 'function');
            const nm = (src.name || (f && f.name) || '').toLowerCase();
            const isPdf = haFile && ((f.type === 'application/pdf') || nm.endsWith('.pdf') || src.type === 'pdf');
            const isDocx = percorsoLettura && haFile && !isPdf && (nm.endsWith('.docx') || src.type === 'docx' ||
                f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            /* `presenteQui`: il file del suo `vaultRel` è in `Fonti/` di QUESTO
               vault? Nel vault eliminato e ricreato allo stesso percorso il
               `vaultDi` delle fonti coincide ma il file non c'è più: si riscrive.
               Un elenco di prima di una scrittura in gara lo dà per assente a
               torto: niente di male, `_saveOriginalToVault` rifà l'elenco e
               adotta il file uguale. */
            const presenteQui = FO.presenteIn(src.vaultRel, elenco);
            // Il nome del booleano del core è storico: per lettura ammette anche l'originale DOCX.
            if (!FO.daScrivere({ isPdf: isPdf || isDocx, haFile, vaultRel: src.vaultRel, vaultDi: src.vaultDi, daAllegati: src.daAllegati, presenteQui }, vp)) continue;
            if (!src.name && f.name) src.name = f.name;
            if (await _saveOriginalToVault(src, f, { vaultNuovo, vaultPath: vp, extension: isDocx ? '.docx' : '.pdf' })) pdfScritto = true;
        }
        /* e poi l'INDICE: senza, il PDF sta nel vault ma nessuno sa che era una
           fonte, di che tipo, né dove finiva il testo che se n'era estratto */
        const indice = await salvaIndiceFonti({ vaultNuovo, pdfScritto, vaultPath: vp, fonti });
        /* 0113 (lotto 8): il `.figure.json` di ogni fonte PDF letta in CREA, nello
           stesso passaggio dei `.txt` e dell'indice (ADR 0024 §5.7); un guasto non
           ferma niente, e il valore di ritorno resta quello di prima */
        await _figScriviDossier(vp, fonti, fileDi);
        /* le fonti in memoria ora sono di questo vault (lo stesso ragionamento
           di `_persistSource`): il ripristino non le butta via. Se intanto si è
           aperta un'altra mappa, in memoria ci sono le sue, e non sono di vp.
           Si guarda lo stato di ADESSO: «Carica un progetto» sostituisce tutto
           `appState`, e il vecchio `s` porterebbe ancora le fonti del flush. */
        const ora = _appState();
        if ((pdfScritto || indice) && ora && ora.sources === fonti) { _fontiDiVault = vp; _fontiLista = fonti; }
        return !!(pdfScritto || indice);
    }

    /* ══ LE FONTI SOPRAVVIVONO AL VAULT (9/8) ═══════════════════════════════════
       Il difetto, misurato in Electron: riaprendo una mappa dal disco
       `appState.sources` era vuoto, il corpus 0 caratteri, `sourcesDict` vuoto —
       quindi la fonte di ELABORA diceva «Nessuna fonte nel progetto» e con essa
       restavano vuote copertura, evidenziazione, «Domande scheda» e i due export.
       ELABORA serviva solo subito dopo la generazione; riaperta una mappa (il caso
       normale, arrivandoci da INSEGNA) era un guscio.
       Che cosa c'era e cosa mancava, sul disco vero: il PDF originale ERA in
       `Fonti/` (7 MB, lo scrive `flushSourcesToVault` dal 22/7), ma il TESTO no —
       i markdown dei nodi non portano più la sezione «## Fonti» da quando lo
       schema del ramo ha smesso di chiedere i `chunks` (9/6), quindi non c'era
       più nessun posto da cui rileggere il testo della fonte.
       LA SCELTA: si scrive un INDICE `Fonti/fonti.json` (che cosa era ogni fonte)
       e, accanto, il testo estratto in `Fonti/<nome>.txt`. Due ragioni per il file
       separato invece del testo dentro il JSON: il vault è leggibile in Obsidian
       e un .txt lì si apre e si cerca; e un JSON che si porta dentro megabyte di
       testo va riscritto per intero a ogni salvataggio.
       ⚠️ `sanitizeVaultRelPath` ammette `Fonti/<file>` (due segmenti): nessuna
       sottocartella, quindi i testi stanno accanto agli originali.
       ⚠️ Il campo `file` (oggetto File del browser) NON è ricostruibile da un
       percorso: non si ripristina. Non serve — `_collectPdfs` sa già fabbricare
       uno pseudo-File che legge i byte da `vaultRel` via IPC, ed è quello che il
       visore PDF usa. */
    const FONTI_INDICE = 'Fonti/fonti.json';
    /* ⚠️ `read-vault-file` ritorna SEMPRE base64 (è nato per i PDF): il testo va
       decodificato qui, e con `TextDecoder` — `atob` da solo rompe gli accenti,
       perché rende byte e non caratteri UTF-8. Provato: «Elettricità» diventava
       «ElettricitÃ ». */
    function _testoDaBase64(b64) {
        try {
            const bin = atob(b64);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(buf);
        } catch (e) { return ''; }
    }
    function _safeNomeFile(s) {
        /* via l'estensione dell'originale: il testo di «scheda.pdf» si chiama
           «scheda.txt», non «scheda.pdf.txt» (visto sul disco vero) */
        var base = String(s == null ? '' : s).replace(/\.(pdf|docx?|txt|md|html?)$/i, '');
        return base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'fonte';
    }
    /* 0059: opts = { vaultNuovo, pdfScritto }. Chiamata senza opzioni (dal
       completamento dei testi, da «Incolla testo») scrive solo dove `Fonti/` c'è
       già. Mai un `fonti: []` dove `Fonti/` non c'era, mai una fonte letta da
       `Allegati/`, mai un `vaultRel` che vale in un altro vault né uno il cui
       file qui non c'è. Con l'elenco di `Fonti/` non disponibile non si scrive
       niente; e se la regola dice che l'indice non si scrive, non si scrive
       nemmeno un `.txt` (la regola si chiede prima dei testi). `potaVarianti: false`:
       scrivere in `Fonti/` non deve mandare nel Cestino niente di
       `Materiale Studio/Sorgenti/` (main.js:997-1002).
       E opts = { vaultPath, fonti }: il vault e le fonti fissati da chi ha
       cominciato la scrittura (inv. 20-bis). Senza, quelli di adesso, letti
       tutti e due PRIMA della prima attesa: l'indice di un vault si scrive con
       le fonti di quel vault.
       0078: opts.completa = il motivo di `completaFontiDellaCartella` (la
       cartella di «Riprendi» senza `Fonti/`): passa al core e basta, senza gli
       effetti di `vaultNuovo`, che resta false. */
    async function salvaIndiceFonti(opts) {
        const o = opts || {};
        const s = _appState();
        const api = window.electronAPI;
        if (!s || !api || !api.saveVaultFile) return false;
        const vp = ('vaultPath' in o) ? o.vaultPath : s.activeVaultPath;
        const fonti = Array.isArray(o.fonti) ? o.fonti : (s.sources || []);
        if (!vp) return false;
        /* ⚠️ Questo indice si riscrive INTERO, e con `fonti: []` cancella quello
           che c'era. Da quando le fonti si azzerano al cambio mappa esiste una
           finestra — il ripristino è asincrono e non viene atteso — in cui la
           memoria è vuota mentre il vault nuovo è già quello attivo: un
           salvataggio che capitasse lì dentro svuoterebbe l'indice di un vault
           appena aperto. Non si scrive un elenco vuoto per fonti che non
           risultano ancora di questo vault; svuotarlo davvero (l'utente ha
           tolto tutte le fonti) passa comunque, perché lì `_fontiDiVault` è già
           quello giusto. */
        if (!fonti.length && _fontiDiVault !== vp) return false;
        const FO = _fontiCore();
        if (!FO) return false;
        const vaultNuovo = !!o.vaultNuovo;
        const esistenti = await _elencoFonti(vp);
        if (!esistenti) return false;              // elenco non disponibile: nel dubbio l'indice non si scrive
        const fontiPresente = esistenti.length > 0;
        const scrivibili = FO.vociScrivibili(fonti);
        if (!FO.scriviIndice({ voci: scrivibili, vaultNuovo, fontiPresente, pdfScritto: !!o.pdfScritto, completa: !!o.completa })) return false;
        /* Un vault SPOSTATO (INSEGNA, «Organizza i file»): chi lo sposta aggiorna
           `activeVaultPath`, non le fonti, e il loro `vaultDi` resta il percorso
           di prima — `vaultRelPerIndice` toglieva dall'indice il `vaultRel` di un
           PDF che sta proprio qui, e alla riapertura ELABORA non lo vedeva più.
           Se il file c'è qui e non c'è più là, il vault è questo: `vaultDi` si
           riallinea. Il core decide; qui solo gli elenchi, uno per vault. */
        const altrove = new Map();
        for (const src of scrivibili) {
            if (!FO.vaultSpostato(src, vp, vaultNuovo, { qui: esistenti, la: [] })) continue;   // non è un candidato: niente letture
            if (!altrove.has(src.vaultDi)) altrove.set(src.vaultDi, await _elencoFonti(src.vaultDi));
            if (FO.vaultSpostato(src, vp, vaultNuovo, { qui: esistenti, la: altrove.get(src.vaultDi) })) src.vaultDi = vp;
        }
        const voci = [];
        let n = 0;
        /* Un `vaultRel` entra nell'indice solo se il suo file c'è QUI: lo dice
           l'elenco di `Fonti/`, non la memoria (il vault eliminato e ricreato
           allo stesso percorso: il `vaultDi` delle fonti coincide, il file non
           c'è più). Ma l'elenco è di prima delle attese, e un PDF scritto
           intanto (un «Aggiungi PDF» che finisce mentre si incolla un testo) non
           ci sarebbe: prima di togliere un `vaultRel` l'elenco si rifà, una volta
           sola. Se non si può rifare, nel dubbio l'indice non si scrive (i testi
           già scritti restano, in una `Fonti/` che la regola ammette). Per un
           nome che l'elenco non può mostrare (`presenteQui` undefined, un nome
           che comincia per «.») l'elenco non dice niente: vale come prima. */
        let elencoQui = esistenti, rifatto = false;
        for (const src of scrivibili) {
            n++;
            let presenteQui = FO.presenteIn(src.vaultRel, elencoQui);
            if (presenteQui === false && !rifatto && FO.vaultRelPerIndice(src, vp, vaultNuovo)) {
                rifatto = true;
                elencoQui = await _elencoFonti(vp);
                if (!elencoQui) return false;
                presenteQui = FO.presenteIn(src.vaultRel, elencoQui);
            }
            const nome = _safeNomeFile(src.name || src.title || ('fonte ' + n));
            const testo = String(src.content || '');
            const voce = {
                id: src.id || ('src' + n), tipo: src.type || 'text', nome: src.name || src.title || nome,
                vaultRel: FO.vaultRelPerIndice(src, vp, vaultNuovo, presenteQui), caratteri: testo.length, testoRel: ''
            };
            /* il testo si scrive solo se c'è: una fonte PDF appena caricata ha il
               testo estratto, una riga vuota no — e un file vuoto nel vault è
               rumore che poi si legge come «fonte senza testo» */
            if (testo.length > 40) {
                const rel = 'Fonti/' + nome + '.txt';
                try {
                    const r = await api.saveVaultFile({ vaultPath: vp, relPath: rel, text: testo, potaVarianti: false });
                    if (r && r.ok) voce.testoRel = rel;
                } catch (e) { /* il testo non si scrive: l'indice resta, con vaultRel */ }
            }
            voci.push(voce);
        }
        try {
            const r = await api.saveVaultFile({
                vaultPath: vp, relPath: FONTI_INDICE, potaVarianti: false,
                text: JSON.stringify({ schema: 'mappai-fonti@1', mappa: s.rootNodeLabel || '', fonti: voci }, null, 2)
            });
            return !!(r && r.ok);
        } catch (e) { return false; }
    }

    /* ══ «RIPRENDI» DÀ `Fonti/` ALLA CARTELLA CHE NON CE L'HA (0078, §4.4) ══════
       Una cartella che non ha `Fonti/` non la riceve mai: la si scrive solo su
       un vault nuovo, dove c'è già o per un'aggiunta. Le sue fonti vivevano
       solo nella copia del cassetto, che lo 0082 toglierà. «Riprendi»
       (`loadProject`) apre dalla copia, quindi le fonti in memoria sono quelle
       della copia: col testo estratto, senza il File della sessione.
       Se la cartella non ha `Fonti/` per niente (nemmeno il solo indice), qui
       si scrivono `fonti.json` e i `.txt` (testo sopra i 40 caratteri) col
       motivo `completa` del core — MAI un PDF: il file della sessione non c'è
       più. E non si passa dal ripristino dal vault, che svuota le fonti in
       memoria prima di leggere e da una cartella che non dà niente le
       lascerebbe vuote: qui le fonti in memoria non si toccano mai.
       La cartella e le fonti si fissano all'INIZIO (inv. 20-bis): se intanto si
       apre un altro progetto, si scrive comunque nella cartella di partenza con
       le fonti di partenza, e quelle dell'altro non diventano «di questa
       cartella». Se l'indice è scritto e in memoria ci sono ancora quelle
       fonti, da qui sono di questo vault (come in coda al flush), e un
       ripristino dello stesso vault le tiene. Se non riesce, lo dice il
       registro (il nome della cartella, mai il percorso); niente lancia.
       Non legge `mappai_fonte_in_fonti`: `fonti.json` e i `.txt` esistono da
       prima dello 0059. → true se l'indice è stato scritto. */
    async function completaFontiDellaCartella(vaultPath) {
        const s = _appState();
        const vp = vaultPath || null;
        const fonti = (s && Array.isArray(s.sources)) ? s.sources : null;
        const api = window.electronAPI;
        if (!vp || !fonti || !api || !api.saveVaultFile) return false;
        const FO = _fontiCore();
        if (!FO || !FO.vociScrivibili(fonti).length) return false;
        /* `Fonti/` c'è già, anche col solo `fonti.json`: la tiene chi la scrive
           di solito, qui niente. Elenco non disponibile: nel dubbio niente. */
        const elenco = await _elencoFonti(vp);
        if (!elenco || elenco.length) return false;
        let scritto = false;
        try { scritto = await salvaIndiceFonti({ vaultPath: vp, fonti: fonti, completa: true }); } catch (e) { scritto = false; }
        if (scritto) {
            const ora = _appState();
            if (ora && ora.sources === fonti) { _fontiDiVault = vp; _fontiLista = fonti; }
            return true;
        }
        try {
            const nome = String(vp).split(/[\\/]/).filter(Boolean).pop() || '';
            if (window.MappAIErrori && window.MappAIErrori.registra) {
                window.MappAIErrori.registra({ dove: 'fonti',
                    messaggio: 'Fonti/ non scritta nella cartella «' + nome + '»: le fonti restano nella memoria rapida' });
            }
        } catch (e) { /* un registro che non c'è o lancia non ferma «Riprendi» */ }
        return false;
    }

    /* Ripristina `appState.sources` da un vault appena caricato. Le voci le
       compone il core, dalla più informativa alla più povera:
         1. `Fonti/fonti.json` → tipo, nome, testo (dal .txt) e `vaultRel`;
         2. nessun indice ma dei PDF in `Fonti/` → le voci senza testo (i vault
            salvati prima del 9/8 sono così), e il testo lo estrae ELABORA alla
            prima apertura;
         e in coda, per NOME (B2, 0059), i PDF di `Allegati/` che `Fonti/` non
         ha, marcati `daAllegati`: in sola lettura. Ogni voce porta `vaultDi`.
       Se non trova niente lascia le fonti vuote: quelle di un'altra mappa se ne
       sono già andate prima della lettura.
       ⚠️ Non sovrascrive le fonti dello STESSO vault già in memoria: quelle in
       RAM hanno il file vero e sono migliori di quanto si rilegga dal disco.
       🐛 Ma «già in memoria» da solo era sbagliato, ed era il difetto che
       Giacomo vedeva: nessun caricatore azzera `appState.sources`, quindi
       aprendo la mappa B con le fonti di A in RAM questa funzione usciva subito
       e la colonna continuava a elencare i file di A — congelati sul primo
       progetto della sessione. La domanda giusta non è «ci sono fonti?» ma
       «sono di QUESTO vault?», e (0059) «sono ancora QUELLE?»: «Carica un
       progetto» sostituisce `appState` con le fonti di un altro progetto e
       `_fontiDiVault` da solo diceva ancora «questo vault». L'uscita anticipata
       vuole lo stesso vault E lo stesso array (`_fontiLista`). */
    async function ripristinaFontiDalVault(vaultPath) {
        const s = _appState();
        const api = window.electronAPI;
        if (!s || !api || !api.readVaultFile) return 0;
        const vp = vaultPath || s.activeVaultPath;
        if (!vp) return 0;
        if ((s.sources || []).length && _fontiDiVault === vp && s.sources === _fontiLista) return 0;   // stesso vault, stesse fonti: le sue sono migliori
        if ((s.sources || []).length) {
            /* Sono di un'altra mappa: se ne vanno con i loro File di sessione,
               o il visore mostrerebbe il PDF del progetto precedente. */
            s.sources = [];
            try { _pdfFiles.clear(); } catch (e) { /* noop */ }
            _srcView = 'text'; _pdfIdx = 0;
        }
        _fontiDiVault = vp; _fontiLista = s.sources;   /* da qui in poi le fonti in RAM sono di questo vault */
        let indice = null;
        try {
            const r = await api.readVaultFile({ vaultPath: vp, relPath: FONTI_INDICE });
            if (r && r.ok && r.base64) indice = JSON.parse(_testoDaBase64(r.base64));
        } catch (e) { indice = null; }
        const out = [];
        /* 0059: le voci le compone il core, dall'indice (gradino 1) o dai PDF di
           `Fonti/` (gradino 2); in coda, per NOME (B2), i PDF di `Allegati/` che
           `Fonti/` non ha — i vault di CREA dal 4/8 al 28/9 hanno il PDF solo lì.
           Per questo i due elenchi si chiedono SEMPRE. Ogni voce porta `vaultDi`;
           quelle di `Allegati/` sono marcate `daAllegati` e restano in sola
           lettura: nessuna scrittura le prende. */
        const FO = _fontiCore();
        if (FO) {
            const fonti = await _elencoFonti(vp);
            const allegati = await _elencoAllegati(vp);
            for (const v of FO.fontiDaRipristinare({ indice, fonti, allegati }, vp)) {
                let testo = '';
                if (v.testoRel) {
                    try {
                        const t = await api.readVaultFile({ vaultPath: vp, relPath: v.testoRel });
                        if (t && t.ok && t.base64) testo = _testoDaBase64(t.base64);
                    } catch (e) { /* testo perso: resta la voce, ELABORA lo rifarà */ }
                }
                const src = { id: v.id, type: v.type, name: v.name, content: testo, vaultRel: v.vaultRel, vaultDi: v.vaultDi };
                if (v.daAllegati) src.daAllegati = true;
                out.push(src);
            }
        } else if (indice && Array.isArray(indice.fonti)) {
            for (const v of indice.fonti) {
                let testo = '';
                if (v.testoRel) {
                    try {
                        const t = await api.readVaultFile({ vaultPath: vp, relPath: v.testoRel });
                        if (t && t.ok && t.base64) testo = _testoDaBase64(t.base64);
                    } catch (e) { /* testo perso: resta la voce, ELABORA lo rifarà */ }
                }
                out.push({ id: v.id || ('src' + out.length), type: v.tipo || 'text', name: v.nome || '', content: testo, vaultRel: v.vaultRel || '' });
            }
        } else if (api.vaultSourcesList) {
            /* gradino 2: vault salvato prima dell'indice — si guarda che c'è */
            try {
                const l = await api.vaultSourcesList({ vaultPath: vp });
                (l && l.files || []).filter(f => f.ext === 'pdf').forEach(f => {
                    out.push({ id: 'vault-' + out.length, type: 'pdf', name: f.name, content: '', vaultRel: f.relPath });
                });
            } catch (e) { /* niente da recuperare */ }
        }
        if (!out.length) return 0;
        /* 0059: se intanto è partito il ripristino di un ALTRO vault (o una
           scrittura ha dichiarato le fonti in memoria di un altro vault),
           `_fontiDiVault` non è più vp e le fonti in memoria sono quelle
           dell'altro: questo ripristino, arrivato dopo, non le tocca. Senza, le
           fonti di A restavano in memoria col vault C aperto, e la prima
           scrittura («Incolla testo», «Aggiungi PDF», «Salva vault», il ramo 1)
           riscriveva l'indice di C con le voci di A. */
        if (_fontiDiVault !== vp) return 0;
        s.sources = out;
        _fontiLista = out;   /* l'array nuovo è quello di cui `_fontiDiVault` parla */
        return out.length;
    }

    /* Il testo che manca, estratto dal PDF che c'è: le voci del gradino 2 (che
       così diventano gradino 1) e i PDF letti da `Allegati/`. Gira quando
       ELABORA monta la fonte e qualche fonte PDF ha il `vaultRel` ma non il
       testo: `extractTextFromPDF` è la STESSA funzione dell'upload (app.js),
       quindi il testo è identico a quello che si sarebbe avuto generando. Il
       testo resta in memoria; nel vault (`fonti.json` e i `.txt`) si scrive
       solo se almeno una delle fonti completate non viene da `Allegati/`, e
       solo dove `Fonti/` c'è già — un vault vecchio si legge e basta —, così
       la volta dopo è già pronto. Il vault e le fonti si fissano all'INIZIO
       (inv. 20-bis): l'estrazione dura, e se intanto si apre un'altra mappa il
       risultato va nel vault da cui si è partiti, con le sue fonti — prima
       finiva nell'indice della mappa appena aperta, e lo svuotava.
       Silenzioso: se non riesce, la fonte resta senza testo e la vista lo
       dice. */
    async function _completaTestiMancanti() {
        const s = _appState();
        const api = window.electronAPI;
        if (!s || !api || !api.readVaultFile || !window.extractTextFromPDF) return 0;
        const vp = s.activeVaultPath;
        const fonti = s.sources || [];
        const listaAllInizio = _fontiLista;   // di quale elenco parlava `_fontiDiVault` quando si è partiti
        const daFare = fonti.filter(x => x && !x.content && x.vaultRel && /\.pdf$/i.test(x.vaultRel));
        if (!daFare.length) return 0;
        /* 0059: anche il PDF letto da `Allegati/` dà il suo testo — resta in
           memoria, così ELABORA colora — ma nel vault si scrive solo per le
           fonti di `Fonti/`: un vault vecchio si legge e basta. Senza core non
           si scrive comunque (`salvaIndiceFonti` lo sa da sé). */
        const FO = window.MappAIFontiCore;
        const soloLettura = src => !FO || FO.inAllegati(src);
        let fatti = 0, daScrivere = 0;
        for (const src of daFare) {
            try {
                const r = await api.readVaultFile({ vaultPath: vp, relPath: src.vaultRel });
                if (!r || !r.ok || !r.base64) continue;
                const bin = atob(r.base64);
                const buf = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                const finto = new File([buf], src.name || 'fonte.pdf', { type: 'application/pdf' });
                const testo = await window.extractTextFromPDF(finto);
                if (testo && testo.length > 40) { src.content = testo; fatti++; if (!soloLettura(src)) daScrivere++; }
            } catch (e) { /* un PDF illeggibile non ferma gli altri */ }
        }
        /* 0059: ma se intanto un ALTRO elenco è diventato quello delle fonti di
           vp — vp riaperto (il ripristino fa un elenco nuovo, anche passando da
           un'altra mappa), poi «Aggiungi PDF» o «Incolla testo» su quello —
           l'elenco fissato qui è vecchio. L'indice si riscrive INTERO: le voci
           nate sull'elenco nuovo sparirebbero. Non si scrive, e la prossima
           apertura estrae di nuovo il testo. Se invece si è aperto un altro
           vault (`_fontiDiVault` non è vp), il risultato va in vp con le sue
           fonti, come sopra. */
        const rilette = _fontiDiVault === vp && _fontiLista !== listaAllInizio && _fontiLista !== fonti;
        if (daScrivere && !rilette) { try { await salvaIndiceFonti({ vaultPath: vp, fonti }); } catch (e) { } }
        return fatti;
    }

    function _injectStyles() {
        if (_stylesInjected) return; _stylesInjected = true;
        const css = `
        /* ATTENZIONE: #ec-src = la fonte montata DENTRO l'area della console di
           ELABORA (mountSource). Va in TUTTI e tre gli elenchi qui sotto: le
           variabili di colore e il corpo del testo sono scoped agli antenati, e
           dentro la console nessuno di quelli esiste — senza, ogni var(--eink)
           resterebbe irrisolta e la fonte prenderebbe i colori del browser.
           (Niente apici inversi nei commenti: questo CSS è un template literal
           e un apice inverso chiude la stringa — trappola già vista in build.js.) */
        #elabora-content .elab-emo,#elab-overlay .elab-emo,#ec-src .elab-emo{font-family:var(--emoji-font);font-style:normal;line-height:1}
        #elabora-content,#elab-overlay,#ec-src,#elab-pdfexp-modal,#elab-q-modal{--eink:#1e293b;--eink2:#475569;--esoft:#64748b;--efaint:#94a3b8;--eline:#e8ecf4;--eline2:#dde4f0;--epanel:#fff;--epanel2:#f6f8fc;--epanel3:#eef2f9;--eacc:#4f46e5;--eacc2:#6366f1;--eaccs:#eef2ff;--eaccr:#c7d2fe;--enotice:#b45309;--enotices:#fffbeb;--enoticel:#fce4a6;--egood:#047857;--egoods:#ecfdf5;--egoodl:#a7f3d0;--egap:#6d28d9;--egaps:#f5f3ff;--egapl:#ddd6fe}
        #elabora-content,#elab-overlay,#ec-src{font-size:clamp(13.5px,.28vw + 12.4px,16px);color:var(--eink)}
        /* la fonte nella console riempie la tela: la colonna e la topbar sono
           della console, qui dentro c'è solo il documento */
        #ec-src{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--epanel)}
        /* Portal fullscreen a livello di body (sfugge al transform di .glass-card).
           z 950: sotto il modale edit nodo (z 1000) così «Aggiungi citazione» resta sopra. */
        #elab-overlay{position:fixed;inset:0;z-index:950;background:var(--epanel)}
        /* In fullscreen: via i controlli globali che coprirebbero la topbar (a11y eye,
           dev self-test, drawer insegnai.ch) — stesso pattern di body.is-snapshotting. */
        body.elab-fullscreen #dst-btn,body.elab-fullscreen #insegnai-drawer{display:none !important}
        .elab-empty{max-width:520px;margin:60px auto;text-align:center;color:var(--esoft)}
        .elab-empty-emo{font-family:var(--emoji-font);font-size:40px;line-height:1}
        .elab-empty-h{font-weight:700;font-size:18px;color:var(--eink);margin:14px 0 6px}
        .elab-empty-p{font-size:13px;line-height:1.6}
        .elab-projects-wrap{max-width:820px;margin:26px auto 40px;padding:0 16px}
        .elab-projects-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
        .elab-filter{display:inline-flex;background:var(--epanel3);border-radius:999px;padding:3px}
        .elab-fseg{font:inherit;font-size:11px;font-weight:700;border:0;background:transparent;color:var(--esoft);padding:5px 13px;border-radius:999px;cursor:pointer}
        .elab-fseg.active{background:var(--epanel);color:var(--eacc);box-shadow:0 1px 2px rgba(15,23,42,.06)}
        .elab-projects-list{border:1px solid var(--eline);border-radius:14px;overflow:hidden;background:var(--epanel);box-shadow:0 1px 2px rgba(15,23,42,.05)}
        .elab-ws{position:relative;width:100%;height:100%;background:var(--epanel);display:flex;flex-direction:column;overflow:hidden}
        .elab-close{width:32px;height:32px;flex:0 0 auto;border-radius:10px;border:1px solid var(--eline2);background:var(--epanel);color:var(--esoft);font-size:14px;line-height:1;cursor:pointer;display:grid;place-items:center}
        .elab-close:hover{border-color:var(--eaccr);color:var(--eacc)}
        .elab-bar{display:flex;align-items:center;gap:9px;row-gap:8px;padding:11px 16px;border-bottom:1px solid var(--eline);background:var(--epanel2);flex-wrap:wrap}
        .elab-title{font-weight:700;display:flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
        .elab-crumb{color:var(--efaint);font-weight:400}
        .elab-bar>.elab-btn{flex:0 0 auto}
        .elab-spacer{flex:1 1 12px;min-width:8px}
        .elab-lbl{font-size:clamp(10.5px,.12vw + 9.8px,12px);letter-spacing:.14em;text-transform:uppercase;color:var(--efaint);font-weight:700}
        .elab-muted{color:var(--esoft)}
        .elab-btn{font:inherit;font-size:12px;font-weight:700;border:1px solid var(--eline2);background:var(--epanel);color:var(--eink);padding:7px 12px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
        .elab-btn:hover{border-color:var(--eaccr);color:var(--eacc)}
        .elab-primary{background:var(--eacc);color:#fff;border-color:var(--eacc)}
        .elab-primary:hover{background:var(--eacc2);color:#fff}
        .elab-ghost{background:transparent;border-color:transparent;color:var(--esoft)}
        .elab-tiny{padding:5px 9px;font-size:11px}
        .elab-triage{display:flex;align-items:center;gap:11px;padding:10px 14px;background:linear-gradient(90deg,var(--eaccs),transparent 70%);border-bottom:1px solid var(--eline);flex-wrap:wrap}
        .elab-ti{width:32px;height:32px;border-radius:9px;background:var(--epanel);border:1px solid var(--eaccr);display:grid;place-items:center;font-size:17px}
        .elab-tt{font-weight:700;font-size:12.5px}.elab-td{color:var(--esoft);font-size:12.5px}
        .elab-verdict{margin-left:auto;font-size:11px;font-weight:700;color:var(--eacc);background:var(--epanel);border:1px solid var(--eaccr);padding:4px 11px;border-radius:999px;white-space:nowrap}
        .elab-split{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.15fr) 9px minmax(0,1fr)}
        .elab-pane{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column}
        .elab-divider{background:var(--eline);position:relative}
        .elab-grip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:38px;border-radius:3px;background:var(--eline2)}
        .elab-pane-head{position:sticky;top:0;z-index:3;background:var(--epanel);border-bottom:1px solid var(--eline);padding:9px 14px;display:flex;align-items:center;gap:9px}
        .elab-pane-body{padding:16px;flex:1}
        .elab-reading{max-width:min(74ch,100%);margin:0 auto}
        .elab-reading p{margin:0 0 13px;font-size:clamp(14px,.3vw + 12.8px,17px);line-height:1.78}
        .elab-nosrc{color:var(--esoft);font-size:13px;margin-bottom:12px}
        .elab-dropzone{margin-top:8px;border:1.5px dashed var(--eline2);border-radius:12px;padding:16px;text-align:center;color:var(--esoft);font-size:12.5px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer}
        .elab-dropzone:hover{border-color:var(--eaccr);background:var(--eaccs)}
        .elab-dropzone b{color:var(--eink)}.elab-hint{color:var(--efaint);font-size:11px}
        .elab-drop-emo{font-size:26px}
        .elab-stack{display:flex;flex-direction:column;gap:11px;max-width:640px}
        .elab-sec-lbl{margin:6px 0 -1px}.elab-sec-lbl:first-child{margin-top:0}
        .elab-card{border:1px solid var(--eline);border-radius:12px;background:var(--epanel);box-shadow:0 1px 2px rgba(15,23,42,.05)}
        .elab-card-top{display:flex;align-items:center;gap:10px;padding:11px 13px 9px}
        .elab-icw{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:17px;background:var(--epanel3)}
        .elab-icw.notice{background:var(--enotices)}.elab-icw.good{background:var(--egoods)}.elab-icw.gap{background:var(--egaps)}
        .elab-card-h{font-weight:700}.elab-card-meta{font-size:11px;color:var(--efaint);margin-top:1px}
        .elab-sev{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:999px;white-space:nowrap}
        .elab-sev.notice{background:var(--enotices);color:var(--enotice)}.elab-sev.good{background:var(--egoods);color:var(--egood)}.elab-sev.gap{background:var(--egaps);color:var(--egap)}
        .elab-card-body{padding:0 13px 12px;font-size:12.5px;color:var(--eink2);line-height:1.6}
        .elab-quote{border-left:3px solid var(--egood);background:var(--egoods);color:var(--eink);padding:9px 12px;border-radius:0 8px 8px 0;font-size:12.5px;line-height:1.62;margin:8px 0 0}
        .elab-new{display:block;margin-top:6px;font-size:11px;font-weight:700;color:var(--egood);letter-spacing:.03em}
        .elab-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
        .elab-done,.elab-note-soft{font-size:12.5px;color:var(--esoft);background:var(--epanel2);border:1px solid var(--eline);border-radius:10px;padding:11px 13px}
        .elab-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--esoft);padding:9px 14px;border-top:1px solid var(--eline);background:var(--epanel2)}
        .elab-k{display:flex;align-items:center;gap:7px}
        .elab-sw{width:20px;height:10px;border-radius:3px}
        .elab-sw-good{background:var(--egoods);box-shadow:inset 0 -2px 0 var(--egoodl)}
        .elab-sw-res{background:var(--enotices);box-shadow:inset 0 -2px 0 var(--enoticel)}
        .elab-bpchip{margin-left:10px;font:inherit;font-size:11px;font-weight:700;border:1px solid var(--eline2);background:var(--epanel);color:var(--esoft);padding:3px 10px;border-radius:999px;cursor:pointer;white-space:nowrap}
        .elab-bpchip:hover{border-color:var(--eaccr);color:var(--eacc)}
        .elab-bpchip.on{background:var(--eaccs);border-color:var(--eaccr);color:var(--eacc)}
        .elab-srcseg{display:inline-flex;background:var(--epanel3);border-radius:8px;padding:2px}
        /* selettore di modalità (Fonte / Documenti) accanto al titolo */
        .elab-modeseg{margin-left:14px}
        /* host dell'editor documenti: occupa tutto lo spazio sotto la barra */
        #elab-doc-host{flex:1;min-height:0}
        .elab-seg{font:inherit;font-size:11px;font-weight:700;border:0;background:transparent;color:var(--esoft);padding:4px 12px;border-radius:7px;cursor:pointer}
        .elab-seg.active{background:var(--epanel);color:var(--eacc);box-shadow:0 1px 2px rgba(15,23,42,.06)}
        .elab-pdf-body{padding:0;display:flex;flex-direction:column;min-height:0}
        .elab-pdfbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--eline);background:var(--epanel2);font-size:12px;color:var(--esoft)}
        .elab-pdfsel{font:inherit;font-size:12px;border:1px solid var(--eline2);border-radius:8px;padding:3px 8px;background:var(--epanel);color:var(--eink);max-width:56%}
        .elab-pdfname{font-weight:700;color:var(--eink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .elab-pdfinfo{margin-left:auto;font-size:11px;color:var(--efaint);white-space:nowrap}
        .elab-pdf-scroll{flex:1;min-height:0;overflow:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--epanel3)}
        .elab-pdf-pagewrap{position:relative;border-radius:4px;box-shadow:0 2px 12px rgba(15,23,42,.14);max-width:100%;flex:0 0 auto}
        .elab-pdf-page{display:block;border-radius:4px;background:#fff;width:100%;height:auto}
        .elab-pdf-hllayer{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:4px}
        .elab-pdf-hl{position:absolute;border-radius:2px;mix-blend-mode:multiply}
        .elab-pdf-loading{color:var(--esoft);font-size:12.5px;padding:12px;text-align:center}
        .elab-s{border-radius:3px}
        .elab-s-cov{background:linear-gradient(transparent 62%,var(--egoodl) 62%)}
        .elab-s-res{background:var(--enotices);box-shadow:inset 0 -2px 0 var(--enoticel);cursor:pointer}
        .elab-s-res:hover{background:var(--enoticel)}
        .elab-flash{animation:elabFlash 1.4s ease-out 1}
        @keyframes elabFlash{0%{background:var(--eaccr)}100%{background:var(--enotices)}}
        .elab-quote-link{cursor:pointer}
        .elab-quote-link:hover{background:var(--egoodl)}
        .elab-card-flash{animation:elabCardFlash 1.4s ease-out 1}
        @keyframes elabCardFlash{0%{box-shadow:0 0 0 3px var(--eaccr)}100%{box-shadow:0 1px 2px rgba(15,23,42,.05)}}
        .elab-tree{display:flex;flex-direction:column;gap:2px;max-width:720px}
        .elab-tree-hint{font-size:11.5px;color:var(--esoft);background:var(--epanel2);border:1px solid var(--eline);border-radius:9px;padding:7px 11px;margin-bottom:7px}
        .elab-tree-hint a{color:var(--eacc);font-weight:700}
        .elab-tr{display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent;font-size:13px;min-height:32px}
        .elab-tr:hover{background:var(--epanel2)}
        .elab-tr-over{border-color:var(--eaccr);background:var(--eaccs)}
        .elab-tr-picked{border-color:var(--egapl);background:var(--egaps)}
        .elab-tw-chev{width:16px;flex:0 0 auto;color:var(--efaint);font-size:11px;cursor:pointer;text-align:center}
        .elab-tw-leaf{cursor:default}
        .elab-tw-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
        .elab-tw-lbl{font-weight:600;color:var(--eink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .elab-tw-root{font-weight:800}
        .elab-tw-lvl{font-size:10px;font-weight:700;color:var(--efaint);flex:0 0 auto}
        .elab-tb{flex:0 0 auto;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 8px;line-height:1.4}
        .elab-tb-res{background:var(--enotices);color:var(--enotice);box-shadow:inset 0 0 0 1px var(--enoticel);cursor:pointer}
        .elab-tb-cov{background:var(--egoods);color:var(--egood)}
        .elab-tb-str{background:var(--egaps);color:var(--egap)}
        .elab-tb-w{background:var(--epanel3);color:var(--esoft);font-weight:600}
        .elab-ta-wrap{display:none;gap:2px;flex:0 0 auto}
        .elab-tr:hover .elab-ta-wrap{display:inline-flex}
        .elab-ta{width:24px;height:24px;border-radius:7px;display:inline-grid;place-items:center;color:var(--esoft);font-size:12px;font-style:normal;font-family:var(--emoji-font),inherit}
        .elab-ta:hover{background:var(--eaccs);color:var(--eacc)}
        /* 0118: la maniglia fra fonte e analisi, l'aspetto di quella del Banco (mappai-review-dashboard.css, 17/9): una linea
           sottile che diventa verde (--mm-ok) sotto il dito, il chip grigio che si scuote alla prima apparizione, e a fonte
           chiusa una linguetta verde sul bordo sinistro. Solo con le colonne affiancate (sopra i 900 px). */
        @media (min-width:901px){
          .elab-split-man{position:relative;grid-template-columns:var(--elab-fonte-w,53.5%) minmax(0,1fr);transition:grid-template-columns .28s ease}
          .elab-split-man>.elab-maniglia{position:absolute;top:0;bottom:0;left:var(--elab-fonte-w,53.5%);z-index:4;width:12px;margin-left:-6px;cursor:col-resize;touch-action:none;transition:left .28s ease}
          .elab-split-man>.elab-maniglia::before{content:'';position:absolute;top:0;bottom:0;left:5px;width:2px;background:var(--eline);transition:background .15s}
          .elab-split-man>.elab-maniglia::after{content:'';position:absolute;top:50%;left:50%;width:4px;height:40px;margin:-20px 0 0 -2px;border-radius:4px;background:var(--efaint);pointer-events:none}
          .elab-split-man.elab-scuoti>.elab-maniglia::after{animation:mm-chip-nudge .45s ease-in-out .8s 2}
          .elab-split-man>.elab-maniglia:hover::before,.elab-split-man.is-trascinando>.elab-maniglia::before,.elab-split-man>.elab-maniglia:hover::after,.elab-split-man.is-trascinando>.elab-maniglia::after{background:var(--mm-ok,#059669)}
          .elab-split-man>.elab-maniglia:focus-visible{outline:3px solid var(--eacc);outline-offset:-3px}
          .elab-split-man.is-trascinando,.elab-split-man.is-trascinando>.elab-maniglia{transition:none;user-select:none;cursor:col-resize}
          .elab-split-man.is-montando,.elab-split-man.is-montando>.elab-maniglia{transition:none}
          .elab-split-man.sta-chiudendo>.elab-pane:first-child{opacity:.35}
          .elab-split-man.is-pannello-chiuso>.elab-pane:first-child{visibility:hidden;border:0}
          .elab-split-man.is-pannello-chiuso>.elab-pane:last-child{padding-left:16px}
          .elab-split-man.is-pannello-chiuso>.elab-maniglia{top:50%;bottom:auto;height:72px;width:14px;margin:-36px 0 0 0;border-radius:0 8px 8px 0;background:var(--mm-ok,#059669);box-shadow:1px 0 3px rgba(0,0,0,.15)}
          .elab-split-man.is-pannello-chiuso>.elab-maniglia::before{left:4px;width:6px;top:26px;bottom:26px;background:repeating-linear-gradient(to bottom,#fff 0 2px,transparent 2px 5px)}
          .elab-split-man.is-pannello-chiuso>.elab-maniglia::after{display:none}
        }
        @media (prefers-reduced-motion:reduce){.elab-split-man,.elab-split-man>.elab-maniglia{transition:none}.elab-split-man.elab-scuoti>.elab-maniglia::after{animation:none}}
        /* 0118: il PDF originale a destra nella vista «Figure» (pagine come in .elab-pdf-scroll) e il riquadro del ritaglio */
        .elab-figpdf-pane{background:var(--epanel3)}
        .elab-figpdf-pane>.elab-pane-head>.elab-lbl{white-space:nowrap;flex:0 0 auto}
        .elab-figpdf-nome{font-size:var(--mm-fs-aiuto);color:var(--esoft);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .elab-figpdf-slot{flex:1;min-height:0;display:flex;flex-direction:column}
        .elab-figpdf{flex:1;min-height:0;overflow:auto;padding:16px;display:flex;flex-direction:column;align-items:stretch;gap:12px;position:relative}
        .elab-figpdf-pag{position:relative;width:100%;border-radius:4px;background:#fff;box-shadow:0 2px 12px rgba(15,23,42,.14);flex:0 0 auto}
        .elab-figpdf-canvas{display:block;width:100%;height:100%;border-radius:4px}
        .elab-figpdf-riq{position:absolute;box-sizing:border-box;border:3px solid var(--eacc);border-radius:4px;background:rgba(79,70,229,.08);pointer-events:none}
        .elab-figpdf-riq-giallo{border-color:var(--enotice);background:rgba(180,83,9,.08)}
        .elab-figpdf-riq-verde{border-color:var(--egood);background:rgba(4,120,87,.08)}
        .elab-figpdf-riq-rosso{border-color:var(--esoft);background:rgba(100,116,139,.08)}
        .elab-figpdf-riq-non-letto{border-color:var(--egap);background:rgba(109,40,217,.08)}
        .elab-figpdf-riq-saltato{border-color:var(--efaint);background:rgba(148,163,184,.1)}
        .elab-fig-sel>.elab-fig-card{box-shadow:0 0 0 2px var(--eacc)}
        @media (max-width:900px){.elab-split{grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}.elab-divider,.elab-maniglia{display:none}.elab-pane:first-child{border-bottom:1px solid var(--eline)}.elab-stack{max-width:none}}`;
        const st = document.createElement('style');
        st.id = 'elab-styles'; st.textContent = css;
        document.head.appendChild(st);
    }

    // ── ingresso/uscita dalla MAPPA (fix flusso 22/7): la mappa vive solo nel
    // map-view; ELABORA si apre da lì (menu azioni), non dalla landing fresca. ──
    function openFromMap() {
        _forceEmpty = false;
        var mv = document.getElementById('map-view'); if (mv) mv.classList.remove('active');
        var lv = document.getElementById('landing-view'); if (lv) lv.style.display = '';
        if (window.MappAITeach && window.MappAITeach.setMode) window.MappAITeach.setMode('elabora');
        else { _injectStyles(); render(); }
        try { window.scrollTo(0, 0); } catch (e) { }
    }
    function backToMap() {
        _teardownOverlay();
        var lv = document.getElementById('landing-view'); if (lv) lv.style.display = 'none';
        var mv = document.getElementById('map-view'); if (mv) mv.classList.add('active');
    }

    // chiamata quando si esce dalla modalità ELABORA (toggle Costruisci/Insegna):
    // smonta l'overlay fullscreen e resetta il flag di uscita.
    function teardown() { _forceEmpty = false; _teardownOverlay(); }

    window.MappAIElabora = {
        open, render, addCitation, ignore, pickPdf, onPdf, addTextPrompt, hasMap,
        openFromMap, backToMap, openProject, exitWorkspace, setSrcView, setPdfIdx,
        mountSource, unmountSource, renderSource, sourceActions, runSourceAction,
        teardown, revealCard, revealInSource,
        setRightView, setMode, toggleTreeRow, treeRowClick, gotoNodeCard, renameNode, editNode,
        addChild, treeDragStart, treeDrop, startMergePick, cancelMergePick,
        flushSourcesToVault, copySourcesTo, exportAreas,
        /* l'interruttore `mappai_fonte_in_fonti` (0059): lo chiedono la pipeline
           e `mappai-vault-io.js`, che non leggono la chiave da sé */
        fonteInFonti,
        /* il lucchetto di «Aggiungi PDF» (0059, D10): lo chiede `mappaiOccupato` */
        letturaPdfAttiva, motivoLetturaPdf,
        /* le fonti che sopravvivono al vault (9/8): le chiama `mappai-vault-io.js`
           al caricamento, e la console/ELABORA quando apre */
        salvaIndiceFonti, ripristinaFontiDalVault, completaTestiMancanti: _completaTestiMancanti, exportHighlighted, exportHighlightedPdf, toggleBoilerplate,
        openQuestions,
        /* 0113 (lotto 8): i gesti della vista «Testo delle figure» */
        figLeggi, figRileggiGoogle, figConferma, figSalva, figVaBeneRiga, figVaBeneTutte, figApri, figTabella,   // 0114: la spunta per riga, la tabella «Figure» della console
        figMostra, figDa, figPdfStato,   // 0118: la figura su cui si lavora e il PDF a destra
        /* 0096: l'interruttore dei comandi della fonte e «il progetto ha già un PDF»;
           li chiede la console */
        comandiFonte, haPdf,
        /* il nome del progetto per i nomi dei file (cartella, ADR 0021): lo chiede anche la
           console per la Catena (gate dello 0096) */
        nomeProgetto,
        /* 0078: `Fonti/` alla cartella di «Riprendi» che non ce l'ha */
        completaFontiDellaCartella
    };
    /* 0078: anche su `window`, dove la cerca `loadProject` (con la guardia: nel
       reader questo modulo non c'è) */
    window.completaFontiDellaCartella = completaFontiDellaCartella;
})();
