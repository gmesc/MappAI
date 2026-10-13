'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const J = require('../public/js/mappai-judge-core.js');
const A = require('../public/js/mappai-anchor-core.js');
const E = require('../public/js/mappai-evidence-core.js');
const salvage = require('../public/js/mappai-json-salvage.js').salvage;
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function runtime(flags = {}) {
    const window = { MappAIJudgeCore: J, MappAIEvidenceCore: E, MappAIAnchorCore: A, MappAIJsonSalvage: require('../public/js/mappai-json-salvage.js'), MappAIMath: require('../public/js/mappai-math.js'), getMaxOutputTokens: n => n, t: (_k, fallback) => fallback };
    const appState = { db: { nodes: [], links: [], sourcesDict: {} }, sources: [], rootNodeLabel: 'Svizzera' };
    const context = vm.createContext({ window, appState, console: { log() {}, info() {}, warn() {} },
        localStorage: { getItem: k => flags[k] || null }, salvageTruncatedJSON: salvage, buildSystemInstruction: x => x,
        setTimeout, clearTimeout });
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
function proof(st, text) {
    const registry = E.registroGiudice(st._generationSources || st._pdfPagine || st.sources);
    return registry.passaggi.find(p => p.citabile && p.text.includes(text)).id;
}
function requestedLinks(payload) {
    return JSON.parse(payload.contents[0].parts[0].text.split('NESSI RICHIESTI:\n')[1].split('\n')[0]);
}
function supported(st, links) {
    return links.map(l => ({ ...l, esito: 'sostenuto', problema: 'La fonte sostiene il rapporto.', prove: [proof(st, GOLD)] }));
}

test('judge does not request or count a relation-free link as checked', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    st.db.links = [{ source: 'A', target: 'B', rel: '', relNone: true }];
    w.fetchModelAPI = async payload => {
        const properties = payload.generationConfig.responseSchema.properties;
        assert.equal(properties.link.maxItems, 0, 'no assertions about relation-free edges');
        return response({ nodi: [], link: [] });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.copertura.linkEsaminati.length, 0);
    assert.equal(r.copertura.linkSaltati.length, 0);
    assert.equal(r.copertura.nodiSaltati.length, 0, JSON.stringify(r.copertura));
    assert.equal(st.db.links[0].relNone, true);
});
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
        const verdicts = supported(st, requestedLinks(payload));
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

test('judge: missing node citations no longer block full-source review; failures and missing root verdicts remain incomplete', async () => {
    for (const mode of ['no-evidence', 'provider-error', 'missing-link']) {
        const { window: w, appState: st } = runtime();
        setMap(st);
        st.db.nodes.unshift({ id: 'ROOT', level: 0, label: 'Svizzera', desc: GOLD });
        if (mode !== 'no-evidence') st.db.sourcesDict.ROOT = [{ text: GOLD, verbatim: true }];
        st.db.links = [{ source: 'ROOT', target: 'A', rel: 'riguarda' }];
        w.fetchModelAPI = async payload => {
            if (mode === 'provider-error' && payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('ROOT')) throw new Error('unavailable');
            return response({ nodi: [], link: mode === 'no-evidence' ? supported(st, requestedLinks(payload)) : [] });
        };
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.equal(r.stato, mode === 'no-evidence' ? 'completato' : 'parziale', mode);
        if (mode === 'provider-error') assert.ok(r.copertura.nodiSaltati.some(n => n.id === 'ROOT'), mode);
        else assert.ok(r.copertura.nodiEsaminati.includes('ROOT'));
        assert.equal(r.copertura.linkSaltati.some(l => l.source === 'ROOT'), mode !== 'no-evidence', mode);
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
                answer = { nodi: [{ id: 'A', tipo: 'soggetto-invertito', problema: 'Il venditore è invertito.', prove: [proof(st, GOLD)],
                    brano_errato: 'La Svizzera vende oro alla Germania', con: 'La Germania vende oro alla Svizzera' }],
                    link: [{ source: 'A', target: 'B', rel: 'causa', esito: 'contraddetto', problema: 'La fonte contraddice questo rapporto.', prove: [proof(st, GOLD), proof(st, FOOD)] }] };
            } else assert.ok(!prompt.includes(JSON.stringify({ source: 'A', target: 'B', rel: 'causa' })), 'cross-group link is not reviewed twice');
            if (provider === 'infomaniak') {
                const translated = w.InfomaniakBridge.translatePayload(payload, 'google/gemma-4-31B-it');
                const schema = translated.response_format.json_schema.schema;
                assert.ok(schema.required.includes('link'));
                assert.deepEqual(plain(schema.properties.nodi.items.properties.tipo.enum), J.TIPI);
                assert.ok(translated.messages.some(m => m.content.includes('FONTI INTEGRALI')));
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
        assert.equal(r.linkTolti[0].soloProposta, true);
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
            assert.ok(links.items.properties.prove.items.enum.includes(proof(st, GOLD)));
            assert.equal(links.items.properties.prova_source, undefined);
            const prompt = payload.contents[0].parts[0].text;
            assert.match(prompt, /metadati documento\/titolo\/pagina non sono prove/);
            assert.ok(prompt.includes('"testo":' + JSON.stringify(GOLD)));
            assert.ok(prompt.includes(JSON.stringify({ source: 'A', target: 'B', rel: 'causa' })));
        }
        assert.equal(payload.generationConfig.maxOutputTokens, 4096);
    }
});

