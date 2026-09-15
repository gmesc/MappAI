'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const G = require('../public/js/mappai-grounding-core.js');
const R = require('../public/js/mappai-review-core.js');
const MR = require('../public/js/mappai-material-review.js');
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
const clean = (batch, reference = material) => ({ checkedIds: batch.map(i => i.id), checkedClaims: MR.claimUnits(batch).map(c => ({ id: c.id, status: 'supported', sourceIds: [reference.sourcesArr[0].id] })),
    mcOptions: batch.filter(i => i.kind === 'mc').map(i => ({ id: i.id, indices: i.options.map((_, n) => n) })), issues: [] });
const recoveryRows = payload => JSON.parse(payload.contents[0].parts[0].text.split('SEGNALAZIONI DA COMPLETARE (dati)\n')[1].split('\n\nPASSAGGI ORIGINALI')[0]);
const recoveryChoice = (payload, index, extra = {}) => ({ issueId: recoveryRows(payload)[index].issueId,
    action: 'needs_teacher', reason: 'Le prove non permettono una riparazione certa.', ...extra });
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
    return { w: context, calls, check: (items, opts) => context.MappAIMaterialReview.check(items, { apiKey: 'mock-key', material, ...opts }),
        checkRemaining: (items, opts) => context.MappAIMaterialReview.checkRemaining(items, { apiKey: 'mock-key', material, ...opts }) };
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

test('Officina: a synthesis list introduction can complete a retry, while factual prose cannot pass as instruction', async () => {
    const lead = 'Ecco come funziona il movimento delle cariche:';
    const item = { id: 'synthesis-3', kind: 'synthesis', text: lead + '\n- ' + GOLD };
    const items = [item, flash('already-checked')];
    const first = runtime(batch => {
        const data = clean(batch);
        const claim = MR.claimUnits(batch).find(c => c.text === lead);
        if (claim) Object.assign(data.checkedClaims.find(c => c.id === claim.id), { status: 'uncertain', sourceIds: [] });
        return response(data);
    });
    const previousReport = plain(await first.check(items));
    assert.equal(previousReport.checkStatus, 'incomplete');
    const second = runtime((batch, payload) => {
        assert.deepEqual(batch.map(i => i.id), [item.id]);
        assert.match(payload.contents[0].parts[0].text, /introduzione editoriale/);
        const data = clean(batch), claim = MR.claimUnits(batch).find(c => c.text === lead);
        Object.assign(data.checkedClaims.find(c => c.id === claim.id), { status: 'instruction', sourceIds: [] });
        return response(data);
    });
    const completed = await second.checkRemaining(items, { previousReport });
    assert.equal(completed.checkStatus, 'completed');
    assert.equal(completed.retrySummary.remaining, 0);
    assert.equal(completed.retrySummary.reused, 1);
    assert.equal(completed.coverage.claims.find(c => c.text === lead).checked, true);
    const cached = await second.checkRemaining(items, { previousReport: plain(completed), apiKey: '' });
    assert.equal(cached.retrySummary.reused, 2);
    assert.equal(second.calls.length, 1);

    for (const text of ['Lo zinco è positivo.', 'Spiega perché lo zinco è positivo.', lead + ' Lo zinco è positivo.']) {
        const r = runtime(batch => {
            const data = clean(batch);
            data.checkedClaims.forEach(c => Object.assign(c, { status: 'instruction', sourceIds: [] }));
            return response(data);
        });
        assert.equal((await r.check([{ ...item, text }])).checkStatus, 'incomplete', text);
    }
});

test('single-bracket unknown citations are findings, while reference-only lines are not factual claims', () => {
    const item = { id: 'synthesis-3', kind: 'synthesis', text: 'Fatto [src-absent].', citations: [] };
    const report = MR.validate([item]);
    assert.equal(report.ok, false);
    assert.match(report.issues[0].problem, /src-absent/);
    assert.equal(report.issues[0].hasProposal, false);
    assert.equal(MR.claimUnits([{ ...item, text: '[src-absent].\n[[src-absent]]' }]).length, 0);
});

test('the updated instruction contract invalidates old checks once, then reuses the new complete report', async () => {
    const items = [flash('f')], previousReport = plain(await runtime().check(items));
    previousReport.checkpoint.version = 'material-check@1';
    const r = runtime(), checked = await r.checkRemaining(items, { previousReport });
    assert.equal(checked.retrySummary.reason, 'review-contract-changed');
    assert.equal(checked.retrySummary.reused, 0);
    assert.equal(checked.checkStatus, 'completed');
    assert.equal((await r.checkRemaining(items, { previousReport: plain(checked) })).retrySummary.reused, 1);
    assert.equal(r.calls.length, 1);
});

test('a verified source missing from a synthesis registry travels with the proposal through approval and export', async () => {
    const sources = [{ docId: 'book', title: 'Fonte', pages: [
        { n: 1, text: 'La Svizzera era neutrale.' },
        { n: 4, text: 'Il commercio con gli Alleati continuò, in particolare con gli USA.' }
    ] }];
    const reference = G.buildInput({}, [], sources, {}, { includeOriginalPages: true });
    const old = { ...reference.sourcesArr[0], idx: 1 }, added = reference.sourcesArr[1];
    const item = { id: 'synthesis-0', kind: 'synthesis', text: 'La Svizzera era neutrale [1]. Non ci furono scambi con gli Alleati.', citations: [old] };
    const corrected = 'La Svizzera era neutrale [1]. Il commercio con gli Alleati continuò [[' + added.id + ']].';
    const r = throughGeminiGateway((batch, payload, call) => {
        if (call === 1) return response({ ...clean(batch, reference), issues: [{ id: item.id, field: 'text',
            problem: 'La fonte documenta scambi che la sintesi nega.', evidenceKind: 'source', sourceId: added.id, quote: added.text }] });
        assert.match(payload.contents[0].parts[0].text, /programma aggiunge la fonte verificata/);
        return response({ decisions: [recoveryChoice(payload, 0, { action: 'replace', replacement: corrected })] });
    });
    const report = await r.check([item], { material: reference });
    assert.equal(report.checkStatus, 'completed'); assert.equal(r.posts.length, 2);
    const finding = report.issues[0];
    assert.equal(finding.hasProposal, true); assert.equal(finding.citationAdditions[0].text, added.text);
    assert.equal(finding.citationAdditions[0].idx, 2); assert.deepEqual(item.citations, [old]);
    let review = R.createReview({ db: { items: [item] }, sources, report });
    const kept = R.preview(R.setDecision(review, finding.id, 'reject'), { items: [item] });
    assert.deepEqual(kept.db.items, [item], 'rejection changes neither the text nor the source registry');
    review = R.setDecision(review, finding.id, 'accept');
    review = JSON.parse(JSON.stringify(review)); // the actual manifest contract
    const approved = R.beginApproval(review, { items: [item] });
    assert.equal(approved.ok, true); assert.equal(approved.db.items[0].text, corrected);
    assert.deepEqual(approved.db.items[0].citations[0], old);
    assert.equal(approved.db.items[0].citations[1].text, added.text);
    const completed = R.completeApproval(approved.review, approved.revision);
    assert.equal(R.gate(completed, approved.db, sources).allowed, true);
    const D = require('../public/js/mappai-material-drafts');
    const drafts = { D: { data: { whole: true, sections: [{ rawText: item.text, sourcesArr: [old] }] } } };
    const out = D.apply(drafts, approved.db.items);
    assert.equal(out.D.data.sections[0].rawText, corrected);
    assert.equal(out.D.data.sections[0].sourcesArr[1].text, added.text);
    assert.equal(drafts.D.data.sections[0].sourcesArr.length, 1);
    for (const mutation of ['text', 'page']) {
        const tampered = plain(review);
        tampered.initial.issues[0].citationAdditions[0][mutation] = mutation === 'page' ? 999 : 'Testo inventato.';
        const result = R.preview(tampered, { items: [item] });
        assert.equal(result.ok, false); assert.deepEqual(result.db.items, [item]);
    }
    const manual = R.preview(R.setDecision(review, finding.id, 'manual', { text: 'Il commercio con gli Alleati continuò.' }), { items: [item] });
    assert.equal(manual.ok, true); assert.deepEqual(manual.db.items[0].citations, [old], 'unused proposed references are not attached');
});

