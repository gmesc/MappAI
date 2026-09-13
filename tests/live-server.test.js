'use strict';
/*
 * live-server.test.js — server LAN MappAI Live, headless
 * (pattern di collab-server.test.js: porta effimera, fetch reali, disco temp)
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createLiveServer, createMaterialsServer } = require(path.join(__dirname, '..', 'live-server.js'));
const LC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-live-core.js'));

const repoRoot = path.join(__dirname, '..');

function apiFactory(port) {
  return function api(p, opts) {
    return fetch('http://127.0.0.1:' + port + p, opts).then(async r => ({
      status: r.status, body: await r.json().catch(() => null)
    }));
  };
}

function sampleQuestions() {
  return [
    { kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, nodeId: 'nA', nodeLabel: 'Italia', l1Id: 'L1', l1Label: 'Geografia', source: 'map' },
    { kind: 'tf', text: 'Il Sole è una stella', proposed: 'vero', statementTrue: true, nodeId: 'nB', nodeLabel: 'Astro', l1Id: 'L2', l1Label: 'Scienze', source: 'map' }
  ];
}

// Roster DETERMINISTICO per i test del server (buildCredentials ora è randomizzato
// per segretezza → la casualità è coperta da live-core.test.js; qui servono
// identità note volpe-00 / panda-00 / rana-00 su cui i test fanno join).
const FIXED_IDS = ['volpe-00', 'panda-00', 'rana-00'];
function mkRoster(n) {
  return FIXED_IDS.slice(0, n).map(function (id) {
    var parts = id.split('-'), emojiKey = parts[0], num = parts[1];
    var e = LC.EMOJI_SET.find(function (x) { return x.key === emojiKey; });
    return { emojiKey: emojiKey, emoji: e ? e.emoji : '', num: num, name: '' };
  });
}

// ── Ciclo completo: join → answer → close → report ─────────────────────────
test('ciclo completo: join, autosave, indietro, finish, close, report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
  const roster = mkRoster(3);   // volpe-00, panda-00, rana-00
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'Fotosintesi', activity: 'Quiz', className: '2A' }, roster, questions: sampleQuestions() });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const st = srv.state();
  const tok = st.session.token, admin = st.session.adminToken;

  // session pubblica: niente soluzioni
  const sess = await api('/api/session?s=' + tok);
  assert.strictEqual(sess.status, 200);
  assert.strictEqual(sess.body.phase, 'lobby');
  assert.strictEqual(sess.body.questionCount, 2);
  assert.ok(Array.isArray(sess.body.emojiSet));

  // token sbagliato
  assert.strictEqual((await api('/api/session?s=nope')).status, 403);

  // join volpe-00
  const join = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1' }) });
  assert.strictEqual(join.status, 200);
  // le domande ricevute NON hanno le soluzioni
  assert.strictEqual(join.body.questions[0].correct, undefined);
  assert.strictEqual(join.body.questions[1].statementTrue, undefined);

  // identità fuori roster → 404
  const bad = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'unicorno', num: '09', deviceId: 'devX' }) });
  assert.strictEqual(bad.status, 404);

  // stessa identità da ALTRO device → 409; stesso device → rientra
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev2' }) })).status, 409);
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1' }) })).status, 200);

  // answer in lobby → 409 (non ancora avviato)
  const early = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', qIdx: 0, choice: 0, ms: 3000 }) });
  assert.strictEqual(early.status, 409);
  assert.strictEqual(early.body.error, 'not-running');

  // docente avvia
  const phase = await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  assert.strictEqual(phase.status, 200);
  assert.strictEqual(phase.body.phase, 'running');

  // answer q0 sbagliata, poi INDIETRO e la corregge
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', qIdx: 0, choice: 1, ms: 2000 }) });
  const fix = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', qIdx: 0, choice: 0, ms: 4000 }) });
  assert.strictEqual(fix.status, 200);
  // autosave su disco
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'students', 'volpe-00.json'), 'utf8'));
  assert.strictEqual(onDisk.answers['0'].choice, 0);

  // q1 con Salta
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', qIdx: 1, skipped: true, ms: 1000 }) });

  // secondo allievo: panda-00 answers both, q1 vero
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'devP' }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'devP', qIdx: 0, choice: 0, ms: 3000 }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'devP', qIdx: 1, choice: true, ms: 2000 }) });
  await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'devP' }) });

  // status docente
  const status = await api('/api/status?admin=' + admin);
  assert.strictEqual(status.status, 200);
  assert.strictEqual(status.body.joined, 2);
  assert.strictEqual(status.body.roster.length, 3);

  // chiudi → genera report
  const close = await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  assert.strictEqual(close.body.phase, 'closed');
  assert.ok(fs.existsSync(path.join(dir, 'results.json')));
  assert.ok(fs.existsSync(path.join(dir, 'report-domande.html')));
  assert.ok(fs.existsSync(path.join(dir, 'report-studenti.html')));

  const results = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  // Q0: volpe giusto (corretto dopo indietro), panda giusto → 2 giuste
  assert.strictEqual(results.perQuestion[0].right, 2);
  // Q1: volpe blank (skip), panda giusto
  assert.strictEqual(results.perQuestion[1].right, 1);
  assert.strictEqual(results.perQuestion[1].blank, 1);
  assert.strictEqual(results.absent, 1);

  // report HTML contiene il titolo mappa
  const html = await fetch('http://127.0.0.1:' + port + '/api/report?admin=' + admin + '&which=questions').then(r => r.text());
  assert.ok(html.includes('Fotosintesi'));

  // answer dopo close → 409
  const late = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'devP', qIdx: 0, choice: 0, ms: 1000 }) });
  assert.strictEqual(late.status, 409);
  assert.strictEqual(late.body.error, 'closed');

  await srv.stop();
});

// ── Release + adozione ─────────────────────────────────────────────────────
test('release docente → identità adottabile da altro device', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-rel-'));
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'X', className: '2A' }, roster: mkRoster(2), questions: sampleQuestions() });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const admin = srv.state().session.adminToken, tok = srv.state().session.token;

  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devA' }) });
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devB' }) })).status, 409);
  await api('/api/release', { method: 'POST', body: JSON.stringify({ adminToken: admin, emojiKey: 'volpe', num: '00' }) });
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devB' }) })).status, 200);
  await srv.stop();
});

// ── Resume da disco ────────────────────────────────────────────────────────
test('resume: stesso dir → stesso token, risposte intatte, fase preservata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-res-'));
  const roster = mkRoster(2);
  let srv = createLiveServer({ repoRoot, dir, session: { name: 'Y', className: '2A' }, roster, questions: sampleQuestions() });
  let port = await srv.listen(0, '127.0.0.1');
  let api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devA' }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devA', qIdx: 0, choice: 0, ms: 3000 }) });
  await srv.stop();

  // riavvio sullo stesso dir (crash a metà lezione)
  srv = createLiveServer({ repoRoot, dir, session: { name: 'DIVERSO' }, roster: [], questions: [] });
  port = await srv.listen(0, '127.0.0.1');
  api = apiFactory(port);
  const st2 = srv.state();
  assert.strictEqual(st2.session.token, tok);        // token sopravvive → QR ancora valido
  assert.strictEqual(st2.session.phase, 'running');
  const rejoin = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'devA' }) });
  assert.strictEqual(rejoin.body.answers['0'].choice, 0);   // risposta ripristinata
  await srv.stop();
});

// ── Timer auto-close ───────────────────────────────────────────────────────
test('timer: durationMin scaduto → chiusura automatica + report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-tim-'));
  // 0.003 min ≈ 180ms: abbastanza per testare il percorso reale del setTimeout
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'T', className: '2A', durationMin: 0.003 }, roster: mkRoster(1), questions: sampleQuestions() });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const admin = srv.state().session.adminToken;
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  await new Promise(r => setTimeout(r, 400));   // oltre l'endsAt
  const status = await api('/api/status?admin=' + admin);
  assert.strictEqual(status.body.session.phase, 'closed');
  assert.ok(fs.existsSync(path.join(dir, 'report-domande.html')));
  await srv.stop();
});

// ── Materiali ──────────────────────────────────────────────────────────────
test('materiali: lista + download con Content-Disposition, traversal e token', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-mat-'));
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Dispense' } });
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  fs.writeFileSync(path.join(srv.filesDir, 'sintesi.txt'), 'ciao');

  const list = await fetch('http://127.0.0.1:' + port + '/api/materials?s=' + tok).then(r => r.json());
  assert.strictEqual(list.files.length, 1);
  assert.strictEqual(list.files[0].file, 'sintesi.txt');

  // token errato → 403
  assert.strictEqual((await fetch('http://127.0.0.1:' + port + '/api/materials?s=nope')).status, 403);

  // download con Content-Disposition attachment
  const dl = await fetch('http://127.0.0.1:' + port + '/files/sintesi.txt?s=' + tok);
  assert.strictEqual(dl.status, 200);
  assert.ok((dl.headers.get('content-disposition') || '').includes('attachment'));
  assert.strictEqual(await dl.text(), 'ciao');

  // traversal → basename neutralizza, file inesistente → 404
  const trav = await fetch('http://127.0.0.1:' + port + '/files/' + encodeURIComponent('../../secret.txt') + '?s=' + tok);
  assert.strictEqual(trav.status, 404);

  await srv.stop();
});

// ── Scambio con MappAI studente (7/9): manifest del vault, file per rel, consegna ──
test('scambio: /api/vault elenca solo ciò che va allo studente, /vault/<rel> serve solo l\'elencato', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scambio-'));
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  fs.writeFileSync(path.join(vdir, 'index.yaml'), 'rootNodeLabel: Il Clima\n');
  fs.writeFileSync(path.join(vdir, 'vista.json'), '{}');
  fs.mkdirSync(path.join(vdir, 'Nodi')); fs.writeFileSync(path.join(vdir, 'Nodi', 'Clima.md'), '# Clima');
  fs.mkdirSync(path.join(vdir, 'Materiale Studio', 'Sorgenti'), { recursive: true });
  fs.writeFileSync(path.join(vdir, 'Materiale Studio', 'Quiz-MC-Clima.pdf'), '%PDF');
  fs.writeFileSync(path.join(vdir, 'Materiale Studio', 'Sorgenti', 'Domande-aperte-Clima-causa.html'), '<html>');
  fs.mkdirSync(path.join(vdir, 'Studio Attivo')); fs.writeFileSync(path.join(vdir, 'Studio Attivo', 'sessioni.jsonl'), '{}');
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' } });
  t.after(() => srv.stop());
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  const base = 'http://127.0.0.1:' + port;

  assert.strictEqual((await fetch(base + '/api/vault?s=' + tok)).status, 404, 'senza esponiVault: nessun-vault');
  const man = srv.esponiVault({ nome: 'Il Clima', dir: vdir, classe: '4R', materia: 'Geografia', rootNodeLabel: 'Il Clima' });
  assert.deepStrictEqual(man.files.map(f => f.rel).sort(), ['Materiale Studio/Sorgenti/Domande-aperte-Clima-causa.html', 'Nodi/Clima.md', 'index.yaml']);
  assert.ok(!('dir' in man), 'la cartella del Mac non viaggia');
  const r = await fetch(base + '/api/vault?s=' + tok);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
  const j = await r.json();
  assert.strictEqual(j.schema, 'mappai-vault-manifest@1');
  assert.strictEqual(j.classe, '4R');
  assert.strictEqual(j.files.find(f => f.rel === 'index.yaml').sha1, crypto.createHash('sha1').update('rootNodeLabel: Il Clima\n').digest('hex'));
  assert.ok(fs.existsSync(path.join(dir, 'vault.json')), 'crash-safe su disco');

  assert.strictEqual(await fetch(base + '/vault/index.yaml?s=' + tok).then(x => x.text()), 'rootNodeLabel: Il Clima\n');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('Nodi/Clima.md') + '?s=' + tok)).status, 200);
  assert.strictEqual((await fetch(base + '/vault/vista.json?s=' + tok)).status, 404, 'non elencato');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('Materiale Studio/Quiz-MC-Clima.pdf') + '?s=' + tok)).status, 404, 'il PDF generato non va allo studente');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('../session.json') + '?s=' + tok)).status, 404);
  assert.strictEqual((await fetch(base + '/vault/index.yaml?s=nope')).status, 403);
  assert.strictEqual((await fetch(base + '/api/vault', { method: 'OPTIONS' })).status, 204);
  await srv.stop();

  // ripresa dal disco: stesso dir → il manifest torna
  const srv2 = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' } });
  t.after(() => srv2.stop());
  const port2 = await srv2.listen(0, '127.0.0.1');
  assert.strictEqual((await fetch('http://127.0.0.1:' + port2 + '/api/vault?s=' + tok)).status, 200);
  await srv2.stop();

  // scambio spento
  const srv3 = createMaterialsServer({ repoRoot, dir: fs.mkdtempSync(path.join(os.tmpdir(), 'live-off-')), session: { name: 'x' }, scambio: false });
  t.after(() => srv3.stop());
  const port3 = await srv3.listen(0, '127.0.0.1');
  assert.strictEqual(srv3.esponiVault({ nome: 'x', dir: vdir }), null);
  assert.strictEqual((await fetch('http://127.0.0.1:' + port3 + '/api/vault?s=' + srv3.state().session.token)).status, 404);
  await srv3.stop();
});

test('scambio: POST /api/consegna scrive in Consegne/<classe-numero>/, mai sovrascrive, rifiuta il resto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-consegna-'));
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const ricevute = [];
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' },
    vaultDir: nome => nome === 'Il Clima' ? vdir : null, onConsegna: i => ricevute.push(i) });
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  const post = (b, s) => fetch('http://127.0.0.1:' + port + '/api/consegna?s=' + (s || tok), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const pdf = Buffer.from('%PDF-1.3 risposte').toString('base64');
  const ok = await post({ numero: '4517', classe: '1a', vault: 'Il Clima', sessione: 'Domande · Il Clima · 00', nome: 'risposte.pdf', base64: pdf });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.rel, 'Consegne/1A-4517/Domande · Il Clima · 00 - risposte.pdf');
  assert.strictEqual(fs.readFileSync(path.join(vdir, ok.body.rel), 'utf8'), '%PDF-1.3 risposte');
  assert.strictEqual(ricevute.length, 1);
  assert.strictEqual(ricevute[0].studente, '1A-4517');
  const bis = await post({ numero: '4517', classe: '1A', vault: 'Il Clima', sessione: 'Domande · Il Clima · 00', nome: 'risposte.pdf', base64: pdf });
  assert.strictEqual(bis.body.rel, 'Consegne/1A-4517/Domande · Il Clima · 00 - risposte (2).pdf', 'mai sovrascrivere');
  const trav = await post({ numero: '1', classe: '2B', vault: 'Il Clima', sessione: '', nome: '../../x.pdf', base64: pdf });
  assert.strictEqual(trav.status, 200); assert.strictEqual(trav.body.rel, 'Consegne/2B-1/x.pdf', 'basename');
  assert.strictEqual((await post({ numero: 'abc', classe: '1A', vault: 'Il Clima', nome: 'x.pdf', base64: pdf })).status, 400);
  assert.strictEqual((await post({ numero: '1', classe: '5A', vault: 'Il Clima', nome: 'x.pdf', base64: pdf })).status, 400);
  assert.strictEqual((await post({ numero: '1', classe: '1A', vault: 'Altra', nome: 'x.pdf', base64: pdf })).status, 404);
  assert.strictEqual((await post({ numero: '1', classe: '1A', vault: 'Il Clima', nome: 'x.pdf', base64: pdf }, 'nope')).status, 403);
  await srv.stop();
});

// ── Timeline Live (008): sessione mode/loginMode/hintMode + hintUsed persistito ──
test('session espone mode/loginMode/hintMode; /api/answer persiste hintUsed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-tl-'));
  const roster = mkRoster(2);
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Storia', activity: 'timeline', className: '3A', hintMode: 'onrequest' },
    roster,
    questions: [{ kind: 'open', text: 'Nel 1947?', answerText: 'Piano Marshall', hint: 'aiuti', tlYear: 1947, source: 'timeline' }]
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const st = srv.state();
  const tok = st.session.token, admin = st.session.adminToken;

  const sess = await api('/api/session?s=' + tok);
  assert.strictEqual(sess.body.mode, 'quiz');            // default storico
  assert.strictEqual(sess.body.loginMode, 'individual'); // default storico
  assert.strictEqual(sess.body.hintMode, 'onrequest');
  // l'indizio (contesto) viaggia; la soluzione no
  assert.strictEqual(sess.body.build, null);

  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  const ans = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, text: 'Piano Marshall', ms: 900, hintUsed: true }) });
  assert.strictEqual(ans.status, 200);

  const stFile = JSON.parse(fs.readFileSync(path.join(dir, 'students', 'volpe-00.json'), 'utf8'));
  assert.strictEqual(stFile.answers['0'].hintUsed, true);
  await srv.stop();
});

// ── Timeline Costruisci (008): propose / review / cap / report ──────────────
function buildSrv(dir, roster) {
  return createLiveServer({
    repoRoot, dir,
    session: {
      name: 'Storia', activity: 'timeline', className: '3A', mode: 'build', loginMode: 'individual',
      build: { gaps: [{ year: 1962, hint: 'missili' }], freeAllowed: true, maxProposals: 2, sourceYears: [1962, 1989], poolKeys: ['1947|piano marshall'] }
    },
    roster, questions: []
  });
}

test('build: propose ok/422/429, review idempotenza/409, flags, close report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-build-'));
  const roster = mkRoster(2);
  const srv = buildSrv(dir, roster);
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const st = srv.state();
  const tok = st.session.token, admin = st.session.adminToken;

  const sess = await api('/api/session?s=' + tok);
  assert.strictEqual(sess.body.mode, 'build');
  assert.ok(sess.body.build && sess.body.build.gaps.length === 1);
  assert.strictEqual(sess.body.build.sourceYears, undefined); // MAI esposti

  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });

  // proposta valida per un buco
  const p1 = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1962, evento: 'Crisi di Cuba', gapYear: 1962 }) });
  assert.strictEqual(p1.status, 200);
  // proposta con anno non nelle fonti (in range 1000..2100 ma non in sourceYears) → flag
  const p2 = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1800, evento: 'Anno non citato' }) });
  assert.ok(p2.body.proposal.flags.yearNotInSources);
  // duplicato del pool (poolKeys) → flag
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'd2' }) });
  const p3 = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'd2', anno: 1947, evento: 'Piano Marshall' }) });
  assert.ok(p3.body.proposal.flags.duplicate);
  // proposta malformata → 422
  const bad = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'd2', anno: 50, evento: '' }) });
  assert.strictEqual(bad.status, 422);
  // cap: volpe ha già 2 (max 2) → 429
  const cap = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1500, evento: 'Terza' }) });
  assert.strictEqual(cap.status, 429);

  // propose su sessione quiz → 404
  // review: approva p1
  const rev = await api('/api/review', { method: 'POST', body: JSON.stringify({ adminToken: admin, proposalId: p1.body.proposal.id, action: 'approve' }) });
  assert.strictEqual(rev.status, 200);
  assert.strictEqual(rev.body.proposal.status, 'approved');
  // ripetere stessa action → ok idempotente
  assert.strictEqual((await api('/api/review', { method: 'POST', body: JSON.stringify({ adminToken: admin, proposalId: p1.body.proposal.id, action: 'approve' }) })).status, 200);
  // cambiare dopo review → 409
  assert.strictEqual((await api('/api/review', { method: 'POST', body: JSON.stringify({ adminToken: admin, proposalId: p1.body.proposal.id, action: 'reject' }) })).status, 409);

  // cap liberato: bocciamo p2 poi volpe può riproporre
  await api('/api/review', { method: 'POST', body: JSON.stringify({ adminToken: admin, proposalId: p2.body.proposal.id, action: 'reject' }) });
  const again = await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1500, evento: 'Ora ci sta' }) });
  assert.strictEqual(again.status, 200);

  // status espone le proposte
  const status = await api('/api/status?admin=' + admin);
  assert.ok(Array.isArray(status.body.proposals) && status.body.proposals.length >= 3);

  // close → report costruzione con timeline finale
  await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  assert.ok(fs.existsSync(path.join(dir, 'report-costruzione.html')));
  const rep = fs.readFileSync(path.join(dir, 'report-costruzione.html'), 'utf8');
  assert.ok(rep.includes('Timeline finale della classe'));
  assert.ok(rep.includes('Crisi di Cuba')); // approvata in timeline finale
  await srv.stop();
});

test('build: propose su sessione quiz → 404; ripresa da disco con proposte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-quiz-'));
  const roster = mkRoster(1);
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'Q', activity: 'Quiz' }, roster, questions: [{ kind: 'open', text: 'x', answerText: 'y' }] });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual((await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1900, evento: 'X' }) })).status, 404);
  await srv.stop();

  // ripresa build con proposte su disco
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'live-b2-'));
  const roster2 = mkRoster(1);
  const s1 = buildSrv(dir2, roster2);
  const port2 = await s1.listen(0, '127.0.0.1');
  const api2 = apiFactory(port2);
  const tok2 = s1.state().session.token;
  await api2('/api/join', { method: 'POST', body: JSON.stringify({ token: tok2, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api2('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok2, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1962, evento: 'Crisi' }) });
  await s1.stop();
  const s2 = buildSrv(dir2, roster2);          // stesso dir → RIPRESA
  const port3 = await s2.listen(0, '127.0.0.1');
  const api3 = apiFactory(port3);
  const tok3 = s2.state().session.token;
  assert.strictEqual(tok3, tok2);              // stesso token
  const rejoin = await api3('/api/join', { method: 'POST', body: JSON.stringify({ token: tok3, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.ok((rejoin.body.proposals || []).length === 1); // proposta ritrovata
  await s2.stop();
});

// ── Login flessibile (008 US5): live-server loginMode 'group' ───────────────
test('live loginMode group: join per nickname, 409 altro device, report per gruppo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-grp-'));
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Q', activity: 'timeline', className: '3A', loginMode: 'group' },
    roster: [], questions: [{ kind: 'open', text: 'Nel 1947?', answerText: 'Piano Marshall', tlYear: 1947 }]
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const st = srv.state(); const tok = st.session.token, admin = st.session.adminToken;
  assert.strictEqual((await api('/api/session?s=' + tok)).body.loginMode, 'group');

  const j1 = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, nick: 'I Galli', deviceId: 'd1' }) });
  assert.strictEqual(j1.status, 200);
  assert.strictEqual(j1.body.displayName, 'I Galli');
  // stesso nick altro device → 409
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, nick: 'I Galli', deviceId: 'dX' }) })).status, 409);
  // stesso device → ripresa ok
  assert.strictEqual((await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, nick: 'I Galli', deviceId: 'd1' }) })).status, 200);

  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, nick: 'I Galli', deviceId: 'd1', qIdx: 0, text: 'Piano Marshall', ms: 900 }) });
  await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  const rep = fs.readFileSync(path.join(dir, 'report-studenti.html'), 'utf8');
  assert.ok(rep.includes('I Galli'));   // report aggregato per gruppo
  await srv.stop();
});

test('reveal risposte: /api/finish ritorna il risultato; my-result gated su consegna', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-reveal-'));
  const roster = mkRoster(1);   // volpe-00
  const qs = [
    { kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, explanation: 'Roma.', source: 'map' },
    { kind: 'tf', text: 'Il Sole è una stella', proposed: 'vero', statementTrue: true, source: 'map' }
  ];
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'X', activity: 'Quiz', className: '2A', revealAnswers: true }, roster, questions: qs });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;

  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 0, ms: 1500 }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 1, choice: false, ms: 1200 }) });

  // PRIMA della consegna: my-result senza soluzioni (submitted=false)
  const before = await api('/api/my-result?s=' + tok + '&emojiKey=volpe&num=00&deviceId=d1');
  assert.strictEqual(before.status, 200);
  assert.strictEqual(before.body.submitted, false);
  assert.strictEqual(before.body.result.perQuestion[0].correctText, undefined);   // niente soluzioni prima di consegnare

  // consegna → il risultato torna CON soluzioni (revealAnswers ON)
  const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(fin.status, 200);
  assert.strictEqual(fin.body.revealAnswers, true);
  assert.strictEqual(fin.body.result.right, 1);
  assert.strictEqual(fin.body.result.wrong, 1);
  assert.strictEqual(fin.body.result.accuracyPct, 50);
  assert.strictEqual(fin.body.result.perQuestion[0].correctText, 'Roma');
  assert.strictEqual(fin.body.result.perQuestion[0].explanation, 'Roma.');

  // device sbagliato → 403
  assert.strictEqual((await api('/api/my-result?s=' + tok + '&emojiKey=volpe&num=00&deviceId=ALTRO')).status, 403);
  await srv.stop();
});

test('reveal OFF: /api/finish non manda soluzioni', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-noreveal-'));
  const roster = mkRoster(1);
  const qs = [{ kind: 'mc', text: 'Q', options: ['A', 'B'], correct: 0, explanation: 'x', source: 'map' }];
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'X', activity: 'Quiz', className: '2A', revealAnswers: false }, roster, questions: qs });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 1, ms: 1000 }) });
  const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(fin.body.revealAnswers, false);
  assert.strictEqual(fin.body.result.perQuestion[0].correctText, undefined);   // niente soluzioni
  assert.strictEqual(fin.body.result.perQuestion[0].outcome, 'wrong');          // ma l'esito sì
  await srv.stop();
});

// ══════════════ «Domande a scelta» (mode: 'scelta') ════════════════════════
// Il pool arriva intero e il SERVER lo campiona per studente: al telefono va
// una domanda per (area × angolo), senza angolo e senza soluzioni.
const SC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-scelta-core.js'));

function sceltaPool() {
  // 2 rami × 2 angoli × 3 varianti = 12 grezze → campionate a 4 (una per coppia)
  const fogli = [];
  ['causa', 'esempio'].forEach(ang => {
    ['Oceani', 'Atmosfera'].forEach(ramo => {
      fogli.push({
        titolo: 'Domande-aperte-Clima-' + ang + '-' + ramo, angle: ang, tipo: 'open',
        items: [1, 2, 3].map(i => ({ domanda: 'Domanda ' + ang + ' ' + ramo + ' n' + i, ramo: ramo, livello: 'base' }))
      });
    });
  });
  return SC.poolDaFogli(fogli);
}

test('scelta: join campiona per studente, stato, finish con profilo, close con report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-'));
  const roster = mkRoster(2);
  const pool = sceltaPool();
  assert.strictEqual(pool.length, 12);
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Domande a scelta', className: '2A', mode: 'scelta', scelta: { minimo: 1, minimoAree: 1 } },
    roster, questions: pool
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;

  // la sessione dichiara modalità e config
  const sess = await api('/api/session?s=' + tok);
  assert.strictEqual(sess.body.mode, 'scelta');
  assert.strictEqual(sess.body.scelta.minimo, 1);

  // join → pool campionato: 2 rami × 2 angoli = 4 domande, zero angoli a bordo
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(j.status, 200);
  assert.strictEqual(j.body.pool.length, 4);
  j.body.pool.forEach(v => {
    assert.strictEqual(v.angle, undefined, 'l\'angolo non deve mai uscire dal server');
    assert.strictEqual(v.giusta, undefined);
    assert.strictEqual(v.foglio, undefined);
  });
  const ids = j.body.pool.map(v => v.id);

  // rientro: le SUE domande, identiche (la scelta è persistita, non ricalcolata)
  const j2 = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.deepStrictEqual(j2.body.pool.map(v => v.id), ids);

  // stato: aree, fase, letture (anche su una domanda NON presa) e risposte
  const st = await api('/api/stato', {
    method: 'POST', body: JSON.stringify({
      token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1',
      stato: {
        aree: ['Oceani', 'INVENTATA'], fase: 'rispondi',
        letture: { [ids[0]]: { chip: 'subito' }, [ids[1]]: { chip: 'niente' }, 'id-finto': { chip: 'subito' } },
        risposte: { [ids[0]]: { testo: 'la mia risposta' } },
        note: 'ho scelto quelle che ricordavo'
      }
    })
  });
  assert.strictEqual(st.status, 200);
  assert.strictEqual(st.body.conteggio.scritte, 1);
  assert.strictEqual(st.body.conteggio.lette, 2);
  assert.strictEqual(st.body.conteggio.spente, 1);

  // sul disco: niente aree inventate, niente id fuori dal pool servito
  const suDisco = JSON.parse(fs.readFileSync(path.join(dir, 'students', 'volpe-00.json'), 'utf8'));
  assert.deepStrictEqual(suDisco.stato.aree, ['Oceani']);
  assert.strictEqual(Object.keys(suDisco.stato.letture).length, 2);

  // /api/answer non è la strada di questa attività
  const ans = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, text: 'x' }) });
  assert.ok(ans.status >= 400);

  // consegna → il profilo (che PARLA di angoli) esce solo ora
  const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(fin.status, 200);
  assert.strictEqual(fin.body.reveal, true);
  assert.ok(fin.body.profilo.righe.length >= 2);
  assert.strictEqual(fin.body.profilo.conteggio.scritte, 1);
  assert.deepStrictEqual(fin.body.profilo.aree, ['Oceani']);

  // un secondo allievo: il campionamento è per identità
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'd2' }) });

  // chiusura → report + results
  const cl = await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  assert.strictEqual(cl.status, 200);
  const res = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  assert.strictEqual(res.mode, 'scelta');
  assert.strictEqual(res.joined, 2);
  assert.strictEqual(res.consegnato, 1);
  assert.ok(res.aree.length >= 2, 'il calore delle aree');
  assert.ok(res.angoli.length >= 2, 'il calore dei tagli');
  const mio = res.byStudent.find(a => a.id === 'volpe-00');
  assert.strictEqual(mio.risposte.length, 1);
  assert.ok(mio.risposte[0].angle, 'nel report l\'angolo c\'è (al docente serve)');
  assert.strictEqual(mio.spenti.length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'report-scelta.html')));

  const rep = await fetch('http://127.0.0.1:' + port + '/api/report?admin=' + admin + '&which=scelta');
  assert.strictEqual(rep.status, 200);
  await srv.stop();
});

test('scelta: reveal OFF → alla consegna nessun profilo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-nr-'));
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Domande a scelta', className: '2A', mode: 'scelta', scelta: { reveal: false } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(fin.body.reveal, false);
  assert.strictEqual(fin.body.profilo, null);
  await srv.stop();
});

test('scelta: la pagina studente e i suoi moduli sono serviti', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-st-'));
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', activity: 'Domande a scelta', className: '2A', mode: 'scelta' },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  const r = await fetch('http://127.0.0.1:' + port + '/', { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.ok(r.headers.get('location').indexOf('/public/live/scelta.html?s=' + tok) === 0, r.headers.get('location'));
  for (const f of ['/public/live/scelta.html', '/public/js/mappai-scelta-core.js', '/public/js/mappai-scelta-view.js']) {
    assert.strictEqual((await fetch('http://127.0.0.1:' + port + f)).status, 200, f);
  }
  await srv.stop();
});

test('scelta: la coda dopo la consegna non annulla la consegna, e l\'evitata è pubblica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-pn-'));
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Domande a scelta', className: '2A', mode: 'scelta', scelta: { minimo: 1, minimoAree: 1, perche_no: true, secondo_giro: true } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  const id0 = j.body.pool[0].id;
  await api('/api/stato', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', stato: { risposte: { [id0]: { testo: 'ok' } } } }) });

  const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.ok(fin.body.evitata, 'con perche_no acceso arriva una domanda evitata');
  assert.strictEqual(fin.body.evitata.giusta, undefined, 'la soluzione non deve arrivare al telefono');
  assert.strictEqual(fin.body.evitata.foglio, undefined);
  assert.ok(fin.body.evitata.testo && fin.body.evitata.id);

  // la nota del «perché no?» si scrive DOPO la consegna: non la annulla
  await api('/api/stato', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', dopoConsegna: true, stato: { risposte: { [id0]: { testo: 'ok' } }, evitata: { id: fin.body.evitata.id, why: 'non la capivo' } } }) });
  const stt = await api('/api/status?admin=' + admin);
  assert.strictEqual(stt.body.roster[0].finished, true, 'la consegna resta');
  assert.strictEqual(stt.body.roster[0].answered, 1, 'la dashboard conta le risposte SCRITTE');

  // senza il flag, salvare vuol dire aver ripreso a lavorare
  // (lo stato viaggia INTERO: il client rimanda anche l'evitata già scritta)
  await api('/api/stato', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', stato: { risposte: { [id0]: { testo: 'ok2' } }, evitata: { id: fin.body.evitata.id, why: 'non la capivo' } } }) });
  assert.strictEqual((await api('/api/status?admin=' + admin)).body.roster[0].finished, false);

  // /api/my-result non esiste in questa modalità
  assert.strictEqual((await api('/api/my-result?s=' + tok + '&emojiKey=volpe&num=00&deviceId=d1')).status, 404);

  await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  const res = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  assert.strictEqual(res.byStudent[0].evitata.why, 'non la capivo', 'il «perché no?» arriva nel report');
  assert.ok(res.byStudent[0].evitata.testo);
  await srv.stop();
});

test('scelta: ripresa senza il pool → non parte, invece di consumare le risposte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-rip-'));
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', activity: 'Domande a scelta', className: '2A', mode: 'scelta' },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/stato', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', stato: { risposte: { [j.body.pool[0].id]: { testo: 'RISPOSTA IMPORTANTE' } } } }) });
  await srv.stop();

  // il file delle domande sparisce (disco, sincronizzazione, scrittura a metà)
  fs.unlinkSync(path.join(dir, 'questions.json'));
  assert.throws(() => createLiveServer({ repoRoot, dir }), /irrecuperabile/);
  // e la risposta è ancora lì
  const st = JSON.parse(fs.readFileSync(path.join(dir, 'students', 'volpe-00.json'), 'utf8'));
  assert.ok(JSON.stringify(st.stato.risposte).indexOf('RISPOSTA IMPORTANTE') >= 0);
});

// ── «Quiz a scelta» via QR: pool a scelta multipla, correzione dal DATO ──────
function sceltaPoolMc() {
  return SC.poolDaFogli([{
    titolo: 'Clima — Scelta multipla · causa', angle: 'causa', tipo: 'mc',
    items: [
      { q: 'Perché il mare mitiga il clima?', options: ['alta capacità termica', 'è salato', 'è profondo'], correct: 'alta capacità termica', ramo: 'Oceani' },
      { q: 'Perché si formano le correnti?', options: ['vento e densità', 'la luna', 'le maree'], correct: 'vento e densità', ramo: 'Atmosfera' }
    ]
  }]);
}

test('scelta mc: le opzioni viaggiano, la soluzione no, il report corregge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-scelta-mc-'));
  const pool = sceltaPoolMc();
  assert.ok(pool.every(v => v.tipo === 'mc' && v.giusta === 0), 'la risposta esatta si risolve dalla stringa');
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Quiz a scelta', className: '2A', mode: 'scelta', scelta: { minimo: 1, minimoAree: 1 } },
    roster: mkRoster(1), questions: pool
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;

  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(j.body.pool.length, 2, 'due rami × un angolo × un genere');
  j.body.pool.forEach(v => {
    assert.ok(Array.isArray(v.opzioni) && v.opzioni.length === 3, 'le opzioni servono a rispondere: viaggiano');
    assert.strictEqual(v.giusta, undefined, 'la soluzione resta sul server');
    assert.strictEqual(v.angle, undefined);
  });

  // una giusta e una sbagliata
  const ids = j.body.pool.map(v => v.id);
  const giusto = {}, opz = {};
  j.body.pool.forEach(v => { opz[v.id] = v.opzioni; });
  await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1',
    stato: { risposte: { [ids[0]]: { scelta: 0 }, [ids[1]]: { scelta: 2 } } }
  }) });
  void giusto;

  await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  const res = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  const mie = res.byStudent[0].risposte;
  assert.strictEqual(mie.length, 2);
  assert.strictEqual(mie.filter(r => r.corretta === true).length, 1, 'una giusta');
  assert.strictEqual(mie.filter(r => r.corretta === false).length, 1, 'una sbagliata');
  assert.ok(mie.every(r => r.risposta), 'nel report c\'è il testo dell\'opzione scelta, non l\'indice');
  const html = fs.readFileSync(path.join(dir, 'report-scelta.html'), 'utf8');
  assert.ok(html.indexOf('a scelta multipla') >= 0, 'la scheda conta i due generi separati');
  await srv.stop();
});

test('feedback immediato: verdetto col salvataggio, e la risposta corretta è DEFINITIVA', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-'));
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Quiz a scelta', className: '2A', mode: 'scelta', feedbackImmediato: true },
    roster: mkRoster(1), questions: sceltaPoolMc()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  assert.strictEqual((await api('/api/session?s=' + tok)).body.feedbackImmediato, true);

  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  const q0 = j.body.pool[0], q1 = j.body.pool[1];
  const iGiusto = (q) => Math.max(q.opzioni.indexOf('alta capacità termica'), q.opzioni.indexOf('vento e densità'));

  // risposta GIUSTA → esito right, e nessun testo di soluzione (non serve)
  let r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', id: q0.id,
    stato: { risposte: { [q0.id]: { scelta: iGiusto(q0) } } } }) });
  assert.strictEqual(r.body.verdetto.esito, 'right');
  assert.strictEqual(r.body.verdetto.giusta, undefined);

  // risposta SBAGLIATA sull'ALTRA domanda → wrong + il testo giusto (è il feedback)
  const iSbagliato = (iGiusto(q1) + 1) % q1.opzioni.length;
  r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', id: q1.id,
    stato: { risposte: { [q0.id]: { scelta: iGiusto(q0) }, [q1.id]: { scelta: iSbagliato } } } }) });
  assert.strictEqual(r.body.verdetto.esito, 'wrong');
  assert.ok(r.body.verdetto.giusta, 'chi sbaglia riceve la risposta giusta');

  // ⚠️ IL PUNTO: letta la soluzione, si riscrive la risposta. Il server non deve
  // accettarla — il blocco lato telefono non difende il dato del docente.
  r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', id: q1.id,
    stato: { risposte: { [q0.id]: { scelta: iGiusto(q0) }, [q1.id]: { scelta: iGiusto(q1) } } } }) });
  assert.strictEqual(r.body.verdetto.esito, 'wrong', 'il verdetto resta quello dato');
  const suDisco = JSON.parse(fs.readFileSync(path.join(dir, 'students', 'volpe-00.json'), 'utf8'));
  assert.strictEqual(suDisco.stato.risposte[q1.id].scelta, iSbagliato, 'e sul disco resta la risposta vera');

  // ⚠️ senza dichiarare QUALE domanda, nessun verdetto: non si sfoglia il pool
  r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1',
    stato: { risposte: { [q0.id]: { scelta: iGiusto(q0) } } } }) });
  assert.strictEqual(r.body.verdetto, null);

  // al RIENTRO i verdetti tornano dal server: un ricaricamento non sblocca niente
  const j2 = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(Object.keys(j2.body.verdetti).length, 2);
  assert.strictEqual(j2.body.verdetti[q1.id].esito, 'wrong');
  await srv.stop();
});

test('feedback immediato SPENTO (default): niente verdetto, come prima', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-off-'));
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', activity: 'Quiz a scelta', className: '2A', mode: 'scelta' },
    roster: mkRoster(1), questions: sceltaPoolMc()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  assert.strictEqual((await api('/api/session?s=' + tok)).body.feedbackImmediato, false);
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  const q0 = j.body.pool[0];
  const r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', id: q0.id,
    stato: { risposte: { [q0.id]: { scelta: 0 } } } }) });
  assert.strictEqual(r.body.verdetto, null);
  await srv.stop();
});

test('feedback immediato nel quiz storico: /api/answer porta il verdetto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-quiz-'));
  const qs = [{ kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, explanation: 'È Roma.', source: 'map' }];
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'X', activity: 'Quiz', className: '2A', feedbackImmediato: true },
    roster: mkRoster(1), questions: qs
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  const r = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 1, ms: 900 }) });
  assert.strictEqual(r.body.verdetto.esito, 'wrong');
  assert.strictEqual(r.body.verdetto.giusta, 'Roma');
  assert.strictEqual(r.body.verdetto.spiegazione, 'È Roma.');
  // le domande servite restano senza soluzioni: il verdetto non è una scorciatoia
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(j.body.questions[0].correct, undefined);
  await srv.stop();
});

test('feedback immediato (quiz storico): seconda mano rifiutata, «Salta» non cancella', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-lock-'));
  const qs = [{ kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, explanation: 'È Roma.', source: 'map' }];
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'X', activity: 'Quiz', className: '2A', feedbackImmediato: true },
    roster: mkRoster(1), questions: qs
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });

  // tiro a caso: sbagliato, e il server mi dice qual era la giusta
  let r = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 1, ms: 900 }) });
  assert.strictEqual(r.body.verdetto.esito, 'wrong');
  assert.strictEqual(r.body.verdetto.giusta, 'Roma');

  // ⚠️ ora la riscrivo con la soluzione letta: il server rifiuta
  r = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 0, ms: 200 }) });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.error, 'already-graded');

  // ⚠️ e nemmeno «Salta» cancella una risposta già corretta
  r = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, skipped: true }) });
  assert.strictEqual(r.status, 409);

  // il report del docente dice la verità
  await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  const res = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  assert.strictEqual(res.perStudent[0].rightCount, 0, 'zero giuste, non una');

  // al rientro il verdetto torna col join (sta dentro `answers`, cioè su disco)
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual(j.body.answers[0].verdetto.esito, 'wrong');
  await srv.stop();
});

test('feedback immediato: una domanda aperta da correggere a mano NON riceve un verdetto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-manual-'));
  // `open` senza answerText → gradeAnswer torna 'manual': la corregge il docente
  const qs = [{ kind: 'open', text: 'Spiega la fotosintesi', explanation: 'Vedi il ramo Piante.', source: 'map' }];
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'X', activity: 'Quiz', className: '2A', feedbackImmediato: true },
    roster: mkRoster(1), questions: qs
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  const r = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, text: 'La pianta converte la luce in zuccheri', ms: 4000 }) });
  assert.strictEqual(r.body.verdetto, null, 'niente «Sbagliato» su ciò che nessuno ha corretto');
  // e resta modificabile: non è stata chiusa da un verdetto che non c'è
  const r2 = await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, text: 'Meglio: la clorofilla cattura la luce', ms: 3000 }) });
  assert.strictEqual(r2.status, 200);
  await srv.stop();
});

test('feedback immediato: la spiegazione arriva col verdetto, mai prima', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fb-sp-'));
  const pool = SC.poolDaFogli([{ titolo: 'Clima — Scelta multipla · causa', angle: 'causa', tipo: 'mc',
    items: [{ q: 'Perché il mare mitiga?', options: ['capacità termica', 'è salato'], correct: 'capacità termica',
              explanation: 'L\'acqua accumula calore.', ramo: 'Oceani' }] }]);
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', activity: 'Quiz a scelta', className: '2A', mode: 'scelta', feedbackImmediato: true },
    roster: mkRoster(1), questions: pool
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  const q = j.body.pool[0];
  assert.strictEqual(q.spiegazione, undefined, 'prima di rispondere la spiegazione non viaggia');
  const sbagliata = q.opzioni.indexOf('è salato');
  const r = await api('/api/stato', { method: 'POST', body: JSON.stringify({
    token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', id: q.id,
    stato: { risposte: { [q.id]: { scelta: sbagliata } } } }) });
  assert.strictEqual(r.body.verdetto.esito, 'wrong');
  assert.strictEqual(r.body.verdetto.spiegazione, 'L\'acqua accumula calore.');
  await srv.stop();
});
