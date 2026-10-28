'use strict';
/*
 * riassegna-copia-ipc.test.js — packet 0124, lotto 2 (ADR 0025): gli sportelli VERI di
 * main.js, ritagliati dal testo ed eseguiti su cartelle temporanee.
 *
 *   · `vault-relocate` sposta anche verso un allievo (`Allievi/<allievo>/<materia>`) e
 *     da un allievo; con `dichiara` fa dire a index.yaml la classe e la materia nuove
 *     (il resto byte per byte); registra la cartella vecchia fra quelle che un
 *     salvataggio in ritardo non deve far rinascere; la chiamata di prima
 *     ({ classDir, discDir }) resta com'era;
 *   · `vault-copy` copia un progetto DENTRO «MappAI - file» in un'altra destinazione:
 *     id nuovo in ogni file, classe e materia della destinazione, sorgente intatta,
 *     « · 02» se il nome c'è già; rifiuta una sorgente fuori e un percorso furbo.
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
const FilesCore = require(path.join(ROOT, 'public', 'js', 'mappai-files-core.js'));
const NomeCartellaCore = require(path.join(ROOT, 'public', 'js', 'mappai-nome-cartella-core.js'));
const Confini = require(path.join(ROOT, 'public', 'js', 'mappai-confini-core.js'));
const RiassegnaCopiaCore = require(path.join(ROOT, 'public', 'js', 'mappai-riassegna-copia-core.js'));

function pezzo(da, a) {
  const i = SRC.indexOf(da); assert.ok(i >= 0, 'main.js: ' + da);
  const j = SRC.indexOf(a, i); assert.ok(j > i, 'main.js: ' + a);
  return SRC.slice(i, j);
}
const sportello = (n) => pezzo("ipcMain.handle('" + n + "',", '\n});') + '\n});\n';

function casa(t) {
  const c = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0124-rc-')));
  t.after(() => fs.rmSync(c, { recursive: true, force: true }));
  return c;
}
const ID = 'proj_1790000000001';
function vault(dir, extra) {
  fs.mkdirSync(path.join(dir, 'Nodi'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.yaml'), 'projectId: ' + ID + '\nextractionMode: mindmap\nrootNodeLabel: IL SALE\nclasse: 4R\nmateria: Storia\n');
  fs.writeFileSync(path.join(dir, 'Nodi', 'n1.md'), '---\nid: n1\nlabel: Sale\n---\n');
  fs.writeFileSync(path.join(dir, 'pipeline.json'), JSON.stringify({ vaultPath: dir, projectId: ID, review: { vaultPath: dir, projectId: ID } }, null, 2));
  Object.entries(extra || {}).forEach(([k, v]) => { fs.mkdirSync(path.dirname(path.join(dir, k)), { recursive: true }); fs.writeFileSync(path.join(dir, k), v); });
}
function impronta(dir) {
  const out = {};
  (function giro(d, rel) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { out[r + '/'] = 'dir'; giro(p, r); }
      else out[r] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
    });
  })(dir, '');
  return out;
}

/* vault-relocate nella vm, coi confini veri e le basi della casa */
function relocate(c) {
  const handlers = {};
  const rinominate = new Map();
  const ctx = vm.createContext({
    fs, path, Buffer, JSON, crypto, process, Confini, FilesCore, NomeCartellaCore, RiassegnaCopiaCore,
    yaml: require('js-yaml'), console: { log() {}, warn() {}, error() {} },
    ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
    app: { getPath: () => path.join(c, 'userData') },
    mappaiRootDir: () => path.join(c, 'MappAI - file'), documentsDir: () => path.join(c, 'Documenti'),
    mapsBaseDir: () => path.join(c, 'MappAI - file', 'Classi'),
    studentsBaseDir: () => path.join(c, 'MappAI - file', 'Allievi'),
    _cartelleRinominate: rinominate
  });
  vm.runInContext(pezzo('/* ── I CONFINI DEL DISCO', 'const ReviewStore = require(') + sportello('vault-relocate'), ctx);
  return { h: handlers['vault-relocate'], rinominate };
}

