/*
 * relay-core.js — logica PURA del relay "variante WEB" (testabile in Node)
 * -------------------------------------------------------------------------
 * Nessun accesso a rete/fs: funzioni deterministiche condivise tra il relay
 * su Infomaniak (relay/server.js) e il client nel main Electron
 * (relay-client.js). Pattern UMD dei core fratelli (mappai-live-core.js).
 *
 *  - LIMITS / CODE_ALPHABET / ACTIVITIES  → costanti condivise
 *  - makeCode          → codice sessione QR corto (senza 0/O/1/I/L)
 *  - parseCookies      → header Cookie → oggetto
 *  - extractToken      → token studente da query ?s= | body JSON .token |
 *                        cookie mappai_s (precedenza in quest'ordine)
 *  - isAllowedPath     → allowlist path studente per attività (il relay
 *                        RIFIUTA tutto il resto: gli endpoint admin dei
 *                        server locali non transitano MAI)
 *  - entryPathFor      → pagina studente di ingresso per attività (il relay
 *                        la calcola da activity+mode: non si fida del client)
 *  - validateRegister  → validazione frame di registrazione docente
 *  - encodeFrame / decodeFrame → protocollo WS v1 (frames JSON testuali)
 *  - headerSubset      → whitelist header inoltrabili (req e res)
 *  - publicUrlFor      → origin relay (wss/ws/https/http) → URL pubblico /j/<code>
 */
