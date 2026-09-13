'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../public/js/mappai-review-core.js');

const BEFORE = 'La Svizzera scambia oro con la Germania per ottenere franchi.';
const AFTER = 'La Germania scambia oro con la Svizzera per ottenere franchi.';
const SOURCES = [{ id: 'pdf-1', title: 'Svizzera', pages: [{ n: 4, text: AFTER }] }];
test('independent corrections in one text compose, survive reload and preserve overlapping-change conflicts', () => {
  const item = { id: 'intro', kind: 'synthesis', text: 'Il governo nominò Guisan. Una frase che resta. Bergier confermò tutte le accuse.' };
  const make = (id, before, after) => ({ id, target: { kind: 'item', id: item.id, field: 'text' }, before: item.text, after: item.text.replace(before, after) });
  const issues = [make('guisan', 'Il governo nominò', 'L’Assemblea Federale elesse'), make('bergier', 'confermò tutte le accuse', 'esaminò le accuse')];
  let review = R.createReview({ db: { items: [item] }, sources: SOURCES, report: { checkStatus: 'completed', issues } });
  for (const i of issues) review = R.setDecision(review, i.id, 'accept');
  const result = R.beginApproval(JSON.parse(JSON.stringify(review)), { items: [item] });
  assert.equal(result.ok, true);
  assert.equal(result.db.items[0].text, 'L’Assemblea Federale elesse Guisan. Una frase che resta. Bergier esaminò le accuse.');
  const resumed = R.beginApproval(result.review, { items: [item] });
  assert.equal(resumed.ok, true); assert.deepEqual(resumed.db, result.db);
  const clash = make('clash', 'Il governo nominò', 'Il Parlamento scelse');
  review = R.addIssue(review, clash); review = R.setDecision(review, clash.id, 'accept');
  const rejected = R.preview(review, { items: [item] });
  assert.equal(rejected.ok, false); assert.deepEqual(rejected.db.items, [item]);
  assert.ok(rejected.conflicts.some(c => c.code === 'conflicting_decisions'));
  const node = { id: 'N', desc: item.text, content: item.text };
  const nodeIssues = issues.map(i => ({ ...i, target: { kind: 'node', id: 'N', field: 'desc' } }));
  let nodeReview = R.createReview({ db: { nodes: [node] }, sources: SOURCES, report: { checkStatus: 'completed', issues: nodeIssues } });
  for (const i of nodeIssues) nodeReview = R.setDecision(nodeReview, i.id, 'accept');
  const nodeResult = R.preview(nodeReview, { nodes: [node] });
  assert.equal(nodeResult.ok, true);
  assert.equal(nodeResult.db.nodes[0].desc, result.db.items[0].text);
  assert.equal(nodeResult.db.nodes[0].content, result.db.items[0].text);
});
test('decision outcomes distinguish corrections, exclusions and unchanged text', () => {
  const issue = { target: { kind: 'item', id: 'text', field: 'text' }, before: 'Prima.', after: 'Dopo.', hasProposal: true };
  assert.equal(R.decisionOutcome(issue), 'pending');
  assert.equal(R.decisionOutcome(issue, { choice: 'accept' }), 'applied');
  assert.equal(R.decisionOutcome(issue, { choice: 'reject' }), 'kept');
  assert.equal(R.decisionOutcome(issue, { choice: 'manual', text: 'Prima.' }), 'kept');
  assert.equal(R.decisionOutcome(issue, { choice: 'manual', text: 'Altro.' }), 'edited');
  assert.equal(R.decisionOutcome({ ...issue, hasProposal: false }, { choice: 'accept' }), 'pending');
  assert.equal(R.decisionOutcome({ ...issue, target: { ...issue.target, field: '$item' }, after: null }, { choice: 'accept' }), 'excluded');
});
function db() {
  return {
    nodes: [
      { id: 'N1', label: 'Oro e valuta', desc: BEFORE, content: 'legacy', level: 1, group: 1, x: 12, y: 24 },
      { id: 'N2', label: 'Razionamento', desc: 'Le tessere permettono acquisti limitati.', level: 2, group: 1 }
    ],
    links: [{ source: 'N1', target: 'N2', rel: 'richiede', isCross: true }],
    sourcesDict: { N1: [{ id: 'p4-1', title: 'Svizzera', source: 'p. 4', text: AFTER, verbatim: true }] },
    studySets: [{ id: 'existing-set' }], customColors: { 1: '#aaa' }
  };
}
function report() {
  return { stato: 'completato', correzioni: [{ id: 'N1', tipo: 'soggetto-invertito',
    problema: 'Soggetto invertito.', prima: BEFORE, dopo: AFTER, prova: AFTER, soloSegnalato: true }] };
}
function review(opts = {}) { return R.createReview({ db: db(), sources: SOURCES, report: report(), ...opts }); }
function accepted(r = review()) { return R.setDecision(r, r.initial.issues[0].id, 'accept'); }
function freeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }

