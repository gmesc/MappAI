'use strict';
/*
 * La Vista studio VERA (mappai-studio-view.js in una vm) davanti a un vista.json
 * ostile (25/9). Il profilo viaggia nel vault che un collega passa a un altro, e
 * il rientro automatico — `riprendi`, chiamato da `initD3Visualization` appena la
 * mappa è a schermo — lo mette nel pannello senza un clic. Motori e renderer sono
 * quelli dell'app; il pannello è cheerio (parse5, lo stesso parser del browser):
 * non si prova che un `onerror` non scatti, ma che nell'albero prodotto non esista
 * alcun elemento o attributo nato dai dati.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Layout = require('../public/js/mappai-studio-layouts');
const Draw = require('../public/js/mappai-studio-draw');
const Vista = require('../public/js/mappai-vista-core');
const d3 = require('../public/js/d3.v7.min');

const SRC = fs.readFileSync(require.resolve('../public/js/mappai-studio-view'), 'utf8');
const NUCLEO = fs.readFileSync(require.resolve('../public/js/mappai-html-sicuro'), 'utf8');

// l'SVG del disegno resta finto, come in studio-spessori.test.js
class SVG {
  constructor(tag = 'svg') { this.tag = tag; this.attrs = {}; this.events = {}; this.children = []; }
  append(tag) { const el = new SVG(tag); this.children.push(el); return el; }
  attr(key, value) { if (arguments.length === 1) return this.attrs[key]; this.attrs[key] = value; return this; }
  style(key, value) { return this.attr(key, value); }
  text(value) { this.content = value; return this; }
  on(event, fn) { this.events[event] = fn; return this; }
  selectAll() { return { remove: () => { this.children = []; } }; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
}
const fakeD3 = { ...d3, select: el => el };

/* Il documento è cheerio; i due SVG del disegno sono finti. `scritti` tiene OGNI
   HTML consegnato a innerHTML: nel browser un <img onerror> scatta quando il
   parser lo crea, anche se un attimo dopo il testo di quel nodo viene riscritto
   (è ciò che `updateMetricsRow` fa con l'uscita della profondità). */
function dom() {
  const $ = cheerio.load('<html><head></head><body><div id="sidebar-panel-vista"></div></body></html>');
  const cache = new WeakMap(), svg = new SVG(), focusSvg = new SVG(), scritti = [];
  function wrap(n) {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = {
      node: n, style: {},
      get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
      get innerHTML() { return $(n).html(); }, set innerHTML(v) { scritti.push(String(v)); $(n).html(String(v)); },
      get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
      get value() { return $(n).attr('value') || ''; }, set value(v) { $(n).attr('value', String(v)); },
      getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
      querySelector: s => wrap($(n).find(s)[0]),
      appendChild: c => { $(n).append(c.node); return c; },
      remove: () => { $(n).remove(); },
      addEventListener() {}
    };
    cache.set(n, e);
    return e;
  }
  const document = {
    body: wrap($('body')[0]),
    getElementById: id => (id === 'studio-svg' ? svg : id === 'sv-focus-svg' ? focusSvg
      : wrap($('[id]').toArray().find(el => el.attribs.id === id))),
    createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
    addEventListener() {}
  };
  return { $, document, svg, focusSvg, scritti };
}

const NODI = ['ROOT', 'a', 'b', 'c'].map((id, i) => ({ id, label: id, level: Math.min(i, 2), group: 1 }));
const LINK = [{ source: 'ROOT', target: 'a', rel: 'r1' }, { source: 'ROOT', target: 'b', rel: 'r2' },
  { source: 'a', target: 'c', rel: 'r3' }, { source: 'b', target: 'c', rel: 'r4', isCross: true }];

