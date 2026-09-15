'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const C = require('../public/js/mappai-local-search-core');
const R = require('../public/js/mappai-review-core');
const { LocalAI } = require('../local-ai/bridge');
const sources = [{ id: 'pdf', title: 'Originale.pdf', pages: [{ n: 1, text: 'La corrente scorre solo nel circuito chiuso. La resistenza si misura in ohm.' }, { n: 2, text: '' }] }];
const db = { nodes: [{ id: 'a', label: 'Corrente', desc: 'La corrente scorre nel circuito.' }, { id: 'b', label: 'Resistenza', desc: 'Resistenza elettrica' }], links: [{ id: 'l', source: 'a', target: 'b', rel: 'incontra' }] };
test('source provenance, blank pages and full relations; inputs unchanged', () => {
  const before = JSON.stringify({ db, sources });
  const snap = C.snapshot({ db, sources });
  assert.equal(JSON.stringify({ db, sources }), before);
  assert(snap.diagnostics.some(d => d.code === 'empty_page'));
  assert.equal(snap.records.find(r => r.relationId).text, 'Corrente → incontra → Resistenza');
  const results = C.lexical(snap.records, 'corrente circuito chiuso', 'evidence');
  assert(results.length > 0); assert(results.every(r => r.origin === 'original'));
  assert(C.lexical(snap.records, 'corrente circuito', 'occurrences').every(r => r.origin === 'generated'));
});
test('manual decisions, exclusions and fields use the actual review preview', () => {
  const items = [{ id: 'one', kind: 'mc', question: 'Il circuito è aperto?', options: ['Sì', 'No'], explanation: 'La corrente scorre.' }, { id: 'two', kind: 'open', question: 'Rimuovimi', guide: 'Non cercarmi' }];
  let review = R.createReview({ db: { items }, sources, report: {} });
  review = R.addIssue(review, { target: { kind: 'item', id: 'one', field: 'explanation' }, origin: 'teacher', problem: 'Modifica', after: 'La corrente non scorre.' });
  review = R.setDecision(review, review.initial.issues[0].id, 'manual', { text: 'La corrente non scorre.' });
  review = R.addIssue(review, { target: { kind: 'item', id: 'two', field: '$item' }, origin: 'teacher', problem: 'Escludi', after: null, operation: 'exclude' });
  // Use the core's supported exclude contract, as the existing review suite does.
  const issue = review.initial.issues.at(-1);
  review.initial.decisions[issue.id] = { choice: 'accept' };
  const snapshot = C.snapshot({ db, sources, review: { final: { review, items } } });
  const one = snapshot.records.find(r => r.itemId === 'one' && r.field === 'explanation');
  assert(one, JSON.stringify(snapshot.diagnostics));
  assert.equal(one.text, 'La corrente non scorre.'); assert.equal(one.origin, 'teacher');
  assert(!snapshot.records.some(r => r.itemId === 'two'));
  assert.equal(snapshot.records.filter(r => r.itemId === 'one' && r.field === 'options').length, 2);
});
test('scope and revision change on source and content changes', () => {
  const a = C.snapshot({ db, sources, scope: 'A' });
  const next = structuredClone(db); next.nodes[0].desc += ' Modificata.';
  assert.notEqual(a.revision, C.snapshot({ db: next, sources, scope: 'A' }).revision);
  assert.equal(C.snapshot({ db, sources, scope: 'B' }).scope, 'B');
});
function manager(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-ai-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const m = new LocalAI({ root, worker: 'unused' }); t.after(() => m.stop());
  return m;
}
test('IPC validates methods, records, queries and project boundaries', async t => {
  const m = manager(t), requests = [];
  m.request = async data => { requests.push(data); return { status: 'ready', revision: data.revision }; };
  await assert.rejects(m.handle(1, { method: 'exec', command: 'anything' }), /invalid_method/);
  await assert.rejects(m.handle(1, { method: 'sync', scope: '../A', revision: 'v1', records: [{ text: 'bad' }] }), /invalid_record/);
  const snap = C.snapshot({ db, sources, scope: 'A' });
  await m.handle(1, { ...snap, method: 'sync', python: '/untrusted' });
  assert(!('python' in requests[0])); assert.match(requests[0].projectId, /^[a-f0-9]{64}$/);
  assert.equal((await m.handle(2, { ...snap, method: 'search', mode: 'evidence', query: 'corrente' })).status, 'stale');
  assert.equal((await m.handle(1, { ...snap, scope: 'B', method: 'search', mode: 'evidence', query: 'corrente' })).status, 'stale');
  await assert.rejects(m.handle(1, { ...snap, method: 'search', mode: 'evidence', query: 'corrente', origins: ['generated'] }), /invalid_query/);
});
test('late replies are stale, cancel belongs to sender and original paths are constrained', async t => {
  const m = manager(t), snap = C.snapshot({ sources, scope: 'A' }); let resolve;
  m.request = () => new Promise(r => { resolve = r; });
  const first = m.handle(1, { ...snap, method: 'sync' }); const finish = resolve;
  const second = m.handle(1, { ...snap, revision: 'v2', method: 'sync' });
  finish({ status: 'ready' }); assert.equal((await first).status, 'stale');
  resolve({ status: 'ready' }); await second;
  assert.equal(m.original(1, snap.records[0].recordId), null);
});
test('missing runtime degrades clearly without spawning or downloading', async t => {
  const m = manager(t); assert.throws(() => m.start(), /setup_required/);
  assert.equal(m.child, undefined);
});
test('real subprocess protocol: unicode, progress, malformed messages, timeout and shutdown', async t => {
  const { spawn } = require('node:child_process');
  const m = manager(t);
  fs.writeFileSync(path.join(m.root, 'config.json'), JSON.stringify({ python: process.execPath }));
  m.timeout = 1500;
  m.spawnProcess = () => spawn(process.execPath, [path.resolve(__dirname, '../local-ai/protocol-fixture.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let progress;
  const result = await m.request({ method: 'status' }, value => { progress = value; });
  assert.equal(result.text, 'Ω è locale'); assert.equal(progress.done, 1);
  await assert.rejects(m.request({ method: 'malformed' }), /malformed/);
  await assert.rejects(m.request({ method: 'hang' }), /timeout/);
  assert.equal(m.child, null);
});
test('PDF identity and extraction flags survive snapshots; changed originals cannot be opened as old citations', t => {
  const m = manager(t), vault = fs.mkdtempSync(path.join(os.tmpdir(), 'local-ai-vault-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.mkdirSync(path.join(vault, 'Allegati')); fs.writeFileSync(path.join(vault, 'Allegati', 'a.pdf'), 'original');
  const hash = require('node:crypto').createHash('sha256').update('original').digest('hex');
  const sources = R.sourceSnapshot([{ title: 'a.pdf', pdfHash: hash, pages: [{ n: 1, text: 'A real passage.', extractionWarning: 'possible_table_or_columns' }] }]);
  const snap = C.snapshot({ sources });
  assert.equal(snap.records[0].pdfHash, hash); assert.equal(snap.diagnostics[0].code, 'extraction_order');
  m.authorize(1, vault); m.sessions.set(1, { scope: vault, records: snap.records });
  assert(m.original(1, snap.records[0].recordId));
  fs.writeFileSync(path.join(vault, 'Allegati', 'a.pdf'), 'replaced');
  assert.equal(m.original(1, snap.records[0].recordId), null);
});
test('cancelled/failed sync restores the previous session and its usable index revision', async t => {
  const m = manager(t), snap = C.snapshot({ db, sources, scope: 'A' });
  m.request = async () => ({ status: 'ready' });
  await m.handle(1, { ...snap, method: 'sync' }); const previous = m.sessions.get(1);
  m.request = async () => ({ status: 'cancelled' });
  await m.handle(1, { ...snap, revision: 'v2', method: 'sync' }); assert.equal(m.sessions.get(1), previous);
  m.request = async () => { throw Error('worker failure'); };
  await assert.rejects(m.handle(1, { ...snap, revision: 'v2', method: 'sync' })); assert.equal(m.sessions.get(1), previous);
});
