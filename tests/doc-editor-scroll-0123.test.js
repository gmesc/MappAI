'use strict';
/*
 * doc-editor-scroll-0123.test.js — il lotto 2b del packet 0123. Giacomo al gate del lotto 2
 * (22/10): «quando aggiungo una domanda nuova la vista dell'editor torna in cima forzatamente»,
 * e lo stesso su «sposta». Misurato via CDP nella console ELABORA: chi scorre è
 * `.de-sheet-wrap`, che sta DENTRO l'HTML che `render()` riscrive; il riquadro nuovo nasce a
 * scorrimento zero (foglio a 1500 px → «Sposta giù» → 0).
 *
 * Le funzioni vere (`render`, `addQuestion`, `moveQ`, `delQuestion` e l'aiuto `_inVista`)
 * si estraggono dal sorgente e girano in una vm con un riquadro finto, che a ogni
 * `innerHTML = …` rinasce a zero come quello vero. Assert su numeri e booleani.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-doc-editor.js'), 'utf8');
function corpo(nome, asincrona) {
    const testa = (asincrona ? 'async ' : '') + 'function ' + nome + '(';
    const i = SRC.indexOf(testa);
    if (i < 0) return '';
    return SRC.slice(i, SRC.indexOf('\n    }\n', i) + 6);
}

function banco(nDomande) {
    const log = { inVista: [], focus: [] };
    function campo(i) {
        const item = { scrollIntoView: function (o) { log.inVista.push({ i: i, block: o && o.block }); } };
        return {
            closest: function (sel) { return sel === '.de-item' ? item : null; },
            focus: function (o) { log.focus.push({ i: i, preventScroll: !!(o && o.preventScroll) }); }
        };
    }
    const host = {
        _wrap: { scrollTop: 0 },
        set innerHTML(v) { this._wrap = { scrollTop: 0 }; },   // il riquadro rinasce in cima
        get innerHTML() { return ''; },
        querySelector: function (sel) {
            if (sel === '.de-sheet-wrap') return this._wrap;
            const m = /^\[data-i="(\d+)"\]\[data-f="question"\]$/.exec(sel);
            return (m && +m[1] < ctx.statoDoc().items.length) ? campo(+m[1]) : null;
        }
    };
    const DE = require('../public/js/mappai-docedit-core.js');
    const items = [];
    for (let k = 0; k < nDomande; k++) items.push({ id: 's-' + k, question: 'Domanda ' + k, answer: '' });
    const ctx = {
        window: { MappAIDocEdit: DE },
        host: host,
        setTimeout: setTimeout,
        docIniziale: { id: 's', kind: 'openq', items: items }
    };
    const funzioni = ['render', '_inVista', 'addQuestion', 'moveQ'].map(n => corpo(n)).join('\n') + corpo('delQuestion', true);
    const script = [
        "let _view = 'doc', _kind = 'openq', _doc = docIniziale, _syn = null, _sheet = null, _cc = null, _dirty = false;",
        'function DE() { return window.MappAIDocEdit; }',
        'function t(k, f) { return f; }',
        'function _host() { return host; }',
        'function _inConsole() { return true; }',
        "function _docHtml() { return '<div class=\"de-sheet-wrap\"></div>'; }",
        "function _listHtml() { return ''; }",
        'function _injectStyles() {} function _bind() {} function _mountTts() {} function _paintDirty() {} function _paintZoom() {}',
        'function _snapshot() {}',
        'async function _chiedi() { return true; }',
        funzioni,
        'this.render = render; this.addQuestion = addQuestion; this.moveQ = moveQ; this.delQuestion = delQuestion;',
        'this.statoDoc = function () { return _doc; }; this.cambiaDoc = function (d) { _doc = d; };'
    ].join('\n');
    vm.createContext(ctx);
    vm.runInContext(script, ctx);
    return { ctx, host, log };
}
const attesa = ms => new Promise(r => setTimeout(r, ms));

test('2b: dopo render() il foglio resta dov\'era', () => {
    const { ctx, host } = banco(6);
    ctx.render();                       // il documento aperto
    host._wrap.scrollTop = 1500;
    ctx.render();
    assert.equal(host._wrap.scrollTop, 1500);
});

test('2b: aprire un altro documento riparte dall\'alto', () => {
    const { ctx, host } = banco(6);
    ctx.render();
    host._wrap.scrollTop = 1500;
    ctx.cambiaDoc({ id: 'altro', kind: 'openq', items: [{ id: 'x', question: 'q' }] });
    ctx.render();
    assert.equal(host._wrap.scrollTop, 0);
});

test('2b: «sposta giù» tiene la vista e porta in vista la domanda al suo posto nuovo', () => {
    const { ctx, host, log } = banco(6);
    ctx.render();
    host._wrap.scrollTop = 1500;
    ctx.moveQ(2, 1);
    assert.equal(host._wrap.scrollTop, 1500);
    assert.equal(ctx.statoDoc().items[3].id, 's-2');
    assert.deepEqual(log.inVista, [{ i: 3, block: 'nearest' }]);
});

test('2b: «sposta su» sulla prima domanda non la perde di vista', () => {
    const { ctx, log } = banco(6);
    ctx.render();
    ctx.moveQ(0, -1);
    assert.deepEqual(log.inVista, [{ i: 0, block: 'nearest' }]);
});

test('2b: «aggiungi» tiene la vista, porta in vista la domanda nuova e la mette a fuoco senza salto', async () => {
    const { ctx, host, log } = banco(6);
    ctx.render();
    host._wrap.scrollTop = 900;
    ctx.addQuestion(2);
    assert.equal(host._wrap.scrollTop, 900);
    assert.equal(ctx.statoDoc().items.length, 7);
    await attesa(60);
    assert.deepEqual(log.inVista, [{ i: 3, block: 'nearest' }]);
    assert.deepEqual(log.focus, [{ i: 3, preventScroll: true }]);
});

test('2b: «+ domanda» in fondo porta in vista l\'ultima', async () => {
    const { ctx, log } = banco(6);
    ctx.render();
    ctx.addQuestion();
    await attesa(60);
    assert.deepEqual(log.inVista, [{ i: 6, block: 'nearest' }]);
    assert.deepEqual(log.focus, [{ i: 6, preventScroll: true }]);
});

test('2b: «elimina» tiene la vista e porta in vista la domanda che prende il posto', async () => {
    const { ctx, host, log } = banco(6);
    ctx.render();
    host._wrap.scrollTop = 1200;
    await ctx.delQuestion(5);
    assert.equal(host._wrap.scrollTop, 1200);
    assert.equal(ctx.statoDoc().items.length, 5);
    assert.deepEqual(log.inVista, [{ i: 4, block: 'nearest' }]);
});

test('2b: il marcatore di cache del lotto 2b, col marcatore dello 0122 dentro', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    // il marcatore del lotto 2b resta dentro l'etichetta; i lotti dopo ne aggiungono in coda (0122 lotto 4b2: `-0122-4b2`)
    assert.equal(/js\/mappai-doc-editor\.js\?v=0102-0122-20261022-3-0123-2(-[\w-]+)?"/.test(html), true);
});
