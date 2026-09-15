'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Core = require('../public/js/mappai-review-core');
const Material = require('../public/js/mappai-material-review');
const Pipeline = require('../public/js/mappai-pipeline-core');
const clone = x => JSON.parse(JSON.stringify(x));
const DB = { nodes: [{ id: 'a', label: 'Germania', desc: 'Prima.', level: 0 }, { id: 'b', label: 'Svizzera', desc: 'Altro testo.', level: 1 }],
  links: [{ source: 'a', target: 'b', rel: 'richiede', isCross: true }], sourcesDict: {} };
const SOURCES = [{ nome: 'Libro.pdf', pages: [{ n: 4, text: 'La fonte dice: dopo. Un contesto più ampio.' }] }];
function initial(report) { return Core.createReview({ db: DB, sources: SOURCES, report: report || { checkStatus: 'completed', issues: [
  { id: 'issue', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Testo da correggere.', evidence: [{ source: 'Libro.pdf', page: 4, text: 'dopo.' }] }
] } }); }
function manifest(review = initial()) { const m = Pipeline.createManifest({}, { vaultPath: '/vault' }); m.steps.A.status = 'done'; m.review = review; return m; }

// Cheerio supplies parsing/selectors already used by the app. This small DOM
// adapter implements only native methods the real controller calls; events are
// invoked explicitly, without timers, Electron windows or model calls.
function dom() {
  const $ = cheerio.load('<html><body><button id="previous">Prima</button></body></html>');
  const wrappers = new WeakMap();
  let active;
  function wrap(n) {
    if (!n) return null;
    if (wrappers.has(n)) return wrappers.get(n);
    const e = { n, listeners: {},
      setAttribute(k, v) { $(n).attr(k, String(v)); },
      getAttribute(k) { return $(n).attr(k); },
      appendChild(child) { $(n).append(child.n); return child; },
      replaceChildren(...children) { $(n).empty(); children.forEach(c => this.appendChild(c)); },
      remove() { $(n).remove(); },
      querySelector(s) { return wrap($(n).find(s).get(0)); },
      querySelectorAll(s) { return $(n).find(s).toArray().map(wrap); },
      focus() { active = this; }, getClientRects() { return this.hidden || $(n).parents('[hidden]').length ? [] : [{}]; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      async click() { if (!this.disabled && this.onclick) return this.onclick(); }
    };
    for (const name of ['id', 'className', 'type', 'rows', 'min', 'max', 'step']) Object.defineProperty(e, name, {
      get() { return $(n).attr(name === 'className' ? 'class' : name) || ''; },
      set(v) { $(n).attr(name === 'className' ? 'class' : name, String(v)); }
    });
    for (const name of ['disabled', 'hidden', 'checked']) Object.defineProperty(e, name, {
      get() { return $(n).attr(name) !== undefined; }, set(v) { if (v) $(n).attr(name, name); else $(n).removeAttr(name); }
    });
    Object.defineProperties(e, {
      innerHTML: { get() { return $(n).html(); }, set(v) { $(n).html(v); } },
      textContent: { get() { return $(n).text(); }, set(v) { $(n).text(v == null ? '' : String(v)); } },
      value: { get() { return this._value !== undefined ? this._value : $(n).val() || ''; }, set(v) { this._value = String(v == null ? '' : v); $(n).val(this._value); } },
      isConnected: { get() { return $(n).parents('html').length > 0; } }
    });
    wrappers.set(n, e); return e;
  }
  const document = { body: wrap($('body')[0]), createElement: tag => wrap($('<' + tag + '>')[0]),
    createTextNode: text => wrap({ type: 'text', data: text }),
    getElementById: id => wrap($('#' + id)[0]), get activeElement() { return active; } };
  active = document.getElementById('previous');
  return { document, text: () => $('body').text(), html: () => $.html() };
}

function runtime(opts = {}) {
  const d = dom(), calls = { manifest: 0, map: 0, load: 0, cache: 0, pipeline: 0 }, saved = { manifest: null, map: clone(DB), version: 0 };
  const st = { activeVaultPath: '/vault', db: clone(DB), sources: [], _pdfPagine: [], _reviewRevision: null };
  const window = { MappAIReviewCore: Core, MappAIMaterialReview: Material, MappAIPipelineCore: Pipeline,
    MappAIReviewContext: require('../public/js/mappai-review-context'),
    MappAIGroundingCore: require('../public/js/mappai-grounding-core.js'),
    t: (_key, fallback) => fallback, renderGraph() {}, getSystemKey: () => 'mock-key',
    MappAIPipeline: { run: async () => { calls.pipeline++; } },
    buildVaultMapData: () => ({ ...st.db, reviewRevision: st._reviewRevision, reviewCommit: st._reviewCommit }),
    electronAPI: {
      saveVaultFile: async args => {
        if (args.relPath !== 'pipeline.json') return { ok: true };
        calls.manifest++;
        if (opts.failSave) return { ok: false, error: 'Disco non disponibile' };
        assert.equal(args.expectedVersion, saved.version);
        saved.manifest = JSON.parse(args.text); saved.version++;
        saved.manifest._storageVersion = saved.version;
        return { ok: true, version: saved.version };
      },
      saveVault: async args => { calls.map++; saved.map = clone(args.mapData); if (opts.afterMapWrite) opts.afterMapWrite(st, saved); return { success: true }; },
      loadVault: async () => { calls.load++; return { success: true, data: clone(opts.diskData || saved.map) }; },
      readVaultFile: async () => ({ ok: true, text: JSON.stringify(opts.readback ? opts.readback(clone(saved.manifest)) : saved.manifest) }),
      vaultMaterialsList: async () => ({ manifest: clone(saved.manifest) })
    } };
  const ctx = vm.createContext({ window, appState: st, document: d.document, console, TextDecoder, Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    StorageManager: { currentProjectId: 'project', saveCurrentProject: () => { calls.cache++; } },
    localStorage: { getItem: () => null } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8'), ctx);
  return { R: window.MappAIReview, window, st, calls, saved, dom: d, opts };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('G1 commit verifies actual persisted content and uses lexical StorageManager', async () => {
  const h = runtime(), r = initial(), m = manifest(Core.setDecision(r, 'issue', 'accept'));
  await h.R.approve('/vault', m);
  assert.equal(h.calls.map, 1); assert.equal(h.calls.load, 1); assert.ok(h.calls.cache > 0);
  assert.equal(h.window.StorageManager, undefined, 'the test intentionally provides only the lexical global');
  assert.equal(m.review.initial.status, 'approved');
  assert.equal(h.st.db.nodes.find(n => n.id === 'a').desc, 'Dopo.');
  assert.equal(h.st.db.nodes.find(n => n.id === 'a').content, 'Dopo.');
  assert.equal(h.st._reviewCommit, undefined);
});

test('wrong disk link/source or project switch leaves the durable commit applying', async () => {
  for (const fault of ['link', 'source', 'project']) {
    const h = runtime({ afterMapWrite: (st, saved) => {
      if (fault === 'link') saved.map.links = [];
      if (fault === 'source') saved.map.sourcesDict.a = [{ text: 'Altra fonte.' }];
      if (fault === 'project') st.activeVaultPath = '/other';
    } });
    const m = manifest(Core.setDecision(initial(), 'issue', 'accept'));
    await assert.rejects(h.R.approve('/vault', m));
    assert.equal(h.saved.manifest.review.initial.status, 'applying');
    assert.equal(h.calls.manifest, 1);
  }
});

test('restore uses diskData, preserves same-token teacher drafts and never replaces actual citations with an old approval', async () => {
  const r = initial({ checkStatus: 'completed', issues: [] });
  const begun = Core.beginApproval(r, DB), approved = Core.completeApproval(begun.review, begun.revision), m = manifest(approved);
  const h = runtime(); h.st.db.nodes[0].desc = 'Bozza locale legittima.'; h.st._reviewRevision = approved.approvedRevision;
  const disk = clone(DB); disk.sourcesDict.a = [{ id: 'new', text: 'Fonte corretta su disco.' }];
  await h.R.restore('/vault', m, { fromCache: true, diskData: disk });
  assert.equal(h.calls.load, 0);
  assert.equal(h.st.db.nodes[0].desc, 'Bozza locale legittima.');
  assert.equal(h.st.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
  assert.equal(h.st._reviewDiskDraft.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
  assert.equal(h.st._reviewLocalDraft.db.nodes.find(n => n.id === 'a').desc, 'Bozza locale legittima.');
  const direct = runtime(); direct.st.db = disk;
  await direct.R.restore('/vault', m, { fromCache: false });
  assert.equal(direct.st.db.sourcesDict.a[0].text, 'Fonte corretta su disco.');
});

test('older cache token selects disk while retaining the local draft; legacy clears commit metadata', async () => {
  const m = manifest(), h = runtime(); h.st.db.nodes[0].desc = 'Vecchia cache.'; h.st._reviewCommit = 'old';
  await h.R.restore('/vault', m, { fromCache: true, diskData: clone(DB) });
  assert.equal(h.st.db.nodes[0].desc, 'Prima.');
  assert.equal(h.st._reviewLocalDraft.db.nodes.find(n => n.id === 'a').desc, 'Vecchia cache.');
  assert.equal(h.st._reviewCommit, undefined);
  await h.R.restore('/vault', null);
  assert.equal(h.st._pipelineManifest, null); assert.equal(h.st._reviewRevision, undefined);
});

test('retry rechecks sources in proposal mode, keeps existing decisions and restores caller source context', async () => {
  const h = runtime(), r = initial({ checkStatus: 'incomplete', issues: [{ id: 'existing', target: { kind: 'node', id: 'a' }, after: 'Dopo.' }] });
  const m = manifest(Core.setDecision(r, 'existing', 'reject'));
  const pages = [{ nome: 'Altro.pdf', pages: [] }]; h.st._pdfPagine = pages;
  h.window.executeJudgePass = async (_key, opts) => {
    assert.equal(opts.apply, false); assert.equal(opts.enabled, true);
    assert.equal(h.st._pdfPagine[0].nome, 'Libro.pdf');
    return { checkStatus: 'completed', issues: [{ id: 'reworded', target: { kind: 'node', id: 'a' }, after: 'Dopo.', problem: 'La stessa proposta, spiegata diversamente.' }] };
  };
  await h.R.retryJudge('/vault', m);
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.equal(m.review.initial.issues.length, 1);
  assert.equal(m.review.initial.issues[0].id, 'existing');
  assert.equal(m.review.initial.checkStatus, 'completed'); assert.equal(h.st._pdfPagine, pages);
  assert.equal(h.st.db.nodes[0].desc, 'Prima.');
});

test('text-only and mixed generation archives survive checkpoint and retry without stale source context', async () => {
  for (const sources of [[{ id: 'text', title: 'Testo incollato', content: 'La Germania riceveva valuta.' }],
    [{ id: 'pdf', nome: 'Libro.pdf', pages: [{ n: 4, text: 'Commercio dell’oro.' }] }, { id: 'web', title: 'Articolo', content: 'La Germania riceveva valuta.' }]]) {
    const h = runtime(); h.st._generationSources = sources; h.st._pdfPagine = [{ nome: 'Vecchio.pdf', pages: [] }];
    const m = Pipeline.createManifest({}, { vaultPath: '/vault' });
    await h.R.checkpoint('/vault', m);
    assert.deepEqual(clone(m.review.sources), Core.sourceSnapshot(sources));
    const currentSources = [{ id: 'unrelated', text: 'Altro contesto corrente.' }]; h.st._generationSources = currentSources;
    h.window.executeJudgePass = async () => {
      assert.deepEqual(clone(h.st._generationSources), Core.sourceSnapshot(sources));
      return { checkStatus: 'completed', issues: [] };
    };
    await h.R.retryJudge('/vault', m); assert.equal(h.st._generationSources, currentSources);
    await h.R.restore('/vault', null); assert.equal(h.st._generationSources, undefined);
  }
});

test('retry without new findings explains partial coverage; only a complete check removes manual confirmation', async () => {
  const h = runtime(), partial = { stato: 'parziale', copertura: {
    nodiEsaminati: ['b'], linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'evidenze mancanti' }]
  }, issues: [] };
  const m = manifest(Core.setDecision(initial({ ...partial, issues: [
    { id: 'existing', target: { kind: 'node', id: 'b', field: 'desc' }, after: 'Correzione.' }
  ] }), 'existing', 'reject'));
  const modal = h.R.open('/vault', m), proceed = modal.querySelector('#mrv-continue');
  assert.equal(proceed.hidden, true);
  assert.match(modal.querySelector('#mrv-manual').textContent, /Controllo automatico eseguito: alcune parti restano da verificare/);
  h.window.executeJudgePass = async () => clone(partial);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(m.review.initial.checkStatus, 'incomplete');
  assert.equal(m.review.initial.issues.length, 1, 'a partial check without findings does not invent correction cards');
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.match(modal.querySelector('#mrv-status').textContent, /Controllo automatico eseguito: alcune parti restano da verificare/);
  assert.match(modal.querySelector('#mrv-manual').textContent, /Anche senza nuove segnalazioni/);
  assert.match(modal.querySelector('#mrv-manual-option').textContent, /Ho verificato personalmente anche le parti non coperte/);
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  assert.equal(proceed.hidden, true);
  h.window.executeJudgePass = async () => ({ stato: 'completato', issues: [] });
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(m.review.initial.checkStatus, 'completed');
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
  assert.match(modal.querySelector('#mrv-status').textContent, /Controllo automatico completato/);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(proceed.hidden, false);
});

function finalManifest(items, issues) {
  const r = initial({ checkStatus: 'completed', issues: [] });
  const first = Core.beginApproval(r, DB), m = manifest(Core.completeApproval(first.review, first.revision));
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: SOURCES,
    report: { checkStatus: 'completed', issues: issues || [] } }) };
  return m;
}

function stalledMaterialFixture(opts = {}) {
  const h = runtime(opts), items = Array.from({ length: 250 }, (_, i) => ({ id: 'material-' + i, kind: 'flashcard', question: 'Domanda ' + i + '?', answer: 'Risposta ' + i + '.' }));
  const issues = Array.from({ length: 6 }, (_, i) => ({ id: 'decision-' + i, target: { kind: 'item', id: items[i].id, field: 'answer' }, after: 'Correzione ' + i + '.' }));
  const m = finalManifest(items, issues), final = m.review.final;
  issues.forEach((issue, i) => { final.review = Core.setDecision(final.review, issue.id, i < 3 ? 'accept' : i < 5 ? 'reject' : 'manual', { text: 'Scelta personale.' }); });
  final.review.initial.checkStatus = 'incomplete';
  final.review.initial.report = { checkStatus: 'incomplete', coverage: { expectedIds: items.map(i => i.id), checkedIds: items.slice(0, 240).map(i => i.id),
    skipped: items.slice(240).map(i => ({ id: i.id, reason: 'Una o più affermazioni non hanno un esito verificabile' })),
    claims: items.slice(240).map((i, index) => ({ itemId: i.id, field: 'answer', text: i.answer, status: index === 9 ? 'missing' : 'uncertain', checked: false })) } };
  final.review.initial.retrySummary = { newIssueIds: [], decisionsPreserved: 6, targeted: 10, reused: 240, checked: 0, remaining: 10 };
  h.st._pipelineManifest = m;
  return { ...h, m };
}

test('a stalled retry explains attempted vs completed checks and exposes the exact draft, original sources and missing verdicts', () => {
  const h = stalledMaterialFixture(), before = clone(h.m), modal = h.R.open('/vault', h.m, { final: true });
  assert.match(modal.querySelector('#mrv-retry-summary').textContent, /10 materiali sottoposti al tentativo · 0 nuovi controlli completati · 10 materiali ancora da verificare · 240 controlli riutilizzati/);
  assert.match(modal.querySelector('#mrv-no-progress').textContent, /non ha completato nuovi controlli/);
  assert.equal(modal.querySelectorAll('[data-coverage-item]').length, 10);
  const first = modal.querySelector('[data-coverage-item="material-240"]');
  assert.match(first.textContent, /Riscontro nella fonte non confermato/); assert.match(first.textContent, /Risposta 240/);
  assert.match(modal.querySelector('[data-coverage-item="material-249"]').textContent, /non ha restituito un esito/);
  assert.match(modal.querySelector('.mrv-coverage-sources').textContent, /Libro.pdf · Pagina 4/);
  assert.match(modal.querySelector('.mrv-coverage-sources').textContent, /Un contesto più ampio/);
  assert.match(modal.querySelector('#mrv-material-coverage').textContent, /non sono valutate dal pulsante di ricontrollo/);
  assert.deepEqual(clone(h.m), before); assert.equal(h.calls.manifest, 0);
});

test('reviewing a residual adds one field decision, previews its correction and requires a fresh personal confirmation before approval', async () => {
  const h = stalledMaterialFixture(), initialDecisions = clone(h.m.review.final.review.initial.decisions), report = clone(h.m.review.final.review.initial.report);
  const modal = h.R.open('/vault', h.m, { final: true });
  let confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  assert.equal(h.m.review.final.review.initial.issues.length, 7);
  let card = currentCard(modal);
  assert.doesNotMatch(card.textContent, /Il giudice segnala un problema|La prova non è disponibile/);
  assert.match(card.textContent, /Hai aperto questa scheda/);
  await card.querySelector('[data-review-choice="manual"]').click();
  const input = card.querySelector('[data-editor] textarea'); input.value = 'Risposta verificata personalmente.'; input.oninput(); await tick();
  await modal.querySelector('[data-review-filter="pending"]').click();
  const version = modal.querySelector('[data-coverage-item="material-240"] .mrv-coverage-version');
  assert.match(version.textContent, /Risposta 240\./); assert.match(version.textContent, /Risposta verificata personalmente/);
  assert.match(modal.querySelector('#mrv-unchecked').textContent, /10/);
  assert.equal(h.m.review.final.items[240].answer, 'Risposta 240.', 'corrections are still separate from the checked drafts');
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(h.m.review.final.review.initial.issues.length, 7, 'opening the same field reuses its saved decision');
  assert.equal(currentCard(modal).querySelector('[data-editor] textarea').value, 'Risposta verificata personalmente.');
  confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  // Even a later edit in the already open editor invalidates the confirmation.
  const edit = currentCard(modal).querySelector('[data-editor] textarea'); edit.value = 'Versione definitiva verificata.'; edit.oninput(); await tick();
  assert.equal(confirmation.checked, false); assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  confirmation.checked = true; confirmation.onchange();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(h.m.review.final.review.initial.status, 'approved');
  assert.equal(h.m.review.final.review.initial.manualReview, true);
  assert.equal(h.m.review.final.review.initial.checkStatus, 'incomplete', 'personal approval never changes the model verdict');
  assert.equal(h.m.review.final.items.find(i => i.id === 'material-240').answer, 'Versione definitiva verificata.');
  for (const [id, decision] of Object.entries(initialDecisions)) assert.deepEqual(clone(h.m.review.final.review.initial.decisions[id]), decision);
  assert.deepEqual(clone(h.m.review.final.review.initial.report), report);
});

test('a residual edit reopens an existing decision without resetting it, and blocked saves cannot silently navigate away', async () => {
  const h = stalledMaterialFixture(), final = h.m.review.final;
  final.review = Core.addIssue(final.review, { id: 'existing', target: { kind: 'item', id: 'material-240', field: 'answer' }, after: 'Proposta scelta.' });
  final.review = Core.setDecision(final.review, 'existing', 'accept');
  const modal = h.R.open('/vault', h.m, { final: true }), before = clone(final.review);
  await modal.querySelector('[data-coverage-item="material-240"] [data-coverage-edit="answer"]').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'existing');
  assert.deepEqual(clone(final.review), before); assert.equal(h.calls.manifest, 0);
  h.opts.failSave = true;
  await modal.querySelector('[data-coverage-item="material-241"] [data-coverage-edit="answer"]').click();
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'existing');
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('[data-coverage-item="material-241"] [data-coverage-edit="answer"]').click();
  assert.equal(final.review.initial.issues.length, 8, 'retrying a failed save does not duplicate the field decision');
});

