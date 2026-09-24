'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const J = require('../public/js/mappai-judge-core.js');
const A = require('../public/js/mappai-anchor-core.js');
const salvage = require('../public/js/mappai-json-salvage.js').salvage;
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function runtime(flags = {}) {
    const window = { MappAIJudgeCore: J, MappAIAnchorCore: A, MappAIJsonSalvage: require('../public/js/mappai-json-salvage.js'), MappAIMath: require('../public/js/mappai-math.js'), getMaxOutputTokens: n => n, t: (_k, fallback) => fallback };
    const appState = { db: { nodes: [], links: [], sourcesDict: {} }, sources: [], rootNodeLabel: 'Svizzera' };
    const context = vm.createContext({ window, appState, console: { log() {}, info() {}, warn() {} },
        localStorage: { getItem: k => flags[k] || null }, salvageTruncatedJSON: salvage, buildSystemInstruction: x => x });
    vm.runInContext(read('mappai-generation-support.js'), context);
    vm.runInContext(read('infomaniak_bridge.js'), context);
    return { window, appState };
}
const response = value => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });

test('JSONL: empty MERGES never consumes the adjacent CROSSLINKS header', () => {
    const { window } = runtime();
    for (const gap of ['\n', '\n[]\n', '\r\n', '\n   \n']) {
        const r = window.parseJSONLResponse('===MERGES===' + gap + '===CROSSLINKS===\n{"source":"A","target":"B","rel":"causa"}');
        assert.equal(r.merges.length, 0);
        assert.equal(r.crosslinks.length, 1);
        assert.equal(r.meta.lost.merges, 0);
        assert.equal(r.meta.partial, false);
    }
    const partial = window.parseJSONLResponse('## NODES ##\n{"id":"A","label":"Valuta"}\n## LINKS ##\n{"source":"A","target":"B"}\n{"source":');
    assert.equal(partial.nodes.length, 1);
    assert.equal(partial.links.length, 1);
    assert.equal(partial.meta.lost.links, 1);
});

const GOLD = 'La Germania vende oro alla Svizzera e riceve valuta dalla Banca Nazionale Svizzera.';
const WRONG = 'La Svizzera vende oro alla Germania e riceve valuta dalla Banca Nazionale Svizzera.';
const FOOD = 'Il razionamento distribuisce una quantità limitata di alimenti alla popolazione durante la guerra.';
function setMap(st) {
    const a = { id: 'A', label: 'Valuta', group: 1, level: 1, desc: WRONG, aiDesc: WRONG };
    const b = { id: 'B', label: 'Alimenti', group: 2, level: 1, desc: FOOD };
    st.db.nodes = [a, b];
    st.db.links = [{ source: a, target: b, rel: 'causa', isCross: true }];
    st.db.sourcesDict = { A: [{ text: GOLD, source: 'pagina 5', verbatim: true }], B: [{ text: FOOD, source: 'pagina 3', verbatim: true }] };
    st._pdfPagine = [{ pages: [{ n: 5, text: GOLD }, { n: 3, text: FOOD }] }];
}
test('judge: the central node owns its verdict and every outgoing relation, without repeating branch checks', async () => {
    const { window: w, appState: st } = runtime();
    setMap(st);
    const root = { id: 'ROOT', level: 0, group: 0, label: 'Svizzera', desc: GOLD };
    st.db.nodes.unshift(root);
    st.db.sourcesDict.ROOT = [{ text: GOLD, source: 'pagina 5', verbatim: true }];
    st.db.links.push({ source: root, target: 'A', rel: 'riguarda' }, { source: 'ROOT', target: st.db.nodes[2], rel: 'comprende' });
    // getDescendants(ROOT) normally includes the whole map. It must not assign
    // all branches to the root's review request.
    w.getDescendants = id => id === 'ROOT' ? st.db.nodes.slice(1) : [];
    const checked = [], links = [];
    w.fetchModelAPI = async payload => {
        const ids = payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum;
        checked.push(...ids);
        const outgoing = st.db.links.filter(l => ids.includes(typeof l.source === 'object' ? l.source.id : l.source));
        const verdicts = outgoing.map(l => ({ source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target, valido: true, prova_source: GOLD,
            prova_target: (typeof l.target === 'object' ? l.target.id : l.target) === 'B' ? FOOD : GOLD }));
        links.push(...verdicts.map(l => l.source + '>' + l.target));
        if (ids.includes('ROOT')) {
            assert.equal(ids.length, 1);
            assert.ok(payload.contents[0].parts[0].text.includes(JSON.stringify({ source: 'ROOT', target: 'A', rel: 'riguarda' })));
            assert.ok(payload.contents[0].parts[0].text.includes(FOOD));
        }
        return response({ nodi: [], link: verdicts });
    };
    const before = JSON.stringify(st.db), r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.stato, 'completato');
    assert.deepEqual(checked.sort(), ['A', 'B', 'ROOT']);
    assert.deepEqual(links.sort(), ['A>B', 'ROOT>A', 'ROOT>B']);
    assert.equal(r.copertura.nodiSaltati.length, 0);
    assert.equal(r.copertura.linkSaltati.length, 0);
    assert.equal(JSON.stringify(st.db), before, 'review proposes and never edits the map');
});

