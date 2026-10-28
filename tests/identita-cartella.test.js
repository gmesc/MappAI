'use strict';
/*
 * identita-cartella.test.js — packet 0061, «creare non è aprire» (ADR 0013).
 *
 * Due banchi, tutti e due sul codice VERO.
 *
 * 1. I gestori di main.js (`save-vault`, `load-vault`, `get-all-vaults` con `walkMappe`),
 *    ritagliati come `mainHandlers()` di tests/review-store.test.js, su una cartella
 *    temporanea: l'id di progetto sta in `index.yaml` in colonna 0, e le chiavi
 *    `projectId` annidate in `generationUsage` non si leggono mai come identità.
 *
 * 2. I flussi del renderer: la fetta di `StorageManager` (mappai-storage-lang.js),
 *    mappai-vault-io.js, mappai-vault-manager.js e, da mappai-ui-canvas.js, `importGraph`
 *    e `backToLanding` (HOME), in una vm. Il harness è COPIATO da `rendererHarness` di
 *    tests/review-store.test.js (quello resta intatto), con queste differenze:
 *      · `window.StorageManager` è un'ESCA, come nel browser (`function StorageManager() {}`,
 *        senza `currentProjectId` né `idInCartella`): il gestore vero si raggiunge solo
 *        come `StorageManager` lessicale (inv. 3);
 *      · `MappAITeachCore` e `MappAIFilesCore` veri;
 *      · un orologio finto e MONOTONO: ogni `Date.now()` dà un numero nuovo (trappola 5:
 *        nel vm due id coniati nello stesso millisecondo sarebbero uguali). Gli id del
 *        caso stanno sotto la sua base, e ogni id «nuovo» si riconosce perché è uno dei
 *        numeri che l'orologio ha dato DURANTE il gesto (`natoDopo`);
 *      · `electronAPI` in memoria: ogni `saveVault` finisce in `scritture` col suo
 *        `projectId`; `getAllVaults` e `loadVault` rispondono coi dati del caso;
 *      · `localStorage` è una Map che registra ogni `setItem`;
 *      · `console.warn` finisce in `avvisi`, `setTimeout` in `timer` (si eseguono a mano);
 *      · `MappAIElabora` finto con `flushSourcesToVault` asincrona e `fonteInFonti` → false,
 *        e un `readVaultFile` finto: le strade dello 0059 girano, senza scrivere niente.
 *    Ogni gesto è seguito da `h.sano()`: nessun allarme, nessun «ensureProjectVault
 *    fallito», nessun `ensureProjectVault` uscito null in silenzio — un guasto del
 *    harness non deve mai passare per un esito.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const TC = require('../public/js/mappai-teach-core.js');
const FC = require('../public/js/mappai-files-core.js');
const S = require('../public/js/mappai-review-store');

const ID_VECCHIO = 'proj_1788975818955';               // la «Svizzera e 2a GM» del 9/9 (caso vero del 28/9)
const ID = n => 'proj_17890' + String(n).padStart(8, '0');   // proj_1789000000001 …: sotto l'orologio finto
const BASE_OROLOGIO = 1790000000000;

// ═══════════════════════════════════════════════════════════════════════════
// 1. main.js vero
// ═══════════════════════════════════════════════════════════════════════════
function mainHandlers(base) {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const handlers = {};
  const ctx = vm.createContext({ fs, path, Buffer, console: { log() {}, warn() {}, error() {} },
    yaml: require('js-yaml'), ReviewStore: S, FilesCore: FC,
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    _contaNodiInCartella: () => 0,
    mapsBaseDir: () => path.join(base, 'Mappe'), studentsBaseDir: () => path.join(base, 'Allievi'),
    /* 0123 lotto 4: i confini del disco — la cartella temporanea del sistema è la radice */
    Confini: require('../public/js/mappai-confini-core.js'), crypto: require('node:crypto'), process,
    app: { getPath: () => os.tmpdir() }, mappaiRootDir: () => os.tmpdir(), documentsDir: () => os.tmpdir(),
    shell: { trashItem: async () => { throw new Error('Nessun cestino atteso in questo test'); } }
  });
  { const a = source.indexOf('/* ── I CONFINI DEL DISCO'); vm.runInContext(source.slice(a, source.indexOf('const ReviewStore = require(', a)), ctx); }   // 0123 lotto 4
  for (const name of ['_vaultWalkMd', '_vaultPruneEmptyDirs', '_fmDellApp', '_notaDellApp', 'walkMappe']) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'main.js: function ' + name);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
  }
  for (const name of ['save-vault', 'load-vault', 'get-all-vaults']) {
    const start = source.indexOf("ipcMain.handle('" + name + "',");
    assert.ok(start >= 0, 'main.js: ' + name);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), ctx);
  }
  return handlers;
}
function cartellaTemporanea(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0061-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}
const mappaDaSalvare = over => Object.assign({ extractionMode: 'mindmap', rootNodeLabel: 'Prova',
  nodes: [{ id: 'root', label: 'Prova', desc: 'Testo.', level: 0, group: 0 }], links: [], sourcesDict: {} }, over);
// la forma di `mappai-vault-manager.js:160-169`: un mapData scritto a mano, senza `projectId`
const mappaScrittaAMano = () => ({ extractionMode: 'mindmap', rootNodeLabel: 'Prova',
  nodes: [{ id: 'root', label: 'Prova', level: 0, group: 0, x: 640, y: 400 }], links: [], customColors: {} });
const inColonna0 = id => new RegExp('^projectId: "?' + id + '"?$', 'm');
async function dallElenco(h, dir) {
  const all = await h['get-all-vaults']();
  const v = (all || []).find(x => x.fullPath === dir);
  assert.ok(v, 'get-all-vaults elenca la cartella');
  return v;
}

test('0061: M1. save-vault scrive projectId in colonna 0; load-vault e get-all-vaults lo restituiscono', async t => {
  const base = cartellaTemporanea(t), h = mainHandlers(base);
  const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Prova');
  const id = 'proj_1790000000001';
  const save = await h['save-vault']({}, { folderPath: dir, mapData: mappaDaSalvare({ projectId: id }) });
  assert.equal(save.success, true, save.error);
  assert.match(fs.readFileSync(path.join(dir, 'index.yaml'), 'utf8'), inColonna0(id));
  const load = await h['load-vault']({}, dir);
  assert.equal(load.success, true, load.error);
  assert.equal(load.data.projectId, id);
  assert.equal((await dallElenco(h, dir)).projectId, id);
});

