'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { run, runtime, B1, GOLD } = require('../tools/smoke/modelli-nei-flussi.js');

test('sottopassi materiali: aperte, quiz, sintesi e parole chiave usano il giro', async () => {
    const answers = [JSON.stringify([{ domanda: 'Spiega la resistenza.', traccia: GOLD, livello: 'base', righe: 4 }]),
        JSON.stringify([{ q: 'In che unità si misura?', options: ['Ohm', 'Volt', 'Ampere'], correct: 'Ohm', explanation: GOLD }]),
        GOLD, JSON.stringify({ L1_1: ['conduttore', 'ohm', 'lunghezza'] })];
    const h = runtime({ chat: c => B1.reply(c, { choices: [{ message: { content: answers.shift() }, finish_reason: 'stop' }] }) });
    h.load('public/js/mappai-branch-synthesis.js'); h.load('public/js/mappai-print-dossier.js');
    const g = h.window.MappAIModelli.avvia();
    h.state.aiProvider = 'google'; h.elements['model-select'].value = 'gemini-3.8-flash';
    await h.window.MappAIPipeline._genOpenQuestions(GOLD, 'Resistenza', 1, null, { giro: g });
    await h.window.generateDynamicQuiz({ nodeLabel: 'Resistenza', material: GOLD, quantity: 1, giro: g });
    const synthesis = await h.window.MappAISynthesis.runWholeMap({ giro: g, silent: true });
    assert(synthesis, h.logs.join('\n'));
    await h.window._generateNodeKeywords(h.state.db.nodes, null, g);
    assert.equal(h.calls.length, 4, h.logs.join('\n'));
    assert(h.calls.every(c => c.payload.model === 'materiali-test' && c.productId === 'product-a'));
    assert.deepEqual(h.calls.map(c => c.payload.max_tokens), [1800, 1650, 3000, 8192]);
});

test('giudice reale mappa e materiali: modello dedicato, nessuna chiamata quando spento', async () => {
    const h = runtime({ chat: c => B1.reply(c, { choices: [{ message: { content: JSON.stringify({ nodi: [], link: [], checkedIds: [], issues: [] }) }, finish_reason: 'stop' }] }) });
    h.load('public/js/mappai-judge-core.js'); h.load('public/js/mappai-material-review.js');
    h.state.db.nodes.forEach(n => { h.state.db.sourcesDict[n.id] = [{ text: GOLD, verbatim: true, page: 1, docId: 'pdf' }]; });
    const g = h.window.MappAIModelli.avvia({ giudice: true });
    await h.window.executeJudgePass(null, { enabled: false }, g);
    assert.equal(h.calls.length, 0);
    await h.window.executeJudgePass(null, { enabled: true, apply: false }, g);
    const mapCalls = h.calls.length; assert(mapCalls > 0, h.logs.join('\n'));
    await h.window.MappAIMaterialReview.check([{ id: 'f', kind: 'flashcard', question: 'In quale unità si misura la resistenza?', answer: 'In ohm.' }], { giro: g, material: GOLD, review: { sources: h.state._generationSources } });
    assert(h.calls.length > mapCalls, h.logs.join('\n'));
    assert(h.calls.every(c => c.payload.model === 'giudice-test'));
    assert(g.riepilogo().chiamate.every(c => c.phase === 'giudice'));
});

test('cambio Setup durante la mappa: materiali e Product ID rimangono nel giro iniziale', async () => {
    const h = runtime();
    const original = h.window.electronAPI.generateInfomaniak;
    h.window.electronAPI.generateInfomaniak = async args => {
        const result = await original(args);
        h.state.aiProvider = 'google'; h.keys.infomaniak = 'secret-new'; h.elements['infomaniak-product-id'].value = 'product-new';
        return result;
    };
    await h.window.MappAIPipeline.run({ quiz: { types: ['flashcards'], perBranch: 1 } });
    assert.equal(h.manifest()?.steps.B.status, 'done', h.logs.join('\n'));
    assert(h.calls.every(c => c.provider === 'infomaniak' && c.productId === 'product-a' && c.apiKey === 'secret-info-a'));
    assert.deepEqual([...new Set(h.calls.map(c => c.payload.model))], ['mappa-test', 'materiali-test']);
    assert.equal(h.state.generationUsage.usedModel, 'mappa-test');
    assert.equal(h.state._reviewAIContext, undefined);
});