test('judge: absent central evidence, failed central requests and missing root-link verdicts remain incomplete', async () => {
    for (const mode of ['no-evidence', 'provider-error', 'missing-link']) {
        const { window: w, appState: st } = runtime();
        setMap(st);
        st.db.nodes.unshift({ id: 'ROOT', level: 0, label: 'Svizzera', desc: GOLD });
        if (mode !== 'no-evidence') st.db.sourcesDict.ROOT = [{ text: GOLD, verbatim: true }];
        st.db.links = [{ source: 'ROOT', target: 'A', rel: 'riguarda' }];
        w.fetchModelAPI = async payload => {
            if (mode === 'provider-error' && payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('ROOT')) throw new Error('unavailable');
            return response({ nodi: [], link: [] });
        };
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.equal(r.stato, 'parziale', mode);
        if (mode !== 'missing-link') assert.ok(r.copertura.nodiSaltati.some(n => n.id === 'ROOT'), mode);
        assert.ok(r.copertura.linkSaltati.some(l => l.source === 'ROOT'), mode);
    }
});
for (const provider of ['google', 'infomaniak']) {
    test(`${provider}: review run keeps actor-swap proposal and cross-group evidence without applying`, async () => {
        const { window: w, appState: st } = runtime({ mappai_giudice_applica: '1' });
        setMap(st); st._reviewRequested = true;
        let calls = 0;
        w.fetchModelAPI = async payload => {
            calls++;
            const ids = payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum;
            const prompt = payload.contents[0].parts[0].text;
            let answer = { nodi: [], link: [] };
            if (ids.includes('A')) {
                assert.ok(prompt.includes(FOOD), 'the other branch has its source evidence in the same request');
                assert.ok(prompt.includes(JSON.stringify({ source: 'A', target: 'B', rel: 'causa' })));
                answer = { nodi: [{ id: 'A', tipo: 'soggetto-invertito', problema: 'Il venditore è invertito.', prova: GOLD,
                    brano_errato: 'La Svizzera vende oro alla Germania', con: 'La Germania vende oro alla Svizzera' }],
                    link: [{ source: 'A', target: 'B', valido: false, problema: 'I testi non sostengono questa causa.', prova_source: GOLD, prova_target: FOOD }] };
            } else assert.ok(!prompt.includes(JSON.stringify({ source: 'A', target: 'B', rel: 'causa' })), 'cross-group link is not reviewed twice');
            if (provider === 'infomaniak') {
                const translated = w.InfomaniakBridge.translatePayload(payload, 'google/gemma-4-31B-it');
                const schema = translated.response_format.json_schema.schema;
                assert.ok(schema.required.includes('link'));
                assert.deepEqual(plain(schema.properties.nodi.items.properties.tipo.enum), J.TIPI);
                assert.ok(translated.messages.some(m => m.content.includes('FRASI DELLA FONTE')));
                return w.InfomaniakBridge.translateResponse({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }] });
            }
            return response(answer);
        };
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: true });
        assert.equal(calls, 2);
        assert.equal(r.applicaAcceso, false, 'review request overrides even explicit apply:true');
        assert.equal(r.applicate, 0);
        assert.equal(st.db.nodes[0].desc, WRONG);
        assert.equal(st.db.nodes[0].aiDesc, WRONG);
        assert.equal(st.db.links[0].rel, 'causa');
        assert.equal(r.correzioni.length, 1);
        assert.equal(r.correzioni[0].dopo, GOLD);
        assert.equal(r.correzioni[0].soloProposta, true, 'same-word actor swap remains a teacher proposal');
        assert.ok(r.correzioni[0].evidenze.length);
        assert.equal(r.linkTolti.length, 1);
        assert.ok(r.linkTolti[0].evidenze.target.length);
        assert.equal(r.linkTolti[0].soloSegnalato, true);
        assert.equal(r.copertura.linkEsaminati.length, 1);
        assert.equal(st._judgeReport, st._giudiceReport);
        assert.equal(r.stato, 'completato');
    });
}

