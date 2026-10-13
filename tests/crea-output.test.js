'use strict';
/* «Output» di CREA (0087, lotto 10-crea, 12/10/2026): la logica pura della scelta.
   Giacomo: «le tre opzioni governano quali box mostrare nel BENTO». */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-crea-output.js');

test('le tre voci di Giacomo, nell\'ordine, e la prima è il default', () => {
    assert.deepEqual(C.VOCI.map(v => v.id), ['differenziazione', 'iconografica', 'metacomprensione']);
    assert.deepEqual(C.VOCI.map(v => v.et), ['Differenziazione', 'Analisi iconografica', 'Metacomprensione']);
    assert.equal(C.DEFAULT, 'differenziazione');
    assert.equal(C.CHIAVE, 'mappai_crea_output');
});

test('normalizza: una scelta sconosciuta, vuota o nulla torna al default; maiuscole e spazi non contano', () => {
    assert.equal(C.normalizza('Iconografica '), 'iconografica');
    assert.equal(C.normalizza('METACOMPRENSIONE'), 'metacomprensione');
    for (const v of ['', null, undefined, 'diversificazione', 42]) assert.equal(C.normalizza(v), 'differenziazione', String(v));
});

test('Differenziazione: il bento di sempre, nessun effetto', () => {
    const e = C.effetti('differenziazione', { fotoMontata: false });
    assert.deepEqual(e, { scelta: 'differenziazione', formati: false, attesa: false, lettura: false, accendeLettura: false });
});

test('Analisi iconografica: i formati e i posti d\'attesa; i posti spariscono quando il guscio ha montato la foto', () => {
    assert.deepEqual(C.effetti('iconografica', {}), { scelta: 'iconografica', formati: true, attesa: true, lettura: false, accendeLettura: false });
    const dopo = C.effetti('iconografica', { fotoMontata: true });
    assert.equal(dopo.formati, true, 'i formati restano');
    assert.equal(dopo.attesa, false, 'i posti d\'attesa no: ci sono i pezzi veri');
});

test('Metacomprensione: la scelta È l\'interruttore — la Lettura si accende e si mostra, senza condizioni (12/10 sera)', () => {
    assert.deepEqual(C.effetti('metacomprensione', {}), { scelta: 'metacomprensione', formati: false, attesa: false, lettura: true, accendeLettura: true });
});

/* ── il runtime, da localStorage VUOTO (la beta.6: la chiave della lettura non c'è) ── */
const fs = require('node:fs'), vm = require('node:vm');
function app() {
    const store = {}; const calls = { mount: [] };
    const el = (extra) => Object.assign({ hidden: false, dataset: {}, attrs: {}, listeners: {}, options: [], value: '',
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
        appendChild(o) { this.options.push(o); return o; }, addEventListener(n, f) { (this.listeners[n] ||= []).push(f); },
        style: { setProperty(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = v; }, attrs: {} } }, extra || {});
    const select = el(), host = el({ hidden: true }), html = el();
    const document = { readyState: 'complete', documentElement: html,
        getElementById: id => ({ 'mn-output-campo': select, 'lettura-crea-host': host })[id] || null,
        createElement: () => ({}), addEventListener() {}, dispatchEvent() {} };
    const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    /* la Lettura vera legge la chiave come enabled() (mappai-percorso-lettura.js:406) */
    const MappAIPercorsoLettura = { mountCreatePlanner(h) {
        if (localStorage.getItem('mappai_percorso_lettura') !== '1' || !h || h.dataset.letturaMounted) return null;
        h.dataset.letturaMounted = '1'; h.hidden = false; calls.mount.push(1); return {};
    } };
    const ctx = { window: null, document, localStorage, console: { log() {}, warn() {} }, CustomEvent: function (n, d) { this.n = n; this.d = d; },
        MappAIPercorsoLettura, MappAIVisioneCore: { ESTENSIONI: ['.jpg', '.png'] }, self: null };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-crea-output.js'), 'utf8'), ctx);
    return { ctx, store, calls, select, host, html };
}

test('runtime da vuoto: la scelta ricordata è Differenziazione, la Lettura resta spenta e nascosta', () => {
    const a = app();
    assert.equal(a.select.value, 'differenziazione');
    assert.equal(a.store.mappai_percorso_lettura, undefined, 'nessuna chiave scritta a vuoto');
    assert.equal(a.html.attrs['data-crea-output'], 'differenziazione');
    assert.deepEqual(a.calls.mount, []);
});

test('runtime: «Metacomprensione» da vuoto scrive la chiave della lettura, monta il configuratore e lo mostra', () => {
    const a = app();
    const e = a.ctx.MappAICreaOutput.imposta('metacomprensione');
    assert.equal(a.store.mappai_percorso_lettura, '1', 'la scelta è l\'interruttore');
    assert.equal(e.lettura, true);
    assert.deepEqual(a.calls.mount, [1], 'mountCreatePlanner ha accettato: la chiave c\'era PRIMA del montaggio');
    assert.equal(a.host.hidden, false);
    assert.equal(a.html.attrs['data-crea-output'], 'metacomprensione');
    assert.equal(a.store.mappai_crea_output, 'metacomprensione');
    /* tornando a Differenziazione l'host si nasconde, la chiave resta: i materiali fatti restano modificabili */
    a.ctx.MappAICreaOutput.imposta('differenziazione');
    assert.equal(a.host.hidden, true);
    assert.equal(a.store.mappai_percorso_lettura, '1');
    /* di nuovo Metacomprensione: già montato, si rimostra senza rimontare */
    a.ctx.MappAICreaOutput.imposta('metacomprensione');
    assert.equal(a.host.hidden, false); assert.deepEqual(a.calls.mount, [1]);
});

test('runtime: con «Analisi iconografica» la variabile dei formati legge le estensioni della visione', () => {
    const a = app();
    a.ctx.MappAICreaOutput.imposta('iconografica');
    assert.equal(a.html.style.attrs['--crea-formati'], JSON.stringify('Formati: .jpg · .png'));
    assert.equal(a.html.attrs['data-crea-output'], 'iconografica');
});

test('testoFormati: le estensioni della visione se ci sono, altrimenti quelle note; l\'etichetta si traduce', () => {
    assert.equal(C.testoFormati(['.jpg', '.png']), 'Formati: .jpg · .png');
    assert.equal(C.testoFormati(null), 'Formati: .jpg · .jpeg · .png · .heic · .heif');
    assert.equal(C.testoFormati([], 'Formats'), 'Formats: .jpg · .jpeg · .png · .heic · .heif');
});
