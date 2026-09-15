'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require('../public/js/mappai-pipeline-core.js');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

test('primo lotto su sei rami: 24 domande richieste, 12 chiamate quiz e soltanto una sintesi', () => {
    const cfg = PC.initialBatchOptions();
    assert.deepEqual(cfg.quiz.types, ['mc', 'open']);
    assert.equal(6 * cfg.quiz.types.length * cfg.quiz.perBranch, 24);
    assert.deepEqual(PC.multiTypes(cfg.quiz), []);
    assert.equal(cfg.nodesheet, undefined);
    assert.deepEqual(PC.estimateCalls(cfg, { branches: 6, nodes: 53, willGenerateMap: false }).perStep,
        { A: 0, B: 12, C: 0, D: 7, E: 0 });
    assert.deepEqual(PC.presetNormalize({ options: PC.presetFromConfig(cfg) }).options, cfg);
    assert.equal(PC.quotaBase(2, 40), 1, 'la coppia richiede un avvio e un ponte');
});

function presetRuntime(saved = {}) {
    const store = new Map(Object.entries(saved)), elements = new Map();
    ['mn-bento', 'mp-preset', 'mp-perbranch', 'mp-angle', 'mp-quiz-on', 'mp-qt-mixed', 'mp-qt-mc', 'mp-qt-open', 'mp-qt-fc',
        'mp-ns-on', 'mp-ns-title', 'mp-ns-card', 'mp-ns-keywords', 'mp-ns-summary',
        'mp-syn-on', 'mp-syn-audio', 'mp-src-pdf', 'mp-ns-causal', 'mp-adapt-on',
        ...PC.angoliMulti().map(x => 'mp-ang-' + x)].forEach(id => elements.set(id, { value: '', checked: false }));
    let memoryWrites = 0;
    const context = { appState: { db: {} }, MappAIPipelineCore: PC,
        MappAICostruisci: { memorizza() { memoryWrites++; } },
        document: { getElementById: id => elements.get(id) || null, querySelector: () => null },
        localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
        console: { log() {} } };
    context.window = context;
    // Expose the real private form reader only inside this isolated fixture.
    vm.runInNewContext(read('mappai-material-pipeline.js').replace('function _readConfig() {', 'Pipeline.readConfig = _readConfig; function _readConfig() {'), context);
    return { context, pipeline: context.MappAIPipeline, store, elements, memoryWrites: () => memoryWrites };
}

test('nuova installazione: preset iniziale selezionato e altre produzioni facoltative', () => {
    const h = presetRuntime();
    const active = h.pipeline.assicuraPresetDefault();
    assert.deepEqual(copy(active.options), PC.initialBatchOptions());
    assert.equal(h.elements.get('mp-perbranch').value, 2);
    assert.equal(h.elements.get('mp-qt-fc').checked, false);
    assert.equal(h.elements.get('mp-ns-on').checked, false);
    assert.equal(h.elements.get('mp-qt-mixed').checked, true);
    assert.equal(h.elements.get('mp-qt-mc').checked, false);
    assert.equal(h.elements.get('mp-qt-open').checked, false);
    assert.equal(h.elements.get('mp-perbranch').disabled, true);
    assert.equal(h.elements.get('mp-syn-on').checked, true);
    assert.equal(h.memoryWrites(), 0, 'il boot lascia intatta la memoria del bento prima del ripristino');
    h.pipeline.assicuraPresetDefault();
    assert.equal(JSON.parse(h.store.get('mappai_material_presets')).length, 1, 'nessun duplicato a ogni avvio');
});

