'use strict';
// Piani custom dal vault (contratto mappai-dungeon-floor@1) — logica pura
// Design: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-dungeon-core.js');

// Piano di comodo: 6×6, croce di pavimento su fondo void, un muro, una pozza
function demoPlan(extra) {
  return Object.assign({
    schema: 'mappai-dungeon-floor@1',
    id: 'piano-1',
    level: 1,
    size: 6,
    cells: [
      { x: 1, z: 1, biome: 'floor', quota: 0 },
      { x: 2, z: 1, biome: 'floor', quota: 0 },
      { x: 3, z: 1, biome: 'floor', quota: 0 },
      { x: 2, z: 2, biome: 'floor', quota: 0 },
      { x: 2, z: 3, biome: 'floor', quota: 0 },
      { x: 4, z: 1, biome: 'wall', alt: 2 },
      { x: 2, z: 4, biome: 'water', quota: -0.5 }
    ],
    slots: [
      { type: 'spawn', x: 1, z: 1 },
      { type: 'stairs', x: 2, z: 3 },
      { type: 'memory', x: 3, z: 1 },
      { type: 'memory', x: 2, z: 2 },
      { type: 'enemy', x: 2, z: 1 }
    ]
  }, extra || {});
}

// ── planToGrid ───────────────────────────────────────────────────────────────
test('planToGrid: floor=0, wall/water/void=1, waterKeys estratte', () => {
  const g = C.planToGrid(demoPlan());
  assert.equal(g.w, 6);
  assert.equal(g.map['1,1'], 0);          // floor camminabile
  assert.equal(g.map['4,1'], 1);          // wall
  assert.equal(g.map['2,4'], 1);          // water blocca
  assert.equal(g.map['0,0'], 1);          // cella assente = void = muro
  assert.deepEqual(g.waterKeys, ['2,4']);
});

test('planToGrid: blocca esplicito vince sul biome', () => {
  const p = demoPlan();
  p.cells.push({ x: 5, z: 5, biome: 'floor', blocca: true });
  const g = C.planToGrid(p);
  assert.equal(g.map['5,5'], 1);
});

test('planToGrid: contratto invalido → null', () => {
  assert.equal(C.planToGrid(null), null);
  assert.equal(C.planToGrid({ size: 6 }), null);                    // cells mancanti
  assert.equal(C.planToGrid({ size: 2, cells: [] }), null);         // size fuori range
  assert.equal(C.planToGrid({ size: 99, cells: [] }), null);
});

test('planToGrid: celle fuori griglia ignorate', () => {
  const p = demoPlan();
  p.cells.push({ x: 99, z: 0, biome: 'floor' });
  p.cells.push({ x: -1, z: 0, biome: 'floor' });
  const g = C.planToGrid(p);
  assert.equal(g.map['99,0'], undefined);
});

// ── normalizePlanSlots ───────────────────────────────────────────────────────
test('normalizePlanSlots: slot validi smistati per tipo', () => {
  const p = demoPlan();
  const g = C.planToGrid(p);
  const s = C.normalizePlanSlots(p, g);
  assert.equal(s.spawn, '1,1');
  assert.equal(s.stairs, '2,3');
  assert.deepEqual(s.memory, ['3,1', '2,2']);
  assert.deepEqual(s.enemy, ['2,1']);
  assert.equal(s.dropped.length, 0);
});

test('normalizePlanSlots: slot su cella non camminabile → dropped', () => {
  const p = demoPlan();
  p.slots.push({ type: 'memory', x: 4, z: 1 });   // sul muro
  p.slots.push({ type: 'memory', x: 0, z: 0 });   // sul void
  const g = C.planToGrid(p);
  const s = C.normalizePlanSlots(p, g);
  assert.equal(s.memory.length, 2);               // solo i validi
  assert.equal(s.dropped.length, 2);
});

test('normalizePlanSlots: spawn mancante → fallback prima cella libera', () => {
  const p = demoPlan();
  p.slots = p.slots.filter(s => s.type !== 'spawn');
  const g = C.planToGrid(p);
  const s = C.normalizePlanSlots(p, g);
  assert.ok(s.spawn);
  assert.equal(g.map[s.spawn], 0);
});

test('normalizePlanSlots: tipi singolari — vale il primo', () => {
  const p = demoPlan();
  p.slots.push({ type: 'spawn', x: 2, z: 2 });
  const g = C.planToGrid(p);
  const s = C.normalizePlanSlots(p, g);
  assert.equal(s.spawn, '1,1');
});

// ── validatePlan (contratto §4) ──────────────────────────────────────────────
const codes = (list) => list.map(e => e.code);

test('validatePlan: piano demo valido → ok (coverage 2/2)', () => {
  const v = C.validatePlan(demoPlan(), null, 2);
  assert.equal(v.ok, true);
  assert.equal(v.errors.length, 0);
});

test('validatePlan: contratto rotto → contract-invalid', () => {
  const v = C.validatePlan({ size: 99, cells: [] }, null, null);
  assert.equal(v.ok, false);
  assert.deepEqual(codes(v.errors), ['contract-invalid']);
});