test('manual corrections for two residuals with identical text never share a decision group', () => {
  const h = runtime(), m = finalManifest([{ id: 'a', kind: 'flashcard', answer: 'Uguale' }, { id: 'b', kind: 'flashcard', answer: 'Uguale' }]);
  let r = m.review.final.review;
  for (const id of ['a', 'b']) r = Core.addIssue(r, { origin: 'teacher', problem: 'Modifica del docente: Risposta', target: { kind: 'item', id, field: 'answer' } });
  assert.equal(h.R.groupIssues(r.initial.issues).length, 2);
});

test('G2 rejects invalid MC keys even when teacher keeps the proposal; explicit exclusion succeeds', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 8 }];
  const report = Material.validate(items), m = finalManifest(items, report.issues), h = runtime();
  for (const i of m.review.final.review.initial.issues) m.review.final.review = Core.setDecision(m.review.final.review, i.id, 'reject');
  await assert.rejects(h.R.approve('/vault', m, { final: true }), /Correggi o escludi/);
  assert.equal(h.calls.manifest, 0);
  m.review.final.review = Core.addIssue(m.review.final.review, { id: 'exclude', target: { kind: 'item', id: 'q', field: '$item' }, after: null });
  m.review.final.review = Core.setDecision(m.review.final.review, 'exclude', 'accept');
  await h.R.approve('/vault', m, { final: true });
  assert.equal(m.review.final.stage, 'approved'); assert.equal(m.review.final.items.length, 0);
});

test('G2 compares item readback from pipeline.json and does not approve damaged saved data', async () => {
  const items = [{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }];
  const h = runtime({ readback: m => { m.review.final.items[0].answer = 'Svizzera.'; return m; } });
  const m = finalManifest(items);
  await assert.rejects(h.R.approve('/vault', m, { final: true }), /persisted_revision_mismatch/);
  assert.equal(h.saved.manifest.review.final.review.initial.status, 'applying');
});

test('dialog renders human link labels, original quote and expandable page context without JSON', () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'completed', linkTolti: [{ source: 'a', target: 'b', rel: 'richiede',
    problema: 'Nesso da discutere.', evidenze: [{ source: 'Libro.pdf', page: 4, text: 'dopo.' }] }] }));
  const dialog = h.R.open('/vault', m);
  assert.match(h.dom.text(), /Germania → richiede → Svizzera/);
  assert.match(h.dom.text(), /Pagina 4/); assert.match(h.dom.text(), /Leggi il contesto/);
  assert.doesNotMatch(h.dom.text(), /"source"|"target"|"verbatim"|\{\s*"/);
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(h.dom.document.activeElement.id, 'mrv-title');
});

test('only exact duplicate issues group, with all precise targets preserved', () => {
  const h = runtime();
  const base = { target: { kind: 'node', id: 'a', field: 'desc' }, before: 'Prima.', after: 'Dopo.', problem: 'Uguale', evidence: 'prova', hasProposal: true };
  const groups = h.R.groupIssues([{ ...base, id: '1' }, { ...base, id: '2', target: { ...base.target, id: 'b' } }, { ...base, id: '3', evidence: 'diversa' }]);
  assert.equal(groups.length, 2); assert.equal(groups[0].length, 2);
  assert.equal(groups[0][1].target.id, 'b');
});

