'use strict';
/*
 * relay-server.test.js — relay "variante WEB" end-to-end, headless
 * (pattern di live-server.test.js: porte effimere, fetch reali, disco temp)
 *
 * Catena REALE: fetch (finto telefono) → relay/server.js → relay-client.js
 * (finto main Electron) → createLiveServer/createMaterialsServer su 127.0.0.1.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRelay } = require(path.join(__dirname, '..', 'relay', 'server.js'));
const { openSession } = require(path.join(__dirname, '..', 'relay-client.js'));
const { createLiveServer, createMaterialsServer } = require(path.join(__dirname, '..', 'live-server.js'));
const LC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-live-core.js'));

const repoRoot = path.join(__dirname, '..');

function sampleQuestions() {
  return [
    { kind: 'mc', text: 'Capitale?', options: ['Roma', 'Milano'], correct: 0, nodeId: 'nA', nodeLabel: 'Italia', l1Id: 'L1', l1Label: 'Geografia', source: 'map' },
    { kind: 'tf', text: 'Il Sole è una stella', proposed: 'vero', statementTrue: true, nodeId: 'nB', nodeLabel: 'Astro', l1Id: 'L2', l1Label: 'Scienze', source: 'map' }
  ];
}

// Harness: relay + live server + client registrato. Ritorna handle e cleanup.
async function setupLive(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'));
  const relay = createRelay({ publicOrigin: 'http://127.0.0.1:0', quiet: true });
  const relayPort = await relay.listen(0, '127.0.0.1');
  const relayBase = 'http://127.0.0.1:' + relayPort;

  const roster = LC.buildCredentials(3);   // identità CASUALI dal pool → mai hardcodarle nei test
  const srv = createLiveServer({
    repoRoot, dir,
    session: { name: 'Fotosintesi', activity: 'Quiz', className: '2A' },
    roster,
    questions: sampleQuestions()
  });
  const livePort = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;

  const h = await openSession({
    relayUrl: 'ws://127.0.0.1:' + relayPort,
    activity: 'live', token: tok, localPort: livePort, quiet: true
  });

  t.after(async () => {
    h.close();
    await srv.stop();
    await relay.close();
  });
  return { relay, relayBase, srv, livePort, tok, h, roster };
}

// ── register → code + publicUrl ─────────────────────────────────────────────
test('register: code valido e publicUrl coerente', async (t) => {
  const { h } = await setupLive(t);
  assert.match(h.code, /^[A-Z2-9]{6}$/);
  assert.ok(h.publicUrl.endsWith('/j/' + h.code));
});

// ── /j/<code>: 302 + Set-Cookie + Location entry ────────────────────────────
test('/j/<code>: 302 con cookie e Location alla pagina studente', async (t) => {
  const { relayBase, tok, h } = await setupLive(t);
  const r = await fetch(relayBase + '/j/' + h.code, { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.get('location'), '/public/live/student.html?s=' + tok);
  const cookie = r.headers.get('set-cookie') || '';
  assert.ok(cookie.includes('mappai_s=' + tok), cookie);
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(!cookie.includes('Secure'), 'niente Secure su origin http');
  // codice ignoto → 404
  assert.strictEqual((await fetch(relayBase + '/j/ZZZZZZ', { redirect: 'manual' })).status, 404);
});

// ── statici via cookie (il gap degli asset senza token) ─────────────────────
test('student.html e live-core.js serviti via cookie', async (t) => {
  const { relayBase, tok } = await setupLive(t);
  const page = await fetch(relayBase + '/public/live/student.html', { headers: { Cookie: 'mappai_s=' + tok } });
  assert.strictEqual(page.status, 200);
  assert.ok((await page.text()).includes('mappai-live-core.js'));
  const js = await fetch(relayBase + '/public/js/mappai-live-core.js', { headers: { Cookie: 'mappai_s=' + tok } });
  assert.strictEqual(js.status, 200);
  // senza token né cookie → 404
  assert.strictEqual((await fetch(relayBase + '/public/live/student.html')).status, 404);
});

// ── API: risposta identica al diretto ───────────────────────────────────────
test('GET /api/session e POST /api/join: pass-through fedele', async (t) => {
  const { relayBase, livePort, tok, roster } = await setupLive(t);

  const viaRelay = await fetch(relayBase + '/api/session?s=' + tok).then(r => r.json());
  const direct = await fetch('http://127.0.0.1:' + livePort + '/api/session?s=' + tok).then(r => r.json());
  assert.deepStrictEqual(viaRelay, direct);
  assert.strictEqual(viaRelay.phase, 'lobby');

  // join via relay (token nel BODY, non in query → route per body) — identità DAL roster
  const inR = roster[0];
  const join = await fetch(relayBase + '/api/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tok, emojiKey: inR.emojiKey, num: inR.num, deviceId: 'dev1' })
  });
  assert.strictEqual(join.status, 200);
  const jb = await join.json();
  assert.strictEqual(jb.questions[0].correct, undefined, 'soluzioni strippate anche via relay');

  // errori applicativi passano intatti (identità fuori roster → 404 del server locale)
  const inRoster = (ek, num) => roster.some(r => r.emojiKey === ek && r.num === num);
  let outR = null;
  for (let n = 0; n <= 10 && !outR; n++) {
    for (const e of LC.EMOJI_SET) {
      const num = String(n).padStart(2, '0');
      if (!inRoster(e.key, num)) { outR = { emojiKey: e.key, num }; break; }
    }
  }
  const bad = await fetch(relayBase + '/api/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tok, emojiKey: outR.emojiKey, num: outR.num, deviceId: 'devX' })
  });
  assert.strictEqual(bad.status, 404);
});

// ── difesa: admin path e token ignoti ───────────────────────────────────────
test('admin path MAI inoltrati; token ignoto → 404', async (t) => {
  const { relayBase, srv, tok } = await setupLive(t);
  const admin = srv.state().session.adminToken;
  // anche con l'adminToken vero in mano, il relay rifiuta il path
  for (const p of ['/api/status?admin=' + admin + '&s=' + tok, '/api/report?admin=' + admin + '&s=' + tok]) {
    const r = await fetch(relayBase + p);
    assert.strictEqual(r.status, 404, p);
  }
  const close = await fetch(relayBase + '/api/close', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminToken: admin, token: tok })
  });
  assert.strictEqual(close.status, 404);
  // token mai registrato → 404
  assert.strictEqual((await fetch(relayBase + '/api/session?s=tok_sconosciuto1')).status, 404);
});

// ── cap body richiesta ──────────────────────────────────────────────────────
test('body oltre 1MB → 413', async (t) => {
  const { relayBase, tok } = await setupLive(t);
  const big = JSON.stringify({ token: tok, filler: 'x'.repeat(1100000) });
  const r = await fetch(relayBase + '/api/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big
  });
  assert.strictEqual(r.status, 413);
});

// ── docente offline → 502; riconnessione con stesso code ───────────────────
test('client chiuso → 502; riconnessione → stesso code, QR valido', async (t) => {
  const { relayBase, livePort, tok, h } = await setupLive(t);
  const code = h.code;
  h.close();
  await new Promise(r => setTimeout(r, 150)); // il relay vede la close
  const down = await fetch(relayBase + '/api/session?s=' + tok);
  assert.strictEqual(down.status, 502);
  assert.strictEqual((await down.json()).error, 'teacher-offline');

  // nuovo client, stesso token + wantCode (= restart del docente)
  const relayPort = new URL(relayBase).port;
  const h2 = await openSession({
    relayUrl: 'ws://127.0.0.1:' + relayPort,
    activity: 'live', token: tok, localPort: livePort, wantCode: code, quiet: true
  });
  t.after(() => h2.close());
  assert.strictEqual(h2.code, code, 'il QR proiettato resta valido');
  const up = await fetch(relayBase + '/api/session?s=' + tok);
  assert.strictEqual(up.status, 200);
});

// ── binario: materials, bytes e header intatti ──────────────────────────────
test('materials: PDF binario passa intatto con Content-Disposition', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-mat-'));
  const relay = createRelay({ publicOrigin: 'http://127.0.0.1:0', quiet: true });
  const relayPort = await relay.listen(0, '127.0.0.1');
  const relayBase = 'http://127.0.0.1:' + relayPort;

  const srv = createMaterialsServer({ repoRoot, dir, session: { name: 'Dispense' } });
  const matPort = await srv.listen(0, '127.0.0.1');
  const tok = srv.state().session.token;
  // file binario finto: 300KB pseudo-casuali ma deterministici (attraversa più chunk)
  const payload = Buffer.alloc(300000);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) % 256;
  fs.writeFileSync(path.join(srv.filesDir, 'dispensa.pdf'), payload);

  const h = await openSession({
    relayUrl: 'ws://127.0.0.1:' + relayPort,
    activity: 'materials', token: tok, localPort: matPort, quiet: true
  });
  t.after(async () => { h.close(); await srv.stop(); await relay.close(); });

  // entry corretta per materials
  const entry = await fetch(relayBase + '/j/' + h.code, { redirect: 'manual' });
  assert.strictEqual(entry.headers.get('location'), '/public/live/materials.html?s=' + tok);

  const list = await fetch(relayBase + '/api/materials?s=' + tok).then(r => r.json());
  assert.strictEqual(list.files[0].file, 'dispensa.pdf');

  const dl = await fetch(relayBase + '/files/dispensa.pdf?s=' + tok);
  assert.strictEqual(dl.status, 200);
  assert.ok((dl.headers.get('content-disposition') || '').includes('attachment'));
  const got = Buffer.from(await dl.arrayBuffer());
  assert.strictEqual(got.length, payload.length);
  assert.ok(got.equals(payload), 'bytes identici attraverso il relay');
});

// ── isolamento fra sessioni ─────────────────────────────────────────────────
test('due sessioni sullo stesso relay: routing isolato per token', async (t) => {
  const relay = createRelay({ publicOrigin: 'http://127.0.0.1:0', quiet: true });
  const relayPort = await relay.listen(0, '127.0.0.1');
  const relayBase = 'http://127.0.0.1:' + relayPort;

  const mk = async (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-two-'));
    const srv = createLiveServer({
      repoRoot, dir, session: { name, activity: 'Quiz', className: '1A' },
      roster: LC.buildCredentials(2), questions: sampleQuestions()
    });
    const port = await srv.listen(0, '127.0.0.1');
    const tok = srv.state().session.token;
    const h = await openSession({ relayUrl: 'ws://127.0.0.1:' + relayPort, activity: 'live', token: tok, localPort: port, quiet: true });
    return { srv, tok, h };
  };
  const a = await mk('Mappa A');
  const b = await mk('Mappa B');
  t.after(async () => { a.h.close(); b.h.close(); await a.srv.stop(); await b.srv.stop(); await relay.close(); });

  assert.notStrictEqual(a.h.code, b.h.code);
  const sa = await fetch(relayBase + '/api/session?s=' + a.tok).then(r => r.json());
  const sb = await fetch(relayBase + '/api/session?s=' + b.tok).then(r => r.json());
  assert.strictEqual(sa.name, 'Mappa A');
  assert.strictEqual(sb.name, 'Mappa B');
});
