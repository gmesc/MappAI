'use strict';
/*
 * elabora-fonti.test.js — il PDF della fonte sta in `Fonti/` (packet 0059, ADR
 * 0011 rev. 1), provato sull'I/O VERO: `mappai-elabora.js`, il core delle fonti
 * e `mappai-vault-io.js` girano in una vm, davanti a un `electronAPI` finto che
 * tiene un disco in memoria e registra ogni `saveVaultFile` coi suoi parametri.
 * Le forme delle risposte sono quelle degli IPC di main.js: `read-vault-file`
 * (:1011, base64 + size), `vault-materials-list` (:1247, con il `relPath`
 * SBAGLIATO «Materiale Studio/…» anche per `Allegati/`, :1267 — di proposito),
 * `vault-sources-list` (:1285, `fonti.json` e `.txt` compresi, `files: []` per una
 * cartella assente o vuota), `save-vault-file` (:975, `ifAbsent` → exists).
 * Nessun vault vero: il disco è una Map. Nel banco l'`electronAPI` è finto, e
 * lì si può contare (trappola 35).
 * ⚠️ Negli assert sul DOM finto solo booleani, testi e attributi, mai l'elemento:
 * un assert fallito su un oggetto del DOM finto può far girare Node all'infinito.
 * Gli oggetti che nascono nella vm si confrontano come JSON.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FilesCore = require('../public/js/mappai-files-core.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
const riposo = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const RADICE = '/Users/prova/Documents/MappAI - file/Mappe/4R/Storia';
const A = RADICE + '/Svizzera';
const B = RADICE + '/Svizzera · 02';
const VECCHIO = RADICE + '/Guerra Fredda';
const NUDO = RADICE + '/Senza fonti';
const MAPPE = '/Users/prova/Documents/MappAI - file/Mappe';
const YAML = 'mappa: prova\n';

const byte = s => Buffer.from('%PDF-1.4 ' + s, 'utf8');
const TESTO = 'La Svizzera durante la seconda guerra mondiale restò neutrale, circondata dalle potenze dell\'Asse.';

// ── il disco in memoria ─────────────────────────────────────────────────────
/* vaults: { [vaultPath]: { [relPath]: Buffer | string } }. Un vault «esiste»
   se ha una voce: `save-vault-file` risponde «vault inesistente» altrimenti. */
function disco(iniziale, opzioni) {
  const o = opzioni || {};
  const vaults = new Map();
  const crea = (vp, files) => {
    if (!vaults.has(vp)) vaults.set(vp, new Map());
    const m = vaults.get(vp);
    for (const [rel, c] of Object.entries(files || {})) m.set(rel, Buffer.isBuffer(c) ? Buffer.from(c) : Buffer.from(String(c), 'utf8'));
  };
  for (const [vp, files] of Object.entries(iniziale || {})) crea(vp, files);
  const scritture = [], letture = [];
  const pausa = () => (o.ritardo ? new Promise(r => setImmediate(r)) : Promise.resolve());
  const cartella = (vp, dir) => {
    const v = vaults.get(vp); if (!v) return null;
    const out = [];
    for (const [rel, buf] of v) {
      const segs = rel.split('/');
      if (segs.length === 2 && segs[0] === dir && segs[1].charAt(0) !== '.') out.push({ name: segs[1], size: buf.length });
    }
    return out;
  };
  const api = {
    async saveVaultFile(data) {
      const d = data || {};
      scritture.push({ vaultPath: d.vaultPath, relPath: d.relPath, ifAbsent: d.ifAbsent, potaVarianti: d.potaVarianti,
        base64: d.base64 != null, text: d.text != null });
      await pausa();
      const v = vaults.get(d.vaultPath);
      if (!d.vaultPath || !v) return { ok: false, error: 'vault inesistente' };
      const safe = FilesCore.sanitizeVaultRelPath(d.relPath);
      if (!safe) return { ok: false, error: 'percorso non valido: ' + d.relPath };
      if (d.base64 == null && d.text == null) return { ok: false, error: 'nessun contenuto' };
      if (d.ifAbsent && v.has(safe)) return { ok: false, error: 'exists', exists: true };
      v.set(safe, d.base64 != null ? Buffer.from(String(d.base64), 'base64') : Buffer.from(String(d.text), 'utf8'));
      return { ok: true, path: d.vaultPath + '/' + safe, potate: [], orfani: [] };
    },
    async readVaultFile(data) {
      const d = data || {};
      letture.push({ vaultPath: d.vaultPath, relPath: d.relPath });
      await pausa();
      const v = vaults.get(d.vaultPath);
      if (!d.vaultPath || !v) return { ok: false, error: 'vault inesistente' };
      const safe = FilesCore.sanitizeVaultRelPath(d.relPath);
      if (!safe) return { ok: false, error: 'percorso non valido: ' + d.relPath };
      if (!v.has(safe)) return { ok: false, error: 'file non trovato: ' + safe };
      const buf = v.get(safe);
      if (o.tetto != null && buf.length > o.tetto) return { ok: false, error: 'file troppo grande' };
      return { ok: true, base64: buf.toString('base64'), size: buf.length };
    },
    async vaultSourcesList(data) {
      const d = data || {};
      await pausa();
      const files = cartella(d.vaultPath, 'Fonti');
      if (!files) return { ok: false, error: 'vault inesistente' };
      return { ok: true, files: files.map(f => ({ name: f.name, relPath: 'Fonti/' + f.name, size: f.size, mtime: 1,
        ext: (path.extname(f.name) || '').replace('.', '').toLowerCase() })) };
    },
    async vaultMaterialsList(data) {
      const d = data || {};
      await pausa();
      const dir = d.dir === 'Allegati' ? 'Allegati' : 'Materiale Studio';
      const files = cartella(d.vaultPath, dir);
      if (!files) return { ok: false, error: 'vault inesistente' };
      /* la forma di main.js:1267: relPath «Materiale Studio/…» anche per Allegati/ */
      return { ok: true, manifest: null, files: files.map(f => ({ name: f.name, relPath: 'Materiale Studio/' + f.name, size: f.size, mtime: 1 })) };
    }
  };
  const file = (vp, rel) => { const v = vaults.get(vp); return v && v.has(rel) ? v.get(rel) : null; };
  const nomi = vp => { const v = vaults.get(vp); return v ? [...v.keys()].sort() : []; };
  /* l'impronta di un vault: nomi e contenuti, per dire «non è cambiato» */
  const impronta = vp => { const v = vaults.get(vp); return v ? JSON.stringify([...v].sort().map(([k, b]) => [k, b.toString('base64')])) : 'assente'; };
  const indice = vp => { const b = file(vp, 'Fonti/fonti.json'); return b ? JSON.parse(b.toString('utf8')) : null; };
  /* `vault-relocate` (main.js:1181): la cartella intera sotto un altro percorso, e la vecchia non c'è più */
  const sposta = (da, a) => { vaults.set(a, vaults.get(da)); vaults.delete(da); };
  return { api, crea, scritture, letture, file, nomi, impronta, indice, sposta, esiste: vp => vaults.has(vp) };
}

// ── un DOM finto, quanto basta a render(), _collectPdfs, pickPdf e al modale ──
function domFinto() {
  let body = null;
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', style: {}, attributi: {}, figli: [], parentNode: null,
      clic: 0, innerHTML: '', value: '', files: null, dataset: {}, _sel: {}, _tutti: {},
      setAttribute(k, v) { this.attributi[k] = String(v); if (k === 'id') this.id = String(v); },
      getAttribute(k) { return k === 'id' ? (this.id || null) : (k in this.attributi ? this.attributi[k] : null); },
      hasAttribute(k) { return this.getAttribute(k) != null; },
      appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.figli.push(c); return c; },
      remove() { const p = this.parentNode; if (p) { p.figli = p.figli.filter(x => x !== this); this.parentNode = null; } },
      click() { this.clic++; },
      addEventListener() { }, removeEventListener() { },
      querySelector(sel) { if (!this._sel[sel]) this._sel[sel] = { onclick: null }; return this._sel[sel]; },
      querySelectorAll(sel) { return this._tutti[sel] || []; },
      get isConnected() { let n = this; while (n) { if (n === body) return true; n = n.parentNode; } return false; }
    };
    return e;
  }
  body = el('body');
  const cerca = (n, id) => { for (const c of n.figli) { if (c.id === id) return c; const x = cerca(c, id); if (x) return x; } return null; };
  const document = {
    body, head: el('head'),
    createElement: tag => el(tag),
    getElementById: id => cerca(body, id),
    addEventListener() { }, removeEventListener() { }
  };
  return { document, body, el };
}

// ── ELABORA vero in una vm ──────────────────────────────────────────────────
function elabora(api, o = {}) {
  const d = domFinto();
  const local = new Map(Object.entries(o.local || {}));
  const avvisi = [];
  const g = {
    console: { log() { }, info() { }, warn: (...a) => avvisi.push(a.join(' ')), error: (...a) => avvisi.push(a.join(' ')) },
    document: d.document, setTimeout, clearTimeout,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => { local.set(k, String(v)); }, removeItem: k => { local.delete(k); } },
    File, atob, btoa, TextDecoder,
    appState: { sources: [], db: { nodes: [], links: [], studySets: [] }, activeVaultPath: null, rootNodeLabel: 'Svizzera', extractionMode: 'mindmap' },
    electronAPI: api,
    /* la STESSA funzione dell'upload, finta: il testo dipende dai byte */
    extractTextFromPDF: async f => 'Testo estratto da ' + (f && f.name) + ': ' + Buffer.from(await f.arrayBuffer()).toString('utf8') + ' — ' + TESTO,
    showPrompt: (titolo, def, cb) => { cb(o.incolla || ''); }
  };
  g.window = g;
  const ctx = vm.createContext(g);
  vm.runInContext(JS('mappai-files-core.js'), ctx);
  vm.runInContext(JS('mappai-pipeline-core.js'), ctx);
  vm.runInContext(JS('mappai-fonti-core.js'), ctx);
  vm.runInContext(JS('mappai-elabora.js'), ctx);
  return { g, E: g.MappAIElabora, s: g.appState, dom: d, local, avvisi };
}

/* una fonte di CREA: `{ id, type, content, file }`, senza nome (app.js:1249, :1290) */
const fonteDiCrea = (nome, contenuto) => ({ id: 'source-1', type: 'pdf', content: 'Testo estratto: ' + TESTO,
  file: new File([byte(contenuto || 'A')], nome || 'x.pdf', { type: 'application/pdf' }) });
const pdf = (nome, contenuto) => new File([byte(contenuto)], nome, { type: 'application/pdf' });

const pdfScritti = D => D.scritture.filter(w => /^Fonti\/.*\.pdf$/i.test(w.relPath || ''));
/* ogni `vaultRel` non vuoto dell'indice di vp è un file che c'è nel disco di vp */
function vaultRelDelVault(D, vp) {
  const ix = D.indice(vp);
  assert.ok(ix, 'fonti.json in ' + vp);
  for (const v of ix.fonti) if (v.vaultRel) assert.ok(!!D.file(vp, v.vaultRel), 'vaultRel «' + v.vaultRel + '» non c\'è in ' + vp);
  return ix;
}
/* niente fuori dal vault: nessun `vaultDi`, nessun valore che comincia per «/» */
function indicePulito(D, vp) {
  const b = D.file(vp, 'Fonti/fonti.json');
  if (!b) return;
  const txt = b.toString('utf8');
  assert.ok(!/vaultDi/.test(txt), 'vaultDi in fonti.json di ' + vp);
  const visita = x => {
    if (typeof x === 'string') assert.ok(!x.startsWith('/'), 'percorso assoluto in fonti.json: ' + x);
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { assert.notEqual(k, 'vaultDi'); visita(v); }
  };
  visita(JSON.parse(txt));
}

// ═══ vault vecchio (solo Allegati/x.pdf) ═══════════════════════════════════

test('vault vecchio (solo Allegati/x.pdf): il ripristino dà una fonte daAllegati; il testo si estrae in memoria; flush e indice non scrivono niente', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') } });
  const prima = D.impronta(VECCHIO);
  const h = elabora(D.api);
  h.s.activeVaultPath = VECCHIO;

  const n = await h.E.ripristinaFontiDalVault(VECCHIO);
  assert.equal(n, 1);
  const f = J(h.s.sources);
  assert.equal(f.length, 1);
  assert.equal(f[0].name, 'x.pdf');
  assert.equal(f[0].vaultRel, 'Allegati/x.pdf');      // ricomposto, non «Materiale Studio/x.pdf»
  assert.equal(f[0].daAllegati, true);
  assert.equal(f[0].vaultDi, VECCHIO);

  const fatti = await h.E.completaTestiMancanti();
  assert.equal(fatti, 1);
  assert.ok(h.s.sources[0].content.includes('guerra fredda'), 'il testo del PDF di Allegati/ resta in memoria');
  assert.equal(D.scritture.length, 0, 'completaTestiMancanti non scrive su un vault vecchio');

  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: false }), false);
  assert.equal(D.scritture.length, 0, 'flush su un vault vecchio: zero scritture');

  assert.equal(await h.E.salvaIndiceFonti(), false);
  assert.equal(D.scritture.length, 0, 'salvaIndiceFonti() su un vault vecchio: zero scritture');
  assert.equal(D.impronta(VECCHIO), prima);
  assert.ok(!D.nomi(VECCHIO).some(r => r.startsWith('Fonti/')), 'non nasce Fonti/');
});

