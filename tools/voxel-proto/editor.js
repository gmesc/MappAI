import * as THREE from 'three';
import * as VM from './voxel-materials.js';

// ============================================================
// Editor — Memory Dungeon 3D
// Schede: Colori (palette volumi) · Luci (generale + torce)
// · Mappa · Voxel (costruttore asset) · Materiali (texture+ricette)
// · Pixel (sprite 2D → texture).
// Palette e luci si salvano in localStorage e il gioco
// (index.html/proto.js) le legge a ogni avvio.
// ============================================================

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUB = 3, BASE = -1.4, SEED = 20260706, DEFAULT_SIZE = 16;

// DB32 — stessa palette degli asset Aseprite del repo
const DB32 = ['#000000','#222034','#45283c','#663931','#8f563b','#df7126','#d9a066','#eec39a',
  '#fbf236','#99e550','#6abe30','#37946e','#4b692f','#524b24','#323c39','#3f3f74',
  '#306082','#5b6ee1','#639bff','#5fcde4','#cbdbfc','#ffffff','#9badb7','#847e87',
  '#696a6a','#595652','#76428a','#ac3232','#d95763','#d77bba','#8f974a','#8a6f30'];

const el = (id) => document.getElementById(id);

const PAL_DEFAULT = {
  floorA: '#dad6ca', floorB: '#bdb9ad', wallA: '#b4b0a5', wallB: '#8e8b82',
  waterA: '#4795de', waterB: '#1d5fa5', bg: '#ecebe6', jitter: 0.16, colorVar: 1
};
const LIGHTS_DEFAULT = { hemi: 0.9, dir: 2.2, dirColor: '#fff2dd', az: 20, el: 55, points: [] };

function loadLS(key, def) {
  try { return Object.assign(JSON.parse(JSON.stringify(def)), JSON.parse(localStorage.getItem(key) || '{}')); }
  catch (e) { return JSON.parse(JSON.stringify(def)); }
}
const state = {
  tab: 'colori',
  palette: loadLS('voxelproto_palette', PAL_DEFAULT),
  lights: (() => {
    const l = loadLS('voxelproto_lights', LIGHTS_DEFAULT);
    if (l.dirPos) { // ricava az/el se salvati come posizione
      l.az = Math.round(THREE.MathUtils.radToDeg(Math.atan2(l.dirPos.z, l.dirPos.x)));
      l.el = Math.round(THREE.MathUtils.radToDeg(Math.atan2(l.dirPos.y, Math.hypot(l.dirPos.x, l.dirPos.z))));
    }
    return l;
  })(),
  voxel: { area: 6, cube: 0.5, color: '#8f563b', tool: 'pen', cubes: [] },
  map: null,           // { size, grid } — impostata da loadMapState()
  props: [],           // asset piazzati sulla mappa { name, x, z, cubes }
  mapTool: { brush: 'floor', quota: 0, alt: 2, placing: false },
  placingLight: false
};

// ---------- Mappa (demo o salvata in localStorage) ----------
function emptyGrid(size, biome) {
  const grid = [];
  for (let z = 0; z < size; z++) {
    grid[z] = [];
    for (let x = 0; x < size; x++) grid[z][x] = { x, z, biome, quota: 0, alt: 0 };
  }
  return grid;
}
function buildDemoMap(seed, size) {
  const rng = mulberry32(seed);
  const grid = emptyGrid(size, 'floor');
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (Math.hypot(x - 11.5, z - 9.5) < 2.7) {
      grid[z][x].biome = 'water';
      grid[z][x].quota = -(0.35 + rng() * 0.4);
    }
  }
  for (const z of [4, 5, 7]) Object.assign(grid[z][4], { biome: 'wall', alt: 2 });
  for (const [x, z] of [[2, 11], [3, 11], [2, 12], [3, 12]]) Object.assign(grid[z][x], { biome: 'wall', alt: 3 });
  for (const [x, z] of [[8, 2], [13, 8]]) Object.assign(grid[z][x], { biome: 'wall', alt: 1 });
  for (const [x, z] of [[13, 2], [14, 2], [13, 3], [14, 3]]) grid[z][x].quota = 1;
  grid[2][12].quota = 0.5;
  return grid;
}
function loadMapState() {
  try {
    const s = JSON.parse(localStorage.getItem('voxelproto_map') || 'null');
    if (s && Number.isInteger(s.size) && Array.isArray(s.cells)) {
      const grid = emptyGrid(s.size, 'void');
      s.cells.forEach(c => {
        if (grid[c.z] && grid[c.z][c.x]) {
          Object.assign(grid[c.z][c.x], { biome: c.biome || 'floor', quota: c.quota || 0, alt: c.alt || 0 });
          if (c.mat) grid[c.z][c.x].mat = c.mat;   // materiale (contratto: campo opzionale)
        }
      });
      state.map = { size: s.size, grid };
      state.props = Array.isArray(s.props) ? s.props : [];
      return;
    }
  } catch (e) { console.warn('voxelproto_map non valida', e); }
  state.map = { size: DEFAULT_SIZE, grid: buildDemoMap(SEED, DEFAULT_SIZE) };
  state.props = [];
}
loadMapState();

// ---------- Renderer / camera ----------
const vw = () => window.innerWidth || 1280;
const vh = () => window.innerHeight || 720;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(vw(), vh());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('scene').appendChild(renderer.domElement);

