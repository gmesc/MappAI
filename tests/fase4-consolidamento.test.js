'use strict';
// Packet 0121 — la Fase 4 (fusioni e cross link) dentro la generazione di una MindMap.
// Lotto 1: una fusione fatta in generazione non disegna, non scrive in Annulla, non mostra un toast;
// senza opzioni `executeMerge` fa quello di sempre (ELABORA, suggerimenti, menu del nodo).
// Il guasto riprodotto qui è quello del banco del 21/10 (5239 errori «Cannot create property 'vx' on
// string 'L1_0'»): la seconda mappa della sessione trova il disegno della prima; `executeMerge` →
// `renderGraph` fa adottare alla simulazione di d3 l'array vivo dei link; il sanificatore dell'albero
// riscrive `source`/`target` in stringa sugli stessi oggetti; al tick dopo d3 scrive `vx` su una stringa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');

// La risposta del modello per la SECONDA mappa (prefisso M2_: ha gli id suoi, come ogni mappa nuova).
const RISPOSTA = '===MERGES===\n{"keep":"M2_L1_0_L2_B","drop":"M2_L1_1_L2_B","reason":"doppione cross-ramo"}\n'
    + '===CROSSLINKS===\n{"source":"M2_L1_0_L2_A","target":"M2_L1_1_L2_A","rel":"causa"}\n';

function mappa(prefisso) {
    const n = (id, level, group) => ({ id, label: id, level, group, desc: 'desc ' + id });
    const l = (source, target) => ({ source, target, rel: 'include' });
    return {
        nodes: [n('ROOT', 0, 0), n('L1_0', 1, 1), n('L1_1', 1, 2),
            n('L1_0_L2_A', 2, 1), n('L1_0_L2_B', 2, 1), n('L1_1_L2_A', 2, 2), n('L1_1_L2_B', 2, 2)]
            .map(x => (prefisso ? { ...x, id: prefisso + x.id, label: prefisso + x.id } : x)),
        links: [l('ROOT', 'L1_0'), l('ROOT', 'L1_1'), l('L1_0', 'L1_0_L2_A'), l('L1_0', 'L1_0_L2_B'),
            l('L1_1', 'L1_1_L2_A'), l('L1_1', 'L1_1_L2_B')]
            .map(x => (prefisso ? { ...x, source: prefisso + x.source, target: prefisso + x.target } : x)),
        sourcesDict: {}, customColors: {}
    };
}

// Un runtime con d3 vero, il modulo delle fusioni, la Fase 4 e il sanificatore dell'albero veri;
// `renderGraph` è un doppio che fa quello che fa il vero con la simulazione (mappai-d3-render.js:344-395).
function runtime(flags = {}) {
    const spie = { render: 0, annulla: 0, toast: 0 };
    const window = {
        cleanLabel: x => x, t: (_k, f) => f, relVocab: () => 'causa, richiede', mapLangNote: () => '',
        getMaxOutputTokens: n => n, updateDegreeStats() {},
        pushUndoSnapshot() { spie.annulla++; }, showToast() { spie.toast++; },
        MappAIMath: require('../public/js/mappai-math.js'), MappAIJsonSalvage: require('../public/js/mappai-json-salvage.js')
    };
    const appState = { db: mappa(), extractionMode: 'mindmap', aiProvider: 'infomaniak' };
    window.appState = appState;
    const context = vm.createContext({ window, appState, console: { log() {}, info() {}, warn() {} },
        localStorage: { getItem: k => (k in flags ? flags[k] : (k === 'mappai_mm_phase4_enabled' ? '1' : null)) },
        setTimeout, clearTimeout, setInterval, clearInterval, performance,
        document: { getElementById: () => null, addEventListener() {} } });
    vm.runInContext(read('d3.v7.min.js'), context);
    vm.runInContext(`
        let simulation = null;
        function renderGraph() {
            window.__spie.render++;
            const nodes = appState.db.nodes;
            const ids = new Set(nodes.map(n => n.id)), eid = x => (x && typeof x === 'object') ? x.id : x;
            appState.db.links = appState.db.links.filter(l => ids.has(eid(l.source)) && ids.has(eid(l.target)));
            const links = appState.db.links;
            if (!simulation) simulation = d3.forceSimulation(nodes).force('link', d3.forceLink(links).id(d => d.id)).stop();
            else { simulation.nodes(nodes); simulation.force('link').links(links); }
            window.__simulazione = simulation;
        }`, context);
    context.window.__spie = spie;
    vm.runInContext(read('mappai-node-merge.js'), context);
    vm.runInContext(read('mappai-generation-support.js'), context);
    vm.runInContext(read('mappai-tree-sanitizer.js'), context);
    const giro = { chat: async () => ({ candidates: [{ content: { parts: [{ text: RISPOSTA }] } }] }), fase: () => 'm', verifica() {} };
    return { window, appState, spie, giro, disegna: () => vm.runInContext('renderGraph()', context) };
}

