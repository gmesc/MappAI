/*
 * mappai-map-loader.js — parser PURO delle mappe del map-editor (testabile in Node)
 * ---------------------------------------------------------------------------------
 * Converte il JSON v2 dell'editor (tools/assets-manager/map-editor) nella struttura
 * runtime che mappai-games.js usa per il piano giardino/hub:
 *   parseMap(json) → {
 *     cols, rows, tile,
 *     ground, over,          // matrici row-major di {ts,c,r} | null
 *     map,                   // {'x,y': 0 walkable | 1 solido} (formato DUN.map)
 *     water,                 // {'x,y': true} celle d'acqua (per riflessi/anatre)
 *     spawn: [x,y],          // dal JSON, oppure derivato dall'apertura sud
 *     gatekeeper: {x,y}|null,// discesa/guardiano (rilocato su cella walkable)
 *     npcs:  [{name,x,y}],   // slot Sapienti (sapiente-*, merchant, mage) rilocati
 *     decor: [{name,x,y}],   // oggetti scenografici (alberi, cespugli, lanterne…)
 *     ambient:[{name,x,y}],  // animali/oggettini non bloccanti
 *     anchors:[{name,x,y}]   // ancore memory (book/scroll/chest/key/container)
 *   }
 * Walkability: acqua e muri su ground, siepe su over, oggetti solidi → celle 1.
 * Coordinate tile verificate in tools/assets-manager/map-editor/index.html (TERRAINS)
 * e tools/assets-manager/atlas/tileset_atlas.json.
 *
 * Modulo UMD (pattern di mappai-dungeon-core.js): module.exports per `node --test`,
 * window.MappAIMapLoader per il browser. Zero DOM/localStorage/appState.
 */
