// Motori di layout della vista STUDIO (1/8) — logica pura, zero DOM.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const L = require('../public/js/mappai-studio-layouts.js');
const d3 = require(path.join(__dirname, '..', 'public', 'js', 'd3.v7.min.js'));

// grafo di prova: ROOT + 2 rami + cross-link + ciclo
const N = id => ({ id, label: id, group: id.startsWith('A') ? 1 : id.startsWith('B') ? 2 : 0 });
const nodes = ['ROOT','A1','A2','A3','B1','B2','B3'].map(N);
const links = [
  { source:'ROOT', target:'A1', rel:'include' }, { source:'A1', target:'A2', rel:'include' },
  { source:'A1', target:'A3', rel:'include' },  { source:'ROOT', target:'B1', rel:'include' },
  { source:'B1', target:'B2', rel:'include' },  { source:'B2', target:'B3', rel:'include' },
  { source:'A2', target:'B2', rel:'causa', isCross:true },
  { source:'B3', target:'A1', rel:'torna', isCross:true }   // chiude un ciclo
];


test('anelli: distanze BFS corrette e centro al centro', () => {
  const r = L.run(nodes, links, d3, { mode:'anelli' });
  const c = r.pos.get('ROOT');
  assert.strictEqual(Math.round(c.x), 0); assert.strictEqual(Math.round(c.y), 0);
  assert.strictEqual(r.pos.get('A1').layer, 1);
  assert.strictEqual(r.pos.get('A2').layer, 2);
  assert.strictEqual(r.stats.centro, 'ROOT');
  assert.strictEqual(r.edges.length, 8);          // nessun arco perso
});

test('anelli: centerId esplicito sposta il centro', () => {
  const r = L.run(nodes, links, d3, { mode:'anelli', centerId:'B2' });
  assert.strictEqual(r.stats.centro, 'B2');
  assert.strictEqual(r.pos.get('B2').layer, 0);
  assert.strictEqual(r.pos.get('B1').layer, 1);
});

test('colonne: rami L1 in colonne disgiunte', () => {
  const r = L.run(nodes, links, d3, { mode:'colonne' });
  const xa = ['A1','A2','A3'].map(id => r.pos.get(id).x);
  const xb = ['B1','B2','B3'].map(id => r.pos.get(id).x);
  const w = r.opt.w;
  assert.ok(Math.max(...xa) + w/2 <= Math.min(...xb) - w/2 + 1 ||
            Math.max(...xb) + w/2 <= Math.min(...xa) - w/2 + 1,
    'le colonne dei due rami si sovrappongono');
  assert.strictEqual(r.stats.colonne, 2);
});

test('percorso: ordine topologico valido (ciclo rotto a parte)', () => {
  const r = L.run(nodes, links, d3, { mode:'percorso' });
  const ord = new Map(); r.pos.forEach((p, id) => ord.set(id, p.ord));
  assert.strictEqual(r.stats.passi, 7);
  // ogni arco NON invertito va in avanti nella scaletta
  let avanti = 0, indietro = 0;
  links.forEach(l => { (ord.get(l.source) < ord.get(l.target) ? avanti++ : indietro++); });
  assert.ok(indietro <= 1, 'piu\' archi all\'indietro del solo ciclo rotto: ' + indietro);
  // il filo del percorso ha passi-1 tratti
  assert.strictEqual(r.edges.length, 6);
  assert.ok(r.edges.every(e => e.edge._path));
});

test('fasci: relazioni instradate, scheletro a parte', () => {
  const r = L.run(nodes, links, d3, { mode:'fasci' });
  assert.strictEqual(r.stats.fasci, 2);           // i 2 cross-link
  assert.strictEqual(r.stats.scheletro, 6);       // l'albero portante
  r.edges.forEach(e => assert.ok(e.pts.length > 8, 'fascio non campionato'));
});

test('matrice: ordine per gruppo, una cella per arco', () => {
  const r = L.run(nodes, links, d3, { mode:'matrice' });
  assert.strictEqual(r.order.length, 7);
  assert.strictEqual(r.cells.length, 8);
  // ordine: group 0 (ROOT), poi 1 (A*), poi 2 (B*)
  assert.strictEqual(r.order[0], 'ROOT');
  const m = L.measure(r, false);
  assert.strictEqual(m.incroci, 0);
});

