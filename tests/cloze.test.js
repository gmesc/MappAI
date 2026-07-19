'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-cloze.js');

test('makeCloze: oscura le etichette presenti (parole intere)', () => {
  const r = C.makeCloze('Il Glucosio deriva dalla Fotosintesi.', ['Glucosio', 'Fotosintesi']);
  assert.deepEqual(r.blanks.sort(), ['Fotosintesi', 'Glucosio']);
  // i segmenti ricostruiscono il testo
  const recon = r.segments.map(s => s.text != null ? s.text : s.blank).join('');
  assert.equal(recon, 'Il Glucosio deriva dalla Fotosintesi.');
});

test('makeCloze: confini di parola — non oscura dentro un\'altra parola', () => {
  const r = C.makeCloze('Roma e Romania.', ['Roma']);
  assert.deepEqual(r.blanks, ['Roma']);          // solo "Roma" intero
  const blanksText = r.segments.filter(s => s.blank != null).map(s => s.blank);
  assert.deepEqual(blanksText, ['Roma']);
  assert.ok(r.segments.some(s => s.text && s.text.includes('Romania'))); // "Romania" resta nel testo
});

test('makeCloze: scarta termini < 4 caratteri', () => {
  const r = C.makeCloze('Il re va a casa.', ['re', 'va']);
  assert.equal(r.blanks.length, 0);
});

test('makeCloze: rispetta il tetto max', () => {
  const r = C.makeCloze('Alfa Beta Gamma Delta.', ['Alfa', 'Beta', 'Gamma', 'Delta'], { max: 2 });
  assert.equal(r.blanks.length, 2);
});

test('makeCloze: niente match → nessun blank', () => {
  const r = C.makeCloze('Testo senza concetti collegati.', ['Inesistente']);
  assert.equal(r.blanks.length, 0);
  assert.equal(r.segments.length, 1);
});

test('isCloseMatch: esatto, case e accenti', () => {
  assert.ok(C.isCloseMatch('glucosio', 'Glucosio'));
  assert.ok(C.isCloseMatch('neutralita', 'Neutralità'));
});

test('isCloseMatch: plurale/troncamento e refuso piccolo', () => {
  assert.ok(C.isCloseMatch('glucosi', 'Glucosio'));   // troncamento
  assert.ok(C.isCloseMatch('glukosio', 'Glucosio'));  // 1 refuso
});

test('isCloseMatch: vuoto o lontano → false', () => {
  assert.equal(C.isCloseMatch('', 'Glucosio'), false);
  assert.equal(C.isCloseMatch('xyz', 'Glucosio'), false);
});

test('levenshtein: distanze base', () => {
  assert.equal(C.levenshtein('casa', 'casa'), 0);
  assert.equal(C.levenshtein('casa', 'cassa'), 1);
  assert.equal(C.levenshtein('', 'abc'), 3);
});

test('makeCloze: back-compat senza seed → termini più lunghi primi', () => {
  // 4 candidati, max 2 → i due più lunghi (Delta/Gamma per lunghezza pari usa ordine desc stabile)
  const r = C.makeCloze('Alfa Beta Gamma Delta Epsilon.', ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon'], { max: 2 });
  assert.equal(r.blanks.length, 2);
  // Epsilon (7) è il più lungo → deve essere tra i buchi
  assert.ok(r.blanks.includes('Epsilon'));
});

test('makeCloze: seed → deterministico a parità di seed, varia tra seed diversi', () => {
  const terms = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Omega'];
  const text = 'Alfa Beta Gamma Delta Epsilon Zeta Omega insieme.';
  const a1 = C.makeCloze(text, terms, { max: 2, seed: 'sessione-1' }).blanks.join('|');
  const a2 = C.makeCloze(text, terms, { max: 2, seed: 'sessione-1' }).blanks.join('|');
  assert.equal(a1, a2, 'stesso seed → stessi buchi (riproducibile per ripasso)');
  // almeno un seed su alcuni produce una selezione diversa dal default
  const def = C.makeCloze(text, terms, { max: 2 }).blanks.join('|');
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  const anyDifferent = seeds.some(s => C.makeCloze(text, terms, { max: 2, seed: s }).blanks.join('|') !== def);
  assert.ok(anyDifferent, 'almeno un seed varia la selezione rispetto al default');
});

test('makeCloze: seed non rompe non-sovrapposizione né il tetto max', () => {
  const terms = ['Fotosintesi', 'Glucosio', 'Clorofilla', 'Luce', 'Acqua'];
  const r = C.makeCloze('La Fotosintesi usa Luce, Acqua e Clorofilla per il Glucosio.', terms, { max: 3, seed: 'x' });
  assert.ok(r.blanks.length <= 3);
  // i blank sono termini reali presenti nel testo
  r.blanks.forEach(b => assert.ok('La Fotosintesi usa Luce, Acqua e Clorofilla per il Glucosio.'.includes(b)));
});
