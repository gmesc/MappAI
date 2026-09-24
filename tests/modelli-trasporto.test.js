'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, profile, payload, deferred, reply, plain, vector, run } = require('../tools/smoke/modelli-per-fase.js');

test('banco completo: giri intercalati, modelli per fase e cache dopo riavvio', run);

test('flag OFF iniziale: creaGiro fallisce prima di chiavi, rete e I/O; configurazione incompleta non ripiega', () => {
    const h = harness();
    assert.throws(() => h.window.MappAIModelli.creaGiro(profile()));
    assert.equal(h.keyReads.length, 0);
    h.window.MappAIModelli.accendi();
    const missing = profile(); delete missing.modelli.embeddings;
    assert.throws(() => h.window.MappAIModelli.creaGiro(missing));
    h.keys.infomaniak = '';
    assert.throws(() => h.window.MappAIModelli.creaGiro(profile()));
    h.keys.infomaniak = 'secret-info-a'; h.state.infomaniakProductId = '';
    assert.throws(() => h.window.MappAIModelli.creaGiro(profile()));
    assert.equal(h.calls.length + h.embeddingCalls.length + h.reads.length + h.writes.length, 0);
});

test('profilo copiato e chiavi lette una volta: giro avviato resta valido con flag spento', async () => {
    const h = harness({ on: true }), p = profile();
    const a = h.window.MappAIModelli.creaGiro(p);
    const exported = a.profilo(); exported.modelli.mappa = 'modificato'; p.modelli.materiali = 'mutato'; p.provider = 'google';
    h.keys.infomaniak = 'chiave-nuova'; h.state.aiProvider = 'google'; h.state.infomaniakProductId = 'altro-product';
    h.window.MappAIModelli.spegni();
    await a.chat('mappa', payload()); await a.chat('materiali', payload());
    assert.deepEqual(h.calls.map(c => c.payload.model), ['mappa-test', 'materiali-test']);
    assert(h.calls.every(c => c.apiKey === 'secret-info-a' && c.productId === 'product-a'));
    assert.deepEqual(h.keyReads, ['infomaniak']);
    assert.deepEqual(plain(a.profilo()), profile());
    assert.throws(() => h.window.MappAIModelli.creaGiro(profile()));
    for (const phase of ['giudice', 'reranking', 'embeddings', 'sconosciuta']) await assert.rejects(async () => a.chat(phase, payload()));
    assert.equal(h.calls.length, 2);
});

test('due provider concorrenti: payload catturato e normalizzazione Google reale, senza mutare il chiamante', async () => {
    const gate = deferred(), h = harness({ on: true, chat: async call => { await gate.promise; return reply(call); } });
    const gp = profile('google'); gp.modelli.mappa = 'gemini-3.8-flash';
    const google = h.window.MappAIModelli.creaGiro(gp), info = h.window.MappAIModelli.creaGiro(profile());
    const input = payload(); input.generationConfig = { maxOutputTokens: 100, temperature: 0.9, topK: 12, _respectTemp: true, thinkingConfig: { thinkingBudget: 0 } };
    const before = plain(input);
    const g = google.chat('mappa', input), i = info.chat('materiali', input);
    assert.deepEqual(input, before);
    input.contents[0].parts[0].text = 'mutazione dopo invio'; input.generationConfig.maxOutputTokens = 999;
    h.state.aiProvider = 'google'; h.state._reviewAIContext = { provider: 'infomaniak', model: 'estraneo' };
    h.state.rootNodeLabel = 'Estraneo'; h.storageManager.currentProjectId = 'estraneo';
    h.window.MappAIUsage.setContext('other', 'misc'); gate.resolve();
    const [gr, ir] = await Promise.all([g, i]);
    assert.deepEqual(h.calls.map(c => c.provider), ['google', 'infomaniak']);
    assert.equal(h.calls[0].apiKey, 'secret-google-a'); assert.equal(h.calls[1].apiKey, 'secret-info-a');
    assert.deepEqual(plain(h.calls[0].payload.generationConfig), { maxOutputTokens: 100, thinkingConfig: { thinkingLevel: 'low' } });
    assert.equal(h.calls[0].payload.contents[0].parts[0].text, 'Testo di prova.');
    assert.equal(h.calls[1].payload.messages[0].content, 'Testo di prova.');
    assert.equal(gr._mappaiAI.provider, 'google'); assert.equal(ir._mappaiAI.provider, 'infomaniak');
    assert.notEqual(gr._mappaiAI.runId, ir._mappaiAI.runId);
    assert.deepEqual(h.usage.map(r => [r.project, r.projectId, r.sub]), [['Progetto A', 'id-a', 'mappa'], ['Progetto A', 'id-a', 'materiali']]);
    assert.equal(h.state._reviewAIContext.model, 'estraneo');
});