let halfH = Math.max(14, state.map.size + 1);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
let camTarget = new THREE.Vector3(0, 0, 0);
function updateFrustum() {
  const aspect = vw() / vh();
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
const ELEV = Math.atan(1 / Math.SQRT2);
let yawCur = 45, yawFrom = 45, yawTarget = 45, yawT = 1;
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
updateFrustum(); placeCamera();
function rotate(sign) { yawFrom = yawCur; yawTarget += sign * 90; yawT = 0; }

// ---------- Scena MONDO (schede Colori + Luci) ----------
const sceneWorld = new THREE.Scene();
const hemi = new THREE.HemisphereLight(0xffffff, 0xb5b1a4, state.lights.hemi);
sceneWorld.add(hemi);
const dir = new THREE.DirectionalLight(state.lights.dirColor, state.lights.dir);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.left = -36; dir.shadow.camera.right = 36;
dir.shadow.camera.top = 36; dir.shadow.camera.bottom = -36;
dir.shadow.camera.near = 1; dir.shadow.camera.far = 160;
dir.shadow.bias = -0.001; dir.shadow.normalBias = 0.5;
sceneWorld.add(dir); sceneWorld.add(dir.target);

function dirPosFromAngles() {
  const az = THREE.MathUtils.degToRad(state.lights.az);
  const el = THREE.MathUtils.degToRad(state.lights.el);
  const R = 55;
  return { x: Math.cos(el) * Math.cos(az) * R, y: Math.sin(el) * R, z: Math.cos(el) * Math.sin(az) * R };
}
function applyGlobalLights() {
  hemi.intensity = state.lights.hemi;
  dir.intensity = state.lights.dir;
  dir.color.set(state.lights.dirColor);
  const p = dirPosFromAngles();
  dir.position.set(p.x, p.y, p.z);
}
applyGlobalLights();

const unitBox = new THREE.BoxGeometry(1, 1, 1);
let solidMesh = null, waterMesh = null, paintPlane = null;

// Props (asset piazzati) — cache geometrie/materiali indipendente dal costruttore
const propsGroup = new THREE.Group();
sceneWorld.add(propsGroup);
const propGeoCache = {}, propMatCache = {};
const propGeo = (s) => propGeoCache[s] || (propGeoCache[s] = new THREE.BoxGeometry(s, s, s));
const propMat = (c) => propMatCache[c] || (propMatCache[c] = new THREE.MeshLambertMaterial({ color: c }));
// Liste animate dal loop: billboard (facing camera), bob (fluttuazione), luci (sfarfallio)
const propBillboards = [], propBobs = [], propLights = [];
function buildProps() {
  propsGroup.clear();
  propBillboards.length = 0; propBobs.length = 0; propLights.length = 0;
  const W = state.map.size * SUB;
  for (const prop of state.props) {
    const ox = (prop.x + 0.5) * SUB - W / 2;
    const oz = (prop.z + 0.5) * SUB - W / 2;
    const row = state.map.grid[Math.floor(prop.z)];
    const baseCell = row && row[Math.floor(prop.x)];
    const by = (baseCell ? baseCell.quota : 0) + (prop.yOff || 0);
    const g = new THREE.Group();
    g.position.set(ox, by, oz);
    g.rotation.y = THREE.MathUtils.degToRad(prop.rot || 0);
    const sc = prop.scale || 1;
    if (sc !== 1) g.scale.setScalar(sc);
    let topY = 0;
    const texLib = VM.loadTexLib(), matLib = VM.loadMatLib();
    let ci = 0;
    for (const c of prop.cubes || []) {
      const six = VM.cubeMaterialArray(c, matLib, texLib, 'prop|' + prop.x + ',' + prop.z + '|' + (ci++));
      const m = new THREE.Mesh(propGeo(c.s || 1), six || propMat(c.c || '#8f563b'));
      m.position.set(c.x, c.y, c.z);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      if (c.y > topY) topY = c.y;
    }
    if (prop.light) {
      const L = prop.light;
      const pl = new THREE.PointLight(L.color || '#ffd9a0', L.intensity != null ? L.intensity : 1.6, L.range || 6, 1.8);
      pl.position.set(0, topY + 0.4, 0);
      pl.userData.base = pl.intensity;
      g.add(pl);
      if (L.flicker) propLights.push(pl);
    }
    if (prop.billboard) propBillboards.push(g);
    if ((prop.yOff || 0) > 0.05) propBobs.push({ g, baseY: by, ph: (ox * 7 + oz * 13) % 6.28 });
    propsGroup.add(g);
  }
}

let matOverlayGroup = null;   // quad testurizzati dei materiali (1 mesh per texture)
let lavaMesh = null;
const waterAnim = [], lavaAnim = [];   // { i, y0, y1, sx, sz, x, z, ph } — oscillazione liquidi ±0.1
const cLavaE = new THREE.Color('#c8391a');
function _liquidPhase(cx, cz) { return ((cx * 12.9898 + cz * 78.233) % 6.2831); }
function buildWorld() {
  const size = state.map.size;
  const W = size * SUB;
  if (solidMesh) { sceneWorld.remove(solidMesh); solidMesh.dispose(); }
  if (waterMesh) { sceneWorld.remove(waterMesh); waterMesh.dispose(); }
  if (lavaMesh) { sceneWorld.remove(lavaMesh); lavaMesh.dispose(); }
  if (paintPlane) sceneWorld.remove(paintPlane);
  if (matOverlayGroup) sceneWorld.remove(matOverlayGroup);
  waterAnim.length = 0; lavaAnim.length = 0;
  const P = state.palette;
  const rng = mulberry32(SEED ^ 0xBEEF);
  const cFA = new THREE.Color(P.floorA), cFB = new THREE.Color(P.floorB);
  const cWA = new THREE.Color(P.wallA), cWB = new THREE.Color(P.wallB);
  const cAA = new THREE.Color(P.waterA), cAB = new THREE.Color(P.waterB);
  const solid = [], water = [], lava = [];
  // materiali: batcher di quad testurizzati (top pavimenti, top+lati muri)
  const texLib = VM.loadTexLib(), matLib = VM.loadMatLib();
  const batch = VM.makeQuadBatcher(texLib);
  const matRefs = (cell) => (cell.mat && matLib[cell.mat] && matLib[cell.mat].faces) || null;
  const isLava = (cell) => !!(cell.mat && matLib[cell.mat] && (matLib[cell.mat].tags || []).includes('lava'));
  const isWallAt = (lx, lz) => {
    const r = state.map.grid[lz];
    return !!(r && r[lx] && r[lx].biome === 'wall');
  };
  for (let lz = 0; lz < size; lz++) for (let lx = 0; lx < size; lx++) {
    const cell = state.map.grid[lz][lx];
    if (cell.biome === 'void') continue;
    const bx = lx * SUB - W / 2, bz = lz * SUB - W / 2;
    if (cell.biome === 'water') {
      waterAnim.push({ i: water.length, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB, x: bx + SUB / 2, z: bz + SUB / 2, ph: _liquidPhase(lx, lz) });
      water.push({ x: bx + SUB / 2, z: bz + SUB / 2, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB,
        color: cAA.clone().lerp(cAB, Math.min(1, (-cell.quota - 0.3) / 0.5)) });
      continue;
    }
    if (isLava(cell)) {   // lava = liquido incassato con glow (mat taggato 'lava')
      const lc = (matLib[cell.mat] && matLib[cell.mat].color) ? new THREE.Color(matLib[cell.mat].color) : cLavaE.clone();
      lavaAnim.push({ i: lava.length, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB, x: bx + SUB / 2, z: bz + SUB / 2, ph: _liquidPhase(lx, lz) });
      lava.push({ x: bx + SUB / 2, z: bz + SUB / 2, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB, color: lc });
      continue;
    }
    const refs = matRefs(cell);
    const cellSeed = 'cell|' + lx + ',' + lz;
    for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
      const x = bx + i + 0.5, z = bz + j + 0.5;
      if (cell.biome === 'floor') {
        const y1 = cell.quota + rng() * P.jitter;
        solid.push({ x, z, y0: BASE, y1, sx: 1, sz: 1,
          color: cFA.clone().lerp(cFB, rng() * P.colorVar) });
        // top testurizzato: la texture copre il TILE, tagliata in 9 (uv a fette 1/3)
        if (refs) {
          const ref = refs.top !== undefined ? refs.top : refs.all;
          if (ref) batch.add(ref, cellSeed, VM.topQuad(bx + i, bz + j, 1, y1 + 0.006),
            [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
        }
      } else {
        solid.push({ x, z, y0: BASE, y1: 0, sx: 1, sz: 1, color: cWB.clone() });
        for (let k = 0; k < cell.alt; k++) {
          const topJ = (k === cell.alt - 1 && !refs) ? rng() * 0.12 : (k === cell.alt - 1 ? (rng(), 0) : 0);
          solid.push({ x, z, y0: k, y1: k + 1 + topJ, sx: 1, sz: 1, color: cWA.clone().lerp(cWB, rng() * P.colorVar) });
        }
        if (refs) {
          const topRef = refs.top !== undefined ? refs.top : refs.all;
          if (topRef) batch.add(topRef, cellSeed, VM.topQuad(bx + i, bz + j, 1, cell.alt + 0.006),
            [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
        }
      }
    }
    // lati dei muri testurizzati (solo facce esposte, quota 0 → alt; uv verticale ripetuto)
    if (cell.biome === 'wall' && refs) {
      const sideRef = refs.side !== undefined ? refs.side : refs.all;
      if (sideRef) {
        const dirs = [
          { d: 'nord', nx: lx, nz: lz - 1 }, { d: 'sud', nx: lx, nz: lz + 1 },
          { d: 'ovest', nx: lx - 1, nz: lz }, { d: 'est', nx: lx + 1, nz: lz }
        ];
        for (const { d, nx, nz } of dirs) {
          if (isWallAt(nx, nz)) continue;
          for (let i = 0; i < SUB; i++) {
            const sx0 = (d === 'nord' || d === 'sud') ? bx + i : bx;
            const sz0 = (d === 'ovest' || d === 'est') ? bz + i : bz;
            const off = 0.004;
            const q = VM.sideQuad(
              sx0 + (d === 'ovest' ? -off : d === 'est' ? off : 0),
              sz0 + (d === 'nord' ? -off : d === 'sud' ? off : 0),
              (d === 'nord' || d === 'sud') ? 1 : SUB * 0 + 1, 0, cell.alt, d);
            batch.add(sideRef, cellSeed + '|' + d, q,
              [[i / SUB, 0], [i / SUB, cell.alt], [(i + 1) / SUB, cell.alt], [(i + 1) / SUB, 0]]);
          }
        }
      }
    }
  }
  matOverlayGroup = new THREE.Group();
  batch.buildMeshes().forEach(m => { m.frustumCulled = false; matOverlayGroup.add(m); });
  sceneWorld.add(matOverlayGroup);
  const make = (list, mat) => {
    const mesh = new THREE.InstancedMesh(unitBox, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, idx) => {
      const h = b.y1 - b.y0;
      m.makeScale(b.sx, h, b.sz); m.setPosition(b.x, b.y0 + h / 2, b.z);
      mesh.setMatrixAt(idx, m); mesh.setColorAt(idx, b.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  };
  solidMesh = make(solid, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  solidMesh.castShadow = true; solidMesh.receiveShadow = true;
  solidMesh.frustumCulled = false;   // fix: il frustum-cull dell'InstancedMesh (sfera piccola) faceva sparire volumi ruotando
  waterMesh = make(water, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }));
  waterMesh.receiveShadow = true;
  waterMesh.frustumCulled = false;   // fix: l'acqua spariva a certe inquadrature
  lavaMesh = make(lava, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a1e00, emissiveIntensity: 0.5 }));
  lavaMesh.frustumCulled = false;
  sceneWorld.add(solidMesh); sceneWorld.add(waterMesh); sceneWorld.add(lavaMesh);
  // piano invisibile a quota 0: permette di dipingere anche sul vuoto
  paintPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W, W),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  );
  paintPlane.rotation.x = -Math.PI / 2;
  sceneWorld.add(paintPlane);
  // l'ombra del sole copre l'intera mappa
  const ext = W / 2 + 14;
  dir.shadow.camera.left = -ext; dir.shadow.camera.right = ext;
  dir.shadow.camera.top = ext; dir.shadow.camera.bottom = -ext;
  dir.shadow.camera.updateProjectionMatrix();
  renderer.setClearColor(state.palette.bg);
  buildProps();
}
// oscillazione liquidi (±0.1): aggiorna la Y del top di acqua/lava, onde sfasate per cella
const _liqM = new THREE.Matrix4();
function animateLiquids(mesh, list, t, amp, speed) {
  if (!mesh || !list.length) return;
  for (const b of list) {
    const y1 = b.y1 + amp * Math.sin(t * speed + b.ph);
    const h = y1 - b.y0;
    _liqM.makeScale(b.sx, h, b.sz);
    _liqM.setPosition(b.x, b.y0 + h / 2, b.z);
    mesh.setMatrixAt(b.i, _liqM);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
buildWorld();

// Punti luce nel mondo (marker sferico + PointLight)
const pointLightObjs = []; // { light, marker, data }
function addPointLight(data) {
  const pl = new THREE.PointLight(data.color, data.intensity, data.range, 1.8);
  pl.position.set(data.x, data.y, data.z);
  pl.userData.base = data.intensity;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshBasicMaterial({ color: data.color })
  );
  marker.position.copy(pl.position);
  sceneWorld.add(pl); sceneWorld.add(marker);
  pointLightObjs.push({ light: pl, marker, data });
  renderLightList();
}
function removePointLight(idx) {
  const o = pointLightObjs[idx];
  sceneWorld.remove(o.light); sceneWorld.remove(o.marker);
  pointLightObjs.splice(idx, 1);
  renderLightList();
}
state.lights.points.forEach(addPointLight);

// ---------- Scena ASSET (scheda Voxel) ----------
const sceneAsset = new THREE.Scene();
sceneAsset.add(new THREE.HemisphereLight(0xffffff, 0xb5b1a4, 1.0));
const dirA = new THREE.DirectionalLight(0xfff2dd, 2.0);
dirA.position.set(14, 22, 8);
sceneAsset.add(dirA);
const assetGroup = new THREE.Group();
sceneAsset.add(assetGroup);
let gridHelper = null, groundPlane = null;
const cubeGeos = {}, cubeMats = {};
function cubeGeo(s) { return cubeGeos[s] || (cubeGeos[s] = new THREE.BoxGeometry(s, s, s)); }
function cubeMat(c) { return cubeMats[c] || (cubeMats[c] = new THREE.MeshLambertMaterial({ color: c })); }

function rebuildAssetScene() {
  const { area } = state.voxel;
  if (gridHelper) sceneAsset.remove(gridHelper);
  if (groundPlane) sceneAsset.remove(groundPlane);
  gridHelper = new THREE.GridHelper(area, Math.round(area * 3), 0x888780, 0xb4b2a9);
  sceneAsset.add(gridHelper);
  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(area, area),
    new THREE.MeshBasicMaterial({ color: 0xd8d5cb, transparent: true, opacity: 0.25 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.001;
  sceneAsset.add(groundPlane);
  assetGroup.clear();
  const texLib = VM.loadTexLib(), matLib = VM.loadMatLib();
  state.voxel.cubes.forEach((c, idx) => {
    // cubo con materiale/texture per faccia → array di 6 materiali; altrimenti colore
    const six = VM.cubeMaterialArray(c, matLib, texLib, 'builder|' + idx);
    const m = new THREE.Mesh(cubeGeo(c.s), six || cubeMat(c.c));
    m.position.set(c.x, c.y, c.z);
    m.userData.index = idx;
    assetGroup.add(m);
  });
  if (state.tab === 'voxel') {
    camTarget.set(0, area * 0.25, 0);
    halfH = Math.max(3.5, area * 0.8);
    updateFrustum(); placeCamera();
  }
}
rebuildAssetScene();

// Cubi a taglia mista: ogni cubo ha la sua `s` (1, 1/2, 1/3) e viene
// agganciato alla griglia della PROPRIA taglia; lungo la normale della
// faccia cliccata i cubi si toccano faccia contro faccia.
const snapTo = (v, s) => (Math.floor(v / s) + 0.5) * s;
function voxelClick(clientX, clientY) {
  sceneAsset.updateMatrixWorld(true);
  const p = ndcFromClient(clientX, clientY);
  raycaster.setFromCamera(p, camera);
  const hits = raycaster.intersectObjects([groundPlane, ...assetGroup.children]);
  if (!hits.length) return 'nessun hit';
  const hit = hits[0];
  const { area, color, tool, cube: s } = state.voxel;
  if (tool === 'erase') {
    if (hit.object.userData.index == null) return 'niente da rimuovere';
    state.voxel.cubes.splice(hit.object.userData.index, 1);
    rebuildAssetScene();
    return 'rimosso';
  }
  if (tool === 'texface') {
    // applica la texture/#tag scelta alla FACCIA cliccata del cubo (override f)
    if (hit.object.userData.index == null) return 'clicca la faccia di un cubo';
    const cube2 = state.voxel.cubes[hit.object.userData.index];
    const fk = VM.faceKeyFromNormal(hit.face.normal);
    const ref = el('vx-texref').value;
    if (!ref) { cube2.f && delete cube2.f[fk]; if (cube2.f && !Object.keys(cube2.f).length) delete cube2.f; }
    else { cube2.f = cube2.f || {}; cube2.f[fk] = ref; }
    rebuildAssetScene();
    return 'faccia ' + fk + ' → ' + (ref || 'colore');
  }
  let x, y, z;
  if (hit.object.userData.index != null) {
    const base = state.voxel.cubes[hit.object.userData.index];
    const n = hit.face.normal; // mesh asse-allineate: normale locale = mondo
    x = n.x !== 0 ? base.x + n.x * (base.s + s) / 2 : snapTo(hit.point.x, s);
    y = n.y !== 0 ? base.y + n.y * (base.s + s) / 2 : snapTo(hit.point.y, s);
    z = n.z !== 0 ? base.z + n.z * (base.s + s) / 2 : snapTo(hit.point.z, s);
  } else {
    x = snapTo(hit.point.x, s);
    z = snapTo(hit.point.z, s);
    y = s / 2;
  }
  const lim = area / 2 + 0.001;
  if (Math.abs(x) > lim || Math.abs(z) > lim || y < s / 2 - 0.001 || y > area * 2) return 'fuori area';
  const nc = { x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4), s, c: color };
  if (el('vx-mat').value) nc.m = el('vx-mat').value;   // cubo di materiale (contratto: campo m)
  state.voxel.cubes.push(nc);
  rebuildAssetScene();
  return 'aggiunto ' + x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + ' s=' + s.toFixed(2);
}

// ---------- Raycast / input ----------
const raycaster = new THREE.Raycaster();
function ndcFromClient(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width || vw(), h = rect.height || vh();
  return new THREE.Vector2(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
}

// ---------- Pittura mappa (pennelli su celle logiche) ----------
let paintingDrag = false, lastPaintKey = '';
function paintAt(clientX, clientY) {
  sceneWorld.updateMatrixWorld(true);
  const p = ndcFromClient(clientX, clientY);
  raycaster.setFromCamera(p, camera);
  const targets = [paintPlane, solidMesh, waterMesh].filter(Boolean);
  const hits = raycaster.intersectObjects(targets);
  if (!hits.length) return 'nessun hit';
  const pt = hits[0].point;
  const W = state.map.size * SUB;
  const lx = Math.floor((pt.x + W / 2) / SUB);
  const lz = Math.floor((pt.z + W / 2) / SUB);
  if (lx < 0 || lz < 0 || lx >= state.map.size || lz >= state.map.size) return 'fuori griglia';
  const t = state.mapTool;
  if (t.placing) {
    const name = el('m-asset').value;
    if (!name) { toast('Nessun asset in libreria: creane uno nella scheda Voxel'); return 'no asset'; }
    // REGOLE DI PIAZZAMENTO: mai su muro/vuoto; pavimento/acqua secondo la
    // proprietà «si piazza su» dell'asset (floor default, water, any)
    const cell = state.map.grid[lz][lx];
    const meta = loadAssetLib()[name] || {};
    const surf = meta.surface || 'floor';
    if (cell.biome === 'wall' || cell.biome === 'void') { toast('Qui no: gli asset vanno su pavimento o acqua'); return 'superficie vietata'; }
    if (surf === 'floor' && cell.biome !== 'floor') { toast('«' + name + '» si piazza solo sul pavimento'); return 'solo pavimento'; }
    if (surf === 'water' && cell.biome !== 'water') { toast('«' + name + '» si piazza solo sull\'acqua'); return 'solo acqua'; }
    const ax = +(((pt.x + W / 2) / SUB) - 0.5).toFixed(2);
    const az = +(((pt.z + W / 2) / SUB) - 0.5).toFixed(2);
    const inst = { name, x: ax, z: az, cubes: assetCubesByName(name) };
    // proprietà d'istanza e d'asset che il gioco deve conoscere (contratto props)
    const scale = +el('m-scale').value || 1, rot = +el('m-rot').value || 0;
    if (scale !== 1) inst.scale = scale;
    if (rot) inst.rot = rot;
    if (meta.yOff > 0) inst.yOff = meta.yOff;
    if (meta.billboard) inst.billboard = true;
    if (meta.walkable) inst.walkable = true;
    if (meta.light) inst.light = meta.light;
    state.props.push(inst);
    buildProps(); renderPropList();
    return 'asset ' + name;
  }
  // RILIEVO: alza/abbassa la quota dei pavimenti nel raggio, con sfumatura ai bordi
  // (colline dolci). Throttle temporale: tenere premuto continua a modellare.
  if (t.brush === 'bump') {
    const now = performance.now();
    if (now - (paintAt._bumpT || 0) < 55) return 'bump throttle';
    paintAt._bumpT = now;
    const b = t.bump, R = b.r;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = lx + dx, z = lz + dz;
      if (x < 0 || z < 0 || x >= state.map.size || z >= state.map.size) continue;
      const c = state.map.grid[z][x];
      if (c.biome !== 'floor') continue;   // il rilievo modella solo il pavimento
      const d = Math.hypot(dx, dz);
      if (d > R + 0.5) continue;
      const falloff = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, d / (R + 0.5)));   // 1 al centro → 0 al bordo
      c.quota = Math.max(-2, Math.min(2, +(c.quota + b.dir * b.amt * falloff).toFixed(3)));
    }
    buildWorld();
    return 'bump @ ' + lx + ',' + lz;
  }
  const key = lx + ',' + lz + ',' + t.brush;
  if (key === lastPaintKey) return 'invariato';
  lastPaintKey = key;
  const cell = state.map.grid[lz][lx];
  const brushMat = el('m-mat').value || null;   // materiale pennello (pavimento e muro)
  // texture/tag diretta sul pavimento (#1): crea al volo un materiale "auto:<ref>"
  const texRef = el('m-texref').value || null;
  const floorMat = brushMat || (texRef ? _ensureAutoMaterial(texRef) : null);
  if (t.brush === 'floor') Object.assign(cell, { biome: 'floor', quota: t.quota, alt: 0 });
  else if (t.brush === 'water') {
    const h = mulberry32(lx * 7349 + lz * 131)();
    Object.assign(cell, { biome: 'water', quota: -(0.35 + h * 0.4), alt: 0 });
  }
  else if (t.brush === 'wall') Object.assign(cell, { biome: 'wall', quota: 0, alt: t.alt });
  else Object.assign(cell, { biome: 'void', quota: 0, alt: 0 });
  if (t.brush === 'floor' && floorMat) cell.mat = floorMat;
  else if (t.brush === 'wall' && brushMat) cell.mat = brushMat;
  else delete cell.mat;
  buildWorld();
  return t.brush + ' @ ' + lx + ',' + lz;
}
// #1: materiale "auto" da un riferimento texture/#tag (top = ref, colore fallback neutro)
function _ensureAutoMaterial(ref) {
  const name = 'auto:' + ref;
  const lib = VM.loadMatLib();
  if (!lib[name]) {
    lib[name] = { color: '#9a958a', faces: { top: ref, side: null, bottom: null }, tags: ['pavimento'] };
    VM.saveMatLib(lib);
    if (typeof refreshMatSelects === 'function') refreshMatSelects();
  }
  return name;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  if (paintingDrag && state.tab === 'mappa') paintAt(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { paintingDrag = false; });

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (state.tab === 'voxel') { voxelClick(e.clientX, e.clientY); return; }
  if (state.tab === 'mappa') {
    lastPaintKey = '';
    paintAt(e.clientX, e.clientY);
    paintingDrag = !state.mapTool.placing;
    return;
  }
  if (state.tab === 'luci' && state.placingLight) {
    const p = ndcFromClient(e.clientX, e.clientY);
    raycaster.setFromCamera(p, camera);
    const hits = raycaster.intersectObjects([solidMesh, waterMesh]);
    if (!hits.length) return;
    const pt = hits[0].point;
    const data = {
      x: +pt.x.toFixed(2), y: +(pt.y + 1.5).toFixed(2), z: +pt.z.toFixed(2),
      color: el('l-ptColor').value,
      intensity: +el('l-ptInt').value,
      range: +el('l-ptRange').value,
      flicker: el('l-ptFlicker').checked
    };
    addPointLight(data);
    toast('Punto luce aggiunto — ricorda Salva');
  }
});

