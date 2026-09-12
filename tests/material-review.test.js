'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const G = require('../public/js/mappai-grounding-core.js');
const R = require('../public/js/mappai-review-core.js');
const salvage = require('../public/js/mappai-json-salvage.js').salvage;
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const GOLD = 'La Germania vende oro alla Svizzera e riceve valuta dalla Banca Nazionale Svizzera.';
const WRONG = 'La Svizzera vende oro alla Germania e riceve valuta dalla Banca Nazionale Svizzera.';
const ACCUSATION = 'La Svizzera fu accusata di aver prolungato la guerra. Il rapporto confermò il respingimento di molti ebrei.';
const material = G.buildInput({ nodes: [{ id: 'oro', label: 'Oro', desc: GOLD }] }, [{ id: 'oro' }],
    [{ id: 'source', title: 'Svizzera', pages: [{ n: 5, text: GOLD }, { n: 6, text: ACCUSATION }] }]);
const mc = id => ({ id, kind: 'mc', question: 'Chi riceve valuta vendendo oro?',
    options: ['La Germania', 'La Svizzera', 'La Francia', 'L’Italia'], correctIndex: 0, explanation: GOLD });
const open = id => ({ id, kind: 'open', question: 'Nomina il generale svizzero.', guide: 'Il generale è Guisan.', criteria: ['Cita Guisan.'], lines: 3 });
const flash = id => ({ id, kind: 'flashcard', question: 'Chi riceve valuta?', answer: GOLD });
const response = (value, reason = 'STOP') => ({ candidates: [{ content: { parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] }, finishReason: reason }] });
const clean = batch => ({ checkedIds: batch.map(i => i.id), mcOptions: batch.filter(i => i.kind === 'mc').map(i => ({ id: i.id, indices: i.options.map((_, n) => n) })), issues: [] });
function runtime(answer) {
    const context = vm.createContext({ console, MappAIGroundingCore: G, salvageTruncatedJSON: salvage, getMaxOutputTokens: n => n });
    context.window = context;
    vm.runInContext(read('mappai-material-review.js'), context);
    vm.runInContext(read('infomaniak_bridge.js'), context);
    const calls = [];
    context.fetchModelAPI = async (payload, key) => {
        calls.push({ payload, key });
        const prompt = payload.contents[0].parts[0].text;
        const batch = JSON.parse(prompt.split('ITEM DA CONTROLLARE (dati)\n')[1]);
        return answer ? answer(batch, payload, calls.length, context) : response(clean(batch));
    };
    return { w: context, calls, check: (items, opts) => context.MappAIMaterialReview.check(items, { apiKey: 'mock-key', material, ...opts }) };
}
function throughGeminiGateway(answer) {
    const r = runtime(), handlers = new Map(), posts = [];
    Object.assign(r.w, {
        appState: { aiProvider: 'google', _reviewAIContext: { provider: 'google', model: 'gemini-3.8-flash' } },
        document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} },
        MappAITruncationTracker: { record() {} }, updateCostDisplay() {},
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        fs: { writeFileSync() {} }, path, __dirname: '/mock-app',
        axios: { post: async (url, payload) => {
            posts.push({ url, payload: plain(payload) });
            const batch = JSON.parse(payload.contents[0].parts[0].text.split('ITEM DA CONTROLLARE (dati)\n')[1]);
            return { data: answer ? await answer(batch, payload, posts.length) : response(clean(batch)) };
        } }
    });
    const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    vm.runInContext(main.slice(main.indexOf('async function callGemini('), main.indexOf('// Chiamata Infomaniak (stream')), r.w);
    r.w.electronAPI = { generateGemini: args => handlers.get('generate-gemini')(null, args) };
    const app = read('app.js');
    vm.runInContext(app.slice(app.indexOf('function _detectTruncation('), app.indexOf('window.updateCostDisplay =')), r.w);
    return { ...r, posts };
}
// Contract for the common documented subset, deliberately narrower than the
// general REST Schema message. No network or provider acceptance is simulated.
// https://ai.google.dev/gemini-api/docs/structured-output#json-schema-support
function assertStructuredSubset(schema) {
    const allowed = {
        OBJECT: ['type', 'properties', 'required'], ARRAY: ['type', 'items'],
        STRING: ['type', 'enum'], INTEGER: ['type'], BOOLEAN: ['type']
    };
    assert.ok(allowed[schema.type], 'a single supported responseSchema type is required');
    Object.keys(schema).forEach(k => assert.ok(allowed[schema.type].includes(k), k + ' is outside the common subset'));
    if (schema.type === 'OBJECT') {
        Object.values(schema.properties).forEach(assertStructuredSubset);
        schema.required.forEach(k => assert.ok(Object.hasOwn(schema.properties, k)));
    }
    if (schema.type === 'ARRAY') {
        assertStructuredSubset(schema.items);
    }
    if (schema.enum) assert.ok(schema.enum.length && schema.enum.every(v => typeof v === 'string'));
}
function wrongGuide(itemId, extra = {}) {
    return { id: itemId, field: 'guide', problem: 'Il soggetto che riceve valuta è invertito.',
        evidenceKind: 'source', sourceId: material.sourcesArr[0].id, quote: GOLD, replacement: GOLD, ...extra };
}
function approvedDecision(issueId, target, before, after, choice = 'manual', evidence = [{ text: GOLD }]) {
    return { initial: { status: 'approved' }, overrides: [{ issueId, target, before, after, choice, evidence, reason: 'Scelta per questa lezione.', origin: 'teacher' }] };
}

