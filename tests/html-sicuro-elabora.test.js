'use strict';
/*
 * ELABORA VERO (mappai-elabora.js in una vm) all'apertura, davanti a un vault
 * ricevuto da un collega (25/9): id dei nodi nei gestori in linea dell'albero e
 * delle card, colori di `customColors` negli `style`, livello del nodo e
 * profondità del triage. Il DOM è cheerio (parse5, lo stesso parser del browser);
 * i gestori in linea si ESEGUONO nel contesto della vm, come al clic, con un
 * `MappAIElabora` che registra le chiamate: si vede che cosa arriva davvero, e
 * che nient'altro parte. I motori (enrich, deepen, fedeltà) sono finti e minimi:
 * qui si prova la resa, non l'analisi.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const TextUtils = require('../public/js/mappai-text-utils.js');
const DocEdit = require('../public/js/mappai-docedit-core.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

function dom() {
  const $ = cheerio.load('<html><head></head><body><div id="elabora-content"></div></body></html>');
  const cache = new WeakMap(), scritti = [];
  function wrap(n) {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = {
      node: n, style: {},
      get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
      classList: {
        add: (...c) => { $(n).addClass(c.join(' ')); },
        remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
        contains: c => $(n).hasClass(c)
      },
      get innerHTML() { return $(n).html(); }, set innerHTML(v) { scritti.push(String(v)); $(n).html(String(v)); },
      set textContent(v) { $(n).text(String(v)); },
      get isConnected() { return $(n).closest('html').length > 0; },
      appendChild: c => { $(n).append(c.node); return c; },
      remove: () => { $(n).remove(); }
    };
    cache.set(n, e);
    return e;
  }
  const document = {
    head: wrap($('head')[0]), body: wrap($('body')[0]),
    getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
    createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0])
  };
  return { $, document, scritti };
}

const EVIL = '<img src=x onerror="window.__pwned=1">';
/* L'id chiude la vecchia stringa con la barra (`\'`), poi esce dall'attributo con `"` */
const ID_OSTILE = 'n1\\\');window.__pwned=2;//" onmouseover="window.__pwned=3';
const COLORE_OSTILE = 'red;background:url(javascript:window.__pwned=4)" onmouseover="window.__pwned=5';
const LIVELLO_OSTILE = '2"><img src=x onerror="window.__pwned=6">';
const RESIDUO = 'Frase residua della fonte che manca alla scheda.';
const CORPUS = 'La fotosintesi trasforma la luce in energia chimica. ' + RESIDUO + ' Un testo neutro senza nulla.';

