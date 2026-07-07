'use strict';
// Mappa-mondo (contratto §11: mappai-dungeon-world@1) — logica pura
// Design: docs/game-design/MEMORY_DUNGEON_DESIGN.md §20
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-dungeon-core.js');

// Mondo di comodo: due stanze 3×3 (A: x1-3, B: x5-7) su size 9, collegate da un
// passaggio in (4,2) dove sta il GATE. Spawn in A, memorie in entrambe.
function room(cells, x0, z0, w, h) {
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
    cells.push({ x, z, biome: 'floor', quota: 0 });
  }
}
function demoWorld(extra) {
  const cells = [];
  room(cells, 1, 1, 3, 3);           // zona A
  room(cells, 5, 1, 3, 3);           // zona B
  cells.push({ x: 4, z: 2, biome: 'floor', quota: 0 });   // passaggio del gate
  return Object.assign({
    schema: 'mappai-dungeon-world@1',
    size: 9, sub: 3, seed: 1,
    cells,
    zones: [
      { id: 'giardino', anchor: { x: 2, z: 2 }, branchHint: null },
      { id: 'foto', anchor: { x: 6, z: 2 }, branchHint: 'Fotosintesi' }
    ],
    slots: [
      { type: 'spawn', x: 1, z: 1 },
      { type: 'memory', x: 3, z: 3 },
      { type: 'memory', x: 5, z: 1 },
      { type: 'memory', x: 7, z: 3 },
      { type: 'gate', x: 4, z: 2, req: { coverage: 0.6, quiz: 2 } }
    ]
  }, extra || {});
}
const codes = (list) => list.map(e => e.code);

// ── worldZones ───────────────────────────────────────────────────────────────
test('worldZones: due stanze + gate → 2 zone, gate le collega entrambe', () => {
  const W = C.worldZones(demoWorld());
  assert.equal(W.zones.length, 2);
  assert.equal(W.gates.length, 1);
  assert.equal(W.gates[0].zoneIdx.length, 2);
});

test('worldZones: anchor dichiarate assegnano id e branchHint', () => {
  const W = C.worldZones(demoWorld());
  const ids = W.zones.map(z => z.id).sort();
  assert.deepEqual(ids, ['foto', 'giardino']);
  const foto = W.zones.find(z => z.id === 'foto');
  assert.equal(foto.branchHint, 'Fotosintesi');
});

test('worldZones: conteggi memory/spawn per zona', () => {
  const W = C.worldZones(demoWorld());
  const giardino = W.zones.find(z => z.id === 'giardino');
  const foto = W.zones.find(z => z.id === 'foto');
  assert.equal(giardino.memory, 1);
  assert.equal(foto.memory, 2);
  assert.equal(W.spawnIdx, W.zones.indexOf(giardino));
});

// ── bindZones (D1) ───────────────────────────────────────────────────────────
test('bindZones: hint fuzzy vince, il resto per capienza', () => {
  const W = C.worldZones(demoWorld());
  const B = C.bindZones(W.zones, [
    { label: 'La Fotosintesi', count: 2 },
    { label: 'Le Cellule', count: 5 }
  ]);
  assert.equal(B.assignments['foto'].label, 'La Fotosintesi');   // hint "Fotosintesi" ⊂ label
  assert.equal(B.assignments['giardino'].label, 'Le Cellule');   // capienza (unico rimasto)
});

test('bindZones: senza hint assegna per capienza, deterministico', () => {
  const plan = demoWorld();
  plan.zones = [];   // nessuna dichiarazione
  const W = C.worldZones(plan);
  const B = C.bindZones(W.zones, [
    { label: 'Grande', count: 9 },
    { label: 'Piccolo', count: 1 }
  ]);
  // la zona con più memorie (2) prende il ramo con più memorie
  const zBig = W.zones.find(z => z.memory === 2);
  assert.equal(B.assignments[zBig.id].label, 'Grande');
});

// ── validateWorld ────────────────────────────────────────────────────────────
test('validateWorld: mondo demo valido (senza rami) → ok', () => {
  const v = C.validateWorld(demoWorld(), null, null);
  assert.deepEqual(codes(v.errors), []);
  assert.equal(v.ok, true);
});

test('validateWorld: schema sbagliato → contract-invalid', () => {
  const v = C.validateWorld(demoWorld({ schema: 'mappai-dungeon-floor@1' }), null, null);
  assert.ok(codes(v.errors).includes('contract-invalid'));
});

test('validateWorld: spawn mancante', () => {
  const p = demoWorld();
  p.slots = p.slots.filter(s => s.type !== 'spawn');
  assert.ok(codes(C.validateWorld(p, null, null).errors).includes('spawn-missing'));
});

test('validateWorld: gate in mezzo alla stanza → gate-not-boundary', () => {
  const p = demoWorld();
  p.slots.push({ type: 'gate', x: 2, z: 2 });   // dentro la zona A
  assert.ok(codes(C.validateWorld(p, null, null).errors).includes('gate-not-boundary'));
});