test('UMD exposes check in Node and browser; checks are read-only and ReviewCore-compatible', async () => {
    assert.equal(typeof require('../public/js/mappai-material-review.js').check, 'function');
    const items = [{ ...open('q1'), guide: WRONG }];
    const before = plain(items);
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q1')] }));
    const report = await r.check(items);
    assert.deepEqual(items, before);
    assert.equal(report.checkStatus, 'completed');
    assert.equal(report.issues[0].after, GOLD);
    assert.deepEqual(plain(report.issues[0].target), { kind: 'item', id: 'q1', field: 'guide' });
    assert.equal(report.issues[0].evidence[0].verifiedAgainst, 'archived-source-text');
    const review = R.createReview({ db: { items }, report: plain(report) });
    assert.equal(review.initial.issues.length, 1);
    assert.equal(review.initial.issues[0].hasProposal, true);
});

test('actual renderer → Gemini IPC → HTTP payload uses the compact documented schema subset', async () => {
    const items = Array.from({ length: 12 }, (_, n) => mc('draft-B-ramo-economia-e-neutralita-' + n + '-question-0123456789abcdef'));
    const r = throughGeminiGateway((batch, payload) => {
        const config = payload.generationConfig;
        assert.equal(config.responseMimeType, 'application/json');
        assert.equal(config.maxOutputTokens, 6000);
        assert.equal(config.thinkingConfig.thinkingBudget, undefined, 'Gemini 3.8 uses a thinking level, not the legacy budget');
        assert.equal(config.thinkingConfig.thinkingLevel.toLowerCase(), 'low');
        for (const field of ['temperature', 'topP', 'topK', 'candidateCount']) assert.equal(config[field], undefined);
        assert.equal(config.responseJsonSchema, undefined, 'do not mix incompatible schema fields');
        assertStructuredSubset(config.responseSchema);
        assert.doesNotMatch(JSON.stringify(config.responseSchema), /"maxItems"/);
        assert.equal(config.responseSchema.properties.checkedIds.items.enum, undefined);
        assert.equal(config.responseSchema.properties.mcOptions.items.properties.id.enum, undefined);
        assert.equal(config.responseSchema.properties.issues.items.properties.id.enum, undefined);
        assert.match(payload.contents[0].parts[0].text, /problem e newContradiction massimo 350/);
        return response(clean(batch));
    });
    const report = await r.check(items);
    assert.equal(r.posts.length, 1);
    assert.match(r.posts[0].url, /\/v1beta\/models\/gemini-3\.8-flash:generateContent\?/);
    assert.equal(report.checkStatus, 'completed');
    assert.equal(report.coverage.checkedIds.length, 12);
});

