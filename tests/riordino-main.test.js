'use strict';
/* 0104 (ADR 0023) — la riorganizzazione VERA di «MappAI - file», estratta da main.js
   (basi, walkMappe/walkAllievi/get-all-vaults, il blocco della riorganizzazione,
   class-doc-save e student-folder-ensure) ed eseguita su una casa temporanea con una
   copia ridotta del «MappAI - file» di Giacomo al 16/10. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

const FilesCore = require('../public/js/mappai-files-core.js');
const NomeCartellaCore = require('../public/js/mappai-nome-cartella-core.js');
const RiordinoCore = require('../public/js/mappai-riordino-core.js');
const ReviewStore = require('../public/js/mappai-review-store.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function pezzo(da, a) {
  const i = SRC.indexOf(da); assert.ok(i >= 0, da);
  const j = SRC.indexOf(a, i); assert.ok(j > i, a);
  return SRC.slice(i, j);
}

/* main.js in una vm: impostazioni in memoria, documenti nella casa. */
function mainIn(casa, impostazioni) {
  const handlers = {};
  const ctx = vm.createContext({
    fs, path, yaml, FilesCore, NomeCartellaCore, RiordinoCore, ReviewStore, Buffer, Date, JSON, Set, Object, Array, String,
    console: { log() {}, warn() {}, error() {} },
    ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
    shell: { openPath: async () => '' },
    _imp: impostazioni
  });
  vm.runInContext(`
    function readSettings() { return Object.assign({}, _imp); }
    function writeSettings(p) { Object.assign(_imp, p || {}); return readSettings(); }
    function documentsDir() { return ${JSON.stringify(casa)}; }
    function filesOrganized() { const s = readSettings(); return s.filesOrganized === true && !!s.filesRoot; }
    function mappaiRootDir() { return path.join(readSettings().filesRoot || documentsDir(), FilesCore.ROOT_FOLDER); }
    function subDir(kind) { return path.join(mappaiRootDir(), FilesCore.SUB[kind]); }
  ` + pezzo('function strutturaAccesa()', '\n// Cartella di UNA sessione di studio')
    + pezzo("ipcMain.handle('class-doc-save',", '// class-doc-open:')
    + pezzo('/* Cammina Mappe/ e restituisce', '// Restituisce l\'elenco di cartelle vault')
    + pezzo('// 0104 (ADR 0023) — LA RIORGANIZZAZIONE', '// Apre la cartella madre')
    + '\nthis.api = { riorganizzaStruttura, tornaIndietroStruttura, leggiRegistroRiordino, mapsBaseDir, activityBaseDir, usageBaseDir: typeof usageBaseDir === "function" ? usageBaseDir : null, strutturaV2 };', ctx);
  return Object.assign({ handlers }, ctx.api);
}

const PID = 'proj_1790000000001';
function scrivi(file, testo) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, testo); }
function vault(dir, titolo, extra) { scrivi(path.join(dir, 'index.yaml'), (extra || '') + 'extractionMode: mindmap\nrootNodeLabel: ' + titolo + '\n'); scrivi(path.join(dir, 'Nodi', 'n1.md'), '# ' + titolo + '\n'); }

