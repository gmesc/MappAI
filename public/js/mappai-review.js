/* Teacher review controller. pipeline.json owns decisions; appState is its cache. */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  const R = {};
  const core = () => window.MappAIReviewCore;
  const state = () => typeof appState !== 'undefined' ? appState : window.appState;
  const storage = () => typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;
  const clone = x => JSON.parse(JSON.stringify(x));
  const t = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const versions = new Map();
  let writes = Promise.resolve(), busy = false, committing = false;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const assertProject = vaultPath => { if (state().activeVaultPath !== vaultPath) throw new Error(t('rv_project_changed', 'Il progetto aperto è cambiato. Riapri la revisione.')); };
  R.enabled = () => { try { return localStorage.getItem('mappai_review_enabled') !== '0'; } catch (_) { return true; } };
  R.current = () => state()._pipelineManifest && state()._pipelineManifest.review;
  R.sources = () => {
    const review = R.current();
    return review ? review.sources : (state()._pipelineManifest && state()._pipelineManifest.sources) || (Array.isArray(state()._generationSources) && state()._generationSources.length ? state()._generationSources :
      state()._pdfPagine && state()._pdfPagine.length ? state()._pdfPagine : state().sources || []);
  };
  function sourceSnapshot() {
    return core().sourceSnapshot(R.sources());
  }
  R.prepareEvidence = async function (vaultPath, manifest, giro) {
    if (!giro) return;
    giro.verifica();
    const E = window.MappAIEvidence;
    if (!E || !E.acceso) {
      if (localStorage.getItem('mappai_evidence') === '1') throw new Error(t('modelli_no_index', 'Evidence non è pronto: i materiali non sono stati generati.'));
      return;
    }
    if (!E.acceso()) return;
    const sources = manifest.review ? manifest.review.sources : (manifest.sources || sourceSnapshot());
    if (!sources || !sources.length) throw new Error(t('modelli_no_sources', 'Mancano le fonti originali per Evidence. Aggiungi una fonte prima di generare i materiali.'));
    if (!manifest.review && !manifest.sources) {
      manifest.sources = sources;
      await R.writeManifest(vaultPath, manifest);
      giro.verifica();
    }
    const result = await E.suApertura(vaultPath, sources);
    giro.verifica();
    if (!E.indice() || ['errore', 'senza fonti', 'non disponibile', 'progetto cambiato'].includes(result.stato)) throw new Error(t('modelli_no_index', 'Evidence non è pronto: i materiali non sono stati generati.'));
    if (result.stato === 'non scritto' && window.showToast) window.showToast(t('modelli_index_memory', 'Indice Evidence disponibile in memoria. Verrà ricostruito dalle fonti al prossimo avvio.'), 'warning');
  };
  R.writeManifest = function (vaultPath, manifest) {
    const text = JSON.stringify(manifest, null, 2);
    const work = writes.then(async () => {
      const res = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'pipeline.json', text,
        expectedVersion: versions.has(vaultPath) ? versions.get(vaultPath) : manifest._storageVersion || 0 });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Salvataggio revisione non riuscito');
      manifest._storageVersion = res.version;
      versions.set(vaultPath, res.version);
      if (state().activeVaultPath === vaultPath) state()._pipelineManifest = manifest;
      return res;
    });
    writes = work.catch(() => {});
    return work;
  };
  R.persistQuality = async function (vaultPath) {
    const s = state();
    const data = { schema: 'mappai-qualita@2', quando: new Date().toISOString(),
      generationId: s._generationId, modello: (s.generationUsage || {}).usedModel || '',
      ancora: s._qualityReport || null, copertura: s._coverageReport || null,
      giudice: s._judgeReport || s._giudiceReport || null,
      // l'esito del reranker (16/9/26): chiudendo l'app spariva, e con lui la prova che fosse partito
      reranker: s._rerankerReport || null };
    const res = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'qualita.json', text: JSON.stringify(data, null, 2) });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Rapporto non salvato');
  };
  R.checkpoint = async function (vaultPath, manifest) {
    if (!R.enabled() && !manifest.review) return manifest;
    if (!manifest.review) {
      const s = state();
      manifest.review = core().createReview({ db: s.db, sources: sourceSnapshot(),
        report: s._judgeReport || s._giudiceReport || {}, generationId: s._generationId,
        projectId: storage() && storage().currentProjectId,
        vaultPath, config: manifest.config });
      state()._reviewRevision = manifest.review.baseRevision;
      await R.persistQuality(vaultPath);
      await R.writeManifest(vaultPath, manifest);
    }
    state()._pipelineManifest = manifest;
    return manifest;
  };
  function applySnapshot(db, snapshot) {
    const byId = new Map((db.nodes || []).map(n => [String(n.id), n]));
    db.nodes = (snapshot.nodes || []).map(n => {
      const old = byId.get(String(n.id)) || {}, next = Object.assign({}, old);
      ['parent', 'parentId', 'ambito', 'confini', 'rel', 'level', 'group', 'chunks'].forEach(k => { delete next[k]; });
      Object.assign(next, clone(n)); next.content = next.desc;
      if (old.desc !== next.desc || old.label !== next.label) {
        next.hasCustomText = true;
        if (!own(next, 'aiDesc')) next.aiDesc = old.desc || old.content || '';
      }
      return next;
    });
    db.links = clone(snapshot.links || []);
    db.sourcesDict = clone(snapshot.sourcesDict || {});
  }
  function cache() {
    const sm = storage(); if (sm && sm.saveCurrentProject) sm.saveCurrentProject();
  }
  R.restore = async function (vaultPath, manifest, opts) {
    opts = opts || {};
    if (state().activeVaultPath !== vaultPath) return false;
    delete state()._reviewCommit;
    if (!manifest || !manifest.review) { state()._pipelineManifest = manifest || null; state()._reviewRevision = undefined; delete state()._generationSources; return false; }
    const r = manifest.review;
    if (r.schema !== core().SCHEMA || !r.initial) throw new Error(t('rv_invalid_review', 'La revisione salvata non è leggibile. I contenuti sono conservati.'));
    versions.set(vaultPath, manifest._storageVersion || 0);
    const expected = r.initial.status === 'approved' ? r.approvedRevision : r.baseRevision;
    if (opts.fromCache) {
      const loaded = opts.diskData ? { success: true, data: opts.diskData } : await window.electronAPI.loadVault(vaultPath);
      assertProject(vaultPath);
      if (!loaded || !loaded.success) throw new Error(t('rv_restore_failed', 'Impossibile riconciliare cache e cartella.'));
      const differs = core().revision(state().db, r.sources) !== core().revision(loaded.data, r.sources);
      if (differs) {
        state()._reviewLocalDraft = { vaultPath, db: core().semanticSnapshot(state().db), when: new Date().toISOString() };
        state()._reviewDiskDraft = { vaultPath, db: core().semanticSnapshot(loaded.data), when: new Date().toISOString() };
      }
      // A current-token cache may be an intentional teacher draft. Preserve it;
      // only an older commit token selects disk automatically. Both copies remain recoverable.
      if (state()._reviewRevision !== expected) {
        state().db.nodes = loaded.data.nodes;
        state().db.links = loaded.data.links;
      }
      // Original passages come from the folder. A differing local citation
      // remains in _reviewLocalDraft, not silently promoted over the saved source.
      state().db.sourcesDict = clone(loaded.data.sourcesDict || {});
      const diskNodes = new Map((loaded.data.nodes || []).map(n => [String(n.id), n]));
      (state().db.nodes || []).forEach(n => {
        const diskNode = diskNodes.get(String(n.id));
        if (diskNode) { if (own(diskNode, 'chunks')) n.chunks = clone(diskNode.chunks); else delete n.chunks; }
      });
    }
    state()._pipelineManifest = manifest;
    state()._reviewRevision = expected;
    // sourcesDict is read from the actual vault/cache. Replacing it with an old
    // approval snapshot would silently undo source corrections made afterwards.
    if (r.initial.status === 'applying') {
      await commit(vaultPath, manifest, { review: r, db: Object.assign({}, state().db, clone(r.approvedSnapshot)) });
    }
    if (manifest.review.final && manifest.review.final.review && manifest.review.final.review.initial.status === 'applying') {
      await approveFinal(vaultPath, manifest, { review: manifest.review.final.review, db: { items: manifest.review.final.items } });
    }
    cache();
    // L’attesa richiesta da B2 avviene prima dei materiali, in prepareEvidence.
    if (window.MappAIEvidence && window.MappAIEvidence.suApertura) window.MappAIEvidence.suApertura(vaultPath);
    return true;
  };
  async function commit(vaultPath, manifest, result) {
    assertProject(vaultPath);
    manifest.review = result.review;
    await R.writeManifest(vaultPath, manifest); // applying is durable BEFORE any map write
    assertProject(vaultPath);
    state()._reviewRevision = result.review.baseRevision;
    state()._reviewCommit = result.review.approvedRevision;
    applySnapshot(state().db, result.review.approvedSnapshot);
    const saved = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
    assertProject(vaultPath);
    if (!saved || !saved.success) throw new Error((saved && saved.error) || 'Mappa non salvata');
    const persisted = await window.electronAPI.loadVault(vaultPath);
    assertProject(vaultPath);
    if (!persisted || !persisted.success) throw new Error('Verifica della mappa salvata non riuscita');
    manifest.review = core().completeApproval(result.review, core().revision(persisted.data, result.review.sources));
    await R.writeManifest(vaultPath, manifest);
    state()._reviewRevision = manifest.review.approvedRevision;
    delete state()._reviewCommit;
    cache();
    if (window.renderGraph) window.renderGraph();
  }
  R.commit = commit;
  async function readManifest(vaultPath) {
    if (window.electronAPI.readVaultFile) {
      const res = await window.electronAPI.readVaultFile({ vaultPath, relPath: 'pipeline.json' });
      if (!res || !res.ok) throw new Error(t('rv_readback_failed', 'Impossibile verificare le decisioni salvate.'));
      const text = res.text != null ? res.text : new TextDecoder().decode(Uint8Array.from(atob(res.base64), c => c.charCodeAt(0)));
      return JSON.parse(text);
    }
    const res = await window.electronAPI.vaultMaterialsList({ vaultPath });
    if (!res || !res.manifest) throw new Error(t('rv_readback_failed', 'Impossibile verificare le decisioni salvate.'));
    return res.manifest;
  }
  function validateFinal(items) {
    const validator = window.MappAIMaterialReview;
    if (!validator || typeof validator.validate !== 'function') throw new Error(t('rv_validator_missing', 'Il controllo dei campi non è disponibile. Le bozze sono conservate.'));
    const result = validator.validate(items);
    const issues = Array.isArray(result) ? result : result && result.issues || [];
    if (!result || result.ok === false || issues.length) {
      const error = new Error(t('rv_structure_invalid', 'Correggi o escludi gli elementi con campi non validi prima di completare i materiali.'));
      error.issues = issues; throw error;
    }
  }
  async function approveFinal(vaultPath, manifest, result) {
    assertProject(vaultPath); validateFinal(result.db.items);
    manifest.review.final.items = clone(result.db.items);
    manifest.review.final.review = result.review;
    manifest.review.final.stage = 'applying';
    await R.writeManifest(vaultPath, manifest);
    const disk = await readManifest(vaultPath); assertProject(vaultPath);
    const saved = disk.review && disk.review.final;
    if (!saved || !Array.isArray(saved.items)) throw new Error(t('rv_readback_failed', 'Impossibile verificare le decisioni salvate.'));
    manifest.review.final.review = core().completeApproval(result.review, core().revision({ items: saved.items }, result.review.sources));
    manifest.review.final.stage = 'approved';
    await R.writeManifest(vaultPath, manifest); cache();
  }
  R.approve = async function (vaultPath, manifest, opts) {
    opts = opts || {};
    if (committing) throw new Error(t('rv_busy', 'Attendi il salvataggio in corso.'));
    committing = true;
    try {
      assertProject(vaultPath);
      const r = opts.final ? manifest.review.final.review : manifest.review;
      const db = opts.final ? { items: manifest.review.final.items } : state().db;
      if (r.initial.status === 'approved') {
        if (!core().gate(r, db, r.sources).allowed) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
        if (opts.final) validateFinal(db.items);
        return manifest;
      }
      const result = core().beginApproval(r, db, { sources: r.sources, manualReview: opts.manualReview === true });
      if (!result.ok) throw new Error(result.unresolved.length ? t('rv_unresolved', 'Decidi le questioni ancora aperte prima di continuare.') : t('rv_conflict', 'Il contenuto è cambiato o il controllo è incompleto: verifica la revisione.'));
      if (opts.final) await approveFinal(vaultPath, manifest, result);
      else await commit(vaultPath, manifest, result);
      return manifest;
    } finally { committing = false; }
  };
  R.isBusy = () => busy || committing;
  // An open review keeps its base map intact. The editor adds a teacher
  // decision through the same core and writer used by the review surface.
  R.editLinkLabel = async function (ref, value, opts) {
    const s = state(), vaultPath = s.activeVaultPath;
    const previous = R.current();
    if (!previous || previous.initial.status !== 'awaiting_review') throw new Error('stale_revision');
    const next = window.MappAILinkEditorCore.decision(previous, s.db, ref, value, {
      problem: t('le_manual_change', 'Parole del collegamento modificate dal docente.'), now: new Date().toISOString(), relNone: opts?.relNone === true
    });
    async function persist(expected, review) {
      assertProject(vaultPath);
      if (busy || committing) throw new Error('link_busy');
      if (R.current() !== expected || core().revision(state().db, expected.sources) !== expected.baseRevision) throw new Error('stale_revision');
      committing = true;
      try {
        await R.writeManifest(vaultPath, Object.assign({}, state()._pipelineManifest, { review }));
        assertProject(vaultPath); cache();
      } finally { committing = false; }
    }
    await persist(previous, next);
    return () => persist(next, previous);
  };
  R.retryJudge = async function (vaultPath, manifest) {
    assertProject(vaultPath);
    const old = manifest.review, s = state();
    if (old.initial.status !== 'awaiting_review' || core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
    const giro = window.MappAIModelli && window.MappAIModelli.avvia({ manifest, vaultPath, giudice: true });
    const key = giro ? null : window.getSystemKey && window.getSystemKey();
    if ((!key && !giro) || !window.executeJudgePass) throw new Error(t('rv_retry_key', 'Per riprovare il controllo automatico occorre una chiave AI disponibile.'));
    const pages = s._pdfPagine, sources = s.sources, generationSources = s._generationSources;
    let report;
    try {
      s._pdfPagine = old.sources.filter(x => Array.isArray(x.pages));
      s._generationSources = old.sources;
      s.sources = old.sources.map(x => Object.assign({}, x, { content: x.content || x.text || '' }));
      report = await window.executeJudgePass(key, { enabled: true, apply: false }, giro);
      assertProject(vaultPath);
      if (core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
    } finally { s._pdfPagine = pages; s.sources = sources; s._generationSources = generationSources; }
    const next = core().mergeRetry(old, core().createReview({ db: s.db, sources: old.sources, report, generationId: old.generationId,
      projectId: old.projectId, vaultPath, config: old.config }));
    manifest.review = next;
    if (giro) manifest.modelliGiro = giro.riepilogo();
    await R.persistQuality(vaultPath); await R.writeManifest(vaultPath, manifest); cache();
    return next;
  };
  R.retryMaterialJudge = async function (vaultPath, manifest, opts) {
    assertProject(vaultPath);
    const s = state(), review = manifest.review, final = review && review.final, old = final && final.review;
    function assertCurrent() {
      assertProject(vaultPath);
      if (!old || manifest.review !== review || review.final !== final || final.review !== old ||
          final.stage !== 'awaiting_review' || old.initial.status !== 'awaiting_review' ||
          !core().gate(review, s.db, review.sources).allowed ||
          core().revision({ items: final.items }, old.sources) !== old.baseRevision) {
        throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      }
    }
    assertCurrent();
    const judge = window.MappAIMaterialReview, grounding = window.MappAIGroundingCore;
    if (!judge || !judge.check || !grounding || !grounding.buildInput) throw new Error(t('rv_validator_missing', 'Il controllo dei campi non è disponibile. Le bozze sono conservate.'));
    const previousContext = s._reviewAIContext;
    const giro = window.MappAIModelli && window.MappAIModelli.avvia({ manifest, vaultPath, giudice: true });
    let report;
    try {
      if (!giro) s._reviewAIContext = clone(manifest.config.aiContext || previousContext || { provider: s.aiProvider });
      const apiKey = giro ? null : window.getSystemKey && window.getSystemKey();
      if (!apiKey && !giro) throw new Error(t('rv_retry_key', 'Per riprovare il controllo automatico occorre una chiave AI disponibile.'));
      const material = grounding.buildInput(s.db, s.db.nodes, review.sources, review, { includeOriginalPages: true });
      // Coverage describes the saved drafts. Teacher choices stay separate until
      // approval, so a retry cannot silently replace or rebase those choices.
      report = await (judge.checkRemaining || judge.check)(clone(final.items), { review, apiKey, material,
        previousReport: old.initial.report, giro, aiContext: giro ? giro.fase('giudice') : clone(s._reviewAIContext), onProgress: opts && opts.onProgress });
      assertCurrent();
    } finally { if (!giro) s._reviewAIContext = previousContext; }
    const next = core().mergeRetry(old, core().createReview({ db: { items: final.items }, sources: old.sources, report,
      generationId: old.generationId, projectId: old.projectId, vaultPath, config: old.config }));
    const previousIds = new Set(old.initial.issues.map(i => i.id));
    next.initial.retrySummary = { ...(report.retrySummary || {}),
      newIssueIds: next.initial.issues.filter(i => !previousIds.has(i.id)).map(i => i.id),
      decisionsPreserved: Object.values(old.initial.decisions).filter(d => ['accept', 'manual', 'reject'].includes(d.choice)).length };
    final.review = next;
    if (giro) manifest.modelliGiro = giro.riepilogo();
    try { await R.writeManifest(vaultPath, manifest); }
    catch (e) { final.review = old; throw e; }
    cache();
    return next;
  };
  R.requireApproved = async function () {
    const s = state();
    if (s._reviewLoading || s._reviewRestoring || s._reviewRestoreError || busy || committing) return false;
    const review = R.current();
    if (!review) return true; // legacy remains usable; no retrospective approval
    const gate = core().gate(review, s.db, review.sources);
    if (gate.allowed) return true;
    if (review.initial.status === 'approved') {
      // A real content edit needs a fresh review; keep the previous decisions.
      const manifest = s._pipelineManifest;
      const previous = clone(review);
      const giro = window.MappAIModelli && window.MappAIModelli.avvia({ manifest, vaultPath: s.activeVaultPath, giudice: true });
      const key = giro ? null : window.getSystemKey && window.getSystemKey();
      const report = window.executeJudgePass && (giro || key)
        ? await window.executeJudgePass(key, { enabled: true, apply: false }, giro) : {};
      if (giro) manifest.modelliGiro = giro.riepilogo();
      manifest.review = core().createReview({ db: s.db, sources: review.sources, report,
        generationId: s._generationId, vaultPath: s.activeVaultPath, config: manifest.config });
      manifest.review.previous = previous;
      s._reviewRevision = manifest.review.baseRevision;
      await R.writeManifest(s.activeVaultPath, manifest);
    }
    R.open(s.activeVaultPath, s._pipelineManifest);
    return false;
  };
  R.requireStandalone = async function () {
    if (!await R.requireApproved()) return false;
    const s = state(), review = R.current();
    if (!review) return true;
    const final = review.final;
    if (final && final.stage !== 'done') {
      if (final.review) {
        if (final.review.initial.status === 'applying') await R.restore(s.activeVaultPath, s._pipelineManifest);
        R.open(s.activeVaultPath, s._pipelineManifest, { final: true });
      } else {
        if (window.showToast) window.showToast(t('rv_standalone_pending', 'La revisione dei materiali è in corso. Riprendila dal progetto prima di creare nuovi esercizi.'), 'info');
        await R.openCurrent();
      }
      return false;
    }
    if (window.showToast) window.showToast(t('rv_standalone_controlled', 'Per controllare anche i nuovi materiali, usa Genera materiali. Le attività già salvate restano disponibili.'), 'info');
    if (window.MappAIPipeline && window.MappAIPipeline.openModal) window.MappAIPipeline.openModal({ fromApproved: true });
    return false;
  };
  R.openCurrent = async function () {
    const s = state();
    if ((window.mappaiOccupato && window.mappaiOccupato()) || R.isBusy() || s._reviewRestoring || s._reviewRestoreError) return;
    if (!s.activeVaultPath) {
      if (!s.db.nodes.length || !window.ensureProjectVault) return;
      await window.ensureProjectVault({ reason: 'review' });
    }
    if (!s.activeVaultPath) throw new Error(t('rv_no_vault', 'Salva il progetto prima di aprire la revisione.'));
    let manifest = s._pipelineManifest;
    if (!manifest) {
      const res = await window.electronAPI.vaultMaterialsList({ vaultPath: s.activeVaultPath });
      manifest = res && res.manifest;
    }
    if (!manifest) {
      manifest = window.MappAIPipelineCore.createManifest({}, { vaultPath: s.activeVaultPath });
      manifest.steps.A.status = 'done';
    }
    await R.checkpoint(s.activeVaultPath, manifest);
    if (manifest.review.initial.status === 'applying' || manifest.review.final?.review?.initial.status === 'applying') await R.restore(s.activeVaultPath, manifest);
    const final = manifest.review.final;
    R.open(s.activeVaultPath, manifest, { final: !!(final && final.review) });
  };
  R.finishMapOnly = async function (giro) {
    if ((!R.enabled() && !giro) || !state().db.nodes.length) return;
    const saved = await window.ensureProjectVault({ reason: 'generation' });
    const vaultPath = (saved && saved.folderPath) || state().activeVaultPath;
    if (!vaultPath) throw new Error('Cartella della revisione non disponibile');
    if (giro) giro = giro.conVault(vaultPath);
    const manifest = window.MappAIPipelineCore.createManifest(giro ? { modelli: giro.profilo() } : {}, { vaultPath });
    if (giro) manifest.modelliGiro = giro.riepilogo();
    manifest.steps.A.status = 'done';
    await R.checkpoint(vaultPath, manifest);
    if (giro) { await R.prepareEvidence(vaultPath, manifest, giro); await R.writeManifest(vaultPath, manifest); }
    if (manifest.review) R.open(vaultPath, manifest);
  };
  const fieldLabels = { question: ['rv_question', 'Domanda'], answer: ['rv_answer', 'Risposta'],
    options: ['rv_options', 'Alternative'], correctIndex: ['rv_correct', 'Risposta corretta'], explanation: ['rv_explanation', 'Spiegazione'],
    guide: ['rv_guide', 'Traccia di risposta'], criteria: ['rv_criteria', 'Criteri di correzione'], criteri: ['rv_criteria', 'Criteri di correzione'],
    text: ['rv_text', 'Testo'], lines: ['rv_lines', 'Righe per rispondere'], label: ['rv_label', 'Titolo'], desc: ['rv_text', 'Testo'],
    rel: ['rv_relation', 'Relazione'], source: ['rv_link_from', 'Dal concetto'], target: ['rv_link_to', 'Al concetto'] };
  const fieldName = (f, item) => item && item.kind === 'causal' && ['question', 'text', 'answer'].includes(f)
    ? ({ question: t('rv_relation_start', 'Prima parte'), text: t('rv_relation_connector', 'Collegamento'), answer: t('rv_relation_end', 'Seconda parte') })[f]
    : fieldLabels[f] ? t(...fieldLabels[f]) : t('rv_other_field', 'Contenuto');
  const itemFields = ['question', 'answer', 'options', 'correctIndex', 'explanation', 'guide', 'criteria', 'criteri', 'text', 'lines'];
  const canonicalFields = item => itemFields.filter(f => own(item, f) &&
    !(f === 'criteri' && own(item, 'criteria')) && !(f === 'answer' && item.kind === 'mc' && Array.isArray(item.options)));
  const nodeLabel = id => { const key = id && typeof id === 'object' ? id.id : id; const n = (state().db.nodes || []).find(n => String(n.id) === String(key)); return n ? n.label : t('rv_missing_node', 'Concetto non disponibile'); };
  function itemFor(issue, review) { return (review.baseSnapshot.items || []).find(i => String(i.id) === String(issue.target.id)); }
  function readable(value, target, item) {
    if (value == null) return target && ['$item', '$link'].includes(target.field) ? t('rv_remove', 'Escludi questo elemento') : t('rv_empty_field', 'Campo vuoto');
    if (target && target.kind === 'link') {
      const l = typeof value === 'object' ? value : Object.assign({}, target, { rel: value });
      const matches = l.id != null ? (state().db.links || []).filter(link => String(link.id) === String(l.id)) : [];
      const saved = matches.length === 1 ? matches[0] : {};
      if (l.rel === '') return nodeLabel(l.source ?? saved.source) + ' — ' + nodeLabel(l.target ?? saved.target) + ' · ' + t('le_none_preview', 'Collegamento senza parole');
      return nodeLabel(l.source ?? saved.source) + ' → ' + String(l.rel || '') + ' → ' + nodeLabel(l.target ?? saved.target);
    }
    if (target && target.field === 'correctIndex') {
      return item && Array.isArray(item.options) && Number.isInteger(value) && item.options[value] != null
        ? String.fromCharCode(65 + value) + '. ' + item.options[value] : t('rv_no_correct', 'Nessuna alternativa valida selezionata');
    }
    if (Array.isArray(value)) return value.map((v, i) => (i + 1) + '. ' + (typeof v === 'string' ? v : t('rv_unreadable_field', 'Contenuto da correggere'))).join('\n');
    if (typeof value === 'object' && value.kind === 'causal') return [value.question, value.text, value.answer].join(' → ');
    if (typeof value === 'object') return canonicalFields(value).map(f => fieldName(f, value) + ':\n' + readable(value[f], { field: f }, value)).join('\n\n');
    return String(value);
  }
  R.describeValue = readable;
  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
    return JSON.stringify(x);
  }
  R.groupIssues = function (issues) {
    const groups = new Map();
    for (const issue of issues) {
      // A common correction must have the same literal change and source proof.
      // Similar wording alone never authorizes changing another material.
      const sharedCorrection = issue.target.kind !== 'link' && issue.hasProposal && typeof issue.before === 'string' && typeof issue.after === 'string' &&
        evidenceRows(issue.evidence).some(e => e.quotationMatched && e.verifiedAgainst === 'archived-source-text');
      const independentTarget = issue.origin === 'teacher' || ['correctIndex', 'options', '$item'].includes(issue.target.field) ? issue.target.id : null;
      const key = canonical([issue.target.kind, issue.target.field, issue.before, issue.after, issue.hasProposal,
        sharedCorrection ? null : issue.problem, issue.evidence, issue.quote, issue.type, issue.citationAdditions, independentTarget]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(issue);
    }
    return Array.from(groups.values());
  };
  function evidenceRows(value) {
    if (typeof value === 'string') return value ? [{ text: value }] : [];
    if (Array.isArray(value)) return value.flatMap(evidenceRows);
    if (!value || typeof value !== 'object') return [];
    if (typeof value.text === 'string') return [value];
    return Object.values(value).filter(v => v && typeof v === 'object').flatMap(evidenceRows);
  }
  function evidenceHtml(issue, review, displayText) {
    const rows = evidenceRows(issue.evidence);
    return rows.length ? rows.map(e => {
      const source = [e.title || (typeof e.source === 'string' ? e.source : ''), e.page ? t('rv_page', 'Pagina') + ' ' + e.page : ''].filter(Boolean).join(' · ');
      const quote = e.verifiedAgainst === 'item' && !e.quotationMatched ? readable(issue.before, issue.target, itemFor(issue, review)) : e.text;
      const contexts = [];
      (review.sources || []).forEach(s => {
        const identityMatches = e.sourceId ? String(s.id) === String(e.sourceId) : !source || [s.title, s.name, s.nome].some(n => n && source.includes(n));
        (s.pages || [{ text: s.text || s.content || '', n: null }]).forEach(p => {
          if (p.text && p.text !== quote && p.text.includes(quote) && (!e.page || String(p.n) === String(e.page)) && (identityMatches || !e.sourceId)) {
            const label = [s.title || s.name || s.nome || t('rv_source', 'Fonte'), p.n ? t('rv_page', 'Pagina') + ' ' + p.n : ''].filter(Boolean).join(' · ');
            contexts.push('<details class="mt-2"><summary>' + esc(t('rv_context', 'Leggi il contesto')) + ' — ' + esc(label) + '</summary><p class="whitespace-pre-wrap">' + esc(p.text) + '</p></details>');
          }
        });
      });
      return '<div class="my-3"><p class="font-bold">' + esc(source || t('rv_source', 'Fonte')) + '</p><p class="whitespace-pre-wrap">' + esc(e.verifiedAgainst === 'item' && displayText ? displayText(quote) : quote) + '</p>' + contexts.join('') + '</div>';
    }).join('') : '<p>' + esc(t('rv_no_evidence', 'La prova non è disponibile in questa segnalazione.')) + '</p>';
  }
  function evidencePreview(issue, review, displayText) {
    const rows = evidenceRows(issue.evidence), selected = typeof issue.quote === 'string' ? issue.quote : '';
    const row = rows.find(e => selected && e.text.includes(selected)) || rows[0];
    if (!row) return '<p class="mrv-evidence-missing">' + esc(t('rv_no_evidence', 'La prova non è disponibile in questa segnalazione.')) + '</p>';
    let quote = selected && row.text.includes(selected) ? selected : row.text;
    if (row.verifiedAgainst === 'item' && !row.quotationMatched) quote = readable(issue.before, issue.target, itemFor(issue, review));
    if (row.verifiedAgainst === 'item') quote = displayText(quote);
    const text = quote.length > 320 ? quote.slice(0, 320).replace(/\s+\S*$/, '') + '…' : quote;
    const source = [row.title || (typeof row.source === 'string' ? row.source : '') || t('rv_source', 'Fonte'), row.page ? t('rv_page', 'Pagina') + ' ' + row.page : ''].filter(Boolean).join(' · ');
    return '<aside class="mrv-evidence-preview" data-evidence-excerpt><p class="mrv-field-label">' + esc(t('rv_context_evidence', 'Passaggio da confrontare')) + '</p><blockquote>' + esc(text) + '</blockquote><p class="mrv-evidence-source">' + esc(source) + '</p></aside>';
  }
  // il segno di una parte tolta o aggiunta: lo spazio finale resta fuori, così barrato e sottolineato finiscono sulla parola
  function segnoConfronto(tag, testo, lato) {
    const m = testo.match(/^([\s\S]*?)(\s*)$/);
    return '<' + tag + (lato ? ' data-change="' + lato + '"' : '') + '>' + esc(m[1]) + '</' + tag + '>' + esc(m[2]);
  }
  function highlightedValues(before, after) {
    /* Parola per parola (17/9/26): ogni pezzo cambiato ha il suo segno, invece di un blocco unico
       dal primo all'ultimo carattere diverso, che con due correzioni lontane copriva quasi tutto. */
    const C = window.MappAIConfrontoCore;
    if (C && C.inline) {
      const r = C.inline(before, after);
      const html = (pezzi, tag, lato) => pezzi.map(p => p.tipo === 'uguale' ? esc(p.t) : segnoConfronto(tag, p.t, lato)).join('');
      return [html(r.a, 'del', 'before'), html(r.b, 'ins', 'after')];
    }
    const change = core().textChange(before, after);
    if (!change) return [esc(before), esc(after)];
    const tail = after.length - (before.length - change.end);
    function mark(text, end, side) {
      let start = change.start;
      while (start > 0 && /\S/.test(text[start - 1])) start--;
      while (end < text.length && /\S/.test(text[end])) end++;
      if (start === end) return esc(text);
      return esc(text.slice(0, start)) + '<mark data-change="' + side + '">' + esc(text.slice(start, end)) + '</mark>' + esc(text.slice(end));
    }
    return [mark(before, change.end, 'before'), mark(after, tail, 'after')];
  }
  /* IL CONFRONTO AFFIANCATO (17/9/26): bozza a sinistra, anteprima a destra, frase per
     frase (mappai-confronto-core.js). «Solo le frasi cambiate» nasconde le righe uguali e
     mette al loro posto «⋯ N frasi invariate»; «Testo intero» mostra tutto. La scelta vale
     per tutti i confronti e resta ricordata (mappai_confronto_vista). */
  const VISTA_CONFRONTO = 'mappai_confronto_vista';
  function vistaConfronto() { try { return localStorage.getItem(VISTA_CONFRONTO) === 'intero' ? 'intero' : 'frasi'; } catch (_) { return 'frasi'; } }
  function confrontoHtml(prima, dopo, titoli) {
    const C = window.MappAIConfrontoCore;
    if (!C) return null;
    const r = C.confronta(prima, dopo), vista = vistaConfronto();
    // lo spazio dopo l'ultima parola resta fuori dal segno: barrato e sottolineato finiscono sulla parola
    const pezzi = lista => lista.map(p => p.tipo === 'tolto' ? segnoConfronto('del', p.t) : p.tipo === 'aggiunto' ? segnoConfronto('ins', p.t) : esc(p.t)).join('');
    const righe = [];
    for (let k = 0; k < r.righe.length;) {
      if (r.righe[k].tipo === 'uguale') {
        let n = 0;
        while (k + n < r.righe.length && r.righe[k + n].tipo === 'uguale') n++;
        righe.push('<tr class="mrv-cf-salto"><td colspan="2">⋯ ' + n + ' ' + esc(n === 1 ? t('rv_cf_same_one', 'frase invariata') : t('rv_cf_same_many', 'frasi invariate')) + '</td></tr>');
        r.righe.slice(k, k + n).forEach(x => righe.push('<tr class="mrv-cf-uguale' + (x.inizioParagrafo ? ' mrv-cf-par' : '') + '"><td>' + esc(x.a) + '</td><td>' + esc(x.b) + '</td></tr>'));
        k += n; continue;
      }
      const x = r.righe[k++];
      righe.push('<tr class="mrv-cf-cambiata' + (x.inizioParagrafo ? ' mrv-cf-par' : '') + '"><td>' + pezzi(x.a) + '</td><td>' + pezzi(x.b) + '</td></tr>');
    }
    const conta = r.modifiche === 0 ? t('rv_cf_none', 'L’anteprima coincide con la bozza: nessuna differenza.')
      : r.modifiche + ' ' + (r.modifiche === 1 ? t('rv_cf_change_one', 'frase cambiata') : t('rv_cf_change_many', 'frasi cambiate'));
    const bottone = (v, testo) => '<button type="button" class="pm-btn-cancel" data-cf-vista="' + v + '" aria-pressed="' + (vista === v) + '">' + esc(testo) + '</button>';
    return '<div class="mrv-cf' + (r.modifiche ? '' : ' mrv-cf--uguale') + '" data-vista="' + vista + '">' +
      '<div class="mrv-cf-barra"><span class="mrv-cf-conta" aria-live="polite">' + esc(conta) + '</span><span class="mrv-cf-vista" role="group" aria-label="' + esc(t('rv_cf_view', 'Vista del confronto')) + '">' +
      bottone('frasi', t('rv_cf_only_changed', 'Solo le frasi cambiate')) + bottone('intero', t('rv_cf_full', 'Testo intero')) + '</span></div>' +
      '<table class="mrv-cf-tabella table-fixed"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><thead><tr><th>' + esc(titoli[0]) + '</th><th>' + esc(titoli[1]) + '</th></tr></thead><tbody>' +
      righe.join('') + '</tbody></table></div>';
  }
  function collegaConfronti(host) {
    host.querySelectorAll('[data-cf-vista]').forEach(b => {
      b.onclick = () => {
        const v = b.getAttribute('data-cf-vista');
        try { localStorage.setItem(VISTA_CONFRONTO, v); } catch (_) { /* resta per questa apertura */ }
        document.querySelectorAll('#mappai-teacher-review .mrv-cf').forEach(cf => {
          cf.setAttribute('data-vista', v);
          cf.querySelectorAll('[data-cf-vista]').forEach(x => x.setAttribute('aria-pressed', String(x.getAttribute('data-cf-vista') === v)));
        });
      };
    });
  }
  function pendingOutputs(manifest) {
    if (manifest.review?.final && ['approved', 'finalizing'].includes(manifest.review.final.stage)) return true;
    return ['B', 'C', 'D', 'E'].some(k => ['pending', 'failed', 'running'].includes(manifest.steps?.[k]?.status));
  }
  R.open = function (vaultPath, manifest, options) {
    options = options || {};
    const isFinal = !!options.final;
    const getReview = () => isFinal ? manifest.review.final.review : manifest.review;
    if (!getReview() || busy || committing) return;
    function checkMessage() {
      const initial = getReview().initial, report = initial.report || {};
      if (initial.checkStatus === 'completed') return t('rv_check_completed', 'Controllo automatico completato.');
      const checked = report.copertura?.nodiEsaminati?.length || report.copertura?.linkEsaminati?.length || report.coverage?.checkedIds?.length;
      return checked ? t('rv_check_partial', 'Controllo automatico eseguito: alcune parti restano da verificare.') :
        t('rv_check_incomplete', 'Il controllo automatico non ha potuto confermare la verifica di tutti i contenuti.');
    }
    const old = document.getElementById('mappai-teacher-review'); if (old) old.remove();
    const previousFocus = document.activeElement;
    const referenceOptions = { sourceLabel: t('rv_source', 'Fonte'), unknownLabel: t('rv_reference_unknown', 'Fonte da verificare') };
    const registry = (getReview().baseSnapshot.items || []).flatMap(item => item.citations || [])
      .concat(getReview().initial.issues.flatMap(issue => issue.citationAdditions || []));
    function referenceView(value) {
      const grounding = window.MappAIGroundingCore;
      return grounding && grounding.referenceView ? grounding.referenceView(String(value), registry, referenceOptions) : { text: String(value), mapping: [] };
    }
    function restoreReferences(value, view) {
      return window.MappAIGroundingCore?.restoreReferenceIds ? window.MappAIGroundingCore.restoreReferenceIds(value, view.mapping) : value;
    }
    const displayValue = (value, target, item) => referenceView(readable(value, target, item)).text;
    const palette = typeof colorScale !== 'undefined' ? colorScale : window.colorScale || {};
    const contextIndex = window.MappAIReviewContext?.createIndex(state().db, manifest.review?.drafts || {}, palette);
    const contextFor = issue => contextIndex ? contextIndex.describe(issue, getReview()) :
      { areas: [], materialKind: itemFor(issue, getReview())?.kind || '', scope: 'unknown' };
    const kindLabels = { mc: t('rv_context_mc', 'Quiz MC'), open: t('rv_context_open', 'Domanda aperta'),
      flashcard: t('rv_context_flashcard', 'Flashcard'), synthesis: t('rv_context_synthesis', 'Sintesi'),
      nodesheet: t('rv_context_nodesheet', 'Scheda nodi'), causal: t('rv_context_causal', 'Relazione') };
    const reasonLabels = { semantic: t('rv_context_semantic', 'Fatto da verificare'), coherence: t('rv_context_coherence', 'Coerenza dell’esercizio'),
      accessibility: t('rv_context_accessibility', 'Chiarezza della consegna'), editorial: t('rv_context_editorial', 'Refuso o testo editoriale'),
      structure: t('rv_context_structure', 'Struttura del contenuto'), teacher: t('rv_context_teacher', 'Intervento del docente'),
      'termine-sostituito': t('rv_context_term', 'Termine da verificare'), 'nesso-non-nella-fonte': t('rv_context_relation', 'Nesso da verificare'),
      'fatto-contraddetto': t('rv_context_fact', 'Fatto da confrontare con la fonte'), 'unsupported-link': t('rv_context_link', 'Collegamento da verificare'),
      'soggetto-invertito': t('rv_context_subject', 'Soggetto da verificare'), 'data-attribuita-male': t('rv_context_date', 'Data o attribuzione da verificare') };
    const reasonFor = issue => issue.origin === 'teacher' ? 'teacher' : own(reasonLabels, issue.type) ? issue.type : 'semantic';
    function areaRows(context) {
      return context.areas.length ? context.areas : [{ id: context.scope === 'overview' ? '_overview' : '_unknown',
        label: context.scope === 'overview' ? t('rv_context_overview', 'Trasversale') : t('rv_context_unknown', 'Area non disponibile'), color: null }];
    }
    function chips(group, compact) {
      const contexts = group.map(contextFor), areas = new Map(), kinds = new Map();
      contexts.forEach(context => {
        areaRows(context).forEach(area => areas.set(area.id, area));
        if (context.materialKind) kinds.set(context.materialKind, kindLabels[context.materialKind] || t('rv_material', 'Materiale'));
      });
      const areaList = Array.from(areas.values());
      return '<div class="mrv-chips">' + (compact ? areaList.slice(0, 2) : areaList).map(area => {
        // The context helper validates palette values before returning them.
        const color = area.color || '#64748b';
        return '<span class="mrv-chip mrv-area-chip" data-area-chip="' + esc(area.id) + '">' +
          (area.color ? '<span class="mrv-area-dot" aria-hidden="true" style="background:' + esc(color) + '"></span>' : '') + esc(area.label) + '</span>';
      }).join('') + (compact && areaList.length > 2 ? '<span class="mrv-chip">+' + (areaList.length - 2) + '</span>' : '') +
        Array.from(kinds).map(([key, label]) => '<span class="mrv-chip mrv-material-chip" data-material-chip="' + esc(key) + '">' + esc(label) +
          (key === 'synthesis' && contexts.some(c => c.materialKind === 'synthesis' && c.relation) ? ' · ' + esc(kindLabels.causal) : '') + '</span>').join('') + '</div>';
    }
    /* ── LA PELLE DEL BANCO (16/9/26) ─────────────────────────────────────────
       Il Banco di validazione del branch codex metteva la fonte accanto a ciò
       che si valuta, in una finestra intera con la barra laterale richiudibile
       e il testo ingrandibile. Giacomo ha chiesto di portarlo qui: la fatica
       della revisione era cercare la frase nel PDF, non giudicarla. Il pannello
       sta in mappai-review-fonte.js. Kill-switch: localStorage
       `mappai_revisione_banco` = '0' → il modale di prima. */
    const banco = !!window.MappAIReviewFonte && (() => { try { return localStorage.getItem('mappai_revisione_banco') !== '0'; } catch (e) { return true; } })();
    const modal = document.createElement('div');
    modal.id = 'mappai-teacher-review';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[3400] flex items-center justify-center p-4' + (banco ? ' mrv-banco' : '');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'mrv-title');
    const project = String(manifest.config?.nome || state().db.title || vaultPath.split(/[\\/]/).filter(Boolean).pop() || '');
    modal.innerHTML = '<div class="mrv-dashboard">' +
      /* Nella pelle del Banco la testata è solo titolo e fasi: il nome del progetto e
         la frase di spiegazione occupavano due righe (Giacomo, 16/9). */
      '<header class="mrv-header"><div class="mrv-heading">' + (banco ? '' : '<p class="mrv-eyebrow">' + esc(project) + '</p>') + '<h2 id="mrv-title" class="pm-title" tabindex="-1">' + esc(isFinal ? t('rv_final_title', 'Rivedi i materiali') : t('rv_title', 'Rivedi i contenuti prima di creare i materiali')) +
      '</h2>' + (banco ? '' : '<p class="pm-subtitle">' + esc(isFinal ? t('rv_dashboard_material_purpose', 'Verifica domande e risposte prima di consegnarle agli studenti. Le tue scelte aggiornano i materiali finali.') : t('rv_dashboard_map_purpose', 'Verifica i concetti di partenza. Le tue scelte guideranno la creazione dei materiali differenziati.')) + '</p>') +
      '</div><ol class="mrv-stages" aria-label="' + esc(t('rv_dashboard_stages', 'Fasi del lavoro')) + '">' +
      [t('rv_dashboard_contents', 'Contenuti'), t('rv_dashboard_materials', 'Materiali'), t('rv_dashboard_ready', 'Pronti da usare')].map((label, i) => '<li' + (i === (isFinal ? 1 : 0) ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + esc(label) + '</li>').join('') + '</ol></header>' +
      '<div class="mrv-overview"><div><strong id="mrv-progress-label"></strong><p id="mrv-filter-count" aria-live="polite"></p></div><progress id="mrv-progress" max="100" value="0" aria-label="' + esc(t('rv_dashboard_progress', 'Avanzamento delle decisioni')) + '"></progress><p id="mrv-status" role="status" aria-live="polite"></p><button type="button" id="mrv-save-retry" hidden class="pm-btn-cancel">' + esc(t('rv_save_retry', 'Riprova il salvataggio')) + '</button></div>' +
      '<div class="mrv-workspace"><aside class="mrv-sidebar" id="mrv-sidebar" data-expanded="false" aria-label="' + esc(t('rv_dashboard_queue', 'Elenco delle segnalazioni')) + '"><button type="button" id="mrv-toggle-list" class="pm-btn-cancel" aria-expanded="false" aria-controls="mrv-list">' + esc(t('rv_dashboard_show_list', 'Elenco e ricerca')) + '</button><div id="mrv-list"><div id="mrv-filters" role="group" aria-label="' + esc(t('rv_filter_label', 'Mostra le decisioni')) + '"></div>' +
      '<label class="mrv-search-label" for="mrv-search">' + esc(t('rv_dashboard_search', 'Cerca nelle segnalazioni')) + '</label><input id="mrv-search" type="search" placeholder="' + esc(t('rv_dashboard_search_hint', 'Concetto, domanda o problema…')) + '">' +
      '<div class="mrv-facets"><label for="mrv-area">' + esc(t('rv_context_area', 'Macroarea')) + '<select id="mrv-area"></select></label><label for="mrv-kind"' + (isFinal ? '' : ' hidden') + '>' + esc(t('rv_context_kind', 'Materiale')) + '<select id="mrv-kind"></select></label>' +
      '<label for="mrv-reason">' + esc(t('rv_context_reason', 'Motivo')) + '<select id="mrv-reason"></select></label></div><button type="button" class="pm-btn-cancel" id="mrv-clear-filters" hidden>' + esc(t('rv_context_clear', 'Azzera i filtri')) + '</button>' +
      '<p id="mrv-queue-count" aria-live="polite"></p><nav id="mrv-queue" aria-label="' + esc(t('rv_dashboard_queue', 'Elenco delle segnalazioni')) + '"></nav>' +
      '</div><details class="mrv-coverage" id="mrv-coverage-options"><summary>' + esc(t('rv_dashboard_coverage', 'Copertura del controllo')) + ' · <span id="mrv-coverage-label"></span></summary><p id="mrv-coverage-status"></p><div id="mrv-coverage-details"></div><div id="mrv-manual"></div></details></aside>' +
      (banco ? '<button type="button" class="mrv-maniglia" id="mrv-maniglia" aria-controls="mrv-sidebar" aria-expanded="true" title="' + esc(t('rv_nav_hide', 'Nascondi elenco e controlli')) + '" aria-label="' + esc(t('rv_nav_hide', 'Nascondi elenco e controlli')) + '"><i data-lucide="panel-right-close" aria-hidden="true"></i></button>' : '') +
      '<div class="mrv-detail">' + (banco ? '<div class="mrv-colonne"><section class="mrv-fonte" id="mrv-fonte"></section><div class="mrv-carte">' : '') +
      (isFinal ? '<div id="mrv-occurrences-host"></div>' : '') + '<nav id="mrv-detail-nav" aria-label="' + esc(t('rv_dashboard_navigation', 'Navigazione tra le segnalazioni')) + '">' +
      /* Nella pelle del Banco una riga sola (Giacomo, 16/9): chevron Lucide al posto di
         «Precedente/Successiva», «Occorrenze» al posto della riga «Trova le occorrenze
         nei materiali», Aa. Gli id restano quelli: i gesti e i test non cambiano. */
      (banco
        ? '<button type="button" id="mrv-prev" class="pm-btn-cancel mrv-icona" aria-label="' + esc(t('rv_dashboard_prev', 'Precedente')) + '" title="' + esc(t('rv_dashboard_prev', 'Precedente')) + '"><i data-lucide="chevron-left" aria-hidden="true"></i></button>' +
          '<span id="mrv-position" aria-live="polite"></span>' +
          '<button type="button" id="mrv-next" class="pm-btn-cancel mrv-icona" aria-label="' + esc(t('rv_dashboard_next', 'Successiva')) + '" title="' + esc(t('rv_dashboard_next', 'Successiva')) + '"><i data-lucide="chevron-right" aria-hidden="true"></i></button>' +
          (isFinal ? '<button type="button" id="mrv-occorrenze" class="pm-btn-cancel" aria-expanded="false" aria-controls="mrv-occurrences-host" title="' + esc(t('rv_occurrences_title', 'Trova le occorrenze nei materiali')) + '">' + esc(t('rv_occurrences_short', 'Occorrenze')) + '</button>' : '') +
          '<button type="button" id="mrv-testo" class="pm-btn-cancel">Aa x1</button>'
        : '<button type="button" id="mrv-prev" class="pm-btn-cancel">' + esc(t('rv_dashboard_prev', 'Precedente')) + '</button><span id="mrv-position" aria-live="polite"></span>' +
          '<button type="button" id="mrv-next" class="pm-btn-cancel">' + esc(t('rv_dashboard_next', 'Successiva')) + '</button>') +
      '</nav><div id="mrv-content"></div>' + (banco ? '</div></div>' : '') + '</div></div>' +
      '<footer class="mrv-footer"><p id="mrv-next-step"></p><div class="mrv-footer-actions">' +
      '<button type="button" class="pm-btn-cancel" id="mrv-later">' + esc(t('rv_later', 'Salva e continua più tardi')) + '</button>' +
      '<button type="button" class="pm-btn-primary" id="mrv-continue"></button></div></footer></div>';
    document.body.appendChild(modal);
    const content = modal.querySelector('#mrv-content'), status = modal.querySelector('#mrv-status');
    const proceed = modal.querySelector('#mrv-continue'), retrySave = modal.querySelector('#mrv-save-retry');
    let pendingSave = Promise.resolve(), saveError = null, manualConfirmed = false, closed = false;
    /* Vero quando l'approvazione manuale è decaduta da un salvataggio all'altro:
       lo alza `invalidateManualCheck`, lo consuma e lo azzera `save`. */
    let approvazioneDecaduta = false;
    const invalidEditors = new Set();
    /* Il PDF della fonte si legge da `Allegati/` del vault, dove la generazione
       lo salva col suo titolo. Nessun PDF → il pannello mostra il testo archiviato. */
    let allegati = null;
    async function leggiPdfDaAllegati(titolo) {
      const api = window.electronAPI;
      if (!api || !api.vaultMaterialsList || !api.readVaultFile) return null;
      if (!allegati) allegati = Promise.resolve(api.vaultMaterialsList({ vaultPath, dir: 'Allegati' }))
        .then(r => (r && r.ok !== false && Array.isArray(r.files) ? r.files.map(f => f && f.name).filter(Boolean) : [])).catch(() => []);
      const nome = window.MappAIReviewFonte.trovaPdf(titolo, await allegati);
      if (!nome) return null;
      const letto = await api.readVaultFile({ vaultPath, relPath: 'Allegati/' + nome });
      if (!letto || !letto.ok || !letto.base64) return null;
      const bin = atob(letto.base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    let fonte = null;
    if (banco) {
      /* Una riga sola per titolo, avanzamento e fasi (Giacomo, 16/9: «estendi
         orizzontalmente per salvare spazio verticale»). Si sposta il blocco
         dell'avanzamento dentro la testata: gli id restano quelli. */
      const testata = modal.querySelector('.mrv-header'), avanzamento = modal.querySelector('.mrv-overview');
      if (testata && avanzamento && testata.insertBefore) testata.insertBefore(avanzamento, testata.querySelector('.mrv-stages'));
      try { fonte = window.MappAIReviewFonte.monta(modal.querySelector('#mrv-fonte'), { sources: getReview().sources || [], t, leggiPdf: leggiPdfDaAllegati }); }
      catch (e) { fonte = null; console.warn('[Revisione] pannello della fonte non disponibile:', e); }
      const maniglia = modal.querySelector('#mrv-maniglia');
      if (maniglia) maniglia.onclick = () => {
        const area = modal.querySelector('.mrv-workspace'), chiusa = !area.classList.contains('is-nav-chiusa');
        area.classList.toggle('is-nav-chiusa', chiusa);
        modal.querySelector('#mrv-sidebar').inert = chiusa;
        const etichetta = chiusa ? t('rv_nav_show', 'Mostra elenco e controlli') : t('rv_nav_hide', 'Nascondi elenco e controlli');
        maniglia.setAttribute('aria-expanded', String(!chiusa)); maniglia.title = etichetta; maniglia.setAttribute('aria-label', etichetta);
      };
      /* IL DIVISORE fra la fonte e le schede (Giacomo, 17/9): si trascina; spinto sotto il 10%
         dell'area la fonte si chiude e resta una linguetta verde sul bordo sinistro, da
         trascinare o cliccare per riaprirla. Frazione e stato restano ricordati
         (mappai_revisione_fonte). Frecce ← → per spostarlo, Invio per chiudere/aprire.
         Sotto i 900px le colonne sono impilate e il divisore non si vede (CSS). */
      const colonne = modal.querySelector('.mrv-colonne'), fonteEl = modal.querySelector('#mrv-fonte');
      if (colonne && fonteEl) {
        const CHIAVE = 'mappai_revisione_fonte', MIN_FONTE = 280, MIN_CARTE = 360, SOGLIA = 0.1;
        const stato = { frazione: 0.5, chiusa: false };
        try { const letto = JSON.parse(localStorage.getItem(CHIAVE) || '{}'); if (letto.frazione > 0 && letto.frazione < 1) stato.frazione = letto.frazione; stato.chiusa = !!letto.chiusa; } catch (e) { /* valori predefiniti */ }
        const divisore = document.createElement('div');
        divisore.className = 'mrv-divisore'; divisore.tabIndex = 0;
        divisore.setAttribute('role', 'separator'); divisore.setAttribute('aria-orientation', 'vertical');
        divisore.setAttribute('aria-valuemin', '0'); divisore.setAttribute('aria-valuemax', '100');
        colonne.appendChild(divisore);
        const limita = f => { const W = colonne.clientWidth || 0; if (W < MIN_FONTE + MIN_CARTE) return f; return Math.min(Math.max(f, MIN_FONTE / W), 1 - MIN_CARTE / W); };   // area nascosta o stretta: nessun limite in px
        const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) { /* resta per questa apertura */ } };
        const applica = () => {
          colonne.classList.toggle('is-fonte-chiusa', stato.chiusa);
          colonne.style.setProperty('--mrv-fonte-w', stato.chiusa ? '0%' : (limita(stato.frazione) * 100).toFixed(2) + '%');
          fonteEl.inert = stato.chiusa;
          const etichetta = stato.chiusa ? t('rv_split_open', 'Riapri la fonte: trascina o fai clic') : t('rv_split_move', 'Sposta il confine fra fonte e schede; oltre il bordo sinistro la fonte si chiude');
          divisore.title = etichetta; divisore.setAttribute('aria-label', etichetta);
          divisore.setAttribute('aria-valuenow', String(stato.chiusa ? 0 : Math.round(limita(stato.frazione) * 100)));
        };
        let presa = null;
        divisore.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          presa = { x: e.clientX, mosso: false, chiude: false, id: e.pointerId, frazione: stato.frazione, chiusa: stato.chiusa };
          divisore.setPointerCapture(e.pointerId); colonne.classList.add('is-trascinando');
        });
        divisore.addEventListener('pointermove', e => {
          if (!presa || presa.id !== e.pointerId) return;
          if (Math.abs(e.clientX - presa.x) > 3) presa.mosso = true;
          if (!presa.mosso) return;
          const b = colonne.getBoundingClientRect(), x = e.clientX - b.left;
          presa.chiude = x < b.width * SOGLIA;
          colonne.classList.toggle('sta-chiudendo', presa.chiude);
          if (!presa.chiude) { stato.chiusa = false; stato.frazione = x / b.width; applica(); }
        });
        const lascia = () => {
          if (!presa) return;
          const p = presa; presa = null;
          colonne.classList.remove('is-trascinando', 'sta-chiudendo');
          if (!p.mosso) { if (stato.chiusa) stato.chiusa = false; else return; }   // clic: riapre la linguetta, sul divisore aperto non fa nulla
          else if (p.chiude) { stato.chiusa = true; if (!p.chiusa) stato.frazione = p.frazione; }   // chiudendo si riapre alla larghezza di prima, non a quella di passaggio
          else stato.frazione = limita(stato.frazione);
          applica(); salva();
        };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => divisore.addEventListener(n, lascia));
        divisore.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') stato.chiusa = !stato.chiusa;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (stato.chiusa) { if (e.key === 'ArrowLeft') return; stato.chiusa = false; }
            else stato.frazione = limita(stato.frazione + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
          } else return;
          e.preventDefault(); applica(); salva();
        });
        applica();
      }
      const occorrenze = modal.querySelector('#mrv-occorrenze');
      if (occorrenze) occorrenze.onclick = () => {
        occurrenceSearch.open = !occurrenceSearch.open; renderOccurrences();
        if (occurrenceSearch.open) modal.querySelector('#mrv-occurrence-query')?.focus();
      };
      if (window.safeCreateIcons) window.safeCreateIcons();
      /* Aa x1 → x1,5 → x2: ingrandisce il testo delle schede, non bottoni e titoli.
         Si ricorda fra un'apertura e l'altra: è una preferenza di lettura. */
      const aa = modal.querySelector('#mrv-testo');
      if (aa) {
        const scale = [1, 1.5, 2], etichette = ['1', '1,5', '2'];
        let indice = 0;
        try { indice = Math.max(0, scale.indexOf(Number(localStorage.getItem('mappai_revisione_testo')))); } catch (e) { indice = 0; }
        const applica = () => {
          const area = modal.querySelector('#mrv-content');
          if (area && area.style && area.style.setProperty) area.style.setProperty('--mrv-testo', String(scale[indice]));
          aa.textContent = 'Aa x' + etichette[indice];
          aa.setAttribute('aria-label', t('rv_text_size', 'Dimensione del testo delle schede') + ': x' + etichette[indice]);
        };
        aa.onclick = () => { indice = (indice + 1) % scale.length; try { localStorage.setItem('mappai_revisione_testo', String(scale[indice])); } catch (e) { /* resta per questa apertura */ } applica(); };
        applica();
      }
    }
    let activeFilter = 'pending', activeIssueId = null, search = '', visibleGroups = [], coverageWasPending = true, coverageExpanded = null;
    let editingIssue = null;
    const individualIssues = new Set();
    const occurrenceSearch = { open: false, query: '', mode: 'words', searched: false, sourceIssueId: null, dirty: false };
    const facets = { area: '', kind: '', reason: '' };
    const filters = modal.querySelector('#mrv-filters'), filterCount = modal.querySelector('#mrv-filter-count');
    const filterLabels = { pending: t('rv_filter_pending', 'Da rivedere'), decided: t('rv_filter_decided', 'Già decise'), all: t('rv_filter_all', 'Tutte') };
    const setReview = r => { occurrenceSearch.dirty = true; if (isFinal) manifest.review.final.review = r; else manifest.review = r; };
    function decisionState() {
      const r = getReview(), issues = r.initial.issues;
      const db = isFinal ? { items: manifest.review.final.items } : state().db;
      const preview = core().preview(r, db, { sources: r.sources });
      const attention = new Set(preview.conflicts.map(c => c.issueId).filter(Boolean));
      // A chosen action is still actionable when it cannot be applied or leaves
      // an invalid exercise. The filter must not hide these approval blockers.
      if (isFinal && r.initial.status !== 'approved' && preview.ok && window.MappAIMaterialReview?.validate) {
        const invalid = window.MappAIMaterialReview.validate(preview.db.items).issues || [];
        const itemIds = new Set(invalid.map(i => String(i.target?.id)));
        issues.filter(i => i.target.kind === 'item' && itemIds.has(String(i.target.id))).forEach(i => attention.add(i.id));
      }
      const scelta = i => ['accept', 'reject', 'manual'].includes(r.initial.decisions[i.id]?.choice);
      const pending = issues.filter(i => attention.has(i.id) || (!scelta(i) && preview.unresolved.includes(i.id)));
      const ids = new Set(pending.map(i => i.id));
      /* BLOCCATE ≠ DA DECIDERE (Giacomo, 19/9/2026: «non capisco se devo riprendere
         a rivalidare scelte già fatte»). Una segnalazione che HA già una scelta ma
         che un conflitto o un materiale non valido rende inapplicabile torna dentro
         `pending` — ed è giusto, perché un gesto serve ancora — ma contarla come
         «da decidere» fa calare il numero delle decise e fa credere di aver perso
         il lavoro fatto. Si separa per poterlo DIRE, senza toccare i filtri. */
      const bloccate = pending.filter(scelta);
      return { pending, bloccate, decided: issues.filter(i => !ids.has(i.id)), all: issues, conflicts: preview.conflicts };
    }
    function updateFilters() {
      const groups = decisionState();
      filters.querySelectorAll('button').forEach(button => {
        const key = button.getAttribute('data-review-filter');
        button.textContent = filterLabels[key] + ' (' + groups[key].length + ')';
        button.setAttribute('aria-pressed', String(activeFilter === key));
        button.className = activeFilter === key ? 'pm-btn-primary' : 'pm-btn-cancel';
      });
      filterCount.textContent = groups.pending.length + ' ' + t('rv_count_pending', 'da rivedere') + ' · ' + groups.decided.length + ' ' + t('rv_count_decided', 'già decise');
      /* Il numero delle decise non deve MAI tornare indietro senza spiegazione:
         le bloccate si contano a parte e si nominano. */
      modal.querySelector('#mrv-progress-label').textContent = groups.decided.length + ' / ' + groups.all.length + ' ' + t('rv_dashboard_decisions', 'segnalazioni decise') +
        (groups.bloccate.length ? ' · ' + groups.bloccate.length + ' ' + t('rv_dashboard_blocked_short', 'da sbloccare') : '');
      modal.querySelector('#mrv-progress').setAttribute('value', groups.all.length ? Math.round(groups.decided.length / groups.all.length * 100) : 100);
      if (!groups.pending.length && coverageWasPending && getReview().initial.status === 'awaiting_review' && getReview().initial.checkStatus !== 'completed') modal.querySelector('#mrv-coverage-options').setAttribute('open', '');
      coverageWasPending = !!groups.pending.length;
      /* CHE COSA MI MANCA PER CONCLUDERE (Giacomo, 19/9/2026: «non capisco se sto
         proseguendo»). Prima questa riga diceva solo «decidi per ogni segnalazione»
         e il bottone che conclude compariva o spariva senza un perché. Ora dice il
         NUMERO che manca, distingue le bloccate dalle mai decise, e quando non
         manca più niente lo dichiara invece di lasciarlo indovinare. */
      const daDecidere = groups.pending.length - groups.bloccate.length;
      const manca = [];
      if (daDecidere > 0) manca.push(daDecidere + ' ' + (daDecidere === 1 ? t('rv_dashboard_left_one', 'segnalazione da decidere') : t('rv_dashboard_left_many', 'segnalazioni da decidere')));
      if (groups.bloccate.length) manca.push(groups.bloccate.length + ' ' + (groups.bloccate.length === 1
        ? t('rv_dashboard_blocked_one', 'già decisa ma bloccata da un conflitto')
        : t('rv_dashboard_blocked_many', 'già decise ma bloccate da un conflitto')));
      modal.querySelector('#mrv-next-step').textContent = getReview().initial.status === 'approved' ? t('rv_dashboard_approved', 'La revisione è approvata e le decisioni sono salvate nel progetto.') :
        groups.pending.length ? t('rv_dashboard_left', 'Ti manca:') + ' ' + manca.join(' · ') + '. ' + t('rv_dashboard_resume', 'Puoi interrompere e riprendere: le decisioni sono già salvate.') :
        getReview().initial.checkStatus !== 'completed' && !manualConfirmed ? t('rv_dashboard_coverage_next', 'Le decisioni sono complete. Resta da completare il controllo: trovi le opzioni nel riquadro Copertura del controllo.') :
        t('rv_dashboard_can_finish', 'Hai deciso tutto: puoi concludere col bottone in fondo.') + ' ' +
        (isFinal ? t('rv_dashboard_finish', 'Completa la revisione per aggiornare i materiali e preparare i percorsi per i tuoi studenti.') : t('rv_dashboard_generate', 'Continua per creare i materiali a partire dai contenuti approvati.'));
      return groups;
    }
    function issueTarget(issue) {
      const item = itemFor(issue, getReview());
      return referenceView(issue.target.kind === 'item' ? item?.title || item?.question || item?.text || t('rv_material', 'Materiale') :
        issue.target.kind === 'link' ? readable(issue.before, issue.target) : nodeLabel(issue.target.id)).text;
    }
    async function navigate(issueId) {
      if (busy || invalidEditors.size) return;
      await pendingSave; if (saveError || closed || busy) return;
      editingIssue = null; activeIssueId = issueId; render(); modal.querySelector('#mrv-current-title')?.focus();
    }
    modal.querySelector('#mrv-toggle-list').onclick = () => {
      const sidebar = modal.querySelector('.mrv-sidebar'), expanded = sidebar.getAttribute('data-expanded') !== 'true';
      sidebar.setAttribute('data-expanded', String(expanded));
      modal.querySelector('#mrv-toggle-list').setAttribute('aria-expanded', String(expanded));
    };
    modal.querySelector('#mrv-prev').onclick = () => {
      const index = visibleGroups.findIndex(g => g.some(i => i.id === activeIssueId));
      if (index > 0) return navigate(visibleGroups[index - 1][0].id);
    };
    modal.querySelector('#mrv-next').onclick = () => {
      const index = visibleGroups.findIndex(g => g.some(i => i.id === activeIssueId));
      if (index < visibleGroups.length - 1) return navigate(visibleGroups[index + 1][0].id);
    };
    modal.querySelector('#mrv-search').oninput = async () => {
      const input = modal.querySelector('#mrv-search'), query = input.value;
      if (busy || invalidEditors.size) { input.value = search; return; }
      await pendingSave; if (saveError || closed || query !== input.value) return;
      editingIssue = null; search = query; activeIssueId = null; render(); input.focus();
    };
    for (const key of Object.keys(facets)) {
      const input = modal.querySelector('#mrv-' + key);
      input.onchange = async () => {
        const value = input.value;
        if (busy || invalidEditors.size) { input.value = facets[key]; return; }
        await pendingSave; if (saveError || closed || busy) { input.value = facets[key]; return; }
        editingIssue = null; facets[key] = value; activeIssueId = null; render(); input.focus();
      };
    }
    modal.querySelector('#mrv-clear-filters').onclick = async () => {
      if (busy || invalidEditors.size) return;
      await pendingSave; if (saveError || closed || busy) return;
      search = ''; modal.querySelector('#mrv-search').value = '';
      Object.keys(facets).forEach(key => { facets[key] = ''; });
      activeIssueId = null; render(); modal.querySelector('#mrv-search').focus();
    };
    for (const key of Object.keys(filterLabels)) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-review-filter', key);
      button.onclick = async () => {
        if (busy || invalidEditors.size) return;
        await pendingSave; if (saveError || closed) return;
        editingIssue = null; activeFilter = key; activeIssueId = null; render(); button.focus();
      };
      filters.appendChild(button);
    }
    function close() { closed = true; if (fonte) fonte.smonta(); modal.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
    function errorText(e) {
      return e && /^(persisted_revision_mismatch|applying_snapshot_mismatch)$/.test(e.code || e.message)
        ? t('rv_readback_failed', 'La copia salvata non coincide con le decisioni. La revisione resta in attesa.') : e.message;
    }
    function save() {
      status.textContent = t('rv_saving', 'Salvataggio…');
      pendingSave = R.writeManifest(vaultPath, manifest).then(() => {
        saveError = null; retrySave.hidden = true;
        /* ⚠️ E SE L'APPROVAZIONE È DECADUTA, LO SI DICE QUI (21/9). Il messaggio
           non può stare in `invalidateManualCheck`: `decide()` la chiama a OGNI
           battuta sul campo di testo, e subito dopo `save()` riscrive questa
           riga con «Decisioni salvate» — un avviso scritto là verrebbe
           sovrascritto in un battito, e nel frattempo ne avrebbe stampato uno
           per carattere. Appeso al salvataggio invece esce una volta sola, dove
           il docente sta già guardando. Stessa medicina, stessa frase e stessa
           chiave del percorso «Riprova il controllo» (riga ~1665): una verità,
           una fonte. */
        status.textContent = t('rv_saved', 'Decisioni salvate') +
          (approvazioneDecaduta ? ' · ' + t('rv_manual_reset', 'Le tue decisioni restano; va rimessa la spunta «completo io il controllo», perché il controllo è tornato indietro.') : '');
        approvazioneDecaduta = false;
        cache();
      }).catch(e => { saveError = e; retrySave.hidden = false; status.textContent = errorText(e); });
      return pendingSave;
    }
    retrySave.onclick = () => { if (!busy) save(); };
    /* L'approvazione di un materiale vale per la versione LETTA (vedi
       `statoApprovazioni`): appena una decisione cambia l'anteprima, decade da
       sé. Giusto — ma fino al 21/9 decadeva in SILENZIO: la spunta si toglieva,
       «Procedi» spariva, e chi aveva appena corretto un refuso vedeva il suo
       lavoro tornare «da rivedere» senza una parola (rilievo di Giacomo).
       Si segna solo la DISCESA da confermato a non confermato: chiamarla con la
       spunta già tolta non è una notizia, ed è il caso di quasi tutte le
       chiamate, che arrivano da `decide()` una per battuta. */
    function invalidateManualCheck() {
      if (manualConfirmed) approvazioneDecaduta = true;
      manualConfirmed = false;
      const input = modal.querySelector('#mrv-manual-confirm');
      if (input) { input.checked = false; proceed.hidden = true; }
    }
    /* ── APPROVARE UN MATERIALE RIMASTO SENZA CONTROLLO (16/9/26) ─────────────
       Il controllo automatico può lasciare materiali «senza esito» anche dopo
       molti tentativi: frasi che introducono un elenco, affermazioni senza
       verdetto. L'unica uscita era una casella globale chiusa in fondo al
       riquadro, e «Esamina i materiali rimasti» apriva l'elenco senza registrare
       niente: in «Svizzera e 2a GM» (16/9) Giacomo li ha esaminati tutti e la
       revisione è rimasta ferma, dopo sei tentativi che non potevano riuscire.
       Ora ogni materiale si approva da solo; approvati tutti, si completa.
       L'approvazione vale per la versione LETTA: si tiene un'impronta
       dell'anteprima con le decisioni attuali, e se una decisione la cambia
       l'approvazione decade da sé. */
    function improntaTesto(value) {
      let n = 2166136261;
      for (const c of String(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619);
      return (n >>> 0).toString(36);
    }
    function statoApprovazioni(r) {
      const vuoto = { residui: [], impronte: new Map(), approvati: new Set(), esclusi: new Set(), previews: new Map(), tutti: false };
      if (!isFinal || !r || r.initial.checkStatus === 'completed' || !window.MappAIReviewContext) return vuoto;
      const residui = window.MappAIReviewContext.incompleteMaterials(r.initial.report || {}, r.baseSnapshot.items);
      if (!residui.length) return vuoto;
      const fatte = r.initial.manualChecks || {}, impronte = new Map(), approvati = new Set(), esclusi = new Set(), previews = new Map();
      residui.forEach(row => {
        const result = row.item ? core().previewItem(r, { items: manifest.review.final.items }, row.id, { sources: r.sources })
          : { ok: false, db: { items: [] }, conflicts: [{ issueId: null, code: 'missing_item' }], unresolved: [] };
        previews.set(row.id, result);
        const item = result.ok && result.db.items.find(item => String(item.id) === row.id);
        if (result.ok && !item) { esclusi.add(row.id); return; }
        const impronta = item ? improntaTesto(JSON.stringify(item)) : '';
        impronte.set(row.id, impronta);
        if (impronta && own(fatte, row.id) && fatte[row.id]?.impronta === impronta) approvati.add(row.id);
      });
      const globale = core().preview(r, { items: manifest.review.final.items }, { sources: r.sources });
      return { residui, impronte, approvati, esclusi, previews, tutti: globale.ok && approvati.size + esclusi.size === residui.length };
    }

    function decide(group, choice, value) {
      if (busy || getReview().initial.status !== 'awaiting_review') return;
      invalidateManualCheck();
      let r = getReview();
      group.forEach(issue => {
        if (!r.initial.issues.some(saved => saved.id === issue.id)) r = core().addIssue(r, issue);
        r = core().setDecision(r, issue.id, choice, { text: value });
      });
      setReview(r); updateFilters(); updateSummary();
      // una decisione può far decadere un'approvazione per materiale: si ricalcola
      if (isFinal && getReview().initial.checkStatus !== 'completed' && modal.querySelector('#mrv-manual-confirm')) proceed.hidden = !statoApprovazioni(getReview()).tutti;
      if (occurrenceSearch.open) renderOccurrences();
      return save();
    }
    function updateSummary() {
      const r = getReview(), summary = modal.querySelector('#mrv-decision-summary');
      if (!summary) return;
      const counts = { applied: 0, edited: 0, kept: 0, excluded: 0, pending: 0 };
      const rows = r.initial.issues.map(issue => ({ issue, outcome: core().decisionOutcome(issue, r.initial.decisions[issue.id]),
        target: canonical([issue.target.kind, issue.target.id, issue.target.source, issue.target.target]) }));
      const excluded = new Set(rows.filter(row => row.outcome === 'excluded').map(row => row.target));
      rows.forEach(row => { if (!excluded.has(row.target)) counts[row.outcome]++; });
      counts.excluded = excluded.size;
      const labels = { applied: t('rv_summary_applied', 'Proposte scelte'), edited: t('rv_summary_edited', 'Modifiche manuali'),
        kept: t('rv_summary_kept', 'Senza modifiche'), excluded: t('rv_summary_excluded', 'Elementi esclusi'), pending: t('rv_pending', 'Da decidere') };
      summary.textContent = Object.keys(counts).map(key => labels[key] + ': ' + counts[key]).join(' · ');
    }
    function freeze(value) {
      busy = value; modal.setAttribute('aria-busy', String(value));
      modal.querySelectorAll('button,input,textarea,select').forEach(el => {
        if (value) { el._reviewDisabled = el.disabled; el.disabled = true; }
        else { el.disabled = !!el._reviewDisabled; delete el._reviewDisabled; }
      });
      if (!value) proceed.disabled = invalidEditors.size > 0;
    }
    // Both incomplete controls and text matches open the same saved field
    // decision. An occurrence is edited individually even when an older
    // identical proposal was displayed as a shared correction.
    async function openMaterialField(itemId, field) {
      if (busy || invalidEditors.size || getReview().initial.status !== 'awaiting_review') return;
      await pendingSave; if (saveError || closed || busy) return;
      let next = getReview();
      const item = next.baseSnapshot.items.find(row => String(row.id) === String(itemId));
      if (!item || !itemFields.includes(field) || !own(item, field)) return;
      const sameItem = next.initial.issues.filter(issue => issue.target.kind === 'item' && String(issue.target.id) === String(itemId));
      const decided = issue => ['accept', 'manual'].includes(next.initial.decisions[issue.id]?.choice);
      let existing = sameItem.find(issue => issue.target.field === '$item' && decided(issue)) ||
        sameItem.find(issue => issue.target.field === field && decided(issue)) ||
        sameItem.find(issue => issue.target.field === field) || sameItem.find(issue => issue.target.field === '$item');
      if (!existing) {
        const draft = core().addIssue(next, { target: { kind: 'item', id: String(itemId), field }, origin: 'teacher', blocking: true,
          problem: t('rv_teacher_edit', 'Modifica del docente') + ': ' + fieldName(field, item) });
        existing = draft.initial.issues[draft.initial.issues.length - 1];
      }
      editingIssue = existing;
      individualIssues.add(existing.id); activeIssueId = existing.id;
      render(); (modal.querySelector('.mrv-card:not([hidden]) [data-editor] textarea, .mrv-card:not([hidden]) [data-editor] select, .mrv-card:not([hidden]) [data-editor] input') || modal.querySelector('#mrv-current-title'))?.focus();
    }
    async function excludeMaterial(ids, excluded) {
      if (busy || invalidEditors.size || getReview().initial.status !== 'awaiting_review') return;
      await pendingSave; if (saveError || closed) return;
      let next = getReview();
      ids.forEach(id => { next = core().setItemExcluded(next, id, excluded, { problem: t('rv_teacher_exclusion', 'Esclusione decisa dal docente') }); });
      invalidateManualCheck(); editingIssue = null; setReview(next);
      await save(); render();
      const selector = excluded ? 'data-coverage-restore' : 'data-coverage-exclude';
      (modal.querySelector('[' + selector + '="' + ids[0] + '"]') || modal.querySelector('#mrv-title'))?.focus();
    }

    function renderOccurrences() {
      const host = modal.querySelector('#mrv-occurrences-host'), helper = window.MappAIReviewContext;
      if (!host || !helper?.searchOccurrences || !helper?.occurrenceSnapshot) return;
      occurrenceSearch.dirty = false;
      host.replaceChildren();
      const box = document.createElement('details'); box.id = 'mrv-occurrences';
      if (occurrenceSearch.open) box.setAttribute('open', '');
      const bottoneOccorrenze = modal.querySelector('#mrv-occorrenze');
      if (bottoneOccorrenze) bottoneOccorrenze.setAttribute('aria-expanded', String(!!occurrenceSearch.open));
      box.ontoggle = () => {
        if (host.querySelector('#mrv-occurrences') !== box) return;
        occurrenceSearch.open = box.open;
        if (bottoneOccorrenze) bottoneOccorrenze.setAttribute('aria-expanded', String(box.open));
        if (box.open && occurrenceSearch.dirty) renderOccurrences();
      };
      box.innerHTML = '<summary>' + esc(t('rv_occurrences_title', 'Trova le occorrenze nei materiali')) + '</summary>' +
        '<p class="mrv-occurrences-help">' + esc(t('rv_occurrences_help', 'Cerca parole o una frase in tutti i materiali, anche quelli senza segnalazioni. Leggi ogni corrispondenza nel suo contesto e scegli quali correggere. Per formulazioni diverse prova altre parole.')) + '</p>';
      const sourceIssue = getReview().initial.issues.find(issue => issue.id === occurrenceSearch.sourceIssueId);
      if (sourceIssue) {
        const source = document.createElement('p'); source.className = 'mrv-occurrences-source';
        source.textContent = t('rv_occurrences_problem', 'Problema da seguire:') + ' ' + sourceIssue.problem;
        box.appendChild(source);
      }
      const form = document.createElement('div'); form.className = 'mrv-occurrences-search';
      form.innerHTML = '<label for="mrv-occurrence-query">' + esc(t('rv_occurrences_query', 'Parole o frase da cercare')) +
        '<input id="mrv-occurrence-query" type="search" placeholder="' + esc(t('rv_occurrences_hint', 'Per esempio: corto circuito')) + '"></label>' +
        '<label for="mrv-occurrence-mode">' + esc(t('rv_occurrences_mode', 'Come cercare')) + '<select id="mrv-occurrence-mode"><option value="words">' +
        esc(t('rv_occurrences_words', 'Tutte le parole')) + '</option><option value="phrase">' + esc(t('rv_occurrences_phrase', 'Frase esatta')) + '</option></select></label>' +
        '<button type="button" id="mrv-occurrence-search" class="pm-btn-primary">' + esc(t('rv_occurrences_search', 'Cerca nei materiali')) + '</button>';
      const query = form.querySelector('input'), mode = form.querySelector('select');
      query.value = occurrenceSearch.query; mode.value = occurrenceSearch.mode;
      const run = async () => {
        if (busy || invalidEditors.size) return;
        await pendingSave; if (saveError || closed || busy) return;
        occurrenceSearch.query = query.value; occurrenceSearch.mode = mode.value; occurrenceSearch.searched = true; occurrenceSearch.open = true;
        renderOccurrences(); modal.querySelector('#mrv-occurrence-results')?.focus();
      };
      form.querySelector('button').onclick = run;
      query.oninput = () => { occurrenceSearch.query = query.value; };
      query.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); run(); } };
      mode.onchange = () => { occurrenceSearch.mode = mode.value; };
      box.appendChild(form);
      const results = document.createElement('div'); results.id = 'mrv-occurrence-results'; results.setAttribute('tabindex', '-1');
      box.appendChild(results); host.appendChild(box);
      if (!occurrenceSearch.searched) return;
      const snapshot = helper.occurrenceSnapshot(getReview(), manifest.review.final.items, core());
      if (!snapshot.ok) {
        results.textContent = t('rv_occurrences_conflict', 'Risolvi le decisioni in conflitto prima di cercare nella versione corretta dei materiali.'); return;
      }
      const found = helper.searchOccurrences(snapshot.items, occurrenceSearch.query, { mode: occurrenceSearch.mode, excludedIds: snapshot.excludedIds });
      const count = document.createElement('p'); count.setAttribute('role', 'status'); count.className = 'mrv-occurrences-count';
      count.textContent = !found.valid ? t('rv_occurrences_empty_query', 'Scrivi almeno una parola o una frase da cercare.') :
        found.matches.length + ' ' + t('rv_occurrences_found', 'materiali con corrispondenze') + ' · ' + found.totalItems + ' ' + t('rv_occurrences_scanned', 'materiali esaminati');
      results.appendChild(count);
      const version = document.createElement('p'); version.className = 'mrv-occurrences-help';
      version.textContent = t('rv_occurrences_version', 'La ricerca usa il testo con le decisioni attuali ed esclude i materiali rimossi. Una corrispondenza non è una nuova segnalazione né un controllo scientifico.');
      results.appendChild(version);
      if (getReview().initial.status === 'approved') {
        const readonly = document.createElement('p'); readonly.className = 'mrv-occurrences-help';
        readonly.textContent = t('rv_occurrences_readonly', 'Questa consegna è già completata: puoi consultare le corrispondenze. Le modifiche sono disponibili durante la revisione dei materiali.');
        results.appendChild(readonly);
      }
      if (!found.valid) return;
      if (!found.matches.length) {
        const empty = document.createElement('p'); empty.textContent = t('rv_occurrences_none', 'Nessuna corrispondenza. Prova meno parole o una formulazione diversa.'); results.appendChild(empty); return;
      }
      const list = document.createElement('div'); list.className = 'mrv-occurrence-list'; results.appendChild(list);
      found.matches.forEach((match, index) => {
        const item = match.item, target = { kind: 'item', id: match.id };
        const row = document.createElement('details'); row.className = 'mrv-occurrence'; row.setAttribute('data-occurrence-item', match.id);
        row.innerHTML = '<summary>' + (index + 1) + '. ' + esc(referenceView(item.title || item.question || item.text || t('rv_material', 'Materiale')).text) + '</summary>' + chips([{ target }]);
        const context = document.createElement('details'); context.className = 'mrv-item-context';
        context.innerHTML = '<summary>' + esc(t('rv_dashboard_full_item', 'Leggi l’attività completa')) + '</summary><p class="mrv-coverage-text">' +
          esc(displayValue(item, { field: '$item' }, item)) + '</p>';
        row.appendChild(context);
        match.fields.forEach(foundField => {
          const field = document.createElement('div'); field.className = 'mrv-occurrence-field';
          const title = document.createElement('h4'); title.textContent = fieldName(foundField.field, item) +
            (foundField.index != null ? ' ' + (foundField.field === 'options' ? String.fromCharCode(65 + foundField.index) : foundField.index + 1) : '');
          field.appendChild(title);
          const quote = document.createElement('p'); quote.className = 'mrv-coverage-text';
          // Reference labels change offsets: only highlight literal text when
          // reference rendering leaves its positions intact.
          const shown = referenceView(foundField.text).text;
          if (shown === foundField.text) {
            let cursor = 0;
            quote.innerHTML = foundField.ranges.map(([start, end]) => {
              const html = esc(shown.slice(cursor, start)) + '<mark>' + esc(shown.slice(start, end)) + '</mark>'; cursor = end; return html;
            }).join('') + esc(shown.slice(cursor));
          } else quote.textContent = shown;
          field.appendChild(quote);
          if (getReview().initial.status === 'awaiting_review') {
            const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'pm-btn-cancel';
            edit.setAttribute('data-occurrence-edit', foundField.field); edit.textContent = t('rv_occurrences_edit', 'Rivedi questo campo');
            edit.onclick = () => openMaterialField(match.id, foundField.field); field.appendChild(edit);
          }
          row.appendChild(field);
        });
        list.appendChild(row);
      });
    }
    async function findOccurrences(issue) {
      if (busy || invalidEditors.size) return;
      await pendingSave; if (saveError || closed || busy) return;
      occurrenceSearch.sourceIssueId = issue.id; occurrenceSearch.open = true;
      renderOccurrences(); modal.querySelector('#mrv-occurrence-query')?.focus();
    }
    function coverageFailureText(row) {
      const cause = window.MappAIReviewContext.coverageFailure(row);
      const messages = {
        foreign_ids: t('rv_failure_foreign_ids', 'La risposta del controllo contiene identificativi che non corrispondono ai materiali inviati.'),
        unverified_claims: t('rv_failure_claims', 'Il controllo non ha restituito un esito verificabile per tutte le affermazioni.'),
        unverified_issues: t('rv_failure_issues', 'La risposta contiene una segnalazione che non è stato possibile verificare.'),
        unknown: t('rv_failure_unknown', 'Il controllo automatico non è completo. Il rapporto non permette di precisare la causa.')
      };
      return messages[cause] + ' ' + t('rv_failure_saved', 'Il materiale è conservato: puoi confrontarlo con la fonte e revisionarlo manualmente.');
    }
    function renderMaterialCoverage(r, rows, editable, pending, approvazioni) {
      approvazioni = approvazioni || statoApprovazioni(r);
      rows.forEach(row => {
        if (!approvazioni.previews.has(row.id)) approvazioni.previews.set(row.id, core().previewItem(r, { items: manifest.review.final.items }, row.id, { sources: r.sources }));
        if (approvazioni.previews.get(row.id).excluded) approvazioni.esclusi.add(row.id);
      });
      const onlyExcluded = rows.every(row => approvazioni.esclusi.has(row.id));
      const box = document.createElement('details'); box.id = 'mrv-material-coverage';
      const retry = r.initial.retrySummary || r.initial.report?.retrySummary;
      const stalled = retry?.targeted > 0 && retry.checked === 0 && retry.remaining > 0;
      if (coverageExpanded ?? (!pending || stalled)) box.setAttribute('open', '');
      box.ontoggle = () => { coverageExpanded = box.open; };
      box.innerHTML = '<summary id="mrv-coverage-heading" tabindex="-1">' + esc(onlyExcluded ? t('rv_excluded_materials', 'Materiali esclusi') : t('rv_coverage_materials', 'Materiali con controllo incompleto')) + ' (' + (onlyExcluded ? rows.length : rows.filter(row => !approvazioni.esclusi.has(row.id)).length) + ')</summary>' +
        (stalled ? '<p id="mrv-no-progress" role="status">' + esc(t('rv_coverage_stalled', 'L’ultimo tentativo non ha completato nuovi controlli. Esamina le frasi qui sotto: riprovare può recuperare una risposta mancante, ma non aggiunge prove alla fonte.')) + '</p>' : '') +
        '<p>' + esc(t('rv_coverage_count_help', 'Questo numero conta i materiali con almeno una verifica automatica incompleta, non gli errori. Ogni tentativo riesamina tutti i residui e conserva i controlli validi.')) + '</p>' +
        '<p>' + esc(t('rv_coverage_version', 'Le frasi segnalate appartengono alle bozze originali controllate. Le correzioni scelte qui vengono applicate quando completi la revisione: non sono valutate dal pulsante di ricontrollo e non abbassano questo conteggio.')) + '</p>';
      // Show the exact archived source text, never generated node descriptions
      // as evidence for an uncertain claim. Unknown relevance stays unknown.
      const sources = document.createElement('details'); sources.className = 'mrv-coverage-sources';
      sources.innerHTML = '<summary>' + esc(t('rv_coverage_sources', 'Consulta il testo delle fonti usato dal controllo')) + '</summary>';
      let pages = 0;
      (r.sources || []).forEach(source => {
        (source.pages || [{ text: source.text || source.content, n: null }]).forEach(page => {
          if (!page.text) return;
          pages++;
          const detail = document.createElement('details');
          detail.innerHTML = '<summary>' + esc(source.title || source.name || source.nome || t('rv_source', 'Fonte')) +
            (page.n != null ? ' · ' + esc(t('rv_page', 'Pagina')) + ' ' + esc(page.n) : '') + '</summary><p class="mrv-coverage-text">' + esc(page.text) + '</p>';
          sources.appendChild(detail);
        });
      });
      if (!pages) sources.innerHTML += '<p>' + esc(t('rv_coverage_no_sources', 'Il testo delle fonti non è disponibile in questo archivio. Per la verifica personale consulta il documento originale.')) + '</p>';
      box.appendChild(sources);
      const activeCount = rows.filter(row => !approvazioni.esclusi.has(row.id)).length;
      if (approvazioni.approvati.size) {
        box.querySelector('#mrv-coverage-heading').textContent = t('rv_coverage_materials', 'Materiali con controllo incompleto') + ' (' + activeCount + ' · ' +
          approvazioni.approvati.size + ' ' + t('rv_coverage_approved_count', 'approvati da te') + ')';
      }
      const labels = {
        uncertain: t('rv_coverage_uncertain', 'Riscontro nella fonte non confermato'),
        missing: t('rv_coverage_missing', 'Il modello non ha restituito un esito'),
        unverified: t('rv_coverage_unverified', 'Esito non validato')
      };
      rows.forEach((row, index) => {
        const preview = approvazioni.previews.get(row.id) || core().previewItem(r, { items: manifest.review.final.items }, row.id, { sources: r.sources });
        const excluded = preview.ok && !preview.db.items.some(item => String(item.id) === row.id);
        const item = row.item, issue = { target: { kind: 'item', id: row.id } };
        const detail = document.createElement('details'); detail.className = 'mrv-coverage-material'; detail.setAttribute('data-coverage-item', row.id);
        const approvato = approvazioni.approvati.has(row.id);
        detail.innerHTML = '<summary>' + (index + 1) + '. ' + esc(issueTarget(issue)) +
          (approvato ? ' <span class="mrv-teacher-approved" data-teacher-approved role="img" tabindex="0" aria-label="' + esc(t('rv_teacher_approved', 'Approvato dal docente')) + '" title="' + esc(t('rv_teacher_approved_help', 'Hai approvato questa versione. Il controllo automatico resta distinto.')) + '"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg><span class="mrv-approval-help">' + esc(t('rv_teacher_approved_help', 'Hai approvato questa versione. Il controllo automatico resta distinto.')) + '</span></span>' : '') +
          (excluded ? ' · ' + esc(t('rv_material_excluded', 'Escluso')) : '') + '</summary>' + chips([issue]) +
          (row.claims.length && (row.error || row.reason) ? '<p>' + esc(coverageFailureText(row)) + '</p>' : '') +
          (row.claims.length ? '<ul class="mrv-coverage-claims">' + row.claims.map(claim => '<li><strong>' + esc(fieldName(claim.field, item)) + ' · ' + esc(labels[claim.status]) +
            '</strong><p class="mrv-coverage-text">' + esc(referenceView(claim.text).text) + '</p></li>').join('') + '</ul>' :
            '<p>' + esc(row.error || row.reason ? coverageFailureText(row) : t('rv_coverage_no_verdict', 'Il rapporto non contiene un controllo completo per questo materiale. Non indica quali frasi siano state verificate.')) + '</p>') +
          (row.error || row.reason ? '<details class="mrv-coverage-technical"><summary>' + esc(t('rv_coverage_detail', 'Dettaglio del controllo')) + '</summary><p>' + esc(row.error || row.reason) + '</p></details>' : '');
        if (item) {
          const version = document.createElement('details'); version.className = 'mrv-coverage-version';
          const chosen = preview.ok && preview.db.items.find(item => String(item.id) === row.id);
          const titoliConfronto = [t('rv_coverage_original', 'Bozza originale controllata'), t('rv_coverage_chosen', 'Anteprima con le decisioni attuali · non ricontrollata automaticamente')];
          /* Quale versione si approva o si modifica (Giacomo, 17/9: «così com'è» non diceva se l'originale
             o la proposta). Entrambi i bottoni agiscono sull'ANTEPRIMA con le decisioni (impronta di
             statoApprovazioni, editor da chosenValue): se l'anteprima coincide con la bozza, quella è l'originale. */
          const testoBozza = displayValue(item, { field: '$item' }, item);
          const soloOriginale = preview.ok && !!chosen && (window.MappAIConfrontoCore
            ? window.MappAIConfrontoCore.confronta(testoBozza, displayValue(chosen, { field: '$item' }, chosen)).modifiche === 0
            : testoBozza === displayValue(chosen, { field: '$item' }, chosen));
          const confronto = preview.ok && chosen ? confrontoHtml(displayValue(item, { field: '$item' }, item), displayValue(chosen, { field: '$item' }, chosen), titoliConfronto) : null;
          if (confronto) {
            version.innerHTML = '<summary>' + esc(t('rv_coverage_versions', 'Leggi il materiale e l’anteprima delle tue scelte')) + '</summary>' + confronto;
            collegaConfronti(version);
          } else version.innerHTML = '<summary>' + esc(t('rv_coverage_versions', 'Leggi il materiale e l’anteprima delle tue scelte')) + '</summary>' +
            '<h4>' + esc(t('rv_coverage_original', 'Bozza originale controllata')) + '</h4><p class="mrv-coverage-text">' + esc(displayValue(item, { field: '$item' }, item)) + '</p>' +
            '<h4>' + esc(t('rv_coverage_chosen', 'Anteprima con le decisioni attuali · non ricontrollata automaticamente')) + '</h4><p class="mrv-coverage-text">' +
            esc(!preview.ok ? (preview.conflicts.some(c => !c.issueId || c.code === 'stale_revision') ? t('rv_coverage_preview_global', 'I materiali o le fonti non corrispondono alla versione di questa revisione. Le approvazioni restano salvate, ma prima di continuare occorre riaprire la revisione sulla versione corretta del progetto.') : t('rv_coverage_preview_local', 'Questo materiale ha decisioni da completare o in conflitto. Apri la decisione per risolverle; gli altri materiali restano disponibili.')) :
              chosen ? displayValue(chosen, { field: '$item' }, chosen) : t('rv_coverage_excluded', 'Hai scelto di escludere questo materiale.')) + '</p>';
          detail.appendChild(version);
          if (editable) {
            const actions = document.createElement('div'); actions.className = 'mrv-coverage-actions';
            const exclusion = document.createElement('button'); exclusion.type = 'button'; exclusion.className = 'pm-btn-cancel';
            exclusion.setAttribute(excluded ? 'data-coverage-restore' : 'data-coverage-exclude', row.id);
            exclusion.textContent = excluded ? t('rv_material_restore', 'Ripristina') : t('rv_material_exclude', 'Escludi');
            exclusion.onclick = () => excludeMaterial([row.id], !excluded); actions.appendChild(exclusion);
            if (!preview.ok) {
              const blockedId = preview.unresolved?.[0] || preview.conflicts.find(c => c.issueId)?.issueId;
              if (blockedId) {
                const resolve = document.createElement('button'); resolve.type = 'button'; resolve.className = 'pm-btn-cancel';
                resolve.setAttribute('data-coverage-resolve', row.id); resolve.textContent = t('rv_material_resolve', 'Apri la decisione da risolvere');
                resolve.onclick = () => { activeFilter = 'all'; search = ''; Object.keys(facets).forEach(key => { facets[key] = ''; }); return navigate(blockedId); }; actions.appendChild(resolve);
              }
            }
            const approva = document.createElement('button'); approva.type = 'button';
            approva.className = approvato ? 'pm-btn-cancel' : 'pm-btn-primary';
            approva.setAttribute('data-coverage-approve', row.id); approva.setAttribute('aria-pressed', String(approvato));
            approva.textContent = soloOriginale
              ? (approvato ? t('rv_coverage_approved_unchanged', 'Invariato approvato · annulla') : t('rv_coverage_approve_unchanged', 'Approva invariato'))
              : (approvato ? t('rv_coverage_approved_proposal', 'Proposta approvata · annulla') : t('rv_coverage_approve_proposal', 'Approva proposta'));
            approva.onclick = async () => {
              if (busy || invalidEditors.size || closed) return;
              const impronta = approvazioni.impronte.get(row.id);
              if (!approvato && !impronta) { status.textContent = t('rv_coverage_approve_blocked', 'Risolvi prima le decisioni in conflitto: serve l’anteprima del materiale.'); return; }
              setReview(core().setManualCheck(getReview(), row.id, approvato ? null : impronta));
              coverageExpanded = true; render();
              const di = modal.querySelector('[data-coverage-approve="' + row.id + '"]'); if (di) di.focus();
              return save();
            };
            approva.disabled = !preview.ok;
            if (!excluded) actions.appendChild(approva);
            const citazioni = Array.isArray(item.citations) ? item.citations.filter(c => c && c.text) : [];
            if (fonte && citazioni.length) {
              const vedi = document.createElement('button'); vedi.type = 'button'; vedi.className = 'pm-btn-cancel';
              vedi.setAttribute('data-coverage-source', row.id);
              vedi.textContent = t('rv_source_show', 'Mostra le fonti citate');
              vedi.onclick = () => fonte.mostra(citazioni);
              actions.appendChild(vedi);
            }
            if (!excluded) canonicalFields(item).forEach(field => {
              const button = document.createElement('button'); button.type = 'button'; button.className = 'pm-btn-cancel';
              button.setAttribute('data-coverage-edit', field);
              button.textContent = (soloOriginale ? t('rv_coverage_edit_original', 'Modifica originale') : t('rv_coverage_edit_proposal', 'Modifica proposta')) + ' · ' + fieldName(field, item);
              button.onclick = () => openMaterialField(row.id, field);
              actions.appendChild(button);
            });
            detail.appendChild(actions);
          }
        } else {
          const missing = document.createElement('p'); missing.textContent = t('rv_coverage_item_missing', 'Il materiale indicato dal rapporto non è disponibile nella bozza salvata.'); detail.appendChild(missing);
        }
        box.appendChild(detail);
      });
      content.appendChild(box);
      const show = document.createElement('button'); show.type = 'button'; show.id = 'mrv-show-unchecked'; show.className = 'pm-btn-primary';
      show.textContent = (onlyExcluded ? t('rv_excluded_materials', 'Materiali esclusi') : t('rv_coverage_examine', 'Esamina i materiali rimasti')) + ' (' + (onlyExcluded ? rows.length : activeCount) + ')';
      show.onclick = () => { coverageExpanded = true; box.setAttribute('open', ''); modal.querySelector('#mrv-coverage-heading').focus(); };
      modal.querySelector('#mrv-coverage-details').appendChild(show);
    }
    function render() {
      const r = getReview(), approved = r.initial.status === 'approved', editable = r.initial.status === 'awaiting_review';
      /* Lo scorrimento non torna in cima a ogni ridisegno (Giacomo, 19/9/2026).
         `render()` ricostruisce tutto da zero, quindi dopo OGNI decisione l'area
         saltava all'inizio e si perdeva il punto in cui si stava leggendo. Si
         riprende la posizione quando la segnalazione attiva è la stessa; se si è
         cambiata voce, ripartire dall'alto è giusto. */
      const scrollPrima = content.scrollTop, issuePrima = activeIssueId;
      content.replaceChildren(); invalidEditors.clear(); proceed.disabled = false;
      const groups = updateFilters();
      renderOccurrences();
      filters.hidden = filterCount.hidden = !r.initial.issues.length;
      const query = search.trim().toLocaleLowerCase();
      function facetValues(issue, key) {
        const context = contextFor(issue);
        return key === 'area' ? areaRows(context).map(a => ({ id: a.id, label: a.label })) : key === 'kind' ?
          context.materialKind ? [{ id: context.materialKind, label: kindLabels[context.materialKind] || t('rv_material', 'Materiale') }] : [] :
          [{ id: reasonFor(issue), label: reasonLabels[reasonFor(issue)] }];
      }
      function matches(issue, except) {
        if (Object.keys(facets).some(key => key !== except && facets[key] && !facetValues(issue, key).some(row => row.id === facets[key]))) return false;
        return !query || [issueTarget(issue), issue.problem, fieldName(issue.target.field), displayValue(issue.before, issue.target, itemFor(issue, r)),
          ...Object.keys(facets).flatMap(key => facetValues(issue, key).map(row => row.label))].join(' ').toLocaleLowerCase().includes(query);
      }
      const allLabels = { area: t('rv_context_all_areas', 'Tutte le macroaree'), kind: t('rv_context_all_kinds', 'Tutti i materiali'), reason: t('rv_context_all_reasons', 'Tutti i motivi') };
      for (const key of Object.keys(facets)) {
        const choices = new Map(), counts = new Map();
        groups.all.forEach(issue => facetValues(issue, key).forEach(row => choices.set(row.id, row.label)));
        groups[activeFilter].filter(issue => matches(issue, key)).forEach(issue => facetValues(issue, key).forEach(row => counts.set(row.id, (counts.get(row.id) || 0) + 1)));
        const input = modal.querySelector('#mrv-' + key);
        input.innerHTML = '<option value="">' + esc(allLabels[key]) + '</option>' + Array.from(choices).sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) =>
          '<option value="' + esc(id) + '">' + esc(label) + ' (' + (counts.get(id) || 0) + ')</option>').join('');
        input.value = facets[key];
      }
      const matchingIssues = groups[activeFilter].filter(issue => matches(issue));
      visibleGroups = R.groupIssues(matchingIssues).flatMap(group => {
        const decisions = new Set(group.map(issue => {
          const d = r.initial.decisions[issue.id];
          return canonical([d?.choice || 'pending', d?.choice === 'manual' ? d.text : null]);
        }));
        // Each relationship needs its own complete sentence, even when one
        // field has the same suggested correction in several materials.
        return decisions.size > 1 || group.some(issue => individualIssues.has(issue.id) || itemFor(issue, r)?.kind === 'causal') ? group.map(issue => [issue]) : [group];
      });
      if (editingIssue && !visibleGroups.some(group => group.some(i => i.id === editingIssue.id))) visibleGroups.push([editingIssue]);
      modal.querySelector('#mrv-clear-filters').hidden = !query && !Object.values(facets).some(Boolean);
      if (!visibleGroups.some(group => group.some(issue => issue.id === activeIssueId))) activeIssueId = visibleGroups[0]?.[0].id || null;
      const selectedIndex = visibleGroups.findIndex(group => group.some(issue => issue.id === activeIssueId));
      const queue = modal.querySelector('#mrv-queue'); queue.replaceChildren();
      const outcomes = { pending: t('rv_pending', 'Da decidere'), kept: t('rv_outcome_kept', 'Testo mantenuto senza modifiche'),
        edited: t('rv_outcome_edited', 'Testo modificato da te'), applied: t('rv_outcome_applied', 'Proposta scelta'), excluded: t('rv_outcome_excluded', 'Esclusione scelta') };
      visibleGroups.forEach((group, index) => {
        const issue = group[0], selected = index === selectedIndex;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'mrv-queue-item';
        button.setAttribute('data-review-issue', issue.id); button.setAttribute('aria-current', selected ? 'true' : 'false');
        const pending = group.some(i => groups.pending.some(p => p.id === i.id));
        const conflict = groups.conflicts.some(c => c.code === 'conflicting_decisions' && group.some(i => i.id === c.issueId));
        const isNew = group.some(i => (r.initial.retrySummary?.newIssueIds || []).includes(i.id));
        button.innerHTML = chips(group, true) + (isNew ? '<span class="mrv-new-finding">' + esc(t('rv_context_new', 'Nuova segnalazione')) + '</span>' : '') + '<span class="mrv-queue-meta">' + (index + 1) + ' · ' + esc(fieldName(issue.target.field, itemFor(issue, r))) +
          (group.length > 1 ? ' · ' + group.length + ' ' + esc(t('rv_dashboard_targets', 'contenuti')) : '') + '</span><strong>' + esc(issueTarget(issue)) + '</strong><span class="mrv-queue-problem">' + esc(issue.problem || fieldName(issue.target.field)) + '</span><span class="mrv-queue-state" data-pending="' + pending + '">' + esc(conflict ? t('rv_decision_conflict', 'Scelte in conflitto') : pending ? outcomes.pending : outcomes[core().decisionOutcome(issue, r.initial.decisions[issue.id])]) + '</span>';
        button.onclick = () => navigate(issue.id); queue.appendChild(button);
      });
      modal.querySelector('#mrv-queue-count').textContent = visibleGroups.length + ' ' + t('rv_dashboard_in_list', 'voci in elenco') +
        (matchingIssues.length !== visibleGroups.length ? ' · ' + matchingIssues.length + ' ' + t('rv_context_findings', 'segnalazioni') : '') +
        (query || Object.values(facets).some(Boolean) ? ' · ' + t('rv_context_filtered', 'filtri attivi') : '');
      modal.querySelector('#mrv-detail-nav').hidden = !visibleGroups.length;
      /* La posizione dice DENTRO CHE COSA conta (Giacomo, 19/9/2026). Con il filtro
         «Da rivedere» una voce appena decisa esce dall'elenco, quindi il totale cala
         e «4 / 9» diventa «4 / 8»: sembra di essere tornati indietro dopo aver fatto
         un passo avanti. Il numero resta quello vero; a mancare era il nome
         dell'insieme. */
      modal.querySelector('#mrv-position').textContent = selectedIndex >= 0
        ? (selectedIndex + 1) + ' / ' + visibleGroups.length + ' ' + t('rv_nav_within', 'in') + ' «' + filterLabels[activeFilter] + '»' : '';
      modal.querySelector('#mrv-prev').disabled = selectedIndex <= 0;
      modal.querySelector('#mrv-next').disabled = selectedIndex < 0 || selectedIndex === visibleGroups.length - 1;
      modal.querySelector('#mrv-coverage-status').textContent = checkMessage() + (approved && r.initial.manualReview ? ' ' + t('rv_dashboard_teacher_checked', 'La revisione è stata completata dal docente.') : '');
      modal.querySelector('#mrv-coverage-label').textContent = r.initial.checkStatus === 'completed' ? t('rv_dashboard_complete', 'Completa') : t('rv_dashboard_partial', 'Parziale');
      modal.querySelector('#mrv-coverage-details').replaceChildren();
      const info = document.createElement('p');
      info.className = 'mrv-info';
      const currentDb = isFinal ? { items: manifest.review.final.items } : state().db;
      info.textContent = approved ? (core().gate(r, currentDb, r.sources).allowed ? t('rv_approved', 'Le decisioni sono state salvate. Questi contenuti sono approvati.') : t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.')) :
        !r.initial.issues.length ? (r.initial.checkStatus === 'completed' ? t('rv_none', 'Nessuna proposta di correzione. Puoi leggere i contenuti e continuare.') : checkMessage()) :
        groups.pending.length ? t('rv_dashboard_decide_help', 'Confronta il testo e la proposta, poi scegli. Dopo una decisione passerai alla segnalazione successiva.') :
        t('rv_decisions_complete', 'Tutte le segnalazioni hanno una decisione. Verifica la copertura del controllo prima di continuare.');
      content.appendChild(info);
      if (isFinal) {
        const shortBatches = Object.values(manifest.review.drafts?.B || {}).filter(draft =>
          Number.isFinite(draft.generation?.requested) && Number.isFinite(draft.generation?.produced) && draft.generation.produced < draft.generation.requested);
        if (shortBatches.length) {
          const batch = document.createElement('div'); batch.id = 'mrv-batch-coverage'; batch.className = 'mrv-retry-summary';
          batch.innerHTML = '<strong>' + esc(t('rv_batch_short_title', 'Il lotto contiene meno domande del previsto')) + '</strong>' + shortBatches.map(draft =>
            '<p>' + esc((draft.title || t('rv_material', 'Materiale')) + ': ' + draft.generation.produced + ' / ' + draft.generation.requested) + '</p>').join('') +
            '<p>' + esc(t('rv_batch_short_help', 'Questi numeri descrivono le domande ottenute alla generazione. Verifica quali obiettivi sono coperti prima di aggiungere altre domande.')) + '</p>';
          content.appendChild(batch);
        }
      }
      if (r.initial.retrySummary) {
        const retry = r.initial.retrySummary, summary = document.createElement('p');
        summary.className = 'mrv-retry-summary'; summary.id = 'mrv-retry-summary'; summary.setAttribute('role', 'status');
        summary.textContent = (retry.newIssueIds || []).length + ' ' + t('rv_context_new_findings', 'nuove segnalazioni') + ' · ' +
          retry.decisionsPreserved + ' ' + t('rv_context_preserved', 'decisioni conservate') +
          (typeof retry.targeted === 'number' ? ' · ' + retry.targeted + ' ' + t('rv_context_rechecked', 'materiali sottoposti al tentativo') : '') +
          (typeof retry.checked === 'number' ? ' · ' + retry.checked + ' ' + t('rv_coverage_completed_now', 'nuovi controlli completati') : '') +
          (typeof retry.remaining === 'number' ? ' · ' + retry.remaining + ' ' + t('rv_coverage_remaining', 'materiali ancora da verificare') : '') +
          (typeof retry.reused === 'number' ? ' · ' + retry.reused + ' ' + t('rv_context_reused', 'controlli riutilizzati') : '');
        content.appendChild(summary);
      }
      if (r.initial.issues.length) {
        const history = document.createElement('details'); history.className = 'mrv-summary';
        history.innerHTML = '<summary>' + esc(t('rv_dashboard_summary', 'Riepilogo delle tue decisioni')) + '</summary>';
        const summary = document.createElement('p'); summary.id = 'mrv-decision-summary';
        summary.setAttribute('aria-live', 'polite'); history.appendChild(summary); content.appendChild(history); updateSummary();
      }
      if (!visibleGroups.length && r.initial.issues.length && !(isFinal && r.initial.checkStatus !== 'completed' && activeFilter === 'pending' && !groups.pending.length && !query && !Object.values(facets).some(Boolean))) {
        const empty = document.createElement('p'); empty.id = 'mrv-filter-empty';
        empty.textContent = query || Object.values(facets).some(Boolean) ? t('rv_context_no_results', 'Nessuna segnalazione corrisponde ai filtri. Cambia la selezione o usa Azzera i filtri.') : activeFilter === 'pending' ? t('rv_no_pending', 'Non ci sono decisioni da rivedere. Puoi consultare quelle già prese con il filtro Già decise.') : t('rv_no_decided', 'Non ci sono ancora decisioni già prese.');
        content.appendChild(empty);
      }
      const exclusionIds = new Set(isFinal ? r.initial.issues.filter(i => i.target.kind === 'item' && core().decisionOutcome(i, r.initial.decisions[i.id]) === 'excluded').map(i => String(i.target.id)) : []);
      const excludedItems = isFinal ? r.baseSnapshot.items.filter(item => exclusionIds.has(String(item.id)) && core().previewItem(r, { items: manifest.review.final.items }, String(item.id), { sources: r.sources }).excluded) : [];
      if (r.initial.checkStatus !== 'completed') {
        const report = r.initial.report || {}, coverage = report.copertura || {};
        const residuals = isFinal ? window.MappAIReviewContext.incompleteMaterials(report, r.baseSnapshot.items) : [];
        const approvazioni = statoApprovazioni(r);
        const unchecked = isFinal ? residuals.filter(row => !approvazioni.esclusi.has(row.id)).length : (coverage.nodiSaltati || []).length + (coverage.linkSaltati || []).length;
        const box = document.createElement('div'); box.id = 'mrv-unchecked';
        box.innerHTML = (unchecked ? '<p>' + esc(t('rv_remaining_checks', 'Parti ancora da controllare:')) + ' ' + unchecked +
          (approvazioni.approvati.size ? ' · ' + approvazioni.approvati.size + ' ' + t('rv_coverage_approved_count', 'approvati da te') : '') + '.</p>' : '') +
          '<p>' + esc(t('rv_retry_help', 'Le bozze e le decisioni sono salvate. Puoi riprovare il controllo senza rigenerare i materiali, oppure riprendere più tardi.')) + '</p>';
        modal.querySelector('#mrv-coverage-details').appendChild(box);
        if (!isFinal && (coverage.linkSaltati || []).length) {
          const list = document.createElement('ul');
          const labels = new Map((r.baseSnapshot.nodes || []).map(n => [n.id, n.label || n.id]));
          coverage.linkSaltati.forEach(link => {
            const row = document.createElement('li');
            row.textContent = (labels.get(link.source) || link.source) + ' → ' + (link.rel || '') + ' → ' +
              (labels.get(link.target) || link.target) + ': ' + (link.motivo || t('rv_link_unchecked', 'Controllo non completato.'));
            list.appendChild(row);
          });
          box.appendChild(list);
        }
        if (isFinal) {
          const ids = new Set(residuals.map(row => row.id));
          const extra = excludedItems.filter(item => !ids.has(String(item.id)))
            .map(item => ({ id: String(item.id), item, claims: [], reason: '', error: '' }));
          if (residuals.length || extra.length) renderMaterialCoverage(r, residuals.concat(extra), editable, groups.pending.length, approvazioni);
        }
      }
      if (isFinal && r.initial.checkStatus === 'completed') {
        const excludedRows = excludedItems.map(item => ({ id: String(item.id), item, claims: [], reason: '', error: '' }));
        if (excludedRows.length) renderMaterialCoverage(r, excludedRows, editable, groups.pending.length, statoApprovazioni(r));
      }
      for (const group of visibleGroups) {
        const issue = group[0], item = itemFor(issue, r);
        const card = document.createElement('section'); card.className = 'pm-section mrv-card';
        card.hidden = !group.some(i => i.id === activeIssueId);
        card.setAttribute('data-review-card', issue.id);
        const title = issue.problem || fieldName(issue.target.field);
        const targets = group.map(i => i.target.kind === 'item' ? (itemFor(i, r)?.title || itemFor(i, r)?.question || itemFor(i, r)?.text || t('rv_material', 'Materiale')) :
          i.target.kind === 'link' ? readable(i.before, i.target) : nodeLabel(i.target.id));
        const itemContext = item ? '<p class="mrv-coverage-text"' + (item.kind === 'causal' ? ' data-relation' : '') + '>' + esc(displayValue(item, { field: '$item' }, item)) + '</p>' : '';
        const references = referenceView(readable(issue.before, issue.target, item) + '\n' + (issue.hasProposal ? readable(issue.after, issue.target, item) : '')).mapping;
        const proposedItem = item?.kind === 'causal' && issue.hasProposal && issue.target.field !== '$item' ? Object.assign({}, item, { [issue.target.field]: issue.after }) : null;
        const change = issue.hasProposal && !proposedItem ? core().textChange(issue.before, issue.after) : null;
        const compact = change && issue.before.length > 500 && change.end - change.start < issue.before.length / 2;
        let left = compact ? Math.max(0, issue.before.lastIndexOf('\n', change.start - 1) + 1, change.start - 100) : 0;
        const nextLine = compact ? issue.before.indexOf('\n', change.end) : -1;
        let right = compact ? Math.min(nextLine < 0 ? issue.before.length : nextLine, change.end + 100) : 0;
        // Keep words and source markers whole so a cropped reference can still be rendered.
        if (compact) {
          while (left > 0 && /\S/.test(issue.before[left - 1])) left--;
          while (right < issue.before.length && /\S/.test(issue.before[right])) right++;
        }
        const before = compact ? (left ? '…' : '') + issue.before.slice(left, right) + (right < issue.before.length ? '…' : '') : proposedItem ? item : issue.before;
        const after = compact ? (left ? '…' : '') + issue.before.slice(left, change.start) + change.after + issue.before.slice(change.end, right) + (right < issue.before.length ? '…' : '') : proposedItem || issue.after;
        const beforeText = displayValue(before, issue.target, item), afterText = issue.hasProposal ? displayValue(after, proposedItem ? { field: '$item' } : issue.target, item) : '';
        // con il motore di confronto si evidenzia anche la proposta che sostituisce un materiale intero (testi mostrati, non oggetti); un'esclusione (after null) no
        const confrontabile = issue.hasProposal && after != null && (window.MappAIConfrontoCore || (typeof before === 'string' && typeof after === 'string'));
        const highlighted = confrontabile ? highlightedValues(beforeText, afterText) : [esc(beforeText), esc(afterText)];
        card.innerHTML = chips(group) + '<p class="mrv-eyebrow">' + esc(t('rv_context_editing', 'Stai correggendo:')) + ' ' + esc(fieldName(issue.target.field, item)) + ' · ' + esc(issueTarget(issue)) + '</p>' +
          '<p class="mrv-reason" data-review-reason="' + esc(reasonFor(issue)) + '">' + esc(reasonLabels[reasonFor(issue)]) + '</p><h3' + (!card.hidden ? ' id="mrv-current-title"' : '') + ' tabindex="-1">' + esc(title) + '</h3>' +
          (itemContext ? '<details class="mrv-item-context"><summary>' + esc(t('rv_dashboard_full_item', 'Leggi l’attività completa')) + '</summary>' + itemContext + '</details>' : '') +
          (group.length > 1 ? '<details class="mb-2" data-review-targets open><summary>' + esc(t('rv_context_shared', 'La stessa decisione riguarda questi contenuti')) + ' (' + group.length + ')</summary><ul>' + targets.map((x, i) => '<li>' +
            chips([group[i]]) + esc(referenceView(x).text) + '</li>').join('') + '</ul></details>' : '') +
          '<div data-conflict></div><div class="mrv-comparison"><div class="mrv-before"><p class="mrv-field-label">' + esc(t('rv_before', 'Testo attuale')) + '</p><p class="whitespace-pre-wrap mb-3">' + highlighted[0] + '</p></div>' +
          (issue.hasProposal ? '<div class="mrv-proposal"><p class="mrv-field-label">' + esc(t('rv_proposal', 'Proposta')) + '</p><p class="whitespace-pre-wrap mb-3">' + highlighted[1] + '</p></div></div>' +
            (compact ? '<details data-full-change class="mb-3"><summary>' + esc(t('rv_full_change', 'Leggi il testo completo prima e dopo')) + '</summary><p class="font-bold">' + esc(t('rv_before', 'Testo attuale')) + '</p><p class="whitespace-pre-wrap">' + esc(displayValue(issue.before, issue.target, item)) + '</p><p class="font-bold">' + esc(t('rv_proposal', 'Proposta')) + '</p><p class="whitespace-pre-wrap">' + esc(displayValue(issue.after, issue.target, item)) + '</p></details>' : '') +
            (issue.citationAdditions?.length ? '<p data-added-sources class="mb-3">' + esc(t('rv_added_sources', 'La proposta collega anche le fonti originali dei nuovi richiami.')) + '</p>' : '') :
            '</div><p class="mb-3" data-no-proposal>' + esc(issue.origin === 'teacher' ? t('rv_coverage_teacher_edit', 'Hai aperto questa scheda per rivedere il materiale. Puoi modificarlo o mantenere il testo dopo averlo verificato.') : t('rv_no_proposal', 'Il giudice segnala un problema, ma non propone una correzione pronta. Puoi modificare il contenuto oppure mantenerlo senza modifiche.')) + '</p>') +
          (references.length ? '<details class="mb-3" data-references><summary>' + esc(t('rv_text_references', 'Fonti richiamate nel testo')) + '</summary>' + references.map(ref => '<p class="mt-2"><strong>' + esc(ref.label + ' — ' + (ref.source ? ref.source.title + (ref.source.page ? ' · ' + t('rv_page', 'Pagina') + ' ' + ref.source.page : '') : t('rv_reference_unknown', 'Fonte da verificare'))) + '</strong></p>' + (ref.source ? '<p class="whitespace-pre-wrap">' + esc(ref.source.text) + '</p>' : '')).join('') + '</details>' : '') +
          (issue.origin === 'teacher' && !evidenceRows(issue.evidence).length ? '' : evidencePreview(issue, r, value => referenceView(value).text) + '<details class="mb-3"><summary>' + esc(t('rv_evidence', 'Fonte e motivo della segnalazione')) + '</summary>' + evidenceHtml(issue, r, value => referenceView(value).text) + '</details>') +
          (isFinal && issue.target.kind === 'item' ? '<button type="button" class="pm-btn-cancel mrv-find-occurrences" data-find-occurrences>' + esc(t('rv_occurrences_other', 'Cerca altre occorrenze')) + '</button>' : '') +
          '<div data-editor></div><div data-relation-preview></div><p data-choice class="text-sm mt-2" aria-live="polite"></p><div data-actions></div>';
        const occurrenceButton = card.querySelector('[data-find-occurrences]');
        if (occurrenceButton) occurrenceButton.onclick = () => findOccurrences(issue);
        const actions = card.querySelector('[data-actions]'), editor = card.querySelector('[data-editor]'), choiceLabel = card.querySelector('[data-choice]');
        let localEditValue, hasLocalEdit = false;
        function renderRelation() {
          if (item?.kind !== 'causal') return;
          const box = card.querySelector('[data-relation-preview]'); box.className = 'mrv-relation-preview';
          let currentReview = getReview();
          if (hasLocalEdit) {
            if (!currentReview.initial.issues.some(i => i.id === issue.id)) currentReview = core().addIssue(currentReview, issue);
            currentReview = core().setDecision(currentReview, issue.id, 'manual', { text: localEditValue });
          }
          currentReview = { ...currentReview, initial: { ...currentReview.initial, issues: currentReview.initial.issues.filter(i => i.target.kind !== 'item' || String(i.target.id) === String(item.id)) } };
          const preview = window.MappAIReviewContext.occurrenceSnapshot(currentReview, manifest.review.final.items, core());
          const conflicts = !preview.ok;
          const result = preview.items?.find(i => String(i.id) === String(item.id) && !preview.excludedIds.includes(String(i.id)));
          box.innerHTML = '<p class="mrv-field-label">' + esc(t('rv_relation_preview', 'Relazione risultante')) + '</p>';
          if (conflicts || !result) {
            const message = document.createElement('p'); message.setAttribute('role', 'status');
            message.textContent = conflicts ? t('rv_relation_conflict', 'Risolvi le decisioni in conflitto per vedere la relazione risultante.') : t('rv_relation_excluded', 'Questa relazione è esclusa dai materiali.');
            box.appendChild(message); return;
          }
          const fields = ['question', 'text', 'answer'];
          box.innerHTML += '<p class="mrv-relation-sentence" data-relation-sentence aria-live="polite" aria-atomic="true">' + fields.map(field => {
            const value = typeof result[field] === 'string' ? result[field] : '';
            return '<span data-relation-part="' + field + '"' + (value !== item[field] ? ' data-changed="true"' : '') + '>' +
              esc(referenceView(value).text || '[' + fieldName(field, item) + ']') + '</span>';
          }).join(' ') + '</p><p class="mrv-relation-help">' + esc(t('rv_relation_read_help', 'Rileggi le tre parti come una sola frase. Le parti evidenziate contengono le modifiche scelte.')) + '</p>';
          // ponytail: one known editorial residue, not a general grammar checker.
          // Extend only with unambiguous examples; never rewrite teacher text silently.
          if (/\bcon\s+facendo\b/iu.test(fields.map(f => result[f] || '').join(' '))) {
            const hint = document.createElement('div'); hint.className = 'mrv-relation-hint'; hint.setAttribute('data-relation-hint', ''); hint.setAttribute('role', 'status');
            const text = document.createElement('p'); text.textContent = t('rv_relation_gerund_hint', 'Raccordo da rileggere: «con facendo». Se intendi descrivere come avviene l’azione, puoi usare «facendo».'); hint.appendChild(text);
            if (editable) fields.forEach(field => {
              const input = editor.querySelector('[data-review-field="' + field + '"]');
              if (!input || !/\bcon\s+facendo\b/iu.test(input.value)) return;
              const fix = document.createElement('button'); fix.type = 'button'; fix.className = 'pm-btn-cancel'; fix.disabled = busy;
              fix.setAttribute('data-relation-suggestion', field); fix.textContent = t('rv_relation_use_gerund', 'Usa «facendo»');
              fix.onclick = () => {
                if (busy || getReview().initial.status !== 'awaiting_review') return;
                input.value = input.value.replace(/\bcon\s+(facendo)\b/giu, '$1'); input.oninput(); input.focus();
              };
              hint.appendChild(fix);
            });
            box.appendChild(hint);
          }
          if (editable) {
            const buttons = document.createElement('div'); buttons.className = 'mrv-relation-fields';
            fields.forEach(field => {
              const button = document.createElement('button'); button.type = 'button'; button.className = 'pm-btn-cancel'; button.disabled = busy;
              button.setAttribute('data-relation-edit', field);
              // come nei materiali (17/9/26): la parte già cambiata dalle decisioni è una proposta, l'altra è l'originale
              const cambiata = (typeof result[field] === 'string' ? result[field] : '') !== item[field];
              button.textContent = (cambiata ? t('rv_coverage_edit_proposal', 'Modifica proposta') : t('rv_coverage_edit_original', 'Modifica originale')) + ' · ' + fieldName(field, item);
              button.onclick = async () => {
                if (busy) return;
                const input = editor.querySelector('[data-review-field="' + field + '"]');
                if (input) { input.focus(); return; }
                await openMaterialField(item.id, field);
                if (saveError || closed || busy) return;
                const active = content.querySelector('.mrv-card:not([hidden])');
                if (!active?.querySelector('[data-review-field="' + field + '"]')) await active?.querySelector('[data-review-choice="manual"]')?.click();
                active?.querySelector('[data-review-field="' + field + '"]')?.focus();
              };
              buttons.appendChild(button);
            });
            box.appendChild(buttons);
          }
        }
        const labels = { pending: t('rv_pending', 'Da decidere'), accept: issue.after === null && ['$item', '$link'].includes(issue.target.field) ? t('rv_accept_exclusion', 'Escludi questo elemento') : t('rv_accept', 'Applica la proposta'), reject: t('rv_reject', 'Mantieni il testo senza modifiche'), manual: t('rv_edit', 'Modifica il testo') };
        const conflict = groups.conflicts.find(c => c.code === 'conflicting_decisions' && group.some(i => i.id === c.issueId));
        const otherIssue = conflict && r.initial.issues.find(i => i.id === conflict.otherIssueId);
        if (otherIssue) {
          const otherDecision = r.initial.decisions[otherIssue.id];
          const box = document.createElement('div'); box.className = 'mrv-proposal mb-3'; box.setAttribute('data-decision-conflict', ''); box.setAttribute('role', 'alert');
          box.innerHTML = '<p class="font-bold">' + esc(t('rv_decision_conflict', 'Scelte in conflitto')) + '</p><p>' +
            esc(t('rv_decision_conflict_help', 'La scelta è salvata, ma un’altra decisione modifica lo stesso contenuto in modo diverso. Applicare di nuovo non risolve il conflitto. Puoi conservare la versione già scelta qui sotto, oppure rivedere l’altra decisione.')) +
            '</p><p class="whitespace-pre-wrap">' + esc(displayValue(otherDecision.choice === 'manual' ? otherDecision.text : otherIssue.after, otherIssue.target, itemFor(otherIssue, r))) + '</p>';
          const openOther = document.createElement('button'); openOther.type = 'button'; openOther.className = 'pm-btn-cancel';
          openOther.textContent = t('rv_conflict_open_other', 'Rivedi l’altra decisione');
          openOther.onclick = async () => {
            if (busy || invalidEditors.size) return;
            await pendingSave; if (saveError || closed || busy) return;
            /* Non si azzerano filtro, ricerca e faccette a prescindere (Giacomo,
               19/9/2026: «rimango incastrato in un loop»). Prima si buttava via
               la selezione SEMPRE e senza dirlo, e tornando indietro non la si
               ritrovava. Si allargano solo se l'altra decisione non sarebbe
               visibile con i filtri attuali, e in quel caso lo si dichiara. */
            const visibile = visibleGroups.some(g => g.some(i => i.id === otherIssue.id));
            if (!visibile) {
              activeFilter = 'all'; search = ''; modal.querySelector('#mrv-search').value = '';
              Object.keys(facets).forEach(key => { facets[key] = ''; });
              status.textContent = t('rv_conflict_widened', 'Filtri azzerati per mostrarti l’altra decisione.');
            }
            return navigate(otherIssue.id);
          };
          box.appendChild(openOther); card.querySelector('[data-conflict]').appendChild(box);
          labels.reject = t('rv_conflict_keep_other', 'Conserva l’altra scelta');
        }
        function showChoice() {
          renderRelation();
          const choices = new Set(group.map(i => core().decisionOutcome(i, getReview().initial.decisions[i.id])));
          const outcomes = { pending: t('rv_pending', 'Da decidere'), kept: t('rv_outcome_kept', 'Testo mantenuto senza modifiche'),
            edited: t('rv_outcome_edited', 'Testo modificato da te'), applied: t('rv_outcome_applied', 'Proposta scelta'), excluded: t('rv_outcome_excluded', 'Esclusione scelta') };
          choiceLabel.textContent = choices.size === 1 ? outcomes[Array.from(choices)[0]] : t('rv_mixed', 'Decisioni diverse: ogni destinatario mantiene la propria scelta.');
          actions.querySelectorAll('[data-review-choice]').forEach(button => {
            const choice = button.getAttribute('data-review-choice');
            button.setAttribute('aria-pressed', String(group.every(i => getReview().initial.decisions[i.id]?.choice === choice)));
            if (choice === 'accept' && otherIssue) button.disabled = !editable || group.every(i => getReview().initial.decisions[i.id]?.choice === 'accept');
            if (choice === 'pending') button.hidden = choices.size === 1 && choices.has('pending');
          });
          const entry = Array.from(modal.querySelectorAll('[data-review-issue]')).find(button => button.getAttribute('data-review-issue') === issue.id);
          if (entry && !card.hidden) {
            const state = decisionState(), pending = state.pending.some(i => group.some(g => g.id === i.id));
            const conflict = state.conflicts.some(c => c.code === 'conflicting_decisions' && group.some(g => g.id === c.issueId));
            const label = entry.querySelector('.mrv-queue-state');
            label.textContent = conflict ? t('rv_decision_conflict', 'Scelte in conflitto') : pending ? outcomes.pending : choiceLabel.textContent;
            label.setAttribute('data-pending', String(pending));
          }
        }
        const allowed = issue.target.kind !== 'item' || issue.target.field === '$item' || itemFields.includes(issue.target.field);
        function chosenValue() {
          const decision = getReview().initial.decisions[issue.id];
          return decision?.choice === 'manual' && own(decision, 'text') ? decision.text :
            decision?.choice === 'accept' && issue.hasProposal ? issue.after : issue.before;
        }
        function editBox(focus) {
          editor.replaceChildren(); hasLocalEdit = false;
          let current = clone(chosenValue());
          const originalValue = clone(current);
          let draftValue = clone(current);
          if (current == null && issue.target.field === '$item') current = clone(item);
          function changed(value) {
            if (isFinal) {
              draftValue = clone(value); localEditValue = clone(value); hasLocalEdit = true; renderRelation();
              if (canonical(value) === canonical(originalValue)) invalidEditors.delete(issue.id + ':draft');
              else invalidEditors.add(issue.id + ':draft');
              status.textContent = t('rv_edit_draft', 'Modifica non salvata. Salva oppure annulla prima di continuare.');
              proceed.disabled = invalidEditors.size > 0;
              return;
            }
            proceed.disabled = invalidEditors.size > 0;
            decide(group, 'manual', value); showChoice();
          }
          function control(parent, field, value, update, object) {
            const errorKey = issue.id + ':' + field;
            const label = document.createElement('label'); label.className = 'block mt-3'; label.textContent = fieldName(field, object);
            if (Array.isArray(value) || field === 'options' || field === 'criteria' || field === 'criteri') {
              const list = Array.isArray(value) ? value.slice() : [];
              const listBox = document.createElement('div'); label.appendChild(listBox);
              function drawList() {
                listBox.replaceChildren();
                list.forEach((entry, index) => {
                  const row = document.createElement('label'); row.className = 'block mt-2';
                  row.textContent = fieldName(field) + ' ' + (field === 'options' ? String.fromCharCode(65 + index) : index + 1);
                  const input = document.createElement('textarea'), refs = referenceView(typeof entry === 'string' ? entry : ''); input.rows = 2; input.className = 'w-full border rounded p-2'; input.value = refs.text;
                  input.oninput = () => { list[index] = restoreReferences(input.value, refs); update(list.slice()); };
                  row.appendChild(input); listBox.appendChild(row);
                  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pm-btn-cancel'; remove.textContent = t('rv_remove_entry', 'Rimuovi questa voce');
                  remove.onclick = () => { list.splice(index, 1); update(list.slice()); drawList(); listBox.querySelector('textarea')?.focus(); };
                  listBox.appendChild(remove);
                });
                const add = document.createElement('button'); add.type = 'button'; add.className = 'pm-btn-cancel'; add.textContent = t('rv_add_entry', 'Aggiungi una voce');
                add.onclick = () => { list.push(''); update(list.slice()); drawList(); const all = listBox.querySelectorAll('textarea'); all[all.length - 1]?.focus(); };
                listBox.appendChild(add);
              }
              drawList(); parent.appendChild(label); return;
            }
            let input, refs;
            if (field === 'correctIndex') {
              input = document.createElement('select');
              input.innerHTML = '<option value="">' + esc(t('rv_choose_correct', 'Scegli la risposta corretta')) + '</option>' + (object?.options || item?.options || []).map((x, i) => '<option value="' + i + '">' + esc(String.fromCharCode(65 + i) + '. ' + referenceView(x).text) + '</option>').join('');
              input.value = Number.isInteger(value) ? String(value) : '';
            } else if (field === 'source' || field === 'target') {
              input = document.createElement('select'); input.innerHTML = (state().db.nodes || []).map(n => '<option value="' + esc(n.id) + '">' + esc(n.label) + '</option>').join(''); input.value = value;
            } else if (field === 'lines') {
              input = document.createElement('input'); input.type = 'number'; input.min = '3'; input.max = '12'; input.step = '1'; input.value = value;
            } else { input = document.createElement('textarea'); input.rows = 4; refs = referenceView(typeof value === 'string' ? value : ''); input.value = refs.text;
              if (refs.mapping.length) { const hint = document.createElement('p'); hint.className = 'text-sm'; hint.textContent = t('rv_reference_edit_help', 'I richiami alle fonti restano collegati quando modifichi il testo.'); label.appendChild(hint); }
            }
            input.className = 'w-full border rounded p-3 font-sans';
            input.setAttribute('data-review-field', field);
            input.oninput = input.onchange = () => {
              const number = field === 'correctIndex' || field === 'lines';
              if (number && (input.value === '' || !Number.isInteger(Number(input.value)))) {
                if (!isFinal) invalidateManualCheck();
                invalidEditors.add(errorKey); proceed.disabled = true; status.textContent = t('rv_invalid_edit', 'Completa il campo della modifica prima di continuare.'); return;
              }
              invalidEditors.delete(errorKey);
              update(number ? Number(input.value) : refs ? restoreReferences(input.value, refs) : input.value);
            };
            label.appendChild(input); parent.appendChild(label);
          }
          if (issue.target.field === '$item') {
            const fields = Array.from(new Set((current?.kind === 'causal' ? ['question', 'text', 'answer'] : []).concat(canonicalFields(current), current?.kind === 'mc' ? ['question', 'options', 'correctIndex'] : [])));
            fields.forEach(field => control(editor, field, current[field], value => { current[field] = value; changed(clone(current)); }, current));
          } else if (issue.target.field === '$link') {
            ['source', 'rel', 'target'].forEach(field => control(editor, field, current[field], value => { current[field] = value; changed(clone(current)); }, current));
          } else control(editor, issue.target.field, current, changed, item);
          if (isFinal) {
            const finish = () => {
              Array.from(invalidEditors).filter(k => k.startsWith(issue.id + ':')).forEach(k => invalidEditors.delete(k));
              editingIssue = null; coverageExpanded = true; render();
              (modal.querySelector('[data-coverage-item="' + issue.target.id + '"] summary') || modal.querySelector('#mrv-current-title'))?.focus();
            };
            const saveEdit = document.createElement('button'); saveEdit.type = 'button'; saveEdit.className = 'pm-btn-primary';
            saveEdit.setAttribute('data-edit-save', ''); saveEdit.textContent = t('rv_edit_save', 'Salva modifica');
            saveEdit.onclick = async () => {
              if (busy || Array.from(invalidEditors).some(k => k !== issue.id + ':draft')) return;
              if (canonical(draftValue) !== canonical(originalValue)) {
                invalidEditors.delete(issue.id + ':draft');
                await decide(group, 'manual', draftValue);
              }
              if (!saveError) finish();
            };
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'pm-btn-cancel';
            cancel.setAttribute('data-edit-cancel', ''); cancel.textContent = t('rv_edit_cancel', 'Annulla modifica'); cancel.onclick = finish;
            editor.appendChild(saveEdit); editor.appendChild(cancel);
          }
          renderRelation();
          if (focus) editor.querySelector('textarea,select,input')?.focus();
        }
        for (const choice of ['accept', 'reject', 'manual', 'pending']) {
          if (choice === 'accept' && (!issue.hasProposal || !allowed) || choice === 'manual' && !allowed) continue;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'pm-btn-cancel'; button.disabled = !editable;
          button.setAttribute('data-review-choice', choice);
          button.textContent = choice === 'pending' ? t('rv_undo', 'Annulla decisione') : labels[choice];
          button.onclick = async () => {
            if (isFinal && choice === 'manual' && editor.querySelector('[data-edit-save]')) { editor.querySelector('textarea,select,input')?.focus(); return; }
            if (isFinal && invalidEditors.size) { status.textContent = t('rv_edit_draft', 'Modifica non salvata. Salva oppure annulla prima di continuare.'); return; }
            Array.from(invalidEditors).filter(k => k.startsWith(issue.id + ':')).forEach(k => invalidEditors.delete(k));
            hasLocalEdit = false;
            if (choice !== 'manual') editingIssue = null;
            const current = chosenValue();
            const saved = isFinal && choice === 'manual' ? undefined : decide(group, choice, choice === 'manual' ? current : undefined); showChoice();
            if (choice === 'manual') editBox(true); else {
              editor.replaceChildren(); proceed.disabled = invalidEditors.size > 0;
              await saved;
              if (!saveError && !closed) {
                const index = visibleGroups.findIndex(g => g.some(i => i.id === issue.id));
                if (choice !== 'pending') activeIssueId = visibleGroups[index + 1]?.[0].id || visibleGroups[index - 1]?.[0].id || null;
                render(); (modal.querySelector('#mrv-current-title') || filters.querySelector('[data-review-filter="' + activeFilter + '"]')).focus();
              }
            }
          };
          actions.appendChild(button);
        }
        if (isFinal && issue.target.kind === 'item' && editable && !(issue.hasProposal && issue.target.field === '$item' && issue.after === null)) {
          const exclude = document.createElement('button'); exclude.type = 'button'; exclude.className = 'pm-btn-cancel'; exclude.textContent = t('rv_exclude_material', 'Escludi dagli esercizi');
          exclude.onclick = () => excludeMaterial(Array.from(new Set(group.map(i => String(i.target.id)))), true);
          actions.appendChild(exclude);
        }
        showChoice();
        if ((r.initial.decisions[issue.id] || {}).choice === 'manual' || editingIssue?.id === issue.id) editBox(false);
        if (!editable) editor.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = true; });
        content.appendChild(card);
      }
      if (!isFinal && editable) {
        const box = document.createElement('details'); box.id = 'mrv-other-nodes';
        const summary = document.createElement('summary'); summary.textContent = t('rv_other', 'Correggi anche un nodo non segnalato'); box.appendChild(summary);
        const label = document.createElement('label'); label.className = 'block font-bold'; label.textContent = t('rv_other', 'Correggi anche un nodo non segnalato');
        const select = document.createElement('select'); select.className = 'border rounded p-2 block w-full';
        select.innerHTML = '<option value="">' + esc(t('rv_choose_node', 'Scegli un nodo')) + '</option>' + (state().db.nodes || []).map(n => '<option value="' + esc(n.id) + '">' + esc(n.label) + '</option>').join('');
        const field = document.createElement('select'); field.setAttribute('aria-label', t('rv_choose_field', 'Campo da modificare')); field.innerHTML = ['desc', 'label'].map(f => '<option value="' + f + '">' + esc(fieldName(f)) + '</option>').join('');
        const preview = document.createElement('p'); preview.className = 'whitespace-pre-wrap mt-3';
        const add = document.createElement('button'); add.type = 'button'; add.className = 'pm-btn-cancel'; add.id = 'mrv-add-node'; add.disabled = true;
        add.textContent = t('rv_add_node_review', 'Aggiungi alla revisione');
        select.onchange = field.onchange = () => {
          const n = state().db.nodes.find(n => String(n.id) === select.value);
          preview.textContent = n ? String(n[field.value || 'desc'] || '') : ''; add.disabled = !n;
        };
        add.onclick = async () => {
          if (!select.value || busy || invalidEditors.size) return;
          await pendingSave; if (saveError || closed || busy) return;
          const n = state().db.nodes.find(n => String(n.id) === select.value);
          const next = core().addIssue(getReview(), { target: { kind: 'node', id: n.id, field: field.value || 'desc' },
            problem: t('rv_teacher_edit', 'Modifica del docente') + ': ' + n.label, origin: 'teacher', blocking: true }, state().db);
          invalidateManualCheck(); setReview(next);
          activeIssueId = next.initial.issues.find(i => i.origin === 'teacher' && i.target.kind === 'node' && String(i.target.id) === String(n.id) && i.target.field === (field.value || 'desc'))?.id || null;
          activeFilter = 'pending'; search = ''; modal.querySelector('#mrv-search').value = '';
          Object.keys(facets).forEach(key => { facets[key] = ''; });
          await save(); if (!closed) { render(); modal.querySelector('#mrv-current-title')?.focus(); }
        };
        label.appendChild(select); box.appendChild(field); box.appendChild(label); box.appendChild(preview); box.appendChild(add); content.appendChild(box);
      }
      if (!isFinal) ['Local', 'Disk'].forEach(kind => {
        const draft = state()['_review' + kind + 'Draft'];
        if (!draft || draft.vaultPath !== vaultPath) return;
        const recover = document.createElement('button'); recover.type = 'button'; recover.className = 'pm-btn-cancel';
        recover.textContent = kind === 'Local' ? t('rv_recover_local', 'Apri la bozza locale conservata') : t('rv_recover_disk', 'Apri la copia della cartella conservata');
        recover.onclick = async () => { applySnapshot(state().db, draft.db); cache(); close(); await R.requireApproved(); };
        content.appendChild(recover);
      });
      const manual = modal.querySelector('#mrv-manual'); manual.replaceChildren();
      proceed.hidden = editable && r.initial.checkStatus !== 'completed' && !manualConfirmed && !statoApprovazioni(r).tutti;
      if (r.initial.checkStatus !== 'completed' && editable) {
        const outcome = document.createElement('p'); outcome.id = 'mrv-check-result'; outcome.className = 'text-sm font-bold';
        outcome.textContent = checkMessage(); manual.appendChild(outcome);
        const help = document.createElement('p'); help.className = 'text-sm';
        help.textContent = isFinal
          ? t('rv_check_continue_help_final', 'Anche senza nuove segnalazioni, il controllo può restare parziale. Per continuare approva uno per uno i materiali rimasti, oppure conferma in blocco di averli verificati. Riprovare il controllo serve solo quando è mancata una risposta.')
          : t('rv_check_continue_help', 'Anche senza nuove segnalazioni, il controllo può restare parziale. Per continuare serve un controllo completo oppure la tua conferma di aver verificato anche le parti rimaste scoperte.');
        manual.appendChild(help);
        const manualOption = document.createElement('details'); manualOption.id = 'mrv-manual-option'; manualOption.className = 'mt-3 text-sm';
        manualOption.innerHTML = '<summary>' + esc(t('rv_manual_option', 'Scelgo di completare io il controllo')) + '</summary>';
        const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = 'mrv-manual-confirm'; input.checked = manualConfirmed;
        label.className = 'block mt-2';
        input.onchange = () => { manualConfirmed = input.checked; proceed.hidden = !manualConfirmed && !statoApprovazioni(getReview()).tutti; updateFilters(); };
        label.appendChild(input); label.appendChild(document.createTextNode(' ' + t('rv_manual_confirm', 'Ho verificato personalmente anche le parti non coperte dal controllo automatico e approvo i contenuti.'))); manualOption.appendChild(label);
        {
          const retry = document.createElement('button'); retry.id = 'mrv-retry-judge'; retry.type = 'button';
          /* Se l'ultimo tentativo non ha completato nuovi controlli, riprovare non è
             la strada: il bottone smette di sembrare quella principale. */
          const ultimo = r.initial.retrySummary || r.initial.report?.retrySummary;
          retry.className = ultimo?.targeted > 0 && ultimo.checked === 0 && ultimo.remaining > 0 ? 'pm-btn-cancel' : 'pm-btn-primary';
          retry.textContent = isFinal ? t('rv_context_retry_missing', 'Riprova il controllo automatico dei residui') : t('rv_retry_judge', 'Riprova il controllo automatico');
          retry.onclick = async () => {
            if (busy || invalidEditors.size) return;
            freeze(true);
            status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.');
            try {
              await pendingSave; if (saveError) throw saveError;
              if (isFinal) await R.retryMaterialJudge(vaultPath, manifest, { onProgress: p => {
                status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.') + ' (' + p.done + '/' + p.total + ')' +
                  (p.reused ? ' · ' + p.reused + ' ' + t('rv_context_reused', 'controlli riutilizzati') : '');
              } });
              else await R.retryJudge(vaultPath, manifest);
              /* La spunta «completo io il controllo» si azzera, ed è corretto: il
                 controllo è cambiato, quindi la conferma di prima non vale più.
                 Ma prima si azzerava in SILENZIO, e con lei spariva il bottone che
                 conclude: sembrava che il lavoro fosse stato annullato (Giacomo,
                 19/9/2026). Ora lo si dice, e solo se c'era davvero qualcosa da
                 azzerare. */
              const eraConfermato = manualConfirmed;
              manualConfirmed = false; freeze(false); render(); modal.querySelector('#mrv-title').focus();
              status.textContent = checkMessage() + ' ' + t('rv_saved', 'Decisioni salvate') +
                (eraConfermato ? ' · ' + t('rv_manual_reset', 'Le tue decisioni restano; va rimessa la spunta «completo io il controllo», perché il controllo è cambiato.') : '');
            }
            catch (e) { status.textContent = errorText(e); }
            finally { if (busy) freeze(false); }
          };
          manual.appendChild(retry);
          if (isFinal) {
            const scope = document.createElement('p'); scope.className = 'text-sm';
            scope.textContent = r.initial.report?.checkpoint ? t('rv_context_retry_scope', 'Ricontrolla le bozze originali, prima delle tue correzioni. Riusa i controlli validi; le decisioni sono conservate. Il tentativo può restare incompleto.') :
              t('rv_context_retry_legacy', 'Questo progetto usa un controllo precedente: il primo ricontrollo riesamina le bozze per poter riutilizzare in seguito le verifiche complete. Le tue decisioni restano conservate.');
            manual.appendChild(scope);
          }
        }
        manual.appendChild(manualOption);
      }
      const resume = !!options.onContinue || pendingOutputs(manifest);
      proceed.textContent = approved && !resume ? t('rv_close', 'Chiudi') : approved ? t('rv_resume', 'Continua dai contenuti approvati') :
        isFinal ? t('rv_finalize', 'Salva le decisioni e completa i materiali') : t('rv_continue', 'Salva le decisioni e continua');
      if (fonte) {
        const attiva = r.initial.issues.find(i => i.id === activeIssueId);
        if (attiva) fonte.mostra(evidenceRows(attiva.evidence));
        /* Accanto alla fonte viene prima la scheda che la fonte sta mostrando: il
           riquadro dei materiali rimasti, spesso lungo e aperto, va dopo. */
        const rimasti = content.querySelector('#mrv-material-coverage');
        if (rimasti && attiva) content.appendChild(rimasti);
      }
      if (issuePrima && issuePrima === activeIssueId && scrollPrima) content.scrollTop = scrollPrima;
    }
    render();
    modal.querySelector('#mrv-later').onclick = async () => { if (busy || invalidEditors.size) { status.textContent = t('rv_edit_draft', 'Modifica non salvata. Salva oppure annulla prima di continuare.'); return; } await pendingSave; if (!saveError && !busy) close(); };
    proceed.onclick = async () => {
      if (closed || busy || committing || invalidEditors.size || proceed.hidden) return;
      freeze(true);
      try {
        await pendingSave; if (saveError) throw saveError;
        const resume = !!options.onContinue || pendingOutputs(manifest);
        if (getReview().initial.status !== 'approved' || resume) await R.approve(vaultPath, manifest, { final: isFinal, manualReview: manualConfirmed || statoApprovazioni(getReview()).tutti });
        close(); busy = false;
        if (options.onContinue) await options.onContinue(manifest);
        else if (resume && window.MappAIPipelineCore.hasOutput(manifest.config)) await window.MappAIPipeline.run(manifest.config, { only: ['B', 'C', 'D', 'E'], vaultPath, manifest });
      } catch (e) { status.textContent = errorText(e); }
      finally { freeze(false); }
    };
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); if (!busy) modal.querySelector('#mrv-later').click(); }
      if (e.key === 'Tab') {
        const focusable = Array.from(modal.querySelectorAll('button:not(:disabled),textarea:not(:disabled),select:not(:disabled),input:not(:disabled),summary')).filter(x => !x.hidden && x.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === modal.querySelector('#mrv-title'))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal.querySelector('#mrv-title'))) { e.preventDefault(); first.focus(); }
      }
    });
    modal.querySelector('#mrv-title').focus();
    return modal;
  };
  window.MappAIReview = R;
}());
