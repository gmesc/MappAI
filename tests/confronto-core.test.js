'use strict';
// Confrontare due testi (17/9/26): frasi allineate, parole evidenziate, formattazione ignorata.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-confronto-core.js');

const unisci = pezzi => pezzi.map(p => p.t).join('');
const di = (pezzi, tipo) => pezzi.filter(p => p.tipo === tipo).map(p => p.t.trim());

test('confronto: la formattazione sparisce, i richiami alle note restano', () => {
    assert.equal(C.pulisci('## Il Parlamento\nL\'**Assemblea Federale** è il *parlamento* [1].\n- Assegnò compiti [2].'),
        'Il Parlamento\nL\'Assemblea Federale è il parlamento [1].\n• Assegnò compiti [2].');
    assert.equal(C.pulisci('Costo 3*4 e 2 * 5'), 'Costo 3*4 e 2 * 5', 'un asterisco aritmetico non è corsivo');
});

test('confronto: testi uguali a meno della formattazione → nessuna modifica', () => {
    const r = C.confronta('## Titolo\nPrima frase [1]. Seconda frase.', 'Titolo\n**Prima** frase [1]. Seconda   frase.');
    assert.equal(r.modifiche, 0);
    assert.ok(r.righe.every(x => x.tipo === 'uguale'));
});

test('confronto: il caso Guisan — solo le parole cambiate, frase per frase', () => {
    const bozza = 'La Svizzera restò neutrale [1]. Il governo ricevette pieni poteri e nominò il generale Henri Guisan [2]. Il Paese era accerchiato [3].';
    const scelta = 'La Svizzera restò neutrale [1]. L\'Assemblea Federale elesse il generale Henri Guisan e accordò pieni poteri al Consiglio Federale [2]. Il Paese era accerchiato [3].';
    const r = C.confronta(bozza, scelta);
    assert.equal(r.modifiche, 1);
    assert.deepEqual(r.righe.map(x => x.tipo), ['uguale', 'cambiata', 'uguale']);
    const riga = r.righe[1];
    assert.equal(unisci(riga.a), 'Il governo ricevette pieni poteri e nominò il generale Henri Guisan [2].');
    assert.equal(unisci(riga.b), 'L\'Assemblea Federale elesse il generale Henri Guisan e accordò pieni poteri al Consiglio Federale [2].');
    assert.ok(di(riga.a, 'tolto').some(t => /governo/.test(t)));
    assert.ok(di(riga.b, 'aggiunto').some(t => /Assemblea Federale/.test(t)));
    assert.ok(di(riga.b, 'uguale').some(t => /il generale Henri Guisan/.test(t)), 'la parte comune non si evidenzia');
});

test('confronto: frasi tolte, aggiunte e due modifiche lontane restano separate', () => {
    const a = 'Uno. Due. Tre. Quattro. Cinque.\nSei resta. Sette cambia qui.';
    const b = 'Uno cambiato. Due. Tre. Cinque. Nuova frase.\nSei resta. Sette cambia là.';
    const r = C.confronta(a, b);
    assert.equal(r.modifiche, 4);
    const cambiate = r.righe.filter(x => x.tipo === 'cambiata');
    assert.deepEqual(di(cambiate[1].a, 'tolto'), ['Quattro.']); assert.deepEqual(cambiate[1].b, []);
    assert.deepEqual(cambiate[2].a, []); assert.deepEqual(di(cambiate[2].b, 'aggiunto'), ['Nuova frase.']);
    assert.ok(r.righe.find(x => x.tipo === 'uguale' && x.a === 'Sei resta.').inizioParagrafo);
});

test('confronto: testo vuoto da una parte', () => {
    const r = C.confronta('', 'Una frase nuova.');
    assert.equal(r.modifiche, 1);
    assert.deepEqual(r.righe[0].a, []);
    assert.equal(C.confronta('', '').righe.length, 0);
});