test('vault vecchio, «Salva vault» sulla stessa cartella con un PDF di CREA in memoria: nessuna scrittura', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') } });
  const prima = D.impronta(VECCHIO);
  const h = elabora(D.api);
  h.s.activeVaultPath = VECCHIO;
  h.s.sources.push(fonteDiCrea('y.pdf', 'altro'));
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: false }), false);
  assert.equal(D.scritture.length, 0);
  assert.equal(D.impronta(VECCHIO), prima);
});

// ═══ vault senza nessun PDF ════════════════════════════════════════════════

test('vault senza nessun PDF, fonti vuote: il flush non fa nascere fonti.json', async () => {
  const D = disco({ [NUDO]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = NUDO;
  /* il ripristino imposta a quale vault sono le fonti (era la via per cui la
     guardia di salvaIndiceFonti passava con fonti: []) */
  assert.equal(await h.E.ripristinaFontiDalVault(NUDO), 0);
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(D.scritture.length, 0, 'zero scritture');
  assert.equal(await h.E.salvaIndiceFonti(), false);
  /* e nemmeno su un vault nato adesso: mai un `fonti: []` dove Fonti/ non c'era */
  await h.E.flushSourcesToVault({ vaultNuovo: true });
  assert.equal(D.scritture.length, 0, 'nessun fonti.json vuoto');
  assert.equal(D.file(NUDO, 'Fonti/fonti.json'), null);
});

// ═══ due vault di fila ═════════════════════════════════════════════════════

test('due vault di fila: B riceve il suo Fonti/x.pdf e un fonti.json che punta a un file suo; A non cambia', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML }, [B]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));

  h.s.activeVaultPath = A;
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  assert.ok(!!D.file(A, 'Fonti/x.pdf'), 'A ha il suo PDF');
  vaultRelDelVault(D, A);
  const dopoA = D.impronta(A);

  h.s.activeVaultPath = B;
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  assert.ok(!!D.file(B, 'Fonti/x.pdf'), 'B riceve il suo PDF');
  assert.equal(D.file(B, 'Fonti/x.pdf').toString('base64'), byte('svizzera').toString('base64'));
  const ix = vaultRelDelVault(D, B);
  assert.equal(ix.schema, 'mappai-fonti@1');
  assert.ok(ix.fonti.some(v => v.vaultRel === 'Fonti/x.pdf'));
  assert.equal(D.impronta(A), dopoA, 'A non cambia');
  assert.equal(h.s.sources[0].vaultDi, B);
});

// ═══ fonte ripristinata da A senza File, flush su B ════════════════════════

test('fonte ripristinata da A senza File, flush su B nato adesso: nell\'indice di B non c\'è Fonti/x.pdf, e il PDF non si copia', async () => {
  const indiceA = { schema: 'mappai-fonti@1', mappa: 'Svizzera', fonti: [{ id: 'src1', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf', caratteri: TESTO.length, testoRel: 'Fonti/x.txt' }] };
  const D = disco({
    [A]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('svizzera'), 'Fonti/x.txt': TESTO, 'Fonti/fonti.json': JSON.stringify(indiceA) },
    [B]: { 'index.yaml': YAML }
  });
  const primaA = D.impronta(A);
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  assert.equal(h.s.sources[0].content, TESTO);

  h.s.activeVaultPath = B;
  await h.E.flushSourcesToVault({ vaultNuovo: true });
  /* B è nato adesso: il suo indice NASCE (§1), con la fonte e il suo testo, ma
     senza il vaultRel di A — nessun PDF scritto, e l'indice c'è lo stesso */
  const ix = D.indice(B);
  assert.ok(!!ix, 'l\'indice di B deve esistere');
  assert.ok(!ix.fonti.some(v => v.vaultRel === 'Fonti/x.pdf'), 'vaultRel di A nell\'indice di B');
  vaultRelDelVault(D, B);
  const vx = ix.fonti.find(v => v.nome === 'x.pdf');
  assert.ok(!!vx, 'la voce x.pdf nell\'indice di B');
  assert.equal(vx.vaultRel, '');
  assert.ok(!!vx.testoRel && !!D.file(B, vx.testoRel), 'il testo della fonte è nel disco di B: ' + vx.testoRel);
  assert.equal(D.file(B, 'Fonti/x.pdf'), null, 'niente copie da un vault all\'altro');
  assert.equal(pdfScritti(D).length, 0);
  assert.equal(D.impronta(A), primaA);
});

// ═══ stessi byte già in Fonti/ ═════════════════════════════════════════════

test('stessi byte già in Fonti/: nessuna seconda scrittura del PDF, vaultRel = il file che c\'era', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('svizzera') } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, 0, 'nessuna scrittura del PDF');
  assert.equal(h.s.sources[0].vaultRel, 'Fonti/x.pdf');
  assert.equal(h.s.sources[0].vaultDi, A);
  assert.ok(!D.nomi(A).some(r => /·/.test(r)), 'nessun « · 02»');
  assert.ok(vaultRelDelVault(D, A).fonti.some(v => v.vaultRel === 'Fonti/x.pdf'));
});

test('stessi byte in «x · 02.pdf» e «x.pdf» diverso: si adotta « · 02»; byte diversi a parità di dimensione: si scrive « · 02»', async () => {
  /* «AAAA» e «BBBB»: stessa dimensione, byte diversi — l'elenco non basta, si leggono i byte */
  const D = disco({ [A]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('AAAA'), 'Fonti/x · 02.pdf': byte('BBBB') } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  h.s.sources.push(fonteDiCrea('x.pdf', 'BBBB'));
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, 0);
  assert.equal(h.s.sources[0].vaultRel, 'Fonti/x · 02.pdf');

  const D2 = disco({ [A]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('AAAA') } });
  const h2 = elabora(D2.api);
  h2.s.activeVaultPath = A;
  h2.s.sources.push(fonteDiCrea('x.pdf', 'CCCC'));
  await h2.E.flushSourcesToVault({ vaultNuovo: false });
  assert.deepEqual(pdfScritti(D2).map(w => w.relPath), ['Fonti/x · 02.pdf']);
  assert.equal(D2.file(A, 'Fonti/x.pdf').toString('utf8'), byte('AAAA').toString('utf8'), 'l\'originale non si tocca');
  assert.equal(h2.s.sources[0].vaultRel, 'Fonti/x · 02.pdf');
});

// ═══ due flush in gara ═════════════════════════════════════════════════════

test('due flush in gara sullo stesso vault (senza await fra i due): una sola scrittura del PDF, nessun « · 02»', async () => {
  for (const [primo, secondo] of [[true, true], [true, false]]) {
    const D = disco({ [B]: { 'index.yaml': YAML } }, { ritardo: true });
    const h = elabora(D.api);
    h.s.activeVaultPath = B;
    h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
    const p1 = h.E.flushSourcesToVault({ vaultNuovo: primo });     // la pipeline
    const p2 = h.E.flushSourcesToVault({ vaultNuovo: secondo });   // il ramo 1, in gara
    await Promise.all([p1, p2]);
    const pdfIn = D.nomi(B).filter(r => /^Fonti\/.*\.pdf$/i.test(r));
    assert.deepEqual(pdfIn, ['Fonti/x.pdf'], 'gara ' + primo + '/' + secondo + ': ' + pdfIn.join(', '));
    assert.equal(pdfScritti(D).length, 1, 'gara ' + primo + '/' + secondo + ': una sola scrittura del PDF');
    vaultRelDelVault(D, B);
  }
});

// ═══ «Aggiungi PDF» su un vault vecchio ════════════════════════════════════

