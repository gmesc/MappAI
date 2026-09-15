/* Prova del pezzo elastico dei token: «questo valore nuovo ce l'ho già?».
   Copre i tre verdetti e i due casi che li rendono utili — gli alias `var()` e
   il ruolo, cioè le due strade per cui la proposta può essere giusta sul numero
   e sbagliata sulla cosa. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const V = require('../tools/stile/vicino.js');

const REGISTRO = [
    { nome: '--mm-neutro', valore: '#f1f4f8', file: 'tokens', riga: 1 },
    { nome: '--man-card', valore: 'var(--mm-neutro, #f1f4f8)', file: 'manifesto', riga: 2 },
    { nome: '--mm-testo', valore: '#404040', file: 'tokens', riga: 3 },
    { nome: '--mm-accent', valore: '#4f46e5', file: 'tokens', riga: 4 },
    { nome: '--mm-r-card', valore: '18px', file: 'tokens', riga: 5 },
    { nome: '--mm-gap', valore: '12px', file: 'tokens', riga: 6 },
    { nome: '--mm-btn-fs', valore: '12px', file: 'tokens', riga: 7 },
];

test('due grigi a un passo sono lo STESSO grigio: riusa', () => {
    /* il caso vero del 13/9: slate-100 #f1f5f9 contro --man-card #f1f4f8 */
    const d = V.distanzaColore('#f1f5f9', '#f1f4f8');
    assert.ok(d < V.SOGLIE.colore.stesso, 'ΔE atteso sotto 2, misurato ' + d.toFixed(2));
    const r = V.proponi('#f1f5f9', REGISTRO);
    assert.equal(r.verdetto.esito, 'riusa');
    assert.equal(r.candidati[0].nome, '--mm-neutro');
});

test('un colore davvero diverso passa: token nuovo ammesso', () => {
    const r = V.proponi('#dc2626', REGISTRO);
    assert.equal(r.verdetto.esito, 'nuovo');
});

test('un colore quasi uguale chiede di motivare, non lo vieta', () => {
    const r = V.proponi('#3b4a5f', [{ nome: '--mm-testo-2', valore: '#475569', file: 'x', riga: 1 }]);
    assert.equal(r.verdetto.esito, 'motiva');
});

test('gli alias var() vengono sciolti, o due token uguali sembrano diversi', () => {
    const mappa = Object.fromEntries(REGISTRO.map(t => [t.nome, t.valore]));
    assert.equal(V.risolvi('var(--man-card)', mappa), '#f1f4f8');
    assert.equal(V.risolvi('var(--non-esiste, 7px)', mappa), '7px');
});

test('il RUOLO filtra: un raggio non si confronta con un gap che vale lo stesso', () => {
    const reg = REGISTRO.map(t => ({ ...t, valore: V.risolvi(t.valore, Object.fromEntries(REGISTRO.map(x => [x.nome, x.valore]))) }));
    const senza = V.proponi('12px', reg);
    const con = V.proponi('12px', reg, 'raggi');
    assert.ok(senza.candidati.some(c => c.nome === '--mm-gap'), 'senza ruolo il gap è fra i candidati');
    assert.ok(con.candidati.every(c => V.famigliaDi(c.nome) === 'raggi'), 'col ruolo restano solo i raggi');
    assert.equal(con.candidati[0].nome, '--mm-r-card');
});

test('una lunghezza a 1px di distanza non è una decisione nuova', () => {
    const r = V.proponi('13px', REGISTRO, 'fs');
    assert.equal(r.verdetto.esito, 'riusa');
    assert.equal(r.candidati[0].nome, '--mm-btn-fs');
});

test('quello che non è né colore né lunghezza non inventa verdetti', () => {
    assert.equal(V.proponi('1fr', REGISTRO).tipo, null);
    assert.equal(V.distanzaColore('#fff', 'non-un-colore'), null);
});
