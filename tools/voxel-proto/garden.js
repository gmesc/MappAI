import * as THREE from 'three';
import * as VM from './voxel-materials.js';

// ============================================================
// Knowledge Garden — giardino espositivo di classe (fork di proto.js)
// ------------------------------------------------------------
// Pivot 10/7/26: niente dungeon/mob/NPC. Ogni studente rivendica una
// PARCELLA (maschera di celle, disegnata dal docente nell'editor) e
// costruisce la sua mostra di un concetto della mappa mentale.
// Passeggiata (Fase 2): movimento continuo, camera iso, bordi parcella,
// muri cutaway. Creator mode (Fase 3): pittura terreno, muri ≤10,
// rilievo, oggetti, targhetta OBBLIGATORIA, bozza autosalvata.
// Fonti dati (priorità):
//   1. ?s=<token>  → GET /api/session dal server LAN del docente (Fase 4)
//   2. ?map=…      → file mappa (dev mode: &dev=1 fabbrica claim/consegne finte)
//   3. localStorage voxelproto_map (mappa dell'editor)
//   4. giardino demo procedurale
// Logica pura condivisa: window.MappAIGardenCore (mappai-garden-core.js).
// ============================================================

const GC = window.MappAIGardenCore;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Costanti (stesse del proto) ----------
const SUB = 3;
const BASE = -1.4;
const SEED = 20260710;
const JITTER = 0.16;
const STEP_UP_WALK = 0.9;
const STEP_UP_JUMP = 1.6;

const QS = new URLSearchParams(location.search);
const TOKEN = QS.get('s') || null;
const DEV = QS.get('dev') === '1';
const SIG = TOKEN || ('map:' + (QS.get('map') || 'editor'));   // chiave bozza/claim locali

const PAL = (() => {
  const def = {
    floorA: '#b9d29a', floorB: '#93b874',   // prato: il giardino è verde di default
    wallA: '#b4b0a5', wallB: '#8e8b82',
    waterA: '#4795de', waterB: '#1d5fa5',
    bg: '#e7eedd', jitter: JITTER, colorVar: 1
  };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('voxelproto_palette') || '{}')); }
  catch (e) { return def; }
})();

// ---------- Caricamento mappa + sessione ----------
function hydrateCells(size, cellsIn, fillBiome) {
  const grid = [];
  for (let z = 0; z < size; z++) {
    grid[z] = [];
    for (let x = 0; x < size; x++) {
      grid[z][x] = { x, z, biome: fillBiome, quota: 0, alt: 0, blocca: fillBiome !== 'floor' };
    }
  }
  for (const c of cellsIn || []) {
    if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.z)) continue;
    if (c.x < 0 || c.x >= size || c.z < 0 || c.z >= size) continue;
    const biome = c.biome || 'floor';
    grid[c.z][c.x] = {
      x: c.x, z: c.z, biome, quota: c.quota || 0, alt: c.alt || 0,
      blocca: c.blocca != null ? !!c.blocca : biome !== 'floor'
    };
    if (c.mat) grid[c.z][c.x].mat = c.mat;
  }
  const cells = [];
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) cells.push(grid[z][x]);
  return { grid, cells };
}

// Giardino demo: prato con laghetto, colline dolci e un muretto d'esempio
function buildDemoGarden(seed, size) {
  const rng = mulberry32(seed);
  const { grid, cells } = hydrateCells(size, [], 'floor');
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const c = grid[z][x];
    if (Math.hypot(x - size * 0.7, z - size * 0.3) < 3.1) {
      c.biome = 'water'; c.quota = -(0.35 + rng() * 0.4); c.blocca = true;
    } else {
      const hill = Math.max(0, 1 - Math.hypot(x - size * 0.25, z - size * 0.75) / 6);
      c.quota = +(hill * 0.8).toFixed(2);
    }
  }
  for (const x of [10, 11, 12]) Object.assign(grid[2][x], { biome: 'wall', alt: 2, blocca: true, quota: 0 });
  return { seed, size, sub: SUB, cells, grid, props: [], plots: null };
}

// GET /api/session dal server LAN (Fase 4): {session, template, libs, plots}
// template = giardino GIÀ unito (merged.json) — i cartelli vengono da plots.
async function loadSession() {
  if (!TOKEN) return null;
  try {
    const res = await fetch('/api/session?s=' + encodeURIComponent(TOKEN));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d || !d.template || !Array.isArray(d.template.cells)) throw new Error('sessione non valida');
    console.log('[garden] sessione', d.session && d.session.name);
    return d;
  } catch (e) {
    console.warn('[garden] sessione non raggiungibile:', e);
    document.getElementById('toast').textContent = 'Sessione non raggiungibile — chiedi al docente';
    return null;
  }
}

async function loadMapFile() {
  const name = QS.get('map');
  if (!name) return null;
  const url = name.endsWith('.json') ? name : 'maps/' + name + '.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d || !Array.isArray(d.cells)) throw new Error('formato non valido');
    console.log('[garden] mappa', url);
    return d;
  } catch (e) { console.warn('[garden] caricamento fallito', url, e); return null; }
}

function loadEditorMap() {
  try {
    const s = JSON.parse(localStorage.getItem('voxelproto_map') || 'null');
    if (!s || !Number.isInteger(s.size) || !Array.isArray(s.cells)) return null;
    return s;
  } catch (e) { return null; }
}

const SESSION = await loadSession();
const fileMap = SESSION ? null : await loadMapFile();
const rawMap = SESSION ? SESSION.template : (fileMap || loadEditorMap());
const MAP = (() => {
  if (!rawMap) return buildDemoGarden(SEED, 28);
  const size = (Number.isInteger(rawMap.size) && rawMap.size >= 4 && rawMap.size <= 64) ? rawMap.size : 28;
  // fill: le mappe curate esterne (?map=) sono legacy "tutto pavimento" come nel
  // proto; template di sessione e mappe editor omettono il void → fill 'void'
  const { grid, cells } = hydrateCells(size, rawMap.cells, fileMap ? 'floor' : 'void');
  return {
    seed: rawMap.seed || SEED, size, sub: SUB, cells, grid,
    props: Array.isArray(rawMap.props) ? rawMap.props : [],
    plots: Array.isArray(rawMap.plots) ? rawMap.plots : null,
    palette: rawMap.palette || null
  };
})();
if (MAP.palette) Object.assign(PAL, MAP.palette);
const LOGICAL = MAP.size;
const WORLD = LOGICAL * SUB;

// Snapshot del template: serve alla gomma «Ripristina» (torna alla cella originale)
const TEMPLATE_SNAP = new Map();
for (let z = 0; z < LOGICAL; z++) for (let x = 0; x < LOGICAL; x++) {
  const c = MAP.grid[z][x];
  TEMPLATE_SNAP.set(x + ',' + z, { biome: c.biome, quota: c.quota, alt: c.alt, mat: c.mat || null, blocca: c.blocca });
}

// Librerie texture/materiali/asset: UNIONE tra quelle locali del device (asset
// e texture creati dallo studente nell'editor) e quelle di sessione del docente
// (canoniche: vincono sui nomi uguali). Browser studente vergine = solo sessione.
function _localLib(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
}
const _texLib = Object.assign(_localLib('voxelproto_textures'), (SESSION && SESSION.libs && SESSION.libs.textures) || {});
const _matLib = Object.assign(_localLib('voxelproto_materials'), (SESSION && SESSION.libs && SESSION.libs.materials) || {});
const _assetLib = Object.assign(_localLib('voxelproto_assets'), (SESSION && SESSION.libs && SESSION.libs.assets) || {});