test('shared gateway adapts Gemini 3.8 thinking without changing callers, Gemini 2.5 or Infomaniak', async () => {
    const r = throughGeminiGateway();
    await r.check([flash('f')]);
    const template = r.posts[0].payload;
    const cases = [
        { model: 'gemini-3.8-flash', tokens: 16000, thinking: { thinkingBudget: 0 }, level: 'low' },
        { model: 'gemini-3.8-flash', tokens: 16000, thinking: { thinkingLevel: 'minimal' }, level: 'low' },
        { model: 'gemini-3.8-flash', tokens: 6000, thinking: { thinkingLevel: 'HIGH' }, level: 'high' },
        { model: 'gemini-3.8-flash', tokens: 16000, thinking: { thinkingBudget: 1024 }, level: 'medium' },
        { model: 'gemini-3.8-flash', tokens: 16000, thinking: undefined, level: undefined },
        { model: 'gemini-2.5-flash', tokens: 6000, thinking: undefined, legacy: true }
    ];
    for (const c of cases) {
        r.w.appState._reviewAIContext.model = c.model;
        const payload = { ...template, generationConfig: { maxOutputTokens: c.tokens, temperature: 0.4,
            topP: 0.9, topK: 40, candidateCount: 1, ...(c.thinking ? { thinkingConfig: c.thinking } : {}) } };
        const before = plain(payload);
        await r.w.fetchModelAPI(payload, 'mock-key');
        const config = r.posts.at(-1).payload.generationConfig;
        if (c.legacy) {
            assert.equal(config.thinkingConfig.thinkingBudget, 0);
            assert.equal(config.temperature, 0.4);
            assert.equal(config.topP, 0.9);
        } else {
            assert.equal(config.thinkingConfig?.thinkingLevel, c.level);
            assert.equal(config.thinkingConfig?.thinkingBudget, undefined);
            for (const field of ['temperature', 'topP', 'topK', 'candidateCount']) assert.equal(config[field], undefined);
        }
        assert.deepEqual(payload, before);
    }
    let bridgeInput, translated;
    const translate = r.w.InfomaniakBridge.translatePayload;
    r.w.InfomaniakBridge.translatePayload = (payload, model) => {
        bridgeInput = plain(payload); return translate(payload, model);
    };
    r.w.appState._reviewAIContext = { provider: 'infomaniak', model: 'google/gemma-4-31B-it' };
    r.w.appState.infomaniakProductId = 'mock-product';
    r.w.electronAPI.generateInfomaniak = async ({ payload }) => {
        translated = payload;
        return { choices: [{ message: { content: JSON.stringify(clean([flash('f')])) }, finish_reason: 'stop' }] };
    };
    await r.w.fetchModelAPI({ ...template, generationConfig: { temperature: 0.7, _respectTemp: true, maxOutputTokens: 6000 } }, 'mock-key');
    assert.equal(bridgeInput.generationConfig.temperature, 0.7);
    assert.equal(bridgeInput.generationConfig.thinkingConfig, undefined);
    assert.equal(translated.temperature, 0.7);
});