test('«Aggiungi PDF» su un vault vecchio: Fonti/y.pdf e fonti.json scritti, solo col PDF nuovo; riaperto, due voci (B2 «per nome»)', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') } });
  const allegatiPrima = JSON.stringify(D.nomi(VECCHIO).filter(r => r.startsWith('Allegati/')).map(r => [r, D.file(VECCHIO, r).toString('base64')]));
  const h = elabora(D.api);
  h.s.activeVaultPath = VECCHIO;
  await h.E.ripristinaFontiDalVault(VECCHIO);
  await h.E.onPdf({ files: [pdf('y.pdf', 'documento nuovo')], value: 'C:\\fakepath\\y.pdf' });

  assert.ok(!!D.file(VECCHIO, 'Fonti/y.pdf'), 'Fonti/y.pdf scritto');
  const ix = vaultRelDelVault(D, VECCHIO);
  assert.equal(ix.fonti.length, 1);
  assert.equal(ix.fonti[0].nome, 'y.pdf');
  assert.equal(ix.fonti[0].vaultRel, 'Fonti/y.pdf');
  assert.ok(!ix.fonti.some(v => /^Allegati\//.test(v.vaultRel || '') || v.nome === 'x.pdf'), 'la fonte di Allegati/ non entra nell\'indice');
  assert.ok(!D.scritture.some(w => /^Allegati\//.test(w.relPath)), 'niente si scrive in Allegati/');
  const allegatiDopo = JSON.stringify(D.nomi(VECCHIO).filter(r => r.startsWith('Allegati/')).map(r => [r, D.file(VECCHIO, r).toString('base64')]));
  assert.equal(allegatiDopo, allegatiPrima, 'Allegati/ identica');

  /* riaperto (un'altra sessione, lo stesso disco) */
  const r = elabora(D.api);
  r.s.activeVaultPath = VECCHIO;
  assert.equal(await r.E.ripristinaFontiDalVault(VECCHIO), 2);
  const voci = J(r.s.sources);
  const y = voci.find(v => v.name === 'y.pdf'), x = voci.find(v => v.name === 'x.pdf');
  assert.ok(y && x, 'le due voci: ' + voci.map(v => v.name).join(', '));
  assert.equal(y.vaultRel, 'Fonti/y.pdf');
  assert.ok(!y.daAllegati);
  assert.ok(y.content.includes('documento nuovo'), 'il testo torna dal .txt');
  assert.equal(x.vaultRel, 'Allegati/x.pdf');
  assert.equal(x.daAllegati, true);

  /* all'apertura manca solo il testo di x.pdf, che sta in Allegati/: si estrae e
     resta in memoria, ma non si scrive niente — nemmeno ora che Fonti/ c'è (§4) */
  const n = D.scritture.length, prima = D.impronta(VECCHIO);
  assert.equal(await r.E.completaTestiMancanti(), 1);
  assert.ok(r.s.sources.find(v => v.name === 'x.pdf').content.includes('guerra fredda'));
  assert.equal(D.scritture.length, n, 'nessuna scrittura se le fonti completate stanno tutte in Allegati/');
  assert.equal(D.impronta(VECCHIO), prima);
});

test('«Aggiungi PDF» su un vault vecchio con lo stesso nome del PDF di Allegati/: riaperto, una voce sola, da Fonti/', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') } });
  const h = elabora(D.api);
  h.s.activeVaultPath = VECCHIO;
  await h.E.ripristinaFontiDalVault(VECCHIO);
  await h.E.onPdf({ files: [pdf('x.pdf', 'guerra fredda, seconda edizione')], value: '' });
  assert.ok(!!D.file(VECCHIO, 'Fonti/x.pdf'));
  assert.ok(!!D.file(VECCHIO, 'Allegati/x.pdf'), 'il file di Allegati/ resta sul disco');

  const r = elabora(D.api);
  r.s.activeVaultPath = VECCHIO;
  assert.equal(await r.E.ripristinaFontiDalVault(VECCHIO), 1);
  const v = J(r.s.sources)[0];
  assert.equal(v.vaultRel, 'Fonti/x.pdf');
  assert.ok(!v.daAllegati);
});

// ═══ «Aggiungi PDF» e «Incolla testo» su un vault con fonti.json ═══════════

test('«Aggiungi PDF» su un vault con fonti.json: l\'indice riscritto ha la voce nuova; «Incolla testo» ci aggiunge il testo; su un vault vecchio «Incolla testo» non scrive', async () => {
  const indiceA = { schema: 'mappai-fonti@1', mappa: 'Svizzera', fonti: [{ id: 'src1', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf', caratteri: TESTO.length, testoRel: 'Fonti/x.txt' }] };
  const INCOLLATO = 'Un appunto del docente sulla neutralità armata e sul ridotto nazionale, abbastanza lungo.';
  const D = disco({
    [A]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('svizzera'), 'Fonti/x.txt': TESTO, 'Fonti/fonti.json': JSON.stringify(indiceA) },
    [VECCHIO]: { 'index.yaml': YAML, 'Allegati/z.pdf': byte('guerra fredda') }
  });
  const h = elabora(D.api, { incolla: INCOLLATO });
  h.s.activeVaultPath = A;
  await h.E.ripristinaFontiDalVault(A);

  await h.E.onPdf({ files: [pdf('y.pdf', 'secondo documento')], value: '' });
  let ix = vaultRelDelVault(D, A);
  assert.ok(ix.fonti.some(v => v.nome === 'y.pdf' && v.vaultRel === 'Fonti/y.pdf'), 'la voce nuova');
  assert.ok(ix.fonti.some(v => v.nome === 'x.pdf' && v.vaultRel === 'Fonti/x.pdf'), 'la voce di prima resta');

  h.E.addTextPrompt();
  await riposo();
  ix = vaultRelDelVault(D, A);
  const testo = ix.fonti.find(v => v.tipo === 'text');
  assert.ok(testo, 'l\'indice contiene il testo incollato');
  assert.ok(!!testo.testoRel && D.file(A, testo.testoRel).toString('utf8') === INCOLLATO);
  assert.equal(ix.fonti.length, 3);

  /* un vault vecchio senza Fonti/: il testo resta in memoria, nel vault niente */
  h.s.activeVaultPath = VECCHIO;
  await h.E.ripristinaFontiDalVault(VECCHIO);
  const primaV = D.impronta(VECCHIO), n = D.scritture.length;
  h.E.addTextPrompt();
  await riposo();
  assert.equal(D.scritture.length, n, 'zero scritture sul vault vecchio');
  assert.equal(D.impronta(VECCHIO), primaV);
  assert.ok(h.s.sources.some(s => s.type === 'text' && s.content === INCOLLATO), 'il testo resta in memoria');
});

// ═══ «Aggiungi PDF» dalla console ══════════════════════════════════════════

test('«Aggiungi PDF» dalla console: senza #elab-pdf-input nasce un campo file senza id, nascosto in body, e si clicca; scelto il file, PDF e indice sul disco', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(h.dom.document.getElementById('elab-pdf-input'), null);
  h.E.runSourceAction('src-pdf');                         // la console passa di qui (mappai-elabora-console.js:3070-3071)
  const campi = h.dom.body.figli.filter(e => e.tagName === 'INPUT');
  assert.equal(campi.length, 1, 'un campo file in body');
  const c = campi[0];
  assert.equal(c.type, 'file');
  assert.ok(/pdf/i.test(String(c.accept)), 'accept: ' + c.accept);
  assert.equal(c.id, '', 'senza id (niente doppione di #elab-pdf-input)');
  assert.equal(c.hasAttribute('id'), false);
  assert.equal(c.clic, 1, 'cliccato');
  assert.ok(c.style.display === 'none' || c.hidden === true, 'nascosto');
  assert.equal(typeof c.onchange, 'function');

  c.files = [pdf('z.pdf', 'dalla console')];
  c.onchange({ target: c });
  for (let i = 0; i < 40 && !D.file(A, 'Fonti/fonti.json'); i++) await riposo(1);
  await riposo();
  assert.ok(!!D.file(A, 'Fonti/z.pdf'), 'il PDF scelto è in Fonti/');
  assert.ok(vaultRelDelVault(D, A).fonti.some(v => v.vaultRel === 'Fonti/z.pdf'), 'e nell\'indice');
  assert.equal(c.isConnected, false, 'il campo se ne va dopo la scelta');
  assert.ok(D.scritture.every(w => w.potaVarianti === false));
});

test('«Aggiungi PDF» dalla console, scelta annullata: il campo se ne va e non si scrive niente; con #elab-pdf-input si clicca quello', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  h.E.pickPdf();
  const c = h.dom.body.figli.find(e => e.tagName === 'INPUT');
  assert.ok(!!c);
  assert.equal(typeof c.oncancel, 'function');
  c.oncancel({ target: c });
  assert.equal(c.isConnected, false);
  assert.equal(h.dom.body.figli.filter(e => e.tagName === 'INPUT').length, 0);
  assert.equal(D.scritture.length, 0);

  /* la vista vecchia: il suo campo c'è, si usa quello e non se ne crea un altro */
  const vecchio = h.dom.el('input');
  vecchio.id = 'elab-pdf-input';
  h.dom.body.appendChild(vecchio);
  h.E.pickPdf();
  assert.equal(vecchio.clic, 1);
  assert.equal(h.dom.body.figli.filter(e => e.tagName === 'INPUT').length, 1);
});

// ═══ niente fuori dal vault ════════════════════════════════════════════════

test('niente fuori dal vault: ogni scrittura delle fonti ha potaVarianti === false; fonti.json senza vaultDi né percorsi assoluti', async () => {
  const INCOLLATO = 'Un appunto del docente abbastanza lungo da diventare una fonte di testo vera.';
  const D = disco({
    [A]: { 'index.yaml': YAML },
    [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') },
    [B]: { 'index.yaml': YAML, 'Fonti/w.pdf': byte('gradino due') }
  });
  /* 1. il flush su un vault nato adesso: PDF, .txt, indice */
  const h = elabora(D.api, { incolla: INCOLLATO });
  h.s.activeVaultPath = A;
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  await h.E.flushSourcesToVault({ vaultNuovo: true });
  /* 2. «Incolla testo» dove Fonti/ c'è */
  h.E.addTextPrompt();
  await riposo();
  /* 3. «Aggiungi PDF» su un vault vecchio */
  h.s.activeVaultPath = VECCHIO;
  await h.E.ripristinaFontiDalVault(VECCHIO);
  await h.E.onPdf({ files: [pdf('y.pdf', 'nuovo')], value: '' });
  /* 4. il testo che manca, da un vault con Fonti/ ma senza indice (gradino 2) */
  const r = elabora(D.api);
  r.s.activeVaultPath = B;
  assert.equal(await r.E.ripristinaFontiDalVault(B), 1);
  assert.equal(await r.E.completaTestiMancanti(), 1);
  const ixB = vaultRelDelVault(D, B);
  assert.ok(ixB.fonti.some(v => v.vaultRel === 'Fonti/w.pdf' && v.testoRel === 'Fonti/w.txt'), 'il testo estratto si scrive dove Fonti/ c\'è');

  const tipi = new Set(D.scritture.map(w => /\.pdf$/i.test(w.relPath) ? 'pdf' : /fonti\.json$/.test(w.relPath) ? 'indice' : /\.txt$/.test(w.relPath) ? 'txt' : 'altro'));
  assert.deepEqual([...tipi].sort(), ['indice', 'pdf', 'txt'], 'la prova tocca le tre scritture della strada delle fonti');
  const pota = D.scritture.filter(w => w.potaVarianti !== false).map(w => w.relPath + ' → ' + w.potaVarianti);
  assert.deepEqual(pota, [], 'scritture senza potaVarianti:false');
  assert.ok(D.scritture.filter(w => /\.pdf$/i.test(w.relPath)).every(w => w.ifAbsent === true), 'il PDF non sovrascrive mai');
  for (const vp of [A, VECCHIO, B]) indicePulito(D, vp);
  assert.ok(!!D.file(A, 'Fonti/fonti.json') && !!D.file(VECCHIO, 'Fonti/fonti.json') && !!D.file(B, 'Fonti/fonti.json'));
});

// ═══ gli id delle fonti dopo un riavvio ════════════════════════════════════

test('dopo un riavvio «Aggiungi PDF» non riusa l\'id di una fonte ripristinata, e il flush non scrive i byte di un PDF sotto il nome di un altro', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML }, [B]: { 'index.yaml': YAML } });
  /* sessione 1: X.pdf aggiunto su A, e il suo id entra in fonti.json */
  const h1 = elabora(D.api);
  h1.s.activeVaultPath = A;
  await h1.E.onPdf({ files: [pdf('X.pdf', 'contenuto di X')], value: '' });
  const idX = D.indice(A).fonti[0].id;
  /* riavvio: il contatore riparte da 0; A si riapre e si aggiunge Y.pdf */
  const h2 = elabora(D.api);
  h2.s.activeVaultPath = A;
  assert.equal(await h2.E.ripristinaFontiDalVault(A), 1);
  await h2.E.onPdf({ files: [pdf('Y.pdf', 'contenuto di Y')], value: '' });
  const ids = h2.s.sources.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'id ripetuti in memoria: ' + ids.join(', '));
  const idsIx = D.indice(A).fonti.map(v => v.id);
  assert.equal(new Set(idsIx).size, idsIx.length, 'id ripetuti in fonti.json: ' + idsIx.join(', '));
  assert.ok(idsIx.includes(idX), 'l\'id di X resta il suo');
  /* «Esporta nel Vault» su B, nato adesso */
  h2.s.activeVaultPath = B;
  await h2.E.flushSourcesToVault({ vaultNuovo: true });
  assert.equal(D.file(B, 'Fonti/Y.pdf').toString('utf8'), byte('contenuto di Y').toString('utf8'));
  const xInB = D.file(B, 'Fonti/X.pdf');
  assert.ok(xInB === null, 'B/Fonti/X.pdf non deve esistere (fonte ripristinata senza File, §1); contiene: ' + (xInB && xInB.toString('utf8')));
  const ixB = vaultRelDelVault(D, B);
  assert.equal(ixB.fonti.find(v => v.nome === 'X.pdf').vaultRel, '');
  assert.equal(ixB.fonti.find(v => v.nome === 'Y.pdf').vaultRel, 'Fonti/Y.pdf');
});

// ═══ vault spostato con la mappa aperta ════════════════════════════════════