test('claim checks use literal fragments and original pages, without generated-node paraphrases or duplicate source text', async () => {
    const pages = [
        'La commissione esaminò le accuse e confermò il respingimento di molti ebrei.',
        'Il razionamento serviva all’approvvigionamento alimentare della popolazione.',
        'Furono accolti rifugiati politici, militari internati e disertori.'
    ];
    const original = G.buildInput({ nodes: [{ id: 'n', label: 'Sintesi generata', desc: 'PARAFRASI_DA_NON_USARE_COME_PROVA' }] }, [{ id: 'n' }],
        [{ title: 'Fonte', pages: pages.map((text, n) => ({ n: n + 1, text })) }], {}, { includeOriginalPages: true });
    const items = [{ id: 'bergier', kind: 'synthesis', text: '## Conclusioni\nLa commissione confermò tutte le accuse. Questi fatti erano accertati.' },
        { ...flash('food'), answer: 'Il razionamento garantiva pasti equilibrati a tutti.' },
        { ...open('asylum'), guide: 'Accoglieva solo disertori e rifugiati politici.', criteria: ['Cita solo disertori e rifugiati politici.'] }];
    const units = MR.claimUnits(items);
    for (const unit of units) {
        const item = items.find(i => i.id === unit.itemId);
        const value = unit.index === undefined ? item[unit.field] : item[unit.field][unit.index];
        assert.ok(value.includes(unit.text));
    }
    assert.ok(units.some(c => c.text.includes('tutte le accuse')));
    assert.ok(units.some(c => c.text.includes('pasti equilibrati a tutti')));
    assert.equal(units.filter(c => /solo disertori/.test(c.text)).length, 2);
    assert.equal(MR.claimUnits([{ id: 'refs', kind: 'synthesis', text: '[[src-only]].\n[1]' }]).length, 0, 'reference codes are not factual assertions');
    const r = runtime((batch, payload) => {
        const prompt = payload.contents[0].parts[0].text;
        assert.doesNotMatch(prompt, /PARAFRASI_DA_NON_USARE_COME_PROVA/);
        assert.match(prompt, /grado di certezza/); assert.match(prompt, /riferimenti alle frasi vicine/);
        assert.deepEqual(JSON.parse(prompt.split('AFFERMAZIONI DA VERIFICARE (dati)\n')[1].split('\n\nITEM')[0]), units);
        return response(clean(batch, original));
    });
    const report = await r.check(items, { material: original });
    assert.equal(report.checkStatus, 'completed'); assert.equal(report.coverage.claims.length, units.length);
    assert.equal(r.calls.length, 1, 'the per-claim protocol uses the existing review call');
});

test('a generic item verdict cannot hide missing, duplicate, uncertain or unsupported claim verdicts', async () => {
    const items = [{ id: 'summary', kind: 'synthesis', text: 'Prima affermazione. Seconda affermazione.' }];
    for (const mode of ['absent', 'missing', 'duplicate', 'unknown-source', 'uncertain', 'false-instruction', 'problem-without-proof', 'foreign-id']) {
        const r = runtime(batch => {
            const data = clean(batch);
            if (mode === 'absent') delete data.checkedClaims;
            if (mode === 'missing') data.checkedClaims.pop();
            if (mode === 'duplicate') data.checkedClaims[1] = data.checkedClaims[0];
            if (mode === 'unknown-source') data.checkedClaims[0].sourceIds = ['src-invented'];
            if (mode === 'uncertain') data.checkedClaims[0].status = 'uncertain';
            if (mode === 'false-instruction') { data.checkedClaims[0].status = 'instruction'; data.checkedClaims[0].sourceIds = []; }
            if (mode === 'problem-without-proof') data.checkedClaims[0].status = 'problem';
            if (mode === 'foreign-id') data.checkedClaims[0].id = 'claim-foreign';
            return response(data);
        });
        const report = await r.check(items);
        assert.equal(report.checkStatus, 'incomplete', mode);
        assert.equal(report.coverage.checkedIds.length, 0, mode);
        assert.equal(r.calls.length, 1, mode);
    }
});

test('claim problem acknowledgement requires a verified finding on the same item and field', async () => {
    const items = [{ ...flash('f'), answer: WRONG }];
    for (const field of ['answer', 'question']) {
        const r = runtime(batch => {
            const data = clean(batch), id = data.checkedClaims[0].id;
            data.checkedClaims[0].status = 'problem';
            data.issues = [{ id: 'f', field, claimIds: [id], problem: 'Il soggetto dello scambio è invertito.',
                evidenceKind: 'source', sourceId: material.sourcesArr[0].id, quote: GOLD, replacement: GOLD }];
            return response(data);
        });
        const report = await r.check(items);
        assert.equal(report.checkStatus, field === 'answer' ? 'completed' : 'incomplete');
        assert.equal(report.issues.length, field === 'answer' ? 1 : 0);
    }
});
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
    const r = runtime(batch => response({ ...clean(batch), checkedIds: ['mc'], mcOptions: [{ id: 'mc', indices: [0] }], issues: [] }));
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
    const r = runtime(batch => response({ ...clean(batch, input), issues: [wrongGuide('q', { quote: onlyNode, sourceId: input.sourcesArr[0].id })] }));
    const invalid = await r.check([{ ...open('q'), guide: WRONG }], { material: input.material });
    assert.equal(invalid.issues.length, 0);
    assert.equal(invalid.rejected.length, 1);
    assert.equal(invalid.checkStatus, 'incomplete');
    const good = runtime(batch => response({ ...clean(batch, input), issues: [wrongGuide('q', { sourceId: input.sourcesArr[0].id })] }));
    const valid = await good.check([{ ...open('q'), guide: WRONG }], { material: input.material });
    assert.equal(valid.checkStatus, 'completed');
    assert.equal(valid.issues[0].evidence[0].page, 5);
});