test('judge: schema finale vincola ID e relazioni e separa i riferimenti dal testo citabile', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    const requests = [];
    w.fetchModelAPI = async payload => {
        requests.push(payload);
        return response({ nodi: [], link: [] });
    };
    await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(requests.length, 2, 'stesso numero di chiamate, nessun retry aggiunto');
    for (const payload of requests) {
        const schema = payload.generationConfig.responseSchema;
        const hasLink = schema.properties.nodi.items.properties.id.enum.includes('A');
        const final = w.InfomaniakBridge.translatePayload(payload, 'mistralai/Mistral-Small-4-119B-2603');
        const links = final.response_format.json_schema.schema.properties.link;
        assert.equal(links.minItems, hasLink ? 1 : 0);
        assert.equal(links.maxItems, hasLink ? 1 : 0);
        if (hasLink) {
            assert.deepEqual(plain(links.items.properties.source.enum), ['A']);
            assert.deepEqual(plain(links.items.properties.target.enum), ['B']);
            assert.deepEqual(plain(links.items.properties.rel.enum), ['causa']);
            assert.match(links.items.properties.prova_source.description, /solo il testo/i);
            const prompt = payload.contents[0].parts[0].text;
            assert.match(prompt, /RIFERIMENTO \(non citare\):/);
            assert.ok(prompt.includes('TESTO CITABILE: ' + JSON.stringify(GOLD)));
            assert.ok(prompt.includes(JSON.stringify({ source: 'A', target: 'B', rel: 'causa' })));
        }
        assert.equal(payload.generationConfig.maxOutputTokens, 2000);
    }
});

test('judge: positive verdict without real evidence remains unchecked', async () => {
    const { window: w, appState: st } = runtime();
    setMap(st);
    w.fetchModelAPI = async payload => {
        assert.ok(payload.generationConfig.responseSchema.required.includes('link'));
        return response({ nodi: [], link: [{ source: 'A', target: 'B', valido: true, prova_source: 'inventata', prova_target: 'inventata' }] });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.copertura.linkEsaminati.length, 0);
    assert.equal(r.copertura.linkSaltati.length, 1);
    assert.match(r.copertura.linkSaltati[0].motivo, /prova/);
});

test('judge: malformed JSON cannot complete coverage', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    w.fetchModelAPI = async () => ({ candidates: [{ content: { parts: [{ text: 'risposta non JSON' }] } }] });
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.copertura.linkEsaminati.length, 0);
    assert.equal(r.copertura.linkSaltati.length, 1);
    assert.equal(r.stato, 'parziale');
});

test('judge: explicit enable/apply:false works without persistent flags; failures and omitted link verdicts are visible', async () => {
    const { window: w, appState: st } = runtime({ mappai_giudice_applica: '1' });
    setMap(st);
    let calls = 0;
    w.fetchModelAPI = async () => { if (++calls === 2) throw new Error('provider unavailable'); return response({ nodi: [] }); };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.applicaAcceso, false);
    assert.equal(r.stato, 'parziale');
    assert.equal(r.esitiRami[1].stato, 'errore');
    assert.equal(r.esitiRami[1].motivo, 'provider unavailable');
    assert.equal(r.copertura.linkEsaminati.length, 0);
    assert.match(r.copertura.linkSaltati[0].motivo, /nessun verdetto/);
    assert.deepEqual(plain(r.copertura.nodiEsaminati), ['A']);
    assert.equal(r.copertura.nodiSaltati[0].id, 'B');
    const skipped = await w.executeJudgePass('', { enabled: true });
    assert.equal(skipped.stato, 'saltato');
    assert.match(skipped.motivoSkip, /chiave/);
    assert.equal(calls, 2, 'skip never calls the provider');
    assert.equal(st._judgeReport, skipped, 'does not leave a stale successful report');
});

