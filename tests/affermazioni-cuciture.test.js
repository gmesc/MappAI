'use strict';
/*
 * affermazioni-cuciture.test.js — i parametri facoltativi dei tre file che il
 * reader copia byte per byte (packet 0042): mappai-causal-chains.js,
 * mappai-print-dossier.js, mappai-branch-synthesis.js.
 *
 * La regola: SENZA parametri ogni funzione dà lo stesso risultato di oggi (i
 * risultati attesi si calcolano qui a parte, dalla mappa aperta, con gli stessi
 * core); CON la vista della quarantena lavora sulla vista e mai sulla mappa
 * aperta. Dopo il merge servono `node tools/sincronizza.js` nel reader, il bump
 * dei `?v=` e `riuso-divergenza` (gate 3 di Giacomo).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.join(__dirname, '..', 'public', 'js');
const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const C = require(path.join(JS, 'mappai-causal-core.js'));
const G = require(path.join(JS, 'mappai-grounding-core.js'));
const copy = x => JSON.parse(JSON.stringify(x));

const ESCLUSA = 'Il blocco degli Alleati ridusse le importazioni, quindi la Svizzera razionò il cibo.';
const mappa = () => ({
  nodes: [
    { id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'G', label: 'Blocco commerciale', level: 1, group: 1, desc: ESCLUSA + ' Le merci arrivavano dai porti italiani.' },
    { id: 'R', label: 'Razionamento', level: 1, group: 2, desc: 'Il razionamento regolava le quantità per persona.' }
  ],
  links: [{ source: 'ROOT', target: 'G', rel: 'include' }, { source: 'ROOT', target: 'R', rel: 'include' }, { source: 'G', target: 'R', rel: 'causa' }],
  sourcesDict: {},
  // la catena rivista dal docente in ELABORA: contiene la frase esclusa
  causalDoc: { sections: [{ id: 'root', kind: 'root', label: 'In generale', rows: [
    { left: 'Il blocco degli Alleati ridusse le importazioni', conn: 'quindi', right: 'la Svizzera razionò il cibo', family: 'trasformazione', type: 'cause' }] }] }
});
/* la vista della quarantena: la frase esclusa tolta, il collegamento escluso tolto, il documento dei nessi scartato */
const vista = () => {
  const db = mappa();
  db.nodes[1] = Object.assign({}, db.nodes[1], { desc: 'Le merci arrivavano dai porti italiani.' });
  db.links = db.links.filter(l => l.rel !== 'causa');
  delete db.causalDoc;
  return db;
};