/* Il «MappAI - file» di Giacomo, ridotto. */
function casaDiGiacomo(t) {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0104-'));
  t.after(() => fs.rmSync(casa, { recursive: true, force: true }));
  const R = path.join(casa, 'MappAI - file');
  const el = path.join(R, 'Mappe', '4R', 'Scienze', 'Elettricità');
  vault(el, 'Elettricità', 'projectId: ' + PID + '\n');
  scrivi(path.join(el, 'pipeline.json'), JSON.stringify({ vaultPath: el, review: null, modelliGiro: { chiamate: [{ vaultPath: el }] }, _storageVersion: 3 }, null, 2));
  vault(path.join(R, 'Mappe', '4R', 'Il Nazismo'), 'Il Nazismo', 'materia: Storia\n');
  vault(path.join(R, 'Mappe', 'Generico', 'Il Sale'), 'Il Sale', 'materia: "Scienze"\n');
  vault(path.join(R, 'Mappe', 'Svizzera'), 'Svizzera');
  fs.mkdirSync(path.join(R, 'Mappe', '1A', 'Italiano'), { recursive: true });   // vuota
  scrivi(path.join(R, 'Mappe', 'mm_1a_guerra_mondiale.json'), '{"rootNodeLabel":"1a guerra"}');
  scrivi(path.join(R, 'Mappe', 'Chat', 'chat.md'), 'chat');
  scrivi(path.join(R, 'Mappe', 'altro.txt'), 'sconosciuto');
  scrivi(path.join(R, 'Classi', 'classi.json'), '[{"name":"4R"}]');
  scrivi(path.join(R, 'Classi', '4R', 'credenziali-4R.pdf'), '%PDF-4R');
  scrivi(path.join(R, 'Classi', '1A', 'credenziali-1A.pdf'), '%PDF-1A');
  vault(path.join(R, 'Allievi', 'Marco', 'Mappe', 'Frazioni'), 'Frazioni', 'projectId: proj_1790000000002\nmateria: Matematica\n');
  scrivi(path.join(R, 'Allievi', 'Marco', 'credenziali-Marco.pdf'), '%PDF-Marco');
  fs.mkdirSync(path.join(R, 'Allievi', 'Anna', 'Mappe'), { recursive: true });   // allieva senza progetti
  scrivi(path.join(R, 'Attività di studio', 'materiali-mappa-15-10-2026', 'vault.json'), JSON.stringify({ nome: 'Elettricità', dir: el, classe: '4R' }, null, 2));
  scrivi(path.join(R, 'Attività di studio', '4R', '2026-08-18 · Quiz · Elettricità · 00', 'session.json'), '{}');
  scrivi(path.join(R, 'Diagnostica', 'errori.jsonl'), '{}\n');
  scrivi(path.join(R, 'Registro consumi AI', 'consumi-ai.jsonl'), '{}\n');
  scrivi(path.join(R, 'Archivio', 'Mappe fino al 28-09-2026', 'LEGGIMI.md'), 'archivio');
  scrivi(path.join(R, 'Analisi', 'Rapporti', 'r.md'), 'rapporto');
  scrivi(path.join(R, 'ESEMPI', 'e.txt'), 'esempio');
  scrivi(path.join(R, 'APERTUS prova.log'), 'log');
  fs.mkdirSync(path.join(R, 'Giardini'));
  return { casa, R, el, imp: { filesOrganized: true, filesRoot: casa } };
}
const c = (R, ...seg) => path.join(R, ...seg);
const J = x => JSON.parse(JSON.stringify(x));   // gli oggetti nati nella vm hanno un altro prototipo
const c_ = (R, ...seg) => fs.existsSync(c(R, ...seg));

/* impronte di tutti i file: percorso relativo → sha1 (pipeline.json senza la versione) */
function impronte(dir, base) {
  base = base || dir;
  const out = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, impronte(p, base));
    else {
      let testo = fs.readFileSync(p);
      if (e.name === 'pipeline.json') { const m = JSON.parse(testo); delete m._storageVersion; testo = JSON.stringify(m); }
      out[path.relative(base, p)] = crypto.createHash('sha1').update(testo).digest('hex');
    }
  }
  return out;
}

