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
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    let _srcView = 'text';         // vista pannello fonte: 'text' | 'pdf'
    let _rightView = 'cards';      // vista pannello destro: 'cards' | 'tree'
    let _treeCollapsed = new Set();// nodi collassati nell'albero ELABORA (indipendente dalla sidebar)
    let _dragId = null;            // nodo trascinato nell'albero (drag&drop → sposta)
    let _mergePick = null;         // nodo sorgente di «Fondi in…» in attesa del target
    let _pdfIdx = 0;               // PDF selezionato nella vista anteprima
    let _pdfToken = 0;             // annulla render PDF concorrenti/obsoleti
    let _pdfSeq = 0;               // contatore MONOTONO di sessione (id univoci cross-progetto)
    const _pdfFiles = new Map();   // sourceId → File (PDF aggiunti in ELABORA, sessione)

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

    function render() {
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
        const EC = window.MappAIEnrichCore;
        const overlay = _ensureOverlay();
        if (!EC) { overlay.innerHTML = '<div class="elab-empty">' + t('el_no_engine', 'Motore di analisi non disponibile.') + '</div>'; return; }

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
        host.innerHTML = '';
        overlay.innerHTML = _shell(s, _R, pdfs);
        document.body.classList.add('elab-fullscreen');
        if (window.safeCreateIcons) window.safeCreateIcons({ root: overlay });
        if (_mode === 'docs') {
            // L'editor documenti si disegna da sé nel proprio host: mantiene lo stato
            // (documento aperto, cronologia annulla) tra un render e l'altro.
            if (window.MappAIDocEditor) window.MappAIDocEditor.render();
            return;
        }
        if (_srcView === 'pdf' && pdfs.length) _mountPdf(pdfs);
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
        if (el) el.remove();
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
            _pdfFiles.clear(); _srcView = 'text'; _pdfIdx = 0;
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
            window.loadSavedProject(id);
            setTimeout(function () { openFromMap(); }, 350);
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
            '<button type="button" class="elab-btn" onclick="MappAIElabora.openQuestions()" title="' + t('el_questions_tip', 'Recupera le domande/esercizi della scheda per usarle in un quiz') + '">❓ ' + t('el_questions', 'Domande scheda') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.exportHighlightedPdf()" title="' + t('el_export_hl_tip', 'Esporta il PDF originale con le frasi evidenziate per macro-area (fonte solo-testo → documento riflowato)') + '">📄 ' + t('el_export_hl', 'Esporta evidenziata') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.exportAreas()" title="' + t('el_export_areas_tip', 'Raccoglie le frasi della fonte per macro-area, stampabile/PDF') + '">📑 ' + t('el_export_areas', 'Esporta per aree') + '</button>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.addTextPrompt()">' + emo('pencil') + ' ' + t('el_add_text', 'Incolla testo') + '</button>' +
            '<button type="button" class="elab-btn elab-primary" onclick="MappAIElabora.pickPdf()">' + emo('add') + ' ' + t('el_add_pdf', 'Aggiungi PDF') + '</button>' +
            '<input type="file" id="elab-pdf-input" accept="application/pdf,.pdf" class="hidden" onchange="MappAIElabora.onPdf(this)">';

        const sourceBody =
          _triageStrip(s, R) +
          '<div class="elab-split">' +
            _srcPaneHTML(corpus, pdfs) +
            '<div class="elab-divider"><span class="elab-grip"></span></div>' +
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
            '</section>' +
          '</div>' +
          _legend();

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

    function _triageStrip(s, R) {
        const tr = s.mmTriage;
        let tt, td, verdict;
        if (tr && tr.essentialDepth) {
            const type = { taxonomic: 'tassonomico', procedural: 'procedurale', 'causal-narrative': 'causale/narrativo', mixed: 'misto' }[tr.contentType] || tr.contentType;
            tt = t('el_triage_t', 'Struttura della fonte') + ' · ' + esc(type);
            td = esc(tr.rationale || t('el_triage_d', 'Il contenuto essenziale vive fino al livello indicato.'));
            verdict = t('el_essential', 'essenziale') + ' · L' + tr.essentialDepth;
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
    function _groupColorOf(grp) {
        const s = _appState();
        try {
            const cc = s.db.customColors || {};
            if (cc[grp] !== undefined) return cc[grp];
            if (typeof colorScale !== 'undefined' && colorScale && colorScale[grp]) return colorScale[grp];
        } catch (e) { /* soft */ }
        return '#94a3b8';
    }
    // hex (#rgb/#rrggbb) o rgb()/qualunque → rgba con alpha. Fallback: la stringa così com'è.
    function _rgba(color, a) {
        let c = String(color || '').trim();
        let m = /^#([0-9a-f]{3})$/i.exec(c);
        if (m) { const h = m[1]; c = '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
        m = /^#([0-9a-f]{6})$/i.exec(c);
        if (m) { const n = parseInt(m[1], 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
        m = /^rgb\(([^)]+)\)$/i.exec(c);
        if (m) return 'rgba(' + m[1].split(',').map(x => x.trim()).slice(0, 3).join(',') + ',' + a + ')';
        return c;
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
    function _highlightedDocBody() {
        const D = window.MappAIDeepenCore;
        const corpus = _corpus();
        if (!D || !D.splitSentences || !corpus) return '';
        const SD = window.MappAIStudyDoc;
        const paras = corpus.split(/\n{2,}/).filter(p => p.trim());
        return '<div class="sd-source">' + paras.map(p => {
            const trimmed = p.trim();
            const sents = D.splitSentences(trimmed);
            if (!sents || !sents.length) return '<p>' + esc(trimmed) + '</p>';
            return '<p>' + sents.map(sn => {
                const sc = _sentColor(sn);
                if (!sc) return esc(sn);
                const a = sc.strength === 'weak' ? 0.13 : 0.32;
                const style = (sc.kind === 'res')
                    ? 'background:' + SD.rgba(sc.color, 0.20) + ';box-shadow:inset 0 -2px 0 ' + SD.rgba(sc.color, 0.85)
                    : 'background:linear-gradient(transparent 60%,' + SD.rgba(sc.color, a) + ' 60%)';
                return '<span style="' + style + '">' + esc(sn) + '</span>';
            }).join(' ') + '</p>';
        }).join('') + '</div>';
    }

    function exportHighlighted() {
        if (!window.MappAIStudyDoc) { if (window.showToast) showToast(t('el_export_nolib', 'Costruttore documento non disponibile.'), 'error'); return; }
        const body = _highlightedDocBody();
        if (!body) { if (window.showToast) showToast(t('el_no_source_doc', 'Nessuna fonte da esportare.'), 'warning'); return; }
        const s = _appState();
        const lang = (window.getMapLanguage && window.getMapLanguage() === 'en') ? 'en' : 'it';
        const html = window.MappAIStudyDoc.buildHtml({
            title: t('el_doc_hl_title', 'Scheda con evidenziazioni'),
            mapName: (s && s.rootNodeLabel) || t('el_map', 'Mappa'),
            subtitle: t('el_crumb', 'elaborazione'),
            bodyHtml: body,
            lang: lang
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

    // Voce del bottone: fonte solo-testo → documento riflowato; PDF presente →
    // apre il modale di configurazione dell'app (NON il dialog OS diretto).
    function exportHighlightedPdf() {
        const pdfs = _collectPdfs();
        if (!pdfs.length) return exportHighlighted();   // fonte solo-testo → riflow
        if (typeof pdfjsLib === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
            if (window.showToast) showToast(t('el_pdf_export_fallback', 'Esporto la versione testo (PDF non disponibile).'), 'info');
            return exportHighlighted();
        }
        _openPdfExportModal(pdfs);
    }

    // Modale di configurazione dell'export PDF (app-styled): opzioni prima del
    // salvataggio, invece del dialog OS diretto.
    function _openPdfExportModal(pdfs) {
        const old = document.getElementById('elab-pdfexp-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'elab-pdfexp-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:1002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font:inherit';
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
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
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
        if (window.showLoadingOverlay) window.showLoadingOverlay(true, t('el_pdf_export_run', 'Esporto il PDF evidenziato…'));
        try {
            let colored = _coloredSentences();
            if (opts.graded === false) colored = colored.filter(c => c.strength !== 'weak');   // solo concetti centrali
            const buf = await entry.file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
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
            if (window.showLoadingOverlay) window.showLoadingOverlay(false);
            if (!doc) return exportHighlighted();
            const s = _appState();
            const name = String((s && s.rootNodeLabel) || 'scheda').replace(/[^\w\-]+/g, '_').slice(0, 50) + '-evidenziata.pdf';
            doc.save(name);
            if (window.showToast) showToast(t('el_pdf_export_done', 'PDF evidenziato salvato.'), 'success');
        } catch (e) {
            if (window.showLoadingOverlay) window.showLoadingOverlay(false);
            console.warn('[elabora] export PDF evidenziato fallito:', e && e.message);
            if (window.showToast) showToast(t('el_pdf_export_fail', 'Export PDF non riuscito, esporto la versione testo.'), 'warning');
            exportHighlighted();
        }
    }

    // ── Domande della scheda → quiz (idea utente a) ──────────────────────────
    // Recupera le domande/esercizi dalla fonte e le usa come set di studio aperto.
    function openQuestions() {
        if (!window.MappAIQuestions) { if (window.showToast) showToast(t('el_q_nolib', 'Estrattore domande non disponibile.'), 'error'); return; }
        const qs = window.MappAIQuestions.extractQuestions(_corpus());
        if (!qs.length) { if (window.showToast) showToast(t('el_q_none', 'Nessuna domanda o esercizio trovato nella fonte.'), 'warning'); return; }
        const old = document.getElementById('elab-q-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'elab-q-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:1002;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font:inherit';
        const rows = qs.map((q, i) =>
            '<label class="elab-q-row" style="display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-radius:10px;cursor:pointer">' +
            '<input type="checkbox" data-qi="' + i + '" checked style="margin-top:3px;width:16px;height:16px;accent-color:#4f46e5;flex:0 0 auto">' +
            '<span style="flex:1;min-width:0"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:' + (q.type === 'task' ? '#b45309' : '#4f46e5') + ';margin-right:7px">' + (q.type === 'task' ? t('el_q_task', 'consegna') : t('el_q_question', 'domanda')) + '</span>' +
            '<span style="font-size:13px;color:#1e293b;line-height:1.5">' + esc(q.text) + '</span></span></label>'
        ).join('');
        ov.innerHTML =
            '<div style="background:#fff;border-radius:18px;max-width:720px;width:100%;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3)">' +
            '<div style="padding:18px 22px;border-bottom:1px solid #eef2f6">' +
            '<div style="font-size:16px;font-weight:900;color:#1e293b">❓ ' + t('el_q_title', 'Domande della scheda') + '</div>' +
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
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
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
            title: t('el_q_setname', 'Domande della scheda'),
            mode: 'quiz', type: t('el_q_settype', 'Aperte'),
            items: items, material: '', angle: 'auto', quantity: items.length,
            date: new Date().toISOString(), origin: 'elabora-questions'
        });
        if (window.renderStudySets) window.renderStudySets();
        try { if (window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
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
    function _qid(id) { return String(id).replace(/'/g, "\\'"); }

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
        const s = _appState();
        const grp = (n.level === 0) ? 0 : n.group;
        let color = '#94a3b8';
        try {
            const cc = s.db.customColors || {};
            if (cc[grp] !== undefined) color = cc[grp];
            else if (typeof colorScale !== 'undefined' && colorScale[grp]) color = colorScale[grp];
        } catch (e) { /* soft */ }
        const cov = covByNode.get(n.id);
        const nStr = strByNode.get(n.id) || 0;
        const words = String(n.desc || n.content || '').split(/\s+/).filter(Boolean).length;
        const qid = _qid(n.id);
        const isRoot = n.level === 0;
        const chev = nChildren
            ? '<span class="elab-tw-chev" onclick="event.stopPropagation();MappAIElabora.toggleTreeRow(\'' + qid + '\')">' + (_treeCollapsed.has(n.id) ? '▸' : '▾') + '</span>'
            : '<span class="elab-tw-chev elab-tw-leaf"></span>';
        let badges = '';
        if (cov) badges += '<span class="elab-tb elab-tb-res" title="' + t('el_tb_res_tip', 'Frasi della fonte non ancora nella scheda — clicca per la card') + '" onclick="event.stopPropagation();MappAIElabora.gotoNodeCard(\'' + qid + '\')">' + cov.res + '</span>';
        else if (words >= 25) badges += '<span class="elab-tb elab-tb-cov" title="' + t('el_tb_cov_tip', 'Scheda coperta dalla fonte') + '">✓</span>';
        if (nStr) badges += '<span class="elab-tb elab-tb-str" title="' + t('el_tb_str_tip', 'Suggerimenti strutturali su questo nodo') + '">' + nStr + '</span>';
        badges += '<span class="elab-tb elab-tb-w" title="' + t('el_tb_w_tip', 'Parole nella descrizione') + '">' + words + 'w</span>';
        const acts =
            '<span class="elab-ta" title="' + t('el_ta_rename', 'Rinomina') + '" onclick="event.stopPropagation();MappAIElabora.renameNode(\'' + qid + '\')">✎</span>' +
            '<span class="elab-ta" title="' + t('el_ta_edit', 'Modifica contenuto') + '" onclick="event.stopPropagation();MappAIElabora.editNode(\'' + qid + '\')">📝</span>' +
            '<span class="elab-ta" title="' + t('el_ta_child', 'Aggiungi figlio') + '" onclick="event.stopPropagation();MappAIElabora.addChild(\'' + qid + '\')">＋</span>' +
            (!isRoot ? '<span class="elab-ta" title="' + t('el_ta_merge', 'Fondi in un altro nodo…') + '" onclick="event.stopPropagation();MappAIElabora.startMergePick(\'' + qid + '\')">⇄</span>' : '');
        return '<div class="elab-tr' + (_mergePick === n.id ? ' elab-tr-picked' : '') + '" style="padding-left:' + (10 + depth * 18) + 'px"' +
            (!isRoot ? ' draggable="true" ondragstart="MappAIElabora.treeDragStart(event,\'' + qid + '\')"' : '') +
            ' ondragover="event.preventDefault();this.classList.add(\'elab-tr-over\')" ondragleave="this.classList.remove(\'elab-tr-over\')"' +
            ' ondrop="this.classList.remove(\'elab-tr-over\');MappAIElabora.treeDrop(event,\'' + qid + '\')"' +
            ' onclick="MappAIElabora.treeRowClick(\'' + qid + '\')" ondblclick="MappAIElabora.editNode(\'' + qid + '\')">' +
            chev + '<span class="elab-tw-dot" style="background:' + esc(color) + '"></span>' +
            '<span class="elab-tw-lbl' + (isRoot ? ' elab-tw-root' : '') + '">' + esc(window.cleanLabel ? window.cleanLabel(n.label) : n.label) + '</span>' +
            '<span class="elab-tw-lvl">L' + (n.level != null ? n.level : '?') + '</span>' +
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

    // pannello fonte a sinistra: testo estratto OPPURE anteprima del PDF originale
    function _srcPaneHTML(corpus, pdfs) {
        const hasPdf = pdfs.length > 0;
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
        if (_srcView === 'pdf' && hasPdf) {
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
                if (src.vaultRel && s.activeVaultPath && window.electronAPI && window.electronAPI.readVaultFile) {
                    add(src.name || 'PDF', _vaultPseudoFile(s.activeVaultPath, src.vaultRel), 'vault:' + src.vaultRel);
                }
            });
        } catch (e) { /* soft */ }
        return out;
    }

    // pseudo-File: espone solo .arrayBuffer() sui byte letti via IPC (cacheata)
    function _vaultPseudoFile(vaultPath, relPath) {
        let cached = null;
        return {
            name: relPath.split('/').pop(),
            arrayBuffer: async function () {
                if (cached) return cached;
                const res = await window.electronAPI.readVaultFile({ vaultPath: vaultPath, relPath: relPath });
                if (!res || !res.ok) throw new Error(res && res.error || 'read-vault-file fallita');
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
    function _matchColoredItems(tc, colored) {
        const items = (tc && tc.items) || [];
        const itemColor = new Map();
        if (!items.length || !colored || !colored.length) return itemColor;
        let raw = ''; const map = [];
        items.forEach((it, idx) => {
            const s = it.str || '';
            let prevSpace = raw.length === 0 || raw[raw.length - 1] === ' ';
            for (let k = 0; k < s.length; k++) {
                const ch = s[k];
                if (/\s/.test(ch)) { if (!prevSpace) { raw += ' '; map.push(idx); prevSpace = true; } }
                else { raw += ch.toLowerCase(); map.push(idx); prevSpace = false; }
            }
            if (!prevSpace) { raw += ' '; map.push(idx); }
        });
        if (!raw) return itemColor;
        colored.forEach(cs => {
            if (!cs.n || cs.n.length < 8) return;
            const strong = cs.strength !== 'weak';
            let from = 0, pos;
            while ((pos = raw.indexOf(cs.n, from)) >= 0) {
                const end = Math.min(pos + cs.n.length - 1, map.length - 1);
                for (let ci = pos; ci <= end; ci++) {
                    const it = map[ci], prev = itemColor.get(it);
                    if (!prev || (prev.strength === 'weak' && strong)) itemColor.set(it, { color: cs.color, strength: strong ? 'strong' : 'weak' });
                }
                from = pos + cs.n.length;
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
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            if (token !== _pdfToken) return;
            const total = pdf.numPages;
            const n = Math.min(total, CAP);
            if (info) info.textContent = (total > n ? (n + '/' + total) : String(total)) + ' ' + t('el_pdf_pages', 'pagine');
            scroll.innerHTML = '';
            const wCss = Math.max(320, (scroll.clientWidth || 640) - 28);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            // Frasi della fonte con colore di macro-area (per l'highlight PDF).
            const colored = _coloredSentences();
            for (let i = 1; i <= n; i++) {
                if (token !== _pdfToken) return;
                const page = await pdf.getPage(i);
                if (token !== _pdfToken) return;
                const vp1 = page.getViewport({ scale: 1 });
                const vp = page.getViewport({ scale: (wCss / vp1.width) * dpr });
                const wrap = document.createElement('div');
                wrap.className = 'elab-pdf-pagewrap';
                wrap.style.width = wCss + 'px'; wrap.style.height = Math.floor(vp.height / dpr) + 'px';
                const canvas = document.createElement('canvas');
                canvas.className = 'elab-pdf-page';
                canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
                canvas.style.width = wCss + 'px'; canvas.style.height = Math.floor(vp.height / dpr) + 'px';
                wrap.appendChild(canvas);
                scroll.appendChild(wrap);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                if (token !== _pdfToken) return;
                // Highlight colorati sul PDF: text layer pdf.js + match delle frasi.
                if (colored.length) {
                    try {
                        const tc = await page.getTextContent();
                        if (token !== _pdfToken) return;
                        const vpCss = page.getViewport({ scale: wCss / vp1.width });
                        _paintPdfHighlights(wrap, tc, vpCss, wCss / vp1.width, colored);
                    } catch (e) { /* best-effort: senza text layer resta il canvas */ }
                }
            }
            if (token !== _pdfToken) return;
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

    function setSrcView(v) { _srcView = (v === 'pdf') ? 'pdf' : 'text'; render(); }
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
                '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(\'sig:' + esc(x.key) + '\')">' + t('el_ignore', 'Ignora') + '</button></div>';
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
            body += '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(\'cov:' + esc(c.nodeId) + '\')">' + emo('ignore') + ' ' + t('el_ignore_node', 'Ignora questo nodo') + '</button></div>';
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

    function pickPdf() { const el = document.getElementById('elab-pdf-input'); if (el) el.click(); }

    async function onPdf(input) {
        const file = input && input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (typeof window.extractTextFromPDF !== 'function') { if (window.showToast) showToast(t('el_no_pdf', 'Lettore PDF non disponibile'), 'error'); return; }
        if (window.showToast) showToast(t('el_reading_pdf', 'Lettura PDF…'), 'info');
        try {
            const text = await window.extractTextFromPDF(file);
            if (!text || text.trim().length < 40) { if (window.showToast) showToast(t('el_pdf_empty', 'PDF senza testo estraibile'), 'error'); return; }
            _persistSource('pdf', text, file.name || 'PDF', file);
        } catch (e) {
            if (window.showToast) showToast(t('el_pdf_err', 'Errore lettura PDF'), 'error');
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
    function _persistSource(type, content, name, file) {
        const s = _appState();
        if (!s.sources) s.sources = [];
        // id MONOTONO di sessione (mai riusato tra progetti) → niente collisione in
        // _pdfFiles quando si cambia mappa (bug: PDF di un progetto nell'altro).
        const id = 'elab_' + type + '_' + (++_pdfSeq);
        const src = { id: id, type: type, content: content, file: null, name: name, origin: 'elabora' };
        s.sources.push(src);
        if (file) {
            _pdfFiles.set(id, file);
            _srcView = 'pdf';                                  // mostra subito il PDF appena aggiunto
            const idx = _collectPdfs().findIndex(p => p.file === file);
            if (idx >= 0) _pdfIdx = idx;
            _saveOriginalToVault(src, file);                   // async, non blocca
        }
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        if (window.showToast) showToast(t('el_added', 'Materiale aggiunto alla fonte — ricalcolo…'), 'success');
        render();   // corpusFromState include ora la nuova source → nuove card
    }

    // scrive il PDF originale in <vault>/Fonti/ (se un vault è collegato) e
    // annota src.vaultRel; il salvataggio progetto successivo lo persiste gratis.
    async function _saveOriginalToVault(src, file) {
        const s = _appState();
        const api = window.electronAPI;
        if (!s || !s.activeVaultPath || !api || !api.saveVaultFile) return;
        try {
            const FC = window.MappAIFilesCore;
            const base = (FC && FC.safeName) ? FC.safeName(String(src.name || 'fonte').replace(/\.pdf$/i, ''), 'fonte') : 'fonte';
            const buf = await file.arrayBuffer();
            let bin = ''; const bytes = new Uint8Array(buf);
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            const b64 = btoa(bin);
            // anti-collisione (review 22/7): mai sovrascrivere un PDF omonimo già
            // in Fonti/ — ifAbsent + retry con suffisso « · 02», « · 03»…
            for (let n = 0; n < 10; n++) {
                const rel = 'Fonti/' + base + (n ? ' · 0' + (n + 1) : '') + '.pdf';
                const res = await api.saveVaultFile({ vaultPath: s.activeVaultPath, relPath: rel, base64: b64, ifAbsent: true });
                if (res && res.ok) {
                    src.vaultRel = rel;
                    try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
                    break;
                }
                if (!res || !res.exists) break;   // errore diverso da collisione → stop
            }
        } catch (e) { /* soft: l'anteprima in-sessione resta comunque */ }
    }

    // Flush per Costruisci: alla CREAZIONE del vault (saveMapVault success) salva
    // in Fonti/ gli originali PDF ancora vivi in memoria e senza vaultRel.
    // Chiamata da vault-io.js con soft-guard.
    async function flushSourcesToVault() {
        const s = _appState();
        if (!s || !s.activeVaultPath || !s.sources) return;
        for (const src of s.sources) {
            if (src.vaultRel) continue;
            const f = _pdfFiles.get(src.id) || src.file;
            if (!f || typeof f.arrayBuffer !== 'function') continue;
            const nm = (src.name || f.name || '').toLowerCase();
            const isPdf = (f.type === 'application/pdf') || nm.endsWith('.pdf') || src.type === 'pdf';
            if (!isPdf) continue;
            if (!src.name && f.name) src.name = f.name;
            await _saveOriginalToVault(src, f);
        }
    }

    function _injectStyles() {
        if (_stylesInjected) return; _stylesInjected = true;
        const css = `
        #elabora-content .elab-emo,#elab-overlay .elab-emo{font-family:var(--emoji-font);font-style:normal;line-height:1}
        #elabora-content,#elab-overlay,#elab-pdfexp-modal,#elab-q-modal{--eink:#1e293b;--eink2:#475569;--esoft:#64748b;--efaint:#94a3b8;--eline:#e8ecf4;--eline2:#dde4f0;--epanel:#fff;--epanel2:#f6f8fc;--epanel3:#eef2f9;--eacc:#4f46e5;--eacc2:#6366f1;--eaccs:#eef2ff;--eaccr:#c7d2fe;--enotice:#b45309;--enotices:#fffbeb;--enoticel:#fce4a6;--egood:#047857;--egoods:#ecfdf5;--egoodl:#a7f3d0;--egap:#6d28d9;--egaps:#f5f3ff;--egapl:#ddd6fe}
        #elabora-content,#elab-overlay{font-size:clamp(13.5px,.28vw + 12.4px,16px);color:var(--eink)}
        /* Portal fullscreen a livello di body (sfugge al transform di .glass-card).
           z 950: sotto il modale edit nodo (z 1000) così «Aggiungi citazione» resta sopra. */
        #elab-overlay{position:fixed;inset:0;z-index:950;background:var(--epanel)}
        /* In fullscreen: via i controlli globali che coprirebbero la topbar (a11y eye,
           dev self-test, drawer insegnai.ch) — stesso pattern di body.is-snapshotting. */
        body.elab-fullscreen #a11y-panel-toggle,body.elab-fullscreen .a11y-panel,body.elab-fullscreen #dst-btn,body.elab-fullscreen #insegnai-drawer{display:none !important}
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
        .elab-pdf-pagewrap{position:relative;border-radius:4px;box-shadow:0 2px 12px rgba(15,23,42,.14);max-width:100%}
        .elab-pdf-page{display:block;border-radius:4px;background:#fff;max-width:100%}
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
        @media (max-width:900px){.elab-split{grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}.elab-divider{display:none}.elab-pane:first-child{border-bottom:1px solid var(--eline)}.elab-stack{max-width:none}}`;
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
        teardown, revealCard, revealInSource,
        setRightView, setMode, toggleTreeRow, treeRowClick, gotoNodeCard, renameNode, editNode,
        addChild, treeDragStart, treeDrop, startMergePick, cancelMergePick,
        flushSourcesToVault, exportAreas, exportHighlighted, exportHighlightedPdf, toggleBoilerplate,
        openQuestions
    };
})();
