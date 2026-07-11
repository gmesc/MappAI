'use strict';
/*
 * collab-core.test.js — logica pura della Lavagna Collaborativa
 * Esegue con: node --test tests/
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'public', 'js', 'mappai-collab-core.js'));

function mkNode(over) {
  return Object.assign({
    id: 'n1', text: 'Fotosintesi', color: C.PALETTE[0], size: 'm',
    x: 0.5, y: -0.3, updatedAt: 1000
  }, over || {});
}

test('sanitizeNick: valido, trim e collasso spazi', () => {
  assert.strictEqual(C.sanitizeNick('  I   Leoni  '), 'I Leoni');
});

test('sanitizeNick: troppo corto o troppo lungo → null', () => {
  assert.strictEqual(C.sanitizeNick('A'), null);
  assert.strictEqual(C.sanitizeNick('x'.repeat(30)), null);
});

test('sanitizeNick: markup neutralizzato', () => {
  const s = C.sanitizeNick('<script>Leoni</script>');
  assert.ok(s && !s.includes('<') && !s.includes('>'));
});

test('sanitizeText: tronca a textMax e collassa spazi', () => {
  const s = C.sanitizeText('  a  '.repeat(100));
  assert.ok(s.length <= C.LIMITS.textMax);
  assert.ok(!/\s{2,}/.test(s));
});

test('validateStudentNode: nodo valido', () => {
  const v = C.validateStudentNode(mkNode());
  assert.ok(v.ok);
  assert.strictEqual(v.clean.text, 'Fotosintesi');
});

test('validateStudentNode: testo vuoto', () => {
  const v = C.validateStudentNode(mkNode({ text: '   ' }));
  assert.ok(!v.ok);
  assert.ok(v.errors.includes('empty-text'));
});

test('validateStudentNode: colore fuori palette', () => {
  const v = C.validateStudentNode(mkNode({ color: '#000000' }));
  assert.ok(!v.ok);
  assert.ok(v.errors.includes('bad-color'));
});

test('validateStudentNode: taglia sconosciuta e coordinate rotte', () => {
  assert.ok(!C.validateStudentNode(mkNode({ size: 'xl' })).ok);
  assert.ok(!C.validateStudentNode(mkNode({ x: NaN })).ok);
  assert.ok(!C.validateStudentNode(mkNode({ y: 99 })).ok);
});

test('mergeGroupNodes: update per id — vince updatedAt più recente', () => {
  const r1 = C.mergeGroupNodes([], [mkNode({ updatedAt: 1000, text: 'vecchio' })]);
  const r2 = C.mergeGroupNodes(r1.nodes, [mkNode({ updatedAt: 2000, text: 'nuovo' })]);
  assert.strictEqual(r2.nodes.length, 1);
  assert.strictEqual(r2.nodes[0].text, 'nuovo');
  // update più VECCHIO di quello presente → ignorato
  const r3 = C.mergeGroupNodes(r2.nodes, [mkNode({ updatedAt: 500, text: 'antico' })]);
  assert.strictEqual(r3.nodes[0].text, 'nuovo');
});

test('mergeGroupNodes: invalidi scartati come rejected', () => {
  const r = C.mergeGroupNodes([], [mkNode(), mkNode({ id: 'n2', color: 'red' })]);
  assert.strictEqual(r.nodes.length, 1);
  assert.strictEqual(r.rejected.length, 1);
  assert.strictEqual(r.rejected[0].id, 'n2');
});

test('mergeGroupNodes: cap nodesPerGroup tiene i più recenti', () => {
  const many = [];
  for (let i = 0; i < C.LIMITS.nodesPerGroup + 5; i++) {
    many.push(mkNode({ id: 'n' + i, updatedAt: i }));
  }
  const r = C.mergeGroupNodes([], many);
  assert.strictEqual(r.nodes.length, C.LIMITS.nodesPerGroup);
  // i 5 più vecchi (updatedAt 0..4) sono stati tagliati
  assert.ok(!r.nodes.some(n => n.updatedAt < 5));
});

test('groupColor: stabile e ciclico', () => {
  assert.strictEqual(C.groupColor(0), C.PALETTE[0]);
  assert.strictEqual(C.groupColor(C.PALETTE.length), C.PALETTE[0]);
});

test('layerToGraph: root L0 + nodi L1 con link "propone"', () => {
  const g = C.layerToGraph('Fotosintesi', 'I Leoni', [
    mkNode({ id: 'a', text: 'Clorofilla' }),
    mkNode({ id: 'b', text: 'Ossigeno' }),
    mkNode({ id: 'bad', color: 'nope' })   // invalido → escluso
  ]);
  assert.strictEqual(g.nodes.length, 3); // root + 2
  assert.strictEqual(g.nodes[0].level, 0);
  assert.ok(g.nodes[0].label.includes('I Leoni'));
  assert.strictEqual(g.links.length, 2);
  g.links.forEach(l => {
    assert.strictEqual(l.source, g.nodes[0].id);
    assert.strictEqual(l.rel, 'propone');
    assert.ok(g.nodes.some(n => n.id === l.target));
  });
  // ogni nodo L1 ha desc = testo (superfici di studio leggono desc||content)
  assert.ok(g.nodes.slice(1).every(n => n.desc && n.level === 1));
});

// ── Collegamenti (link con keyword) ──────────────────────────────────────

function mkLink(over) {
  return Object.assign({ id: 'l1', source: 'n1', target: 'n2', rel: 'causa', updatedAt: 1000 }, over || {});
}

test('validateStudentLink: valido con keyword sanitizzata', () => {
  const v = C.validateStudentLink(mkLink({ rel: '  causa  ' }), ['n1', 'n2']);
  assert.ok(v.ok);
  assert.strictEqual(v.clean.rel, 'causa');
});

test('validateStudentLink: rel vuota → default "collega"; rel lunga troncata', () => {
  assert.strictEqual(C.validateStudentLink(mkLink({ rel: '' }), ['n1', 'n2']).clean.rel, 'collega');
  const long = C.validateStudentLink(mkLink({ rel: 'x'.repeat(50) }), ['n1', 'n2']);
  assert.ok(long.clean.rel.length <= C.LIMITS.relMax);
});

test('validateStudentLink: estremità inesistente o self-link → errori', () => {
  assert.ok(C.validateStudentLink(mkLink({ target: 'ghost' }), ['n1', 'n2']).errors.includes('bad-target'));
  assert.ok(C.validateStudentLink(mkLink({ target: 'n1' }), ['n1', 'n2']).errors.includes('self-link'));
});

test('mergeGroupLinks: lww per id + scarta link con estremità morte', () => {
  const r1 = C.mergeGroupLinks([], [mkLink()], ['n1', 'n2']);
  assert.strictEqual(r1.links.length, 1);
  const r2 = C.mergeGroupLinks(r1.links, [mkLink({ rel: 'richiede', updatedAt: 2000 })], ['n1', 'n2']);
  assert.strictEqual(r2.links[0].rel, 'richiede');
  // n2 sparisce → il link esistente muore, l'incoming è rejected
  const r3 = C.mergeGroupLinks(r2.links, [mkLink({ id: 'l9' })], ['n1']);
  assert.strictEqual(r3.links.length, 0);
  assert.strictEqual(r3.rejected.length, 1);
});

test('layerToGraph con link: keyword preservate, root solo sui nodi senza entranti', () => {
  const nodes = [
    mkNode({ id: 'a', text: 'Clorofilla' }),
    mkNode({ id: 'b', text: 'Ossigeno' }),
    mkNode({ id: 'c', text: 'Glucosio' })
  ];
  const links = [{ id: 'l1', source: 'a', target: 'b', rel: 'produce', updatedAt: 1 }];
  const g = C.layerToGraph('Fotosintesi', 'I Leoni', nodes, links);
  assert.strictEqual(g.nodes.length, 4);
  const studentLink = g.links.find(l => l.rel === 'produce');
  assert.ok(studentLink, 'link studente con keyword presente');
  // b ha un entrante → NIENTE link root→b; a e c ce l'hanno
  const rootLinks = g.links.filter(l => l.source === 'root_collab');
  assert.strictEqual(rootLinks.length, 2);
  const bId = studentLink.target;
  assert.ok(!rootLinks.some(l => l.target === bId));
});

test('validateStudentLink: ROOT_ID è estremità valida (source o target)', () => {
  assert.ok(C.validateStudentLink(mkLink({ source: C.ROOT_ID, target: 'n1' }), ['n1', 'n2']).ok);
  assert.ok(C.validateStudentLink(mkLink({ source: 'n1', target: C.ROOT_ID }), ['n1', 'n2']).ok);
  // root→root resta self-link
  assert.ok(C.validateStudentLink(mkLink({ source: C.ROOT_ID, target: C.ROOT_ID }), ['n1']).errors.includes('self-link'));
});

test('layerToGraph: link dal root → arco root_collab→nodo con keyword, niente propone duplicato', () => {
  const nodes = [mkNode({ id: 'a', text: 'Clorofilla' }), mkNode({ id: 'b', text: 'Ossigeno' })];
  const links = [{ id: 'l1', source: C.ROOT_ID, target: 'a', rel: 'introduce', updatedAt: 1 }];
  const g = C.layerToGraph('Fotosintesi', 'I Leoni', nodes, links);
  const rootLinks = g.links.filter(l => l.source === 'root_collab');
  // a: arco esplicito 'introduce' dal root (niente 'propone'); b: 'propone' automatico
  assert.ok(rootLinks.some(l => l.rel === 'introduce'));
  assert.strictEqual(rootLinks.filter(l => l.target === g.nodes.find(n => n.label === 'Clorofilla').id).length, 1);
  assert.ok(rootLinks.some(l => l.rel === 'propone'));
});

test('mergeGroupLinks: conserva i link dal root anche dopo rimerge', () => {
  const rootLink = { id: 'lr', source: C.ROOT_ID, target: 'n1', rel: 'introduce', updatedAt: 1000 };
  const r = C.mergeGroupLinks([], [rootLink], ['n1', 'n2']);
  assert.strictEqual(r.accepted, 1);
  const r2 = C.mergeGroupLinks(r.links, [], ['n1', 'n2']);
  assert.ok(r2.links.some(l => l.source === C.ROOT_ID), 'link dal root sopravvive al rimerge');
});
