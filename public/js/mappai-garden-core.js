/*
 * mappai-garden-core.js — logica PURA del Knowledge Garden (testabile in Node)
 * ---------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/three.js: solo funzioni deterministiche
 * condivise tra client (garden.js, editor.js) e server (garden-server.js).
 *
 * Modello parcella = MASCHERA di celle (anche non rettangolare, dal pennello
 * 🌱 dell'editor): { id: 'p01', cells: [[x,z], ...] }.
 * Nel map JSON le parcelle vivono nel campo top-level `plots: [...]`
 * (ignorato da proto.js → retro-compatibile).
 *
 *  - inPlot / plotContains / plotIndex → membership nella maschera
 *  - plotsFromCells / validatePlots    → parcelle dal template editor + sanità
 *  - computePlotGrid                   → FALLBACK griglia automatica (template senza parcelle)
 *  - plotPerimeter                     → segmenti bordo per il rendering
 *  - validateTarghetta                 → targhetta OBBLIGATORIA (nome+concetto+testo)
 *  - validateSubmission                → consegna parcella (bounds, muri ≤10, cap)
 *  - applyClaim                        → rivendica parcella, first-come, 1 per device
 *  - mergeGarden                       → template + consegne → map JSON standard
 *  - wallVisibility                    → cutaway "una faccia" (muri ghost visti da dietro)
 *
 * Modulo UMD (pattern di mappai-dungeon-core.js): module.exports per
 * `node --test`, window.MappAIGardenCore per il browser.
 */