// Device: telefono/tablet = pittura terreno pessima → solo oggetti + creazione
// asset nell'editor (decisione utente 11/7/26). PC = editor full edition.
// Override per test/demo: ?mobile=1 forza il flusso telefono anche dal PC.
const IS_MOBILE = QS.get('mobile') === '1' ||
  (matchMedia('(pointer: coarse)').matches && innerWidth < 900) || innerWidth < 700;

// ---------- Parcelle ----------
function resolvePlots() {
  let plots = (SESSION && SESSION.plots) || MAP.plots;
  if (!plots || !plots.length) {
    const want = +(QS.get('plot') || 15);
    for (const ps of [want, 11, 9, 7, 5]) {
      plots = GC.computePlotGrid(LOGICAL, ps);
      if (plots.length) break;
    }
    plots = (plots || []).map(p => ({
      id: p.id,
      cells: p.cells.filter(([x, z]) => MAP.grid[z][x].biome === 'floor')
    })).filter(p => p.cells.length);
  }
  plots = plots.map(p => ({
    id: p.id, cells: p.cells,
    status: p.status || 'free', owner: p.owner || null, concept: p.concept || null
  }));
  if (DEV) { // claim/consegne finte per vedere colori bordo e cartelli
    if (plots[1]) { plots[1].status = 'claimed'; plots[1].owner = 'Ada (demo)'; }
    if (plots[2]) {
      plots[2].status = 'submitted';
      plots[2].owner = 'Bruno (demo)';
      plots[2].concept = { title: 'La fotosintesi', text: 'Demo di targhetta consegnata: le foglie trasformano luce, acqua e CO₂ in energia.', author: 'Bruno' };
    }
  }
  return plots;
}
const PLOTS = resolvePlots();
const PLOT_IDX = GC.plotIndex(PLOTS);
// pavimenti-di-parcella: servono al cutaway (i muri che li occludono diventano ghost)
const plotFloorSet = new Set();
for (const p of PLOTS) for (const [x, z] of p.cells) {
  if (MAP.grid[z] && MAP.grid[z][x] && MAP.grid[z][x].biome === 'floor') plotFloorSet.add(x + ',' + z);
}

// ---------- Scena, camera, renderer ----------
const container = document.getElementById('scene');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
const vw = () => window.innerWidth || 1280;
const vh = () => window.innerHeight || 720;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(vw(), vh());
renderer.setClearColor(PAL.bg);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
container.appendChild(renderer.domElement);

let halfH = Math.max(14, LOGICAL);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
function updateFrustum() {
  const aspect = vw() / vh();
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
updateFrustum();

const ELEV = Math.atan(1 / Math.SQRT2);
let yawCur = 45, yawFrom = 45, yawTarget = 45, yawT = 1;
const camTarget = new THREE.Vector3(0, 0, 0);
function placeCamera() {
  const yr = THREE.MathUtils.degToRad(yawCur);
  const R = 90;
  camera.position.set(
    camTarget.x + Math.cos(yr) * Math.cos(ELEV) * R,
    camTarget.y + Math.sin(ELEV) * R,
    camTarget.z + Math.sin(yr) * Math.cos(ELEV) * R
  );
  camera.lookAt(camTarget);
}
placeCamera();

// ---------- Luci (giardino sempre illuminato) ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xb5c4a4, 0.95);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xfff2dd, 2.1);
dir.position.set(26, 42, 10);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
const SHADOW_EXT = WORLD / 2 + 14;
dir.shadow.camera.left = -SHADOW_EXT; dir.shadow.camera.right = SHADOW_EXT;
dir.shadow.camera.top = SHADOW_EXT; dir.shadow.camera.bottom = -SHADOW_EXT;
dir.shadow.camera.near = 1; dir.shadow.camera.far = 160;
dir.shadow.bias = -0.001;
dir.shadow.normalBias = 0.5;
scene.add(dir);
scene.add(dir.target);
const dirOffset = dir.position.clone();

// ============================================================
// TERRENO RICOSTRUIBILE — buildTerrain() è l'unico proprietario di
// geometria E collisioni: il creator mode lo richiama a ogni tratto,
// così griglia visiva e griglia di gioco non possono divergere (rischio #2).
// ============================================================
function cellWorld(l) { return (l + 0.5) * SUB - WORLD / 2; }

const cFloorA = new THREE.Color(PAL.floorA), cFloorB = new THREE.Color(PAL.floorB);
const cWallA = new THREE.Color(PAL.wallA), cWallB = new THREE.Color(PAL.wallB);
const cWaterA = new THREE.Color(PAL.waterA), cWaterB = new THREE.Color(PAL.waterB);

let solidMesh = null, waterMesh = null, matOverlayGroup = null, paintPlane = null;
let wallSolidMesh = null, wallGhostMesh = null;
let solidBoxes = [], waterBoxes = [], waterAnim = [], wallBoxes = [], wallCells = [];
const wallGhostMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false });
const wallSolidMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