test('judge: positive verdict without real evidence remains unchecked', async () => {
    const { window: w, appState: st } = runtime();
    setMap(st);
    w.fetchModelAPI = async payload => {
        assert.ok(payload.generationConfig.responseSchema.required.includes('link'));
        return response({ nodi: [], link: requestedLinks(payload).map(l => ({ ...l, esito: 'sostenuto', problema: 'Rapporto presente', prove: ['inventata'] })) });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.copertura.linkEsaminati.length, 0);
    assert.equal(r.copertura.linkSaltati.length, 1);
    assert.match(r.copertura.linkSaltati[0].motivo, /prova|ID/i);
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
    w.fetchModelAPI = async () => { if (++calls === 2) throw new Error('provider unavailable'); return response({ nodi: [], link: [] }); };
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
            ? [{ source: 'A', target: 'B', rel: 'causa', esito: 'contraddetto', problema: 'Nesso dubbio', prove: [proof(st, FOOD)], prova_source: 'Una fonte inventata e mai mostrata.', prova_target: FOOD }] : [] });
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.linkTolti.length, 0);
    assert.equal(r.scartati.length, 1);
    assert.equal(r.scartati[0].source, 'A');
    assert.equal(r.scartati[0].problema, 'Nesso dubbio');
    assert.match(r.scartati[0].perche, /prova|liber|contratto|rel/i);
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
        assert.ok(prompt.includes('"titolo":"Testo docente","pagina":null'));
        assert.ok(!prompt.includes('VECCHIO_PDF'));
        return response({ nodi: [{ id: 'A', tipo: 'soggetto-invertito', problema: 'Il soggetto è invertito.', prove: [proof(st, GOLD)],
            brano_errato: 'La Svizzera vende oro alla Germania', con: 'La Germania vende oro alla Svizzera' }], link: [] });
    };
    const report = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(report.stato, 'completato');
    assert.equal(report.correzioni.length, 1);
    const evidence = report.correzioni[0].evidenze.find(e => e.text.includes(GOLD));
    assert.equal(evidence.docId, 'original-text'); assert.equal(evidence.page, 0);
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
        assert.ok(prompt.includes('ALTRO_DOCUMENTO'), 'every original in the frozen source snapshot is supplied');
        assert.ok(prompt.includes(GOLD) && prompt.includes(FOOD));
        assert.ok(prompt.includes('"documento":"pdf-one","titolo":"Storia PDF","pagina":5'));
        assert.ok(prompt.includes('"documento":"word-one","titolo":"Appunti Word","pagina":null'));
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

