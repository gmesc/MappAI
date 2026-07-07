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

// ── personalità (§ Sapienti runtime) ─────────────────────────────────────────
test('pickPersonality: deterministica per lo stesso seed, ben formata', () => {
  const p1 = B.pickPersonality('Storia::n42');
  const p2 = B.pickPersonality('Storia::n42');
  assert.equal(p1.key, p2.key);
  assert.ok(typeof p1.tone === 'string' && p1.tone.length > 0);
  assert.ok(p1.radius > 0 && p1.pauseProb >= 0 && p1.pauseProb <= 1);
  assert.ok(Array.isArray(p1.stepMs) && Array.isArray(p1.idleMs) && Array.isArray(p1.emoteMs));
});

test('pickPersonality: accetta sia stringa sia intero (via strSeed)', () => {
  assert.equal(B.pickPersonality('lago').key, B.pickPersonality(B.strSeed('lago')).key);
});

test('pickPersonality: distribuisce fra archetipi diversi', () => {
  const keys = new Set();
  for (let i = 0; i < 40; i++) keys.add(B.pickPersonality('n' + i).key);
  assert.ok(keys.size >= 3, 'troppo poca varietà di caratteri: ' + keys.size);
});

test('mkBehavior senza persona = comportamento storico (retrocompat)', () => {
  const beh = B.mkBehavior('wander', 5, 5, 2);
  assert.equal(beh.radius, 2);
  assert.equal(beh.pauseProb, undefined);   // niente campi persona → stepNpc usa i default
  assert.equal(beh.stepMs, undefined);
});

test('mkBehavior con persona: eredita raggio e cadenza', () => {
  const persona = { key: 'curioso', tone: 't', radius: 3, pauseProb: 0.32, stepMs: [520, 300], idleMs: [900, 1000], emoteMs: [6000, 6000] };
  const beh = B.mkBehavior('wander', 5, 5, 2, persona);
  assert.equal(beh.radius, 3);              // persona override del radius arg
  assert.equal(beh.persona, 'curioso');
  assert.equal(beh.pauseProb, 0.32);
  assert.deepEqual(beh.stepMs, [520, 300]);
});

test('stepNpc rispetta il raggio della persona (curioso: 3)', () => {
  const persona = B.PERSONALITIES.find(p => p.key === 'curioso');
  const beh = B.mkBehavior('wander', 10, 10, 2, persona);
  const rng = B.mulberry32(42);
  for (let t = 0; t < 200000; t += 90) {
    B.stepNpc(beh, { now: t, rng, walkable: allWalk, playerDist: 9 });
    assert.ok(Math.abs(beh.x - 10) + Math.abs(beh.y - 10) <= 3);
  }
});

test('stepNpc: pauseProb della persona pilota la frequenza dei passi', () => {
  function steps(pauseProb) {
    const beh = B.mkBehavior('wander', 20, 20, 4, { key: 'x', tone: 't', radius: 4, pauseProb, stepMs: [1, 1], idleMs: [1, 1] });
    const rng = B.mulberry32(123);
    let moved = 0;
    for (let t = 0; t < 4000; t += 2) if (B.stepNpc(beh, { now: t, rng, walkable: allWalk, playerDist: 9 })) moved++;
    return moved;
  }
  assert.ok(steps(0.1) > steps(0.9), 'pausa alta dovrebbe muovere meno di pausa bassa');
});