test('105 drafts: a wrapped Gemini 400 INVALID_ARGUMENT stops after one request, preserving every unchecked ID', async () => {
    const r = throughGeminiGateway(() => {
        const e = new Error('Request failed with status code 400');
        e.response = { status: 400, data: { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } } };
        throw e;
    });
    const items = Array.from({ length: 105 }, (_, n) => flash('draft-' + n)), before = plain(items);
    const report = await r.check(items);
    assert.equal(r.posts.length, 1);
    assert.equal(report.batches.length, 1, 'unattempted lots are not represented as executed calls');
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.requestError.code, 'INVALID_ARGUMENT');
    assert.match(report.reason, /Controllo interrotto/);
    assert.equal(report.coverage.deterministicIds.length, 105);
    assert.equal(report.coverage.checkedIds.length, 0);
    assert.equal(report.coverage.skipped.length, 105);
    assert.equal(new Set(report.coverage.skipped.map(s => s.id)).size, 105);
    assert.equal(new Set(report.coverage.skipped.map(s => s.reason)).size, 1);
    assert.match(report.coverage.skipped[0].reason, /Errore Electron IPC API/);
    assert.equal(report.issues.length, 0, 'failure does not invent a clean review or editorial issues');
    assert.deepEqual(items, before);
});

test('invalid request after a successful lot retains its results and skips only the remainder', async () => {
    const r = runtime((batch, _payload, call) => {
        if (call === 2) throw Object.assign(new Error('INVALID_ARGUMENT'), { status: 400 });
        return response(clean(batch));
    });
    const report = await r.check(Array.from({ length: 30 }, (_, n) => flash('f' + n)));
    assert.equal(r.calls.length, 2);
    assert.equal(report.coverage.checkedIds.length, 12);
    assert.equal(report.coverage.skipped.length, 18);
    assert.equal(report.checkStatus, 'incomplete');
});

test('IDs and text limits omitted from the wire schema are still checked locally', async () => {
    for (const bad of [{ checkedIds: ['foreign'] }, { mcOptions: [{ id: 'foreign', indices: [] }] }]) {
        const r = runtime(batch => response({ ...clean(batch), ...bad }));
        const report = await r.check([flash('f')]);
        assert.equal(report.checkStatus, 'incomplete');
        assert.match(report.batches[0].reason, /ID estranei/);
    }
    const r = runtime(batch => response({ ...clean(batch), issues: [
        wrongGuide('long-problem', { problem: 'x'.repeat(351) }),
        wrongGuide('long-proposal', { replacement: 'x'.repeat(4501) }),
        wrongGuide('long-criteria', { field: 'criteria', replacementList: ['x'.repeat(1001)] })
    ] }));
    const report = await r.check(['long-problem', 'long-proposal', 'long-criteria'].map(open));
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.rejected.length, 1);
    assert.equal(report.issues.length, 2, 'useful concerns survive an invalid suggested replacement');
    assert.ok(report.issues.every(i => i.hasProposal === false));
});

test('array counts formerly constrained by maxItems are rejected locally without certifying a completed check', async () => {
    const cases = [
        { name: 'checkedIds', change: answer => { answer.checkedIds.push('q'); } },
        { name: 'mcOptions', change: answer => { answer.mcOptions.push({ id: 'q', indices: [0, 1, 2, 3] }); } },
        { name: 'issues', change: answer => { answer.issues = Array.from({ length: 4 }, () => ({
            id: 'q', field: 'explanation', problem: 'Controlla questo fatto.', evidenceKind: 'source', quote: GOLD
        })); } },
        { name: 'indices', change: answer => { answer.mcOptions[0].indices = Array.from({ length: 21 }, (_, n) => n % 4); } },
        { name: 'replacementList', change: answer => { answer.issues = [{
            id: 'q', field: 'options', problem: 'Controlla queste alternative.', evidenceKind: 'source', quote: GOLD,
            replacementList: Array.from({ length: 21 }, (_, n) => 'Alternativa ' + n)
        }]; } }
    ];
    for (const c of cases) {
        const r = runtime((batch, payload) => {
            assert.doesNotMatch(JSON.stringify(payload.generationConfig.responseSchema), /"maxItems"/);
            assert.match(payload.contents[0].parts[0].text, /checkedIds e mcOptions massimo 1 elementi ciascuno; issues massimo 3/);
            const answer = clean(batch); c.change(answer); return response(answer);
        });
        const item = mc('q'), before = plain(item), report = await r.check([item]);
        assert.equal(report.checkStatus, 'incomplete', c.name);
        assert.match(report.batches[0].reason, /superano i limiti/, c.name);
        assert.equal(report.coverage.checkedIds.length, 0, c.name);
        assert.equal(report.coverage.skipped.length, 1, c.name);
        assert.equal(report.issues.length, 0, c.name);
        assert.equal(r.calls.length, 1, c.name);
        assert.deepEqual(item, before);
    }
});