test('MC alternatives use separate fields and preserve commas, arrays and decision undo', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania, nel 1940', 'Svizzera'], correctIndex: 0 }];
  const issue = { id: 'options', target: { kind: 'item', id: 'q', field: 'options' }, after: ['Germania', 'Svizzera'], problem: 'Alternative da rivedere.' };
  const m = finalManifest(items, [issue]), h = runtime(), modal = h.R.open('/vault', m, { final: true });
  const buttons = modal.querySelectorAll('[data-actions] button');
  await buttons.find(b => b.textContent === 'Modifica il testo').click();
  const fields = modal.querySelectorAll('[data-editor] textarea');
  assert.equal(fields.length, 2); assert.equal(fields[0].value, 'Germania, nel 1940');
  fields[0].value = 'Germania, prima della guerra'; fields[0].oninput(); await tick();
  assert.deepEqual(clone(m.review.final.review.initial.decisions.options.text), ['Germania, prima della guerra', 'Svizzera']);
  await buttons.find(b => b.textContent === 'Annulla decisione').click(); await tick();
  assert.equal(m.review.final.review.initial.decisions.options.choice, 'pending');
  assert.equal(m.review.final.items[0].options[0], 'Germania, nel 1940');
});

test('save failure keeps dialog open, enables retry and freezes every action during confirmation', async () => {
  const h = runtime({ failSave: true }), m = manifest(), modal = h.R.open('/vault', m);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click(); await tick();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, false);
  await modal.querySelector('#mrv-later').click(); assert.ok(h.dom.document.getElementById('mappai-teacher-review'));
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, true);
  let release; h.window.electronAPI.saveVault = async args => { h.saved.map = clone(args.mapData); await new Promise(r => { release = r; }); return { success: true }; };
  const proceed = modal.querySelector('#mrv-continue').click();
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  assert.equal(modal.getAttribute('aria-busy'), 'true');
  assert.ok(modal.querySelectorAll('button,input,textarea,select').every(e => e.disabled));
  release(); await proceed;
  assert.equal(h.dom.document.getElementById('mappai-teacher-review'), null);
  assert.equal(h.dom.document.activeElement.id, 'previous');
});

test('openCurrent chooses G2, including completed delivery history, without regenerating materials', async () => {
  const h = runtime(), m = finalManifest([{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }]);
  h.st._pipelineManifest = m;
  await h.R.openCurrent(); assert.equal(h.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  const done = runtime(), approved = Core.beginApproval(m.review.final.review, { items: m.review.final.items }, { sources: SOURCES });
  m.review.final.review = Core.completeApproval(approved.review, approved.revision);
  m.review.final.stage = 'done'; done.st._pipelineManifest = m;
  await done.R.openCurrent();
  assert.equal(done.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  const button = done.dom.document.getElementById('mrv-continue'); assert.equal(button.textContent, 'Chiudi');
  await button.click(); assert.equal(done.calls.pipeline, 0); assert.equal(done.calls.map, 0);
});

test('causal cards show the complete relationship and a no-proposal warning; keeping it reports no text correction', async () => {
  const item = { id: 'relation', kind: 'causal', question: 'Il metallo era stato sottratto', text: 'quindi', answer: 'era frutto di rapina' };
  const m = finalManifest([item], [{ id: 'causal-issue', target: { kind: 'item', id: item.id, field: 'answer' },
    problem: 'La relazione ripete il significato della premessa.' }]);
  const h = runtime(), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.match(modal.querySelector('[data-relation]').textContent, /Il metallo era stato sottratto → quindi → era frutto di rapina/);
  assert.doesNotMatch(h.dom.text(), /Domanda:/);
  assert.match(modal.querySelector('[data-no-proposal]').textContent, /non propone una correzione pronta/);
  assert.ok(!modal.querySelectorAll('[data-actions] button').some(b => /Applica/.test(b.textContent)));
  assert.deepEqual(m, before, 'rendering is read-only');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Mantieni il testo senza modifiche').click();
  assert.match(modal.querySelector('#mrv-decision-summary').textContent, /Modifiche manuali: 0 · Senza modifiche: 1/);
  assert.equal(m.review.final.review.initial.decisions['causal-issue'].choice, 'reject');
  assert.deepEqual(m.review.final.items, [item]);
  await modal.querySelector('[data-review-filter="decided"]').click();
  assert.match(modal.querySelector('[data-choice]').textContent, /Testo mantenuto senza modifiche/);
});

test('relationship editing previews every chosen field, offers the gerund fix explicitly and persists the composed result', async () => {
  const item = { id: 'hydraulic', kind: 'causal', step: 'D', question: "L’acqua scorre con facendo girare una turbina [[src-water]].", text: 'causa',
    answer: 'il movimento nel circuito elettrico.', citations: [{ id: 'src-water', idx: 1, title: 'Modello idraulico', text: 'Estratto originale.' }] };
  const m = finalManifest([item], [
    { id: 'wording', target: { kind: 'item', id: item.id, field: 'question' }, problem: 'Rileggi la frase.' },
    { id: 'connector', target: { kind: 'item', id: item.id, field: 'text' }, after: 'è analogo a', problem: 'Rivedi il rapporto.' }
  ]);
  m.review.final.review = Core.setDecision(m.review.final.review, 'connector', 'accept');
  const h = runtime(), untouched = clone(m), modal = h.R.open('/vault', m, { final: true });
  let card = currentCard(modal);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /con facendo.*è analogo a.*circuito elettrico/);
  assert.doesNotMatch(card.querySelector('[data-relation-sentence]').textContent, /src-water|→/);
  assert.ok(card.querySelector('[data-relation-hint]'));
  assert.deepEqual(m, untouched, 'the hint never edits the teacher’s text on its own');
  await card.querySelector('[data-relation-edit=question]').click();
  card = currentCard(modal);
  const input = card.querySelector('[data-review-field=question]');
  assert.equal(h.dom.document.activeElement, input);
  await card.querySelector('[data-relation-suggestion=question]').click(); await tick();
  assert.equal(card.querySelector('[data-review-field=question]'), input, 'typing and suggestions retain the actual editor');
  assert.equal(h.dom.document.activeElement, input);
  assert.equal(card.querySelector('[data-relation-hint]'), null);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a/);
  assert.equal(card.querySelector('[data-relation-part=question]').getAttribute('data-changed'), 'true');
  assert.equal(m.review.final.review.initial.decisions.wording.text, item.question.replace('con facendo', 'facendo'));
  assert.deepEqual(m.review.final.items, [item], 'approval, not an inline suggestion, updates the published draft');

  await card.querySelector('[data-relation-edit=answer]').click();
  card = currentCard(modal);
  const second = card.querySelector('[data-review-field=answer]');
  second.value = 'ciò che accade nel circuito elettrico.'; second.oninput(); await tick();
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a ciò che accade/);
  await modal.querySelector('#mrv-later').click();
  const reopened = h.R.open('/vault', h.saved.manifest, { final: true });
  await reopened.querySelector('[data-review-filter=decided]').click();
  assert.match(currentCard(reopened).querySelector('[data-relation-sentence]').textContent, /scorre facendo.*è analogo a ciò che accade/);
  await reopened.querySelector('#mrv-continue').click();
  assert.equal(h.saved.manifest.review.final.items[0].question, item.question.replace('con facendo', 'facendo'));
  assert.equal(h.saved.manifest.review.final.items[0].text, 'è analogo a');
  assert.equal(h.saved.manifest.review.final.items[0].answer, second.value);
  assert.deepEqual(h.saved.manifest.review.final.items[0].citations, item.citations);
});

test('whole-relationship editors follow sentence order, escape live text and handle a residue across field boundaries', async () => {
  const item = { id: 'whole', kind: 'causal', question: 'L’acqua scorre con', text: 'facendo', answer: 'girare una turbina.' };
  const m = finalManifest([item], [{ id: 'whole-issue', target: { kind: 'item', id: item.id, field: '$item' }, problem: 'Rileggi la relazione.' }]);
  const h = runtime(), modal = h.R.open('/vault', m, { final: true });
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const card = currentCard(modal), inputs = card.querySelectorAll('[data-review-field]');
  assert.deepEqual(inputs.map(el => el.getAttribute('data-review-field')), ['question', 'text', 'answer']);
  assert.ok(card.querySelector('[data-relation-hint]'));
  assert.equal(card.querySelector('[data-relation-suggestion]'), null, 'no partial fix can silently cross two fields');
  inputs[0].value = 'L’acqua scorre <img src=x onerror=alert(1)>'; inputs[0].oninput(); await tick();
  assert.equal(card.querySelector('[data-relation-preview] img'), null);
  assert.match(card.querySelector('[data-relation-sentence]').textContent, /<img/);
  assert.equal(card.querySelector('[data-relation-hint]'), null);
  await card.querySelector('[data-relation-edit=answer]').click();
  assert.equal(h.dom.document.activeElement, inputs[2]);
  assert.deepEqual(m.review.final.items, [item]);
});

