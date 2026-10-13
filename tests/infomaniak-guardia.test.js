'use strict';
/*
 * infomaniak-guardia.test.js — la chiamata a Infomaniak non resta appesa (0091).
 *
 * Il difetto, dal gate dello 0090: `callInfomaniakChat` (main.js) aspettava solo
 * `end` o `error` dello stream, senza orologio. Una richiesta senza risposta, o
 * uno stream che smette di mandare dati senza chiudersi, teneva la promessa
 * aperta per sempre e il controllo finale dei materiali restava fermo.
 *
 * main.js non si carica in Node (vuole Electron): la funzione VERA si ritaglia
 * dal file e gira in un contesto con un axios finto e il core SSE vero. I tempi
 * sono abbassati con la stessa variabile d'ambiente della prova in Electron.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PassThrough } = require('node:stream');
const SseCore = require(path.join(__dirname, '..', 'public', 'js', 'mappai-sse-core.js'));

const sorgente = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const inizio = sorgente.indexOf('async function callInfomaniakChat');
const fine = sorgente.indexOf('// IPC handler for proxying Infomaniak requests');
assert(inizio > 0 && fine > inizio, 'callInfomaniakChat non trovata in main.js');
const codice = sorgente.slice(inizio, fine);

const PRIMO = 100, FRA = 60;

function preparaChiamata(post) {
    const avvisi = [];
    const ctx = {
        axios: { post },
        SseCore,
        process: { env: { MAPPAI_INFOMANIAK_GUARDIA_MS: PRIMO + ',' + FRA } },
        console: { warn: (...a) => avvisi.push(a.join(' ')), error: () => { } },
        AbortController, setTimeout, clearTimeout, Promise, Error, Object, JSON
    };
    vm.createContext(ctx);
    vm.runInContext(codice + '\nthis.callInfomaniakChat = callInfomaniakChat;', ctx);
    return { chiama: ctx.callInfomaniakChat, avvisi };
}

const pezzo = (testo, fine) => 'data: ' + JSON.stringify({
    id: 'x', model: 'gemma', created: 1,
    choices: [{ index: 0, delta: { content: testo }, finish_reason: fine || null }]
}) + '\n\n';

/* axios finto: la richiesta non riceve mai risposta; se annullata, rifiuta come axios */
function postMuta(registro) {
    return (url, payload, opz) => new Promise((resolve, reject) => {
        registro.signal = opz.signal || null;
        if (opz.signal) opz.signal.addEventListener('abort', () => {
            const e = new Error('canceled'); e.code = 'ERR_CANCELED'; reject(e);
        });
    });
}
/* axios finto: risponde con uno stream che il test pilota */
function postConStream(registro) {
    return (url, payload, opz) => {
        const s = new PassThrough();
        registro.stream = s;
        registro.opz = opz;
        return Promise.resolve({ data: s });
    };
}
const attendi = (ms) => new Promise(r => setTimeout(r, ms));
const payload = () => ({ model: 'gemma', messages: [] });

test('una richiesta che non riceve risposta si chiude col messaggio leggibile', async () => {
    const reg = {};
    const { chiama, avvisi } = preparaChiamata(postMuta(reg));
    await assert.rejects(chiama({ apiKey: 'k', payload: payload(), productId: 1 }),
        { message: 'Infomaniak non risponde da 0 secondi: la richiesta è stata interrotta.' });
    assert.equal(reg.signal.aborted, true, 'la richiesta è stata annullata');
    assert.equal(avvisi.length, 1);
    assert.match(avvisi[0], /gemma/);
});

test('uno stream che si ferma a metà si chiude, e lo stream viene distrutto', async () => {
    const reg = {};
    const { chiama } = preparaChiamata(postConStream(reg));
    const p = chiama({ apiKey: 'k', payload: payload(), productId: 1 });
    await attendi(5);
    reg.stream.write(pezzo('Ciao'));
    await assert.rejects(p, /Infomaniak non risponde da \d+ secondi: la richiesta è stata interrotta\./);
    assert.equal(reg.stream.destroyed, true);
});

test('una risposta lenta ma viva non viene mai interrotta', async () => {
    const reg = {};
    const { chiama } = preparaChiamata(postConStream(reg));
    const p = chiama({ apiKey: 'k', payload: payload(), productId: 1 });
    await attendi(PRIMO - 30);                     // il primo dato arriva tardi, ma in tempo
    for (let i = 0; i < 8; i++) { reg.stream.write(pezzo(String(i))); await attendi(FRA - 30); }
    reg.stream.end(pezzo('!', 'stop'));            // in tutto ben più di PRIMO + FRA
    const r = await p;
    assert.equal(r.choices[0].message.content, '01234567!');
    assert.equal(r.choices[0].finish_reason, 'stop');
});

test('con uno stream che finisce, la risposta è identica con e senza guardia', async () => {
    const risposte = [];
    for (const guardia of [undefined, false]) {
        const reg = {};
        const { chiama } = preparaChiamata(postConStream(reg));
        const p = chiama({ apiKey: 'k', payload: payload(), productId: 1, guardia });
        await attendi(1);
        reg.stream.write(pezzo('uno '));
        reg.stream.end(pezzo('due', 'length'));
        risposte.push(await p);
        assert.equal(!!reg.opz.signal, guardia !== false, 'il segnale d\'annullamento c\'è solo con la guardia');
    }
    assert.deepEqual(risposte[0], risposte[1]);
    assert.equal(risposte[0].choices[0].message.content, 'uno due');
});

test('con la guardia spenta (\'0\' nel renderer → guardia: false) la chiamata aspetta come prima', async () => {
    const reg = {};
    const { chiama, avvisi } = preparaChiamata(postMuta(reg));
    let finita = false;
    chiama({ apiKey: 'k', payload: payload(), productId: 1, guardia: false }).then(() => { finita = true; }, () => { finita = true; });
    await attendi(PRIMO * 3);
    assert.equal(finita, false, 'nessuna guardia: la promessa resta aperta');
    assert.equal(reg.signal, null);
    assert.equal(avvisi.length, 0);
});

test('il ponte del renderer passa l\'interruttore a main.js', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'preload.js'), 'utf8');
    const riga = preload.slice(preload.indexOf('generateInfomaniak:'), preload.indexOf('generateEmbeddingsInfomaniak:'));
    assert.match(riga, /mappai_infomaniak_guardia/);
    assert.match(riga, /!== '0'/);
    assert.match(sorgente, /ipcMain\.handle\('generate-infomaniak', async \(event, \{ apiKey, payload, productId, guardia \}\)/);
});
