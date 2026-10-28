'use strict';
/*
 * live-server.test.js — server LAN MappAI Live, headless
 * (pattern di collab-server.test.js: porta effimera, fetch reali, disco temp)
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { createLiveServer, createMaterialsServer } = require(path.join(__dirname, '..', 'live-server.js'));

// Le cartelle temporanee dei test si tolgono alla fine del file (25/9): prima ne
// restavano decine a ogni giro della suite in $TMPDIR (3898 dal 23/9).
const _cartelleTmp = [];
function tmpDir(prefisso) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefisso));
  _cartelleTmp.push(d);
  return d;
}

/* una riga di richiesta che `fetch` non manderebbe mai: si scrive sul socket.
   Torna la riga di stato, o 'appesa' se il server non risponde. */
function grezza(port, target) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write('GET ' + target + ' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let dati = '';
    s.setEncoding('utf8');
    s.setTimeout(2000, () => { s.destroy(); resolve('appesa'); });
    s.on('data', d => { dati += d; });
    s.on('end', () => resolve(dati.split('\r\n')[0]));
    s.on('error', reject);
  });
}
const LC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-live-core.js'));
const FC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-files-core.js'));

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
  const dir = tmpDir('live-test-');
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
  assert.ok(fs.existsSync(path.join(dir, 'report-allievi.html')));

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
  const dir = tmpDir('live-rel-');
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
  const dir = tmpDir('live-res-');
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
  const dir = tmpDir('live-tim-');
  // 0.003 min ≈ 180ms: abbastanza per testare il percorso reale del setTimeout
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'T', className: '2A', durationMin: 0.003 }, roster: mkRoster(1), questions: sampleQuestions() });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const admin = srv.state().session.adminToken;
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  // si chiede finché la sessione risulta chiusa, con un tetto largo: un'attesa
  // fissa di 400 ms su un timer di 180 ms falliva sulle macchine lente (25/9)
  let status;
  for (const t0 = Date.now(); Date.now() - t0 < 5000;) {
    status = await api('/api/status?admin=' + admin);
    if (status.body.session.phase === 'closed' && fs.existsSync(path.join(dir, 'report-domande.html'))) break;
    await new Promise(r => setTimeout(r, 25));
  }
  assert.strictEqual(status.body.session.phase, 'closed');
  assert.ok(fs.existsSync(path.join(dir, 'report-domande.html')));
  await srv.stop();
});

// ── Materiali ──────────────────────────────────────────────────────────────
test('materiali: lista + download con Content-Disposition, traversal e token', async () => {
  const dir = tmpDir('live-mat-');
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

test('materiali: un nome con «—» e apostrofo tipografico si scarica (25/9)', async (t) => {
  const dir = tmpDir('live-mat-nome-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Dispense' } });
  const port = await srv.listen(0, '127.0.0.1');
  t.after(() => srv.stop());
  const tok = srv.state().session.token;
  // prima: writeHead lanciava ERR_INVALID_CHAR e la richiesta restava appesa
  const nome = 'Quiz — l’acqua (città).pdf';
  fs.writeFileSync(path.join(srv.filesDir, nome), '%PDF-1.4 prova');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  const dl = await fetch('http://127.0.0.1:' + port + '/files/' + encodeURIComponent(nome) + '?s=' + tok, { signal: ctl.signal });
  clearTimeout(timer);
  assert.strictEqual(dl.status, 200);
  const cd = dl.headers.get('content-disposition') || '';
  assert.ok(cd.startsWith('attachment; filename="Quiz _ l_acqua (citta).pdf"'), cd);
  assert.ok(cd.includes("filename*=UTF-8''Quiz%20%E2%80%94%20l%E2%80%99acqua%20%28citt%C3%A0%29.pdf"), cd);
  assert.strictEqual(await dl.text(), '%PDF-1.4 prova');
});

