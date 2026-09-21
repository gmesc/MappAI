'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, handler, vector, plain } = require('../tools/smoke/vettori-magazzino.js');
const C = require('../public/js/mappai-vettori-core.js');
const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = (texts, model, dim = 3) => ({ model, data: texts.map((t, index) => ({ index, embedding: vector(t).slice(0, dim) })) });

test('spento: zero I/O e risultato del trasporto storico, senza riordino nuovo', async () => {
    const h = harness({ on: false });
    assert.deepEqual(plain(await h.window.fetchEmbeddings(['uno', 'due'])), [vector('due'), vector('uno')]);
    assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
    assert.equal(h.calls[0].config.headers.Authorization, 'Bearer legacy-test-key');
});

test('freddo, runtime nuovo e caldo: valori, ordine, duplicati, mutazioni e segreti', async () => {
    const a = harness();
    const got = await a.window.fetchEmbeddings(['due', 'uno', 'due']);
    assert.deepEqual(plain(got), ['due', 'uno', 'due'].map(vector));
    assert.deepEqual(plain(a.calls[0].texts), ['due', 'uno']);
    got[0][0] = 999;
    assert.equal(got[2][0], vector('due')[0]);
    const b = harness({ disk: a.disk });
    assert.deepEqual(plain(await b.window.fetchEmbeddings(['uno', 'due'])), ['uno', 'due'].map(vector));
    assert.equal(b.calls.length, 0);
    const text = [...a.disk.values()].join('');
    for (const secret of ['info-test-key', 'legacy-test-key', 'productId', 'apiKey']) assert(!text.includes(secret));
    assert(!a.logs.join('').includes('info-test-key'));
});

test('100 testi, 60 hit: richiede solo 40 e ricompone anche un duplicato', async () => {
    const texts = Array.from({ length: 100 }, (_, i) => 'frase ' + i);
    const a = harness(); await a.window.fetchEmbeddings(texts.slice(0, 60));
    const b = harness({ disk: a.disk });
    assert.deepEqual(plain(await b.window.fetchEmbeddings([...texts, texts[2]])), [...texts, texts[2]].map(vector));
    assert.deepEqual(plain(b.calls[0].texts), texts.slice(60));
});

test('provider, chiave e Product ID sono catturati insieme, indipendenti dal contesto chat', async () => {
    const gate = deferred();
    const h = harness({ read: () => gate.promise });
    h.state._reviewAIContext = { provider: 'google', model: 'chat-google' };
    const result = h.window.fetchEmbeddings(['uno']);
    h.state.aiProvider = 'google'; h.state.infomaniakProductId = '99999';
    gate.resolve(); await result;
    assert.equal(h.calls[0].provider, 'infomaniak');
    assert(h.calls[0].url.includes('/12345/'));
    assert.equal(h.calls[0].config.headers.Authorization, 'Bearer info-test-key');
    await h.window.fetchEmbeddings(['uno']);
    assert.equal(h.calls[1].provider, 'google');
    assert.equal(h.calls[1].apiKey, 'google-test-key');
});

test('cambio modello richiesto invalida cache; un solo testo modificato è un miss', async () => {
    const h = harness(); await h.window.fetchEmbeddings(['uno', 'due'], 'modello-a');
    await h.window.fetchEmbeddings(['uno', 'tre'], 'modello-a');
    assert.deepEqual(plain(h.calls[1].texts), ['tre']);
    await h.window.fetchEmbeddings(['uno'], 'modello-b');
    assert.equal(h.calls[2].model, 'modello-b');
    assert.equal(h.calls.length, 3);
});

for (const change of ['model', 'dimensions']) test('un miss scopre cambio ' + change + ': un solo ricalcolo completo', async () => {
    const h = harness({ request: call => response(call.texts,
        change === 'model' && call.texts.includes('due') ? 'versione-2' : 'versione-1',
        change === 'dimensions' && call.texts.includes('due') ? 2 : 3) });
    await h.window.fetchEmbeddings(['uno']);
    const result = await h.window.fetchEmbeddings(['uno', 'due']);
    assert.deepEqual(plain(h.calls.map(c => c.texts)), [['uno'], ['due'], ['uno', 'due']]);
    assert.equal(result[0].length, change === 'dimensions' ? 2 : 3);
    const fresh = harness({ disk: h.disk });
    assert.deepEqual(plain(await fresh.window.fetchEmbeddings(['uno', 'due'])), plain(result));
    assert.equal(fresh.calls.length, 0);
});