test('PDF in attesa: cambiare progetto impedisce il reset del nuovo progetto', async () => {
    const h = runtime(), gate = B1.deferred();
    h.window.extractPdfPages = async () => { await gate.promise; return { text: GOLD, pages: [{ n: 1, text: GOLD }] }; };
    const pending = h.window.startGeneration();
    const other = { nodes: [{ id: 'estraneo' }], links: [] }; h.state.db = other; h.state.activeVaultPath = '/vault/altro';
    gate.resolve(); await assert.rejects(pending, /progetto aperto è cambiato/);
    assert.equal(h.state.db, other); assert.equal(h.calls.length, 0);
});

test('documento singolo: cambio progetto durante la resa PDF non salva la nuova mappa nel vecchio vault', async () => {
    const h = runtime();
    h.window.electronAPI.htmlToPdf = async () => {
        h.state.db = { nodes: [], links: [] }; h.state.activeVaultPath = '/vault/altro';
        return { ok: true, base64: Buffer.from('%PDF-1.4\n' + 'prova '.repeat(100)).toString('base64') };
    };
    const result = await h.window.MappAIPipeline.generaSet({ tipo: 'flashcards', quantita: 1 });
    assert.equal(result.ok, false); assert.match(result.errore, /progetto aperto è cambiato/);
    assert.equal(h.mapSaved, undefined);
    assert(!h.writes.some(w => String(w.relPath).endsWith('.pdf')));
});

test('B2: pulsanti e moduli reali da PDF estratto a mappa, Evidence e materiali', run);

test('0014: contatore e registro sommano i modelli effettivi anche cambiando Setup', async () => {
    const C = require('../public/js/mappai-catalogo-core.js');
    const U = require('../public/js/mappai-usage-core.js');
    const h = B1.harness({on:true,chat:call=>B1.reply(call,{model:call.payload.model,
        usage:{prompt_tokens:1e6,completion_tokens:1e6,total_tokens:2e6}})});
    h.window.MappAIUsageCore=U; h.window.matchModelKB=(id,provider)=>provider==='infomaniak'?C.kb(id):null;
    h.window.t=(_key,fallback)=>fallback;
    const profile=B1.profile(); profile.modelli.mappa='google/gemma-4-31B-it';
    profile.modelli.materiali='mistralai/Mistral-Small-4-119B-2603';
    const giro=h.window.MappAIModelli.creaGiro(profile);
    await giro.chat('mappa',B1.payload());
    h.state.aiProvider='google'; h.elements['model-select'].value='gemini-3.8-flash';
    await giro.chat('materiali',B1.payload());
    assert.equal(h.window.generationCostText(),'1.55 CHF');
    assert.equal(h.state.generationUsage.costRecords.length,2);
    const agg=U.aggregate(h.usage,{kbLookup:h.window.matchModelKB});
    assert.equal(agg.totals.total,1.55); assert.equal(agg.totals.unpriced,0);
});

test('0014: embeddings freddi, parziali e caldi registrano solo le chiamate remote, una volta', async () => {
    const h=B1.harness({on:true,embedding:call=>({model:'BAAI/bge-multilingual-gemma2',
        usage:{prompt_tokens:call.texts.length*100,total_tokens:call.texts.length*100},
        data:call.texts.map((text,index)=>({index,embedding:B1.vector(text)}))})});
    const profile=B1.profile(); profile.modelli.embeddings='bge_multilingual_gemma2';
    const giro=h.window.MappAIModelli.creaGiro(profile);
    await giro.embeddings(['uno','due']);
    await giro.embeddings(['due','tre']);
    await giro.embeddings(['uno','due','tre']);
    assert.equal(h.embeddingCalls.length,2); assert.equal(h.usage.length,2);
    assert.deepEqual(h.usage.map(r=>r.inTok),[200,100]);
    assert(h.usage.every(r=>r.usageKnown && r.outTok===0 && r.phase==='embeddings' && r.runId===giro.riepilogo().runId));
    assert(!JSON.stringify(h.usage).includes('product-a'));
    const next=B1.harness({on:true,disk:h.disk});
    await next.window.MappAIModelli.creaGiro(profile).embeddings(['uno','tre']);
    assert.equal(next.embeddingCalls.length,0); assert.equal(next.usage.length,0);
});

