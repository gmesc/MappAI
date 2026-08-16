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

/* ── linking words: dove finiscono (1/8, round 4) ─────────────────────────
   La parola-legame sta sul tratto; il posizionatore sceglie il punto meno
   affollato invece del centro del segmento più lungo (che cadeva sugli
   incroci). Casi costruiti a mano, geometria nota. */

const _seg = (x1, y1, x2, y2) => ({ x: x1, y: y1, _b: { x: x2, y: y2 } });
const _res = (list) => ({ kind: 'dag', pos: new Map(), opt: L.DEFAULTS, edges: list, extraEdges: [] });

test('etichette: schiva la verticale che taglia il tratto a metà', () => {
  // orizzontale lunga da (0,0) a (400,0); una verticale la incrocia in x=200
  const orizz = { pts: [{x:0,y:0},{x:400,y:0}], edge: { s:'A', t:'B', rel:'causa' } };
  const vert  = { pts: [{x:200,y:-60},{x:200,y:60}], edge: { s:'C', t:'D', rel:'' } };
  const lista = [orizz, vert];
  const r = L.placeEdgeLabels(lista, _res(lista), { fs: 10 });
  const p = r.pos.get(0);
  assert.ok(p, 'etichetta non piazzata');
  const size = L.labelSize('causa', 10);
  const box = L.labelRect(p, size);
  // il riquadro NON deve contenere la verticale
  assert.ok(!L.segRectHit({x:200,y:-60}, {x:200,y:60}, box),
    'etichetta ancora sull incrocio: x=' + Math.round(p.x));
  assert.ok(Math.abs(p.x - 200) > 20, 'non si è spostata dal centro: x=' + Math.round(p.x));
  assert.strictEqual(r.conflitti, 0);
});

test('etichette: due tratti paralleli non si sovrappongono fra loro', () => {
  // due orizzontali vicinissime (12px): le etichette devono scorrere
  const a = { pts: [{x:0,y:0},{x:400,y:0}],  edge: { s:'A', t:'B', rel:'richiede' } };
  const b = { pts: [{x:0,y:12},{x:400,y:12}], edge: { s:'C', t:'D', rel:'richiede' } };
  const lista = [a, b];
  const r = L.placeEdgeLabels(lista, _res(lista), { fs: 10 });
  const size = L.labelSize('richiede', 10);
  const A = L.labelRect(r.pos.get(0), size), B = L.labelRect(r.pos.get(1), size);
  assert.ok(!L.rectHit(A, B), 'le due etichette si accavallano');
});

test('etichette: mai sopra una card', () => {
  const e = { pts: [{x:0,y:0},{x:400,y:0}], edge: { s:'A', t:'B', rel:'include' } };
  const lista = [e];
  const res = _res(lista);
  res.pos.set('X', { x: 200, y: 0, layer: 0 });      // card in mezzo al tratto
  res.opt = Object.assign({}, L.DEFAULTS, { w: 120, h: 40 });
  const r = L.placeEdgeLabels(lista, res, { fs: 10 });
  const box = L.labelRect(r.pos.get(0), L.labelSize('include', 10));
  const card = { x0: 140, x1: 260, y0: -20, y1: 20 };
  assert.ok(!L.rectHit(box, card), 'etichetta sopra la card');
});

test('etichette: deterministico e senza etichetta se rel è vuoto', () => {
  const a = { pts: [{x:0,y:0},{x:300,y:0}], edge: { s:'A', t:'B', rel:'causa' } };
  const b = { pts: [{x:0,y:40},{x:300,y:40}], edge: { s:'C', t:'D', rel:'' } };
  const lista = [a, b];
  const r1 = L.placeEdgeLabels(lista, _res(lista), { fs: 10 });
  const r2 = L.placeEdgeLabels(lista, _res(lista), { fs: 10 });
  assert.deepStrictEqual(r1.pos.get(0), r2.pos.get(0));
  assert.strictEqual(r1.pos.has(1), false, 'rel vuoto non deve avere posizione');
  assert.strictEqual(r1.testati, 1);
});

test('etichette: polilinea a gomito → sceglie il braccio lungo', () => {
  // gomito: 20px in giù, poi 300 a destra, poi 20 in giù
  const e = { pts: [{x:0,y:0},{x:0,y:20},{x:300,y:20},{x:300,y:40}], edge: { s:'A', t:'B', rel:'precede' } };
  const lista = [e];
  const r = L.placeEdgeLabels(lista, _res(lista), { fs: 10 });
  const p = r.pos.get(0);
  assert.ok(Math.abs(p.y - 20) < 0.6, 'non è sul braccio orizzontale: y=' + p.y);
});

/* ── il ciclo del bottone LAYOUT (16/8) ─────────────────────────────────────
   Default → Albero → Fasci → DAG → Default. Prima era una catena di `else if`
   dentro toggleLayout, che vuole d3 e mezza app per girare: non si poteva
   provare, ed è la cosa che l'utente incontra a ogni pressione del bottone. */
test('cicloStudio: i quattro passi, in giro chiuso', () => {
    const c = (p, m) => L.cicloStudio(p, m);
    assert.deepStrictEqual(c('default', null), { passo: 'studio', motore: 'td' }, 'dal libero si entra sull\'Albero');
    assert.deepStrictEqual(c('studio', 'td'), { passo: 'studio', motore: 'fasci' });
    assert.deepStrictEqual(c('studio', 'fasci'), { passo: 'studio', motore: 'dag' });
    assert.strictEqual(c('studio', 'dag').passo, 'default', 'dopo il DAG si esce');
});

test('cicloStudio: si entra nel giro da qualunque passo storico', () => {
    // orbita/radiale/personale non sono più nel ciclo: se un progetto salvato
    // li porta ancora, il bottone deve comunque portare dentro la vista
    ['orbit', 'radial', 'separated', 'personal', 'custom_abc', undefined]
        .forEach(p => assert.deepStrictEqual(L.cicloStudio(p, null), { passo: 'studio', motore: 'td' },
            'da ' + p + ' si entra sull\'Albero'));
});

test('cicloStudio: da un motore fuori dai tre si ESCE, non si viene spostati', () => {
    ['anelli', 'colonne', 'percorso', 'matrice'].forEach(m => {
        assert.strictEqual(L.cicloStudio('studio', m).passo, 'default',
            m + ': chi l\'ha scelto esce, non finisce sull\'Albero senza averlo chiesto');
    });
});