function contesto(extra) {
  const ctx = Object.assign({ console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    appState: { db: mappa(), extractionMode: 'mindmap', rootNodeLabel: 'Svizzera' },
    cleanLabel: s => String(s || '').trim(), MappAICausalCore: C }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

/* ── mappai-causal-chains.js ─────────────────────────────────────────────── */
test('causal-chains: senza parametri come oggi; triplesFor(nodes, links) non vede il collegamento escluso', () => {
  const ctx = contesto();
  vm.runInContext(read('mappai-causal-chains.js'), ctx);
  const CC = ctx.MappAICausal, db = ctx.appState.db;
  // oggi: i collegamenti della mappa aperta
  const oggi = C.dedupe(C.extractLinkTriples(db.nodes, db.links, null)
    .concat(...db.nodes.map(n => C.extractDescTriples(n.desc, n.id, n.label)))).slice(0, 20);
  assert.deepEqual(copy(CC.triplesFor(db.nodes)), copy(oggi));
  assert.ok(CC.triplesFor(db.nodes).some(x => x.origin === 'link' && x.conn === 'causa'));
  // con i collegamenti della vista: il nesso del collegamento escluso non c'è
  const v = vista();
  const conVista = CC.triplesFor(v.nodes, v.links);
  assert.ok(!conVista.some(x => x.origin === 'link'), 'il collegamento escluso non entra nella sintesi');
  assert.ok(!conVista.some(x => String(x.cause).includes('blocco degli Alleati')), 'la frase esclusa non entra');
  // un array vuoto è una scelta, non un «manca»: nessun collegamento
  assert.ok(!CC.triplesFor(db.nodes, []).some(x => x.origin === 'link'));
});

test('causal-chains: chainsForOutput() come oggi; chainsForOutput({db}) ignora il causalDoc scartato e la mappa aperta', () => {
  const ctx = contesto();
  vm.runInContext(read('mappai-causal-chains.js'), ctx);
  const CC = ctx.MappAICausal, db = ctx.appState.db;
  // oggi: vale la catena rivista dal docente
  assert.deepEqual(copy(CC.chainsForOutput()), copy(C.chainsFromDoc(db.causalDoc)));
  assert.deepEqual(copy(CC.buildForCurrentMap()), copy(C.buildChains({ nodes: db.nodes, links: db.links, familyMap: null })));
  // la vista senza causalDoc: i nessi si ricavano dalla vista, e la frase esclusa non torna dalla mappa aperta
  const v = vista();
  const out = CC.chainsForOutput({ db: v });
  assert.deepEqual(copy(out), copy(C.buildChains({ nodes: v.nodes, links: v.links, familyMap: null })));
  assert.ok(!JSON.stringify(out).includes('blocco degli Alleati'));
  // la vista che tiene il suo causalDoc lo usa
  const conDoc = Object.assign(vista(), { causalDoc: db.causalDoc });
  assert.deepEqual(copy(CC.chainsForOutput({ db: conDoc })), copy(C.chainsFromDoc(db.causalDoc)));
  // la mappa aperta non è cambiata
  assert.deepEqual(copy(ctx.appState.db), copy(mappa()));
});

/* ── mappai-print-dossier.js ─────────────────────────────────────────────── */
test('print-dossier: printAllNodeLabels senza opts.nodes usa la mappa; con opts.nodes stampa la vista', async () => {
  const ctx = contesto({ document: { getElementById: () => null, querySelector: () => null },
    showToast() {}, showLoadingOverlay() {}, t: (_k, f) => f });
  vm.runInContext(read('mappai-print-dossier.js'), ctx);
  const base = { draftOnly: true, depth: 'all', fmt: '2x2', layout: 'summary', bg: 'none', tuned: false, causal: false, toDisk: { vaultPath: '/vault' } };
  const oggi = await ctx.printAllNodeLabels(Object.assign({}, base));
  assert.equal(oggi.ok, true);
  assert.deepEqual(copy(oggi.cards), mappa().nodes.map(n => ({ id: n.id, label: n.label, desc: n.desc, layout: 'summary', keywords: [] })));
  const v = vista(), senzaRoot = v.nodes.filter(n => n.id !== 'ROOT');
  const conVista = await ctx.printAllNodeLabels(Object.assign({}, base, { nodes: senzaRoot }));
  assert.deepEqual(copy(conVista.cards).map(c => c.id), ['G', 'R'], 'un nodo svuotato non diventa una card');
  assert.equal(conVista.cards[0].desc, 'Le merci arrivavano dai porti italiani.');
  // un valore che non è un elenco non cambia niente
  assert.deepEqual(copy((await ctx.printAllNodeLabels(Object.assign({}, base, { nodes: null }))).cards), copy(oggi.cards));
});

/* ── mappai-branch-synthesis.js ──────────────────────────────────────────── */
function sintesi() {
  const db = mappa();
  const sources = [{ id: 'manuale', nome: 'Manuale', pages: [{ n: 5, text: ESCLUSA + ' Le merci arrivavano dai porti italiani. Il razionamento regolava le quantità per persona.' }] }];
  const review = { sources, overrides: [] };
  const richieste = [], triple = [];
  const win = {
    MappAIGroundingCore: G, MappAIReviewCore: require(path.join(JS, 'mappai-review-core.js')),
    MappAIReview: { current: () => review, sources: () => sources, requireApproved: async () => true },
    MappAIStudyExport: { collectBranchNodes: id => db.nodes.filter(n => n.id === id) },
    MappAICausal: {
      triplesFor: (nodes, links) => { triple.push({ nodes: copy(nodes), links: links === undefined ? 'mappa' : copy(links) }); return []; },
      promptBlockFromTriples: () => ''
    },
    t: (_, f) => f, cleanLabel: s => s, _getTimelineProjectName: () => 'Svizzera',
    fillPromptTemplate: (name, input) => input.nodesList,
    fetchModelAPI: async payload => { richieste.push(payload.contents[0].parts[0].text); return { candidates: [{ content: { parts: [{ text: 'Sintesi.' }] } }] }; }
  };
  vm.runInNewContext(read('mappai-branch-synthesis.js'), { window: win, appState: { db, extractionMode: 'mindmap' }, console: { log() {}, warn() {}, error() {} } });
  return { win, db, review, richieste, triple };
}

test('branch-synthesis: runWholeMap senza vista come oggi; con { db, review } la frase esclusa sparisce e la rettifica entra', async () => {
  const oggi = sintesi();
  await oggi.win.MappAISynthesis.runWholeMap({ apiKey: 'k', silent: true });
  assert.equal(oggi.richieste.length, 1);
  // oggi: il materiale è quello di buildInput sulla mappa aperta e sulla revisione corrente
  const atteso = G.buildInput(oggi.db, [...oggi.db.nodes].sort((a, b) => (a.level || 0) - (b.level || 0)), oggi.review.sources, oggi.review).material;
  assert.ok(oggi.richieste[0].includes(atteso), 'senza parametri il prompt contiene il materiale di oggi');
  assert.equal(oggi.triple[0].links, 'mappa', 'senza vista triplesFor riceve un solo argomento, come oggi');
  // la stessa mappa passata come vista dà lo stesso prompt
  const stessa = sintesi();
  await stessa.win.MappAISynthesis.runWholeMap({ apiKey: 'k', silent: true, db: stessa.db, review: stessa.review });
  assert.deepEqual(stessa.richieste, oggi.richieste);
  // la vista vera
  const q = sintesi(), v = vista();
  const rv = Object.assign({}, q.review, { overrides: [{ origin: 'teacher', choice: 'manual', target: { kind: 'node', id: 'R', field: 'desc' },
    before: 'Il razionamento era libero.', after: 'Il razionamento regolava le quantità per persona.' }] });
  await q.win.MappAISynthesis.runWholeMap({ apiKey: 'k', silent: true, db: v, review: rv });
  assert.equal(q.richieste.length, 1);
  assert.ok(!q.richieste[0].split('PASSAGGI ORIGINALI')[0].includes('blocco degli Alleati'), 'la frase esclusa non è fra i contenuti');
  assert.match(q.richieste[0], /RETTIFICHE DEL DOCENTE[\s\S]*Rettifica del docente: R/);
  assert.deepEqual(q.triple[0].links, v.links, 'triplesFor riceve i collegamenti della vista');
  assert.equal(q.triple[0].nodes.find(n => n.id === 'G').desc, 'Le merci arrivavano dai porti italiani.', 'e i suoi nodi');
  assert.deepEqual(copy(q.db), copy(mappa()), 'la mappa aperta non cambia');
});

test('branch-synthesis (giro 2): con la vista entrano solo i nodi che la vista conosce, anche nei rami raccolti dalla mappa viva', async () => {
  // più di 30 nodi: la sintesi va ramo per ramo, e i rami si raccolgono dalla mappa VIVA
  const NUOVO = 'Frase di un nodo aggiunto sulla tela durante la generazione.';
  const nodi = [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' }];
  for (let i = 0; i < 31; i++) nodi.push({ id: 'N' + i, label: 'Nodo ' + i, level: 1, group: i + 1, desc: 'Descrizione del nodo numero ' + i + '.' });
  const v = { nodes: copy(nodi), links: nodi.slice(1).map(n => ({ source: 'ROOT', target: n.id, rel: 'include' })), sourcesDict: {} };
  const viva = copy(v);
  viva.nodes.push({ id: 'NUOVO', label: 'Nodo nuovo', level: 2, group: 1, desc: NUOVO });
  viva.links.push({ source: 'N0', target: 'NUOVO', rel: 'include' });
  const sources = [{ id: 'manuale', nome: 'Manuale', pages: [{ n: 1, text: 'La Svizzera restò neutrale durante la guerra.' }] }];
  const review = { sources, overrides: [] }, richieste = [], triple = [];
  const win = {
    MappAIGroundingCore: G, MappAIReviewCore: require(path.join(JS, 'mappai-review-core.js')),
    MappAIReview: { current: () => review, sources: () => sources, requireApproved: async () => true },
    MappAIStudyExport: { collectBranchNodes: id => [viva.nodes.find(n => n.id === id)]
      .concat(viva.links.filter(l => l.source === id).map(l => viva.nodes.find(n => n.id === l.target))) },
    MappAICausal: { triplesFor: nodes => { triple.push(copy(nodes)); return []; }, promptBlockFromTriples: () => '' },
    t: (_, f) => f, cleanLabel: s => s, _getTimelineProjectName: () => 'Svizzera',
    fillPromptTemplate: (name, input) => input.nodesList,
    fetchModelAPI: async payload => { richieste.push(payload.contents[0].parts[0].text); return { candidates: [{ content: { parts: [{ text: 'Sintesi.' }] } }] }; }
  };
  vm.runInNewContext(read('mappai-branch-synthesis.js'), { window: win, appState: { db: viva, extractionMode: 'mindmap' }, console: { log() {}, warn() {}, error() {} } });
  await win.MappAISynthesis.runWholeMap({ apiKey: 'k', silent: true, db: v, review });
  assert.ok(richieste.length > 1, 'ramo per ramo');
  assert.ok(richieste.some(r => r.includes('Descrizione del nodo numero 0.')), 'il ramo N0 c\'è');
  assert.ok(!richieste.some(r => r.includes(NUOVO)), 'il nodo che la vista non conosce non entra nei prompt');
  assert.ok(!triple.some(ns => ns.some(n => n.id === 'NUOVO')), 'e nemmeno nei nessi');
});

test('i tre file copiati: le firme nuove sono solo parametri facoltativi', () => {
  const cc = read('mappai-causal-chains.js'), pd = read('mappai-print-dossier.js'), bs = read('mappai-branch-synthesis.js');
  assert.match(cc, /function triplesFor\(nodes, linksVista\)/);
  assert.match(cc, /function buildForCurrentMap\(dbVista\)/);
  assert.match(cc, /function chainsForOutput\(opts\)/);
  assert.match(pd, /const allNodes = \(Array\.isArray\(opts\.nodes\) \? opts\.nodes : null\) \|\| appState\.db\.nodes \|\| \[\];/);
  assert.match(bs, /runWholeMap: async function \(opts\)/);
  // i nomi nuovi non toccano niente che il reader non abbia: nessun MappAIAffermazioni* nei file copiati
  for (const src of [cc, pd, bs]) assert.ok(!/MappAIAffermazioni/.test(src));
});
