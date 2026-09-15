'use strict';
// Real public Pipeline.run + Review controller/Core. Only UI display, model
// responses, document builders and Electron transport are replaced; no private
// pipeline methods are called and no provider/network/filesystem write occurs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PC = require('../public/js/mappai-pipeline-core.js');
const RC = require('../public/js/mappai-review-core.js');
const MR = require('../public/js/mappai-material-review.js');
const copy = x => JSON.parse(JSON.stringify(x));
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const GOLD = 'La Germania vende oro alla Svizzera e riceve valuta dalla Banca Nazionale Svizzera.';
const WRONG = 'La Svizzera vende oro alla Germania e riceve valuta dalla Banca Nazionale Svizzera.';
const FLASH_FIXED = GOLD + ' Il docente conferma il soggetto.';
const SUMMARY_FIXED = GOLD + ' Questa è la panoramica rivista.';
const PDF = Buffer.from('%PDF-1.4\n' + 'test-placeholder '.repeat(30)).toString('base64');
const config = all => ({ quiz: { types: all ? ['mc', 'flashcards', 'open'] : ['mc', 'flashcards'], perBranch: 1, angle: 'auto' },
    synthesis: { audio: true }, nodesheet: all ? { modes: ['card'], fmt: '2x2', maxLevel: 'all' } : null,
    causal: all ? {} : null, tuned: false });
