'use strict';
/*
 * documenti-cartella.test.js — i documenti salvati diventano file della cartella
 * della mappa (packet 0077, ADR 0018 punto 1 e scelta 3 (a)).
 *
 * L'archivio VERO (`mappai-study-export-core.js`) gira in una vm col core puro
 * (`mappai-documenti-core.js`), `mappai-files-core.js` e `mappai-text-utils.js`
 * veri, davanti a:
 *  - un cassetto finto con un TETTO (il `magazzino()` di html-sicuro-materiali,
 *    che qui lancia QuotaExceededError come il localStorage vero);
 *  - un disco finto (il `disco()` di elabora-fonti): gli IPC `save-vault-file`,
 *    `read-vault-file`, `delete-vault-file`, `get-all-vaults` con le forme di
 *    main.js (:975, :1011, :1049, :3256) e la guardia VERA `sanitizeVaultRelPath`.
 *    `read-vault-file` torna sempre base64; `save-vault-file` toglie il prefisso
 *    `data:` come main.js:992; `delete-vault-file` rifiuta fuori da Mappe (:1054).
 * Gli oggetti nati nella vm si confrontano come JSON (prototipi diversi).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FilesCore = require('../public/js/mappai-files-core.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
const QUIETA = { log() {}, info() {}, warn() {}, error() {} };
const riposo = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const KEY = 'mappai_saved_documents';
const SWITCH = 'mappai_documenti_in_cartella';
const P1 = 'proj_1788975818955';
const P2 = 'proj_1788975819999';
const BASE = '/Users/prova/Documents/MappAI - file';
const MAPPE = BASE + '/Mappe';
const ELE = MAPPE + '/4R/Scienze/Elettricità';
const ELE_4A = MAPPE + '/4A/Scienze/Elettricità';
const SVI = MAPPE + '/4R/Storia/Svizzera';
const ANNA = BASE + '/Allievi/Anna/Mappe/Elettricità';

const HTML = '<!DOCTYPE html><html><body><h1>Sintesi — Elettricità</h1><p>«Più» è più, e la luce è più forte.</p></body></html>';
const B64PDF = Buffer.from('%PDF-1.4 foglio dei nodi ✓', 'utf8').toString('base64');
const PDF = 'data:application/pdf;filename=generated.pdf;base64,' + B64PDF;

// ── il cassetto, con un tetto ──────────────────────────────────────────────
function magazzino(iniziale, tetto) {
  const m = new Map(Object.entries(iniziale || {}));
  const peso = () => { let s = 0; for (const [k, v] of m) s += k.length + v.length; return s; };
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      v = String(v);
      const prima = m.has(k) ? m.get(k) : undefined;
      m.set(k, v);
      if (tetto != null && peso() > tetto) {
        if (prima === undefined) m.delete(k); else m.set(k, prima);
        const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e;
      }
    },
    removeItem: k => { m.delete(k); },
    _m: m
  };
}
const voci = st => JSON.parse(st.getItem(KEY) || '[]');

// ── il disco ───────────────────────────────────────────────────────────────
function disco(iniziale, o) {
  o = o || {};
  const vaults = new Map();
  /* `'index.yaml': 'x'` = «un index.yaml qualunque»: si scrive con il `projectId`
     che l'elenco dà a quella cartella (colonna 0, come main.js:3295-3297) */
  const yamlDi = vp => { const e = (o.vaults || []).find(x => x.fullPath === vp);
    return (e && e.projectId ? 'projectId: ' + e.projectId + '\n' : '') + 'rootNodeLabel: ' + ((e && e.rootNodeLabel) || 'x') + '\n'; };
  for (const [vp, files] of Object.entries(iniziale || {})) {
    const mm = new Map();
    for (const [rel, c] of Object.entries(files || {})) {
      const cc = (rel === 'index.yaml' && c === 'x') ? yamlDi(vp) : c;
      mm.set(rel, Buffer.isBuffer(cc) ? Buffer.from(cc) : Buffer.from(String(cc), 'utf8'));
    }
    vaults.set(vp, mm);
  }
  const scritture = [], letture = [], cestino = [], giri = { quandoLeggo: [] };
  const pausa = () => (o.ritardo ? new Promise(r => setImmediate(r)) : Promise.resolve());
  const api = {
    async getAllVaults() { await pausa(); giri.elenchi = (giri.elenchi || 0) + 1; return J(o.vaults || []); },
    async saveVaultFile(data) {
      const d = data || {};
      scritture.push({ vaultPath: d.vaultPath, relPath: d.relPath, potaVarianti: d.potaVarianti, haPota: 'potaVarianti' in d,
        base64: d.base64 != null, text: d.text != null });
      await pausa();
      const v = vaults.get(d.vaultPath);
      if (!d.vaultPath || !v) return { ok: false, error: 'vault inesistente' };
      const safe = FilesCore.sanitizeVaultRelPath(d.relPath);
      if (!safe) return { ok: false, error: 'percorso non valido: ' + d.relPath };
      if (d.base64 == null && d.text == null) return { ok: false, error: 'nessun contenuto' };
      if (o.scritturaFallisce) return { ok: false, error: 'EACCES' };
      if (d.base64 != null) {
        const b = (/^data:/i.test(d.base64) && d.base64.indexOf(',') >= 0) ? d.base64.slice(d.base64.indexOf(',') + 1) : d.base64;
        v.set(safe, Buffer.from(b, 'base64'));
      } else v.set(safe, Buffer.from(String(d.text), 'utf8'));
      return { ok: true, path: d.vaultPath + '/' + safe, potate: [], orfani: [] };
    },
    async readVaultFile(data) {
      const d = data || {};
      letture.push({ vaultPath: d.vaultPath, relPath: d.relPath });
      if (o.quandoLeggo) giri.quandoLeggo.push(o.quandoLeggo(d));
      await pausa();
      const v = vaults.get(d.vaultPath);
      if (!d.vaultPath || !v) return { ok: false, error: 'vault inesistente' };
      const safe = FilesCore.sanitizeVaultRelPath(d.relPath);
      if (!safe) return { ok: false, error: 'percorso non valido: ' + d.relPath };
      if (!v.has(safe)) return { ok: false, error: 'file non trovato: ' + safe };
      let buf = v.get(safe);
      if (o.altera && safe !== 'index.yaml') buf = Buffer.concat([buf, Buffer.from(' ')]);
      const out = { ok: true, base64: buf.toString('base64'), size: buf.length };
      if (o.dopoLeggi) o.dopoLeggi(d, vaults);
      return out;
    },
    async deleteVaultFile(data) {
      const d = data || {};
      await pausa();
      const v = vaults.get(d.vaultPath);
      if (!d.vaultPath || !v) return { ok: false, error: 'vault inesistente' };
      if (d.vaultPath !== MAPPE && !d.vaultPath.startsWith(MAPPE + '/')) return { ok: false, error: 'fuori da Mappe' };
      const safe = FilesCore.sanitizeVaultRelPath(d.relPath);
      if (!safe) return { ok: false, error: 'percorso non valido: ' + d.relPath };
      if (!v.has(safe)) return { ok: false, error: 'file-non-trovato', missing: true };
      cestino.push({ vaultPath: d.vaultPath, relPath: safe, buf: v.get(safe) });
      v.delete(safe);
      return { ok: true };
    }
  };
  const file = (vp, rel) => { const v = vaults.get(vp); return v && v.has(rel) ? v.get(rel) : null; };
  const nomi = vp => { const v = vaults.get(vp); return v ? [...v.keys()].sort() : []; };
  return { api, scritture, letture, cestino, giri, file, nomi, vaults, o };
}

