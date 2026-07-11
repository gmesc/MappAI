'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/js/mappai-garden-core.js');

// ── helper: template di prova 20×20 tutto floor + 2 parcelle ─────────────────
function mkTemplate() {
  const cells = [];
  for (let z = 0; z < 20; z++) for (let x = 0; x < 20; x++) cells.push({ x, z, biome: 'floor', quota: 0 });
  return { seed: 1, size: 20, sub: 3, cells, props: [] };
}
function rectPlot(id, ox, oz, w, h) {
  const cells = [];
  for (let z = oz; z < oz + h; z++) for (let x = ox; x < ox + w; x++) cells.push([x, z]);
  return { id, cells };
}
// parcella ROTONDA (pennello rotondo, raggio 3 → 29 celle)
function roundPlot(id, cx, cz, r) {
  const cells = [];
  for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) cells.push([x, z]);
  }
  return { id, cells };
}
const TARGHETTA_OK = { title: 'La fotosintesi', text: 'Il mio giardino rappresenta il ciclo della fotosintesi clorofilliana.', author: 'Ada' };

// ── slugify ──────────────────────────────────────────────────────────────────
test('slugify: accenti, spazi, simboli', () => {
  assert.equal(G.slugify('Classe 4ª — Fotosìntesi!'), 'classe-4-fotosintesi');
  assert.equal(G.slugify(''), 'sessione');
});

// ── inPlot / plotContains / plotIndex ────────────────────────────────────────
test('inPlot: dentro e fuori la maschera', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  assert.equal(G.inPlot(p, 2, 2), true);
  assert.equal(G.inPlot(p, 6, 6), true);
  assert.equal(G.inPlot(p, 7, 2), false);
  assert.equal(G.inPlot(p, 1, 1), false);
});

test('plotContains: tutte le celle devono stare nella maschera', () => {
  const p = rectPlot('p01', 0, 0, 3, 3);
  assert.equal(G.plotContains(p, [{ x: 0, z: 0 }, { x: 2, z: 2 }]), true);
  assert.equal(G.plotContains(p, [{ x: 0, z: 0 }, { x: 3, z: 0 }]), false);
  assert.equal(G.plotContains(p, [[1, 1]]), true); // accetta anche coppie [x,z]
});

test('plotIndex: byCell mappa ogni cella al suo plotId', () => {
  const idx = G.plotIndex([rectPlot('p01', 0, 0, 2, 2), rectPlot('p02', 5, 5, 2, 2)]);
  assert.equal(idx.byCell.get('1,1'), 'p01');
  assert.equal(idx.byCell.get('5,6'), 'p02');
  assert.equal(idx.byCell.has('3,3'), false);
  assert.equal(idx.byId.p01.has('0,0'), true);
});

// ── plotsFromCells ───────────────────────────────────────────────────────────
test('plotsFromCells: raggruppa per campo plot, ordina per id e coordinate', () => {
  const cells = [
    { x: 5, z: 5, biome: 'floor', plot: 'p02' },
    { x: 1, z: 1, biome: 'floor', plot: 'p01' },
    { x: 0, z: 1, biome: 'floor', plot: 'p01' },
    { x: 9, z: 9, biome: 'floor' } // senza plot → ignorata
  ];
  const plots = G.plotsFromCells(cells);
  assert.equal(plots.length, 2);
  assert.equal(plots[0].id, 'p01');
  assert.deepEqual(plots[0].cells, [[0, 1], [1, 1]]);
  assert.deepEqual(plots[1].cells, [[5, 5]]);
});

// ── validatePlots ────────────────────────────────────────────────────────────
test('validatePlots: parcelle valide → ok, piccola → warning', () => {
  const map = mkTemplate();
  const r = G.validatePlots([rectPlot('p01', 1, 1, 6, 6), rectPlot('p02', 10, 10, 3, 3)], map);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1); // p02 = 9 celle < 25
  assert.equal(r.warnings[0].code, 'plot-small');
  assert.equal(r.warnings[0].plotId, 'p02');
});

test('validatePlots: sovrapposizione rifiutata', () => {
  const map = mkTemplate();
  const r = G.validatePlots([rectPlot('p01', 1, 1, 6, 6), rectPlot('p02', 4, 4, 6, 6)], map);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'plot-overlap'));
});

