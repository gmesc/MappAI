// tests/deepening.test.js — parte deterministica della Fase 3.7 (deepening selettivo)
// computeBranchDepths: profondità topologica per ramo L1 (BFS, soli link gerarchici).
const test = require('node:test');
const assert = require('node:assert');

// mock del contesto browser prima di caricare il modulo (pattern browser-globals)
global.window = { MappAIMath: { cosineSimilarity: () => 0 } };
global.localStorage = { getItem: () => null, setItem: () => { } };
global.appState = { extractionMode: 'mindmap', db: { nodes: [], links: [], sourcesDict: {} } };
require('../public/js/mappai-generation-support.js');

test('computeBranchDepths: profondità per ramo + istogramma, cross-link ignorati', () => {
  appState.db.nodes = [
    { id: 'ROOT', label: 'Tema', level: 0 },
    { id: 'A', label: 'Ramo A', level: 1 },
    { id: 'A2', label: 'A due', level: 2 },
    { id: 'A3', label: 'A tre', level: 3 },
    { id: 'B', label: 'Ramo B', level: 1 },
    { id: 'B2', label: 'B due', level: 2 },
  ];
  appState.db.links = [
    { source: 'ROOT', target: 'A' },
    { source: 'A', target: 'A2' },
    { source: 'A2', target: 'A3' },
    { source: 'ROOT', target: 'B' },
    { source: 'B', target: 'B2' },
    { source: 'B2', target: 'A3', isCross: true },   // cross: NON deve allungare B
  ];
  const { depthByBranch, labelByBranch, histogram } = window.computeBranchDepths();
  assert.strictEqual(depthByBranch['A'], 3);
  assert.strictEqual(depthByBranch['B'], 2);
  assert.strictEqual(labelByBranch['A'], 'Ramo A');
  assert.deepStrictEqual(histogram, { 0: 1, 1: 2, 2: 2, 3: 1 });
});

test('computeBranchDepths: endpoint a oggetto (post-D3) risolti correttamente', () => {
  appState.db.nodes = [
    { id: 'ROOT', label: 'T', level: 0 },
    { id: 'X', label: 'X', level: 1 },
    { id: 'X2', label: 'X2', level: 2 },
  ];
  appState.db.links = [
    { source: { id: 'ROOT' }, target: { id: 'X' } },
    { source: { id: 'X' }, target: { id: 'X2' } },
  ];
  assert.strictEqual(window.computeBranchDepths().depthByBranch['X'], 2);
});

test('isDeepeningEnabled: default ON, spegnibile con localStorage', () => {
  assert.strictEqual(window.isDeepeningEnabled(), true);
  global.localStorage.getItem = (k) => k === 'mappai_deepening_enabled' ? 'false' : null;
  assert.strictEqual(window.isDeepeningEnabled(), false);
  global.localStorage.getItem = () => null;
});

test('executeDeepeningPass: no-op senza apiKey / in modalità KG / slider basso', async () => {
  const before = appState.db.nodes.length;
  await window.executeDeepeningPass(['fonte'], null, 5);            // no key
  appState.extractionMode = 'kg';
  await window.executeDeepeningPass(['fonte'], 'k', 5);             // kg
  appState.extractionMode = 'mindmap';
  await window.executeDeepeningPass(['fonte'], 'k', 2);             // slider < 3
  assert.strictEqual(appState.db.nodes.length, before);
});