test('terzo argomento presente ma nullo/incompleto: nessun dato globale ripara il contesto', async () => {
    const h = harness({ on: true });
    for (const ctx of [false, null, {}, { provider: 'infomaniak', model: 'x', phase: 'mappa' }]) {
        await assert.rejects(h.window.fetchModelAPI(payload(), 'finta', ctx));
    }
    assert.equal(h.calls.length, 0); assert.equal(h.usage.length, 0);
});

test('metadati distinguono modello richiesto/effettivo; usage assente non inventato; tracker reale conserva troncamenti', async () => {
    const h = harness({ on: true, chat: call => reply(call, {
        model: undefined, usage: undefined,
        choices: [{ message: { content: 'Tagliato' }, finish_reason: 'length' }]
    }) });
    const g = h.window.MappAIModelli.creaGiro(profile());
    const result = await g.chat('mappa', payload());
    assert.equal(result._mappaiAI.requestedModel, 'mappa-test'); assert.equal(result._mappaiAI.actualModel, null);
    assert.equal(result._mappaiTruncated, true); assert.equal(result._mappaiFinishReason, 'length');
    assert.equal(result.usageMetadata, undefined); assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].usageKnown, false);
    assert.equal(h.usage[0].inTok, null); assert.equal(h.usage[0].outTok, null);
    assert.equal(h.window.MappAITruncationTracker.summary().truncated, 1);
    const withUsage = harness({ on: true });
    const actual = await withUsage.window.MappAIModelli.creaGiro(profile()).chat('materiali', payload());
    assert.equal(actual._mappaiAI.requestedModel, 'materiali-test'); assert.equal(actual._mappaiAI.actualModel, 'materiali-test-actual');
    assert.equal(withUsage.usage[0].inTok, 7); assert.equal(withUsage.usage[0].outTok, 3);
    const google = harness({ on: true, chat: call => reply(call, { modelVersion: undefined, usageMetadata: undefined }) });
    const gr = await google.window.MappAIModelli.creaGiro(profile('google')).chat('mappa', payload());
    assert.equal(gr._mappaiAI.actualModel, null); assert.equal(google.usage.length, 1);
    assert.equal(google.usage[0].usageKnown, false);
    assert.equal(google.usage[0].inTok, null); assert.equal(google.usage[0].outTok, null);
});

test('usage parziale: solo valori restituiti, zero resta zero e contatori mancanti restano null nel tracker', async () => {
    const cases = [
        { info: { completion_tokens: 3 }, google: { candidatesTokenCount: 3 }, prompt: null, candidate: 3, records: 0 },
        { info: { prompt_tokens: 7 }, google: { promptTokenCount: 7 }, prompt: 7, candidate: null, records: 0 },
        { info: { total_tokens: 10 }, google: { totalTokenCount: 10 }, prompt: null, candidate: null, records: 0 },
        { info: { prompt_tokens: 0, completion_tokens: 3 }, google: { promptTokenCount: 0, candidatesTokenCount: 3 }, prompt: 0, candidate: 3, records: 1 }
    ];
    for (const provider of ['infomaniak', 'google']) for (const c of cases) {
        const h = harness({ on: true, chat: call => reply(call, provider === 'infomaniak' ? { usage: c.info } : { usageMetadata: c.google }) });
        const result = await h.window.MappAIModelli.creaGiro(profile(provider)).chat('mappa', payload());
        assert.deepEqual(plain(result.usageMetadata), c.google);
        assert.equal(h.usage.length, 1);
        assert.equal(h.usage[0].usageKnown, c.records === 1);
        assert.equal(h.usage[0].inTok, c.records ? c.prompt : null);
        assert.equal(h.usage[0].outTok, c.records ? c.candidate : null);
        const event = h.window.MappAITruncationTracker.currentRun[0];
        assert.equal(event.promptTokens, c.prompt); assert.equal(event.candidateTokens, c.candidate);
    }
});