const VAULT = (fullPath, rootNodeLabel, projectId) => Object.assign({ folderName: fullPath.split('/').pop(), fullPath, rootNodeLabel,
  extractionMode: 'mindmap' }, projectId ? { projectId } : {});

// ── l'app, in una vm ───────────────────────────────────────────────────────
function avvia(o) {
  const giri = { toast: [], registro: [], timer: [] };
  const g = {
    console: QUIETA, localStorage: o.storage,
    setTimeout: (fn, ms) => { giri.timer.push({ fn, ms }); if (o.timerSubito) fn(); return giri.timer.length; }, clearTimeout() {},
    t: (k, f) => f, showToast: (...a) => giri.toast.push(a),
    atob, btoa, TextDecoder, TextEncoder,
    StorageManager: { currentProjectId: o.progetto === undefined ? P1 : o.progetto }
  };
  if (o.api) g.electronAPI = o.api;
  if (!o.senzaRegistro) g.MappAIErrori = { registra: d => { giri.registro.push(d.messaggio); return null; } };
  if (o.gen) g.MappAIGen = o.gen;
  if (o.pipeline) g.MappAIPipeline = o.pipeline;
  g.window = g; g.self = g;
  vm.createContext(g);
  vm.runInContext(JS('mappai-text-utils.js'), g);
  if (!o.senzaCore) vm.runInContext(JS('mappai-documenti-core.js'), g);
  if (o.vista) vm.runInContext(JS('mappai-vista-core.js'), g);   // 0082: il lettore di mappai_cassetto_solo_indice
  vm.runInContext(JS('mappai-study-export-core.js'), g);
  vm.runInContext(JS('mappai-files-core.js'), g);   // in index.html carica DOPO l'archivio
  return { g, giri, SD: g.MappAIStudyDocs };
}
const acceso = (iniziale) => Object.assign({ [SWITCH]: '1' }, iniziale || {});
const docHtml = (o) => Object.assign({ kind: 'synthesis', title: 'Sintesi — Elettricità', mapName: 'Elettricità', html: HTML, cls: '4R', disc: 'Scienze' }, o || {});
const vecchia = (o) => Object.assign({ id: 'doc_1780000000000_1', kind: 'synthesis', title: 'Sintesi — Elettricità', mapName: 'Elettricità',
  cls: '4R', disc: 'Scienze', date: 1780000000000, html: HTML, overLimit: 0, pdf: '' }, o || {});
const vecchioPdf = (o) => vecchia(Object.assign({ id: 'doc_1780000000000_2', kind: 'nodesheet', title: 'Foglio nodi', html: '', pdf: PDF }, o || {}));
async function fine(app) { await app.SD.pronto(); await app.SD._coda(); await riposo(); await app.SD._coda(); }

// ── 1. interruttore spento ─────────────────────────────────────────────────

test('M5 spento: save e get come oggi, nessuna scrittura su disco, nessuna migrazione', async () => {
  const st = magazzino({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) });
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, timerSubito: true });
  const id = app.SD.save(docHtml({ title: 'Altra sintesi' }));
  assert.ok(id);
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.deepEqual(d.scritture, [], 'nessuna scrittura');
  const vv = voci(st);
  assert.equal(vv.length, 2);
  assert.ok(vv.every(v => v.html === HTML && !v.rel), 'il testo resta nel cassetto');
  assert.equal(app.SD.get(id).html, HTML);
  assert.deepEqual(J(app.SD.list()).map(x => x.hasHtml), [true, true]);
});

test('M5 spento: un documento già nel disco si legge lo stesso', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = 'Documenti/Sintesi — Elettricità - synthesis - ' + v.id + '.html';
  const snella = { id: v.id, kind: v.kind, title: v.title, mapName: v.mapName, cls: v.cls, disc: v.disc, date: v.date, overLimit: 0,
    hasHtml: true, hasPdf: false, progetto: P1, rel };
  const st = magazzino({ [KEY]: JSON.stringify([snella]) });
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  const doc = app.SD.get(v.id);
  assert.ok(doc, 'letto dal disco a interruttore spento');
  assert.equal(doc.html, HTML);
  assert.deepEqual(d.scritture, []);
});

// ── 2. il salvataggio, acceso ──────────────────────────────────────────────

test('save acceso: l\'id SUBITO e get sincrono (nuovoFoglioAperte); poi file, rilettura, voce snella', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml());
  assert.equal(typeof id, 'string', 'save è sincrono e torna l\'id');
  const subito = app.SD.get(id);
  assert.ok(subito && subito.html === HTML, 'get lo trova subito');
  assert.equal(voci(st)[0].html, HTML, 'prima della scrittura il testo è nel cassetto');
  await fine(app);
  const v = voci(st)[0];
  assert.equal(v.html, undefined, 'il testo è uscito dal cassetto');
  assert.equal(v.progetto, P1);
  assert.match(v.rel, /^Documenti\/[^/]+\.html$/);
  assert.equal(d.file(ELE, v.rel).toString('utf8'), HTML, 'il file è il documento, byte per byte');
  assert.equal(app.SD.get(id).html, HTML, 'get dopo: identico');
  const l = J(app.SD.list())[0];
  assert.equal(l.hasHtml, true);
  assert.equal(l.hasPdf, false);
});

test('M6 ogni scrittura passa potaVarianti: false; M9 rel sempre Documenti/<file>, mai assoluto', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia(), vecchioPdf()]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml({ title: 'Terza' }));
  app.SD.save({ kind: 'nodesheet', title: 'Foglio due', mapName: 'Elettricità', pdf: PDF });
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.equal(d.scritture.length, 4);
  for (const s of d.scritture) {
    assert.equal(s.haPota, true, 'potaVarianti passato esplicitamente');
    assert.equal(s.potaVarianti, false);
    assert.match(s.relPath, /^Documenti\/[^/]+$/);
    assert.equal(s.vaultPath, ELE);
  }
  for (const v of voci(st)) {
    assert.match(v.rel, /^Documenti\/[^/]+$/);
    assert.ok(!v.rel.includes(BASE), 'nessun percorso assoluto nella voce');
    assert.ok(!JSON.stringify(v).includes('/Users/'), 'nessun percorso assoluto nella voce');
  }
});

test('M1 il testo esce dal cassetto SOLO dopo la rilettura uguale', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    quandoLeggo: (q) => /^Documenti\//.test(q.relPath) ? voci(st).map(v => typeof v.html === 'string' && v.html.length > 0) : 'index' });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml());
  await fine(app);
  assert.deepEqual(d.giri.quandoLeggo.filter(x => x !== 'index'), [[true]], 'quando si rilegge, il testo è ancora nel cassetto');
  assert.equal(voci(st)[0].html, undefined);
});

