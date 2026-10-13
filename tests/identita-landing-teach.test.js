'use strict';
/*
 * identita-landing-teach.test.js — packet 0061, «creare non è aprire» (ADR 0013).
 *
 * INSEGNA vera (mappai-landing-teach.js in una vm) con i core veri (mappai-teach-core.js,
 * mappai-files-core.js) e un `getAllVaults` finto. Il DOM è cheerio: `dom()` è COPIATO da
 * tests/html-sicuro-landing-teach.test.js, che resta intatto. I gestori in linea si
 * ESEGUONO nel contesto della vm, come al clic, risalendo dal bottone alla riga come fa il
 * browser. `window.loadSavedProject` e `window.directLoadVault` registrano la chiamata.
 *
 *  · la riga di «Progetti esistenti» e il suo «Riprendi» (`projOpen`): una cartella che
 *    dichiara il suo id apre la SUA voce, o la cartella stessa; mai un'omonima (D4);
 *  · «Riordina cartelle» (`backfillVaults`): la cartella nuova porta l'id della voce, e una
 *    voce il cui id è già dichiarato da una cartella non se ne fa una seconda (D7).
 *
 * ⚠️ Un'asserzione fallita su un elemento del DOM finto fa girare Node all'infinito:
 * qui si asserisce SOLO su booleani, stringhe e numeri.
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

// Gli id del caso sono nella forma che l'app conia (`proj_` + 13 cifre).
const ID = n => 'proj_17890' + String(n).padStart(8, '0');
const nodi = titolo => ({ nodes: [{ id: 'root', label: titolo, desc: 'Testo.', level: 0, group: 0 },
  { id: 'a', label: 'Ramo', desc: 'Dettaglio.', level: 1, group: 1 }], links: [{ source: 'root', target: 'a', rel: 'include' }] });
const fotografia = titolo => JSON.stringify({ rootNodeLabel: titolo, extractionMode: 'mindmap', db: nodi(titolo) });
const voce = (id, vault, over) => Object.assign({ id: id, name: vault || 'Mappa', vault: vault, classDir: '4R', discDir: 'Storia',
  type: 'mindmap', date: 1 }, over);
function cartella(fullPath, over) {
  const segs = fullPath.split('/').filter(Boolean);
  return Object.assign({ folderName: segs[segs.length - 1], fullPath: fullPath, rootNodeLabel: segs[segs.length - 1],
    classDir: segs[1], discDir: segs[2], extractionMode: 'mindmap', lastUpdated: '2026-09-28T10:00:00.000Z' }, over);
}

function insegna(caso) {
  const d = dom(), storage = new Map(Object.entries(caso.cassetto || {})), sessione = new Map();
  const chiamate = { loadSavedProject: [], directLoadVault: [], saveVault: [], toast: [] };
  const g = {
    console: { log() {}, warn() {}, error: (...a) => console.error(...a) },
    document: d.document, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    sessionStorage: { getItem: k => (sessione.has(k) ? sessione.get(k) : null), setItem: (k, v) => sessione.set(k, String(v)), removeItem: k => sessione.delete(k) },
    t: (k, f) => f, safeCreateIcons() {}, showLoadingOverlay() {},
    showToast: m => { chiamate.toast.push(String(m)); },
    MappAIStudyDocs: { list: () => [], get: () => null },
    loadSavedProject: id => { chiamate.loadSavedProject.push(id); },
    directLoadVault: p => { chiamate.directLoadVault.push(p); },
    electronAPI: {
      getAllVaults: () => Promise.resolve(JSON.parse(JSON.stringify(caso.cartelle || []))),
      filesRootGet: () => Promise.resolve({ mapsBaseDir: '/M' }),
      saveVault: a => { chiamate.saveVault.push({ folderPath: a.folderPath, projectId: a.mapData ? a.mapData.projectId : undefined }); return Promise.resolve({ success: true }); },
      vaultMaterialsList: () => Promise.resolve({ ok: true, files: [] }),
      studySessionsList: () => Promise.resolve({ success: true, rows: [] })
    }
  };
  g.window = g;
  const ctx = vm.createContext(g);
  vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
  vm.runInContext(JS('mappai-files-core.js'), ctx);
  vm.runInContext(JS('mappai-teach-core.js'), ctx);
  vm.runInContext(JS('mappai-landing-teach.js'), ctx);
  /* Il clic come nel browser: dal bottone si risale fino al documento, e ogni gestore in
     linea incontrato gira nel contesto della pagina, finché uno non ferma la propagazione. */
  const clic = (el) => {
    let fermo = false;
    const ev = { stopPropagation() { fermo = true; }, preventDefault() {} };
    for (let n = el; n && !fermo; n = n.parent) {
      const codice = n.attribs && n.attribs.onclick;
      if (codice) vm.runInContext('(function (event) {' + codice + '\n})', ctx).call(n, ev);
    }
  };
  return { ...d, g, chiamate, clic, storage };
}
const flush = () => new Promise(r => setImmediate(r));

