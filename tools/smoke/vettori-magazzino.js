#!/usr/bin/env node
'use strict';
// Moduli veri, IPC simulati: non usa token, Electron o rete. Esportato ai test
// per tenere un solo banco del trasporto e del riavvio del renderer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const core = require('../../public/js/mappai-vettori-core.js');
const support = read('public/js/mappai-generation-support.js');
const transport = support.slice(support.indexOf('window.fetchEmbeddings ='), support.indexOf('// cosineSimilarity estratto'));
const main = read('main.js');
const start = main.indexOf("ipcMain.handle('generate-embeddings-infomaniak'");
const handlerCode = main.slice(start, main.indexOf('/* ── IL RERANKER', start));
const vector = text => [String(text).length / 7, [...String(text)].reduce((n, c) => n + c.codePointAt(0), 0) / 101, 0];
function handler(post) {
    let invoke;
    vm.runInNewContext(handlerCode, { ipcMain: { handle: (_, fn) => { invoke = fn; } }, axios: { post } });
    return args => invoke(null, args);
}
function harness(options = {}) {
    const disk = options.disk || new Map(), calls = [], reads = [], writes = [], logs = [];
    const state = options.state || { activeVaultPath: '/vault/a', aiProvider: 'infomaniak', infomaniakProductId: '12345' };
    const values = new Map(Object.entries({ mappai_vettori_cache: options.on === false ? '0' : '1' }));
    const invoke = handler(async (url, payload, config) => {
        const call = { provider: 'infomaniak', texts: Array.from(payload.input), model: payload.model, url, config };
        calls.push(call);
        if (options.request) return { data: await options.request(call) };
        return { data: { model: payload.model, data: payload.input.map((text, index) => ({ index, embedding: vector(text) })).reverse() } };
    });
    const api = {
        generateEmbeddingsInfomaniak: invoke,
        generateEmbeddingsGoogle: async args => {
            const call = { provider: 'google', texts: Array.from(args.texts), model: args.model, apiKey: args.apiKey };
            calls.push(call);
            return options.google ? options.google(call) : { embeddings: args.texts.map(vector), model: args.model };
        },
        readVaultFile: async args => {
            reads.push(args);
            if (options.read) await options.read(args);
            const text = disk.get(args.vaultPath + '/' + args.relPath);
            return text === undefined ? { ok: false } : { ok: true, size: Buffer.byteLength(text), base64: Buffer.from(text).toString('base64') };
        },
        saveVaultFile: async args => {
            writes.push(args);
            if (options.save) await options.save(args);
            disk.set(args.vaultPath + '/' + args.relPath, args.text);
            return { ok: true };
        }
    };
    const sandbox = {
        __state: state, MappAIVettoriCore: core,
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
        document: { getElementById: () => null }, electronAPI: Object.freeze(api),
        getProviderKey: provider => provider === 'google' ? 'google-test-key' : 'info-test-key',
        getSystemKey: () => 'legacy-test-key',
        TextEncoder, TextDecoder, atob,
        console: { info: text => logs.push(text), warn: text => logs.push(text) }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext('let appState = __state; delete window.__state;', sandbox);
    vm.runInContext(transport, sandbox);
    const original = sandbox.fetchEmbeddings;
    vm.runInContext(read('public/js/mappai-vettori.js'), sandbox);
    return { window: sandbox, disk, calls, reads, writes, logs, state, values, original };
}
const plain = value => JSON.parse(JSON.stringify(value));
async function run() {
    const texts = Array.from({ length: 100 }, (_, i) => 'Testo ' + i);
    const cold = harness();
    await cold.window.fetchEmbeddings(texts.slice(0, 60));
    const restarted = harness({ disk: cold.disk });
    const result = await restarted.window.fetchEmbeddings(texts);
    assert.deepEqual(plain(restarted.calls[0].texts), texts.slice(60));
    assert.deepEqual(plain(result), texts.map(vector));
    const warm = harness({ disk: cold.disk });
    assert.deepEqual(plain(await warm.window.fetchEmbeddings(texts)), texts.map(vector));
    assert.equal(warm.calls.length, 0);
    assert(![...cold.disk.values()].join('').includes('info-test-key'));
    console.log('100 testi: 60 riletti dal vault, 40 inviati; ordine verificato.');
    console.log('Runtime ricreato: 100 hit, zero chiamate. Nessuna chiave nei file.');
    console.log('Da provare in Electron: disco/permessi reali, riavvio app e disponibilità del modello.');
}
module.exports = { harness, handler, vector, plain, transport, run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
