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
