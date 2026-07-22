const { test } = require('node:test');
const assert = require('node:assert');
const BP = require('../public/js/mappai-boilerplate-core.js');

// Scheda con intestazione ripetuta a ogni pagina (numero di pagina variabile).
const SHEET = [
    'Storia IV Media    La Guerra Fredda    pag. 1',
    'La Guerra Fredda fu un lungo periodo di tensione tra USA e URSS.',
    'Il Piano Marshall finanziò la ricostruzione europea.',
    'Storia IV Media    La Guerra Fredda    pag. 2',
    'La cortina di ferro divise l\'Europa in due blocchi.',
    'La guerra di Corea fu il primo grande conflitto.',
    'Storia IV Media    La Guerra Fredda    pag. 3',
    'La crisi di Cuba portò il mondo sull\'orlo della guerra nucleare.'
].join('\n');

test('findRepeatedLines: intestazione ricorrente rilevata, numeri di pagina collassati', () => {
    const reps = BP.findRepeatedLines(SHEET);
    assert.strictEqual(reps.length, 1);
    assert.strictEqual(reps[0].count, 3);                 // 3 pagine, 3 occorrenze
    assert.ok(/storia iv media/.test(reps[0].key));
    assert.ok(reps[0].key.indexOf('#') >= 0);             // pag. # normalizzato
});

test('stripBoilerplate: rimuove le intestazioni, conserva il contenuto', () => {
    const r = BP.stripBoilerplate(SHEET);
    assert.strictEqual(r.count, 3);
    assert.ok(r.text.indexOf('Storia IV Media') < 0);     // via l'intestazione
    assert.ok(r.text.indexOf('Piano Marshall') >= 0);     // resta il contenuto
    assert.ok(r.text.indexOf('crisi di Cuba') >= 0);
});

test('findRepeatedLines: non tocca le frasi normali ripetute poche volte', () => {
    const t = 'Frase unica uno.\nFrase unica due.\nRipetuta.\nRipetuta.';   // "Ripetuta" 2× < minRepeats 3
    const reps = BP.findRepeatedLines(t);
    assert.strictEqual(reps.length, 0);
});

test('findRepeatedLines: ignora le righe lunghe (frasi vere) anche se ripetute', () => {
    const longLine = 'Questa e una frase molto lunga con parecchie parole che supera il limite massimo di quattordici parole previsto.';
    const t = [longLine, 'X', longLine, 'Y', longLine].join('\n');   // ripetuta 3× ma > maxWords
    const reps = BP.findRepeatedLines(t);
    assert.strictEqual(reps.length, 0);
});

test('stripBoilerplate: testo senza boilerplate resta invariato', () => {
    const t = 'Prima frase.\nSeconda frase.\nTerza frase.';
    const r = BP.stripBoilerplate(t);
    assert.strictEqual(r.text, t);
    assert.strictEqual(r.count, 0);
});

test('findRepeatedLines: righe di soli numeri non contano come intestazione', () => {
    const t = '1\n2\n3\n4';   // norm → tutte '#', ma scartate
    const reps = BP.findRepeatedLines(t);
    assert.strictEqual(reps.length, 0);
});

test('stripBoilerplate: soglie personalizzabili (minRepeats 2)', () => {
    const t = 'HEADER\nqualcosa\nHEADER\naltro';
    const r = BP.stripBoilerplate(t, { minRepeats: 2 });
    assert.strictEqual(r.count, 2);
    assert.ok(r.text.indexOf('HEADER') < 0);
});
