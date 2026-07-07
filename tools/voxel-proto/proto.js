import * as THREE from 'three';
import * as VM from './voxel-materials.js';

// ============================================================
// Voxel Proto — Memory Dungeon 3D
// Griglia LOGICA (gameplay) intatta, geometria visiva libera:
// 1 tile logico = SUB×SUB voxel. Ambiente = volumi flat + MATERIALI
// opzionali (texture pixel-art su top pavimenti, top+lati muri e
// facce dei props — contratto: cells.mat, cubes.m/f).
// Characters/NPC/item = sprite 2D billboard (PNG).
// ============================================================

// ---------- RNG seedato (mappa riproducibile) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Costanti ----------
const SUB = 3;                 // voxel visivi per tile logico
const BASE = -1.4;             // fondo dello "slab" (bordo piattaforma)
const SEED = 20260706;
const DEFAULT_SIZE = 16;       // tile logici per lato (mappa demo)
const JITTER = 0.16;           // variazione quota per-voxel pavimento (default)
// Dislivelli (asimmetrici): si SALE poco camminando, di più col salto; si SCENDE
// sempre (cadere dai bordi dei pendii). Mai in acqua/lava/vuoto (quelle sono `blocca`).
const STEP_UP_WALK = 0.9;      // salita camminando: gradini z < 1 percorribili
const STEP_UP_JUMP = 1.6;      // salita col salto: gradini fino a ~z+1.5 (jump automatico)

// Palette: default o salvata dall'editor (tools/voxel-proto/editor.html)
const PAL = (() => {
  const def = {
    floorA: '#dad6ca', floorB: '#bdb9ad',
    wallA: '#b4b0a5', wallB: '#8e8b82',
    waterA: '#4795de', waterB: '#1d5fa5',
    bg: '#ecebe6', jitter: JITTER, colorVar: 1
  };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('voxelproto_palette') || '{}')); }
  catch (e) { return def; }
})();

// ---------- Mappa logica: contratto dati (draft) ----------
// cella: { x, z, biome: 'floor'|'water'|'wall'|'void', quota, alt, blocca }
//   quota  = offset verticale del piano calpestabile (voxel; acqua: negativo)
//   alt    = altezza volume (solo wall)
//   blocca = collisione gameplay
//   void   = fuori mappa: nessuna geometria, invalicabile → forme non rettangolari
// props: asset voxel piazzati { name, x, z, cubes: [{x,y,z,s,c}] } — coordinate
//   cubo locali in unità mondo, s = lato del cubo (1, 0.5, 1/3…)
function demoEntities() {
  return [
    { id: 'hero',       sprite: 'rogue8x8/Girl-Melee',  x: 2,    z: 5 },
    { id: 'gatekeeper', sprite: 'gatekeeper',           x: 5.6,  z: 6.1 },
    { id: 'critter',    sprite: 'rogue8x8/NPC',         x: 8.3,  z: 11.4 },
    { id: 'gem',        sprite: 'rogue8x8/GroundItems', x: 12.2, z: 4.0 },
    // §19.2 — contratto entità v1 (F0: validazione visiva, niente quiz)
    { id: 'src1',   type: 'source',   src: 'libro',  label: 'Fotosintesi',   x: 6.2,  z: 3.1 },
    { id: 'src2',   type: 'source',   src: 'scroll', label: 'Clorofilla',    x: 9.5,  z: 13.2 },
    { id: 'cond1',  type: 'condotto', linkS: 'n1', linkT: 'n2', x: 8, z: 9,
      bridge: [[10, 9], [11, 9], [12, 9], [13, 9]] },
    { id: 'srv1',   type: 'server',   machines: ['n1', 'n2', 'n3'], x: 14.3, z: 12.5 },
    { id: 'ped1',   type: 'pedestal', group: 2, x: 1.5, z: 2.5 },
    { id: 'stair1', type: 'stairs',   x: 14.5, z: 6.5 }
  ];
}

// Costruisce grid+cells da una lista di celle sparse.
// fillBiome: 'floor' per mappe esterne legacy (tutto pavimento), 'void' per mappe editor.
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
    if (c.mat) grid[c.z][c.x].mat = c.mat;   // materiale (contratto: campo opzionale)
  }
  const cells = [];
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) cells.push(grid[z][x]);
  return { grid, cells };
}

function buildDemoMap(seed, size) {
  const rng = mulberry32(seed);
  const { grid, cells } = hydrateCells(size, [], 'floor');
  // Lago: offset z negativo variabile per cella
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (Math.hypot(x - 11.5, z - 9.5) < 2.7) {
      const c = grid[z][x];
      c.biome = 'water';
      c.quota = -(0.35 + rng() * 0.4);
      c.blocca = true;
    }
  }
  // Muro con porta (gap a z=6)
  for (const z of [4, 5, 7]) Object.assign(grid[z][4], { biome: 'wall', alt: 2, blocca: true });
  // Torre
  for (const [x, z] of [[2, 11], [3, 11], [2, 12], [3, 12]]) Object.assign(grid[z][x], { biome: 'wall', alt: 3, blocca: true });
  // Rocce basse
  for (const [x, z] of [[8, 2], [13, 8]]) Object.assign(grid[z][x], { biome: 'wall', alt: 1, blocca: true });
  // Piattaforma rialzata + gradino di accesso
  for (const [x, z] of [[13, 2], [14, 2], [13, 3], [14, 3]]) grid[z][x].quota = 1;
  grid[2][12].quota = 0.5;
  return { seed, size, sub: SUB, cells, grid, props: [], entities: demoEntities() };
}

