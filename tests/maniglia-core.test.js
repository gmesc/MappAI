/* 0118 — il core della maniglia fra due colonne (mappai-maniglia-core.js): le regole della maniglia del Banco scritte una volta */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const K = require('../public/js/mappai-maniglia-core.js');

const vicino = (a, b) => Math.abs(a - b) < 1e-9;

test('limita: dentro i minimi in pixel; area stretta o nascosta → nessun limite', () => {
    // area 1000 px, pannello almeno 280, l'altra colonna almeno 320 → frazione fra 0,28 e 0,68
    assert.strictEqual(vicino(K.limita(0.1, 1000, 280, 320), 0.28), true);
    assert.strictEqual(vicino(K.limita(0.9, 1000, 280, 320), 0.68), true);
    assert.strictEqual(K.limita(0.5, 1000, 280, 320), 0.5);
    assert.strictEqual(K.limita(0.1, 500, 280, 320), 0.1, 'area più stretta della somma dei minimi');
    assert.strictEqual(K.limita(0.1, 0, 280, 320), 0.1, 'area nascosta (larghezza 0)');
});

test('frazioneDa: dal bordo del pannello, a sinistra o a destra', () => {
    assert.strictEqual(K.frazioneDa(250, 1000, 'sinistra'), 0.25);
    assert.strictEqual(K.frazioneDa(250, 1000, 'destra'), 0.75);
    assert.strictEqual(K.frazioneDa(250, 0, 'sinistra'), 0);
});

test('chiude e rilascio: sotto il 10% si chiude e si riaprirà alla larghezza di PRIMA; sopra si limita', () => {
    assert.strictEqual(K.SOGLIA, 0.1);
    assert.strictEqual(K.chiude(0.09), true);
    assert.strictEqual(K.chiude(0.1), false);
    assert.deepStrictEqual(K.rilascio({ frazione: 0.6, chiusa: false }, 0.05, { larghezza: 1000, minPannello: 280, minAltro: 320 }), { frazione: 0.6, chiusa: true });
    const r = K.rilascio({ frazione: 0.6, chiusa: false }, 0.2, { larghezza: 1000, minPannello: 280, minAltro: 320 });
    assert.strictEqual(r.chiusa, false);
    assert.strictEqual(vicino(r.frazione, 0.28), true, 'fra la soglia e il minimo vince il minimo');
    assert.deepStrictEqual(K.rilascio({ frazione: 0.6, chiusa: false }, 0.5, { larghezza: 1000, minPannello: 280, minAltro: 320 }), { frazione: 0.5, chiusa: false });
    assert.deepStrictEqual(K.rilascio({ frazione: 0.5, chiusa: false }, 0.15, { soglia: 0.2 }), { frazione: 0.5, chiusa: true }, 'soglia passata da chi monta');
});

test('tasto, pannello a SINISTRA: ← stringe, → allarga, a passi del 5%; Invio e Spazio chiudono e riaprono; chiuso lo riapre →', () => {
    const opz = { lato: 'sinistra', larghezza: 1000, minPannello: 280, minAltro: 320 };
    assert.strictEqual(K.PASSO, 0.05);
    assert.strictEqual(vicino(K.tasto({ frazione: 0.5, chiusa: false }, 'ArrowLeft', opz).frazione, 0.45), true);
    assert.strictEqual(vicino(K.tasto({ frazione: 0.5, chiusa: false }, 'ArrowRight', opz).frazione, 0.55), true);
    assert.strictEqual(vicino(K.tasto({ frazione: 0.3, chiusa: false }, 'ArrowLeft', opz).frazione, 0.28), true, 'la freccia non passa il minimo');
    assert.deepStrictEqual(K.tasto({ frazione: 0.5, chiusa: false }, 'Enter', opz), { frazione: 0.5, chiusa: true });
    assert.deepStrictEqual(K.tasto({ frazione: 0.5, chiusa: true }, ' ', opz), { frazione: 0.5, chiusa: false });
    assert.strictEqual(K.tasto({ frazione: 0.5, chiusa: true }, 'ArrowLeft', opz), null, 'chiuso: la freccia verso il bordo non fa niente');
    assert.deepStrictEqual(K.tasto({ frazione: 0.5, chiusa: true }, 'ArrowRight', opz), { frazione: 0.5, chiusa: false });
    assert.strictEqual(K.tasto({ frazione: 0.5, chiusa: false }, 'a', opz), null, 'un tasto che non la riguarda');
});

test('tasto, pannello a DESTRA (il Banco con la veste): le frecce si specchiano', () => {
    const opz = { lato: 'destra', larghezza: 1000, minPannello: 280, minAltro: 320 };
    assert.strictEqual(vicino(K.tasto({ frazione: 0.5, chiusa: false }, 'ArrowRight', opz).frazione, 0.45), true);
    assert.strictEqual(vicino(K.tasto({ frazione: 0.5, chiusa: false }, 'ArrowLeft', opz).frazione, 0.55), true);
    assert.strictEqual(K.tasto({ frazione: 0.5, chiusa: true }, 'ArrowRight', opz), null);
    assert.deepStrictEqual(K.tasto({ frazione: 0.5, chiusa: true }, 'ArrowLeft', opz), { frazione: 0.5, chiusa: false });
});

test('leggi e scrivi: la preferenza in JSON; rotta, assente o fuori misura → la predefinita', () => {
    assert.deepStrictEqual(K.leggi(null, 0.535), { frazione: 0.535, chiusa: false });
    assert.deepStrictEqual(K.leggi('{rotto', 0.535), { frazione: 0.535, chiusa: false });
    assert.deepStrictEqual(K.leggi('{"frazione":1.4,"chiusa":true}', 0.535), { frazione: 0.535, chiusa: true });
    assert.deepStrictEqual(K.leggi('{"frazione":0.42,"chiusa":"sì"}', 0.535), { frazione: 0.42, chiusa: false }, 'chiusa vale solo se è true');
    assert.deepStrictEqual(K.leggi('null', 2), { frazione: 0.5, chiusa: false }, 'predefinita fuori misura → metà');
    assert.strictEqual(K.scrivi({ frazione: 0.123456, chiusa: 1 }), '{"frazione":0.1235,"chiusa":true}');
    assert.deepStrictEqual(K.leggi(K.scrivi({ frazione: 0.4, chiusa: false }), 0.535), { frazione: 0.4, chiusa: false });
});

test('percentuale ed etichetta: aria-valuenow 0 a pannello chiuso; i testi dell\'etichetta li passa chi monta', () => {
    assert.strictEqual(K.percentuale({ frazione: 0.535, chiusa: false }, {}), 54);
    assert.strictEqual(K.percentuale({ frazione: 0.1, chiusa: false }, { larghezza: 1000, minPannello: 280, minAltro: 320 }), 28);
    assert.strictEqual(K.percentuale({ frazione: 0.5, chiusa: true }, {}), 0);
    const testi = { apri: 'Riapri', sposta: 'Sposta' };
    assert.strictEqual(K.etichetta({ chiusa: true }, testi), 'Riapri');
    assert.strictEqual(K.etichetta({ chiusa: false }, testi), 'Sposta');
    assert.strictEqual(K.etichetta({ chiusa: false }), '');
});
