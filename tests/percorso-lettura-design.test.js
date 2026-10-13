'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/js/mappai-percorso-lettura-design');
const R = require('../public/js/mappai-review-core');
const item = (id, question = 'Quale passaggio riascolteresti per controllare il rinvio?') => ({ id, format: 'open', question,
  reference: { scope: 'passages', paragraphIds: ['p1'] }, teacher: { answer: 'Confronta il referente.', evidence: [], criteria: ['Collega indizio ed esito.'] } });
const draft = () => ({ source: { paragraphs: [{ id: 'p1', text: 'Ada aspetta.' }, { id: 'p2', text: 'Bruno torna.' }] }, activities: [item('a'), item('b', 'Che cosa cambia se confronti i due passaggi?')] });
const slot = id => ({ id, strategy: 'Rileggere un rinvio', target: id, action: 'Confronta', expectedEvidence: 'Referente', paragraphIds: ['p1'], anchor: 'Ada', variantOf: '', variantReason: '' });
test('§31: duplicati letterali tra gruppi; spazi innocui, negazioni e nuovi casi distinti', () => {
  const a = item('a'), b = item('b', '  Quale passaggio\n riascolteresti per controllare il rinvio? ');
  assert.deepEqual(D.duplicates([a], [b]), [{ id: 'b', otherId: 'a' }]);
  b.question = 'Quale passaggio NON riascolteresti per controllare il rinvio?'; assert.deepEqual(D.duplicates([a], [b]), []);
  b.question = a.question; b.reference.paragraphIds = ['p2']; assert.deepEqual(D.duplicates([a], [b]), []);
});
test('§31: piano copre ogni ID, ancora la fonte e rende esplicita quantità non sostenibile', () => {
  const d = draft(), selection = { items: [{ id: 'x' }, { id: 'y' }] };
  const plan = { cases: [slot('x')], unavailable: [{ id: 'y', reason: 'Non esiste un altro caso indipendente.' }] };
  assert.equal(D.validatePlan(plan, d, selection).cases.length, 1);
  assert.throws(() => D.unavailable(plan), /1 casi distinti su 2/);
  assert.throws(() => D.validatePlan({ cases: [slot('x')], unavailable: [] }, d, selection), /coverage/);
  assert.throws(() => D.validatePlan({ cases: [{ ...slot('x'), anchor: 'inventato' }, slot('y')], unavailable: [] }, d, selection), /anchor/);
  const variant = { ...slot('y'), variantOf: 'x', variantReason: 'Stesso caso con aiuti ridotti, prova alternativa.' };
  assert.equal(D.validatePlan({ cases: [slot('x'), variant], unavailable: [] }, d, selection).cases[1].variantOf, 'x');
});
test('§31: parafrasi segnalate dal giudice con prove e contratto Banco invariato', () => {
  const d = draft();
  const finding = { id: 'b', relatedId: 'a', kind: 'duplicate', reason: 'Richiedono lo stesso confronto.', quote: d.activities[1].question, relatedQuote: d.activities[0].question };
  const checked = D.validateReview({ checkedIds: ['a', 'b'], findings: [finding], unavailable: [] }, d, ['a', 'b']);
  const db = { items: d.activities.map(a => ({ id: a.id, kind: 'open', question: a.question, guide: a.teacher.answer, criteria: a.teacher.criteria })) };
  const report = { checkStatus: 'completed', issues: D.issues(checked.findings, db) };
  const review = R.createReview({ db, sources: [], report, projectId: 'p', generationId: 'g' });
  assert.equal(review.initial.issues[0].target.field, 'question'); assert.equal(review.initial.issues[0].before, db.items[1].question);
  assert.equal(review.initial.issues[0].hasProposal, false);
  assert.throws(() => D.validateReview({ ...checked, findings: [{ ...finding, quote: 'inesistente' }] }, d, ['a', 'b']), /finding/);
});
test('§31: separare il confronto entro budget copre anche coppie tra gruppi; incompletezza non diventa OK', async () => {
  const d = draft(); d.activities.push(item('c', 'Quale indizio conferma la tua lettura?'), item('d', 'Il dubbio rimane?'));
  const compared = new Set();
  const result = await D.reviewSet(d, { assertCurrent() {}, fits: p => JSON.parse(p.contents[0].parts[0].text).activities.length <= 2,
    async ask(p) { const input = JSON.parse(p.contents[0].parts[0].text), ids = input.activities.map(a => a.id);
      if (ids.length === 2) compared.add(ids.slice().sort().join('-'));
      return { checkedIds: ids, findings: [], unavailable: [] }; } });
  assert.equal(result.status, 'completed'); assert.equal(compared.size, 6);
  const incomplete = await D.reviewSet(d, { assertCurrent() {}, fits: () => true, ask: async () => ({ checkedIds: [], findings: [], unavailable: [] }) });
  assert.equal(incomplete.status, 'incomplete'); assert.equal(incomplete.skipped.length, 4);
});

