'use strict';
/* Spessori della Vista studio (25/9): due leve — «Spessore collegamenti» e
   «Spessore cross-link» — che moltiplicano il tratto di oggi. Qui si prova:
   la normalizzazione dei valori, il tratto per caso (arco, cross-link, fascio,
   filo, filigrana, ponticello), che la leva la sceglie il DATO `isCross` e non
   il ruolo nel disegno (dentro/fuori dall'albero), e il profilo — vecchio,
   illeggibile, per motore, nel pannello, in vista.json.
   Solo l'SVG è finto: motori, renderer e vista sono i moduli dell'app. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Layout = require('../public/js/mappai-studio-layouts');
const Draw = require('../public/js/mappai-studio-draw');
const Vista = require('../public/js/mappai-vista-core');
const d3 = require('../public/js/d3.v7.min');

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
function disegna(res, nodes, spessori) {
  const svg = new SVG();
  Draw.draw(svg, res, nodes, { d3: fakeD3, interactive: false, spessori });
  return svg;
}
// il tratto dell'arco con quella linking word: lo si ritrova dal suo <title>
function trattoDi(svg, rel) {
  const el = svg.all().find(e => e.tag === 'path' &&
    e.children.some(c => c.tag === 'title' && String(c.content).endsWith('(' + rel + ')')));
  assert.ok(el, 'arco ' + rel + ' non disegnato');
  return { w: el.attrs['stroke-width'], dash: el.attrs['stroke-dasharray'] };
}

/* La mappa di prova ha i QUATTRO casi. Visita dell'albero da ROOT: a e b, poi
   c e d passando da a. Quindi: r4 (b→c) è gerarchia rimasta FUORI dall'albero
   (secondo genitore), r5 (a→d) è un cross-link finito DENTRO l'albero (l'unica
   strada per d), r6 (b→d) è un cross-link fuori. */
const NODI = ['ROOT', 'a', 'b', 'c', 'd'].map(id => ({ id, label: id, group: 1 }));
const LINK = [
  { source: 'ROOT', target: 'a', rel: 'r1' }, { source: 'ROOT', target: 'b', rel: 'r2' },
  { source: 'a', target: 'c', rel: 'r3' }, { source: 'b', target: 'c', rel: 'r4' },
  { source: 'a', target: 'd', rel: 'r5', isCross: true }, { source: 'b', target: 'd', rel: 'r6', isCross: true }];

test('normSpessore: assente o illeggibile = 100, fuori scala = il bordo della scala', () => {
  assert.deepEqual(Draw.SPESSORE, { min: 50, max: 300, passo: 10, neutro: 100 });
  for (const v of [undefined, null, '', '  ', 'spesso', NaN, Infinity, -Infinity, {}, [], [150], true])
    assert.equal(Draw.normSpessore(v), 100, 'valore ' + String(v));
  assert.equal(Draw.normSpessore(150), 150);
  assert.equal(Draw.normSpessore('180'), 180, 'un numero scritto come testo resta un numero');
  assert.equal(Draw.normSpessore(10), 50);
  assert.equal(Draw.normSpessore(0), 50);
  assert.equal(Draw.normSpessore(-3), 50);
  assert.equal(Draw.normSpessore(1000), 300);
  assert.equal(Draw.normSpessore(50), 50);
  assert.equal(Draw.normSpessore(300), 300);
});

test('senza leve, o al 100%, ogni caso ha il tratto di sempre', () => {
  const arco = { s: 'a', t: 'b' }, cross = { s: 'a', t: 'b', isCross: true }, filo = { s: 'a', t: 'b', _path: true };
  for (const sp of [undefined, {}, { link: 100, cross: 100 }]) {
    assert.equal(Draw.tratto('principale', arco, 'td', sp), 1.6);
    assert.equal(Draw.tratto('principale', cross, 'dag', sp), 1.6);
    assert.equal(Draw.tratto('principale', arco, 'fasci', sp), 1.3);
    assert.equal(Draw.tratto('principale', filo, 'percorso', sp), 2.6);
    assert.equal(Draw.tratto('filigrana', cross, 'td', sp), 1.1);
    assert.equal(Draw.tratto('ponticello', arco, 'dag', sp), 1.6);
    assert.equal(Draw.tratto('fodera', arco, 'dag', sp), 5.5);
    assert.equal(Draw.tratteggio(Draw.TRATTEGGIO.invertito, Draw.fattoreArco(arco, sp)), '5 4');
    assert.equal(Draw.tratteggio(Draw.TRATTEGGIO.filigrana, Draw.fattoreArco(cross, sp)), '2 4');
  }
});

