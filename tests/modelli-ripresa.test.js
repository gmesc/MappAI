'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { runtime, B1, PC, GOLD } = require('../tools/smoke/modelli-nei-flussi.js');

for (const enabled of [true, false]) test(`apertura dallo storico: provider Setup conservato solo con B2 ${enabled}`, async () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const source = fs.readFileSync(require.resolve('../public/js/mappai-storage-lang.js'), 'utf8');
    const method = source.slice(source.indexOf('    loadProject: async function'), source.indexOf('    deleteProject: function'));
    const snapshot = { aiProvider: 'google', generationUsage: { usedProvider: 'google', usedModel: 'gemini-storico' }, db: { nodes: [], links: [] } };
    const values = new Map([['ai_provider', 'infomaniak'], ['mappai_multimodello', enabled ? '1' : '0'],
        ['mappai_modelli_infomaniak', JSON.stringify(B1.profile())], ['old', JSON.stringify(snapshot)]]);
    const c = { console, setTimeout() {}, document: { getElementById: () => null },
        localStorage: { getItem: key => values.get(key) || null }, switchToMapLayout() {},
        showAlert() {}, showLoadingOverlay() {} };
    c.window = c; vm.createContext(c);
    vm.runInContext('let appState = {aiProvider: "infomaniak"}; let simulation; const StorageManager = {' + method + '};', c);
    for (const file of ['mappai-modelli-core.js', 'mappai-modelli.js'])
        vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + file), 'utf8'), c);
    assert.equal(await vm.runInContext('StorageManager.loadProject("old")', c), true);
    const state = vm.runInContext('appState', c);
    assert.equal(state.aiProvider, enabled ? 'infomaniak' : 'google');
    assert.equal(values.get('ai_provider'), 'infomaniak');
    assert.equal(state.generationUsage.usedModel, 'gemini-storico');
    if (enabled) {
        assert.equal(c.MappAIModelli.profiloSetup().provider, 'infomaniak');
        assert.deepEqual(B1.plain(state.generationUsage.provenienzaMappa), { provider: 'google', model: 'gemini-storico' });
        // Anche una riapertura dello snapshot B2 deve mantenere la provenienza originale.
        values.set('old', JSON.stringify(state));
        await vm.runInContext('StorageManager.loadProject("old")', c);
        assert.equal(vm.runInContext('appState.generationUsage.provenienzaMappa.provider', c), 'google');
    } else assert.deepEqual(B1.plain(state.generationUsage), snapshot.generationUsage);
});

test('apertura reale di un vault Google conserva il Setup Infomaniak e usa materiali Infomaniak', async () => {
    const h = runtime(); h.load('public/js/mappai-vault-manager.js');
    h.window.setTutorState = () => {}; h.window.switchToMapLayout = () => {};
    const data = B1.plain(h.state.db);
    data.aiProvider = 'google'; data.aiModel = 'gemini-storico'; data.rootNodeLabel = 'Circuiti';
    data.generationUsage = { usedModel: 'gemini-storico', usedProvider: 'google' };
    const manifest = PC.createManifest({}); manifest.sources = h.state._generationSources; data._pipelineManifest = manifest;
    h.window.electronAPI.loadVault = async () => ({ success: true, data });
    await h.window.directLoadVault('/vault/google');
    assert.equal(h.state._reviewRestoreError, undefined, h.logs.join('\n'));
    assert.equal(h.state.aiProvider, 'infomaniak'); assert.equal(h.elements['model-select'].value, 'modello-ui');
    const result = await h.window.MappAIPipeline.generaSet({ tipo: 'flashcards', quantita: 1 });
    assert.equal(result.ok, true, result.errore);
    assert(h.calls.every(c => c.provider === 'infomaniak' && c.payload.model === 'materiali-test'));
    assert.equal(h.state.generationUsage.usedModel, 'gemini-storico');
    h.load('public/js/mappai-vault-io.js'); h.window.tutorState = null; h.window.serializeTutorState = x => x;
    const saved = h.window.buildVaultMapData();
    assert.equal(saved.aiProvider, 'google'); assert.equal(saved.aiModel, 'gemini-storico');
});