test('preset storico e scelte correnti conservati, primo lotto applicato soltanto con un gesto esplicito', () => {
    const historical = PC.presetNormalize({ id: 'teacher', name: 'Default', options: {
        quiz: { types: ['mc', 'open', 'flashcards'], perBranch: 6, angle: 'confronto', multi: ['mc', 'open'], angoli: PC.angoliMulti() },
        nodesheet: { modes: ['title'], maxLevel: 'all', fmt: '2x2' }, synthesis: { audio: true }, causal: true
    } });
    const memory = '{"mp-perbranch":"8","mp-qt-open":false}';
    const h = presetRuntime({ mappai_material_presets: JSON.stringify([historical]),
        mappai_preset_attivo: 'teacher', mappai_bento_scelte: memory });
    assert.equal(h.pipeline.assicuraPresetDefault().id, 'teacher');
    assert.equal(h.elements.get('mp-perbranch').value, 6);
    assert.equal(h.elements.get('mp-ns-title').checked, true);
    assert.equal(h.store.get('mappai_bento_scelte'), memory);
    assert.deepEqual(JSON.parse(h.store.get('mappai_material_presets')).find(p => p.id === 'teacher'), historical);
    h.pipeline.applyInitialBatch();
    assert.equal(h.elements.get('mp-perbranch').value, 2);
    assert.equal(h.elements.get('mp-qt-fc').checked, false);
    assert.equal(h.elements.get('mp-syn-audio').checked, false);
    assert.equal(h.elements.get('mp-ns-on').checked, false);
    assert.equal(h.elements.get('mp-ns-title').checked, false, 'il master derivato del bento non deve riaccendere i fogli nodi');
    PC.angoliMulti().forEach(k => assert.equal(h.elements.get('mp-ang-' + k).checked, false));
    assert.equal(h.memoryWrites(), 1);
    assert.equal(h.store.get('mappai_preset_attivo'), 'mappai-first-batch-v1');
});