test('tutti i motori node-link: card mai sovrapposte sul grafo di prova', () => {
  ['td','dag','anelli','colonne','percorso'].forEach(mode => {
    const r = L.run(nodes, links, d3, { mode });
    const m = L.measure(r, true);
    assert.strictEqual(m.cardSovrapposte, 0, mode + ': ' + m.cardSovrapposte + ' sovrapposte');
  });
});

test('vault reale (KG semantico): i 6 motori girano senza errori', () => {
  const D = require('../tools/banco-layout/data.json');
  const set = { nodes: D.kg.nodes.filter(n => !/^COMM_/.test(n.id)),
                links: D.kg.links.filter(l => l.isCross) };
  ['td','dag','anelli','colonne','percorso','fasci','matrice'].forEach(mode => {
    const r = L.run(set.nodes, set.links, d3, { mode });
    assert.ok(r.kind, mode + ' senza kind');
    if (mode !== 'matrice') assert.ok(r.pos.size >= 30, mode + ': posizioni mancanti');
  });
});

// ── regressioni dalla review avversaria (1/8) ───────────────────────────

test('dag: archi reciproci A⇄B — nessuno dei due sparisce (uid nelle chiavi)', () => {
  const nn = ['A','B'].map(N);
  const ll = [ { source:'A', target:'B', rel:'causa' }, { source:'B', target:'A', rel:'richiede' } ];
  const r = L.run(nn, ll, d3, { mode:'dag' });
  assert.strictEqual(r.edges.length, 2, 'un arco della coppia reciproca è sparito');
  assert.ok(r.edges.some(e => e.edge.reversed), 'l\'arco invertito deve restare visibile');
});

test('fasci: arco fra due alberi diversi non sparisce e parte dai capi veri', () => {
  const nn = ['A','X','Y','B','C'].map(N);
  const ll = [ { source:'A', target:'X' }, { source:'X', target:'Y' },
               { source:'B', target:'C' }, { source:'C', target:'Y' } ];
  const r = L.run(nn, ll, d3, { mode:'fasci' });
  assert.strictEqual(r.stats.fasci, 1, 'la relazione cross-albero deve esserci');
  const fascio = r.edges[0];
  const pC = r.pos.get('C'), pY = r.pos.get('Y');
  const start = fascio.pts[0];
  // il fascio parte da C (il capo vero), non da un antenato di Y
  const dC = Math.hypot(start.x - pC.x, start.y - pC.y);
  const dY = Math.hypot(start.x - pY.x, start.y - pY.y);
  assert.ok(dC < dY, 'il fascio non parte dal capo vero (C)');
});

test('spanningForest: i discendenti di una radice promossa restano FIGLI', () => {
  // A⇄B e C⇄D con D→A: nessuna sorgente vera, tutto dietro cicli
  const nn = ['A','B','C','D'].map(N);
  const ll = [ { source:'A', target:'B' }, { source:'B', target:'A' },
               { source:'C', target:'D' }, { source:'D', target:'C' },
               { source:'D', target:'A' } ];
  const sf = L.spanningForest(nn, ll);
  // senza la ri-esplorazione tutti e 4 diventavano radici
  assert.ok(sf.roots.length <= 2, 'troppi promossi: ' + sf.roots.length + ' radici');
  assert.ok(sf.treeEdge.size >= 2, 'i discendenti dei promossi devono essere figli');
});

test('anelli: dataset vuoto non lancia', () => {
  const r = L.run([], [], d3, { mode:'anelli' });
  assert.strictEqual(r.pos.size, 0);
  const m = L.measure(r, false);
  assert.strictEqual(m.incroci, 0);
  assert.ok(isFinite(m.bbox.minX), 'bbox degenere');
});

test('measure: pos vuoto ritorna zeri finiti, mai Infinity', () => {
  const m = L.measure({ kind:'dag', pos:new Map(), edges:[], extraEdges:[], bands:[], opt:L.DEFAULTS }, false);
  assert.strictEqual(m.larghezza, 0);
  assert.ok(isFinite(m.bbox.minX) && isFinite(m.bbox.maxX));
});