// ── Scambio con MappAI studente (7/9): manifest del vault, file per rel, consegna ──
test('scambio: /api/vault elenca solo ciò che va allo studente, /vault/<rel> serve solo l\'elencato', async (t) => {
  const dir = tmpDir('live-scambio-');
  const vdir = tmpDir('vault-');
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
  const tokV = tok + '-' + FC.chiaveVault('Il Clima');   // il QR «Vault su iPad» nomina la mappa (0109)
  const base = 'http://127.0.0.1:' + port;

  assert.strictEqual((await fetch(base + '/api/vault?s=' + tok)).status, 404, 'senza esponiVault: nessun-vault');
  const man = srv.esponiVault({ nome: 'Il Clima', dir: vdir, classe: '4R', materia: 'Geografia', rootNodeLabel: 'Il Clima' });
  assert.deepStrictEqual(man.files.map(f => f.rel).sort(), ['Materiale Studio/Sorgenti/Domande-aperte-Clima-causa.html', 'Nodi/Clima.md', 'index.yaml']);
  assert.ok(!('dir' in man), 'la cartella del Mac non viaggia');
  const r = await fetch(base + '/api/vault?s=' + tokV);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
  const j = await r.json();
  assert.strictEqual(j.schema, 'mappai-vault-manifest@1');
  assert.strictEqual(j.classe, '4R');
  assert.strictEqual(j.files.find(f => f.rel === 'index.yaml').sha1, crypto.createHash('sha1').update('rootNodeLabel: Il Clima\n').digest('hex'));
  assert.ok(fs.existsSync(path.join(dir, 'vault.json')), 'crash-safe su disco');

  assert.strictEqual(await fetch(base + '/vault/index.yaml?s=' + tokV).then(x => x.text()), 'rootNodeLabel: Il Clima\n');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('Nodi/Clima.md') + '?s=' + tokV)).status, 200);
  assert.strictEqual((await fetch(base + '/vault/vista.json?s=' + tokV)).status, 404, 'non elencato');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('Materiale Studio/Quiz-MC-Clima.pdf') + '?s=' + tokV)).status, 404, 'il PDF generato non va allo studente');
  assert.strictEqual((await fetch(base + '/vault/' + encodeURIComponent('../session.json') + '?s=' + tokV)).status, 404);
  assert.strictEqual((await fetch(base + '/vault/index.yaml?s=nope')).status, 403);
  assert.strictEqual((await fetch(base + '/api/vault', { method: 'OPTIONS' })).status, 204);
  await srv.stop();

  // ripresa dal disco: stesso dir → il manifest torna
  const srv2 = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' } });
  t.after(() => srv2.stop());
  const port2 = await srv2.listen(0, '127.0.0.1');
  assert.strictEqual((await fetch('http://127.0.0.1:' + port2 + '/api/vault?s=' + tokV)).status, 200);
  await srv2.stop();

  // scambio spento
  const srv3 = createMaterialsServer({ repoRoot, dir: tmpDir('live-off-'), session: { name: 'x' }, scambio: false });
  t.after(() => srv3.stop());
  const port3 = await srv3.listen(0, '127.0.0.1');
  assert.strictEqual(srv3.esponiVault({ nome: 'x', dir: vdir }), null);
  assert.strictEqual((await fetch('http://127.0.0.1:' + port3 + '/api/vault?s=' + srv3.state().session.token)).status, 404);
  await srv3.stop();
});

/* 0109: l'iPad riceve SOLO la mappa che il QR nomina. I tre casi del difetto, col
   server vero: riavvio (vault.json ricaricato, stesso token), cambio di progetto
   (un QR di documento porta solo il token), QR di A dopo la condivisione di B. */
