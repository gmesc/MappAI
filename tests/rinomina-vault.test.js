'use strict';
/* 0094 (ADR 0021) — «Rinomina…».
   Prima metà: `vault-rename` e la rete di `save-vault` VERI, estratti da main.js come in
   tests/usage-vault.test.js, su una cartella temporanea.
   Seconda metà: mappai-rinomina.js in una vm, con un electronAPI finto (sotto). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const FilesCore = require('../public/js/mappai-files-core.js');
const NomeCartellaCore = require('../public/js/mappai-nome-cartella-core.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function mainRinomina(base) {
  const handlers = {};
  const ctx = vm.createContext({ fs, path, console: { log() {}, warn() {}, error() {} }, FilesCore, NomeCartellaCore,
    ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
    mapsBaseDir: () => path.join(base, 'Mappe'), studentsBaseDir: () => path.join(base, 'Allievi') });
  const da = SRC.indexOf('const _cartelleRinominate = new Map();'); assert.ok(da >= 0);
  const a = SRC.indexOf("ipcMain.handle('vault-rename',"); assert.ok(a > da);
  const fine = SRC.indexOf('\n});', a) + 4;
  vm.runInContext(SRC.slice(da, fine).replace('const _cartelleRinominate', 'var _cartelleRinominate') +
    '\nthis._scritturaSuRinominata = _scritturaSuRinominata; this._scriviIdSeManca = _scriviIdSeManca;', ctx);
  return { rinomina: handlers['vault-rename'], guardia: ctx._scritturaSuRinominata, scriviId: ctx._scriviIdSeManca };
}
function casa(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0094-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const vault = (rel, yaml) => { const d = path.join(base, 'Mappe', rel); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.yaml'), yaml); return d; };
  return { base, vault };
}

test('vault-rename: rinomina nella stessa madre e scrive il projectId che manca', async t => {
  const h = casa(t), m = mainRinomina(h.base);
  const v = h.vault('4R/Scienze/Elettricità', 'extractionMode: mindmap\nrootNodeLabel: Elettricità\n');
  const r = await m.rinomina({}, { folderPath: v, nome: 'Circuiti: base?', projectId: 'proj_1790000000001' });
  assert.equal(r.success, true);
  assert.equal(r.folderName, FilesCore.vaultFolderName('Circuiti: base?'));
  assert.equal(r.suffisso, false);
  assert.equal(fs.existsSync(v), false);
  assert.equal(r.idScritto, true);
  const testo = fs.readFileSync(path.join(r.fullPath, 'index.yaml'), 'utf8');
  assert.equal(testo, 'projectId: proj_1790000000001\nextractionMode: mindmap\nrootNodeLabel: Elettricità\n');
});

test('vault-rename: nome già usato → « · 02» col segno; un id già scritto non si tocca', async t => {
  const h = casa(t), m = mainRinomina(h.base);
  h.vault('4R/Scienze/Circuiti', 'rootNodeLabel: Circuiti\n');
  const v = h.vault('4R/Scienze/Elettricità', 'projectId: proj_1790000000002\nrootNodeLabel: E\n');
  const r = await m.rinomina({}, { folderPath: v, nome: 'circuiti', projectId: 'proj_1790000000009' });
  assert.equal(r.success, true);
  assert.equal(r.folderName, 'circuiti · 02');
  assert.equal(r.suffisso, true);
  assert.equal(r.projectId, 'proj_1790000000002');
  assert.equal(r.idScritto, false);
  assert.ok(fs.readFileSync(path.join(r.fullPath, 'index.yaml'), 'utf8').startsWith('projectId: proj_1790000000002\n'));
});

test('vault-rename: solo maiuscole, stesso nome, nome vuoto, fuori dalle basi, senza index.yaml', async t => {
  const h = casa(t), m = mainRinomina(h.base);
  const v = h.vault('4R/Scienze/elettricità', 'rootNodeLabel: e\n');
  const r = await m.rinomina({}, { folderPath: v, nome: 'Elettricità' });
  assert.equal(r.success, true); assert.equal(r.suffisso, false);
  assert.ok(fs.readdirSync(path.join(h.base, 'Mappe', '4R', 'Scienze')).includes('Elettricità'));
  const s = await m.rinomina({}, { folderPath: r.fullPath, nome: 'Elettricità' });
  assert.equal(s.invariato, true);
  assert.equal((await m.rinomina({}, { folderPath: r.fullPath, nome: '   ' })).error, 'nome-vuoto');
  assert.equal((await m.rinomina({}, { folderPath: path.join(os.tmpdir()), nome: 'x' })).success, false);
  fs.mkdirSync(path.join(h.base, 'Mappe', '4R', 'Vuota'), { recursive: true });
  assert.equal((await m.rinomina({}, { folderPath: path.join(h.base, 'Mappe', '4R', 'Vuota'), nome: 'x' })).error, 'cartella-non-trovata');
});

test('vault-rename: «Generico» in cima a Mappe/ è riservato', async t => {
  const h = casa(t), m = mainRinomina(h.base);
  const v = h.vault('Vecchio', 'rootNodeLabel: v\n');
  const r = await m.rinomina({}, { folderPath: v, nome: 'Generico' });
  assert.equal(r.folderName, 'Generico · 02');
});

test('save-vault: la cartella appena rinominata non rinasce dallo stesso progetto; un progetto nuovo sì', async t => {
  const h = casa(t), m = mainRinomina(h.base);
  const v = h.vault('4R/Storia/Svizzera', 'projectId: proj_1790000000003\n');
  await m.rinomina({}, { folderPath: v, nome: 'Svizzera 2a GM', projectId: 'proj_1790000000003' });
  assert.equal(m.guardia(v, { projectId: 'proj_1790000000003' }), true);
  assert.equal(m.guardia(v, {}), true, 'senza id: è comunque una scrittura sulla cartella che non c\'è più');
  assert.equal(m.guardia(v, { projectId: 'proj_1790000000099' }), false, 'un progetto nuovo con quel nome');
  assert.equal(m.guardia(path.join(h.base, 'Mappe', '4R', 'Storia', 'Svizzera 2a GM'), { projectId: 'proj_1790000000003' }), false, 'la cartella nuova esiste');
  assert.equal(SRC.includes("_scritturaSuRinominata(folderPath, mapData)) return { success: false, error: 'cartella-rinominata' };"), true);
});

/* ── mappai-rinomina.js in una vm ─────────────────────────────────────────────── */
const RIN = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-rinomina.js'), 'utf8');
const VECCHIO = '/r/MappAI - file/Mappe/4R/Scienze/Elettricità', NUOVO = '/r/MappAI - file/Mappe/4R/Scienze/Circuiti';
function renderer(opz = {}) {
  const local = new Map(Object.entries(opz.local || {}));
  const toasts = [], segnali = [], scritti = [], chiamate = [];
  const disco = new Map(Object.entries(opz.disco || {}));
  const g = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, TextDecoder, Uint8Array, atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) },
    addEventListener() {}, innerWidth: 1400, innerHeight: 900,
    showToast: (m, t) => toasts.push([t, m]),
    MappAINomeCartellaCore: NomeCartellaCore, MappAIFilesCore: FilesCore,
    MappAIVaults: { segnala: (m, d) => segnali.push([m, d]) },
    MappAIModal: { open: async () => ({ azione: opz.azione || 'si', valori: { nome: opz.nome == null ? 'Circuiti' : opz.nome } }) },
    electronAPI: {
      async vaultRename(d) { chiamate.push(d); return opz.rename || { success: true, fullPath: NUOVO, folderName: 'Circuiti', suffisso: false, projectId: 'proj_1790000000005' }; },
      async readVaultFile({ vaultPath, relPath }) {
        const t = disco.get(vaultPath + '/' + relPath);
        return t == null ? { ok: false, error: 'file non trovato: ' + relPath } : { ok: true, base64: Buffer.from(t).toString('base64') };
      },
      async saveVaultFile(d) { scritti.push(d); disco.set(d.vaultPath + '/' + d.relPath, d.text); return { ok: true, version: (d.expectedVersion || 0) + 1 }; }
    }
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext('var appState = ' + JSON.stringify(opz.appState || { activeVaultPath: '/altro', extractionMode: 'mindmap' }) + ';' +
    'var StorageManager = ' + JSON.stringify(opz.sm || { currentProjectId: 'proj_altro', idInCartella: null }) + ';', g);
  vm.runInContext(RIN, g);
  return { g, local, toasts, segnali, scritti, chiamate, disco, st: () => vm.runInContext('appState', g), sm: () => vm.runInContext('StorageManager', g) };
}
const pipelineDi = p => JSON.stringify({ _storageVersion: 7, vaultPath: p, review: { projectId: 'proj_1790000000005', vaultPath: p, final: { review: { vaultPath: p } } } });

