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
  h.window.MappAIMaterialReview = { ...Material, check: async (...args) => { h.calls.material++; return h.materialCheck(...args); } };
  return Object.assign(h, { m, items });
}

test('G2 retry checks the 105 saved items once, preserving decisions, original sources and frozen model without generating or exporting', async () => {
  const h = materialRetryFixture(), old = h.m.review.final.review, beforeDb = clone(h.st.db), beforeItems = clone(h.m.review.final.items),
    beforeDrafts = clone(h.m.review.drafts), priorContext = h.st._reviewAIContext, priorSources = h.st._generationSources;
  await h.R.retryMaterialJudge('/vault', h.m);
  const next = h.m.review.final.review;
  assert.equal(h.calls.material, 1); assert.equal(h.calls.grounding, 1);
  assert.deepEqual(clone(next.initial.decisions), old.initial.decisions);
  old.initial.issues.forEach(issue => assert.deepEqual(clone(next.initial.issues.find(i => i.id === issue.id)), issue));
  assert.ok(next.initial.issues.some(i => i.id === 'fresh'));
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
  assert.ok(retry); assert.equal(retry.textContent, 'Riprova il controllo dei materiali');
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

test('G2 shows only a compact unchecked count and keeps the full 105-item diagnostics in the unchanged manifest', () => {
  const h = materialRetryFixture();
  h.m.review.final.review.initial.issues = [];
  h.m.review.final.review.initial.decisions = {};
  const before = clone(h.m), modal = h.R.open('/vault', h.m, { final: true });
  const unchecked = modal.querySelector('#mrv-unchecked');
  assert.ok(unchecked, 'skipped material checks remain visible even when no correction issue was returned');
  assert.match(unchecked.textContent, /105/);
  assert.equal(unchecked.querySelectorAll('li,details').length, 0);
  assert.doesNotMatch(h.dom.html(), /HTTP 400|schema non valido|Domanda salvata|saved-\d+|Dettaglio tecnico/);
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
