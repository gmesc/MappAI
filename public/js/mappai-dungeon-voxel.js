/*
 * mappai-dungeon-voxel.js — skin VOXEL 3D del Memory Dungeon (§19 F1)
 * --------------------------------------------------------------------
 * Terza skin (localStorage 'mappai_dungeon_skin' = 'voxel') accanto a SB/LoL.
 * Presentazione pura: la griglia logica, i tick, le sfide §17 e le sorgenti
 * restano in mappai-games.js — questo modulo legge DUN e disegna.
 *
 * Modello luce §19.3: piano al BUIO + lanterna sull'eroe; celle esplorate
 * tinteggiate; quando il piano è tutto esplorato (boot del server) la luce
 * diventa globale.
 *
 * Entità (§19 F2): PERSONAGGI = sprite PNG animati dai fogli rogue8x8 (eroe walk,
 * mob orco, boss gatekeeper, sapienti NPC), illuminati dalla lanterna. LANDMARK di
 * studio (libri, scale, condotto, server, portale) = billboard emoji self-lit,
 * leggibili nel buio. Sprite in async con placeholder emoji: se un PNG manca,
 * l'emoji resta (fallback grazioso).
 *
 * Richiede window.THREE (js/vendor/three.min.js, r128 — API `encoding`).
 * API: available() · frame(DUN) · pick(event) → {x,y}|null · dispose()
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var T = null;                 // THREE (risolto lazy: vendored come globale)
  var V = window.MappAIDungeonVoxel = {};
  var st = null;                // stato scena corrente

  V.available = function () {
    if (!T) T = window.THREE || null;
    return !!(T && T.InstancedMesh);
  };

  function emojiTex(ch) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var c2 = cv.getContext('2d');
    c2.font = '50px serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(ch, 32, 36);
    var t = new T.CanvasTexture(cv);
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
    if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    return t;
  }
  var _texCache = {};
  function billboard(ch, size) {
    var geo = new T.PlaneGeometry(size, size);
    geo.translate(0, size / 2, 0);
    if (!_texCache[ch]) _texCache[ch] = emojiTex(ch);
    var mat = new T.MeshBasicMaterial({ map: _texCache[ch], alphaTest: 0.35, side: T.DoubleSide, transparent: true });
    var mesh = new T.Mesh(geo, mat);
    var g = new T.Group(); g.add(mesh);
    g.userData.mat = mat;
    return g;
  }

  var SRC_EMOJI = { libro: '📖', scroll: '📜', vaso: '🏺', condotto: '⚡', server: '🖥' };
  var THEME_COLS = {            // pavimento/muro per tema (fallback pietra)
    pietra: [0x9a958a, 0x6f6b62], muschio: [0x8aa07e, 0x5c7052],
    cripta: [0x8d8598, 0x5e5870], lava: [0xa08578, 0x6f544a]
  };

  // ── Sprite PNG animati (§19 F2) ─────────────────────────────────────────────
  // I PERSONAGGI (eroe/mob/boss/sapiente) sono sprite reali dai fogli rogue8x8; i
  // LANDMARK di studio (libri, scale, condotto, server…) restano emoji self-lit,
  // leggibili nel buio §19.3. Frame ritagliati via UV offset/repeat; animazione =
  // swap del frame su clock globale (nessun rAF proprio: gira dentro V.frame).
  // Caricamento async con placeholder emoji: se il foglio manca, l'emoji resta
  // (stesso spirito di auto-fallback del resto della skin).
  var ASSETS = 'assets/';
  // PARITÀ LoL (richiesta utente 7/7/26): i personaggi usano gli STESSI PNG della
  // skin 2D Legend of Lua (playerSheet, scheletri/pipistrelli, boss guardian,
  // Sapienti) — l'aspetto non cambia più tra 2D e voxel. Layout fogli come in
  // games.js LOL.spr: player 19×21 griglia 5×10 (riga0 walk-down 2 frame, riga7
  // idle 4 frame); nemici/boss = frame orizzontali.
  function cellP(col, row) { return { px: col * 19, py: row * 21, pw: 19, ph: 21 }; }   // playerSheet
  function hframes(n, fw, fh) { var a = []; for (var i = 0; i < n; i++) a.push({ px: i * fw, py: 0, pw: fw, ph: fh }); return a; }
  var LOLDIR = 'legendoflua/sprites/';
  var SHEETS = {
    // file risolto in buildFloor: playerSheet<outfit>.png (outfit scelto dal giocatore)
    hero: { file: LOLDIR + 'player/playerSheet1.png', W: 95, H: 210, size: 0.85, emoji: '🧝', aspect: 19 / 21,
            anims: { idle: [cellP(0, 7), cellP(1, 7), cellP(2, 7), cellP(3, 7)], walk: [cellP(0, 0), cellP(1, 0)] }, fps: 6 },
    mob:  { file: LOLDIR + 'enemies/skeleton/knife.png', W: 40, H: 24, size: 0.72, emoji: '👹', aspect: 20 / 24,
            anims: { walk: hframes(2, 20, 24) }, fps: 5 },
    mobBat: { file: LOLDIR + 'enemies/bat.png', W: 32, H: 16, size: 0.5, emoji: '🦇',
            anims: { walk: hframes(2, 16, 16) }, fps: 6 },
    // Sapienti: file distinti per varietà (stessi PNG dei 4 Sapienti + Custode 2D)
    npc:  { files: [LOLDIR + 'npc/sapiente-rosso.png', LOLDIR + 'npc/sapiente-blu.png',
                    LOLDIR + 'npc/sapiente-ocra.png', LOLDIR + 'npc/merchant.png',
                    LOLDIR + 'npc/sapiente-viola.png'],
            W: 16, H: 23, size: 0.72, emoji: '🧙', aspect: 16 / 23,
            anims: { idle: [{ px: 0, py: 0, pw: 16, ph: 23 }] }, fps: 1 },
    boss: { file: LOLDIR + 'enemies/boss_guardian.png', W: 128, H: 32, size: 0.95, emoji: '⚔',
            anims: { idle: hframes(4, 32, 32) }, fps: 4 }
  };
  var _sheetTex = {};           // file → THREE.Texture del foglio (caricato una volta)
  function loadSheet(file, cb) {
    if (_sheetTex[file] !== undefined) { cb(_sheetTex[file]); return; }
    if (!V._loader) V._loader = new T.TextureLoader();
    V._loader.load(ASSETS + file,
      function (tex) { _sheetTex[file] = tex; cb(tex); },
      undefined,
      function () { console.warn('[voxel-skin] sprite non caricato:', file); _sheetTex[file] = null; cb(null); });
  }
  // ritaglia un frame clonando il foglio: la clone condivide l'immagine ma ha
  // offset/repeat indipendenti → più frame dallo stesso PNG senza ricaricarlo.
  function frameTex(sheet, fr, W, H) {
    var t = sheet.clone(); t.needsUpdate = true;
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
    if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    var inset = 0.05;           // evita bleed dai frame adiacenti
    t.repeat.set((fr.pw - 2 * inset) / W, (fr.ph - 2 * inset) / H);
    t.offset.set((fr.px + inset) / W, 1 - (fr.py + fr.ph - inset) / H);
    return t;
  }
  // billboard con sprite: emoji placeholder → frame PNG quando il foglio arriva.
  // variant = indice in d.files (varietà NPC: un PNG per Sapiente).
  // Lambert = illuminato dalla lanterna §19.3.
  function spriteBillboard(key, variant) {
    var d = SHEETS[key], aspect = d.aspect || 1;
    var file = d.files ? d.files[(variant || 0) % d.files.length] : d.file;
    var geo = new T.PlaneGeometry(d.size * aspect, d.size);
    geo.translate(0, d.size / 2, 0);
    if (!_texCache[d.emoji]) _texCache[d.emoji] = emojiTex(d.emoji);
    var mat = new T.MeshLambertMaterial({ map: _texCache[d.emoji], alphaTest: 0.5, side: T.DoubleSide, transparent: true });
    var mesh = new T.Mesh(geo, mat);
    // ombra ritagliata sulla silhouette (pattern proto): depth material con alphaTest
    mesh.castShadow = true;
    var depthMat = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: _texCache[d.emoji], alphaTest: 0.5 });
    mesh.customDepthMaterial = depthMat;
    var g = new T.Group(); g.add(mesh);
    g.userData = { mat: mat, depthMat: depthMat, sprite: key, frames: null, anim: null, fps: d.fps, fi: -1 };
    loadSheet(file, function (sheet) {
      if (!sheet) return;       // PNG assente → resta l'emoji
      var frames = {};
      Object.keys(d.anims).forEach(function (an) {
        frames[an] = d.anims[an].map(function (fr) {
          return frameTex(sheet, fr, d.W, d.H);
        });
      });
      g.userData.frames = frames;
      g.userData.anim = d.anims.idle ? 'idle' : Object.keys(d.anims)[0];
      mat.map = frames[g.userData.anim][0]; mat.needsUpdate = true;
      depthMat.map = mat.map; depthMat.needsUpdate = true;
    });
    return g;
  }
  // avanza l'animazione di uno sprite (clock globale, condiviso tra istanze)
  function animateSprite(g, animName) {
    var u = g && g.userData; if (!u || !u.frames) return;
    if (animName && u.frames[animName] && u.anim !== animName) { u.anim = animName; u.fi = -1; }
    var list = u.frames[u.anim]; if (!list || !list.length) return;
    var idx = list.length > 1 ? Math.floor(Date.now() / 1000 * u.fps) % list.length : 0;
    if (idx !== u.fi) {
      u.fi = idx; u.mat.map = list[idx]; u.mat.needsUpdate = true;
      if (u.depthMat) { u.depthMat.map = list[idx]; u.depthMat.needsUpdate = true; }   // l'ombra segue il frame
    }
  }

  function ensureScene(DUN) {
    if (st && st.canvas.parentNode) return;
    var gameEl = DUN.root.querySelector('#game');
    var renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // dimensiona sul CONTENITORE, non sulla finestra: in finestra non-fullscreen
    // il canvas a window-size sbordava da #game → vista deformata e ingiocabile
    var gw = function () { return gameEl.clientWidth || window.innerWidth; };
    var gh = function () { return gameEl.clientHeight || window.innerHeight; };
    renderer.setSize(gw(), gh());
    renderer.setClearColor(0x0a0c14);
    // ombre come il proto (default "dure": BasicShadowMap = pixellate, coerenti col look)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.BasicShadowMap;
    // pointer-events:none → i click passano al canvas 2D sottostante (listener
    // esistenti di games.js); il pick 3D avviene dentro _onDunClick via V.pick
    renderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    gameEl.appendChild(renderer.domElement);
    var scene = new T.Scene();
    var cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    var hemi = new T.HemisphereLight(0xffffff, 0x3a3a44, 0.14);
    var dir = new T.DirectionalLight(0xfff2dd, 0.12);
    dir.position.set(20, 34, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.width = dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.002;
    var dirTarget = new T.Object3D();
    dir.target = dirTarget;
    var lantern = new T.PointLight(0xffd9a0, 2.2, 5.5, 1.6);
    scene.add(hemi); scene.add(dir); scene.add(dirTarget); scene.add(lantern);
    st = { renderer: renderer, scene: scene, cam: cam, hemi: hemi, dir: dir, dirTarget: dirTarget,
           lantern: lantern, gameEl: gameEl,
           canvas: renderer.domElement, floorKey: null, group: null, dyn: {}, cellIdx: {},
           boxes: null, mesh: null, visited: {}, lit: false, half: 9, sub: 1,
           yaw: Math.PI / 4, yawT: Math.PI / 4,
           heroW: null, ray: new T.Raycaster(), _tint: new T.Color() };
    st.onResize = function () { renderer.setSize(gw(), gh()); updateFrustum(); };
    window.addEventListener('resize', st.onResize);
    // il contenitore può cambiare misura senza resize della finestra (pannelli, zoom UI)
    if (window.ResizeObserver) { st.ro = new ResizeObserver(st.onResize); st.ro.observe(gameEl); }
    // rotellina = zoom (mezza-altezza della camera ortografica, clamp 4..18)
    st.onWheel = function (e) {
      e.preventDefault();
      st.half = Math.max(4, Math.min(18, st.half * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
      updateFrustum();
    };
    gameEl.addEventListener('wheel', st.onWheel, { passive: false });
    // Q/E: ruota la camera di 90° come nel proto (lerp morbido in frame).
    // Ignora quando si digita in un input (modali quiz/cattura).
    st.onKey = function (e) {
      var tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'q') st.yawT += Math.PI / 2;
      else if (k === 'e') st.yawT -= Math.PI / 2;
    };
    window.addEventListener('keydown', st.onKey);
    updateFrustum();
  }
  function updateFrustum() {
    var w = (st.gameEl && st.gameEl.clientWidth) || window.innerWidth || 1280;
    var h = (st.gameEl && st.gameEl.clientHeight) || window.innerHeight || 720;
    var a = w / h;
    st.cam.left = -st.half * a; st.cam.right = st.half * a;
    st.cam.top = st.half; st.cam.bottom = -st.half;
    st.cam.updateProjectionMatrix();
  }
  // yaw TARGET della camera (multiplo di 90° + base 45°) — games.js lo usa per
  // mappare WASD screen-relative sui passi di griglia (coerenti dopo Q/E)
  V.yaw = function () { return st ? st.yawT : Math.PI / 4; };

  // Ricostruisce la scena del piano da DUN.map. Come il proto: 1 tile logico =
  // SUB×SUB mini-voxel con jitter di quota e colore (l'occhio non vede più il
  // modulo del tile). SUB adattivo per tenere basse le istanze sui piani grossi
  // del digger (72×48): ≤1200 celle → 3 · ≤3000 → 2 · oltre → 1.
  function buildFloor(DUN) {
    if (st.group) st.scene.remove(st.group);
    st.group = new T.Group();
    st.dyn = {}; st.cellIdx = {}; st.visited = {}; st.lit = false;
    var cols = THEME_COLS[(DUN.theme && DUN.theme.n) || 'pietra'] || THEME_COLS.pietra;
    var cFloor = new T.Color(cols[0]), cWall = new T.Color(cols[1]);
    var cWater = new T.Color(0x3d6f96);
    var keys = Object.keys(DUN.map);
    var SUB = keys.length <= 1200 ? 3 : (keys.length <= 3000 ? 2 : 1);
    st.sub = SUB;
    // §21: quota del piano (movimento quota-aware) → il terreno la mostra DAVVERO.
    // st.quota null = piatto (piani procedurali, kill-switch): identico a prima.
    st.quota = DUN.quota || null;
    st.gy = function (x, y) { return (st.quota && st.quota[Math.round(x) + ',' + Math.round(y)]) || 0; };
    var boxes = [];
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    keys.forEach(function (key) {
      var p = key.split(','); var x = +p[0], y = +p[1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minZ) minZ = y; if (y > maxZ) maxZ = y;
      var wall = DUN.map[key] === 1;
      var water = !!(DUN.gardenWater && DUN.gardenWater[key]);
      var base = water ? cWater : (wall ? cWall : cFloor);
      var q = (st.quota && st.quota[key]) || 0;   // rialzo reale della cella
      st.cellIdx[key] = [];
      for (var sy = 0; sy < SUB; sy++) for (var sx = 0; sx < SUB; sx++) {
        st.cellIdx[key].push(boxes.length);
        boxes.push({
          x: x - 0.5 + (sx + 0.5) / SUB, z: y - 0.5 + (sy + 0.5) / SUB, w: 1 / SUB,
          h: wall ? 1.45 + Math.random() * 0.4 : 0.9,
          jit: wall ? 0 : (water ? -0.3 - Math.random() * 0.12 : Math.random() * 0.07),
          qy: q,
          wall: wall,
          color: base.clone().multiplyScalar(0.9 + Math.random() * 0.2)
        });
      }
    });
    st.boxes = boxes;
    var mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), boxes.length);
    var m = new T.Matrix4();
    boxes.forEach(function (b, i) {
      m.makeScale(b.w, b.h, b.w);
      m.setPosition(b.x, (b.wall ? b.h / 2 : b.h / 2 - 0.9) + b.jit + b.qy, b.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, b.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    st.mesh = mesh;
    st.group.add(mesh);
    // sole e shadow camera centrati sul piano (piani fino a 72×48)
    var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    var d = Math.max(maxX - minX, maxZ - minZ) * 0.75 + 4;
    st.dir.position.set(cx + 20, 34, cz + 8);
    st.dirTarget.position.set(cx, 0, cz);
    var sc = st.dir.shadow.camera;
    sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = 90;
    sc.updateProjectionMatrix();

    // entità statiche → billboard emoji, posate alla quota della loro cella (§21)
    function put(g, x, y, id) { g.position.set(x, st.gy(x, y), y); st.group.add(g); st.dyn[id] = g; }
    for (var k in DUN.sources) {
      var s = DUN.sources[k], sp = k.split(',');
      var ch = SRC_EMOJI[s.type] || '📦';
      // taglie in rapporto proto (tile = 1): item ~0.62, terminali più grandi
      var esz = s.type === 'server' ? 0.85 : (s.type === 'condotto' ? 0.7 : 0.62);
      put(billboard(ch, esz), +sp[0], +sp[1], 'src:' + k);
    }
    if (DUN.sx >= 0) put(billboard('🔽', 0.62), DUN.sx, DUN.sy, 'stairs');
    if (DUN.boss && !DUN.boss.defeated) put(spriteBillboard('boss'), DUN.boss.x, DUN.boss.y, 'boss');
    if (DUN.gateRoom) put(billboard('🔮', 0.8), DUN.gateRoom.bx, DUN.gateRoom.by, 'gate');
    // mappa-mondo (§20): porte di confine tra le zone — spariscono quando aperte (worldRev)
    if (DUN.world && DUN.world.gates) {
      DUN.world.gates.forEach(function (g, gi) {
        if (!g.open) put(billboard('🚪', 0.8), g.x, g.y, 'wgate:' + gi);
      });
    }
    if (DUN.gardenNpcs) { var nci = 0; for (var nk in DUN.gardenNpcs) {
      var gp = DUN.gardenNpcs[nk];
      // Custode = viola (ultimo file), Sapienti a rotazione sugli altri
      var variant = gp.custode ? SHEETS.npc.files.length - 1 : nci++ % (SHEETS.npc.files.length - 1);
      put(spriteBillboard('npc', variant), gp.x, gp.y, 'npc:' + nk);
    } }
    st.heroW = { x: DUN.px, z: DUN.py, y: st.gy(DUN.px, DUN.py) };
    // outfit del giocatore = lo stesso della skin 2D (playerSheet<outfit>.png)
    SHEETS.hero.file = LOLDIR + 'player/playerSheet' + (DUN.lolOutfit || 1) + '.png';
    var hero = spriteBillboard('hero');
    put(hero, DUN.px, DUN.py, 'hero');
    st.scene.add(st.group);
  }

  function markVisited(key) {
    if (st.visited[key] || st.lit) return;
    st.visited[key] = 1;
    var idxs = st.cellIdx[key];
    if (!idxs || !st.mesh) return;
    for (var n = 0; n < idxs.length; n++) {
      var i = idxs[n];
      st._tint.copy(st.boxes[i].color).multiplyScalar(1.45);
      st.mesh.setColorAt(i, st._tint);
    }
    if (st.mesh.instanceColor) st.mesh.instanceColor.needsUpdate = true;
  }
  // piano interamente esplorato (boot del server §17) → luce globale
  function checkLit(DUN) {
    if (st.lit) return;
    var tot = 0, exp = 0;
    for (var k in DUN.map) { tot++; if (DUN.explored[k]) exp++; }
    if (tot && exp / tot >= 0.95) {
      st.lit = true;
      // valori proto: sole forte + fill basso → le ombre restano leggibili
      st.hemi.intensity = 0.5; st.dir.intensity = 1.25;
      st.lantern.visible = false;
      st.renderer.setClearColor(0x232630);
      // la tinta "visitato" (+45%) ha senso solo al buio: a luce piena
      // sovraespone → ripristina i colori base di tutte le istanze
      if (st.mesh && st.boxes) {
        for (var i = 0; i < st.boxes.length; i++) st.mesh.setColorAt(i, st.boxes[i].color);
        if (st.mesh.instanceColor) st.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  var ELEV = Math.atan(1 / Math.SQRT2), R = 60;

  V.frame = function (DUN) {
    if (!V.available() || !DUN || !DUN.cv) return false;
    try {
      ensureScene(DUN);
      // worldRev: bump quando un gate del mondo si apre (la cella si sblocca → rebuild)
      var fk = DUN.fi + ':' + (DUN.gateRoom ? 'gate' : '') + ':' + Object.keys(DUN.map).length + ':' + (DUN.worldRev || 0);
      if (st.floorKey !== fk) { st.floorKey = fk; buildFloor(DUN); }

      // eroe: lerp verso la cella logica corrente; walk se in movimento, idle se fermo
      var hero = st.dyn.hero;
      if (hero) {
        var dxh = DUN.px - st.heroW.x, dzh = DUN.py - st.heroW.z;
        st.heroW.x += dxh * 0.25;
        st.heroW.z += dzh * 0.25;
        // §21: la y insegue la quota del terreno (discese in ease-down naturale)
        var gyt = st.gy ? st.gy(st.heroW.x, st.heroW.z) : 0;
        if (st.heroW.y == null) st.heroW.y = gyt;
        st.heroW.y += (gyt - st.heroW.y) * 0.25;
        // arco di salto mezzo-seno (jumpFx da games.js, 0.32s come il proto)
        var jb = 0, jfx = DUN.jumpFx;
        if (jfx) {
          var jt = (Date.now() - jfx.t0) / (jfx.d || 320);
          if (jt >= 1) DUN.jumpFx = null; else jb = Math.sin(Math.PI * jt) * 0.45;
        }
        hero.position.set(st.heroW.x, st.heroW.y + jb, st.heroW.z);
        animateSprite(hero, (Math.abs(dxh) + Math.abs(dzh) > 0.04) ? 'walk' : 'idle');
        // flip orizzontale come nella skin 2D (il foglio LoL guarda a destra)
        if (hero.children[0]) hero.children[0].scale.x = (DUN.facing && DUN.facing[0] < 0) ? -1 : 1;
      }
      if (st.dyn.boss) animateSprite(st.dyn.boss, 'idle');
      // sorgenti estratte → attenuate (il condotto attivo resta luminoso: fast-travel)
      for (var k in DUN.sources) {
        var g = st.dyn['src:' + k]; if (!g) continue;
        var s = DUN.sources[k];
        g.userData.mat.opacity = (s.extracted && !(s.type === 'condotto' && s.open)) ? 0.35 : 1;
        g.userData.mat.transparent = true;
      }
      // mob visibili — pool per indice; sprite per specie come la 2D (_lolMobSpr)
      (DUN.mobs || []).forEach(function (mo, i) {
        var id = 'mob:' + i;
        if (!st.dyn[id]) {
          var flying = mo.name === 'Pipistrello' || mo.name === 'Ratto' || mo.name === 'Ragno';
          st.dyn[id] = spriteBillboard(flying ? 'mobBat' : 'mob');
          st.group.add(st.dyn[id]);
        }
        var g2 = st.dyn[id];
        g2.visible = !!(mo.alive && DUN.visible[mo.x + ',' + mo.y]);
        if (g2.visible) { g2.position.set(mo.x, st.gy ? st.gy(mo.x, mo.y) : 0, mo.y); animateSprite(g2, 'walk'); }
      });
      // Sapienti in movimento (npc-behavior aggiorna x/y sulla griglia): la skin li segue
      if (DUN.gardenNpcs) {
        for (var nk2 in DUN.gardenNpcs) {
          var gp2 = DUN.gardenNpcs[nk2], gn2 = st.dyn['npc:' + nk2];
          if (!gn2) continue;
          gn2.position.x += (gp2.x - gn2.position.x) * 0.18;
          gn2.position.z += (gp2.y - gn2.position.z) * 0.18;
          gn2.position.y = st.gy ? st.gy(gp2.x, gp2.y) : 0;
        }
      }
      // fog §19.3: tinta esplorato + lanterna; nascondi le celle mai esplorate?
      // (r128: niente per-instance visibility → il buio le copre già)
      markVisited(DUN.px + ',' + DUN.py);
      checkLit(DUN);
      if (st.lantern.visible) {
        st.lantern.position.set(st.heroW.x, (st.heroW.y || 0) + 2.0, st.heroW.z);
        st.lantern.intensity = 2.2 * (0.92 + 0.08 * Math.sin(Date.now() / 110));
      }
      // camera isometrica che segue l'eroe; Q/E ruota di 90° (lerp morbido, come il proto)
      // §21: segue la quota del TERRENO (heroW.y, senza il bump di salto: niente camera che rimbalza)
      st.yaw += (st.yawT - st.yaw) * 0.12;
      var cy = hero ? hero.position : new T.Vector3(DUN.px, 0, DUN.py);
      var cyy = st.heroW ? (st.heroW.y || 0) : 0;
      st.cam.position.set(cy.x + Math.cos(st.yaw) * Math.cos(ELEV) * R, cyy + Math.sin(ELEV) * R, cy.z + Math.sin(st.yaw) * Math.cos(ELEV) * R);
      st.cam.lookAt(cy.x, cyy, cy.z);
      // billboard rivolti alla camera
      var face = Math.PI / 2 - st.yaw;
      for (var d in st.dyn) st.dyn[d].rotation.y = face;
      st.renderer.render(st.scene, st.cam);
      return true;
    } catch (e) {
      console.error('[voxel-skin] frame', e);
      try { localStorage.setItem('mappai_dungeon_skin', 'lol'); } catch (e2) {}
      V.dispose();
      return false;   // il chiamante ricade sulla skin 2D
    }
  };

  // click → cella logica (raycast sul piano voxel)
  V.pick = function (event) {
    if (!st || !st.mesh) return null;
    var rect = st.canvas.getBoundingClientRect();
    var ndc = new T.Vector2(
      ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1,
      -((event.clientY - rect.top) / (rect.height || 1)) * 2 + 1);
    st.ray.setFromCamera(ndc, st.cam);
    var hits = st.ray.intersectObject(st.mesh);
    if (!hits.length) return null;
    var p = hits[0].point;
    return { x: Math.round(p.x), y: Math.round(p.z) };
  };

  V.active = function () { return !!(st && st.canvas && st.canvas.parentNode); };

  V.dispose = function () {
    if (!st) return;
    try {
      window.removeEventListener('resize', st.onResize);
      window.removeEventListener('keydown', st.onKey);
      if (st.ro) st.ro.disconnect();
      if (st.gameEl && st.onWheel) st.gameEl.removeEventListener('wheel', st.onWheel);
      if (st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas);
      st.renderer.dispose();
    } catch (e) {}
    st = null;
  };

  console.log('[MappAIDungeonVoxel] skin voxel §19 F2 caricata (sprite PNG animati; flag mappai_dungeon_skin=voxel)');
})();