function _liquidPhase(cx, cz) { return ((cx * 12.9898 + cz * 78.233) % 6.2831); }
const _cellRefs = (cell) => (cell.mat && _matLib[cell.mat] && _matLib[cell.mat].faces) || null;
const _isWallAt = (x, z) => {
  const r = MAP.grid[z];
  return !!(r && r[x] && r[x].biome === 'wall');
};
// muro "ghostabile" = adiacente a un pavimento di parcella (cutaway, decisione 6)
function isGhostableWall(x, z) {
  return plotFloorSet.has((x + 1) + ',' + z) || plotFloorSet.has((x - 1) + ',' + z)
    || plotFloorSet.has(x + ',' + (z + 1)) || plotFloorSet.has(x + ',' + (z - 1));
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
function buildInstanced(list, material) {
  const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
  const m = new THREE.Matrix4();
  list.forEach((b, idx) => {
    const h = b.y1 - b.y0;
    m.makeScale(b.sx, h, b.sz);
    m.setPosition(b.x, b.y0 + h / 2, b.z);
    mesh.setMatrixAt(idx, m);
    mesh.setColorAt(idx, b.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// Muri cutaway "una faccia" (decisione 6): due InstancedMesh ricostruite a ogni
// snap 90° — i muri che occluderebbero l'interno di una parcella (wallVisibility,
// logica pura testata) diventano ghost trasparenti. Le collisioni NON cambiano.
function rebuildWalls() {
  const yr = THREE.MathUtils.degToRad(((yawTarget % 360) + 360) % 360);
  const forward = [-Math.cos(yr), -Math.sin(yr)];
  const ghost = GC.wallVisibility(wallCells, plotFloorSet, forward);
  const solid = [], ghosted = [];
  for (const wb of wallBoxes) (ghost.has(wb.cellKey) ? ghosted : solid).push(wb.box);
  if (wallSolidMesh) { scene.remove(wallSolidMesh); wallSolidMesh.dispose(); }
  if (wallGhostMesh) { scene.remove(wallGhostMesh); wallGhostMesh.dispose(); }
  wallSolidMesh = buildInstanced(solid, wallSolidMat);
  wallSolidMesh.castShadow = true; wallSolidMesh.receiveShadow = true; wallSolidMesh.frustumCulled = false;
  wallGhostMesh = buildInstanced(ghosted, wallGhostMat);
  wallGhostMesh.frustumCulled = false;
  scene.add(wallSolidMesh); scene.add(wallGhostMesh);
}

function buildTerrain() {
  if (solidMesh) { scene.remove(solidMesh); solidMesh.dispose(); }
  if (waterMesh) { scene.remove(waterMesh); waterMesh.dispose(); }
  if (matOverlayGroup) scene.remove(matOverlayGroup);
  solidBoxes = []; waterBoxes = []; waterAnim = []; wallBoxes = []; wallCells = [];
  const rngGeo = mulberry32(MAP.seed ^ 0xBEEF);
  const batch = VM.makeQuadBatcher(_texLib);

  for (let lz = 0; lz < LOGICAL; lz++) for (let lx = 0; lx < LOGICAL; lx++) {
    const cell = MAP.grid[lz][lx];
    if (cell.biome === 'void') continue;
    const bx = lx * SUB - WORLD / 2, bz = lz * SUB - WORLD / 2;
    if (cell.biome === 'water') {
      const wb = {
        x: bx + SUB / 2, z: bz + SUB / 2, y0: BASE + 0.05, y1: cell.quota,
        sx: SUB, sz: SUB,
        color: cWaterA.clone().lerp(cWaterB, Math.min(1, (-cell.quota - 0.3) / 0.5))
      };
      waterAnim.push({ i: waterBoxes.length, y0: wb.y0, y1: wb.y1, sx: SUB, sz: SUB, x: wb.x, z: wb.z, ph: _liquidPhase(lx, lz) });
      waterBoxes.push(wb);
      continue;
    }
    const refs = _cellRefs(cell);
    const cellSeed = 'cell|' + lx + ',' + lz;
    const cellKey = lx + ',' + lz;
    const ghostable = cell.biome === 'wall' && isGhostableWall(lx, lz);
    if (cell.biome === 'wall') wallCells.push({ x: lx, z: lz });
    for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
      const x = bx + i + 0.5, z = bz + j + 0.5;
      if (cell.biome === 'floor') {
        const top = cell.quota + rngGeo() * PAL.jitter;
        solidBoxes.push({ x, z, y0: BASE, y1: top, sx: 1, sz: 1, color: cFloorA.clone().lerp(cFloorB, rngGeo() * PAL.colorVar) });
        if (refs) {
          const ref = refs.top !== undefined ? refs.top : refs.all;
          if (ref) batch.add(ref, cellSeed, VM.topQuad(bx + i, bz + j, 1, top + 0.006),
            [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
        }
      } else { // wall: basamento nel batch solido, colonne nel batch muri (cutaway)
        solidBoxes.push({ x, z, y0: BASE, y1: 0, sx: 1, sz: 1, color: cWallB.clone() });
        for (let k = 0; k < cell.alt; k++) {
          const topJ = (k === cell.alt - 1 && !refs) ? rngGeo() * 0.12 : (k === cell.alt - 1 ? (rngGeo(), 0) : 0);
          wallBoxes.push({ cellKey, box: { x, z, y0: k, y1: k + 1 + topJ, sx: 1, sz: 1, color: cWallA.clone().lerp(cWallB, rngGeo() * PAL.colorVar) } });
        }
        // texture sul muro solo se NON ghostabile: i quad del batcher sono statici
        // e non possono seguire il ghost per-yaw
        if (refs && !ghostable) {
          const topRef = refs.top !== undefined ? refs.top : refs.all;
          if (topRef) batch.add(topRef, cellSeed, VM.topQuad(bx + i, bz + j, 1, cell.alt + 0.006),
            [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
        }
      }
    }
    if (cell.biome === 'wall' && refs && !ghostable) {
      const sideRef = refs.side !== undefined ? refs.side : refs.all;
      if (sideRef) {
        const dirs = [
          { d: 'nord', nx: lx, nz: lz - 1 }, { d: 'sud', nx: lx, nz: lz + 1 },
          { d: 'ovest', nx: lx - 1, nz: lz }, { d: 'est', nx: lx + 1, nz: lz }
        ];
        for (const { d, nx, nz } of dirs) {
          if (_isWallAt(nx, nz)) continue;
          for (let i = 0; i < SUB; i++) {
            const sx0 = (d === 'nord' || d === 'sud') ? bx + i : bx;
            const sz0 = (d === 'ovest' || d === 'est') ? bz + i : bz;
            const off = 0.004;
            const q = VM.sideQuad(
              sx0 + (d === 'ovest' ? -off : d === 'est' ? off : 0),
              sz0 + (d === 'nord' ? -off : d === 'sud' ? off : 0),
              1, 0, cell.alt, d);
            batch.add(sideRef, cellSeed + '|' + d, q,
              [[i / SUB, 0], [i / SUB, cell.alt], [(i + 1) / SUB, cell.alt], [(i + 1) / SUB, 0]]);
          }
        }
      }
    }
  }

  solidMesh = buildInstanced(solidBoxes, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  solidMesh.frustumCulled = false;
  scene.add(solidMesh);

  waterMesh = buildInstanced(waterBoxes, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }));
  waterMesh.receiveShadow = true;
  waterMesh.frustumCulled = false;
  scene.add(waterMesh);

  matOverlayGroup = new THREE.Group();
  batch.buildMeshes().forEach(m => { m.frustumCulled = false; matOverlayGroup.add(m); });
  scene.add(matOverlayGroup);

  if (!paintPlane) {   // piano invisibile per il raycast di pittura (statico)
    paintPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    paintPlane.rotation.x = -Math.PI / 2;
    scene.add(paintPlane);
  }
  rebuildWalls();
}
buildTerrain();

// ---------- Bordi parcella ----------
const PLOT_COLORS = { free: 0x3fbf62, claimed: 0xe4b83a, submitted: 0x4a90e4, mine: 0x9ff0b0 };
const plotBorderObjs = {};
function plotBorderY(plot) {
  let q = 0;
  for (const [x, z] of plot.cells) {
    const c = MAP.grid[z] && MAP.grid[z][x];
    if (c && c.biome === 'floor') q = Math.max(q, c.quota);
  }
  return q + 0.32;
}
function buildPlotBorder(plot) {
  const segs = GC.plotPerimeter(plot);
  const y = plotBorderY(plot);
  const pos = [];
  for (const s of segs) {
    pos.push(s.x1 * SUB - WORLD / 2, y, s.z1 * SUB - WORLD / 2);
    pos.push(s.x2 * SUB - WORLD / 2, y, s.z2 * SUB - WORLD / 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: PLOT_COLORS[plot.status] || PLOT_COLORS.free }));
  line.frustumCulled = false;
  scene.add(line);
  plotBorderObjs[plot.id] = line;
}
PLOTS.forEach(buildPlotBorder);
function setPlotStatus(id, status, owner) {
  const p = PLOTS.find(p => p.id === id);
  if (!p) return;
  p.status = status;
  if (owner !== undefined) p.owner = owner;
  const line = plotBorderObjs[id];
  if (line) line.material.color.set(PLOT_COLORS[status] || PLOT_COLORS.free);
}

// ---------- Cartelli targhetta (🪧) ----------
// Billboard canvas col titolo del concetto, al centro della parcella consegnata.
// Click sul cartello → overlay con targhetta completa.
const signMeshes = [];   // { mesh, plot }
function signTexture(title) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c2 = cv.getContext('2d');
  c2.fillStyle = '#6d4f2b'; c2.fillRect(112, 64, 32, 64);            // palo
  c2.fillStyle = '#a9825a'; c2.fillRect(8, 8, 240, 76);              // tavola
  c2.strokeStyle = '#6d4f2b'; c2.lineWidth = 6; c2.strokeRect(8, 8, 240, 76);
  c2.fillStyle = '#2b1f10'; c2.font = 'bold 22px sans-serif';
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  const words = String(title || '').split(/\s+/);
  const lines = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 18) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  lines.slice(0, 3).forEach((ln, i) => c2.fillText(ln, 128, 46 - (Math.min(lines.length, 3) - 1) * 12 + i * 24));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function plotCenter(plot) {
  let sx = 0, sz = 0;
  for (const [x, z] of plot.cells) { sx += x; sz += z; }
  return { x: sx / plot.cells.length, z: sz / plot.cells.length };
}
function rebuildSigns() {
  for (const s of signMeshes) { scene.remove(s.mesh); }
  signMeshes.length = 0;
  for (const p of PLOTS) {
    if (p.status !== 'submitted' || !p.concept || !p.concept.title) continue;
    const c = plotCenter(p);
    const geo = new THREE.PlaneGeometry(3.4, 1.7);
    geo.translate(0, 2.2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: signTexture(p.concept.title), transparent: true, side: THREE.DoubleSide
    }));
    mesh.position.set((c.x + 0.5) * SUB - WORLD / 2, plotBorderY(p), (c.z + 0.5) * SUB - WORLD / 2);
    mesh.frustumCulled = false;
    scene.add(mesh);
    signMeshes.push({ mesh, plot: p });
  }
}
rebuildSigns();
function openSign(plot) {
  document.getElementById('sign-title').textContent = '🪧 ' + plot.concept.title;
  document.getElementById('sign-text').textContent = plot.concept.text || '';
  document.getElementById('sign-author').textContent = '— ' + (plot.concept.author || plot.owner || '');
  document.getElementById('sign-modal').style.display = 'flex';
}
document.getElementById('sign-close').addEventListener('click', () => {
  document.getElementById('sign-modal').style.display = 'none';
});

// ---------- Props del template + oggetti dello studente ----------
const _propGeoCache = {}, _propMatCache = {};
const pGeo = (s) => _propGeoCache[s] || (_propGeoCache[s] = new THREE.BoxGeometry(s, s, s));
const pMat = (c) => _propMatCache[c] || (_propMatCache[c] = new THREE.MeshLambertMaterial({ color: c }));
const propBillboards = [], propBobs = [];
function buildPropGroup(props, group) {
  for (const prop of props || []) {
    const ox = (prop.x + 0.5) * SUB - WORLD / 2;
    const oz = (prop.z + 0.5) * SUB - WORLD / 2;
    const baseCell = MAP.grid[Math.floor(prop.z)] && MAP.grid[Math.floor(prop.z)][Math.floor(prop.x)];
    const by = (baseCell ? baseCell.quota : 0) + (prop.yOff || 0);
    const g = new THREE.Group();
    g.position.set(ox, by, oz);
    g.rotation.y = THREE.MathUtils.degToRad(prop.rot || 0);
    if (prop.scale && prop.scale !== 1) g.scale.setScalar(prop.scale);
    let topY = 0, ci = 0;
    for (const c of prop.cubes || []) {
      const s = c.s || 1;
      const six = VM.cubeMaterialArray(c, _matLib, _texLib, 'prop|' + prop.x + ',' + prop.z + '|' + (ci++));
      const mesh = new THREE.Mesh(pGeo(s), six || pMat(c.c || '#8f563b'));
      mesh.position.set(c.x, c.y, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      if (c.y > topY) topY = c.y;
    }
    if (prop.light) {
      const L = prop.light;
      const pl = new THREE.PointLight(L.color || '#ffd9a0', L.intensity != null ? L.intensity : 1.6, L.range || 6, 1.8);
      pl.position.set(0, topY + 0.4, 0);
      g.add(pl);
    }
    if (prop.billboard) propBillboards.push(g);
    if ((prop.yOff || 0) > 0.05) propBobs.push({ g, baseY: by, ph: (ox * 7 + oz * 13) % 6.28 });
    group.add(g);
    if (baseCell && !prop.walkable) baseCell.blocca = true;
  }
}
const propsGroup = new THREE.Group();
buildPropGroup(MAP.props, propsGroup);
scene.add(propsGroup);

// oggetti piazzati dallo studente nella SUA parcella (ricostruiti a ogni modifica)
let myProps = [];
let myPropsGroup = new THREE.Group();
scene.add(myPropsGroup);
function rebuildMyProps() {
  scene.remove(myPropsGroup);
  propBillboards.length = 0; propBobs.length = 0;   // ricostruiti da entrambi i gruppi
  myPropsGroup = new THREE.Group();
  // ripristina blocca dalle celle (i prop del template lo re-impostano sotto)
  buildPropGroup(myProps, myPropsGroup);
  scene.add(myPropsGroup);
}

// ---------- Eroe (sprite billboard, come nel proto) ----------
const ASSETS = '../../public/assets/';
const texLoader = new THREE.TextureLoader();
function spriteTex(url, px, py, pw, ph, W, H) {
  const t = texLoader.load(ASSETS + url, undefined, undefined,
    () => console.warn('Texture non caricata:', url));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  const inset = 0.1;
  t.repeat.set((pw - 2 * inset) / W, (ph - 2 * inset) / H);
  t.offset.set((px + inset) / W, 1 - (py + ph - inset) / H);
  return t;
}
const billboards = [];
function makeBillboard(tex, size, aspect = 1) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size * aspect, size);
  geo.translate(0, size / 2, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(geo, mat);
  plane.castShadow = true;
  plane.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5
  });
  group.add(plane);
  billboards.push(group);
  scene.add(group);
  return group;
}

function floorTopY(lx, lz) {
  const cx = Math.min(LOGICAL - 1, Math.max(0, Math.floor(lx)));
  const cz = Math.min(LOGICAL - 1, Math.max(0, Math.floor(lz)));
  return MAP.grid[cz][cx].quota + 0.18;
}

const hero = makeBillboard(
  spriteTex('rogue8x8/Girl-Melee.png', 0, 0, 8, 8, 26, 107), 2.2, 1);

// Spawn: prima cella pavimento libera più vicina al centro
let spawn = null;
{
  const c = Math.floor(LOGICAL / 2);
  let best = Infinity;
  for (let z = 0; z < LOGICAL; z++) for (let x = 0; x < LOGICAL; x++) {
    if (MAP.grid[z][x].blocca) continue;
    const d = (x - c) * (x - c) + (z - c) * (z - c);
    if (d < best) { best = d; spawn = { x, z }; }
  }
  if (!spawn) spawn = { x: 0, z: 0 };
}
const heroState = { wx: cellWorld(spawn.x), wz: cellWorld(spawn.z), path: [], keys: new Set(), jumpT: 1 };
hero.position.set(heroState.wx, floorTopY(spawn.x, spawn.z), heroState.wz);
camTarget.set(heroState.wx, hero.position.y, heroState.wz);
placeCamera();

// ---------- Movimento (identico al proto: continuo, quota-aware) ----------
const HERO_SPEED = 7.5;
const HERO_R = 0.42;

function cellAt(wx, wz) {
  const lx = Math.floor((wx + WORLD / 2) / SUB);
  const lz = Math.floor((wz + WORLD / 2) / SUB);
  if (lx < 0 || lz < 0 || lx >= LOGICAL || lz >= LOGICAL) return null;
  return MAP.grid[lz][lx];
}

function stepKind(quotaRef, wx, wz) {
  let jump = false;
  for (const [ox, oz] of [[HERO_R, 0], [-HERO_R, 0], [0, HERO_R], [0, -HERO_R]]) {
    const c = cellAt(wx + ox, wz + oz);
    if (!c || c.blocca) return 'blocked';
    const rise = c.quota - quotaRef;
    if (rise > STEP_UP_JUMP) return 'blocked';
    if (rise > STEP_UP_WALK) jump = true;
  }
  return jump ? 'jump' : 'walk';
}

// Collisione DIREZIONALE per un singolo asse (fix del blocco contro i muri):
// campiona solo il fronte nella direzione del movimento, così scivoli lungo un
// muro invece di incastrarti. `airborne` (salto) alza il tetto di salita.
// px,pz = posizione candidata sull'asse; dirx,dirz = versore del movimento (±1,0).
function axisKind(quotaRef, px, pz, dirx, dirz, airborne) {
  const upWalk = airborne ? STEP_UP_JUMP : STEP_UP_WALK;
  const upMax = STEP_UP_JUMP;
  let jump = false;
  // fronte + due spigoli laterali arretrati di mezzo raggio (evita di infilarsi
  // negli angoli senza bloccare lo scorrimento parallelo)
  const samples = dirx !== 0
    ? [[px + dirx * HERO_R, pz], [px + dirx * HERO_R, pz + HERO_R * 0.5], [px + dirx * HERO_R, pz - HERO_R * 0.5]]
    : [[px, pz + dirz * HERO_R], [px + HERO_R * 0.5, pz + dirz * HERO_R], [px - HERO_R * 0.5, pz + dirz * HERO_R]];
  for (const [sx, sz] of samples) {
    const c = cellAt(sx, sz);
    if (!c || c.blocca) return 'blocked';
    const rise = c.quota - quotaRef;
    if (rise > upMax) return 'blocked';
    if (rise > upWalk) jump = true;
  }
  return jump ? 'jump' : 'walk';
}

function findPath(sx, sz, tx, tz) {
  const key = (x, z) => z * LOGICAL + x;
  const prev = new Map([[key(sx, sz), -1]]);
  const queue = [[sx, sz]];
  while (queue.length) {
    const [x, z] = queue.shift();
    if (x === tx && z === tz) break;
    const cq = MAP.grid[z][x].quota;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= LOGICAL || nz >= LOGICAL) continue;
      const c = MAP.grid[nz][nx];
      if (c.blocca || (c.quota - cq) > STEP_UP_JUMP) continue;
      if (prev.has(key(nx, nz))) continue;
      prev.set(key(nx, nz), key(x, z));
      queue.push([nx, nz]);
    }
  }
  if (!prev.has(key(tx, tz))) return null;
  const path = [];
  let cur = key(tx, tz);
  while (cur !== -1) {
    path.unshift({ x: cellWorld(cur % LOGICAL), z: cellWorld(Math.floor(cur / LOGICAL)) });
    cur = prev.get(cur);
  }
  path.shift();
  return path;
}

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.55, 24),
  new THREE.MeshBasicMaterial({ color: 0x2f6db8, transparent: true, opacity: 0 })
);
marker.rotation.x = -Math.PI / 2;
scene.add(marker);
let markerLife = 0;
function showMarker(x, y, z) { marker.position.set(x, y, z); markerLife = 1; }