for (const provider of ['google', 'infomaniak', 'infomaniak-qwen']) {
    test(`${provider}: bounded batches require review of every MC alternative and retain factual proposals`, async () => {
        const items = Array.from({ length: 25 }, (_, n) => mc('mc-' + n));
        items.push({ id: 'summary', kind: 'synthesis', text: 'Il rapporto dimostrò che la Svizzera prolungò la guerra.' });
        const progress = [];
        const r = runtime((batch, payload, count, env) => {
            assert.ok(batch.length <= 12);
            assert.equal(payload.generationConfig.maxOutputTokens, 6000);
            assert.doesNotMatch(JSON.stringify(payload.generationConfig.responseSchema), /"maxItems"/);
            const prompt = payload.contents[0].parts[0].text;
            assert.match(prompt, /OGNI alternativa/);
            assert.match(prompt, /accuse e ipotesi/);
            assert.match(prompt, /introduzione, corpo e conclusioni/);
            const answer = clean(batch);
            if (batch.some(i => i.id === 'summary')) answer.issues.push({ id: 'summary', field: 'text',
                problem: 'Un’accusa è presentata come risultato accertato.', evidenceKind: 'source', sourceId: material.sourcesArr[1].id,
                quote: ACCUSATION, replacement: 'La Svizzera fu accusata di aver prolungato la guerra.' });
            if (provider.startsWith('infomaniak')) {
                const translated = env.InfomaniakBridge.translatePayload(payload, provider.endsWith('qwen') ? 'qwen3.5' : 'google/gemma-4-31B-it');
                if (provider.endsWith('qwen')) assert.ok(translated.messages.some(m => m.content.includes('STRUTTURA JSON ATTESA')));
                else assert.equal(translated.response_format.type, 'json_schema');
                return env.InfomaniakBridge.translateResponse({ choices: [{ message: { content: '```json\n' + JSON.stringify(answer) + '\n```' }, finish_reason: 'stop' }] });
            }
            return response(answer);
        });
        const report = await r.check(items, { onProgress: p => progress.push(p) });
        assert.equal(r.calls.length, 3);
        assert.equal(report.checkStatus, 'completed');
        assert.equal(report.coverage.checkedIds.length, 26);
        assert.equal(report.coverage.mcOptions.length, 25);
        assert.equal(report.issues.length, 1);
        assert.equal(progress.at(-1).done, 26);
    });
}

test('deterministic checks survive unavailable AI without invented spelling corrections', async () => {
    const r = runtime();
    const report = await r.check([
        { ...mc('bad-mc'), options: ['La Germania', '  la GERMANIA ', 'La Francia'], correctIndex: 8 },
        { ...open('bad-open'), guide: '...', criteria: ['', 'TODO'], lines: 53 },
        { ...flash('bad-flash'), answer: '\uFFFD' },
        { id: 'text', kind: 'nodesheet', text: 'La Svizzera haeso e contia.' },
        { ...open('short'), criteria: ['Cita Guisan.'] }
    ], { apiKey: '' });
    assert.equal(r.calls.length, 0);
    assert.equal(report.checkStatus, 'unavailable');
    assert.equal(report.coverage.deterministicIds.length, 5);
    assert.equal(report.coverage.checkedIds.length, 0);
    assert.equal(report.issues.find(i => i.target.field === 'lines').after, 12);
    assert.ok(report.issues.some(i => i.target.field === 'correctIndex'));
    assert.ok(report.issues.some(i => i.target.field === 'options'));
    assert.ok(report.issues.some(i => /Unicode/.test(i.problem)));
    assert.ok(!report.issues.some(i => ['text', 'short'].includes(i.target.id)), 'short content and unknown words are not guessed to be errors');
});