test('relationship previews do not group different sentences or claim a result for conflicts and exclusions', async () => {
  const items = ['one', 'two'].map((id, n) => ({ id, kind: 'causal', question: 'Premessa comune', text: 'quindi', answer: 'Risultato ' + n }));
  const issues = items.map(i => ({ id: 'fix-' + i.id, target: { kind: 'item', id: i.id, field: 'question' }, after: 'Premessa corretta',
    problem: 'Stesso problema', evidence: [{ text: 'dopo.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }] }));
  const m = finalManifest(items, issues), h = runtime(), modal = h.R.open('/vault', m, { final: true });
  assert.equal(modal.querySelectorAll('[data-review-card]').length, 2);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Premessa scelta'; input.oninput(); await tick();
  assert.equal(m.review.final.review.initial.decisions['fix-two']?.choice || 'pending', 'pending');
  await modal.querySelector('#mrv-later').click();
  m.review.final.review = Core.addIssue(m.review.final.review, { id: 'overlap', target: { kind: 'item', id: 'one', field: 'question' }, after: 'Altra scelta' });
  m.review.final.review = Core.setDecision(m.review.final.review, 'overlap', 'accept');
  const conflict = h.R.open('/vault', m, { final: true });
  assert.match(currentCard(conflict).querySelector('[data-relation-preview]').textContent, /decisioni in conflitto/);
  assert.equal(currentCard(conflict).querySelector('[data-relation-sentence]'), null);
  await conflict.querySelector('#mrv-later').click();
  const excluded = finalManifest([items[0]], [{ id: 'exclude', target: { kind: 'item', id: 'one', field: '$item' }, after: null, hasProposal: true }]);
  excluded.review.final.review = Core.setDecision(excluded.review.final.review, 'exclude', 'accept');
  const last = h.R.open('/vault', excluded, { final: true });
  await last.querySelector('[data-review-filter=decided]').click();
  assert.match(currentCard(last).querySelector('[data-relation-preview]').textContent, /esclusa dai materiali/);
  assert.equal(currentCard(last).querySelector('[data-relation-edit]'), null);
});

test('review references and editor use reversible source labels, leaving original IDs and decisions intact', async () => {
  const item = { id: 'intro', kind: 'synthesis', text: 'Il governo agì [[src-one]]. Un altro fatto [[src-missing]].',
    citations: [{ id: 'src-one', idx: 1, title: 'Libro.pdf', page: 4, text: 'Fonte originale.' }] };
  const m = finalManifest([item], [{ id: 'intro-issue', target: { kind: 'item', id: item.id, field: 'text' }, problem: 'Soggetto da correggere.' }]);
  const h = runtime(), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.doesNotMatch(h.dom.text(), /\[\[src-/);
  assert.match(h.dom.text(), /Fonte 1/); assert.match(h.dom.text(), /Fonte da verificare/);
  assert.match(modal.querySelector('[data-references]').textContent, /Pagina 4/);
  assert.deepEqual(m, before); assert.equal(h.calls.manifest, 0);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click();
  const input = modal.querySelector('[data-editor] textarea');
  assert.doesNotMatch(input.value, /src-/);
  input.value = input.value.replace('Il governo', 'L’Assemblea'); input.oninput(); await tick();
  assert.equal(m.review.final.review.initial.decisions['intro-issue'].text,
    'L’Assemblea agì [[src-one]]. Un altro fatto [[src-missing]].');
  assert.deepEqual(m.review.final.items, [item], 'drafts change only on final approval');
  assert.match(modal.querySelector('#mrv-decision-summary').textContent, /Modifiche manuali: 1 · Senza modifiche: 0/);
});

test('a long-text correction shows a compact passage and its added source, while approval saves the full text and registry', async () => {
  const filler = 'Questo paragrafo rimane invariato e dà contesto al tema. '.repeat(12);
  const item = { id: 'synthesis-0', kind: 'synthesis', text: filler + '\nLa fonte non dice nulla.\n' + 'a'.repeat(92) + ' [[src-marker-at-cut]] ' + filler,
    citations: [{ id: 'src-marker-at-cut', idx: 1, title: 'Libro.pdf', page: 1, text: 'prima' }] };
  const G = require('../public/js/mappai-grounding-core');
  const entry = G.buildInput({}, [], SOURCES).sourcesArr[0];
  const after = item.text.replace('La fonte non dice nulla.', 'La fonte dice: dopo. [[' + entry.id + ']]');
  const m = finalManifest([item], [{ id: 'with-source', target: { kind: 'item', id: item.id, field: 'text' }, before: item.text,
    after, hasProposal: true, citationAdditions: [entry], problem: 'La fonte contiene il passaggio.' }]);
  const h = runtime(), modal = h.R.open('/vault', m, { final: true });
  assert.ok(modal.querySelector('[data-full-change]'));
  assert.equal(modal.querySelector('[data-full-change]').getAttribute('open'), undefined);
  assert.ok(modal.querySelector('[data-added-sources]'));
  assert.match(modal.querySelector('[data-references]').textContent, /Libro.pdf/);
  assert.doesNotMatch(h.dom.text(), /\[\[src-/);
  assert.deepEqual(m.review.final.items, [item]);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click(); await tick();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.stage, 'approved');
  assert.equal(m.review.final.items[0].text, after);
  assert.equal(m.review.final.items[0].citations.find(s => s.id === entry.id).text, entry.text);
  assert.ok(h.saved.manifest.review.final.items[0].citations.some(s => s.id === entry.id));
});

test('manual review requires an explicit checkbox and keyboard navigation stays in the dialog', async () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'unavailable', issues: [] })), modal = h.R.open('/vault', m);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  await modal.querySelector('#mrv-continue').click(); assert.equal(h.calls.map, 0);
  const confirmation = modal.querySelector('#mrv-manual-confirm'); assert.equal(confirmation.checked, false);
  const manualOption = modal.querySelector('#mrv-manual-option');
  assert.equal(manualOption.getAttribute('open'), undefined);
  let prevented = false;
  modal.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.notEqual(h.dom.document.activeElement.id, 'previous');
  manualOption.setAttribute('open', ''); confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.initial.manualReview, true); assert.equal(m.review.initial.status, 'approved');
});

test('standalone new generation redirects reviewed projects without starting AI or a pipeline', async () => {
  const h = runtime(); assert.equal(await h.R.requireStandalone(), true, 'legacy remains compatible');
  const r = initial({ checkStatus: 'completed', issues: [] }), begun = Core.beginApproval(r, DB);
  h.st._pipelineManifest = manifest(Core.completeApproval(begun.review, begun.revision));
  let opened = 0, message = '';
  h.window.MappAIPipeline.openModal = opts => { assert.equal(opts.fromApproved, true); opened++; };
  h.window.showToast = text => { message = text; };
  assert.equal(await h.R.requireStandalone(), false);
  assert.equal(opened, 1); assert.match(message, /Genera materiali/); assert.equal(h.calls.pipeline, 0);
  const final = finalManifest([{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }]);
  h.st._pipelineManifest = final;
  assert.equal(await h.R.requireStandalone(), false);
  assert.equal(h.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  assert.equal(h.calls.pipeline, 0);
});

test('G2 exclusion button resolves all questions for the exact item and publishes no invalid exercise', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 9 }];
  const m = finalManifest(items, Material.validate(items).issues), h = runtime();
  const modal = h.R.open('/vault', m, { final: true });
  await modal.querySelectorAll('button').find(b => b.textContent === 'Escludi dagli esercizi').click(); await tick();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.stage, 'approved'); assert.equal(m.review.final.items.length, 0);
});

test('double confirmation starts continuation only once', async () => {
  const h = runtime(), m = manifest(Core.setDecision(initial(), 'issue', 'accept')); let continued = 0;
  const modal = h.R.open('/vault', m, { onContinue: async () => { continued++; } });
  const next = modal.querySelector('#mrv-continue');
  const first = next.onclick(); const second = next.onclick();
  await Promise.all([first, second]); await next.onclick();
  assert.equal(continued, 1); assert.equal(h.calls.map, 1);
});

test('review defaults to actionable decisions, retains history and keeps manual confirmation available as an optional disclosure', async () => {
  const report = { checkStatus: 'incomplete', issues: [
    { id: 'pending', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Ancora da decidere' },
    { id: 'accepted', target: { kind: 'node', id: 'b', field: 'desc' }, after: 'Corretto.', problem: 'Proposta già accettata' },
    { id: 'rejected', target: { kind: 'link', source: 'a', target: 'b', field: 'rel' }, after: 'include', problem: 'Proposta già respinta' }
  ] };
  const r = Core.setDecision(Core.setDecision(initial(report), 'accepted', 'accept'), 'rejected', 'reject');
  const h = runtime(), m = manifest(r), modal = h.R.open('/vault', m), before = clone(m.review);
  const filter = key => modal.querySelector('[data-review-filter="' + key + '"]');
  assert.equal(filter('pending').getAttribute('aria-pressed'), 'true');
  assert.equal(modal.querySelectorAll('.pm-section').length, 1);
  assert.match(h.dom.text(), /Ancora da decidere/); assert.doesNotMatch(h.dom.text(), /Proposta già accettata|Proposta già respinta/);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.equal(modal.querySelector('#mrv-manual-option').getAttribute('open'), undefined);
  assert.equal(modal.querySelector('#mrv-other-nodes').getAttribute('open'), undefined, 'unreported nodes stay behind a closed disclosure');
  await filter('decided').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 2);
  await filter('all').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 3);
  assert.deepEqual(clone(m.review), before); assert.equal(h.calls.manifest, 0, 'a view filter never changes or saves decisions');
});

test('saved decision leaves the actionable view; undo in history restores it and filtering never loses a manual draft', async () => {
  const h = runtime(), m = manifest(), modal = h.R.open('/vault', m);
  const filter = key => modal.querySelector('[data-review-filter="' + key + '"]');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  assert.match(filter('pending').textContent, /\(0\)/); assert.match(filter('decided').textContent, /\(1\)/);
  assert.ok(modal.querySelector('#mrv-filter-empty'));
  await filter('decided').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Annulla decisione').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  await filter('pending').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click();
  const input = modal.querySelector('[data-editor] textarea');
  input.value = 'Correzione del docente in corso.'; input.oninput(); await tick();
  assert.equal(h.dom.document.activeElement, input, 'typing does not remove or remount the active editor');
  await filter('decided').click();
  assert.equal(modal.querySelector('[data-editor] textarea').value, 'Correzione del docente in corso.');
  assert.equal(h.saved.manifest.review.initial.decisions.issue.text, 'Correzione del docente in corso.');
});

