'use strict';
// La fonte accanto alla scheda (16/9/26): la parte pura del pannello.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../public/js/mappai-review-fonte.js');
const G = require('../public/js/mappai-grounding-core.js');

const PAG1 = 'Il 30 agosto 1939 l’Assemblea Federale elesse   Henr i   Guisan Comandante in Capo.';
const PAG2 = 'La Banca Nazionale acquistò oro dalla Germania durante la guerra.';
const FONTI = [{ nome: 'La Svizzera nella seconda guerra mondiale.pdf', pages: [{ n: 1, text: PAG1 }, { n: 2, text: PAG2 }] },
    { nome: 'Appunti del docente.pdf', pages: [{ n: 1, text: 'Una pagina 1 di un altro documento.' }] }];

test('fonte: l’indice delle pagine usa gli stessi docId delle citazioni di buildInput', () => {
    const indice = F.indicePagine(FONTI);
    assert.equal(indice.length, 3);
    const citazione = G.buildInput({ nodes: [{ id: 'n', desc: 'x' }], sourcesDict: { n: [{ title: FONTI[0].nome, source: 'pagina 2', text: PAG2 }] } }, [{ id: 'n' }], FONTI).sourcesArr[0];
    assert.equal(F.paginaPer(citazione, indice).text, PAG2);
    assert.equal(F.paginaPer(citazione, indice).docId, citazione.docId);
});

test('fonte: la pagina di una prova — testo contenuto, poi documento e numero; due pagine 1 non si confondono', () => {
    const indice = F.indicePagine(FONTI);
    // prova ripulita dal modello: combacia lo stesso con la pagina che contiene la frase
    assert.equal(F.paginaPer({ text: "l'Assemblea Federale elesse Henri Guisan Comandante in Capo", source: FONTI[0].nome, page: 1 }, indice).text, PAG1);
    // chunk dell'àncora: «pagina 2» nel campo source
    assert.equal(F.paginaPer({ source: 'pagina 2', text: PAG2 }, indice).page, 2);
    // stesso numero di pagina, documento diverso
    assert.equal(F.paginaPer({ title: 'Appunti del docente.pdf', page: 1 }, indice).title, 'Appunti del docente.pdf');
    // una prova che viene dal materiale stesso, senza pagina né documento: nessuna pagina
    assert.equal(F.paginaPer({ text: 'Testo della domanda che non sta nella fonte.' }, indice), null);
    assert.equal(F.paginaPer(null, indice), null);
});

test('fonte: il PDF in Allegati si trova per nome identico o equivalente, mai per un PDF qualunque', () => {
    const nomi = ['foto-dossier.jpg', 'la svizzera nella seconda guerra MONDIALE.pdf', 'Altro.pdf'];
    assert.equal(F.trovaPdf('La Svizzera nella seconda guerra mondiale.pdf', ['La Svizzera nella seconda guerra mondiale.pdf', ...nomi]), 'La Svizzera nella seconda guerra mondiale.pdf');
    assert.equal(F.trovaPdf('La Svizzera nella seconda guerra mondiale.pdf', nomi), 'la svizzera nella seconda guerra MONDIALE.pdf');
    assert.equal(F.trovaPdf('Dossier sconosciuto.pdf', nomi), null);
    assert.equal(F.trovaPdf('', nomi), null);
});

test('fonte: la citazione si evidenzia nel punto vero della pagina, anche copiata «in bella»', () => {
    const pezzi = F.segmenti(PAG1, "l'Assemblea Federale elesse Henri Guisan");
    assert.deepEqual(pezzi.map(p => p.segnato), [false, true, false]);
    assert.equal(pezzi[1].t, 'l’Assemblea Federale elesse   Henr i   Guisan');
    assert.equal(pezzi.map(p => p.t).join(''), PAG1, 'nessun carattere della pagina si perde');
    assert.deepEqual(F.segmenti(PAG1, 'una frase che non c’è affatto'), [{ t: PAG1, segnato: false }]);
});

test('fonte: la citazione SUL PDF — pezzi spezzati, prova ripulita, taglio a metà pezzo, niente se non combacia', () => {
    // Tre pezzi come li dà pdf.js: due righe, e «Henr i» spezzato. Testo orizzontale, corpo 10, 5 pt per carattere.
    const pezzo = (str, x, y) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });
    const items = [pezzo('Il 30 agosto 1939 l’Assemblea Federale elesse Henr', 50, 700), pezzo('i Guisan Comandante in Capo', 50, 686), pezzo('dell’Esercito Svizzero.', 50, 672)];
    const vt = [1, 0, 0, -1, 0, 792];   // viewport pdf.js a scala 1: y capovolta, origine in alto
    const r = F.rettangoli(items, "l'Assemblea Federale elesse Henri Guisan", vt);
    assert.equal(r.length, 2);
    // prima riga: comincia a «l’Assemblea» (carattere 18 di 50), finisce in fondo al pezzo
    assert.equal(r[0].x, 50 + 18 * 5); assert.equal(r[0].w, (50 - 18) * 5);
    assert.ok(Math.abs(r[0].y - (792 - 700 - 9)) < 1e-9);
    // seconda riga: solo «i Guisan» (8 caratteri)
    assert.equal(r[1].x, 50); assert.equal(r[1].w, 8 * 5);
    assert.ok(r[1].y > r[0].y, 'la seconda riga sta sotto la prima');
    // un pezzo per parola sulla stessa riga → una striscia sola, dal primo carattere all'ultimo
    const parole = [pezzo('Queste', 50, 600), pezzo('accuse', 85, 600), pezzo('sono', 120, 600), pezzo('esaminate.', 145, 600)];
    assert.deepEqual(F.rettangoli(parole, 'Queste accuse sono esaminate', vt).map(x => [x.x, x.w]), [[50, 145 + 9 * 5 - 50]]);
    assert.deepEqual(F.rettangoli(items, 'Il Consiglio federale nominò il generale', vt), []);
    assert.deepEqual(F.rettangoli(items, '', vt), []);
    assert.deepEqual(F.rettangoli([], 'Henri Guisan Comandante', vt), []);
});
