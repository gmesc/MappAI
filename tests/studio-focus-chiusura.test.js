'use strict';
/*
 * Il Focus della Vista studio e la vista che resta sotto (25/9). Le leve di RESA
 * (spessori, linking words, gerarchia, bande, frecce, evidenzia) appartengono al
 * profilo della vista intera anche col focus aperto (`profiloDi`): cambiate
 * dentro il focus ridisegnavano solo il focus, e chiuso il focus il pannello
 * diceva 200% mentre la vista sotto era ancora al tratto di prima. Qui: chiudendo
 * il focus la vista si ridisegna quando una di quelle leve è cambiata, una volta
 * sola, e non si ridisegna quando non è cambiato niente.
 * Motori, renderer e vista sono i moduli dell'app; il pannello è cheerio, gli
 * SVG sono finti (come in studio-spessori.test.js).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Layout = require('../public/js/mappai-studio-layouts');
const Draw = require('../public/js/mappai-studio-draw');
const d3 = require('../public/js/d3.v7.min');

const SRC = fs.readFileSync(require.resolve('../public/js/mappai-studio-view'), 'utf8');

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
// il tratto dell'arco con quella linking word, dal suo <title>
function tratto(svg, rel) {
  const el = svg.all().find(e => e.tag === 'path' &&
    e.children.some(c => c.tag === 'title' && String(c.content).endsWith('(' + rel + ')')));
  assert.ok(el, 'arco ' + rel + ' non disegnato');
  return el.attrs['stroke-width'];
}
const parola = (svg, rel) => svg.all().some(e => e.tag === 'text' && e.content === rel);

const NODI = ['ROOT', 'a', 'b', 'c'].map((id, i) => ({ id, label: id, level: Math.min(i, 2), group: 1 }));
const LINK = [{ source: 'ROOT', target: 'a', rel: 'r1' }, { source: 'ROOT', target: 'b', rel: 'r2' },
  { source: 'a', target: 'c', rel: 'r3' }, { source: 'b', target: 'c', rel: 'r4', isCross: true }];

function vista() {
  const $ = cheerio.load('<html><body><div id="sidebar-panel-vista"></div></body></html>');
  const cache = new WeakMap(), ascolti = {}, svg = new SVG(), focusSvg = new SVG();
  const disegni = { vista: 0, focus: 0 };
  function wrap(n) {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = {
      node: n, style: {},
      get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
      get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(String(v)); },
      set textContent(v) { $(n).text(String(v)); },
      get value() { return $(n).attr('value') || ''; }, set value(v) { $(n).attr('value', String(v)); },
      getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
      closest: s => wrap($(n).closest(s)[0]),
      querySelector: s => wrap($(n).find(s)[0]),
      appendChild: c => { $(n).append(c.node); return c; },
      remove: () => { $(n).remove(); },
      addEventListener: (tipo, fn) => { if ($(n).attr('id') === 'sidebar-panel-vista') ascolti[tipo] = fn; }
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
  const appState = { db: { nodes: NODI.map(n => ({ ...n })), links: LINK.map(l => ({ ...l })) },
    studioProfile: { mode: 'td', defv: 3, set: 'all', labels: 'full', swLink: 100, swCross: 100 } };
  const window = { d3, MappAIStudioLayouts: Layout,
    MappAIStudioDraw: { ...Draw, draw: (el, res, nodes, o) => {
      disegni[el === svg ? 'vista' : 'focus']++;
      return Draw.draw(el, res, nodes, { ...o, interactive: false, d3: fakeD3 });
    } } };
  vm.runInNewContext(SRC, { window, appState, document, console: { log() {} },
    localStorage: { getItem: () => null, setItem() {} } });
  const view = window.MappAIStudioView;
  // i gesti del docente sul pannello: gli stessi gestori che l'app lega a #sidebar-panel-vista
  const pannello = () => $('#sidebar-panel-vista');
  const cursore = (k, v) => {
    const el = wrap(pannello().find('[data-sv-sl="' + k + '"]')[0]);
    assert.ok(el, 'cursore ' + k);
    el.value = String(v);
    ascolti.input({ target: el });
  };
  const bottone = (sel) => {
    const el = wrap(pannello().find(sel)[0]);
    assert.ok(el, 'bottone ' + sel);
    ascolti.click({ target: el });
  };
  return { view, svg, focusSvg, disegni, cursore, bottone, pannello, appState };
}

test('uno spessore cambiato dentro il focus: chiuso il focus, la vista sotto ha il tratto che il pannello dice', () => {
  const h = vista();
  h.view.riprendi();
  assert.equal(tratto(h.svg, 'r1'), 1.6);
  h.view.openFocus('a', 'vicini');
  h.cursore('swLink', 200);
  assert.equal(tratto(h.focusSvg, 'r1'), 3.2, 'il focus si ridisegna subito');
  const prima = { ...h.disegni };
  h.bottone('#sv-focus-exit');                            // «Chiudi il focus»
  assert.equal(tratto(h.svg, 'r1'), 3.2, 'la vista sotto segue la leva');
  assert.equal(h.pannello().find('[data-sv-sl="swLink"]').attr('value'), '200');
  assert.deepEqual([h.disegni.vista - prima.vista, h.disegni.focus - prima.focus], [1, 0], 'un ridisegno solo');
});

test('le linking words cambiate dentro il focus: chiuso il focus, spariscono anche dalla vista', () => {
  const h = vista();
  h.view.riprendi();
  assert.equal(parola(h.svg, 'r1'), true);
  h.view.openFocus('a', 'vicini');
  h.bottone('[data-sv-seg="labels"] button[data-v="off"]');
  assert.equal(parola(h.focusSvg, 'r1'), false);
  h.view.closeFocus();                                    // anche l'ESC passa di qui
  assert.equal(parola(h.svg, 'r1'), false);
});

test('focus aperto e chiuso senza toccare la resa: la vista non si ridisegna', () => {
  const h = vista();
  h.view.riprendi();
  h.view.openFocus('a', 'vicini');
  h.cursore('w', 240);                                    // geometria: è del focus, non della vista
  h.bottone('[data-sv-fmode="parenti"]');                 // cambiare il tipo di focus
  const prima = { ...h.disegni };
  h.view.closeFocus();
  assert.equal(h.disegni.vista - prima.vista, 0);
});

test('«Archi usati» e «Ripristina» dentro il focus ridisegnano la vista una volta, non due', () => {
  const h = vista();
  h.view.riprendi();
  h.view.openFocus('a', 'vicini');
  h.cursore('swLink', 200);                               // la vista sotto resta indietro…
  let prima = { ...h.disegni };
  h.bottone('[data-sv-seg="set"] button[data-v="hier"]'); // …e il ritaglio la rimette in pari
  assert.deepEqual([h.disegni.vista - prima.vista, h.disegni.focus - prima.focus], [1, 1]);
  prima = { ...h.disegni };
  h.view.closeFocus();
  assert.equal(h.disegni.vista - prima.vista, 0, 'già in pari: chiudere non ridisegna');
  h.view.openFocus('a', 'vicini');
  prima = { ...h.disegni };
  h.bottone('#sv-reset');
  assert.deepEqual([h.disegni.vista - prima.vista, h.disegni.focus - prima.focus], [1, 1]);
  prima = { ...h.disegni };
  h.view.closeFocus();
  assert.equal(h.disegni.vista - prima.vista, 0);
  assert.equal(tratto(h.svg, 'r1'), 1.6);
});

test('il bottone TESTO col focus aperto cambia il focus che si guarda; la vista sotto la rimette in pari la chiusura', () => {
  const h = vista();
  h.view.riprendi();
  h.view.openFocus('a', 'vicini');
  assert.equal(parola(h.focusSvg, 'r1'), true);
  const prima = { ...h.disegni };
  h.view.cicloLabels({ off: 'short', short: 'full', full: 'off' });   // intere → no
  assert.equal(parola(h.focusSvg, 'r1'), false, 'si ridisegna ciò che si guarda');
  assert.deepEqual([h.disegni.vista - prima.vista, h.disegni.focus - prima.focus], [0, 1]);
  h.view.closeFocus();
  assert.equal(parola(h.svg, 'r1'), false);
});