test('scambio: ogni mappa risponde solo al suo QR — riavvio, cambio di mappa, QR vecchio (0109)', async (t) => {
  const dir = tmpDir('live-0109-');
  const vaultDi = (nome) => {
    const d = tmpDir('vault-0109-');
    fs.writeFileSync(path.join(d, 'index.yaml'), 'rootNodeLabel: ' + nome + '\n');
    return d;
  };
  const dirA = vaultDi('Il Clima'), dirB = vaultDi('La Città');
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' } });
  t.after(() => srv.stop());
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  const conA = tok + '-' + FC.chiaveVault('Il Clima');
  const conB = tok + '-' + FC.chiaveVault('La Città');
  const su = (p) => fetch('http://127.0.0.1:' + port + p);

  srv.esponiVault({ nome: 'Il Clima', dir: dirA });
  assert.strictEqual((await su('/api/vault?s=' + conA).then(r => r.json())).nome, 'Il Clima', 'il QR di A riceve A');
  // caso 2: il QR di un documento (solo il token) non porta una mappa
  const nudo = await su('/api/vault?s=' + tok);
  assert.strictEqual(nudo.status, 404, 'solo il token: nessun vault');
  assert.strictEqual((await nudo.json()).error, 'nessun-vault');
  assert.strictEqual((await su('/vault/index.yaml?s=' + tok)).status, 404, 'nemmeno un file');

  // caso 3: dopo B, il QR di A non scarica B
  srv.esponiVault({ nome: 'La Città', dir: dirB });
  assert.strictEqual((await su('/api/vault?s=' + conA)).status, 404, 'il QR di A dopo B: nessun vault');
  assert.strictEqual((await su('/vault/index.yaml?s=' + conA)).status, 404);
  assert.strictEqual((await su('/api/vault?s=' + conB).then(r => r.json())).nome, 'La Città', 'il QR di B riceve B');
  assert.strictEqual(await su('/vault/index.yaml?s=' + conB).then(r => r.text()), 'rootNodeLabel: La Città\n');
  assert.strictEqual((await su('/api/vault?s=' + tok + '-zzzz')).status, 404, 'una chiave inventata: nessun vault');
  assert.strictEqual((await su('/api/vault?s=x' + conB)).status, 403, 'token sbagliato: come oggi');
  // il token col nome della mappa vale per tutto il resto: consegne, materiali, file
  assert.strictEqual((await su('/api/materials?s=' + conA)).status, 200);
  fs.writeFileSync(path.join(srv.filesDir, 'Il_Clima.zip'), 'PK');
  assert.strictEqual((await su('/files/Il_Clima.zip?s=' + conA)).status, 200, 'il telefono scarica lo zip dal QR del vault');
  const cons = await fetch('http://127.0.0.1:' + port + '/api/consegna?s=' + conA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(cons.status, 400, 'la consegna passa il token e si ferma sull\'allievo mancante');
  await srv.stop();

  // caso 1: riavvio sulla STESSA cartella → stesso token, vault di B ricaricato, ma solo per il QR di B
  const srv2 = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' } });
  t.after(() => srv2.stop());
  const port2 = await srv2.listen(0, '127.0.0.1');
  assert.strictEqual(srv2.state().session.token, tok);
  const su2 = (p) => fetch('http://127.0.0.1:' + port2 + p);
  assert.strictEqual((await su2('/api/vault?s=' + tok)).status, 404, 'dopo il riavvio, un QR senza mappa: nessun vault');
  assert.strictEqual((await su2('/api/vault?s=' + conA)).status, 404, 'dopo il riavvio, il QR di A: nessun vault');
  assert.strictEqual((await su2('/api/vault?s=' + conB).then(r => r.json())).nome, 'La Città', 'dopo il riavvio il QR di B riceve ancora B');
  await srv2.stop();
});

test('scambio: POST /api/consegna scrive in Consegne/<classe-numero>/, mai sovrascrive, rifiuta il resto', async () => {
  const dir = tmpDir('live-consegna-');
  const vdir = tmpDir('vault-');
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

/* Dal rapporto di sicurezza (25/9): chi aveva il token del QR mandava
   `compito.html` o un `.command`, e il server scriveva tutto nel vault del
   docente. Ora passa solo ciò che MappAI studente manda davvero, e i primi byte
   devono dire la stessa cosa dell'estensione. */
test('scambio: la consegna accetta solo PDF, HTML e JSONL veri, un vault per nome, e ha un tetto per allievo', async (t) => {
  const dir = tmpDir('live-formati-');
  const vdir = tmpDir('vault-');
  const chiesti = [];
  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Clima' },
    vaultDir: nome => { chiesti.push(nome); return nome === 'Il Clima' ? vdir : null; } });
  t.after(() => srv.stop());
  const port = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  const manda = (nome, contenuto, extra) => fetch('http://127.0.0.1:' + port + '/api/consegna?s=' + tok, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ numero: '7', classe: '3C', vault: 'Il Clima', sessione: 'Prova', nome,
      base64: (Buffer.isBuffer(contenuto) ? contenuto : Buffer.from(contenuto)).toString('base64') }, extra || {}))
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  // ciò che il reader manda davvero (studente/scambio-core.js → fileDaInviare)
  assert.strictEqual((await manda('risposte.pdf', '%PDF-1.3\n%âã')).status, 200);
  assert.strictEqual((await manda('report.html', '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">')).status, 200);
  assert.strictEqual((await manda('risposte.html', '﻿\n<!doctype html>\n<html>')).status, 200);
  assert.strictEqual((await manda('sessioni.jsonl', '{"mode":1}\n{"mode":2}\n')).status, 200);
  assert.strictEqual((await manda('sessioni.jsonl', '{"mode":1}\n{"mod')).status, 200, 'una coda rovinata non blocca la consegna');
  assert.strictEqual(fs.readdirSync(path.join(vdir, 'Consegne', '3C-7')).length, 5);

  // estensioni che il reader non manda mai
  const altro = { numero: '8' };
  for (const nome of ['compito.command', 'tema.terminal', 'foto.png', 'x.svg', 'x.exe', 'x.htm', 'senza-estensione']) {
    const r = await manda(nome, '%PDF-1.3', altro);
    assert.strictEqual(r.status, 415, nome);
    assert.strictEqual(r.body.error, 'formato', nome);
  }
  // un nome con i caratteri di direzione: HTML vero che nel Finder sembra un PDF (25/9)
  const bidi = await manda('compito\u202Efdp.html', '<!DOCTYPE html><html>', altro);
  assert.strictEqual(bidi.status, 400);
  assert.strictEqual(bidi.body.error, 'nome');
  // l'estensione giusta non basta: i primi byte devono dire lo stesso
  assert.strictEqual((await manda('risposte.pdf', '<!DOCTYPE html><script>top.electronAPI</script>', altro)).status, 415, 'HTML travestito da PDF');
  assert.strictEqual((await manda('report.html', Buffer.from([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0xff, 0x00]), altro)).status, 415, 'binario travestito da HTML');
  assert.strictEqual((await manda('report.html', 'ciao <b>mondo</b>', altro)).status, 415, 'un frammento non è una pagina');
  assert.strictEqual((await manda('sessioni.jsonl', '<!DOCTYPE html>', altro)).status, 415, 'non sono righe JSON');
  assert.strictEqual((await manda('sessioni.jsonl', '42\n', altro)).status, 415, 'una riga deve essere un record');
  assert.strictEqual((await manda('risposte.pdf', '', altro)).status, 400, 'vuoto');
  assert.ok(!fs.existsSync(path.join(vdir, 'Consegne', '3C-8')), 'un rifiuto non lascia la cartella dell\'allievo');

  // il vault è un NOME: un cammino non arriva mai a chi lo cerca sul disco
  chiesti.length = 0;
  for (const v of ['../Il Clima', '..', '.', 'a/b', 'a\\b', '']) {
    assert.strictEqual((await manda('risposte.pdf', '%PDF-1.3', { vault: v })).status, 404, JSON.stringify(v));
  }
  assert.deepStrictEqual(chiesti, []);

  // il tetto per allievo: la cartella piena rifiuta, quella accanto no
  const piena = path.join(vdir, 'Consegne', '4D-9');
  fs.mkdirSync(piena, { recursive: true });
  for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(piena, 'p' + i + '.pdf'), '%PDF-1.3');
  const troppe = await manda('risposte.pdf', '%PDF-1.3', { numero: '9', classe: '4D' });
  assert.strictEqual(troppe.status, 400);
  assert.strictEqual(troppe.body.error, 'troppe-consegne');
  assert.strictEqual(fs.readdirSync(piena).length, 50);
  assert.strictEqual((await manda('risposte.pdf', '%PDF-1.3', { numero: '10', classe: '4D' })).status, 200);
  await srv.stop();
});