function coverage(page, pct, count = 4) {
    return { pct, tot: 8, coperte: 8 - count, pagine: [{ page, pct, tot: 8, coperte: 8 - count,
        orfane: Array.from({ length: count }, (_, i) => `La frase numero ${i} della pagina ${page} descrive un fatto specifico ancora assente nella mappa.`) }] };
}
for (const changed of [false, true]) {
    test(`coverage: post-enrichment recovery is bounded and ${changed ? 'new gaps are recovered' : 'unchanged gaps are not retried'}`, async () => {
        const { window: w, appState: st } = runtime();
        st.db.nodes = [{ id: 'A', label: 'Economia', group: 1, level: 1, desc: 'Un ramo economico.' }];
        let enriched = false, calls = 0, judgeCalls = 0;
        w.applyAnchor = () => { st._qualityReport = { copertura: coverage(enriched && changed ? 2 : 1, 20) }; };
        w.enrichThinDescs = async () => { enriched = true; };
        w.fetchModelAPI = async () => { calls++; return response({ nodi: [] }); };
        w.executeJudgePass = async () => { judgeCalls++; };
        const r = await w.finalizeMindMapQuality([], 'mock-key');
        assert.equal(calls, changed ? 2 : 1);
        assert.equal(judgeCalls, 1);
        assert.equal(r.passaggi.length, 2);
        assert.equal(r.passaggi[1].stato, changed ? 'completato' : 'saltato');
        assert.equal(r.prima.pagine[0].page, 1);
        assert.equal(r.dopoArricchimento.pagine[0].page, changed ? 2 : 1);
        assert.equal(st._qualityReport.recuperoCopertura, r);
        if (!changed) assert.match(r.passaggi[1].motivoSkip, /invariato/);
    });
}

test('coverage: pre-enrichment skip and post-enrichment gap both remain in the report', async () => {
    const { window: w, appState: st } = runtime();
    st.db.nodes = [{ id: 'A', label: 'Economia', group: 1, level: 1 }];
    let enriched = false, calls = 0;
    w.applyAnchor = () => { st._qualityReport = { copertura: enriched ? coverage(4, 20) : coverage(4, 90, 1) }; };
    w.enrichThinDescs = async () => { enriched = true; };
    w.fetchModelAPI = async () => { calls++; return response({ nodi: [] }); };
    w.executeJudgePass = async () => {};
    const r = await w.finalizeMindMapQuality([], 'mock-key');
    assert.equal(calls, 1);
    assert.match(r.passaggi[0].motivoSkip, /soglia/);
    assert.equal(r.passaggi[1].stato, 'completato');
    assert.equal(r.dopo.pct, 20);
});

test('both MM extraction paths call the common final quality sequence', () => {
    const source = read('mappai-mm-extraction.js');
    assert.equal((source.match(/await window.finalizeMindMapQuality\(textParts, apiKey\)/g) || []).length, 2);
    assert.ok(!source.includes('await window.executeJudgePass('));
});

test('coverage: accepted nodes survive repeated recovery without duplicate IDs, rejected proposals retain reasons', async () => {
    const { window: w, appState: st } = runtime();
    st.db.nodes = [{ id: 'A', label: 'Economia', group: 1, level: 1 }, { id: 'A_C1', label: 'Già presente', group: 1, level: 2 }];
    st._qualityReport = { copertura: coverage(4, 20) };
    let call = 0;
    w.fetchModelAPI = async () => {
        call++;
        const text = st._qualityReport.copertura.pagine[0].orfane[0];
        return response({ nodi: [
            { parent: 'A', label: `Recupero ${call}`, desc: text, evidenza: text },
            { parent: 'NON_ESISTE', label: 'Genitore errato', desc: text, evidenza: text }
        ] });
    };
    const first = await w.executeCoveragePass('mock-key');
    const second = await w.executeCoveragePass('mock-key');
    assert.deepEqual(plain(first.idsAggiunti), ['A_C2']);
    assert.deepEqual(plain(second.idsAggiunti), ['A_C3']);
    assert.equal(first.scartate[0].perche, 'genitore inesistente');
    assert.equal(new Set(st.db.nodes.map(n => n.id)).size, st.db.nodes.length);
    assert.deepEqual(plain(st.db.links.map(l => l.target)), ['A_C2', 'A_C3']);
});

test('judge: a link proposal with invented endpoint evidence remains a visible rejected verdict', async () => {
    const { window: w, appState: st } = runtime();
    setMap(st);
    w.fetchModelAPI = async payload => response({ nodi: [], link:
        payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('A')
            ? [{ source: 'A', target: 'B', valido: false, problema: 'Nesso dubbio', prova_source: 'Una fonte inventata e mai mostrata.', prova_target: FOOD }] : [] });
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.linkTolti.length, 0);
    assert.equal(r.scartati.length, 1);
    assert.equal(r.scartati[0].tipo, 'link');
    assert.equal(r.scartati[0].problema, 'Nesso dubbio');
    assert.match(r.scartati[0].perche, /prova degli estremi/);
    assert.equal(st.db.links[0].rel, 'causa');
});