window.addEventListener('keydown', (e) => {
  const tg = e.target && e.target.tagName;
  if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;   // digitando nei campi non si muove la camera
  const key = e.key.toLowerCase();
  if (key === 'q') rotate(-1);
  else if (key === 'e') rotate(1);
  else if ('wasd'.includes(key) && key.length === 1 && state.tab !== 'pixel') {
    // pan della vista relativo all'inquadratura (la camera non è più ancorata al centro)
    const yr = THREE.MathUtils.degToRad(yawCur);
    const fx = -Math.cos(yr), fz = -Math.sin(yr);   // avanti = dal punto camera verso il target
    const rx = Math.sin(yr), rz = -Math.cos(yr);    // destra sullo schermo
    const step = Math.max(0.8, halfH * 0.09);
    if (key === 'w') { camTarget.x += fx * step; camTarget.z += fz * step; }
    else if (key === 's') { camTarget.x -= fx * step; camTarget.z -= fz * step; }
    else if (key === 'd') { camTarget.x += rx * step; camTarget.z += rz * step; }
    else if (key === 'a') { camTarget.x -= rx * step; camTarget.z -= rz * step; }
    placeCamera();
  }
});
window.addEventListener('wheel', (e) => {
  if (state.tab === 'pixel') return;
  halfH = Math.min(40, Math.max(3, halfH + Math.sign(e.deltaY) * 1.2));
  updateFrustum();
}, { passive: true });
window.addEventListener('resize', () => { renderer.setSize(vw(), vh()); updateFrustum(); });