test('0061: M2. un mapData senza projectId conserva quello già su disco, anche dopo due salvataggi di fila', async t => {
  const base = cartellaTemporanea(t), h = mainHandlers(base);
  const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Prova');
  const id = 'proj_1790000000002';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.yaml'), 'projectId: ' + id + '\nextractionMode: mindmap\nrootNodeLabel: Prova\nlastUpdated: "2026-09-28T10:00:00.000Z"\n');
  for (let i = 0; i < 2; i++) {
    const save = await h['save-vault']({}, { folderPath: dir, mapData: mappaScrittaAMano() });
    assert.equal(save.success, true, save.error);
    assert.match(fs.readFileSync(path.join(dir, 'index.yaml'), 'utf8'), inColonna0(id), 'dopo il salvataggio ' + (i + 1));
  }
  assert.equal((await h['load-vault']({}, dir)).data.projectId, id);
  assert.equal((await dallElenco(h, dir)).projectId, id);
});

test('0061: M3. un projectId fuori forma non si scrive e non cancella quello valido', async t => {
  const base = cartellaTemporanea(t), h = mainHandlers(base);
  const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Prova');
  const id = 'proj_1790000000003';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.yaml'), 'projectId: ' + id + '\nextractionMode: mindmap\nrootNodeLabel: Prova\n');
  const save = await h['save-vault']({}, { folderPath: dir, mapData: mappaDaSalvare({ projectId: 'tutor_ai_projects' }) });
  assert.equal(save.success, true, save.error);
  const testo = fs.readFileSync(path.join(dir, 'index.yaml'), 'utf8');
  assert.ok(!testo.includes('tutor_ai_projects'), 'la forma sbagliata non entra nel vault');
  assert.match(testo, inColonna0(id), 'quello valido resta');
  assert.equal((await h['load-vault']({}, dir)).data.projectId, id);
});

test('0061: M4. il ripiego riga per riga prende solo la chiave in colonna 0, mai quelle annidate', async t => {
  // rotto apposta (chiave duplicata: js-yaml lancia), con la chiave annidata come nei file veri
  const rotto = colonna0 => (colonna0 ? 'projectId: ' + colonna0 + '\n' : '') +
    'extractionMode: mindmap\nrootNodeLabel: Svizzera e 2a GM\nrootNodeLabel: Svizzera e 2a GM\n' +
    'generationUsage:\n  usedModel: google/gemma-4-31B-it\n  costRecords:\n    - provider: infomaniak\n' +
    '      model: google/gemma-4-31B-it\n      project: Svizzera e 2a GM\n      projectId: proj_1788975818955\n' +
    'lastUpdated: "2026-09-28T10:00:00.000Z"\n';
  assert.throws(() => require('js-yaml').load(rotto()), /duplicated/, 'il file deve far lanciare js-yaml');
  await t.test('solo la chiave annidata → nessun id', async t2 => {
    const base = cartellaTemporanea(t2), h = mainHandlers(base);
    const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Rotto');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.yaml'), rotto());
    const load = await h['load-vault']({}, dir);
    assert.equal(load.success, true, load.error);
    assert.equal(load.data.rootNodeLabel, 'Svizzera e 2a GM', 'il ripiego riga per riga ha letto il file');
    assert.equal(load.data.projectId, undefined, 'load-vault');
    assert.equal((await dallElenco(h, dir)).projectId, undefined, 'readVaultInfo');
  });
  await t.test('con la chiave in colonna 0 → quell\'id', async t2 => {
    const base = cartellaTemporanea(t2), h = mainHandlers(base);
    const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Rotto');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.yaml'), rotto('proj_1790000000001'));
    const load = await h['load-vault']({}, dir);
    assert.equal(load.success, true, load.error);
    assert.equal(load.data.projectId, 'proj_1790000000001', 'load-vault');
    assert.equal((await dallElenco(h, dir)).projectId, 'proj_1790000000001', 'readVaultInfo');
  });
});

test('0061: M5. un vault vecchio senza la chiave: load-vault e get-all-vaults non inventano niente', async t => {
  const base = cartellaTemporanea(t), h = mainHandlers(base);
  const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Vecchio');
  fs.mkdirSync(dir, { recursive: true });
  // YAML valido, e le chiavi annidate valide ci sono (come nei file veri): non sono l'identità
  fs.writeFileSync(path.join(dir, 'index.yaml'), 'extractionMode: mindmap\nrootNodeLabel: Vecchio\n' +
    'generationUsage:\n  costRecords:\n    - project: Vecchio\n      projectId: proj_1788975818955\n' +
    'lastUpdated: "2026-09-01T10:00:00.000Z"\n');
  const load = await h['load-vault']({}, dir);
  assert.equal(load.success, true, load.error);
  assert.equal(load.data.projectId, undefined, 'load-vault');
  assert.equal((await dallElenco(h, dir)).projectId, undefined, 'get-all-vaults');
});