test('causal evidence must come from one exact field, not a reconstructed relation', async () => {
    const item = { id: 'causal', kind: 'causal', question: 'mancanza di cibo', text: 'quindi',
        answer: 'Tuttavia, per evitare conflitti con la Germania' };
    for (const quote of [[item.question, item.text, item.answer].join(' '), item.answer]) {
        const r = runtime(batch => response({ ...clean(batch), issues: [{ id: item.id, field: '$item',
            problem: 'Due motivi paralleli sono presentati come causa e conseguenza.',
            evidenceKind: 'item', quote, exclude: true }] }));
        const report = await r.check([item]);
        if (quote === item.answer) {
            assert.equal(report.checkStatus, 'completed');
            assert.equal(report.issues[0].evidence[0].text, item.answer);
            assert.equal(report.issues[0].evidence[0].field, 'answer');
            assert.equal(report.issues[0].after, null);
        } else {
            assert.equal(report.checkStatus, 'incomplete');
            assert.equal(report.issues.length, 0);
            assert.equal(report.coverage.checkedIds.length, 0);
            assert.equal(report.rejected.length, 1);
        }
    }
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
    const r = runtime(batch => response({ ...clean(batch, reference), issues: [wrongGuide('q', {
        sourceId: reference.sourcesArr[0].id, quote: 'Germania vende oro alla Svizzera'
    })] }));
    const report = await r.check([{ ...open('q'), guide: WRONG }], { material: reference });
    assert.equal(report.issues[0].evidence[0].text, 'Germania vende\n oro\talla Svizzera');
    assert.ok(original.includes(report.issues[0].evidence[0].text));
});

test('raw source anchors require an existing registry, preserve exact text, and are never silently removed', async () => {
    const source = { id: 'src-original', idx: 1, text: GOLD, page: 5 };
    const item = { id: 'intro', kind: 'synthesis', text: 'Il commercio continuò [[src-original]].', citations: [source] };
    const r = runtime();
    assert.equal(r.w.MappAIMaterialReview.validate([item]).ok, true);
    assert.equal((await r.check([item])).issues.length, 0);
    const missing = { ...item, text: 'Il commercio continuò [[src-unknown]].' };
    const report = await r.check([missing]);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].hasProposal, false);
    assert.match(report.issues[0].problem, /src-unknown/);
    assert.equal(missing.text, 'Il commercio continuò [[src-unknown]].');
});

test('legacy raw IDs resolve globally across item registries while numeric references remain strictly local', async () => {
    const section = { id: 'section', kind: 'synthesis', text: 'Gli scambi continuarono [1].',
        citations: [{ id: 'src-trade', idx: 1, text: GOLD }] };
    const legacy = { id: 'intro', kind: 'synthesis', text: 'Gli scambi continuarono [[src-trade]].', citations: [] };
    const r = runtime();
    const before = plain([legacy, section]);
    assert.equal(r.w.MappAIMaterialReview.validate([legacy, section]).ok, true);
    assert.equal((await r.check([legacy, section])).issues.length, 0);
    assert.deepEqual([legacy, section], before, 'legacy registries and revisions are not changed');
    const numeric = { ...legacy, text: 'Gli scambi continuarono [1].' };
    const invalid = r.w.MappAIMaterialReview.validate([numeric, section]);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.issues.length, 1);
    assert.equal(invalid.issues[0].target.id, 'intro');
    assert.match(invalid.issues[0].problem, /\[1\]/);
});

test('processing metatext is a manual editorial finding even offline, not an unwaivable structural gate', async () => {
    const item = { ...mc('meta'), explanation: 'La rettifica del docente e il testo definiscono i pieni poteri.' };
    const r = runtime();
    const before = plain(item);
    const report = await r.check([item], { apiKey: '' });
    assert.equal(report.issues.length, 1);
    const finding = report.issues[0];
    assert.equal(finding.check, 'processing-metatext');
    assert.equal(finding.type, 'editorial');
    assert.equal(finding.hasProposal, false);
    assert.equal(finding.evidence[0].text, 'rettifica del docente');
    assert.equal(finding.evidence[0].verifiedAgainst, 'item');
    assert.equal(r.w.MappAIMaterialReview.validate([item]).ok, true);
    assert.deepEqual(item, before);
    assert.equal(r.calls.length, 0);

    const kept = approvedDecision(finding.id, { kind: 'item', id: item.id, field: 'explanation' }, item.explanation, item.explanation, 'reject', finding.evidence);
    const replay = await r.check([item], { review: kept });
    assert.equal(replay.issues.length, 0);
    assert.equal(replay.suppressed.length, 1);
    assert.equal(r.calls.length, 1, 'keeping a flag does not trigger proposal recovery');
    const ordinary = { ...mc('control'), explanation: 'Il docente insegna storia. Il giudice esaminò le accuse.' };
    assert.equal((await r.check([ordinary])).issues.length, 0, 'ordinary words are not processing metatext');
});

for (const choice of ['reject', 'accept', 'manual', undefined]) {
    test(`${choice}: a kept or unchanged decision cannot ground a new correction`, async () => {
        const after = choice === 'reject' || choice === undefined ? GOLD : WRONG;
        const review = approvedDecision('kept', { kind: 'node', id: 'node', field: 'desc' }, WRONG, after, choice);
        if (choice === undefined) delete review.overrides[0].choice;
        const r = runtime((batch, payload) => {
            assert.match(payload.contents[0].parts[0].text, /"issueId":"kept"/, 'audit decisions remain in the prompt');
            return response({ ...clean(batch), issues: [wrongGuide('new', {
                evidenceKind: 'teacher', decisionId: 'kept', quote: after
            })] });
        });
        const report = await r.check([{ ...open('new'), guide: WRONG }], { review });
        assert.equal(report.issues.length, 0);
        assert.equal(report.rejected.length, 1);
        assert.equal(report.checkStatus, 'incomplete');
        assert.equal(r.calls.length, 1, 'unverified teacher authority never reaches recovery');
    });
}

test('a real teacher amendment containing a list supplies evidence without narrowing authority to strings', async () => {
    const review = approvedDecision('list', { kind: 'item', id: 'old', field: 'criteria' }, ['Indica la Svizzera.'], [GOLD], 'accept');
    const r = runtime(batch => response({ ...clean(batch), issues: [wrongGuide('new', {
        evidenceKind: 'teacher', decisionId: 'list', quote: GOLD
    })] }));
    const report = await r.check([{ ...open('new'), guide: WRONG }], { review });
    assert.equal(report.issues[0].evidence[0].verifiedAgainst, 'teacher-decision');
    assert.equal(report.issues[0].after, GOLD);
});

