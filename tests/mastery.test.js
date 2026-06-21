'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/mappai-mastery.js');

test('ewma: prima misura = valore stesso', () => {
  assert.equal(M.ewma(null, 1), 1);
  assert.equal(M.ewma(null, 0), 0);
});

test('ewma: memoria con reattività ALPHA (0.35)', () => {
  // prev 1.0, nuova 0.0 → 1*0.65 + 0*0.35 = 0.65
  assert.ok(Math.abs(M.ewma(1, 0) - 0.65) < 1e-9);
  // prev 0, nuova 1 → 0.35
  assert.ok(Math.abs(M.ewma(0, 1) - 0.35) < 1e-9);
});

test('ewma: clamp 0..1', () => {
  assert.equal(M.ewma(null, 5), 1);
  assert.equal(M.ewma(null, -3), 0);
});

test('pinpointKey: nodo × attività', () => {
  assert.equal(M.pinpointKey('N1', 'richiamo'), 'N1::richiamo');
});

test('applyResult: crea e aggiorna la riga, conta i tentativi', () => {
  const store = {};
  let r = M.applyResult(store, { nodeId: 'N1', label: 'Fotosintesi', activity: 'richiamo', score: 1, ts: 1 });
  assert.equal(r.accuracy, 1);
  assert.equal(r.attempts, 1);
  assert.equal(r.label, 'Fotosintesi');
  r = M.applyResult(store, { nodeId: 'N1', activity: 'richiamo', score: 0, ts: 2 });
  assert.ok(Math.abs(r.accuracy - 0.65) < 1e-9); // EWMA
  assert.equal(r.attempts, 2);
  assert.equal(r.label, 'Fotosintesi'); // label preservata
  assert.equal(r.history.length, 2);
});

test('applyResult: rate aggiornato solo se fornito', () => {
  const store = {};
  M.applyResult(store, { nodeId: 'N1', activity: 'richiamo', score: 1, rate: 10, ts: 1 });
  let r = M.applyResult(store, { nodeId: 'N1', activity: 'richiamo', score: 1, ts: 2 }); // niente rate
  assert.equal(r.rate, 10); // resta l'ultimo
});

test('aggregateNode: media tra attività dello stesso nodo', () => {
  const store = {};
  M.applyResult(store, { nodeId: 'N1', activity: 'richiamo', score: 1, ts: 1 }); // acc 1
  M.applyResult(store, { nodeId: 'N1', activity: 'spiega', score: 0, ts: 1 });   // acc 0
  M.applyResult(store, { nodeId: 'N2', activity: 'richiamo', score: 1, ts: 1 });
  const agg = M.aggregateNode(store, 'N1');
  assert.equal(agg.accuracy, 0.5);
  assert.equal(agg.attempts, 2);
  assert.equal(agg.byActivity.length, 2);
  assert.equal(M.aggregateNode(store, 'NONE'), null);
});

test('masteryLevel: nuovo / in-corso / acquisito', () => {
  assert.equal(M.masteryLevel(null), 'nuovo');
  assert.equal(M.masteryLevel({ attempts: 0 }), 'nuovo');
  assert.equal(M.masteryLevel({ attempts: 3, accuracy: 0.5 }), 'in-corso');
  assert.equal(M.masteryLevel({ attempts: 3, accuracy: 0.9 }), 'acquisito');
  assert.equal(M.masteryLevel({ attempts: 3, accuracy: 0.7 }, { accThr: 0.6 }), 'acquisito');
});
