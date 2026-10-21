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
        // lo stesso oggetto per lo stesso selettore: un gestore agganciato si può ritrovare e premere
        remove() { elements.delete(this.id); }, querySelector(sel) { this._q = this._q || {}; return (this._q[sel] = this._q[sel] || {}); }, querySelectorAll() { return []; } });
    return { getElementById: id => elements.get(id) || null, createElement: element,
        body: { appendChild(el) { elements.set(el.id, el); } } };
}
// packet 0089 (ADR 0020): affermazioni e quarantena accese se la chiave manca; «da spento» è il '0' esplicito (inv. 1)
const SPENTI_0089 = new Set(['mappai_affermazioni', 'mappai_quarantena']);
const spenti0089 = () => new Map([...SPENTI_0089].map(k => [k, '0']));
function runtime(opts = {}) {
    const log = { calls: { map: 0, mc: 0, flash: 0, open: 0, synthesis: 0, nodeDraft: 0, nodeExport: 0, chains: 0, judge: 0, audio: 0 },
        writes: [], pdfs: [], quiz: [], flash: [], open: [], synth: [], nodes: [], chains: [], opened: [], toasts: [], errors: [], tuning: [], modelContexts: [], openPrompts: [], mcRequests: [],
        g2Materials: [], synthArgs: [], flashMaterials: [], nodeArgs: [] };
    const db = opts.db ? copy(opts.db) : { nodes: [{ id: 'root', level: 0, label: 'Svizzera', desc: GOLD },
        { id: 'gold', level: 1, group: 1, label: 'Oro e valuta', desc: GOLD }],
        links: [{ source: 'root', target: 'gold', rel: 'include' }],
        sourcesDict: { gold: [{ title: 'Fonte', source: 'pagina 5', page: 5, text: GOLD, verbatim: true }] }, studySets: [] };
    for (let i = 0; i < (opts.db ? 0 : 3); i++) {
        db.nodes.push({ id: 'detail-' + i, label: 'Dettaglio ' + i, level: 2, group: 1, desc: GOLD });
        db.links.push({ source: 'gold', target: 'detail-' + i, rel: 'include' });
    }
    const state = { db, sources: opts.sources ? copy(opts.sources) : [{ id: 'pdf', title: 'Fonte', pages: [{ n: 5, text: GOLD }] }],
        rootNodeLabel: 'Svizzera', extractionMode: 'mindmap', activeVaultPath: '/fake/Generico/Svizzera',
        _generationId: 'fixture-generation', _judgeReport: { checkStatus: 'completed', issues: [] } };
    let disk = null, mapOnDisk = copy(db), failure = null;
    let activeModel = 'gemini-original', activeTuning = { classId: '4R', nome: '4R', disc: 'Storia' };
    const document = dom(), findElement = document.getElementById;
    document.getElementById = id => id === 'model-select' ? { value: activeModel } : findElement(id);
    const context = vm.createContext({ appState: state, console: { info() {}, log() {}, warn() {}, error(...args) { log.errors.push(args.map(String).join(' ')); } },
        document, localStorage: opts.storage ? { getItem: k => (opts.storage.has(k) ? opts.storage.get(k) : null), setItem: (k, v) => opts.storage.set(k, String(v)) } : { getItem: k => (SPENTI_0089.has(k) ? '0' : null), setItem() {} },
        setTimeout, clearTimeout, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'),
        FileReader: class { readAsDataURL() { this.result = 'data:audio/mpeg;base64,QUJDRA=='; this.onload(); } } });
    context.window = context;
    Object.assign(context, {
        // con lo strato delle affermazioni ogni contesto ha la SUA copia di review-core: l'avvolgimento del gate non esce dal test
        MappAIPipelineCore: PC, MappAIReviewCore: opts.affermazioni ? Object.assign({}, RC) : RC,
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
            log.calls.flash++; log.flashMaterials.push(payload.contents[0].parts[0].text);
            assert.equal(payload.generationConfig.responseSchema.items.properties.front.type, 'STRING');
            return { candidates: [{ content: { parts: [{ text: JSON.stringify([{ front: 'Chi vende oro?', back: WRONG }]) }] } }] };
        },
        buildQuizSetHtml: set => { log.quiz.push(copy(set)); return 'quiz:' + JSON.stringify(set); },
        buildFlashcardSetHtml: set => { log.flash.push(copy(set)); return 'flash:' + JSON.stringify(set); },
        buildOpenQuestionsHtml: set => { log.open.push(copy(set)); return 'open:' + JSON.stringify(set); },
        printAllNodeLabels: async args => {
            log.nodeArgs.push(Object.keys(args).sort());
            if (args.draftOnly) { log.calls.nodeDraft++; return { ok: true, cards: [{ id: 'gold', label: 'Oro e valuta', desc: GOLD, layout: args.layout }] }; }
            log.calls.nodeExport++; assert.ok(Array.isArray(args.cards), 'export must receive the cached cards');
            log.nodes.push(copy(args.cards)); return { ok: true, base64: PDF };
        },
        MappAISynthesis: {
            runWholeMap: async args => { log.synthArgs.push(args); log.calls.synthesis++; return { whole: true, intro: WRONG, sections: [{ branchLabel: 'Oro e valuta', rawText: GOLD, sourcesArr: [] }] }; },
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
                log.calls.judge++; log.g2Materials.push(checkOpts.material.material);
                assert.deepEqual(copy(checkOpts.aiContext), copy(state._reviewAIContext));
                assert.equal(checkOpts.material.sourceCoverage.fullPagesIncluded, state.sources[0].pages.length);
                const selected = [items.find(i => i.kind === 'mc'), items.find(i => i.kind === 'flashcard'), items.find(i => i.id === 'synthesis-intro')].filter(Boolean);
                return { checkStatus: opts.judgeStatus || 'completed', coverage: { checkedIds: items.map(i => i.id) }, issues: (opts.g2Pulito ? [] : selected).map(it => {
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
    // `argomenti`: da spento la chiamata al Banco deve restare quella di sempre, con gli stessi argomenti
    const reviewOpen = context.MappAIReview.open;
    context.MappAIReview.open = function (vaultPath, manifest, options) {
        if (manifest?.reading || state.extractionMode === 'lettura') return reviewOpen(vaultPath, manifest, options);
        log.opened.push({ vaultPath, manifest, final: !!(options && options.final), alza: !!(options && options.alza),
        chiavi: Object.keys(options || {}).sort(), argomenti: arguments.length, opzioni: options || {} }); };
    vm.runInContext(read('mappai-material-pipeline.js'), context);
    if (opts.affermazioni) Object.assign(context, { MappAIDeepenCore: require('../public/js/mappai-deepen-core.js'),
        MappAIAnchorCore: require('../public/js/mappai-anchor-core.js'), MappAIEvidenceCore: require('../public/js/mappai-evidence-core.js') });
    if (opts.affermazioni) for (const f of ['mappai-affermazioni-core.js', 'mappai-affermazioni.js', 'mappai-affermazioni-ui.js']) vm.runInContext(read(f), context);
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

test('0070: il percorso testuale occupa lo stesso lucchetto e non avvia una pipeline concorrente', async () => {
    const h = runtime(), p = h.w.MappAIPipeline;
    let release;
    const pending = p.withReadingOperation(() => new Promise(resolve => { release = resolve; }));
    assert.equal(p.occupata(), true);
    assert.equal(h.w.mappaiOccupato(), true);
    let called = false;
    await assert.rejects(p.withReadingOperation(() => { called = true; }), /reading_operation_busy/);
    await p.run(config(false));
    assert.equal(called, false);
    assert.equal(h.log.calls.map, 0);
    assert.equal(h.log.writes.length, 0);
    release('fonte salvata');
    assert.equal(await pending, 'fonte salvata');
    assert.equal(p.occupata(), false);
    assert.equal(h.w.mappaiOccupato(), false);
    assert.equal(await p.withReadingOperation(() => 42), 42);
});

test('0070: un errore nel lavoro testuale libera il lucchetto senza nasconderlo', async () => {
    const h = runtime(), p = h.w.MappAIPipeline;
    for (const work of [() => { throw new Error('disco'); }, async () => { throw new Error('rilettura'); }]) {
        await assert.rejects(p.withReadingOperation(work), /disco|rilettura/);
        assert.equal(p.occupata(), false);
        assert.equal(await p.withReadingOperation(() => 'ripresa'), 'ripresa');
    }
    await assert.rejects(p.withReadingOperation(null), /reading_operation_required/);
    assert.equal(p.occupata(), false);
});

test('0070: generazione, lettura PDF e salvataggio G1 bloccano il lavoro testuale prima del callback', async () => {
    const h = runtime(), p = h.w.MappAIPipeline;
    let called = 0;
    const work = () => { called++; };
    h.w.MappAIGen = { attiva: () => true, motivo: () => 'Generazione in corso' };
    await assert.rejects(p.withReadingOperation(work), /reading_operation_busy/);
    h.w.MappAIGen.attiva = () => false;
    h.w.MappAIElabora = { letturaPdfAttiva: () => true, motivoLetturaPdf: () => 'PDF in lettura' };
    await assert.rejects(p.withReadingOperation(work), /reading_operation_busy/);
    h.w.MappAIElabora.letturaPdfAttiva = () => false;
    const busy = h.w.MappAIReview.isBusy;
    h.w.MappAIReview.isBusy = () => true;
    await assert.rejects(p.withReadingOperation(work), /reading_operation_busy/);
    h.w.MappAIReview.isBusy = busy;
    assert.equal(called, 0);
    assert.equal(p.occupata(), false);
    await p.withReadingOperation(work);
    assert.equal(called, 1);
});

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

/* ── Packet 0042: lo strato delle affermazioni e la quarantena ───────────────
   La pipeline VERA con la cucitura vera caricata nel contesto (core in modalità
   renderer). Da spento niente cambia; da acceso «Genera materiali» con G1 in
   attesa genera da una vista: le frasi contestate da segnalazioni aperte fuori,
   le correzioni decise dentro come rettifiche; G2 si apre sempre. */
// le date, gli id casuali dei set e le impronte che li contengono cambiano da un giro all'altro anche senza lo strato
const normalizza = x => JSON.stringify(x).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, 'T').replace(/set_\d+_[a-z0-9]+/g, 'set')
    .replace(/r1-[0-9a-f]{16}-\d+/g, 'rev');
test('0042: con gli interruttori a \'0\' (0089: senza chiavi sono accesi) lo strato caricato non cambia niente — material, prompt, manifesto e consegna identici carattere per carattere', async () => {
    const giro = async h => {
        let m = await h.fresh(config(true)); m = await h.approveMap(m); m = await h.run(m);
        await h.approveMaterials(h.disk());
        h.w.getSystemKey = () => '';
        return h.run(h.disk());
    };
    const senza = runtime(), con = runtime({ affermazioni: true });
    const a = await giro(senza), b = await giro(con);
    assert.deepEqual(con.log.errors, []);
    assert.equal(con.w.MappAIReviewCore.gate.__quarantena, true, 'il gate è avvolto anche da spento');
    assert.ok(con.log.mcRequests.length && con.log.g2Materials.length && con.log.flashMaterials.length);
    assert.deepEqual(con.log.mcRequests.map(r => r.material), senza.log.mcRequests.map(r => r.material));
    assert.deepEqual(con.log.flashMaterials, senza.log.flashMaterials);
    assert.deepEqual(con.log.openPrompts, senza.log.openPrompts);
    assert.deepEqual(con.log.g2Materials, senza.log.g2Materials);
    assert.deepEqual(con.log.nodeArgs, senza.log.nodeArgs, 'printAllNodeLabels riceve le stesse chiavi: niente `nodes`');
    assert.deepEqual(con.log.synthArgs.map(x => Object.keys(x).sort()), senza.log.synthArgs.map(x => Object.keys(x).sort()), 'runWholeMap senza db né review');
    assert.deepEqual(con.log.calls, senza.log.calls);
    assert.equal(con.w.document.getElementById('mp-summary').innerHTML, senza.w.document.getElementById('mp-summary').innerHTML, 'il riepilogo è quello di sempre');
    assert.ok(!/mps-rivedi|mps-aff/.test(con.w.document.getElementById('mp-summary').innerHTML));
    assert.equal(normalizza(b), normalizza(a));
    assert.ok(!normalizza(b).includes('quarantena'), 'nessun campo nuovo nel manifesto');
    assert.ok(!normalizza(con.state.db.studySets).includes('quarantena'), 'nessun campo nuovo nei set pubblicati');
    assert.equal(normalizza(con.log.writes.filter(w => w.relPath === 'pipeline.json').map(w => JSON.parse(w.text))),
        normalizza(senza.log.writes.filter(w => w.relPath === 'pipeline.json').map(w => JSON.parse(w.text))), 'le stesse scritture, nello stesso ordine');
});

const PENDENTE = 'La Svizzera vendette tutto il suo oro alla Germania nel 1945.';
const DA_CORREGGERE = 'Lo scambio durò fino al 1950.';
const CORRETTA = 'Lo scambio durò fino al 1945.';
const Q_FONTI = [{ id: 'pdf', title: 'Fonte', pages: [{ n: 5, text: GOLD + ' La Svizzera acquistò oro tedesco fino al 1945.' }] }];
const Q_MAPPA = { nodes: [{ id: 'root', level: 0, label: 'Svizzera', desc: GOLD },
    { id: 'gold', level: 1, group: 1, label: 'Oro e valuta', desc: GOLD + ' ' + PENDENTE + ' ' + DA_CORREGGERE },
    ...[0, 1, 2].map(i => ({ id: 'detail-' + i, label: 'Dettaglio ' + i, level: 2, group: 1, desc: GOLD }))],
    links: [{ source: 'root', target: 'gold', rel: 'include' }, ...[0, 1, 2].map(i => ({ source: 'gold', target: 'detail-' + i, rel: 'include' }))],
    sourcesDict: { gold: [{ title: 'Fonte', source: 'pagina 5', page: 5, text: GOLD, verbatim: true }] }, studySets: [] };
const Q_RAPPORTO = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['root', 'gold', 'detail-0', 'detail-1', 'detail-2'], nodiSaltati: [] }, issues: [
    { id: 'i-pendente', target: { kind: 'node', id: 'gold', field: 'desc' }, problem: 'La fonte non dice «La Svizzera vendette tutto il suo oro alla Germania».' },
    { id: 'i-anno', target: { kind: 'node', id: 'gold', field: 'desc' }, problem: 'L’anno della fine dello scambio non è quello della fonte.' }] };
async function inQuarantena(extra = {}) {
    const storage = spenti0089();
    const h = runtime(Object.assign({ affermazioni: true, storage, db: Q_MAPPA, sources: Q_FONTI }, extra));
    h.state._judgeReport = copy(extra.rapporto || Q_RAPPORTO);
    const m = await h.fresh(config(false));
    // da spento: il Banco si apre come oggi e nessun materiale nasce
    assert.equal(h.log.opened.length, 1);
    assert.equal(h.log.calls.mc + h.log.calls.flash + h.log.calls.synthesis, 0);
    assert.equal(m.review.quarantena, undefined);
    m.review = RC.setDecision(m.review, 'i-anno', 'manual', { text: GOLD + ' ' + PENDENTE + ' ' + CORRETTA });
    storage.set('mappai_affermazioni', '1'); storage.set('mappai_quarantena', '1');
    return { h, m, storage };
}

test('0042: da acceso la frase pending manca dai materiali B, dalla sintesi e dal riferimento di G2; la correzione manual entra come rettifica', async () => {
    const { h, m: m0 } = await inQuarantena();
    const m = await h.run(m0);
    assert.deepEqual(h.log.errors, []);
    assert.equal(m.review.initial.status, 'awaiting_review', 'G1 non è stata approvata');
    assert.equal(m.review.quarantena.completo, true, m.review.quarantena.motivo);
    assert.equal(h.log.calls.mc, 1); assert.equal(h.log.calls.flash, 1); assert.equal(h.log.calls.synthesis, 1); assert.equal(h.log.calls.judge, 1);
    const mc = h.log.mcRequests[0].material;
    assert.ok(!mc.includes(PENDENTE), 'la frase contestata non arriva al generatore');
    assert.ok(mc.split('PASSAGGI ORIGINALI')[0].includes(CORRETTA) && !mc.includes(DA_CORREGGERE), 'la correzione del docente è nei contenuti');
    assert.match(mc, /RETTIFICHE DEL DOCENTE[\s\S]*Lo scambio durò fino al 1945\./);
    assert.ok(!h.log.flashMaterials[0].includes(PENDENTE));
    assert.ok(!h.log.g2Materials[0].includes(PENDENTE), 'G2 confronta con la stessa vista');
    assert.match(h.log.g2Materials[0], /RETTIFICHE DEL DOCENTE/);
    const sintesi = h.log.synthArgs[0];
    assert.ok(sintesi.db && sintesi.review, 'runWholeMap riceve la vista');
    assert.ok(!sintesi.db.nodes.find(n => n.id === 'gold').desc.includes(PENDENTE));
    assert.equal(sintesi.review.overrides.length, 1);
    // la ricevuta nasce con le bozze e passa a `final`
    const firma = m.review.quarantena.firma;
    for (const d of [m.review.drafts.B['mc-auto'], m.review.drafts.B['flashcards-auto'], m.review.drafts.D]) assert.equal(d.quarantena.firma, firma);
    assert.equal(m.review.final.quarantena.firma, firma);
    assert.equal(m.review.final.stage, 'awaiting_review');
    assert.equal(h.log.opened.at(-1).final, true, 'G2 si apre');
    // la mappa del docente non cambia
    assert.ok(h.state.db.nodes.find(n => n.id === 'gold').desc.includes(PENDENTE));
    assert.ok(h.state.db.nodes.find(n => n.id === 'gold').desc.includes(DA_CORREGGERE));
});

test('0042: G2 non si approva da sola sotto quarantena, anche senza segnalazioni e con il controllo completo', async () => {
    const oggi = runtime({ g2Pulito: true });
    let a = await oggi.fresh(config(false)); a = await oggi.approveMap(a); a = await oggi.run(a);
    assert.equal(a.review.final.stage, 'done', 'oggi, senza segnalazioni, G2 si approva da sola');
    const { h, m: m0 } = await inQuarantena({ g2Pulito: true });
    const m = await h.run(m0);
    assert.deepEqual(h.log.errors, []);
    assert.equal(m.review.final.review.initial.issues.length, 0);
    assert.equal(m.review.final.review.initial.checkStatus, 'completed');
    assert.equal(m.review.final.stage, 'awaiting_review', 'sotto quarantena G2 aspetta una persona');
    assert.equal(h.log.opened.at(-1).final, true);
    assert.equal(h.log.pdfs.length, 0, 'niente consegnato');
});

test('0042: una bozza nata da un’altra firma si rigenera; quelle nuove portano la firma nuova', async () => {
    const { h, m: m0 } = await inQuarantena();
    const primo = await h.run(m0);
    const firmaVecchia = primo.review.quarantena.firma, prima = copy(h.log.calls);
    // il docente decide la segnalazione aperta: le decisioni cambiano, quindi la firma
    const m1 = h.disk();
    m1.review = RC.setDecision(m1.review, 'i-pendente', 'reject');
    const secondo = await h.run(m1);
    assert.deepEqual(h.log.errors, []);
    assert.notEqual(secondo.review.quarantena.firma, firmaVecchia);
    assert.equal(h.log.calls.mc, prima.mc + 1, 'le bozze B si rigenerano');
    assert.equal(h.log.calls.synthesis, prima.synthesis + 1, 'anche la sintesi');
    assert.equal(secondo.review.drafts.B['mc-auto'].quarantena.firma, secondo.review.quarantena.firma);
    assert.equal(secondo.review.final.quarantena.firma, secondo.review.quarantena.firma);
    assert.ok(h.log.mcRequests.at(-1).material.includes(PENDENTE), 'mantenuta dal docente, la frase torna nei materiali');
    // con la stessa firma una ripresa non rigenera niente
    const fermo = copy(h.log.calls);
    await h.run(h.disk());
    assert.deepEqual(h.log.calls, fermo);
});

test('0042: una modifica sulla tela dopo il record riapre il cancello di oggi', async () => {
    const { h, m: m0 } = await inQuarantena();
    await h.run(m0);
    const calls = copy(h.log.calls), aperti = h.log.opened.length;
    h.state.db.nodes.find(n => n.id === 'gold').desc += ' Aggiunta sulla tela.';
    const m = h.disk();
    await h.run(m);
    assert.deepEqual(h.log.calls, calls, 'nessun materiale nuovo');
    assert.equal(h.log.opened.length, aperti + 1);
    assert.equal(h.log.opened.at(-1).final, false, 'si apre il Banco dei contenuti, come oggi');
    assert.equal(h.disk().review.quarantena.completo, false);
    assert.equal(h.disk().review.quarantena.motivo, 'mappa_cambiata');
});

test('0042: dopo G2 i set pubblicati portano la ricevuta e il riepilogo dice che cosa è rimasto fuori, con «Rivedi i contenuti»', async () => {
    const { h, m: m0 } = await inQuarantena();
    let m = await h.run(m0);
    const firma = m.review.quarantena.firma;
    m = await h.approveMaterials(h.disk());
    h.w.getSystemKey = () => '';
    m = await h.run(h.disk());
    assert.deepEqual(h.log.errors, []);
    assert.equal(m.review.final.stage, 'done');
    assert.equal(m.review.initial.status, 'awaiting_review', 'G1 resta facoltativa e non approvata');
    assert.equal(h.state.db.studySets.length, 2);
    for (const set of h.state.db.studySets) assert.equal(set.quarantena.firma, firma, 'la ricevuta viaggia coi set pubblicati');
    /* 27/09: il set arriva all'allievo, quindi porta solo la ricevuta BREVE — niente testi delle frasi escluse */
    const esclusi = (m.review.quarantena.escluse || []).map(e => e.testo).filter(Boolean);
    assert.ok(esclusi.length > 0, 'la prova ha davvero frasi escluse');
    for (const set of h.state.db.studySets) {
      assert.equal(set.quarantena.dettaglio, 'pipeline.json');
      assert.equal(set.quarantena.escluse, undefined, 'nessun elenco delle frasi escluse nel set');
      // (il finto modello del banco scrive la stessa frase nella spiegazione del quiz: si controlla la RICEVUTA)
      const txt = JSON.stringify(set.quarantena);
      for (const t of esclusi) assert.ok(!txt.includes(t), 'il testo di una frase esclusa non arriva nella ricevuta del set: ' + t.slice(0, 40));
      assert.deepEqual(Object.keys(set.quarantena).sort(), ['conteggi', 'data', 'dettaglio', 'firma', 'regole', 'revision', 'schema']);
    }
    const riepilogo = h.w.document.getElementById('mp-summary');
    assert.match(riepilogo.innerHTML, /id="mps-aff"/);
    /* giro 5 (F1): escono la frase contestata e, nel nodo bersaglio, anche GOLD — che del passo contestato
       («La Svizzera vendette tutto il suo oro alla Germania nel 1945.», 4 parole piene) ripete «Svizzera» e
       «Germania», metà delle parole piene: il contenimento arriva alla soglia e la quarantena fallisce chiusa.
       Giro 7 (H3): con un passo individuato la frase base si cerca su TUTTA la mappa, e GOLD esce anche dalla
       radice e dai tre dettagli, che restano senza testo nei materiali. È il prezzo di un passo corto (4
       parole piene) su una mappa che le ripete tutte: il riepilogo lo dice */
    assert.deepEqual(m.review.quarantena.escluse.map(e => [e.nodeId, e.testo]),
        [['root', GOLD], ['gold', GOLD], ['gold', PENDENTE], ['detail-0', GOLD], ['detail-1', GOLD], ['detail-2', GOLD]]);
    assert.match(riepilogo.innerHTML, /6 frasi fuori dai materiali \(6 per segnalazioni che non hai deciso, 0 di nodi che il controllo non ha esaminato\)/);
    assert.match(riepilogo.innerHTML, /Nodi senza testo nei materiali: Svizzera, Dettaglio 0, Dettaglio 1, Dettaglio 2/);
    assert.match(riepilogo.innerHTML, /La mappa non è cambiata/);
    assert.match(riepilogo.innerHTML, /id="mps-rivedi"[^>]*>Rivedi i contenuti/);
    // «Rivedi i contenuti» apre il Banco dei contenuti col piano chiesto al motore
    const aperti = h.log.opened.length;
    riepilogo.querySelector('#mps-rivedi').onclick();
    assert.equal(h.log.opened.length, aperti + 1);
    assert.deepEqual([h.log.opened.at(-1).final, h.log.opened.at(-1).alza], [false, true]);
});

test('0042 giro 2: un nodo aggiunto sulla tela durante il passo B non arriva ai generatori — la vista è l’unica fonte', async () => {
    /* giro 7 (H3): i dettagli hanno un testo loro — con GOLD, che riprende il passo contestato per metà,
       uscirebbero dalla vista su tutta la mappa, e la prova dei discendenti veri non si potrebbe fare */
    const db = copy(Q_MAPPA);
    db.nodes.filter(n => n.id.startsWith('detail-')).forEach(n => { n.desc = 'Il ' + n.label.toLowerCase() + ' riguarda la valuta pagata dalla Banca Nazionale.'; });
    const { h, m: m0 } = await inQuarantena({ db });
    const NUOVO = 'Frase di un nodo aggiunto sulla tela mentre i materiali si generavano.';
    // i discendenti dalla mappa VIVA, come getDescendants nell'app
    const figli = id => h.state.db.links.filter(l => l.source === id).map(l => h.state.db.nodes.find(n => n.id === l.target)).filter(Boolean);
    h.w.getDescendants = id => { const out = []; const visita = x => figli(x).forEach(n => { out.push(n); visita(n.id); }); visita(id); return out; };
    // il nodo compare alla prima domanda a scelta multipla e sparisce alla prima chiamata delle flashcard:
    // a fine passo la mappa è di nuovo quella della base, e il cancello non se ne accorge
    const mc = h.w.generateDynamicQuiz, chiama = h.w.fetchModelAPI;
    h.w.generateDynamicQuiz = async args => {
        if (!h.state.db.nodes.some(n => n.id === 'nuovo')) {
            h.state.db.nodes.push({ id: 'nuovo', label: 'Nodo nuovo', level: 2, group: 1, desc: NUOVO });
            h.state.db.links.push({ source: 'gold', target: 'nuovo', rel: 'include' });
        }
        return mc(args);
    };
    h.w.fetchModelAPI = async payload => {
        const out = await chiama(payload);
        h.state.db.nodes = h.state.db.nodes.filter(n => n.id !== 'nuovo');
        h.state.db.links = h.state.db.links.filter(l => l.target !== 'nuovo');
        return out;
    };
    const m = await h.run(m0);
    assert.deepEqual(h.log.errors, []);
    assert.equal(m.review.quarantena.completo, true, m.review.quarantena.motivo);
    assert.equal(h.log.flashMaterials.length, 1, 'le flashcard sono nate col nodo nuovo sulla tela');
    assert.ok(h.log.flashMaterials[0].includes('Dettaglio 0'), 'i discendenti veri del ramo ci sono');
    assert.ok(!h.log.flashMaterials[0].includes(NUOVO), 'il nodo che nessuno ha esaminato non entra');
    assert.ok(!h.log.g2Materials[0].includes(NUOVO));
});

/* ── Packet 0042, giro 3 del 26/09 ────────────────────────────────────────── */
test('0042 giro 3 (D5): sotto quarantena la pipeline apre il Banco di G2 col piano chiesto al motore; da spento la chiamata è quella di sempre', async () => {
    // da spento, con lo strato caricato: la stessa chiamata di oggi, con le stesse opzioni e senza `alza`
    const senza = runtime(), con = runtime({ affermazioni: true });
    for (const h of [senza, con]) { let m = await h.fresh(config(false)); m = await h.approveMap(m); await h.run(m); }
    const g2 = h => h.log.opened.filter(o => o.final).map(o => ({ alza: o.alza, chiavi: o.chiavi }));
    assert.ok(g2(senza).length, 'il Banco di G2 si apre');
    assert.deepEqual(g2(con), g2(senza));
    g2(con).forEach(o => assert.deepEqual(o, { alza: false, chiavi: ['final', 'onContinue'] }));
    // sotto quarantena «Genera materiali» può partire da una console: il Banco di G2 si alza (trappola 52)
    const { h, m: m0 } = await inQuarantena();
    await h.run(m0);
    assert.deepEqual(h.log.errors, []);
    const ultimo = h.log.opened.at(-1);
    assert.deepEqual([ultimo.final, ultimo.alza], [true, true]);
    assert.deepEqual(ultimo.chiavi, ['alza', 'final', 'onContinue']);
    // il Banco dei contenuti aperto dal cancello di oggi (prima di accendere) resta senza `alza`
    assert.deepEqual([h.log.opened[0].final, h.log.opened[0].alza], [false, false]);
});

test('0042 giro 3 (D6): «Riprova il controllo» che allarga la copertura invalida le bozze, anche con le stesse segnalazioni', async () => {
    const stretto = copy(Q_RAPPORTO);
    stretto.stato = 'parziale';
    stretto.copertura = { nodiEsaminati: ['root', 'gold', 'detail-0', 'detail-1'], nodiSaltati: [{ id: 'detail-2', motivo: 'tempo scaduto' }] };
    const { h, m: m0 } = await inQuarantena({ rapporto: stretto });
    const primo = await h.run(m0);
    assert.deepEqual(h.log.errors, []);
    assert.equal(primo.review.quarantena.completo, true, primo.review.quarantena.motivo);
    assert.deepEqual(primo.review.quarantena.nonEsaminati, ['detail-2']);
    const firmaVecchia = primo.review.quarantena.firma, prima = copy(h.log.calls);
    assert.equal(primo.review.drafts.B['mc-auto'].quarantena.firma, firmaVecchia);
    // «Riprova il controllo», come R.retryJudge: il Giudice esamina anche detail-2 e non trova niente di nuovo;
    // mergeRetry tiene segnalazioni e decisioni, conservaMateriali porta le bozze e toglie il record
    const m1 = h.disk();
    const next = RC.mergeRetry(m1.review, RC.createReview({ db: h.state.db, sources: m1.review.sources, report: copy(Q_RAPPORTO),
        generationId: m1.review.generationId, projectId: m1.review.projectId, vaultPath: m1.vaultPath, config: m1.review.config }));
    m1.review = h.w.MappAIAffermazioni.conservaMateriali(m1.review, next);
    assert.deepEqual(m1.review.initial.issues, primo.review.initial.issues, 'stesse segnalazioni');
    assert.deepEqual(m1.review.initial.decisions, primo.review.initial.decisions, 'stesse decisioni');
    assert.ok(m1.review.drafts.B['mc-auto'] && m1.review.final, 'le bozze e G2 passano al ricontrollo');
    assert.equal(m1.review.quarantena, undefined);
    const secondo = await h.run(m1);
    assert.deepEqual(h.log.errors, []);
    assert.equal(secondo.review.quarantena.completo, true, secondo.review.quarantena.motivo);
    assert.deepEqual(secondo.review.quarantena.nonEsaminati, []);
    assert.notEqual(secondo.review.quarantena.firma, firmaVecchia, 'la copertura sta nella firma');
    assert.equal(h.log.calls.mc, prima.mc + 1, 'le bozze B nate dalla copertura vecchia si rigenerano');
    assert.equal(h.log.calls.synthesis, prima.synthesis + 1, 'anche la sintesi');
    assert.equal(h.log.calls.judge, prima.judge + 1, 'e G2 ricontrolla i materiali nuovi');
    assert.equal(secondo.review.drafts.B['mc-auto'].quarantena.firma, secondo.review.quarantena.firma);
    assert.equal(secondo.review.final.quarantena.firma, secondo.review.quarantena.firma);
});

/* ── Packet 0042, giro 4 del 26/09 ────────────────────────────────────────── */
test('0042 giro 4 (E4): sotto quarantena, quando il record non consente, il Banco di G1 si apre col piano chiesto al motore; da spento la chiamata è quella di sempre', async () => {
    // da spento, con lo strato caricato: la stessa chiamata di oggi, due argomenti e nessuna opzione
    const senza = runtime(), con = runtime({ affermazioni: true });
    for (const h of [senza, con]) await h.fresh(config(false));
    const g1 = h => h.log.opened.filter(o => !o.final).map(o => ({ alza: o.alza, chiavi: o.chiavi, argomenti: o.argomenti }));
    assert.ok(g1(senza).length, 'il Banco di G1 si apre');
    assert.deepEqual(g1(con), g1(senza));
    g1(con).forEach(o => assert.deepEqual(o, { alza: false, chiavi: [], argomenti: 2 }));
    // accesa, e il record non consente: la mappa è cambiata sulla tela dopo il controllo
    const { h, m: m0 } = await inQuarantena();
    await h.run(m0);
    const calls = copy(h.log.calls), aperti = h.log.opened.length;
    h.state.db.nodes.find(n => n.id === 'gold').desc += ' Aggiunta sulla tela.';
    await h.run(h.disk());
    assert.deepEqual(h.log.calls, calls, 'nessun materiale nuovo');
    assert.equal(h.disk().review.quarantena.motivo, 'mappa_cambiata');
    assert.equal(h.log.opened.length, aperti + 1);
    const ultimo = h.log.opened.at(-1);
    assert.deepEqual({ final: ultimo.final, alza: ultimo.alza, chiavi: ultimo.chiavi }, { final: false, alza: true, chiavi: ['alza'] },
        'il cancello di oggi apre il Banco di G1 sopra la console (trappola 52)');
});

/* ── Packet 0042, giro 7 del 26/09 ────────────────────────────────────────── */
test('0042 giro 7 (H11): «Genera materiali» con G2 in attesa riapre il Banco di G2 col piano chiesto al motore sotto quarantena; da spenta la chiamata è quella di sempre', async () => {
    const tick = () => new Promise(r => setTimeout(r, 20));
    const riapri = async (opts, accendi) => {
        const storage = spenti0089();
        const h = runtime(Object.assign({ storage }, opts));
        let m = await h.fresh(config(false)); m = await h.approveMap(m); m = await h.run(m);
        assert.equal(m.review.final.stage, 'awaiting_review');
        if (accendi) { storage.set('mappai_affermazioni', '1'); storage.set('mappai_quarantena', '1'); }
        const aperti = h.log.opened.length, calls = copy(h.log.calls);
        await h.w.MappAIPipeline.runApprovedMaterials({ quiz: { types: ['mc'], perBranch: 2, angle: 'auto' } },
            { vaultPath: m.vaultPath, revision: m.review.approvedRevision });
        await tick();
        assert.deepEqual(h.log.errors, []);
        assert.deepEqual(h.log.calls, calls, 'nessun materiale nuovo: si riprende G2');
        assert.equal(h.log.opened.length, aperti + 1, 'il Banco di G2 si riapre');
        const o = h.log.opened.at(-1);
        return { final: o.final, alza: o.alza, chiavi: o.chiavi, argomenti: o.argomenti };
    };
    const oggi = await riapri({}, false);
    assert.deepEqual(oggi, { final: true, alza: false, chiavi: ['final'], argomenti: 3 });
    // lo strato caricato e spento: la stessa chiamata
    assert.deepEqual(await riapri({ affermazioni: true }, false), oggi);
    // la quarantena accesa: il Banco di G2 chiede il piano al motore (trappola 52)
    assert.deepEqual(await riapri({ affermazioni: true }, true), { final: true, alza: true, chiavi: ['alza', 'final'], argomenti: 3 });
});

/* ── Packet 0042, gate 3 del 27/09 ────────────────────────────────────────────
   Aprendo un progetto con G1 in attesa, `checkResume` apre il Banco da solo. Se
   il progetto si apre da dentro ELABORA la console resta aperta, e il Banco a z
   3400 restava sotto (misurato in Electron): sotto quarantena chiede il piano
   al motore. Con G1 facoltativa niente Banco; su un progetto senza rapporto
   del controllo G1 non è facoltativa (prima proponeva «Riprendi» e il Banco
   compariva dopo). Quarantena spenta: la chiamata di sempre. */
test('0042 gate 3: aprendo il progetto, il Banco di G1 sotto quarantena si alza; senza rapporto niente «Riprendi»; spenta come oggi', async () => {
    const { h, m, storage } = await inQuarantena();
    const apri = async manifest => {
        h.w.electronAPI.vaultMaterialsList = async () => ({ ok: true, manifest: copy(manifest) });
        h.state.activeVaultPath = manifest.vaultPath;
        h.log.opened.length = 0;
        h.w.document.getElementById('mp-resume')?.remove?.();
        await h.w.MappAIPipeline.checkResume(manifest.vaultPath);
        return { opened: h.log.opened.map(o => ({ alza: o.alza, chiavi: o.chiavi, argomenti: o.argomenti })), riprendi: !!h.w.document.getElementById('mp-resume') };
    };
    const vecchio = copy(m);
    vecchio.review.initial.report = {}; vecchio.review.initial.checkStatus = 'unavailable'; delete vecchio.review.initial.previousReports;
    storage.set('mappai_quarantena', '0');
    assert.deepEqual(await apri(vecchio), { opened: [{ alza: false, chiavi: [], argomenti: 2 }], riprendi: false }, 'spenta: il Banco di sempre');
    storage.set('mappai_quarantena', '1');
    assert.deepEqual((await apri(m)).opened, [], 'rapporto e fonti: G1 facoltativa, niente Banco');
    assert.deepEqual(await apri(vecchio), { opened: [{ alza: true, chiavi: ['alza'], argomenti: 3 }], riprendi: false },
        'senza rapporto: G1 non facoltativa, il Banco subito e sopra la console');
});

function readingPipelineFixture() {
    const h = runtime(), vaultPath = '/fake/Generico/Testo';
    h.state.extractionMode = 'lettura'; h.state.activeVaultPath = vaultPath;
    h.w.StorageManager = { currentProjectId: 'project' };
    const source = { items: [{ id: 'p1', kind: 'reading-paragraph', text: GOLD, blockType: 'paragraph', emphasis: [], order: 0 }] };
    const review = RC.createReview({ db: source, sources: h.state.sources, checkStatus: 'unavailable',
        generationId: 'lettura', projectId: 'project', vaultPath });
    const approved = RC.beginApproval(review, source, { manualReview: true });
    const m = PC.createManifest({}, { vaultPath }); m.steps.A.status = 'done';
    m.review = RC.completeApproval(approved.review, approved.review.approvedRevision);
    m.reading = { kind: 'percorso-lettura', extractionMode: 'lettura', projectId: 'project', percorsoId: 'percorso', sourceId: 'fonte',
        sourcePath: 'Materiale Studio/Sorgenti/Percorso-lettura-percorso.json' };
    h.state._pipelineManifest = m;
    let readingOpens = 0;
    h.w.MappAIPercorsoLettura = { openCurrent: async () => { readingOpens++; return 'percorso-aperto'; } };
    h.w.executeJudgePass = async () => { h.log.calls.judge++; throw new Error('Giudice mappa vietato sul percorso.'); };
    return { ...h, m, readingOpens: () => readingOpens };
}

test('0070 pipeline: ripresa e materiali approvati di un percorso rinviano prima di sostituire registro, giudicare o scrivere', async () => {
    const h = readingPipelineFixture(), p = h.w.MappAIPipeline, before = JSON.stringify(h.state);
    assert.equal(await p.run(config(false), { only: ['B'], vaultPath: h.m.vaultPath, manifest: copy(h.m) }), 'percorso-aperto');
    assert.equal(await p.runApprovedMaterials(config(false), { vaultPath: h.m.vaultPath, revision: h.m.review.approvedRevision }), 'percorso-aperto');
    assert.equal(h.readingOpens(), 2); assert.equal(h.state._pipelineManifest, h.m);
    assert.equal(JSON.stringify(h.state), before);
    assert.equal(h.log.writes.length, 0); assert.equal(h.log.pdfs.length, 0); assert.equal(h.log.tuning.length, 0);
    assert.ok(Object.values(h.log.calls).every(n => n === 0)); assert.equal(p.occupata(), false);
});

test('0070 pipeline: manifest o target di un altro progetto non sostituisce la lettura attiva e non apre un runtime mancante', async () => {
    const h = readingPipelineFixture(), p = h.w.MappAIPipeline, before = JSON.stringify(h.state);
    const foreign = copy(h.m); foreign.reading.projectId = 'altro-progetto';
    await assert.rejects(p.run(config(false), { only: ['B'], vaultPath: h.m.vaultPath, manifest: foreign }), /progetto è cambiato/);
    await assert.rejects(p.run(config(false), { only: ['B'], vaultPath: '/altro-vault', manifest: h.m }), /progetto è cambiato/);
    const map = PC.createManifest({}, { vaultPath: h.m.vaultPath }); map.review = copy(h.m.review);
    await assert.rejects(p.run(config(false), { only: ['B'], vaultPath: h.m.vaultPath, manifest: map }), /progetto è cambiato/);
    await assert.rejects(p.runApprovedMaterials(config(false), { vaultPath: h.m.vaultPath, revision: 'obsoleta' }), /progetto è cambiato/);
    delete h.w.MappAIPercorsoLettura;
    await assert.rejects(p.run(config(false), { only: ['B'], manifest: h.m }), /non è disponibile/);
    assert.equal(h.readingOpens(), 0); assert.equal(JSON.stringify(h.state), before);
    assert.equal(h.log.writes.length, 0); assert.ok(Object.values(h.log.calls).every(n => n === 0));
});

test('0070 CREA: una nuova pipeline senza manifest può ancora generare una mappa dopo un progetto di lettura', async () => {
    const h = readingPipelineFixture(), old = JSON.stringify(h.m), start = h.w.startGeneration;
    h.w.startGeneration = async () => { await start(); h.state.extractionMode = 'mindmap'; };
    const created = await h.fresh({});
    assert.equal(h.log.calls.map, 1); assert.equal(h.readingOpens(), 0);
    assert.equal(h.state.extractionMode, 'mindmap'); assert.equal(created.reading, undefined);
    assert.notEqual(created.vaultPath, h.m.vaultPath);
    assert.equal(JSON.stringify(h.m), old); assert.ok(h.log.writes.length > 0);
});

/* ── Packet 0088, B14 (Giacomo, 12/10 sera: «a, nello 0088 per la beta.6») ──────────────
   Alla chiusura di una G2 nata da CREA si esce da CREA e si apre ELABORA sul progetto.
   L'origine è dichiarata: `_startFromModal` (l'ingresso di CREA) passa `daCrea: true` a `run`;
   ELABORA e INSEGNA riprendono col manifesto e non lo passano. Con «Salva e continua più tardi»
   la G2 chiama `dopoChiusura`; con «Continua» la continuazione porta `daCrea` e la coda di `run`
   svuota CREA e apre ELABORA PRIMA del riepilogo (come fa già il dossier, 0067). */
function crea(h) {
    const log = { apriProgetto: [], tolte: [] };
    h.w.StorageManager = { currentProjectId: 'project', saveCurrentProject() {} };
    h.w.MappAIElabora = { openProject(id) { log.apriProgetto.push(id); }, openFromMap() { log.apriProgetto.push('(mappa)'); } };
    h.w.removeSource = id => { log.tolte.push(id); h.state.sources = h.state.sources.filter(s => s.id !== id); };
    for (const [id, value] of [['root-node-name', 'Svizzera'], ['focus-input', 'solo l\'oro']]) {
        const el = h.w.document.createElement(); el.id = id; el.value = value; h.w.document.body.appendChild(el);
    }
    h.w.updateFocusFromLenses = () => { h.state.focusTopic = h.w.document.getElementById('focus-input').value; };
    h.state.focusTopic = 'solo l\'oro';
    return log;
}
const attendi = ms => new Promise(r => setTimeout(r, ms));

test('0088 B14: un giro da CREA (`daCrea`) dà alla G2 «dopoChiusura», che svuota CREA e apre ELABORA sul progetto; G1 e i giri senza `daCrea` non cambiano', async () => {
    const h = runtime(), log = crea(h), P = h.w.MappAIPipeline;
    await P.run(config(false), { daCrea: true });
    assert.deepEqual(h.log.errors, []);
    let m = h.disk();
    const g1 = h.log.opened[0];
    assert.deepEqual([g1.final, g1.chiavi], [false, []], 'G1 non riceve niente di nuovo');
    m = await h.approveMap(m);
    await P.run(m.config, { only: ['B', 'C', 'D', 'E'], vaultPath: m.vaultPath, manifest: m, daCrea: true });
    const g2 = h.log.opened.at(-1);
    assert.deepEqual([g2.final, g2.chiavi], [true, ['dopoChiusura', 'final', 'onContinue']]);
    assert.equal(typeof g2.opzioni.dopoChiusura, 'function');
    assert.deepEqual(log.apriProgetto, [], 'aprire la G2 non apre ELABORA: lo fa la sua chiusura');
    assert.ok(h.state.sources.length >= 1, 'in CREA c\'è ancora la fonte');
    g2.opzioni.dopoChiusura();                                   // «Salva e continua più tardi»
    assert.deepEqual(log.apriProgetto, ['project'], 'ELABORA sul progetto corrente, con la strada di INSEGNA');
    assert.deepEqual(log.tolte, ['pdf']); assert.deepEqual(h.state.sources, []);
    assert.equal(h.w.document.getElementById('root-node-name').value, '');
    assert.equal(h.w.document.getElementById('focus-input').value, ''); assert.equal(h.state.focusTopic, '');
    assert.equal(h.w.document.getElementById('mp-summary'), null, 'nessun riepilogo: i materiali non sono stati generati');
    // lo stesso giro senza `daCrea` (ELABORA, INSEGNA): le chiavi di oggi
    const e = runtime(); let me = await e.fresh(config(false)); me = await e.approveMap(me); await e.run(me);
    assert.deepEqual(e.log.opened.at(-1).chiavi, ['final', 'onContinue']);
});

test('0088 B14: «Continua» — la continuazione porta `daCrea`, e a materiali finiti CREA si svuota ed ELABORA si apre PRIMA del riepilogo', async () => {
    const h = runtime(), log = crea(h), P = h.w.MappAIPipeline;
    await P.run(config(false), { daCrea: true });
    let m = await h.approveMap(h.disk());
    await P.run(m.config, { only: ['B', 'C', 'D', 'E'], vaultPath: m.vaultPath, manifest: m, daCrea: true });
    const g2 = h.log.opened.at(-1);
    m = await h.approveMaterials(h.disk());                      // le decisioni di G2, poi «Continua»
    await g2.opzioni.onContinue(m);
    assert.deepEqual(h.log.errors, []);
    assert.equal(h.disk().review.final.stage, 'done');
    assert.deepEqual(log.apriProgetto, ['project']); assert.deepEqual(h.state.sources, []);
    assert.equal(h.w.document.getElementById('mp-summary'), null, 'il riepilogo aspetta la console');
    await attendi(800);
    assert.ok(h.w.document.getElementById('mp-summary'), 'poi arriva, sopra ELABORA');
});

test('0088 B14: la stessa continuazione SENZA `daCrea` (ripresa da ELABORA o INSEGNA) non tocca CREA e non apre ELABORA; il riepilogo è subito', async () => {
    const h = runtime(), log = crea(h);
    let m = await h.fresh(config(false)); m = await h.approveMap(m); await h.run(m);
    m = await h.approveMaterials(h.disk());
    await h.run(m);
    assert.deepEqual(h.log.errors, []);
    assert.equal(h.disk().review.final.stage, 'done');
    assert.deepEqual(log.apriProgetto, []); assert.deepEqual(log.tolte, []);
    assert.ok(h.state.sources.length >= 1);
    assert.equal(h.w.document.getElementById('root-node-name').value, 'Svizzera');
    assert.ok(h.w.document.getElementById('mp-summary'), 'il riepilogo di sempre, senza attesa');
});

/* ── Packet 0088, B15 (Giacomo, 12/10 sera: «vai con B15, testi ok») ─────────────────────
   «Rivedi i contenuti» nel riepilogo chiede conferma col motore dei modali prima di aprire G1, e dice che cosa
   succede: con la G2 consegnata i materiali restano come sono; con materiali in attesa le bozze dipendenti si
   rifanno. «Annulla» lascia il riepilogo dov'è. Senza motore il gesto resta quello di prima (prova sopra). */
async function riepilogoConRivedi() {
    // la stessa strada della prova 0042 qui sopra: G2 approvata, poi il giro che consegna e apre il riepilogo
    const { h, m: m0 } = await inQuarantena();
    await h.run(m0);
    await h.approveMaterials(h.disk());
    h.w.getSystemKey = () => '';
    await h.run(h.disk());
    assert.equal(h.disk().review.final.stage, 'done');
    const riepilogo = h.w.document.getElementById('mp-summary');
    assert.ok(riepilogo && riepilogo.querySelector('#mps-rivedi'), 'il riepilogo ha «Rivedi i contenuti»');
    return { h, riepilogo };
}
test('0088 B15: «Rivedi i contenuti» chiede conferma; «Annulla» non apre G1 e il riepilogo resta', async () => {
    const { h, riepilogo } = await riepilogoConRivedi();
    const chieste = [];
    h.w.MappAIModal = { conferma: async o => { chieste.push(o); return false; } };
    const aperti = h.log.opened.length;
    await riepilogo.querySelector('#mps-rivedi').onclick();
    assert.equal(chieste.length, 1);
    assert.equal(chieste[0].titolo, 'Tornare ai contenuti?');
    assert.equal(chieste[0].conferma, 'Apri i contenuti'); assert.equal(chieste[0].annulla, 'Annulla');
    assert.equal(h.log.opened.length, aperti, 'G1 non si apre');
    assert.ok(h.w.document.getElementById('mp-summary'), 'il riepilogo è ancora lì');
});
test('0088 B15: con la conferma G1 si apre col piano chiesto al motore; il testo dipende dallo stato dei materiali', async () => {
    const { h, riepilogo } = await riepilogoConRivedi();
    const chieste = [];
    h.w.MappAIModal = { conferma: async o => { chieste.push(o); return true; } };
    const stage = h.disk().review.final && h.disk().review.final.stage;
    const aperti = h.log.opened.length;
    await riepilogo.querySelector('#mps-rivedi').onclick();
    assert.equal(h.log.opened.length, aperti + 1);
    assert.deepEqual([h.log.opened.at(-1).final, h.log.opened.at(-1).alza], [false, true]);
    assert.equal(h.w.document.getElementById('mp-summary'), null, 'il riepilogo si chiude');
    const atteso = stage === 'done' ? /appena completati restano come sono/ : /in attesa restano salvati/;
    assert.match(chieste[0].testo, atteso);
    // l'altro testo, forzando lo stato opposto sul manifesto del riepilogo
    const { h: h2, riepilogo: r2 } = await riepilogoConRivedi();
    const testi = [];
    h2.w.MappAIModal = { conferma: async o => { testi.push(o.testo); return false; } };
    const m2 = h2.w.MappAIPipeline._lastRun.manifest;
    m2.review.final = Object.assign({}, m2.review.final || {}, { stage: stage === 'done' ? 'awaiting_review' : 'done' });
    await r2.querySelector('#mps-rivedi').onclick();
    assert.match(testi[0], stage === 'done' ? /in attesa restano salvati/ : /appena completati restano come sono/);
});

/* 0097 (Giacomo, 15/10 sera: «mettilo nel 0097»): «Riprendi» su una G1 approvata e poi superata, col controllo nuovo che non può
   partire (la chiave del provider manca). `requireApproved` lancia PRIMA del try di `Pipeline.run`, e «Riprendi» non raccoglie
   l'errore: l'avviso rosso si perdeva. Ora il cancello lo mostra come avviso e il giro finisce senza lanciare. */
test('0097: «Riprendi» col controllo nuovo che non può partire mostra l’avviso e non lancia', async () => {
    const h = runtime();
    let m = await h.fresh(config(false));
    m = await h.approveMap(m);
    h.w.MappAIReview.requireApproved = async () => { throw new Error('Chiave del provider mancante.'); };
    await assert.doesNotReject(() => h.run(m));
    assert.ok(h.log.toasts.some(x => x.message === 'Chiave del provider mancante.' && x.type === 'error'), JSON.stringify(h.log.toasts));
    assert.equal(h.log.calls.mc, 0, 'niente materiali');
    assert.equal(h.w.MappAIPipeline.occupata(), false, 'il giro non resta occupato');
});