test('§31: variante intenzionale richiede una differenza didattica esplicita, non soltanto un nuovo ID', () => {
  const a = item('a'), b = item('b');
  a.teacher.design = { support: 'guidato' };
  b.teacher.design = { support: 'guidato', case: { variantOf: 'a', variantReason: 'Prova alternativa.' } };
  assert.equal(D.duplicates([a], [b]).length, 1);
  b.teacher.design.support = 'autonomo';
  assert.deepEqual(D.duplicates([a], [b]), []);
});

test('§31: confronto con UUID lunghi usa alias brevi, poi restituisce soltanto ID canonici', async () => {
  const d = draft(); d.activities.push(item('c', 'Quale indizio conferma la tua lettura?'), item('d', 'Il dubbio rimane?'));
  d.activities.forEach((a, i) => { a.id = 'attivita-a30eb26a-e659-445b-aa0b-fde98f946c43-' + (i + 1); });
  d.activities[1].teacher.design = { case: { id: d.activities[1].id, variantOf: d.activities[0].id, variantReason: 'Aiuti differenti.' } };
  const before = JSON.stringify(d), pairs = new Set();
  const result = await D.reviewSet(d, { assertCurrent() {},
    fits: p => JSON.parse(p.contents[0].parts[0].text).activities.length <= 2,
    async ask(p) {
      const input = JSON.parse(p.contents[0].parts[0].text), ids = input.activities.map(a => a.id);
      assert.ok(ids.every(id => /^i\d+$/.test(id)), 'Il modello non deve ricopiare UUID lunghi.');
      assert.deepEqual(p.generationConfig.responseSchema.properties.checkedIds.items.enum, ids);
      assert.deepEqual(p.generationConfig.responseSchema.properties.findings.items.properties.relatedId.enum, ['', ...ids]);
      assert.ok(Object.values(input.compare).flat().every(id => ids.includes(id)));
      const variant = input.activities.find(a => a.case);
      if (variant) { assert.equal(variant.case.id, 'i2'); assert.equal(variant.case.variantOf, 'i1'); }
      if (ids.length === 2) pairs.add(ids.slice().sort().join('-'));
      const a = input.activities.find(a => a.id === 'i2'), b = input.activities.find(a => a.id === 'i1');
      return { checkedIds: ids, findings: a && b ? [{ id: a.id, relatedId: b.id, kind: 'duplicate',
        reason: 'Confronta i due compiti.', quote: a.question, relatedQuote: b.question }] : [], unavailable: [] };
    } });
  assert.equal(result.status, 'completed'); assert.equal(pairs.size, 6);
  assert.equal(result.findings[0].id, d.activities[1].id);
  assert.equal(result.findings[0].relatedId, d.activities[0].id);
  assert.equal(JSON.stringify(d), before);
});

