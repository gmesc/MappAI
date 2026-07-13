'use strict';
/*
 * live-server.js — server LAN di MappAI Live (Studio attivo + Materiali)
 * ----------------------------------------------------------------------
 * Fratello di garden-server.js / collab-server.js (stessi pattern): server
 * HTTP Node puro avviato dal main process via IPC. Serve la pagina studente
 * sulla rete di classe, raccoglie le risposte al quiz e le archivia in cartelle
 * locali crash-safe. A chiusura genera i due report (heatmap domande + schede).
 *
 *   <dir>/session.json              — meta sessione + roster + fase
 *   <dir>/questions.json            — set COMPLETO con soluzioni (mai servito)
 *   <dir>/students/<id>.json        — risposte di un allievo (scritte a ogni POST)
 *   <dir>/results.json              — modello dati graduato (a chiusura)
 *   <dir>/report-domande.html       — Report A
 *   <dir>/report-studenti.html      — Report B
 *
 * Sicurezza (rete di classe): token di sessione nel QR per gli studenti;
 * adminToken (mai nel QR) per le operazioni docente; static con allowlist
 * rigida e path traversal rifiutato; body cap 1 MB; input sanitizzati dal core.
 *
 * Logica pura condivisa: public/js/mappai-live-core.js + mappai-live-reports.js.
 * Testabile senza Electron: tests/live-server.test.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LC = require(path.join(__dirname, 'public', 'js', 'mappai-live-core.js'));
const LR = require(path.join(__dirname, 'public', 'js', 'mappai-live-reports.js'));
const TC = require(path.join(__dirname, 'public', 'js', 'mappai-timeline-core.js'));   // Timeline Live (008)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};
const STATIC_ALLOW = [
  '/public/live/',
  '/public/js/mappai-live-core.js',
  '/public/js/vendor/'
];
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

// ═══════════════════════════ SERVER QUIZ ═══════════════════════════════════
function createLiveServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const studentsDir = path.join(dir, 'students');
  fs.mkdirSync(studentsDir, { recursive: true });
  const serveStatic = makeServeStatic(repoRoot);

  const sessionFile = path.join(dir, 'session.json');
  const questionsFile = path.join(dir, 'questions.json');

  let session;
  let roster = [];              // [{emojiKey,emoji,num,name}]
  let questions = [];           // set COMPLETO con soluzioni
  let students = {};            // identityKey → { emojiKey,num,name,deviceId,joinedAt,finishedAt,answers }
  let closeTimer = null;

  // ── Stato: nuovo o RIPRESA da disco (riavvio a metà lezione = zero perdite) ──
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session = s.session;
    roster = s.roster || [];
    try { questions = JSON.parse(fs.readFileSync(questionsFile, 'utf8')); } catch (e) { questions = []; }
    for (const f of fs.readdirSync(studentsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const st = JSON.parse(fs.readFileSync(path.join(studentsDir, f), 'utf8'));
        if (st && st.emojiKey) students[LC.identityKey(st.emojiKey, st.num)] = st;
      } catch (e) { console.warn('[live-server] studente illeggibile', f); }
    }
    console.log('[live-server] sessione RIPRESA:', session.name, '·', Object.keys(students).length, 'allievi · fase', session.phase);
  } else {
    const cfg = opts.session || {};
    session = {
      schema: 'mappai-live-session@1',
      name: cfg.name || 'Quiz',
      activity: cfg.activity || 'Quiz',
      className: cfg.className || '',
      durationMin: Number(cfg.durationMin) || 0,
      // Timeline Live (008): modalità attività, schema di login, indizi.
      // Default = comportamento storico (quiz / login individuale / indizi su richiesta).
      mode: cfg.mode === 'build' ? 'build' : 'quiz',
      loginMode: cfg.loginMode === 'group' ? 'group' : 'individual',
      hintMode: (['always', 'onrequest', 'never'].indexOf(cfg.hintMode) >= 0) ? cfg.hintMode : 'onrequest',
      build: (cfg.mode === 'build' && cfg.build) ? {
        gaps: Array.isArray(cfg.build.gaps) ? cfg.build.gaps : [],
        freeAllowed: cfg.build.freeAllowed !== false,
        maxProposals: Number(cfg.build.maxProposals) > 0 ? Number(cfg.build.maxProposals) : 3,
        sourceYears: Array.isArray(cfg.build.sourceYears) ? cfg.build.sourceYears : [],
        poolKeys: Array.isArray(cfg.build.poolKeys) ? cfg.build.poolKeys : []   // dedup lato server
      } : null,
      token: token(10),
      adminToken: token(16),
      phase: 'lobby',            // lobby → running → closed
      startedAt: new Date().toISOString(),
      runningAt: null, endsAt: null, closedAt: null
    };
    roster = Array.isArray(opts.roster) ? opts.roster : [];
    // valida/normalizza le domande in ingresso; assegna idx stabile
    questions = (Array.isArray(opts.questions) ? opts.questions : []).map((q, i) => {
      const v = LC.validateQuestion(q);
      const base = v.ok ? v.clean : q;
      return Object.assign({}, base, { idx: i });
    });
    fs.writeFileSync(questionsFile, JSON.stringify(questions, null, 2));
    persist();
  }

  function persist() {
    fs.writeFileSync(sessionFile, JSON.stringify({
      schema: 'mappai-live-session@1', session, roster,
      questionCount: questions.length,
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

  // Timeline Live (008): identità dello studente secondo lo schema di login.
  // Individuale → emoji+numero (roster); a gruppi → slug del nickname.
  function pid(body) {
    return session.loginMode === 'group'
      ? LC.slugify(String(body.nick || ''))
      : LC.identityKey(body.emojiKey, body.num);
  }
  // Tutte le proposte (modalità Costruisci), con autore.
  function allProposals() {
    const out = [];
    Object.keys(students).forEach(id => {
      (students[id].proposals || []).forEach(pr => out.push(Object.assign({ author: id }, pr)));
    });
    return out;
  }

  // guardia lazy: se il timer è scaduto (o è stato perso), chiudi ora
  function checkExpiry() {
    if (session.phase === 'running' && session.endsAt && Date.now() >= new Date(session.endsAt).getTime()) {
      closeSession();
    }
  }

  function armTimer() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (session.phase !== 'running' || !session.endsAt) return;
    const ms = new Date(session.endsAt).getTime() - Date.now();
    if (ms <= 0) { closeSession(); return; }
    closeTimer = setTimeout(closeSession, ms);
    if (closeTimer.unref) closeTimer.unref();   // non tiene vivo il processo nei test
  }

  function meta() {
    let dur = '';
    if (session.runningAt && session.closedAt) {
      const mins = Math.round((new Date(session.closedAt) - new Date(session.runningAt)) / 60000);
      dur = 'Durata ' + mins + ' min';
    } else if (session.durationMin) dur = 'Timer ' + session.durationMin + ' min';
    const d = new Date(session.startedAt);
    function p(n) { return String(n).padStart(2, '0'); }
    return {
      mapTitle: session.name, activity: session.activity, className: session.className,
      dateStr: p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(),
      durationStr: dur
    };
  }

  function closeSession() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (session.phase === 'closed') return;   // idempotente
    session.phase = 'closed';
    session.closedAt = new Date().toISOString();
    if (session.mode === 'build') {
      // Timeline Costruisci: report proposte per allievo + timeline finale.
      const proposals = allProposals();
      const byAuthor = {};
      Object.keys(students).forEach(id => {
        const st = students[id];
        byAuthor[id] = {
          displayName: LC.displayName(st) || id,
          proposals: (st.proposals || []).slice()
        };
      });
      const approved = proposals.filter(p => p.status === 'approved');
      const results = {
        mode: 'build', joined: Object.keys(students).length,
        proposals, byAuthor, approved,
        counts: {
          total: proposals.length,
          approved: approved.length,
          rejected: proposals.filter(p => p.status === 'rejected').length,
          pending: proposals.filter(p => p.status === 'pending').length
        }
      };
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(dir, 'report-costruzione.html'), LR.buildTimelineWorkshopReportHtml(meta(), results));
    } else {
      const results = LC.computeResults(questions, Object.values(students), roster);
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(dir, 'report-domande.html'), LR.buildQuestionsReportHtml(meta(), results));
      fs.writeFileSync(path.join(dir, 'report-studenti.html'), LR.buildStudentsReportHtml(meta(), results));
    }
    persist();
    console.log('[live-server] sessione CHIUSA:', session.name, '· report generati');
  }

  // riprendi il timer dopo una RIPRESA da disco
  armTimer();

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    checkExpiry();

    if (p === '/') {
      res.writeHead(302, { Location: '/public/live/student.html?s=' + session.token });
      res.end(); return;
    }

    if (p.startsWith('/api/')) {
      const isAdmin = (t) => t && t === session.adminToken;
      const okToken = (t) => t === session.token || isAdmin(t);

      if (p === '/api/session' && req.method === 'GET') {
        if (!okToken(u.searchParams.get('s'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          schema: 'mappai-live-session@1',
          name: session.name, activity: session.activity, className: session.className,
          phase: session.phase, questionCount: questions.length,
          endsAt: session.endsAt, emojiSet: LC.EMOJI_SET,
          // Timeline Live (008): mode/login/hint per il player; build SENZA sourceYears
          // (mai esposti: servono solo al server per il flag yearNotInSources).
          mode: session.mode, loginMode: session.loginMode, hintMode: session.hintMode,
          build: session.build ? {
            gaps: session.build.gaps, freeAllowed: session.build.freeAllowed,
            maxProposals: session.build.maxProposals
          } : null
        });
      }

      if (p === '/api/status' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) return json(res, 403, { error: 'token' });
        const now = Date.now();
        return json(res, 200, {
          session: {
            name: session.name, activity: session.activity, className: session.className,
            phase: session.phase, startedAt: session.startedAt, endsAt: session.endsAt,
            durationMin: session.durationMin
          },
          msLeft: session.endsAt ? Math.max(0, new Date(session.endsAt).getTime() - now) : null,
          roster: roster.map(r => {
            const st = students[LC.identityKey(r.emojiKey, r.num)];
            const answered = st ? Object.keys(st.answers || {}).length : 0;
            return {
              emojiKey: r.emojiKey, emoji: (LC.emojiByKey(r.emojiKey) || {}).emoji || '?',
              num: r.num, name: r.name || '',
              joined: !!(st && st.deviceId), answered,
              finished: !!(st && st.finishedAt), present: !!st
            };
          }),
          joined: Object.keys(students).length,
          // Timeline Costruisci: proposte per la dashboard di revisione + proiezione LIM
          proposals: session.mode === 'build' ? allProposals() : undefined
        });
      }

      if (p === '/api/report' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) { res.writeHead(403); res.end('forbidden'); return; }
        const w = u.searchParams.get('which');
        const which = w === 'students' ? 'report-studenti.html'
          : w === 'workshop' ? 'report-costruzione.html'
          : 'report-domande.html';
        const f = path.join(dir, which);
        if (!fs.existsSync(f)) { res.writeHead(404); res.end('report non ancora generato'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(f)); return;
      }

      if (req.method === 'POST') {
        return readBody(req, (err, body) => {
          if (err) return json(res, 400, { error: 'bad-json' });

          // ── studente: entra nella sessione ──
          if (p === '/api/join') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const rEntry = rosterEntry(body.emojiKey, body.num);
            if (!rEntry) return json(res, 404, { error: 'not-in-roster' });
            if (!body.deviceId || typeof body.deviceId !== 'string') return json(res, 400, { error: 'bad-device' });
            const id = LC.identityKey(body.emojiKey, body.num);
            let st = students[id];
            if (st && st.deviceId && st.deviceId !== body.deviceId) {
              return json(res, 409, { error: 'identity-taken' });   // stessa identità, ALTRO device
            }
            if (!st) {
              st = students[id] = {
                emojiKey: rEntry.emojiKey, num: rEntry.num, name: rEntry.name || '',
                deviceId: body.deviceId, joinedAt: new Date().toISOString(),
                finishedAt: null, answers: {}
              };
            } else {
              st.deviceId = body.deviceId;   // adozione dopo release, o rientro stesso device
            }
            persistStudent(id); persist();
            return json(res, 200, {
              ok: true, displayName: LC.displayName(st), phase: session.phase,
              questions: LC.publicQuestions(questions), answers: st.answers || {},
              proposals: st.proposals || []   // Timeline Costruisci: ripresa proposte
            });
          }

          // ── studente (Costruisci): invia una proposta di data ──
          if (p === '/api/propose') {
            if (session.mode !== 'build') return json(res, 404, { error: 'not-build' });
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = pid(body);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const v = TC.validateProposal(body);
            if (!v.ok) return json(res, 422, { error: 'bad-proposal', details: v.errors });
            st.proposals = st.proposals || [];
            if (TC.countActive(st.proposals, id) >= (session.build ? session.build.maxProposals : 3)) {
              return json(res, 429, { error: 'proposal-cap' });
            }
            const bld = session.build || {};
            const flags = {};
            const key = TC.eventKey(v.clean);
            const dupPool = (bld.poolKeys || []).indexOf(key) >= 0;
            const dupProp = allProposals().some(pr => pr.status !== 'rejected' && TC.eventKey(pr) === key);
            if (dupPool || dupProp) flags.duplicate = true;
            if (Array.isArray(bld.sourceYears) && bld.sourceYears.indexOf(v.clean.anno) < 0) flags.yearNotInSources = true;
            const proposal = {
              id: 'pr_' + token(8), author: id, anno: v.clean.anno, evento: v.clean.evento,
              contesto: v.clean.contesto, gapYear: v.clean.gapYear,
              status: 'pending', flags: flags, ts: Date.now()
            };
            st.proposals.push(proposal);
            persistStudent(id);
            return json(res, 200, { ok: true, proposal: proposal });
          }

          // ── docente (Costruisci): approva/boccia una proposta ──
          if (p === '/api/review') {
            if (session.mode !== 'build') return json(res, 404, { error: 'not-build' });
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            const action = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : null;
            if (!action) return json(res, 400, { error: 'bad-action' });
            let found = null, ownerId = null;
            Object.keys(students).forEach(sid => {
              (students[sid].proposals || []).forEach(pr => { if (pr.id === body.proposalId) { found = pr; ownerId = sid; } });
            });
            if (!found) return json(res, 404, { error: 'no-proposal' });
            if (found.status !== 'pending' && found.status !== action) return json(res, 409, { error: 'already-reviewed' });
            found.status = action;
            persistStudent(ownerId);
            return json(res, 200, { ok: true, proposal: Object.assign({ author: ownerId }, found) });
          }

          // ── studente: salva una risposta (autosave, sovrascrivibile) ──
          if (p === '/api/answer') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = LC.identityKey(body.emojiKey, body.num);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            if (session.phase === 'lobby') return json(res, 409, { error: 'not-running' });
            if (session.phase === 'closed') return json(res, 409, { error: 'closed' });
            const qIdx = Number(body.qIdx);
            const q = questions.find(x => x.idx === qIdx);
            if (!q) return json(res, 400, { error: 'bad-question' });
            const a = LC.cleanAnswer(q, body);
            if (!a) return json(res, 400, { error: 'bad-answer' });
            a.updatedAt = Date.now();
            st.answers = st.answers || {};
            st.answers[qIdx] = a;              // Indietro = sovrascrittura
            st.finishedAt = null;              // ha ripreso a rispondere
            persistStudent(id);
            return json(res, 200, { ok: true, saved: qIdx, answered: Object.keys(st.answers).length });
          }

          // ── studente: consegna (può ancora riaprire fino a chiusura) ──
          if (p === '/api/finish') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const id = LC.identityKey(body.emojiKey, body.num);
            const st = students[id];
            if (!st) return json(res, 404, { error: 'not-joined' });
            if (st.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-identity' });
            st.finishedAt = new Date().toISOString();
            persistStudent(id);
            return json(res, 200, { ok: true });
          }

          // ── docente: cambia fase (avvia le domande) ──
          if (p === '/api/phase') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            if (body.phase === 'running' && session.phase === 'lobby') {
              session.phase = 'running';
              session.runningAt = new Date().toISOString();
              if (session.durationMin > 0) session.endsAt = new Date(Date.now() + session.durationMin * 60000).toISOString();
              persist(); armTimer();
              return json(res, 200, { ok: true, phase: session.phase, endsAt: session.endsAt });
            }
            return json(res, 400, { error: 'bad-phase' });
          }

          // ── docente: sblocca un'identità (device staccato) ──
          if (p === '/api/release') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            const id = LC.identityKey(body.emojiKey, body.num);
            if (students[id]) { students[id].deviceId = null; persistStudent(id); persist(); }
            return json(res, 200, { ok: true });
          }

          // ── docente: chiudi la sessione (genera i report) ──
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
    stop() { if (closeTimer) clearTimeout(closeTimer); return new Promise(r => server.close(r)); },
    closeSession,   // esposto per test/uso diretto
    state() {
      return {
        session: {
          name: session.name, activity: session.activity, className: session.className,
          token: session.token, adminToken: session.adminToken,
          phase: session.phase, startedAt: session.startedAt, endsAt: session.endsAt
        },
        questionCount: questions.length,
        joined: Object.keys(students).length,
        roster: roster.length
      };
    }
  };
}

// ═══════════════════════════ SERVER MATERIALI ══════════════════════════════
// Nessun login: il token nel QR è l'unico gate. Serve solo i file in <dir>/materials.
function createMaterialsServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const filesDir = path.join(dir, 'materials');
  fs.mkdirSync(filesDir, { recursive: true });
  const serveStatic = makeServeStatic(repoRoot);
  const sessionFile = path.join(dir, 'session.json');

  let session;
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    session = JSON.parse(fs.readFileSync(sessionFile, 'utf8')).session;
  } else {
    session = {
      schema: 'mappai-live-materials@1',
      name: (opts.session && opts.session.name) || 'Materiali',
      token: token(10), adminToken: token(16),
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(sessionFile, JSON.stringify({ schema: 'mappai-live-materials@1', session }, null, 2));
  }

  function listFiles() {
    return fs.readdirSync(filesDir).filter(f => !f.startsWith('.')).map(f => {
      const st = fs.statSync(path.join(filesDir, f));
      return { file: f, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;

    if (p === '/') {
      res.writeHead(302, { Location: '/public/live/materials.html?s=' + session.token });
      res.end(); return;
    }

    if (p === '/api/materials' && req.method === 'GET') {
      if (u.searchParams.get('s') !== session.token && u.searchParams.get('s') !== session.adminToken) {
        return json(res, 403, { error: 'token' });
      }
      return json(res, 200, { name: session.name, files: listFiles() });
    }

    // download: solo basename dentro filesDir (traversal impossibile per costruzione)
    if (p.startsWith('/files/') && req.method === 'GET') {
      if (u.searchParams.get('s') !== session.token && u.searchParams.get('s') !== session.adminToken) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const name = path.basename(decodeURIComponent(p.slice('/files/'.length)));
      const file = path.join(filesDir, name);
      if (!file.startsWith(filesDir) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      // ?inline=1 → anteprima nel browser (pagina file.html); default = download
      const inline = u.searchParams.get('inline') === '1';
      if (ext !== '.html' && !inline) headers['Content-Disposition'] = 'attachment; filename="' + name.replace(/"/g, '') + '"';
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file)); return;
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
    filesDir,
    state() {
      return { session: { name: session.name, token: session.token, adminToken: session.adminToken, startedAt: session.startedAt }, files: listFiles() };
    }
  };
}

module.exports = { createLiveServer, createMaterialsServer };
