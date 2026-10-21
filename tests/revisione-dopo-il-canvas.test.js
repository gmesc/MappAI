'use strict';
/* Packet 0097 — la revisione non si dichiara superata per ciò che il canvas e il salvataggio cambiano da soli.
   I casi sono quelli veri del 15/10, ridotti a pochi nodi con gli stessi id:
   · 4B «LE DISEQUAZIONI»: una citazione orfana in `sourcesDict` (id `L1_0_L3_A2`, nessun nodo) che il salvataggio
     non scrive → «Impossibile confermare le decisioni salvate» (`persisted_revision_mismatch`);
   · 4R «LE DISEQUAZIONI»: due L3 appesi all'L1 con `isCross`, il canvas ricalcola il loro `group` (3 → 1);
   · 4R «La Fotografia»: il canvas passa il titolo da `cleanLabel` (’ → ');
   · «La Carta»: un titolo cambiato davvero, che deve restare superato. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../public/js/mappai-review-core.js');
const A = require('../public/js/mappai-affermazioni-core.js');
const T = require('../public/js/mappai-text-utils.js');
const clone = x => JSON.parse(JSON.stringify(x));

const SOURCES = [{ id: 'pdf', title: 'Teoria diseq', pages: [{ n: 1, text: 'Una disequazione è una disuguaglianza fra due espressioni.' }] }];
const cit = t => [{ title: 'Testo di origine', source: 'Disequazioni Lineari', text: t }];
// la mappa come la consegna il generatore, PRIMA del primo disegno del canvas
function generata() {
  return {
    nodes: [
      { id: 'ROOT', label: 'LE DISEQUAZIONI', desc: 'Le disequazioni.', level: 0 },
      { id: 'L1_0', label: 'Disequazioni Lineari', desc: 'Una disuguaglianza fra due espressioni.', level: 1, group: 1 },
      { id: 'L1_2', label: 'Insiemi Soluzione', desc: 'Come si scrivono le soluzioni.', level: 1, group: 3 },
      { id: 'L1_0_L3_A1', label: 'Un’esplosione di gioia', desc: 'Primo esempio.', level: 3, group: 1 },
      { id: 'L1_0_L3_A3', label: 'Confronto dei costi', desc: 'La ditta confronta due proposte.', level: 3, group: 1 },
      { id: 'L1_2_L3_A1', label: 'Estremo incluso', desc: 'La parentesi quadra.', level: 3, group: 3 },
      { id: 'L1_2_L3_A2', label: 'Estremo escluso', desc: 'La parentesi tonda.', level: 3, group: 3 }
    ],
    links: [
      { source: 'ROOT', target: 'L1_0', rel: 'include' },
      { source: 'ROOT', target: 'L1_2', rel: 'include' },
      { source: 'L1_0', target: 'L1_0_L3_A1', rel: 'include' },
      { source: 'L1_0', target: 'L1_0_L3_A3', rel: 'include' },
      { source: 'L1_2', target: 'L1_2_L3_A1', rel: 'include', isCross: true },
      { source: 'L1_2', target: 'L1_2_L3_A2', rel: 'include', isCross: true },
      { source: 'L1_2_L2_B', target: 'L1_2_L3_A1', rel: 'include' }
    ],
    sourcesDict: {
      L1_0: cit('Una disequazione è una disuguaglianza.'),
      L1_0_L3_A1: cit('Primo esempio.'),
      L1_0_L3_A2: cit('La ditta, stimando di non dover fare molte fotocopie, pensa che sia più conveniente la seconda proposta.'),
      L1_0_L3_A3: cit('La ditta confronta due proposte.'),
      L1_2_L2_B: cit('L’insieme delle soluzioni di una disequazione si può esprimere con gli intervalli.')
    }
  };
}
// la stessa mappa dopo il primo disegno (initD3Visualization + renderGraph) e dopo salvataggio e rilettura
function disegnata() {
  const db = generata();
  db.nodes.forEach(n => { const c = T.cleanLabel(n.label); if (c) n.label = c; });
  db.nodes.find(n => n.id === 'L1_2_L3_A1').group = 1;   // l'unico padre è un collegamento trasversale: getParentGroup → 1
  db.nodes.find(n => n.id === 'L1_2_L3_A2').group = 1;
  db.links = db.links.filter(l => l.source !== 'L1_2_L2_B');   // collegamento con un estremo mancante, scartato dal disegno
  return db;
}
function riletta() {   // il salvataggio scrive le citazioni solo dentro i nodi
  const db = disegnata();
  delete db.sourcesDict.L1_0_L3_A2; delete db.sourcesDict.L1_2_L2_B;
  return db;
}
function report() {
  return { checkStatus: 'completed', issues: [{ id: 'costi', target: { kind: 'node', id: 'L1_0_L3_A3', field: 'desc' },
    after: 'La ditta confronta le due proposte.', problem: 'Imprecisione.', evidence: [{ source: 'Teoria diseq', page: 1, text: 'disuguaglianza' }] }] };
}
function revisione() { return R.createReview({ db: generata(), sources: SOURCES, report: report() }); }
function approvata(db) {
  const begun = R.beginApproval(R.setDecision(revisione(), 'costi', 'reject'), db || generata(), { sources: SOURCES });
  assert.equal(begun.ok, true, JSON.stringify(begun.conflicts));
  return R.completeApproval(begun.review, begun.revision);
}

test('0097 caso 4B: la citazione orfana persa alla rilettura non ferma la conferma delle decisioni', () => {
  const begun = R.beginApproval(R.setDecision(revisione(), 'costi', 'reject'), generata(), { sources: SOURCES });
  assert.equal(begun.ok, true);
  assert.ok(Object.prototype.hasOwnProperty.call(begun.review.approvedSnapshot.sourcesDict, 'L1_0_L3_A2'), 'la fotografia ha l’orfana');
  // `commit` passa la mappa riletta dal disco: prima dello 0097 lanciava persisted_revision_mismatch
  const done = R.completeApproval(begun.review, riletta());
  assert.equal(done.initial.status, 'approved');
  // l'impronta come stringa vale come prima (G2 e dossier la usano così)
  assert.equal(R.completeApproval(begun.review, begun.revision).initial.status, 'approved');
  assert.throws(() => R.completeApproval(begun.review, R.revision(riletta(), SOURCES)), /persisted_revision_mismatch/);
  // una citazione di un nodo che ESISTE persa o cambiata resta un errore
  const rotta = riletta(); rotta.sourcesDict.L1_0_L3_A3 = cit('Altra fonte.');
  assert.throws(() => R.completeApproval(begun.review, rotta), /persisted_revision_mismatch/);
});

test('0097 casi 4R: G1 in attesa resta decidibile dopo il disegno del canvas e la rilettura', () => {
  for (const db of [disegnata(), riletta()]) {
    const r = R.setDecision(revisione(), 'costi', 'reject');
    const p = R.preview(r, db, { sources: SOURCES });
    assert.deepEqual(p.conflicts, [], 'nessuna stale_revision');
    assert.equal(p.ok, true);
    assert.equal(R.coincide(db, SOURCES, r, 'base'), true);
    const begun = R.beginApproval(r, db, { sources: SOURCES });
    assert.equal(begun.ok, true);
    assert.equal(R.completeApproval(begun.review, riletta()).initial.status, 'approved');
  }
});

test('0097: la G1 approvata non si richiude dopo il disegno e la rilettura (il chip «Completa validazione» regge)', () => {
  const r = approvata();
  assert.deepEqual(R.gate(r, riletta(), r.sources), { allowed: true, reason: 'approved', legacy: false });
  assert.equal(R.coincide(riletta(), r.sources, r, 'approved'), true);
  // il ramo `applying` (ripresa dopo un'interruzione) riconosce la stessa mappa
  const begun = R.beginApproval(R.setDecision(revisione(), 'costi', 'reject'), generata(), { sources: SOURCES });
  const again = R.beginApproval(begun.review, riletta(), { sources: SOURCES });
  assert.equal(again.ok, true, JSON.stringify(again.conflicts));
});

test('0097: una modifica VERA resta superata (titolo, testo, livello, gruppo di un L1, collegamento, citazione, nodo)', () => {
  const r = approvata(), base = R.setDecision(revisione(), 'costi', 'reject');
  const vere = {
    titolo: db => { db.nodes.find(n => n.id === 'L1_0_L3_A3').label = 'Confronto dei costi PROVA 0076'; },
    lettera: db => { db.nodes.find(n => n.id === 'L1_2_L3_A1').label = 'Estremo inclusi'; },
    testo: db => { db.nodes.find(n => n.id === 'L1_0').desc = 'Un’altra cosa.'; },
    livello: db => { db.nodes.find(n => n.id === 'L1_2_L3_A1').level = 2; },
    gruppoL1: db => { db.nodes.find(n => n.id === 'L1_2').group = 7; },
    collegamento: db => { db.links.find(l => l.target === 'L1_0_L3_A1').rel = 'causa'; },
    trasversale: db => { db.links.find(l => l.target === 'L1_0_L3_A1').isCross = true; },
    citazione: db => { db.sourcesDict.L1_0 = cit('Citazione cambiata.'); },
    nodo: db => { db.nodes.push({ id: 'nuovo', label: 'Nuovo', desc: 'In più.', level: 2 }); }
  };
  for (const [nome, cambia] of Object.entries(vere)) {
    const db = riletta(); cambia(db);
    assert.equal(R.gate(r, db, r.sources).reason, 'stale_revision', nome + ' (approvata)');
    assert.equal(R.coincide(db, SOURCES, base, 'base'), false, nome + ' (in attesa)');
    assert.ok(R.preview(base, db, { sources: SOURCES }).conflicts.some(c => c.code === 'stale_revision'), nome + ' (preview)');
  }
  // fonti diverse: superata
  const altre = clone(SOURCES); altre[0].pages[0].text += ' In più.';
  assert.equal(R.coincide(riletta(), altre, base, 'base'), false);
});

test('0097: la forma canonica — che cosa toglie e che cosa tiene, campo per campo', () => {
  const c = R.canonica(R.semanticSnapshot(generata()));
  assert.deepEqual(Object.keys(c.sourcesDict).sort(), ['L1_0', 'L1_0_L3_A1', 'L1_0_L3_A3'], 'via le citazioni orfane');
  assert.equal(c.links.length, 6, 'via il collegamento con un estremo mancante');
  const n = id => c.nodes.find(x => x.id === id);
  assert.equal(n('L1_0_L3_A1').label, "Un'esplosione di gioia");
  assert.equal(n('L1_2_L3_A1').group, undefined, 'il gruppo di un nodo ≥ 2 lo calcola il canvas');
  assert.equal(n('L1_2').group, '3', 'il gruppo di un L1 resta');
  assert.equal(n('L1_2_L3_A1').level, 3);
  assert.equal(n('L1_0').desc, 'Una disuguaglianza fra due espressioni.');
  // idempotente, e non tocca la fotografia che riceve
  const s = R.semanticSnapshot(generata()), prima = JSON.stringify(s);
  assert.deepEqual(R.canonica(R.canonica(s)), R.canonica(s));
  assert.equal(JSON.stringify(s), prima);
  // un titolo che cleanLabel svuoterebbe resta com'è (come nel canvas)
  assert.equal(R.canonica(R.semanticSnapshot({ nodes: [{ id: 'x', label: '**', desc: '' }], links: [] })).nodes[0].label, '**');
  // le impronte non cambiano: revision e semanticSnapshot sono quelli di prima
  assert.equal(R.revision(generata(), SOURCES), revisione().baseRevision);
  // un sigillo che non torna (fotografia ritoccata a mano) non coincide mai
  const falsa = revisione(); falsa.baseSnapshot.nodes[0].desc = 'Ritoccata.';
  assert.equal(R.coincide(riletta(), SOURCES, falsa, 'base'), false);
});

test('0097 quarantena: il record non dice «mappa_cambiata» per il disegno del canvas, e lo dice per una modifica vera', () => {
  const r = revisione();
  assert.notEqual(A.record(r, disegnata()).motivo, 'mappa_cambiata');
  const vera = disegnata(); vera.nodes.find(n => n.id === 'L1_0').desc = 'Altro.';
  assert.equal(A.record(r, vera).motivo, 'mappa_cambiata');
});

test('0097 link editor: le parole di un collegamento si correggono anche sulla mappa disegnata', () => {
  const E = require('../public/js/mappai-link-editor-core.js');
  const r = revisione(), db = riletta(), ref = E.reference(db.links.find(l => l.target === 'L1_0_L3_A1'));
  const next = E.decision(r, db, ref, 'comprende');
  assert.equal(next.initial.decisions[Object.keys(next.initial.decisions)[0]].text, 'comprende');
  const vera = riletta(); vera.nodes.find(n => n.id === 'L1_0').desc = 'Altro.';
  assert.throws(() => E.decision(r, vera, ref, 'comprende'), /stale_revision/);
});

test('0097 magazzino: checkMapWrite riconosce in `applying` la mappa che coincide in forma canonica', () => {
  const os = require('node:os'), path = require('node:path'), S = require('../public/js/mappai-review-store.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0097-'));
  try {
    const begun = R.beginApproval(R.setDecision(revisione(), 'costi', 'reject'), generata(), { sources: SOURCES });
    fs.writeFileSync(path.join(dir, 'pipeline.json'), JSON.stringify({ review: begun.review }));
    const tok = { reviewRevision: begun.review.baseRevision, reviewCommit: begun.review.approvedRevision };
    assert.doesNotThrow(() => S.checkMapWrite(dir, Object.assign(riletta(), tok)));
    const vera = riletta(); vera.nodes.find(n => n.id === 'L1_0').desc = 'Altro.';
    assert.throws(() => S.checkMapWrite(dir, Object.assign(vera, tok)), /non coincide con le decisioni confermate/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// il controller vero, in Node, con le sole parti che `approve` e `requireApproved` chiamano
function controller(opts) {
  const saved = { manifest: null, version: 0, map: null };
  const st = { activeVaultPath: '/vault', db: opts.db, sources: [], _reviewRevision: null };
  const window = { MappAIReviewCore: R, MappAIPipelineCore: require('../public/js/mappai-pipeline-core.js'),
    t: (_k, f) => f, renderGraph() {}, getSystemKey: () => null,
    buildVaultMapData: () => ({ ...clone(st.db), reviewRevision: st._reviewRevision, reviewCommit: st._reviewCommit }),
    electronAPI: {
      saveVaultFile: async args => { saved.manifest = JSON.parse(args.text); saved.version++; return { ok: true, version: saved.version }; },
      saveVault: async args => { saved.map = clone(args.mapData); return { success: true }; },
      // la rilettura: il salvataggio perde le citazioni orfane
      loadVault: async () => {
        const d = clone(saved.map), ids = new Set(d.nodes.map(n => n.id));
        Object.keys(d.sourcesDict || {}).forEach(k => { if (!ids.has(k)) delete d.sourcesDict[k]; });
        return { success: true, data: d };
      }
    } };
  const ctx = vm.createContext({ window, appState: st, document: {}, console,
    StorageManager: { currentProjectId: 'project', saveCurrentProject() {} },
    localStorage: { getItem: () => '0' } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8'), ctx);
  return { R: window.MappAIReview, st, saved };
}

test('0097 controller: «Salva le decisioni e continua» sul caso 4B arriva ad «approved»', async () => {
  const h = controller({ db: generata() });
  const m = window0097Manifest(R.setDecision(revisione(), 'costi', 'reject'));
  await h.R.approve('/vault', m);
  assert.equal(m.review.initial.status, 'approved');
  assert.equal(h.saved.manifest.review.initial.status, 'approved');
});

test('0097 controller: requireApproved su una G1 approvata e una mappa solo ridisegnata non butta `final`', async () => {
  const h = controller({ db: riletta() });
  const r = approvata(); r.final = { stage: 'awaiting_review', items: [] };
  const m = window0097Manifest(r);
  h.st._pipelineManifest = m;
  assert.equal(await h.R.requireApproved(), true);
  assert.equal(m.review.final.stage, 'awaiting_review');
  assert.equal(h.saved.manifest, null, 'niente riscritto sul disco');
});

function window0097Manifest(review) {
  const m = require('../public/js/mappai-pipeline-core.js').createManifest({}, { vaultPath: '/vault' });
  m.steps.A.status = 'done'; m.review = review; return m;
}