function dom() {
    const elements = new Map();
    const element = () => ({ style: {}, classList: { add() {}, remove() {} },
        remove() { elements.delete(this.id); }, querySelector() { return {}; }, querySelectorAll() { return []; } });
    return { getElementById: id => elements.get(id) || null, createElement: element,
        body: { appendChild(el) { elements.set(el.id, el); } } };
}
function runtime(opts = {}) {
    const log = { calls: { map: 0, mc: 0, flash: 0, open: 0, synthesis: 0, nodeDraft: 0, nodeExport: 0, chains: 0, judge: 0, audio: 0 },
        writes: [], pdfs: [], quiz: [], flash: [], open: [], synth: [], nodes: [], chains: [], opened: [], toasts: [], errors: [], tuning: [], modelContexts: [], openPrompts: [], mcRequests: [] };
    const db = { nodes: [{ id: 'root', level: 0, label: 'Svizzera', desc: GOLD },
        { id: 'gold', level: 1, group: 1, label: 'Oro e valuta', desc: GOLD }],
        links: [{ source: 'root', target: 'gold', rel: 'include' }],
        sourcesDict: { gold: [{ title: 'Fonte', source: 'pagina 5', page: 5, text: GOLD, verbatim: true }] }, studySets: [] };
    for (let i = 0; i < 3; i++) {
        db.nodes.push({ id: 'detail-' + i, label: 'Dettaglio ' + i, level: 2, group: 1, desc: GOLD });
        db.links.push({ source: 'gold', target: 'detail-' + i, rel: 'include' });
    }
    const state = { db, sources: [{ id: 'pdf', title: 'Fonte', pages: [{ n: 5, text: GOLD }] }],
        rootNodeLabel: 'Svizzera', extractionMode: 'mindmap', activeVaultPath: '/fake/Generico/Svizzera',
        _generationId: 'fixture-generation', _judgeReport: { checkStatus: 'completed', issues: [] } };
    let disk = null, mapOnDisk = copy(db), failure = null;
    let activeModel = 'gemini-original', activeTuning = { classId: '4R', nome: '4R', disc: 'Storia' };
    const document = dom(), findElement = document.getElementById;
    document.getElementById = id => id === 'model-select' ? { value: activeModel } : findElement(id);
    const context = vm.createContext({ appState: state, console: { info() {}, log() {}, warn() {}, error(...args) { log.errors.push(args.map(String).join(' ')); } },
        document, localStorage: { getItem() { return null; }, setItem() {} },
        setTimeout, clearTimeout, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'),
        FileReader: class { readAsDataURL() { this.result = 'data:audio/mpeg;base64,QUJDRA=='; this.onload(); } } });
    context.window = context;
    Object.assign(context, {
        MappAIPipelineCore: PC, MappAIReviewCore: RC,
        MappAIFilesCore: require('../public/js/mappai-files-core.js'),
        MappAIGroundingCore: require('../public/js/mappai-grounding-core.js'),
        MappAIMaterialDrafts: require('../public/js/mappai-material-drafts.js'),
        MappAITune: { congela(snapshot) { const selected = copy(snapshot || activeTuning); log.tuning.push(selected); return selected; }, scongela() {}, armLevel() {}, disarmLevel() {} },
        salvageTruncatedJSON: require('../public/js/mappai-json-salvage.js').salvage,
        getMaxOutputTokens: n => n, getSystemKey: () => 'mock-key', getDescendants: () => [],
        showToast: (message, type) => log.toasts.push({ message, type }),
        fillPromptTemplate: key => key,
        buildVaultMapData: () => Object.assign(copy(state.db), { reviewRevision: state._reviewRevision, reviewCommit: state._reviewCommit }),
        startGeneration: async () => { log.calls.map++; },
        generateDynamicQuiz: async args => {
            log.mcRequests.push(copy(args));
            log.modelContexts.push(copy(state._reviewAIContext || null));
            log.calls.mc++; assert.match(args.material, /PASSAGGI ORIGINALI/);
            return [{ q: 'Chi riceve valuta dalla vendita di oro?', options: ['La Germania', 'La Svizzera', 'La Francia'], correct: 'La Svizzera', explanation: GOLD }];
        },
        fetchModelAPI: async payload => {
            log.modelContexts.push(copy(state._reviewAIContext || null));
            if (payload.generationConfig.responseSchema.items.properties.domanda) {
                log.calls.open++;
                log.openPrompts.push(payload.contents[0].parts[0].text);
                if (opts.openItems) return { candidates: [{ content: { parts: [{ text: JSON.stringify(opts.openItems) }] } }] };
                return { candidates: [{ content: { parts: [{ text: JSON.stringify([{ domanda: 'Spiega lo scambio fra oro e valuta.', traccia: GOLD, righe: 4, aree: ['Oro e valuta'], livello: 'base' }]) }] } }] };
            }
            log.calls.flash++;
            assert.equal(payload.generationConfig.responseSchema.items.properties.front.type, 'STRING');
            return { candidates: [{ content: { parts: [{ text: JSON.stringify([{ front: 'Chi vende oro?', back: WRONG }]) }] } }] };
        },
        buildQuizSetHtml: set => { log.quiz.push(copy(set)); return 'quiz:' + JSON.stringify(set); },
        buildFlashcardSetHtml: set => { log.flash.push(copy(set)); return 'flash:' + JSON.stringify(set); },
        buildOpenQuestionsHtml: set => { log.open.push(copy(set)); return 'open:' + JSON.stringify(set); },
        printAllNodeLabels: async args => {
            if (args.draftOnly) { log.calls.nodeDraft++; return { ok: true, cards: [{ id: 'gold', label: 'Oro e valuta', desc: GOLD, layout: args.layout }] }; }
            log.calls.nodeExport++; assert.ok(Array.isArray(args.cards), 'export must receive the cached cards');
            log.nodes.push(copy(args.cards)); return { ok: true, base64: PDF };
        },
        MappAISynthesis: {
            runWholeMap: async () => { log.calls.synthesis++; return { whole: true, intro: WRONG, sections: [{ branchLabel: 'Oro e valuta', rawText: GOLD, sourcesArr: [] }] }; },
            buildHtml: (data, options) => { log.synth.push({ data: copy(data), audio: !!(options && options.audioDataUri) }); return 'synthesis:' + JSON.stringify(data); },
            generateAudio: async data => { log.calls.audio++; assert.equal(data.intro, SUMMARY_FIXED); return { blob: {}, mime: 'audio/mpeg', cues: [] }; }
        },
        MappAICausal: {
            chainsForOutput: () => { log.calls.chains++; return { total: 1, rootItems: [{ cause: 'Vendita di oro tedesco', conn: 'permette', effect: 'Acquisto di valuta' }], cross: [], branches: [] }; },
            buildDocHtml: chains => { log.chains.push(copy(chains)); return 'causal:' + JSON.stringify(chains) + ' '.repeat(250); }
        },
        MappAIMaterialReview: {
            validate: MR.validate,
            check: async (items, checkOpts) => {
                log.calls.judge++;
                assert.deepEqual(copy(checkOpts.aiContext), copy(state._reviewAIContext));
                assert.equal(checkOpts.material.sourceCoverage.fullPagesIncluded, state.sources[0].pages.length);
                const selected = [items.find(i => i.kind === 'mc'), items.find(i => i.kind === 'flashcard'), items.find(i => i.id === 'synthesis-intro')].filter(Boolean);
                return { checkStatus: opts.judgeStatus || 'completed', coverage: { checkedIds: items.map(i => i.id) }, issues: selected.map(it => {
                    const field = it.kind === 'mc' ? 'correctIndex' : it.kind === 'flashcard' ? 'answer' : 'text';
                    return { id: 'fix-' + it.id, target: { kind: 'item', id: it.id, field }, before: it[field],
                        after: field === 'correctIndex' ? 0 : GOLD, hasProposal: true, problem: 'Il soggetto è invertito.',
                        evidence: [{ text: GOLD, source: 'Fonte, pagina 5' }], blocking: true };
                }) };
            }
        },
        electronAPI: {
            filesRootGet: async () => ({ mapsBaseDir: '/fake' }), getAllVaults: async () => [],
            htmlToPdf: async args => { log.pdfs.push(copy(args)); return { ok: true, base64: PDF }; },
            saveVault: async args => { mapOnDisk = copy(args.mapData); return { success: true }; },
            loadVault: async () => ({ success: true, data: copy(mapOnDisk) }),
            saveVaultFile: async args => {
                log.writes.push(copy(args));
                const next = args.relPath === 'pipeline.json' ? JSON.parse(args.text) : null;
                if (failure && failure(args, next)) return { ok: false, error: 'fixture: manifest write failed' };
                if (next) {
                    const version = disk && disk._storageVersion || 0;
                    if (disk && (disk.review || next.review) && Number(args.expectedVersion || 0) !== version) return { ok: false, error: 'fixture: stale manifest version' };
                    disk = next; disk._storageVersion = version + 1;
                    return { ok: true, version: disk._storageVersion };
                }
                return { ok: true };
            },
            readVaultFile: async () => ({ ok: true, text: JSON.stringify(disk) })
        }
    });
    vm.runInContext(read('mappai-review.js'), context);
    context.MappAIReview.open = (vaultPath, manifest, options) => log.opened.push({ vaultPath, manifest, final: !!(options && options.final) });
    vm.runInContext(read('mappai-material-pipeline.js'), context);
    return { w: context, state, log, disk: () => copy(disk), failWrites: fn => { failure = fn; },
        changeActiveContext() { activeModel = 'gemma-changed'; activeTuning = { classId: '1A', nome: '1A', disc: 'Scienze' }; state.aiProvider = 'infomaniak'; },
        async fresh(conf) { await context.MappAIPipeline.run(conf); assert.ok(disk, log.errors.join('\n')); return copy(disk); },
        async run(manifest) { await context.MappAIPipeline.run(manifest.config, { only: ['B', 'C', 'D', 'E'], vaultPath: manifest.vaultPath, manifest }); return copy(disk); },
        async approveMap(manifest) { await context.MappAIReview.approve(manifest.vaultPath, manifest); return copy(disk); },
        async approveMaterials(manifest, changes = true) {
            let review = manifest.review.final.review;
            review.initial.issues.forEach(i => {
                const choice = !changes ? 'reject' : i.target.field === 'correctIndex' ? 'accept' : 'manual';
                const text = i.target.field === 'answer' ? FLASH_FIXED : SUMMARY_FIXED;
                review = RC.setDecision(review, i.id, choice, { text });
            });
            manifest.review.final.review = review;
            await context.MappAIReview.approve(manifest.vaultPath, manifest, { final: true, manualReview: true });
            return copy(disk);
        }
    };
}

