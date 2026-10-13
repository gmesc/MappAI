'use strict';
/*
 * cartella-completa.test.js — la cartella ha tutto quello che ha la copia nel
 * cassetto (packet 0078, ADR 0018 rev. 1, punti B2-B5).
 * I moduli VERI in una vm: `StorageManager` ritagliato da `mappai-storage-lang.js`
 * (da 'const StorageManager = {' alla prima '\n};', come tests/cassetto-pieno e
 * tests/identita-cartella), `mappai-vault-io.js`, `mappai-vault-manager.js` e
 * `mappai-vista-core.js` — quest'ultimo caricato DENTRO la vm, così il lettore
 * dell'interruttore legge il `localStorage` del banco. Davanti, un `electronAPI`
 * finto con un disco in memoria (le forme di `load-vault`).
 * Che cosa si prova:
 *   - «Riprendi» (`loadProject`) rimette le chat del Tutor della mappa giusta nei
 *     tre rami (cartella sua · cartella di un altro id · nessuna cartella), DOPO il
 *     ripristino della revisione; e chiede `Fonti/` per la cartella sua, senza mai
 *     svuotare le fonti in memoria;
 *   - le aperture da cartella (`directLoadVault`, `loadMapVault`) azzerano lo stato
 *     di generazione della mappa di prima PRIMA di leggere la cartella, e quello
 *     che la cartella porta (consumi, vista) vince; `loadMapVault` applica la vista;
 *   - interruttore spento (`mappai_cartella_completa` = '0'): tutto come oggi.
 * Gli oggetti nati nella vm si confrontano come JSON.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TC = require('../public/js/mappai-teach-core.js');
const FC = require('../public/js/mappai-files-core.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const J = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

const ID_A = 'proj_1789000000001', ID_B = 'proj_1789000000002', ID_N = 'proj_1789000000006';
const DIR_A = '/M/4R/Storia/Mappa A', DIR_B = '/M/4R/Geografia/Mappa B', DIR_X = '/M/4R/Storia/X';
const CHAT_A = { sidebar: { history: [{ role: 'user', text: 'domanda sulla mappa A' }] }, nodes: {} };
const CHAT_B = { sidebar: { history: [{ role: 'user', text: 'domanda sulla mappa B' }] }, nodes: { b1: { history: [] } } };
const CATENA = { sezioni: [{ titolo: 'Perché', righe: ['riga rivista dal docente'] }] };
const CLONI = { 'per la 2a': { sezioni: [{ titolo: 'Copia', righe: ['una'] }], clone: 'per la 2a' } };

function nodi(titolo) {
  return { nodes: [{ id: 'root', label: titolo, desc: 'Testo.', level: 0, group: 0, x: 10, y: 10 },
    { id: 'b1', label: 'Ramo uno', desc: 'Uno.', level: 1, group: 1, x: 20, y: 20 },
    { id: 'b2', label: 'Ramo due', desc: 'Due.', level: 1, group: 2, x: 30, y: 30 }],
  links: [{ source: 'root', target: 'b1', rel: 'include' }, { source: 'root', target: 'b2', rel: 'include' }],
  sourcesDict: {}, studySets: [], customColors: {} };
}
/* la mappa A in memoria, con TUTTO lo stato di generazione che una generazione lascia */
function mappaA(over) {
  return Object.assign({
    db: nodi('Mappa A'), rootNodeLabel: 'Mappa A', extractionMode: 'mindmap', activeVaultPath: DIR_A,
    activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia', sources: [{ id: 's-a', type: 'text', name: 'Fonte di A', content: 'testo di A' }],
    generationDiscipline: 'Storia', generationTuned: true, _qualityReport: { q: 'A' }, _coverageReport: { c: 'A' },
    _rerankerReport: { r: 'A' }, _judgeReport: { j: 'A' }, _giudiceReport: { g: 'A' }, mmTriage: { tipo: 'A' },
    _docOutline: '\n\nINDICE di A', semanticGuidance: 'guida di A', layoutMode: 'radial', _pdfPagine: [{ pages: ['A'] }],
    _reviewLocalDraft: { d: 'A' }, _reviewDiskDraft: { d: 'A' }, _reviewRequested: true, _generationId: 'gen-A',
    generationUsage: { usedModel: 'modello di A' }
  }, over);
}
const CAMPI = ['generationDiscipline', 'generationTuned', '_qualityReport', '_coverageReport', '_rerankerReport', '_judgeReport',
  '_giudiceReport', 'mmTriage', '_docOutline', 'semanticGuidance', 'layoutMode', '_pdfPagine', '_reviewLocalDraft',
  '_reviewDiskDraft', '_reviewRequested', '_generationId', 'generationUsage'];