const raycaster = new THREE.Raycaster();
function _ndc(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width || vw();
  const h = rect.height || vh();
  return new THREE.Vector2(
    ((clientX - rect.left) / w) * 2 - 1,
    -((clientY - rect.top) / h) * 2 + 1
  );
}

function clickAt(clientX, clientY) {
  raycaster.setFromCamera(_ndc(clientX, clientY), camera);
  // prima i cartelli: click sul cartello = leggi la targhetta
  const signHit = raycaster.intersectObjects(signMeshes.map(s => s.mesh));
  if (signHit.length) {
    const s = signMeshes.find(s => s.mesh === signHit[0].object);
    if (s) { openSign(s.plot); return 'cartello'; }
  }
  const targets = [solidMesh, waterMesh, wallSolidMesh, wallGhostMesh].filter(Boolean);
  const hits = raycaster.intersectObjects(targets);
  if (!hits.length) return 'nessun hit';
  const p = hits[0].point;
  const cell = cellAt(p.x, p.z);
  if (!cell) return 'fuori mappa';
  if (cell.blocca) {
    toast(cell.biome === 'water' ? 'Acqua: non raggiungibile' : 'Destinazione bloccata');
    return 'bloccata';
  }
  const from = cellAt(heroState.wx, heroState.wz);
  const path = findPath(from.x, from.z, cell.x, cell.z);
  if (!path) { toast('Percorso non trovato'); return 'no path'; }
  if (path.length) path[path.length - 1] = { x: p.x, z: p.z };
  else path.push({ x: p.x, z: p.z });
  heroState.path = path;
  showMarker(p.x, cell.quota + PAL.jitter + 0.04, p.z);
  return 'ok';
}