function vista(opts = {}) {
  const d = dom(), storage = new Map();
  const appState = { db: { nodes: NODI.map(n => ({ ...n })), links: LINK.map(l => ({ ...l })), customColors: opts.colori || {} } };
  const window = { d3, MappAIStudioLayouts: Layout,
    MappAIStudioDraw: { ...Draw, draw: (el, res, nodes, o) => Draw.draw(el, res, nodes, { ...o, interactive: false, d3: fakeD3 }) } };
  const ctx = vm.createContext({
    window, appState, console: { log() {}, warn() {} }, document: d.document,
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) }
  });
  if (opts.nucleo !== false) vm.runInContext(NUCLEO, ctx);   // UMD: si appende a `window`, come nell'app
  vm.runInContext(SRC, ctx);
  // il vault del collega, riaperto: vista.json passa da MappAIVistaCore.applica come nell'app
  if (opts.vista) assert.deepEqual(Vista.applica(appState, opts.vista), ['studioProfile']);
  return { ...d, view: window.MappAIStudioView, appState, window };
}

const OSTILE = '<img src=x onerror="window.__pwned=1">';
const PROFILO_OSTILE = () => ({
  mode: OSTILE, defv: 3, set: 'all', labels: 'full',
  w: '100px;background:url(x)', gapLayer: '1"><img src=x onerror="window.__pwned=2">',
  gapNode: '12', fsNode: 1e9, h: -5, fsRel: 'NaN', depth: '1"><img src=x onerror="window.__pwned=3">'
});

/* In nessun HTML scritto c'è un elemento o un gestore nato dai dati. Gli unici
   <svg> ammessi sono le due tele del template, con il loro id fisso. */
function nienteNatoDaiDati(scritti, etichetta) {
  scritti.forEach(html => {
    const $f = cheerio.load(html, null, false);
    const attivi = $f('img, svg, script, iframe, object, embed, a').toArray()
      .filter(el => !(el.tagName === 'svg' && /^(studio-svg|sv-focus-svg)$/.test(el.attribs.id || '')));
    assert.equal(attivi.length, 0, etichetta + ': elemento nato dai dati in ' + html.slice(0, 80));
    $f('*').each((_, el) => {
      for (const k of Object.keys(el.attribs)) assert.ok(!/^on/i.test(k), etichetta + ': gestore <' + el.tagName + ' ' + k + '>');
    });
  });
}
/* …e nel pannello ogni cursore è un numero nella sua scala. */
function pannelloPulito(h, etichetta) {
  nienteNatoDaiDati(h.scritti, etichetta);
  const $ = h.$, panel = $('#sidebar-panel-vista');
  assert.ok(panel.find('input[type=range]').length >= 7, etichetta + ': il pannello è quello della vista');
  assert.equal(panel.find('img, svg, script, iframe, object, embed, a').length, 0, etichetta + ': elemento nato dai dati');
  panel.find('*').each((_, el) => {
    for (const k of Object.keys(el.attribs)) assert.ok(!/^on/i.test(k), etichetta + ': gestore <' + el.tagName + ' ' + k + '>');
  });
  panel.find('input[type=range]').each((_, el) => {
    const v = Number(el.attribs.value), min = Number(el.attribs.min), max = Number(el.attribs.max);
    assert.ok(Number.isFinite(v) && v >= min && v <= max, etichetta + ': cursore ' + el.attribs['data-sv-sl'] + ' = ' + el.attribs.value);
  });
  panel.find('[data-sv-out]').each((_, el) => assert.match($(el).text(), /^\d+(\.\d+)?(px|%)$/, etichetta));
}

test('vista.json ostile: il rientro automatico mette nel pannello numeri, non il dato', () => {
  const h = vista({ vista: { schema: 'mappai-vista@1', studioProfile: PROFILO_OSTILE() } });
  assert.equal(h.view.riprendi(), true, 'una mappa nuova rientra da sola nella vista');
  pannelloPulito(h, 'rientro');
  const p = h.view.profile();
  assert.equal(p.mode, 'td', 'un motore che non esiste torna Albero');
  assert.deepEqual([p.w, p.gapLayer, p.gapNode, p.fsNode, p.h, p.fsRel, p.depth],
    [176, 260, 12, 22, 30, 9, 999], 'illeggibile = default del motore, fuori scala = bordo della scala');
  assert.equal(h.$('#sv-reset').text(), 'Ripristina default · Albero');
  // il disegno parte dagli stessi numeri
  assert.equal(h.view._state.lastRes.opt.w, 176);
  assert.equal(h.window.__pwned, undefined);
});