test('§31: alias del confronto non accettano ID inventati e rimappano le indisponibilità', async () => {
  const d = draft(); d.activities.forEach((a, i) => { a.id = 'attivita-d735deff-58fc-4a73-99f1-52ea9382b046-' + (i + 1); });
  const partial = await D.reviewSet(d, { assertCurrent() {}, fits: () => true,
    async ask(p) { const ids = JSON.parse(p.contents[0].parts[0].text).activities.map(a => a.id);
      return { checkedIds: [ids[0]], findings: [], unavailable: [{ id: ids[1], reason: 'Caso non verificabile.' }] }; } });
  assert.deepEqual(partial.skipped, [{ id: d.activities[1].id, reason: 'Caso non verificabile.' }]);
  for (const checkedIds of [['i1', 'attivita d735deff... (etc)'], ['i1', 'i1'], ['i1', 'i999']]) {
    const invalid = await D.reviewSet(d, { assertCurrent() {}, fits: () => true,
      ask: async () => ({ checkedIds, findings: [], unavailable: [] }) });
    assert.equal(invalid.status, 'incomplete'); assert.equal(invalid.skipped.length, 2);
    assert.ok(invalid.skipped.every(r => d.activities.some(a => a.id === r.id)));
  }
});

test('§31: risposta didattica non valida si recupera su gruppi minori senza perdere le coppie', async () => {
  const d = draft(); d.activities.push(item('c', 'Quale indizio conferma la tua lettura?'), item('d', 'Il dubbio rimane?'));
  const pairs = new Set(); let calls = 0;
  const result = await D.reviewSet(d, { assertCurrent() {}, fits: () => true, async ask(p) {
    calls++; const input = JSON.parse(p.contents[0].parts[0].text), ids = input.activities.map(a => a.id);
    if (ids.length > 2) return { checkedIds: ids, findings: [{ id: ids[0], relatedId: ids[1], kind: 'duplicate',
      reason: 'Da confrontare.', quote: input.activities[1].question, relatedQuote: input.activities[1].question }], unavailable: [] };
    if (ids.length === 2) pairs.add(ids.slice().sort().join('-'));
    return { checkedIds: ids, findings: [], unavailable: [] };
  } });
  assert.equal(result.status, 'completed'); assert.equal(pairs.size, 6); assert.ok(calls > 1);
});

test('§31: recupero didattico limitato; rete e risposte invalide non diventano copertura', async () => {
  const d = draft(); d.activities = Array.from({ length: 10 }, (_, i) => item('a' + i, 'Domanda distinta ' + i));
  let calls = 0;
  const bad = await D.reviewSet(d, { assertCurrent() {}, fits: () => true, async ask() {
    calls++; return { checkedIds: ['inventato'], findings: [], unavailable: [] };
  } });
  assert.equal(bad.status, 'incomplete'); assert.equal(bad.skipped.length, 10); assert.ok(calls <= 13);
  calls = 0;
  const network = await D.reviewSet(d, { assertCurrent() {}, fits: () => true, async ask() { calls++; throw Error('aborted'); } });
  assert.equal(network.status, 'incomplete'); assert.equal(calls, 1);
});


test('§34: piano e giudice condividono i criteri di chiarezza e distinguono aiuto dalla guida docente', () => {
  const d = draft(); d.activities[0].help = 'Quali parole trovi?';
  d.activities[0].teacher.design = { activityType: 'formulare-domanda' };
  for (const request of [D.planningRequest(d, { items: [{ id: 'x' }] }), D.reviewRequest(d, ['a', 'b'])]) {
    const instructions = request.systemInstruction.parts[0].text;
    assert.ok(instructions.includes(D.studentInstructions));
    assert.match(instructions, /MAI altre domande/); assert.match(instructions, /help è vuoto/);
    assert.match(instructions, /Non basta togliere il punto interrogativo/);
  }
  const review = D.reviewRequest(d, ['a', 'b']), wire = JSON.parse(review.contents[0].parts[0].text);
  assert.equal(wire.activities[0].activityType, 'formulare-domanda');
  assert.equal(wire.activities[0].help, d.activities[0].help);
  const result = D.validateReview({ checkedIds: ['a', 'b'], unavailable: [], findings: [{
    id: 'a', relatedId: '', kind: 'strategy', reason: 'L’aiuto pone una seconda domanda.',
    quote: d.activities[0].question, relatedQuote: ''
  }] }, d, ['a', 'b']);
  assert.equal(result.findings.length, 1); // schema e citazione del Banco invariati
});
