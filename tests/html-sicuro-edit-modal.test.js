'use strict';
/*
 * La modifica del nodo e la scheda «Note» VERE (mappai-edit-modal.js in una vm)
 * davanti a un vault ricevuto da un collega (25/9). Il DOM è cheerio (parse5, lo
 * stesso parser del browser); i gestori in linea si ESEGUONO, nel contesto della
 * vm, come farebbe il browser al clic: così si vede che cosa arriva davvero a
 * `zoomToNode` e a `openCustomLink`, e che nient'altro parte.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const TextUtils = require('../public/js/mappai-text-utils.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

const CORPO = `
  <input id="edit-n-label"><textarea id="edit-n-content"></textarea>
  <button id="revert-ai-btn" class="hidden"></button>
  <input type="checkbox" id="edit-vis-text"><input type="checkbox" id="edit-vis-image">
  <input type="checkbox" id="edit-vis-link"><input type="checkbox" id="edit-vis-file">
  <input id="edit-n-url-input"><input id="edit-n-image-url-input"><input id="edit-n-image-file-input">
  <input id="edit-n-color">
  <div id="edit-node-header"><span id="edit-node-subtitle"></span></div>
  <div id="edit-media-section"></div>
  <div id="edit-n-urls-list"></div><div id="edit-n-images-list"></div>
  <div id="edit-node-modal" class="hidden opacity-0"><div id="edit-node-box" class="scale-95"></div></div>
  <div id="user-notes-container"><p id="empty-notes-hint">Nessuna nota presente.</p></div>`;

function dom() {
  const $ = cheerio.load('<html><body>' + CORPO + '</body></html>');
  const cache = new WeakMap(), scritti = [];
  function wrap(n) {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = {
      node: n, style: {},
      get id() { return n.attribs ? (n.attribs.id || '') : ''; },
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
      get value() { return $(n).val() || ''; }, set value(v) { $(n).val(String(v)); },
      get children() { return (n.children || []).filter(c => c.type === 'tag').map(wrap); },
      get firstChild() { return wrap((n.children || [])[0]); },
      appendChild: c => { $(n).append(c.node); return c; },
      remove: () => { $(n).remove(); }
    };
    cache.set(n, e);
    return e;
  }
  const document = {
    getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
    createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0])
  };
  return { $, document, scritti };
}

function modulo(opts = {}) {
  const d = dom(), giri = { zoom: [], link: [], alert: 0 };
  const g = {
    console: { log() {}, warn() {}, error: (...a) => console.error(...a) },
    document: d.document, setTimeout: () => 0, JSON, String,
    appState: { db: { nodes: opts.nodes || [], links: [], customColors: {} } },
    cleanLabel: TextUtils.cleanLabel, colorScale: { 0: '#0f172a', 1: '#ef4444', 2: '#f59e0b' },
    safeCreateIcons() {}, t: (k, f) => f,
    zoomToNode: id => giri.zoom.push(id),
    openCustomLink: u => giri.link.push(u),
    alert: () => { giri.alert++; }
  };
  g.window = g;
  const ctx = vm.createContext(g);
  if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
  vm.runInContext(JS('mappai-edit-modal.js'), ctx);
  /* Il clic come nel browser: il gestore in linea diventa una funzione con
     `event` e gira nel contesto della pagina. Un codice che non si compila è già
     un difetto: il gestore scritto dall'app deve sempre essere JS valido. */
  const clicInLinea = el => {
    const codice = el.attribs.onclick;
    assert.ok(codice, 'nessun gestore sul clic');
    vm.runInContext('(function (event) {' + codice + '\n})', ctx)({ stopPropagation() {}, preventDefault() {} });
  };
  return { ...d, g, giri, clicInLinea };
}

// i gestori in linea che l'app scrive: una chiamata sola, con un letterale di stringa JS (o un indice)
const LETTERALE = '"(?:[^"\\\\]|\\\\.)*"';
const GESTORI = [
  new RegExp('^window\\.zoomToNode\\(' + LETTERALE + '\\)$'),
  new RegExp('^event\\.stopPropagation\\(\\); window\\.openCustomLink\\(' + LETTERALE + '\\)$'),
  /^window\.remove(Link|Image)FromEdit\(\d+\)$/
];
/* In nessun HTML scritto c'è un elemento o un gestore nato dai dati: le <img>
   sono quelle del template, con i soli attributi del template. */
