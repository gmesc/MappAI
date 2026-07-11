'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGardenServer } = require('../garden-server.js');

// template 20×20 tutto floor con 2 parcelle disegnate
function mkTemplate() {
  const cells = [];
  for (let z = 0; z < 20; z++) for (let x = 0; x < 20; x++) cells.push({ x, z, biome: 'floor', quota: 0, alt: 0 });
  const plot = (id, ox, oz) => {
    const pc = [];
    for (let z = oz; z < oz + 6; z++) for (let x = ox; x < ox + 6; x++) pc.push([x, z]);
    return { id, cells: pc };
  };
  return { seed: 1, size: 20, sub: 3, cells, props: [], plots: [plot('p01', 1, 1), plot('p02', 10, 10)] };
}
const CONCEPT = { title: 'La fotosintesi', text: 'Le foglie trasformano luce e CO2 in energia chimica.', author: 'Ada' };

let srv, port, dir, tok, admin;
const base = () => 'http://127.0.0.1:' + port;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test-'));
  srv = createGardenServer({
    repoRoot: path.join(__dirname, '..'),
    dir,
    session: { name: 'Test 4B', plotSize: 15 },
    template: mkTemplate(),
    libs: { textures: {}, materials: {}, assets: {} }
  });
  port = await srv.listen(0, '127.0.0.1');   // porta effimera
  tok = srv.state().session.token;
  admin = srv.state().session.adminToken;
});
after(async () => { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test('GET / → redirect a garden.html col token', async () => {
  const r = await fetch(base() + '/', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.ok(r.headers.get('location').includes('garden.html?s=' + tok));
});

test('GET /api/session senza token → 403; col token → sessione completa', async () => {
  assert.equal((await fetch(base() + '/api/session')).status, 403);
  const r = await fetch(base() + '/api/session?s=' + tok);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.schema, 'mappai-garden-session@1');
  assert.equal(d.plots.length, 2);
  assert.equal(d.plots[0].status, 'free');
  assert.ok(Array.isArray(d.template.cells));
  assert.ok(d.libs);
});

test('static: garden.html servito, main.js e traversal BLOCCATI', async () => {
  const ok = await fetch(base() + '/tools/voxel-proto/garden.html');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/html/);
  const core = await fetch(base() + '/public/js/mappai-garden-core.js');
  assert.equal(core.status, 200);
  assert.match(core.headers.get('content-type'), /text\/javascript/);
  assert.equal((await fetch(base() + '/main.js')).status, 403);
  assert.equal((await fetch(base() + '/package.json')).status, 403);
  assert.equal((await fetch(base() + '/tools/voxel-proto/../../main.js')).status, 403);
});

test('claim: primo ok, secondo device 409, token errato 403', async () => {
  const post = (body) => fetch(base() + '/api/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal((await post({ token: 'x', plotId: 'p01', deviceId: 'A', owner: { name: 'Ada' } })).status, 403);
  const r1 = await post({ token: tok, plotId: 'p01', deviceId: 'A', owner: { name: 'Ada' } });
  assert.equal(r1.status, 200);
  const r2 = await post({ token: tok, plotId: 'p01', deviceId: 'B', owner: { name: 'Bruno' } });
  assert.equal(r2.status, 409);
  assert.equal((await r2.json()).by, 'Ada');
  // la sessione ora mostra p01 claimed
  const s = await (await fetch(base() + '/api/session?s=' + tok)).json();
  assert.equal(s.plots.find(p => p.id === 'p01').status, 'claimed');
});

test('plot: device sbagliato 403, submission invalida 422, valida 200 + file su disco', async () => {
  const post = (body) => fetch(base() + '/api/plot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const cells = [{ x: 1, z: 1, biome: 'wall', alt: 10 }];
  // p01 è di A: B non può consegnare
  assert.equal((await post({ token: tok, plotId: 'p01', deviceId: 'B', concept: CONCEPT, cells, props: [] })).status, 403);
  // targhetta mancante → 422
  const bad = await post({ token: tok, plotId: 'p01', deviceId: 'A', concept: null, cells, props: [] });
  assert.equal(bad.status, 422);
  assert.ok((await bad.json()).errors.some(e => e.code === 'targhetta-missing'));
  // muro alt 11 → 422
  const alt11 = await post({ token: tok, plotId: 'p01', deviceId: 'A', concept: CONCEPT, cells: [{ x: 1, z: 1, biome: 'wall', alt: 11 }], props: [] });
  assert.equal(alt11.status, 422);
  // valida → 200 + plots/p01.json + merged.json aggiornato
  const ok = await post({ token: tok, plotId: 'p01', deviceId: 'A', concept: CONCEPT, cells, props: [] });
  assert.equal(ok.status, 200);
  assert.ok(fs.existsSync(path.join(dir, 'plots', 'p01.json')));
  const merged = JSON.parse(fs.readFileSync(path.join(dir, 'merged.json'), 'utf8'));
  const c = merged.cells.find(c => c.x === 1 && c.z === 1);
  assert.equal(c.biome, 'wall');
  assert.equal(c.alt, 10);
  const s = await (await fetch(base() + '/api/session?s=' + tok)).json();
  const p1 = s.plots.find(p => p.id === 'p01');
  assert.equal(p1.status, 'submitted');
  assert.equal(p1.concept.title, CONCEPT.title);
});

test('status docente: solo con adminToken', async () => {
  assert.equal((await fetch(base() + '/api/status?admin=x')).status, 403);
  const r = await fetch(base() + '/api/status?admin=' + admin);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.submissions.length, 1);
  assert.equal(d.claims.length, 1);
});

test('release docente libera il claim (la consegna resta)', async () => {
  const r = await fetch(base() + '/api/release', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminToken: admin, plotId: 'p01' })
  });
  assert.equal(r.status, 200);
  const s = await (await fetch(base() + '/api/session?s=' + tok)).json();
  assert.equal(s.plots.find(p => p.id === 'p01').status, 'submitted'); // consegna esposta comunque
});