test('link normale, cross-link, fascio: ognuno moltiplicato dalla SUA leva', () => {
  const sp = { link: 200, cross: 50 };
  const arco = { isCross: false }, cross = { isCross: true };
  assert.equal(Draw.tratto('principale', arco, 'td', sp), 3.2);
  assert.equal(Draw.tratto('principale', cross, 'td', sp), 0.8);
  assert.equal(Draw.tratto('principale', arco, 'fasci', sp), 2.6);
  assert.equal(Draw.tratto('principale', cross, 'fasci', sp), 0.65);
  assert.equal(Draw.tratto('principale', { _path: true }, 'percorso', sp), 5.2, 'il filo va coi collegamenti');
  assert.equal(Draw.tratto('filigrana', cross, 'td', sp), 0.55);
  assert.equal(Draw.tratto('fodera', cross, 'dag', { cross: 300 }), 16.5);
  assert.equal(Draw.tratteggio(Draw.TRATTEGGIO.invertito, 2), '10 8');
  // è cross-link solo il vero `true` (dataset() ed edgeList lo portano già a booleano)
  assert.equal(Draw.fattoreArco({ isCross: 'true' }, sp), 2);
  assert.equal(Draw.fattoreArco(undefined, sp), 2);
});

test('Albero: la leva la sceglie isCross, non «dentro o fuori dall\'albero»', () => {
  const res = Layout.run(NODI, LINK, d3, { mode: 'td' });
  const ruolo = rel => res.edges.some(e => e.edge.rel === rel) ? 'albero' : 'fuori';
  assert.deepEqual(['r1', 'r4', 'r5', 'r6'].map(ruolo), ['albero', 'fuori', 'albero', 'fuori'],
    'i quattro casi esistono davvero nel disegno');
  const svg = disegna(res, NODI, { link: 200, cross: 50 });
  assert.deepEqual(trattoDi(svg, 'r1'), { w: 3.2, dash: undefined });   // albero · gerarchia
  assert.deepEqual(trattoDi(svg, 'r4'), { w: 2.2, dash: '4 8' });       // fuori · gerarchia
  assert.deepEqual(trattoDi(svg, 'r5'), { w: 0.8, dash: undefined });   // albero · cross
  assert.deepEqual(trattoDi(svg, 'r6'), { w: 0.55, dash: '1 2' });      // fuori · cross
});

test('Fasci: fascio pieno e scheletro seguono il dato, non il ruolo', () => {
  const res = Layout.run(NODI, LINK, d3, { mode: 'fasci' });
  assert.deepEqual(res.edges.map(e => e.edge.rel).sort(), ['r4', 'r6'], 'in fascio va ciò che resta fuori dallo scheletro');
  const svg = disegna(res, NODI, { link: 200, cross: 50 });
  assert.deepEqual(trattoDi(svg, 'r4'), { w: 2.6, dash: undefined });   // fascio · collegamento
  assert.deepEqual(trattoDi(svg, 'r6'), { w: 0.65, dash: undefined });  // fascio · cross-link
  assert.deepEqual(trattoDi(svg, 'r1'), { w: 2.2, dash: '4 8' });       // scheletro · collegamento
  assert.deepEqual(trattoDi(svg, 'r5'), { w: 0.55, dash: '1 2' });      // scheletro · cross-link
});