test('le tarature riposte per motore e il focus passano dalla stessa regola; i valori dell\'app restano', () => {
  const sp = { mode: 'dag', defv: 3, set: 'all', labels: 'full', w: 200, fsNode: 20, gapLayer: 51, swLink: 150, depth: 2,
    perMotore: { td: { w: '1"><svg onload="window.__pwned=4">', gapNode: 'x', fsRel: '12', h: 400 },
      [OSTILE]: { w: 'y' } },
    focus: { w: OSTILE, fsNode: '9', gapLayer: {} } };
  const h = vista({ vista: { schema: 'mappai-vista@1', studioProfile: sp } });
  h.view.riprendi();                                  // una mappa nuova si apre in Albero: tira fuori la taratura riposta
  pannelloPulito(h, 'taratura riposta');
  const p = h.view.profile();
  assert.deepEqual([p.mode, p.w, p.gapNode, p.fsRel, p.h], ['td', 176, 28, 12, 120]);
  // la taratura del DAG scritta dall'app è stata riposta com'era, numero per numero
  assert.deepEqual([p.perMotore.dag.w, p.perMotore.dag.fsNode, p.perMotore.dag.gapLayer, p.perMotore.dag.swLink], [200, 20, 51, 150]);
  assert.equal(p.depth, 2);
  assert.deepEqual(p.perMotore[OSTILE], { w: 'y' }, 'una chiave che non è un motore non si legge e non si tocca');
  // il focus: la sua geometria viaggia anche lei in vista.json
  h.view.openFocus('a', 'vicini');
  pannelloPulito(h, 'focus');
  const cursore = k => h.$('#sidebar-panel-vista [data-sv-sl="' + k + '"]').attr('value');
  assert.deepEqual([cursore('w'), cursore('fsNode'), cursore('gapLayer')], ['210', '9', '96']);
  assert.equal(h.window.__pwned, undefined);
});

test('un profilo che non è un oggetto vale «nessun profilo»: la vista si apre coi default', () => {
  const h = vista({ vista: { schema: 'mappai-vista@1', studioProfile: 'td' } });
  assert.equal(h.view.riprendi(), true);
  assert.equal(h.view.profile().mode, 'td');
  pannelloPulito(h, 'profilo-testo');
});

test('la scheda di ripiego (banco, senza la scheda dell\'app): colore e livello del vault restano dati', () => {
  const h = vista({ colori: { 1: 'red;background:url(javascript:window.__pwned=5)" onmouseover="window.__pwned=6' } });
  h.appState.db.nodes[1].level = '1"><img src=x onerror="window.__pwned=7">';
  h.view.openDescModal('a');
  nienteNatoDaiDati(h.scritti, 'scheda di ripiego');
  const mo = h.$('#sv-desc-modal');
  assert.equal(mo.length, 1);
  assert.equal(mo.find('img, svg, script').length, 0);
  mo.find('*').each((_, el) => {
    for (const k of Object.keys(el.attribs)) assert.ok(!/^on/i.test(k), 'gestore <' + el.tagName + ' ' + k + '>');
    if (el.attribs.style) assert.doesNotMatch(el.attribs.style, /url\(|javascript|red;/i, el.attribs.style);
  });
  assert.equal(mo.find('.pm-subtitle').text(), 'Livello 1"><img src=x onerror="window.__pwned=7">');
  assert.equal(mo.find('i[data-lucide="file-text"]').attr('style'), 'color:#64748b');
});

test('senza il nucleo (il reader copia questo file e non lo carica ancora) vale il ripiego', () => {
  const h = vista({ nucleo: false, vista: { schema: 'mappai-vista@1', studioProfile: PROFILO_OSTILE() } });
  h.view.riprendi();
  pannelloPulito(h, 'senza nucleo');
  h.appState.db.nodes[1].label = 'l\'<b>albero</b>';
  h.view.openDescModal('a');
  assert.equal(h.$('#sv-desc-modal .pm-title').text(), 'l\'<b>albero</b>');
  assert.equal(h.$('#sv-desc-modal .pm-title b').length, 0);
});