// Mappa disegnata nell'editor (localStorage voxelproto_map): celle sparse su fondo void.
function loadEditorMap() {
  try {
    const s = JSON.parse(localStorage.getItem('voxelproto_map') || 'null');
    if (!s || !Number.isInteger(s.size) || !Array.isArray(s.cells)) return null;
    const { grid, cells } = hydrateCells(s.size, s.cells, 'void');
    console.log('[map] caricata mappa editor (localStorage), size', s.size);
    return {
      seed: s.seed || SEED, size: s.size, sub: SUB, cells, grid,
      props: Array.isArray(s.props) ? s.props : [],
      entities: (Array.isArray(s.entities) && s.entities.length) ? s.entities : demoEntities()
    };
  } catch (e) { console.warn('voxelproto_map non valida', e); return null; }
}

// Mappa esterna via query string: ?map=maps/nome.json (o ?map=nome → maps/nome.json).
// Formato = contratto dati qui sopra. Fallback silenzioso sulla demo se assente/rotta.
async function loadExternalMap() {
  const name = new URLSearchParams(location.search).get('map');
  if (!name) return null;
  const url = name.endsWith('.json') ? name : 'maps/' + name + '.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d || !Array.isArray(d.cells)) throw new Error('formato non valido (cells mancanti)');
    const size = (Number.isInteger(d.size) && d.size >= 4 && d.size <= 64) ? d.size : DEFAULT_SIZE;
    // fill 'floor' per compatibilità con le mappe esterne esistenti;
    // le celle possono comunque dichiarare biome:'void' per forme non rettangolari
    const { grid, cells } = hydrateCells(size, d.cells, 'floor');
    console.log('[map] caricata', url, d.meta || '');
    return {
      seed: d.seed || SEED, size, sub: SUB, cells, grid,
      props: Array.isArray(d.props) ? d.props : [],
      entities: Array.isArray(d.entities) ? d.entities : [], meta: d.meta || null,
      palette: d.palette || null,  // §19.5: ogni stanza curata porta la sua palette (bioma)
      lit: !!d.lit                 // stanza illuminata (esterni/hub): niente buio+lanterna
    };
  } catch (e) {
    console.warn('[map] caricamento fallito (' + url + '), uso demo:', e);
    return null;
  }
}

// Priorità: ?map= (file esterno) → mappa editor (localStorage) → demo
const MAP = (await loadExternalMap()) || loadEditorMap() || buildDemoMap(SEED, DEFAULT_SIZE);
if (MAP.palette) Object.assign(PAL, MAP.palette);   // bioma della stanza > default/editor
const LOGICAL = MAP.size;      // tile logici per lato (dinamico)
const WORLD = LOGICAL * SUB;   // unità mondo
window.MAP_DATA = {
  seed: MAP.seed, size: MAP.size, sub: MAP.sub,
  cells: MAP.cells.filter(c => c.biome !== 'void'),
  props: MAP.props || [], entities: MAP.entities
};

// ---------- Scena, camera, renderer ----------
const container = document.getElementById('scene');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Fallback dimensioni: alcuni ambienti headless riportano innerWidth/Height = 0
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

const ELEV = Math.atan(1 / Math.SQRT2); // isometrica classica ~35.26°
let yawCur = 45, yawFrom = 45, yawTarget = 45, yawT = 1;
// Camera-follow: la camera orbita attorno a camTarget, che insegue l'eroe (lerp nel loop)
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

// ---------- Luci ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xb5b1a4, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xfff2dd, 2.2);
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

// Setup luci salvato dall'editor (luce generale + punti luce/torce)
const flickerLights = [];
try {
  const L = JSON.parse(localStorage.getItem('voxelproto_lights') || 'null');
  if (L) {
    if (L.hemi != null) hemi.intensity = L.hemi;
    if (L.dir != null) dir.intensity = L.dir;
    if (L.dirColor) dir.color.set(L.dirColor);
    if (L.dirPos) dir.position.set(L.dirPos.x, L.dirPos.y, L.dirPos.z);
    (L.points || []).forEach(pt => {
      const pl = new THREE.PointLight(pt.color || '#ffb347', pt.intensity ?? 12, pt.range ?? 10, 1.8);
      pl.position.set(pt.x, pt.y, pt.z);
      pl.userData.base = pl.intensity;
      pl.userData.flicker = !!pt.flicker;
      if (pt.flicker) flickerLights.push(pl);
      scene.add(pl);
    });
  }
} catch (e) { console.warn('voxelproto_lights non valido', e); }
// Offset della luce direzionale rispetto al punto seguito: la luce (e la sua
// shadow camera) trasla con l'eroe così le ombre restano nitide attorno a lui
const dirOffset = dir.position.clone();

// ---------- Geometria: volumi voxel senza texture ----------
function cellWorld(l) { return (l + 0.5) * SUB - WORLD / 2; }

const rngGeo = mulberry32(SEED ^ 0xBEEF);
const cFloorA = new THREE.Color(PAL.floorA), cFloorB = new THREE.Color(PAL.floorB);
const cWallA = new THREE.Color(PAL.wallA), cWallB = new THREE.Color(PAL.wallB);
const cWaterA = new THREE.Color(PAL.waterA), cWaterB = new THREE.Color(PAL.waterB);

