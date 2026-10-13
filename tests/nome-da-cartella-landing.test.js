'use strict';
/*
 * nome-da-cartella-landing.test.js — packet 0094 (ADR 0021): in INSEGNA ed ELABORA il
 * nome di un progetto è quello della sua cartella. mappai-landing-teach.js vero in una vm,
 * coi core veri e un `getAllVaults` finto. `dom()` è COPIATO da
 * tests/identita-landing-teach.test.js (che resta intatto).
 * ⚠️ Si asserisce SOLO su booleani, stringhe e numeri (un assert su un elemento del DOM
 * finto fa girare Node all'infinito).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

function dom() {
  const $ = cheerio.load('<html><head></head><body><div id="teach-content"></div></body></html>');
  const cache = new WeakMap(), scritti = [];
  function wrap(n) {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = {
      node: n, style: {},
      classList: {
        add: (...c) => { $(n).addClass(c.join(' ')); },
        remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
        toggle: (c, force) => {
          const on = force === undefined ? !$(n).hasClass(c) : !!force;
          if (on) $(n).addClass(c); else $(n).removeClass(c);
          return on;
        },
        contains: c => $(n).hasClass(c)
      },
      get innerHTML() { return $(n).html(); }, set innerHTML(v) { scritti.push(String(v)); $(n).html(String(v)); },
      set textContent(v) { $(n).text(String(v)); },
      getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
      querySelector: s => wrap($(n).find(s)[0]),
      appendChild: c => { $(n).append(c.node); return c; },
      addEventListener() {}, remove: () => { $(n).remove(); }
    };
    cache.set(n, e);
    return e;
  }
  const document = {
    readyState: 'complete',
    getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
    createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
  };
  return { $, document, scritti };
}

const ID = 'proj_1790000000007';
const cartella = (over) => Object.assign({ folderName: 'Circuiti in classe', fullPath: '/M/4R/Scienze/Circuiti in classe',
  rootNodeLabel: 'Elettricità', classDir: '4R', discDir: 'Scienze', extractionMode: 'mindmap', projectId: ID,
  lastUpdated: '2026-10-13T10:00:00.000Z' }, over);

function insegna(caso) {
  const d = dom(), storage = new Map(Object.entries(caso.cassetto || {}));
  const chiamate = { load: [], toast: [] };
  const g = {
    console: { log() {}, warn() {}, error() {} },
    document: d.document, setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    t: (k, f) => f, safeCreateIcons() {}, showLoadingOverlay() {},
    showToast: m => { chiamate.toast.push(String(m)); },
    MappAIStudyDocs: { list: () => [], get: () => null },
    loadSavedProject: id => { chiamate.load.push(id); return Promise.resolve(caso.carica === undefined ? true : caso.carica); },
    directLoadVault: p => { chiamate.load.push(p); return Promise.resolve(); },
    mappaiOccupato: () => !!caso.occupato,
    electronAPI: {
      getAllVaults: () => Promise.resolve(JSON.parse(JSON.stringify(caso.cartelle || []))),
      filesRootGet: () => Promise.resolve({ mapsBaseDir: '/M' }),
      vaultMaterialsList: () => Promise.resolve({ ok: true, files: [] }),
      studySessionsList: () => Promise.resolve({ success: true, rows: [] })
    }
  };
  g.window = g;
  const ctx = vm.createContext(g);
  for (const f of ['mappai-html-sicuro.js', 'mappai-files-core.js', 'mappai-teach-core.js', 'mappai-nome-cartella-core.js', 'mappai-landing-teach.js']) vm.runInContext(JS(f), ctx);
  return { ...d, g, chiamate, storage };
}
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

test('0094 A: la lista delle console mostra il nome della cartella, non il titolo né la riga del cassetto', async () => {
  const h = insegna({ cartelle: [cartella()], cassetto: { tutor_ai_projects: JSON.stringify([{ id: ID, name: 'Elettricità', vault: 'Circuiti in classe', classDir: '4R', discDir: 'Scienze', type: 'mindmap' }]) } });
  const l = await h.g.MappAITeach.mappeDelContesto();
  assert.equal(l.length, 1);
  assert.equal(l[0].nome, 'Circuiti in classe');
  assert.equal(!!l[0].p, true, 'la riga si aggancia come prima');
});

test('0094 A: con «0» la lista torna al titolo di prima', async () => {
  const h = insegna({ cartelle: [cartella()], cassetto: { mappai_nome_da_cartella: '0' } });
  const l = await h.g.MappAITeach.mappeDelContesto();
  assert.equal(l[0].nome, 'Elettricità');
});

test('0094 A: «Progetti esistenti» mostra il nome della cartella', async () => {
  const h = insegna({ cartelle: [cartella()] });
  h.g.MappAITeach.refresh();
  await flush();
  const testo = h.$('#teach-content').text();
  assert.equal(testo.includes('Circuiti in classe'), true);
});

test('0094 C/E: descrizione per «Rinomina…» e proposta per un nome provvisorio; spento niente', async () => {
  const h = insegna({ cartelle: [cartella({ folderName: 'Lettura-proj_1790000000007', fullPath: '/M/4R/Italiano/Lettura-proj_1790000000007', rootNodeLabel: 'Il lupo e l\'agnello', extractionMode: 'lettura', discDir: 'Italiano' })] });
  const l = await h.g.MappAITeach.mappeDelContesto();
  const d = h.g.MappAITeach.perRinomina(l[0]);
  assert.equal(d.vaultPath, '/M/4R/Italiano/Lettura-proj_1790000000007');
  assert.equal(d.nome, 'Lettura-proj_1790000000007');
  assert.equal(d.lettura, true);
  assert.equal(h.g.MappAITeach.propostaNome(l[0]), 'Il lupo e l\'agnello');
  const n = insegna({ cartelle: [cartella()] });
  assert.equal(n.g.MappAITeach.propostaNome((await n.g.MappAITeach.mappeDelContesto())[0]), '', 'un nome normale non propone niente');
  const off = insegna({ cartelle: [cartella()], cassetto: { mappai_nome_da_cartella: '0' } });
  assert.equal(off.g.MappAITeach.perRinomina((await off.g.MappAITeach.mappeDelContesto())[0]), null);
});

test('0094 F3: apriMappa dice «non è riuscito» quando il caricamento rifiuta, una volta sola; occupata → no subito', async () => {
  const h = insegna({ cartelle: [cartella()], carica: false, cassetto: { tutor_ai_projects: JSON.stringify([{ id: ID, name: 'E', vault: 'Circuiti in classe', classDir: '4R', discDir: 'Scienze' }]) } });
  const l = await h.g.MappAITeach.mappeDelContesto();
  let no = 0, si = 0;
  assert.equal(h.g.MappAITeach.apriMappa(l[0], () => { si++; }, () => { no++; }), true);
  await flush();
  assert.equal(no, 1); assert.equal(si, 0);
  const o = insegna({ cartelle: [cartella()], occupato: true });
  const lo = await o.g.MappAITeach.mappeDelContesto();
  assert.equal(o.g.MappAITeach.apriMappa(lo[0], () => {}, () => {}), false);
  assert.equal(o.chiamate.load.length, 0, 'nessun caricamento parte');
});
