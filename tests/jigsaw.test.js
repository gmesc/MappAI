'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Simula l'ambiente browser PRIMA di caricare il modulo (stesso pattern di
// mastery-browser.test.js): localStorage + window con appState condiviso.
const _ls = new Map();
global.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k)
};
global.window = { appState: { db: { nodes: [], links: [] } } };

require('../public/js/mappai-jigsaw.js');
const J = global.window.MappAIJigsaw;

// ---------- fixture: master a 2 rami (a=Cause g1, b=Fronti g2) ----------
function masterFixture() {
  return {
    nodes: [
      { id: 'R', label: 'Prima guerra', level: 0 },
      { id: 'a', label: 'Cause', level: 1, group: 1, parent: 'R', desc: 'Le cause profonde del conflitto europeo spiegate una per una con esempi e fonti dettagliate per lo studio.' },
      { id: 'a1', label: 'Nazionalismi', level: 2, group: 1, parent: 'a', desc: 'x '.repeat(20) },
      { id: 'a2', label: 'Alleanze', level: 2, group: 1, parent: 'a', desc: 'x '.repeat(20) },
      { id: 'b', label: 'Fronti', level: 1, group: 2, parent: 'R', desc: 'x '.repeat(20) },
      { id: 'b1', label: 'Trincea', level: 2, group: 2, parent: 'b', desc: 'x '.repeat(20) }
    ],
    links: [
      { source: 'R', target: 'a', rel: 'include' },
      { source: 'a', target: 'a1', rel: 'include' },
      { source: 'a', target: 'a2', rel: 'include' },
      { source: 'R', target: 'b', rel: 'include' },
      { source: 'b', target: 'b1', rel: 'include' }
    ]
  };
}

// Copia del Gruppo A: perso a2, aggiunto a3 (desc corta), 2 ponti (1 senza giustificazione).
function copyFixture() {
  const m = masterFixture();
  return {
    branchLocks: {
      g1_cause: { branchId: 'a', owner: 'Gruppo A', editable: true, role: 'expert' },
      g2_fronti: { branchId: 'b', owner: 'Gruppo B', editable: false, role: 'locked' }
    },
    nodes: m.nodes.filter(n => n.id !== 'a2').concat([
      { id: 'a3', label: 'Militarismo', level: 2, group: 1, parent: 'a', desc: 'corto' }
    ]),
    links: m.links.filter(l => l.target !== 'a2').concat([
      { source: 'a', target: 'a3', rel: 'include' },
      { source: 'a1', target: 'b1', rel: 'alimenta', isBridge: true, bridgeStatus: 'ratified', bridgeAuthor: 'Gruppo A', justification: 'Il nazionalismo balcanico alimenta la guerra di trincea perché mobilita eserciti di massa.' },
      { source: 'a3', target: 'b1', rel: 'correlato', isBridge: true, bridgeStatus: 'proposed', bridgeAuthor: 'Gruppo A', justification: 'boh' }
    ])
  };
}

// ---------- branchKeyForNode ----------
test('branchKeyForNode: L0→_root, discendenti→chiave del loro L1', () => {
  const m = masterFixture();
  const byId = {}; m.nodes.forEach(n => byId[n.id] = n);
  assert.equal(J.branchKeyForNode(byId.R, byId, m.links), '_root');
  assert.equal(J.branchKeyForNode(byId.a, byId, m.links), 'g1_cause');
  assert.equal(J.branchKeyForNode(byId.a1, byId, m.links), 'g1_cause');
  assert.equal(J.branchKeyForNode(byId.b1, byId, m.links), 'g2_fronti');
});

// ---------- gapReport ----------
test('gapReport: assenti, sottili, arricchimenti, ponti da giustificare', () => {
  const r = J.gapReport(masterFixture(), copyFixture());
  assert.ok(r.ok);
  assert.equal(r.owner, 'Gruppo A');
  assert.equal(r.key, 'g1_cause');
  assert.deepEqual(r.missing, ['Alleanze']);          // a2 sparito dalla copia
  assert.deepEqual(r.thin, ['Militarismo']);          // a3 ha desc <15 parole
  assert.deepEqual(r.added, ['Militarismo']);         // a3 non esiste nel master
  assert.equal(r.bridges.proposed, 2);
  assert.equal(r.bridges.unjustified, 1);             // 'boh' ≤ 15 caratteri
  assert.equal(r.masterNodes, 3);                     // a, a1, a2
  assert.equal(r.branchNodes, 3);                     // a, a1, a3
});

test('gapReport: copia senza ramo editabile → ok:false', () => {
  const c = copyFixture();
  c.branchLocks.g1_cause.editable = false;
  const r = J.gapReport(masterFixture(), c);
  assert.equal(r.ok, false);
});