const solidBoxes = [];  // { x, z, y0, y1, sx, sz, color }
const waterBoxes = [];
const lavaBoxes = [];   // lava = liquido incassato (come l'acqua, ma glow): mat taggato 'lava'
const waterAnim = [], lavaAnim = [];   // { i, y0, y1, sx, sz, x, z, ph } — oscillazione ±0.1
const cellVoxels = {};  // 'x,z' → [indici istanza] (tinta esplorato, §19.3)

// materiali (contratto cells.mat): quad testurizzati sopra i volumi instanced
const _texLib = VM.loadTexLib(), _matLib = VM.loadMatLib();
const _matBatch = VM.makeQuadBatcher(_texLib);
const _cellRefs = (cell) => (cell.mat && _matLib[cell.mat] && _matLib[cell.mat].faces) || null;
const _isLava = (cell) => !!(cell.mat && _matLib[cell.mat] && (_matLib[cell.mat].tags || []).includes('lava'));
const cLava = new THREE.Color('#c8391a');
function _liquidPhase(cx, cz) { return ((cx * 12.9898 + cz * 78.233) % 6.2831); }
const _isWallAt = (x, z) => {
  const r = MAP.grid[z];
  return !!(r && r[x] && r[x].biome === 'wall');
};

for (const cell of MAP.cells) {
  if (cell.biome === 'void') continue; // fuori mappa: nessuna geometria
  const bx = cell.x * SUB - WORLD / 2, bz = cell.z * SUB - WORLD / 2;
  if (cell.biome === 'water') {
    const wb = {
      x: bx + SUB / 2, z: bz + SUB / 2, y0: BASE + 0.05, y1: cell.quota,
      sx: SUB, sz: SUB,
      color: cWaterA.clone().lerp(cWaterB, Math.min(1, (-cell.quota - 0.3) / 0.5))
    };
    waterAnim.push({ i: waterBoxes.length, y0: wb.y0, y1: wb.y1, sx: SUB, sz: SUB, x: wb.x, z: wb.z, ph: _liquidPhase(cell.x, cell.z) });
    waterBoxes.push(wb);
    continue;
  }
  // lava: liquido incassato e glow (contratto: floor bloccato con mat taggato 'lava')
  if (_isLava(cell)) {
    const lc = (_matLib[cell.mat] && _matLib[cell.mat].color) ? new THREE.Color(_matLib[cell.mat].color) : cLava.clone();
    lavaAnim.push({ i: lavaBoxes.length, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB, x: bx + SUB / 2, z: bz + SUB / 2, ph: _liquidPhase(cell.x, cell.z) });
    lavaBoxes.push({ x: bx + SUB / 2, z: bz + SUB / 2, y0: BASE + 0.05, y1: cell.quota, sx: SUB, sz: SUB, color: lc });
    continue;
  }
  const refs = _cellRefs(cell);
  const cellSeed = 'cell|' + cell.x + ',' + cell.z;
  for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
    const x = bx + i + 0.5, z = bz + j + 0.5;
    if (cell.biome === 'floor') {
      const top = cell.quota + rngGeo() * PAL.jitter;
      // §19.3: mappa cella→istanze per la tinta "esplorato" nel modello buio+lanterna
      (cellVoxels[cell.x + ',' + cell.z] = cellVoxels[cell.x + ',' + cell.z] || []).push(solidBoxes.length);
      solidBoxes.push({ x, z, y0: BASE, y1: top, sx: 1, sz: 1, color: cFloorA.clone().lerp(cFloorB, rngGeo() * PAL.colorVar) });
      if (refs) {
        const ref = refs.top !== undefined ? refs.top : refs.all;
        if (ref) _matBatch.add(ref, cellSeed, VM.topQuad(bx + i, bz + j, 1, top + 0.006),
          [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
      }
    } else { // wall: basamento + cubi impilati a vista
      solidBoxes.push({ x, z, y0: BASE, y1: 0, sx: 1, sz: 1, color: cWallB.clone() });
      for (let k = 0; k < cell.alt; k++) {
        const topJ = (k === cell.alt - 1 && !refs) ? rngGeo() * 0.12 : (k === cell.alt - 1 ? (rngGeo(), 0) : 0);
        solidBoxes.push({ x, z, y0: k, y1: k + 1 + topJ, sx: 1, sz: 1, color: cWallA.clone().lerp(cWallB, rngGeo() * PAL.colorVar) });
      }
      if (refs) {
        const topRef = refs.top !== undefined ? refs.top : refs.all;
        if (topRef) _matBatch.add(topRef, cellSeed, VM.topQuad(bx + i, bz + j, 1, cell.alt + 0.006),
          [[i / SUB, j / SUB], [i / SUB, (j + 1) / SUB], [(i + 1) / SUB, (j + 1) / SUB], [(i + 1) / SUB, j / SUB]]);
      }
    }
  }
  // lati dei muri testurizzati (facce esposte)
  if (cell.biome === 'wall' && refs) {
    const sideRef = refs.side !== undefined ? refs.side : refs.all;
    if (sideRef) {
      const dirs = [
        { d: 'nord', nx: cell.x, nz: cell.z - 1 }, { d: 'sud', nx: cell.x, nz: cell.z + 1 },
        { d: 'ovest', nx: cell.x - 1, nz: cell.z }, { d: 'est', nx: cell.x + 1, nz: cell.z }
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
          _matBatch.add(sideRef, cellSeed + '|' + d, q,
            [[i / SUB, 0], [i / SUB, cell.alt], [(i + 1) / SUB, cell.alt], [(i + 1) / SUB, 0]]);
        }
      }
    }
  }
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

const solidMesh = buildInstanced(solidBoxes, new THREE.MeshLambertMaterial({ color: 0xffffff }));
solidMesh.castShadow = true;
solidMesh.receiveShadow = true;
solidMesh.frustumCulled = false;   // il frustum-cull dell'InstancedMesh (sfera piccola su pozze/isole) faceva sparire volumi ruotando/zoomando
scene.add(solidMesh);

const waterMesh = buildInstanced(waterBoxes, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }));
waterMesh.receiveShadow = true;
waterMesh.frustumCulled = false;   // fix: l'acqua spariva a certe inquadrature (sfera di delimitazione localizzata)
scene.add(waterMesh);

