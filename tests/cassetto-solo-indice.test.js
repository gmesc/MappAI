'use strict';
/*
 * cassetto-solo-indice.test.js — packet 0082 (ADR 0018, revisione 2).
 *
 * Il cassetto tiene solo l'indice: con `mappai_cassetto_solo_indice` = '1' il
 * salvataggio automatico scrive la cartella del progetto aperto dallo stato VIVO e
 * poi toglie la copia; «Riprendi» senza copia ritrova la cartella per id, per
 * percorso, per posizione; la cartella che manca nasce con la classe della riga.
 *
 * I moduli VERI in una vm, come tests/cartella-completa.test.js: `StorageManager`
 * ritagliato da `mappai-storage-lang.js` (da 'const StorageManager = {' alla prima
 * '\n};'), `mappai-vault-io.js`, `mappai-vault-manager.js`, e i core
 * (`mappai-text-utils.js`, `mappai-files-core.js`, `mappai-documenti-core.js`,
 * `mappai-vista-core.js`) caricati DENTRO la vm, così il lettore dell'interruttore
 * legge il `localStorage` del banco. Davanti, un `electronAPI` finto con un disco in
 * memoria: `saveVault` (spia, può restare in sospeso), `readVaultFile` (base64),
 * `getAllVaults`, `filesRootGet`. I timer sono in mano al test.
 * Un secondo banco carica `mappai-review.js` vero per `R.persistQuality` (§4.9).
 * Le parti fuori dalla fetta (i due `setInterval`, `loadSavedProject`, ELABORA,
 * INSEGNA, `confirmMerge`) si provano sul sorgente.
 * Gli oggetti nati nella vm si confrontano come JSON.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TC = require('../public/js/mappai-teach-core.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const J = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const B64 = s => Buffer.from(String(s), 'utf8').toString('base64');

const K = 'mappai_cassetto_solo_indice';
const ROOT = '/Users/prova/Documents/MappAI - file';
const MAPPE = ROOT + '/Mappe';
const ID = 'proj_1789000000001', ID_ALTRO = 'proj_1789000000002';
const NOME = 'La Carta';
const DIR = MAPPE + '/4R/Storia/' + NOME;
const FUORI = '/Users/prova/Desktop/Analisi/' + NOME;
const YAML = id => 'projectId: ' + id + '\nextractionMode: mindmap\nrootNodeLabel: ' + NOME + '\n';
const YAML_SENZA_ID = 'extractionMode: mindmap\nrootNodeLabel: ' + NOME + '\n';

function mappa(over) {
  return Object.assign({
    rootNodeLabel: NOME, extractionMode: 'mindmap', activeVaultPath: DIR, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia',
    sources: [],
    db: { nodes: [{ id: 'root', label: NOME, desc: 'Testo.', level: 0, x: 1, y: 1 }, { id: 'a', label: 'Ramo', desc: 'Uno.', level: 1, x: 2, y: 2 }],
      links: [{ source: 'root', target: 'a', rel: 'include' }], sourcesDict: {}, studySets: [], customColors: {} }
  }, over);
}
const riga = over => Object.assign({ id: ID, name: NOME, vault: NOME, classDir: '4R', discDir: 'Storia', date: 1788000000000, clsId: 'cls-4r' }, over);

/* il banco: `caso.disco` = { [cartella]: { [relPath]: testo } } */
function banco(caso = {}) {
  const local = new Map(Object.entries(Object.assign({ tutor_ai_projects: JSON.stringify([riga()]) }, caso.cassetto || {})));
  if (caso.acceso !== false) local.set(K, '1');
  const disco = J(caso.disco || { [DIR]: { 'index.yaml': YAML(ID) } });
  const ev = [], salvate = [], letture = [], registro = [], aperture = [], ensure = [], ensureDisc = [], toast = [], mapjson = [];
  const sospese = [], timer = [];
  let ctx = null;
  const h = { generando: false, pipeline: false };
  const window = {
    electronAPI: {
      filesRootGet: async () => ({ rootDir: ROOT, mapsBaseDir: MAPPE, studentsBaseDir: ROOT + '/Allievi' }),
      getAllVaults: async () => J(caso.cartelle || [{ folderName: NOME, fullPath: DIR, classDir: '4R', discDir: 'Storia', projectId: ID }]),
      saveVault: o => {
        ev.push('save');
        salvate.push({ folderPath: o.folderPath, projectId: o.mapData && o.mapData.projectId, nodi: (o.mapData && o.mapData.nodes || []).length,
          chat: J(o.mapData && o.mapData.tutorState) });
        if (caso.sospeso) return new Promise(res => sospese.push(res));
        return Promise.resolve(J(caso.esito || { success: true }));
      },
      readVaultFile: async ({ vaultPath, relPath } = {}) => {
        letture.push(vaultPath + '|' + relPath);
        /* una lettura di index.yaml in sospeso: le gare del passo 3 */
        if (caso.letturaSospesa && relPath === 'index.yaml' && !h._letturaRilasciata) await new Promise(r => { h.rilasciaLettura = () => { h._letturaRilasciata = true; r(); }; });
        await Promise.resolve();
        ev.push('letto:' + relPath);
        const c = disco[vaultPath];
        if (!c) return { ok: false, error: 'vault inesistente' };
        if (!(relPath in c)) return { ok: false, error: 'file non trovato: ' + relPath };
        return { ok: true, base64: B64(c[relPath]), size: c[relPath].length };
      },
      loadVault: async p => ({ success: false, error: 'Cartella non trovata' }),
      saveMapJSON: d => mapjson.push(d)
    },
    addEventListener() {}, showLoadingOverlay() {}, showToast: (m, k) => toast.push({ m, k }), showAlert() {},
    t: (_k, f) => f, switchToMapLayout() {}, updateCostDisplay() {}, renderStudySets() {},
    location: { reload() {} },
    MappAITeachCore: TC,
    MappAIClasses: {
      getActive: () => ({ id: 'cls-4r', name: '4R' }), activeId: () => 'cls-4r', activeDiscipline: () => '', activeStudentName: () => '',
      get: id => (caso.classi || [{ id: 'cls-4r', name: '4R' }, { id: 'cls-2a', name: '2A' }]).find(c => c.id === id) || null,
      list: () => J(caso.classi || [{ id: 'cls-4r', name: '4R' }, { id: 'cls-2a', name: '2A' }]),
      disciplinesOf: () => []
    },
    MappAIVaults: { segnala() {} },
    MappAIGen: { attiva: () => !!h.generando },
    MappAIPipeline: { occupata: () => !!h.pipeline, checkResume() {} },
    MappAIErrori: { registra: r => { registro.push(r); return r; }, controllaCassetto() {} },
    MappAIReview: { restore: async () => {} },
    directLoadVault: p => {
      aperture.push(p);
      if (caso.dopoApertura) caso.dopoApertura(ctx);
      if (caso.aperturaLenta) return new Promise(res => { h.finisciApertura = () => { ev.push('aperta'); res(); }; });
      return Promise.resolve();
    },
    StorageManager: function StorageManager() {}   // l'esca: nel browser `window.StorageManager` è la classe nativa
  };
  if (caso.studente) window.electronAPI.__studente = true;
  ctx = vm.createContext({
    window, console: { log() {}, info() {}, warn() {}, error() {} },
    appState: caso.appState || mappa(),
    document: { getElementById: () => null }, simulation: null, atob, btoa, TextDecoder, TextEncoder,
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => { local.set(k, String(v)); },
      removeItem: k => { local.delete(k); },
      get length() { return local.size; }, key: i => [...local.keys()][i]
    },
    setTimeout: (fn, ms) => { timer.push({ fn, ms }); return timer.length; },
    clearTimeout: n => { if (timer[n - 1]) timer[n - 1].via = true; },
    queueMicrotask, initD3Visualization() {}
  });
  window.self = ctx; ctx.self = ctx;
  /* il Tutor: lo stesso oggetto su `tutorState` e `window.tutorState`, come mappai-ai-tutor.js:56 */
  vm.runInContext('var tutorState = { sidebar: { history: [] }, nodes: {} }; window.tutorState = tutorState;' +
    'function serializeTutorState(s) { try { return JSON.parse(JSON.stringify(s)); } catch (e) { return { sidebar: { history: [] }, nodes: {} }; } }', ctx);
  for (const f of ['mappai-text-utils.js', 'mappai-files-core.js', 'mappai-documenti-core.js', 'mappai-vista-core.js', 'mappai-fonti-core.js'])
    vm.runInContext(JS(f), ctx);
  window.MappAIFontiCore = ctx.MappAIFontiCore || window.MappAIFontiCore;
  window.MappAIFilesCore = ctx.MappAIFilesCore || window.MappAIFilesCore;
  window.MappAIVistaCore = ctx.MappAIVistaCore || window.MappAIVistaCore;
  /* nel browser `globalThis` È `window`; qui no: il core dei documenti cerca FilesCore sul
     globale (mappai-documenti-core.js:43), FilesCore si attacca a `window` (mappai-files-core.js:714) */
  ctx.MappAIFilesCore = window.MappAIFilesCore;
  const storage = JS('mappai-storage-lang.js');
  const start = storage.indexOf('const StorageManager = {');
  vm.runInContext(storage.slice(start, storage.indexOf('\n};', start) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  vm.runInContext(JS('mappai-vault-io.js'), ctx);
  /* le spie su ciò che vault-io espone */
  const buildVero = window.buildVaultMapData;
  window.buildVaultMapData = () => { ev.push('build'); queueMicrotask(() => ev.push('micro-dopo-build')); return buildVero(); };
  const ensureVero = window.ensureProjectVault;
  window.ensureProjectVault = o => { ensure.push(J(o)); ensureDisc.push(ctx.appState.generationDiscipline); return caso.ensureVero ? ensureVero(o) : Promise.resolve(null); };
  h.ensureVero = ensureVero;
  ctx._storage.currentProjectId = caso.id === undefined ? ID : caso.id;
  if (caso.idInCartella !== false) ctx._storage.idInCartella = caso.idInCartella || { percorso: DIR, id: ID };
  Object.assign(h, {
    ctx, window, local, ev, salvate, letture, registro, aperture, ensure, ensureDisc, toast, mapjson, timer,
    S: ctx._storage, s: () => ctx.appState,
    salva: () => ctx._storage.saveCurrentProject(),
    allinea: () => ctx._storage.allineaCartella(),
    rispondi: (esito, i = 0) => sospese[i](esito),
    copia: () => local.get(ID),
    righe: () => JSON.parse(local.get('tutor_ai_projects') || '[]'),
    rinvii: () => timer.filter(x => x.ms === 10000 && !x.via),
    scadeRinvio: async () => { const t = timer.filter(x => x.ms === 10000 && !x.via); t.forEach(x => { x.via = true; x.fn(); }); await h.flush(); },
    flush: async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); },
    disco
  });
  return h;
}
const registroCon = (h, re) => h.registro.filter(r => re.test(r.messaggio || '')).length;