// ---------- UI di base ----------
let toastTimer = null;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1800);
}
function copyJSON(obj, label) {
  const json = JSON.stringify(obj, null, 2);
  navigator.clipboard.writeText(json)
    .then(() => toast(label + ' copiato negli appunti'))
    .catch(() => { console.log(json); toast('Clipboard non disponibile — vedi console'); });
}

const HINTS = {
  colori: 'Modifica e osserva live · Salva per usarla nel gioco',
  luci: 'Attiva "Piazza con click" e clicca sul terreno',
  mappa: 'Click/trascina = pennello · Vuoto scava forme non rettangolari',
  voxel: 'Click = aggiungi sul lato cliccato · taglie miscelabili · Q/E ruota',
  materiali: 'Ricette texture→facce riusabili su mappa e asset',
  pixel: 'Trascina per disegnare · Riempi = secchiello'
};
const TABS = ['colori', 'luci', 'mappa', 'voxel', 'materiali', 'pixel'];
function setTab(tab) {
  state.tab = tab;
  for (const t of TABS) {
    el('tab-' + t).classList.toggle('active', t === tab);
    el('pane-' + t).classList.toggle('active', t === tab);
  }
  el('pixel-wrap').style.display = tab === 'pixel' ? 'flex' : 'none';
  el('hint').textContent = HINTS[tab];
  if (tab === 'voxel') {
    camTarget.set(0, state.voxel.area * 0.25, 0);
    halfH = Math.max(3.5, state.voxel.area * 0.8);
  } else {
    camTarget.set(0, 0, 0);
    halfH = Math.max(14, state.map.size + 1);
  }
  if (tab === 'mappa') { refreshAssetSelect(); if (typeof refreshMatSelects === 'function') refreshMatSelects(); }
  if (tab === 'materiali') refreshMaterialUI();
  updateFrustum(); placeCamera();
}
for (const t of TABS) el('tab-' + t).addEventListener('click', () => setTab(t));

// ---------- Scheda COLORI ----------
const palFields = ['floorA', 'floorB', 'wallA', 'wallB', 'waterA', 'waterB', 'bg'];
function syncPaletteUI() {
  for (const f of palFields) el('c-' + f).value = state.palette[f];
  el('c-colorVar').value = state.palette.colorVar;
  el('c-jitter').value = state.palette.jitter;
  el('v-colorVar').textContent = state.palette.colorVar;
  el('v-jitter').textContent = state.palette.jitter;
}
syncPaletteUI();
for (const f of palFields) {
  el('c-' + f).addEventListener('input', () => { state.palette[f] = el('c-' + f).value; buildWorld(); });
}
el('c-colorVar').addEventListener('input', () => {
  state.palette.colorVar = +el('c-colorVar').value;
  el('v-colorVar').textContent = state.palette.colorVar;
  buildWorld();
});
el('c-jitter').addEventListener('input', () => {
  state.palette.jitter = +el('c-jitter').value;
  el('v-jitter').textContent = state.palette.jitter;
  buildWorld();
});
el('pal-save').addEventListener('click', () => {
  localStorage.setItem('voxelproto_palette', JSON.stringify(state.palette));
  toast('Palette salvata — il gioco la usa al prossimo avvio');
});
el('pal-reset').addEventListener('click', () => {
  state.palette = JSON.parse(JSON.stringify(PAL_DEFAULT));
  localStorage.removeItem('voxelproto_palette');
  syncPaletteUI(); buildWorld();
  toast('Palette riportata ai default');
});
el('pal-export').addEventListener('click', () => copyJSON(state.palette, 'JSON palette'));

// ---------- Scheda LUCI ----------
function syncLightsUI() {
  el('l-hemi').value = state.lights.hemi; el('v-hemi').textContent = state.lights.hemi;
  el('l-dir').value = state.lights.dir; el('v-dir').textContent = state.lights.dir;
  el('l-dirColor').value = state.lights.dirColor;
  el('l-az').value = state.lights.az; el('v-az').textContent = state.lights.az;
  el('l-el').value = state.lights.el; el('v-el').textContent = state.lights.el;
  el('v-ptInt').textContent = el('l-ptInt').value;
  el('v-ptRange').textContent = el('l-ptRange').value;
}
syncLightsUI();
for (const [id, key] of [['l-hemi', 'hemi'], ['l-dir', 'dir'], ['l-az', 'az'], ['l-el', 'el']]) {
  el(id).addEventListener('input', () => {
    state.lights[key] = +el(id).value;
    syncLightsUI(); applyGlobalLights();
  });
}
el('l-dirColor').addEventListener('input', () => { state.lights.dirColor = el('l-dirColor').value; applyGlobalLights(); });
el('l-ptInt').addEventListener('input', syncLightsUI);
el('l-ptRange').addEventListener('input', syncLightsUI);
el('l-place').addEventListener('click', () => {
  state.placingLight = !state.placingLight;
  el('l-place').classList.toggle('active', state.placingLight);
  el('l-place').textContent = state.placingLight ? 'Clicca sul terreno… (di nuovo per uscire)' : 'Piazza con click sul terreno';
});
function renderLightList() {
  const box = el('light-list');
  box.innerHTML = '';
  pointLightObjs.forEach((o, idx) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + o.data.color + '"></span>' +
      '<span style="flex:1">' + (o.data.flicker ? 'fuoco' : 'lampada') + ' (' + o.data.x + ', ' + o.data.z + ')</span>';
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = 'X';
    del.addEventListener('click', () => removePointLight(idx));
    item.appendChild(del);
    box.appendChild(item);
  });
}
renderLightList();
function lightsJSON() {
  return {
    hemi: state.lights.hemi, dir: state.lights.dir, dirColor: state.lights.dirColor,
    dirPos: dirPosFromAngles(),
    points: pointLightObjs.map(o => o.data)
  };
}
el('l-save').addEventListener('click', () => {
  localStorage.setItem('voxelproto_lights', JSON.stringify(lightsJSON()));
  toast('Luci salvate — il gioco le usa al prossimo avvio');
});
el('l-reset').addEventListener('click', () => {
  while (pointLightObjs.length) removePointLight(0);
  state.lights = JSON.parse(JSON.stringify(LIGHTS_DEFAULT));
  localStorage.removeItem('voxelproto_lights');
  syncLightsUI(); applyGlobalLights();
  toast('Luci riportate ai default');
});
el('l-export').addEventListener('click', () => copyJSON(lightsJSON(), 'JSON luci'));

// ---------- Scheda MAPPA ----------
function brushBtnSync() {
  for (const b of ['floor', 'water', 'wall', 'void', 'bump']) {
    el('m-' + b).classList.toggle('active', state.mapTool.brush === b && !state.mapTool.placing);
  }
  el('bump-controls').style.display = (state.mapTool.brush === 'bump' && !state.mapTool.placing) ? 'block' : 'none';
  el('m-place').classList.toggle('active', state.mapTool.placing);
  el('m-place').textContent = state.mapTool.placing ? 'Clicca sulla mappa… (di nuovo per uscire)' : 'Piazza con click';
}
for (const b of ['floor', 'water', 'wall', 'void', 'bump']) {
  el('m-' + b).addEventListener('click', () => { state.mapTool.brush = b; state.mapTool.placing = false; brushBtnSync(); });
}
// RILIEVO (bump): parametri + direzione
state.mapTool.bump = { amt: 0.15, r: 3, dir: 1 };
el('m-bump-amt').addEventListener('input', () => { state.mapTool.bump.amt = +el('m-bump-amt').value; el('v-mbump').textContent = state.mapTool.bump.amt; });
el('m-bump-r').addEventListener('input', () => { state.mapTool.bump.r = +el('m-bump-r').value; el('v-mbumpr').textContent = state.mapTool.bump.r; });
el('m-bump-up').addEventListener('click', () => { state.mapTool.bump.dir = 1; el('m-bump-up').classList.add('active'); el('m-bump-down').classList.remove('active'); });
el('m-bump-down').addEventListener('click', () => { state.mapTool.bump.dir = -1; el('m-bump-down').classList.add('active'); el('m-bump-up').classList.remove('active'); });
el('m-quota').addEventListener('input', () => { state.mapTool.quota = +el('m-quota').value; el('v-mquota').textContent = state.mapTool.quota; });
el('m-alt').addEventListener('input', () => { state.mapTool.alt = +el('m-alt').value; el('v-malt').textContent = state.mapTool.alt; });
el('m-size').value = String(state.map.size);
el('m-size').addEventListener('change', () => {
  const ns = +el('m-size').value;
  const old = state.map;
  const grid = emptyGrid(ns, 'floor');
  const overlap = Math.min(ns, old.size);
  for (let z = 0; z < overlap; z++) for (let x = 0; x < overlap; x++) {
    const c = old.grid[z][x];
    Object.assign(grid[z][x], { biome: c.biome, quota: c.quota, alt: c.alt });
  }
  state.map = { size: ns, grid };
  state.props = state.props.filter(p => p.x < ns && p.z < ns);
  halfH = Math.max(14, ns + 1); updateFrustum();
  buildWorld(); renderPropList();
  toast('Griglia ' + ns + '×' + ns + ' (celle nuove: pavimento)');
});
el('m-place').addEventListener('click', () => {
  state.mapTool.placing = !state.mapTool.placing;
  brushBtnSync();
});
function refreshAssetSelect() {
  const lib = loadAssetLib();
  const sel = el('m-asset');
  const cur = sel.value;
  sel.innerHTML = '';
  const names = Object.keys(lib);
  if (!names.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— nessun asset in libreria —';
    sel.appendChild(o);
    return;
  }
  names.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n + ' (' + lib[n].cubes.length + ' cubi)';
    sel.appendChild(o);
  });
  if (names.includes(cur)) sel.value = cur;
}
function renderPropList() {
  const box = el('prop-list');
  box.innerHTML = '';
  state.props.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = '<span style="flex:1">' + p.name + ' (' + p.x + ', ' + p.z + ')</span>';
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = 'X';
    del.addEventListener('click', () => { state.props.splice(idx, 1); buildProps(); renderPropList(); });
    item.appendChild(del);
    box.appendChild(item);
  });
}
renderPropList();
function mapJSON() {
  const cells = [];
  for (let z = 0; z < state.map.size; z++) for (let x = 0; x < state.map.size; x++) {
    const c = state.map.grid[z][x];
    if (c.biome === 'void') continue;
    const out = { x, z, biome: c.biome, quota: c.quota, alt: c.alt };
    if (c.mat) out.mat = c.mat;   // materiale (contratto: campo opzionale)
    cells.push(out);
  }
  return { seed: SEED, size: state.map.size, sub: SUB, cells, props: state.props };
}
el('m-save').addEventListener('click', () => {
  localStorage.setItem('voxelproto_map', JSON.stringify(mapJSON()));
  toast('Mappa salvata — il gioco la usa al prossimo avvio');
});
el('m-reset').addEventListener('click', () => {
  localStorage.removeItem('voxelproto_map');
  state.map = { size: DEFAULT_SIZE, grid: buildDemoMap(SEED, DEFAULT_SIZE) };
  state.props = [];
  el('m-size').value = String(DEFAULT_SIZE);
  halfH = Math.max(14, DEFAULT_SIZE + 1); updateFrustum();
  buildWorld(); renderPropList();
  toast('Mappa demo ripristinata');
});
el('m-export').addEventListener('click', () => copyJSON(mapJSON(), 'JSON mappa'));