function moveHero(dt) {
  let dirv = null;
  const k = heroState.keys;
  const ix = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
  const iy = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
  if (ix || iy) {
    heroState.path.length = 0;
    const yr = THREE.MathUtils.degToRad(yawCur);
    const f = { x: -Math.cos(yr), z: -Math.sin(yr) };
    const r = { x: -f.z, z: f.x };
    dirv = { x: f.x * iy + r.x * ix, z: f.z * iy + r.z * ix };
  } else if (heroState.path.length) {
    let wp = heroState.path[0];
    while (wp) {
      const d = Math.hypot(wp.x - heroState.wx, wp.z - heroState.wz);
      const arrive = heroState.path.length === 1 ? 0.18 : 0.85;
      if (d < arrive) { heroState.path.shift(); wp = heroState.path[0]; }
      else break;
    }
    if (wp) dirv = { x: wp.x - heroState.wx, z: wp.z - heroState.wz };
  }
  if (!dirv) return;
  const len = Math.hypot(dirv.x, dirv.z) || 1;
  const step = HERO_SPEED * dt;
  const q = (cellAt(heroState.wx, heroState.wz) || { quota: 0 }).quota;
  const airborne = heroState.jumpT < 1;   // durante il salto si superano rialzi più alti
  const dx = dirv.x / len, dz = dirv.z / len;
  const nx = heroState.wx + dx * step;
  const nz = heroState.wz + dz * step;
  let moved = false, jumped = false;
  // collisione DIREZIONALE separata per asse → scivolamento lungo i muri (no incastri)
  if (dx !== 0) {
    const kx = axisKind(q, nx, heroState.wz, Math.sign(dx), 0, airborne);
    if (kx !== 'blocked') { heroState.wx = nx; moved = true; if (kx === 'jump') jumped = true; }
  }
  if (dz !== 0) {
    const kz = axisKind(q, heroState.wx, nz, 0, Math.sign(dz), airborne);
    if (kz !== 'blocked') { heroState.wz = nz; moved = true; if (kz === 'jump') jumped = true; }
  }
  if (jumped && heroState.jumpT >= 1) heroState.jumpT = 0;
  if (!moved && heroState.path.length) {
    const wasLast = heroState.path.length <= 1;
    heroState.path.length = 0;
    if (!wasLast) toast('Percorso bloccato');
  }
  hero.position.x = heroState.wx;
  hero.position.z = heroState.wz;
}

// ============================================================
// CREATOR MODE — costruzione dentro la propria parcella (Fase 3)
// ============================================================
const creator = {
  active: false,
  tool: 'floor',           // floor | water | wall | bump | asset | erase
  alt: 2,                  // altezza muro 1..10 (LIMITS.maxWallAlt)
  bumpDir: 1,
  myPlotId: null,
  myName: null
};
const deviceId = (() => {
  let id = localStorage.getItem('garden_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('garden_device_id', id);
  }
  return id;
})();
const draftKey = () => 'garden_draft::' + SIG + '::' + creator.myPlotId;
const claimKey = () => 'garden_claim::' + SIG;

function myPlot() { return PLOTS.find(p => p.id === creator.myPlotId) || null; }
function myMask() { return creator.myPlotId ? PLOT_IDX.byId[creator.myPlotId] : null; }

