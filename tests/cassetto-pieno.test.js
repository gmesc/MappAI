'use strict';
/*
 * cassetto-pieno.test.js — packet 0076 (ADR 0018, punti 1 e 4).
 *
 * Il ramo «cassetto pieno» di `saveCurrentProject` non aveva nessuna prova. Qui gira
 * la fetta VERA di `StorageManager` (mappai-storage-lang.js) in una vm, col harness
 * di tests/identita-cartella.test.js ridotto all'osso:
 *   · `localStorage` è una Map con una QUOTA vera: un `setItem` che la supera lancia
 *     `QuotaExceededError`, e uno spazio liberato si può riusare;
 *   · `electronAPI.saveVault` è una spia che può restare in sospeso (una scrittura in
 *     volo) o rispondere come il main (`success`, `soloVista` del reader, `success:false`,
 *     `review-conflict`); `loadVault` risponde coi dati del caso, al percorso ESATTO;
 *   · `MappAIModal.conferma`, `openCabina`, `showToast`, `MappAIErrori` sono spie;
 *   · un orologio finto, per il limite dei 60 s, e i timer in mano al test (il tetto
 *     dei 60 s di una `saveVault` che non risponde).
 * `MappAIVistaCore` e `MappAITeachCore` sono quelli veri.
 *
 * In coda, un secondo banco: `mappai-cabina.js` vero in una vm, sulla sezione
 * «Gestione cartelle» e su «Libera spazio» (prima nessun test caricava la Cabina,
 * e tre mutanti restavano verdi).
 *
 * L'interruttore è `mappai_cassetto_snello` = '1' (B3): spento, tutto com'è oggi.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TC = require('../public/js/mappai-teach-core.js');
const VC = require('../public/js/mappai-vista-core.js');

const ID = 'proj_1789000000001';
const NOME = 'La carta di Peutinger';
const CARTELLA = '/M/2A/Storia/' + NOME;
const FUORI = '/Users/prova/Desktop/Analisi/' + NOME;      // una cartella fuori da Mappe/ (ADR 0013: «21 …» in Analisi)
const FRASE_SALVATO = 'Il tuo lavoro è salvato nella cartella. L\'app ha solo finito la memoria rapida.';
const FRASE_NON_SALVATO = 'Questo progetto non è stato salvato: la memoria rapida dell\'app è piena e non sono riuscito a scrivere la cartella.';
const TOAST_DI_OGGI = 'Spazio locale esaurito: il progetto NON è stato salvato. La mappa su disco (vault) resta intatta.';
const RAPPORTI = ['_judgeReport', '_giudiceReport', '_coverageReport', '_qualityReport', '_rerankerReport'];

// la mappa a schermo (più nodi e più testo della copia vecchia: la copia nuova non entra)
const mappa = over => Object.assign({
  rootNodeLabel: NOME, extractionMode: 'mindmap',
  activeVaultPath: CARTELLA, activeVaultClassDir: '2A', activeVaultDiscDir: 'Storia',
  db: {
    nodes: [{ id: 'root', label: NOME, desc: 'y'.repeat(6000), level: 0 }, { id: 'a', label: 'Ramo nuovo', desc: 'Spostato adesso.', level: 1 }],
    links: [{ source: 'root', target: 'a', rel: 'include' }], sourcesDict: {}, studySets: [], customColors: {}
  }
}, over);
// ciò che la cartella non ha: le fonti (una foto in attesa compresa), le pagine, i rapporti
const FOTO_ATTESA = { titolo: 'Una foto non ancora lanciata', nomeFile: 'attesa.jpg', fotoB64: 'F'.repeat(300) };
const extra = over => Object.assign({
  sources: [{ id: 'src_txt', type: 'pdf', content: 'Il testo estratto dalla fonte.', file: {} },
    { id: 'src_foto', type: 'doc', content: '', file: {}, _scheda: FOTO_ATTESA }],
  _pdfPagine: [{ nome: 'scheda.pdf', pages: [{ n: 1, text: 'Pagina uno.' }] }],
  _generationSources: [{ id: 'text-0', type: 'text', content: 'Testo incollato.' }],
  _reviewRevision: 'rev-1'
}, Object.fromEntries(RAPPORTI.map(k => [k, { rami: [{ esito: 'ok' }] }])), over);
// la copia di PRIMA nel cassetto: grossa, con un nodo solo
const COPIA_VECCHIA = JSON.stringify({ rootNodeLabel: NOME, activeVaultPath: CARTELLA, activeVaultClassDir: '2A', activeVaultDiscDir: 'Storia',
  db: { nodes: [{ id: 'root', label: NOME, desc: 'x'.repeat(5000), level: 0 }], links: [] } });
const VOCE = { id: ID, name: NOME, vault: NOME, classDir: '2A', discDir: 'Storia', date: 1788000000000 };
// la cartella sul disco, come la restituisce `load-vault` (main.js)
const datiCartella = over => Object.assign({ projectId: ID, rootNodeLabel: NOME, extractionMode: 'mindmap', sourcesDict: {},
  nodes: [{ id: 'root', label: NOME, desc: 'Dalla cartella.', level: 0 }, { id: 'a', label: 'Ramo nuovo', level: 1 }, { id: 'b', label: 'Ramo dal disco', level: 1 }],
  links: [{ source: 'root', target: 'a', rel: 'include' }, { source: 'root', target: 'b', rel: 'include' }], _pipelineManifest: null }, over);

function harness(caso = {}) {
  let ora = caso.ora || 1790000000000;
  class OrologioFinto extends Date {
    constructor(...a) { if (a.length) super(...a); else super(ora); }
    static now() { return ora; }
  }
  const local = new Map(Object.entries(Object.assign({ tutor_ai_projects: JSON.stringify([VOCE]), [ID]: COPIA_VECCHIA }, caso.cassetto || {})));
  if (caso.acceso !== false) local.set('mappai_cassetto_snello', '1');
  const peso = () => { let t = 0; for (const [k, v] of local) t += k.length + v.length; return t; };
  const spie = { saveVault: [], finestre: [], cabina: [], toast: [], registro: [], controlli: [], aperture: [], scritteLS: [],
    allarmi: [], letture: [], segnate: 0 };
  const sospese = [], timer = [];
  let ctx = null;
  const window = {
    electronAPI: {
      saveVault: o => {
        spie.saveVault.push({ folderPath: o.folderPath, nodi: (o.mapData && o.mapData.nodes || []).length });
        if (caso.sospeso) return new Promise((res, rej) => sospese.push({ res, rej }));
        if (caso.lancia) return Promise.reject(new Error(caso.lancia));
        return Promise.resolve(caso.esito || { success: true });
      },
      loadVault: async p => {
        spie.letture.push(p);
        const d = (caso.disco || {})[p];
        return d ? { success: true, data: JSON.parse(JSON.stringify(d)) } : { success: false, error: 'Cartella non trovata' };
      },
      saveMapJSON() {},
      filesRootGet: async () => ({ mapsBaseDir: '/M' }),
      getAllVaults: async () => JSON.parse(JSON.stringify(caso.cartelle || [{ folderName: NOME, fullPath: CARTELLA, classDir: '2A', discDir: 'Storia' }]))
    },
    t: (_k, f) => f,
    showToast: (m, k) => spie.toast.push({ m, k }),
    showAlert: (a, b) => spie.allarmi.push(a + ': ' + b),
    showLoadingOverlay() {}, switchToMapLayout() {}, addEventListener() {},
    MappAITeachCore: TC, MappAIVistaCore: VC,
    buildVaultMapData: () => ({ nodes: ctx.appState.db.nodes, links: ctx.appState.db.links, rootNodeLabel: ctx.appState.rootNodeLabel }),
    directLoadVault: p => spie.aperture.push(p),
    openCabina: (v, o) => spie.cabina.push([v, o]),
    MappAIModal: { conferma: o => { spie.finestre.push(o); return Promise.resolve(!!caso.siRisponde); } },
    MappAIErrori: { registra: r => spie.registro.push(r), controllaCassetto: (...a) => spie.controlli.push(a),
      segnaFinestraCassetto: () => { spie.segnate++; } },
    MappAIReview: { restore: async (p, stored) => {
      if (caso.restoreLancia) throw new Error(caso.restoreLancia);
      ctx.appState._pipelineManifest = stored || null;
    } },
    MappAIGen: { attiva: () => !!h.generando },
    MappAIPipeline: { occupata: () => !!h.pipeline, checkResume() {} },
    StorageManager: function StorageManager() {}   // l'esca: nel browser `window.StorageManager` è la classe nativa
  };
  if (caso.lettore) delete window.MappAIErrori;   // il reader non carica mappai-errori.js (MappAIModal sì)
  ctx = vm.createContext({
    window, Date: OrologioFinto, console: { log() {}, warn() {}, error() {} },
    appState: caso.appState || mappa(),
    document: { getElementById: () => null }, simulation: null,
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => {
        v = String(v);
        const vecchio = local.has(k) ? k.length + local.get(k).length : 0;
        if (peso() - vecchio + k.length + v.length > h.quota) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
        spie.scritteLS.push(k); local.set(k, v);
      },
      removeItem: k => { spie.scritteLS.push('-' + k); local.delete(k); },
      get length() { return local.size; }, key: i => [...local.keys()][i]
    },
    setTimeout: (fn, ms) => { timer.push({ fn, ms }); return timer.length; },
    clearTimeout: n => { if (timer[n - 1]) timer[n - 1].via = true; },
    initD3Visualization() {}
  });
  const storage = fs.readFileSync(path.join(__dirname, '../public/js/mappai-storage-lang.js'), 'utf8');
  const start = storage.indexOf('const StorageManager = {');
  vm.runInContext(storage.slice(start, storage.indexOf('\n};', start) + 3) + '\nglobalThis._storage = StorageManager;', ctx);
  ctx._storage.currentProjectId = ID;
  const h = {
    ctx, local, spie, generando: false, pipeline: false,
    // pieno: niente spazio oltre a quello che c'è già (la copia nuova è più grande della vecchia)
    quota: caso.quota !== undefined ? caso.quota : (peso() + 200),
    peso,
    salva: () => ctx._storage.saveCurrentProject(),
    avanza: ms => { ora += ms; },
    rispondi: (esito, i = 0) => sospese[i].res(esito),
    // i timer del tetto (60 s) che non sono stati spenti
    scadono: () => timer.filter(x => x.ms === 60000 && !x.via).forEach(x => { x.via = true; x.fn(); }),
    voci: () => JSON.parse(local.get('tutor_ai_projects') || '[]'),
    copia: () => JSON.parse(local.get(ID)),
    flush: async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); }
  };
  return h;
}
const testi = h => h.spie.finestre.map(f => f.testo);
const registroCon = (h, re) => h.spie.registro.filter(r => re.test(r.messaggio)).length;

// ── spento = oggi ─────────────────────────────────────────────────────────────
test('0076 M7: interruttore SPENTO, cassetto pieno — il toast di oggi a ogni salvataggio, nessuna cartella, nessuna finestra', async () => {
  const h = harness({ acceso: false });
  for (let i = 0; i < 3; i++) h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 0, 'oggi il ramo pieno non scrive la cartella');
  assert.deepEqual(h.spie.finestre, []);
  assert.deepEqual(h.spie.toast.map(x => x.m), [TOAST_DI_OGGI, TOAST_DI_OGGI, TOAST_DI_OGGI]);
  assert.ok(h.spie.toast.every(x => x.k === 'error'));
  assert.equal(registroCon(h, /^SALVATAGGIO PERSO/), 3, 'la riga del registro, come oggi');
  assert.equal(JSON.stringify(h.spie.controlli[0]), JSON.stringify(['salvataggio perso', true]), 'stessa chiamata di oggi');
  assert.equal(h.local.get(ID), COPIA_VECCHIA, 'la copia di prima resta');
});

test('0076 M7: interruttore SPENTO, salvataggio normale — la copia è quella di oggi (statoSnello senza opzioni)', () => {
  const st = mappa({ _pipelineManifest: { config: {}, steps: {} }, _evidenze: { frasi: [1] }, _judgeReport: { r: 1 } });
  const h = harness({ acceso: false, quota: Infinity, appState: st });
  h.salva();
  assert.equal(h.local.get(ID), JSON.stringify(VC.statoSnello(st)));
  assert.ok(h.copia()._pipelineManifest, 'il manifesto resta nella copia, come oggi');
});

// ── acceso, salvataggio normale ───────────────────────────────────────────────
test('0076: acceso, salvataggio normale — la copia è snella, lo stato vivo resta intero', () => {
  const sch = { titolo: NOME, nomeFile: 'peutinger.jpg', fotoB64: 'F'.repeat(50000) };
  const st = mappa({ sources: [{ id: 'f', type: 'doc', _scheda: sch }], _pipelineManifest: { config: { dossier: sch }, steps: {} },
    _evidenze: { frasi: [1] }, _judgeReport: { r: 1 }, _reviewRevision: 'rev-1' });
  const h = harness({ quota: Infinity, appState: st });
  h.salva();
  const copia = h.copia();
  assert.ok(!('_pipelineManifest' in copia) && !('_evidenze' in copia));
  assert.deepEqual(copia._judgeReport, { r: 1 }, 'M11: il rapporto resta');
  assert.deepEqual(copia.sources, [], 'la fonte-foto del dossier partito è sul disco');
  assert.equal(copia._reviewRevision, 'rev-1');
  assert.equal(h.ctx.appState.sources[0]._scheda.fotoB64.length, 50000, 'in appState la foto c\'è ancora');
  assert.ok(h.ctx.appState._pipelineManifest, 'e il manifesto anche');
  assert.equal(h.voci()[0].id, ID, 'l\'indice dopo la copia, come prima');
});

// ── acceso, cassetto pieno ────────────────────────────────────────────────────
test('0076 M6/M4: dieci renderGraph di fila — UNA scrittura della cartella, UNA finestra, e solo dopo la risposta', async () => {
  const h = harness({ sospeso: true });
  for (let i = 0; i < 10; i++) h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'una sola saveVault');
  assert.deepEqual(h.spie.saveVault[0], { folderPath: CARTELLA, nodi: 2 }, 'la cartella del progetto aperto, con la mappa a schermo');
  assert.deepEqual(h.spie.finestre, [], 'M4: niente «salvato» prima che la cartella sia scritta');
  assert.equal(h.local.get(ID), COPIA_VECCHIA, 'il residuo aspetta la risposta');
  h.rispondi({ success: true });
  await h.flush();
  assert.deepEqual(testi(h), [FRASE_SALVATO]);
  assert.equal(h.spie.finestre[0].conferma, 'Libera spazio ora');
  assert.equal(h.spie.finestre[0].annulla, 'Chiudi');
  for (let i = 0; i < 10; i++) h.salva();
  await h.flush();
  assert.equal(h.spie.finestre.length, 1, 'la finestra si mostra una volta');
  assert.equal(h.spie.toast.filter(x => x.m === TOAST_DI_OGGI).length, 0, 'il toast di oggi non esce più');
});

test('0076 M6: una scrittura in volo da più di 60 s non ne fa partire una seconda', async () => {
  const h = harness({ sospeso: true });
  h.salva();
  h.avanza(61000);
  h.salva(); h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'mai due saveVault in volo');
  h.rispondi({ success: true });
  await h.flush();
  h.local.set(ID, COPIA_VECCHIA); h.quota = 0;   // il cassetto è di nuovo pieno
  h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 2, 'finita la prima, e passati 60 s, la seconda parte');
});

test('0076: una saveVault che non risponde — al tetto dei 60 s la finestra «non salvato», e nessuna seconda finché la prima non si chiude', async () => {
  const h = harness({ sospeso: true });
  h.salva();
  await h.flush();
  assert.deepEqual(h.spie.finestre, []);
  h.scadono();
  await h.flush();
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO], 'chi lavora lo sa');
  assert.equal(registroCon(h, /non ha risposto/), 1, 'e il registro lo dice');
  h.avanza(61000);
  h.salva(); h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'M6: la prima è ancora in volo');
  h.rispondi({ success: false, error: 'EIO' });   // tardi, e fallita: sblocca la guardia (il successo tardivo ha il suo test)
  await h.flush();
  assert.equal(h.local.get(ID), COPIA_VECCHIA);
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO], 'la finestra non si ripete');
  h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 2, 'chiusa la prima, la guardia è sbloccata');
});

test('0076: non più di una scrittura ogni 60 s', async () => {
  const h = harness({});
  h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 1);
  h.local.set(ID, COPIA_VECCHIA);    // il cassetto torna pieno
  h.quota = 0;
  h.avanza(30000); h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'dopo 30 s no');
  h.avanza(31000); h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 2, 'dopo 61 s sì');
});

// ── B1 = il residuo (Giacomo, 05/10) ──────────────────────────────────────────
test('0076 M9: cartella scritta — al posto della copia vecchia il RESIDUO: segno e percorso esatto, senza nodi e collegamenti, col resto', async () => {
  const st = mappa(extra());
  const h = harness({ appState: st });
  h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 1);
  assert.ok(h.local.has(ID), 'mai una copia tolta senza il residuo al suo posto');
  const r = h.copia();
  assert.equal(r._residuo && r._residuo.cartella, CARTELLA, 'il percorso ESATTO della cartella scritta');
  assert.match(String(r._residuo.quando), /^\d{4}-\d\d-\d\dT/);
  assert.ok(!('nodes' in r.db) && !('links' in r.db), 'nodi e collegamenti stanno nella cartella');
  assert.deepEqual(r.sources.map(x => x.id), ['src_txt', 'src_foto'], 'le fonti restano');
  assert.equal(r.sources[0].content, 'Il testo estratto dalla fonte.');
  assert.equal(r.sources[1]._scheda.fotoB64, FOTO_ATTESA.fotoB64, 'la fonte-foto in attesa, foto compresa: unica copia');
  assert.deepEqual(r._pdfPagine, st._pdfPagine);
  assert.deepEqual(r._generationSources, st._generationSources);
  RAPPORTI.forEach(k => assert.deepEqual(r[k], st[k], k));
  assert.equal(r._reviewRevision, 'rev-1');
  const voce = h.voci().find(v => v.id === ID);
  assert.ok(voce, 'la riga d\'indice resta (inv. 20, ADR 0013)');
  assert.equal(voce.nodesCount, 2, 'e porta la mappa scritta adesso (dopo la copia: «copia, poi indice»)');
  assert.ok(!voce.superata);
  assert.equal(h.ctx._storage.currentProjectId, ID, 'l\'identità non cambia');
  assert.deepEqual(testi(h), [FRASE_SALVATO]);
});

test('0076 M9: il residuo NON entra — la copia vecchia resta intera, la riga d\'indice riceve «superata» col percorso esatto', async () => {
  const st = mappa(extra({ sources: [{ id: 'src_foto', type: 'doc', _scheda: Object.assign({}, FOTO_ATTESA, { fotoB64: 'F'.repeat(20000) }) }] }));
  const h = harness({ appState: st });
  h.salva();
  await h.flush();
  assert.equal(h.local.get(ID), COPIA_VECCHIA, 'la copia vecchia, intera: mai tolta senza un residuo');
  const voce = h.voci().find(v => v.id === ID);
  assert.deepEqual(Object.keys(voce.superata).sort(), ['cartella', 'copia', 'quando']);
  assert.equal(voce.superata.cartella, CARTELLA);
  assert.equal(voce.superata.copia, COPIA_VECCHIA.length, 'l\'impronta della copia che la cartella ha superato');
  assert.equal(voce.vault, NOME, 'il resto della riga è quello di prima');
  assert.deepEqual(testi(h), [FRASE_SALVATO], 'la cartella è scritta: è vero');
});

test('0076: non entra nemmeno l\'indice — una riga nel registro, e tutto resta come oggi', async () => {
  const st = mappa(extra({ sources: [{ id: 'src_foto', type: 'doc', _scheda: Object.assign({}, FOTO_ATTESA, { fotoB64: 'F'.repeat(20000) }) }] }));
  const h = harness({ appState: st, quota: 0 });
  h.quota = h.peso();
  h.salva();
  await h.flush();
  assert.equal(h.local.get(ID), COPIA_VECCHIA);
  assert.equal(h.local.get('tutor_ai_projects'), JSON.stringify([VOCE]), 'indice di prima');
  assert.equal(registroCon(h, /né il residuo né il segno/), 1);
});

test('0076 M10: riapertura da un residuo con la cartella FUORI da Mappe/ — nodi dalla cartella al percorso esatto, fonti dal residuo', async () => {
  const residuo = VC.residuo(VC.statoSnello(mappa(extra({ activeVaultPath: FUORI, activeVaultClassDir: null, activeVaultDiscDir: null })), { snello: true }),
    { cartella: FUORI, quando: '2026-10-05T10:00:00.000Z' });
  const h = harness({ quota: Infinity, cartelle: [], disco: { [FUORI]: datiCartella() },
    cassetto: { tutor_ai_projects: JSON.stringify([Object.assign({}, VOCE, { classDir: null, discDir: null })]), [ID]: JSON.stringify(residuo) },
    appState: mappa({ rootNodeLabel: 'Un\'altra mappa', activeVaultPath: '/M/X/Y/Altra' }) });
  h.ctx._storage.currentProjectId = 'proj_1789000000777';
  const esito = await h.ctx._storage.loadProject(ID);
  await h.flush();
  assert.equal(esito, true);
  assert.deepEqual(h.spie.allarmi, []);
  assert.deepEqual(h.spie.aperture, [], 'non si cerca in Mappe/ per nome');
  assert.deepEqual(h.spie.letture, [FUORI], 'si legge la cartella al percorso esatto');
  const a = h.ctx.appState;
  // `[...]`: l'array nasce nella vm, e il confronto stretto guarda anche il prototipo
  assert.deepEqual([...a.db.nodes.map(n => n.id)], ['root', 'a', 'b'], 'i nodi dalla cartella');
  assert.equal(a.db.links.length, 2, 'i collegamenti dalla cartella');
  assert.deepEqual([...a.sources.map(x => x.id)], ['src_txt', 'src_foto'], 'le fonti dal residuo');
  assert.equal(a.sources[1]._scheda.fotoB64, FOTO_ATTESA.fotoB64, 'la fonte-foto in attesa, intera');
  assert.equal(a._pdfPagine.length, 1);
  assert.ok(a._judgeReport, 'i rapporti dal residuo');
  assert.equal(a.activeVaultPath, FUORI);
  assert.ok(!('_residuo' in a), 'al salvataggio dopo torna una copia normale');
  assert.equal(h.ctx._storage.currentProjectId, ID, 'identità invariata');
  assert.equal(h.ctx._storage.idInCartella && h.ctx._storage.idInCartella.percorso, FUORI);
  // il salvataggio dopo: una copia normale, coi nodi
  h.salva();
  const copia = h.copia();
  assert.ok(!('_residuo' in copia));
  assert.equal(copia.db.nodes.length, 3);
});

test('0076: riapertura da una copia «superata» — i nodi dalla cartella al percorso esatto, il resto dalla copia; un\'impronta che non torna non vale', async (t) => {
  const voceSup = Object.assign({}, VOCE, { superata: { cartella: CARTELLA, quando: '2026-10-05T10:00:00.000Z', copia: COPIA_VECCHIA.length } });
  await t.test('impronta giusta: la cartella vince sui nodi', async () => {
    const h = harness({ quota: Infinity, disco: { [CARTELLA]: datiCartella() }, cassetto: { tutor_ai_projects: JSON.stringify([voceSup]) } });
    assert.equal(await h.ctx._storage.loadProject(ID), true);
    assert.deepEqual([...h.ctx.appState.db.nodes.map(n => n.id)], ['root', 'a', 'b']);
    assert.equal(h.ctx.appState.rootNodeLabel, NOME);
    assert.deepEqual(h.spie.allarmi, []);
  });
  await t.test('la copia è stata riscritta dopo il segno: i suoi nodi, come oggi', async () => {
    const h = harness({ quota: Infinity, disco: { [CARTELLA]: datiCartella() },
      cassetto: { tutor_ai_projects: JSON.stringify([Object.assign({}, voceSup, { superata: Object.assign({}, voceSup.superata, { copia: 1 }) })]) } });
    assert.equal(await h.ctx._storage.loadProject(ID), true);
    assert.deepEqual([...h.ctx.appState.db.nodes.map(n => n.id)], ['root']);
  });
});

// ── 0076, terzo giro: la riapertura fallita da un residuo lascia la sessione COM'ERA ──
// Prima lo stato veniva sostituito e poi controllato: dopo lo stop restavano 0 nodi
// e `activeVaultPath` sulla cartella (anche di un altro progetto), e HOME
// (`backToLanding`, mappai-ui-canvas.js) avrebbe scritto una mappa vuota lì.
const ALTRA = '/M/2A/Storia/Una mappa aperta';
const sessione = () => mappa({ rootNodeLabel: 'Una mappa aperta', activeVaultPath: ALTRA });
function residuoDi(cartella) {
  return JSON.stringify(VC.residuo(VC.statoSnello(mappa(extra({ activeVaultPath: cartella })), { snello: true }), { cartella: cartella, quando: 'q' }));
}
// le due frasi che il docente legge (mappai-storage-lang.js, `cp_residuo_vuota` · `cp_residuo_altra`)
const DICE_VUOTA = /Impossibile caricare il progetto: la sua cartella non ha la mappa, e la memoria rapida nemmeno\.$/;
const DICE_ALTRA = /Impossibile caricare il progetto: la sua cartella ora dichiara un altro progetto, e la memoria rapida non ha la mappa\.$/;
async function riaperturaFallita(h, frase) {
  const prima = h.ctx.appState, idPrima = h.ctx._storage.currentProjectId, icPrima = h.ctx._storage.idInCartella;
  const esito = await h.ctx._storage.loadProject(ID);
  await h.flush();
  assert.equal(esito, false);
  assert.equal(h.spie.allarmi.length, 1, 'si dice');
  if (frase) assert.match(h.spie.allarmi[0], frase, 'con la frase vera, non con un errore tecnico');
  assert.equal(h.ctx.appState, prima, 'lo stato è LO STESSO oggetto di prima');
  assert.equal(h.ctx._storage.currentProjectId, idPrima, 'l\'identità della sessione non cambia');
  assert.equal(h.ctx._storage.idInCartella, icPrima);
  assert.equal(h.ctx.appState.activeVaultPath, ALTRA);
  assert.equal(h.ctx.appState.db.nodes.length, 2, 'la mappa aperta ha ancora i suoi nodi');
  assert.ok(!h.ctx.appState._reviewRestoreError && !h.ctx.appState._reviewRestoring, 'e nessun blocco dei salvataggi');
  assert.ok(h.local.has(ID) && h.copia()._residuo, 'il residuo resta nel cassetto');
  // HOME, come `backToLanding`: la cartella si scrive con la mappa a schermo, mai vuota, mai in casa d'altri
  const a = h.ctx.appState;
  if (a.activeVaultPath) await h.ctx.window.electronAPI.saveVault({ folderPath: a.activeVaultPath, mapData: h.ctx.window.buildVaultMapData() });
  assert.deepEqual(h.spie.saveVault[h.spie.saveVault.length - 1], { folderPath: ALTRA, nodi: 2 });
}

test('0076 M18: riapertura da un residuo la cui cartella dichiara un ALTRO progetto — si dice, e la sessione resta com\'era', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), disco: { [CARTELLA]: datiCartella({ projectId: 'proj_1789000000999' }) },
    cassetto: { [ID]: residuoDi(CARTELLA) } });
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  await riaperturaFallita(h, DICE_ALTRA);
});

test('0076 M12b/M18: residuo con la cartella che esiste ma è SENZA nodi — falso, un avviso, nessuna mappa vuota', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), disco: { [CARTELLA]: datiCartella({ nodes: [], links: [] }) },
    cassetto: { [ID]: residuoDi(CARTELLA) } });
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  await riaperturaFallita(h, DICE_VUOTA);
});

test('0076 M12c/M18: residuo SENZA il modo di leggere la cartella — falso, un avviso con la frase vera, nessuna mappa vuota', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), cassetto: { [ID]: residuoDi(CARTELLA) } });
  h.ctx.window.electronAPI.loadVault = undefined;
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  // senza la guardia, `loadVault` mancante lancerebbe un TypeError e l'avviso direbbe «… is not a function»
  await riaperturaFallita(h, DICE_VUOTA);
});

test('0076 M18: residuo con la cartella che non si legge — falso, e la sessione resta com\'era', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), disco: {}, cassetto: { [ID]: residuoDi(CARTELLA) } });
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  await riaperturaFallita(h);
});

test('0076 M18: residuo, la revisione non si riconcilia (R.restore lancia) — si rimette tutto com\'era', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), restoreLancia: 'revisione illeggibile',
    disco: { [CARTELLA]: datiCartella() }, cassetto: { [ID]: residuoDi(CARTELLA) } });
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  await riaperturaFallita(h);
});

test('0076 reg1: riapertura NORMALE (niente residuo, niente «superata») con la cartella che ha altri nodi — vince la copia, come oggi, con una lettura sola', async () => {
  const h = harness({ quota: Infinity, disco: { [CARTELLA]: datiCartella() } });
  assert.equal(await h.ctx._storage.loadProject(ID), true);
  assert.deepEqual([...h.ctx.appState.db.nodes.map(n => n.id)], ['root'], 'i nodi della copia');
  assert.equal(h.ctx.appState.activeVaultPath, CARTELLA, 'il percorso della copia');
  assert.deepEqual(h.spie.letture, [CARTELLA], 'una lettura sola, quella di oggi');
  assert.deepEqual(h.spie.allarmi, []);
});

// ── il segno `_apreDallaCartella`: blocca un secondo `loadProject` durante la
// lettura anticipata, e si toglie SEMPRE (anche se la lettura lancia) ──────────
const ID_SECONDA = 'proj_1789000000002';
const COPIA_SECONDA = JSON.stringify({ rootNodeLabel: 'Seconda', db: { nodes: [{ id: 'r2', label: 'Seconda', level: 0 }], links: [] } });
const VOCE_SECONDA = { id: ID_SECONDA, name: 'Seconda', vault: null, date: 1787000000000 };

test('0076 M19a: una riapertura dal residuo RIUSCITA, poi un loadProject normale — funziona (il segno non resta appeso)', async () => {
  const h = harness({ quota: Infinity, disco: { [CARTELLA]: datiCartella() },
    cassetto: { tutor_ai_projects: JSON.stringify([VOCE, VOCE_SECONDA]), [ID]: residuoDi(CARTELLA), [ID_SECONDA]: COPIA_SECONDA } });
  assert.equal(await h.ctx._storage.loadProject(ID), true);
  await h.flush();
  assert.equal(await h.ctx._storage.loadProject(ID_SECONDA), true, 'il segno non resta appeso');
  assert.equal(h.ctx._storage.currentProjectId, ID_SECONDA);
});

test('0076 M19a: la lettura anticipata LANCIA (indice illeggibile), poi un loadProject normale — funziona (il segno si toglie anche dopo un\'eccezione)', async () => {
  const h = harness({ quota: Infinity, appState: sessione(), disco: { [CARTELLA]: datiCartella() },
    cassetto: { tutor_ai_projects: '{{', [ID]: residuoDi(CARTELLA), [ID_SECONDA]: COPIA_SECONDA } });
  h.ctx._storage.currentProjectId = 'proj_1789000000555';
  assert.equal(await h.ctx._storage.loadProject(ID), false, 'l\'indice illeggibile ferma la decisione d\'identità');
  assert.equal(h.ctx.appState.rootNodeLabel, 'Una mappa aperta', 'la sessione è quella di prima');
  h.local.set('tutor_ai_projects', JSON.stringify([VOCE, VOCE_SECONDA]));
  assert.equal(await h.ctx._storage.loadProject(ID_SECONDA), true, 'il segno non resta appeso dopo un\'eccezione');
});

test('0076 M19b: un secondo loadProject mentre il primo legge la cartella del residuo — non parte', async () => {
  const h = harness({ quota: Infinity, disco: { [CARTELLA]: datiCartella() },
    cassetto: { tutor_ai_projects: JSON.stringify([VOCE, VOCE_SECONDA]), [ID]: residuoDi(CARTELLA), [ID_SECONDA]: COPIA_SECONDA } });
  const a = h.ctx._storage.loadProject(ID);
  const b = h.ctx._storage.loadProject(ID_SECONDA);
  assert.equal(await b, false, 'la guardia d\'ingresso lo ferma');
  assert.equal(await a, true);
  assert.equal(h.ctx._storage.currentProjectId, ID, 'alla fine è aperto il primo');
});

test('0076 d5: residuo con la cartella SENZA id, sessione su un\'altra classe con una voce omonima più recente — conta la posizione del residuo', async () => {
  // la sessione aperta è su 3B/Geo, e lì c'è una voce omonima più recente: se la posizione
  // si prendesse dalla sessione invece che dal residuo (2A/Storia), l'id non si scriverebbe
  const omonima = { id: 'proj_1789000000003', name: NOME, vault: NOME, classDir: '3B', discDir: 'Geo', date: 1789500000000 };
  const h = harness({ quota: Infinity,
    appState: mappa({ rootNodeLabel: 'Altra', activeVaultPath: '/M/3B/Geo/Altra', activeVaultClassDir: '3B', activeVaultDiscDir: 'Geo' }),
    disco: { [CARTELLA]: datiCartella({ projectId: undefined }) },
    cassetto: { tutor_ai_projects: JSON.stringify([VOCE, omonima]), [ID]: residuoDi(CARTELLA) } });
  assert.equal(await h.ctx._storage.loadProject(ID), true);
  assert.equal(h.ctx._storage.idInCartella && h.ctx._storage.idInCartella.id, ID, 'la cartella senza id riceve quello della voce riaperta');
  assert.equal(h.ctx._storage.currentProjectId, ID);
});

// ── «una volta» = una volta per PROGETTO ──────────────────────────────────────
test('0076 X1: N salvataggi di un progetto SENZA cartella danno UNA finestra', async () => {
  const h = harness({ appState: mappa({ activeVaultPath: null }), cassetto: { tutor_ai_projects: JSON.stringify([Object.assign({}, VOCE, { vault: null })]) } });
  for (let i = 0; i < 5; i++) { h.salva(); h.avanza(61000); }
  await h.flush();
  assert.equal(h.spie.saveVault.length, 0, 'non si crea una cartella da qui (mai ensureProjectVault)');
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO]);
  assert.equal(h.local.get(ID), COPIA_VECCHIA, 'la copia, unica, resta');
});

test('0076 X1: due scritture riuscite a più di 60 s l\'una dall\'altra danno UNA finestra; un altro progetto ha la sua', async () => {
  const h = harness({});
  h.salva(); await h.flush();
  h.local.set(ID, COPIA_VECCHIA); h.quota = 0;
  h.avanza(61000); h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 2);
  assert.deepEqual(testi(h), [FRASE_SALVATO], 'una volta per progetto');
  // un altro progetto, nella stessa sessione
  h.ctx._storage.currentProjectId = 'proj_1789000000002';
  h.ctx.appState.activeVaultPath = null;
  h.salva(); await h.flush();
  assert.deepEqual(testi(h), [FRASE_SALVATO, FRASE_NON_SALVATO]);
});

test('0076 M15a: due progetti DIVERSI con la STESSA finestra — una ciascuno (per progetto, non per sessione)', async (t) => {
  await t.test('tutti e due senza cartella: due «non salvato»', async () => {
    const h = harness({ appState: mappa({ activeVaultPath: null }) });
    h.salva(); await h.flush();
    h.ctx._storage.currentProjectId = 'proj_1789000000002';
    h.salva(); await h.flush();
    assert.deepEqual(testi(h), [FRASE_NON_SALVATO, FRASE_NON_SALVATO]);
  });
  await t.test('tutti e due con la cartella scritta: due «salvato»', async () => {
    const h = harness({});
    h.salva(); await h.flush();
    const ID2 = 'proj_1789000000002', CART2 = '/M/2A/Storia/Seconda';
    h.ctx._storage.currentProjectId = ID2;
    h.ctx.appState.activeVaultPath = CART2;
    h.local.set('tutor_ai_projects', JSON.stringify(h.voci().concat([Object.assign({}, VOCE, { id: ID2, vault: 'Seconda' })])));
    h.local.set(ID2, COPIA_VECCHIA);
    h.quota = 0;
    h.avanza(61000); h.salva(); await h.flush();
    assert.equal(h.spie.saveVault.length, 2);
    assert.deepEqual(testi(h), [FRASE_SALVATO, FRASE_SALVATO]);
  });
});

test('0076 E6: la scrittura in volo è di un ALTRO progetto — niente seconda saveVault, e il secondo progetto sente «non salvato»', async () => {
  const h = harness({ sospeso: true });
  h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 1);
  h.ctx._storage.currentProjectId = 'proj_1789000000002';
  h.ctx.appState.activeVaultPath = '/M/2A/Storia/Seconda';
  h.avanza(61000); h.salva(); h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'mai due in volo');
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO], 'e il secondo progetto non resta muto');
});

// ── 0076, terzo giro: la risposta che arriva DOPO il tetto, e la copia di T0 ──
test('0076: successo IN RITARDO, dopo il tetto, con la copia ancora quella di T0 — il residuo si posa, e la finestra dice «salvato»', async () => {
  const h = harness({ sospeso: true, appState: mappa(extra()) });
  h.salva(); await h.flush();
  h.scadono(); await h.flush();
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO]);
  h.rispondi({ success: true }); await h.flush();
  assert.ok(h.copia()._residuo, 'la cartella ha i nodi nuovi: al posto della copia vecchia il residuo');
  assert.equal(h.copia()._residuo.cartella, CARTELLA);
  assert.deepEqual(testi(h), [FRASE_NON_SALVATO, FRASE_SALVATO], '«non salvato» non resta l\'ultima parola sbagliata');
});

test('0076 M17: la copia CAMBIA durante la scrittura (una copia nuova, T1) — niente residuo, l\'indice non si tocca, una riga nel registro', async (t) => {
  for (const ritardo of [false, true]) {
    await t.test(ritardo ? 'successo dopo il tetto' : 'successo in tempo', async () => {
      const h = harness({ sospeso: true, appState: mappa(extra()) });
      h.salva(); await h.flush();
      if (ritardo) { h.scadono(); await h.flush(); }
      const T1 = JSON.stringify({ activeVaultPath: CARTELLA, db: { nodes: [{ id: 'root' }, { id: 'nuovo' }], links: [] } });
      const indice = h.local.get('tutor_ai_projects');
      h.local.set(ID, T1);      // si è liberato spazio: un salvataggio normale ha scritto una copia più nuova
      h.rispondi({ success: true }); await h.flush();
      assert.equal(h.local.get(ID), T1, 'la copia più nuova non si schiaccia col residuo di T0');
      assert.equal(h.local.get('tutor_ai_projects'), indice, 'l\'indice non si tocca');
      assert.equal(registroCon(h, /copia è cambiata/), 1);
    });
  }
});

test('0076 M17: il progetto viene ELIMINATO durante la scrittura — non rinasce', async () => {
  const h = harness({ sospeso: true, appState: mappa(extra()) });
  h.salva(); await h.flush();
  h.local.delete(ID);                                        // deleteProject: via la copia e la riga
  h.local.set('tutor_ai_projects', JSON.stringify([]));
  h.rispondi({ success: true }); await h.flush();
  assert.ok(!h.local.has(ID), 'nessuna copia rinata');
  assert.deepEqual(h.voci(), [], 'nessuna riga rinata');
  assert.equal(registroCon(h, /copia è cambiata/), 1);
});

test('0076 M17c: la COPIA sparisce durante la scrittura ma la riga d\'indice resta — niente residuo e NESSUNA finestra', async () => {
  const h = harness({ sospeso: true, appState: mappa(extra()) });
  h.salva(); await h.flush();
  h.local.delete(ID);                                        // la copia va via, la riga d'indice no
  h.rispondi({ success: true }); await h.flush();
  assert.ok(!h.local.has(ID), 'nessun residuo al posto di una copia che non c\'è più');
  assert.equal(h.voci().length, 1, 'la riga resta com\'era');
  assert.deepEqual(testi(h), [], 'sparita vuol dire sparita: nessun «salvato»');
  assert.equal(registroCon(h, /copia è cambiata/), 1);
});

test('0076: [Libera spazio ora] apre la Cabina su «Gestione cartelle» e la porta in vista', async () => {
  const h = harness({ siRisponde: true });
  h.salva();
  await h.flush();
  assert.equal(JSON.stringify(h.spie.cabina), JSON.stringify([['profilo', { sezione: 'pr-cartelle' }]]));
});

test('0076 M4: cartella NON scritta — l\'altra frase, la copia resta, e il registro come oggi', async (t) => {
  const casi = {
    'success:false': { esito: { success: false, error: 'EACCES' } },
    'review-conflict': { esito: { success: false, error: 'review-conflict: la mappa in memoria è precedente alla revisione salvata; riaprire il progetto' } },
    'saveVault lancia': { lancia: 'IPC chiuso' }
  };
  for (const [nome, caso] of Object.entries(casi)) {
    await t.test(nome, async () => {
      const h = harness(caso);
      h.salva();
      await h.flush();
      assert.equal(h.spie.saveVault.length, 1);
      assert.deepEqual(testi(h), [FRASE_NON_SALVATO], 'mai «salvato» senza la cartella scritta');
      assert.equal(h.spie.finestre[0].conferma, 'Libera spazio ora');
      assert.equal(h.local.get(ID), COPIA_VECCHIA, 'il residuo solo dopo una scrittura riuscita');
      assert.equal(registroCon(h, /^SALVATAGGIO PERSO/), 1);
    });
  }
});

test('0076: il reader — `soloVista` non è la cartella: nessuna delle due frasi, la copia resta', async () => {
  const h = harness({ esito: { success: true, soloVista: true } });
  h.salva();
  await h.flush();
  assert.deepEqual(h.spie.finestre, [], 'la frase «salvato nella cartella» lì non deve uscire');
  assert.equal(h.local.get(ID), COPIA_VECCHIA, 'vista.json non è la mappa: niente residuo');
  assert.deepEqual(h.spie.toast.map(x => x.m), [TOAST_DI_OGGI], 'resta il messaggio di oggi');
});

test('0076: il reader — senza MappAIErrori non parte niente di nuovo (MappAIModal c\'è, ma non basta)', async () => {
  const h = harness({ lettore: true });
  h.salva();
  await h.flush();
  assert.equal(h.spie.saveVault.length, 0);
  assert.deepEqual(h.spie.finestre, []);
  assert.deepEqual(h.spie.toast.map(x => x.m), [TOAST_DI_OGGI], 'come oggi');
});

test('0076: mai durante una generazione o una pipeline; e niente se si sta riaprendo una revisione', async () => {
  const h = harness({});
  h.generando = true; h.salva(); await h.flush();
  h.generando = false; h.pipeline = true; h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 0, 'la cartella la scrivono loro, alla fine');
  assert.deepEqual(h.spie.finestre, []);
  h.pipeline = false; h.salva(); await h.flush();
  assert.equal(h.spie.saveVault.length, 1, 'finito il lavoro, la prima volta che serve si scrive');
  const r = harness({ appState: mappa({ _reviewRestoring: true }) });
  r.salva(); await r.flush();
  assert.equal(r.spie.saveVault.length, 0);
});

test('0076: il preavviso dell\'80% — saltato solo se il cassetto pieno parla; spento solo da una finestra vista', async () => {
  const silenzio = harness({});
  silenzio.generando = true; silenzio.salva(); await silenzio.flush();
  assert.equal(JSON.stringify(silenzio.spie.controlli[0]), JSON.stringify(['salvataggio perso', true]),
    'il ramo esce in silenzio: il preavviso resta libero di comparire');
  assert.equal(silenzio.spie.segnate, 0);
  const parla = harness({});
  parla.salva(); await parla.flush();
  assert.equal(JSON.stringify(parla.spie.controlli[0]), JSON.stringify(['salvataggio perso', true, { preavviso: false }]));
  assert.equal(parla.spie.segnate, 1, 'la finestra si è vista: il preavviso non serve più');
});

// ═══════════════════════════════════════════════════════════════════════════
// La Cabina vera: «Gestione cartelle» e «Libera spazio»
// ═══════════════════════════════════════════════════════════════════════════
function cabina(caso = {}) {
  const local = new Map(Object.entries(caso.cassetto || {}));
  if (caso.acceso) local.set('mappai_cassetto_snello', '1');
  const spie = { conferme: [], toast: [], scrolls: [], schemi: [] };
  let aperta = null;
  const el = { scrollIntoView: o => spie.scrolls.push(o) };
  const box = { querySelector: sel => (sel === '[data-sez="pr-cartelle"]' ? el : null) };
  const window = {
    t: (_k, f) => f,
    showToast: (m, k) => spie.toast.push(m),
    MappAIModal: {
      open: s => { aperta = s; return new Promise(() => {}); },
      conferma: o => { spie.conferme.push(o); return Promise.resolve(true); }
    },
    MappAITeacherProfile: { get: () => ({}), sezioni: () => [], assorbi() {} },
    MappAIFilesCore: { SUB: { mappe: 'Mappe' } },
    MappAITeachCore: TC, MappAIVistaCore: VC,
    MappAIErrori: { cassetto: () => ({ pct: 95, livello: 'critico' }) },
    electronAPI: { filesRootGet: async () => ({ organized: true, rootDir: '/R' }) },
    addEventListener() {}
  };
  // l'elenco delle cartelle delle mappe, come `get-all-vaults` (main.js): percorsi INTERI
  if (caso.vaults) window.electronAPI.getAllVaults = async () => { spie.elenchi = (spie.elenchi || 0) + 1; return JSON.parse(JSON.stringify(caso.vaults)); };
  if (caso.vaultsLancia) window.electronAPI.getAllVaults = async () => { throw new Error('IPC chiuso'); };
  const ctx = vm.createContext({
    window, console: { log() {}, warn() {}, error() {} }, setTimeout,
    document: { addEventListener() {}, querySelector: () => null, documentElement: { dataset: {} } },
    // `StorageManager` è una const lessicale nel browser (inv. 3): qui un globale della vm
    StorageManager: { validVaultFolders: caso.esistenti || null },
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)),
      removeItem: k => local.delete(k), get length() { return local.size; }, key: i => [...local.keys()][i]
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-cabina.js'), 'utf8'), ctx);
  const c = {
    local, spie,
    apri: async (opts) => {
      window.MappAICabina.apri('profilo', opts);
      aperta.suApertura(box, s => { spie.schemi.push(s); return box; });
      for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    },
    sezione: () => {
      const s = spie.schemi[spie.schemi.length - 1];
      return s.sezioni.find(x => x.id === 'pr-cartelle');
    },
    bottone: () => (c.sezione().azioni || []).some(a => a.id === 'cart-pota'),
    libera: async () => {
      aperta.suAzione({ azione: 'cart-pota', valori: {} }, box, s => { spie.schemi.push(s); return box; });
      for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    }
  };
  return c;
}
// una copia grossa, con ciò che la cartella ha già (manifesto, evidenze, la foto del dossier partito)
const copiaGrossa = cartella => {
  const sch = { titolo: 'Foto', nomeFile: 'f.jpg', fotoB64: 'F'.repeat(30000) };
  return JSON.stringify({ activeVaultPath: cartella, db: { nodes: [{ id: 'fonte_0' }], links: [] }, sources: [{ id: 's', _scheda: sch }],
    _pipelineManifest: { config: { dossier: sch }, review: { initial: { status: 'approved' }, approvedRevision: 'r' } }, _evidenze: { e: 'x'.repeat(3000) } });
};

test('0076 M7e: Cabina, interruttore SPENTO — senza copie doppie il bottone «Libera spazio» non c\'è (oggi)', async () => {
  const c = cabina({ cassetto: { tutor_ai_projects: JSON.stringify([{ id: 'p1', vault: 'A', name: 'A', date: 2 }]), p1: copiaGrossa('/M/A') } });
  await c.apri();
  assert.ok(c.sezione(), 'la sezione «Gestione cartelle» c\'è');
  assert.equal(c.bottone(), false);
  assert.deepEqual(c.spie.scrolls, [], 'senza `sezione` la Cabina non scorre');
});

test('0076 M7c: Cabina, interruttore SPENTO — «Libera spazio» fa la potatura di oggi e NON snellisce nessuna copia', async () => {
  const P = [{ id: 'p1', vault: 'A', name: 'A', date: 2 }, { id: 'p2', vault: 'A', name: 'A', date: 1 }];
  const grossa = copiaGrossa('/M/A');
  const c = cabina({ cassetto: { tutor_ai_projects: JSON.stringify(P), p1: grossa, p2: grossa } });
  await c.apri();
  assert.equal(c.bottone(), true, 'con copie doppie c\'è, come oggi');
  await c.libera();
  assert.ok(!c.local.has('p2'), 'la copia doppia se ne va, come oggi');
  assert.equal(c.local.get('p1'), grossa, 'la copia della mappa resta INTERA: spento non si snellisce');
  assert.match(c.spie.conferme[0].testo, /^Di ogni mappa resta la copia più recente/);
});

test('0076 M5c: Cabina accesa, riga d\'indice SENZA vault ma copia con un percorso, nessun elenco delle cartelle — la copia resta intatta', async () => {
  const P = [{ id: 'p1', vault: null, name: 'A', date: 2 }];
  const cassetto = { tutor_ai_projects: JSON.stringify(P), p1: copiaGrossa('/M/A') };
  const c = cabina({ acceso: true, cassetto });
  await c.apri();
  await c.libera();
  assert.equal(c.local.get('p1'), cassetto.p1, 'la riga d\'indice non dichiara una cartella: non si tocca');
});

test('0076 E5: Cabina accesa — una copia con la riga «superata» non si riscrive (ne romperebbe l\'impronta)', async () => {
  const sup = { cartella: '/M/A', quando: 'q', copia: 1 };
  const P = [{ id: 'p1', vault: 'A', name: 'A', date: 2, superata: sup }];
  const grossa = copiaGrossa('/M/A');
  sup.copia = grossa.length;
  const cassetto = { tutor_ai_projects: JSON.stringify(P), p1: grossa };
  const c = cabina({ acceso: true, cassetto, vaults: [{ folderName: 'A', fullPath: '/M/A' }] });
  await c.apri();
  await c.libera();
  assert.equal(c.local.get('p1'), grossa, 'resta com\'è: la riapertura deve ancora riconoscerla');
});

test('0076 M5c: Cabina, interruttore ACCESO — il bottone c\'è sempre; si snelliscono solo i progetti con una cartella che esiste', async () => {
  const P = [{ id: 'p1', vault: 'A', name: 'A', date: 4 }, { id: 'p3', vault: null, name: 'Senza cartella', date: 3 },
    { id: 'p4', vault: 'B', name: 'Copia senza percorso', date: 2 }, { id: 'p5', vault: 'Cancellata', name: 'C', date: 1 }];
  const cassetto = { tutor_ai_projects: JSON.stringify(P), p1: copiaGrossa('/M/A'), p3: copiaGrossa(null), p4: copiaGrossa(null), p5: copiaGrossa('/M/Cancellata') };
  const c = cabina({ acceso: true, cassetto, vaults: [{ folderName: 'A', fullPath: '/M/A' }, { folderName: 'B', fullPath: '/M/B' }] });
  await c.apri({ sezione: 'pr-cartelle' });
  assert.equal(c.bottone(), true, 'acceso: sempre, anche senza copie doppie');
  assert.ok(c.spie.scrolls.length >= 1, 'la sezione portata in vista');
  await c.libera();
  assert.ok(!('_pipelineManifest' in JSON.parse(c.local.get('p1'))), 'p1: cartella che esiste, snellita');
  assert.equal(c.local.get('p3'), cassetto.p3, 'p3: senza cartella, intatto');
  assert.equal(c.local.get('p4'), cassetto.p4, 'p4: la copia non dichiara una cartella, intatto');
  assert.equal(c.local.get('p5'), cassetto.p5, 'p5: la sua cartella non c\'è più, intatto');
  assert.match(c.spie.toast[c.spie.toast.length - 1], /^Liberati \d+\.\d MB\.$/);
});

// ── gate 3 (05/10): «Libera spazio» decide sul PERCORSO INTERO ────────────────
// Misurato nell'app vera: liberati 0,4 MB su 32,8. `validVaultFolders` NON è
// l'elenco delle cartelle delle mappe: `get-valid-vault-folders` legge il primo
// livello di Mappe/, cioè le CLASSI («1A», «4R»). Le mappe stanno in
// Mappe/<classe>/<materia>/<mappa>: i dossier veri risultavano «non validi», e
// l'unica copia alleggerita era una riga rovinata che puntava alla cartella di classe.
const MAPPE = '/Users/prova/Documents/MappAI - file/Mappe';
const DOSSIER = MAPPE + '/1A/Storia/Il dossier';
const SOCIETA = MAPPE + '/4R/Geo/Società';                       // composta (NFC), come la scrive l'app
const ELENCO_VERO = [{ folderName: 'Il dossier', fullPath: DOSSIER, classDir: '1A', discDir: 'Storia' },
  { folderName: 'Società', fullPath: SOCIETA, classDir: '4R', discDir: 'Geo' }];
const snellita = (c, id) => !('_pipelineManifest' in JSON.parse(c.local.get(id)));

test('0076 gate: «Libera spazio» alleggerisce solo le copie il cui PERCORSO sta nell\'elenco delle mappe (getAllVaults), mai per nome', async () => {
  const P = [
    { id: 'p1', vault: 'Il dossier', classDir: '1A', discDir: 'Storia', name: 'Il dossier', date: 5 },
    { id: 'p2', vault: 'Società', classDir: '4R', discDir: 'Geo', name: 'Società', date: 4 },
    { id: 'p3', vault: '4R', name: 'Guerra Fredda', date: 3 },             // riga rovinata: punta alla cartella di CLASSE
    { id: 'p4', vault: 'Il dossier', name: 'Omonima fuori da Mappe', date: 2 }
  ];
  const cassetto = { tutor_ai_projects: JSON.stringify(P),
    p1: copiaGrossa(DOSSIER),
    p2: copiaGrossa(SOCIETA.normalize('NFD') + '/'),                      // scomposta e con la barra finale: è la STESSA cartella
    p3: copiaGrossa(MAPPE + '/4R'),
    p4: copiaGrossa('/Users/prova/Desktop/Analisi/Il dossier') };
  // `validVaultFolders` com'era nell'app vera: le classi. Non deve contare niente.
  const c = cabina({ acceso: true, cassetto, esistenti: ['1A', '2A', '4A', '4R'], vaults: ELENCO_VERO });
  await c.apri();
  await c.libera();
  assert.equal(c.spie.elenchi, 1, 'una lettura sola delle cartelle, al momento di «Libera spazio»');
  assert.ok(snellita(c, 'p1'), 'p1: il suo percorso è una mappa che esiste');
  assert.ok(snellita(c, 'p2'), 'p2: lo stesso percorso, in un\'altra forma (NFC, barra finale)');
  assert.equal(c.local.get('p3'), cassetto.p3, 'p3: la cartella di CLASSE non è una mappa — intera');
  assert.equal(c.local.get('p4'), cassetto.p4, 'p4: fuori da Mappe/, anche se il nome coincide — intera');
});

test('0076 gate: se le cartelle non si leggono, «Libera spazio» toglie solo le copie doppie, e lo dice', async (t) => {
  const P = [{ id: 'pa', vault: 'A', classDir: '1A', name: 'A', date: 3 }, { id: 'pa2', vault: 'A', classDir: '1A', name: 'A', date: 1 },
    { id: 'p1', vault: 'Il dossier', classDir: '1A', discDir: 'Storia', name: 'Il dossier', date: 2 }];
  const base = () => ({ tutor_ai_projects: JSON.stringify(P), pa: copiaGrossa('/M/1A/A'), pa2: copiaGrossa('/M/1A/A'), p1: copiaGrossa(DOSSIER) });
  for (const [nome, extraCaso] of [['getAllVaults lancia', { vaultsLancia: true }], ['getAllVaults non c\'è', {}]]) {
    await t.test(nome, async () => {
      const cassetto = base();
      const c = cabina(Object.assign({ acceso: true, cassetto, esistenti: ['1A', '4R'] }, extraCaso));
      await c.apri();
      await c.libera();
      assert.match(c.spie.conferme[0].testo, /Non riesco a leggere le cartelle: alleggerisco solo le copie doppie\./);
      assert.ok(!c.local.has('pa2'), 'la copia doppia se ne va, come oggi');
      assert.equal(c.local.get('pa'), cassetto.pa, 'nessuna copia con cartella alleggerita: niente ripiego sulla riga');
      assert.equal(c.local.get('p1'), cassetto.p1);
    });
  }
  await t.test('e senza copie doppie non c\'è niente da fare: lo dice', async () => {
    const cassetto = { tutor_ai_projects: JSON.stringify([P[2]]), p1: copiaGrossa(DOSSIER) };
    const c = cabina({ acceso: true, cassetto, vaultsLancia: true });
    await c.apri();
    await c.libera();
    assert.deepEqual(c.spie.conferme, []);
    assert.match(c.spie.toast[c.spie.toast.length - 1], /Non riesco a leggere le cartelle: alleggerisco solo le copie doppie\./);
    assert.equal(c.local.get('p1'), cassetto.p1);
  });
});