// ---------- Scheda VOXEL ----------
function makeSwatches(containerId, onPick) {
  const box = el(containerId);
  DB32.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.title = c;
    b.addEventListener('click', () => onPick(c));
    box.appendChild(b);
  });
}
makeSwatches('vx-swatches', (c) => { state.voxel.color = c; el('vx-color').value = c; });
el('vx-color').addEventListener('input', () => { state.voxel.color = el('vx-color').value; });
el('vx-grid').addEventListener('change', () => { state.voxel.area = +el('vx-grid').value; rebuildAssetScene(); });
el('vx-cube').addEventListener('change', () => { state.voxel.cube = +el('vx-cube').value; });
el('vx-pen').addEventListener('click', () => {
  state.voxel.tool = 'pen';
  el('vx-pen').classList.add('active'); el('vx-erase').classList.remove('active');
});
el('vx-erase').addEventListener('click', () => {
  state.voxel.tool = 'erase';
  el('vx-erase').classList.add('active'); el('vx-pen').classList.remove('active');
});
el('vx-clear').addEventListener('click', () => { state.voxel.cubes.length = 0; rebuildAssetScene(); });

// Normalizza un asset di libreria al formato v2 {x,y,z,s,c} (coordinate mondo).
// Retrocompatibile con il vecchio formato {cubeSize, grid, cubes:[{x,y,z,c}] interi}.
function normalizeAssetCubes(a) {
  if (!a || !Array.isArray(a.cubes)) return [];
  if (a.version >= 2 || (a.cubes[0] && a.cubes[0].s != null)) {
    return a.cubes.map(c => {
      const out = { x: c.x, y: c.y, z: c.z, s: c.s || 1, c: c.c };
      if (c.m) out.m = c.m;   // materiale (contratto: campo opzionale)
      if (c.f) out.f = c.f;   // override texture per faccia
      return out;
    });
  }
  const s = a.cubeSize || 1, g = a.grid || 12;
  return a.cubes.map(c => ({
    x: (c.x - g / 2 + 0.5) * s, y: (c.y + 0.5) * s, z: (c.z - g / 2 + 0.5) * s, s, c: c.c
  }));
}
function assetCubesByName(name) {
  return normalizeAssetCubes(loadAssetLib()[name]);
}

// Metadati asset (v3): surface (regola: dove si piazza), billboard (default: mondo),
// yOff (altezza dal suolo, default 0 = tocca terra), walkable, tags, light.
function assetMetaFromUI() {
  const meta = {
    surface: el('vx-surface').value,
    billboard: el('vx-billboard').checked,
    yOff: +el('vx-yoff').value || 0,
    walkable: el('vx-walkable').checked,
    tags: el('vx-tags').value.split(',').map(s => s.trim()).filter(Boolean)
  };
  if (el('vx-light-on').checked) {
    meta.light = {
      color: el('vx-light-color').value,
      intensity: +el('vx-light-int').value || 1.6,
      range: +el('vx-light-range').value || 6,
      flicker: el('vx-light-flicker').checked
    };
  }
  return meta;
}
function assetMetaToUI(a) {
  el('vx-surface').value = (a && a.surface) || 'floor';
  el('vx-billboard').checked = !!(a && a.billboard);
  el('vx-yoff').value = (a && a.yOff) || 0;
  el('v-yoff').textContent = (a && a.yOff) || 0;
  el('vx-walkable').checked = !!(a && a.walkable);
  el('vx-tags').value = ((a && a.tags) || []).join(', ');
  el('vx-light-on').checked = !!(a && a.light);
  el('vx-light-row').style.display = (a && a.light) ? '' : 'none';
  if (a && a.light) {
    el('vx-light-color').value = a.light.color || '#ffd9a0';
    el('vx-light-int').value = a.light.intensity != null ? a.light.intensity : 1.6;
    el('vx-light-range').value = a.light.range || 6;
    el('vx-light-flicker').checked = a.light.flicker !== false;
  }
}
function assetJSON(name) {
  return Object.assign({
    name: name || el('vx-name').value || 'senza-nome',
    version: 3,
    area: state.voxel.area,
    cubes: state.voxel.cubes.map(c => {
      const out = { x: c.x, y: c.y, z: c.z, s: c.s, c: c.c };
      if (c.m) out.m = c.m;
      if (c.f) out.f = c.f;
      return out;
    })
  }, assetMetaFromUI());
}
// Thumbnail isometrica 2D dei cubi (per libreria e anteprima piazzamento)
function drawAssetThumb(cv, cubes) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!cubes || !cubes.length) return;
  let maxR = 1;
  cubes.forEach(c => { maxR = Math.max(maxR, Math.abs(c.x) + (c.s || 1), Math.abs(c.z) + (c.s || 1), c.y + (c.s || 1)); });
  const S = Math.max(2, Math.min(cv.width, cv.height * 2) / (maxR * 4));
  const ox = cv.width / 2, oy = cv.height * 0.72;
  function shade(hex, f) {
    const n = parseInt((hex || '#8f563b').slice(1), 16);
    const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')';
  }
  cubes.slice().sort((a, b) => (a.x + a.z + a.y) - (b.x + b.z + b.y)).forEach(c => {
    const s = (c.s || 1) * S;
    const px = ox + (c.x - c.z) * S, py = oy + (c.x + c.z) * S / 2 - c.y * S;
    ctx.fillStyle = shade(c.c, 1.15);
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py - s / 2); ctx.lineTo(px, py); ctx.lineTo(px - s, py - s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(c.c, 0.78);
    ctx.beginPath(); ctx.moveTo(px - s, py - s / 2); ctx.lineTo(px, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s, py + s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(c.c, 0.55);
    ctx.beginPath(); ctx.moveTo(px + s, py - s / 2); ctx.lineTo(px, py); ctx.lineTo(px, py + s); ctx.lineTo(px + s, py + s / 2); ctx.closePath(); ctx.fill();
  });
}
// Variante colore: clona l'asset con tutti i colori ruotati di tonalità (per bioma)
function hueShiftHex(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2, sN = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  h = (h + deg) % 360;
  const C = (1 - Math.abs(2 * l - 1)) * sN, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) { rr = C; gg = X; } else if (h < 120) { rr = X; gg = C; } else if (h < 180) { gg = C; bb = X; }
  else if (h < 240) { gg = X; bb = C; } else if (h < 300) { rr = X; bb = C; } else { rr = C; bb = X; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(rr) + to(gg) + to(bb);
}
function loadAssetLib() {
  try { return JSON.parse(localStorage.getItem('voxelproto_assets') || '{}'); } catch (e) { return {}; }
}
function renderAssetList() {
  const lib = loadAssetLib();
  const box = el('asset-list');
  const filter = (el('vx-filter').value || '').toLowerCase().trim();
  box.innerHTML = '';
  Object.keys(lib).forEach(name => {
    const a = lib[name];
    const hay = (name + ' ' + ((a.tags || []).join(' '))).toLowerCase();
    if (filter && hay.indexOf(filter) < 0) return;
    const item = document.createElement('div');
    item.className = 'item';
    const thumb = document.createElement('canvas');
    thumb.width = 44; thumb.height = 40; thumb.style.cssText = 'background:#101321;border-radius:4px;flex:none';
    drawAssetThumb(thumb, normalizeAssetCubes(a));
    item.appendChild(thumb);
    const label = document.createElement('span');
    label.style.flex = '1';
    label.innerHTML = name + ' <span class="dim">(' + a.cubes.length + ' cubi' +
      ((a.tags || []).length ? ' · ' + a.tags.join(', ') : '') + ')</span>';
    item.appendChild(label);
    const load = document.createElement('button');
    load.type = 'button'; load.textContent = 'Apri';
    load.addEventListener('click', () => {
      state.voxel.cubes = normalizeAssetCubes(a);
      const rawArea = a.area || (a.grid || 12) * (a.cubeSize || 0.5);
      state.voxel.area = [3, 6, 9].reduce((b, o) => Math.abs(o - rawArea) < Math.abs(b - rawArea) ? o : b, 6);
      el('vx-grid').value = String(state.voxel.area);
      el('vx-name').value = name;
      assetMetaToUI(a);
      rebuildAssetScene();
    });
    const vari = document.createElement('button');
    vari.type = 'button'; vari.textContent = '🎨'; vari.title = 'Variante colore (ruota la tonalità)';
    vari.addEventListener('click', () => {
      const deg = parseFloat(prompt('Rotazione tonalità in gradi (es. 120 = verde→blu):', '120'));
      if (isNaN(deg)) return;
      const copy = JSON.parse(JSON.stringify(a));
      copy.name = name + '-var' + Math.round(deg);
      copy.cubes = copy.cubes.map(c => Object.assign({}, c, { c: hueShiftHex(c.c || '#8f563b', deg) }));
      const l = loadAssetLib(); l[copy.name] = copy;
      localStorage.setItem('voxelproto_assets', JSON.stringify(l));
      renderAssetList();
      toast('Variante «' + copy.name + '» creata');
    });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = 'X';
    del.addEventListener('click', () => {
      const l = loadAssetLib(); delete l[name];
      localStorage.setItem('voxelproto_assets', JSON.stringify(l));
      renderAssetList();
    });
    item.appendChild(load); item.appendChild(vari); item.appendChild(del);
    box.appendChild(item);
  });
}
renderAssetList();
el('vx-save').addEventListener('click', () => {
  const a = assetJSON();
  const lib = loadAssetLib();
  lib[a.name] = a;
  localStorage.setItem('voxelproto_assets', JSON.stringify(lib));
  renderAssetList();
  toast('Asset "' + a.name + '" salvato in libreria');
});
el('vx-export').addEventListener('click', () => copyJSON(assetJSON(), 'JSON asset'));