// ── Richieste malformate (25/9): 400, e il server resta in piedi ────────────
test('una richiesta malformata riceve 400 e il server resta in piedi (quiz e materiali)', async (t) => {
  const srv = createLiveServer({ repoRoot, dir: tmpDir('live-url-'),
    session: { name: 'Fotosintesi' }, roster: mkRoster(1), questions: sampleQuestions() });
  t.after(() => srv.stop());
  const port = await srv.listen(0, '127.0.0.1');
  assert.strictEqual(await grezza(port, '//['), 'HTTP/1.1 400 Bad Request');
  assert.strictEqual((await fetch('http://127.0.0.1:' + port + '/api/session?s=' + srv.state().session.token)).status, 200);

  const mat = createMaterialsServer({ repoRoot, dir: tmpDir('live-url-mat-'), session: { name: 'Clima' } });
  t.after(() => mat.stop());
  const mport = await mat.listen(0, '127.0.0.1');
  const mtok = mat.state().session.token;
  assert.strictEqual(await grezza(mport, '//['), 'HTTP/1.1 400 Bad Request');
  assert.strictEqual(await grezza(mport, '/files/%E0%A4%A?s=' + mtok), 'HTTP/1.1 400 Bad Request', 'un % monco nel nome del file');
  assert.strictEqual((await fetch('http://127.0.0.1:' + mport + '/api/materials?s=' + mtok)).status, 200);
});

