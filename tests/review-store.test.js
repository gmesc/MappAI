const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('../public/js/mappai-review-store');
const R = require('../public/js/mappai-review-core');
const vm = require('node:vm');

test('review commit rejects stale autosave and stale manifest, including equal node counts', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  S.checkMapWrite(dir, { nodes: [] }); // legacy/new vault
  const db = { nodes: [{ id: 'N1', label: 'Oro', desc: 'Prima.' }], links: [] };
  let review = R.createReview({ db, report: { stato: 'completato', issues: [{ id: 'n', target: { kind: 'node', id: 'N1' }, after: 'Dopo.' }] } });
  review = R.setDecision(review, 'n', 'accept');
  const begun = R.beginApproval(review, db);
  const m = { review: begun.review };
  const version = S.saveManifest(dir, m, 0);
  assert.equal(version, 1);
  assert.throws(() => S.checkMapWrite(dir, { reviewRevision: review.baseRevision }), /in corso/);
  assert.throws(() => S.checkMapWrite(dir, { ...db, reviewRevision: review.baseRevision, reviewCommit: begun.revision }), /contenuto/);
  assert.doesNotThrow(() => S.checkMapWrite(dir, { ...begun.db, reviewRevision: review.baseRevision, reviewCommit: begun.revision }));
  m.review.initial.status = 'approved';
  S.saveManifest(dir, m, version);
  assert.throws(() => S.checkMapWrite(dir, { ...db, reviewRevision: review.baseRevision }), /precedente/);
  assert.doesNotThrow(() => S.checkMapWrite(dir, { ...db, reviewRevision: begun.revision }), 'teacher edit with current token is allowed; semantic gate invalidates the previous approval');
  assert.throws(() => S.saveManifest(dir, m, version), /aggiornato/);
  assert.throws(() => S.saveManifest(dir, { steps: {} }, 2), /cancellare/);
  assert.equal(S.readManifest(dir).review.initial.status, 'approved');
  assert.deepEqual(fs.readdirSync(dir), ['pipeline.json']);
});

test('a corrupt review never silently becomes a legacy vault', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'pipeline.json'), '{');
  assert.throws(() => S.checkMapWrite(dir, {}));
  assert.throws(() => S.saveManifest(dir, {}, 0));
  assert.equal(fs.readFileSync(path.join(dir, 'pipeline.json'), 'utf8'), '{');
});

function mainHandlers() {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const handlers = {};
  const ctx = vm.createContext({ fs, path, Buffer, console,
    yaml: require('js-yaml'), ReviewStore: S, FilesCore: require('../public/js/mappai-files-core'),
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    _contaNodiInCartella: () => 0,
    shell: { trashItem: async () => { throw new Error('No trash operations expected in this test'); } }
  });
  for (const name of ['_vaultWalkMd', '_vaultPruneEmptyDirs']) {
    const start = source.indexOf('function ' + name + '(');
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
  }
  for (const name of ['save-vault', 'load-vault', 'save-vault-file']) {
    const start = source.indexOf("ipcMain.handle('" + name + "',");
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), ctx);
  }
  return handlers;
}

