'use strict';
/* 0087 lotto 10-lettura (Giacomo, 12/10/2026): «puoi mettere le tre frasi su una riga sola e mettere
   in BOLD solo i numeri, ed eventualmente un alert se le soglie non sono bilanciate». La riga sola
   la fa il foglio; qui si prova l'editor del planner (mappai-percorso-lettura-editor.js) sul DOM
   finto di tests/percorso-lettura-workflow.test.js: i numeri del piede stanno in <strong>, il resto
   è testo nudo, e lo stato porta data-stato: «vuoto» a 0 attività, «limite» quando una soglia
   salta (più di 20 per riga o 40 in totale), '' quando il piano è valido. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const E = require('../public/js/mappai-percorso-lettura-editor');

function monta() {
  const $ = cheerio.load('<div id="host"></div>'), cache = new WeakMap();
  function wrap(node) {
    if (!node) return null;
    if (cache.has(node)) return cache.get(node);
    const handlers = {}, el = { node, handlers,
      get ownerDocument() { return doc; },
      get dataset() { return Object.fromEntries(Object.entries(node.attribs || {}).filter(([k]) => k.startsWith('data-'))
        .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])); },
      set className(v) { $(node).attr('class', v); },
      classList: { contains: c => $(node).hasClass(c) },
      set innerHTML(v) { $(node).html(v); },
      get innerHTML() { return $(node).html(); },
      set textContent(v) { $(node).text(v); },
      get textContent() { return $(node).text(); },
      get open() { return $(node).attr('open') !== undefined; },
      set open(v) { if (v) $(node).attr('open', ''); else $(node).removeAttr('open'); },
      querySelector: selector => wrap($(node).find(selector)[0]),
      querySelectorAll: selector => $(node).find(selector).toArray().map(wrap),
      closest: selector => wrap($(node).closest(selector)[0]),
      contains: other => $(node).find('*').toArray().includes(other.node),
      hasAttribute: name => $(node).attr(name) !== undefined,
      getAttribute: name => $(node).attr(name),
      setAttribute: (name, value) => $(node).attr(name, value),
      appendChild: child => $(node).append(child.node),
      addEventListener: (name, callback) => (handlers[name] ||= []).push(callback),
      focus() {}
    };
    cache.set(node, el); return el;
  }
  const doc = { createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]) };
  // senza piano l'editor parte da emptyPlan(contesto): scopo e genere vengono dalle opzioni, le quantità sono 0
  const mounted = E.mountPlanner(wrap($('#host')[0]), { labels: E.plannerLabels(), idPrefix: 'test', layout: 'bento',
    purpose: 'letterario', genre: 'racconto', onPrepare() {} });
  const root = mounted.element;
  // come fa il docente: scrive una quantità nel campo e l'editor la legge dall'evento input
  const scrivi = (riga, n) => { const inp = root.querySelector('[data-row="' + riga + '"] input'); inp.valueAsNumber = n;
    root.handlers.input.forEach(fn => fn({ target: inp })); };
  return { mounted, root, scrivi };
}

const piede = root => ({
  totale: root.querySelector('.lettura-plan-total').innerHTML,
  limite: root.querySelector('.lettura-plan-limit').innerHTML,
  stato: root.querySelector('.lettura-plan-status').getAttribute('data-stato'),
  testo: root.querySelector('.lettura-plan-status').textContent
});

test('piede: a 0 attività i numeri sono in <strong>, il resto testo nudo, e lo stato dice «vuoto»', () => {
  const { root } = monta();
  const p = piede(root);
  assert.equal(p.totale, 'Attività richieste: <strong>0</strong>');
  assert.equal(p.limite, 'Fino a <strong>20</strong> attività per riga e <strong>40</strong> in totale.');
  assert.equal(p.stato, 'vuoto');
  assert.match(p.testo, /Scegli almeno/);
});

test('piede: con un piano valido lo stato è vuoto e il totale conta; oltre la soglia diventa «limite»', () => {
  const { root, scrivi } = monta();
  scrivi(0, 3);
  let p = piede(root);
  assert.equal(p.totale, 'Attività richieste: <strong>3</strong>');
  assert.equal(p.stato, '');
  assert.equal(p.testo, '');
  // 21 su una riga: la soglia per riga salta (il campo dice max 20, ma il docente può scriverci 21)
  scrivi(0, 21);
  p = piede(root);
  assert.equal(p.stato, 'limite');
  assert.match(p.testo, /Controlla quantità/);
  assert.equal(p.totale, 'Attività richieste: <strong>21</strong>');
  // 20 + 20 + 1 = 41 in totale: la soglia totale salta anche con ogni riga entro i 20
  scrivi(0, 20); scrivi(1, 20);
  assert.equal(piede(root).stato, '');
  scrivi(2, 1);
  assert.equal(piede(root).stato, 'limite');
  assert.equal(piede(root).totale, 'Attività richieste: <strong>41</strong>');
  // tornando sotto la soglia l'avviso si spegne
  scrivi(2, 0);
  assert.equal(piede(root).stato, '');
});