// ---------- Scheda PIXEL ----------
const px = { size: 16, tool: 'pen', color: '#df7126' };
const pxNative = document.createElement('canvas');
let pxCtx = null;
const pxDisplay = el('px-canvas');
const pxDCtx = pxDisplay.getContext('2d');
function pxInit(size) {
  px.size = size;
  pxNative.width = size; pxNative.height = size;
  pxCtx = pxNative.getContext('2d', { willReadFrequently: true });
  pxRedraw();
}
function pxRedraw() {
  const S = 512, n = px.size, s = S / n;
  pxDCtx.imageSmoothingEnabled = false;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    pxDCtx.fillStyle = (x + y) % 2 ? '#e3e3e3' : '#f4f4f4';
    pxDCtx.fillRect(x * s, y * s, s, s);
  }
  pxDCtx.drawImage(pxNative, 0, 0, S, S);
  pxDCtx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 1; i < n; i++) {
    pxDCtx.beginPath(); pxDCtx.moveTo(i * s, 0); pxDCtx.lineTo(i * s, S); pxDCtx.stroke();
    pxDCtx.beginPath(); pxDCtx.moveTo(0, i * s); pxDCtx.lineTo(S, i * s); pxDCtx.stroke();
  }
}
function pxCoord(e) {
  const r = pxDisplay.getBoundingClientRect();
  const scale = (r.width || 512) / px.size;
  const x = Math.floor((e.clientX - r.left) / scale);
  const y = Math.floor((e.clientY - r.top) / scale);
  return { x: Math.min(px.size - 1, Math.max(0, x)), y: Math.min(px.size - 1, Math.max(0, y)) };
}
function hexToRGBA(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}
function pxApply(x, y) {
  if (px.tool === 'pen') { pxCtx.fillStyle = px.color; pxCtx.fillRect(x, y, 1, 1); }
  else if (px.tool === 'erase') pxCtx.clearRect(x, y, 1, 1);
  else if (px.tool === 'pick') {
    const d = pxCtx.getImageData(x, y, 1, 1).data;
    if (d[3] > 0) {
      px.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      el('px-color').value = px.color;
    }
    return;
  }
  else if (px.tool === 'fill') {
    const img = pxCtx.getImageData(0, 0, px.size, px.size);
    const idx = (xx, yy) => (yy * px.size + xx) * 4;
    const t = idx(x, y);
    const target = [img.data[t], img.data[t + 1], img.data[t + 2], img.data[t + 3]];
    const rep = hexToRGBA(px.color);
    if (target.join() === rep.join()) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= px.size || cy >= px.size) continue;
      const i = idx(cx, cy);
      if (img.data[i] !== target[0] || img.data[i + 1] !== target[1] || img.data[i + 2] !== target[2] || img.data[i + 3] !== target[3]) continue;
      img.data.set(rep, i);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    pxCtx.putImageData(img, 0, 0);
  }
  pxRedraw();
}
let pxDown = false;
pxDisplay.addEventListener('pointerdown', (e) => { pxDown = true; const c = pxCoord(e); pxApply(c.x, c.y); });
pxDisplay.addEventListener('pointermove', (e) => {
  if (!pxDown || px.tool === 'fill' || px.tool === 'pick') return;
  const c = pxCoord(e); pxApply(c.x, c.y);
});
window.addEventListener('pointerup', () => { pxDown = false; });

function setPxTool(tool) {
  px.tool = tool;
  for (const t of ['pen', 'erase', 'fill', 'pick']) el('px-' + t).classList.toggle('active', t === tool);
}
for (const t of ['pen', 'erase', 'fill', 'pick']) el('px-' + t).addEventListener('click', () => setPxTool(t));
el('px-color').addEventListener('input', () => { px.color = el('px-color').value; });
makeSwatches('px-swatches', (c) => { px.color = c; el('px-color').value = c; });
el('px-size').addEventListener('change', () => { pxInit(+el('px-size').value); toast('Canvas ' + px.size + '×' + px.size + ' (svuotato)'); });
el('px-clear').addEventListener('click', () => { pxCtx.clearRect(0, 0, px.size, px.size); pxRedraw(); });
el('px-load').addEventListener('click', () => el('px-file').click());
el('px-file').addEventListener('change', () => {
  const f = el('px-file').files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    pxCtx.clearRect(0, 0, px.size, px.size);
    pxCtx.imageSmoothingEnabled = false;
    pxCtx.drawImage(img, 0, 0, px.size, px.size);
    pxRedraw();
    URL.revokeObjectURL(img.src);
    toast('PNG caricato (' + img.naturalWidth + '×' + img.naturalHeight + ' → ' + px.size + '×' + px.size + ')');
  };
  img.src = URL.createObjectURL(f);
  el('px-file').value = '';
});
function pxDownload(scale) {
  let src = pxNative;
  if (scale > 1) {
    const c = document.createElement('canvas');
    c.width = px.size * scale; c.height = px.size * scale;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(pxNative, 0, 0, c.width, c.height);
    src = c;
  }
  const a = document.createElement('a');
  a.download = 'sprite-' + px.size + 'x' + px.size + (scale > 1 ? '@' + scale + 'x' : '') + '.png';
  a.href = src.toDataURL('image/png');
  a.click();
}
el('px-export1').addEventListener('click', () => pxDownload(1));
el('px-export8').addEventListener('click', () => pxDownload(8));
pxInit(16);

// ---------- Loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (yawT < 1) {
    yawT = Math.min(1, yawT + dt / 0.45);
    const ease = yawT < 0.5 ? 4 * yawT ** 3 : 1 - Math.pow(-2 * yawT + 2, 3) / 2;
    yawCur = yawFrom + (yawTarget - yawFrom) * ease;
    placeCamera();
  }
  for (const o of pointLightObjs) {
    if (o.data.flicker) {
      o.light.intensity = o.light.userData.base * (0.82 + 0.18 * Math.sin(t * 11) + 0.12 * Math.sin(t * 23 + 1.7));
    }
  }
  // prop: billboard verso la camera, bob per gli item che fluttuano, sfarfallio luci
  const faceY = THREE.MathUtils.degToRad(90 - yawCur);
  for (const g of propBillboards) g.rotation.y = faceY;
  for (const b of propBobs) b.g.position.y = b.baseY + 0.12 * Math.sin(t * 1.8 + b.ph);
  for (const pl of propLights) pl.intensity = pl.userData.base * (0.82 + 0.18 * Math.sin(t * 11) + 0.12 * Math.sin(t * 23 + 1.7));
  animateLiquids(waterMesh, waterAnim, t, 0.1, 1.3);   // acqua: onda dolce ±0.1
  animateLiquids(lavaMesh, lavaAnim, t, 0.1, 0.7);     // lava: più lenta e densa
  if (state.tab !== 'pixel') {
    renderer.render(state.tab === 'voxel' ? sceneAsset : sceneWorld, camera);
  }
}
animate();

// Debug per test automatizzati
window.__editorDebug = {
  state, buildWorld, buildProps, voxelClick, paintAt, mapJSON,
  addPointLight, pointLightObjs, pxApply, pxNative, setTab,
  assetJSON, lightsJSON, normalizeAssetCubes, renderPropList, refreshAssetSelect
};

// ============================================================
// PONTE STUDIO ↔ VAULT (landing studio.html → voxelproto_plan_ctx)
// Il piano aperto dallo Studio porta con sé id/level/kind/slots/meta,
// il vault di destinazione e i requisiti (levelNodeCount, ruleset).
// «Salva nel vault» ricompone il contratto mappai-dungeon-floor@1,
// genera SLOT AUTOMATICI se mancanti (E1 = editing manuale, non ancora),
// valida con MappAIDungeonCore.validatePlan e scrive via IPC.
// ============================================================
const PLAN_CTX = (() => {
  try { return JSON.parse(localStorage.getItem('voxelproto_plan_ctx') || 'null'); }
  catch (e) { return null; }
})();

// Slot automatici: spawn = prima cella libera, uscita = cella raggiungibile più
// lontana (BFS), memorie = K celle raggiungibili massimamente sparse (greedy
// farthest-point). Garantisce piani validi anche senza slot disegnati a mano.
function autoSlots(cells, size, K, isLast) {
  const open = {}, qmap = {}, list = [];
  cells.forEach(c => {
    const blocked = (c.blocca != null) ? !!c.blocca : (c.biome !== 'floor');
    if (!blocked) {
      open[c.x + ',' + c.z] = true;
      qmap[c.x + ',' + c.z] = (typeof c.quota === 'number' && isFinite(c.quota)) ? c.quota : 0;
      list.push([c.x, c.z]);
    }
  });
  if (!list.length) return [];
  // §21: stessa raggiungibilità del gioco — una rupe > STEP_UP_JUMP è un muro
  const JUMP = (window.MappAIDungeonCore && window.MappAIDungeonCore.STEP_UP_JUMP) || 1.6;
  const start = list[0];
  const dist = {}; dist[start.join(',')] = 0;
  const q = [start];
  while (q.length) {
    const [cx, cz] = q.shift();
    const ck = cx + ',' + cz;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (cx + dx) + ',' + (cz + dz);
      if (open[k] && dist[k] === undefined && Math.abs(qmap[k] - qmap[ck]) <= JUMP) { dist[k] = dist[ck] + 1; q.push([cx + dx, cz + dz]); }
    }
  }
  const reach = list.filter(p => dist[p.join(',')] !== undefined);
  let far = reach[0];
  reach.forEach(p => { if (dist[p.join(',')] > dist[far.join(',')]) far = p; });
  const slots = [
    { type: 'spawn', x: start[0], z: start[1] },
    { type: isLast ? 'gatekeeper' : 'stairs', x: far[0], z: far[1] }
  ];
  // memorie: greedy farthest-point sui raggiungibili (escludi spawn/uscita)
  const used = [start, far];
  const cand = reach.filter(p => !used.some(u => u[0] === p[0] && u[1] === p[1]));
  const want = Math.min(K || 0, cand.length);
  for (let i = 0; i < want; i++) {
    let best = null, bestD = -1;
    for (const p of cand) {
      if (used.some(u => u[0] === p[0] && u[1] === p[1])) continue;
      let d = Infinity;
      for (const u of used) d = Math.min(d, Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]));
      if (d > bestD) { bestD = d; best = p; }
    }
    if (!best) break;
    used.push(best);
    slots.push({ type: 'memory', x: best[0], z: best[1] });
  }
  return slots;
}