test('validatePlots: parcella su muro o fuori mappa rifiutata', () => {
  const map = mkTemplate();
  map.cells.find(c => c.x === 2 && c.z === 2).biome = 'wall';
  const r = G.validatePlots([rectPlot('p01', 1, 1, 4, 4)], map);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'plot-not-floor'));
  const r2 = G.validatePlots([rectPlot('p01', 18, 18, 4, 4)], map);
  assert.ok(r2.errors.some(e => e.code === 'plot-out-of-map'));
});

test('validatePlots: id duplicati e lista vuota', () => {
  const map = mkTemplate();
  const r = G.validatePlots([rectPlot('p01', 1, 1, 3, 3), rectPlot('p01', 10, 10, 3, 3)], map);
  assert.ok(r.errors.some(e => e.code === 'plot-dup-id'));
  assert.equal(G.validatePlots([], map).ok, false);
});

test('validatePlots: maschera rotonda (non rettangolare) valida', () => {
  const map = mkTemplate();
  const r = G.validatePlots([roundPlot('p01', 10, 10, 3)], map);
  assert.equal(r.ok, true);
});

// ── computePlotGrid (fallback) ───────────────────────────────────────────────
test('computePlotGrid: 64 con parcelle 15 → griglia 3×3', () => {
  const plots = G.computePlotGrid(64, 15);
  assert.equal(plots.length, 9);
  assert.equal(plots[0].id, 'p01');
  assert.equal(plots[0].cells.length, 225);
  // nessuna sovrapposizione e tutto dentro mappa
  const seen = new Set();
  for (const p of plots) for (const [x, z] of p.cells) {
    assert.ok(x >= 0 && z >= 0 && x < 64 && z < 64);
    assert.ok(!seen.has(x + ',' + z));
    seen.add(x + ',' + z);
  }
});

test('computePlotGrid: parcella che non ci sta → []', () => {
  assert.deepEqual(G.computePlotGrid(12, 15), []);
  assert.deepEqual(G.computePlotGrid(20, 0), []);
});

// ── plotPerimeter ────────────────────────────────────────────────────────────
test('plotPerimeter: quadrato 2×2 → 8 segmenti unitari', () => {
  const segs = G.plotPerimeter(rectPlot('p01', 0, 0, 2, 2));
  assert.equal(segs.length, 8);
});

test('plotPerimeter: forma a L non conta i lati interni', () => {
  // L: (0,0) (1,0) (0,1) → perimetro 8 lati unitari
  const segs = G.plotPerimeter({ id: 'p01', cells: [[0, 0], [1, 0], [0, 1]] });
  assert.equal(segs.length, 8);
});

// ── validateTarghetta ────────────────────────────────────────────────────────
test('validateTarghetta: completa → ok', () => {
  assert.equal(G.validateTarghetta(TARGHETTA_OK).ok, true);
});

test('validateTarghetta: mancante o campi corti → errori', () => {
  assert.equal(G.validateTarghetta(null).ok, false);
  assert.equal(G.validateTarghetta(null).errors[0].code, 'targhetta-missing');
  const r = G.validateTarghetta({ title: 'A', text: 'corto', author: '' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
});

test('validateTarghetta: testo oltre 400 caratteri rifiutato', () => {
  const r = G.validateTarghetta({ title: 'Ok', text: 'x'.repeat(401), author: 'Ada' });
  assert.ok(r.errors.some(e => e.code === 'targhetta-text'));
});

// ── validateSubmission ───────────────────────────────────────────────────────
function mkSubmission(plot, extra) {
  return Object.assign({
    plotId: plot.id,
    concept: TARGHETTA_OK,
    cells: [{ x: plot.cells[0][0], z: plot.cells[0][1], biome: 'wall', alt: 10 }],
    props: []
  }, extra || {});
}

test('validateSubmission: consegna valida con muro alt 10 → ok', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  assert.equal(G.validateSubmission(p, mkSubmission(p)).ok, true);
});

test('validateSubmission: muro alt 11 rifiutato', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, { cells: [{ x: 2, z: 2, biome: 'wall', alt: 11 }] }));
  assert.ok(r.errors.some(e => e.code === 'wall-alt'));
});

test('validateSubmission: cella fuori maschera rifiutata', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, { cells: [{ x: 0, z: 0, biome: 'floor' }] }));
  assert.ok(r.errors.some(e => e.code === 'cell-outside-plot'));
});

test('validateSubmission: biome void rifiutato', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, { cells: [{ x: 2, z: 2, biome: 'void' }] }));
  assert.ok(r.errors.some(e => e.code === 'cell-bad-biome'));
});