test('judge: archived non-PDF text supplies uncited context even when UI source.content is empty', async () => {
    const { window: w, appState: st } = runtime();
    const anchor = 'La Banca Nazionale Svizzera comprava oro e partecipava agli scambi internazionali.';
    st.db.nodes = [{ id: 'A', label: 'Valuta', group: 1, level: 1, desc: WRONG }];
    st.db.sourcesDict = { A: [{ title: 'Testo docente', source: 'Fonte testuale', text: anchor, verbatim: true }] };
    st.sources = [{ type: 'text', content: '' }];
    st._generationSources = [{ id: 'original-text', title: 'Testo docente', type: 'text', content: anchor + '\n' + GOLD }];
    st._pdfPagine = [{ pages: [{ n: 5, text: 'VECCHIO_PDF non appartiene alla nuova lezione sul commercio internazionale.' }] }];
    w.fetchModelAPI = async payload => {
        const prompt = payload.contents[0].parts[0].text;
        assert.ok(prompt.includes(GOLD));
        assert.ok(prompt.includes('Testo docente — fonte senza pagine'));
        assert.ok(!prompt.includes('VECCHIO_PDF'));
        return response({ nodi: [{ id: 'A', tipo: 'soggetto-invertito', problema: 'Il soggetto è invertito.', prova: GOLD,
            brano_errato: 'La Svizzera vende oro alla Germania', con: 'La Germania vende oro alla Svizzera' }], link: [] });
    };
    const report = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(report.stato, 'completato');
    assert.equal(report.correzioni.length, 1);
    const proof = report.correzioni[0].evidenze.find(e => e.text === GOLD);
    assert.equal(proof.docId, 'original-text'); assert.equal(proof.page, 0);
    assert.equal(st.db.nodes[0].desc, WRONG);
});

test('judge: mixed PDF and unpaged originals keep source identity when pages overlap', async () => {
    const { window: w, appState: st } = runtime();
    const anchorA = 'Le banche svizzere partecipavano a diversi scambi commerciali con paesi stranieri.';
    const anchorB = 'Durante la guerra la popolazione svizzera affrontava una disponibilità limitata di risorse alimentari.';
    const unrelated = 'ALTRO_DOCUMENTO descrive la produzione industriale francese e i suoi rapporti economici.';
    st.db.nodes = [{ id: 'A', group: 1, level: 1, label: 'Oro', desc: GOLD }, { id: 'B', group: 2, level: 1, label: 'Alimenti', desc: FOOD }];
    st.db.sourcesDict = {
        A: [{ docId: 'pdf-one', title: 'Storia PDF', page: 5, source: 'pagina 5', text: anchorA, verbatim: true }],
        B: [{ docId: 'word-one', title: 'Appunti Word', text: anchorB, source: 'Fonte testuale', verbatim: true }]
    };
    st._generationSources = [
        { id: 'pdf-one', title: 'Storia PDF', pages: [{ n: 5, text: anchorA + ' ' + GOLD }] },
        { id: 'word-one', title: 'Appunti Word', text: anchorB + ' ' + FOOD },
        { id: 'other-pdf', title: 'Altra lezione', pages: [{ n: 5, text: unrelated }] }
    ];
    let calls = 0;
    w.fetchModelAPI = async payload => {
        const prompt = payload.contents[0].parts[0].text;
        const id = payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum[0];
        assert.ok(!prompt.includes('ALTRO_DOCUMENTO'));
        assert.ok(prompt.includes(id === 'A' ? GOLD : FOOD));
        assert.ok(prompt.includes(id === 'A' ? 'Storia PDF — pagina 5' : 'Appunti Word — fonte senza pagine'));
        assert.ok(!prompt.includes(id === 'A' ? FOOD : GOLD));
        calls++; return response({ nodi: [], link: [] });
    };
    assert.equal((await w.executeJudgePass('mock-key', { enabled: true, apply: false })).stato, 'completato');
    assert.equal(calls, 2);
    st._pdfPagine = [{ pages: [{ n: 5, text: GOLD }] }];
    st._generationSources = [];
    const skipped = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(skipped.stato, 'saltato');
    assert.match(skipped.motivoSkip, /fonte non disponibile/);
    assert.equal(calls, 2, 'an explicit empty source snapshot does not resurrect older input');
});