// ── Timeline Live (008): sessione mode/loginMode/hintMode + hintUsed persistito ──
test('session espone mode/loginMode/hintMode; /api/answer persiste hintUsed', async () => {
  const dir = tmpDir('live-tl-');
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
  const dir = tmpDir('live-build-');
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
  const dir = tmpDir('live-quiz-');
  const roster = mkRoster(1);
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'Q', activity: 'Quiz' }, roster, questions: [{ kind: 'open', text: 'x', answerText: 'y' }] });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  const tok = srv.state().session.token;
  await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
  assert.strictEqual((await api('/api/propose', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', anno: 1900, evento: 'X' }) })).status, 404);
  await srv.stop();

  // ripresa build con proposte su disco
  const dir2 = tmpDir('live-b2-');
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
  const dir = tmpDir('live-grp-');
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
  const rep = fs.readFileSync(path.join(dir, 'report-allievi.html'), 'utf8');
  assert.ok(rep.includes('I Galli'));   // report aggregato per gruppo
  await srv.stop();
});

test('reveal risposte: /api/finish ritorna il risultato; my-result gated su consegna', async () => {
  const dir = tmpDir('live-reveal-');
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
  const dir = tmpDir('live-noreveal-');
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
  const dir = tmpDir('live-scelta-');
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
  const dir = tmpDir('live-scelta-nr-');
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
  /* 0116: col profilo spento viaggia solo il conteggio — nessuna riga dei tagli, nessun angolo */
  assert.deepStrictEqual(fin.body.profilo.righe, []);
  assert.ok(!/causa|esempio|angle/.test(JSON.stringify(fin.body.profilo)), 'nessun angolo esce prima del tempo');
  assert.strictEqual(fin.body.profilo.conteggio.totale, 4);
  await srv.stop();
});

test('scelta: la pagina studente e i suoi moduli sono serviti', async () => {
  const dir = tmpDir('live-scelta-st-');
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

test('emoji: la prova del font (0099) e le sue immagini sono servite, un .bak accanto no', async () => {
  const dir = tmpDir('live-emoji-prova-');
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', activity: 'Quiz', className: '2A' },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const r = await fetch('http://127.0.0.1:' + port + '/public/js/mappai-emoji-prova.js');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.strictEqual((await fetch('http://127.0.0.1:' + port + '/public/js/mappai-emoji-prova.js.bak')).status, 403);
  const img = await fetch('http://127.0.0.1:' + port + '/public/fonts/emoji/1f98a.svg');
  assert.strictEqual(img.status, 200);
  assert.match(img.headers.get('content-type'), /image\/svg\+xml/);
  await srv.stop();
});

test('scheda dell\'allievo (0112): /api/my-sheet è una pagina vera, col nome del file nel titolo, solo dopo la consegna e solo per il suo telefono', async () => {
  const dir = tmpDir('live-scheda-');
  const qs = [
    { kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, explanation: 'Roma.', source: 'map' },
    { kind: 'mc', text: 'Fiume di Roma?', options: ['Tevere', 'Po'], correct: 0, explanation: 'Il Tevere.', source: 'map' }
  ];
  const srv = createLiveServer({ repoRoot, dir, session: { name: '1a Guerra Mondiale', activity: 'Quiz', className: '2A', revealAnswers: true, font: 'atkinson' }, roster: mkRoster(1), questions: qs });
  try {
    const port = await srv.listen(0, '127.0.0.1');
    const api = apiFactory(port);
    const tok = srv.state().session.token, admin = srv.state().session.adminToken;
    const q = (extra) => '/api/my-sheet?s=' + tok + '&emojiKey=volpe&num=00&deviceId=' + (extra || 'd1');
    await api('/api/join', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
    await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
    await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 0, choice: 1, ms: 900 }) });
    await api('/api/answer', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1', qIdx: 1, choice: 0, ms: 900 }) });
    const url = (qs2) => 'http://127.0.0.1:' + port + qs2;
    // prima della consegna: niente scheda (le soluzioni non viaggiano prima)
    const prima = await fetch(url(q()));
    assert.strictEqual(prima.status, 409);
    assert.match(prima.headers.get('content-type'), /text\/html/, 'sul telefono un JSON si scarica come file: l\'errore è una paginetta');
    assert.ok((await prima.text()).includes('dopo la consegna'));
    await api('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
    // un altro telefono, un token sbagliato: no
    assert.strictEqual((await fetch(url(q('ALTRO')))).status, 403);
    assert.strictEqual((await fetch(url('/api/my-sheet?s=sbagliato&emojiKey=volpe&num=00&deviceId=d1'))).status, 403);
    const r = await fetch(url(q()));
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
    const h = await r.text();
    // il titolo È il nome del file: «[classe] [nome emoji] [numero] [tipo e nome dei quiz]»
    assert.match(h, /<title>2A Volpe 00 Quiz 1a Guerra Mondiale<\/title>/);
    assert.ok(h.includes('/public/js/mappai-emoji-prova.js'), 'le emoji di identità come immagini (iOS disegna male il font): la scheda con la coccinella usciva a pixel');
    assert.ok(h.includes('Capitale?') && h.includes('Fiume di Roma?'));
    // dal 0132 (veste comune dei report; Giacomo, 28/10: «Sì, allarga») le etichette dei riquadri: «Risposta», «Risposta corretta»
    assert.ok(h.includes('<span class="mm-rp-et">Risposta</span>') && h.includes('<span class="mm-rp-et">Risposta corretta</span>') && h.includes('Roma.'));
    assert.ok(h.includes("font-family:'Atkinson Hyperlegible'"), 'il carattere del docente, con i file serviti dal server');
    assert.ok(h.includes('/public/fonts/Atkinson-Regular.ttf'));
    assert.ok(h.includes('window.print()'), 'la stampa parte da sola');
  } finally { await srv.stop(); }
  // il docente non mostra le soluzioni: la scheda non esiste
  const dir2 = tmpDir('live-scheda-no-');
  const srv2 = createLiveServer({ repoRoot, dir: dir2, session: { name: 'X', activity: 'Quiz', className: '2A', revealAnswers: false }, roster: mkRoster(1), questions: qs });
  try {
    const port2 = await srv2.listen(0, '127.0.0.1');
    const api2 = apiFactory(port2);
    const tok2 = srv2.state().session.token, admin2 = srv2.state().session.adminToken;
    await api2('/api/join', { method: 'POST', body: JSON.stringify({ token: tok2, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
    await api2('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin2, phase: 'running' }) });
    await api2('/api/finish', { method: 'POST', body: JSON.stringify({ token: tok2, emojiKey: 'volpe', num: '00', deviceId: 'd1' }) });
    assert.strictEqual((await fetch('http://127.0.0.1:' + port2 + '/api/my-sheet?s=' + tok2 + '&emojiKey=volpe&num=00&deviceId=d1')).status, 404);
  } finally { await srv2.stop(); }
});

test('carattere del docente (0112): /api/session lo espone solo se è nel catalogo', async () => {
  const FCore = require(path.join(__dirname, '..', 'public', 'js', 'mappai-font-core.js'));
  const altro = FCore.FONTS.find(f => f.id !== FCore.DEFAULT).id;
  for (const [dato, atteso] of [[altro, altro], ['comic-sans', ''], ['<script>alert(1)</script>', ''], [undefined, ''], [42, '']]) {
    const dir = tmpDir('live-font-');
    const srv = createLiveServer({
      repoRoot, dir, session: { name: 'Clima', activity: 'Quiz', className: '2A', font: dato },
      roster: mkRoster(1), questions: sampleQuestions()
    });
    try {
      const port = await srv.listen(0, '127.0.0.1');
      const api = apiFactory(port);
      const r = await api('/api/session?s=' + srv.state().session.token);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.font, atteso, 'font ' + String(dato));
    } finally { await srv.stop(); }   // un rosso non deve lasciare il server aperto: Node non esce più
  }
});

test('carattere del docente (0112): in una RIPRESA vince la scelta di adesso, non quella (assente) salvata', async () => {
  const FCore = require(path.join(__dirname, '..', 'public', 'js', 'mappai-font-core.js'));
  const altro = FCore.FONTS.find(f => f.id !== FCore.DEFAULT).id;
  const dir = tmpDir('live-font-riprendi-');
  const cfg = (font) => ({ repoRoot, dir, session: { name: 'Clima', activity: 'Quiz', className: '2A', font }, roster: mkRoster(1), questions: sampleQuestions() });
  const primo = createLiveServer(cfg(undefined));            // sessione di ieri: senza carattere, ancora in lobby
  const porta1 = await primo.listen(0, '127.0.0.1');
  const tok = primo.state().session.token;
  assert.strictEqual((await apiFactory(porta1)('/api/session?s=' + tok)).body.font, '');
  await primo.stop();
  const secondo = createLiveServer(cfg(altro));              // il docente riavvia dopo aver scelto un carattere
  try {
    const porta2 = await secondo.listen(0, '127.0.0.1');
    const r = await apiFactory(porta2)('/api/session?s=' + tok);
    assert.strictEqual(r.status, 200, 'è proprio la sessione ripresa (stesso token)');
    assert.strictEqual(r.body.font, altro);
  } finally { await secondo.stop(); }
  const terzo = createLiveServer(cfg('comic-sans'));         // un id ignoto non rimpiazza niente: torna al predefinito
  try {
    const porta3 = await terzo.listen(0, '127.0.0.1');
    assert.strictEqual((await apiFactory(porta3)('/api/session?s=' + tok)).body.font, '');
  } finally { await terzo.stop(); }
});

test('scelta multipla (0112): il modulo comune è servito al telefono, un .bak accanto no', async () => {
  const dir = tmpDir('live-quiz-mc-');
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', activity: 'Quiz', className: '2A' },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + port;
  const r = await fetch(base + '/public/js/mappai-quiz-mc-view.js');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(await r.text(), /MappAIQuizMcView/);
  assert.strictEqual((await fetch(base + '/public/js/mappai-quiz-mc-view.js.bak')).status, 403);
  // l'allowlist non si è allargata ai fratelli: il motore dello studio resta chiuso
  assert.strictEqual((await fetch(base + '/public/js/mappai-study-session.js')).status, 403);
  await srv.stop();
});

test('scelta: la coda dopo la consegna non annulla la consegna, e l\'evitata è pubblica', async () => {
  const dir = tmpDir('live-scelta-pn-');
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
  const dir = tmpDir('live-scelta-rip-');
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
  const dir = tmpDir('live-scelta-mc-');
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
  const dir = tmpDir('live-fb-');
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
  const dir = tmpDir('live-fb-off-');
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
  const dir = tmpDir('live-fb-quiz-');
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
  const dir = tmpDir('live-fb-lock-');
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
  const dir = tmpDir('live-fb-manual-');
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
  const dir = tmpDir('live-fb-sp-');
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

/* ── 0116, lotto 1: la consegna che si riapre da sola (difetto D) ──────────
   Il telefono rispedisce un salvataggio fallito dopo 4 s (`scheduleRetry`).
   Se la consegna arriva prima, il salvataggio rispedito — IDENTICO a quello
   già salvato — rimetteva `finishedAt` a null: per il docente l'allievo non
   aveva consegnato. Riaprire resta giusto solo per una risposta cambiata. */
async function finitoPerIlDocente(api, admin, emojiKey) {
  const s = await api('/api/status?admin=' + admin);
  return s.body.roster.filter(r => r.emojiKey === emojiKey)[0].finished;
}

test('0116 D: quiz — la stessa risposta rispedita dopo la consegna non la riapre', async () => {
  const dir = tmpDir('live-0116-q-');
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Fotosintesi', className: '2A' }, roster: mkRoster(1), questions: sampleQuestions()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
  await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
  await api('/api/phase', { method: 'POST', body: JSON.stringify({ adminToken: admin, phase: 'running' }) });
  const risposta = Object.assign({ qIdx: 0, choice: 0, ms: 3000 }, chi);
  await api('/api/answer', { method: 'POST', body: JSON.stringify(risposta) });
  await api('/api/finish', { method: 'POST', body: JSON.stringify(chi) });
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), true);

  const rispedita = await api('/api/answer', { method: 'POST', body: JSON.stringify(risposta) });
  assert.strictEqual(rispedita.status, 200);
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), true, 'un salvataggio identico non riapre la consegna');

  const cambiata = Object.assign({}, risposta, { choice: 1, ms: 5000 });
  await api('/api/answer', { method: 'POST', body: JSON.stringify(cambiata) });
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), false, 'una risposta cambiata riapre, come prima');
  } finally { await srv.stop(); }
});

test('0116 D: domande a scelta — lo stesso stato rispedito dopo la consegna non la riapre', async () => {
  const dir = tmpDir('live-0116-s-');
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', className: '2A', mode: 'scelta', scelta: { minimo: 1, minimoAree: 1 } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
  const tok = srv.state().session.token, admin = srv.state().session.adminToken;
  const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
  const j = await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
  const id0 = j.body.pool[0].id;
  const stato = { aree: ['Oceani'], fase: 'rispondi', letture: { [id0]: { chip: 'subito' } }, risposte: { [id0]: { testo: 'la mia risposta' } } };
  await api('/api/stato', { method: 'POST', body: JSON.stringify(Object.assign({ stato }, chi)) });
  await api('/api/finish', { method: 'POST', body: JSON.stringify(chi) });
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), true);

  const rispedito = await api('/api/stato', { method: 'POST', body: JSON.stringify(Object.assign({ stato }, chi)) });
  assert.strictEqual(rispedito.status, 200);
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), true, 'uno stato identico non riapre la consegna');

  const cambiato = JSON.parse(JSON.stringify(stato));
  cambiato.risposte[id0].testo = 'la mia risposta, corretta';
  await api('/api/stato', { method: 'POST', body: JSON.stringify(Object.assign({ stato: cambiato }, chi)) });
  assert.strictEqual(await finitoPerIlDocente(api, admin, 'volpe'), false, 'uno stato cambiato riapre, come prima');
  } finally { await srv.stop(); }
});