test('pure validate blocks structural defects only and accepts short meaningful criteria', () => {
    const { validate } = require('../public/js/mappai-material-review.js');
    assert.equal(validate([open('o'), mc('m'), flash('f')]).ok, true);
    assert.equal(validate([{ ...open('o'), guide: WRONG }]).ok, true, 'semantic disagreement remains a teacher decision');
    const invalid = [mc('m'), { ...mc('m'), correctIndex: -1 }, { ...flash('f'), answer: '' }];
    const before = plain(invalid);
    const result = validate(invalid);
    assert.equal(result.ok, false);
    assert.ok(result.issues.every(i => i.type === 'structure' && i.blocking));
    assert.deepEqual(invalid, before);
    assert.equal(validate(null).ok, false);
    assert.equal(validate([{ id: 'title', kind: 'nodesheet', layout: 'title', question: 'Oro e valuta', text: '' }]).ok, true);
    assert.equal(validate([{ id: 'card', kind: 'nodesheet', layout: 'card', question: 'Oro e valuta', text: '' }]).ok, false);
    const causal = { id: 'cause', kind: 'causal', question: 'Vendita di oro', text: 'permette', answer: 'Acquisto di valuta' };
    assert.equal(validate([causal]).ok, true);
    for (const field of ['question', 'text', 'answer']) {
        for (const value of ['', 'undefined']) assert.equal(validate([{ ...causal, [field]: value }]).ok, false);
    }
});

test('missing API, source context or parser yields unavailable; empty input needs no provider', async () => {
    const r = runtime();
    assert.equal((await r.check([], { apiKey: '' })).checkStatus, 'completed');
    assert.equal((await r.check([flash('x')], { material: '' })).checkStatus, 'unavailable');
    delete r.w.salvageTruncatedJSON;
    assert.equal((await r.check([flash('x')])).checkStatus, 'unavailable');
    assert.equal(r.calls.length, 0);
});

test('missing, duplicate or unsupported IDs are reported and never offered ambiguous patches', async () => {
    const r = runtime();
    const report = await r.check([flash('same'), flash('same'), { ...flash('z'), id: '' }, { id: 'unknown', kind: 'video' }, flash('valid')]);
    assert.equal(report.checkStatus, 'incomplete');
    assert.deepEqual(plain(report.coverage.checkedIds), ['valid']);
    assert.equal(report.coverage.skipped.length, 4);
    assert.equal(r.calls.length, 1);
});

test('MC key-only checking and missing item verdicts never report completed', async () => {
    const r = runtime(() => response({ checkedIds: ['mc'], mcOptions: [{ id: 'mc', indices: [0] }], issues: [] }));
    const report = await r.check([mc('mc'), flash('f')]);
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.coverage.checkedIds.length, 0);
    assert.match(report.coverage.skipped[0].reason, /alternative/);
    assert.match(report.coverage.skipped[1].reason, /Nessun esito/);
});

test('provider failure affects one batch without retries or loss of other checked items', async () => {
    const r = runtime((batch, _payload, call) => { if (call === 2) throw new Error('Provider offline'); return response(clean(batch)); });
    const report = await r.check(Array.from({ length: 25 }, (_, n) => flash('f' + n)));
    assert.equal(r.calls.length, 3);
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.coverage.checkedIds.length, 13);
    assert.equal(report.coverage.skipped.length, 12);
    assert.equal(report.batches[1].reason, 'Provider offline');
});