test('rinomina (renderer): progetto non aperto → riga, fotografia, padronanza e pipeline.json col percorso nuovo; il titolo resta', async () => {
  const h = renderer({
    local: { tutor_ai_projects: JSON.stringify([{ id: 'proj_1790000000005', name: 'Elettricità e circuiti', vault: 'Elettricità', classDir: '4R', discDir: 'Scienze' }]),
      proj_1790000000005: JSON.stringify({ activeVaultPath: VECCHIO, rootNodeLabel: 'Elettricità e circuiti' }),
      ['mappai_mastery::' + VECCHIO]: '{"n1":{"ok":3}}' },
    disco: { [NUOVO + '/pipeline.json']: pipelineDi(VECCHIO) }
  });
  const r = await h.g.MappAIRinomina.apri({ vaultPath: VECCHIO, nome: 'Elettricità', titolo: 'Elettricità e circuiti', idRiga: 'proj_1790000000005' });
  assert.equal(r.success, true);
  assert.equal(h.chiamate[0].projectId, 'proj_1790000000005', 'l\'id della riga va a main.js (S8)');
  const riga = JSON.parse(h.local.get('tutor_ai_projects'))[0];
  assert.equal(riga.vault, 'Circuiti'); assert.equal(riga.name, 'Elettricità e circuiti');
  assert.equal(JSON.parse(h.local.get('proj_1790000000005')).activeVaultPath, NUOVO);
  assert.equal(h.local.get('mappai_mastery::' + NUOVO), '{"n1":{"ok":3}}');
  assert.equal(h.local.has('mappai_mastery::' + VECCHIO), false);
  assert.equal(h.scritti.length, 1); assert.equal(h.scritti[0].expectedVersion, 7);
  const m = JSON.parse(h.disco.get(NUOVO + '/pipeline.json'));
  assert.equal(m.vaultPath, NUOVO); assert.equal(m.review.final.review.vaultPath, NUOVO);
  assert.deepEqual(h.toasts.at(-1), ['success', 'Rinominato: «Circuiti».']);
  assert.equal(h.segnali[0][0], 'cartella-rinominata');
});