// lava: liquido opaco con glow (emissive), animato come l'acqua
const lavaMesh = buildInstanced(lavaBoxes, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a1e00, emissiveIntensity: 0.5 }));
lavaMesh.frustumCulled = false;
scene.add(lavaMesh);

// overlay materiali: 1 mesh (draw call) per texture usata
const matOverlayGroup = new THREE.Group();
_matBatch.buildMeshes().forEach(m => { m.frustumCulled = false; matOverlayGroup.add(m); });
scene.add(matOverlayGroup);

// oscillazione liquidi (±0.1): aggiorna la Y del top di acqua/lava con onde sfasate per cella
const _liqM = new THREE.Matrix4();
function animateLiquids(mesh, list, t, amp, speed) {
  if (!list.length) return;
  for (const b of list) {
    const y1 = b.y1 + amp * Math.sin(t * speed + b.ph);
    const h = y1 - b.y0;
    _liqM.makeScale(b.sx, h, b.sz);
    _liqM.setPosition(b.x, b.y0 + h / 2, b.z);
    mesh.setMatrixAt(b.i, _liqM);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// ---------- Props: asset voxel piazzati sulla mappa ----------
// Cubi a taglia mista ({x,y,z,s,c} in unità mondo, origine = centro cella di appoggio).
// Proprietà d'istanza (contratto props): yOff (fluttua, con bob), billboard (gira verso
// la camera), scale, rot, walkable (non blocca la cella), light (punto luce agganciato).
const propsGroup = new THREE.Group();
const propBillboards = [], propBobs = [];
{
  const geoCache = {}, matCache = {};
  const pGeo = (s) => geoCache[s] || (geoCache[s] = new THREE.BoxGeometry(s, s, s));
  const pMat = (c) => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));
  for (const prop of MAP.props || []) {
    const ox = (prop.x + 0.5) * SUB - WORLD / 2;
    const oz = (prop.z + 0.5) * SUB - WORLD / 2;
    const baseCell = MAP.grid[Math.floor(prop.z)] && MAP.grid[Math.floor(prop.z)][Math.floor(prop.x)];
    const by = (baseCell ? baseCell.quota : 0) + (prop.yOff || 0);
    const g = new THREE.Group();
    g.position.set(ox, by, oz);
    g.rotation.y = THREE.MathUtils.degToRad(prop.rot || 0);
    if (prop.scale && prop.scale !== 1) g.scale.setScalar(prop.scale);
    let topY = 0;
    let ci = 0;
    for (const c of prop.cubes || []) {
      const s = c.s || 1;
      // cubo con materiale/texture per faccia (contratto m/f) → 6 materiali
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
    propsGroup.add(g);
    if (baseCell && !prop.walkable) baseCell.blocca = true;   // calpestabile = non blocca
  }
}
scene.add(propsGroup);

// ---------- Sprite 2D billboard (PNG reali dal repo) ----------
const ASSETS = '../../public/assets/';
const texLoader = new THREE.TextureLoader();
function spriteTex(url, px, py, pw, ph, W, H) {
  const t = texLoader.load(ASSETS + url, undefined, undefined,
    () => console.warn('Texture non caricata:', url));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  const inset = 0.1; // evita bleed dai frame adiacenti del foglio
  t.repeat.set((pw - 2 * inset) / W, (ph - 2 * inset) / H);
  t.offset.set((px + inset) / W, 1 - (py + ph - inset) / H);
  return t;
}

const billboards = [];
const blobShadows = [];
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
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x1c1c1a, transparent: true, opacity: 0.3 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.visible = false;
  group.add(blob);
  blobShadows.push(blob);
  billboards.push(group);
  scene.add(group);
  return group;
}

function floorTopY(lx, lz) {
  const cx = Math.min(LOGICAL - 1, Math.max(0, Math.floor(lx)));
  const cz = Math.min(LOGICAL - 1, Math.max(0, Math.floor(lz)));
  return MAP.grid[cz][cx].quota + 0.18;
}
function placeEntity(group, lx, lz, yOff = 0) {
  group.position.set((lx + 0.5) * SUB - WORLD / 2, floorTopY(lx, lz) + yOff, (lz + 0.5) * SUB - WORLD / 2);
}

