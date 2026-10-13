'use strict';
/* Packet 0072 — il Banco nuovo, la logica pura (ADR 0012 rev. 3 e 4, ADR 0010 rev. 1).
   Le revisioni si costruiscono col core vero (createReview, addIssue, setDecision), come in
   review-core.test.js: niente dati fuori da git. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../public/js/mappai-review-core.js');
const B = require('../public/js/mappai-banco-core.js');

const SOURCES = [{ id: 'pdf-1', title: 'Svizzera', pages: [{ n: 1, text: 'Le banche svizzere furono accusate di aver accettato oro.' }] }];
const clone = x => JSON.parse(JSON.stringify(x));
function freeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }
const outcome = (r, id) => R.decisionOutcome(r.initial.issues.find(i => i.id === id), r.initial.decisions[id]);
/* Applica l'elenco restituito da decisioniDaCampo con le funzioni del core, una per una:
   è quello che farà la veste (0073, 0075). */
function applica(review, esito) {
  assert.ok(esito && Array.isArray(esito.chiamate), 'atteso un elenco di chiamate, avuto ' + JSON.stringify(esito && esito.errore));
  return esito.chiamate.reduce((r, c) => {
    if (c.chiamata === 'addIssue') return R.addIssue(r, c.issue);
    assert.equal(c.chiamata, 'setDecision');
    return R.setDecision(r, c.issueId, c.choice, c.opts);
  }, review);
}

/* ── G1: la mappa ─────────────────────────────────────────────────────────── */
const DESC_A = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
const A1 = 'Le banche svizzere furono accusate di aver accettato oro. Le banche custodivano i depositi.';
const A3 = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche nascondevano i depositi.';
function mappa() {
  return {
    nodes: [
      { id: 'A', label: 'Accuse', desc: DESC_A, level: 1, group: 1 },
      { id: 'B', label: 'Banche', desc: 'Le banche custodivano oro tedesco.', level: 2, group: 1 },
      { id: 'C', label: 'Commercio', desc: 'Il commercio continuò.', level: 2, group: 1 },
      { id: 'D', label: 'Dogane', desc: 'Le dogane controllavano i treni.', level: 2, group: 1 }
    ],
    links: [{ source: 'A', target: 'B', rel: 'causa' }, { source: 'C', target: 'D', rel: 'precede' }]
  };
}
function rapportoMappa() {
  const nodo = (id, extra) => Object.assign({ target: { kind: 'node', id: 'A', field: 'desc' }, problem: 'Nota ' + id }, extra, { id });
  return {
    contratto: 'mappai-giudice@2', stato: 'parziale',
    issues: [
      nodo('a1', { after: A1 }),
      nodo('a2', {}),
      nodo('a3', { after: A3 }),
      { id: 'b1', target: { kind: 'node', id: 'B', field: 'desc' }, problem: 'Frase dubbia.' },
      { id: 'l1', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: '$link' }, after: null, problem: 'Nesso non sostenuto.' }
    ],
    copertura: { nodiEsaminati: ['B', 'D'], linkEsaminati: [{ source: 'A', target: 'B', rel: 'causa' }],
      nodiSaltati: [{ id: 'A', label: 'Accuse', motivo: 'lotto rifiutato' }, { id: 'C', label: 'Commercio', motivo: 'risposta interrotta prima di questo nodo' }],
      linkSaltati: [{ source: 'C', target: 'D', rel: 'precede', motivo: 'risposta interrotta' }] }
  };
}
function g1() { const db = mappa(); return { db, review: R.createReview({ db, sources: SOURCES, report: rapportoMappa() }) }; }
const notaA = r => r.initial.issues.filter(i => i.target.kind === 'node' && i.target.id === 'A');
const DESC = { kind: 'node', id: 'A', field: 'desc' };

/* ── G2: i materiali ──────────────────────────────────────────────────────── */
const ITEMS = [
  { id: 'mc1', kind: 'mc', question: 'Chi fu accusato?', options: ['Lo Stato', 'Le banche'], correctIndex: 1, explanation: 'Furono le banche.' },
  { id: 'mc2', kind: 'mc', question: 'Che cosa custodivano?', options: ['Oro', 'Grano'], correctIndex: 0, explanation: 'I depositi.' },
  { id: 'op1', kind: 'open', question: 'Spiega le accuse.', guide: 'Le banche accettarono oro.' },
  { id: 'fc1', kind: 'flashcard', question: 'Neutralità', answer: 'Non prendere parte alla guerra.' },
  { id: 'ca1', kind: 'causal', question: 'Pressioni', answer: 'Accordi', text: 'portano a' },
  { id: 'sy1', kind: 'synthesis', title: 'Le banche', text: 'Le banche  custodivano\noro.' },
  { id: 'ns1', kind: 'nodesheet', text: 'Scheda del nodo' }
];
function rapportoMateriali() {
  return { stato: 'parziale', coverage: { checkedIds: ['mc1', 'op1', 'ca1'] }, issues: [
    { id: 'i-mc1-q', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Forma' },
    { id: 'i-mc2-e', target: { kind: 'item', id: 'mc2', field: 'explanation' }, after: 'I depositi d’oro.', problem: 'Imprecisa' },
    { id: 'i-op1-g', target: { kind: 'item', id: 'op1', field: 'guide' }, problem: 'La traccia non cita la fonte.' }
  ] };
}
function g2(report = rapportoMateriali()) { const db = { items: clone(ITEMS) }; return { db, review: R.createReview({ db, sources: SOURCES, report }) }; }

/* ═══ righeMateriali ═══════════════════════════════════════════════════════ */
test('righeMateriali: segnalato e senza esito = UNA riga, scheda dei nodi mai in elenco, gruppi e riepilogo dal rapporto', () => {
  const { review } = g2();
  const ordine = review.baseSnapshot.items.filter(i => i.kind !== 'nodesheet').map(i => i.id);
  const out = B.righeMateriali(review, {});
  const ids = out.righe.map(r => r.id);
  assert.deepEqual(ids.slice().sort(), ['fc1', 'mc1', 'mc2', 'op1', 'sy1']);
  assert.equal(ids.filter(id => id === 'mc2').length, 1, 'mc2 è segnalato e senza esito: una riga sola');
  assert.ok(!ids.includes('ns1'), 'la scheda dei nodi è esente');
  assert.ok(!ids.includes('ca1'), 'controllato e senza note: non è da rivedere');
  out.righe.forEach(r => assert.equal(r.n, ordine.indexOf(r.id) + 1, 'numero globale fra i non esenti: ' + r.id));
  const mc2 = out.righe.find(r => r.id === 'mc2');
  assert.equal(mc2.tipo, 'mc'); assert.equal(mc2.titolo, 'Che cosa custodivano?'); assert.equal(mc2.noteAperte, 1);
  assert.equal(mc2.stato, 'da-rivedere'); assert.equal(mc2.fatto, false);
  assert.equal(out.righe.find(r => r.id === 'fc1').noteAperte, 0);
  assert.deepEqual(out.gruppi.map(g => [g.tipo, g.daRivedere, g.totale]),
    [['mc', 2, 2], ['open', 1, 1], ['flashcard', 1, 1], ['synthesis', 1, 1]]);
  assert.deepEqual(out.righe.map(r => r.tipo), ['mc', 'mc', 'open', 'flashcard', 'synthesis'], 'righe nell’ordine dei gruppi');
  assert.deepEqual(out.riepilogo, { generati: 6, verificati: 3, daRivedere: 5, rivisti: 0, approvati: 0, esclusi: 0, esenti: 1 });
});

test('righeMateriali: una riga che passa ad approvato tiene il suo numero; gli insiemi vengono da chi chiama', () => {
  const { review } = g2();
  const prima = B.righeMateriali(review, {});
  const dopo = B.righeMateriali(review, { approvati: new Set(['fc1']), esclusi: ['sy1'] });
  assert.deepEqual(dopo.righe.map(r => [r.id, r.n]), prima.righe.map(r => [r.id, r.n]));
  assert.equal(dopo.righe.find(r => r.id === 'fc1').stato, 'approvato');
  assert.equal(dopo.righe.find(r => r.id === 'fc1').fatto, true);
  assert.equal(dopo.righe.find(r => r.id === 'sy1').stato, 'escluso');
  assert.equal(dopo.gruppi.find(g => g.tipo === 'flashcard').daRivedere, 0);
  assert.equal(dopo.gruppi.find(g => g.tipo === 'flashcard').totale, 1);
  assert.deepEqual(dopo.riepilogo, { generati: 6, verificati: 3, daRivedere: 3, rivisti: 0, approvati: 1, esclusi: 1, esenti: 1 });
});

test('righeMateriali: «verificati» solo dal rapporto, mai dall’uguaglianza fra bozza e anteprima; controllo completo = nessun residuo', () => {
  let { review } = g2();
  review = R.setDecision(review, 'i-mc2-e', 'manual', { text: 'I depositi.' }); // testo identico: bozza = anteprima
  assert.equal(B.righeMateriali(review, {}).riepilogo.verificati, 3);
  assert.equal(B.righeMateriali(review, {}).righe.find(r => r.id === 'mc2').noteAperte, 0);
  const completo = g2({ checkStatus: 'completed', issues: rapportoMateriali().issues }).review;
  assert.equal(completo.initial.checkStatus, 'completed');
  assert.deepEqual(B.righeMateriali(completo, {}).righe.map(r => r.id).sort(), ['mc1', 'mc2', 'op1']);
  assert.equal(B.righeMateriali(completo, {}).riepilogo.verificati, 0, 'senza checkedIds non si dichiara verificato niente');
});

/* ═══ righeMappa ═══════════════════════════════════════════════════════════ */
test('righeMappa: tre note sullo stesso nodo = una riga; un nodo saltato che ha già note non compare due volte', () => {
  let { db, review } = g1();
  let out = B.righeMappa(review, db);
  assert.deepEqual(out.nodi.map(r => [r.id, r.titolo, r.note, r.noteAperte, r.fatto]), [['A', 'Accuse', 3, 3, false], ['B', 'Banche', 1, 1, false]]);
  assert.equal(out.collegamenti.length, 1);
  assert.equal(out.collegamenti[0].titolo, 'Accuse → Banche');
  assert.equal(out.collegamenti[0].noteAperte, 1);
  assert.deepEqual(out.nonLetti.map(r => [r.oggetto, r.titolo, r.fatto]),
    [['nodo', 'Commercio', false], ['collegamento', 'Commercio → Dogane', false]]);
  assert.equal(out.nonLetti[0].motivo, 'risposta interrotta prima di questo nodo');
  assert.ok(!out.nonLetti.some(r => r.id === 'A'), 'A è saltato ma ha già la sua riga');
  assert.deepEqual(out.righe.map(r => r.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(out.righe.map(r => r.id).slice(0, 2), ['A', 'B']);
  review = R.setDecision(review, 'a1', 'accept');
  review = R.setDecision(review, 'b1', 'reject');
  out = B.righeMappa(review, db);
  assert.deepEqual(out.nodi.map(r => [r.id, r.noteAperte, r.fatto]), [['A', 2, false], ['B', 0, true]]);
});

test('righeMappa: un nodo non letto corretto dal docente resta nel suo gruppo, fatto', () => {
  const { db, review } = g1();
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: { kind: 'node', id: 'C', field: 'desc' },
    salvato: 'Il commercio con la Germania continuò.', problema: 'Correzione del docente' });
  const r = applica(review, esito);
  const out = B.righeMappa(r, db);
  assert.ok(!out.nodi.some(x => x.id === 'C'));
  const c = out.nonLetti.find(x => x.id === 'C');
  assert.equal(c.corretto, true); assert.equal(c.fatto, true); assert.equal(c.noteAperte, 0);
});

test('righeMateriali e righeMappa non richiamano preview per riga, e non cambiano la revisione', () => {
  const salvati = { preview: R.preview, previewItem: R.previewItem };
  R.preview = R.previewItem = () => { throw new Error('preview chiamata da un elenco'); };
  try {
    const m = g2(), g = g1();
    freeze(m.review); freeze(g.review);
    assert.equal(B.righeMateriali(m.review, { approvati: ['fc1'] }).righe.length, 5);
    assert.equal(B.righeMappa(g.review, g.db).righe.length, 5);
  } finally { Object.assign(R, salvati); }
});

/* ═══ testoAdesso ══════════════════════════════════════════════════════════ */
test('testoAdesso: una proposta scelta e due note aperte → il testo con la proposta, accanto a quello di partenza', () => {
  let { db, review } = g1();
  review = R.setDecision(review, 'a1', 'accept');
  const tutta = R.preview(review, db);
  assert.equal(tutta.ok, false, 'trappola 1: con note aperte preview non applica niente');
  assert.equal(tutta.db.nodes.find(n => n.id === 'A').desc, DESC_A);
  const s = B.testoAdesso(notaA(review), review, { db });
  assert.equal(s.ok, true); assert.equal(s.partenza, DESC_A); assert.equal(s.adesso, A1);
  review = R.setDecision(review, 'a3', 'accept');
  assert.equal(B.testoAdesso(notaA(review), review, { db }).adesso,
    'Le banche svizzere furono accusate di aver accettato oro. Le banche nascondevano i depositi.', 'proposte disgiunte si compongono');
  review = R.setDecision(review, 'a3', 'manual', { text: 'Testo del docente.' });
  assert.equal(B.testoAdesso(notaA(review), review, { db }).ok, false, 'conflitto: lo dice, non inventa un testo');
});

test('testoAdesso sui materiali: senza decisioni è il testo di partenza; un materiale escluso lo dice', () => {
  let { review } = g2();
  const nota = review.initial.issues.filter(i => i.id === 'i-mc1-q');
  assert.deepEqual(B.testoAdesso(nota, review), { partenza: 'Chi fu accusato?', adesso: 'Chi fu accusato?', ok: true, conflitti: [], escluso: false });
  review = R.setDecision(review, 'i-mc1-q', 'accept');
  assert.equal(B.testoAdesso(nota, review).adesso, 'Chi venne accusato?');
  review = R.setItemExcluded(review, 'mc1', true);
  const e = B.testoAdesso(nota, review);
  assert.equal(e.escluso, true); assert.equal(e.adesso, null);
});

/* ═══ decisioniDaCampo ═════════════════════════════════════════════════════ */
test('decisioniDaCampo: testo salvato uguale ad «adesso» → nessuna decisione, anche con note aperte (rev. 4, B.4)', () => {
  const { db, review } = g1();
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: DESC_A }), { chiamate: [] });
  const b = review.initial.issues.filter(i => i.id === 'b1');
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: b, salvato: 'Le banche custodivano oro tedesco.' }), { chiamate: [] });
  const r2 = R.setDecision(review, 'a1', 'accept');
  assert.deepEqual(B.decisioniDaCampo({ review: r2, db, regime: 'g1', note: notaA(r2), salvato: A1 }), { chiamate: [] }, 'già scelta: niente di nuovo');
  const m = g2().review;
  assert.deepEqual(B.decisioniDaCampo({ review: m, regime: 'g2', bersaglio: { kind: 'item', id: 'fc1', field: 'answer' },
    salvato: 'Non prendere parte alla guerra.' }), { chiamate: [] });
});

test('decisioniDaCampo: testo salvato identico alla proposta → accept su quella nota (rev. 4, A.8), le altre restano aperte', () => {
  const { db, review } = g1();
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: A1 });
  assert.deepEqual(esito.chiamate, [{ chiamata: 'setDecision', issueId: 'a1', choice: 'accept', opts: {} }]);
  const r = applica(review, esito);
  assert.equal(outcome(r, 'a1'), 'applied'); assert.equal(outcome(r, 'a2'), 'pending'); assert.equal(outcome(r, 'a3'), 'pending');
  const m = g2().review;
  const e2 = B.decisioniDaCampo({ review: m, regime: 'g2', bersaglio: { kind: 'item', id: 'mc1', field: 'question' },
    salvato: 'Chi venne accusato?', now: '2026-10-02T10:00:00Z' });
  assert.deepEqual(e2.chiamate, [{ chiamata: 'setDecision', issueId: 'i-mc1-q', choice: 'accept', opts: { now: '2026-10-02T10:00:00Z' } }]);
});

test('decisioniDaCampo, G1 prudente: con UNA nota la correzione a mano la chiude', () => {
  const { db, review } = g1();
  const b = review.initial.issues.filter(i => i.id === 'b1');
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', note: b, salvato: 'Le banche custodivano oro.' });
  assert.deepEqual(esito.chiamate, [{ chiamata: 'setDecision', issueId: 'b1', choice: 'manual', opts: { text: 'Le banche custodivano oro.' } }]);
  assert.equal(outcome(applica(review, esito), 'b1'), 'edited');
});

// 0075 (Q6): con la regola per passo il testo di prima («Le banche furono accusate. …») chiude a1, il cui passo non c'è
// più; qui si salva un testo che lascia intatti tutti i passi, così il test prova ancora «nessuna chiusa»
test('decisioniDaCampo, G1 prudente: con PIÙ note e nessun passo cambiato non ne chiude nessuna; la correzione del docente nasce già decisa e resta una', () => {
  const { db, review } = g1();
  const testo = DESC_A + ' Le accuse arrivarono dopo la guerra.';
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: testo, problema: 'Correzione del docente' });
  assert.equal(esito.chiamate.length, 2);
  assert.equal(esito.chiamate[0].chiamata, 'addIssue');
  assert.equal(esito.chiamate[0].issue.origin, 'teacher');
  assert.deepEqual(esito.chiamate[0].issue.target, DESC);
  assert.deepEqual(esito.chiamate[1], { chiamata: 'setDecision', issueId: esito.chiamate[0].issue.id, choice: 'manual', opts: { text: testo } });
  const r = applica(review, esito);
  ['a1', 'a2', 'a3'].forEach(id => assert.equal(outcome(r, id), 'pending', id + ' resta aperta'));
  const docente = r.initial.issues.find(i => i.origin === 'teacher');
  assert.equal(outcome(r, docente.id), 'edited', 'mai «da decidere»');
  assert.equal(B.testoAdesso(notaA(r), r, { db }).adesso, testo);
  // un secondo salvataggio aggiorna la stessa correzione, non ne aggiunge un'altra
  const di = B.decisioniDaCampo({ review: r, db, regime: 'g1', note: notaA(r), salvato: testo + ' Fine.', problema: 'Altro problema' });
  assert.deepEqual(di.chiamate, [{ chiamata: 'setDecision', issueId: docente.id, choice: 'manual', opts: { text: testo + ' Fine.' } }]);
  assert.equal(applica(r, di).initial.issues.filter(i => i.origin === 'teacher').length, 1);
});

test('decisioniDaCampo: «Proposta scelta», poi correzione a mano → manual col testo del campo, senza conflicting_decisions', () => {
  let { db, review } = g1();
  review = R.setDecision(review, 'a1', 'accept');
  const testo = A1.replace('accettato oro', 'accettato oro tedesco');
  // trappola 2: lasciare l'accept e aggiungere la correzione del docente confligge
  const ingenuo = R.setDecision(R.addIssue(review, { id: 'doc', target: DESC, origin: 'teacher' }), 'doc', 'manual', { text: testo });
  assert.ok(R.preview({ ...ingenuo, initial: { ...ingenuo.initial, issues: ingenuo.initial.issues.filter(i => outcome(ingenuo, i.id) !== 'pending') } }, db)
    .conflicts.some(c => c.code === 'conflicting_decisions'));
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: testo });
  assert.deepEqual(esito.chiamate, [{ chiamata: 'setDecision', issueId: 'a1', choice: 'manual', opts: { text: testo } }]);
  const r = applica(review, esito);
  assert.equal(outcome(r, 'a1'), 'edited'); assert.equal(outcome(r, 'a2'), 'pending'); assert.equal(outcome(r, 'a3'), 'pending');
  const s = B.testoAdesso(notaA(r), r, { db });
  assert.equal(s.ok, true); assert.equal(s.adesso, testo);
  // in G2 lo stesso
  let m = R.setDecision(g2().review, 'i-mc1-q', 'accept');
  const e2 = B.decisioniDaCampo({ review: m, regime: 'g2', bersaglio: { kind: 'item', id: 'mc1', field: 'question' }, salvato: 'Chi venne accusato davvero?' });
  assert.deepEqual(e2.chiamate, [{ chiamata: 'setDecision', issueId: 'i-mc1-q', choice: 'manual', opts: { text: 'Chi venne accusato davvero?' } }]);
  m = applica(m, e2);
  assert.equal(B.testoAdesso(m.initial.issues.filter(i => i.id === 'i-mc1-q'), m).adesso, 'Chi venne accusato davvero?');
});

test('decisioniDaCampo, G2: una decisione $item attiva prende la correzione (precedenza di openMaterialField)', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1');
  const db = { items: [clone(ca1)] };
  let review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'tutto', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca1, question: 'Forti pressioni' }, problem: 'Causa vaga' }] } });
  review = R.setDecision(review, 'tutto', 'accept');
  // senza la precedenza: una correzione per campo accanto al $item confligge
  const perCampo = R.setDecision(R.addIssue(review, { id: 'campo', target: { kind: 'item', id: 'ca1', field: 'answer' }, origin: 'teacher' }), 'campo', 'manual', { text: 'Accordi economici' });
  assert.ok(R.preview(perCampo, db).conflicts.some(c => c.code === 'conflicting_decisions'));
  const esito = B.decisioniDaCampo({ review, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' });
  assert.deepEqual(esito.chiamate, [{ chiamata: 'setDecision', issueId: 'tutto', choice: 'manual',
    opts: { text: { ...ca1, question: 'Forti pressioni', answer: 'Accordi economici' } } }]);
  const p = R.preview(applica(review, esito), db);
  assert.equal(p.ok, true);
  assert.deepEqual(p.db.items[0], { ...ca1, question: 'Forti pressioni', answer: 'Accordi economici' });
  // un materiale escluso non si corregge per campo
  const escluso = R.setItemExcluded(review, 'ca1', true);
  assert.equal(B.decisioniDaCampo({ review: escluso, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'X' }).errore, 'materiale_escluso');
});

test('decisioniDaCampo, G2: senza $item una manual per campo — chiude la sua nota, o nasce la correzione del docente già decisa', () => {
  const { review } = g2();
  const e1 = B.decisioniDaCampo({ review, regime: 'g2', bersaglio: { kind: 'item', id: 'op1', field: 'guide' }, salvato: 'Le banche accettarono oro tedesco.' });
  assert.deepEqual(e1.chiamate, [{ chiamata: 'setDecision', issueId: 'i-op1-g', choice: 'manual', opts: { text: 'Le banche accettarono oro tedesco.' } }]);
  const e2 = B.decisioniDaCampo({ review, regime: 'g2', bersaglio: { kind: 'item', id: 'fc1', field: 'answer' }, salvato: 'Restare fuori dalla guerra.', problema: 'Modifica del docente: Risposta' });
  assert.equal(e2.chiamate[0].chiamata, 'addIssue');
  assert.deepEqual(e2.chiamate[0].issue.target, { kind: 'item', id: 'fc1', field: 'answer' });
  const r = applica(review, e2);
  assert.equal(outcome(r, e2.chiamate[0].issue.id), 'edited');
  assert.equal(R.previewItem(r, { items: clone(ITEMS) }, 'fc1').db.items.find(i => i.id === 'fc1').answer, 'Restare fuori dalla guerra.');
});

test('decisioniDaCampo: «Tieni il testo» resta chiusa se poi il testo cambia (ADR 0010 rev. 1); non letto = correzione decisa', () => {
  let { db, review } = g1();
  review = R.setDecision(review, 'b1', 'reject');
  const esito = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: { kind: 'node', id: 'B', field: 'desc' }, salvato: 'Le banche custodivano oro.' });
  assert.equal(esito.chiamate[0].chiamata, 'addIssue');
  const r = applica(review, esito);
  assert.equal(r.initial.decisions.b1.choice, 'reject');
  assert.equal(B.testoAdesso(null, r, { db, bersaglio: { kind: 'node', id: 'B' } }).adesso, 'Le banche custodivano oro.');
});

test('decisioniDaCampo: se preview dà un conflitto restituisce l’errore, non una lista a metà', () => {
  const { db, review } = g1();
  const vuoto = B.decisioniDaCampo({ review, db, regime: 'g1', note: review.initial.issues.filter(i => i.id === 'b1'), salvato: '' });
  assert.equal(vuoto.errore, 'invalid_replacement'); assert.ok(!('chiamate' in vuoto));
  const mc2 = ITEMS.find(i => i.id === 'mc2');
  let m = R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { stato: 'parziale', issues: [
    ...rapportoMateriali().issues, { id: 'mc2-tutto', target: { kind: 'item', id: 'mc2', field: '$item' }, after: { ...mc2, question: 'Altro?' } }] } });
  m = R.setDecision(R.setDecision(m, 'mc2-tutto', 'accept'), 'i-mc2-e', 'accept');
  const e = B.decisioniDaCampo({ review: m, regime: 'g2', bersaglio: { kind: 'item', id: 'mc2', field: 'options' }, salvato: ['Oro', 'Argento'] });
  // conflitto già presente fra la $item e un altro campo: la correzione non può comporsi senza toccarli (N2)
  assert.equal(e.errore, 'conflitto_da_sciogliere'); assert.ok(!('chiamate' in e)); assert.ok(e.conflitti.length);
  assert.equal(B.decisioniDaCampo({ review: m, regime: 'g3', bersaglio: DESC, salvato: 'x' }).errore, 'regime_sconosciuto');
});

test('decisioniDaCampo non tocca la revisione che riceve', () => {
  const { db, review } = g1();
  const salvata = JSON.stringify(review);
  freeze(review);
  B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: 'Altro testo.' });
  assert.equal(JSON.stringify(review), salvata);
});

/* ═══ segni ════════════════════════════════════════════════════════════════ */
const unisci = pezzi => pezzi.map(p => p.t).join('');
test('segni: i pezzi rimessi in fila ridanno i due testi carattere per carattere (spazi doppi, a capo, apostrofi, accenti)', () => {
  const prima = 'Lo  Stato svizzero\nfu accusato d’aver accettato l\'oro, è così.';
  const testo = 'Le banche  svizzere\nfurono accusate d’aver accettato l\'oro, è così.\n';
  const s = B.segni(prima, testo);
  assert.equal(unisci(s.prima), prima); assert.equal(unisci(s.testo), testo);
  assert.deepEqual(s.prima, [{ tipo: 'tolto', t: 'Lo  Stato svizzero\nfu accusato' }, { tipo: 'uguale', t: ' d’aver accettato l\'oro, è così.' }]);
  assert.deepEqual(s.testo, [{ tipo: 'aggiunto', t: 'Le banche  svizzere\nfurono accusate' }, { tipo: 'uguale', t: ' d’aver accettato l\'oro, è così.\n' }]);
  const t2 = B.segni('Il governo nominò Guisan.\n\nBergier confermò.', 'Il Parlamento nominò Guisan.\n\nBergier  esaminò.');
  assert.deepEqual(t2.prima.filter(p => p.tipo === 'tolto').map(p => p.t), ['governo', 'confermò.']);
  assert.deepEqual(t2.testo.filter(p => p.tipo === 'aggiunto').map(p => p.t), ['Parlamento', 'esaminò.']);
  assert.equal(unisci(t2.testo), 'Il Parlamento nominò Guisan.\n\nBergier  esaminò.');
});

test('segni: testi uguali → nessun pezzo segnato; vuoti, soli spazi, e (NFD) restano tali e quali', () => {
  const t = 'Le banche  custodivano\noro.  ';
  const s = B.segni(t, t);
  assert.ok(s.prima.concat(s.testo).every(p => p.tipo === 'uguale'));
  assert.equal(unisci(s.prima), t); assert.equal(unisci(s.testo), t);
  assert.deepEqual(B.segni('', ''), { prima: [], testo: [] });
  assert.deepEqual(B.segni('', 'Nuovo testo'), { prima: [], testo: [{ tipo: 'aggiunto', t: 'Nuovo testo' }] });
  assert.deepEqual(B.segni('  \n ', '  \n '), { prima: [{ tipo: 'uguale', t: '  \n ' }], testo: [{ tipo: 'uguale', t: '  \n ' }] });
  const nfd = 'è così', nfc = 'è così';
  const n = B.segni(nfd, nfc);
  assert.equal(unisci(n.prima), nfd); assert.equal(unisci(n.testo), nfc);
});

test('segni: su testi casuali i pezzi ricompongono sempre i testi e le parole uguali sono le stesse dai due lati', () => {
  let seme = 7; const caso = () => (seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648;
  const parole = ['la', 'Svizzera', 'l’oro', "dell'esercito", 'è', 'città', 'perché', ',', '.', 'Guisan', 'là'];
  const spazi = [' ', ' ', '  ', '\n', '\n\n', '\t', ' \n'];
  const genera = () => { let s = caso() < 0.3 ? spazi[Math.floor(caso() * spazi.length)] : ''; const k = Math.floor(caso() * 12);
    for (let i = 0; i < k; i++) s += parole[Math.floor(caso() * parole.length)] + (i < k - 1 || caso() < 0.3 ? spazi[Math.floor(caso() * spazi.length)] : '');
    return s; };
  const uguali = pezzi => pezzi.filter(p => p.tipo === 'uguale').map(p => p.t).join(' ').split(/\s+/).filter(Boolean);
  for (let k = 0; k < 400; k++) {
    const a = genera(), b = caso() < 0.2 ? a : genera(), s = B.segni(a, b);
    assert.equal(unisci(s.prima), a); assert.equal(unisci(s.testo), b);
    assert.ok(s.prima.every(p => p.tipo === 'uguale' || p.tipo === 'tolto'));
    assert.ok(s.testo.every(p => p.tipo === 'uguale' || p.tipo === 'aggiunto'));
    assert.deepEqual(uguali(s.prima), uguali(s.testo));
    if (a === b) assert.ok(s.prima.concat(s.testo).every(p => p.tipo === 'uguale'));
  }
});

/* ═══ successiva ═══════════════════════════════════════════════════════════ */
// gate 3, G5: dopo l'ultima si riparte dall'inizio (prima del gate qui si chiedeva null dopo «c» e dopo «d»)
test('successiva: la prossima da rivedere dopo quella attiva, salta le fatte, e dopo l’ultima riparte dall’inizio', () => {
  const righe = [{ id: 'a', fatto: false }, { id: 'b', fatto: true }, { id: 'c', fatto: false }, { id: 'd', fatto: true }];
  assert.equal(B.successiva(righe, 'a').id, 'c');
  assert.equal(B.successiva(righe, 'c').id, 'a');
  assert.equal(B.successiva(righe, 'd').id, 'a');
  assert.equal(B.successiva(righe, null).id, 'a');
  assert.equal(B.successiva([], 'a'), null);
  const { review } = g2();
  const primo = B.righeMateriali(review, {}).righe[0].id, altro = ['mc1', 'mc2'].find(id => id !== primo);
  const out = B.righeMateriali(review, { approvati: [altro] });
  assert.equal(B.successiva(out.righe, primo).id, 'op1', 'nell’ordine dei gruppi, saltando l’approvata');
});

/* ═══ chiusura ═════════════════════════════════════════════════════════════ */
test('chiusura: tre forme della frase, conferma esplicita solo se il controllo non è completo', () => {
  const completo = { contratto: 'mappai-giudice@2', stato: 'completato', copertura: { nodiEsaminati: ['A'], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] } };
  assert.deepEqual(B.chiusura(completo), { serveConferma: false, forma: null, parti: 0, riprovaPuoRiuscire: true });
  const parziale = { contratto: 'mappai-giudice@2', stato: 'parziale', copertura: { nodiEsaminati: ['A'], nodiSaltati: [{ id: 'B' }, { id: 'C' }],
    linkEsaminati: [], linkSaltati: [{ source: 'B', target: 'C', rel: 'causa' }] } };
  assert.deepEqual(B.chiusura(parziale), { serveConferma: true, forma: 'parziale', parti: 3, riprovaPuoRiuscire: true });
  const limiti = { contratto: 'mappai-giudice@2', stato: 'parziale', fonte: { fornita: true, copertura: { pagineVuote: 1 } },
    copertura: { nodiEsaminati: ['A', 'B'], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] } };
  assert.deepEqual(B.chiusura(limiti), { serveConferma: true, forma: 'limiti-testo', parti: 0, riprovaPuoRiuscire: true });
  assert.equal(B.chiusura(null).forma, 'niente');
  assert.equal(B.chiusura(null).serveConferma, true);
  assert.equal(B.chiusura(limiti, 'completed').serveConferma, false, 'lo stato del controllo passato da chi chiama comanda');
});

test('chiusura: riprova non può riuscire oltre il tetto della fonte, può riuscire senza chiave', () => {
  const chiave = { stato: 'saltato', motivoSkip: 'chiave del provider non disponibile',
    copertura: { nodiTotali: 3, nodiEsaminati: [], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] } };
  assert.deepEqual(B.chiusura(chiave), { serveConferma: true, forma: 'niente', parti: 0, riprovaPuoRiuscire: true });
  const tetto = { contratto: 'mappai-giudice@2', stato: 'saltato', motivoSkip: 'fonte troppo lunga per il controllo integrale: 30000 caratteri, limite 24000',
    fonte: { fornita: false, copertura: { caratteri: 30000 } },
    copertura: { nodiTotali: 2, nodiEsaminati: [], nodiSaltati: [{ id: 'A' }, { id: 'B' }], linkEsaminati: [], linkSaltati: [] } };
  const c = B.chiusura(tetto);
  assert.equal(c.forma, 'niente'); assert.equal(c.serveConferma, true); assert.equal(c.riprovaPuoRiuscire, false);
});

/* ═══ GIRO DI CORREZIONI (02/10): decisioni di Giacomo A.1-A.4, difetti B.1-B.9, casi mancanti C ═══
   I casi vengono dagli script dei due verificatori (scratchpad/revisione/p1-p5.js, mutazioni-indip/controesempi.js). */
const nodo = (id, desc, label) => ({ id, label: label || id, desc });
function collegamento(extra = []) {
  const db = { nodes: [nodo('A', 'a.', 'Alfa'), nodo('B', 'b.', 'Beta')], links: [{ source: 'A', target: 'B', rel: 'causa' }] };
  const T = { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' };
  const review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 'l1', target: T, problem: 'Nesso dubbio' }, ...extra] } });
  return { db, review, T };
}
const notaB = r => r.initial.issues.filter(i => i.id === 'b1');

test('A.1 «Tieni il testo» poi correzione a mano: la nota resta reject in G2 (e in G1); il testo va nella correzione del docente, decisa', () => {
  const G = { kind: 'item', id: 'op1', field: 'guide' };
  let review = R.setDecision(g2().review, 'i-op1-g', 'reject');
  const e = B.decisioniDaCampo({ review, regime: 'g2', bersaglio: G, salvato: 'Le banche accettarono oro tedesco.' });
  assert.equal(e.chiamate[0].chiamata, 'addIssue'); assert.equal(e.chiamate[0].issue.origin, 'teacher');
  const r = applica(review, e);
  assert.equal(r.initial.decisions['i-op1-g'].choice, 'reject');
  assert.equal(outcome(r, e.chiamate[0].issue.id), 'edited');
  assert.equal(B.testoAdesso(null, r, { bersaglio: G }).adesso, 'Le banche accettarono oro tedesco.');
  // una reject e una aperta sullo stesso campo: si chiude l'aperta, la reject non si tocca
  let due = R.addIssue(review, { id: 'op1-bis', target: G, problem: 'Seconda nota' });
  const e2 = B.decisioniDaCampo({ review: due, regime: 'g2', bersaglio: G, salvato: 'Traccia nuova.' });
  assert.deepEqual(e2.chiamate, [{ chiamata: 'setDecision', issueId: 'op1-bis', choice: 'manual', opts: { text: 'Traccia nuova.' } }]);
  // G1: la stessa regola
  let g = g1(); const r1 = R.setDecision(g.review, 'b1', 'reject');
  const e3 = B.decisioniDaCampo({ review: r1, db: g.db, regime: 'g1', note: notaB(r1), salvato: 'Le banche custodivano oro.' });
  assert.equal(applica(r1, e3).initial.decisions.b1.choice, 'reject');
});

test('A.2 G1 prudente: contano le note del NODO — una sulla desc e una sul titolo, correggere la desc non chiude niente', () => {
  const db = { nodes: [nodo('N', 'Testo del nodo.', 'Titolo')], links: [] };
  const review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'd1', target: { kind: 'node', id: 'N', field: 'desc' }, problem: 'Desc dubbia' },
    { id: 't1', target: { kind: 'node', id: 'N', field: 'label' }, problem: 'Titolo dubbio' }] } });
  const D = { kind: 'node', id: 'N', field: 'desc' };
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: D, salvato: 'Testo corretto.' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const r = applica(review, e);
  assert.equal(outcome(r, 'd1'), 'pending'); assert.equal(outcome(r, 't1'), 'pending');
  const r2 = R.setDecision(review, 't1', 'reject'); // decisa la nota del titolo, quella della desc non è comunque l'unica del nodo
  assert.equal(B.decisioniDaCampo({ review: r2, db, regime: 'g1', bersaglio: D, salvato: 'Testo corretto.' }).chiamate[0].chiamata, 'addIssue');
});