test('rinomina (renderer): la mappa aperta cambia percorso subito, idInCartella e manifesto in memoria seguono', async () => {
  const h = renderer({
    appState: { activeVaultPath: VECCHIO, extractionMode: 'mindmap', _pipelineManifest: JSON.parse(pipelineDi(VECCHIO)) },
    sm: { currentProjectId: 'proj_1790000000005', idInCartella: { percorso: VECCHIO, id: 'proj_1790000000005', posizione: { classDir: '4R', discDir: 'Scienze' } } },
    local: { tutor_ai_projects: JSON.stringify([{ id: 'proj_1790000000005', name: 'E', vault: 'Elettricità' }]) },
    disco: { [NUOVO + '/pipeline.json']: pipelineDi(VECCHIO) }
  });
  await h.g.MappAIRinomina.apri({ vaultPath: VECCHIO, nome: 'Elettricità' });
  assert.equal(h.st().activeVaultPath, NUOVO);
  assert.equal(h.sm().idInCartella.percorso, NUOVO);
  assert.equal(h.sm().idInCartella.id, 'proj_1790000000005');
  assert.equal(h.st()._pipelineManifest.review.vaultPath, NUOVO);
  assert.equal(h.st()._pipelineManifest._storageVersion, 8, 'la versione in memoria è quella scritta');
  assert.equal(JSON.parse(h.local.get('tutor_ai_projects'))[0].vault, 'Circuiti', 'la riga dice il nome nuovo prima di qualunque salvataggio');
});

