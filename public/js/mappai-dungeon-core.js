/*
 * mappai-dungeon-core.js — logica PURA del Memory Dungeon (testabile in Node)
 * ---------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/appState: solo funzioni deterministiche
 * usate da mappai-games.js per il loop di apprendimento robusto:
 *  - capEvents      → cap dell'event-log unificato (telemetria ECD, c20/c21)
 *  - strHash        → hash contenuto per invalidare la cache quiz (desc cambiata)
 *  - validQuizItem  → validazione item quiz AI (indispensabile per il tier locale 4B)
 *  - zpdFormat      → difficoltà domanda adattiva per mastery (ZPD/fading, c10)
 *  - stratifiedPick → campionatore boss per macro-area (copertura, no blind spot)
 *  - pickTier       → scelta del tier AI: cloud → locale → deterministico
 *
 * Modulo UMD (pattern di mappai-mastery.js): module.exports per `node --test`,
 * window.MappAIDungeonCore per il browser. Caricare in index.html PRIMA di
 * mappai-games.js. mappai-games.js ha fallback inline se il file manca.
 */
(function () {
  'use strict';

  // ── Event-log: cap append-only. Oltre max → butta il 25% più vecchio (le voci sono in ordine di inserimento).
  function capEvents(arr, max) {
    if (!Array.isArray(arr)) return [];
    var m = (max > 0) ? max : 2000;
    if (arr.length <= m) return arr;
    return arr.slice(arr.length - Math.floor(m * 0.75));
  }

  // ── Hash contenuto (imul, stesso schema di _mapSig in games.js) → base36. '' per input vuoto.
  function strHash(s) {
    s = String(s || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function _wc(s) { s = String(s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function _norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // ── Validazione item quiz {stem|q, a1, a2, a3?, correct 1-based}.
  // Il tier locale (4B) produce JSON ben formato (grammatica GBNF) ma non garantisce
  // item SENSATI: qui il filtro deterministico. Regole:
  //  stem ≥ 4 parole · ≥ 2 opzioni distinte non vuote · correct valido e nel set ·
  //  lo stem non contiene la risposta corretta verbatim · opzioni ≤ 12 parole.
  function validQuizItem(it, label) {
    if (!it) return false;
    var stem = String(it.stem || it.q || '').trim();
    if (_wc(stem) < 4) return false;
    var opts = [it.a1, it.a2, it.a3].filter(function (o) { return o != null && String(o).trim() !== ''; }).map(function (o) { return String(o).trim(); });
    if (opts.length < 2) return false;
    var seen = {}, distinct = 0;
    for (var i = 0; i < opts.length; i++) {
      if (_wc(opts[i]) > 12) return false;
      var k = _norm(opts[i]);
      if (!seen[k]) { seen[k] = 1; distinct++; }
    }
    if (distinct < 2) return false;
    var ci = parseInt(it.correct, 10);
    if (!(ci >= 1 && ci <= 3)) return false;
    var corr = it['a' + ci];
    if (corr == null || String(corr).trim() === '') return false;
    if (_norm(stem).indexOf(_norm(corr)) >= 0) return false;   // lo stem regala la risposta
    return true;
  }

  // ── Difficoltà adattiva (ZPD + fading, c10): formato domanda dal livello mastery.
  //  nuovo → 'tf' (scelta binaria: carico minimo) · in-corso → 'mc' · acquisito/fluente → 'open'.
  // CAP sui tentativi: con EWMA la prima misura È il valore → un TF indovinato (50% caso)
  // manderebbe subito a 'acquisito'. Con attempts < 3 non si sale mai oltre 'in-corso'.
  function zpdFormat(level, attempts) {
    var a = attempts || 0;
    var lv = level || 'nuovo';
    if (a < 3 && (lv === 'acquisito' || lv === 'fluente')) lv = 'in-corso';
    if (lv === 'nuovo') return 'tf';
    if (lv === 'in-corso') return 'mc';
    return 'open';
  }

  // ── Campionatore stratificato per il boss (copertura macro-aree, B18).
  // entries: [{id, macro, attempts, need}] — round-robin fra i gruppi macro;
  // dentro ogni gruppo: prima i mai testati (attempts 0), poi need decrescente.
  // Garantisce: se count ≥ #gruppi, ogni gruppo è rappresentato almeno una volta.
  function stratifiedPick(entries, count) {
    if (!Array.isArray(entries) || !entries.length || !(count > 0)) return [];
    var groups = {}, order = [];
    entries.forEach(function (e) {
      var g = (e && e.macro != null) ? String(e.macro) : '?';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(e);
    });
    order.forEach(function (g) {
      groups[g].sort(function (a, b) {
        var ua = (a.attempts || 0) === 0 ? 0 : 1, ub = (b.attempts || 0) === 0 ? 0 : 1;
        if (ua !== ub) return ua - ub;                       // mai testati prima
        return (b.need || 0) - (a.need || 0);                // poi più bisognosi
      });
    });
    var pick = [], gi = 0, done = false;
    while (pick.length < count && !done) {
      done = true;
      for (var i = 0; i < order.length && pick.length < count; i++) {
        var lst = groups[order[i]];
        if (gi < lst.length) { pick.push(lst[gi]); done = false; }
      }
      gi++;
    }
    return pick;
  }

  // ── Tier AI: 'cloud' (API key presente) → 'local' (modello locale configurato,
  // flag non spento) → 'off' (deterministico). localDisabled = flag utente '0'.
  function pickTier(hasKey, hasModel, localDisabled) {
    if (hasKey) return 'cloud';
    if (hasModel && !localDisabled) return 'local';
    return 'off';
  }

  // ═══════════ §17 — Ponte Studio Attivo ↔ Dungeon (logica pura) ═══════════

  // parentOf dall'albero (genitore = estremo col livello inferiore di 1) —
  // stesso criterio dello snapshot di mappai-active-study.js.
  function buildParentOf(nodes, links) {
    var byId = {};
    (nodes || []).forEach(function (n) { if (n && n.id != null) byId[n.id] = n; });
    var parentOf = {};
    (links || []).forEach(function (l) {
      var sid = (l.source && typeof l.source === 'object') ? l.source.id : l.source;
      var tid = (l.target && typeof l.target === 'object') ? l.target.id : l.target;
      var s = byId[sid], t = byId[tid];
      if (!s || !t) return;
      if (typeof s.level === 'number' && typeof t.level === 'number' && s.level === t.level - 1) {
        parentOf[t.id] = s.id;
      }
    });
    return parentOf;
  }

  // Catena più lunga senza biforcazioni (≥3 nodi) — solo lì l'ordine "corretto"
  // è non ambiguo (sequenza di boot, modo 7). null se non esiste.
  function findBestChain(parentOf) {
    var children = {};
    Object.keys(parentOf).forEach(function (c) {
      var p = parentOf[c];
      (children[p] = children[p] || []).push(c);
    });
    var best = null;
    var heads = {};
    Object.keys(parentOf).forEach(function (c) { heads[c] = 1; });
    Object.keys(parentOf).forEach(function (c) { heads[parentOf[c]] = 1; });
    Object.keys(heads).forEach(function (id) {
      var p = parentOf[id];
      if (p && (children[p] || []).length === 1) return;   // non è testa di catena
      var path = [id];
      var cur = id;
      while (children[cur] && children[cur].length === 1) { cur = children[cur][0]; path.push(cur); }
      if (path.length >= 3 && (!best || path.length > best.length)) best = path;
    });
    return best;
  }

  // Cloze generativo (unit corrotta): sceglie n parole-contenuto distinte (le più
  // lunghe = più informative), poi le maschera nella PRIMA occorrenza. null se il
  // testo non ha abbastanza materiale (< 2 candidate).
  function clozeGaps(text, n) {
    var words = String(text || '').split(/\s+/);
    var seen = {}, cands = [];
    words.forEach(function (w, i) {
      var clean = w.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
      if (clean.length < 5) return;
      var k = clean.toLowerCase();
      if (seen[k]) return; seen[k] = 1;
      cands.push({ word: clean, idx: i });
    });
    if (cands.length < 2) return null;
    cands.sort(function (a, b) { return b.word.length - a.word.length; });
    var picked = cands.slice(0, Math.max(2, Math.min(n || 3, cands.length)));
    picked.sort(function (a, b) { return a.idx - b.idx; });
    var masked = words.slice();
    picked.forEach(function (p) { masked[p.idx] = masked[p.idx].replace(p.word, '▁▁▁▁▁'); });
    return { gaps: picked.map(function (p) { return p.word; }), masked: masked.join(' ') };
  }

  // Unità mal archiviata: host = macro-area con più voci (≥2); intruso = voce di
  // un'altra macro LESSICALMENTE più distante dal corpus host (simFn: più bassa =
  // più distante — un intruso plausibile punirebbe risposte difendibili).
  // entries: [{id, label, desc, macro}] · ritorna {host, hostEntries≤4, intruder} | null.
  function pickMisfiled(entries, simFn) {
    if (!Array.isArray(entries) || !entries.length) return null;
    var byM = {};
    entries.forEach(function (e) { var m = e && e.macro; if (!m) return; (byM[m] = byM[m] || []).push(e); });
    var host = null;
    Object.keys(byM).forEach(function (m) { if (byM[m].length >= 2 && (!host || byM[m].length > byM[host].length)) host = m; });
    if (!host) return null;
    var others = entries.filter(function (e) { return e.macro && e.macro !== host; });
    if (!others.length) return null;
    var hostText = byM[host].map(function (e) { return e.label + ' ' + (e.desc || ''); }).join(' ');
    var intruder = others[0], best = Infinity;
    others.forEach(function (e) {
      var s = simFn ? simFn(e.label + ' ' + (e.desc || ''), hostText) : 0;
      if (s < best) { best = s; intruder = e; }
    });
    return { host: host, hostEntries: byM[host].slice(0, 4), intruder: intruder };
  }

  // ── PIANI CUSTOM DAL VAULT (contratto mappai-dungeon-floor@1) ──────────────
  // Design: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md
  // Converte un piano del contratto nella griglia rot.js del gioco:
  // map['x,y'] = 0 (camminabile) | 1 (muro). void/water/wall → 1.
  // quota['x,y'] = quota della cella (default 0); hasQuota = almeno una cella
  // camminabile fuori quota 0 → il chiamante sa se attivare il movimento §21.
  function planToGrid(plan) {
    if (!plan || !Array.isArray(plan.cells)) return null;
    var size = plan.size | 0;
    if (size < 4 || size > 64) return null;
    var map = {}, waterKeys = [], quota = {}, hasQuota = false;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) map[x + ',' + y] = 1; // default: void = muro
    plan.cells.forEach(function (c) {
      if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.z)) return;
      if (c.x < 0 || c.x >= size || c.z < 0 || c.z >= size) return;
      var biome = c.biome || 'floor';
      var blocked = (c.blocca != null) ? !!c.blocca : biome !== 'floor';
      map[c.x + ',' + c.z] = blocked ? 1 : 0;
      var q = (typeof c.quota === 'number' && isFinite(c.quota)) ? c.quota : 0;
      quota[c.x + ',' + c.z] = q;
      if (!blocked && q !== 0) hasQuota = true;
      if (biome === 'water') waterKeys.push(c.x + ',' + c.z);
    });
    return { w: size, h: size, map: map, waterKeys: waterKeys, quota: quota, hasQuota: hasQuota };
  }

  // ── MOVIMENTO QUOTA-AWARE (design §21) ──────────────────────────────────────
  // Discesa CAPPATA (DQ0, deciso 7/7/26): |Δquota| > STEP_UP_JUMP = bloccato nei
  // due versi → movimento simmetrico, niente fosse-trappola per costruzione.
  // (Il proto tools/voxel-proto resta col suo modello a caduta libera: sandbox.)
  var STEP_UP_WALK = 0.9;   // gradino percorribile camminando
  var STEP_UP_JUMP = 1.6;   // gradino percorribile col salto automatico

  // Passo tra due celle adiacenti: 'walk' | 'jump' | 'fall' | 'blocked'.
  // quota può essere null (griglia piatta legacy) → solo walk/blocked.
  function stepKindGrid(map, quota, fromKey, toKey) {
    if (map[toKey] !== 0) return 'blocked';
    if (!quota) return 'walk';
    var dq = (quota[toKey] || 0) - (quota[fromKey] || 0);
    if (dq > STEP_UP_JUMP || dq < -STEP_UP_JUMP) return 'blocked';
    if (dq > STEP_UP_WALK) return 'jump';
    if (dq < -STEP_UP_WALK) return 'fall';
    return 'walk';
  }

  // BFS 4-direzioni con archi quota-aware. Sostituisce ROT.Path.AStar quando la
  // quota esiste: il callback rot.js riceve solo (x,y) e non può esprimere archi
  // che dipendono da ENTRAMBE le celle. Ritorna [[x,y],...] INCLUSA la partenza
  // (stesso formato del compute rot.js) oppure null se non c'è percorso.
  function findPathQuota(map, quota, sx, sy, tx, ty) {
    var sk = sx + ',' + sy, tk = tx + ',' + ty;
    if (map[sk] !== 0 || map[tk] !== 0) return null;
    var prev = {}; prev[sk] = null;
    var q = [sk];
    while (q.length) {
      var k = q.shift();
      if (k === tk) break;
      var p = k.split(','), x = +p[0], y = +p[1];
      for (var di = 0; di < 4; di++) {
        var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][di];
        var nk = (x + d[0]) + ',' + (y + d[1]);
        if (prev[nk] !== undefined) continue;
        if (stepKindGrid(map, quota, k, nk) === 'blocked') continue;
        prev[nk] = k; q.push(nk);
      }
    }
    if (prev[tk] === undefined) return null;
    var path = [], cur = tk;
    while (cur) { var pp = cur.split(','); path.unshift([+pp[0], +pp[1]]); cur = prev[cur]; }
    return path;
  }

  // Normalizza gli slot del piano: tiene solo quelli su celle camminabili,
  // sceglie il primo per i tipi singolari, fallback spawn = prima cella libera.
  // (Tolleranza da CARICAMENTO: la validazione dura avviene al salvataggio, nell'editor.)
  function normalizePlanSlots(plan, grid) {
    var out = { spawn: null, stairs: null, gatekeeper: null, memory: [], enemy: [], dropped: [] };
    var slots = (plan && Array.isArray(plan.slots)) ? plan.slots : [];
    slots.forEach(function (s) {
      if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.z)) return;
      var key = s.x + ',' + s.z;
      if (!grid || grid.map[key] !== 0) { out.dropped.push({ type: s.type, key: key }); return; }
      if (s.type === 'spawn' && !out.spawn) out.spawn = key;
      else if (s.type === 'stairs' && !out.stairs) out.stairs = key;
      else if (s.type === 'gatekeeper' && !out.gatekeeper) out.gatekeeper = key;
      else if (s.type === 'memory') out.memory.push(key);
      else if (s.type === 'enemy') out.enemy.push(key);
    });
    if (!out.spawn && grid) {
      for (var k in grid.map) { if (grid.map[k] === 0) { out.spawn = k; break; } }
    }
    return out;
  }

  // ── VALIDATORE (contratto §4) ───────────────────────────────────────────────
  // Input: piano, ruleset (null → default §3) e numero di memorie richieste dal
  // livello (null → controllo coverage saltato: conteggio ignoto al chiamante).
  // Output: { ok, errors: [{code, msg, ...}], warnings: [...] } — non modifica nulla.
  // Giocabilità (§4.1) sempre error; pedagogia (§4.2) con severità dal ruleset.
  // Ultimo piano dedotto dagli slot: gatekeeper presente = piano finale (0 scale).
  // minSpacing in BLOCCHI (1 tile = plan.sub blocchi); se insoddisfabile per
  // size/numero memorie la regola è rilassata a warning (§3.1).
  var DEFAULT_RULESET = {
    memory: { coverage: 'all', minSpacing: 40, maxPerRoom: null },
    enemies: { max: 6 },
    required: ['spawn', 'stairs'],
    requiredLastFloor: ['gatekeeper'],
    severity: { minSpacing: 'warning', coverage: 'error', enemiesMax: 'error' }
  };

  // BFS 4-direzioni sulle celle camminabili (map[k]===0) — stessa semantica del
  // gioco. Quota-aware (§21): una rupe > STEP_UP_JUMP blocca come un muro.
  // Esposta come reachableCells per i piazzamenti runtime (staleness) e l'editor.
  function reachableCells(map, quota, startKey) {
    var seen = {};
    if (map[startKey] !== 0) return seen;
    seen[startKey] = true;
    var q = [startKey];
    while (q.length) {
      var k = q.shift();
      var p = k.split(','), x = +p[0], y = +p[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nk = (x + d[0]) + ',' + (y + d[1]);
        if (!seen[nk] && stepKindGrid(map, quota, k, nk) !== 'blocked') { seen[nk] = true; q.push(nk); }
      });
    }
    return seen;
  }
  function _reachableFrom(grid, startKey) {
    return reachableCells(grid.map, grid.hasQuota ? grid.quota : null, startKey);
  }

  function validatePlan(plan, ruleset, levelNodeCount) {
    var errors = [], warnings = [];
    var R = ruleset || {};
    var mem = R.memory || {};
    var sev = R.severity || {};
    var coverage = mem.coverage != null ? mem.coverage : DEFAULT_RULESET.memory.coverage;
    var minSpacing = mem.minSpacing != null ? mem.minSpacing : DEFAULT_RULESET.memory.minSpacing;
    var enemiesMax = (R.enemies && R.enemies.max != null) ? R.enemies.max : DEFAULT_RULESET.enemies.max;
    function bucketOf(rule) {
      var s = sev[rule] || DEFAULT_RULESET.severity[rule];
      return s === 'error' ? errors : warnings;
    }

    var grid = planToGrid(plan);
    if (!grid) {
      errors.push({ code: 'contract-invalid', msg: 'Piano non conforme al contratto (servono size 4–64 e cells)' });
      return { ok: false, errors: errors, warnings: warnings };
    }

    // §4.1.5 — almeno una cella calpestabile
    var hasFloor = false;
    for (var fk in grid.map) { if (grid.map[fk] === 0) { hasFloor = true; break; } }
    if (!hasFloor) errors.push({ code: 'no-floor', msg: 'Nessuna cella calpestabile: la mappa è tutta muri/acqua/void' });

    // slot RAW (non normalizzati: qui servono i duplicati per le cardinalità)
    var slots = Array.isArray(plan.slots) ? plan.slots.filter(function (s) {
      return s && Number.isInteger(s.x) && Number.isInteger(s.z);
    }) : [];
    var byType = {};
    slots.forEach(function (s) { (byType[s.type] = byType[s.type] || []).push(s.x + ',' + s.z); });
    var spawn = byType.spawn || [], stairs = byType.stairs || [], gate = byType.gatekeeper || [];
    var memorySlots = byType.memory || [], enemySlots = byType.enemy || [];

    // §4.1.4 — nessuno slot su cella void o bloccata
    slots.forEach(function (s) {
      if (grid.map[s.x + ',' + s.z] !== 0) {
        errors.push({ code: 'slot-blocked', msg: 'Slot ' + s.type + ' su cella non calpestabile (muro/acqua/void)', at: [s.x, s.z] });
      }
    });

    // §4.1.1 — spawn esattamente uno
    if (!spawn.length) errors.push({ code: 'spawn-missing', msg: 'Manca lo slot spawn (punto di partenza)' });
    else if (spawn.length > 1) errors.push({ code: 'spawn-multiple', msg: 'Più di uno slot spawn (' + spawn.length + ')' });

    var reach = spawn.length ? _reachableFrom(grid, spawn[0]) : null;

    // §4.1.2/3 — uscita del piano: gatekeeper presente = ultimo piano (0 scale)
    if (gate.length) {
      if (gate.length > 1) errors.push({ code: 'gatekeeper-multiple', msg: 'Più di un Guardiano (' + gate.length + ')' });
      if (stairs.length) errors.push({ code: 'stairs-on-last-floor', msg: 'Scale e Guardiano sullo stesso piano: l\'ultimo piano non ha scale' });
      if (reach && grid.map[gate[0]] === 0 && !reach[gate[0]]) {
        errors.push({ code: 'gatekeeper-unreachable', msg: 'Il Guardiano non è raggiungibile dallo spawn' });
      }
    } else if (!stairs.length) {
      errors.push({ code: 'stairs-missing', msg: 'Manca lo slot scale (o un Guardiano, se è l\'ultimo piano)' });
    } else if (reach && grid.map[stairs[0]] === 0 && !reach[stairs[0]]) {
      errors.push({ code: 'stairs-unreachable', msg: 'Le scale non sono raggiungibili dallo spawn' });
    }

    // §21 — slot su celle camminabili ma isolate (da muri O da rupi > STEP_UP_JUMP)
    if (reach) {
      slots.forEach(function (s) {
        var k = s.x + ',' + s.z;
        if ((s.type === 'memory' || s.type === 'enemy') && grid.map[k] === 0 && !reach[k]) {
          warnings.push({ code: 'slot-unreachable', msg: 'Slot ' + s.type + ' non raggiungibile dallo spawn (isolato da muri o dislivelli)', at: [s.x, s.z] });
        }
      });
    }

    // §4.2.6 — coverage: slot memory == memorie richieste dal livello (o >= min)
    if (levelNodeCount != null) {
      var need = (coverage && coverage.min != null) ? coverage.min : levelNodeCount;
      if (memorySlots.length < need) {
        bucketOf('coverage').push({ code: 'memory-missing', msg: 'Piazzate ' + memorySlots.length + ' memorie su ' + need + ' richieste dal livello ' + plan.level, need: need, have: memorySlots.length });
      } else if (coverage === 'all' && memorySlots.length > need) {
        bucketOf('coverage').push({ code: 'memory-extra', msg: 'Piazzate ' + memorySlots.length + ' memorie ma il livello ' + plan.level + ' ne ha ' + need + ': le eccedenti resteranno vuote', need: need, have: memorySlots.length });
      }
    }

    // §4.2.7 — anti-clustering in blocchi; regola insoddisfabile → rilassata a warning
    var sub = plan.sub || 3;
    if (minSpacing > 0 && memorySlots.length > 1) {
      var side = (plan.size - 1) * sub;
      var maxAchievable = Math.SQRT2 * side / Math.max(1, Math.ceil(Math.sqrt(memorySlots.length)) - 1);
      var relaxed = minSpacing > maxAchievable;
      for (var i = 0; i < memorySlots.length; i++) {
        for (var j = i + 1; j < memorySlots.length; j++) {
          var a = memorySlots[i].split(','), b = memorySlots[j].split(',');
          var dist = Math.hypot(a[0] - b[0], a[1] - b[1]) * sub;
          if (dist < minSpacing) {
            (relaxed ? warnings : bucketOf('minSpacing')).push({
              code: 'memory-too-close',
              msg: 'Due memorie a ' + Math.round(dist) + ' blocchi (min ' + minSpacing + (relaxed ? ', regola rilassata: mappa piccola per questa soglia' : '') + ')',
              at: [[+a[0], +a[1]], [+b[0], +b[1]]]
            });
          }
        }
      }
    }

    // §4.2.8 — cap nemici
    if (enemySlots.length > enemiesMax) {
      bucketOf('enemiesMax').push({ code: 'enemies-max', msg: 'Troppi nemici: ' + enemySlots.length + ' (max ' + enemiesMax + ')' });
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // Assegna i nodi (memorie del livello) agli slot memory, ordinati per
  // scoreFn crescente (i più deboli emergono per primi). Staleness tollerata:
  // slot in più restano vuoti, nodi in più tornano al chiamante.
  function assignMemorySlots(slotKeys, nodes, scoreFn) {
    var keys = Array.isArray(slotKeys) ? slotKeys : [];
    var sorted = (Array.isArray(nodes) ? nodes.slice() : []).sort(function (a, b) {
      return scoreFn(a) - scoreFn(b);
    });
    var n = Math.min(keys.length, sorted.length), placed = [];
    for (var i = 0; i < n; i++) placed.push({ key: keys[i], node: sorted[i] });
    return { placed: placed, unplacedNodes: sorted.slice(n), emptySlots: keys.slice(n) };
  }

  // ── MAPPA-MONDO (design §20 · contratto §11: mappai-dungeon-world@1) ────────
  // Zone = aree di pavimento CONTIGUE rilevate per flood-fill (mai disegnate a
  // mano); i GATE (slot su celle di passaggio) tagliano il grafo e collegano le
  // zone adiacenti. Decisioni §20.9: D1 binding docente+fallback capienza,
  // D2 gate default coverage 0.6 + quiz 2, D7 zona spawn = giardino (senza rami).
  var WORLD_GATE_DEFAULT = { coverage: 0.6, quiz: 2 };

  // Rileva zone e gate dal piano-mondo. Ritorna null se il contratto celle è rotto.
  function worldZones(plan) {
    var grid = planToGrid(plan);
    if (!grid) return null;
    var slots = Array.isArray(plan.slots) ? plan.slots : [];
    var gateKeys = {};
    slots.forEach(function (s) {
      if (s && s.type === 'gate' && Number.isInteger(s.x) && Number.isInteger(s.z)) gateKeys[s.x + ',' + s.z] = s;
    });
    // flood-fill (4 dir) delle celle camminabili NON-gate — ordine deterministico.
    // Quota-aware (§21): una rupe > STEP_UP_JUMP divide due aree come un muro.
    var quota = grid.hasQuota ? grid.quota : null;
    var byCell = {}, zones = [];
    var keys = Object.keys(grid.map).filter(function (k) { return grid.map[k] === 0 && !gateKeys[k]; }).sort();
    keys.forEach(function (k0) {
      if (byCell[k0] !== undefined) return;
      var idx = zones.length, cells = [], q = [k0];
      byCell[k0] = idx;
      while (q.length) {
        var k = q.shift(); cells.push(k);
        var p = k.split(','), x = +p[0], y = +p[1];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nk = (x + d[0]) + ',' + (y + d[1]);
          if (grid.map[nk] === 0 && !gateKeys[nk] && byCell[nk] === undefined &&
              stepKindGrid(grid.map, quota, k, nk) !== 'blocked') { byCell[nk] = idx; q.push(nk); }
        });
      }
      zones.push({ id: 'z' + (idx + 1), cells: cells, branchHint: null, declared: false, memory: 0, enemy: 0 });
    });
    // ancore dichiarate (plan.zones): la zona che contiene l'anchor prende id/branchHint
    (Array.isArray(plan.zones) ? plan.zones : []).forEach(function (zd) {
      if (!zd || !zd.anchor || !Number.isInteger(zd.anchor.x) || !Number.isInteger(zd.anchor.z)) return;
      var idx = byCell[zd.anchor.x + ',' + zd.anchor.z];
      if (idx === undefined) return;
      if (zd.id) zones[idx].id = zd.id;
      if (zd.branchHint) zones[idx].branchHint = zd.branchHint;
      zones[idx].declared = true;
    });
    // gate → zone adiacenti distinte (un gate valido ne tocca esattamente 2).
    // Quota-aware: il gate collega solo le zone su cui si può DAVVERO scendere/salire.
    var gates = Object.keys(gateKeys).sort().map(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1], adj = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nk = (x + d[0]) + ',' + (y + d[1]);
        var idx = byCell[nk];
        if (idx !== undefined && adj.indexOf(idx) < 0 &&
            (grid.map[k] !== 0 || stepKindGrid(grid.map, quota, k, nk) !== 'blocked')) adj.push(idx);
      });
      return { key: k, req: gateKeys[k].req || null, zoneIdx: adj, onWalkable: grid.map[k] === 0 };
    });
    // conteggi slot per zona + spawn/gatekeeper
    var spawnIdx = null, spawnCount = 0, gatekeeperCount = 0, gatekeeperIdx = null;
    var memoryKeys = [];
    slots.forEach(function (s) {
      if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.z)) return;
      var idx = byCell[s.x + ',' + s.z];
      if (s.type === 'memory') { if (idx !== undefined) zones[idx].memory++; memoryKeys.push(s.x + ',' + s.z); }
      else if (s.type === 'enemy' && idx !== undefined) zones[idx].enemy++;
      else if (s.type === 'spawn') { spawnCount++; if (idx !== undefined && spawnIdx === null) spawnIdx = idx; }
      else if (s.type === 'gatekeeper') { gatekeeperCount++; if (idx !== undefined && gatekeeperIdx === null) gatekeeperIdx = idx; }
    });
    return { grid: grid, zones: zones, gates: gates, byCell: byCell, memoryKeys: memoryKeys,
             spawnIdx: spawnIdx, spawnCount: spawnCount,
             gatekeeperCount: gatekeeperCount, gatekeeperIdx: gatekeeperIdx };
  }

  // D1: binding zona↔ramo — prima gli hint del docente (match fuzzy sul label),
  // poi fallback per capienza (zona con più slot memory ↔ ramo con più memorie).
  // branches: [{label, count}] · deterministico.
  function bindZones(zones, branches) {
    var pool = Array.isArray(branches) ? branches.slice() : [];
    var norm = function (s) { return (s || '').toString().toLowerCase().trim(); };
    var assignments = {};
    zones.forEach(function (z) {
      if (!z.branchHint) return;
      var h = norm(z.branchHint);
      if (!h) return;
      for (var i = 0; i < pool.length; i++) {
        var l = norm(pool[i].label);
        if (l && (l.indexOf(h) >= 0 || h.indexOf(l) >= 0)) {
          assignments[z.id] = pool[i];
          pool.splice(i, 1);
          return;
        }
      }
    });
    var rest = zones.filter(function (z) { return !assignments[z.id]; })
      .sort(function (a, b) { return (b.memory - a.memory) || (a.id < b.id ? -1 : 1); });
    pool.sort(function (a, b) { return (b.count - a.count) || (norm(a.label) < norm(b.label) ? -1 : 1); });
    rest.forEach(function (z, i) { if (pool[i]) assignments[z.id] = pool[i]; });
    return { assignments: assignments, unusedBranches: pool.slice(rest.length) };
  }

  // Requisito di un gate (D2): sanifica il req (rotto/assente → default) e valuta le
  // condizioni PRE-quiz sui numeri della zona di provenienza. stats = { coverage: 0..1,
  // mastery: 0..1 }. Ritorna { pass, quiz, req, fail: ['coverage'|'mastery'…] } —
  // pass=true ⇒ restano solo le `quiz` domande del guardiano (0 = si apre subito).
  function checkGateReq(req, stats) {
    var r = req || {};
    var bad = (r.coverage != null && !(r.coverage >= 0 && r.coverage <= 1)) ||
              (r.quiz != null && !(typeof r.quiz === 'number' && r.quiz >= 1 && r.quiz === Math.floor(r.quiz))) ||
              (r.mastery != null && !(r.mastery >= 0 && r.mastery <= 1));
    if (bad || (r.coverage == null && r.quiz == null && r.mastery == null)) r = WORLD_GATE_DEFAULT;
    var s = stats || {};
    var fail = [];
    if (r.coverage != null && !((s.coverage || 0) >= r.coverage)) fail.push('coverage');
    if (r.mastery != null && !((s.mastery || 0) >= r.mastery)) fail.push('mastery');
    return { pass: !fail.length, quiz: r.quiz || 0, req: r, fail: fail };
  }

  // Validatore del mondo (contratto §11 / design §20.6). branches = [{label, count}]
  // (nodi con contenuto per ramo L1) oppure null → coverage per zona saltata.
  function validateWorld(plan, ruleset, branches) {
    var errors = [], warnings = [];
    var R = ruleset || {};
    var sev = R.severity || {};
    function bucketOf(rule) {
      var s = sev[rule] || DEFAULT_RULESET.severity[rule];
      return s === 'error' ? errors : warnings;
    }
    if (!plan || typeof plan.schema !== 'string' || plan.schema.indexOf('mappai-dungeon-world@') !== 0) {
      errors.push({ code: 'contract-invalid', msg: 'Schema mancante o non-mondo (atteso mappai-dungeon-world@1)' });
      return { ok: false, errors: errors, warnings: warnings };
    }
    var W = worldZones(plan);
    if (!W) {
      errors.push({ code: 'contract-invalid', msg: 'Mondo non conforme al contratto (servono size 4–64 e cells)' });
      return { ok: false, errors: errors, warnings: warnings };
    }
    if (!W.zones.length) errors.push({ code: 'no-floor', msg: 'Nessuna area calpestabile' });

    // spawn esattamente uno (D7: è il giardino)
    if (!W.spawnCount) errors.push({ code: 'spawn-missing', msg: 'Manca lo slot spawn (il giardino di partenza)' });
    else if (W.spawnCount > 1) errors.push({ code: 'spawn-multiple', msg: 'Più di uno slot spawn (' + W.spawnCount + ')' });

    // slot su celle non camminabili (i gate DEVONO stare su celle di passaggio camminabili)
    (Array.isArray(plan.slots) ? plan.slots : []).forEach(function (s) {
      if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.z)) return;
      if (W.grid.map[s.x + ',' + s.z] !== 0) {
        errors.push({ code: 'slot-blocked', msg: 'Slot ' + s.type + ' su cella non calpestabile', at: [s.x, s.z] });
      }
    });

    // ogni gate separa DAVVERO due aree
    W.gates.forEach(function (g) {
      if (g.onWalkable && g.zoneIdx.length < 2) {
        var p = g.key.split(',');
        errors.push({ code: 'gate-not-boundary', msg: 'Il gate in (' + g.key + ') non separa due aree', at: [+p[0], +p[1]] });
      }
    });

    // raggiungibilità con porte: BFS sul grafo delle zone (i gate sono archi)
    if (W.spawnIdx != null) {
      var seen = {}; seen[W.spawnIdx] = 1;
      var q = [W.spawnIdx];
      while (q.length) {
        var zi = q.shift();
        W.gates.forEach(function (g) {
          if (g.zoneIdx.indexOf(zi) < 0) return;
          g.zoneIdx.forEach(function (o) { if (!seen[o]) { seen[o] = 1; q.push(o); } });
        });
      }
      W.zones.forEach(function (z, idx) {
        if (!seen[idx]) errors.push({ code: 'zone-unreachable', msg: 'La zona ' + z.id + ' non è raggiungibile dallo spawn attraverso i gate' });
      });
    }

    // gatekeeper (boss di mondo): al massimo uno
    if (W.gatekeeperCount > 1) errors.push({ code: 'gatekeeper-multiple', msg: 'Più di un Guardiano finale (' + W.gatekeeperCount + ')' });

    // sanità dei req dei gate (default D2 se assente o rotto)
    W.gates.forEach(function (g) {
      var r = g.req;
      if (!r) return;
      var bad = (r.coverage != null && !(r.coverage >= 0 && r.coverage <= 1)) ||
                (r.quiz != null && !(Number.isInteger(r.quiz) && r.quiz >= 1)) ||
                (r.mastery != null && !(r.mastery >= 0 && r.mastery <= 1));
      if (bad) warnings.push({ code: 'gate-req-invalid', msg: 'Requisito del gate (' + g.key + ') non valido: si userà il default (coverage ' + WORLD_GATE_DEFAULT.coverage + ' + quiz ' + WORLD_GATE_DEFAULT.quiz + ')' });
    });

    // zone senza memorie (la zona di spawn è il giardino: esclusa, D7)
    W.zones.forEach(function (z, idx) {
      if (idx !== W.spawnIdx && z.memory === 0) {
        warnings.push({ code: 'zone-no-memory', msg: 'La zona ' + z.id + ' non ha slot memoria' });
      }
    });

    // coverage per ZONA (= ramo, non level) se i conteggi rami sono noti
    if (Array.isArray(branches) && branches.length) {
      var B = bindZones(W.zones, branches);
      var coverage = (R.memory && R.memory.coverage != null) ? R.memory.coverage : DEFAULT_RULESET.memory.coverage;
      W.zones.forEach(function (z, idx) {
        var br = B.assignments[z.id];
        if (!br) return;   // zona senza ramo (giardino, terre di nessuno): nessun vincolo
        if (idx === W.spawnIdx && !z.declared) return;   // giardino non dichiarato: esente
        var need = (coverage && coverage.min != null) ? coverage.min : br.count;
        if (z.memory < need) {
          bucketOf('coverage').push({ code: 'zone-memory-missing', msg: 'Zona ' + z.id + ' (' + br.label + '): ' + z.memory + ' memorie su ' + need + ' richieste', need: need, have: z.memory });
        } else if (coverage === 'all' && z.memory > need) {
          bucketOf('coverage').push({ code: 'zone-memory-extra', msg: 'Zona ' + z.id + ' (' + br.label + '): ' + z.memory + ' memorie ma il ramo ne ha ' + need, need: need, have: z.memory });
        }
      });
    }

    // cap nemici globale (come §4)
    var enemiesMax = (R.enemies && R.enemies.max != null) ? R.enemies.max : DEFAULT_RULESET.enemies.max;
    var totEnemy = W.zones.reduce(function (a, z) { return a + z.enemy; }, 0);
    if (totEnemy > enemiesMax) bucketOf('enemiesMax').push({ code: 'enemies-max', msg: 'Troppi nemici: ' + totEnemy + ' (max ' + enemiesMax + ')' });

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  var CORE = {
    capEvents: capEvents,
    strHash: strHash,
    validQuizItem: validQuizItem,
    zpdFormat: zpdFormat,
    stratifiedPick: stratifiedPick,
    pickTier: pickTier,
    buildParentOf: buildParentOf,
    findBestChain: findBestChain,
    clozeGaps: clozeGaps,
    pickMisfiled: pickMisfiled,
    planToGrid: planToGrid,
    stepKindGrid: stepKindGrid,
    findPathQuota: findPathQuota,
    reachableCells: reachableCells,
    STEP_UP_WALK: STEP_UP_WALK,
    STEP_UP_JUMP: STEP_UP_JUMP,
    normalizePlanSlots: normalizePlanSlots,
    assignMemorySlots: assignMemorySlots,
    validatePlan: validatePlan,
    worldZones: worldZones,
    bindZones: bindZones,
    validateWorld: validateWorld,
    checkGateReq: checkGateReq,
    WORLD_GATE_DEFAULT: WORLD_GATE_DEFAULT
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIDungeonCore = CORE;
  console.log('[MappAIDungeonCore] logica pura Memory Dungeon caricata');
})();