// ═══ spento = oggi ═══════════════════════════════════════════════════════════

test('0082: interruttore spento — allineaCartella non legge e non scrive niente, la copia resta', async () => {
  const h = banco({ acceso: false });
  h.salva();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 0);
  assert.deepEqual(h.letture, []);
  assert.ok(h.copia(), 'la copia c\'è, come oggi');
});

test('0082: interruttore spento — saveCurrentProject scrive la copia e il mm json come oggi, la riga senza «cartella»', () => {
  const h = banco({ acceso: false });
  h.salva(); h.local.delete(ID); h.salva();
  assert.ok(h.copia(), 'riscritta');
  assert.equal(h.mapjson.length, 2, 'il mm json di oggi');
  assert.ok(!('cartella' in h.righe()[0]), 'nessun campo nuovo');
  assert.equal(h.rinvii().length, 0, 'nessun rinvio');
});

test('0082 M7: nel reader (__studente) acceso non vale — nessuna scrittura, nessuna copia tolta', async () => {
  const h = banco({ studente: true });
  h.salva();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 0);
  assert.ok(h.copia());
});

// ═══ il salvataggio automatico scrive la cartella e toglie la copia (§4.3) ═══

test('0082: acceso — la cartella si scrive dallo stato vivo e la copia esce; la riga resta', async () => {
  const h = banco();
  h.salva();
  assert.ok(h.copia(), 'prima c\'è');
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.equal(h.salvate[0].folderPath, DIR);
  assert.equal(h.salvate[0].nodi, 2);
  assert.equal(h.copia(), undefined, 'la copia è uscita');
  assert.equal(h.righe().length, 1, 'la riga d\'indice resta');
  assert.equal(h.righe()[0].id, ID);
});

test('0082 M16: index.yaml si legge PRIMA, poi stato e scrittura nello stesso giro, senza attese in mezzo', async () => {
  const h = banco();
  h.salva();
  await h.allinea(); await h.flush();
  const iLetto = h.ev.indexOf('letto:index.yaml'), iBuild = h.ev.indexOf('build'), iSave = h.ev.indexOf('save');
  assert.ok(iLetto >= 0 && iLetto < iBuild, 'prima index.yaml, poi lo stato: ' + h.ev.join(' → '));
  assert.ok(iBuild < iSave && iSave < h.ev.indexOf('micro-dopo-build'), 'la saveVault parte nello stesso giro di buildVaultMapData: ' + h.ev.join(' → '));
});

test('0082 M1: senza index.yaml la cartella non si scrive (la saveVault la creerebbe) e il registro lo dice una volta', async () => {
  const h = banco({ disco: { [DIR]: {} } });
  h.salva();
  await h.allinea(); await h.flush();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 0);
  assert.ok(h.copia(), 'la copia resta');
  assert.equal(h.registro.length, 1, 'una riga sola per quel percorso: ' + JSON.stringify(h.registro));
});

test('0082: una cartella che dichiara un altro progetto non si scrive', async () => {
  const h = banco({ disco: { [DIR]: { 'index.yaml': YAML(ID_ALTRO) } } });
  h.salva();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 0);
  assert.ok(h.copia());
});