test('explicit Nessuna survives actual review commit and main save/load', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-none-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = mainHandlers(), editor = require('../public/js/mappai-link-editor-core');
  const data = { nodes: [{ id: 'root', label: 'Titolo', desc: 'Contesto.', level: 0, group: 0 }, { id: 'a', label: 'Ramo', desc: 'Dettaglio.', level: 1, group: 1, parentId: 'root' }],
    links: [{ id: 'l', source: 'root', target: 'a', rel: 'comprende', isCross: false }], sourcesDict: {} };
  const initial = R.createReview({ db: data, report: { checkStatus: 'completed' } });
  const edited = editor.decision(initial, data, editor.reference(data.links[0]), '', { relNone: true });
  const result = R.beginApproval(edited, data); assert.equal(result.ok, true);
  S.saveManifest(dir, { review: result.review }, 0);
  const save = await h['save-vault']({}, { folderPath: dir, mapData: { ...result.db, rootNodeLabel: 'Titolo',
    reviewRevision: initial.baseRevision, reviewCommit: result.revision } });
  assert.equal(save.success, true, save.error);
  const loaded = await h['load-vault']({}, dir); assert.equal(loaded.success, true, loaded.error);
  assert.equal(loaded.data.links[0].rel, ''); assert.equal(loaded.data.links[0].relNone, true);
  assert.equal(loaded.data.nodes.find(n => n.id === 'a').parentId, 'root');
  assert.deepEqual(JSON.parse(JSON.stringify(R.semanticSnapshot(loaded.data))), result.review.approvedSnapshot);
  const approved = R.completeApproval(result.review, R.revision(loaded.data, []));
  assert.equal(R.gate(approved, loaded.data, []).allowed, true);
  const restored = editor.withLabel(loaded.data, editor.reference(loaded.data.links[0]), 'comprende');
  assert.equal(restored.links[0].relNone, undefined);
});

test('actual main save/load roundtrip preserves authored fields, links and original citation metadata', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-roundtrip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = mainHandlers();
  const proof = { id: 'f4-1', sourceId: 'book', title: 'Libro "Svizzera"', source: 'p. 4', page: 4,
    text: 'Testo originale --- con\nritorno a capo.', verbatim: true };
  const data = {
    extractionMode: 'mindmap', rootNodeLabel: 'Titolo',
    nodes: [
      { id: 'root', label: 'Titolo "esatto"', desc: 'Primo paragrafo.\n\n## Fonti\nQuesto è un titolo del contenuto.', level: 0, group: 0 },
      { id: 'n1', label: 'Oro', desc: 'Il testo --- con separatore e\nun ritorno a capo.', level: 1, group: 1,
        parentId: 'root', ambito: 'Svizzera', confini: '1939–1945', rel: 'include', aiDesc: 'Testo precedente.', chunks: [proof] }
    ],
    links: [{ id: 'l1', source: 'root', target: 'n1', rel: 'include', isCross: false, bidirectional: false }],
    sourcesDict: { n1: [proof] }, studySets: []
  };
  const before = R.semanticSnapshot(data);
  const saved = await h['save-vault']({}, { folderPath: dir, mapData: structuredClone(data) });
  assert.equal(saved.success, true, saved.error);
  const loaded = await h['load-vault']({}, dir);
  assert.equal(loaded.success, true, loaded.error);
  assert.deepEqual(JSON.parse(JSON.stringify(R.semanticSnapshot(loaded.data))), before);
  assert.equal(loaded.data.nodes.find(n => n.id === 'n1').parent, undefined, 'derived layout parent does not change authored hierarchy');
  assert.equal(loaded.data.sourcesDict.n1[0].verbatim, true);
  assert.equal(loaded.data.sourcesDict.n1[0].text, proof.text);
  // Editing Markdown externally still changes desc; metadata is not a second text authority.
  const file = fs.readdirSync(path.join(dir, 'Nodi')).find(n => n.includes('_n1.md'));
  const full = path.join(dir, 'Nodi', file);
  fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace(data.nodes[1].desc, 'Correzione esterna.'));
  const edited = await h['load-vault']({}, dir);
  assert.equal(edited.data.nodes.find(n => n.id === 'n1').desc, 'Correzione esterna.');
});