// la risposta di `load-vault` (forma di main.js) per la mappa B
const datiB = over => Object.assign({ nodes: nodi('Mappa B').nodes, links: nodi('Mappa B').links, sourcesDict: {},
  extractionMode: 'mindmap', rootNodeLabel: 'Mappa B', studySets: [], _pipelineManifest: null, projectId: ID_B,
  classe: '4R', materia: 'Geografia' }, over);
const VISTA_B = { schema: 'mappai-vista@1', semanticGuidance: 'guida di B', timelineEvents: [{ anno: 1815, evento: 'Congresso' }],
  causalDoc: CATENA, causalDocCloni: CLONI, pinned: ['b1', 'non-c-e'] };
const voce = (id, vault, over) => Object.assign({ id: id, name: vault, vault: vault, classDir: '4R', discDir: 'Storia', date: 1788000000000 }, over);
// la copia di B nel cassetto (snapshot di appState)
const copiaB = over => JSON.stringify(Object.assign({ db: Object.assign(nodi('Mappa B'), { causalDoc: CATENA }), rootNodeLabel: 'Mappa B',
  extractionMode: 'mindmap', activeVaultPath: DIR_B, activeVaultClassDir: '4R', activeVaultDiscDir: 'Geografia',
  sources: [{ id: 's-b', type: 'text', name: 'Fonte di B', content: 'Il testo della fonte di B, dalla copia del cassetto.' }] }, over));