// Fogli sprite: rogue8x8 = celle 8×8 con separatore 1px → cella(c,r) a (c*9, r*9)
// Definizioni per nome sprite (campo `sprite` delle entities): crop + taglia billboard.
const SPRITE_DEFS = {
  'rogue8x8/Girl-Melee':  { file: 'rogue8x8/Girl-Melee.png',  px: 0,  py: 0,  pw: 8,  ph: 8,  W: 26, H: 107, size: 2.2, r: 0 },
  // frame 16×16 ma crop a 13px: il foglio ha un watermark 't' sul bordo destro
  'gatekeeper':           { file: 'gatekeeper.png',           px: 0,  py: 0,  pw: 13, ph: 16, W: 64, H: 16,  size: 2.8, r: 0.7 },
  'rogue8x8/NPC':         { file: 'rogue8x8/NPC.png',         px: 0,  py: 0,  pw: 8,  ph: 8,  W: 53, H: 35,  size: 1.8, r: 0.55 },
  'rogue8x8/GroundItems': { file: 'rogue8x8/GroundItems.png', px: 36, py: 90, pw: 8,  ph: 8,  W: 53, H: 125, size: 1.3, r: 0 }
};
function billboardFor(name) {
  const d = SPRITE_DEFS[name] || SPRITE_DEFS['rogue8x8/NPC'];
  const tex = spriteTex(d.file, d.px, d.py, d.pw, d.ph, d.W, d.H);
  return { group: makeBillboard(tex, d.size, d.pw / d.ph), def: d };
}

// ============================================================
// §19 F0 — buio+lanterna, entità di studio, condotto-ponte, boot
// ============================================================
// Emoji come texture canvas: zero PNG da preparare, perfette per validare
// il contratto entità. Self-lit (MeshBasic) = landmark visibili nel buio.
function emojiTex(ch) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c2 = cv.getContext('2d');
  c2.font = '50px serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText(ch, 32, 36);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeEmojiBillboard(ch, size) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size);
  geo.translate(0, size / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: emojiTex(ch), alphaTest: 0.35, side: THREE.DoubleSide, transparent: true });
  group.add(new THREE.Mesh(geo, mat));
  billboards.push(group);
  scene.add(group);
  return group;
}

const EMOJI_BY_TYPE = { source: '📖', condotto: '⚡', server: '🖥', stairs: '🔽', boss: '⚔', gatekeeper: '🔮', totem: '🗿' };
const SRC_EMOJI = { libro: '📖', scroll: '📜', vaso: '🏺' };
const DECOR_EMOJI = { tree: '🌳', bush: '🌿', lantern: '🏮', pile: '🗃', flower: '🌼', brazier: '🔥' };
const studyEnts = [];   // { e, group }
const conduits = [];    // { e, mat, on }

function addStudyEntity(e) {
  if (e.type === 'pedestal') {
    // piedistallo = disco colorato per macro-area (bersaglio porta-e-deposita)
    const col = [0xe0655f, 0x5f9fe0, 0x6fbf6a, 0xd9a94a, 0xb07fd9][(e.group || 0) % 5];
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.28, 24),
      new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 }));
    disc.position.set((e.x + 0.5) * SUB - WORLD / 2, floorTopY(e.x, e.z) + 0.14, (e.z + 0.5) * SUB - WORLD / 2);
    scene.add(disc);
    studyEnts.push({ e, group: disc });
    return;
  }
  const emoji = (e.type === 'source' ? SRC_EMOJI[e.src] : null)
    || (e.type === 'decor' ? (DECOR_EMOJI[e.name] || '🌿') : null)
    || EMOJI_BY_TYPE[e.type] || '❓';
  const g = makeEmojiBillboard(emoji, e.type === 'server' ? 2.2 : (e.type === 'decor' && e.name === 'tree' ? 2.6 : 1.7));
  placeEntity(g, e.x, e.z);
  studyEnts.push({ e, group: g });
  if (e.type === 'condotto') buildConduitBridge(e);
}

// Ponte del condotto: fila di lastre spente sull'acqua; activateConduit le accende
// (colore famiglia) e rende percorribili le celle → lo shortcut è FISICO (§19.4).
function buildConduitBridge(e) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x2c2f3a, emissive: 0x000000 });
  (e.bridge || []).forEach(([bx, bz]) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(SUB, 0.5, SUB), mat);
    slab.position.set(cellWorld(bx), 0.02, cellWorld(bz));
    slab.receiveShadow = true;
    scene.add(slab);
  });
  conduits.push({ e, mat, on: false });
}
function activateConduit(c) {
  if (c.on) return;
  c.on = true;
  c.mat.color.set(0xe8a23a);
  c.mat.emissive.set(0x9a5f10);
  (c.e.bridge || []).forEach(([bx, bz]) => {
    const cell = MAP.grid[bz] && MAP.grid[bz][bx];
    if (cell) { cell.blocca = false; cell.quota = 0.1; }
  });
  toast('⚡ Circuito chiuso: il ponte si materializza!');
}

// ---------- Buio + lanterna (decisione b, §19.3) ----------
const brightHemi = hemi.intensity, brightDir = dir.intensity, brightBg = new THREE.Color(PAL.bg);
const lantern = new THREE.PointLight(0xffd9a0, 30, SUB * 4.5, 1.6);
scene.add(lantern);
let darkMode = !MAP.lit;   // le stanze `lit` (giardino, radura) partono illuminate
let booted = false;
function applyDark() {
  hemi.intensity = darkMode ? 0.14 : brightHemi;
  dir.intensity = darkMode ? 0.12 : brightDir;
  renderer.setClearColor(darkMode ? 0x0a0c14 : brightBg);
  lantern.visible = darkMode;
}
// Tinta "esplorato": le celle visitate restano leggermente più chiare nel buio
const visitedCells = new Set();
const _tint = new THREE.Color();
function markVisited(cell) {
  if (!cell) return;
  const key = cell.x + ',' + cell.z;
  if (visitedCells.has(key)) return;
  visitedCells.add(key);
  const idxs = cellVoxels[key];
  if (!idxs) return;
  idxs.forEach(i => {
    _tint.copy(solidBoxes[i].color).multiplyScalar(1.45);
    solidMesh.setColorAt(i, _tint);
  });
  if (solidMesh.instanceColor) solidMesh.instanceColor.needsUpdate = true;
}
// 🖥 Boot del server = luce globale del piano (reward endogeno §17/§19)
function bootServer() {
  if (booted) return;
  booted = true;
  darkMode = false;
  applyDark();
  toast('🖥 Boot completato — la corrente torna: luci accese!');
}
applyDark();