test('validateWorld: zona isolata senza gate → zone-unreachable', () => {
  const p = demoWorld();
  room(p.cells, 1, 6, 2, 2);   // isoletta staccata in basso
  p.slots.push({ type: 'memory', x: 1, z: 6 });
  const v = C.validateWorld(p, null, null);
  assert.ok(codes(v.errors).includes('zone-unreachable'));
});

test('validateWorld: catena di 3 zone attraverso 2 gate → tutte raggiungibili', () => {
  const cells = [];
  room(cells, 1, 1, 3, 3); room(cells, 5, 1, 3, 3); room(cells, 9, 1, 3, 3);
  cells.push({ x: 4, z: 2, biome: 'floor' });
  cells.push({ x: 8, z: 2, biome: 'floor' });
  const p = {
    schema: 'mappai-dungeon-world@1', size: 13, cells, zones: [],
    slots: [
      { type: 'spawn', x: 1, z: 1 },
      { type: 'memory', x: 6, z: 2 }, { type: 'memory', x: 10, z: 2 },
      { type: 'gate', x: 4, z: 2 }, { type: 'gate', x: 8, z: 2 }
    ]
  };
  const v = C.validateWorld(p, null, null);
  assert.ok(!codes(v.errors).includes('zone-unreachable'));
  assert.equal(v.ok, true);
});

test('validateWorld: gate su cella muro → slot-blocked', () => {
  const p = demoWorld();
  p.cells.push({ x: 4, z: 4, biome: 'wall', alt: 2 });
  p.slots.push({ type: 'gate', x: 4, z: 4 });
  assert.ok(codes(C.validateWorld(p, null, null).errors).includes('slot-blocked'));
});

test('validateWorld: req gate rotto → warning gate-req-invalid (default D2)', () => {
  const p = demoWorld();
  p.slots.find(s => s.type === 'gate').req = { coverage: 7 };   // fuori 0..1
  const v = C.validateWorld(p, null, null);
  assert.ok(codes(v.warnings).includes('gate-req-invalid'));
  assert.equal(v.ok, true);
});

test('validateWorld: zona senza memorie → warning, ma la zona spawn (giardino) è esente', () => {
  const p = demoWorld();
  p.slots = p.slots.filter(s => !(s.type === 'memory' && s.x === 3));   // svuota zona A (spawn)
  const v = C.validateWorld(p, null, null);
  assert.ok(!codes(v.warnings).includes('zone-no-memory'));   // spawn esente (D7)
  const p2 = demoWorld();
  p2.slots = p2.slots.filter(s => !(s.type === 'memory' && s.x >= 5));  // svuota zona B
  const v2 = C.validateWorld(p2, null, null);
  assert.ok(codes(v2.warnings).includes('zone-no-memory'));
});

test('validateWorld: coverage per zona coi rami (severity default = error)', () => {
  const v = C.validateWorld(demoWorld(), null, [
    { label: 'La Fotosintesi', count: 5 }    // zona foto ha 2 memorie su 5
  ]);
  const e = v.errors.find(x => x.code === 'zone-memory-missing');
  assert.ok(e);
  assert.equal(e.need, 5);
  assert.equal(e.have, 2);
});

test('validateWorld: coverage per zona rispettata → ok', () => {
  const v = C.validateWorld(demoWorld(), null, [
    { label: 'La Fotosintesi', count: 2 }
  ]);
  assert.ok(!codes(v.errors).includes('zone-memory-missing'));
});

test('validateWorld: gatekeeper doppio → error', () => {
  const p = demoWorld();
  p.slots.push({ type: 'gatekeeper', x: 7, z: 1 });
  p.slots.push({ type: 'gatekeeper', x: 6, z: 1 });
  assert.ok(codes(C.validateWorld(p, null, null).errors).includes('gatekeeper-multiple'));
});

// ── checkGateReq (D2) ────────────────────────────────────────────────────────
test('checkGateReq: default D2 quando req assente o rotto', () => {
  const d = C.checkGateReq(null, { coverage: 0.7 });
  assert.equal(d.req.coverage, 0.6);
  assert.equal(d.quiz, 2);
  assert.equal(d.pass, true);
  const rotto = C.checkGateReq({ coverage: 7 }, { coverage: 0.1 });
  assert.equal(rotto.req.coverage, 0.6);   // default al posto del req rotto
  assert.deepEqual(rotto.fail, ['coverage']);
});

test('checkGateReq: coverage insufficiente blocca, mastery valutata', () => {
  const r = C.checkGateReq({ coverage: 0.8, mastery: 0.5, quiz: 1 }, { coverage: 0.9, mastery: 0.2 });
  assert.equal(r.pass, false);
  assert.deepEqual(r.fail, ['mastery']);
  const ok = C.checkGateReq({ coverage: 0.8, quiz: 3 }, { coverage: 1 });
  assert.equal(ok.pass, true);
  assert.equal(ok.quiz, 3);
});
