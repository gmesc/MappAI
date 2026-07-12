'use strict';
/*
 * collab-server.test.js — server LAN Lavagna Collaborativa, headless
 * (pattern di garden-server.test.js: porta effimera, fetch reali, disco temp)
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCollabServer } = require(path.join(__dirname, '..', 'collab-server.js'));
const CC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-collab-core.js'));

let srv, port, dir, tok, admin;

function api(p, opts) {
  return fetch('http://127.0.0.1:' + port + p, opts).then(async r => ({
    status: r.status, body: await r.json().catch(() => null)
  }));
}

function mkNode(over) {
  return Object.assign({
    id: 'n1', text: 'Clorofilla', color: CC.PALETTE[0], size: 'm',
    x: 0.4, y: 0.2, updatedAt: Date.now()
  }, over || {});
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-test-'));
  srv = createCollabServer({
    repoRoot: path.join(__dirname, '..'),
    dir,
    session: { name: 'Fotosintesi', rootLabel: 'La Fotosintesi' }
  });
  port = await srv.listen(0, '127.0.0.1');
  const st = srv.state();
  tok = st.session.token;
  admin = st.session.adminToken;
});

after(async () => { if (srv) await srv.stop(); });

test('GET /api/session: token valido → meta + palette', async () => {
  const r = await api('/api/session?s=' + tok);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.session.rootLabel, 'La Fotosintesi');
  assert.deepStrictEqual(r.body.palette, CC.PALETTE);
});

test('GET /api/session: token sbagliato → 403', async () => {
  const r = await api('/api/session?s=nope');
  assert.strictEqual(r.status, 403);
});

test('POST /api/join: gruppo nuovo → colore assegnato', async () => {
  const r = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'dev1' })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.nick, 'I Leoni');
  assert.ok(CC.PALETTE.includes(r.body.color));
});

test('POST /api/join: stesso nick da ALTRO device → 409; stesso device → rientra', async () => {
  const other = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'dev2' })
  });
  assert.strictEqual(other.status, 409);
  const same = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'dev1' })
  });
  assert.strictEqual(same.status, 200);
});

test('POST /api/nodes: merge valido + rifiuto invalidi', async () => {
  const r = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({
      token: tok, nick: 'I Leoni', deviceId: 'dev1',
      nodes: [mkNode(), mkNode({ id: 'n2', color: 'red' })]
    })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.accepted, 1);
  assert.strictEqual(r.body.rejected.length, 1);
});

test('POST /api/nodes: tutti invalidi → 422', async () => {
  const r = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({
      token: tok, nick: 'I Leoni', deviceId: 'dev1',
      nodes: [mkNode({ text: '' })]
    })
  });
  assert.strictEqual(r.status, 422);
});

test('POST /api/nodes: device sbagliato → 403', async () => {
  const r = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'devX', nodes: [mkNode()] })
  });
  assert.strictEqual(r.status, 403);
});

test('GET /api/board: gruppi e nodi visibili con token studente', async () => {
  const r = await api('/api/board?s=' + tok);
  assert.strictEqual(r.status, 200);
  const g = r.body.groups.find(g => g.nick === 'I Leoni');
  assert.ok(g && g.nodes.length === 1 && g.nodes[0].text === 'Clorofilla');
});

test('GET /api/status: solo admin', async () => {
  const no = await api('/api/status?admin=' + tok);
  assert.strictEqual(no.status, 403);
  const ok = await api('/api/status?admin=' + admin);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.groups[0].nodeCount, 1);
});

test('POST /api/release + nuovo device adotta il gruppo', async () => {
  const rel = await api('/api/release', {
    method: 'POST',
    body: JSON.stringify({ adminToken: admin, nick: 'I Leoni' })
  });
  assert.strictEqual(rel.status, 200);
  const adopt = await api('/api/join', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'dev2' })
  });
  assert.strictEqual(adopt.status, 200);
  assert.strictEqual(adopt.body.nodes.length, 1); // i nodi restano
});

test('ripresa da disco: stop → nuovo server sulla stessa dir → stesso token e gruppi', async () => {
  await srv.stop();
  srv = createCollabServer({ repoRoot: path.join(__dirname, '..'), dir });
  port = await srv.listen(0, '127.0.0.1');
  const st = srv.state();
  assert.strictEqual(st.session.token, tok);          // il QR proiettato resta valido
  assert.strictEqual(st.groups[0].nick, 'I Leoni');
  assert.strictEqual(st.groups[0].nodeCount, 1);
});

test('static: allowlist rigida (403 fuori, 200 il core)', async () => {
  const forbidden = await fetch('http://127.0.0.1:' + port + '/main.js');
  assert.strictEqual(forbidden.status, 403);
  const traversal = await fetch('http://127.0.0.1:' + port + '/public/collab/../../main.js');
  assert.strictEqual(traversal.status, 403);
  const core = await fetch('http://127.0.0.1:' + port + '/public/js/mappai-collab-core.js');
  assert.strictEqual(core.status, 200);
});

test('POST /api/nodes: links con keyword + flag done → board li espone', async () => {
  // stato post-restart: gruppo "I Leoni" adottato da dev2 con 1 nodo (n1)
  const nodes = [
    mkNode({ id: 'n1', text: 'Clorofilla' }),
    mkNode({ id: 'n2', text: 'Ossigeno', x: -0.4 })
  ];
  const links = [{ id: 'l1', source: 'n1', target: 'n2', rel: 'produce', updatedAt: Date.now() }];
  const r = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({ token: tok, nick: 'I Leoni', deviceId: 'dev2', nodes, links, done: true })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.linksAccepted, 1);
  assert.strictEqual(r.body.done, true);

  const board = await api('/api/board?s=' + tok);
  const g = board.body.groups.find(g => g.nick === 'I Leoni');
  assert.strictEqual(g.links.length, 1);
  assert.strictEqual(g.links[0].rel, 'produce');
  assert.strictEqual(g.done, true);

  const st = await api('/api/status?admin=' + admin);
  assert.strictEqual(st.body.groups[0].linkCount, 1);
  assert.strictEqual(st.body.groups[0].done, true);
});

test('POST /api/reopen: docente sblocca → done torna false (nodi intatti)', async () => {
  // "I Leoni" è done=true dal test precedente
  const r = await api('/api/reopen', {
    method: 'POST',
    body: JSON.stringify({ adminToken: admin, nick: 'I Leoni' })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.done, false);

  const board = await api('/api/board?s=' + tok);
  const g = board.body.groups.find(g => g.nick === 'I Leoni');
  assert.strictEqual(g.done, false);
  assert.strictEqual(g.links.length, 1); // link/nodi non toccati
});

test('POST /api/reopen: senza adminToken → 403', async () => {
  const r = await api('/api/reopen', {
    method: 'POST',
    body: JSON.stringify({ nick: 'I Leoni' })
  });
  assert.strictEqual(r.status, 403);
});

test('POST /api/reopen: idempotente su gruppo già in-corso + nick inesistente no-op', async () => {
  const again = await api('/api/reopen', {
    method: 'POST',
    body: JSON.stringify({ adminToken: admin, nick: 'I Leoni' })
  });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.done, false);

  const ghost = await api('/api/reopen', {
    method: 'POST',
    body: JSON.stringify({ adminToken: admin, nick: 'Nessuno' })
  });
  assert.strictEqual(ghost.status, 200);
  assert.strictEqual(ghost.body.ok, true);
});

test('POST /api/nodes: link con estremità inesistente → rejected, non salvato', async () => {
  const r = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({
      token: tok, nick: 'I Leoni', deviceId: 'dev2',
      nodes: [mkNode({ id: 'n1' }), mkNode({ id: 'n2', x: -0.4 })],
      links: [{ id: 'l2', source: 'n1', target: 'ghost', rel: 'x', updatedAt: Date.now() }]
    })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.linksAccepted, 0);
  assert.strictEqual(r.body.linksRejected.length, 1);
  const board = await api('/api/board?s=' + tok);
  const g = board.body.groups.find(g => g.nick === 'I Leoni');
  assert.strictEqual(g.links.length, 1);   // resta solo l1
});
