'use strict';
/*
 * MappAI — client del relay per la variante WEB
 * Copyright (C) 2026 Giacomo Meschini <giacomo@insegnai.ch>
 *
 * Questo programma è software libero: puoi ridistribuirlo e/o modificarlo
 * secondo i termini della GNU General Public License come pubblicata dalla
 * Free Software Foundation, nella versione 3 della Licenza o (a tua scelta)
 * in una versione successiva.
 *
 * Questo programma è distribuito nella speranza che sia utile, ma SENZA
 * ALCUNA GARANZIA; senza neppure la garanzia implicita di COMMERCIABILITÀ o
 * IDONEITÀ A UNO SCOPO PARTICOLARE. Vedi la GNU General Public License per
 * maggiori dettagli.
 *
 * Dovresti aver ricevuto una copia della GNU General Public License insieme a
 * questo programma. In caso contrario, vedi <https://www.gnu.org/licenses/>.
 *
 * I componenti di terze parti inclusi (font, librerie) restano sotto le loro
 * licenze: vedi THIRD-PARTY-NOTICES.md.
 */
/*
 * relay-client.js — client del relay "variante WEB" (gira nel main Electron)
 * ---------------------------------------------------------------------------
 * Apre una connessione WSS IN USCITA verso il relay (relay/server.js su
 * Infomaniak), registra la sessione e inoltra le richieste studente ricevute
 * dal relay al server locale su 127.0.0.1:<localPort>. Fratello architetturale
 * dei *-server.js: zero dipendenze dal renderer, tutto via opts.
 *
 *   const { openSession } = require('./relay-client.js');
 *   const h = await openSession({ relayUrl, activity:'live', token, localPort });
 *   h.publicUrl   // https://…/j/<code> → nel QR
 *   h.code        // codice sessione
 *   h.close()     // chiusura volontaria (stop sessione)
 *
 * Riconnessione automatica con backoff (1/2/5/15s) e re-register con
 * wantCode → il relay ritrova la sessione per token e il QR resta valido.
 * Ping applicativo ogni 25s (idle timeout del proxy Infomaniak).
 */
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const RC = require(path.join(__dirname, 'relay', 'relay-core.js'));

const BACKOFF_MS = [1000, 2000, 5000, 15000];

function agentUrl(relayUrl) {
  const base = String(relayUrl || '').replace(/\/+$/, '');
  return /\/agent$/.test(base) ? base : base + '/agent';
}

function openSession(opts) {
  const relayUrl = opts.relayUrl;
  const timeoutMs = opts.timeoutMs || 5000;
  const log = opts.quiet ? function () {} : function () { console.log.apply(console, ['[relay-client]'].concat([].slice.call(arguments))); };

  const state = {
    ws: null,
    code: opts.wantCode || null,
    publicUrl: null,
    closed: false,        // chiusura volontaria → niente riconnessione
    pingTimer: null,
    reconnectTimer: null,
    attempt: 0
  };

  function send(frame) {
    if (state.ws && state.ws.readyState === 1) state.ws.send(RC.encodeFrame(frame));
  }

  // Richiesta del relay → server locale su 127.0.0.1, risposta a chunk.
  function handleReq(f) {
    const req = http.request({
      host: '127.0.0.1',
      port: opts.localPort,
      method: f.method,
      path: f.path,
      headers: f.headers || {}
    }, function (res) {
      send({ t: 'res-h', id: f.id, status: res.statusCode, headers: RC.headerSubset(res.headers, 'res') });
      res.on('data', function (chunk) {
        for (let i = 0; i < chunk.length; i += RC.LIMITS.chunkMax) {
          send({ t: 'res-c', id: f.id, b64: chunk.slice(i, i + RC.LIMITS.chunkMax).toString('base64') });
        }
      });
      res.on('end', function () { send({ t: 'res-e', id: f.id }); });
      res.on('error', function () { send({ t: 'res-err', id: f.id, error: 'local-stream' }); });
    });
    req.on('error', function (e) { send({ t: 'res-err', id: f.id, error: e.code || 'local-unreachable' }); });
    if (f.b64) req.write(Buffer.from(f.b64, 'base64'));
    req.end();
  }

  function connect(onRegistered, onFail) {
    const ws = new WebSocket(agentUrl(relayUrl));
    state.ws = ws;

    ws.on('open', function () {
      const reg = { t: 'register', v: 1, activity: opts.activity, token: opts.token };
      if (opts.mode) reg.mode = opts.mode;
      if (state.code) reg.wantCode = state.code;
      if (opts.secret) reg.secret = opts.secret;
      ws.send(RC.encodeFrame(reg));
    });

    ws.on('message', function (data) {
      const dec = RC.decodeFrame(data.toString());
      if (!dec.ok) return;
      const f = dec.frame;
      if (f.t === 'registered') {
        state.code = f.code;
        state.publicUrl = f.publicUrl;
        state.attempt = 0;
        if (!state.pingTimer) {
          state.pingTimer = setInterval(function () { send({ t: 'ping' }); }, RC.LIMITS.pingMs);
          if (state.pingTimer.unref) state.pingTimer.unref();
        }
        log('registered', f.code, '→', f.publicUrl);
        if (onRegistered) onRegistered();
      } else if (f.t === 'req') {
        handleReq(f);
      } else if (f.t === 'err') {
        log('relay error:', f.error);
        if (onFail) onFail(new Error(f.error));
      }
      // pong → nulla da fare (il relay aggiorna lastSeen)
    });

    ws.on('close', function () { scheduleReconnect(); });
    ws.on('error', function (e) {
      if (onFail) onFail(e);
      // 'close' segue sempre → la riconnessione parte da lì
    });
  }

  function scheduleReconnect() {
    if (state.closed || state.reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(state.attempt, BACKOFF_MS.length - 1)];
    state.attempt++;
    log('connessione persa, ritento fra', delay, 'ms');
    state.reconnectTimer = setTimeout(function () {
      state.reconnectTimer = null;
      if (state.closed) return;
      connect(null, null); // re-register con wantCode → stesso code, QR valido
    }, delay);
    if (state.reconnectTimer.unref) state.reconnectTimer.unref();
  }

  function close() {
    state.closed = true;
    if (state.pingTimer) { clearInterval(state.pingTimer); state.pingTimer = null; }
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    if (state.ws) { try { state.ws.close(); } catch (e) { } state.ws = null; }
  }

  return new Promise(function (resolve, reject) {
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      close();
      reject(new Error('relay-timeout'));
    }, timeoutMs);

    connect(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        get publicUrl() { return state.publicUrl; },
        get code() { return state.code; },
        close: close
      });
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      close();
      reject(err);
    });
  });
}

module.exports = { openSession };