/* ── 0116, lotto 3: le domande aperte semplici — l'allievo riceve TUTTE le
   domande, e il report non parla di tagli evitati né di aree scelte ── */
test('0116: scelta semplice — il pool intero a ogni allievo, report senza tagli né aree', async () => {
  const dir = tmpDir('live-0116-semplice-');
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Clima', className: '2A', mode: 'scelta', scelta: { semplice: true } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
    const tok = srv.state().session.token, admin = srv.state().session.adminToken;
    const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
    const sess = await api('/api/session?s=' + tok);
    assert.strictEqual(sess.body.scelta.semplice, true);
    assert.strictEqual(sess.body.scelta.reveal, false);
    const j = await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
    assert.strictEqual(j.body.pool.length, 12, 'tutte le domande, non una per argomento e per taglio');
    await api('/api/finish', { method: 'POST', body: JSON.stringify(chi) });
    await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
    const html = fs.readFileSync(path.join(dir, 'report-scelta.html'), 'utf8');
    assert.ok(!html.includes('chi li ha evitati'), 'niente sezione dei tagli evitati');
    assert.ok(!html.includes('Le aree — dove la classe'), 'niente sezione delle aree');
  } finally { await srv.stop(); }
});

test('0116 (gate 21/10): scelta semplice — la consegna dice quante risposte sono scritte', async () => {
  const dir = tmpDir('live-0116-conto-');
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Clima', className: '2A', mode: 'scelta', scelta: { semplice: true } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
    const tok = srv.state().session.token;
    const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
    const j = await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
    const risposte = {};
    j.body.pool.forEach(v => { risposte[v.id] = {}; });
    risposte[j.body.pool[0].id] = { testo: 'la neutralità armata' };
    const fin = await api('/api/finish', { method: 'POST', body: JSON.stringify(Object.assign({ stato: { fase: 'rispondi', risposte } }, chi)) });
    assert.strictEqual(fin.status, 200);
    assert.strictEqual(fin.body.profilo.conteggio.scritte, 1, 'una risposta scritta');
    assert.strictEqual(fin.body.profilo.conteggio.totale, 12, 'su tutte le domande');
  } finally { await srv.stop(); }
});