test('primo lotto: due soli formati, il secondo conosce gli MC anche se i tipi erano in ordine inverso', async () => {
    const h = runtime({ openItems: [
        { domanda: 'Chi riceve valuta dalla vendita di oro?', traccia: GOLD, livello: 'base' },
        { domanda: 'Spiega come la vendita di oro permette un acquisto e giustifica ogni passaggio.', traccia: GOLD, livello: 'ponte' },
        { domanda: 'Questa terza domanda non è stata richiesta.', traccia: GOLD, livello: 'ponte' }
    ] });
    const cfg = PC.initialBatchOptions();
    cfg.quiz.types.reverse();
    let m = await h.fresh(cfg);
    m = await h.approveMap(m);
    m = await h.run(m);
    assert.deepEqual(h.log.errors, []);
    assert.deepEqual(Object.keys(m.review.drafts.B).sort(), ['mc-auto', 'open-auto']);
    assert.equal(h.log.calls.mc, 1);
    assert.equal(h.log.calls.open, 1);
    assert.equal(h.log.calls.flash, 0);
    assert.equal(h.log.calls.nodeDraft, 0);
    assert.equal(h.log.calls.synthesis, 1);
    assert.equal(h.log.mcRequests[0].quantity, 2);
    assert.match(h.log.openPrompts[0], /FUNZIONE DOMANDE APERTE/);
    assert.match(h.log.openPrompts[0], /Chi riceve valuta dalla vendita di oro/);
    assert.match(h.log.openPrompts[0], /ALTRO FORMATO GIÀ DISPONIBILE/);
    assert.equal(m.review.drafts.B['open-auto'].items.length, 1, 'una copia esclusa e la terza domanda oltre quota non pubblicata');
    assert.deepEqual(m.review.drafts.B['open-auto'].generation, { requested: 2, produced: 1 });
    assert.match(m.review.drafts.B['open-auto'].items[0].question, /^Spiega come/);
    assert.ok(h.log.toasts.some(x => /identiche all’altro formato/.test(x.message)));
    const beforeCalls = copy(h.log.calls);
    await h.run(m);
    assert.deepEqual(h.log.calls, beforeCalls, 'la ripresa usa le bozze e non rigenera per riempire la quota');
});