// Interazioni di prossimità (F0: valida la scena, non il quiz)
function checkStudyProximity() {
  for (const s of studyEnts) {
    const dx = s.group.position.x - heroState.wx, dz = s.group.position.z - heroState.wz;
    if (dx * dx + dz * dz > 2.6) { s._near = false; continue; }
    if (s._near) continue;
    s._near = true;
    const e = s.e;
    if (e.type === 'condotto') { const c = conduits.find(k => k.e === e); if (c && !c.on) activateConduit(c); }
    else if (e.type === 'server') bootServer();
    else if (e.type === 'source') toast((SRC_EMOJI[e.src] || '📖') + ' Memory unit: ' + (e.label || e.nodeId || '?'));
    else if (e.type === 'stairs') toast('🔽 Scale per il piano successivo');
    else if (e.type === 'pedestal') toast('◼ Piedistallo macro-area ' + (e.group != null ? e.group : '?'));
  }
}

// Entities data-driven dal contratto mappa (demo o esterna)
const entDefs = (MAP.entities && MAP.entities.length)
  ? MAP.entities
  : [{ id: 'hero', sprite: 'rogue8x8/Girl-Melee', x: 2, z: 5 }];
const heroDef = entDefs.find(e => e.id === 'hero') || { sprite: 'rogue8x8/Girl-Melee', x: 2, z: 5 };
const hero = billboardFor(heroDef.sprite).group;

// Eroe: posizione CONTINUA nel mondo — svincolata dalla griglia.
// Spawn validato: se la cella richiesta è void/bloccata (mappe custom), prima cella libera.
let spawn = { x: Math.floor(heroDef.x), z: Math.floor(heroDef.z) };
if (!(MAP.grid[spawn.z] && MAP.grid[spawn.z][spawn.x] && !MAP.grid[spawn.z][spawn.x].blocca)) {
  outer: for (let z = 0; z < LOGICAL; z++) for (let x = 0; x < LOGICAL; x++) {
    if (!MAP.grid[z][x].blocca) { spawn = { x, z }; break outer; }
  }
}
const heroState = { wx: cellWorld(spawn.x), wz: cellWorld(spawn.z), path: [], keys: new Set(), jumpT: 1 };
hero.position.set(heroState.wx, floorTopY(spawn.x, spawn.z), heroState.wz);
// Camera centrata sull'eroe fin dal primo frame (niente swoop iniziale)
camTarget.set(heroState.wx, hero.position.y, heroState.wz);
placeCamera();

// Collisione character/character: cerchio vs cerchio sul piano.
// GroundItems = raccoglibili (bobbing + pickup); il resto = NPC solidi.
const solidEntities = [];
const items = [];
for (const e of entDefs) {
  if (e.id === 'hero') continue;
  if (e.type && e.type !== 'npc') { addStudyEntity(e); continue; }   // §19.2: entità tipizzate
  const b = billboardFor(e.sprite);
  if (e.sprite === 'rogue8x8/GroundItems') {
    placeEntity(b.group, e.x, e.z, 0.7);
    items.push({ group: b.group, base: floorTopY(e.x, e.z) + 0.7, label: e.label || null });
  } else {
    placeEntity(b.group, e.x, e.z);
    solidEntities.push({ group: b.group, r: b.def.r || 0.55 });
  }
}
function entityFree(wx, wz) {
  for (const s of solidEntities) {
    const dx = wx - s.group.position.x, dz = wz - s.group.position.z;
    if (dx * dx + dz * dz < (s.r + HERO_R) * (s.r + HERO_R)) return false;
  }
  return true;
}

window.__protoDebug = { heroState, hero, MAP, entityFree, items,
  // §19 F0: hook testabili senza rAF (i browser headless non pompano il loop)
  studyEnts, conduits, checkStudyProximity, activateConduit, bootServer, markVisited,
  // movimento (#3): decisione salita/discesa/salto su una cella logica
  stepKind: (fromQuota, lx, lz) => stepKind(fromQuota, cellWorld(lx), cellWorld(lz)),
  STEP_UP_WALK, STEP_UP_JUMP,
  get darkMode() { return darkMode; } };

// ---------- Movimento libero (continuo) ----------
// La griglia logica serve SOLO per collisioni/biomi/dislivelli;
// il personaggio si muove in coordinate mondo continue.
const HERO_SPEED = 7.5;   // unità mondo / secondo
const HERO_R = 0.42;      // raggio di collisione

function cellAt(wx, wz) {
  const lx = Math.floor((wx + WORLD / 2) / SUB);
  const lz = Math.floor((wz + WORLD / 2) / SUB);
  if (lx < 0 || lz < 0 || lx >= LOGICAL || lz >= LOGICAL) return null;
  return MAP.grid[lz][lx];
}