test('Percorso: il filo non è una relazione, va con la leva dei collegamenti', () => {
  const res = Layout.run(NODI, LINK, d3, { mode: 'percorso' });
  const svg = disegna(res, NODI, { link: 200, cross: 50 });
  const fili = svg.all().filter(e => e.tag === 'path' && e.attrs.stroke === '#4f46e5');
  assert.equal(fili.length, NODI.length - 1);
  fili.forEach(f => assert.equal(f.attrs['stroke-width'], 5.2));
  assert.deepEqual(trattoDi(svg, 'r5'), { w: 0.55, dash: '1 2' });      // la relazione vera, in filigrana
});

test('ponticello, fodera, tratteggio degli invertiti e punta crescono col loro arco', () => {
  const inv = { s: 'a', t: 'b', rel: 'x', reversed: true, isCross: false };
  const cr = { s: 'c', t: 'd', rel: 'y', isCross: true };
  const res = {
    kind: 'dag', opt: { w: 40, h: 20 }, dummies: [], extraEdges: [],
    pos: new Map([['a', { x: 0, y: 0, layer: 0 }], ['b', { x: 0, y: 200, layer: 1 }],
      ['c', { x: -100, y: 100, layer: 0 }], ['d', { x: 100, y: 100, layer: 1 }]]),
    edges: [{ edge: inv, pts: [{ x: 0, y: 10 }, { x: 0, y: 190 }] },
      { edge: cr, pts: [{ x: -80, y: 100 }, { x: 80, y: 100 }] }],
    hops: [{ edge: cr, pts: [{ x: -8, y: 100 }, { x: 0, y: 92 }, { x: 8, y: 100 }] }]
  };
  const nodi = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id, group: 1 }));
  const svg = disegna(res, nodi, { link: 200, cross: 300 });
  assert.deepEqual(trattoDi(svg, 'x'), { w: 3.2, dash: '10 8' });
  assert.deepEqual(trattoDi(svg, 'y'), { w: 4.8, dash: undefined });
  const ponte = svg.all().filter(e => e.tag === 'path' && e.attrs['stroke-linecap'] === 'round');
  assert.deepEqual(ponte.map(e => [e.attrs.stroke, e.attrs['stroke-width']]), [['#ffffff', 16.5], ['#334155', 4.8]]);
  // punta: lunga 4.5× e larga 2× (per lato) il tratto, come il marker di prima
  const punta = svg.all().find(e => e.tag === 'path' && e.attrs.fill === '#be123c');
  assert.equal(punta.attrs.d, 'M0,190L-6.4,175.6L6.4,175.6Z');
});

test('trattiPresenti: una leva conta solo se il disegno ha qualcosa da ingrossare', () => {
  const soloGerarchia = LINK.filter(l => !l.isCross), soloCross = LINK.filter(l => l.isCross);
  const presenti = (links, mode) => Draw.trattiPresenti(Layout.run(NODI, links, d3, { mode }));
  assert.deepEqual(presenti(soloGerarchia, 'td'), { link: true, cross: false });
  assert.deepEqual(presenti(LINK, 'dag'), { link: true, cross: true });
  assert.deepEqual(presenti(LINK, 'matrice'), { link: false, cross: false });
  assert.deepEqual(presenti(soloCross, 'dag'), { link: false, cross: true });
  // solo cross-link, ma nel Percorso il filo c'è sempre: la leva dei collegamenti lo muove
  assert.deepEqual(presenti(soloCross, 'percorso'), { link: true, cross: true });
  assert.deepEqual(Draw.trattiPresenti(null), { link: false, cross: false });
  // la matrice ha un ramo suo nel renderer e non traccia linee, qualunque cosa porti il risultato
  assert.deepEqual(Draw.trattiPresenti({ kind: 'matrice', edges: [{ edge: { isCross: true } }], extraEdges: [] }),
    { link: false, cross: false });
});

