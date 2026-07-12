'use strict';
/*
 * tutor-server.test.js — server LAN "Chatta e Scrivi" (007), headless
 * (pattern di live-server.test.js: porta effimera, fetch reali, disco temp).
 * callModel è MOCKATO: conta le invocazioni → prova che cap/validazione
 * bloccano PRIMA della chiamata AI e che la coda serializza.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTutorServer } = require(path.join(__dirname, '..', 'tutor-server.js'));

let srv, port, dir, tok, admin;
let aiCalls = 0;          // invocazioni callModel
let aiConcurrent = 0;     // chiamate in volo simultanee
let aiMaxConcurrent = 0;  // massimo osservato (deve restare 1 = coda seriale)

async function mockCallModel({ provider, payload }) {
  aiCalls++;
  aiConcurrent++;
  aiMaxConcurrent = Math.max(aiMaxConcurrent, aiConcurrent);
  await new Promise(r => setTimeout(r, 30));   // simula latenza provider
  aiConcurrent--;
  // eco dell'ultimo messaggio utente, formato google
  const last = payload.contents[payload.contents.length - 1].parts[0].text;
  return { candidates: [{ content: { parts: [{ text: 'Tutor dice: ' + last }] } }] };
}

function api(p, opts) {
  return fetch('http://127.0.0.1:' + port + p, opts).then(async r => ({
    status: r.status, body: await r.json().catch(() => null)
  }));
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-test-'));
  srv = createTutorServer({
    repoRoot: path.join(__dirname, '..'),
    dir,
    session: {
      name: 'La Fotosintesi', className: '1A',
      topic: { kind: 'branch', id: 'n9', label: 'Le radici' },
      mode: 'socratic', cap: 3, writingBrief: 'Scrivi 10 righe sulle radici.',
      provider: 'google', model: 'gemini-test', maxTokens: 400
    },
    secrets: { apiKey: 'CHIAVE-SEGRETA', systemInstruction: 'SEI IL TUTOR. MAI REDIGERE.' },
    roster: [
      { emojiKey: 'volpe', num: '00', name: 'Ada' },
      { emojiKey: 'panda', num: '00', name: '' }
    ],
    callModel: mockCallModel
  });
  port = await srv.listen(0, '127.0.0.1');
  const st = srv.state();
  tok = st.session.token;
  admin = st.session.adminToken;
});

after(async () => { if (srv) await srv.stop(); });

// ── /api/session: SOLO campi pubblici ───────────────────────────────────────
test('GET /api/session: mai chiave/adminToken/systemInstruction/provider', async () => {
  const r = await api('/api/session?s=' + tok);
  assert.strictEqual(r.status, 200);
  const flat = JSON.stringify(r.body);
  assert.ok(!flat.includes('CHIAVE-SEGRETA'));
  assert.ok(!flat.includes(admin));
  assert.ok(!flat.includes('SEI IL TUTOR'));
  assert.ok(!flat.includes('google'));
  assert.strictEqual(r.body.cap, 3);
  assert.ok(Array.isArray(r.body.emojiSet));   // per il login
});

test('GET /api/session: token sbagliato → 403', async () => {
  const r = await api('/api/session?s=nope');
  assert.strictEqual(r.status, 403);
});

// ── join ────────────────────────────────────────────────────────────────────
test('POST /api/join: roster + identity-taken + rientro', async () => {
  const j1 = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1' })
  });
  assert.strictEqual(j1.status, 200);
  assert.strictEqual(j1.body.cap, 3);
  assert.strictEqual(j1.body.used, 0);

  // fuori roster
  const out = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'gufo', num: '09', deviceId: 'dev9' })
  });
  assert.strictEqual(out.status, 404);

  // stessa identità, altro device → 409
  const taken = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'ALTRO' })
  });
  assert.strictEqual(taken.status, 409);

  // stesso device → rientra
  const back = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1' })
  });
  assert.strictEqual(back.status, 200);
});

// ── chat: cap + validazione PRIMA dell'AI ───────────────────────────────────
test('POST /api/tutor: turni entro il cap, poi 429 SENZA chiamata AI', async () => {
  const send = (text) => api('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', text })
  });

  const r1 = await send('Cosa fanno le radici?');
  assert.strictEqual(r1.status, 200);
  assert.ok(r1.body.reply.includes('Cosa fanno le radici?'));
  assert.strictEqual(r1.body.used, 1);

  await send('E poi?'); await send('E ancora?');   // used = 3 = cap
  const callsBefore = aiCalls;
  const over = await send('Quarto messaggio');
  assert.strictEqual(over.status, 429);
  assert.strictEqual(over.body.error, 'cap-reached');
  assert.strictEqual(aiCalls, callsBefore);        // NESSUNA chiamata AI oltre il cap
});

test('POST /api/tutor: messaggio troppo lungo/vuoto rifiutato senza AI', async () => {
  await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'dev2' })
  });
  const callsBefore = aiCalls;
  const long = await api('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'dev2', text: 'x'.repeat(700) })
  });
  assert.strictEqual(long.status, 400);
  assert.strictEqual(long.body.error, 'too-long');
  const empty = await api('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'dev2', text: '   ' })
  });
  assert.strictEqual(empty.status, 400);
  assert.strictEqual(aiCalls, callsBefore);        // zero chiamate AI
});

test('coda seriale: 5 invii simultanei → mai più di 1 chiamata AI in volo', async () => {
  aiMaxConcurrent = 0;
  // panda ha cap 3 e used 0: 3 turni validi simultanei + 2 oltre cap
  const send = (text) => api('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'panda', num: '00', deviceId: 'dev2', text })
  });
  const rs = await Promise.all([send('a'), send('b'), send('c'), send('d'), send('e')]);
  const ok = rs.filter(r => r.status === 200).length;
  const capped = rs.filter(r => r.status === 429).length;
  assert.strictEqual(ok, 3);          // fino al cap
  assert.strictEqual(capped, 2);      // oltre il cap, senza AI
  assert.strictEqual(aiMaxConcurrent, 1);   // SERIALE
});

// ── scrittura + consegna + reopen + close ───────────────────────────────────
test('draft/submit/reopen/close: ciclo completo con report', async () => {
  const d = await api('/api/draft', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', text: 'Bozza…' })
  });
  assert.strictEqual(d.status, 200);

  const s = await api('/api/submit', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', text: 'Il mio testo sulle radici.' })
  });
  assert.strictEqual(s.status, 200);

  // status admin: volpe consegnato, used 3/3
  const st = await api('/api/status?admin=' + admin);
  assert.strictEqual(st.status, 200);
  const volpe = st.body.roster.find(r => r.emojiKey === 'volpe');
  assert.strictEqual(volpe.submitted, true);
  assert.strictEqual(volpe.used, 3);

  // reopen → torna writing e può ri-consegnare
  const ro = await api('/api/reopen', {
    method: 'POST',
    body: JSON.stringify({ adminToken: admin, emojiKey: 'volpe', num: '00' })
  });
  assert.strictEqual(ro.status, 200);
  const s2 = await api('/api/submit', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', text: 'Versione rivista.' })
  });
  assert.strictEqual(s2.status, 200);

  // close (idempotente) → results.json + report
  const c1 = await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  assert.strictEqual(c1.status, 200);
  const c2 = await api('/api/close', { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
  assert.strictEqual(c2.status, 200);

  const results = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  const volpeR = results.students.find(x => x.identity.emojiKey === 'volpe');
  assert.strictEqual(volpeR.submissionText, 'Versione rivista.');
  assert.strictEqual(volpeR.transcript.length, 6);   // 3 scambi = 6 turni
  assert.ok(fs.existsSync(path.join(dir, 'report-tutor.html')));

  // report HTML servito all'admin, mai segreti dentro
  const rep = await fetch('http://127.0.0.1:' + port + '/api/report?admin=' + admin);
  const html = await rep.text();
  assert.ok(html.includes('Versione rivista.'));
  assert.ok(!html.includes('CHIAVE-SEGRETA'));

  // a sessione chiusa la chat rifiuta
  const after = await api('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ token: tok, emojiKey: 'volpe', num: '00', deviceId: 'dev1', text: 'ancora?' })
  });
  assert.strictEqual(after.status, 409);
});

// ── ripresa da disco ────────────────────────────────────────────────────────
test('restart: sessione ripresa con lo stesso token, studenti da disco', async () => {
  await srv.stop();
  srv = createTutorServer({
    repoRoot: path.join(__dirname, '..'), dir,
    session: { name: 'La Fotosintesi' },
    secrets: { apiKey: 'CHIAVE-2', systemInstruction: 'SEI IL TUTOR' },
    callModel: mockCallModel
  });
  port = await srv.listen(0, '127.0.0.1');
  const st = srv.state();
  assert.strictEqual(st.session.token, tok);          // stesso QR
  assert.strictEqual(st.session.adminToken, admin);
  assert.strictEqual(st.joined, 2);                   // volpe + panda da disco
});