test('judge: complete source admits the four page-2 links and a twelfth passage outside old node windows', async () => {
    const { window: w, appState: st } = runtime();
    const military = 'La difesa militare richiedeva il comando, le misure di mobilitazione, le opere difensive e il ridotto nazionale.';
    const easing = 'Le restrizioni all’asilo vennero allentate nel periodo finale della guerra.';
    const intervening = Array.from({ length: 11 }, (_, i) => `La frase intermedia ${i} parla di un argomento diverso e non riguarda le restrizioni all’asilo.`).join(' ');
    st._generationSources = [{ id: 'original', origin: 'original', title: 'Storia', pages: [
        { n: 2, text: military }, { n: 3, text: GOLD }, { n: 5, text: FOOD }, { n: 6, text: intervening + ' ' + easing }
    ] }];
    st.db.nodes = [
        { id: 'D', level: 1, group: 1, label: 'Difesa Militare', desc: military },
        ...['Comando', 'Mobilitazione', 'Opere', 'Ridotto'].map((label, i) => ({ id: 'D' + i, level: 2, group: 1, label, desc: military })),
        { id: 'R', level: 1, group: 2, label: 'Restrizioni', desc: easing },
        { id: 'E', level: 2, group: 2, label: 'Allentamento', desc: easing }
    ];
    st.db.links = [0, 1, 2, 3].map(i => ({ source: 'D', target: 'D' + i, rel: 'richiede' }))
        .concat([{ source: 'R', target: 'E', rel: 'evolve in' }]);
    // Old per-node citations deliberately miss page 2 and the last page-6 sentence.
    st.db.sourcesDict = { D: [{ text: GOLD, source: 'pagina 3', verbatim: true }], E: [{ text: intervening, source: 'pagina 6', verbatim: true }] };
    const before = JSON.stringify(st.db), seen = [];
    w.fetchModelAPI = async payload => {
        const links = requestedLinks(payload);
        seen.push(...links);
        assert.ok(payload.contents[0].parts[0].text.includes(easing));
        return response({ nodi: [], link: links.map(l => ({ ...l, esito: 'sostenuto', problema: 'Il testo esprime la relazione.',
            prove: [proof(st, l.source === 'D' ? military : easing)] })) });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.stato, 'completato'); assert.equal(r.esitiLink.length, 5);
    assert.equal(r.esitiLink.filter(l => l.evidenze[0].page === 2).length, 4);
    assert.equal(r.esitiLink.find(l => l.source === 'R').evidenze[0].page, 6);
    assert.equal(new Set(seen.map(l => JSON.stringify(l))).size, 5);
    assert.equal(JSON.stringify(st.db), before);
    // This verifies source admissibility, not the semantic precision of a live LLM.
});

test('judge: preflight stops before all calls if source or even one serialized request exceeds the budget', async () => {
    for (const oversized of ['source', 'target']) {
        const { window: w, appState: st } = runtime(); setMap(st);
        if (oversized === 'source') st._generationSources = [{ id: 'large', origin: 'original', text: 'Testo completo. '.repeat(1700) }];
        else st.db.nodes[1].desc = 'Descrizione enorme. '.repeat(3000);
        w.fetchModelAPI = () => assert.fail('no partial run before preflight ends');
        const before = JSON.stringify(st.db);
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.equal(r.stato, 'saltato'); assert.equal(r.fonte.fornita, false);
        assert.match(r.motivoSkip, oversized === 'source' ? /24000/ : /48000/);
        assert.equal(r.copertura.nodiSaltati.length, 2); assert.equal(r.copertura.linkSaltati.length, 1);
        assert.equal(JSON.stringify(st.db), before);
    }
});

