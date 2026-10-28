'use strict';
/*
 * ponte-chiuso-0124.test.js — packet 0124, lotto 3 (ADR 0025).
 *
 * Il «ponte» del lotto 4 dello 0123 si chiude: gli sportelli di main.js accettano solo
 * le cartelle dentro le radici (e quelle scelte col dialogo in questa sessione, come la
 * cartella di «Importa vault»). Una cartella fuori con l'index.yaml dell'app NON passa
 * più; torna solo con `ponteFuori: true` in mappai-settings.json (interruttore, inv. 1).
 *
 * Giacomo, 24/10: «Un progetto portato fuori con il Finder sparisce dall'app.»; «Un
 * progetto spostato fuori da MappAI devo sparire dall'app.» Chi lo riprende dal cassetto
 * legge «Questo progetto non è più in «MappAI - file». Per riaverlo usa «Importa vault»
 * in CREA.» — la sessione resta com'era, la cartella fuori non si tocca.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const JS = f => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8');
const FUORI = 'fuori dalle cartelle dell\'app';
const AVVISO = 'Questo progetto non è più in «MappAI - file». Per riaverlo usa «Importa vault» in CREA.';

function pezzo(da, a) {
  const i = SRC.indexOf(da); assert.ok(i >= 0, 'main.js: ' + da);
  const j = SRC.indexOf(a, i); assert.ok(j > i, 'main.js: ' + a);
  return SRC.slice(i, j);
}
/* i confini veri di main.js in una vm: la casa ha «MappAI - file» e Documenti */
function confini(t, impostazioni) {
  const c = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0124-ponte-')));
  t.after(() => fs.rmSync(c, { recursive: true, force: true }));
  const ctx = vm.createContext({
    fs, path, process, crypto, console: { log() {}, warn() {}, error() {} },
    Confini: require(path.join(ROOT, 'public', 'js', 'mappai-confini-core.js')),
    FilesCore: require(path.join(ROOT, 'public', 'js', 'mappai-files-core.js')),
    mappaiRootDir: () => path.join(c, 'MappAI - file'), documentsDir: () => path.join(c, 'Documenti'),
    readSettings: () => impostazioni || {}
  });
  vm.runInContext(pezzo('/* ── I CONFINI DEL DISCO', 'const ReviewStore = require(') + ';this.ammessa = cartellaAmmessa; this.scelte = radiciScelte;', ctx);
  const vault = (dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.yaml'), 'projectId: proj_1790000000001\nrootNodeLabel: IL SALE\n'); return dir; };
  return { c, ctx, vault };
}

test('0124 L3: una cartella fuori dalle radici con l\'index.yaml dell\'app non passa più', t => {
  const { c, ctx, vault } = confini(t);
  const fuori = vault(path.join(c, 'Scrivania', 'IL SALE'));
  assert.equal(ctx.ammessa(fuori), false, 'il ponte è chiuso');
  const dentro = vault(path.join(c, 'MappAI - file', 'Classi', '4R', 'Storia', 'IL SALE'));
  assert.equal(ctx.ammessa(dentro), true, 'dentro le radici sì');
});

test('0124 L3: la cartella scelta col dialogo in questa sessione passa ancora (è la porta di «Importa vault»)', t => {
  const { c, ctx, vault } = confini(t);
  const fuori = vault(path.join(c, 'Scrivania', 'IL SALE'));
  ctx.scelte.add(path.join(c, 'Scrivania', 'IL SALE'));
  assert.equal(ctx.ammessa(fuori), true);
});

test('0124 L3: con ponteFuori: true in mappai-settings.json il ponte torna (interruttore)', t => {
  const { c, ctx, vault } = confini(t, { ponteFuori: true });
  const fuori = vault(path.join(c, 'Scrivania', 'IL SALE'));
  assert.equal(ctx.ammessa(fuori), true);
  fs.mkdirSync(path.join(c, 'Scrivania', 'senza-indice'), { recursive: true });
  assert.equal(ctx.ammessa(path.join(c, 'Scrivania', 'senza-indice')), false, 'senza index.yaml dell\'app mai');
});

test('0124 L3: load-vault e read-vault-file passano dal confine', () => {
  for (const n of ['load-vault', 'read-vault-file']) {
    const s = pezzo("ipcMain.handle('" + n + "',", '\n});');
    assert.match(s, /cartellaAmmessa\(/, n);
  }
});

/* ── «Riprendi»: StorageManager VERO, ritagliato come in riprendi-dopo-rinomina.test.js ── */
const ID = 'proj_1790000000011', FUORI_P = '/Scrivania/IL SALE';
function banco(o = {}) {
  const local = new Map(Object.entries(o.local || {})), aperte = [], letti = [], avvisi = [];
  const window = {
    t: (k, f) => f, showAlert: (a, b) => avvisi.push(a + ': ' + b), showLoadingOverlay() {}, showToast() {}, safeCreateIcons() {},
    switchToMapLayout() {}, setTutorState() {},
    MappAIModal: { avviso: (x) => { avvisi.push('avviso: ' + x.testo); return Promise.resolve(); } },
    MappAIFilesCore: require('../public/js/mappai-files-core.js'),
    MappAITeachCore: require('../public/js/mappai-teach-core.js'),
    MappAINomeCartellaCore: require('../public/js/mappai-nome-cartella-core.js'),
    MappAIReview: { restore: async () => {} },
    electronAPI: {
      loadVault: async p => { aperte.push(p); return { success: false, error: FUORI }; },
      readVaultFile: async x => { letti.push(x.vaultPath); return { ok: false, error: FUORI }; },
      getAllVaults: async () => [],
      filesRootGet: async () => ({ mapsBaseDir: '/M', rootDir: '/' })
    }
  };
  const stato = { db: { nodes: [{ id: 'x', label: 'La mappa di prima', level: 0 }], links: [] }, activeVaultPath: '/M/1A/Storia/Prima' };
  const ctx = vm.createContext({
    window, console: { log() {}, info() {}, warn() {}, error() {} }, document: { getElementById: () => null },
    appState: stato, simulation: null, atob, btoa, TextDecoder, TextEncoder,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k),
      get length() { return local.size; }, key: i => [...local.keys()][i] },
    setTimeout: () => 0, clearTimeout() {}, queueMicrotask, initD3Visualization() {}
  });
  window.self = ctx;
  vm.runInContext(JS('mappai-vault-manager.js'), ctx);   // l'aiutante vero dell'avviso (window.avvisaProgettoFuori)
  const src = JS('mappai-storage-lang.js'), da = src.indexOf('const StorageManager = {');
  vm.runInContext(src.slice(da, src.indexOf('\n};', da) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  ctx._storage.currentProjectId = 'proj_prima';
  return { ctx, S: ctx._storage, aperte, letti, avvisi, stato };
}
const nodi = { nodes: [{ id: 'r', label: 'IL SALE', level: 0 }], links: [] };
const fotografia = JSON.stringify({ rootNodeLabel: 'IL SALE', extractionMode: 'mindmap', activeVaultPath: FUORI_P, db: nodi });
const riga = JSON.stringify([{ id: ID, name: 'IL SALE', vault: 'IL SALE', type: 'mindmap', cartella: FUORI_P }]);

test('0124 L3 «Riprendi» di un progetto la cui cartella sta fuori: l\'avviso, nessuna apertura, la sessione di prima resta', async () => {
  const h = banco({ local: { tutor_ai_projects: riga, [ID]: fotografia } });
  const r = await h.S.loadProject(ID);
  assert.equal(r, false);
  assert.ok(h.avvisi.some(a => a.includes(AVVISO)), h.avvisi.join(' | '));
  assert.equal(h.avvisi.some(a => /Errore Caricamento/.test(a)), false, 'niente errore generico');
  assert.equal(h.ctx.appState, h.stato, 'lo stato non è stato sostituito');
  assert.equal(h.ctx.appState.activeVaultPath, '/M/1A/Storia/Prima');
  assert.equal(h.S.currentProjectId, 'proj_prima');
});

test('0124 L3: directLoadVault su una cartella fuori dice lo stesso avviso, non un errore', async () => {
  const avvisi = [];
  const window = {
    t: (k, f) => f, showAlert: (a, b) => avvisi.push(a + ': ' + b), showLoadingOverlay() {},
    MappAIModal: { avviso: (x) => { avvisi.push('avviso: ' + x.testo); return Promise.resolve(); } },
    electronAPI: { loadVault: async () => ({ success: false, error: FUORI }) }
  };
  const ctx = vm.createContext({ window, console: { log() {}, warn() {}, error() {} }, appState: { db: { nodes: [], links: [] } }, document: { getElementById: () => null } });
  vm.runInContext(JS('mappai-vault-manager.js'), ctx);
  await window.directLoadVault(FUORI_P);
  assert.deepEqual(avvisi, ['avviso: ' + AVVISO]);
});