// Aggiunta del 30/09 (§6): il ripiego riga per riga di `save-vault`, che M2-M4 non vedevano.
test('0061: M6. save-vault, file rotto: conserva l\'id in colonna 0, non quello annidato che viene prima', async t => {
  const base = cartellaTemporanea(t), h = mainHandlers(base);
  const dir = path.join(base, 'Mappe', '4R', 'Storia', 'Rotto');
  // chiave duplicata: js-yaml lancia; la riga annidata dei consumi viene PRIMA di quella in colonna 0
  const rotto = 'extractionMode: mindmap\nrootNodeLabel: Svizzera e 2a GM\nrootNodeLabel: Svizzera e 2a GM\n' +
    'generationUsage:\n  costRecords:\n    - provider: infomaniak\n      project: Svizzera e 2a GM\n      projectId: proj_1788975818955\n' +
    'projectId: proj_1790000000001\n' +
    'lastUpdated: "2026-09-28T10:00:00.000Z"\n';
  assert.throws(() => require('js-yaml').load(rotto), /duplicated/, 'il file deve far lanciare js-yaml');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.yaml'), rotto);
  const save = await h['save-vault']({}, { folderPath: dir, mapData: mappaScrittaAMano() });
  assert.equal(save.success, true, save.error);
  const testo = fs.readFileSync(path.join(dir, 'index.yaml'), 'utf8');
  assert.match(testo, inColonna0('proj_1790000000001'), 'l\'id in colonna 0 resta');
  assert.ok(!/^projectId: "?proj_1788975818955/m.test(testo), 'quello annidato non diventa l\'identità');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. I flussi veri del renderer
// ═══════════════════════════════════════════════════════════════════════════
function nodi(titolo) {
  return { nodes: [{ id: 'root', label: titolo, desc: 'Testo della mappa.', level: 0, group: 0 },
    { id: 'a', label: 'Ramo', desc: 'Un dettaglio.', level: 1, group: 1 }],
  links: [{ source: 'root', target: 'a', rel: 'include' }], sourcesDict: {}, studySets: [], customColors: {} };
}
// lo stato di una mappa in memoria (appState) e la sua fotografia in localStorage
const mappa = (titolo, over) => Object.assign({ db: nodi(titolo), rootNodeLabel: titolo, extractionMode: 'mindmap',
  generationDiscipline: 'Storia' }, over);
const fotografia = (titolo, over) => JSON.stringify(mappa(titolo, over));
// la risposta di `load-vault` (forma di main.js)
const datiVault = (titolo, over) => Object.assign({ nodes: nodi(titolo).nodes, links: nodi(titolo).links, sourcesDict: {},
  extractionMode: 'mindmap', rootNodeLabel: titolo, studySets: [], _pipelineManifest: null }, over);
// una riga di `get-all-vaults` da un percorso /M/<classe>/<materia>/<nome>
function cartella(fullPath, over) {
  const segs = fullPath.split('/').filter(Boolean);
  return Object.assign({ folderName: segs[segs.length - 1], fullPath: fullPath, classDir: segs[1], discDir: segs[2],
    rootNodeLabel: segs[segs.length - 1] }, over);
}
const voce = (id, vault, over) => Object.assign({ id: id, name: vault || 'Mappa', vault: vault, classDir: '4R',
  discDir: 'Storia', date: 1788000000000 }, over);
const cassetto = (voci, foto) => Object.assign({ tutor_ai_projects: JSON.stringify(voci) }, foto || {});

function rendererHarness(caso = {}) {
  let orologio = BASE_OROLOGIO;
  const emessi = [];
  class OrologioFinto extends Date { static now() { orologio += 1; emessi.push(orologio); return orologio; } }
  const scritture = [], avvisi = [], errori = [], allarmi = [], timer = [], restore = [], scritteLS = [],
    aperture = [], ritorniEPV = [];
  const local = new Map(Object.entries(caso.cassetto || {}));
  let ctx = null;
  const window = {
    electronAPI: {
      filesRootGet: async () => {
        // R6b: l'autosave del rendering che cade DENTRO l'attesa, a ogni chiamata
        if (caso.autosaveNellAttesa) ctx._storage.saveCurrentProject();
        return { mapsBaseDir: caso.mapsBaseDir || '/M' };   // 30/09, R22: la base di Windows
      },
      getAllVaults: async () => JSON.parse(JSON.stringify(caso.cartelle || [])),
      saveVault: async ({ folderPath, mapData }) => {
        scritture.push({ folderPath: folderPath, projectId: mapData ? mapData.projectId : undefined });
        if (caso.saveLancia) throw new Error(caso.saveLancia);   // 30/09, R13c: la scrittura che lancia
        return caso.esitoSave || { success: true };
      },
      loadVault: async p => {
        const d = (caso.disco || {})[p];
        return d ? { success: true, data: JSON.parse(JSON.stringify(d)) } : { success: false, error: 'Cartella non trovata' };
      },
      pickFolder: async () => ({ folderPath: caso.scelta }),
      readVaultFile: async () => ({ ok: false, error: 'file non trovato: index.yaml' }),
      saveMapJSON() {}
    },
    addEventListener() {}, showLoadingOverlay() {}, showToast() {},
    showAlert: (titolo, testo) => allarmi.push(titolo + ': ' + testo),
    t: (_k, f) => f, setTutorState() {}, renderStudySets() {}, switchToMapLayout() {}, updateCostDisplay() {},
    location: { reload() {} },
    MappAIPipeline: { checkResume() {} },
    MappAIReview: { restore: async (cartellaAperta, stored) => { restore.push(cartellaAperta); ctx.appState._pipelineManifest = stored || null; } },
    MappAITeachCore: TC, MappAIFilesCore: FC,
    MappAIClasses: { getActive: () => ({ name: '4R' }), activeDiscipline: () => 'Storia', activeStudentName: () => '', activeId: () => 'cls-4r' },
    MappAIVaults: { segnala() {} },
    MappAIElabora: { flushSourcesToVault: async () => {}, fonteInFonti: () => false },
    StorageManager: function StorageManager() {}   // l'esca: nel browser `window.StorageManager` è la classe nativa
  };
  ctx = vm.createContext({ window, Date: OrologioFinto,
    console: { log() {}, warn: (...a) => avvisi.push(a.map(String).join(' ')), error: (...a) => errori.push(a.map(String).join(' ')) },
    appState: caso.appState || mappa('Mappa'),
    document: { getElementById: () => null }, simulation: null,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => { scritteLS.push(k); local.set(k, String(v)); },
      removeItem: k => { local.delete(k); } },
    setTimeout: (fn, ms) => { timer.push({ fn: fn, ms: ms }); return timer.length; },
    initD3Visualization() {}, serializeTutorState: () => null, tutorState: null,
    fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(caso.demo)) }),
    FileReader: class { readAsText(file) { this.onload({ target: { result: file.testo } }); } }
  });
  const storage = fs.readFileSync(path.join(__dirname, '../public/js/mappai-storage-lang.js'), 'utf8');
  const start = storage.indexOf('const StorageManager = {');
  vm.runInContext(storage.slice(start, storage.indexOf('\n};', start) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-vault-io.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-vault-manager.js'), 'utf8'), ctx);
  const canvas = fs.readFileSync(path.join(__dirname, '../public/js/mappai-ui-canvas.js'), 'utf8');
  for (const nome of ['window.importGraph = function', 'window.backToLanding = function']) {
    const i = canvas.indexOf(nome);
    assert.ok(i >= 0, 'mappai-ui-canvas.js: ' + nome);
    vm.runInContext(canvas.slice(i, canvas.indexOf('\n}', i) + 2), ctx);
  }
  // la finestra dei vault è UI: `loadDemoGraph` la chiude, qui non c'è niente da chiudere
  window.closeVaultManager = () => {};
  // spie che passano la chiamata al codice vero
  const direct = window.directLoadVault;
  window.directLoadVault = function (p) { aperture.push(p); return direct.apply(this, arguments); };
  const epv = window.ensureProjectVault;
  window.ensureProjectVault = async function () { const r = await epv.apply(this, arguments); ritorniEPV.push(r); return r; };
  const h = {
    ctx, window, caso, local, scritture, avvisi, errori, allarmi, timer, restore, scritteLS, aperture, ritorniEPV, emessi,
    id: () => ctx._storage.currentProjectId,
    voci: () => JSON.parse(local.get('tutor_ai_projects') || '[]'),
    voce: id => h.voci().find(p => p.id === id),
    // un id «nuovo e noto»: uno dei numeri che l'orologio finto ha dato dopo l'indice `da`
    natoDopo: (id, da) => typeof id === 'string' && emessi.slice(da).some(n => id === 'proj_' + n),
    // il backfill pigro di `loadProject` (400 ms); il disegno (200 ms) e il tetto di HOME (4 s) no
    timerBackfill: () => timer.filter(x => x.ms === 400 || /ensureProjectVault|directLoadVault/.test(String(x.fn))),
    flush: async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); },
    home: async () => { window.backToLanding(); await h.flush(); },
    sano: etichetta => {
      const e = etichetta ? etichetta + ': ' : '';
      assert.deepEqual(allarmi, [], e + 'nessun allarme');
      assert.ok(!avvisi.some(a => /ensureProjectVault fallito/.test(a)), e + avvisi.join(' | '));
      assert.ok(ritorniEPV.every(Boolean), e + 'ensureProjectVault non è uscito null in silenzio');
    }
  };
  return h;
}
// lo stato che un gesto fallito deve lasciare com'era
function statoIdentita(h) {
  const a = h.ctx.appState, ic = h.ctx._storage.idInCartella;
  return JSON.stringify({ percorso: a.activeVaultPath === undefined ? '(assente)' : a.activeVaultPath,
    classe: a.activeVaultClassDir === undefined ? '(assente)' : a.activeVaultClassDir,
    materia: a.activeVaultDiscDir === undefined ? '(assente)' : a.activeVaultDiscDir,
    id: h.id(), idInCartella: ic === undefined ? '(assente)' : ic });
}