test('A.3 G1: i «non letti dal controllo» restano in elenco ma fuori dal da fare, e successiva li salta', () => {
  let { db, review } = g1();
  let out = B.righeMappa(review, db);
  assert.equal(out.nonLetti.length, 2);
  out.nonLetti.forEach(r => assert.equal(r.daFare, false));
  out.nodi.concat(out.collegamenti).forEach(r => assert.equal(r.daFare, true));
  // gate 3, G5: dopo l'ultimo segnalato si riparte dall'inizio, mai nei non letti (prima del gate qui si chiedeva null)
  const dopo = B.successiva(out.righe, out.collegamenti[0].id);
  assert.ok(!!dopo && !out.nonLetti.some(r => r.id === dopo.id), 'dopo l’ultimo segnalato non si va nei non letti');
  assert.equal(dopo.id, out.righe.find(r => r.daFare).id, 'si riparte dalla prima ancora da fare');
  review = R.setDecision(review, 'a1', 'accept');
  ['a2', 'a3', 'b1', 'l1'].forEach(id => { review = R.setDecision(review, id, 'reject'); });
  out = B.righeMappa(review, db);
  assert.equal(out.righe.filter(r => r.daFare).length, 0);
  assert.equal(B.successiva(out.righe, null), null);
  assert.equal(out.nonLetti.length, 2, 'restano in elenco');
});

test('A.4/A.5 spazi doppi, tab e spazi o a capo ai BORDI non sono una decisione; un a capo interno sì', () => {
  const { db, review } = g1();
  for (const s of ['Le banche custodivano oro tedesco.\n', '\n  Le banche  custodivano\toro tedesco. \n\n', 'Le banche custodivano oro tedesco.\r\n'])
    assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaB(review), salvato: s }), { chiamate: [] }, JSON.stringify(s));
  assert.equal(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaB(review), salvato: 'Le banche custodivano oro.' }).chiamate.length, 1);
  assert.equal(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaB(review), salvato: 'Le banche custodivano\noro tedesco.' }).chiamate.length, 1, 'a capo interno');
});

test('B.1 correggere le parole di un collegamento (bersaglio con o senza rel) registra la correzione', () => {
  const { db, review, T } = collegamento();
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: T, salvato: 'provoca' });
  assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'l1', choice: 'manual', opts: { text: 'provoca' } }]);
  const r = applica(review, e);
  assert.equal(B.testoAdesso(null, r, { db, bersaglio: T }).adesso, 'provoca');
  assert.equal(R.preview(r, db).db.links[0].rel, 'provoca');
  const e2 = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: { kind: 'link', source: 'A', target: 'B', field: 'rel' }, salvato: 'provoca' });
  assert.deepEqual(e2.chiamate, e.chiamate);
});

test('B.2 «Nessuna» sul collegamento: testo vuoto → manual con relNone, come accetta il core', () => {
  const { db, review, T } = collegamento();
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: T, salvato: '' });
  assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'l1', choice: 'manual', opts: { text: '', relNone: true } }]);
  const p = R.preview(applica(review, e), db);
  assert.equal(p.ok, true); assert.equal(p.db.links[0].rel, ''); assert.equal(p.db.links[0].relNone, true);
});

test('B.3 un conflitto già presente sul campo non blocca il salvataggio che lo risolve; le note già corrette con quel testo non si ri-registrano', () => {
  let { db, review } = g1();
  const T1 = 'Lo Stato svizzero e le banche furono accusati di aver accettato oro. Le banche custodivano i depositi.';
  /* 0075 (Q6): con la regola per passo, salvare T1 dalla scheda chiude a1 (il suo passo non c'è più) e la correzione del
     docente non nasce. Lo stato di partenza di questo test — la correzione del docente, poi «Usa la proposta» su a1, in
     conflitto — si costruisce con le chiamate del core (prima: applica(review, decisioniDaCampo(… salvato: T1 …))). */
  review = R.setDecision(R.addIssue(review, { id: 'doc', target: DESC, origin: 'teacher', blocking: true, problem: 'Correzione del docente' }), 'doc', 'manual', { text: T1 });
  review = R.setDecision(review, 'a1', 'accept'); // «Usa la proposta» dopo la correzione del docente
  assert.equal(B.testoAdesso(notaA(review), review, { db }).ok, false);
  const fine = A1 + ' Fine.', doc = review.initial.issues.find(i => i.origin === 'teacher').id;
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: fine });
  assert.deepEqual(e.chiamate.map(c => [c.issueId, c.choice, c.opts.text]).sort(), [['a1', 'manual', fine], [doc, 'manual', fine]].sort());
  const r = applica(review, e);
  assert.equal(B.testoAdesso(notaA(r), r, { db }).adesso, fine);
  assert.equal(outcome(r, 'a2'), 'pending'); assert.equal(outcome(r, 'a3'), 'pending');
  // deduplica: a1 ha già il testo che si salva, solo a3 cambia
  let g = g1(); let r2 = R.setDecision(R.setDecision(g.review, 'a1', 'manual', { text: A1 + ' X.' }), 'a3', 'accept');
  assert.equal(B.testoAdesso(notaA(r2), r2, { db: g.db }).ok, false);
  assert.deepEqual(B.decisioniDaCampo({ review: r2, db: g.db, regime: 'g1', note: notaA(r2), salvato: A1 + ' X.' }).chiamate,
    [{ chiamata: 'setDecision', issueId: 'a3', choice: 'manual', opts: { text: A1 + ' X.' } }]);
});

test('B.4 G2: due note $item con la stessa proposta, entrambe accettate: la correzione di un campo va su tutte e due', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1'), after = { ...ca1, question: 'Forti pressioni' }, db = { items: [clone(ca1)] };
  let review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 't1', target: { kind: 'item', id: 'ca1', field: '$item' }, after, problem: 'Causa vaga' },
    { id: 't2', target: { kind: 'item', id: 'ca1', field: '$item' }, after, problem: 'Causa generica' }] } });
  review = R.setDecision(R.setDecision(review, 't1', 'accept'), 't2', 'accept');
  const e = B.decisioniDaCampo({ review, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' });
  const intero = { ...after, answer: 'Accordi economici' };
  assert.deepEqual(e.chiamate, ['t1', 't2'].map(id => ({ chiamata: 'setDecision', issueId: id, choice: 'manual', opts: { text: intero } })));
  const p = R.preview(applica(review, e), db);
  assert.equal(p.ok, true); assert.deepEqual(p.db.items[0], intero);
});

test('G2: una $item «Tieni il materiale» (reject) non è attiva: la correzione resta sul campo, la reject non si tocca', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1'), db = { items: [clone(ca1)] };
  let review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'via', target: { kind: 'item', id: 'ca1', field: '$item' }, after: null, problem: 'Da togliere?' }] } });
  review = R.setDecision(review, 'via', 'reject');
  const e = B.decisioniDaCampo({ review, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  assert.deepEqual(e.chiamate[0].issue.target, { kind: 'item', id: 'ca1', field: 'answer' });
  const r = applica(review, e);
  assert.equal(r.initial.decisions.via.choice, 'reject');
  assert.equal(R.preview(r, db).db.items[0].answer, 'Accordi economici');
});

test('G2: una correzione del docente rimasta «da decidere» (Banco di prima) si chiude insieme alla nota del campo', () => {
  const G = { kind: 'item', id: 'op1', field: 'guide' };
  const review = R.addIssue(g2().review, { id: 'doc-vecchia', target: G, origin: 'teacher', problem: 'Modifica del docente: Traccia' });
  const e = B.decisioniDaCampo({ review, regime: 'g2', bersaglio: G, salvato: 'Traccia nuova.' });
  assert.deepEqual(e.chiamate.map(c => [c.issueId, c.choice]), [['i-op1-g', 'manual'], ['doc-vecchia', 'manual']]);
  const r = applica(review, e);
  assert.equal(outcome(r, 'doc-vecchia'), 'edited');
});

test('B.5 un «adesso» del chiamante diverso da quello calcolato: la scheda è vecchia, nessuna decisione', () => {
  const { db, review } = g1();
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaB(review), salvato: 'Le banche custodivano oro tedesco.', adesso: 'vecchio' }),
    { errore: 'adesso_superato' });
  assert.equal(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaB(review), salvato: 'Le banche custodivano oro.',
    adesso: 'Le banche custodivano oro tedesco.' }).chiamate.length, 1);
});

test('B.6 (con A.7) righeMateriali: le note del docente non fanno «segnalato»; note decise senza il bottone = ancora da rivedere; escluso = non da rivedere', () => {
  // ca1 è controllato e senza note del controllo: l'esclusione e una correzione del docente lo mettono in elenco (R9,
  // quarto giro dello 0073; prima di R9 ne restava fuori), ma non lo fanno «segnalato» e non contano fra le note
  const ex = B.righeMateriali(R.setItemExcluded(g2().review, 'ca1', true), {}).righe.find(r => r.id === 'ca1');
  assert.deepEqual([ex.stato, ex.segnalato, ex.note, ex.daFare], ['escluso', false, 0, false]);
  let base = g2().review;
  const corr = applica(base, B.decisioniDaCampo({ review: base, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' }));
  const ca = B.righeMateriali(corr, {}).righe.find(r => r.id === 'ca1');
  assert.deepEqual([ca.stato, ca.segnalato, ca.note, ca.noteAperte, ca.daFare], ['da-rivedere', false, 0, 0, true]);
  // mc1 controllato con UNA nota: decisa la nota ma senza il bottone resta da rivedere (A.7)
  let rv = R.setDecision(g2().review, 'i-mc1-q', 'accept');
  let out = B.righeMateriali(rv, {});
  const mc1 = out.righe.find(r => r.id === 'mc1');
  assert.deepEqual([mc1.noteAperte, mc1.stato, mc1.fatto, mc1.daFare], [0, 'da-rivedere', false, true]);
  assert.equal(out.riepilogo.daRivedere, 5);
  assert.equal(out.gruppi.find(g => g.tipo === 'mc').daRivedere, 2);
  // mc2 è residuo: le note decise non bastano, serve l'approvazione per materiale
  rv = R.setDecision(rv, 'i-mc2-e', 'accept');
  assert.equal(B.righeMateriali(rv, {}).righe.find(r => r.id === 'mc2').daFare, true);
  assert.equal(B.righeMateriali(rv, { approvati: ['mc2'] }).righe.find(r => r.id === 'mc2').daFare, false);
  // un segnalato escluso dal docente: escluso, non da rivedere, anche se la sua nota è aperta
  const x = B.righeMateriali(R.setItemExcluded(g2().review, 'mc1', true), {}).righe.find(r => r.id === 'mc1');
  assert.deepEqual([x.stato, x.fatto, x.daFare], ['escluso', true, false]);
});

test('B.7 righeMappa: un collegamento non letto corretto dal docente, con bersaglio senza rel, compare una volta sola', () => {
  const db = { nodes: [nodo('A', 'a.'), nodo('C', 'c.')], links: [{ source: 'A', target: 'C', rel: 'causa' }] };
  let review = R.createReview({ db, sources: SOURCES, report: { contratto: 'mappai-giudice@2', stato: 'parziale',
    issues: [{ id: 'a1', target: { kind: 'node', id: 'A', field: 'desc' }, problem: 'x' }],
    copertura: { nodiEsaminati: ['A'], nodiSaltati: [{ id: 'C', label: 'C', motivo: 'lotto' }], linkEsaminati: [], linkSaltati: [{ source: 'A', target: 'C', rel: 'causa', motivo: 'm' }] } } });
  const senzaRel = { kind: 'link', source: 'A', target: 'C', field: 'rel' };
  const r = applica(review, B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: senzaRel, salvato: 'provoca' }));
  // anche una correzione di prima, registrata senza rel nel bersaglio
  const vecchia = R.setDecision(R.addIssue(review, { id: 'doc-vecchia', target: senzaRel, origin: 'teacher' }), 'doc-vecchia', 'manual', { text: 'provoca' });
  for (const rv of [r, vecchia]) {
    const out = B.righeMappa(rv, db);
    assert.equal(out.collegamenti.length, 0);
    const nl = out.nonLetti.filter(x => x.oggetto === 'collegamento');
    assert.equal(nl.length, 1); assert.equal(nl[0].corretto, true);
  }
  // due collegamenti A→B con parole diverse restano due righe (M13)
  const g = g1(); const db2 = mappa(); db2.links.push({ source: 'A', target: 'B', rel: 'precede' });
  const two = R.createReview({ db: db2, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'p', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: '$link' }, after: null },
    { id: 'q', target: { kind: 'link', source: 'A', target: 'B', rel: 'precede', field: '$link' }, after: null }] } });
  assert.deepEqual(B.righeMappa(two, db2).collegamenti.map(c => c.note), [1, 1]); void g;
});

test('B.8 chiusura: «limiti del testo» solo con pagine vuote o ordine di estrazione; parziale per prove scartate = «parziale»', () => {
  const base = { contratto: 'mappai-giudice@2', stato: 'parziale', copertura: { nodiEsaminati: ['A', 'B'], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] } };
  const scartati = { ...base, fonte: { fornita: true, copertura: { caratteri: 9000, pagineVuote: 0 }, diagnostica: [] },
    esitiRami: [{ id: 'A', stato: 'parziale' }], scartati: [{ id: 'A' }] };
  assert.deepEqual(B.chiusura(scartati), { serveConferma: true, forma: 'parziale', parti: 0, riprovaPuoRiuscire: true });
  assert.equal(B.chiusura({ ...base, fonte: { fornita: true, copertura: { pagineVuote: 2 } } }).forma, 'limiti-testo');
  assert.equal(B.chiusura({ ...base, fonte: { fornita: true, copertura: { pagineVuote: 0 }, diagnostica: [{ code: 'extraction_order' }] } }).forma, 'limiti-testo');
});

test('B.9 testoAdesso restituisce l’errore invece di lanciarlo', () => {
  const { review } = g2();
  assert.deepEqual(B.testoAdesso(null, review, {}), { errore: 'bersaglio_mancante' });
  assert.deepEqual(B.testoAdesso([], review), { errore: 'bersaglio_mancante' });
  assert.equal(B.testoAdesso(null, null, { bersaglio: DESC }).errore, 'invalid_review');
});

test('C/M16-M17 salvare la partenza quando «adesso» è diverso è una decisione; una nota già accettata non si ri-accetta', () => {
  let { db, review } = g1();
  review = R.setDecision(review, 'a1', 'accept');
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: DESC_A });
  assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'a1', choice: 'manual', opts: { text: DESC_A } }]);
  assert.equal(outcome(applica(review, e), 'a1'), 'kept');
  review = R.setDecision(review, 'a3', 'accept');
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: A1, now: 't1' }).chiamate,
    [{ chiamata: 'setDecision', issueId: 'a3', choice: 'manual', opts: { now: 't1', text: A1 } }]);
});

test('C/M19-M21 G2: una $item «modificata da te» è attiva; con due note sul campo si preferisce quella già decisa', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1'), db = { items: [clone(ca1)] };
  let review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'tutto', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca1, question: 'Forti pressioni' }, problem: 'x' }] } });
  review = R.setDecision(review, 'tutto', 'manual', { text: { ...ca1, question: 'Pressioni forti' } });
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' }).chiamate,
    [{ chiamata: 'setDecision', issueId: 'tutto', choice: 'manual', opts: { text: { ...ca1, question: 'Pressioni forti', answer: 'Accordi economici' } } }]);
  let m = R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: ['mc1'] }, issues: [
    { id: 'q1', target: { kind: 'item', id: 'mc1', field: 'question' }, problem: 'senza proposta' },
    { id: 'q2', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'con proposta' }] } });
  m = R.setDecision(m, 'q2', 'accept');
  assert.deepEqual(B.decisioniDaCampo({ review: m, regime: 'g2', bersaglio: { kind: 'item', id: 'mc1', field: 'question' }, salvato: 'Chi venne accusato davvero?' })
    .chiamate.map(c => [c.issueId, c.choice]), [['q2', 'manual']]);
});

test('C/M04-M06-M40 righeMateriali: totale = tutti i non esenti del tipo; daRivedere senza gli esclusi; verificati senza i residui; titolo delle catene', () => {
  const items = [...ITEMS.filter(i => i.id !== 'ns1'), { id: 'mc3', kind: 'mc', question: 'Dove?', options: ['Berna', 'Basilea'], correctIndex: 0 }];
  const crea = (coverage, issues) => R.createReview({ db: { items: clone(items) }, sources: SOURCES, report: { stato: 'parziale', coverage, issues } });
  const tutti = items.map(i => i.id);
  let out = B.righeMateriali(crea({ checkedIds: tutti }, [{ id: 'q', target: { kind: 'item', id: 'mc1', field: 'question' }, problem: 'x' }]), {});
  assert.deepEqual(out.gruppi.map(g => [g.tipo, g.daRivedere, g.totale, g.righe.length]), [['mc', 1, 3, 1]]);
  out = B.righeMateriali(crea({ checkedIds: tutti.filter(id => id !== 'sy1') }, []), { esclusi: ['sy1'] });
  assert.deepEqual(out.gruppi.map(g => [g.tipo, g.daRivedere, g.totale]), [['synthesis', 0, 1]]);
  out = B.righeMateriali(crea({ checkedIds: tutti, claims: [{ itemId: 'mc1', field: 'question', text: 'x', checked: false }] }, []), {});
  assert.deepEqual([out.riepilogo.verificati, out.righe.map(r => r.id)], [tutti.length - 1, ['mc1']]);
  out = B.righeMateriali(crea({ checkedIds: tutti }, [{ id: 'c', target: { kind: 'item', id: 'ca1', field: 'answer' }, problem: 'x' }]), {});
  assert.deepEqual(out.righe.map(r => r.titolo), ['Pressioni → Accordi']);
});

test('C/M14 un conflitto su un altro nodo non blocca questa scheda', () => {
  const db = mappa();
  let review = R.createReview({ db, sources: SOURCES, report: rapportoMappa() });
  review = R.setDecision(R.setDecision(review, 'a1', 'accept'), 'b1', 'manual', { text: 'Testo X.' });
  review = R.setDecision(R.addIssue(review, { id: 'docB', target: { kind: 'node', id: 'B', field: 'desc' }, origin: 'teacher' }), 'docB', 'manual', { text: 'Testo Y.' });
  assert.equal(B.testoAdesso(null, review, { db, bersaglio: { kind: 'node', id: 'B' } }).ok, false);
  const s = B.testoAdesso(null, review, { db, bersaglio: DESC });
  assert.equal(s.ok, true); assert.equal(s.adesso, A1);
  assert.ok(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: DESC, salvato: 'Nuovo testo di A.' }).chiamate);
});

test('C/M26-M31-M33 la correzione del docente è bloccante; \\r\\n contro \\n non segna niente; un id sparito riparte dalla prima da fare', () => {
  const { db, review } = g1();
  // 0075 (Q6): con «Altro.» i passi di a1 e a3 non ci sono più e le due note si chiudono; il testo tiene i passi
  const add = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: DESC_A + ' Altro.' }).chiamate.find(c => c.chiamata === 'addIssue');
  assert.equal(add.issue.blocking, true);
  assert.equal(R.addIssue(review, add.issue).initial.issues.find(i => i.id === add.issue.id).blocking, true);
  const s = B.segni('Le banche\r\ncustodivano oro.', 'Le banche\ncustodivano oro.');
  assert.ok(s.prima.concat(s.testo).every(p => p.tipo === 'uguale'));
  assert.equal(B.successiva([{ id: 'a', fatto: true }, { id: 'b', fatto: false }], 'sparita').id, 'b');
});

test('C/M35-M37 chiusura: riprova vera se non saltato anche con fonte non fornita; zero parti esaminate = «niente» anche se parziale', () => {
  assert.equal(B.chiusura({ stato: 'parziale', fonte: { fornita: false }, copertura: { nodiEsaminati: ['A'], nodiSaltati: [{ id: 'B' }], linkEsaminati: [], linkSaltati: [] } }).riprovaPuoRiuscire, true);
  assert.equal(B.chiusura({ stato: 'parziale', fonte: { fornita: true }, copertura: { nodiEsaminati: [], nodiSaltati: [{ id: 'A' }, { id: 'B' }], linkEsaminati: [], linkSaltati: [] } }).forma, 'niente');
});

test('la verifica finale: un conflitto già presente che resta = conflitto_da_sciogliere; le altre guardie scattano (core manomesso nel test)', () => {
  // un conflitto sul titolo dello stesso nodo che la correzione della desc non risolve: lo scioglie la veste con «Annulla»
  let { db, review } = g1();
  review = R.addIssue(R.addIssue(review, { id: 'tA', target: { kind: 'node', id: 'A', field: 'label' }, after: 'Accuse alle banche' }),
    { id: 'tB', target: { kind: 'node', id: 'A', field: 'label' }, after: 'Accuse allo Stato' });
  review = R.setDecision(R.setDecision(review, 'tA', 'accept'), 'tB', 'accept');
  const c = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review).filter(i => i.target.field === 'desc'), salvato: 'Altro testo.' });
  assert.equal(c.errore, 'conflitto_da_sciogliere'); assert.ok(!('chiamate' in c)); assert.ok(c.conflitti.length);
  const g = g1(), vero = R.setDecision;
  try {
    // conflitto creato dalle chiamate stesse (stato di partenza senza conflitti) → conflicting_decisions
    const due = R.setDecision(R.setDecision(g.review, 'a1', 'accept'), 'a3', 'accept');
    R.setDecision = (r, id, ch, o) => vero(r, id, ch, id === 'a3' && o && typeof o.text === 'string' ? { ...o, text: o.text + ' (alterato)' } : o);
    assert.equal(B.decisioniDaCampo({ review: due, db: g.db, regime: 'g1', note: notaA(due), salvato: 'Testo nuovo.' }).errore, 'conflicting_decisions');
    // N2: una correzione che cambierebbe un ALTRO campo del materiale → conflitto_da_sciogliere
    const ca1 = ITEMS.find(i => i.id === 'ca1'), mdb = { items: [clone(ca1)] };
    let m = R.createReview({ db: mdb, sources: SOURCES, report: { stato: 'parziale', issues: [
      { id: 't1', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca1, question: 'Forti pressioni' } }] } });
    m = R.setDecision(m, 't1', 'accept');
    R.setDecision = (r, id, ch, o) => vero(r, id, ch, o && o.text && typeof o.text === 'object' ? { ...o, text: { ...o.text, text: 'causano' } } : o);
    assert.equal(B.decisioniDaCampo({ review: m, db: mdb, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' }).errore, 'conflitto_da_sciogliere');
    R.setDecision = (r, id, ch, o) => r.initial.issues.find(i => i.id === id).origin === 'teacher' ? r : vero(r, id, ch, o);
    // 0075 (Q6): un testo che tiene i passi, altrimenti le note si chiudono per passo e la correzione del docente non nasce
    assert.deepEqual(B.decisioniDaCampo({ review: g.review, db: g.db, regime: 'g1', note: notaA(g.review), salvato: DESC_A + ' Altro testo.' }), { errore: 'correzione_da_decidere' });
    R.setDecision = (r, id, ch, o) => vero(r, id, ch, o && typeof o.text === 'string' ? { ...o, text: o.text + ' (alterato)' } : o);
    assert.deepEqual(B.decisioniDaCampo({ review: g.review, db: g.db, regime: 'g1', note: notaB(g.review), salvato: 'Le banche custodivano oro.' }), { errore: 'testo_diverso' });
  } finally { R.setDecision = vero; }
});

/* ═══ TERZO GIRO (02/10): A.5, A.6, N1-N4, D3-G2, contorno di B.1 — casi da scratchpad/revisione/p5.js e p6.js ═══ */
test('A.5 gli a capo interni contano: sintesi rimessa in pagina = decisione; proposta di soli a capo = accept', () => {
  const sy = { id: 'sy1', kind: 'synthesis', title: 'T', text: '## Le cause Le banche accettarono oro. - uno - due' }, db = { items: [sy] };
  const S1 = { kind: 'item', id: 'sy1', field: 'text' }, impaginata = '## Le cause\n\nLe banche accettarono oro.\n- uno\n- due';
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 's1', target: S1, problem: 'markdown rotto' }] } });
  assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g2', bersaglio: S1, salvato: impaginata }).chiamate,
    [{ chiamata: 'setDecision', issueId: 's1', choice: 'manual', opts: { text: impaginata } }]);
  const proposta = '## Le cause\n\nLe banche accettarono oro. - uno - due';
  const rp = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 's2', target: S1, after: proposta, problem: 'a capo' }] } });
  assert.deepEqual(B.decisioniDaCampo({ review: rp, db, regime: 'g2', bersaglio: S1, salvato: proposta }).chiamate,
    [{ chiamata: 'setDecision', issueId: 's2', choice: 'accept', opts: {} }]);
});

test('A.6 G2: più note APERTE sullo stesso campo e una correzione a mano: nessuna si chiude, nasce la correzione del docente decisa', () => {
  const G = { kind: 'item', id: 'op1', field: 'guide' };
  const review = R.addIssue(g2().review, { id: 'op1-bis', target: G, problem: 'Seconda nota' });
  const e = B.decisioniDaCampo({ review, regime: 'g2', bersaglio: G, salvato: 'Traccia nuova.' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const r = applica(review, e);
  assert.equal(outcome(r, 'i-op1-g'), 'pending'); assert.equal(outcome(r, 'op1-bis'), 'pending');
  assert.equal(outcome(r, e.chiamate[0].issue.id), 'edited');
  // una nota già decisa sul campo resta quella che prende la correzione
  const r2 = R.setDecision(review, 'i-op1-g', 'manual', { text: 'Prima versione.' });
  assert.deepEqual(B.decisioniDaCampo({ review: r2, regime: 'g2', bersaglio: G, salvato: 'Traccia nuova.' }).chiamate.map(c => [c.issueId, c.choice]), [['i-op1-g', 'manual']]);
});

test('N1 in conflitto, un salvataggio senza modifiche rispetto al testo MOSTRATO non decide e non conferma niente', () => {
  const D = 'Lo Stato fu accusato. Le banche custodivano i depositi.', P = 'Le banche furono accusate. Le banche custodivano i depositi.';
  const db = { nodes: [nodo('A', D)], links: [] }, T = { kind: 'node', id: 'A' };
  let rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'a1', target: { kind: 'node', id: 'A', field: 'desc' }, after: P, problem: 'x' }, { id: 'a2', target: { kind: 'node', id: 'A', field: 'desc' }, problem: 'y' }] } });
  /* 0075 (Q6): salvare dalla scheda «Lo Stato e le banche furono accusati. …» chiuderebbe a1 per passo; lo stato di partenza
     (correzione del docente, poi «Usa la proposta» su a1, in conflitto) si costruisce con le chiamate del core */
  rv = R.setDecision(R.addIssue(rv, { id: 'doc', target: { kind: 'node', id: 'A', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Correzione del docente' }),
    'doc', 'manual', { text: 'Lo Stato e le banche furono accusati. Le banche custodivano i depositi.' });
  rv = R.setDecision(rv, 'a1', 'accept');
  const s = B.testoAdesso(null, rv, { db, bersaglio: T });
  assert.equal(s.ok, false); assert.equal(s.adesso, D);
  assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: T, salvato: s.adesso, adesso: s.adesso }), { chiamate: [] });
  assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: T, salvato: D + '\n' }), { chiamate: [] });
});

test('N2 G2 in conflitto: una correzione non riporta alla partenza le proposte scelte sugli altri campi → conflitto_da_sciogliere', () => {
  const ca = { id: 'ca1', kind: 'causal', question: 'Pressioni', answer: 'Accordi', text: 'portano a' }, db = { items: [ca] };
  let rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'w1', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca, question: 'Forti pressioni' }, problem: 'x' },
    { id: 'w2', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca, text: 'causano' }, problem: 'y' }] } });
  rv = R.setDecision(R.setDecision(rv, 'w1', 'accept'), 'w2', 'accept');
  const e = B.decisioniDaCampo({ review: rv, db, regime: 'g2', bersaglio: { kind: 'item', id: 'ca1', field: 'answer' }, salvato: 'Accordi economici' });
  assert.equal(e.errore, 'conflitto_da_sciogliere'); assert.ok(!('chiamate' in e));
});

test('D3-G2: correzione del campo, poi «Usa la proposta» sulla $item: il conflitto non si scioglie da qui → conflitto_da_sciogliere', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1'), db = { items: [clone(ca1)] }, A = { kind: 'item', id: 'ca1', field: 'answer' };
  let rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'tutto', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca1, question: 'Forti pressioni' }, problem: 'Causa vaga' }] } });
  rv = applica(rv, B.decisioniDaCampo({ review: rv, db, regime: 'g2', bersaglio: A, salvato: 'Accordi economici' }));
  rv = R.setDecision(rv, 'tutto', 'accept');
  assert.equal(R.previewItem(rv, db, 'ca1').ok, false);
  for (const [bers, s] of [[A, 'Accordi economici'], [A, 'Accordi diversi'], [{ kind: 'item', id: 'ca1', field: 'text' }, 'causano']])
    assert.equal(B.decisioniDaCampo({ review: rv, db, regime: 'g2', bersaglio: bers, salvato: s }).errore, 'conflitto_da_sciogliere', s);
});

test('N3 (con A.7) righeMateriali: con le note decise ma in conflitto, o senza il bottone, resta da fare', () => {
  const mc2 = ITEMS.find(i => i.id === 'mc2');
  let rv = R.createReview({ db: { items: [clone(mc2)] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: ['mc2'] }, issues: [
    { id: 'e', target: { kind: 'item', id: 'mc2', field: 'explanation' }, after: 'I depositi d’oro.', problem: 'x' },
    { id: 'w', target: { kind: 'item', id: 'mc2', field: '$item' }, after: { ...mc2, question: 'Che cosa custodivano le banche?' }, problem: 'y' }] } });
  rv = R.setDecision(R.setDecision(rv, 'e', 'accept'), 'w', 'accept');
  assert.equal(R.previewItem(rv, { items: [mc2] }, 'mc2').ok, false);
  const o = B.righeMateriali(rv, {});
  assert.deepEqual(o.righe.map(r => [r.id, r.stato, r.fatto, r.daFare]), [['mc2', 'da-rivedere', false, true]]);
  assert.ok(!('conflitto' in o.righe[0]), 'con A.7 il rilevamento del conflitto non serve più (C1)');
  assert.equal(B.successiva(o.righe, null).id, 'mc2');
  // il caso di p8.js (C1): tre decisioni sullo stesso campo, tutte prese → senza il bottone resta da rivedere
  const IT = { id: 'm1', kind: 'mc', question: 'Chi fu accusato nel dopoguerra?', options: ['a', 'b'], correctIndex: 1, explanation: 'x' };
  let m = R.createReview({ db: { items: [IT] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: ['m1'] }, issues: [
    { id: 'n0', target: { kind: 'item', id: 'm1', field: 'question' }, after: 'Chi fu accusato nel dopoguerra?!' },
    { id: 'n2', target: { kind: 'item', id: 'm1', field: 'question' }, after: 'Chi venne accusato dopo la guerra?' },
    { id: 'n3', target: { kind: 'item', id: 'm1', field: 'question' }, after: 'Chi venne accusato dopo la guerra?' }] } });
  m = ['n0', 'n2', 'n3'].reduce((r, id) => R.setDecision(r, id, 'accept'), m);
  assert.deepEqual(B.righeMateriali(m, {}).righe.map(r => [r.stato, r.daFare]), [['da-rivedere', true]]);
  // un'esclusione decisa dal docente sospende le altre decisioni (come nel core): escluso
  const ex = R.setItemExcluded(rv, 'mc2', true);
  assert.equal(R.previewItem(ex, { items: [mc2] }, 'mc2').ok, true);
  assert.deepEqual(B.righeMateriali(ex, {}).righe.map(r => [r.stato, r.daFare]), [['escluso', false]]);
});

test('A.7 tre stati del materiale: cliccato e cambiato oltre spazi e punteggiatura = rivisto; cliccato e no = approvato; il resto da rivedere', () => {
  let rv = g2().review;
  rv = R.setDecision(rv, 'i-mc1-q', 'accept'); // «Chi fu accusato?» → «Chi venne accusato?»: parole cambiate
  rv = R.setDecision(rv, 'i-op1-g', 'manual', { text: 'Le banche accettarono oro' }); // solo il punto finale tolto
  rv = R.setDecision(rv, 'i-mc2-e', 'manual', { text: 'I depositi.' }); // invariato, ma mc2 non è cliccato
  const out = B.righeMateriali(rv, { approvati: ['mc1', 'op1', 'fc1'] });
  const st = Object.fromEntries(out.righe.map(r => [r.id, [r.stato, r.fatto, r.daFare]]));
  assert.deepEqual(st, { mc1: ['rivisto', true, false], op1: ['approvato', true, false], fc1: ['approvato', true, false],
    mc2: ['da-rivedere', false, true], sy1: ['da-rivedere', false, true] });
  assert.deepEqual(out.riepilogo, { generati: 6, verificati: 3, daRivedere: 2, rivisti: 1, approvati: 2, esclusi: 0, esenti: 1 });
  // una correzione a mano che cambia una maiuscola è «rivisto»; un $item che cambia solo la punteggiatura è «approvato»
  let r2 = R.setDecision(g2().review, 'i-mc1-q', 'manual', { text: 'chi fu accusato?' });
  assert.equal(B.righeMateriali(r2, { approvati: ['mc1'] }).righe.find(r => r.id === 'mc1').stato, 'rivisto');
  const ca1 = ITEMS.find(i => i.id === 'ca1');
  let r3 = R.createReview({ db: { items: [clone(ca1)] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: [] }, issues: [
    { id: 'w', target: { kind: 'item', id: 'ca1', field: '$item' }, after: { ...ca1, question: 'Pressioni.', text: 'portano  a' } }] } });
  r3 = R.setDecision(r3, 'w', 'accept');
  assert.equal(B.righeMateriali(r3, { approvati: ['ca1'] }).righe[0].stato, 'approvato');
  // somma del riepilogo su più casi
  for (const o of [out, B.righeMateriali(g2().review, {}), B.righeMateriali(g2().review, { approvati: ['fc1'], esclusi: ['sy1'] }), B.righeMateriali(r2, { approvati: ['mc1'] })]) {
    const q = o.riepilogo;
    assert.equal(q.daRivedere + q.rivisti + q.approvati + q.esclusi, o.righe.length);
    o.righe.forEach(r => assert.equal(r.daFare, r.stato === 'da-rivedere'));
  }
});

test('A.8 l’esclusione resta, fuori dai tre stati: «Escludi il materiale» sulla nota del controllo, o del docente', () => {
  const ca1 = ITEMS.find(i => i.id === 'ca1'), db = { items: [clone(ca1)] };
  const crea = issues => R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: ['ca1'] }, issues } });
  const via = { id: 'via', target: { kind: 'item', id: 'ca1', field: '$item' }, after: null, problem: 'Da togliere' };
  let r = R.setDecision(crea([via]), 'via', 'accept');
  assert.equal(R.previewItem(r, db, 'ca1').excluded, true);
  let out = B.righeMateriali(r, { approvati: ['ca1'] });
  assert.deepEqual(out.righe.map(x => [x.stato, x.daFare]), [['escluso', false]]);
  assert.equal(out.riepilogo.esclusi, 1); assert.equal(out.riepilogo.daRivedere, 0);
  // proposta di esclusione accettata ma un'altra modifica dello stesso materiale: il core non la applica (conflitto) → non escluso
  r = R.setDecision(R.setDecision(crea([via, { id: 'a', target: { kind: 'item', id: 'ca1', field: 'answer' }, after: 'Accordi economici' }]), 'via', 'accept'), 'a', 'accept');
  assert.equal(R.previewItem(r, db, 'ca1').ok, false);
  assert.equal(B.righeMateriali(r, {}).righe[0].stato, 'da-rivedere');
  // l'esclusione del docente vince anche su un clic precedente
  // controllato e senza note del controllo, escluso dal docente: in elenco per R9 (quarto giro dello 0073; prima ne
  // restava fuori), escluso e non da fare
  assert.deepEqual(B.righeMateriali(R.setItemExcluded(crea([]), 'ca1', true), {}).righe.map(x => [x.id, x.stato, x.daFare]), [['ca1', 'escluso', false]]);
  assert.equal(B.righeMateriali(R.setItemExcluded(g2().review, 'mc1', true), { approvati: ['mc1'] }).righe.find(x => x.id === 'mc1').stato, 'escluso');
});

