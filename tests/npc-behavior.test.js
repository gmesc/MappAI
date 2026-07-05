'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../public/js/mappai-npc-behavior.js');

const allWalk = () => true;

test('mulberry32: deterministico e in [0,1)', () => {
  const a = B.mulberry32(B.strSeed('giardino1'));
  const b = B.mulberry32(B.strSeed('giardino1'));
  for (let i = 0; i < 50; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('strSeed: seed diversi per stringhe diverse, stabile per la stessa', () => {
  assert.equal(B.strSeed('mappa A'), B.strSeed('mappa A'));
  assert.notEqual(B.strSeed('mappa A'), B.strSeed('mappa B'));
});

test('static: mai si muove, resta IDLE', () => {
  const beh = B.mkBehavior('static', 5, 5, 3);
  const rng = B.mulberry32(1);
  for (let t = 0; t < 20000; t += 100) {
    assert.equal(B.stepNpc(beh, { now: t, rng, walkable: allWalk, playerDist: 9 }), false);
  }
  assert.equal(beh.x, 5); assert.equal(beh.y, 5); assert.equal(beh.state, 'IDLE');
});

test('wander: resta entro radius (Manhattan) dalla home', () => {
  const beh = B.mkBehavior('wander', 10, 10, 2);
  const rng = B.mulberry32(42);
  for (let t = 0; t < 200000; t += 90) {
    B.stepNpc(beh, { now: t, rng, walkable: allWalk, playerDist: 9 });
    const d = Math.abs(beh.x - 10) + Math.abs(beh.y - 10);
    assert.ok(d <= 2, 'fuori raggio: ' + beh.x + ',' + beh.y);
  }
});

test('wander: mai su celle non walkable', () => {
  const beh = B.mkBehavior('wander', 3, 3, 3);
  const rng = B.mulberry32(7);
  const solidY4 = (x, y) => y !== 4;   // riga 4 = muro
  for (let t = 0; t < 100000; t += 90) {
    B.stepNpc(beh, { now: t, rng, walkable: solidY4, playerDist: 9 });
    assert.notEqual(beh.y, 4);
  }
});

test('player vicino: TURN e nessun movimento', () => {
  const beh = B.mkBehavior('wander', 5, 5, 3);
  const rng = B.mulberry32(3);
  const moved = B.stepNpc(beh, { now: 99999, rng, walkable: allWalk, playerDist: 1 });
  assert.equal(moved, false);
  assert.equal(beh.state, 'TURN');
  assert.equal(beh.x, 5); assert.equal(beh.y, 5);
});

test('player si allontana: da TURN torna a vivere', () => {
  const beh = B.mkBehavior('wander', 5, 5, 3);
  const rng = B.mulberry32(3);
  B.stepNpc(beh, { now: 0, rng, walkable: allWalk, playerDist: 1 });
  assert.equal(beh.state, 'TURN');
  B.stepNpc(beh, { now: 10000, rng, walkable: allWalk, playerDist: 8 });
  assert.notEqual(beh.state, 'TURN');
});

test('cadenza: nessuna decisione prima di nextT', () => {
  const beh = B.mkBehavior('wander', 5, 5, 3);
  const rng = B.mulberry32(9);
  // forza una decisione a t=0 → nextT > 0
  B.stepNpc(beh, { now: 0, rng, walkable: allWalk, playerDist: 9 });
  const nt = beh.nextT;
  assert.ok(nt > 0);
  const x = beh.x, y = beh.y, st = beh.state;
  const moved = B.stepNpc(beh, { now: nt - 1, rng, walkable: allWalk, playerDist: 9 });
  assert.equal(moved, false);
  assert.equal(beh.x, x); assert.equal(beh.y, y); assert.equal(beh.state, st);
});

test('determinismo: stesso seed → stessa traiettoria', () => {
  function run(seed) {
    const beh = B.mkBehavior('wander', 8, 8, 3);
    const rng = B.mulberry32(B.strSeed(seed));
    const trace = [];
    for (let t = 0; t < 60000; t += 90) {
      B.stepNpc(beh, { now: t, rng, walkable: allWalk, playerDist: 9 });
      trace.push(beh.x + ',' + beh.y);
    }
    return trace.join('|');
  }
  assert.equal(run('lago'), run('lago'));
  assert.notEqual(run('lago'), run('chiostro'));
});

test('intrappolato (nessuna cella valida): resta IDLE senza crash', () => {
  const beh = B.mkBehavior('wander', 5, 5, 2);
  const rng = B.mulberry32(11);
  const noWalk = () => false;
  for (let t = 0; t < 30000; t += 90) {
    assert.equal(B.stepNpc(beh, { now: t, rng, walkable: noWalk, playerDist: 9 }), false);
  }
  assert.equal(beh.x, 5); assert.equal(beh.y, 5);
});

test('pickEmoteTerm: parola >4 lettere da label/desc, cap 12 char', () => {
  const rng = B.mulberry32(5);
  const term = B.pickEmoteTerm('Fotosintesi', 'La clorofilla cattura la luce nei cloroplasti', rng);
  assert.ok(term.length > 4 && term.length <= 12);
  assert.equal(B.pickEmoteTerm('a b c', 'x y', rng), '');
});
