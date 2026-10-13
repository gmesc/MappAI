'use strict';
/*
 * `scalaTestoInHtml` (mappai-doc-bar.js): il documento che si SCARICA per
 * consegnarlo all'allievo.
 *
 * L'anteprima nell'app riceve il foglio della scala del testo dentro l'iframe
 * (`scalaTesto`); il file scaricato dal bottone «HTML» è una stringa, e senza
 * questo foglio un documento vecchio arriverebbe all'allievo con i corpi di
 * prima. Qui si prova dove si inserisce, che non si somma a se stesso e che
 * non tocca ciò che non è una sintesi.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DB = require('../public/js/mappai-doc-bar.js');

const SINTESI = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sintesi</title>'
    + '<style>.bs-body p{font-size:11px}</style></head>'
    + '<body><div class="bs-body"><p>La fotosintesi avviene nei cloroplasti.</p></div></body></html>';
const APERTURA = '<style id="mm-doc-scala">';
const quante = (s, pezzo) => s.split(pezzo).length - 1;

// Toglie il foglio inserito: ciò che resta deve essere il documento di prima.
function senzaFoglio(s) {
    const i = s.indexOf(APERTURA);
    return s.slice(0, i) + s.slice(s.indexOf('</style>', i) + '</style>'.length);
}

test('il foglio entra in coda al <head>, subito prima di </head>', () => {
    const out = DB.scalaTestoInHtml(SINTESI);
    assert.equal(quante(out, APERTURA), 1);
    const i = out.indexOf(APERTURA), fine = out.indexOf('</style>', i) + '</style>'.length;
    assert.ok(i > out.indexOf('<style>.bs-body'), 'dopo le regole originali: a parità di specificità vince per ordine');
    assert.equal(out.slice(fine, fine + '</head>'.length), '</head>');
    assert.match(out, /\.bs-body p,\.bs-body li\{font-size:calc\(11px \* var\(--ap-txt-k,1\.6\)\)\}/,
        'porta i corpi scalati, non i pixel finiti');
    assert.equal(senzaFoglio(out), SINTESI, 'il resto del documento non si tocca');
});

test('idempotente: passarlo due volte non somma un secondo foglio', () => {
    const una = DB.scalaTestoInHtml(SINTESI);
    assert.equal(DB.scalaTestoInHtml(una), una);
    assert.equal(quante(DB.scalaTestoInHtml(una), APERTURA), 1);
});

test('senza .bs-body non è una sintesi: il documento esce identico', () => {
    const quiz = '<html><head><title>Quiz</title></head><body><ol class="quiz"><li>Domanda</li></ol></body></html>';
    assert.equal(DB.scalaTestoInHtml(quiz), quiz);
    assert.equal(DB.scalaTestoInHtml(''), '');
    assert.equal(DB.scalaTestoInHtml(null), '', 'niente documento, niente foglio (e nessun errore)');
});

test('senza </head> (documento malformato) il foglio va in fondo: meglio in fondo che non applicato', () => {
    const monco = '<div class="bs-body"><p>Testo senza testa.</p></div>';
    const out = DB.scalaTestoInHtml(monco);
    assert.ok(out.startsWith(monco), 'il documento resta com\'era, davanti');
    assert.ok(out.slice(monco.length).startsWith(APERTURA));
    assert.ok(out.endsWith('</style>'));
    assert.equal(DB.scalaTestoInHtml(out), out, 'idempotente anche qui');
});
