/*
 * mappai-material-pipeline.js — orchestratore UI della pipeline «Genera materiali» (011)
 * -----------------------------------------------------------------------
 * window.MappAIPipeline: modale di configurazione, pre-flight/stima, orchestratore
 * a step (A mappa → B quiz → C fogli nodi → D sintesi+voce), riepilogo/riprova.
 *
 * La logica pura (naming, manifest, transizioni, stima, validazioni) vive in
 * mappai-pipeline-core.js. Questo modulo fa SOLO orchestrazione + I/O via IPC.
 * main.js resta un wrapper sottile: qui l'assemblaggio dati, lì solo fs/finestre.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function PC() { return window.MappAIPipelineCore; }
  function FC() { return window.MappAIFilesCore; }
  function _t(k, f) { return window.t ? window.t(k, f) : f; }
  function _state() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function _now() { try { return new Date().toISOString(); } catch (e) { return ''; } }
  function _icons() { if (window.safeCreateIcons) window.safeCreateIcons(); }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }

  const Pipeline = { _running: false };

  // ── Stato mappa: rami L1 (MindMap) / hub (KG) ──────────────────────────
  function _branchNodes() {
    const db = _state().db || {};
    const nodes = db.nodes || [];
    const isMM = _state().extractionMode === 'mindmap';
    let branches = isMM ? nodes.filter(n => (n.level || 0) === 1) : nodes.filter(n => (n.level || 0) <= 1);
    if (!branches.length && nodes.length) branches = [nodes[0]];
    return branches;
  }
  function _mapStats() {
    const nodes = (_state().db && _state().db.nodes) || [];
    return { branches: _branchNodes().length, nodes: nodes.length, willGenerateMap: true };
  }
  function _mapName() {
    return _state().rootNodeLabel || (window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI') || 'MappAI';
  }

  // Materiale di studio del ramo: nodo + discendenti (label: desc), come il quiz in-app.
  function _branchMaterial(branch) {
    const kids = (window.getDescendants ? window.getDescendants(branch.id) : []) || [];
    const all = [branch].concat(kids);
    return all.map(n => _clean(n.label) + ': ' + (n.desc || n.content || '')).join('\n').slice(0, 12000);
  }

  // ── Conversione item quiz → forma stampabile (question/correctIndex) ────
  // generateDynamicQuiz produce { q, options, correct(str), explanation }; il
  // builder PDF legge { question, options, correctIndex }. In-app resta la forma q/correct.
  function _toPrintItems(items) {
    return (items || []).map(it => {
      const opts = Array.isArray(it.options) ? it.options : [];
      let ci = -1;
      const corr = String(it.correct == null ? '' : it.correct).trim().toLowerCase();
      for (let i = 0; i < opts.length; i++) { if (String(opts[i]).trim().toLowerCase() === corr) { ci = i; break; } }
      if (ci < 0) { const nn = parseInt(it.correct, 10); if (!isNaN(nn) && nn >= 1 && nn <= opts.length) ci = nn - 1; }
      return { question: it.q || it.question || '', options: opts, correctIndex: ci, explanation: it.explanation || '', answer: it.correct };
    });
  }
  function _flashToPrintItems(items) {
    return (items || []).map(it => ({ question: it.front || it.q || '', answer: it.back || it.correct || '', explanation: '' }));
  }

  // ── IPC helpers ─────────────────────────────────────────────────────────
  async function _mapsBase() { const info = await window.electronAPI.filesRootGet(); return info.mapsBaseDir; }
  async function _writeManifest(vaultPath, manifest) {
    return window.electronAPI.saveVaultFile({ vaultPath, relPath: 'pipeline.json', text: JSON.stringify(manifest, null, 2) });
  }
  function _recordFile(manifest, step, relPath) {
    const m = JSON.parse(JSON.stringify(manifest));
    m.steps[step].files = (m.steps[step].files || []).concat([relPath]);
    m.updatedAt = _now();
    return m;
  }
  function _blobToB64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // Cartella vault della mappa dentro il contenitore di classe, con suffisso su collisione.
  async function _resolveFolderPath(cls) {
    const base = await _mapsBase();
    const classFolder = cls ? FC().mapClassFolder(cls.sede, cls.name) : FC().classFolder('');
    const vaultName = FC().vaultFolderName(_state().rootNodeLabel);
    let siblings = [];
    try {
      const all = await window.electronAPI.getAllVaults();
      siblings = (all || []).filter(v => v.classDir === classFolder).map(v => v.folderName);
    } catch (e) { siblings = []; }
    let finalName = vaultName;
    if (siblings.indexOf(vaultName) >= 0) {
      const seq = FC().sessionSeq(siblings, vaultName, ' · ');
      const n = Math.max(2, (seq.maxSeq || 0) + 1);
      finalName = vaultName + ' · ' + String(n).padStart(2, '0');
    }
    return base + '/' + classFolder + '/' + finalName;
  }

  // ── Overlay progressivo ──────────────────────────────────────────────────
  function _overlay(msg) {
    if (!window.showLoadingOverlay) return;
    if (msg === false) window.showLoadingOverlay(false);
    else window.showLoadingOverlay(true, msg);
  }
  function _setContext(sub) { if (window.MappAIUsage) window.MappAIUsage.setContext('pipeline', sub); }

  // ══════════════════════════════════════════════════════════════════════
  // STEP B — quiz / flashcard per ramo, un set (e un PDF) per tipo
  // ══════════════════════════════════════════════════════════════════════
  async function _genFlashcards(material, nodeLabel, quantity, apiKey) {
    const nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
    const prompt = window.fillPromptTemplate('FLASHCARD_GENERATOR', { quantity, nodeLabel, nonce });
    const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } };
    let payload = { contents: [{ parts: [{ text: prompt + '\n\nMateriale:\n' + material }] }], generationConfig: { temperature: window.QUIZ_TEMPERATURE || 0.7, responseMimeType: 'application/json', responseSchema: schema, _respectTemp: true } };
    if (window.injectClassTuning) payload = window.injectClassTuning(payload);
    const resp = await window.fetchModelAPI(payload, apiKey);
    const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content.parts[0].text || '';
    const arr = window.salvageTruncatedJSON(raw.split('```json').join('').split('```').join('').trim());
    return Array.isArray(arr) ? arr : [];
  }

  const _QT = {
    mc: { quizType: 'Scelta multipla con 3 opzioni brevi e plausibili, una sola corretta', kind: 'quiz_mc', sub: 'quiz_mc', mode: 'quiz', typeLabel: 'Scelta Multipla' },
    tf: { quizType: 'Vero o Falso — ogni domanda è un\'AFFERMAZIONE da valutare; il campo "correct" vale "Vero" oppure "Falso"', kind: 'quiz_tf', sub: 'quiz_tf', mode: 'quiz', typeLabel: 'Vero o Falso' },
    flashcards: { kind: 'flashcards', sub: 'flashcards', mode: 'flashcard', typeLabel: 'Flashcard' }
  };

  async function _stepB(vaultPath, manifest, config, apiKey, counter) {
    manifest = PC().stepTransition(manifest, 'B', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      const branches = _branchNodes();
      const mapName = _mapName();
      const types = (config.quiz.types || []).filter(t => _QT[t]);
      const perBranch = Math.max(1, config.quiz.perBranch || 3);
      const angle = config.quiz.angle || 'auto';
      for (let ti = 0; ti < types.length; ti++) {
        const t = types[ti];
        const spec = _QT[t];
        _setContext(spec.sub);
        _overlay(_t('mp_step_b', 'Genero i quiz…') + ' (' + spec.typeLabel + ')');
        const raw = [];
        for (let bi = 0; bi < branches.length; bi++) {
          const b = branches[bi];
          const material = _branchMaterial(b);
          if (!material.trim()) continue;
          counter.calls++;
          if (t === 'flashcards') {
            const items = await _genFlashcards(material, _clean(b.label), perBranch, apiKey);
            items.forEach(it => raw.push(it));
          } else {
            const items = await window.generateDynamicQuiz({ nodeLabel: _clean(b.label), material, quizType: spec.quizType, quantity: perBranch, angle, apiKey, usageCat: 'pipeline', usageSub: spec.sub });
            (items || []).forEach(it => raw.push(it));
          }
        }
        if (!raw.length) continue;   // tipo senza risultati: salta, non fallisce lo step
        // Set in-app (forma q/correct o front/back) + persistenza vault
        const setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const setTitle = mapName + ' — ' + spec.typeLabel;
        const set = { id: setId, title: setTitle, mode: spec.mode, type: spec.typeLabel, items: raw, angle, quantity: perBranch, date: _now(), _pipeline: true };
        _state().db.studySets = _state().db.studySets || [];
        _state().db.studySets.push(set);
        // PDF (forma stampabile)
        const printItems = (t === 'flashcards') ? _flashToPrintItems(raw) : _toPrintItems(raw);
        const printSet = { title: setTitle, items: printItems };
        const html = (t === 'flashcards')
          ? window.buildFlashcardSetHtml(printSet, { mapName, includeBar: false })
          : window.buildQuizSetHtml(printSet, { mapName, includeBar: false });
        const pdf = await window.electronAPI.htmlToPdf({ html, options: { landscape: false } });
        if (!pdf || !pdf.ok) throw new Error('PDF quiz non generato: ' + ((pdf && pdf.error) || '?'));
        const v = PC().validatePdfB64(pdf.base64);
        if (!v.ok) throw new Error('Quiz ' + spec.typeLabel + ': ' + v.error);
        const fileName = PC().buildFileName(spec.kind, mapName, config.tuned);
        const rel = 'Materiale Studio/' + fileName;
        const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
        if (!w || !w.ok) throw new Error('Scrittura quiz fallita: ' + ((w && w.error) || '?'));
        manifest = _recordFile(manifest, 'B', rel);
        await _writeManifest(vaultPath, manifest);
      }
      // Ri-salva il vault: i set persistono nel mapData.studySets
      try { await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() }); } catch (e) { /* best-effort */ }
      if (window.renderStudySets) { try { window.renderStudySets(); } catch (e) {} }
      manifest = PC().stepTransition(manifest, 'B', 'done', { now: _now(), calls: counter.calls });
    } catch (e) {
      manifest = PC().stepTransition(manifest, 'B', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP C — fogli nodi, un PDF per modo selezionato
  // ══════════════════════════════════════════════════════════════════════
  async function _stepC(vaultPath, manifest, config) {
    manifest = PC().stepTransition(manifest, 'C', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      const ns = config.nodesheet;
      let modes = (ns.modes || []).slice();
      if (ns.fmt === '3x4') modes = ['title'];   // vincolo motore: 3x4 = solo titolo
      modes = modes.filter((m, i) => modes.indexOf(m) === i);
      if (!modes.length) modes = ['title'];
      _setContext('nodesheet');
      for (let i = 0; i < modes.length; i++) {
        const layout = modes[i];
        _overlay(_t('mp_step_c', 'Preparo i fogli nodi…') + ' (' + layout + ')');
        const res = await window.printAllNodeLabels({
          depth: ns.maxLevel || 'all',
          fmt: ns.fmt || '2x2',
          layout,
          bg: 'none',
          tuned: !!config.tuned,
          causal: !!ns.causal,
          toDisk: { vaultPath }
        });
        if (!res || !res.ok) throw new Error('Foglio nodi (' + layout + ') non generato');
        const v = PC().validatePdfB64(res.base64);
        if (!v.ok) throw new Error('Foglio nodi (' + layout + '): ' + v.error);
        const fileName = PC().buildFileName('nodesheet', layout, config.tuned);
        const rel = 'Materiale Studio/' + fileName;
        const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: res.base64 });
        if (!w || !w.ok) throw new Error('Scrittura foglio nodi fallita: ' + ((w && w.error) || '?'));
        manifest = _recordFile(manifest, 'C', rel);
        await _writeManifest(vaultPath, manifest);
      }
      manifest = PC().stepTransition(manifest, 'C', 'done', { now: _now() });
    } catch (e) {
      manifest = PC().stepTransition(manifest, 'C', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP D — sintesi mappa intera (HTML) + voce naturale (MP3, degradabile)
  // ══════════════════════════════════════════════════════════════════════
  async function _stepD(vaultPath, manifest, config, apiKey) {
    manifest = PC().stepTransition(manifest, 'D', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      _setContext('synthesis');
      _overlay(_t('mp_step_d', 'Scrivo la sintesi…'));
      const data = await window.MappAISynthesis.runWholeMap({ apiKey, tuned: !!config.tuned, silent: true });
      const v = PC().validateSynthesis(data);
      if (!v.ok) throw new Error('Sintesi: ' + v.error);
      const html = window.MappAISynthesis.buildHtml(data);
      const htmlName = PC().buildFileName('synthesis', null, config.tuned);
      const relHtml = 'Materiale Studio/' + htmlName;
      const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: relHtml, text: html });
      if (!w || !w.ok) throw new Error('Scrittura sintesi fallita: ' + ((w && w.error) || '?'));
      manifest = _recordFile(manifest, 'D', relHtml);
      await _writeManifest(vaultPath, manifest);
      // Voce: degradabile (FR-006) → fallimento = nota, NON step failed.
      if (config.synthesis.audio) {
        try {
          _setContext('tts');
          _overlay(_t('mp_step_d_audio', 'Genero la voce naturale…'));
          const audio = await window.MappAISynthesis.generateAudio(data);
          const b64 = await _blobToB64(audio.blob);
          const relAudio = 'Materiale Studio/' + PC().buildFileName('tts', null, false);
          const wa = await window.electronAPI.saveVaultFile({ vaultPath, relPath: relAudio, base64: b64 });
          if (wa && wa.ok) { manifest = _recordFile(manifest, 'D', relAudio); await _writeManifest(vaultPath, manifest); }
          else throw new Error((wa && wa.error) || 'scrittura audio');
        } catch (ae) {
          manifest.steps.D.audioNote = 'voce non generata: ' + (ae.message || ae);
          _toast(_t('mp_audio_degraded', 'Sintesi salvata; voce non generata (' + (ae.message || ae) + ')'), 'warning');
        }
      }
      manifest = PC().stepTransition(manifest, 'D', 'done', { now: _now() });
    } catch (e) {
      manifest = PC().stepTransition(manifest, 'D', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Orchestratore
  // ══════════════════════════════════════════════════════════════════════
  // opts: { only?: ['B','C','D'] per Riprova; vaultPath?, manifest? per ripresa }
  Pipeline.run = async function (config, opts) {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    opts = opts || {};
    Pipeline._running = true;
    const counter = { calls: 0 };
    try {
      const cls = config.classId ? (window.MappAIClasses && window.MappAIClasses.get(config.classId)) : null;
      config.className = cls ? cls.name : (config.className || '');
      config.sede = cls ? (cls.sede || '') : '';
      const apiKey = window.getSystemKey ? window.getSystemKey() : '';
      if (!apiKey) throw new Error(_t('tst_need_key', "Inserisci un'API Key per continuare"));

      let vaultPath = opts.vaultPath || null;
      let manifest = opts.manifest || null;

      // ── STEP A (salta se si sta riprendendo / riprovando singoli step) ──
      const doA = !opts.only;
      if (doA) {
        _overlay(_t('mp_step_a', 'Genero la mappa…'));
        _setContext('map');
        const lt = document.getElementById('level-tune-toggle');
        if (lt) lt.checked = !!config.levelTuned;
        await window.startGeneration();
        const mv = PC().validateMapResult(_state().db);
        if (!mv.ok) throw new Error(_t('mp_map_fail', 'Mappa non valida: ') + mv.error);
        vaultPath = await _resolveFolderPath(cls);
        const sr = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
        if (!sr || !sr.success) throw new Error(_t('mp_vault_fail', 'Salvataggio vault fallito'));
        _state().activeVaultPath = vaultPath;
        manifest = PC().createManifest(config, { now: _now(), vaultPath });
        manifest = PC().stepTransition(manifest, 'A', 'running', { now: _now() });
        await _writeManifest(vaultPath, manifest);
        manifest = PC().stepTransition(manifest, 'A', 'done', { now: _now() });
        await _writeManifest(vaultPath, manifest);
      }
      if (!vaultPath || !manifest) throw new Error('Stato pipeline incompleto');

      const wants = function (s) { return !opts.only || opts.only.indexOf(s) >= 0; };
      // Un tentativo su uno step failed → resettalo a running via failed→running dentro _stepX.
      if (config.quiz && wants('B') && manifest.steps.B.status !== 'done') manifest = await _stepB(vaultPath, manifest, config, apiKey, counter);
      if (config.nodesheet && wants('C') && manifest.steps.C.status !== 'done') manifest = await _stepC(vaultPath, manifest, config);
      if (config.synthesis && wants('D') && manifest.steps.D.status !== 'done') manifest = await _stepD(vaultPath, manifest, config, apiKey);

      // Rendi i set quiz/flashcard accessibili SUBITO dalla pagina Insegna
      // (indice mappai_studysets_index + progetto) senza attendere un autosave:
      // il docente li trova pronti sia a mappa aperta sia in Insegna (openSet).
      try { if (window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { /* best-effort */ }
      if (window.MappAITeach && window.MappAITeach.refresh) { try { window.MappAITeach.refresh(); } catch (e) {} }

      _overlay(false);
      _openSummary(vaultPath, manifest, config);
    } catch (err) {
      _overlay(false);
      _toast(_t('mp_error', 'Pipeline interrotta: ') + (err.message || err), 'error');
      console.error('[MappAIPipeline]', err);
    } finally {
      Pipeline._running = false;
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Modale di configurazione
  // ══════════════════════════════════════════════════════════════════════
  function _classOptions() {
    const list = (window.MappAIClasses && window.MappAIClasses.list) ? window.MappAIClasses.list() : [];
    const active = (window.MappAIClasses && window.MappAIClasses.getActive) ? window.MappAIClasses.getActive() : null;
    let html = '<option value="">' + _esc(_t('mp_no_class', 'Senza classe')) + '</option>';
    list.forEach(c => {
      const sel = (active && active.id === c.id) ? ' selected' : '';
      const sede = c.sede ? (' · ' + _esc(c.sede)) : '';
      html += '<option value="' + _esc(c.id) + '"' + sel + '>' + _esc(c.name) + sede + '</option>';
    });
    return html;
  }
  function _levelOptions() {
    const nodes = (_state().db && _state().db.nodes) || [];
    let maxLv = 0; nodes.forEach(n => { if ((n.level || 0) > maxLv) maxLv = (n.level || 0); });
    let html = '<option value="all" selected>' + _esc(_t('mp_all_levels', 'Tutti i livelli')) + '</option>';
    for (let lv = 1; lv <= Math.min(maxLv, 5); lv++) html += '<option value="' + lv + '">' + _esc(_t('mp_upto_level', 'Fino al livello')) + ' ' + lv + '</option>';
    return html;
  }

  // ── Preset (US3) — localStorage 'mappai_material_presets', mai la classe ──
  function _presetKey() { return 'mappai_material_presets'; }
  function _loadPresets() {
    try { const a = JSON.parse(localStorage.getItem(_presetKey()) || '[]'); return Array.isArray(a) ? a.map(p => PC().presetNormalize(p)) : []; }
    catch (e) { return []; }
  }
  function _savePresets(list) { try { localStorage.setItem(_presetKey(), JSON.stringify(list)); } catch (e) {} }
  function _presetOptions() {
    const list = _loadPresets();
    if (!list.length) return '<option value="">' + _esc(_t('mp_no_presets', 'Nessun preset salvato')) + '</option>';
    return list.map(p => '<option value="' + _esc(p.id) + '">' + _esc(p.name) + '</option>').join('');
  }
  function _refreshPresetSelect() { const s = document.getElementById('mp-preset'); if (s) s.innerHTML = _presetOptions(); }

  Pipeline._applyPreset = function () {
    const s = document.getElementById('mp-preset');
    if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const p = _loadPresets().filter(x => x.id === s.value)[0]; if (!p) return;
    const o = p.options || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };
    const val = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
    set('mp-quiz-on', !!o.quiz);
    if (o.quiz) { set('mp-qt-mc', o.quiz.types.indexOf('mc') >= 0); set('mp-qt-tf', o.quiz.types.indexOf('tf') >= 0); set('mp-qt-fc', o.quiz.types.indexOf('flashcards') >= 0); val('mp-perbranch', o.quiz.perBranch); val('mp-angle', o.quiz.angle); }
    set('mp-ns-on', !!o.nodesheet);
    if (o.nodesheet) { val('mp-ns-level', o.nodesheet.maxLevel === 'all' ? 'all' : String(o.nodesheet.maxLevel)); val('mp-ns-fmt', o.nodesheet.fmt); set('mp-ns-title', o.nodesheet.modes.indexOf('title') >= 0); set('mp-ns-keywords', o.nodesheet.modes.indexOf('keywords') >= 0); set('mp-ns-summary', o.nodesheet.modes.indexOf('summary') >= 0); set('mp-ns-card', o.nodesheet.modes.indexOf('card') >= 0); set('mp-ns-causal', o.nodesheet.causal); }
    set('mp-syn-on', !!o.synthesis);
    if (o.synthesis) set('mp-syn-audio', o.synthesis.audio);
    set('mp-tuned', o.tuned); set('mp-leveltuned', o.levelTuned);
    _syncSections(); Pipeline._reestimate();
    _toast(_t('mp_applied', 'Preset applicato: ') + p.name, 'success');
  };

  Pipeline._savePreset = function () {
    const cfg = _readConfig(); if (!cfg) return;
    if (!cfg.quiz && !cfg.nodesheet && !cfg.synthesis) { _toast(_t('mp_pick_one', 'Attiva almeno una sezione di output.'), 'warning'); return; }
    let name = window.prompt ? window.prompt(_t('mp_preset_name', 'Nome del preset:'), '') : '';
    if (name == null) return;
    name = String(name).trim();
    if (!name) { _toast(_t('mp_preset_noname', 'Serve un nome per il preset'), 'warning'); return; }
    let list = _loadPresets();
    list = PC().presetListPush(list, { name, createdAt: _now(), options: PC().presetFromConfig(cfg) }, 50);
    _savePresets(list); _refreshPresetSelect();
    _toast(_t('mp_preset_saved', 'Preset salvato'), 'success');
  };

  Pipeline._deletePreset = function () {
    const s = document.getElementById('mp-preset'); if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const list = _loadPresets().filter(x => x.id !== s.value);
    _savePresets(list); _refreshPresetSelect();
    _toast(_t('mp_preset_deleted', 'Preset eliminato'), 'info');
  };

  Pipeline.openModal = function () {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    if (!_state().sources || !_state().sources.length) {
      _toast(_t('mp_need_source', 'Carica almeno una fonte prima di generare i materiali'), 'warning');
      return;
    }
    const old = document.getElementById('mp-modal'); if (old) old.remove();
    const chk = (id, label, checked) => '<label class="pm-option" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:#4f46e5"><span class="pm-option-label" style="margin:0">' + _esc(label) + '</span></label>';

    const modal = document.createElement('div');
    modal.id = 'mp-modal';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[94vw] max-w-[720px] max-h-[92vh] overflow-y-auto p-7 relative">' +
        '<button type="button" id="mp-close" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>' +
        '<div class="flex items-center gap-3 mb-1"><div class="pm-icon-wrap"><i data-lucide="package" class="w-5 h-5 text-indigo-600"></i></div>' +
          '<div><div class="pm-title">' + _esc(_t('mp_title', 'Genera materiali')) + '</div>' +
          '<div class="pm-subtitle">' + _esc(_t('mp_subtitle', 'Mappa + quiz + fogli nodi + sintesi, archiviati nel vault')) + '</div></div></div>' +
        // Classe
        '<div class="pm-section" style="margin-top:16px"><span class="pm-section-title">' + _esc(_t('mp_class', 'Classe destinataria')) + '</span>' +
          '<select id="mp-class" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700">' + _classOptions() + '</select></div>' +
        // Preset (US3): configurazioni riusabili, senza classe
        '<div class="pm-section" style="margin-top:12px"><span class="pm-section-title">' + _esc(_t('mp_presets', 'Preset')) + '</span>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<select id="mp-preset" style="flex:1;min-width:150px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px">' + _presetOptions() + '</select>' +
            '<button type="button" id="mp-preset-apply" class="pm-btn-cancel" style="padding:5px 10px;font-size:11px">' + _esc(_t('mp_apply', 'Applica')) + '</button>' +
            '<button type="button" id="mp-preset-save" class="pm-btn-cancel" style="padding:5px 10px;font-size:11px">' + _esc(_t('mp_save', 'Salva')) + '</button>' +
            '<button type="button" id="mp-preset-del" class="pm-btn-cancel" style="padding:5px 10px;font-size:11px">' + _esc(_t('mp_delete', 'Elimina')) + '</button>' +
          '</div></div>' +
        // Quiz
        '<div class="pm-section" style="margin-top:14px">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="mp-quiz-on" checked style="width:16px;height:16px;accent-color:#4f46e5"><span class="pm-section-title" style="margin:0">' + _esc(_t('mp_quiz', 'Quiz e flashcard')) + '</span></label>' +
          '<div id="mp-quiz-body" style="margin-top:8px;padding-left:6px">' +
            '<div style="display:flex;gap:14px;flex-wrap:wrap">' + chk('mp-qt-mc', _t('mp_qt_mc', 'Scelta multipla'), true) + chk('mp-qt-tf', _t('mp_qt_tf', 'Vero/Falso'), false) + chk('mp-qt-fc', _t('mp_qt_fc', 'Flashcard'), false) + '</div>' +
            '<div style="display:flex;gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap">' +
              '<label class="pm-option-desc" style="display:flex;align-items:center;gap:6px">' + _esc(_t('mp_perbranch', 'Per ramo')) + ' <input type="number" id="mp-perbranch" min="1" max="10" value="3" style="width:52px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px"></label>' +
              '<label class="pm-option-desc" style="display:flex;align-items:center;gap:6px">' + _esc(_t('mp_angle', 'Angolo')) + ' <select id="mp-angle" style="padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px">' + (window.buildQuizAngleOptions ? window.buildQuizAngleOptions('auto') : '<option value="auto">auto</option>') + '</select></label>' +
            '</div></div></div>' +
        // Foglio nodi
        '<div class="pm-section" style="margin-top:14px">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="mp-ns-on" checked style="width:16px;height:16px;accent-color:#4f46e5"><span class="pm-section-title" style="margin:0">' + _esc(_t('mp_nodesheet', 'Fogli nodi')) + '</span></label>' +
          '<div id="mp-ns-body" style="margin-top:8px;padding-left:6px">' +
            '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
              '<label class="pm-option-desc" style="display:flex;align-items:center;gap:6px">' + _esc(_t('mp_level', 'Livello')) + ' <select id="mp-ns-level" style="padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px">' + _levelOptions() + '</select></label>' +
              '<label class="pm-option-desc" style="display:flex;align-items:center;gap:6px">' + _esc(_t('mp_fmt', 'Formato')) + ' <select id="mp-ns-fmt" style="padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px"><option value="3x4">3×4</option><option value="2x2" selected>2×2</option><option value="2x1">2×1</option></select></label>' +
            '</div>' +
            '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">' + chk('mp-ns-title', _t('mp_mode_title', 'Titolo'), true) + chk('mp-ns-keywords', _t('mp_mode_kw', 'Parole chiave'), false) + chk('mp-ns-summary', _t('mp_mode_summary', 'Da completare'), false) + chk('mp-ns-card', _t('mp_mode_card', 'Scheda'), false) + '</div>' +
            '<div style="margin-top:8px">' + chk('mp-ns-causal', _t('mp_causal', 'Includi «Catena dei perché»'), false) + '</div></div></div>' +
        // Sintesi
        '<div class="pm-section" style="margin-top:14px">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="mp-syn-on" checked style="width:16px;height:16px;accent-color:#4f46e5"><span class="pm-section-title" style="margin:0">' + _esc(_t('mp_synthesis', 'Sintesi della mappa')) + '</span></label>' +
          '<div id="mp-syn-body" style="margin-top:8px;padding-left:6px">' + chk('mp-syn-audio', _t('mp_audio', 'Voce naturale (audio MP3)'), false) + '</div></div>' +
        // Taratura
        '<div class="pm-section" style="margin-top:14px;display:flex;gap:18px;flex-wrap:wrap">' +
          chk('mp-tuned', _t('mp_tuned', 'Taratura AI [VERDE]'), false) + chk('mp-leveltuned', _t('mp_leveltuned', 'Adatta la mappa al livello'), false) + '</div>' +
        // Footer
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9">' +
          '<div id="mp-estimate" class="pm-option-desc" style="margin-bottom:10px"></div>' +
          '<div class="flex gap-3"><button type="button" id="mp-cancel" class="pm-btn-cancel">' + _esc(_t('ui_cancel', 'Annulla')) + '</button>' +
          '<button type="button" id="mp-start" class="pm-btn-primary" style="flex:1;justify-content:center"><i data-lucide="play" class="w-4 h-4"></i> ' + _esc(_t('mp_start', 'Avvia')) + '</button></div></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();

    modal.querySelector('#mp-close').onclick = () => modal.remove();
    modal.querySelector('#mp-cancel').onclick = () => modal.remove();
    modal.querySelector('#mp-start').onclick = () => Pipeline._startFromModal();
    modal.querySelector('#mp-preset-apply').onclick = () => Pipeline._applyPreset();
    modal.querySelector('#mp-preset-save').onclick = () => Pipeline._savePreset();
    modal.querySelector('#mp-preset-del').onclick = () => Pipeline._deletePreset();
    modal.addEventListener('change', () => { _syncSections(); Pipeline._reestimate(); });
    modal.addEventListener('input', () => Pipeline._reestimate());
    const esc = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    _syncSections();
    Pipeline._reestimate();
  };

  function _syncSections() {
    const on = (id) => { const e = document.getElementById(id); return e ? e.checked : false; };
    const body = (id, vis) => { const e = document.getElementById(id); if (e) e.style.display = vis ? '' : 'none'; };
    body('mp-quiz-body', on('mp-quiz-on'));
    body('mp-ns-body', on('mp-ns-on'));
    body('mp-syn-body', on('mp-syn-on'));
  }

  // Legge la config dal modale (null se il modale non è aperto).
  function _readConfig() {
    const g = (id) => document.getElementById(id);
    if (!g('mp-modal')) return null;
    const on = (id) => g(id) && g(id).checked;
    const cfg = { classId: (g('mp-class') && g('mp-class').value) || '', tuned: !!on('mp-tuned'), levelTuned: !!on('mp-leveltuned') };
    if (on('mp-quiz-on')) {
      const types = [];
      if (on('mp-qt-mc')) types.push('mc');
      if (on('mp-qt-tf')) types.push('tf');
      if (on('mp-qt-fc')) types.push('flashcards');
      if (types.length) cfg.quiz = { types, perBranch: Math.max(1, Math.min(10, parseInt(g('mp-perbranch').value, 10) || 3)), angle: (g('mp-angle') && g('mp-angle').value) || 'auto' };
    }
    if (on('mp-ns-on')) {
      const modes = [];
      if (on('mp-ns-title')) modes.push('title');
      if (on('mp-ns-keywords')) modes.push('keywords');
      if (on('mp-ns-summary')) modes.push('summary');
      if (on('mp-ns-card')) modes.push('card');
      const lvRaw = g('mp-ns-level') && g('mp-ns-level').value;
      cfg.nodesheet = { maxLevel: (lvRaw === 'all' || !lvRaw) ? 'all' : parseInt(lvRaw, 10), fmt: (g('mp-ns-fmt') && g('mp-ns-fmt').value) || '2x2', modes: modes.length ? modes : ['title'], causal: !!on('mp-ns-causal') };
    }
    if (on('mp-syn-on')) cfg.synthesis = { audio: !!on('mp-syn-audio') };
    return cfg;
  }

  Pipeline._reestimate = function () {
    const el = document.getElementById('mp-estimate'); if (!el) return;
    const cfg = _readConfig(); if (!cfg) return;
    if (!cfg.quiz && !cfg.nodesheet && !cfg.synthesis) { el.innerHTML = _esc(_t('mp_pick_one', 'Attiva almeno una sezione di output.')); return; }
    const est = PC().estimateCalls(cfg, _mapStats());
    el.innerHTML = _esc(_t('mp_estimate', 'Stima chiamate AI') + ': ~' + est.total) +
      ' <span style="opacity:.6">(A ' + est.perStep.A + ' · B ' + est.perStep.B + ' · C ' + est.perStep.C + ' · D ' + est.perStep.D + ')</span>';
  };

  // Pre-flight + avvio dal modale.
  Pipeline._startFromModal = function () {
    const cfg = _readConfig();
    if (!cfg) return;
    if (!cfg.quiz && !cfg.nodesheet && !cfg.synthesis) { _toast(_t('mp_pick_one', 'Attiva almeno una sezione di output.'), 'warning'); return; }
    const apiKey = window.getSystemKey ? window.getSystemKey() : '';
    if (!apiKey) { _toast(_t('tst_need_key', "Inserisci un'API Key per continuare"), 'error'); return; }
    // Voce: richiede la chiave Google diretta → altrimenti deseleziona con avviso (FR-006).
    if (cfg.synthesis && cfg.synthesis.audio) {
      let gk = ''; try { gk = localStorage.getItem('gemini_api_key') || ''; } catch (e) {}
      if (!gk) { cfg.synthesis.audio = false; _toast(_t('mp_no_google', 'Voce naturale disattivata: serve la chiave Google (Gemini). La sintesi sarà solo testo.'), 'warning'); }
    }
    const modal = document.getElementById('mp-modal'); if (modal) modal.remove();
    Pipeline.run(cfg);
  };

  // ══════════════════════════════════════════════════════════════════════
  // Riepilogo finale + Riprova per step
  // ══════════════════════════════════════════════════════════════════════
  Pipeline._lastRun = null;
  function _stepLabel(s) {
    return { A: _t('mp_lbl_a', 'Mappa'), B: _t('mp_lbl_b', 'Quiz e flashcard'), C: _t('mp_lbl_c', 'Fogli nodi'), D: _t('mp_lbl_d', 'Sintesi') }[s] || s;
  }
  function _statusChip(st) {
    const m = { done: ['check', '#16a34a', _t('mp_done', 'fatto')], failed: ['alert-triangle', '#dc2626', _t('mp_failed', 'errore')], skipped: ['minus', '#94a3b8', _t('mp_skipped', 'saltato')], pending: ['clock', '#94a3b8', _t('mp_pending', 'in attesa')], running: ['loader', '#4f46e5', _t('mp_running', 'in corso')] };
    const c = m[st] || m.pending;
    return '<span style="display:inline-flex;align-items:center;gap:5px;color:' + c[1] + ';font-weight:700"><i data-lucide="' + c[0] + '" class="w-4 h-4"></i>' + _esc(c[2]) + '</span>';
  }

  function _openSummary(vaultPath, manifest, config) {
    Pipeline._lastRun = { vaultPath, manifest, config };
    const old = document.getElementById('mp-summary'); if (old) old.remove();
    const rows = PC().STEPS.map(s => {
      const rec = manifest.steps[s] || { status: 'skipped', files: [] };
      const nfiles = (rec.files || []).length;
      const retry = (rec.status === 'failed' && s !== 'A')
        ? '<button type="button" class="pm-btn-cancel mp-retry" data-step="' + s + '" style="padding:4px 10px;font-size:11px"><i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> ' + _esc(_t('mp_retry', 'Riprova')) + '</button>'
        : '';
      const err = rec.status === 'failed' && rec.error ? '<div class="pm-option-desc" style="color:#dc2626;margin-top:2px">' + _esc(rec.error) + '</div>' : '';
      const note = rec.audioNote ? '<div class="pm-option-desc" style="color:#b45309;margin-top:2px">' + _esc(rec.audioNote) + '</div>' : '';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">' +
        '<div><div style="font-weight:800;color:#334155;font-size:13px">' + _esc(_stepLabel(s)) + '</div>' +
        '<div class="pm-option-desc">' + (nfiles ? (nfiles + ' ' + _esc(_t('mp_files', 'file'))) : '') + '</div>' + err + note + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' + _statusChip(rec.status) + retry + '</div></div>';
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'mp-summary';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[520px] p-7 relative">' +
        '<button type="button" id="mps-close" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>' +
        '<div class="flex items-center gap-3 mb-3"><div class="pm-icon-wrap"><i data-lucide="clipboard-check" class="w-5 h-5 text-indigo-600"></i></div>' +
          '<div class="pm-title">' + _esc(_t('mp_summary', 'Materiali generati')) + '</div></div>' +
        '<div>' + rows + '</div>' +
        '<div class="flex gap-3 mt-5"><button type="button" id="mps-folder" class="pm-btn-cancel"><i data-lucide="folder-open" class="w-4 h-4"></i> ' + _esc(_t('mp_open_folder', 'Apri cartella')) + '</button>' +
        '<button type="button" id="mps-ok" class="pm-btn-primary" style="flex:1;justify-content:center">' + _esc(_t('ui_ok', 'Chiudi')) + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();
    modal.querySelector('#mps-close').onclick = () => modal.remove();
    modal.querySelector('#mps-ok').onclick = () => modal.remove();
    modal.querySelector('#mps-folder').onclick = () => { if (window.electronAPI && window.electronAPI.pipelineOpenFolder) window.electronAPI.pipelineOpenFolder({ folderPath: vaultPath }); };
    modal.querySelectorAll('.mp-retry').forEach(btn => {
      btn.onclick = () => { const step = btn.getAttribute('data-step'); modal.remove(); Pipeline.run(config, { only: [step], vaultPath, manifest }); };
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // US2 — ripresa idempotente dopo crash
  // ══════════════════════════════════════════════════════════════════════
  // Chiamata all'apertura di un vault: se pipeline.json non è tutto-done,
  // normalizza (running→failed) e propone di riprendere (salta gli step done).
  Pipeline.checkResume = async function (vaultPath) {
    try {
      if (!vaultPath || Pipeline._running) return;
      if (!(window.electronAPI && window.electronAPI.vaultMaterialsList)) return;
      const res = await window.electronAPI.vaultMaterialsList({ vaultPath });
      if (!res || !res.ok || !res.manifest) return;
      let manifest = res.manifest;
      if (!PC() || manifest.schema !== PC().SCHEMA) return;
      if (PC().isComplete(manifest)) return;   // niente da riprendere
      manifest = PC().normalizeOnLoad(manifest);   // running (crash) → failed
      _confirmResume(vaultPath, manifest);
    } catch (e) { /* silenzioso: la ripresa non deve mai bloccare il load */ }
  };

  function _confirmResume(vaultPath, manifest) {
    const old = document.getElementById('mp-resume'); if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'mp-resume';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[420px] p-6 relative">' +
        '<div class="flex items-center gap-3 mb-3"><div class="pm-icon-wrap"><i data-lucide="rotate-cw" class="w-5 h-5 text-indigo-600"></i></div>' +
        '<div class="pm-title">' + _esc(_t('mp_resume', 'Riprendi')) + '</div></div>' +
        '<p class="pm-body-text mb-4">' + _esc(_t('mp_resume_prompt', 'Questo vault ha una pipeline materiali incompleta. Riprenderla?')) + '</p>' +
        '<div class="flex gap-3"><button type="button" id="mpr-no" class="pm-btn-cancel">' + _esc(_t('ui_cancel', 'Annulla')) + '</button>' +
        '<button type="button" id="mpr-yes" class="pm-btn-primary" style="flex:1;justify-content:center"><i data-lucide="play" class="w-4 h-4"></i> ' + _esc(_t('mp_resume', 'Riprendi')) + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();
    modal.querySelector('#mpr-no').onclick = () => modal.remove();
    modal.querySelector('#mpr-yes').onclick = () => { modal.remove(); Pipeline.run(manifest.config || {}, { only: ['B', 'C', 'D'], vaultPath, manifest }); };
  }

  window.MappAIPipeline = Pipeline;
  console.log('[MappAIPipeline] orchestratore pipeline materiali caricato');
})();