for (const mode of ['truncated', 'length', 'MAX_TOKENS']) {
    test(`${mode}: recovered proposals remain visible but the batch is incomplete`, async () => {
        const r = runtime(batch => {
            const answer = { ...clean(batch), issues: [wrongGuide('q')] };
            return mode === 'truncated' ? response(JSON.stringify(answer).slice(0, -1)) : response(answer, mode);
        });
        const report = await r.check([{ ...open('q'), guide: WRONG }]);
        assert.equal(report.checkStatus, 'incomplete');
        assert.equal(report.coverage.checkedIds.length, 0);
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].after, GOLD);
        assert.equal(r.calls.length, 1);
    });
}

test('GroundingCore text form accepts only archived source excerpts, never node paraphrases', async () => {
    const onlyNode = 'Questa frase appartiene soltanto alla descrizione generata.';
    const input = G.buildInput({ nodes: [{ id: 'n', label: 'Nodo', desc: onlyNode }] }, [{ id: 'n' }],
        [{ id: 'pdf', title: 'PDF', pages: [{ n: 5, text: GOLD }] }]);
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', { quote: onlyNode, sourceId: input.sourcesArr[0].id })] }));
    const invalid = await r.check([{ ...open('q'), guide: WRONG }], { material: input.material });
    assert.equal(invalid.issues.length, 0);
    assert.equal(invalid.rejected.length, 1);
    assert.equal(invalid.checkStatus, 'incomplete');
    const good = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', { sourceId: input.sourcesArr[0].id })] }));
    const valid = await good.check([{ ...open('q'), guide: WRONG }], { material: input.material });
    assert.equal(valid.checkStatus, 'completed');
    assert.equal(valid.issues[0].evidence[0].page, 5);
});

test('teacher amendments can ground correction of a derivative, without reopening their decision', async () => {
    const correction = 'Il piano Wahlen venne avviato nel 1940.';
    const review = approvedDecision('teacher-date', { kind: 'node', id: 'n', field: 'desc' }, 'Il piano iniziò nel 1939.', correction);
    const r = runtime((batch, payload) => {
        assert.match(payload.contents[0].parts[0].text, /teacher-date/);
        return response({ ...clean(batch), issues: [{ id: 'f', field: 'answer', problem: 'La flashcard non segue la data rettificata dal docente.',
            evidenceKind: 'teacher', decisionId: 'teacher-date', quote: correction, replacement: correction }] });
    });
    const report = await r.check([{ ...flash('f'), answer: 'Il piano iniziò nel 1939.' }], { review });
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].after, correction);
    assert.equal(report.issues[0].evidence[0].verifiedAgainst, 'teacher-decision');
    assert.equal(report.suppressed.length, 0);
    assert.equal(review.overrides[0].after, correction);
});

test('same rejected objection stays suppressed; a different verified passage and new contradiction may be shown', async () => {
    const item = { ...open('q'), guide: WRONG };
    const review = approvedDecision('rejected-gold', { kind: 'item', id: 'q', field: 'guide' }, WRONG, WRONG, 'reject');
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', { reopensDecisionId: 'rejected-gold', newContradiction: 'Il soggetto è invertito.' })] }));
    const repeated = await r.check([item], { review });
    assert.equal(repeated.issues.length, 0);
    assert.equal(repeated.suppressed.length, 1);
    assert.equal(repeated.checkStatus, 'completed');
    const changed = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', {
        reopensDecisionId: 'rejected-gold', newContradiction: 'La guida presenta inoltre un’accusa come fatto provato.',
        sourceId: material.sourcesArr[1].id, quote: ACCUSATION
    })] }));
    assert.equal((await changed.check([item], { review })).issues.length, 1);
});

test('pending teacher edits are not authoritative and cannot supply evidence', async () => {
    const review = approvedDecision('pending', { kind: 'node', id: 'n', field: 'desc' }, WRONG, GOLD);
    review.initial.status = 'awaiting_review';
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', { evidenceKind: 'teacher', decisionId: 'pending' })] }));
    const report = await r.check([{ ...open('q'), guide: WRONG }], { review });
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.issues.length, 0);
});

