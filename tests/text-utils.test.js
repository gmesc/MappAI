'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanLabel, getLabelLines, extractDateFromLabel } = require('../public/js/mappai-text-utils.js');

test('cleanLabel: vuoto/null → stringa vuota', () => {
    assert.equal(cleanLabel(''), '');
    assert.equal(cleanLabel(null), '');
    assert.equal(cleanLabel(undefined), '');
});

test('cleanLabel: rimuove grassetto markdown che avvolge la label', () => {
    assert.equal(cleanLabel('**Titolo**'), 'Titolo');
    assert.equal(cleanLabel('__Titolo__'), 'Titolo');
    assert.equal(cleanLabel('*Titolo*'), 'Titolo');
});

test('cleanLabel: rimuove marcatori di lista/heading iniziali', () => {
    assert.equal(cleanLabel('- voce'), 'voce');
    assert.equal(cleanLabel('# Heading'), 'Heading');
    assert.equal(cleanLabel('> citazione'), 'citazione');
});

test('cleanLabel: normalizza apostrofi/virgolette tipografiche in ASCII', () => {
    assert.equal(cleanLabel('l’anno'), "l'anno");
    assert.equal(cleanLabel('“parola”'), 'parola'); // virgolette che avvolgono → rimosse
});

test('cleanLabel: rimuove liste tra parentesi con virgola (artefatto lenses)', () => {
    assert.equal(cleanLabel('Figure Chiave (Stalin, Churchill, Tito)'), 'Figure Chiave');
    // parentesi SENZA virgola: non è una lista → resta
    assert.equal(cleanLabel('Energia (E)'), 'Energia (E)');
});

test('cleanLabel: rimuove ellissi di troncamento finale', () => {
    assert.equal(cleanLabel('Concetto incompleto…'), 'Concetto incompleto');
    assert.equal(cleanLabel('Concetto...'), 'Concetto');
});

test('getLabelLines: split su newline, vuoto → []', () => {
    assert.deepEqual(getLabelLines('a\nb'), ['a', 'b']);
    assert.deepEqual(getLabelLines(''), []);
    assert.deepEqual(getLabelLines('singola'), ['singola']);
});

test('extractDateFromLabel: forma lunga 4 cifre', () => {
    assert.deepEqual(extractDateFromLabel('1989 Caduta Muro'), { date: '1989', name: 'Caduta Muro' });
});

test('extractDateFromLabel: range di anni', () => {
    assert.deepEqual(extractDateFromLabel('1980-1989 Periodo'), { date: '1980-1989', name: 'Periodo' });
});

test('extractDateFromLabel: forma breve italiana con apostrofo', () => {
    assert.deepEqual(extractDateFromLabel("'89 Transizione"), { date: "'89", name: 'Transizione' });
});

test('extractDateFromLabel: nessuna data → null', () => {
    assert.equal(extractDateFromLabel('Concetto senza data'), null);
    assert.equal(extractDateFromLabel(''), null);
});