test('un formato privo di domande utilizzabili non viene dichiarato completato e conserva gli MC già generati', async () => {
    const h = runtime({ openItems: [{ domanda: 'Chi riceve valuta dalla vendita di oro?', traccia: GOLD, livello: 'base' }] });
    let m = await h.fresh(PC.initialBatchOptions());
    m = await h.approveMap(m);
    m = await h.run(m);
    assert.equal(m.steps.B.status, 'failed');
    assert.ok(m.review.drafts.B['mc-auto']);
    assert.equal(m.review.drafts.B['open-auto'], undefined);
    assert.equal(h.log.calls.synthesis, 1, 'la sintesi indipendente può completarsi e resta salvata');
    assert.equal(h.log.calls.judge, 0);
    assert.equal(h.log.pdfs.length, 0);
    assert.match(m.steps.B.error, /Nessuna domanda utilizzabile/);
    const generation = copy(m.review.drafts.B['mc-auto'].generation);
    const resumed = await h.run(m);
    assert.equal(h.log.calls.mc, 1, 'la ripresa del solo formato vuoto riusa gli MC');
    assert.deepEqual(resumed.review.drafts.B['mc-auto'].generation, generation, 'riusare una bozza non azzera il conteggio richiesto');
});

test('generaSet/varianti: angolo e quantità espliciti restano; le aperte leggono il set MC esistente', async () => {
    const h = runtime();
    h.w.MappAIReview.requireStandalone = async () => true;
    h.state.db.studySets = [{ id: 'mc-saved', type: 'Scelta Multipla', items: [
        { q: 'Quale soggetto riceve valuta?', explanation: GOLD, ramo: 'Oro e valuta' }
    ] }];
    h.w.MappAIStudyDocs = { save: () => 'saved-open' };
    // Il gesto pubblico invocato da _generaVarianti, per due angoli richiesti.
    for (const angolo of ['causa', 'confronto']) {
        const result = await h.w.MappAIPipeline.generaSet({ tipo: 'open', quantita: 4, angolo, nome: angolo });
        assert.equal(result.ok, true, result.errore);
        assert.equal(h.log.open.at(-1).angle, angolo);
        assert.deepEqual(copy(result.generation), { requested: 4, produced: 1 });
        assert.deepEqual(h.log.open.at(-1).generation, { requested: 4, produced: 1 });
    }
    assert.equal(h.log.openPrompts.length, 2);
    h.log.openPrompts.forEach(p => assert.match(p, /Quale soggetto riceve valuta/));
    assert.equal(h.state.db.studySets[0].id, 'mc-saved', 'il complemento esistente non viene modificato');
});