test('filtering precedes duplicate grouping so a new decision cannot overwrite a previously resolved twin', async () => {
  const report = { checkStatus: 'completed', issues: ['first', 'second'].map(id => ({ id,
    target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Stessa segnalazione' })) };
  const m = manifest(Core.setDecision(initial(report), 'first', 'reject')), h = runtime();
  const modal = h.R.open('/vault', m);
  assert.equal(modal.querySelectorAll('.pm-section').length, 1);
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(m.review.initial.decisions.first.choice, 'reject');
  assert.equal(m.review.initial.decisions.second.choice, 'accept');
});

test('saved manual correction and two accepted rewrites expose the conflict and can be resolved without losing the teacher text', async () => {
  const issues = [
    { id: 'teacher', target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Il testo nega un fatto presente nella fonte.', quote: 'dopo.', evidence: [{ text: 'dopo.' }] },
    ...['variant-a', 'variant-b'].map((id, n) => ({ id, target: { kind: 'node', id: 'a', field: 'desc' },
      after: 'Versione proposta ' + n + '.', problem: 'Riformulazione della stessa segnalazione.', quote: 'dopo.', evidence: [{ text: 'dopo.' }] }))
  ];
  let review = initial({ checkStatus: 'incomplete', issues });
  review = Core.setDecision(review, 'teacher', 'manual', { text: 'Il testo scritto dal docente.' });
  for (const id of ['variant-a', 'variant-b']) review = Core.setDecision(review, id, 'accept');
  const m = manifest(review), h = runtime(), modal = h.R.open('/vault', m);
  assert.match(modal.querySelector('#mrv-filter-count').textContent, /2 da rivedere/);
  assert.match(modal.querySelector('[data-decision-conflict]').textContent, /Il testo scritto dal docente/);
  assert.match(modal.querySelector('.mrv-queue-state').textContent, /Scelte in conflitto/);
  assert.equal(modal.querySelector('[data-review-choice="accept"]').disabled, true, 'clicking the same accepted proposal cannot solve the conflict');
  modal.querySelector('#mrv-search').value = 'Riformulazione';
  await modal.querySelector('#mrv-search').oninput();
  await modal.querySelector('[data-decision-conflict] button').click();
  assert.equal(modal.querySelector('#mrv-search').value, '', 'opening the other choice clears filters that would hide it');
  assert.match(modal.querySelector('#mrv-current-title').textContent, /Il testo nega/);
  await modal.querySelector('[data-review-filter="pending"]').click();
  for (let n = 0; n < 2; n++) {
    const keep = modal.querySelectorAll('[data-review-choice="reject"]').find(b => b.textContent === 'Conserva l’altra scelta');
    assert.ok(keep); await keep.click(); await tick();
  }
  assert.match(modal.querySelector('#mrv-filter-count').textContent, /0 da rivedere/);
  assert.equal(m.review.initial.decisions.teacher.text, 'Il testo scritto dal docente.');
  assert.equal(Core.preview(m.review, h.st.db).db.nodes[0].desc, 'Il testo scritto dal docente.');
  assert.equal(m.review.initial.checkStatus, 'incomplete', 'resolving choices does not fabricate model coverage');
  assert.deepEqual(h.st.db, DB, 'nothing is applied to the map before final confirmation');
  const reload = runtime(), reopened = reload.R.open('/vault', clone(h.saved.manifest));
  assert.match(reopened.querySelector('#mrv-filter-count').textContent, /0 da rivedere/);
});

test('already chosen actions remain actionable when structurally invalid or conflicting', async () => {
  const items = [{ id: 'q', kind: 'mc', question: 'Chi?', options: ['Germania', 'Svizzera'], correctIndex: 9 }];
  const issue = { id: 'key', target: { kind: 'item', id: 'q', field: 'correctIndex' }, after: 0, problem: 'Chiave non valida' };
  const m = finalManifest(items, [issue]), h = runtime();
  m.review.final.review = Core.setDecision(m.review.final.review, 'key', 'reject');
  const modal = h.R.open('/vault', m, { final: true });
  assert.equal(modal.querySelectorAll('.pm-section').length, 1, 'rejecting a broken key cannot hide the blocker');
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Applica la proposta').click();
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  const conflict = runtime(), conflicting = manifest(Core.setDecision(initial(), 'issue', 'manual', { text: '' }));
  const other = conflict.R.open('/vault', conflicting);
  assert.equal(other.querySelectorAll('.pm-section').length, 1, 'an invalid manual replacement still needs attention');
});

test('all decisions made retains a compact check warning and optional manual confirmation without reopening resolved issues', () => {
  const h = runtime(), m = manifest(Core.setDecision(initial({ checkStatus: 'incomplete', copertura: {
    nodiSaltati: [{ id: 'a', label: 'Germania', motivo: 'Fuori dal controllo' }],
    linkSaltati: [{ source: 'a', target: 'b', rel: 'richiede', motivo: 'Prova mancante' }]
  }, issues: [
    { id: 'done', target: { kind: 'node', id: 'a', field: 'desc' }, after: 'Dopo.', problem: 'Già decisa' }
  ] }), 'done', 'accept'));
  const before = clone(m), modal = h.R.open('/vault', m);
  assert.equal(modal.querySelectorAll('.pm-section').length, 0);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.match(h.dom.text(), /Tutte le segnalazioni hanno una decisione/);
  const unchecked = modal.querySelector('#mrv-unchecked');
  assert.match(unchecked.textContent, /2/);
  assert.doesNotMatch(unchecked.textContent, /Germania|Svizzera|Fuori dal controllo|Prova mancante/);
  assert.equal(unchecked.querySelectorAll('li,details').length, 0);
  assert.equal(modal.querySelector('#mrv-manual-option').getAttribute('open'), undefined);
  assert.equal(modal.querySelector('#mrv-filters').hidden, false, 'existing resolved decisions remain accessible through the filters');
  assert.equal(m.review.initial.status, 'awaiting_review');
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
});

test('reading an unreported node does not create a decision or write to the project', async () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'completed', issues: [] }));
  const modal = h.R.open('/vault', m), box = modal.querySelector('#mrv-other-nodes');
  const selects = box.querySelectorAll('select'), nodeSelect = selects[1], field = selects[0];
  nodeSelect.value = 'b'; nodeSelect.onchange();
  assert.match(box.textContent, /Altro testo\./);
  field.value = 'label'; field.onchange();
  assert.equal(m.review.initial.issues.length, 0); assert.equal(h.calls.manifest, 0);
  await box.querySelector('#mrv-add-node').click(); await tick();
  assert.equal(m.review.initial.issues.length, 1); assert.equal(m.review.initial.issues[0].target.field, 'label');
  assert.match(modal.querySelector('[data-review-filter="pending"]').textContent, /\(1\)/);
});

function materialRetryFixture(opts = {}) {
  const h = runtime(opts), items = Array.from({ length: 105 }, (_, i) => ({ id: 'saved-' + i, kind: 'flashcard',
    question: 'Domanda salvata ' + i + '?', answer: 'Risposta salvata ' + i + '.' }));
  const issues = [0, 1, 2].map(i => ({ id: 'prior-' + i, target: { kind: 'item', id: items[i].id, field: 'answer' },
    after: 'Proposta precedente ' + i + '.', problem: 'Segnalazione precedente ' + i + '.' }));
  const m = finalManifest(items, issues);
  m.config.aiContext = { provider: 'google', model: 'saved-model' };
  m.review.final.review.initial.checkStatus = 'incomplete';
  m.review.final.review.initial.report = { checkStatus: 'incomplete', issues, coverage: { expectedIds: items.map(i => i.id),
    checkedIds: [], skipped: items.map(i => ({ id: i.id, reason: 'HTTP 400: schema non valido' })) },
    batches: [{ ids: items.slice(0, 12).map(i => i.id), status: 'incomplete', error: 'HTTP 400: schema non valido' }] };
  m.review.final.review = Core.setDecision(Core.setDecision(Core.setDecision(m.review.final.review,
    'prior-0', 'reject'), 'prior-1', 'accept'), 'prior-2', 'manual', { text: 'Rettifica conservata del docente.' });
  m.review.final.review.initial.previousReports = [{ checkStatus: 'unavailable', reason: 'Prima interruzione' }];
  m.review.drafts = { B: { sets: [{ id: 'saved-set', items: clone(items) }] } };
  h.st.db.studySets = [{ id: 'existing-set', items: [{ question: 'Attività precedente' }] }];
  h.st._pipelineManifest = m;
  h.st._reviewAIContext = { provider: 'infomaniak', model: 'caller-model' };
  h.st._generationSources = [{ title: 'Fonte estranea corrente', content: 'Contenuto di un altro contesto.' }];
  h.calls.material = 0; h.calls.generation = 0; h.calls.export = 0; h.calls.grounding = 0; h.calls.filePaths = [];
  const save = h.window.electronAPI.saveVaultFile;
  h.window.electronAPI.saveVaultFile = args => { h.calls.filePaths.push(args.relPath); return save(args); };
  const forbidden = name => async () => { h.calls.generation++; throw new Error('Generatore inatteso: ' + name); };
  ['generateDynamicQuiz', 'generateBranchSynthesisWithAI', 'executeJudgePass', 'fetchModelAPI'].forEach(name => { h.window[name] = forbidden(name); });
  h.window.MappAIMaterialDrafts = { flatten: forbidden('flatten') };
  h.window.electronAPI.htmlToPdf = async () => { h.calls.export++; throw new Error('Export inatteso'); };
  h.window.MappAIGroundingCore = { buildInput: (db, nodes, sources, review, options) => {
    h.calls.grounding++;
    assert.deepEqual(clone(db), h.st.db); assert.deepEqual(clone(nodes), h.st.db.nodes);
    assert.equal(review, m.review); assert.deepEqual(clone(sources), SOURCES);
    assert.equal(options.includeOriginalPages, true);
    return { material: 'Riferimento approvato e passaggi originali.', sourcesArr: [{ id: 'src-book', title: 'Libro.pdf', page: 4, text: 'dopo.' }] };
  } };
  h.materialCheck = async (checked, checkOpts) => {
    assert.deepEqual(clone(checked), items);
    assert.deepEqual(clone(h.st._reviewAIContext), m.config.aiContext);
    assert.deepEqual(clone(checkOpts.aiContext), m.config.aiContext);
    assert.equal(checkOpts.apiKey, 'mock-key'); assert.equal(checkOpts.review, m.review);
    assert.equal(checkOpts.material.sourcesArr[0].title, 'Libro.pdf');
    return { checkStatus: 'completed', coverage: { expectedIds: items.map(i => i.id), checkedIds: items.map(i => i.id), skipped: [] }, issues: [
      { id: 'fresh', target: { kind: 'item', id: items[3].id, field: 'answer' }, after: 'Nuova proposta.', problem: 'Da decidere dopo il nuovo controllo.' }
    ] };
  };
  h.window.MappAIMaterialReview = { ...Material, checkRemaining: async (...args) => {
    assert.equal(args[1].previousReport, h.m?.review.final.review.initial.report || m.review.final.review.initial.report);
    h.calls.material++; return h.materialCheck(...args);
  } };
  return Object.assign(h, { m, items });
}

test('G2 retry checks the 105 saved items once, preserving decisions, original sources and frozen model without generating or exporting', async () => {
  const h = materialRetryFixture(), old = h.m.review.final.review, beforeDb = clone(h.st.db), beforeItems = clone(h.m.review.final.items),
    beforeDrafts = clone(h.m.review.drafts), priorContext = h.st._reviewAIContext, priorSources = h.st._generationSources;
  const check = h.materialCheck;
  h.materialCheck = async (...args) => {
    const report = await check(...args);
    report.issues.push(...old.initial.issues.map(i => ({ ...clone(i), id: i.id + '-again', problem: 'Stessa proposta riformulata.' })));
    return report;
  };
  await h.R.retryMaterialJudge('/vault', h.m);
  const next = h.m.review.final.review;
  assert.equal(h.calls.material, 1); assert.equal(h.calls.grounding, 1);
  assert.deepEqual(clone(next.initial.decisions), old.initial.decisions);
  old.initial.issues.forEach(issue => assert.deepEqual(clone(next.initial.issues.find(i => i.id === issue.id)), issue));
  assert.ok(next.initial.issues.some(i => i.id === 'fresh'));
  assert.equal(next.initial.issues.length, old.initial.issues.length + 1, 'only the genuinely new finding needs a decision');
  assert.deepEqual(clone(next.initial.previousReports), old.initial.previousReports.concat([old.initial.report]));
  assert.equal(next.initial.checkStatus, 'completed'); assert.equal(next.initial.status, 'awaiting_review');
  assert.equal(h.m.review.final.stage, 'awaiting_review');
  assert.deepEqual(clone(h.st.db), beforeDb); assert.deepEqual(clone(h.m.review.final.items), beforeItems);
  assert.deepEqual(clone(h.m.review.drafts), beforeDrafts);
  assert.equal(h.st._reviewAIContext, priorContext); assert.equal(h.st._generationSources, priorSources);
  assert.equal(h.calls.map, 0); assert.equal(h.calls.pipeline, 0); assert.equal(h.calls.generation, 0); assert.equal(h.calls.export, 0);
  assert.deepEqual(h.calls.filePaths, ['pipeline.json']);
  assert.equal(h.saved.manifest.review.final.review.initial.checkStatus, 'completed');
});

test('G2 retry refuses a different project, an edited approved map, altered saved items or a final stage already applying', async () => {
  for (const fault of ['project', 'map', 'items', 'stage']) {
    const h = materialRetryFixture(), old = h.m.review.final.review;
    if (fault === 'project') h.st.activeVaultPath = '/other';
    if (fault === 'map') h.st.db.nodes[0].desc = 'Modifica dopo approvazione';
    if (fault === 'items') h.m.review.final.items[0].answer = 'Modifica non rivista';
    if (fault === 'stage') h.m.review.final.stage = 'applying';
    await assert.rejects(h.R.retryMaterialJudge('/vault', h.m), undefined, fault);
    assert.equal(h.calls.material, 0, fault); assert.equal(h.calls.manifest, 0, fault);
    assert.equal(h.m.review.final.review, old, fault);
  }
});

test('G2 retry discards a late result after project, map or item mutation and always restores caller model context', async () => {
  for (const fault of ['project', 'map', 'items', 'provider-error']) {
    const h = materialRetryFixture(), old = h.m.review.final.review, context = h.st._reviewAIContext;
    let resolveCheck, started;
    const entered = new Promise(resolve => { started = resolve; });
    h.materialCheck = async () => { started(); return new Promise((resolve, reject) => { resolveCheck = fault === 'provider-error' ? reject : resolve; }); };
    const pending = h.R.retryMaterialJudge('/vault', h.m);
    await entered;
    if (fault === 'project') h.st.activeVaultPath = '/other';
    if (fault === 'map') h.st.db.links[0].rel = 'Modificato durante il controllo';
    if (fault === 'items') h.m.review.final.items[0].answer = 'Modificata durante il controllo';
    resolveCheck(fault === 'provider-error' ? new Error('Provider HTTP 400') : { checkStatus: 'completed', issues: [] });
    await assert.rejects(pending, undefined, fault);
    assert.equal(h.calls.material, 1); assert.equal(h.calls.manifest, 0, fault);
    assert.equal(h.m.review.final.review, old, fault); assert.equal(h.st._reviewAIContext, context, fault);
  }
});

test('G2 retry rolls back a failed manifest write and remains retryable without losing decisions or duplicating report history', async () => {
  const h = materialRetryFixture({ failSave: true }), old = h.m.review.final.review, context = h.st._reviewAIContext;
  await assert.rejects(h.R.retryMaterialJudge('/vault', h.m), /Disco non disponibile/);
  assert.equal(h.m.review.final.review, old); assert.equal(h.m.review.final.stage, 'awaiting_review');
  assert.equal(old.initial.checkStatus, 'incomplete'); assert.equal(h.st._reviewAIContext, context);
  h.opts.failSave = false;
  await h.R.retryMaterialJudge('/vault', h.m);
  assert.equal(h.calls.material, 2); assert.equal(h.calls.map, 0); assert.equal(h.calls.generation, 0);
  assert.equal(h.m.review.final.review.initial.previousReports.length, 2);
  assert.deepEqual(clone(h.m.review.final.review.initial.decisions), old.initial.decisions);
  assert.equal(h.saved.manifest.review.final.review.initial.checkStatus, 'completed');
});

test('G2 incomplete review offers material retry, freezes controls and retains a retryable dialog after provider failure', async () => {
  const h = materialRetryFixture(), modal = h.R.open('/vault', h.m, { final: true });
  const retry = modal.querySelector('#mrv-retry-judge');
  assert.ok(retry); assert.equal(retry.textContent, 'Riprova il controllo automatico dei residui');
  retry.focus();
  const confirmation = modal.querySelector('#mrv-manual-confirm');
  assert.ok(confirmation); assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  modal.querySelector('#mrv-manual-option').setAttribute('open', '');
  confirmation.checked = true; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  confirmation.checked = false; confirmation.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  let failCheck, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  h.materialCheck = async () => { entered(); return new Promise((_, reject) => { failCheck = reject; }); };
  const pending = retry.click(); await ready;
  assert.equal(modal.getAttribute('aria-busy'), 'true');
  assert.ok(modal.querySelectorAll('button,input,textarea,select').every(el => el.disabled));
  failCheck(new Error('HTTP 400: schema non valido')); await pending;
  assert.ok(h.dom.document.getElementById('mappai-teacher-review'));
  assert.match(modal.querySelector('#mrv-status').textContent, /HTTP 400/);
  assert.equal(retry.disabled, false); assert.equal(modal.getAttribute('aria-busy'), 'false');
  h.materialCheck = async () => ({ checkStatus: 'completed', issues: [] });
  await retry.click();
  assert.equal(h.m.review.final.review.initial.checkStatus, 'completed');
  assert.equal(modal.querySelector('#mrv-retry-judge'), null);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.equal(h.dom.document.activeElement.id, 'mrv-title', 'retry rerender restores dialog focus instead of leaving it on a removed button');
  assert.equal(h.calls.pipeline, 0); assert.equal(h.calls.map, 0); assert.equal(h.calls.export, 0);
});

test('G2 cannot spend another model call while a teacher decision has an unresolved save failure', async () => {
  const h = materialRetryFixture({ failSave: true }), modal = h.R.open('/vault', h.m, { final: true });
  await modal.querySelector('[data-review-filter="decided"]').click();
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Annulla decisione').click();
  assert.equal(modal.querySelector('#mrv-save-retry').hidden, false);
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(h.calls.material, 0); assert.equal(h.m.review.final.review.initial.checkStatus, 'incomplete');
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
});

test('G2 exposes every unchecked material without creating findings or modifying the manifest', () => {
  const h = materialRetryFixture();
  h.m.review.final.review.initial.issues = [];
  h.m.review.final.review.initial.decisions = {};
  const before = clone(h.m), modal = h.R.open('/vault', h.m, { final: true });
  const unchecked = modal.querySelector('#mrv-unchecked');
  assert.ok(unchecked, 'skipped material checks remain visible even when no correction issue was returned');
  assert.match(unchecked.textContent, /105/);
  assert.equal(unchecked.querySelectorAll('li,details').length, 0);
  const details = modal.querySelector('#mrv-material-coverage');
  assert.equal(details.querySelectorAll('[data-coverage-item]').length, 105);
  assert.match(details.textContent, /Domanda salvata 104/);
  assert.match(details.textContent, /HTTP 400: schema non valido/);
  assert.match(details.textContent, /problema tecnico/);
  assert.equal(details.querySelector('.mrv-coverage-technical').getAttribute('open'), undefined);
  assert.doesNotMatch(h.dom.text(), /Nessuna proposta di correzione\. Puoi leggere i contenuti e continuare\./);
  assert.equal(modal.querySelector('#mrv-filters').hidden, true);
  assert.equal(modal.querySelector('#mrv-filter-count').hidden, true);
  assert.ok(modal.querySelector('#mrv-manual-confirm'));
  assert.ok(modal.querySelector('#mrv-retry-judge'));
  const manualOption = modal.querySelector('#mrv-manual-option');
  assert.equal(manualOption.getAttribute('open'), undefined);
  assert.equal(manualOption.querySelector('#mrv-retry-judge'), null, 'retry is immediately available outside the optional manual path');
  assert.ok(h.dom.html().indexOf('id="mrv-retry-judge"') < h.dom.html().indexOf('id="mrv-manual-option"'));
  assert.deepEqual(clone(h.m), before); assert.equal(h.calls.manifest, 0);
  assert.equal(h.m.review.final.review.initial.report.coverage.skipped.length, 105);
  assert.equal(h.m.review.final.review.initial.report.coverage.skipped[104].reason, 'HTTP 400: schema non valido');
});

test('G2 retry preserves an unfinished invalid numeric edit and does not call the judge', async () => {
  const h = runtime(), items = [{ id: 'open-1', kind: 'open', question: 'Perché?', guide: 'Spiega il rapporto causale.',
    criteria: ['Indica una causa e la sua conseguenza.'], lines: 8 }];
  const m = finalManifest(items, [{ id: 'line-count', target: { kind: 'item', id: 'open-1', field: 'lines' },
    after: 10, problem: 'Spazio di risposta da rivedere.' }]);
  m.review.final.review.initial.checkStatus = 'incomplete'; h.st._pipelineManifest = m;
  let judgeCalls = 0;
  h.window.MappAIGroundingCore = { buildInput: () => ({ material: 'Fonte della lezione.' }) };
  h.window.MappAIMaterialReview = { ...Material, check: async () => { judgeCalls++; return { checkStatus: 'completed', issues: [] }; } };
  const modal = h.R.open('/vault', m, { final: true });
  await modal.querySelectorAll('[data-actions] button').find(b => b.textContent === 'Modifica il testo').click(); await tick();
  const input = modal.querySelector('[data-editor] input[type="number"]');
  input.value = '4.5'; input.oninput();
  const savedBeforeRetry = clone(h.saved.manifest), writesBeforeRetry = h.calls.manifest;
  await modal.querySelector('#mrv-retry-judge').click();
  assert.equal(judgeCalls, 0); assert.equal(h.calls.manifest, writesBeforeRetry);
  assert.equal(modal.querySelector('[data-editor] input[type="number"]'), input);
  assert.equal(input.isConnected, true); assert.equal(input.value, '4.5');
  assert.equal(modal.querySelector('#mrv-continue').disabled, true);
  assert.match(modal.querySelector('#mrv-status').textContent, /Completa il campo/);
  assert.deepEqual(clone(h.saved.manifest), savedBeforeRetry);
  assert.equal(m.review.final.items[0].lines, 8);
});

function dashboardReview(count = 3, incomplete = false) {
  const h = runtime();
  h.st.db = { nodes: Array.from({ length: count }, (_, i) => ({ id: 'n' + i, label: 'Concetto ' + (i + 1), desc: 'Testo originale ' + i })), links: [], sourcesDict: {} };
  const r = Core.createReview({ db: h.st.db, sources: SOURCES, report: {
    checkStatus: incomplete ? 'incomplete' : 'completed',
    issues: h.st.db.nodes.map((n, i) => ({ id: 'd' + i, target: { kind: 'node', id: n.id, field: 'desc' },
      after: 'Testo corretto ' + i, problem: 'Verifica del concetto ' + (i + 1) }))
  } });
  const m = manifest(r), modal = h.R.open('/vault', m);
  return { ...h, m, modal };
}
const currentCard = modal => modal.querySelector('[data-review-card]:not([hidden])');

test('dashboard keeps fifty findings in a navigable queue, displays one card and advances only after saving', async () => {
  const h = dashboardReview(50), { modal } = h;
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 50);
  assert.equal(modal.querySelectorAll('[data-review-card]:not([hidden])').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  assert.equal(modal.querySelector('#mrv-prev').disabled, true);
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();
  assert.equal(h.saved.manifest.review.initial.decisions.d0.choice, 'accept');
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 49);
  assert.equal(modal.querySelector('#mrv-progress-label').textContent, '1 / 50 segnalazioni decise');
  assert.equal(modal.querySelector('#mrv-progress').getAttribute('value'), '2');
  assert.equal(h.dom.document.activeElement.id, 'mrv-current-title');
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd2');
  await modal.querySelector('#mrv-prev').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');
  const before = h.calls.manifest;
  await modal.querySelector('[data-review-issue=d40]').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd40');
  assert.equal(h.calls.manifest, before, 'navigation is read-only');
});