// Percorribilità rispetto alla quota su cui poggia il personaggio.
// Asimmetrica: discesa illimitata (cadere dai bordi), salita ≤ STEP_UP_WALK
// camminando o ≤ STEP_UP_JUMP saltando. Mai su cella `blocca` (acqua/lava/muro)
// o fuori mappa (void) → mai caduta in liquido/vuoto.
// Ritorna: 'blocked' | 'walk' | 'jump' (il più impegnativo tra i 4 campioni).
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
function walkableFrom(quotaRef, wx, wz) { return stepKind(quotaRef, wx, wz) !== 'blocked'; }

// BFS sulla griglia logica (16×16, costi uniformi) → lista waypoint mondo
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
      if (c.blocca || (c.quota - cq) > STEP_UP_JUMP) continue;   // salita > jump bloccata; discesa libera
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
  path.shift(); // la cella di partenza non è un waypoint
  return path;
}

// Marker di destinazione (point & click)
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.55, 24),
  new THREE.MeshBasicMaterial({ color: 0x2f6db8, transparent: true, opacity: 0 })
);
marker.rotation.x = -Math.PI / 2;
scene.add(marker);
let markerLife = 0;
function showMarker(x, y, z) { marker.position.set(x, y, z); markerLife = 1; }

// Point & click: raycast sul terreno → pathfinding → cammina
const raycaster = new THREE.Raycaster();
function clickAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width || vw();
  const h = rect.height || vh();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / w) * 2 - 1,
    -((clientY - rect.top) / h) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([solidMesh, waterMesh]);
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
  // ultimo waypoint = punto esatto cliccato (libertà sub-tile)
  if (path.length) path[path.length - 1] = { x: p.x, z: p.z };
  else path.push({ x: p.x, z: p.z });
  heroState.path = path;
  showMarker(p.x, cell.quota + PAL.jitter + 0.04, p.z);
  return 'ok';
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  clickAt(e.clientX, e.clientY);
});
window.__protoDebug.clickAt = clickAt;
window.__protoDebug.rayTest = (nx, ny) => {
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const h = raycaster.intersectObjects([solidMesh, waterMesh]);
  return h.length ? { x: +h[0].point.x.toFixed(2), z: +h[0].point.z.toFixed(2) } : null;
};

// Aggiornamento per-frame: tastiera (prioritaria) o path del click
function moveHero(dt) {
  let dir = null;
  const k = heroState.keys;
  const ix = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
  const iy = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
  if (ix || iy) {
    heroState.path.length = 0; // la tastiera annulla il point & click
    const yr = THREE.MathUtils.degToRad(yawCur);
    const f = { x: -Math.cos(yr), z: -Math.sin(yr) };   // "su" schermo
    const r = { x: -f.z, z: f.x };                       // "destra" schermo
    dir = { x: f.x * iy + r.x * ix, z: f.z * iy + r.z * ix };
  } else if (heroState.path.length) {
    let wp = heroState.path[0];
    while (wp) {
      const d = Math.hypot(wp.x - heroState.wx, wp.z - heroState.wz);
      const arrive = heroState.path.length === 1 ? 0.18 : 0.85;
      if (d < arrive) { heroState.path.shift(); wp = heroState.path[0]; }
      else break;
    }
    if (wp) dir = { x: wp.x - heroState.wx, z: wp.z - heroState.wz };
  }
  if (!dir) return;
  const len = Math.hypot(dir.x, dir.z) || 1;
  const step = HERO_SPEED * dt;
  const q = (cellAt(heroState.wx, heroState.wz) || { quota: 0 }).quota;
  const nx = heroState.wx + (dir.x / len) * step;
  const nz = heroState.wz + (dir.z / len) * step;
  let moved = false, jumped = false;
  const kx = stepKind(q, nx, heroState.wz);
  if (kx !== 'blocked' && entityFree(nx, heroState.wz)) { heroState.wx = nx; moved = true; if (kx === 'jump') jumped = true; }
  const kz = stepKind(q, heroState.wx, nz);
  if (kz !== 'blocked' && entityFree(heroState.wx, nz)) { heroState.wz = nz; moved = true; if (kz === 'jump') jumped = true; }
  if (jumped && heroState.jumpT >= 1) heroState.jumpT = 0;   // avvia l'arco di salto (una volta per gradino)
  if (!moved && heroState.path.length) {
    const wasLast = heroState.path.length <= 1;
    heroState.path.length = 0;
    if (!wasLast) toast('Percorso bloccato');
  }
  hero.position.x = heroState.wx;
  hero.position.z = heroState.wz;
}
window.__protoDebug.cellAt = cellAt;
window.__protoDebug.findPath = findPath;
window.__protoDebug.moveHero = moveHero;

// ---------- Ombre: dure / morbide / blob ----------
const SHADOW_MODES = ['dure', 'morbide', 'blob'];
let shadowMode = 0;
function applyShadowMode() {
  const label = document.getElementById('btn-shadow');
  if (shadowMode === 2) {
    dir.castShadow = false;
    blobShadows.forEach(b => { b.visible = true; });
  } else {
    dir.castShadow = true;
    blobShadows.forEach(b => { b.visible = false; });
    renderer.shadowMap.type = shadowMode === 0 ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    scene.traverse(o => {
      if (o.material) o.material.needsUpdate = true;
      if (o.customDepthMaterial) o.customDepthMaterial.needsUpdate = true;
    });
  }
  label.textContent = 'Ombre: ' + SHADOW_MODES[shadowMode];
}
applyShadowMode();

