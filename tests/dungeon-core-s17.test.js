'use strict';
// §17 — Ponte Studio Attivo ↔ Dungeon: logica pura (mappai-dungeon-core.js)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-dungeon-core.js');
const AS = require('../public/js/mappai-active-study-core.js'); // simFn per pickMisfiled

// ── buildParentOf ────────────────────────────────────────────────────────────
const NODES = [
  { id: 'root', level: 0 }, { id: 'a', level: 1 }, { id: 'b', level: 1 },
  { id: 'a1', level: 2 }, { id: 'a2', level: 3 }, { id: 'a3', level: 4 },
];
const LINKS = [
  { source: 'root', target: 'a' }, { source: 'root', target: 'b' },
  { source: 'a', target: 'a1' }, { source: 'a1', target: 'a2' }, { source: 'a2', target: 'a3' },
  { source: 'a3', target: 'b' },   // cross-link (livelli non adiacenti) → ignorato
];

test('buildParentOf: solo coppie con livelli adiacenti', () => {
  const p = C.buildParentOf(NODES, LINKS);
  assert.equal(p['a'], 'root');
  assert.equal(p['a2'], 'a1');
  assert.equal(p['b'], 'root'); // il cross a3→b non sovrascrive (a3 level 4, b level 1)
});

test('buildParentOf: link con endpoint oggetto (D3)', () => {
  const p = C.buildParentOf(NODES, [{ source: { id: 'root' }, target: { id: 'a' } }]);
  assert.equal(p['a'], 'root');
});

// ── findBestChain ────────────────────────────────────────────────────────────
test('findBestChain: trova la catena a-a1-a2-a3', () => {
  const p = C.buildParentOf(NODES, LINKS);
  const chain = C.findBestChain(p);
  assert.deepEqual(chain, ['a', 'a1', 'a2', 'a3']);
});

test('findBestChain: albero cespuglioso senza catena ≥3 → null', () => {
  // root con 3 figli, nessuno con un solo figlio
  const p = { a: 'root', b: 'root', c: 'root' };
  assert.equal(C.findBestChain(p), null);
});

// ── clozeGaps ────────────────────────────────────────────────────────────────
test('clozeGaps: maschera parole-contenuto distinte', () => {
  const r = C.clozeGaps('La fotosintesi clorofilliana trasforma la luce solare in energia chimica', 3);
  assert.ok(r);
  assert.equal(r.gaps.length, 3);
  r.gaps.forEach(g => assert.ok(g.length >= 5));
  r.gaps.forEach(g => assert.ok(!r.masked.includes(g), `"${g}" ancora nel testo mascherato`));
  assert.ok(r.masked.includes('▁▁▁▁▁'));
});

test('clozeGaps: gaps in ordine di apparizione', () => {
  const txt = 'zanzara piccola vola sopra elefante gigantesco della savana';
  const r = C.clozeGaps(txt, 2);
  const i0 = txt.indexOf(r.gaps[0]), i1 = txt.indexOf(r.gaps[1]);
  assert.ok(i0 < i1);
});

test('clozeGaps: testo troppo povero → null', () => {
  assert.equal(C.clozeGaps('ciao a te', 3), null);
  assert.equal(C.clozeGaps('', 3), null);
});

// ── pickMisfiled ─────────────────────────────────────────────────────────────
const ENTRIES = [
  { id: 1, label: 'Clorofilla', desc: 'pigmento verde della fotosintesi nelle foglie', macro: 'Fotosintesi' },
  { id: 2, label: 'Luce solare', desc: 'energia luminosa catturata dalle foglie', macro: 'Fotosintesi' },
  { id: 3, label: 'Stomi', desc: 'aperture delle foglie per lo scambio di gas', macro: 'Fotosintesi' },
  { id: 4, label: 'Bastiglia', desc: 'fortezza presa durante la rivoluzione francese', macro: 'Rivoluzione' },
  { id: 5, label: 'Glucosio', desc: 'zucchero prodotto dalla fotosintesi nelle foglie', macro: 'Zuccheri' },
];

test('pickMisfiled: host = macro più popolosa, intruso = più distante', () => {
  const r = C.pickMisfiled(ENTRIES, AS.jaccardWords);
  assert.ok(r);
  assert.equal(r.host, 'Fotosintesi');
  assert.equal(r.intruder.id, 4); // Bastiglia è lessicalmente più lontana di Glucosio
  assert.ok(r.hostEntries.length >= 2 && r.hostEntries.length <= 4);
});

test('pickMisfiled: una sola macro → null', () => {
  const one = ENTRIES.filter(e => e.macro === 'Fotosintesi');
  assert.equal(C.pickMisfiled(one, AS.jaccardWords), null);
});

test('pickMisfiled: nessuna macro con ≥2 voci → null', () => {
  assert.equal(C.pickMisfiled([ENTRIES[0], ENTRIES[3]], AS.jaccardWords), null);
});