test('source-backed manual findings obtain one optional patch through the same Gemini gateway', async () => {
    const original = 'Il 30 agosto 1939 l’Assemblea Federale elesse Guisan e accordò pieni poteri al Consiglio Federale.';
    const reference = G.buildInput({}, [], [{ title: 'Documento originale', pages: [{ n: 1, text: original }, { n: 6, text: ACCUSATION }] }]);
    const item = { id: 'synthesis-intro', kind: 'synthesis', text: 'Il governo ricevette i pieni poteri e nominò Guisan generale.', citations: [] };
    const finding = { id: item.id, field: 'text', problem: 'Il testo attribuisce al governo anche la nomina del generale.',
        evidenceKind: 'source', sourceId: reference.sourcesArr[0].id, quote: original };
    const r = throughGeminiGateway((batch, payload, call) => {
        assertStructuredSubset(payload.generationConfig.responseSchema);
        assert.doesNotMatch(JSON.stringify(payload.generationConfig.responseSchema), /maxItems/);
        if (call === 1) return response({ ...clean(batch, reference), issues: [finding] });
        const prompt = payload.contents[0].parts[0].text;
        assert.match(prompt, /RECUPERO DI PROPOSTE/);
        assert.match(prompt, /NON certifica la correttezza semantica/);
        assert.ok(prompt.includes(original));
        assert.ok(!prompt.includes(ACCUSATION), 'an unrelated original passage is not sent to recovery');
        assert.deepEqual(plain(payload.generationConfig.responseSchema.properties.decisions.items.required), ['issueId', 'action', 'reason']);
        return response({ decisions: [recoveryChoice(payload, 0, { action: 'replace',
            replacement: 'L’Assemblea Federale elesse Guisan generale e accordò pieni poteri al Consiglio Federale.' })] });
    });
    const before = plain(item);
    const report = await r.check([item], { material: reference });
    assert.equal(r.posts.length, 2);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].hasProposal, true);
    assert.match(report.issues[0].after, /^L’Assemblea Federale/);
    assert.equal(report.issues[0].proposalValidation, 'target-evidence-structure');
    assert.equal(report.batches[0].proposalRecovery.semanticsVerified, false);
    assert.deepEqual(plain(report.coverage.checkedIds), [item.id]);
    assert.deepEqual(item, before, 'proposal recovery never edits a draft');
});

test('recovery may propose explicit causal exclusion but never fabricates one from a missing repair', async () => {
    const item = { id: 'parallel', kind: 'causal', question: 'mancanza di cibo', text: 'quindi', answer: 'Tuttavia, per evitare conflitti con la Germania' };
    const finding = { id: item.id, field: 'answer', problem: 'La prima e la seconda parte esprimono due motivi paralleli, non causa e conseguenza.',
        evidenceKind: 'item', quote: item.answer };
    for (const propose of [true, false]) {
        const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [finding] } : {
            decisions: [recoveryChoice(payload, 0, { action: propose ? 'exclude' : 'needs_teacher' })]
        }));
        const report = await r.check([item]);
        assert.equal(r.calls.length, 2);
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].hasProposal, propose);
        assert.equal(report.issues[0].target.field, propose ? '$item' : 'answer');
        assert.equal(report.issues[0].after, null);
        if (propose) assert.deepEqual(plain(report.issues[0].before), item);
        else assert.equal(report.batches[0].proposalRecovery.unresolvedIds.length, 1);
    }
});

for (const mode of ['failure', 'truncated', 'no-op', 'foreign-target', 'different-field', 'different-proof', 'different-problem', 'broken-text', 'coverage-inflation']) {
    test(`recovery ${mode} keeps the manual finding and the original incomplete coverage`, async () => {
        const finding = wrongGuide('q'); delete finding.replacement;
        const r = runtime((batch, payload, call) => {
            if (call === 1) return response({ ...clean(batch), checkedIds: ['q'], mcOptions: [], issues: [finding] });
            if (mode === 'failure') throw new Error('Recupero offline');
            const proposal = recoveryChoice(payload, 0, { action: 'replace', replacement: GOLD });
            if (mode === 'no-op') proposal.replacement = WRONG;
            if (mode === 'foreign-target') proposal.issueId = 'other';
            if (mode === 'different-field') proposal.field = 'question';
            if (mode === 'different-proof') proposal.quote = 'La Germania';
            if (mode === 'different-problem') proposal.problem = 'Una nuova obiezione non richiesta.';
            if (mode === 'broken-text') proposal.replacement = GOLD + '\uFFFD';
            const answer = { decisions: [proposal], ...(mode === 'coverage-inflation' ? { checkedIds: ['q', 'unchecked'] } : {}) };
            return response(answer, mode === 'truncated' ? 'MAX_TOKENS' : 'STOP');
        });
        const report = await r.check([{ ...open('q'), guide: WRONG }, flash('unchecked')]);
        assert.equal(r.calls.length, 2, 'there is no retry of a recovery attempt');
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].hasProposal, false);
        assert.equal(report.issues[0].after, null);
        assert.equal(report.issues[0].problem, finding.problem);
        assert.equal(report.issues[0].evidence[0].text, GOLD);
        assert.equal(report.checkStatus, 'incomplete');
        assert.deepEqual(plain(report.coverage.checkedIds), ['q']);
        assert.deepEqual(plain(report.coverage.skipped.map(i => i.id)), ['unchecked']);
        assert.equal(report.batches[0].proposalRecovery.unresolvedIds.length, 1);
    });
}

test('one recovery request per original batch, even with twelve unresolved findings', async () => {
    const r = runtime((batch, payload) => {
        if (/^RECUPERO DI PROPOSTE/.test(payload.contents[0].parts[0].text)) return response({ decisions: recoveryRows(payload).map((_, n) => recoveryChoice(payload, n)) });
        return response({ ...clean(batch), issues: batch.map(item => ({ id: item.id, field: 'answer',
            problem: 'Il soggetto dell’azione è invertito.', evidenceKind: 'source', quote: GOLD })) });
    });
    const report = await r.check(Array.from({ length: 13 }, (_, n) => ({ ...flash('f' + n), answer: WRONG })));
    assert.equal(r.calls.length, 4, 'two reviews plus two recovery calls, not a call for every issue');
    assert.equal(report.issues.length, 13);
    assert.equal(report.coverage.checkedIds.length, 13);
    assert.deepEqual(plain(report.batches.map(b => b.proposalRecovery.requestedIds.length)), [12, 1]);
    assert.ok(report.issues.every(i => !i.hasProposal));
});

test('duplicate recovery proposals cannot resolve one finding twice or erase another concern', async () => {
    const first = wrongGuide('q'); delete first.replacement;
    const second = { ...first, problem: 'La guida contiene inoltre una conclusione da verificare.' };
    const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [first, second] } : {
        decisions: [recoveryChoice(payload, 0, { action: 'replace', replacement: GOLD }), recoveryChoice(payload, 0, { action: 'replace', replacement: GOLD })]
    }));
    const report = await r.check([{ ...open('q'), guide: WRONG }]);
    assert.equal(report.issues.length, 2);
    assert.ok(report.issues.every(i => !i.hasProposal));
    assert.equal(report.batches[0].proposalRecovery.proposedIds.length, 0);
    assert.equal(report.batches[0].proposalRecovery.unresolvedIds.length, 2);
    assert.equal(r.calls.length, 2);
});

test('recovery cannot introduce an unknown numbered citation while correcting a factual claim', async () => {
    const item = { id: 'text', kind: 'synthesis', text: WRONG + ' [1]', citations: [{ id: material.sourcesArr[0].id, idx: 1, text: GOLD }] };
    const finding = { ...wrongGuide(item.id), field: 'text' }; delete finding.replacement;
    const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [finding] } : {
        decisions: [recoveryChoice(payload, 0, { action: 'replace', replacement: GOLD + ' [2]' })]
    }));
    const report = await r.check([item]);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].hasProposal, false);
    assert.equal(report.batches[0].proposalRecovery.rejected.length, 1);
    assert.equal(report.checkStatus, 'completed', 'failed repair is distinct from coverage of the initial check');
});