test('0124 L2 vault-relocate: da una classe a un allievo, con index.yaml che dice classe e materia nuove', async t => {
  const c = casa(t);
  const da = path.join(c, 'MappAI - file', 'Classi', '4R', 'Storia', 'IL SALE');
  vault(da);
  const { h, rinominate } = relocate(c);
  const r = await h({}, { folderPath: da, base: 'students', parti: ['Marco', 'Storia'], dichiara: { classe: '', materia: 'Storia' }, projectId: ID });
  const a = path.join(c, 'MappAI - file', 'Allievi', 'Marco', 'Storia', 'IL SALE');
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.fullPath, a);
  assert.equal(fs.existsSync(da), false, 'la cartella vecchia non c\'è più');
  assert.equal(fs.readFileSync(path.join(a, 'index.yaml'), 'utf8'),
    'projectId: ' + ID + '\nextractionMode: mindmap\nrootNodeLabel: IL SALE\nclasse: ""\nmateria: Storia\n');
  assert.equal(fs.readFileSync(path.join(a, 'Nodi', 'n1.md'), 'utf8'), '---\nid: n1\nlabel: Sale\n---\n', 'i nodi si spostano interi');
  assert.equal(fs.existsSync(path.join(c, 'MappAI - file', 'Classi', '4R')), false, 'i contenitori rimasti vuoti si tolgono');
  const reg = rinominate.get(path.resolve(da));
  assert.ok(reg && reg.ids.includes(ID), 'la cartella vecchia è fra quelle che un salvataggio in ritardo non fa rinascere');
});

test('0124 L2 vault-relocate: da un allievo a una classe; un nome che c\'è già prende « · 02»', async t => {
  const c = casa(t);
  const da = path.join(c, 'MappAI - file', 'Allievi', 'Marco', 'Storia', 'IL SALE');
  vault(da);
  fs.mkdirSync(path.join(c, 'MappAI - file', 'Classi', '3B', 'Geografia', 'IL SALE'), { recursive: true });
  const { h } = relocate(c);
  const r = await h({}, { folderPath: da, base: 'maps', parti: ['3B', 'Geografia'], dichiara: { classe: '3B', materia: 'Geografia' } });
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.folderName, 'IL SALE · 02');
  assert.match(fs.readFileSync(path.join(r.fullPath, 'index.yaml'), 'utf8'), /^classe: 3B\nmateria: Geografia\n$/m);
});

test('0124 L2 vault-relocate: un percorso furbo o una cartella fuori dalle basi non si spostano', async t => {
  const c = casa(t);
  const da = path.join(c, 'MappAI - file', 'Classi', '4R', 'Storia', 'IL SALE');
  vault(da);
  const prima = impronta(da);
  const { h } = relocate(c);
  for (const parti of [['..', 'Storia'], ['4R', '../../x'], [], ['4R', '']]) {
    const r = await h({}, { folderPath: da, base: 'maps', parti });
    assert.equal(r.success, false, JSON.stringify(parti));
  }
  assert.deepEqual(impronta(da), prima, 'niente si è mosso');
  const fuori = path.join(c, 'Scrivania', 'IL SALE');
  vault(fuori);
  const r = await h({}, { folderPath: fuori, base: 'maps', parti: ['3B', 'Storia'] });
  assert.equal(r.success, false);
  assert.ok(fs.existsSync(path.join(fuori, 'index.yaml')));
});

test('0124 L2 vault-relocate: la chiamata di prima ({ classDir, discDir }) resta com\'era e non tocca index.yaml', async t => {
  const c = casa(t);
  const da = path.join(c, 'MappAI - file', 'Classi', '4R', 'Storia', 'IL SALE');
  vault(da);
  const indice = fs.readFileSync(path.join(da, 'index.yaml'), 'utf8');
  const { h } = relocate(c);
  const r = await h({}, { folderPath: da, classDir: '4S', discDir: 'Storia' });
  assert.equal(r.success, true);
  assert.equal(r.fullPath, path.join(c, 'MappAI - file', 'Classi', '4S', 'Storia', 'IL SALE'));
  assert.equal(fs.readFileSync(path.join(r.fullPath, 'index.yaml'), 'utf8'), indice);
});

/* vault-copy: le funzioni dell'import e della copia, ritagliate come in import-vault-ipc.test.js */
function copia() {
  const a = SRC.indexOf('function importaDentroDi(');
  const b = SRC.indexOf("ipcMain.handle('import-vault-info'");
  assert.ok(a > 0 && b > a);
  const ctx = vm.createContext({
    fs, path, FilesCore, NomeCartellaCore, RiassegnaCopiaCore, yaml: require('js-yaml'), console,
    require: (p) => require(p.startsWith('./') ? path.join(ROOT, p) : p)
  });
  vm.runInContext(SRC.slice(a, b) + ';this.copia = copiaVaultInterna;', ctx);
  return ctx.copia;
}
const ID_NUOVO = 'proj_1790000000099';
const piatto = (x) => JSON.parse(JSON.stringify(x));   // un oggetto nato nella vm ha un altro prototipo