function elabora(opts = {}) {
  const d = dom(), chiamate = [];
  const s = {
    extractionMode: 'mindmap', rootNodeLabel: opts.pulito ? 'Mappa' : EVIL + ' Mappa',
    mmTriage: opts.pulito ? null : { essentialDepth: EVIL, contentType: 'mixed', rationale: 'r' },
    db: {
      nodes: [
        { id: 'ROOT', level: 0, label: 'Radice' },
        { id: 'A', level: 1, group: 1, label: 'Luce', desc: 'La fotosintesi trasforma la luce in energia chimica nelle foglie' },
        { id: opts.pulito ? 'C' : ID_OSTILE, level: 2, group: 1, label: opts.pulito ? 'Clorofilla' : EVIL, desc: 'uno due tre quattro cinque sei' },
        { id: 'B', level: opts.pulito ? 2 : LIVELLO_OSTILE, group: 1, label: 'Foglia', desc: 'breve' }
      ],
      links: [{ source: 'ROOT', target: 'A' }, { source: 'A', target: opts.pulito ? 'C' : ID_OSTILE }, { source: 'A', target: 'B' }],
      customColors: { 1: COLORE_OSTILE }
    }
  };
  const R = {
    coverage: { hasSource: true, cards: [{ nodeId: opts.pulito ? 'C' : ID_OSTILE, label: opts.pulito ? 'Clorofilla' : EVIL, wordCount: 6, groundedness: 0.5,
      residue: [{ text: RESIDUO, newWords: 4 }] }] },
    text: { signals: opts.pulito ? [] : [{ key: 'k1\\\');window.__pwned=7;//', observation: EVIL, suggestion: 'fai così' }],
      words: 20, sentences: 3, connectives: { causale: { count: 0 } }, gulpease: null },
    structural: []
  };
  const g = {
    console: { log() {}, warn() {}, error: (...a) => console.error(...a) },
    document: d.document, setTimeout: () => 0, JSON, String, Map, Set,
    localStorage: { getItem: () => null, setItem() {} },
    appState: s, colorScale: { 0: '#0f172a', 1: '#ef4444' },
    cleanLabel: TextUtils.cleanLabel, safeCreateIcons() {},
    MappAIEnrichCore: { analyzeEnrichment: () => R },
    MappAIDescFidelity: { corpusFromState: () => CORPUS },
    MappAIDeepenCore: {
      splitSentences: t => String(t).split(/(?<=\.)\s+/).map(x => x.trim()).filter(Boolean),
      buildCoverageIndex: txt => String(txt).toLowerCase(),
      lexicalOverlap: (sent, idx) => {
        const w = String(sent).toLowerCase().match(/[a-zà-ù]+/g) || [];
        return { total: w.length, containment: w.length ? w.filter(x => idx.includes(x)).length / w.length : 0 };
      }
    }
  };
  g.window = g;
  if (opts.docEdit !== false) g.MappAIDocEdit = DocEdit;
  const ctx = vm.createContext(g);
  if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
  vm.runInContext(JS('mappai-elabora.js'), ctx);
  const vero = g.MappAIElabora;
  /* Il clic come nel browser: il gestore diventa una funzione con `event`, e gira
     nel contesto della pagina con un MappAIElabora che registra. Un gestore che
     non si compila è già un difetto: quelli dell'app sono sempre JS valido. */
  const esegui = el => {
    const reg = new Proxy({}, { get: (_, k) => (...a) => { chiamate.push([k, ...a.filter(x => typeof x !== 'object')]); } });
    g.MappAIElabora = reg;
    try {
      for (const [k, codice] of Object.entries(el.attribs)) {
        if (!/^on/i.test(k)) continue;
        vm.runInContext('(function (event) {' + codice + '\n})', ctx)
          .call({ classList: { add() {}, remove() {} } }, { stopPropagation() {}, preventDefault() {}, dataTransfer: { setData() {} } });
      }
    } finally { g.MappAIElabora = vero; }
  };
  return { ...d, g, s, R, elab: vero, chiamate, esegui };
}