test('documented factual contrasts and causal controls reach the model with general review instructions', async () => {
    // The mocked reviewer tests the context/acceptance contract, not model
    // recall or precision. Expected findings are never placed in its prompt.
    const sourceTexts = [
        'Il commercio con gli Alleati, in particolare con gli USA, continuò.',
        'Queste accuse sono state esaminate dalla commissione Bergier. Il rapporto confermò che molte migliaia di ebrei si videro negare l’accesso in Svizzera.',
        'Il piano Wahlen prevedeva l’estensione della campicoltura e un sistema di razionamento per assicurare sufficienti provvigioni di cibo.',
        'Buona parte dell’oro tedesco era frutto di rapina, come quello sottratto alle vittime dei campi di concentramento.'
    ];
    const reference = G.buildInput({}, [], [{ title: 'Fonte didattica', pages: sourceTexts.map((text, n) => ({ n: n + 1, text })) }]);
    const items = [
        { id: 'absence', kind: 'synthesis', text: 'Il materiale non contiene informazioni su scambi commerciali con i Paesi Alleati.' },
        { id: 'accusations', kind: 'synthesis', text: 'La commissione esaminò tutte le accuse e confermò i fatti.' },
        { ...mc('meals'), explanation: 'Il razionamento serviva a garantire pasti equilibrati a tutti.' },
        { id: 'gold-control', kind: 'causal', question: 'I nazisti avevano sottratto oro alle vittime', text: 'quindi', answer: 'Quell’oro era frutto di rapina' },
        { id: 'source-control', kind: 'synthesis', text: sourceTexts[0] }, open('short-control')
    ];
    const findings = [
        { id: 'absence', field: 'text', problem: 'La fonte descrive scambi che il testo dichiara assenti.', replacement: sourceTexts[0] },
        { id: 'accusations', field: 'text', problem: 'Esaminare tutte le accuse non significa confermarle tutte.', replacement: sourceTexts[1] },
        { id: 'meals', field: 'explanation', problem: 'Il testo aggiunge una garanzia universale non attestata dalla fonte.', replacement: sourceTexts[2] }
    ].map((f, n) => ({ ...f, evidenceKind: 'source', sourceId: reference.sourcesArr[n].id, quote: sourceTexts[n] }));
    const r = runtime((batch, payload) => {
        const prompt = payload.contents[0].parts[0].text;
        for (const text of sourceTexts) assert.ok(prompt.includes(text), 'all pertinent originals must be available, including the counterexample to absence');
        for (const rule of [/NEGATIVE o di ASSENZA/, /non equivale a confermarle tutte/, /risultato sia stato garantito a tutti/,
            /non chiamare "inversione causale"/, /due motivi paralleli/, /senza nomi di campi JSON/]) assert.match(prompt, rule);
        assert.doesNotMatch(prompt, /expectedFindings/);
        return response({ ...clean(batch, reference), issues: findings });
    });
    const report = await r.check(items, { material: reference });
    assert.equal(report.issues.length, 3);
    assert.ok(report.issues.every(i => ['absence', 'accusations', 'meals'].includes(i.target.id)));
    assert.equal(report.checkStatus, 'completed');
    assert.equal(r.calls.length, 1, 'ready patches and controls need no recovery');
});

test('explicit Google Gemini 3.8 review context requests medium for both calls without changing other models or providers', async () => {
    const contexts = [
        { provider: 'google', model: 'gemini-3.8-flash', expected: 'medium' },
        { provider: 'google', model: 'gemini-3.8-flash-preview', expected: 'medium' },
        { provider: 'google', model: 'gemini-2.5-flash' },
        { provider: 'infomaniak', model: 'gemini-3.8-flash' },
        { provider: 'infomaniak', model: 'google/gemma-4-31B-it' }, undefined
    ];
    const finding = wrongGuide('q'); delete finding.replacement;
    for (const context of contexts) {
        const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [finding] } : {
            decisions: [recoveryChoice(payload, 0)]
        }));
        r.w.appState = { _reviewAIContext: { provider: 'google', model: 'gemini-3.8-flash' } };
        await r.check([{ ...open('q'), guide: WRONG }], { aiContext: context });
        assert.equal(r.calls.length, 2);
        for (const { payload } of r.calls) {
            assert.equal(payload.generationConfig.thinkingConfig?.thinkingLevel, context?.expected);
            assert.equal(payload.generationConfig.maxOutputTokens, context?.expected === 'medium' ? 24576 : 6000);
            assertStructuredSubset(payload.generationConfig.responseSchema);
            assert.doesNotMatch(JSON.stringify(payload.generationConfig.responseSchema), /maxItems/);
        }
    }
    const gateway = throughGeminiGateway((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [finding] } : {
        decisions: [recoveryChoice(payload, 0)]
    }));
    await gateway.check([{ ...open('q'), guide: WRONG }], { aiContext: { provider: 'google', model: 'gemini-3.8-flash' } });
    assert.equal(gateway.posts.length, 2);
    assert.ok(gateway.posts.every(p => p.payload.generationConfig.thinkingConfig.thinkingLevel === 'medium'), 'the actual gateway preserves explicit review thinking');
    assert.ok(gateway.posts.every(p => p.payload.generationConfig.maxOutputTokens === 24576), 'thought tokens leave room for the review report');
    const larger = runtime();
    larger.w.getMaxOutputTokens = () => 32768;
    await larger.check([flash('f')], { aiContext: { provider: 'google', model: 'gemini-3.8-flash' } });
    assert.equal(larger.calls[0].payload.generationConfig.maxOutputTokens, 32768, 'do not reduce an existing larger budget');
});

test('captured medium-thinking truncation never certifies the ten declared IDs as checked', async () => {
    const ids = ['synthesis-intro', 'synthesis-0', 'synthesis-3', 'synthesis-causal-3-0', 'synthesis-causal-3-1',
        'set_1789245120871_heux1-10', 'set_1789245129036_raq3i-0', 'set_1789245147366_iz7hp-5',
        'set_1789245120871_heux1-1', 'set_1789245147366_iz7hp-7'];
    // The captured response declared all IDs, then ended inside its first
    // quotation. 11,519 thought tokens consumed almost all of the 12k budget.
    const raw = JSON.stringify({ checkedIds: ids, mcOptions: [], issues: [] }).replace(/\[\]\}$/, '[') +
        '{"id":"synthesis-intro","field":"text","problem":"La prima parte del testo attribuisce erroneamente al governo la nomina del generale Guisan, mentre la fonte originale attesta che fu l’Assemblea Federale a eleggerlo.","evidenceKind":"source","quote":"Il 30 agosto 1939 l’Assemblea Federale elesse Guisan e accordò pieni pot';
    const captured = { ...response(raw, 'MAX_TOKENS'), usageMetadata: {
        promptTokenCount: 21930, candidatesTokenCount: 467, thoughtsTokenCount: 11519, totalTokenCount: 33916
    } };
    const r = runtime(() => captured);
    const report = await r.check(ids.map(id => flash(id)), { aiContext: { provider: 'google', model: 'gemini-3.8-flash' } });
    assert.equal(report.checkStatus, 'incomplete');
    assert.equal(report.coverage.checkedIds.length, 0);
    assert.equal(report.coverage.skipped.length, 10);
    assert.equal(report.issues.length, 0);
    assert.equal(r.calls.length, 1, 'do not create a new review cycle to hide truncation');
});

