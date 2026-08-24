/* tests/demo-video-core.test.js — l'aritmetica del demo di 4 minuti e la lettura delle
 * domande aperte. Le due cose che, sbagliate, si scoprono solo guardando il video finito. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../tools/demo-video/montaggio-core.js');
const D = require('../tools/demo-video/domande-core.js');
const { SCENE, SFOGLIO, ANGOLI, PAROLE_AL_SECONDO } = require('../tools/demo-video/copione.js');

test('il copione dura ESATTAMENTE quattro minuti', () => {
    assert.strictEqual(M.durata(SCENE), M.TETTO);
});

test('il copione vero non ha difetti', () => {
    assert.deepStrictEqual(M.valida(SCENE, SFOGLIO), []);
});

test('valida trova la somma sbagliata, la scena senza gesto e gli id doppi', () => {
    const rotto = [
        { id: 'a', tipo: 'app', secondi: 10, narrazione: 'x' },
        { id: 'a', tipo: 'carta', secondi: 10, narrazione: 'y' },
    ];
    const d = M.valida(rotto);
    assert.ok(d.some((x) => /non 240/.test(x)), 'la durata sbagliata');
    assert.ok(d.some((x) => /senza gesto/.test(x)), 'la scena d\'app senza gesto');
    assert.ok(d.some((x) => /stesso id/.test(x)), 'gli id doppi');
});

test('lo sfoglio dura quanto la sua scena', () => {
    const scena = SCENE.find((s) => s.tipo === 'sfoglio');
    assert.strictEqual(SFOGLIO.reduce((t, f) => t + f.secondi, 0), scena.secondi);
    const d = M.valida(SCENE, SFOGLIO.map((f, i) => (i ? f : Object.assign({}, f, { secondi: f.secondi + 3 }))));
    assert.ok(d.some((x) => /lo sfoglio dura/.test(x)));
});

test('nessuna narrazione sfora il suo budget di parole', () => {
    const sforate = SCENE.filter((s) => M.contaParole(s.narrazione) > M.budgetParole(s.secondi, PAROLE_AL_SECONDO));
    assert.deepStrictEqual(sforate.map((s) => `${s.id}: ${M.contaParole(s.narrazione)} > ${M.budgetParole(s.secondi, PAROLE_AL_SECONDO)}`), []);
});

test('la lista concat ripete l\'ultimo file (o ffmpeg ne ignora la durata)', () => {
    const l = M.listaConcat([{ file: '/a/uno.mp4', secondi: 2 }, { file: "/a/l'altro.mp4", secondi: 3 }]);
    const righe = l.trim().split('\n');
    assert.strictEqual(righe.length, 5);
    assert.strictEqual(righe[0], "file '/a/uno.mp4'");
    assert.strictEqual(righe[1], 'duration 2.000');
    assert.ok(/l'\\''altro/.test(righe[2]), 'l\'apice nel nome va protetto: ' + righe[2]);
    assert.strictEqual(righe[4], righe[2], 'l\'ultimo file si ripete');
});

test('velocita accelera ma non rallenta mai', () => {
    assert.strictEqual(M.velocita(120, 30), 4);
    assert.strictEqual(M.velocita(10, 30), 1);
    assert.strictEqual(M.velocita(0, 30), 1);
});

test('il copione da leggere porta i minuti d\'attacco di ogni scena', () => {
    const md = M.copioneMd(SCENE, PAROLE_AL_SECONDO);
    assert.ok(/^## 00:00 · /m.test(md));
    const secondaAttacco = SCENE[0].secondi;
    const mm = String(Math.floor(secondaAttacco / 60)).padStart(2, '0') + ':' + String(secondaAttacco % 60).padStart(2, '0');
    assert.ok(md.includes(`## ${mm} · ${SCENE[1].titolo}`), 'la seconda scena attacca a ' + mm);
    assert.ok(!/parole di troppo/.test(md), 'nessuna scena sfora');
});

/* ── le domande aperte lette dal PDF ─────────────────────────────────────── */
const PDF_FINTO = `
                            Domande Aperte - causa
                             Elettricità · Domande aperte · 17/08/2026

    DOMANDA 1   Circuiti Elettrici Base

    Spiega perché un circuito deve essere chiuso affinché un
    utilizzatore elettrico funzioni.

MappAI · insegnai.ch · Elettricità                                       pagina 1 di 11

    DOMANDA 2   Circuiti Elettrici Base   +   Grandezze Elettriche Misura

    Per quale motivo la corrente si genera in un circuito?
`;