test('0082: una cartella fuori da Mappe/ (Analisi) con index.yaml del progetto si scrive', async () => {
  const h = banco({ appState: mappa({ activeVaultPath: FUORI, activeVaultClassDir: null, activeVaultDiscDir: null }),
    disco: { [FUORI]: { 'index.yaml': YAML(ID) } }, idInCartella: { percorso: FUORI, id: ID } });
  h.salva();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.equal(h.salvate[0].folderPath, FUORI);
  assert.equal(h.copia(), undefined);
});

test('0082 M3: review-conflict — niente esce, l\'impronta non cambia (si riprova), una riga nel registro per progetto', async () => {
  const h = banco({ esito: { success: false, error: 'review-conflict: la mappa in memoria è precedente alla revisione salvata' } });
  h.salva();
  await h.allinea(); await h.flush();
  assert.ok(h.copia(), 'la copia resta');
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 2, 'non riuscita: al giro dopo si riprova');
  assert.equal(h.registro.length, 1, JSON.stringify(h.registro));
});

test('0082: soloVista (la risposta del reader) non toglie mai la copia', async () => {
  const h = banco({ esito: { success: true, soloVista: true } });
  h.salva();
  await h.allinea(); await h.flush();
  assert.ok(h.copia());
});

test('0082 M2: la copia cambiata mentre la cartella si scriveva resta', async () => {
  const h = banco({ sospeso: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  h.s().db.nodes[1].desc = 'Cambiato durante la scrittura.';
  h.salva();
  const nuova = h.copia();
  h.rispondi({ success: true }); await p; await h.flush();
  assert.equal(h.copia(), nuova, 'la copia più nuova non si tocca');
});

test('0082: un progetto cambiato durante la scrittura — la sua copia resta', async () => {
  const h = banco({ sospeso: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.S.currentProjectId = ID_ALTRO;
  h.rispondi({ success: true }); await p; await h.flush();
  assert.ok(h.copia());
});

test('0082 M32: una scrittura in volo non ne fa partire una seconda', async () => {
  const h = banco({ sospeso: true });
  h.salva();
  const p1 = h.allinea(); await h.flush();
  h.s().db.nodes[1].desc = 'Ancora.'; h.salva();
  const p2 = h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  h.rispondi({ success: true }); await p1; await p2; await h.flush();
});

test('0082 M17: la copia esce solo se la cartella dichiara l\'id (letto o scritto ora)', async () => {
  // index.yaml senza id e una cartella che non è stata adottata qui: la scrittura non porta l'id
  const h1 = banco({ disco: { [DIR]: { 'index.yaml': YAML_SENZA_ID } }, idInCartella: false });
  h1.salva();
  await h1.allinea(); await h1.flush();
  assert.equal(h1.salvate.length, 1, 'si scrive');
  assert.equal(h1.salvate[0].projectId, undefined);
  assert.ok(h1.copia(), 'ma la copia resta: «Riprendi» per id non la ritroverebbe');
  // stessa cartella senza id, ma adottata qui: la scrittura porta l'id
  const h2 = banco({ disco: { [DIR]: { 'index.yaml': YAML_SENZA_ID } } });
  h2.salva();
  await h2.allinea(); await h2.flush();
  assert.equal(h2.salvate[0].projectId, ID);
  assert.equal(h2.copia(), undefined);
});

test('0082 M26: un id che non è nella forma che l\'app conia non conferma l\'identità', async () => {
  const STRANO = 'progetto-strano';
  const h = banco({ id: STRANO, cassetto: { tutor_ai_projects: JSON.stringify([riga({ id: STRANO })]) },
    disco: { [DIR]: { 'index.yaml': YAML_SENZA_ID } }, idInCartella: { percorso: DIR, id: STRANO } });
  h.salva();
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.ok(h.local.get(STRANO), 'la copia resta');
});

test('0082 M13: fonti in memoria e nessun Fonti/fonti.json — la copia resta; con fonti.json, o senza fonti, esce', async () => {
  const conFonti = mappa({ sources: [{ id: 's1', type: 'text', name: 'Fonte', content: 'testo' }] });
  const h1 = banco({ appState: conFonti });
  h1.salva(); await h1.allinea(); await h1.flush();
  assert.equal(h1.salvate.length, 1);
  assert.ok(h1.copia(), 'senza Fonti/ la copia resta');
  const h2 = banco({ appState: mappa({ sources: [{ id: 's1', type: 'text', name: 'Fonte', content: 'testo' }] }),
    disco: { [DIR]: { 'index.yaml': YAML(ID), 'Fonti/fonti.json': '{"schema":"mappai-fonti@1","fonti":[{"id":"s1","testoRel":""}]}' } } });
  h2.salva(); await h2.allinea(); await h2.flush();
  assert.equal(h2.copia(), undefined, 'con la fonte nell\'indice esce');
});

test('0082 M39: Fonti/fonti.json c\'è ma non elenca una fonte in memoria (un «Aggiungi PDF» non scritto) — la copia resta', async () => {
  const st = mappa({ sources: [{ id: 's1', type: 'text', name: 'Vecchia', content: 'testo' }, { id: 's2', type: 'pdf', name: 'Nuova', content: 'pdf' }] });
  const h = banco({ appState: st, disco: { [DIR]: { 'index.yaml': YAML(ID), 'Fonti/fonti.json': '{"schema":"mappai-fonti@1","fonti":[{"id":"s1"}]}' } } });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.ok(h.copia(), 'la fonte s2 sta solo nella copia');
});

test('0082 M40: una fonte col testo il cui .txt non è nell\'indice — la copia resta', async () => {
  const st = mappa({ sources: [{ id: 's1', type: 'text', name: 'F', content: 'Un testo della fonte abbastanza lungo da avere il suo file di testo.' }] });
  const h = banco({ appState: st, disco: { [DIR]: { 'index.yaml': YAML(ID), 'Fonti/fonti.json': '{"schema":"mappai-fonti@1","fonti":[{"id":"s1","testoRel":""}]}' } } });
  h.salva(); await h.allinea(); await h.flush();
  assert.ok(h.copia());
});

test('0082: le fonti di Allegati/ (vault di prima dello 0059) non si chiedono nell\'indice', async () => {
  const st = mappa({ sources: [{ id: 'allegati-0', type: 'pdf', name: 'a.pdf', content: '', vaultRel: 'Allegati/a.pdf', daAllegati: true }] });
  const h = banco({ appState: st, disco: { [DIR]: { 'index.yaml': YAML(ID), 'Fonti/fonti.json': '{"schema":"mappai-fonti@1","fonti":[]}' } } });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.copia(), undefined);
});

test('0082 M20: un set che save-vault non scrive (mappa rinominata) tiene la copia', async () => {
  const st = mappa();
  st.db.studySets = [{ id: 'set1', type: 'quiz', _mappa: 'Il titolo di prima', items: [] }];
  const h = banco({ appState: st });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.ok(h.copia());
  const st2 = mappa();
  st2.db.studySets = [{ id: 'set1', type: 'quiz', _mappa: NOME, items: [] }, { id: 'set2', type: 'quiz', items: [] }];
  const h2 = banco({ appState: st2 });
  h2.salva(); await h2.allinea(); await h2.flush();
  assert.equal(h2.copia(), undefined, 'i set della mappa vanno nella cartella: la copia esce');
});

test('0082 M20: una bozza della revisione docente tiene la copia', async () => {
  const h = banco({ appState: mappa({ _reviewLocalDraft: { vaultPath: DIR, db: {}, when: 'x' } }) });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.ok(h.copia());
});

test('0082: le domande del quiz del nodo (flashcardTest) NON tengono la copia (B5 (b), perdita accettata)', async () => {
  const st = mappa();
  st.db.nodes[1].flashcardTest = [{ q: 'Domanda?', a: 'Risposta.' }];
  const h = banco({ appState: st });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.copia(), undefined);
});

test('0082 M18: zero nodi — niente scrittura', async () => {
  const h = banco({ appState: mappa({ db: { nodes: [], links: [], sourcesDict: {}, studySets: [], customColors: {} } }) });
  h.local.set(ID, '{"vecchia":1}');
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 0);
  assert.equal(h.copia(), '{"vecchia":1}');
});

test('0082 M6/M31: le pause — generazione, pipeline, revisione in ripristino o in errore, riapertura dalla cartella, cassetto pieno in volo', async () => {
  const pause = [
    h => { h.generando = true; },
    h => { h.pipeline = true; },
    h => { h.s()._reviewRestoring = true; },
    h => { h.s()._reviewRestoreError = 'x'; },
    h => { h.S._apreDallaCartella = true; },
    h => { h.S._cp.inVolo = true; },
    h => { h.s().activeVaultPath = null; }
  ];
  for (const [i, metti] of pause.entries()) {
    const h = banco();
    h.salva();
    metti(h);
    await h.allinea(); await h.flush();
    assert.equal(h.salvate.length, 0, 'pausa ' + i);
    assert.ok(h.copia(), 'pausa ' + i + ': la copia resta');
  }
});

test('0082 M43: un altro progetto aperto mentre si legge index.yaml — niente scrittura (inv. 20-bis)', async () => {
  const h = banco({ letturaSospesa: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.S.currentProjectId = ID_ALTRO;
  h.rilasciaLettura(); await p; await h.flush();
  assert.equal(h.salvate.length, 0);
});

test('0082 M43: la cartella attiva cambiata mentre si legge index.yaml — niente scrittura', async () => {
  const h = banco({ letturaSospesa: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.s().activeVaultPath = MAPPE + '/4R/Storia/Un\'altra';
  h.rilasciaLettura(); await p; await h.flush();
  assert.equal(h.salvate.length, 0);
});

test('0082 M43: una revisione in ripristino partita mentre si legge index.yaml — niente scrittura', async () => {
  const h = banco({ letturaSospesa: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.s()._reviewRestoring = true;
  h.rilasciaLettura(); await p; await h.flush();
  assert.equal(h.salvate.length, 0);
});

test('0082 M44: la cartella attiva cambiata durante la saveVault (stesso id) — la copia resta', async () => {
  const h = banco({ sospeso: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.s().activeVaultPath = MAPPE + '/5R/Storia/' + NOME;
  h.rispondi({ success: true }); await p; await h.flush();
  assert.ok(h.copia());
});

test('0082 M45: il registro — un motivo passeggero (copia cambiata) non scrive righe e non consuma quelle dopo', async () => {
  const st = mappa({ sources: [{ id: 's1', type: 'text', name: 'F', content: 't' }] });
  const h = banco({ sospeso: true, appState: st });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.s().db.nodes[1].desc = 'Durante.'; h.salva();
  h.rispondi({ success: true }); await p; await h.flush();
  assert.equal(h.registro.length, 0, 'copia cambiata: nessuna riga');
  const p2 = h.allinea(); await h.flush();
  h.rispondi({ success: true }, 1); await p2; await h.flush();
  assert.equal(registroCon(h, /Fonti/), 1, 'la riga sulle fonti c\'è: ' + JSON.stringify(h.registro));
});

// ═══ l'impronta: indietro o pari (§4.2, §4.3 passo 2) ═══════════════════════

test('0082 M21: senza modifiche il giro dopo non riscrive la cartella', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
});

test('0082 M5: una chat nuova (e nient\'altro) riscrive la cartella, con la chat', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.ctx.tutorState.sidebar.history.push({ role: 'user', parts: [{ text: 'una domanda' }] });
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 2);
  assert.equal(h.salvate[1].chat.sidebar.history.length, 1);
});

test('0082: una modifica della mappa riscrive la cartella', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.s().db.nodes[1].desc = 'Corretto dal docente.';
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 2);
  assert.equal(h.copia(), undefined);
});

test('0082 M4: dopo l\'uscita, un salvataggio senza modifiche non rimette la copia; una modifica sì', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.copia(), undefined);
  h.salva();
  assert.equal(h.copia(), undefined, 'uguale all\'impronta: non si riscrive');
  assert.equal(h.righe().length, 1, 'la riga sì');
  h.s().db.nodes[1].desc = 'Nuovo.';
  h.salva();
  assert.ok(h.copia(), 'diversa: si scrive, finché la cartella è indietro');
});

test('0082 M15: una copia vecchia rimasta nel cassetto si riscrive anche se il testo è quello dell\'impronta', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.local.set(ID, '{"vecchia":true}');
  h.salva();
  assert.notEqual(h.copia(), '{"vecchia":true}');
});

test('0082 M25: cartella pari ma la copia c\'è (rimessa dal cassetto pieno) — si toglie senza scrivere', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.local.set(ID, '{"_residuo":{"cartella":"' + DIR + '"}}');
  await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1, 'nessuna seconda scrittura');
  assert.equal(h.copia(), undefined, 'la copia è uscita');
});