function banco(caso = {}) {
  const local = new Map(Object.entries(caso.cassetto || {}));
  if (caso.spento) local.set('mappai_cartella_completa', '0');
  const eventi = [], tutor = [], completa = [], ripristini = [], allarmi = [], registro = [], avvisi = [], letture = [];
  let ctx = null;
  const window = {
    electronAPI: {
      filesRootGet: async () => ({ mapsBaseDir: '/M' }),
      getAllVaults: async () => J(caso.cartelle || []),
      saveVault: async () => ({ success: true }),
      loadVault: async p => {
        letture.push(p);
        const d = (caso.disco || {})[p];
        return d ? { success: true, data: J(d) } : { success: false, error: 'Cartella non trovata' };
      },
      pickFolder: async () => ({ folderPath: caso.scelta }),
      readVaultFile: async () => ({ ok: false, error: 'file non trovato' }),
      saveMapJSON() {}
    },
    addEventListener() {}, showLoadingOverlay() {}, showToast() {},
    showAlert: (titolo, testo) => allarmi.push(titolo + ': ' + testo),
    t: (_k, f) => f, renderStudySets() {}, switchToMapLayout() {}, updateCostDisplay() {},
    updateLayoutButtonLabel: () => eventi.push('etichetta-layout'),
    location: { reload() {} },
    MappAIPipeline: { checkResume() {} },
    MappAIReview: {
      restore: async (vp, stored) => {
        eventi.push('restore:' + vp);
        if (caso.restoreLancia) throw new Error('revisione illeggibile');
        ctx.appState._pipelineManifest = stored || null;
      }
    },
    MappAITeachCore: TC, MappAIFilesCore: FC,
    MappAIClasses: { getActive: () => ({ name: '4R' }), activeDiscipline: () => '', activeStudentName: () => '', activeId: () => 'cls-4r' },
    MappAIVaults: { segnala() {} },
    MappAIElabora: {
      ripristinaFontiDalVault: async vp => { ripristini.push(vp); return 0; },
      flushSourcesToVault: async () => false, fonteInFonti: () => false
    },
    MappAIErrori: { registra: r => { registro.push(r); return r; } },
    StorageManager: function StorageManager() {}   // l'esca: nel browser `window.StorageManager` è la classe nativa
  };
  if (caso.tutor !== false) window.setTutorState = raw => { eventi.push('tutor'); tutor.push(raw == null ? null : J(raw)); };
  if (caso.completa !== false) {
    window.completaFontiDellaCartella = async vp => {
      eventi.push('completa:' + vp); completa.push(vp);
      if (caso.completaLancia) throw new Error('disco pieno');
      return true;
    };
  }
  if (caso.studente) window.electronAPI.__studente = true;
  ctx = vm.createContext({
    window, console: { log() {}, info() {}, warn: (...a) => avvisi.push(a.map(String).join(' ')), error: (...a) => avvisi.push(a.map(String).join(' ')) },
    appState: caso.appState || mappaA(),
    document: { getElementById: () => null }, simulation: null,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => { local.set(k, String(v)); }, removeItem: k => { local.delete(k); },
      get length() { return local.size; }, key: i => [...local.keys()][i] },
    setTimeout: () => 0, clearTimeout() {}, initD3Visualization() {}
  });
  /* il core della vista DENTRO la vm (UMD: si appende al globale della vm) */
  vm.runInContext(JS('mappai-vista-core.js'), ctx);
  window.MappAIVistaCore = ctx.MappAIVistaCore;
  const storage = JS('mappai-storage-lang.js');
  const start = storage.indexOf('const StorageManager = {');
  vm.runInContext(storage.slice(start, storage.indexOf('\n};', start) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  vm.runInContext(JS('mappai-vault-io.js'), ctx);
  vm.runInContext(JS('mappai-vault-manager.js'), ctx);
  return { ctx, window, local, eventi, tutor, completa, ripristini, allarmi, registro, avvisi, letture, s: () => ctx.appState };
}
/* «Riprendi» la mappa B mentre in memoria c'è A (con le sue chat) */
const casoRiprendi = over => Object.assign({
  cassetto: { tutor_ai_projects: JSON.stringify([voce(ID_A, 'Mappa A'), voce(ID_B, 'Mappa B', { discDir: 'Geografia' })]), [ID_B]: copiaB() },
  disco: { [DIR_B]: datiB({ tutorState: CHAT_B }) }
}, over);

// ═══ «Riprendi» e le chat del Tutor (§4.3) ═══════════════════════════════════

test('0078: «Riprendi» B, cartella sua — il Tutor riceve le chat di B dalla cartella, una volta, DOPO il ripristino della revisione', async () => {
  const h = banco(casoRiprendi());
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.allarmi, []);
  assert.deepEqual(h.tutor, [CHAT_B]);
  assert.ok(h.eventi.indexOf('restore:' + DIR_B) >= 0 && h.eventi.indexOf('restore:' + DIR_B) < h.eventi.indexOf('tutor'),
    'prima il ripristino, poi le chat: ' + h.eventi.join(' → '));
  assert.equal(h.letture.length, 1, 'la cartella si legge una volta sola');
});

test('0078: «Riprendi» B, cartella sua senza chat_state.json — il Tutor si azzera (mai le chat di A)', async () => {
  const h = banco(casoRiprendi({ disco: { [DIR_B]: datiB() } }));
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.tutor, [null]);
});