test('chat a due argomenti mantiene selezione, Product ID e risposta storici anche col flag acceso o modulo assente', async () => {
    const outputs = [];
    for (const options of [{ modelli: false }, {}, { on: true }]) {
        const h = harness(options);
        h.state._reviewAIContext = { provider: 'infomaniak', model: 'legacy-review' };
        h.state.aiProvider = 'google'; h.elements['infomaniak-product-id'].value = 'legacy-product';
        const result = await h.window.fetchModelAPI(payload(), 'chiave-argomento');
        outputs.push(plain(result));
        assert.equal(h.calls[0].apiKey, 'chiave-argomento'); assert.equal(h.calls[0].productId, 'legacy-product');
        assert.equal(h.calls[0].payload.model, 'legacy-review'); assert.equal(h.state.infomaniakProductId, 'legacy-product');
        assert.equal(h.values.get('infomaniak_product_id'), 'legacy-product'); assert.equal(result._mappaiAI, undefined);
    }
    assert.deepEqual(outputs[0], outputs[1]); assert.deepEqual(outputs[1], outputs[2]);
});

test('errori provider chat si propagano con una sola chiamata, senza fallback', async () => {
    const h = harness({ on: true, chat: () => { throw new Error('Modello rifiutato'); } });
    await assert.rejects(h.window.MappAIModelli.creaGiro(profile()).chat('mappa', payload()), /Modello rifiutato/);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].provider, 'infomaniak'); assert.equal(h.usage.length, 0);
});

test('errori pubblici di chat ed embeddings non espongono chiave o Product ID', async () => {
    const key = 'token+finto/riservato', productId = 'product+privato';
    const fail = () => { throw new Error('Rifiutato ' + key + ' ' + productId + ' ' + encodeURIComponent(key) + ' ' + encodeURIComponent(productId)); };
    const h = harness({ on: true, keys: { infomaniak: key }, chat: fail, embedding: fail });
    h.state.infomaniakProductId = productId;
    const g = h.window.MappAIModelli.creaGiro(profile());
    for (const call of [() => g.chat('mappa', payload()), () => g.embeddings(['uno'])]) {
        await assert.rejects(call, error => {
            for (const secret of [key, productId, encodeURIComponent(key), encodeURIComponent(productId)]) assert(!String(error).includes(secret));
            return /Rifiutato/.test(error.message);
        });
    }
    assert(!h.logs.join('').includes(key));
});

test('runtime nuovo rilegge credenziali alla creazione, riusa cache e usa la nuova chiave sui miss', async () => {
    const first = harness({ on: true });
    const g = first.window.MappAIModelli.creaGiro(profile());
    await g.embeddings(['uno']);
    const fresh = harness({ on: true, disk: first.disk, keys: { infomaniak: 'secret-nuova-sessione' } });
    const next = fresh.window.MappAIModelli.creaGiro(g.profilo());
    assert.deepEqual(fresh.keyReads, ['infomaniak']);
    await next.embeddings(['uno']); assert.equal(fresh.embeddingCalls.length, 0);
    await next.embeddings(['uno', 'due']); assert.equal(fresh.embeddingCalls.length, 1);
    assert.deepEqual(fresh.embeddingCalls[0].texts, ['due']);
    assert.equal(fresh.embeddingCalls[0].config.headers.Authorization, 'Bearer secret-nuova-sessione');
});