test('generaSet MC: le aperte già corrette nell’archivio diventano il contesto complementare', async () => {
    const h = runtime();
    h.w.MappAIReview.requireStandalone = async () => true;
    const other = { type: 'Domande aperte', items: [{ question: 'Giustifica il rapporto fra oro e valuta.', guide: GOLD, areas: ['Oro e valuta'] }] };
    h.w.MappAIStudyDocs = { list: () => [{ id: 'open-saved', kind: 'quizpaper', mapName: 'Svizzera' }], get: () => ({ html: 'saved' }) };
    h.w.MappAIQuizPrint = { setFromHtml: html => { assert.equal(html, 'saved'); return other; } };
    const result = await h.w.MappAIPipeline.generaSet({ tipo: 'mc', quantita: 3, angolo: 'applicazione', nome: 'nuovo' });
    assert.equal(result.ok, true, result.errore);
    assert.deepEqual(h.log.mcRequests[0].complementary, other.items);
    assert.equal(h.log.mcRequests[0].quantity, 3);
});

test('fresh generation checkpoints G1 durably; pending review blocks all material calls including resume', async () => {
    const h = runtime();
    const m = await h.fresh(config(true));
    assert.equal(m.steps.A.status, 'done');
    assert.equal(m.review.initial.status, 'awaiting_review');
    assert.equal(h.log.calls.map, 1);
    assert.equal(h.log.opened.length, 1);
    for (const key of ['mc', 'flash', 'open', 'synthesis', 'nodeDraft', 'nodeExport', 'chains', 'judge', 'audio']) assert.equal(h.log.calls[key], 0, key);
    assert.equal(h.log.pdfs.length, 0);
    await h.run(h.disk());
    assert.equal(h.log.calls.mc, 0);
    assert.equal(h.log.calls.synthesis, 0);
    assert.equal(h.w.MappAIPipeline.occupata(), false);
});

for (const all of [false, true]) {
    test(`B/D${all ? '/C/E' : ''}: drafts pause at G2; public approval exports corrected cached data once without AI regeneration`, async () => {
        const h = runtime();
        let m = await h.fresh(config(all));
        m = await h.approveMap(m);
        m = await h.run(m);
        assert.deepEqual(h.log.errors, []);
        assert.equal(m.review.final.stage, 'awaiting_review');
        assert.equal(m.review.final.review.initial.issues.length, 3);
        assert.equal(h.log.calls.mc, 1);
        assert.equal(h.log.calls.flash, 1);
        assert.equal(h.log.calls.open, all ? 1 : 0);
        assert.equal(h.log.calls.synthesis, 1);
        assert.equal(h.log.calls.judge, 1);
        assert.equal(h.log.calls.nodeDraft, all ? 1 : 0);
        assert.equal(h.log.calls.chains, all ? 1 : 0);
        assert.equal(h.log.pdfs.length, 0);
        assert.equal(h.log.calls.audio, 0);
        assert.equal(h.log.calls.nodeExport, 0);
        assert.equal(h.state.db.studySets.length, 0);
        assert.equal(h.log.writes.filter(w => w.relPath.startsWith('Materiale Studio/')).length, 0);
        const pendingCalls = copy(h.log.calls);
        m = await h.run(h.disk());
        assert.equal(m.review.final.stage, 'awaiting_review');
        assert.deepEqual(h.log.calls, pendingCalls, 'reopening pending G2 does not regenerate or export drafts');
        m = await h.approveMaterials(h.disk()); // reload persisted data, like closing/reopening review
        assert.equal(m.review.final.stage, 'approved');
        const aiBefore = copy(h.log.calls);
        h.w.getSystemKey = () => ''; // export must work without a model key
        m = await h.run(h.disk());
        assert.deepEqual(h.log.errors, []);
        assert.equal(m.review.final.stage, 'done');
        assert.equal(PC.isComplete(m), true);
        for (const key of ['map', 'mc', 'flash', 'open', 'synthesis', 'nodeDraft', 'chains', 'judge']) assert.equal(h.log.calls[key], aiBefore[key], key + ' must not regenerate');
        assert.equal(h.log.quiz[0].items[0].correctIndex, 0);
        assert.equal(h.log.quiz[0].items[0].options[0], 'La Germania');
        assert.equal(h.log.flash[0].items[0].answer, FLASH_FIXED);
        assert.ok(h.log.synth.every(s => s.data.intro === SUMMARY_FIXED));
        assert.equal(h.log.calls.audio, 1);
        assert.equal(h.state.db.studySets.length, 2);
        assert.equal(h.state.db.studySets.find(s => s.mode === 'quiz').items[0].correct, 'La Germania');
        assert.equal(h.log.pdfs.length, all ? 4 : 2); // node sheets use their own PDF builder
        assert.equal(h.log.calls.nodeExport, all ? 1 : 0);
        if (all) { assert.equal(h.log.nodes[0][0].desc, GOLD); assert.equal(h.log.chains.length, 1); assert.equal(h.log.open[0].items[0].guide, GOLD); }
        const outputs = h.log.writes.filter(w => w.relPath.startsWith('Materiale Studio/')).length;
        const generated = copy(h.log.calls);
        m = await h.run(h.disk());
        assert.equal(m.review.final.stage, 'done');
        assert.deepEqual(h.log.calls, generated);
        assert.equal(h.log.writes.filter(w => w.relPath.startsWith('Materiale Studio/')).length, outputs);
        assert.equal(h.state.db.studySets.length, 2);
    });
}