test('applicare un preset nel modale isola i campi omonimi e la memoria del bento sottostante', () => {
    const h = presetRuntime();
    h.pipeline.assicuraPresetDefault();
    h.elements.get('mp-perbranch').value = '5';
    const modalFields = new Map([...h.elements].map(([id, field]) => [id, { ...field }]));
    h.elements.set('mp-modal', { id: 'mp-modal', querySelector: selector => modalFields.get(selector.replace(/^#/, '')) || null });
    h.pipeline.applyInitialBatch();
    assert.equal(modalFields.get('mp-perbranch').value, 2);
    assert.equal(h.elements.get('mp-perbranch').value, '5');
    assert.equal(h.memoryWrites(), 0);
});

test('Set misto resta un lotto di 2 MC e 2 aperte anche con quantità e angoli vecchi nel form', () => {
    const h = presetRuntime(); h.pipeline.assicuraPresetDefault();
    h.elements.get('mp-perbranch').value = '7';
    h.elements.get('mp-ang-causa').checked = true;
    const cfg = h.pipeline.readConfig();
    assert.deepEqual(copy(cfg.quiz), { types: ['mc', 'open'], mixed: true, perBranch: 2, angle: 'auto', multi: [], angoli: [] });
    assert.equal(PC.estimateCalls(cfg, { branches: 6, nodes: 53, willGenerateMap: false }).perStep.B, 12);
    h.elements.get('mp-qt-fc').checked = true;
    assert.deepEqual(copy(h.pipeline.readConfig().quiz.types), ['mc', 'open', 'flashcards']);
});

test('scegliere un formato separato esce da Set misto e ripristina quantità e angolazioni personalizzabili', () => {
    const h = presetRuntime(); h.pipeline.assicuraPresetDefault();
    h.elements.get('mp-qt-mc').checked = true;
    h.pipeline._syncQuizSelection('mp-qt-mc');
    assert.equal(h.elements.get('mp-qt-mixed').checked, false);
    assert.equal(h.elements.get('mp-perbranch').disabled, false);
    assert.equal(h.elements.get('mp-ang-causa').disabled, false);
    h.elements.get('mp-perbranch').value = '5';
    h.elements.get('mp-ang-causa').checked = true;
    assert.deepEqual(copy(h.pipeline.readConfig().quiz), { types: ['mc'], perBranch: 5, angle: 'auto', multi: ['mc'], angoli: ['causa'] });
    h.elements.get('mp-qt-mixed').checked = true;
    h.pipeline._syncQuizSelection('mp-qt-mixed');
    assert.equal(h.elements.get('mp-qt-mc').checked, false);
    assert.equal(h.elements.get('mp-qt-open').checked, false);
    assert.equal(h.elements.get('mp-ang-causa').checked, false);
    assert.equal(h.elements.get('mp-ang-causa').disabled, true);
    assert.equal(h.elements.get('mp-perbranch').value, 2);
});

test('i preset esistenti non ricevono output imposti dall’app', () => {
    const old = PC.initialBatchOptions(); delete old.quiz.mixed;
    const saved = [{ id: 'mappai-first-batch-v1', name: 'Primo lotto', options: old },
        { id: 'personal', name: 'Verifica lunga', options: { quiz: { types: ['mc'], perBranch: 8 } } }];
    const h = presetRuntime({ mappai_material_presets: JSON.stringify(saved) }); h.pipeline.assicuraPresetDefault();
    const result = JSON.parse(h.store.get('mappai_material_presets'));
    assert.deepEqual(result.find(p => p.id === 'mappai-first-batch-v1').options, old);
    assert.equal(result.find(p => p.id === 'personal').options.quiz.perBranch, 8);
    assert.equal(result.find(p => p.id === 'personal').options.quiz.mixed, undefined);
    const roundtrip = PC.presetNormalize({ options: PC.presetFromConfig(h.pipeline.readConfig()) });
    assert.equal(roundtrip.options.quiz.mixed, undefined);
    assert.deepEqual(copy(roundtrip.options.quiz.types), ['mc', 'open']);
});

test('una selezione esplicita senza varianti non viene riaccesa dalle vecchie angolazioni memorizzate', () => {
    const h = presetRuntime({ mappai_material_presets: JSON.stringify([{
        id: 'choice', name: 'Personale', options: { quiz: { types: ['mc'], perBranch: 4, multi: [], angoli: ['causa'] } }
    }]), mappai_preset_attivo: 'choice' });
    h.pipeline.assicuraPresetDefault();
    assert.equal(h.elements.get('mp-ang-causa').checked, false);
    assert.equal(h.elements.get('mp-qt-open').checked, false);
    assert.equal(h.elements.get('mp-perbranch').value, 4);
});

test('il filtro fra formati rimuove solo le copie letterali, senza eliminare una spiegazione sullo stesso concetto', () => {
    const other = [{ q: 'Quale circuito è in serie?', explanation: 'La stessa corrente attraversa tutti i componenti.' }];
    const generated = [{ question: 'QUALE circuito è in serie!' }, { question: 'Spiega perché nel circuito in serie la corrente è uguale in tutti i componenti.' }];
    const result = PC.removeCrossFormatCopies(generated, other);
    assert.deepEqual(result.removed, [generated[0]]);
    assert.deepEqual(result.items, [generated[1]]);
    assert.equal(generated.length, 2, 'nessuna mutazione degli originali');
    assert.match(PC.questionRoleBlock('mc', [], false), /distinzione fra concetti/);
    assert.match(PC.questionRoleBlock('open', other, true), /different student action/);
});

test('le differenze matematiche e scientifiche non diventano copie letterali', () => {
    for (const [q, question] of [
        ['Quando vale x > 3?', 'Quando vale x < 3?'],
        ['Calcola 2 + 3.', 'Calcola 2 - 3.'],
        ['Descrivi una carica +2 C.', 'Descrivi una carica -2 C.'],
        ['Calcola 2².', 'Calcola 22.']
    ]) {
        assert.deepEqual(PC.removeCrossFormatCopies([{ question }], [{ q }]).items, [{ question }]);
    }
});

test('generatore MC condiviso: scopo, contesto complementare e limite di quantità arrivano fino al risultato', async () => {
    const source = 'La stessa corrente attraversa tutti i componenti collegati in serie.';
    const produced = [0, 1, 2, 3].map(i => ({ q: 'Quale circuito è descritto nel caso ' + i + '?',
        options: ['Serie', 'Parallelo', 'Aperto'], correct: 'Serie', explanation: source, evidenza: source }));
    let request;
    const context = { MappAIPipelineCore: PC, getSystemKey: () => 'fixture', getMaxOutputTokens: n => n,
        fillPromptTemplate: () => 'Template personale senza variabili nuove.', injectClassTuning: x => x,
        salvageTruncatedJSON: JSON.parse, fetchModelAPI: async p => { request = p; return { candidates: [{ content: { parts: [{ text: JSON.stringify(produced) }] } }] }; },
        console: { log() {}, warn() {} } };
    context.window = context;
    vm.runInNewContext(read('mappai-study-session.js'), context);
    const items = await context.generateDynamicQuiz({ quantity: 2, material: source, angle: 'confronto',
        complementary: [{ question: 'Spiega perché la corrente è uguale nei componenti in serie.', guide: source }] });
    assert.equal(items.length, 2, 'un provider che ignora maxItems non amplia il lotto');
    assert.match(request.contents[0].parts[0].text, /FUNZIONE MC/);
    assert.match(request.contents[0].parts[0].text, /Spiega perché la corrente è uguale/);
    assert.match(request.contents[0].parts[0].text, /un CONFRONTO/);
    assert.equal(request.generationConfig.responseSchema.maxItems, 2);
});


test('Salva seleziona il nuovo preset e conserva output, quantità e opzioni della sintesi', () => {
    const h = presetRuntime(); h.pipeline.assicuraPresetDefault();
    h.elements.set('mp-fc-count', { value: '9', checked: false });
    h.elements.get('mp-qt-fc').checked = true;
    h.elements.get('mp-syn-audio').checked = true;
    h.elements.get('mp-src-pdf').checked = false;
    h.context.showPrompt = (_title, _value, commit) => commit('Materiali scelti');
    h.pipeline._savePreset();
    const selected = h.elements.get('mp-preset').value;
    const saved = JSON.parse(h.store.get('mappai_material_presets')).find(p => p.id === selected);
    assert.equal(saved.name, 'Materiali scelti');
    assert.deepEqual(saved.options.quiz.types, ['mc', 'open', 'flashcards']);
    assert.equal(saved.options.quiz.mixed, true);
    assert.equal(saved.options.quiz.perTipo.flashcards, 9);
    assert.equal(saved.options.quiz.perBranch, 2);
    assert.equal(saved.options.sourcePdf, false);
    assert.equal(saved.options.synthesis.audio, true);
    h.elements.get('mp-fc-count').value = '1'; h.pipeline._applyPreset();
    assert.equal(h.elements.get('mp-fc-count').value, 9);
    assert.equal(h.elements.get('mp-fc-count').disabled, false);
    assert.equal(h.store.get('mappai_material_last_used'), undefined, 'salvare non significa aver generato');
});

test('il preset usato per generare prevale su un preset solo selezionato successivamente', () => {
    const used = { presetId: 'used', options: { quiz: { types: ['flashcards'], perBranch: 4, perTipo: { flashcards: 8 } }, sourcePdf: false } };
    const h = presetRuntime({ mappai_material_last_used: JSON.stringify(used), mappai_preset_attivo: 'other',
        mappai_material_presets: JSON.stringify([{ id: 'used', name: 'Usato', options: used.options }, { id: 'other', name: 'Altro', options: PC.initialBatchOptions() }]) });
    h.elements.set('mp-fc-count', { value: '1' });
    const restored = h.pipeline.assicuraPresetDefault();
    assert.equal(restored.id, 'used'); assert.equal(restored.usedForGeneration, true);
    assert.equal(h.elements.get('mp-qt-mixed').checked, false);
    assert.equal(h.elements.get('mp-qt-mc').checked, false);
    assert.equal(h.elements.get('mp-qt-open').checked, false);
    assert.equal(h.elements.get('mp-qt-fc').checked, true);
    assert.equal(h.elements.get('mp-fc-count').value, 8);
    assert.equal(h.elements.get('mp-syn-on').checked, false);
});
