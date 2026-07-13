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

// ── Ciclo completo: join → answer → close → report ─────────────────────────
test('ciclo completo: join, autosave, indietro, finish, close, report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
  const roster = LC.buildCredentials(3);   // volpe-00, panda-00, rana-00
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
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'X', className: '2A' }, roster: LC.buildCredentials(2), questions: sampleQuestions() });
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
  const roster = LC.buildCredentials(2);
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
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'T', className: '2A', durationMin: 0.003 }, roster: LC.buildCredentials(1), questions: sampleQuestions() });
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

// ── Timeline Live (008): sessione mode/loginMode/hintMode + hintUsed persistito ──
test('session espone mode/loginMode/hintMode; /api/answer persiste hintUsed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-tl-'));
  const roster = LC.buildCredentials(2);
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
  const roster = LC.buildCredentials(2);
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
  const roster = LC.buildCredentials(1);
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'Q', activity: 'Quiz' }, roster, questions: [{ kind: 'open', text: 'x', answerText: 'y' }] });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual((await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1900, evento: 'X' }) })).status, 404);
  await srv.stop();

  // ripresa build con proposte su disco
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'live-b2-'));
  const roster2 = LC.buildCredentials(1);
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