(function () {
  'use strict';

  // ── Limiti condivisi client+server ─────────────────────────────────────────
  var LIMITS = {
    plotMinArea: 25,        // sotto → warning (parcella troppo piccola per costruire)
    minWallAlt: 1,
    maxWallAlt: 10,         // decisione utente: muri fino ad altezza 10
    quotaMin: -2,
    quotaMax: 2,
    maxProps: 60,           // asset per parcella
    maxChars: 400 * 1024,   // cap dimensione consegna (JSON.stringify().length)
    titleLen: [2, 60],
    textLen: [10, 400],
    authorLen: [2, 40],
    mapSizeMax: 64,         // cap del proto (loadExternalMap)
    maxLibTex: 24,          // texture custom per consegna
    maxLibMat: 24,          // materiali custom per consegna
    maxTexChars: 64 * 1024  // cap dataURL di una singola texture custom
  };

  var VALID_BIOMES = { floor: 1, water: 1, wall: 1 }; // niente void nelle consegne

  function _k(x, z) { return x + ',' + z; }

  function slugify(name) {
    var s = String(name || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accenti via
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'sessione';
  }

  // ── Membership nella maschera ───────────────────────────────────────────────
  function _maskSet(plot) {
    var s = new Set();
    var cells = (plot && plot.cells) || [];
    for (var i = 0; i < cells.length; i++) s.add(_k(cells[i][0], cells[i][1]));
    return s;
  }

  function inPlot(plot, x, z) {
    var cells = (plot && plot.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] === x && cells[i][1] === z) return true;
    }
    return false;
  }

  function plotContains(plot, cells) {
    var mask = _maskSet(plot);
    for (var i = 0; i < (cells || []).length; i++) {
      var c = cells[i];
      var x = Array.isArray(c) ? c[0] : c.x;
      var z = Array.isArray(c) ? c[1] : c.z;
      if (!mask.has(_k(x, z))) return false;
    }
    return true;
  }

  // Indice per i path caldi (guard di pittura per-tratto): 'x,z' → plotId
  function plotIndex(plots) {
    var byCell = new Map(), byId = {};
    for (var i = 0; i < (plots || []).length; i++) {
      var p = plots[i];
      byId[p.id] = _maskSet(p);
      var cells = p.cells || [];
      for (var j = 0; j < cells.length; j++) byCell.set(_k(cells[j][0], cells[j][1]), p.id);
    }
    return { byCell: byCell, byId: byId };
  }

  // ── Parcelle dal template (editor esporta celle con campo `plot`) ──────────
  function plotsFromCells(cells) {
    var acc = {};
    for (var i = 0; i < (cells || []).length; i++) {
      var c = cells[i];
      if (!c || !c.plot) continue;
      if (!acc[c.plot]) acc[c.plot] = [];
      acc[c.plot].push([c.x, c.z]);
    }
    var ids = Object.keys(acc).sort();
    return ids.map(function (id) {
      var arr = acc[id].slice().sort(function (a, b) { return (a[1] - b[1]) || (a[0] - b[0]); });
      return { id: id, cells: arr };
    });
  }

  // Sanità delle parcelle sul template: sovrapposizioni, celle valide, area.
  // map = { size, cells: [{x,z,biome,...}] } (contratto mapJSON dell'editor).
  function validatePlots(plots, map) {
    var errors = [], warnings = [];
    if (!Array.isArray(plots) || !plots.length) {
      return { ok: false, errors: [{ code: 'no-plots' }], warnings: [] };
    }
    var size = (map && map.size) || 0;
    var byCell = {};
    if (map && Array.isArray(map.cells)) {
      for (var i = 0; i < map.cells.length; i++) byCell[_k(map.cells[i].x, map.cells[i].z)] = map.cells[i];
    }
    var seenIds = {}, owner = {}; // owner: 'x,z' → plotId (per le sovrapposizioni)
    for (var p = 0; p < plots.length; p++) {
      var plot = plots[p];
      if (!plot || !plot.id) { errors.push({ code: 'plot-no-id', index: p }); continue; }
      if (seenIds[plot.id]) { errors.push({ code: 'plot-dup-id', plotId: plot.id }); continue; }
      seenIds[plot.id] = 1;
      var cells = plot.cells || [];
      if (!cells.length) { errors.push({ code: 'plot-empty', plotId: plot.id }); continue; }
      if (cells.length < LIMITS.plotMinArea) warnings.push({ code: 'plot-small', plotId: plot.id, area: cells.length });
      for (var j = 0; j < cells.length; j++) {
        var x = cells[j][0], z = cells[j][1], key = _k(x, z);
        if (x < 0 || z < 0 || x >= size || z >= size) {
          errors.push({ code: 'plot-out-of-map', plotId: plot.id, x: x, z: z });
          continue;
        }
        if (owner[key]) errors.push({ code: 'plot-overlap', plotId: plot.id, other: owner[key], x: x, z: z });
        else owner[key] = plot.id;
        var cell = byCell[key];
        if (!cell) errors.push({ code: 'plot-on-void', plotId: plot.id, x: x, z: z });
        else if (cell.biome !== 'floor') errors.push({ code: 'plot-not-floor', plotId: plot.id, x: x, z: z, biome: cell.biome });
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ── FALLBACK: griglia automatica di parcelle rettangolari (come maschere) ──
  // Usata SOLO se il template non ha parcelle disegnate col pennello.
  function computePlotGrid(size, plotSize, opts) {
    opts = opts || {};
    var margin = (opts.margin != null) ? opts.margin : 2;
    var path = (opts.path != null) ? opts.path : 3;
    if (!(plotSize > 0) || !(size > 0)) return [];
    var usable = size - 2 * margin;
    var n = Math.floor((usable + path) / (plotSize + path));
    if (n < 1) return [];
    var plots = [], idx = 1;
    for (var rz = 0; rz < n; rz++) {
      for (var rx = 0; rx < n; rx++) {
        var ox = margin + rx * (plotSize + path);
        var oz = margin + rz * (plotSize + path);
        var cells = [];
        for (var z = oz; z < oz + plotSize; z++) {
          for (var x = ox; x < ox + plotSize; x++) cells.push([x, z]);
        }
        plots.push({ id: 'p' + String(idx).padStart(2, '0'), cells: cells });
        idx++;
      }
    }
    return plots;
  }

  // ── Perimetro della maschera → segmenti (per LineSegments e bordi) ─────────
  // Coordinate degli ANGOLI di cella: la cella (x,z) copre x..x+1, z..z+1.
  function plotPerimeter(plot) {
    var mask = _maskSet(plot), segs = [];
    var cells = (plot && plot.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], z = cells[i][1];
      if (!mask.has(_k(x, z - 1))) segs.push({ x1: x, z1: z, x2: x + 1, z2: z });         // nord
      if (!mask.has(_k(x, z + 1))) segs.push({ x1: x, z1: z + 1, x2: x + 1, z2: z + 1 }); // sud
      if (!mask.has(_k(x - 1, z))) segs.push({ x1: x, z1: z, x2: x, z2: z + 1 });         // ovest
      if (!mask.has(_k(x + 1, z))) segs.push({ x1: x + 1, z1: z, x2: x + 1, z2: z + 1 }); // est
    }
    return segs;
  }

  // ── Targhetta OBBLIGATORIA (decisione utente) ──────────────────────────────
  function _lenOk(s, range) {
    var n = String(s || '').trim().length;
    return n >= range[0] && n <= range[1];
  }

  function validateTarghetta(t) {
    var errors = [];
    if (!t || typeof t !== 'object') return { ok: false, errors: [{ code: 'targhetta-missing' }] };
    if (!_lenOk(t.title, LIMITS.titleLen)) errors.push({ code: 'targhetta-title', min: LIMITS.titleLen[0], max: LIMITS.titleLen[1] });
    if (!_lenOk(t.text, LIMITS.textLen)) errors.push({ code: 'targhetta-text', min: LIMITS.textLen[0], max: LIMITS.textLen[1] });
    if (!_lenOk(t.author, LIMITS.authorLen)) errors.push({ code: 'targhetta-author', min: LIMITS.authorLen[0], max: LIMITS.authorLen[1] });
    return { ok: errors.length === 0, errors: errors };
  }

  // ── Consegna parcella ───────────────────────────────────────────────────────
  // payload = { plotId, concept:{title,text,author}, cells:[...], props:[...] }
  // opts = { limits?, matNames?: string[], assetNames?: string[] }
  function validateSubmission(plot, payload, opts) {
    opts = opts || {};
    var L = opts.limits || LIMITS;
    var errors = [];
    if (!plot || !payload) return { ok: false, errors: [{ code: 'bad-input' }] };

    try {
      if (JSON.stringify(payload).length > L.maxChars) errors.push({ code: 'too-big', max: L.maxChars });
    } catch (e) { errors.push({ code: 'bad-json' }); }

    var tk = validateTarghetta(payload.concept);
    if (!tk.ok) errors = errors.concat(tk.errors);

    var mask = _maskSet(plot);
    var matNames = opts.matNames ? new Set(opts.matNames) : null;
    var assetNames = opts.assetNames ? new Set(opts.assetNames) : null;

    var cells = payload.cells || [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.z)) { errors.push({ code: 'cell-bad-coords', index: i }); continue; }
      if (!mask.has(_k(c.x, c.z))) { errors.push({ code: 'cell-outside-plot', x: c.x, z: c.z }); continue; }
      if (!VALID_BIOMES[c.biome]) { errors.push({ code: 'cell-bad-biome', x: c.x, z: c.z, biome: c.biome }); continue; }
      if (c.biome === 'wall') {
        var alt = (c.alt == null) ? 1 : c.alt;
        if (!Number.isInteger(alt) || alt < L.minWallAlt || alt > L.maxWallAlt) {
          errors.push({ code: 'wall-alt', x: c.x, z: c.z, alt: alt, max: L.maxWallAlt });
        }
      }
      if (c.quota != null && (typeof c.quota !== 'number' || c.quota < L.quotaMin || c.quota > L.quotaMax)) {
        errors.push({ code: 'cell-quota', x: c.x, z: c.z, quota: c.quota });
      }
      if (c.mat && matNames && !matNames.has(c.mat)) errors.push({ code: 'cell-bad-mat', x: c.x, z: c.z, mat: c.mat });
    }

    var props = payload.props || [];
    if (props.length > L.maxProps) errors.push({ code: 'too-many-props', count: props.length, max: L.maxProps });
    for (var j = 0; j < props.length; j++) {
      var pr = props[j];
      if (!pr || typeof pr.x !== 'number' || typeof pr.z !== 'number') { errors.push({ code: 'prop-bad-coords', index: j }); continue; }
      if (!mask.has(_k(Math.floor(pr.x), Math.floor(pr.z)))) errors.push({ code: 'prop-outside-plot', x: pr.x, z: pr.z });
      if (assetNames && pr.name && !assetNames.has(pr.name)) errors.push({ code: 'prop-unknown-asset', name: pr.name });
    }

    // librerie custom della consegna (texture/materiali creati dallo studente,
    // già namespaced '<plotId>.'): cap numerici e di taglia
    if (payload.libs) {
      var texs = payload.libs.textures || {}, mats = payload.libs.materials || {};
      var tNames = Object.keys(texs), mNames = Object.keys(mats);
      if (tNames.length > L.maxLibTex) errors.push({ code: 'too-many-lib-tex', count: tNames.length, max: L.maxLibTex });
      if (mNames.length > L.maxLibMat) errors.push({ code: 'too-many-lib-mat', count: mNames.length, max: L.maxLibMat });
      var pfx = (payload.plotId || (plot && plot.id) || '') + '.';
      tNames.forEach(function (n) {
        if (n.indexOf(pfx) !== 0) errors.push({ code: 'lib-not-namespaced', name: n });
        if (texs[n] && String(texs[n].png || '').length > L.maxTexChars) errors.push({ code: 'tex-too-big', name: n });
      });
      mNames.forEach(function (n) {
        if (n.indexOf(pfx) !== 0) errors.push({ code: 'lib-not-namespaced', name: n });
      });
    }

    return { ok: errors.length === 0, errors: errors };
  }

  // ── Namespacing librerie custom alla consegna ───────────────────────────────
  // Tutto ciò che lo studente ha creato (texture dal pixel editor, materiali)
  // e che NON esiste nelle librerie di sessione viene rinominato
  // '<plotId>.<nome>' e i riferimenti riscritti (cells.mat, cubes.m, faces).
  // → zero collisioni tra parcelle, riconsegna deterministica (stessi nomi).
  // I tag delle texture custom vengono AZZERATI: i '#tag' della sessione non
  // devono pescare texture di studenti (pool del docente = canonico).
  // Ritorna { cells, props, textures, materials } pronti per il POST /api/plot.
  function namespacePlotLibs(opts) {
    var plotId = opts.plotId;
    var sessionTex = opts.sessionTex || {}, sessionMat = opts.sessionMat || {};
    var texLib = opts.texLib || {}, matLib = opts.matLib || {};
    var pfx = plotId + '.';
    var texMap = {}, matMap = {};   // vecchio nome → nuovo nome

    function renTex(n) { return texMap[n] || n; }
    var textures = {};
    Object.keys(texLib).forEach(function (n) {
      if (sessionTex[n] || n.indexOf(pfx) === 0) return;   // di sessione o già nostro
      texMap[n] = pfx + n;
    });
    Object.keys(matLib).forEach(function (n) {
      if (sessionMat[n] || n.indexOf(pfx) === 0) return;
      matMap[n] = pfx + n;
    });

    // riferimento faccia: nome diretto (rinominato se custom) o '#tag' (intatto)
    function renRef(ref) {
      if (ref == null || String(ref).charAt(0) === '#') return ref;
      return renTex(ref);
    }

    var usedTex = {}, usedMat = {};
    var cells = (opts.cells || []).map(function (c) {
      if (!c.mat || !matMap[c.mat]) return c;
      var out = Object.assign({}, c);
      out.mat = matMap[c.mat];
      usedMat[c.mat] = 1;
      return out;
    });
    var props = (opts.props || []).map(function (p) {
      var cubes = (p.cubes || []).map(function (cu) {
        var oc = null;
        if (cu.m && matMap[cu.m]) { oc = Object.assign({}, cu); oc.m = matMap[cu.m]; usedMat[cu.m] = 1; }
        if (cu.f) {
          oc = oc || Object.assign({}, cu);
          var nf = {};
          Object.keys(cu.f).forEach(function (face) {
            var r = cu.f[face];
            nf[face] = renRef(r);
            if (r != null && String(r).charAt(0) !== '#' && texMap[r]) usedTex[r] = 1;
          });
          oc.f = nf;
        }
        return oc || cu;
      });
      return Object.assign({}, p, { cubes: cubes });
    });

    // materiali custom USATI → includi; le loro facce possono citare texture custom
    var materials = {};
    Object.keys(usedMat).forEach(function (n) {
      var m = JSON.parse(JSON.stringify(matLib[n]));
      if (m.faces) {
        Object.keys(m.faces).forEach(function (face) {
          var r = m.faces[face];
          m.faces[face] = renRef(r);
          if (r != null && String(r).charAt(0) !== '#' && texMap[r]) usedTex[r] = 1;
        });
      }
      m.tags = [];   // niente pollution dei pool '#tag' di sessione
      materials[matMap[n]] = m;
    });
    Object.keys(usedTex).forEach(function (n) {
      var t = JSON.parse(JSON.stringify(texLib[n]));
      t.tags = [];
      textures[texMap[n]] = t;
    });

    return { cells: cells, props: props, textures: textures, materials: materials };
  }

  // ── Claim: first-come, un solo claim per device ─────────────────────────────
  // claims = [{plotId, deviceId, owner, at}]; req = {plotId, deviceId, owner, at}
  // Stesso device sulla stessa parcella → ok (riprendi dopo refresh).
  // Device che rivendica una parcella nuova → il claim precedente viene liberato
  // (una consegna già fatta sulla vecchia parcella NON viene toccata: resta esposta).
  function applyClaim(claims, req, opts) {
    claims = claims || [];
    opts = opts || {};
    if (!req || !req.plotId || !req.deviceId || !String(req.owner || '').trim()) {
      return { ok: false, reason: 'bad-request', claims: claims };
    }
    if (opts.plotIds && opts.plotIds.indexOf(req.plotId) === -1) {
      return { ok: false, reason: 'no-such-plot', claims: claims };
    }
    var existing = null, i;
    for (i = 0; i < claims.length; i++) if (claims[i].plotId === req.plotId) { existing = claims[i]; break; }
    if (existing && existing.deviceId !== req.deviceId) {
      return { ok: false, reason: 'taken', by: existing.owner, claims: claims };
    }
    var released = null;
    var next = claims.filter(function (c) {
      if (c.deviceId === req.deviceId && c.plotId !== req.plotId) { released = c.plotId; return false; }
      return c.plotId !== req.plotId; // il proprio claim sulla stessa parcella viene riscritto
    });
    next.push({ plotId: req.plotId, deviceId: req.deviceId, owner: String(req.owner).trim(), at: req.at || 0 });
    return { ok: true, claims: next, released: released };
  }

  // ── Merge: template + consegne → map JSON standard + metadato plots ────────
  // submissions = [{plotId, concept, owner?, cells, props}]
  // Le celle consegnate SOSTITUISCONO quelle del template alla stessa (x,z);
  // celle della maschera assenti dalla consegna → resta il template.
  // Deterministico e idempotente (ordina per plotId e per coordinate).
  function mergeGarden(template, submissions, plots) {
    template = template || {};
    plots = plots || template.plots || [];
    var subs = (submissions || []).slice().sort(function (a, b) { return a.plotId < b.plotId ? -1 : 1; });
    var pidx = plotIndex(plots);

    var byCell = new Map();
    var tcells = template.cells || [];
    for (var i = 0; i < tcells.length; i++) byCell.set(_k(tcells[i].x, tcells[i].z), tcells[i]);

    var props = (template.props || []).slice();
    var subById = {};
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s];
      var mask = pidx.byId[sub.plotId];
      if (!mask) continue; // parcella sconosciuta: ignora (la validazione vive altrove)
      subById[sub.plotId] = sub;
      var cells = sub.cells || [];
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (!mask.has(_k(c.x, c.z))) continue;
        byCell.set(_k(c.x, c.z), c);
      }
      var sprops = sub.props || [];
      for (var q = 0; q < sprops.length; q++) {
        var pr = Object.assign({}, sprops[q], { plot: sub.plotId });
        props.push(pr);
      }
    }

    var outCells = Array.from(byCell.values()).sort(function (a, b) { return (a.z - b.z) || (a.x - b.x); });
    var out = {};
    for (var key in template) if (key !== 'cells' && key !== 'props' && key !== 'plots') out[key] = template[key];
    out.cells = outCells;
    out.props = props;
    out.plots = plots.map(function (p) {
      var sub = subById[p.id];
      return {
        id: p.id, cells: p.cells,
        status: sub ? 'submitted' : 'free',
        concept: sub ? sub.concept : null,
        owner: sub ? (sub.owner || (sub.concept && sub.concept.author) || null) : null
      };
    });
    return out;
  }

  // ── Cutaway "una faccia" (decisione utente) ────────────────────────────────
  // Un muro diventa GHOST quando occluderebbe l'interno di una parcella:
  // esiste un vicino (4-dir) che è pavimento-di-parcella e sta "più in
  // profondità" del muro rispetto alla direzione di vista (dot(offset, forward) > 0).
  // walls = [{x,z}] · floorSet = Set('x,z') dei pavimenti di parcella ·
  // forward = [fx,fz] proiezione a terra della direzione di vista della camera
  // (dalla camera verso la scena). Con lo yaw snappato a 90° in iso, forward è
  // una diagonale: basta ricalcolare ai 4 snap. Ritorna Set('x,z') dei ghost.
  var _DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function wallVisibility(walls, floorSet, forward) {
    var ghost = new Set();
    if (!forward || (!forward[0] && !forward[1])) return ghost;
    for (var i = 0; i < (walls || []).length; i++) {
      var w = walls[i];
      for (var d = 0; d < 4; d++) {
        var nx = w.x + _DIRS[d][0], nz = w.z + _DIRS[d][1];
        if (!floorSet.has(_k(nx, nz))) continue;
        var dot = _DIRS[d][0] * forward[0] + _DIRS[d][1] * forward[1];
        if (dot > 0) { ghost.add(_k(w.x, w.z)); break; }
      }
    }
    return ghost;
  }

  // ── Export UMD ──────────────────────────────────────────────────────────────
  var CORE = {
    LIMITS: LIMITS,
    slugify: slugify,
    inPlot: inPlot,
    plotContains: plotContains,
    plotIndex: plotIndex,
    plotsFromCells: plotsFromCells,
    validatePlots: validatePlots,
    computePlotGrid: computePlotGrid,
    plotPerimeter: plotPerimeter,
    validateTarghetta: validateTarghetta,
    validateSubmission: validateSubmission,
    namespacePlotLibs: namespacePlotLibs,
    applyClaim: applyClaim,
    mergeGarden: mergeGarden,
    wallVisibility: wallVisibility
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIGardenCore = CORE;
  console.log('[MappAIGardenCore] logica pura Knowledge Garden caricata');
})();