test('validateSubmission: targhetta mancante rifiutata', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, { concept: null }));
  assert.ok(r.errors.some(e => e.code === 'targhetta-missing'));
});

test('validateSubmission: quota fuori clamp e mat sconosciuto', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, {
    cells: [{ x: 2, z: 2, biome: 'floor', quota: 5 }, { x: 3, z: 2, biome: 'floor', mat: 'inesistente' }]
  }), { matNames: ['erba', 'roccia'] });
  assert.ok(r.errors.some(e => e.code === 'cell-quota'));
  assert.ok(r.errors.some(e => e.code === 'cell-bad-mat'));
});

test('validateSubmission: prop fuori maschera e troppi prop', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const manyProps = Array.from({ length: 61 }, () => ({ name: 'albero', x: 3.5, z: 3.5 }));
  const r = G.validateSubmission(p, mkSubmission(p, { props: manyProps.concat([{ name: 'albero', x: 0.5, z: 0.5 }]) }));
  assert.ok(r.errors.some(e => e.code === 'too-many-props'));
  assert.ok(r.errors.some(e => e.code === 'prop-outside-plot'));
});

test('validateSubmission: consegna oltre il cap byte rifiutata', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const r = G.validateSubmission(p, mkSubmission(p, { blob: 'x'.repeat(500 * 1024) }));
  assert.ok(r.errors.some(e => e.code === 'too-big'));
});

// ── applyClaim ───────────────────────────────────────────────────────────────
test('applyClaim: first-come, il secondo device viene respinto', () => {
  const r1 = G.applyClaim([], { plotId: 'p01', deviceId: 'dev-A', owner: 'Ada', at: 1 });
  assert.equal(r1.ok, true);
  const r2 = G.applyClaim(r1.claims, { plotId: 'p01', deviceId: 'dev-B', owner: 'Bruno', at: 2 });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'taken');
  assert.equal(r2.by, 'Ada');
});

test('applyClaim: stesso device ri-rivendica la stessa parcella (refresh)', () => {
  const r1 = G.applyClaim([], { plotId: 'p01', deviceId: 'dev-A', owner: 'Ada', at: 1 });
  const r2 = G.applyClaim(r1.claims, { plotId: 'p01', deviceId: 'dev-A', owner: 'Ada', at: 9 });
  assert.equal(r2.ok, true);
  assert.equal(r2.claims.length, 1);
});

test('applyClaim: cambio parcella libera la precedente', () => {
  const r1 = G.applyClaim([], { plotId: 'p01', deviceId: 'dev-A', owner: 'Ada', at: 1 });
  const r2 = G.applyClaim(r1.claims, { plotId: 'p02', deviceId: 'dev-A', owner: 'Ada', at: 2 });
  assert.equal(r2.ok, true);
  assert.equal(r2.released, 'p01');
  assert.equal(r2.claims.length, 1);
  assert.equal(r2.claims[0].plotId, 'p02');
});

test('applyClaim: parcella inesistente e richiesta malformata', () => {
  const r = G.applyClaim([], { plotId: 'p99', deviceId: 'd', owner: 'X' }, { plotIds: ['p01'] });
  assert.equal(r.reason, 'no-such-plot');
  assert.equal(G.applyClaim([], { plotId: 'p01', deviceId: '', owner: 'X' }).reason, 'bad-request');
});

// ── mergeGarden ──────────────────────────────────────────────────────────────
test('mergeGarden: celle consegnate sostituiscono il template, props appesi', () => {
  const tpl = mkTemplate();
  const plots = [rectPlot('p01', 2, 2, 5, 5), rectPlot('p02', 10, 10, 5, 5)];
  const sub = {
    plotId: 'p01', concept: TARGHETTA_OK,
    cells: [{ x: 3, z: 3, biome: 'wall', alt: 4 }],
    props: [{ name: 'albero', x: 4.5, z: 4.5 }]
  };
  const out = G.mergeGarden(tpl, [sub], plots);
  assert.equal(out.cells.length, tpl.cells.length); // sostituzione, non aggiunta
  const c = out.cells.find(c => c.x === 3 && c.z === 3);
  assert.equal(c.biome, 'wall');
  assert.equal(out.props.length, 1);
  assert.equal(out.props[0].plot, 'p01');
  assert.equal(out.plots.find(p => p.id === 'p01').status, 'submitted');
  assert.equal(out.plots.find(p => p.id === 'p02').status, 'free');
});