test('0082: dopo un riavvio (impronta assente) la prima scrittura si fa comunque, una sola', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.S._impronta = null;
  h.salva(); await h.allinea(); await h.flush();
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 2);
});

test('0082: una copia che non può uscire (manca Fonti/) non fa riscrivere la cartella a ogni giro', async () => {
  const h = banco({ appState: mappa({ sources: [{ id: 's1', type: 'text', name: 'F', content: 't' }] }) });
  h.salva(); await h.allinea(); await h.flush();
  h.salva(); await h.allinea(); await h.flush();
  h.salva(); await h.allinea(); await h.flush();
  assert.equal(h.salvate.length, 1);
  assert.ok(h.copia());
  assert.ok(h.registro.length <= 1, 'una riga per progetto: ' + JSON.stringify(h.registro));
});

// ═══ il rinvio di 10 s e lo sguardo sulle chat (§4.3-bis) ═══════════════════

test('0082 M30: il rinvio nasce solo quando la copia scritta è diversa dall\'impronta', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.timer.forEach(x => { x.via = true; });
  h.salva();
  assert.equal(h.rinvii().length, 0, 'niente di nuovo: nessun rinvio');
  h.s().db.nodes[1].desc = 'Modificato.';
  h.salva();
  assert.equal(h.rinvii().length, 1);
});

test('0082: il rinvio si riarma a ogni modifica (uno solo attivo) e allo scadere scrive la cartella', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.timer.forEach(x => { x.via = true; });
  h.s().db.nodes[1].desc = 'Uno.'; h.salva();
  h.s().db.nodes[1].desc = 'Due.'; h.salva();
  assert.equal(h.rinvii().length, 1, 'uno solo attivo');
  await h.scadeRinvio();
  assert.equal(h.salvate.length, 2);
  assert.equal(h.copia(), undefined);
});

