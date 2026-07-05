'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-dungeon-core.js');

// ── capEvents ────────────────────────────────────────────────────────────────
test('capEvents: sotto il cap non tocca nulla', () => {
  const a = [1, 2, 3];
  assert.deepEqual(C.capEvents(a, 10), [1, 2, 3]);
});

test('capEvents: oltre il cap tiene il 75% più recente', () => {
  const a = Array.from({ length: 100 }, (_, i) => i);
  const out = C.capEvents(a, 80);
  assert.equal(out.length, 60);           // floor(80*0.75)
  assert.equal(out[out.length - 1], 99);  // i più recenti sopravvivono
  assert.equal(out[0], 40);               // i più vecchi buttati
});

test('capEvents: input non-array → []', () => {
  assert.deepEqual(C.capEvents(null, 10), []);
  assert.deepEqual(C.capEvents('x', 10), []);
});

// ── strHash ──────────────────────────────────────────────────────────────────
test('strHash: deterministico e sensibile al contenuto', () => {
  assert.equal(C.strHash('abc'), C.strHash('abc'));
  assert.notEqual(C.strHash('abc'), C.strHash('abd'));
  assert.equal(typeof C.strHash(''), 'string');
});

// ── validQuizItem ────────────────────────────────────────────────────────────
const GOOD = { stem: 'La Commissione Bergier aveva il compito di', a1: 'esaminare le accuse contro la Svizzera', a2: 'processare i banchieri', a3: 'ridefinire i confini', correct: 1 };

test('validQuizItem: item buono passa', () => {
  assert.equal(C.validQuizItem(GOOD), true);
});

test('validQuizItem: stem troppo corto → falso', () => {
  assert.equal(C.validQuizItem({ ...GOOD, stem: 'La Commissione' }), false);
});

test('validQuizItem: meno di 2 opzioni distinte → falso', () => {
  assert.equal(C.validQuizItem({ ...GOOD, a2: '', a3: null }), false);
  assert.equal(C.validQuizItem({ ...GOOD, a2: GOOD.a1, a3: '' }), false);
});

test('validQuizItem: correct fuori range o opzione vuota → falso', () => {
  assert.equal(C.validQuizItem({ ...GOOD, correct: 0 }), false);
  assert.equal(C.validQuizItem({ ...GOOD, correct: 5 }), false);
  assert.equal(C.validQuizItem({ ...GOOD, a1: '  ', correct: 1 }), false);
});

test('validQuizItem: stem che regala la risposta → falso', () => {
  const leak = { stem: 'La risposta esaminare le accuse contro la Svizzera è di', a1: 'esaminare le accuse contro la Svizzera', a2: 'altro', correct: 1 };
  assert.equal(C.validQuizItem(leak), false);
});

test('validQuizItem: opzione oltre 12 parole → falso', () => {
  const long = { ...GOOD, a2: 'una opzione davvero molto ma molto ma molto ma molto troppo lunga per essere leggibile' };
  assert.equal(C.validQuizItem(long), false);
});

test('validQuizItem: legacy con q invece di stem passa', () => {
  assert.equal(C.validQuizItem({ q: 'Quale era il compito della Commissione?', a1: 'esaminare le accuse', a2: 'processare', correct: 1 }), true);
});

// ── zpdFormat ────────────────────────────────────────────────────────────────
test('zpdFormat: nuovo → tf, in-corso → mc, acquisito/fluente → open', () => {
  assert.equal(C.zpdFormat('nuovo', 10), 'tf');
  assert.equal(C.zpdFormat('in-corso', 10), 'mc');
  assert.equal(C.zpdFormat('acquisito', 10), 'open');
  assert.equal(C.zpdFormat('fluente', 10), 'open');
});

test('zpdFormat: cap tentativi — acquisito con <3 tentativi resta mc (anti-inflazione EWMA)', () => {
  assert.equal(C.zpdFormat('acquisito', 1), 'mc');
  assert.equal(C.zpdFormat('fluente', 2), 'mc');
  assert.equal(C.zpdFormat('acquisito', 3), 'open');
});

test('zpdFormat: default nuovo/0 → tf', () => {
  assert.equal(C.zpdFormat(undefined, 0), 'tf');
});

// ── stratifiedPick ───────────────────────────────────────────────────────────
test('stratifiedPick: ogni macro-area rappresentata se count ≥ #gruppi', () => {
  const entries = [
    { id: 1, macro: 'A', attempts: 5, need: 0 }, { id: 2, macro: 'A', attempts: 0, need: 2 },
    { id: 3, macro: 'B', attempts: 1, need: 1 }, { id: 4, macro: 'C', attempts: 0, need: 0 },
  ];
  const pick = C.stratifiedPick(entries, 3);
  const macros = new Set(pick.map(e => e.macro));
  assert.equal(pick.length, 3);
  assert.deepEqual([...macros].sort(), ['A', 'B', 'C']);
});

test('stratifiedPick: dentro il gruppo priorità ai mai testati', () => {
  const entries = [
    { id: 1, macro: 'A', attempts: 5, need: 2 },
    { id: 2, macro: 'A', attempts: 0, need: 0 },
  ];
  assert.equal(C.stratifiedPick(entries, 1)[0].id, 2);
});

test('stratifiedPick: count > entries → tutte, senza duplicati', () => {
  const entries = [{ id: 1, macro: 'A' }, { id: 2, macro: 'B' }];
  const pick = C.stratifiedPick(entries, 10);
  assert.equal(pick.length, 2);
  assert.equal(new Set(pick.map(e => e.id)).size, 2);
});

test('stratifiedPick: input vuoto → []', () => {
  assert.deepEqual(C.stratifiedPick([], 3), []);
  assert.deepEqual(C.stratifiedPick(null, 3), []);
});

// ── pickTier ─────────────────────────────────────────────────────────────────
test('pickTier: cloud vince se c\'è la chiave', () => {
  assert.equal(C.pickTier(true, true, false), 'cloud');
  assert.equal(C.pickTier(true, false, false), 'cloud');
});

test('pickTier: locale se modello configurato e non disattivato', () => {
  assert.equal(C.pickTier(false, true, false), 'local');
  assert.equal(C.pickTier(false, true, true), 'off');
});

test('pickTier: nessuna risorsa → off (deterministico)', () => {
  assert.equal(C.pickTier(false, false, false), 'off');
});
