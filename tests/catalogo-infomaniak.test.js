'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-catalogo-core.js');
const U = require('../public/js/mappai-usage-core.js');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('tariffe Infomaniak esatte, nessun prezzo inventato per famiglia', () => {
    const prices = [
        ['google/gemma-4-31B-it', .20, .40], ['mistralai/Mistral-Small-4-119B-2603', .20, .75],
        ['mistralai/Ministral-3-14B-Instruct-2512', .30, .40], ['Qwen/Qwen3.5-122B-A10B-FP8', .40, 3.20],
        ['Qwen/Qwen3.5-397B-A17B-FP8', .80, 3.60], ['moonshotai/Kimi-K2.6', .60, 3],
        ['swiss-ai/Apertus-v1.5-70B', .70, 2.50], ['nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8', .05, .20],
        ['bge_multilingual_gemma2', .065, 0], ['BAAI/bge-multilingual-gemma2', .065, 0],
        ['mini_lm_l12_v2', 0, 0], ['Qwen/Qwen3-Embedding-8B', .07, 0],
        ['BAAI/bge-reranker-v2-m3', .01, 0], ['Qwen/Qwen3-Reranker-0.6B', .009, 0]
    ];
    for (const [id, input, output] of prices) {
        const kb = C.kb(id);
        assert.equal(kb.inputCost, input, id); assert.equal(kb.outputCost, output, id);
        assert.equal(kb.currency, 'CHF'); assert.equal(kb.priceDate, '2026-09-22');
    }
    assert.equal(C.kb('Qwen/future-8b').priceKnown, false);
    assert.equal(C.kb('mini_lm_l12_v2').free, true);
});

test('servizi a tempo mantengono unità e tariffa, senza conversione in token', () => {
    assert.equal(C.kb('Whisper V3').minuteCost, .006);
    assert.equal(C.kb('Flux schnell').minuteCost, .30);
    assert.equal(C.kb('Photomaker V2').unit, 'minute');
    assert.equal(U.costOf({provider:'infomaniak',inTok:1000,outTok:0}, C.kb('Whisper V3')).known, false);
});

test('IPC reale legge prodotto e catalogo per endpoint; errori senza credenziali', async () => {
    const src = read('main.js');
    const start = src.indexOf("ipcMain.handle('list-infomaniak-models'");
    const end = src.indexOf('// IPC handler for listing available Gemini models', start);
    const calls = []; let handler;
    const context = { require: () => C, ipcMain: { handle: (name, fn) => { handler = fn; } },
        axios: { get: async (url, options) => {
            calls.push({ url, options });
            if (url.includes('/2/ai/')) return { data: { data: [{ id: 'google/gemma-4-31B-it' }] } };
            if (decodeURIComponent(url).endsWith('embeddings')) return { data: { data: [{ name: 'Qwen/Qwen3-Embedding-8B' }] } };
            return { data: { data: [{ name: 'google/gemma-4-31B-it' }] } };
        } } };
    vm.runInNewContext(src.slice(start, end), context);
    const rows = await handler(null, { apiKey: 'secret-fixture', productId: '123' });
    assert.equal(calls.length, 4);
    assert.equal(C.forPhase(rows, 'embeddings')[0].id, 'Qwen/Qwen3-Embedding-8B');
    assert(!JSON.stringify(rows).includes('secret-fixture'));
    context.axios.get = async () => { throw Object.assign(new Error('secret-fixture'), {response:{status:401}}); };
    await assert.rejects(handler(null, {apiKey:'secret-fixture',productId:'123'}), error => /401/.test(error.message) && !/secret-fixture/.test(error.message));
});

test('lookup reale ignora tariffe cache obsolete e usa il provider storico', () => {
    const src = read('public/js/mappai-ui-modals.js');
    const context = {window:{MappAICatalogo:C}, appState:{aiProvider:'google'},
        localStorage:{getItem:()=>JSON.stringify([{id:'google/gemma-4-31B-it',kb:{inputCost:0,outputCost:0}}])}, console};
    vm.createContext(context);
    vm.runInContext(src.slice(src.indexOf('const MODEL_KB ='), src.indexOf('// Capability emoji map')), context);
    assert.equal(context.matchModelKB('google/gemma-4-31B-it','infomaniak').inputCost, .2);
    assert.equal(context.matchModelKB('Qwen/future','infomaniak').priceKnown, false);
});

