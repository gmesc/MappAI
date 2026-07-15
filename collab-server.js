'use strict';
/*
 * collab-server.js — server LAN della Lavagna Collaborativa (003)
 * ----------------------------------------------------------------
 * Fratello di garden-server.js (stessi pattern, dominio diverso): server HTTP
 * Node puro avviato dal main process via IPC. Serve la pagina studente sulla
 * rete di classe e riceve i nodi rettangolari dei gruppi, archiviandoli in
 * cartelle locali crash-safe:
 *   <dir>/session.json        — meta sessione + indice gruppi
 *   <dir>/groups/<slug>.json  — un gruppo (nick, colore, nodi) per file
 *   <dir>/board.json          — snapshot unito (riapribile per sempre)
 *
 * Sicurezza (rete di classe): token di sessione nel QR per ogni chiamata;
 * adminToken (mai nel QR) per le operazioni docente; static con allowlist
 * rigida e path traversal rifiutato; body cap 1 MB; input sanitizzati dal
 * core condiviso.
 *
 * Logica pura condivisa col client: public/js/mappai-collab-core.js.
 * Testabile senza Electron: tests/collab-server.test.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CC = require(path.join(__dirname, 'public', 'js', 'mappai-collab-core.js'));
const LC = require(path.join(__dirname, 'public', 'js', 'mappai-live-core.js'));   // US5: EMOJI_SET login individuale

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
// Solo ciò che serve alla pagina studente: MAI main.js, vault, chiavi
const STATIC_ALLOW = [
  '/public/collab/',
  '/public/js/mappai-collab-core.js',
  '/public/js/vendor/'
];
const BODY_CAP = 1024 * 1024;   // 1 MB

function token(n) { return crypto.randomBytes(n).toString('base64url').slice(0, n); }

function createCollabServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;
  const groupsDir = path.join(dir, 'groups');
  fs.mkdirSync(groupsDir, { recursive: true });

  // ── Stato: nuovo o RIPRESA da disco (riavvio a metà lezione = zero perdite) ──
  let session;
  let groups = {};   // slug → { nick, color, deviceId, nodes, rev, updatedAt }
  const roster = Array.isArray(opts.roster) ? opts.roster : [];   // US5: login individuale
  const sessionFile = path.join(dir, 'session.json');
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session = s.session;
    for (const f of fs.readdirSync(groupsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const g = JSON.parse(fs.readFileSync(path.join(groupsDir, f), 'utf8'));
        if (g && g.nick) groups[CC.slugify(g.nick)] = g;
      } catch (e) { console.warn('[collab-server] gruppo illeggibile', f); }
    }
    console.log('[collab-server] sessione RIPRESA:', session.name,
      '·', Object.keys(groups).length, 'gruppi');
  } else {
    session = {
      schema: 'mappai-collab-session@1',
      name: (opts.session && opts.session.name) || 'Lavagna',
      rootLabel: (opts.session && opts.session.rootLabel) || 'Tema centrale',
      activity: 'lavagna',   // 010: per il registro attività
      className: (opts.session && opts.session.className) || '',
      scope: (opts.session && opts.session.scope) || '',
      // Login flessibile (008 US5): 'group' (storico, nickname) o 'individual'
      // (roster emoji+numero). Default = comportamento storico a gruppi.
      loginMode: (opts.session && opts.session.loginMode === 'individual') ? 'individual' : 'group',
      token: token(10),
      adminToken: token(16),
      startedAt: new Date().toISOString()
    };
    persist();
  }

  function persist() {
    fs.writeFileSync(sessionFile, JSON.stringify({
      schema: 'mappai-collab-session@1', session,
      groups: Object.keys(groups)
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify(boardPublic(), null, 2));
  }

  function persistGroup(slug) {
    fs.writeFileSync(path.join(groupsDir, slug + '.json'),
      JSON.stringify(groups[slug], null, 2));
  }

  function boardPublic() {
    return {
      schema: 'mappai-collab-board@1',
      name: session.name,
      rootLabel: session.rootLabel,
      groups: Object.keys(groups).map(k => {
        const g = groups[k];
        return {
          nick: g.nick, color: g.color, nodes: g.nodes, links: g.links || [],
          done: !!g.done, rev: g.rev, updatedAt: g.updatedAt
        };
      })
    };
  }

  function json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }

  function readBody(req, cb) {
    let size = 0; const chunks = [];
    req.on('data', d => {
      size += d.length;
      if (size > BODY_CAP) { req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { cb(e); }
    });
    req.on('error', e => cb(e));
  }

  function serveStatic(urlPath, res) {
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
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;

    if (p === '/') {
      res.writeHead(302, { Location: '/public/collab/student.html?s=' + session.token });
      res.end();
      return;
    }

    if (p.startsWith('/api/')) {
      const isAdmin = (t) => t && t === session.adminToken;
      const okToken = (t) => t === session.token || isAdmin(t);

      if (p === '/api/session' && req.method === 'GET') {
        if (!okToken(u.searchParams.get('s'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          schema: 'mappai-collab-session@1',
          session: { name: session.name, rootLabel: session.rootLabel, startedAt: session.startedAt },
          palette: CC.PALETTE, sizes: CC.SIZES, limits: CC.LIMITS,
          loginMode: session.loginMode, emojiSet: session.loginMode === 'individual' ? LC.EMOJI_SET : undefined
        });
      }

      if (p === '/api/board' && req.method === 'GET') {
        if (!okToken(u.searchParams.get('s'))) return json(res, 403, { error: 'token' });
        return json(res, 200, boardPublic());
      }

      if (p === '/api/status' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          session: { name: session.name, rootLabel: session.rootLabel, startedAt: session.startedAt },
          groups: Object.keys(groups).map(k => {
            const g = groups[k];
            return { nick: g.nick, color: g.color, nodeCount: (g.nodes || []).length, linkCount: (g.links || []).length, done: !!g.done, rev: g.rev, updatedAt: g.updatedAt };
          }),
          board: boardPublic()
        });
      }

      if (req.method === 'POST') {
        return readBody(req, (err, body) => {
          if (err) return json(res, 400, { error: 'bad-json' });

          if (p === '/api/join') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            if (!body.deviceId || typeof body.deviceId !== 'string') return json(res, 400, { error: 'bad-device' });
            let nick;
            if (session.loginMode === 'individual') {
              // US5: identità dal roster (emoji + numero). nick = nome allievo o "volpe-03".
              const rEntry = roster.find(r => r.emojiKey === body.emojiKey && String(r.num) === String(body.num));
              if (!rEntry) return json(res, 401, { error: 'not-in-roster' });
              nick = (rEntry.name && String(rEntry.name).trim()) ? String(rEntry.name).trim() : (body.emojiKey + '-' + body.num);
            } else {
              nick = CC.sanitizeNick(body.nick);
              if (!nick) return json(res, 400, { error: 'bad-nick' });
            }
            const slug = CC.slugify(nick);
            const existing = groups[slug];
            if (existing && existing.deviceId && existing.deviceId !== body.deviceId) {
              return json(res, 409, { error: 'nick-taken' });   // stesso nick, ALTRO device
            }
            if (existing && !existing.deviceId) {
              // gruppo rilasciato dal docente: il nuovo device lo adotta
              existing.deviceId = body.deviceId;
              persistGroup(slug);
              persist();
            }
            if (!existing) {
              groups[slug] = {
                nick, deviceId: body.deviceId,
                color: CC.groupColor(Object.keys(groups).length),
                nodes: [], rev: 0, updatedAt: new Date().toISOString()
              };
              persistGroup(slug);
              persist();
            }
            const g = groups[slug];
            return json(res, 200, { ok: true, nick: g.nick, color: g.color, nodes: g.nodes });
          }

          if (p === '/api/nodes') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const slug = CC.slugify(CC.sanitizeNick(body.nick) || '');
            const g = groups[slug];
            if (!g) return json(res, 404, { error: 'no-such-group' });
            if (g.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-group' });
            const r = CC.mergeGroupNodes(g.nodes, body.nodes);
            if (!r.accepted && r.rejected.length && !Array.isArray(body.links) && body.done === undefined) {
              return json(res, 422, { error: 'all-invalid', rejected: r.rejected });
            }
            g.nodes = r.nodes;
            // collegamenti con keyword: merge con le estremità sui nodi correnti
            const nodeIds = g.nodes.map(n => n.id);
            const rl = CC.mergeGroupLinks(g.links || [], body.links, nodeIds);
            g.links = rl.links;
            // "Fatto": il gruppo dichiara chiusa la costruzione (sblocca la vista classe)
            if (body.done === true) g.done = true;
            g.rev = (g.rev || 0) + 1;
            g.updatedAt = new Date().toISOString();
            persistGroup(slug);
            persist();
            return json(res, 200, {
              ok: true, accepted: r.accepted, rejected: r.rejected,
              linksAccepted: rl.accepted, linksRejected: rl.rejected,
              done: !!g.done, rev: g.rev
            });
          }

          if (p === '/api/release') {
            if (!(body.adminToken && body.adminToken === session.adminToken)) return json(res, 403, { error: 'token' });
            const slug = CC.slugify(body.nick || '');
            if (groups[slug]) {
              // sgancia il device (il gruppo e i suoi nodi restano): un altro
              // dispositivo può riprendere il nickname
              groups[slug].deviceId = null;
              persistGroup(slug);
              persist();
            }
            return json(res, 200, { ok: true });
          }

          if (p === '/api/reopen') {
            // Docente "sblocca" un gruppo che ha consegnato: azzera done → torna
            // "in corso". Non tocca nodes/links/deviceId; lo studente continua a
            // inviare contributi. Gemello di /api/release (stesso gate admin).
            if (!(body.adminToken && body.adminToken === session.adminToken)) return json(res, 403, { error: 'token' });
            const slug = CC.slugify(body.nick || '');
            if (groups[slug]) {
              groups[slug].done = false;
              persistGroup(slug);
              persist();
            }
            return json(res, 200, { ok: true, done: false });
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
          name: session.name, rootLabel: session.rootLabel,
          token: session.token, adminToken: session.adminToken,
          startedAt: session.startedAt
        },
        groups: Object.keys(groups).map(k => ({
          nick: groups[k].nick, color: groups[k].color,
          nodeCount: (groups[k].nodes || []).length
        }))
      };
    }
  };
}

module.exports = { createCollabServer };