function buildContractPlan() {
  const m = mapJSON();
  const slots = (PLAN_CTX.slots && PLAN_CTX.slots.length)
    ? PLAN_CTX.slots
    : autoSlots(m.cells, m.size, PLAN_CTX.levelNodeCount || 0, !!PLAN_CTX.isLast);
  return {
    schema: 'mappai-dungeon-floor@1',
    id: PLAN_CTX.id, level: PLAN_CTX.level, kind: PLAN_CTX.kind || 'misto',
    size: m.size, sub: m.sub, seed: m.seed,
    cells: m.cells, props: m.props || [],
    slots,
    meta: Object.assign({}, PLAN_CTX.meta || {}, { modified: new Date().toISOString().slice(0, 10) })
  };
}

if (PLAN_CTX) {
  el('vault-bar').style.display = 'block';
  el('vb-info').textContent = PLAN_CTX.id + ' · livello ' + PLAN_CTX.level + ' · ' + (PLAN_CTX.kind || 'misto') +
    (PLAN_CTX.vaultName ? ' · vault: ' + PLAN_CTX.vaultName : ' · nessun vault (solo modifica)');
  el('vb-req').textContent = (PLAN_CTX.levelNodeCount != null)
    ? 'Richieste ' + PLAN_CTX.levelNodeCount + ' memorie' +
      ((PLAN_CTX.slots || []).length ? ' · slot dal piano: ' + PLAN_CTX.slots.length : ' · slot AUTO al salvataggio')
    : 'Requisiti sconosciuti (nessun progetto legato): coverage verificata all\'import';
  el('vb-save').addEventListener('click', () => {
    if (!PLAN_CTX.vaultPath) { toast('Nessun vault di destinazione: riapri dallo Studio scegliendo un vault'); return; }
    if (!window.electronAPI || !window.electronAPI.saveDungeonFloor) { toast('Salvataggio nel vault solo dentro l\'app Electron'); return; }
    const plan = buildContractPlan();
    const C = window.MappAIDungeonCore;
    const v = C.validatePlan(plan, PLAN_CTX.ruleset || null, PLAN_CTX.levelNodeCount != null ? PLAN_CTX.levelNodeCount : null);
    if (!v.ok) { alert('Piano non salvabile:\n\n' + v.errors.map(e => '• ' + e.msg).join('\n')); return; }
    if (v.warnings.length && !confirm('Avvisi:\n\n' + v.warnings.map(w => '• ' + w.msg).join('\n') + '\n\nSalvare comunque?')) return;
    window.electronAPI.saveDungeonFloor({ vaultPath: PLAN_CTX.vaultPath, plan }).then(r => {
      if (r && r.success) {
        PLAN_CTX.slots = plan.slots;   // slot auto stabilizzati per i salvataggi successivi
        localStorage.setItem('voxelproto_plan_ctx', JSON.stringify(PLAN_CTX));
        toast('Salvato nel vault: ' + r.file + (r.overwritten ? ' (sovrascritto)' : ''));
      } else toast('Errore: ' + ((r && r.error) || '?'));
    });
  });
  el('vb-try').addEventListener('click', () => {
    localStorage.setItem('voxelproto_map', JSON.stringify(mapJSON()));
    location.href = './index.html';
  });
}

// Scorciatoia dalla landing «Solo asset»: #voxel / #pixel aprono la scheda giusta
if (location.hash === '#voxel') setTab('voxel');
else if (location.hash === '#pixel') setTab('pixel');
if (window.__editorDebug) Object.assign(window.__editorDebug, { autoSlots, buildContractPlan: PLAN_CTX ? buildContractPlan : null, PLAN_CTX });

// ============================================================
// GESTIONE ASSET v3 — wiring UI, libreria su file, import .vox
// ============================================================
el('vx-yoff').addEventListener('input', () => { el('v-yoff').textContent = el('vx-yoff').value; });
el('vx-light-on').addEventListener('change', () => { el('vx-light-row').style.display = el('vx-light-on').checked ? '' : 'none'; });
el('vx-filter').addEventListener('input', renderAssetList);
el('m-scale').addEventListener('input', () => { el('v-mscale').textContent = el('m-scale').value; });

// anteprima dell'asset selezionato nella scheda Mappa
function updateMapAssetThumb() {
  const name = el('m-asset').value;
  drawAssetThumb(el('m-asset-thumb'), name ? assetCubesByName(name) : []);
}
el('m-asset').addEventListener('change', updateMapAssetThumb);
{ const _orig = refreshAssetSelect; refreshAssetSelect = function () { _orig(); updateMapAssetThumb(); }; }
updateMapAssetThumb();

// ---------- Libreria su FILE (condivisione tra docenti) ----------
el('vx-lib-export').addEventListener('click', () => {
  const lib = loadAssetLib();
  if (!Object.keys(lib).length) { toast('Libreria vuota'); return; }
  const blob = new Blob([JSON.stringify({ schema: 'mappai-voxel-assets@1', assets: lib }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'libreria-voxel.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Libreria esportata (' + Object.keys(lib).length + ' asset)');
});
el('vx-lib-import').addEventListener('click', () => el('vx-lib-file').click());
el('vx-lib-file').addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(String(rd.result));
      const assets = (data && data.assets) || data;   // accetta anche il dump grezzo
      if (!assets || typeof assets !== 'object') throw new Error('formato');
      const lib = loadAssetLib();
      let n = 0;
      Object.keys(assets).forEach(name => { if (assets[name] && Array.isArray(assets[name].cubes)) { lib[name] = assets[name]; n++; } });
      localStorage.setItem('voxelproto_assets', JSON.stringify(lib));
      renderAssetList(); refreshAssetSelect();
      toast(n + ' asset importati in libreria');
    } catch (e) { toast('File libreria non valido'); }
  };
  rd.readAsText(f);
});

// ---------- Import .vox (MagicaVoxel) ----------
// Parser dei chunk SIZE/XYZI/RGBA (primo modello). Assi: MagicaVoxel è Z-up,
// noi Y-up → (x, y, z)_nostro = (x, z, y)_vox. Palette: usa il chunk RGBA se
// presente (caso normale per asset scaricati); senza chunk applica
// un'approssimazione della palette default (web-safe 216 + rampe).
function voxDefaultPalette() {
  const p = [[0, 0, 0, 0]];
  const v = [255, 204, 153, 102, 51, 0];
  for (const r of v) for (const g of v) for (const b of v) p.push([r, g, b, 255]);
  const ramp = [238, 221, 187, 170, 136, 119, 85, 68, 34, 17];
  for (const e of ramp) p.push([e, 0, 0, 255]);
  for (const e of ramp) p.push([0, e, 0, 255]);
  for (const e of ramp) p.push([0, 0, e, 255]);
  for (const e of ramp.slice(0, 9)) p.push([e, e, e, 255]);
  while (p.length < 256) p.push([0, 0, 0, 255]);
  return p;
}
function parseVox(buf) {
  const dv = new DataView(buf);
  const u32 = (o) => dv.getUint32(o, true);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'VOX ') throw new Error('non è un file .vox');
  let size = null, voxels = null, palette = null;
  let o = 8;
  const main = { id: tag(o), n: u32(o + 4), m: u32(o + 8) };
  if (main.id !== 'MAIN') throw new Error('chunk MAIN mancante');
  o += 12 + main.n;
  const end = Math.min(buf.byteLength, o + main.m);
  while (o + 12 <= end) {
    const id = tag(o), n = u32(o + 4), m = u32(o + 8), body = o + 12;
    if (id === 'SIZE' && !size) size = { x: u32(body), y: u32(body + 4), z: u32(body + 8) };
    else if (id === 'XYZI' && !voxels) {
      const cnt = u32(body); voxels = [];
      for (let i = 0; i < cnt; i++) {
        const b = body + 4 + i * 4;
        voxels.push({ x: dv.getUint8(b), y: dv.getUint8(b + 1), z: dv.getUint8(b + 2), i: dv.getUint8(b + 3) });
      }
    } else if (id === 'RGBA') {
      palette = [[0, 0, 0, 0]];
      for (let i = 0; i < 255; i++) {
        const b = body + i * 4;
        palette.push([dv.getUint8(b), dv.getUint8(b + 1), dv.getUint8(b + 2), dv.getUint8(b + 3)]);
      }
    }
    o = body + n + m;
  }
  if (!size || !voxels) throw new Error('modello vuoto (SIZE/XYZI mancanti)');
  return { size, voxels, palette: palette || voxDefaultPalette() };
}
// Riduzione 2×: raggruppa i voxel in celle 2×2×2, tiene il colore più frequente
function downsampleVox(voxels) {
  const cells = {};
  for (const v of voxels) {
    const k = (v.x >> 1) + ',' + (v.y >> 1) + ',' + (v.z >> 1);
    (cells[k] = cells[k] || []).push(v.i);
  }
  return Object.keys(cells).map(k => {
    const p = k.split(',').map(Number);
    const counts = {};
    let best = cells[k][0], bn = 0;
    for (const i of cells[k]) { counts[i] = (counts[i] || 0) + 1; if (counts[i] > bn) { bn = counts[i]; best = i; } }
    return { x: p[0], y: p[1], z: p[2], i: best };
  });
}
const VOX_WARN = 3000, VOX_MAX = 10000;   // accortezza 2: cap per il frame rate
el('vx-import-vox').addEventListener('click', () => el('vx-vox-file').click());
el('vx-vox-file').addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let vox;
    try { vox = parseVox(rd.result); }
    catch (e) { toast('Import fallito: ' + e.message); return; }
    let voxels = vox.voxels;
    if (voxels.length > VOX_WARN) {
      if (confirm('Modello grande (' + voxels.length + ' voxel): ridurlo 2× per proteggere il frame rate?')) {
        voxels = downsampleVox(voxels);
      }
    }
    if (voxels.length > VOX_MAX) { toast('Troppo grande anche ridotto (' + voxels.length + ' voxel, max ' + VOX_MAX + ')'); return; }
    // assi vox (Z-up) → nostri (Y-up); centro su x/z, poggia a y=0; scala per stare nell'area
    const maxDim = Math.max(vox.size.x, vox.size.y, vox.size.z, 1);
    const s = Math.min(1, 6 / maxDim);
    const cx = vox.size.x / 2, cz = vox.size.y / 2;   // la y vox è la nostra z
    state.voxel.cubes = voxels.map(v => ({
      x: (v.x - cx + 0.5) * s,
      y: (v.z + 0.5) * s,
      z: (v.y - cz + 0.5) * s,
      s,
      c: '#' + vox.palette[v.i].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('')
    }));
    state.voxel.area = [3, 6, 9].reduce((b, o2) => Math.abs(o2 - maxDim * s) < Math.abs(b - maxDim * s) ? o2 : b, 6);
    el('vx-grid').value = String(state.voxel.area);
    el('vx-name').value = f.name.replace(/\.vox$/i, '');
    assetMetaToUI(null);   // proprietà da compilare: superficie, billboard, yOff…
    rebuildAssetScene();
    setTab('voxel');
    toast(state.voxel.cubes.length + ' voxel importati — imposta le proprietà e Salva. Ricorda: controlla la licenza dell\'asset.');
  };
  rd.readAsArrayBuffer(f);
});