const GESTORI_DEL_TEMPLATE = new Set(['onclick', 'ondblclick', 'ondragstart', 'ondragover', 'ondragleave', 'ondrop', 'onchange']);
/* In nessun HTML scritto c'è un elemento, un gestore o uno stile nato dai dati. */
function soloTemplate(scritti, etichetta) {
  scritti.forEach(html => {
    const $f = cheerio.load(html, null, false);
    assert.equal($f('img, svg, script, iframe, object, embed').length, 0, etichetta + ': elemento nato dai dati');
    $f('*').each((_, el) => {
      for (const [k, v] of Object.entries(el.attribs)) {
        if (/^on/i.test(k)) assert.ok(GESTORI_DEL_TEMPLATE.has(k), etichetta + ': gestore <' + el.tagName + ' ' + k + '>');
        if (k === 'style') assert.doesNotMatch(v, /url\(|javascript|__pwned|red;/i, etichetta + ': stile ' + v);
      }
    });
  });
}

test('apertura sulla fonte: triage, colori e card del vault restano dati; i clic portano l\'id intero', () => {
  const h = elabora();
  h.elab.open();
  h.elab.setMode('source');
  soloTemplate(h.scritti, 'fonte');
  const $ = h.$, ov = $('#elab-overlay');
  assert.equal(ov.find('.elab-verdict').text(), 'essenziale · L' + EVIL);
  assert.equal(ov.find('.elab-title').text().includes(EVIL + ' Mappa'), true);
  // la frase-residuo e la frase coperta hanno il colore di sempre del gruppo (colorScale), non quello del vault
  assert.equal(ov.find('.elab-s-res').attr('style'), 'background:rgba(239,68,68,0.2);box-shadow:inset 0 -2px 0 rgba(239,68,68,0.85)');
  assert.equal(ov.find('.elab-s-res').text(), RESIDUO);
  assert.equal(ov.find('.elab-s-cov').attr('style'), 'background:linear-gradient(transparent 60%,rgba(239,68,68,0.32) 60%)');
  // le card: «Ignora» arriva con la chiave esatta
  ov.find('[onclick]').toArray().forEach(h.esegui);
  const ignora = h.chiamate.filter(c => c[0] === 'ignore').map(c => c[1]);
  assert.ok(ignora.includes('cov:' + ID_OSTILE), JSON.stringify(ignora));
  assert.ok(ignora.includes('sig:' + h.R.text.signals[0].key), JSON.stringify(ignora));
  assert.equal(h.g.__pwned, undefined);
});

test('albero: id, livello e colore del vault; ogni gestore della riga chiama con l\'id esatto', () => {
  const h = elabora();
  h.elab.open();
  h.elab.setMode('source');
  h.elab.setRightView('tree');
  soloTemplate(h.scritti, 'albero');
  const $ = h.$;
  const riga = $('.elab-tr').toArray().find(el => $(el).find('.elab-tw-lbl').text() === EVIL);
  assert.ok(riga, 'la riga del nodo ostile c\'è');
  assert.equal($(riga).find('.elab-tw-dot').attr('style'), 'background:#ef4444');
  h.esegui(riga);
  $(riga).find('[onclick]').toArray().forEach(h.esegui);
  const perId = h.chiamate.filter(c => c.includes(ID_OSTILE)).map(c => c[0]).sort();
  assert.deepEqual(perId, ['addChild', 'editNode', 'editNode', 'gotoNodeCard', 'renameNode', 'startMergePick',
    'treeDragStart', 'treeDrop', 'treeRowClick'].sort());
  assert.ok(h.chiamate.every(c => c.slice(1).every(a => a === ID_OSTILE || !String(a).includes('pwned'))), JSON.stringify(h.chiamate));
  const livello = $('.elab-tr').toArray().find(el => $(el).find('.elab-tw-lbl').text() === 'Foglia');
  assert.equal($(livello).find('.elab-tw-lvl').text(), 'L' + LIVELLO_OSTILE);
  assert.equal(h.g.__pwned, undefined);
});

/* Qui il vault è pulito tranne il colore: sul codice di prima questa prova cade
   per il colore, non per il triage o per l'id. */
test('i colori (anche quelli che vanno ai documenti esportati) passano dallo stesso filtro, anche senza normColor', () => {
  for (const docEdit of [true, false]) {
    const h = elabora({ docEdit, pulito: true });
    h.elab.open();
    h.elab.setMode('source');
    soloTemplate(h.scritti, 'colori, normColor ' + docEdit);
    assert.equal(h.$('.elab-s-cov').attr('style'), 'background:linear-gradient(transparent 60%,rgba(239,68,68,0.32) 60%)');
  }
  // un colore scritto dall'app resta il suo: #rgb, #rrggbb, rgb()
  for (const [colore, atteso] of [['#0af', 'rgba(0,170,255,0.32)'], ['#10B981', 'rgba(16,185,129,0.32)'], ['rgb(1, 2, 3)', 'rgba(1,2,3,0.32)']]) {
    const h = elabora({ pulito: true });
    h.s.db.customColors = { 1: colore };
    h.elab.open();
    h.elab.setMode('source');
    assert.equal(h.$('.elab-s-cov').attr('style'), 'background:linear-gradient(transparent 60%,' + atteso + ' 60%)', colore);
  }
});

test('senza il nucleo vale il ripiego locale', () => {
  const h = elabora({ nucleo: false });
  h.elab.open();
  h.elab.setMode('source');
  h.elab.setRightView('tree');
  soloTemplate(h.scritti, 'senza nucleo');
  const riga = h.$('.elab-tr').toArray().find(el => h.$(el).find('.elab-tw-lbl').text() === EVIL);
  h.esegui(riga);
  assert.deepEqual(h.chiamate.map(c => c.slice(0, 2)).filter(c => c[0] === 'treeRowClick'), [['treeRowClick', ID_OSTILE]]);
  assert.equal(h.g.__pwned, undefined);
});