test('0121 L1: la Fase 4 alla seconda mappa della sessione non rompe la simulazione della prima', async () => {
    const { window, appState, spie, giro, disegna } = runtime();
    disegna();                                    // la prima mappa è sul disegno: la simulazione tiene i suoi array
    assert.equal(spie.render, 1);
    appState.db = mappa('M2_');                   // la seconda generazione: array nuovi, source/target in stringa
    const rapporto = await window.executePhase4Consolidation(giro);
    assert.equal(rapporto.merges.applied, 1, 'la fusione si applica: ' + JSON.stringify(rapporto.merges.errors));
    assert.equal(rapporto.crosslinks.applied, 1, 'il cross link si applica');
    window.sanitizeMindMapTree();                 // il passo 1 del sanificatore riscrive source/target in stringa
    assert.doesNotThrow(() => window.__simulazione.tick(300), 'il disegno della prima mappa continua a vivere');
    assert.equal(spie.render, 1, 'in generazione nessun disegno');
    assert.equal(spie.annulla, 0, 'in generazione nessuna voce in Annulla');
    assert.equal(spie.toast, 0, 'in generazione nessun toast');
    assert.equal(appState.db.nodes.length, 6, 'il doppione è sparito');
    const cross = appState.db.links.filter(l => l.isCross);
    assert.equal(cross.length, 2, 'quello del modello e quello lasciato dalla fusione fra i due rami (Lotto 3)');
    const delModello = cross.find(l => l._phase4 === true), dallaFusione = cross.find(l => l._phase4 === 'fusione');
    assert.equal(delModello.source, 'M2_L1_0_L2_A');
    assert.equal(delModello.target, 'M2_L1_1_L2_A');
    assert.equal(dallaFusione.source, 'M2_L1_1', 'il vecchio genitore del doppione');
    assert.equal(dallaFusione.target, 'M2_L1_0_L2_B', 'il nodo tenuto');
});

// Una mappa «piena»: ROOT, cinque L1, due L2 per L1, due L3 per L2 (36 nodi). Gli id sono quelli che la
// Fase 3 dà davvero (L1_0_L2_A, L1_0_L3_B2…): così le risposte vere catturate al Lotto 0 trovano i loro nodi.
function mappaPiena() {
    const nodes = [{ id: 'ROOT', label: 'ROOT', level: 0, group: 0 }], links = [];
    for (let i = 0; i < 5; i++) {
        const l1 = `L1_${i}`; nodes.push({ id: l1, label: l1, level: 1, group: i + 1 }); links.push({ source: 'ROOT', target: l1, rel: 'include' });
        for (const x of ['A', 'B']) {
            const l2 = `${l1}_L2_${x}`; nodes.push({ id: l2, label: l2, level: 2, group: i + 1 }); links.push({ source: l1, target: l2, rel: 'include' });
            for (const k of ['1', '2']) {
                const l3 = `${l1}_L3_${x}${k}`; nodes.push({ id: l3, label: l3, level: 3, group: i + 1 }); links.push({ source: l2, target: l3, rel: 'include' });
            }
        }
    }
    return { nodes, links, sourcesDict: {}, customColors: {} };
}
const fixture = nome => fs.readFileSync(path.join(__dirname, 'fixtures/fase4', nome), 'utf8');
const giroCon = testo => ({ chat: async () => ({ candidates: [{ content: { parts: [{ text: testo }] } }] }), fase: () => 'm', verifica() {} });