const indiceSvizzera = () => ({ schema: 'mappai-fonti@1', mappa: 'Svizzera', fonti: [{ id: 'src1', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf', caratteri: TESTO.length, testoRel: 'Fonti/x.txt' }] });
const vaultSvizzera = () => ({ 'index.yaml': YAML, 'Fonti/x.pdf': byte('svizzera'), 'Fonti/x.txt': TESTO, 'Fonti/fonti.json': JSON.stringify(indiceSvizzera()) });

test('vault spostato (INSEGNA › un\'altra disciplina) con la mappa aperta: «Incolla testo» tiene il vaultRel del PDF, e riaperto ELABORA lo ritrova', async () => {
  const DOPO = MAPPE + '/4R/Geografia/Svizzera';
  const INCOLLATO = 'Un appunto del docente sulla neutralità armata e sul ridotto nazionale, abbastanza lungo.';
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api, { incolla: INCOLLATO });
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  /* vault-relocate sposta la cartella; writeMeta (mappai-landing-teach.js:449)
     aggiorna solo activeVaultPath, non le fonti */
  D.sposta(A, DOPO);
  h.s.activeVaultPath = DOPO;
  h.E.addTextPrompt();
  for (let i = 0; i < 40 && !(D.indice(DOPO) || { fonti: [] }).fonti.some(v => v.tipo === 'text'); i++) await riposo(1);
  const ix = vaultRelDelVault(D, DOPO);
  assert.ok(ix.fonti.some(v => v.tipo === 'text'), 'l\'indice ha il testo incollato');
  const x = ix.fonti.find(v => v.nome === 'x.pdf');
  assert.ok(!!x, 'la voce x.pdf');
  assert.equal(x.vaultRel, 'Fonti/x.pdf', 'il vaultRel del PDF che sta qui resta nell\'indice');
  assert.equal(h.s.sources.find(v => v.name === 'x.pdf').vaultDi, DOPO, 'vaultDi riallineato al vault spostato');
  indicePulito(D, DOPO);
  /* riaperto in un'altra sessione: il PDF c'è, col suo percorso */
  const r = elabora(D.api);
  r.s.activeVaultPath = DOPO;
  assert.equal(await r.E.ripristinaFontiDalVault(DOPO), 2);
  assert.equal(J(r.s.sources).find(v => v.name === 'x.pdf').vaultRel, 'Fonti/x.pdf');
});

test('vault spostato: anche il flush di «Salva vault» o del ramo 1, con le fonti ripristinate senza File, tiene il vaultRel', async () => {
  const DOPO = MAPPE + '/4R/Geografia/Svizzera';
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  await h.E.ripristinaFontiDalVault(A);
  D.sposta(A, DOPO);
  h.s.activeVaultPath = DOPO;
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, 0, 'nessun PDF riscritto');
  assert.equal(vaultRelDelVault(D, DOPO).fonti.find(v => v.nome === 'x.pdf').vaultRel, 'Fonti/x.pdf');
});

test('NON è uno spostamento: il vault di prima c\'è ancora col suo x.pdf, e «Salva vault» su B che ha un altro x.pdf lascia vuoto il vaultRel', async () => {
  const D = disco({ [A]: vaultSvizzera(), [B]: { 'index.yaml': YAML, 'Fonti/x.pdf': byte('un altro documento') } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  await h.E.ripristinaFontiDalVault(A);
  h.s.activeVaultPath = B;
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(D.indice(B).fonti.find(v => v.nome === 'x.pdf').vaultRel, '', 'il vaultRel di A non punta al PDF di B');
  assert.equal(h.s.sources[0].vaultDi, A, 'vaultDi resta A');
  /* e nemmeno su un vault nato adesso che ha già un file con quel nome */
  const D2 = disco({ [B]: { 'index.yaml': YAML } });
  D2.crea(A, vaultSvizzera());
  const h2 = elabora(D2.api);
  h2.s.activeVaultPath = A;
  await h2.E.ripristinaFontiDalVault(A);
  D2.sposta(A, RADICE + '/altrove');
  D2.crea(B, { 'Fonti/x.pdf': byte('un altro documento') });
  h2.s.activeVaultPath = B;
  await h2.E.flushSourcesToVault({ vaultNuovo: true });
  assert.equal(D2.indice(B).fonti.find(v => v.nome === 'x.pdf').vaultRel, '', 'un vault nato adesso non è mai uno spostato');
});

// ═══ la scrittura resta nel vault da cui è partita (inv. 20-bis) ═══════════

/* `directLoadVault` cambia `activeVaultPath` SUBITO (mappai-vault-manager.js:113)
   e ripristina le fonti solo dopo (:261): si apre un'altra mappa appena finita
   la scrittura di `rel`, col ripristino o senza */
function cambiaVaultDopo(D, h, rel, altro, conRipristino) {
  const salva = D.api.saveVaultFile;
  D.api.saveVaultFile = async d => {
    const r = await salva(d);
    if (d && d.relPath === rel && h.s.activeVaultPath !== altro) {
      h.s.activeVaultPath = altro;
      if (conRipristino) await h.E.ripristinaFontiDalVault(altro);
    }
    return r;
  };
}

test('«Aggiungi PDF» su A, e durante la scrittura si apre il vault vecchio: l\'indice va in A con le fonti di A, nel vault vecchio non nasce niente', async () => {
  for (const conRipristino of [false, true]) {
    const D = disco({ [A]: vaultSvizzera(), [VECCHIO]: { 'index.yaml': YAML, 'Allegati/z.pdf': byte('guerra fredda') } });
    const primaV = D.impronta(VECCHIO);
    const h = elabora(D.api);
    h.s.activeVaultPath = A;
    await h.E.ripristinaFontiDalVault(A);
    cambiaVaultDopo(D, h, 'Fonti/y.pdf', VECCHIO, conRipristino);
    await h.E.onPdf({ files: [pdf('y.pdf', 'un documento grande')], value: '' });
    const caso = conRipristino ? 'col ripristino' : 'senza ripristino';
    assert.equal(h.s.activeVaultPath, VECCHIO, caso + ': il vault è cambiato davvero');
    assert.ok(!!D.file(A, 'Fonti/y.pdf'), caso + ': il PDF in A');
    assert.ok(!D.nomi(VECCHIO).some(r => r.startsWith('Fonti/')), caso + ': nel vault vecchio è nata Fonti/: ' + D.nomi(VECCHIO).join(', '));
    assert.equal(D.impronta(VECCHIO), primaV, caso + ': vault vecchio identico');
    const ix = vaultRelDelVault(D, A);
    assert.ok(ix.fonti.some(v => v.nome === 'y.pdf' && v.vaultRel === 'Fonti/y.pdf'), caso + ': l\'indice di A ha il PDF nuovo');
    assert.ok(ix.fonti.some(v => v.nome === 'x.pdf' && v.vaultRel === 'Fonti/x.pdf'), caso + ': e la fonte di prima');
    assert.ok(!ix.fonti.some(v => v.nome === 'z.pdf'), caso + ': niente del vault vecchio nell\'indice di A');
  }
});

test('flush su un vault nato adesso, e a metà si apre il vault vecchio: PDF, testi e indice restano tutti nel vault nuovo', async () => {
  const N = RADICE + '/Nuova';
  const D = disco({ [N]: { 'index.yaml': YAML }, [VECCHIO]: { 'index.yaml': YAML, 'Allegati/z.pdf': byte('guerra fredda') } });
  const primaV = D.impronta(VECCHIO);
  const h = elabora(D.api);
  h.s.activeVaultPath = N;
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  h.s.sources.push(Object.assign(fonteDiCrea('y.pdf', 'seconda fonte'), { id: 'source-2' }));
  cambiaVaultDopo(D, h, 'Fonti/x.pdf', VECCHIO, false);
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  assert.equal(h.s.activeVaultPath, VECCHIO, 'il vault è cambiato davvero');
  assert.ok(!D.nomi(VECCHIO).some(r => r.startsWith('Fonti/')), 'nel vault vecchio è nata Fonti/: ' + D.nomi(VECCHIO).join(', '));
  assert.equal(D.impronta(VECCHIO), primaV);
  assert.ok(!!D.file(N, 'Fonti/x.pdf') && !!D.file(N, 'Fonti/y.pdf'), 'i due PDF nel vault nuovo');
  const ix = vaultRelDelVault(D, N);
  assert.deepEqual(ix.fonti.map(v => v.vaultRel).sort(), ['Fonti/x.pdf', 'Fonti/y.pdf']);
});

// ═══ il percorso riusato, e l'elenco di Fonti/ che non si legge ════════════

/* INSEGNA › Elimina manda la cartella nel Cestino e `appState.sources` resta; una
   generazione con lo stesso titolo, nella stessa classe e disciplina, ricrea la
   cartella allo STESSO percorso: il `vaultDi` delle fonti coincide, il file no. */
const CESTINO = '/Users/prova/.Trash/Svizzera';

test('percorso riusato: A generata, eliminata e rigenerata allo stesso percorso → Fonti/x.pdf scritto di nuovo, e ogni vaultRel dell’indice esiste sul disco', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  h.s.activeVaultPath = A;
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);   // generazione 1 (pipeline, passo A)
  assert.ok(!!D.file(A, 'Fonti/x.pdf'));
  D.sposta(A, CESTINO);
  D.crea(A, { 'index.yaml': YAML });                                        // generazione 2: saveVault ricrea A
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  assert.ok(!!D.file(A, 'Fonti/x.pdf'), 'il PDF della fonte nel vault rinato: ' + D.nomi(A).join(', '));
  assert.equal(D.file(A, 'Fonti/x.pdf').toString('base64'), byte('svizzera').toString('base64'));
  const ix = vaultRelDelVault(D, A);
  assert.ok(ix.fonti.some(v => v.nome === 'x.pdf' && v.vaultRel === 'Fonti/x.pdf'));
  indicePulito(D, A);
  assert.equal(pdfScritti(D).length, 2, 'una scrittura del PDF per vault');
  /* il ramo 1 subito dopo: il file è al suo posto, niente di nuovo */
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, 2);
  assert.deepEqual(D.nomi(A).filter(r => /\.pdf$/i.test(r)), ['Fonti/x.pdf']);
});

test('percorso riusato con una fonte senza File (ripristinata da A prima di eliminarla): nell’indice del vault rinato nessun vaultRel senza file, e niente copie', async () => {
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  D.sposta(A, CESTINO);
  D.crea(A, { 'index.yaml': YAML });
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);   // «Salva vault» sulla cartella rinata
  const ix = vaultRelDelVault(D, A);
  const x = ix.fonti.find(v => v.nome === 'x.pdf');
  assert.ok(!!x, 'la voce resta, col suo testo');
  assert.equal(x.vaultRel, '', 'nessun vaultRel verso un file che non c’è');
  assert.ok(!!x.testoRel && !!D.file(A, x.testoRel));
  assert.equal(pdfScritti(D).length, 0, 'il File non c’è: niente PDF');
});

test('l’elenco di Fonti/ che non si legge (un errore, o il canale che lancia) non vale «vuoto»: nessuna scrittura — né PDF, né indice, né testo', async () => {
  for (const guasto of ['errore', 'lancia']) {
    const D = disco({ [A]: vaultSvizzera(), [B]: { 'index.yaml': YAML } });
    const h = elabora(D.api, { incolla: 'Un appunto del docente abbastanza lungo da diventare una fonte di testo vera.' });
    h.s.activeVaultPath = A;
    assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
    const primaA = D.impronta(A), primaB = D.impronta(B);
    D.api.vaultSourcesList = async d => {
      if (guasto === 'lancia') throw new Error('canale interrotto');
      return { ok: false, error: 'EACCES: permission denied, scandir \'' + d.vaultPath + '/Fonti\'' };
    };
    /* 1. il flush di una generazione, su un vault nato adesso, con un PDF di CREA */
    h.s.sources.push(Object.assign(fonteDiCrea('y.pdf', 'nuovo'), { id: 'source-9' }));
    h.s.activeVaultPath = B;
    assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), false, guasto);
    /* 2. «Aggiungi PDF» e «Incolla testo» su A, che ha Fonti/ e il suo indice */
    h.s.activeVaultPath = A;
    await h.E.onPdf({ files: [pdf('z.pdf', 'aggiunto')], value: '' });
    h.E.addTextPrompt();
    await riposo();
    assert.equal(await h.E.salvaIndiceFonti({ vaultNuovo: true, pdfScritto: true }), false, guasto);
    assert.deepEqual(D.scritture.map(w => w.vaultPath + ' → ' + w.relPath), [], guasto);
    assert.equal(D.impronta(A), primaA, guasto + ': l’indice di A non perde i suoi vaultRel');
    assert.equal(D.impronta(B), primaB, guasto);
  }
});

test('l’elenco letto prima di una scrittura appena finita non toglie un vaultRel dall’indice: si rifà, una volta sola', async () => {
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  /* un PDF la cui scrittura in A atterra subito DOPO che l'indice ha letto l'elenco */
  h.s.sources.push({ id: 'elab_pdf_77', type: 'pdf', name: 'y.pdf', content: '', vaultRel: 'Fonti/y.pdf', vaultDi: A });
  const vero = D.api.vaultSourcesList;
  let elenchi = 0;
  D.api.vaultSourcesList = async d => {
    const r = await vero(d);
    if (d.vaultPath === A && ++elenchi === 1) D.crea(A, { 'Fonti/y.pdf': byte('y') });
    return r;
  };
  assert.equal(await h.E.salvaIndiceFonti(), true);
  const ix = vaultRelDelVault(D, A);
  assert.equal(ix.fonti.find(v => v.nome === 'y.pdf').vaultRel, 'Fonti/y.pdf');
  assert.equal(ix.fonti.find(v => v.nome === 'x.pdf').vaultRel, 'Fonti/x.pdf');
  assert.ok(elenchi <= 2, 'al più un elenco in più: ' + elenchi);
});

// ═══ un nome che l'elenco di Fonti/ non mostra ═════════════════════════════

/* `vault-sources-list` salta i nomi che cominciano per «.» (main.js:1291; il
   disco finto fa lo stesso), mentre `safeName` il punto lo conserva: il PDF si
   scrive in Fonti/ col suo nome, e poi l'elenco non lo vede mai. */

test('«Aggiungi PDF» di «.appunti.pdf»: l’indice lo registra col suo vaultRel, il flush dopo non ritenta di scriverlo, e riaperto c’è', async () => {
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  await h.E.onPdf({ files: [pdf('.appunti.pdf', 'appunti del docente')], value: '' });
  assert.ok(!!D.file(A, 'Fonti/.appunti.pdf'), 'il PDF è sul disco');
  const voce = D.indice(A).fonti.find(v => v.nome === '.appunti.pdf');
  assert.ok(!!voce, 'la voce nell’indice');
  assert.equal(voce.vaultRel, 'Fonti/.appunti.pdf', 'col suo vaultRel');
  const n = pdfScritti(D).length;
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, n, 'il flush non ritenta di scrivere il PDF');
  assert.equal(D.indice(A).fonti.find(v => v.nome === '.appunti.pdf').vaultRel, 'Fonti/.appunti.pdf');
  const r = elabora(D.api);
  r.s.activeVaultPath = A;
  assert.equal(await r.E.ripristinaFontiDalVault(A), 2);
  assert.equal(J(r.s.sources).find(x => x.name === '.appunti.pdf').vaultRel, 'Fonti/.appunti.pdf');
});

test('generazione da un PDF di CREA «.dispensa.pdf» (passo A, poi il ramo 1): una sola scrittura del PDF, e riaperto il vault la fonte ha il suo vaultRel', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.sources.push(fonteDiCrea('.dispensa.pdf', 'dispensa'));
  h.s.activeVaultPath = A;
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);      // la pipeline, passo A
  await h.E.flushSourcesToVault({ vaultNuovo: false });                           // il ramo 1, subito dopo
  assert.deepEqual(pdfScritti(D).map(w => w.relPath), ['Fonti/.dispensa.pdf'], 'una sola scrittura del PDF');
  assert.equal(vaultRelDelVault(D, A).fonti[0].vaultRel, 'Fonti/.dispensa.pdf');
  const r = elabora(D.api);
  r.s.activeVaultPath = A;
  assert.equal(await r.E.ripristinaFontiDalVault(A), 1);
  assert.equal(J(r.s.sources)[0].vaultRel, 'Fonti/.dispensa.pdf');
});

test('«.appunti.pdf» aggiunto di nuovo con gli stessi byte si adotta (un file solo, nessun « · 02»); un altro PDF con quel nome prende « · 02», come prima dello 0059', async () => {
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  await h.E.ripristinaFontiDalVault(A);
  const pdfA = () => D.nomi(A).filter(r => /\.pdf$/i.test(r));
  const aggiunte = () => J(h.s.sources).filter(x => x.name === '.appunti.pdf').map(x => x.vaultRel);
  await h.E.onPdf({ files: [pdf('.appunti.pdf', 'appunti del docente')], value: '' });
  await h.E.onPdf({ files: [pdf('.appunti.pdf', 'appunti del docente')], value: '' });
  assert.deepEqual(pdfA(), ['Fonti/.appunti.pdf', 'Fonti/x.pdf'], 'stessi byte: un file solo');
  assert.deepEqual(aggiunte(), ['Fonti/.appunti.pdf', 'Fonti/.appunti.pdf'], 'tutte e due col file che c’è');
  await h.E.onPdf({ files: [pdf('.appunti.pdf', 'un altro documento')], value: '' });
  assert.ok(!!D.file(A, 'Fonti/.appunti · 02.pdf'), 'byte diversi: « · 02»: ' + pdfA().join(', '));
  assert.equal(D.file(A, 'Fonti/.appunti · 02.pdf').toString('utf8'), byte('un altro documento').toString('utf8'));
  assert.equal(D.file(A, 'Fonti/.appunti.pdf').toString('utf8'), byte('appunti del docente').toString('utf8'), 'il primo non si tocca');
  assert.deepEqual(aggiunte(), ['Fonti/.appunti.pdf', 'Fonti/.appunti.pdf', 'Fonti/.appunti · 02.pdf']);
  const ix = vaultRelDelVault(D, A);
  assert.deepEqual(ix.fonti.filter(v => v.nome === '.appunti.pdf').map(v => v.vaultRel), ['Fonti/.appunti.pdf', 'Fonti/.appunti.pdf', 'Fonti/.appunti · 02.pdf']);
  const n = pdfScritti(D).length;
  await h.E.flushSourcesToVault({ vaultNuovo: false });
  assert.equal(pdfScritti(D).length, n, 'il flush dopo non ritenta nessun PDF');
});

// ═══ le fonti in memoria sono QUELLE: «Carica un progetto» ═════════════════

