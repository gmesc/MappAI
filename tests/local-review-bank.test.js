'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Core = require('../local-ai/review-core');
const { createStore, publicView, serve, sha } = require('../local-ai/review-bank.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-bank-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const page = { id: 'p', project: 'project', recordId: 'source:s:0', text: 'Ω 🧪 Il circuito deve essere chiuso. Non sempre.', page: 1, pdfId: 'pdf', title: 'test.pdf' };
  const item = { id: 'a', ...Core.locate(page, 'Il circuito deve essere chiuso.') };
  const packet = { schema: 1, corpusSha256: sha('{}'), documents: [{ id: 'pdf', title: 'test.pdf', file: 'test.pdf', sha256: sha('test pdf') }], pages: [page], criticalIds: ['IT-001'],
    cases: [{ id: 'IT-001', project: 'project', split: 'development', query: 'Quando scorre corrente?', critical: true, category: 'condition', candidates: [item], runs: { legacy: [{ ...item, start: 0, end: [...page.text].length, text: page.text }], dense: [item] }, initial: { needle: 'SECRET INITIAL', expected: [] } }] };
  packet.id = sha(JSON.stringify(packet));
  fs.writeFileSync(path.join(directory, 'packet.json'), JSON.stringify(packet)); fs.mkdirSync(path.join(directory, 'pdf')); fs.writeFileSync(path.join(directory, 'pdf/test.pdf'), 'test pdf');
  const annotation = { reviewer: 'QA synthetic', status: 'reviewed', sourceChecked: true, noEvidence: false, notes: '', judgments: { a: { grade: 'relevant', quote: item.text } }, additions: [] };
  return { directory, packet, page, item, annotation, store: createStore(directory) };
}
test('gold uses exact Unicode offsets, all valid passages, and completion gates', t => {
  const { packet, annotation, page } = fixture(t); const c = packet.cases[0];
  assert.equal(Core.validate(c, packet.pages, annotation).expected[0].start, 4);
  for (const bad of [{ reviewer: '' }, { sourceChecked: false }, { judgments: {} }, { noEvidence: true }, { judgments: { a: { grade: 'relevant', quote: 'inventato' } } }]) assert.throws(() => Core.validate(c, packet.pages, { ...annotation, ...bad }));
  assert.throws(() => Core.validate(c, packet.pages, { ...annotation, additions: [{ pageId: 'foreign', text: 'Il' }] }));
  const partial = Core.validate(c, packet.pages, { ...annotation, status: 'uncertain', judgments: { a: { grade: 'partial', quote: 'Il circuito' } } });
  assert.equal(partial.expected.length, 0); assert.equal(partial.partial.length, 1);
  assert.throws(() => Core.locate({ ...page, text: 'Volt Volt' }, 'Volt'), /ripetuto/);
});
test('immutable disk revisions survive restart, preserve initial labels and reject stale writers/corruption', t => {
  const { store, directory, annotation, packet } = fixture(t);
  store.save('IT-001', 0, annotation);
  const reopened = createStore(directory); assert.equal(reopened.load().version, 1);
  assert.throws(() => reopened.save('IT-001', 0, annotation), /altra finestra/);
  reopened.save('IT-001', 1, { ...annotation, status: 'draft', notes: 'Changed by teacher' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'annotations/00000001.json'))).annotations['IT-001'].notes, '');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'packet.json'))).cases[0].initial.needle, 'SECRET INITIAL');
  assert.equal(Core.exportBank(packet, reopened.load()).cases.length, 0);
  fs.writeFileSync(path.join(directory, 'annotations/00000002.json'), '{bad'); assert.throws(() => reopened.load());
});
test('blind response removes original labels and model rankings; export includes only reviewed cases', t => {
  const { store, packet, annotation } = fixture(t);
  assert(!JSON.stringify(publicView(packet, store.load())).includes('SECRET INITIAL'));
  assert(!JSON.stringify(publicView(packet, store.load())).includes('dense'));
  assert.equal(Core.exportBank(packet, store.load()).cases.length, 0);
  const state = store.save('IT-001', 0, annotation), bank = Core.exportBank(packet, state), report = Core.report(packet, state);
  assert.equal(bank.cases.length, 1); assert.equal(bank.cases[0].expected[0].text, annotation.judgments.a.quote);
  assert.equal(report.summary.development.dense.hit5, 1);
  const none = store.save('IT-001', 1, { ...annotation, noEvidence: true, notes: 'Entire source checked', judgments: { a: { grade: 'irrelevant' } } });
  assert.equal(Core.report(packet, none).summary.development.dense.hit20, null);
  assert.deepEqual(Core.report(packet, none).summary.development.dense.noEvidenceWithResults, ['IT-001']);
});
test('matching accepts alternative references but rejects a truncated condition or wrong page', () => {
  const expected = [{ pageId: 'p', start: 0, end: 10, text: 'condizione' }, { pageId: 'p', start: 12, end: 18, text: 'valida' }];
  assert.equal(Core.position(expected, [{ pageId: 'p', start: 12, end: 18, text: 'valida' }]), 1);
  assert.equal(Core.position(expected, [{ pageId: 'p', start: 0, end: 5, text: 'condi' }]), null);
  assert.equal(Core.position(expected, [{ pageId: 'other', start: 0, end: 10, text: 'condizione' }]), null);
});
test('HTTP binds localhost, requires token and same origin, and rejects replaced PDF', async t => {
  const { directory, annotation } = fixture(t), server = serve(directory, 0);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = new URL(server.reviewUrl), origin = url.origin, headers = { 'X-Review-Token': url.hash.slice(1) };
  assert.equal((await fetch(origin + '/api/state')).status, 403);
  assert.equal((await fetch(origin + '/api/state', { headers: { ...headers, Origin: 'https://foreign.invalid' } })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => require('node:http').get(origin + '/api/state', { headers: { ...headers, Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(wrongHost, 403);
  const response = await fetch(origin + '/api/annotation', { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'IT-001', version: 0, annotation }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).version, 1);
  assert.equal((await fetch(origin + '/api/pdf/pdf', { headers })).status, 200);
  fs.writeFileSync(path.join(directory, 'pdf/test.pdf'), 'replacement'); assert.equal((await fetch(origin + '/api/pdf/pdf', { headers })).status, 409);
});