(function () {
  'use strict';

  // tile solidi sul layer ground (overworld): acqua pond editor [16,1], acqua LoL [0,1], muro-Zelda [33,17/18],
  // vasca su erba scura [3,7] + bordi schiuma [3,6]/[2,7]/[4,7]/[3,8] + isola prefab [2..3,9..10] (hubgen rR)
  var SOLID_GROUND = { '16,1': 1, '0,1': 1, '33,17': 1, '33,18': 1,
    '3,7': 1, '3,6': 1, '2,7': 1, '4,7': 1, '3,8': 1,
    '2,9': 1, '3,9': 1, '2,10': 1, '3,10': 1 };
  // tile siepe (LUT edge4 dell'editor, layer over) → solidi
  var SIEPE_OVER = {
    '2,14': 1, '2,13': 1, '1,14': 1, '3,14': 1, '2,15': 1,
    '1,13': 1, '3,13': 1, '1,15': 1, '3,15': 1,
    '0,15': 1, '0,14': 1, '0,16': 1, '1,16': 1
  };
  // classificazione oggetti per nome
  var NPC_SLOTS = { 'sapiente-viola': 1, 'sapiente-rosso': 1, 'sapiente-blu': 1, 'sapiente-ocra': 1, merchant: 1, mage: 1 };
  var SOLID_OBJ = {
    tree: 1, tree2: 1, 'tree-oak': 1, 'tree-oak-autumn': 1, 'tree-tall': 1, 'tree-tall-autumn': 1,
    'tree-pine': 1, 'tree-old': 1, bush: 1, breakableRock: 1, breakableWall: 1,
    chestClosed: 1, chestOpen: 1, chestBigClosed: 1, chestBigOpen: 1, lockedDoor: 1, lantern: 1, container: 1
  };
  var ANCHOR_OBJ = { book: 1, scroll: 1, chestClosed: 1, chestBigClosed: 1, key: 1, container: 1 };

  function _layer(json, name) {
    var ls = json.layers || [];
    for (var i = 0; i < ls.length; i++) if (ls[i].name === name) return ls[i].data || null;
    return null;
  }
  function _tk(cell) { return cell ? cell.c + ',' + cell.r : ''; }

  // BFS: prima cella walkable a partire da (x,y) — per rilocare ancore finite su acqua/siepe
  function nearestWalkable(map, cols, rows, x, y, occupied) {
    var seen = {}, q = [[x, y]], dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
      var c = q.shift(), k = c[0] + ',' + c[1];
      if (seen[k]) continue;
      seen[k] = 1;
      if (map[k] === 0 && !(occupied && occupied[k])) return c;
      for (var d = 0; d < 4; d++) {
        var nx = c[0] + dirs[d][0], ny = c[1] + dirs[d][1];
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[nx + ',' + ny]) q.push([nx, ny]);
      }
    }
    return null;
  }

  // spawn = apertura sud (composition rule R11): cella walkable dell'ultima riga più vicina
  // al centro; il player parte una riga dentro se libera. Fallback: prima walkable dal basso.
  function deriveSpawn(map, cols, rows) {
    var best = null, bd = 1e9, cx = (cols - 1) / 2;
    for (var x = 0; x < cols; x++) {
      if (map[x + ',' + (rows - 1)] !== 0) continue;
      var d = Math.abs(x - cx);
      if (d < bd) { bd = d; best = x; }
    }
    if (best !== null) return map[best + ',' + (rows - 2)] === 0 ? [best, rows - 2] : [best, rows - 1];
    for (var y = rows - 1; y >= 0; y--) for (var x2 = 0; x2 < cols; x2++) if (map[x2 + ',' + y] === 0) return [x2, y];
    return [Math.floor(cols / 2), Math.floor(rows / 2)];
  }

  function parseMap(json) {
    if (!json || !json.layers || !json.cols || !json.rows) return null;
    var cols = json.cols, rows = json.rows;
    var ground = _layer(json, 'ground'), over = _layer(json, 'over');
    if (!ground) return null;
    var map = {}, water = {};
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var k = x + ',' + y, g = ground[y] && ground[y][x], o = over && over[y] && over[y][x];
        var solid = 0;
        if (g && SOLID_GROUND[_tk(g)]) { solid = 1; if (_tk(g) === '16,1' || _tk(g) === '0,1' || _tk(g) === '3,7') water[k] = true; }
        if (o && SIEPE_OVER[_tk(o)]) solid = 1;
        map[k] = solid;
      }
    }
    var npcs = [], decor = [], ambient = [], anchors = [], gatekeeper = null, occupied = {};
    (json.objects || []).forEach(function (ob) {
      if (!ob || typeof ob.x !== 'number' || typeof ob.y !== 'number') return;
      if (ob.name === 'gatekeeper') { gatekeeper = { x: ob.x, y: ob.y }; return; }
      // slot NPC: i nomi noti + qualsiasi 'sapiente-*' (mappe curate con più di 4 Sapienti)
      if (NPC_SLOTS[ob.name] || /^sapiente-/.test(ob.name)) { npcs.push({ name: ob.name, x: ob.x, y: ob.y }); return; }
      if (ANCHOR_OBJ[ob.name]) anchors.push({ name: ob.name, x: ob.x, y: ob.y });
      if (SOLID_OBJ[ob.name]) { decor.push({ name: ob.name, x: ob.x, y: ob.y }); map[ob.x + ',' + ob.y] = 1; }
      else if (!ANCHOR_OBJ[ob.name]) ambient.push({ name: ob.name, x: ob.x, y: ob.y });
    });
    // rilocazione: NPC/gatekeeper finiti su celle solide o in acqua (mappe pre-validatore)
    function relocate(pt) {
      var k = pt.x + ',' + pt.y;
      if (map[k] === 0 && !occupied[k]) { occupied[k] = 1; return pt; }
      var nw = nearestWalkable(map, cols, rows, pt.x, pt.y, occupied);
      if (nw) { pt.x = nw[0]; pt.y = nw[1]; occupied[nw[0] + ',' + nw[1]] = 1; }
      return pt;
    }
    npcs.forEach(relocate);
    if (gatekeeper) relocate(gatekeeper);
    var spawn = (json.spawn && json.spawn.length === 2 && map[json.spawn[0] + ',' + json.spawn[1]] === 0)
      ? [json.spawn[0], json.spawn[1]] : deriveSpawn(map, cols, rows);
    return {
      cols: cols, rows: rows, tile: json.tile || 16,
      ground: ground, over: over,
      map: map, water: water, spawn: spawn,
      gatekeeper: gatekeeper, npcs: npcs, decor: decor, ambient: ambient, anchors: anchors
    };
  }

  // selezione stabile per-vault: stesso progetto → stesso giardino (identità del luogo)
  function pickMapIndex(seedStr, n) {
    var s = String(seedStr || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return n > 0 ? Math.abs(h) % n : 0;
  }

  var API = {
    parseMap: parseMap,
    deriveSpawn: deriveSpawn,
    nearestWalkable: nearestWalkable,
    pickMapIndex: pickMapIndex,
    SOLID_GROUND: SOLID_GROUND,
    SIEPE_OVER: SIEPE_OVER,
    NPC_SLOTS: NPC_SLOTS,
    SOLID_OBJ: SOLID_OBJ,
    ANCHOR_OBJ: ANCHOR_OBJ
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined') return;
  window.MappAIMapLoader = API;
  console.log('[MappAIMapLoader] parser mappe editor caricato');
})();