test('esitoBottone: spazi (a capo compresi) e punteggiatura non contano, maiuscole sì; stringhe e materiali campo per campo', () => {
  assert.equal(B.esitoBottone('l\'oro della Banca', 'l’oro della Banca'), 'approvato');
  assert.equal(B.esitoBottone('Pressioni, accordi e oro.', 'Pressioni accordi e oro'), 'approvato');
  assert.equal(B.esitoBottone('«Neutralità» — sempre…', '"Neutralità" sempre...'), 'approvato');
  assert.equal(B.esitoBottone('Uno. Due.', 'Uno.\n\nDue.'), 'rivisto', 'A.10: un a capo interno conta');
  assert.equal(B.esitoBottone('La Banca', 'la Banca'), 'rivisto');
  assert.equal(B.esitoBottone('Le banche', 'Gli istituti'), 'rivisto');
  const q = { id: 'q', kind: 'mc', question: 'Chi?', options: ['Lo Stato', 'Le banche'], correctIndex: 1 };
  assert.equal(B.esitoBottone(q, { ...q, options: ['Lo Stato.', 'Le banche'] }), 'approvato');
  assert.equal(B.esitoBottone(q, { ...q, correctIndex: 0 }), 'rivisto');
  assert.equal(B.esitoBottone(q, { ...q, options: ['Lo Stato', 'Le banche', 'Il Parlamento'] }), 'rivisto');
  assert.equal(B.esitoBottone(q, { ...q, explanation: 'Nuova.' }), 'rivisto');
  assert.equal(B.esitoBottone(q, clone(q)), 'approvato');
});

test('esitoBottone (quinto giro, A.10): si confrontano parole e righe; solo la punteggiatura tipografica ai bordi delle parole non conta', () => {
  // cambi di senso (scratchpad/revisione/p9.js): tutti «rivisto»
  for (const [a, b] of [['-5 °C', '5 °C'], ['3.5 milioni', '35 milioni'], ['1,5 kg', '15 kg'], ['2/3', '23'], ['50%', '50'], ["l'oro", 'loro'],
    ['l’una', 'luna'], ['(a+b)c', 'a+bc'], ['x_1', 'x1'], ['## Titolo', 'Titolo'], ['**Nota**', 'Nota'], ['A & B', 'AB'], ['per ché', 'perché'],
    ['dopo guerra', 'dopoguerra'], ['−5', '5'], ['le banche', 'Le banche'], ['## Le cause Le banche', '## Le cause\n\nLe banche'], ['Uno.\n\nDue.', 'Uno.\nDue.']])
    assert.equal(B.esitoBottone(a, b), 'rivisto', JSON.stringify([a, b]));
  // solo forma: «approvato»
  for (const [a, b] of [['Le banche, i depositi', 'Le banche i depositi'], ['Le banche i depositi', 'Le banche, i depositi'], ['Le banche.', 'Le banche'],
    ['«Neutralità»', '"Neutralità"'], ['“oro” e ‘argento’', '"oro" e \'argento\''], ['l’oro', "l'oro"], ['Oro — e argento', 'Oro e argento'],
    ['Oro  e argento', 'Oro e argento'], ['  Oro e argento \n', 'Oro e argento'], ['Uno. \nDue.', 'Uno.\nDue.'], ['Uno.\n \nDue.', 'Uno.\n\nDue.'],
    ['Uno.\r\nDue.', 'Uno.\nDue.'], ['(nota) [vedi]', 'nota vedi'], ['Davvero?!', 'Davvero'], ['Fine…', 'Fine'], ['Così: sì; no', 'Così sì no']])
    assert.equal(B.esitoBottone(a, b), 'approvato', JSON.stringify([a, b]));
  // stessa definizione nella riga di G2: un segno meno tolto da una proposta accettata è «rivisto»
  const fc = { id: 'f1', kind: 'flashcard', question: 'Temperatura minima?', answer: '-5 °C' };
  let r = R.createReview({ db: { items: [fc] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: [] }, issues: [
    { id: 'q', target: { kind: 'item', id: 'f1', field: 'answer' }, after: '5 °C', problem: 'x' }] } });
  r = R.setDecision(r, 'q', 'accept');
  assert.equal(B.righeMateriali(r, { approvati: ['f1'] }).righe[0].stato, 'rivisto');
  // e una sintesi rimessa in pagina (A.5 registra la decisione, A.10 la chiama «rivisto»)
  const sy = { id: 'sy1', kind: 'synthesis', title: 'T', text: '## Le cause Le banche accettarono oro.' };
  let s = R.createReview({ db: { items: [sy] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: [] }, issues: [
    { id: 's1', target: { kind: 'item', id: 'sy1', field: 'text' }, problem: 'markdown' }] } });
  s = applica(s, B.decisioniDaCampo({ review: s, regime: 'g2', bersaglio: { kind: 'item', id: 'sy1', field: 'text' }, salvato: '## Le cause\n\nLe banche accettarono oro.' }));
  assert.equal(B.righeMateriali(s, { approvati: ['sy1'] }).righe[0].stato, 'rivisto');
});

test('esitoBottone (sesto giro, ADR 0012 rev. 5 A.2): solo le lineette ISOLATE non contano; il meno e il decimale senza zero sì', () => {
  // rivisto: lineette attaccate a un numero o a una parola, decimale senza zero, simboli ai bordi
  for (const [a, b] of [['La temperatura scende a –12 °C.', 'La temperatura scende a 12 °C.'], ['—3', '3'], ['x = –3', 'x = 3'], ['–430 m', '430 m'],
    ['–1’200', '1’200'], ['5', '–5'], ['―3', '3'], ['–430', '-430'], ['−5', '-5'], ['.5 kg', '5 kg'], [',5 kg', '5 kg'], ['(.5 kg)', '5 kg'],
    ['Na+', 'Na'], ['+5 °C', '5 °C'], ['x = 3', 'x 3'], ['A / B', 'A B'], ['_Nota_', 'Nota'], ['A & B', 'A B'], ['90°', '90'],
    ['nota*', 'nota'], ['Nota *', 'Nota'], ['C#', 'C']])
    assert.equal(B.esitoBottone(a, b), 'rivisto', JSON.stringify([a, b]));
  // approvato: lineette isolate di ogni tipo, punto finale dopo un numero, virgolette e apostrofi, spazi speciali
  for (const [a, b] of [['Oro — e argento', 'Oro e argento'], ['Oro – e argento', 'Oro e argento'], ['Oro ― e ‒ argento ‐ ‑', 'Oro e argento'],
    ['Pesa 5.', 'Pesa 5'], ['Pesa 5 kg.', 'Pesa 5 kg'], ['(5)', '5'],
    ['«oro»', 'oro'], ['"oro"', 'oro'], ['„oro“', 'oro'], ['‘oro’', 'oro'], ["'oro'", 'oro'],
    ['parola“citata”', 'parola"citata"'], ['l‘oro', "l'oro"],
    ['5 °C', '5 °C'], ['5 °C', '5 °C'], ['Le banche', 'Le banche']])
    assert.equal(B.esitoBottone(a, b), 'approvato', JSON.stringify([a, b]));
});

test('C2 segni: un a capo interno aggiunto o tolto si segna; spazi doppi e tab no; l’invariante resta', () => {
  const unisci2 = p => p.map(x => x.t).join('');
  for (const [a, b] of [['Uno. Due.', 'Uno.\nDue.'], ['Uno.\n\nDue.', 'Uno.\nDue.'], ['## Titolo Testo.', '## Titolo\n\nTesto.']]) {
    const s = B.segni(a, b);
    assert.equal(unisci2(s.prima), a); assert.equal(unisci2(s.testo), b);
    assert.ok(s.prima.some(p => p.tipo === 'tolto' && !/\S/.test(p.t)), JSON.stringify(s.prima));
    assert.ok(s.testo.some(p => p.tipo === 'aggiunto' && !/\S/.test(p.t)), JSON.stringify(s.testo));
    assert.ok(s.prima.concat(s.testo).every(p => p.tipo === 'uguale' || !/\S/.test(p.t)), 'le parole restano uguali');
  }
  for (const [a, b] of [['a  b', 'a\tb'], ['a\r\nb', 'a\nb'], ['a b\n', '  a b']]) {
    const s = B.segni(a, b);
    assert.ok(s.prima.concat(s.testo).every(p => p.tipo === 'uguale'), JSON.stringify([a, b]));
  }
});

test('C3 spazi e tab attaccati a un a capo, e righe di soli spazi, non contano (decisioni e segni)', () => {
  const D = 'Le banche custodivano oro.\nLo Stato tacque.', db = { nodes: [nodo('B', D)], links: [] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 'b1', target: { kind: 'node', id: 'B', field: 'desc' }, problem: 'x' }] } });
  for (const s of ['Le banche custodivano oro. \nLo Stato tacque.', 'Le banche custodivano oro.\n\tLo Stato tacque.']) {
    assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: { kind: 'node', id: 'B' }, salvato: s }), { chiamate: [] }, JSON.stringify(s));
    assert.ok(B.segni(D, s).testo.every(p => p.tipo === 'uguale'));
  }
  const D2 = 'Uno.\n\nDue.', db2 = { nodes: [nodo('C', D2)], links: [] };
  const rv2 = R.createReview({ db: db2, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 'c1', target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'x' }] } });
  assert.deepEqual(B.decisioniDaCampo({ review: rv2, db: db2, regime: 'g1', bersaglio: { kind: 'node', id: 'C' }, salvato: 'Uno.\n \nDue.' }), { chiamate: [] });
  assert.ok(B.segni(D2, 'Uno.\n \nDue.').testo.every(p => p.tipo === 'uguale'));
});

test('N4 righeMappa: «note» conta solo le note del controllo, come righeMateriali', () => {
  const db = { nodes: [nodo('N', 'Testo.', 'Tit')], links: [] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 'l', target: { kind: 'node', id: 'N', field: 'label' }, problem: 'titolo' }] } });
  const r = applica(rv, B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: { kind: 'node', id: 'N', field: 'desc' }, salvato: 'Testo nuovo.' }));
  assert.deepEqual(B.righeMappa(r, db).nodi.map(x => [x.id, x.note, x.noteAperte, x.fatto]), [['N', 1, 1, false]]);
});

test('contorno B.1: un bersaglio senza rel su due collegamenti con gli stessi estremi è ambiguo, e lo dice', () => {
  const db = { nodes: [nodo('A', 'a'), nodo('B', 'b')], links: [{ source: 'A', target: 'B', rel: 'causa' }, { source: 'A', target: 'B', rel: 'precede' }] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'l1', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, after: 'provoca', problem: 'x' }] } });
  const T = { kind: 'link', source: 'A', target: 'B', field: 'rel' };
  assert.deepEqual(B.testoAdesso(null, rv, { db, bersaglio: T }), { errore: 'bersaglio_ambiguo' });
  assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: T, salvato: 'segue' }), { errore: 'bersaglio_ambiguo' });
  assert.equal(B.testoAdesso(null, rv, { db, bersaglio: { ...T, rel: 'causa' } }).partenza, 'causa');
});

/* ═══ il modulo ════════════════════════════════════════════════════════════ */
test('il modulo è puro: niente DOM, niente archivio, niente date; nessuna approvazione in blocco', () => {
  const src = fs.readFileSync(require.resolve('../public/js/mappai-banco-core.js'), 'utf8');
  assert.ok(!/document|window\.|localStorage|electronAPI|Date\.now|new Date/.test(src));
  // 0075, settimo giro (D-b): `piano` esportato, perché la veste giudichi «uguale» come la regola 1
  // 0086, giro 3a (D36–D39): le spunte della riga, le uscite di una spunta tolta, le chiamate del bottone in fondo, il
  // salvataggio del campo che non decide le note, il conto dell'avviso. Via `noteConSpunta` e `testoSenzaPasso` del giro 1.
  assert.deepEqual(Object.keys(B).sort(), ['chiamateBottone', 'chiusura', 'correzioneDelCampo', 'decisioniDaCampo', 'esitoBottone', 'frasiContestate', 'piano',
    'righeMappa', 'righeMateriali', 'segni', 'spunteDellaRiga', 'successiva', 'testoAdesso', 'usciteSpunteTolte']);
  assert.ok(!/setManualCheck|beginApproval|completeApproval/.test(src), 'il Banco puro non approva');
});

/* 0075, settimo giro (D-b): la veste toglie una correzione del docente rimessa «uguale» al testo di partenza con la stessa
   normalizzazione con cui la regola 1 di `decisioniDaCampo` giudica «uguale» (spazi doppi, spazi ai bordi, «\r\n»). */
test('G7 D-b: `piano` è la normalizzazione della regola 1 — spazi doppi e ai bordi non contano, il numero degli a capo interni sì', () => {
  assert.equal(B.piano('Il commercio  continuò. '), 'Il commercio continuò.');
  assert.equal(B.piano('Il commercio continuò.\n'), 'Il commercio continuò.');
  assert.equal(B.piano('a \r\n b'), 'a\nb');
  assert.notEqual(B.piano('a\n\nb'), B.piano('a\nb'), 'gli a capo interni contano');
  assert.deepEqual(B.piano({ x: ' a ', y: ['b  c'] }), { x: 'a', y: ['b c'] });
  // la stessa che usa la regola 1: rimesso il testo a meno di spazi, nessuna chiamata
  const db = { nodes: [{ id: 'n', label: 'N', desc: 'Il commercio continuò.' }], links: [] };
  const review = R.createReview({ db, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: { kind: 'node', id: 'n', field: 'desc' }, salvato: 'Il commercio  continuò. ' }).chiamate, []);
});

test('UMD: nel browser prende i core da globalThis ed espone MappAIBancoCore', () => {
  const ctx = vm.createContext({});
  ['mappai-review-core.js', 'mappai-review-context.js', 'mappai-banco-core.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), ctx));
  const BB = ctx.MappAIBancoCore;
  assert.equal(typeof BB.decisioniDaCampo, 'function');
  const { review } = g2();
  assert.deepEqual(JSON.parse(JSON.stringify(BB.righeMateriali(review, {}))), JSON.parse(JSON.stringify(B.righeMateriali(review, {}))));
  assert.equal(BB.segni('a  b', 'a  c').testo.map(p => p.t).join(''), 'a  c');
});

/* ═══ R3 (packet 0073, decisione di Giacomo del 04/10) ═════════════════════
   (a) l'apostrofo in FONDO a una parola conta: «po'» e «Po» sono parole diverse, «E'» è un accento scritto
   a mano. Le virgolette semplici restano ritocchi: un apostrofo di chiusura che chiude uno di apertura sulla
   stessa riga si toglie come prima. (b) la veste passa l'insieme dei «rivisti» e decide lei. */
test('R3 esitoBottone: l’apostrofo in fondo a una parola conta; le virgolette semplici appaiate no', () => {
  for (const [a, b] of [["un po'", 'un po'], ["E' vero", 'E vero'], ['un po’', 'un po'], ['un po', "un po'"], ["Po'", 'Po'],
    ["c'era un po' d'acqua", "c'era un po d'acqua"], ["'tempo' e po'", "'tempo' e po"]])
    assert.equal(B.esitoBottone(a, b), 'rivisto', JSON.stringify([a, b]));
  for (const [a, b] of [["'tempo'", 'tempo'], ['‘tempo’', 'tempo'], ["'il tempo'", 'il tempo'], ["'tempo'.", 'tempo'], ["('tempo')", 'tempo'],
    ["«'tempo'»", 'tempo'], ["un po'", 'un po’'], ["l'oro", 'l’oro'], ["'oro'", 'oro'], ['‘oro’', 'oro']])
    assert.equal(B.esitoBottone(a, b), 'approvato', JSON.stringify([a, b]));
  // le virgolette si appaiano dentro una riga: un apostrofo di apertura su una riga non chiude quello della riga dopo
  assert.equal(B.esitoBottone("'Uno\ndue'", 'Uno\ndue'), 'rivisto');
});

test('R3 righeMateriali: con `rivisti` decide la veste, al posto di cambiatoDalDocente (neutrale , commerciando)', () => {
  const fc = { id: 'f9', kind: 'flashcard', question: 'Che cosa fece?', answer: 'Restò neutrale , commerciando.' };
  let r = R.createReview({ db: { items: [fc] }, sources: SOURCES, report: { stato: 'parziale', coverage: { checkedIds: [] }, issues: [
    { id: 'p1', target: { kind: 'item', id: 'f9', field: 'answer' }, after: 'Restò neutrale, commerciando.', problem: 'spazio' },
    { id: 'p2', target: { kind: 'item', id: 'f9', field: 'answer' }, after: 'Restò neutrale ,commerciando.', problem: 'spazio' }] } });
  r = R.setDecision(R.setDecision(r, 'p1', 'accept'), 'p2', 'accept');
  const p = R.previewItem(r, { items: [fc] }, 'f9');
  assert.equal(p.ok, true);
  assert.equal(p.db.items[0].answer, 'Restò neutrale,commerciando.', 'le due proposte, composte, saldano due parole');
  assert.equal(B.esitoBottone(fc, p.db.items[0]), 'rivisto');
  assert.equal(B.righeMateriali(r, { approvati: ['f9'] }).righe[0].stato, 'approvato', 'una decisione alla volta: il limite noto');
  assert.equal(B.righeMateriali(r, { approvati: ['f9'], rivisti: new Set(['f9']) }).righe[0].stato, 'rivisto', 'con `rivisti` vince la veste');
  // e nei due sensi: un insieme presente e vuoto dice «approvato» anche quando le decisioni direbbero «rivisto»
  const ca = R.setDecision(g2().review, 'i-mc1-q', 'accept');
  assert.equal(B.righeMateriali(ca, { approvati: ['mc1'] }).righe.find(x => x.id === 'mc1').stato, 'rivisto');
  assert.equal(B.righeMateriali(ca, { approvati: ['mc1'], rivisti: [] }).righe.find(x => x.id === 'mc1').stato, 'approvato');
  // `rivisti` non tocca chi non è stato cliccato né gli esclusi, e il riepilogo resta coerente
  const out = B.righeMateriali(ca, { approvati: ['mc1'], rivisti: ['mc1', 'mc2', 'sy1'], esclusi: ['sy1'] });
  const st = Object.fromEntries(out.righe.map(x => [x.id, x.stato]));
  assert.deepEqual(st, { mc1: 'rivisto', mc2: 'da-rivedere', op1: 'da-rivedere', fc1: 'da-rivedere', sy1: 'escluso' });
  assert.deepEqual(out.riepilogo, { generati: 6, verificati: 3, daRivedere: 3, rivisti: 1, approvati: 0, esclusi: 1, esenti: 1 });
});

/* ═══ Giro di correzione dello 0073 (05/10) ════════════════════════════════════════════════════════════════ */
test('C05 R3: la punteggiatura dentro le virgolette semplici si toglie in più passate («\'tempo.\'» / «tempo»)', () => {
  assert.equal(B.esitoBottone("'tempo.'", 'tempo'), 'approvato');
  assert.equal(B.esitoBottone("('tempo.')", 'tempo'), 'approvato');
});

test('difetto 11: un apostrofo davanti a una cifra è l’elisione di un anno («\'45»), non apre una virgoletta', () => {
  for (const [a, b] of [["Nel '45 E' finita la guerra", "Nel '45 E finita la guerra"], ["Nel '68 si parlava un po' di tutto", "Nel '68 si parlava un po di tutto"],
    ["Fra il '39 e il '45 un po' di oro", "Fra il '39 e il '45 un po di oro"]])
    assert.equal(B.esitoBottone(a, b), 'rivisto', JSON.stringify([a, b]));
  // le virgolette vere, dopo un anno abbreviato, si riconoscono ancora
  assert.equal(B.esitoBottone("Nel '45 'tempo'", "Nel '45 tempo"), 'approvato');
  assert.equal(B.esitoBottone("'45", '45'), 'approvato', 'l’apostrofo in testa resta un segno ai bordi');
});

test('difetto 5: righeMateriali dà una riga a ogni materiale con una nota aperta (anche del docente, anche esente) e ai `bloccati`', () => {
  // controllo completo: op1 e ns1 senza note del controllo, con una correzione del docente rimasta aperta
  let r = R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  assert.deepEqual(B.righeMateriali(r, {}).righe, []);
  r = R.addIssue(r, { target: { kind: 'item', id: 'op1', field: 'guide' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' });
  r = R.addIssue(r, { target: { kind: 'item', id: 'ns1', field: 'text' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' });
  const out = B.righeMateriali(r, {});
  assert.deepEqual(out.righe.map(x => [x.id, x.tipo, x.noteAperte, x.stato, x.segnalato]), [['op1', 'open', 1, 'da-rivedere', false], ['ns1', 'nodesheet', 1, 'da-rivedere', false]]);
  const ordine = r.baseSnapshot.items.filter(i => i.kind !== 'nodesheet').map(i => i.id);
  assert.equal(out.righe[0].n, ordine.indexOf('op1') + 1);
  assert.equal(out.righe[1].n, null, 'esente: nessun numero fra i materiali');
  assert.deepEqual(out.gruppi.map(g => [g.tipo, g.daRivedere, g.totale]), [['open', 1, 1], ['nodesheet', 1, 1]]);
  assert.deepEqual(out.riepilogo, { generati: 6, verificati: 0, daRivedere: 2, rivisti: 0, approvati: 0, esclusi: 0, esenti: 1 });
  // decisa la nota, il materiale controllato resta in elenco, da rivedere fino al clic (R9, quarto giro dello 0073;
  // prima di R9 ne usciva), e la sua nota non conta più fra le aperte
  const decisa = R.setDecision(r, out.righe[0] && r.initial.issues.find(i => i.target.id === 'op1').id, 'reject');
  assert.deepEqual(B.righeMateriali(decisa, {}).righe.map(x => [x.id, x.noteAperte, x.stato]), [['op1', 0, 'da-rivedere'], ['ns1', 1, 'da-rivedere']]);
  // `bloccati`: i materiali che la veste trova in conflitto nel `preview` globale hanno una riga, da rivedere
  const b = B.righeMateriali(R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } }), { bloccati: ['fc1', 'ns1'] });
  assert.deepEqual(b.righe.map(x => [x.id, x.stato]), [['fc1', 'da-rivedere'], ['ns1', 'da-rivedere']]);
  // e la scheda dei nodi senza note resta fuori (come prima)
  assert.ok(!B.righeMateriali(g2().review, {}).righe.some(x => x.id === 'ns1'));
});

/* ═══ Quarto giro dello 0073: R9 (Giacomo, 05/10, «dedotto dai dati») ═══════════════════════════════════════
   R7 oltre la seduta: ogni materiale su cui esiste una segnalazione del docente (`origin: 'teacher'`), aperta o
   decisa, ha una riga, da rivedere finché il docente non preme il suo bottone. È nei dati della revisione, quindi
   regge anche alla riapertura del Banco: il core non ricorda niente fra una chiamata e l'altra. */
test('R9 righeMateriali: una correzione salvata, una nota decisa, un’esclusione e un ripristino del docente danno una riga, da rivedere fino al clic — anche su una Scheda nodi', () => {
  const completo = () => R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } });
  assert.deepEqual(B.righeMateriali(completo(), {}).righe, [], 'controllo completo e niente del docente: nessuna riga');
  let r = completo();
  // la correzione salvata di un campo (la stessa scrittura di «Cerca altre occorrenze»)
  r = applica(r, B.decisioniDaCampo({ review: r, regime: 'g2', bersaglio: { kind: 'item', id: 'fc1', field: 'answer' }, salvato: 'Non partecipare alla guerra.' }));
  // una nota del docente decisa («Tieni il testo»)
  r = R.setDecision(R.addIssue(r, { id: 'doc-op1', target: { kind: 'item', id: 'op1', field: 'guide' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' }), 'doc-op1', 'reject');
  // una Scheda nodi corretta, un materiale escluso, un materiale escluso e poi ripristinato
  r = R.setDecision(R.addIssue(r, { id: 'doc-ns1', target: { kind: 'item', id: 'ns1', field: 'text' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' }), 'doc-ns1', 'manual', { text: 'Scheda del nodo, corretta.' });
  r = R.setItemExcluded(r, 'sy1', true);
  r = R.setItemExcluded(R.setItemExcluded(r, 'ca1', true), 'ca1', false);
  const righe = o => o.righe.map(x => [x.id, x.stato, x.noteAperte, x.segnalato, x.note]);
  assert.deepEqual(righe(B.righeMateriali(r, {})), [['op1', 'da-rivedere', 0, false, 0], ['fc1', 'da-rivedere', 0, false, 0],
    ['ca1', 'da-rivedere', 0, false, 0], ['sy1', 'escluso', 0, false, 0], ['ns1', 'da-rivedere', 0, false, 0]]);
  assert.equal(B.righeMateriali(r, {}).riepilogo.daRivedere, 4);
  // col clic (gli approvati li passa la veste) la riga resta, approvata o rivista; nessuna è più da rivedere
  const dopo = B.righeMateriali(r, { approvati: ['op1', 'fc1', 'ca1', 'ns1'] });
  assert.deepEqual(dopo.righe.map(x => [x.id, x.stato]), [['op1', 'approvato'], ['fc1', 'rivisto'], ['ca1', 'approvato'], ['sy1', 'escluso'], ['ns1', 'rivisto']]);
  assert.equal(dopo.riepilogo.daRivedere, 0);
  // le note del controllo decise restano quelle di prima: un materiale controllato con la sua nota decisa ma senza
  // niente del docente non entra per R9 (entra già, come prima, perché segnalato)
  const g = R.setDecision(g2().review, 'i-mc1-q', 'reject');
  assert.deepEqual(B.righeMateriali(g, {}).righe.filter(x => x.id === 'mc1').map(x => [x.segnalato, x.note]), [[true, 1]]);
});

/* Quinto giro, punto 4 (R7/R9): una Scheda nodi con una segnalazione — del controllo o del docente, aperta o
   decisa — resta in elenco fino al clic, anche riaprendo. Nel quarto giro questo test diceva il contrario per la nota
   del controllo («decisa, la scheda esente esce»): era il difetto 5 della revisione. */
test('R9, Scheda nodi (punto 4): una nota del CONTROLLO su una Scheda nodi dà una riga aperta o decisa, da rivedere fino al clic', () => {
  const nota = { id: 'c-ns1', target: { kind: 'item', id: 'ns1', field: 'text' }, after: 'Scheda del nodo Germania.', problem: 'Manca il nodo.' };
  const r = R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues: [nota] } });
  assert.deepEqual(B.righeMateriali(r, {}).righe.map(x => [x.id, x.noteAperte, x.stato, x.segnalato]), [['ns1', 1, 'da-rivedere', true]]);
  const decisa = R.setDecision(r, 'c-ns1', 'accept');
  assert.deepEqual(B.righeMateriali(decisa, {}).righe.map(x => [x.id, x.noteAperte, x.stato, x.n]), [['ns1', 0, 'da-rivedere', null]], 'decisa, la riga resta fino al clic');
  assert.deepEqual(B.righeMateriali(decisa, { approvati: ['ns1'] }).righe.map(x => [x.id, x.stato]), [['ns1', 'rivisto']]);
  // una Scheda nodi senza segnalazioni resta fuori, come prima
  assert.deepEqual(B.righeMateriali(R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues: [] } }), {}).righe, []);
});

test('punto 5: `noteAperte` conta le note ancora aperte, del controllo e del docente; le decise no', () => {
  const issues = [{ id: 'c1', target: { kind: 'item', id: 'mc1', field: 'question' }, after: 'Chi venne accusato?', problem: 'Forma.' },
    { id: 'c2', target: { kind: 'item', id: 'mc1', field: 'explanation' }, problem: 'Spiegazione.' }];
  let r = R.createReview({ db: { items: clone(ITEMS) }, sources: SOURCES, report: { checkStatus: 'completed', issues } });
  r = R.addIssue(r, { id: 'd1', target: { kind: 'item', id: 'mc1', field: 'options' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' });
  const aperte = x => B.righeMateriali(x, {}).righe.find(y => y.id === 'mc1').noteAperte;
  assert.equal(aperte(r), 3);
  r = R.setDecision(r, 'c1', 'reject'); assert.equal(aperte(r), 2);
  r = R.setDecision(r, 'd1', 'reject'); assert.equal(aperte(r), 1, 'anche la nota del docente decisa esce dal conto');
  r = R.setDecision(r, 'c2', 'reject'); assert.equal(aperte(r), 0);
  assert.deepEqual(B.righeMateriali(r, {}).righe.map(x => [x.id, x.note, x.stato]), [['mc1', 2, 'da-rivedere']], 'tutte decise: la riga resta, da rivedere');
});

/* ═══ Gate 3 di Giacomo (05/10), G5 ═══════════════════════════════════════════════════════════════════════ */
test('G5 successiva: finita la lista si riparte dall’inizio e si prende la prima ancora da rivedere; la riga attiva non è «la prossima»; null solo se non ne resta nessuna', () => {
  const righe = [{ id: 'a', fatto: false }, { id: 'b', fatto: true }, { id: 'c', fatto: true }, { id: 'd', fatto: false }];
  assert.equal(B.successiva(righe, 'd').id, 'a', 'dall’ultima si torna alla prima da rivedere');
  assert.equal(B.successiva(righe, 'c').id, 'd', 'prima si guarda avanti');
  assert.equal(B.successiva([{ id: 'a', fatto: false }], 'a'), null, 'l’unica da rivedere è quella attiva: nessuna «prossima»');
  assert.equal(B.successiva([{ id: 'a', fatto: true }, { id: 'b', fatto: true }], 'b'), null, 'nessuna da rivedere');
  assert.equal(B.successiva(righe, 'z').id, 'a', 'una riga attiva che non c’è: dall’inizio');
});

/* ═══ 0075, Q6 — LA REGOLA PRUDENTE PER PASSO (Giacomo, 06/10, chat «packet0075»: «per passo, prudente») ════════════
   In G1, con più note sul nodo, al salvataggio del testo F si chiude, come correzione del docente, ogni nota APERTA
   del controllo sullo stesso campo il cui passo contestato non compare più in F (spazi ridotti a uno, bordi tolti;
   nessun'altra normalizzazione). Il passo è `passoContestato` di mappai-affermazioni-core.js senza la decisione;
   una nota senza passo individuato (modo 'nodo') non si chiude così. Con una nota sola resta la regola di prima;
   se non se ne chiude nessuna nasce la correzione del docente, già decisa. La specifica eseguibile è la simulazione
   dello 0042 (scratchpad della chat, simula-0042/simula2.js --v2-prudente). */
const DESC_K = 'Il Consiglio federale decise di chiudere le frontiere nel 1942. La popolazione accolse molti profughi.';
function g1Passi() {
  const db = mappa();
  db.nodes.push({ id: 'K', label: 'Frontiere', desc: DESC_K, level: 1, group: 2 });
  const report = rapportoMappa();
  report.issues.push({ id: 'c1', target: { kind: 'node', id: 'K', field: 'desc' }, problem: 'La frase «decise di chiudere le frontiere nel 1942» non è nella fonte.' },
    { id: 'c2', target: { kind: 'node', id: 'K', field: 'desc' }, problem: 'Il nodo semplifica troppo' });
  return { db, review: R.createReview({ db, sources: SOURCES, report }) };
}
const KDESC = { kind: 'node', id: 'K', field: 'desc' };
const docenti = r => r.initial.issues.filter(i => i.origin === 'teacher');

test('Q6 per passo: con più note si chiude la nota il cui passo non compare più; le intatte e quella senza passo (modo nodo) restano aperte', () => {
  const { db, review } = g1();
  const F = 'Le banche furono accusate. Le banche custodivano i depositi.';   // cambiata la frase di a1, intatta quella di a3
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: F, problema: 'Correzione del docente' });
  assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'a1', choice: 'manual', opts: { text: F } }]);
  const r = applica(review, e);
  assert.equal(outcome(r, 'a1'), 'edited', 'a1: il suo passo non c’è più → chiusa come correzione del docente');
  assert.equal(outcome(r, 'a3'), 'pending', 'a3: il suo passo è intatto');
  assert.equal(outcome(r, 'a2'), 'pending', 'a2: il passo non si individua (modo nodo) → chiede il suo gesto');
  assert.equal(outcome(r, 'b1'), 'pending', 'una correzione chiude solo note del suo nodo');
  assert.equal(docenti(r).length, 0, 'chiusa una nota: nessuna correzione del docente in più');
  assert.equal(B.testoAdesso(notaA(r), r, { db }).adesso, F);
});

test('Q6 per passo: tutti i passi cambiati → si chiudono tutte le note localizzate; nessuno cambiato → la correzione del docente, come oggi', () => {
  const { db, review } = g1();
  const F = 'Le banche furono accusate. I depositi erano nelle banche.';
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: F });
  assert.deepEqual(e.chiamate.map(c => [c.issueId, c.choice, c.opts.text]), [['a1', 'manual', F], ['a3', 'manual', F]]);
  const r = applica(review, e);
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => outcome(r, id)), ['edited', 'pending', 'edited']);
  const intatto = DESC_A + ' Le accuse arrivarono dopo la guerra.';
  const e2 = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: intatto, problema: 'Correzione del docente' });
  assert.deepEqual(e2.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const r2 = applica(review, e2);
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => outcome(r2, id)), ['pending', 'pending', 'pending']);
  assert.equal(outcome(r2, docenti(r2)[0].id), 'edited', 'la correzione del docente non resta mai «da decidere»');
});

// 0075, giro 2 (D1): le maiuscole non contano più — il pezzo si cerca nella forma della quarantena (test «D1 …» in fondo)
test('Q6 per passo: spazi, a capo e tab ai bordi o doppi non cambiano il passo; la punteggiatura sì', () => {
  const { db, review } = g1();
  const spazi = '  Lo Stato  svizzero fu accusato\ndi aver accettato oro.\tLe banche custodivano i depositi. Aggiunta.';
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: spazi });
  assert.equal(e.chiamate[0].chiamata, 'addIssue', 'spazi, a capo e tab non cambiano il passo: nessuna nota chiusa');
  const punto = 'Lo Stato svizzero fu accusato di aver accettato oro; Le banche custodivano i depositi.';
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: punto }).chiamate.map(c => c.issueId), ['a1']);
});

test('Q6 per passo: il frammento citato fra virgolette è il passo (modo citato); cambiato si chiude, intatto no', () => {
  const { db, review } = g1Passi();
  const F = 'Il Consiglio federale decise di chiudere le frontiere nel 1938. La popolazione accolse molti profughi.';
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: KDESC, salvato: F });
  assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'c1', choice: 'manual', opts: { text: F } }]);
  const r = applica(review, e);
  assert.equal(outcome(r, 'c1'), 'edited'); assert.equal(outcome(r, 'c2'), 'pending', 'c2 è in modo nodo');
  const altra = DESC_K.replace('molti profughi', 'alcuni profughi');
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: KDESC, salvato: altra }).chiamate.map(c => c.chiamata), ['addIssue', 'setDecision'],
    'cambiata un’altra frase: il frammento è intatto, niente si chiude');
});

test('Q6 per passo: una «Proposta scelta» prende F e diventa «Testo modificato da te»; insieme si chiude la nota il cui passo è cambiato', () => {
  let { db, review } = g1();
  review = R.setDecision(review, 'a1', 'accept');
  const F = 'Le banche svizzere furono accusate di aver accettato oro. Le banche nascondevano i depositi.';
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: F });
  assert.deepEqual(e.chiamate.map(c => [c.issueId, c.choice, c.opts.text]), [['a1', 'manual', F], ['a3', 'manual', F]]);
  const r = applica(review, e);
  assert.deepEqual(['a1', 'a2', 'a3'].map(id => outcome(r, id)), ['edited', 'pending', 'edited']);
  assert.equal(B.testoAdesso(notaA(r), r, { db }).adesso, F);
});

