const { test } = require('node:test');
const assert = require('node:assert');
const Q = require('../public/js/mappai-questions-core.js');

const SHEET = [
    'LA GUERRA FREDDA A. Le due superpotenze.',
    'Al termine della Seconda guerra mondiale l\'Europa era impoverita e semidistrutta.',
    'A cosa servì il Piano Marshall?',
    'Attività 1. Con i dati riportati nella tabella, completa il grafico a lato.',
    'Spiega perché USA e URSS divennero rivali dopo la guerra.',
    'Quali paesi facevano parte del blocco orientale?',
    'Il Piano Marshall fu varato nel 1947.',
    'Rispondi alle seguenti domande sul bipolarismo.'
].join('\n');

test('extractQuestions: prende le domande con "?"', () => {
    const qs = Q.extractQuestions(SHEET);
    const texts = qs.map(q => q.text);
    assert.ok(texts.some(t => /A cosa servì il Piano Marshall\?/.test(t)));
    assert.ok(texts.some(t => /Quali paesi facevano parte del blocco orientale\?/.test(t)));
    assert.ok(qs.filter(q => q.type === 'question').length >= 2);
});

test('extractQuestions: prende le consegne imperative (task)', () => {
    const qs = Q.extractQuestions(SHEET);
    const tasks = qs.filter(q => q.type === 'task').map(q => q.text);
    assert.ok(tasks.some(t => /completa il grafico/i.test(t)), 'Attività 1 con "completa"');
    assert.ok(tasks.some(t => /^Spiega perché/i.test(t)), 'consegna "Spiega"');
    assert.ok(tasks.some(t => /^Rispondi/i.test(t)));
});

test('extractQuestions: scarta le frasi affermative normali', () => {
    const qs = Q.extractQuestions(SHEET).map(q => q.text);
    assert.ok(!qs.some(t => /era impoverita e semidistrutta/.test(t)));
    assert.ok(!qs.some(t => /fu varato nel 1947/.test(t)));
});

test('extractQuestions: toglie i marcatori d\'esercizio iniziali (a. / 1.)', () => {
    const qs = Q.extractQuestions('a. Quali furono le cause della guerra fredda?\n1. Completa la mappa concettuale delle superpotenze.');
    assert.ok(qs.some(q => /^Quali furono le cause/.test(q.text)), 'niente "a." iniziale');
    assert.ok(qs.some(q => /^Completa la mappa/.test(q.text)), 'niente "1." iniziale');
});

test('extractQuestions: deduplica le domande ripetute', () => {
    const qs = Q.extractQuestions('Cosa fu la guerra fredda?\nCosa fu la guerra fredda?\nCosa  fu   la guerra fredda?');
    assert.strictEqual(qs.length, 1);
});

test('extractQuestions: rispetta minWords/maxWords', () => {
    const qs = Q.extractQuestions('Perché?\n' + 'Spiega ' + 'x '.repeat(60) + 'in dettaglio ora.');
    assert.strictEqual(qs.length, 0);   // "Perché?" troppo corta, la consegna troppo lunga
});

test('extractQuestions: testo vuoto → nessuna domanda', () => {
    assert.deepStrictEqual(Q.extractQuestions(''), []);
    assert.deepStrictEqual(Q.extractQuestions(null), []);
});