test('RIPRESA da disco: nuovo server sulla stessa cartella rilegge tutto', async () => {
  await srv.stop();
  srv = createGardenServer({ repoRoot: path.join(__dirname, '..'), dir });
  port = await srv.listen(0, '127.0.0.1');
  const st = srv.state();
  assert.equal(st.session.token, tok);            // stesso token: i QR stampati restano validi
  assert.deepEqual(st.submitted, ['p01']);
  const s = await (await fetch(base() + '/api/session?s=' + tok)).json();
  assert.equal(s.plots.find(p => p.id === 'p01').status, 'submitted');
});

test('template senza plots → griglia fallback dal plotSize', async () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test2-'));
  const tpl = mkTemplate();
  delete tpl.plots;
  const srv2 = createGardenServer({
    repoRoot: path.join(__dirname, '..'), dir: dir2,
    session: { name: 'Fallback', plotSize: 6 },
    template: tpl, libs: {}
  });
  const p2 = await srv2.listen(0, '127.0.0.1');
  const t2 = srv2.state().session.token;
  const s = await (await fetch('http://127.0.0.1:' + p2 + '/api/session?s=' + t2)).json();
  assert.ok(s.plots.length >= 1);
  await srv2.stop();
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('libs custom: consegna con texture/materiale namespaced → merge in sessione', async () => {
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test3-'));
  const srv3 = createGardenServer({
    repoRoot: path.join(__dirname, '..'), dir: dir3,
    session: { name: 'Libs', plotSize: 6 },
    template: mkTemplate(), libs: { textures: {}, materials: {}, assets: {} }
  });
  const p3 = await srv3.listen(0, '127.0.0.1');
  const t3 = srv3.state().session.token;
  const b3 = 'http://127.0.0.1:' + p3;
  await fetch(b3 + '/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t3, plotId: 'p01', deviceId: 'A', owner: { name: 'Ada' } }) });
  // mat custom SENZA libs → 422 (cell-bad-mat)
  const bad = await fetch(b3 + '/api/plot', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t3, plotId: 'p01', deviceId: 'A', concept: CONCEPT,
      cells: [{ x: 1, z: 1, biome: 'floor', mat: 'p01.mio' }], props: [] }) });
  assert.equal(bad.status, 422);
  assert.ok((await bad.json()).errors.some(e => e.code === 'cell-bad-mat'));
  // con libs namespaced → 200 e la sessione successiva le espone
  const ok = await fetch(b3 + '/api/plot', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t3, plotId: 'p01', deviceId: 'A', concept: CONCEPT,
      cells: [{ x: 1, z: 1, biome: 'floor', mat: 'p01.mio' }], props: [],
      libs: { textures: { 'p01.tex': { png: 'data:x', tags: [] } },
              materials: { 'p01.mio': { color: '#a00', faces: { top: 'p01.tex' }, tags: [] } } } }) });
  assert.equal(ok.status, 200);
  const s = await (await fetch(b3 + '/api/session?s=' + t3)).json();
  assert.ok(s.libs.materials['p01.mio']);
  assert.ok(s.libs.textures['p01.tex']);
  await srv3.stop();
  fs.rmSync(dir3, { recursive: true, force: true });
});