test('riorganizza: la struttura nuova, il registro, struttura 2', t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  const esito = m.riorganizzaStruttura();
  assert.ok(esito.giro.fatti.length > 0);
  assert.equal(h.imp.struttura, 2);
  // progetti
  assert.ok(c_(R, 'Classi', '4R', 'Scienze', 'Elettricità', 'index.yaml'));
  assert.ok(c_(R, 'Classi', '4R', 'Il Nazismo', 'index.yaml'));
  assert.ok(c_(R, 'Classi', 'Senza classe', 'Scienze', 'Il Sale', 'index.yaml'));
  assert.ok(c_(R, 'Classi', 'Senza classe', 'Svizzera', 'index.yaml'));
  assert.ok(c_(R, 'Allievi', 'Marco', 'Matematica', 'Frazioni', 'index.yaml'));
  // credenziali, classi.json, sistema
  for (const f of ['credenziali-4R.pdf', 'credenziali-1A.pdf', 'credenziali-Marco.pdf']) assert.ok(c_(R, 'Classi', 'Credenziali', f), f);
  assert.ok(c_(R, 'Sistema', 'classi.json'));
  for (const n of ['Diagnostica', 'Registro consumi AI', 'Attività di studio', 'Archivio', 'Chat']) assert.ok(c_(R, 'Sistema', n), n);
  assert.ok(c_(R, 'Sistema', 'Copie delle mappe', 'mm_1a_guerra_mondiale.json'));
  // vuote tolte, cartella dell'allievo tenuta
  assert.ok(!c_(R, 'Giardini'));
  assert.ok(!c_(R, 'Classi', '1A'), 'la classe senza progetti, rimasta vuota, se ne va');
  assert.ok(!c_(R, 'Allievi', 'Marco', 'Mappe'));
  assert.ok(!c_(R, 'Allievi', 'Anna', 'Mappe'));
  assert.ok(c_(R, 'Allievi', 'Anna'), 'la cartella dell\'allieva resta');
  // sconosciuti non toccati; Mappe resta solo per il file che l'app non conosce
  for (const n of ['Analisi', 'ESEMPI', 'APERTUS prova.log']) assert.ok(c_(R, n), n);
  assert.ok(c_(R, 'Mappe', 'altro.txt'));
  assert.deepEqual(fs.readdirSync(c(R, 'Mappe')).sort(), ['altro.txt']);
  // registro
  const reg = m.leggiRegistroRiordino(R);
  assert.ok(c_(R, 'Sistema', 'Diagnostica', 'riorganizzazione-beta8.json'));
  assert.equal(reg.giri.length, 1);
  assert.equal(reg.giri[0].verso, 'avanti');
  assert.ok(reg.giri[0].fatti.some(s => s.projectId === PID));
  assert.ok(reg.giri[0].intatti.some(x => x.join('/') === 'Analisi'));
  // le basi seguono
  assert.equal(m.mapsBaseDir(), c(R, 'Classi'));
  assert.equal(m.activityBaseDir(), c(R, 'Sistema', 'Attività di studio'));
});

test('riferimenti su disco: pipeline.json e vault.json seguono il progetto', t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  m.riorganizzaStruttura();
  const nuovo = c(R, 'Classi', '4R', 'Scienze', 'Elettricità');
  const pj = JSON.parse(fs.readFileSync(path.join(nuovo, 'pipeline.json'), 'utf8'));
  assert.equal(pj.vaultPath, nuovo);
  assert.equal(pj.modelliGiro.chiamate[0].vaultPath, nuovo);
  assert.equal(pj._storageVersion, 4);
  const vj = JSON.parse(fs.readFileSync(c(R, 'Sistema', 'Attività di studio', 'materiali-mappa-15-10-2026', 'vault.json'), 'utf8'));
  assert.equal(vj.dir, nuovo);
});

test('pipeline.json che porta in cima un percorso di un\'altra cartella (copiata a mano): segue anche quello, come nello 0095', t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  const altrove = '/Users/altro/Documents/MappAI - file/Mappe/4R/Scienze/Elettricità';
  fs.writeFileSync(path.join(h.el, 'pipeline.json'), JSON.stringify({ vaultPath: altrove, review: null, modelliGiro: { chiamate: [{ vaultPath: altrove }] }, _storageVersion: 3 }, null, 2));
  m.riorganizzaStruttura();
  const nuovo = c(R, 'Classi', '4R', 'Scienze', 'Elettricità');
  const pj = JSON.parse(fs.readFileSync(path.join(nuovo, 'pipeline.json'), 'utf8'));
  assert.equal(pj.vaultPath, nuovo);
  assert.equal(pj.modelliGiro.chiamate[0].vaultPath, nuovo);
});

test('una volta sola: il secondo avvio non sposta niente e non scrive un giro', t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  m.riorganizzaStruttura();
  const prima = impronte(R);
  assert.deepEqual(J(m.riorganizzaStruttura()), { giro: null });
  assert.deepEqual(impronte(R), prima);
  assert.equal(m.leggiRegistroRiordino(R).giri.length, 1);
});