test('0014: embeddings senza cache e senza usage restano incompleti nel registro', async () => {
    const h=B1.harness({cacheOn:false});
    await h.window.fetchEmbeddings(['test']);
    await h.window.fetchEmbeddings(['test']);
    assert.equal(h.embeddingCalls.length,2); assert.equal(h.usage.length,2);
    assert(h.usage.every(r=>r.usageKnown===false && r.inTok===null && r.outTok===null));
});

test('flag OFF: orchestratore reale conserva profilo e trasporto legacy', async () => {
    const { graph } = require('../tools/smoke/modelli-nei-flussi.js');
    const h = runtime({ on: false, chat: c => {
        const prompt = c.payload.messages.map(m => m.content).join('\n');
        const text = /Analizza le fonti testuali/.test(prompt) ? GOLD : /MIND_MAP_FULL_TREE/.test(prompt) ? JSON.stringify(graph()) :
            JSON.stringify([{ front: 'In che unità si misura la resistenza?', back: 'In ohm.' }]);
        return B1.reply(c, { choices: [{ message: { content: text }, finish_reason: 'stop' }] });
    } });
    await h.window.MappAIPipeline.run({ quiz: { types: ['flashcards'], perBranch: 1 } });
    const m = h.manifest(); assert.equal(m?.steps.B.status, 'done', h.logs.join('\n'));
    assert.equal(m.config.modelli, undefined); assert.equal(m.modelliGiro, undefined);
    assert(h.calls.every(c => c.payload.model === 'modello-ui'));
    assert.equal(h.window.MappAIEvidence.indice(), null);
});

test('consumatori embeddings reali: cache condivisa, testi invariati e modello assegnato', async () => {
    const h = runtime(); h.load('public/js/mappai-entity-backbone.js');
    const n = { ...h.state.db.nodes[2], id: 'L1_1_L2_3', label: 'Temperatura' };
    h.state.db.nodes.push(n); h.state.db.links.push({ source: 'L1_1', target: n.id, rel: 'dipende da' });
    const before = B1.plain(h.state.db), g = h.window.MappAIModelli.avvia();
    const report = await h.window.MappAIEntityBackbone.analyzeCurrentMap({ giro: g });
    assert.equal(report.stats.nodesAnalyzed, 4); assert.equal(report.errors.length, 0);
    await h.window.executeSemanticDedup({ giro: g, maxMerges: 0 });
    assert.equal(h.embeddingCalls.length, 1); assert.equal(h.embeddingCalls[0].model, 'vettori-test');
    assert.deepEqual(B1.plain(h.state.db), before);
    const trace = g.riepilogo().chiamate;
    assert.equal(trace.length, 2); assert(trace.every(c => c.phase === 'embeddings' && c.actualModel === null));
});

test('materiali reali conservano modello e budget del giro dopo un cambio Setup', async () => {
    const h = runtime(), g = h.window.MappAIModelli.avvia();
    h.state.aiProvider = 'google'; h.elements['model-select'].value = 'gemini-3.8-flash';
    h.keys.infomaniak = 'secret-changed'; h.elements['infomaniak-product-id'].value = 'product-changed';
    await h.window.MappAIPipeline._genFlashcards(GOLD, 'Resistenza', 1, null, { giro: g });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].payload.model, 'materiali-test');
    assert.equal(h.calls[0].apiKey, 'secret-info-a');
    assert.equal(h.calls[0].productId, 'product-a');
    assert.equal(h.calls[0].payload.max_tokens, 760);
});