test('Q6 per passo: con una nota sola resta la regola di prima (la chiude anche se la frase cambiata è un’altra); sui collegamenti niente passo', () => {
  const { db, review } = g1Passi();
  const solo = R.setDecision(review, 'c2', 'reject');   // c2 decisa: c1 non è l'unica nota del nodo → per passo
  const altra = DESC_K.replace('molti profughi', 'alcuni profughi');
  assert.equal(B.decisioniDaCampo({ review: solo, db, regime: 'g1', bersaglio: KDESC, salvato: altra }).chiamate[0].chiamata, 'addIssue');
  const { db: d1, review: r1 } = g1();
  assert.deepEqual(B.decisioniDaCampo({ review: r1, db: d1, regime: 'g1', note: notaB(r1), salvato: 'Altro.' }).chiamate.map(c => c.issueId), ['b1'],
    'b1 è l’unica nota del nodo: la correzione la chiude comunque (limite dichiarato, come oggi)');
  const { db: dl, review: rl, T } = collegamento([{ id: 'l2', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, problem: 'Verbo vago' }]);
  const e = B.decisioniDaCampo({ review: rl, db: dl, regime: 'g1', bersaglio: T, salvato: 'provoca' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision'], 'due note su un collegamento: nessuna si chiude');
});

test('Q6 per passo: senza il core delle affermazioni (script non caricato) nessuna nota si chiude per passo — si ricade sulla regola prudente', () => {
  const ctx = vm.createContext({});
  ['mappai-review-core.js', 'mappai-review-context.js', 'mappai-banco-core.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), ctx));
  const { db, review } = g1();
  const e = ctx.MappAIBancoCore.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: 'Le banche furono accusate. Le banche custodivano i depositi.' });
  assert.deepEqual(JSON.parse(JSON.stringify(e.chiamate)).map(c => c.chiamata), ['addIssue', 'setDecision']);
});

/* Q6, i test minimi portati dalle mutazioni (scritti dopo il codice, verdi sul codice e rossi sulla loro mutazione, come
   i «K» dello 0073): basta UN pezzo del passo che non c'è più; in modo 'citato' il passo è il frammento, non la frase;
   per passo contano solo le note dello STESSO campo. */
test('K-Q6 per passo: basta un pezzo del passo che non c’è più (due frammenti citati, uno cambiato)', () => {
  const db = { nodes: [{ id: 'K', label: 'Frontiere', desc: 'Il Consiglio federale decise di chiudere le frontiere nel 1942. La popolazione accolse molti profughi in fuga.' }], links: [] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'q2', target: { kind: 'node', id: 'K', field: 'desc' }, problem: 'Le frasi «decise di chiudere le frontiere nel 1942» e «accolse molti profughi in fuga» non sono nella fonte.' },
    { id: 'q3', target: { kind: 'node', id: 'K', field: 'desc' }, problem: 'Il nodo semplifica' }] } });
  const F = db.nodes[0].desc.replace('1942', '1938');
  assert.deepEqual(B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: KDESC, salvato: F }).chiamate.map(c => c.issueId), ['q2']);
});

test('K-Q6 per passo: in modo «citato» il passo è il frammento — cambiata la frase fuori dal frammento, la nota resta aperta', () => {
  const { db, review } = g1Passi();
  const F = DESC_K.replace('Il Consiglio federale', 'Il Governo');
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: KDESC, salvato: F });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision'], 'il frammento è intatto: nessuna nota si chiude');
});

test('K-Q6 per passo: la correzione della descrizione non chiude la nota del titolo, anche se il suo passo non è nella descrizione', () => {
  const db = { nodes: [{ id: 'N', label: 'Titolo', desc: 'Testo del nodo uno. Altra frase del nodo.' }], links: [] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 'd1', target: { kind: 'node', id: 'N', field: 'desc' }, after: 'Testo del nodo due. Altra frase del nodo.', problem: 'Numero sbagliato.' },
    { id: 't1', target: { kind: 'node', id: 'N', field: 'label' }, after: 'Titolo nuovo', problem: 'Titolo da cambiare.' }] } });
  const e = B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: { kind: 'node', id: 'N', field: 'desc' }, salvato: 'Testo del nodo tre. Altra frase del nodo.' });
  assert.deepEqual(e.chiamate.map(c => c.issueId), ['d1']);
  const r = applica(rv, e);
  assert.equal(outcome(r, 'd1'), 'edited'); assert.equal(outcome(r, 't1'), 'pending');
});

/* ═══ 0075, giro di correzione (07/10): D1 e il titolo ═══
   D1 (revisione avversaria, «la quarantena fallisce aperta»): in modo 'citato' il frammento del giudice si cercava
   lettera per lettera nel testo salvato, mentre la quarantena lo ritrova nella forma di `_forma` del core delle
   affermazioni (NFKC, caratteri di formato tolti, minuscole, apostrofi e virgolette unificati). «'Lo Stato…» del
   giudice e «lo Stato…» del testo risultavano «cambiati» e la nota si chiudeva con la frase intatta. Ora il pezzo si
   cerca come lo cerca la quarantena; contano solo i pezzi che si ritrovano nel testo di partenza (`before`); se nessuno
   si ritrova la nota non si chiude. Il titolo resta alla regola prudente di prima (ADR 0012 rev. 7: «titoli e
   collegamenti come prima»). */
const Aff = require('../public/js/mappai-affermazioni-core.js');
const NDESC = { kind: 'node', id: 'N', field: 'desc' };
function nodoN(desc, issues) {
  const db = { nodes: [{ id: 'N', label: 'Depositi', desc, level: 1, group: 1 }], links: [] };
  return { db, review: R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues } }) };
}
const notaN = (id, problem, extra) => Object.assign({ id, target: { kind: 'node', id: 'N', field: 'desc' }, problem }, extra);
const chiuse = e => e.chiamate.filter(c => c.chiamata === 'setDecision' && c.choice === 'manual').map(c => c.issueId);

test('D1 citato: il frammento del giudice con la maiuscola («\'Lo Stato…») si ritrova nel testo con la minuscola, come lo ritrova la quarantena — la nota resta aperta', () => {
  const desc = 'In particolare, lo Stato svizzero fu accusato di aver rifiutato di restituire i depositi. Le banche custodivano oro tedesco.';
  const { db, review } = nodoN(desc, [
    notaN('c1', "'Lo Stato svizzero fu accusato di aver rifiutato di restituire i depositi' non è sostenuto dalla fonte."),
    notaN('c2', 'La seconda frase: non è chiaro che le banche custodivano oro tedesco.')]);
  assert.equal(Aff.passoContestato(review.initial.issues[0]).modo, 'citato');
  const F = desc.replace('oro tedesco', 'oro della Germania');
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F });
  assert.deepEqual(chiuse(e), ['c2'], 'c1: il suo frammento è ancora nel testo, solo con la minuscola');
  const r = applica(review, e);
  assert.equal(outcome(r, 'c1'), 'pending'); assert.equal(outcome(r, 'c2'), 'edited');
  // controprova: tolto davvero il frammento, c1 si chiude
  const via = F.replace('lo Stato svizzero fu accusato', 'il Consiglio federale fu accusato');
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: via })), ['c1', 'c2']);
});

// Il caso vero della revisione: «Svizzera e 2a GM», nodo L1_3_L2_B, le sue tre note (issue-r1-fc6d3… è in modo citato).
const SVIZ_B = 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri. In particolare, lo Stato svizzero è stato accusato di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto bellico della Seconda Guerra Mondiale.';
function svizzeraB() {
  return nodoN(SVIZ_B, [
    notaN('issue-r1-b835b0a2ce0604a0-5010', 'La descrizione attribuisce l\'accusa di non restituire i depositi allo Stato svizzero, mentre la fonte parla genericamente di accuse relative alle banche svizzere.',
      { after: 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri. In particolare, le banche svizzere sono state accusate di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto bellico della Seconda Guerra Mondiale.' }),
    notaN('issue-r1-cc27b591923334fb-1822', 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri.'),
    notaN('issue-r1-fc6d3b1137dad8c7-1953', '\'Lo Stato svizzero è stato accusato di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto\' non è un fatto sostenuto dalla fonte. La fonte menziona solo che \'i responsabili sviz')]);
}
test('D1 il caso vero (Svizzera, L1_3_L2_B / issue-r1-fc6d3): una frase aggiunta in coda non chiude nessuna nota; tolto il passo citato, si chiudono le note di quella frase', () => {
  const { db, review } = svizzeraB();
  assert.equal(Aff.passoContestato(review.initial.issues[2]).modo, 'citato');
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: SVIZ_B + ' Frase aggiunta dal docente.', problema: 'Correzione del docente' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision'], 'nessun passo è cambiato: la correzione del docente, decisa');
  const r = applica(review, e);
  review.initial.issues.forEach(i => assert.equal(outcome(r, i.id), 'pending', i.id));
  // (non la proposta di b835: quella sarebbe un «Usa la proposta», regola 2)
  const via = SVIZ_B.replace('lo Stato svizzero è stato accusato', 'il Governo fu accusato');
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: via })),
    ['issue-r1-b835b0a2ce0604a0-5010', 'issue-r1-fc6d3b1137dad8c7-1953'], 'la seconda frase è cambiata: le due note che la contestano; la prima frase è intatta');
});

test('D1 la forma è quella della quarantena: per ogni variante del testo salvato la nota resta aperta se e solo se la quarantena vi ritrova ancora il frammento', () => {
  const FR = 'l\'Assemblea federale fissò la neutralità armata';
  const desc = 'Nel 1939 l\'Assemblea federale fissò la neutralità armata. Il confine fu chiuso ai profughi.';
  const problema = 'La frase «' + FR + '» non è nella fonte.';
  const { db, review } = nodoN(desc, [notaN('q1', problema), notaN('q2', 'Il nodo semplifica troppo')]);
  const coda = ' Il confine fu chiuso a molti profughi.';   // l'altra frase cambia sempre: c'è sempre una decisione
  const varianti = {
    maiuscole: ['Nel 1939 L\'Assemblea Federale FISSÒ la neutralità armata.', false],
    apostrofoTipografico: ['Nel 1939 l’Assemblea federale fissò la neutralità armata.', false],
    accentoScomposto: ['Nel 1939 l\'Assemblea federale fissò la neutralità armata.', false],
    trattinoMorbido: ['Nel 1939 l\'Assemblea fede­rale fissò la neutralità armata.', false],
    spazioDuroEDoppio: ['Nel 1939 l\'Assemblea federale fissò la neutralità   armata.', false],
    legatura: ['Nel 1939 l\'Assemblea federale ﬁssò la neutralità armata.', false],
    parolaCambiata: ['Nel 1939 l\'Assemblea federale fissò la neutralità disarmata.', true],
    virgolaInMezzo: ['Nel 1939 l\'Assemblea federale, fissò la neutralità armata.', true]
  };
  for (const [nome, [testo, atteso]] of Object.entries(varianti)) {
    const F = testo + coda;
    const quarantena = (Aff.passoContestato({ before: F, problem: problema }).frammenti || []).includes(FR);
    const chiude = chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F })).includes('q1');
    assert.equal(chiude, !quarantena, nome + ': la nota si chiude solo se la quarantena non ritrova più il frammento');
    assert.equal(chiude, atteso, nome);
  }
  // le virgolette dentro il frammento: «“…”» del giudice e «"…"» del testo sono lo stesso passo (aggiunto dopo le mutazioni)
  const FV = 'il cosiddetto “Ridotto” alpino fu costruito';
  const dv = 'Nel 1940 il cosiddetto “Ridotto” alpino fu costruito. Il confine fu chiuso ai profughi.';
  const pv = 'La frase «' + FV + '» non è nella fonte.';
  const { db: dbv, review: rvv } = nodoN(dv, [notaN('v1', pv), notaN('v2', 'Il nodo semplifica troppo')]);
  for (const [testo, atteso] of [['Nel 1940 il cosiddetto "Ridotto" alpino fu costruito.', false], ['Nel 1940 il cosiddetto Ridotto alpino fu costruito.', true]]) {
    const F = testo + coda;
    const quarantena = (Aff.passoContestato({ before: F, problem: pv }).frammenti || []).includes(FV);
    const chiude = chiuse(B.decisioniDaCampo({ review: rvv, db: dbv, regime: 'g1', bersaglio: NDESC, salvato: F })).includes('v1');
    assert.equal(chiude, !quarantena, testo); assert.equal(chiude, atteso, testo);
  }
});

test('D1 fallisce chiusa: un pezzo che nella forma del testo di partenza non si ritrova non conta, e senza pezzi la nota non si chiude', () => {
  /* NFKC compone «ᄀ» + «ᅡ» in «가» sul testo intero, non pezzo per pezzo: la quarantena ritrova (pezzo per pezzo) il
     frammento che finisce con «ᄀ», la forma del testo intero no. */
  const FR = 'la parola coreana scritta come ᄀ';
  const desc = 'Nel libro la parola coreana scritta come 가 compare una volta. Altra frase del nodo.';
  const { db, review } = nodoN(desc, [notaN('k1', 'La frase «' + FR + '» non è nella fonte.'), notaN('k2', 'Il nodo semplifica troppo')]);
  const p = Aff.passoContestato(review.initial.issues[0]);
  assert.equal(p.modo, 'citato'); assert.deepEqual(p.frammenti, [FR]);
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: 'Un testo del tutto diverso.' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision'], 'nessuna nota si chiude: nel dubbio resta aperta');
});

test('D1 la regola di prima che cambia: le maiuscole non contano più (come per la quarantena), la punteggiatura sì', () => {
  const { db, review } = g1();
  const maiuscola = 'lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: maiuscola }).chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const punto = 'Lo Stato svizzero fu accusato di aver accettato oro; Le banche custodivano i depositi.';
  assert.deepEqual(B.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: punto }).chiamate.map(c => c.issueId), ['a1']);
});

/* ═══ Verifica indipendente delle mutazioni 0075 (06/10), portata il 07/10 col prefisso K5: test che uccidono mutazioni
   sopravvissute del core. K5-K08 è adattato al titolo come lo dice la rev. 7 (sul titolo resta la regola prudente di
   prima): il verificatore lo aveva scritto con la regola per passo anche sul titolo. ═══ */
test('K5-K08 (adattato) il titolo resta alla regola prudente di prima: due note sul titolo, cambiato il passo di una → nessuna si chiude, nasce la correzione del docente', () => {
  const db = { nodes: [{ id: 'T', label: 'Accuse alle banche svizzere', desc: 'Le banche furono accusate.', level: 1, group: 1 }], links: [] };
  const rv = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [
    { id: 't1', target: { kind: 'node', id: 'T', field: 'label' }, after: 'Accuse ai banchieri svizzeri', problem: 'Titolo impreciso.' },
    { id: 't2', target: { kind: 'node', id: 'T', field: 'label' }, problem: 'Titolo vago' }] } });
  const F = 'Accuse ai banchieri';
  const e = B.decisioniDaCampo({ review: rv, db, regime: 'g1', bersaglio: { kind: 'node', id: 'T', field: 'label' }, salvato: F });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const r = applica(rv, e);
  assert.equal(outcome(r, 't1'), 'pending'); assert.equal(outcome(r, 't2'), 'pending');
  assert.equal(B.testoAdesso(null, r, { db, bersaglio: { kind: 'node', id: 'T', field: 'label' } }).adesso, F);
});

test('K5-K09 Q6 nel renderer: con gli script caricati come in index.html (MappAIAffermazioniCore e MappAIDeepenCore su window), la regola per passo chiude la nota col passo cambiato', () => {
  const ctx = vm.createContext({});
  ['mappai-review-core.js', 'mappai-review-context.js', 'mappai-deepen-core.js', 'mappai-affermazioni-core.js', 'mappai-banco-core.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), ctx));
  const { db, review } = g1();
  const F = 'Le banche furono accusate. Le banche custodivano i depositi.';
  const e = ctx.MappAIBancoCore.decisioniDaCampo({ review, db, regime: 'g1', note: notaA(review), salvato: F });
  assert.deepEqual(JSON.parse(JSON.stringify(e.chiamate)), [{ chiamata: 'setDecision', issueId: 'a1', choice: 'manual', opts: { text: F } }]);
});

test('K5-K07 Q6: sui collegamenti niente passo — anche una nota sulle parole con una proposta resta aperta quando le parole cambiano; nasce la correzione del docente', () => {
  const { db, review, T } = collegamento([{ id: 'l2', target: { kind: 'link', source: 'A', target: 'B', rel: 'causa', field: 'rel' }, after: 'provoca', problem: 'Verbo impreciso.' }]);
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: T, salvato: 'genera' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  const r = applica(review, e);
  assert.equal(outcome(r, 'l1'), 'pending'); assert.equal(outcome(r, 'l2'), 'pending');
});

/* ═══ Verifica indipendente delle mutazioni del giro di correzione 0075 (07/10), portata nel terzo giro col prefisso K6:
   test che uccidono mutazioni sopravvissute del core (V05, V06, V07 del verificatore). ═══ */
test('K6-D1 la forma della quarantena vale su TUTTO il frammento: due apostrofi tipografici e le virgolette basse «» dentro il frammento non cambiano il passo', () => {
  const coda = ' Il confine fu chiuso a molti profughi.';   // l'altra frase cambia sempre: c'è sempre una decisione
  const casi = [
    { FR: 'l\'Assemblea federale fissò l\'obbligo della neutralità armata', apre: '«', chiude: '»',
      desc: 'Nel 1939 l\'Assemblea federale fissò l\'obbligo della neutralità armata. Il confine fu chiuso ai profughi.',
      F: 'Nel 1939 l’Assemblea federale fissò l’obbligo della neutralità armata.' },
    { FR: 'il cosiddetto «Ridotto» alpino fu costruito', apre: '"', chiude: '"',
      desc: 'Nel 1940 il cosiddetto «Ridotto» alpino fu costruito. Il confine fu chiuso ai profughi.',
      F: 'Nel 1940 il cosiddetto "Ridotto" alpino fu costruito.' }];
  for (const c of casi) {
    const problema = 'La frase ' + c.apre + c.FR + c.chiude + ' non è nella fonte.';
    const { db, review } = nodoN(c.desc, [notaN('q1', problema), notaN('q2', 'Il nodo semplifica troppo')]);
    assert.deepEqual(Aff.passoContestato(review.initial.issues[0]).frammenti, [c.FR]);
    const F = c.F + coda;
    assert.ok((Aff.passoContestato({ before: F, problem: problema }).frammenti || []).includes(c.FR), 'la quarantena ritrova il frammento: ' + c.F);
    assert.ok(!chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F })).includes('q1'), 'q1 resta aperta: ' + c.F);
  }
});

test('K6-Q6 in modo «proposta» il passo è la frase che la proposta corregge, anche se il motivo cita un frammento: cambiata quella frase fuori dal frammento, la nota si chiude', () => {
  const desc = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  const { db, review } = nodoN(desc, [
    notaN('p1', 'Non è vero che «lo Stato svizzero fu accusato»: furono le banche.',
      { after: 'Le banche svizzere furono accusate di aver accettato oro. Le banche custodivano i depositi.' }),
    notaN('p2', 'Il nodo semplifica troppo')]);
  const p = Aff.passoContestato(review.initial.issues[0]);
  assert.equal(p.modo, 'proposta'); assert.deepEqual(p.frammenti, ['lo Stato svizzero fu accusato']);
  const F = 'Lo Stato svizzero fu accusato di aver comprato oro. Le banche custodivano i depositi.';
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F })), ['p1'],
    'la frase della proposta è cambiata: p1 si chiude anche se il frammento citato è ancora nel testo; p2 (modo nodo) no');
});

/* ═══ 0075, terzo giro (07/10), sulla seconda revisione avversaria ═══
   G3-1 (Q9, Giacomo: «sì, correggi»): il passo contestato si cerca nel testo MOSTRATO un attimo prima del salvataggio
   (`testoAdesso`), non in quello di partenza. Se un'altra nota aveva già cambiato quella frase con «Usa la proposta», un
   ritocco qualunque altrove chiudeva la nota con la sua obiezione mai guardata.
   G3-2: la forma con cui il Banco cerca il passo è scritta come `_forma` della quarantena, carattere per carattere. */
test('G3-1 (Q9) il passo si cerca nel testo mostrato, non in quello di partenza: Svizzera L1_3_L2_B, «Usa la proposta» su b835b e poi «accuse molto gravi» nella prima frase — fc6d3 resta aperta; cambiare a mano il soggetto la chiude ancora', () => {
  const { db, review } = svizzeraB();
  const b = 'issue-r1-b835b0a2ce0604a0-5010', c = 'issue-r1-cc27b591923334fb-1822', f = 'issue-r1-fc6d3b1137dad8c7-1953';
  const r = R.setDecision(review, b, 'accept');
  const mostrato = B.testoAdesso(null, r, { db, bersaglio: NDESC }).adesso;
  assert.equal(mostrato, review.initial.issues[0].after, 'la scheda mostra la proposta di b835b');
  const F = mostrato.replace('accuse gravi', 'accuse molto gravi');
  const e = B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: F });
  assert.deepEqual(chiuse(e), [b, c], 'b835b («Proposta scelta») prende il testo; cc27b: la prima frase è cambiata; fc6d3 no: la sua frase non era più nel testo mostrato');
  const r1 = applica(r, e);
  assert.equal(outcome(r1, f), 'pending'); assert.equal(outcome(r1, c), 'edited'); assert.equal(outcome(r1, b), 'edited');
  // dal testo di partenza, il soggetto cambiato a mano: la frase di fc6d3 c'era nel testo mostrato e non c'è più
  const via = SVIZ_B.replace('lo Stato svizzero è stato accusato', 'il Governo svizzero è stato accusato');
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: via })), [b, f]);
});

test('G3-1 (Q9) un frammento citato che c’era all’inizio e non c’è più nel testo mostrato (tolto da un’altra proposta scelta) non chiude la nota; ricomparso nel testo mostrato, si cerca di nuovo', () => {
  const desc = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  const { db, review } = nodoN(desc, [
    notaN('x1', 'Il verbo non è quello della fonte.', { after: 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche nascondevano i depositi.' }),
    notaN('x2', 'La frase «Le banche custodivano i depositi» non è nella fonte.'),
    notaN('x3', 'Il nodo semplifica troppo')]);
  assert.equal(Aff.passoContestato(review.initial.issues[1]).modo, 'citato');
  const r = R.setDecision(review, 'x1', 'accept');
  const F = 'Lo Stato svizzero fu accusato di aver comprato oro. Le banche nascondevano i depositi.';
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: F })), ['x1'],
    'x2: il suo frammento non era più nel testo mostrato — nel dubbio resta aperta; x1 («Proposta scelta») prende il testo');
  // senza la proposta, lo stesso ritocco lascia la seconda frase intatta: x2 non si chiude; cambiata quella, sì
  assert.deepEqual(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: desc.replace('accettato', 'comprato') })).includes('x2'), false);
  assert.ok(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: desc.replace('custodivano', 'tenevano') })).includes('x2'));
});

test('G3-2 la forma del Banco è scritta come `_forma` della quarantena (stesse classi di caratteri, stesse sostituzioni, nello stesso ordine), e per ogni apostrofo e virgoletta la nota resta aperta se e solo se la quarantena ritrova il frammento', () => {
  const testo = f => fs.readFileSync(require.resolve('../public/js/' + f), 'utf8');
  const quarantena = /function _forma\(t\) \{\s*return normalizza\(t\)([^;]*);\s*\}/.exec(testo('mappai-affermazioni-core.js'));
  const banco = /function formaQuarantena\(A, x\) \{\s*return A\.normalizza\(x\)([^;]*);\s*\}/.exec(testo('mappai-banco-core.js'));
  assert.ok(quarantena && banco, 'le due funzioni si ritrovano nella forma attesa: se una cambia forma, questo test va riscritto con lei');
  assert.equal(banco[1], quarantena[1], 'la catena dopo normalizza (minuscole, apostrofi, virgolette) è la stessa, lettera per lettera');
  const coda = ' Il confine fu chiuso a molti profughi.';
  // gli apostrofi, uno per uno, nel testo salvato (il frammento ha l'apostrofo dritto)
  const FR = 'l\'Assemblea federale fissò la neutralità armata';
  const pr = 'La frase «' + FR + '» non è nella fonte.';
  const n1 = nodoN('Nel 1939 l\'Assemblea federale fissò la neutralità armata. Il confine fu chiuso ai profughi.', [notaN('q1', pr), notaN('q2', 'Il nodo semplifica troppo')]);
  for (const ap of ['\'', '’', '‘', '´', '`', 'ʼ']) {
    const F = 'Nel 1939 l' + ap + 'Assemblea federale fissò la neutralità armata.' + coda;
    const ritrova = (Aff.passoContestato({ before: F, problem: pr }).frammenti || []).includes(FR);
    const chiude = chiuse(B.decisioniDaCampo({ review: n1.review, db: n1.db, regime: 'g1', bersaglio: NDESC, salvato: F })).includes('q1');
    // NFKC (in `normalizza`, prima delle sostituzioni) scompone «´» in uno spazio e un accento: la quarantena non lo ritrova
    assert.equal(ritrova, ap !== '´', 'la quarantena unifica ' + JSON.stringify(ap));
    assert.equal(chiude, !ritrova, 'apostrofo ' + JSON.stringify(ap));
  }
  // le virgolette, una per una, dentro il frammento (il frammento ha “ ”)
  const FV = 'il cosiddetto “Ridotto” alpino fu costruito';
  const pv = 'La frase «' + FV + '» non è nella fonte.';
  const n2 = nodoN('Nel 1940 il cosiddetto “Ridotto” alpino fu costruito. Il confine fu chiuso ai profughi.', [notaN('v1', pv), notaN('v2', 'Il nodo semplifica troppo')]);
  for (const vg of ['"', '«', '»', '“', '”', '„']) {
    const F = 'Nel 1940 il cosiddetto ' + vg + 'Ridotto' + vg + ' alpino fu costruito.' + coda;
    const ritrova = (Aff.passoContestato({ before: F, problem: pv }).frammenti || []).includes(FV);
    const chiude = chiuse(B.decisioniDaCampo({ review: n2.review, db: n2.db, regime: 'g1', bersaglio: NDESC, salvato: F })).includes('v1');
    assert.equal(ritrova, true, 'la quarantena unifica ' + JSON.stringify(vg));
    assert.equal(chiude, !ritrova, 'virgoletta ' + JSON.stringify(vg));
  }
});

/* ═══ 0075, quarto giro (07/10), sulla terza revisione avversaria ═══
   K7-D1 (Q9 com'è decisa: si confronta col testo che il docente aveva davanti). Finché il campo è il testo di partenza,
   la veste vi scrive la proposta della prima nota aperta (ADR 0012 rev. 4, A.1 e A.5), ma l'«adesso» resta il testo di
   partenza: il core cercava i passi lì, e un ritocco nella prima frase chiudeva fc6d3, la cui frase la proposta a
   schermo aveva già cambiato. Ora la veste dice al core quale proposta è nel campo (`propostaMostrata`): il salvataggio
   vale «Usa la proposta» di quella nota più il ritocco («Testo modificato da te», B.4), e i passi delle altre note si
   cercano nel testo della proposta. Stesso esito con e senza il bottone. Solo G1. */
const SVIZ_ID = { b: 'issue-r1-b835b0a2ce0604a0-5010', c: 'issue-r1-cc27b591923334fb-1822', f: 'issue-r1-fc6d3b1137dad8c7-1953' };
test('K7-D1 Q9 anche quando la proposta aperta è scritta nel campo (A.5): un ritocco nella prima frase non chiude fc6d3', () => {
  const { db, review } = svizzeraB();
  const { b, c, f } = SVIZ_ID;
  const proposta = review.initial.issues[0].after;
  const F = proposta.replace('accuse gravi', 'accuse molto gravi');
  const rBottone = R.setDecision(review, b, 'accept');
  const eBottone = B.decisioniDaCampo({ review: rBottone, db, regime: 'g1', bersaglio: NDESC, salvato: F });
  const eCampo = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F, adesso: SVIZ_B, propostaMostrata: b });
  const conBottone = chiuse(eBottone), senza = chiuse(eCampo);
  assert.equal(conBottone.includes(f), false);
  assert.equal(senza.includes(f), false, 'campo con la proposta di b835b, ritocco nella prima frase: ' + JSON.stringify(senza));
  assert.deepEqual(senza, conBottone, 'stesso esito con e senza il bottone');
  assert.deepEqual(eCampo.chiamate, eBottone.chiamate, 'le stesse chiamate: la «Proposta scelta» prende il testo, l’accept di passaggio non serve');
  const r1 = applica(rBottone, eBottone), r2 = applica(review, eCampo);
  review.initial.issues.forEach(i => assert.equal(outcome(r2, i.id), outcome(r1, i.id), i.id));
  assert.deepEqual([b, c, f].map(id => outcome(r2, id)), ['edited', 'edited', 'pending']);
  // senza `propostaMostrata` il core non sa che cosa c'era nel campo e cerca nel testo che dà `testoAdesso` (la veste lo passa)
  assert.ok(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F, adesso: SVIZ_B })).includes(f));
});

test('K7-D1 la proposta nel campo, senza ritocco o rimessa al testo di partenza: lo stesso esito del bottone («Proposta scelta»; il testo di partenza = testo tenuto)', () => {
  const { db, review } = svizzeraB();
  const { b, c, f } = SVIZ_ID;
  const proposta = review.initial.issues[0].after;
  for (const salvato of [proposta, proposta + '  ', SVIZ_B]) {
    const rB = R.setDecision(review, b, 'accept');
    const eB = B.decisioniDaCampo({ review: rB, db, regime: 'g1', bersaglio: NDESC, salvato });
    const eC = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato, adesso: SVIZ_B, propostaMostrata: b });
    assert.ok(!eC.errore, JSON.stringify(eC));
    const r1 = applica(rB, eB), r2 = applica(review, eC);
    review.initial.issues.forEach(i => assert.equal(outcome(r2, i.id), outcome(r1, i.id), JSON.stringify(salvato.slice(-12)) + ' ' + i.id));
    assert.equal(outcome(r2, c), 'pending'); assert.equal(outcome(r2, f), 'pending');
  }
  // la proposta salvata com'è: «Usa la proposta» (applied); rimesso il testo di partenza: la nota è tenuta (kept), non sparisce la battitura
  const eP = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: proposta, adesso: SVIZ_B, propostaMostrata: b });
  assert.deepEqual(eP.chiamate.map(x => [x.issueId, x.choice]), [[b, 'accept']]);
  const eK = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: SVIZ_B, adesso: SVIZ_B, propostaMostrata: b });
  assert.equal(outcome(applica(review, eK), b), 'kept');
});

test('K7-D1 `propostaMostrata` conta solo se è davvero la proposta che la veste scrive nel campo: G1, nota del controllo aperta, con proposta, sullo stesso campo, campo al testo di partenza; altrimenti non cambia niente', () => {
  const S1 = 'Lo Stato svizzero fu accusato di aver accettato oro.', S2 = 'Le banche custodivano i depositi.', S3 = 'La neutralità fu armata.';
  const DESC = [S1, S2, S3].join(' ');
  const { db, review } = nodoN(DESC, [
    notaN('x0', 'Non fu lo Stato.', { after: DESC.replace('Lo Stato svizzero fu accusato', 'Le banche furono accusate') }),
    notaN('x1', 'Il verbo non è quello della fonte.', { after: DESC.replace('custodivano', 'nascondevano') }),
    notaN('x2', 'La frase «La neutralità fu armata» non è nella fonte.'),
    notaN('x3', 'La frase «Lo Stato svizzero fu accusato di aver accettato oro» non è nella fonte.'),
    { id: 'y1', target: { kind: 'node', id: 'N', field: 'label' }, problem: 'Titolo vago.', after: 'Depositi bancari' }]);
  const F = DESC.replace('accettato', 'comprato');
  const uguale = (rv, extra, nome) => {
    const base = B.decisioniDaCampo(Object.assign({ review: rv, db, regime: 'g1', bersaglio: NDESC, salvato: F }, extra.senza || {}));
    const con = B.decisioniDaCampo(Object.assign({ review: rv, db, regime: 'g1', bersaglio: NDESC, salvato: F }, extra.senza || {}, extra.con));
    assert.deepEqual(con, base, nome);
  };
  uguale(review, { senza: { regime: 'g2' }, con: { propostaMostrata: 'x0' } }, 'in G2 non conta (A.6 resta com’è)');
  uguale(review, { con: { propostaMostrata: 'x2' } }, 'nota senza proposta');
  uguale(review, { con: { propostaMostrata: 'y1' } }, 'proposta di un altro campo (il titolo)');
  uguale(review, { con: { propostaMostrata: 'non-c-e' } }, 'nota che non c’è');
  uguale(review, { con: { propostaMostrata: null } }, 'null');
  uguale(R.setDecision(review, 'x0', 'reject'), { con: { propostaMostrata: 'x0' } }, 'nota già decisa');
  const docente = R.addIssue(review, { target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Mia', after: DESC.replace('armata', 'difesa'), hasProposal: true });
  const tid = docente.initial.issues[docente.initial.issues.length - 1].id;
  // la proposta del docente cambia la frase di x2: presa per «nel campo», x2 non si chiuderebbe più
  const FT = DESC.replace('armata', 'difesa').replace('accettato', 'comprato');
  assert.deepEqual(B.decisioniDaCampo({ review: docente, db, regime: 'g1', bersaglio: NDESC, salvato: FT, propostaMostrata: tid }),
    B.decisioniDaCampo({ review: docente, db, regime: 'g1', bersaglio: NDESC, salvato: FT }), 'segnalazione del docente');
  assert.ok(chiuse(B.decisioniDaCampo({ review: docente, db, regime: 'g1', bersaglio: NDESC, salvato: FT, propostaMostrata: tid })).includes('x2'));
  // campo non più al testo di partenza (x1 scelta): la veste non scrive x0 nel campo, e il core non la prende
  const conX1 = R.setDecision(review, 'x1', 'accept');
  const F1 = DESC.replace('custodivano', 'nascondevano').replace('accettato', 'comprato');
  assert.deepEqual(B.decisioniDaCampo({ review: conX1, db, regime: 'g1', bersaglio: NDESC, salvato: F1, propostaMostrata: 'x0' }),
    B.decisioniDaCampo({ review: conX1, db, regime: 'g1', bersaglio: NDESC, salvato: F1 }), 'campo già cambiato da una scelta');
  // controprova: valida, cambia l'esito. La proposta di x0 nel campo, ritoccata nella terza frase: x0 presa e ritoccata,
  // x2 chiusa (la sua frase c'era nella proposta), x3 aperta (la sua frase l'aveva già cambiata la proposta a schermo)
  const FX = review.initial.issues[0].after.replace('armata', 'difesa');
  const e = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: FX, adesso: DESC, propostaMostrata: 'x0' });
  assert.deepEqual(['x0', 'x1', 'x2', 'x3'].map(id => outcome(applica(review, e), id)), ['edited', 'pending', 'edited', 'pending']);
  assert.ok(chiuse(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: FX, adesso: DESC })).includes('x3'), 'senza: x3 si chiudeva');
  // il controllo dell'«adesso» viene prima: una scheda non aggiornata non decide, con o senza proposta nel campo
  assert.equal(B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F, adesso: 'vecchio', propostaMostrata: 'x0' }).errore, 'adesso_superato');
});

test('K7-D1 anche sul titolo la proposta nel campo vale «Usa la proposta» più il ritocco, come col bottone (la regola per passo resta solo sulla descrizione)', () => {
  const NLABEL = { kind: 'node', id: 'N', field: 'label' };
  const { db, review } = nodoN('Il confine fu chiuso nel 1942.', [
    { id: 't1', target: NLABEL, after: 'Depositi delle banche', problem: 'Titolo vago.' },
    { id: 't2', target: NLABEL, problem: 'Il titolo non dice il periodo.' },
    notaN('d1', 'Il nodo semplifica troppo')]);
  const F = 'Depositi delle banche svizzere';
  const rB = R.setDecision(review, 't1', 'accept');
  const eB = B.decisioniDaCampo({ review: rB, db, regime: 'g1', bersaglio: NLABEL, salvato: F });
  const eC = B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NLABEL, salvato: F, adesso: 'Depositi', propostaMostrata: 't1' });
  assert.deepEqual(eC.chiamate, eB.chiamate);
  const r = applica(review, eC);
  assert.deepEqual(['t1', 't2', 'd1'].map(id => outcome(r, id)), ['edited', 'pending', 'pending'], 't2 non si chiude: sul titolo non c’è passo');
  assert.equal(r.initial.issues.filter(i => i.origin === 'teacher').length, 0);
  // senza: più note sul nodo, nessuna si chiude e nasce la correzione del docente (com'era)
  const s = applica(review, B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: NLABEL, salvato: F, adesso: 'Depositi' }));
  assert.equal(outcome(s, 't1'), 'pending');
});

/* K7-V5 (revisore, terzo giro): con un conflitto già presente la scheda mostra il testo di partenza (`testoAdesso`), e il
   passo si cerca lì: cambiata la sua frase, la nota si chiude, e le due proposte in conflitto prendono il testo. */