test('M1 una rilettura diversa: la voce resta col testo, e il registro lo dice', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], altera: true });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.ok(voci(st).every(v => v.html === HTML && !v.rel), 'tutte col testo');
  assert.ok(app.giri.registro.length >= 1);
});

test('una scrittura che fallisce: la voce resta col testo', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], scritturaFallisce: true });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml());
  await fine(app);
  assert.equal(voci(st)[0].html, HTML);
  assert.equal(app.SD.get(id).html, HTML);
});

// ── 3. la migrazione ───────────────────────────────────────────────────────

test('migrazione: get dopo restituisce testo e PDF identici a prima, anche dopo un riavvio (M7, M8)', async () => {
  const a = vecchia({ progetto: P1 }), b = vecchioPdf({ progetto: P1 });
  const st = magazzino(acceso({ [KEY]: JSON.stringify([a, b]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  const prima = [J(app.SD.get(a.id)), J(app.SD.get(b.id))];
  const listaPrima = J(app.SD.list());
  await app.SD.pronto();
  const esito = J(await app.SD._migra());
  assert.equal(esito.spostate, 2);
  for (const v of voci(st)) { assert.equal(v.html, undefined); assert.equal(v.pdf, undefined); }
  assert.ok(st.getItem(KEY).length < 1000, 'il cassetto scende a una manciata di byte');
  assert.deepEqual([J(app.SD.get(a.id)), J(app.SD.get(b.id))], prima, 'nella stessa sessione');
  assert.deepEqual(J(app.SD.list()), listaPrima, 'list() uguale, hasHtml/hasPdf compresi');
  assert.ok(d.file(ELE, voci(st)[1].rel).equals(Buffer.from(B64PDF, 'base64')), 'il PDF è un .pdf vero');
  /* riavvio: un'app nuova sullo stesso cassetto e lo stesso disco */
  const dopo = avvia({ storage: st, api: d.api });
  assert.equal(dopo.SD.get(a.id), null, 'prima che lo specchio sia pronto: null');
  await dopo.SD.pronto();
  assert.deepEqual([J(dopo.SD.get(a.id)), J(dopo.SD.get(b.id))], prima, 'dal disco, identici');
  assert.ok(dopo.SD.get(b.id).pdf.startsWith('data:application/pdf'), 'M7: il prefisso data: torna');
  assert.deepEqual(J(dopo.SD.list()), listaPrima);
  assert.ok(app.giri.registro.some(m => /2/.test(m)), 'una riga nel registro col conto');
  assert.equal(app.giri.toast.length, 0, 'nessuna finestra');
});

test('migrazione di una voce vecchia: la cartella per nome, NFC contro NFD, e la voce prende l\'id', async () => {
  const nfd = 'Elettricità'.normalize('NFD');
  const vp = MAPPE + '/4R/Scienze/' + nfd;
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ mapName: 'Elettricità'.normalize('NFC') })]) }));
  const d = disco({ [vp]: { 'index.yaml': 'x' } }, { vaults: [VAULT(vp, nfd, P1), VAULT(SVI, 'Svizzera', P2)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  await app.SD._migra();
  const v = voci(st)[0];
  assert.equal(v.progetto, P1);
  assert.equal(v.html, undefined);
  assert.equal(d.file(vp, v.rel).toString('utf8'), HTML);
});

test('M3 due cartelle omonime, o nessuna, o un ripiego: la voce resta col testo', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([
    vecchia({ id: 'doc_1' }), vecchia({ id: 'doc_2', mapName: 'Magnetismo', title: 'M' }), vecchia({ id: 'doc_3', mapName: 'MappAI', title: 'R' })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [ELE_4A]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(ELE_4A, 'Elettricità', P2), VAULT(SVI, 'MappAI', P2)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  const esito = J(await app.SD._migra());
  assert.equal(esito.spostate, 0);
  assert.equal(esito.rimaste.length, 3);
  assert.deepEqual(d.scritture, []);
  assert.ok(voci(st).every(v => v.html === HTML && !v.rel && !v.progetto));
  assert.ok(app.giri.registro.some(m => /3/.test(m)));
});

test('M12 una voce con progetto non si cerca per nome: l\'omonimo con un altro id non la prende', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE_4A]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE_4A, 'Elettricità', P2)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  await app.SD._migra();
  assert.deepEqual(d.scritture, []);
  assert.equal(voci(st)[0].html, HTML);
});

test('M13 due cartelle con lo stesso id: nessuna scrittura, la voce resta', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [ELE_4A]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(ELE_4A, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.deepEqual(d.scritture, []);
  assert.ok(voci(st).every(v => v.html === HTML));
});

test('M14 un progetto non valido non si accetta: né al salvataggio, né in migrazione', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: 'tutor_ai_projects' })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', 'tutor_ai_projects'), VAULT(SVI, 'Svizzera', P1)] });
  const app = avvia({ storage: st, api: d.api, progetto: 'proj_12' });
  const id = app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.deepEqual(d.scritture, []);
  const nuova = voci(st).find(v => v.id === id);
  assert.equal(nuova.progetto, undefined, 'l\'id non valido non entra nella voce');
  assert.ok(voci(st).every(v => v.html === HTML));
});

test('a riposo: durante una generazione o una pipeline la migrazione non parte', async () => {
  for (const occ of [{ gen: { attiva: () => true } }, { pipeline: { occupata: () => true } }]) {
    const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
    const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
    const app = avvia(Object.assign({ storage: st, api: d.api, timerSubito: true }, occ));
    await fine(app);
    await app.SD._migra();
    await fine(app);
    assert.deepEqual(d.scritture, [], JSON.stringify(Object.keys(occ)));
    assert.equal(voci(st)[0].html, HTML);
  }
});

test('la migrazione parte da sola a riposo, dopo l\'avvio', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, timerSubito: true, gen: { attiva: () => false } });
  await fine(app); await riposo(60); await fine(app);
  assert.equal(voci(st)[0].html, undefined);
  assert.equal(d.scritture.length, 1);
});

// ── 4. il reader ───────────────────────────────────────────────────────────

test('M4 reader (__studente): nessuna scrittura e nessuna migrazione, tutto come oggi', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  d.api.__studente = true;
  const app = avvia({ storage: st, api: d.api, timerSubito: true, senzaRegistro: true });
  const id = app.SD.save(docHtml({ title: 'Nuova' }));
  assert.ok(id);
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.deepEqual(d.scritture, []);
  assert.ok(voci(st).every(v => v.html === HTML && !v.rel && !('progetto' in v && v.id === id)));
  assert.equal(app.SD.get(id).html, HTML);
});

test('M4 senza il core (il reader non lo carica): nessuna scrittura, nessuna migrazione, nessun progetto', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  /* il registro qui c'è solo per osservare: nel reader non c'è */
  const app = avvia({ storage: st, api: d.api, timerSubito: true, senzaCore: true });
  const id = app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  await app.SD._migra();
  await fine(app);
  assert.deepEqual(d.scritture, []);
  assert.deepEqual(d.letture, []);
  assert.deepEqual(app.giri.registro, [], 'nessuna operazione sul disco tentata');
  const nuova = voci(st).find(v => v.id === id);
  assert.equal(nuova.html, HTML);
  assert.equal('progetto' in nuova, false, 'la voce di oggi');
});