test('due chiamate concorrenti allo stesso vault: nessuna perdita e un solo invio per testo', async () => {
    const gate = deferred(), started = deferred();
    const h = harness({ request: async call => { started.resolve(); await gate.promise; return response(call.texts, call.model); } });
    const first = h.window.fetchEmbeddings(['uno']); await started.promise;
    const second = h.window.fetchEmbeddings(['uno', 'due']);
    gate.resolve(); await Promise.all([first, second]);
    assert.deepEqual(plain(h.calls.map(c => c.texts)), [['uno'], ['due']]);
    const fresh = harness({ disk: h.disk }); await fresh.window.fetchEmbeddings(['uno', 'due']);
    assert.equal(fresh.calls.length, 0);
});

test('cambio vault durante la risposta: nessuna scrittura; cache dei progetti separata', async () => {
    const gate = deferred(), started = deferred();
    const h = harness({ request: async call => { started.resolve(); await gate.promise; return response(call.texts, call.model); } });
    const pending = h.window.fetchEmbeddings(['uno']); await started.promise;
    h.state.activeVaultPath = '/vault/b'; gate.resolve();
    assert.deepEqual(plain(await pending), [vector('uno')]);
    assert.equal(h.writes.length, 0);
    await h.window.fetchEmbeddings(['uno']);
    assert(h.disk.has('/vault/b/vettori.json')); assert(!h.disk.has('/vault/a/vettori.json'));
    h.state.activeVaultPath = '/vault/a'; await h.window.fetchEmbeddings(['uno']);
    assert.equal(h.calls.length, 3);
});

test('spegnimento con operazioni in coda: nessuna nuova lettura o scrittura cache', async () => {
    const gate = deferred(), began = deferred();
    const h = harness({ request: async call => { began.resolve(); await gate.promise; return response(call.texts, call.model); } });
    const first = h.window.fetchEmbeddings(['uno']); await began.promise;
    const second = h.window.fetchEmbeddings(['due']);
    h.window.MappAIVettori.spegni();
    const reads = h.reads.length;
    gate.resolve(); await Promise.all([first, second]);
    assert.equal(h.reads.length, reads); assert.equal(h.writes.length, 0);
    assert.deepEqual(plain(h.calls.map(c => c.texts)), [['uno'], ['due']]);
});

test('Google: cache persistente e risposta parziale rifiutata senza scritture', async () => {
    const state = { activeVaultPath: '/google', aiProvider: 'google' };
    const first = harness({ state }); await first.window.fetchEmbeddings(['uno']);
    const restarted = harness({ state, disk: first.disk });
    assert.deepEqual(plain(await restarted.window.fetchEmbeddings(['uno'])), [vector('uno')]);
    assert.equal(restarted.calls.length, 0);
    const partial = harness({ state, disk: first.disk, google: () => ({ embeddings: [], model: 'gemini-embedding-001' }) });
    await assert.rejects(partial.window.fetchEmbeddings(['uno', 'due']), /vettori_invalid_batch_count/);
    assert.equal(partial.writes.length, 0);
});

test('namespace Google registra i parametri effettivi del suo IPC', async () => {
    const h = harness({ state: { activeVaultPath: '/google', aiProvider: 'google' } });
    await h.window.fetchEmbeddings(['testo']);
    const ns = JSON.parse(h.disk.get('/google/vettori.json')).namespace;
    const source = fs.readFileSync(require.resolve('../main.js'), 'utf8');
    const start = source.indexOf("ipcMain.handle('generate-embeddings-google'");
    const end = source.indexOf('// IPC handler for listing available Infomaniak models', start);
    let invoke, sent;
    vm.runInNewContext(source.slice(start, end), {
        ipcMain: { handle: (_, fn) => { invoke = fn; } },
        axios: { post: async (_, payload) => { sent = payload.requests[0]; return { data: { embeddings: [{ values: [1] }] } }; } }
    });
    await invoke(null, { apiKey: 'test', model: ns.model, texts: ['testo'] });
    assert.deepEqual(ns.parameters, { taskType: sent.taskType, outputDimensionality: sent.outputDimensionality });
});

test('cambio vault durante lettura scarta gli hit; flag spento durante chiamata impedisce salvataggio', async () => {
    const seed = harness(); await seed.window.fetchEmbeddings(['uno']);
    const gate = deferred(), began = deferred();
    const h = harness({ disk: seed.disk, read: async () => { began.resolve(); await gate.promise; } });
    const pending = h.window.fetchEmbeddings(['uno']); await began.promise;
    h.state.activeVaultPath = '/vault/b'; h.window.MappAIVettori.spegni(); gate.resolve();
    await pending;
    assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
});

