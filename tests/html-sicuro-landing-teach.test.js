'use strict';
/*
 * INSEGNA VERA (mappai-landing-teach.js in una vm) davanti ai file di un vault
 * ricevuto da un collega (25/9). I Materiali e i Quiz cartacei elencano i file di
 * `Materiale Studio/` del vault della mappa scelta: il NOME del file finiva, come
 * id, dentro `onclick="…openDiskFile('disk:<percorso>')"`. Il DOM è cheerio
 * (parse5, lo stesso parser del browser); i gestori in linea si ESEGUONO nel
 * contesto della vm, come al clic, risalendo dal bottone alla riga come fa il
 * browser: si vede che cosa arriva davvero al disco, e che nient'altro parte.
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

// il file ostile: un nome che il Finder accetta (niente «/» e niente «:»)
const NOME_OSTILE = 'Quiz-x\');window.__pwned=1;(\'" onmouseover="window.__pwned=2.pdf';
const NOME_MATERIALE = 'Sintesi <img src=x onerror="window.__pwned=3">\');window.__pwned=4;(\'.pdf';
const MAPPA_APOSTROFO = 'L\'Illuminismo';
const REPORT = '/Attività/3A/2026-09-25 · Quiz · ' + MAPPA_APOSTROFO + '\');window.__pwned=5;(\'/report.html';

function insegna(opts = {}) {
  const d = dom(), storage = new Map(), sessione = new Map(), giri = { apri: [], report: [], cartella: [] };
  storage.set('tutor_ai_projects', JSON.stringify([{ id: 'p1', name: 'Clima', vault: 'Clima', type: 'mindmap' }]));
  const g = {
    console: { log() {}, warn() {}, error: (...a) => console.error(...a) },
    document: d.document, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    sessionStorage: { getItem: k => (sessione.has(k) ? sessione.get(k) : null), setItem: (k, v) => sessione.set(k, String(v)), removeItem: k => sessione.delete(k) },
    t: (k, f) => f, safeCreateIcons() {}, showToast() {},
    MappAIStudyDocs: { list: () => [], get: () => null },
    electronAPI: {
      getAllVaults: () => Promise.resolve([{ folderName: 'Clima', fullPath: '/Vault/Clima', rootNodeLabel: 'Clima' }]),
      vaultMaterialsList: () => Promise.resolve({ ok: true, files: [
        { relPath: 'Materiale Studio/' + NOME_OSTILE, name: NOME_OSTILE, mtime: 0 },
        { relPath: 'Materiale Studio/' + NOME_MATERIALE, name: NOME_MATERIALE, mtime: 0 }] }),
      pipelineOpenFile: a => { giri.apri.push(a.relPath); return Promise.resolve({ ok: true }); },
      studySessionsList: () => Promise.resolve({ success: true, rows: [{ activity: 'Quiz', map: MAPPA_APOSTROFO, className: '3A',
        reports: [{ which: 'questions', file: REPORT }], dir: path.dirname(REPORT), total: 1, participants: 1, date: 0 }] }),
      studyReportOpen: f => { giri.report.push(f); return Promise.resolve({ success: true }); },
      studySessionOpenFolder: a => { giri.cartella.push(a.dir); return Promise.resolve({ success: true }); }
    }
  };
  g.window = g;
  const ctx = vm.createContext(g);
  if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
  vm.runInContext(JS('mappai-files-core.js'), ctx);
  vm.runInContext(JS('mappai-landing-teach.js'), ctx);
  /* Il clic come nel browser: dal bottone si risale fino al documento, e ogni
     gestore in linea incontrato gira nel contesto della pagina, finché uno non
     ferma la propagazione. Un gestore che non si compila è già un difetto. */
  const clic = (el) => {
    let fermo = false;
    const ev = { stopPropagation() { fermo = true; }, preventDefault() {} };
    for (let n = el; n && !fermo; n = n.parent) {
      const codice = n.attribs && n.attribs.onclick;
      if (codice) vm.runInContext('(function (event) {' + codice + '\n})', ctx).call(n, ev);
    }
  };
  return { ...d, g, giri, clic };
}
const flush = () => new Promise(r => setImmediate(r));

/* In nessun HTML scritto c'è un elemento o un gestore nato dai dati. */
function soloTemplate(scritti, etichetta) {
  scritti.forEach(html => {
    const $f = cheerio.load(html, null, false);
    assert.equal($f('img, svg, script, iframe, object, embed, a').length, 0, etichetta + ': elemento nato dai dati');
    $f('*').each((_, el) => {
      for (const k of Object.keys(el.attribs)) if (/^on/i.test(k)) assert.equal(k, 'onclick', etichetta + ': gestore <' + el.tagName + ' ' + k + '>');
    });
  });
}

async function scegliMappa(h) {
  h.g.localStorage.setItem('mappai_landing_mode', 'teach');
  h.g.MappAITeach.selectProject('p1');
  for (let i = 0; i < 5; i++) await flush();
}

test('Materiali e Quiz cartacei: il nome del file del vault resta testo, e al clic arriva INTERO al disco', async () => {
  const h = insegna();
  await scegliMappa(h);
  soloTemplate(h.scritti, 'insegna');
  const $ = h.$;
  const riga = nome => $('tr').toArray().find(tr => $(tr).find('div.text-slate-700.truncate').text() === nome);
  for (const nome of [NOME_OSTILE, NOME_MATERIALE]) {
    const tr = riga(nome);
    assert.ok(tr, 'la riga di ' + nome);
    h.clic(tr);                                            // clic sulla riga: apre il file
    $(tr).find('button[onclick]').toArray().slice(0, 2).forEach(b => h.clic(b));   // «Apri», «Apri nel Finder»
  }
  assert.equal(h.g.__pwned, undefined, 'il nome del file non è codice');
  assert.deepEqual(h.giri.apri, ['Materiale Studio/' + NOME_OSTILE, 'Materiale Studio/' + NOME_OSTILE, 'Materiale Studio/' + NOME_OSTILE,
    'Materiale Studio/' + NOME_MATERIALE, 'Materiale Studio/' + NOME_MATERIALE, 'Materiale Studio/' + NOME_MATERIALE],
    'il bottone ferma la propagazione: un clic, un\'apertura');
});

test('Attività: un report di una mappa con l\'apostrofo si apre (e un nome costruito non esegue niente)', async () => {
  const h = insegna();
  await scegliMappa(h);
  soloTemplate(h.scritti, 'attività');
  const $ = h.$;
  const bottoni = $('#teach-activities-body button[onclick]').toArray();
  assert.equal(bottoni.length, 2, 'report e cartella');
  bottoni.forEach(b => h.clic(b));
  assert.deepEqual(h.giri.report, [REPORT]);
  assert.deepEqual(h.giri.cartella, [path.dirname(REPORT)]);
  assert.equal(h.g.__pwned, undefined);
});

test('senza il nucleo il ripiego locale fa lo stesso', async () => {
  const h = insegna({ nucleo: false });
  await scegliMappa(h);
  soloTemplate(h.scritti, 'senza nucleo');
  const tr = h.$('tr').toArray().find(x => h.$(x).find('div.text-slate-700.truncate').text() === NOME_OSTILE);
  h.clic(tr);
  assert.equal(h.g.__pwned, undefined, 'il nome del file non è codice');
  assert.deepEqual(h.giri.apri, ['Materiale Studio/' + NOME_OSTILE]);
});