test('0082 M32: allo scadere con una scrittura in volo il rinvio si riarma, senza una seconda scrittura', async () => {
  const h = banco({ sospeso: true });
  h.salva();
  const p = h.allinea(); await h.flush();
  h.s().db.nodes[1].desc = 'Durante.'; h.salva();
  await h.scadeRinvio();
  assert.equal(h.salvate.length, 1, 'non parte una seconda');
  assert.equal(h.rinvii().length, 1, 'riarmato');
  h.rispondi({ success: true }); await p; await h.flush();
});

test('0082 M31: allo scadere durante una generazione il rinvio non scrive e non si riarma', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.timer.forEach(x => { x.via = true; });
  h.s().db.nodes[1].desc = 'Nuovo.'; h.salva();
  h.generando = true;
  await h.scadeRinvio();
  assert.equal(h.salvate.length, 1);
  assert.equal(h.rinvii().length, 0, 'ci pensa il giro di 120 s');
});

test('0082 M33: _guardaChat chiede il rinvio solo quando la firma delle chat cambia', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.timer.forEach(x => { x.via = true; });
  h.S._guardaChat();
  assert.equal(h.rinvii().length, 0, 'firma uguale');
  h.ctx.tutorState.sidebar.history.push({ role: 'user', parts: [{ text: 'nuova' }] });
  h.S._guardaChat();
  assert.equal(h.rinvii().length, 1);
  h.S._guardaChat();
  assert.equal(h.rinvii().length, 1, 'la stessa firma non riarma');
  await h.scadeRinvio();
  assert.equal(h.salvate.length, 2, 'la chat va nella cartella');
});

test('0082: _guardaChat legge window.tutorState anche dopo setTutorState (oggetto sostituito)', async () => {
  const h = banco();
  h.salva(); await h.allinea(); await h.flush();
  h.timer.forEach(x => { x.via = true; });
  h.window.tutorState = { sidebar: { history: [{ role: 'user', parts: [{ text: 'x' }] }] }, nodes: {} };
  h.S._guardaChat();
  assert.equal(h.rinvii().length, 1);
});

test('0082: _guardaChat a interruttore spento, o durante il ripristino della revisione, non fa niente', () => {
  const h = banco({ acceso: false });
  h.ctx.tutorState.sidebar.history.push({ role: 'user', parts: [{ text: 'x' }] });
  h.S._guardaChat();
  assert.equal(h.rinvii().length, 0);
  const h2 = banco();
  h2.s()._reviewRestoring = true;
  h2.ctx.tutorState.sidebar.history.push({ role: 'user', parts: [{ text: 'x' }] });
  h2.S._guardaChat();
  assert.equal(h2.rinvii().length, 0);
});

test('0082 M19/M34: gli agganci ai timer fuori dalla fetta — il giro di 120 s chiama allineaCartella dopo saveCurrentProject, uno di 5 s chiama _guardaChat', () => {
  const src = JS('mappai-storage-lang.js');
  const fine = src.indexOf('\n};', src.indexOf('const StorageManager = {'));
  const fuori = src.slice(fine);
  const giro = fuori.match(/setInterval\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*120000\s*\)/);
  assert.ok(giro, 'il setInterval di 120 s c\'è');
  const corpo = giro[1];
  assert.ok(/StorageManager\.saveCurrentProject\(\)/.test(corpo));
  assert.ok(/StorageManager\.allineaCartella\(\)/.test(corpo), 'chiama allineaCartella');
  assert.ok(corpo.indexOf('saveCurrentProject()') < corpo.indexOf('allineaCartella()'), 'dopo saveCurrentProject');
  const chat = fuori.match(/setInterval\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*5000\s*\)/);
  assert.ok(chat && /StorageManager\._guardaChat\(\)/.test(chat[1]), 'il setInterval di 5 s chiama _guardaChat');
});

test('0082 M14: allineaCartella, _testoCopia e _guardaChat stanno DENTRO la fetta che i test ritagliano', () => {
  const src = JS('mappai-storage-lang.js');
  const s = src.indexOf('const StorageManager = {');
  const fetta = src.slice(s, src.indexOf('\n};', s) + 3);
  for (const m of ['allineaCartella:', '_testoCopia:', '_guardaChat:', '_chiediAllineamento:'])
    assert.ok(fetta.includes('    ' + m), m);
  for (const seg of ['    loadProject: async function', '    deleteProject: function', 'const StorageManager = {'])
    assert.equal(src.split(seg).length, 2, 'segnaposto una volta: ' + seg);
});

// ═══ la riga d'indice porta la cartella (§4.4) ═══════════════════════════════

test('0082: la riga porta la cartella relativa alla radice dei file; fuori dalla radice, intera', async () => {
  const h = banco();
  await h.allinea(); await h.flush();
  assert.equal(h.S._radice, ROOT, 'la radice letta da filesRootGet e tenuta');
  h.salva();
  assert.equal(h.righe()[0].cartella, 'Mappe/4R/Storia/' + NOME);
  const h2 = banco({ appState: mappa({ activeVaultPath: FUORI }), disco: { [FUORI]: { 'index.yaml': YAML(ID) } }, idInCartella: { percorso: FUORI, id: ID } });
  h2.S._radice = ROOT;
  h2.salva();
  assert.equal(h2.righe()[0].cartella, FUORI);
});

test('0082: radice ancora ignota e stessa cartella della riga di prima — il valore di prima resta; senza cartella, null', () => {
  const h = banco({ cassetto: { tutor_ai_projects: JSON.stringify([riga({ cartella: 'Mappe/4R/Storia/' + NOME })]) } });
  h.S._radice = null;
  h.salva();
  assert.equal(h.righe()[0].cartella, 'Mappe/4R/Storia/' + NOME);
  const h2 = banco({ appState: mappa({ activeVaultPath: null }) });
  h2.salva();
  assert.equal(h2.righe()[0].cartella, null);
});

// ═══ «Riprendi» senza copia (§4.5) ═══════════════════════════════════════════

const CARTELLE = [
  { folderName: NOME, fullPath: DIR, classDir: '4R', discDir: 'Storia' },                          // la posizione, senza id
  { folderName: NOME + ' spostata', fullPath: MAPPE + '/5R/Storia/' + NOME + ' spostata', classDir: '5R', discDir: 'Storia', projectId: ID }
];

test('0082 M9: senza copia, la cartella che dichiara l\'id vince sulla posizione', async () => {
  const h = banco({ cartelle: CARTELLE });
  assert.equal(await h.S.loadProject(ID), true);
  await h.flush();
  assert.deepEqual(h.aperture, [CARTELLE[1].fullPath]);
});

test('0082: due cartelle con lo stesso id — non si sceglie per id, si passa al percorso della riga', async () => {
  const doppie = [CARTELLE[1], Object.assign({}, CARTELLE[1], { fullPath: MAPPE + '/6R/Storia/Copia', folderName: 'Copia' })];
  const h = banco({ cartelle: doppie, cassetto: { tutor_ai_projects: JSON.stringify([riga({ cartella: 'Desktop/Analisi/X' })]) },
    disco: { [ROOT + '/Desktop/Analisi/X']: { 'index.yaml': YAML(ID) } } });
  assert.equal(await h.S.loadProject(ID), true);
  await h.flush();
  assert.deepEqual(h.aperture, [ROOT + '/Desktop/Analisi/X']);
});

