'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// La scheda allievo non chiede più il NOME (15/9/2026): l'etichetta la conia
// l'app. Qui si prova SOLO quella logica, che è pura; il resto del modulo tocca
// il DOM e vive in Electron.
global.window = {};
global.document = {};
require('../public/js/mappai-user-profile.js');

const nuova = window.nuovaEtichettaProfilo;

test('etichetta: la prima scheda è «Studente 1»', () => {
    assert.equal(nuova([]), 'Studente 1');
    assert.equal(nuova(undefined), 'Studente 1');
});

test('etichetta: salta quelle già in uso, anche non contigue', () => {
    assert.equal(nuova(['Studente 1']), 'Studente 2');
    assert.equal(nuova(['Studente 1', 'Studente 3']), 'Studente 2');
    assert.equal(nuova(['Studente 1', 'Studente 2', 'Studente 3']), 'Studente 4');
});

test('etichetta: le schede vecchie col nome vero non bloccano il conteggio', () => {
    // Chi ha già salvato «Marco» tiene la sua etichetta: non si rinomina il
    // passato, si smette di chiederlo.
    assert.equal(nuova(['Marco', 'Sara']), 'Studente 1');
    assert.equal(nuova(['Marco', 'Studente 1']), 'Studente 2');
});

test('etichetta: confronto insensibile a maiuscole e spazi (come il dedup del salvataggio)', () => {
    assert.equal(nuova(['studente 1']), 'Studente 2');
    assert.equal(nuova(['  STUDENTE 1  ']), 'Studente 2');
});

test('etichetta: voci vuote o nulle non contano', () => {
    assert.equal(nuova(['', null, undefined, '   ']), 'Studente 1');
});
