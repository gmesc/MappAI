/* ============================================================================
 * mappai-games.js — MEMORY DUNGEON (gioco di studio)
 * Design completo: docs/game-design/MEMORY_DUNGEON_DESIGN.md
 * ----------------------------------------------------------------------------
 * Loop: piani=livelli nodi → stanze con device → SBLOCCO (WM/calcolo) →
 *   estrai memory unit → CATTURA (diario) → DOOR KEEPER → BOSS → heatmap → reveal.
 *
 * STATO IMPLEMENTAZIONE (build incrementale, "fresco su rot.js"):
 *   [SLICE 1 ✓] Sblocco device: sequenza simboli + calcolo, difficoltà adattiva, WM.
 *   [SLICE 2 ✓] Esplorazione rot.js (piani=livelli, fog, device) + duello F/J + diario.
 *   [SLICE 3 ✓] Door keeper (gate quiz).
 *   [SLICE 4 ✓] CATTURA ATTIVA (sintesi/TTS, gap #1) + BOSS Guardiano + heatmap + reveal (gap #3).
 *       TODO residuo: spaced retrieval nel gate (gap), telemetria unificata, mapping KG.
 *
 * Reversibile: gated da flag 'mappai_games_enabled' (console funziona comunque).
 * Prova lo sblocco:  MappAIGames.testUnlock()
 * ==========================================================================*/
(function () {
  'use strict';
  function _tSafe(k, f) { return (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t(k, f) : f; }
  function _dgEn() { try { return (typeof window !== 'undefined' && window.getMapLanguage && window.getMapLanguage() === 'en'); } catch (e) { return false; } }
  if (typeof window === 'undefined') return;

  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─────────────────────────── helper condivisi ──────────────────────────────
  function _getAppState() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function _desc(n) { return _clean((n && (n.desc || n.content)) || ''); }
  // taglio "morbido": mai a metà parola/frase — chiude all'ultima frase o parola intera prima di max
  function _softCut(s, max) { s = String(s || '').trim(); if (s.length <= max) return s; var c = s.slice(0, max), d = c.lastIndexOf('. '); if (d > max * 0.5) return c.slice(0, d + 1); var sp = c.lastIndexOf(' '); return (sp > 0 ? c.slice(0, sp) : c) + '…'; }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t); else console.log('[memory-dungeon]', m); }
  function _M() { return window.MappAIMastery || null; }
  function _mnode(id) { try { return _M() ? _M().node(id) : null; } catch (e) { return null; } }
  function _level(id) { var m = _M(); return (m && m.masteryLevel) ? m.masteryLevel(_mnode(id)) : 'nuovo'; }
  function _mastered(id) { var l = _level(id); return l === 'acquisito' || l === 'fluente'; }

  // sprite sheet loader (asset 8-bit in public/assets/rogue8x8). char/item: cella 8 + gap 1; tileset: 16×16.
  var _SHEETS = {};
  function _sheet(n) { if (!_SHEETS[n]) { var i = new Image(); i.src = 'assets/' + n; _SHEETS[n] = i; } return _SHEETS[n]; }
  function _ready(img) { return img && img.complete && img.naturalWidth > 0; }
  function _cd(ctx, sheet, sk, cell, dx, dy, TS) { var U = sk.cell + sk.gap; ctx.drawImage(sheet, cell[0] * U, cell[1] * U, sk.cell, sk.cell, dx, dy, TS, TS); }
  var THEMES = [
    { n: 'pietra', t: '#9aa0ad' }, { n: 'muschio', t: '#79a85f' }, { n: 'sotterraneo', t: '#a07f55' },
    { n: 'ghiaccio', t: '#a8d8ec' }, { n: 'acqua', t: '#5f9ad6' }, { n: 'magma', t: '#d76a35' }
  ];
  // tile [col,row] nel tileset Fantastic Dungeons (16×16) — da data.js originale
  var THEME_TILES = {
    pietra: { floor: [3, 1], wall: [2, 5] }, muschio: { floor: [7, 0], wall: [0, 5] },
    sotterraneo: { floor: [0, 6], wall: [1, 4] }, ghiaccio: { floor: [6, 7], wall: [3, 6] },
    acqua: { floor: [6, 8], wall: [7, 2] }, magma: { floor: [1, 6], wall: [4, 12] }
  };
  var PLAYER_ANIM = [[23, 0], [24, 0], [25, 0], [24, 0]];      // player_male (data.js 7drl-2016)
  var PLAYER_ANIM_F = [[26, 0], [27, 0], [28, 0], [27, 0]];    // player_female
  // nemici (coord base [col,row] da data.js; anim 4-frame [c-1,c,c+1,c])
  var ENEMIES = [
    { n: 'Scheletro', c: 30, r: 0 }, { n: 'Pipistrello', c: 24, r: 1 }, { n: 'Fantasma', c: 27, r: 1 },
    { n: 'Ragno', c: 30, r: 1 }, { n: 'Goblin', c: 27, r: 2 }, { n: 'Ratto', c: 30, r: 2 },
    { n: 'Golem', c: 24, r: 3 }, { n: 'Mummia', c: 27, r: 3 }, { n: 'Teschio', c: 30, r: 3 }
  ];
  function _mobAnim(e) { return [[e.c - 1, e.r], [e.c, e.r], [e.c + 1, e.r], [e.c, e.r]]; }
  var SKELETON_TILE = [30, 0];   // corpo → scheletro
  var ITEM_TILES = { coin: [8, 9], gem: [11, 9], potion_green: [8, 13], potion_blue: [8, 13] }; // coord REALI da data.js: coin[8,9] gem[11,9] potion[8,13] (unico sprite pozione)

  // ───────── SKIN del Memory Dungeon ─────────
  // Reversibile: localStorage 'mappai_dungeon_skin' = 'voxel' (DEFAULT, §19 F2: 3D three.js
  // con sprite PNG animati) | 'lol' (2D top-down Legend of Lua) | 'fantastic' (vecchio tileset).
  // Se il voxel non è disponibile (THREE assente) o va in errore → fallback automatico a 'lol'.
  // Tileset LoL = 16×16, gap 0; sprite-file singoli di dimensioni varie (vedi LOL.spr).
  function _skin() { try { return localStorage.getItem('mappai_dungeon_skin') || 'voxel'; } catch (e) { return 'voxel'; } }
  var LOL = {
    // bioma → tileset + coord [col,row] di pavimento/muro/acqua (verificate a video 2026-06-29)
    biomes: {
      giardino: { sheet: 'legendoflua/tilesets/overworld.png', floor: [0, 0], wall: [11, 5], water: [0, 1] },
      foresta:  { sheet: 'legendoflua/tilesets/overworld.png', floor: [0, 0], wall: [11, 5], water: [0, 1] },
      interni:  { sheet: 'legendoflua/tilesets/inner.png',     floor: [1, 3], wall: [0, 1],  water: null },
      caverna:  { sheet: 'legendoflua/tilesets/cave.png',      floor: [2, 2], wall: [1, 0],  water: [1, 7] },
      // S4: borgo — erba + muro mattone tan (coord verificate in tools/assets-manager/atlas) + fiori come decal sparso
      villaggio: { sheet: 'legendoflua/tilesets/overworld.png', floor: [0, 10], wall: [33, 18], water: [0, 1], decals: [[2, 11], [3, 11]], decalPct: 6 }
    },
    player: { sheet: 'legendoflua/sprites/player/playerSheet', fw: 19, fh: 21 },   // +outfit+'.png'; griglia 5×10: riga0 down, riga1 up, riga7 idle
    spr: {  // sprite-file singoli: {s:path, fw,fh frame, n:numero frame in orizzontale}
      chestClosed: { s: 'legendoflua/sprites/environment/chestClosed.png', fw: 15, fh: 19, n: 1 },
      chestOpen:   { s: 'legendoflua/sprites/environment/chestOpen.png',   fw: 15, fh: 19, n: 1 },
      vaso:        { s: 'legendoflua/sprites/items/container.png',         fw: 12, fh: 11, n: 1 },
      door:        { s: 'legendoflua/sprites/environment/lockedDoor.png',  fw: 16, fh: 24, n: 1 },
      coin:        { s: 'legendoflua/sprites/items/coin.png',              fw: 8,  fh: 8,  n: 1 },
      gem:         { s: 'legendoflua/sprites/items/key.png',               fw: 8,  fh: 13, n: 1 },
      potion:      { s: 'legendoflua/sprites/items/heart.png',             fw: 11, fh: 10, n: 1 },
      book:        { s: 'legendoflua/sprites/items/book.png',              fw: 16, fh: 16, n: 2 },   // memory-item libro: frame0 chiuso, frame1 aperto (catturato)
      scroll:      { s: 'legendoflua/sprites/items/scroll.png',            fw: 16, fh: 16, n: 2 },   // memory-item scroll: frame0 arrotolato, frame1 aperto
      bat:         { s: 'legendoflua/sprites/enemies/bat.png',             fw: 16, fh: 16, n: 2 },
      skeleton:    { s: 'legendoflua/sprites/enemies/skeleton/knife.png',  fw: 20, fh: 24, n: 2 },
      mage:        { s: 'legendoflua/sprites/enemies/skeleton/mage.png',   fw: 20, fh: 24, n: 3 },
      guardian:    { s: 'legendoflua/sprites/enemies/boss_guardian.png',   fw: 32, fh: 32, n: 4 },   // BOSS "Guardiano della Memoria" (custom, palette LoL)
      corpse:      { s: 'legendoflua/sprites/enemies/batDead.png',         fw: 16, fh: 16, n: 1 },
      npc:         { s: 'legendoflua/sprites/npc/merchant.png',            fw: 16, fh: 23, n: 1 },
      custode:     { s: 'legendoflua/sprites/npc/sapiente-viola.png',      fw: 16, fh: 23, n: 1 },   // HUB S2: Custode del Sapere
      tree:        { s: 'legendoflua/sprites/environment/tree.png',        fw: 63, fh: 62, n: 1 },
      lantern:     { s: 'legendoflua/sprites/items/lantern.png',           fw: 16, fh: 16, n: 1 }    // S4: totem FE nelle radure
    }
  };
  // tile decorativi del giardino (coord nel tileset overworld): erba fiorita come accento
  var LOL_GARDEN = { flower: [0, 5] };
  // ───────── MAPPA CURATA del giardino (map-editor → runtime, hub "Giardino dei Sapienti") ─────────
  // JSON in public/assets/maps/ (schema v2 dell'editor, parse in mappai-map-loader.js).
  // Flag 'mappai_garden_map' (default ON). OFF, parse fallito o skin≠lol → giardino procedurale.
  var GARDEN_MAPS = ['giardino1_chiostro', 'giardino2_radura', 'giardino3_ruscello', 'giardino4_quattro', 'giardino5_lago'];
  // sprite oggetti dell'editor: nome → def formato LOL.spr (dimensioni verificate sui PNG 4/7/26)
  var CMAP_SPR = {
    'tree-oak':         { s: 'legendoflua/sprites/environment/tree-oak.png', fw: 64, fh: 64, n: 1 },
    'tree-oak-autumn':  { s: 'legendoflua/sprites/environment/tree-oak-autumn.png', fw: 64, fh: 64, n: 1 },
    'tree-tall':        { s: 'legendoflua/sprites/environment/tree-tall.png', fw: 64, fh: 64, n: 1 },
    'tree-tall-autumn': { s: 'legendoflua/sprites/environment/tree-tall-autumn.png', fw: 64, fh: 64, n: 1 },
    'tree-pine':        { s: 'legendoflua/sprites/environment/tree-pine.png', fw: 64, fh: 64, n: 1 },
    'tree-old':         { s: 'legendoflua/sprites/environment/tree-old.png', fw: 63, fh: 62, n: 1 },
    tree:               { s: 'legendoflua/sprites/environment/tree.png', fw: 63, fh: 62, n: 1 },
    tree2:              { s: 'legendoflua/sprites/environment/tree2.png', fw: 63, fh: 62, n: 1 },
    bush:               { s: 'legendoflua/sprites/environment/bush.png', fw: 64, fh: 64, n: 1 },
    breakableRock:      { s: 'legendoflua/sprites/environment/breakableRock.png', fw: 32, fh: 26, n: 1 },
    breakableWall:      { s: 'legendoflua/sprites/environment/breakableWall.png', fw: 16, fh: 32, n: 1 },
    key:                { s: 'legendoflua/sprites/items/key.png', fw: 8, fh: 13, n: 1 },
    'animal-cat':       { s: 'legendoflua/sprites/environment/animal-cat.png', fw: 14, fh: 11, n: 1 },
    'animal-chicken':   { s: 'legendoflua/sprites/environment/animal-chicken.png', fw: 13, fh: 12, n: 1 },
    'animal-duck':      { s: 'legendoflua/sprites/environment/animal-duck.png', fw: 13, fh: 10, n: 1 },
    'animal-frog':      { s: 'legendoflua/sprites/environment/animal-frog.png', fw: 13, fh: 10, n: 1 },
    'animal-butterfly': { s: 'legendoflua/sprites/environment/animal-butterfly.png', fw: 13, fh: 11, n: 1 }
  };
  // gli oggetti già noti a LOL.spr riusano quelle def
  CMAP_SPR.chestClosed = LOL.spr.chestClosed; CMAP_SPR.chestOpen = LOL.spr.chestOpen;
  CMAP_SPR.lockedDoor = LOL.spr.door; CMAP_SPR.container = LOL.spr.vaso;
  CMAP_SPR.book = LOL.spr.book; CMAP_SPR.scroll = LOL.spr.scroll;
  CMAP_SPR.lantern = LOL.spr.lantern; CMAP_SPR.coin = LOL.spr.coin; CMAP_SPR.heart = LOL.spr.potion;
  // slot NPC-contenuto della mappa curata → 4 Sapienti distinti (il viola resta il Custode)
  var CMAP_NPC_SPR = [
    { s: 'legendoflua/sprites/npc/sapiente-rosso.png', fw: 16, fh: 23, n: 1 },
    { s: 'legendoflua/sprites/npc/sapiente-blu.png', fw: 16, fh: 23, n: 1 },
    { s: 'legendoflua/sprites/npc/sapiente-ocra.png', fw: 16, fh: 23, n: 1 },
    { s: 'legendoflua/sprites/npc/merchant.png', fw: 16, fh: 23, n: 1 }
  ];
  function _gardenMapOn() { try { return localStorage.getItem('mappai_garden_map') !== '0' && !!window.MappAIMapLoader; } catch (e) { return !!window.MappAIMapLoader; } }
  // stesso progetto → stesso giardino (identità del luogo); cache promise per nome
  function _gardenMapName() {
    var st = _getAppState(), seed = (st && st.rootNodeLabel) || '';
    var L = window.MappAIMapLoader;
    return GARDEN_MAPS[L ? L.pickMapIndex(seed, GARDEN_MAPS.length) : 0];
  }
  var _gmapP = {};
  function _gardenMapFetch() {
    if (!_gardenMapOn()) return Promise.resolve(null);
    var name = _gardenMapName();
    if (!_gmapP[name]) {
      _gmapP[name] = fetch('assets/maps/' + name + '.json')
        .then(function (r) { return r.json(); })
        .then(function (j) { return window.MappAIMapLoader.parseMap(j); })
        .catch(function (e) { console.warn('[giardino] mappa curata non caricata, uso procedurale:', e); return null; });
    }
    return _gmapP[name];
  }
  // bioma per piano. v2 (S4, flag 'mappai_biomes_v2' default ON): kind+profondità →
  // giardino → foresta → villaggio → interni → caverna; radura=foresta, scuola=villaggio.
  // A '0' → mapping storico (foresta/interni/caverna a frazione).
  function _biomesV2On() { try { return localStorage.getItem('mappai_biomes_v2') !== '0'; } catch (e) { return true; } }
  function _lolBiome(i) {
    if (!DUN) return LOL.biomes.foresta;
    var f = DUN.floors[i] || DUN.floors[DUN.fi] || {};
    if (f.kind === 'giardino') return LOL.biomes.giardino;
    var nf = DUN.floors.length || 1, frac = nf <= 1 ? 0 : i / (nf - 1);
    if (!_biomesV2On()) return frac < 0.34 ? LOL.biomes.foresta : (frac < 0.7 ? LOL.biomes.interni : LOL.biomes.caverna);
    if (f.kind === 'scuola') return LOL.biomes.villaggio;
    if (f.kind === 'radura') return LOL.biomes.foresta;
    if (frac < 0.25) return LOL.biomes.foresta;
    if (frac < 0.5) return LOL.biomes.villaggio;
    if (frac < 0.75) return LOL.biomes.interni;
    return LOL.biomes.caverna;
  }
  function _lolTile(ctx, sheet, c, TS, dx, dy) { ctx.drawImage(sheet, c[0] * 16, c[1] * 16, 16, 16, dx, dy, TS, TS); }
  function _cmapSheet(ts) { return _sheet('legendoflua/tilesets/' + (ts || 'overworld') + '.png'); }   // tileset per nome (mappe curate)
  // sprite-file: frame orizzontale, scala 1 tile=16 logici, centrato in x e con i "piedi" sul tile
  function _lolSpr(ctx, def, frame, TS, dx, dy, opt) {
    var img = _sheet(def.s); if (!_ready(img)) return false;
    var fr = (frame || 0) % (def.n || 1), sxp = fr * def.fw, sc = TS / 16;
    var dw = def.fw * sc, dh = def.fh * sc, ox = dx + (TS - dw) / 2, oy = dy + (TS - dh);
    if (!(opt && opt.noShadow)) _lolShadow(ctx, dx, dy, TS, Math.min(0.42, dw / TS * 0.28));
    if (opt && opt.flip) { ctx.save(); ctx.translate(ox + dw, oy); ctx.scale(-1, 1); ctx.drawImage(img, sxp, 0, def.fw, def.fh, 0, 0, dw, dh); ctx.restore(); }
    else ctx.drawImage(img, sxp, 0, def.fw, def.fh, ox, oy, dw, dh);
    return true;
  }
  // player: griglia multi-riga (down/up/idle), flip orizzontale per il movimento a sinistra
  function _lolPlayer(ctx, TS, dx, dy, moving, facing) {
    var img = _sheet(LOL.player.sheet + (DUN.lolOutfit || 1) + '.png'); if (!_ready(img)) return false;
    _lolShadow(ctx, dx, dy, TS, 0.28);
    var fw = LOL.player.fw, fh = LOL.player.fh, up = facing && facing[1] < 0;
    var row = moving ? (up ? 1 : 0) : 7, ncol = moving ? 2 : 4;
    var col = Math.floor(performance.now() / (moving ? 150 : 350)) % ncol;
    var sc = TS / 16, dw = fw * sc, dh = fh * sc, ox = dx + (TS - dw) / 2, oy = dy + (TS - dh);
    if (facing && facing[0] < 0) { ctx.save(); ctx.translate(ox + dw, oy); ctx.scale(-1, 1); ctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, dw, dh); ctx.restore(); }
    else ctx.drawImage(img, col * fw, row * fh, fw, fh, ox, oy, dw, dh);
    return true;
  }
  function _lolMobSpr(mo) { var n = mo.name || ''; return (n === 'Pipistrello' || n === 'Ratto' || n === 'Ragno') ? LOL.spr.bat : LOL.spr.skeleton; }
  // ───────── POLISH uso-asset (reversibile: localStorage 'mappai_dungeon_polish' = '1' default | '0' off) ─────────
  function _polish() { try { return localStorage.getItem('mappai_dungeon_polish') !== '0'; } catch (e) { return true; } }
  // ───────── MOVIMENTO QUOTA-AWARE (design §21) — kill-switch 'mappai_dungeon_quota' = '0' off ─────────
  function _quotaOn() { try { return localStorage.getItem('mappai_dungeon_quota') !== '0'; } catch (e) { return true; } }
  // §21 DQ1: mob territoriali — camminano solo, |Δquota| ≤ STEP_UP_WALK nei due versi
  function _mobStepOk(fx, fy, tx, ty) {
    if (!DUN.quota) return true;
    var C = _core(), w = (C && C.STEP_UP_WALK) || 0.9;
    var dq = (DUN.quota[tx + ',' + ty] || 0) - (DUN.quota[fx + ',' + fy] || 0);
    return dq <= w && dq >= -w;
  }
  // il duello ad adiacenza scatta solo se il dislivello mob↔player è camminabile
  function _mobEngage(m) { return !!m && _mobStepOk(m.x, m.y, DUN.px, DUN.py); }
  // offset verticale (px) del saltello nelle skin 2D — arco mezzo-seno di DUN.jumpFx
  function _jumpBump(TS) {
    var j = DUN.jumpFx; if (!j) return 0;
    var t = (Date.now() - j.t0) / (j.d || 320);
    if (t >= 1) { DUN.jumpFx = null; return 0; }
    return Math.round(Math.sin(Math.PI * t) * TS * 0.25);
  }
  // ───────── MOVIMENTO DA TASTIERA (WASD/frecce + SPAZIO — richiesta 7/7/26) ─────────
  // I tasti sono SCREEN-RELATIVE (W = su lo schermo, non "nord della griglia").
  // In skin 2D top-down su schermo = nord griglia. Nella skin voxel ISOMETRICA lo
  // schermo è ruotato ~45°: "su" corrisponde a un passo DIAGONALE sulla griglia
  // (es. (-1,-1)). Ricavo forward/right dallo yaw REALE della camera voxel → i
  // tasti restano corretti anche dopo Q/E (rotazione a quarti), senza hardcodare.
  function _sgn3(v) { return v > 0.35 ? 1 : (v < -0.35 ? -1 : 0); }
  function _screenToGrid(ix, iy) {   // ix:+1 destra/-1 sinistra · iy:+1 su/-1 giù (schermo)
    var Vx = window.MappAIDungeonVoxel;
    var iso = !!(Vx && Vx.active && Vx.active());
    if (!iso) return [_sgn3(ix), _sgn3(-iy)];   // 2D top-down: schermo = griglia
    var yaw = (Vx.yaw ? Vx.yaw() : Math.PI / 4);
    var fx = -Math.cos(yaw), fz = -Math.sin(yaw);   // "su schermo" proiettato sul terreno
    var rx = -fz, rz = fx;                            // "destra schermo" = forward ruotato +90°
    return [_sgn3(fx * iy + rx * ix), _sgn3(fz * iy + rz * ix)];
  }
  // esegue un passo di griglia (dx,dy possono essere diagonali in iso). Auto-throttle
  // via DUN.keyAt → chiamabile ad ogni frame durante l'hold.
  function _keyMove(dx, dy) {
    if (!DUN || DUN.busy || DUN.duel || (!dx && !dy)) return;
    var now = Date.now();
    if (DUN.keyAt && now - DUN.keyAt < (DUN.keyWait || 130)) return;   // cadenza tastiera
    DUN.keyAt = now; DUN.keyWait = 130;
    DUN.path = null;                                    // la tastiera annulla il click-to-move
    DUN.facing = [dx, dy];
    var nx = DUN.px + dx, ny = DUN.py + dy, nk = nx + ',' + ny;
    var mo = _mobAt(nx, ny);
    if (mo) { if (_mobEngage(mo)) _startDuel(mo); return; }
    if (DUN.gardenNpcs && DUN.gardenNpcs[nk]) { _openGardenNpc(DUN.gardenNpcs[nk]); return; }
    if (DUN.gateRoom && !DUN.gateRoom.passed && nx === DUN.gateRoom.bx && ny === DUN.gateRoom.by) { _gateRoomChallenge(); return; }
    if (DUN.world) { var wg = _worldGateAt(nx, ny); if (wg && !wg.open) { _gateTry(wg); return; } }
    if (DUN.map[nk] !== 0) return;
    if (DUN.quota) {   // §21: gradini/salto/discesa anche da tastiera
      var Ck2 = _core();
      var kind = (Ck2 && Ck2.stepKindGrid) ? Ck2.stepKindGrid(DUN.map, DUN.quota, DUN.px + ',' + DUN.py, nk) : 'walk';
      if (kind === 'blocked') { _msg(_tSafe('dg_cliff', '⛰ Troppo in alto (o in basso): serve una via con gradini.')); return; }
      if (kind === 'jump') { DUN.jumpFx = { x0: DUN.px, y0: DUN.py, x1: nx, y1: ny, t0: now, d: 320 }; DUN.keyWait = 320; _snd('powerup'); }
      else if (kind === 'fall') DUN.fallFx = { t0: now, d: 200 };
    }
    DUN.px = nx; DUN.py = ny;
    _computeFOV(); _checkPickup();
    var adj = [_mobAt(nx + 1, ny), _mobAt(nx - 1, ny), _mobAt(nx, ny + 1), _mobAt(nx, ny - 1)].filter(_mobEngage)[0];
    if (adj) { _startDuel(adj); return; }
    _arrive(nx, ny);
  }
  // HOLD: chiamata ad ogni tick — muove finché i tasti restano premuti (DUN.held).
  function _keyDrive() {
    if (!DUN || DUN.busy || DUN.duel || DUN.path) return;
    var h = DUN.held || {};
    var ix = (h.d ? 1 : 0) - (h.a ? 1 : 0), iy = (h.w ? 1 : 0) - (h.s ? 1 : 0);
    if (!ix && !iy) return;
    var d = _screenToGrid(ix, iy);
    _keyMove(d[0], d[1]);
  }
  // SPAZIO: salta il gradino di fronte (0.9 < dislivello ≤ 1.6); altrimenti saltello
  // sul posto — feedback visivo che il salto c'è ma qui non serve/non basta.
  function _keyJump() {
    if (!DUN || DUN.busy || DUN.duel) return;
    var now = Date.now();
    if (DUN.keyAt && now - DUN.keyAt < (DUN.keyWait || 130)) return;
    DUN.keyAt = now; DUN.keyWait = 320;
    var f = DUN.facing || [0, 1];
    var nx = DUN.px + f[0], ny = DUN.py + f[1], nk = nx + ',' + ny;
    var Ck3 = _core();
    var kind = (DUN.quota && Ck3 && Ck3.stepKindGrid)
      ? Ck3.stepKindGrid(DUN.map, DUN.quota, DUN.px + ',' + DUN.py, nk)
      : (DUN.map[nk] === 0 ? 'walk' : 'blocked');
    if (kind === 'jump' && !_mobAt(nx, ny)) {
      DUN.path = null;
      DUN.jumpFx = { x0: DUN.px, y0: DUN.py, x1: nx, y1: ny, t0: now, d: 320 }; _snd('powerup');
      DUN.px = nx; DUN.py = ny;
      _computeFOV(); _checkPickup(); _arrive(nx, ny);
    } else {
      DUN.jumpFx = { x0: DUN.px, y0: DUN.py, x1: DUN.px, y1: DUN.py, t0: now, d: 320 };
    }
  }
  // ombra-blob ai piedi dello sprite (toglie il "fluttuare"). wfrac = larghezza rispetto a TS.
  function _lolShadow(ctx, dx, dy, TS, wfrac) {
    if (!_polish()) return;
    ctx.save(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(dx + TS / 2, dy + TS - TS * 0.10, TS * (wfrac || 0.30), TS * 0.13, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  // vignette buia centrata sul player + luci su keeper/boss; solo biomi scuri (caverna/interni) o gate/boss
  function _lolDark(ctx, W, H, TS, camX, camY) {
    if (!_polish()) return;
    var bio = _lolBiome(DUN.fi);
    var dark = bio === LOL.biomes.caverna || bio === LOL.biomes.interni || DUN.gateRoom || (DUN.boss && !DUN.boss.defeated);
    if (!dark) return;
    var px = Math.round(DUN.px * TS - camX) + TS / 2, py = Math.round(DUN.py * TS - camY) + TS / 2;
    var g = ctx.createRadialGradient(px, py, TS * 1.3, px, py, TS * 4.6);
    g.addColorStop(0, 'rgba(6,4,12,0)'); g.addColorStop(0.6, 'rgba(6,4,12,0.34)'); g.addColorStop(1, 'rgba(4,2,10,0.88)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    function light(wx, wy, col) { var lx = Math.round(wx * TS - camX) + TS / 2, ly = Math.round(wy * TS - camY) + TS / 2, lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, TS * 2.2); lg.addColorStop(0, col); lg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); }
    if (DUN.gateRoom) light(DUN.gateRoom.bx, DUN.gateRoom.by, 'rgba(191,105,121,0.40)');
    if (DUN.boss && !DUN.boss.defeated) light(DUN.boss.x, DUN.boss.y, 'rgba(210,75,143,0.42)');
    ctx.restore();
  }
  // bolla interazione (pixel-art) sopra un'entità: '?' = keeper, '…' = npc
  function _lolBubble(ctx, dx, dy, TS, ch) {
    if (!_polish()) return;
    var w = Math.round(TS * 0.5), h = Math.round(TS * 0.4), x = Math.round(dx + TS / 2 - w / 2), y = Math.round(dy - h - 3);
    ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(x + Math.round(w / 2) - 2, y + h, 4, 4);
    ctx.fillStyle = '#222'; ctx.font = 'bold ' + Math.round(h * 0.78) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x + w / 2, y + h / 2 + 1); ctx.restore();
  }
  // variante testo del bubble (emote-bubble NPC: termine-chiave, priming passivo SDS §6)
  function _lolBubbleText(ctx, dx, dy, TS, txt) {
    if (!_polish() || !txt) return;
    var fs = Math.max(9, Math.round(TS * 0.28));
    ctx.save(); ctx.shadowBlur = 0; ctx.font = 'bold ' + fs + 'px monospace';
    var w = Math.round(ctx.measureText(txt).width) + 8, h = fs + 6;
    var x = Math.round(dx + TS / 2 - w / 2), y = Math.round(dy - h - 3);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#fffbe6'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(x + Math.round(w / 2) - 2, y + h, 4, 4);
    ctx.fillStyle = '#4a3a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 1); ctx.restore();
  }
  // banner boss in basso quando il Guardiano è visibile
  function _lolBossBar(ctx, W, H) {
    if (!_polish() || !DUN.boss || DUN.boss.defeated) return;
    if (!DUN.visible[DUN.boss.x + ',' + DUN.boss.y]) return;
    var bw = W * 0.6, bx = (W - bw) / 2, by = H - 30;
    ctx.save(); ctx.shadowBlur = 0; ctx.textAlign = 'center'; ctx.fillStyle = '#d7d2c7'; ctx.font = '12px monospace';
    ctx.fillText('⚔ GUARDIANO DELLA MEMORIA', W / 2, by - 4);
    ctx.fillStyle = '#2a1218'; ctx.fillRect(bx - 2, by, bw + 4, 10);
    ctx.fillStyle = '#d24b54'; ctx.fillRect(bx, by + 2, bw, 6);
    ctx.restore();
  }
  // STAGED (non attivo finché bio.decals non è definito + verificato per-biome): decal sparso deterministico
  function _lolDecal(ctx, sheet, bio, x, y, TS, sx, sy) {
    if (!_polish() || !bio.decals || !bio.decals.length) return;
    var hsh = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    if ((hsh % 100) >= (bio.decalPct || 7)) return;
    _lolTile(ctx, sheet, bio.decals[hsh % bio.decals.length], TS, sx, sy);
  }
  // libro e pergamena NON esistono nel tileset Fantastic Dungeons → disegnati a canvas (vettoriale)
  // per avere 3 oggetti-memoria distinti: forziere (tile chest), libro, pergamena.
  function _drawBook(ctx, dx, dy, TS, ext) {
    var p = TS * 0.16, x = dx + p, y = dy + p, w = TS - 2 * p, h = TS - 2 * p;
    ctx.save(); ctx.globalAlpha = ext ? 0.4 : 1;
    ctx.fillStyle = '#7c3a26'; ctx.fillRect(x, y, w, h);                                       // copertina
    ctx.fillStyle = '#f2e9d0'; ctx.fillRect(x + w * 0.18, y + h * 0.1, w * 0.74, h * 0.8);     // pagine
    ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = Math.max(1, TS * 0.03);
    for (var i = 1; i <= 3; i++) { var ly = y + h * 0.1 + h * 0.8 * i / 4; ctx.beginPath(); ctx.moveTo(x + w * 0.24, ly); ctx.lineTo(x + w * 0.86, ly); ctx.stroke(); }
    ctx.fillStyle = '#5e2b1c'; ctx.fillRect(x + w * 0.46, y, w * 0.08, h);                     // dorso
    ctx.restore();
  }
  function _drawScroll(ctx, dx, dy, TS, ext) {
    var p = TS * 0.18, x = dx + p, y = dy + p, w = TS - 2 * p, h = TS - 2 * p;
    ctx.save(); ctx.globalAlpha = ext ? 0.4 : 1;
    ctx.fillStyle = '#e7d6a6'; ctx.fillRect(x, y + h * 0.2, w, h * 0.6);                        // pergamena
    ctx.fillStyle = '#c8a566'; ctx.fillRect(x, y + h * 0.06, w, h * 0.16); ctx.fillRect(x, y + h * 0.78, w, h * 0.16); // rotoli
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = Math.max(1, TS * 0.025);
    for (var j = 0; j < 3; j++) { var sy = y + h * 0.34 + j * h * 0.13; ctx.beginPath(); ctx.moveTo(x + w * 0.2, sy); ctx.lineTo(x + w * 0.8, sy); ctx.stroke(); }
    ctx.restore();
  }

  // suoni (set 7drl-2016, libreria Kenney/LittleRobot — vedi credits.md)
  var SND_KEY = 'mappai_dungeon_sound', _AUDIO = {};
  function _soundOn() { return localStorage.getItem(SND_KEY) !== '0'; }   // default ON
  function _snd(name) { try { if (!_soundOn()) return; var a = _AUDIO[name]; if (!a) { a = new Audio('assets/fantasticdungeons/assets/sounds/' + name + '.ogg'); _AUDIO[name] = a; } a.currentTime = 0; a.play().catch(function () {}); } catch (e) {} }

  // ── combat: set di simboli/tasti + logica risposta (personalizzabili dal pannello) ──
  var COMBAT_SETS = {
    fj: { a: { sym: 'F', key: 'f' }, b: { sym: 'J', key: 'j' } },
    arrows: { a: { sym: '←', key: 'arrowleft' }, b: { sym: '→', key: 'arrowright' } }
  };
  function _combatCfg() {
    var keys = 'fj', mode = 'opposto';
    try { keys = localStorage.getItem('mappai_dungeon_combat_keys') || 'fj'; mode = localStorage.getItem('mappai_dungeon_combat_mode') || 'opposto'; } catch (e) {}
    if (!COMBAT_SETS[keys]) keys = 'fj';
    return { keys: keys, mode: (mode === 'diritto' ? 'diritto' : 'opposto'), set: COMBAT_SETS[keys] };
  }
  // fumetto nemico — pixel-art puro (rettangoli netti, niente curve → niente mixel). Dim. +100% (68×60 → 136×120).
  function _balloon(ctx, cx, baseY, letter) {
    var w = 136, h = 120, b = 6, x = Math.round(cx - w / 2), y = Math.round(baseY - h), cxr = Math.round(cx);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);   // outline nero a blocco
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);                            // fondo bianco
    // coda a gradini (pixel)
    ctx.fillStyle = '#000'; ctx.fillRect(cxr - 14, y + h, 28, 14); ctx.fillRect(cxr - 9, y + h + 14, 18, 10); ctx.fillRect(cxr - 4, y + h + 24, 8, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(cxr - 8, y + h, 16, 12); ctx.fillRect(cxr - 4, y + h + 12, 8, 9);
    ctx.fillStyle = '#111'; ctx.font = 'bold 84px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, cxr, y + h / 2);
  }

  // ─────────────────────────── persistenza skill + WM ────────────────────────
  var SKILL_KEY = 'mappai_dungeon_skill';   // { seq, calc }  livelli adattivi 1..7
  var WM_KEY = 'mappai_dungeon_wm';          // 0..100 misuratore memoria di lavoro
  function _skill() {
    try { return Object.assign({ seq: 1, calc: 1 }, JSON.parse(localStorage.getItem(SKILL_KEY) || '{}')); }
    catch (e) { return { seq: 1, calc: 1 }; }
  }
  function _saveSkill(s) { try { localStorage.setItem(SKILL_KEY, JSON.stringify(s)); } catch (e) {} }
  function _wm() { var v = parseFloat(localStorage.getItem(WM_KEY)); return isNaN(v) ? 0 : v; }
  function _saveWm(v) { try { localStorage.setItem(WM_KEY, String(Math.round(v))); } catch (e) {} }
  function _bumpLevel(kind, up) {
    var s = _skill();
    s[kind] = Math.max(1, Math.min(7, (s[kind] || 1) + (up ? 1 : -1)));
    _saveSkill(s); return s[kind];
  }
  // Quick win C/D — onboarding + modalità studio (combat opzionale)
  function _onboarded() { return localStorage.getItem('mappai_dungeon_onboarded') === '1'; }
  function _setOnboarded() { try { localStorage.setItem('mappai_dungeon_onboarded', '1'); } catch (e) {} }
  function _studyMode() { return localStorage.getItem('mappai_dungeon_study_mode') === '1'; }

  // ─────────────────────────── tabelle difficoltà ────────────────────────────
  var SEQ = { 1:[3,1500], 2:[3,1300], 3:[4,1300], 4:[4,1100], 5:[5,1000], 6:[5,900], 7:[6,800] }; // [span, esposizione ms]
  var CALC = {
    1:{ max:5,  terms:2, ops:'+',  timer:30 }, 2:{ max:9,  terms:2, ops:'+',  timer:28 }, 3:{ max:9,  terms:2, ops:'+-', timer:26 },
    4:{ max:20, terms:2, ops:'+-', timer:24 }, 5:{ max:20, terms:3, ops:'+-', timer:22 }, 6:{ max:50, terms:2, ops:'+-', timer:22 }
  };
  function _calcCfg(lv) { return CALC[Math.min(lv, 6)] || CALC[1]; }

  // ─────────────────────────── simboli (forme colorate) ──────────────────────
  // Distinguibili PER FORMA (non solo colore) → safe dislessia/color-blind.
  var SHAPES = ['circle', 'triangle', 'square', 'diamond', 'star', 'hexagon'];
  var COLORS = ['#2f6fdb', '#e8821c', '#3fae5a', '#d24b8f']; // blu, arancio, verde, rosa
  function _shapeSVG(shape, color, size) {
    var s = size || 54, c = s / 2, r = s * 0.40, p;
    function poly(n, rot) {
      var pts = [];
      for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; pts.push((c + r * Math.cos(a)).toFixed(1) + ',' + (c + r * Math.sin(a)).toFixed(1)); }
      return pts.join(' ');
    }
    if (shape === 'circle') p = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="' + color + '"/>';
    else if (shape === 'square') p = '<rect x="' + (c - r) + '" y="' + (c - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="3" fill="' + color + '"/>';
    else if (shape === 'triangle') p = '<polygon points="' + poly(3, -Math.PI / 2) + '" fill="' + color + '"/>';
    else if (shape === 'diamond') p = '<polygon points="' + poly(4, -Math.PI / 2) + '" fill="' + color + '"/>';
    else if (shape === 'hexagon') p = '<polygon points="' + poly(6, -Math.PI / 2) + '" fill="' + color + '"/>';
    else { // star
      var pts = [];
      for (var i = 0; i < 10; i++) { var rr = (i % 2 === 0) ? r : r * 0.45; var a = -Math.PI / 2 + i * Math.PI / 5; pts.push((c + rr * Math.cos(a)).toFixed(1) + ',' + (c + rr * Math.sin(a)).toFixed(1)); }
      p = '<polygon points="' + pts.join(' ') + '" fill="' + color + '"/>';
    }
    return '<svg viewBox="0 0 ' + s + ' ' + s + '" width="' + s + '" height="' + s + '" aria-hidden="true">' + p + '</svg>';
  }
  function _tokenId(t) { return t.shape + '|' + t.color; }
  function _randToken() { return { shape: SHAPES[Math.floor(Math.random() * SHAPES.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)] }; }

  // ─────────────────────────── overlay generico ──────────────────────────────
  function _overlay() {
    var root = document.createElement('div');
    root.className = 'mdg-ov';
    root.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(7,10,20,.82);font-family:system-ui,sans-serif';
    var card = document.createElement('div');
    card.style.cssText = 'width:min(440px,92vw);background:#0d1426;border:0.5px solid rgba(120,160,220,.45);border-radius:14px;padding:22px;color:#eaf2ff;box-shadow:0 12px 40px rgba(0,0,0,.5)';
    root.appendChild(card);
    document.body.appendChild(root);
    if (DUN) DUN.busy = true;   // blocca movimento mostri/duelli mentre un modal è aperto (fix: niente colpi durante i puzzle)
    return { root: root, card: card, close: function () { root.remove(); if (DUN) DUN.busy = false; } };
  }
  function _esc(fn) { function h(e) { if (e.key === 'Escape') { window.removeEventListener('keydown', h); fn(); } } window.addEventListener('keydown', h); return function () { window.removeEventListener('keydown', h); }; }

  // ─────────────────────────── SFIDA: sequenza simboli ───────────────────────
  function _runSequence(lv, done) {
    var cfg = SEQ[Math.min(lv, 7)] || SEQ[1], span = cfg[0];
    var wm = _wm();
    // velocità adattiva allo score WM: parte LENTA, accelera poco alla volta
    var expo = Math.max(600, cfg[1] - Math.round(wm * 3));
    // il COLORE entra solo con lo score: 1 colore all'inizio, poi 2, 3, 4
    var colorCount = Math.max(1, Math.min(COLORS.length, 1 + Math.floor(wm / 30)));
    var palette = COLORS.slice(0, colorCount);
    // pool di token DISTINTI (forma×colore attivo): la soluzione mostra solo questi
    var pool = [];
    SHAPES.forEach(function (sh) { palette.forEach(function (co) { pool.push({ shape: sh, color: co }); }); });
    pool.sort(function () { return Math.random() - 0.5; });
    var seq = []; for (var i = 0; i < span; i++) seq.push(pool[i % pool.length]);
    var t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { ov.close(); done({ success: false, aborted: true }); });
    function finish(res) { unEsc(); ov.close(); res.durationMs = Date.now() - t0; done(res); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Accesso memoria · sequenza · livello ' + lv + '</div>' +
      '<h3 style="margin:0 0 14px;font-size:17px;font-weight:500">Memorizza l\'ordine dei simboli</h3>' +
      '<div id="mdg-disp" style="height:90px;display:flex;align-items:center;justify-content:center"></div>' +
      '<div id="mdg-sub" style="font-size:12px;color:#8fa4c4;text-align:center;min-height:18px"></div>' +
      '<div id="mdg-board" style="display:none;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px"></div>' +
      '<div id="mdg-fb" style="text-align:center;font-size:14px;min-height:22px;margin-top:10px"></div>';
    var disp = ov.card.querySelector('#mdg-disp'), sub = ov.card.querySelector('#mdg-sub'),
        board = ov.card.querySelector('#mdg-board'), fb = ov.card.querySelector('#mdg-fb');

    // fase mostra
    var idx = 0;
    function showNext() {
      if (idx >= seq.length) { disp.innerHTML = ''; sub.textContent = ''; return inputPhase(); }
      sub.textContent = (idx + 1) + ' / ' + seq.length;
      disp.innerHTML = _shapeSVG(seq[idx].shape, seq[idx].color, 72);
      idx++;
      setTimeout(function () { disp.innerHTML = ''; setTimeout(showNext, RM ? 120 : 200); }, expo);
    }
    // fase input
    function inputPhase() {
      sub.textContent = _tSafe('dg_seq_sub', 'Ricomponi la sequenza');
      board.style.display = 'flex';
      // opzioni = ESATTAMENTE i token della sequenza (nessun intruso esterno)
      var tokens = seq.slice();
      tokens.sort(function () { return Math.random() - 0.5; });
      var pos = 0;
      tokens.forEach(function (t, n) {
        var b = document.createElement('button');
        b.style.cssText = 'background:#16203a;border:0.5px solid rgba(120,160,220,.35);border-radius:10px;padding:6px;cursor:pointer;line-height:0';
        b.innerHTML = _shapeSVG(t.shape, t.color, 46);
        b.setAttribute('aria-label', t.color + ' ' + t.shape);
        b.onclick = function () { pick(t, b); };
        b.dataset.k = (n + 1);
        board.appendChild(b);
      });
      function pick(t, b) {
        if (_tokenId(t) === _tokenId(seq[pos])) {
          b.style.borderColor = '#3fae5a'; pos++;
          fb.textContent = pos + ' / ' + seq.length;
          if (pos >= seq.length) { fb.innerHTML = '<span style="color:#3fae5a">✓ Accesso sbloccato</span>'; lock(); setTimeout(function () { finish({ success: true }); }, 650); }
        } else {
          b.style.borderColor = '#c0432c'; fb.innerHTML = '<span style="color:#e88">✗ Sequenza errata</span>'; lock();
          setTimeout(function () { finish({ success: false }); }, 800);
        }
      }
      function lock() { Array.prototype.forEach.call(board.querySelectorAll('button'), function (x) { x.disabled = true; x.style.cursor = 'default'; }); }
      // tastiera 1-9
      function key(e) { var n = parseInt(e.key, 10); if (n >= 1 && n <= tokens.length) { var btn = board.querySelector('[data-k="' + n + '"]'); if (btn && !btn.disabled) btn.click(); } }
      window.addEventListener('keydown', key);
      var oldFinish = finish; finish = function (r) { window.removeEventListener('keydown', key); oldFinish(r); };
    }
    setTimeout(showNext, 500);
  }

  // ─────────────────────────── SFIDA: calcolo mentale ────────────────────────
  function _runCalc(lv, done) {
    lv = Math.min(lv, 6);          // cap: mai oltre la complessità testata nella demo
    var cfg = _calcCfg(lv);
    var terms = cfg.terms, expr = '', acc = 0;
    var allowMinus = cfg.ops && cfg.ops.indexOf('-') >= 0;   // livelli iniziali = sola addizione
    for (var i = 0; i < terms; i++) {
      var n = 1 + Math.floor(Math.random() * cfg.max);
      if (i === 0) { acc = n; expr = String(n); }
      else { var minus = allowMinus && Math.random() < 0.5; if (minus && acc - n < 0) minus = false; acc = minus ? acc - n : acc + n; expr += (minus ? ' − ' : ' + ') + n; }
    }
    var answer = acc, t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { stop(); ov.close(); done({ success: false, aborted: true }); });
    var timer = null, raf = 0;
    function stop() { if (timer) clearTimeout(timer); if (raf) cancelAnimationFrame(raf); unEsc(); }
    function finish(res) { stop(); ov.close(); res.durationMs = Date.now() - t0; done(res); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Accesso memoria · calcolo · livello ' + lv + '</div>' +
      '<h3 style="margin:0 0 14px;font-size:17px;font-weight:500">Risolvi entro il tempo</h3>' +
      '<div style="font-size:34px;text-align:center;letter-spacing:1px;margin:8px 0 14px">' + expr + ' = ?</div>' +
      '<input id="mdg-ans" type="number" inputmode="numeric" autocomplete="off" style="width:100%;font-size:20px;text-align:center;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.4);background:#16203a;color:#eaf2ff;box-sizing:border-box">' +
      '<div style="height:6px;background:#16203a;border-radius:4px;margin-top:14px;overflow:hidden"><div id="mdg-bar" style="height:100%;width:100%;background:#3aa0c9"></div></div>' +
      '<div id="mdg-fb" style="text-align:center;font-size:14px;min-height:22px;margin-top:10px"></div>';
    var inp = ov.card.querySelector('#mdg-ans'), bar = ov.card.querySelector('#mdg-bar'), fb = ov.card.querySelector('#mdg-fb');
    setTimeout(function () { inp.focus(); }, 50);

    var total = cfg.timer * 1000, start = Date.now();
    function tick() {
      var left = total - (Date.now() - start), frac = Math.max(0, left / total);
      bar.style.width = (frac * 100) + '%';
      bar.style.background = frac > 0.4 ? '#3aa0c9' : (frac > 0.15 ? '#e8821c' : '#c0432c');
      if (left <= 0) { fb.innerHTML = '<span style="color:#e8a">⏱ Tempo scaduto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false, timeout: true }); }, 800); return; }
      raf = requestAnimationFrame(tick);
    }
    if (!RM) tick(); else { /* reduced motion: solo timeout, no barra animata */ timer = setTimeout(function () { fb.innerHTML = '<span style="color:#e8a">⏱ Tempo scaduto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false, timeout: true }); }, 800); }, total); }

    function submit() {
      var v = parseInt(inp.value, 10);
      if (isNaN(v)) { inp.focus(); return; }
      if (v === answer) { fb.innerHTML = '<span style="color:#3fae5a">✓ Accesso sbloccato</span>'; inp.disabled = true; setTimeout(function () { finish({ success: true }); }, 600); }
      else { fb.innerHTML = '<span style="color:#e88">✗ ' + v + ' non corretto</span>'; inp.disabled = true; setTimeout(function () { finish({ success: false }); }, 800); }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ─────────────────────────── SFIDA: stop/go (inibizione, droidi) ───────────
  // Tasti F/J. Blu→F, Arancio→J (GO), Rosso→NON premere (NO-GO). Sblocco se score≥60%.
  function _runStopGo(opts, done) {
    opts = opts || {};
    var N = opts.trials || 12, stimMs = opts.stimMs || 1100, isiMs = 550;
    var GO_F = '#2f6fdb', GO_J = '#e8821c', STOP = '#c0432c';
    var trials = [];
    for (var i = 0; i < N; i++) {
      if (Math.random() < 0.30) trials.push('stop');           // ~30% no-go (prepotenza GO)
      else trials.push(Math.random() < 0.5 ? 'F' : 'J');
    }
    var idx = 0, correct = 0, responded = false, raf = 0, timer = null, t0 = Date.now();
    var ov = _overlay();
    var unEsc = _esc(function () { cleanup(); ov.close(); done({ success: false, aborted: true }); });
    function cleanup() { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer); window.removeEventListener('keydown', onKey); unEsc(); }
    function finish() { cleanup(); ov.close(); var score = correct / N; _updateWMraw(score); done({ success: score >= 0.6, score: score, modality: 'stopgo', durationMs: Date.now() - t0 }); }

    ov.card.innerHTML =
      '<div style="font-size:13px;color:#8fa4c4;margin-bottom:4px">Cattura droide · inibizione (stop/go)</div>' +
      '<h3 style="margin:0 0 6px;font-size:17px;font-weight:500">Reagisci in fretta… ma trattieniti sul rosso</h3>' +
      '<div style="font-size:12px;color:#8fa4c4;margin-bottom:12px">Blu → <b>F</b> &nbsp;·&nbsp; Arancio → <b>J</b> &nbsp;·&nbsp; <span style="color:#e88">Rosso → non premere</span></div>' +
      '<div id="sg-stim" style="height:120px;display:flex;align-items:center;justify-content:center"></div>' +
      '<div id="sg-prog" style="font-size:12px;color:#8fa4c4;text-align:center;min-height:18px"></div>';
    var stim = ov.card.querySelector('#sg-stim'), prog = ov.card.querySelector('#sg-prog');

    function onKey(e) {
      var k = e.key.toLowerCase(); if (k !== 'f' && k !== 'j') return;
      if (responded || !stim.firstChild) return;
      responded = true;
      var tr = trials[idx];
      if (tr === 'stop') flash('#c0432c');                        // premuto sul NO-GO = errore d'inibizione
      else if ((tr === 'F' && k === 'f') || (tr === 'J' && k === 'j')) { correct++; flash('#3fae5a'); }
      else flash('#c0432c');                                       // tasto sbagliato
    }
    function flash(c) { stim.style.outline = '3px solid ' + c; setTimeout(function () { stim.style.outline = 'none'; }, 200); }
    function showTrial() {
      if (idx >= N) return finish();
      responded = false;
      var tr = trials[idx];
      var col = tr === 'stop' ? STOP : (tr === 'F' ? GO_F : GO_J);
      var shape = tr === 'stop' ? 'circle' : (tr === 'F' ? 'triangle' : 'square');
      stim.innerHTML = _shapeSVG(shape, col, 96);
      prog.textContent = (idx + 1) + ' / ' + N;
      var start = Date.now();
      (function tick() { if (Date.now() - start >= stimMs) return endTrial(); raf = requestAnimationFrame(tick); })();
    }
    function endTrial() {
      if (!responded && trials[idx] === 'stop') correct++;         // trattenuto correttamente
      idx++; stim.innerHTML = '';
      timer = setTimeout(showTrial, isiMs);
    }
    window.addEventListener('keydown', onKey);
    setTimeout(showTrial, 700);
  }

  // ─────────────────────────── orchestratore sblocco ─────────────────────────
  // 1° tentativo modalità casuale; fail → 2° tentativo cambia modalità;
  // doppio fail → cooldown + difficoltà−1 di quella modalità. Aggiorna WM + skill.
  function startUnlock(opts, cb) {
    opts = opts || {}; cb = cb || function () {};
    if (opts.deviceType === 'droid') { _runStopGo(opts, cb); return; }  // droidi = stop/go (ripetibile ≥60%)
    var first = (typeof opts.modality === 'string') ? opts.modality : (Math.random() < 0.5 ? 'seq' : 'calc');
    var meta = { attempts: 0, switched: false, modalities: [], doubleFail: false };

    function attempt(modality) {
      meta.attempts++; meta.modalities.push(modality);
      var lv = _skill()[modality];
      var run = modality === 'seq' ? _runSequence : _runCalc;
      run(lv, function (res) {
        if (res.aborted) { cb({ success: false, aborted: true, meta: meta }); return; }
        _updateWM(res.success, res.durationMs, lv);
        _logEv('unlock', { ok: res.success, mod: modality, lv: lv });   // telemetria EF (WM) — non è contenuto
        if (res.success) {
          _bumpStreak(modality, true);
          cb({ success: true, modality: modality, level: lv, meta: meta, durationMs: res.durationMs });
        } else {
          _bumpStreak(modality, false); // azzera streak + −1 livello
          if (meta.attempts === 1) {
            meta.switched = true;
            var other = modality === 'seq' ? 'calc' : 'seq';
            setTimeout(function () { attempt(other); }, 400);
          } else {
            meta.doubleFail = true;
            cb({ success: false, modality: modality, level: lv, meta: meta, cooldown: true });
          }
        }
      });
    }
    attempt(first);
  }

  // streak adattivo: +1 livello dopo 2 successi consecutivi, −1 dopo un fallimento
  var _streak = { seq: 0, calc: 0 };
  function _bumpStreak(kind, ok) {
    // salita LENTA: serve una serie di 3 successi consecutivi per +1 livello
    if (ok) { _streak[kind]++; if (_streak[kind] >= 3) { _streak[kind] = 0; _bumpLevel(kind, true); } }
    else { _streak[kind] = 0; _bumpLevel(kind, false); }
  }
  // WM meter: EWMA di una performance 0..1 = successo pesato per velocità e livello
  function _updateWM(ok, durationMs, lv) {
    var speed = ok ? Math.max(0, Math.min(1, 1 - (durationMs / 1000) / (8 + lv * 2))) : 0;
    var perf = ok ? (0.6 + 0.25 * speed + 0.15 * (lv / 7)) : 0.0;
    perf = Math.max(0, Math.min(1, perf));
    var cur = _wm(); var next = cur + 0.3 * (perf * 100 - cur); // EWMA alpha 0.3
    _saveWm(next); return next;
  }
  function _updateWMraw(perf) { perf = Math.max(0, Math.min(1, perf)); var cur = _wm(); var next = cur + 0.3 * (perf * 100 - cur); _saveWm(next); return next; }

  // ─────────────────────────── harness di test (game feel) ───────────────────
  function testUnlock() {
    // il test riparte SEMPRE dal livello facile (azzera skill/WM/streak della sessione)
    _saveSkill({ seq: 1, calc: 1 }); _saveWm(0); _streak = { seq: 0, calc: 0 };
    function round() {
      startUnlock({}, function (r) {
        if (r.aborted) return;
        var s = _skill(), wm = Math.round(_wm());
        var ov = _overlay();
        var un = _esc(ov.close);
        var line = r.success
          ? '<span style="color:#3fae5a">✓ Sbloccato</span> (' + r.modality + ', lv ' + r.level + (r.meta.switched ? ', dopo cambio modalità' : '') + ')'
          : (r.cooldown ? '<span style="color:#e88">✗ Doppio fallimento → cooldown + difficoltà −1</span>'
                        : '<span style="color:#e88">✗ Fallito</span>');
        ov.card.innerHTML =
          '<h3 style="margin:0 0 10px;font-size:17px;font-weight:500">Esito sblocco</h3>' +
          '<div style="font-size:14px;margin-bottom:12px">' + line + '</div>' +
          '<div style="font-size:13px;color:#8fa4c4;margin-bottom:16px">Skill: sequenza lv ' + s.seq + ' · calcolo lv ' + s.calc + ' &nbsp;|&nbsp; Memoria di lavoro: <b style="color:#eaf2ff">' + wm + '/100</b></div>' +
          '<div style="display:flex;gap:8px"><button id="mdg-again" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">Ancora ↻</button>' +
          '<button id="mdg-stop" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">Basta</button></div>';
        ov.card.querySelector('#mdg-again').onclick = function () { un(); ov.close(); round(); };
        ov.card.querySelector('#mdg-stop').onclick = function () { un(); ov.close(); };
      });
    }
    round();
  }

  function testStopGo() {
    function round() {
      _runStopGo({}, function (r) {
        if (r.aborted) return;
        var ov = _overlay(); var un = _esc(ov.close); var pct = Math.round(r.score * 100);
        var line = r.success
          ? '<span style="color:#3fae5a">✓ Droide catturato</span> — score ' + pct + '% (≥ 60%)'
          : '<span style="color:#e88">✗ Score ' + pct + '%</span> — serve 60%. Riprova (nessun malus).';
        ov.card.innerHTML =
          '<h3 style="margin:0 0 10px;font-size:17px;font-weight:500">Stop/Go — esito</h3>' +
          '<div style="font-size:14px;margin-bottom:16px">' + line + '</div>' +
          '<div style="display:flex;gap:8px"><button id="sg-a" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">' + (r.success ? 'Ancora ↻' : 'Ripeti ↻') + '</button>' +
          '<button id="sg-s" style="flex:1;padding:10px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">Basta</button></div>';
        ov.card.querySelector('#sg-a').onclick = function () { un(); ov.close(); round(); };
        ov.card.querySelector('#sg-s').onclick = function () { un(); ov.close(); };
      });
    }
    round();
  }

  // ════════════════════════ DUNGEON (slice 2a) ═══════════════════════════════
  // Stanze per livello, esplorazione POINT&CLICK (mouse), nebbia (rot.js FOV).
  // Oggetti-memoria (TUTTI col puzzle): forziere→calcolo · libro→sequenza · pergamena→calcolo.
  // Le memory unit vengono SOLO dagli oggetti; i nemici fanno solo duello F/J (niente memory-mostri).
  // 3 contenuti MappAI (mappano select→organize→integrate, c4): libro=descrizione · scroll=citazione · vaso=relazione
  var SRC = { libro: { modality: 'seq', kind: 'desc' }, scroll: { modality: 'calc', kind: 'cite' }, vaso: { kind: 'rel' } };   // vaso: puzzle normale (seq/calc casuale come libri/scroll), NON droide
  var DUN = null;

  function _levelsFromState() {
    var st = _getAppState(); var nodes = (st && st.db && st.db.nodes) || [];
    if (!nodes.length) return null;
    var byL = {};
    nodes.forEach(function (n) { var l = (n.level != null) ? n.level : 1; (byL[l] = byL[l] || []).push(n); });
    return Object.keys(byL).map(Number).sort(function (a, b) { return a - b; }).map(function (l) { return { level: l, nodes: byL[l] }; });
  }
  // composizione piani da livelli: misto intervallato da radura/combat (usata all'avvio e nella discesa per-ramo)
  function _composeFloors(base, study) {
    var floors = [];
    base.forEach(function (lf, bi) { floors.push({ kind: 'misto', level: lf.level, nodes: lf.nodes }); if (!study && bi < base.length - 1) floors.push({ kind: (bi === 0 && _raduraOn()) ? 'radura' : 'combat', level: lf.level, nodes: [] }); });   // S4: il primo intermezzo è una radura FE all'aperto (scaffolding), i profondi restano combat
    return floors;
  }

  function _ensureRot(cb) {
    if (typeof ROT !== 'undefined' && ROT && ROT.Map) return cb(true);
    if (window.ROT && window.ROT.Map) return cb(true);
    var s = document.createElement('script');
    s.src = 'js/vendor/rot.min.js?ts=' + Date.now();   // cache-bust: bypassa cache Electron
    s.onload = function () { cb((typeof ROT !== 'undefined' && ROT && ROT.Map) || (window.ROT && window.ROT.Map)); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function _startDungeon() {
    _ensureRot(function (ok) {
      if (!ok) { _toast(_tSafe('tst_dg_rot', 'Impossibile caricare rot.js (js/vendor/rot.min.js) — controlla il path'), 'error'); return; }
      _startDungeonReal();
    });
  }
  // UI/CSS Space Bears (scoped a #mdg-dun: non altera lo stile dell'app)
  function _injectSBStyle() {
    if (document.getElementById('mdg-sb-style')) return;
    var s = document.createElement('style'); s.id = 'mdg-sb-style';
    s.textContent =
      "@font-face{font-family:'DejaVu Sans Mono';src:url('assets/spacebears/css/DejaVuSansMono.woff2') format('woff2'),url('assets/spacebears/css/DejaVuSansMono.woff') format('woff');}" +
      "#mdg-dun{font-family:'DejaVu Sans Mono',monospace;color:whitesmoke;background:#111}" +
      "#mdg-dun #game{position:absolute;inset:0}" +
      "#mdg-dun #game canvas{position:absolute;inset:0;image-rendering:pixelated}" +
      "#mdg-dun #hud{position:fixed;top:0;left:0;padding:6px 10px;font-size:14px;text-shadow:black 0 0 2px;background:rgba(0,0,0,.5);border-radius:3px}" +
      "#mdg-dun #hud>div{white-space:pre;line-height:1.5}" +
      "#mdg-dun #messages{position:fixed;bottom:0;left:0;max-width:70%;padding:8px 12px;text-shadow:black 0 0 2px;background:rgba(0,0,0,.5);border-radius:3px;pointer-events:none}" +
      "#mdg-dun #messages span{display:block}" +
      "#mdg-dun .msg0{color:#fff}#mdg-dun .msg1{color:#aaa}#mdg-dun .msg2{color:#888}#mdg-dun .msg3{color:#666}#mdg-dun .msg4{color:#444}" +
      "#mdg-dun .btn{display:inline-block;height:36px;line-height:36px;padding:0 12px;background:#222;border-radius:3px;cursor:pointer;border:1px solid #000;color:whitesmoke}#mdg-dun .btn:hover{border-color:#fff;text-shadow:cyan 0 0 8px}";
    document.head.appendChild(s);
  }
  function _shade(hex, f) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; function c(v) { return Math.max(0, Math.min(255, Math.round(v))); } return '#' + ((1 << 24) + (c(r * f) << 16) + (c(g * f) << 8) + c(b * f)).toString(16).slice(1); }
  function _msg(t) { if (!DUN) return; DUN.messages.push(t); if (DUN.messages.length > 50) DUN.messages.shift(); DUN.msgDirty = true; }
  function _resetDisplaySB() {
    var gameEl = DUN.root.querySelector('#game');
    if (!DUN.cv) { DUN.cv = document.createElement('canvas'); gameEl.appendChild(DUN.cv); DUN.ctx = DUN.cv.getContext('2d'); DUN.cv.addEventListener('click', _onDunClick, true); }
    DUN.cv.width = window.innerWidth; DUN.cv.height = window.innerHeight;
    DUN.ctx.imageSmoothingEnabled = false;
  }
  function _startDungeonReal() {
    var base = _levelsFromState();
    if (!base) { _toast(_tSafe('tst_dg_need_map', 'Genera prima una mappa'), 'warning'); return; }
    if (DUN) return;
    // sessione di studio unificata: catture + gate/boss/review confluiscono in sessioni.jsonl
    try { if (window.MappAIStudyBus) window.MappAIStudyBus.begin('dungeon', 'Memory Dungeon'); } catch (e) {}
    // intervalla piani MISTI (memory+loot+enemies) con piani COMBAT (poche stanze, solo nemici → allena inibizione)
    // modalità studio (Quick win D): niente piani combat, niente nemici → focus su cattura/sblocco
    var study = _studyMode();
    var floors = _composeFloors(base, study);
    // onboarding (Quick win C): primo avvio = piano "scuola" calmo (no nemici), demo cattura + regole
    if (!_onboarded() && base[0] && base[0].nodes.length) floors.unshift({ kind: 'scuola', level: 0, nodes: base[0].nodes.slice(0, 2) });
    // GIARDINO = piano 0 (gated, default ON). Disabilita: localStorage 'mappai_garden_floor'='0'
    try { if (localStorage.getItem('mappai_garden_floor') !== '0') { var gnod = _gardenNodes(); if (gnod.length) floors.unshift({ kind: 'giardino', level: 0, nodes: gnod }); } } catch (e) {}
    _injectSBStyle();
    var root = document.createElement('div');
    root.id = 'mdg-dun';
    root.style.cssText = 'position:fixed;inset:0;z-index:99997;overflow:hidden;background:#111';
    root.innerHTML =
      '<div id="game"></div><div id="hud"></div><div id="messages"></div>' +
      '<button id="mdg-dx" type="button" class="btn" style="position:fixed;top:6px;right:6px;z-index:5">✕</button>' +
      '<div style="position:fixed;bottom:6px;right:10px;font-size:11px;color:#555;pointer-events:none">clic/WASD = muovi · SPAZIO = salta · Q/E = ruota · rotella = zoom · B = diario · Esc = esci</div>';
    document.body.appendChild(root);
    DUN = { root: root, floors: floors, fi: -1, hp: 5, maxhp: 5, path: null, raf: 0, hpTimer: Date.now(), diary: _loadDiary(), messages: [], msgDirty: false, skin: null, mobs: [], corpses: {}, duel: null, flash: null, playerAnim: PLAYER_ANIM, busy: false, mana: 0, maxMana: 10, items: {}, coins: 0, gems: 0, facing: [0, -1], kills: 0, spellFx: null, gatePassed: {} };
    DUN.tileset = _sheet('fantasticdungeons/assets/tileset.png'); DUN.TS = 32;   // tile 16px ×2
    _pruneDiary();   // marca ghost le voci di nodi rimossi dalla mappa (esclusi dai quiz, leggibili nel diario)
    _hydrateQuizFromCache();   // quiz già generati → _dunQuiz pronti senza nuove chiamate AI (A7)
    // tier AI iniziale per l'indicatore HUD (☁/💻/📴): si aggiorna poi a ogni chiamata reale
    try { DUN.aiMode = (window.getSystemKey && window.getSystemKey()) ? 'cloud' : (_localLlmOk() ? 'local' : 'off'); } catch (e) { DUN.aiMode = _localLlmOk() ? 'local' : 'off'; }
    _logEv('sess_start', { floors: floors.length, study: study, ai: DUN.aiMode });
    var KEY_MV = { w: 'w', arrowup: 'w', s: 's', arrowdown: 's', a: 'a', arrowleft: 'a', d: 'd', arrowright: 'd' };
    function onKey(e) {
      var tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;   // niente passi mentre si digita nei modali
      var k = e.key.toLowerCase();
      if (k === 'escape') return _closeDungeon();
      if (DUN.duel) { var set = DUN.duel.cfg && DUN.duel.cfg.set; if (set && (k === set.a.key || k === set.b.key)) { e.preventDefault(); _duelInput(k); } return; }
      if (DUN.busy) return;
      var mv = KEY_MV[k];
      if (mv) { e.preventDefault(); DUN.held = DUN.held || {}; if (!DUN.held[mv]) { DUN.held[mv] = 1; _keyDrive(); } return; }   // premuto → held (hold gestito dal tick); passo immediato al primo tocco
      if (k === ' ') { e.preventDefault(); return _keyJump(); }
      if (k === 'b') _openDiary(); else if (k === 'z') _castSpell();
    }
    function onKeyUp(e) { var mv = KEY_MV[(e.key || '').toLowerCase()]; if (mv && DUN.held) delete DUN.held[mv]; }
    function onResize() { _resetDisplaySB(); }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', onResize);
    DUN._onKey = onKey; DUN._onKeyUp = onKeyUp; DUN._resize = onResize;
    root.querySelector('#mdg-dx').onclick = _closeDungeon;
    _resetDisplaySB();
    _selectCharacter(function () {
      function begin() {
        if (window.loadPromptsConfig && (!window.systemPromptsConfig || !Object.keys(window.systemPromptsConfig).length)) { try { window.loadPromptsConfig(); } catch (e) {} }   // NPC: prompt pronti per il giardino
        // mappa curata del giardino: attesa max 1.5s, poi si parte comunque (procedurale)
        var went = false;
        function go() {
          if (went || !DUN) return; went = true;
          // MAPPA-MONDO (contratto §11, D6: solo skin voxel). Fallback: piani classici.
          var world = DUN.vaultPlans && DUN.vaultPlans.world;
          var loaded = false;
          if (world && _worldModeOn()) {
            var voxOk = _skin() === 'voxel' && window.MappAIDungeonVoxel && window.MappAIDungeonVoxel.available && window.MappAIDungeonVoxel.available();
            if (voxOk) {
              try {
                var allNodes = [];
                _levelsFromState().forEach(function (lf) { allNodes = allNodes.concat(lf.nodes); });
                DUN.floors = [{ kind: 'mondo', level: 0, nodes: allNodes }];
                _loadWorld(world);
                _drawWorldMinimap();
                loaded = true;
              } catch (e) { console.error('[mondo] fallback ai piani:', e); DUN.world = null; }
            } else {
              _toast(_tSafe('tst_world_voxel', 'La mappa-mondo richiede la skin voxel: dungeon a piani classico'), 'warning');
            }
          }
          if (!loaded) _loadFloor(0);
          _msg(_tSafe('dg_explore', 'Esplora il dungeon. Clicca per muoverti.'));
          (function loop() { DUN.raf = requestAnimationFrame(loop); _dunTick(); _dunRender(); })();
          setTimeout(function () { if (DUN && !DUN.busy) { try { _welcomeReview(); } catch (e) {} } }, 600);   // spacing multi-giorno (F2.3)
        }
        var gt = setTimeout(go, 1500);
        Promise.all([
          _gardenMapFetch().then(function (m) { if (DUN) DUN._gmap = m; }, function () {}),
          _vaultPlansFetch().then(function (p) { if (DUN) DUN.vaultPlans = p; }, function () {})   // piani custom dal vault (contratto @1)
        ]).then(function () { clearTimeout(gt); go(); });
      }
      if (!_onboarded()) _showRules(begin); else begin();
    });
  }
  function _closeDungeon() {
    if (!DUN) return;
    _logEv('sess_end', { fi: DUN.fi, diary: (DUN.diary || []).length, caps: DUN._sessCaps || 0, q: DUN._sessQ || 0, qok: DUN._sessQok || 0 });
    // digest informativo (mai valutativo): cosa hai costruito oggi (c6 — ricompensa informativa)
    if (DUN._sessCaps || DUN._sessQ) {
      var parts = [];
      if (DUN._sessCaps) parts.push(DUN._sessCaps + (DUN._sessCaps === 1 ? ' memoria catturata' : ' memorie catturate'));
      if (DUN._sessQ) parts.push(DUN._sessQ + ' risposte (' + Math.round(100 * (DUN._sessQok || 0) / DUN._sessQ) + '% ok)');
      try { _toast(_tSafe('tst_dg_today', 'Oggi: ') + parts.join(' · ') + _tSafe('tst_dg_bye', ' — a presto!'), 'success'); } catch (e) {}
    }
    cancelAnimationFrame(DUN.raf);
    window.removeEventListener('keydown', DUN._onKey); window.removeEventListener('keyup', DUN._onKeyUp); window.removeEventListener('resize', DUN._resize);
    try { if (window.MappAIDungeonVoxel) window.MappAIDungeonVoxel.dispose(); } catch (e) {}   // §19 F1
    DUN.root.remove(); DUN = null;
    try { if (window.MappAIStudyBus) window.MappAIStudyBus.end(); } catch (e) {}   // scrive la sessione dungeon
  }

  function _loadFloor(i) {
    if (DUN.floors[i].kind === 'giardino') { try { return _loadGarden(i); } catch (e) { console.error('[giardino]', e); DUN.floors[i].kind = 'misto'; } }  // fallback: se il giardino fallisce, piano normale
    if (DUN.floors[i].kind === 'radura') { try { return _loadRadura(i); } catch (e) { console.error('[radura]', e); DUN.floors[i].kind = 'combat'; } }      // S4 fallback: radura fallita → combat classico
    // piano custom dal vault (Memory Dungeon/piani/*.json, contratto @1) — fallback: procedurale
    if (DUN.vaultPlans && DUN.vaultPlans.plans && DUN.vaultPlans.plans[i]) {
      try { return _loadFloorFromPlan(i, DUN.vaultPlans.plans[i]); }
      catch (e) { console.error('[piano vault ' + i + ']', e); }
    }
    DUN.gardenFloor = false; DUN.gardenNpcs = null; DUN.gardenWater = null; DUN.gateRoom = null;
    DUN.gardenTrees = null; DUN.gardenFlowers = null; DUN.raduraTotems = null;
    DUN.customMap = null; DUN.customDraw = null; DUN.floorPlan = null; DUN.quota = null;
    var f = DUN.floors[i]; DUN.fi = i;
    _logEv('floor', { fi: i, kind: f.kind });
    var n = f.nodes.length, combat = f.kind === 'combat';
    var w = combat ? 28 : Math.max(34, Math.min(72, 12 + n * 3));
    var h = combat ? 20 : Math.max(24, Math.min(48, 10 + n * 2));
    var dig = new ROT.Map.Digger(w, h), map = {};
    dig.create(function (x, y, v) { map[x + ',' + y] = v; });
    DUN.map = map; DUN.w = w; DUN.h = h;
    var open = []; for (var k in map) { if (map[k] === 0) open.push(k); }
    open.sort(function () { return Math.random() - 0.5; });
    var st = open.pop().split(',').map(Number); DUN.px = st[0]; DUN.py = st[1];
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {};
    var types = ['libro', 'scroll', 'vaso'];   // libro=descrizione · scroll=citazione · vaso=relazione (3 contenuti MappAI)
    f.nodes.filter(_hasContent).forEach(function (nd, idx) {   // A12: i nodi senza desc/citazioni non spawano (interrogherebbero sul nulla)
      if (!open.length) return;
      var key = open.pop(), t = types[idx % 3];
      DUN.sources[key] = { node: nd, type: t, extracted: !!_mastered(nd.id) };
    });
    DUN.sx = DUN.sy = -1;
    if (i < DUN.floors.length - 1 && open.length) { var s = open.pop().split(',').map(Number); DUN.sx = s[0]; DUN.sy = s[1]; }
    // BOSS (gap #3): l'ultimo piano non ha scale → il Guardiano della Memoria è il terminale.
    DUN.boss = null;
    if (i === DUN.floors.length - 1 && open.length) {
      var bk = null;
      for (var bi = open.length - 1; bi >= 0; bi--) { var bp = open[bi].split(',').map(Number); if (Math.abs(bp[0] - DUN.px) + Math.abs(bp[1] - DUN.py) >= 6) { bk = open.splice(bi, 1)[0]; break; } }
      if (!bk) bk = open.pop();
      if (bk) { var bb = bk.split(',').map(Number); DUN.boss = { x: bb[0], y: bb[1], defeated: false }; }
    }
    if (f.kind === 'misto') { try { _placeS17(f, open); } catch (e) { console.error('[s17 place]', e); } }   // §17: condotto ⚡ / server 🖥 / mimic 🎭
    DUN.items = {};   // loot (pozioni/monete) ora droppa dai nemici sconfitti (_mobDie); i vasi sono diventati sorgenti-relazione
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    DUN.theme = THEMES[i % THEMES.length];
    DUN.themeTiles = THEME_TILES[DUN.theme.n] || { floor: [3, 1], wall: [2, 5] };
    DUN.torches = [];
    var walls = Object.keys(DUN.map).filter(function (kk) { return DUN.map[kk] === 1; });
    walls.sort(function () { return Math.random() - 0.5; });
    var want = Math.max(3, Math.floor((n || 4) / 2)), placed = 0;
    for (var ti = 0; ti < walls.length && placed < want; ti++) {
      var pp = walls[ti].split(',').map(Number);
      if (DUN.map[pp[0] + ',' + (pp[1] + 1)] === 0) { DUN.torches.push({ x: pp[0], y: pp[1], ph: Math.random() * 6 }); placed++; }
    }
    _spawnMobs(f);
    _computeFOV();
    if (DUN.boss && !DUN.boss.defeated) _msg(_tSafe('dg_final_floor', 'Piano finale: trova il Guardiano della Memoria ⚔ per rivelare la mappa.'));
    else if (f.kind === 'scuola') _msg(_tSafe('dg_school', 'Scuola: nessun pericolo qui. Cattura una memory unit, poi scendi dalle scale 🔽.'));
    // HUB S5: consiglio "in su" — piano già in gran parte padroneggiato → celebrazione sobria + glow scale
    DUN.stairReady = false;
    if (_softGateOn() && f.nodes && f.nodes.length && DUN.sx >= 0) {
      var mastN = f.nodes.filter(function (nd) { return _mastered(nd.id); }).length;
      if (mastN / f.nodes.length >= _gateThr()) {
        DUN.stairReady = true;
        DUN.softCelebrated = DUN.softCelebrated || {};
        if (!DUN.softCelebrated[i]) { DUN.softCelebrated[i] = 1; _logEv('soft_gate_ready', { fi: i }); _msg(_tSafe('dg_soft_gate', '✨ Padroneggi già gran parte di questo piano: le scale brillano, puoi scendere quando vuoi.')); }
      }
    }
  }
  function _computeFOV() {
    if (DUN.gardenFloor || DUN.gateRoom) { DUN.visible = {}; for (var gk in DUN.map) { DUN.visible[gk] = true; DUN.explored[gk] = true; } return; }  // prato / stanza gate: niente nebbia
    DUN.visible = {};
    var fov = new ROT.FOV.PreciseShadowcasting(function (x, y) { return DUN.map[x + ',' + y] === 0; });
    fov.compute(DUN.px, DUN.py, 7, function (x, y, r, vis) { if (vis) { DUN.visible[x + ',' + y] = true; DUN.explored[x + ',' + y] = true; } });
    DUN.explored[DUN.px + ',' + DUN.py] = true;
  }

  // ───── PIANI CUSTOM DAL VAULT (Memory Dungeon/piani/*.json, contratto @1) ─────
  // Ambiente e slot disegnati nell'editor (docente/studente); CONTENUTO dinamico:
  // gli slot memory si riempiono a runtime coi nodi del livello (i più deboli
  // per primi). Design: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md
  // Kill-switch (default ON): localStorage 'mappai_vault_floors'='0'
  function _vaultFloorsOn() { try { return localStorage.getItem('mappai_vault_floors') !== '0'; } catch (e) { return true; } }
  function _vaultPlansFetch() {
    if (!_vaultFloorsOn()) return Promise.resolve(null);
    try {
      var st = _getAppState();
      var vp = st && st.activeVaultPath;
      if (!vp || !window.electronAPI || !window.electronAPI.loadDungeonFloors) return Promise.resolve(null);   // iPad/web: solo procedurale
      return window.electronAPI.loadDungeonFloors(vp).then(function (r) {
        if (r && r.success && r.plans && Object.keys(r.plans).length) {
          console.log('[dungeon] piani custom dal vault: piano-' + Object.keys(r.plans).join(', piano-'));
          return r;
        }
        return null;
      }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  // Import in-app di un piano ricevuto (file .json da docente/compagno): valida col
  // contratto §4 PRIMA di copiare in <vault>/Memory Dungeon/piani/. Lo studente non
  // tocca mai il filesystem; i piani ingiocabili vengono rifiutati con spiegazione.
  function _importFloorPlan(ev) {
    var inp = ev && ev.target;
    var file = inp && inp.files && inp.files[0];
    if (inp) inp.value = '';                       // consente di reimportare lo stesso file
    if (!file) return;
    var st = _getAppState();
    var vp = st && st.activeVaultPath;
    if (!vp || !window.electronAPI || !window.electronAPI.saveDungeonFloor) {
      _toast(_tSafe('tst_fp_no_vault', 'Prima salva la mappa nel vault: il piano importato va copiato lì'), 'warning');
      return;
    }
    var C = _core();
    if (!C || !C.validatePlan) { _toast('MappAIDungeonCore mancante', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var plan;
      try { plan = JSON.parse(String(reader.result)); }
      catch (e) { _toast(_tSafe('tst_fp_bad_json', 'File non leggibile: non è un JSON valido'), 'error'); return; }
      // pacchetto classe (bundle multi-piano dallo Studio) → flusso dedicato
      if (plan && typeof plan.schema === 'string' && plan.schema.indexOf('mappai-dungeon-bundle@') === 0) {
        _importBundle(plan, vp, st, C); return;
      }
      if (!plan || typeof plan.schema !== 'string' || plan.schema.indexOf('mappai-dungeon-floor@') !== 0) {
        _toast(_tSafe('tst_fp_bad_schema', 'Questo file non è un piano del Memory Dungeon'), 'error'); return;
      }
      var m = (typeof plan.id === 'string') ? plan.id.match(/^piano-(\d+)$/) : null;
      if (!m) {
        _toast(_tSafe('tst_fp_bad_id', 'Nel file manca "id": "piano-N" — impossibile capire quale piano sostituire'), 'error'); return;
      }
      if (!Number.isInteger(plan.level)) {
        _toast(_tSafe('tst_fp_bad_level', 'Nel file manca "level": il piano non sa a quale livello della mappa legarsi'), 'error'); return;
      }
      var idx = m[1];
      window.electronAPI.loadDungeonFloors(vp).then(function (cur) {
        var ruleset = (cur && cur.success && cur.ruleset) || null;
        var nodes = ((st.db && st.db.nodes) || []).filter(function (nd) { return nd.level === plan.level && _hasContent(nd); });
        var v = C.validatePlan(plan, ruleset, nodes.length);
        if (!v.ok) {
          window.showAlert(_tSafe('fp_invalid_title', 'Piano non importabile'),
            v.errors.map(function (e) { return '• ' + e.msg; }).join('\n'));
          return;
        }
        function doSave() {
          window.electronAPI.saveDungeonFloor({ vaultPath: vp, plan: plan }).then(function (r) {
            if (r && r.success) {
              v.warnings.forEach(function (w) { console.warn('[import piano]', w.code + ':', w.msg); });
              var wmsg = v.warnings.length ? ' (' + v.warnings.length + ' ' + _tSafe('fp_warnings', 'avvisi, dettagli in console') + ')' : '';
              _toast(_tSafe('tst_fp_ok', 'Piano importato nel vault') + ': ' + r.file + wmsg, 'success');
              if (DUN) _vaultPlansFetch().then(function (p) { if (DUN) DUN.vaultPlans = p; }, function () {});   // dungeon aperto: aggiorna i piani
            } else {
              _toast(_tSafe('tst_fp_fail', 'Import fallito') + ': ' + ((r && r.error) || '?'), 'error');
            }
          });
        }
        if (cur && cur.success && cur.plans && cur.plans[idx]) {
          window.showConfirm(_tSafe('fp_overwrite_title', 'Sostituire il piano?'),
            'piano-' + idx + ' — ' + _tSafe('fp_overwrite_msg', 'nel vault esiste già: il file importato lo sostituirà.'), doSave);
        } else doSave();
      });
    };
    reader.readAsText(file);
  }
  // Pacchetto classe (mappai-dungeon-bundle@1, export dello Studio): più piani in un
  // file. Ogni piano passa dal validatore coi nodi correnti; i validi vengono scritti,
  // gli scartati riportati con motivo. Conferma unica con riepilogo sovrascritture.
  function _importBundle(bundle, vp, st, C) {
    var floors = Array.isArray(bundle.floors) ? bundle.floors : [];
    if (!floors.length) { _toast(_tSafe('tst_fp_empty_bundle', 'Pacchetto vuoto: nessun piano dentro'), 'error'); return; }
    window.electronAPI.loadDungeonFloors(vp).then(function (cur) {
      var ruleset = (cur && cur.success && cur.ruleset) || null;
      var existing = (cur && cur.success && cur.plans) || {};
      var good = [], bad = [];
      floors.forEach(function (p) {
        var m = (p && typeof p.id === 'string') ? p.id.match(/^piano-(\d+)$/) : null;
        if (!m || !Number.isInteger(p.level)) { bad.push({ id: (p && p.id) || '?', why: 'id o level mancante' }); return; }
        var nodes = ((st.db && st.db.nodes) || []).filter(function (nd) { return nd.level === p.level && _hasContent(nd); });
        var v = C.validatePlan(p, ruleset, nodes.length);
        if (v.ok) good.push({ idx: m[1], plan: p });
        else bad.push({ id: p.id, why: v.errors[0].msg });
      });
      if (!good.length) {
        window.showAlert(_tSafe('fp_invalid_title', 'Piano non importabile'),
          bad.map(function (b) { return '• ' + b.id + ': ' + b.why; }).join('\n'));
        return;
      }
      var over = good.filter(function (g) { return existing[g.idx]; }).map(function (g) { return 'piano-' + g.idx; });
      var msg = good.length + ' ' + _tSafe('fp_bundle_valid', 'piani validi') +
        (bad.length ? ', ' + bad.length + ' ' + _tSafe('fp_bundle_skipped', 'scartati (motivi in console)') : '') +
        (over.length ? '. ' + _tSafe('fp_bundle_over', 'Sovrascrive') + ': ' + over.join(', ') : '') + '.';
      window.showConfirm(_tSafe('fp_bundle_title', 'Importare il pacchetto?'), msg, function () {
        // texture/materiali del pacchetto → Memory Dungeon/materiali.json del vault
        if (bundle.materials && window.electronAPI.saveDungeonMaterials) {
          window.electronAPI.saveDungeonMaterials({ vaultPath: vp, materials: bundle.materials });
        }
        var done = 0;
        function next(i) {
          if (i >= good.length) {
            bad.forEach(function (b) { console.warn('[import pacchetto] scartato', b.id + ':', b.why); });
            _toast(_tSafe('tst_fp_bundle_ok', 'Pacchetto importato') + ': ' + done + '/' + good.length,
              done === good.length ? 'success' : 'warning');
            if (DUN) _vaultPlansFetch().then(function (p2) { if (DUN) DUN.vaultPlans = p2; }, function () {});
            return;
          }
          window.electronAPI.saveDungeonFloor({ vaultPath: vp, plan: good[i].plan }).then(function (r) {
            if (r && r.success) done++;
            next(i + 1);
          }, function () { next(i + 1); });
        }
        next(0);
      });
    });
  }
  // ───── MAPPA-MONDO (contratto §11, design §20) — W2 runtime ─────
  // Una mappa unica: zone = macro-aree L1, GATE di confine che si aprono con
  // coverage+quiz (D2). Richiede skin voxel (D6). Kill-switch: 'mappai_world_mode'='0'.
  function _worldModeOn() { try { return localStorage.getItem('mappai_world_mode') !== '0'; } catch (e) { return true; } }
  // nodi con contenuto raggruppati per ramo L1 (per bindZones e per il riempimento)
  function _branchGroups() {
    var st = _getAppState();
    var nodes = (st && st.db && st.db.nodes) || [], links = (st && st.db && st.db.links) || [];
    var C = _core();
    if (!C || !C.buildParentOf) return [];
    var parentOf = C.buildParentOf(nodes, links);
    var byId = {};
    nodes.forEach(function (n) { if (n && n.id != null) byId[n.id] = n; });
    function l1Of(n) {
      var cur = n, guard = 30;
      while (cur && cur.level > 1 && guard-- > 0) cur = byId[parentOf[cur.id]];
      return (cur && cur.level === 1) ? cur : null;
    }
    var groups = {};
    nodes.forEach(function (n) {
      if (!n || !_hasContent(n) || !n.level || n.level < 1) return;
      var l1 = l1Of(n);
      if (!l1) return;
      (groups[l1.id] = groups[l1.id] || { label: l1.label, group: l1.group, count: 0, nodes: [] });
      groups[l1.id].count++; groups[l1.id].nodes.push(n);
    });
    return Object.keys(groups).sort().map(function (k) { return groups[k]; });
  }
  function _loadWorld(plan) {
    var C = _core();
    if (!C || !C.worldZones) throw new Error('MappAIDungeonCore mancante');
    var W = C.worldZones(plan);
    if (!W || !W.zones.length) throw new Error('mondo senza aree calpestabili');
    DUN.gardenFloor = false; DUN.gardenNpcs = null; DUN.gardenWater = null; DUN.gateRoom = null;
    DUN.gardenTrees = null; DUN.gardenFlowers = null; DUN.raduraTotems = null;
    DUN.customMap = null; DUN.customDraw = null;
    DUN.fi = 0;
    DUN.map = W.grid.map; DUN.w = W.grid.w; DUN.h = W.grid.h;
    DUN.floorPlan = plan;   // celle/mat/props per la skin voxel
    DUN.quota = (W.grid.hasQuota && _quotaOn()) ? W.grid.quota : null;   // §21: movimento quota-aware
    var branches = _branchGroups();
    var B = C.bindZones(W.zones, branches);
    var ruleset = (DUN.vaultPlans && DUN.vaultPlans.ruleset) || null;
    var defReq = (ruleset && ruleset.gates) || C.WORLD_GATE_DEFAULT;
    DUN.world = { plan: plan, zones: W.zones, byCell: W.byCell, bindings: B.assignments, gates: [] };
    DUN.worldRev = 0;
    // slot (parse diretto: normalizePlanSlots non conosce il tipo gate)
    var slots = Array.isArray(plan.slots) ? plan.slots : [];
    var spawn = null, gk = null, memByZone = {}, enemies = [];
    slots.forEach(function (s) {
      if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.z)) return;
      var key = s.x + ',' + s.z;
      if (s.type === 'spawn' && !spawn && DUN.map[key] === 0) spawn = [s.x, s.z];
      else if (s.type === 'gatekeeper' && !gk && DUN.map[key] === 0) gk = [s.x, s.z];
      else if (s.type === 'memory' && W.byCell[key] !== undefined) (memByZone[W.byCell[key]] = memByZone[W.byCell[key]] || []).push(key);
      else if (s.type === 'enemy' && DUN.map[key] === 0) enemies.push(key);
      else if (s.type === 'gate' && DUN.map[key] === 0) {
        DUN.world.gates.push({ x: s.x, y: s.z, key: key, req: s.req || defReq, zoneIdx: null, open: false });
        DUN.map[key] = 1;   // chiuso = blocca (si riapre con _gateOpen)
      }
      // §20 PONTE-FLUENCY: si apre da solo alla padronanza (nessun quiz), poi ricompensa
      else if (s.type === 'bridge' && DUN.map[key] === 0) {
        DUN.world.gates.push({ x: s.x, y: s.z, key: key, req: s.req || { mastery: 0.5 }, zoneIdx: null, open: false, bridge: true, reward: s.reward || 'outfit' });
        DUN.map[key] = 1;
      }
    });
    // zone adiacenti di ogni gate (per la minimappa e per la zona "di provenienza")
    // §21: il gate collega solo le zone su cui il dislivello è saltabile
    var _gJ = (C.STEP_UP_JUMP != null) ? C.STEP_UP_JUMP : 1.6;
    DUN.world.gates.forEach(function (g) {
      var adj = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nk = (g.x + d[0]) + ',' + (g.y + d[1]);
        var zi = W.byCell[nk];
        var dq = DUN.quota ? Math.abs((DUN.quota[nk] || 0) - (DUN.quota[g.key] || 0)) : 0;
        if (zi !== undefined && dq <= _gJ && adj.indexOf(zi) < 0) adj.push(zi);
      });
      g.zoneIdx = adj;
    });
    if (!spawn) { for (var k0 in DUN.map) { if (DUN.map[k0] === 0) { spawn = k0.split(',').map(Number); break; } } }
    DUN.px = spawn[0]; DUN.py = spawn[1];
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {};
    // memorie: nodi del RAMO legato alla zona → slot della zona (i deboli per primi)
    var types = ['libro', 'scroll', 'vaso'], ti = 0;
    W.zones.forEach(function (z, zi) {
      var br = B.assignments[z.id];
      var keys = memByZone[zi] || [];
      if (!br || !keys.length) return;
      var res = C.assignMemorySlots(keys, br.nodes.filter(_hasContent), function (nd) { return _mastered(nd.id) ? 1 : 0; });
      res.placed.forEach(function (pl) {
        DUN.sources[pl.key] = { node: pl.node, type: types[(ti++) % 3], extracted: !!_mastered(pl.node.id) };
      });
      // staleness: nodi del ramo senza slot → celle libere DELLA STESSA zona
      if (res.unplacedNodes.length) {
        var free = z.cells.filter(function (ck) { return !DUN.sources[ck] && ck !== (DUN.px + ',' + DUN.py); });
        free.sort(function () { return Math.random() - 0.5; });
        res.unplacedNodes.forEach(function (nd) {
          var ck = free.pop(); if (!ck) return;
          DUN.sources[ck] = { node: nd, type: types[(ti++) % 3], extracted: !!_mastered(nd.id) };
        });
      }
    });
    DUN.sx = DUN.sy = -1;   // niente scale nel mondo: si viaggia coi gate
    DUN.boss = gk ? { x: gk[0], y: gk[1], defeated: false } : null;
    // nemici solo sugli slot disegnati (cap dal ruleset; mai in modalità studio)
    if (!_studyMode() && enemies.length) {
      var cap = 6;
      try { cap = (ruleset && ruleset.enemies && ruleset.enemies.max) || 6; } catch (e) {}
      enemies.slice(0, cap).forEach(function (key) {
        if (DUN.sources[key] || key === DUN.px + ',' + DUN.py) return;
        var p = key.split(',').map(Number);
        var en = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
        DUN.mobs.push({ x: p[0], y: p[1], hp: 6, maxhp: 6, name: en.n, anim: _mobAnim(en), moveAt: Date.now() + Math.random() * 700, alive: true });
      });
    }
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    DUN.theme = THEMES[1] || THEMES[0];   // muschio: mondo-natura verde (era pietra)
    DUN.themeTiles = THEME_TILES[DUN.theme.n] || { floor: [7, 0], wall: [0, 5] };
    DUN.gardenWater = {}; (W.grid.waterKeys || []).forEach(function (wk) { DUN.gardenWater[wk] = 1; });   // stagni/fiumi → acqua nella skin
    DUN.torches = [];
    _computeFOV();
    _logEv('world_start', { zones: W.zones.length, gates: DUN.world.gates.length, branches: branches.length });
    _msg(_tSafe('dg_world_hi', '🌍 Mappa-mondo: le zone sono i rami della tua mappa. I cancelli 🚪 si aprono consolidando la zona in cui sei.'));
  }
  function _worldGateAt(x, y) {
    if (!DUN.world) return null;
    for (var i = 0; i < DUN.world.gates.length; i++) {
      var g = DUN.world.gates[i];
      if (g.x === x && g.y === y) return g;
    }
    return null;
  }
  // statistiche della zona in cui sta il giocatore (per il req del gate)
  function _zoneStats(zi) {
    var tot = 0, got = 0, br = null;
    for (var k in DUN.sources) {
      if (DUN.world.byCell[k] !== zi) continue;
      var s = DUN.sources[k];
      if (!s.node) continue;   // condotti/server esclusi
      tot++; if (s.extracted) got++;
    }
    var z = DUN.world.zones[zi];
    if (z) br = DUN.world.bindings[z.id] || null;
    var mast = 0;
    if (br && br.nodes.length) {
      var m = 0;
      br.nodes.forEach(function (nd) { if (_mastered(nd.id)) m++; });
      mast = m / br.nodes.length;
    }
    return { coverage: tot ? got / tot : 1, got: got, tot: tot, mastery: mast, branch: br };
  }
  function _gateTry(g) {
    var C = _core();
    var zi = DUN.world.byCell[DUN.px + ',' + DUN.py];
    if (zi === undefined) return;
    var stats = _zoneStats(zi);
    var chk = C.checkGateReq(g.req, stats);
    if (!chk.pass) {
      if (chk.fail.indexOf('coverage') >= 0) {
        _msg(_tSafe('dg_wgate_cov', '🚪 Il guardiano del confine: hai {got}/{tot} memorie di questa zona (serve il {p}%). Esplora ancora.')
          .replace('{got}', stats.got).replace('{tot}', stats.tot).replace('{p}', Math.round((chk.req.coverage || 0) * 100)));
      } else {
        _msg(_tSafe('dg_wgate_mast', '🚪 Il guardiano del confine: consolida meglio questa zona (padronanza) e torna.'));
      }
      return;
    }
    var open = function () { _gateOpen(g); };
    if (!chk.quiz) { open(); return; }
    // pool: voci di diario del ramo della zona corrente; fallback: tutto il diario vivo
    var live = (DUN.diary || []).filter(function (d) { return !d.ghost; });
    var pool = live;
    if (stats.branch) {
      var ids = {};
      stats.branch.nodes.forEach(function (nd) { ids[nd.id] = 1; });
      var branchPool = live.filter(function (d) { return ids[d.id]; });
      if (branchPool.length) pool = branchPool;
    }
    if (!pool.length) { open(); return; }   // niente da chiedere: apri (mai bloccare a vuoto)
    _msg(_tSafe('dg_wgate_quiz', '🚪 Il guardiano del confine ti interroga sulla zona.'));
    _runQuiz(pool.map(_poolEntry), Math.min(chk.quiz, pool.length), '🚪 ' + _tSafe('dg_wgate_title', 'Guardiano del confine'), true, function (c, t) {
      _logEv('world_gate', { ok: c === t, c: c, t: t, gate: g.key });
      if (c === t) { open(); }
      else _msg(_tSafe('dg_wgate_retry', '🚪 «Non ancora. Ripassa le memorie di questa zona e riprova.»'));
    }, undefined, 'dungeon_world_gate');
  }
  function _gateOpen(g) {
    g.open = true;
    DUN.map[g.key] = 0;
    DUN.worldRev = (DUN.worldRev || 0) + 1;   // la skin voxel ricostruisce il piano
    _computeFOV();
    _msg(_tSafe('dg_wgate_open', '🚪 Il cancello si apre: nuova zona sbloccata!'));
    _snd('pickup');
    _drawWorldMinimap();
  }
  // §20 PONTE-FLUENCY (kill-switch: 'mappai_world_bridge'='0'): i ponti si aprono
  // DA SOLI quando la padronanza (EWMA) della zona di provenienza supera la soglia —
  // niente quiz, niente click: pura ricompensa di competenza (precision teaching).
  function _bridgeOn() { try { return localStorage.getItem('mappai_world_bridge') !== '0'; } catch (e) { return true; } }
  function _worldBridgeTick() {
    if (!DUN.world || !_bridgeOn()) return;
    if (Date.now() - (DUN._bridgeAt || 0) < 800) return;   // throttle: non ogni frame
    DUN._bridgeAt = Date.now();
    DUN.world.gates.forEach(function (g) {
      if (!g.bridge || g.open) return;
      var need = (g.req && g.req.mastery != null) ? g.req.mastery : 0.5;
      // apre solo se una zona ADIACENTE con un ramo ha mastery ≥ soglia (l'altra è l'isola-reward)
      var ok = (g.zoneIdx || []).some(function (zi) {
        var st = _zoneStats(zi);
        return st && st.branch && st.mastery >= need;
      });
      if (ok) _openBridge(g);
    });
  }
  function _openBridge(g) {
    g.open = true;
    DUN.map[g.key] = 0;
    DUN.worldRev = (DUN.worldRev || 0) + 1;   // la skin ricostruisce (il ponte diventa calpestabile)
    _computeFOV();
    _snd('powerup');
    _msg(_tSafe('dg_bridge_open', '🌉 Hai raggiunto la padronanza: un ponte appare sull\'acqua.'));
    try { _toast(_tSafe('tst_bridge', '🌉 Ponte della Maestria — un sentiero segreto si apre oltre l\'acqua.'), 'success'); } catch (e) {}
    _drawWorldMinimap();
    if (g.reward === 'outfit') _bridgeReward();
  }
  function _bridgeReward() {
    if (DUN._rewarded) return; DUN._rewarded = true;
    DUN.lolOutfit = 3;   // aspetto-ricompensa, distinto dai due iniziali (1=M, 2=F)
    _lsSet('mappai_hero_outfit', '3');
    DUN.companion = { x: DUN.px, y: DUN.py, emoji: '🦋' };   // farfalla-guida (resa dalla skin)
    DUN.worldRev = (DUN.worldRev || 0) + 1;   // la skin ricostruisce l'eroe col nuovo sprite
    try { _toast(_tSafe('tst_reward_outfit', '✨ Ricompensa: nuovo aspetto dell\'eroe + una farfalla-guida ti accompagna!'), 'success'); } catch (e) {}
    _logEv('bridge_reward', { outfit: 3 });
  }
  // minimappa a ZONE (§20.5): bolle = zone (colore del ramo), archi = gate, anello = zona corrente
  function _drawWorldMinimap() {
    if (!DUN || !DUN.world || !DUN.root) return;
    var cv = DUN.root.querySelector('#mdg-wmap');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'mdg-wmap'; cv.width = 150; cv.height = 150;
      cv.style.cssText = 'position:fixed;top:48px;right:6px;z-index:5;background:rgba(0,0,0,.55);border-radius:8px;pointer-events:none';
      DUN.root.appendChild(cv);
    }
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 150, 150);
    var W = DUN.world, PALZ = ['#5b6ee1', '#6abe30', '#df7126', '#d95763', '#5fcde4', '#d9a066', '#76428a', '#8f974a'];
    // centroidi
    var cts = W.zones.map(function (z) {
      var sx = 0, sy = 0;
      z.cells.forEach(function (k) { var p = k.split(','); sx += +p[0]; sy += +p[1]; });
      var n = z.cells.length || 1;
      return { x: sx / n, y: sy / n, n: n };
    });
    var sc = 140 / Math.max(DUN.w, DUN.h);
    function mx(v) { return 5 + v * sc; }
    // raggiungibilità con i gate APERTI (le zone chiuse si vedono scure)
    var curZi = W.byCell[DUN.px + ',' + DUN.py];
    var seen = {};
    if (curZi !== undefined) {
      seen[curZi] = 1;
      var q = [curZi];
      while (q.length) {
        var zi2 = q.shift();
        W.gates.forEach(function (g) {
          if (!g.open || g.zoneIdx.indexOf(zi2) < 0) return;
          g.zoneIdx.forEach(function (o) { if (!seen[o]) { seen[o] = 1; q.push(o); } });
        });
      }
    }
    // archi gate
    W.gates.forEach(function (g) {
      if (g.zoneIdx.length < 2) return;
      var a = cts[g.zoneIdx[0]], b = cts[g.zoneIdx[1]];
      ctx.strokeStyle = g.open ? '#7fd98a' : '#555';
      ctx.lineWidth = g.open ? 2 : 1.4;
      ctx.setLineDash(g.open ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(mx(a.x), mx(a.y)); ctx.lineTo(mx(b.x), mx(b.y)); ctx.stroke();
    });
    ctx.setLineDash([]);
    // bolle zona
    W.zones.forEach(function (z, zi) {
      var c = cts[zi];
      var br = W.bindings[z.id];
      var col = (br && br.group != null) ? PALZ[br.group % PALZ.length] : '#9aa1b4';
      var r = Math.max(6, Math.min(16, Math.sqrt(c.n) * 1.6));
      ctx.globalAlpha = seen[zi] ? 0.95 : 0.3;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(mx(c.x), mx(c.y), r, 0, 7); ctx.fill();
      if (zi === curZi) {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx(c.x), mx(c.y), r + 2.5, 0, 7); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }
  function _loadFloorFromPlan(i, plan) {
    var C = window.MappAIDungeonCore;
    if (!C || !C.planToGrid) throw new Error('MappAIDungeonCore mancante');
    var grid = C.planToGrid(plan);
    if (!grid) throw new Error('contratto non valido');
    DUN.gardenFloor = false; DUN.gardenNpcs = null; DUN.gardenWater = null; DUN.gateRoom = null;
    DUN.gardenTrees = null; DUN.gardenFlowers = null; DUN.raduraTotems = null;
    DUN.customMap = null; DUN.customDraw = null;
    var f = DUN.floors[i]; DUN.fi = i;
    _logEv('floor', { fi: i, kind: f.kind, vaultPlan: plan.id || ('piano-' + i) });
    DUN.map = grid.map; DUN.w = grid.w; DUN.h = grid.h;
    DUN.floorPlan = plan;   // biome/quota a disposizione della skin voxel (F2)
    DUN.quota = (grid.hasQuota && _quotaOn()) ? grid.quota : null;   // §21: movimento quota-aware
    if (grid.hasQuota) console.log('[piano vault] rilievo: quota ' + (DUN.quota ? 'ATTIVA' : 'DISATTIVATA (kill-switch mappai_dungeon_quota=0)'));
    var slots = C.normalizePlanSlots(plan, grid);
    if (!slots.spawn) throw new Error('nessuna cella camminabile');
    if (slots.dropped.length) console.warn('[piano vault] slot su celle non camminabili, ignorati:', slots.dropped);
    var sp = slots.spawn.split(',').map(Number); DUN.px = sp[0]; DUN.py = sp[1];
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {};
    function openCells() {
      var open = [];
      var sKey = DUN.sx >= 0 ? (DUN.sx + ',' + DUN.sy) : null;
      var bKey = DUN.boss ? (DUN.boss.x + ',' + DUN.boss.y) : null;
      // §21: mai piazzare memorie su plateau irraggiungibili dallo spawn
      var reach = (DUN.quota && C.reachableCells) ? C.reachableCells(DUN.map, DUN.quota, slots.spawn) : null;
      for (var k in DUN.map) {
        if (DUN.map[k] === 0 && !DUN.sources[k] && (!reach || reach[k]) && k !== slots.spawn && k !== sKey && k !== bKey) open.push(k);
      }
      open.sort(function () { return Math.random() - 0.5; });
      return open;
    }
    // memorie del livello → slot (A12: solo nodi con contenuto)
    var types = ['libro', 'scroll', 'vaso'];
    var res = C.assignMemorySlots(slots.memory, f.nodes.filter(_hasContent), function (nd) { return _mastered(nd.id) ? 1 : 0; });
    res.placed.forEach(function (pl, idx) {
      DUN.sources[pl.key] = { node: pl.node, type: types[idx % 3], extracted: !!_mastered(pl.node.id) };
    });
    // staleness (mappa cambiata dopo il disegno): memorie senza slot → celle libere
    if (res.unplacedNodes.length) {
      var extra = openCells();
      res.unplacedNodes.forEach(function (nd, idx) {
        var key = extra.pop(); if (!key) return;
        DUN.sources[key] = { node: nd, type: types[(res.placed.length + idx) % 3], extracted: !!_mastered(nd.id) };
      });
      console.log('[piano vault] ' + res.unplacedNodes.length + ' memorie senza slot → celle libere');
    }
    // scale / Guardiano (ultimo piano) — slot disegnato o fallback su cella libera
    DUN.sx = DUN.sy = -1; DUN.boss = null;
    var last = i === DUN.floors.length - 1;
    if (!last) {
      var sk = slots.stairs || openCells().pop();
      if (sk) { var ss = sk.split(',').map(Number); DUN.sx = ss[0]; DUN.sy = ss[1]; }
    } else {
      var bk = slots.gatekeeper || openCells().pop();
      if (bk) { var bb = bk.split(',').map(Number); DUN.boss = { x: bb[0], y: bb[1], defeated: false }; }
    }
    if (f.kind === 'misto') { try { _placeS17(f, openCells()); } catch (e) { console.error('[s17 place]', e); } }   // §17 auto-piazzate (v1: non disegnabili)
    // nemici SOLO sugli slot disegnati (cap dal ruleset; scuola/studio: nessuno)
    if (f.kind !== 'scuola' && !_studyMode() && slots.enemy.length) {
      var lvl = f.level, hp = lvl <= 1 ? 5 : (lvl === 2 ? 6 : 8);
      var cap = 6;
      try { cap = (DUN.vaultPlans.ruleset && DUN.vaultPlans.ruleset.enemies && DUN.vaultPlans.ruleset.enemies.max) || 6; } catch (e) {}
      slots.enemy.slice(0, cap).forEach(function (key) {
        if (DUN.sources[key] || key === slots.spawn) return;
        if (DUN.sx >= 0 && key === DUN.sx + ',' + DUN.sy) return;
        if (DUN.boss && key === DUN.boss.x + ',' + DUN.boss.y) return;
        var p = key.split(',').map(Number);
        var e = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
        DUN.mobs.push({ x: p[0], y: p[1], hp: hp, maxhp: hp, name: e.n, anim: _mobAnim(e), moveAt: Date.now() + Math.random() * 700, alive: true });
      });
    }
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    DUN.theme = THEMES[i % THEMES.length];
    DUN.themeTiles = THEME_TILES[DUN.theme.n] || { floor: [3, 1], wall: [2, 5] };
    // torce automatiche sui muri, come il procedurale
    DUN.torches = [];
    var walls = Object.keys(DUN.map).filter(function (kk) { return DUN.map[kk] === 1; });
    walls.sort(function () { return Math.random() - 0.5; });
    var want = Math.max(3, Math.floor((f.nodes.length || 4) / 2)), placedT = 0;
    for (var ti = 0; ti < walls.length && placedT < want; ti++) {
      var pp = walls[ti].split(',').map(Number);
      if (DUN.map[pp[0] + ',' + (pp[1] + 1)] === 0) { DUN.torches.push({ x: pp[0], y: pp[1], ph: Math.random() * 6 }); placedT++; }
    }
    _computeFOV();
    if (DUN.boss && !DUN.boss.defeated) _msg(_tSafe('dg_final_floor', 'Piano finale: trova il Guardiano della Memoria ⚔ per rivelare la mappa.'));
    // soft gate (HUB S5) — stessa logica del procedurale
    DUN.stairReady = false;
    if (_softGateOn() && f.nodes && f.nodes.length && DUN.sx >= 0) {
      var mastN = f.nodes.filter(function (nd) { return _mastered(nd.id); }).length;
      if (mastN / f.nodes.length >= _gateThr()) {
        DUN.stairReady = true;
        DUN.softCelebrated = DUN.softCelebrated || {};
        if (!DUN.softCelebrated[i]) { DUN.softCelebrated[i] = 1; _logEv('soft_gate_ready', { fi: i }); _msg(_tSafe('dg_soft_gate', '✨ Padroneggi già gran parte di questo piano: le scale brillano, puoi scendere quando vuoi.')); }
      }
    }
  }

  // ───── GIARDINO (piano 0): livello all'aperto di onboarding, stesso engine ─────
  // Mappa aperta (erba/acqua/alberi), NPC narranti = nodi-chiave, castello = scale → dungeon.
  // Numero massimo di Sapienti nel giardino (uno per macro-area L1). Configurabile:
  // 'mappai_garden_sapienti_max' (default 8, clamp 1..12). Prima era fisso a 4 → mappe
  // con più rami perdevano gli ambasciatori delle aree oltre la quarta.
  function _gardenSapientiMax() {
    var v = 8; try { var s = localStorage.getItem('mappai_garden_sapienti_max'); if (s != null) v = parseInt(s, 10); } catch (e) {}
    if (!isFinite(v) || v < 1) v = 8;
    return Math.max(1, Math.min(12, v));
  }
  function _gardenNodes() {
    // MindMap: i Sapienti sono gli AMBASCIATORI delle macro-aree — i rami L1 più ricchi,
    // uno per area, fino a _gardenSapientiMax() (il Sapiente introduce il suo dungeon nella
    // discesa per-ramo, Fase 2 hub).
    var cap = _gardenSapientiMax();
    var st = _getAppState(), nodes = (st && st.db && st.db.nodes) || [];
    var l1 = nodes.filter(function (n) { return n.level === 1; });
    if (l1.length) {
      var byG = {}; nodes.forEach(function (n) { if (n.level > 0 && n.group != null) byG[n.group] = (byG[n.group] || 0) + 1; });
      return l1.slice().sort(function (a, b) { return (byG[b.group] || 0) - (byG[a.group] || 0); }).slice(0, cap);
    }
    var base = _levelsFromState() || [];
    var lv = base.filter(function (b) { return b.level > 0; });
    var pool = (lv[0] && lv[0].nodes) || (base[0] && base[0].nodes) || [];
    return pool.slice(0, cap);
  }
  // Custode del Sapere vicino allo spawn — condiviso tra giardino procedurale e mappa curata (HUB S2)
  function _placeCustode(map) {
    if (!_custodeOn()) return;
    var ck = null, cbest = 1e9;
    for (var k2 in map) {
      if (map[k2] !== 0 || DUN.gardenNpcs[k2]) continue;
      var p2 = k2.split(',').map(Number);
      if (p2[0] === DUN.sx && p2[1] === DUN.sy) continue;
      var d2 = Math.abs(p2[0] - DUN.px) + Math.abs(p2[1] - DUN.py);
      if (d2 >= 2 && d2 < cbest) { cbest = d2; ck = k2; }
    }
    if (ck) {
      var cp = ck.split(',').map(Number);
      DUN.gardenNpcs[ck] = { id: 'gnpc_custode', custode: true, x: cp[0], y: cp[1], node: null, label: 'Custode del Sapere', desc: _custodeOverview(), seeded: false, anim: PLAYER_ANIM_F, history: [] };
      delete DUN.gardenFlowers[ck];
    }
  }
  // ── giardino da MAPPA CURATA (map-editor): tile disegnati a mano, Sapienti sugli slot, gatekeeper = discesa
  function _loadGardenFromMap(i, f, m) {
    var map = {}; for (var mk in m.map) map[mk] = m.map[mk];   // copia: la cache non va mutata
    DUN.map = map; DUN.w = m.cols; DUN.h = m.rows; DUN.quota = null;
    DUN.gardenFloor = true; DUN.gardenWater = m.water; DUN.gardenNpcs = {}; DUN.gateRoom = null;
    DUN.gardenTrees = {}; DUN.gardenFlowers = {};   // decor gestito da customDraw
    DUN.customMap = m;
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {}; DUN.boss = null; DUN.torches = [];
    DUN.theme = { n: 'giardino', t: '#79a85f' };
    DUN.themeTiles = { floor: [7, 0], wall: [0, 5] };
    DUN.px = m.spawn[0]; DUN.py = m.spawn[1];
    // discesa = posizione del gatekeeper disegnato in mappa (fallback: prima cella libera in alto)
    DUN.sx = DUN.sy = -1;
    if (m.gatekeeper) { DUN.sx = m.gatekeeper.x; DUN.sy = m.gatekeeper.y; }
    else { outer: for (var y = 0; y < m.rows; y++) for (var x = 0; x < m.cols; x++) if (map[x + ',' + y] === 0) { DUN.sx = x; DUN.sy = y; break outer; } }
    // Sapienti sugli slot NPC della mappa (già rilocati dal loader se su celle non valide)
    (f.nodes || []).forEach(function (nd, idx) {
      var slot = m.npcs[idx]; if (!slot) return;
      var nk = slot.x + ',' + slot.y;
      DUN.gardenNpcs[nk] = { id: 'gnpc_' + nd.id, x: slot.x, y: slot.y, node: nd, label: _clean(nd.label), desc: _desc(nd), seeded: false, anim: PLAYER_ANIM_F, sprDef: CMAP_NPC_SPR[idx % CMAP_NPC_SPR.length] };
    });
    _placeCustode(map);
    _refreshNpcWilt();   // Fase 3: stato Tamagotchi dei Sapienti
    _dailyQuest();       // Fase 4: quest del giorno (solo invito)
    _initNpcBehaviors(); // Slice 2: behaviors (flag mappai_npc_garden_enabled)
    // lista di disegno y-sorted: decor solido + ambient + ancore non solide (book/scroll/key)
    var L = window.MappAIMapLoader, drawList = m.decor.concat(m.ambient);
    m.anchors.forEach(function (a) { if (!L || !L.SOLID_OBJ[a.name]) drawList.push(a); });
    drawList.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    DUN.customDraw = drawList;
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    _computeFOV();
    DUN.raduraTotems = null;
    var st = _getAppState();
    _msg(_tSafe('dg_garden1', '🌿 Giardino di {r}: clicca i 🧙 per ascoltarli, poi raggiungi il guardiano 🔮 per scendere nel dungeon.').replace('{r}', ((st && st.rootNodeLabel) || _tSafe('dg_study', 'studio'))));
    _hubMarkSeen();
  }
  function _loadGarden(i) {
    var f = DUN.floors[i]; DUN.fi = i;
    var CM = (DUN._gmap && _skin() === 'lol') ? DUN._gmap : null;   // mappa curata: solo skin LoL
    if (CM) return _loadGardenFromMap(i, f, CM);
    DUN.customMap = null; DUN.customDraw = null;
    // Giardino SEEDATO per-mappa (flag 'mappai_garden_seeded' default ON): la firma-mappa
    // determina laghetto/alberi/fiori/Sapienti → ogni mappa ha il SUO giardino, stabile a
    // ogni visita (principio dei loci: "il mio giardino di storia"). Mappe diverse = giardini
    // diversi. Kill-switch '0' → torna al prato casuale a ogni reload.
    var _Bg = window.MappAINpcBehavior, _gseed;
    try { _gseed = (_Bg && localStorage.getItem('mappai_garden_seeded') !== '0') ? _Bg.mulberry32(_Bg.strSeed('garden::' + _mapSig())) : Math.random; }
    catch (e) { _gseed = Math.random; }
    var w = 30, h = 20, map = {};
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) map[x + ',' + y] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 1 : 0;
    DUN.map = map; DUN.w = w; DUN.h = h; DUN.quota = null;
    DUN.gardenFloor = true; DUN.gardenWater = {}; DUN.gardenNpcs = {}; DUN.gateRoom = null;
    DUN.gardenTrees = {}; DUN.gardenFlowers = {};   // decor LoL: alberi (bloccanti), fiori (accento erba fiorita)
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {}; DUN.boss = null; DUN.torches = [];
    DUN.theme = { n: 'giardino', t: '#79a85f' };
    DUN.themeTiles = { floor: [7, 0], wall: [0, 5] };   // muschio: erba + siepe
    // pozza d'acqua
    var cx = 6 + Math.floor(_gseed() * (w - 14)), cy = 5 + Math.floor(_gseed() * (h - 10));
    for (var wy = cy; wy < cy + 3; wy++) for (var wx = cx; wx < cx + 4; wx++) { var wk = wx + ',' + wy; if (map[wk] != null && map[wk] === 0) { map[wk] = 1; DUN.gardenWater[wk] = true; } }
    // alberi (bloccanti, sprite grande tree.png) + fiori (non bloccanti, accento erba fiorita)
    for (var t = 0; t < 7; t++) { var tk = (1 + Math.floor(_gseed() * (w - 2))) + ',' + (1 + Math.floor(_gseed() * (h - 2))); if (map[tk] === 0) { map[tk] = 1; DUN.gardenTrees[tk] = true; } }
    for (var fl = 0; fl < 12; fl++) { var fk = (1 + Math.floor(_gseed() * (w - 2))) + ',' + (1 + Math.floor(_gseed() * (h - 2))); if (map[fk] === 0) DUN.gardenFlowers[fk] = true; }
    DUN.px = Math.floor(w / 2); DUN.py = Math.floor(h / 2); map[DUN.px + ',' + DUN.py] = 0;
    var open = []; for (var k in map) { if (map[k] === 0) { var p = k.split(',').map(Number); if (Math.abs(p[0] - DUN.px) + Math.abs(p[1] - DUN.py) > 3) open.push(k); } }
    open.sort(function () { return _gseed() - 0.5; });
    DUN.sx = DUN.sy = -1;
    if (open.length) { var c = open.pop().split(',').map(Number); DUN.sx = c[0]; DUN.sy = c[1]; }   // castello = punto di discesa
    (f.nodes || []).forEach(function (nd, idx) {
      if (!open.length) return;
      var nk = open.pop(), np = nk.split(',').map(Number);
      // sprite ciclato per distinguere visivamente i Sapienti (>4 → colori si ripetono, ok)
      DUN.gardenNpcs[nk] = { id: 'gnpc_' + nd.id, x: np[0], y: np[1], node: nd, label: _clean(nd.label), desc: _desc(nd), seeded: false, anim: PLAYER_ANIM_F, sprDef: CMAP_NPC_SPR[idx % CMAP_NPC_SPR.length] };
      delete DUN.gardenFlowers[nk];   // niente fiore sotto il Sapiente (il piedistallo arriva con la Slice 3 Sapienti)
    });
    // HUB S2: Custode del Sapere — guida fissa vicino allo spawn (flag 'mappai_hub_custode')
    _placeCustode(map);
    _refreshNpcWilt();   // Fase 3: stato Tamagotchi dei Sapienti
    _dailyQuest();       // Fase 4: quest del giorno (solo invito)
    _initNpcBehaviors(); // Slice 2: behaviors (flag mappai_npc_garden_enabled)
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    _computeFOV();
    var st = _getAppState();
    DUN.raduraTotems = null;
    _msg(_tSafe('dg_garden2', '🌿 Giardino di {r}: clicca i 🧙 per ascoltarli, poi entra nel castello 🏰 (scale) per il dungeon.').replace('{r}', ((st && st.rootNodeLabel) || _tSafe('dg_study', 'studio'))));
    _hubMarkSeen();   // HUB S1: prima visita al giardino registrata per questo vault
  }
  // ───── RADURA (S4): intermezzo FE all'aperto — scaffolding funzioni esecutive, zero nemici ─────
  // Riusa lo scheletro del giardino (FOV aperto, alberi/fiori) + 2 totem 🏮 facoltativi e time-boxed:
  // sequenza/calcolo (WM) e stop/go (inibizione). Anti-seduzione: max 2 attività, nessuna ricompensa.
  function _raduraOn() { try { return localStorage.getItem('mappai_radura') !== '0'; } catch (e) { return true; } }
  function _loadRadura(i) {
    DUN.fi = i;
    var w = 24, h = 15, map = {};
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) map[x + ',' + y] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 1 : 0;
    DUN.map = map; DUN.w = w; DUN.h = h; DUN.quota = null;
    DUN.gardenFloor = true; DUN.gardenWater = {}; DUN.gardenNpcs = {}; DUN.gateRoom = null;
    DUN.gardenTrees = {}; DUN.gardenFlowers = {}; DUN.raduraTotems = {};
    DUN.customMap = null; DUN.customDraw = null;
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {}; DUN.boss = null; DUN.torches = [];
    DUN.theme = { n: 'radura', t: '#79a85f' };
    DUN.themeTiles = { floor: [7, 0], wall: [0, 5] };   // fallback skin fantastic: erba + siepe
    for (var t = 0; t < 5; t++) { var tk = (1 + Math.floor(Math.random() * (w - 2))) + ',' + (1 + Math.floor(Math.random() * (h - 2))); if (map[tk] === 0) { map[tk] = 1; DUN.gardenTrees[tk] = true; } }
    for (var fl = 0; fl < 8; fl++) { var fk = (1 + Math.floor(Math.random() * (w - 2))) + ',' + (1 + Math.floor(Math.random() * (h - 2))); if (map[fk] === 0) DUN.gardenFlowers[fk] = true; }
    DUN.px = Math.floor(w / 2); DUN.py = Math.floor(h / 2); map[DUN.px + ',' + DUN.py] = 0;
    var open = []; for (var k in map) { if (map[k] === 0) { var p = k.split(',').map(Number); if (Math.abs(p[0] - DUN.px) + Math.abs(p[1] - DUN.py) > 3) open.push(k); } }
    open.sort(function () { return Math.random() - 0.5; });
    DUN.sx = DUN.sy = -1;
    if (open.length) { var c = open.pop().split(',').map(Number); DUN.sx = c[0]; DUN.sy = c[1]; }
    ['unlock', 'stopgo'].forEach(function (kind) {
      if (!open.length) return;
      var tk2 = open.pop(), tp = tk2.split(',').map(Number);
      DUN.raduraTotems[tk2] = { kind: kind, x: tp[0], y: tp[1], done: false };
      delete DUN.gardenFlowers[tk2];
    });
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    _computeFOV();
    _logEv('radura', { fi: i });
    _msg(_tSafe('dg_clearing', '🌾 Una radura tranquilla: allenati ai totem 🏮 se vuoi (facoltativo), poi scendi 🔽.'));
  }
  function _raduraTotem(tt) {
    var after = function (res) { tt.done = true; _logEv('radura_totem', { kind: tt.kind, ok: !!(res && res.success) }); _msg(res && res.success ? '🏮 Totem completato.' : '🏮 Totem tentato — lo ritroverai più avanti nel cammino.'); };
    if (tt.kind === 'stopgo') _runStopGo({ trials: 10 }, after);
    else startUnlock({}, after);
  }
  function _npcGenerate(gn, theme, userText) {
    return new Promise(function (resolve) {
      var _tone = (gn.persona && gn.persona.tone) || 'misterioso e gentile';   // voce dal carattere del Sapiente
      var sys = window.fillPromptTemplate ? window.fillPromptTemplate('NPC_NARRATOR', { nodeLabel: gn.label, nodeDesc: gn.desc, theme: theme, tone: _tone }) : '';
      var modelPath = null; try { modelPath = localStorage.getItem('mappai_npc_model_path'); } catch (e) {}
      gn.history = gn.history || [];
      // chiude il turno: salva user+model nella storia (per il cloud e per coerenza) e risolve
      function finish(txt) { gn.history.push({ role: 'user', text: userText }); gn.history.push({ role: 'model', text: txt }); if (gn.history.length > 16) gn.history = gn.history.slice(-16); resolve(txt); }
      function cloud() {
        if (sys && window.fetchModelAPI && window.getSystemKey && window.getSystemKey()) {
          var contents = gn.history.map(function (h) { return { role: h.role, parts: [{ text: h.text }] }; });   // storia → multi-turn
          contents.push({ role: 'user', parts: [{ text: userText }] });
          var payload = { contents: contents, systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: 0.6, maxOutputTokens: 320 } };
          if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'dungeon');
          window.fetchModelAPI(payload, window.getSystemKey()).then(function (r) { var tx = r && r.candidates && r.candidates[0] && r.candidates[0].content.parts[0].text; finish(tx ? tx.trim() : (gn.desc || gn.label)); }).catch(function () { finish(gn.desc || gn.label); });
        } else finish(gn.desc || ('Sono ' + gn.label + '.'));
      }
      // LOCALE: la sessione node-llama-cpp (npcId) mantiene già la storia lato motore → invio solo il nuovo messaggio
      if (modelPath && window.electronAPI && window.electronAPI.generateLocalNPC && sys) {
        window.electronAPI.generateLocalNPC({ npcId: gn.id, systemPrompt: sys, userText: userText, modelPath: modelPath, temperature: 0.6, maxTokens: 320, stream: false }).then(function (r) { if (r && r.success && r.text) finish(r.text.trim()); else cloud(); }).catch(cloud);
      } else cloud();
    });
  }
  // ─────────────── HUB Fase 3: Sapienti-Tamagotchi — il decay rende visibile lo spaced retrieval ───────────────
  // Il Sapiente "appassisce" (🥀, sprite sbiadito) quando ≥2 memorie della SUA macro-area sono deboli
  // o stantie (_needReview ≥ 1). Mai punitivo (SDT): ripassare con lui è un'OFFERTA nel dialogo; i
  // record 'dungeon_review' rinfrescano la mastery e il Sapiente rifiorisce subito.
  function _npcBranchDiary(gn) {
    if (!gn || !gn.node || gn.node.group == null || !DUN || !DUN.diary) return [];
    var seen = {};
    return DUN.diary.filter(function (d) {
      if (d.ghost || seen[d.id]) return false;
      var nd = _nodeById(d.id);
      if (!nd || nd.group !== gn.node.group) return false;
      seen[d.id] = 1; return true;
    });
  }
  function _refreshNpcWilt() {
    if (!DUN || !DUN.gardenNpcs) return;
    for (var k in DUN.gardenNpcs) {
      var gn = DUN.gardenNpcs[k];
      if (gn.custode) continue;
      var stale = _npcBranchDiary(gn).filter(function (d) { return _needReview(d.id) >= 1; });
      stale.sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); });
      gn.wiltEntries = stale;
      gn.wilt = stale.length >= 2;   // una sola memoria debole non fa appassire (niente ansia)
    }
  }
  // Fase 4: quest del giorno — il Sapiente più appassito chiede visita. Una sola proposta al giorno
  // per mappa ('mappai_hub_quest__<sig>'); completarla = fare il suo ripasso. Solo invito, mai obbligo.
  function _questKey() { return 'mappai_hub_quest__' + _mapSig(); }
  function _dailyQuest() {
    try {
      var today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(_questKey()) === today) return;
      var best = null, bn = 0;
      for (var k in DUN.gardenNpcs) { var gn = DUN.gardenNpcs[k]; if (!gn.custode && gn.wilt && gn.wiltEntries.length > bn) { bn = gn.wiltEntries.length; best = gn; } }
      if (!best) return;
      DUN.quest = { npcId: best.id, label: best.label, n: bn };
      _logEv('hub_quest', { n: bn });
      _msg(_tSafe('dg_daily_quest', '🌱 Quest del giorno: 🥀 {l} ha {n} memorie da rinfrescare — vai a trovarlo.').replace('{l}', best.label).replace('{n}', bn));
    } catch (e) {}
  }
  // ── NPC Slice 2 (SDS §6): behaviors nel giardino — logica pura in mappai-npc-behavior.js ──
  // Flag 'mappai_npc_garden_enabled' (SDS §9): default ON (i Sapienti vivono il giardino).
  // Kill-switch '0' per tornare al prato statico. Seed = progetto+mappa → coreografia
  // deterministica (stesso prato e stessi caratteri per tutta la classe).
  function _npcGardenOn() { try { return localStorage.getItem('mappai_npc_garden_enabled') !== '0'; } catch (e) { return true; } }
  function _initNpcBehaviors() {
    if (!DUN || !DUN.gardenNpcs || !_npcGardenOn() || !window.MappAINpcBehavior) { if (DUN) DUN._npcRng = null; return; }
    var B = window.MappAINpcBehavior, st = _getAppState();
    var root = (st && st.rootNodeLabel) || '';
    DUN._npcRng = B.mulberry32(B.strSeed(root + '::' + _gardenMapName()));
    for (var k in DUN.gardenNpcs) {
      var gn = DUN.gardenNpcs[k];
      // personalità deterministica per Sapiente (nodo+mappa): carattere stabile per la classe.
      // Il Custode resta senza carattere (guida fissa, statica).
      var persona = (!gn.custode && gn.node && B.pickPersonality)
        ? B.pickPersonality(B.strSeed(root + '::' + String(gn.node.id))) : null;
      gn.persona = persona;
      gn.beh = B.mkBehavior((gn.custode || gn.wilt) ? 'static' : 'wander', gn.x, gn.y, 2, persona);
    }
  }
  function _npcCellFree(x, y) {
    var k = x + ',' + y;
    if (DUN.map[k] !== 0 || DUN.gardenNpcs[k]) return false;
    if (x === DUN.px && y === DUN.py) return false;
    if (x === DUN.sx && y === DUN.sy) return false;   // mai sopra la discesa/guardiano
    return true;
  }
  function _npcTick() {
    if (!DUN || !DUN.gardenFloor || !DUN.gardenNpcs || !DUN._npcRng) return;
    var B = window.MappAINpcBehavior; if (!B) return;
    var now = performance.now();
    for (var k in DUN.gardenNpcs) {
      var gn = DUN.gardenNpcs[k]; if (!gn.beh) continue;
      gn.beh.type = (gn.custode || gn.wilt) ? 'static' : 'wander';   // appassito = senza energie, fermo (riparte dopo il ripasso)
      var pd = Math.abs(gn.x - DUN.px) + Math.abs(gn.y - DUN.py);
      var moved = B.stepNpc(gn.beh, { now: now, rng: DUN._npcRng, walkable: _npcCellFree, playerDist: pd, triggerRadius: 2 });
      if (moved) {
        delete DUN.gardenNpcs[k];
        gn.x = gn.beh.x; gn.y = gn.beh.y;
        DUN.gardenNpcs[gn.x + ',' + gn.y] = gn;   // re-key: click e _arrive continuano a trovarlo
      }
      // emote-bubble occasionale col termine-chiave del nodo (priming passivo);
      // cadenza dal carattere (il "curioso" parla spesso, il "contemplativo" di rado)
      if (gn.node && !gn.custode && now >= (gn.beh.nextEmoteT || 0)) {
        var em = gn.beh.emoteMs || [8000, 8000];
        gn.beh.nextEmoteT = now + em[0] + DUN._npcRng() * em[1];
        gn.beh.emoteTerm = B.pickEmoteTerm(gn.label, gn.desc, DUN._npcRng);
        gn.beh.emoteUntil = gn.beh.emoteTerm ? now + 2200 : 0;
      }
    }
  }
  // ── NPC Slice 3 (SDS §7): economia coins → storie CROSS-LINK ──
  // Priming gratis alla prima visita; al ritorno il Sapiente può narrare (2 monete) un ARCO
  // del grafo che collega la SUA macro-area a un'altra = elaborative encoding a pagamento.
  // Anti-allucinazione: le desc dei DUE nodi vanno nel seed (l'LLM veste, non inventa).
  // La storia entra nel diario come voce kind 'rel' → gate/boss la interrogano.
  var NPC_XLINK_COST = 2;
  function _xlinkKey() { return 'mappai_npc_xlinks__' + _mapSig(); }
  function _xlinkBought() { try { var o = JSON.parse(localStorage.getItem(_xlinkKey()) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function _xlinkMark(key) { var o = _xlinkBought(); o[key] = 1; _lsSet(_xlinkKey(), JSON.stringify(o)); }
  function _npcCrossLink(gn) {
    if (!gn || !gn.node || gn.node.group == null) return null;
    var st = _getAppState(); if (!st || !st.db) return null;
    var links = st.db.links || [], bought = _xlinkBought(), cand = [];
    links.forEach(function (l) {
      if (!l || !l.rel) return;
      var s = _nodeById(_lid(l.source)), t = _nodeById(_lid(l.target));
      if (!s || !t || s.group == null || t.group == null || s.group === t.group) return;   // solo archi INTER-area
      var a = (s.group === gn.node.group) ? s : ((t.group === gn.node.group) ? t : null);
      if (!a) return;
      var b = (a === s) ? t : s, key = a.id + '__' + b.id;
      if (bought[key]) return;
      cand.push({ a: a, b: b, rel: _clean(l.rel), key: key });
    });
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }
  // ── NPC Slice 1 (SDS §5): persistenza chat nel Vault, cartella "Dialoghi NPC" ──
  // Riusa l'IPC save-chat-transcript (append-only, header solo a file nuovo). Senza vault
  // attivo → skip silenzioso (niente file orfani nella cartella globale). Niente PII:
  // si salvano solo label del nodo e testo dei turni (coerente con l'anonimato JIGSAW).
  function _npcVaultSaveOn() { try { return localStorage.getItem('mappai_npc_vault_save') !== '0'; } catch (e) { return true; } }
  function _saveNpcTurn(gn, playerText, npcText) {
    if (!_npcVaultSaveOn()) return;
    try {
      var st = _getAppState();
      if (!st || !st.activeVaultPath) return;   // mappa mai salvata nel vault → skip
      if (!window.electronAPI || typeof window.electronAPI.saveChatTranscript !== 'function') return;
      var d = new Date(), tm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      var lines = [];
      if (playerText) lines.push('[' + tm + '] 🧑 Player: ' + playerText);
      if (npcText) lines.push('[' + tm + '] 🧙 ' + gn.label + ': ' + npcText);
      if (!lines.length) return;
      var p = window.electronAPI.saveChatTranscript({
        projectName: st.rootNodeLabel || 'MappAI',
        targetName: gn.label,
        subFolder: 'Dialoghi NPC',
        vaultPath: st.activeVaultPath,
        textContent: lines.join('\n')
      });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function _openGardenNpc(gn) {
    DUN.busy = true;
    var ov = _overlay(); ov.card.style.width = 'min(620px,95vw)'; ov.card.style.color = '#1e293b'; ov.card.style.background = '#fff';
    // HUB S2: il Custode ha bottoni-azione deterministici (percorso di studio / prova d'ingresso)
    var acts = '';
    if (!gn.custode && gn.wilt && gn.wiltEntries && gn.wiltEntries.length) {
      acts = '<div style="margin-top:10px"><button id="gn-ripassa" class="btn" type="button" style="width:100%">🥀→🌿 Ripassa con me — ' + gn.wiltEntries.length + ' memorie da rinfrescare</button></div>';
    }
    // Slice 3: storia cross-link al ritorno (solo se il Sapiente è già stato ascoltato una volta)
    var xl = (!gn.custode && gn.seeded) ? _npcCrossLink(gn) : null;
    if (xl) {
      var afford = DUN.coins >= NPC_XLINK_COST;
      acts += '<div style="margin-top:8px"><button id="gn-xlink" class="btn" type="button" style="width:100%' + (afford ? '' : ';opacity:.55;cursor:not-allowed') + '" title="' + (afford ? 'Un arco del grafo, narrato' : 'Ti servono ' + NPC_XLINK_COST + ' monete: le trovi nel dungeon') + '">🪙 Raccontami un legame segreto (' + NPC_XLINK_COST + ' monete — hai $' + DUN.coins + ')</button></div>';
    }
    if (gn.custode) {
      var hasSP = !!(window.MappAIStudyPath && window.MappAIStudyPath.open);
      var hasProva = _hubAssessOn() && (typeof _provaViandante === 'function');
      if (hasSP || hasProva) acts = '<div style="display:flex;gap:8px;margin-top:10px">' +
        (hasSP ? '<button id="gn-sp" class="btn" style="flex:1">🧭 Percorso di studio</button>' : '') +
        (hasProva ? '<button id="gn-prova" class="btn" style="flex:1">🥾 Prova del Viandante</button>' : '') +
        '</div>';
    }
    ov.card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><b>' + (gn.custode ? '🦉' : '🧙') + ' ' + gn.label + '</b><button id="gn-x" class="btn">chiudi</button></div>' +
      '<div id="gn-body" style="max-height:42vh;overflow:auto;font-size:14px;line-height:1.6"></div>' +
      acts +
      '<div style="display:flex;gap:8px;margin-top:10px"><input id="gn-in" placeholder="Chiedi qualcosa…" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;color:#1e293b"><button id="gn-send" class="btn">Invia</button></div>';
    function close() { ov.close(); DUN.busy = false; }
    var un = _esc(close);
    ov.card.querySelector('#gn-x').onclick = function () { un(); close(); };
    var body = ov.card.querySelector('#gn-body');
    var theme = (_getAppState() && _getAppState().rootNodeLabel) || 'un mondo di studio';
    function ask(userText, seed) {
      var think = document.createElement('div'); think.style.color = '#94a3b8'; think.style.fontStyle = 'italic'; think.textContent = '…'; body.appendChild(think); body.scrollTop = body.scrollHeight;
      _npcGenerate(gn, theme, seed || userText).then(function (txt) {
        think.remove();
        if (userText && !seed) { var um = document.createElement('div'); um.style.cssText = 'color:#4f46e5;font-weight:bold;margin-top:6px'; um.textContent = '🧒 ' + userText; body.appendChild(um); }
        var pp = document.createElement('div'); pp.style.margin = '4px 0 8px'; pp.textContent = txt; body.appendChild(pp); body.scrollTop = body.scrollHeight; gn.seeded = true;
        _saveNpcTurn(gn, (userText && !seed) ? userText : null, txt);   // Slice 1: turno → Vault/Dialoghi NPC
      });
    }
    if (gn.custode) {
      // apertura deterministica (zero LLM): panoramica mappa + cammino; la chat libera resta AI
      gn.desc = _custodeOverview();   // refresh (la mastery può essere cambiata dall'ultimo load)
      var pp0 = document.createElement('div'); pp0.style.margin = '4px 0 8px'; pp0.textContent = gn.desc; body.appendChild(pp0); gn.seeded = true;
    } else {
      ask(null, gn.seeded ? (_dgEn() ? 'Greet the player again in a single sentence and ask what they would like to know.' : 'Saluta di nuovo il giocatore in una sola frase e chiedigli cosa vuole sapere.') : (_dgEn() ? 'Introduce yourself to me in 3 sentences: 1) who you are, tied to the theme; 2) one concrete fact taken from the CONTENT, with a name or key term; 3) an open question that makes me curious. Do not give away the answer to that question.' : 'Salutami presentandoti in 3 frasi: 1) chi sei, legato al tema; 2) un fatto concreto preso dal CONTENUTO con un nome o termine chiave; 3) una domanda aperta che mi incuriosisce. Non dare la risposta alla domanda.'));
    }
    if (gn.custode) {
      var spb = ov.card.querySelector('#gn-sp');
      if (spb) spb.onclick = function () { _logEv('hub_custode_studypath'); un(); close(); _closeDungeon(); try { window.MappAIStudyPath.open(); } catch (e) {} };
      var pvb = ov.card.querySelector('#gn-prova');
      if (pvb) pvb.onclick = function () { _logEv('hub_custode_prova'); un(); close(); _provaViandante(); };
    }
    // Slice 3: acquisto storia cross-link — scala le monete, narra l'arco, salva nel diario (kind rel)
    var xb = ov.card.querySelector('#gn-xlink');
    if (xb && xl) xb.onclick = function () {
      if (DUN.coins < NPC_XLINK_COST) { _msg(_tSafe('dg_need_coins', '🪙 Ti servono {n} monete — le lasciano i nemici del dungeon.').replace('{n}', NPC_XLINK_COST)); return; }
      DUN.coins -= NPC_XLINK_COST;
      _xlinkMark(xl.key);
      xb.disabled = true; xb.style.opacity = '.55';
      var seed = _dgEn()
        ? ('Tell me in exactly 3 sentences how «' + _clean(xl.a.label) + '» is connected to «' + _clean(xl.b.label) + '» through «' + xl.rel + '». ' +
          'Use ONLY these two CONTENTS, invent nothing.\nCONTENT A (' + _clean(xl.a.label) + '): ' + _softCut(_desc(xl.a) || '', 400) +
          '\nCONTENT B (' + _clean(xl.b.label) + '): ' + _softCut(_desc(xl.b) || '', 400))
        : ('Racconta in esattamente 3 frasi come «' + _clean(xl.a.label) + '» è legato a «' + _clean(xl.b.label) + '» tramite «' + xl.rel + '». ' +
          'Usa SOLO questi due CONTENUTI, non inventare nulla.\nCONTENUTO A (' + _clean(xl.a.label) + '): ' + _softCut(_desc(xl.a) || '', 400) +
          '\nCONTENUTO B (' + _clean(xl.b.label) + '): ' + _softCut(_desc(xl.b) || '', 400));
      ask(null, seed);
      _addDiary(xl.a, 'rel', { rel: { targetId: xl.b.id, targetLabel: _clean(xl.b.label), rel: xl.rel } });
      _logEv('npc_crosslink', { a: xl.a.id, b: xl.b.id });
      _msg(_tSafe('dg_xlink_revealed', '🪙 {g} ti ha svelato un legame: «{a} → {r} → {b}» (nel diario, sezione 🏺).').replace('{g}', gn.label).replace('{a}', _clean(xl.a.label)).replace('{r}', xl.rel).replace('{b}', _clean(xl.b.label)));
    };
    // Fase 3: ripasso Tamagotchi — quiz sui nodi deboli/stantii della macro-area del Sapiente
    var rb = ov.card.querySelector('#gn-ripassa');
    if (rb) rb.onclick = function () {
      un(); close();
      var subs = gn.wiltEntries.slice(0, 3).map(_poolEntry);
      var pool = DUN.diary.filter(function (d) { return !d.ghost; }).map(_poolEntry);
      _logEv('npc_review', { group: gn.node && gn.node.group, n: subs.length });
      _runQuiz(pool, subs.length, 'Ripasso con ' + gn.label, false, function (c, t) {
        _refreshNpcWilt();
        _msg(c === t ? '🌿 ' + gn.label + ' rifiorisce: memorie fresche!' : '🌱 Ripasso fatto (' + c + '/' + t + ') — torna a trovarlo presto.');
        if (DUN.quest && DUN.quest.npcId === gn.id) {   // Fase 4: quest del giorno completata
          DUN.quest = null; _lsSet(_questKey(), new Date().toISOString().slice(0, 10));
          _logEv('hub_quest_done', { ok: c, tot: t }); _msg(_tSafe('dg_quest_done', '✦ Quest del giorno completata!'));
        }
      }, subs, 'dungeon_review');
    };
    ov.card.querySelector('#gn-send').onclick = function () { var inp = ov.card.querySelector('#gn-in'); var m = inp.value.trim(); if (!m) return; inp.value = ''; ask(m); };
    ov.card.querySelector('#gn-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ov.card.querySelector('#gn-send').click(); } });
  }

  function _onDunClick(e) {
    if (!DUN || DUN.path || DUN.duel || !DUN.cv) return;
    var TS = DUN.TS, rect = DUN.cv.getBoundingClientRect();
    var camX = DUN.px * TS - DUN.cv.width / 2 + TS / 2, camY = DUN.py * TS - DUN.cv.height / 2 + TS / 2;
    var wx = Math.floor((e.clientX - rect.left + camX) / TS), wy = Math.floor((e.clientY - rect.top + camY) / TS);
    if (window.MappAIDungeonVoxel && window.MappAIDungeonVoxel.active()) {   // §19 F1: pick 3D al posto della proiezione 2D
      var vp = window.MappAIDungeonVoxel.pick(e);
      if (!vp) return;
      wx = vp.x; wy = vp.y;
    }
    if (DUN.gardenNpcs && DUN.gardenNpcs[wx + ',' + wy]) { _openGardenNpc(DUN.gardenNpcs[wx + ',' + wy]); return; }   // clic diretto su NPC → chat (no pathing)
    if (DUN.gateRoom && !DUN.gateRoom.passed && wx === DUN.gateRoom.bx && wy === DUN.gateRoom.by) { _gateRoomChallenge(); return; }   // clic sul beholder → quiz
    // mappa-mondo: clic sul cancello 🚪 → prova ad aprirlo (serve essere accanto)
    if (DUN.world) {
      var wg = _worldGateAt(wx, wy);
      if (wg && !wg.open) {
        if (Math.abs(wx - DUN.px) + Math.abs(wy - DUN.py) <= 2) _gateTry(wg);
        else _msg(_tSafe('dg_wgate_near', '🚪 Avvicinati al cancello per parlare col guardiano.'));
        return;
      }
    }
    if (DUN.map[wx + ',' + wy] !== 0 || !DUN.explored[wx + ',' + wy]) return;
    var path = [];
    if (DUN.quota) {
      // §21: archi quota-aware — rot.js A* non basta (callback solo (x,y), l'arco
      // dipende da ENTRAMBE le celle). BFS in core, stesso formato (partenza inclusa).
      var Cq = _core();
      path = (Cq && Cq.findPathQuota && Cq.findPathQuota(DUN.map, DUN.quota, DUN.px, DUN.py, wx, wy)) || [];
      if (!path.length) { _msg(_tSafe('dg_cliff', '⛰ Troppo in alto (o in basso): serve una via con gradini.')); return; }
    } else {
      var astar = new ROT.Path.AStar(wx, wy, function (x, y) { return DUN.map[x + ',' + y] === 0; }, { topology: 4 });
      astar.compute(DUN.px, DUN.py, function (x, y) { path.push([x, y]); });
    }
    if (path.length < 2) { _arrive(wx, wy); return; }
    path.shift();
    DUN.path = { steps: path, last: Date.now(), wait: 110 };
  }
  function _dunTick() {
    if (!DUN) return;
    if (DUN.busy) return;                                  // modal aperto → gioco in pausa (fix: niente colpi durante i puzzle)
    if (DUN.hp < DUN.maxhp && Date.now() - DUN.hpTimer >= 10000) { DUN.hp++; DUN.hpTimer = Date.now(); }
    if (DUN.duel) { if (Date.now() > DUN.duel.deadline) _duelTimeout(); return; }
    _keyDrive();                                           // hold WASD/frecce: passi finché i tasti restano premuti
    if (DUN.path && Date.now() - DUN.path.last >= (DUN.path.wait || 110)) {
      var px0 = DUN.px, py0 = DUN.py, s = DUN.path.steps.shift();
      if (DUN.quota) {   // §21: il passo può essere salto (arco, più lento) o discesa
        var Ck = _core();
        var kind = (Ck && Ck.stepKindGrid) ? Ck.stepKindGrid(DUN.map, DUN.quota, px0 + ',' + py0, s[0] + ',' + s[1]) : 'walk';
        if (kind === 'blocked') { DUN.path = null; return; }   // path stantio (mappa cambiata sotto i piedi)
        DUN.path.wait = kind === 'jump' ? 320 : 110;
        if (kind === 'jump') { DUN.jumpFx = { x0: px0, y0: py0, x1: s[0], y1: s[1], t0: Date.now(), d: 320 }; _snd('powerup'); }
        else if (kind === 'fall') DUN.fallFx = { t0: Date.now(), d: 200 };
      }
      DUN.px = s[0]; DUN.py = s[1]; DUN.path.last = Date.now();
      DUN.facing = [DUN.px - px0, DUN.py - py0];           // direzione per la spell
      _computeFOV(); _checkPickup();
      var srcHere = DUN.sources[DUN.px + ',' + DUN.py];   // camminare SOPRA una memory unit avvia il puzzle (prima serviva il click esatto sul tile)
      if (srcHere && !srcHere.extracted) { DUN.path = null; _interactSource(srcHere); return; }
      var adj = [_mobAt(DUN.px + 1, DUN.py), _mobAt(DUN.px - 1, DUN.py), _mobAt(DUN.px, DUN.py + 1), _mobAt(DUN.px, DUN.py - 1)]
        .filter(_mobEngage)[0];   // §21: un mob su un altro livello z non ingaggia
      if (adj) { DUN.path = null; _startDuel(adj); return; }
      if (!DUN.path.steps.length) { var fx = DUN.px, fy = DUN.py; DUN.path = null; _arrive(fx, fy); }
    }
    if (DUN.gardenFloor) _npcTick();   // Slice 2: i Sapienti vivono (pausa automatica: DUN.busy esce prima)
    _mobTick();
    if (DUN.world) { try { _worldBridgeTick(); } catch (e) {} }   // §20 ponte-fluency (fail-safe: mai bloccare il tick)
  }
  function _checkPickup() {
    var key = DUN.px + ',' + DUN.py, it = DUN.items && DUN.items[key];
    if (!it) return;
    delete DUN.items[key]; _snd('pickup');
    if (it.type === 'coin') { DUN.coins++; _msg(_tSafe('dg_coin', 'Moneta raccolta ({n}).').replace('{n}', DUN.coins)); }
    else if (it.type === 'gem') { DUN.gems++; _msg(_tSafe('dg_gem', 'Gemma raccolta ({n}).').replace('{n}', DUN.gems)); }
    else if (it.type === 'potion_blue') { DUN.mana = Math.min(DUN.maxMana, DUN.mana + 1); _msg(_tSafe('dg_potion_blue', 'Pozione blu: +1 mana.')); }
    else if (it.type === 'potion_green') { DUN.mana = DUN.maxMana; _msg(_tSafe('dg_potion_green', 'Pozione verde: mana al massimo!')); }
  }
  // diario persistito tra sessioni (Quick win A) — le note erano già in mappai_dungeon_notes, ora anche le voci
  // chiave per-MAPPA: ogni mappa ha diario/note/sintesi propri (fix: il dungeon non eredita i contenuti della mappa precedente)
  function _mapSig() { var st = _getAppState(); var nodes = (st && st.db && st.db.nodes) || []; var base = ((st && st.rootNodeLabel) || '') + '#' + nodes.length; var h = 0; for (var i = 0; i < base.length; i++) h = (Math.imul(31, h) + base.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function _diaryKey() { return 'mappai_dungeon_diary__' + _mapSig(); }
  function _loadDiary() { try { var a = JSON.parse(localStorage.getItem(_diaryKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function _saveDiary() { _lsSet(_diaryKey(), JSON.stringify(DUN.diary || [])); }
  // ── core puro (mappai-dungeon-core.js) — null se il file non è caricato (fallback inline nei chiamanti)
  function _core() { return window.MappAIDungeonCore || null; }
  // localStorage con esito (A4-A6): al PRIMO fallimento della sessione un solo avviso.
  // Flag in variabile di modulo, NON in localStorage (se lo storage è rotto non potremmo persisterlo).
  var _lsWarned = false;
  function _lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (e) {
      if (!_lsWarned) { _lsWarned = true; try { _toast('⚠ Salvataggio locale non riuscito — i progressi di gioco potrebbero non essere conservati', 'warning'); } catch (e2) {} }
      return false;
    }
  }
  // ── EVENT-LOG unificato (telemetria ECD c20/c21 — gap H). Chiave GLOBALE, campo `map`:
  // la meta-analisi docente è cross-mappa e il cap si gestisce in un punto solo. Additivo,
  // NON sostituisce le chiavi esistenti (skill/wm/duel/diary/notes/synthesis).
  var EV_KEY = 'mappai_dungeon_events';
  function _events() { try { var a = JSON.parse(localStorage.getItem(EV_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function _logEv(ev, data) {
    var e = { ts: Date.now(), ev: ev, map: _mapSig() };
    if (data) for (var k in data) if (data[k] !== undefined) e[k] = data[k];
    var arr = _events(); arr.push(e);
    var C = _core();
    arr = C ? C.capEvents(arr, 2000) : (arr.length > 2000 ? arr.slice(arr.length - 1500) : arr);   // fallback inline
    _lsSet(EV_KEY, JSON.stringify(arr));
  }
  // Nodi FANTASMA (A8): voci del diario il cui nodo non esiste più nella mappa. NON si cancellano
  // (è lavoro dello studente — BES): si marcano ghost e si escludono dai quiz. Restano leggibili nel diario.
  function _pruneDiary() {
    var changed = false;
    (DUN.diary || []).forEach(function (d) {
      var missing = !_nodeById(d.id);
      if (missing && !d.ghost) { d.ghost = true; changed = true; }
      else if (!missing && d.ghost) { delete d.ghost; changed = true; }   // il nodo è tornato (undo) → riabilita
    });
    if (changed) _saveDiary();
  }
  // voce diario con kind (desc/cite/rel) + eid univoco (un nodo può avere più memorie). fi = piano (spaced retrieval).
  function _addDiary(node, kind, extra) {
    kind = kind || 'desc'; extra = extra || {};
    var eid = (kind === 'rel' && extra.rel) ? (node.id + '__' + extra.rel.targetId) : (kind === 'cite' ? (node.id + '__cite') : String(node.id));
    for (var i = 0; i < DUN.diary.length; i++) if ((DUN.diary[i].eid || DUN.diary[i].id) === eid) return;
    var label = (kind === 'rel' && extra.rel) ? (_clean(node.label) + ' → ' + extra.rel.rel + ' → ' + extra.rel.targetLabel) : _clean(node.label);
    DUN.diary.push({ eid: eid, id: node.id, label: label, desc: (extra.text != null ? extra.text : _desc(node)), fi: DUN.fi, kind: kind });
    _saveDiary();
  }
  function _arrive(x, y) {
    if (DUN.gardenNpcs) { var gn = DUN.gardenNpcs[x + ',' + y]; if (gn) { _openGardenNpc(gn); return; } }
    if (DUN.gateRoom) { if (DUN.gateRoom.passed && x === DUN.sx && y === DUN.sy) _exitGateRoom(); return; }
    if (DUN.boss && !DUN.boss.defeated && x === DUN.boss.x && y === DUN.boss.y) { _startBoss(); return; }
    if (DUN.raduraTotems) { var tt = DUN.raduraTotems[x + ',' + y]; if (tt && !tt.done) { _raduraTotem(tt); return; } }   // S4: totem FE
    if (x === DUN.sx && y === DUN.sy) { _descend(); return; }
    var src = DUN.sources[x + ',' + y];
    if (src && !src.extracted) _interactSource(src);
    else if (src && src.extracted) {
      if (src.type === 'condotto' && src.open) { _conduitTravel(src); return; }   // §17: il condotto resta un fast-travel
      if (src.type === 'server') { _msg(_tSafe('dg_server_done', '🖥 Server già riavviato — la corrente regge.')); return; }
      _msg(_tSafe('dg_already_captured', '📓 «{l}» — memory già catturata.').replace('{l}', _clean(src.node.label)));   // niente silenzio: spiega perché il tile è lì ma non fa nulla
    }
  }
  function _interactSource(src) {
    if (src.type === 'condotto') return _conduitChallenge(src);   // §17: verbi delle relazioni (modo 6)
    if (src.type === 'server') return _bootChallenge(src);        // §17: sequenza di boot (modo 7)
    var t = SRC[src.type] || { modality: 'seq', kind: 'desc' };
    startUnlock(t, function (res) {
      if (res && res.success) {
        src.extracted = true;
        var cap = _memoryContent(src.node, t.kind);   // {kind, rel?} con fallback a desc
        _msg(_tSafe('dg_memory_unit', 'Memory unit: {l}').replace('{l}', _clean(src.node.label)));
        var doCapture = function () { _captureMemory(src.node, cap.kind, cap.rel); };   // cattura attiva → addDiary + record dentro la cattura
        if (src.mimic && _s17('mimic')) _mimicChallenge(src, doCapture); else doCapture();   // §17: memoria di un altro piano (modo 5)
      } else if (res && res.cooldown) { _msg(_tSafe('dg_access_fail', 'Accesso fallito — riprova più tardi.')); }
    });
  }
  // ───── CATTURA ATTIVA (gap #1 — encoding generativo) ─────
  // Non più "1 click → diario". Lo studente PRODUCE una sintesi con parole sue
  // (o ascolta la fonte e la trascrive a memoria) PRIMA che la memory unit entri
  // nel diario. La sintesi diventa la nota markdown del diario (riuso _saveNote).
  function _wordCount(s) { s = String(s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function _captureMin(node) { return Math.max(6, Math.min(20, Math.round(_wordCount(_desc(node)) * 0.25))); } // soglia adattiva, mai oltre 20 parole
  function _captureMemory(node, kind, rel, onDone) {
    if (typeof kind === 'function') { onDone = kind; kind = 'desc'; rel = null; }  // retrocompat firma vecchia
    kind = kind || 'desc'; onDone = onDone || function () {};
    var st = _getAppState(); var cites = (st && st.db && st.db.sourcesDict && st.db.sourcesDict[node.id]) || [];
    var refText, headLabel, hint, noteKey;
    if (kind === 'cite' && cites.length) { refText = _clean(cites[0].text || ''); headLabel = _clean(node.label) + ' · 📜 citazione'; hint = _tSafe('dg_hint_cite', 'Trascrivi o riformula la citazione con parole tue.'); noteKey = node.id + '__cite'; }
    else if (kind === 'rel' && rel) { refText = _clean(node.label) + '  →  ' + rel.rel + '  →  ' + rel.targetLabel; headLabel = '🏺 Relazione · ' + _clean(node.label); hint = _tSafe('dg_hint_rel', 'Spiega con parole tue PERCHÉ vale questa relazione.'); noteKey = node.id + '__' + rel.targetId; }
    else { kind = 'desc'; refText = _desc(node) || ''; headLabel = _clean(node.label); hint = ''; noteKey = String(node.id); }
    if (!_clean(refText)) { _msg(_tSafe('dg_no_content', '«{l}» non ha contenuto da studiare — memory saltata.').replace('{l}', _clean(node.label))); onDone(); return; }   // guard A12
    var desc = refText, minW = Math.max(6, Math.min(20, Math.round(_wordCount(refText) * 0.25)));
    var cur = _notes()[noteKey] || '';       // riprende eventuale sintesi precedente (re-cattura = rifinitura)
    var mode = 'write', saved = false;        // 'write' = fonte visibile · 'listen' = ascolta&trascrivi (fonte nascosta)
    var ttsRate = 1, ttsRates = [0.75, 0.9, 1, 1.25];   // velocità TTS ciclabile
    var ov = _overlay(); ov.card.style.width = 'min(680px,95vw)';
    function stopTTS() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} }
    var un = _esc(function () { skip(); });   // Esc = salta (la memory unit resta comunque nel diario)
    function done(score, txt) {
      if (saved) return; saved = true; stopTTS(); un();
      if (txt && _wordCount(txt) >= 1) _saveNote(noteKey, txt.trim());
      _addDiary(node, kind, { text: refText, rel: rel });
      _ensureQuiz(node.id);   // lazy: prepara le MC AI in background, pronte al gate
      try {
        if (window.MappAIStudyBus) window.MappAIStudyBus.record(node.id, node.label, 'dungeon', { score: score });
        else if (window.MappAIMastery) window.MappAIMastery.record(node.id, node.label, 'dungeon', { score: score });
      } catch (e) {}
      _logEv('cap', { nodeId: node.id, kind: kind, acc: Math.round(score * 100) / 100 });
      if (DUN) DUN._sessCaps = (DUN._sessCaps || 0) + 1;   // per il digest di fine sessione
      ov.close(); onDone();
    }
    function skip() { if (saved) return; done(0.6, cur); _msg(_tSafe('dg_capture_skip', 'Cattura saltata — memory unit nel diario.')); }
    // valuta la sintesi scritta (affinità SEMANTICA vs fonte), mostra l'accuracy, persiste il punteggio per la heatmap
    function evaluate() {
      if (_wordCount(cur) < minW) { _msg(_tSafe('dg_min_words', 'Scrivi almeno {n} parole (o premi salta).').replace('{n}', minW)); return; }
      // §17 anti-pappagallo (modo 4): la copia quasi letterale darebbe coverage alta senza rielaborazione
      var AS17 = _AS();
      if (AS17 && _wordCount(cur) >= 12 && AS17.jaccardWords(cur, refText) >= 0.8) {
        var cnt17 = ov.card.querySelector('#cm-cnt');
        if (cnt17) cnt17.innerHTML = counterHTML() + ' <span style="color:#e8a">· quasi identica alla fonte: riscrivila con parole tue</span>';
        return;
      }
      var btn = ov.card.querySelector('#cm-save'); if (btn) { btn.textContent = '🧠 Valuto…'; btn.style.opacity = '.6'; btn.style.cursor = 'default'; }
      Promise.resolve(_scoreOpen(cur, { ref: refText, answer: _clean(node.label) })).then(function (res) {
        _setSynthScore(node.id, res.acc);
        if (window.MappAIMasteryView && window.MappAIMasteryView.active && typeof window.renderGraph === 'function') { try { window.renderGraph(); } catch (e) {} } // refresh heatmap live
        showFeedback(res);
      });
    }
    function showFeedback(res) {
      stopTTS();
      var good = res.acc >= 60;
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">Cattura attiva · valutazione sintesi</div>' +
        '<h3 style="margin:4px 0 10px;font-size:18px;font-weight:500">' + _esch(headLabel) + '</h3>' +
        '<div style="font-size:16px;font-weight:600;margin:6px 0 10px;color:' + (good ? '#3fae5a' : '#e0a23f') + '">' + (good ? '✓' : '↻') + ' Accuratezza contenuti: ' + res.acc + '%</div>' +
        (res.feedback ? '<p style="font-size:14px;line-height:1.6;color:#c3d2ea;margin:0 0 14px">' + _esch(res.feedback) + '</p>' : '') +
        (good ? '<p style="font-size:12.5px;color:#7fae8f;margin:0 0 14px">Sopra il 60%: questo nodo verrà evidenziato sulla heatmap di studio 🎯 (anello dorato).</p>'
              : '<p style="font-size:12.5px;color:#9fb3d4;margin:0 0 14px">Sotto il 60%: puoi rivedere la sintesi o salvarla comunque.</p>') +
        '<div style="display:flex;gap:8px">' +
          '<button id="cm-keep" type="button" style="flex:1;' + GBS + '">💾 Salva nel diario</button>' +
          '<button id="cm-edit" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">↩ modifica</button>' +
        '</div>';
      ov.card.querySelector('#cm-keep').onclick = function () { done(res.acc / 100, cur); };
      ov.card.querySelector('#cm-edit').onclick = function () { render(); };
    }
    function speak() { try { var u = new SpeechSynthesisUtterance(_clean(desc || node.label)); u.lang = 'it-IT'; u.rate = ttsRate; stopTTS(); window.speechSynthesis.speak(u); } catch (e) { _msg(_tSafe('dg_no_tts', 'Sintesi vocale non disponibile.')); } }
    function srcPanel() {
      if (mode === 'listen') return '<div style="font-size:13px;color:#c3d2ea;line-height:1.5">Ascolta la fonte e scrivi <b>con parole tue</b> ciò che ricordi. La fonte resta nascosta.</div>' +
        '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">' +
        '<button id="cm-play" type="button" style="flex:1;min-width:120px;' + GBS + '">🔊 Ascolta</button>' +
        '<button id="cm-restart" type="button" title="Riascolta da capo" style="' + GBS + '">⏮ riascolta</button>' +
        '<button id="cm-rate" type="button" title="Velocità di lettura (ciclo 0.75→0.9→1→1.25)" style="' + GBS + '">× ' + ttsRate + '</button>' +
        '</div>';
      var h = hint ? '<div style="font-size:12px;color:#9fb3d4;margin-bottom:6px"><i>' + _esch(hint) + '</i></div>' : '';
      return h + '<p style="font-size:13px;line-height:1.6;color:#c3d2ea;margin:0;white-space:pre-wrap">' + _esch(desc || '(nessun contenuto)') + '</p>';
    }
    function counterHTML() {
      var n = _wordCount(cur), okLen = n >= minW, copy = _norm(cur) && _norm(cur) === _norm(desc);
      return '<span style="color:' + (okLen ? '#3fae5a' : '#8fa4c4') + '">' + n + ' / ' + minW + ' parole</span>' + (copy ? ' <span style="color:#e8a">· prova a dirlo con parole tue</span>' : '');
    }
    function render() {
      var okLen = _wordCount(cur) >= minW;
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">Cattura attiva · scrivi la tua sintesi</div>' +
        '<h3 style="margin:4px 0 10px;font-size:18px;font-weight:500">' + _esch(headLabel) + '</h3>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px">' +
          '<button id="cm-mw" type="button" style="flex:1;' + GBS + ';' + (mode === 'write' ? 'border-color:#fff;background:#24406a' : '') + '">✍ Sintesi</button>' +
          '<button id="cm-ml" type="button" style="flex:1;' + GBS + ';' + (mode === 'listen' ? 'border-color:#fff;background:#24406a' : '') + '">🔊 Ascolta e trascrivi</button>' +
        '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<div style="flex:1 1 230px;min-width:200px;max-height:38vh;overflow:auto">' + srcPanel() + '</div>' +
          '<div style="flex:1 1 230px;min-width:200px">' +
            '<textarea id="cm-txt" placeholder="Riassumi con parole tue…" style="width:100%;height:150px;box-sizing:border-box;background:#16203a;color:#eaf2ff;border:1px solid #2a3a55;border-radius:8px;padding:8px;font-family:inherit;font-size:13px;line-height:1.5;resize:none">' + _esch(cur) + '</textarea>' +
            '<div id="cm-cnt" style="font-size:12px;margin-top:6px">' + counterHTML() + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button id="cm-save" type="button" style="flex:1;' + GBS + (okLen ? '' : ';opacity:.45;cursor:default') + '">💾 Salva nel diario</button>' +
          '<button id="cm-skip" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">salta</button>' +
        '</div>';
      var ta = ov.card.querySelector('#cm-txt');
      ta.oninput = function () {
        cur = ta.value; var ok = _wordCount(cur) >= minW;
        ov.card.querySelector('#cm-cnt').innerHTML = counterHTML();
        var sv = ov.card.querySelector('#cm-save'); sv.style.opacity = ok ? '' : '.45'; sv.style.cursor = ok ? 'pointer' : 'default';
      };
      ov.card.querySelector('#cm-mw').onclick = function () { mode = 'write'; render(); };
      ov.card.querySelector('#cm-ml').onclick = function () { mode = 'listen'; render(); speak(); };
      var play = ov.card.querySelector('#cm-play'); if (play) play.onclick = speak;
      var rst = ov.card.querySelector('#cm-restart'); if (rst) rst.onclick = function () { stopTTS(); speak(); };
      var rateBtn = ov.card.querySelector('#cm-rate'); if (rateBtn) rateBtn.onclick = function () { ttsRate = ttsRates[(ttsRates.indexOf(ttsRate) + 1) % ttsRates.length]; rateBtn.textContent = '× ' + ttsRate; stopTTS(); speak(); };
      ov.card.querySelector('#cm-save').onclick = function () { evaluate(); };
      ov.card.querySelector('#cm-skip').onclick = skip;
      setTimeout(function () { try { ta.focus(); ta.setSelectionRange(cur.length, cur.length); } catch (e) {} }, 30);
    }
    // §17 unit corrotta (modo 4, cloze): per i nodi GIÀ incontrati (attempts ≥2,
    // non 'nuovo') la sintesi libera lascia il posto alla riparazione a memoria —
    // retrieval practice; il primo incontro resta sintesi generativa sulla fonte.
    try {
      var C17 = _core();
      if (_s17('cloze') && kind === 'desc' && C17 && C17.clozeGaps && _wordCount(refText) >= 25) {
        var agg17 = _mnode(node.id);
        if (agg17 && agg17.attempts >= 2 && _level(node.id) !== 'nuovo') {
          var cz17 = C17.clozeGaps(refText, 3);
          if (cz17) { _clozeRepair(node, refText, cz17, headLabel, ov, done); return; }
        }
      }
    } catch (e) { console.error('[s17 cloze]', e); }
    render();
  }
  // ── RIPASSO DI BENVENUTO (F2.3 — spacing multi-giorno, contesto "studente solo, più sessioni").
  // Se l'ultimo studio risale a >20h fa, propone (MAI impone — autonomia SDT, c10 adaptable) un mini
  // ripasso dei 3 nodi più bisognosi (_needReview). I record 'dungeon_review' alimentano la mastery
  // → il prossimo _gateSelection/_needReview lavora su dati freschi: il cerchio dello spacing si chiude.
  function _welcomeReview() {
    if (!_onboarded() || !window.MappAIMastery) return;
    var live = (DUN.diary || []).filter(function (d) { return !d.ghost; });
    if (live.length < 3) return;
    var last = 0;
    live.forEach(function (d) {
      try { var agg = window.MappAIMastery.node(d.id); ((agg && agg.byActivity) || []).forEach(function (r) { last = Math.max(last, r.lastTs || 0); }); } catch (e) {}
    });
    if (!last || (Date.now() - last) < 20 * 3600000) return;   // ultimo studio recente → niente proposta
    var seen = {}, uniq = live.filter(function (d) { if (seen[d.id]) return false; seen[d.id] = 1; return true; });
    var subjects = uniq.slice().sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); }).slice(0, 3);
    var ov = _overlay(); var un = _esc(function () { ov.close(); });
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">Bentornato</div>' +
      '<h3 style="margin:4px 0 8px;font-size:18px;font-weight:600">🌅 ' + subjects.length + ' memorie meritano un ripasso</h3>' +
      '<p style="font-size:13px;color:#c3d2ea;line-height:1.55;margin:0 0 10px">È passato un po\' dall\'ultima volta: un breve ripasso rinforza la memoria.</p>' +
      subjects.map(function (d) { return '<div style="font-size:13.5px;color:#e7d6a6;margin:3px 0 3px 6px">• ' + _esch(d.label) + '</div>'; }).join('') +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button id="wr-go" type="button" style="flex:1;' + GBS + '">🎴 Ripassa ora</button>' +
        '<button id="wr-x" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">più tardi</button>' +
      '</div>';
    ov.card.querySelector('#wr-go').onclick = function () {
      un(); ov.close();
      _runQuiz(live.map(_poolEntry), subjects.length, 'Ripasso di benvenuto', false,
        function (c, t) { _msg(_tSafe('dg_review_go', 'Ripasso: {c}/{t} — buona esplorazione!').replace('{c}', c).replace('{t}', t)); },
        subjects.map(_poolEntry), 'dungeon_review');
    };
    ov.card.querySelector('#wr-x').onclick = function () { un(); ov.close(); };
  }
  // ─────────────── HUB Fase 2: discesa per-ramo — ogni macro-area L1 = un dungeon dedicato ───────────────
  // Flag 'mappai_hub_branches' (default ON). Solo MindMap con ≥2 macro-aree; KG → discesa classica.
  function _hubBranchesOn() { try { return localStorage.getItem('mappai_hub_branches') !== '0'; } catch (e) { return true; } }
  function _branchCatalog() {
    var st = _getAppState();
    if (!st || st.extractionMode === 'kg') return null;
    var nodes = (st.db && st.db.nodes) || [];
    var l1 = nodes.filter(function (n) { return n.level === 1 && n.group != null; });
    if (l1.length < 2) return null;
    var byG = {}; nodes.forEach(function (n) { if (n.level > 0 && n.group != null) (byG[n.group] = byG[n.group] || []).push(n); });
    return l1.map(function (n) {
      var sub = byG[n.group] || [n];
      var mast = sub.filter(function (nd) { return _mastered(nd.id); }).length;
      return { group: n.group, label: _clean(n.label), count: sub.length, mastered: mast };
    });
  }
  function _buildBranchFloors(group) {
    var base = _levelsFromState() || [], filtered = [];
    base.forEach(function (lf) {
      if (lf.level < 1) return;   // la radice resta il quadro d'insieme del percorso completo
      var sub = lf.nodes.filter(function (n) { return n.group === group; });
      if (sub.length) filtered.push({ level: lf.level, nodes: sub });
    });
    return filtered.length ? _composeFloors(filtered, _studyMode()) : null;
  }
  function _applyBranch(choice) {   // choice = {group,label} | null (percorso completo)
    var tail = null;
    if (choice) { tail = _buildBranchFloors(choice.group); if (!tail) return false; }
    else { var base = _levelsFromState(); if (!base) return false; tail = _composeFloors(base, _studyMode()); }
    var head = DUN.floors.slice(0, DUN.fi + 1);
    var nxt = DUN.floors[DUN.fi + 1];
    if (nxt && nxt.kind === 'scuola') head.push(nxt);   // l'onboarding non si perde
    DUN.floors = head.concat(tail);
    DUN.gatePassed = {}; DUN.branch = choice || null;
    _logEv('hub_branch', { group: choice ? choice.group : 'full', floors: DUN.floors.length });
    return true;
  }
  function _openBranchChooser(cat) {
    var ov = _overlay(); ov.card.style.width = 'min(520px,94vw)';
    var h = '<h3 style="margin:0 0 6px;font-size:18px">🏰 Dove vuoi scendere?</h3>' +
      '<div style="color:#9fb4d8;font-size:13px;margin-bottom:14px">Ogni macro-area è un dungeon dedicato: rami corti, ripasso mirato. Alla prossima visita al giardino potrai scegliere un\'altra strada.</div>';
    cat.forEach(function (c, i) {
      h += '<button type="button" class="btn mdg-branch" data-i="' + i + '" style="display:block;width:100%;text-align:left;margin-bottom:8px;height:auto;line-height:1.4;padding:10px 12px">⛰ <b>' + c.label + '</b><br><span style="color:#9fb4d8;font-size:12px">' + c.count + (c.count === 1 ? ' memoria' : ' memorie') + ' · ' + c.mastered + ' consolidate</span></button>';
    });
    h += '<button type="button" class="btn" id="mdg-branch-full" style="display:block;width:100%;text-align:left;height:auto;line-height:1.4;padding:10px 12px">🌍 <b>Percorso completo</b><br><span style="color:#9fb4d8;font-size:12px">tutti i rami, dal quadro d\'insieme in giù</span></button>' +
      '<div style="text-align:right;margin-top:10px"><button type="button" class="btn" id="mdg-branch-x">Resto nel giardino</button></div>';
    ov.card.innerHTML = h;
    var unEsc = _esc(function () { ov.close(); });
    function go(choice) { unEsc(); ov.close(); if (_applyBranch(choice)) _doDescend(); else _msg(_tSafe('dg_empty_branch', 'Questo ramo non ha contenuti da esplorare.')); }
    ov.card.querySelectorAll('.mdg-branch').forEach(function (b) { b.onclick = function () { go(cat[+b.getAttribute('data-i')]); }; });
    ov.card.querySelector('#mdg-branch-full').onclick = function () { go(null); };
    ov.card.querySelector('#mdg-branch-x').onclick = function () { unEsc(); ov.close(); };
  }
  // Fase 4: il guardiano del giardino saluta con UNA micro-domanda di richiamo (soft, MAI bloccante:
  // giusta o sbagliata si scende comunque — è spaced retrieval travestito da rituale di passaggio).
  function _hubGuardianOn() { try { return localStorage.getItem('mappai_hub_guardian') !== '0'; } catch (e) { return true; } }
  function _descend() {
    if (DUN.fi >= DUN.floors.length - 1) { _msg(DUN.boss && !DUN.boss.defeated ? 'Ultimo piano: raggiungi il Guardiano della Memoria ⚔.' : 'Hai già rivelato la mappa.'); return; }
    var f = DUN.floors[DUN.fi];
    if (f.kind === 'giardino') {   // dal giardino: micro-domanda del guardiano → scelta del ramo (hub)
      var afterGk = function () {
        var cat = _hubBranchesOn() ? _branchCatalog() : null;
        if (cat) { _openBranchChooser(cat); return; }
        _doDescend();
      };
      if (_hubGuardianOn() && DUN.customMap && DUN.customMap.gatekeeper && !DUN._gkAsked) {
        var live = (DUN.diary || []).filter(function (d) { return !d.ghost; });
        if (live.length) {
          DUN._gkAsked = true;
          var sel = _gateSelection(1);
          _runQuiz(live.map(_poolEntry), 1, '🔮 Il Guardiano del Giardino', true, function (c, t) {
            _logEv('hub_guardian', { ok: c === t });
            _msg(c === t ? '🔮 «Ben studiato, viandante. La via è aperta.»' : '🔮 «Ci tornerai su — la via è aperta comunque.»');
            afterGk();   // MAI bloccante
          }, sel.subjects, 'dungeon_review');
          return;
        }
      }
      afterGk(); return;
    }
    if (DUN.gatePassed[DUN.fi]) { _doDescend(); return; }   // gate già passato → scendi
    if (DUN.diary.length < 1) { _msg(_tSafe('dg_gate_block', '🛡 Il Gate Keeper sbarra le scale: cattura almeno una memory unit (📕/📜/🏺) prima di scendere.')); return; }
    var proceed = function () {
      // STANZA FISICA del Gate Keeper (beholder). Fallback al gate modale se disattivata/errore.
      try { if (localStorage.getItem('mappai_gate_room') !== '0') { _enterGateRoom(DUN.fi + 1); return; } } catch (e) { console.error('[gateroom]', e); }
      _msg(_tSafe('dg_gate_answer', '🛡 Il Gate Keeper: rispondi per scendere.'));
      _openGate(function () { DUN.gatePassed[DUN.fi] = true; _doDescend(); }, function (results) { _gateFailGuide(results, _gateWarpBack); });
    };
    if (_softGateOn()) _softGateWarn(DUN.fi + 1, proceed); else proceed();   // HUB S5: avviso morbido, mai bloccante
  }
  // ─────────────── HUB S5: gating morbido study-path-aware (flag 'mappai_soft_gate') ───────────────
  // MAI bloccante: se >50% dei nodi del piano successivo poggia su prerequisiti non consolidati,
  // il door keeper antepone UNA riga informativa con "Procedi comunque" / "Ripassa prima".
  function _softGateOn() { try { return localStorage.getItem('mappai_soft_gate') !== '0'; } catch (e) { return true; } }
  function _softGateWarn(next, onProceed) {
    try {
      var f = DUN.floors[next]; var ids = ((f && f.nodes) || []).map(function (n) { return n.id; });
      if (!ids.length) return onProceed();
      var cls = _spClassify(); if (!cls || !cls.locked || !cls.locked.length) return onProceed();
      // classify restituisce item-oggetto ({id, parent}) — normalizza
      var lockedSet = {}; cls.locked.forEach(function (it) { var lid = (it && it.id != null) ? it.id : it; lockedSet[lid] = it; });
      var lockedIds = ids.filter(function (id) { return lockedSet[id]; });
      if (lockedIds.length * 2 <= ids.length) return onProceed();
      // prerequisiti deboli da ripassare: il parent è già nell'item locked
      var rev = {}; lockedIds.forEach(function (id) { var it = lockedSet[id]; var p = it && it.parent; if (p && !_mastered(p)) rev[p] = 1; });
      var revNodes = Object.keys(rev).map(_nodeById).filter(Boolean);
      _logEv('soft_gate_warn', { fi: DUN.fi, locked: lockedIds.length, of: ids.length });
      var ov = _overlay(); var un = _esc(function () { ov.close(); });
      ov.card.innerHTML =
        '<h3 style="margin:0 0 8px;font-size:16px;font-weight:600">🛡 Il Gate Keeper ti osserva</h3>' +
        '<p style="font-size:13px;color:#c3d2ea;line-height:1.5;margin:0 0 12px">Le idee del prossimo piano poggiano su basi che non hai ancora consolidato. Puoi comunque proseguire.</p>' +
        '<div style="display:flex;gap:8px">' +
        '<button id="sg-go" type="button" style="flex:1;' + GBS + '">Procedi comunque</button>' +
        (revNodes.length ? '<button id="sg-rev" type="button" style="flex:1;' + GBS + ';border-color:#3fae5a;background:#15301f">Ripassa prima (' + Math.min(4, revNodes.length) + ')</button>' : '') +
        '</div>';
      ov.card.querySelector('#sg-go').onclick = function () { un(); ov.close(); _logEv('soft_gate_proceed'); onProceed(); };
      var rb = ov.card.querySelector('#sg-rev');
      if (rb) rb.onclick = function () {
        un(); ov.close(); _logEv('soft_gate_review', { n: revNodes.length });
        var pool = revNodes.map(function (nd) { return { id: nd.id, label: _clean(nd.label), desc: _desc(nd), g: _groupOf(nd.id), kind: 'desc' }; });
        _runQuiz(pool, Math.min(4, pool.length), 'Ripasso dal Custode', false, function (c, t) { _msg(_tSafe('dg_review_stairs', 'Ripasso: {c}/{t}. Le scale ti aspettano.').replace('{c}', c).replace('{t}', t)); }, null, 'dungeon_review');
      };
    } catch (e) { console.error('[softgate]', e); onProceed(); }
  }
  function _gateWarpBack() {
    var cur = DUN.fi;
    _snd('door_locked'); DUN.flash = { c: '150,90,230', a: 0.75 };   // warp viola
    _msg(_tSafe('dg_wrong_vortex', '🌀 Risposta sbagliata! Un vortice ti rimanda all\'inizio del livello.'));
    setTimeout(function () { if (DUN && DUN.fi === cur) _loadFloor(cur); }, 300);   // ricarica il livello corrente
  }
  function _doDescend() { var nx = DUN.fi + 1; _loadFloor(nx); _msg(_tSafe('dg_descended', 'Sceso al piano {n} ({t}).').replace('{n}', (nx + 1)).replace('{t}', (DUN.theme ? DUN.theme.n : ''))); }

  // ───── STANZA FISICA DEL GATE KEEPER (beholder) ─────
  // Scendendo dalle scale entri qui: il beholder blocca l'uscita. Cliccalo → quiz.
  // Sbagli → warp all'inizio del livello · giusto → si sposta e appaiono le scale ↓.
  function _enterGateRoom(toFloor) {
    var from = DUN.fi, w = 13, h = 9, map = {};
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) map[x + ',' + y] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 1 : 0;
    DUN.map = map; DUN.w = w; DUN.h = h; DUN.quota = null;
    DUN.gardenFloor = false; DUN.gardenNpcs = null; DUN.gardenWater = null;
    DUN.mobs = []; DUN.corpses = {}; DUN.duel = null; DUN.sources = {}; DUN.items = {}; DUN.boss = null; DUN.torches = [];
    DUN.theme = THEMES[0]; DUN.themeTiles = THEME_TILES.pietra;
    var bx = (w >> 1), by = (h >> 1);
    DUN.gateRoom = { from: from, toFloor: toFloor, bx: bx, by: by, ex: bx, ey: 1, passed: false, quizBusy: false };
    map[bx + ',' + by] = 1;          // il beholder blocca il centro
    DUN.px = bx; DUN.py = h - 2;     // player in basso
    DUN.sx = DUN.sy = -1;            // uscita nascosta finché non superi il gate
    DUN.explored = {}; DUN.visible = {}; DUN.path = null;
    _computeFOV();
    _snd('door_locked');
    _msg(_tSafe('dg_gk_room', '🔮 Stanza del Gate Keeper: clicca il beholder e rispondi per passare.'));
  }
  function _gateRoomChallenge() {
    var gr = DUN.gateRoom; if (!gr || gr.passed || gr.quizBusy) return;
    gr.quizBusy = true;
    _openGate(function () {   // superato
      gr.passed = true; gr.quizBusy = false; DUN.gatePassed[gr.from] = true;
      DUN.map[gr.bx + ',' + gr.by] = 0;   // libera il centro
      gr.bx = 1; gr.by = 1; DUN.map[gr.bx + ',' + gr.by] = 1;   // il beholder si ritira in un angolo
      DUN.sx = gr.ex; DUN.sy = gr.ey;     // rivela le scale ↓
      _snd('powerup'); _msg(_tSafe('dg_gk_open', '🔓 Il Gate Keeper si sposta. Le scale si rivelano: scendi! 🔽'));
    }, function (results) {    // fallito → guida al ripasso, poi warp
      gr.quizBusy = false; _gateFailGuide(results, _gateRoomWarp);
    });
  }
  function _gateRoomWarp() {
    var from = DUN.gateRoom ? DUN.gateRoom.from : DUN.fi;
    _snd('door_locked'); DUN.flash = { c: '150,90,230', a: 0.85 };
    _msg(_tSafe('dg_gk_wrong', '🌀 Risposta sbagliata! Il beholder ti scaglia indietro, all\'inizio del livello.'));
    DUN.gateRoom = null;
    setTimeout(function () { if (DUN) _loadFloor(from); }, 350);
  }
  function _exitGateRoom() {
    var to = DUN.gateRoom.toFloor; DUN.gateRoom = null;
    _loadFloor(to); _msg(_tSafe('dg_descended2', 'Sceso al piano {n}.').replace('{n}', (to + 1)));
  }
  // ───── Diario interattivo (tab macro-area · lettura · note markdown · ripasso · ricerca · export) ─────
  function _macroOf(id) {
    var st = _getAppState(), nodes = (st && st.db && st.db.nodes) || [], node = null;
    for (var i = 0; i < nodes.length; i++) if (String(nodes[i].id) === String(id)) { node = nodes[i]; break; }
    if (!node) return 'Generale';
    for (var j = 0; j < nodes.length; j++) if (nodes[j].group === node.group && nodes[j].level === 1) return _clean(nodes[j].label);
    return 'Area ' + (node.group != null ? node.group : '?');
  }
  function _esch(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _mdInline(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code style="background:#16203a;padding:0 4px;border-radius:3px">$1</code>'); }
  function _md(t) {
    var lines = _esch(t).split('\n'), out = [], inList = false;
    lines.forEach(function (ln) {
      if (/^### /.test(ln)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h4 style="margin:6px 0">' + ln.slice(4) + '</h4>'); }
      else if (/^## /.test(ln)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h3 style="margin:8px 0">' + ln.slice(3) + '</h3>'); }
      else if (/^# /.test(ln)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h2 style="margin:8px 0">' + ln.slice(2) + '</h2>'); }
      else if (/^\s*- /.test(ln)) { if (!inList) { out.push('<ul style="margin:4px 0 4px 18px">'); inList = true; } out.push('<li>' + _mdInline(ln.replace(/^\s*- /, '')) + '</li>'); }
      else { if (inList) { out.push('</ul>'); inList = false; } out.push(ln.trim() === '' ? '<div style="height:6px"></div>' : '<div>' + _mdInline(ln) + '</div>'); }
    });
    if (inList) out.push('</ul>'); return out.join('');
  }
  function _notesKey() { return 'mappai_dungeon_notes__' + _mapSig(); }
  function _notes() { try { return JSON.parse(localStorage.getItem(_notesKey()) || '{}'); } catch (e) { return {}; } }
  function _saveNote(id, txt) { var n = _notes(); n[id] = txt; _lsSet(_notesKey(), JSON.stringify(n)); }
  // accuracy delle sintesi scritte alla cattura (per nodo). Letta da MappAIMasteryView per evidenziare i nodi ≥60% sulla heatmap.
  function _synthKey() { return 'mappai_dungeon_synthesis__' + _mapSig(); }
  function _synthScores() { try { return JSON.parse(localStorage.getItem(_synthKey()) || '{}'); } catch (e) { return {}; } }
  function _setSynthScore(id, acc) { try { var m = _synthScores(); m[String(id)] = Math.max(0, Math.min(100, Math.round(acc))); _lsSet(_synthKey(), JSON.stringify(m)); } catch (e) {} }
  function _exportDiary(entries) {
    var KT = { desc: 'Descrizioni', cite: 'Citazioni', rel: 'Relazioni' };
    var byK = {}; entries.forEach(function (e) { var k = e.kind || 'desc'; (byK[k] = byK[k] || []).push(e); });
    var notes = _notes(), md = '# Diario — Memory Dungeon\n\n';
    ['desc', 'cite', 'rel'].forEach(function (k) { if (!byK[k]) return; md += '## ' + KT[k] + '\n\n'; byK[k].forEach(function (e) { md += '### ' + e.label + '\n*' + (e.macro || '') + '*\n\n' + (e.desc || '') + '\n\n'; var nt = notes[e.eid || e.id]; if (nt) md += '> Nota: ' + nt.replace(/\n/g, '\n> ') + '\n\n'; }); });
    try { var b = new Blob([md], { type: 'text/markdown' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'diario-memory-dungeon.md'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); _msg(_tSafe('dg_diary_exported', 'Diario esportato (.md).')); } catch (e) { _msg(_tSafe('dg_export_fail', 'Export non riuscito.')); }
  }
  var DKM = { desc: { t: '📖 Descrizioni', c: '#9fc4ff' }, cite: { t: '📜 Citazioni', c: '#e7d6a6' }, rel: { t: '🏺 Relazioni', c: '#b9e6c9' } };
  var DORDER = ['desc', 'cite', 'rel'];
  function _openDiary(presetIds) {
    var ov = _overlay(); var un = _esc(ov.close);
    if (!DUN.diary.length) { ov.card.innerHTML = '<h3 style="margin:0 0 10px">📖 Diario</h3><div style="color:#8fa4c4;font-size:13px">Diario vuoto — cattura memorie dai 📖 libri (descrizioni), 📜 scroll (citazioni) e 🏺 vasi (relazioni).</div><button id="dx0" style="margin-top:12px;width:100%;' + GBS + '">chiudi</button>'; ov.card.querySelector('#dx0').onclick = function () { un(); ov.close(); }; return; }
    var entries = DUN.diary.map(function (d) { return { eid: d.eid || String(d.id), id: d.id, label: d.label, desc: d.desc, kind: d.kind || 'desc', macro: _macroOf(d.id), ghost: !!d.ghost }; });
    // presetIds (dal gate fallito): filtro "da ripassare" — rimovibile con "mostra tutto"
    var focus = (presetIds && presetIds.length) ? presetIds.map(String) : null;
    var stt = { q: '', sel: null, focus: focus };
    if (focus) { var ff = entries.filter(function (e) { return focus.indexOf(String(e.id)) >= 0; }); if (ff.length) stt.sel = ff[0].eid; }
    ov.card.style.width = 'min(660px,95vw)';
    function pool() { return entries.filter(function (e) { return (!stt.focus || stt.focus.indexOf(String(e.id)) >= 0) && (!stt.q || (e.label + ' ' + e.desc).toLowerCase().indexOf(stt.q.toLowerCase()) >= 0); }); }
    function listHTML() {
      var p = pool(), html = '';
      DORDER.forEach(function (k) {
        var items = p.filter(function (e) { return e.kind === k; });
        if (!items.length) return;
        html += '<div style="font-size:12px;font-weight:500;color:' + DKM[k].c + ';margin:10px 0 4px">' + DKM[k].t + ' · ' + items.length + '</div>';
        html += items.map(function (e) { return '<button class="d-it" data-eid="' + _esch(e.eid) + '" style="display:block;width:100%;text-align:left;margin:4px 0;line-height:1.35;' + GBS + ';' + (stt.sel === e.eid ? 'border-color:#fff' : '') + '"><span style="font-size:13px">' + _esch(e.label) + '</span><br><span style="font-size:11px;color:#8fa4c4">' + _esch(e.macro) + '</span></button>'; }).join('');
      });
      return html || '<div style="color:#8fa4c4;font-size:13px">Nessuna voce.</div>';
    }
    function render() {
      var sel = stt.sel ? entries.filter(function (e) { return e.eid === stt.sel; })[0] : null, detail;
      if (sel) {
        var km = DKM[sel.kind] || DKM.desc, note = _notes()[sel.eid] || '';
        detail = '<div style="font-size:11px;color:' + km.c + ';font-weight:500;margin-bottom:2px">' + km.t + ' · ' + _esch(sel.macro) + (sel.ghost ? ' · <span style="color:#c9a0a0">(nodo rimosso dalla mappa)</span>' : '') + '</div>' +
          '<h3 style="margin:0 0 6px;font-size:16px">' + _esch(sel.label) + '</h3>' +
          '<p style="font-size:13px;color:#c3d2ea;line-height:1.6;margin:0 0 6px;white-space:pre-wrap">' + _esch(sel.desc || '') + '</p>' +
          '<div style="margin-top:10px;font-size:12px;color:#8fa4c4">La tua nota (markdown):</div>' +
          '<div style="display:flex;gap:8px;margin-top:4px"><textarea id="d-note" style="flex:1;height:110px;background:#16203a;color:#eaf2ff;border:1px solid #2a3a55;border-radius:6px;padding:6px;font-family:monospace;font-size:12px;resize:none">' + _esch(note) + '</textarea><div id="d-prev" style="flex:1;height:110px;overflow:auto;background:#0b1426;border:1px solid #2a3a55;border-radius:6px;padding:6px;font-size:12px">' + _md(note) + '</div></div>';
      } else detail = '<div style="color:#8fa4c4;font-size:13px">Seleziona una voce per leggerla e annotarla.</div>';
      var focusBanner = stt.focus ? '<div style="display:flex;justify-content:space-between;align-items:center;background:#1c2a1c;border:1px solid #3fae5a;border-radius:8px;padding:6px 10px;margin-top:8px;font-size:12.5px;color:#a8dcb4">📌 Da ripassare (' + pool().length + ')<button id="d-all" type="button" style="background:none;border:none;color:#8fa4c4;cursor:pointer;font-size:12px;text-decoration:underline">mostra tutto</button></div>' : '';
      ov.card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:18px">📖 Diario</h3><input id="d-q" placeholder="cerca…" value="' + _esch(stt.q) + '" style="width:130px;padding:5px 8px;border-radius:6px;border:1px solid #2a3a55;background:#16203a;color:#eaf2ff"></div>' +
        focusBanner +
        '<div style="display:flex;gap:12px;margin-top:10px"><div style="width:210px;max-height:48vh;overflow:auto">' + listHTML() + '</div><div style="flex:1;max-height:48vh;overflow:auto">' + detail + '</div></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><button id="d-quiz" style="flex:1;' + GBS + '">🎴 Ripasso</button><button id="d-exp" style="flex:1;' + GBS + '">⬇ Esporta .md</button><button id="d-x" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">chiudi</button></div>';
      Array.prototype.forEach.call(ov.card.querySelectorAll('.d-it'), function (b) { b.onclick = function () { stt.sel = b.dataset.eid; render(); }; });
      var qi = ov.card.querySelector('#d-q'); qi.oninput = function () { stt.q = qi.value; render(); };
      var dall = ov.card.querySelector('#d-all'); if (dall) dall.onclick = function () { stt.focus = null; render(); };
      if (sel) { var ta = ov.card.querySelector('#d-note'); ta.oninput = function () { _saveNote(sel.eid, ta.value); ov.card.querySelector('#d-prev').innerHTML = _md(ta.value); }; }
      ov.card.querySelector('#d-quiz').onclick = function () { var p = pool().filter(function (e) { return !e.ghost; }).map(function (e) { return { id: e.id, label: e.label, desc: e.desc }; }); if (!p.length) { _msg(_tSafe('dg_nothing_review', 'Niente da ripassare.')); return; } un(); ov.close(); var subj = _shuffle(p.slice()).sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); }); _runQuiz(p, Math.min(5, p.length), 'Ripasso diario', false, function (c, t) { _msg(_tSafe('dg_review_done', 'Ripasso: {c}/{t} corrette.').replace('{c}', c).replace('{t}', t)); }, subj, 'dungeon_review'); };
      ov.card.querySelector('#d-exp').onclick = function () { _exportDiary(entries); };
      ov.card.querySelector('#d-x').onclick = function () { un(); ov.close(); };
    }
    render();
  }

  function _dunRender() {
    if (!DUN || !DUN.ctx) return;
    // §19 F2: skin voxel 3D (DEFAULT) — three.js con sprite PNG animati.
    // Se THREE è assente o frame() fallisce, si ricade SEMPRE sul 2D LoL (mai sul
    // vecchio renderer ASCII): il voxel è un default sicuro.
    if (_skin() === 'voxel') {
      if (window.MappAIDungeonVoxel && window.MappAIDungeonVoxel.available() && window.MappAIDungeonVoxel.frame(DUN)) { _renderHud(); return; }
      return _dunRenderLoL();
    }
    if (_skin() === 'lol') return _dunRenderLoL();
    var ctx = DUN.ctx, TS = DUN.TS, W = DUN.cv.width, H = DUN.cv.height, sh = DUN.tileset, rdy = _ready(sh), now = performance.now();
    var camX = DUN.px * TS - W / 2 + TS / 2, camY = DUN.py * TS - H / 2 + TS / 2;
    ctx.fillStyle = '#0c0a08'; ctx.fillRect(0, 0, W, H);
    function dt(c, dx, dy) { ctx.drawImage(sh, c[0] * 16, c[1] * 16, 16, 16, dx, dy, TS, TS); }
    var tt = DUN.themeTiles || { floor: [3, 1], wall: [2, 5] };
    var x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1, x1 = x0 + Math.ceil(W / TS) + 2, y1 = y0 + Math.ceil(H / TS) + 2;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var key = x + ',' + y, v = DUN.map[key];
      if (v === undefined || !DUN.explored[key]) continue;
      var sx = Math.round(x * TS - camX), sy = Math.round(y * TS - camY), vis = DUN.visible[key];
      if (rdy) { if (DUN.gardenWater && DUN.gardenWater[key]) dt([6, 8], sx, sy); else dt(v === 1 ? tt.wall : tt.floor, sx, sy); }
      else { ctx.fillStyle = v === 1 ? '#444' : '#222'; ctx.fillRect(sx, sy, TS, TS); }
      if (!vis) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx, sy, TS, TS); }
    }
    if (rdy && DUN.sx >= 0 && DUN.explored[DUN.sx + ',' + DUN.sy]) dt([10, 1], Math.round(DUN.sx * TS - camX), Math.round(DUN.sy * TS - camY));
    for (var ik in DUN.items) { if (!DUN.explored[ik] || !rdy) continue; var ip = ik.split(',').map(Number); var itc = ITEM_TILES[(DUN.items[ik] || {}).type] || [8, 9]; dt(itc, Math.round(ip[0] * TS - camX), Math.round(ip[1] * TS - camY - Math.sin(now / 300 + ip[0]) * 2)); }   // loot dai nemici: disegnato col tile del tipo (moneta/gemma/pozione)
    for (var k in DUN.sources) {
      if (!DUN.explored[k] || !rdy) continue;
      var s = DUN.sources[k], p = k.split(',').map(Number), dx = Math.round(p[0] * TS - camX), dy = Math.round(p[1] * TS - camY);
      if (s.type === 'libro') _drawBook(ctx, dx, dy, TS, s.extracted);
      else if (s.type === 'scroll') _drawScroll(ctx, dx, dy, TS, s.extracted);
      else if (s.type === 'vaso') { if (s.extracted) ctx.globalAlpha = 0.4; dt([12, 0], dx, dy); ctx.globalAlpha = 1; }   // vaso = relazione (tile pot); oscurato se già catturato
      else if (s.type === 'condotto' || s.type === 'server') { if (s.extracted && s.type === 'server') ctx.globalAlpha = 0.45; ctx.font = Math.round(TS * 0.75) + 'px serif'; ctx.fillText(s.type === 'condotto' ? '⚡' : '🖥', dx + Math.round(TS * 0.12), dy + Math.round(TS * 0.8)); ctx.globalAlpha = 1; }   // §17: condotto/server (il condotto resta luminoso: è un fast-travel)
      else dt(s.extracted ? [11, 2] : [11, 0], dx, dy);   // forziere legacy: chiuso → aperto
    }
    for (var ck in DUN.corpses) { if (!DUN.explored[ck] || !rdy) continue; var cp = ck.split(',').map(Number); dt(SKELETON_TILE, Math.round(cp[0] * TS - camX), Math.round(cp[1] * TS - camY)); }
    if (DUN.mobs) for (var mj = 0; mj < DUN.mobs.length; mj++) {   // mostri SOLO se visibili (niente sprite scuri in nebbia)
      var mo = DUN.mobs[mj]; if (!mo.alive) continue; var mk = mo.x + ',' + mo.y; if (!DUN.visible[mk] || !rdy) continue;
      dt(mo.anim[Math.floor(now / 200) % 4], Math.round(mo.x * TS - camX), Math.round(mo.y * TS - camY));
    }
    if (DUN.boss && !DUN.boss.defeated && rdy && DUN.explored[DUN.boss.x + ',' + DUN.boss.y]) {   // Guardiano della Memoria (golem, glow magenta)
      var bdx = Math.round(DUN.boss.x * TS - camX), bdy = Math.round(DUN.boss.y * TS - camY);
      ctx.save(); ctx.shadowColor = '#d24b8f'; ctx.shadowBlur = 12; dt([23 + (Math.floor(now / 220) % 3), 3], bdx, bdy); ctx.restore();
    }
    if (DUN.gardenNpcs && rdy) for (var gnk in DUN.gardenNpcs) { var gp = DUN.gardenNpcs[gnk]; dt(gp.anim[Math.floor(now / 300) % 4] || gp.anim[0], Math.round(gp.x * TS - camX), Math.round(gp.y * TS - camY)); }
    if (DUN.gateRoom) { var gks = _sheet('gatekeeper.png'); if (_ready(gks)) { var bf = Math.floor(now / 220) % 4; ctx.save(); ctx.shadowColor = '#b06ad6'; ctx.shadowBlur = 12; ctx.drawImage(gks, bf * 16, 0, 16, 16, Math.round(DUN.gateRoom.bx * TS - camX), Math.round(DUN.gateRoom.by * TS - camY), TS, TS); ctx.restore(); } }
    if (rdy) dt(DUN.playerAnim[Math.floor(now / (DUN.path ? 120 : 260)) % 4], Math.round(DUN.px * TS - camX), Math.round(DUN.py * TS - camY) - _jumpBump(TS));
    _renderFx(ctx, TS, camX, camY, W, H);
    _renderHud();
  }
  // overlay canvas indipendenti dalla skin (spell, balloon duello, flash)
  function _renderFx(ctx, TS, camX, camY, W, H) {
    if (DUN.spellFx && DUN.spellFx.t > 0) { ctx.fillStyle = 'rgba(120,200,255,' + (0.4 * DUN.spellFx.t) + ')'; DUN.spellFx.cells.forEach(function (c) { ctx.fillRect(Math.round(c[0] * TS - camX), Math.round(c[1] * TS - camY), TS, TS); }); DUN.spellFx.t -= 0.06; if (DUN.spellFx.t <= 0) DUN.spellFx = null; }
    if (DUN.duel && DUN.duel.mob && DUN.duel.mob.alive) _balloon(ctx, Math.round(DUN.duel.mob.x * TS - camX) + TS / 2, Math.round(DUN.duel.mob.y * TS - camY) - 4, DUN.duel.symbol || DUN.duel.letter);
    if (DUN.flash && DUN.flash.a > 0) { ctx.fillStyle = 'rgba(' + DUN.flash.c + ',' + DUN.flash.a + ')'; ctx.fillRect(0, 0, W, H); DUN.flash.a *= 0.85; if (DUN.flash.a < 0.04) DUN.flash = null; }
  }
  // HUD + log messaggi (DOM, indipendente dalla skin)
  function _renderHud() {
    var hearts = '♥'.repeat(DUN.hp) + '♡'.repeat(Math.max(0, DUN.maxhp - DUN.hp));
    var mem = 0, tot = 0; for (var kk in DUN.sources) { tot++; if (DUN.sources[kk].extracted) mem++; }
    var th = DUN.theme || { n: '' };
    // mappa-mondo: minimappa a zone aggiornata quando cambi zona (throttle leggero)
    if (DUN.world) {
      var czi = DUN.world.byCell[DUN.px + ',' + DUN.py];
      if (czi !== DUN.world._lastZi && czi !== undefined) { DUN.world._lastZi = czi; _drawWorldMinimap(); }
    }
    var _fk = DUN.gateRoom ? 'gate' : DUN.floors[DUN.fi].kind; var kind = DUN.gateRoom ? '🔮 gate keeper' : (_fk === 'combat' ? '⚔ combat' : (_fk === 'giardino' ? '🌿 giardino' : (_fk === 'mondo' ? '🌍 mondo' : 'misto')));
    var rtxt = (DUN.duelStats && DUN.duelStats.correct) ? '  RT ' + Math.round(DUN.duelStats.sumRt / DUN.duelStats.correct) + 'ms' : '';
    var manaFull = '●'.repeat(DUN.mana), manaEmpty = '●'.repeat(Math.max(0, DUN.maxMana - DUN.mana));
    var wmv = Math.round(_wm());   // misuratore memoria di lavoro (Quick win B)
    DUN.root.querySelector('#hud').innerHTML =
      '<div style="color:#e24b4a;font-size:18px">' + hearts + '</div>' +
      '<div style="font-size:15px"><span style="color:#3aa0ff">' + manaFull + '</span><span style="color:#24406a">' + manaEmpty + '</span></div>' +
      '<div>' + (th.n ? th.n + ' · ' : '') + kind + (DUN.branch ? ' · 🏰 ' + DUN.branch.label : '') + ' · Piano ' + (DUN.fi + 1) + '/' + DUN.floors.length + '  mem ' + mem + '/' + tot + '  $' + DUN.coins + '  ◆' + DUN.gems + '  🧠' + wmv + rtxt +
      (DUN.aiMode ? '  <span title="' + (DUN.aiMode === 'cloud' ? 'Quiz e valutazioni: AI cloud' : (DUN.aiMode === 'local' ? 'Quiz e valutazioni: AI locale (offline)' : 'Quiz e valutazioni: modalità deterministica (nessuna AI)')) + '">' + (DUN.aiMode === 'cloud' ? '☁' : (DUN.aiMode === 'local' ? '💻' : '📴')) + '</span>' : '') + '</div>';
    if (DUN.msgDirty) {
      var cls = ['msg4', 'msg3', 'msg2', 'msg1', 'msg0'], first = Math.max(DUN.messages.length - 5, 0), start = 5 - (DUN.messages.length - first), buf = '';
      for (var mi = first; mi < DUN.messages.length; mi++) buf += '<span class="' + cls[start++] + '">' + DUN.messages[mi] + '</span>';
      DUN.root.querySelector('#messages').innerHTML = buf; DUN.msgDirty = false;
    }
  }

  // ───────── RENDER skin "Legend of Lua" (parallelo a _dunRender, stesso stato di gioco) ─────────
  function _dunRenderLoL() {
    if (!DUN || !DUN.ctx) return;
    var ctx = DUN.ctx, TS = DUN.TS, W = DUN.cv.width, H = DUN.cv.height, now = performance.now();
    var camX = DUN.px * TS - W / 2 + TS / 2, camY = DUN.py * TS - H / 2 + TS / 2;
    var bio = _lolBiome(DUN.fi), sheet = _sheet(bio.sheet), rdy = _ready(sheet);
    var fallFloor = bio === LOL.biomes.caverna ? '#3a2a1c' : (bio === LOL.biomes.interni ? '#2a2018' : '#3f7a3a');
    ctx.fillStyle = '#0c0a08'; ctx.fillRect(0, 0, W, H);
    var CM = (DUN.gardenFloor && DUN.customMap) ? DUN.customMap : null;   // mappa curata dal map-editor
    var x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1, x1 = x0 + Math.ceil(W / TS) + 2, y1 = y0 + Math.ceil(H / TS) + 2;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var key = x + ',' + y, v = DUN.map[key];
      if (v === undefined || !DUN.explored[key]) continue;
      var sx = Math.round(x * TS - camX), sy = Math.round(y * TS - camY), vis = DUN.visible[key];
      if (CM) {   // tile disegnati a mano: ground pieno + overlay (siepi/rive/decal)
        var cg = CM.ground[y] && CM.ground[y][x], cov = CM.over[y] && CM.over[y][x], cgs = cg && _cmapSheet(cg.ts);
        if (cgs && _ready(cgs)) _lolTile(ctx, cgs, [cg.c, cg.r], TS, sx, sy);
        else { ctx.fillStyle = fallFloor; ctx.fillRect(sx, sy, TS, TS); }
        if (cov) { var cos = _cmapSheet(cov.ts); if (_ready(cos)) _lolTile(ctx, cos, [cov.c, cov.r], TS, sx, sy); }
      } else if (rdy) {
        if (DUN.gardenWater && DUN.gardenWater[key] && bio.water) _lolTile(ctx, sheet, bio.water, TS, sx, sy);
        else if (v === 1) _lolTile(ctx, sheet, (DUN.gardenTrees && DUN.gardenTrees[key]) ? bio.floor : bio.wall, TS, sx, sy);   // sotto l'albero = erba (lo sprite copre); siepe = bordo
        else { var _fl = (DUN.gardenFlowers && DUN.gardenFlowers[key]); _lolTile(ctx, sheet, _fl ? LOL_GARDEN.flower : bio.floor, TS, sx, sy); if (!_fl) _lolDecal(ctx, sheet, bio, x, y, TS, sx, sy); }
      } else { ctx.fillStyle = v === 1 ? '#222' : fallFloor; ctx.fillRect(sx, sy, TS, TS); }
      if (!vis) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx, sy, TS, TS); }
    }
    // GIARDINO decor: alberi grandi (bottom-allineati). Piedistallo dei Sapienti → Slice 3.
    if (DUN.gardenFloor && DUN.gardenTrees) for (var gtk in DUN.gardenTrees) { if (!DUN.explored[gtk]) continue; var gtp = gtk.split(',').map(Number); _lolSpr(ctx, LOL.spr.tree, 0, TS, Math.round(gtp[0] * TS - camX), Math.round(gtp[1] * TS - camY)); }
    // mappa curata: oggetti scenografici y-sorted (alberi, cespugli, lanterne, animali, ancore)
    if (DUN.customDraw) for (var cdi = 0; cdi < DUN.customDraw.length; cdi++) {
      var cd = DUN.customDraw[cdi], cdef = CMAP_SPR[cd.name]; if (!cdef) continue;
      _lolSpr(ctx, cdef, 0, TS, Math.round(cd.x * TS - camX), Math.round(cd.y * TS - camY), cd.name.indexOf('animal') === 0 ? { noShadow: true } : null);
    }
    // discesa = porta (HUB S5: glow verde sobrio se il piano è già padroneggiato → "consigliato scendere")
    if (DUN.sx >= 0 && DUN.explored[DUN.sx + ',' + DUN.sy]) {
      if (DUN.stairReady) { ctx.save(); ctx.shadowColor = '#3fae5a'; ctx.shadowBlur = 10 + 3 * Math.sin(now / 400); }
      if (CM && CM.gatekeeper) {   // mappa curata: la discesa è presidiata dal guardiano disegnato in mappa
        var gks2 = _sheet('gatekeeper.png');
        if (_ready(gks2)) {
          var gf2 = Math.floor(now / 220) % 4, gdx = Math.round(DUN.sx * TS - camX), gdy = Math.round(DUN.sy * TS - camY);
          _lolShadow(ctx, gdx, gdy, TS, 0.30);
          ctx.drawImage(gks2, gf2 * 16, 0, 16, 16, gdx, gdy, TS, TS);
          _lolBubble(ctx, gdx, gdy, TS, '?');
        } else _lolSpr(ctx, LOL.spr.door, 0, TS, Math.round(DUN.sx * TS - camX), Math.round(DUN.sy * TS - camY));
      } else _lolSpr(ctx, LOL.spr.door, 0, TS, Math.round(DUN.sx * TS - camX), Math.round(DUN.sy * TS - camY));
      if (DUN.stairReady) ctx.restore();
    }
    // loot dai nemici
    for (var ik in DUN.items) { if (!DUN.explored[ik]) continue; var ip = ik.split(',').map(Number); var ty = (DUN.items[ik] || {}).type; var dd = LOL.spr[ty === 'coin' ? 'coin' : (ty === 'gem' ? 'gem' : 'potion')]; _lolSpr(ctx, dd, 0, TS, Math.round(ip[0] * TS - camX), Math.round(ip[1] * TS - camY - Math.sin(now / 300 + ip[0]) * 2)); }
    // sorgenti memory: libro/scroll vettoriali, vaso=container, forziere legacy=chest
    for (var k in DUN.sources) {
      if (!DUN.explored[k]) continue;
      var s = DUN.sources[k], p = k.split(',').map(Number), dx = Math.round(p[0] * TS - camX), dy = Math.round(p[1] * TS - camY);
      if (s.type === 'libro') _lolSpr(ctx, LOL.spr.book, s.extracted ? 1 : 0, TS, dx, dy);
      else if (s.type === 'scroll') _lolSpr(ctx, LOL.spr.scroll, s.extracted ? 1 : 0, TS, dx, dy);
      else if (s.type === 'vaso') { if (s.extracted) ctx.globalAlpha = 0.4; _lolSpr(ctx, LOL.spr.vaso, 0, TS, dx, dy); ctx.globalAlpha = 1; }
      else if (s.type === 'condotto' || s.type === 'server') { if (s.extracted && s.type === 'server') ctx.globalAlpha = 0.45; ctx.font = Math.round(TS * 0.75) + 'px serif'; ctx.fillText(s.type === 'condotto' ? '⚡' : '🖥', dx + Math.round(TS * 0.12), dy + Math.round(TS * 0.8)); ctx.globalAlpha = 1; }   // §17: condotto/server
      else _lolSpr(ctx, s.extracted ? LOL.spr.chestOpen : LOL.spr.chestClosed, 0, TS, dx, dy);
    }
    for (var ck in DUN.corpses) { if (!DUN.explored[ck]) continue; var cp = ck.split(',').map(Number); _lolSpr(ctx, LOL.spr.corpse, 0, TS, Math.round(cp[0] * TS - camX), Math.round(cp[1] * TS - camY)); }
    if (DUN.mobs) for (var mj = 0; mj < DUN.mobs.length; mj++) {
      var mo = DUN.mobs[mj]; if (!mo.alive) continue; var mk = mo.x + ',' + mo.y; if (!DUN.visible[mk]) continue;
      var sdef = _lolMobSpr(mo); _lolSpr(ctx, sdef, Math.floor(now / 200) % (sdef.n || 1), TS, Math.round(mo.x * TS - camX), Math.round(mo.y * TS - camY), { flip: mo.x > DUN.px });
    }
    if (DUN.boss && !DUN.boss.defeated && DUN.explored[DUN.boss.x + ',' + DUN.boss.y]) {   // Guardiano della Memoria = mago glow magenta
      var bdx = Math.round(DUN.boss.x * TS - camX), bdy = Math.round(DUN.boss.y * TS - camY);
      ctx.save(); ctx.shadowColor = '#bf6979'; ctx.shadowBlur = 16; _lolSpr(ctx, LOL.spr.guardian, Math.floor(now / 260) % 4, TS, bdx, bdy); ctx.restore();
    }
    if (DUN.gardenNpcs) for (var gnk in DUN.gardenNpcs) {
      var gp = DUN.gardenNpcs[gnk], ndx = Math.round(gp.x * TS - camX), ndy = Math.round(gp.y * TS - camY - Math.sin(now / 500 + gp.x) * 1.5);
      if (gp.wilt) ctx.globalAlpha = 0.72;
      _lolSpr(ctx, gp.custode ? LOL.spr.custode : (gp.sprDef || LOL.spr.npc), 0, TS, ndx, ndy, (gp.beh && gp.beh.faceLeft) ? { flip: true } : null);
      ctx.globalAlpha = 1;
      // bubble: custode '?' > appassito 🥀 > player vicino '!' > emote termine-chiave > '…'
      if (gp.custode) _lolBubble(ctx, ndx, ndy, TS, '?');
      else if (gp.wilt) _lolBubble(ctx, ndx, ndy, TS, '🥀');
      else if (gp.beh && gp.beh.state === 'TURN') _lolBubble(ctx, ndx, ndy, TS, '!');
      else if (gp.beh && now < gp.beh.emoteUntil) _lolBubbleText(ctx, ndx, ndy, TS, gp.beh.emoteTerm);
      else _lolBubble(ctx, ndx, ndy, TS, '…');
    }
    if (DUN.raduraTotems) for (var rtk in DUN.raduraTotems) { var rt = DUN.raduraTotems[rtk], rdx = Math.round(rt.x * TS - camX), rdy = Math.round(rt.y * TS - camY); if (rt.done) ctx.globalAlpha = 0.45; _lolSpr(ctx, LOL.spr.lantern, 0, TS, rdx, rdy); ctx.globalAlpha = 1; if (!rt.done) _lolBubble(ctx, rdx, rdy, TS, '!'); }   // S4: totem FE (spenti se completati)
    if (DUN.gateRoom) { var gks = _sheet('gatekeeper.png'); if (_ready(gks)) { var bf = Math.floor(now / 220) % 4, kdx = Math.round(DUN.gateRoom.bx * TS - camX), kdy = Math.round(DUN.gateRoom.by * TS - camY); _lolShadow(ctx, kdx, kdy, TS, 0.30); ctx.save(); ctx.shadowColor = '#bf6979'; ctx.shadowBlur = 12; ctx.drawImage(gks, bf * 16, 0, 16, 16, kdx, kdy, TS, TS); ctx.restore(); _lolBubble(ctx, kdx, kdy, TS, '?'); } }
    _lolPlayer(ctx, TS, Math.round(DUN.px * TS - camX), Math.round(DUN.py * TS - camY) - _jumpBump(TS), !!DUN.path, DUN.facing);
    _lolDark(ctx, W, H, TS, camX, camY);
    _lolBossBar(ctx, W, H);
    _renderFx(ctx, TS, camX, camY, W, H);
    _renderHud();
  }

  // ════════════════════════ NPC + COMBATTIMENTO (passata B) ══════════════════
  function _mobAt(x, y) { for (var i = 0; i < DUN.mobs.length; i++) { var m = DUN.mobs[i]; if (m.alive && m.x === x && m.y === y) return m; } return null; }
  function _spawnMobs(f) {
    if (f.kind === 'scuola' || _studyMode()) return;   // onboarding / modalità studio: nessun nemico
    var lvl = f.level, hp = lvl <= 1 ? 5 : (lvl === 2 ? 6 : 8);   // HP per livello (regola utente)
    var tiles = []; for (var k in DUN.map) if (DUN.map[k] === 0) tiles.push(k);
    // gen bilanciata: piani COMBAT più nemici (poche stanze, solo nemici); MISTI meno (ci sono già i memory-mostri)
    var n = f.kind === 'combat'
      ? Math.max(4, Math.min(14, 4 + lvl + Math.floor(tiles.length / 110)))
      : Math.max(2, Math.min(9, 1 + lvl + Math.floor(tiles.length / 200)));
    var occ = {}; occ[DUN.px + ',' + DUN.py] = true; if (DUN.sx >= 0) occ[DUN.sx + ',' + DUN.sy] = true;
    if (DUN.boss) occ[DUN.boss.x + ',' + DUN.boss.y] = true;   // non spawnare mob sul Guardiano
    for (var sk in DUN.sources) occ[sk] = true;
    for (var ik2 in DUN.items) occ[ik2] = true;
    for (var em = 0; em < DUN.mobs.length; em++) occ[DUN.mobs[em].x + ',' + DUN.mobs[em].y] = true;   // memory-mostri già piazzati
    tiles.sort(function () { return Math.random() - 0.5; });
    var placed = 0;
    for (var i = 0; i < tiles.length && placed < n; i++) {
      var key = tiles[i]; if (occ[key]) continue;
      var p = key.split(',').map(Number);
      if (Math.abs(p[0] - DUN.px) + Math.abs(p[1] - DUN.py) < 6) continue;
      var e = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
      DUN.mobs.push({ x: p[0], y: p[1], hp: hp, maxhp: hp, name: e.n, anim: _mobAnim(e), moveAt: Date.now() + Math.random() * 700, alive: true });
      occ[key] = true; placed++;
    }
  }
  function _mobTick() {
    if (!DUN.mobs) return; var now = Date.now();
    for (var i = 0; i < DUN.mobs.length; i++) {
      var m = DUN.mobs[i]; if (!m.alive || now < m.moveAt) continue;
      m.moveAt = now + 280 + Math.random() * 180;
      var dist = Math.abs(m.x - DUN.px) + Math.abs(m.y - DUN.py);
      if (dist === 1 && _mobEngage(m)) { _startDuel(m); return; }   // §21: niente duello attraverso un dislivello
      var nx = m.x, ny = m.y, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (dist <= 8) {
        var bd = dist, best = null;
        for (var di = 0; di < 4; di++) { var x = m.x + dirs[di][0], y = m.y + dirs[di][1]; if (DUN.map[x + ',' + y] !== 0 || !_mobStepOk(m.x, m.y, x, y) || _mobAt(x, y) || (x === DUN.px && y === DUN.py)) continue; var nd = Math.abs(x - DUN.px) + Math.abs(y - DUN.py); if (nd < bd) { bd = nd; best = [x, y]; } }
        if (best) { nx = best[0]; ny = best[1]; }
      } else if (Math.random() < 0.4) {
        var d = dirs[Math.floor(Math.random() * 4)], x2 = m.x + d[0], y2 = m.y + d[1];
        if (DUN.map[x2 + ',' + y2] === 0 && _mobStepOk(m.x, m.y, x2, y2) && !_mobAt(x2, y2) && !(x2 === DUN.px && y2 === DUN.py)) { nx = x2; ny = y2; }
      }
      m.x = nx; m.y = ny;
      if (Math.abs(m.x - DUN.px) + Math.abs(m.y - DUN.py) === 1 && _mobEngage(m)) { _startDuel(m); return; }
    }
  }
  function _startDuel(m) {
    if (DUN.duel) return;
    var cfg = _combatCfg();
    DUN.duel = { mob: m, cfg: cfg, which: 'a', symbol: cfg.set.a.sym, deadline: 0, t0: 0 };
    DUN.path = null; _snd('door_locked');
    var how = cfg.mode === 'diritto' ? 'lo STESSO simbolo del fumetto' : 'il simbolo OPPOSTO del fumetto';
    _msg(_tSafe('dg_duel', 'Duello con {m}! Premi {h}.').replace('{m}', (m.memory ? _clean(m.memory.label) : m.name)).replace('{h}', how));
    _nextDuelRound();
  }
  function _nextDuelRound() { if (!DUN.duel) return; var set = DUN.duel.cfg.set, which = Math.random() < 0.5 ? 'a' : 'b'; DUN.duel.which = which; DUN.duel.symbol = set[which].sym; DUN.duel.t0 = Date.now(); DUN.duel.deadline = DUN.duel.t0 + _reactWindow(); }
  // finestra di reazione adattiva: parte permissiva, si stringe del 10% ogni 10 kill (e segue il RT medio del player)
  function _reactWindow() {
    var s = DUN.duelStats || {}, base = 1600;
    if (s.correct && s.correct >= 5) base = Math.max(700, Math.min(2000, Math.round((s.sumRt / s.correct) * 1.6)));
    return Math.max(500, Math.round(base * Math.pow(0.9, Math.floor((DUN.kills || 0) / 10))));
  }
  function _duelInput(k) {
    if (!DUN.duel) return;
    var cfg = DUN.duel.cfg, set = cfg.set, which = DUN.duel.which, m = DUN.duel.mob;
    var wantWhich = (cfg.mode === 'diritto') ? which : (which === 'a' ? 'b' : 'a');   // diritto=stesso · opposto=l'altro
    var want = set[wantWhich].key;
    var rt = Date.now() - (DUN.duel.t0 || Date.now()), correct = (k === want);
    _recordDuel(rt, correct);
    if (correct) { m.hp -= 2; _snd('hit'); DUN.flash = { c: '120,220,255', a: 0.45 }; if (m.hp <= 0) return _mobDie(m); }
    else { DUN.hp -= 1; _snd('miss'); DUN.flash = { c: '230,60,60', a: 0.5 }; if (DUN.hp <= 0) return _playerDie(); }
    _nextDuelRound();
  }
  function _duelTimeout() { if (!DUN.duel) return; _recordDuel(1500, false); DUN.hp -= 1; _snd('miss'); DUN.flash = { c: '230,60,60', a: 0.5 }; if (DUN.hp <= 0) return _playerDie(); _nextDuelRound(); }
  // metriche duello: tempi di reazione (evoluzione del player) — persistite
  var DUEL_KEY = 'mappai_dungeon_duel';
  function _recordDuel(rt, correct) {
    var s; try { s = JSON.parse(localStorage.getItem(DUEL_KEY) || '{}'); } catch (e) { s = {}; }
    s.n = (s.n || 0) + 1; s.last = rt;
    if (correct) { s.correct = (s.correct || 0) + 1; s.sumRt = (s.sumRt || 0) + rt; s.best = s.best ? Math.min(s.best, rt) : rt; }
    _lsSet(DUEL_KEY, JSON.stringify(s));
    DUN.duelStats = s;
    _logEv('duel', { rt: rt, ok: !!correct });   // telemetria EF (inibizione) — NON va su MappAIMastery: non è contenuto
  }
  function _mobDie(m) {
    m.alive = false; DUN.duel = null; DUN.kills = (DUN.kills || 0) + 1; _snd('powerup');   // niente scheletro: il corpo diventa loot
    if (m.memory) {
      _msg(_tSafe('dg_freed', 'Memory unit liberata: {l}').replace('{l}', _clean(m.memory.label)));
      _captureMemory(m.memory, 'desc');   // cattura attiva → addDiary + record dentro la cattura
    } else {
      var r = Math.random();   // il corpo del nemico si trasforma SEMPRE in moneta o pozione
      var drop = r < 0.10 ? 'potion_green' : (r < 0.40 ? 'potion_blue' : 'coin');
      DUN.items[m.x + ',' + m.y] = { type: drop };
      _msg(_tSafe('dg_defeated', 'Hai sconfitto {m} → {d}.').replace('{m}', m.name).replace('{d}', (drop === 'coin' ? _tSafe('dg_a_coin', 'una moneta') : _tSafe('dg_a_potion', 'una pozione'))));
    }
  }
  function _playerDie() { DUN.duel = null; DUN.corpses[DUN.px + ',' + DUN.py] = true; _snd('miss'); _msg(_tSafe('dg_died', 'Sei caduto! Il diario è salvo. Riparti dal piano.')); DUN.hp = DUN.maxhp; _loadFloor(DUN.fi); }
  function _selectCharacter(done) {
    var ov = _overlay();
    var bs = 'padding:14px 22px;border-radius:10px;border:1px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;font-size:15px';
    ov.card.innerHTML = '<h3 style="margin:0 0 16px;font-size:18px;font-weight:500;text-align:center">Scegli il personaggio</h3>' +
      '<div style="display:flex;gap:16px;justify-content:center"><button id="ch-m" style="' + bs + '">♂ Maschio</button><button id="ch-f" style="' + bs + '">♀ Femmina</button></div>';
    ov.card.querySelector('#ch-m').onclick = function () { DUN.playerAnim = PLAYER_ANIM; DUN.lolOutfit = 1; ov.close(); done(); };
    ov.card.querySelector('#ch-f').onclick = function () { DUN.playerAnim = PLAYER_ANIM_F; DUN.lolOutfit = 2; ov.close(); done(); };
  }
  function _showRules(done) {
    var ov = _overlay(); ov.card.style.width = 'min(560px,95vw)';
    var go = function () { _setOnboarded(); ov.close(); done(); };
    var un = _esc(go); var study = _studyMode();
    ov.card.innerHTML =
      '<h3 style="margin:0 0 4px;font-size:18px;font-weight:600">🏫 Benvenuto nel Memory Dungeon</h3>' +
      '<div style="font-size:12px;color:#8fa4c4;margin-bottom:12px">Il primo piano è la "scuola": calmo, senza nemici. Prendi confidenza.</div>' +
      '<ul style="font-size:13px;color:#c3d2ea;line-height:1.7;margin:0 0 14px;padding-left:18px">' +
        '<li><b>Clic</b> = muoviti (point&amp;click).</li>' +
        '<li><b>📦 forzieri, libri, pergamene</b>: sblocca con un minigioco (puzzle), poi <b>cattura</b> la memory unit scrivendo la tua sintesi.</li>' +
        '<li><b>🏺 vasi</b>: raccogli pozioni, monete e diamanti.</li>' +
        (study
          ? '<li><b>Modalità studio attiva</b>: niente nemici. Solo oggetti da sbloccare e catturare.</li>'
          : '<li><b>👾 nemici</b>: duello — premi la <b>lettera OPPOSTA</b> del fumetto (F/J). <b>Z</b> = incantesimo (3 mana).</li>') +
        '<li><b>B</b> = diario (rileggi, annota in markdown, ripassa). <b>Esc</b> = esci.</li>' +
        '<li><b>Door Keeper</b> alle scale: rispondi per scendere. Ultimo piano = <b>Guardiano</b> → rivela la mappa.</li>' +
      '</ul>' +
      '<button id="rl-go" type="button" style="width:100%;' + GBS + ';border-color:#3fae5a;background:#15301f;font-size:15px;padding:12px">Iniziamo →</button>';
    ov.card.querySelector('#rl-go').onclick = function () { un(); go(); };
  }

  // ════════════════════════ SPELL push-away (tasto Z) ════════════════════════
  function _spellCells() {
    var f = (DUN.facing && (DUN.facing[0] || DUN.facing[1])) ? DUN.facing : [0, -1];
    var fx = f[0], fy = f[1], lx = -fy, ly = fx, px = DUN.px, py = DUN.py, cells = [];
    function add(x, y) { if (DUN.map[x + ',' + y] === 0) cells.push([x, y]); }
    add(px + fx, py + fy); add(px + 2 * fx, py + 2 * fy);                 // avanti 2
    add(px + lx, py + ly); add(px + 2 * lx, py + 2 * ly);                 // sinistra 2
    add(px - lx, py - ly); add(px - 2 * lx, py - 2 * ly);                 // destra 2
    add(px + fx + lx, py + fy + ly); add(px + fx - lx, py + fy - ly);    // diagonali avanti 1
    add(px - fx + lx, py - fy + ly); add(px - fx - lx, py - fy - ly);    // diagonali dietro 1
    add(px - fx, py - fy);                                               // dietro 1
    return cells;
  }
  function _pushEnemy(m, dx, dy, tiles) {
    var moved = 0;
    for (var s = 0; s < tiles; s++) {
      var nx = m.x + dx, ny = m.y + dy;
      if (DUN.map[nx + ',' + ny] !== 0) break;            // muro → stop
      if (nx === DUN.px && ny === DUN.py) break;
      var other = _mobAt(nx, ny);
      if (other) { _pushEnemy(other, dx, dy, tiles - s); if (_mobAt(nx, ny)) break; }   // catena
      m.x = nx; m.y = ny; moved++;
    }
    return moved;
  }
  function _castSpell() {
    if (!DUN || DUN.busy || DUN.duel) return;
    if (DUN.mana < 3) { _msg(_tSafe('dg_no_mana', 'Mana insufficiente (servono 3).')); return; }
    DUN.mana -= 3;
    var cells = _spellCells();
    DUN.spellFx = { cells: cells, t: 1 }; DUN.flash = { c: '120,200,255', a: 0.4 }; _snd('powerup');
    var hit = [];
    cells.forEach(function (c) { var m = _mobAt(c[0], c[1]); if (m && hit.indexOf(m) < 0) hit.push(m); });
    if (!hit.length) { _msg(_tSafe('dg_spell_miss', 'Spell lanciata: nessun nemico nell\'area.')); return; }
    hit.sort(function (a, b) { return (Math.abs(b.x - DUN.px) + Math.abs(b.y - DUN.py)) - (Math.abs(a.x - DUN.px) + Math.abs(a.y - DUN.py)); });
    hit.forEach(function (m) {
      if (!m.alive) return;
      var dx = m.x === DUN.px ? 0 : (m.x > DUN.px ? 1 : -1), dy = m.y === DUN.py ? 0 : (m.y > DUN.py ? 1 : -1);
      if (!dx && !dy) dy = (DUN.facing[1] || -1);
      var moved = _pushEnemy(m, dx, dy, 3);
      if (moved === 0) { _msg(m.name + ' contro il muro: eliminato!'); _mobDie(m); }
      else { m.hp -= 4; if (m.hp <= 0) _mobDie(m); }
    });
    _msg(_tSafe('dg_spell_push', 'Spell push-away! (−3 mana)'));
  }

  // ════════════════════════ GATE KEEPER + quiz riusabile ═════════════════════
  function _gateThr() { try { var g = JSON.parse(localStorage.getItem('mappai_dungeon_gate') || '{}'); return (g.accThr != null) ? g.accThr : 0.6; } catch (e) { return 0.6; } }
  function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9àèéìòù ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function _fuzzy(a, b) {
    a = _norm(a); b = _norm(b); if (!a || !b) return false; if (a === b) return true;
    var ta = a.split(' '), tb = b.split(' '), hit = 0;
    tb.forEach(function (t) { if (t.length > 2 && ta.indexOf(t) >= 0) hit++; });
    return hit / Math.max(1, tb.filter(function (t) { return t.length > 2; }).length) >= 0.5;
  }
  function _otherThan(pool, node) { for (var i = 0; i < 24; i++) { var o = pool[Math.floor(Math.random() * pool.length)]; if (o.label !== node.label) return o; } return null; } // cap tentativi → niente loop infinito con label duplicate
  function _reEsc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // Stem di domanda: testo COMPLETO (mai troncato) col nome del concetto MASCHERATO (cloze)
  // → non regala la risposta. Maschera l'etichetta intera + le sue parole significative (>3).
  function _stem(text, label) {
    text = String(text || '').trim(); if (!text) return '';
    var lab = _norm(label);
    if (lab) {
      try { text = text.replace(new RegExp(_reEsc(_clean(label)), 'gi'), '____'); } catch (e) {}
      lab.split(' ').forEach(function (w) { if (w.length > 3) { try { text = text.replace(new RegExp('\\b' + _reEsc(w) + '[a-zàèéìòù]*', 'gi'), '____'); } catch (e) {} } });
    }
    return text.replace(/(?:____\s*){2,}/g, '____ ').trim(); // collassa blank ripetuti
  }
  // Formato-domanda ADATTIVO per mastery (ZPD + fading, c10 — flag mappai_dungeon_adaptive, default ON):
  // nuovo → binaria (tf), in-corso → MC, acquisito/fluente → aperta. Cap tentativi <3 in dungeon-core
  // (anti-inflazione EWMA). null = flag off o core assente → rotazione fissa i%3 (legacy).
  function _zpdType(id) {
    var C = _core(); if (!C || id == null) return null;
    try { if (localStorage.getItem('mappai_dungeon_adaptive') === '0') return null; } catch (e) { return null; }
    var MM = window.MappAIMastery, agg = null;
    try { agg = (MM && typeof MM.node === 'function') ? MM.node(id) : null; } catch (e) {}
    var lvl = 'nuovo', att = 0;
    if (agg && agg.attempts) {
      att = agg.attempts;
      lvl = (typeof MM.masteryLevel === 'function') ? MM.masteryLevel({ attempts: agg.attempts, accuracy: agg.accuracy, rate: agg.rate }) : (agg.accuracy >= 0.8 ? 'acquisito' : 'in-corso');
    }
    return C.zpdFormat(lvl, att);   // 'tf' | 'mc' | 'open'
  }
  function _genQuestions(pool, count, subjects) {
    var qs = [];
    // sequenza soggetti SENZA reimmissione e DE-DUPATA per nodo → niente nodo ripetuto nello stesso quiz
    // (causa di "stesse domande due volte di fila": più voci diario per lo stesso id, o pick casuale del boss).
    var raw = (subjects && subjects.length) ? subjects.slice() : _shuffle((pool || []).slice());
    var seen = {}, seq = [];
    raw.forEach(function (p) { var k = String(p && p.id != null ? p.id : (p && p.label)); if (!seen[k]) { seen[k] = 1; seq.push(p); } });
    var n = Math.min(count, seq.length);   // non ciclare: max 1 quesito per soggetto distinto
    for (var i = 0; i < n; i++) {
      var node = seq[i];
      var fmt = _zpdType(node.id);   // difficoltà ZPD dal livello mastery del nodo (null → rotazione legacy)
      var type = fmt ? (fmt === 'tf' ? 0 : (fmt === 'mc' ? 1 : 2)) : (i % 3);
      // ogni domanda porta nodeId+subjLabel del SOGGETTO → mastery per-quesito + telemetria (prima si perdevano)
      if (node.kind === 'rel') { qs.push({ kind: 'open', nodeId: node.id, subjLabel: node.label, q: 'Spiega con parole tue questa relazione:<br><span style="color:#b9e6c9">«' + _esch(node.label) + '»</span>', answer: node.label, ref: node.desc }); continue; } // relazioni → sempre "spiega" (il masking le distruggerebbe)
      var aiq = (type < 2) ? _aiQuestionFor(node, type === 0 ? 'tf' : 'mc') : null; // MC/TF dal generatore AI ancorato al contenuto, se pronto
      if (aiq) { aiq.nodeId = node.id; aiq.subjLabel = node.label; qs.push(aiq); continue; }
      // FALLBACK senza quiz AI pronto: SEMPRE domanda aperta (valutata semanticamente). Niente cloze "____" → era la causa delle "domande stupide".
      qs.push({ kind: 'open', nodeId: node.id, subjLabel: node.label, q: 'Spiega con parole tue: «' + _esch(node.label) + '» — che cosa sai di questo concetto?', answer: node.label, ref: node.desc });
    }
    return qs;
  }
  // nodo reale di appState per id (così flashcardTest si cachea sul nodo condiviso)
  function _nodeById(id) { var st = _getAppState(), nodes = (st && st.db && st.db.nodes) || []; for (var i = 0; i < nodes.length; i++) if (String(nodes[i].id) === String(id)) return nodes[i]; return null; }
  function _groupOf(id) { var n = _nodeById(id); return n ? n.group : null; } // macro-area per distrattori MC
  function _nodeLabel(id) { var n = _nodeById(id); return n ? _clean(n.label) : ''; }
  function _lid(x) { return (x && x.id != null) ? x.id : x; }   // link source/target può essere id o nodo D3
  // una relazione del nodo (per i vasi): {targetId, targetLabel, rel}. null se il nodo non ha link con rel.
  function _relFor(node) {
    var st = _getAppState(), links = (st && st.db && st.db.links) || [], cand = [];
    links.forEach(function (l) {
      if (!l || !l.rel) return;
      var s = String(_lid(l.source)), t = String(_lid(l.target));
      if (s === String(node.id)) { var lb = _nodeLabel(t); if (lb) cand.push({ targetId: t, targetLabel: lb, rel: _clean(l.rel) }); }
      else if (t === String(node.id)) { var lb2 = _nodeLabel(s); if (lb2) cand.push({ targetId: s, targetLabel: lb2, rel: _clean(l.rel) }); }
    });
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }
  // Un nodo è STUDIABILE se ha una desc non vuota o almeno una citazione (A12).
  // I nodi vuoti non diventano sorgenti sul pavimento: verrebbero interrogati sul nulla.
  function _hasContent(nd) {
    if (_clean(_desc(nd) || '')) return true;
    var st = _getAppState(), c = (st && st.db && st.db.sourcesDict && st.db.sourcesDict[nd.id]) || [];
    return !!(c.length && _clean(c[0].text));
  }
  // risolve il contenuto da catturare in base al tipo di sorgente, con fallback a 'desc'
  function _memoryContent(node, kind) {
    var st = _getAppState();
    if (kind === 'cite') { var c = (st && st.db && st.db.sourcesDict && st.db.sourcesDict[node.id]) || []; if (c.length && _clean(c[0].text)) return { kind: 'cite' }; }
    if (kind === 'rel') { var rel = _relFor(node); if (rel) return { kind: 'rel', rel: rel }; }
    return { kind: 'desc' };
  }
  function _poolEntry(d) { return { id: d.id, label: d.label, desc: d.desc, g: _groupOf(d.id), kind: d.kind || 'desc' }; }
  // ════════ AI 3-TIER (F2): cloud (timeout) → LLM locale (GBNF) → deterministico ════════
  // Timeout via Promise.race: la UI si sblocca sempre (la richiesta zombie sottostante è accettabile
  // — niente AbortController senza toccare app.js).
  function _withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('AI_TIMEOUT')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  // Tier LOCALE: riusa il servizio NPC (node-llama-cpp) via IPC. Grammatica GBNF da JSON-schema
  // → output SEMPRE ben formato. Model path = stesso del sistema NPC (mappai_npc_model_path).
  var _localLlmDead = false;   // LOW_RAM / errore fatale → tier locale spento per la sessione
  function _localModelPath() { try { return localStorage.getItem('mappai_npc_model_path') || null; } catch (e) { return null; } }
  function _localTierOn() { try { return localStorage.getItem('mappai_dungeon_ai_tiers') !== '0'; } catch (e) { return true; } }
  function _localLlmOk() { return !!(!_localLlmDead && _localModelPath() && _localTierOn() && window.electronAPI && typeof window.electronAPI.generateLocalNPCAction === 'function'); }
  function _setAiMode(m) { if (DUN && DUN.aiMode !== m) { DUN.aiMode = m; _logEv('ai', { mode: m }); } }
  function _localStructured(systemPrompt, userText, schema, maxTokens, timeoutMs) {
    if (!_localLlmOk()) return Promise.reject(new Error('NO_LOCAL'));
    return _withTimeout(window.electronAPI.generateLocalNPCAction({
      npcId: 'dungeon_quizmaster', systemPrompt: systemPrompt, userText: userText,
      schema: schema, modelPath: _localModelPath(), temperature: 0.3, maxTokens: maxTokens || 350
    }), timeoutMs || 45000).then(function (r) {
      if (r && r.success && r.data != null) return r.data;
      var msg = (r && r.error) || 'LOCAL_FAIL';
      if (/LOW_RAM/i.test(String(msg))) _localLlmDead = true;   // RAM insufficiente: non riprovare in sessione
      throw new Error(msg);
    });
  }
  // ── CACHE QUIZ persistente per mappa (A7): sopravvive al reload, zero costi ripetuti.
  // Invalidazione per HASH della desc: se il contenuto del nodo cambia → cache miss → rigenera.
  function _quizKey() { return 'mappai_dungeon_quiz__' + _mapSig(); }
  function _quizCacheAll() { try { var o = JSON.parse(localStorage.getItem(_quizKey()) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
  function _hash(s) { var C = _core(); if (C) return C.strHash(s); s = String(s || ''); var h = 0; for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function _quizCacheGet(nodeId, desc) {
    var e = _quizCacheAll()[String(nodeId)];
    if (!e || e.h !== _hash(desc) || !Array.isArray(e.items) || !e.items.length) return null;
    return e;   // {h, items, ts, src:'cloud'|'local'}
  }
  function _quizCachePut(nodeId, desc, items, src) {
    var all = _quizCacheAll(), k = String(nodeId), prev = all[k];
    if (prev && prev.src === 'cloud' && src === 'local' && prev.h === _hash(desc)) return;   // il locale non sovrascrive MAI il cloud
    all[k] = { h: _hash(desc), items: items, ts: Date.now(), src: src || 'cloud' };
    _lsSet(_quizKey(), JSON.stringify(all));
  }
  // idrata in blocco i _dunQuiz dei nodi del diario dalla cache (solo lettura, zero AI) — a inizio dungeon
  function _hydrateQuizFromCache() {
    (DUN.diary || []).forEach(function (d) {
      if (d.ghost) return; var node = _nodeById(d.id); if (!node || node._dunQuiz) return;
      var c = _quizCacheGet(d.id, _desc(node)); if (c) node._dunQuiz = c.items;
    });
  }
  // Genera quiz ancorati al contenuto: ① cloud (12s timeout) → ② locale (2 item, prompt corto,
  // validazione deterministica obbligatoria — il 4B produce JSON valido ma non item garantiti sensati)
  // → ③ null (fallback = domande aperte in _genQuestions). Schema {stem,a1,a2,a3,correct 1-based}.
  function _genQuizForNode(node, fresh) {
    var content = _desc(node);
    if (!content) return Promise.resolve(null);
    var key = null; try { key = window.getSystemKey ? window.getSystemKey() : null; } catch (e) {}
    var canCloud = !!(key && typeof window.fetchModelAPI === 'function');
    var cached = fresh ? null : _quizCacheGet(node.id, content);   // fresh=true → salta la cache (rigenera)
    if (cached && !(cached.src === 'local' && canCloud)) { node._dunQuiz = cached.items; return Promise.resolve(cached.items); }   // cache hit (ma il cloud può sostituire il locale)
    function accept(arr, src) {
      if (!Array.isArray(arr)) return null;
      var C = _core();
      var clean = arr.filter(function (it) { return C ? C.validQuizItem(it, node.label) : (it && (it.stem || it.q) && it.a1 && it.a2); });
      if (!clean.length) return null;
      node._dunQuiz = clean;
      _quizCachePut(node.id, content, clean, src);
      return clean;
    }
    if (canCloud) {
      var sys = _dgEn() ? 'You are an author of educational quizzes for students with special educational needs (SEN/dyslexia). ALWAYS write in English. Rely EXCLUSIVELY on the provided content: do NOT invent facts that are not there, do NOT use outside or general knowledge.' : 'Sei un autore di quiz didattici per studenti BES/DSA. Scrivi SEMPRE in italiano. Basati ESCLUSIVAMENTE sul contenuto fornito: NON inventare fatti non presenti, NON usare conoscenza esterna o di cultura generale.';
      var prompt = _dgEn() ? ('Concept: "' + _clean(node.label) + '"\n\nStudy content (the ONLY allowed source):\n' + content + '\n\nWrite 4 COMPLETION questions in English, based ONLY on this content. Each question is a sentence STEM to complete, with 3 short completions: only ONE correct and faithful to the content, two plausible but wrong. Completions must continue the stem NATURALLY (do not repeat it, no capital letter at the start, no question mark). Avoid completions that give the answer away inside the stem. Reply ONLY with a JSON array, no text before or after. Format (abstract example, replace with content from the text):\n[{"stem":"<sentence beginning to complete>","a1":"<correct completion, faithful to the text>","a2":"<plausible but wrong completion>","a3":"<plausible but wrong completion>","correct":1}]\n"correct" is 1, 2 or 3 (the number of the right completion).') : ('Concetto: "' + _clean(node.label) + '"\n\nContenuto di studio (UNICA fonte ammessa):\n' + content + '\n\nGenera 4 domande a COMPLETAMENTO in italiano, basate SOLO su questo contenuto. Ogni domanda è un INCIPIT di frase ("stem") da completare, con 3 completamenti brevi: UNO solo corretto e fedele al contenuto, due plausibili ma errati. I completamenti devono proseguire NATURALMENTE lo stem (non ripeterlo, non iniziare con maiuscola, niente punto di domanda). Evita completamenti che svelano la risposta nello stem. Rispondi SOLO con un array JSON, senza testo prima o dopo. Formato (esempio astratto, sostituisci con contenuti tratti dal testo):\n[{"stem":"<inizio di frase da completare>","a1":"<completamento corretto e fedele al testo>","a2":"<completamento plausibile ma errato>","a3":"<completamento plausibile ma errato>","correct":1}]\n"correct" è 1, 2 o 3 (numero del completamento corretto).');
      var _nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
      prompt += (_dgEn() ? '\n\n[Variation code: ' : '\n\n[Codice di variazione: ') + _nonce + (_dgEn() ? ' — make the questions differ from previous versions]' : ' — genera domande diverse da versioni precedenti]');
      var payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: (window.QUIZ_TEMPERATURE || 0.7), maxOutputTokens: 1024, _respectTemp: true } };
      if (window.injectClassTuning) window.injectClassTuning(payload);   // MappAI Live: quiz tarato sulla classe attiva
      if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'dungeon');
      return _withTimeout(window.fetchModelAPI(payload, key), 12000).then(function (resp) {
        _setAiMode('cloud');
        var txt = (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] && resp.candidates[0].content.parts[0].text) || '';
        var arr = window.salvageTruncatedJSON ? window.salvageTruncatedJSON(txt) : JSON.parse(txt);
        return accept(arr, 'cloud') || _genQuizLocal(node, content, accept);   // cloud vuoto/invalido → prova il locale
      }).catch(function () { return _genQuizLocal(node, content, accept); });
    }
    return _genQuizLocal(node, content, accept);
  }
  function _genQuizLocal(node, content, accept) {
    if (!_localLlmOk()) { _setAiMode('off'); return Promise.resolve(node._dunQuiz || null); }
    if (DUN && (DUN.gardenFloor || DUN.duel)) return Promise.resolve(node._dunQuiz || null);   // mutex NPC: mai durante dialoghi giardino/duelli
    var sys = _dgEn() ? 'You are an author of educational quizzes. Reply ONLY in English. Rely ONLY on the provided content, no outside knowledge.' : 'Sei un autore di quiz didattici. Rispondi SOLO in italiano. Basati SOLO sul contenuto fornito, niente conoscenza esterna.';
    var user = _dgEn() ? ('Concept: "' + _clean(node.label) + '"\nContent:\n' + _softCut(content, 400) + '\n\nWrite 2 completion questions: "stem" = the beginning of a sentence, then 3 short completions (only one correct). "correct" = the number of the right completion (1, 2 or 3).') : ('Concetto: "' + _clean(node.label) + '"\nContenuto:\n' + _softCut(content, 400) + '\n\nScrivi 2 domande a completamento: "stem" = incipit di frase, poi 3 completamenti brevi (uno solo corretto). "correct" = numero del completamento corretto (1, 2 o 3).');
    var schema = { type: 'array', items: { type: 'object', properties: { stem: { type: 'string' }, a1: { type: 'string' }, a2: { type: 'string' }, a3: { type: 'string' }, correct: { type: 'integer' } }, required: ['stem', 'a1', 'a2', 'correct'] } };
    return _localStructured(sys, user, schema, 350, 45000).then(function (arr) {
      _setAiMode('local');
      return accept(arr, 'local');
    }).catch(function () { _setAiMode('off'); return node._dunQuiz || null; });
  }
  function _ensureQuiz(id, fresh) {
    var node = _nodeById(id);
    if (!node) return;
    var content = _desc(node);
    if (!content) return;
    // fresh=true (resetQuiz): NON idratare dalla cache né uscire — rigenera davvero dall'AI
    // (senza questo, resetQuiz ri-leggeva la stessa cache localStorage e non cambiava nulla).
    if (!fresh && !node._dunQuiz) { var c = _quizCacheGet(id, content); if (c) node._dunQuiz = c.items; }   // idrata dalla cache (zero costi)
    var canCloud = false; try { canCloud = !!(window.getSystemKey && window.getSystemKey() && typeof window.fetchModelAPI === 'function'); } catch (e) {}
    var cached = fresh ? null : _quizCacheGet(id, content);
    var wantUpgrade = !!(node._dunQuiz && cached && cached.src === 'local' && canCloud);   // il cloud sostituisce gli item locali
    if (!fresh && node._dunQuiz && !wantUpgrade) return;
    var pend = node._quizGenPending;
    if (!fresh && pend && (Date.now() - pend) < 60000) return;   // A17: pending con timestamp → retry ammesso dopo 60s (mai bloccato per sempre)
    node._quizGenPending = Date.now();
    _genQuizForNode(node, fresh).then(function () { node._quizGenPending = 0; }, function () { node._quizGenPending = 0; });
  }
  // Costruisce una domanda dal pool AI del nodo (schema {stem|q, a1,a2,a3, correct 1-based}). null se non pronto → fallback.
  // Forma: STEM dichiarativo da completare + completamenti. 'tf' → scelta binaria (corretto + 1 distrattore); altrimenti MC a 3.
  function _aiQuestionFor(entry, kind) {
    var node = (entry && entry.id != null) ? _nodeById(entry.id) : null;
    var fc = node && node._dunQuiz;   // solo quiz dungeon ancorati al contenuto (non l'app flashcardTest, rotta)
    if (!fc || !fc.length) return null;
    var it = fc[Math.floor(Math.random() * fc.length)];
    if (!it || (!it.stem && !it.q) || it.a1 == null) return null;
    var opts = [it.a1, it.a2, it.a3].filter(function (o) { return o != null && String(o).trim() !== ''; });
    if (opts.length < 2) return null;
    var ci = Math.max(1, Math.min(3, parseInt(it.correct, 10) || 1));   // correct è 1-based (1→a1, 2→a2, 3→a3)
    var correct = it['a' + ci] != null ? it['a' + ci] : it.a1;
    var stem = (it.stem && String(it.stem).trim()) ? String(it.stem).trim() : '';
    var head = stem
      ? (_esch(stem) + ' …<br><span style="color:#9fb3d4;font-size:14px">Completa la frase:</span>')   // stem dichiarativo da completare (BES/DSA, esempio utente)
      : _esch(it.q);                                                                                    // legacy: domanda "?" diretta
    if (kind === 'tf') {   // scelta binaria A/B: completamento corretto + 1 distrattore plausibile
      var wrong = opts.filter(function (o) { return o !== correct; });
      if (!wrong.length) return { kind: 'mc', q: head, opts: _shuffle(opts.slice()), answer: correct, expl: it.explanation };
      var two = _shuffle([correct, wrong[Math.floor(Math.random() * wrong.length)]]);
      return { kind: 'mc', q: head, opts: two, answer: correct, expl: it.explanation };
    }
    return { kind: 'mc', q: head, opts: _shuffle(opts.slice()), answer: correct, expl: it.explanation };
  }
  // Scoring risposte aperte: AI di DEFAULT (affinità SEMANTICA, non match esatto di parole). 'false' forza il fallback deterministico (offline/no costo).
  function _aiScoring() { try { return localStorage.getItem('mappai_dungeon_ai_scoring') !== 'false'; } catch (e) { return true; } }
  // IDF sul corpus del diario (text-network-light): termini rari/specifici pesano di più dei comuni.
  function _corpusIDF() {
    if (!DUN || !DUN.diary || !DUN.diary.length) return null;
    var docs = DUN.diary.map(function (d) { return _norm(d.desc); }), N = docs.length, df = {};
    docs.forEach(function (doc) { var seen = {}; doc.split(' ').forEach(function (w) { if (w.length > 3 && !seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
    var idf = {}; Object.keys(df).forEach(function (w) { idf[w] = Math.log((N + 1) / df[w]); });
    return idf;
  }
  // Copertura concettuale deterministica: % (pesata IDF) dei termini-chiave del riferimento presenti nella risposta.
  function _keywordCoverage(student, ref, idf) {
    var rw = _norm(ref).split(' ').filter(function (w) { return w.length > 3; });
    if (!rw.length) return 0;
    var sw = {}; _norm(student).split(' ').forEach(function (w) { if (w.length > 3) sw[w] = 1; });
    var uniq = {}; rw.forEach(function (w) { uniq[w] = 1; });
    var keys = Object.keys(uniq), tot = 0, hit = 0;
    keys.forEach(function (w) { var wt = (idf && idf[w]) ? idf[w] : 1; tot += wt; if (sw[w]) hit += wt; });
    return tot ? hit / tot : 0;
  }
  // Scoring risposta aperta (produzione): coverage AI 0-100 se c'è chiave, altrimenti fallback deterministico.
  // Riproduce il pattern che era in ActiveStudy.scoreDesc (BES/DSA, JSON
  // {accuracy, feedback}; quella modalità è in pensione dal 20/8, il pattern no).
  // Ritorna {ok, acc, feedback}.
  function _scoreOpen(student, q) {
    student = String(student || '').trim();
    if (!student) return Promise.resolve({ ok: false, acc: 0, feedback: 'Nessuna risposta.' });
    var ref = (q && q.ref) || '', label = (q && q.answer) || '';
    var key = null; try { key = window.getSystemKey ? window.getSystemKey() : null; } catch (e) {}
    if (_aiScoring() && key && ref && typeof window.fetchModelAPI === 'function') { // AI solo se opt-in
      var sys = _dgEn() ? "You are an educational tutor for students with special educational needs. You assess how well a student's explanation covers the KEY CONCEPTS of a reference description. Content is what counts, not style or length. Encouraging but honest." : 'Sei un tutor didattico per studenti BES/DSA. Valuti quanto la spiegazione di uno studente copre i CONCETTI CHIAVE di una descrizione di riferimento. Conta il contenuto, non la forma o la lunghezza. Incoraggiante ma onesto.';
      var prompt = _dgEn() ? ('Concept: "' + label + '"\n\nReference description (source):\n' + ref + "\n\nStudent's explanation:\n" + student + '\n\nRate from 0 to 100 how well the explanation covers the key concepts of the reference. Reply ONLY with a JSON object: {"accuracy": <number 0-100>, "feedback": "<1-2 sentences in English: what they grasped and what is missing>"}') : ('Concetto: "' + label + '"\n\nDescrizione di riferimento (fonte):\n' + ref + '\n\nSpiegazione dello studente:\n' + student + '\n\nValuta da 0 a 100 quanto la spiegazione copre i concetti chiave del riferimento. Rispondi SOLO con un oggetto JSON: {"accuracy": <numero 0-100>, "feedback": "<1-2 frasi in italiano: cosa ha colto e cosa manca>"}');
      var payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: 0.2, maxOutputTokens: 256 } };
      if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'dungeon');
      return _withTimeout(window.fetchModelAPI(payload, key), 12000).then(function (resp) {
        _setAiMode('cloud');
        var txt = (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] && resp.candidates[0].content.parts[0].text) || '';
        var parsed = window.salvageTruncatedJSON ? window.salvageTruncatedJSON(txt) : JSON.parse(txt);
        var acc = Number(parsed && parsed.accuracy); if (!isFinite(acc)) acc = 0; acc = Math.max(0, Math.min(100, Math.round(acc)));
        return { ok: acc >= 60, acc: acc, feedback: (parsed && parsed.feedback) || '' };
      }).catch(function () { return _scoreOpenHybrid(student, ref, label); });
    }
    return _scoreOpenHybrid(student, ref, label);
  }
  // Tier locale IBRIDO per le aperte (trade-off deciso): l'ACCURACY resta deterministica (IDF, stabile
  // — un giudice 4B dà voti instabili, e per BES/DSA un voto ingiusto è peggio di un voto grezzo);
  // il locale genera SOLO la frase di feedback esplicativo. Senza locale → puro deterministico.
  function _scoreOpenHybrid(student, ref, label) {
    var det = _scoreOpenLocal(student, ref, label);
    if (!_localLlmOk() || !ref) { _setAiMode(_localLlmOk() ? (DUN && DUN.aiMode) || 'off' : 'off'); return Promise.resolve(det); }
    var sys = _dgEn() ? 'You are an educational tutor for students with special educational needs. Reply ONLY in English. Encouraging but honest.' : 'Sei un tutor didattico per studenti BES/DSA. Rispondi SOLO in italiano. Incoraggiante ma onesto.';
    var user = _dgEn() ? ('Concept: "' + label + '"\nSource:\n' + _softCut(ref, 400) + "\nStudent's answer:\n" + _softCut(student, 300) + '\n\nWrite ONE single sentence of formative feedback: what they grasped and what is missing compared to the source.') : ('Concetto: "' + label + '"\nFonte:\n' + _softCut(ref, 400) + '\nRisposta dello studente:\n' + _softCut(student, 300) + '\n\nScrivi UNA sola frase di feedback formativo: cosa ha colto e cosa manca rispetto alla fonte.');
    var schema = { type: 'object', properties: { feedback: { type: 'string' } }, required: ['feedback'] };
    return _localStructured(sys, user, schema, 120, 20000).then(function (d) {
      _setAiMode('local');
      if (d && d.feedback && String(d.feedback).trim()) det.feedback = String(d.feedback).trim();
      return det;
    }).catch(function () { _setAiMode('off'); return det; });
  }
  function _scoreOpenLocal(student, ref, label) {
    var cov = _keywordCoverage(student, ref, _corpusIDF());
    var ok = cov >= 0.25 || _fuzzy(student, label);
    return { ok: ok, acc: Math.round(cov * 100), feedback: ok ? _tSafe('dg_fb_ok', 'Hai colto i concetti chiave principali.') : _tSafe('dg_fb_more', 'Prova a includere più concetti chiave della descrizione.') };
  }
  var GBS = 'padding:10px;border-radius:8px;border:1px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;font-size:14px';
  // esegue un quiz nel modal; onFinish(correct, total, results). manaReward: +1 mana per risposta giusta.
  // activity (opzionale): se presente ('dungeon_gate'|'dungeon_boss'|'dungeon_review') OGNI quesito
  // viene registrato per-nodo su MappAIMastery → lo spaced retrieval e la heatmap vedono anche il richiamo,
  // non solo la cattura (prima ~70% dell'apprendimento era invisibile alla mastery).
  function _runQuiz(pool, count, title, manaReward, onFinish, subjects, activity) {
    var qs = _genQuestions(pool, count, subjects), idx = 0, correct = 0, results = [];
    var simplifyUsed = false;   // "domanda più semplice": 1 uso per quiz, nessuna penalità (adaptable, c10)
    var ov = _overlay(); ov.card.style.width = 'min(600px,94vw)';
    var un = _esc(function () { ov.close(); onFinish(correct, qs.length, results); });   // Esc → results parziali
    function advance() { idx++; if (idx >= qs.length) { un(); ov.close(); onFinish(correct, qs.length, results); } else render(); }
    function score(ok) { if (ok) { correct++; if (manaReward && DUN) DUN.mana = Math.min(DUN.maxMana, DUN.mana + 1); } }
    // esito per-quesito: results per il chiamante (gate guidato), mastery record, event-log
    function rec(q, ok, acc) {
      results.push({ nodeId: q.nodeId, label: q.subjLabel || q.answer, ok: ok, acc: acc, kind: q.kind });
      if (activity && q.nodeId != null && _nodeById(q.nodeId)) {   // guard: nodi fantasma esclusi
        try {
          if (window.MappAIStudyBus) window.MappAIStudyBus.record(q.nodeId, q.subjLabel || String(q.answer || ''), activity, { score: acc });
          else if (window.MappAIMastery) window.MappAIMastery.record(q.nodeId, q.subjLabel || String(q.answer || ''), activity, { score: acc });
        } catch (e) {}
      }
      _logEv('quiz_item', { nodeId: q.nodeId, acc: Math.round(acc * 100) / 100, ctx: activity || title, kind: q.kind });
      if (DUN) { DUN._sessQ = (DUN._sessQ || 0) + 1; if (ok) DUN._sessQok = (DUN._sessQok || 0) + 1; }   // per il digest di fine sessione
    }
    // feedback esplicativo (c8): esito + risposta corretta + spiegazione/feedback + estratto fonte, poi "continua"
    function reveal(ok, q, extra, fbText) {
      var body = ov.card.querySelector('#g-body');
      var bad = q.kind === 'open' ? '↻ Da rivedere' : '✗ Sbagliato'; // aperta: feedback gentile (BES/DSA, c5)
      var corr = q.kind === 'mc' ? ('Risposta corretta: ' + _esch(String(q.answer))) : (q.kind === 'tf' ? ('Risposta: ' + (q.answer ? 'Vero' : 'Falso')) : '');
      var note = fbText ? '<p style="font-size:13.5px;color:#c3d2ea;line-height:1.55;margin:0 0 12px">' + _esch(fbText) + '</p>'
        : (q.expl ? '<p style="font-size:13px;color:#9fb3d4;line-height:1.55;margin:0 0 12px"><i>' + _esch(q.expl) + '</i></p>' : '<div style="height:6px"></div>');
      // process feedback ancorato al contenuto (c8): su errore rileggi il passo della TUA fonte (costo zero AI)
      var src = (!ok && q.ref && !fbText) ? '<p style="font-size:12.5px;color:#9fb3d4;line-height:1.55;margin:0 0 12px;border-left:2px solid #2a3a55;padding-left:8px">Dal tuo diario: «' + _esch(_softCut(q.ref, 220)) + '»</p>' : '';
      body.innerHTML = '<div style="font-size:15px;font-weight:500;margin-bottom:8px;color:' + (ok ? '#3fae5a' : '#e0a23f') + '">' + (ok ? '✓ Corretto' : bad) + (extra ? ' · ' + extra : '') + '</div>'
        + ((!ok && corr) ? '<p style="font-size:14px;color:#eaf2ff;line-height:1.5;margin:0 0 8px">' + corr + '</p>' : '')
        + note + src + '<button id="g-cont" style="width:100%;' + GBS + '">continua</button>';
      body.querySelector('#g-cont').onclick = advance;
    }
    function render() {
      var q = qs[idx];
      ov.card.innerHTML = '<div style="font-size:12px;color:#8fa4c4;margin-bottom:2px">' + title + ' · ' + (idx + 1) + '/' + qs.length + '</div>'
        + '<div style="font-size:17px;font-weight:500;line-height:1.65;margin:8px 0 18px;max-height:46vh;overflow:auto">' + q.q + '</div>'
        + '<div id="g-body"></div>';
      var body = ov.card.querySelector('#g-body');
      if (q.kind === 'tf') {
        body.innerHTML = '<div style="display:flex;gap:10px"><button id="g-t" style="flex:1;padding:13px;' + GBS + '">Vero</button><button id="g-f" style="flex:1;padding:13px;' + GBS + '">Falso</button></div>';
        body.querySelector('#g-t').onclick = function () { var ok = q.answer === true; score(ok); rec(q, ok, ok ? 1 : 0); reveal(ok, q); };
        body.querySelector('#g-f').onclick = function () { var ok = q.answer === false; score(ok); rec(q, ok, ok ? 1 : 0); reveal(ok, q); };
      } else if (q.kind === 'mc') {
        body.innerHTML = q.opts.map(function (o, n) { return '<button class="g-o" data-o="' + n + '" style="display:block;width:100%;margin:7px 0;text-align:left;line-height:1.45;padding:12px 14px;' + GBS + '">' + _esch(String(o)) + '</button>'; }).join('');
        Array.prototype.forEach.call(body.querySelectorAll('.g-o'), function (b) { b.onclick = function () { var ok = q.opts[+b.dataset.o] === q.answer; score(ok); rec(q, ok, ok ? 1 : 0); reveal(ok, q); }; });
      } else {
        var canSimplify = !simplifyUsed && q.nodeId != null && q.kind === 'open';
        body.innerHTML = '<textarea id="g-in" rows="3" style="width:100%;padding:11px;border-radius:8px;border:1px solid #3aa0c9;background:#16203a;color:#eaf2ff;box-sizing:border-box;font-family:inherit;font-size:14px;line-height:1.5;resize:none" placeholder="Spiega con parole tue… (Ctrl+Invio per confermare)"></textarea><button id="g-ok" style="margin-top:8px;width:100%;' + GBS + '">Conferma</button>'
          + (canSimplify ? '<button id="g-simp" type="button" style="margin-top:6px;width:100%;padding:7px;border-radius:8px;border:1px solid #2a3a55;background:transparent;color:#8fa4c4;cursor:pointer;font-size:12.5px">💡 domanda più semplice</button>' : '');
        var inp = body.querySelector('#g-in'); setTimeout(function () { inp.focus(); }, 30);
        var simp = body.querySelector('#g-simp');
        if (simp) simp.onclick = function () {   // degrada aperta → MC dello stesso nodo (scelta dello studente, nessuna penalità)
          simplifyUsed = true;
          var alt = _aiQuestionFor({ id: q.nodeId }, 'mc');
          if (alt) { alt.nodeId = q.nodeId; alt.subjLabel = q.subjLabel; qs[idx] = alt; render(); }
          else { simp.remove(); _msg(_tSafe('dg_no_simpler', 'Nessuna versione più semplice disponibile per questa domanda.')); }
        };
        var scoring = false;
        var sub = function () {
          if (scoring) return; scoring = true;
          var btn = body.querySelector('#g-ok'); if (btn) { btn.textContent = 'Valuto…'; btn.style.opacity = '.6'; btn.style.cursor = 'default'; }
          Promise.resolve(_scoreOpen(inp.value, q)).then(function (res) { score(res.ok); rec(q, res.ok, isFinite(res.acc) ? res.acc / 100 : (res.ok ? 1 : 0)); reveal(res.ok, q, (isFinite(res.acc) ? res.acc + '%' : ''), res.feedback); });
        };
        body.querySelector('#g-ok').onclick = sub;
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sub(); });
      }
    }
    render();
  }
  // ── Spaced retrieval nel gate (gap #2) ──────────────────────────────────────
  // Quanto un nodo "va ripassato": debole (mastery nuovo/in-corso) + stale (>7gg).
  // Riuso della logica di mappai-study-path (masteryFn + staleDays=7) su MappAIMastery.
  function _needReview(id) {
    var MM = window.MappAIMastery;
    var agg = (MM && typeof MM.node === 'function') ? MM.node(id) : null;
    if (!agg || !agg.attempts) return 2; // mai studiato a fondo → priorità massima al richiamo
    var lvl = (typeof MM.masteryLevel === 'function')
      ? MM.masteryLevel({ attempts: agg.attempts, accuracy: agg.accuracy, rate: agg.rate })
      : (agg.accuracy >= 0.8 ? 'acquisito' : 'in-corso');
    var weak = (lvl === 'nuovo' || lvl === 'in-corso') ? 1 : 0;
    var lastTs = (agg.byActivity || []).reduce(function (m, r) { return Math.max(m, r.lastTs || 0); }, 0);
    var stale = (lastTs && (Date.now() - lastTs) > 7 * 86400000) ? 1 : 0;
    return weak + stale; // 0..2
  }
  function _shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // Compone i soggetti del gate: ~70% piano corrente + ~30% richiamo dai piani precedenti
  // (deboli/stale prima). Voci legacy senza fi → trattate come "precedenti" (richiamo).
  function _gateSelection(count) {
    var cur = [], prev = [], seen = {};
    DUN.diary.forEach(function (d) { if (d.ghost || seen[d.id]) return; seen[d.id] = 1; (d.fi === DUN.fi ? cur : prev).push(d); }); // 1 sola voce per NODO (no doppioni desc/cite/rel); ghost esclusi
    prev.sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); }); // più bisognoso prima
    _shuffle(cur); cur.sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); }); // B16: anche nel piano corrente i deboli prima (shuffle+sort stabile → pari bisogno in ordine casuale)
    var nRecall = 0;
    if (prev.length) nRecall = Math.min(prev.length, Math.max(1, Math.round(count * 0.3)));
    if (!cur.length) nRecall = Math.min(count, prev.length); // nessun nodo corrente → tutto richiamo
    else nRecall = Math.min(nRecall, count - 1);              // se c'è corrente, lascia ≥1 corrente
    var pick = prev.slice(0, nRecall).concat(cur.slice(0, count - nRecall));
    if (pick.length < count) pick = pick.concat(prev.slice(nRecall)); // completa se i correnti scarseggiano
    pick = _shuffle(pick.slice(0, count));
    return { subjects: pick.map(_poolEntry), recall: nRecall };
  }
  // Gate fallito → percorso GUIDATO (c8 hint laddering, B17): il fallimento diventa informativo.
  // Mostra COSA rivedere (max 3, linguaggio mastery-framed, mai "sbagliato/fallito" nel titolo),
  // con scelta libera (SDT): apri il diario su quei nodi, oppure torna subito al piano. Il warp resta.
  function _gateFailGuide(results, thenWarp) {
    var wrong = (results || []).filter(function (r) { return !r.ok && r.label; }).slice(0, 3);
    if (!wrong.length) { thenWarp(); return; }
    var ov = _overlay(), done = false;
    function go(openDiary) {
      if (done) return; done = true; un(); ov.close();
      thenWarp();   // la conseguenza (warp) resta in entrambi i casi — graceful ma reale
      if (openDiary) setTimeout(function () { if (DUN) _openDiary(wrong.map(function (r) { return r.nodeId; }).filter(function (x) { return x != null; })); }, 400);
    }
    var un = _esc(function () { go(false); });   // Esc = torna al piano (non lascia DUN.busy appeso)
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">Gate Keeper</div>' +
      '<h3 style="margin:4px 0 8px;font-size:18px;font-weight:600">Sei quasi pronto</h3>' +
      '<p style="font-size:13px;color:#c3d2ea;line-height:1.55;margin:0 0 10px">Ripassa ' + (wrong.length === 1 ? 'questa memoria' : 'queste ' + wrong.length + ' memorie') + ' e ritenta alle scale:</p>' +
      wrong.map(function (r) { return '<div style="font-size:14px;color:#e7d6a6;margin:4px 0 4px 6px">• ' + _esch(r.label) + '</div>'; }).join('') +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button id="gf-diary" type="button" style="flex:1;' + GBS + '">📖 Apri il diario su questi</button>' +
        '<button id="gf-back" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">torna al piano</button>' +
      '</div>';
    ov.card.querySelector('#gf-diary').onclick = function () { go(true); };
    ov.card.querySelector('#gf-back').onclick = function () { go(false); };
  }
  function _openGate(onPass, onFail) {
    // §17: ogni tanto il custode antepone un evento d'archivio (voce mal archiviata /
    // indice corrotto) — informativo, mai bloccante; poi il quiz vero e proprio.
    _archiveEvent(function () {
      var live = DUN.diary.filter(function (d) { return !d.ghost; });   // ghost esclusi da conteggio e distrattori
      var count = Math.min(3, Math.max(1, live.length || 1));
      var sel = _gateSelection(count);
      var pool = live.map(_poolEntry); // distrattori = tutto il diario vivo (con macro-area)
      _runQuiz(pool, count, 'Gate Keeper', true, function (correct, total, results) {
        var acc = total ? correct / total : 0, pass = acc >= _gateThr();
        _logEv('gate', { fi: DUN ? DUN.fi : -1, acc: Math.round(acc * 100) / 100, pass: pass, recall: sel.recall });
        if (pass) { _msg(_tSafe('dg_gate_pass', 'Gate superato ({p}%)').replace('{p}', Math.round(acc * 100)) + (sel.recall ? ' · ' + sel.recall + _tSafe('dg_of_recall', ' di richiamo') : '') + ' · +' + correct + ' mana.'); onPass(); }
        else { _msg(_tSafe('dg_gate_fail', 'Gate fallito ({p}% < {s}%).').replace('{p}', Math.round(acc * 100)).replace('{s}', Math.round(_gateThr() * 100))); if (onFail) onFail(results); }
      }, sel.subjects, 'dungeon_gate');
    });
  }

  // ════════════ §17 — PONTE STUDIO ATTIVO ↔ DUNGEON (6/7/2026) ════════════
  // Le 7 modalità di Studio Attivo tradotte in elementi della finzione (mai
  // minigiochi-popup: la meccanica È il compito di studio — GBL c14):
  //   ⚡ condotto  = verbi delle relazioni (modo 6) + teleport cross-link
  //   🖥 server    = sequenza di boot (modo 7, credito parziale LCS)
  //   🎭 mimic     = memoria di un altro piano (modo 5)
  //   📁 archivio  = al gate: voce mal archiviata (modo 5) / indice corrotto (modo 3)
  //   ▁ cloze      = unit corrotta da riparare alla cattura (modo 4)
  //   🧩 defrag    = reveal ATTIVO post-boss (modi 1-2)
  // Tutto reversibile: kill-switch per feature, default ON ('0' per spegnere).
  function _s17(name) { try { return localStorage.getItem('mappai_dungeon_' + name) !== '0'; } catch (e) { return true; } }
  function _AS() { return window.MappAIActiveStudyCore || null; }
  function _famList() { return (typeof EDGE_FAMILIES === 'object' && EDGE_FAMILIES) ? EDGE_FAMILIES : (window.MappAIRelations && window.MappAIRelations.EDGE_FAMILIES) || null; }
  function _recS17(nodeId, label, activity, score) {
    try {
      if (window.MappAIStudyBus) window.MappAIStudyBus.record(nodeId, label, activity, { score: score });
      else if (window.MappAIMastery) window.MappAIMastery.record(nodeId, label, activity, { score: score });
    } catch (e) {}
  }

  // ── piazzamento sul piano (chiamato da _loadFloor, solo kind 'misto') ──
  function _placeS17(f, open) {
    DUN._visited = DUN._visited || {}; DUN._visited[DUN.fi] = 1;
    // ⚡ CONDOTTO: un cross-link con verbo significativo che tocca questo piano
    try {
      if (_s17('circuits') && open.length && typeof window.getEdgeFamilyKey === 'function' && _famList()) {
        var floorIds = {}; f.nodes.forEach(function (n) { floorIds[String(n.id)] = 1; });
        var st = _getAppState(), links = (st.db && st.db.links) || [];
        DUN._conduitsDone = DUN._conduitsDone || {};
        function elig(requireCross) {
          return links.filter(function (l) {
            var s = _nodeById(_lid(l.source)), t = _nodeById(_lid(l.target));
            if (!s || !t || !l.rel) return false;
            if (window.getEdgeFamilyKey(l.rel) === 'altro') return false;
            if (DUN._conduitsDone[String(s.id) + '→' + String(t.id)]) return false;
            if (!(floorIds[String(s.id)] || floorIds[String(t.id)])) return false;
            if (!requireCross) return true;
            return !!l.isCross || (s.group != null && t.group != null && s.group !== t.group);
          });
        }
        var cands = elig(true); if (!cands.length) cands = elig(false);
        if (cands.length) {
          var L = cands[Math.floor(Math.random() * cands.length)];
          DUN.sources[open.pop()] = { type: 'condotto', link: { s: _lid(L.source), t: _lid(L.target), rel: L.rel }, extracted: false };
        }
      }
    } catch (e) { console.error('[s17 condotto]', e); }
    // 🖥 SERVER: una volta per run, sul piano dove vive la TESTA della catena
    try {
      if (_s17('boot') && open.length && !DUN._bootDone) {
        if (DUN._chain === undefined) {
          var C0 = _core(), st2 = _getAppState();
          DUN._chain = (C0 && C0.findBestChain)
            ? C0.findBestChain(C0.buildParentOf((st2.db && st2.db.nodes) || [], (st2.db && st2.db.links) || [])) : null;
        }
        if (DUN._chain && DUN._chain.length >= 3) {
          var headId = String(DUN._chain[0]);
          if (f.nodes.some(function (n) { return String(n.id) === headId; })) {
            DUN.sources[open.pop()] = { type: 'server', extracted: false };
          }
        }
      }
    } catch (e) { console.error('[s17 server]', e); }
    // 🎭 MIMIC: ~1 piano su 4 ospita una memoria di un ALTRO piano (in più, non in sostituzione)
    try {
      if (_s17('mimic') && open.length && Math.random() < 0.25) {
        var elsewhere = [];
        DUN.floors.forEach(function (ff, fi2) {
          if (fi2 === DUN.fi || ff.kind !== 'misto') return;
          (ff.nodes || []).forEach(function (nd) { if (_hasContent(nd)) elsewhere.push(nd); });
        });
        if (elsewhere.length) {
          var nd2 = elsewhere[Math.floor(Math.random() * elsewhere.length)];
          DUN.sources[open.pop()] = { node: nd2, type: 'libro', mimic: true, extracted: !!_mastered(nd2.id) };
        }
      }
    } catch (e) { console.error('[s17 mimic]', e); }
  }

  // ── ⚡ condotto: famiglia del verbo → circuito chiuso → teleport (modo 6) ──
  // 2 tentativi, conta il PRIMO (PT); dopo la risposta il condotto resta un
  // fast-travel permanente verso i piani già visitati (i cross-link diventano
  // passaggi segreti tra le aree).
  function _conduitChallenge(src) {
    var s = _nodeById(src.link.s), t = _nodeById(src.link.t), fams = _famList();
    if (!s || !t || !fams) { src.extracted = true; src.open = true; return; }
    var origFam = window.getEdgeFamilyKey(src.link.rel);
    var a = _clean(s.label), b = _clean(t.label);
    var ov = _overlay(); ov.card.style.width = 'min(480px,94vw)';
    var un = _esc(function () { ov.close(); });
    var firstChoice = null;
    var rows = Object.keys(fams).map(function (key) {
      var fam = fams[key];
      return '<button type="button" class="cd-f" data-k="' + key + '" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:5px 0;' + GBS + '"><span style="width:12px;height:12px;border-radius:50%;background:' + fam.color + ';flex:0 0 auto"></span>' + _esch((window.MappAIRelations && window.MappAIRelations.getFamilyLabel) ? window.MappAIRelations.getFamilyLabel(key, ((typeof window !== 'undefined' && (window.currentLanguage === 'en' || window.currentLanguage === 'en-US')) ? 'en' : 'it')) : fam.label) + '</button>';
    }).join('');
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">⚡ Condotto spento</div>' +
      '<h3 style="margin:4px 0 8px;font-size:17px;font-weight:600">Chiudi il circuito</h3>' +
      '<p style="font-size:13.5px;color:#c3d2ea;margin:0 0 4px"><b>' + _esch(a) + '</b> &nbsp;⟶&nbsp; <b>' + _esch(b) + '</b></p>' +
      '<p style="font-size:12.5px;color:#9fb3d4;margin:0 0 10px">Che tipo di connettore serve? (2 tentativi, conta il primo)</p>' +
      '<div id="cd-fb" style="min-height:16px;font-size:12.5px;color:#e0a23f;margin-bottom:4px"></div>' + rows +
      '<button id="cd-x" type="button" style="margin-top:8px;width:100%;' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">più tardi</button>';
    ov.card.querySelector('#cd-x').onclick = function () { un(); ov.close(); };
    function finish(chosen) {
      var correct = (firstChoice === origFam);
      _recS17(src.link.t, b, 'dungeon_verbs', correct ? 1 : 0);
      _logEv('conduit', { s: src.link.s, t: src.link.t, ok: correct });
      DUN._conduitsDone = DUN._conduitsDone || {};
      DUN._conduitsDone[String(src.link.s) + '→' + String(src.link.t)] = 1;
      src.extracted = true; src.open = true;
      if (correct && DUN) { DUN.mana = Math.min(DUN.maxMana, DUN.mana + 2); }
      var famLabel = (fams[origFam] || {}).label || origFam;
      _msg(correct ? '⚡ Circuito chiuso al primo colpo: «' + src.link.rel + '» (+2 mana).'
        : (chosen === origFam ? '⚡ Chiuso al secondo tentativo — era «' + src.link.rel + '» (' + famLabel + ').'
          : '⚡ Il connettore giusto era «' + src.link.rel + '» (' + famLabel + '). Il circuito si chiude comunque.'));
      un(); ov.close();
      _conduitTravel(src);
    }
    Array.prototype.forEach.call(ov.card.querySelectorAll('.cd-f'), function (btn) {
      btn.onclick = function () {
        var chosen = btn.getAttribute('data-k');
        if (firstChoice === null) {
          firstChoice = chosen;
          if (chosen === origFam) return finish(chosen);
          btn.disabled = true; btn.style.opacity = '.35'; btn.style.cursor = 'default';
          ov.card.querySelector('#cd-fb').textContent = _tSafe('dg_wrong_connector', 'Non è questo connettore — un altro tentativo.');
          return;
        }
        finish(chosen);
      };
    });
  }
  function _conduitTravel(src) {
    var t = _nodeById(src.link.t) || _nodeById(src.link.s);
    var visited = Object.keys(DUN._visited || {}).map(Number).filter(function (fi) { return fi !== DUN.fi && DUN.floors[fi] && DUN.floors[fi].kind === 'misto'; });
    var ov = _overlay(); var un = _esc(function () { ov.close(); });
    // "visione" dell'altro capo: anteprima del concetto collegato (foreshadowing se non ancora visitato)
    var peek = t ? ('<div style="background:#16203a;border:1px solid #2a3a55;border-radius:8px;padding:8px 10px;margin:0 0 10px"><div style="font-size:12px;color:#8fa4c4">Il condotto mostra una visione:</div><b style="font-size:14px">' + _esch(_clean(t.label)) + '</b><div style="font-size:12.5px;color:#c3d2ea;line-height:1.5">' + _esch(_softCut(_desc(t), 160)) + '</div></div>') : '';
    var rows = visited.map(function (fi) {
      return '<button type="button" class="cd-tp" data-fi="' + fi + '" style="display:block;width:100%;text-align:left;margin:4px 0;' + GBS + '">🌀 Piano ' + (fi + 1) + ' · livello ' + DUN.floors[fi].level + '</button>';
    }).join('');
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">⚡ Condotto attivo</div>' +
      '<h3 style="margin:4px 0 8px;font-size:17px;font-weight:600">Passaggio segreto</h3>' + peek +
      (rows ? '<div style="font-size:12.5px;color:#9fb3d4;margin-bottom:6px">Teletrasporto rapido (piani visitati):</div>' + rows
            : '<div style="font-size:12.5px;color:#9fb3d4">Nessun altro piano visitato: torna qui quando vorrai muoverti in fretta.</div>') +
      '<button id="cd-tx" type="button" style="margin-top:10px;width:100%;' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">resta qui</button>';
    ov.card.querySelector('#cd-tx').onclick = function () { un(); ov.close(); };
    Array.prototype.forEach.call(ov.card.querySelectorAll('.cd-tp'), function (btn) {
      btn.onclick = function () {
        var fi = +btn.getAttribute('data-fi');
        un(); ov.close();
        _logEv('conduit_tp', { to: fi });
        _loadFloor(fi); _msg(_tSafe('dg_conduit', '🌀 Il condotto ti deposita al piano {n}.').replace('{n}', (fi + 1)));
      };
    });
  }

  // ── 🖥 server: sequenza di boot (modo 7) — LCS, soft reset con indizio ──
  // Il punteggio (per-adiacenza) si registra SOLO al primo submit; i tentativi
  // successivi sono pratica di correzione. Successo → corrente ripristinata:
  // la nebbia del piano si dissolve (ricompensa endogena, non un badge).
  function _bootChallenge(src) {
    var chain = DUN._chain || [];
    if (chain.length < 3) { src.extracted = true; return; }
    var labels = chain.map(function (id) { return _nodeLabel(id) || String(id); });
    var pool = _shuffle(chain.map(function (id, i) { return { id: id, label: labels[i] }; }).slice());
    var order = [];
    var ov = _overlay(); ov.card.style.width = 'min(560px,94vw)';
    var un = _esc(function () { ov.close(); });
    function render(hint) {
      var chosen = order.map(function (o, i) {
        return '<button type="button" class="bt-c" data-i="' + i + '" title="togli dalla sequenza" style="display:inline-block;margin:3px;' + GBS + ';border-color:#3fae5a">' + (i + 1) + '. ' + _esch(o.label) + '</button>';
      }).join('');
      var inOrder = {}; order.forEach(function (o) { inOrder[String(o.id)] = 1; });
      var avail = pool.filter(function (o) { return !inOrder[String(o.id)]; }).map(function (o) {
        return '<button type="button" class="bt-a" data-id="' + _esch(String(o.id)) + '" style="display:inline-block;margin:3px;' + GBS + '">🖥 ' + _esch(o.label) + '</button>';
      }).join('');
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">🖥 Server di piano in crash</div>' +
        '<h3 style="margin:4px 0 8px;font-size:17px;font-weight:600">Sequenza di boot</h3>' +
        '<p style="font-size:12.5px;color:#9fb3d4;margin:0 0 8px">Riavvia le macchine nell\'ordine del processo. Corrente ripristinata = niente più nebbia su questo piano.</p>' +
        (hint ? '<div style="background:#2a2214;border:1px solid #e0a23f;border-radius:8px;padding:6px 10px;font-size:12.5px;color:#e7d6a6;margin-bottom:8px">💡 ' + hint + '</div>' : '') +
        '<div style="font-size:12px;color:#8fa4c4;margin-bottom:2px">Sequenza scelta (clicca per togliere):</div>' +
        '<div style="min-height:34px;border:1px dashed #2a3a55;border-radius:8px;padding:4px;margin-bottom:8px">' + (chosen || '<span style="color:#5a6577;font-size:12px;padding:6px;display:inline-block">—</span>') + '</div>' +
        '<div style="font-size:12px;color:#8fa4c4;margin-bottom:2px">Macchine spente:</div>' +
        '<div style="margin-bottom:10px">' + (avail || '<span style="color:#5a6577;font-size:12px">tutte accese</span>') + '</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button id="bt-go" type="button" style="flex:1;' + GBS + (order.length === chain.length ? '' : ';opacity:.45;cursor:default') + '">▶ Avvia il boot</button>' +
        '<button id="bt-x" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">più tardi</button></div>';
      Array.prototype.forEach.call(ov.card.querySelectorAll('.bt-a'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-id'); var o = pool.filter(function (x) { return String(x.id) === id; })[0]; if (o) order.push(o); render(); };
      });
      Array.prototype.forEach.call(ov.card.querySelectorAll('.bt-c'), function (b) {
        b.onclick = function () { order.splice(+b.getAttribute('data-i'), 1); render(); };
      });
      ov.card.querySelector('#bt-x').onclick = function () { un(); ov.close(); };
      ov.card.querySelector('#bt-go').onclick = function () {
        if (order.length !== chain.length) { _msg(_tSafe('dg_boot_all', 'Accendi tutte le macchine prima di avviare.')); return; }
        submit();
      };
    }
    function submit() {
      var studentIds = order.map(function (o) { return o.id; });
      var AS = _AS();
      var seq = AS ? AS.sequenceScore(studentIds, chain) : null;
      var acc = seq ? seq.accuracy : (studentIds.join('|') === chain.join('|') ? 100 : 0);
      if (!src.attempted) {   // PT: conta il primo tentativo
        src.attempted = true;
        var posOf = {}; studentIds.forEach(function (id, i) { posOf[String(id)] = i; });
        for (var i = 1; i < chain.length; i++) {
          var ok = posOf[String(chain[i])] === posOf[String(chain[i - 1])] + 1;
          _recS17(chain[i], labels[i], 'dungeon_seq', ok ? 1 : 0);
        }
        _logEv('boot', { acc: acc, n: chain.length });
      }
      if (acc === 100) {
        src.extracted = true; DUN._bootDone = true;
        if (DUN) DUN.mana = Math.min(DUN.maxMana, DUN.mana + 2);
        for (var k in DUN.map) DUN.explored[k] = true;   // corrente ripristinata: luci accese
        un(); ov.close();
        _snd('powerup'); _msg(_tSafe('dg_boot_done', '🖥 Boot completato! La corrente torna: il piano si illumina (+2 mana).'));
        return;
      }
      // soft reset con indizio sulla prima coppia invertita
      var hint = null;
      for (var j = 1; j < chain.length; j++) {
        if (String(studentIds[j]) !== String(chain[j])) { hint = _tSafe('dg_seq_hint', '«{a}» viene subito prima di «{b}».').replace('{a}', _esch(labels[j - 1])).replace('{b}', _esch(labels[j])); break; }
      }
      order = [];
      render(hint || _tSafe('dg_seq_retry', 'Riprova: osserva da dove parte il processo.'));
    }
    render();
  }

  // ── 🎭 mimic: la memoria viene da un altro capitolo (modo 5) ──
  function _mimicChallenge(src, cont) {
    var node = src.node;
    var correct = _macroOf(node.id);
    var st = _getAppState(), nodes = (st.db && st.db.nodes) || [];
    var macros = {}; nodes.forEach(function (n) { if (n.level === 1) macros[_clean(n.label)] = 1; });
    var opts = Object.keys(macros);
    if (opts.length < 2 || opts.indexOf(correct) < 0) return cont();   // niente macro-aree: salta la domanda
    var distract = _shuffle(opts.filter(function (m) { return m !== correct; })).slice(0, 3);
    var choices = _shuffle([correct].concat(distract));
    var ov = _overlay(); var un = _esc(function () { ov.close(); cont(); });
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">🎭 Mimic!</div>' +
      '<h3 style="margin:4px 0 8px;font-size:17px;font-weight:600">Questa memoria non è di questo piano</h3>' +
      '<p style="font-size:13.5px;color:#c3d2ea;margin:0 0 10px">«<b>' + _esch(_clean(node.label)) + '</b>» — a quale capitolo appartiene davvero?</p>' +
      choices.map(function (m) { return '<button type="button" class="mm-o" data-m="' + _esch(m) + '" style="display:block;width:100%;text-align:left;margin:5px 0;' + GBS + '">📁 ' + _esch(m) + '</button>'; }).join('');
    Array.prototype.forEach.call(ov.card.querySelectorAll('.mm-o'), function (b) {
      b.onclick = function () {
        var ok = b.getAttribute('data-m') === correct;
        _recS17(node.id, _clean(node.label), 'dungeon_intruso', ok ? 1 : 0);
        _logEv('mimic', { nodeId: node.id, ok: ok });
        if (ok && DUN) DUN.mana = Math.min(DUN.maxMana, DUN.mana + 1);
        _msg(ok ? '🎭 Esatto: viene da «' + correct + '» (+1 mana).' : '🎭 Veniva da «' + correct + '».');
        un(); ov.close(); cont();
      };
    });
  }

  // ── 📁 eventi d'archivio al gate (mai bloccanti: informano, registrano, si prosegue) ──
  function _archiveEvent(cont) {
    try {
      if (!_s17('archive') || !DUN) return cont();
      DUN._archN = (DUN._archN || 0) + 1;
      if (DUN._archN % 2 === 0) return cont();   // un evento ogni 2 gate
      var order = (DUN._archN % 4 === 1) ? [_misfileChallenge, _indexChallenge] : [_indexChallenge, _misfileChallenge];
      if (order[0](cont)) return;
      if (order[1](cont)) return;
      cont();
    } catch (e) { console.error('[s17 archive]', e); cont(); }
  }
  // Voce mal archiviata (modo 5): trova l'intruso nel capitolo. Ritorna false se non applicabile.
  function _misfileChallenge(cont) {
    var C0 = _core(), AS = _AS();
    if (!C0 || !C0.pickMisfiled) return false;
    var entries = (DUN.diary || []).filter(function (d) { return !d.ghost; })
      .map(function (d) { return { id: d.id, label: d.label, desc: d.desc, macro: _macroOf(d.id) }; });
    var pick = C0.pickMisfiled(entries, AS ? AS.jaccardWords : null);
    if (!pick) return false;
    var list = _shuffle(pick.hostEntries.slice(0, 3).concat([pick.intruder]));
    var ov = _overlay(); var done = false;
    var un = _esc(function () { if (!done) { done = true; ov.close(); cont(); } });
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">📁 Archivio corrotto</div>' +
      '<h3 style="margin:4px 0 8px;font-size:17px;font-weight:600">Una voce è nel capitolo sbagliato</h3>' +
      '<p style="font-size:13px;color:#c3d2ea;margin:0 0 10px">Capitolo «<b>' + _esch(pick.host) + '</b>» — quale di queste memorie NON c\'entra?</p>' +
      list.map(function (e) { return '<button type="button" class="mf-o" data-id="' + _esch(String(e.id)) + '" style="display:block;width:100%;text-align:left;margin:5px 0;line-height:1.4;' + GBS + '">' + _esch(e.label) + '</button>'; }).join('');
    var first = true;
    Array.prototype.forEach.call(ov.card.querySelectorAll('.mf-o'), function (b) {
      b.onclick = function () {
        if (done) return;
        var ok = b.getAttribute('data-id') === String(pick.intruder.id);
        if (first) {   // PT: conta il primo click
          first = false;
          _recS17(pick.intruder.id, pick.intruder.label, 'dungeon_intruso', ok ? 1 : 0);
          _logEv('misfile', { nodeId: pick.intruder.id, ok: ok });
        }
        if (!ok) { b.style.opacity = '.35'; b.disabled = true; _msg(_tSafe('dg_archive_wrong', 'Questa è al suo posto — riprova.')); return; }
        done = true;
        _msg(_tSafe('dg_found_misfiled', '📁 Trovata: «{l}» va nel capitolo «{m}».').replace('{l}', pick.intruder.label).replace('{m}', pick.intruder.macro));
        un(); ov.close(); cont();
      };
    });
    return true;
  }
  // Indice corrotto (modo 3): riassegna i titoli alle TUE sintesi. Ritorna false se non applicabile.
  function _indexChallenge(cont) {
    var notes = _notes(), AS = _AS();
    var cands = (DUN.diary || []).filter(function (d) {
      if (d.ghost) return false;
      var nt = notes[d.eid || d.id];
      return nt && _wordCount(nt) >= 8;
    });
    if (cands.length < 3) return false;
    cands.sort(function (a, b) { return _needReview(b.id) - _needReview(a.id); });
    var items = cands.slice(0, 3);
    var allLabels = (DUN.diary || []).filter(function (d) { return !d.ghost; }).map(function (d) { return d.label; });
    var idx = 0, okCount = 0;
    var ov = _overlay(); var done = false;
    var un = _esc(function () { if (!done) { done = true; ov.close(); cont(); } });
    function finish() {
      if (done) return; done = true;
      _msg(_tSafe('dg_index_done', '🗂 Indice ricostruito: {c}/{t}.').replace('{c}', okCount).replace('{t}', items.length));
      un(); ov.close(); cont();
    }
    function render() {
      if (idx >= items.length) return finish();
      var it = items[idx];
      var nt = notes[it.eid || it.id];
      var distract = _shuffle(allLabels.filter(function (l) { return l !== it.label; })).slice(0, 3);
      var choices = _shuffle([it.label].concat(distract));
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">🗂 Indice corrotto · ' + (idx + 1) + '/' + items.length + '</div>' +
        '<h3 style="margin:4px 0 8px;font-size:16px;font-weight:600">Di che concetto parla questa TUA sintesi?</h3>' +
        '<div style="background:#16203a;border:1px solid #2a3a55;border-radius:8px;padding:10px;font-size:13.5px;color:#c3d2ea;line-height:1.55;margin-bottom:10px">«' + _esch(_softCut(nt, 220)) + '»</div>' +
        choices.map(function (l) { return '<button type="button" class="ix-o" data-l="' + _esch(l) + '" style="display:block;width:100%;text-align:left;margin:5px 0;' + GBS + '">' + _esch(l) + '</button>'; }).join('') +
        '<button id="ix-w" type="button" style="margin-top:6px;width:100%;padding:7px;border-radius:8px;border:1px solid #2a3a55;background:transparent;color:#8fa4c4;cursor:pointer;font-size:12.5px">✍ preferisco scriverlo</button>';
      function answer(ok) {
        okCount += ok ? 1 : 0;
        _recS17(it.id, it.label, 'dungeon_index', ok ? 1 : 0);
        _logEv('index_item', { nodeId: it.id, ok: ok });
        _msg(ok ? '✓ «' + it.label + '»' : '✗ Era «' + it.label + '».');
        idx++; render();
      }
      Array.prototype.forEach.call(ov.card.querySelectorAll('.ix-o'), function (b) {
        b.onclick = function () { answer(b.getAttribute('data-l') === it.label); };
      });
      ov.card.querySelector('#ix-w').onclick = function () {   // richiamo digitato (fuzzy) al posto delle opzioni
        ov.card.querySelectorAll('.ix-o, #ix-w').forEach(function (el) { el.remove(); });
        var wrap = document.createElement('div');
        wrap.innerHTML = '<input id="ix-in" type="text" autocomplete="off" placeholder="Scrivi il titolo a memoria…" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #3aa0c9;background:#16203a;color:#eaf2ff;font-size:14px">' +
          '<button id="ix-ok" type="button" style="margin-top:8px;width:100%;' + GBS + '">Conferma</button>';
        ov.card.appendChild(wrap);
        var inp = wrap.querySelector('#ix-in'); setTimeout(function () { inp.focus(); }, 30);
        var sub = function () {
          var typed = (inp.value || '').trim(); if (!typed) return;
          answer(AS ? AS.labelMatches(typed, it.label) : typed.toLowerCase() === String(it.label).toLowerCase());
        };
        wrap.querySelector('#ix-ok').onclick = sub;
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sub(); });
      };
    }
    render();
    return true;
  }

  // ── ▁ unit corrotta: riparazione cloze alla cattura (modo 4) ──
  // Nodi già incontrati (attempts ≥2, non 'nuovo'): retrieval practice al posto
  // della sintesi libera. Riparata bene → vale di più nella heatmap (+10 synth).
  function _clozeRepair(node, refText, cz, headLabel, ov, done) {
    var AS = _AS();
    var hints = cz.gaps.map(function () { return 0; });
    function render() {
      var rows = cz.gaps.map(function (g, i) {
        var h = hints[i] === 1 ? ('inizia per «' + _esch(g[0].toUpperCase()) + '», ' + g.length + ' lettere')
          : (hints[i] >= 2 ? ('«' + _esch(g.slice(0, Math.ceil(g.length / 2))) + '…»') : '');
        return '<div style="display:flex;gap:6px;align-items:center;margin:5px 0">' +
          '<span style="color:#8fa4c4;font-size:12px;width:52px">gap ' + (i + 1) + '</span>' +
          '<input class="cz-in" data-i="' + i + '" type="text" autocomplete="off" style="flex:1;padding:8px;border-radius:8px;border:1px solid #3aa0c9;background:#16203a;color:#eaf2ff;font-size:13.5px">' +
          '<button type="button" class="cz-h" data-i="' + i + '" title="indizio" style="' + GBS + ';padding:6px 10px">💡</button>' +
          '<span class="cz-hint" data-i="' + i + '" style="font-size:11.5px;color:#e7d6a6;min-width:90px">' + h + '</span></div>';
      }).join('');
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">▁ Unit corrotta · riparala a memoria</div>' +
        '<h3 style="margin:4px 0 10px;font-size:17px;font-weight:500">' + _esch(headLabel) + '</h3>' +
        '<p style="font-size:13.5px;line-height:1.65;color:#c3d2ea;background:#16203a;border:1px solid #2a3a55;border-radius:8px;padding:10px;margin:0 0 10px;white-space:pre-wrap">' + _esch(cz.masked) + '</p>' +
        '<div style="font-size:12px;color:#9fb3d4;margin-bottom:4px">Ripara i ' + cz.gaps.length + ' frammenti mancanti (refusi tollerati):</div>' + rows +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button id="cz-go" type="button" style="flex:1;' + GBS + '">🔧 Ripara</button>' +
        '<button id="cz-skip" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">salta</button></div>';
      Array.prototype.forEach.call(ov.card.querySelectorAll('.cz-h'), function (b) {
        b.onclick = function () {
          var i = +b.getAttribute('data-i');
          hints[i] = Math.min(2, hints[i] + 1);
          var vals = Array.prototype.map.call(ov.card.querySelectorAll('.cz-in'), function (inp) { return inp.value; });
          render();
          Array.prototype.forEach.call(ov.card.querySelectorAll('.cz-in'), function (inp, j) { inp.value = vals[j] || ''; });
        };
      });
      ov.card.querySelector('#cz-skip').onclick = function () { done(0.6, ''); _msg(_tSafe('dg_repair_skip', 'Riparazione saltata — la memory unit resta nel diario.')); };
      ov.card.querySelector('#cz-go').onclick = function () {
        var okN = 0;
        var answers = Array.prototype.map.call(ov.card.querySelectorAll('.cz-in'), function (inp) { return (inp.value || '').trim(); });
        answers.forEach(function (a, i) {
          var hit = AS ? (AS.similarity(a, cz.gaps[i]) >= 0.8) : (a.toLowerCase() === cz.gaps[i].toLowerCase());
          if (hit) okN++;
        });
        var score = okN / cz.gaps.length;
        var hintsUsed = hints.reduce(function (s, h) { return s + h; }, 0);
        // riparata → vale di più nella heatmap (+10, cap 100)
        _setSynthScore(node.id, Math.min(100, Math.round(score * 100) + (score >= 1 ? 10 : 0)));
        _logEv('cloze', { nodeId: node.id, acc: Math.round(score * 100) / 100, hints: hintsUsed });
        var missing = cz.gaps.filter(function (g, i) {
          return !(AS ? (AS.similarity(answers[i], g) >= 0.8) : (answers[i].toLowerCase() === g.toLowerCase()));
        });
        _msg(missing.length ? '🔧 Riparati ' + okN + '/' + cz.gaps.length + ' — mancava: ' + missing.join(', ') + '.'
          : '🔧 Unit riparata alla perfezione! (+bonus heatmap)');
        done(score, '');
      };
    }
    render();
  }

  // ── 🧩 defrag della memoria: reveal ATTIVO post-boss (modi 1-2) ──
  // Il finale non MOSTRA la mappa: la ricostruisci con le unit catturate, e la
  // heatmap si accende cella per cella man mano che piazzi. Skippabile (agency).
  function _showEndSequence(correct, total) {
    if (!_s17('defrag')) return _endSummary(correct, total);
    try { _defragChallenge(correct, total); } catch (e) { console.error('[s17 defrag]', e); _endSummary(correct, total); }
  }
  function _defragChallenge(correct, total) {
    var notes = _notes();
    var entries = (DUN.diary || []).filter(function (d) { return !d.ghost; }).map(function (d) {
      var agg = _mnode(d.id);
      return { id: d.id, eid: d.eid || String(d.id), label: d.label, desc: d.desc, macro: _macroOf(d.id), attempts: (agg && agg.attempts) || 0, need: _needReview(d.id) };
    }).filter(function (e) { return e.macro; });
    var macroSet = {}; entries.forEach(function (e) { macroSet[e.macro] = 1; });
    var macroList = Object.keys(macroSet);
    if (macroList.length < 2 || entries.length < 3) return _endSummary(correct, total);
    var C0 = _core();
    var sel = C0 ? C0.stratifiedPick(entries, Math.min(12, entries.length)) : _shuffle(entries.slice()).slice(0, 12);
    var idx = 0, okCount = 0, cells = '';
    var ov = _overlay(); ov.card.style.width = 'min(640px,95vw)';
    var done = false;
    var un = _esc(function () { if (!done) { done = true; ov.close(); _endSummary(correct, total); } });
    function finish() {
      if (done) return; done = true;
      _logEv('defrag', { ok: okCount, n: sel.length });
      un(); ov.close();
      _msg(_tSafe('dg_defrag_done', '🧩 Defrag: {c}/{t} memorie al loro posto.').replace('{c}', okCount).replace('{t}', sel.length));
      _endSummary(correct, total);
    }
    function render() {
      if (idx >= sel.length) return finish();
      var it = sel[idx];
      var snippet = notes[it.eid] || it.desc || '';
      var opts = macroList.length <= 5 ? macroList.slice()
        : _shuffle([it.macro].concat(_shuffle(macroList.filter(function (m) { return m !== it.macro; })).slice(0, 4)));
      ov.card.innerHTML =
        '<div style="font-size:12px;color:#8fa4c4">🧩 Defrag della memoria · ' + (idx + 1) + '/' + sel.length + '</div>' +
        '<h3 style="margin:4px 0 6px;font-size:17px;font-weight:600">Rimetti ogni memoria al suo posto</h3>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">' + (cells || '<span style="color:#5a6577;font-size:12px">la mappa si accende man mano…</span>') + '</div>' +
        '<div style="background:#16203a;border:1px solid #2a3a55;border-radius:8px;padding:10px;margin-bottom:10px"><b style="font-size:14.5px">' + _esch(it.label) + '</b>' +
        (snippet ? '<div style="font-size:12.5px;color:#c3d2ea;line-height:1.5;margin-top:4px">' + _esch(_softCut(snippet, 150)) + '</div>' : '') + '</div>' +
        '<div style="font-size:12.5px;color:#9fb3d4;margin-bottom:4px">In quale area della mappa vive?</div>' +
        opts.map(function (m) { return '<button type="button" class="df-o" data-m="' + _esch(m) + '" style="display:block;width:100%;text-align:left;margin:4px 0;' + GBS + '">🗺 ' + _esch(m) + '</button>'; }).join('') +
        '<button id="df-skip" type="button" style="margin-top:8px;width:100%;padding:7px;border-radius:8px;border:1px solid #2a3a55;background:transparent;color:#8fa4c4;cursor:pointer;font-size:12.5px">salta il defrag → mostra subito la mappa</button>';
      ov.card.querySelector('#df-skip').onclick = finish;
      Array.prototype.forEach.call(ov.card.querySelectorAll('.df-o'), function (b) {
        b.onclick = function () {
          var ok = b.getAttribute('data-m') === it.macro;
          okCount += ok ? 1 : 0;
          _recS17(it.id, it.label, 'dungeon_defrag', ok ? 1 : 0);
          var lv = _level(it.id); var col = (_BOSS_LV[lv] || _BOSS_LV.nuovo)[1];
          cells += '<div title="' + _esch(it.label) + (ok ? '' : ' — era: ' + _esch(it.macro)) + '" style="width:22px;height:22px;border-radius:4px;background:' + col + ';' + (ok ? '' : 'border:2px dashed #e0a23f;box-sizing:border-box;opacity:.75') + '"></div>';
          if (!ok) _msg(_tSafe('dg_lives_in', '«{l}» vive in «{m}».').replace('{l}', it.label).replace('{m}', it.macro));
          idx++; render();
        };
      });
    }
    render();
  }

  // ════════════════════════ BOSS + HEATMAP + REVEAL (gap #3) ═════════════════
  // Climax: il Guardiano interroga su TUTTO il diario (richiamo cross-piano).
  // Vinto → heatmap di padronanza → "Rivela la mappa" chiude l'overlay e scopre il grafo.
  function _bossThr() { return Math.max(0.66, _gateThr()); }   // soglia boss più alta del gate
  function _startBoss() {
    if (DUN.busy) return;
    var pool = DUN.diary.filter(function (d) { return !d.ghost; }).map(_poolEntry);
    if (!pool.length) { _msg(_tSafe('dg_boss_need', 'Cattura almeno una memory unit prima di affrontare il Guardiano.')); return; }
    var ov = _overlay(); var un = _esc(ov.close);
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">Ultimo piano · sfida finale</div>' +
      '<h3 style="margin:4px 0 8px;font-size:19px;font-weight:600">⚔ Il Guardiano della Memoria</h3>' +
      '<p style="font-size:13px;color:#c3d2ea;line-height:1.55;margin:0 0 14px">Dimostra cosa hai imparato richiamando le memory unit catturate in tutto il dungeon. Supera il ' + Math.round(_bossThr() * 100) + '% per rivelare la mappa di conoscenza.</p>' +
      '<div style="display:flex;gap:8px"><button id="bz-go" type="button" style="flex:1;' + GBS + ';border-color:#d24b8f;background:#2a1430">Affronta il Guardiano</button><button id="bz-x" type="button" style="' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4">più tardi</button></div>';
    ov.card.querySelector('#bz-go').onclick = function () { un(); ov.close(); _bossQuiz(pool); };
    ov.card.querySelector('#bz-x').onclick = function () { un(); ov.close(); };
  }
  // Selezione boss STRATIFICATA per macro-area (B18): round-robin fra i gruppi, dentro il gruppo
  // prima i mai testati poi i più bisognosi → ogni area del grafo rappresentata, niente blind spot.
  function _bossSelection(count) {
    var seen = {}, entries = [];
    DUN.diary.forEach(function (d) {
      if (d.ghost || seen[d.id]) return; seen[d.id] = 1;
      var att = 0; try { var agg = window.MappAIMastery && window.MappAIMastery.node(d.id); att = (agg && agg.attempts) || 0; } catch (e) {}
      entries.push({ id: d.id, label: d.label, desc: d.desc, kind: d.kind || 'desc', macro: _macroOf(d.id), attempts: att, need: _needReview(d.id) });
    });
    var C = _core();
    var pick = C ? C.stratifiedPick(entries, count) : _shuffle(entries).slice(0, count);
    return pick.map(_poolEntry);
  }
  function _bossQuiz(pool) {
    var count = Math.min(8, Math.max(3, pool.length));
    var subjects = _bossSelection(count);
    _runQuiz(pool, count, '⚔ Guardiano della Memoria', true, function (correct, total, results) {
      var acc = total ? correct / total : 0, pass = acc >= _bossThr();
      _logEv('boss', { acc: Math.round(acc * 100) / 100, pass: pass, n: total });
      if (pass) { if (DUN.boss) DUN.boss.defeated = true; _snd('powerup'); _msg(_tSafe('dg_boss_win', 'Guardiano sconfitto ({p}%)! La mappa si rivela…').replace('{p}', Math.round(acc * 100))); _showEndSequence(correct, total); }
      else _msg(_tSafe('dg_boss_resist', 'Il Guardiano resiste ({p}% < {s}%). Ripassa il diario (B) e riprova.').replace('{p}', Math.round(acc * 100)).replace('{s}', Math.round(_bossThr() * 100)));
    }, subjects, 'dungeon_boss');
  }
  // chiavi = livelli reali di MappAIMastery.masteryLevel: nuovo · in-corso · acquisito · fluente
  var _BOSS_LV = { nuovo: ['Da studiare', '#5a6577'], 'in-corso': ['In corso', '#3a7bd5'], acquisito: ['Acquisito', '#3fae5a'], fluente: ['Fluente', '#e2b13c'] };
  function _endSummary(correct, total) {
    var ov = _overlay(); var un = _esc(ov.close); ov.card.style.width = 'min(680px,95vw)';
    var counts = { nuovo: 0, 'in-corso': 0, acquisito: 0, fluente: 0 };
    var cells = DUN.diary.map(function (d) {
      var lv = _level(d.id); if (counts[lv] == null) lv = 'nuovo'; counts[lv]++;
      return '<div title="' + _esch(d.label) + ' — ' + lv + '" style="width:22px;height:22px;border-radius:4px;background:' + (_BOSS_LV[lv] || _BOSS_LV.nuovo)[1] + '"></div>';
    }).join('');
    // B19 — niente blind spot: i nodi dei piani visitati MAI catturati compaiono in grigio
    // "Ancora da esplorare" (framing non punitivo), distinti da 'Da studiare' (catturati ma deboli).
    var inDiary = {}; DUN.diary.forEach(function (d) { inDiary[String(d.id)] = 1; });
    var missSeen = {}, nMissing = 0, missCells = '';
    DUN.floors.forEach(function (f) {
      if (f.kind !== 'misto' && f.kind !== 'scuola') return;
      (f.nodes || []).forEach(function (nd) {
        var k = String(nd.id);
        if (inDiary[k] || missSeen[k] || !_hasContent(nd)) return;
        missSeen[k] = 1; nMissing++;
        missCells += '<div title="' + _esch(_clean(nd.label)) + ' — ancora da esplorare" style="width:22px;height:22px;border-radius:4px;background:#39404d;border:1px dashed #5a6577;box-sizing:border-box"></div>';
      });
    });
    cells += missCells;
    var legend = Object.keys(_BOSS_LV).map(function (k) { return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:#b8c8e0"><span style="width:11px;height:11px;border-radius:2px;background:' + _BOSS_LV[k][1] + '"></span>' + _BOSS_LV[k][0] + ' ' + counts[k] + '</span>'; }).join('')
      + (nMissing ? '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:#b8c8e0"><span style="width:11px;height:11px;border-radius:2px;background:#39404d;border:1px dashed #5a6577;box-sizing:border-box"></span>Ancora da esplorare ' + nMissing + '</span>' : '');
    ov.card.innerHTML =
      '<div style="font-size:12px;color:#8fa4c4">Percorso completato</div>' +
      '<h3 style="margin:4px 0 6px;font-size:20px;font-weight:600">🗺 La mappa si rivela</h3>' +
      '<p style="font-size:13px;color:#c3d2ea;line-height:1.5;margin:0 0 12px">Hai catturato <b>' + DUN.diary.length + '</b> memory unit e superato il Guardiano (' + correct + '/' + total + '). La tua padronanza:</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">' + (cells || '<span style="color:#8fa4c4;font-size:13px">—</span>') + '</div>' +
      '<div style="margin-bottom:16px">' + legend + '</div>' +
      '<button id="es-reveal" type="button" style="width:100%;' + GBS + ';border-color:#3fae5a;background:#15301f;font-size:15px;padding:13px">🗺 Rivela la mappa di conoscenza</button>';
    ov.card.querySelector('#es-reveal').onclick = function () { un(); ov.close(); _revealGraph(); };
  }
  function _revealGraph() { _closeDungeon(); _toast(_tSafe('tst_dg_map_ready', 'La tua mappa di conoscenza è pronta — esplorala!'), 'success'); }

  // ════════════════════════ SELF-TEST (logica) ═══════════════════════════════
  function _selftest() {
    var pass = 0, fail = 0, log = [];
    function ok(name, cond) { if (cond) pass++; else { fail++; log.push('FAIL: ' + name); } }
    ok('fuzzy eq', _fuzzy('Fotosintesi', 'fotosintesi'));
    ok('fuzzy diff', !_fuzzy('cane', 'gatto'));
    ok('gateThr default 0.6', _gateThr() >= 0 && _gateThr() <= 1);
    ok('genQuestions count', _genQuestions([{ label: 'A', desc: 'aaa' }, { label: 'B', desc: 'bbb' }, { label: 'C', desc: 'ccc' }, { label: 'D', desc: 'ddd' }], 3).length === 3);
    ok('genQuestions subjects', (function () { var qs = _genQuestions([{ label: 'A', desc: 'aaa' }, { label: 'B', desc: 'bbb' }], 2, [{ label: 'X', desc: 'xxxx' }, { label: 'Y', desc: 'yyyy' }]); return qs.length === 2 && /X|Y/.test(qs.map(function (q) { return q.answer + ' ' + (q.q || ''); }).join(' ')); })());
    ok('stem maschera la risposta', _stem('La Fotosintesi converte la luce in energia chimica.', 'Fotosintesi').toLowerCase().indexOf('fotosintesi') < 0);
    ok('genQuestions fallback aperto (no cloze)', (function () { var qs = _genQuestions([{ label: 'Fotosintesi', desc: 'La Fotosintesi converte luce in energia nelle piante.' }, { label: 'Respirazione', desc: 'La Respirazione cellulare produce ATP.' }], 3); return qs.length === 3 && qs.every(function (q) { return q.kind === 'open' && (q.q || '').indexOf('____') < 0; }); })());
    ok('keywordCoverage', _keywordCoverage('le piante convertono luce in energia', 'La fotosintesi converte luce in energia chimica nelle piante') > 0.3 && _keywordCoverage('xyz', 'La fotosintesi converte la luce') === 0);
    ok('genQuestions rel → aperta spiega', (function () { var qs = _genQuestions([{ label: 'A → causa → B', desc: 'x', kind: 'rel' }], 1); return qs.length === 1 && qs[0].kind === 'open' && /[Ss]piega/.test(qs[0].q || ''); })());
    ok('genQuestions porta nodeId+subjLabel', (function () { var qs = _genQuestions([{ id: 'n1', label: 'A', desc: 'aaa' }], 1); return qs.length === 1 && qs[0].nodeId === 'n1' && qs[0].subjLabel === 'A'; })());
    ok('core presente o fallback ok', (function () { var C = _core(); return !C || (typeof C.capEvents === 'function' && typeof C.validQuizItem === 'function' && typeof C.zpdFormat === 'function'); })());
    ok('events array', Array.isArray(_events()));
    ok('quiz cache: hit + invalidazione hash', (function () {
      try {
        _quizCachePut('__selftest1', 'desc A', [{ stem: 'quattro parole di stem valido', a1: 'x', a2: 'y', correct: 1 }], 'cloud');
        var hit = _quizCacheGet('__selftest1', 'desc A'), miss = _quizCacheGet('__selftest1', 'desc CAMBIATA');
        return !!hit && hit.src === 'cloud' && !miss;
      } catch (e) { return false; }
      finally { try { var all = _quizCacheAll(); delete all.__selftest1; _lsSet(_quizKey(), JSON.stringify(all)); } catch (e2) {} }
    })());
    ok('quiz cache: il locale non sovrascrive il cloud', (function () {
      try {
        _quizCachePut('__selftest2', 'd', [{ v: 1 }], 'cloud'); _quizCachePut('__selftest2', 'd', [{ v: 2 }], 'local');
        var e = _quizCacheGet('__selftest2', 'd'); return !!e && e.src === 'cloud' && e.items[0].v === 1;
      } catch (e3) { return false; }
      finally { try { var all2 = _quizCacheAll(); delete all2.__selftest2; _lsSet(_quizKey(), JSON.stringify(all2)); } catch (e4) {} }
    })());
    ok('wordCount', _wordCount('uno due tre') === 3 && _wordCount('') === 0 && _wordCount('  ') === 0);
    ok('captureMin range', (function () { var m = _captureMin({ desc: new Array(200).join('x ') }); return m >= 6 && m <= 20; })());
    ok('bossThr ≥ gateThr', _bossThr() >= _gateThr() && _bossThr() >= 0.66);
    ok('studyMode boolean', typeof _studyMode() === 'boolean');
    ok('loadDiary array', Array.isArray(_loadDiary()));
    ok('memoryContent fallback a desc', _memoryContent({ id: '__none__', label: 'x' }, 'rel').kind === 'desc' && _memoryContent({ id: '__none__', label: 'x' }, 'cite').kind === 'desc');
    ok('onboarded boolean', typeof _onboarded() === 'boolean');
    ok('soundOn boolean', typeof _soundOn() === 'boolean');
    // ── hub Giardino dei Sapienti (Fasi 1-4) ──
    ok('map-loader presente + parse minimale', (function () {
      var L = window.MappAIMapLoader; if (!L) return true;   // modulo opzionale: senza, fallback procedurale
      var g = [[{ ts: 'overworld', c: 0, r: 0 }, { ts: 'overworld', c: 16, r: 1 }]];
      var m = L.parseMap({ version: 2, cols: 2, rows: 1, layers: [{ name: 'ground', data: g }, { name: 'over', data: [[null, null]] }], objects: [] });
      return m && m.map['0,0'] === 0 && m.map['1,0'] === 1 && m.water['1,0'] === true;
    })());
    ok('composeFloors: misto+intermezzi', (function () {
      var fl = _composeFloors([{ level: 1, nodes: [1] }, { level: 2, nodes: [2] }], false);
      return fl.length >= 3 && fl[0].kind === 'misto' && (fl[1].kind === 'radura' || fl[1].kind === 'combat');
    })());
    ok('composeFloors: study senza intermezzi', _composeFloors([{ level: 1, nodes: [1] }, { level: 2, nodes: [2] }], true).length === 2);
    ok('gardenMapName stabile', _gardenMapName() === _gardenMapName());
    ok('hub flags boolean', typeof _hubBranchesOn() === 'boolean' && typeof _hubGuardianOn() === 'boolean');
    // ── NPC Slices 1-3 (SDS §5-§7) ──
    ok('npc-behavior presente + determinismo', (function () {
      var B = window.MappAINpcBehavior; if (!B) return true;   // modulo opzionale
      var r1 = B.mulberry32(B.strSeed('x')), r2 = B.mulberry32(B.strSeed('x'));
      if (r1() !== r2()) return false;
      var st2 = B.mkBehavior('static', 3, 3, 2);
      B.stepNpc(st2, { now: 99999, rng: r1, walkable: function () { return true; }, playerDist: 9 });
      return st2.x === 3 && st2.y === 3 && st2.state === 'IDLE';
    })());
    ok('npc flags + costo cross-link', typeof _npcGardenOn() === 'boolean' && typeof _npcVaultSaveOn() === 'boolean' && NPC_XLINK_COST > 0);
    ok('xlink bought è oggetto', typeof _xlinkBought() === 'object');
    var save = DUN;
    DUN = { px: 5, py: 5, facing: [0, -1], map: {}, kills: 0, duelStats: {}, mobs: [], items: {}, mana: 9, maxMana: 10, coins: 0, gems: 0, messages: [], msgDirty: false };
    for (var x = 0; x < 11; x++) for (var y = 0; y < 11; y++) DUN.map[x + ',' + y] = 0;
    ok('spell AoE = 11 celle', _spellCells().length === 11);
    ok('reactWindow base 1600', _reactWindow() === 1600);
    DUN.kills = 10; ok('reactWindow -10% dopo 10 kill', _reactWindow() === 1440); DUN.kills = 0;
    DUN.items = { '5,5': { type: 'potion_blue' } }; DUN.mana = 9; _checkPickup(); ok('pozione blu +1 (clamp 10)', DUN.mana === 10);
    DUN.items = { '5,5': { type: 'potion_green' } }; DUN.mana = 2; _checkPickup(); ok('pozione verde = full', DUN.mana === 10);
    DUN = save;
    var r = pass + '/' + (pass + fail) + ' PASS' + (fail ? ' — ' + log.join(' | ') : '');
    console.log('%c[memory-dungeon selftest] ' + r, fail ? 'color:#e24b4a;font-weight:bold' : 'color:#3fae5a;font-weight:bold');
    return { pass: pass, fail: fail, log: log };
  }

  // ─────────────────────────── launcher in-app (gated da flag) ───────────────
  function openChooser() {
    var ov = _overlay(); var un = _esc(ov.close);
    function go(fn) { un(); ov.close(); fn(); }
    ov.card.innerHTML =
      '<h3 style="margin:0 0 4px;font-size:17px;font-weight:500">Memory Dungeon — prova minigiochi</h3>' +
      '<div style="font-size:12px;color:#8fa4c4;margin-bottom:14px">Esplorazione, cattura attiva e door keeper attivi. Boss + reveal in costruzione.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button id="c-dun" style="padding:11px;border-radius:10px;border:0.5px solid #3fae5a;background:#15301f;color:#eaf2ff;cursor:pointer;text-align:left">🏰 Entra nel dungeon — esplora (point&amp;click)</button>' +
      '<button id="c-seq" style="padding:11px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;text-align:left">▶ Sblocco libro/scroll — forme &amp; calcolo</button>' +
      '<button id="c-sg"  style="padding:11px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer;text-align:left">▶ Prova inibizione — stop/go (F/J)</button>' +
      '<button id="c-study" style="padding:9px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">🎓 Modalità studio: ' + (_studyMode() ? 'ON (combat off)' : 'OFF') + '</button>' +
      '<button id="c-set" style="padding:9px;border-radius:10px;border:0.5px solid #3aa0c9;background:#16203a;color:#eaf2ff;cursor:pointer">⚙ Impostazioni giochi <span style="color:#8fa4c4;font-size:11px">(Ctrl+Shift+Q,A,Y)</span></button>' +
      '<button id="c-rst" style="padding:9px;border-radius:10px;border:0.5px solid rgba(120,160,220,.35);background:transparent;color:#8fa4c4;cursor:pointer">↺ Reset skill &amp; WM</button>' +
      '<button id="c-cls" style="padding:9px;border-radius:10px;border:none;background:transparent;color:#8fa4c4;cursor:pointer">chiudi</button>' +
      '</div>';
    ov.card.querySelector('#c-dun').onclick = function () { go(_startDungeon); };
    ov.card.querySelector('#c-seq').onclick = function () { go(testUnlock); };
    ov.card.querySelector('#c-sg').onclick = function () { go(testStopGo); };
    ov.card.querySelector('#c-study').onclick = function () { var on = window.MappAIGames.studyMode(!_studyMode()); ov.card.querySelector('#c-study').textContent = '🎓 Modalità studio: ' + (on ? 'ON (combat off)' : 'OFF'); };
    ov.card.querySelector('#c-set').onclick = function () { go(_openGamesDashboard); };
    ov.card.querySelector('#c-rst').onclick = function () { window.MappAIGames.resetSkill(); ov.card.querySelector('#c-rst').textContent = '✓ azzerati'; };
    ov.card.querySelector('#c-cls').onclick = function () { un(); ov.close(); };
  }

  // ─────────────── DASHBOARD impostazioni giochi (chord Ctrl+Shift+Q,A,Y) ───────
  function _gamesOn() { return localStorage.getItem('mappai_games_enabled') === '1'; }
  function _openGamesDashboard() {
    var ov = _overlay(); var un = _esc(ov.close);
    ov.card.style.width = 'min(620px,94vw)'; ov.card.style.maxHeight = '88vh'; ov.card.style.overflowY = 'auto'; ov.card.style.padding = '18px';
    function tgl(id, on, label, desc) {
      return '<button id="' + id + '" type="button" style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;' + GBS + ';margin:5px 0">' +
        '<span><b>' + label + '</b>' + (desc ? '<br><span style="font-size:11px;color:#8fa4c4">' + desc + '</span>' : '') + '</span>' +
        '<span style="flex:none;padding:3px 10px;border-radius:12px;font-size:12px;' + (on ? 'background:#15301f;color:#7fe0a0;border:1px solid #3fae5a' : 'background:#2a1c1c;color:#e6a0a0;border:1px solid #5a3a3a') + '">' + (on ? 'ON' : 'OFF') + '</span></button>';
    }
    function render() {
      var sk = _skill(), wm = Math.round(_wm()), thr = Math.round(_gateThr() * 100), diary = _loadDiary().length;
      var duel; try { duel = JSON.parse(localStorage.getItem('mappai_dungeon_duel') || '{}'); } catch (e) { duel = {}; }
      var avgRt = duel.correct ? Math.round(duel.sumRt / duel.correct) : null, acc = duel.n ? Math.round(100 * (duel.correct || 0) / duel.n) : null;
      var lab = 'font-size:11px;color:#5e6b82;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.5px';
      ov.card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0;font-size:18px;font-weight:600">🎮 Impostazioni Giochi</h3><span style="font-size:11px;color:#8fa4c4">Ctrl+Shift+Q,A,Y</span></div>' +
        '<div style="' + lab + ';margin-top:0">Generale</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          tgl('gd-en', _gamesOn(), 'Modulo Giochi', 'Bottone 🎮 in alto a destra') +
          tgl('gd-study', _studyMode(), 'Modalità studio', 'Solo cattura/sblocco, no combat') +
          tgl('gd-snd', _soundOn(), 'Suoni', 'Effetti audio del dungeon') +
        '</div>' +
        '<div style="' + lab + '">Difficoltà</div>' +
        '<div style="' + GBS + ';cursor:default;margin:5px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>Soglia Door Keeper / Gate</span><b id="gd-thrv">' + thr + '%</b></div><input id="gd-thr" type="range" min="40" max="90" step="5" value="' + thr + '" style="width:100%;margin-top:8px"></div>' +
        '<div style="' + GBS + ';cursor:default;margin:5px 0;font-size:12px;color:#b8c8e0;line-height:1.6">Skill: sequenza <b>lv ' + sk.seq + '</b> · calcolo <b>lv ' + sk.calc + '</b> &nbsp;|&nbsp; Memoria di lavoro <b>' + wm + '/100</b>' + (avgRt != null ? '<br>Duello: RT medio <b>' + avgRt + 'ms</b> · precisione <b>' + acc + '%</b>' : '') + '</div>' +
        '<div style="' + lab + '">Combattimento</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          tgl('gd-ckeys', _combatCfg().keys === 'arrows', 'Tasti: ' + (_combatCfg().keys === 'arrows' ? 'Frecce ←→' : 'Lettere F / J'), 'OFF = F / J · ON = frecce ←→') +
          tgl('gd-cmode', _combatCfg().mode === 'diritto', 'Logica: ' + (_combatCfg().mode === 'diritto' ? 'Diritto' : 'Rovescio'), 'OFF = premi l\'OPPOSTO · ON = premi lo STESSO') +
        '</div>' +
        '<div style="' + lab + '">Docente · Giardino all\'apertura del vault</div>' +
        '<div style="' + GBS + ';cursor:default;margin:5px 0">' +
          '<div style="display:flex;gap:6px;margin-bottom:8px">' +
            ['off', 'proposto', 'obbligatorio'].map(function (m) {
              var on = _hubMode() === m;
              return '<button id="gd-hub-' + m + '" type="button" style="flex:1;padding:7px;border-radius:8px;cursor:pointer;font-size:12px;' + (on ? 'background:#15301f;color:#7fe0a0;border:1px solid #3fae5a' : 'background:#16203a;color:#b8c8e0;border:0.5px solid #2a3a55') + '">' + m + '</button>';
            }).join('') +
          '</div>' +
          '<label style="font-size:12px;color:#b8c8e0;display:flex;gap:6px;align-items:center;cursor:pointer"><input id="gd-hub-pv" type="checkbox" style="width:auto"' + (function () { try { return localStorage.getItem('mappai_hub_mode::' + _vaultId()) ? ' checked' : ''; } catch (e) { return ''; } })() + '> applica solo a questo vault</label>' +
          '<button id="gd-hub-rst" type="button" style="width:100%;margin-top:8px;' + GBS + '">↺ Riproponi il Giardino (reset "visto")</button>' +
        '</div>' +
        '<div style="' + lab + '">Dati · ' + diary + ' voci diario</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<button id="gd-onb" type="button" style="flex:1 1 46%;' + GBS + '">🏫 Rivedi onboarding</button>' +
          '<button id="gd-rskill" type="button" style="flex:1 1 46%;' + GBS + '">↺ Reset skill+WM</button>' +
          '<button id="gd-rdiary" type="button" style="flex:1 1 46%;' + GBS + '">🗑 Svuota diario</button>' +
          '<button id="gd-rduel" type="button" style="flex:1 1 46%;' + GBS + '">↺ Reset metriche duello</button>' +
        '</div>' +
        '<button id="gd-x" type="button" style="width:100%;' + GBS + ';background:transparent;border-color:#2a3a55;color:#8fa4c4;margin-top:12px">chiudi</button>';
      var q = function (s) { return ov.card.querySelector(s); };
      q('#gd-en').onclick = function () { if (_gamesOn()) window.MappAIGames.disable(); else window.MappAIGames.enable(); render(); };
      q('#gd-study').onclick = function () { window.MappAIGames.studyMode(!_studyMode()); render(); };
      q('#gd-snd').onclick = function () { try { localStorage.setItem(SND_KEY, _soundOn() ? '0' : '1'); } catch (e) {} render(); };
      q('#gd-ckeys').onclick = function () { try { localStorage.setItem('mappai_dungeon_combat_keys', _combatCfg().keys === 'arrows' ? 'fj' : 'arrows'); } catch (e) {} render(); };
      q('#gd-cmode').onclick = function () { try { localStorage.setItem('mappai_dungeon_combat_mode', _combatCfg().mode === 'diritto' ? 'opposto' : 'diritto'); } catch (e) {} render(); };
      var thrEl = q('#gd-thr'); thrEl.oninput = function () { q('#gd-thrv').textContent = thrEl.value + '%'; window.MappAIGames.gateConfig(parseInt(thrEl.value, 10) / 100); };
      ['off', 'proposto', 'obbligatorio'].forEach(function (m) {
        q('#gd-hub-' + m).onclick = function () { window.MappAIGames.hubMode(m, q('#gd-hub-pv').checked); render(); };
      });
      q('#gd-hub-pv').onchange = function () { if (!this.checked) { try { localStorage.removeItem('mappai_hub_mode::' + _vaultId()); } catch (e) {} render(); } };
      q('#gd-hub-rst').onclick = function () { window.MappAIGames.hubResetSeen(); _toast('Hub: "visto" azzerato — il Giardino riapparirà alla prossima apertura', 'success'); };
      q('#gd-onb').onclick = function () { window.MappAIGames.resetOnboarding(); _toast('Onboarding reimpostato — riapparirà al prossimo ingresso', 'success'); };
      q('#gd-rskill').onclick = function () { window.MappAIGames.resetSkill(); render(); };
      q('#gd-rdiary').onclick = function () { window.MappAIGames.resetDiary(); render(); };
      q('#gd-rduel').onclick = function () { window.MappAIGames.resetDuelStats(); render(); };
      q('#gd-x').onclick = function () { un(); ov.close(); };
    }
    render();
  }
  // chord Ctrl+Shift + Q,A,Y (sequenziale, stile admin P,O,I,U) — attivo anche a modulo disattivato
  var _gKeys = [];
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey) {
      var k = (e.key || '').toLowerCase();
      if (k === 'q' || k === 'a' || k === 'y') {
        _gKeys.push(k); if (_gKeys.length > 3) _gKeys.shift();
        if (_gKeys.join('') === 'qay') { _openGamesDashboard(); _gKeys = []; e.preventDefault(); }
      } else _gKeys = [];
    } else _gKeys = [];
  });

  function _injectLauncher() {
    // Bottone Memory Dungeon FUORI dalla UI di default: appare solo via
    // MappAIGames.enable() (flag dev mappai_games_enabled). La colonna
    // flottante legacy non esiste più (potata il 24/8/26).
    if (document.getElementById('mdg-launch') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'mdg-launch'; b.type = 'button'; b.textContent = '🎮';
    b.title = 'Memory Dungeon';
    b.style.cssText = 'position:fixed;bottom:340px;right:20px;z-index:9996;width:48px;height:48px;border-radius:50%;border:1.5px solid #3aa0c9;background:#fff;color:#3aa0c9;font-size:20px;cursor:pointer;box-shadow:0 6px 18px -6px rgba(58,160,201,.5)';
    b.onclick = openChooser;
    document.body.appendChild(b);
  }

  // ─────────────── HUB "Garden as Hub" (S1) — giardino alla prima apertura vault ───────────────
  // Controllo docente: 'off' (default) | 'proposto' (banner invito) | 'obbligatorio' (apre il giardino).
  // Flag: 'mappai_hub_mode' globale + override per-vault 'mappai_hub_mode::<vaultId>'.
  // "Visto": 'mappai_hub_seen::<vaultId>', marcato quando il giardino viene realmente caricato.
  // Rilevazione apertura vault via watcher (app.js non emette eventi e non va toccato — WIP utente).
  function _vaultId() { var st = _getAppState(); return (st && st.activeVaultPath) || _mapSig(); }
  function _hubMode() {
    try {
      var ov = localStorage.getItem('mappai_hub_mode::' + _vaultId()); if (ov) return ov;
      return localStorage.getItem('mappai_hub_mode') || 'off';
    } catch (e) { return 'off'; }
  }
  function _hubSeen() { try { return localStorage.getItem('mappai_hub_seen::' + _vaultId()) === '1'; } catch (e) { return false; } }
  function _hubMarkSeen() { try { localStorage.setItem('mappai_hub_seen::' + _vaultId(), '1'); } catch (e) {} var b = document.getElementById('mdg-hub-banner'); if (b) b.remove(); }
  function _hubBanner() {
    if (document.getElementById('mdg-hub-banner') || !document.body) return;
    var d = document.createElement('div');
    d.id = 'mdg-hub-banner';
    d.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9997;display:flex;gap:10px;align-items:center;background:#141c2e;border:1px solid #3aa0c9;border-radius:12px;padding:10px 14px;color:#eaf2ff;font-size:13px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6)';
    d.innerHTML = '<span>🌿 I Sapienti ti aspettano nel Giardino per presentarti questa mappa.</span>' +
      '<button id="mdg-hub-go" type="button" style="padding:6px 12px;border-radius:8px;border:1px solid #3fae5a;background:#15301f;color:#eaf2ff;cursor:pointer">Visita il Giardino</button>' +
      '<button id="mdg-hub-x" type="button" style="padding:6px 10px;border-radius:8px;border:none;background:transparent;color:#8fa4c4;cursor:pointer">✕</button>';
    document.body.appendChild(d);
    d.querySelector('#mdg-hub-go').onclick = function () { d.remove(); _logEv('hub_banner_accept'); window.MappAIGames.openDungeon(); };
    d.querySelector('#mdg-hub-x').onclick = function () { d.remove(); _logEv('hub_banner_dismiss'); };
  }
  function _onVaultOpened() {
    var mode = _hubMode();
    if (mode === 'off' || _hubSeen() || DUN) return;                      // mai interrompere una sessione in corso
    var st = _getAppState(); if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) return;
    if (mode === 'obbligatorio') { _logEv('hub_auto_open', { mode: mode }); _startDungeon(); }   // giardino = piano 0; Esc/chiusura sempre attivi ("mai bloccati")
    else if (mode === 'proposto') { _logEv('hub_banner_show', { mode: mode }); _hubBanner(); }
  }
  // ─────────────── HUB S2: "Custode del Sapere" — tutor bridge nel giardino ───────────────
  // NPC fisso vicino allo spawn. Core deterministico (panoramica + bottoni percorso/prova);
  // la chat libera passa da _npcGenerate (catena locale→cloud→fallback) → funziona offline.
  function _custodeOn() { try { return localStorage.getItem('mappai_hub_custode') !== '0'; } catch (e) { return true; } }
  function _hubAssessOn() { try { return localStorage.getItem('mappai_hub_assessment') !== '0'; } catch (e) { return true; } }
  function _spMasteryFn(id) {
    var n = _mnode(id); if (!n || !n.attempts) return { level: 'nuovo', attempts: 0, lastTs: 0 };
    var lastTs = (n.byActivity || []).reduce(function (m, r) { return Math.max(m, r.lastTs || 0); }, 0);
    return { level: _level(id), attempts: n.attempts, lastTs: lastTs };
  }
  function _spClassify() {
    try {
      var SPm = window.MappAIStudyPath, st = _getAppState();
      var nodes = (st && st.db && st.db.nodes) || [], links = (st && st.db && st.db.links) || [];
      if (!SPm || !SPm.classify || !nodes.length) return null;
      return SPm.classify(nodes.map(function (n) { return n.id; }), SPm.buildParentMap(nodes, links), _spMasteryFn, { staleDays: 7 });
    } catch (e) { return null; }
  }
  function _custodeOverview() {
    var st = _getAppState(), root = (st && st.rootNodeLabel) || 'questa mappa';
    var nodes = (st && st.db && st.db.nodes) || [];
    var lv = (_levelsFromState() || []).length;
    var t = _tSafe('dg_keeper_hello', 'Benvenuto, viandante. Sono il Custode del Sapere e veglio su "{r}": {n} concetti in {l} livelli.').replace('{r}', root).replace('{n}', nodes.length).replace('{l}', lv);
    var c = _spClassify();
    if (c) t += _tSafe('dg_keeper_path', ' Il tuo cammino oggi: {a} pronti da studiare, {b} da ripassare, {c} padroneggiati.').replace('{a}', c.ready.length).replace('{b}', c.review.length).replace('{c}', c.mastered.length);
    return t + _tSafe('dg_keeper_ask', ' Chiedimi del percorso, o mettiti alla prova.');
  }
  // ─────────────── HUB S3: "Prova del Viandante" — assessment d'ingresso → baseline mastery ───────────────
  // ~2 nodi per livello (cap 10) → _runQuiz con activity 'baseline' → MappAIMastery (pipeline esistente).
  // Anti-seduzione: nessuna ricompensa (manaReward=false), feedback neutro, nessuna classifica.
  function _provaViandante() {
    var base = _levelsFromState() || [], pool = [];
    base.forEach(function (lf) {
      (lf.nodes || []).slice(0, 2).forEach(function (nd) {
        pool.push({ id: nd.id, label: _clean(nd.label), desc: _desc(nd), g: _groupOf(nd.id), kind: 'desc' });
      });
    });
    pool = pool.slice(0, 10);
    if (pool.length < 2) { _toast(_tSafe('tst_dg_map_small', 'Mappa troppo piccola per la prova d\'ingresso.'), 'warning'); return; }
    _logEv('hub_prova_start', { n: pool.length });
    _runQuiz(pool, pool.length, '🥾 Prova del Viandante', false, function (c, t) {
      _logEv('hub_prova_done', { correct: c, total: t });
      var m = _tSafe('dg_trial_done', 'Prova del Viandante completata ({c}/{t}). Il Custode ora conosce il tuo cammino.').replace('{c}', c).replace('{t}', t);
      if (DUN) _msg(m); else _toast(m, 'info');
    }, null, 'baseline');
  }
  var _hubLastVault = null;
  setInterval(function () {
    try {
      var st = _getAppState(); var vp = st && st.activeVaultPath;
      if (vp && vp !== _hubLastVault && st.db && st.db.nodes && st.db.nodes.length) { _hubLastVault = vp; _onVaultOpened(); }
    } catch (e) {}
  }, 1500);

  // ─────────────────────────── stile minimo ──────────────────────────────────
  var st = document.createElement('style');
  st.textContent = '.mdg-ov button:hover{filter:brightness(1.15)} .mdg-ov button:active{transform:scale(.97)} .mdg-ov svg{display:block}';
  document.head.appendChild(st);

  // ─────────────────────────── API pubblica ──────────────────────────────────
  window.MappAIGames = {
    // SLICE 1 — disponibile ora:
    startUnlock: startUnlock,        // startUnlock(opts, cb) — usato dai device (slice 2)
    testUnlock: testUnlock,          // prova il game feel dello sblocco (forme/calcolo)
    testStopGo: testStopGo,          // prova lo stop/go dei droidi (inibizione, F/J)
    skill: _skill, wm: _wm,
    resetSkill: function () { localStorage.removeItem(SKILL_KEY); localStorage.removeItem(WM_KEY); console.log('[memory-dungeon] skill+WM azzerati'); },
    duelStats: function () { try { var s = JSON.parse(localStorage.getItem('mappai_dungeon_duel') || '{}'); s.avgRt = s.correct ? Math.round(s.sumRt / s.correct) : null; s.accuracy = s.n ? Math.round(100 * (s.correct || 0) / s.n) : null; return s; } catch (e) { return {}; } },
    resetDuelStats: function () { localStorage.removeItem('mappai_dungeon_duel'); console.log('[memory-dungeon] metriche duello azzerate'); },
    selftest: _selftest,             // verifica logica (mana/spell/timing/gate) in console
    openSettings: _openGamesDashboard, // dashboard impostazioni (anche da chord Ctrl+Shift+Q,A,Y)
    testBoss: function () { if (DUN) _startBoss(); else _toast('Apri prima il dungeon (openDungeon)', 'warning'); }, // QA: forza la sfida finale
    studyMode: function (on) { if (on === undefined) return _studyMode(); try { if (on) localStorage.setItem('mappai_dungeon_study_mode', '1'); else localStorage.removeItem('mappai_dungeon_study_mode'); } catch (e) {} console.log('[memory-dungeon] modalità studio', _studyMode() ? 'ON (combat off)' : 'OFF'); return _studyMode(); },
    resetDiary: function () { try { localStorage.removeItem(_diaryKey()); } catch (e) {} if (DUN) DUN.diary = []; console.log('[memory-dungeon] diario azzerato (mappa corrente)'); },
    // telemetria unificata (event-log ECD): lettura, reset, export JSON per il docente
    events: function () { return _events(); },
    resetEvents: function () { try { localStorage.removeItem(EV_KEY); } catch (e) {} console.log('[memory-dungeon] event-log azzerato'); },
    exportEvents: function () {
      try {
        var b = new Blob([JSON.stringify(_events(), null, 1)], { type: 'application/json' }), u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = 'memory-dungeon-eventi.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      } catch (e) { console.warn('[memory-dungeon] export eventi fallito', e); }
    },
    // accuracy delle sintesi scritte (per-mappa) — letta da MappAIMasteryView per gli anelli dorati
    synthScores: function () { return _synthScores(); },
    resetQuiz: function () { // svuota _dunQuiz dai nodi → forza rigenerazione AI ancorata al contenuto (nodi catturati prima del fix non l'avevano)
      var n = 0, ids = {};
      if (DUN && DUN.diary) DUN.diary.forEach(function (d) { ids[d.id] = true; });
      var st = _getAppState(), nodes = (st && st.db && st.db.nodes) || [];
      nodes.forEach(function (nd) { if (nd._dunQuiz || nd._quizGenPending) { delete nd._dunQuiz; delete nd._quizGenPending; n++; } });
      Object.keys(ids).forEach(function (id) { _ensureQuiz(id, true); });   // re-genera DAVVERO (fresh) per i nodi nel diario, bypassando la cache
      console.log('[memory-dungeon] quiz azzerati su ' + n + ' nodi; rigenerazione avviata per ' + Object.keys(ids).length + ' nodi del diario');
      return n;
    },
    resetOnboarding: function () { try { localStorage.removeItem('mappai_dungeon_onboarded'); } catch (e) {} console.log('[memory-dungeon] onboarding resettato — riapparirà la scuola + le regole'); },
    gateConfig: function (accThr) { try { localStorage.setItem('mappai_dungeon_gate', JSON.stringify({ accThr: accThr })); console.log('[memory-dungeon] gate soglia =', accThr); } catch (e) {} },
    aiScoring: function (on) { if (on === undefined) return _aiScoring(); try { if (on === false) localStorage.setItem('mappai_dungeon_ai_scoring', 'false'); else localStorage.removeItem('mappai_dungeon_ai_scoring'); } catch (e) {} console.log('[memory-dungeon] scoring aperte:', _aiScoring() ? 'AI semantica (default)' : 'deterministico (offline, no costo)'); return _aiScoring(); },
    launcher: _injectLauncher,       // mostra il bottone flottante "🎮 Giochi" in-app
    openChooser: openChooser,        // menu minigiochi + entra nel dungeon
    startDungeon: _startDungeon,     // esplorazione dungeon (slice 2a)
    importFloorPlan: _importFloorPlan, // importa piano-N.json nel vault (valida col contratto §4)
    genQuizForNode: _genQuizForNode, // MappAI Live: quiz MC ancorato al contenuto del nodo (usa la cache dungeon)
    tune: function (o) { // engine ASCII Space Bears: es. MappAIGames.tune({theme:'#5f9ad6'}) o {theme:false}
      if (!DUN || !o) return;
      if (o.theme !== undefined) DUN.theme = (o.theme === false) ? null : (typeof o.theme === 'string' ? { n: 'custom', t: o.theme } : o.theme);
    },
    // SKIN: 'voxel' (default, 3D) | 'lol' (2D top-down) | 'fantastic' (vecchio tileset)
    skin: function (n) { if (n === undefined) return _skin(); try { var v = (n === 'fantastic' || n === 'lol' || n === 'voxel') ? n : 'voxel'; localStorage.setItem('mappai_dungeon_skin', v); } catch (e) {} console.log('[memory-dungeon] skin =', _skin()); return _skin(); },
    tuneLoL: function (o) { // taratura coord live: es. MappAIGames.tuneLoL({biome:'caverna', floor:[2,2], decals:[[7,3],[8,3]], decalPct:8})
      if (!o) return LOL;
      if (o.biome && LOL.biomes[o.biome]) { var b = LOL.biomes[o.biome]; if (o.floor) b.floor = o.floor; if (o.wall) b.wall = o.wall; if (o.water !== undefined) b.water = o.water; if (o.decals) b.decals = o.decals; if (o.decalPct !== undefined) b.decalPct = o.decalPct; }
      return LOL.biomes;
    },
    // polish uso-asset (ombre, buio+luci, bossbar, bolle): on/off live
    polish: function (on) { try { localStorage.setItem('mappai_dungeon_polish', on === false ? '0' : '1'); } catch (e) {} return on !== false; },
    // HUB S1 — giardino alla prima apertura vault (controllo docente):
    hubMode: function (m, perVault) {
      if (m === undefined) return _hubMode();
      if (m !== 'off' && m !== 'proposto' && m !== 'obbligatorio') { console.warn('[memory-dungeon] hubMode: off | proposto | obbligatorio'); return _hubMode(); }
      try { if (perVault) localStorage.setItem('mappai_hub_mode::' + _vaultId(), m); else localStorage.setItem('mappai_hub_mode', m); } catch (e) {}
      console.log('[memory-dungeon] hub mode =', m, perVault ? '(solo questo vault)' : '(globale)'); return m;
    },
    hubCheck: function () { _onVaultOpened(); return { mode: _hubMode(), seen: _hubSeen(), vault: _vaultId() }; },   // QA: forza un tick del watcher
    qaState: function () { return DUN ? { fi: DUN.fi, kind: DUN.floors[DUN.fi].kind, stairReady: !!DUN.stairReady, floors: DUN.floors.map(function (f) { return { kind: f.kind, level: f.level, n: (f.nodes || []).length }; }) } : null; },   // QA console
    qaSoftGate: function (next) { if (!DUN) return 'apri prima il dungeon'; _softGateWarn(next != null ? next : DUN.fi + 1, function () { _toast('soft-gate: proceed', 'info'); }); },   // QA: forza il check del gating morbido
    qaDescend: function () { if (DUN) _loadFloor(Math.min(DUN.fi + 1, DUN.floors.length - 1)); },   // QA: salta al piano successivo senza gate
    qaGarden: function () {   // QA console: stato giardino + apri il Custode senza click di precisione
      if (!DUN || !DUN.gardenNpcs) return null;
      var out = { npcs: [] }, cust = null;
      for (var k in DUN.gardenNpcs) { var g = DUN.gardenNpcs[k]; out.npcs.push({ k: k, label: g.label, custode: !!g.custode }); if (g.custode) cust = g; }
      out.openCustode = function () { if (cust) _openGardenNpc(cust); return !!cust; };
      return out;
    },
    hubResetSeen: function () { try { localStorage.removeItem('mappai_hub_seen::' + _vaultId()); } catch (e) {} console.log('[memory-dungeon] hub "visto" azzerato per', _vaultId()); },
    // SLICE 2a:
    openDungeon: function () { var st = _getAppState(); if (st && st.db && st.db.nodes && st.db.nodes.length) _startDungeon(); else openChooser(); },
    enabled: function () { return localStorage.getItem('mappai_games_enabled') === '1'; },
    enable: function () { localStorage.setItem('mappai_games_enabled', '1'); _injectLauncher(); console.log('%c[memory-dungeon] abilitato — bottone 🎮 in alto a destra', 'color:#3aa0c9'); },
    disable: function () { localStorage.removeItem('mappai_games_enabled'); var b = document.getElementById('mdg-launch'); if (b) b.remove(); }
  };

  // Niente auto-mostra all'avvio (24/8/26, potatura flottanti): il bottone
  // 🎮 compare solo chiamando MappAIGames.enable() nella sessione corrente.
})();