const C = RADICE + '/Congresso di Vienna';
const indiceC = () => ({ schema: 'mappai-fonti@1', mappa: 'Vienna', fonti: [{ id: 'srcC', tipo: 'pdf', nome: 'v.pdf', vaultRel: 'Fonti/v.pdf', caratteri: TESTO.length, testoRel: 'Fonti/v.txt' }] });
const vaultC = () => ({ 'index.yaml': YAML, 'Fonti/v.pdf': byte('vienna'), 'Fonti/v.txt': TESTO, 'Fonti/fonti.json': JSON.stringify(indiceC()) });
/* `loadSavedProject` (mappai-storage-lang.js:386): `appState = loadedState`, con
   le fonti dello snapshot — non passa da ELABORA */
const statoDi = (vp, fonti, titolo) => ({ sources: fonti, db: { nodes: [], links: [], studySets: [] }, activeVaultPath: vp, rootNodeLabel: titolo || 'Mappa', extractionMode: 'mindmap' });
const statoC = () => statoDi(C, [{ id: 'srcC', type: 'pdf', name: 'v.pdf', content: TESTO, vaultRel: 'Fonti/v.pdf', vaultDi: C }], 'Vienna');

test('B aperto, poi «Carica un progetto» C, poi di nuovo B: il ripristino rilegge B dal disco, e «Incolla testo» non mette nell’indice di B le fonti di C', async () => {
  const INCOLLATO = 'Un appunto del docente abbastanza lungo da diventare una fonte di testo vera, su B.';
  const D = disco({ [B]: vaultSvizzera(), [C]: vaultC() });
  const h = elabora(D.api, { incolla: INCOLLATO });
  h.s.activeVaultPath = B;
  assert.equal(await h.E.ripristinaFontiDalVault(B), 1);          // directLoadVault(B)
  h.g.appState = statoC();                                        // loadSavedProject(C)
  const s = h.g.appState;
  s.activeVaultPath = B;                                          // directLoadVault(B) muta l'appState di adesso
  assert.equal(await h.E.ripristinaFontiDalVault(B), 1, 'riletto dal disco');
  assert.deepEqual(J(s.sources).map(x => x.name), ['x.pdf']);
  h.E.addTextPrompt();
  for (let i = 0; i < 40 && !D.indice(B).fonti.some(v => v.tipo === 'text'); i++) await riposo(1);
  const ix = vaultRelDelVault(D, B);
  assert.ok(ix.fonti.some(v => v.nome === 'x.pdf' && v.vaultRel === 'Fonti/x.pdf'), 'la voce del PDF di B resta');
  assert.ok(!ix.fonti.some(v => v.nome === 'v.pdf'), 'niente delle fonti di C nell’indice di B');
  assert.ok(ix.fonti.some(v => v.tipo === 'text' && v.testoRel), 'il testo incollato');
});

test('appState sostituito a metà flush («Carica un progetto»): il flush non dichiara di B le fonti dello stato nuovo', async () => {
  /* 1. lo stato nuovo è C: riaprendo B il ripristino rilegge B dal disco */
  const D = disco({ [B]: { 'index.yaml': YAML }, [C]: vaultC() });
  const h = elabora(D.api);
  h.s.activeVaultPath = B;
  h.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  const salva = D.api.saveVaultFile;
  D.api.saveVaultFile = async d => {
    const r = await salva(d);
    if (d.vaultPath === B && d.relPath === 'Fonti/x.pdf') h.g.appState = statoC();   // mentre il PDF si scrive
    return r;
  };
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  D.api.saveVaultFile = salva;
  assert.ok(vaultRelDelVault(D, B).fonti.some(v => v.vaultRel === 'Fonti/x.pdf'));
  const s = h.g.appState;
  s.activeVaultPath = B;
  assert.equal(await h.E.ripristinaFontiDalVault(B), 1, 'le fonti di C non passano per fonti di B');
  assert.deepEqual(J(s.sources).map(x => x.name), ['x.pdf']);

  /* 2. lo stato nuovo è una scheda senza fonti sullo stesso B: un «Salva vault»
     dopo non svuota l'indice che il flush ha appena scritto */
  const D2 = disco({ [B]: { 'index.yaml': YAML } });
  const h2 = elabora(D2.api);
  h2.s.activeVaultPath = B;
  h2.s.sources.push(fonteDiCrea('x.pdf', 'svizzera'));
  const salva2 = D2.api.saveVaultFile;
  D2.api.saveVaultFile = async d => {
    const r = await salva2(d);
    if (d.vaultPath === B && d.relPath === 'Fonti/x.pdf') h2.g.appState = statoDi(B, [], 'Svizzera');
    return r;
  };
  await h2.E.flushSourcesToVault({ vaultNuovo: true });
  D2.api.saveVaultFile = salva2;
  assert.ok(D2.indice(B).fonti.some(v => v.vaultRel === 'Fonti/x.pdf'));
  await h2.E.flushSourcesToVault({ vaultNuovo: false });
  assert.ok(D2.indice(B).fonti.some(v => v.vaultRel === 'Fonti/x.pdf'), 'l’indice di B non si svuota: ' + JSON.stringify(D2.indice(B).fonti));
});

test('due ripristini in volo: quello di A finisce DOPO quello di C e non tocca le fonti del vault aperto C; «Incolla testo» e «Salva vault» su C tengono l’indice di C', async () => {
  for (const gesto of ['Incolla testo', 'Salva vault']) {
    const D = disco({ [A]: vaultSvizzera(), [C]: vaultC() });
    const h = elabora(D.api, { incolla: 'Un appunto del docente abbastanza lungo da diventare una fonte di testo vera, su C.' });
    /* la risposta dell'indice di A tarda (molte fonti, .txt grandi) */
    let rilascia; const cancello = new Promise(r => { rilascia = r; });
    const leggi = D.api.readVaultFile;
    D.api.readVaultFile = async d => { const r = await leggi(d); if (d.vaultPath === A && d.relPath === 'Fonti/fonti.json') await cancello; return r; };
    /* directLoadVault: activeVaultPath subito (mappai-vault-manager.js:113), il ripristino non atteso (:261) */
    h.s.activeVaultPath = A;
    const pA = h.E.ripristinaFontiDalVault(A);
    await riposo();
    h.s.activeVaultPath = C;
    assert.equal(await h.E.ripristinaFontiDalVault(C), 1);
    rilascia();
    assert.equal(await pA, 0, gesto + ': il ripristino di A, arrivato dopo, non ripristina niente');
    assert.deepEqual(J(h.s.sources).map(x => x.name), ['v.pdf'], gesto + ': con C aperto, in memoria le fonti di C');
    if (gesto === 'Incolla testo') {
      h.E.addTextPrompt();
      for (let i = 0; i < 40 && !D.indice(C).fonti.some(v => v.tipo === 'text'); i++) await riposo(1);
      assert.ok(D.indice(C).fonti.some(v => v.tipo === 'text'), 'il testo incollato');
    } else {
      await h.E.flushSourcesToVault({ vaultNuovo: false });                   // «Salva vault» sulla cartella di C
    }
    const ix = vaultRelDelVault(D, C);
    assert.ok(ix.fonti.some(v => v.nome === 'v.pdf' && v.vaultRel === 'Fonti/v.pdf'), gesto + ': la voce del PDF di C resta nel suo indice: ' + JSON.stringify(ix.fonti.map(v => [v.nome, v.vaultRel])));
    assert.ok(!ix.fonti.some(v => v.nome === 'x.pdf'), gesto + ': niente delle fonti di A nell’indice di C');
    assert.ok(!D.nomi(C).includes('Fonti/x.txt'), gesto + ': nemmeno il testo di A');
  }
});

// ═══ il lavoro lungo si tiene ciò su cui è partito (inv. 20-bis) ═══════════

test('«il testo che manca» su A, e a metà estrazione si apre C: il risultato va in A con le fonti di A, e l’indice di C non si svuota', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML, 'Fonti/w.pdf': byte('gradino due') }, [C]: vaultC() });
  const h = elabora(D.api);
  let sblocca; const cancello = new Promise(r => { sblocca = r; });
  const estrai = h.g.extractTextFromPDF;
  h.g.extractTextFromPDF = async f => { await cancello; return estrai(f); };
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  const p = h.E.completaTestiMancanti();
  await riposo();
  /* directLoadVault(C): activeVaultPath subito (mappai-vault-manager.js:113), il
     ripristino non atteso (:262); la risposta dell'indice di C tarda */
  let rilascia; const cancelloC = new Promise(r => { rilascia = r; });
  const leggi = D.api.readVaultFile;
  D.api.readVaultFile = async d => { const r = await leggi(d); if (d.vaultPath === C && d.relPath === 'Fonti/fonti.json') await cancelloC; return r; };
  h.s.activeVaultPath = C;
  const pr = h.E.ripristinaFontiDalVault(C);
  await riposo();
  const primaC = D.impronta(C);
  sblocca();
  assert.equal(await p, 1);
  assert.equal(D.impronta(C), primaC, 'C non cambia: il suo indice non si svuota');
  rilascia();
  assert.equal(await pr, 1);
  const w = vaultRelDelVault(D, A).fonti.find(v => v.nome === 'w.pdf');
  assert.ok(!!w && w.vaultRel === 'Fonti/w.pdf' && w.testoRel === 'Fonti/w.txt', 'l’indice di A col suo testo');
  assert.ok(D.file(A, 'Fonti/w.txt').toString('utf8').includes('gradino due'));
  assert.deepEqual(J(h.s.sources).map(x => x.name), ['v.pdf'], 'in memoria, ora, le fonti di C');
});

test('«il testo che manca» su A dura; intanto C e di nuovo A (le fonti di A si rileggono: un elenco nuovo) e una fonte aggiunta su A: finita l’estrazione, l’indice di A la tiene', async () => {
  const casi = [
    ['Incolla testo', v => v.tipo === 'text' && !!v.testoRel],
    ['Aggiungi PDF', v => v.nome === 'p.pdf' && v.vaultRel === 'Fonti/p.pdf'],
    /* ELABORA rimontata su A riaperto: una seconda estrazione, sull'elenco
       nuovo, che finisce PRIMA della prima */
    ['Incolla testo, e una seconda estrazione che finisce prima', v => v.tipo === 'text' && !!v.testoRel]
  ];
  for (const [gesto, nuova] of casi) {
    const D = disco({ [A]: { 'index.yaml': YAML, 'Fonti/w.pdf': byte('gradino due') }, [C]: vaultC() });
    const h = elabora(D.api, { incolla: 'Un appunto del docente abbastanza lungo da diventare una fonte di testo vera, su A.' });
    /* l'estrazione del PDF di A (w.pdf) dura finché il cancello non si apre;
       quella di «Aggiungi PDF» (p.pdf) no */
    const cancelli = [];
    const estrai = h.g.extractTextFromPDF;
    h.g.extractTextFromPDF = async f => { if (f && f.name === 'w.pdf') await new Promise(r => cancelli.push(r)); return estrai(f); };
    h.s.activeVaultPath = A;
    assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
    const p1 = h.E.completaTestiMancanti();                              // mountSource: non atteso
    await riposo();
    h.s.activeVaultPath = C; assert.equal(await h.E.ripristinaFontiDalVault(C), 1);   // INSEGNA › C
    h.s.activeVaultPath = A; assert.equal(await h.E.ripristinaFontiDalVault(A), 1);   // e di nuovo A
    const due = /seconda/.test(gesto);
    const p2 = due ? h.E.completaTestiMancanti() : null;
    await riposo();
    const indiceA = () => D.indice(A) || { fonti: [] };                  // A non ha ancora fonti.json
    if (/Incolla/.test(gesto)) {
      h.E.addTextPrompt();
      for (let i = 0; i < 40 && !indiceA().fonti.some(v => v.tipo === 'text'); i++) await riposo(1);
    } else {
      await h.E.onPdf({ files: [pdf('p.pdf', 'aggiunto dal docente')], value: '' });
    }
    assert.ok(indiceA().fonti.some(nuova), gesto + ': la voce nuova è nell’indice di A');
    if (due) { cancelli[1](); assert.equal(await p2, 1); await riposo(); }
    cancelli[0]();
    assert.equal(await p1, 1, gesto + ': il testo si è estratto');
    await riposo();
    const ix = vaultRelDelVault(D, A);
    assert.ok(ix.fonti.some(nuova), gesto + ': finita l’estrazione, la voce nuova resta: ' + JSON.stringify(ix.fonti.map(v => [v.nome, v.vaultRel, v.testoRel])));
    assert.ok(ix.fonti.some(v => v.nome === 'w.pdf' && v.vaultRel === 'Fonti/w.pdf'), gesto + ': e la voce del PDF di A');
    if (due) assert.ok(ix.fonti.some(v => v.nome === 'w.pdf' && v.testoRel === 'Fonti/w.txt'), gesto + ': col testo, dalla seconda estrazione');
    /* riaperto in un'altra sessione: la fonte nuova c'è */
    const r = elabora(D.api);
    r.s.activeVaultPath = A;
    await r.E.ripristinaFontiDalVault(A);
    assert.ok(J(r.s.sources).some(x => /PDF/.test(gesto) ? x.name === 'p.pdf' : x.type === 'text'), gesto + ': riaperto, la fonte nuova c’è');
  }
});

