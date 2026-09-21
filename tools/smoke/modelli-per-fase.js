#!/usr/bin/env node
'use strict';
// Renderer vero in VM; soltanto DOM, archivio e confine IPC sono simulati.
// Non verifica credenziali, cataloghi o capacità dei modelli remoti.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { handler, vector, plain } = require('./vettori-magazzino.js');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function block(file, from, to) {
    const source = read(file), start = source.indexOf(from), end = source.indexOf(to, start);
    assert(start >= 0 && end > start, 'Blocco reale non trovato in ' + file);
    return source.slice(start, end);
}
const profile = (provider = 'infomaniak') => ({
    schema: 'mappai-modelli@1', provider,
    modelli: { mappa: 'mappa-test', materiali: 'materiali-test', embeddings: 'vettori-test', giudice: null, reranking: null }
});
const payload = () => ({ contents: [{ role: 'user', parts: [{ text: 'Testo di prova.' }] }], generationConfig: { maxOutputTokens: 100 } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function reply(call, extras = {}) {
    return call.provider === 'infomaniak'
        ? { model: call.payload.model + '-actual', choices: [{ message: { content: 'Risposta.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 }, ...extras }
        : { modelVersion: call.model + '-actual', candidates: [{ content: { parts: [{ text: 'Risposta.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 }, ...extras };
}
function harness(options = {}) {
    const disk = options.disk || new Map(), calls = [], embeddingCalls = [], reads = [], writes = [], logs = [], usage = [], keyReads = [];
    const state = options.state || { activeVaultPath: '/vault/a', rootNodeLabel: 'Progetto A', aiProvider: 'infomaniak', infomaniakProductId: 'product-a' };
    const storageManager = { currentProjectId: 'id-a' };
    const keys = { infomaniak: 'secret-info-a', google: 'secret-google-a', ...options.keys };
    const elements = { 'model-select': { value: 'modello-ui' }, 'infomaniak-product-id': { value: '' } };
    const values = new Map(Object.entries({
        mappai_vettori_cache: options.cacheOn === false ? '0' : '1',
        ...(options.on ? { mappai_multimodello: '1' } : {}), ...options.values
    }));
    const chat = async (provider, args) => {
        const call = { provider, ...args }; calls.push(call);
        return options.chat ? options.chat(call) : reply(call);
    };
    const embed = handler(async (url, sent, config) => {
        const call = { provider: 'infomaniak', texts: Array.from(sent.input), model: sent.model, url, config };
        embeddingCalls.push(call);
        return { data: options.embedding ? await options.embedding(call) : {
            model: sent.model, data: sent.input.map((text, index) => ({ index, embedding: vector(text) })).reverse()
        } };
    });
    const api = {
        generateInfomaniak: args => chat('infomaniak', args),
        generateGemini: args => chat('google', args),
        generateEmbeddingsInfomaniak: embed,
        generateEmbeddingsGoogle: async args => {
            const call = { provider: 'google', ...args }; embeddingCalls.push(call);
            return options.googleEmbeddings ? options.googleEmbeddings(call) : { model: args.model, embeddings: args.texts.map(vector) };
        },
        readVaultFile: async args => {
            reads.push(args); if (options.read) await options.read(args);
            const text = disk.get(args.vaultPath + '/' + args.relPath);
            return text === undefined ? { ok: false } : { ok: true, size: Buffer.byteLength(text), base64: Buffer.from(text).toString('base64') };
        },
        saveVaultFile: async args => {
            writes.push(args); if (options.save) await options.save(args);
            disk.set(args.vaultPath + '/' + args.relPath, args.text); return { ok: true };
        },
        usageLogAppend: rec => { usage.push(plain(rec)); },
        usageLogRead: async () => ({ success: true, records: usage })
    };
    if (options.noIO) { delete api.readVaultFile; delete api.saveVaultFile; }
    const sandbox = {
        __state: state, __storageManager: storageManager,
        MappAIReviewCore: require('../../public/js/mappai-review-core.js'),
        electronAPI: Object.freeze(api), structuredClone, TextEncoder, TextDecoder, atob,
        localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
        document: { getElementById: id => elements[id] || null },
        getProviderKey: provider => { keyReads.push(provider); return keys[provider]; },
        getSystemKey: () => 'secret-legacy', updateCostDisplay: () => {},
        console: Object.fromEntries(['info', 'warn', 'error', 'log'].map(level => [level, (...args) => logs.push(args.join(' '))]))
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext('const appState = __state; const StorageManager = __storageManager; delete window.__state; delete window.__storageManager;', sandbox);
    const load = file => vm.runInContext(read(file), sandbox, { filename: file });
    load('public/js/infomaniak_bridge.js');
    load('public/js/mappai-usage-tracker.js');
    vm.runInContext(block('public/js/app.js', 'window.MappAITruncationTracker =', 'window.updateCostDisplay ='), sandbox, { filename: 'app.js:trasporto-reale' });
    vm.runInContext(block('public/js/mappai-generation-support.js', 'window.fetchEmbeddings =', '// cosineSimilarity estratto'), sandbox, { filename: 'generation-support:trasporto-reale' });
    load('public/js/mappai-vettori-core.js');
    load('public/js/mappai-vettori.js');
    if (options.modelli !== false) {
        load('public/js/mappai-modelli-core.js');
        load('public/js/mappai-modelli.js');
    }
    return { window: sandbox, state, storageManager, keys, keyReads, elements, values, disk, calls, embeddingCalls, reads, writes, logs, usage };
}
async function run() {
    const held = deferred();
    const h = harness({ on: true, chat: async call => { await held.promise; return reply(call); } });
    const a = h.window.MappAIModelli.creaGiro(profile());
    const first = a.chat('mappa', payload());
    h.keys.infomaniak = 'secret-info-b'; h.elements['infomaniak-product-id'].value = 'product-b';
    h.state.activeVaultPath = '/vault/b'; h.state.rootNodeLabel = 'Progetto B'; h.storageManager.currentProjectId = 'id-b';
    const b = h.window.MappAIModelli.creaGiro(profile());
    const second = b.chat('materiali', payload());
    h.state.aiProvider = 'google'; h.state._reviewAIContext = { provider: 'google', model: 'modello-estraneo' };
    h.keys.infomaniak = 'secret-info-c'; h.elements['infomaniak-product-id'].value = 'product-c';
    h.window.MappAIModelli.spegni(); held.resolve();
    const results = await Promise.all([first, second]);
    assert.deepEqual(h.calls.map(c => [c.apiKey, c.productId, c.payload.model]), [
        ['secret-info-a', 'product-a', 'mappa-test'], ['secret-info-b', 'product-b', 'materiali-test']
    ]);
    assert.deepEqual(results.map(r => r._mappaiAI.vaultPath), ['/vault/a', '/vault/b']);
    assert.deepEqual(h.usage.map(r => [r.project, r.projectId]), [['Progetto A', 'id-a'], ['Progetto B', 'id-b']]);
    await b.embeddings(['uno', 'due', 'uno']); await b.embeddings(['due', 'uno']);
    assert.equal(h.embeddingCalls.length, 1);
    assert.equal(h.embeddingCalls[0].config.headers.Authorization, 'Bearer secret-info-b');
    assert(h.embeddingCalls[0].url.includes('/product-b/'));
    const restarted = harness({ on: true, disk: h.disk, state: { activeVaultPath: '/vault/b', rootNodeLabel: 'Progetto B', aiProvider: 'google', infomaniakProductId: 'product-b' } });
    const next = restarted.window.MappAIModelli.creaGiro(b.profilo());
    assert.deepEqual(plain(await next.embeddings(['uno', 'due'])), ['uno', 'due'].map(vector));
    assert.equal(restarted.embeddingCalls.length, 0);
    const publicData = JSON.stringify([a, b, a.profilo(), results, h.usage, h.logs, [...h.disk.values()]]);
    for (const secret of ['secret-info-a', 'secret-info-b', 'product-a', 'product-b']) assert(!publicData.includes(secret));
    console.log('2 giri intercalati: modelli mappa/materiali, chiavi, Product ID e vault separati.');
    console.log('Embeddings: 2 testi unici inviati, poi cache calda; runtime nuovo, 2 hit e zero richieste.');
    console.log('Profilo, risposte, registro consumi e cache senza credenziali. IPC simulati: gate Electron ancora necessario.');
}
module.exports = { harness, profile, payload, deferred, reply, plain, vector, run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