// Il caso vero del 28/9: la voce del 9/9 e la sua fotografia.
const SVIZZERA = 'Svizzera e 2a GM';
const PERCORSO_28 = '/M/4R/Storia/' + SVIZZERA;
const VOCE_VECCHIA = { id: ID_VECCHIO, name: SVIZZERA, vault: SVIZZERA, classDir: '4R', discDir: 'Storia', date: 1788975818955 };
const FOTO_VECCHIA = fotografia(SVIZZERA, { activeVaultPath: PERCORSO_28, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' });
const CASSETTO_28 = () => cassetto([VOCE_VECCHIA], { [ID_VECCHIO]: FOTO_VECCHIA });

test('0061: R1a. il caso del 28/09, flusso vero: la mappa nuova omonima non prende l\'id della vecchia', async () => {
  const h = rendererHarness({ cassetto: CASSETTO_28(), cartelle: [], appState: mappa(SVIZZERA) });
  h.window.resetVaultState();
  const X = h.id();
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res, 'ensureProjectVault non esce null'); h.sano();
  assert.equal(h.id(), X, 'l\'id resta quello nato con la generazione');
  assert.notEqual(X, ID_VECCHIO);
  assert.match(String(X), /^proj_\d{10,16}$/);
  assert.equal(JSON.stringify(h.voce(ID_VECCHIO)), JSON.stringify(VOCE_VECCHIA), 'la voce vecchia è intatta');
  assert.equal(h.local.get(ID_VECCHIO), FOTO_VECCHIA, 'la fotografia vecchia è intatta');
  assert.deepEqual(h.scritture, [{ folderPath: PERCORSO_28, projectId: X }], 'una sola scrittura, con l\'id');
});

test('0061: R1b. partenza dall\'id vecchio, senza reset: la creazione conia', async () => {
  const h = rendererHarness({ cassetto: CASSETTO_28(), cartelle: [], appState: mappa(SVIZZERA) });
  h.ctx._storage.currentProjectId = ID_VECCHIO;
  h.ctx.appState.activeVaultPath = null;
  const da = h.emessi.length;
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res, 'ensureProjectVault non esce null'); h.sano();
  const id = h.id();
  assert.notEqual(id, ID_VECCHIO, 'la voce del giro dichiara già una cartella: non è di questa creazione');
  assert.ok(h.natoDopo(id, da), 'id coniato durante il gesto: ' + id);
  assert.deepEqual(h.scritture, [{ folderPath: PERCORSO_28, projectId: id }]);
});

test('0061: R2. guardia 11/9, cura (a): classe e disciplina della cartella creata, non i residui', async () => {
  const h = rendererHarness({ cassetto: cassetto([]), cartelle: [],
    appState: mappa('Nuova', { activeVaultPath: null, activeVaultClassDir: 'RESIDUO', activeVaultDiscDir: 'VECCHIO' }) });
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res); h.sano();
  assert.equal(h.ctx.appState.activeVaultClassDir, '4R');
  assert.equal(h.ctx.appState.activeVaultDiscDir, 'Storia');
  const v = h.voce(h.id());
  assert.ok(v, 'la voce della mappa è salvata');
  assert.deepEqual([v.vault, v.classDir, v.discDir], ['Nuova', '4R', 'Storia']);
});

test('0061: R3. guardia 11/9, cura (b): dopo la creazione l\'id non cambia più', async () => {
  const h = rendererHarness({ cassetto: cassetto([]), cartelle: [], appState: mappa('Nuova') });
  h.window.resetVaultState();
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res); h.sano();
  const id = h.id();
  h.ctx._storage.saveCurrentProject();
  h.ctx._storage.saveCurrentProject();
  assert.equal(h.id(), id, 'la rete non scatta');
  assert.equal(h.voci().filter(p => p.id === id).length, 1);
});

