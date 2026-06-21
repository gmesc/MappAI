'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Simula l'ambiente browser PRIMA di caricare il modulo, così si attiva il
// layer window.MappAIMastery (persistenza + ingestSession).
const _ls = new Map();
global.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k)
};
global.window = {
  appState: {
    rootNodeLabel: 'TestVault',
    db: { nodes: [
      { id: 'N_FOTO', label: 'Fotosintesi' },
      { id: 'N_GLU', label: 'Glucosio' },
      { id: 'N_CLO', label: 'Clorofilla' }
    ] }
  }
};

require('../public/js/mappai-mastery.js');
const MM = global.window.MappAIMastery;

test('layer browser: window.MappAIMastery presente', () => {
  assert.ok(MM && typeof MM.ingestSession === 'function');
  MM.clear();
});

test('ingestSession modo 3 (nodeId + isCorrect)', () => {
  MM.clear();
  const n = MM.ingestSession({
    mode: 3, timestamp: new Date().toISOString(),
    entries: [
      { nodeId: 'N_FOTO', correct: 'Fotosintesi', isCorrect: true },
      { nodeId: 'N_GLU', correct: 'Glucosio', isCorrect: false }
    ]
  });
  assert.equal(n, 2);
  assert.equal(MM.pinpoint('N_FOTO', 'richiamo').accuracy, 1);
  assert.equal(MM.pinpoint('N_GLU', 'richiamo').accuracy, 0);
  assert.equal(MM.level('N_FOTO', 'richiamo'), 'acquisito');
  assert.equal(MM.level('N_GLU', 'richiamo'), 'in-corso');
});

test('ingestSession modo 4 (label → risolto a nodeId, accuracy 0-100)', () => {
  MM.clear();
  const n = MM.ingestSession({
    mode: 4, timestamp: new Date().toISOString(),
    entries: [{ label: 'Clorofilla', accuracy: 70, isCorrect: true }]
  });
  assert.equal(n, 1);
  const pp = MM.pinpoint('N_CLO', 'spiega');
  assert.ok(Math.abs(pp.accuracy - 0.7) < 1e-9); // 70 → 0.7
});

test('ingestSession: salta gli entry non risolvibili', () => {
  MM.clear();
  const n = MM.ingestSession({
    mode: 4, timestamp: new Date().toISOString(),
    entries: [{ label: 'Concetto Inesistente', accuracy: 90 }]
  });
  assert.equal(n, 0);
});

test('node(): aggrega richiamo + spiega sullo stesso concetto', () => {
  MM.clear();
  MM.ingestSession({ mode: 3, entries: [{ nodeId: 'N_FOTO', isCorrect: true }] });
  MM.ingestSession({ mode: 4, entries: [{ nodeId: 'N_FOTO', label: 'Fotosintesi', isCorrect: false }] });
  const agg = MM.node('N_FOTO');
  assert.equal(agg.accuracy, 0.5);
  assert.equal(agg.byActivity.length, 2);
});

test('persistenza: lo store sopravvive in localStorage', () => {
  MM.clear();
  MM.record('N_FOTO', 'Fotosintesi', 'richiamo', { score: 1 });
  const raw = global.localStorage.getItem('mappai_mastery::TestVault');
  assert.ok(raw && raw.includes('N_FOTO::richiamo'));
});