test('«Aggiungi PDF» prima che il vault esista (i File solo in memoria di sessione), poi il flush su un vault nato adesso, e a metà si apre un’altra mappa: tutti i PDF arrivano nel vault del flush', async () => {
  const N = RADICE + '/Nuova';
  const D = disco({ [N]: { 'index.yaml': YAML }, [VECCHIO]: { 'index.yaml': YAML, 'Allegati/z.pdf': byte('guerra fredda') } });
  const primaV = D.impronta(VECCHIO);
  const h = elabora(D.api);
  await h.E.onPdf({ files: [pdf('x.pdf', 'primo documento')], value: '' });
  await h.E.onPdf({ files: [pdf('y.pdf', 'secondo documento')], value: '' });
  assert.equal(D.scritture.length, 0, 'senza vault non si scrive niente');
  assert.ok(h.s.sources.every(x => !x.file), 'i File stanno solo nella memoria di sessione');
  h.s.activeVaultPath = N;                                        // «Salva vault» su una cartella nuova, o il ramo 2
  cambiaVaultDopo(D, h, 'Fonti/x.pdf', VECCHIO, true);           // col ripristino, che svuota la memoria dei File
  assert.equal(await h.E.flushSourcesToVault({ vaultNuovo: true }), true);
  assert.equal(h.s.activeVaultPath, VECCHIO, 'il vault è cambiato davvero');
  assert.ok(!!D.file(N, 'Fonti/y.pdf'), 'il secondo PDF nel vault del flush: ' + D.nomi(N).join(', '));
  assert.equal(D.file(N, 'Fonti/y.pdf').toString('utf8'), byte('secondo documento').toString('utf8'));
  assert.deepEqual(vaultRelDelVault(D, N).fonti.map(v => v.vaultRel).sort(), ['Fonti/x.pdf', 'Fonti/y.pdf']);
  assert.equal(D.impronta(VECCHIO), primaV);
});

// ═══ interruttore ══════════════════════════════════════════════════════════

test('interruttore: fonteInFonti() falso con «0», vero senza chiave; spento, la lettura e «Aggiungi PDF» restano', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') } });
  const h = elabora(D.api);
  assert.equal(h.E.fonteInFonti(), true, 'senza chiave');
  h.local.set('mappai_fonte_in_fonti', '1');
  assert.equal(h.E.fonteInFonti(), true, '«1»');
  h.local.set('mappai_fonte_in_fonti', '0');
  assert.equal(h.E.fonteInFonti(), false, '«0»');
  /* l'interruttore governa solo la scrittura della pipeline e del ramo 1 (inv. 1) */
  h.s.activeVaultPath = VECCHIO;
  assert.equal(await h.E.ripristinaFontiDalVault(VECCHIO), 1);
  assert.equal(h.s.sources[0].daAllegati, true);
  await h.E.onPdf({ files: [pdf('y.pdf', 'nuovo')], value: '' });
  assert.ok(!!D.file(VECCHIO, 'Fonti/y.pdf'));
});

// ═══ mappai-vault-io.js con un MappAIElabora finto ═════════════════════════

function vaultIo(o = {}) {
  const eventi = [], chiesti = [], flush = [];
  const D = disco(o.disco || {});
  const local = new Map(Object.entries(o.local || {}));
  let rilascia = () => { };
  const cancello = o.cancello ? new Promise(r => { rilascia = r; }) : null;
  const api = {
    pickFolder: async () => ({ folderPath: o.cartella }),
    saveVault: async ({ folderPath }) => { eventi.push('saveVault'); D.crea(folderPath, { 'index.yaml': YAML }); return { success: true }; },
    readVaultFile: async x => { eventi.push('read:' + (x && x.relPath)); return D.api.readVaultFile(x); },
    filesRootGet: async () => ({ mapsBaseDir: MAPPE }),
    getAllVaults: async () => []
  };
  const g = {
    console: { log() { }, info() { }, warn: (...a) => eventi.push('warn:' + a.join(' ')), error: (...a) => eventi.push('error:' + a.join(' ')) },
    document: { getElementById: () => null },
    localStorage: { getItem: k => { chiesti.push(k); return local.has(k) ? local.get(k) : null; }, setItem: (k, v) => { local.set(k, String(v)); } },
    appState: { db: { nodes: [{ id: 'n0', label: 'Mappa', level: 0 }], links: [] }, rootNodeLabel: 'Mappa', activeVaultPath: o.attivo || null },
    electronAPI: api,
    addEventListener() { }, showLoadingOverlay() { }, showToast() { },
    showAlert: (titolo, m) => eventi.push('alert:' + m), t: (k, f) => f
  };
  g.window = g;
  if (!o.senzaElabora) {
    g.MappAIElabora = {
      flushSourcesToVault: opts => {
        flush.push(JSON.stringify(opts === undefined ? null : opts));
        eventi.push('flush-inizio');
        if (o.rifiuta) return Promise.reject(new Error('flush rotto'));
        return (cancello || riposo(2)).then(() => { eventi.push('flush-fine'); return true; });
      },
      /* come quella vera: l'interruttore, letto senza passare dal localStorage della
         vm — così si vede che `mappai-vault-io.js` non legge la chiave da sé */
      fonteInFonti: () => { eventi.push('fonteInFonti'); return local.get('mappai_fonte_in_fonti') !== '0'; },
      copySourcesTo: async () => { eventi.push('copy'); return 0; }
    };
  }
  const ctx = vm.createContext(g);
  vm.runInContext(JS('mappai-files-core.js'), ctx);
  vm.runInContext(JS('mappai-vault-io.js'), ctx);
  g.buildVaultMapData = () => ({ nodes: [], links: [] });
  return { g, eventi, flush, chiesti, rilascia: () => rilascia(), D };
}
const primaDi = (ev, a, b) => ev.indexOf(a) >= 0 && ev.indexOf(b) >= 0 && ev.indexOf(a) < ev.indexOf(b);

/* 0124 (ADR 0025): qui c'erano tre prove di «Salva vault» (`saveMapVault`), uscita col packet: la cartella con
   index.yaml, quella senza, quella il cui index.yaml non si legge. Il flush delle fonti di chi resta
   (ensureProjectVault) lo provano i due casi qui sotto. */
test('ramo 1 di ensureProjectVault: flush atteso con vaultNuovo false a interruttore acceso; con «0» nessun flush', async () => {
  const h = vaultIo({ disco: { [A]: { 'index.yaml': YAML } }, attivo: A, cancello: true });
  let esito = null;
  const p = h.g.ensureProjectVault({ reason: 'generation' }).then(r => { esito = r; });
  await riposo();
  assert.deepEqual(h.flush, ['{"vaultNuovo":false}']);
  assert.equal(esito, null, 'ensureProjectVault aspetta il flush');
  h.rilascia();
  await p;
  assert.equal(J(esito).created, false);
  assert.equal(J(esito).folderPath, A);
  assert.ok(!h.chiesti.includes('mappai_fonte_in_fonti'), 'la chiave la legge solo MappAIElabora.fonteInFonti (inv. 6)');

  const spento = vaultIo({ disco: { [A]: { 'index.yaml': YAML } }, attivo: A, local: { mappai_fonte_in_fonti: '0' } });
  const r = await spento.g.ensureProjectVault({ reason: 'generation' });
  assert.equal(J(r).created, false);
  assert.deepEqual(spento.flush, [], 'interruttore «0»: niente flush nel ramo 1');
  assert.ok(spento.eventi.includes('fonteInFonti'), 'lo chiede a MappAIElabora');
});

test('ramo 2 di ensureProjectVault: flush atteso con vaultNuovo true; un flush che rifiuta è catturato', async () => {
  const h = vaultIo({ cancello: true });
  let esito = null;
  const p = h.g.ensureProjectVault({ reason: 'generation' }).then(r => { esito = r; });
  await riposo();
  assert.deepEqual(h.flush, ['{"vaultNuovo":true}']);
  assert.equal(esito, null, 'ensureProjectVault aspetta il flush');
  h.rilascia();
  await p;
  assert.equal(J(esito).created, true);

  const sfuggiti = [];
  const spia = e => sfuggiti.push(String(e && e.message));
  process.on('unhandledRejection', spia);
  try {
    const rotto = vaultIo({ rifiuta: true });
    const r = await rotto.g.ensureProjectVault({ reason: 'generation' });
    await riposo(20);
    assert.deepEqual(rotto.flush, ['{"vaultNuovo":true}']);
    assert.deepEqual(sfuggiti, [], 'nessun rifiuto non gestito');
    assert.ok(r && J(r).created === true, 'il vault è nato: il fallimento del flush non lo disfa');
  } finally { process.removeListener('unhandledRejection', spia); }
});

/* 0124: la prima metà di questo caso provava «Salva vault» (`saveMapVault`, uscita col packet): niente lettura di
   index.yaml senza MappAIElabora. Resta la metà di ensureProjectVault. */
test('senza MappAIElabora (come sull\'iPad): i salvataggi di ensureProjectVault vanno lo stesso', async () => {
  const r1 = await vaultIo({ disco: { [A]: { 'index.yaml': YAML } }, attivo: A, senzaElabora: true }).g.ensureProjectVault({});
  assert.equal(J(r1).created, false);
  const r2 = await vaultIo({ senzaElabora: true }).g.ensureProjectVault({});
  assert.equal(J(r2).created, true);
});

// ═══ guardie sui sorgenti ══════════════════════════════════════════════════

const senzaCommenti = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
/* la condizione (fra parentesi bilanciate) dell'ultimo `if (` prima di idx */
function condizioneDi(src, idx) {
  const i = src.lastIndexOf('if (', idx);
  if (i < 0) return '';
  let p = 0, j = i + 3;
  for (; j < src.length; j++) { if (src[j] === '(') p++; else if (src[j] === ')') { p--; if (!p) break; } }
  return j < idx ? src.slice(i + 3, j + 1) : '';
}