test('UMD browser exposes the same pure API without Node or app globals', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review-core.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.MappAIReviewCore.beginApproval, 'function');
  assert.equal(ctx.MappAIReviewCore.revision(db(), SOURCES), R.revision(db(), SOURCES));
});

test('semantic revision ignores D3 positions, row order, study sets and cache metadata', () => {
  const first = db(), changed = db();
  changed.nodes[0].x = 400; changed.nodes[0].fx = 100; changed.nodes[0].selected = true;
  changed.nodes[0].content = 'The fallback is unused when desc exists';
  changed.nodes[0].aiDesc = 'Earlier AI draft'; changed.nodes[0].hasCustomText = true;
  changed.links[0].source = changed.nodes[0]; changed.links[0].target = changed.nodes[1];
  changed.links[0].index = 45; changed.nodes.reverse();
  changed.studySets.push({ id: 'new-set', items: [1, 2] }); changed.customColors[1] = '#fff';
  assert.equal(R.revision(first, SOURCES), R.revision(changed, SOURCES));
  assert.deepEqual(R.semanticSnapshot(first), R.semanticSnapshot(changed));
  assert.equal(R.revision(first, SOURCES), R.revision(R.semanticSnapshot(first), SOURCES));
});

test('text, label, hierarchy, direction, relation and source changes invalidate the revision', () => {
  const base = R.revision(db(), SOURCES);
  for (const change of [
    d => { d.nodes[0].desc = AFTER; }, d => { d.nodes[0].label = 'Valuta'; },
    d => { d.nodes[1].group = 2; }, d => { d.nodes[1].parent = 'N1'; },
    d => { d.links[0].rel = 'sostiene'; }, d => { d.links[0].target = 'N1'; },
    d => { d.links[0].isCross = false; }, d => { d.sourcesDict.N1[0].text = BEFORE; }
  ]) { const d = db(); change(d); assert.notEqual(R.revision(d, SOURCES), base); }
  assert.notEqual(R.revision(db(), [{ ...SOURCES[0], pages: [{ n: 5, text: AFTER }] }]), base);
  assert.notEqual(R.revision(db(), []), base);
});