test('K7-V5 Q9 col conflitto già presente: il passo si cerca nel testo di partenza che la scheda mostra; cambiata la sua frase, la nota si chiude', () => {
  const DESC = 'Il Consiglio federale chiuse il confine nel 1942. Le banche custodivano i depositi degli ebrei. La neutralità fu armata.';
  const { db, review } = nodoN(DESC, [
    notaN('p1', 'Anno sbagliato.', { after: DESC.replace('1942', '1938') }),
    notaN('p2', 'Anno sbagliato davvero.', { after: DESC.replace('1942', '1940') }),
    notaN('q2', 'La frase «Le banche custodivano i depositi degli ebrei» non è nella fonte.'),
    notaN('qn', 'Il nodo semplifica troppo')]);
  const r = R.setDecision(R.setDecision(review, 'p1', 'accept'), 'p2', 'accept');
  const s = B.testoAdesso(null, r, { db, bersaglio: NDESC });
  assert.equal(s.ok, false); assert.equal(s.adesso, DESC);
  const e = B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: DESC.replace('custodivano', 'tenevano'), adesso: s.adesso });
  const chiuse = e.chiamate.filter(c => c.chiamata === 'setDecision' && c.choice === 'manual').map(c => c.issueId).sort();
  assert.deepEqual(chiuse, ['p1', 'p2', 'q2']);
});

/* ═══ 0075, quinto giro (07/10), sulla quarta revisione avversaria ═══
   K8-VG4-D1 (test minimo del revisore). Con un conflitto GIÀ PRESENTE sulla descrizione `testoAdesso` dà il testo di
   partenza, la veste vi scrive la proposta aperta (A.5) e passa `propostaMostrata`; ma il ritocco si confrontava con
   `leggi(presa0).adesso`, che col conflitto è ancora il testo di partenza, non la proposta a schermo: (i) rimesso il
   testo di partenza, la nota diventava «Proposta scelta» senza verifica; (ii) Q9 non valeva. Ora il testo mostrato è la
   proposta, sia per la regola 1 sia per i passi. */
test('K8-VG4-D1 conflitto già presente: rimesso il testo di partenza nel campo che mostrava la proposta di p4, p4 non diventa «Proposta scelta»; Q9: un ritocco altrove non chiude q5, la cui frase la proposta a schermo aveva già cambiato', () => {
  const DESC = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  const P4 = DESC.replace('Lo Stato svizzero fu accusato', 'La Confederazione fu accusata');
  const { db, review } = nodoN(DESC, [
    notaN('p3', 'Verbo.', { after: DESC.replace('custodivano', 'nascondevano') }),
    notaN('p6', 'Altro verbo.', { after: DESC.replace('custodivano', 'tenevano') }),
    notaN('p4', 'Fu la Confederazione.', { after: P4 }),
    notaN('q5', 'La frase «Lo Stato svizzero fu accusato di aver accettato oro» non è nella fonte.')]);
  const r = R.setDecision(R.setDecision(review, 'p3', 'accept'), 'p6', 'accept');
  const s = B.testoAdesso(null, r, { db, bersaglio: NDESC });
  assert.equal(s.ok, false); assert.equal(s.adesso, DESC, 'col conflitto la scheda è al testo di partenza: la veste vi scrive P4');
  const e = B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: DESC, adesso: DESC, propostaMostrata: 'p4' });
  assert.notEqual(e.errore ? 'pending' : outcome(applica(r, e), 'p4'), 'applied', 'il docente ha rimesso il testo di partenza: ' + JSON.stringify(e));
  const e2 = B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: P4.replace('custodivano', 'serbavano'), adesso: DESC, propostaMostrata: 'p4' });
  assert.ok(!e2.errore, JSON.stringify(e2));
  assert.equal(outcome(applica(r, e2), 'q5'), 'pending', 'Q9: la frase di q5 non era nel testo a schermo');
});

/* K8-N1 (irrobustimento): `propostaMostrata` vale solo per la nota che la veste scrive davvero nel campo — la PRIMA nota
   aperta del controllo con una proposta su quel campo, nell'ordine della revisione (`carica`). Un id di un'altra nota
   aperta con proposta non cambia niente; deciso «Tieni» il primo, il secondo diventa quello nel campo e conta. */
test('K8-N1 `propostaMostrata` conta solo per la PRIMA nota aperta del controllo con proposta sul campo (quella che `carica` scrive), non per un’altra nota aperta del controllo', () => {
  const DESC = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  const { db, review } = nodoN(DESC, [
    notaN('n0', 'Non fu lo Stato.', { after: DESC.replace('Lo Stato svizzero fu accusato', 'Le banche furono accusate') }),
    notaN('n1', 'Il verbo non è quello della fonte.', { after: DESC.replace('custodivano', 'nascondevano') }),
    notaN('n2', 'La frase «Le banche custodivano i depositi» non è nella fonte.')]);
  const F = DESC.replace('custodivano', 'nascondevano').replace('accettato', 'comprato');
  const dati = (rv, extra) => Object.assign({ review: rv, db, regime: 'g1', bersaglio: NDESC, salvato: F, adesso: DESC }, extra);
  assert.deepEqual(B.decisioniDaCampo(dati(review, { propostaMostrata: 'n1' })), B.decisioniDaCampo(dati(review, {})),
    'nel campo la veste scrive n0, non n1: l’id di n1 si ignora');
  // controprova: «Tieni il testo» su n0, il campo resta al testo di partenza e la veste vi scrive n1 — ora conta
  const tieni = R.setDecision(review, 'n0', 'reject');
  const con = B.decisioniDaCampo(dati(tieni, { propostaMostrata: 'n1' })), senza = B.decisioniDaCampo(dati(tieni, {}));
  assert.notDeepEqual(con, senza);
  assert.deepEqual(['n0', 'n1', 'n2'].map(id => outcome(applica(tieni, con), id)), ['kept', 'edited', 'pending'],
    'n1 presa e ritoccata; n2 aperta: la sua frase la proposta a schermo l’aveva già cambiata');
});
// K8-N1 bis (guardia delle mutazioni, verde anche prima): la «prima» si conta come la conta `carica` — una segnalazione
// del docente con una proposta, o una nota del controllo su un altro campo, anche se vengono prima, non sono la nota nel campo
test('K8-N1 bis la prima nota nel campo si conta come `carica`: una segnalazione del docente con proposta o una nota del titolo che vengono prima non la spostano', () => {
  const DESC = 'Lo Stato svizzero fu accusato di aver accettato oro. Le banche custodivano i depositi.';
  const { db, review } = nodoN(DESC, [
    { id: 'tp', target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', problem: 'Mia.', after: DESC.replace('oro', 'denaro'), hasProposal: true },
    { id: 'l0', target: { kind: 'node', id: 'N', field: 'label' }, problem: 'Titolo vago.', after: 'Depositi bancari' },
    notaN('n0', 'Il verbo non è quello della fonte.', { after: DESC.replace('custodivano', 'nascondevano') }),
    notaN('n1', 'La frase «Le banche custodivano i depositi» non è nella fonte.')]);
  const F = DESC.replace('custodivano', 'nascondevano').replace('accettato', 'comprato');
  const dati = extra => Object.assign({ review, db, regime: 'g1', bersaglio: NDESC, salvato: F, adesso: DESC }, extra);
  const con = B.decisioniDaCampo(dati({ propostaMostrata: 'n0' })), senza = B.decisioniDaCampo(dati({}));
  assert.notDeepEqual(con, senza, 'n0 è la nota che la veste scrive nel campo: conta');
  assert.deepEqual(['n0', 'n1'].map(id => outcome(applica(review, con), id)), ['edited', 'pending']);
});

/* ═══ 0075, ottavo giro (07/10), D-b: in G1 il testo di partenza rimesso a meno di spazi vale «rimesso esatto» ═══
   (regola 1-ter: si salva il testo di partenza, com'è; `piano` è la forma della regola 1) */
test('G8-D-b regola 1-ter (G1): una nota del controllo sola, corretta e poi rimessa al testo di partenza a meno di spazi → la decisione porta il testo di partenza esatto e la nota è «tenuta» (kept), come rimessa esatta', () => {
  const { db, review } = g1();
  const BDESC = { kind: 'node', id: 'B', field: 'desc' }, orig = 'Le banche custodivano oro tedesco.';
  const r0 = applica(review, B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: BDESC, salvato: 'Le banche custodivano oro tedesco e svizzero.' }));
  assert.equal(outcome(r0, 'b1'), 'edited');
  for (const salvato of [orig, orig + ' ', 'Le banche  custodivano oro tedesco.', orig + '\n', '\t' + orig]) {
    const e = B.decisioniDaCampo({ review: r0, db, regime: 'g1', bersaglio: BDESC, salvato });
    assert.deepEqual(e.chiamate, [{ chiamata: 'setDecision', issueId: 'b1', choice: 'manual', opts: { text: orig } }], JSON.stringify(salvato));
    const r = applica(r0, e);
    assert.equal(outcome(r, 'b1'), 'kept', JSON.stringify(salvato));
    assert.equal(B.testoAdesso(null, r, { db, bersaglio: BDESC }).adesso, orig);
  }
  // un a capo interno in più è una modifica vera (`piano` conta gli a capo interni): si salva com'è scritto
  const conAcapo = 'Le banche custodivano\noro tedesco.';
  assert.equal(B.decisioniDaCampo({ review: r0, db, regime: 'g1', bersaglio: BDESC, salvato: conAcapo }).chiamate[0].opts.text, conAcapo);
});
test('G8-D-b regola 1-ter anche con la proposta nel campo (A.5): il testo di partenza rimesso con uno spazio in fondo dà le stesse chiamate di quello esatto (a1 «tenuta»)', () => {
  const { db, review } = g1();
  const dati = salvato => ({ review, db, regime: 'g1', bersaglio: DESC, salvato, adesso: DESC_A, propostaMostrata: 'a1' });
  const esatto = B.decisioniDaCampo(dati(DESC_A)), spazio = B.decisioniDaCampo(dati(DESC_A + ' '));
  assert.deepEqual(spazio, esatto);
  assert.equal(outcome(applica(review, spazio), 'a1'), 'kept');
});
test('G8-D-b la regola 1-ter non porta mai a un testo vuoto: parole «Nessuna» di partenza, cambiate e poi rimesse come soli spazi → niente «Nessuna» registrata (resta un gesto a parte)', () => {
  const db = { nodes: [nodo('A', 'a.', 'Alfa'), nodo('B', 'b.', 'Beta')], links: [{ source: 'A', target: 'B', rel: '', relNone: true }] };
  const T = { kind: 'link', source: 'A', target: 'B', field: 'rel' };
  const review = R.createReview({ db, sources: SOURCES, report: { stato: 'parziale', issues: [{ id: 'l1', target: T, problem: 'Nesso dubbio' }] } });
  assert.equal(B.testoAdesso(null, review, { db, bersaglio: T }).partenza, '');
  const r0 = applica(review, B.decisioniDaCampo({ review, db, regime: 'g1', bersaglio: T, salvato: 'causa' }));
  const e = B.decisioniDaCampo({ review: r0, db, regime: 'g1', bersaglio: T, salvato: '   ' });
  assert.ok(!(e.chiamate || []).some(c => c.opts && c.opts.relNone === true), JSON.stringify(e));
});
test('G8-D-b la regola 1-ter è di G1: in G2 il testo salvato resta com’è scritto (G2 fuori dal perimetro dello 0075)', () => {
  const { db, review } = g2();
  const T = { kind: 'item', id: 'op1', field: 'guide' }, orig = 'Le banche accettarono oro.';
  const r0 = applica(review, B.decisioniDaCampo({ review, db, regime: 'g2', bersaglio: T, salvato: 'Le banche accettarono oro tedesco.' }));
  assert.equal(B.decisioniDaCampo({ review: r0, db, regime: 'g2', bersaglio: T, salvato: orig + ' ' }).chiamate[0].opts.text, orig + ' ');
});

/* ═══ 0075, nono giro (07/10), la nota minore del verificatore (scenario S1): una proposta che cambia SOLO spazi. Il
   docente scrive esattamente quella proposta; la regola 1-ter la riportava al testo di partenza (stessa forma a meno di
   spazi) e la nota restava aperta. Un testo salvato IDENTICO (esatto) alla proposta di una nota aperta sul campo è quella
   proposta: la 1-ter non si applica, vale la regola 2. ═══ */
test('K11-S1 regola 1-ter: il testo salvato identico alla proposta APERTA di una nota che cambia solo spazi è quella proposta (regola 2), non il testo di partenza', () => {
  const P = 'Le banche  custodivano oro. Il commercio continuò.';
  const p1 = P.replace('  ', ' '), p2 = P.replace('continuò', 'proseguì');
  const { db, review } = nodoN(P, [notaN('p2', 'verbo', { after: p2 }), notaN('p1', 'spazio doppio', { after: p1 })]);
  const r = R.setDecision(review, 'p2', 'accept', {});
  const r2 = applica(r, B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: p1, adesso: p2 }));
  assert.equal(outcome(r2, 'p1'), 'applied', 'la proposta scritta esatta è scelta');
  assert.equal(B.testoAdesso(null, r2, { db, bersaglio: NDESC }).adesso, p1);
  // la 1-ter resta per tutto il resto: lo stesso testo con uno spazio in fondo non è la proposta → è il testo di partenza
  const r3 = applica(r, B.decisioniDaCampo({ review: r, db, regime: 'g1', bersaglio: NDESC, salvato: p1 + ' ', adesso: p2 }));
  assert.equal(outcome(r3, 'p1'), 'pending');
  assert.equal(B.testoAdesso(null, r3, { db, bersaglio: NDESC }).adesso, P);
  // e una proposta già decisa non conta: «aperta» sul campo
  const r4 = R.setDecision(r, 'p1', 'reject', {});
  const e4 = B.decisioniDaCampo({ review: r4, db, regime: 'g1', bersaglio: NDESC, salvato: p1, adesso: p2 });
  assert.equal(B.testoAdesso(null, applica(r4, e4), { db, bersaglio: NDESC }).adesso, P, 'p1 respinta: la 1-ter riporta al testo di partenza');
});

/* ═══ 0086, giro 3a (ADR 0012 rev. 12, ADR 0010 rev. 4; decisioni D36–D39): la regola unica delle spunte, la logica pura ═══
   Ogni nota del controllo ha una spunta (§4.1, `spunteDellaRiga`); una spunta tolta fa uscire le frasi dovunque la nota le
   teneva fuori (§4.5, `usciteSpunteTolte`); il bottone in fondo registra tutto in una scrittura (§4.4, `chiamateBottone`);
   il salvataggio del campo non decide le note (§4.3, `correzioneDelCampo`); il conto delle frasi per l'avviso (§4.6,
   `frasiContestate`, invariato). Cade il calcolo del giro 1 (`noteConSpunta` con D10, D11, D14 come condizione, B3 e la
   prova a secco; `testoSenzaPasso`; il `chiamateBottone` che registrava solo le spunte piene): i suoi test sono tolti o
   riscritti qui (l'elenco per nome è nel rapporto del giro 3a). I casi di «Svizzera» (seduta del 27/09) hanno i testi
   veri dei nodi e delle note, ricopiati in mappe piccole costruite col core vero: nessun dato fuori da git. */
const S86 = ['Il confine fu chiuso nel 1942.', 'Le banche custodivano oro tedesco.', 'Il commercio con la Germania continuò fino al 1944.',
  'I profughi furono respinti alla frontiera.'];
const T86 = S86.join(' ');
function rev86(nodi, issues, copertura) {
  const db = { nodes: nodi.map(n => Object.assign({ level: 1, group: 1 }, n)), links: [] };
  const report = { contratto: 'mappai-giudice@2', stato: 'parziale', issues };
  if (copertura !== null) report.copertura = copertura || { nodiEsaminati: db.nodes.map(n => n.id), nodiSaltati: [] };
  return { db, review: R.createReview({ db, sources: SOURCES, report }) };
}
const nota86 = (id, nodo, problem, extra) => Object.assign({ id, target: { kind: 'node', id: nodo, field: 'desc' }, problem }, extra);
const cita86 = (id, frammento, nodo) => nota86(id, nodo || 'N', 'La frase «' + frammento + '» non è nella fonte.');
const titolo86 = (id, extra) => Object.assign({ id, target: { kind: 'node', id: 'N', field: 'label' }, problem: 'Il titolo è vago.' }, extra);
const N86 = desc => [{ id: 'N', label: 'Neutralità', desc: desc === undefined ? T86 : desc }];
const issue86 = (review, id) => review.initial.issues.find(i => i.id === id);
const base86 = () => rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('s3', 'Il commercio con la Germania continuò'),
  nota86('n0', 'N', 'Il nodo semplifica troppo'), titolo86('tt', { after: 'Neutralità svizzera' })]);
const due86 = () => rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('s3', 'Il commercio con la Germania continuò')]);
const M86 = { id: 'M', label: 'Memoria', desc: 'Il resto è storia.' };

// I testi veri di «Svizzera» (pipeline.json della seduta «15 Svizzera e 2a GM»)
const SV86 = {
  D2: { id: 'L1_1_L2_B_D2', label: 'Annessione dell\'Austria', desc: 'La Germania aveva annesso l\'Austria nel 1938. L\'annessione è l\'atto con cui uno Stato prende possesso di un altro territorio. Questo evento ha spinto la Svizzera a chiamare i riservisti per sorvegliare i confini con la Germania nel marzo 1939.' },
  L2B: { id: 'L1_1_L2_B', label: 'Misure di Mobilitazione', desc: 'Per proteggere il territorio, lo Stato ha decretato la mobilitazione generale, che significa chiamare tutti i soldati al servizio. Nel marzo 1939, i riservisti, ovvero i soldati non più in servizio attivo, sono stati chiamati per fare la guardia ai confini con la Germania.' },
  L2A: { id: 'L1_1_L2_A', label: 'Comando Militare', desc: 'Il 30 agosto 1939 l\'Assemblea Federale ha nominato Henri Guisan Comandante in Capo dell\'Esercito Svizzero con il grado di Generale. Questa carica militare è speciale perché in Svizzera esiste solo durante i periodi di guerra per guidare le difese del Paese.' },
  L2C: { id: 'L1_1_L2_C', label: 'Opere Difensive', desc: 'Per evitare l\'invasione, la Svizzera creò il Ridotto nazionale nelle Alpi. Il Ridotto nazionale era un sistema di difesa basato su fortezze sotterranee camuffate da case o fienili. Questo piano serviva a organizzare una resistenza in un luogo impenetraibile se i nazisti avessero occupato il resto del territorio. La Svizzera mise anche esplosivi sotto ponti e gallerie.' },
  D4: { id: 'L1_0_L2_A_D4', label: 'Minaccia degli ordigni', desc: 'La Svizzera mise grandi quantità di esplosivo sotto i ponti e nelle gallerie di strade e ferrovie. Questa misura serviva a difendere l\'inviolabilità del territorio svizzero. Se le potenze dell\'Asse avessero provato a invadere il Paese, l\'esercito avrebbe fatto detonare gli ordigni. L\'esplosione degli ordigni avrebbe distrutto i passaggi per bloccare l\'avanzata dei nemici verso l\'interno della Svizzera.' },
  RAZ: { id: 'L1_2_L2_B', label: 'Sistema di razionamento', desc: 'Il sistema di razionamento è un metodo di distribuzione controllata del cibo. Questo sistema è stato introdotto all\'interno del piano Wahlen per gestire le scorte limitate. Per far funzionare questo meccanismo, lo Stato ha chiesto alla popolazione di fare scorta di cibo e ha regolato le quantità disponibili per ogni persona.' },
  BAN: { id: 'L1_3_L2_B', label: 'Gestione depositi bancari', desc: SVIZ_B }
};
const NSV86 = {
  e3efaa: nota86('issue-r1-3efaadd8f4a87e92-2362', 'L1_1_L2_B_D2', 'La fonte non stabilisce un nesso causale tra l\'annessione dell\'Austria (1938) e la chiamata dei riservisti (marzo 1939); sono elencati come eventi distinti.'),
  e7bfb2: nota86('issue-r1-7bfb2518a75dceda-1076', 'L1_1_L2_B_D2', 'Il documento non afferma che l\'annessione dell\'Austria abbia spinto la Svizzera a chiamare i riservisti per sorvegliare i confini nel marzo 1939.'),
  e670c6: nota86('issue-r1-670c688df7907617-1096', 'L1_1_L2_A', 'Henri Guisan non era stato nominato Comandante in Capo dell\'Esercito Svizzero il 30 agosto 1939, ma fu eletto dall\'Assemblea Federale nello stesso giorno.'),
  ecce1b: nota86('issue-r1-cce1b818b4cdfeb6-2731', 'L1_1_L2_C', 'Le opere di sbarramento non erano solo distese di blocchi di cemento triangolari. La Svizzera ha anche fatto depositare esplosivi in gallerie, ponti e strade, e costruito fortezze camuffate come case coloniche o fienili.'),
  e3926c: nota86('issue-r1-3926cc0a4129d0c4-2007', 'L1_1_L2_C', 'Il testo non sostiene che il Ridotto Nazionale sia stato creato per proteggere solo le montagne e le fortezze. Il Ridotto Nazionale è un piano che prevedeva una resistenza in caso di invasione, organizzando fortezze nel sottosuolo e camuff'),
  ec3fd3: nota86('issue-r1-c3fd39237376bcad-1959', 'L1_2_L2_B', '"Il sistema di razionamento" è stato introdotto per gestire le scorte limitate di cibo. Tuttavia, non è vero che questo sistema fosse usato solo per distribuire cibo: serviva anche a regolare le quantità disponibili per ogni persona.'),
  eb835b: nota86('issue-r1-b835b0a2ce0604a0-5010', 'L1_3_L2_B', 'La descrizione attribuisce l\'accusa di non restituire i depositi allo Stato svizzero, mentre la fonte parla genericamente di accuse relative alle banche svizzere.',
    { after: 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri. In particolare, le banche svizzere sono state accusate di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto bellico della Seconda Guerra Mondiale.' }),
  ecc27b: nota86('issue-r1-cc27b591923334fb-1822', 'L1_3_L2_B', 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri.'),
  efc6d3: nota86('issue-r1-fc6d3b1137dad8c7-1953', 'L1_3_L2_B', '\'Lo Stato svizzero è stato accusato di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto\' non è un fatto sostenuto dalla fonte. La fonte menziona solo che \'i responsabili sviz')
};
const sv86 = (...chiavi) => chiavi.map(k => clone(NSV86[k]));

const spunte86 = (f, riga, extra) => B.spunteDellaRiga(Object.assign({ review: f.review, db: f.db, riga: riga === undefined ? 'N' : riga }, extra));
const ids86 = s => (s.note || []).map(n => n.id);
const piene86 = s => (s.note || []).filter(n => n.piena).map(n => n.id);
const uscite86 = (f, tolte, extra) => B.usciteSpunteTolte(Object.assign({ review: f.review, db: f.db, riga: 'N', tolte }, extra));
const dopo86 = (u, id) => ((u.nodi || []).find(x => x.id === (id || 'N')) || {}).dopo;
const bottone86 = (f, extra) => B.chiamateBottone(Object.assign({ review: f.review, db: f.db, riga: 'N' }, extra));
const scelte86 = e => (e.chiamate || []).filter(c => c.chiamata === 'setDecision').map(c => [c.issueId, c.choice]);
// l'esito del bottone o del salvataggio applicato come lo applicherà la veste: le chiamate, poi le correzioni del docente
// da togliere (`togli`: `mappai-review-core.js` non ha la chiamata che toglie una segnalazione)
function applica86(review, esito) {
  assert.ok(esito && Array.isArray(esito.chiamate), 'atteso un elenco di chiamate, avuto ' + JSON.stringify(esito));
  const r = clone(applica(review, esito));
  const via = new Set(esito.togli || []);
  r.initial.issues = r.initial.issues.filter(i => !via.has(i.id));
  via.forEach(id => { delete r.initial.decisions[id]; });
  return r;
}
const conflitti86 = (r, db) => R.preview(r, db).conflicts.filter(c => c.code === 'conflicting_decisions');
const adesso86 = (r, db, id, field) => B.testoAdesso(null, r, { db, bersaglio: { kind: 'node', id: id || 'N', field: field || 'desc' } }).adesso;
const fuoriPer86 = (c, id) => c.righe.filter(r => Aff.FUORI.includes(r.corsia) && r.issueId === id);

/* ── §4.1 quali note hanno la spunta, lo stato di partenza, le spunte legate ── */
test('0086 g3a §4.1 tutte le note aperte del controllo della riga hanno la spunta, anche una sola: localizzata (piena), sulla descrizione intera (vuota, D39), con proposta; non il titolo, non le richieste del docente, non le note decise', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('s3', 'Il commercio con la Germania continuò'),
    nota86('n0', 'N', 'Il nodo semplifica troppo'), titolo86('tt', { after: 'Neutralità svizzera' }), nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta })]);
  const r = R.setDecision(R.addIssue(f.review, { target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Riscrivi la descrizione' }), 's3', 'reject', {});
  const s = spunte86({ review: r, db: f.db });
  assert.deepEqual(ids86(s), ['s1', 'n0', 'p'], 's3 è decisa, tt sta sul titolo, la richiesta è del docente');
  assert.deepEqual(piene86(s), ['s1', 'p'], 'n0 contesta la descrizione intera: parte vuota (D39)');
  assert.deepEqual(s.note.map(n => [n.id, n.campo, n.intero, n.frasi, n.conflitto]), [['s1', 'desc', false, 1, false], ['n0', 'desc', true, 0, false], ['p', 'desc', false, 1, false]]);
  assert.deepEqual(s.gruppi, []);
  // una nota sola: la spunta c'è (cade B3, e con lei Q20)
  assert.deepEqual(ids86(spunte86(rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942')]))), ['s1']);
  // la riga si passa come id, come riga di `righeMappa` o come bersaglio
  assert.deepEqual(ids86(spunte86({ review: r, db: f.db }, B.righeMappa(r, f.db).nodi.find(x => x.id === 'N'))), ['s1', 'n0', 'p']);
  assert.deepEqual(ids86(spunte86({ review: r, db: f.db }, { kind: 'node', id: 'N', field: 'desc' })), ['s1', 'n0', 'p']);
  assert.deepEqual(spunte86({ review: r, db: f.db }, null), { errore: 'riga_mancante' });
  assert.deepEqual(B.spunteDellaRiga({}), { errore: 'invalid_review' });
});

test('0086 g3a §4.1 una nota con una quasi-copia in un altro nodo ha la spunta (D14 non è più una condizione): cce1b su «Opere Difensive», anche con «Minaccia degli ordigni» non esaminato; 3926c contesta la descrizione intera e parte vuota', () => {
  const atteso = [[NSV86.ecce1b.id, true, false], [NSV86.e3926c.id, false, true]];
  assert.deepEqual(spunte86(rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c')), 'L1_1_L2_C').note.map(n => [n.id, n.piena, n.intero]), atteso);
  const saltato = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'),
    { nodiEsaminati: ['L1_1_L2_C'], nodiSaltati: [{ id: 'L1_0_L2_A_D4', label: 'Minaccia degli ordigni', motivo: 'lotto rifiutato' }] });
  assert.deepEqual(spunte86(saltato, 'L1_1_L2_C').note.map(n => [n.id, n.piena, n.intero]), atteso);
});

test('0086 g3a §4.1 il collegamento: le note sul collegamento e sulle parole hanno la spunta, piena; non contano fra le note del nodo', () => {
  const f = link86();
  assert.deepEqual(ids86(spunte86(f)), ['s1'], 'le note del collegamento non sono del nodo');
  const m = B.righeMappa(f.review, f.db);
  assert.equal(m.collegamenti.length, 1);
  assert.deepEqual(spunte86(f, m.collegamenti[0]).note.map(n => [n.id, n.campo, n.piena, n.intero]), [['l1', '$link', true, false], ['l2', 'rel', true, false]]);
  assert.deepEqual(ids86(spunte86(f, { kind: 'link', source: 'N', target: 'M' })), ['l1', 'l2']);
  assert.deepEqual(ids86(spunte86(f, { tipo: 'collegamento', source: 'N', target: 'M', rel: 'causa', id: m.collegamenti[0].id })), ['l1', 'l2']);
});

test('0086 g3a §4.1 G2: le note del controllo sui campi e sull\'esclusione del materiale hanno la spunta, piena; non le note del docente', () => {
  const f = g2(materiali86());
  const r = R.addIssue(f.review, { target: { kind: 'item', id: 'mc1', field: 'explanation' }, origin: 'teacher', blocking: true, problem: 'Rivedi la spiegazione' });
  assert.deepEqual(B.spunteDellaRiga({ review: r, db: f.db, riga: { kind: 'item', id: 'mc1' } }).note.map(n => [n.id, n.campo, n.piena]),
    [['i-mc1-q', 'question', true], ['i-mc1-x', '$item', true]]);
  const riga = B.righeMateriali(r, {}).righe.find(x => x.id === 'mc1');
  assert.deepEqual(ids86(B.spunteDellaRiga({ review: r, db: f.db, riga })), ['i-mc1-q', 'i-mc1-x'], 'anche dalla riga di `righeMateriali`');
});

test('0086 g3a §4.1 D37.3 le spunte legate: 7bfb2 e 3efaa (L1_1_L2_B_D2, lo stesso passo) sono un gruppo; passi sovrapposti solo in parte (S2 e «S1 S2») no; due note sulla descrizione intera sì, e il gruppo parte vuoto', () => {
  const d2 = spunte86(rev86([SV86.D2, SV86.L2B], sv86('e3efaa', 'e7bfb2')), 'L1_1_L2_B_D2');
  assert.deepEqual(d2.gruppi, [[NSV86.e3efaa.id, NSV86.e7bfb2.id]]);
  assert.deepEqual(d2.note.map(n => [n.gruppo, n.piena]), [[NSV86.e3efaa.id, true], [NSV86.e3efaa.id, true]]);
  const parziale = spunte86(rev86(N86(), [cita86('a', 'Le banche custodivano oro tedesco'), cita86('b', 'chiuso nel 1942. Le banche custodivano')]));
  assert.deepEqual(Aff.passoContestato(issue86(rev86(N86(), [cita86('b', 'chiuso nel 1942. Le banche custodivano')]).review, 'b')).passi.map(p => p.testo), [S86[0] + ' ' + S86[1]]);
  assert.deepEqual(parziale.gruppi, [], 'A su S2, B su «S1 S2»: non legate');
  assert.deepEqual(parziale.note.map(n => n.gruppo), ['a', 'b']);
  assert.deepEqual(spunte86(rev86(N86(), [cita86('p', 'Le banche custodivano oro tedesco'), nota86('q', 'N', '«Le banche custodivano oro tedesco»: la fonte non lo dice.')])).gruppi, [['p', 'q']]);
  const intere = spunte86(rev86(N86(), [nota86('n0', 'N', 'Il nodo semplifica troppo'), cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('n1', 'N', 'Mancano i dati del 1943')]));
  assert.deepEqual(intere.gruppi, [['n0', 'n1']]);
  assert.deepEqual(piene86(intere), ['s1']);
});

test('0086 g3a §4.1 D37.7 i conflitti salvati prima: le note del controllo le cui scelte si contraddicono riprendono la spunta, piena; una scelta che non confligge resta decisa', () => {
  const f = conflitto86();
  const r = R.setDecision(R.setDecision(f.review, 'p1', 'accept', {}), 'p2', 'accept', {});
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: NDESC }).ok, false, 'le due scelte confliggono');
  assert.deepEqual(spunte86({ review: r, db: f.db }).note.map(n => [n.id, n.piena, n.conflitto]), [['s1', true, false], ['p1', true, true], ['p2', true, true]]);
  assert.deepEqual(ids86(spunte86({ review: R.setDecision(f.review, 'p1', 'accept', {}), db: f.db })), ['s1', 'p2']);
});

test('0086 g3a §4.1 una revisione superata (il db non è più quello di partenza) non dà spunte: lo dice', () => {
  const f = due86(), db = clone(f.db);
  db.nodes.push({ id: 'X', label: 'X', desc: 'Altro.', level: 1, group: 1 });
  assert.equal(spunte86({ review: f.review, db }).errore, 'stale_revision');
});

/* ── §4.5 che cosa esce con una spunta tolta ── */
test('0086 g3a §4.5 la spunta tolta: esce la frase in mezzo, la prima, l\'ultima; in modo «citato» la frase intera, non solo il frammento; niente tolto, niente esce', () => {
  const caso = fr => dopo86(uscite86(rev86(N86(), [cita86('c', fr)]), ['c']));
  assert.equal(caso('Le banche custodivano oro tedesco'), [S86[0], S86[2], S86[3]].join(' '));
  assert.equal(caso('Il confine fu chiuso nel 1942'), [S86[1], S86[2], S86[3]].join(' '));
  assert.equal(caso('I profughi furono respinti alla frontiera'), [S86[0], S86[1], S86[2]].join(' '));
  assert.equal(caso('custodivano oro tedesco'), [S86[0], S86[2], S86[3]].join(' '));
  const f = rev86(N86(), [cita86('c', 'Le banche custodivano oro tedesco')]);
  assert.deepEqual(uscite86(f, ['c']), { nodi: [{ id: 'N', prima: T86, dopo: [S86[0], S86[2], S86[3]].join(' '), issueIds: ['c'] }], daRiscrivere: [] });
  assert.deepEqual(uscite86(f, []), { nodi: [], daRiscrivere: [] });
  assert.deepEqual(uscite86(f, ['non-esiste']), { nodi: [], daRiscrivere: [] });
});

test('0086 g3a §4.5 D12: escono tutte le frasi del passo, comprese le aggiunte di `_estendi` (7bfb2 su L1_1_L2_B_D2), quelle che la quarantena tiene fuori per lei nel suo nodo, e la quasi-copia in «Misure di Mobilitazione»', () => {
  const extra = ' Il resto è storia.';
  const d2 = Object.assign({}, SV86.D2, { desc: SV86.D2.desc + extra });
  const f = rev86([d2, SV86.L2B], sv86('e7bfb2', 'e3efaa'));
  const p = Aff.passoContestato(issue86(f.review, NSV86.e7bfb2.id));
  assert.equal((p.aggiunte || []).length, 1, 'una frase del passo è un\'aggiunta');
  const u = B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'L1_1_L2_B_D2', tolte: [NSV86.e7bfb2.id] });
  assert.deepEqual(u.daRiscrivere, []);
  assert.equal(dopo86(u, 'L1_1_L2_B_D2'), extra.trim(), 'il passo, la sua aggiunta e la frase di mezzo che la quarantena tiene fuori per 7bfb2');
  assert.equal(dopo86(u, 'L1_1_L2_B'), 'Per proteggere il territorio, lo Stato ha decretato la mobilitazione generale, che significa chiamare tutti i soldati al servizio.');
  assert.deepEqual(u.nodi.map(x => [x.id, x.issueIds]), [['L1_1_L2_B_D2', [NSV86.e7bfb2.id]], ['L1_1_L2_B', [NSV86.e7bfb2.id]]]);
  // senza la frase in più il nodo resterebbe vuoto: va riscritto (D38.1)
  const g = rev86([SV86.D2, SV86.L2B], sv86('e7bfb2', 'e3efaa'));
  assert.deepEqual(B.usciteSpunteTolte({ review: g.review, db: g.db, riga: 'L1_1_L2_B_D2', tolte: [NSV86.e7bfb2.id] }).daRiscrivere,
    [{ id: 'L1_1_L2_B_D2', issueIds: [NSV86.e7bfb2.id], motivo: 'nodo_svuotato' }]);
});

test('0086 g3a §4.5 la quasi-copia in un altro nodo esce anche lì, con la frase di coesione (cce1b: «Opere Difensive» e «Minaccia degli ordigni»)', () => {
  const f = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'));
  const u = B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'L1_1_L2_C', tolte: [NSV86.ecce1b.id] });
  assert.equal(dopo86(u, 'L1_1_L2_C'), SV86.L2C.desc.replace(' La Svizzera mise anche esplosivi sotto ponti e gallerie.', ''));
  assert.equal(dopo86(u, 'L1_0_L2_A_D4'), 'Se le potenze dell\'Asse avessero provato a invadere il Paese, l\'esercito avrebbe fatto detonare gli ordigni. L\'esplosione degli ordigni avrebbe distrutto i passaggi per bloccare l\'avanzata dei nemici verso l\'interno della Svizzera.');
  assert.deepEqual(u.daRiscrivere, []);
});