// ── 5. il cassetto pieno (B4) e «non entra» ────────────────────────────────

test('M2 _docsWrite con una lista che non entra non tocca le voci di prima (spento: save → null)', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a' }), vecchia({ id: 'doc_b', title: 'B' })]);
  const st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 400);
  const app = avvia({ storage: st, api: disco({}).api });
  const id = app.SD.save(docHtml({ title: 'Enorme', html: 'x'.repeat(5000) }));
  assert.equal(id, null);
  assert.equal(st.getItem(KEY), prima, 'nessuno scartato, niente «[]»');
  assert.ok(app.giri.registro.length >= 1, 'una riga nel registro');
  /* punto 6 (05/10): spento basta il registro — i chiamanti hanno già il loro messaggio */
  assert.equal(app.giri.toast.length, 0, 'spento: nessun avviso nuovo');
  app.SD.remove('nessuno');
  assert.equal(st.getItem(KEY), prima);
});

test('M2 un documento che entrerebbe scartando i più vecchi: non si scarta nessuno, save → null', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a'.repeat(2000) }), vecchia({ id: 'doc_b', title: 'B', html: 'b'.repeat(2000) })]);
  /* c'è posto per la nuova più UNA delle vecchie, non per tutte e tre */
  const st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 1500);
  const app = avvia({ storage: st, api: disco({}).api });
  assert.equal(app.SD.save(docHtml({ title: 'Nuova', html: 'n'.repeat(1800) })), null);
  assert.equal(st.getItem(KEY), prima, 'le voci di prima restano tutte');
});

test('M2 nemmeno un documento solo che non entra svuota l\'archivio', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a' })]);
  const st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 10);
  const app = avvia({ storage: st, api: disco({}).api });
  assert.equal(app.SD.save(docHtml({ title: 'Enorme', html: 'x'.repeat(5000) })), null);
  assert.equal(st.getItem(KEY), prima);
});

test('M11 non entra, acceso, la cartella c\'è: prima il file, poi la voce snella', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a', progetto: P1 })]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const GRANDE = '<p>' + 'è'.repeat(3000) + '</p>';
  const id = app.SD.save(docHtml({ title: 'Grande', html: GRANDE }));
  assert.equal(typeof id, 'string', 'l\'id subito');
  assert.equal(app.SD.get(id).html, GRANDE, 'get subito, dallo specchio');
  await fine(app);
  const v = voci(st).find(x => x.id === id);
  assert.ok(v, 'la voce snella è entrata');
  assert.equal(v.html, undefined);
  assert.equal(d.file(ELE, v.rel).toString('utf8'), GRANDE);
  assert.ok(voci(st).some(x => x.id === 'doc_a'), 'la voce di prima resta');
});

test('M11 non entra e non c\'è dove scriverlo: null (spento: solo il registro; acceso: un avviso solo)', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a' })]);
  const GRANDE = '<p>' + 'x'.repeat(3000) + '</p>';
  /* spento */
  let st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 900);
  let app = avvia({ storage: st, api: disco({}).api });
  assert.equal(app.SD.save(docHtml({ html: GRANDE })), null);
  assert.equal(app.giri.toast.length, 0, 'spento: nessun avviso nuovo');
  assert.ok(app.giri.registro.length >= 1);
  /* acceso, senza progetto */
  st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  app = avvia({ storage: st, api: disco({}).api, progetto: null });
  assert.equal(app.SD.save(docHtml({ html: GRANDE })), null);
  assert.equal(app.giri.toast.length, 1, 'acceso: un avviso, uno solo');
  assert.equal(st.getItem(KEY), prima);
});

/* «Numero subito, rischio dichiarato» (Giacomo, 05/10): a cassetto pieno l'id torna
   SUBITO e il documento sta in `get` finché il file non è riletto; poi voce snella,
   oppure l'avviso e l'uscita dallo specchio. */
test('punto 2: non entra, l\'id subito, il documento in get; la cartella non c\'è → avviso vero e uscita dallo specchio', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a' })]);
  const GRANDE = '<p>' + 'x'.repeat(3000) + '</p>';
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({}, { vaults: [], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ title: 'Grande', html: GRANDE }));
  assert.equal(typeof id, 'string', 'l\'id subito');
  assert.equal(app.SD.get(id).html, GRANDE, 'il documento c\'è finché il file non è riletto');
  await fine(app);
  assert.equal(app.SD.get(id), null, 'dopo il fallimento esce dallo specchio');
  assert.ok(!J(app.SD.list()).some(x => x.id === id));
  assert.equal(st.getItem(KEY), prima, 'le voci di prima restano');
  assert.equal(app.giri.toast.length, 1);
  assert.equal(app.giri.toast[0][0], 'Il documento «Grande» non è stato salvato: la memoria rapida dell\'app è piena e ' +
    'non è stato possibile scriverlo nella cartella della mappa. Gli altri documenti sono al sicuro.');
  assert.equal(app.giri.toast[0][1], 'error');
});

// ── 6. la rimozione e il tetto ─────────────────────────────────────────────

test('M10 remove: il file va nel Cestino; fuori da Mappe resta e il registro lo dice', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 }), vecchia({ id: 'doc_anna', title: 'Anna', progetto: P2 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [ANNA]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(ANNA, 'Elettricità', P2)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  await app.SD._migra();
  const [a, b] = voci(st);
  assert.ok(a.rel && b.rel);
  app.SD.remove(a.id);
  app.SD.remove(b.id);
  await fine(app);
  assert.deepEqual(voci(st), []);
  assert.deepEqual(d.cestino.map(c => [c.vaultPath, c.relPath]), [[ELE, a.rel]]);
  assert.equal(d.file(ELE, a.rel), null);
  assert.ok(d.file(ANNA, b.rel), 'fuori da Mappe il file resta');
  assert.ok(app.giri.registro.some(m => m.includes(b.rel) || /resta/.test(m)));
  assert.equal(app.SD.get(a.id), null);
});

