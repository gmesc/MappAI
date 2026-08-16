// tests/cross-links-tronco.test.js — il TRONCO della MindMap (16/8/26)
//
// Difetto vero, trovato da Giacomo sulla mappa «4R › Geografia › Il Clima»: in
// vista ALBERO con «Archi usati: solo gerarchia» il root si staccava e i suoi
// L1 diventavano radici a sé; con «gerarchia + cross» la mappa era giusta.
// Causa misurata sul vault: `markMmCrossLinks` chiede «stesso group» per dire
// che un arco è gerarchia, ma il ROOT ha group 0 e ogni L1 riceve un intero
// suo (è il colore della macro-area) — quindi per il tronco quella condizione
// è falsa PER COSTRUZIONE, e tutti e cinque gli archi ROOT→L1 finivano marcati
// come cross-link. Nel vault reale: root group 0, L1 group 1..5, 5 archi su 5.
const test = require('node:test');
const assert = require('node:assert');

global.window = { MappAIMath: { cosineSimilarity: () => 0 } };
global.localStorage = { getItem: () => null, setItem: () => { } };
global.appState = { extractionMode: 'mindmap', db: { nodes: [], links: [], sourcesDict: {} } };
require('../public/js/mappai-generation-support.js');

/* La forma vera di una MindMap: il root in group 0, un group per macro-area. */
const NODI = [
    { id: 'ROOT', label: 'Il Clima', level: 0, group: 0 },
    { id: 'A', label: 'Definizione', level: 1, group: 1 },
    { id: 'B', label: 'Elementi', level: 1, group: 2 },
    { id: 'A1', label: 'Sotto A', level: 2, group: 1 },
    { id: 'B1', label: 'Sotto B', level: 2, group: 2 },
    { id: 'A2', label: 'Foglia A', level: 3, group: 1 }
];
const crea = () => [
    { source: 'ROOT', target: 'A', rel: 'è definito da' },
    { source: 'ROOT', target: 'B', rel: 'comprende' },
    { source: 'A', target: 'A1', rel: 'include' },
    { source: 'B', target: 'B1', rel: 'include' },
    { source: 'A1', target: 'A2', rel: 'include' },
    { source: 'A1', target: 'B1', rel: 'influenza' },   // fra rami diversi = cross
    { source: 'ROOT', target: 'A2', rel: 'richiama' }   // salto di livello = cross
];

test('markMmCrossLinks: gli archi del tronco (ROOT→L1) sono GERARCHIA', () => {
    const links = crea();
    window.markMmCrossLinks(NODI, links);
    const tronco = links.filter(l => l.source === 'ROOT' && (l.target === 'A' || l.target === 'B'));
    assert.strictEqual(tronco.length, 2);
    tronco.forEach(l => assert.strictEqual(l.isCross, false,
        'ROOT→' + l.target + ' deve essere gerarchia: il root non sta in nessun ramo'));
});

test('markMmCrossLinks: e tutto il resto resta com\'era', () => {
    const links = crea();
    window.markMmCrossLinks(NODI, links);
    const di = (s, t) => links.find(l => l.source === s && l.target === t);
    assert.strictEqual(di('A', 'A1').isCross, false, 'padre→figlio nello stesso ramo: gerarchia');
    assert.strictEqual(di('A1', 'A2').isCross, false, 'anche più in basso');
    assert.strictEqual(di('A1', 'B1').isCross, true, 'fra due rami diversi: cross');
    assert.strictEqual(di('ROOT', 'A2').isCross, true, 'salto di livello dal root: cross, non tronco');
});

test('markMmCrossLinks: senza la deroga il root resterebbe ISOLATO', () => {
    // la prova che descrive il sintomo: con soli archi gerarchici, quanti nodi
    // restano senza genitore? Solo il root, non anche i suoi L1.
    const links = crea();
    window.markMmCrossLinks(NODI, links);
    const gerarchia = links.filter(l => !l.isCross);
    const conGenitore = new Set(gerarchia.map(l => l.target));
    const radici = NODI.filter(n => !conGenitore.has(n.id)).map(n => n.id);
    assert.deepStrictEqual(radici, ['ROOT'], 'una radice sola: il root');
});

test('repairRootHierarchy: rimette a posto le mappe già scritte su disco', () => {
    // com'erano i links.json prodotti prima della correzione
    const links = crea().map(l => Object.assign({}, l, { isCross: true }));
    const n = window.repairRootHierarchy(NODI, links);
    assert.strictEqual(n, 2, 'due archi di tronco corretti');
    assert.strictEqual(links.find(l => l.target === 'A').isCross, false);
    assert.strictEqual(links.find(l => l.target === 'B').isCross, false);
});

test('repairRootHierarchy: STRETTA — non tocca nessun altro isCross', () => {
    const links = crea().map(l => Object.assign({}, l, { isCross: true }));
    window.repairRootHierarchy(NODI, links);
    const di = (s, t) => links.find(l => l.source === s && l.target === t);
    assert.strictEqual(di('A', 'A1').isCross, true, 'un cross messo a mano fra L1 e L2 resta');
    assert.strictEqual(di('A1', 'B1').isCross, true);
    assert.strictEqual(di('ROOT', 'A2').isCross, true, 'e nemmeno il salto di livello dal root');
});

test('repairRootHierarchy: idempotente, e zero su una mappa sana', () => {
    const links = crea();
    window.markMmCrossLinks(NODI, links);
    assert.strictEqual(window.repairRootHierarchy(NODI, links), 0, 'niente da correggere');
    assert.strictEqual(window.repairRootHierarchy(NODI, links), 0, 'e al secondo giro nemmeno');
});