test('0086 g3a §4.5 la quasi-copia in un nodo NON esaminato (cce1b, «Minaccia degli ordigni» saltato) esce come se fosse esaminato; la revisione vera non cambia', () => {
  const f = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'),
    { nodiEsaminati: ['L1_1_L2_C'], nodiSaltati: [{ id: 'L1_0_L2_A_D4', label: 'Minaccia degli ordigni', motivo: 'lotto rifiutato' }] });
  const c = Aff.corsie({ review: f.review, db: f.db });
  assert.deepEqual(fuoriPer86(c, NSV86.ecce1b.id).map(r => r.nodeId), ['L1_1_L2_C'], 'sulla revisione com\'è la quasi-copia sfuggirebbe');
  const prima = JSON.stringify(f.review);
  freeze(f.review);
  const u = B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'L1_1_L2_C', tolte: [NSV86.ecce1b.id] });
  assert.ok(dopo86(u, 'L1_0_L2_A_D4').startsWith('Se le potenze dell\'Asse'));
  assert.equal(JSON.stringify(f.review), prima, 'la revisione vera non cambia');
  assert.deepEqual(Aff.copertura(f.review, f.db).nonEsaminati, ['L1_0_L2_A_D4'], 'e il nodo resta non esaminato');
});

test('0086 g3a §4.5 coesione e riprese nel suo nodo: 670c6 (L1_1_L2_A) toglie anche «Questa carica militare…» e il nodo andrebbe riscritto; scritta un\'altra seconda frase, esce solo il passo; una ripresa per contenimento esce col passo', () => {
  const f = rev86([SV86.L2A], sv86('e670c6'));
  const u = B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'L1_1_L2_A', tolte: [NSV86.e670c6.id] });
  assert.deepEqual(u, { nodi: [], daRiscrivere: [{ id: 'L1_1_L2_A', issueIds: [NSV86.e670c6.id], motivo: 'nodo_svuotato' }] });
  const nuova = 'In Svizzera il grado di Generale esiste solo in tempo di guerra.';
  const testo = SV86.L2A.desc.replace(/Questa carica militare.*$/, nuova);
  const u2 = B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'L1_1_L2_A', tolte: [NSV86.e670c6.id], testo });
  assert.equal(dopo86(u2, 'L1_1_L2_A'), nuova);
  const T = 'Il confine fu chiuso nel 1942. Le banche custodivano oro tedesco. Il commercio con la Germania continuò fino al 1944. In quegli anni le banche svizzere custodivano molto oro tedesco.';
  const g = rev86(N86(T), [cita86('a', 'Le banche custodivano oro tedesco'), cita86('c', 'Il commercio con la Germania continuò')]);
  assert.equal(dopo86(uscite86(g, ['a'])), 'Il confine fu chiuso nel 1942. Il commercio con la Germania continuò fino al 1944.');
});

test('0086 g3a §4.5 D37.2 una frase già cambiata nel campo esce com\'è adesso: riscritta da capo, ritoccata, o già tolta; il testo in sospeso conta, la revisione no', () => {
  const f = due86();
  const fuori = [S86[1], S86[3]].join(' ');
  const t = testo => dopo86(uscite86(f, ['s1', 's3'], { testo }));
  assert.equal(t(T86.replace(S86[0], 'Nessuno chiuse mai la frontiera del nord.')), fuori, 'riscritta da capo: esce lei, allo stesso posto');
  assert.equal(t(T86.replace('chiuso nel 1942', 'chiuso solo nel 1942')), fuori, 'ritoccata');
  assert.equal(t([S86[1], S86[2], S86[3]].join(' ')), fuori, 'S1 già tolta dal docente: esce solo S3');
  assert.equal(t(T86 + ' Una frase aggiunta.'), fuori + ' Una frase aggiunta.', 'una frase nuova altrove resta');
  // il testo in sospeso non è salvato: la revisione non cambia
  const prima = JSON.stringify(f.review);
  freeze(f.review);
  t(T86.replace(S86[0], 'Nessuno chiuse mai la frontiera del nord.'));
  assert.equal(JSON.stringify(f.review), prima);
  // il testo salvato (una correzione del docente) è quello di partenza della scheda
  const r = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: T86.replace(S86[0], 'Nessuno chiuse mai la frontiera del nord.') }));
  assert.equal(dopo86(uscite86({ review: r, db: f.db }, ['s1', 's3'])), fuori);
});

test('0086 g3a §4.5 un punto che non si ritrova non fa uscire niente e lo dice: il passo stava in un tratto riscritto con un altro numero di frasi, insieme a frasi non contestate', () => {
  const f = rev86(N86(), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const testo = [S86[0], 'Prima frase nuova.', 'Seconda frase nuova.', 'Terza frase nuova.', S86[3]].join(' ');
  assert.deepEqual(uscite86(f, ['c'], { testo }), { errore: 'punto_non_ritrovato', issueId: 'c', nodo: 'N' });
  /* giro 3a bis (revisore D1): lo stesso numero di frasi in un tratto con frasi non contestate non dice dove sia il passo
     (una frase tolta e una aggiunta danno lo stesso numero), e un tratto tutto passo riscritto con più frasi non dice quali
     siano del passo: nel dubbio non esce niente e lo dice (prima usciva «quella allo stesso posto», o tutto il tratto) */
  assert.deepEqual(uscite86(f, ['c'], { testo: [S86[0], 'Prima frase nuova.', 'Seconda frase nuova.', S86[3]].join(' ') }), { errore: 'punto_non_ritrovato', issueId: 'c', nodo: 'N' });
  assert.deepEqual(uscite86(f, ['c'], { testo: [S86[0], 'Prima frase nuova.', 'Seconda frase nuova.', S86[2], S86[3]].join(' ') }), { errore: 'punto_non_ritrovato', issueId: 'c', nodo: 'N' });
  // un tratto tutto passo riscritto con lo stesso numero di frasi: esce quella allo stesso posto (D37.2)
  assert.equal(dopo86(uscite86(f, ['c'], { testo: [S86[0], 'Prima frase nuova.', S86[2], S86[3]].join(' ') })), [S86[0], S86[2], S86[3]].join(' '));
});

test('0086 g3a §4.5 D38.1 un nodo che resterebbe vuoto va riscritto: la descrizione intera, il passo che è tutta la descrizione, la quasi-copia che è l\'unica frase di un altro nodo; col campo già riscritto dal docente resta il testo scritto', () => {
  const f = base86();
  assert.deepEqual(uscite86(f, ['n0']), { nodi: [], daRiscrivere: [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera' }] });
  // giro 3a bis (D40.2, revisore D3): riscritta da capo — la quarantena non vi ritrova nessuna frase generata (prima qui c'era
  // «La Svizzera chiuse il confine nel 1942. Il commercio continuò.», che riprende «Il confine fu chiuso nel 1942.»)
  const scritto = 'Le frontiere restarono sbarrate. Gli scambi proseguirono.';
  // riscritta in questa seduta (D40: all'apertura del Banco il campo era il testo generato)
  assert.deepEqual(uscite86(f, ['n0'], { testo: scritto, apertura: { N: T86 } }), { nodi: [{ id: 'N', prima: scritto, dopo: scritto, issueIds: ['n0'] }], daRiscrivere: [] });
  // ADR 0012 rev. 15 (packet 0089): la soglia di contenimento è spenta, l'ultima parola è del docente — una frase generata
  // corretta conta come scritta (prima qui la descrizione restava «da riscrivere»)
  assert.deepEqual(uscite86(f, ['n0'], { testo: 'La Svizzera chiuse il confine nel 1942. Il commercio continuò.', apertura: { N: T86 } }).daRiscrivere, [],
    'rev. 15: una frase generata corretta fa della descrizione una descrizione scritta');
  assert.deepEqual(uscite86(f, ['n0'], { testo: T86 + '  ' }).daRiscrivere.map(x => x.id), ['N'], 'soli spazi: il campo non è cambiato');
  // una proposta del controllo copiata nel campo non è un testo scritto dal docente
  const prop = rev86(N86(), [nota86('n0', 'N', 'Il nodo semplifica troppo'), nota86('p', 'N', 'Respingimenti solo in parte.', { after: T86.replace(S86[3], 'I profughi furono accolti solo in parte.') })]);
  assert.deepEqual(uscite86(prop, ['n0'], { testo: T86.replace(S86[3], 'I profughi furono accolti solo in parte.') }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  // «riscritto» vuol dire che del testo generato non resta nessuna frase tale e quale: una correzione di un'altra frase
  // (la seduta del 27/09: L1_4, L1_0, L1_1_L2_C…) non scrive la descrizione da tenere, e la riga resta da fare (D39)
  const ritocco = T86.replace(S86[0], 'Il confine restò aperto fino al 1942.');
  assert.deepEqual(uscite86(f, ['n0'], { testo: ritocco }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  const corretta = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: ritocco }));
  assert.deepEqual(uscite86({ review: corretta, db: f.db }, ['n0']).daRiscrivere.map(x => x.motivo), ['descrizione_intera'], 'anche salvata prima');
  // il passo è tutta la descrizione
  const uno = rev86(N86(S86[1]), [cita86('p', 'Le banche custodivano oro tedesco')]);
  assert.deepEqual(uscite86(uno, ['p']).daRiscrivere, [{ id: 'N', issueIds: ['p'], motivo: 'nodo_svuotato' }]);
  // la quasi-copia è l'unica frase di un altro nodo
  const copia = rev86(N86().concat([{ id: 'M', label: 'Memoria', desc: S86[1] }]), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const u = uscite86(copia, ['c']);
  assert.deepEqual(u.daRiscrivere, [{ id: 'M', issueIds: ['c'], motivo: 'quasi_copia' }]);
  assert.equal(dopo86(u), [S86[0], S86[2], S86[3]].join(' '));
  // l'altro nodo riscritto dal docente in questa seduta (D40: `apertura`): resta il suo testo
  let r = R.addIssue(copia.review, { target: { kind: 'node', id: 'M', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente' });
  r = R.setDecision(r, r.initial.issues[r.initial.issues.length - 1].id, 'manual', { text: 'Le banche svizzere custodivano oro tedesco.' });
  const u2 = uscite86({ review: r, db: copia.db }, ['c'], { apertura: { N: T86, M: S86[1] } });
  assert.deepEqual(u2.daRiscrivere, []);
  assert.equal(dopo86(u2, 'M'), undefined, 'M non cambia');
});

/* D40 (Giacomo, 09/10, giro 3a): «Conta solo la riscrittura di adesso» e «Sì, nessuna frase generata». Per D38.1 una
   descrizione conta come riscritta solo se è diversa dal testo che aveva all'apertura del Banco (`apertura`, che passa la
   veste) E non ha più nessuna frase generata tale e quale. Una riscrittura salvata in una seduta di prima non basta. */
test('0086 g3a §4.5 D40 conta solo la riscrittura di questa seduta: diversa dal testo all\'apertura del Banco e senza frasi generate; una riscrittura di una seduta di prima, o un nodo senza testo d\'apertura, non accendono il bottone', () => {
  const f = base86(), scritto = 'Le frontiere restarono sbarrate. Gli scambi proseguirono.';
  // riscritta adesso: all'apertura il campo era il testo generato
  assert.deepEqual(uscite86(f, ['n0'], { testo: scritto, apertura: { N: T86 } }).daRiscrivere, []);
  assert.deepEqual(uscite86(f, ['n0'], { testo: scritto, apertura: new Map([['N', T86]]) }).daRiscrivere, [], 'anche come Map');
  // riscritta in una seduta di prima e salvata: all'apertura il campo era già quello
  const prima = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: scritto }));
  assert.deepEqual(uscite86({ review: prima, db: f.db }, ['n0'], { apertura: { N: scritto } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  assert.deepEqual(bottone86({ review: prima, db: f.db }, { apertura: { N: scritto } }).daRiscrivere.map(x => x.id), ['N']);
  // riscritta di nuovo adesso: il bottone si accende (giro 3a bis, L2: senza più nessuna frase del testo all'apertura)
  const ancora = 'Le dogane furono riaperte nel 1945. I mercati ripresero.';
  assert.deepEqual(uscite86({ review: prima, db: f.db }, ['n0'], { testo: ancora, apertura: { N: scritto } }).daRiscrivere, []);
  // D40.2: diversa dal testo all'apertura ma con frasi generate ancora tali e quali (una frase sola corretta): non basta
  const ritocco = T86.replace(S86[0], 'Il confine restò aperto fino al 1942.');
  assert.deepEqual(uscite86(f, ['n0'], { testo: ritocco, apertura: { N: T86 } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  assert.deepEqual(uscite86(f, ['n0'], { testo: T86.replace(S86[1], 'Le  banche custodivano ORO tedesco.').replace(S86[0], 'Il confine restò aperto.'), apertura: { N: T86 } })
    .daRiscrivere.map(x => x.motivo), ['descrizione_intera'], 'la frase generata si riconosce nella forma della quarantena');
  // senza il testo d'apertura del nodo nessuna riscrittura conta (fallisce chiusa)
  assert.deepEqual(uscite86(f, ['n0'], { testo: scritto }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  assert.deepEqual(uscite86(f, ['n0'], { testo: scritto, apertura: { M: T86 } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  // l'altro nodo della quasi-copia: conta la sua riscrittura in seduta, non quella di prima
  const copia = rev86(N86().concat([{ id: 'M', label: 'Memoria', desc: S86[1] }]), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const mDoc = 'Le banche svizzere custodivano oro tedesco.';
  const rM = applica86(copia.review, B.correzioneDelCampo({ review: copia.review, db: copia.db, bersaglio: { kind: 'node', id: 'M', field: 'desc' }, salvato: mDoc }));
  assert.deepEqual(uscite86({ review: rM, db: copia.db }, ['c'], { apertura: { N: T86, M: S86[1] } }).daRiscrivere, [], 'M riscritto in questa seduta');
  assert.deepEqual(uscite86({ review: rM, db: copia.db }, ['c'], { apertura: { N: T86, M: mDoc } }).daRiscrivere, [{ id: 'M', issueIds: ['c'], motivo: 'quasi_copia' }], 'M riscritto in una seduta di prima');
});

test('0086 g3a §4.5 `corsie` che lancia un errore non fa uscire niente e lo dice; una frase ripetuta esce tutte e due le volte; gli spazi si ricuciono solo nel punto del taglio', () => {
  const f = rev86(N86(), [cita86('c', 'Le banche custodivano oro tedesco')]), vera = Aff.corsie;
  Aff.corsie = () => { throw new Error('corsie_rotta'); };
  try { assert.deepEqual(uscite86(f, ['c']), { errore: 'corsie', issueId: 'c' }); } finally { Aff.corsie = vera; }
  const rip = rev86(N86(T86 + ' ' + S86[1]), [cita86('c', 'Le banche custodivano oro tedesco')]);
  assert.equal(dopo86(uscite86(rip, ['c'])), [S86[0], S86[2], S86[3]].join(' '));
  const [a, b, c, d] = S86;
  const cfr = (testo, fr) => dopo86(uscite86(rev86(N86(testo), [cita86('x', fr)]), ['x']));
  assert.equal(cfr(a + '  ' + b + ' ' + c + '\n' + d, 'Le banche custodivano oro tedesco'), a + ' ' + c + '\n' + d);
  assert.equal(cfr(a + '  ' + b + ' ' + c + '\n' + d, 'Il commercio con la Germania continuò'), a + '  ' + b + '\n' + d);
  assert.equal(cfr(a + '\n\n' + b + ' ' + c, 'Le banche custodivano oro tedesco'), a + '\n\n' + c);
  assert.equal(cfr(a + '\n' + b + '\n  ' + c, 'Le banche custodivano oro tedesco'), a + '\n' + c, 'la rientranza della riga dopo il taglio non si eredita');
  assert.equal(cfr(a + '\n' + b, 'Il confine fu chiuso nel 1942'), b);
  assert.equal(cfr(a + ' ' + b + '\n', 'Le banche custodivano oro tedesco'), a);
  // due frasi contestate in fila, in due capoversi: un taglio solo, il capoverso resta
  const x = rev86(N86(a + ' ' + b + '\n\n' + c + ' ' + d), [nota86('x', 'N', 'Le frasi «Le banche custodivano oro tedesco» e «Il commercio con la Germania continuò fino al 1944» non sono nella fonte.')]);
  assert.equal(dopo86(uscite86(x, ['x'])), a + '\n\n' + d);
});

/* ── §4.4 le chiamate del bottone in fondo ── */
test('0086 g3a §4.4 il bottone: spunta piena → `reject`, o `accept` col campo uguale alla proposta; spunta tolta → `manual` col testo senza la frase («Testo modificato da te»); nessun conflitto (0086 g3c, L6: la richiesta del docente aperta si chiude col testo che resta)', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('s3', 'Il commercio con la Germania continuò'),
    nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta })]);
  const r0 = R.addIssue(f.review, { target: { kind: 'node', id: 'N', field: 'label' }, origin: 'teacher', blocking: true, problem: 'Rivedi il titolo' });
  const g = { review: r0, db: f.db };
  const e = bottone86(g, { now: '2026-10-09T10:00:00.000Z' }), rqT = docenti(r0)[0].id;
  assert.deepEqual(e, { chiamate: [['s1', 'reject'], ['s3', 'reject'], ['p', 'reject'], [rqT, 'reject']].map(([issueId, choice]) =>
    ({ chiamata: 'setDecision', issueId, choice, opts: { now: '2026-10-09T10:00:00.000Z' } })), togli: [] });
  const r = applica86(r0, e);
  assert.deepEqual(['s1', 's3', 'p'].map(id => outcome(r, id)), ['kept', 'kept', 'kept']);
  // giro 3c, L6: la richiesta del docente aperta sul titolo si chiude col titolo che resta (qui quello di partenza)
  assert.equal(outcome(r, rqT), 'kept', 'la richiesta del docente si chiude col titolo del campo');
  assert.equal(adesso86(r, f.db), T86);
  // la proposta copiata nel campo: «Proposta scelta»
  const e2 = bottone86(g, { campi: { desc: proposta } });
  assert.deepEqual(scelte86(e2), [['s1', 'reject'], ['s3', 'reject'], ['p', 'accept'], [rqT, 'reject']]);
  const r2 = applica86(r0, e2);
  assert.equal(outcome(r2, 'p'), 'applied');
  assert.equal(adesso86(r2, f.db), proposta);
  // la spunta di s3 tolta
  const e3 = bottone86(g, { spunte: { s3: false } });
  assert.deepEqual(scelte86(e3), [['s1', 'reject'], ['s3', 'manual'], ['p', 'reject'], [rqT, 'reject']]);
  const r3 = applica86(r0, e3);
  assert.equal(outcome(r3, 's3'), 'edited');
  assert.equal(adesso86(r3, f.db), [S86[0], S86[1], S86[3]].join(' '));
  for (const x of [r, r2, r3]) assert.deepEqual(conflitti86(x, f.db), []);
  // una richiesta del docente aperta sulla descrizione: giro 3c, L6 — il bottone la chiude col testo che resta dopo il taglio
  // (prima non la toccava, e la richiesta restava aperta senza un gesto che la chiudesse)
  const rq = R.addIssue(r0, { target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Riscrivi la frase sui profughi' });
  const rqD = docenti(rq).find(i => i.target.field === 'desc').id;
  const eq = bottone86({ review: rq, db: f.db }, { spunte: { s3: false } });
  assert.deepEqual(scelte86(eq), [['s1', 'reject'], ['s3', 'manual'], ['p', 'reject'], [rqD, 'manual'], [rqT, 'reject']]);
  const rqq = applica86(rq, eq);
  assert.deepEqual([rqD, rqT].map(id => outcome(rqq, id)), ['edited', 'kept']);
  assert.equal(rqq.initial.decisions[rqD].text, [S86[0], S86[1], S86[3]].join(' '));
  assert.deepEqual(conflitti86(rqq, f.db), []);
  // la proposta copiata e una frase tolta: la proposta non c'è più tale e quale, p è «tenuta» nel testo che resta
  const e4 = bottone86(g, { campi: { desc: proposta }, spunte: { s1: false } });
  assert.deepEqual(scelte86(e4), [['s1', 'manual'], ['s3', 'reject'], ['p', 'reject'], [rqT, 'reject']]);
  const r4 = applica86(r0, e4);
  assert.equal(adesso86(r4, f.db), [S86[1], S86[2], 'I profughi furono accolti solo in parte.'].join(' '));
  assert.deepEqual(conflitti86(r4, f.db), []);
});

test('0086 g3a §4.4 il bottone con una quasi-copia: il nodo della nota e l\'altro nodo ricevono il testo senza le frasi, l\'altro con una correzione del docente; una scrittura sola, nessun conflitto', () => {
  const f = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'));
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga: 'L1_1_L2_C', spunte: { [NSV86.ecce1b.id]: false, [NSV86.e3926c.id]: true }, problema: 'Modifica del docente' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.target.id, c.issue.origin] : [c.issueId, c.choice]),
    [[NSV86.ecce1b.id, 'manual'], [NSV86.e3926c.id, 'reject'], ['addIssue', 'L1_0_L2_A_D4', 'teacher'], [e.chiamate[2].issue.id, 'manual']]);
  const r = applica86(f.review, e);
  assert.equal(adesso86(r, f.db, 'L1_1_L2_C'), SV86.L2C.desc.replace(' La Svizzera mise anche esplosivi sotto ponti e gallerie.', ''));
  assert.ok(adesso86(r, f.db, 'L1_0_L2_A_D4').startsWith('Se le potenze dell\'Asse'));
  assert.equal(outcome(r, NSV86.ecce1b.id), 'edited');
  assert.equal(outcome(r, NSV86.e3926c.id), 'kept');
  assert.deepEqual(conflitti86(r, f.db), []);
  // e la quarantena non tiene più fuori niente per cce1b
  assert.equal(fuoriPer86(Aff.corsie({ review: r, db: f.db }), NSV86.ecce1b.id).length, 0);
});

test('0086 g3a §4.4 D39 e D38.1: la descrizione intera parte vuota e il bottone non scrive niente (va riscritta); messa la spunta, `reject` e «Confermi tutto il testo»; riscritta, la nota prende il testo scritto. Il titolo si chiude col bottone (D37.4)', () => {
  const f = base86();
  assert.deepEqual(bottone86(f), { chiamate: [], togli: [], daRiscrivere: [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera' }] });
  const e = bottone86(f, { spunte: { n0: true } });
  assert.deepEqual(scelte86(e), [['s1', 'reject'], ['s3', 'reject'], ['n0', 'reject'], ['tt', 'reject']]);
  assert.deepEqual(B.frasiContestate(['s1', 's3', 'n0'].map(id => issue86(f.review, id))), { n: 2, intero: true });
  const scritto = 'Le dogane furono riaperte nel 1945. I mercati ripresero.';   // giro 3a bis: riscritta da capo (D40.2)
  const e2 = bottone86(f, { campi: { desc: scritto, label: 'Neutralità svizzera' }, apertura: { N: T86 } });
  assert.deepEqual(scelte86(e2), [['s1', 'reject'], ['s3', 'reject'], ['n0', 'manual'], ['tt', 'accept']]);
  const r2 = applica86(f.review, e2);
  assert.equal(adesso86(r2, f.db), scritto);
  assert.equal(adesso86(r2, f.db, 'N', 'label'), 'Neutralità svizzera');
  assert.deepEqual(['s1', 's3', 'n0', 'tt'].map(id => outcome(r2, id)), ['kept', 'kept', 'edited', 'applied']);
  assert.deepEqual(conflitti86(r2, f.db), []);
});

test('0086 g3a §4.4 D37.3 una spunta tolta in un gruppo legato toglie tutte le note del gruppo', () => {
  const f = rev86(N86(), [cita86('p', 'Le banche custodivano oro tedesco'), nota86('q', 'N', '«Le banche custodivano oro tedesco»: la fonte non lo dice.'), cita86('s1', 'Il confine fu chiuso nel 1942')]);
  const e = bottone86(f, { spunte: { p: false } });
  assert.deepEqual(scelte86(e), [['p', 'manual'], ['q', 'manual'], ['s1', 'reject']]);
  assert.equal(adesso86(applica86(f.review, e), f.db), [S86[0], S86[2], S86[3]].join(' '));
});

test('0086 g3a §4.4 D37.7 i conflitti salvati prima: il campo riparte dall\'Originale e le decisioni nuove sostituiscono quelle in conflitto, senza conflitti', () => {
  const f = conflitto86();
  const r = R.setDecision(R.setDecision(f.review, 'p1', 'accept', {}), 'p2', 'accept', {});
  const e = bottone86({ review: r, db: f.db });
  assert.deepEqual(scelte86(e), [['s1', 'reject'], ['p1', 'reject'], ['p2', 'reject']]);
  const r1 = applica86(r, e);
  assert.equal(adesso86(r1, f.db), T86);
  assert.deepEqual(conflitti86(r1, f.db), []);
  // il campo con la proposta di p1: p1 resta «Proposta scelta» (la sua decisione è già quella: non si riscrive), p2 no
  const e2 = bottone86({ review: r, db: f.db }, { campi: { desc: issue86(r, 'p1').after } });
  assert.deepEqual(scelte86(e2), [['s1', 'reject'], ['p2', 'reject']]);
  const r2 = applica86(r, e2);
  assert.deepEqual(['s1', 'p1', 'p2'].map(id => outcome(r2, id)), ['kept', 'applied', 'kept']);
  assert.equal(adesso86(r2, f.db), issue86(r, 'p1').after);
  assert.deepEqual(conflitti86(r2, f.db), []);
});

test('0086 g3a §4.4 il collegamento: spunta piena = tieni (le parole come nel campo); tolta = il collegamento è tolto, e la correzione delle parole non vale più, senza conflitto', () => {
  const f = link86(), riga = B.righeMappa(f.review, f.db).collegamenti[0];
  const LR = { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' };
  // prima le parole (il campo), poi la nota sul collegamento
  assert.deepEqual(scelte86(B.chiamateBottone({ review: f.review, db: f.db, riga })), [['l2', 'reject'], ['l1', 'reject']]);
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga, campi: { rel: 'precede' } });
  assert.deepEqual(scelte86(e), [['l2', 'accept'], ['l1', 'reject']]);
  assert.equal(B.testoAdesso(null, applica86(f.review, e), { db: f.db, bersaglio: LR }).adesso, 'precede');
  // le parole corrette dal docente, poi la spunta tolta: via il collegamento, via la correzione delle parole. Giro 3a bis
  // (revisore D6): l1 («toglilo») ha la spunta piena e non riceve `accept`; il collegamento lo toglie un'esclusione del docente
  const r1 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: LR, salvato: 'determina' }));
  const tid = docenti(r1)[0].id;
  const e2 = B.chiamateBottone({ review: r1, db: f.db, riga, spunte: { l2: false } });
  assert.deepEqual(e2.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.target.field, c.issue.origin] : [c.issueId, c.choice]),
    [['addIssue', '$link', 'teacher'], [e2.chiamate[0].issue.id, 'accept'], ['l1', 'reject'], ['l2', 'reject']]);
  assert.deepEqual(e2.togli, [tid]);
  // con la spunta di l1 tolta: la sua proposta («toglilo»)
  assert.deepEqual(scelte86(B.chiamateBottone({ review: r1, db: f.db, riga, spunte: { l1: false } })), [['l1', 'accept'], ['l2', 'reject']]);
  const r2 = applica86(r1, e2);
  assert.equal(B.testoAdesso(null, r2, { db: f.db, bersaglio: LR }).escluso, true);
  assert.deepEqual(conflitti86(r2, f.db), []);
  // senza una nota che propone di toglierlo: lo toglie un'esclusione del docente
  const g = link86([], true);
  const e3 = B.chiamateBottone({ review: g.review, db: g.db, riga: B.righeMappa(g.review, g.db).collegamenti[0], spunte: { l2: false } });
  assert.deepEqual(e3.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.target.field, c.issue.after, c.issue.origin] : [c.issueId, c.choice]),
    [['addIssue', '$link', null, 'teacher'], [e3.chiamate[0].issue.id, 'accept'], ['l2', 'reject']]);
  assert.equal(B.testoAdesso(null, applica86(g.review, e3), { db: g.db, bersaglio: LR }).escluso, true);
});

test('0086 g3a §4.4 G2: spunta piena = tieni il materiale come nel campo; tolta su un campo = esclusione del docente (D37.5); tolta sulla sola nota d\'esclusione = la sua proposta (D8)', () => {
  const f = g2(materiali86()), mc1 = { kind: 'item', id: 'mc1' };
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga: mc1, campi: { question: 'Chi venne accusato?' } });
  assert.deepEqual(scelte86(e), [['i-mc1-q', 'accept'], ['i-mc1-x', 'reject']]);
  const r = applica86(f.review, e);
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: { kind: 'item', id: 'mc1', field: 'question' } }).adesso, 'Chi venne accusato?');
  const e2 = B.chiamateBottone({ review: f.review, db: f.db, riga: mc1, spunte: { 'i-mc1-q': false } });
  assert.deepEqual(e2.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.id] : [c.issueId, c.choice]),
    [['addIssue', 'teacher-exclude-mc1'], ['teacher-exclude-mc1', 'accept'], ['i-mc1-x', 'reject']]);
  const r2 = applica86(f.review, e2);
  assert.equal(B.righeMateriali(r2, {}).righe.find(x => x.id === 'mc1').stato, 'escluso');
  const sola = g2({ stato: 'parziale', issues: [{ id: 'x2', target: { kind: 'item', id: 'mc2', field: '$item' }, after: null, problem: 'Fuori fonte.' }] });
  const e3 = B.chiamateBottone({ review: sola.review, db: sola.db, riga: { kind: 'item', id: 'mc2' }, spunte: { x2: false } });
  assert.deepEqual(scelte86(e3), [['x2', 'accept']]);
  assert.equal(B.righeMateriali(applica86(sola.review, e3), {}).righe.find(x => x.id === 'mc2').stato, 'escluso');
});

test('0086 g3a §4.4 una correzione del docente e un `accept` con lo stesso testo non confliggono; un nodo da riscrivere, o `corsie` rotta, non danno chiamate; la revisione non cambia', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta })]);
  const r1 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: proposta }));
  assert.equal(outcome(r1, 'p'), 'pending', 'il salvataggio non sceglie la proposta');
  const e = bottone86({ review: r1, db: f.db });
  assert.deepEqual(scelte86(e), [['s1', 'reject'], ['p', 'accept']]);
  const r2 = applica86(r1, e);
  assert.deepEqual(conflitti86(r2, f.db), []);
  assert.equal(adesso86(r2, f.db), proposta);
  const g = base86(), vera = Aff.corsie, prima = JSON.stringify(g.review);
  freeze(g.review);
  assert.equal(bottone86(g, { spunte: { s1: false, n0: true } }).chiamate.length > 0, true);
  Aff.corsie = () => { throw new Error('corsie_rotta'); };
  try { assert.deepEqual(bottone86(g, { spunte: { s1: false, n0: true } }), { errore: 'corsie', issueId: 's1' }); } finally { Aff.corsie = vera; }
  assert.equal(JSON.stringify(g.review), prima);
});

/* ── §4.3 il salvataggio del campo, che non decide le note ── */
test('0086 g3a §4.3 il salvataggio del campo: una correzione del docente, già decisa; nessuna nota del controllo decisa, nemmeno quella il cui passo non c\'è più; un secondo salvataggio aggiorna la stessa correzione', () => {
  const f = base86();
  const salvato = T86.replace(S86[0], 'Il confine restò aperto.');
  const e = B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato, problema: 'Modifica del docente' });
  assert.deepEqual(e.chiamate.map(c => c.chiamata), ['addIssue', 'setDecision']);
  assert.deepEqual(e.togli, []);
  assert.equal(e.chiamate[0].issue.origin, 'teacher');
  const r = applica86(f.review, e);
  assert.deepEqual(['s1', 's3', 'n0', 'tt'].map(id => outcome(r, id)), ['pending', 'pending', 'pending', 'pending']);
  assert.equal(outcome(r, docenti(r)[0].id), 'edited');
  assert.equal(adesso86(r, f.db), salvato);
  // il regime 'g1' di oggi chiude s1 (il suo passo non c'è più): la veste lo usa finché il giro 3b non la cambia
  assert.ok(chiuse(B.decisioniDaCampo({ review: f.review, db: f.db, regime: 'g1', bersaglio: NDESC, salvato })).includes('s1'));
  const e2 = B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: salvato + ' Frase aggiunta.' });
  assert.deepEqual(scelte86(e2), [[docenti(r)[0].id, 'manual']]);
  assert.equal(e2.chiamate.length, 1);
});

test('0086 g3a §4.3 soli spazi: nessuna scrittura; una scheda vecchia: `adesso_superato`; tornato all\'Originale: la correzione del docente si toglie, nessun `manual` uguale all\'Originale', () => {
  const f = base86();
  assert.deepEqual(B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: '  ' + T86.replace('. ', '.  ') + '\n' }), { chiamate: [], togli: [] });
  assert.deepEqual(B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: 'x', adesso: 'y' }), { errore: 'adesso_superato' });
  const r = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: T86 + ' Frase aggiunta.' }));
  const tid = docenti(r)[0].id;
  // soli spazi anche su un testo già corretto dal docente: nessuna scrittura (la correzione resta quella)
  assert.deepEqual(B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: T86 + '  Frase aggiunta. \n' }), { chiamate: [], togli: [] });
  const e = B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: T86 + ' ' });
  assert.deepEqual(e, { chiamate: [], togli: [tid] });
  const r2 = applica86(r, e);
  assert.equal(adesso86(r2, f.db), T86);
  assert.equal(docenti(r2).length, 0);
  assert.deepEqual(B.correzioneDelCampo({}), { errore: 'invalid_review' });
  assert.deepEqual(B.correzioneDelCampo({ review: f.review, bersaglio: NDESC }), { errore: 'testo_mancante' });
});

test('0086 g3a §4.3 una richiesta del docente aperta si chiude con la correzione; una scelta già presa sul campo segue il testo salvato senza conflitto; le note aperte restano aperte', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta })]);
  const rq = R.addIssue(f.review, { target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Riscrivi la frase sui profughi' });
  const salvato = T86 + ' Frase aggiunta.';
  const e = B.correzioneDelCampo({ review: rq, db: f.db, bersaglio: NDESC, salvato });
  assert.deepEqual(scelte86(e), [[docenti(rq)[0].id, 'manual']]);
  const r = applica86(rq, e);
  assert.equal(outcome(r, docenti(rq)[0].id), 'edited');
  assert.deepEqual(['s1', 'p'].map(id => outcome(r, id)), ['pending', 'pending']);
  // «Proposta scelta» prima (veste spenta, sedute di prima), poi un ritocco: la scelta prende il testo, nasce la correzione
  const a = R.setDecision(f.review, 'p', 'accept', {});
  const e2 = B.correzioneDelCampo({ review: a, db: f.db, bersaglio: NDESC, salvato: proposta + ' Frase aggiunta.' });
  const r2 = applica86(a, e2);
  assert.equal(adesso86(r2, f.db), proposta + ' Frase aggiunta.');
  assert.deepEqual(conflitti86(r2, f.db), []);
  assert.equal(outcome(r2, 's1'), 'pending');
  assert.equal(docenti(r2).length, 1);
});

test('0086 g3a §4.3 D37.7 sul campo in conflitto il salvataggio rimette in sospeso le scelte che si contraddicevano: tornano note con la spunta, e il testo è il tuo', () => {
  const f = conflitto86();
  const r = R.setDecision(R.setDecision(f.review, 'p1', 'accept', {}), 'p2', 'accept', {});
  assert.deepEqual(B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: T86 }), { chiamate: [], togli: [] }, 'il campo mostra l\'Originale');
  const salvato = T86.replace(S86[3], 'I profughi furono a volte accolti.');
  const r2 = applica86(r, B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato }));
  assert.deepEqual(['p1', 'p2'].map(id => outcome(r2, id)), ['pending', 'pending']);
  assert.equal(adesso86(r2, f.db), salvato);
  assert.deepEqual(ids86(spunte86({ review: r2, db: f.db })), ['s1', 'p1', 'p2']);
});

test('0086 g3a §4.3 G2: la correzione di un campo è del docente e la nota aperta del campo resta aperta (il regime \'g2\' di oggi la chiudeva); le parole «Nessuna» di un collegamento', () => {
  const f = g2(materiali86()), Q = { kind: 'item', id: 'mc1', field: 'question' };
  const e = B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: Q, salvato: 'Chi fu davvero accusato?' });
  const r = applica86(f.review, e);
  assert.equal(outcome(r, 'i-mc1-q'), 'pending');
  assert.equal(docenti(r).length, 1);
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: Q }).adesso, 'Chi fu davvero accusato?');
  assert.ok(chiuse(B.decisioniDaCampo({ review: f.review, db: f.db, regime: 'g2', bersaglio: Q, salvato: 'Chi fu davvero accusato?' })).includes('i-mc1-q'));
  const l = link86(), LR = { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' };
  const e2 = B.correzioneDelCampo({ review: l.review, db: l.db, bersaglio: LR, salvato: '' });
  assert.deepEqual(e2.chiamate[1].opts, { text: '', relNone: true });
  assert.equal(outcome(applica86(l.review, e2), 'l2'), 'pending');
});