test('M10 oltre il tetto dei 30 la voce esce dall\'elenco, ma il suo file resta', async () => {
  const trenta = [];
  for (let i = 0; i < 30; i++) trenta.push(vecchia({ id: 'doc_178000000000' + String(i).padStart(2, '0') + '_1', title: 'T' + i, progetto: P1 }));
  const st = magazzino(acceso({ [KEY]: JSON.stringify(trenta) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  await app.SD._migra();
  const ultima = voci(st)[29];
  assert.ok(ultima.rel);
  app.SD.save(docHtml({ title: 'La trentunesima' }));
  await fine(app);
  assert.equal(voci(st).length, 30);
  assert.ok(!voci(st).some(v => v.id === ultima.id));
  assert.ok(d.file(ELE, ultima.rel), 'il file resta');
  assert.deepEqual(d.cestino, []);
});

// ── 7. lo specchio ─────────────────────────────────────────────────────────

test('specchio: un file che non si trova → get null, la voce resta nell\'elenco', async () => {
  const snella = { id: 'doc_x', kind: 'synthesis', title: 'X', mapName: 'Elettricità', cls: '', disc: '', date: 1, overLimit: 0,
    hasHtml: true, hasPdf: false, progetto: P1, rel: 'Documenti/X - synthesis - doc_x.html' };
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snella]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  assert.equal(app.SD.get('doc_x'), null);
  assert.equal(J(app.SD.list()).length, 1);
  assert.ok(app.giri.registro.length >= 1);
});

test('specchio: un rel fuori da Documenti/ non si legge (M9)', async () => {
  const snella = { id: 'doc_x', kind: 'synthesis', title: 'X', mapName: 'Elettricità', cls: '', disc: '', date: 1, overLimit: 0,
    hasHtml: true, hasPdf: false, progetto: P1, rel: 'Materiale Studio/Sintesi.html' };
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snella]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x', 'Materiale Studio/Sintesi.html': HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  assert.equal(app.SD.get('doc_x'), null);
  assert.deepEqual(d.letture, []);
});

test('specchio: la cartella ha cambiato nome o classe — si ritrova per id', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = 'Documenti/Sintesi — Elettricità - synthesis - ' + v.id + '.html';
  const snella = { id: v.id, kind: v.kind, title: v.title, mapName: v.mapName, cls: v.cls, disc: v.disc, date: v.date, overLimit: 0,
    hasHtml: true, hasPdf: false, progetto: P1, rel };
  const NUOVA = MAPPE + '/5R/Fisica/Elettricità e magnetismo';
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snella]) }));
  const d = disco({ [NUOVA]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(NUOVA, 'Elettricità e magnetismo', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  assert.equal(app.SD.get(v.id).html, HTML);
});

// ── 8. secondo giro (05/10): decisioni di Giacomo e difetti della revisione ──

const snellaDi = (v, rel) => ({ id: v.id, kind: v.kind, title: v.title, mapName: v.mapName, cls: v.cls, disc: v.disc, date: v.date,
  overLimit: 0, hasHtml: true, hasPdf: false, progetto: v.progetto, rel });
const relDi = v => 'Documenti/' + v.title + ' - ' + v.kind + ' - ' + v.id + '.html';
const NUOVA = MAPPE + '/5R/Fisica/Elettricità';

/* Punto 1 — «Via di mezzo»: nel reader resta il comportamento di oggi (si scartano i
   più vecchi e il nuovo si salva), tolto solo lo svuotamento totale. */
for (const [nome, opz] of [['__studente', { studente: true }], ['senza il core', { senzaCore: true }]]) {
  test('punto 1 reader (' + nome + '): cassetto pieno, il nuovo si salva e i più vecchi escono, come oggi; nessun avviso', async () => {
    const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a'.repeat(2000) }), vecchia({ id: 'doc_b', title: 'B', html: 'b'.repeat(2000) })]);
    const st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 1500);
    const d = disco({});
    if (opz.studente) d.api.__studente = true;
    const app = avvia({ storage: st, api: d.api, senzaCore: !!opz.senzaCore, senzaRegistro: true });
    const id = app.SD.save(docHtml({ title: 'Nuova', html: 'n'.repeat(1800) }));
    assert.equal(typeof id, 'string', 'il nuovo si salva');
    assert.deepEqual(voci(st).map(v => v.id), [id, 'doc_a'], 'esce il più vecchio, in coda');
    assert.equal(app.giri.toast.length, 0, 'nessun avviso nuovo nel reader');
  });
  test('punto 1 reader (' + nome + '): un documento solo che non entra non svuota niente', async () => {
    const prima = JSON.stringify([vecchia({ id: 'doc_a' })]);
    const st = magazzino({ [KEY]: prima }, prima.length + KEY.length + 10);
    const d = disco({});
    if (opz.studente) d.api.__studente = true;
    const app = avvia({ storage: st, api: d.api, senzaCore: !!opz.senzaCore, senzaRegistro: true });
    assert.equal(app.SD.save(docHtml({ title: 'Enorme', html: 'x'.repeat(5000) })), null);
    assert.equal(st.getItem(KEY), prima, 'mai «[]»');
    assert.equal(app.giri.toast.length, 0);
  });
}

/* Punto 3 — l'elenco delle cartelle può essere vecchio: prima di scrivere, la cartella
   deve portare ancora QUELL'id in `index.yaml` (colonna 0, main.js:3295-3297). */
test('punto 3 (PF) dopo un riordino il documento non va perso: si rifà l\'elenco e si scrive nel posto nuovo', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml({ title: 'Prima' }));
  await fine(app);
  /* riordino: la mappa passa a un'altra classe; l'elenco in memoria è quello di prima */
  d.vaults.set(NUOVA, d.vaults.get(ELE)); d.vaults.delete(ELE);
  d.o.vaults = [VAULT(NUOVA, 'Elettricità', P1)];
  const id = app.SD.save(docHtml({ title: 'Dopo' }));
  await fine(app);
  const v = voci(st).find(x => x.id === id);
  assert.ok(v.rel, 'la voce è snella');
  assert.equal(d.file(NUOVA, v.rel).toString('utf8'), HTML);
});

test('punto 3 la cartella sparisce fra la verifica e la scrittura («vault inesistente»): si rifà l\'elenco e si riprova', async () => {
  const st = magazzino(acceso());
  let mossa = false;
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    dopoLeggi: (q, vs) => {
      if (!mossa && q.vaultPath === ELE && q.relPath === 'index.yaml') {
        mossa = true; vs.set(NUOVA, vs.get(ELE)); vs.delete(ELE); d.o.vaults = [VAULT(NUOVA, 'Elettricità', P1)];
      }
    } });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml());
  await fine(app);
  const v = voci(st).find(x => x.id === id);
  assert.ok(v.rel, 'la voce è snella');
  assert.equal(d.file(NUOVA, v.rel).toString('utf8'), HTML);
});

test('punto 3 (PH) una mappa omonima con un altro id nel vecchio posto non riceve il file', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  app.SD.save(docHtml({ title: 'Prima' }));
  await fine(app);
  /* P1 va in 5R; al suo vecchio posto nasce un'altra mappa omonima, con un altro id */
  d.vaults.set(NUOVA, d.vaults.get(ELE));
  d.vaults.set(ELE, new Map([['index.yaml', Buffer.from('projectId: ' + P2 + '\nrootNodeLabel: Elettricità\n')]]));
  d.o.vaults = [VAULT(NUOVA, 'Elettricità', P1), VAULT(ELE, 'Elettricità', P2)];
  const id = app.SD.save(docHtml({ title: 'Dopo' }));
  await fine(app);
  const v = voci(st).find(x => x.id === id);
  assert.deepEqual(d.nomi(ELE), ['index.yaml'], 'l\'omonimo non riceve niente');
  assert.equal(d.file(NUOVA, v.rel).toString('utf8'), HTML);
});