test('dashboard search spans concept and content, restores the queue and never changes decisions', async () => {
  const h = dashboardReview(), { modal } = h, search = modal.querySelector('#mrv-search');
  search.value = 'concetto 3'; await search.oninput();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd2');
  search.value = 'originale 0'; await search.oninput();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  search.value = 'nessun risultato'; await search.oninput();
  assert.equal(currentCard(modal), null);
  assert.match(modal.querySelector('#mrv-filter-empty').textContent, /Nessuna segnalazione/);
  search.value = ''; await search.oninput();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 3);
  assert.equal(h.calls.manifest, 0);
  assert.deepEqual(h.m.review.initial.decisions, {});
});

test('dashboard preserves a manual draft while switching cards and exposes the saved outcome in its queue', async () => {
  const h = dashboardReview(), { modal } = h;
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea');
  input.value = 'Una spiegazione scritta dal docente.'; input.oninput(); await tick();
  assert.match(modal.querySelector('[data-review-issue=d0] .mrv-queue-state').textContent, /modificato da te/);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value, 'reopening the editor does not reset the draft');
  await modal.querySelector('#mrv-next').click();
  await modal.querySelector('[data-review-filter=decided]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.initial.decisions.d0.text, input.value);
  await currentCard(modal).querySelector('[data-review-choice=pending]').click();
  await modal.querySelector('[data-review-filter=pending]').click();
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 3);
});

test('dashboard does not navigate away from failed saves or invalid numeric edits', async () => {
  const h = dashboardReview(), { modal } = h;
  h.opts.failSave = true;
  await currentCard(modal).querySelector('[data-review-choice=accept]').click();
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd0');
  h.opts.failSave = false;
  await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('#mrv-next').click();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'd1');

  const j = runtime(), items = [{ id: 'q1', kind: 'open', question: 'Perché?', lines: 4 }, { id: 'q2', kind: 'open', question: 'Come?', lines: 6 }];
  const m = finalManifest(items, items.map((item, i) => ({ id: 'lines' + i, target: { kind: 'item', id: item.id, field: 'lines' }, after: 8, problem: 'Spazio per la risposta ' + i })));
  const other = j.R.open('/vault', m, { final: true });
  await currentCard(other).querySelector('[data-review-choice=manual]').click();
  const number = currentCard(other).querySelector('input[type=number]'); number.value = ''; number.oninput();
  await other.querySelector('#mrv-next').click();
  const search = other.querySelector('#mrv-search'); search.value = 'Come'; await search.oninput();
  assert.equal(currentCard(other).getAttribute('data-review-card'), 'lines0');
  assert.equal(number.value, ''); assert.equal(search.value, '');
  assert.equal(other.querySelector('#mrv-continue').disabled, true);
});