test('actual IPC commit rejects unconfirmed writes and verifies the version read from real Markdown', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-commit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = mainHandlers();
  const db = { nodes: [{ id: 'n1', label: 'Valuta', desc: 'Prima.', level: 1, group: 1 }], links: [], sourcesDict: {} };
  const initial = R.createReview({ db, sources: [{ nome: 'Libro.pdf', pages: [{ n: 1, text: 'Dopo.' }] }], report: { stato: 'completato',
    issues: [{ id: 'n', target: { kind: 'node', id: 'n1' }, after: 'Dopo.' }] } });
  const result = R.beginApproval(R.setDecision(initial, 'n', 'accept'), db);
  const manifest = { review: result.review };
  S.saveManifest(dir, manifest, 0);
  const wrong = await h['save-vault']({}, { folderPath: dir, mapData: { ...result.db, reviewRevision: initial.baseRevision } });
  assert.equal(wrong.success, false);
  assert.equal(fs.existsSync(path.join(dir, 'index.yaml')), false, 'rejection happens before any map write');
  const saved = await h['save-vault']({}, { folderPath: dir, mapData: { ...result.db, rootNodeLabel: 'Valuta',
    reviewRevision: initial.baseRevision, reviewCommit: result.revision } });
  assert.equal(saved.success, true, saved.error);
  const disk = await h['load-vault']({}, dir);
  const approved = R.completeApproval(result.review, R.revision(disk.data, initial.sources));
  assert.equal(approved.initial.status, 'approved');
  assert.equal(disk.data._pipelineManifest.review.initial.status, 'applying');
});

test('legacy Markdown sources and missing relationship verbs remain readable', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-legacy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'Nodi'));
  fs.writeFileSync(path.join(dir, 'Nodi', 'old_n.md'), '---\nid: "n"\nlabel: "Vecchio"\nlevel: 0\ngroup: 0\n---\n\n# Vecchio\n\nTesto storico.\n\n## Fonti\n- [Libro]: Prima prova.\n- [Libro | pagina 2]: Seconda prova.\n');
  fs.writeFileSync(path.join(dir, 'links.json'), JSON.stringify([{ source: 'n', target: 'x' }]));
  const loaded = await mainHandlers()['load-vault']({}, dir);
  assert.equal(loaded.success, true, loaded.error);
  assert.equal(loaded.data.nodes[0].desc, 'Testo storico.');
  assert.equal(loaded.data.sourcesDict.n[0].source, 'Originale');
  assert.equal(loaded.data.sourcesDict.n[1].source, 'pagina 2');
  assert.equal(loaded.data.sourcesDict.n[0].verbatim, undefined, 'legacy citations are not upgraded to verified evidence');
  assert.equal(loaded.data.links[0].rel, 'include');
  assert.equal(loaded.data._pipelineManifest, null);
});

test('base64 manifest writes use the same CAS guard as text and cannot bypass decisions', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-manifest-ipc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const h = mainHandlers();
  const review = R.createReview({ db: { nodes: [], links: [] } });
  S.saveManifest(dir, { review }, 0);
  const bad = await h['save-vault-file']({}, { vaultPath: dir, relPath: 'pipeline.json',
    base64: Buffer.from(JSON.stringify({ steps: {} })).toString('base64'), expectedVersion: 1 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /cancellare/);
  assert.equal(S.readManifest(dir).review.baseRevision, review.baseRevision);
  const stale = await h['save-vault-file']({}, { vaultPath: dir, relPath: 'pipeline.json',
    text: JSON.stringify({ review }), expectedVersion: 0 });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /aggiornato/);
});

