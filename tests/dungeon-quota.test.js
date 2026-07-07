'use strict';
// Movimento quota-aware (design §21) — gradini, salto, discesa cappata (DQ0)
// Design: docs/game-design/MEMORY_DUNGEON_DESIGN.md §21
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-dungeon-core.js');

// ── planToGrid: estrazione quota ─────────────────────────────────────────────
test('planToGrid: quota estratta, default 0, hasQuota solo se una cella camminabile è fuori quota', () => {
  const p = {
    schema: 'mappai-dungeon-floor@1', id: 'piano-1', level: 1, size: 6,
    cells: [
      { x: 1, z: 1, biome: 'floor' },                 // quota assente → 0
      { x: 2, z: 1, biome: 'floor', quota: 0 },
      { x: 3, z: 1, biome: 'water', quota: -0.5 }     // bloccata: non conta per hasQuota
    ]
  };
  const g = C.planToGrid(p);
  assert.equal(g.quota['1,1'], 0);
  assert.equal(g.quota['2,1'], 0);
  assert.equal(g.quota['3,1'], -0.5);
  assert.equal(g.hasQuota, false);
  p.cells.push({ x: 4, z: 1, biome: 'floor', quota: 0.6 });
  assert.equal(C.planToGrid(p).hasQuota, true);
});

// ── stepKindGrid ─────────────────────────────────────────────────────────────
test('stepKindGrid: walk ≤0.9, jump ≤1.6, blocked oltre — discesa cappata simmetrica', () => {
  const map = { '0,0': 0, '1,0': 0, '2,0': 1 };
  const q = (v) => ({ '0,0': 0, '1,0': v, '2,0': 0 });
  assert.equal(C.stepKindGrid(map, q(0.5), '0,0', '1,0'), 'walk');
  assert.equal(C.stepKindGrid(map, q(1.0), '0,0', '1,0'), 'jump');
  assert.equal(C.stepKindGrid(map, q(1.6), '0,0', '1,0'), 'jump');
  assert.equal(C.stepKindGrid(map, q(2.0), '0,0', '1,0'), 'blocked');
  // discesa: fall tra 0.9 e 1.6, bloccata oltre (DQ0 — non più caduta libera)
  assert.equal(C.stepKindGrid(map, q(1.0), '1,0', '0,0'), 'fall');
  assert.equal(C.stepKindGrid(map, q(2.0), '1,0', '0,0'), 'blocked');
  assert.equal(C.stepKindGrid(map, q(-0.5), '0,0', '1,0'), 'walk');
});

test('stepKindGrid: muro sempre blocked, quota null = griglia piatta (solo walk)', () => {
  const map = { '0,0': 0, '1,0': 1, '0,1': 0 };
  assert.equal(C.stepKindGrid(map, { '0,0': 0, '1,0': 9 }, '0,0', '1,0'), 'blocked');
  assert.equal(C.stepKindGrid(map, null, '0,0', '0,1'), 'walk');
  assert.equal(C.stepKindGrid(map, null, '0,0', '9,9'), 'blocked');   // cella assente = void
});

// ── findPathQuota ────────────────────────────────────────────────────────────
// Mappa 3×2: corridoio in alto con rupe 2.0 al centro, deviazione in basso piatta
//   (0,0)q0  (1,0)q2  (2,0)q0
//   (0,1)q0  (1,1)q0  (2,1)q0
function cliffMap() {
  const map = {}, quota = {};
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].forEach(([x, y]) => { map[x + ',' + y] = 0; quota[x + ',' + y] = 0; });
  quota['1,0'] = 2.0;
  return { map, quota };
}

test('findPathQuota: aggira la rupe passando dalla deviazione piatta', () => {
  const { map, quota } = cliffMap();
  const path = C.findPathQuota(map, quota, 0, 0, 2, 0);
  assert.ok(path, 'percorso trovato');
  assert.deepEqual(path[0], [0, 0]);                        // include la partenza (formato rot.js)
  assert.deepEqual(path[path.length - 1], [2, 0]);
  assert.ok(!path.some(([x, y]) => x === 1 && y === 0));    // mai sulla rupe
  assert.equal(path.length, 5);                             // 0,0 → 0,1 → 1,1 → 2,1 → 2,0
});

