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
  for (const bad of [{ sourceChecked: false }, { judgments: {} }, { noEvidence: true }, { judgments: { a: { grade: 'relevant', quote: 'inventato' } } }]) assert.throws(() => Core.validate(c, packet.pages, { ...annotation, ...bad }));
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
  for (const asset of ['/review-core.js', '/review-pdf.js', '/public/js/lucide.min.js', '/public/js/mappai-proiezione-core.js']) assert.equal((await fetch(origin + asset)).status, 200);
  assert.equal((await fetch(origin + '/api/state')).status, 403);
  assert.equal((await fetch(origin + '/api/state', { headers: { ...headers, Origin: 'https://foreign.invalid' } })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => require('node:http').get(origin + '/api/state', { headers: { ...headers, Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(wrongHost, 403);
  const response = await fetch(origin + '/api/annotation', { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'IT-001', version: 0, annotation }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).version, 1);
  assert.equal((await fetch(origin + '/api/pdf/pdf', { headers })).status, 200);
  fs.writeFileSync(path.join(directory, 'pdf/test.pdf'), 'replacement'); assert.equal((await fetch(origin + '/api/pdf/pdf', { headers })).status, 409);
});

test('Electron opens one native window, guards IPC, preserves revisions and waits for close acknowledgment', async t => {
  const { EventEmitter } = require('node:events');
  const { pathToFileURL } = require('node:url');
  const { directory, annotation } = fixture(t);
  const { installReviewBank } = require('../local-ai/review-electron.cjs');
  const handlers = new Map(), ipcMain = new EventEmitter(), app = new EventEmitter();
  ipcMain.handle = (name, fn) => handlers.set(name, fn);
  app.isPackaged = true; app.quit = () => { app.quits = (app.quits || 0) + 1; };
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
      this.webContents.send = name => { this.lastMessage = name; };
      windows.push(this);
    }
    isDestroyed() { return !!this.destroyed; }
    isMinimized() { return false; }
    isMaximized() { return true; }
    getBounds() { return { width: 1280, height: 800 }; }
    show() {} focus() {} maximize() { this.maximized = true; }
    async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    close() { let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.destroy(); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const parent = new Window(), settings = { reviewBankDirectory: directory };
  let closeChoice = 0, closeDialogs = 0;
  const event = win => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
  installReviewBank({ app, BrowserWindow: Window, ipcMain, dialog: {
    showOpenDialog() { throw Error('Existing bank must not prompt.'); },
    async showMessageBox() { closeDialogs++; return { response: closeChoice }; }
  }, mainWindow: () => parent,
    readSettings: () => settings, writeSettings: data => Object.assign(settings, data) });
  const open = handlers.get('review-bank-open'), request = handlers.get('review-bank-request');
  assert.equal((await open({ ...event(parent), senderFrame: {} })).ok, false);
  await Promise.all([open(event(parent)), open(event(parent))]);
  assert.equal(windows.length, 2);
  const bank = windows[1]; assert.equal(bank.maximized, true);
  assert.deepEqual(bank.popup({ url: 'https://untrusted.invalid' }), { action: 'deny' });
  assert.equal(bank.options.webPreferences.sandbox, true);
  assert.equal(bank.options.webPreferences.nodeIntegration, false);
  assert(request(event(parent), 'state').error);
  assert(request({ ...event(bank), senderFrame: {} }, 'state').error);
  assert(!JSON.stringify(request(event(bank), 'state')).includes('SECRET INITIAL'));
  assert(request(event(bank), 'arbitrary-route').error);
  assert.equal(request(event(bank), 'annotation', { caseId: 'IT-001', version: 0, annotation }).value.version, 1);
  assert(request(event(bank), 'annotation', { caseId: 'IT-001', version: 0, annotation }).error);
  assert.equal(request(event(bank), 'export').value.cases.length, 1);
  assert.equal(request(event(bank), 'pdf/pdf').value.toString(), 'test pdf');
  const revision = fs.readFileSync(path.join(directory, 'annotations/00000001.json'));
  bank.close(); assert.equal(bank.isDestroyed(), false); assert.equal(bank.lastMessage, 'review-bank-closing');
  ipcMain.emit('review-bank-close', event(parent)); assert.equal(bank.isDestroyed(), false);
  ipcMain.emit('review-bank-close', event(bank)); assert.equal(bank.isDestroyed(), true);
  await open(event(parent));
  assert.equal(request(event(windows[2]), 'state').value.version, 1);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'annotations/00000001.json')), revision);
  fs.writeFileSync(path.join(directory, 'pdf/test.pdf'), 'replacement');
  assert.match(request(event(windows[2]), 'pdf/pdf').error, /sostituito/);
  let preventedQuit = false;
  app.emit('before-quit', { preventDefault() { preventedQuit = true; } });
  assert.equal(preventedQuit, true);
  assert.equal(windows[2].lastMessage, 'review-bank-closing');
  await handlers.get('review-bank-close-failed')(event(parent)); assert.equal(closeDialogs, 0);
  await handlers.get('review-bank-close-failed')(event(windows[2]));
  assert.equal(closeDialogs, 1); assert.equal(windows[2].isDestroyed(), false);
  ipcMain.emit('review-bank-close', event(windows[2]));
  assert.equal(app.quits, undefined, 'Canceling a failed quit keeps the app running');
  await open(event(parent));
  closeChoice = 1;
  app.emit('before-quit', { preventDefault() {} });
  await handlers.get('review-bank-close-failed')(event(windows[3]));
  assert.equal(app.quits, 1);
});

test('optional attribution, actionable blockers and explicit citation replacement preserve teacher wording', t => {
  const { packet, page, item, annotation, store, directory } = fixture(t);
  assert.equal(Core.validate(packet.cases[0], packet.pages, { ...annotation, reviewer: '' }).reviewer, '');
  const c = { ...packet.cases[0], candidates: [item, { ...item, id: 'b' }] };
  const edited = { grade: 'relevant', quote: 'Il circuito deve esser chiuso.', note: 'Decisione docente' };
  const issues = Core.completionIssues(c, packet.pages, { ...annotation, sourceChecked: false, judgments: { a: edited } });
  assert(issues.some(i => i.candidateId === 'a' && i.kind === 'quote'));
  assert(issues.some(i => i.candidateId === 'b' && i.kind === 'grade'));
  assert(issues.some(i => i.field === 'source-checked'));
  const repaired = Core.replaceQuote(page, item, edited, item.text);
  assert.equal(repaired.formulation, edited.quote); assert.equal(repaired.note, edited.note);
  assert.equal(edited.quote, 'Il circuito deve esser chiuso.');
  assert.throws(() => Core.replaceQuote(page, item, edited, 'Inventato'));
  store.save('IT-001', 0, { ...annotation, reviewer: '', judgments: { a: repaired } });
  const state = createStore(directory).load();
  assert.equal(state.annotations['IT-001'].judgments.a.formulation, edited.quote);
  assert.equal(Core.exportBank(packet, state).cases.length, 1);
});