test('get-all-vaults trova gli stessi progetti prima e dopo, e uno rimasto in Mappe/', async t => {
  const h = casaDiGiacomo(t), R = h.R;
  const occupato = c(R, 'Classi', 'Senza classe', 'Svizzera');   // conflitto: la destinazione esiste già
  vault(occupato, 'Svizzera (altra)');
  const m = mainIn(h.casa, h.imp);
  h.imp.struttura = 1;
  const chiave = v => [v.folderName, v.classDir || '', v.studentDir || ''].join('|');
  // le due basi si leggono sempre: anche prima, la cartella occupante in Classi/ è elencata
  const tuttiPrima = await m.handlers['get-all-vaults']();
  assert.ok(tuttiPrima.some(v => v.fullPath === occupato));
  const prima = tuttiPrima.filter(v => v.fullPath !== occupato).map(chiave).sort();
  m.riorganizzaStruttura();
  const dopo = await m.handlers['get-all-vaults']();
  assert.deepEqual(dopo.filter(v => v.fullPath !== occupato).map(chiave).sort(), prima);
  assert.ok(c_(R, 'Mappe', 'Svizzera', 'index.yaml'), 'il progetto in conflitto resta dov\'era');
  assert.ok(dopo.some(v => v.fullPath === c(R, 'Mappe', 'Svizzera')), 'e si legge ancora');
  const el = dopo.find(v => v.folderName === 'Elettricità');
  assert.equal(el.classDir, '4R'); assert.equal(el.discDir, 'Scienze'); assert.equal(el.projectId, PID);
  assert.equal(dopo.find(v => v.folderName === 'Il Sale').classDir, undefined, 'Senza classe → nessuna classe');
  const fr = dopo.find(v => v.folderName === 'Frazioni');
  assert.equal(fr.studentDir, 'Marco'); assert.equal(fr.discDir, 'Matematica');
  const reg = m.leggiRegistroRiordino(R);
  assert.ok(reg.giri[0].conflitti.some(x => x.da.join('/') === 'Mappe/Svizzera' && x.motivo === 'destinazione-esiste'));
});

test('andata e ritorno: «Torna alla struttura di prima» rimette tutto, impronte uguali, interruttore a 0', t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  const prima = impronte(R);
  m.riorganizzaStruttura();
  const r = m.tornaIndietroStruttura();
  assert.equal(r.ok, true);
  assert.equal(r.conflitti, 0); assert.equal(r.falliti, 0);
  const dopo = impronte(R);
  const reg = 'Diagnostica/riorganizzazione-beta8.json';
  assert.ok(dopo[reg], 'il registro è tornato con Diagnostica');
  delete dopo[reg];
  assert.deepEqual(dopo, prima);
  assert.ok(!c_(R, 'Sistema'), 'Sistema vuota se ne va');
  assert.equal(h.imp.struttura, 1);
  assert.equal(h.imp.mappai_struttura_v2, '0');
  assert.equal(m.mapsBaseDir(), c(R, 'Mappe'));
  assert.equal(m.riorganizzaStruttura(), null, 'con l\'interruttore a 0 non riparte');
  const vj = JSON.parse(fs.readFileSync(c(R, 'Attività di studio', 'materiali-mappa-15-10-2026', 'vault.json'), 'utf8'));
  assert.equal(vj.dir, h.el);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.el, 'pipeline.json'), 'utf8')).vaultPath, h.el);
  // «Riorganizza la cartella»: riacceso, riparte e aggiunge un giro allo stesso registro
  h.imp.mappai_struttura_v2 = '1';
  m.riorganizzaStruttura();
  const giri = m.leggiRegistroRiordino(R).giri.map(g => g.verso);
  assert.deepEqual(giri, ['avanti', 'indietro', 'avanti']);
});