// --- selects della palette dai materiali/asset del docente ---
function fillMatSelect(sel) {
  const s = document.getElementById(sel);
  Object.keys(_matLib).sort().forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    s.appendChild(o);
  });
}
fillMatSelect('t-mat');
fillMatSelect('t-wallmat');
{
  const s = document.getElementById('t-asset-sel');
  const names = Object.keys(_assetLib).sort();
  if (!names.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— nessun oggetto in libreria —';
    s.appendChild(o);
  } else names.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    s.appendChild(o);
  });
}

// --- strumenti ---
const TOOLS = ['floor', 'water', 'wall', 'bump', 'asset', 'erase'];
function toolSync() {
  for (const t of TOOLS) document.getElementById('t-' + t).classList.toggle('active', creator.tool === t);
  document.getElementById('t-mat-row').style.display = creator.tool === 'floor' ? '' : 'none';
  document.getElementById('t-wall-row').style.display = creator.tool === 'wall' ? '' : 'none';
  document.getElementById('t-bump-row').style.display = creator.tool === 'bump' ? '' : 'none';
  document.getElementById('t-asset-row').style.display = creator.tool === 'asset' ? '' : 'none';
}
for (const t of TOOLS) {
  document.getElementById('t-' + t).addEventListener('click', () => { creator.tool = t; toolSync(); });
}
document.getElementById('t-alt').addEventListener('input', () => {
  creator.alt = +document.getElementById('t-alt').value;
  document.getElementById('v-alt').textContent = creator.alt;
});
document.getElementById('t-bump-up').addEventListener('click', () => {
  creator.bumpDir = 1;
  document.getElementById('t-bump-up').classList.add('active');
  document.getElementById('t-bump-down').classList.remove('active');
});
document.getElementById('t-bump-down').addEventListener('click', () => {
  creator.bumpDir = -1;
  document.getElementById('t-bump-down').classList.add('active');
  document.getElementById('t-bump-up').classList.remove('active');
});

// --- pittura: raycast → cella → guard maschera → applica → rebuild ---
let paintingDrag = false, lastPaintKey = '', lastOutsideToast = 0;
function paintAt(clientX, clientY) {
  raycaster.setFromCamera(_ndc(clientX, clientY), camera);
  const targets = [paintPlane, solidMesh, waterMesh, wallSolidMesh, wallGhostMesh].filter(Boolean);
  const hits = raycaster.intersectObjects(targets);
  if (!hits.length) return;
  const pt = hits[0].point;
  const lx = Math.floor((pt.x + WORLD / 2) / SUB);
  const lz = Math.floor((pt.z + WORLD / 2) / SUB);
  if (lx < 0 || lz < 0 || lx >= LOGICAL || lz >= LOGICAL) return;
  const mask = myMask();
  if (!mask || !mask.has(lx + ',' + lz)) {
    const now = performance.now();
    if (now - lastOutsideToast > 900) { lastOutsideToast = now; toast('🌿 Fuori dal tuo giardino'); }
    return;
  }
  const cell = MAP.grid[lz][lx];
  const t = creator.tool;

  if (t === 'bump') {   // rilievo con throttle (come nell'editor)
    const now = performance.now();
    if (now - (paintAt._bumpT || 0) < 70) return;
    paintAt._bumpT = now;
    const R = 2;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = lx + dx, z = lz + dz;
      if (!mask.has(x + ',' + z)) continue;   // il rilievo resta nella parcella
      const c = MAP.grid[z][x];
      if (c.biome !== 'floor') continue;
      const d = Math.hypot(dx, dz);
      if (d > R + 0.5) continue;
      const falloff = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, d / (R + 0.5)));
      c.quota = Math.max(GC.LIMITS.quotaMin, Math.min(GC.LIMITS.quotaMax, +(c.quota + creator.bumpDir * 0.15 * falloff).toFixed(3)));
    }
    afterEdit();
    return;
  }

  if (t === 'asset') {
    const name = document.getElementById('t-asset-sel').value;
    if (!name || !_assetLib[name]) { toast('Nessun oggetto in libreria'); return; }
    const meta = _assetLib[name];
    const surf = meta.surface || 'floor';
    if (cell.biome === 'wall') { toast('Gli oggetti vanno su prato o acqua'); return; }
    if (surf === 'floor' && cell.biome !== 'floor') { toast('«' + name + '» va sul prato'); return; }
    if (surf === 'water' && cell.biome !== 'water') { toast('«' + name + '» va sull\'acqua'); return; }
    if (myProps.length >= GC.LIMITS.maxProps) { toast('Limite oggetti raggiunto (' + GC.LIMITS.maxProps + ')'); return; }
    const ax = +(((pt.x + WORLD / 2) / SUB) - 0.5).toFixed(2);
    const az = +(((pt.z + WORLD / 2) / SUB) - 0.5).toFixed(2);
    const inst = { name, x: ax, z: az, cubes: meta.cubes || [] };
    const rot = +document.getElementById('t-rot').value || 0;
    if (rot) inst.rot = rot;
    if (meta.yOff > 0) inst.yOff = meta.yOff;
    if (meta.billboard) inst.billboard = true;
    if (meta.walkable) inst.walkable = true;
    if (meta.light) inst.light = meta.light;
    myProps.push(inst);
    rebuildMyProps();
    saveDraft();
    return;
  }

  const key = lx + ',' + lz + ',' + t;
  if (key === lastPaintKey && t !== 'erase') return;
  lastPaintKey = key;

  if (t === 'erase') {   // ripristina la cella dal template + togli i miei oggetti lì
    const snap = TEMPLATE_SNAP.get(lx + ',' + lz);
    if (snap) {
      Object.assign(cell, { biome: snap.biome, quota: snap.quota, alt: snap.alt, blocca: snap.blocca });
      if (snap.mat) cell.mat = snap.mat; else delete cell.mat;
    }
    const before = myProps.length;
    myProps = myProps.filter(p => Math.floor(p.x) !== lx || Math.floor(p.z) !== lz);
    if (myProps.length !== before) rebuildMyProps();
    afterEdit();
    return;
  }

  if (t === 'floor') {
    Object.assign(cell, { biome: 'floor', quota: cell.biome === 'floor' ? cell.quota : 0, alt: 0, blocca: false });
    const mat = document.getElementById('t-mat').value;
    if (mat) cell.mat = mat; else delete cell.mat;
  } else if (t === 'water') {
    const h = mulberry32(lx * 7349 + lz * 131)();
    Object.assign(cell, { biome: 'water', quota: -(0.35 + h * 0.4), alt: 0, blocca: true });
    delete cell.mat;
  } else if (t === 'wall') {
    Object.assign(cell, { biome: 'wall', quota: 0, alt: creator.alt, blocca: true });
    const mat = document.getElementById('t-wallmat').value;
    if (mat) cell.mat = mat; else delete cell.mat;
  }
  afterEdit();
}
function afterEdit() {
  buildTerrain();          // geometria E collisioni insieme (mai divergenti)
  saveDraft();
}

// --- bozza autosalvata (refresh-proof) ---
function collectMyCells() {
  const out = [];
  const p = myPlot();
  if (!p) return out;
  for (const [x, z] of p.cells) {
    const c = MAP.grid[z][x];
    const cellOut = { x, z, biome: c.biome, quota: c.quota, alt: c.alt };
    if (c.mat) cellOut.mat = c.mat;
    out.push(cellOut);
  }
  return out;
}
function saveDraft() {
  if (!creator.myPlotId) return;
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ cells: collectMyCells(), props: myProps }));
  } catch (e) { console.warn('bozza non salvata', e); }
}
function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (!d) return false;
    const mask = myMask();
    for (const c of d.cells || []) {
      if (!mask.has(c.x + ',' + c.z)) continue;
      const cell = MAP.grid[c.z][c.x];
      Object.assign(cell, {
        biome: c.biome, quota: c.quota || 0, alt: c.alt || 0,
        blocca: c.biome !== 'floor'
      });
      if (c.mat) cell.mat = c.mat; else delete cell.mat;
    }
    myProps = (d.props || []).filter(p => mask.has(Math.floor(p.x) + ',' + Math.floor(p.z)));
    rebuildMyProps();
    buildTerrain();
    return true;
  } catch (e) { return false; }
}