test('failed draft manifest write halts the pipeline before later generation, G2 and all exports', async () => {
    const h = runtime();
    let m = await h.fresh(config(true));
    m = await h.approveMap(m);
    let failed = false;
    h.failWrites((args, next) => {
        if (!failed && args.relPath === 'pipeline.json' && next && next.review && next.review.drafts && Object.keys(next.review.drafts.B).length > 0) {
            failed = true; return true;
        }
        return false;
    });
    await h.run(m);
    assert.equal(h.log.calls.mc, 1);
    assert.equal(h.log.calls.flash, 0);
    assert.equal(h.log.calls.synthesis, 0);
    assert.equal(h.log.calls.judge, 0);
    assert.equal(h.log.calls.audio, 0);
    assert.equal(h.log.pdfs.length, 0);
    assert.ok(h.log.errors.some(e => e.includes('manifest write failed')));
    assert.equal(h.w.MappAIPipeline.occupata(), false);
});

test('failed approval checkpoint prevents export and preserves the last durable awaiting-review state', async () => {
    const h = runtime();
    let m = await h.fresh(config(false)); m = await h.approveMap(m); m = await h.run(m);
    h.failWrites((args, next) => args.relPath === 'pipeline.json' && next && next.review.final && next.review.final.stage === 'applying');
    await assert.rejects(h.approveMaterials(m), /manifest write failed/);
    assert.equal(h.disk().review.final.stage, 'awaiting_review');
    assert.equal(h.log.pdfs.length, 0);
    assert.equal(h.log.calls.audio, 0);
});

test('title-only node sheets remain valid differentiated material throughout final approval', async () => {
    const h = runtime(), conf = config(true);
    conf.nodesheet = { modes: ['title'], fmt: '3x4', maxLevel: 'all' };
    let m = await h.fresh(conf); m = await h.approveMap(m); m = await h.run(m);
    const title = m.review.final.items.find(i => i.kind === 'nodesheet');
    assert.equal(title.layout, 'title'); assert.equal(title.text, '');
    m = await h.approveMaterials(m); m = await h.run(m);
    assert.equal(m.review.final.stage, 'done');
    assert.deepEqual(h.log.errors, []);
    assert.equal(h.log.nodes[0][0].layout, 'title');
});