test('0078 M3: «Riprendi» una voce la cui cartella dichiara un altro id — la voce la lascia e il Tutor si azzera', async () => {
  const voceE = voce(ID_A, 'X', { date: 1789000000005 }), voceN = voce(ID_N, 'X', { date: 1789500000000 });
  const h = banco({
    cassetto: { tutor_ai_projects: JSON.stringify([voceN, voceE]),
      [ID_A]: JSON.stringify(mappaA({ rootNodeLabel: 'X', activeVaultPath: DIR_X, activeVaultClassDir: '4R', activeVaultDiscDir: 'Storia' })) },
    cartelle: [{ folderName: 'X', fullPath: DIR_X, classDir: '4R', discDir: 'Storia', projectId: ID_N }],
    disco: { [DIR_X]: datiB({ rootNodeLabel: 'X', projectId: ID_N, tutorState: CHAT_B }) }
  });
  assert.equal(await h.ctx._storage.loadProject(ID_A), true);
  assert.equal(h.s().activeVaultPath, null, 'la voce lascia la cartella dell\'altra mappa (0061, invariato)');
  assert.deepEqual(h.tutor, [null], 'le chat di quella cartella sono dell\'altra mappa');
  assert.deepEqual(h.completa, [], 'nessuna Fonti/ in una cartella che non è sua');
});

test('0078: «Riprendi» un progetto senza cartella — il Tutor si azzera, niente Fonti/ da chiedere', async () => {
  const h = banco(casoRiprendi({ cassetto: { tutor_ai_projects: '[]', [ID_B]: copiaB({ activeVaultPath: null }) } }));
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.tutor, [null]);
  assert.deepEqual(h.completa, []);
});

test('0078: «Riprendi» dal residuo (0076) — le chat vengono dalla STESSA lettura della cartella, nessuna seconda', async () => {
  const residuo = JSON.parse(copiaB());
  residuo.db = { sourcesDict: {}, studySets: [], customColors: {}, causalDoc: CATENA };
  residuo._residuo = { cartella: DIR_B, quando: 1 };
  const h = banco(casoRiprendi({ cassetto: { tutor_ai_projects: JSON.stringify([voce(ID_B, 'Mappa B', { discDir: 'Geografia' })]),
    [ID_B]: JSON.stringify(residuo) } }));
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.tutor, [CHAT_B]);
  assert.equal(h.letture.length, 1, 'una lettura sola: quella anticipata del residuo');
  assert.equal(h.s().db.nodes.length, 3, 'la mappa dalla cartella');
});

test('0078: una riapertura dal residuo che si ferma nel ripristino rimette A — e il Tutor non è stato toccato', async () => {
  const residuo = JSON.parse(copiaB());
  residuo.db = { sourcesDict: {}, studySets: [], customColors: {} };
  residuo._residuo = { cartella: DIR_B, quando: 1 };
  const h = banco(casoRiprendi({ restoreLancia: true,
    cassetto: { tutor_ai_projects: JSON.stringify([voce(ID_B, 'Mappa B', { discDir: 'Geografia' })]), [ID_B]: JSON.stringify(residuo) } }));
  assert.equal(await h.ctx._storage.loadProject(ID_B), false);
  assert.equal(h.s().rootNodeLabel, 'Mappa A', 'la sessione torna com\'era');
  assert.deepEqual(h.tutor, [], 'le chat in memoria restano quelle di A');
  assert.deepEqual(h.completa, []);
});

test('0078: interruttore spento — «Riprendi» non tocca il Tutor né Fonti/ in nessuno dei tre rami (come oggi)', async () => {
  const h1 = banco(casoRiprendi({ spento: true }));
  assert.equal(await h1.ctx._storage.loadProject(ID_B), true);
  const h2 = banco(casoRiprendi({ spento: true, cassetto: { tutor_ai_projects: '[]', [ID_B]: copiaB({ activeVaultPath: null }) } }));
  assert.equal(await h2.ctx._storage.loadProject(ID_B), true);
  for (const h of [h1, h2]) { assert.deepEqual(h.tutor, []); assert.deepEqual(h.completa, []); assert.deepEqual(h.allarmi, []); }
});