test('captured live findings: repeated issues without actions stay manual; explicit choices recover without duplicate metatext', async () => {
    // Verbatim problems/quotes from eval-response-1/2.json (13 September).
    // Replay tests output handling; these are not expected findings sent to AI.
    const restriction = 'Dopo il 1940 la  volontà di evitare conflitti con i nuovi padroni dell’Europa (..................... ............................), la  precaria situazione alimentare e l’isolamento spinsero le autorità della Confederazione  e dei Cantoni a porre   restrizioni all’afflusso di profughi .';
    const gold = 'Buona parte dell’ oro tedesco,  infatti,   era   frutto   di   rapina,   come   quello   sottratto   alle   vittime   dei   campi   di  concentramento.';
    const metaText = "La rettifica del docente e il testo definiscono i pieni poteri come il comando totale o l'autorizzazione speciale data al Consiglio Federale per agire rapidamente ed efficacemente durante la guerra.";
    const items = [
        { id: 'synthesis-causal-3-0', kind: 'causal', question: 'mancanza di cibo', text: 'quindi', answer: 'Tuttavia, per evitare conflitti con la Germania' },
        { id: 'synthesis-causal-3-1', kind: 'causal', question: 'i nazisti lo avevano sottratto alle vittime dei campi di concentramento', text: 'quindi', answer: 'Buona parte di questo metallo prezioso tedesco era frutto di rapina' },
        { ...mc('set_1789245120871_heux1-10'), explanation: metaText }
    ];
    const captured = [
        { id: items[0].id, field: '$item', type: 'coherence', evidenceKind: 'source', sourceId: 'src-9tkozq', quote: restriction,
            problem: "La relazione causale è priva di senso logico e storico: la mancanza di cibo non è causa dell'evitare conflitti con la Germania, che è invece una congiunzione coordinata di motivi concorrenti per le restrizioni." },
        { id: items[1].id, field: '$item', type: 'semantic', evidenceKind: 'source', sourceId: 'src-1luewma', quote: gold,
            problem: "La catena presenta una definizione o spiegazione ('frutto di rapina') come conseguenza di un'azione ('sottratto alle vittime'), frammentando lo stesso predicato esplicativo anziché esprimere un reale nesso causa-effetto." },
        { id: items[2].id, field: 'explanation', type: 'editorial', evidenceKind: 'item', quote: metaText,
            problem: "La spiegazione contiene un chiaro riferimento metatestuale alla lavorazione ('La rettifica del docente'), non idoneo al testo rivolto allo studente." }
    ];
    const reference = { material: restriction + '\n' + gold, sourcesArr: [
        { id: 'src-9tkozq', title: 'Fonte', page: 6, text: restriction }, { id: 'src-1luewma', title: 'Fonte', page: 5, text: gold }
    ] };
    for (const explicit of [false, true]) {
        const r = runtime((batch, payload, call) => {
            if (call === 1) return response({ ...clean(batch, reference), issues: captured });
            if (!explicit) return response({ checkedIds: [], mcOptions: [], issues: captured.slice(0, 2) });
            return response({ decisions: [
                recoveryChoice(payload, 0, { action: 'exclude', reason: 'I due motivi paralleli non formano questa relazione causale.' }),
                recoveryChoice(payload, 1, { action: 'needs_teacher', reason: 'La deduzione è coerente; la sua utilità didattica richiede una scelta del docente.' }),
                recoveryChoice(payload, 2, { action: 'replace', reason: 'La spiegazione può iniziare direttamente dalla definizione.',
                    replacement: metaText.replace('La rettifica del docente e il testo definiscono', 'Il testo definisce') })
            ] });
        });
        const report = await r.check(items, { material: reference });
        assert.equal(r.calls.length, 2);
        assert.equal(report.issues.length, 3, 'the captured model metatext finding merges with the local one');
        const meta = report.issues.find(i => i.check === 'processing-metatext');
        assert.equal(meta.alsoReportedByModel, true);
        assert.equal(meta.hasProposal, explicit);
        assert.equal(report.issues.filter(i => i.hasProposal).length, explicit ? 2 : 0);
        assert.equal(report.batches[0].proposalRecovery.requestedIds.length, 3, 'local and model metatext share a single recovery request');
        assert.equal(report.checkStatus, 'completed');
        assert.deepEqual(plain(report.coverage.checkedIds), items.map(i => i.id));
        assert.equal(report.batches[0].proposalRecovery.semanticsVerified, false);
        if (explicit) {
            assert.equal(report.batches[0].proposalRecovery.decisions[1].action, 'needs_teacher');
            assert.equal(report.issues.find(i => i.target.id === items[1].id).hasProposal, false);
        } else assert.equal(report.batches[0].proposalRecovery.status, 'failed', 'the old repetition cannot masquerade as an explicit recovery decision');
    }
});

test('metatext deduplication preserves a distinct factual finding on the same explanation', async () => {
    const original = 'I pieni poteri permettevano al Consiglio Federale di agire rapidamente.';
    const reference = G.buildInput({}, [], [{ title: 'Fonte didattica', text: original }]);
    const item = { ...mc('meta'), question: 'Che cosa permettevano i pieni poteri?', options: ['Agire rapidamente', 'Un comando totale senza limiti'],
        explanation: 'La rettifica del docente e il testo definiscono i pieni poteri come comando totale.' };
    const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch, reference), issues: [
        { id: item.id, field: 'explanation', type: 'editorial', evidenceKind: 'item', quote: item.explanation,
            problem: 'La spiegazione contiene metatesto della lavorazione.' },
        { id: item.id, field: 'explanation', type: 'semantic', evidenceKind: 'source', sourceId: reference.sourcesArr[0].id, quote: original,
            problem: 'La spiegazione usa una definizione più ampia di quella richiesta.' }
    ] } : { decisions: [
        recoveryChoice(payload, 0, { action: 'replace', replacement: original, reason: 'La fonte sostiene questa definizione circoscritta.' }),
        recoveryChoice(payload, 1, { action: 'needs_teacher', reason: 'Valuta il metatesto insieme alla correzione fattuale della stessa spiegazione.' })
    ] }));
    const report = await r.check([item], { material: reference });
    assert.equal(report.issues.length, 2);
    assert.equal(report.issues.filter(i => i.check === 'processing-metatext').length, 1);
    assert.equal(report.issues.filter(i => i.type === 'semantic').length, 1);
    assert.equal(report.issues.find(i => i.type === 'semantic').after, original);
    assert.equal(report.issues.find(i => i.check === 'processing-metatext').hasProposal, false);
    assert.equal(report.batches[0].proposalRecovery.requestedIds.length, 2);
    assert.equal(r.calls.length, 2, 'a separate factual issue on the same field remains eligible for recovery');
});