test('un progetto nato in Classi/ dopo la riorganizzazione si legge ancora dopo il ritorno indietro (gate del 16/10)', async t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  m.riorganizzaStruttura();
  vault(c(R, 'Classi', '4R', 'Storia', 'Nato dopo'), 'Nato dopo', 'projectId: proj_1790000000077\n');
  m.tornaIndietroStruttura();
  assert.equal(m.mapsBaseDir(), c(R, 'Mappe'));
  const v = (await m.handlers['get-all-vaults']()).find(x => x.folderName === 'Nato dopo');
  assert.ok(v, 'elencato');
  assert.equal(v.classDir, '4R'); assert.equal(v.discDir, 'Storia');
  assert.ok(c_(R, 'Classi', '4R', 'Storia', 'Nato dopo', 'index.yaml'), 'non spostato, non perso');
});

test('interruttore a 0 prima: niente si sposta', t => {
  const h = casaDiGiacomo(t), R = h.R;
  h.imp.mappai_struttura_v2 = '0';
  const m = mainIn(h.casa, h.imp);
  const prima = impronte(R);
  assert.equal(m.riorganizzaStruttura(), null);
  assert.deepEqual(impronte(R), prima);
  assert.equal(m.mapsBaseDir(), c(R, 'Mappe'));
});

test('cartella non organizzata (cartelle storiche in Documenti): non tocca a lei (N6)', t => {
  const h = casaDiGiacomo(t);
  const m = mainIn(h.casa, {});
  assert.equal(m.riorganizzaStruttura(), null);
  assert.ok(c_(h.R, 'Mappe', '4R'));
});

test('uno spostamento che non riesce (altro disco) resta dov\'era e si riprova all\'avvio dopo', t => {
  const h = casaDiGiacomo(t), R = h.R;
  const vero = fs.renameSync;
  let rompi = true;
  fs.renameSync = function (a, b) {
    if (rompi && a === c(R, 'Mappe', '4R', 'Il Nazismo')) { const e = new Error('EXDEV'); e.code = 'EXDEV'; throw e; }
    return vero.apply(fs, arguments);
  };
  t.after(() => { fs.renameSync = vero; });
  const m = mainIn(h.casa, h.imp);
  const primo = m.riorganizzaStruttura();
  assert.ok(primo.giro.falliti.some(f => f.da.join('/') === 'Mappe/4R/Il Nazismo' && f.errore === 'EXDEV'));
  assert.ok(c_(R, 'Mappe', '4R', 'Il Nazismo', 'index.yaml'));
  rompi = false;
  const secondo = m.riorganizzaStruttura();
  assert.deepEqual(J(secondo.giro.fatti.map(s => s.a.join('/'))), ['Classi/4R/Il Nazismo']);
  assert.ok(!c_(R, 'Mappe', '4R'));
  assert.equal(m.leggiRegistroRiordino(R).giri.length, 2);
});

test('credenziali con la struttura nuova: Classi/Credenziali; la cartella dell\'allievo senza «Mappe»', async t => {
  const h = casaDiGiacomo(t), m = mainIn(h.casa, h.imp), R = h.R;
  m.riorganizzaStruttura();
  const b64 = Buffer.from('%PDF').toString('base64');
  const cl = await m.handlers['class-doc-save']({}, { scope: 'class', name: '2B', fileName: 'credenziali-2B.pdf', base64: b64 });
  assert.equal(cl.path, c(R, 'Classi', 'Credenziali', 'credenziali-2B.pdf'));
  const st = await m.handlers['class-doc-save']({}, { scope: 'student', name: 'Luca', fileName: 'credenziali-Luca', base64: b64 });
  assert.equal(st.path, c(R, 'Classi', 'Credenziali', 'credenziali-Luca.pdf'));
  const fo = await m.handlers['student-folder-ensure']({}, { name: 'Luca' });
  assert.equal(fo.dir, c(R, 'Allievi', 'Luca'));
  assert.deepEqual(fs.readdirSync(fo.dir), []);
  // con la struttura di prima, come oggi
  const h2 = casaDiGiacomo(t), m2 = mainIn(h2.casa, Object.assign(h2.imp, { mappai_struttura_v2: '0' }));
  const vecchio = await m2.handlers['class-doc-save']({}, { scope: 'class', name: '2B', fileName: 'credenziali-2B.pdf', base64: b64 });
  assert.equal(vecchio.path, c(h2.R, 'Classi', '2B', 'credenziali-2B.pdf'));
});