test('ripresa dell’orchestratore rilegge fonti salvate e conserva i modelli dopo un cambio Setup', async () => {
    const first = runtime(); await first.window.MappAIPipeline.run({ quiz: { types: ['flashcards'], perBranch: 1 } });
    const manifest = first.manifest(), previous = manifest.modelliGiro.runId;
    manifest.steps.B.status = 'failed';
    const h = runtime({ disk: first.disk }); h.state.db = B1.plain(first.state.db);
    h.state.activeVaultPath = manifest.vaultPath; h.storageManager.currentProjectId = 'ripresa';
    h.state._generationSources = []; h.state.sources = []; h.state._pipelineManifest = manifest;
    h.state.aiProvider = 'google'; h.keys.infomaniak = 'secret-rinnovato';
    await h.window.MappAIPipeline.run(manifest.config, { only: ['B'], manifest, vaultPath: h.state.activeVaultPath });
    const saved = h.manifest(); assert.equal(saved.steps.B.status, 'done', h.logs.join('\n'));
    assert.equal(saved.modelliGiro.previousRunId, previous);
    assert(h.calls.every(c => c.payload.model === 'materiali-test' && c.apiKey === 'secret-rinnovato'));
    assert(h.window.MappAIEvidence.indice());
});

test('fonti non salvabili: nessuna chiamata materiali; indice non salvabile: fonti conservate e lavoro in memoria', async () => {
    const h = runtime(), realSave = h.window.electronAPI.saveVaultFile;
    h.window.electronAPI.saveVaultFile = async args => args.relPath === 'pipeline.json' ? { ok: false, error: 'disco pieno' } : realSave(args);
    const result = await h.window.MappAIPipeline.generaSet({ tipo: 'flashcards', quantita: 1 });
    assert.equal(result.ok, false); assert.match(result.errore, /disco pieno/); assert.equal(h.calls.length, 0);
    const other = runtime(), otherSave = other.window.electronAPI.saveVaultFile;
    other.window.electronAPI.saveVaultFile = async args => args.relPath === 'evidenze.json' ? { ok: false, error: 'indice non scritto' } : otherSave(args);
    const ok = await other.window.MappAIPipeline.generaSet({ tipo: 'flashcards', quantita: 1 });
    assert.equal(ok.ok, true, ok.errore); assert(other.manifest().sources.length); assert(other.window.MappAIEvidence.indice());
    assert(other.logs.some(l => l.includes('disponibile in memoria')), other.logs.join('\n'));
});

test('profili e credenziali invalidi bloccano la ripresa prima della rete', () => {
    const h = runtime(), m = PC.createManifest({ modelli: h.profile });
    h.keys.infomaniak = ''; assert.throws(() => h.window.MappAIModelli.avvia({ manifest: m }), /Chiave/);
    h.keys.infomaniak = 'secret-info-a'; m.config.modelli.modelli.materiali = '';
    assert.throws(() => h.window.MappAIModelli.avvia({ manifest: m })); assert.equal(h.calls.length, 0);
});

test('ripresa: profilo salvato, credenziali attuali, run distinto collegato al precedente', async () => {
    const h = runtime(), first = h.window.MappAIModelli.avvia();
    const manifest = PC.createManifest({ modelli: first.profilo() }, { vaultPath: h.state.activeVaultPath });
    manifest.modelliGiro = first.riepilogo();
    h.state.aiProvider = 'google'; h.keys.infomaniak = 'secret-renewed';
    const g = h.window.MappAIModelli.avvia({ manifest, vaultPath: h.state.activeVaultPath });
    await g.chat('materiali', B1.payload());
    assert.equal(h.calls[0].apiKey, 'secret-renewed'); assert.equal(h.calls[0].payload.model, 'materiali-test');
    assert.equal(g.riepilogo().previousRunId, first.riepilogo().runId);
    assert.notEqual(g.riepilogo().runId, first.riepilogo().runId);
    assert(!JSON.stringify(g.riepilogo()).includes('secret-renewed'));
    h.window.MappAIModelli.spegni();
    assert.throws(() => h.window.MappAIModelli.avvia({ manifest }), /Riattiva/);
});

test('flag spento e manifesto legacy: nessuna migrazione implicita', () => {
    const h = runtime({ on: false });
    assert.equal(h.window.MappAIModelli.avvia(), null);
    h.window.MappAIModelli.accendi();
    assert.equal(h.window.MappAIModelli.avvia({ manifest: PC.createManifest({}) }), null);
});