// ---------- reconcile ----------
test('reconcile: swap del ramo lavorato + solo ponti ratificati', () => {
  const merged = J.reconcile(masterFixture(), [copyFixture()]);
  const ids = new Set(merged.nodes.map(n => n.id));
  assert.ok(ids.has('a3'), 'nodo nuovo del gruppo entra nel master');
  assert.ok(!ids.has('a2'), 'nodo eliminato dal gruppo esce dal master');
  assert.ok(ids.has('b1'), 'ramo altrui intatto');
  const bridges = merged.links.filter(l => l.isBridge);
  assert.equal(bridges.length, 1, 'solo il ponte ratificato entra');
  assert.equal(bridges[0].bridgeStatus, 'ratified');
  assert.equal(merged.summary[0].ok, true);
  assert.equal(merged.summary[0].bridges, 1);
});

// ---------- expertise gate ----------
function studentAppState() {
  // Copia studente: ramo a editabile (3 nodi L1+), ramo b bloccato.
  return {
    db: {
      nodes: [
        { id: 'R', label: 'Prima guerra', level: 0, _editable: false },
        { id: 'a', label: 'Cause', level: 1, group: 1, parent: 'a', _editable: true, _owner: 'Gruppo A' },
        { id: 'a1', label: 'Nazionalismi', level: 2, group: 1, parent: 'a', _editable: true, _owner: 'Gruppo A' },
        { id: 'a2', label: 'Alleanze', level: 2, group: 1, parent: 'a', _editable: true, _owner: 'Gruppo A' },
        { id: 'b', label: 'Fronti', level: 1, group: 2, parent: 'R', _editable: false },
        { id: 'b1', label: 'Trincea', level: 2, group: 2, parent: 'b', _editable: false }
      ],
      links: []
    }
  };
}

function masteryMock(studiedIds) {
  return {
    node: (id) => (studiedIds.includes(id) ? { attempts: 3, accuracy: 0.9, rate: null } : null),
    masteryLevel: () => 'acquisito'
  };
}

test('expertise gate: blocca sotto soglia, sblocca sopra', () => {
  global.window.appState = studentAppState();
  _ls.set('mappai_jigsaw_mode', '1');           // modalità JIGSAW ON
  _ls.delete('mappai_jigsaw_expertise_gate');   // gate default ON

  // 1/3 nodi studiati → serve ceil(3*0.5)=2 → bloccato
  global.window.MappAIMastery = masteryMock(['a1']);
  let s = J.expertiseStatus();
  assert.equal(s.total, 3); assert.equal(s.studied, 1);
  assert.equal(J.guardExpertise(), false);

  // 2/3 studiati → passa
  global.window.MappAIMastery = masteryMock(['a1', 'a2']);
  s = J.expertiseStatus();
  assert.equal(s.studied, 2);
  assert.equal(J.guardExpertise(), true);
});

test('expertise gate: inerte senza store o con flag spento', () => {
  global.window.appState = studentAppState();
  _ls.set('mappai_jigsaw_mode', '1');
  delete global.window.MappAIMastery;           // niente store → nessun falso blocco
  assert.equal(J.guardExpertise(), true);
  global.window.MappAIMastery = masteryMock([]); // 0 studiati ma gate spento
  _ls.set('mappai_jigsaw_expertise_gate', '0');
  assert.equal(J.guardExpertise(), true);
  _ls.delete('mappai_jigsaw_expertise_gate');
});

test('finalizeBridge: gate blocca la creazione; sopra soglia il ponte nasce proposed', () => {
  global.window.appState = studentAppState();
  _ls.set('mappai_jigsaw_mode', '1');
  global.window.showToast = () => {};
  global.window.showPrompt = (q, d, cb) => cb('Giustificazione lunga e sensata del legame inter-area.');
  const nodes = global.window.appState.db.nodes;
  const src = nodes.find(n => n.id === 'a1'), tgt = nodes.find(n => n.id === 'b1');

  // Sotto soglia: onCreate NON chiamato, link non marcato
  global.window.MappAIMastery = masteryMock(['a1']);
  let link = { source: 'a1', target: 'b1', rel: 'alimenta' };
  let created = false;
  J.finalizeBridge(link, src, tgt, () => { created = true; });
  assert.equal(created, false);
  assert.ok(!link.isBridge);

  // Sopra soglia: ponte proposto e creato
  global.window.MappAIMastery = masteryMock(['a1', 'a2', 'a']);
  link = { source: 'a1', target: 'b1', rel: 'alimenta' };
  created = false;
  J.finalizeBridge(link, src, tgt, () => { created = true; });
  assert.equal(created, true);
  assert.equal(link.isBridge, true);
  assert.equal(link.bridgeStatus, 'proposed');
  assert.ok(link.justification.length > 15);
  _ls.delete('mappai_jigsaw_mode');
});