test('0086 g3a §4.3 con la nota aperta la quarantena tiene fuori il ritocco leggero della frase contestata; una frase riscritta da capo entra (limite dichiarato)', () => {
  const f = due86();
  const leggero = T86.replace('Il confine fu chiuso nel 1942.', 'Il confine fu chiuso nell\'anno 1942.');
  const r = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: leggero }));
  assert.deepEqual(fuoriPer86(Aff.corsie({ review: r, db: f.db }), 's1').map(x => x.testo), ['Il confine fu chiuso nell\'anno 1942.']);
  const daCapo = T86.replace('Il confine fu chiuso nel 1942.', 'La frontiera restò sempre aperta ai viaggiatori.');
  const r2 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: daCapo }));
  assert.deepEqual(fuoriPer86(Aff.corsie({ review: r2, db: f.db }), 's1'), []);
});

/* ── §4.6 il conto delle frasi (invariato; i due test del giro 1 restano com'erano) ── */
test('0086 §4.2 il conto delle frasi: un pezzo che unisce 3 frasi conta 3 (c3fd3 di L1_2_L2_B); due note sulla stessa frase = 1; un passo di due frasi = 2; la descrizione intera', () => {
  const raz = rev86([SV86.RAZ], sv86('ec3fd3'));
  const c3 = issue86(raz.review, NSV86.ec3fd3.id);
  assert.equal(Aff.passoContestato(c3).passi.length, 1, 'un pezzo solo');
  assert.deepEqual(B.frasiContestate([c3]), { n: 3, intero: false });
  assert.deepEqual(B.frasiContestate(c3), { n: 3, intero: false }, 'anche una nota sola, non in un elenco');
  const gem = rev86(N86(), [cita86('p', 'Le banche custodivano oro tedesco'), nota86('q', 'N', '«Le banche custodivano oro tedesco»: la fonte non lo dice.')]);
  assert.deepEqual(B.frasiContestate([issue86(gem.review, 'p'), issue86(gem.review, 'q')]), { n: 1, intero: false });
  const d2 = rev86([SV86.D2], sv86('e3efaa', 'e7bfb2'));
  assert.deepEqual(B.frasiContestate([issue86(d2.review, NSV86.e7bfb2.id)]), { n: 2, intero: false });
  assert.deepEqual(B.frasiContestate(d2.review.initial.issues), { n: 2, intero: false }, 'le stesse due frasi');
  const f = base86();
  assert.deepEqual(B.frasiContestate([issue86(f.review, 'n0')]), { n: 0, intero: true }, '«Confermi tutto il testo»');
  assert.deepEqual(B.frasiContestate([issue86(f.review, 's1'), issue86(f.review, 'n0')]), { n: 1, intero: true });
  assert.deepEqual(B.frasiContestate([]), { n: 0, intero: false });
});

test('0086 §4.2 giro 1 bis: una nota mancante nell\'elenco non si conta e non vale «tutto il testo» (V65)', () => {
  const f = due86();
  assert.deepEqual(B.frasiContestate([undefined, issue86(f.review, 's1')]), { n: 1, intero: false });
  assert.deepEqual(B.frasiContestate([null]), { n: 0, intero: false });
});

test('0086 g3a §4.6 il conto conta anche le note con proposta (la frase che la proposta corregge), e le frasi della stessa riga una volta sola', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta }), cita86('s4', 'I profughi furono respinti alla frontiera'),
    cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('n0', 'N', 'Il nodo semplifica troppo')]);
  assert.deepEqual(B.frasiContestate([issue86(f.review, 'p')]), { n: 1, intero: false });
  assert.deepEqual(B.frasiContestate(['p', 's4', 's1'].map(id => issue86(f.review, id))), { n: 2, intero: false });
  assert.deepEqual(B.frasiContestate(f.review.initial.issues), { n: 2, intero: true });
});

/* ── nel renderer ── */
test('0086 g3a nel renderer: con gli script caricati come in index.html le spunte, le uscite, il bottone e il salvataggio sono quelli di Node; senza il core delle affermazioni le note della descrizione non hanno spunta e il bottone non scrive', () => {
  const ctx = vm.createContext({});
  vm.runInContext('var window = this;', ctx);
  ['mappai-grounding-core.js', 'mappai-deepen-core.js', 'mappai-boilerplate-core.js', 'mappai-anchor-core.js', 'mappai-pipeline-core.js', 'mappai-review-core.js',
    'mappai-review-context.js', 'mappai-material-drafts.js', 'mappai-local-search-core.js', 'mappai-banco-core.js', 'mappai-evidence-core.js',
    'mappai-affermazioni-core.js'].forEach(f => vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + f), 'utf8'), ctx));
  const BB = ctx.MappAIBancoCore, f = base86(), j = x => JSON.parse(JSON.stringify(x));
  assert.deepEqual(j(BB.spunteDellaRiga({ review: f.review, db: f.db, riga: 'N' })), j(B.spunteDellaRiga({ review: f.review, db: f.db, riga: 'N' })));
  assert.deepEqual(j(BB.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'N', tolte: ['s1'] })), j(B.usciteSpunteTolte({ review: f.review, db: f.db, riga: 'N', tolte: ['s1'] })));
  assert.deepEqual(j(BB.chiamateBottone({ review: f.review, db: f.db, riga: 'N', spunte: { s1: false, n0: true } })), j(B.chiamateBottone({ review: f.review, db: f.db, riga: 'N', spunte: { s1: false, n0: true } })));
  assert.deepEqual(j(BB.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: T86 + ' X.' })), j(B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: T86 + ' X.' })));
  const solo = vm.createContext({});
  ['mappai-review-core.js', 'mappai-review-context.js', 'mappai-banco-core.js'].forEach(x => vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + x), 'utf8'), solo));
  assert.deepEqual(j(solo.MappAIBancoCore.spunteDellaRiga({ review: f.review, db: f.db, riga: 'N' })), { errore: 'affermazioni_mancanti' });
  assert.deepEqual(j(solo.MappAIBancoCore.chiamateBottone({ review: f.review, db: f.db, riga: 'N' })), { errore: 'affermazioni_mancanti' });
});

function link86(extra, senzaTogli) {
  const db = { nodes: N86().concat([M86]).map(n => Object.assign({ level: 1, group: 1 }, n)), links: [{ source: 'N', target: 'M', rel: 'causa' }] };
  const issues = [cita86('s1', 'Il confine fu chiuso nel 1942'),
    { id: 'l1', target: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: '$link' }, after: null, problem: 'Nesso non sostenuto.' },
    { id: 'l2', target: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' }, after: 'precede', problem: 'Verbo sbagliato.' }]
    .filter(i => !senzaTogli || i.id !== 'l1').concat(extra || []);
  const report = { contratto: 'mappai-giudice@2', stato: 'parziale', copertura: { nodiEsaminati: ['N', 'M'], nodiSaltati: [] }, issues };
  return { db, review: R.createReview({ db, sources: SOURCES, report }) };
}
function materiali86() {
  const rep = rapportoMateriali();
  rep.issues.push({ id: 'i-mc1-x', target: { kind: 'item', id: 'mc1', field: '$item' }, after: null, problem: 'Domanda fuori fonte.' });
  return rep;
}
function conflitto86() {
  return rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'),
    nota86('p1', 'N', 'Respingimenti solo in parte.', { after: T86.replace(S86[3], 'I profughi furono accolti solo in parte.') }),
    nota86('p2', 'N', 'Respingimenti frequenti.', { after: T86.replace(S86[3], 'I profughi furono spesso respinti.') })]);
}

/* ═══ 0086, giro 3a bis (09/10): i difetti di codice trovati dalle due verifiche indipendenti del giro 3a ═══
   Il revisore avversario (`rev0086-g3a/RAPPORTO.md`, D1–D9) e il verificatore di mutazioni (`mut0086-g3a/RAPPORTO.md`, §4).
   Le letture L1–L5 del §0 del packet («Congelato a D40») valgono come regole di lavoro. Le tre cose di Giacomo: nessuna
   frase contestata entra senza un gesto; le correzioni del docente entrano e non si perdono; niente esce o cambia in
   silenzio altrove. */
const SV86B = {
  D1: { id: 'L1_1_L2_A_D1', label: 'Poteri del Consiglio Federale', desc: 'L\'Assemblea Federale ha dato pieni poteri al Consiglio Federale, ovvero il governo della Svizzera. Grazie a questi poteri speciali, il governo ha potuto gestire l\'emergenza e inviare agli altri Stati una dichiarazione di neutralità il 31 agosto 1939.' },
  A: { id: 'L1_0_L2_A', label: 'Dichiarazione di neutralità', desc: 'Il 31 agosto 1939 il Consiglio Federale ha scritto una dichiarazione di neutralità. Questo documento serviva a comunicare alle potenze straniere che la Svizzera non voleva partecipare al conflitto. La Svizzera ha dichiarato che avrebbe difeso l\'inviolabilità del suo territorio, cioè il diritto di non essere invasa, usando tutti i mezzi disponibili per restare indipendente.' },
  D3: { id: 'L1_0_L2_A_D3', label: 'Mandato dell\'Assemblea Federale', desc: 'Il Consiglio Federale ha scritto la dichiarazione di neutralità grazie a un mandato speciale. Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.' }
};
const NSV86B = {
  e98c22: nota86('issue-r1-98c222662d83666c-1176', 'L1_1_L2_A_D1', 'Il testo non attribuisce al Consiglio Federale il compito di inviare una dichiarazione di neutralità agli altri Stati. Il Consiglio Federale ha il compito di difendere la neutralità svizzera, ma non è detto che abbia inviato una dichiaraz'),
  e2ac43: nota86('issue-r1-2ac430abebf21f2d-1181', 'L1_0_L2_A', 'Il Consiglio Federale non ha scritto la Dichiarazione di neutralità il 31 agosto 1939, ma l\'ha redatta il 30 agosto 1939.')
};
const aperturaDi = f => Object.fromEntries(f.db.nodes.map(n => [n.id, adesso86(f.review, f.db, n.id)]));
const dopoIl = (r, e) => applica86(r, e);

/* ── difetto 1 (revisore D1): D37.2, dove sta adesso il passo — solo ciò che gli corrisponde; nel dubbio non esce niente ── */
test('0086 g3a bis D37.2 esce solo ciò che corrisponde al passo: una data corretta in una frase non contestata e una frase nuova del docente accanto restano; un punto ambiguo è `punto_non_ritrovato`', () => {
  const f = rev86(N86(), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const [a, b, c, d] = S86;
  // il docente toglie lui S2, corregge la data di S3 e aggiunge una frase: il punto non si ritrova, e non esce la sua correzione
  const corretta = [a, 'Il commercio con la Germania continuò fino al 1945.', 'Nuova frase del docente sui profughi.', d].join(' ');
  assert.deepEqual(uscite86(f, ['c'], { testo: corretta }), { errore: 'punto_non_ritrovato', issueId: 'c', nodo: 'N' });
  // S2 ritoccata e una frase nuova subito dopo: esce solo S2 ritoccata
  const nuova = 'Il docente aggiunge una frase sui trattati.';
  assert.equal(dopo86(uscite86(f, ['c'], { testo: [a, 'Le banche svizzere custodivano oro tedesco.', nuova, c, d].join(' ') })), [a, nuova, c, d].join(' '));
  // una frase nuova prima di S2 riscritta: esce solo S2 riscritta, quella che la quarantena tiene fuori per c
  const prima = 'Frase nuova del docente.';
  assert.equal(dopo86(uscite86(f, ['c'], { testo: [a, prima, 'I depositi d\'oro tedesco stavano nelle banche.', c, d].join(' ') })), [a, prima, c, d].join(' '));
  // S2 riscritta in due frasi che la quarantena tiene fuori tutte e due: escono tutte e due
  assert.equal(dopo86(uscite86(f, ['c'], { testo: [a, 'Le banche avevano depositi.', 'Erano d\'oro tedesco.', c, d].join(' ') })), [a, c, d].join(' '));
  // lo stesso col campo salvato e il bottone: la correzione della data resta, il bottone non scrive
  const r1 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: corretta }));
  assert.equal(bottone86({ review: r1, db: f.db }, { spunte: { c: false } }).errore, 'punto_non_ritrovato');
  // il passo era tutta la descrizione e il docente l'ha riscritta tutta, con un altro numero di frasi: decide D38.1 (resta
  // il testo scritto in questa seduta; senza riscrittura il nodo va riscritto) — c3fd3 su «Sistema di razionamento»
  const raz = rev86([SV86.RAZ], sv86('ec3fd3')), nuovo = 'Le razioni erano decise dallo Stato. Ognuno riceveva una tessera.';
  const ur = B.usciteSpunteTolte({ review: raz.review, db: raz.db, riga: 'L1_2_L2_B', tolte: [NSV86.ec3fd3.id], testo: nuovo, apertura: { L1_2_L2_B: SV86.RAZ.desc } });
  assert.equal(dopo86(ur, 'L1_2_L2_B'), nuovo);
  assert.deepEqual(B.usciteSpunteTolte({ review: raz.review, db: raz.db, riga: 'L1_2_L2_B', tolte: [NSV86.ec3fd3.id], testo: nuovo }).daRiscrivere.map(x => x.motivo), ['nodo_svuotato']);
});

/* ── difetto 2 (revisore D2): L1, la portata della spunta si calcola all'apertura; una frase confermata non esce ── */
test('0086 g3a bis L1 una riscrittura in seduta non allarga ciò che la spunta fa uscire: 98c22 su «Poteri del Consiglio Federale», riscritta e con la spunta vuota, non toglie niente da «Dichiarazione di neutralità» e da «Mandato dell\'Assemblea Federale»', () => {
  const f = rev86([SV86B.D1, SV86B.A, SV86B.D3], [clone(NSV86B.e98c22), clone(NSV86B.e2ac43)]);
  const apertura = aperturaDi(f);
  // la riscrittura del revisore riprende la prima frase generata (la quarantena la ritrova: 0,80): è una correzione, non
  // una riscrittura (D40.2), e il bottone resta spento — niente esce da altri nodi senza un gesto sulla spunta
  const corretta = 'L\'Assemblea Federale diede pieni poteri al Consiglio Federale, cioè al governo svizzero, perché potesse gestire l\'emergenza della guerra.';
  const rc0 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: { kind: 'node', id: SV86B.D1.id, field: 'desc' }, salvato: corretta }));
  // ADR 0012 rev. 15 (packet 0089): la soglia di contenimento è spenta — la correzione del revisore conta come riscrittura
  // (prima: `resta: corretta`, bottone spento)
  assert.equal(B.chiamateBottone({ review: rc0, db: f.db, riga: SV86B.D1.id, apertura }).daRiscrivere, undefined, 'rev. 15: la correzione accende il bottone');
  // riscritta da capo: il bottone si accende, e la portata della nota è quella dell'apertura
  const nuovo = 'Durante la guerra il Parlamento affidò all\'esecutivo compiti straordinari per affrontare la crisi.';
  for (const conferma of [false, true]) {
    const r0 = conferma ? R.setDecision(f.review, NSV86B.e2ac43.id, 'reject', {}) : f.review;
    const r1 = applica86(r0, B.correzioneDelCampo({ review: r0, db: f.db, bersaglio: { kind: 'node', id: SV86B.D1.id, field: 'desc' }, salvato: nuovo }));
    const e = B.chiamateBottone({ review: r1, db: f.db, riga: SV86B.D1.id, apertura });
    assert.ok(Array.isArray(e.chiamate) && !e.daRiscrivere && !e.errore, 'il bottone si accende (D38.1, D40): ' + JSON.stringify(e));
    const r2 = applica86(r1, e);
    assert.equal(adesso86(r2, f.db, SV86B.D1.id), nuovo, 'resta il testo scritto');
    assert.equal(adesso86(r2, f.db, SV86B.A.id), SV86B.A.desc, 'niente esce da «Dichiarazione di neutralità»');
    assert.equal(adesso86(r2, f.db, SV86B.D3.id), SV86B.D3.desc, 'niente esce da «Mandato dell\'Assemblea Federale»');
    assert.deepEqual(conflitti86(r2, f.db), []);
  }
});

test('0086 g3a bis L1 non esce mai una frase che un\'altra decisione del docente ha confermato: la quasi-copia «tenuta» in un altro nodo resta; senza la conferma esce', () => {
  const M = { id: 'M', label: 'Memoria', desc: S86[1] + ' Il resto è storia.' };
  const f = rev86(N86().concat([M]), [cita86('c', 'Le banche custodivano oro tedesco'), cita86('m', 'Le banche custodivano oro tedesco', 'M')]);
  assert.equal(dopo86(uscite86(f, ['c']), 'M'), 'Il resto è storia.', 'senza la conferma la quasi-copia esce anche da M');
  const k = R.setDecision(f.review, 'm', 'reject', {});
  const u = uscite86({ review: k, db: f.db }, ['c']);
  assert.equal(dopo86(u), [S86[0], S86[2], S86[3]].join(' '), 'nel suo nodo la frase esce');
  assert.equal(dopo86(u, 'M'), undefined, 'M non cambia: la frase è «tenuta» da m');
  const r = applica86(k, bottone86({ review: k, db: f.db }, { spunte: { c: false } }));
  assert.equal(adesso86(r, f.db, 'M'), M.desc);
  assert.equal(outcome(r, 'm'), 'kept');
  // anche nel suo nodo una frase di coesione «tenuta» da un'altra nota resta
  const g = rev86([SV86.L2A], sv86('e670c6').concat([nota86('q', 'L1_1_L2_A', 'La frase «Questa carica militare è speciale» non è nella fonte.')]));
  const passoQ = Aff.passoContestato(issue86(g.review, 'q'));
  assert.equal(passoQ.modo !== 'nodo', true, 'q contesta la seconda frase');
  const gk = R.setDecision(g.review, 'q', 'reject', {});
  assert.equal(passoQ.passi.map(p => p.testo).join(' ').startsWith('Questa carica militare'), true);
  const ug = B.usciteSpunteTolte({ review: gk, db: g.db, riga: 'L1_1_L2_A', tolte: [NSV86.e670c6.id] });
  assert.equal(dopo86(ug, 'L1_1_L2_A'), 'Questa carica militare è speciale perché in Svizzera esiste solo durante i periodi di guerra per guidare le difese del Paese.');
});

test('0086 g3a bis L1 negli altri nodi conta il testo all\'apertura: una frase scritta dal docente in questa seduta che riprende il passo non esce; una quasi-copia che il docente ha già tolto non ferma il bottone', () => {
  const M = { id: 'M', label: 'Memoria', desc: 'Il resto è storia.' };
  const f = rev86(N86().concat([M]), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const apertura = { N: T86, M: M.desc };
  const scrittaM = 'Il resto è storia. Le banche svizzere custodivano oro tedesco.';
  const rM = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: { kind: 'node', id: 'M', field: 'desc' }, salvato: scrittaM }));
  assert.equal(fuoriPer86(Aff.corsie({ review: rM, db: f.db }), 'c').some(r => r.nodeId === 'M'), true, 'adesso la quarantena la tiene fuori per c');
  const u = uscite86({ review: rM, db: f.db }, ['c'], { apertura });
  assert.equal(dopo86(u), [S86[0], S86[2], S86[3]].join(' '));
  assert.equal(dopo86(u, 'M'), undefined, 'la frase del docente in M resta');
  // la quasi-copia c'era all'apertura in M, e il docente l'ha tolta in questa seduta: niente da togliere, nessun errore
  const g = rev86(N86().concat([{ id: 'M', label: 'Memoria', desc: S86[1] + ' Il resto è storia.' }]), [cita86('c', 'Le banche custodivano oro tedesco')]);
  const gM = applica86(g.review, B.correzioneDelCampo({ review: g.review, db: g.db, bersaglio: { kind: 'node', id: 'M', field: 'desc' }, salvato: 'Il resto è storia.' }));
  const ug = uscite86({ review: gM, db: g.db }, ['c'], { apertura: { N: T86, M: S86[1] + ' Il resto è storia.' } });
  assert.equal(ug.errore, undefined, JSON.stringify(ug));
  assert.equal(dopo86(ug, 'M'), undefined);
});

/* ── difetto 3 (revisore D3): L2, «riscritta in questa seduta» — un ritocco non è una riscrittura ── */
test('0086 g3a bis L2 un ritocco (un punto tolto, «.» → «!») non è una riscrittura: né sul testo generato né sul testo all\'apertura; il bottone resta spento', () => {
  const S = 'Le banche custodivano oro tedesco.';
  const f = rev86([{ id: 'N', label: 'Banche', desc: S }, { id: 'M', label: 'Altro', desc: 'Il resto è storia.' }], [cita86('c', 'Le banche custodivano oro tedesco')]);
  const apertura = { N: S, M: 'Il resto è storia.' };
  for (const ritocco of ['Le banche custodivano oro tedesco!', 'Le banche custodivano oro tedesco', 'le banche, custodivano oro tedesco.']) {
    const r1 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: ritocco }));
    // giro 3d, punto 4: `resta` è la frase ritoccata, com'è scritta nel campo
    assert.deepEqual(bottone86({ review: r1, db: f.db }, { spunte: { c: false }, apertura }).daRiscrivere, [{ id: 'N', issueIds: ['c'], motivo: 'nodo_svuotato', resta: ritocco }], ritocco);
  }
  // con la spunta tolta da un gesto del docente su una nota localizzata, la frase corretta di una parola è il testo scritto
  // (D38.1: «resta quella scritta»); scritta da capo, lo stesso
  for (const scritta of ['Le banche svizzere custodivano oro tedesco.', 'I depositi erano di privati.']) {
    const r1 = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: scritta }));
    assert.equal(adesso86(applica86(r1, bottone86({ review: r1, db: f.db }, { spunte: { c: false }, apertura })), f.db), scritta);
  }
  // una riscrittura salvata in una seduta di prima, ritoccata adesso togliendo il punto finale: non basta
  const g = base86(), scritto = 'Le frontiere restarono sbarrate. Gli scambi proseguirono.';
  const prima = applica86(g.review, B.correzioneDelCampo({ review: g.review, db: g.db, bersaglio: NDESC, salvato: scritto }));
  for (const testo of [scritto.replace(/\.$/, ''), scritto.replace('proseguirono.', 'proseguirono!'), 'Le dogane restarono aperte. Gli scambi proseguirono.']) {
    assert.deepEqual(uscite86({ review: prima, db: g.db }, ['n0'], { testo, apertura: { N: scritto } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera'], testo);
  }
  // ADR 0012 rev. 15 (packet 0089): sulla nota intera la soglia di contenimento è spenta — una parola in più è una
  // riscrittura del docente (prima era «una correzione, non una riscrittura», D40.2 con `stretto`)
  for (const testo of ['Le frontiere restarono sempre sbarrate. Gli scambi proseguirono a lungo.']) {
    assert.deepEqual(uscite86({ review: prima, db: g.db }, ['n0'], { testo, apertura: { N: scritto } }).daRiscrivere, [], testo);
  }
  const una = rev86(N86(S86[0]), [nota86('n0', 'N', 'Il nodo semplifica troppo')]);
  assert.deepEqual(uscite86(una, ['n0'], { testo: 'Il confine fu chiuso solo nel 1942.', apertura: { N: S86[0] } }).daRiscrivere, []);
  // riscritta davvero (la quarantena non vi ritrova nessuna frase generata né dell'apertura): il bottone si accende
  assert.deepEqual(uscite86({ review: prima, db: g.db }, ['n0'], { testo: 'Le dogane restarono aperte. I mercati ripresero.', apertura: { N: scritto } }).daRiscrivere, []);
  assert.deepEqual(uscite86(una, ['n0'], { testo: 'Le dogane restarono aperte.', apertura: { N: S86[0] } }).daRiscrivere, []);
});

/* ── difetto 4 (revisore D4): L3, D37.7 tocca solo le scelte che si contraddicono ── */
test('0086 g3a bis L3 D37.7 tocca solo le scelte salvate che si contraddicono: la «Proposta scelta» di p3 resta, e il campo riparte dal testo che dà', () => {
  const P3 = T86.replace(S86[0], 'Il confine fu presidiato nel 1942.');
  const f = rev86(N86(), [nota86('p3', 'N', 'Il confine non fu chiuso nel 1942.', { after: P3 }),
    nota86('p1', 'N', 'Respingimenti solo in parte.', { after: T86.replace(S86[3], 'I profughi furono accolti solo in parte.') }),
    nota86('p2', 'N', 'Respingimenti frequenti.', { after: T86.replace(S86[3], 'I profughi furono spesso respinti.') })]);
  let r = f.review;
  ['p3', 'p1', 'p2'].forEach(id => { r = R.setDecision(r, id, 'accept', {}); });
  assert.deepEqual(spunte86({ review: r, db: f.db }).note.map(n => [n.id, n.conflitto]), [['p1', true], ['p2', true]]);
  const e = bottone86({ review: r, db: f.db });
  assert.deepEqual(scelte86(e), [['p1', 'reject'], ['p2', 'reject']], 'p3 non si tocca');
  const r1 = applica86(r, e);
  assert.equal(adesso86(r1, f.db), P3, 'resta la scelta di p3: la sua frase contestata non entra');
  assert.deepEqual(['p3', 'p1', 'p2'].map(id => outcome(r1, id)), ['applied', 'kept', 'kept']);
  assert.deepEqual(conflitti86(r1, f.db), []);
  // il testo da cui riparte il campo, per la veste
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: NDESC }).adesso, T86, 'senza opzione resta quello di oggi (veste spenta)');
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: NDESC, senzaConflitti: true }).adesso, P3);
  // la spunta tolta su p1 (legata a p2, D37.3): esce la frase di p1 dal testo che dà p3, e la scelta di p3 resta nel testo
  const e2 = bottone86({ review: r, db: f.db }, { spunte: { p1: false } });
  const r2 = applica86(r, e2);
  assert.equal(adesso86(r2, f.db), P3.replace(' ' + S86[3], ''));
  assert.deepEqual(conflitti86(r2, f.db), []);
  // due scelte salvate che non confliggono e si compongono (p3 sulla prima frase, p4 sulla seconda): restano «Proposta scelta»
  const P4 = T86.replace(S86[1], 'Le banche custodivano poco oro.');
  const g = rev86(N86(), [nota86('p3', 'N', 'x', { after: P3 }), nota86('p4', 'N', 'y', { after: P4 }),
    nota86('p1', 'N', 'Respingimenti solo in parte.', { after: T86.replace(S86[3], 'I profughi furono accolti solo in parte.') }),
    nota86('p2', 'N', 'Respingimenti frequenti.', { after: T86.replace(S86[3], 'I profughi furono spesso respinti.') })]);
  let rg = g.review;
  ['p3', 'p4', 'p1', 'p2'].forEach(id => { rg = R.setDecision(rg, id, 'accept', {}); });
  const eg = bottone86({ review: rg, db: g.db });
  assert.deepEqual(scelte86(eg), [['p1', 'reject'], ['p2', 'reject']], 'p3 e p4 non si toccano');
  const rg1 = applica86(rg, eg);
  assert.deepEqual(['p3', 'p4'].map(id => outcome(rg1, id)), ['applied', 'applied']);
  assert.equal(adesso86(rg1, g.db), ['Il confine fu presidiato nel 1942.', 'Le banche custodivano poco oro.', S86[2], S86[3]].join(' '));
});

/* ── difetto 6 (revisore D6): collegamento, la spunta piena non riceve `accept` ── */
test('0086 g3a bis collegamento: la nota «toglilo» con la spunta piena non riceve `accept` quando un\'altra spunta della riga è tolta; il collegamento lo toglie un\'esclusione del docente', () => {
  const f = link86(), riga = B.righeMappa(f.review, f.db).collegamenti[0];
  const LR = { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' };
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga, spunte: { l1: true, l2: false } });
  assert.deepEqual(e.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.target.field, c.issue.origin] : [c.issueId, c.choice]),
    [['addIssue', '$link', 'teacher'], [e.chiamate[0].issue.id, 'accept'], ['l1', 'reject'], ['l2', 'reject']]);
  const r = applica86(f.review, e);
  assert.equal(B.testoAdesso(null, r, { db: f.db, bersaglio: LR }).escluso, true);
  assert.deepEqual(conflitti86(r, f.db), []);
});