if (window.__editorDebug) Object.assign(window.__editorDebug, { parseVox, downsampleVox, drawAssetThumb, hueShiftHex, voxDefaultPalette, assetMetaFromUI });

// ============================================================
// MATERIALI & TEXTURE — UI (scheda Materiali, Pixel→texture, select condivisi)
// Contratto: cells.mat · cubes.m/f · Memory Dungeon/materiali.json
// ============================================================
const _imgCache = {};
function texImage(name) {
  if (_imgCache[name]) return _imgCache[name];
  const entry = VM.loadTexLib()[name];
  if (!entry) return null;
  const img = new Image();
  img.src = entry.png;
  return (_imgCache[name] = img);
}
function allTexTags() {
  const texLib = VM.loadTexLib(), tags = new Set();
  Object.keys(texLib).forEach(n => (texLib[n].tags || []).forEach(t => tags.add(t)));
  return [...tags].sort();
}
// riempie una select con: vuoto ("colore") + #tag + nomi texture
function fillRefSelect(sel, emptyLabel) {
  const cur = sel.value;
  sel.innerHTML = '';
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
  opt('', emptyLabel || '— solo colore —');
  allTexTags().forEach(t => opt('#' + t, '#' + t + ' (random tra le texture col tag)'));
  Object.keys(VM.loadTexLib()).sort().forEach(n => opt(n, n));
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}
function refreshMatSelects() {
  fillRefSelect(el('mt-top'));
  fillRefSelect(el('mt-side'));
  fillRefSelect(el('mt-bottom'));
  fillRefSelect(el('vx-texref'), '— togli texture (colore) —');
  if (el('m-texref')) fillRefSelect(el('m-texref'), '— nessuna —');   // #1: texture/tag diretta sul pavimento
  const matLib = VM.loadMatLib();
  for (const id of ['m-mat', 'vx-mat']) {
    const sel = el(id), cur = sel.value;
    sel.innerHTML = '';
    const o0 = document.createElement('option'); o0.value = '';
    o0.textContent = id === 'm-mat' ? '— nessuno (colori) —' : '— colore semplice —';
    sel.appendChild(o0);
    Object.keys(matLib).sort().forEach(n => {
      const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
}
// anteprima cubo isometrico con texture reali (canvas 2D, trasformazioni affini)
function drawMaterialPreview() {
  const cv = el('mt-preview'), ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const texLib = VM.loadTexLib();
  const S = 46, H = 46, cx = cv.width / 2, cy = 34;
  const refs = { top: el('mt-top').value, side: el('mt-side').value };
  const color = el('mt-color').value;
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')';
  }
  function paintFace(P0, U, V, ref, f, dark) {
    const name = VM.resolveRef(ref, texLib, 'preview|' + f);
    const img = name && texImage(name);
    if (img && img.complete && img.naturalWidth) {
      ctx.setTransform(U[0] / img.naturalWidth, U[1] / img.naturalWidth,
        V[0] / img.naturalHeight, V[1] / img.naturalHeight, P0[0], P0[1]);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // velo di shading per leggere il volume anche con texture
      ctx.fillStyle = 'rgba(0,0,0,' + dark + ')';
      ctx.beginPath();
      ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P0[0] + U[0], P0[1] + U[1]);
      ctx.lineTo(P0[0] + U[0] + V[0], P0[1] + U[1] + V[1]); ctx.lineTo(P0[0] + V[0], P0[1] + V[1]);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = shade(color, dark === 0 ? 1.15 : (dark < 0.2 ? 0.78 : 0.55));
      ctx.beginPath();
      ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P0[0] + U[0], P0[1] + U[1]);
      ctx.lineTo(P0[0] + U[0] + V[0], P0[1] + U[1] + V[1]); ctx.lineTo(P0[0] + V[0], P0[1] + V[1]);
      ctx.closePath(); ctx.fill();
    }
  }
  paintFace([cx - S, cy + S / 2], [S, -S / 2], [S, S / 2], refs.top, 'top', 0);          // top
  paintFace([cx - S, cy + S / 2], [S, S / 2], [0, H], refs.side, 'sud', 0.16);           // sinistra
  paintFace([cx, cy + S], [S, -S / 2], [0, H], refs.side, 'est', 0.34);                  // destra
}
for (const id of ['mt-top', 'mt-side', 'mt-bottom', 'mt-color']) {
  el(id).addEventListener('change', drawMaterialPreview);
}
function renderMaterialLists() {
  const texLib = VM.loadTexLib(), matLib = VM.loadMatLib();
  const tx = el('tx-list'); tx.innerHTML = '';
  Object.keys(texLib).sort().forEach(name => {
    const item = document.createElement('div'); item.className = 'item';
    const img = new Image(); img.src = texLib[name].png;
    img.style.cssText = 'width:32px;height:32px;image-rendering:pixelated;border-radius:4px;background:#fff';
    item.appendChild(img);
    const label = document.createElement('span'); label.style.flex = '1';
    label.innerHTML = name + ' <span class="dim">(' + (texLib[name].tags || []).join(', ') + ')</span>';
    item.appendChild(label);
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'X';
    del.addEventListener('click', () => {
      const l = VM.loadTexLib(); delete l[name]; VM.saveTexLib(l);
      delete _imgCache[name];
      refreshMaterialUI(); buildWorld(); buildProps();
    });
    item.appendChild(del);
    tx.appendChild(item);
  });
  const mt = el('mt-list'); mt.innerHTML = '';
  Object.keys(matLib).sort().forEach(name => {
    const m = matLib[name];
    const item = document.createElement('div'); item.className = 'item';
    const label = document.createElement('span'); label.style.flex = '1';
    label.innerHTML = name + ' <span class="dim">(' + (m.tags || []).join(', ') + ')</span>';
    item.appendChild(label);
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Apri';
    edit.addEventListener('click', () => {
      el('mt-name').value = name;
      el('mt-color').value = m.color || '#8f563b';
      el('mt-top').value = (m.faces && (m.faces.top !== undefined ? m.faces.top : m.faces.all)) || '';
      el('mt-side').value = (m.faces && (m.faces.side !== undefined ? m.faces.side : m.faces.all)) || '';
      el('mt-bottom').value = (m.faces && m.faces.bottom) || '';
      el('mt-tags').value = (m.tags || []).join(', ');
      drawMaterialPreview();
    });
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'X';
    del.addEventListener('click', () => {
      const l = VM.loadMatLib(); delete l[name]; VM.saveMatLib(l);
      refreshMaterialUI(); buildWorld(); buildProps();
    });
    item.appendChild(edit); item.appendChild(del);
    mt.appendChild(item);
  });
}
function refreshMaterialUI() { refreshMatSelects(); renderMaterialLists(); drawMaterialPreview(); }
el('mt-save').addEventListener('click', () => {
  const name = (el('mt-name').value || '').trim();
  if (!name) { toast('Dai un nome al materiale'); return; }
  const lib = VM.loadMatLib();
  lib[name] = {
    color: el('mt-color').value,
    faces: { top: el('mt-top').value || null, side: el('mt-side').value || null, bottom: el('mt-bottom').value || null },
    tags: el('mt-tags').value.split(',').map(s => s.trim()).filter(Boolean)
  };
  VM.saveMatLib(lib);
  refreshMaterialUI(); buildWorld(); buildProps(); rebuildAssetScene();
  toast('Materiale «' + name + '» salvato');
});
// Pixel → «Salva come texture»
el('px-tex-save').addEventListener('click', () => {
  const name = (el('px-tex-name').value || '').trim();
  if (!name) { toast('Dai un nome alla texture (es. erba-01)'); return; }
  const lib = VM.loadTexLib();
  lib[name] = {
    size: px.size,
    png: pxNative.toDataURL('image/png'),
    tags: el('px-tex-tags').value.split(',').map(s => s.trim()).filter(Boolean)
  };
  VM.saveTexLib(lib);
  delete _imgCache[name];
  refreshMatSelects();
  toast('Texture «' + name + '» in libreria — usala nella scheda Materiali');
});
// strumento «Texture faccia» nel costruttore voxel
el('vx-texface').addEventListener('click', () => {
  state.voxel.tool = 'texface';
  el('vx-texface').classList.add('active');
  el('vx-pen').classList.remove('active'); el('vx-erase').classList.remove('active');
});
el('vx-pen').addEventListener('click', () => el('vx-texface').classList.remove('active'));
el('vx-erase').addEventListener('click', () => el('vx-texface').classList.remove('active'));
// il materiale scelto per i cubi nuovi si riflette subito sul costruttore
el('vx-mat').addEventListener('change', rebuildAssetScene);
el('m-mat').addEventListener('change', () => {});   // usato al prossimo tratto di pennello
refreshMatSelects();

// «Salva nel vault» salva ANCHE le librerie materiali/texture del vault
// (Memory Dungeon/materiali.json) — un piano con facce testurizzate senza
// le sue texture sarebbe rotto dal lato dello studente.
if (PLAN_CTX && PLAN_CTX.vaultPath) {
  el('vb-save').addEventListener('click', () => {
    if (!window.electronAPI || !window.electronAPI.saveDungeonMaterials) return;
    const textures = VM.loadTexLib(), materials = VM.loadMatLib();
    if (!Object.keys(textures).length && !Object.keys(materials).length) return;
    window.electronAPI.saveDungeonMaterials({
      vaultPath: PLAN_CTX.vaultPath,
      materials: { schema: 'mappai-dungeon-materials@1', textures, materials }
    });
  });
}

if (window.__editorDebug) Object.assign(window.__editorDebug, { VM, refreshMaterialUI, drawMaterialPreview,
  liquidCounts: () => ({ water: waterAnim.length, lava: lavaAnim.length,
    lavaMeshCount: lavaMesh ? lavaMesh.count : -1, waterMeshCount: waterMesh ? waterMesh.count : -1,
    lavaColor0: (lavaMesh && lavaMesh.instanceColor) ? [lavaMesh.instanceColor.array[0], lavaMesh.instanceColor.array[1], lavaMesh.instanceColor.array[2]] : null }) });