test('0124 L2 vault-copy: copia dentro «MappAI - file», id nuovo dappertutto, classe e materia della destinazione, sorgente intatta', async t => {
  const c = casa(t);
  const dove = { maps: path.join(c, 'MappAI - file', 'Classi'), students: path.join(c, 'MappAI - file', 'Allievi') };
  const da = path.join(dove.maps, '4R', 'Storia', 'IL SALE');
  vault(da, { 'Materiale Studio/quiz.html': '<p>' + ID + '</p>' });
  const prima = impronta(da);
  const r = await copia()({ src: da, base: 'maps', parti: ['3B', 'Geografia'], nome: 'IL SALE', projectId: ID_NUOVO, dichiara: { classe: '3B', materia: 'Geografia' } }, dove);
  const a = path.join(dove.maps, '3B', 'Geografia', 'IL SALE');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.folderPath, a);
  assert.deepEqual(impronta(da), prima, 'la sorgente byte per byte');
  const indice = fs.readFileSync(path.join(a, 'index.yaml'), 'utf8');
  assert.match(indice, /^projectId: proj_1790000000099$/m);
  assert.match(indice, /^classe: 3B$/m);
  assert.match(indice, /^materia: Geografia$/m);
  const man = JSON.parse(fs.readFileSync(path.join(a, 'pipeline.json'), 'utf8'));
  assert.equal(man.vaultPath, a);
  assert.equal(man.review.vaultPath, a);
  assert.equal(man.review.projectId, ID_NUOVO);
  assert.equal(fs.readFileSync(path.join(a, 'Materiale Studio', 'quiz.html'), 'utf8'), '<p>' + ID_NUOVO + '</p>');
});

test('0124 L2 vault-copy: verso un allievo; un nome che c\'è già prende « · 02»', async t => {
  const c = casa(t);
  const dove = { maps: path.join(c, 'MappAI - file', 'Classi'), students: path.join(c, 'MappAI - file', 'Allievi') };
  const da = path.join(dove.maps, '4R', 'Storia', 'IL SALE');
  vault(da);
  fs.mkdirSync(path.join(dove.students, 'Marco', 'Storia', 'IL SALE'), { recursive: true });
  const scheda = { nickname: 'Marco', age: '13', grade: '3', system: 'Ticino' };
  const r = await copia()({ src: da, base: 'students', parti: ['Marco', 'Storia'], nome: 'IL SALE', projectId: ID_NUOVO, dichiara: { classe: '', materia: 'Storia', userProfile: scheda } }, dove);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.folderPath, path.join(dove.students, 'Marco', 'Storia', 'IL SALE · 02'));
  assert.equal(r.suffisso, true);
  const letto = require('js-yaml').load(fs.readFileSync(path.join(r.folderPath, 'index.yaml'), 'utf8'));
  assert.deepEqual(letto.userProfile, scheda, 'la copia porta la scheda dell\'allievo (Giacomo, 24/10)');
  assert.equal(letto.materia, 'Storia');
});

test('0124 L2 vault-copy: rifiuta una sorgente fuori, un percorso furbo, un id fuori forma', async t => {
  const c = casa(t);
  const dove = { maps: path.join(c, 'MappAI - file', 'Classi'), students: path.join(c, 'MappAI - file', 'Allievi') };
  const fuori = path.join(c, 'Scrivania', 'IL SALE');
  vault(fuori);
  const cp = copia();
  assert.deepEqual(piatto(await cp({ src: fuori, base: 'maps', parti: ['3B', 'Storia'], nome: 'IL SALE', projectId: ID_NUOVO }, dove)), { ok: false, error: 'fuori' });
  const da = path.join(dove.maps, '4R', 'Storia', 'IL SALE');
  vault(da);
  assert.deepEqual(piatto(await cp({ src: da, base: 'maps', parti: ['..', 'x'], nome: 'IL SALE', projectId: ID_NUOVO }, dove)), { ok: false, error: 'destinazione' });
  assert.deepEqual(piatto(await cp({ src: da, base: 'maps', parti: ['3B', 'Storia'], nome: 'IL SALE', projectId: 'x' }, dove)), { ok: false, error: 'id' });
  assert.equal(fs.existsSync(path.join(dove.maps, '3B')), false, 'nessuna cartella nata');
});

test('0124 L2: lo sportello vault-copy è registrato in main.js ed esposto dal preload', () => {
  assert.match(SRC, /ipcMain\.handle\('vault-copy',/);
  const pre = fs.readFileSync(path.join(ROOT, 'public', 'js', 'preload.js'), 'utf8');
  assert.match(pre, /vaultCopy: \(data\) => ipcRenderer\.invoke\('vault-copy', data\)/);
});
