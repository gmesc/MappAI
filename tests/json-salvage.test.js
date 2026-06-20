'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { salvage, extractBalancedJSON } = require('../public/js/mappai-json-salvage.js');

test('salvage: JSON valido', () => {
    assert.deepEqual(salvage('{"a":1,"b":"x"}'), { a: 1, b: 'x' });
});

test('salvage: rimuove fence markdown ```json', () => {
    assert.deepEqual(salvage('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(salvage('```\n[1,2,3]\n```'), [1, 2, 3]);
});

test('salvage: scarta preamboli/postamboli testuali (Qwen/Apertus)', () => {
    assert.deepEqual(salvage('Ecco il JSON richiesto: {"a":1} — spero sia utile!'), { a: 1 });
});

test('salvage: virgole trailing', () => {
    assert.deepEqual(salvage('{"a":1,"b":2,}'), { a: 1, b: 2 });
    assert.deepEqual(salvage('[1,2,3,]'), [1, 2, 3]);
});

test('salvage: chiavi non quotate', () => {
    assert.deepEqual(salvage('{a:1,b:"x"}'), { a: 1, b: 'x' });
});

test('salvage: oggetto troncato viene bilanciato', () => {
    // troncamento brutale: nessuna chiusura
    assert.deepEqual(salvage('{"a":1,"b":[1,2'), { a: 1, b: [1, 2] });
});

test('salvage: array di oggetti troncato → recupera gli oggetti completi, scarta il troncato', () => {
    // Il secondo oggetto è privo di '}': il salvataggio taglia all'ultima chiusura
    // valida e recupera solo il primo oggetto completo (contratto reale di app.js).
    const out = salvage('[{"id":1,"v":"a"},{"id":2,"v":"b"');
    assert.deepEqual(out, [{ id: 1, v: 'a' }]);
});

test('salvage: stringa con due punti non rompe (non quota dentro i valori)', () => {
    assert.deepEqual(salvage('{"nota":"Attenzione: importante"}'), { nota: 'Attenzione: importante' });
});

test('extractBalancedJSON: estrae il primo blocco bilanciato', () => {
    assert.equal(extractBalancedJSON('xx {"a":1} yy'), '{"a":1}');
    assert.equal(extractBalancedJSON('no json here'), null);
});

test('salvage: testo non-JSON lancia', () => {
    assert.throws(() => salvage('soltanto testo, nessuna struttura'));
});
