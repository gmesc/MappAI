'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-active-study-core.js');

// ── normalizeText ────────────────────────────────────────────────────────────
test('normalizeText: minuscole, senza accenti, punteggiatura via', () => {
  assert.equal(C.normalizeText('  Fotosìntesi, Clorofilliana!  '), 'fotosintesi clorofilliana');
});

// ── levenshtein / similarity / labelMatches ─────────────────────────────────
test('levenshtein: base', () => {
  assert.equal(C.levenshtein('gatto', 'gatto'), 0);
  assert.equal(C.levenshtein('gatto', 'gatti'), 1);
  assert.equal(C.levenshtein('', 'abc'), 3);
});

test('labelMatches: tollera refusi ma non risposte diverse', () => {
  assert.equal(C.labelMatches('fotosintesi', 'Fotosìntesi'), true);       // accento
  assert.equal(C.labelMatches('fotosintsi', 'Fotosintesi'), true);        // refuso
  assert.equal(C.labelMatches('respirazione', 'Fotosintesi'), false);     // concetto diverso
});

// ── answerMatches (quiz) ─────────────────────────────────────────────────────
test('answerMatches: uguaglianza normalizzata', () => {
  assert.equal(C.answerMatches(' Roma ', 'roma'), true);
});

test('answerMatches: "Roma" NON matcha "Romania" (ratio lunghezze)', () => {
  assert.equal(C.answerMatches('Roma', 'Romania'), false);
  assert.equal(C.answerMatches('Romania', 'Roma'), false);
});

test('answerMatches: contenimento con lunghezze comparabili passa', () => {
  assert.equal(C.answerMatches('la fotosintesi', 'fotosintesi'), true);
});

test('answerMatches: vuoti → false', () => {
  assert.equal(C.answerMatches('', 'x'), false);
  assert.equal(C.answerMatches('x', ''), false);
});

// ── jaccardWords (anti-pappagallo) ──────────────────────────────────────────
test('jaccardWords: copia letterale ≈ 1', () => {
  const src = 'La fotosintesi trasforma la luce solare in energia chimica';
  assert.ok(C.jaccardWords(src, src) >= 0.99);
});

test('jaccardWords: parafrasi vera sotto la soglia 0.8', () => {
  const src = 'La fotosintesi trasforma la luce solare in energia chimica per la pianta';
  const par = 'Le piante usano il sole per produrre il loro nutrimento';
  assert.ok(C.jaccardWords(src, par) < 0.8);
});

// ── lcsLength / sequenceScore (modo 7: credito parziale) ────────────────────
test('lcsLength: base', () => {
  assert.equal(C.lcsLength(['a', 'b', 'c'], ['a', 'b', 'c']), 3);
  assert.equal(C.lcsLength(['a', 'b', 'c'], ['c', 'b', 'a']), 1);
});

test('sequenceScore: sequenza perfetta = 100%', () => {
  const r = C.sequenceScore(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']);
  assert.equal(r.accuracy, 100);
  assert.equal(r.score, 3);
});

test('sequenceScore: uno scambio adiacente NON vale zero', () => {
  // ordine a-c-b-d: con lo scoring a coppie esatte varrebbe quasi 0
  const r = C.sequenceScore(['a', 'c', 'b', 'd'], ['a', 'b', 'c', 'd']);
  assert.ok(r.accuracy >= 60, `atteso ≥60, avuto ${r.accuracy}`);
});

test('sequenceScore: ordine inverso ≈ 0', () => {
  const r = C.sequenceScore(['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd']);
  assert.equal(r.score, 0);
});

test('sequenceScore: studente senza catena → 0 ma total corretto', () => {
  const r = C.sequenceScore([], ['a', 'b', 'c']);
  assert.equal(r.score, 0);
  assert.equal(r.total, 2);
});

// ── pickDistantBranchIndex (modo 5: intruso non plausibile) ─────────────────
test('pickDistantBranchIndex: sceglie il ramo lessicalmente più lontano', () => {
  const leaf = 'clorofilla pigmento verde della fotosintesi nelle foglie';
  const idx = C.pickDistantBranchIndex(leaf, [
    'fotosintesi clorofilla luce foglie pigmenti',       // vicino
    'rivoluzione francese assemblea nazionale bastiglia' // lontano
  ]);
  assert.equal(idx, 1);
});

test('pickDistantBranchIndex: lista vuota → -1', () => {
  assert.equal(C.pickDistantBranchIndex('x', []), -1);
});

// ── rateFromSeconds (fluenza per-item) ──────────────────────────────────────
test('rateFromSeconds: 10s → 6/min', () => {
  assert.equal(C.rateFromSeconds(10), 6);
});

test('rateFromSeconds: cap a 30 (anti click istantaneo)', () => {
  assert.equal(C.rateFromSeconds(0.1), 30);
});

test('rateFromSeconds: input non valido → null', () => {
  assert.equal(C.rateFromSeconds(0), null);
  assert.equal(C.rateFromSeconds(-5), null);
  assert.equal(C.rateFromSeconds('x'), null);
});