test('punto 3 una cartella il cui index.yaml non conferma l\'id: nessuna scrittura, la voce resta col testo, il registro lo dice', async () => {
  for (const yaml of ['rootNodeLabel: Elettricità\n', '  projectId: ' + P1 + '\n', 'projectId: ' + P2 + '\n', null]) {
    const st = magazzino(acceso());
    const files = yaml == null ? {} : { 'index.yaml': yaml };
    const d = disco({ [ELE]: files }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
    const app = avvia({ storage: st, api: d.api });
    const id = app.SD.save(docHtml());
    await fine(app);
    assert.deepEqual(d.scritture, [], JSON.stringify(yaml));
    assert.equal(voci(st).find(x => x.id === id).html, HTML);
    assert.ok(app.giri.registro.length >= 1);
    assert.ok(d.giri.elenchi >= 2, 'l\'elenco si è rifatto una volta');
  }
});

test('punto 3 il Cestino conferma l\'id: un omonimo con un altro id nel vecchio posto non perde il file', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snellaDi(v, rel)]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  d.vaults.set(NUOVA, d.vaults.get(ELE));
  d.vaults.set(ELE, new Map([['index.yaml', Buffer.from('projectId: ' + P2 + '\n')], [rel, Buffer.from('un\'altra cosa')]]));
  d.o.vaults = [VAULT(NUOVA, 'Elettricità', P1), VAULT(ELE, 'Elettricità', P2)];
  app.SD.remove(v.id);
  await fine(app);
  assert.deepEqual(d.cestino.map(c => c.vaultPath), [NUOVA]);
  assert.ok(d.file(ELE, rel), 'il file dell\'omonimo resta');
});

/* Punto 4 — risalvare un documento mentre è aperta un'altra mappa: tiene il SUO progetto. */
test('punto 4 risalvato con un\'altra mappa aperta: la voce tiene il suo progetto, il file va nella sua cartella', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [SVI]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(SVI, 'Svizzera', P2)] });
  const app = avvia({ storage: st, api: d.api, progetto: P2 });
  const NUOVO = '<p>corretto nell\'editor</p>';
  const id = app.SD.save(docHtml({ html: NUOVO }));
  assert.equal(voci(st)[0].progetto, P1, 'subito, nel cassetto');
  await fine(app);
  const v = voci(st).find(x => x.id === id);
  assert.equal(v.progetto, P1);
  assert.equal(d.file(ELE, v.rel).toString('utf8'), NUOVO);
  assert.deepEqual(d.nomi(SVI), ['index.yaml']);
});

test('punto 4 anche una voce già snella, e anche per id: tiene il suo progetto', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snellaDi(v, rel)]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML }, [SVI]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(SVI, 'Svizzera', P2)] });
  const app = avvia({ storage: st, api: d.api, progetto: P2 });
  await app.SD.pronto();
  app.SD.save(docHtml({ id: v.id, title: 'Sintesi — Elettricità (rivista)', html: '<p>r</p>' }));
  await fine(app);
  assert.ok(voci(st).every(x => x.progetto === P1));
  assert.deepEqual(d.nomi(SVI), ['index.yaml']);
});

test('punto 4 una voce nuova prende il progetto aperto', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [SVI]: { 'index.yaml': 'x' } }, { vaults: [VAULT(SVI, 'Svizzera', P2)] });
  const app = avvia({ storage: st, api: d.api, progetto: P2 });
  const id = app.SD.save(docHtml({ title: 'Sintesi — Svizzera', mapName: 'Svizzera' }));
  assert.equal(voci(st).find(x => x.id === id).progetto, P2);
});

/* Punto 5 — PB e PE: lo specchio non perde la versione buona e non torna indietro. */
test('punto 5 (PB) un «non entra» che fallisce su una voce già snella: get dà ancora la versione di prima', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], scritturaFallisce: true });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  const id = app.SD.save(docHtml({ html: '<p>' + 'z'.repeat(3000) + '</p>' }));
  assert.equal(id, v.id);
  await fine(app);
  assert.equal(app.SD.get(v.id).html, HTML, 'la versione di prima, il cui file è intatto');
  assert.equal(d.file(ELE, rel).toString('utf8'), HTML);
  assert.equal(st.getItem(KEY), prima);
  assert.equal(app.giri.toast.length, 1, 'lo dice');
});

test('punto 5 (PE) due save della stessa chiave: vince sempre la più recente, in get e nel file', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', title: 'A', html: 'a' })]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 1500);
  let app, id;
  const visti = [];
  /* a ogni rilettura di un documento, che cosa dà get: mai la versione vecchia */
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true,
    quandoLeggo: (q) => { if (id && /^Documenti\//.test(q.relPath)) visti.push(app.SD.get(id) && app.SD.get(id).html); } });
  app = avvia({ storage: st, api: d.api });
  const V1 = '<p>' + 'u'.repeat(200) + '</p>';            // entra nel cassetto
  const V2 = '<p>' + 'w'.repeat(3000) + '</p>';           // non entra
  id = app.SD.save(docHtml({ html: V1 }));
  assert.equal(app.SD.save(docHtml({ html: V2 })), id);
  assert.equal(app.SD.get(id).html, V2);
  await fine(app);
  assert.equal(visti.length, 2, 'due riletture: la versione vecchia e la nuova');
  assert.ok(visti.every(h => h === V2), 'get non torna mai alla versione vecchia');
  assert.equal(app.SD.get(id).html, V2, 'nello specchio, la più recente');
  const v = voci(st).find(x => x.id === id);
  assert.equal(d.file(ELE, v.rel).toString('utf8'), V2, 'nel file, la più recente');
  const dopo = avvia({ storage: st, api: d.api });
  await dopo.SD.pronto();
  assert.equal(dopo.SD.get(id).html, V2, 'dopo un riavvio');
});

test('punto 5 (PE) due «non entra» della stessa chiave: vince la più recente', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', title: 'A', html: 'a' })]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const V1 = '<p>' + 'u'.repeat(3000) + '</p>', V2 = '<p>' + 'w'.repeat(3000) + '</p>';
  const id = app.SD.save(docHtml({ html: V1 }));
  app.SD.save(docHtml({ html: V2 }));
  await fine(app);
  assert.equal(app.SD.get(id).html, V2);
  const v = voci(st).find(x => x.id === id);
  assert.equal(d.file(ELE, v.rel).toString('utf8'), V2);
});

// ── 9. le sonde della revisione (05/10), adattate ───────────────────────────

test('S-M3f trovata per nome, ma il suo id è di due cartelle: nessuna scrittura', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia()]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [SVI]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(SVI, 'Svizzera', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto(); await app.SD._migra(); await fine(app);
  assert.deepEqual(d.scritture, []);
  assert.equal(voci(st)[0].html, HTML);
});

test('S-M12d una cartella SENZA id non prende un documento col progetto', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità')] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto(); await app.SD._migra(); await fine(app);
  assert.deepEqual(d.scritture, []);
  assert.equal(voci(st)[0].html, HTML);
});

test('S-M11e non entra, file scritto, ma nemmeno la voce snella entra: lo dice', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a', progetto: P1 })]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 40);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ title: 'Grande', html: '<p>' + 'x'.repeat(3000) + '</p>' }));
  await fine(app);
  assert.equal(d.scritture.length, 1, 'il file è stato scritto');
  assert.equal(st.getItem(KEY), prima);
  assert.equal(app.SD.get(id), null);
  assert.equal(app.giri.toast.length, 1, 'avviso «da qui non si riapre»');
  assert.match(app.giri.toast[0][0], /da qui non si riapre/);
});