test('rinomina (renderer): lettura aperta rifiutata; nome vuoto rifiutato; suffisso → l\'avviso di Giacomo; interruttore spento → niente', async () => {
  const lett = renderer({ appState: { activeVaultPath: VECCHIO, extractionMode: 'lettura' } });
  assert.equal(await lett.g.MappAIRinomina.apri({ vaultPath: VECCHIO }), false);
  assert.match(lett.toasts[0][1], /percorso di lettura è aperto/);
  assert.equal(lett.chiamate.length, 0);
  const vuoto = renderer({ nome: '   ' });
  assert.equal(await vuoto.g.MappAIRinomina.apri({ vaultPath: VECCHIO }), false);
  assert.equal(vuoto.chiamate.length, 0);
  const suf = renderer({ rename: { success: true, fullPath: NUOVO + ' · 02', folderName: 'Circuiti · 02', suffisso: true } });
  await suf.g.MappAIRinomina.apri({ vaultPath: VECCHIO });
  assert.deepEqual(suf.toasts.at(-1), ['info', 'Questo nome esiste già, potrai modificarlo in seguito o tenere la numerazione automatica.']);
  const off = renderer({ local: { mappai_nome_da_cartella: '0' } });
  assert.equal(await off.g.MappAIRinomina.apri({ vaultPath: VECCHIO }), false);
  assert.equal(off.chiamate.length, 0);
});

test('rinomina (renderer): il modale si apre con la proposta del titolo per un nome provvisorio', async () => {
  const h = renderer({ azione: 'no' });
  let schema = null;
  h.g.MappAIModal.open = async s => { schema = s; return { azione: 'no' }; };
  await h.g.MappAIRinomina.apri({ vaultPath: '/m/Lettura-proj_1790000000000', nome: 'Lettura-proj_1790000000000', titolo: 'Il lupo e l\'agnello' });
  assert.equal(schema.sezioni[0].campi[0].valore, 'Il lupo e l\'agnello');
});

test('riparaPipeline: senza pipeline.json niente da fare; con vecchio null ripara quello che il manifesto dichiara (0095)', async () => {
  const h = renderer({ disco: { [NUOVO + '/pipeline.json']: pipelineDi('/Users/collega/Mappe/X') } });
  const r = await h.g.MappAIRinomina.riparaPipeline(NUOVO, null);
  assert.equal(r.ok, true); assert.equal(r.cambiati, 3); assert.equal(r.version, 8);
  const v = await h.g.MappAIRinomina.riparaPipeline('/vuota', null);
  assert.deepEqual(JSON.parse(JSON.stringify(v)), { ok: true, cambiati: 0 });
});

test('finestra in primo piano: dopo almeno 1 s fuori un segnale sul bus; prima di 1 s no; spento no', () => {
  for (const [fuori, spento, atteso] of [[1500, false, 1], [400, false, 0], [1500, true, 0]]) {
    const ascolta = {}, segnali = [];
    let ora = 1000000;
    const g = { console, Date: { now: () => ora }, localStorage: { getItem: k => (spento && k === 'mappai_nome_da_cartella' ? '0' : null) },
      addEventListener: (n, f) => { ascolta[n] = f; }, MappAINomeCartellaCore: NomeCartellaCore,
      MappAIVaults: { segnala: m => segnali.push(m) } };
    g.window = g;
    vm.createContext(g);
    vm.runInContext(RIN, g);
    ascolta.blur(); ora += fuori; ascolta.focus();
    assert.equal(segnali.filter(m => m === 'finestra-in-primo-piano').length, atteso, fuori + ' ms' + (spento ? ' spento' : ''));
  }
});