test('JSON corrotto, schema futuro e file oltre tetto vengono ricalcolati', async () => {
    for (const content of ['{', '{"schema":"future"}', 'x'.repeat(C.TETTO_BYTE + 1)]) {
        const disk = new Map([['/vault/a/vettori.json', content]]);
        const h = harness({ disk });
        assert.deepEqual(plain(await h.window.fetchEmbeddings(['uno'])), [vector('uno')]);
        assert.equal(h.calls.length, 1);
        assert(Buffer.byteLength(disk.get('/vault/a/vettori.json')) <= C.TETTO_BYTE);
    }
});

test('lettura o scrittura fallite non perdono il risultato; il provider fallito si propaga', async () => {
    for (const op of ['read', 'save']) {
        const h = harness({ [op]: async () => { throw new Error('info-test-key 12345'); } });
        assert.deepEqual(plain(await h.window.fetchEmbeddings(['uno'])), [vector('uno')]);
        assert(!h.logs.join('').includes('info-test-key'));
        if (op === 'save') { await h.window.fetchEmbeddings(['uno']); assert.equal(h.calls.length, 2); }
    }
    const h = harness({ request: async () => { throw new Error('provider indisponibile'); } });
    await assert.rejects(h.window.fetchEmbeddings(['uno']), /provider indisponibile/);
    assert.equal(h.writes.length, 0);
});

test('risposte incomplete e vettori incoerenti lasciano intatto il file precedente', async () => {
    const seed = harness(); await seed.window.fetchEmbeddings(['hit']);
    for (const data of [[], [{ index: 0, embedding: [NaN] }], [{ index: 0, embedding: [] }]]) {
        const disk = new Map(seed.disk), before = disk.get('/vault/a/vettori.json');
        const h = harness({ disk, request: () => ({ data }) });
        await assert.rejects(h.window.fetchEmbeddings(['hit', 'miss']));
        assert.equal(h.writes.length, 0); assert.equal(disk.get('/vault/a/vettori.json'), before);
    }
});

test('IPC strictOrder riordina e conserva metadati; vecchia chiamata invariata', async () => {
    const invoke = handler(async () => ({ data: { model: 'effettivo', usage: { tokens: 2 }, data: [
        { index: 1, embedding: [2] }, { index: 0, embedding: [1] }
    ] } }));
    const args = { texts: ['a', 'b'], model: 'richiesto', apiKey: 'finta', productId: '12' };
    assert.deepEqual(plain(await invoke({ ...args, strictOrder: true })), { embeddings: [[1], [2]], model: 'effettivo', usage: { tokens: 2 } });
    assert.deepEqual(plain((await invoke(args)).embeddings), [[2], [1]]);
});

test('IPC strictOrder rifiuta indici mancanti, duplicati, non interi e fuori intervallo', async () => {
    for (const indices of [[0, 0], [0, undefined], [0, 2], [-1, 1], [0, 0.5]]) {
        const invoke = handler(async () => ({ data: { data: indices.map(index => ({ index, embedding: [1] })) } }));
        await assert.rejects(invoke({ texts: ['a', 'b'], strictOrder: true }), /Indici embeddings/);
    }
});

test('vettore -0 è restituito senza essere conservato; zero e valori vicini alle soglie restano esatti', async () => {
    const vectors = [[-0, 1], [0, 0], [0.8500000000000001, Math.sqrt(1 - 0.8500000000000001 ** 2)]];
    const texts = ['meno-zero', 'zero', 'soglia'];
    const h = harness({ request: c => ({ model: c.model, data: c.texts.map(text => ({ index: c.texts.indexOf(text), embedding: vectors[texts.indexOf(text)] })) }) });
    const result = await h.window.fetchEmbeddings(texts);
    assert(Object.is(result[0][0], -0)); assert.equal(result[2][0], vectors[2][0]);
    await h.window.fetchEmbeddings(texts);
    assert.deepEqual(plain(h.calls[1].texts), ['meno-zero']);
});

test('svuota serializzato, spento conserva file, nessun vault delega allo storico', async () => {
    const h = harness(); await h.window.fetchEmbeddings(['uno']);
    const previous = h.disk.get('/vault/a/vettori.json'); h.window.MappAIVettori.spegni();
    assert.equal(h.disk.get('/vault/a/vettori.json'), previous);
    assert.equal(await h.window.MappAIVettori.svuota(), true);
    h.window.MappAIVettori.accendi(); await h.window.fetchEmbeddings(['uno']);
    assert.equal(h.calls.length, 2);
    const reads = h.reads.length; h.state.activeVaultPath = '';
    await h.window.fetchEmbeddings(['uno']); assert.equal(h.reads.length, reads);
});

