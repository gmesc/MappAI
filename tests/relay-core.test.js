/*
 * relay-core.test.js — logica pura del relay "variante WEB"
 * Esegue con: node --test tests/relay-core.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const RC = require('../relay/relay-core.js');

// ── makeCode ────────────────────────────────────────────────────────────────
test('makeCode: lunghezza default 6 e alfabeto senza 0/O/1/I/L', () => {
  for (let i = 0; i < 50; i++) {
    const c = RC.makeCode();
    assert.strictEqual(c.length, 6);
    assert.match(c, /^[A-Z2-9]+$/);
    for (const ch of ['0', 'O', '1', 'I', 'L']) assert.ok(!c.includes(ch), 'vietato ' + ch);
  }
});

test('makeCode: evita collisioni via isTaken', () => {
  // rng deterministico → primo tentativo sempre uguale; isTaken lo rifiuta una volta
  let calls = 0;
  const seen = new Set();
  const code = RC.makeCode(6, (c) => { calls++; if (calls === 1) { seen.add(c); return true; } return false; });
  assert.ok(code);
  assert.ok(calls >= 2);
});

test('makeCode: spazio saturo → null (nessun loop infinito)', () => {
  assert.strictEqual(RC.makeCode(6, () => true), null);
});

// ── parseCookies / extractToken ─────────────────────────────────────────────
test('parseCookies: header multiplo', () => {
  const c = RC.parseCookies('a=1; mappai_s=tok_ABC-9; b=x=y');
  assert.strictEqual(c.mappai_s, 'tok_ABC-9');
  assert.strictEqual(c.a, '1');
  assert.strictEqual(c.b, 'x=y');
  assert.deepStrictEqual(RC.parseCookies(null), {});
});

test('extractToken: precedenza query > body > cookie', () => {
  const all = {
    query: { s: 'tokQUERY99' },
    bodyJson: { token: 'tokBODY99' },
    cookieHeader: 'mappai_s=tokCOOKIE9'
  };
  assert.deepStrictEqual(RC.extractToken(all), { token: 'tokQUERY99', source: 'query' });
  assert.deepStrictEqual(RC.extractToken({ bodyJson: all.bodyJson, cookieHeader: all.cookieHeader }),
    { token: 'tokBODY99', source: 'body' });
  assert.deepStrictEqual(RC.extractToken({ cookieHeader: all.cookieHeader }),
    { token: 'tokCOOKIE9', source: 'cookie' });
  assert.strictEqual(RC.extractToken({}), null);
});

test('extractToken: token malformati rifiutati (cade al livello successivo)', () => {
  // query invalida → prova body
  const r = RC.extractToken({ query: { s: 'ab' }, bodyJson: { token: 'tokBODY99' } });
  assert.deepStrictEqual(r, { token: 'tokBODY99', source: 'body' });
  assert.strictEqual(RC.extractToken({ query: { s: 'ha spazi!!' } }), null);
  assert.strictEqual(RC.extractToken({ bodyJson: { token: 123 } }), null);
});

// ── isAllowedPath: matrice ──────────────────────────────────────────────────
test('allowlist live: path studente ok, admin bloccati', () => {
  assert.ok(RC.isAllowedPath('live', 'GET', '/api/session'));
  assert.ok(RC.isAllowedPath('live', 'POST', '/api/join'));
  assert.ok(RC.isAllowedPath('live', 'POST', '/api/answer'));
  assert.ok(RC.isAllowedPath('live', 'POST', '/api/finish'));
  assert.ok(RC.isAllowedPath('live', 'POST', '/api/propose'));
  assert.ok(RC.isAllowedPath('live', 'GET', '/public/live/student.html'));
  assert.ok(RC.isAllowedPath('live', 'GET', '/public/live/timeline-build.html'));
  assert.ok(RC.isAllowedPath('live', 'GET', '/public/js/mappai-live-core.js'));
  for (const p of ['/api/status', '/api/report', '/api/phase', '/api/release', '/api/close', '/api/review']) {
    assert.ok(!RC.isAllowedPath('live', 'GET', p), p);
    assert.ok(!RC.isAllowedPath('live', 'POST', p), p);
  }
});

test('allowlist collab: ok/bloccati', () => {
  assert.ok(RC.isAllowedPath('collab', 'GET', '/api/session'));
  assert.ok(RC.isAllowedPath('collab', 'GET', '/api/board'));
  assert.ok(RC.isAllowedPath('collab', 'POST', '/api/nodes'));
  assert.ok(RC.isAllowedPath('collab', 'GET', '/public/collab/student.html'));
  assert.ok(RC.isAllowedPath('collab', 'GET', '/public/js/mappai-collab-core.js'));
  for (const p of ['/api/status', '/api/release', '/api/reopen']) {
    assert.ok(!RC.isAllowedPath('collab', 'GET', p), p);
    assert.ok(!RC.isAllowedPath('collab', 'POST', p), p);
  }
});

test('allowlist tutor: ok/bloccati', () => {
  assert.ok(RC.isAllowedPath('tutor', 'GET', '/api/session'));
  for (const p of ['/api/join', '/api/tutor', '/api/draft', '/api/submit']) {
    assert.ok(RC.isAllowedPath('tutor', 'POST', p), p);
  }
  assert.ok(RC.isAllowedPath('tutor', 'GET', '/public/tutor/student.html'));
  for (const p of ['/api/status', '/api/report', '/api/reopen', '/api/close']) {
    assert.ok(!RC.isAllowedPath('tutor', 'GET', p), p);
    assert.ok(!RC.isAllowedPath('tutor', 'POST', p), p);
  }
});

test('allowlist materials: solo GET', () => {
  assert.ok(RC.isAllowedPath('materials', 'GET', '/api/materials'));
  assert.ok(RC.isAllowedPath('materials', 'GET', '/files/dispensa.pdf'));
  assert.ok(RC.isAllowedPath('materials', 'GET', '/public/live/materials.html'));
  assert.ok(RC.isAllowedPath('materials', 'GET', '/public/live/file.html'));
  assert.ok(!RC.isAllowedPath('materials', 'POST', '/api/materials'));
  assert.ok(!RC.isAllowedPath('materials', 'GET', '/api/status'));
});

test('allowlist garden: ok/bloccati', () => {
  assert.ok(RC.isAllowedPath('garden', 'GET', '/api/session'));
  assert.ok(RC.isAllowedPath('garden', 'POST', '/api/claim'));
  assert.ok(RC.isAllowedPath('garden', 'POST', '/api/plot'));
  assert.ok(RC.isAllowedPath('garden', 'GET', '/tools/voxel-proto/garden.html'));
  assert.ok(!RC.isAllowedPath('garden', 'GET', '/api/status'));
  assert.ok(!RC.isAllowedPath('garden', 'POST', '/api/release'));
});

test('allowlist: vendor comune, traversal e attività ignote rifiutate', () => {
  for (const a of RC.ACTIVITIES) {
    assert.ok(RC.isAllowedPath(a, 'GET', '/public/js/vendor/qrcode-generator.js'), a);
  }
  assert.ok(!RC.isAllowedPath('live', 'GET', '/public/live/../../main.js'));
  assert.ok(!RC.isAllowedPath('boh', 'GET', '/api/session'));
  assert.ok(!RC.isAllowedPath('live', 'DELETE', '/api/session'));
  assert.ok(!RC.isAllowedPath('live', 'GET', '/'));
});

// ── entryPathFor ────────────────────────────────────────────────────────────
test('entryPathFor: 6 varianti (incluso timeline build)', () => {
  assert.strictEqual(RC.entryPathFor('live', 'tok_11'), '/public/live/student.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('live', 'tok_11', 'build'), '/public/live/timeline-build.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('collab', 'tok_11'), '/public/collab/student.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('tutor', 'tok_11'), '/public/tutor/student.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('materials', 'tok_11'), '/public/live/materials.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('garden', 'tok_11'), '/tools/voxel-proto/garden.html?s=tok_11');
  assert.strictEqual(RC.entryPathFor('boh', 'tok_11'), null);
});

// L'entry va sempre allowlistato per la sua stessa attività (invariante).
test('entryPathFor coerente con isAllowedPath', () => {
  for (const a of RC.ACTIVITIES) {
    const entry = RC.entryPathFor(a, 'tok_11');
    const pathname = entry.split('?')[0];
    assert.ok(RC.isAllowedPath(a, 'GET', pathname), a + ' → ' + pathname);
  }
  const build = RC.entryPathFor('live', 'tok_11', 'build').split('?')[0];
  assert.ok(RC.isAllowedPath('live', 'GET', build));
});

// ── validateRegister ────────────────────────────────────────────────────────
test('validateRegister: ok e campi invalidi', () => {
  const good = { t: 'register', v: 1, activity: 'live', token: 'tok_ABC123' };
  assert.ok(RC.validateRegister(good).ok);
  assert.ok(RC.validateRegister(Object.assign({}, good, { mode: 'build' })).ok);
  assert.ok(RC.validateRegister(Object.assign({}, good, { wantCode: 'K7M3PX' })).ok);
  assert.ok(!RC.validateRegister(Object.assign({}, good, { v: 2 })).ok);
  assert.ok(!RC.validateRegister(Object.assign({}, good, { activity: 'boh' })).ok);
  assert.ok(!RC.validateRegister(Object.assign({}, good, { token: 'no!' })).ok);
  assert.ok(!RC.validateRegister(Object.assign({}, good, { mode: 'x' })).ok);
  assert.ok(!RC.validateRegister(Object.assign({}, good, { wantCode: 'abc' })).ok);
  assert.ok(!RC.validateRegister({ t: 'ping' }).ok);
  assert.ok(!RC.validateRegister(null).ok);
});

// ── frames ──────────────────────────────────────────────────────────────────
test('frames: round-trip e validazione', () => {
  const f = { t: 'req', id: 7, method: 'POST', path: '/api/join', headers: { 'content-type': 'application/json' }, b64: 'e30=' };
  const dec = RC.decodeFrame(RC.encodeFrame(f));
  assert.ok(dec.ok);
  assert.deepStrictEqual(dec.frame, f);
});

test('frames: malformati e oversize rifiutati', () => {
  assert.strictEqual(RC.decodeFrame('').ok, false);
  assert.strictEqual(RC.decodeFrame('{no json').ok, false);
  assert.strictEqual(RC.decodeFrame('[1,2]').ok, false);
  assert.strictEqual(RC.decodeFrame('{"t":"hack"}').ok, false);
  assert.strictEqual(RC.decodeFrame('{"t":"req","id":{}}').ok, false);
  const big = RC.encodeFrame({ t: 'res-c', id: 1, b64: 'A'.repeat(RC.LIMITS.frameMax) });
  assert.strictEqual(RC.decodeFrame(big).ok, false);
  assert.strictEqual(RC.decodeFrame(big).error, 'oversize');
});

// ── headerSubset ────────────────────────────────────────────────────────────
test('headerSubset: whitelist req e res', () => {
  const h = {
    'Content-Type': 'application/json', 'X-Evil': '1', Cookie: 'secret',
    'Content-Disposition': 'attachment', Location: '/x', 'Cache-Control': 'no-store',
    Authorization: 'Bearer x'
  };
  assert.deepStrictEqual(RC.headerSubset(h, 'req'), { 'content-type': 'application/json' });
  assert.deepStrictEqual(RC.headerSubset(h, 'res'), {
    'content-type': 'application/json',
    'content-disposition': 'attachment',
    location: '/x',
    'cache-control': 'no-store'
  });
  assert.deepStrictEqual(RC.headerSubset(null, 'res'), {});
});

// ── publicUrlFor ────────────────────────────────────────────────────────────
test('publicUrlFor: wss/ws/https/http, /agent e slash finali', () => {
  assert.strictEqual(RC.publicUrlFor('wss://live.insegnai.ch', 'K7M3PX'), 'https://live.insegnai.ch/j/K7M3PX');
  assert.strictEqual(RC.publicUrlFor('wss://live.insegnai.ch/agent', 'K7M3PX'), 'https://live.insegnai.ch/j/K7M3PX');
  assert.strictEqual(RC.publicUrlFor('ws://127.0.0.1:8790/', 'AB2CD3'), 'http://127.0.0.1:8790/j/AB2CD3');
  assert.strictEqual(RC.publicUrlFor('https://live.insegnai.ch/', 'AB2CD3'), 'https://live.insegnai.ch/j/AB2CD3');
  assert.strictEqual(RC.publicUrlFor('ftp://x', 'A'), null);
  assert.strictEqual(RC.publicUrlFor('', 'A'), null);
});
