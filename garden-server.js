'use strict';
/*
 * garden-server.js — server LAN del Knowledge Garden (Fase 4)
 * -----------------------------------------------------------
 * Piccolo server HTTP (Node built-in, zero dipendenze) avviato dallo Studio
 * docente via IPC (main.js). Serve garden.html + asset agli studenti sulla
 * rete di classe e riceve claim/consegne, archiviandole in cartelle locali:
 *   <dir>/session.json   — meta sessione + claims (crash-safe)
 *   <dir>/template.json  — template del giardino (con plots)
 *   <dir>/plots/pNN.json — una consegna per parcella
 *   <dir>/merged.json    — giardino unito (map JSON standard, riapribile)
 *
 * Sicurezza (rete di classe): token di sessione nel QR per ogni chiamata;
 * adminToken (mai nel QR) per le operazioni docente; static con allowlist
 * rigida e path traversal rifiutato; body cap 1 MB.
 *
 * Logica pura condivisa col client: public/js/mappai-garden-core.js.
 * Testabile senza Electron: tests/garden-server.test.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const GC = require(path.join(__dirname, 'public', 'js', 'mappai-garden-core.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',   // ES module: MIME corretto obbligatorio
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
// Solo ciò che serve a giardino ed editor studente: MAI main.js, vault, chiavi
const STATIC_ALLOW = [
  '/tools/voxel-proto/',
  '/public/js/vendor/',
  '/public/assets/',
  '/public/js/mappai-garden-core.js',
  '/public/js/mappai-dungeon-core.js'   // richiesto da editor.html (validatore)
];
const BODY_CAP = 1024 * 1024;   // 1 MB

function token(n) { return crypto.randomBytes(n).toString('base64url').slice(0, n); }

function createGardenServer(opts) {
  const repoRoot = opts.repoRoot;
  const dir = opts.dir;                      // cartella sessione su disco
  const plotsDir = path.join(dir, 'plots');
  fs.mkdirSync(plotsDir, { recursive: true });

  // ── Stato: nuovo o RIPRESA da disco (riavvio a metà lezione = zero perdite) ──
  let session, template, libs, plots, claims, submissions;
  const sessionFile = path.join(dir, 'session.json');
  if (fs.existsSync(sessionFile) && !opts.fresh) {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    session = s.session;
    claims = s.claims || [];
    template = JSON.parse(fs.readFileSync(path.join(dir, 'template.json'), 'utf8'));
    libs = template._libs || {};
    plots = template.plots || [];
    submissions = {};
    for (const f of fs.readdirSync(plotsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const sub = JSON.parse(fs.readFileSync(path.join(plotsDir, f), 'utf8'));
        if (sub && sub.plotId) submissions[sub.plotId] = sub;
      } catch (e) { console.warn('[garden-server] consegna illeggibile', f); }
    }
    console.log('[garden-server] sessione RIPRESA:', session.name,
      '·', claims.length, 'claim ·', Object.keys(submissions).length, 'consegne');
  } else {
    session = {
      schema: 'mappai-garden-session@1',
      name: opts.session.name || 'Knowledge Garden',
      plotSize: opts.session.plotSize || 15,
      token: token(10),
      adminToken: token(16),
      startedAt: new Date().toISOString()
    };
    template = JSON.parse(JSON.stringify(opts.template || {}));
    libs = opts.libs || {};
    // parcelle: disegnate dal docente (pennello 🌱) oppure griglia fallback
    plots = (template.plots && template.plots.length)
      ? template.plots
      : GC.computePlotGrid(template.size || 0, session.plotSize)
        .map(p => ({ id: p.id, cells: p.cells.filter(([x, z]) => (template.cells || []).some(c => c.x === x && c.z === z && c.biome === 'floor')) }))
        .filter(p => p.cells.length);
    template.plots = plots;
    template._libs = libs;   // le librerie viaggiano col template (localStorage studente = vuoto)
    claims = [];
    submissions = {};
    fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify(template));
    persist();
  }

  function persist() {
    fs.writeFileSync(sessionFile, JSON.stringify({
      schema: 'mappai-garden-session@1', session, claims,
      submitted: Object.keys(submissions)
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'merged.json'),
      JSON.stringify(GC.mergeGarden(template, Object.values(submissions), plots)));
  }

  function plotsPublic() {
    return plots.map(p => {
      const sub = submissions[p.id];
      const claim = claims.find(c => c.plotId === p.id);
      return {
        id: p.id, cells: p.cells,
        status: sub ? 'submitted' : (claim ? 'claimed' : 'free'),
        owner: sub ? (sub.concept && sub.concept.author) : (claim ? claim.owner : null),
        concept: sub ? sub.concept : null
      };
    });
  }

  function json(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
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
      // gli HTML si rivalidano sempre (i .js hanno il ?v= anti-cache): niente
      // studenti con pagine stantie dopo un aggiornamento dell'app
      if (ext === '.html') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;

    if (p === '/') {
      res.writeHead(302, { Location: '/tools/voxel-proto/garden.html?s=' + session.token });
      res.end();
      return;
    }

    if (p.startsWith('/api/')) {
      const isAdmin = (t) => t && t === session.adminToken;
      if (p === '/api/session' && req.method === 'GET') {
        const t = u.searchParams.get('s');
        if (t !== session.token && !isAdmin(t)) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          schema: 'mappai-garden-session@1',
          session: { name: session.name, plotSize: session.plotSize, startedAt: session.startedAt },
          template: GC.mergeGarden(template, Object.values(submissions), plots),
          libs,
          plots: plotsPublic()
        });
      }
      if (p === '/api/status' && req.method === 'GET') {
        if (!isAdmin(u.searchParams.get('admin'))) return json(res, 403, { error: 'token' });
        return json(res, 200, {
          claims,
          submissions: Object.values(submissions).map(s => ({
            plotId: s.plotId, concept: s.concept, at: s.at
          }))
        });
      }
      if (req.method === 'POST') {
        return readBody(req, (err, body) => {
          if (err) return json(res, 400, { error: 'bad-json' });
          if (p === '/api/claim') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const r = GC.applyClaim(claims, {
              plotId: body.plotId, deviceId: body.deviceId,
              owner: body.owner && body.owner.name, at: Date.now()
            }, { plotIds: plots.map(p => p.id) });
            if (!r.ok) return json(res, r.reason === 'taken' ? 409 : 400, { error: r.reason, by: r.by });
            claims = r.claims;
            persist();
            return json(res, 200, { ok: true, plotId: body.plotId, released: r.released });
          }
          if (p === '/api/plot') {
            if (body.token !== session.token) return json(res, 403, { error: 'token' });
            const plot = plots.find(p => p.id === body.plotId);
            if (!plot) return json(res, 404, { error: 'no-such-plot' });
            const claim = claims.find(c => c.plotId === body.plotId);
            if (!claim || claim.deviceId !== body.deviceId) return json(res, 403, { error: 'not-your-plot' });
            const payload = { plotId: body.plotId, concept: body.concept, cells: body.cells, props: body.props, libs: body.libs };
            // matNames: sessione ∪ librerie custom della consegna (namespaced pNN.*);
            // niente check assetNames: i cubi dei prop viaggiano embedded, il nome è un'etichetta
            const customMats = (body.libs && body.libs.materials) || {};
            const v = GC.validateSubmission(plot, payload, {
              matNames: Object.keys(libs.materials || {}).concat(Object.keys(customMats))
            });
            if (!v.ok) return json(res, 422, { errors: v.errors });
            // merge librerie custom nella sessione (stessi nomi = riconsegna → overwrite)
            if (body.libs) {
              libs.textures = Object.assign(libs.textures || {}, body.libs.textures || {});
              libs.materials = Object.assign(libs.materials || {}, body.libs.materials || {});
              template._libs = libs;
              fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify(template));
            }
            submissions[body.plotId] = Object.assign({ at: new Date().toISOString(), owner: claim.owner }, payload);
            fs.writeFileSync(path.join(plotsDir, body.plotId + '.json'), JSON.stringify(submissions[body.plotId], null, 2));
            persist();
            return json(res, 200, { ok: true });
          }
          if (p === '/api/release') {
            if (!isAdmin(body.adminToken)) return json(res, 403, { error: 'token' });
            claims = claims.filter(c => c.plotId !== body.plotId);
            persist();
            return json(res, 200, { ok: true });
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
        session: { name: session.name, token: session.token, adminToken: session.adminToken, startedAt: session.startedAt },
        plots: plotsPublic(),
        claims: claims.slice(),
        submitted: Object.keys(submissions)
      };
    }
  };
}

module.exports = { createGardenServer };
