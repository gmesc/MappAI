'use strict';
/*
 * relay/server.js — relay MappAI "variante WEB" (deploy: Infomaniak Sito Node.js)
 * ---------------------------------------------------------------------------
 * Ponte fra i telefoni degli studenti (HTTPS) e il PC del docente (WSS in
 * USCITA — passa i firewall scolastici). Il relay è un TUBO PURO:
 *   - zero persistenza, zero log dei body (transitano risposte quiz e chat
 *     tutor = dati personali → per questo gira su hosting svizzero)
 *   - inoltra SOLO i path studente (allowlist in relay-core.js): gli endpoint
 *     admin dei server locali non transitano MAI
 *
 * Flusso:
 *   docente  ──WSS /agent──> register {activity, token, mode} → {code, publicUrl}
 *   studente ──GET /j/<code>──> 302 all'entry della sessione + cookie mappai_s
 *   studente ──/api/... | statici──> route per token (query ?s= / body JSON /
 *              cookie) → frame req sul WS del docente → risposta a chunk
 *
 * Avvio (Infomaniak): PORT=<pannello> PUBLIC_ORIGIN=https://live.insegnai.ch \
 *   [RELAY_SECRET=...] node server.js       — healthcheck: GET /healthz
 * Test locale: PORT=8790 node server.js  (PUBLIC_ORIGIN default = http://127.0.0.1:PORT)
 */
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const RC = require('./relay-core.js');

function cryptoRng() {
  return crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
}