(function () {
  'use strict';

  // ── Costanti ─────────────────────────────────────────────────────────────
  var LIMITS = {
    reqBodyMax: 1048576,        // 1MB — specchia il BODY_CAP dei server locali
    resTotalMax: 26214400,      // 25MB — risposta totale (WAV sintesi, PDF)
    chunkMax: 262144,           // 256KB binari per frame res-c
    frameMax: 524288,           // cap frame WS codificato (chunk b64 + envelope)
    pingMs: 25000,              // keepalive < idle timeout proxy Infomaniak
    staleMs: 90000,             // connessione senza ping/pong → sessione rimossa
    sessionTtlMs: 21600000,     // 6h — TTL sessione (specchia Max-Age cookie)
    maxSessions: 200,
    regPerMinPerIp: 10,         // rate-limit registrazioni
    pendingTimeoutMs: 30000,    // richiesta inoltrata senza risposta → 504
    codeLen: 6
  };

  // Senza 0/O/1/I/L: il codice va letto/digitato da studenti se il QR fallisce.
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  var ACTIVITIES = ['live', 'collab', 'tutor', 'materials', 'garden'];

  var FRAME_TYPES = ['register', 'registered', 'req', 'res-h', 'res-c', 'res-e', 'res-err', 'ping', 'pong', 'err'];

  var TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;

  // ── Codice sessione ──────────────────────────────────────────────────────
  // rng iniettabile ([0,1)) per test deterministici; il server passa un rng
  // crypto-based. isTaken(code) evita collisioni con le sessioni attive.
  function makeCode(len, isTaken, rng) {
    len = len || LIMITS.codeLen;
    rng = rng || Math.random;
    isTaken = isTaken || function () { return false; };
    for (var attempt = 0; attempt < 50; attempt++) {
      var out = '';
      for (var i = 0; i < len; i++) {
        out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
      }
      if (!isTaken(out)) return out;
    }
    return null; // spazio saturo/rng rotto — il chiamante decide
  }

  // ── Cookie / token ───────────────────────────────────────────────────────
  function parseCookies(header) {
    var out = {};
    if (!header || typeof header !== 'string') return out;
    header.split(';').forEach(function (part) {
      var eq = part.indexOf('=');
      if (eq < 0) return;
      var k = part.slice(0, eq).trim();
      var v = part.slice(eq + 1).trim();
      if (k) out[k] = v;
    });
    return out;
  }

  // Precedenza: query ?s= → body JSON .token → cookie mappai_s.
  // Ritorna { token, source } oppure null se nessun token valido.
  function extractToken(opts) {
    opts = opts || {};
    var q = opts.query && opts.query.s;
    if (typeof q === 'string' && TOKEN_RE.test(q)) return { token: q, source: 'query' };
    var b = opts.bodyJson && opts.bodyJson.token;
    if (typeof b === 'string' && TOKEN_RE.test(b)) return { token: b, source: 'body' };
    var c = parseCookies(opts.cookieHeader).mappai_s;
    if (typeof c === 'string' && TOKEN_RE.test(c)) return { token: c, source: 'cookie' };
    return null;
  }

  // ── Allowlist path studente ──────────────────────────────────────────────
  // Il relay inoltra SOLO questi path: gli endpoint admin (status/report/
  // phase/close/release/reopen/review) restano raggiungibili solo da
  // 127.0.0.1 sul PC docente. Difesa in profondità oltre all'adminToken.
  var ALLOW = {
    live: {
      GET: { exact: ['/api/session', '/public/js/mappai-live-core.js'], prefix: ['/public/live/'] },
      POST: { exact: ['/api/join', '/api/answer', '/api/finish', '/api/propose'], prefix: [] }
    },
    collab: {
      GET: { exact: ['/api/session', '/api/board', '/public/js/mappai-collab-core.js'], prefix: ['/public/collab/'] },
      POST: { exact: ['/api/join', '/api/nodes'], prefix: [] }
    },
    tutor: {
      GET: { exact: ['/api/session'], prefix: ['/public/tutor/'] },
      POST: { exact: ['/api/join', '/api/tutor', '/api/draft', '/api/submit'], prefix: [] }
    },
    materials: {
      GET: { exact: ['/api/materials'], prefix: ['/files/', '/public/live/'] },
      POST: { exact: [], prefix: [] }
    },
    garden: {
      GET: {
        exact: ['/api/session', '/public/js/mappai-garden-core.js', '/public/js/mappai-dungeon-core.js'],
        prefix: ['/tools/voxel-proto/', '/public/assets/']
      },
      POST: { exact: ['/api/claim', '/api/plot'], prefix: [] }
    }
  };
  var ALLOW_COMMON_GET_PREFIX = ['/public/js/vendor/'];

  function isAllowedPath(activity, method, pathname) {
    if (typeof pathname !== 'string' || pathname.indexOf('..') !== -1) return false;
    var table = ALLOW[activity];
    if (!table) return false;
    method = String(method || '').toUpperCase();
    if (method === 'GET' && ALLOW_COMMON_GET_PREFIX.some(function (p) { return pathname.indexOf(p) === 0; })) return true;
    var rules = table[method];
    if (!rules) return false;
    if (rules.exact.indexOf(pathname) !== -1) return true;
    return rules.prefix.some(function (p) { return pathname.indexOf(p) === 0; });
  }

  // ── Entry point studente ─────────────────────────────────────────────────
  // Specchia i redirect '/' dei server locali (live-server.js:259 ecc.).
  // mode 'build' = Timeline Costruisci (stesso live-server).
  function entryPathFor(activity, token, mode) {
    var pages = {
      live: mode === 'build' ? '/public/live/timeline-build.html' : '/public/live/student.html',
      collab: '/public/collab/student.html',
      tutor: '/public/tutor/student.html',
      materials: '/public/live/materials.html',
      garden: '/tools/voxel-proto/garden.html'
    };
    var page = pages[activity];
    if (!page) return null;
    return page + '?s=' + encodeURIComponent(token);
  }

  // ── Registrazione ────────────────────────────────────────────────────────
  function validateRegister(frame) {
    if (!frame || frame.t !== 'register') return { ok: false, error: 'not-register' };
    if (frame.v !== 1) return { ok: false, error: 'bad-version' };
    if (ACTIVITIES.indexOf(frame.activity) === -1) return { ok: false, error: 'bad-activity' };
    if (typeof frame.token !== 'string' || !TOKEN_RE.test(frame.token)) return { ok: false, error: 'bad-token' };
    if (frame.mode != null && frame.mode !== 'build') return { ok: false, error: 'bad-mode' };
    if (frame.wantCode != null && !/^[A-Z2-9]{4,10}$/.test(frame.wantCode)) return { ok: false, error: 'bad-code' };
    return { ok: true };
  }

  // ── Frames WS v1 ─────────────────────────────────────────────────────────
  function encodeFrame(obj) {
    return JSON.stringify(obj);
  }

  function decodeFrame(str) {
    if (typeof str !== 'string' || !str.length) return { ok: false, error: 'empty' };
    if (str.length > LIMITS.frameMax) return { ok: false, error: 'oversize' };
    var obj;
    try { obj = JSON.parse(str); } catch (e) { return { ok: false, error: 'bad-json' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'not-object' };
    if (FRAME_TYPES.indexOf(obj.t) === -1) return { ok: false, error: 'bad-type' };
    if (obj.id != null && typeof obj.id !== 'number' && typeof obj.id !== 'string') return { ok: false, error: 'bad-id' };
    return { ok: true, frame: obj };
  }

  // ── Header inoltrabili ───────────────────────────────────────────────────
  var REQ_HEADERS = ['content-type'];
  var RES_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'location'];

  function headerSubset(headers, which) {
    var allow = which === 'req' ? REQ_HEADERS : RES_HEADERS;
    var out = {};
    if (!headers) return out;
    Object.keys(headers).forEach(function (k) {
      var lk = k.toLowerCase();
      if (allow.indexOf(lk) !== -1 && headers[k] != null) out[lk] = String(headers[k]);
    });
    return out;
  }

  // ── URL pubblico ─────────────────────────────────────────────────────────
  // Origin relay in qualunque forma (wss://, ws://, https://, http://, con o
  // senza /agent o trailing slash) → https?://host[:port]/j/<code>
  function publicUrlFor(origin, code) {
    if (typeof origin !== 'string' || !origin) return null;
    var o = origin.replace(/\/agent\/?$/, '').replace(/\/+$/, '');
    o = o.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    if (!/^https?:\/\//i.test(o)) return null;
    return o + '/j/' + code;
  }

  // ── Export UMD ───────────────────────────────────────────────────────────
  var API = {
    LIMITS: LIMITS,
    CODE_ALPHABET: CODE_ALPHABET,
    ACTIVITIES: ACTIVITIES,
    makeCode: makeCode,
    parseCookies: parseCookies,
    extractToken: extractToken,
    isAllowedPath: isAllowedPath,
    entryPathFor: entryPathFor,
    validateRegister: validateRegister,
    encodeFrame: encodeFrame,
    decodeFrame: decodeFrame,
    headerSubset: headerSubset,
    publicUrlFor: publicUrlFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.MappAIRelayCore = API;
})();
