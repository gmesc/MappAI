'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../public/js/mappai-study-path.js');

test('buildParentMap: genitore = estremo di livello inferiore', () => {
  const nodes = [{ id: 'R', level: 0 }, { id: 'A', level: 1 }, { id: 'B', level: 2 }];
  const links = [{ source: 'R', target: 'A', rel: 'include' }, { source: 'A', target: 'B', rel: 'include' }];
  assert.deepEqual(SP.buildParentMap(nodes, links), { A: 'R', B: 'A' });
});

test('buildParentMap: ignora archi laterali (stesso livello / inverso)', () => {
  const nodes = [{ id: 'A', level: 1 }, { id: 'B', level: 1 }, { id: 'C', level: 2 }];
  const links = [{ source: 'A', target: 'B', rel: 'collega' }, { source: 'C', target: 'A', rel: 'x' }];
  assert.deepEqual(SP.buildParentMap(nodes, links), {}); // nessun arco padre→figlio
});

test('classify: ready / locked / review(weak) / review(stale) / mastered', () => {
  const now = 1_000_000_000_000;
  const day = 86400000;
  const mast = {
    A: { level: 'acquisito', attempts: 3, lastTs: now - 1000 },   // mastered recente
    B: { level: 'nuovo', attempts: 0, lastTs: 0 },                 // ready (genitore A padroneggiato)
    C: { level: 'nuovo', attempts: 0, lastTs: 0 },                 // ready (nessun genitore)
    D: { level: 'in-corso', attempts: 2, lastTs: now - 1000 },     // review weak
    E: { level: 'fluente', attempts: 5, lastTs: now - 10 * day },  // review stale
    F: { level: 'nuovo', attempts: 0, lastTs: 0 },                 // locked (genitore G non padroneggiato)
    G: { level: 'in-corso', attempts: 1, lastTs: now - 1000 }
  };
  const parentOf = { B: 'A', F: 'G' };
  const res = SP.classify(['A', 'B', 'C', 'D', 'E', 'F'], parentOf, id => mast[id], { now, staleDays: 7 });
  assert.deepEqual(res.ready.map(x => x.id).sort(), ['B', 'C']);
  assert.deepEqual(res.review.map(x => x.id).sort(), ['D', 'E']);
  assert.deepEqual(res.mastered.map(x => x.id), ['A']);
  assert.deepEqual(res.locked.map(x => x.id), ['F']);
  // motivi del ripasso
  assert.equal(res.review.find(x => x.id === 'D').reason, 'weak');
  assert.equal(res.review.find(x => x.id === 'E').reason, 'stale');
});

test('classify: senza genitore e mai studiato → ready', () => {
  const res = SP.classify(['X'], {}, () => ({ level: 'nuovo', attempts: 0, lastTs: 0 }), { now: 1, staleDays: 7 });
  assert.deepEqual(res.ready.map(x => x.id), ['X']);
});
