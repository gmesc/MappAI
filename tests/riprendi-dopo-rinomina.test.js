'use strict';
/* 0094 (lotto D, ADR 0021) — «Riprendi» dopo una rinomina dal Finder: `loadProject`
   (StorageManager VERO, ritagliato da mappai-storage-lang.js come in
   tests/cassetto-solo-indice.test.js) ritrova dal `projectId` la cartella che non c'è più
   al percorso della fotografia, e la padronanza la segue. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const ID = 'proj_1790000000011';
const VECCHIO = '/M/4R/Scienze/Elettricità', NUOVO = '/M/4R/Scienze/Circuiti';

function banco(caso) {
  const local = new Map(Object.entries(caso.local || {})), aperte = [], avvisi = [];
  const disco = new Map(Object.entries(caso.disco || {}));
  const window = {
    t: (k, f) => f, showAlert: (a, b) => avvisi.push(b), showLoadingOverlay() {}, showToast() {}, safeCreateIcons() {},
    switchToMapLayout() {}, setTutorState() {},
    MappAIFilesCore: require('../public/js/mappai-files-core.js'),
    MappAITeachCore: require('../public/js/mappai-teach-core.js'),
    MappAINomeCartellaCore: require('../public/js/mappai-nome-cartella-core.js'),
    MappAIReview: { restore: async (vp, m) => { ctx.appState._pipelineManifest = m; } },
    electronAPI: {
      loadVault: async p => { aperte.push(p); return disco.has(p) ? { success: true, data: JSON.parse(JSON.stringify(disco.get(p))) } : { success: false, error: 'cartella non trovata' }; },
      getAllVaults: async () => JSON.parse(JSON.stringify(caso.cartelle || [])),
      filesRootGet: async () => ({ mapsBaseDir: '/M', rootDir: '/' })
    }
  };
  const ctx = vm.createContext({
    window, console: { log() {}, info() {}, warn() {}, error() {} }, document: { getElementById: () => null },
    appState: { db: { nodes: [], links: [] } }, simulation: null, atob, btoa, TextDecoder, TextEncoder,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k),
      get length() { return local.size; }, key: i => [...local.keys()][i] },
    setTimeout: () => 0, clearTimeout() {}, queueMicrotask, initD3Visualization() {}
  });
  window.self = ctx;
  const src = JS('mappai-storage-lang.js'), da = src.indexOf('const StorageManager = {');
  vm.runInContext(src.slice(da, src.indexOf('\n};', da) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  return { ctx, S: ctx._storage, local, aperte, avvisi };
}
const nodi = { nodes: [{ id: 'r', label: 'Elettricità', level: 0 }, { id: 'a', label: 'A', level: 1 }], links: [{ source: 'r', target: 'a' }] };
const fotografia = JSON.stringify({ rootNodeLabel: 'Elettricità', extractionMode: 'mindmap', activeVaultPath: VECCHIO, activeVaultClassDir: '4R', activeVaultDiscDir: 'Scienze', db: nodi });
const riga = JSON.stringify([{ id: ID, name: 'Elettricità', vault: 'Elettricità', classDir: '4R', discDir: 'Scienze', type: 'mindmap' }]);

test('0094 D: la fotografia dice il percorso vecchio → la cartella col suo projectId si apre al posto suo, la padronanza la segue', async () => {
  const h = banco({
    local: { tutor_ai_projects: riga, [ID]: fotografia, ['mappai_mastery::' + VECCHIO]: '{"a":1}' },
    disco: { [NUOVO]: Object.assign({ projectId: ID, extractionMode: 'mindmap', rootNodeLabel: 'Elettricità' }, nodi) },
    cartelle: [{ folderName: 'Circuiti', fullPath: NUOVO, classDir: '4R', discDir: 'Scienze', projectId: ID }]
  });
  const ok = await h.S.loadProject(ID);
  assert.equal(ok, true, h.avvisi.join(' | '));
  assert.deepEqual(h.aperte, [VECCHIO, NUOVO]);
  assert.equal(h.ctx.appState.activeVaultPath, NUOVO);
  assert.equal(h.local.get('mappai_mastery::' + NUOVO), '{"a":1}');
  assert.equal(h.local.has('mappai_mastery::' + VECCHIO), false);
});

test('0094 D: due cartelle con lo stesso id (una copia) → nessuna scelta; con «0» come prima', async () => {
  for (const caso of [
    { cartelle: [{ fullPath: NUOVO, projectId: ID }, { fullPath: NUOVO + ' copia', projectId: ID }], local: {} },
    { cartelle: [{ fullPath: NUOVO, projectId: ID }], local: { mappai_nome_da_cartella: '0' } }]) {
    const h = banco({ local: Object.assign({ tutor_ai_projects: riga, [ID]: fotografia }, caso.local),
      disco: { [NUOVO]: Object.assign({ projectId: ID }, nodi) }, cartelle: caso.cartelle });
    const ok = await h.S.loadProject(ID);
    assert.equal(ok, false);
    assert.deepEqual(h.aperte, [VECCHIO], 'nessuna seconda apertura');
    assert.equal(h.avvisi.length, 1, 'l\'avviso di sempre');
  }
});

test('0094 D: la cartella c\'è al suo posto → nessuna ricerca in più', async () => {
  let elenco = 0;
  const h = banco({ local: { tutor_ai_projects: riga, [ID]: fotografia }, disco: { [VECCHIO]: Object.assign({ projectId: ID }, nodi) } });
  h.ctx.window.electronAPI.getAllVaults = async () => { elenco++; return []; };
  assert.equal(await h.S.loadProject(ID), true);
  assert.equal(elenco, 0);
});
