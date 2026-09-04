/*
 * mappai-dungeon-core.js — validatore PURO dei piani a griglia (testabile in Node)
 * ---------------------------------------------------------------------------
 * Resto del Memory Dungeon dopo la sua eliminazione (4/9/26): il Knowledge Garden
 * (tools/voxel-proto: studio.html, editor.js) valida i piani dell'editor con
 * validatePlan e legge STEP_UP_JUMP. Contratto: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md.
 * Nessun accesso a DOM/localStorage/appState.
 *
 * Modulo UMD: module.exports per `node --test`, window.MappAIDungeonCore per il browser.
 */
(function () {
  'use strict';

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

  var CORE = {
    planToGrid: planToGrid,
    stepKindGrid: stepKindGrid,
    findPathQuota: findPathQuota,
    reachableCells: reachableCells,
    STEP_UP_WALK: STEP_UP_WALK,
    STEP_UP_JUMP: STEP_UP_JUMP,
    normalizePlanSlots: normalizePlanSlots,
    validatePlan: validatePlan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIDungeonCore = CORE;
})();