test('validatePlan: spawn mancante / doppio', () => {
  const p1 = demoPlan(); p1.slots = p1.slots.filter(s => s.type !== 'spawn');
  assert.ok(codes(C.validatePlan(p1, null, null).errors).includes('spawn-missing'));
  const p2 = demoPlan(); p2.slots.push({ type: 'spawn', x: 2, z: 2 });
  assert.ok(codes(C.validatePlan(p2, null, null).errors).includes('spawn-multiple'));
});

test('validatePlan: scale su isola isolata → stairs-unreachable', () => {
  const p = demoPlan();
  p.cells.push({ x: 5, z: 5, biome: 'floor' });          // isola non connessa alla croce
  p.slots = p.slots.filter(s => s.type !== 'stairs');
  p.slots.push({ type: 'stairs', x: 5, z: 5 });
  assert.ok(codes(C.validatePlan(p, null, null).errors).includes('stairs-unreachable'));
});

test('validatePlan: gatekeeper = ultimo piano, niente scale insieme', () => {
  const p = demoPlan();                                    // ha già le scale
  p.slots.push({ type: 'gatekeeper', x: 2, z: 2 });
  const v = C.validatePlan(p, null, null);
  assert.ok(codes(v.errors).includes('stairs-on-last-floor'));
  const p2 = demoPlan();
  p2.slots = p2.slots.filter(s => s.type !== 'stairs');
  p2.slots.push({ type: 'gatekeeper', x: 2, z: 3 });       // raggiungibile
  const v2 = C.validatePlan(p2, null, null);
  assert.equal(v2.ok, true);
});

test('validatePlan: né scale né gatekeeper → stairs-missing', () => {
  const p = demoPlan();
  p.slots = p.slots.filter(s => s.type !== 'stairs');
  assert.ok(codes(C.validatePlan(p, null, null).errors).includes('stairs-missing'));
});

test('validatePlan: slot sul muro → slot-blocked', () => {
  const p = demoPlan();
  p.slots.push({ type: 'memory', x: 4, z: 1 });            // muro
  assert.ok(codes(C.validatePlan(p, null, null).errors).includes('slot-blocked'));
});

test('validatePlan: coverage — memorie mancanti = error (default), warning da ruleset', () => {
  const v = C.validatePlan(demoPlan(), null, 5);           // 2 slot, 5 richieste
  const e = v.errors.find(x => x.code === 'memory-missing');
  assert.ok(e); assert.equal(e.need, 5); assert.equal(e.have, 2);
  const rs = { severity: { coverage: 'warning' } };
  const v2 = C.validatePlan(demoPlan(), rs, 5);
  assert.ok(codes(v2.warnings).includes('memory-missing'));
  assert.equal(v2.ok, true);
});

test('validatePlan: coverage "all" — memorie in eccesso segnalate', () => {
  const v = C.validatePlan(demoPlan(), null, 1);           // 2 slot, 1 richiesta
  assert.ok(codes(v.errors).includes('memory-extra'));
});

test('validatePlan: coverage {min:N} — basta il minimo', () => {
  const rs = { memory: { coverage: { min: 2 } } };
  assert.equal(C.validatePlan(demoPlan(), rs, 5).ok, true);
});

test('validatePlan: levelNodeCount null → coverage saltata', () => {
  const v = C.validatePlan(demoPlan(), null, null);
  assert.ok(!codes(v.errors).concat(codes(v.warnings)).some(c => c.startsWith('memory-m') || c === 'memory-extra'));
});

test('validatePlan: memorie vicine → memory-too-close warning (default §3)', () => {
  const p = demoPlan({ size: 40 });
  for (let x = 1; x <= 30; x++) p.cells.push({ x, z: 30, biome: 'floor' });
  p.slots = [
    { type: 'spawn', x: 1, z: 30 }, { type: 'stairs', x: 30, z: 30 },
    { type: 'memory', x: 5, z: 30 }, { type: 'memory', x: 7, z: 30 }   // 2 tile × 3 = 6 blocchi < 40
  ];
  const v = C.validatePlan(p, null, null);
  const w = v.warnings.find(x => x.code === 'memory-too-close');
  assert.ok(w);
  assert.deepEqual(w.at, [[5, 30], [7, 30]]);
  assert.equal(v.ok, true);
});

test('validatePlan: minSpacing insoddisfabile su mappa piccola → rilassata a warning anche se severity error', () => {
  const rs = { severity: { minSpacing: 'error' } };        // 6×6, sub 3 → diag ~21 < 40
  const v = C.validatePlan(demoPlan(), rs, 2);
  assert.ok(codes(v.warnings).includes('memory-too-close'));
  assert.ok(!codes(v.errors).includes('memory-too-close'));
});

test('validatePlan: cap nemici dal ruleset', () => {
  const p = demoPlan();
  p.cells.push({ x: 1, z: 2, biome: 'floor' });
  p.slots.push({ type: 'enemy', x: 1, z: 2 });             // 2 nemici totali
  const rs = { enemies: { max: 1 } };
  assert.ok(codes(C.validatePlan(p, rs, null).errors).includes('enemies-max'));
});

test('validatePlan: mappa tutta void → no-floor', () => {
  const v = C.validatePlan({ schema: 'mappai-dungeon-floor@1', id: 'piano-0', size: 6, cells: [], slots: [] }, null, null);
  assert.ok(codes(v.errors).includes('no-floor'));
});