test('0121 L2: il tetto alle fusioni — al più 20 e al più un quinto dei nodi; le scartate si contano', async () => {
    const { window, appState } = runtime();
    appState.db = mappaPiena();                   // 36 nodi → tetto 7
    const righe = [];
    for (let i = 0; i < 5; i++) righe.push(`{"keep":"L1_${i}_L3_A1","drop":"L1_${(i + 1) % 5}_L3_B2","reason":"doppione ${i}"}`);
    for (let i = 0; i < 5; i++) righe.push(`{"keep":"L1_${i}_L3_A2","drop":"L1_${(i + 2) % 5}_L3_B1","reason":"sinonimi ${i}"}`);
    righe.push('{"keep":"L1_{}","drop":""}');     // l'ID degenerato di Gemma: scartato prima del tetto, non lo consuma
    const rapporto = await window.executePhase4Consolidation(giroCon('===MERGES===\n' + righe.join('\n') + '\n===CROSSLINKS===\n'));
    assert.equal(rapporto.merges.applied, 7, 'sette applicate: floor(36 / 5)');
    assert.equal(rapporto.merges.tetto, 3, 'tre scartate per il tetto');
    assert.equal(rapporto.merges.skipped, 1, 'una scartata per ID inesistente');
    assert.equal(rapporto.merges.elenco.length, 7, 'l\'elenco leggibile delle fusioni applicate');
    assert.match(rapporto.merges.elenco[0], /L1_1_L3_B2.*→.*L1_0_L3_A1.*doppione 0/);
    assert.equal(appState.db.nodes.length, 36 - 7);
});

test('0121 L2: sulla risposta vera di Gemma che degenera il rapporto conta la prosa e applica solo le fusioni buone', async () => {
    const { window, appState } = runtime();
    appState.db = mappaPiena();
    const rapporto = await window.executePhase4Consolidation(giroCon(fixture('gemma-feudalesimo-2.txt')));
    assert.equal(rapporto.merges.applied, 4, 'le quattro fusioni con ID veri');
    assert.equal(rapporto.merges.skipped, 20, 'le venti {"keep":"L1_{}"}');
    assert.equal(rapporto.merges.tetto, 0);
    assert.equal(rapporto.parser.lost.merges, 55, 'il lettore non cambia');
    assert.ok(rapporto.parser.prosa >= 30, 'le righe in cui il modello parla da solo: ' + rapporto.parser.prosa);
});

// Lotto 3 — la fusione fra due rami lascia il suo cross link (forma C): il doppione L1_1_L3_B2 (ramo L1_1,
// sotto L1_1_L2_B) sparisce dentro L1_0_L3_A1 (ramo L1_0, sotto L1_0_L2_A); il vecchio genitore L1_1_L2_B
// resta collegato al nodo tenuto da un cross link, che il sanificatore non tocca. Forma A: nessun cross
// link, e il sanificatore toglie il secondo genitore come oggi.
const FUSIONE_FRA_RAMI = '===MERGES===\n{"keep":"L1_0_L3_A1","drop":"L1_1_L3_B2","reason":"doppione cross-ramo"}\n===CROSSLINKS===\n';
const arco = (ls, s, t) => ls.find(l => l.source === s && l.target === t);