test('findPathQuota: rupe senza deviazione = nessun percorso, nei DUE versi (simmetria DQ0)', () => {
  const map = { '0,0': 0, '1,0': 0, '2,0': 0 };
  const quota = { '0,0': 0, '1,0': 2.0, '2,0': 0 };
  assert.equal(C.findPathQuota(map, quota, 0, 0, 2, 0), null);
  assert.equal(C.findPathQuota(map, quota, 2, 0, 0, 0), null);
  // gradino saltabile → percorso nei due versi
  quota['1,0'] = 1.2;
  assert.ok(C.findPathQuota(map, quota, 0, 0, 2, 0));
  assert.ok(C.findPathQuota(map, quota, 2, 0, 0, 0));
});

test('findPathQuota: partenza o arrivo su muro → null; partenza = arrivo → [start]', () => {
  const { map, quota } = cliffMap();
  map['2,1'] = 1;
  assert.equal(C.findPathQuota(map, quota, 0, 0, 2, 1), null);
  assert.deepEqual(C.findPathQuota(map, quota, 0, 1, 0, 1), [[0, 1]]);
});

// ── validatePlan quota-aware ─────────────────────────────────────────────────
function rampPlan(stairQuota) {
  // corridoio 1..4 su z=1: spawn a (1,1) q0, rupe/gradino a (3,1), scale a (4,1)
  return {
    schema: 'mappai-dungeon-floor@1', id: 'piano-1', level: 1, size: 6,
    cells: [
      { x: 1, z: 1, biome: 'floor', quota: 0 },
      { x: 2, z: 1, biome: 'floor', quota: 0 },
      { x: 3, z: 1, biome: 'floor', quota: stairQuota },
      { x: 4, z: 1, biome: 'floor', quota: stairQuota }
    ],
    slots: [
      { type: 'spawn', x: 1, z: 1 },
      { type: 'stairs', x: 4, z: 1 }
    ]
  };
}

test('validatePlan: scale dietro una rupe > 1.6 → stairs-unreachable (il dislivello è un muro)', () => {
  const r = C.validatePlan(rampPlan(2.0), null, null);
  assert.ok(r.errors.some(e => e.code === 'stairs-unreachable'));
  // stesso piano con gradino saltabile → valido
  const ok = C.validatePlan(rampPlan(1.4), null, null);
  assert.ok(!ok.errors.some(e => e.code === 'stairs-unreachable'));
});

test('validatePlan: memoria su plateau isolato dal dislivello → warning slot-unreachable', () => {
  const p = rampPlan(1.4);
  p.cells.push({ x: 4, z: 2, biome: 'floor', quota: 4.0 });   // plateau attaccato a (4,1) ma +2.6
  p.slots.push({ type: 'memory', x: 4, z: 2 });
  const r = C.validatePlan(p, null, null);
  assert.ok(r.warnings.some(w => w.code === 'slot-unreachable'));
  assert.ok(!r.errors.some(e => e.code === 'slot-unreachable'));   // pedagogia: warning, non error
});

// ── worldZones quota-aware ───────────────────────────────────────────────────
test('worldZones: una rupe > 1.6 divide due zone come un muro (flood-fill quota-aware)', () => {
  const mk = (q) => ({
    schema: 'mappai-dungeon-world@1', id: 'mondo', size: 8,
    cells: [1, 2, 3, 4, 5, 6].map(x => ({ x, z: 1, biome: 'floor', quota: x >= 4 ? q : 0 })),
    slots: [{ type: 'spawn', x: 1, z: 1 }]
  });
  assert.equal(C.worldZones(mk(0)).zones.length, 1);
  assert.equal(C.worldZones(mk(2.5)).zones.length, 2);      // rupe tra x=3 e x=4
  assert.equal(C.worldZones(mk(1.2)).zones.length, 1);      // gradino saltabile: zona unica
});
