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
  var PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
  var SIZES = { s: { w: 120, h: 56 }, m: { w: 160, h: 72 }, l: { w: 200, h: 92 } };
  var LIMITS = {
    textMax: 80,          // caratteri per nodo
    nodesPerGroup: 30,    // cap contributi per gruppo
    nickMin: 2,
    nickMax: 24,
    coordMax: 1.5         // coordinate RELATIVE al centro: x,y ∈ [-1.5, 1.5]
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

  // ── Layer → mappa MappAI importabile ────────────────────────────────────
  // Root L0 + ogni nodo studente come figlio L1 (rel "propone", group 1).
  // Il JSON risultante è compatibile con importGraph/Unisci Mappe.
  function layerToGraph(rootLabel, nick, nodes) {
    var root = {
      id: 'root_collab', label: String(rootLabel || 'Lavagna') + ' — ' + String(nick || 'gruppo'),
      level: 0, group: 0
    };
    var out = { nodes: [root], links: [] };
    (Array.isArray(nodes) ? nodes : []).forEach(function (n, i) {
      var v = validateStudentNode(n);
      if (!v.ok) return;
      var id = 'sn_' + slugify(nick) + '_' + (i + 1);
      out.nodes.push({
        id: id, label: v.clean.text, level: 1, group: 1,
        desc: v.clean.text, content: v.clean.text
      });
      out.links.push({ source: root.id, target: id, rel: 'propone' });
    });
    return out;
  }

  var CORE = {
    PALETTE: PALETTE,
    SIZES: SIZES,
    LIMITS: LIMITS,
    sanitizeNick: sanitizeNick,
    sanitizeText: sanitizeText,
    slugify: slugify,
    validateStudentNode: validateStudentNode,
    mergeGroupNodes: mergeGroupNodes,
    groupColor: groupColor,
    layerToGraph: layerToGraph
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAICollabCore = CORE;
  console.log('[MappAICollabCore] logica pura Lavagna Collaborativa caricata');
})();