test('judge: every batch gets the whole unchanged text; a failed batch cannot erase other verdicts', async () => {
    const { window: w, appState: st } = runtime();
    const long = 'Quale conseguenza? Completa: _____. ' + 'Una frase lunga continua a descrivere la fonte originale. '.repeat(24) + ' Fine.';
    st._generationSources = [{ id: 'sheet', origin: 'original', pages: [{ n: 1, text: long }, { n: 2, text: GOLD }] }];
    st.db.nodes = Array.from({ length: 19 }, (_, i) => ({ id: 'N' + i, level: i ? 2 : 1, group: 1, desc: GOLD, label: 'Concetto ' + i }));
    st.db.links = st.db.nodes.slice(1).map(n => ({ source: 'N0', target: n.id, rel: 'comprende' }));
    let calls = 0;
    const requested = [], descs = [];
    w.fetchModelAPI = async payload => {
        calls++;
        assert.ok(JSON.stringify(payload).length <= 48000);
        const prompt = payload.contents[0].parts[0].text;
        const chunks = JSON.parse(prompt.split('FONTI INTEGRALI (metadati documento/titolo/pagina non sono prove; solo testo e ID dei passaggi):\n')[1].split('\n')[0]);
        assert.equal(chunks.filter(p => p.pagina === 1).map(p => p.testo).join(''), long);
        assert.equal(chunks.filter(p => p.pagina === 2).map(p => p.testo).join(''), GOLD);
        descs.push(...JSON.parse(prompt.split('DESCRIZIONI RICHIESTE:\n')[1].split('\n')[0]));
        const links = requestedLinks(payload); requested.push(...links);
        if (calls === 3) throw new Error('mock batch failure');
        return response({ nodi: [], link: supported(st, links) });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.ok(calls > 3); assert.equal(r.stato, 'parziale');
    assert.equal(descs.length, 19); assert.equal(new Set(descs).size, 19);
    assert.equal(requested.length, 18); assert.equal(new Set(requested.map(l => JSON.stringify(l))).size, 18);
    assert.equal(r.copertura.nodiEsaminati.length + r.copertura.nodiSaltati.length, 19);
    assert.equal(r.copertura.linkEsaminati.length + r.copertura.linkSaltati.length, 18);
    assert.ok(r.esitiLink.length > 0); assert.ok(r.copertura.linkSaltati.length > 0);
    assert.equal(r.fonte.lottiForniti, calls);
});

test('judge: blank pages and extraction warnings keep whole-source report partial despite accepted responses', async () => {
    for (const incomplete of ['blank', 'extraction']) {
        const { window: w, appState: st } = runtime(); setMap(st);
        st._generationSources = [{ id: 'scan', origin: 'original', pages: [{ n: 1, text: GOLD },
            { n: 2, text: incomplete === 'blank' ? '  ' : FOOD, extractionWarning: incomplete === 'extraction' }] }];
        w.fetchModelAPI = async payload => response({ nodi: [], link: supported(st, requestedLinks(payload)) });
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.equal(r.stato, 'parziale', incomplete); assert.equal(r.fonte.fornita, true);
        assert.equal(r.copertura.linkEsaminati.length, 1); assert.equal(r.copertura.linkSaltati.length, 0);
        if (incomplete === 'blank') assert.equal(r.fonte.copertura.pagineVuote, 1);
        else assert.ok(r.fonte.diagnostica.some(d => d.code === 'extraction_order'));
    }
});

test('judge: insufficient evidence stays a residual and is never a removal proposal', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    w.fetchModelAPI = async payload => response({ nodi: [], link: requestedLinks(payload).map(l => ({ ...l,
        esito: 'non_verificabile', problema: 'La fonte non chiarisce il rapporto causale.', prove: [] })) });
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.stato, 'parziale'); assert.equal(r.linkTolti.length, 0);
    assert.equal(r.copertura.linkSaltati[0].esito, 'non_verificabile');
    assert.equal(r.esitiLink[0].esito, 'non_verificabile'); assert.equal(r.scartati.length, 0);
});

test('judge: legacy non-review caller retains its original response contract and apply rules', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    delete w.MappAIEvidenceCore;
    w.fetchModelAPI = async payload => {
        assert.ok(payload.contents[0].parts[0].text.includes('FRASI DELLA FONTE'));
        const ids = payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum;
        return response({ nodi: [], link: ids.includes('A') ? [{ source: 'A', target: 'B', rel: 'causa', valido: true,
            prova_source: GOLD, prova_target: FOOD }] : [] });
    };
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: true });
    assert.equal(r.contratto, undefined); assert.equal(r.stato, 'completato');
    assert.equal(r.applicaAcceso, true); assert.equal(r.copertura.linkEsaminati.length, 1);
});