// --- claim ---
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

document.getElementById('btn-claim').addEventListener('click', () => {
  const saved = creator.myName || localStorage.getItem('garden_name') || '';
  document.getElementById('claim-name').value = saved;
  document.getElementById('claim-err').textContent = '';
  showModal('claim-modal');
});
document.getElementById('claim-no').addEventListener('click', () => hideModal('claim-modal'));
document.getElementById('claim-ok').addEventListener('click', async () => {
  const name = document.getElementById('claim-name').value.trim();
  if (name.length < 2) { document.getElementById('claim-err').textContent = 'Scrivi il tuo nome (almeno 2 lettere).'; return; }
  const id = plotUnderHero();
  const p = PLOTS.find(p => p.id === id);
  if (!p || p.status !== 'free') { hideModal('claim-modal'); toast('Questa parcella non è più libera'); return; }
  if (TOKEN) {
    try {
      const res = await fetch('/api/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, plotId: id, deviceId, owner: { name } })
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        document.getElementById('claim-err').textContent = 'Già rivendicata da ' + (d.by || 'qualcun altro') + '.';
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      document.getElementById('claim-err').textContent = 'Server non raggiungibile — riprova.';
      return;
    }
  }
  hideModal('claim-modal');
  applyClaimLocal(id, name);
  toast('🌿 La parcella ' + id + ' è tua: costruisci!');
});
function applyClaimLocal(id, name) {
  creator.myPlotId = id;
  creator.myName = name;
  localStorage.setItem('garden_name', name);
  localStorage.setItem(claimKey(), JSON.stringify({ plotId: id, name }));
  setPlotStatus(id, 'mine', name);
  restoreDraft();
  updatePlotHud(true);
}
// riprendi il claim locale dopo un refresh (dev e sessione)
{
  try {
    const c = JSON.parse(localStorage.getItem(claimKey()) || 'null');
    if (c && PLOTS.find(p => p.id === c.plotId)) {
      const p = PLOTS.find(p => p.id === c.plotId);
      // se la sessione dice che è di qualcun altro non è nostro; altrimenti riprendi
      if (p.status === 'free' || p.status === 'claimed' || p.status === 'submitted') {
        creator.myPlotId = c.plotId;
        creator.myName = c.name;
        setPlotStatus(c.plotId, p.status === 'submitted' ? 'submitted' : 'mine', c.name);
        restoreDraft();
      }
    }
  } catch (e) {}
}

// --- creator toggle ---
document.getElementById('btn-creator').addEventListener('click', () => {
  creator.active = !creator.active;
  document.getElementById('creator-panel').style.display = creator.active ? 'block' : 'none';
  document.getElementById('btn-creator').textContent = creator.active ? '🚶 Esplora' : '🧱 Costruisci';
  toolSync();
  if (creator.active) toast(IS_MOBILE ? 'Piazza i tuoi oggetti nella parcella' : 'Modalità costruzione: dipingi nella tua parcella');
});

// --- device split (decisione utente 11/7/26) ---
// Telefono: niente pittura terreno — solo «crea asset» (editor #voxel/#pixel) +
// piazzamento oggetti + ripristino. PC: bottone «🛠 Editor completo».
if (IS_MOBILE) {
  ['t-floor', 't-water', 't-wall', 't-bump'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('t-mat-row').style.display = 'none';
  creator.tool = 'asset';
  if (TOKEN) document.getElementById('mobile-create').style.display = '';
}
function _gotoEditor(hash) {
  saveDraft();   // la bozza è condivisa: l'editor la riapre identica
  location.href = './editor.html?s=' + encodeURIComponent(TOKEN) +
    '&plot=' + encodeURIComponent(creator.myPlotId) + (hash || '');
}
document.getElementById('m-create-voxel').addEventListener('click', () => _gotoEditor('#voxel'));
document.getElementById('m-create-pixel').addEventListener('click', () => _gotoEditor('#pixel'));
document.getElementById('btn-editor').addEventListener('click', () => _gotoEditor(''));

// --- consegna (targhetta OBBLIGATORIA) ---
document.getElementById('btn-submit').addEventListener('click', () => {
  const p = myPlot();
  if (!p) return;
  document.getElementById('tg-title').value = (p.concept && p.concept.title) || '';
  document.getElementById('tg-text').value = (p.concept && p.concept.text) || '';
  document.getElementById('tg-author').value = creator.myName || '';
  document.getElementById('tg-err').textContent = '';
  showModal('targhetta-modal');
});
document.getElementById('tg-no').addEventListener('click', () => hideModal('targhetta-modal'));
document.getElementById('tg-ok').addEventListener('click', async () => {
  const concept = {
    title: document.getElementById('tg-title').value.trim(),
    text: document.getElementById('tg-text').value.trim(),
    author: document.getElementById('tg-author').value.trim()
  };
  const tk = GC.validateTarghetta(concept);
  if (!tk.ok) {
    const msgs = { 'targhetta-title': 'Titolo: 2-60 caratteri.', 'targhetta-text': 'Spiegazione: almeno 10 caratteri.', 'targhetta-author': 'Autore: 2-40 caratteri.' };
    document.getElementById('tg-err').textContent = tk.errors.map(e => msgs[e.code] || e.code).join(' ');
    return;
  }
  const p = myPlot();
  // librerie custom del device (texture/materiali creati nell'editor) → namespaced pNN.*
  const ns = GC.namespacePlotLibs({
    plotId: p.id, cells: collectMyCells(), props: myProps,
    texLib: _localLib('voxelproto_textures'), matLib: _localLib('voxelproto_materials'),
    sessionTex: (SESSION && SESSION.libs && SESSION.libs.textures) || {},
    sessionMat: (SESSION && SESSION.libs && SESSION.libs.materials) || {}
  });
  const payload = {
    plotId: p.id, deviceId, concept, cells: ns.cells, props: ns.props,
    libs: { textures: ns.textures, materials: ns.materials }
  };
  const v = GC.validateSubmission(p, payload);
  if (!v.ok) {
    document.getElementById('tg-err').textContent = 'Consegna non valida: ' + v.errors.map(e => e.code).join(', ');
    return;
  }
  if (TOKEN) {
    try {
      const res = await fetch('/api/plot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ token: TOKEN }, payload))
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        document.getElementById('tg-err').textContent = 'Il server ha rifiutato: ' + ((d.errors || []).map(e => e.code).join(', ') || res.status);
        return;
      }
    } catch (e) {
      document.getElementById('tg-err').textContent = 'Server non raggiungibile — la bozza resta salvata qui.';
      return;
    }
  }
  hideModal('targhetta-modal');
  p.concept = concept;
  p.owner = concept.author;
  setPlotStatus(p.id, 'submitted', concept.author);
  rebuildSigns();
  updatePlotHud(true);
  toast('🪧 Mostra consegnata! Puoi ancora migliorarla e riconsegnare.');
});

// ---------- Parcella corrente: HUD + azioni ----------
let curPlotId = null;
function plotUnderHero() {
  const c = cellAt(heroState.wx, heroState.wz);
  return c ? (PLOT_IDX.byCell.get(c.x + ',' + c.z) || null) : null;
}
const STATUS_LABEL = {
  free: '🌿 parcella libera',
  claimed: '⏳ parcella rivendicata',
  submitted: '🪧 mostra consegnata',
  mine: '⭐ la TUA parcella'
};
function updatePlotHud(force) {
  const id = plotUnderHero();
  if (!force && id === curPlotId) return;
  curPlotId = id;
  const hud = document.getElementById('plot-hud');
  const bClaim = document.getElementById('btn-claim');
  const bCreator = document.getElementById('btn-creator');
  const bSubmit = document.getElementById('btn-submit');
  if (!id) {
    hud.style.display = 'none';
    if (creator.active) { creator.active = false; document.getElementById('creator-panel').style.display = 'none'; bCreator.textContent = '🧱 Costruisci'; }
    return;
  }
  const p = PLOTS.find(p => p.id === id);
  const isMine = id === creator.myPlotId;
  let txt = id + ' · ' + (STATUS_LABEL[isMine ? 'mine' : p.status] || p.status);
  if (!isMine && p.owner) txt += ' — ' + p.owner;
  if (p.concept && p.concept.title) txt += ' · «' + p.concept.title + '»';
  document.getElementById('plot-tag').textContent = txt;
  bClaim.style.display = (!isMine && p.status === 'free' && !creator.myPlotId) ? '' : 'none';
  bCreator.style.display = isMine ? '' : 'none';
  bSubmit.style.display = isMine ? '' : 'none';
  // PC + sessione: l'editor full edition sulla propria parcella
  document.getElementById('btn-editor').style.display = (isMine && TOKEN && !IS_MOBILE) ? '' : 'none';
  hud.style.display = 'block';
  // uscire dalla propria parcella spegne il creator mode
  if (!isMine && creator.active) {
    creator.active = false;
    document.getElementById('creator-panel').style.display = 'none';
    bCreator.textContent = '🧱 Costruisci';
  }
}

// ---------- Input ----------
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (creator.active) {
    lastPaintKey = '';
    paintAt(e.clientX, e.clientY);
    paintingDrag = true;
    return;
  }
  clickAt(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (paintingDrag && creator.active) paintAt(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { paintingDrag = false; });

const KEYMAP = {
  w: 'w', a: 'a', s: 's', d: 'd',
  arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd'
};
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const key = e.key.toLowerCase();
  const mapped = KEYMAP[key];
  if (mapped) { e.preventDefault(); heroState.keys.add(mapped); return; }
  if (e.code === 'Space' || key === ' ') { e.preventDefault(); tryJump(); return; }   // salto manuale
  if (key === 'q') rotate(-1);
  else if (key === 'e') rotate(1);
});
// Salto (spacebar): arco a terra; durante il volo si superano rialzi fino a
// STEP_UP_JUMP anche camminando (airborne in moveHero). Non è volo: singolo arco.
function tryJump() {
  if (heroState.jumpT >= 1) heroState.jumpT = 0;
}
window.addEventListener('keyup', (e) => {
  const mapped = KEYMAP[e.key.toLowerCase()];
  if (mapped) heroState.keys.delete(mapped);
});
window.addEventListener('blur', () => heroState.keys.clear());
window.addEventListener('wheel', (e) => {
  halfH = Math.min(34, Math.max(7, halfH + Math.sign(e.deltaY) * 1.5));
  updateFrustum();
}, { passive: true });
window.addEventListener('resize', () => {
  renderer.setSize(vw(), vh());
  updateFrustum();
});

function rotate(sign) {
  yawFrom = yawCur;
  yawTarget += sign * 90;
  yawT = 0;
  rebuildWalls();   // cutaway: ricalcolo discreto allo snap 90° (decisione 6)
}
document.getElementById('btn-rot-l').addEventListener('click', () => rotate(-1));
document.getElementById('btn-rot-r').addEventListener('click', () => rotate(1));

// 🔄 Aggiorna: rilegge la sessione dal server (merge asincrono a richiesta)
const btnRefresh = document.getElementById('btn-refresh');
if (TOKEN) {
  btnRefresh.style.display = '';
  btnRefresh.addEventListener('click', () => location.reload());
}

// Intro full-screen allo spawn (requisito utente): si chiude col bottone
document.getElementById('intro-go').addEventListener('click', () => {
  document.getElementById('intro').style.display = 'none';
});

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

// Hook di debug/test (stessa filosofia di __protoDebug)
window.__gardenDebug = {
  heroState, hero, MAP, PLOTS, clickAt, cellAt, findPath, moveHero, rotate,
  setPlotStatus, plotUnderHero, rebuildWalls, creator, paintAt, applyClaimLocal,
  collectMyCells, buildTerrain, rebuildSigns, signMeshes, axisKind, stepKind, tryJump,
  get myProps() { return myProps; },
  get ghostCount() { return wallGhostMesh ? wallGhostMesh.count : 0; },
  get wallCount() { return wallBoxes.length; },
  get yaw() { return yawTarget; }
};

// ---------- Loop ----------
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  if (yawT < 1) {
    yawT = Math.min(1, yawT + dt / 0.45);
    yawCur = yawFrom + (yawTarget - yawFrom) * easeInOut(yawT);
    placeCamera();
  }

  const yr = THREE.MathUtils.degToRad(yawCur);
  const face = Math.PI / 2 - yr;
  for (const b of billboards) b.rotation.y = face;
  for (const b of propBillboards) b.rotation.y = face;
  for (const s of signMeshes) s.mesh.rotation.y = face;   // i cartelli guardano la camera
  const _tNow = performance.now() / 1000;
  for (const b of propBobs) b.g.position.y = b.baseY + 0.12 * Math.sin(_tNow * 1.8 + b.ph);
  animateLiquidsWater(t);

  moveHero(dt);
  const under = cellAt(heroState.wx, heroState.wz);
  if (under) {
    const ty = under.quota + 0.18;
    hero.position.y += (ty - hero.position.y) * Math.min(1, dt * 10);
  }
  if (heroState.jumpT < 1) {
    heroState.jumpT = Math.min(1, heroState.jumpT + dt / 0.32);
    hero.position.y += 0.55 * Math.sin(Math.PI * heroState.jumpT);
  }
  updatePlotHud();

  const fk = Math.min(1, dt * 6);
  camTarget.x += (heroState.wx - camTarget.x) * fk;
  camTarget.y += (hero.position.y - camTarget.y) * fk;
  camTarget.z += (heroState.wz - camTarget.z) * fk;
  dir.position.copy(camTarget).add(dirOffset);
  dir.target.position.copy(camTarget);
  placeCamera();

  if (markerLife > 0) {
    markerLife = heroState.path.length ? Math.max(markerLife, 0.5) : markerLife;
    markerLife = Math.max(0, markerLife - dt * 0.7);
    marker.material.opacity = Math.min(1, markerLife) * 0.85;
  }

  renderer.render(scene, camera);

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) {
    document.getElementById('stats').textContent =
      Math.round(fpsFrames / fpsTime) + ' fps · ' + PLOTS.length + ' parcelle · ' +
      (solidBoxes.length + waterBoxes.length + wallBoxes.length) + ' volumi';
    fpsFrames = 0; fpsTime = 0;
  }
}

// oscillazione acqua (come nel proto; niente lava nel giardino)
const _liqM = new THREE.Matrix4();
function animateLiquidsWater(t) {
  if (!waterAnim.length || !waterMesh) return;
  for (const b of waterAnim) {
    const y1 = b.y1 + 0.1 * Math.sin(t * 1.3 + b.ph);
    const h = y1 - b.y0;
    _liqM.makeScale(b.sx, h, b.sz);
    _liqM.setPosition(b.x, b.y0 + h / 2, b.z);
    waterMesh.setMatrixAt(b.i, _liqM);
  }
  waterMesh.instanceMatrix.needsUpdate = true;
}

animate();
