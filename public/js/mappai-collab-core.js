/*
 * mappai-collab-core.js — logica PURA della Lavagna Collaborativa (testabile in Node)
 * -----------------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/rete: solo funzioni deterministiche condivise
 * tra pagina studente (public/collab/student.html), server (collab-server.js) e
 * lato docente (mappai-collab-teacher.js).
 *
 *  - PALETTE / SIZES / LIMITS      → costanti condivise (colori, taglie, cap)
 *  - sanitizeNick / sanitizeText   → input studente ripuliti (niente markup/controlli)
 *  - validateStudentNode           → un nodo rettangolare è ben formato?
 *  - mergeGroupNodes               → merge last-write-wins per id, cap per gruppo
 *  - groupColor                    → colore stabile per indice gruppo
 *  - layerToGraph                  → layer di un gruppo → JSON mappa MappAI
 *                                    importabile (root L0 + nodi L1, rel "propone")
 *
 * Modulo UMD (pattern di mappai-garden-core.js): module.exports per
 * `node --test`, window.MappAICollabCore per il browser.
 */
(function () {
  'use strict';

  // ── Costanti condivise ──────────────────────────────────────────────────
  // id riservato per il nodo root (L0): estremità valida per i collegamenti
  // che partono dal centro della mappa. Non è un nodo studente reale.
  var ROOT_ID = '__root__';
  var PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
  // Ladder ricalibrato per il telefono: la vecchia S (120×56) diventa la nuova L;
  // M e S scendono proporzionalmente (~0.82× e ~0.65×). Aspect ratio ~2.14 costante.
  var SIZES = { s: { w: 78, h: 36 }, m: { w: 98, h: 46 }, l: { w: 120, h: 56 } };
  var LIMITS = {
    textMax: 80,          // caratteri per nodo
    relMax: 30,           // caratteri per la keyword di collegamento
    nodesPerGroup: 30,    // cap contributi per gruppo
    linksPerGroup: 40,    // cap collegamenti per gruppo
    nickMin: 2,
    nickMax: 24,
    coordMax: 3.5         // coordinate RELATIVE al centro: x,y ∈ [-3.5, 3.5]
                          // (area ampia: lo studente naviga con pan/zoom + "Centra")
  };

  // ── Sanitizzazione input studente ───────────────────────────────────────
  // Nickname: 2-24 char, niente markup/controlli. Ritorna stringa o null.
  function sanitizeNick(raw) {
    var s = String(raw == null ? '' : raw)
      .replace(/[<>"'`\u0000-\u001f]/g, " ")
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length < LIMITS.nickMin || s.length > LIMITS.nickMax) return null;
    return s;
  }

  // Testo nodo: spazi collassati, markup neutralizzato, troncato a textMax.
  function sanitizeText(raw) {
    return String(raw == null ? '' : raw)
      .replace(/[<>`\u0000-\u001f]/g, " ")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LIMITS.textMax);
  }

  // Slug stabile per file su disco e id (pattern di main.js garden).
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'gruppo';
  }

  // ── Validazione nodo studente ───────────────────────────────────────────
  // Nodo atteso: { id, text, color, size, x, y, updatedAt }
  function validateStudentNode(n) {
    var errors = [];
    if (!n || typeof n !== 'object') return { ok: false, errors: ['not-an-object'] };
    if (typeof n.id !== 'string' || !n.id.trim() || n.id.length > 40) errors.push('bad-id');
    var text = sanitizeText(n.text);
    if (!text) errors.push('empty-text');
    if (PALETTE.indexOf(n.color) < 0) errors.push('bad-color');
    if (!SIZES[n.size]) errors.push('bad-size');
    if (typeof n.x !== 'number' || !isFinite(n.x) || Math.abs(n.x) > LIMITS.coordMax) errors.push('bad-x');
    if (typeof n.y !== 'number' || !isFinite(n.y) || Math.abs(n.y) > LIMITS.coordMax) errors.push('bad-y');
    return { ok: errors.length === 0, errors: errors, clean: errors.length === 0 ? {
      id: n.id.trim(), text: text, color: n.color, size: n.size,
      x: n.x, y: n.y, updatedAt: (typeof n.updatedAt === 'number' && isFinite(n.updatedAt)) ? n.updatedAt : Date.now()
    } : null };
  }

  // ── Merge contributi (ultimo scrittore vince) ───────────────────────────
  // existing/incoming: array di nodi. Ritorna { nodes, accepted, rejected }.
  // - i nodi incoming invalidi vengono scartati (rejected)
  // - stesso id: vince updatedAt più recente
  // - cap nodesPerGroup: si tengono i più recenti
  function mergeGroupNodes(existing, incoming) {
    var byId = {};
    (Array.isArray(existing) ? existing : []).forEach(function (n) {
      if (n && n.id) byId[n.id] = n;
    });
    var accepted = 0, rejected = [];
    (Array.isArray(incoming) ? incoming : []).forEach(function (n) {
      var v = validateStudentNode(n);
      if (!v.ok) { rejected.push({ id: n && n.id, errors: v.errors }); return; }
      var prev = byId[v.clean.id];
      if (prev && (prev.updatedAt || 0) > v.clean.updatedAt) return; // già più nuovo
      byId[v.clean.id] = v.clean;
      accepted++;
    });
    var nodes = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
      .slice(0, LIMITS.nodesPerGroup)
      .sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
    return { nodes: nodes, accepted: accepted, rejected: rejected };
  }

  function groupColor(i) {
    return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
  }

  // ── Validazione collegamento studente ───────────────────────────────────
  // Link atteso: { id, source, target, rel, updatedAt }. nodeIds = Set/array
  // degli id dei nodi del gruppo: entrambe le estremità devono esistere.
  function validateStudentLink(l, nodeIds) {
    var errors = [];
    if (!l || typeof l !== 'object') return { ok: false, errors: ['not-an-object'] };
    var ids = Array.isArray(nodeIds) ? nodeIds : [];
    if (typeof l.id !== 'string' || !l.id.trim() || l.id.length > 40) errors.push('bad-id');
    if (typeof l.source !== 'string' || (ids.indexOf(l.source) < 0 && l.source !== ROOT_ID)) errors.push('bad-source');
    if (typeof l.target !== 'string' || (ids.indexOf(l.target) < 0 && l.target !== ROOT_ID)) errors.push('bad-target');
    if (l.source === l.target) errors.push('self-link');
    var rel = sanitizeText(l.rel).slice(0, LIMITS.relMax);
    return { ok: errors.length === 0, errors: errors, clean: errors.length === 0 ? {
      id: l.id.trim(), source: l.source, target: l.target,
      rel: rel || 'collega',
      updatedAt: (typeof l.updatedAt === 'number' && isFinite(l.updatedAt)) ? l.updatedAt : Date.now()
    } : null };
  }

  // ── Merge collegamenti (ultimo scrittore vince, come i nodi) ────────────
  // I link con estremità inesistenti vengono scartati; cap linksPerGroup.
  function mergeGroupLinks(existing, incoming, nodeIds) {
    var ids = Array.isArray(nodeIds) ? nodeIds : [];
    var byId = {};
    (Array.isArray(existing) ? existing : []).forEach(function (l) {
      // i link esistenti restano solo se le estremità esistono ancora
      if (l && l.id && (ids.indexOf(l.source) >= 0 || l.source === ROOT_ID) && (ids.indexOf(l.target) >= 0 || l.target === ROOT_ID)) byId[l.id] = l;
    });
    var accepted = 0, rejected = [];
    (Array.isArray(incoming) ? incoming : []).forEach(function (l) {
      var v = validateStudentLink(l, ids);
      if (!v.ok) { rejected.push({ id: l && l.id, errors: v.errors }); return; }
      var prev = byId[v.clean.id];
      if (prev && (prev.updatedAt || 0) > v.clean.updatedAt) return;
      byId[v.clean.id] = v.clean;
      accepted++;
    });
    var links = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
      .slice(0, LIMITS.linksPerGroup)
      .sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
    return { links: links, accepted: accepted, rejected: rejected };
  }

  // ── Layer → mappa MappAI importabile ────────────────────────────────────
  // Root L0 + nodi studente L1 (group 1). I collegamenti espliciti dello
  // studente (con la loro keyword) diventano archi node→node; il link
  // root→"propone" resta SOLO per i nodi senza alcun arco entrante, così
  // l'albero non perde pezzi ma le relazioni volute dagli studenti comandano.
  function layerToGraph(rootLabel, nick, nodes, links) {
    var root = {
      id: 'root_collab', label: String(rootLabel || 'Lavagna') + ' — ' + String(nick || 'gruppo'),
      level: 0, group: 0
    };
    var out = { nodes: [root], links: [] };
    var slug = slugify(nick);
    var idMap = {};   // id studente → id mappa (stabile: deriva dall'id, non dall'indice)
    idMap[ROOT_ID] = root.id;   // i collegamenti dal centro puntano al vero nodo L0
    var validIds = [];
    (Array.isArray(nodes) ? nodes : []).forEach(function (n) {
      var v = validateStudentNode(n);
      if (!v.ok) return;
      var id = 'sn_' + slug + '_' + slugify(v.clean.id);
      idMap[v.clean.id] = id;
      validIds.push(v.clean.id);
      out.nodes.push({
        id: id, label: v.clean.text, level: 1, group: 1,
        desc: v.clean.text, content: v.clean.text
      });
    });
    var hasIncoming = {};
    (Array.isArray(links) ? links : []).forEach(function (l) {
      var v = validateStudentLink(l, validIds);
      if (!v.ok) return;
      out.links.push({ source: idMap[v.clean.source], target: idMap[v.clean.target], rel: v.clean.rel });
      hasIncoming[v.clean.target] = true;
    });
    validIds.forEach(function (sid) {
      if (!hasIncoming[sid]) out.links.push({ source: root.id, target: idMap[sid], rel: 'propone' });
    });
    return out;
  }

  var CORE = {
    ROOT_ID: ROOT_ID,
    PALETTE: PALETTE,
    SIZES: SIZES,
    LIMITS: LIMITS,
    sanitizeNick: sanitizeNick,
    sanitizeText: sanitizeText,
    slugify: slugify,
    validateStudentNode: validateStudentNode,
    mergeGroupNodes: mergeGroupNodes,
    validateStudentLink: validateStudentLink,
    mergeGroupLinks: mergeGroupLinks,
    groupColor: groupColor,
    layerToGraph: layerToGraph
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAICollabCore = CORE;
  console.log('[MappAICollabCore] logica pura Lavagna Collaborativa caricata');
})();