/* ── difetto 7 (revisore D7): l'elemento già tolto o escluso dal docente — si rispetta, nessun errore ── */
test('0086 g3a bis collegamento già tolto e materiale già escluso dal docente: il bottone rispetta la scelta salvata, senza errori', () => {
  const g = link86([], true);
  let r = R.addIssue(g.review, { target: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: '$link' }, after: null, origin: 'teacher', blocking: true, problem: 'Tolto dal docente' });
  r = R.setDecision(r, docenti(r)[0].id, 'accept', {});
  const riga = B.righeMappa(r, g.db).collegamenti[0];
  const e = B.chiamateBottone({ review: r, db: g.db, riga });
  assert.deepEqual(scelte86(e), [['l2', 'reject']]);
  const r1 = applica86(r, e);
  assert.equal(B.testoAdesso(null, r1, { db: g.db, bersaglio: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' } }).escluso, true);
  assert.equal(outcome(r1, docenti(r)[0].id), 'excluded');
  const m = g2(materiali86()), mc1 = { kind: 'item', id: 'mc1' };
  const esc = R.setItemExcluded(m.review, 'mc1', true, {});
  for (const spunte of [{}, { 'i-mc1-q': false }]) {
    const e2 = B.chiamateBottone({ review: esc, db: m.db, riga: mc1, spunte });
    assert.ok(Array.isArray(e2.chiamate), JSON.stringify(e2));
    assert.equal(e2.chiamate.some(c => c.chiamata === 'addIssue'), false, 'nessuna esclusione in più');
    assert.equal(B.righeMateriali(applica86(esc, e2), {}).righe.find(x => x.id === 'mc1').stato, 'escluso');
  }
});

/* ── difetto 8 (revisore D8): il bottone di una riga non tocca le scelte in conflitto di un altro nodo ── */
test('0086 g3a bis D37.7 vale solo per la riga del bottone: una quasi-copia in un nodo con scelte salvate in conflitto non lo riapre; il bottone non scrive e dice quale nodo', () => {
  const MD = 'Le banche custodivano oro tedesco. Il resto è storia. La guerra finì nel 1945.';
  const f = rev86(N86().concat([{ id: 'M', label: 'Memoria', desc: MD }]), [cita86('c', 'Le banche custodivano oro tedesco'),
    nota86('m1', 'M', 'Data sbagliata.', { after: MD.replace('1945', '1946') }), nota86('m2', 'M', 'Data imprecisa.', { after: MD.replace('1945', '1944') })]);
  const r = R.setDecision(R.setDecision(f.review, 'm1', 'accept', {}), 'm2', 'accept', {});
  const e = bottone86({ review: r, db: f.db }, { spunte: { c: false } });
  assert.equal(e.errore, 'punto_non_ritrovato');
  assert.equal(e.nodo, 'M');
  assert.equal(e.chiamate, undefined, 'nessuna chiamata: le scelte di M non tornano in sospeso');
  assert.deepEqual(B.usciteSpunteTolte({ review: r, db: f.db, riga: 'N', tolte: ['c'] }), { errore: 'punto_non_ritrovato', issueId: 'c', nodo: 'M' });
  // con la spunta piena il bottone scrive solo la riga N
  const e2 = bottone86({ review: r, db: f.db });
  assert.deepEqual(scelte86(e2), [['c', 'reject']]);
  assert.deepEqual(['m1', 'm2'].map(id => outcome(applica86(r, e2), id)), ['applied', 'applied']);
});

/* ── difetti 9 e 10 (verificatore §4.1 e §4.2): G2 ── */
test('0086 g3a bis G2 D37.7 con una nota su un campo: le due $item in conflitto e la nota del campo prendono la decisione nuova, senza `conflitto_da_sciogliere`', () => {
  const f = g2(rapportoMateriali()), item = f.db.items.find(i => i.id === 'mc1'), mc1 = { kind: 'item', id: 'mc1' };
  let r = R.addIssue(R.addIssue(f.review, { id: 'x1', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Uno.' }), problem: 'a' }),
    { id: 'x2', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Due.' }), problem: 'b' });
  r = R.setDecision(R.setDecision(r, 'x1', 'accept', {}), 'x2', 'accept', {});
  assert.deepEqual(spunte86({ review: r, db: f.db }, mc1).note.map(n => [n.id, n.conflitto]), [['i-mc1-q', false], ['x1', true], ['x2', true]]);
  const e = B.chiamateBottone({ review: r, db: f.db, riga: mc1 });
  assert.deepEqual(scelte86(e), [['i-mc1-q', 'reject'], ['x1', 'reject'], ['x2', 'reject']]);
  const r1 = applica86(r, e);
  assert.deepEqual(R.preview(r1, f.db).conflicts.filter(c => c.code === 'conflicting_decisions'), []);
  assert.deepEqual(B.testoAdesso(null, r1, { db: f.db, bersaglio: { kind: 'item', id: 'mc1', field: '$item' } }).adesso, item);
});

test('0086 g3a bis G2 la proposta di una nota $item copiata nei campi, con anche una nota su un campo: «Proposta scelta» e niente `conflicting_decisions`; la correzione del docente non serve più', () => {
  const f = g2(rapportoMateriali()), item = f.db.items.find(i => i.id === 'mc1'), mc1 = { kind: 'item', id: 'mc1' };
  const x3 = { id: 'x3', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Furono le banche svizzere.' }), problem: 'Spiega meglio.' };
  for (const conNota of [true, false]) {
    const rep = rapportoMateriali();
    if (!conNota) rep.issues = rep.issues.filter(i => i.id !== 'i-mc1-q');
    rep.issues.push(clone(x3));
    const s = g2(rep);
    const rs = applica86(s.review, B.correzioneDelCampo({ review: s.review, db: s.db, bersaglio: { kind: 'item', id: 'mc1', field: 'explanation' }, salvato: 'Furono le banche svizzere.' }));
    const e = B.chiamateBottone({ review: rs, db: s.db, riga: mc1 });
    assert.ok(Array.isArray(e.chiamate), JSON.stringify(e));
    assert.deepEqual(scelte86(e).filter(([id]) => id === 'x3'), [['x3', 'accept']]);
    const r1 = applica86(rs, e);
    assert.deepEqual(R.preview(r1, s.db).conflicts.filter(c => c.code === 'conflicting_decisions'), [], 'con la nota sul campo: ' + conNota);
    assert.equal(outcome(r1, 'x3'), 'applied');
    assert.equal(B.testoAdesso(null, r1, { db: s.db, bersaglio: { kind: 'item', id: 'mc1', field: 'explanation' } }).adesso, 'Furono le banche svizzere.');
    if (conNota) assert.equal(outcome(r1, 'i-mc1-q'), 'kept');
  }
});

/* ── difetto 11 (verificatore §4.3): la descrizione vuota o di soli spazi va scritta (D38.1) ── */
test('0086 g3a bis D38.1 un campo vuoto o di soli spazi non è una descrizione scritta: «da riscrivere», mai `invalid_replacement`', () => {
  const f = base86();
  for (const testo of ['', '   ', '\n']) {
    assert.deepEqual(uscite86(f, ['n0'], { testo, apertura: { N: T86 } }).daRiscrivere, [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera' }], JSON.stringify(testo));
    assert.deepEqual(bottone86(f, { campi: { desc: testo }, apertura: { N: T86 } }).daRiscrivere, [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera' }]);
  }
  // con una nota localizzata tolta: il nodo resterebbe vuoto
  assert.deepEqual(uscite86(due86(), ['s1'], { testo: '' }), { nodi: [], daRiscrivere: [{ id: 'N', issueIds: ['s1'], motivo: 'nodo_svuotato' }] });
  // con tutte le spunte piene e il campo vuoto: il bottone non registra una descrizione vuota, dice di scriverla
  assert.deepEqual(bottone86(due86(), { campi: { desc: '  ' } }), { chiamate: [], togli: [], daRiscrivere: [{ id: 'N', issueIds: [], motivo: 'nodo_svuotato' }] });
});

/* ═══ 0086, giro 3a bis: dai test candidati della verifica di mutazioni (`mut0086-g3a/buchi-test.candidato.js`) ═══
   Portati solo quelli che proteggono le tre cose di Giacomo (nessuna frase contestata entra senza un gesto; le correzioni
   del docente entrano e non si perdono; niente esce o cambia in silenzio altrove, compreso il conto dell'avviso). Fra
   parentesi quadre le mutazioni del verificatore che fanno rosse. U16 è assorbito nel test del difetto 11 (adattato: il
   campo svuotato è «da riscrivere», non `punto_non_ritrovato`); G02 è adattato (con una nota sul campo il bottone dava
   `conflicting_decisions`: ora «Proposta scelta» senza conflitti, verificato sul risultato). I lasciati fuori, con la
   ragione, sono nel rapporto del giro. */
test('0086 g3a VERIFICA §4.1 `frasi` della spunta = le frasi della quarantena, non i pezzi: c3fd3 (un pezzo, tre frasi) dice 3 — «Tieni le 3 frasi» [S14]', () => {
  const raz = rev86([SV86.RAZ], sv86('ec3fd3'));
  assert.deepEqual(B.spunteDellaRiga({ review: raz.review, db: raz.db, riga: 'L1_2_L2_B' }).note.map(n => n.frasi), [3]);
});

test('0086 g3a VERIFICA §4.1 L5 una nota intera e una nota sull\'unica frase del nodo hanno le stesse frasi: un gruppo, che parte vuoto [S15 S19 S20]', () => {
  const s = spunte86(rev86(N86(S86[1]), [nota86('n0', 'N', 'Il nodo semplifica troppo'), cita86('p', 'Le banche custodivano oro tedesco')]));
  assert.deepEqual(s.gruppi, [['n0', 'p']]);
  assert.deepEqual(s.note.map(n => [n.id, n.gruppo, n.piena, n.intero]), [['n0', 'n0', false, true], ['p', 'n0', false, false]]);
});

test('0086 g3a VERIFICA §4.5 la quasi-copia ripetuta due volte in un altro nodo esce tutte e due le volte [U17]', () => {
  const M = { id: 'M', label: 'Memoria', desc: S86[1] + ' Il resto è storia. ' + S86[1] };
  assert.equal(dopo86(uscite86(rev86(N86().concat([M]), [cita86('c', 'Le banche custodivano oro tedesco')]), ['c']), 'M'), 'Il resto è storia.');
});

test('0086 g3a VERIFICA §4.5 uno spazio doppio dentro la frase contestata nel campo: la frase si ritrova ed esce [U18]', () => {
  const u = uscite86(rev86(N86(), [cita86('c', 'Le banche custodivano oro tedesco')]), ['c'], { testo: T86.replace('Le banche custodivano', 'Le  banche custodivano') });
  assert.equal(dopo86(u), [S86[0], S86[2], S86[3]].join(' '));
});

test('0086 g3a VERIFICA §4.5 passi sovrapposti in parte (A su S1, B su S0 S1): tolta solo B, la quasi-copia di S1 esce anche dall\'altro nodo [U22]', () => {
  const M = { id: 'M', label: 'Memoria', desc: S86[1] + ' Il resto è storia.' };
  const f = rev86(N86().concat([M]), [cita86('a', 'Le banche custodivano oro tedesco'), cita86('b', 'chiuso nel 1942. Le banche custodivano')]);
  const u = uscite86(f, ['b']);
  assert.equal(dopo86(u), [S86[2], S86[3]].join(' '));
  assert.equal(dopo86(u, 'M'), 'Il resto è storia.');
});

test('0086 g3a VERIFICA §4.5 D37.2 la frase contestata già tolta dal docente: nessuna uscita e nessun errore, anche se le frasi vicine sono cambiate (maiuscole, tolte) [P03 P04]', () => {
  const [a, , , d] = S86;
  const f = rev86(N86(), [cita86('x', 'Le banche custodivano oro tedesco')]);
  for (const testo of [[a, 'IL COMMERCIO con la Germania continuò fino al 1944.', d].join(' '), [a, d].join(' ')]) {
    assert.equal(dopo86(uscite86(f, ['x'], { testo })), testo, testo);
  }
});

test('0086 g3a VERIFICA D40 la riscrittura di una seduta di prima con spazi in più non è una riscrittura di adesso [W03]', () => {
  const f = base86(), scritto = 'La Svizzera chiuse il confine nel 1942. Il commercio continuò.';
  const prima = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: scritto }));
  for (const testo of [scritto + '  ', scritto.replace('. ', '.  ')]) {
    assert.deepEqual(uscite86({ review: prima, db: f.db }, ['n0'], { testo, apertura: { N: scritto } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  }
});

test('0086 g3a VERIFICA D40 una proposta del controllo che riscrive tutta la descrizione, copiata nel campo, non è un testo del docente [W08]', () => {
  const nuova = 'La Svizzera chiuse le frontiere nel 1942. Le banche accettarono oro dalla Germania.';
  const f = rev86(N86(), [nota86('n0', 'N', 'Il nodo semplifica troppo'), nota86('p', 'N', 'Riscrivi tutto.', { after: nuova })]);
  assert.deepEqual(uscite86(f, ['n0'], { testo: nuova, apertura: { N: T86 } }).daRiscrivere.map(x => x.motivo), ['descrizione_intera']);
  assert.deepEqual(bottone86(f, { campi: { desc: nuova }, apertura: { N: T86 } }).chiamate, []);
});

test('0086 g3a VERIFICA §4.3/§4.4 la proposta nel campo con spazi in più È la proposta: il bottone la sceglie, il salvataggio la registra esatta [K07 R16]', () => {
  const proposta = T86.replace(S86[3], 'I profughi furono accolti solo in parte.');
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('p', 'N', 'Respingimenti solo in parte.', { after: proposta })]);
  const e = bottone86(f, { campi: { desc: proposta + ' ' } });
  assert.deepEqual(scelte86(e), [['s1', 'reject'], ['p', 'accept']]);
  assert.equal(e.chiamate.length, 2);
  const c = B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: proposta + '  ' });
  assert.deepEqual(c.chiamate.filter(x => x.chiamata === 'setDecision').map(x => x.opts.text), [proposta]);
});

test('0086 g3a VERIFICA §4.5 ogni nodo toccato da una quasi-copia riceve una correzione del docente, anche se ha una nota già decisa; nessun conflitto [K11]', () => {
  const M = { id: 'M', label: 'Memoria', desc: S86[1] + ' Il resto è storia.' };
  const f = rev86(N86().concat([M]), [cita86('c', 'Le banche custodivano oro tedesco'), nota86('m1', 'M', 'Storia vaga.', { after: S86[1] + ' Il resto è cronaca.' })]);
  const r = R.setDecision(f.review, 'm1', 'accept', {});
  const e = bottone86({ review: r, db: f.db }, { spunte: { c: false } });
  assert.deepEqual(e.chiamate.filter(c => c.chiamata === 'addIssue').map(c => [c.issue.target.id, c.issue.origin]), [['M', 'teacher']]);
  assert.deepEqual(conflitti86(applica86(r, e), f.db), []);
});

test('0086 g3a VERIFICA §4.4 D37.4 + D37.7 due note sul titolo scelte prima e in conflitto: il bottone le chiude [K12]', () => {
  const f = rev86(N86(), [cita86('s1', 'Il confine fu chiuso nel 1942'), titolo86('t1', { after: 'Neutralità svizzera' }), titolo86('t2', { after: 'Neutralità armata' })]);
  const r = R.setDecision(R.setDecision(f.review, 't1', 'accept', {}), 't2', 'accept', {});
  const e = bottone86({ review: r, db: f.db });
  assert.deepEqual(scelte86(e), [['s1', 'reject'], ['t1', 'reject'], ['t2', 'reject']]);
  assert.deepEqual(conflitti86(applica86(r, e), f.db), []);
});

test('0086 g3a VERIFICA §4.4 il titolo scritto nel campo senza note sul titolo si registra col bottone [K16]', () => {
  const f = due86();
  const e = bottone86(f, { campi: { label: 'Neutralità armata' } });
  assert.equal(adesso86(applica86(f.review, e), f.db, 'N', 'label'), 'Neutralità armata');
});

test('0086 g3a VERIFICA §4.3/§4.4 due proposte scelte e composte: il bottone e il salvataggio non riscrivono la scelta che dà già il testo [K18 R07]', () => {
  const pa = T86.replace(S86[0], 'Il confine restò aperto.'), pb = T86.replace(S86[3], 'I profughi furono accolti.');
  const f = rev86(N86(), [nota86('pa', 'N', 'x', { after: pa }), nota86('pb', 'N', 'y', { after: pb }), cita86('s2', 'Le banche custodivano oro tedesco')]);
  const r = R.setDecision(R.setDecision(f.review, 'pa', 'accept', {}), 'pb', 'accept', {});
  assert.deepEqual(scelte86(bottone86({ review: r, db: f.db })), [['s2', 'reject']]);
  const c = B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: pa });
  assert.deepEqual(scelte86(c).filter(([id]) => id === 'pa' || id === 'pb'), [['pb', 'manual']]);
});

test('0086 g3a VERIFICA §4.4 collegamento tolto: si riusa l\'esclusione del docente che c\'è già; le parole scelte prima si rifiutano; con due collegamenti fra gli stessi nodi si toglie quello della riga [L05 L07 L09]', () => {
  const g = link86([], true), riga = B.righeMappa(g.review, g.db).collegamenti[0];
  let r = R.addIssue(g.review, { id: 'tx', target: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: '$link' }, after: null, origin: 'teacher', blocking: true, problem: 'Togli' });
  r = R.setDecision(r, 'tx', 'reject', {});
  const e = B.chiamateBottone({ review: r, db: g.db, riga, spunte: { l2: false } });
  assert.deepEqual(e.chiamate.map(c => c.chiamata === 'addIssue' ? 'addIssue' : [c.issueId, c.choice]), [['tx', 'accept'], ['l2', 'reject']]);
  const f = link86(), rf = R.setDecision(f.review, 'l2', 'accept', {});
  const e2 = B.chiamateBottone({ review: rf, db: f.db, riga: B.righeMappa(rf, f.db).collegamenti[0], spunte: { l1: false } });
  assert.deepEqual(scelte86(e2), [['l1', 'accept'], ['l2', 'reject']]);
  assert.deepEqual(conflitti86(applica86(rf, e2), f.db), []);
  const db = { nodes: N86().concat([M86]).map(n => Object.assign({ level: 1, group: 1 }, n)), links: [{ source: 'N', target: 'M', rel: 'causa' }, { source: 'N', target: 'M', rel: 'precede' }] };
  const review = R.createReview({ db, sources: SOURCES, report: { contratto: 'mappai-giudice@2', stato: 'parziale', copertura: { nodiEsaminati: ['N', 'M'], nodiSaltati: [] },
    issues: [{ id: 'l2', target: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' }, after: 'determina', problem: 'Verbo sbagliato.' }] } });
  const e3 = B.chiamateBottone({ review, db, riga: B.righeMappa(review, db).collegamenti.find(x => x.rel === 'causa'), spunte: { l2: false } });
  const r3 = applica86(review, e3);
  assert.equal(B.testoAdesso(null, r3, { db, bersaglio: { kind: 'link', source: 'N', target: 'M', rel: 'causa', field: 'rel' } }).escluso, true);
  assert.equal(B.testoAdesso(null, r3, { db, bersaglio: { kind: 'link', source: 'N', target: 'M', rel: 'precede', field: 'rel' } }).escluso, false);
});

test('0086 g3a VERIFICA §4.4 G2: tutte piene senza `campi`; un campo scritto senza note; la nota $item la cui proposta è già nei campi = «Proposta scelta», senza conflitti [G06 G07 G02, adattato]', () => {
  const f = g2(materiali86()), mc1 = { kind: 'item', id: 'mc1' };
  assert.deepEqual(scelte86(B.chiamateBottone({ review: f.review, db: f.db, riga: mc1 })), [['i-mc1-q', 'reject'], ['i-mc1-x', 'reject']]);
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga: mc1, campi: { explanation: 'Le banche, non lo Stato.' } });
  assert.equal(B.testoAdesso(null, applica86(f.review, e), { db: f.db, bersaglio: { kind: 'item', id: 'mc1', field: 'explanation' } }).adesso, 'Le banche, non lo Stato.');
  const item = f.db.items.find(i => i.id === 'mc1');
  const s = g2({ stato: 'parziale', issues: [{ id: 'x3', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Furono le banche svizzere.' }), problem: 'Spiega meglio.' }] });
  const rs = applica86(s.review, B.correzioneDelCampo({ review: s.review, db: s.db, bersaglio: { kind: 'item', id: 'mc1', field: 'explanation' }, salvato: 'Furono le banche svizzere.' }));
  const e3 = B.chiamateBottone({ review: rs, db: s.db, riga: mc1 });
  assert.deepEqual(scelte86(e3), [['x3', 'accept']]);
  assert.deepEqual(conflitti86(applica86(rs, e3), s.db), [], 'adattato: il giro 3a lasciava la correzione del docente accanto alla $item (conflitto)');
});

test('0086 g3a VERIFICA §4.4 G2: con una decisione $item attiva la nota del campo non si accetta (la correzione va nel materiale intero) [G03]', () => {
  const f = g2(rapportoMateriali()), item = f.db.items.find(i => i.id === 'mc1');
  let r = R.addIssue(f.review, { id: 'xa', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Furono le banche svizzere.' }), problem: 'Spiega meglio.' });
  r = R.setDecision(r, 'xa', 'accept', {});
  const e = B.chiamateBottone({ review: r, db: f.db, riga: { kind: 'item', id: 'mc1' }, campi: { question: 'Chi venne accusato?' } });
  assert.deepEqual(scelte86(e), [['xa', 'manual'], ['i-mc1-q', 'reject']]);
});

test('0086 g3a VERIFICA §4.4 G2 D37.7: due $item in conflitto, tolta una, la nota piena del campo prende la sua proposta [G01 K21]', () => {
  const f = g2(rapportoMateriali()), item = f.db.items.find(i => i.id === 'mc1');
  let r = R.addIssue(R.addIssue(f.review, { id: 'x1', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Uno.' }), problem: 'a' }),
    { id: 'x2', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Due.' }), problem: 'b' });
  r = R.setDecision(R.setDecision(r, 'x1', 'accept', {}), 'x2', 'accept', {});
  const e = B.chiamateBottone({ review: r, db: f.db, riga: { kind: 'item', id: 'mc1' }, spunte: { x1: false }, campi: { question: 'Chi venne accusato?' } });
  assert.deepEqual(scelte86(e), [['teacher-exclude-mc1', 'accept'], ['i-mc1-q', 'accept'], ['x2', 'reject']]);
});

test('0086 g3a VERIFICA §4.4 G2 D8: la nota d\'esclusione tolta con un\'altra nota (o un\'altra decisione attiva) = l\'esclusione del docente; quella che c\'è già si riusa; un materiale già escluso non riceve niente [G09 G10 G12 G15]', () => {
  const f = g2(materiali86()), mc1 = { kind: 'item', id: 'mc1' };
  const e = B.chiamateBottone({ review: f.review, db: f.db, riga: mc1, spunte: { 'i-mc1-x': false } });
  assert.deepEqual(e.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.id] : [c.issueId, c.choice]),
    [['addIssue', 'teacher-exclude-mc1'], ['teacher-exclude-mc1', 'accept'], ['i-mc1-q', 'reject']]);
  const sola = g2({ stato: 'parziale', issues: [{ id: 'x2', target: { kind: 'item', id: 'mc2', field: '$item' }, after: null, problem: 'Fuori fonte.' }] }), mc2 = { kind: 'item', id: 'mc2' };
  const corr = applica86(sola.review, B.correzioneDelCampo({ review: sola.review, db: sola.db, bersaglio: { kind: 'item', id: 'mc2', field: 'explanation' }, salvato: 'I depositi d’oro.' }));
  const e2 = B.chiamateBottone({ review: corr, db: sola.db, riga: mc2, spunte: { x2: false } });
  assert.deepEqual(e2.chiamate.map(c => c.chiamata === 'addIssue' ? ['addIssue', c.issue.id] : [c.issueId, c.choice]), [['addIssue', 'teacher-exclude-mc2'], ['teacher-exclude-mc2', 'accept']]);
  let r = applica86(f.review, B.chiamateBottone({ review: f.review, db: f.db, riga: mc1, spunte: { 'i-mc1-q': false } }));
  r = R.setDecision(R.setDecision(R.setDecision(r, 'teacher-exclude-mc1', 'reject', {}), 'i-mc1-x', 'pending', {}), 'i-mc1-q', 'pending', {});
  const e3 = B.chiamateBottone({ review: r, db: f.db, riga: mc1, spunte: { 'i-mc1-q': false } });
  assert.deepEqual(e3.chiamate.map(c => c.chiamata === 'addIssue' ? 'addIssue' : [c.issueId, c.choice]), [['teacher-exclude-mc1', 'accept'], ['i-mc1-x', 'reject']]);
  let x = R.addIssue(sola.review, { id: 'teacher-exclude-mc2', target: { kind: 'item', id: 'mc2', field: '$item' }, after: null, origin: 'teacher', problem: '' });
  x = R.setDecision(x, 'teacher-exclude-mc2', 'accept', {});
  assert.deepEqual(B.chiamateBottone({ review: x, db: sola.db, riga: mc2, spunte: { x2: false } }), { chiamate: [], togli: [] });
});

test('0086 g3a VERIFICA §4.3 tornato all\'Originale: la richiesta del docente aperta resta aperta; una nota «tenuta» (reject) non segue il testo; la correzione del docente è bloccante [R03 R04 R13]', () => {
  const f = due86();
  let r = applica86(f.review, B.correzioneDelCampo({ review: f.review, db: f.db, bersaglio: NDESC, salvato: T86 + ' Frase aggiunta.' }));
  r = R.addIssue(r, { target: { kind: 'node', id: 'N', field: 'desc' }, origin: 'teacher', blocking: true, problem: 'Riscrivi la frase sui profughi' });
  const e = B.correzioneDelCampo({ review: r, db: f.db, bersaglio: NDESC, salvato: T86 });
  assert.deepEqual(e.chiamate, []);
  assert.equal(e.togli.length, 1);
  const k = R.setDecision(f.review, 's3', 'reject', {});
  const c = B.correzioneDelCampo({ review: k, db: f.db, bersaglio: NDESC, salvato: T86 + ' Frase aggiunta.' });
  assert.deepEqual(scelte86(c).filter(([id]) => id === 's3'), []);
  assert.equal(c.chiamate[0].issue.blocking, true);
});

test('0086 g3a VERIFICA §4.3 G2: la correzione di un campo con una decisione $item attiva va nel materiale intero (regola 3) [R14]', () => {
  const f = g2(rapportoMateriali()), item = f.db.items.find(i => i.id === 'mc1');
  let r = R.addIssue(f.review, { id: 'xa', target: { kind: 'item', id: 'mc1', field: '$item' }, after: Object.assign({}, item, { explanation: 'Furono le banche svizzere.' }), problem: 'Spiega meglio.' });
  r = R.setDecision(r, 'xa', 'accept', {});
  assert.deepEqual(scelte86(B.correzioneDelCampo({ review: r, db: f.db, bersaglio: { kind: 'item', id: 'mc1', field: 'question' }, salvato: 'Chi fu davvero accusato?' })), [['xa', 'manual']]);
});

test('0086 g3a VERIFICA §4.6 il conto nella forma della quarantena: la stessa frase con le maiuscole cambiate conta una volta — l\'avviso che il docente legge [Q04]', () => {
  const f = rev86(N86('Le banche custodivano oro. LE BANCHE CUSTODIVANO ORO. Il resto è storia.'),
    [nota86('x', 'N', 'La frase «Le banche custodivano oro» e la frase «LE BANCHE CUSTODIVANO ORO» non sono nella fonte.')]);
  assert.deepEqual(B.frasiContestate([issue86(f.review, 'x')]), { n: 1, intero: false });
  assert.deepEqual(spunte86(f).note.map(n => n.frasi), [1]);
});


/* ═══ 0086, giro 3c (09/10): due punti del giro 3c che il core del giro 3a bis non registrava ═══
   - L6 (§0 del packet, Giacomo: ««Un solo bottone in fondo»»): una richiesta del docente aperta sulla scheda delle note del
     controllo non ha bottoni; il bottone in fondo la chiude insieme alle note col testo che resta nel campo («Testo
     modificato da te», o «Testo mantenuto senza modifiche» col testo di partenza). Prima il bottone non la toccava
     (`opz.bottone`), e la richiesta restava aperta senza un gesto che la chiudesse.
   - D37.7 in G2 (L3): due correzioni del docente salvate prima che si contraddicono sul materiale (la risposta e tutto il
     materiale) — il bottone le sostituisce col materiale come sta nei campi (ripartiti dalle scelte senza conflitto), come
     fa `registraCampo` in G1 con quelle sullo stesso campo. Prima il bottone dava `conflicting_decisions`: un vicolo cieco
     senza «Togli questa scelta». */
const richiesta86 = (r, field, nodo) => R.addIssue(r, { target: { kind: 'node', id: nodo || 'N', field: field || 'desc' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: ' + (nodo || 'N') });
const idRichiesta86 = r => docenti(r).find(i => !i.hasProposal && R.decisionOutcome(i, r.initial.decisions[i.id]) === 'pending').id;

test('0086 g3c L6 il bottone in fondo chiude la richiesta del docente aperta col testo che resta nel campo: l\'Originale («Testo mantenuto senza modifiche»), la tua versione, il testo dopo il taglio di una spunta tolta', () => {
  const f = due86(), r = richiesta86(f.review), rq = idRichiesta86(r);
  const r1 = applica86(r, bottone86({ review: r, db: f.db }));
  assert.deepEqual(['s1', 's3', rq].map(id => outcome(r1, id)), ['kept', 'kept', 'kept'], 'col campo all\'Originale');
  assert.deepEqual(conflitti86(r1, f.db), []);
  const T = T86 + ' Frase del docente.';
  const r2 = applica86(r, bottone86({ review: r, db: f.db }, { campi: { desc: T } }));
  assert.deepEqual(['s1', 's3', rq].map(id => outcome(r2, id)), ['kept', 'kept', 'edited']);
  assert.equal(adesso86(r2, f.db), T);
  assert.deepEqual(conflitti86(r2, f.db), []);
  const r3 = applica86(r, bottone86({ review: r, db: f.db }, { spunte: { s3: false } }));
  assert.deepEqual(['s1', 's3', rq].map(id => outcome(r3, id)), ['kept', 'edited', 'edited']);
  assert.equal(r3.initial.decisions[rq].text, adesso86(r3, f.db), 'la richiesta ha il testo che resta');
  assert.deepEqual(conflitti86(r3, f.db), []);
});

test('0086 g3c L6 la richiesta del docente sul TITOLO si chiude col titolo del campo, anche se le note del controllo stanno solo sulla descrizione; una riga con la sola richiesta: il bottone la chiude', () => {
  const f = due86(), r = richiesta86(f.review, 'label'), rq = idRichiesta86(r);
  const r1 = applica86(r, bottone86({ review: r, db: f.db }));
  assert.equal(outcome(r1, rq), 'kept');
  const r2 = applica86(r, bottone86({ review: r, db: f.db }, { campi: { label: 'Neutralità armata' } }));
  assert.equal(outcome(r2, rq), 'edited');
  assert.equal(adesso86(r2, f.db, 'N', 'label'), 'Neutralità armata');
  const g = rev86(N86().concat([M86]), [cita86('s1', 'Il confine fu chiuso nel 1942')]), k = richiesta86(g.review, 'desc', 'M'), rk = idRichiesta86(k);
  const e = B.chiamateBottone({ review: k, db: g.db, riga: 'M' });
  assert.deepEqual(scelte86(e), [[rk, 'reject']]);
});

test('0086 g3c D37.7 G2: due correzioni del docente salvate prima che si contraddicono (la risposta e tutto il materiale) — il bottone le sostituisce col materiale come nei campi, senza conflitti; con un campo scritto, il campo', () => {
  const f = g2({ stato: 'completed', issues: [] }), fc1 = f.db.items.find(i => i.id === 'fc1'), riga = { kind: 'item', id: 'fc1' };
  let r = R.addIssue(f.review, { target: { kind: 'item', id: 'fc1', field: 'answer' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: Risposta' });
  const a = docenti(r)[0].id;
  r = R.setDecision(r, a, 'manual', { text: 'Non partecipare alla guerra.' });
  r = R.addIssue(r, { target: { kind: 'item', id: 'fc1', field: '$item' }, origin: 'teacher', blocking: true, problem: 'Modifica del docente: materiale' });
  const b = docenti(r)[1].id;
  r = R.setDecision(r, b, 'manual', { text: Object.assign({}, fc1, { question: 'La neutralità?' }) });
  const prima = B.testoAdesso(null, r, { db: f.db, bersaglio: riga, senzaConflitti: true });
  assert.equal(prima.ok, false, 'le due correzioni si contraddicono');
  const e = B.chiamateBottone({ review: r, db: f.db, riga });
  assert.equal(e.errore, undefined, JSON.stringify(e));
  const r1 = applica86(r, e);
  const dopo = B.testoAdesso(null, r1, { db: f.db, bersaglio: riga });
  assert.equal(dopo.ok, true);
  assert.deepEqual(dopo.adesso, prima.adesso, 'il materiale come lo mostravano i campi');
  const e2 = B.chiamateBottone({ review: r, db: f.db, riga, campi: { answer: 'Restare fuori dalla guerra.' } });
  assert.equal(e2.errore, undefined, JSON.stringify(e2));
  const r2 = applica86(r, e2), d2 = B.testoAdesso(null, r2, { db: f.db, bersaglio: riga });
  assert.equal(d2.ok, true);
  assert.equal(d2.adesso.answer, 'Restare fuori dalla guerra.');
  assert.equal(d2.adesso.question, fc1.question);
  // con una nota del controllo sulla domanda: la nota prende la sua decisione, le correzioni in conflitto si sostituiscono
  let s = R.addIssue(r, { id: 'q1', target: { kind: 'item', id: 'fc1', field: 'question' }, after: 'Che cos’è la neutralità?', problem: 'Forma.' });
  const e3 = B.chiamateBottone({ review: s, db: f.db, riga });
  assert.equal(e3.errore, undefined, JSON.stringify(e3));
  const r3 = applica86(s, e3);
  assert.equal(outcome(r3, 'q1'), 'kept');
  assert.equal(B.testoAdesso(null, r3, { db: f.db, bersaglio: riga }).ok, true);
});

/* ═══ 0086, giro 3d (09/10, dopo la verifica unica del giro 3; D41, D42, D43): il bottone prova prima e avvisa, che cosa
   esce, e la riga del bottone spento che nomina la nota giusta ═══
   «Commercio con i belligeranti» e la sua nota sulla descrizione intera (fd1e8) sono i testi veri della seduta del 27/09:
   appena «Minaccia degli ordigni» cambia (la quasi-copia tagliata da cce1b), fd1e8 ne tiene fuori le due frasi rimaste. */
const C1_86 = { id: 'L1_2_C1', label: 'Commercio con i belligeranti', desc: 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra. Grazie a questa regola, la Svizzera ha potuto vendere merci e armamenti agli stati che combattevano.' };
const FD1E8 = nota86('issue-r1-fd1e85e62967f2e0-1831', 'L1_2_C1', 'La convenzione dell’Aia permette agli stati neutrali il libero commercio con i paesi in guerra, inclusa la vendita di armamenti. Tuttavia, la Svizzera non ha venduto armamenti agli Alleati');
const CCE = NSV86.ecce1b.id, C39 = NSV86.e3926c.id;
const D4_FRASI = Aff.affermazioni(SV86.D4.desc).map(a => a.testo);
const colpiti86 = e => (e.colpiti || []).map(c => [c.id, c.motivo, c.issueIds]);

test('0086 g3d D42 la spunta tolta che svuota un altro nodo nei materiali (cce1b → «Minaccia degli ordigni», che fd1e8 tiene tutta fuori appena cambia): nessuna chiamata, `colpiti` col nodo, il motivo e la nota; rimessa la spunta, le chiamate; senza la nota che lo teneva fuori, le chiamate e `escono`', () => {
  const f = rev86([SV86.L2C, SV86.D4, C1_86], sv86('ecce1b', 'e3926c').concat([clone(FD1E8)]));
  const apertura = aperturaDi(f), prima = clone(f.review);
  const e = bottone86(f, { riga: SV86.L2C.id, spunte: { [CCE]: false, [C39]: true }, apertura });
  assert.deepEqual(e.chiamate, [], 'nessuna chiamata: il bottone resta spento');
  assert.deepEqual(colpiti86(e), [[SV86.D4.id, 'vuoto', [CCE]]]);
  assert.deepEqual(e.colpiti[0].frasi, D4_FRASI.slice(2), 'le due frasi che il taglio non toglie');
  assert.deepEqual(f.review, prima, 'la revisione non cambia');
  const piena = bottone86(f, { riga: SV86.L2C.id, spunte: { [CCE]: true, [C39]: true }, apertura });
  assert.equal(Array.isArray(piena.chiamate) && piena.chiamate.length > 0 && !piena.colpiti, true, 'rimessa la spunta: ' + JSON.stringify(piena).slice(0, 200));
  assert.equal(piena.escono, undefined, 'con le spunte piene niente esce');
  const g = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'));
  const e2 = bottone86(g, { riga: SV86.L2C.id, spunte: { [CCE]: false, [C39]: true }, apertura: aperturaDi(g) });
  assert.equal(Array.isArray(e2.chiamate) && e2.chiamate.length > 0 && !e2.colpiti, true, JSON.stringify(e2).slice(0, 200));
  assert.deepEqual(e2.escono, [{ id: SV86.L2C.id, frasi: ['La Svizzera mise anche esplosivi sotto ponti e gallerie.'] }, { id: SV86.D4.id, frasi: D4_FRASI.slice(0, 2) }]);
});

test('0086 g3d D42 anche il suo nodo: una frase che il taglio non toglie esce dai materiali (copia di una frase contestata in un altro nodo, tenuta fuori appena il nodo cambia) — «frasi»; se restava solo lei, «vuoto»; un nodo che si svuota solo per il taglio non spegne il bottone', () => {
  const X = { id: 'X', label: 'Banche', desc: S86[1] + ' I depositi crebbero in fretta.' };
  const conX = nodo => rev86([nodo, X], [cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('x0', 'X', 'Il nodo semplifica troppo')]);
  const f = conX({ id: 'N', label: 'Neutralità', desc: S86.slice(0, 3).join(' ') });
  const e = bottone86(f, { spunte: { s1: false }, apertura: aperturaDi(f) });
  assert.deepEqual(e.chiamate, []);
  assert.deepEqual(colpiti86(e), [['N', 'frasi', ['s1']]]);
  assert.deepEqual(e.colpiti[0].frasi, [S86[1]]);
  const v = conX({ id: 'N', label: 'Neutralità', desc: S86[0] + ' ' + S86[1] });
  assert.deepEqual(colpiti86(bottone86(v, { spunte: { s1: false }, apertura: aperturaDi(v) })), [['N', 'vuoto', ['s1']]]);
  // il riferimento è lo stesso gesto con la spunta rimessa, non la revisione di partenza: qui, prima del gesto, la nota sulla
  // descrizione intera (n0, aperta) tiene fuori tutto N, ma col gesto (n0 spuntata) e la spunta di s1 rimessa N va ai materiali
  const vi = rev86([{ id: 'N', label: 'Neutralità', desc: S86[0] + ' ' + S86[1] }, X], [cita86('s1', 'Il confine fu chiuso nel 1942'), nota86('n0', 'N', 'Il nodo semplifica troppo'), nota86('x0', 'X', 'Il nodo semplifica troppo')]);
  assert.deepEqual(colpiti86(bottone86(vi, { spunte: { s1: false, n0: true }, apertura: aperturaDi(vi) })), [['N', 'vuoto', ['s1']]]);
  // la copia era già fuori anche con la spunta piena (una nota localizzata la cerca in tutta la mappa): il taglio toglie la
  // sola frase nei materiali e il nodo resta vuoto, ma nessuna frase oltre il taglio esce — il bottone si accende
  const k = rev86([{ id: 'N', label: 'Neutralità', desc: S86[0] + ' ' + S86[1] }, X], [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('x1', 'Le banche custodivano oro tedesco', 'X')]);
  const ek = bottone86(k, { spunte: { s1: false }, apertura: aperturaDi(k) });
  assert.equal(Array.isArray(ek.chiamate) && ek.chiamate.length > 0 && !ek.colpiti, true, JSON.stringify(ek).slice(0, 300));
  assert.deepEqual(ek.escono, [{ id: 'N', frasi: [S86[0]] }]);
});

test('0086 g3d D43 `escono`: le frasi che escono nodo per nodo, il suo per primo, com\'erano scritte (la quasi-copia nell\'altro nodo); niente con le spunte piene; la descrizione riscritta con la nota intera tolta tiene il testo scritto e non ha frasi che escono', () => {
  const Q = { id: 'Q', label: 'Commercio', desc: S86[2] + ' Le esportazioni crebbero.' };
  const f = rev86(N86().concat([Q]), [cita86('s1', 'Il confine fu chiuso nel 1942'), cita86('s3', 'Il commercio con la Germania continuò')]);
  const apertura = aperturaDi(f);
  assert.deepEqual(bottone86(f, { spunte: { s3: false }, apertura }).escono, [{ id: 'N', frasi: [S86[2]] }, { id: 'Q', frasi: [S86[2]] }]);
  assert.deepEqual(bottone86(f, { spunte: { s1: false, s3: false }, apertura }).escono, [{ id: 'N', frasi: [S86[0], S86[2]] }, { id: 'Q', frasi: [S86[2]] }]);
  assert.equal(bottone86(f, { apertura }).escono, undefined);
  const g = rev86(N86(), [nota86('n0', 'N', 'Il nodo semplifica troppo')]);
  const eg = bottone86(g, { campi: { desc: 'Le dogane restarono aperte. I mercati ripresero.' }, apertura: aperturaDi(g) });
  assert.equal(Array.isArray(eg.chiamate) && eg.chiamate.length > 0, true, JSON.stringify(eg).slice(0, 200));
  assert.deepEqual(eg.escono, []);
});

test('0086 g3d punto 4 la riga del bottone spento nomina la nota giusta: con la nota localizzata tolta prima della nota sulla descrizione intera (cce1b e 3926c su «Opere Difensive»), `daRiscrivere` porta la nota intera; col campo vuoto lo stesso', () => {
  const f = rev86([SV86.L2C, SV86.D4], sv86('ecce1b', 'e3926c'));
  const apertura = aperturaDi(f);
  assert.deepEqual(bottone86(f, { riga: SV86.L2C.id, spunte: { [CCE]: false }, apertura }).daRiscrivere, [{ id: SV86.L2C.id, issueIds: [C39], motivo: 'descrizione_intera' }]);
  assert.deepEqual(B.usciteSpunteTolte({ review: f.review, db: f.db, riga: SV86.L2C.id, tolte: [CCE, C39], apertura }).daRiscrivere.map(x => x.issueIds), [[C39]]);
  assert.deepEqual(bottone86(f, { riga: SV86.L2C.id, spunte: { [CCE]: false }, campi: { desc: '' }, apertura }).daRiscrivere, [{ id: SV86.L2C.id, issueIds: [C39], motivo: 'descrizione_intera' }]);
  assert.deepEqual(B.usciteSpunteTolte({ review: f.review, db: f.db, riga: SV86.L2C.id, tolte: [CCE, C39], testo: ' ', apertura }).daRiscrivere, [{ id: SV86.L2C.id, issueIds: [C39], motivo: 'descrizione_intera' }]);
});

test('0086 g3d punto 4 una riscrittura che riprende ancora una frase generata: `resta` dice quale, com\'è scritta nel campo — tale e quale (dalla rev. 15, packet 0089, non più per contenimento: la riscrittura del revisore su «Opere Difensive» passa); senza riscrittura in questa seduta `resta` non c\'è', () => {
  const f = base86(), apertura = { N: T86 };
  const conUna = bottone86(f, { campi: { desc: S86[0] + ' Il docente scrive una frase nuova.' }, apertura });
  assert.deepEqual(conUna.daRiscrivere, [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera', resta: S86[0] }]);
  const g = rev86([SV86.L2C], sv86('e3926c'));
  const RIS = 'Per difendersi la Svizzera costruì il Ridotto nazionale, un insieme di fortezze nascoste nelle Alpi.';
  // ADR 0012 rev. 15 (packet 0089): niente più `resta` per contenimento — la riscrittura del revisore accende il bottone
  assert.equal(bottone86(g, { riga: SV86.L2C.id, campi: { desc: RIS }, apertura: aperturaDi(g) }).daRiscrivere, undefined);
  assert.deepEqual(bottone86(f, { apertura }).daRiscrivere, [{ id: 'N', issueIds: ['n0'], motivo: 'descrizione_intera' }], 'il campo è quello dell’apertura');
  assert.deepEqual(bottone86(f, { campi: { desc: 'Le dogane restarono aperte. I mercati ripresero.' }, apertura }).daRiscrivere, undefined, 'riscritta davvero');
});