test('flag cache indipendente: OFF mantiene provider/modello/chiave del giro e zero I/O', async () => {
    const h = harness({ on: true, cacheOn: false });
    const g = h.window.MappAIModelli.creaGiro(profile());
    h.state.aiProvider = 'google'; h.keys.infomaniak = 'nuova'; h.state.infomaniakProductId = 'altro';
    h.window.MappAIModelli.spegni();
    assert.deepEqual(plain(await g.embeddings(['uno', 'due'])), ['uno', 'due'].map(vector));
    assert.equal(h.reads.length + h.writes.length, 0);
    assert.equal(h.embeddingCalls[0].provider, 'infomaniak'); assert.equal(h.embeddingCalls[0].model, 'vettori-test');
    assert.equal(h.embeddingCalls[0].config.headers.Authorization, 'Bearer secret-info-a');
    assert(h.embeddingCalls[0].url.includes('/product-a/'));
    h.window.MappAIVettori.accendi();
    await g.embeddings(['uno']); await g.embeddings(['uno']);
    assert.equal(h.embeddingCalls.length, 2); assert(h.writes.length > 0);
});

test('cache assente o vault diverso usa il trasporto esplicito, senza I/O', async () => {
    for (const options of [{ noIO: true }, { state: { activeVaultPath: '', infomaniakProductId: 'product-a' } }, {}]) {
        const h = harness({ on: true, ...options });
        const g = h.window.MappAIModelli.creaGiro(profile());
        h.state.aiProvider = 'google'; h.state.activeVaultPath = '/vault/estraneo';
        assert.deepEqual(plain(await g.embeddings(['uno'])), [vector('uno')]);
        assert.equal(h.reads.length + h.writes.length, 0); assert.equal(h.embeddingCalls[0].provider, 'infomaniak');
    }
});

test('cambio vault durante embeddings: risultato valido, nessuna scrittura al progetto vecchio o nuovo', async () => {
    const gate = deferred(), started = deferred();
    const h = harness({ on: true, embedding: async c => { started.resolve(); await gate.promise; return { model: c.model, data: c.texts.map((t, index) => ({ index, embedding: vector(t) })) }; } });
    const g = h.window.MappAIModelli.creaGiro(profile());
    const pending = g.embeddings(['uno']); await started.promise;
    h.state.activeVaultPath = '/vault/estraneo'; h.state.aiProvider = 'google'; gate.resolve();
    assert.deepEqual(plain(await pending), [vector('uno')]);
    assert.equal(h.writes.length, 0); assert.equal(h.disk.size, 0);
    const reads = h.reads.length; await g.embeddings(['due']);
    assert.equal(h.reads.length, reads); assert.equal(h.writes.length, 0);
    assert(h.embeddingCalls.every(c => c.provider === 'infomaniak'));
});

test('embeddings concorrenti catturano i testi e serializzano il magazzino senza perdere righe', async () => {
    const gate = deferred(), started = deferred();
    const h = harness({ on: true, embedding: async c => { started.resolve(); await gate.promise; return { model: c.model, data: c.texts.map((t, index) => ({ index, embedding: vector(t) })) }; } });
    const g = h.window.MappAIModelli.creaGiro(profile());
    const texts = ['uno'], first = g.embeddings(texts); texts[0] = 'mutato';
    await started.promise; const second = g.embeddings(['uno', 'due', 'uno']); gate.resolve();
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(plain(a), [vector('uno')]); assert.deepEqual(plain(b), ['uno', 'due', 'uno'].map(vector));
    assert.deepEqual(h.embeddingCalls.map(c => c.texts), [['uno'], ['due']]);
    assert.equal(JSON.parse(h.disk.get('/vault/a/vettori.json')).entries.length, 2);
});

test('errore o risposta embeddings incompleta non diventano fallback né scritture, anche a cache OFF', async () => {
    for (const cacheOn of [false, true]) for (const response of ['errore', 'mancante', 'non-finito']) {
        const h = harness({ on: true, cacheOn, embedding: () => {
            if (response === 'errore') throw new Error('Modello embeddings rifiutato');
            return { data: response === 'mancante' ? [] : [{ index: 0, embedding: [NaN] }] };
        } });
        await assert.rejects(h.window.MappAIModelli.creaGiro(profile()).embeddings(['uno']));
        assert.equal(h.embeddingCalls.length, 1); assert.equal(h.writes.length, 0); assert.equal(h.calls.length, 0);
    }
});