test('0082: per id niente — il percorso della riga, se è una mappa del progetto (anche fuori dalla radice)', async () => {
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ cartella: FUORI })]) },
    disco: { [FUORI]: { 'index.yaml': YAML(ID) } } });
  assert.equal(await h.S.loadProject(ID), true);
  await h.flush();
  assert.deepEqual(h.aperture, [FUORI]);
});

test('0082 M9: il percorso della riga senza index.yaml (una cartella di classe) non si apre: si va alla posizione', async () => {
  const h = banco({ cartelle: [CARTELLE[0]], cassetto: { tutor_ai_projects: JSON.stringify([riga({ cartella: 'Mappe/4R' })]) },
    disco: { [MAPPE + '/4R']: {} } });
  assert.equal(await h.S.loadProject(ID), true);
  await h.flush();
  assert.ok(!h.aperture.includes(MAPPE + '/4R'), 'mai la cartella della classe');
  assert.deepEqual(h.aperture, [DIR], 'la posizione, come oggi');
});

test('0082: il percorso della riga che dichiara un altro id non si apre', async () => {
  const h = banco({ cartelle: [CARTELLE[0]], cassetto: { tutor_ai_projects: JSON.stringify([riga({ cartella: FUORI })]) },
    disco: { [FUORI]: { 'index.yaml': YAML(ID_ALTRO) } } });
  await h.S.loadProject(ID); await h.flush();
  assert.deepEqual(h.aperture, [DIR]);
});

/* directLoadVault vero azzera lo stato di generazione (0078) e adotta l'id: qui lo si finge */
const azzera = materia => ctx => { ctx.appState = mappa({ generationDiscipline: '', vaultMateria: materia || '' }); ctx._storage.currentProjectId = ID; };

test('0082 M46: «Riprendi» dalla cartella rimette la disciplina della riga (non vince la disciplina attiva in index.yaml)', async () => {
  const h = banco({ cartelle: CARTELLE, cassetto: { tutor_ai_projects: JSON.stringify([riga({ disc: 'Scienze' })]) }, dopoApertura: azzera('Storia') });
  await h.S.loadProject(ID); await h.flush();
  assert.equal(h.s().generationDiscipline, 'Scienze');
});

test('0082 M46: una riga senza disciplina prende quella dichiarata dalla cartella (vaultMateria)', async () => {
  const h = banco({ cartelle: CARTELLE, dopoApertura: azzera('Storia') });
  await h.S.loadProject(ID); await h.flush();
  assert.equal(h.s().generationDiscipline, 'Storia');
});

test('0082 M46: spento, o un altro progetto aperto nel frattempo — la disciplina non si tocca', async () => {
  const h = banco({ acceso: false, cartelle: CARTELLE, cassetto: { tutor_ai_projects: JSON.stringify([riga({ disc: 'Scienze' })]) }, dopoApertura: azzera('Storia') });
  await h.S.loadProject(ID); await h.flush();
  assert.equal(h.s().generationDiscipline, '');
  const h2 = banco({ cartelle: CARTELLE, cassetto: { tutor_ai_projects: JSON.stringify([riga({ disc: 'Scienze' })]) },
    dopoApertura: ctx => { ctx.appState = mappa({ generationDiscipline: '' }); ctx._storage.currentProjectId = ID_ALTRO; } });
  await h2.S.loadProject(ID); await h2.flush();
  assert.equal(h2.s().generationDiscipline, '');
});

test('0082: il segno «superata» dello 0076 resta il primo', async () => {
  const h = banco({ cartelle: CARTELLE, cassetto: { tutor_ai_projects: JSON.stringify([riga({ superata: { cartella: FUORI, quando: 'x', copia: 0 } })]) } });
  await h.S.loadProject(ID); await h.flush();
  assert.deepEqual(h.aperture, [FUORI]);
});

test('0082: interruttore spento — l\'ordine di oggi (la posizione), l\'id non si guarda', async () => {
  const h = banco({ acceso: false, cartelle: CARTELLE });
  assert.equal(await h.S.loadProject(ID), true);
  await h.flush();
  assert.deepEqual(h.aperture, [DIR]);
});

test('0082 B4: acceso, loadProject senza copia risponde DOPO l\'apertura; spento, subito come oggi', async () => {
  const h = banco({ cartelle: CARTELLE, aperturaLenta: true });
  let fatto = false;
  const p = h.S.loadProject(ID).then(r => { fatto = true; return r; });
  await h.flush();
  assert.equal(fatto, false, 'aspetta directLoadVault');
  h.finisciApertura();
  assert.equal(await p, true);
  const h2 = banco({ acceso: false, cartelle: CARTELLE, aperturaLenta: true });
  let fatto2 = false;
  h2.S.loadProject(ID).then(() => { fatto2 = true; });
  await h2.flush();
  assert.equal(fatto2, true, 'spento: come oggi');
});

test('0082 B4: window.loadSavedProject restituisce la promessa di loadProject', () => {
  const src = JS('mappai-storage-lang.js');
  const m = src.match(/window\.loadSavedProject = function \(id\) \{([\s\S]*?)\n\};/);
  assert.ok(m && /return\s+StorageManager\.loadProject\(id\)/.test(m[1]));
});

test('0082 M23: dopoApertura — acceso aspetta la promessa; spento, o senza promessa, chiama subito', async () => {
  const h = banco();
  let fatto = 0, risolvi;
  const lenta = new Promise(r => { risolvi = r; });
  h.S.dopoApertura(lenta, () => { fatto++; });
  await h.flush();
  assert.equal(fatto, 0, 'acceso: aspetta');
  risolvi(true); await h.flush();
  assert.equal(fatto, 1);
  let rifiutata = 0;
  h.S.dopoApertura(Promise.reject(new Error('x')), () => { rifiutata++; });
  await h.flush();
  assert.equal(rifiutata, 1, 'anche una promessa rifiutata porta avanti');
  let senza = 0;
  h.S.dopoApertura(undefined, () => { senza++; });
  assert.equal(senza, 1, 'senza promessa: subito');
  const h2 = banco({ acceso: false });
  let spento = 0;
  h2.S.dopoApertura(new Promise(() => {}), () => { spento++; });
  assert.equal(spento, 1, 'spento: subito, come oggi, anche con una promessa che non finisce');
});