test('new approved-material job keeps map and former delivery while preparing fresh drafts before G2', async () => {
    const h = runtime();
    let m = await h.fresh(config(false)); m = await h.approveMap(m); m = await h.run(m);
    m = await h.approveMaterials(m); m = await h.run(m);
    const previous = copy(m), outputs = h.log.writes.filter(w => w.relPath.startsWith('Materiale Studio/')).length;
    const oldCalls = copy(h.log.calls), oldSets = copy(h.state.db.studySets);
    await h.w.MappAIPipeline.runApprovedMaterials({ quiz: { types: ['mc'], perBranch: 2, angle: 'auto' } },
        { vaultPath: m.vaultPath, revision: m.review.approvedRevision });
    m = h.disk();
    assert.deepEqual(h.log.errors, []);
    assert.equal(m.review.initial.status, 'approved');
    assert.equal(m.review.approvedRevision, previous.review.approvedRevision);
    assert.equal(m.steps.A.status, 'done');
    assert.equal(h.log.calls.map, oldCalls.map);
    assert.equal(h.log.calls.mc, oldCalls.mc + 1);
    assert.equal(h.log.calls.synthesis, oldCalls.synthesis);
    assert.equal(h.log.calls.flash, oldCalls.flash);
    assert.equal(m.review.final.stage, 'awaiting_review');
    assert.equal(m.review.deliveries.length, 1);
    assert.deepEqual(m.review.deliveries[0].final, previous.review.final);
    assert.deepEqual(m.review.deliveries[0].config, previous.config);
    assert.deepEqual(Object.keys(m.review.drafts.B), ['mc-auto']);
    assert.equal(h.log.writes.filter(w => w.relPath.startsWith('Materiale Studio/')).length, outputs);
    assert.deepEqual(copy(h.state.db.studySets), oldSets, 'previous approved sets stay available while new drafts are pending');
});

test('resume preserves saved tuning and provider/model snapshots despite changes in current UI settings', async () => {
    const h = runtime();
    let m = await h.fresh(config(false));
    assert.deepEqual(m.config.aiContext, { provider: 'google', model: 'gemini-original' });
    assert.deepEqual(m.config.tuningContext, { classId: '4R', nome: '4R', disc: 'Storia' });
    const snapshot = copy(m.config);
    h.changeActiveContext();
    m = await h.approveMap(m);
    const lastTune = h.log.tuning.length;
    m = await h.run(m);
    assert.equal(m.review.final.stage, 'awaiting_review');
    assert.deepEqual(m.config.aiContext, snapshot.aiContext);
    assert.deepEqual(m.config.tuningContext, snapshot.tuningContext);
    assert.ok(h.log.modelContexts.length);
    assert.ok(h.log.modelContexts.every(c => c.provider === 'google' && c.model === 'gemini-original'));
    assert.ok(h.log.tuning.slice(lastTune).every(c => c.classId === '4R' && c.disc === 'Storia'));
    assert.equal(h.state.aiProvider, 'infomaniak', 'the current UI preference is preserved');
    assert.equal(h.state._reviewAIContext, undefined, 'the per-run override is released');
});

test('il preset diventa ultimo usato solo quando parte una nuova generazione; le flashcard hanno quantità indipendente', async () => {
    const h = runtime(), cfg = PC.initialBatchOptions();
    cfg.quiz.types.push('flashcards'); cfg.quiz.perTipo = { flashcards: 7 };
    const store = new Map([['mappai_material_presets', JSON.stringify([{ id: 'used', name: 'Scelto', options: cfg }])]]);
    h.w.localStorage.getItem = key => store.get(key) || null;
    h.w.localStorage.setItem = (key, value) => store.set(key, value);
    const originalFetch = h.w.fetchModelAPI;
    let flashLimit;
    h.w.fetchModelAPI = async payload => {
        if (payload.generationConfig.responseSchema.items.properties.front) {
            flashLimit = payload.generationConfig.responseSchema.maxItems;
            return { candidates: [{ content: { parts: [{ text: JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ front: 'Carta distinta ' + i, back: GOLD }))) }] } }] };
        }
        return originalFetch(payload);
    };
    const key = h.w.getSystemKey; h.w.getSystemKey = () => '';
    await h.w.MappAIPipeline.run(cfg, { presetId: 'used' });
    assert.equal(store.get('mappai_material_last_used'), undefined, 'preflight fallito non cambia il default');
    h.w.getSystemKey = key;
    await h.w.MappAIPipeline.run(cfg, { presetId: 'used' });
    const remembered = store.get('mappai_material_last_used');
    assert.equal(JSON.parse(remembered).options.quiz.perTipo.flashcards, 7);
    assert.equal(JSON.parse(remembered).presetId, 'used');
    let m = await h.approveMap(h.disk()); m = await h.run(m);
    assert.equal(flashLimit, 7);
    assert.equal(m.review.drafts.B['flashcards-auto'].items.length, 7);
    assert.equal(m.review.drafts.B['flashcards-auto'].generation.requested, 7);
    assert.equal(h.log.mcRequests[0].quantity, 2);
    assert.equal(store.get('mappai_material_last_used'), remembered, 'la ripresa non sceglie un altro preset');
});