test('S-X7 due migrazioni contemporanee: un file scritto una volta sola', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  await Promise.all([app.SD._migra(), app.SD._migra()]);
  await fine(app);
  assert.equal(d.scritture.length, 1);
});

/* le sonde X9, X10, X18 agiscono durante la RILETTURA del documento (non di index.yaml) */
const rilettura = q => /^Documenti\//.test(q.relPath);

test('S-X9 la voce cambia durante la migrazione: il file finale è la versione nuova', async () => {
  const NUOVO = '<p>versione nuova</p>';
  let app, fatto = false;
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    quandoLeggo: (q) => { if (!fatto && rilettura(q)) { fatto = true; app.SD.save(docHtml({ html: NUOVO })); } } });
  app = avvia({ storage: st, api: d.api });
  await app.SD.pronto(); await app.SD._migra(); await fine(app);
  const v = voci(st)[0];
  assert.equal(d.file(ELE, v.rel).toString('utf8'), NUOVO);
  const dopo = avvia({ storage: st, api: d.api });
  await dopo.SD.pronto();
  assert.equal(dopo.SD.get(v.id).html, NUOVO, 'dopo un riavvio');
});

test('S-X10 la voce tolta durante la migrazione non torna, e l\'elenco resta pulito', async () => {
  let app, fatto = false;
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia({ progetto: P1 })]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    quandoLeggo: (q) => { if (!fatto && rilettura(q)) { fatto = true; app.SD.remove('doc_1780000000000_1'); } } });
  app = avvia({ storage: st, api: d.api });
  await app.SD.pronto(); await app.SD._migra(); await fine(app);
  assert.deepEqual(voci(st), []);
  assert.equal(app.SD.get('doc_1780000000000_1'), null);
});

test('S-X11/X12 una cartella nata dopo l\'avvio: il salvataggio rifà l\'elenco e la trova', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const st = magazzino(acceso({ [KEY]: JSON.stringify([snellaDi(v, rel)]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  d.o.vaults.push(VAULT(SVI, 'Svizzera', P2));
  d.vaults.set(SVI, new Map([['index.yaml', Buffer.from('projectId: ' + P2 + '\n')]]));
  app.g.StorageManager.currentProjectId = P2;
  const id = app.SD.save(docHtml({ title: 'Sintesi — Svizzera', mapName: 'Svizzera' }));
  await fine(app);
  const n = voci(st).find(x => x.id === id);
  assert.ok(n.rel, 'la voce è snella');
  assert.equal(d.file(SVI, n.rel).toString('utf8'), HTML);
});

test('S-X18 tolto mentre il file «non entra» si scrive: non ricompare', async () => {
  const prima = JSON.stringify([vecchia({ id: 'doc_a', html: 'a', progetto: P1 })]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  let app, id, fatto = false;
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    quandoLeggo: (q) => { if (id && !fatto && rilettura(q)) { fatto = true; app.SD.remove(id); } } });
  app = avvia({ storage: st, api: d.api });
  id = app.SD.save(docHtml({ title: 'Grande', html: '<p>' + 'x'.repeat(3000) + '</p>' }));
  await fine(app);
  assert.ok(!voci(st).some(x => x.id === id));
  assert.equal(app.SD.get(id), null);
});

test('S-X19 risalvato «non entra» prima che lo specchio sia letto: get dà la versione nuova', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const GRANDE = '<p>' + 'y'.repeat(3000) + '</p>';
  const id = app.SD.save(docHtml({ html: GRANDE }));
  assert.equal(id, v.id);
  await app.SD.pronto();
  assert.equal(app.SD.get(id).html, GRANDE, 'lo specchio letto dopo non rimette la versione vecchia');
  await fine(app);
  assert.equal(d.file(ELE, rel).toString('utf8'), GRANDE);
  assert.equal(app.SD.get(id).html, GRANDE);
});

test('S-X20 «non entra» con 30 voci: l\'elenco resta a 30', async () => {
  const trenta = [];
  for (let i = 0; i < 30; i++) trenta.push(vecchia({ id: 'doc_1' + String(i).padStart(2, '0'), title: 'T' + i, html: 'a', progetto: P1 }));
  const prima = JSON.stringify(trenta);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ title: 'Grande', html: '<p>' + 'x'.repeat(3000) + '</p>' }));
  await fine(app);
  assert.ok(voci(st).some(x => x.id === id), 'la nuova è entrata');
  assert.equal(voci(st).length, 30);
});

test('S-X22 spento: remove di un documento già nel disco non tocca il disco, e il registro lo dice', async () => {
  const v = vecchia({ progetto: P1 });
  const rel = relDi(v);
  const st = magazzino({ [KEY]: JSON.stringify([snellaDi(v, rel)]) });
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  app.SD.remove(v.id);
  await fine(app);
  assert.deepEqual(d.cestino, []);
  assert.ok(d.file(ELE, rel));
  assert.ok(app.giri.registro.some(m => m.includes(rel)), 'il file resta, e il registro lo dice');
});

// ── 10. le sonde del terzo giro (05/10): codice giusto, ora fissato da un test ──

const GR = c => '<p>' + c.repeat(3000) + '</p>';

test('S-I1 «non entra» fallito prima che lo specchio sia letto: get dà la versione di prima, non quella non salvata', async () => {
  const v = vecchia({ progetto: P1 }); const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], scritturaFallisce: true });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ html: GR('z') }));     // prima che lo specchio sia pronto
  assert.equal(id, v.id);
  await fine(app);
  assert.equal(app.SD.get(id).html, HTML, 'la versione nel file');
});

test('S-I3 la scrittura vecchia fallisce mentre ne parte una nuova: la nuova non si perde', async () => {
  let app, n = 0, fatto = false;
  const st = magazzino(acceso(), KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)],
    quandoLeggo: q => { if (!fatto && q.relPath === 'index.yaml') { fatto = true; app.SD.save(docHtml({ html: GR('w') })); } } });
  const orig = d.api.saveVaultFile;
  d.api.saveVaultFile = async x => { n++; if (n === 1) return { ok: false, error: 'EACCES' }; return orig(x); };
  app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ html: GR('u') }));
  await fine(app);
  assert.ok(app.SD.get(id), 'la versione nuova c\'è');
  assert.equal(app.SD.get(id).html, GR('w'));
  const vv = voci(st).find(x => x.id === id);
  assert.equal(d.file(ELE, vv.rel).toString('utf8'), GR('w'));
});

test('S-C6 «vault inesistente» che non passa: esattamente due scritture, non un ciclo', async () => {
  const st = magazzino(acceso());
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  let n = 0;
  d.api.saveVaultFile = async () => { n++; return n > 6 ? { ok: false, error: 'EACCES' } : { ok: false, error: 'vault inesistente' }; };
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml());
  await fine(app);
  assert.equal(n, 2);
  assert.equal(voci(st).find(x => x.id === id).html, HTML, 'la voce resta col testo');
});

/* S-P4c fissa il comportamento di oggi: una voce che esiste già, SENZA progetto, non
   prende quello della mappa aperta; resta per la migrazione per nome. */