test('preflight rifiuta giudice senza modello, audio Google e reranker esterno', () => {
    const h = runtime(), p = h.profile; p.modelli.giudice = null; h.window.MappAIModelli.salvaProfilo(p);
    assert.throws(() => h.window.MappAIModelli.avvia({ giudice: true }), /giudice/);
    assert.throws(() => h.window.MappAIModelli.avvia({ config: { synthesis: { audio: true } } }), /senza voce/);
    assert.throws(() => h.window.MappAIModelli.avvia({ nuovo: true, config: { dossier: { titolo: 'Foto' } } }), /fonti testuali/);
    h.values.set('mappai_reranker_infomaniak', '1');
    assert.throws(() => h.window.MappAIModelli.avvia({ nuovo: true }), /reranker/);
    assert.equal(h.calls.length + h.embeddingCalls.length, 0);
    assert.equal(h.values.get('mappai_reranker_infomaniak'), '1');
});

test('il reranker delle citazioni acceso durante la mappa ferma il giro prima di chiamarlo', async () => {
    const h = runtime(), g = h.window.MappAIModelli.avvia({ nuovo: true });
    h.values.set('mappai_reranker_infomaniak', '1');
    await assert.rejects(g.chat('mappa', B1.payload()), /reranker/);
    assert.equal(h.calls.length, 0);
});

test('nuovo vault: nessun I/O nel precedente, associazione unica e cache dopo riavvio', async () => {
    const h = runtime(), g = h.window.MappAIModelli.avvia({ nuovo: true });
    await g.embeddings(['testo identico']);
    assert.equal(h.reads.length + h.writes.length, 0);
    h.state.db = { nodes: [], links: [] }; g.iniziaMappa();
    h.state.activeVaultPath = '/vault/nuovo'; h.storageManager.currentProjectId = 'nuovo';
    const bound = g.conVault('/vault/nuovo');
    await bound.embeddings(['testo identico']); await bound.embeddings(['testo identico']);
    assert.equal(h.embeddingCalls.length, 2);
    assert(h.writes.every(w => w.vaultPath === '/vault/nuovo'));
    h.state.activeVaultPath = '/vault/altro'; assert.throws(() => bound.conVault('/vault/altro'));
    const fresh = runtime({ disk: h.disk }); fresh.state.activeVaultPath = '/vault/nuovo'; fresh.storageManager.currentProjectId = 'nuovo';
    await fresh.window.MappAIModelli.avvia().embeddings(['testo identico']);
    assert.equal(fresh.embeddingCalls.length, 0);
});

test('Evidence: fonti archiviate e indice pronto anche con revisione spenta', async () => {
    const h = runtime(), g = h.window.MappAIModelli.avvia();
    const m = PC.createManifest({ modelli: g.profilo() }, { vaultPath: h.state.activeVaultPath });
    await h.window.MappAIReview.prepareEvidence(h.state.activeVaultPath, m, g);
    assert(m.sources.length); assert(h.window.MappAIEvidence.indice());
    const fresh = runtime({ disk: h.disk }); fresh.state._generationSources = []; fresh.state.sources = [];
    fresh.state._pipelineManifest = m;
    await fresh.window.MappAIReview.prepareEvidence(fresh.state.activeVaultPath, m, fresh.window.MappAIModelli.avvia());
    assert(fresh.window.MappAIEvidence.indice());
    assert.equal(fresh.window.MappAIReview.sources()[0].pages[0].text, GOLD);
});

test('Evidence: fonti mancanti fermano i materiali; flag spento non indicizza', async () => {
    const h = runtime(); h.state.sources = []; h.state._generationSources = [];
    const g = h.window.MappAIModelli.avvia();
    await assert.rejects(h.window.MappAIReview.prepareEvidence(h.state.activeVaultPath, PC.createManifest({}), g), /fonti originali/);
    assert.equal(h.calls.length, 0);
    h.values.set('mappai_evidence', '0');
    await h.window.MappAIReview.prepareEvidence(h.state.activeVaultPath, PC.createManifest({}), g);
    assert.equal(h.writes.length, 0);
});
