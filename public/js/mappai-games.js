/* ============================================================================
 * mappai-games.js — Dungeon Explorer (gioco di studio, v1)
 * ----------------------------------------------------------------------------
 * Trasforma il grafo dello studente (MM o KG) in un dungeon roguelike isometrico
 * 3D. La topologia resta nascosta dalla nebbia finché non si esplora; il grafo
 * "vero" emerge solo a fine piano (reveal dei link). Avatar a solidi platonici:
 *   - FORMA  = literacy (n. concetti padroneggiati)
 *   - COLORE = fluency  (bande Precision Teaching, giallo->verde->blu)
 *
 * Dati REALI:
 *   - nodi/link:  appState.db.nodes / .links  (via _getAppState)
 *   - colori:     colorScale (app.js:~6239, NON su window -> mirror sotto)
 *                 + appState.db.customColors (override utente)  -> _groupColor()
 *   - mastery:    window.MappAIMastery (.node / .masteryLevel / .record / .FLUENCY_AIM)
 *
 * Dipendenze: THREE (vendor/three.min.js). Caricato lazy: serve solo a openDungeon().
 * Pienamente reversibile: nessun edit ad app.js. Gated da flag opzionale
 * 'mappai_games_enabled' (l'apertura da console funziona comunque).
 *
 * Uso:  MappAIGames.openDungeon()        apri il gioco sul grafo corrente
 *       MappAIGames.enable()/disable()   set/unset flag localStorage
 * ==========================================================================*/
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // Mirror della colorScale di app.js (è const dentro l'IIFE, non esposta su window).
  var COLOR_SCALE = {
    0: '#0f172a', 1: '#ef4444', 2: '#f59e0b', 3: '#10b981',
    4: '#0ea5e9', 5: '#6366f1', 6: '#d946ef', 7: '#8b5cf6'
  };

  // ─────────────────────────── helpers stato/grafo ───────────────────────────
  function _getAppState() {
    try { return (typeof appState !== 'undefined') ? appState : window.appState; }
    catch (e) { return window.appState; }
  }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t); else console.log('[games]', m); }
  function _sid(l) { return typeof l.source === 'object' ? l.source.id : l.source; }
  function _tid(l) { return typeof l.target === 'object' ? l.target.id : l.target; }
  function _desc(n) { return _clean((n && (n.desc || n.content)) || ''); }

  function _hex(s) {
    if (typeof s === 'number') return s;
    s = String(s || '#6366f1').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var v = parseInt(s, 16);
    return isNaN(v) ? 0x6366f1 : v;
  }
  function _groupColor(group) {
    var st = _getAppState();
    var cc = st && st.db && st.db.customColors;
    if (cc && cc[group] != null) return _hex(cc[group]);
    if (COLOR_SCALE[group] != null) return _hex(COLOR_SCALE[group]);
    return 0x6366f1;
  }
  function _lighten(c, k) {
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { r *= (1 + k); g *= (1 + k); b *= (1 + k); }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  // ─────────────────────────── bridge Precision Teaching ─────────────────────
  function _M() { return window.MappAIMastery || null; }
  function _mnode(id) { try { return _M() ? _M().node(id) : null; } catch (e) { return null; } }
  function _level(id) { var m = _M(); return (m && m.masteryLevel) ? m.masteryLevel(_mnode(id)) : 'nuovo'; }
  function _mastered(id) { var l = _level(id); return l === 'acquisito' || l === 'fluente'; }
  function _studied(id) { var n = _mnode(id); return !!(n && n.attempts); }
  function _aim() { var m = _M(); return (m && m.FLUENCY_AIM) || 8; }
  function _fluency(id) {
    var n = _mnode(id); if (!n || !n.attempts) return 0;
    var AIM = _aim();
    var a = Math.min(n.accuracy / 0.8, 1) * 0.4, r = 0;
    if (n.accuracy >= 0.8 && n.rate != null)
      r = Math.min(n.rate / AIM, 1) * 0.4 + Math.max(0, (n.rate - AIM) / AIM) * 0.2;
    return Math.min(a + r, 1);
  }
  // v1: studio simulato (✓/✗). In futuro: lanciare le attività reali di mappai-active-study.
  function _record(id, label, ok) {
    var m = _M(); if (!m) return;
    m.record(id, label, 'dungeon', { score: ok ? 1 : 0, rate: ok ? (9 + Math.random() * 5) : (Math.random() * 3) });
  }

  // ─────────────────────────── costruzione piani dal grafo ───────────────────
  function _spiral(n) {
    var res = [[0, 0]], x = 0, z = 0, dx = 1, dz = 0, steps = 1, turn = 0;
    while (res.length < n) {
      for (var s = 0; s < steps && res.length < n; s++) { x += dx; z += dz; res.push([x, z]); }
      var ndx = -dz, ndz = dx; dx = ndx; dz = ndz; turn++; if (turn % 2 === 0) steps++;
    }
    return res;
  }
  function _layout(memberIds, adj, start) {
    var seen = {}, order = [start]; seen[start] = true;
    for (var i = 0; i < order.length; i++) {
      var cur = order[i]; (adj[cur] || []).forEach(function (nb) { if (!seen[nb]) { seen[nb] = true; order.push(nb); } });
    }
    memberIds.forEach(function (id) { if (!seen[id]) { seen[id] = true; order.push(id); } });
    var sp = _spiral(order.length), pos = {};
    order.forEach(function (id, idx) { pos[id] = { gx: sp[idx][0], gz: sp[idx][1] }; });
    return pos;
  }
  function _buildFloors() {
    var st = _getAppState();
    var nodes = (st && st.db && st.db.nodes) || [];
    var links = (st && st.db && st.db.links) || [];
    if (!nodes.length) return null;
    var mode = (st && st.extractionMode) || 'mindmap';
    function isMacro(n) {
      if (String(n.id).indexOf('COMM_') === 0) return true;
      if (mode === 'mindmap') return n.level === 1;
      return false;
    }
    var groups = {};
    nodes.forEach(function (n) {
      if (n.level === 0) return; // root escluso (sarà il boss finale concettuale)
      var g = (n.group != null) ? n.group : 1;
      if (!groups[g]) groups[g] = { group: g, macro: null, rooms: [] };
      if (isMacro(n)) groups[g].macro = n; else groups[g].rooms.push(n);
    });
    var floors = [];
    Object.keys(groups).forEach(function (gk) {
      var G = groups[gk];
      var members = G.rooms.slice();
      if (G.macro) members.unshift(G.macro);
      if (!members.length) return;
      var ids = {}; members.forEach(function (m) { ids[m.id] = true; });
      var adj = {};
      links.forEach(function (l) {
        var s = _sid(l), t = _tid(l);
        if (ids[s] && ids[t]) { (adj[s] = adj[s] || []).push(t); (adj[t] = adj[t] || []).push(s); }
      });
      var memberIds = members.map(function (m) { return m.id; });
      var start = G.macro ? G.macro.id
        : memberIds.slice().sort(function (a, b) { return (adj[b] ? adj[b].length : 0) - (adj[a] ? adj[a].length : 0); })[0];
      // garantisci connettività: stanze orfane agganciate allo start
      members.forEach(function (m) {
        if (!adj[m.id] || !adj[m.id].length) {
          (adj[start] = adj[start] || []).push(m.id); (adj[m.id] = adj[m.id] || []).push(start);
        }
      });
      floors.push({
        group: G.group,
        name: _clean((G.macro && G.macro.label) || ('Area ' + gk)),
        color: _groupColor(G.group),
        macroId: G.macro ? G.macro.id : null,
        members: members, memberIds: memberIds, adj: adj, start: start,
        pos: _layout(memberIds, adj, start),
        shape: (floors.length % 2 === 0) ? 'box' : 'cyl'
      });
    });
    if (!floors.length) return null;
    floors.sort(function (a, b) { return a.group - b.group; });
    var total = floors.reduce(function (s, f) { return s + f.members.length; }, 0);
    return { floors: floors, total: total };
  }

  // ─────────────────────────── stili + bande avatar ──────────────────────────
  var BANDS = [
    { c: 0xf5e6a8, n: 'acquisizione' }, { c: 0xc9d96a, n: 'emergente' },
    { c: 0x8fcf6a, n: 'in crescita' }, { c: 0x4fbf8f, n: 'vicino all’aim' },
    { c: 0x3aa0c9, n: 'fluente' }, { c: 0x2f6fdb, n: 'mastery' }
  ];
  function _bandOf(f) { var t = [0, .16, .33, .5, .67, .84], i = 0; for (var k = 0; k < t.length; k++) if (f >= t[k]) i = k; return i; }
  var FORMS = ['scintilla', 'linea', 'superficie', 'tetraedro', 'esaedro', 'ottaedro', 'dodecaedro', 'icosaedro', 'sfera'];
  var STYLES = {
    low:  { clear: 0xeef1f5, amb: 0x99a4b8, ambI: 0.9, dir: 0.7, floorK: 0.55, emis: 0.0, glow: false, fog: false },
    flat: { clear: 0x070a14, amb: 0x2a3346, ambI: 0.7, dir: 0.25, floorK: -0.45, emis: 0.7, glow: false, fog: true },
    glow: { clear: 0x070a14, amb: 0x2a3346, ambI: 0.6, dir: 0.2, floorK: -0.5, emis: 0.9, glow: true, fog: true }
  };

  // ─────────────────────────── motore di gioco ───────────────────────────────
  var _live = null; // istanza singola

  function openDungeon() {
    if (_live) { _toast('Dungeon già aperto', 'info'); return; }
    if (typeof THREE === 'undefined') { _toast('Three.js non caricato (js/vendor/three.min.js)', 'error'); return; }
    var data = _buildFloors();
    if (!data) { _toast('Genera prima una mappa (nessun nodo trovato)', 'warning'); return; }

    var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SP = 2.4;
    var style = (localStorage.getItem('mappai_games_style') || 'low');
    if (!STYLES[style]) style = 'low';

    // ── overlay DOM ──
    var ov = document.createElement('div');
    ov.id = 'mappai-dungeon';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#070a14;font-family:system-ui,sans-serif';
    ov.innerHTML =
      '<div id="dgC" style="position:absolute;inset:0"></div>' +
      '<div style="position:absolute;top:12px;left:12px;display:flex;gap:8px;align-items:center">' +
        '<button data-s="low"  class="dgBtn">Low-poly</button>' +
        '<button data-s="flat" class="dgBtn">Neon flat</button>' +
        '<button data-s="glow" class="dgBtn">Neon glow</button>' +
      '</div>' +
      '<button id="dgX" style="position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:8px;border:0.5px solid rgba(150,180,220,.4);background:rgba(10,15,26,.85);color:#eaf2ff;cursor:pointer;font-size:18px">✕</button>' +
      '<div id="dgFloor"  class="dgHud" style="top:58px;left:14px"></div>' +
      '<div id="dgAvatar" class="dgHud" style="top:58px;right:14px;text-align:right"></div>' +
      '<div id="dgProg"   class="dgHud" style="bottom:14px;left:14px"></div>' +
      '<div id="dgHint"   class="dgHud" style="bottom:14px;right:14px;opacity:.7">clicca una stanza adiacente · studia per evolvere</div>' +
      '<div id="dgPanel" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:320px;background:rgba(10,15,26,.95);border:0.5px solid rgba(120,160,220,.4);border-radius:12px;padding:18px;color:#eaf2ff;display:none">' +
        '<h3 id="dgPName" style="font-size:17px;font-weight:500;margin:0 0 6px;color:#fff"></h3>' +
        '<p id="dgPDesc" style="font-size:13px;line-height:1.55;margin:0 0 12px;color:#c3d2ea"></p>' +
        '<div id="dgPMeta" style="font-size:11px;color:#8fa4c4;margin:0 0 12px"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="dgBad"  class="dgQ" style="border-color:#c0432c">✗ Non la so</button>' +
          '<button id="dgGood" class="dgQ" style="border-color:#3aa0c9">✓ La so</button>' +
        '</div>' +
        '<button id="dgClose" style="margin-top:10px;width:100%;background:transparent;border:none;color:#8fa4c4;font-size:12px;cursor:pointer">chiudi</button>' +
      '</div>' +
      '<div id="dgBanner" style="position:absolute;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(10,15,26,.95);border:0.5px solid rgba(120,160,220,.5);border-radius:10px;padding:10px 16px;color:#eaf2ff;font-size:13px;display:none;align-items:center;gap:12px"><span id="dgBTxt"></span><button id="dgBBtn" style="padding:6px 12px;border-radius:8px;border:0.5px solid #3aa0c9;background:rgba(30,42,66,.8);color:#eaf2ff;cursor:pointer"></button></div>';
    var stl = document.createElement('style');
    stl.textContent =
      '#mappai-dungeon .dgBtn{padding:7px 12px;border-radius:8px;border:0.5px solid rgba(150,180,220,.4);background:rgba(10,15,26,.85);color:#eaf2ff;cursor:pointer;font-size:13px}' +
      '#mappai-dungeon .dgBtn.on{border-color:#3aa0c9;background:rgba(58,160,201,.25)}' +
      '#mappai-dungeon .dgHud{position:absolute;font-size:12px;color:#eaf2ff;text-shadow:0 1px 3px rgba(0,0,0,.85);pointer-events:none}' +
      '#mappai-dungeon .dgQ{flex:1;padding:9px;border-radius:8px;border:0.5px solid rgba(120,160,220,.4);background:rgba(30,42,66,.8);color:#eaf2ff;font-size:13px;cursor:pointer}';
    ov.appendChild(stl);
    document.body.appendChild(ov);

    var mount = ov.querySelector('#dgC');
    var W = window.innerWidth, H = window.innerHeight;

    // ── Three setup ──
    var scene = new THREE.Scene();
    var d = 9, asp = W / H;
    var cam = new THREE.OrthographicCamera(-d * asp, d * asp, d, -d, 0.1, 500);
    cam.position.set(16, 16, 16); cam.lookAt(0, 0.5, 0);
    var rnd = new THREE.WebGLRenderer({ antialias: true });
    rnd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rnd.setSize(W, H); mount.appendChild(rnd.domElement);
    var amb = new THREE.AmbientLight(0xffffff, 0.8); scene.add(amb);
    var dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(8, 16, 6); scene.add(dir);
    var floorMesh = new THREE.Mesh(new THREE.BoxGeometry(SP * 9, 0.3, SP * 9),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.95 }));
    floorMesh.position.y = -0.16; scene.add(floorMesh);
    var world = new THREE.Group(); scene.add(world);

    var glowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d'); var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
    })();
    function makeLabel(text) {
      var c = document.createElement('canvas'), s = 2; c.width = 280 * s; c.height = 64 * s;
      var g = c.getContext('2d'); g.scale(s, s);
      g.fillStyle = 'rgba(8,12,22,0.82)'; g.strokeStyle = 'rgba(150,180,220,0.5)'; g.lineWidth = 1.5;
      var rw = 272, rh = 44, rx = 4, ry = 10, r = 12;
      g.beginPath(); g.moveTo(rx + r, ry); g.arcTo(rx + rw, ry, rx + rw, ry + rh, r); g.arcTo(rx + rw, ry + rh, rx, ry + rh, r); g.arcTo(rx, ry + rh, rx, ry, r); g.arcTo(rx, ry, rx + rw, ry, r); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#eaf2ff'; g.font = '500 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      var t = String(text || ''); if (t.length > 22) t = t.slice(0, 21) + '…';
      g.fillText(t, 140, ry + rh / 2);
      var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
    }

    // ── stato run ──
    var curFloor = -1, fdata = null, roomObjs = {}, edgeLines = [], player = null;

    // avatar
    var avatar = new THREE.Group(); scene.add(avatar);
    var aMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf5e6a8, emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.9 });
    var aWire = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    var aMesh = null, aWireO = null, aStage = -1;
    var aGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    aGlow.scale.set(3.2, 3.2, 1); avatar.add(aGlow);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2.4; avatar.add(ring); var ringT = 0;

    function geoFor(s) {
      if (s === 0) return new THREE.IcosahedronGeometry(0.16, 0);
      if (s === 1) return new THREE.BoxGeometry(0.07, 1.6, 0.07);
      if (s === 2) return new THREE.CylinderGeometry(0.8, 0.8, 0.04, 3);
      if (s === 3) return new THREE.TetrahedronGeometry(0.82);
      if (s === 4) return new THREE.BoxGeometry(1.0, 1.0, 1.0);
      if (s === 5) return new THREE.OctahedronGeometry(0.86);
      if (s === 6) return new THREE.DodecahedronGeometry(0.72);
      if (s === 7) return new THREE.IcosahedronGeometry(0.78);
      return new THREE.SphereGeometry(0.78, 36, 24);
    }
    function gCounts() {
      var m = 0, sd = 0, fsum = 0, fn = 0;
      data.floors.forEach(function (f) {
        f.memberIds.forEach(function (id) {
          if (_studied(id)) { sd++; fsum += _fluency(id); fn++; }
          if (_mastered(id)) m++;
        });
      });
      return { m: m, sd: sd, f: fn ? fsum / fn : 0, total: data.total };
    }
    function stageOf(c) {
      if (c.m >= c.total) return 8;
      if (c.m === 0) return c.sd > 0 ? 1 : 0;
      var frac = c.m / c.total;
      return Math.max(2, Math.min(7, 2 + Math.round(frac * 5)));
    }
    function buildAvatar(s) {
      if (aMesh) { avatar.remove(aMesh); aMesh.geometry.dispose(); }
      if (aWireO) { avatar.remove(aWireO); aWireO.geometry.dispose(); }
      var g = geoFor(s); aMesh = new THREE.Mesh(g, aMat); avatar.add(aMesh);
      aWireO = new THREE.LineSegments(new THREE.WireframeGeometry(g), aWire); avatar.add(aWireO);
    }
    function updateAvatar() {
      var c = gCounts(), s = stageOf(c);
      if (s !== aStage) { aStage = s; buildAvatar(s); ringT = 1; }
      var bi = _bandOf(c.f), col = BANDS[bi].c;
      aMat.emissive.setHex(col); aMat.color.setHex(_lighten(col, 0.35)); aMat.emissiveIntensity = 0.3 + c.f * 0.9;
      aWire.color.setHex(_lighten(col, 0.5)); aWire.opacity = 0.3 + c.f * 0.6;
      ring.material.color.setHex(_lighten(col, 0.4));
      aGlow.material.color.setHex(col); aGlow.material.opacity = STYLES[style].glow ? (0.3 + c.f * 0.5) : 0;
      return { c: c, stage: s, band: BANDS[bi].n };
    }

    function clearFloor() {
      while (world.children.length) {
        var o = world.children[0];
        if (o.geometry) o.geometry.dispose();
        world.remove(o);
      }
      roomObjs = {}; edgeLines = [];
    }
    function loadFloor(idx) {
      clearFloor();
      curFloor = idx; fdata = data.floors[idx];
      var cx = 0, cz = 0, P = fdata.pos;
      fdata.memberIds.forEach(function (id) { cx += P[id].gx; cz += P[id].gz; });
      cx /= fdata.memberIds.length; cz /= fdata.memberIds.length;
      fdata.members.forEach(function (node) {
        var p = P[node.id], x = (p.gx - cx) * SP, z = (p.gz - cz) * SP;
        var isMacro = (node.id === fdata.macroId);
        var geo = fdata.shape === 'cyl'
          ? new THREE.CylinderGeometry(isMacro ? 0.85 : 0.7, isMacro ? 0.85 : 0.7, 1.1, 18)
          : new THREE.BoxGeometry(isMacro ? 1.5 : 1.3, 1.1, isMacro ? 1.5 : 1.3);
        var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x808a99, roughness: 0.6, metalness: 0.1, emissive: 0x000000, emissiveIntensity: 0, transparent: true, opacity: 1 }));
        m.position.set(x, 0.55, z); m.userData.id = node.id; m.userData.macro = isMacro; world.add(m);
        var eg = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.5 }));
        eg.position.copy(m.position); world.add(eg);
        var lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabel(node.label), depthTest: false, transparent: true }));
        lbl.scale.set(2.5, 0.57, 1); lbl.position.set(x, 1.55, z); world.add(lbl);
        var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: fdata.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        gl.scale.set(2.8, 2.8, 1); gl.position.set(x, 0.55, z); world.add(gl);
        roomObjs[node.id] = { node: node, mesh: m, edge: eg, label: lbl, glow: gl, x: x, z: z, revealed: false, macro: isMacro };
      });
      player = fdata.start; reveal(player); (fdata.adj[player] || []).forEach(reveal);
      var ps = roomObjs[player]; avatar.position.set(ps.x, 1.7, ps.z);
      applyStyle(); refreshRooms(); updateHUD();
    }
    function reveal(id) { if (roomObjs[id]) roomObjs[id].revealed = true; }

    function refreshRooms() {
      var s = STYLES[style];
      Object.keys(roomObjs).forEach(function (id) {
        var o = roomObjs[id], vis = o.revealed;
        o.mesh.visible = vis; o.edge.visible = vis; o.label.visible = vis; o.glow.visible = vis && s.glow;
        if (!vis) return;
        var col, em = 0, gop = 0;
        if (_mastered(id)) { col = fdata.color; em = s.emis; gop = 0.7; }
        else if (_studied(id)) { col = _lighten(fdata.color, style === 'low' ? 0.4 : -0.25); em = s.emis * 0.4; gop = 0.3; }
        else { col = style === 'low' ? 0x9aa3b2 : 0x33405a; em = 0; gop = 0; }
        o.mesh.material.color.setHex(col);
        o.mesh.material.emissive.setHex(_mastered(id) ? col : 0x000000);
        o.mesh.material.emissiveIntensity = em;
        var eCol = (id === player) ? 0xffffff : (o.macro && !_mastered(id) ? 0xffd23f : (style === 'low' ? 0x2a2f3a : _lighten(col, 0.4)));
        o.edge.material.color.setHex(eCol);
        o.edge.material.opacity = (id === player || o.macro) ? 1 : 0.5;
        o.glow.material.opacity = s.glow ? gop : 0;
      });
    }
    function revealLinks() {
      if (edgeLines.length) return;
      var seen = {};
      fdata.memberIds.forEach(function (a) {
        (fdata.adj[a] || []).forEach(function (b) {
          var k = a < b ? a + '|' + b : b + '|' + a; if (seen[k]) return; seen[k] = true;
          var ra = roomObjs[a], rb = roomObjs[b]; if (!ra || !rb) return;
          var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ra.x, 0.2, ra.z), new THREE.Vector3(rb.x, 0.2, rb.z)]);
          var ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: _lighten(fdata.color, 0.3), transparent: true, opacity: 0.85 }));
          world.add(ln); edgeLines.push(ln);
        });
      });
    }

    function updateHUD() {
      var a = updateAvatar();
      var hx = '#' + (fdata.color >>> 0).toString(16).padStart(6, '0');
      ov.querySelector('#dgFloor').innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:5px;background:' + hx + '"></span>Piano ' + (curFloor + 1) + '/' + data.floors.length + ' · ' + fdata.name;
      ov.querySelector('#dgAvatar').innerHTML = 'avatar: <b>' + FORMS[a.stage] + '</b><br>fluency: ' + a.band;
      var fm = 0; fdata.memberIds.forEach(function (id) { if (_mastered(id)) fm++; });
      ov.querySelector('#dgProg').innerHTML = 'padroneggiate: ' + fm + '/' + fdata.memberIds.length + ' (piano) · ' + a.c.m + '/' + a.c.total + ' (totale)';
      if (fm === fdata.memberIds.length) { revealLinks(); showBanner(); }
    }
    function showBanner() {
      var b = ov.querySelector('#dgBanner'), tx = ov.querySelector('#dgBTxt'), bt = ov.querySelector('#dgBBtn');
      b.style.display = 'flex';
      if (curFloor < data.floors.length - 1) {
        tx.textContent = 'Piano completato! Link rivelati.'; bt.textContent = 'Scendi ↓';
        bt.onclick = function () { b.style.display = 'none'; loadFloor(curFloor + 1); };
      } else {
        tx.textContent = 'Tutti i piani padroneggiati — sei una sfera. Grafo rivelato.'; bt.textContent = '✓';
        bt.onclick = function () { b.style.display = 'none'; };
      }
    }

    // ── pannello studio ──
    var panel = ov.querySelector('#dgPanel'), openId = null;
    function openPanel(id) {
      openId = id; var n = roomObjs[id].node;
      ov.querySelector('#dgPName').textContent = _clean(n.label) + (roomObjs[id].macro ? ' ★' : '');
      ov.querySelector('#dgPDesc').textContent = _desc(n) || '(nessuna descrizione)';
      updateMeta(); panel.style.display = 'block';
    }
    function updateMeta() {
      var n = _mnode(openId), lv = _level(openId);
      ov.querySelector('#dgPMeta').textContent = 'livello: ' + lv + (n && n.attempts
        ? (' · acc ' + Math.round(n.accuracy * 100) + '% · rate ' + (n.rate != null ? n.rate.toFixed(1) : '—') + '/min · tentativi ' + n.attempts)
        : ' · non studiata');
    }
    ov.querySelector('#dgGood').onclick = function () { if (openId) { _record(openId, roomObjs[openId].node.label, true); updateMeta(); refreshRooms(); updateHUD(); } };
    ov.querySelector('#dgBad').onclick = function () { if (openId) { _record(openId, roomObjs[openId].node.label, false); updateMeta(); refreshRooms(); updateHUD(); } };
    ov.querySelector('#dgClose').onclick = function () { panel.style.display = 'none'; openId = null; };

    // ── input ──
    var ray = new THREE.Raycaster(), pt = new THREE.Vector2();
    function onClick(e) {
      var rect = rnd.domElement.getBoundingClientRect();
      pt.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pt.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(pt, cam);
      var meshes = Object.keys(roomObjs).filter(function (id) { return roomObjs[id].revealed; }).map(function (id) { return roomObjs[id].mesh; });
      var hit = ray.intersectObjects(meshes);
      if (!hit.length) return;
      var id = hit[0].object.userData.id;
      if (id === player) { openPanel(id); return; }
      if ((fdata.adj[player] || []).indexOf(id) >= 0) {
        player = id; reveal(id); (fdata.adj[id] || []).forEach(reveal);
        refreshRooms(); updateHUD(); openPanel(id);
      }
    }
    rnd.domElement.addEventListener('click', onClick);

    // ── stile ──
    function applyStyle() {
      var s = STYLES[style]; rnd.setClearColor(s.clear, 1);
      scene.fog = s.fog ? new THREE.Fog(s.clear, 22, 50) : null;
      amb.color.setHex(s.amb); amb.intensity = s.ambI; dir.intensity = s.dir;
      floorMesh.material.color.setHex(fdata ? _lighten(fdata.color, s.floorK) : 0xdddddd);
      Array.prototype.forEach.call(ov.querySelectorAll('.dgBtn'), function (b) { b.classList.toggle('on', b.dataset.s === style); });
      refreshRooms(); updateAvatar();
    }
    Array.prototype.forEach.call(ov.querySelectorAll('.dgBtn'), function (b) {
      b.onclick = function () { style = b.dataset.s; localStorage.setItem('mappai_games_style', style); applyStyle(); };
    });

    // ── chiusura ──
    var raf = 0;
    function close() {
      cancelAnimationFrame(raf);
      rnd.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      try { rnd.dispose(); } catch (e) {}
      ov.remove(); _live = null;
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ov.querySelector('#dgX').onclick = close;
    window.addEventListener('keydown', onKey);
    function onResize() {
      var w = window.innerWidth, h = window.innerHeight;
      rnd.setSize(w, h); cam.left = -d * (w / h); cam.right = d * (w / h); cam.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    // ── start ──
    loadFloor(0);
    var t = 0;
    (function loop() {
      raf = requestAnimationFrame(loop); t += 0.016;
      if (!RM) { avatar.rotation.y += 0.012; avatar.position.y = 1.7 + Math.sin(t * 1.3) * 0.06; }
      if (ringT > 0) { ringT -= 0.02; var k = 1 - ringT; ring.scale.setScalar(0.4 + k * 2); ring.material.opacity = Math.max(0, ringT * 0.7); }
      var p = roomObjs[player]; if (p) { avatar.position.x += (p.x - avatar.position.x) * 0.15; avatar.position.z += (p.z - avatar.position.z) * 0.15; }
      rnd.render(scene, cam);
    })();

    _live = { close: close };
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // ─────────────────────────── API pubblica ──────────────────────────────────
  window.MappAIGames = {
    openDungeon: openDungeon,
    close: function () { if (_live) _live.close(); },
    enabled: function () { return localStorage.getItem('mappai_games_enabled') === '1'; },
    enable: function () { localStorage.setItem('mappai_games_enabled', '1'); console.log('%c[games] abilitato. MappAIGames.openDungeon()', 'color:#3aa0c9'); },
    disable: function () { localStorage.removeItem('mappai_games_enabled'); console.log('[games] disabilitato'); }
  };
})();
