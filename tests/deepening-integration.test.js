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

// ── P1-bis: la frase fuori tema NON finisce nel ramo sbagliato ───────────────
// Regressione del bug reale 2A: "Produzione Papiro" riceveva figli sui magli
// idraulici di Fabriano perché condividono lessico di superficie.
test('assegnazione globale: la frase magli va solo al ramo Fabriano, non al papiro', async () => {
    appState.extractionMode = 'mindmap';
    appState.db = {
        nodes: [
            { id: 'ROOT', label: 'Storia della carta', level: 0, desc: 'Storia.' },
            { id: 'L1_0', label: 'Precursori', level: 1, group: 1, desc: 'I materiali usati prima della carta.' },
            { id: 'L1_0_L3_B1', label: 'Produzione Papiro', level: 3, group: 1,
              desc: 'Gli artigiani tagliavano il fusto della pianta in strisce sottili, le incrociavano e le schiacciavano con un martello di legno prima di incollarle in rotoli.' },
            { id: 'L1_3', label: 'Innovazioni Europee', level: 1, group: 4, desc: 'Le innovazioni di Fabriano nella produzione.' },
            { id: 'L1_3_L3_A1', label: 'Pila a Magli Idraulici', level: 3, group: 4,
              desc: 'Gli artigiani di Fabriano utilizzarono l\'energia dei fiumi per azionare grandi martelli di legno, chiamati magli, che sminuzzavano i tessuti rapidamente.' }
        ],
        links: [
            { source: 'ROOT', target: 'L1_0', rel: 'include' },
            { source: 'L1_0', target: 'L1_0_L3_B1', rel: 'include' },
            { source: 'ROOT', target: 'L1_3', rel: 'include' },
            { source: 'L1_3', target: 'L1_3_L3_A1', rel: 'include' }
        ],
        sourcesDict: {}
    };
    const corpus = [
        'Gli artigiani di Fabriano usarono l\'energia dei fiumi per azionare grandi martelli di legno chiamati magli che sminuzzavano gli stracci in una pasta finissima.',
        'Il fusto del papiro veniva raccolto lungo il Nilo in estate e i rotoli misuravano fino a venti metri.'
    ];
    const prompts = [];
    const orig = window.fetchModelAPI;
    AI_RESPONSE = { expansions: [] };
    window.fetchModelAPI = async (payload) => {
        prompts.push(payload.contents[0].parts[0].text);
        return orig(payload);
    };
    await window.executeDeepeningPass(corpus, 'test-key', 5);
    window.fetchModelAPI = orig;

    const papiroPrompt = prompts.find(p => p.includes('L1_0_L3_B1'));
    const magliPrompt = prompts.find(p => p.includes('L1_3_L3_A1'));
    assert.ok(magliPrompt, 'il ramo Fabriano riceve la chiamata');
    assert.match(magliPrompt, /sminuzzavano gli stracci/, 'la frase magli sta nel materiale del ramo giusto');
    // incondizionato (finding review): se il papiro perde il SUO residuo la
    // regressione deve emergere, non passare in silenzio
    assert.ok(papiroPrompt, 'il ramo papiro riceve la chiamata col proprio residuo');
    assert.ok(!papiroPrompt.includes('magli'), 'il papiro NON riceve la frase magli');
    assert.match(papiroPrompt, /Nilo/, 'il papiro riceve solo il suo residuo');
});

// ── P3: gate anti-duplicato globale all'inserimento ─────────────────────────
test('gate globale: un figlio che rifà un nodo di un ALTRO ramo viene scartato', async () => {
    appState.extractionMode = 'mindmap';
    appState.db = {
        nodes: [
            { id: 'ROOT', label: 'Storia della carta', level: 0, desc: 'Storia.' },
            { id: 'L1_3', label: 'Innovazioni', level: 1, group: 4, desc: 'Le innovazioni italiane della carta.' },
            { id: 'L1_3_L3_A3', label: 'Filigrana', level: 3, group: 4,
              desc: 'I cartai di Fabriano inserivano fili metallici nei setacci per lasciare un disegno visibile controluce sul foglio.' },
            { id: 'L1_2', label: 'Diffusione', level: 1, group: 3, desc: 'La diffusione geografica della carta nel mondo.' },
            { id: 'L1_2_L3_X', label: 'Colla Animale', level: 3, group: 3,
              desc: 'Gli Italiani impiegarono una gelatina ricavata dagli scarti delle pelli animali che rese la carta impermeabile all\'inchiostro e resistente ai parassiti.' }
        ],
        links: [
            { source: 'ROOT', target: 'L1_3', rel: 'include' },
            { source: 'L1_3', target: 'L1_3_L3_A3', rel: 'include' },
            { source: 'ROOT', target: 'L1_2', rel: 'include' },
            { source: 'L1_2', target: 'L1_2_L3_X', rel: 'include' }
        ],
        sourcesDict: {}
    };
    // corpus: residuo solo per la Filigrana; la seconda frase è riempitivo
    // fuori tema (nessun competitor la reclama) per superare la soglia dei
    // 200 char sotto cui il pass salta per "fonte troppo corta".
    const corpus = [
        'La filigrana di Fabriano fu introdotta nel Duecento e serviva a certificare il formato e il produttore del foglio, come un marchio brevettato.',
        'Il commercio delle spezie arricchì Venezia durante il Trecento e il Quattrocento grazie alle rotte del Mediterraneo orientale.'
    ];
    // l'AI propone 2 figli: uno legittimo, uno che RIFÀ il nodo Colla Animale di un altro ramo
    AI_RESPONSE = { expansions: [{ parent: 'L1_3_L3_A3', children: [
        { label: 'Origine Duecento', desc: 'La filigrana comparve a Fabriano nel Duecento per certificare il formato e il produttore del foglio, come un marchio.' },
        { label: 'Gelatina di pelli', desc: 'Una gelatina ricavata dagli scarti delle pelli animali rendeva la carta impermeabile all\'inchiostro e resistente ai parassiti.' }
    ] }] };
    await window.executeDeepeningPass(corpus, 'test-key', 5);

    const added = appState.db.nodes.filter(n => /_D\d+$/.test(n.id));
    assert.strictEqual(added.length, 1, `atteso solo il figlio legittimo, avuti: ${added.map(n => n.label)}`);
    assert.strictEqual(added[0].label, 'Origine Duecento');
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