// ---------- Input ----------
const KEYMAP = {
  w: 'w', a: 'a', s: 's', d: 'd',
  arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd'
};
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const mapped = KEYMAP[key];
  if (mapped) { e.preventDefault(); heroState.keys.add(mapped); return; }
  if (key === 'q') rotate(-1);
  else if (key === 'e') rotate(1);
  else if (key === 'o') { shadowMode = (shadowMode + 1) % 3; applyShadowMode(); }
  else if (key === 'l') { darkMode = !darkMode; applyDark(); }   // §19 F0: toggle buio/lanterna
});
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
}
document.getElementById('btn-rot-l').addEventListener('click', () => rotate(-1));
document.getElementById('btn-rot-r').addEventListener('click', () => rotate(1));
document.getElementById('btn-shadow').addEventListener('click', () => {
  shadowMode = (shadowMode + 1) % 3; applyShadowMode();
});
document.getElementById('btn-export').addEventListener('click', () => {
  const json = JSON.stringify(window.MAP_DATA, null, 2);
  navigator.clipboard.writeText(json)
    .then(() => toast('JSON mappa copiato (' + Math.round(json.length / 1024) + ' KB)'))
    .catch(() => toast('Clipboard non disponibile — vedi console'));
  console.log(json);
});

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  // Tween rotazione camera
  if (yawT < 1) {
    yawT = Math.min(1, yawT + dt / 0.45);
    yawCur = yawFrom + (yawTarget - yawFrom) * easeInOut(yawT);
    placeCamera();
  }

  // Billboard: sempre rivolti alla camera (asse Y)
  const yr = THREE.MathUtils.degToRad(yawCur);
  const face = Math.PI / 2 - yr;
  for (const b of billboards) b.rotation.y = face;
  // Props: billboard verso la camera + bob per gli item che fluttuano (yOff > 0)
  for (const b of propBillboards) b.rotation.y = face;
  const _tNow = performance.now() / 1000;
  for (const b of propBobs) b.g.position.y = b.baseY + 0.12 * Math.sin(_tNow * 1.8 + b.ph);
  animateLiquids(waterMesh, waterAnim, t, 0.1, 1.3);   // acqua: onda dolce
  animateLiquids(lavaMesh, lavaAnim, t, 0.1, 0.7);     // lava: più lenta e densa

  // Movimento libero eroe + quota fluida
  moveHero(dt);
  const under = cellAt(heroState.wx, heroState.wz);
  if (under) {
    const ty = under.quota + 0.18;
    hero.position.y += (ty - hero.position.y) * Math.min(1, dt * 10);
    if (darkMode) markVisited(under);   // §19.3: tinta esplorato
  }
  // arco di salto sopra la quota (gradini z+1): mezzo giro di seno in ~0.32s
  if (heroState.jumpT < 1) {
    heroState.jumpT = Math.min(1, heroState.jumpT + dt / 0.32);
    hero.position.y += 0.55 * Math.sin(Math.PI * heroState.jumpT);
  }

  // §19 F0: lanterna segue l'eroe (sfarfallio tenue) + interazioni di prossimità
  if (lantern.visible) {
    lantern.position.set(heroState.wx, hero.position.y + 2.4, heroState.wz);
    lantern.intensity = 30 * (0.92 + 0.08 * Math.sin(t * 9));
  }
  checkStudyProximity();

  // Camera-follow: camTarget insegue l'eroe (lerp morbido) → player sempre ~centrato;
  // la luce direzionale trasla con lui per tenere le ombre nella shadow camera
  const fk = Math.min(1, dt * 6);
  camTarget.x += (heroState.wx - camTarget.x) * fk;
  camTarget.y += (hero.position.y - camTarget.y) * fk;
  camTarget.z += (heroState.wz - camTarget.z) * fk;
  dir.position.copy(camTarget).add(dirOffset);
  dir.target.position.copy(camTarget);
  placeCamera();

  // Marker point & click: dissolvenza
  if (markerLife > 0) {
    markerLife = heroState.path.length ? Math.max(markerLife, 0.5) : markerLife;
    markerLife = Math.max(0, markerLife - dt * 0.7);
    marker.material.opacity = Math.min(1, markerLife) * 0.85;
  }

  // Gemma fluttuante + raccolta al contatto
  for (const it of items) {
    if (!it.group.visible) continue;
    it.group.position.y = it.base + Math.sin(t * 2.4) * 0.15;
    const gdx = it.group.position.x - heroState.wx, gdz = it.group.position.z - heroState.wz;
    if (gdx * gdx + gdz * gdz < 1.0) { it.group.visible = false; toast(it.label ? '📦 ' + it.label : 'Gemma raccolta!'); }
  }

  // Torce/fuochi: sfarfallio
  for (const pl of flickerLights) {
    pl.intensity = pl.userData.base * (0.82 + 0.18 * Math.sin(t * 11) + 0.12 * Math.sin(t * 23 + 1.7));
  }

  renderer.render(scene, camera);

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) {
    document.getElementById('stats').textContent =
      Math.round(fpsFrames / fpsTime) + ' fps · ' +
      (solidBoxes.length + waterBoxes.length) + ' volumi · ' +
      renderer.info.render.calls + ' draw call · seed ' + SEED;
    fpsFrames = 0; fpsTime = 0;
  }
}
animate();