test('0078: senza setTutorState e senza completaFontiDellaCartella (banchi di oggi, il reader) — «Riprendi» funziona nei tre rami', async () => {
  for (const extra of [{}, { studente: true }]) {
    const casi = [casoRiprendi(), casoRiprendi({ cassetto: { tutor_ai_projects: '[]', [ID_B]: copiaB({ activeVaultPath: null }) } })];
    for (const c of casi) {
      const h = banco(Object.assign(c, { tutor: false, completa: false }, extra));
      assert.equal(await h.ctx._storage.loadProject(ID_B), true);
      assert.deepEqual(h.allarmi, []);
    }
  }
});

// ═══ «Riprendi» e Fonti/ (§4.4) ═══════════════════════════════════════════════

test('0078 M4: «Riprendi» B, cartella sua — chiede Fonti/ per QUELLA cartella dopo il ripristino, e non svuota mai le fonti in memoria', async () => {
  const h = banco(casoRiprendi());
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.completa, [DIR_B]);
  assert.ok(h.eventi.indexOf('restore:' + DIR_B) < h.eventi.indexOf('completa:' + DIR_B), h.eventi.join(' → '));
  assert.deepEqual(h.ripristini, [], 'ripristinaFontiDalVault non parte: svuoterebbe le fonti');
  assert.deepEqual(J(h.s().sources).map(x => x.id), ['s-b'], 'le fonti della copia restano');
});

test('0078: completaFontiDellaCartella che lancia — «Riprendi» riesce lo stesso, nessun allarme, il registro lo dice', async () => {
  const h = banco(casoRiprendi({ completaLancia: true }));
  assert.equal(await h.ctx._storage.loadProject(ID_B), true);
  assert.deepEqual(h.allarmi, []);
  assert.equal(h.registro.length, 1, JSON.stringify(h.registro));
  assert.deepEqual(J(h.s().sources).map(x => x.id), ['s-b']);
});

// ═══ aperture da cartella: niente eredità dalla mappa di prima (§4.2) ═════════

function eredita(s) { return CAMPI.filter(k => JSON.stringify(s[k]) === JSON.stringify(mappaA()[k])); }