test('documento su progetto revisionato senza giudice restituisce un errore visibile, senza chiamate o modifiche', async () => {
    const h = runtime();
    const manifest = h.PC.createManifest({});
    manifest.review = { initial: { status: 'approved' }, approvedRevision: 'approvata', final: { stage: 'done' } };
    h.state._pipelineManifest = manifest;
    h.window.MappAIReview.requireApproved = async () => true;
    const before = JSON.stringify(manifest);
    h.profile.modelli.giudice = null;
    h.window.MappAIModelli.salvaProfilo(h.profile);
    const result = await h.window.MappAIPipeline.generaSet({ tipo: 'mc', quantita: 1 });
    assert.equal(result.ok, false, 'non dichiarare viaPipeline riuscita quando il controllo non può partire');
    assert.match(result.errore, /giudice.*Setup AI/i);
    assert.equal(h.calls.length, 0);
    assert.equal(h.writes.length, 0);
    assert.equal(JSON.stringify(h.state._pipelineManifest), before);
    // Il menu reale deve convertire questo esito nell'avviso al docente.
    const fs = require('node:fs'), vm = require('node:vm');
    const menu = fs.readFileSync(require.resolve('../public/js/mappai-crea-quiz.js'), 'utf8');
    const notices = [];
    const ui = { toast: (message, type) => notices.push({ message, type }), t: (_key, fallback) => fallback, result };
    vm.createContext(ui);
    vm.runInContext(menu.slice(menu.indexOf('    var CODICI_GIA_DETTI'), menu.indexOf('    function _st()')) +
        menu.slice(menu.indexOf('    function _fineVarianti'), menu.indexOf('    function _apriPrimo')) +
        '\n_fineVarianti([], [{errore: result.errore}], false);', ui);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'error');
    assert.match(notices[0].message, /giudice.*Setup AI/i);
});

test('documento singolo senza revisione usa il profilo dal Setup', async () => {
    const h = runtime();
    const result = await h.window.MappAIPipeline.generaSet({ tipo: 'flashcards', quantita: 1, nome: 'Prova B2' });
    assert.equal(result.ok, true, result.errore || h.logs.join('\n'));
    assert(h.calls.length > 0);
    assert(h.calls.every(c => c.payload.model === 'materiali-test'));
    assert(h.window.MappAIEvidence.indice());
    assert(h.PC.isComplete(h.manifest()), 'un documento singolo non crea una pipeline pendente');
});

test('risposta tardiva dopo cambio progetto viene rifiutata dal consumatore reale', async () => {
    const gate = B1.deferred();
    const h = runtime({ chat: async c => { await gate.promise; return B1.reply(c); } });
    const g = h.window.MappAIModelli.avvia();
    const pending = h.window.MappAIPipeline._genFlashcards(GOLD, 'Resistenza', 1, null, { giro: g });
    h.state.db = { nodes: [], links: [] }; h.state.activeVaultPath = '/vault/estraneo'; gate.resolve();
    await assert.rejects(pending, /progetto aperto è cambiato/);
    assert.equal(h.writes.length, 0);
});

test('misura Evidence: contatori invariati, provenienza del giro e nessun segreto', async () => {
    const h = runtime(); h.load('public/js/mappai-misura-evidenze.js');
    const M = h.window.MappAIMisuraEvidenze, data = { area: 'Resistenza', tipo: 'flashcards', materiale: GOLD,
        ricevute: [{ front: 'Unità?', back: 'Ohm' }], tenute: [{ front: 'Unità?', back: 'Ohm' }], scartati: [] };
    const saved = []; h.window.electronAPI.savePipelineArtifact = async a => { saved.push(JSON.parse(a.content)); return { success: true }; };
    M.foglio(data); const legacy = B1.plain(M.giro()); await M.chiudi();
    h.state.aiProvider = 'google';
    M.foglio({ ...data, ai: { provider: 'infomaniak', phase: 'materiali', runId: 'run-test', requestedModel: 'materiali-test', actualModel: null, apiKey: 'segreto-escluso', productId: 'prodotto-escluso' } });
    const next = B1.plain(M.giro()); await M.chiudi();
    assert.deepEqual(next.totali, legacy.totali); assert.equal(next.provider, 'infomaniak');
    assert.equal(next.modelli[0].actualModel, null); assert.equal(next.modelli[0].requestedModel, 'materiali-test');
    assert.deepEqual(saved[1].modelli, next.modelli);
    assert(!JSON.stringify(saved).includes('segreto-escluso')); assert(!JSON.stringify(saved).includes('prodotto-escluso'));
});