test('judge: a parseable but interrupted response never counts descriptions as examined', async () => {
    for (const finish of ['MAX_TOKENS', 'length', 'SAFETY', 'marker']) {
        const { window: w, appState: st } = runtime(); setMap(st);
        st.db.links = [];
        w.fetchModelAPI = async () => {
            const r = response({ nodi: [], link: [] });
            if (finish === 'marker') r._mappaiTruncated = true;
            else r.candidates[0].finishReason = finish;
            return r;
        };
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.equal(r.stato, 'parziale', finish);
        assert.equal(r.copertura.nodiEsaminati.length, 0);
        assert.equal(r.copertura.nodiSaltati.length, 2);
        assert.match(r.esitiRami[0].motivo, /interrotta/);
    }
});

test('judge: the Infomaniak request budget includes the bridge schema and instruction overhead', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    st.db.nodes = [st.db.nodes[0]]; st.db.links = [];
    st.db.nodes[0].desc = 'x'.repeat(42750);
    st._reviewAIContext = { provider: 'infomaniak', model: 'Qwen/Qwen3.5-122B-A10B-FP8' };
    let originalSize, wireSize;
    const translate = w.InfomaniakBridge.translatePayload;
    w.InfomaniakBridge.translatePayload = (p, m) => {
        const wire = translate(p, m);
        originalSize = JSON.stringify(p).length; wireSize = JSON.stringify(wire).length;
        return wire;
    };
    w.fetchModelAPI = () => assert.fail('must stop before sending an oversized translated request');
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.ok(originalSize < 48000); assert.ok(wireSize > 48000);
    assert.equal(r.stato, 'saltato'); assert.match(r.motivoSkip, /48000/);
});

// ── packet 0026: i lotti che corrono fino al tetto ─────────────────────────
const SPAZI = ' '.repeat(58000);
function firme(st) {
    const v = { id: 'A', tipo: 'soggetto-invertito', problema: 'La fonte dice “la Germania”, non «la Svizzera».', prove: [proof(st, GOLD)],
        brano_errato: 'La Svizzera vende oro alla Germania', con: 'La Germania vende oro alla Svizzera' };
    const l = { source: 'A', target: 'B', rel: 'causa', esito: 'sostenuto', problema: 'Il testo', prove: [proof(st, GOLD)] };
    return {
        'stringa aperta': '{"nodi":[' + JSON.stringify(v) + '],"link":[{"source":"A","target":"B","rel":"causa","esito":"sostenuto","problema":"Il testo' + SPAZI,
        'virgola finale': '{"nodi":[' + JSON.stringify(v) + '],"link":[' + JSON.stringify(l) + '],' + SPAZI,
        'oggetto non chiuso': '{\n"nodi":[\n' + JSON.stringify(v) + '\n],\n"link":[\n' + JSON.stringify(l) + '\n]' + '\n'.repeat(66) + SPAZI
    };
}
const alTetto = (text, outTok = 4096) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: { candidatesTokenCount: outTok } });