test('guardie sui sorgenti: passo A della pipeline, vault-io senza MappAIFontiCore, etichette e prossimoZ in ELABORA', () => {
  const pipe = senzaCommenti(JS('mappai-material-pipeline.js'));
  /* il passo A della strada della mappa (non quello del dossier, che viene prima
     e non si tocca): quello della copia in Allegati/ */
  const ic = pipe.indexOf("copySourcesTo(vaultPath, 'Allegati')");
  const a0 = pipe.lastIndexOf("stepTransition(manifest, 'A', 'running'", ic), a1 = pipe.indexOf("stepTransition(manifest, 'A', 'done'", ic);
  assert.ok(ic > 0 && a0 > 0 && a1 > a0, 'passo A trovato');
  const passo = pipe.slice(a0, a1);
  const chiamateFlush = [...passo.matchAll(/\.flushSourcesToVault\(\s*\{/g)];
  assert.equal(chiamateFlush.length, 1, 'una chiamata al flush nel passo A');
  const iF = chiamateFlush[0].index;
  assert.ok(/await\s+(window\.)?MappAIElabora\.flushSourcesToVault\(\s*\{\s*vaultNuovo\s*:\s*true\s*\}\s*\)/.test(passo), 'flush atteso con vaultNuovo: true');
  assert.ok(condizioneDi(passo, iF).includes('fonteInFonti()'), 'il flush sta sotto fonteInFonti(): ' + condizioneDi(passo, iF));
  const primaF = passo.slice(0, iF);
  assert.ok(primaF.lastIndexOf('try') > primaF.lastIndexOf('catch'), 'il flush sta dentro un try');
  const copie = [...passo.matchAll(/copySourcesTo\(\s*vaultPath/g)];
  assert.equal(copie.length, 1, 'una copia in Allegati/');
  assert.ok(/copySourcesTo\(\s*vaultPath\s*,\s*'Allegati'\s*\)/.test(passo));
  assert.ok(condizioneDi(passo, copie[0].index).includes('config.sourcePdf'), 'la copia solo sotto config.sourcePdf');
  assert.ok(iF < copie[0].index, 'prima Fonti/, poi la copia');
  assert.ok(!condizioneDi(passo, iF).includes('sourcePdf'), 'Fonti/ non dipende dalla spunta');

  assert.equal((JS('mappai-vault-io.js').match(/MappAIFontiCore/g) || []).length, 0, 'vault-io non nomina MappAIFontiCore');

  const el = JS('mappai-elabora.js');
  assert.ok(!/t\('el_q[a-z_]*',\s*'Domande della scheda'\)/.test(el), 'nessun t(el_q…, «Domande della scheda»)');
  assert.ok(!/t\('el_questions',\s*'Domande scheda'\)/.test(el), 'nessun t(el_questions, «Domande scheda»)');
  assert.ok(!/domande\/esercizi della scheda/.test(el), 'B3');
  const i0 = el.indexOf('function openQuestions(');
  const i1 = el.indexOf('\n    function ', i0 + 10);
  assert.ok(i0 > 0 && i1 > i0);
  assert.ok(/prossimoZ\s*\(/.test(el.slice(i0, i1)), 'B1: openQuestions chiede prossimoZ');
});

// ═══ il modale delle domande, vero (B1 e il nome del set) ══════════════════

test('«Domande della fonte»: il modale prende lo z-index da MappAIModal.prossimoZ(), senza motore resta 1002; il set si chiama «Domande della fonte»', () => {
  for (const conMotore of [true, false]) {
    const h = elabora(disco({}).api);
    h.g.MappAIQuestions = { extractQuestions: () => [{ type: 'question', text: 'Perché la Svizzera restò neutrale?' }] };
    if (conMotore) h.g.MappAIModal = { prossimoZ: () => 12345 };
    h.E.openQuestions();
    const ov = h.dom.document.getElementById('elab-q-modal');
    assert.ok(!!ov, 'il modale è in body');
    if (conMotore) assert.equal(String(ov.style.zIndex), '12345');
    else assert.ok(ov.style.zIndex === undefined && /z-index:1002/.test(ov.style.cssText), 'senza motore: 1002');
    assert.ok(ov.innerHTML.includes('Domande della fonte'), 'il titolo');
    ov._tutti['#elab-q-list input:checked'] = [{ dataset: { qi: '0' } }];
    ov.querySelector('#elab-q-create').onclick();
    const set = J(h.s.db.studySets);
    assert.equal(set.length, 1);
    assert.equal(set[0].title, 'Domande della fonte');
  }
});

// ═══ D10: velo e lucchetto durante «Aggiungi PDF» ══════════════════════════
/* Dalla scelta del file alla fine della scrittura (PDF in Fonti/ e fonti.json):
   il velo `#loading-overlay` con «Lettura del PDF…», alzato sopra la console col
   piano di `MappAIModal.prossimoZ()`, e il lucchetto che `mappaiOccupato()`
   (mappai-material-pipeline.js) chiede a ELABORA. Tolti sempre. */

const LETTURA = 'Lettura del PDF…';
const OCCUPATA = 'Sto leggendo il PDF, riprova tra poco.';
/* il velo finto: `#loading-overlay` nel DOM finto, `showLoadingOverlay` e i
   toast che registrano, un `MappAIModal` finto. `foto()` dà lo stato in un
   istante con soli booleani e testi (mai l'elemento), e non lancia se il
   lucchetto non c'è: dentro la vm un errore finirebbe nel catch di onPdf. */
function conVelo(h) {
  const velo = h.dom.el('div');
  velo.id = 'loading-overlay';
  h.dom.body.appendChild(velo);
  const chiamate = [], avvisi = [];
  h.g.showLoadingOverlay = (show, testo) => { chiamate.push(testo === undefined ? [show] : [show, testo]); };
  h.g.showToast = (m, tipo) => { avvisi.push([String(m), String(tipo)]); };
  h.g.MappAIModal = { prossimoZ: () => 12345 };
  const zIndex = () => (velo.style.zIndex === undefined ? '' : String(velo.style.zIndex));
  const foto = () => ({
    lucchetto: typeof h.E.letturaPdfAttiva === 'function' ? h.E.letturaPdfAttiva() : 'manca',
    zIndex: zIndex(),
    ultimo: JSON.stringify(chiamate[chiamate.length - 1] || null)
  });
  return { chiamate, avvisi, foto, zIndex };
}
const SU = { lucchetto: true, zIndex: '12345', ultimo: JSON.stringify([true, LETTURA]) };

test('D10 «Aggiungi PDF»: durante la lettura e la scrittura lucchetto chiuso e velo «Lettura del PDF…» al piano di prossimoZ; mappaiOccupato() vera dice «occupata» con l’avviso, e un secondo PDF non comincia; finito, tutto come prima', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  const v = conVelo(h);
  /* il guardiano VERO di tutta l'app, nello stesso contesto di ELABORA */
  vm.runInContext(JS('mappai-material-pipeline.js'), h.g);
  assert.equal(typeof h.g.mappaiOccupato, 'function');
  assert.equal(h.g.mappaiOccupato(), false, 'a riposo l’app è libera');

  /* un PDF lungo: l'estrazione aspetta un cancello; ogni scrittura fotografa */
  let apri = () => { };
  const cancello = new Promise(r => { apri = r; });
  const estrai = h.g.extractTextFromPDF;
  const foto = { estrazione: null, scritture: {} };
  h.g.extractTextFromPDF = async f => { if (f.name === 'lungo.pdf') { foto.estrazione = v.foto(); await cancello; } return estrai(f); };
  const scrivi = D.api.saveVaultFile;
  D.api.saveVaultFile = async d => { foto.scritture[d.relPath] = v.foto(); return scrivi(d); };

  const p = h.E.onPdf({ files: [pdf('lungo.pdf', 'un documento lungo')], value: '' });
  try {
    await riposo();
    assert.deepEqual(foto.estrazione, SU, 'durante la lettura');
    assert.deepEqual(v.foto(), SU, 'a metà');
    v.avvisi.length = 0;
    assert.equal(h.g.mappaiOccupato(), true, 'l’app è occupata');
    assert.deepEqual(v.avvisi, [[OCCUPATA, 'warning']]);
    /* un secondo «Aggiungi PDF» intanto non comincia: solo l'avviso, il velo resta quello */
    v.avvisi.length = 0;
    await h.E.onPdf({ files: [pdf('altro.pdf', 'un altro documento')], value: '' });
    assert.deepEqual(v.avvisi, [[OCCUPATA, 'warning']]);
    assert.equal(v.chiamate.length, 1, 'il velo non si rialza né si abbassa: ' + JSON.stringify(v.chiamate));
  } finally { apri(); }
  await p;

  /* durante la scrittura: il PDF in Fonti/ e l'indice */
  assert.deepEqual(foto.scritture['Fonti/lungo.pdf'], SU, 'durante la scrittura del PDF');
  assert.deepEqual(foto.scritture['Fonti/fonti.json'], SU, 'durante la scrittura di fonti.json');
  for (const [rel, f] of Object.entries(foto.scritture)) assert.deepEqual(f, SU, rel);
  /* finito: tutto come prima */
  assert.equal(h.E.letturaPdfAttiva(), false, 'lucchetto aperto');
  assert.equal(JSON.stringify(v.chiamate), JSON.stringify([[true, LETTURA], [false]]), 'il velo è sceso');
  assert.equal(v.zIndex(), '', 'lo z-index in linea è tolto');
  v.avvisi.length = 0;
  assert.equal(h.g.mappaiOccupato(), false, 'l’app è di nuovo libera');
  assert.deepEqual(v.avvisi, []);
  assert.ok(!!D.file(A, 'Fonti/lungo.pdf'), 'il PDF è in Fonti/');
  assert.ok(vaultRelDelVault(D, A).fonti.some(x => x.vaultRel === 'Fonti/lungo.pdf'), 'e nell’indice');
  assert.ok(!D.file(A, 'Fonti/altro.pdf'), 'il secondo PDF non è entrato');
});

test('D10: velo e lucchetto si tolgono sempre — PDF senza testo, estrazione che lancia, scrittura che fallisce; senza un file scelto non si alzano', async () => {
  for (const caso of ['senza testo', 'estrazione che lancia', 'scrittura che fallisce']) {
    const D = disco({ [A]: { 'index.yaml': YAML } });
    const h = elabora(D.api);
    h.s.activeVaultPath = A;
    const v = conVelo(h);
    let durante = null;
    const estrai = h.g.extractTextFromPDF;
    h.g.extractTextFromPDF = async f => {
      durante = v.foto();
      if (caso === 'senza testo') return '   ';
      if (caso === 'estrazione che lancia') throw new Error('PDF rotto');
      return estrai(f);
    };
    let tentate = 0;
    if (caso === 'scrittura che fallisce') D.api.saveVaultFile = async () => { tentate++; throw new Error('disco pieno'); };
    await h.E.onPdf({ files: [pdf('y.pdf', 'contenuto')], value: '' });
    if (caso === 'scrittura che fallisce') assert.ok(tentate > 0, 'la scrittura è stata tentata');
    assert.deepEqual(durante, SU, caso + ': su durante la lettura');
    assert.equal(v.foto().lucchetto, false, caso + ': lucchetto aperto');
    assert.equal(JSON.stringify(v.chiamate), JSON.stringify([[true, LETTURA], [false]]), caso + ': il velo è sceso');
    assert.equal(v.zIndex(), '', caso + ': z-index tolto');
    if (caso === 'senza testo') assert.ok(v.avvisi.some(a => a[0] === 'PDF senza testo estraibile'), caso);
    if (caso === 'estrazione che lancia') assert.ok(v.avvisi.some(a => a[0] === 'Errore lettura PDF'), caso);
  }

  /* nessun file scelto: niente velo né lucchetto, nemmeno per un istante */
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  const v = conVelo(h);
  const campo = { files: [], value: 'C:\\fakepath\\x.pdf' };
  await h.E.onPdf(campo);
  assert.equal(campo.value, '');
  assert.equal(v.foto().lucchetto, false, 'lucchetto aperto');
  assert.equal(v.chiamate.length, 0, 'nessun velo per un file che non c’è');
  assert.equal(v.zIndex(), '');
  assert.equal(D.scritture.length, 0);
});

test('D10: con l’app occupata (generazione, pipeline) «Aggiungi PDF» non comincia — niente lettura, velo, lucchetto né scritture; il guardiano si chiede a lucchetto ancora aperto', async () => {
  const D = disco({ [A]: { 'index.yaml': YAML } });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  const v = conVelo(h);
  let letture = 0;
  const estrai = h.g.extractTextFromPDF;
  h.g.extractTextFromPDF = async f => { letture++; return estrai(f); };
  const chiesto = [];
  const MOTIVO = 'Sto generando «Svizzera»: si riapre appena è pronta.';
  /* come quello vero: l'avviso lo dà il guardiano da sé */
  h.g.mappaiOccupato = () => { chiesto.push(v.foto().lucchetto); h.g.showToast(MOTIVO, 'warning'); return true; };
  await h.E.onPdf({ files: [pdf('y.pdf', 'contenuto')], value: '' });
  assert.deepEqual(chiesto, [false], 'chiesto una volta, prima di chiudere il lucchetto');
  assert.equal(letture, 0, 'nessuna lettura');
  assert.equal(v.chiamate.length, 0, 'nessun velo');
  assert.equal(v.foto().lucchetto, false);
  assert.equal(D.scritture.length, 0, 'nessuna scrittura');
  assert.deepEqual(v.avvisi, [[MOTIVO, 'warning']], 'solo l’avviso del guardiano');

  /* l'app libera: comincia */
  h.g.mappaiOccupato = () => { chiesto.push(v.foto().lucchetto); return false; };
  await h.E.onPdf({ files: [pdf('y.pdf', 'contenuto')], value: '' });
  assert.equal(letture, 1);
  assert.ok(!!D.file(A, 'Fonti/y.pdf'));
  assert.equal(JSON.stringify(v.chiamate), JSON.stringify([[true, LETTURA], [false]]));
});

/* il guardiano vero in una vm sua, col minimo per caricare il modulo (come
   tools/smoke/pipeline-lucchetto.js); ELABORA e la generazione sono finti */
function guardiano(o = {}) {
  const avvisi = [];
  const nulla = { classList: { add() { }, remove() { } }, style: {}, appendChild() { }, addEventListener() { } };
  const g = {
    console: { log() { }, info() { }, warn() { }, error() { } },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => Object.assign({}, nulla), createComment: () => ({}),
      addEventListener() { }, body: nulla, documentElement: { dataset: {} }
    },
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    setTimeout, clearTimeout, addEventListener() { },
    showToast: (m, tipo) => avvisi.push([String(m), String(tipo)]),
    showLoadingOverlay() { },
    appState: { rootNodeLabel: 'Svizzera', activeVaultPath: A, db: { nodes: [{ id: 'a' }], links: [] } }
  };
  g.window = g;
  if (o.elabora) g.MappAIElabora = o.elabora;
  if (o.gen) g.MappAIGen = o.gen;
  vm.runInContext(JS('mappai-material-pipeline.js'), vm.createContext(g));
  return { g, avvisi };
}

test('D10: mappaiOccupato() (mappai-material-pipeline.js, eseguita davvero) è vera mentre ELABORA legge un PDF, con l’avviso di ELABORA; falsa altrimenti', () => {
  let legge = true;
  const h = guardiano({ elabora: { letturaPdfAttiva: () => legge, motivoLetturaPdf: () => OCCUPATA } });
  assert.equal(h.g.mappaiOccupato(), true, 'ELABORA legge');
  assert.deepEqual(h.avvisi, [[OCCUPATA, 'warning']]);
  legge = false;
  h.avvisi.length = 0;
  assert.equal(h.g.mappaiOccupato(), false, 'ELABORA ha finito');
  assert.deepEqual(h.avvisi, []);

  /* senza ELABORA (l'iPad), o con un ELABORA senza lucchetto: come prima */
  for (const e of [undefined, { flushSourcesToVault() { } }]) {
    const x = guardiano({ elabora: e });
    assert.equal(x.g.mappaiOccupato(), false);
    assert.deepEqual(x.avvisi, []);
  }
  /* una generazione in corso: comanda il suo motivo, come prima */
  const MOTIVO = 'Generazione in corso: si riapre appena è pronta.';
  const y = guardiano({ elabora: { letturaPdfAttiva: () => true, motivoLetturaPdf: () => OCCUPATA }, gen: { attiva: () => true, motivo: () => MOTIVO } });
  assert.equal(y.g.mappaiOccupato(), true);
  assert.deepEqual(y.avvisi, [[MOTIVO, 'warning']]);
  /* la pipeline in corso, ELABORA ferma: l'avviso della pipeline, come prima */
  const z = guardiano({ elabora: { letturaPdfAttiva: () => false, motivoLetturaPdf: () => OCCUPATA } });
  z.g.MappAIPipeline._running = true;
  assert.equal(z.g.mappaiOccupato(), true);
  assert.equal(z.avvisi.length, 1);
  assert.match(z.avvisi[0][0], /occupata/i);
  assert.equal(z.avvisi[0][1], 'warning');
});

// ═══ D12: il PDF si legge dal vault in cui sta (vaultDi) ═══════════════════
/* Al gate 3 (passo 5) «Esporta nel Vault» in una cartella NUOVA lasciava in
   ELABORA la voce del PDF di `Allegati/` del vault di prima, ma aprendolo
   «Impossibile aprire il PDF»: `_collectPdfs` cercava `vaultRel` nel vault
   aperto. `_collectPdfs` non è esportata: la si raggiunge da «Esporta
   evidenziata» (`exportHighlightedPdf` → il modale → `_runPdfExport`), che legge
   i byte della stessa lista che il visore mostra. `pdfjsLib` e `jspdf` sono
   finti: il primo registra i byte che gli arrivano. */
async function esportaEvidenziata(h, D) {
  const dati = [];
  h.g.pdfjsLib = { getDocument: o => { dati.push(Buffer.from(new Uint8Array(o.data)).toString('utf8')); return { promise: Promise.resolve({ numPages: 0 }) }; } };
  h.g.jspdf = { jsPDF: function () { } };
  D.letture.length = 0;
  h.avvisi.length = 0;
  h.E.exportHighlightedPdf();
  const ov = h.dom.document.getElementById('elab-pdfexp-modal');
  assert.ok(!!ov, 'il modale dell\'esportazione');
  ov.querySelector('#elab-pdfexp-go').onclick();
  const fallito = () => h.avvisi.some(a => /export PDF evidenziato fallito/.test(a));
  for (let i = 0; i < 40 && !dati.length && !fallito(); i++) await riposo(1);
  await riposo();
  return { dati, fallito: fallito(), letture: D.letture.filter(l => /\.pdf$/i.test(l.relPath || '')).map(l => l.vaultPath + ' :: ' + l.relPath) };
}

test('D12: fonte ripristinata da A (Allegati/x.pdf), poi «Esporta nel Vault» su B nato adesso: il PDF si legge da A, dove sta, e non da B; niente si scrive', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/x.pdf': byte('guerra fredda') }, [B]: { 'index.yaml': YAML } });
  const primaV = D.impronta(VECCHIO), primaB = D.impronta(B);
  const h = elabora(D.api);
  h.s.activeVaultPath = VECCHIO;
  assert.equal(await h.E.ripristinaFontiDalVault(VECCHIO), 1);
  /* «Esporta nel Vault» su una cartella nuova: il vault aperto diventa B, e il
     flush del salvataggio non scrive niente (la fonte di Allegati/ è in sola lettura) */
  h.s.activeVaultPath = B;
  await h.E.flushSourcesToVault({ vaultNuovo: true });
  const f = J(h.s.sources);
  assert.equal(f.length, 1);
  assert.equal(f[0].vaultRel, 'Allegati/x.pdf');
  assert.equal(f[0].daAllegati, true);
  assert.equal(f[0].vaultDi, VECCHIO);
  const r = await esportaEvidenziata(h, D);
  assert.deepEqual(r.letture, [VECCHIO + ' :: Allegati/x.pdf'], 'il PDF si legge dal vault di vaultDi, non da B');
  assert.equal(r.fallito, false, 'nessun «Impossibile aprire il PDF»: ' + h.avvisi.join(' | '));
  assert.deepEqual(r.dati, [byte('guerra fredda').toString('utf8')], 'i byte del PDF di A');
  assert.equal(D.scritture.length, 0, 'solo lettura: nessuna scrittura, nessuna copia');
  assert.equal(D.impronta(VECCHIO), primaV, 'A non cambia');
  assert.equal(D.impronta(B), primaB, 'B non riceve il PDF');
});

test('D12: vault spostato con la mappa aperta e nessuna scrittura dopo (vaultDi resta il percorso di prima): il PDF si apre dal vault spostato, come prima; senza vaultDi si legge dal vault aperto', async () => {
  const DOPO = MAPPE + '/4R/Geografia/Svizzera';
  const D = disco({ [A]: vaultSvizzera() });
  const h = elabora(D.api);
  h.s.activeVaultPath = A;
  assert.equal(await h.E.ripristinaFontiDalVault(A), 1);
  /* vault-relocate sposta la cartella; writeMeta aggiorna solo activeVaultPath (D9) */
  D.sposta(A, DOPO);
  h.s.activeVaultPath = DOPO;
  assert.equal(h.s.sources[0].vaultDi, A, 'vaultDi non si riallinea da solo');
  const r = await esportaEvidenziata(h, D);
  assert.equal(r.fallito, false, 'il PDF si apre: ' + h.avvisi.join(' | '));
  assert.deepEqual(r.dati, [byte('svizzera').toString('utf8')]);
  assert.equal(r.letture[r.letture.length - 1], DOPO + ' :: Fonti/x.pdf', 'letto dal vault spostato');
  /* una scheda di prima dello 0059: senza vaultDi si legge dal vault aperto */
  delete h.s.sources[0].vaultDi;
  const r2 = await esportaEvidenziata(h, D);
  assert.equal(r2.fallito, false);
  assert.deepEqual(r2.letture, [DOPO + ' :: Fonti/x.pdf']);
  assert.deepEqual(r2.dati, [byte('svizzera').toString('utf8')]);
  assert.equal(D.scritture.length, 0, 'solo lettura');
});

// ═══ 0078: Fonti/ alla cartella che non ce l'ha («Riprendi», §4.4) ════════════
/* Le fonti in memoria vengono dalla copia del cassetto: senza File (dopo un
   riavvio il file della sessione non c'è più), col testo estratto. La funzione
   scrive `fonti.json` e i `.txt`, mai un PDF, e non svuota mai le fonti in
   memoria: non passa da `ripristinaFontiDalVault`. */
const APPUNTI = 'Appunti del docente sulla neutralità svizzera, abbastanza lunghi da diventare un file di testo.';
const fontiDallaCopia = () => [
  { id: 'source-1', type: 'pdf', name: 'x.pdf', content: 'Testo estratto: ' + TESTO, vaultRel: '' },
  { id: 'source-2', type: 'text', name: 'Appunti', content: APPUNTI },
  { id: 'source-3', type: 'text', name: 'Riga', content: 'corta' }
];
function riprendi(D, vp, o) {
  const h = elabora(D.api, o);
  h.s.activeVaultPath = vp;
  h.s.sources = fontiDallaCopia();
  return h;
}

test('0078: cartella vecchia senza Fonti/ — «completa» scrive fonti.json e i .txt dalle fonti in memoria, nessun PDF, fonti intatte', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML, 'Allegati/foto.png': 'png' } });
  const h = riprendi(D, VECCHIO);
  const fonti = h.s.sources, prima = JSON.stringify(fonti);
  assert.equal(typeof h.g.completaFontiDellaCartella, 'function', 'window.completaFontiDellaCartella');
  assert.equal(await h.g.completaFontiDellaCartella(VECCHIO), true);
  const ix = vaultRelDelVault(D, VECCHIO);
  indicePulito(D, VECCHIO);
  assert.equal(ix.schema, 'mappai-fonti@1');
  assert.deepEqual(ix.fonti.map(v => v.id), ['source-1', 'source-2', 'source-3']);
  for (const v of ix.fonti.filter(x => x.testoRel)) assert.ok(D.file(VECCHIO, v.testoRel), 'il .txt c\'è: ' + v.testoRel);
  assert.equal(ix.fonti.filter(v => v.testoRel).length, 2, 'due testi; una fonte di 40 caratteri o meno resta senza (perdita accettata)');
  assert.equal(ix.fonti.find(v => v.id === 'source-1').vaultRel, '', 'nessun PDF da indicare: il file della sessione non c\'è');
  assert.equal(pdfScritti(D).length, 0, 'mai un PDF');
  assert.ok(D.scritture.every(w => w.potaVarianti === false), 'niente potatura delle varianti');
  assert.strictEqual(h.s.sources, fonti, 'stesso elenco in memoria');
  assert.equal(JSON.stringify(h.s.sources), prima, 'fonti in memoria intatte');
});

