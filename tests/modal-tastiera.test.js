'use strict';
// La riga di tabella che si sceglie (role="button" su un <tr>) si attiva da
// tastiera con Invio e Spazio, come un bottone. Rilievo del banco 0017: col Tab
// la riga prendeva il fuoco, poi Invio non la apriva (o premeva l'azione
// primaria della finestra al suo posto).
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/mappai-modal-core.js');

function nodo(tag, attrs) {
    return {
        tagName: tag,
        getAttribute: k => (k in attrs ? attrs[k] : null),
        hasAttribute: k => k in attrs
    };
}
const riga = () => nodo('TR', { role: 'button', tabindex: '0', 'data-azione': 'proj_1' });

test('Invio e Spazio scelgono la riga col fuoco', () => {
    assert.equal(Core.rigaDaTastiera(riga(), 'Enter'), true);
    assert.equal(Core.rigaDaTastiera(riga(), ' '), true);
    assert.equal(Core.rigaDaTastiera(riga(), 'Spacebar'), true);   // nome vecchio del tasto
});

test('gli altri tasti restano a chi li gestiva prima', () => {
    for (const k of ['Tab', 'Escape', 'ArrowDown', 'a', 'Shift']) {
        assert.equal(Core.rigaDaTastiera(riga(), k), false, k);
    }
});

test('un <button> vero ha già la sua attivazione: non si tocca', () => {
    const b = nodo('BUTTON', { role: 'button', 'data-azione': 'salva' });
    assert.equal(Core.rigaDaTastiera(b, 'Enter'), false);
    assert.equal(Core.rigaDaTastiera(nodo('button', { 'data-azione': 'x' }), ' '), false);
});

test('senza ruolo o senza azione non è una riga da scegliere', () => {
    assert.equal(Core.rigaDaTastiera(nodo('TR', { 'data-azione': 'x' }), 'Enter'), false);
    assert.equal(Core.rigaDaTastiera(nodo('TR', { role: 'button' }), 'Enter'), false);
    assert.equal(Core.rigaDaTastiera(nodo('TEXTAREA', {}), 'Enter'), false);
});

test('bersagli strani non fanno cadere il gestore dei tasti', () => {
    assert.equal(Core.rigaDaTastiera(null, 'Enter'), false);
    assert.equal(Core.rigaDaTastiera(undefined, ' '), false);
    assert.equal(Core.rigaDaTastiera({}, 'Enter'), false);           // document, window
    assert.equal(Core.rigaDaTastiera({ getAttribute: () => null }, 'Enter'), false);  // nodo di testo o simili
});