test('dashboard separates complete decisions from incomplete AI coverage and reveals the remaining step', async () => {
  const h = dashboardReview(1, true), { modal } = h;
  assert.equal(modal.querySelector('#mrv-coverage-options').getAttribute('open'), undefined);
  await currentCard(modal).querySelector('[data-review-choice=reject]').click();
  assert.equal(modal.querySelector('#mrv-progress').getAttribute('value'), '100');
  assert.equal(modal.querySelector('#mrv-coverage-label').textContent, 'Parziale');
  assert.notEqual(modal.querySelector('#mrv-coverage-options').getAttribute('open'), undefined);
  assert.match(modal.querySelector('#mrv-next-step').textContent, /Resta da completare il controllo/);
  assert.equal(modal.querySelector('#mrv-continue').hidden, true);
  const confirm = modal.querySelector('#mrv-manual-confirm'); confirm.checked = true; confirm.onchange();
  assert.equal(modal.querySelector('#mrv-continue').hidden, false);
  assert.match(modal.querySelector('#mrv-next-step').textContent, /creare i materiali/);
});

test('adding an unreported node clears search and opens the newly added decision', async () => {
  const h = runtime(), m = manifest(), modal = h.R.open('/vault', m);
  const search = modal.querySelector('#mrv-search'); search.value = 'Germania'; await search.oninput();
  const select = modal.querySelector('#mrv-other-nodes label select'); select.value = 'b'; select.onchange();
  await modal.querySelector('#mrv-add-node').click();
  assert.equal(search.value, '');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  const teacher = m.review.initial.issues.find(i => i.origin === 'teacher');
  assert.equal(currentCard(modal).getAttribute('data-review-card'), teacher.id);
  assert.equal(h.saved.manifest.review.initial.issues.length, 2);
  assert.equal(h.dom.document.activeElement.id, 'mrv-current-title');
});

test('reopening a manually approved dashboard describes approval without requesting unavailable check actions', () => {
  const h = runtime();
  let r = initial({ checkStatus: 'incomplete', issues: [] });
  const result = Core.beginApproval(r, DB, { manualReview: true });
  r = Core.completeApproval(result.review, result.revision);
  const modal = h.R.open('/vault', manifest(r));
  assert.match(modal.querySelector('#mrv-next-step').textContent, /revisione è approvata/);
  assert.match(modal.querySelector('#mrv-coverage-status').textContent, /completata dal docente/);
  assert.equal(modal.querySelector('#mrv-manual-confirm'), null);
  assert.equal(modal.querySelector('#mrv-continue').textContent, 'Chiudi');
});

function contextualDashboard() {
  const h = runtime();
  h.st.db = { ...clone(DB), customColors: { 1: '#ffe899', 2: 'rgb(0, 120, 90)' },
    nodes: DB.nodes.map((node, i) => ({ ...node, level: 1, group: String(i + 1) })) };
  const base = Core.createReview({ db: h.st.db, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  const approved = Core.beginApproval(base, h.st.db), m = manifest(Core.completeApproval(approved.review, approved.revision));
  const items = [
    { id: 'mc', kind: 'mc', question: 'Domanda a scelta multipla', options: ['A', 'B'], correctIndex: 0, explanation: 'Prima del conflitto.', ramo: 'Germania' },
    { id: 'open', kind: 'open', question: 'Domanda da sviluppare', guide: 'Spiega perché.', explanation: 'Prima del conflitto.', areas: ['Germania', 'Svizzera'], lines: 4 },
    { id: 'card', kind: 'flashcard', question: 'Che cosa accadde?', answer: 'Accadde un evento.', ramo: 'Svizzera' }
  ];
  const evidence = [{ source: 'Libro.pdf', page: 4, text: 'La fonte dice: dopo.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }];
  const issues = items.map((item, i) => ({ id: 'context-' + item.id, target: { kind: 'item', id: item.id, field: i === 2 ? 'answer' : 'explanation' },
    after: i === 2 ? 'Accadde questo evento.' : 'Dopo il conflitto.', problem: 'Motivo ' + i,
    type: i === 2 ? 'editorial' : 'semantic', evidence: clone(evidence) }));
  m.review.final = { stage: 'awaiting_review', items, review: Core.createReview({ db: { items }, sources: SOURCES, report: { checkStatus: 'completed', issues } }) };
  const modal = h.R.open('/vault', m, { final: true });
  return { ...h, m, modal };
}

test('context chips preserve map colors and group only the identical correction backed by the same verified source', async () => {
  const h = contextualDashboard(), { modal } = h, before = clone(h.m);
  const card = currentCard(modal);
  assert.equal(modal.querySelectorAll('[data-review-card]').length, 2, 'same literal correction can group despite different explanations of the problem');
  assert.match(card.querySelector('[data-area-chip="1"] .mrv-area-dot').getAttribute('style'), /#ffe899/);
  assert.match(card.querySelector('[data-area-chip="2"] .mrv-area-dot').getAttribute('style'), /rgb\(0, 120, 90\)/);
  assert.ok(card.querySelector('[data-material-chip=mc]'));
  assert.ok(card.querySelector('[data-material-chip=open]'));
  assert.equal(card.querySelectorAll('[data-review-targets] li').length, 2);
  assert.equal(card.querySelector('[data-change=before]').textContent, 'Prima del');
  assert.equal(card.querySelector('[data-change=after]').textContent, 'Dopo il');
  assert.match(card.querySelector('[data-evidence-excerpt]').textContent, /La fonte dice: dopo\./);
  assert.match(card.querySelector('[data-evidence-excerpt]').textContent, /Libro.pdf · Pagina 4/);
  assert.deepEqual(clone(h.m), before, 'displaying context must not mutate revisions or drafts');
  await card.querySelector('[data-review-choice=accept]').click();
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].choice, 'accept');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'].choice, 'accept');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-card'], undefined);
});

test('area, material and reason filters combine before grouping and an action affects only visible targets', async () => {
  const h = contextualDashboard(), { modal } = h;
  const area = modal.querySelector('#mrv-area'), kind = modal.querySelector('#mrv-kind'), reason = modal.querySelector('#mrv-reason');
  area.value = '2'; await area.onchange();
  assert.equal(h.dom.document.activeElement, area);
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  kind.value = 'open'; await kind.onchange();
  assert.equal(h.dom.document.activeElement, kind);
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'context-open');
  assert.match(reason.querySelector('option[value=semantic]').textContent, /\(1\)/);
  reason.value = 'editorial'; await reason.onchange();
  assert.equal(currentCard(modal), null);
  assert.match(modal.querySelector('#mrv-filter-empty').textContent, /filtri/);
  reason.value = ''; await reason.onchange();
  await currentCard(modal).querySelector('[data-review-choice=reject]').click();
  assert.equal(h.m.review.final.review.initial.decisions['context-open'].choice, 'reject');
  assert.equal(h.m.review.final.review.initial.decisions['context-mc'], undefined);
  await modal.querySelector('#mrv-clear-filters').click();
  assert.equal(area.value, ''); assert.equal(kind.value, ''); assert.equal(reason.value, '');
  assert.equal(modal.querySelectorAll('[data-review-issue]').length, 2);
  assert.match(kind.querySelector('option[value=mc]').textContent, /\(1\)/);
});

test('changing facets preserves a saved manual draft and does not reset the current decision', async () => {
  const h = contextualDashboard(), { modal } = h, kind = modal.querySelector('#mrv-kind');
  kind.value = 'mc'; await kind.onchange();
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Rettifica scelta dal docente.'; input.oninput(); await tick();
  kind.value = 'flashcard'; await kind.onchange();
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'context-card');
  await modal.querySelector('[data-review-filter=decided]').click();
  kind.value = 'mc'; await kind.onchange();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].text, input.value);
});

test('new retry findings and retained decisions are explained without counting paraphrased duplicates as new', async () => {
  const h = materialRetryFixture(), old = h.m.review.final.review;
  const check = h.materialCheck;
  h.materialCheck = async (...args) => {
    const report = await check(...args);
    report.retrySummary = { targeted: 3, reused: 102, remaining: 0 };
    report.issues.push(...old.initial.issues.map(i => ({ ...clone(i), id: i.id + '-copy', problem: 'Obiezione riformulata.' })));
    return report;
  };
  const modal = h.R.open('/vault', h.m, { final: true });
  await modal.querySelector('#mrv-retry-judge').click();
  assert.deepEqual(clone(h.m.review.final.review.initial.retrySummary.newIssueIds), ['fresh']);
  const summary = modal.querySelector('#mrv-retry-summary');
  assert.match(summary.textContent, /1 nuove segnalazioni/);
  assert.match(summary.textContent, /3 materiali sottoposti al tentativo/);
  assert.match(summary.textContent, /102 controlli riutilizzati/);
  assert.ok(modal.querySelector('[data-review-issue=fresh] .mrv-new-finding'));
  assert.equal(h.saved.manifest.review.final.review.initial.retrySummary.newIssueIds.length, 1);
});

test('shared changes keep separate groups when evidence, changed field or proposal differs', () => {
  const h = contextualDashboard(), issues = h.m.review.final.review.initial.issues;
  const first = clone(issues[0]);
  const changedEvidence = { ...clone(first), id: 'other-evidence', evidence: [{ ...first.evidence[0], text: 'Un passaggio diverso.' }] };
  const changedProposal = { ...clone(first), id: 'other-proposal', after: 'Durante il conflitto.' };
  const changedField = { ...clone(first), id: 'other-field', target: { ...first.target, field: 'question' } };
  assert.equal(h.R.groupIssues([first, changedEvidence, changedProposal, changedField]).length, 4);
});

test('numeric MC keys remain separate even with identical indices, source evidence and problem text', () => {
  const h = runtime();
  const row = { before: 0, after: 1, hasProposal: true, type: 'semantic', problem: 'La chiave non corrisponde alla fonte.',
    evidence: [{ text: 'Guisan guidò l’esercito, Wahlen l’agricoltura.', quotationMatched: true, verifiedAgainst: 'archived-source-text' }] };
  assert.equal(h.R.groupIssues(['mc-a', 'mc-b'].map(id => ({ ...row, id, target: { kind: 'item', id, field: 'correctIndex' } }))).length, 2);
});

test('first phase reasons retain the actual judge categories and support filtering them', async () => {
  const h = runtime(), types = ['termine-sostituito', 'nesso-non-nella-fonte', 'fatto-contraddetto', 'unsupported-link', 'soggetto-invertito', 'data-attribuita-male'];
  const review = initial({ checkStatus: 'completed', issues: types.map((type, i) => ({ id: 'reason-' + i, type,
    target: { kind: 'node', id: 'a', field: 'desc' }, problem: 'Verifica ' + i })) });
  const modal = h.R.open('/vault', manifest(review)), filter = modal.querySelector('#mrv-reason');
  for (const type of types) {
    assert.ok(filter.querySelector('option[value="' + type + '"]'));
    filter.value = type; await filter.onchange();
    assert.equal(modal.querySelectorAll('[data-review-issue]').length, 1);
    assert.equal(currentCard(modal).querySelector('[data-review-reason]').getAttribute('data-review-reason'), type);
  }
});

test('a link targeted by ID shows its real concept names, including D3 object endpoints', () => {
  const h = runtime();
  h.st.db.links[0].id = 'cross-link';
  h.st.db.links[0].source = h.st.db.nodes[0];
  h.st.db.links[0].target = h.st.db.nodes[1];
  const review = Core.createReview({ db: h.st.db, sources: SOURCES, report: { checkStatus: 'completed', issues: [
    { id: 'link-finding', target: { kind: 'link', id: 'cross-link', field: 'rel' }, after: 'condiziona', problem: 'Verifica il rapporto.' }
  ] } });
  const modal = h.R.open('/vault', manifest(review));
  assert.match(currentCard(modal).textContent, /Germania → richiede → Svizzera/);
  assert.match(currentCard(modal).textContent, /Germania → condiziona → Svizzera/);
  assert.doesNotMatch(currentCard(modal).textContent, /Concetto non disponibile/);
});

