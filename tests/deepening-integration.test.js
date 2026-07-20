// tests/deepening-integration.test.js — executeDeepeningPass end-to-end (Fase 3.7
// residuo + verdetto). Mocka fetchModelAPI per restituire sotto-concetti di cui
// alcuni parafrasi del padre: verifica che P1 usi la fonte come materiale e che
// P2 scarti le parafrasi prima dell'inserimento.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Il core deve esistere come window.* prima di caricare generation-support.
const DescFidelity = require(path.join(__dirname, '..', 'public', 'js', 'mappai-desc-fidelity.js'));
const DeepenCore = require(path.join(__dirname, '..', 'public', 'js', 'mappai-deepen-core.js'));

// buildSystemInstruction è bareword (definito in app.js a runtime); qui basta.
global.buildSystemInstruction = (s) => s || '';

// Risposta AI iniettabile per-test.
let AI_RESPONSE = { expansions: [] };

global.window = {
    MappAIMath: { cosineSimilarity: () => 0 },
    MappAIJsonSalvage: { salvage: (t) => { try { return JSON.parse(t); } catch (e) { return {}; } } },
    MappAIDescFidelity: DescFidelity,
    MappAIDeepenCore: DeepenCore,
    getMaxOutputTokens: () => 3000,
    showLoadingOverlay: () => { },
    fetchModelAPI: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(AI_RESPONSE) }] } }]
    })
};
global.localStorage = { getItem: () => null, setItem: () => { } };
global.appState = { extractionMode: 'mindmap', rootNodeLabel: 'La carta', db: { nodes: [], links: [], sourcesDict: {} } };

require('../public/js/mappai-generation-support.js');

function seedMap() {
    appState.extractionMode = 'mindmap';
    appState.db = {
        nodes: [
            { id: 'ROOT', label: 'La carta', level: 0, desc: 'Storia della carta.' },
            { id: 'L1_3', label: 'Innovazioni', level: 1, group: 4, desc: 'Le innovazioni italiane nella produzione della carta.' },
            { id: 'L1_3_L3_A3', label: 'Filigrana', level: 3, group: 4,
              desc: 'I cartai di Fabriano inserivano fili metallici nei setacci per lasciare un disegno visibile controluce sul foglio.' }
        ],
        links: [
            { source: 'ROOT', target: 'L1_3', rel: 'include' },
            { source: 'L1_3', target: 'L1_3_L3_A3', rel: 'include' }
        ],
        sourcesDict: {}
    };
}

// Fonte con RESIDUO reale sulla filigrana (info assente dalla desc del padre).
const CORPUS = [
    'La carta arrivò in Europa grazie agli Arabi e fu perfezionata in Italia.',
    'La filigrana di Fabriano fu introdotta nel Duecento e serviva a certificare il formato e il produttore del foglio, come un marchio brevettato.',
    'I cartai di Fabriano inserivano fili metallici nei setacci per lasciare un disegno controluce.',
    'Il commercio delle spezie arricchì Venezia durante il Trecento.'
];

test('residueMode: scarta le parafrasi, tiene il sotto-concetto con dato nuovo', async () => {
    seedMap();
    const before = appState.db.nodes.length;
    // 3 figli proposti sotto la Filigrana: 1 con dato nuovo (Duecento/certificare/
    // marchio), 2 parafrasi della desc del padre.
    AI_RESPONSE = { expansions: [{ parent: 'L1_3_L3_A3', children: [
        { label: 'Origine Duecento', desc: 'La filigrana comparve a Fabriano nel Duecento per certificare il formato e il produttore del foglio, come un marchio.' },
        { label: 'Fili metallici', desc: 'I cartai di Fabriano inserivano fili metallici nei setacci per un disegno visibile controluce.' },
        { label: 'Disegno controluce', desc: 'Il disegno della filigrana era visibile solo guardando il foglio controluce.' }
    ] }] };

    await window.executeDeepeningPass(CORPUS, 'test-key', 5);

    const added = appState.db.nodes.filter(n => /_D\d+$/.test(n.id));
    assert.strictEqual(added.length, 1, `atteso 1 nodo aggiunto, avuti ${added.length}: ${added.map(n => n.label)}`);
    assert.match(added[0].desc, /Duecento|certificare|marchio/);
    assert.strictEqual(appState.db.nodes.length, before + 1);
    // il nuovo nodo è ancorato al padre con rel 'approfondisce'
    const link = appState.db.links.find(l => l.target === added[0].id);
    assert.strictEqual(link.rel, 'approfondisce');
    assert.strictEqual(link.source, 'L1_3_L3_A3');
});

test('residueMode: nessun residuo dalla fonte → zero chiamate, zero nodi', async () => {
    seedMap();
    let called = 0;
    const orig = window.fetchModelAPI;
    window.fetchModelAPI = async () => { called++; return orig(); };
    const before = appState.db.nodes.length;
    // fonte che ripete solo la desc del padre → nessun residuo → skip senza AI
    await window.executeDeepeningPass(
        ['I cartai di Fabriano inserivano fili metallici nei setacci per un disegno visibile controluce sul foglio. '.repeat(6)],
        'test-key', 5);
    assert.strictEqual(appState.db.nodes.length, before, 'nessun nodo aggiunto');
    assert.strictEqual(called, 0, 'nessuna chiamata AI se non c\'è residuo');
    window.fetchModelAPI = orig;
});

test('flag mappai_deepen_residue=false → torna al comportamento legacy (materiale=desc)', async () => {
    seedMap();
    global.localStorage.getItem = (k) => k === 'mappai_deepen_residue' ? 'false' : null;
    // in legacy il gate è la profondità: ramo depth 3 < target 5 → scava; materiale
    // = desc del padre (>=45 parole? la desc è ~20 → sotto soglia → skip foglia).
    // Allarghiamo la desc così supera MIN_MATERIAL_WORDS e la chiamata parte.
    appState.db.nodes.find(n => n.id === 'L1_3_L3_A3').desc =
        'I cartai di Fabriano inserivano sottili fili metallici nei loro setacci di bambù per lasciare un disegno quasi invisibile sul foglio bagnato, visibile solo controluce, usato come marchio di fabbrica per evitare le imitazioni della carta, esattamente come oggi si fa con le banconote moderne di ogni valuta.';
    AI_RESPONSE = { expansions: [{ parent: 'L1_3_L3_A3', children: [
        { label: 'Marchio di fabbrica', desc: 'La filigrana era il marchio di fabbrica dei cartai per evitare le imitazioni.' }
    ] }] };
    const before = appState.db.nodes.length;
    await window.executeDeepeningPass(CORPUS, 'test-key', 5);
    // legacy non applica il verdetto P2: il nodo entra (nessuno scarto).
    assert.strictEqual(appState.db.nodes.length, before + 1);
    global.localStorage.getItem = () => null;
});