test('0121 L3, forma C: la fusione fra due rami lascia «vecchio genitore → nodo tenuto» come cross link, e il sanificatore lo conserva', async () => {
    const { window, appState } = runtime();
    appState.db = mappaPiena();
    const rapporto = await window.executePhase4Consolidation(giroCon(FUSIONE_FRA_RAMI));
    assert.equal(rapporto.merges.applied, 1);
    assert.equal(rapporto.crosslinks.fusioni, 1, 'un cross link nato dalla fusione');
    window.sanitizeMindMapTree();
    const cross = arco(appState.db.links, 'L1_1_L2_B', 'L1_0_L3_A1');
    assert.ok(cross, 'il collegamento dal vecchio genitore al nodo tenuto c\'è ancora');
    assert.equal(cross.isCross, true);
    assert.equal(cross._phase4, 'fusione');
    assert.equal(cross.rel, 'include', 'la rel del collegamento di prima');
    const padre = arco(appState.db.links, 'L1_0_L2_A', 'L1_0_L3_A1');
    assert.ok(padre && padre.isCross !== true, 'il genitore vero resta gerarchico');
    assert.equal(appState.db.nodes.find(n => n.id === 'L1_0_L3_A1').level, 3);
});

test('0121 L3, forma A (mappai_mm_phase4_cross_fusioni = \'0\'): nessun cross link di fusione, il resto identico', async () => {
    const { window, appState } = runtime({ mappai_mm_phase4_cross_fusioni: '0' });
    appState.db = mappaPiena();
    const rapporto = await window.executePhase4Consolidation(giroCon(FUSIONE_FRA_RAMI));
    assert.equal(rapporto.merges.applied, 1);
    assert.equal(rapporto.crosslinks.fusioni, 0);
    window.sanitizeMindMapTree();
    assert.equal(arco(appState.db.links, 'L1_1_L2_B', 'L1_0_L3_A1'), undefined, 'il secondo genitore se ne va, come oggi');
    assert.ok(arco(appState.db.links, 'L1_0_L2_A', 'L1_0_L3_A1'));
});

test('0121 L3: se il vecchio genitore è già il genitore del nodo tenuto, niente cross link', async () => {
    const { window, appState } = runtime();
    appState.db = mappaPiena();                   // L1_0_L3_A1 e L1_0_L3_A2 hanno lo stesso genitore L1_0_L2_A
    const rapporto = await window.executePhase4Consolidation(giroCon('===MERGES===\n{"keep":"L1_0_L3_A1","drop":"L1_0_L3_A2","reason":"sinonimi"}\n===CROSSLINKS===\n'));
    assert.equal(rapporto.merges.applied, 1);
    assert.equal(rapporto.crosslinks.fusioni, 0);
    assert.equal(appState.db.links.filter(l => l.isCross).length, 0);
});

// Lotto 4 — accesa di serie: chiave assente → accesa; '0' → spenta; '1' → accesa (chi l'aveva accesa dalla
// console resta acceso); mai su un KG.
test('0121 L4: la Fase 4 è accesa di serie e si spegne con mappai_mm_phase4_enabled = \'0\'', () => {
    assert.equal(runtime({ mappai_mm_phase4_enabled: null }).window.isPhase4Enabled(), true, 'chiave assente → accesa');
    assert.equal(runtime({ mappai_mm_phase4_enabled: '0' }).window.isPhase4Enabled(), false, '\'0\' → spenta');
    assert.equal(runtime({ mappai_mm_phase4_enabled: '1' }).window.isPhase4Enabled(), true, '\'1\' → accesa');
    assert.equal(runtime({ mappai_mm_phase4_enabled: 'false' }).window.isPhase4Enabled(), true, 'solo \'0\' spegne');
    const kg = runtime({ mappai_mm_phase4_enabled: null }); kg.appState.extractionMode = 'kg';
    assert.equal(kg.window.isPhase4Enabled(), false, 'mai su un KG');
});

test('0121 L1: senza opzioni executeMerge disegna, scrive in Annulla e mostra il toast, come prima', () => {
    const { window, appState, spie } = runtime();
    const A = appState.db.nodes.find(n => n.id === 'L1_1_L2_B'), B = appState.db.nodes.find(n => n.id === 'L1_0_L2_B');
    window.executeMerge(A, B);
    assert.equal(spie.render, 1);
    assert.equal(spie.annulla, 1);
    assert.equal(spie.toast, 1);
    assert.equal(appState.db.nodes.length, 6);
    assert.ok(!appState.db.nodes.some(n => n.id === 'L1_1_L2_B'));
});