for (const via of ['directLoadVault', 'loadMapVault']) {
  test('0078 M6/M7: ' + via + ' — lo stato di generazione di A si azzera PRIMA, e la cartella vince dopo (consumi, vista)', async () => {
    const h = banco({ scelta: DIR_B, disco: { [DIR_B]: datiB({ generationUsage: { usedModel: 'modello di B' }, vista: VISTA_B, tutorState: CHAT_B }) } });
    if (via === 'loadMapVault') await h.window.loadMapVault(); else await h.window.directLoadVault(DIR_B);
    const s = h.s();
    assert.deepEqual(h.allarmi, []);
    assert.equal(s.activeVaultPath, DIR_B);
    assert.deepEqual(eredita(s), [], 'nessun campo di A sopravvive');
    assert.deepEqual(J(s.generationUsage), { usedModel: 'modello di B' }, 'i consumi della cartella vincono (M7)');
    assert.equal(s.semanticGuidance, 'guida di B', 'la vista della cartella vince');
    assert.equal(s.layoutMode, 'default');
    assert.ok(h.eventi.includes('etichetta-layout'), 'il bottone del layout dice il layout di base, non quello di A');
    assert.equal(s.generationTuned, undefined);
    assert.equal(h.ctx._contestoDellaMappa().materia, 'Geografia', 'la materia di B finirà nel suo index.yaml, non quella di A');
    assert.deepEqual(h.tutor, [CHAT_B]);
  });

  test('0078 M2: ' + via + ' — la vista porta catena, copie e nodi fissati, applicati DOPO i nodi della cartella', async () => {
    const h = banco({ scelta: DIR_B, disco: { [DIR_B]: datiB({ vista: VISTA_B }) } });
    if (via === 'loadMapVault') await h.window.loadMapVault(); else await h.window.directLoadVault(DIR_B);
    const s = h.s();
    assert.deepEqual(J(s.db.causalDoc), CATENA);
    assert.deepEqual(J(s.db.causalDocCloni), CLONI);
    assert.deepEqual(s.db.nodes.map(n => n.pinned === true), [false, true, false], 'b1 fissato; l\'id che manca ignorato');
    assert.deepEqual(J(s.db.timelineEvents), VISTA_B.timelineEvents, 'anche i sei campi di sempre');
  });

  test('0078: ' + via + ' — cartella senza consumi né vista: niente della mappa di prima (consumi null, guida vuota)', async () => {
    const h = banco({ scelta: DIR_B, disco: { [DIR_B]: datiB() } });
    if (via === 'loadMapVault') await h.window.loadMapVault(); else await h.window.directLoadVault(DIR_B);
    const s = h.s();
    assert.deepEqual(eredita(s), []);
    assert.equal(s.generationUsage, null);
    assert.equal(s.semanticGuidance, '');
    assert.equal(s.db.causalDoc, undefined, 'la catena di A non passa (db nuovo)');
  });

  test('0078: interruttore spento — ' + via + ' fa quello che fa oggi', async () => {
    const h = banco({ spento: true, scelta: DIR_B, disco: { [DIR_B]: datiB({ generationUsage: { usedModel: 'modello di B' }, vista: VISTA_B }) } });
    if (via === 'loadMapVault') await h.window.loadMapVault(); else await h.window.directLoadVault(DIR_B);
    const s = h.s();
    assert.equal(s.generationDiscipline, 'Storia', 'oggi la disciplina di A resta');
    assert.deepEqual(J(s._pdfPagine), [{ pages: ['A'] }], 'oggi le pagine di A restano');
    assert.equal(s.db.causalDoc, undefined, 'spento: la catena della vista non si applica');
    assert.ok(s.db.nodes.every(n => n.pinned !== true), 'spento: i nodi fissati della vista non si applicano');
    assert.ok(!h.eventi.includes('etichetta-layout'), 'spento: il bottone del layout non si tocca (come oggi)');
    if (via === 'loadMapVault') {
      assert.deepEqual(J(s.generationUsage), { usedModel: 'modello di A' }, 'oggi «Apri cartella» non legge i consumi');
      assert.equal(s.semanticGuidance, 'guida di A', 'oggi «Apri cartella» non applica la vista');
      assert.equal(s.db.timelineEvents, undefined, 'oggi «Apri cartella» non applica la vista');
    } else {
      assert.deepEqual(J(s.generationUsage), { usedModel: 'modello di B' });
      assert.equal(s.semanticGuidance, 'guida di B', 'la vista di sempre (semanticGuidance è dei sei)');
      assert.deepEqual(J(s.db.timelineEvents), VISTA_B.timelineEvents);
    }
  });
}

test('0078: directLoadVault senza vista nella cartella, interruttore spento — semanticGuidance di A resta (com\'è oggi)', async () => {
  const h = banco({ spento: true, disco: { [DIR_B]: datiB() } });
  await h.window.directLoadVault(DIR_B);
  assert.equal(h.s().semanticGuidance, 'guida di A');
});

test('0078: guardie sui sorgenti — i segnaposti dei test che ritagliano loadProject e StorageManager ci sono ancora, una volta', () => {
  const st = JS('mappai-storage-lang.js');
  for (const s of ['    loadProject: async function', '    deleteProject: function', 'const StorageManager = {'])
    assert.equal(st.split(s).length, 2, s);
  const io = JS('mappai-vault-io.js');
  assert.equal((io.match(/MappAIFontiCore/g) || []).length, 0, 'vault-io non nomina MappAIFontiCore');
  const lp = st.slice(st.indexOf('    loadProject: async function'), st.indexOf('    deleteProject: function'));
  assert.ok(!/ripristinaFontiDalVault/.test(lp), 'loadProject non chiama ripristinaFontiDalVault');
  assert.ok(/window\.setTutorState/.test(lp) && !/[^.]setTutorState\(/.test(lp.replace(/window\.setTutorState\(/g, '')),
    'ogni chiamata passa da window.setTutorState');
});
