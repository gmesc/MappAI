'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../public/js/mappai-map-loader.js');

// ── helper: mini-mappa sintetica 5×4 ─────────────────────────────────────────
function mini(overrides) {
  const G = () => ({ ts: 'overworld', c: 0, r: 0 });          // erba
  const ground = Array.from({ length: 4 }, () => Array.from({ length: 5 }, G));
  const over = Array.from({ length: 4 }, () => Array(5).fill(null));
  return Object.assign({
    version: 2, tile: 16, cols: 5, rows: 4,
    layers: [{ name: 'ground', data: ground }, { name: 'over', data: over }],
    objects: []
  }, overrides || {});
}

test('parseMap: erba pura → tutto walkable, spawn derivato in basso al centro', () => {
  const m = L.parseMap(mini());
  assert.equal(m.map['0,0'], 0);
  assert.equal(m.map['4,3'], 0);
  assert.deepEqual(m.spawn, [2, 2]);   // ultima riga walkable → player una riga dentro
});

test('parseMap: acqua ground [16,1] → solida e in water', () => {
  const j = mini();
  j.layers[0].data[1][2] = { ts: 'overworld', c: 16, r: 1 };
  const m = L.parseMap(j);
  assert.equal(m.map['2,1'], 1);
  assert.equal(m.water['2,1'], true);
});

test('parseMap: siepe over → solida, decal over qualsiasi → walkable', () => {
  const j = mini();
  j.layers[1].data[1][1] = { ts: 'overworld', c: 2, r: 14 };  // siepe LUT
  j.layers[1].data[1][3] = { ts: 'overworld', c: 2, r: 11 };  // fiore decal
  const m = L.parseMap(j);
  assert.equal(m.map['1,1'], 1);
  assert.equal(m.map['3,1'], 0);
});

test('parseMap: oggetti solidi bloccano, ancore e ambient no', () => {
  const j = mini({
    objects: [
      { name: 'tree-oak', x: 1, y: 1 },
      { name: 'book', x: 3, y: 1 },
      { name: 'animal-cat', x: 3, y: 2 }
    ]
  });
  const m = L.parseMap(j);
  assert.equal(m.map['1,1'], 1);                       // albero solido
  assert.equal(m.map['3,1'], 0);                       // book walkable
  assert.equal(m.anchors.length, 1);
  assert.equal(m.anchors[0].name, 'book');
  assert.equal(m.ambient.length, 1);
  assert.equal(m.decor.length, 1);
});

test('parseMap: NPC su acqua → rilocato su cella walkable adiacente', () => {
  const j = mini({ objects: [{ name: 'sapiente-viola', x: 2, y: 1 }] });
  j.layers[0].data[1][2] = { ts: 'overworld', c: 16, r: 1 };  // acqua sotto l'NPC
  const m = L.parseMap(j);
  assert.equal(m.npcs.length, 1);
  const n = m.npcs[0];
  assert.equal(m.map[n.x + ',' + n.y], 0);             // ora su cella libera
  assert.ok(!(n.x === 2 && n.y === 1));
});

test('parseMap: due NPC stessa cella → non si sovrappongono dopo la rilocazione', () => {
  const j = mini({
    objects: [
      { name: 'sapiente-viola', x: 2, y: 1 },
      { name: 'sapiente-rosso', x: 2, y: 1 }
    ]
  });
  const m = L.parseMap(j);
  const a = m.npcs[0], b = m.npcs[1];
  assert.ok(!(a.x === b.x && a.y === b.y));
});

test('parseMap: gatekeeper estratto e rilocabile', () => {
  const j = mini({ objects: [{ name: 'gatekeeper', x: 4, y: 0 }] });
  const m = L.parseMap(j);
  assert.deepEqual({ x: m.gatekeeper.x, y: m.gatekeeper.y }, { x: 4, y: 0 });
});

test('parseMap: spawn esplicito nel JSON vince se walkable', () => {
  const j = mini({ spawn: [1, 1] });
  const m = L.parseMap(j);
  assert.deepEqual(m.spawn, [1, 1]);
});

test('parseMap: input rotto → null', () => {
  assert.equal(L.parseMap(null), null);
  assert.equal(L.parseMap({}), null);
  assert.equal(L.parseMap({ cols: 3, rows: 3, layers: [] }), null);
});

test('pickMapIndex: stabile e nel range', () => {
  const i1 = L.pickMapIndex('Il Risorgimento', 5);
  const i2 = L.pickMapIndex('Il Risorgimento', 5);
  assert.equal(i1, i2);
  assert.ok(i1 >= 0 && i1 < 5);
  assert.equal(L.pickMapIndex('x', 0), 0);
});

// ── mappa reale dell'editor (fixture viva: se lo schema cambia, il test lo dice) ──
test('parseMap: giardino1_chiostro.json reale → 4 NPC, gatekeeper, acqua, spawn sud', () => {
  // copia runtime (esercizi/ è stato riorganizzato in sottocartelle per fase)
  const p = path.join(__dirname, '..', 'public', 'assets', 'maps', 'giardino1_chiostro.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = L.parseMap(j);
  assert.ok(m, 'parse riuscito');
  assert.equal(m.cols, 30);
  assert.equal(m.rows, 20);
  assert.equal(m.npcs.length, 4);                       // viola, rosso, merchant, mage
  assert.ok(m.gatekeeper, 'gatekeeper presente');
  assert.ok(Object.keys(m.water).length > 10, 'pozza presente');
  // ogni NPC e il gatekeeper su cella walkable
  m.npcs.concat([m.gatekeeper]).forEach(n => assert.equal(m.map[n.x + ',' + n.y], 0, n.name || 'gk'));
  // spawn su cella walkable, in basso (apertura sud)
  assert.equal(m.map[m.spawn[0] + ',' + m.spawn[1]], 0);
  assert.ok(m.spawn[1] >= m.rows - 2, 'spawn all\'apertura sud');
  // gli alberi bloccano
  m.decor.filter(d => d.name.indexOf('tree') === 0).forEach(d =>
    assert.equal(m.map[d.x + ',' + d.y], 1, 'albero solido ' + d.x + ',' + d.y));
});
