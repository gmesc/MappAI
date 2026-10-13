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
  async function withJudgeSources(s, sources, check) {
    const temporary = { _generationSources: sources, _pdfPagine: sources.filter(x => Array.isArray(x.pages)),
      sources: sources.map(x => Object.assign({}, x, { content: x.content || x.text || '' })) };
    const previous = Object.fromEntries(Object.keys(temporary).map(k => [k, { present: own(s, k), value: s[k] }]));
    try { Object.assign(s, temporary); return await check(); }
    finally {
      Object.keys(temporary).forEach(k => {
        if (s[k] !== temporary[k]) return;
        if (previous[k].present) s[k] = previous[k].value; else delete s[k];
      });
    }
  }
  function judgeEvidenceView(report, nodes) {
    if (report?.contratto !== 'mappai-giudice@2') return null;
    const box = document.createElement('div'); box.setAttribute('data-judge-evidence', '');
    const fonte = report.fonte || {}, coverage = fonte.copertura || {};
    const paragraph = text => { const p = document.createElement('p'); p.textContent = text; box.appendChild(p); };
    paragraph(fonte.fornita ? t('rv_source_supplied', 'Testo originale fornito al Giudice.') :
      t('rv_source_not_supplied', 'Il testo originale non è stato fornito al Giudice. Leggi il motivo del controllo incompleto.'));
    if (Number.isFinite(coverage.pagineTotali)) paragraph((coverage.pagineNonNumerate ?
      t('rv_source_parts', 'Parti della fonte con testo disponibili:') : t('rv_source_pages', 'Pagine con testo disponibili:')) + ' ' +
      (coverage.pagineConTesto || 0) + ' / ' + coverage.pagineTotali +
      (coverage.pagineVuote ? ' · ' + t('rv_source_empty_parts', 'Parti prive di testo:') + ' ' + coverage.pagineVuote : ''));
    if (coverage.pagineNonNumerate) paragraph(t('rv_source_unnumbered', 'Parti senza numero di pagina:') + ' ' + coverage.pagineNonNumerate + '. ' +
      t('rv_source_no_percentage', 'La paginazione della fonte non è interamente disponibile.'));
    if (coverage.pagineVuote || fonte.diagnostica?.some(item => item.code === 'extraction_order')) {
      paragraph(t('rv_source_keeps_partial', 'Il controllo resta parziale per i limiti del testo estratto, anche se non ci sono descrizioni o collegamenti ancora da controllare. Confronta le parti mancanti o l’ordine del testo con il documento originale.'));
    }
    paragraph(t('rv_source_limits', 'Il testo fornito può avere limiti di estrazione. Le descrizioni esaminate non sono automaticamente confermate: una prova consultabile documenta la provenienza, non certifica ogni affermazione.'));
    if (fonte.diagnostica?.length) {
      const diagnosticText = item => {
        if (typeof item === 'string') return item;
        const code = item.code;
        if (code === 'judge_source_legacy_origin' || code === 'legacy_pdf_identity_unverified') return t('rv_source_legacy', 'Fonte archiviata in precedenza: alcuni dati di origine non sono verificabili.');
        if (code === 'judge_source_excluded') return t('rv_source_excluded', 'Contenuti generati e modifiche del docente sono esclusi dalle prove originali.');
        if (code === 'symbol_encoding_check_original') return t('rv_source_symbols', 'Alcuni simboli richiedono un confronto con il documento originale.');
        if (code === 'table_layout_check_original') return t('rv_source_tables', 'Le tabelle richiedono un confronto con l’impaginazione originale.');
        if (code === 'empty_page') return t('rv_source_empty', 'Una pagina non contiene testo estraibile; confrontala con l’originale.');
        if (code === 'extraction_order') return t('rv_source_order', 'L’ordine del testo estratto può differire da quello del documento originale.');
        if (code === 'judge_page_number_invalid') return t('rv_source_number', 'Un numero di pagina non è affidabile ed è mostrato come non disponibile.');
        if (code === 'judge_source_origin_unknown') return t('rv_source_origin', 'L’origine di una fonte non è riconosciuta: il controllo non può usarla come prova.');
        if (code === 'judge_source_identity_ambiguous' || code === 'judge_passage_identity_collision') return t('rv_source_ambiguous', 'Una fonte o un passaggio non sono identificabili in modo univoco: il controllo non può proseguire.');
        return t('rv_source_unreadable', 'Alcuni dati della fonte non sono leggibili o verificabili. Consulta il documento originale.');
      };
      const details = document.createElement('details');
      details.innerHTML = '<summary>' + esc(t('rv_source_details', 'Dettagli della fonte e limiti')) + '</summary><ul>' +
        Array.from(new Set(fonte.diagnostica.map(diagnosticText))).map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>';
      box.appendChild(details);
    }
    const results = Array.isArray(report.esitiLink) ? report.esitiLink : [];
    if (results.length) {
      const labels = new Map((nodes || []).map(n => [n.id, n.label || n.id]));
      const outcomes = { sostenuto: t('rv_link_supported', 'Sostenuto dalla fonte'), contraddetto: t('rv_link_contradicted', 'Contraddetto dalla fonte'),
        non_verificabile: t('rv_link_insufficient', 'Prove insufficienti') };
      const details = document.createElement('details'); details.setAttribute('data-judge-link-results', '');
      details.innerHTML = '<summary>' + esc(t('rv_link_results', 'Esiti e prove dei collegamenti')) + ' (' + results.length + ')</summary>';
      results.forEach(link => {
        const row = document.createElement('details'); row.setAttribute('data-judge-link-outcome', link.esito);
        row.innerHTML = '<summary>' + esc((labels.get(link.source) || link.source) + ' → ' + (link.rel || '') + ' → ' +
          (labels.get(link.target) || link.target) + ' · ' + (outcomes[link.esito] || t('rv_link_unchecked', 'Controllo non completato.'))) + '</summary><p>' + esc(link.problema || '') + '</p>';
        (link.evidenze || []).forEach(evidence => {
          const proof = document.createElement('div'); proof.setAttribute('data-judge-proof', '');
          const page = evidence.page ? t('rv_page', 'Pagina') + ' ' + evidence.page : t('rv_source_no_page', 'Numero di pagina non disponibile');
          proof.innerHTML = '<p>' + esc(evidence.title || t('rv_original_source', 'Fonte originale')) + ' · ' + esc(page) + '</p><blockquote class="whitespace-pre-wrap">' +
            esc(evidence.text || '') + '</blockquote><details><summary>' + esc(t('rv_proof_reference', 'Riferimento della prova')) + '</summary><p class="break-words">' +
            esc([evidence.evidenzaId, evidence.docId, evidence.sourceRevision, evidence.recordId].filter(Boolean).join(' · ')) + '</p></details>';
          row.appendChild(proof);
        });
        if (!link.evidenze?.length) {
          const p = document.createElement('p'); p.textContent = t('rv_link_no_proof', 'Nessuna prova utilizzabile: il collegamento resta da verificare.'); row.appendChild(p);
        }
        details.appendChild(row);
      });
      box.appendChild(details);
    }
    return box;
  }
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
  R.writeManifest = function (vaultPath, manifest, assertCurrent) {
    const text = JSON.stringify(manifest, null, 2);
    const work = writes.then(async () => {
      if (assertCurrent) assertCurrent();
      const res = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'pipeline.json', text,
        expectedVersion: versions.has(vaultPath) ? versions.get(vaultPath) : manifest._storageVersion || 0 });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Salvataggio revisione non riuscito');
      manifest._storageVersion = res.version;
      versions.set(vaultPath, res.version);
      if (assertCurrent) assertCurrent();
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
    /* 0082 (§4.9, sempre, anche a interruttore spento: decisione di Giacomo, 07/10).
       Dopo un'apertura dalla cartella i rapporti in memoria sono azzerati
       (`azzeraGenerazione`), e riscrivere il file li perdeva tutti. Prima di
       scrivere si legge il `qualita.json` che c'è: un rapporto che in memoria manca
       resta quello del file (regola pura `unisciQualita`; quello in memoria vince).
       Un file che manca, illeggibile, o un canale che lancia: si scrive come prima. */
    let unito = data;
    try {
      const VC = window.MappAIVistaCore;
      if (VC && VC.unisciQualita && window.electronAPI.readVaultFile) {
        const letto = await window.electronAPI.readVaultFile({ vaultPath, relPath: 'qualita.json' });
        if (letto && letto.ok && (letto.text != null || letto.base64)) {
          const testo = letto.text != null ? letto.text
            : new TextDecoder().decode(Uint8Array.from(atob(letto.base64), c => c.charCodeAt(0)));
          unito = VC.unisciQualita(testo, data);
        }
      }
    } catch (e) { unito = data; }
    const res = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'qualita.json', text: JSON.stringify(unito, null, 2) });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Rapporto non salvato');
  };
  /* ── LA SCHEDA CONFERMATA IN CREA (0069, ADR 0016 rev. 1) ─────────────────────
     Un dossier da immagine la cui scheda il docente ha confermato nel riquadro di
     CREA, con la foto accanto: la revisione è QUELLA conferma — approvata, con le
     pagine della scheda come fonti — e dopo la generazione non c'è G1. La conferma
     è passata dal cancello (`MappAIDossierFonteCore.registraConferma`), e qui il
     cancello si richiede sulla mappa viva (`decidi`): se la scheda è cambiata dopo,
     risponde `stale_revision` e si torna alla strada di prima, cioè a G1.
     Interruttore `mappai_dossier_fonte_scheda` spento, una mappa, una foto non
     confermata → null, e la revisione nasce come sempre. */
  function confermaDellaScheda(vaultPath, manifest) {
    const DF = window.MappAIDossierFonteCore, IC = window.MappAICreaIconograficaCore;
    let acceso = false;
    try { acceso = !!(DF && DF.acceso(window.localStorage)); } catch (_) { acceso = false; }
    if (!acceso) return null;
    const dossier = manifest.config && manifest.config.dossier;
    const fonte = dossier && IC && IC.fontePerScheda ? IC.fontePerScheda(state().sources, dossier) : null;
    const esito = DF.decidi({ acceso, dossier, conferma: fonte && fonte._confermaScheda, db: state().db });
    if (!esito.usa) {
      if (esito.motivo === 'stale_revision' && window.showToast) window.showToast(t('rv_scheda_cambiata', 'La scheda è cambiata dopo la conferma: il cancello si è richiuso e i contenuti passano dalla revisione.'), 'warning');
      if (dossier) console.info('[Revisione] dossier: la scheda confermata non vale per questo giro (' + esito.motivo + ')');
      return null;
    }
    return DF.perIlGiro(esito.review, { vaultPath, projectId: storage() && storage().currentProjectId,
      config: manifest.config, now: new Date().toISOString() });
  }
  R.checkpoint = async function (vaultPath, manifest) {
    if (!R.enabled() && !manifest.review) return manifest;
    const confermata = !manifest.review ? confermaDellaScheda(vaultPath, manifest) : null;
    if (confermata) {
      manifest.review = confermata;
      state()._reviewRevision = manifest.review.baseRevision;
      await R.persistQuality(vaultPath);
      await R.writeManifest(vaultPath, manifest);
    }
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
    if (r.initial.report?.modelliGiro) state()._judgeReport = state()._giudiceReport = r.initial.report;
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
  // 0070: the reading runtime owns its canonical JSON; this controller owns the
  // same review/decision protocol as the map. Callbacks never enter pipeline.json.
  const READING = Symbol('reading-review');
  function readingAdapter(vaultPath, manifest, options) {
    const o = options || {}, final = o.phase === 'materials';
    if (!['source', 'materials'].includes(o.phase) ||
        ['getDb', 'validateDb', 'assertCurrent', 'saveReadback'].some(k => typeof o[k] !== 'function')) {
      throw new Error(t('rv_validator_missing', 'Il controllo dei campi non è disponibile. Le bozze sono conservate.'));
    }
    const review = () => final ? manifest.review?.final?.review : manifest.review;
    const assertCurrent = () => {
      assertProject(vaultPath); o.assertCurrent();
      const r = review();
      if (!r || r.vaultPath !== vaultPath || r.projectId && storage()?.currentProjectId !== r.projectId ||
          !final && r.initial.checkStatus !== 'unavailable' ||
          final && (manifest.review.initial.status !== 'approved' ||
            manifest.review.final.sourceRevision !== manifest.review.approvedRevision)) {
        throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      }
      const expected = r.initial.status === 'approved' ? [r.approvedRevision] : r.initial.status === 'applying'
        ? [r.baseRevision, r.approvedRevision] : [r.baseRevision];
      if (!expected.includes(core().revision(o.getDb(), r.sources))) {
        throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      }
    };
    const validate = db => {
      if (!db || !Array.isArray(db.items) || !final && (!db.items.length || db.items.some(i => i.kind !== 'reading-paragraph'))) {
        throw new Error(t('rv_structure_invalid', 'Correggi o escludi gli elementi con campi non validi prima di completare i materiali.'));
      }
      const result = o.validateDb(clone(db));
      if (result === false || result?.ok === false) throw new Error(t('rv_structure_invalid', 'Correggi o escludi gli elementi con campi non validi prima di completare i materiali.'));
      if (final) validateFinal(db.items);
    };
    assertCurrent();
    return { options: o, final, review, assertCurrent, validate, db: () => clone(o.getDb()) };
  }
  function installReading(manifest, candidate) {
    Object.assign(manifest, candidate);
    if (state().activeVaultPath === manifest.review.vaultPath) state()._pipelineManifest = manifest;
  }
  R.approveReading = async function (vaultPath, manifest, options, approval) {
    if (committing) throw new Error(t('rv_busy', 'Attendi il salvataggio in corso.'));
    const a = readingAdapter(vaultPath, manifest, options);
    committing = true;
    try {
      a.assertCurrent();
      const r = a.review(), db = a.db();
      if (r.initial.status === 'approved') {
        a.validate(db);
        if (!core().gate(r, db, r.sources).allowed) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
        return manifest;
      }
      const result = (options.beginApproval || core().beginApproval)(r, db, { sources: r.sources, manualReview: approval?.manualReview === true });
      if (!result.ok) throw new Error(result.unresolved.length ? t('rv_unresolved', 'Decidi le questioni ancora aperte prima di continuare.') : t('rv_conflict', 'Il contenuto è cambiato o il controllo è incompleto: verifica la revisione.'));
      a.validate(result.db);
      const applying = clone(manifest);
      if (a.final) { applying.review.final.review = result.review; applying.review.final.stage = 'applying'; }
      else applying.review = result.review;
      await R.writeManifest(vaultPath, applying, a.assertCurrent);
      installReading(manifest, applying);
      const persisted = await options.saveReadback(clone(result.db), { review: clone(result.review), assertCurrent: a.assertCurrent });
      a.assertCurrent(); a.validate(persisted);
      const completed = core().completeApproval(result.review, core().revision(persisted, result.review.sources));
      const approved = clone(manifest);
      if (a.final) { approved.review.final.review = completed; approved.review.final.items = clone(persisted.items); approved.review.final.stage = 'approved'; }
      else approved.review = completed;
      // Keep the live review applying until the final manifest write succeeds.
      await R.writeManifest(vaultPath, approved, a.assertCurrent);
      installReading(manifest, approved);
      if (options.onCommit) await options.onCommit(clone(persisted), clone(completed));
      return manifest;
    } finally { committing = false; }
  };
  async function retryReading(vaultPath, manifest, a, onProgress) {
    a.assertCurrent();
    if (!a.final || typeof a.options.retry !== 'function') throw new Error(t('rv_validator_missing', 'Il controllo dei campi non è disponibile. Le bozze sono conservate.'));
    const old = a.review(), db = a.db(), expectedReview = JSON.stringify(old);
    const current = () => {
      a.assertCurrent();
      // A checkpoint replaces metadata with a read-back clone, not a new revision.
      // Keep detecting actual decision/content changes, including in-place changes.
      if (JSON.stringify(a.review()) !== expectedReview || old.initial.status !== 'awaiting_review' || core().revision(a.db(), old.sources) !== old.baseRevision) {
        throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      }
    };
    current();
    const report = await a.options.retry({ items: clone(db.items), sources: clone(old.sources),
      previousReport: clone(old.initial.report), onProgress, assertCurrent: current });
    current();
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error(t('rv_validator_missing', 'Il controllo dei campi non è disponibile. Le bozze sono conservate.'));
    const next = core().mergeRetry(old, core().createReview({ db, sources: old.sources, report,
      generationId: old.generationId, projectId: old.projectId, vaultPath, config: old.config }));
    const candidate = clone(manifest); candidate.review.final.review = next;
    await R.writeManifest(vaultPath, candidate, current); installReading(manifest, candidate);
    return next;
  }
  R.openReading = function (vaultPath, manifest, options) {
    const a = readingAdapter(vaultPath, manifest, options);
    if (!a.final) a.validate(a.db());
    else core().semanticSnapshot(a.db());
    return R.open(vaultPath, manifest, { [READING]: a, final: a.final, alza: options.alza,
      onContinue: options.onContinue, onClose: options.onClose });
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
  R.retryJudge = async function (vaultPath, manifest, opts) {
    assertProject(vaultPath);
    const old = manifest.review, s = state();
    if (old.initial.status !== 'awaiting_review' || core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
    const giro = window.MappAIModelli && window.MappAIModelli.avvia({ manifest, vaultPath, giudice: true });
    const key = giro ? null : window.getSystemKey && window.getSystemKey();
    if ((!key && !giro) || !window.executeJudgePass) throw new Error(t('rv_retry_key', 'Per riprovare il controllo automatico occorre una chiave AI disponibile.'));
    const report = await withJudgeSources(s, old.sources, async () => {
      // Packet 0026 (c): il rapporto precedente permette di rifare solo i lotti
      // falliti per ragioni tecniche, se fonte, contratto e modello coincidono.
      const result = await window.executeJudgePass(key, { enabled: true, apply: false,
        rapportoPrecedente: old.initial.report, onProgress: opts && opts.onProgress }, giro);
      assertProject(vaultPath);
      if (core().revision(s.db, old.sources) !== old.baseRevision) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      return result;
    });
    const next = conservaMateriali(old, core().mergeRetry(old, core().createReview({ db: s.db, sources: old.sources, report, generationId: old.generationId,
      projectId: old.projectId, vaultPath, config: old.config })));
    manifest.review = next;
    if (giro) manifest.modelliGiro = giro.riepilogo();
    await R.persistQuality(vaultPath); await R.writeManifest(vaultPath, manifest); cache();
    return next;
  };
  /* Sotto quarantena le bozze dei materiali nascono con G1 in attesa: un
     ricontrollo non le butta (packet 0042). Senza la cucitura, `next` com'è. */
  function conservaMateriali(old, next) {
    const A = window.MappAIAffermazioni;
    return A && A.conservaMateriali ? A.conservaMateriali(old, next) : next;
  }
  // A new check captures today's Setup once. The saved generation profile
  // remains the authority for retryJudge; pipeline.json owns this new report.
  R.prepareSetupJudge = function (vaultPath, manifest) {
    if (R.isBusy() || (window.mappaiOccupato && window.mappaiOccupato())) throw new Error(t('rv_busy', 'Attendi il salvataggio in corso.'));
    const s = state(), old = manifest.review, db = s.db, activeManifest = s._pipelineManifest;
    const projectId = storage()?.currentProjectId, signature = canonical(old);
    const assertCurrent = () => {
      assertProject(vaultPath);
      if (!old || old.initial?.status !== 'awaiting_review' || state() !== s || s.db !== db ||
          storage()?.currentProjectId !== projectId || s._pipelineManifest !== activeManifest ||
          manifest.review !== old || canonical(old) !== signature || core().revision(db, old.sources) !== old.baseRevision) {
        throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      }
    };
    assertCurrent();
    if (!window.MappAIModelli?.acceso()) throw new Error(t('rv_setup_enable', 'Attiva «Usa un modello per ogni fase» nel Setup AI prima di avviare questo controllo.'));
    if (!window.executeJudgePass) throw new Error(t('rv_setup_unavailable', 'Il controllo automatico non è disponibile. Riapri l’app e riprova.'));
    const giro = window.MappAIModelli.avvia({ manifest, vaultPath, giudice: true, nuovaAzione: true });
    const scelta = giro.fase('giudice');
    let used = false;
    return Object.freeze({
      provider: scelta.provider, model: scelta.model,
      run: async runOpts => {
        if (used || committing) throw new Error(t('rv_setup_expired', 'Riapri l’anteprima prima di avviare un altro controllo.'));
        if (window.mappaiOccupato && window.mappaiOccupato()) throw new Error(t('rv_busy', 'Attendi il salvataggio in corso.'));
        assertCurrent(); giro.verifica(); used = true; committing = true;
        const previous = {}, temporary = {
          _pdfPagine: old.sources.filter(x => Array.isArray(x.pages)),
          _generationSources: old.sources,
          sources: old.sources.map(x => Object.assign({}, x, { content: x.content || x.text || '' }))
        };
        const aliases = ['_judgeReport', '_giudiceReport'];
        [...Object.keys(temporary), ...aliases].forEach(k => { previous[k] = { present: own(s, k), value: s[k] }; });
        const restore = k => { if (previous[k].present) s[k] = previous[k].value; else delete s[k]; };
        try {
          let report;
          try {
            Object.assign(s, temporary);
            report = await window.executeJudgePass(null, { enabled: true, apply: false, onProgress: runOpts && runOpts.onProgress }, giro);
            assertCurrent(); giro.verifica();
          } finally {
            Object.keys(temporary).forEach(k => { if (s[k] === temporary[k]) restore(k); });
            if (s.activeVaultPath === vaultPath && s.db === db) aliases.forEach(restore);
          }
          if (!report || typeof report !== 'object') throw new Error(t('rv_setup_no_report', 'Il controllo non ha restituito un rapporto. Il precedente è conservato.'));
          report = Object.assign({}, clone(report), { quando: new Date().toISOString(), modelliGiro: giro.riepilogo() });
          const next = conservaMateriali(old, core().mergeRetry(old, core().createReview({ db, sources: old.sources, report,
            generationId: old.generationId, projectId: old.projectId, vaultPath, config: old.config, now: report.quando })));
          next.createdAt = old.createdAt;
          const candidate = Object.assign({}, manifest, { review: next });
          // One authoritative write: never replace the previous quality file
          // before the new review has been saved successfully.
          await R.writeManifest(vaultPath, candidate, assertCurrent);
          Object.assign(manifest, candidate);
          s._pipelineManifest = manifest;
          aliases.forEach(k => { s[k] = next.initial.report; });
          cache();
          return next;
        } finally { committing = false; }
      }
    });
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
      // sotto quarantena G2 confronta i materiali con la stessa vista da cui sono nati (packet 0042)
      const A = window.MappAIAffermazioni, Q = A && A.perMateriali ? A.perMateriali(manifest) : null;
      const material = Q ? grounding.buildInput(Q.db, Q.db.nodes, review.sources, Q.review, { includeOriginalPages: true })
        : grounding.buildInput(s.db, s.db.nodes, review.sources, review, { includeOriginalPages: true });
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
  /* `opts.quarantena` (packet 0042): con la quarantena accesa la revisione dei
     contenuti è FACOLTATIVA, e la ripresa della pipeline passa anche senza un
     record ancora valido — lo calcola lei, e il cancello decide dopo. Lo
     passano solo `Pipeline.run` (ripresa) e `runApprovedMaterials`; senza
     l'opzione tutto resta come prima.
     Giro 5 del 26/09 (F4): la scorciatoia vale SOLO per la pipeline dei
     materiali, l'unica che genera dalla vista con le frasi in quarantena tolte.
     Il cancello avvolto consente con `reason: 'quarantine'` anche a chi non
     passa l'opzione — il «Percorso breve» (mappai-learning-path.js) e ogni
     altro chiamante —, e lì la mappa arriverebbe com'è, frasi contestate
     comprese. Senza l'opzione quel consenso non vale: si apre il Banco, come
     prima della quarantena, finché G1 non è approvata. */
  // Il menu generale può essere aperto anche su un percorso senza nodi.
  // Solo l'adattatore del percorso può approvare o ripristinare quel registro.
  function openReadingProject(vaultPath, manifest) {
    const s = state(), ptr = manifest?.reading, current = s?._pipelineManifest?.reading;
    if (s?.extractionMode !== 'lettura' || !vaultPath || vaultPath !== s.activeVaultPath ||
        manifest?.vaultPath !== vaultPath || ptr?.kind !== 'percorso-lettura' || ptr.extractionMode !== 'lettura' ||
        !ptr.projectId || ptr.projectId !== storage()?.currentProjectId ||
        manifest.review?.projectId !== ptr.projectId || manifest.review?.vaultPath !== vaultPath ||
        !current || ['projectId', 'percorsoId', 'sourceId', 'sourcePath'].some(key => !ptr[key] || current[key] !== ptr[key])) {
      throw new Error(t('pl_stale', 'Il progetto è cambiato. Riapri il percorso prima di continuare.'));
    }
    const runtime = window.MappAIPercorsoLettura;
    if (typeof runtime?.openCurrent !== 'function') throw new Error(t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'));
    return runtime.openCurrent();
  }
  R.requireApproved = async function (opts) {
    const s = state();
    if (s._reviewLoading || s._reviewRestoring || s._reviewRestoreError || busy || committing) return false;
    if (s.extractionMode === 'lettura' || s._pipelineManifest?.reading) {
      await openReadingProject(s.activeVaultPath, s._pipelineManifest);
      return false; // I consumatori della mappa non possono usare il gate testuale.
    }
    const review = R.current();
    if (!review) return true; // legacy remains usable; no retrospective approval
    const gate = core().gate(review, s.db, review.sources);
    const perQuarantena = !!(gate && (gate.quarantine || gate.reason === 'quarantine'));
    if (gate.allowed && (!perQuarantena || (opts && opts.quarantena))) return true;
    const A = opts && opts.quarantena ? window.MappAIAffermazioni : null;
    if (A && A.facoltativa(review)) return true;
    if (review.initial.status === 'approved') {
      // A real content edit needs a fresh review; keep the previous decisions.
      const manifest = s._pipelineManifest, vaultPath = s.activeVaultPath, db = s.db;
      const previous = clone(review);
      const giro = window.MappAIModelli && window.MappAIModelli.avvia({ manifest, vaultPath: s.activeVaultPath, giudice: true });
      const key = giro ? null : window.getSystemKey && window.getSystemKey();
      const report = window.executeJudgePass && (giro || key)
        ? await withJudgeSources(s, review.sources, () => window.executeJudgePass(key, { enabled: true, apply: false }, giro)) : {};
      assertProject(vaultPath);
      if (s.db !== db || s._pipelineManifest !== manifest || manifest.review !== review) throw new Error(t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'));
      if (giro) manifest.modelliGiro = giro.riepilogo();
      manifest.review = core().createReview({ db: s.db, sources: review.sources, report,
        generationId: s._generationId, vaultPath: s.activeVaultPath, config: manifest.config });
      manifest.review.previous = previous;
      s._reviewRevision = manifest.review.baseRevision;
      await R.writeManifest(s.activeVaultPath, manifest);
    }
    /* Trappola 52 anche qui (giro 4 del 26/09, E4): sotto quarantena il Banco
       chiede il suo piano al motore, perché si può arrivare qui da dentro una
       console — la pipeline con l'opzione e, dal gate 3 del 27/09, anche chi
       non la passa: «Crea un documento» da ELABORA apriva il Banco a z 3400
       sotto la console, e sembrava che la generazione non partisse. Con la
       quarantena spenta la chiamata è quella di prima; dallo 0074 (punto 11)
       è `R.open` stesso a chiedere il piano quando una console è aperta. */
    if (alzaSottoQuarantena()) R.open(s.activeVaultPath, s._pipelineManifest, { alza: true });
    else R.open(s.activeVaultPath, s._pipelineManifest);
    return false;
  };
  function alzaSottoQuarantena() {
    const A = window.MappAIAffermazioni;
    return !!(A && A.quarantenaAccesa && A.quarantenaAccesa());
  }
  R.requireStandalone = async function () {
    if (!await R.requireApproved()) return false;
    const s = state(), review = R.current();
    if (!review) return true;
    const final = review.final;
    if (final && final.stage !== 'done') {
      // gate 3 del 27/09: «Crea un documento» parte da ELABORA, dentro una console
      const alza = alzaSottoQuarantena();
      if (final.review) {
        if (final.review.initial.status === 'applying') await R.restore(s.activeVaultPath, s._pipelineManifest);
        if (alza) R.open(s.activeVaultPath, s._pipelineManifest, { final: true, alza: true });
        else R.open(s.activeVaultPath, s._pipelineManifest, { final: true });
      } else {
        if (window.showToast) window.showToast(t('rv_standalone_pending', 'La revisione dei materiali è in corso. Riprendila dal progetto prima di creare nuovi esercizi.'), 'info');
        if (alza) await R.openCurrent({ alza: true });
        else await R.openCurrent();
      }
      return false;
    }
    if (window.showToast) window.showToast(t('rv_standalone_controlled', 'Per controllare anche i nuovi materiali, usa Genera materiali. Le attività già salvate restano disponibili.'), 'info');
    if (window.MappAIPipeline && window.MappAIPipeline.openModal) window.MappAIPipeline.openModal({ fromApproved: true });
    return false;
  };
  /* `opts.alza` (giro 7 del 26/09, H11): solo `runApprovedMaterials` sotto
     quarantena lo passa — il Banco di G2 riaperto da una console chiede il suo
     piano al motore (inv. 11, trappola 52). Senza, la chiamata di sempre. */
  R.openCurrent = async function (opts) {
    const s = state();
    if ((window.mappaiOccupato && window.mappaiOccupato()) || R.isBusy() || s._reviewRestoring || s._reviewRestoreError) return;
    if (s.extractionMode === 'lettura' || s._pipelineManifest?.reading) return openReadingProject(s.activeVaultPath, s._pipelineManifest);
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
    /* 0090 (parte B; Giacomo 12/10: «riporti sempre a ELABORA indipendentemente da dove sia stato lanciato»):
       «Salva e continua più tardi» ed ESC aprono ELABORA sul progetto (`dopoChiusura`); «Continua» porta
       `aElabora` alla pipeline, che a materiali nati apre ELABORA prima del riepilogo. La strada è quella di
       B14 (`MappAIPipeline.tornaInElabora`). Interruttore `mappai_elabora_attesa` ('0' = come prima). */
    const versoElabora = (() => {
      try { const C = window.MappAIMaterialiAttesaCore; return !!(C && C.acceso(window.localStorage) && window.MappAIPipeline && window.MappAIPipeline.tornaInElabora); }
      catch (e) { return false; }
    })();
    const extra = versoElabora ? { dopoChiusura: () => window.MappAIPipeline.tornaInElabora(), continua: { aElabora: true } } : {};
    if (opts && opts.alza) R.open(s.activeVaultPath, manifest, Object.assign({ final: !!(final && final.review), alza: true }, extra));
    else R.open(s.activeVaultPath, manifest, Object.assign({ final: !!(final && final.review) }, extra));
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
    const reading = options[READING] || null;
    if (!reading && (manifest?.reading || state().extractionMode === 'lettura')) {
      if (busy || committing) return;
      return openReadingProject(vaultPath, manifest);
    }
    const readingSource = !!reading && !reading.final;
    const isFinal = !!options.final;
    const currentDb = () => reading ? reading.db() : isFinal ? { items: manifest.review.final.items } : state().db;
    const hasResume = () => !!options.onContinue || (!reading && pendingOutputs(manifest));
    const approve = manualReview => reading
      ? R.approveReading(vaultPath, manifest, reading.options, { manualReview })
      : R.approve(vaultPath, manifest, { final: isFinal, manualReview });
    const getReview = () => isFinal ? manifest.review.final.review : manifest.review;
    if (!getReview() || busy || committing) return;
    function checkMessage() {
      const initial = getReview().initial, report = initial.report || {};
      if (readingSource) return initial.status === 'approved'
        ? t('rv_reading_confirmed', 'Fonte verificata dal docente. Il controllo automatico non è stato eseguito.')
        : t('rv_reading_manual', 'Confronta il testo ricomposto con la fonte originale. Il controllo automatico non è stato eseguito.');
      if (initial.checkStatus === 'completed') return t('rv_check_completed', 'Controllo automatico completato.');
      const checked = report.copertura?.nodiEsaminati?.length || report.copertura?.linkEsaminati?.length || report.coverage?.checkedIds?.length;
      return checked ? t('rv_check_partial', 'Controllo automatico eseguito: alcune parti restano da verificare.') :
        t('rv_check_incomplete', 'Il controllo automatico non ha potuto confermare la verifica di tutti i contenuti.');
    }
    const old = document.getElementById('mappai-teacher-review'); if (old) old.remove();
    const previousFocus = document.activeElement;
    /* 0069 (ADR 0016): quando la fonte della revisione È la scheda di un dossier, il
       linguaggio dice il vero — il riscontro è nella scheda, e un rimando apre un
       suo blocco. Decide il dato (le fonti salvate), non l'interruttore. */
    const DFc = window.MappAIDossierFonteCore;
    const fonteScheda = !!(DFc && DFc.eFonteScheda(manifest.review && manifest.review.sources));
    const referenceOptions = fonteScheda
      ? { sourceLabel: t('rv_scheda_rimando', 'Scheda'), unknownLabel: t('rv_scheda_da_verificare', 'Scheda da verificare') }
      : { sourceLabel: t('rv_source', 'Fonte'), unknownLabel: t('rv_reference_unknown', 'Fonte da verificare') };
    const registry = (getReview().baseSnapshot.items || []).flatMap(item => item.citations || [])
      .concat(getReview().initial.issues.flatMap(issue => issue.citationAdditions || []));
    function referenceView(value, item) {
      const grounding = window.MappAIGroundingCore;
      const vista = grounding && grounding.referenceView ? grounding.referenceView(String(value), registry, referenceOptions) : { text: String(value), mapping: [] };
      /* 0069, giro 10: sulla scheda il rimando dice il BLOCCO («[Che cosa si vede]»),
         non un numero; per un PDF la vista è quella del grounding, intatta */
      /* 0069, giro 15: anche le note `[n]` dell'item (la Sintesi) dicono il blocco;
         i numeri sono dell'item, quindi servono le SUE citazioni. Solo resa: `note`
         viaggia con la vista e `restoreReferences` rimette i numeri.
         Giro 16: le note PRIMA dei rimandi, così un rimando aggiunto da una
         proposta non rinomina le note che c'erano (il confronto non segna frasi
         intatte); i rimandi poi saltano i nomi già presi dalle note */
      const pre = fonteScheda && item && DFc && typeof DFc.noteConNome === 'function' ? DFc.noteConNome(vista.text, item.citations, []) : null;
      const base = pre && pre.note.length ? Object.assign({}, vista, { text: pre.text }) : vista;
      const nomi = fonteScheda && DFc && typeof DFc.rimandiConNome === 'function' ? DFc.rimandiConNome(base) : base;
      return pre && pre.note.length ? Object.assign({}, nomi, { note: pre.note }) : nomi;
    }
    function restoreReferences(value, view) {
      const ids = window.MappAIGroundingCore?.restoreReferenceIds ? window.MappAIGroundingCore.restoreReferenceIds(value, view.mapping) : value;
      return view && view.note && DFc && typeof DFc.ripristinaNote === 'function' ? DFc.ripristinaNote(ids, view.note) : ids;
    }
    const displayValue = (value, target, item) => referenceView(readable(value, target, item), item).text;
    const palette = typeof colorScale !== 'undefined' ? colorScale : window.colorScale || {};
    const contextIndex = window.MappAIReviewContext?.createIndex(reading ? { nodes: [] } : state().db, manifest.review?.drafts || {}, palette);
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
        label: reading ? t('rv_reading_text', 'Testo di riferimento') : context.scope === 'overview' ? t('rv_context_overview', 'Trasversale') : t('rv_context_unknown', 'Area non disponibile'), color: null }];
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
    /* LA VESTE DEL BANCO (packet 0073 per G2, 0075 per G1; ADR 0012 revisioni 3-6): in G2 barra per materiale,
       una scheda scrivibile sul posto, un bottone solo; in G1 barra per nodo, una scheda per nodo con le note sopra
       il campo, la chiusura nel piede. ⌘Z del Banco in tutte e due. Solo nel Banco; interruttore
       `mappai_banco_veste`, acceso se la chiave manca dal packet 0089 (ADR 0020); '0' lo spegne: questo modale, byte per byte. */
    const vesteAccesa = !readingSource && banco && !!window.MappAIBancoVeste && !!window.MappAIBancoCore &&
      (() => { try { return localStorage.getItem('mappai_banco_veste') !== '0'; } catch (e) { return true; } })();
    let veste = null;
    /* B10 (0088): in G2, quando la quarantena rende G1 FACOLTATIVA e G1 è ancora in attesa, «1 Contenuti» in
       testata diventa un bottone che porta a G1. Prima era solo un indicatore, e l'unica strada a G1 era
       «Rivedi i contenuti» nel riepilogo di «Genera materiali», che compare una volta sola. In tutti gli altri
       casi (G1 approvata o aperta, quarantena spenta, lettura) il passo resta com'è. */
    const contenutiRiapribili = isFinal && !reading && (() => {
      try {
        const A = window.MappAIAffermazioni;
        return !!(A && typeof A.facoltativa === 'function' && manifest.review && A.facoltativa(manifest.review) &&
          manifest.review.initial && manifest.review.initial.status === 'awaiting_review');
      } catch (e) { return false; }
    })();
    const modal = document.createElement('div');
    modal.id = 'mappai-teacher-review';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[3400] flex items-center justify-center p-4' + (banco ? ' mrv-banco' : '');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'mrv-title');
    const project = String(manifest.config?.nome || state().db.title || vaultPath.split(/[\\/]/).filter(Boolean).pop() || '');
    modal.innerHTML = '<div class="mrv-dashboard">' +
      /* Nella pelle del Banco la testata è solo titolo e fasi: il nome del progetto e
         la frase di spiegazione occupavano due righe (Giacomo, 16/9). */
      '<header class="mrv-header"><div class="mrv-heading">' + (banco ? '' : '<p class="mrv-eyebrow">' + esc(project) + '</p>') + '<h2 id="mrv-title" class="pm-title" tabindex="-1">' + esc(readingSource ? t('rv_reading_title', 'Verifica il testo di partenza') : isFinal ? t('rv_final_title', 'Rivedi i materiali') : t('rv_title', 'Revisione pre-materiali')) +
      '</h2>' + (banco ? '' : '<p class="pm-subtitle">' + esc(readingSource ? t('rv_reading_manual', 'Confronta il testo ricomposto con la fonte originale. Il controllo automatico non è stato eseguito.') : isFinal ? t('rv_dashboard_material_purpose', 'Verifica domande e risposte prima di consegnarle agli studenti. Le tue scelte aggiornano i materiali finali.') : t('rv_dashboard_map_purpose', 'Verifica i concetti di partenza. Le tue scelte guideranno la creazione dei materiali differenziati.')) + '</p>') +
      '</div><ol class="mrv-stages" aria-label="' + esc(t('rv_dashboard_stages', 'Fasi del lavoro')) + '">' +
      /* Due fasi: via «Pronti da usare» e il suo pallino 3 (Giacomo, 25/9). */
      [t('rv_dashboard_contents', 'Contenuti'), t('rv_dashboard_materials', 'Materiali')].map((label, i) => '<li' + (i === (isFinal ? 1 : 0) ? ' aria-current="step"' : '') + '>' +
        (i === 0 && contenutiRiapribili
          ? '<button type="button" id="mrv-step-contenuti" class="mrv-stage-btn" aria-label="' + esc(t('rv_dashboard_contents_back', 'Torna a rivedere i contenuti. Le correzioni valgono per i materiali che generi dopo.')) +
            '" title="' + esc(t('rv_dashboard_contents_back', 'Torna a rivedere i contenuti. Le correzioni valgono per i materiali che generi dopo.')) + '"><span>' + (i + 1) + '</span>' + esc(label) + '</button>'
          : '<span>' + (i + 1) + '</span>' + esc(label)) + '</li>').join('') + '</ol></header>' +
      '<div class="mrv-overview"><div><strong id="mrv-progress-label"></strong><p id="mrv-filter-count" aria-live="polite"></p></div><progress id="mrv-progress" max="100" value="0" aria-label="' + esc(t('rv_dashboard_progress', 'Avanzamento delle decisioni')) + '"></progress><p id="mrv-status" role="status" aria-live="polite"></p><button type="button" id="mrv-save-retry" hidden class="pm-btn-cancel">' + esc(t('rv_save_retry', 'Riprova il salvataggio')) + '</button></div>' +
      '<div class="mrv-workspace"><aside class="mrv-sidebar" id="mrv-sidebar" data-expanded="false" aria-label="' + esc(t('rv_dashboard_queue', 'Elenco delle segnalazioni')) + '"><button type="button" id="mrv-toggle-list" class="pm-btn-cancel" aria-expanded="false" aria-controls="mrv-list">' + esc(t('rv_dashboard_show_list', 'Elenco e ricerca')) + '</button><div id="mrv-list"><div id="mrv-filters" role="group" aria-label="' + esc(t('rv_filter_label', 'Mostra le decisioni')) + '"></div>' +
      '<label class="mrv-search-label" for="mrv-search">' + esc(t('rv_dashboard_search', 'Cerca nelle segnalazioni')) + '</label><input id="mrv-search" type="search" placeholder="' + esc(t('rv_dashboard_search_hint', 'Concetto, domanda o problema…')) + '">' +
      '<div class="mrv-facets"><label for="mrv-area">' + esc(t('rv_context_area', 'Macroarea')) + '<select id="mrv-area"></select></label><label for="mrv-kind"' + (isFinal ? '' : ' hidden') + '>' + esc(t('rv_context_kind', 'Materiale')) + '<select id="mrv-kind"></select></label>' +
      '<label for="mrv-reason">' + esc(t('rv_context_reason', 'Motivo')) + '<select id="mrv-reason"></select></label></div><button type="button" class="pm-btn-cancel" id="mrv-clear-filters" hidden>' + esc(t('rv_context_clear', 'Azzera i filtri')) + '</button>' +
      '<p id="mrv-queue-count" aria-live="polite"></p><nav id="mrv-queue" aria-label="' + esc(t('rv_dashboard_queue', 'Elenco delle segnalazioni')) + '"></nav>' +
      '</div><details class="mrv-coverage" id="mrv-coverage-options"><summary>' + esc(t('rv_dashboard_coverage', 'Copertura del controllo')) + ' · <span id="mrv-coverage-label"></span></summary><p id="mrv-coverage-status"></p><div id="mrv-coverage-details"></div><div id="mrv-manual"></div></details></aside>' +
      (banco ? '<button type="button" class="mrv-maniglia" id="mrv-maniglia" aria-controls="mrv-sidebar" aria-expanded="true" title="' + esc(t('rv_nav_hide', 'Nascondi elenco e controlli')) + '" aria-label="' + esc(t('rv_nav_hide', 'Nascondi elenco e controlli')) + '"><i data-lucide="panel-right-close" aria-hidden="true"></i></button>' : '') +
      /* 0074 (ADR 0012 rev. 3, p. 5): con la veste la Fonte sta a DESTRA della scheda, anche nel DOM (il Tab passa
         dalla scheda alla Fonte); senza, a sinistra come sempre. */
      '<div class="mrv-detail">' + (banco ? '<div class="mrv-colonne">' + (vesteAccesa ? '' : '<section class="mrv-fonte" id="mrv-fonte"></section>') + '<div class="mrv-carte">' : '') +
      /* 0074, punto 10 (F7, F8): con la veste, fra il pannello delle occorrenze e ciò che sta sotto, il divisore che lo
         regola; nasce nascosto (il pannello parte chiuso) e lo governa `seguiOccorrenze`, qui sotto. */
      (isFinal ? '<div id="mrv-occurrences-host"></div>' + (vesteAccesa ? '<div class="mrv-occ-divisore" id="mrv-occorrenze-divisore" role="separator" aria-orientation="horizontal" aria-controls="mrv-occurrences-host" aria-valuemin="0" aria-valuemax="75" tabindex="0" hidden' +
        ' title="' + esc(t('rv_occurrences_split', 'Sposta il confine fra occorrenze e materiali; in alto, al 15% o meno, le occorrenze si chiudono')) +
        '" aria-label="' + esc(t('rv_occurrences_split', 'Sposta il confine fra occorrenze e materiali; in alto, al 15% o meno, le occorrenze si chiudono')) + '"></div>' : '') : '') + '<nav id="mrv-detail-nav" aria-label="' + esc(t('rv_dashboard_navigation', 'Navigazione tra le segnalazioni')) + '">' +
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
      '</nav><div id="mrv-content"></div>' + (banco ? '</div>' + (vesteAccesa ? '<section class="mrv-fonte" id="mrv-fonte"></section>' : '') + '</div>' : '') + '</div></div>' +
      '<footer class="mrv-footer"><p id="mrv-next-step"></p><div class="mrv-footer-actions">' +
      '<button type="button" class="pm-btn-cancel" id="mrv-later">' + esc(t('rv_later', 'Salva e continua più tardi')) + '</button>' +
      '<button type="button" class="pm-btn-primary" id="mrv-continue"></button></div></footer></div>';
    document.body.appendChild(modal);
    /* Invariante 11: il Banco chiede il suo piano al motore quando c'è qualcosa da coprire. `options.alza` lo
       passano il riepilogo dei materiali (sopra una console) e, sotto quarantena, la pipeline quando apre il Banco
       di G2 (giro 3, D5) o ricade sul cancello di oggi aprendo quello di G1 (giro 4, E4).
       0074, punto 11 (F9, Giacomo 06/10: «Sì, sempre»): lo chiede anche ogni volta che una finestra del motore è
       aperta (`MappAIModal.aperti > 0`: le console ELABORA, INSEGNA, Cabina), a veste accesa e spenta, con la
       quarantena accesa e spenta — così ogni chiamante (`checkResume`, «Riprendi», «Crea un documento» da ELABORA)
       apre il Banco sopra la console senza passare l'opzione. Senza finestre del motore aperte resta a z-[3400]:
       non c'è niente da coprire. Una richiesta sola anche con `alza` e una console aperta. */
    const sopraUnaConsole = () => { try { return !!(window.MappAIModal && window.MappAIModal.aperti > 0); } catch (e) { return false; } };
    if (options.alza || sopraUnaConsole()) { try { if (window.MappAIModal && window.MappAIModal.prossimoZ) modal.style.zIndex = String(window.MappAIModal.prossimoZ()); } catch (e) { /* resta z-[3400] */ } }
    /* LO STRATO DELLE AFFERMAZIONI (packet 0042): null con gli interruttori
       spenti e in G2 — allora il Banco è quello di sempre, byte per byte. */
    let strato = null;
    try {
      const UIA = window.MappAIAffermazioniUI;
      strato = !reading && UIA && UIA.per ? UIA.per({ manifest, isFinal, getReview, db: () => state().db,
        vaiA: issueId => {
          if (veste) return veste.vaiANota(issueId);   // 0075: con la veste si apre la riga che contiene la segnalazione
          // come «Rivedi l’altra decisione»: si allargano i filtri solo se la voce non si vedrebbe
          if (!visibleGroups.some(g => g.some(i => i.id === issueId))) {
            activeFilter = 'all'; search = ''; modal.querySelector('#mrv-search').value = '';
            Object.keys(facets).forEach(key => { facets[key] = ''; });
          }
          return navigate(issueId);
        },
        mostraFonte: prove => {
          if (!fonte) return;
          const passi = fonte.mostra(prove);
          /* 0075 (§4.11): con la veste la Fonte che si era chiusa da sola (F1) si riapre sulle prove che lo strato mostra.
             Giro 2 (D5): solo se la Fonte le ha trovate; con zero passi la Fonte resta com'era, aperta o chiusa */
          if (veste && seguiFonte && typeof passi === 'number' && passi > 0) seguiFonte('\u0000strato', passi);
        },
        // 0075 (Q1): con la veste «Correggi il nodo vicino» apre la scheda del nodo, anche fuori elenco; senza, falso e
        // lo strato fa come prima (il riquadro «Correggi anche un nodo non segnalato»)
        correggiNodo: nodeId => !!veste && veste.correggiNodo(nodeId) }) : null;
    } catch (e) { strato = null; console.warn('[Revisione] strato delle affermazioni non disponibile:', e); }
    const statoDaDecidere = (group, ripiego) => (strato && strato.stato(group)) || ripiego;
    const content = modal.querySelector('#mrv-content'), status = modal.querySelector('#mrv-status');
    const proceed = modal.querySelector('#mrv-continue'), retrySave = modal.querySelector('#mrv-save-retry');
    let pendingSave = Promise.resolve(), saveError = null, manualConfirmed = false, closed = false;
    /* Vero quando l'approvazione manuale è decaduta da un salvataggio all'altro:
       lo alza `invalidateManualCheck`, lo consuma e lo azzera `save`. */
    let approvazioneDecaduta = false;
    const invalidEditors = new Set();
    /* Il PDF della fonte si legge dal vault, col suo titolo: prima da `Fonti/`,
       dove lo scrive la generazione dallo 0059, poi da `Allegati/`, dove stava
       nei vault di prima (e dove resta la copia per l'allievo). Quale dei due
       file lo decide `MappAIFontiCore.pdfPerTitolo` (B2, «per nome»): la stessa
       regola di ELABORA. Nessun PDF → il pannello mostra il testo archiviato.
       Di `Allegati/` si usa solo il nome: il `relPath` che dà l'elenco dice
       «Materiale Studio/» (main.js:1267). */
    let elenchiPdf = null;
    async function leggiPdfDellaFonte(titolo) {
      const api = window.electronAPI, FO = window.MappAIFontiCore, trova = window.MappAIReviewFonte.trovaPdf;
      if (!api || !api.readVaultFile) return null;
      const nomi = r => (r && r.ok !== false && Array.isArray(r.files) ? r.files.map(f => f && f.name).filter(Boolean) : []);
      if (!elenchiPdf) elenchiPdf = Promise.all([
        Promise.resolve().then(() => api.vaultSourcesList ? api.vaultSourcesList({ vaultPath }) : null).then(nomi).catch(() => []),
        Promise.resolve().then(() => api.vaultMaterialsList ? api.vaultMaterialsList({ vaultPath, dir: 'Allegati' }) : null).then(nomi).catch(() => [])
      ]).then(([fonti, allegati]) => ({ fonti, allegati }));
      const elenchi = await elenchiPdf;
      /* senza il core, come prima dello 0059: solo `Allegati/` */
      const rel = FO ? FO.pdfPerTitolo(titolo, elenchi, trova) : (n => (n ? 'Allegati/' + n : null))(trova(titolo, elenchi.allegati));
      if (!rel) return null;
      const letto = await api.readVaultFile({ vaultPath, relPath: rel });
      if (!letto || !letto.ok || !letto.base64) return null;
      const bin = atob(letto.base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    /* La foto di un dossier (0069): quella piena in `Allegati/`, dove la copia la
       pipeline col nome del titolo (la stessa ricerca di Proietta, che legge
       `Allegati/` e ripiega sulla scheda); se non c'è — i dossier di prima dello
       0067 — quella da 900 px che la scheda porta con sé. Mai un errore. */
    async function leggiFotoDelDossier() {
      const api = window.electronAPI, dossier = (manifest.config && manifest.config.dossier) || {};
      const dallaScheda = () => dossier.fotoB64 ? { src: 'data:' + (dossier.mime || 'image/jpeg') + ';base64,' + dossier.fotoB64 } : null;
      if (!api || !api.vaultMaterialsList || !api.readVaultFile) return dallaScheda();
      try {
        const elenco = await api.vaultMaterialsList({ vaultPath, dir: 'Allegati' });
        const nomi = (elenco && elenco.ok !== false && Array.isArray(elenco.files) ? elenco.files : []).map(f => f && f.name).filter(Boolean);
        const nome = window.MappAIReviewFonte.trovaFoto(nomi, dossier.titolo || '');
        if (!nome) return dallaScheda();
        const letto = await api.readVaultFile({ vaultPath, relPath: 'Allegati/' + nome });
        if (!letto || !letto.ok || !letto.base64) return dallaScheda();
        const mime = /\.png$/i.test(nome) ? 'image/png' : /\.webp$/i.test(nome) ? 'image/webp' : /\.gif$/i.test(nome) ? 'image/gif' : 'image/jpeg';
        return { src: 'data:' + mime + ';base64,' + letto.base64 };
      } catch (e) { return dallaScheda(); }
    }
    let fonte = null;
    /* 0074, F1: con la veste la Fonte segue la scheda e si chiude da sola sul materiale senza passi. La veste
       dice quante prove hanno trovato una pagina; chi decide aprire e chiudere è il divisore, qui sotto. */
    let seguiFonte = null;
    /* 0074, punto 10: con la veste, `renderOccurrences` lo chiama dopo ogni disegno del pannello (divisore e altezza) */
    let seguiOccorrenze = null;
    if (banco) {
      /* Una riga sola per titolo, avanzamento e fasi (Giacomo, 16/9: «estendi
         orizzontalmente per salvare spazio verticale»). Si sposta il blocco
         dell'avanzamento dentro la testata: gli id restano quelli. */
      const testata = modal.querySelector('.mrv-header'), avanzamento = modal.querySelector('.mrv-overview');
      if (testata && avanzamento && testata.insertBefore) testata.insertBefore(avanzamento, testata.querySelector('.mrv-stages'));
      /* La testata ha un'altezza fissa (Giacomo, 25/9): un testo che non ci sta si accorcia
         con «…» (mappai-review-dashboard.css) e, solo se accorciato, si legge intero passandoci
         sopra col mouse. Lo stato resta intero per i lettori di schermo (aria-live). */
      if (testata && testata.addEventListener) testata.addEventListener('mouseover', e => {
        const el = e.target && e.target.closest && e.target.closest('#mrv-title, #mrv-progress-label, #mrv-status');
        if (el) el.title = el.scrollWidth > el.clientWidth ? el.textContent : '';
      });
      /* 0069: per un dossier da immagine (interruttore acceso) il pannello mostra la
         foto analizzata e i blocchi della scheda; per un dossier generato prima la
         scheda si legge lo stesso, senza agganciare i rimandi (`fontiDelPannello`). */
      let pannello = { sources: getReview().sources || [], immagine: false };
      try {
        if (DFc) pannello = DFc.fontiDelPannello({ sources: getReview().sources || [], dossier: manifest.config && manifest.config.dossier,
          acceso: DFc.acceso(window.localStorage) });
      } catch (e) { console.warn('[Revisione] scheda del dossier non leggibile:', e); }
      try {
        fonte = window.MappAIReviewFonte.monta(modal.querySelector('#mrv-fonte'), Object.assign({ sources: pannello.sources, t, leggiPdf: leggiPdfDellaFonte },
          pannello.immagine ? { immagine: leggiFotoDelDossier,
            etichette: { titolo: t('rv_scheda_pannello', 'Immagine e scheda'), testo: t('rv_scheda_testo', 'Testo della scheda') } } : {},
          /* 0074, solo con la veste: il testo della pagina sempre aperto (F2), solo le citazioni si cercano nella
             fonte (F4), e al posto della pagina la frase di F1 */
          vesteAccesa ? { testoAperto: true, soloCitazioni: true,
            vuoto: t('rv_fonte_senza_passi', 'Nessun passo nella fonte per questo materiale') + '. ' + t('rv_fonte_scegli_pagina', 'Scegli una pagina dall’elenco.') } : {}));
      }
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
         Sotto i 900px le colonne sono impilate e il divisore non si vede (CSS).
         0074 (ADR 0012 rev. 3, p. 5): con la veste la Fonte sta a DESTRA e il divisore si specchia —
         la Fonte è la distanza dal bordo destro, oltre quel bordo si chiude e la linguetta resta lì,
         ← la allarga e → la stringe; stessi minimi, stessa preferenza. E segue la scheda (F1, «vince il
         tuo gesto»): chiusa a mano resta chiusa; altrimenti si chiude da sola sul materiale senza passi
         nella fonte e lo dice sulla linguetta. Quella chiusura NON è una preferenza: sta in `auto`, fuori
         da `stato`, e non si salva. Riaperta a mano su un materiale senza passi resta aperta finché si
         resta su quel materiale. Con la foto come fonte (0069) non si chiude mai da sola. */
      const colonne = modal.querySelector('.mrv-colonne'), fonteEl = modal.querySelector('#mrv-fonte');
      if (colonne && fonteEl) {
        const CHIAVE = 'mappai_revisione_fonte', MIN_FONTE = 280, MIN_CARTE = 360, SOGLIA = 0.1;
        const stato = { frazione: 0.5, chiusa: false };
        const aDestra = vesteAccesa, conFoto = !!pannello.immagine;
        let auto = false, senzaPassi = false, apertaQui = false, materiale;
        try { const letto = JSON.parse(localStorage.getItem(CHIAVE) || '{}'); if (letto.frazione > 0 && letto.frazione < 1) stato.frazione = letto.frazione; stato.chiusa = !!letto.chiusa; } catch (e) { /* valori predefiniti */ }
        const divisore = document.createElement('div');
        divisore.className = 'mrv-divisore'; divisore.tabIndex = 0;
        divisore.setAttribute('role', 'separator'); divisore.setAttribute('aria-orientation', 'vertical');
        divisore.setAttribute('aria-valuemin', '0'); divisore.setAttribute('aria-valuemax', '100');
        colonne.appendChild(divisore);
        const limita = f => { const W = colonne.clientWidth || 0; if (W < MIN_FONTE + MIN_CARTE) return f; return Math.min(Math.max(f, MIN_FONTE / W), 1 - MIN_CARTE / W); };   // area nascosta o stretta: nessun limite in px
        const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) { /* resta per questa apertura */ } };
        const chiusa = () => stato.chiusa || auto;
        // un gesto del docente che apre: vince sulla chiusura automatica finché si resta sul materiale aperto
        const apriDalDocente = () => { stato.chiusa = false; auto = false; apertaQui = true; };
        const applica = () => {
          const c = chiusa();
          colonne.classList.toggle('is-fonte-chiusa', c);
          colonne.style.setProperty('--mrv-fonte-w', c ? '0%' : (limita(stato.frazione) * 100).toFixed(2) + '%');
          fonteEl.inert = c;
          const etichetta = c ? (senzaPassi ? t('rv_fonte_senza_passi', 'Nessun passo nella fonte per questo materiale') + '. ' : '') + t('rv_split_open', 'Riapri la fonte: trascina o fai clic')
            : aDestra ? t('rv_split_move_destra', 'Sposta il confine fra schede e fonte; oltre il bordo destro la fonte si chiude')
              : t('rv_split_move', 'Sposta il confine fra fonte e schede; oltre il bordo sinistro la fonte si chiude');
          divisore.title = etichetta; divisore.setAttribute('aria-label', etichetta);
          divisore.setAttribute('aria-valuenow', String(c ? 0 : Math.round(limita(stato.frazione) * 100)));
        };
        let presa = null;
        divisore.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          // `auto`: la presa comincia sulla linguetta di una Fonte chiusa da sola; `aperta`: il trascinamento l'ha aperta
          presa = { x: e.clientX, mosso: false, chiude: false, id: e.pointerId, frazione: stato.frazione, chiusa: stato.chiusa, auto, aperta: false };
          divisore.setPointerCapture(e.pointerId); colonne.classList.add('is-trascinando');
        });
        divisore.addEventListener('pointermove', e => {
          if (!presa || presa.id !== e.pointerId) return;
          if (Math.abs(e.clientX - presa.x) > 3) presa.mosso = true;
          if (!presa.mosso) return;
          const b = colonne.getBoundingClientRect(), x = aDestra ? b.left + b.width - e.clientX : e.clientX - b.left;
          presa.chiude = x < b.width * SOGLIA;
          colonne.classList.toggle('sta-chiudendo', presa.chiude);
          if (!presa.chiude) { presa.aperta = true; apriDalDocente(); stato.frazione = x / b.width; applica(); }
        });
        const lascia = () => {
          if (!presa) return;
          const p = presa; presa = null;
          colonne.classList.remove('is-trascinando', 'sta-chiudendo');
          if (!p.mosso) { if (chiusa()) apriDalDocente(); else return; }   // clic: riapre la linguetta, sul divisore aperto non fa nulla
          /* 0074, giro 2, difetto 1: la Fonte era chiusa DA SOLA, la presa sulla linguetta è scivolata di qualche px
             senza mai aprirla e si è lasciata nel bordo: non è un gesto di chiusura del docente. Torna com'era, chiusa
             da sola, e niente si scrive (altrimenti `chiusa: true` la terrebbe chiusa anche sui materiali con passi). */
          else if (p.chiude && p.auto && !p.aperta) { applica(); return; }
          else if (p.chiude) { stato.chiusa = true; auto = false; if (!p.chiusa) stato.frazione = p.frazione; }   // chiudendo si riapre alla larghezza di prima, non a quella di passaggio
          else stato.frazione = limita(stato.frazione);
          applica(); salva();
        };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => divisore.addEventListener(n, lascia));
        divisore.addEventListener('keydown', e => {
          // la freccia verso la Fonte la stringe; chiusa, la riapre la freccia che si allontana dal suo bordo
          const stringe = aDestra ? 'ArrowRight' : 'ArrowLeft';
          if (e.key === 'Enter' || e.key === ' ') { if (chiusa()) apriDalDocente(); else stato.chiusa = true; }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (chiusa()) { if (e.key === stringe) return; apriDalDocente(); }
            else stato.frazione = limita(stato.frazione + (e.key === stringe ? -0.05 : 0.05));
          } else return;
          e.preventDefault(); applica(); salva();
        });
        applica();
        /* F1: la veste chiama a ogni scheda con l'id del materiale e il numero di prove che hanno trovato una
           pagina. Un materiale nuovo azzera la riapertura a mano del precedente.
           Giro 2, difetto 2: sotto i 900 px le colonne sono impilate e il CSS non nasconde una Fonte chiusa né
           mostra la linguetta: lì la Fonte non si chiude mai da sola (e quindi non diventa `inert`), mostra la
           sua frase al posto della pagina. La soglia è la stessa del CSS (`max-width: 900px`), letta con
           `matchMedia`; al cambio di larghezza si ricalcola sul materiale aperto. */
        const impilate = () => { try { return !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches); } catch (e) { return false; } };
        const ricalcola = () => { auto = !conFoto && senzaPassi && !stato.chiusa && !apertaQui && !impilate(); applica(); };
        if (aDestra) {
          seguiFonte = (id, passi) => {   // con la foto (`conFoto`) `ricalcola` non chiude mai
            if (id !== materiale) { materiale = id; apertaQui = false; }
            senzaPassi = !(passi > 0);
            ricalcola();
          };
          try {
            const larghezza = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;
            if (larghezza && typeof larghezza.addEventListener === 'function') {
              const suCambio = () => {
                if (!modal.isConnected) { larghezza.removeEventListener('change', suCambio); return; }   // il Banco è chiuso
                if (materiale !== undefined) ricalcola();
              };
              larghezza.addEventListener('change', suCambio);
            }
          } catch (e) { /* senza matchMedia: le colonne affiancate */ }
        }
      }
      const occorrenze = modal.querySelector('#mrv-occorrenze');
      if (occorrenze) occorrenze.onclick = () => {
        occurrenceSearch.open = !occurrenceSearch.open; renderOccurrences();
        if (occurrenceSearch.open) modal.querySelector('#mrv-occurrence-query')?.focus();
      };
      /* IL DIVISORE DELLE OCCORRENZE (0074, punto 10; F7, F8: solo con la veste — senza, il divisore non nasce e il
         pannello è quello di oggi). Sta fra il pannello e ciò che sta sotto e c'è solo a pannello aperto. Trascinato in
         basso il pannello cresce fino al 75% dell'area dei materiali (`.mrv-carte`: pannello, navigazione, scheda),
         non oltre; trascinato in alto (il puntatore sopra il punto della presa) e lasciato al 15% o meno si chiude come
         col bottone, e si riaprirà all'altezza di prima della presa, non a quella di passaggio. Verso il basso non si
         chiude mai, anche sotto il 15% (uno schermo alto lo apre già lì): il pannello segue il puntatore. ↓ allarga e ↑
         stringe di 5 punti, fino al 75%; chiude solo ↑, al 15% o meno. La prima volta l'altezza è
         quella di oggi (il contenuto, al più 60%); quella scelta resta a ogni riapertura finché il Banco è aperto, e
         non si salva. Il modello è il divisore della Fonte qui sopra: cattura del puntatore, 3 px prima che una presa
         diventi un trascinamento, `aria-valuenow` in percento. */
      const occDivisore = modal.querySelector('#mrv-occorrenze-divisore');
      const occArea = modal.querySelector('.mrv-carte'), occHost = modal.querySelector('#mrv-occurrences-host');
      if (occDivisore && occArea && occHost) {
        const MAX_OCC = 75, CHIUDE_OCC = 15, PASSO_OCC = 5;
        let sceltaOcc = null;   // l'altezza scelta, in percento dell'area; null = quella di oggi
        const rettangolo = el => { try { return el.getBoundingClientRect ? el.getBoundingClientRect() : null; } catch (e) { return null; } };
        const inPercento = (px, area) => px / area.height * 100;
        const altezzaOcc = () => {
          if (sceltaOcc != null) return sceltaOcc;
          const area = rettangolo(occArea), pannello = rettangolo(occHost);
          return area && pannello && area.height > 0 ? inPercento(pannello.height, area) : 60;   // senza misura: il tetto di oggi
        };
        const imposta = p => {
          sceltaOcc = p;
          occHost.classList.add('is-regolato'); occHost.style.setProperty('--mrv-occ-h', p.toFixed(2) + '%');
          occDivisore.setAttribute('aria-valuenow', String(Math.round(p)));
        };
        const ripristina = p => { if (p == null) { sceltaOcc = null; occHost.classList.remove('is-regolato'); } else imposta(p); };
        // come il bottone; il divisore sparisce, quindi il fuoco che era lì o nel pannello torna sul bottone
        const chiudiOcc = () => {
          const fuoco = document.activeElement, dentro = !!fuoco && (fuoco === occDivisore || occHost.contains(fuoco));
          occurrenceSearch.open = false; renderOccurrences();
          if (dentro && occorrenze) occorrenze.focus();
        };
        seguiOccorrenze = () => {
          occDivisore.hidden = !occurrenceSearch.open;
          if (occurrenceSearch.open) occDivisore.setAttribute('aria-valuenow', String(Math.round(altezzaOcc())));
        };
        let presaOcc = null;
        occDivisore.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          presaOcc = { y: e.clientY, mosso: false, chiude: false, id: e.pointerId, scelta: sceltaOcc };
          occDivisore.setPointerCapture(e.pointerId); occArea.classList.add('is-trascinando-occ');
        });
        occDivisore.addEventListener('pointermove', e => {
          if (!presaOcc || presaOcc.id !== e.pointerId) return;
          if (Math.abs(e.clientY - presaOcc.y) > 3) presaOcc.mosso = true;
          if (!presaOcc.mosso) return;
          const area = rettangolo(occArea);
          if (!area || !(area.height > 0)) return;
          const p = Math.min(Math.max(inPercento(e.clientY - area.top, area), 0), MAX_OCC);
          presaOcc.chiude = e.clientY < presaOcc.y && p <= CHIUDE_OCC;   // F7: chiude solo un gesto verso l'alto (D1)
          occHost.classList.toggle('sta-chiudendo', presaOcc.chiude);
          if (!presaOcc.chiude) imposta(p);
        });
        const lasciaOcc = () => {
          if (!presaOcc) return;
          const p = presaOcc; presaOcc = null;
          occArea.classList.remove('is-trascinando-occ'); occHost.classList.remove('sta-chiudendo');
          if (!p.mosso || !p.chiude) return;   // un clic non fa niente; lasciato sopra il 15% l'altezza è già quella
          ripristina(p.scelta); chiudiOcc();
        };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => occDivisore.addEventListener(n, lasciaOcc));
        occDivisore.addEventListener('keydown', e => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const giu = e.key === 'ArrowDown';
          const p = Math.min(Math.round(altezzaOcc()) + (giu ? PASSO_OCC : -PASSO_OCC), MAX_OCC);
          if (!giu && p <= CHIUDE_OCC) chiudiOcc(); else imposta(p);   // ↓ non chiude mai (D1)
        });
      }
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
      const db = currentDb();
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
      modal.querySelector('#mrv-progress-label').textContent = groups.decided.length + ' / ' + groups.all.length + ' ' + t('rv_dashboard_decisions', 'decise') +
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
      const piede = strato ? strato.piede() : '';
      if (piede) modal.querySelector('#mrv-next-step').textContent += ' ' + piede;
      return groups;
    }
    function issueTarget(issue) {
      const item = itemFor(issue, getReview());
      return referenceView(issue.target.kind === 'item' ? item?.title || item?.question || item?.text || t('rv_material', 'Materiale') :
        issue.target.kind === 'link' ? readable(issue.before, issue.target) : nodeLabel(issue.target.id), issue.target.kind === 'item' ? item : null).text;
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
    function close() { if (closed) return; closed = true; if (fonte) fonte.smonta(); if (veste) veste.smonta(); modal.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); if (reading && typeof options.onClose === 'function') options.onClose(); }
    function errorText(e) {
      return e && /^(persisted_revision_mismatch|applying_snapshot_mismatch)$/.test(e.code || e.message)
        ? t('rv_readback_failed', 'La copia salvata non coincide con le decisioni. La revisione resta in attesa.') : e.message;
    }
    // Packet 0026 (d): l'avanzamento del Giudice, lotto per lotto, su #mrv-status.
    function judgeProgress(p) {
      if (!p || closed) return;
      const count = Number.isFinite(p.done) && Number.isFinite(p.total) ? ' (' + p.done + '/' + p.total + ')' : '';
      const lot = Number.isFinite(p.lotto) && Number.isFinite(p.totale)
        ? ' ' + t('rv_judge_lot', 'Lotto {k} di {n}').replace('{k}', p.lotto).replace('{n}', p.totale) : '';
      status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.') + count + lot +
        (p.etichetta ? ' · ' + p.etichetta : '') +
        (p.modo === 'mirata' ? ' · ' + t('rv_judge_retry_failed_only', 'si ripetono solo i lotti non riusciti') + ' (' + p.daRifare + ')' : '');
    }
    function save() {
      status.textContent = t('rv_saving', 'Salvataggio…');
      pendingSave = R.writeManifest(vaultPath, manifest, reading ? reading.assertCurrent : undefined).then(() => {
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
        if (!reading) cache();
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
      if (veste) return veste.apri(itemId, field);   // 0073: «Rivedi questo campo» apre la scheda della veste
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

    // 0074, punto 10: con la veste, dopo ogni disegno del pannello il suo divisore (c'è solo a pannello aperto) e l'altezza
    function renderOccurrences() {
      disegnaOccorrenze();
      if (seguiOccorrenze) seguiOccorrenze();
    }
    function disegnaOccorrenze() {
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
        row.innerHTML = '<summary>' + (index + 1) + '. ' + esc(referenceView(item.title || item.question || item.text || t('rv_material', 'Materiale'), item).text) + '</summary>' + chips([{ target }]);
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
            // 0069, giro 15: sulla scheda le note dell'item col nome del blocco, pezzo per pezzo, senza spostare le evidenze
            const nota = s => fonteScheda ? referenceView(s, item).text : s;
            let cursor = 0;
            quote.innerHTML = foundField.ranges.map(([start, end]) => {
              const html = esc(nota(shown.slice(cursor, start))) + '<mark>' + esc(nota(shown.slice(start, end))) + '</mark>'; cursor = end; return html;
            }).join('') + esc(nota(shown.slice(cursor)));
          } else quote.textContent = referenceView(foundField.text, item).text;
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
    /* 0053 (Giacomo, 27/09): la causa tecnica del controllo non si mostra al
       docente — «un insegnante non saprebbe che cosa significa», e un blocco di
       testo in ogni materiale è solo sovraccarico. Ogni materiale ancora da
       rileggere ha un pallino; una legenda sola, in cima, dice che cosa vuol
       dire. La causa resta nel rapporto del giudice (pipeline.json), per
       l'assistenza, e `coverageFailure` la classifica ancora. */
    const SVG_APPROVATO = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg>';
    function pallinoRevisione() {
      return '<span class="mrv-pallino" data-coverage-pallino role="img" aria-label="' + esc(t('rv_review_needed', 'Revisione necessaria')) +
        '" title="' + esc(t('rv_review_needed_help', 'Il controllo automatico non ha verificato questo materiale: rileggilo con la fonte.')) + '"></span>';
    }
    function legendaRevisione() {
      return '<p class="mrv-coverage-legenda" data-coverage-legenda>' +
        '<span class="mrv-legenda-voce"><span class="mrv-pallino" aria-hidden="true"></span>' + esc(t('rv_review_needed', 'Revisione necessaria')) + '</span>' +
        '<span class="mrv-legenda-voce"><span class="mrv-teacher-approved" aria-hidden="true">' + SVG_APPROVATO + '</span>' + esc(t('rv_coverage_legend_approved', 'Approvato da te')) + '</span></p>';
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
        (onlyExcluded ? '' : legendaRevisione()) +
        (stalled ? '<p id="mrv-no-progress" role="status">' + esc(t('rv_coverage_stalled', 'L’ultimo tentativo non ha completato nuovi controlli. Esamina le frasi qui sotto: riprovare può recuperare una risposta mancante, ma non aggiunge prove alla fonte.')) + '</p>' : '') +
        // 0053, Giacomo 27/09: «Questo numero conta i materiali…» esce — il «non sono errori» lo dice la legenda.
        // `rv_coverage_version` qui sotto esce col 0047, quando il contatore misurerà il lavoro del docente.
        '<p>' + esc(t('rv_coverage_version', 'Le frasi segnalate appartengono alle bozze originali controllate. Le correzioni scelte qui vengono applicate quando completi la revisione: non sono valutate dal pulsante di ricontrollo e non abbassano questo conteggio.')) + '</p>';
      // Show the exact archived source text, never generated node descriptions
      // as evidence for an uncertain claim. Unknown relevance stays unknown.
      const sources = document.createElement('details'); sources.className = 'mrv-coverage-sources';
      sources.innerHTML = '<summary>' + esc(fonteScheda ? t('rv_scheda_coverage_sources', 'Consulta il testo della scheda usato dal controllo') : t('rv_coverage_sources', 'Consulta il testo delle fonti usato dal controllo')) + '</summary>';
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
        uncertain: fonteScheda ? t('rv_scheda_uncertain', 'Riscontro nella scheda non confermato') : t('rv_coverage_uncertain', 'Riscontro nella fonte non confermato'),
        missing: t('rv_coverage_missing', 'Il modello non ha restituito un esito'),
        unverified: t('rv_coverage_unverified', 'Esito non validato')
      };
      rows.forEach((row, index) => {
        const preview = approvazioni.previews.get(row.id) || core().previewItem(r, { items: manifest.review.final.items }, row.id, { sources: r.sources });
        const excluded = preview.ok && !preview.db.items.some(item => String(item.id) === row.id);
        const item = row.item, issue = { target: { kind: 'item', id: row.id } };
        const detail = document.createElement('details'); detail.className = 'mrv-coverage-material'; detail.setAttribute('data-coverage-item', row.id);
        const approvato = approvazioni.approvati.has(row.id);
        // 0053: il pallino accanto al numero finché il materiale è da rileggere; niente testo della causa nella scheda.
        // La spunta dell'approvazione prende lo stesso posto del pallino (Giacomo, 02/10): lo stato si legge in una colonna sola.
        detail.innerHTML = '<summary>' + (!approvato && !excluded ? pallinoRevisione() + ' ' : '') +
          (approvato ? '<span class="mrv-teacher-approved" data-teacher-approved role="img" tabindex="0" aria-label="' + esc(t('rv_teacher_approved', 'Approvato dal docente')) + '" title="' + esc(t('rv_teacher_approved_help', 'Hai approvato questa versione. Il controllo automatico resta distinto.')) + '">' + SVG_APPROVATO + '<span class="mrv-approval-help">' + esc(t('rv_teacher_approved_help', 'Hai approvato questa versione. Il controllo automatico resta distinto.')) + '</span></span> ' : '') +
          (index + 1) + '. ' + esc(issueTarget(issue)) +
          (excluded ? ' · ' + esc(t('rv_material_excluded', 'Escluso')) : '') + '</summary>' + chips([issue]) +
          (row.claims.length ? '<ul class="mrv-coverage-claims">' + row.claims.map(claim => '<li><strong>' + esc(fieldName(claim.field, item)) + ' · ' + esc(labels[claim.status]) +
            '</strong><p class="mrv-coverage-text">' + esc(referenceView(claim.text, item).text) + '</p></li>').join('') + '</ul>' : '');
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
              vedi.textContent = fonteScheda ? t('rv_scheda_show', 'Mostra i blocchi della scheda citati') : t('rv_source_show', 'Mostra le fonti citate');
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
    /* La traccia e la storia del giudice (solo G1), in elementi pronti: il Banco di prima li mette in «Copertura del
       controllo», la veste (0075, Q2) nella sezione «Il controllo» in fondo alla barra. */
    function tracciaDelGiudice(r) {
      if (isFinal || !(r.initial.report?.modelliGiro || r.initial.report?.contratto === 'mappai-giudice@2' ||
          r.initial.previousReports?.some(report => report?.modelliGiro || report?.contratto === 'mappai-giudice@2'))) return [];
      const out = [];
      const traceLine = report => {
        const p = document.createElement('p'); p.className = 'text-sm break-words';
        const run = report?.modelliGiro, calls = (run?.chiamate || []).filter(c => c.phase === 'giudice');
        const models = Array.from(new Set(calls.map(c => c.provider + ' · ' + c.requestedModel + ' → ' +
          (c.actualModel || t('rv_model_unknown_actual', 'modello effettivo non comunicato')))));
        const requested = run?.profilo;
        const model = models.join('; ') || (requested?.modelli?.giudice ? requested.provider + ' · ' + requested.modelli.giudice + ' · ' +
          t('rv_model_no_response', 'nessuna risposta del modello registrata') : t('rv_model_unknown', 'Modello non registrato'));
        const date = report?.quando && new Date(report.quando);
        const coverage = ['saltato', 'errore', 'in-corso'].includes(report?.stato) ? null : report?.copertura;
        p.textContent = (date && !Number.isNaN(date.getTime()) ? date.toLocaleString() + ' · ' : '') + model +
          (coverage ? ' · ' + (report.contratto === 'mappai-giudice@2' ? t('rv_examined_descriptions', 'Descrizioni esaminate:') : t('rv_checked_nodes', 'Nodi controllati:')) + ' ' + (coverage.nodiEsaminati || []).length +
            ' · ' + t('rv_checked_links', 'Collegamenti controllati:') + ' ' + (coverage.linkEsaminati || []).length +
            ' · ' + t('rv_remaining_checks', 'Parti ancora da controllare:') + ' ' +
              ((coverage.nodiSaltati || []).length + (coverage.linkSaltati || []).length) : '') +
          (report?.motivoSkip ? ' · ' + report.motivoSkip : '');
        return p;
      };
      const result = traceLine(r.initial.report); result.id = 'mrv-judge-model-result';
      out.push(result);
      const sourceView = judgeEvidenceView(r.initial.report, r.baseSnapshot.nodes);
      if (sourceView) out.push(sourceView);
      if (r.initial.previousReports?.length) {
        const history = document.createElement('details'); history.id = 'mrv-judge-history';
        history.innerHTML = '<summary>' + esc(t('rv_previous_checks', 'Controlli precedenti')) + ' (' + r.initial.previousReports.length + ')</summary>';
        r.initial.previousReports.forEach(report => {
          history.appendChild(traceLine(report));
          const evidence = judgeEvidenceView(report, r.baseSnapshot.nodes); if (evidence) history.appendChild(evidence);
        });
        out.push(history);
      }
      return out;
    }
    /* «Apri la bozza locale conservata» / «…copia della cartella conservata» (solo G1): il Banco di prima li mette in
       fondo alla scheda, la veste (0075, Q2) nella sezione «Il controllo». */
    function bozzeConservate() {
      if (isFinal || reading) return [];
      return ['Local', 'Disk'].map(kind => {
        const draft = state()['_review' + kind + 'Draft'];
        if (!draft || draft.vaultPath !== vaultPath) return null;
        const recover = document.createElement('button'); recover.type = 'button'; recover.className = 'pm-btn-cancel';
        recover.textContent = kind === 'Local' ? t('rv_recover_local', 'Apri la bozza locale conservata') : t('rv_recover_disk', 'Apri la copia della cartella conservata');
        recover.onclick = async () => { applySnapshot(state().db, draft.db); cache(); close(); await R.requireApproved(); };
        return recover;
      }).filter(Boolean);
    }
    /* «Nuovo controllo con i modelli del Setup» (solo G1, revisione modificabile), col suo riquadro d'anteprima: il
       Banco di prima lo mette in «Copertura del controllo», la veste (0075, Q2) nella sezione «Il controllo». */
    function nuovoControllo() {
      const newCheck = document.createElement('button'); newCheck.type = 'button'; newCheck.id = 'mrv-setup-judge';
      newCheck.className = 'pm-btn-cancel mt-3 whitespace-normal';
      newCheck.textContent = t('rv_setup_judge', 'Nuovo controllo con i modelli del Setup');
      const preview = document.createElement('div'); preview.id = 'mrv-setup-preview'; preview.hidden = true;
      preview.className = 'mrv-summary text-sm'; preview.setAttribute('role', 'group');
      preview.setAttribute('aria-label', t('rv_setup_preview', 'Anteprima del nuovo controllo'));
      newCheck.onclick = async () => {
        if (busy || invalidEditors.size) return;
        try {
          await pendingSave; if (saveError) throw saveError;
          if (closed || busy) return;
          const prepared = R.prepareSetupJudge(vaultPath, manifest);
          preview.replaceChildren();
          const model = document.createElement('p'); model.id = 'mrv-setup-model'; model.className = 'font-bold break-words';
          model.textContent = t('rv_setup_model', 'Giudice del nuovo controllo:') + ' ' + prepared.provider + ' · ' + prepared.model;
          const saved = manifest.config?.modelli;
          const previous = document.createElement('p'); previous.className = 'break-words';
          previous.textContent = saved?.modelli?.giudice
            ? t('rv_saved_judge', '«Riprova controllo automatico» conserva:') + ' ' + saved.provider + ' · ' + saved.modelli.giudice
            : t('rv_saved_judge_legacy', 'Questo progetto non ha assegnazioni per fase salvate.');
          const scope = document.createElement('p');
          scope.textContent = t('rv_setup_scope', 'Controlla la mappa e le fonti salvate, prima delle correzioni ancora da confermare. Le tue decisioni e i rapporti precedenti restano conservati. Non genera nuovi materiali.');
          const frozen = document.createElement('p');
          frozen.textContent = t('rv_setup_frozen', 'Questo controllo userà il modello mostrato qui. Per leggere nuove scelte del Setup, annulla e riapri l’anteprima.');
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'mrv-setup-cancel'; cancel.className = 'pm-btn-cancel';
          cancel.textContent = t('cancel', 'Annulla');
          cancel.onclick = () => { if (busy) return; preview.hidden = true; preview.replaceChildren(); newCheck.hidden = false; newCheck.focus(); };
          const start = document.createElement('button'); start.type = 'button'; start.id = 'mrv-setup-start'; start.className = 'pm-btn-primary';
          start.textContent = t('rv_setup_start', 'Avvia controllo');
          start.onclick = async () => {
            if (busy || invalidEditors.size || closed || !start.isConnected) return;
            freeze(true);
            status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.');
            try {
              await pendingSave; if (saveError) throw saveError;
              await prepared.run({ onProgress: judgeProgress });
              const eraConfermato = manualConfirmed; manualConfirmed = false;
              freeze(false); render(); modal.querySelector('#mrv-coverage-options').setAttribute('open', '');
              modal.querySelector('#mrv-title').focus();
              // 0075: con la veste la spunta tolta è quella della SUA casella, nel piede (come dopo «Riprova»)
              const tolta = veste ? veste.spuntaTolta() : '';
              status.textContent = checkMessage() + ' ' + t('rv_saved', 'Decisioni salvate') +
                (eraConfermato ? ' · ' + t('rv_manual_reset', 'Le tue decisioni restano; va rimessa la spunta «completo io il controllo», perché il controllo è cambiato.') : '') +
                (tolta ? ' · ' + tolta : '');
            } catch (e) {
              status.textContent = errorText(e);
              preview.hidden = true; newCheck.hidden = false;
            } finally { if (busy) freeze(false); }
          };
          [model, previous, scope, frozen, cancel, start].forEach(el => preview.appendChild(el));
          preview.hidden = false; newCheck.hidden = true; cancel.focus();
        } catch (e) { status.textContent = errorText(e); }
      };
      return [newCheck, preview];
    }
    function renderReadingSource(r, editable) {
      const preview = core().preview(r, currentDb(), { sources: r.sources });
      const rows = (preview.ok ? preview.db : currentDb()).items.slice().sort((x, y) => x.order - y.order);
      const section = document.createElement('section'); section.setAttribute('data-reading-source', '');
      section.innerHTML = '<h3>' + esc(t('rv_reading_recomposed', 'Testo ricomposto da verificare')) + '</h3>';
      rows.forEach((item, i) => {
        const block = document.createElement('div'); block.setAttribute('data-reading-paragraph', item.id);
        const paragraph = { id: item.id, type: item.blockType, text: item.text, emphasis: item.emphasis || [] };
        try {
          if (!window.MappAIPercorsoLetturaView?.paragraphHtml) throw new Error('missing_renderer');
          block.innerHTML = window.MappAIPercorsoLetturaView.paragraphHtml(paragraph);
        } catch (_) {
          block.innerHTML = '<p class="whitespace-pre-wrap">' + esc(item.text) + '</p><p role="alert">' +
            esc(t('rv_reading_structure', 'Verifica struttura ed enfasi nell’editor della fonte prima di confermare.')) + '</p>';
        }
        if (editable) {
          const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'pm-btn-cancel';
          edit.setAttribute('data-reading-edit', item.id);
          edit.textContent = t('rv_reading_edit', 'Correggi il paragrafo') + ' ' + (i + 1);
          edit.onclick = async () => {
            if (busy || invalidEditors.size) return;
            await pendingSave; if (saveError || closed) return;
            try {
              reading.assertCurrent();
              const target = { kind: 'item', id: item.id, field: 'text' };
              const existing = getReview().initial.issues.find(issue => issue.origin === 'teacher' && issue.target.kind === 'item' && issue.target.id === item.id && issue.target.field === 'text');
              const next = existing ? getReview() : core().addIssue(getReview(), { target, origin: 'teacher', blocking: true,
                problem: t('rv_reading_edit', 'Correggi il paragrafo') + ' ' + (i + 1) }, currentDb());
              invalidateManualCheck(); setReview(next);
              activeIssueId = existing?.id || next.initial.issues[next.initial.issues.length - 1].id;
              activeFilter = 'all'; search = ''; modal.querySelector('#mrv-search').value = '';
              Object.keys(facets).forEach(key => { facets[key] = ''; });
              await save(); if (!saveError && !closed) { render(); modal.querySelector('#mrv-current-title')?.focus(); }
            } catch (e) { status.textContent = errorText(e); }
          };
          block.appendChild(edit);
        }
        section.appendChild(block);
      });
      if (!fonte) {
        const original = document.createElement('details'); original.open = true;
        original.innerHTML = '<summary>' + esc(t('rv_original_source', 'Fonte originale')) + '</summary>';
        const pages = window.MappAIGroundingCore?.sourcePages(r.sources) || [];
        pages.forEach(page => { const p = document.createElement('p'); p.className = 'whitespace-pre-wrap'; p.textContent = page.text; original.appendChild(p); });
        content.appendChild(original);
      }
      content.appendChild(section);
    }
    function render() {
      if (veste) return veste.render();   // 0073: barra, scheda e piede sono della veste
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
          (group.length > 1 ? ' · ' + group.length + ' ' + esc(t('rv_dashboard_targets', 'contenuti')) : '') + '</span><strong>' + esc(issueTarget(issue)) + '</strong><span class="mrv-queue-problem">' + esc(issue.problem || fieldName(issue.target.field)) + '</span><span class="mrv-queue-state" data-pending="' + pending + '">' + esc(conflict ? t('rv_decision_conflict', 'Scelte in conflitto') : pending ? statoDaDecidere(group, outcomes.pending) : outcomes[core().decisionOutcome(issue, r.initial.decisions[issue.id])]) + '</span>';
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
      modal.querySelector('#mrv-coverage-label').textContent = (r.initial.checkStatus === 'completed' ? t('rv_dashboard_complete', 'Completa') : t('rv_dashboard_partial', 'Parziale')) +
        (strato ? strato.suffissoCopertura() : '');
      modal.querySelector('#mrv-coverage-details').replaceChildren();
      tracciaDelGiudice(r).forEach(el => modal.querySelector('#mrv-coverage-details').appendChild(el));
      // il blocco «Affermazioni delle descrizioni», in sola lettura (packet 0042)
      const affermazioni = strato ? strato.blocco() : null;
      if (affermazioni) modal.querySelector('#mrv-coverage-details').appendChild(affermazioni);
      const info = document.createElement('p');
      info.className = 'mrv-info';
      const dbNow = currentDb();
      info.textContent = approved ? (core().gate(r, dbNow, r.sources).allowed ? t('rv_approved', 'Le decisioni sono state salvate. Questi contenuti sono approvati.') : t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.')) :
        !r.initial.issues.length ? (r.initial.checkStatus === 'completed' ? t('rv_none', 'Nessuna proposta di correzione. Puoi leggere i contenuti e continuare.') : checkMessage()) :
        groups.pending.length ? t('rv_dashboard_decide_help', 'Confronta il testo e la proposta, poi scegli. Dopo una decisione passerai alla segnalazione successiva.') :
        t('rv_decisions_complete', 'Tutte le segnalazioni hanno una decisione. Verifica la copertura del controllo prima di continuare.');
      content.appendChild(info);
      if (readingSource) renderReadingSource(r, editable);
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
        if (!isFinal && report.contratto === 'mappai-giudice@2' && (coverage.nodiSaltati || []).length) {
          const list = document.createElement('ul'); list.setAttribute('data-judge-unchecked-nodes', '');
          const labels = new Map((r.baseSnapshot.nodes || []).map(n => [n.id, n.label || n.id]));
          coverage.nodiSaltati.forEach(node => {
            const row = document.createElement('li');
            row.textContent = (labels.get(node.id) || node.label || node.id) + ': ' +
              t('rv_description_unchecked', 'Descrizione da controllare') + ' · ' + (node.motivo || t('rv_link_unchecked', 'Controllo non completato.'));
            list.appendChild(row);
          });
          box.appendChild(list);
        }
        if (!isFinal && (coverage.linkSaltati || []).length) {
          const list = document.createElement('ul');
          const labels = new Map((r.baseSnapshot.nodes || []).map(n => [n.id, n.label || n.id]));
          coverage.linkSaltati.forEach(link => {
            const row = document.createElement('li');
            const uncertain = report.contratto === 'mappai-giudice@2' && (report.esitiLink || []).some(result =>
              result.source === link.source && result.target === link.target && result.rel === link.rel && result.esito === 'non_verificabile');
            row.textContent = (labels.get(link.source) || link.source) + ' → ' + (link.rel || '') + ' → ' +
              (labels.get(link.target) || link.target) + ': ' + (report.contratto === 'mappai-giudice@2' ?
                (uncertain ? t('rv_link_insufficient', 'Prove insufficienti') : t('rv_link_technical', 'Risposta del controllo non utilizzabile')) + ' · ' : '') +
              (link.motivo || t('rv_link_unchecked', 'Controllo non completato.'));
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
            chips([group[i]]) + esc(referenceView(x, group[i].target.kind === 'item' ? itemFor(group[i], r) : null).text) + '</li>').join('') + '</ul></details>' : '') +
          '<div data-conflict></div><div class="mrv-comparison"><div class="mrv-before"><p class="mrv-field-label">' + esc(t('rv_before', 'Testo attuale')) + '</p><p class="whitespace-pre-wrap mb-3">' + highlighted[0] + '</p></div>' +
          (issue.hasProposal ? '<div class="mrv-proposal"><p class="mrv-field-label">' + esc(t('rv_proposal', 'Proposta')) + '</p><p class="whitespace-pre-wrap mb-3">' + highlighted[1] + '</p></div></div>' +
            (compact ? '<details data-full-change class="mb-3"><summary>' + esc(t('rv_full_change', 'Leggi il testo completo prima e dopo')) + '</summary><p class="font-bold">' + esc(t('rv_before', 'Testo attuale')) + '</p><p class="whitespace-pre-wrap">' + esc(displayValue(issue.before, issue.target, item)) + '</p><p class="font-bold">' + esc(t('rv_proposal', 'Proposta')) + '</p><p class="whitespace-pre-wrap">' + esc(displayValue(issue.after, issue.target, item)) + '</p></details>' : '') +
            (issue.citationAdditions?.length ? '<p data-added-sources class="mb-3">' + esc(t('rv_added_sources', 'La proposta collega anche le fonti originali dei nuovi richiami.')) + '</p>' : '') :
            '</div><p class="mb-3" data-no-proposal>' + esc(issue.origin === 'teacher' ? t('rv_coverage_teacher_edit', 'Hai aperto questa scheda per rivedere il materiale. Puoi modificarlo o mantenere il testo dopo averlo verificato.') : t('rv_no_proposal', 'Il giudice segnala un problema, ma non propone una correzione pronta. Puoi modificare il contenuto oppure mantenerlo senza modifiche.')) + '</p>') +
          (references.length ? '<details class="mb-3" data-references><summary>' + esc(fonteScheda ? t('rv_scheda_references', 'Blocchi della scheda richiamati nel testo') : t('rv_text_references', 'Fonti richiamate nel testo')) + '</summary>' + references.map(ref => '<p class="mt-2"><strong>' + esc(ref.label + ' — ' + (ref.source ? ref.source.title + (ref.source.page ? ' · ' + t('rv_page', 'Pagina') + ' ' + ref.source.page : '') : referenceOptions.unknownLabel)) + '</strong></p>' + (ref.source ? '<p class="whitespace-pre-wrap">' + esc(ref.source.text) + '</p>' : '')).join('') + '</details>' : '') +
          (issue.origin === 'teacher' && !evidenceRows(issue.evidence).length ? '' : evidencePreview(issue, r, value => referenceView(value, item).text) + '<details class="mb-3"><summary>' + esc(t('rv_evidence', 'Fonte e motivo della segnalazione')) + '</summary>' + evidenceHtml(issue, r, value => referenceView(value, item).text) + '</details>') +
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
            label.textContent = conflict ? t('rv_decision_conflict', 'Scelte in conflitto') : pending ? statoDaDecidere(group, outcomes.pending) : choiceLabel.textContent;
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
                  const input = document.createElement('textarea'), refs = referenceView(typeof entry === 'string' ? entry : '', object || item); input.rows = 2; input.className = 'w-full border rounded p-2'; input.value = refs.text;
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
            } else { input = document.createElement('textarea'); input.rows = 4; refs = referenceView(typeof value === 'string' ? value : '', object || item); input.value = refs.text;
              // 0069, giro 16: sulla scheda i richiami sono nomi, e un nome corretto a mano non si ricollega: lo si dice.
              // Giro 17 (Giacomo): quella frase in arancione — #b45309, l'ambra di `--ui-mod` (tema chiaro, mappai-ui.css) e amber-700,
              // la stessa famiglia del pallino «Revisione necessaria» (#d97706, che sul bianco della card fa 3,19:1); questo fa 5,02:1
              if (refs.mapping.length || refs.note?.length) { const hint = document.createElement('p'); hint.className = 'text-sm'; hint.textContent = fonteScheda ? t('rv_scheda_edit_help', 'Non modificare i nomi fra parentesi quadre: sono i richiami alla scheda.') : t('rv_reference_edit_help', 'I richiami alle fonti restano collegati quando modifichi il testo.'); if (fonteScheda) hint.style.color = '#b45309'; label.appendChild(hint); }
            }
            let avvisoRichiami = '';
            function avvisaRichiami(valore) {
              // 0069, giro 16: un avviso, non un blocco — nella riga di stato, tolto appena il nome torna giusto
              const rotti = fonteScheda && refs && DFc && typeof DFc.richiamiRotti === 'function' ? DFc.richiamiRotti(valore, { prima: typeof value === 'string' ? value : '', etichette: (refs.mapping || []).map(m => m.label).concat((refs.note || []).map(n => n.label)) }) : [];
              const avviso = rotti.length ? t('rv_scheda_richiamo_rotto', '{x} non è più un richiamo alla scheda: arriverà all’allievo come testo. Rimetti il nome com’era.').replace('{x}', rotti.join(', ')) : '';
              if (avviso === avvisoRichiami && (!avviso || status.textContent.includes(avviso))) return;
              const resto = avvisoRichiami ? status.textContent.split(avvisoRichiami).join('').trim() : status.textContent;
              status.textContent = [resto, avviso].filter(Boolean).join(' ');
              avvisoRichiami = avviso;
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
              const nuovo = number ? Number(input.value) : refs ? restoreReferences(input.value, refs) : input.value;
              update(nuovo);
              if (refs && fonteScheda) avvisaRichiami(nuovo);
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
      if (!isFinal && !reading && editable) {
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
      bozzeConservate().forEach(b => content.appendChild(b));
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
        /* 0067 (toppa in attesa dello 0069, ADR 0016): per un dossier da immagine la
           fonte della revisione nasce vuota, quindi il controllo automatico non ha un
           testo con cui confrontare. Si dice perché la spunta compare. */
        /* 0069: quando la scheda È la fonte, il controllo un testo ce l'ha — la frase mentirebbe */
        if (manifest && manifest.config && manifest.config.dossier && !fonteScheda) {
          const perche = document.createElement('p'); perche.className = 'text-sm'; perche.id = 'mrv-manual-immagine';
          perche.textContent = t('rv_manual_immagine', 'La fonte di questo dossier è un\'immagine: il controllo automatico non ha un testo con cui confrontare la scheda, quindi resta parziale. La verifica la fai tu, rileggendo la scheda e i materiali.');
          manual.appendChild(perche);
        }
        const manualOption = document.createElement('details'); manualOption.id = 'mrv-manual-option'; manualOption.className = 'mt-3 text-sm';
        manualOption.innerHTML = '<summary>' + esc(t('rv_manual_option', 'Scelgo di completare io il controllo')) + '</summary>';
        const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = 'mrv-manual-confirm'; input.checked = manualConfirmed;
        label.className = 'block mt-2';
        input.onchange = () => { manualConfirmed = input.checked; proceed.hidden = !manualConfirmed && !statoApprovazioni(getReview()).tutti; updateFilters(); };
        label.appendChild(input); label.appendChild(document.createTextNode(' ' + (readingSource ? t('rv_reading_confirm', 'Ho confrontato tutto il testo con l’originale e confermo parole, ordine e struttura.') : t('rv_manual_confirm', 'Ho verificato personalmente anche le parti non coperte dal controllo automatico e approvo i contenuti.')))); manualOption.appendChild(label);
        if (!reading || typeof reading.options.retry === 'function' && isFinal) {
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
              if (reading) await retryReading(vaultPath, manifest, reading, judgeProgress);
              else if (isFinal) await R.retryMaterialJudge(vaultPath, manifest, { onProgress: p => {
                status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.') + ' (' + p.done + '/' + p.total + ')' +
                  (p.reused ? ' · ' + p.reused + ' ' + t('rv_context_reused', 'controlli riutilizzati') : '');
              } });
              else await R.retryJudge(vaultPath, manifest, { onProgress: judgeProgress });
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
      if (!isFinal && !reading && editable) nuovoControllo().forEach(el => manual.appendChild(el));
      const resume = hasResume();
      proceed.textContent = approved && !resume ? t('rv_close', 'Chiudi') : approved ? t('rv_resume', 'Continua dai contenuti approvati') :
        isFinal ? t('rv_finalize', 'Salva le decisioni e completa i materiali') : t('rv_continue', 'Salva le decisioni e continua');
      if (fonte) {
        const attiva = r.initial.issues.find(i => i.id === activeIssueId);
        if (readingSource && !evidenceRows(attiva?.evidence).length) {
          const first = fonte.pagine()[0];
          if (first) fonte.mostra([{ docId: first.docId, title: first.title, page: first.page, text: first.text }]);
        }
        else if (attiva) fonte.mostra(evidenceRows(attiva.evidence));
        /* Accanto alla fonte viene prima la scheda che la fonte sta mostrando: il
           riquadro dei materiali rimasti, spesso lungo e aperto, va dopo. */
        const rimasti = content.querySelector('#mrv-material-coverage');
        if (rimasti && attiva) content.appendChild(rimasti);
      }
      if (issuePrima && issuePrima === activeIssueId && scrollPrima) content.scrollTop = scrollPrima;
    }
    if (vesteAccesa) {
      /* La veste usa ciò che R.open ha già (stato, salvataggio, richiami, etichette): non scrive su disco
         da sé, e la revisione si cambia solo coi core (0073 §2). */
      try {
        veste = window.MappAIBancoVeste.monta({ document, modal, t, core: core(), bancoCore: window.MappAIBancoCore,
          contesto: window.MappAIReviewContext, confronto: window.MappAIConfrontoCore, dossierFonte: DFc, fonteScheda, fonte,
          finestra: window, validatore: window.MappAIMaterialReview,
          /* 0075: il regime. In G1 la veste scrive con `regime: 'g1'` sui bersagli della mappa (`db`, la mappa viva) e
             riceve lo strato delle affermazioni (0042, 0041), i pezzi della sezione «Il controllo» (Q2) e la fonte
             unica dei verbi per i suggerimenti dei collegamenti (regola 12) */
          regime: isFinal ? 'g2' : 'g1', db: () => state().db, strato,
          controllo: { traccia: () => tracciaDelGiudice(getReview()), bozze: () => bozzeConservate(),
            nuovo: () => !isFinal && getReview().initial.status === 'awaiting_review' ? nuovoControllo() : [] },
          relazioni: window.MappAIRelations, lingua: /^en/.test(window.currentLanguage || '') ? 'en' : 'it',
          // 0075, giro 2 (D4): le parole di un collegamento passano per l'editor della mappa (packet 0022), non per un secondo
          linkEditor: window.MappAILinkEditorCore,
          // le righe del rapporto senza esito (frasi non verificate, materiali assenti), come le legge `render`; la veste le tiene per rapporto
          residuiDelRapporto: () => getReview().initial.checkStatus === 'completed' || !window.MappAIReviewContext ? []
            : window.MappAIReviewContext.incompleteMaterials(getReview().initial.report || {}, getReview().baseSnapshot.items),
          getReview, setReview, items: () => (isFinal ? manifest.review.final.items : []), save, attendi: () => pendingSave,
          stato: () => ({ busy, committing, closed, saveError }), status, proceed, checkMessage,
          referenceView, restoreReferences, readable, displayValue, fieldName, canonicalFields, improntaTesto,
          // in G1 (0075) la riga dice se è un nodo o un collegamento: le macroaree vengono dai suoi estremi
          areeDi: (id, riga) => areaRows(contextFor(isFinal ? { target: { kind: 'item', id: String(id) } }
            : riga && riga.source != null ? { target: { kind: 'link', source: riga.source, target: riga.target } } : { target: { kind: 'node', id: String(id) } })),
          // 0074, F1: quante prove della scheda hanno trovato una pagina; il divisore apre o chiude la Fonte
          passiNellaFonte: (id, passi) => { if (seguiFonte) seguiFonte(id, passi); },
          testoChiusura: () => {
            const approved = getReview().initial.status === 'approved', resume = hasResume();
            return approved && !resume ? t('rv_close', 'Chiudi') : approved ? t('rv_resume', 'Continua dai contenuti approvati')
              : isFinal ? t('rv_finalize', 'Salva le decisioni e completa i materiali')
                // 0075, B.1: in G1 «…e continua» quando c'è da continuare, «…e chiudi» sulla strada «solo mappa»
                : resume ? t('rv_continue', 'Salva le decisioni e continua') : t('rv_veste_salva_chiudi', 'Salva le decisioni e chiudi');
          },
          mac: (() => { try { const n = typeof navigator !== 'undefined' ? navigator : null; return /mac|iphone|ipad/i.test(n ? ((n.userAgentData && n.userAgentData.platform) || n.platform || '') : ''); } catch (e) { return false; } })(),
          fieldSizing: (() => { try { return !!(window.CSS && window.CSS.supports && window.CSS.supports('field-sizing', 'content')); } catch (e) { return false; } })(),
          // «Riprova il controllo automatico dei residui», come nel modale di prima; la veste azzera la pila (R2)
          riprova: async () => {
            if (busy || closed) return false;
            freeze(true);
            status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.');
            try {
              await pendingSave; if (saveError) throw saveError;
              // 0075: in G1 «Riprova il controllo automatico» è quello della mappa (packet 0026, lotto per lotto)
              if (reading) await retryReading(vaultPath, manifest, reading, judgeProgress);
              else if (!isFinal) await R.retryJudge(vaultPath, manifest, { onProgress: judgeProgress });
              else await R.retryMaterialJudge(vaultPath, manifest, { onProgress: p => {
                status.textContent = t('rv_checking', 'Controllo in corso… Le bozze e le decisioni sono conservate.') + ' (' + p.done + '/' + p.total + ')' +
                  (p.reused ? ' · ' + p.reused + ' ' + t('rv_context_reused', 'controlli riutilizzati') : '');
              } });
              freeze(false); render(); modal.querySelector('#mrv-title').focus();
              // 0073, sesto giro, punto 1: la spunta della casella (R10) tolta dal controllo nuovo si dice, come qui sopra,
              // con la frase della veste, che nomina la sua casella (settimo giro, punto 2)
              const tolta = veste ? veste.spuntaTolta() : '';
              status.textContent = checkMessage() + ' ' + t('rv_saved', 'Decisioni salvate') + (tolta ? ' · ' + tolta : '');
              return true;
            } catch (e) { status.textContent = errorText(e); return false; }
            finally { if (busy) freeze(false); }
          } });
      } catch (e) { veste = null; console.warn('[Revisione] veste del Banco non disponibile:', e); }
    }
    render();
    /* B14 (0088): «Salva e continua più tardi» è `chiudiPiuTardi()`, che dice se la finestra si è chiusa davvero;
       il bottone (ed ESC, che lo preme) chiama poi `options.dopoChiusura` SOLO a chiusura avvenuta — la pipeline
       la passa alla G2 di un giro partito da CREA per uscire da CREA e aprire ELABORA. «Continua» non la chiama:
       lì è la continuazione a sapere da dove viene. Il clic di B10 chiama `chiudiPiuTardi()` e non `dopoChiusura`. */
    let chiudiPiuTardi = async () => { if (busy || invalidEditors.size) { status.textContent = t('rv_edit_draft', 'Modifica non salvata. Salva oppure annulla prima di continuare.'); return false; } await pendingSave; if (!saveError && !busy) close(); return closed; };
    const dopoChiusura = () => { if (typeof options.dopoChiusura !== 'function') return; try { options.dopoChiusura(); } catch (e) { console.warn('[Revisione] dopoChiusura:', e && e.message); } };
    modal.querySelector('#mrv-later').onclick = async () => { if (await chiudiPiuTardi()) dopoChiusura(); };
    function completionError(error) {
      status.textContent = errorText(error);
      if (reading) {
        let notice = modal.querySelector('#mrv-reading-completion-error');
        if (!notice) { notice = document.createElement('p'); notice.id = 'mrv-reading-completion-error'; notice.setAttribute('role', 'alert'); proceed.parentNode.insertBefore(notice, proceed); }
        notice.textContent = errorText(error);
      }
    }
    proceed.onclick = async () => {
      if (closed || busy || committing || invalidEditors.size || proceed.hidden) return;
      freeze(true);
      try {
        await pendingSave; if (saveError) throw saveError;
        const resume = hasResume();
        if (getReview().initial.status !== 'approved' || resume) await approve(manualConfirmed || statoApprovazioni(getReview()).tutti);
        close(); busy = false;
        /* 0090 (gate, 12/10): `resume` è letto PRIMA di approvare; per una G2 riaperta senza continuazione
           (chip, «Rivedi contenuti», `runApprovedMaterials`) diventa vero solo DOPO (`final.stage = 'approved'`):
           si richiede, altrimenti il primo clic approvava e chiudeva senza generare i materiali */
        if (options.onContinue) await options.onContinue(manifest);
        else if (!reading && (resume || hasResume()) && window.MappAIPipelineCore.hasOutput(manifest.config)) await window.MappAIPipeline.run(manifest.config, Object.assign({ only: ['B', 'C', 'D', 'E'], vaultPath, manifest }, options.continua || {}));
        else dopoChiusura();   // 0090: «Chiudi» senza niente da continuare torna dove torna «più tardi»
      } catch (e) { completionError(e); }
      finally { freeze(false); }
    };
    if (veste) {
      /* R1: «Salva e continua più tardi» salva prima il campo aperto. R4: G2 si chiude senza la spunta,
         quando ogni materiale è rivisto, approvato o escluso; con il controllo parziale è il docente ad aver
         completato il controllo, materiale per materiale (manualReview). */
      chiudiPiuTardi = async () => {
        if (busy) return false;
        if (!veste.salvaAperto()) return false;
        await pendingSave; if (!saveError && !busy) close();
        return closed;
      };
      modal.querySelector('#mrv-later').onclick = async () => { if (await chiudiPiuTardi()) dopoChiusura(); };
      proceed.onclick = async () => {
        if (closed || busy || committing || proceed.hidden) return;
        if (!veste.salvaAperto()) return;
        freeze(true);
        try {
          await pendingSave; if (saveError) throw saveError;
          const r = getReview(), resume = hasResume();
          if (r.initial.status !== 'approved' && !veste.puoChiudere()) return;
          // 0075: anche G1; con il controllo parziale la casella del piede è la conferma esplicita (rev. 4, B.1)
          if (r.initial.status !== 'approved' || resume) await approve(r.initial.checkStatus !== 'completed');
          close(); busy = false;
          if (options.onContinue) await options.onContinue(manifest);
          else if (!reading && (resume || hasResume()) && window.MappAIPipelineCore.hasOutput(manifest.config)) await window.MappAIPipeline.run(manifest.config, Object.assign({ only: ['B', 'C', 'D', 'E'], vaultPath, manifest }, options.continua || {}));
          else dopoChiusura();   // 0090: «Chiudi» senza niente da continuare torna dove torna «più tardi»
        } catch (e) { completionError(e); }
        finally { freeze(false); }
      };
    }
    /* B10: il clic chiude G2 esattamente come «Salva e continua più tardi» (salva il campo aperto, nessuna
       decisione persa; se il salvataggio non riesce la finestra resta) e solo se si è chiusa apre G1, con la
       stessa chiamata di «Rivedi i contenuti» (`#mps-rivedi`): sopra la console che l'ha aperta. */
    const passoContenuti = modal.querySelector('#mrv-step-contenuti');
    if (passoContenuti) passoContenuti.onclick = async () => {
      if (busy || closed) return;
      await chiudiPiuTardi();              // B14: senza `dopoChiusura` — G1 si apre sopra CREA, non ELABORA
      if (closed && typeof R.open === 'function') R.open(vaultPath, manifest, { alza: true });
    };
    modal.addEventListener('keydown', e => {
      if (veste && veste.tasto(e)) return;   // 0073: ⌘Z, ⇧⌘Z (Ctrl+Shift+Z, Ctrl+Y), Esc dentro un campo
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