for (const nome of ['stringa aperta', 'virgola finale', 'oggetto non chiuso']) {
    test('0026 judge: «' + nome + '» al tetto con `stop` dal trasporto → verdetti parziali + estratto, lotto ritentabile', async () => {
        const { window: w, appState: st } = runtime(); setMap(st);
        w.fetchModelAPI = async payload => payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('A')
            ? alTetto(firme(st)[nome]) : response({ nodi: [], link: [] });
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        const lotto = r.esitiRami[0];
        assert.equal(lotto.stato, 'parziale', 'il lotto non è perso');
        assert.equal(lotto.tecnico, 'tetto');
        assert.match(lotto.motivo, /interrotta al tetto \(4096\/4096 token\)/);
        assert.equal(r.correzioni.length, 1, 'il verdetto chiuso sopravvive');
        assert.equal(r.correzioni[0].lotto, 1);
        assert.match(r.correzioni[0].problema, /“la Germania”, non «la Svizzera»/);
        assert.equal(lotto.grezzo.outTok, 4096); assert.equal(lotto.grezzo.tetto, 4096);
        assert.equal(lotto.grezzo.lunghezza, firme(st)[nome].length);
        assert.match(JSON.stringify(lotto.grezzo), /⟨… 58\.\d{3} spazi …⟩/);
        assert.ok(!/mock-key|payload|stack|systemInstruction/.test(JSON.stringify(lotto.grezzo)), 'solo testo del modello');
        assert.ok(JSON.stringify(lotto.grezzo).length < 3000);
        assert.ok(J.lottoTecnico(lotto));
        assert.equal(r.stato, 'parziale');
        assert.ok(r.copertura.nodiEsaminati.includes('A'));
        if (nome === 'stringa aperta')
            assert.ok(r.copertura.linkSaltati.some(l => l.source === 'A' && /interrotta/.test(l.motivo)), 'un nesso senza verdetto chiuso resta scoperto');
        else assert.equal(r.esitiLink.length, 1, 'il verdetto chiuso sul nesso sopravvive');
    });
}

test('0026 judge: una risposta integra sotto il tetto non lascia estratto', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    w.fetchModelAPI = async payload => ({ ...response({ nodi: [], link: supported(st, requestedLinks(payload)) }), usageMetadata: { candidatesTokenCount: 400 } });
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(r.stato, 'completato');
    assert.ok(r.esitiRami.every(l => !l.grezzo && !l.tecnico));
});

test('0026 judge: tetto di durata — una promessa che non si risolve mai non ferma il giro', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    let orfana;
    const unhandled = [];
    const onUnhandled = e => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
        w.fetchModelAPI = payload => payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('A')
            ? new Promise(() => {})                                           // mai
            : (orfana = new Promise((_, reject) => setTimeout(() => reject(new Error('verifica: progetto cambiato')), 60)));
        const t0 = Date.now();
        const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false, tettoLottoMs: 25 });
        assert.ok(Date.now() - t0 < 1000);
        assert.equal(r.esitiRami.length, 2);
        r.esitiRami.forEach(l => { assert.equal(l.stato, 'errore'); assert.equal(l.tecnico, 'tempo'); assert.match(l.motivo, /tempo scaduto/); });
        assert.equal(r.stato, 'parziale');
        await new Promise(resolve => setTimeout(resolve, 100));           // la chiamata orfana rigetta dopo il tetto
        assert.ok(orfana);
        assert.equal(unhandled.length, 0, 'il rifiuto della chiamata orfana è assorbito');
    } finally { process.off('unhandledRejection', onUnhandled); }
});

test('0026 judge: «Riprova» rifà solo i lotti tecnici e conserva i verdetti degli altri', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    st._reviewAIContext = { provider: 'infomaniak', model: 'google/gemma-4-31B-it' };
    const conA = payload => payload.generationConfig.responseSchema.properties.nodi.items.properties.id.enum.includes('A');
    let calls = 0;
    w.fetchModelAPI = async payload => {
        calls++;
        if (conA(payload)) return response({ nodi: [{ id: 'A', tipo: 'fatto-contraddetto', problema: 'Il soggetto è girato.', prove: [proof(st, GOLD)] }],
            link: supported(st, requestedLinks(payload)) });
        return alTetto('{"nodi":[],"link":[' + SPAZI, 2048);
    };
    const primo = await w.executeJudgePass('mock-key', { enabled: true, apply: false });
    assert.equal(calls, 2);
    assert.deepEqual(plain(primo.modello), { provider: 'infomaniak', model: 'google/gemma-4-31B-it' });
    assert.equal(primo.esitiRami[1].tecnico, 'tetto');
    assert.equal(primo.segnalati.length, 1);

    calls = 0;
    const seen = [], tetti = [];
    w.fetchModelAPI = async payload => { calls++; seen.push(conA(payload)); tetti.push(payload.generationConfig.maxOutputTokens); return response({ nodi: [], link: [] }); };
    const secondo = await w.executeJudgePass('mock-key', { enabled: true, apply: false, rapportoPrecedente: plain(primo) });
    assert.equal(calls, 1, 'solo il lotto fallito');
    assert.deepEqual(seen, [false]);
    assert.deepEqual(tetti, [4096], 'il lotto fermato dal tetto riceve una seconda occasione vera');
    assert.deepEqual(plain(secondo.ripresa), { modo: 'mirata', motivo: '', rifatti: 1, riusati: 1 });
    assert.equal(secondo.esitiRami[0].riusato, true);
    assert.equal(secondo.segnalati.length, 1, 'il verdetto del lotto riuscito resta');
    assert.equal(secondo.esitiLink.length, 1);
    assert.equal(secondo.stato, 'completato');
    assert.deepEqual(plain(secondo.retrySummary), { mode: 'remaining', reason: '', targeted: 1, reused: 1, checked: 1, remaining: 0 });

    // Un altro giudice: si rifà tutto, e il rapporto lo dice.
    calls = 0;
    st._reviewAIContext = { provider: 'infomaniak', model: 'mistralai/Mistral-Small-4-119B-2603' };
    const terzo = await w.executeJudgePass('mock-key', { enabled: true, apply: false, rapportoPrecedente: plain(primo) });
    assert.equal(calls, 2);
    assert.equal(terzo.ripresa.modo, 'completa'); assert.match(terzo.ripresa.motivo, /modello diverso/);
});