function rendererHarness(manifest, opts = {}) {
  const events = [], timers = [], data = { rootNodeLabel: 'Mappa', nodes: [{ id: 'n', label: 'Mappa', desc: 'Testo.', level: 0 }],
    links: [], sourcesDict: {}, _pipelineManifest: manifest };
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const local = new Map([['project', JSON.stringify({ activeVaultPath: '/new', _reviewRevision: 'cached',
    _pipelineManifest: { review: { generationId: 'wrong-cache' } }, db: data })]]);
  const window = {
    electronAPI: { loadVault: async () => ({ success: true, data }), pickFolder: async () => ({ folderPath: '/new' }),
      filesRootGet: async () => ({}), saveVault: async () => { events.push('write-map'); return { success: true }; } },
    addEventListener() {}, showLoadingOverlay() {}, showAlert: (_title, text) => events.push('error:' + text), showToast() {},
    t: (_k, f) => f, setTutorState() {}, renderStudySets: () => events.push('render-sets'),
    switchToMapLayout: () => events.push('render-map'),
    MappAIPipeline: { checkResume: () => events.push('resume') },
    MappAIReview: { restore: async (folder, stored, ropts) => {
      events.push('restore');
      assert.equal(folder, '/new');
      assert.equal(stored, manifest);
      assert.equal(ctx.appState._reviewRestoring, true);
      assert.equal(ctx.appState._reviewCommit, undefined);
      assert.equal(ropts.fromCache, !!opts.cache);
      // Exercise the actual autosave early-return while restore is suspended.
      ctx._storage.saveCurrentProject();
      await wait;
      if (opts.fail) throw new Error('restore failed');
      ctx.appState._pipelineManifest = stored || null;
      events.push('restored');
    } }
  };
  const ctx = vm.createContext({ window, console: { log() {}, warn() {}, error() {} },
    appState: { db: { nodes: [], links: [] }, _pipelineManifest: { review: { generationId: 'old-project' } }, _reviewCommit: 'old-commit' },
    document: { getElementById: () => null }, simulation: null,
    localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => { events.push('cache-write'); local.set(k, v); } },
    setTimeout: fn => { timers.push(fn); }, initD3Visualization: () => events.push('d3')
  });
  const storage = fs.readFileSync(path.join(__dirname, '../public/js/mappai-storage-lang.js'), 'utf8');
  const start = storage.indexOf('const StorageManager = {');
  vm.runInContext(storage.slice(start, storage.indexOf('\n};', start) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  window.StorageManager = ctx._storage;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-vault-io.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-vault-manager.js'), 'utf8'), ctx);
  return { ctx, events, release, timers, window };
}

for (const route of ['folder-picker', 'direct-vault', 'cache']) {
  test(`${route}: review restoration precedes render, resume and autosave`, async () => {
    const manifest = { review: R.createReview({ db: { nodes: [{ id: 'n', label: 'Mappa', desc: 'Testo.', level: 0 }], links: [] } }) };
    const h = rendererHarness(manifest, { cache: route === 'cache' });
    const pending = route === 'cache' ? h.ctx._storage.loadProject('project') :
      route === 'direct-vault' ? h.window.directLoadVault('/new') : h.window.loadMapVault();
    for (let i = 0; i < 10 && !h.events.includes('restore'); i++) await Promise.resolve();
    assert.deepEqual(h.events, ['restore']);
    assert.equal(h.timers.length, 0);
    h.release(); await pending;
    assert.equal(h.ctx.appState._reviewRestoring, false);
    assert.equal(h.ctx.appState._pipelineManifest, manifest);
    assert.ok(h.events.indexOf('restored') < h.events.indexOf('render-map'));
    assert.ok(h.events.indexOf('restored') < h.events.indexOf('resume'));
    assert.ok(!h.events.includes('write-map'));
  });
}

test('legacy vault clears previous project review; failed restore blocks autosave and rendering', async () => {
  const legacy = rendererHarness(null);
  const pending = legacy.window.directLoadVault('/new');
  for (let i = 0; i < 10 && !legacy.events.includes('restore'); i++) await Promise.resolve();
  legacy.release(); await pending;
  assert.equal(legacy.ctx.appState._pipelineManifest, null);
  assert.equal(legacy.ctx.appState._reviewRevision, undefined);
  const broken = rendererHarness({ review: {} }, { fail: true });
  const fail = broken.window.directLoadVault('/new');
  for (let i = 0; i < 10 && !broken.events.includes('restore'); i++) await Promise.resolve();
  broken.release(); await fail;
  assert.equal(broken.ctx.appState._reviewRestoreError, 'restore failed');
  broken.ctx._storage.saveCurrentProject();
  assert.ok(!broken.events.includes('cache-write'));
  assert.ok(!broken.events.includes('render-map'));
  assert.ok(!broken.events.includes('resume'));
});
