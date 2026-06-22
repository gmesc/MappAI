'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-celeration.js');

// Mezzogiorno locale → dayKey stabile a prescindere dal fuso.
const d1 = new Date(2026, 5, 21, 12).getTime(); // 2026-06-21
const d2 = new Date(2026, 5, 22, 12).getTime(); // 2026-06-22

test('dayKey: YYYY-MM-DD', () => {
  assert.equal(C.dayKey(d1), '2026-06-21');
  assert.equal(C.dayKey(d2), '2026-06-22');
});

test('buildSeries: aggrega per giorno acc e rate', () => {
  const store = {
    'A::cloze': { history: [{ ts: d1, acc: 0.5, rate: 4 }, { ts: d2, acc: 0.8, rate: 10 }] },
    'B::richiamo': { history: [{ ts: d1, acc: 1, rate: null }] }
  };
  const s = C.buildSeries(store);
  assert.deepEqual(s.days, ['2026-06-21', '2026-06-22']);
  assert.equal(s.acc[0], 0.75); // media(0.5, 1)
  assert.equal(s.acc[1], 0.8);
  assert.equal(s.rate[0], 4);   // solo i rate presenti (B null escluso)
  assert.equal(s.rate[1], 10);
});

test('buildSeries: giorno senza rate → rate null', () => {
  const store = { 'A::richiamo': { history: [{ ts: d1, acc: 1, rate: null }] } };
  const s = C.buildSeries(store);
  assert.equal(s.rate[0], null);
  assert.equal(s.acc[0], 1);
});

test('buildSeries: store vuoto → serie vuota', () => {
  const s = C.buildSeries({});
  assert.deepEqual(s.days, []);
});