async function searchMaterials(modal, query, mode = 'words') {
  modal.querySelector('#mrv-occurrence-query').value = query;
  modal.querySelector('#mrv-occurrence-mode').value = mode;
  await modal.querySelector('#mrv-occurrence-search').click();
  return modal.querySelectorAll('[data-occurrence-item]');
}

test('individual decisions remain separate after closing and reopening the review', async () => {
  const h = contextualDashboard();
  await searchMaterials(h.modal, 'conflitto');
  await h.modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  await currentCard(h.modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(h.modal).querySelector('textarea'); input.value = 'Correzione individuale MC.'; input.oninput(); await tick();
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'context-open', 'reject');
  const reopened = h.R.open('/vault', h.m, { final: true });
  await reopened.querySelector('[data-review-filter=decided]').click();
  assert.equal(reopened.querySelectorAll('[data-review-issue]').length, 2);
  await reopened.querySelector('[data-review-issue=context-mc]').click();
  assert.equal(currentCard(reopened).querySelector('[data-review-targets]'), null);
  await currentCard(reopened).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(reopened).querySelector('textarea').value, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'].choice, 'reject');
});

test('reopening occurrence results refreshes edited text without replacing the active editor', async () => {
  const h = contextualDashboard(), { modal } = h;
  await searchMaterials(modal, 'conflitto');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Scelta individuale.'; input.oninput(); await tick();
  const details = modal.querySelector('#mrv-occurrences'); details.open = true; details.ontoggle();
  assert.equal(modal.querySelector('[data-occurrence-item=mc]'), null);
  assert.ok(modal.querySelector('[data-occurrence-item=open]'));
  assert.equal(currentCard(modal).querySelector('textarea'), input);
  input.value = 'Il conflitto spiegato.'; input.oninput(); await tick();
  assert.ok(modal.querySelector('[data-occurrence-item=mc]'));
  assert.equal(currentCard(modal).querySelector('textarea'), input);
});

test('full material context shows canonical criteria and MC options without stale aliases', async () => {
  const h = runtime(), items = [
    { id: 'open', kind: 'open', question: 'Circuito?', guide: 'Spiega il circuito.', criteria: ['Criterio aggiornato.'], criteri: ['Criterio vecchio.'], lines: 5 },
    { id: 'mc', kind: 'mc', question: 'Circuito?', options: ['Opzione aggiornata.', 'Altra opzione.'], answer: 'Risposta vecchia.', correctIndex: 0 }
  ];
  const m = finalManifest(items), modal = h.R.open('/vault', m, { final: true });
  await searchMaterials(modal, 'Circuito');
  assert.match(modal.querySelector('[data-occurrence-item=open] .mrv-item-context').textContent, /Criterio aggiornato/);
  assert.doesNotMatch(modal.querySelector('[data-occurrence-item=open] .mrv-item-context').textContent, /Criterio vecchio/);
  assert.doesNotMatch(modal.querySelector('[data-occurrence-item=mc] .mrv-item-context').textContent, /Risposta vecchia/);
});

test('a short generated batch stays visible in material review after reopening', () => {
  const h = runtime(), m = finalManifest([{ id: 'mc', kind: 'mc', question: 'Circuito?', options: ['Sì', 'No'], correctIndex: 0 }]);
  m.review.drafts = { B: { 'mc-auto': { title: 'Quiz MC', generation: { requested: 12, produced: 9 } } } };
  const modal = h.R.open('/vault', m, { final: true });
  assert.match(modal.querySelector('#mrv-batch-coverage').textContent, /Quiz MC: 9 \/ 12/);
  assert.match(modal.querySelector('#mrv-batch-coverage').textContent, /alla generazione/);
});

test('occurrences include unflagged materials with the full exercise and do not turn matches into findings', async () => {
  const h = runtime(), items = [
    { id: 'mc', kind: 'mc', question: 'Quando avviene il corto circuito?', options: ['Con un filo diretto.', 'Con il circuito aperto.'], correctIndex: 0, explanation: 'Il corto circuito evita il carico.' },
    { id: 'open', kind: 'open', question: 'Giustifica il risultato.', guide: 'Spiega il corto circuito.', criteria: ['Spiega il corto circuito.'], lines: 5 },
    { id: 'synthesis', kind: 'synthesis', text: 'Il corto circuito: <img src=x onerror=alert(1)>.', title: 'Circuiti' }
  ];
  const m = finalManifest(items), before = clone(m), modal = h.R.open('/vault', m, { final: true });
  const results = await searchMaterials(modal, 'corto circuito');
  assert.equal(results.length, 3);
  assert.match(modal.querySelector('.mrv-occurrences-count').textContent, /3 materiali con corrispondenze · 3 materiali esaminati/);
  const mc = modal.querySelector('[data-occurrence-item=mc] .mrv-item-context');
  assert.match(mc.textContent, /Risposta corretta:[\s\n]*A\. Con un filo diretto/);
  assert.match(mc.textContent, /Spiegazione:[\s\n]*Il corto circuito evita il carico/);
  const open = modal.querySelector('[data-occurrence-item=open]');
  assert.ok(open.querySelector('[data-occurrence-edit=guide]'));
  assert.ok(open.querySelector('[data-occurrence-edit=criteria]'));
  assert.match(open.querySelector('.mrv-item-context').textContent, /Criteri di correzione/);
  assert.ok(modal.querySelector('[data-occurrence-item=mc] mark'));
  assert.equal(modal.querySelector('[data-occurrence-item=synthesis] img'), null);
  assert.match(modal.querySelector('[data-occurrence-item=synthesis]').textContent, /<img src=x/);
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
  assert.equal(h.dom.document.activeElement, modal.querySelector('#mrv-occurrence-results'));
});

test('editing a found occurrence isolates a previously grouped proposal and keeps other materials unchanged', async () => {
  const h = contextualDashboard(), { modal } = h;
  assert.equal(currentCard(modal).querySelectorAll('[data-review-targets] li').length, 2);
  await currentCard(modal).querySelector('[data-find-occurrences]').click();
  assert.match(modal.querySelector('.mrv-occurrences-source').textContent, /Motivo 0/);
  assert.equal(h.dom.document.activeElement, modal.querySelector('#mrv-occurrence-query'));
  await searchMaterials(modal, 'Prima conflitto');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  let card = currentCard(modal);
  assert.equal(card.getAttribute('data-review-card'), 'context-mc');
  assert.equal(card.querySelector('[data-review-targets]'), null, 'an individual edit must not inherit a shared action');
  await card.querySelector('[data-review-choice=manual]').click();
  const input = card.querySelector('textarea'); input.value = 'Spiegazione rettificata dal docente.'; input.oninput(); await tick();
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].text, input.value);
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-open'], undefined);
  assert.equal(h.m.review.final.items[0].explanation, 'Prima del conflitto.');
  const matches = await searchMaterials(modal, 'rettificata');
  assert.equal(matches.length, 1, 'search applies the saved edit while other findings remain pending');
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, input.value);
  assert.equal(h.m.review.final.review.initial.issues.length, 3);
});

test('moving from an accepted occurrence to manual editing starts from the chosen proposal', async () => {
  const h = contextualDashboard(), { modal } = h;
  h.m.review.final.review = Core.setDecision(h.m.review.final.review, 'context-mc', 'accept');
  const before = clone(h.m.review.final.review);
  const matches = await searchMaterials(modal, 'Dopo conflitto');
  assert.equal(matches.length, 1);
  await modal.querySelector('[data-occurrence-item=mc] [data-occurrence-edit=explanation]').click();
  assert.deepEqual(clone(h.m.review.final.review), before, 'opening an existing field is read-only');
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  assert.equal(currentCard(modal).querySelector('textarea').value, 'Dopo il conflitto.');
  assert.equal(h.saved.manifest.review.final.review.initial.decisions['context-mc'].text, 'Dopo il conflitto.');
  assert.equal(h.m.review.final.review.initial.decisions['context-open'], undefined);
});

test('an occurrence edit invalidates personal confirmation, persists once and exports only that field', async () => {
  const h = stalledMaterialFixture(), { m } = h, modal = h.R.open('/vault', m, { final: true });
  const initial = clone(m.review.final.review.initial.decisions);
  let confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  await searchMaterials(modal, 'Risposta 240');
  assert.equal(confirmation.checked, true, 'looking for matches is not a new decision');
  await modal.querySelector('[data-occurrence-item="material-240"] [data-occurrence-edit=answer]').click();
  assert.equal(modal.querySelector('#mrv-manual-confirm').checked, false);
  await currentCard(modal).querySelector('[data-review-choice=manual]').click();
  const input = currentCard(modal).querySelector('textarea'); input.value = 'Risposta controllata.'; input.oninput(); await tick();
  confirmation = modal.querySelector('#mrv-manual-confirm'); confirmation.checked = true; confirmation.onchange();
  await modal.querySelector('#mrv-continue').click();
  assert.equal(m.review.final.items.find(item => item.id === 'material-240').answer, 'Risposta controllata.');
  assert.equal(m.review.final.items.find(item => item.id === 'material-241').answer, 'Risposta 241.');
  for (const [id, decision] of Object.entries(initial)) assert.deepEqual(clone(m.review.final.review.initial.decisions[id]), decision);
});

test('occurrences in approved deliveries remain searchable and excluded materials stay excluded', async () => {
  const h = runtime(), items = [
    { id: 'kept', kind: 'flashcard', question: 'Circuito?', answer: 'Circuito chiuso.' },
    { id: 'excluded', kind: 'flashcard', question: 'Circuito?', answer: 'Circuito aperto.' }
  ];
  const m = finalManifest(items, [{ id: 'drop', target: { kind: 'item', id: 'excluded', field: '$item' }, after: null }]);
  const decision = Core.setDecision(m.review.final.review, 'drop', 'accept'), approval = Core.beginApproval(decision, { items });
  m.review.final.review = Core.completeApproval(approval.review, approval.revision); m.review.final.items = approval.db.items; m.review.final.stage = 'done';
  const before = clone(m), modal = h.R.open('/vault', m, { final: true });
  assert.equal((await searchMaterials(modal, 'Circuito')).length, 1);
  assert.equal(modal.querySelectorAll('[data-occurrence-edit]').length, 0);
  assert.deepEqual(clone(m), before); assert.equal(h.calls.manifest, 0);
});

test('failed saves and unfinished numeric edits block occurrence navigation without discarding the editor', async () => {
  const h = contextualDashboard(), { modal } = h;
  await searchMaterials(modal, 'Domanda');
  h.opts.failSave = true;
  await modal.querySelector('[data-occurrence-item=open] [data-occurrence-edit=question]').click();
  assert.match(modal.querySelector('#mrv-status').textContent, /Disco non disponibile/);
  assert.equal(currentCard(modal).getAttribute('data-review-card'), 'context-mc');
  h.opts.failSave = false; await modal.querySelector('#mrv-save-retry').click(); await tick();
  await modal.querySelector('[data-occurrence-item=open] [data-occurrence-edit=question]').click();
  assert.equal(h.m.review.final.review.initial.issues.length, 4);
  const next = Core.addIssue(h.m.review.final.review, { id: 'line-edit', origin: 'teacher', target: { kind: 'item', id: 'open', field: 'lines' } });
  h.m.review.final.review = Core.setDecision(next, 'line-edit', 'manual', { text: 4 });
  const reopened = h.R.open('/vault', h.m, { final: true });
  await reopened.querySelector('[data-review-filter=all]').click();
  await reopened.querySelector('[data-review-issue="line-edit"]').click();
  const input = currentCard(reopened).querySelector('input[type=number]'); input.value = ''; input.oninput();
  await searchMaterials(reopened, 'Domanda');
  assert.equal(currentCard(reopened).getAttribute('data-review-card'), 'line-edit');
  assert.equal(currentCard(reopened).querySelector('input[type=number]'), input);
  assert.equal(input.value, '');
});