test('dashboard e rapporto stampabile dichiarano gli stessi dati mancanti e il listino', () => {
    let printed = '';
    const context = {window:{MappAIUsageCore:U,MappAICatalogo:C,t:(_key,fallback)=>fallback,
        open:()=>({document:{write:html=>{printed=html;},close:()=>{}}})},
        matchModelKB:(model,provider)=>provider==='infomaniak'?C.kb(model):null,
        localStorage:{getItem:()=>null},console};
    vm.runInNewContext(read('public/js/mappai-usage-dashboard.js'),context);
    const records=[{provider:'infomaniak',model:'unknown',usageKnown:false,inTok:null,outTok:null}];
    const html=context.window.MappAIUsageDash.contentHtml(records);
    context.window.MappAIUsageDash.printReport(records,'Test');
    for(const result of [html,printed]) {
        assert.match(result,/Subtotale noto/); assert.match(result,/senza conteggio token: 1/);
        assert.match(result,/2026-09-22/); assert(!result.includes('costo 0'));
    }
});

test('catalogo per endpoint, alias BGE, prodotto e disponibilità distinti', () => {
    const gemma = { name: 'google/gemma-4-31B-it', type: 'llm' };
    const embedding = { name: 'Qwen/Qwen3-Embedding-8B', type: 'embedding' };
    const future = { name: 'future/chat', info_status: 'coming_soon' };
    const rows = C.catalogue([{ id: gemma.name }, { id: 'bge_multilingual_gemma2' }], {
        all: [gemma, embedding, future, { name: 'BAAI/bge-multilingual-gemma2' }],
        chat: [gemma, future], embeddings: [embedding, { name: 'BAAI/bge-multilingual-gemma2' }]
    });
    assert.deepEqual(C.forPhase(rows, 'giudice').map(r => r.id), [gemma.name]);
    assert.deepEqual(C.forPhase(rows, 'embeddings').map(r => r.id).sort(), [embedding.name, 'bge_multilingual_gemma2'].sort());
    assert.equal(rows.find(r => r.id === embedding.name).availability, 'catalogue');
    assert.equal(rows.find(r => r.id === gemma.name).availability, 'product');
    assert.equal(rows.find(r => r.id === future.name).availability, 'unavailable');
    assert.equal(rows.filter(r => C.canonical(r.id) === C.canonical('bge_multilingual_gemma2')).length, 1);
});

test('lo stato generale coming_soon non nasconde i modelli elencati dal prodotto', () => {
    // Regressione del gate Electron: restavano solo Ministral e zero embeddings.
    const chat = ['mistralai/Ministral-3-14B-Instruct-2512', 'Qwen/Qwen3.5-122B-A10B-FP8',
        'google/gemma-4-31B-it', 'moonshotai/Kimi-K2.6', 'mistralai/Mistral-Small-4-119B-2603',
        'Qwen/Qwen3.5-397B-A17B-FP8', 'swiss-ai/Apertus-v1.5-70B', 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8'];
    const embeddings = ['bge_multilingual_gemma2', 'mini_lm_l12_v2', 'Qwen/Qwen3-Embedding-8B'];
    const entry = name => ({ name, info_status: name === chat[0] ? 'ready' : 'coming_soon' });
    const lists = { all: [...chat, ...embeddings].map(entry), chat: chat.map(entry),
        embeddings: ['BAAI/bge-multilingual-gemma2', ...embeddings.slice(1)].map(entry) };
    const rows = C.catalogue([...chat, ...embeddings].map(id => ({ id })), lists);
    for (const phase of ['mappa', 'materiali', 'giudice']) {
        assert.deepEqual(C.forPhase(rows, phase).map(r => r.id), chat);
    }
    assert.deepEqual(C.forPhase(rows, 'embeddings').map(r => r.id), embeddings);
    assert(rows.every(r => r.availability === 'product'));
    assert.equal(rows.find(r => r.id === chat[2]).infoStatus, 'coming_soon');
    // Conservare la distinzione: il solo catalogo generale non prova accesso al prodotto.
    assert.equal(C.forPhase(C.catalogue([], lists), 'mappa').length, 1);
    assert.equal(C.forPhase(C.catalogue([], lists), 'embeddings').length, 0);
});

test('consumi multimodello con prezzo/usage mancanti mantengono un subtotale dichiarato', () => {
    const result = U.aggregate([
        {provider:'infomaniak', model:'google/gemma-4-31B-it', inTok:1e6, outTok:1e6},
        {provider:'infomaniak', model:'mistralai/Mistral-Small-4-119B-2603', inTok:1e6, outTok:1e6},
        {provider:'infomaniak', model:'unknown', inTok:10, outTok:2},
        {provider:'infomaniak', model:'bge_multilingual_gemma2', usageKnown:false, inTok:null, outTok:null}
    ], {kbLookup: (id, provider) => provider === 'infomaniak' ? C.kb(id) : null});
    assert.ok(Math.abs(result.totals.total - 1.55) < 1e-9);
    assert.equal(result.totals.calls, 4); assert.equal(result.totals.unpriced, 2);
    assert.equal(result.totals.missingUsage, 1);
    assert.deepEqual(result.unknownModels, ['unknown']);
});