/* ── la vista vera, in una sandbox ──────────────────────────────────────── */
const SRC = fs.readFileSync(require.resolve('../public/js/mappai-studio-view'), 'utf8');
function vista(profilo, panel = null, locale = {}) {
  const svg = new SVG(), storage = new Map(Object.entries(locale));
  const appState = { db: { nodes: NODI.map(n => ({ ...n })), links: LINK.map(l => ({ ...l })) } };
  if (profilo) appState.studioProfile = profilo;
  const window = { d3, MappAIStudioLayouts: Layout, showToast() {},
    MappAIStudioDraw: { ...Draw, draw: (el, res, nodes, o) => Draw.draw(el, res, nodes, { ...o, interactive: false, d3: fakeD3 }) } };
  const byId = { 'studio-svg': svg, 'sidebar-panel-vista': panel };
  vm.runInNewContext(SRC, {
    window, appState, console: { log() {} },
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v) },
    document: { getElementById: id => byId[id] || null, addEventListener() {} }
  });
  window.MappAIStudioView._state.active = true;
  return { view: window.MappAIStudioView, svg, appState, storage };
}
/* Un pannello finto che legge il markup VERO scritto da buildControls: gli
   attributi di un elemento si ricavano dall'innerHTML. */
function pannello() {
  let html = '', cache = new Map();
  const on = {};
  const elemento = (attr, val) => {
    const m = new RegExp('<(\\w+)([^>]*\\s' + attr + '="' + val + '"[^>]*)>').exec(html);
    if (!m) return null;
    const attrs = {};
    m[2].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
    return { tag: m[1], style: {}, textContent: '', getAttribute: k => (k in attrs ? attrs[k] : null) };
  };
  return {
    on,
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; cache = new Map(); },
    querySelector(sel) {
      if (!cache.has(sel)) {
        const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
        cache.set(sel, m ? elemento(m[1], m[2]) : null);
      }
      return cache.get(sel);
    },
    addEventListener(tipo, fn) { on[tipo] = fn; }
  };
}

test('profilo di prima (senza le due chiavi): 100%, e la mappa è quella di sempre', () => {
  const vecchio = { mode: 'td', defv: 3, set: 'all', labels: 'full',
    perMotore: { dag: { orient: 'td', set: 'all', w: 176, h: 120 } } };
  const h = vista(JSON.parse(JSON.stringify(vecchio)));
  const p = h.view.profile();
  assert.equal(p.swLink, 100);
  assert.equal(p.swCross, 100);
  h.view.render();
  assert.deepEqual(trattoDi(h.svg, 'r1'), { w: 1.6, dash: undefined });
  assert.deepEqual(trattoDi(h.svg, 'r4'), { w: 1.1, dash: '2 4' });
  assert.deepEqual(trattoDi(h.svg, 'r5'), { w: 1.6, dash: undefined });
  assert.deepEqual(trattoDi(h.svg, 'r6'), { w: 1.1, dash: '2 4' });
});

test('valori illeggibili nel profilo: il testo torna al 100%, l\'eccesso al 300%', () => {
  const h = vista({ mode: 'dag', defv: 3, set: 'all', swLink: 'spesso', swCross: 900 });
  const p = h.view.profile();
  assert.equal(p.swLink, 100);
  assert.equal(p.swCross, 300);
  h.view.render();
  assert.equal(trattoDi(h.svg, 'r1').w, 1.6);
  assert.equal(trattoDi(h.svg, 'r5').w, 4.8);
});

test('ogni motore ha i suoi spessori, e una taratura salvata prima del 25/9 non li travasa', () => {
  const h = vista({ mode: 'td', defv: 3, set: 'all', perMotore: { dag: { orient: 'td', set: 'all' } } });
  const p = h.view.profile();
  p.swLink = 200; p.swCross = 250;
  h.view.setMotore('dag');                       // taratura riposta senza spessori
  assert.deepEqual([p.swLink, p.swCross], [100, 100]);
  p.swCross = 150;
  h.view.setMotore('td');                        // l'Albero ritrova i suoi
  assert.deepEqual([p.swLink, p.swCross], [200, 250]);
  assert.equal(trattoDi(h.svg, 'r1').w, 3.2);
  h.view.setMotore('fasci');                     // mai toccato: il tratto di sempre
  assert.deepEqual([p.swLink, p.swCross], [100, 100]);
  h.view.setMotore('dag');
  assert.deepEqual([p.swLink, p.swCross], [100, 150]);
  h.view.ripristina();                           // «Ripristina default · DAG»
  assert.deepEqual([p.swLink, p.swCross], [100, 100]);
  assert.equal(p.perMotore.td.swLink, 200, 'gli altri motori non si toccano');
});