test('0061: R4. guardia 11/9, la porta: la voce la cui cartella dichiara un altro id la lascia', async () => {
  const E = ID(5), N = ID(6), X = '/M/4R/Storia/X';
  const voceE = voce(E, 'X', { date: 1789000000005 }), voceN = voce(N, 'X', { date: 1789500000000 });
  const h = rendererHarness({
    cassetto: cassetto([voceN, voceE], { [E]: fotografia('X', { activeVaultPath: X, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' }) }),
    cartelle: [cartella(X, { projectId: N })],
    disco: { [X]: datiVault('X', { projectId: N, _pipelineManifest: { review: { generationId: 'della-mappa-N' } } }) }
  });
  assert.equal(await h.ctx._storage.loadProject(E), true, 'la mappa E si apre'); h.sano();
  assert.equal(h.ctx.appState.activeVaultPath, null, 'la voce lascia la cartella di un\'altra mappa');
  assert.equal(h.ctx.appState.activeVaultClassDir, null);
  assert.equal(h.ctx.appState.activeVaultDiscDir, null);
  assert.equal(h.ctx.appState._pipelineManifest, null, 'il manifest della cartella è della mappa N');
  assert.ok(h.avvisi.some(a => a.includes(E) && a.includes(N)), 'un avviso dello stacco, coi due id');
  assert.ok(!h.restore.includes(X), 'MappAIReview.restore non parte sulla cartella di N');
  assert.equal(h.timerBackfill().length, 0, 'nessun backfill per questa apertura');
  assert.equal(h.id(), E);
  const res = await h.window.ensureProjectVault({ reason: 'open' });
  assert.ok(res); h.sano();
  assert.deepEqual(h.scritture, [{ folderPath: X + ' · 02', projectId: E }], 'una cartella nuova per E, niente su X');
});

test('0061: R5. il backfill all\'apertura tiene l\'id della voce aperta', async () => {
  const P = ID(7), Q = ID(8);
  const h = rendererHarness({
    cassetto: cassetto([voce(Q, 'Omonima', { date: 1789500000000 }), voce(P, null, { name: 'Omonima', classDir: null, discDir: null })],
      { [P]: fotografia('Omonima') }),
    cartelle: []   // nessuna cartella dichiara P (e quella di Q non sta in Mappe/)
  });
  assert.equal(await h.ctx._storage.loadProject(P), true); h.sano();
  const bf = h.timerBackfill();
  assert.equal(bf.length, 1, 'il backfill pigro è programmato');
  bf[0].fn(); await h.flush(); h.sano();
  assert.equal(h.ritorniEPV.length, 1, 'il backfill passa da ensureProjectVault');
  assert.equal(h.id(), P, 'l\'id resta quello della voce aperta');
  assert.deepEqual(h.scritture, [{ folderPath: '/M/4R/Storia/Omonima', projectId: P }]);
});

function casoR6(extra) {
  const P = ID(9), A = '/M/4R/Storia/Altra';
  const fotoP = fotografia('Altra', { activeVaultPath: A, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' });
  const voceP = voce(P, 'Altra', { date: 1789000000009 });
  const h = rendererHarness(Object.assign({ cassetto: cassetto([voceP], { [P]: fotoP }), cartelle: [cartella(A)],
    appState: JSON.parse(fotoP) }, extra));
  h.ctx._storage.currentProjectId = P;
  return { h, P, fotoP, voceP };
}

test('0061: R6. l\'id nato con la generazione non resta orfano, e la mappa di prima non si tocca', async () => {
  const { h, P, fotoP, voceP } = casoR6();
  h.window.resetVaultState();
  const X = h.id();
  h.ctx.appState.db = nodi('Nuova'); h.ctx.appState.rootNodeLabel = 'Nuova';
  h.ctx._storage.saveCurrentProject();                 // l'autosave del giro (vault: null)
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res); h.sano();
  assert.notEqual(X, P, 'la generazione ha un id suo');
  assert.equal(h.id(), X);
  const vX = h.voce(X);
  assert.ok(vX, 'la voce della mappa nuova');
  assert.deepEqual([vX.vault, vX.classDir, vX.discDir], ['Nuova', '4R', 'Storia'], 'dichiara la cartella nuova');
  assert.equal(JSON.stringify(h.voce(P)), JSON.stringify(voceP), 'la voce di P è intatta');
  assert.equal(h.local.get(P), fotoP, 'la fotografia di P è intatta');
  assert.deepEqual(h.voci().filter(p => !p.vault).map(p => p.id), [], 'nessuna voce orfana');
});

test('0061: R6b. un autosave che cade durante l\'adozione non fa un secondo id', async () => {
  const { h } = casoR6({ autosaveNellAttesa: true });
  h.window.resetVaultState();
  const X = h.id();
  h.ctx.appState.db = nodi('Nuova'); h.ctx.appState.rootNodeLabel = 'Nuova';
  h.ctx._storage.saveCurrentProject();
  const res = await h.window.ensureProjectVault({ reason: 'generation' });
  assert.ok(res); h.sano();
  assert.equal(h.id(), X, 'alla fine, lo stesso id');
  const nuove = h.voci().filter(p => p.name === 'Nuova');
  assert.equal(nuove.length, 1, 'una sola voce per la mappa nuova');
  assert.equal(nuove[0].vault, 'Nuova', 'che dichiara la cartella');
});

test('0061: R7. resetVaultState fa nascere l\'identità', () => {
  const { h, P } = casoR6();
  h.ctx._storage.idInCartella = { percorso: '/M/4R/Storia/Altra', id: P };
  const da = h.emessi.length;
  h.window.resetVaultState();
  const id = h.id();
  assert.notEqual(id, P);
  assert.ok(h.natoDopo(id, da), 'coniato dal reset: ' + id);
  assert.match(String(id), /^proj_\d{10,16}$/);
  assert.equal(h.ctx._storage.idInCartella, null);
  h.sano();
});

test('0061: R8. riaprire una cartella esistente ritrova il suo id, non quello dell\'omonima più recente', async () => {
  const N = ID(10), M = ID(11), X = '/M/4R/Storia/X';
  const h = rendererHarness({ cassetto: cassetto([voce(M, 'X', { date: 1789500000000 }), voce(N, 'X', { date: 1789000000000 })]),
    cartelle: [cartella(X, { projectId: N })], disco: { [X]: datiVault('X', { projectId: N }) } });
  assert.equal(TC.progettoDelVault(h.voci(), { vault: 'X', classDir: '4R', discDir: 'Storia' }).id, M, 'per nome vincerebbe M');
  await h.window.directLoadVault(X); h.sano();
  assert.equal(h.id(), N);
});

test('0061: R9. la cartella spostata in Analisi e rinominata ritrova il suo id, e la rete non lo stacca', async () => {
  const N = ID(12), dir = '/Analisi/21 ' + SVIZZERA;
  const h = rendererHarness({ cassetto: cassetto([voce(N, SVIZZERA)], { [N]: FOTO_VECCHIA }), cartelle: [],
    disco: { [dir]: datiVault(SVIZZERA, { projectId: N }) }, scelta: dir });
  await h.window.loadMapVault(); h.sano();
  assert.equal(h.id(), N, 'l\'id della cartella');
  h.ctx._storage.saveCurrentProject();
  assert.equal(h.id(), N, 'la rete non lo stacca');
  const v = h.voce(N);
  assert.deepEqual([v.vault, v.classDir, v.discDir], ['21 ' + SVIZZERA, null, null], 'la posizione segue la cartella (D5)');
  await h.home(); h.sano();
  assert.deepEqual(h.scritture.at(-1), { folderPath: dir, projectId: N }, 'il salvataggio seguente porta N');
});

test('0061: R9b. una fotografia vecchia, senza la classe della cartella, tiene la classe della voce', async () => {
  const V = ID(13), dir = '/M/4R/Storia/V';
  const h = rendererHarness({ cassetto: cassetto([voce(V, 'V')], { [V]: fotografia('V', { activeVaultPath: dir }) }),
    cartelle: [cartella(dir)], disco: { [dir]: datiVault('V') } });
  assert.equal(await h.ctx._storage.loadProject(V), true); h.sano();
  h.ctx._storage.saveCurrentProject();
  const v = h.voce(V);
  assert.equal(v.classDir, '4R');
  assert.equal(v.discDir, 'Storia');
});

test('0061: R10. la rete del 15/8 resta: un percorso cambiato a mano stacca l\'identità', async () => {
  const P = ID(14), dir = '/M/4R/Storia/P';
  const h = rendererHarness({ cassetto: cassetto([voce(P, 'P')], { [P]: fotografia('P', { activeVaultPath: dir }) }),
    cartelle: [cartella(dir, { projectId: P })], disco: { [dir]: datiVault('P', { projectId: P }) } });
  await h.window.directLoadVault(dir); h.sano();
  assert.equal(h.id(), P);
  h.ctx._storage.saveCurrentProject();
  const da = h.emessi.length;
  h.ctx.appState.activeVaultPath = '/M/4R/Storia/Q';   // a mano, senza adottare
  h.ctx._storage.saveCurrentProject();
  const id = h.id();
  assert.notEqual(id, P, 'la rete scatta');
  assert.ok(h.natoDopo(id, da), 'id nuovo e noto: ' + id);
});

test('0061: R11. un id fuori forma in index.yaml non tocca localStorage', async () => {
  const dir = '/M/4R/Storia/Z';
  const h = rendererHarness({ cassetto: cassetto([]), cartelle: [cartella(dir, { projectId: 'tutor_ai_projects' })],
    disco: { [dir]: datiVault('Z', { projectId: 'tutor_ai_projects' }) } });
  await h.window.directLoadVault(dir); h.sano();
  h.ctx._storage.saveCurrentProject();                  // le aperture non salvano da sé: l'autosave passa dal timer
  const id = h.id();
  assert.match(String(id), /^proj_\d{10,16}$/);
  assert.notEqual(id, 'tutor_ai_projects');
  const indice = JSON.parse(h.local.get('tutor_ai_projects'));
  assert.ok(Array.isArray(indice) && indice.length === 1 && indice.every(p => p && /^proj_\d{10,16}$/.test(p.id)),
    'tutor_ai_projects è ancora un elenco di voci');
  // `mappai_studysets_index` è la chiave fissa dell'indice dei set, scritta da ogni salvataggio
  const fuori = h.scritteLS.filter(k => !(k === 'tutor_ai_projects' || k === 'mappai_studysets_index' || k.startsWith('proj_')));
  assert.deepEqual(fuori, [], 'nessuna chiave nata dall\'id fuori forma');
});

test('0061: R12. la copia di una cartella riceve un id nuovo e lo scrive', async () => {
  const N = ID(15), A = '/M/4R/Storia/X', B = '/M/4R/Geografia/X';
  const h = rendererHarness({ cassetto: cassetto([voce(N, 'X')]),
    cartelle: [cartella(A, { projectId: N }), cartella(B, { projectId: N })],
    disco: { [A]: datiVault('X', { projectId: N }), [B]: datiVault('X', { projectId: N }) } });
  const da = h.emessi.length;
  await h.window.directLoadVault(B); h.sano();
  const id = h.id();
  assert.notEqual(id, N, 'la copia non eredita l\'id');
  assert.ok(h.natoDopo(id, da), 'id nuovo e noto: ' + id);
  await h.home(); h.sano();
  assert.deepEqual(h.scritture.at(-1), { folderPath: B, projectId: id }, 'il salvataggio seguente lo porta');
});

/* 0124 (ADR 0025): qui c'erano R13 («Esporta nel Vault» tiene l'id della mappa in memoria) e R13b (esportare una
   mappa legata altrove è una copia), con l'aiutante `casoR13b`: provavano `saveMapVault`, uscita col packet. Di R13c
   restano i sottocasi di ensureProjectVault. */
test('0061: R13c. un salvataggio fallito lascia tutto com\'era', async t => {
  await t.test('ensureProjectVault', async () => {
    const V = ID(18);
    const h = rendererHarness({ cassetto: cassetto([voce(V, 'Altra')], { [V]: fotografia('Altra') }), cartelle: [],
      appState: mappa('Nuova', { activeVaultPath: null, activeVaultClassDir: 'RESIDUO', activeVaultDiscDir: 'VECCHIO' }),
      esitoSave: { success: false } });
    h.ctx._storage.currentProjectId = V;
    const prima = statoIdentita(h);
    const res = await h.window.ensureProjectVault({ reason: 'generation' });
    assert.equal(res, null, 'il ritorno di oggi');
    assert.equal(statoIdentita(h), prima);
    assert.ok(!h.avvisi.some(a => /ensureProjectVault fallito/.test(a)), h.avvisi.join(' | '));
  });
});

// Aggiunta del 30/09 (§6): la scrittura che LANCIA, non solo { success: false } — il ripristino nel `catch`.
test('0061: R13c (sottocasi: saveVault che lancia). l\'identità torna com\'era anche quando la scrittura lancia', async t => {
  await t.test('ensureProjectVault, ramo (2)', async () => {
    const V = ID(27);
    const h = rendererHarness({ cassetto: cassetto([voce(V, 'Altra')], { [V]: fotografia('Altra') }), cartelle: [],
      appState: mappa('Nuova', { activeVaultPath: null, activeVaultClassDir: 'RESIDUO', activeVaultDiscDir: 'VECCHIO' }),
      saveLancia: 'disco staccato' });
    h.ctx._storage.currentProjectId = V;
    const prima = statoIdentita(h);
    const res = await h.window.ensureProjectVault({ reason: 'generation' });
    assert.equal(res, null, 'il ritorno di oggi');
    assert.equal(statoIdentita(h), prima, 'i cinque valori come prima del gesto');
    assert.ok(h.avvisi.some(a => /ensureProjectVault fallito: disco staccato/.test(a)), 'l\'avviso di oggi: ' + h.avvisi.join(' | '));
  });
});

test('0061: R14. buildVaultMapData manda l\'id solo per la cartella che lo porta', () => {
  const A = ID(19), B = ID(20);
  const h = rendererHarness({ appState: mappa('A', { activeVaultPath: '/M/4R/Storia/A' }) });
  const SM = h.ctx._storage;
  SM.currentProjectId = A;
  const pid = ic => { SM.idInCartella = ic; return h.window.buildVaultMapData().projectId; };
  assert.equal(pid({ percorso: '/M/4R/Storia/B', id: A }), undefined, 'idInCartella di un altro percorso');
  assert.equal(pid({ percorso: '/M/4R/Storia/A', id: null }), undefined, 'idInCartella.id null');
  assert.equal(pid({ percorso: '/M/4R/Storia/A', id: B }), undefined, 'un id diverso da currentProjectId');
  assert.equal(pid(null), undefined, 'nessuna adozione');
  assert.equal(pid({ percorso: '/M/4R/Storia/A', id: A }), A, 'controllo: la cartella che lo porta');
  h.sano();
});

test('0061: R15. una voce senza cartella ritrova la sua per id (D7)', async () => {
  const X = ID(21), F = '/M/4R/Storia/F';
  const h = rendererHarness({ cassetto: cassetto([voce(X, null, { name: 'F' })], { [X]: fotografia('F') }),
    cartelle: [cartella(F, { projectId: X })], disco: { [F]: datiVault('F', { projectId: X }) } });
  assert.equal(await h.ctx._storage.loadProject(X), true); h.sano();
  const bf = h.timerBackfill();
  assert.equal(bf.length, 1, 'il backfill pigro è programmato');
  bf[0].fn(); await h.flush(); h.sano();
  assert.deepEqual(h.aperture, [F], 'la cartella che dichiara X si apre');
  assert.ok(!h.scritture.some(s => s.folderPath === F + ' · 02'), 'nessuna seconda cartella');
  assert.equal(h.id(), X);
});

test('0061: R18. «Apri Vault» su una cartella vuota è una creazione', async t => {
  for (const via of ['loadMapVault', 'directLoadVault']) {
    await t.test(via, async () => {
      const P = ID(22), dirP = '/M/4R/Storia/P';
      const h = rendererHarness({
        cassetto: cassetto([VOCE_VECCHIA, voce(P, 'P')], { [ID_VECCHIO]: FOTO_VECCHIA, [P]: fotografia('P', { activeVaultPath: dirP }) }),
        cartelle: [cartella(dirP, { projectId: P })],
        disco: { [PERCORSO_28]: datiVault('', { nodes: [], links: [] }) },    // vuota: niente nodi, niente manifest
        appState: mappa('P', { activeVaultPath: dirP, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' }),
        scelta: PERCORSO_28 });
      h.ctx._storage.currentProjectId = P;
      const da = h.emessi.length;
      if (via === 'loadMapVault') await h.window.loadMapVault(); else await h.window.directLoadVault(PERCORSO_28);
      h.sano();
      const id = h.id();
      assert.ok(h.natoDopo(id, da), 'id nuovo e noto: ' + id);
      assert.notEqual(id, P);
      assert.notEqual(id, ID_VECCHIO);
      await h.home(); h.sano();
      assert.deepEqual(h.scritture.filter(s => s.folderPath === PERCORSO_28).at(-1), { folderPath: PERCORSO_28, projectId: id },
        'il salvataggio seguente con buildVaultMapData lo scrive');
    });
  }
});

function casoR19(extra) {
  const P = ID(23), dirP = '/M/4R/Storia/P';
  const h = rendererHarness(Object.assign({ cassetto: cassetto([voce(P, 'P')], { [P]: fotografia('P', { activeVaultPath: dirP }) }),
    cartelle: [cartella(dirP, { projectId: P })],
    appState: mappa('P', { activeVaultPath: dirP, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' }),
    demo: { nodes: nodi('Demo').nodes, links: nodi('Demo').links, rootNodeLabel: 'Demo' } }, extra));
  h.ctx._storage.currentProjectId = P;
  h.ctx._storage.idInCartella = { percorso: dirP, id: P };
  return { h, P, dirP };
}
async function nonEreditaLaCartella(h, P, dirP, da) {
  assert.equal(h.ctx.appState.activeVaultPath, null, 'la cartella di prima non è più quella attiva');
  const id = h.id();
  assert.notEqual(id, P);
  assert.ok(h.natoDopo(id, da), 'id nuovo e noto: ' + id);
  await h.home(); h.sano();
  assert.deepEqual(h.scritture.filter(s => s.folderPath === dirP), [], 'HOME non scrive nella cartella di prima, né con l\'id né senza');
}

test('0061: R19a. una mappa dimostrativa non eredita la cartella', async () => {
  const { h, P, dirP } = casoR19();
  const da = h.emessi.length;
  await h.window.loadDemoGraph('demo/mappa.json'); h.sano();
  assert.equal(h.ctx.appState.rootNodeLabel, 'Demo', 'la demo è caricata');
  await nonEreditaLaCartella(h, P, dirP, da);
});

test('0061: R19b. un import non eredita la cartella', async () => {
  const { h, P, dirP } = casoR19();
  const da = h.emessi.length;
  h.window.importGraph({ target: { files: [{ testo: JSON.stringify({ nodes: nodi('Importata').nodes, links: nodi('Importata').links,
    rootNodeLabel: 'Importata' }) }], value: 'mappa.json' } });
  h.sano();
  assert.equal(h.ctx.appState.rootNodeLabel, 'Importata', 'la mappa importata è caricata');
  await nonEreditaLaCartella(h, P, dirP, da);
});

test('0061: R20. il bivio 2 nei flussi: un vault vecchio riconosciuto per nome riceve l\'id (A)', async () => {
  const V = ID(24), dir = '/M/4R/Storia/V';
  const h = rendererHarness({ cassetto: cassetto([voce(V, 'V')], { [V]: fotografia('V', { activeVaultPath: dir }) }),
    cartelle: [cartella(dir)], disco: { [dir]: datiVault('V') } });
  await h.window.directLoadVault(dir); h.sano();
  assert.equal(h.id(), V, 'riconosciuto per nome, come oggi');
  assert.equal(h.window.buildVaultMapData().projectId, V, 'con A l\'id entra nella cartella (con B: undefined)');
  await h.home(); h.sano();
  assert.deepEqual(h.scritture.at(-1), { folderPath: dir, projectId: V });
});

test('0061: R21. la porta dell\'11/9 per le cartelle senza id', async t => {
  const E = ID(25), N = ID(26), X = '/M/4R/Storia/X';
  const caso = conN => rendererHarness({
    cassetto: cassetto([conN ? voce(N, 'X', { date: 1789500000000 }) : null, voce(E, 'X', { date: 1789000000000 })].filter(Boolean),
      { [E]: fotografia('X', { activeVaultPath: X, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' }) }),
    cartelle: [cartella(X)], disco: { [X]: datiVault('X') } });
  await t.test('con una voce più recente nella stessa posizione, la voce aperta non scrive il suo id', async () => {
    const h = caso(true);
    assert.equal(await h.ctx._storage.loadProject(E), true); h.sano();
    assert.equal(h.ctx.appState.activeVaultPath, X, 'la mappa si apre, senza stacco');
    assert.equal(h.id(), E);
    assert.equal(h.window.buildVaultMapData().projectId, undefined);
    await h.home(); h.sano();
    assert.ok(h.scritture.length > 0, 'HOME scrive la cartella');
    assert.ok(!h.scritture.some(s => s.projectId === E), 'e la scrittura non porta E');
  });
  await t.test('controprova: senza la voce più recente, la voce aperta scrive il suo id (bivio 2 = A)', async () => {
    const h = caso(false);
    assert.equal(await h.ctx._storage.loadProject(E), true); h.sano();
    assert.equal(h.window.buildVaultMapData().projectId, E);
    await h.home(); h.sano();
    assert.deepEqual(h.scritture.at(-1), { folderPath: X, projectId: E });
  });
});

// Aggiunte del 30/09 (§6).
// R22, scelta A di Giacomo: su Windows i percorsi nativi hanno `\`, e la cartella in Mappe/ sembrava fuori dalle basi.
test('0061: R22. su Windows la cartella in Mappe si riconosce: classe e materia dal percorso con le barre rovesciate', async () => {
  const P = ID(28), dir = 'C:\\M\\4R\\Storia\\X';
  const h = rendererHarness({ mapsBaseDir: 'C:\\M',
    cassetto: cassetto([voce(P, 'X')], { [P]: fotografia('X') }),
    cartelle: [{ folderName: 'X', fullPath: dir, rootNodeLabel: 'X', classDir: '4R', discDir: 'Storia', projectId: P }],
    disco: { [dir]: datiVault('X', { projectId: P }) } });
  await h.window.directLoadVault(dir); h.sano();
  assert.equal(h.ctx.appState.activeVaultClassDir, '4R');
  assert.equal(h.ctx.appState.activeVaultDiscDir, 'Storia');
  assert.equal(h.id(), P);
  h.ctx._storage.saveCurrentProject();
  const v = h.voce(P);
  assert.deepEqual([v.vault, v.classDir, v.discDir], ['X', '4R', 'Storia'], 'la voce dichiara ancora 4R/Storia');
});

// R23: la mappa aperta prima ha la sua cartella; la voce riaperta dopo ha perso la sua.
test('0061: R23. una voce la cui cartella non c\'è più non eredita l\'idInCartella della mappa aperta prima', async () => {
  const A = ID(29), V = ID(30), dirA = '/M/4R/Storia/A', sparita = '/M/4R/Storia/Sparita';
  const h = rendererHarness({
    cassetto: cassetto([voce(A, 'A'), voce(V, 'Sparita')], { [A]: fotografia('A', { activeVaultPath: dirA }),
      [V]: fotografia('Sparita', { activeVaultPath: sparita, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' }) }),
    cartelle: [cartella(dirA, { projectId: A })], disco: { [dirA]: datiVault('A', { projectId: A }) } });
  await h.window.directLoadVault(dirA); h.sano();
  assert.equal(h.ctx._storage.idInCartella && h.ctx._storage.idInCartella.id, A, 'la mappa A è legata alla sua cartella');
  assert.equal(await h.ctx._storage.loadProject(V), false, 'la cartella di V non c\'è più: il caricamento fallisce');
  assert.deepEqual(h.allarmi, ['Errore Caricamento: Impossibile caricare il progetto: Cartella non trovata'], 'il fallimento è quello atteso');
  assert.equal(h.ctx._storage.idInCartella, null, 'non resta l\'idInCartella della mappa A');
  assert.equal(h.window.buildVaultMapData().projectId, undefined);
});
