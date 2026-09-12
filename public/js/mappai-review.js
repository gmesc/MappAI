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
    return review ? review.sources : (Array.isArray(state()._generationSources) && state()._generationSources.length ? state()._generationSources :
      state()._pdfPagine && state()._pdfPagine.length ? state()._pdfPagine : state().sources || []);
  };
  function sourceSnapshot() {
    return core().sourceSnapshot(R.sources());
  }
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
      giudice: s._judgeReport || s._giudiceReport || null };
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
  R.retryJudge = async function (vaultPath, manifest) {
    assertProject(vaultPath);
    const old = manifest.review, s = state();
    if (old.initial.status !== 'awaiting_review' || core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
    const key = window.getSystemKey && window.getSystemKey();
    if (!key || !window.executeJudgePass) throw new Error(t('rv_retry_key', 'Per riprovare il controllo automatico occorre una chiave AI disponibile.'));
    const pages = s._pdfPagine, sources = s.sources, generationSources = s._generationSources;
    let report;
    try {
      s._pdfPagine = old.sources.filter(x => Array.isArray(x.pages));
      s._generationSources = old.sources;
      s.sources = old.sources.map(x => Object.assign({}, x, { content: x.content || x.text || '' }));
      report = await window.executeJudgePass(key, { enabled: true, apply: false });
      assertProject(vaultPath);
      if (core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
    } finally { s._pdfPagine = pages; s.sources = sources; s._generationSources = generationSources; }
    const next = core().createReview({ db: s.db, sources: old.sources, report, generationId: old.generationId,
      projectId: old.projectId, vaultPath, config: old.config });
    old.initial.issues.forEach(issue => { if (!next.initial.issues.some(n => n.id === issue.id)) next.initial.issues.push(clone(issue)); });
    next.initial.decisions = clone(old.initial.decisions);
    next.initial.previousReports = (old.initial.previousReports || []).concat([old.initial.report]);
    if (old.previous) next.previous = clone(old.previous);
    manifest.review = next;
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
    let report;
    try {
      s._reviewAIContext = clone(manifest.config.aiContext || previousContext || { provider: s.aiProvider });
      const apiKey = window.getSystemKey && window.getSystemKey();
      if (!apiKey) throw new Error(t('rv_retry_key', 'Per riprovare il controllo automatico occorre una chiave AI disponibile.'));
      const material = grounding.buildInput(s.db, s.db.nodes, review.sources, review);
      report = await judge.check(clone(final.items), { review, apiKey, material, onProgress: opts && opts.onProgress });
      assertCurrent();
    } finally { s._reviewAIContext = previousContext; }
    const next = core().createReview({ db: { items: final.items }, sources: old.sources, report,
      generationId: old.generationId, projectId: old.projectId, vaultPath, config: old.config });
    old.initial.issues.forEach(issue => { if (!next.initial.issues.some(n => n.id === issue.id)) next.initial.issues.push(clone(issue)); });
    next.initial.decisions = clone(old.initial.decisions);
    next.initial.previousReports = (old.initial.previousReports || []).concat([old.initial.report]);
    if (old.previous) next.previous = clone(old.previous);
    final.review = next;
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
      const report = window.executeJudgePass && window.getSystemKey && window.getSystemKey()
        ? await window.executeJudgePass(window.getSystemKey(), { enabled: true, apply: false }) : {};
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
    R.open(s.activeVaultPath, manifest, { final: !!(final && final.review && final.stage !== 'done') });
  };
  R.finishMapOnly = async function () {
    if (!R.enabled() || !state().db.nodes.length) return;
    const saved = await window.ensureProjectVault({ reason: 'generation' });
    const vaultPath = (saved && saved.folderPath) || state().activeVaultPath;
    if (!vaultPath) throw new Error('Cartella della revisione non disponibile');
    const manifest = window.MappAIPipelineCore.createManifest({}, { vaultPath });
    manifest.steps.A.status = 'done';
    await R.checkpoint(vaultPath, manifest);
    R.open(vaultPath, manifest);
  };
  const fieldLabels = { question: ['rv_question', 'Domanda'], answer: ['rv_answer', 'Risposta'],
    options: ['rv_options', 'Alternative'], correctIndex: ['rv_correct', 'Risposta corretta'], explanation: ['rv_explanation', 'Spiegazione'],
    guide: ['rv_guide', 'Traccia di risposta'], criteria: ['rv_criteria', 'Criteri di correzione'], criteri: ['rv_criteria', 'Criteri di correzione'],
    text: ['rv_text', 'Testo'], lines: ['rv_lines', 'Righe per rispondere'], label: ['rv_label', 'Titolo'], desc: ['rv_text', 'Testo'],
    rel: ['rv_relation', 'Relazione'], source: ['rv_link_from', 'Dal concetto'], target: ['rv_link_to', 'Al concetto'] };
  const fieldName = f => fieldLabels[f] ? t(...fieldLabels[f]) : t('rv_other_field', 'Contenuto');
  const itemFields = ['question', 'answer', 'options', 'correctIndex', 'explanation', 'guide', 'criteria', 'criteri', 'text', 'lines'];
  const nodeLabel = id => { const n = (state().db.nodes || []).find(n => String(n.id) === String(id)); return n ? n.label : t('rv_missing_node', 'Concetto non disponibile'); };
  function itemFor(issue, review) { return (review.baseSnapshot.items || []).find(i => String(i.id) === String(issue.target.id)); }
  function readable(value, target, item) {
    if (value == null) return target && ['$item', '$link'].includes(target.field) ? t('rv_remove', 'Escludi questo elemento') : t('rv_empty_field', 'Campo vuoto');
    if (target && target.kind === 'link') {
      const l = typeof value === 'object' ? value : Object.assign({}, target, { rel: value });
      return nodeLabel(l.source) + ' → ' + String(l.rel || '') + ' → ' + nodeLabel(l.target);
    }
    if (target && target.field === 'correctIndex') {
      return item && Array.isArray(item.options) && Number.isInteger(value) && item.options[value] != null
        ? String.fromCharCode(65 + value) + '. ' + item.options[value] : t('rv_no_correct', 'Nessuna alternativa valida selezionata');
    }
    if (Array.isArray(value)) return value.map((v, i) => (i + 1) + '. ' + (typeof v === 'string' ? v : t('rv_unreadable_field', 'Contenuto da correggere'))).join('\n');
    if (typeof value === 'object') return itemFields.filter(f => own(value, f)).map(f => fieldName(f) + ':\n' + readable(value[f], { field: f }, value)).join('\n\n');
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
      const key = canonical([issue.target.kind, issue.target.field, issue.before, issue.after, issue.hasProposal, issue.problem, issue.evidence]);
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
  function evidenceHtml(issue, review) {
    const rows = evidenceRows(issue.evidence);
    return rows.length ? rows.map(e => {
      const source = [e.title || (typeof e.source === 'string' ? e.source : ''), e.page ? t('rv_page', 'Pagina') + ' ' + e.page : ''].filter(Boolean).join(' · ');
      const quote = e.verifiedAgainst === 'item' ? readable(issue.before, issue.target, itemFor(issue, review)) : e.text;
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
      return '<div class="my-3"><p class="font-bold">' + esc(source || t('rv_source', 'Fonte')) + '</p><p class="whitespace-pre-wrap">' + esc(quote) + '</p>' + contexts.join('') + '</div>';
    }).join('') : '<p>' + esc(t('rv_no_evidence', 'La prova non è disponibile in questa segnalazione.')) + '</p>';
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
    const old = document.getElementById('mappai-teacher-review'); if (old) old.remove();
    const previousFocus = document.activeElement;
    const modal = document.createElement('div');
    modal.id = 'mappai-teacher-review';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[3400] flex items-center justify-center p-4';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'mrv-title');
    modal.innerHTML = '<div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">' +
      '<header class="p-5 border-b"><h2 id="mrv-title" class="pm-title" tabindex="-1">' + esc(isFinal ? t('rv_final_title', 'Rivedi i materiali') : t('rv_title', 'Rivedi i contenuti prima di creare i materiali')) +
      '</h2><p class="pm-subtitle">' + esc(t('rv_subtitle', 'Le decisioni restano nel progetto. Il controllo automatico può non rilevare tutti gli errori.')) +
      '</p><div id="mrv-filters" class="flex gap-2 flex-wrap mt-3" role="group" aria-label="' + esc(t('rv_filter_label', 'Mostra le decisioni')) + '"></div><p id="mrv-filter-count" class="text-sm mt-2" aria-live="polite"></p><p id="mrv-status" role="status" aria-live="polite"></p><button type="button" id="mrv-save-retry" hidden class="pm-btn-cancel">' + esc(t('rv_save_retry', 'Riprova il salvataggio')) + '</button></header>' +
      '<div class="overflow-y-auto p-5 space-y-4" id="mrv-content"></div><footer class="p-5 border-t space-y-3"><div id="mrv-manual"></div><div class="flex gap-3 flex-wrap">' +
      '<button type="button" class="pm-btn-cancel" id="mrv-later">' + esc(t('rv_later', 'Salva e continua più tardi')) + '</button>' +
      '<button type="button" class="pm-btn-primary" id="mrv-continue"></button></div></footer></div>';
    document.body.appendChild(modal);
    const content = modal.querySelector('#mrv-content'), status = modal.querySelector('#mrv-status');
    const proceed = modal.querySelector('#mrv-continue'), retrySave = modal.querySelector('#mrv-save-retry');
    let pendingSave = Promise.resolve(), saveError = null, manualConfirmed = false, closed = false;
    const invalidEditors = new Set();
    let activeFilter = 'pending';
    const filters = modal.querySelector('#mrv-filters'), filterCount = modal.querySelector('#mrv-filter-count');
    const filterLabels = { pending: t('rv_filter_pending', 'Da rivedere'), decided: t('rv_filter_decided', 'Già decise'), all: t('rv_filter_all', 'Tutte') };
    const setReview = r => { if (isFinal) manifest.review.final.review = r; else manifest.review = r; };
    function decisionState() {
      const r = getReview(), issues = r.initial.issues;
      const db = isFinal ? { items: manifest.review.final.items } : state().db;
      const preview = core().preview(r, db, { sources: r.sources });
      const attention = new Set(preview.conflicts.map(c => c.issueId).filter(Boolean));
      // A chosen action is still actionable when it cannot be applied or leaves
      // an invalid exercise. The filter must not hide these approval blockers.
      if (isFinal && preview.ok && window.MappAIMaterialReview?.validate) {
        const invalid = window.MappAIMaterialReview.validate(preview.db.items).issues || [];
        const itemIds = new Set(invalid.map(i => String(i.target?.id)));
        issues.filter(i => i.target.kind === 'item' && itemIds.has(String(i.target.id))).forEach(i => attention.add(i.id));
      }
      const pending = issues.filter(i => attention.has(i.id) || !['accept', 'reject', 'manual'].includes(r.initial.decisions[i.id]?.choice));
      const ids = new Set(pending.map(i => i.id));
      return { pending, decided: issues.filter(i => !ids.has(i.id)), all: issues };
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
      return groups;
    }
    for (const key of Object.keys(filterLabels)) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-review-filter', key);
      button.onclick = async () => {
        if (busy || invalidEditors.size) return;
        await pendingSave; if (saveError || closed) return;
        activeFilter = key; render(); button.focus();
      };
      filters.appendChild(button);
    }
    function close() { closed = true; modal.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); }
    function errorText(e) {
      return e && /^(persisted_revision_mismatch|applying_snapshot_mismatch)$/.test(e.code || e.message)
        ? t('rv_readback_failed', 'La copia salvata non coincide con le decisioni. La revisione resta in attesa.') : e.message;
    }
    function save() {
      status.textContent = t('rv_saving', 'Salvataggio…');
      pendingSave = R.writeManifest(vaultPath, manifest).then(() => {
        saveError = null; retrySave.hidden = true; status.textContent = t('rv_saved', 'Decisioni salvate'); cache();
      }).catch(e => { saveError = e; retrySave.hidden = false; status.textContent = errorText(e); });
      return pendingSave;
    }
    retrySave.onclick = () => { if (!busy) save(); };
    function decide(group, choice, value) {
      if (busy || getReview().initial.status !== 'awaiting_review') return;
      let r = getReview();
      group.forEach(issue => { r = core().setDecision(r, issue.id, choice, { text: value }); });
      setReview(r); updateFilters(); return save();
    }
    function freeze(value) {
      busy = value; modal.setAttribute('aria-busy', String(value));
      modal.querySelectorAll('button,input,textarea,select').forEach(el => {
        if (value) { el._reviewDisabled = el.disabled; el.disabled = true; }
        else { el.disabled = !!el._reviewDisabled; delete el._reviewDisabled; }
      });
      if (!value) proceed.disabled = invalidEditors.size > 0;
    }
    function render() {
      const r = getReview(), approved = r.initial.status === 'approved', editable = r.initial.status === 'awaiting_review';
      content.replaceChildren(); invalidEditors.clear();
      const groups = updateFilters();
      filters.hidden = filterCount.hidden = !r.initial.issues.length;
      filters.className = r.initial.issues.length ? 'flex gap-2 flex-wrap mt-3' : '';
      const info = document.createElement('p');
      const currentDb = isFinal ? { items: manifest.review.final.items } : state().db;
      info.textContent = approved ? (core().gate(r, currentDb, r.sources).allowed ? t('rv_approved', 'Le decisioni sono state salvate. Questi contenuti sono approvati.') : t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.')) :
        !r.initial.issues.length ? (r.initial.checkStatus === 'completed' ? t('rv_none', 'Nessuna proposta di correzione. Puoi leggere i contenuti e continuare.') : t('rv_check_incomplete', 'Il controllo automatico non è completo. I contenuti attendono ancora la verifica.')) :
        groups.pending.length ? groups.pending.length + ' ' + t('rv_count_pending', 'da rivedere') :
        t('rv_decisions_complete', 'Tutte le segnalazioni hanno una decisione. Controlla qui sotto se resta un passaggio per continuare.');
      content.appendChild(info);
      if (!groups[activeFilter].length && r.initial.issues.length) {
        const empty = document.createElement('p'); empty.id = 'mrv-filter-empty';
        empty.textContent = activeFilter === 'pending' ? t('rv_no_pending', 'Non ci sono decisioni da rivedere. Puoi consultare quelle già prese con il filtro Già decise.') : t('rv_no_decided', 'Non ci sono ancora decisioni già prese.');
        content.appendChild(empty);
      }
      if (r.initial.checkStatus !== 'completed') {
        const report = r.initial.report || {}, coverage = report.copertura || {};
        const unchecked = (coverage.nodiSaltati || []).length + (coverage.linkSaltati || []).length + (report.coverage?.skipped || []).length;
        // Coverage belongs to diagnostics, not to the teacher's correction list.
        // Keep the full report in the manifest; only actual findings get cards.
        const box = document.createElement('div'); box.id = 'mrv-unchecked';
        box.innerHTML = (unchecked ? '<p>' + esc(t('rv_remaining_checks', 'Parti ancora da controllare:')) + ' ' + unchecked + '.</p>' : '') +
          '<p>' + esc(t('rv_retry_help', 'Le bozze e le decisioni sono salvate. Puoi riprovare il controllo senza rigenerare i materiali, oppure riprendere più tardi.')) + '</p>';
        content.appendChild(box);
      }
      for (const group of R.groupIssues(groups[activeFilter])) {
        const issue = group[0], item = itemFor(issue, r);
        const card = document.createElement('section'); card.className = 'pm-section';
        const title = issue.problem || fieldName(issue.target.field);
        const targets = group.map(i => i.target.kind === 'item' ? (itemFor(i, r)?.question || itemFor(i, r)?.text || t('rv_material', 'Materiale')) :
          i.target.kind === 'link' ? readable(i.before, i.target) : nodeLabel(i.target.id));
        const itemContext = item && item.question ? '<p class="mb-2"><strong>' + esc(t('rv_question', 'Domanda')) + ':</strong> ' + esc(item.question) + '</p>' +
          (Array.isArray(item.options) ? '<ul class="mb-3">' + item.options.map((option, i) => '<li>' + esc(String.fromCharCode(65 + i) + '. ' + option) + '</li>').join('') + '</ul>' : '') : '';
        card.innerHTML = itemContext + '<h3 class="font-bold mb-2">' + esc(title) + '</h3><details class="mb-2"><summary>' + esc(t('rv_where', 'Dove si applica')) + ' (' + group.length + ')</summary><ul>' + targets.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' +
          '<p class="text-sm font-bold">' + esc(t('rv_before', 'Testo attuale')) + '</p><p class="whitespace-pre-wrap mb-3">' + esc(readable(issue.before, issue.target, item)) + '</p>' +
          (issue.hasProposal ? '<p class="text-sm font-bold">' + esc(t('rv_proposal', 'Proposta')) + '</p><p class="whitespace-pre-wrap mb-3">' + esc(readable(issue.after, issue.target, item)) + '</p>' : '') +
          '<details class="mb-3"><summary>' + esc(t('rv_evidence', 'Fonte e motivo della segnalazione')) + '</summary>' + evidenceHtml(issue, r) + '</details>' +
          '<div class="flex gap-2 flex-wrap" data-actions></div><div data-editor></div><p data-choice class="text-sm mt-2" aria-live="polite"></p>';
        const actions = card.querySelector('[data-actions]'), editor = card.querySelector('[data-editor]'), choiceLabel = card.querySelector('[data-choice]');
        const labels = { pending: t('rv_pending', 'Da decidere'), accept: t('rv_accept', 'Applica la proposta'), reject: t('rv_reject', 'Mantieni il mio testo'), manual: t('rv_edit', 'Modifica il testo') };
        function showChoice() {
          const choices = new Set(group.map(i => (getReview().initial.decisions[i.id] || {}).choice || 'pending'));
          choiceLabel.textContent = choices.size === 1 ? labels[Array.from(choices)[0]] : t('rv_mixed', 'Decisioni diverse: ogni destinatario mantiene la propria scelta.');
        }
        const allowed = issue.target.kind !== 'item' || issue.target.field === '$item' || itemFields.includes(issue.target.field);
        function editBox(focus) {
          editor.replaceChildren();
          let current = clone(own(getReview().initial.decisions[issue.id], 'text') ? getReview().initial.decisions[issue.id].text : issue.before);
          if (current == null && issue.target.field === '$item') current = clone(item);
          function changed(value) {
            proceed.disabled = invalidEditors.size > 0;
            decide(group, 'manual', value); showChoice();
          }
          function control(parent, field, value, update, object) {
            const errorKey = issue.id + ':' + field;
            const label = document.createElement('label'); label.className = 'block mt-3'; label.textContent = fieldName(field);
            if (Array.isArray(value) || field === 'options' || field === 'criteria' || field === 'criteri') {
              const list = Array.isArray(value) ? value.slice() : [];
              const listBox = document.createElement('div'); label.appendChild(listBox);
              function drawList() {
                listBox.replaceChildren();
                list.forEach((entry, index) => {
                  const row = document.createElement('label'); row.className = 'block mt-2';
                  row.textContent = fieldName(field) + ' ' + (field === 'options' ? String.fromCharCode(65 + index) : index + 1);
                  const input = document.createElement('textarea'); input.rows = 2; input.className = 'w-full border rounded p-2'; input.value = typeof entry === 'string' ? entry : '';
                  input.oninput = () => { list[index] = input.value; update(list.slice()); };
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
            let input;
            if (field === 'correctIndex') {
              input = document.createElement('select');
              input.innerHTML = '<option value="">' + esc(t('rv_choose_correct', 'Scegli la risposta corretta')) + '</option>' + (object?.options || item?.options || []).map((x, i) => '<option value="' + i + '">' + esc(String.fromCharCode(65 + i) + '. ' + x) + '</option>').join('');
              input.value = Number.isInteger(value) ? String(value) : '';
            } else if (field === 'source' || field === 'target') {
              input = document.createElement('select'); input.innerHTML = (state().db.nodes || []).map(n => '<option value="' + esc(n.id) + '">' + esc(n.label) + '</option>').join(''); input.value = value;
            } else if (field === 'lines') {
              input = document.createElement('input'); input.type = 'number'; input.min = '3'; input.max = '12'; input.step = '1'; input.value = value;
            } else { input = document.createElement('textarea'); input.rows = 4; input.value = typeof value === 'string' ? value : ''; }
            input.className = 'w-full border rounded p-3 font-sans';
            input.oninput = input.onchange = () => {
              const number = field === 'correctIndex' || field === 'lines';
              if (number && (input.value === '' || !Number.isInteger(Number(input.value)))) {
                invalidEditors.add(errorKey); proceed.disabled = true; status.textContent = t('rv_invalid_edit', 'Completa il campo della modifica prima di continuare.'); return;
              }
              invalidEditors.delete(errorKey);
              update(number ? Number(input.value) : input.value);
            };
            label.appendChild(input); parent.appendChild(label);
          }
          if (issue.target.field === '$item') {
            const fields = Array.from(new Set(itemFields.filter(f => own(current, f)).concat(current?.kind === 'mc' ? ['question', 'options', 'correctIndex'] : [])));
            fields.forEach(field => control(editor, field, current[field], value => { current[field] = value; changed(clone(current)); }, current));
          } else if (issue.target.field === '$link') {
            ['source', 'rel', 'target'].forEach(field => control(editor, field, current[field], value => { current[field] = value; changed(clone(current)); }, current));
          } else control(editor, issue.target.field, current, changed, item);
          if (focus) editor.querySelector('textarea,select,input')?.focus();
        }
        for (const choice of ['accept', 'reject', 'manual', 'pending']) {
          if (choice === 'accept' && (!issue.hasProposal || !allowed) || choice === 'manual' && !allowed) continue;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'pm-btn-cancel'; button.disabled = !editable;
          button.textContent = choice === 'pending' ? t('rv_undo', 'Annulla decisione') : labels[choice];
          button.onclick = async () => {
            Array.from(invalidEditors).filter(k => k.startsWith(issue.id + ':')).forEach(k => invalidEditors.delete(k));
            const saved = decide(group, choice, choice === 'manual' ? issue.before : undefined); showChoice();
            if (choice === 'manual') editBox(true); else {
              editor.replaceChildren(); proceed.disabled = invalidEditors.size > 0;
              await saved;
              if (!saveError && !closed) { render(); filters.querySelector('[data-review-filter="' + activeFilter + '"]').focus(); }
            }
          };
          actions.appendChild(button);
        }
        if (isFinal && issue.target.kind === 'item' && editable && !(issue.origin === 'teacher' && issue.target.field === '$item' && issue.after === null)) {
          const exclude = document.createElement('button'); exclude.type = 'button'; exclude.className = 'pm-btn-cancel'; exclude.textContent = t('rv_exclude_material', 'Escludi dagli esercizi');
          exclude.onclick = () => {
            let next = getReview();
            const ids = new Set(group.map(i => String(i.target.id)));
            next.initial.issues.filter(i => i.target.kind === 'item' && ids.has(String(i.target.id))).forEach(i => { next = core().setDecision(next, i.id, 'reject'); });
            ids.forEach(id => {
              const exclusion = { id: 'teacher-exclude-' + id, target: { kind: 'item', id, field: '$item' }, after: null, hasProposal: true,
                problem: t('rv_teacher_exclusion', 'Esclusione decisa dal docente'), origin: 'teacher' };
              next = core().addIssue(next, exclusion); next = core().setDecision(next, exclusion.id, 'accept');
            });
            setReview(next); save(); render(); modal.querySelector('#mrv-title').focus();
          };
          actions.appendChild(exclude);
        }
        showChoice();
        if ((r.initial.decisions[issue.id] || {}).choice === 'manual') editBox(false);
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
        add.onclick = () => {
          if (!select.value) return;
          const n = state().db.nodes.find(n => String(n.id) === select.value);
          setReview(core().addIssue(getReview(), { target: { kind: 'node', id: n.id, field: field.value || 'desc' },
            problem: t('rv_teacher_edit', 'Modifica del docente') + ': ' + n.label, origin: 'teacher', blocking: true }, state().db));
          activeFilter = 'pending'; save(); render(); modal.querySelector('#mrv-title').focus();
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
      proceed.hidden = editable && r.initial.checkStatus !== 'completed' && !manualConfirmed;
      if (r.initial.checkStatus !== 'completed' && editable) {
        const manualOption = document.createElement('details'); manualOption.id = 'mrv-manual-option'; manualOption.className = 'mt-3 text-sm';
        manualOption.innerHTML = '<summary>' + esc(t('rv_manual_option', 'Scelgo di completare io il controllo')) + '</summary>';
        const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = 'mrv-manual-confirm'; input.checked = manualConfirmed;
        label.className = 'block mt-2';
        input.onchange = () => { manualConfirmed = input.checked; proceed.hidden = !manualConfirmed; };
        label.appendChild(input); label.appendChild(document.createTextNode(' ' + t('rv_manual_confirm', 'Il controllo automatico non è completo. Ho rivisto io i contenuti e scelgo di continuare.'))); manualOption.appendChild(label);
        {
          const retry = document.createElement('button'); retry.id = 'mrv-retry-judge'; retry.type = 'button'; retry.className = 'pm-btn-primary'; retry.textContent = isFinal ? t('rv_retry_material_judge', 'Riprova il controllo dei materiali') : t('rv_retry_judge', 'Riprova il controllo automatico');
          retry.onclick = async () => {
            if (busy || invalidEditors.size) return;
            freeze(true);
            status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.');
            try {
              await pendingSave; if (saveError) throw saveError;
              if (isFinal) await R.retryMaterialJudge(vaultPath, manifest, { onProgress: p => {
                status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.') + ' (' + p.done + '/' + p.total + ')';
              } });
              else await R.retryJudge(vaultPath, manifest);
              manualConfirmed = false; freeze(false); render(); modal.querySelector('#mrv-title').focus(); status.textContent = t('rv_saved', 'Decisioni salvate');
            }
            catch (e) { status.textContent = errorText(e); }
            finally { if (busy) freeze(false); }
          };
          manual.appendChild(retry);
        }
        manual.appendChild(manualOption);
      }
      const resume = !!options.onContinue || pendingOutputs(manifest);
      proceed.textContent = approved && !resume ? t('rv_close', 'Chiudi') : approved ? t('rv_resume', 'Continua dai contenuti approvati') :
        isFinal ? t('rv_finalize', 'Salva le decisioni e completa i materiali') : t('rv_continue', 'Salva le decisioni e continua');
    }
    render();
    modal.querySelector('#mrv-later').onclick = async () => { if (busy) return; await pendingSave; if (!saveError && !busy) close(); };
    proceed.onclick = async () => {
      if (closed || busy || committing || invalidEditors.size || proceed.hidden) return;
      freeze(true);
      try {
        await pendingSave; if (saveError) throw saveError;
        const resume = !!options.onContinue || pendingOutputs(manifest);
        if (getReview().initial.status !== 'approved' || resume) await R.approve(vaultPath, manifest, { final: isFinal, manualReview: manualConfirmed });
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