/* «Riprendi» sulla riga della mappa `titolo` in «Progetti esistenti», come al clic.
   Ogni caso ha una cartella sola: in tutta la sezione c'è un solo «Riprendi». */
async function riprendi(h, titolo) {
  h.g.MappAITeach.refresh();
  for (let i = 0; i < 8; i++) await flush();
  const $ = h.$;
  const bottoni = $('#teach-projects-body button[onclick]').toArray().filter(b => /projOpen\(/.test(b.attribs.onclick || ''));
  assert.equal(bottoni.length, 1, 'un «Riprendi», per l\'unica cartella del caso');
  assert.ok($(bottoni[0]).closest('tr').text().includes(titolo), 'sulla riga della cartella «' + titolo + '»');
  h.clic(bottoni[0]);
}

test('0061: L1. «Riordina cartelle» porta l\'id della voce', async () => {
  const P = ID(1);
  const h = insegna({ cassetto: { tutor_ai_projects: JSON.stringify([voce(P, null, { name: 'Orfana', classDir: null, discDir: null })]),
    [P]: fotografia('Orfana') }, cartelle: [] });
  await h.g.MappAITeach.backfillVaults();
  assert.equal(h.chiamate.saveVault.length, 1, 'una cartella per la voce orfana');
  assert.equal(h.chiamate.saveVault[0].projectId, P, 'e porta il suo id');
});

test('0061: L2. «Riordina cartelle» non fa una seconda cartella per una voce il cui id ha già una cartella', async () => {
  const X = ID(2);
  const orfana = voce(X, null, { name: 'F', classDir: null, discDir: null });
  const h = insegna({ cassetto: { tutor_ai_projects: JSON.stringify([orfana]), [X]: fotografia('F') },
    cartelle: [cartella('/M/4R/Storia/F', { projectId: X })] });
  await h.g.MappAITeach.backfillVaults();
  assert.equal(h.chiamate.saveVault.length, 0, 'nessuna scrittura per X');
  const dopo = JSON.parse(h.storage.get('tutor_ai_projects')).find(p => p.id === X);
  assert.equal(JSON.stringify(dopo), JSON.stringify(orfana), 'la voce X resta com\'era');
  assert.ok(h.chiamate.toast.includes('0 cartelle create.'), 'il conteggio non la conta: ' + h.chiamate.toast.join(' | '));
});

test('0061: L3. la riga di INSEGNA apre la voce della cartella, non l\'omonima più recente', async () => {
  const M = ID(3), N = ID(4);
  const h = insegna({ cassetto: { tutor_ai_projects: JSON.stringify([voce(M, 'X', { date: 99 }), voce(N, 'X', { date: 1 })]) },
    cartelle: [cartella('/M/4R/Storia/X', { projectId: N })] });
  await riprendi(h, 'X');
  assert.deepEqual(h.chiamate.loadSavedProject, [N]);
  assert.deepEqual(h.chiamate.directLoadVault, []);
});

test('0061: L3b. una cartella con id senza voce apre la cartella', async () => {
  const E = ID(5), N = ID(6);
  const h = insegna({ cassetto: { tutor_ai_projects: JSON.stringify([voce(E, 'X')]) },
    cartelle: [cartella('/M/4R/Storia/X', { projectId: N })] });
  await riprendi(h, 'X');
  assert.deepEqual(h.chiamate.directLoadVault, ['/M/4R/Storia/X']);
  assert.deepEqual(h.chiamate.loadSavedProject, [], 'nessuna voce omonima al posto della cartella');
});

test('0061: L3c. una cartella con id spostata in un\'altra materia apre la cartella', async () => {
  const N = ID(7);
  // la voce N dichiara ancora 4R/Storia; la cartella ora sta in 4R/Geografia
  const h = insegna({ cassetto: { tutor_ai_projects: JSON.stringify([voce(N, 'X')]) },
    cartelle: [cartella('/M/4R/Geografia/X', { projectId: N })] });
  await riprendi(h, 'X');
  assert.deepEqual(h.chiamate.directLoadVault, ['/M/4R/Geografia/X']);
  assert.deepEqual(h.chiamate.loadSavedProject, [], 'la fotografia punta al percorso vecchio: non si passa di lì');
});
