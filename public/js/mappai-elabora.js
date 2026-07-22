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

    function hasMap() {
        const s = _appState();
        return !!(s && s.db && Array.isArray(s.db.nodes) && s.db.nodes.length > 1 && s.extractionMode === 'mindmap');
    }

    function _corpus() {
        const s = _appState();
        try { return (window.MappAIDescFidelity && window.MappAIDescFidelity.corpusFromState(s)) || ''; }
        catch (e) { return ''; }
    }

    // ── entrata nel tab ─────────────────────────────────────────────────────
    function open() { _injectStyles(); render(); }

    function render() {
        const host = document.getElementById('elabora-content');
        if (!host) return;
        _injectStyles();
        if (!hasMap()) { host.innerHTML = _emptyState(); _renderProjects(); if (window.safeCreateIcons) window.safeCreateIcons(); return; }
        const EC = window.MappAIEnrichCore;
        if (!EC) { host.innerHTML = '<div class="elab-empty">' + t('el_no_engine', 'Motore di analisi non disponibile.') + '</div>'; return; }

        const s = _appState();
        let structural = [];
        try {
            if (window.MappAIStructureAnalyzer) {
                structural = window.MappAIStructureAnalyzer.analyzeStructure(s.db.nodes, s.db.links, { mode: s.extractionMode }).suggestions || [];
            }
        } catch (e) { /* soft */ }

        _R = EC.analyzeEnrichment(s, { structuralSuggestions: structural });
        host.innerHTML = _shell(s, _R);
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    // ── viste ───────────────────────────────────────────────────────────────
    function _emptyState() {
        return '<div class="elab-empty">' +
            '<div class="elab-empty-emo elab-emo">' + EMO.pencil + '</div>' +
            '<div class="elab-empty-h">' + t('el_empty_h', 'Scegli una mappa da elaborare') + '</div>' +
            '<div class="elab-empty-p">' + t('el_empty_p', 'ELABORA analizza una mappa già generata: profilo del materiale, copertura della fonte e suggerimenti per arricchirla — senza modifiche automatiche.') + '</div>' +
            '</div>' +
            '<div class="elab-projects-wrap">' +
              '<div class="elab-projects-head">' +
                '<span class="elab-lbl">' + t('el_pick', 'Mappe salvate') + '</span>' +
                '<div class="elab-filter">' +
                  '<button type="button" id="elab-filter-all" class="elab-fseg" onclick="window.MappAITeach && window.MappAITeach.setClassFilter(\'all\')">' + t('ui_teach_filter_all', 'Tutti') + '</button>' +
                  '<button type="button" id="elab-filter-class" class="elab-fseg" onclick="window.MappAITeach && window.MappAITeach.setClassFilter(\'active\')">' + t('ui_teach_filter_class', 'Classe') + '</button>' +
                '</div>' +
              '</div>' +
              '<div id="elab-projects" class="elab-projects-list"></div>' +
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
            window.loadSavedProject(id);
            setTimeout(function () { openFromMap(); }, 350);
        }
    }

    function _shell(s, R) {
        const mapName = esc(s.rootNodeLabel || 'Mappa');
        const corpus = _corpus();
        const nCards = (R.coverage.cards || []).filter(c => !_ignored.has('cov:' + c.nodeId)).length +
            (R.text.signals || []).filter(x => !_ignored.has('sig:' + x.key)).length +
            (R.structural || []).filter((x, i) => !_ignored.has('str:' + i)).length;

        return '' +
        '<div class="elab-ws">' +
          '<div class="elab-bar">' +
            '<button type="button" class="elab-btn elab-ghost" onclick="MappAIElabora.backToMap()">‹ ' + t('el_back_to_map', 'Torna alla mappa') + '</button>' +
            '<div class="elab-title">' + emo('search') + ' ' + mapName + ' <span class="elab-crumb">· ' + t('el_crumb', 'elaborazione') + '</span></div>' +
            '<div class="elab-spacer"></div>' +
            '<button type="button" class="elab-btn" onclick="MappAIElabora.addTextPrompt()">' + emo('pencil') + ' ' + t('el_add_text', 'Incolla testo') + '</button>' +
            '<button type="button" class="elab-btn elab-primary" onclick="MappAIElabora.pickPdf()">' + emo('add') + ' ' + t('el_add_pdf', 'Aggiungi PDF') + '</button>' +
            '<input type="file" id="elab-pdf-input" accept="application/pdf,.pdf" class="hidden" onchange="MappAIElabora.onPdf(this)">' +
          '</div>' +
          _triageStrip(s, R) +
          '<div class="elab-split">' +
            '<section class="elab-pane">' +
              '<div class="elab-pane-head"><span class="elab-lbl">' + t('el_source', 'Materiale · fonte') + '</span></div>' +
              '<div class="elab-pane-body"><div class="elab-reading">' + _sourceHTML(corpus) + '</div></div>' +
            '</section>' +
            '<div class="elab-divider"><span class="elab-grip"></span></div>' +
            '<section class="elab-pane">' +
              '<div class="elab-pane-head"><span class="elab-lbl">' + t('el_analysis', 'Analisi &amp; suggerimenti') + '</span><div class="elab-spacer"></div><span class="elab-lbl elab-muted">' + nCards + ' ' + t('el_to_see', 'da vedere') + '</span></div>' +
              '<div class="elab-pane-body"><div class="elab-stack">' +
                _signalsHTML(R) + _coverageHTML(R) + _structuralHTML(R) +
                (nCards === 0 ? '<div class="elab-done">' + emo('coverage') + ' ' + t('el_all_good', 'Materiale ben coperto — nessun suggerimento in sospeso.') + '</div>' : '') +
              '</div></div>' +
            '</section>' +
          '</div>' +
          _legend() +
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
            verdict = t('el_deterministic', 'analisi locale');
        }
        return '<div class="elab-triage">' +
            '<span class="elab-ti">' + emo('triage') + '</span>' +
            '<div><div class="elab-tt">' + tt + '</div><div class="elab-td">' + td + '</div></div>' +
            '<span class="elab-verdict">' + verdict + '</span>' +
        '</div>';
    }

    function _sourceHTML(corpus) {
        if (!corpus || corpus.trim().length < 40) {
            return '<div class="elab-nosrc">' + emo('add') + ' ' + t('el_no_source', 'Nessuna fonte nel progetto. Aggiungi un testo o un PDF per analizzare la copertura.') + '</div>' + _dropzone();
        }
        const CAP = 9000;
        const shown = corpus.length > CAP ? corpus.slice(0, CAP) : corpus;
        const paras = shown.split(/\n{2,}/).filter(p => p.trim()).slice(0, 60);
        return paras.map(p => '<p>' + esc(p.trim()) + '</p>').join('') +
            (corpus.length > CAP ? '<p class="elab-muted elab-lbl">' + t('el_truncated', '…fonte troncata per la vista (l\'analisi usa il testo completo).') + '</p>' : '') +
            _dropzone();
    }
    function _dropzone() {
        return '<div class="elab-dropzone" onclick="MappAIElabora.pickPdf()">' +
            '<span class="elab-emo elab-drop-emo">' + EMO.add + '</span>' +
            '<div><b>' + t('el_drop_h', 'Aggiungi materiale') + '</b><div class="elab-hint">' + t('el_drop_p', 'Un testo o un PDF si uniscono alla fonte → nuove citazioni per colmare i vuoti') + '</div></div>' +
        '</div>';
    }

    function _card(kind, iconKey, cls, title, meta, sev, sevCls, bodyHTML, ignoreKey) {
        if (_ignored.has(ignoreKey)) return '';
        return '<div class="elab-card">' +
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
                body += '<div class="elab-quote">«' + esc(r.text) + '»' +
                    '<span class="elab-new">+' + r.newWords + ' ' + t('el_new_words', 'parole nuove') + '</span>' +
                    '<div class="elab-actions">' +
                    '<button type="button" class="elab-btn elab-tiny elab-primary" onclick="MappAIElabora.addCitation(' + ci + ',' + ri + ')">' + emo('cite') + ' ' + t('el_add_cite', 'Aggiungi citazione') + '</button>' +
                    '</div></div>';
            });
            body += '<div class="elab-actions"><button type="button" class="elab-btn elab-tiny elab-ghost" onclick="MappAIElabora.ignore(\'cov:' + esc(c.nodeId) + '\')">' + emo('ignore') + ' ' + t('el_ignore_node', 'Ignora questo nodo') + '</button></div>';
            out += _card('cov', 'coverage', 'good', esc(c.label), meta, t('el_enrichable', 'arricchibile'), 'good', body, 'cov:' + c.nodeId);
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
            _persistSource('pdf', text, file.name || 'PDF');
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

    // decisione 3: PERSISTENTE — spinge nelle sources del progetto e salva
    function _persistSource(type, content, name) {
        const s = _appState();
        if (!s.sources) s.sources = [];
        s.sources.push({
            id: 'elab_' + type + '_' + (s.sources.length + 1),
            type: type, content: content, file: null, name: name, origin: 'elabora'
        });
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        if (window.showToast) showToast(t('el_added', 'Materiale aggiunto alla fonte — ricalcolo…'), 'success');
        render();   // corpusFromState include ora la nuova source → nuove card
    }

    function _injectStyles() {
        if (_stylesInjected) return; _stylesInjected = true;
        const css = `
        #elabora-content .elab-emo{font-family:var(--emoji-font);font-style:normal;line-height:1}
        #elabora-content{--eink:#1e293b;--eink2:#475569;--esoft:#64748b;--efaint:#94a3b8;--eline:#e8ecf4;--eline2:#dde4f0;--epanel:#fff;--epanel2:#f6f8fc;--epanel3:#eef2f9;--eacc:#4f46e5;--eacc2:#6366f1;--eaccs:#eef2ff;--eaccr:#c7d2fe;--enotice:#b45309;--enotices:#fffbeb;--enoticel:#fce4a6;--egood:#047857;--egoods:#ecfdf5;--egoodl:#a7f3d0;--egap:#6d28d9;--egaps:#f5f3ff;--egapl:#ddd6fe}
        #elabora-content{font-size:clamp(13.5px,.28vw + 12.4px,16px);color:var(--eink)}
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
        .elab-ws{background:var(--epanel);border:1px solid var(--eline);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 6px 22px rgba(15,23,42,.06);display:flex;flex-direction:column;overflow:hidden;height:clamp(560px,80vh,1180px);max-width:1760px;margin:0 auto}
        .elab-bar{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--eline);background:var(--epanel2);flex-wrap:wrap}
        .elab-title{font-weight:700;display:flex;align-items:center;gap:8px}
        .elab-crumb{color:var(--efaint);font-weight:400}
        .elab-spacer{flex:1 1 20px}
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
        @media (max-width:900px){.elab-split{grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}.elab-divider{display:none}.elab-pane:first-child{border-bottom:1px solid var(--eline)}.elab-ws{height:auto;min-height:78vh}.elab-stack{max-width:none}}`;
        const st = document.createElement('style');
        st.id = 'elab-styles'; st.textContent = css;
        document.head.appendChild(st);
    }

    // ── ingresso/uscita dalla MAPPA (fix flusso 22/7): la mappa vive solo nel
    // map-view; ELABORA si apre da lì (menu azioni), non dalla landing fresca. ──
    function openFromMap() {
        var mv = document.getElementById('map-view'); if (mv) mv.classList.remove('active');
        var lv = document.getElementById('landing-view'); if (lv) lv.style.display = '';
        if (window.MappAITeach && window.MappAITeach.setMode) window.MappAITeach.setMode('elabora');
        else { _injectStyles(); render(); }
        try { window.scrollTo(0, 0); } catch (e) { }
    }
    function backToMap() {
        var lv = document.getElementById('landing-view'); if (lv) lv.style.display = 'none';
        var mv = document.getElementById('map-view'); if (mv) mv.classList.add('active');
    }

    window.MappAIElabora = { open, render, addCitation, ignore, pickPdf, onPdf, addTextPrompt, hasMap, openFromMap, backToMap, openProject };
})();