test('compact field proposals validate types, permit exclusion and retain concerns without invented replacements', async () => {
    const r = runtime(batch => response({ ...clean(batch), issues: [
        { id: 'mc', field: 'correctIndex', problem: 'Controlla la chiave della risposta.', evidenceKind: 'source', quote: GOLD, replacementIndex: 99 },
        { id: 'q', field: 'criteria', problem: 'Il criterio attribuisce la valuta al soggetto errato.', evidenceKind: 'source', quote: GOLD, replacementList: ['Indica la Germania come destinataria della valuta.'] },
        { id: 'f', field: '$item', problem: 'Questa formulazione crea una contraddizione interna.', evidenceKind: 'item', quote: GOLD, exclude: true }
    ] }));
    const report = await r.check([mc('mc'), open('q'), flash('f')]);
    assert.equal(report.issues.length, 3);
    assert.equal(report.issues[0].hasProposal, false);
    assert.deepEqual(plain(report.issues[1].after), ['Indica la Germania come destinataria della valuta.']);
    assert.equal(report.issues[2].hasProposal, true);
    assert.equal(report.issues[2].after, null);
    assert.equal(report.issues[2].target.field, '$item');
});

test('malformed envelopes, unknown targets and nonexistent fields remain incomplete', async () => {
    const missing = runtime(() => response({ issues: [] }));
    assert.equal((await missing.check([flash('f')])).checkStatus, 'incomplete');
    const invalid = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('ghost'), wrongGuide('f', { field: '__proto__' })] }));
    const report = await invalid.check([flash('f')]);
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.issues.length, 0);
    assert.equal(report.rejected.length, 2);
});

test('editorial proposals use item evidence, remain optional and protect unfamiliar source vocabulary in the prompt', async () => {
    const r = runtime((batch, payload) => {
        assert.match(payload.contents[0].parts[0].text, /Non correggere nomi propri/);
        assert.match(payload.contents[0].parts[0].text, /conserva il lessico della fonte e le citazioni testuali/);
        return response({ ...clean(batch), issues: [{ id: 'f', field: 'answer', type: 'editorial',
            problem: 'Manca l’accento sul verbo essere.', evidenceKind: 'item', quote: 'La Svizzera e neutrale.', replacement: 'La Svizzera è neutrale.' }] });
    });
    const item = { ...flash('f'), answer: 'La Svizzera e neutrale.' };
    const report = await r.check([item]);
    assert.equal(report.issues[0].type, 'editorial');
    assert.equal(report.issues[0].evidence[0].verifiedAgainst, 'item');
    assert.equal(report.issues[0].after, 'La Svizzera è neutrale.');
    assert.equal(item.answer, 'La Svizzera e neutrale.');
});

test('no original excerpts means explicitly incomplete source fidelity, even if the internal checks respond', async () => {
    const r = runtime();
    const report = await r.check([flash('f')], { material: 'CONTENUTI APPROVATI\n' + GOLD });
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.reference.originalSourceCount, 0);
    assert.match(report.reason, /Passaggi originali non disponibili/);
    const cyclic = flash('cyclic'); cyclic.self = cyclic;
    assert.equal((await r.check([cyclic])).checkStatus, 'incomplete');
});

test('whitespace-insensitive evidence matching returns the exact archived substring', async () => {
    const original = 'La Germania vende\n oro\talla Svizzera e riceve valuta.';
    const reference = G.buildInput({}, [], [{ title: 'PDF', text: original }]);
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('q', {
        sourceId: reference.sourcesArr[0].id, quote: 'Germania vende oro alla Svizzera'
    })] }));
    const report = await r.check([{ ...open('q'), guide: WRONG }], { material: reference });
    assert.equal(report.issues[0].evidence[0].text, 'Germania vende\n oro\talla Svizzera');
    assert.ok(original.includes(report.issues[0].evidence[0].text));
});