test('0116 (gate 21/10): scelta semplice — la scheda dell\'allievo con tutte le domande e le sue risposte', async () => {
  const dir = tmpDir('live-0116-scheda-');
  const pool = SC.poolDaFogli([{ titolo: 'Domande aperte — Svizzera', angle: 'definizione', tipo: 'open',
    items: [{ domanda: 'Che cos\'è la neutralità armata?', guide: 'TRACCIA-SEGRETA' }, { domanda: 'Chi era il generale Guisan?' }] }]);
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Svizzera', activity: 'Domande aperte', className: '4R', mode: 'scelta', scelta: { semplice: true } },
    roster: mkRoster(1), questions: pool
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
    const tok = srv.state().session.token;
    const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
    const j = await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
    const risposte = {}; j.body.pool.forEach(v => { risposte[v.id] = {}; });
    const prima = j.body.pool.filter(v => /neutralità/.test(v.testo))[0];
    risposte[prima.id] = { testo: 'Difendersi senza schierarsi' };
    const url = '/api/my-sheet?s=' + tok + '&emojiKey=volpe&num=00&deviceId=d1';
    const presto = await fetch('http://127.0.0.1:' + port + url);
    assert.strictEqual(presto.status, 409, 'prima della consegna non c\'è la scheda');
    await api('/api/finish', { method: 'POST', body: JSON.stringify(Object.assign({ stato: { fase: 'rispondi', risposte } }, chi)) });
    const r = await fetch('http://127.0.0.1:' + port + url);
    const html = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(html.includes('neutralità armata') && html.includes('generale Guisan'), 'tutte le domande');
    assert.ok(html.includes('Difendersi senza schierarsi'), 'la risposta scritta');
    assert.ok(html.includes('— vuoto'), 'la domanda senza risposta');
    assert.ok(!html.includes('TRACCIA-SEGRETA'), 'nessuna traccia di correzione');
    assert.ok(!html.includes('class="lr-acc"'), 'nessuna percentuale');
  } finally { await srv.stop(); }
});