test('S-P4c una voce vecchia senza progetto, risalvata con un\'altra mappa aperta, non prende quel progetto', async () => {
  const st = magazzino(acceso({ [KEY]: JSON.stringify([vecchia()]) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [SVI]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(SVI, 'Svizzera', P2)] });
  const app = avvia({ storage: st, api: d.api, progetto: P2 });
  app.SD.save(docHtml({ html: '<p>rivista</p>' }));
  await fine(app);
  const v = voci(st)[0];
  assert.equal('progetto' in v, false, 'nessun progetto');
  assert.equal(v.html, '<p>rivista</p>', 'col testo, in attesa della migrazione per nome');
  assert.deepEqual(d.nomi(SVI), ['index.yaml']);
  assert.deepEqual(d.scritture, []);
});

test('S-P4d due «non entra» della stessa chiave, cambiata la mappa aperta fra i due: il file resta nella cartella del primo', async () => {
  const st = magazzino(acceso(), KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' }, [SVI]: { 'index.yaml': 'x' } },
    { vaults: [VAULT(ELE, 'Elettricità', P1), VAULT(SVI, 'Svizzera', P2)], ritardo: true });
  const app = avvia({ storage: st, api: d.api });
  const id = app.SD.save(docHtml({ html: GR('u') }));
  app.g.StorageManager.currentProjectId = P2;
  assert.equal(app.SD.save(docHtml({ html: GR('w') })), id);
  await fine(app);
  assert.deepEqual(d.nomi(SVI), ['index.yaml']);
  const vv = voci(st).find(x => x.id === id);
  assert.equal(vv.progetto, P1);
  assert.equal(d.file(ELE, vv.rel).toString('utf8'), GR('w'));
});

test('S-V4 due «non entra» su una voce snella, la seconda fallisce: get torna alla versione nel file, non alla prima non scritta', async () => {
  const v = vecchia({ progetto: P1 }); const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], scritturaFallisce: true });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  app.SD.save(docHtml({ html: GR('u') }));
  app.SD.save(docHtml({ html: GR('w') }));
  await fine(app);
  assert.equal(app.SD.get(v.id).html, HTML);
});

test('S-V7 il file è stato scritto ma la rilettura non torna: get non promette la versione di prima', async () => {
  const v = vecchia({ progetto: P1 }); const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)], altera: true });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  app.SD.save(docHtml({ html: GR('z') }));
  await fine(app);
  assert.equal(app.SD.get(v.id), null);
  assert.equal(app.giri.toast.length, 1, 'lo dice');
});

test('S-V10 stesso id, titolo nuovo: file scritto ma l\'elenco non entra → lo dice', async () => {
  const v = vecchia({ progetto: P1 }); const rel = relDi(v);
  const prima = JSON.stringify([snellaDi(v, rel)]);
  const st = magazzino(acceso({ [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + 100);
  const d = disco({ [ELE]: { 'index.yaml': 'x', [rel]: HTML } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api });
  await app.SD.pronto();
  app.SD.save(docHtml({ id: v.id, title: 'T' + 'x'.repeat(90), html: GR('z') }));
  await fine(app);
  assert.equal(st.getItem(KEY), prima);
  assert.equal(app.giri.toast.length, 1, 'un avviso');
  assert.match(app.giri.toast[0][0], /da qui non si riapre/);
});

// ── 0082 (B3 (a)): oltre il tetto non esce mai una voce col testo ─────────────
const K82 = 'mappai_cassetto_solo_indice';
const snellaN = (i) => ({ id: 'doc_2' + String(i).padStart(2, '0'), kind: 'synthesis', title: 'S' + i, mapName: 'Elettricità', cls: '4R',
  disc: 'Scienze', date: 1781000000000 - i, overLimit: 0, hasHtml: true, hasPdf: false, progetto: P1,
  rel: 'Documenti/S' + i + ' - synthesis - doc_2' + String(i).padStart(2, '0') + '.html' });

test('0082 S-X20 spento: come oggi, oltre il tetto esce la più vecchia anche se ha il testo', async () => {
  const elenco = []; for (let i = 0; i < 29; i++) elenco.push(snellaN(i));
  elenco.push(vecchia({ id: 'doc_1999', title: 'Col testo', html: '<p>unica copia</p>', progetto: P1 }));
  const st = magazzino(acceso({ [KEY]: JSON.stringify(elenco) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, vista: true });
  app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  assert.ok(!voci(st).some(x => x.id === 'doc_1999'), 'spento: esce, come oggi');
});

test('0082 M11 S-X20 acceso: esce la snella più vecchia, la voce col testo resta', async () => {
  const elenco = []; for (let i = 0; i < 29; i++) elenco.push(snellaN(i));
  elenco.push(vecchia({ id: 'doc_1999', title: 'Col testo', html: '<p>unica copia</p>', progetto: P1 }));
  const st = magazzino(acceso({ [K82]: '1', [KEY]: JSON.stringify(elenco) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, vista: true });
  const id = app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  const ids = voci(st).map(x => x.id);
  assert.ok(ids.includes(id), 'la nuova è entrata');
  assert.ok(ids.includes('doc_1999'), 'la voce col testo resta');
  assert.ok(!ids.includes('doc_228'), 'esce la snella più vecchia');
  assert.equal(ids.length, 30);
});

test('0082 S-X20 acceso: trenta voci col testo → nessuna esce, l\'elenco passa il tetto e un avviso lo dice', async () => {
  const trenta = [];
  for (let i = 0; i < 30; i++) trenta.push(vecchia({ id: 'doc_1' + String(i).padStart(2, '0'), title: 'T' + i, html: 'a', progetto: P1 }));
  const st = magazzino(acceso({ [K82]: '1', [KEY]: JSON.stringify(trenta) }));
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, vista: true });
  const toastPrima = app.giri.toast.length;
  const id = app.SD.save(docHtml({ title: 'Nuova' }));
  await fine(app);
  const ids = voci(st).map(x => x.id);
  assert.ok(ids.includes(id), 'la nuova è entrata');
  assert.ok(trenta.every(v => ids.includes(v.id)), 'nessuna voce col testo è uscita');
  assert.equal(ids.length, 31);
  assert.ok(app.giri.toast.length > toastPrima, 'un avviso dice che l\'elenco ha passato il tetto');
});

test('0082 S-X20 acceso, «non entra» con trenta voci col testo: la nuova entra e nessuna esce', async () => {
  const trenta = [];
  for (let i = 0; i < 30; i++) trenta.push(vecchia({ id: 'doc_1' + String(i).padStart(2, '0'), title: 'T' + i, html: 'a', progetto: P1 }));
  const prima = JSON.stringify(trenta);
  const st = magazzino(acceso({ [K82]: '1', [KEY]: prima }), prima.length + KEY.length + SWITCH.length + 1 + K82.length + 1 + 900);
  const d = disco({ [ELE]: { 'index.yaml': 'x' } }, { vaults: [VAULT(ELE, 'Elettricità', P1)] });
  const app = avvia({ storage: st, api: d.api, vista: true });
  const id = app.SD.save(docHtml({ title: 'Grande', html: '<p>' + 'x'.repeat(3000) + '</p>' }));
  await fine(app);
  const ids = voci(st).map(x => x.id);
  assert.ok(ids.includes(id), 'la nuova è entrata');
  assert.ok(trenta.every(v => ids.includes(v.id)), 'nessuna voce col testo è uscita');
});
