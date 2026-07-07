// ============================================================
// MATERIALI & TEXTURE — modulo CONDIVISO editor ↔ proto
// Contratto: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md
//  - texture  = risorsa (PNG pixel-art + tag) — libreria `voxelproto_textures`
//  - materiale = ricetta riusabile (facce → texture o #tag) — `voxelproto_materials`
//  - riferimento faccia: "nome-texture" (diretta) oppure "#tag" (random
//    DETERMINISTICO tra le texture col tag: seed dalla posizione → niente
//    sfarfallio tra rebuild, la mappa veste sempre uguale)
// Nel vault le due librerie viaggiano insieme in `Memory Dungeon/materiali.json`
// (schema mappai-dungeon-materials@1).
// ============================================================
import * as THREE from 'three';

export function loadTexLib() {
  try { return JSON.parse(localStorage.getItem('voxelproto_textures') || '{}'); } catch (e) { return {}; }
}
export function loadMatLib() {
  try { return JSON.parse(localStorage.getItem('voxelproto_materials') || '{}'); } catch (e) { return {}; }
}
export function saveTexLib(lib) { localStorage.setItem('voxelproto_textures', JSON.stringify(lib)); }
export function saveMatLib(lib) { localStorage.setItem('voxelproto_materials', JSON.stringify(lib)); }

// hash stringa → uint32 (per il random deterministico per-faccia)
export function strSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// "#tag" → nome texture scelto in modo stabile dal seedKey; "nome" → se esiste
export function resolveRef(ref, texLib, seedKey) {
  if (!ref) return null;
  if (ref[0] !== '#') return texLib[ref] ? ref : null;
  const tag = ref.slice(1);
  const names = Object.keys(texLib).filter(n => (texLib[n].tags || []).includes(tag)).sort();
  if (!names.length) return null;
  return names[strSeed(seedKey + '|' + tag) % names.length];
}

// cache THREE.Texture per nome (NearestFilter = pixel nitidi, repeat per i muri)
const _texCache = {};
const _loader = new THREE.TextureLoader();
export function getTexture(name, texLib) {
  if (_texCache[name]) return _texCache[name];
  const entry = texLib[name];
  if (!entry || !entry.png) return null;
  const t = _loader.load(entry.png);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  _texCache[name] = t;
  return t;
}
const _matCache = {};
function texMaterial(name, texLib) {
  if (_matCache[name]) return _matCache[name];
  const t = getTexture(name, texLib);
  if (!t) return null;
  return (_matCache[name] = new THREE.MeshLambertMaterial({ map: t }));
}
const _colorCache = {};
function colorMaterial(c) {
  return _colorCache[c] || (_colorCache[c] = new THREE.MeshLambertMaterial({ color: c }));
}

// normale (asse-allineata) → chiave faccia
export function faceKeyFromNormal(n) {
  if (n.y > 0.5) return 'top';
  if (n.y < -0.5) return 'bottom';
  if (n.x > 0.5) return 'est';
  if (n.x < -0.5) return 'ovest';
  if (n.z > 0.5) return 'sud';
  return 'nord';
}
const FACES = ['est', 'ovest', 'top', 'bottom', 'sud', 'nord']; // ordine BoxGeometry

// facce effettive di un cubo: materiale (cube.m) + override per-faccia (cube.f).
// Il materiale supporta scorciatoie: all, side (le 4 laterali), top, bottom.
export function faceRefsFor(cube, matLib) {
  const out = {};
  const mat = cube.m && matLib[cube.m];
  if (mat && mat.faces) {
    const f = mat.faces;
    for (const k of FACES) {
      out[k] = f[k] !== undefined ? f[k]
        : (k === 'top' || k === 'bottom') ? (f[k] !== undefined ? f[k] : f.all)
        : (f.side !== undefined ? f.side : f.all);
    }
    if (f.top !== undefined) out.top = f.top;
    if (f.bottom !== undefined) out.bottom = f.bottom;
  }
  if (cube.f) for (const k in cube.f) out[k] = cube.f[k];
  return out;
}

// Array di 6 materiali per un cubo con texture (null = cubo a colore semplice).
// fallback colore: material.color → cube.c
export function cubeMaterialArray(cube, matLib, texLib, seedKey) {
  const refs = faceRefsFor(cube, matLib);
  const hasTex = Object.keys(refs).some(k => refs[k]);
  if (!hasTex) return null;
  const mat = cube.m && matLib[cube.m];
  const fallback = (mat && mat.color) || cube.c || '#8f563b';
  return FACES.map(k => {
    const name = resolveRef(refs[k], texLib, seedKey + '|' + k);
    return (name && texMaterial(name, texLib)) || colorMaterial(fallback);
  });
}

// ---------- Batcher di quad testurizzati per il TERRENO ----------
// Raggruppa i quad per texture risolta → UNA mesh (draw call) per texture.
// I loop di build (editor/proto) aggiungono i quad dove conoscono quote e jitter.
export function makeQuadBatcher(texLib) {
  const groups = {};   // texName → { pos: [], uv: [], idx: [] }
  return {
    // corners: 4 punti [x,y,z] in senso antiorario visti dal davanti; uvs: 4 coppie [u,v]
    add(ref, seedKey, corners, uvs) {
      const name = resolveRef(ref, texLib, seedKey);
      if (!name) return false;
      const g = groups[name] || (groups[name] = { pos: [], uv: [], idx: [] });
      const base = g.pos.length / 3;
      for (let i = 0; i < 4; i++) { g.pos.push(...corners[i]); g.uv.push(...uvs[i]); }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      return true;
    },
    buildMeshes() {
      return Object.keys(groups).map(name => {
        const g = groups[name];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
        geo.setIndex(g.idx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, texMaterial(name, texLib));
        mesh.receiveShadow = true;
        return mesh;
      });
    }
  };
}

// Quad orizzontale (top di pavimento/muro), y = quota della superficie
export function topQuad(x0, z0, w, y) {
  return [[x0, y, z0], [x0, y, z0 + w], [x0 + w, y, z0 + w], [x0 + w, y, z0]];
}
// Quad verticale per un lato di muro: dir = 'nord'|'sud'|'est'|'ovest'
export function sideQuad(x0, z0, w, y0, y1, dir) {
  if (dir === 'nord') return [[x0 + w, y0, z0], [x0 + w, y1, z0], [x0, y1, z0], [x0, y0, z0]];
  if (dir === 'sud') return [[x0, y0, z0 + w], [x0, y1, z0 + w], [x0 + w, y1, z0 + w], [x0 + w, y0, z0 + w]];
  if (dir === 'ovest') return [[x0, y0, z0], [x0, y1, z0], [x0, y1, z0 + w], [x0, y0, z0 + w]];
  return [[x0 + w, y0, z0 + w], [x0 + w, y1, z0 + w], [x0 + w, y1, z0], [x0 + w, y0, z0]];
}
