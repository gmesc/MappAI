'use strict';
/*
 * MappAI — server LAN «Chatta e Scrivi»
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
 * tutor-server.js — server LAN "Chatta e Scrivi" (007)
 * -----------------------------------------------------
 * Quinto fratello di garden/collab/live/materiali (stessi pattern): server HTTP
 * Node puro avviato dal main process via IPC. Gli studenti entrano via QR con
 * le credenziali di classe, chattano col Tutor AI sull'argomento assegnato
 * (cap scambi del docente) e consegnano un testo personale.
 *
 *   <dir>/session.json          — meta sessione (SENZA segreti) + roster
 *   <dir>/students/<id>.json    — chat + bozza + consegna (autosave)
 *   <dir>/results.json          — modello dati report (a chiusura)
 *   <dir>/report-tutor.html     — report testo+trascrizione per studente
 *
 * SICUREZZA: la chiave API e la systemInstruction arrivano da opts.secrets e
 * NON vengono mai persistite né serializzate verso i telefoni (publicState =
 * whitelist nel core). callModel è INIETTATO dal main (in-process) — nei test
 * è un mock. Le chiamate AI sono SERIALIZZATE (coda) con backoff su 429.
 *
 * Logica pura condivisa: public/js/mappai-tutor-core.js (+ live-core per le
 * identità di classe). Testabile senza Electron: tests/tutor-server.test.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const STATIC_ALLOW = ['/public/tutor/'];
const BODY_CAP = 1024 * 1024;   // 1 MB

function token(n) { return crypto.randomBytes(n).toString('base64url').slice(0, n); }

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  let size = 0; const chunks = [];
  req.on('data', d => { size += d.length; if (size > BODY_CAP) { req.destroy(); return; } chunks.push(d); });
  req.on('end', () => { try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { cb(e); } });
  req.on('error', e => cb(e));
}

function makeServeStatic(repoRoot) {
  return function serveStatic(urlPath, res) {
    const clean = path.posix.normalize(urlPath);
    if (clean.includes('..') || !STATIC_ALLOW.some(p => clean === p || clean.startsWith(p))) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const file = path.join(repoRoot, clean.replace(/^\//, '').split('/').join(path.sep));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      if (ext === '.html') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(data);
    });
  };
}

function createTutorServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const studentsDir = path.join(dir, 'students');
  fs.mkdirSync(studentsDir, { recursive: true });
  const serveStatic = makeServeStatic(repoRoot);

  const LC = require(path.join(repoRoot, 'public', 'js', 'mappai-live-core.js'));
  const TC = require(path.join(repoRoot, 'public', 'js', 'mappai-tutor-core.js'));

  // Segreti SOLO in memoria (mai su disco, mai in risposta HTTP):
  // ri-forniti a ogni avvio anche in caso di RIPRESA da disco.
  const secrets = {
    apiKey: (opts.secrets && opts.secrets.apiKey) || '',
    systemInstruction: (opts.secrets && opts.secrets.systemInstruction) || ''
  };
  // callModel iniettato dal main (in-process). Nei test: mock.
  const callModel = opts.callModel;
  if (typeof callModel !== 'function') throw new Error('callModel mancante');

  const sessionFile = path.join(dir, 'session.json');

  let session;
  let roster = [];       // [{emojiKey, num, name}] — credenziali classe
  let students = {};     // identityKey → { emojiKey,num,name,deviceId,phase,used,transcript,draft,submission }
  let providerSlow = false;   // 429/backoff in corso → esposto in /api/status

  // ── Stato: nuovo o RIPRESA da disco ─────────────────────────────────────
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session = s.session;
    roster = s.roster || [];
    for (const f of fs.readdirSync(studentsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const st = JSON.parse(fs.readFileSync(path.join(studentsDir, f), 'utf8'));
        if (st && st.emojiKey) students[LC.identityKey(st.emojiKey, st.num)] = st;
      } catch (e) { console.warn('[tutor-server] studente illeggibile', f); }
    }
    // provider/model/cap possono cambiare tra un avvio e l'altro: vincono gli opts
    const cfg = opts.session || {};
    ['provider', 'model', 'productId', 'maxTokens', 'cap', 'mode', 'writingBrief'].forEach(k => {
      if (cfg[k] !== undefined) session[k] = cfg[k];
    });
    console.log('[tutor-server] sessione RIPRESA:', session.name, '·', Object.keys(students).length, 'studenti');
  } else {
    const cfg = opts.session || {};
    session = {
      schema: 'mappai-tutor-session@1',
      name: cfg.name || 'Mappa',
      className: cfg.className || '',
      scope: cfg.scope || '',                      // 010: argomento/ramo coperto ('' = tutta la mappa)
      topic: cfg.topic || null,                    // { kind, id, label }
      mode: cfg.mode || 'socratic',
      cap: Number(cfg.cap) || TC.LIMITS.capDefault,
      writingBrief: cfg.writingBrief || '',
      provider: cfg.provider || 'google',
      model: cfg.model || '', productId: cfg.productId || '',
      maxTokens: Number(cfg.maxTokens) || TC.LIMITS.maxTokens,
      token: token(10),
      adminToken: token(16),
      phase: 'running',           // running → closed (niente lobby: si entra e si lavora)
      startedAt: new Date().toISOString(),
      closedAt: null
    };
    roster = Array.isArray(opts.roster) ? opts.roster : [];
    persist();
  }

  // session.json su disco: SENZA provider/model/segreti (whitelist esplicita)
  function persist() {
    fs.writeFileSync(sessionFile, JSON.stringify({
      schema: 'mappai-tutor-session@1',
      session: {
        schema: session.schema, name: session.name, className: session.className,
        topic: session.topic, mode: session.mode, cap: session.cap,
        writingBrief: session.writingBrief,
        token: session.token, adminToken: session.adminToken,
        phase: session.phase, startedAt: session.startedAt, closedAt: session.closedAt
      },
      roster,
      students: Object.keys(students)
    }, null, 2));
  }

  function persistStudent(id) {
    fs.writeFileSync(path.join(studentsDir, id + '.json'), JSON.stringify(students[id], null, 2));
  }

  function rosterEntry(emojiKey, num) {
    const key = LC.identityKey(emojiKey, num);
    return roster.find(r => LC.identityKey(r.emojiKey, r.num) === key) || null;
  }

  // ── Coda AI: UNA chiamata alla volta, backoff su 429 ──────────────────────
  let chain = Promise.resolve();
  function enqueue(fn) {
    const run = chain.then(fn, fn);   // la coda sopravvive agli errori del task precedente
    chain = run.catch(() => { });     // non propagare il fallimento ai task successivi
    return run;
  }
  async function askTutor(student, userText) {
    const payload = TC.buildChatPayload({
      provider: session.provider, model: session.model,
      systemInstruction: secrets.systemInstruction,
      transcript: student.transcript, userText,
      maxTokens: session.maxTokens
    });
    const args = {
      provider: session.provider, apiKey: secrets.apiKey,
      model: session.model, productId: session.productId, payload
    };
    try {
      const resp = await callModel(args);
      providerSlow = false;
      return TC.extractText(session.provider, resp);
    } catch (e) {
      if (e && (e.status === 429 || /429/.test(e.message || ''))) {
        providerSlow = true;   // dashboard: "il tutor è rallentato"
        await new Promise(r => setTimeout(r, 1500));
        const resp = await callModel(args);   // un solo retry
        providerSlow = false;
        return TC.extractText(session.provider, resp);
      }
      throw e;
    }
  }

  function closeSession() {
    if (session.phase === 'closed') return;   // idempotente
    session.phase = 'closed';
    session.closedAt = new Date().toISOString();
    const results = TC.computeTutorResults(session, Object.values(students));
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
    try {
      const TR = require(path.join(repoRoot, 'public', 'js', 'mappai-tutor-reports.js'));
      fs.writeFileSync(path.join(dir, 'report-tutor.html'), TR.buildTutorReportHtml(results));
    } catch (e) { console.warn('[tutor-server] report non generato:', e.message); }
    persist();
    console.log('[tutor-server] sessione CHIUSA:', session.name);
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;

    if (p === '/') {
      res.writeHead(302, { Location: '/public/tutor/student.html?s=' + session.token });
      res.end(); return;
    }

    if (p.startsWith('/api/')) {
      const isAdmin = (t) => t && t === session.adminToken;
      const okToken = (t) => t === session.token || isAdmin(t);

      if (p === '/api/session' && req.method === 'GET') {
        if (!okToken(u.searchParams.get('s'))) return json(res, 403, { error: 'token' });
        // SOLO campi pubblici (whitelist nel core) + emoji per il login
        return json(res, 200, Object.assign(TC.publicState(session), {
          schema: 'mappai-tutor-session@1',
          emojiSet: LC.EMOJI_SET
        }));
      }

      if (p === '/api/status' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          session: {
            name: session.name, className: session.className,
            topic: session.topic ? session.topic.label : '', mode: session.mode,
            cap: session.cap, phase: session.phase, startedAt: session.startedAt
          },
          providerSlow,
          roster: roster.map(r => {
            const st = students[LC.identityKey(r.emojiKey, r.num)];
            return {
              emojiKey: r.emojiKey, emoji: (LC.emojiByKey(r.emojiKey) || {}).emoji || '?',
              num: r.num, name: r.name || '',
              joined: !!(st && st.deviceId),
              phase: st ? st.phase : null,
              used: st ? (st.used || 0) : 0,
              // il badge ✓ segue la FASE, non la presenza del testo: "sblocca"
              // (reopen → phase 'writing') pulisce il ✓ pur conservando la
              // consegna su disco per il report. Ri-consegna → phase 'submitted'.
              submitted: !!(st && st.phase === 'submitted' && st.submission && st.submission.text)
            };
          }),
          joined: Object.keys(students).length
        });
      }

      if (p === '/api/report' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) { res.writeHead(403); res.end('forbidden'); return; }
        const f = path.join(dir, 'report-tutor.html');
        if (!fs.existsSync(f)) { res.writeHead(404); res.end('report non ancora generato'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(f)); return;
      }

      if (req.method === 'POST') {
        return readBody(req, (err, body) => {
          if (err) return json(res, 400, { error: 'bad-json' });

          // ── studente: entra (o rientra) ──
          if (p === '/api/join') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const rEntry = rosterEntry(body.emojiKey, body.num);
            if (!rEntry) return json(res, 404, { error: 'not-in-roster' });
            if (!body.deviceId || typeof body.deviceId !== 'string') return json(res, 400, { error: 'bad-device' });
            const id = LC.identityKey(body.emojiKey, body.num);
            let st = students[id];
            if (st && st.deviceId && st.deviceId !== body.deviceId) {
              return json(res, 409, { error: 'identity-taken' });
            }
            if (!st) {
              st = students[id] = {
                emojiKey: rEntry.emojiKey, num: rEntry.num, name: rEntry.name || '',
                deviceId: body.deviceId, joinedAt: new Date().toISOString(),
                phase: 'chat', used: 0, transcript: [], draft: '', submission: null
              };
            } else {
              st.deviceId = body.deviceId;   // rientro stesso device o adozione
            }
            persistStudent(id); persist();
            return json(res, 200, {
              ok: true, displayName: LC.displayName(st),
              phase: st.phase, used: st.used || 0, cap: session.cap,
              transcript: TC.buildTranscript(st), draft: st.draft || '',
              submitted: !!(st.submission && st.submission.text),
              sessionPhase: session.phase
            });
          }

          // helper comune: autentica lo studente del body
          const auth = () => {
            if (body.token !== session.token) { json(res, 403, { error: 'token' }); return null; }
            const id = LC.identityKey(body.emojiKey, body.num);
            const st = students[id];
            if (!st) { json(res, 404, { error: 'not-joined' }); return null; }
            if (st.deviceId !== body.deviceId) { json(res, 403, { error: 'not-your-identity' }); return null; }
            return { id, st };
          };

          // ── studente: turno di chat col tutor ──
          if (p === '/api/tutor') {
            const a = auth(); if (!a) return;
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            // GUARDRAIL PRIMA di ogni chiamata AI (FR-015/SC-002)
            if (!TC.canSpend(a.st, session.cap)) return json(res, 429, { error: 'cap-reached', used: a.st.used, cap: session.cap });
            const v = TC.validateMessage(body.text, TC.LIMITS.msgMax);
            if (!v.ok) return json(res, 400, { error: v.reason, max: v.max });

            // RISERVA lo scambio SUBITO (sincrono): con N invii simultanei il
            // check canSpend da solo li farebbe passare tutti (vedono lo stesso
            // used). Rollback su errore AI.
            a.st.used = (a.st.used || 0) + 1;

            enqueue(() => askTutor(a.st, v.clean)).then(reply => {
              if (!reply) throw new Error('risposta vuota');
              const now = new Date().toISOString();
              a.st.transcript.push({ role: 'user', text: v.clean, at: now });
              a.st.transcript.push({ role: 'tutor', text: reply, at: new Date().toISOString() });
              persistStudent(a.id);
              json(res, 200, { ok: true, reply, used: a.st.used, cap: session.cap });
            }).catch(e => {
              a.st.used = Math.max(0, (a.st.used || 1) - 1);   // rollback della riserva
              console.error('[tutor-server] chiamata AI fallita:', e.message);
              json(res, 503, { error: 'tutor-busy' });
            });
            return;
          }

          // ── studente: autosave bozza ──
          if (p === '/api/draft') {
            const a = auth(); if (!a) return;
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            a.st.draft = String(body.text || '').slice(0, TC.LIMITS.draftMax);
            if (a.st.phase === 'chat') a.st.phase = 'writing';
            persistStudent(a.id);
            return json(res, 200, { ok: true });
          }

          // ── studente: consegna ──
          if (p === '/api/submit') {
            const a = auth(); if (!a) return;
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const text = String(body.text || '').trim().slice(0, TC.LIMITS.draftMax);
            if (!text) return json(res, 400, { error: 'empty' });
            a.st.draft = text;
            a.st.submission = { text, at: new Date().toISOString() };
            a.st.phase = 'submitted';
            persistStudent(a.id); persist();
            return json(res, 200, { ok: true });
          }

          // ── docente: riapri la consegna di uno studente ──
          if (p === '/api/reopen') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            const id = LC.identityKey(body.emojiKey, body.num);
            const st = students[id];
            if (st) { st.phase = 'writing'; persistStudent(id); }
            return json(res, 200, { ok: true });
          }

          // ── docente: chiudi (results + report) ──
          if (p === '/api/close') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            closeSession();
            return json(res, 200, { ok: true, phase: session.phase });
          }

          return json(res, 404, { error: 'no-such-api' });
        });
      }
      return json(res, 404, { error: 'no-such-api' });
    }

    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    serveStatic(p, res);
  });

  return {
    listen(port, host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host || '0.0.0.0', () => resolve(server.address().port));
      });
    },
    stop() { return new Promise(r => server.close(r)); },
    state() {
      return {
        session: {
          name: session.name, className: session.className,
          topic: session.topic, mode: session.mode, cap: session.cap,
          token: session.token, adminToken: session.adminToken,
          phase: session.phase, startedAt: session.startedAt
        },
        joined: Object.keys(students).length
      };
    }
  };
}

module.exports = { createTutorServer };