test('0082 M22: ELABORA e INSEGNA passano da StorageManager.dopoApertura, col ritardo di oggi', () => {
  const el = JS('mappai-elabora.js');
  const i = el.indexOf('window.loadSavedProject(id)');
  assert.ok(i > 0);
  const blocco = el.slice(Math.max(0, i - 600), i + 600);
  assert.ok(/StorageManager\.dopoApertura\(\s*window\.loadSavedProject\(id\)/.test(blocco), 'ELABORA: la promessa va a dopoApertura');
  assert.ok(/setTimeout\(function \(\) \{ openFromMap\(\); \}, 350\)/.test(blocco), 'ELABORA: il setTimeout di oggi resta');
  assert.ok(!/cassettoSoloIndice/.test(blocco), 'ELABORA: la regola sta in un posto solo (inv. 6)');
  const lt = JS('mappai-landing-teach.js');
  const j = lt.indexOf("if (kind === 'collab')");
  const b2 = lt.slice(Math.max(0, j - 900), j + 200);
  assert.ok(/StorageManager\.dopoApertura\(/.test(b2), 'INSEGNA: la promessa va a dopoApertura');
  assert.ok(!/cassettoSoloIndice/.test(b2), 'INSEGNA: la regola sta in un posto solo (inv. 6)');
  assert.ok(/\}, 120\)/.test(lt.slice(j, j + 900)), 'INSEGNA: il ritardo di oggi resta');
});

// ═══ la cartella che manca nasce con la classe della riga (§4.6) ═════════════

const COPIA_SENZA_CARTELLA = JSON.stringify(mappa({ activeVaultPath: null, activeVaultClassDir: null, activeVaultDiscDir: null }));

test('0082 M10: «Riprendi» un progetto senza cartella — ensureProjectVault riceve la classe della RIGA, letta in testa', async () => {
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ clsId: 'cls-2a' })]), [ID]: COPIA_SENZA_CARTELLA } });
  assert.equal(await h.S.loadProject(ID), true);
  h.salva();   // il primo salvataggio dopo l'apertura (col primo disegno)
  h.timer.filter(x => x.ms === 400 && !x.via).forEach(x => { x.via = true; x.fn(); });
  await h.flush();
  assert.equal(h.ensure.length, 1, JSON.stringify(h.ensure));
  assert.equal(h.ensure[0].reason, 'open');
  assert.equal(h.ensure[0].clsId, 'cls-2a');
});

test('0082 M10: una riga senza classe porta clsId null — anche se il primo salvataggio le scrive la classe attiva', async () => {
  const r = riga(); delete r.clsId;
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([r]), [ID]: COPIA_SENZA_CARTELLA } });
  await h.S.loadProject(ID);
  h.salva();
  assert.equal(h.righe()[0].clsId, 'cls-4r', 'il primo salvataggio scrive la classe attiva (mappai-storage-lang.js:181)');
  h.timer.filter(x => x.ms === 400 && !x.via).forEach(x => { x.via = true; x.fn(); });
  await h.flush();
  assert.ok('clsId' in h.ensure[0], 'la chiave c\'è');
  assert.equal(h.ensure[0].clsId, null);
});

/* gate 3 del 08/10, gesto (6): la cartella nata sotto 2A/ e non sotto 2A/Storia/ — la copia veniva da un'apertura
   dalla cartella, che azzera generationDiscipline (0078). Prima di crearla si rimette la disciplina del progetto. */
const COPIA_SENZA_DISC = over => JSON.stringify(mappa(Object.assign({ activeVaultPath: null, activeVaultClassDir: null, activeVaultDiscDir: null,
  generationDiscipline: '', vaultMateria: 'Storia' }, over)));
const lanciaBackfill = async h => { h.timer.filter(x => x.ms === 400 && !x.via).forEach(x => { x.via = true; x.fn(); }); await h.flush(); };

test('0082 M47: la cartella che manca nasce con la disciplina della riga (gate 3, gesto 6)', async () => {
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ clsId: 'cls-2a', disc: 'Scienze' })]), [ID]: COPIA_SENZA_DISC() } });
  await h.S.loadProject(ID); await lanciaBackfill(h);
  assert.equal(h.ensure.length, 1);
  assert.equal(h.ensureDisc[0], 'Scienze');
});

test('0082 M47: riga senza disciplina — quella che la copia ricorda (vaultMateria)', async () => {
  const r = riga({ clsId: 'cls-2a' }); delete r.disc;
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([r]), [ID]: COPIA_SENZA_DISC() } });
  await h.S.loadProject(ID); await lanciaBackfill(h);
  assert.equal(h.ensureDisc[0], 'Storia');
});

test('0082 M47: una disciplina già nella copia non si tocca; spento, come oggi', async () => {
  const h = banco({ cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ clsId: 'cls-2a', disc: 'Scienze' })]),
    [ID]: COPIA_SENZA_DISC({ generationDiscipline: 'Geografia' }) } });
  await h.S.loadProject(ID); await lanciaBackfill(h);
  assert.equal(h.ensureDisc[0], 'Geografia');
  const h2 = banco({ acceso: false, cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ clsId: 'cls-2a', disc: 'Scienze' })]), [ID]: COPIA_SENZA_DISC() } });
  await h2.S.loadProject(ID); await lanciaBackfill(h2);
  assert.equal(h2.ensureDisc[0], '');
});

test('0082: spento — ensureProjectVault({ reason: \'open\' }) come oggi, senza la chiave clsId', async () => {
  const h = banco({ acceso: false, cartelle: [], cassetto: { tutor_ai_projects: JSON.stringify([riga({ clsId: 'cls-2a' })]), [ID]: COPIA_SENZA_CARTELLA } });
  await h.S.loadProject(ID);
  h.timer.filter(x => x.ms === 400 && !x.via).forEach(x => { x.via = true; x.fn(); });
  await h.flush();
  assert.deepEqual(h.ensure, [{ reason: 'open' }]);
});

/* ensureProjectVault vero (mappai-vault-io.js), ramo che crea */
async function crea(caso, opts) {
  const h = banco(Object.assign({ appState: mappa({ activeVaultPath: null, activeVaultClassDir: null, activeVaultDiscDir: null }), idInCartella: false, cartelle: [] }, caso));
  const r = await h.ensureVero(opts);
  await h.flush();
  return { h, r };
}

test('0082 B1 (a): con la chiave clsId la cartella nasce sotto QUELLA classe, non sotto l\'attiva', async () => {
  const { h } = await crea({}, { reason: 'open', clsId: 'cls-2a' });
  assert.equal(h.salvate.length, 1);
  assert.ok(h.salvate[0].folderPath.startsWith(MAPPE + '/2A/'), h.salvate[0].folderPath);
});

test('0082 B2 (a): clsId null, o una classe che non c\'è più, → Senza classe (0104, N5: era Generico)', async () => {
  for (const clsId of [null, 'cls-sparita']) {
    const { h } = await crea({}, { reason: 'open', clsId });
    assert.equal(h.salvate.length, 1, String(clsId));
    assert.ok(h.salvate[0].folderPath.startsWith(MAPPE + '/Senza classe/'), h.salvate[0].folderPath);
  }
});

test('0082 M27: classi non ancora caricate (elenco vuoto) e una clsId — la cartella non nasce', async () => {
  const { h, r } = await crea({ classi: [] }, { reason: 'open', clsId: 'cls-2a' });
  assert.equal(h.salvate.length, 0);
  assert.equal(r, null);
});

test('0082 M38: docente senza classi (elenco vuoto) e riga senza classe — la cartella nasce in Senza classe («Va in «Generico»», Giacomo 07/10; 0104, N5: la cartella ora si chiama Senza classe)', async () => {
  const { h, r } = await crea({ classi: [] }, { reason: 'open', clsId: null });
  assert.equal(h.salvate.length, 1);
  assert.ok(h.salvate[0].folderPath.startsWith(MAPPE + '/Senza classe/'), h.salvate[0].folderPath);
  assert.ok(r && r.folderPath, 'ensureProjectVault risponde con la cartella creata');
});