function contextHarness(options) {
    const h = harness(options);
    h.window.MappAIModelliCore = require('../public/js/mappai-modelli-core.js');
    h.window.getProviderKey = () => { throw new Error('Il contesto esplicito non deve rileggere la chiave'); };
    const ctx = { provider: 'infomaniak', model: 'embed-snapshot', phase: 'embeddings',
        apiKey: 'private-key', productId: 'private-product', runId: 'run-a',
        vaultPath: '/vault/a', project: 'A', projectId: '' };
    return { h, ctx };
}

test('contesto esplicito: cache OFF mantiene provider e credenziali senza I/O né lettura UI', async () => {
    const { h, ctx } = contextHarness({ on: false, state: { aiProvider: 'google', activeVaultPath: '/vault/a' } });
    h.state._reviewAIContext = { provider: 'google' };
    assert.deepEqual(plain(await h.window.fetchEmbeddings(['uno', 'due'], ctx.model, ctx)), [vector('uno'), vector('due')]);
    assert.equal(h.calls[0].provider, 'infomaniak');
    assert.equal(h.calls[0].config.headers.Authorization, 'Bearer private-key');
    assert(h.calls[0].url.includes('/private-product/'));
    assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
});

test('contesto esplicito: cache calda usa il namespace del giro e input mutati non cambiano la richiesta in coda', async () => {
    const { h, ctx } = contextHarness({ state: { aiProvider: 'google', activeVaultPath: '/vault/a' } });
    const texts = ['uno'], pending = h.window.fetchEmbeddings(texts, ctx.model, ctx);
    texts[0] = 'altro'; ctx.apiKey = 'altra-chiave'; ctx.model = 'altro-modello'; ctx.productId = 'altro-product';
    await pending;
    assert.deepEqual(plain(h.calls[0].texts), ['uno']);
    assert.equal(h.calls[0].model, 'embed-snapshot');
    assert.equal(h.calls[0].config.headers.Authorization, 'Bearer private-key');
    ctx.model = 'embed-snapshot';
    await h.window.fetchEmbeddings(['uno'], ctx.model, ctx);
    assert.equal(h.calls.length, 1);
    const cache = JSON.parse(h.disk.get('/vault/a/vettori.json'));
    assert.equal(cache.namespace.provider, 'infomaniak');
    assert.equal(cache.namespace.model, 'embed-snapshot');
    assert(!JSON.stringify(cache).includes('private-key'));
    assert(!JSON.stringify(cache).includes('private-product'));
});

test('contesto esplicito: vault diverso o assente evita la cache mantenendo lo snapshot', async () => {
    for (const activeVaultPath of ['/vault/b', '']) {
        const { h, ctx } = contextHarness({ state: { aiProvider: 'google', activeVaultPath } });
        await h.window.fetchEmbeddings(['uno'], ctx.model, ctx);
        assert.equal(h.calls[0].provider, 'infomaniak');
        assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
    }
});

test('contesto esplicito invalido o modello discordante fallisce prima di ogni IPC', async () => {
    const { h, ctx } = contextHarness();
    for (const bad of [null, {}, { ...ctx, productId: '' }, { ...ctx, phase: 'mappa' }, { ...ctx, token: 'segreto' }]) {
        await assert.rejects(h.window.fetchEmbeddings(['uno'], ctx.model, bad));
    }
    await assert.rejects(h.window.fetchEmbeddings(['uno'], 'discordante', ctx));
    await assert.rejects(h.window.fetchEmbeddings(new Array(2), ctx.model, ctx));
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
});

test('errore del provider esplicito si propaga senza esporre credenziali raw o codificate', async () => {
    const { h, ctx } = contextHarness({ request: () => { throw new Error('Errore 429 private/key private%2Fkey private-product'); } });
    ctx.apiKey = 'private/key';
    await assert.rejects(h.window.fetchEmbeddings(['uno'], ctx.model, ctx), error => {
        assert(error.message.includes('429'));
        assert(!error.message.includes('private'));
        return true;
    });
    assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
});

test('contesto embeddings rifiuta accessori e campi nascosti senza eseguirli o esporre dati', async () => {
    const { h, ctx } = contextHarness();
    let getters = 0;
    for (const key of ['project', 'apiKey']) {
        const bad = { ...ctx };
        Object.defineProperty(bad, key, { enumerable: true, get() { getters++; throw new Error('PRIVATE_KEY_SENTINEL'); } });
        await assert.rejects(h.window.fetchEmbeddings(['uno'], ctx.model, bad), error => {
            assert.equal(error.message, 'Contesto embeddings non valido.');
            return true;
        });
    }
    const hidden = Object.defineProperty({ ...ctx }, 'token', { value: 'PRIVATE_KEY_SENTINEL' });
    await assert.rejects(h.window.fetchEmbeddings(['uno'], ctx.model, hidden));
    assert.equal(getters, 0); assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
});