test('a local metatext-only finding can receive an optional cleanup after a completed AI check and still be kept', async () => {
    const item = { ...mc('meta'), explanation: 'La rettifica del docente e il testo definiscono i pieni poteri come un’autorizzazione speciale.' };
    const cleaned = 'I pieni poteri sono un’autorizzazione speciale.';
    const before = plain(item);
    const r = runtime((batch, payload, call) => {
        if (call === 1) return response(clean(batch));
        assert.equal(recoveryRows(payload).length, 1);
        assert.equal(recoveryRows(payload)[0].evidence[0].verifiedAgainst, 'item');
        assert.match(payload.contents[0].parts[0].text, /pulizia locale basata sul testo dell'item/);
        return response({ decisions: [recoveryChoice(payload, 0, { action: 'replace', replacement: cleaned,
            reason: 'La definizione può essere presentata direttamente allo studente.' })] });
    });
    const report = await r.check([item]);
    assert.equal(r.calls.length, 2);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0].after, cleaned);
    assert.equal(report.issues[0].hasProposal, true);
    assert.equal(report.checkStatus, 'completed');
    assert.deepEqual(item, before, 'cleanup is a proposal, never an automatic deletion');
    const finding = report.issues[0];
    const kept = approvedDecision(finding.id, finding.target, item.explanation, item.explanation, 'reject', finding.evidence);
    const replay = runtime();
    const keptReport = await replay.check([item], { review: kept });
    assert.equal(keptReport.issues.length, 0);
    assert.equal(keptReport.suppressed.length, 1);
    assert.equal(replay.calls.length, 1, 'a conscious decision to keep the wording does not launch another recovery');
});

test('local metatext never starts recovery when the AI check is unavailable, truncated or incomplete', async () => {
    const item = { ...mc('meta'), explanation: 'La rettifica del docente e il testo definiscono i pieni poteri.' };
    for (const mode of ['offline', 'truncated', 'missing-id', 'partial-options']) {
        const r = runtime(batch => {
            const data = clean(batch);
            if (mode === 'missing-id') data.checkedIds = [];
            if (mode === 'partial-options') data.mcOptions[0].indices = [0];
            return response(data, mode === 'truncated' ? 'MAX_TOKENS' : 'STOP');
        });
        const report = await r.check([item], mode === 'offline' ? { apiKey: '' } : {});
        assert.equal(r.calls.length, mode === 'offline' ? 0 : 1, mode);
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].hasProposal, false);
        assert.notEqual(report.checkStatus, 'completed');
        assert.ok(report.batches.every(batch => !batch.proposalRecovery));
    }
});

test('a valid cleanup already returned by the judge is kept on the single local finding without a redundant recovery call', async () => {
    const item = { ...mc('meta'), explanation: 'La rettifica del docente e il testo definiscono i pieni poteri come un’autorizzazione speciale.' };
    const cleaned = 'I pieni poteri sono un’autorizzazione speciale.';
    const before = plain(item);
    const r = runtime(batch => response({ ...clean(batch), issues: [{
        id: item.id, field: 'explanation', type: 'editorial', evidenceKind: 'item', quote: item.explanation,
        problem: 'La spiegazione contiene metatesto della lavorazione.', replacement: cleaned
    }] }));
    const report = await r.check([item]);
    assert.equal(report.issues.length, 1);
    const finding = report.issues[0];
    assert.equal(finding.check, 'processing-metatext');
    assert.equal(finding.alsoReportedByModel, true);
    assert.equal(finding.hasProposal, true);
    assert.equal(finding.after, cleaned);
    assert.equal(finding.before, item.explanation);
    assert.equal(finding.evidence[0].verifiedAgainst, 'item');
    assert.equal(finding.evidence[0].field, finding.target.field);
    assert.equal(finding.proposalOrigin, 'review');
    assert.equal(report.batches[0].proposalRecovery, undefined);
    assert.equal(r.calls.length, 1);
    assert.deepEqual(item, before, 'the valid proposal is preserved but not applied');
});

test('invalid or identical cleanup from the judge never becomes a proposal on the local finding', async () => {
    const item = { ...mc('meta'), explanation: 'La rettifica del docente e il testo definiscono i pieni poteri.' };
    for (const invalid of ['', item.explanation, 'I pieni poteri sono un’autorizzazione speciale.\uFFFD']) {
        const r = runtime((batch, payload, call) => response(call === 1 ? { ...clean(batch), issues: [{
            id: item.id, field: 'explanation', type: 'editorial', evidenceKind: 'item', quote: item.explanation,
            problem: 'La spiegazione contiene metatesto della lavorazione.', replacement: invalid
        }] } : { decisions: [recoveryChoice(payload, 0)] }));
        const report = await r.check([item]);
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].hasProposal, false);
        assert.equal(report.issues[0].after, null);
        assert.equal(report.issues[0].before, item.explanation);
        assert.equal(report.batches[0].proposalRecovery.proposedIds.length, 0);
        assert.equal(r.calls.length, 2, 'at most the existing single recovery is attempted');
    }
});

test('105 drafts: completion retries only the three missing items, retaining decisions and full coverage', async () => {
    const items = Array.from({ length: 105 }, (_, n) => mc('mc-' + n));
    const missing = new Set(['mc-0', 'mc-52', 'mc-104']);
    const first = runtime(batch => {
        const result = clean(batch);
        result.checkedIds = result.checkedIds.filter(id => !missing.has(id));
        if (batch.some(item => item.id === 'mc-1')) result.issues.push({ id: 'mc-1', field: 'explanation',
            problem: 'Verifica il soggetto dello scambio.', evidenceKind: 'source', sourceId: material.sourcesArr[0].id,
            quote: GOLD, replacement: 'La Germania vende oro e riceve valuta.' });
        return response(result);
    });
    const original = plain(items), previousReport = plain(await first.check(items));
    assert.equal(previousReport.coverage.checkedIds.length, 102);
    let review = R.createReview({ db: { items }, report: previousReport });
    review = R.setDecision(review, review.initial.issues[0].id, 'reject');
    const saved = plain(review), savedReport = plain(previousReport), progress = [], second = runtime();
    const report = plain(await second.checkRemaining(items, { previousReport, onProgress: p => progress.push(plain(p)) }));
    assert.equal(second.calls.length, 1);
    assert.deepEqual(report.retrySummary.targetedIds, Array.from(missing));
    assert.equal(report.retrySummary.reused, 102);
    assert.equal(report.retrySummary.checked, 3);
    assert.equal(report.retrySummary.remaining, 0);
    assert.equal(report.retrySummary.mode, 'remaining');
    assert.equal(report.checkStatus, 'completed');
    assert.equal(report.coverage.expectedIds.length, 105);
    assert.equal(new Set(report.coverage.checkedIds).size, 105);
    assert.equal(report.coverage.claims.length, 105);
    assert.equal(report.coverage.mcOptions.length, 105);
    assert.equal(progress[0].total, 3); assert.equal(progress[0].reused, 102);
    const next = R.mergeRetry(review, R.createReview({ db: { items }, report }));
    assert.deepEqual(next.initial.decisions, review.initial.decisions);
    assert.equal(next.initial.issues.length, 1, 'a reused finding does not return as a new decision');
    assert.deepEqual(next.initial.previousReports, [previousReport]);
    assert.deepEqual(items, original); assert.deepEqual(review, saved); assert.deepEqual(previousReport, savedReport);
    const third = runtime();
    const complete = await third.checkRemaining(items, { previousReport: report, apiKey: '' });
    assert.equal(third.calls.length, 0, 'an already completed report requires no provider or key');
    assert.equal(complete.checkStatus, 'completed');
    assert.equal(complete.retrySummary.reused, 105, 'claims survive changed batch positions on subsequent retries');
});

