'use strict';
/*
 * «Le cartelle sono cambiate»: il canale unico di mappai-vaults-bus.js.
 *
 * Chi scrive su disco chiama `segnala`, chi mostra elenchi si iscrive con
 * `quando` e rilegge. Qui si prova il contratto che regge le tabelle:
 *   · le segnalazioni ravvicinate diventano UN evento (la pipeline dei
 *     materiali scrive otto file di fila: otto ridisegni sarebbero sette di troppo);
 *   · chi si disiscrive non riceve più niente (una console chiusa non ridisegna);
 *   · un ascoltatore che lancia non ferma gli altri.
 * Il tempo è finto (`mock.timers`): i 60 ms del raggruppamento si fanno
 * scorrere a mano, senza attese vere.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = path.join(__dirname, '..', 'public', 'js', 'mappai-vaults-bus.js');

// Prima della guardia su `window` questo require lanciava «window is not defined».
const V = require(FILE);

// Il documento del browser, quanto basta: un EventTarget vero (CustomEvent è
// globale in Node). Lo cercano `quando` e `_emetti` al momento della chiamata.
globalThis.document = new EventTarget();

test('in Node il modulo si carica senza window, e il canale ha il suo nome', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(V.EVENTO, 'mappai-vaults-changed');
    assert.equal(typeof V.segnala, 'function');
    assert.equal(typeof V.quando, 'function');
});

test('nel browser non cambia niente: window.MappAIVaults è il canale', () => {
    const window = {};
    vm.runInNewContext(fs.readFileSync(FILE, 'utf8'), { window });
    assert.deepEqual(Object.keys(window.MappAIVaults).sort(), ['EVENTO', 'quando', 'segnala']);
    assert.equal(window.MappAIVaults.EVENTO, 'mappai-vaults-changed');
});

test('otto segnalazioni ravvicinate → un evento solo, con tutti gli otto motivi', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ricevuti = [];
    const smetti = V.quando(d => ricevuti.push(d));
    t.after(smetti);

    for (let i = 0; i < 8; i++) V.segnala('file-scritto', { file: 'm' + i + '.html' });
    t.mock.timers.tick(59);
    assert.equal(ricevuti.length, 0, 'prima dei 60 ms non parte niente');
    t.mock.timers.tick(1);
    assert.equal(ricevuti.length, 1, 'otto scritture, un ridisegno');
    assert.equal(ricevuti[0].motivi.length, 8);
    assert.deepEqual(ricevuti[0].motivi[0], { motivo: 'file-scritto', dettaglio: { file: 'm0.html' } });

    // Il raggruppamento si riapre: una scrittura dopo è un evento nuovo.
    V.segnala('mappa-salvata');
    t.mock.timers.tick(60);
    assert.equal(ricevuti.length, 2);
    assert.deepEqual(ricevuti[1].motivi, [{ motivo: 'mappa-salvata', dettaglio: null }]);
});

test('disiscrizione: chi ha smesso non riceve più, gli altri sì', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let chiusa = 0, aperta = 0;
    const smettiChiusa = V.quando(() => { chiusa++; });
    const smettiAperta = V.quando(() => { aperta++; });
    t.after(smettiAperta);

    smettiChiusa();
    V.segnala('file-eliminato');
    t.mock.timers.tick(60);
    assert.equal(chiusa, 0, 'la console chiusa non ridisegna');
    assert.equal(aperta, 1);

    assert.equal(typeof V.quando('non una funzione'), 'function', 'anche un ascolto sbagliato si può staccare');
});

test('un ascoltatore che lancia non ferma gli altri, e l\'errore non esce', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let dopo = 0;
    const smetti1 = V.quando(() => { throw new Error('tabella sparita'); });
    const smetti2 = V.quando(() => { dopo++; });
    t.after(() => { smetti1(); smetti2(); });

    V.segnala('materiali-generati');
    t.mock.timers.tick(60);
    assert.equal(dopo, 1);
    // EventTarget riporta l'errore di un ascoltatore al giro dopo, come
    // eccezione non gestita: si aspetta quel giro DENTRO il test, così se il
    // modulo smettesse di contenerlo fallirebbe questo test e non «il file».
    await new Promise(r => setImmediate(r));
});