test('mergeGarden: idempotente (merge del merge = stesso risultato)', () => {
  const tpl = mkTemplate();
  const plots = [rectPlot('p01', 2, 2, 5, 5)];
  const sub = { plotId: 'p01', concept: TARGHETTA_OK, cells: [{ x: 2, z: 2, biome: 'water' }], props: [] };
  const once = G.mergeGarden(tpl, [sub], plots);
  const twice = G.mergeGarden(once, [sub], plots);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.cells)), JSON.parse(JSON.stringify(once.cells)));
  assert.equal(twice.props.length, once.props.length);
});

test('mergeGarden: cella consegnata fuori maschera viene ignorata', () => {
  const tpl = mkTemplate();
  const plots = [rectPlot('p01', 2, 2, 3, 3)];
  const sub = { plotId: 'p01', concept: TARGHETTA_OK, cells: [{ x: 0, z: 0, biome: 'wall', alt: 2 }], props: [] };
  const out = G.mergeGarden(tpl, [sub], plots);
  assert.equal(out.cells.find(c => c.x === 0 && c.z === 0).biome, 'floor');
});

test('mergeGarden: output resta un map JSON caricabile (campi top-level)', () => {
  const tpl = mkTemplate();
  const out = G.mergeGarden(tpl, [], [rectPlot('p01', 2, 2, 5, 5)]);
  assert.equal(out.size, 20);
  assert.equal(out.sub, 3);
  assert.ok(Array.isArray(out.cells) && Array.isArray(out.props) && Array.isArray(out.plots));
});

// ── wallVisibility (cutaway) ─────────────────────────────────────────────────
// Parcella con pavimento a z=5..7, muro di cinta a z=4 (nord) e z=8 (sud).
test('wallVisibility: camera che guarda verso +z → ghost il muro nord', () => {
  const floors = new Set(['5,5', '5,6', '5,7']);
  const walls = [{ x: 5, z: 4 }, { x: 5, z: 8 }];
  // forward (0,1): il pavimento (5,5) è "dietro" il muro (5,4) → nord ghost
  const ghost = G.wallVisibility(walls, floors, [0, 1]);
  assert.equal(ghost.has('5,4'), true);
  assert.equal(ghost.has('5,8'), false);
});

test('wallVisibility: camera opposta → ghost il muro sud', () => {
  const floors = new Set(['5,5', '5,6', '5,7']);
  const walls = [{ x: 5, z: 4 }, { x: 5, z: 8 }];
  const ghost = G.wallVisibility(walls, floors, [0, -1]);
  assert.equal(ghost.has('5,8'), true);
  assert.equal(ghost.has('5,4'), false);
});

test('wallVisibility: forward diagonale (iso) ghosta i due lati davanti', () => {
  // stanza 3×3 di pavimento con cinta completa
  const floors = new Set();
  for (let z = 5; z <= 7; z++) for (let x = 5; x <= 7; x++) floors.add(x + ',' + z);
  const walls = [];
  for (let i = 4; i <= 8; i++) {
    walls.push({ x: i, z: 4 }, { x: i, z: 8 }, { x: 4, z: i }, { x: 8, z: i });
  }
  const ghost = G.wallVisibility(walls, floors, [1, 1]); // camera da nord-ovest guarda verso sud-est
  assert.equal(ghost.has('4,5'), true);  // cinta ovest davanti → ghost
  assert.equal(ghost.has('5,4'), true);  // cinta nord davanti → ghost
  assert.equal(ghost.has('8,5'), false); // cinta est dietro → visibile
  assert.equal(ghost.has('5,8'), false); // cinta sud dietro → visibile
});

test('wallVisibility: muro senza pavimento adiacente resta visibile; forward nullo → nessun ghost', () => {
  const floors = new Set(['5,5']);
  const walls = [{ x: 9, z: 9 }, { x: 5, z: 4 }];
  const ghost = G.wallVisibility(walls, floors, [0, 1]);
  assert.equal(ghost.has('9,9'), false);
  assert.equal(G.wallVisibility(walls, floors, [0, 0]).size, 0);
});

test('wallVisibility: divisorio interno ghosta quando occlude', () => {
  // pavimento a ovest e a est del muro (5,5): con camera che guarda +x
  // il pavimento a est (6,5) è dietro il muro → ghost
  const floors = new Set(['4,5', '6,5']);
  const walls = [{ x: 5, z: 5 }];
  assert.equal(G.wallVisibility(walls, floors, [1, 0]).has('5,5'), true);
  assert.equal(G.wallVisibility(walls, floors, [-1, 0]).has('5,5'), true); // simmetrico: occlude l'altro lato
});