test('0082: senza la chiave clsId, ensureProjectVault fa quello di oggi (la classe attiva)', async () => {
  const { h } = await crea({}, { reason: 'open' });
  assert.equal(h.salvate.length, 1);
  assert.ok(h.salvate[0].folderPath.startsWith(MAPPE + '/4R/'), h.salvate[0].folderPath);
});

// ═══ la classe e la materia dichiarate in index.yaml (gate 3, 08/10) ════════
/* Il gesto (6) rifatto: la cartella nata sotto 2A/Storia dichiarava «classe: 1A», la classe ATTIVA
   (`_contestoDellaMappa`, mappai-vault-io.js). Giacomo, 08/10: «1 a». Ad acceso la mappa porta le sue:
   quelle della RIGA del progetto aperto (`cls`, `disc`, fissate quando è nato), non quelle di chi guarda.
   Una riga che non le ha (una mappa appena generata, una voce vecchia): come oggi. */
const contesto = h => J(h.window.buildVaultMapData());

test('0082 M48: ad acceso index.yaml dichiara la classe della riga, non quella attiva', () => {
  const h = banco({ cassetto: { tutor_ai_projects: JSON.stringify([riga({ cls: '2A', clsId: 'cls-2a' })]) } });
  assert.equal(contesto(h).classe, '2A');
});

test('0082 M48: ad acceso la materia della riga vince su quella attiva; generationDiscipline vince ancora', () => {
  const h = banco({ cassetto: { tutor_ai_projects: JSON.stringify([riga({ cls: '2A', disc: 'Scienze' })]) } });
  h.window.MappAIClasses.activeDiscipline = () => 'Storia';
  assert.equal(contesto(h).materia, 'Scienze');
  h.s().generationDiscipline = 'Geografia';
  assert.equal(contesto(h).materia, 'Geografia');
});

test('0082 M48: riga senza classe né materia (mappa nuova) — quelle attive, come oggi', () => {
  const r = riga(); delete r.clsId;
  const h = banco({ cassetto: { tutor_ai_projects: JSON.stringify([r]) } });
  h.window.MappAIClasses.activeDiscipline = () => 'Storia';
  assert.equal(contesto(h).classe, '4R');
  assert.equal(contesto(h).materia, 'Storia');
});

test('0082 M48: la riga è quella del progetto APERTO, mai un\'altra (inv. 20-bis)', () => {
  const h = banco({ cassetto: { tutor_ai_projects: JSON.stringify([riga({ cls: '2A' }), riga({ id: ID_ALTRO, cls: '5B' })]) } });
  h.S.currentProjectId = ID_ALTRO;
  assert.equal(contesto(h).classe, '5B');
  h.S.currentProjectId = 'proj_1789000000099';
  assert.equal(contesto(h).classe, '4R', 'nessuna riga: la classe attiva');
});

test('0082 M48: spento — la classe attiva vince come oggi', () => {
  const h = banco({ acceso: false, cassetto: { tutor_ai_projects: JSON.stringify([riga({ cls: '2A', disc: 'Scienze' })]) } });
  h.window.MappAIClasses.activeDiscipline = () => 'Storia';
  assert.equal(contesto(h).classe, '4R');
  assert.equal(contesto(h).materia, 'Storia');
});

// ═══ i mm_*.json (§4.8) ══════════════════════════════════════════════════════

test('0082 M12: acceso, saveCurrentProject non scrive il mm json', () => {
  const h = banco();
  h.salva();
  assert.equal(h.mapjson.length, 0);
});

// ═══ qualita.json non si svuota (§4.9), sempre ═══════════════════════════════

function bancoRevisione(caso = {}) {
  const scritti = [];
  const file = caso.file === undefined ? JSON.stringify({ schema: 'mappai-qualita@2', quando: 'prima', ancora: { a: 1 }, copertura: { c: 1 },
    giudice: { g: 1 }, reranker: { r: 1 } }) : caso.file;
  const st = Object.assign({ activeVaultPath: DIR, db: { nodes: [], links: [] }, sources: [] }, caso.stato || {});
  const local = new Map(caso.spento ? [] : [[K, '1']]);
  const window = {
    MappAIReviewCore: require('../public/js/mappai-review-core.js'),
    MappAILinkEditorCore: require('../public/js/mappai-link-editor-core.js'),
    t: (_k, f) => f,
    electronAPI: {
      saveVaultFile: async a => { scritti.push(a); return { ok: true }; },
      readVaultFile: async ({ relPath }) => {
        if (caso.lettoreLancia) throw new Error('canale rotto');
        if (relPath !== 'qualita.json' || file == null) return { ok: false, error: 'file non trovato: ' + relPath };
        return { ok: true, base64: B64(file) };
      }
    }
  };
  const ctx = vm.createContext({ window, appState: st, document: {}, console: { log() {}, warn() {}, error() {} }, TextDecoder, Uint8Array,
    atob: v => Buffer.from(v, 'base64').toString('binary'),
    StorageManager: { currentProjectId: ID, saveCurrentProject() {} },
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null) } });
  window.self = ctx;
  vm.runInContext(JS('mappai-vista-core.js'), ctx);
  window.MappAIVistaCore = ctx.MappAIVistaCore;
  vm.runInContext(JS('mappai-review.js'), ctx);
  return { R: window.MappAIReview, scritti, st };
}
const scritto = b => JSON.parse(b.scritti[b.scritti.length - 1].text);

test('0082 M35: persistQuality con lo stato azzerato non riscrive null sopra i rapporti del file', async () => {
  const b = bancoRevisione();
  await b.R.persistQuality(DIR);
  const q = scritto(b);
  assert.deepEqual(q.reranker, { r: 1 });
  assert.deepEqual(q.ancora, { a: 1 });
  assert.deepEqual(q.copertura, { c: 1 });
  assert.deepEqual(q.giudice, { g: 1 });
});

test('0082: persistQuality — il rapporto in memoria vince', async () => {
  const b = bancoRevisione({ stato: { _rerankerReport: { r: 2 } } });
  await b.R.persistQuality(DIR);
  assert.deepEqual(scritto(b).reranker, { r: 2 });
  assert.deepEqual(scritto(b).ancora, { a: 1 });
});

test('0082 M36: persistQuality — file mancante, illeggibile o canale che lancia: scrive lo stesso, senza inventare', async () => {
  for (const caso of [{ file: null }, { file: 'non json' }, { lettoreLancia: true }]) {
    const b = bancoRevisione(caso);
    await b.R.persistQuality(DIR);
    assert.equal(b.scritti.length, 1, JSON.stringify(caso));
    const q = scritto(b);
    assert.equal(q.reranker, null);
    assert.equal(q.ancora, null);
  }
});

test('0082 M37: persistQuality protegge il file anche a interruttore spento', async () => {
  const b = bancoRevisione({ spento: true });
  await b.R.persistQuality(DIR);
  assert.deepEqual(scritto(b).reranker, { r: 1 });
});