test('vista.json e profilo utente: i due valori viaggiano e tornano uguali', () => {
  const h = vista({ mode: 'td', defv: 3, set: 'all' });
  const p = h.view.profile();
  p.swLink = 180; p.swCross = 60;
  h.view.salvaProfilo();
  assert.equal(JSON.parse(h.storage.get('mappai_studio_profile')).swLink, 180);
  const file = JSON.parse(JSON.stringify(Vista.raccogli(h.appState)));
  const h2 = vista(null);                        // un'altra sessione, il vault riaperto
  assert.deepEqual(Vista.applica(h2.appState, file), ['studioProfile']);
  assert.deepEqual([h2.view.profile().swLink, h2.view.profile().swCross], [180, 60]);
  h2.view.render();
  assert.equal(trattoDi(h2.svg, 'r1').w, 2.88);
  assert.equal(trattoDi(h2.svg, 'r5').w, 0.96);
});

test('pannello: due cursori in %, visibili solo se il disegno li usa; trascinare ridisegna', () => {
  const panel = pannello();
  const h = vista({ mode: 'td', defv: 3, set: 'hier' }, panel);    // l'Albero di partenza
  h.view.buildControls();
  h.view.render();
  const cursore = panel.querySelector('[data-sv-sl="swLink"]');
  assert.deepEqual(['min', 'max', 'step', 'value'].map(a => cursore.getAttribute(a)), ['50', '300', '10', '100']);
  assert.equal(panel.querySelector('[data-sv-out="swCross"]').getAttribute('data-sv-suff'), '%');
  assert.match(panel.innerHTML, /Testo linking words[\s\S]*Spessore collegamenti[\s\S]*Spessore cross-link/);
  const campo = k => panel.querySelector('[data-sv-spessore="' + k + '"]').style.display;
  assert.deepEqual([campo('swLink'), campo('swCross')], ['', 'none'], '«Solo gerarchia»: nessun cross-link da ingrossare');
  h.view.profile().set = 'all';
  h.view.render();
  assert.equal(campo('swCross'), '');
  const sl = { value: '200', getAttribute: () => 'swLink' };
  panel.on.input({ target: { closest: s => (s === '[data-sv-sl]' ? sl : null) } });
  assert.equal(h.view.profile().swLink, 200);
  assert.equal(panel.querySelector('[data-sv-out="swLink"]').textContent, '200%');
  assert.equal(trattoDi(h.svg, 'r1').w, 3.2);
  assert.equal(trattoDi(h.svg, 'r5').w, 1.6, 'il cross-link ha la sua leva');
  h.view.setMotore('matrice');                   // niente linee, niente cursori
  assert.deepEqual([campo('swLink'), campo('swCross')], ['none', 'none']);
});

test('kill-switch mappai_studio_spessori=0: niente cursori, tratto di sempre, valori conservati', () => {
  const panel = pannello();
  const h = vista({ mode: 'td', defv: 3, set: 'all', swLink: 250, swCross: 200 }, panel,
    { mappai_studio_spessori: '0' });
  h.view.buildControls();
  h.view.render();
  assert.doesNotMatch(panel.innerHTML, /data-sv-spessore|Spessore/);
  assert.equal(trattoDi(h.svg, 'r1').w, 1.6);
  assert.deepEqual(trattoDi(h.svg, 'r6'), { w: 1.1, dash: '2 4' });
  assert.deepEqual([h.view.profile().swLink, h.view.profile().swCross], [250, 200]);
});