function soloTemplate(scritti, etichetta) {
  scritti.forEach(html => {
    const $f = cheerio.load(html, null, false);
    assert.equal($f('svg, script, iframe, object, embed, a, b').length, 0, etichetta + ': elemento nato dai dati');
    $f('img').each((_, el) => assert.deepEqual(Object.keys(el.attribs).sort(), ['class', 'src'], etichetta + ': <img> ' + JSON.stringify(el.attribs)));
    $f('*').each((_, el) => {
      for (const [k, v] of Object.entries(el.attribs)) {
        if (!/^on/i.test(k)) continue;
        assert.equal(k, 'onclick', etichetta + ': gestore <' + el.tagName + ' ' + k + '>');
        assert.ok(GESTORI.some(r => r.test(v)), etichetta + ': gestore nato dai dati: ' + v);
      }
    });
  });
}

const EVIL = '<img src=x onerror="window.__pwned=1">';
/* L'id chiude la vecchia stringa con la barra (`\'`), poi esce dall'attributo con `"` */
const ID_OSTILE = 'n1\\\');window.__pwned=2;//" onmouseover="window.__pwned=3';
function nodoOstile() {
  return {
    id: ID_OSTILE, level: 2, group: 1, hasCustomText: true,
    label: EVIL + ' l\'albero', desc: 'La <b>luce</b> ' + EVIL, aiDesc: 'Prima </p><script>window.__pwned=4</script>',
    image: 'x" onerror="window.__pwned=5', images: ['x" onerror="window.__pwned=5', 'data:image/png;base64,AAAA'],
    urls: ["x\\');window.__pwned=6;//", 'https://example.org/a?b=1&c="2"', 'file:///Users/docente/' + EVIL + '.pdf']
  };
}

test('doppio clic sul nodo: link e immagini del vault nella modifica restano testo e dati', () => {
  const n = nodoOstile();
  const m = modulo({ nodes: [n] });
  m.g.openEditModal(n);
  soloTemplate(m.scritti, 'modifica del nodo');
  const $ = m.$;
  assert.deepEqual($('#edit-n-urls-list span').toArray().map(s => $(s).text().trim()), n.urls);
  assert.deepEqual($('#edit-n-images-list img').toArray().map(i => i.attribs.src), n.images);
  assert.equal(m.$('#edit-node-subtitle').text(), TextUtils.cleanLabel(n.label));
  assert.equal(m.g.__pwned, undefined);
});

test('scheda Note: etichetta, desc e link restano testo; il clic porta il valore INTERO a zoomToNode e openCustomLink', () => {
  const n = nodoOstile();
  const m = modulo({ nodes: [n] });
  m.g.updateUserNotesSidebar();
  soloTemplate(m.scritti, 'scheda Note');
  const $ = m.$, box = $('#user-notes-container');
  assert.equal(box.find('h4').text().trim(), n.label);
  assert.deepEqual(box.find('p.line-clamp-2, p.line-clamp-3').toArray().map(p => $(p).text()), [n.aiDesc, n.desc]);
  assert.deepEqual(box.find('img').toArray().map(i => i.attribs.src), [n.image]);
  assert.equal(box.find('#empty-notes-hint').attr('style'), undefined, 'il suggerimento resta dov\'è');
  // i link: il testo mostrato è quello di sempre (nome del file, o i primi 30 caratteri)
  const spans = box.find('span[onclick]').toArray();
  assert.deepEqual(spans.map(s => $(s).find('span.underline').text()),
    [n.urls[0], n.urls[1].substring(0, 30) + '...', EVIL + '.pdf']);
  // al clic: il gestore gira, e ciò che arriva è il dato esatto
  spans.forEach(s => m.clicInLinea(s));
  assert.deepEqual(m.giri.link, n.urls);
  m.clicInLinea(box.find('div[onclick]')[0]);
  assert.deepEqual(m.giri.zoom, [ID_OSTILE]);
  assert.equal(m.g.__pwned, undefined);
  assert.equal(m.giri.alert, 0);
});

test('scheda Note senza il nucleo: il ripiego locale fa lo stesso escape', () => {
  const n = nodoOstile();
  const m = modulo({ nodes: [n], nucleo: false });
  m.g.updateUserNotesSidebar();
  soloTemplate(m.scritti, 'senza nucleo');
  m.clicInLinea(m.$('#user-notes-container div[onclick]')[0]);
  assert.deepEqual(m.giri.zoom, [ID_OSTILE]);
  assert.equal(m.g.__pwned, undefined);
});