test('0026 judge: avanzamento per lotto, e un onProgress che lancia non ferma il controllo', async () => {
    const { window: w, appState: st } = runtime(); setMap(st);
    w.fetchModelAPI = async () => response({ nodi: [], link: [] });
    const visti = [];
    const r = await w.executeJudgePass('mock-key', { enabled: true, apply: false,
        onProgress: p => { visti.push([p.lotto, p.totale, p.etichetta]); throw new Error('UI rotta'); } });
    assert.deepEqual(visti, [[1, 2, 'Valuta'], [2, 2, 'Alimenti']]);
    assert.equal(r.esitiRami.length, 2);
    assert.ok(r.esitiRami.every(l => l.stato !== 'errore'));
});

test('0026 judge: su Infomaniak il tetto base dei token è 2048, su Google resta 4096', async () => {
    for (const [provider, atteso] of [['infomaniak', 2048], ['google', 4096]]) {
        const { window: w, appState: st } = runtime(); setMap(st);
        st._reviewAIContext = { provider, model: provider === 'infomaniak' ? 'google/gemma-4-31B-it' : 'gemini-2.0-flash' };
        const tetti = [];
        w.fetchModelAPI = async payload => { tetti.push(payload.generationConfig.maxOutputTokens); return response({ nodi: [], link: [] }); };
        await w.executeJudgePass('mock-key', { enabled: true, apply: false });
        assert.deepEqual(tetti, [atteso, atteso], provider);
    }
});

test('0026 (f): nessun maxLength su «problema» negli schemi del Giudice, e il prompt chiede al massimo due frasi', async () => {
    const schemi = [], prompt = [];
    for (const apply of [false, true]) {                  // contratto 0024 e percorso legacy
        const { window: w, appState: st } = runtime(); setMap(st);
        w.fetchModelAPI = async payload => {
            schemi.push(payload.generationConfig.responseSchema); prompt.push(payload.contents[0].parts[0].text);
            return response({ nodi: [], link: [] });
        };
        await w.executeJudgePass('mock-key', { enabled: true, apply });
    }
    assert.ok(schemi.length >= 3);
    const problemi = [];
    (function visita(x) {
        if (!x || typeof x !== 'object') return;
        if (x.properties && x.properties.problema) problemi.push(x.properties.problema);
        Object.values(x).forEach(visita);
    })(schemi);
    assert.ok(problemi.length >= 4, 'nodi e link, in entrambi i percorsi');
    problemi.forEach(p => assert.equal(p.maxLength, undefined, 'il tetto su problema è tornato'));
    // I tetti che non tagliavano restano.
    assert.ok(schemi.some(s => s.properties.nodi.items.properties.brano_errato.maxLength === 120));
    prompt.forEach(p => assert.match(p, /al massimo due frasi/));
});
