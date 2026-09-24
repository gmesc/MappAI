#!/usr/bin/env node
'use strict';
// Moduli e trasporti dell'app; DOM, estrazione PDF e IPC sostituiti. Zero rete.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const B1 = require('./modelli-per-fase.js');
const PC = require('../../public/js/mappai-pipeline-core.js');
const ROOT = path.join(__dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GOLD = 'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.';
const graph = () => ({ nodes: [
    { id: 'ROOT', label: 'Circuiti', desc: GOLD, content: GOLD, level: 0, chunks: [] },
    { id: 'L1_1', label: 'Resistenza', desc: GOLD, content: GOLD, level: 1, group: 1, chunks: [] },
    ...['Lunghezza', 'Sezione', 'Materiale'].map((label, i) => ({ id: 'L1_1_L2_' + i, label, desc: GOLD, content: GOLD, level: 2, group: 1, chunks: [] }))
], links: [{ source: 'ROOT', target: 'L1_1', rel: 'include' }, ...[0, 1, 2].map(i => ({ source: 'L1_1', target: 'L1_1_L2_' + i, rel: 'dipende da' }))], sourcesDict: {}, studySets: [] });
function domElement(value = '') {
    return { value, checked: false, disabled: false, style: {}, dataset: {}, children: [],
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        addEventListener() {}, setAttribute() {}, getAttribute() { return ''; }, remove() {},
        appendChild(x) { this.children.push(x); }, append(...xs) { this.children.push(...xs); }, replaceChildren() { this.children = []; },
        querySelector() { return domElement(); }, querySelectorAll() { return []; } };
}
function runtime(options = {}) {
    let h;
    h = B1.harness({ on: options.on !== false, disk: options.disk,
        values: { mappai_review_enabled: '0', mappai_evidence: '1', mappai_strip_boilerplate: '0', ...options.values },
        chat: async call => {
            if (options.chat) return options.chat(call, h);
            const text = call.payload.messages ? call.payload.messages.map(m => m.content).join('\n') : call.payload.contents[0].parts[0].text;
            const model = call.payload.model || call.model;
            let value;
            if (model === 'mappa-test') value = /Analizza le fonti testuali/.test(text) ? GOLD : JSON.stringify({ ...graph(), enrichedNodes: graph().nodes,
                communities: [{ id: 1, name: 'Resistenza', summary: GOLD }] });
            else if (model === 'giudice-test') value = JSON.stringify({ checkedIds: [], mcOptions: [], issues: [] });
            else if (/"front"/.test(text)) value = JSON.stringify([{ front: 'In quale unità si misura la resistenza?', back: 'In ohm.' }]);
            else if (/"domanda"/.test(text)) value = JSON.stringify([{ domanda: 'Spiega come varia la resistenza.', traccia: GOLD, livello: 'base', righe: 4 }]);
            else value = JSON.stringify([{ q: 'Come si misura la resistenza?', options: ['Ohm', 'Volt', 'Ampere'], correct: 'Ohm', explanation: GOLD, evidenza: GOLD }]);
            return call.provider === 'infomaniak'
                ? B1.reply(call, { choices: [{ message: { content: value }, finish_reason: 'stop' }] })
                : B1.reply(call, { candidates: [{ content: { parts: [{ text: value }] }, finishReason: 'STOP' }] });
        } });
    const w = h.window, st = h.state;
    Object.assign(st, { db: graph(), rootNodeLabel: 'Circuiti', extractionMode: options.mode || 'mindmap',
        sources: [{ id: 'pdf', type: 'pdf', file: { name: 'Circuiti.pdf' } }], _generationSources: [{ id: 'pdf', title: 'Circuiti', pages: [{ n: 1, text: GOLD }] }], generationUsage: {}, multiPassMode: !!options.multi });
    Object.assign(h.elements, { 'root-node-name': domElement('Circuiti'), 'extraction-mode': domElement(st.extractionMode),
        'gen-depth': domElement('2'), 'level-slider': domElement('2'), 'l1-auto-generate-toggle': domElement(), 'kg-nodes-slider': domElement('10'), 'model-select': domElement('modello-ui'), 'focus-input': domElement('') });
    const d = w.document;
    d.querySelector = () => domElement(GOLD); d.querySelectorAll = selector => selector === '.l1-topic-input' ? [domElement('Resistenza')] : [];
    d.createElement = domElement; d.createComment = () => ({}); d.addEventListener = () => {};
    d.body = domElement(); d.documentElement = domElement(); d.activeElement = domElement();
    h.storageManager.adottaVault = async v => { h.storageManager.currentProjectId = 'id:' + v; };
    h.storageManager.saveCurrentProject = () => {};
    const api = w.electronAPI;
    w.electronAPI = { ...api, filesRootGet: async () => ({ mapsBaseDir: '/vault' }), getAllVaults: async () => [],
        saveVault: async args => { h.mapSaved = B1.plain(args); return { success: true }; },
        htmlToPdf: async () => ({ ok: true, base64: Buffer.from('%PDF-1.4\n' + 'test '.repeat(100)).toString('base64') }) };
    Object.assign(w, { setTimeout, clearTimeout, addEventListener() {}, crypto: { randomUUID: () => 'generation-test' },
        MappAIPipelineCore: PC, MappAIReviewCore: require('../../public/js/mappai-review-core.js'),
        MappAIFilesCore: require('../../public/js/mappai-files-core.js'),
        MappAIGroundingCore: require('../../public/js/mappai-grounding-core.js'),
        MappAIAnchorCore: require('../../public/js/mappai-anchor-core.js'),
        MappAIMath: require('../../public/js/mappai-math.js'),
        MappAIJsonSalvage: require('../../public/js/mappai-json-salvage.js'),
        MappAIEvidenceCore: require('../../public/js/mappai-evidence-core.js'),
        MappAILocalSearchCore: require('../../public/js/mappai-local-search-core.js'),
        MappAIMaterialDrafts: require('../../public/js/mappai-material-drafts.js'),
        showLoadingOverlay() {}, showToast: m => h.logs.push(String(m)), showAlert: (title, m) => h.logs.push(title + ': ' + m), safeCreateIcons() {},
        t: (_k, fallback) => fallback, getPipeline: () => 'A', cleanLabel: s => String(s || ''),
        getDescendants: id => st.db.nodes.filter(n => n.id.startsWith(id + '_')), getPromptLanguage: () => 'it',
        injectClassTuning: x => x, fillPromptTemplate: key => key, buildSystemInstruction: s => s,
        MIND_MAP_SYSTEM_INSTRUCTION: 'Mappa', KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION: 'Grafo',
        MARKER_JSON: '```json', MARKER_END: '```',
        resetVaultState() { st.activeVaultPath = null; st._pipelineManifest = null; },
        extractPdfPages: async () => ({ text: GOLD, pages: [{ n: 1, text: GOLD }], titoli: [] }),
        getKgRelEnum: () => ['include', 'dipende da'], _assignHubGroup: () => 1, relVocab: () => 'dipende da', mapLangNote: () => '',
        initD3Visualization() {}, showGenerationReport() {}, mappaPronta: () => false, sanitizeMindMapTree() {},
        getInheritedDatabase: () => '', getMapLanguage: () => 'it', quizNonce: () => 'test', QUIZ_TEMPERATURE: 0.7,
        MappAIGen: { attiva: () => false, inizia() {}, fine() {}, veloNellArea() {}, veloACasa() {} },
        buildVaultMapData: () => B1.plain(st.db),
        buildFlashcardSetHtml: () => '<html>' + 'test '.repeat(100) + '</html>',
        buildQuizSetHtml: () => '<html>' + 'test '.repeat(100) + '</html>',
        buildOpenQuestionsHtml: () => '<html>' + 'test '.repeat(100) + '</html>',
        ensureProjectVault: async () => { st.activeVaultPath = '/vault/Circuiti'; await h.storageManager.adottaVault(st.activeVaultPath); return { folderPath: st.activeVaultPath }; }
    });
    const load = p => vm.runInContext(read(p), w, { filename: p });
    const app = read('public/js/app.js');
    vm.runInContext(app.slice(app.indexOf('window.getMaxOutputTokens ='), app.indexOf('// ──────────────────', app.indexOf('window.getMaxOutputTokens ='))), w);
    vm.runInContext(app.slice(app.indexOf('window.startGeneration ='), app.indexOf('\nconst MIND_MAP_SYSTEM_INSTRUCTION')), w);
    const cached = w.fetchEmbeddings;
    load('public/js/mappai-generation-support.js'); w.fetchEmbeddings = cached;
    // Filtri locali invariati: il banco non abilita fasi opzionali.
    for (const name of ['isEnrichDescsEnabled','isBranchBoundariesEnabled','isCoveragePassEnabled','isJudgeEnabled']) w[name] = () => false;
    load('public/js/mappai-mm-triage.js'); load('public/js/mappai-mm-extraction.js'); load('public/js/mappai-kg-extraction.js');
    load('public/js/mappai-review.js'); load('public/js/mappai-evidence.js');
    load('public/js/mappai-study-session.js'); load('public/js/mappai-material-pipeline.js');
    const p = B1.profile(); p.modelli.giudice = 'giudice-test'; w.MappAIModelli.salvaProfilo(p);
    return Object.assign(h, { load, PC, profile: p,
        manifest: () => { const raw = h.disk.get(st.activeVaultPath + '/pipeline.json'); return raw ? JSON.parse(raw) : null; } });
}
async function run() {
    for (const [mode, multi, community] of [['mindmap', false], ['mindmap', true], ['kg', false], ['kg', true], ['kg', false, true]]) {
        const h = runtime({ mode, multi, values: { mappai_kg_community_mode: community ? 'true' : 'false' } });
        await h.window.MappAIPipeline.run({ quiz: { types: ['flashcards'], perBranch: 1 } });
        const manifest = h.manifest();
        assert(manifest, h.logs.join('\n'));
        assert.equal(manifest.steps.A.status, 'done', h.logs.join('\n'));
        assert.equal(manifest.steps.B.status, 'done', h.logs.join('\n'));
        assert(!h.logs.some(l => /Errore Generazione|Pipeline interrotta/.test(l)), h.logs.join('\n'));
        assert(h.calls.some(c => c.payload.model === 'mappa-test'));
        assert(h.calls.some(c => c.payload.model === 'materiali-test'));
        assert(h.window.MappAIEvidence.indice());
        assert(manifest.sources.length);
        assert(!h.reads.some(r => r.vaultPath === '/vault/a' && r.relPath === 'vettori.json'));
        assert(!JSON.stringify(manifest).includes('secret-info'));
    }
    console.log('B2: avvio reale MM/KG, salvataggio fonti, indice Evidence atteso, materiali per fase.');
}
module.exports = { runtime, run, GOLD, graph, read, B1, PC, domElement };
if (require.main === module) run().catch(e => { console.error(e); process.exitCode = 1; });