function createRelay(opts) {
  opts = opts || {};
  const L = Object.assign({}, RC.LIMITS, opts.limits || {});
  const publicOrigin = (opts.publicOrigin || '').replace(/\/+$/, '');
  const secret = opts.secret || null;
  const log = opts.quiet ? function () {} : function () { console.log.apply(console, ['[relay]'].concat([].slice.call(arguments))); };

  // registry sessioni: code → sessione; indice token → code
  const sessions = new Map();   // code → { code, token, activity, mode, entry, ws, lastSeen, createdAt }
  const byToken = new Map();    // token → code
  const regLog = new Map();     // ip → [timestamps] (rate-limit registrazioni)
  let seq = 0;

  function removeSession(s, why) {
    sessions.delete(s.code);
    if (byToken.get(s.token) === s.code) byToken.delete(s.token);
    if (s.ws && s.ws.readyState === 1) { try { s.ws.close(); } catch (e) { } }
    log('session', s.code, 'removed (' + why + ')');
  }

  // ── sweeper TTL / connessioni stantie ────────────────────────────────────
  const sweeper = setInterval(function () {
    const now = Date.now();
    for (const s of Array.from(sessions.values())) {
      if (now - s.createdAt > L.sessionTtlMs) removeSession(s, 'ttl');
      else if ((!s.ws || s.ws.readyState !== 1) && now - s.lastSeen > L.staleMs) removeSession(s, 'stale');
    }
    for (const [ip, arr] of regLog) {
      const fresh = arr.filter(function (t) { return now - t < 60000; });
      if (fresh.length) regLog.set(ip, fresh); else regLog.delete(ip);
    }
  }, opts.sweepMs || 30000);
  sweeper.unref();

  function rateLimited(ip) {
    const now = Date.now();
    const arr = (regLog.get(ip) || []).filter(function (t) { return now - t < 60000; });
    arr.push(now);
    regLog.set(ip, arr);
    return arr.length > L.regPerMinPerIp;
  }

  // ── HTTP: studenti + healthcheck ─────────────────────────────────────────
  const server = http.createServer(function (req, res) {
    const u = new URL(req.url, 'http://relay');
    const pathname = u.pathname;

    if (req.method === 'GET' && pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    }

    // Ingresso QR corto: /j/<code> → 302 all'entry + cookie di sessione
    // (il cookie serve SOLO agli asset statici senza token, vedi relay-core)
    const jm = pathname.match(/^\/j\/([A-Z2-9]{4,10})$/i);
    if (req.method === 'GET' && jm) {
      const s = sessions.get(jm[1].toUpperCase());
      if (!s) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Sessione non trovata o terminata.'); }
      const secure = /^https:/i.test(publicOrigin) ? '; Secure' : '';
      res.writeHead(302, {
        Location: s.entry,
        'Set-Cookie': 'mappai_s=' + s.token + '; Path=/; SameSite=Lax; Max-Age=' + Math.floor(L.sessionTtlMs / 1000) + secure,
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(404); return res.end();
    }

    // Buffer del body (serve sia per estrarre il token dei POST sia per l'inoltro)
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', function (c) {
      total += c.length;
      if (total > L.reqBodyMax) {
        /* Rifiuto con la RISPOSTA, non col silenzio (19/9/2026). Qui c'era
           `req.destroy()` subito dopo `res.end()`, ed era una corsa persa una
           volta su dieci: mentre il client sta ancora caricando, il RST del
           socket SCARTA i byte del 413 già in viaggio, e chi chiama riceve un
           errore di rete indistinguibile da una connessione caduta.
           ⚠️ Misurato: `req.destroy()` nella callback di `res.end()` NON basta
           (1 fallimento su 20) — la callback dice «consegnato al sistema», non
           «arrivato», e il RST vince lo stesso. La cura è non distruggere:
           si smette di leggere (`pause`) e si dichiara `Connection: close`, così
           Node chiude con un FIN DOPO aver svuotato la risposta. 0 su 25.
           Il gemello corretto è `live-server.js:945`, che risponde nel `close`
           se le intestazioni non sono già partite.
           Guardia: tests/relay-server.test.js «body oltre 1MB → 413». */
        aborted = true;
        req.pause();
        res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify({ error: 'body-too-large' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      if (aborted) return;
      const body = Buffer.concat(chunks);
      let bodyJson = null;
      if (req.method === 'POST' && body.length) {
        try { bodyJson = JSON.parse(body.toString('utf8')); } catch (e) { bodyJson = null; }
      }
      const found = RC.extractToken({
        query: { s: u.searchParams.get('s') || undefined },
        bodyJson: bodyJson,
        cookieHeader: req.headers.cookie
      });
      const code = found && byToken.get(found.token);
      const s = code && sessions.get(code);
      if (!s) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'unknown-session' })); }
      if (!RC.isAllowedPath(s.activity, req.method, pathname)) {
        res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'not-found' }));
      }
      if (!s.ws || s.ws.readyState !== 1) {
        res.writeHead(502, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'teacher-offline' }));
      }
      forward(s, req, res, pathname + u.search, body);
    });
  });

  // Inoltro di una richiesta studente sul WS del docente; risposta a chunk.
  function forward(s, req, res, pathWithQuery, body) {
    const id = ++seq;
    const pend = {
      res: res,
      headersSent: false,
      received: 0,
      timer: setTimeout(function () {
        s.pending.delete(id);
        if (!pend.headersSent) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'timeout' })); }
        else res.destroy();
      }, L.pendingTimeoutMs)
    };
    s.pending.set(id, pend);
    res.on('close', function () { // studente sparito → pulizia
      const p = s.pending.get(id);
      if (p) { clearTimeout(p.timer); s.pending.delete(id); }
    });
    s.ws.send(RC.encodeFrame({
      t: 'req', id: id, method: req.method, path: pathWithQuery,
      headers: RC.headerSubset(req.headers, 'req'),
      b64: body.length ? body.toString('base64') : ''
    }));
  }

  function failPending(s, error) {
    for (const [id, p] of s.pending) {
      clearTimeout(p.timer);
      if (!p.headersSent) { p.res.writeHead(502, { 'Content-Type': 'application/json' }); p.res.end(JSON.stringify({ error: error })); }
      else p.res.destroy();
      s.pending.delete(id);
    }
  }

  // ── WSS: agenti docente su /agent ────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', function (req, socket, head) {
    const u = new URL(req.url, 'http://relay');
    if (u.pathname !== '/agent') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, function (ws) { wss.emit('connection', ws, req); });
  });

  wss.on('connection', function (ws, req) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    let session = null; // sessione di QUESTA connessione, dopo register

    ws.on('message', function (data) {
      const dec = RC.decodeFrame(data.toString());
      if (!dec.ok) { ws.send(RC.encodeFrame({ t: 'err', error: dec.error })); return; }
      const f = dec.frame;

      if (f.t === 'ping') {
        if (session) session.lastSeen = Date.now();
        ws.send(RC.encodeFrame({ t: 'pong' }));
        return;
      }

      if (f.t === 'register') {
        const v = RC.validateRegister(f);
        if (!v.ok) { ws.send(RC.encodeFrame({ t: 'err', error: v.error })); ws.close(); return; }
        if (secret && f.secret !== secret) { ws.send(RC.encodeFrame({ t: 'err', error: 'bad-secret' })); ws.close(); return; }
        if (rateLimited(ip)) { ws.send(RC.encodeFrame({ t: 'err', error: 'rate-limited' })); ws.close(); return; }

        // stesso token già registrato (riconnessione/restart) → adotta la sessione
        const prevCode = byToken.get(f.token);
        let s = prevCode && sessions.get(prevCode);
        if (s) {
          if (s.ws && s.ws !== ws && s.ws.readyState === 1) { try { s.ws.close(); } catch (e) { } }
          failPending(s, 'teacher-reconnected');
        } else {
          if (sessions.size >= L.maxSessions) { ws.send(RC.encodeFrame({ t: 'err', error: 'relay-full' })); ws.close(); return; }
          // wantCode onorato solo se libero (il caso "mio" è già coperto sopra via token)
          let code = (f.wantCode && !sessions.has(f.wantCode)) ? f.wantCode : null;
          if (!code) code = RC.makeCode(L.codeLen, function (c) { return sessions.has(c); }, cryptoRng);
          if (!code) { ws.send(RC.encodeFrame({ t: 'err', error: 'no-code' })); ws.close(); return; }
          s = { code: code, token: f.token, activity: f.activity, mode: f.mode || null, entry: null, createdAt: Date.now(), pending: new Map() };
          sessions.set(code, s);
          byToken.set(f.token, code);
        }
        // entry calcolato QUI (non ci si fida del client) + refresh attività
        s.activity = f.activity;
        s.mode = f.mode || null;
        s.entry = RC.entryPathFor(f.activity, f.token, f.mode);
        s.ws = ws;
        s.lastSeen = Date.now();
        session = s;
        log('session', s.code, 'registered (' + f.activity + (f.mode ? '/' + f.mode : '') + ') from', ip);
        ws.send(RC.encodeFrame({ t: 'registered', code: s.code, publicUrl: RC.publicUrlFor(publicOrigin, s.code) }));
        return;
      }

      // frames di risposta: solo da connessioni registrate
      if (!session) { ws.send(RC.encodeFrame({ t: 'err', error: 'not-registered' })); return; }
      session.lastSeen = Date.now();
      const p = session.pending.get(f.id);
      if (!p) return; // richiesta scaduta/abortita — ignora

      if (f.t === 'res-h') {
        if (p.headersSent) return;
        p.headersSent = true;
        p.res.writeHead(f.status || 200, RC.headerSubset(f.headers || {}, 'res'));
      } else if (f.t === 'res-c') {
        const buf = Buffer.from(String(f.b64 || ''), 'base64');
        p.received += buf.length;
        if (p.received > L.resTotalMax) {
          clearTimeout(p.timer); session.pending.delete(f.id); p.res.destroy(); return;
        }
        if (p.headersSent) p.res.write(buf);
      } else if (f.t === 'res-e') {
        clearTimeout(p.timer); session.pending.delete(f.id);
        if (p.headersSent) p.res.end();
        else { p.res.writeHead(502, { 'Content-Type': 'application/json' }); p.res.end(JSON.stringify({ error: 'empty-response' })); }
      } else if (f.t === 'res-err') {
        clearTimeout(p.timer); session.pending.delete(f.id);
        if (!p.headersSent) { p.res.writeHead(502, { 'Content-Type': 'application/json' }); p.res.end(JSON.stringify({ error: 'upstream-error' })); }
        else p.res.destroy();
      }
    });

    ws.on('close', function () {
      if (session) {
        session.lastSeen = Date.now();
        failPending(session, 'teacher-offline');
        if (session.ws === ws) session.ws = null; // il codice resta prenotato fino a staleMs
      }
    });
    ws.on('error', function () { /* close segue */ });
  });

  return {
    listen: function (port, host) {
      return new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(port, host || '0.0.0.0', function () { resolve(server.address().port); });
      });
    },
    close: function () {
      clearInterval(sweeper);
      for (const s of Array.from(sessions.values())) removeSession(s, 'shutdown');
      wss.close();
      return new Promise(function (resolve) { server.close(function () { resolve(); }); });
    },
    state: function () {
      return { sessions: Array.from(sessions.values()).map(function (s) { return { code: s.code, activity: s.activity, connected: !!(s.ws && s.ws.readyState === 1) }; }) };
    }
  };
}

module.exports = { createRelay };

// ── Avvio diretto (Infomaniak / locale) ────────────────────────────────────
if (require.main === module) {
  const port = parseInt(process.env.PORT || '8790', 10);
  const origin = process.env.PUBLIC_ORIGIN || ('http://127.0.0.1:' + port);
  const relay = createRelay({ publicOrigin: origin, secret: process.env.RELAY_SECRET || null });
  relay.listen(port).then(function (p) {
    console.log('[relay] MappAI relay in ascolto su :' + p + ' — origin pubblico ' + origin);
  }).catch(function (e) {
    console.error('[relay] avvio fallito:', e.message);
    process.exit(1);
  });
}