test('0078 M4: dopo «completa», un ripristino dello stesso vault non svuota le fonti in memoria', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML } });
  const h = riprendi(D, VECCHIO);
  const fonti = h.s.sources;
  assert.equal(await h.g.completaFontiDellaCartella(VECCHIO), true);
  assert.equal(await h.E.ripristinaFontiDalVault(VECCHIO), 0, 'stesso vault, stesse fonti: le sue sono migliori');
  assert.strictEqual(h.s.sources, fonti);
  assert.equal(h.s.sources.length, 3);
});

test('0078: cartella che ha già Fonti/ (anche solo fonti.json) — «completa» non scrive niente', async () => {
  for (const files of [{ 'Fonti/fonti.json': '{"schema":"mappai-fonti@1","fonti":[]}' }, { 'Fonti/y.pdf': byte('y') }]) {
    const D = disco({ [VECCHIO]: Object.assign({ 'index.yaml': YAML }, files) });
    const h = riprendi(D, VECCHIO);
    const prima = D.impronta(VECCHIO), fonti = JSON.stringify(h.s.sources);
    assert.equal(await h.g.completaFontiDellaCartella(VECCHIO), false);
    assert.equal(D.scritture.length, 0, 'zero scritture con ' + Object.keys(files)[0]);
    assert.equal(D.impronta(VECCHIO), prima);
    assert.equal(JSON.stringify(h.s.sources), fonti);
  }
});

test('0078: elenco di Fonti/ non disponibile, fonti vuote o solo di Allegati/ — «completa» non scrive, e mai un `fonti: []`', async () => {
  const D1 = disco({ [VECCHIO]: { 'index.yaml': YAML } });
  D1.api.vaultSourcesList = async () => ({ ok: false, error: 'permesso negato' });
  const h1 = riprendi(D1, VECCHIO);
  assert.equal(await h1.g.completaFontiDellaCartella(VECCHIO), false);
  assert.equal(D1.scritture.length, 0, 'elenco non disponibile: nel dubbio niente');
  assert.equal(h1.s.sources.length, 3);

  const D2 = disco({ [VECCHIO]: { 'index.yaml': YAML } });
  const h2 = riprendi(D2, VECCHIO);
  h2.s.sources = [];
  assert.equal(await h2.g.completaFontiDellaCartella(VECCHIO), false);
  h2.s.sources = [{ id: 'a', type: 'pdf', name: 'x.pdf', content: TESTO, vaultRel: 'Allegati/x.pdf', daAllegati: true }];
  assert.equal(await h2.g.completaFontiDellaCartella(VECCHIO), false);
  assert.equal(D2.scritture.length, 0);
  assert.equal(D2.file(VECCHIO, 'Fonti/fonti.json'), null);
});

test('0078: la scrittura che fallisce — le fonti in memoria restano com\'erano, il registro lo dice, niente lancia', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML } });
  const salva = D.api.saveVaultFile;
  D.api.saveVaultFile = async d => (d && d.relPath === 'Fonti/fonti.json' ? { ok: false, error: 'disco pieno' } : salva(d));
  const h = riprendi(D, VECCHIO);
  const registro = [];
  h.g.MappAIErrori = { registra: r => { registro.push(r); return r; } };
  const fonti = h.s.sources, prima = JSON.stringify(fonti);
  assert.equal(await h.g.completaFontiDellaCartella(VECCHIO), false);
  assert.strictEqual(h.s.sources, fonti);
  assert.equal(JSON.stringify(h.s.sources), prima);
  assert.equal(registro.length, 1, 'una riga nel registro: ' + JSON.stringify(registro));
  assert.ok(/Fonti/.test(registro[0].messaggio), registro[0].messaggio);
  assert.ok(!/\/Users\//.test(registro[0].messaggio), 'niente percorsi assoluti nel registro');
  // senza registro (o col registro che lancia) non lancia lo stesso
  h.g.MappAIErrori = { registra() { throw new Error('registro rotto'); } };
  assert.equal(await h.g.completaFontiDellaCartella(VECCHIO), false);
});

test('0078: inv. 20-bis — la cartella e le fonti si fissano all\'inizio; se intanto si apre un altro progetto, le sue fonti non diventano «di questa cartella»', async () => {
  const D = disco({ [VECCHIO]: { 'index.yaml': YAML }, [A]: { 'index.yaml': YAML } }, { ritardo: true });
  const h = riprendi(D, VECCHIO);
  const p = h.g.completaFontiDellaCartella(VECCHIO);
  await riposo(2);
  h.g.appState = { sources: [{ id: 'altra', type: 'text', name: 'Altra', content: APPUNTI + ' (di un altro progetto)' }],
    db: { nodes: [], links: [] }, activeVaultPath: A, rootNodeLabel: 'Altra', extractionMode: 'mindmap' };
  assert.equal(await p, true);
  const ix = D.indice(VECCHIO);
  assert.deepEqual(ix.fonti.map(v => v.id), ['source-1', 'source-2', 'source-3'], 'le fonti di partenza, nella cartella di partenza');
  assert.equal(D.file(A, 'Fonti/fonti.json'), null, 'niente nell\'altra cartella');
  /* le fonti dell'altro progetto NON sono state dichiarate «di VECCHIO»: il
     ripristino di VECCHIO non esce subito tenendole, rilegge le sue dal disco */
  assert.equal(await h.E.ripristinaFontiDalVault(VECCHIO), 3);
  assert.deepEqual(J(h.g.appState.sources).map(x => x.id), ['source-1', 'source-2', 'source-3']);
});

test('0078: guardia sul sorgente — completaFontiDellaCartella non chiama ripristinaFontiDalVault né flushSourcesToVault', () => {
  const el = senzaCommenti(JS('mappai-elabora.js'));
  const i0 = el.indexOf('async function completaFontiDellaCartella(');
  assert.ok(i0 > 0, 'la funzione c\'è');
  const i1 = el.indexOf('\n    async function ', i0 + 10), i2 = el.indexOf('\n    function ', i0 + 10);
  const fine = [i1, i2].filter(x => x > 0).reduce((a, b) => Math.min(a, b), el.length);
  const corpo = el.slice(i0, fine);
  assert.ok(!/ripristinaFontiDalVault\s*\(/.test(corpo), 'nessun ripristino (svuoterebbe le fonti)');
  assert.ok(!/flushSourcesToVault\s*\(/.test(corpo), 'nessun flush (scriverebbe i PDF)');
  assert.ok(!/vaultNuovo\s*:\s*true/.test(corpo), 'niente effetti di vaultNuovo');
});
