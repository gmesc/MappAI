'use strict';
/*
 * cloze-live-parity.test.js — GUARD di parità: il grading dei buchi-relazione
 * dello Studio attivo (mappai-cloze.js isConnMatch, via core.connGroup) e quello
 * di MappAI Live (mappai-live-core.js matchesCloze, via accept precalcolato da
 * core.connEquivalents) DEVONO dare lo STESSO verdetto per ogni coppia
 * (soluzione, risposta). Regressione presa dalla review 19/7/26 (forme articolate).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const CLOZE = require(path.join(__dirname, '..', 'public', 'js', 'mappai-cloze.js'));   // isConnMatch
const CZC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-causal-core.js')); // connGroup/connEquivalents/CONNECTIVES
const LC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-live-core.js'));   // matchesCloze

test('parità in-app ↔ Live su tutte le coppie (soluzione × risposta)', () => {
  const surfaces = [];
  CZC.CONNECTIVES.forEach(c => { if (!c.answerOnly) surfaces.push(c.conn); });
  ['Grazie ai', 'grazie agli', 'a causa della', 'a causa dei', "invece dell'",
    'invece delle', 'portò alle', 'Invece della'].forEach(s => surfaces.push(s));

  const answers = [];
  CZC.CONNECTIVES.forEach(c => answers.push(c.conn));
  ['grazie a', 'grazie ai', 'grazie agli', 'grazie alla', 'a causa di', 'a causa della',
    'a causa dei', "a causa dell'", 'poiché', 'perché', 'quindi', 'causa', 'genera', 'porta a',
    'poiché la luce colpisce forte', 'invece di', 'invece della', 'invece dei', 'anziché',
    'clorofilla', 'xyz', ''].forEach(a => answers.push(a));

  let diverg = 0, checks = 0;
  const sample = [];
  for (const e of surfaces) {
    const accept = CZC.connEquivalents(e);
    const conn = !!CZC.connGroup(e);
    for (const a of answers) {
      checks++;
      const inApp = CLOZE.isConnMatch(a, e);
      const live = LC.matchesCloze(a, { blank: e, conn: conn, accept: accept });
      if (inApp !== live) { diverg++; if (sample.length < 10) sample.push(`e="${e}" a="${a}" inApp=${inApp} live=${live}`); }
    }
  }
  assert.ok(checks > 1000, 'batteria troppo piccola: ' + checks);
  assert.strictEqual(diverg, 0, 'divergenze di parità:\n' + sample.join('\n'));
});

test('la lista accept NON supera il cap del server (48)', () => {
  const CZC2 = CZC;
  let maxLen = 0;
  CZC2.CONNECTIVES.forEach(c => { maxLen = Math.max(maxLen, CZC2.connEquivalents(c.conn).length); });
  assert.ok(maxLen <= 48, 'accept espansa oltre il cap: ' + maxLen);
});

test('parità clozeBlankScore in-app ↔ Live (score + missing)', () => {
  const cases = [
    ['pianta acquatica', 'pianta acquatica'], ['pianta', 'pianta acquatica'],
    ['marchio', 'marchio di fabbrica'], ['marchio di', 'marchio di fabbrica'],
    ['acquatica', 'pianta acquatica'], ['il', 'il re'], ['la', 'la Rivoluzione francese'],
    ['Cellulosa', 'Cellulosa'], ['sbagliato', 'pianta acquatica'], ['', 'pianta acquatica'],
    ['Pianta Acquatica', 'pianta acquatica']
  ];
  for (const [given, expected] of cases) {
    const inApp = CLOZE.clozeBlankScore(given, expected, { conn: false });
    const live = LC.clozeBlankScore(given, { blank: expected });
    assert.strictEqual(inApp.score, live.score, `score diverge per "${given}"→"${expected}"`);
    assert.strictEqual(inApp.missing, live.missing, `missing diverge per "${given}"→"${expected}"`);
  }
});