test('source registry preserves page/ID/original text and fontiDict alias', () => {
  const d = db(); d.fontiDict = d.sourcesDict; delete d.sourcesDict;
  assert.deepEqual(R.semanticSnapshot(d), R.semanticSnapshot(db()));
  const sources = [{ id: 'f1', source: 'p. 4', text: 'Testo  originale\ncon spazi.', verbatim: true, loading: true }];
  const r = review({ sources });
  assert.deepEqual(r.sources, [{ id: 'f1', source: 'p. 4', text: 'Testo  originale\ncon spazi.', verbatim: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(r)).sources, r.sources);
});

test('same-word subject inversion remains a proposal; teacher acceptance applies on a copy', () => {
  const input = freeze(db()), r = freeze(accepted());
  assert.deepEqual(BEFORE.split(' ').sort(), AFTER.split(' ').sort());
  const result = R.beginApproval(r, input, { now: '2026-09-12T12:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(input.nodes[0].desc, BEFORE);
  assert.equal(r.initial.status, 'awaiting_review');
  assert.equal(result.db.nodes[0].desc, AFTER);
  assert.equal(result.db.nodes[0].content, AFTER);
  assert.equal(result.db.nodes[0].aiDesc, BEFORE);
  assert.equal(result.db.nodes[0].x, 12);
  assert.deepEqual(result.db.studySets, input.studySets);
  assert.equal(result.review.initial.status, 'applying');
  assert.equal(result.review.overrides[0].origin, 'teacher');
  assert.equal(result.review.overrides[0].evidence, AFTER);
  assert.equal(result.review.overrides[0].choice, 'accept');
});

test('pending issues block; failed/incomplete AI needs an explicit teacher decision', () => {
  assert.equal(R.beginApproval(review(), db()).ok, false);
  assert.equal(R.beginApproval(review(), db(), { manualReview: true }).ok, false, 'manual fallback does not silently resolve issues');
  const absent = review({ report: null });
  assert.equal(absent.initial.checkStatus, 'unavailable');
  assert.equal(R.beginApproval(absent, db()).conflicts[0].code, 'manual_review_required');
  const decided = R.beginApproval(absent, db(), { manualReview: true });
  assert.equal(decided.ok, true);
  assert.equal(decided.review.initial.checkStatus, 'unavailable');
  assert.equal(decided.review.initial.manualReview, true);
});

test('empty proposals do not prove complete coverage; skipped branches/nodes remain incomplete', () => {
  assert.equal(review({ report: { correzioni: [], rami: 6 } }).initial.checkStatus, 'incomplete');
  assert.equal(review({ report: { stato: 'completato', correzioni: [] } }).initial.checkStatus, 'completed');
  assert.equal(review({ report: { stato: 'completato', esitiRami: [{ stato: 'saltato' }] } }).initial.checkStatus, 'incomplete');
  assert.equal(review({ report: { stato: 'completato', copertura: { nodi: { saltati: ['N2'] } } } }).initial.checkStatus, 'incomplete');
});

test('rejection and manual text remain distinct teacher provenance; undo changes no live node', () => {
  const initial = review(), id = initial.initial.issues[0].id;
  const keep = R.setDecision(initial, id, 'reject', { reason: 'Ho controllato la fonte.' });
  const kept = R.beginApproval(keep, db());
  assert.equal(kept.db.nodes[0].desc, BEFORE);
  assert.equal(kept.review.overrides[0].choice, 'reject');
  assert.equal(kept.review.overrides[0].reason, 'Ho controllato la fonte.');
  const manual = R.setDecision(initial, id, 'manual', { text: 'Testo del docente.', reason: 'Rettifica del libro.' });
  assert.equal(R.preview(manual, db()).db.nodes[0].desc, 'Testo del docente.');
  assert.equal(R.preview(R.setDecision(manual, id, 'pending'), db()).ok, false);
  assert.equal(initial.initial.decisions[id], undefined);
  assert.throws(() => R.setDecision(initial, id, 'manual'), /manual_text_required/);
});

test('exact before precondition and semantic revision prevent stale or partial application', () => {
  const changed = db(); changed.nodes[0].desc = 'Testo modificato nel frattempo.';
  const result = R.beginApproval(accepted(), changed);
  assert.equal(result.ok, false);
  assert.equal(result.db.nodes[0].desc, changed.nodes[0].desc);
  assert.ok(result.conflicts.some(c => c.code === 'stale_revision'));
  assert.ok(result.conflicts.some(c => c.code === 'before_mismatch'));
  const wrongBefore = review({ report: { stato: 'completato', issues: [
    { target: { kind: 'node', id: 'N1' }, before: BEFORE.toLowerCase(), after: AFTER }
  ] } });
  assert.equal(R.preview(accepted(wrongBefore), db()).conflicts[0].code, 'before_mismatch');
});

test('incompatible proposals for the same field block the whole commit; duplicates are idempotent', () => {
  let r = accepted();
  const extra = { id: 'manual-node', target: { kind: 'node', id: 'N1', field: 'desc' }, after: 'Altra proposta.', origin: 'teacher' };
  r = R.addIssue(r, extra);
  assert.deepEqual(R.addIssue(r, extra), r);
  r = R.setDecision(r, 'manual-node', 'accept');
  const result = R.preview(r, db());
  assert.equal(result.ok, false);
  assert.equal(result.db.nodes[0].desc, BEFORE);
  assert.equal(result.conflicts[0].code, 'conflicting_decisions');
  assert.throws(() => R.addIssue(r, { ...extra, after: 'Diversa.' }), /duplicate_issue_id/);
});

test('manual edits to unflagged labels and descriptions use independent draft issues', () => {
  let r = accepted();
  r = R.addIssue(r, { id: 'label', target: { kind: 'node', id: 'N2', field: 'label' }, origin: 'teacher' });
  r = R.setDecision(r, 'label', 'manual', { text: 'Tessere di razionamento' });
  const result = R.beginApproval(r, db());
  assert.equal(result.ok, true);
  assert.equal(result.db.nodes[0].desc, AFTER);
  assert.equal(result.db.nodes[1].label, 'Tessere di razionamento');
});

test('link proposals remove only the reviewed edge, with D3 endpoints supported', () => {
  const d = db(); d.links[0].source = d.nodes[0]; d.links[0].target = d.nodes[1];
  const r = accepted(review({ db: d, report: { stato: 'completato', linkTolti: [
    { source: 'N1', target: 'N2', rel: 'richiede', isCross: true, problema: 'Il nesso non regge.' }
  ] } }));
  assert.equal(r.initial.issues[0].hasProposal, true);
  assert.equal(r.initial.issues[0].after, null);
  assert.equal(R.beginApproval(r, d).db.links.length, 0);
  assert.equal(d.links.length, 1);
});

test('whole-link replacement rejects dangling endpoints; relation edits preserve other fields', () => {
  let r = review({ report: { stato: 'completato', issues: [
    { id: 'link', target: { kind: 'link', source: 'N1', target: 'N2', field: 'rel' }, after: 'correlato a' }
  ] } });
  let out = R.preview(accepted(r), db());
  assert.equal(out.db.links[0].rel, 'correlato a'); assert.equal(out.db.links[0].isCross, true);
  r = review({ report: { stato: 'completato', issues: [
    { id: 'link', target: { kind: 'link', source: 'N1', target: 'N2', field: '$link' }, after: { source: 'N1', target: 'absent', rel: 'include' } }
  ] } });
  assert.equal(R.preview(accepted(r), db()).conflicts[0].code, 'missing_link_endpoint');
});

test('missing or ambiguous targets and proposal-less reports cannot silently change content', () => {
  const r = review({ report: { stato: 'completato', segnalati: [{ id: 'N1', problema: 'Da discutere.' }] } });
  assert.equal(r.initial.issues[0].hasProposal, false);
  assert.equal(R.preview(accepted(r), db()).conflicts[0].code, 'proposal_missing');
  const missing = accepted(review({ report: { stato: 'completato', issues: [
    { target: { kind: 'node', id: 'absent' }, after: 'Nuovo testo' }
  ] } }));
  assert.ok(R.preview(missing, db()).conflicts.some(c => c.code === 'missing_target'));
  const duplicate = db(); duplicate.links.push({ ...duplicate.links[0] });
  const ambiguous = accepted(review({ db: duplicate, report: { stato: 'completato', linkTolti: [duplicate.links[0]] } }));
  assert.equal(R.preview(ambiguous, duplicate).conflicts[0].code, 'ambiguous_target');
});

test('substring adaptation is exact and unambiguous, without normalizing away punctuation', () => {
  const r = review({ report: { stato: 'completato', correzioni: [{ id: 'N1', brano: 'La Svizzera', con: 'La Germania' }] } });
  assert.equal(r.initial.issues[0].after, BEFORE.replace('La Svizzera', 'La Germania'));
  const bad = review({ report: { stato: 'completato', correzioni: [{ id: 'N1', brano: 'la svizzera', con: 'La Germania' }] } });
  assert.equal(bad.initial.issues[0].hasProposal, false);
});

test('applying is persisted before approval; wrong disk revision cannot authorize generation', () => {
  const begun = R.beginApproval(accepted(), db());
  assert.equal(R.gate(begun.review, begun.db).allowed, false);
  assert.throws(() => R.completeApproval(begun.review, begun.review.baseRevision), /persisted_revision_mismatch/);
  const complete = R.completeApproval(begun.review, R.revision(begun.db, SOURCES));
  assert.equal(R.gate(complete, begun.db, SOURCES).allowed, true);
  assert.equal(R.gate(complete, begun.db, []).reason, 'stale_revision');
  assert.throws(() => R.setDecision(complete, complete.initial.issues[0].id, 'reject'), /review_not_editable/);
});

test('retry after either side of a crash and duplicate confirmation are idempotent', () => {
  const begun = R.beginApproval(accepted(), db(), { now: 'first' });
  const saved = JSON.parse(JSON.stringify(begun.review));
  const retryBeforeWrite = R.beginApproval(saved, db());
  assert.equal(retryBeforeWrite.ok, true);
  assert.deepEqual(retryBeforeWrite.review, saved);
  const retryAfterWrite = R.beginApproval(saved, begun.db);
  assert.equal(retryAfterWrite.alreadyApplied, true);
  assert.deepEqual(retryAfterWrite.db, begun.db);
  const complete = R.completeApproval(saved, saved.approvedRevision);
  assert.deepEqual(R.completeApproval(complete, complete.approvedRevision), complete);
  assert.equal(R.beginApproval(complete, begun.db).alreadyApplied, true);
  assert.equal(R.beginApproval(complete, db()).ok, false, 'old cache cannot reverse an approved correction');
});

test('legacy has no invented approval; malformed/newer schemas fail closed', () => {
  assert.deepEqual(R.gate(null, db()), { allowed: true, reason: 'legacy', legacy: true });
  assert.equal(R.gate({ schema: 'mappai-review@999' }, db()).allowed, false);
  assert.equal(R.gate(review(), db()).allowed, false);
  const corrupt = review(); corrupt.initial.status = 'whatever';
  assert.throws(() => R.beginApproval(corrupt, db()), /invalid_review_status/);
});

test('crash recovery preserves an already recorded manual review when AI was unavailable', () => {
  const begun = R.beginApproval(review({ report: null }), db(), { manualReview: true, now: 'confirmed' });
  const retry = R.beginApproval(JSON.parse(JSON.stringify(begun.review)), db());
  assert.equal(retry.ok, true);
  assert.deepEqual(retry.review, begun.review);
  assert.equal(retry.review.initial.manualReview, true);
});

test('G2 reuses the decision engine on normalized items, including exclusion and whole-item edits', () => {
  const input = { items: [
    { id: 'q1', question: 'Chi aveva bisogno di franchi?', options: ['Germania', 'Svizzera'], correctIndex: 1 },
    { id: 'q2', question: 'Spiega il fatto.', criteri: ['Cita Guisan.'], guide: 'Cita Guisan.' }
  ] };
  let r = R.createReview({ db: input, sources: SOURCES, report: { stato: 'completato', issues: [
    { id: 'key', target: { item: { id: 'q1' }, field: 'correctIndex' }, after: 0 },
    { id: 'exclude', target: { kind: 'item', id: 'q2', field: '$item' }, after: null }
  ] } });
  r = R.setDecision(R.setDecision(r, 'key', 'accept'), 'exclude', 'accept');
  const begun = R.beginApproval(r, input);
  assert.equal(begun.ok, true);
  assert.equal(begun.db.items.length, 1);
  assert.equal(begun.db.items[0].correctIndex, 0);
  assert.equal(input.items[0].correctIndex, 1);
  assert.equal(input.items[1].criteri[0], 'Cita Guisan.');
  assert.equal(R.gate(R.completeApproval(begun.review, begun.revision), begun.db).allowed, true);
  let whole = R.createReview({ db: input, report: { stato: 'completato', issues: [
    { id: 'whole', target: { kind: 'item', id: 'q1' }, after: { ...input.items[0], correctIndex: 0 } }
  ] } });
  assert.equal(R.preview(accepted(whole), input).db.items[0].correctIndex, 0);
});

test('duplicate IDs and prototype mutation targets are rejected at the boundary', () => {
  assert.throws(() => R.semanticSnapshot({ items: [{ id: 'q' }, { id: 'q' }] }), /invalid_or_duplicate_id/);
  assert.throws(() => R.createReview({ db: { items: [{ question: 'No stable ID' }] } }), /invalid_or_duplicate_id/);
  assert.throws(() => R.addIssue(review(), { target: { kind: 'node', id: 'N1', field: '__proto__' } }), /invalid_field/);
  assert.throws(() => R.addIssue(review(), { target: { kind: 'item', id: 'q1', field: 'constructor' } }), /invalid_field/);
  assert.throws(() => R.setDecision(review(), 'missing', 'accept'), /unknown_issue/);
  assert.throws(() => review({ report: { issues: [
    { id: 'collision', target: { kind: 'node', id: 'N1' }, after: 'Prima proposta' },
    { id: 'collision', target: { kind: 'node', id: 'N1' }, after: 'Seconda proposta' }
  ] } }), /duplicate_issue_id/);
  assert.equal({}.polluted, undefined);
});