test('leggi ricompone le domande su più righe e salta il piè di pagina', () => {
    const d = D.leggi(PDF_FINTO);
    assert.strictEqual(d.length, 2);
    assert.strictEqual(d[0].testo, 'Spiega perché un circuito deve essere chiuso affinché un utilizzatore elettrico funzioni.');
    assert.ok(!/insegnai\.ch/.test(d[0].testo + d[1].testo), 'il piè di pagina non entra nel testo');
    assert.deepStrictEqual(d[1].aree, ['Circuiti Elettrici Base', 'Grandezze Elettriche Misura']);
});

test('areaComune conta un\'area UNA volta per angolo', () => {
    const perAngolo = {
        causa: D.leggi(PDF_FINTO),
        definizione: [{ n: 1, aree: ['Circuiti Elettrici Base'], testo: 'Che cos\'è un circuito?' }],
        esempio: [{ n: 1, aree: ['Resistenza Elettrica'], testo: 'Fai un esempio.' }, { n: 2, aree: ['Resistenza Elettrica'], testo: 'E un altro.' }],
    };
    const { area, angoli } = D.areaComune(perAngolo);
    assert.strictEqual(area, 'Circuiti Elettrici Base');
    assert.strictEqual(angoli, 2, 'due angoli su tre, non tre domande');
});

test('confronto prende la domanda più corta per angolo, nell\'ordine dato', () => {
    const perAngolo = {
        definizione: [{ n: 1, aree: ['X'], testo: 'Domanda lunghissima che non entra nella slide.' }, { n: 2, aree: ['X'], testo: 'Che cos\'è X?' }],
        causa: [{ n: 1, aree: ['X'], testo: 'Perché X?' }],
        esempio: [{ n: 1, aree: ['Y'], testo: 'Niente su X.' }],
    };
    const c = D.confronto(perAngolo, 'X', ANGOLI);
    assert.deepStrictEqual(c.map((x) => x.angolo), ['definizione', 'causa'], 'l\'angolo senza domande si salta');
    assert.strictEqual(c[0].testo, 'Che cos\'è X?');
});

test('le parti di una scena sommano alla scena, e clipDi le espone col LORO tipo', () => {
    const scena = SCENE.find((s) => s.parti);
    assert.ok(scena, 'la scena della mappa ha due parti');
    assert.strictEqual(scena.parti.reduce((t, p) => t + p.secondi, 0), scena.secondi);
    assert.deepStrictEqual(M.clipDi(scena).map((c) => c.id), scena.parti.map((p) => p.id));
    assert.deepStrictEqual(M.clipDi(scena).map((c) => c.tipo), ['studio', 'app'], 'la parte studio non eredita app');
    assert.deepStrictEqual(M.clipDi(SCENE[0]).map((c) => c.id), [SCENE[0].id]);
    const rotta = [{ id: 'x', tipo: 'app', secondi: 10, narrazione: 'n', parti: [{ id: 'x1', gesto: 'g', secondi: 4 }] }];
    assert.ok(M.valida(rotta).some((d) => /le sue parti fanno 4 s/.test(d)));
    /* una parte app senza gesto è un difetto; una parte studio senza gesto no */
    const mista = [{ id: 'y', tipo: 'app', secondi: 240, narrazione: 'n', parti: [{ id: 'y1', tipo: 'studio', secondi: 200 }, { id: 'y2', secondi: 40 }] }];
    const dd = M.valida(mista);
    assert.ok(dd.some((d) => /y\/y2: parte senza gesto/.test(d)));
    assert.ok(!dd.some((d) => /y\/y1/.test(d)));
});

test('la sequenza STUDIO dura quanto la sua parte', () => {
    const { STUDIO } = require('../tools/demo-video/copione.js');
    const parte = SCENE.find((s) => s.parti).parti.find((p) => p.tipo === 'studio');
    assert.strictEqual(STUDIO.reduce((t, v) => t + v.secondi, 0), parte.secondi);
    assert.ok(STUDIO.every((v) => ['fermo', 'pan', 'zoomout'].indexOf(v.effetto) >= 0));
});
