'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/js/mappai-palace.js');

test('buildRooms: rami L1 = stanze, discendenti = oggetti (min 2)', () => {
  const nodes = [
    { id: 'R', level: 0, label: 'Root' },
    { id: 'A', level: 1, label: 'Stanza A' },
    { id: 'A1', level: 2, label: 'Uno', desc: 'desc uno' },
    { id: 'A2', level: 2, label: 'Due' },
    { id: 'B', level: 1, label: 'Stanza B' },
    { id: 'B1', level: 2, label: 'Tre' } // 1 solo → niente stanza
  ];
  const links = [
    { source: 'R', target: 'A' }, { source: 'R', target: 'B' },
    { source: 'A', target: 'A1' }, { source: 'A', target: 'A2' },
    { source: 'B', target: 'B1' }
  ];
  const rooms = P.buildRooms(nodes, links);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].label, 'Stanza A');
  assert.deepEqual(rooms[0].items.map(i => i.label).sort(), ['Due', 'Uno']);
});

test('buildRooms: scende in profondità (nipoti)', () => {
  const nodes = [
    { id: 'R', level: 0 }, { id: 'A', level: 1, label: 'A' },
    { id: 'A1', level: 2, label: 'figlio' }, { id: 'A1a', level: 3, label: 'nipote' }
  ];
  const links = [{ source: 'R', target: 'A' }, { source: 'A', target: 'A1' }, { source: 'A1', target: 'A1a' }];
  const rooms = P.buildRooms(nodes, links);
  assert.equal(rooms.length, 1);
  assert.deepEqual(rooms[0].items.map(i => i.label).sort(), ['figlio', 'nipote']);
});

test('matchRecall: conta i ricordati (tollerante a refusi/accenti)', () => {
  const r = P.matchRecall(['Glucosio', 'Clorofilla', 'Fotosintesi'], 'glucosio\nclorofila\nqualcosa');
  assert.equal(r.total, 3);
  assert.equal(r.matched, 2);              // Glucosio + Clorofilla(refuso); Fotosintesi mancante
  assert.ok(Math.abs(r.score - 2 / 3) < 1e-9);
  assert.equal(r.result.find(x => x.label === 'Fotosintesi').found, false);
});

test('matchRecall: separatori riga/virgola/; ', () => {
  const r = P.matchRecall(['Alfa', 'Beta'], 'Alfa, Beta');
  assert.equal(r.matched, 2);
});

test('isMatch: vuoto e lontano → false', () => {
  assert.equal(P.isMatch('', 'Alfa'), false);
  assert.equal(P.isMatch('zzz', 'Alfa'), false);
});

// ── perItemRate: fluenza per-item, non media di stanza (fix stile T2) ──

test('perItemRate: tempo di stanza ripartito sui trovati (= matched/min)', () => {
  assert.equal(P.perItemRate(4, 60), 4);   // 4 trovati in 60s → 15s/item → 4/min
  assert.equal(P.perItemRate(2, 30), 4);   // stesso ritmo, stanza più corta
  assert.equal(P.perItemRate(1, 120), 0.5);
});

test('perItemRate: cap 30 come rateFromSeconds', () => {
  assert.equal(P.perItemRate(10, 2), 30);  // 0.2s/item → cap
});

test('perItemRate: coerente con rateFromSeconds dello Studio Attivo', () => {
  const ASC = require('../public/js/mappai-active-study-core.js');
  assert.equal(P.perItemRate(3, 45), ASC.rateFromSeconds(45 / 3));
});

test('perItemRate: 0 trovati o input non validi → null (nessuna osservazione)', () => {
  assert.equal(P.perItemRate(0, 60), null);
  assert.equal(P.perItemRate(3, 0), null);
  assert.equal(P.perItemRate(NaN, 60), null);
  assert.equal(P.perItemRate(3, -5), null);
});