test('0116 (gate 21/10): domande a scelta — alla chiusura anche il «Report allievi», e /api/status dice la modalità', async () => {
  const dir = tmpDir('live-0116-rep-');
  const srv = createLiveServer({
    repoRoot, dir, session: { name: 'Svizzera', activity: 'Domande aperte', className: '4R', mode: 'scelta', scelta: { semplice: true } },
    roster: mkRoster(1), questions: sceltaPool()
  });
  const port = await srv.listen(0, '127.0.0.1');
  const api = apiFactory(port);
  try {
    const tok = srv.state().session.token, admin = srv.state().session.adminToken;
    const st0 = await api('/api/status?admin=' + admin);
    assert.strictEqual(st0.body.session.mode, 'scelta', 'il pannello sa che attività è');
    const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
    const j = await api('/api/join', { method: 'POST', body: JSON.stringify(chi) });
    const risposte = {}; j.body.pool.forEach(v => { risposte[v.id] = {}; });
    risposte[j.body.pool[0].id] = { testo: 'RISPOSTA-DELLA-VOLPE' };
    await api('/api/finish', { method: 'POST', body: JSON.stringify(Object.assign({ stato: { fase: 'rispondi', risposte } }, chi)) });
    await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
    for (const w of ['scelta', 'students']) {
      const r = await fetch('http://127.0.0.1:' + port + '/api/report?admin=' + admin + '&which=' + w);
      assert.strictEqual(r.status, 200, 'report ' + w);
    }
    const allievi = fs.readFileSync(path.join(dir, 'report-allievi.html'), 'utf8');
    assert.ok(allievi.includes('RISPOSTA-DELLA-VOLPE'), 'la risposta dell\'allievo nel report allievi');
    assert.ok(!allievi.includes('class="lr-acc"'), 'niente percentuale per le aperte');
  } finally { await srv.stop(); }
});

test('0116: /api/status di un quiz dice «quiz»', async () => {
  const dir = tmpDir('live-0116-modo-');
  const srv = createLiveServer({ repoRoot, dir, session: { name: 'Fotosintesi', className: '2A' }, roster: mkRoster(1), questions: sampleQuestions() });
  const port = await srv.listen(0, '127.0.0.1');
  try {
    const st = await apiFactory(port)('/api/status?admin=' + srv.state().session.adminToken);
    assert.strictEqual(st.body.session.mode, 'quiz');
  } finally { await srv.stop(); }
});

// in fondo al file: gira DOPO gli after che fermano i server
after(() => { for (const d of _cartelleTmp) fs.rmSync(d, { recursive: true, force: true }); });