test('retry rechecks every field and MC alternative of a changed item, plus explicit transitive dependencies', async () => {
    const items = [mc('a'), { ...flash('b'), dependsOnItemIds: ['a'] }, { ...flash('c'), dependsOnItemIds: ['b'] }, flash('other')];
    const previousReport = plain(await runtime().check(items));
    const changed = plain(items); changed[0].options[1] = 'La Spagna';
    const r = runtime(batch => {
        assert.deepEqual(batch.map(item => item.id), ['a', 'b', 'c']);
        assert.equal(batch[0].question, items[0].question);
        assert.equal(batch[0].options.length, 4);
        return response(clean(batch));
    });
    const report = await r.checkRemaining(changed, { previousReport });
    assert.equal(report.retrySummary.changed, 3); assert.equal(report.retrySummary.reused, 1);
    assert.equal(report.checkStatus, 'completed');
    const forced = await runtime().checkRemaining(items, { previousReport, changedIds: ['a'] });
    assert.deepEqual(plain(forced.retrySummary.targetedIds), ['a', 'b', 'c']);
    const removed = await runtime().checkRemaining(items.slice(1), { previousReport });
    assert.deepEqual(plain(removed.retrySummary.targetedIds), ['b', 'c']);
    assert.deepEqual(plain(removed.coverage.expectedIds), ['b', 'c', 'other']);
    assert.equal(removed.retrySummary.remaining, 0);
});

test('changing a synthesis section rechecks its composed relations and overview, without unrelated exercises', async () => {
    const items = [{ id: 'intro', kind: 'synthesis', text: GOLD, step: 'D', part: 'intro' },
        { id: 'section', kind: 'synthesis', text: GOLD, step: 'D', part: 0 },
        { id: 'relation', kind: 'causal', question: 'La Germania vende oro.', text: 'perciò', answer: 'Riceve valuta.', step: 'D', part: 0 }, mc('exercise')];
    const previousReport = plain(await runtime().check(items)), changed = plain(items);
    changed[1].text = 'La Germania vende oro alla Svizzera.';
    const report = await runtime().checkRemaining(changed, { previousReport });
    assert.deepEqual(plain(report.retrySummary.targetedIds), ['intro', 'section', 'relation']);
    assert.equal(report.retrySummary.reused, 1); assert.equal(report.checkStatus, 'completed');
    const removed = await runtime().checkRemaining(items.filter(item => item.id !== 'section'), { previousReport });
    assert.deepEqual(plain(removed.retrySummary.targetedIds), ['intro', 'relation']);
});

test('source text, approved teacher context or model changes invalidate all cached coverage; legacy retries are full', async () => {
    const items = [mc('a'), flash('b')], previousReport = plain(await runtime().check(items));
    const changedSource = plain(material); changedSource.sourcesArr[0].text += ' La fonte è stata aggiornata.';
    const reference = approvedDecision('map-fix', { kind: 'node', id: 'oro', field: 'desc' }, WRONG, GOLD);
    for (const options of [{ material: changedSource }, { review: reference }, { aiContext: { provider: 'google', model: 'new-model' } }]) {
        const r = runtime(), report = await r.checkRemaining(items, { previousReport, ...options });
        assert.equal(report.retrySummary.mode, 'full'); assert.equal(report.retrySummary.reason, 'reference-context-changed');
        assert.equal(report.retrySummary.reused, 0); assert.equal(r.calls.length, 1);
    }
    const legacy = plain(previousReport); delete legacy.checkpoint;
    const r = runtime(), report = await r.checkRemaining(items, { previousReport: legacy });
    assert.equal(report.retrySummary.mode, 'full'); assert.equal(report.retrySummary.reason, 'missing-checkpoint');
    assert.equal(report.checkStatus, 'completed'); assert.equal(r.calls.length, 1);
    assert.equal((await r.checkRemaining(items, { previousReport: plain(report) })).retrySummary.reused, 2);
    assert.equal(r.calls.length, 1, 'the full legacy fallback runs only once');
});

test('retry does not trust incomplete claims, alternatives, duplicate IDs or a truncated checkpoint', async () => {
    const items = [mc('a'), flash('b')], baseline = plain(await runtime().check(items));
    for (const mode of ['claim-missing', 'claim-unchecked', 'mc-partial', 'duplicate-checked', 'skipped']) {
        const previousReport = plain(baseline);
        if (mode === 'claim-missing') previousReport.coverage.claims = previousReport.coverage.claims.filter(row => row.itemId !== 'a');
        if (mode === 'claim-unchecked') previousReport.coverage.claims[0].checked = false;
        if (mode === 'mc-partial') previousReport.coverage.mcOptions[0].checked.pop();
        if (mode === 'duplicate-checked') previousReport.coverage.checkedIds.push('a');
        if (mode === 'skipped') previousReport.coverage.skipped.push({ id: 'a', reason: 'Interrupted' });
        const report = await runtime().checkRemaining(items, { previousReport });
        assert.deepEqual(plain(report.retrySummary.targetedIds), ['a'], mode);
        assert.equal(report.retrySummary.reused, 1, mode);
    }
    const invalid = plain(baseline); delete invalid.coverage.claims;
    assert.equal((await runtime().checkRemaining(items, { previousReport: invalid })).retrySummary.reused, 0);
    invalid.coverage.claims = [null];
    assert.equal((await runtime().checkRemaining(items, { previousReport: invalid })).retrySummary.reused, 0);
});

test('a later retry failure keeps earlier coverage and only failed items remain retryable', async () => {
    const items = Array.from({ length: 40 }, (_, n) => mc('q-' + n));
    const first = runtime(batch => response({ ...clean(batch), checkedIds: batch.filter(item => Number(item.id.slice(2)) < 13).map(item => item.id) }));
    const previousReport = plain(await first.check(items));
    const second = runtime((batch, payload, call) => {
        if (call === 2) throw new Error('Provider offline');
        return response(clean(batch));
    });
    const failed = plain(await second.checkRemaining(items, { previousReport }));
    assert.equal(failed.checkStatus, 'incomplete');
    assert.equal(failed.retrySummary.reused, 13);
    assert.equal(failed.retrySummary.checked, 15);
    assert.equal(failed.retrySummary.remaining, 12);
    assert.equal(failed.coverage.checkedIds.length, 28);
    assert.equal(failed.coverage.skipped.length, 12);
    const third = runtime(), completed = await third.checkRemaining(items, { previousReport: failed });
    assert.equal(third.calls.length, 1);
    assert.deepEqual(plain(completed.retrySummary.targetedIds), failed.coverage.skipped.map(row => row.id));
    assert.equal(completed.retrySummary.reused, 28);
    assert.equal(completed.checkStatus, 'completed');
});

test('empty retry needs no provider; absent original sources and invalid input never become completed coverage', async () => {
    const r = runtime(), empty = await r.checkRemaining([], { apiKey: '' });
    assert.equal(empty.checkStatus, 'completed'); assert.equal(empty.retrySummary.remaining, 0);
    assert.equal(r.calls.length, 0);
    const items = [mc('a')], reference = { material: 'Descrizione generata senza passaggi originali.', sourcesArr: [] };
    const first = runtime(batch => response(clean(batch))), previousReport = plain(await first.check(items, { material: reference }));
    const retry = await first.checkRemaining(items, { previousReport, material: reference });
    assert.equal(retry.checkStatus, 'incomplete'); assert.equal(retry.retrySummary.reused, 0);
    assert.notEqual((await r.checkRemaining(null)).checkStatus, 'completed');
});