// ── namespacePlotLibs (librerie custom studente, Fase 6) ─────────────────────
test('namespacePlotLibs: rinomina custom, riscrive riferimenti, azzera tag', () => {
  const sessionTex = { erba: { png: 'data:s', tags: ['prato'] } };
  const sessionMat = { prato: { color: '#0f0', faces: { top: 'erba' } } };
  const texLib = Object.assign({}, sessionTex, { mia: { png: 'data:m', tags: ['fuoco'] } });
  const matLib = Object.assign({}, sessionMat, {
    lavamia: { color: '#f00', faces: { top: 'mia', side: '#fuoco' }, tags: ['lava'] }
  });
  const r = G.namespacePlotLibs({
    plotId: 'p03',
    cells: [{ x: 1, z: 1, biome: 'floor', mat: 'lavamia' }, { x: 2, z: 1, biome: 'floor', mat: 'prato' }],
    props: [{ name: 'torcia', x: 1.5, z: 1.5, cubes: [{ x: 0, y: 0, z: 0, m: 'lavamia', f: { top: 'mia' } }] }],
    texLib, matLib, sessionTex, sessionMat
  });
  assert.equal(r.cells[0].mat, 'p03.lavamia');       // custom rinominato
  assert.equal(r.cells[1].mat, 'prato');             // di sessione intatto
  assert.equal(r.props[0].cubes[0].m, 'p03.lavamia');
  assert.equal(r.props[0].cubes[0].f.top, 'p03.mia');
  assert.ok(r.materials['p03.lavamia']);
  assert.equal(r.materials['p03.lavamia'].faces.top, 'p03.mia'); // ref interno riscritto
  assert.equal(r.materials['p03.lavamia'].faces.side, '#fuoco'); // #tag intatto
  assert.deepEqual(r.materials['p03.lavamia'].tags, []);         // tag azzerati
  assert.ok(r.textures['p03.mia']);
  assert.deepEqual(r.textures['p03.mia'].tags, []);
  assert.ok(!r.textures['p03.erba']);                // texture di sessione non inviata
});

test('namespacePlotLibs: solo librerie USATE viaggiano; idempotente su nomi già prefissati', () => {
  const texLib = { inutile: { png: 'x', tags: [] }, 'p03.mia': { png: 'y', tags: [] } };
  const matLib = { 'p03.fatto': { color: '#111', faces: { top: 'p03.mia' } } };
  const r = G.namespacePlotLibs({
    plotId: 'p03',
    cells: [{ x: 0, z: 0, biome: 'floor', mat: 'p03.fatto' }],
    props: [], texLib, matLib, sessionTex: {}, sessionMat: {}
  });
  assert.equal(r.cells[0].mat, 'p03.fatto');         // già prefissato → intatto
  assert.deepEqual(r.textures, {});                  // 'inutile' non usata → non viaggia
  assert.deepEqual(r.materials, {});                 // già prefissato → non ri-inviato (sarà in sessione)
});

test('validateSubmission: libs custom — cap numerici e nomi non namespaced rifiutati', () => {
  const p = rectPlot('p01', 2, 2, 5, 5);
  const mkLibs = (n, pfx) => {
    const t = {};
    for (let i = 0; i < n; i++) t[(pfx || 'p01.') + 't' + i] = { png: 'x', tags: [] };
    return t;
  };
  const base = { plotId: 'p01', concept: TARGHETTA_OK, cells: [], props: [] };
  const r1 = G.validateSubmission(p, Object.assign({}, base, { libs: { textures: mkLibs(25) } }));
  assert.ok(r1.errors.some(e => e.code === 'too-many-lib-tex'));
  const r2 = G.validateSubmission(p, Object.assign({}, base, { libs: { textures: mkLibs(1, 'hack-') } }));
  assert.ok(r2.errors.some(e => e.code === 'lib-not-namespaced'));
  const r3 = G.validateSubmission(p, Object.assign({}, base, { libs: { textures: { 'p01.big': { png: 'x'.repeat(70000), tags: [] } } } }));
  assert.ok(r3.errors.some(e => e.code === 'tex-too-big'));
  const r4 = G.validateSubmission(p, Object.assign({}, base, { libs: { textures: mkLibs(2), materials: { 'p01.m': { color: '#111' } } } }));
  assert.equal(r4.ok, true);
});
