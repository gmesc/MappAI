const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const G = require('../public/js/mappai-grounding-core.js');
const { load } = require('cheerio');

function fixture({ approved = true, large = false } = {}) {
    const original = ('La BNS acquistò oro dalla Germania. ' + 'Il rapporto menzionava accuse, senza trasformarle in fatti accertati. '.repeat(7)).trim();
    const nodes = [
        { id: 'root', level: 0, label: 'Svizzera', desc: 'Neutralità e guerra.' },
        { id: 'economia', level: 1, label: 'Economia', desc: 'La Germania ricevette valuta dalla BNS.' },
        { id: 'rifugiati', level: 1, label: 'Rifugiati', desc: 'La Svizzera accolse rifugiati e ne respinse altri.' }
    ];
    if (large) for (let i = 0; i < 30; i++) nodes.push({ id: 'n' + i, level: 2, label: 'Nodo ' + i, desc: 'Contenuto approvato ' + i });
    const sources = [{ id: 'manuale', nome: 'Manuale', pages: [{ n: 5, text: original }] }];
    const review = { sources, overrides: [{ origin: 'teacher', target: { kind: 'node', id: 'economia', field: 'desc' },
        after: 'La Germania ricevette valuta dalla BNS.', reason: 'Preservare il soggetto che riceve valuta.' }] };
    const state = { db: { nodes, links: [], sourcesDict: { economia: [{ docId: 'manuale', page: 5, text: original }] } }, extractionMode: 'mindmap' };
    const prompts = [], requests = [];
    const win = {
        MappAIGroundingCore: G,
        MappAIReviewCore: require('../public/js/mappai-review-core.js'),
        MappAIReview: { current: () => review, sources: () => sources, requireApproved: async () => approved },
        MappAIStudyExport: { collectBranchNodes: id => nodes.filter(n => n.id === id || n.level === 2) },
        t: (_, fallback) => fallback, cleanLabel: s => s,
        _getTimelineProjectName: () => 'Svizzera',
        fillPromptTemplate: (name, input) => { prompts.push(input); return input.nodesList; },
        fetchModelAPI: async payload => {
            const text = payload.contents[0].parts[0].text;
            requests.push(text);
            const id = /\[\[(src-[\w-]+)\]\]/.exec(text)?.[1];
            return { candidates: [{ content: { parts: [{ text: text.includes('PANORAMICA introduttiva')
                ? 'Panoramica dai fatti approvati.' : 'DERIVATO_NON_FONTE [[' + id + ']] [[src-sconosciuto]]' }] } }] };
        }
    };
    const sandbox = { window: win, appState: state, console: { log() {}, warn() {}, error() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-branch-synthesis.js'), 'utf8'), sandbox);
    return { win, state, sources, original, prompts, requests };
}

test('sintesi standalone: una revisione non approvata impedisce ogni chiamata al modello', async () => {
    const f = fixture({ approved: false });
    assert.equal(await f.win.MappAISynthesis.runWholeMap({ apiKey: 'fake', silent: true }), null);
    assert.equal(f.requests.length, 0);
});

test('sintesi: passa originali e rettifiche, risolve gli ID e stampa le citazioni complete dal registro', async () => {
    const f = fixture();
    const data = await f.win.MappAISynthesis.runWholeMap({ apiKey: 'fake', silent: true });
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests[0].includes(f.original));
    assert.ok(f.requests[0].includes('Rettifica del docente: economia'));
    assert.match(data.rawText, /DERIVATO_NON_FONTE \[1\]/);
    assert.ok(!data.rawText.includes('src-sconosciuto'));
    assert.equal(data.grounding.unknownCitationIds[0], 'src-sconosciuto');
    const html = f.win.MappAISynthesis.buildHtml(data);
    const $ = load(html);
    assert.equal($('.bs-citations blockquote').text(), f.original, 'nessun taglio a 280 caratteri o trascrizione AI');
    assert.equal($('.bs-citations strong').text(), 'Manuale — pagina 5');
});

test('panoramica: usa fatti e originali approvati, mai le sintesi generate dei rami', async () => {
    const f = fixture({ large: true });
    const data = await f.win.MappAISynthesis.runWholeMap({ apiKey: 'fake', silent: true });
    assert.equal(data.sections.length, 2);
    assert.equal(f.requests.length, 3);
    const overview = f.requests[2];
    assert.ok(overview.includes(f.original));
    assert.ok(overview.includes('La Germania ricevette valuta dalla BNS.'));
    assert.ok(overview.includes('Rettifica del docente: economia'));
    assert.ok(!overview.includes('DERIVATO_NON_FONTE'));
    assert.equal(data.intro, 'Panoramica dai fatti approvati.');
});

test('sintesi: una modifica semantica durante la chiamata scarta il risultato', async () => {
    for (const large of [false, true]) {
        const f = fixture({ large });
        const fetch = f.win.fetchModelAPI;
        f.win.fetchModelAPI = async payload => {
            const response = await fetch(payload);
            f.state.db.nodes[1].desc = 'Nuova correzione del docente.';
            return response;
        };
        await assert.rejects(f.win.MappAISynthesis.runWholeMap({ apiKey: 'fake', silent: true }), { code: 'STALE_SYNTHESIS_SOURCE' });
        assert.equal(f.win.MappAIBranchSynthesis.getData(), null);
        assert.equal(f.requests.length, 1, 'nessun ramo successivo o panoramica da una revisione mista');
    }
});
