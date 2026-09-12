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
      focus() { active = this; }, getClientRects() { return this.hidden ? [] : [{}]; },
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
    return { checkStatus: 'completed', issues: [] };
  };
  await h.R.retryJudge('/vault', m);
  assert.equal(m.review.initial.decisions.existing.choice, 'reject');
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

function finalManifest(items, issues) {
  const r = initial({ checkStatus: 'completed', issues: [] });
  const first = Core.beginApproval(r, DB), m = manifest(Core.completeApproval(first.review, first.revision));
  m.review.final = { stage: 'awaiting_review', items: clone(items), review: Core.createReview({ db: { items }, sources: SOURCES,
    report: { checkStatus: 'completed', issues: issues || [] } }) };
  return m;
}

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

test('openCurrent chooses pending G2; completed G1 closes without regenerating materials', async () => {
  const h = runtime(), m = finalManifest([{ id: 'f', kind: 'flashcard', question: 'Chi?', answer: 'Germania.' }]);
  h.st._pipelineManifest = m;
  await h.R.openCurrent(); assert.equal(h.dom.document.getElementById('mrv-title').textContent, 'Rivedi i materiali');
  const done = runtime(); m.review.final.stage = 'done'; done.st._pipelineManifest = m;
  await done.R.openCurrent();
  const button = done.dom.document.getElementById('mrv-continue'); assert.equal(button.textContent, 'Chiudi');
  await button.click(); assert.equal(done.calls.pipeline, 0); assert.equal(done.calls.map, 0);
});

test('manual review requires an explicit checkbox and keyboard navigation stays in the dialog', async () => {
  const h = runtime(), m = manifest(initial({ checkStatus: 'unavailable', issues: [] })), modal = h.R.open('/vault', m);
  await modal.querySelector('#mrv-continue').click(); assert.equal(h.calls.map, 0);
  const confirmation = modal.querySelector('#mrv-manual-confirm'); assert.equal(confirmation.checked, false);
  let prevented = false;
  modal.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.notEqual(h.dom.document.activeElement.id, 'previous');
  confirmation.checked = true; confirmation.onchange(); await modal.querySelector('#mrv-continue').click();
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
