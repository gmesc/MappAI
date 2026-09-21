'use strict';
/*
 * study-session-evidence.test.js — la richiesta della prova e la forma dello
 * schema del quiz (passo 4 del piano Evidence, 21/9/26).
 *
 * Che cosa si prova qui: che a decidere è il MATERIALE e non un interruttore.
 * Se il materiale porta gli identificatori delle evidenze, il blocco della
 * prova chiede `evidenzaId` e lo schema ha quel campo AL POSTO di `evidenza`;
 * se non li porta — ogni altra superficie di studio, e l'app dello studente che
 * copia questo file e non conosce `MappAIEvidence` — resta tutto com'era, la
 * stringa parola per parola e lo schema di ieri. Nelle due lingue.
 *
 * Il materiale non è scritto a mano: lo costruiscono i due core che lo
 * costruiscono nell'app (`mappai-evidence-core` sui record di
 * `mappai-local-search-core`), così gli identificatori sono quelli veri.
 * `mappai-study-session.js` è UMD da browser: gira in una sandbox `vm` con un
 * `window` finto, come i banchi di tests/standalone-review-guards.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));
const EC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));
const LS = require(path.join(__dirname, '..', 'public', 'js', 'mappai-local-search-core.js'));
const salvage = require(path.join(__dirname, '..', 'public', 'js', 'mappai-json-salvage.js')).salvage;

// ── il materiale vero, con e senza evidenze ────────────────────────────────
const FRASI_FONTE = [
    'Un circuito e chiuso quando la corrente puo percorrere tutto il tragitto dal ' +
    'generatore al ricevitore e tornare indietro senza interruzioni.',
    'Puo anche capitare che un circuito sia perfettamente chiuso e collegato a dovere, ' +
    'e tuttavia la batteria cominci a riscaldarsi in modo anomalo.',
    'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.'
];

function materialeConEvidenze() {
    const stato = {
        sources: [{ id: 'src-1', title: 'Elettricita.pdf', pages: [{ n: 4, text: FRASI_FONTE.join(' ') }] }],
        db: { nodes: [], links: [] }
    };
    const pacchetto = EC.costruisciPacchetto({
        records: LS.snapshot(stato).records, query: 'circuito chiuso corrente batteria'
    });
    return EC.materialeRamo({
        area: 'Elettricita', nodi: [{ label: 'Corto circuito' }], pacchetto: pacchetto
    }).materiale;
}
// Il materiale «di ieri»: le desc dei nodi, senza un identificatore in vista.
const MATERIALE_SENZA_ID = 'AREA: Elettricita\nCorto circuito: la batteria si scalda ' +
    'quando la resistenza e troppo bassa.\n' + FRASI_FONTE[0];

// Le due stringhe di oggi, trascritte: se cambiano, un test si accorge che il
// comportamento delle altre superfici (e del reader) è cambiato con loro.
const PROVA_OGGI_IT = 'LA PROVA (obbligatoria per ogni domanda): nel campo "evidenza" copia la frase del MATERIALE qui sotto che rende vera la risposta esatta. Copiala dal materiale, non riscriverla e non riassumerla. Se nessuna frase del materiale sostiene una risposta, NON scrivere quella domanda: scrivine una in meno.';
const PROVA_OGGI_EN = 'PROOF (mandatory for every question): in the "evidenza" field copy the sentence from the MATERIAL below that makes the correct answer true. Copy it from the material, do not rewrite it and do not summarise it. If no sentence in the material supports an answer, do NOT write that question: write one fewer.';

// ── il banco ───────────────────────────────────────────────────────────────
function banco(lingua) {
    const chiamate = [], avvisi = [];
    const win = {
        getPromptLanguage: () => lingua || 'it',
        getSystemKey: () => 'chiave-finta',
        fillPromptTemplate: () => 'CONSEGNA: scrivi le domande.',
        injectClassTuning: p => p,
        getMaxOutputTokens: n => n,
        QUIZ_TEMPERATURE: 0.4,
        salvageTruncatedJSON: salvage,
        MappAIPipelineCore: PC,
        _risposta: [],
        fetchModelAPI: async (payload) => {
            chiamate.push(payload);
            return { candidates: [{ content: { parts: [{ text: JSON.stringify(win._risposta) }] } }] };
        }
    };
    const sandbox = {
        window: win,
        appState: { db: { nodes: [], links: [], studySets: [] } },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        console: { log() {}, warn: (...a) => avvisi.push(a.join(' ')), error() {} },
        setTimeout, clearTimeout
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-study-session.js'), 'utf8'), sandbox);
    return { win, chiamate, avvisi };
}

const generaQuiz = (h, material, extra) => h.win.generateDynamicQuiz(Object.assign({
    nodeLabel: 'Corto circuito', material: material, quizType: 'Scelta Multipla',
    quantity: 2, apiKey: 'chiave-finta', nonce: 'FISSO'
}, extra || {}));

// ── 1. il blocco della prova ───────────────────────────────────────────────

test('la prova: col materiale che porta gli identificatori si chiede evidenzaId (IT)', () => {
    const b = banco('it').win.quizEvidenceBlock(materialeConEvidenze());
    assert.ok(/evidenzaId/.test(b), 'nomina il campo dell identificatore');
    assert.ok(b.indexOf('[[') >= 0 && b.indexOf(']]') >= 0, 'dice le doppie parentesi quadre');
    assert.ok(/[Nn]on inventare/.test(b), 'vieta di inventare un identificatore');
    assert.ok(/non copiare la frase/.test(b), 'vieta di copiare la frase al suo posto');
    assert.strictEqual(b.indexOf('nel campo "evidenza" copia'), -1, 'non è più la richiesta della frase');
});

test('la prova: stessa richiesta in inglese, con lo stesso campo', () => {
    const b = banco('en').win.quizEvidenceBlock(materialeConEvidenze());
    assert.ok(/evidenzaId/.test(b), 'il NOME del campo non si traduce: lo legge il filtro');
    assert.ok(b.indexOf('[[') >= 0 && b.indexOf(']]') >= 0);
    assert.ok(/never invent|do not invent/i.test(b));
    assert.strictEqual(b.indexOf('in the "evidenza" field copy'), -1);
});

test('la prova: senza identificatori resta la stringa di oggi, parola per parola', () => {
    const it = banco('it'), en = banco('en');
    assert.strictEqual(it.win.quizEvidenceBlock(MATERIALE_SENZA_ID), PROVA_OGGI_IT);
    assert.strictEqual(en.win.quizEvidenceBlock(MATERIALE_SENZA_ID), PROVA_OGGI_EN);
    // la firma resta compatibile: il reader la chiama senza argomenti
    assert.strictEqual(it.win.quizEvidenceBlock(), PROVA_OGGI_IT);
    assert.strictEqual(en.win.quizEvidenceBlock(), PROVA_OGGI_EN);
    assert.strictEqual(it.win.quizEvidenceBlock(''), PROVA_OGGI_IT);
});

// ── 2. lo schema del quiz ──────────────────────────────────────────────────

test('lo schema: con le evidenze il campo della prova è evidenzaId, e SOSTITUISCE evidenza', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [{ q: 'Quando un circuito e chiuso?', options: ['A', 'B', 'C'], correct: 'A', explanation: 'perche', evidenzaId: ids[0] }];
    const out = await generaQuiz(h, materiale);
    const schema = h.chiamate[0].generationConfig.responseSchema;
    const props = schema.items.properties;
    assert.ok(props.evidenzaId, 'il campo dell identificatore c è');
    assert.strictEqual(props.evidenza, undefined, 'e quello della frase non c è più: si sostituisce, non si aggiunge');
    // Array.from: l'array nasce nella sandbox, un altro realm — stessa forma, altro prototipo
    assert.deepStrictEqual(Array.from(schema.items.required), ['q', 'correct', 'explanation', 'evidenzaId']);
    assert.strictEqual(Object.keys(props).length, 5, 'nessun campo di prosa libera in più');
    // la richiesta della prova arriva davvero nel prompt, col materiale in coda
    const testo = h.chiamate[0].contents[0].parts[0].text;
    assert.ok(/evidenzaId/.test(testo) && testo.indexOf(materiale) > 0);
    assert.strictEqual(out.length, 1, 'la domanda con un identificatore dell elenco passa il filtro');
});

test('lo schema: senza identificatori nel materiale resta quello di ieri', async () => {
    const h = banco('it');
    h.win._risposta = [{ q: 'Quando un circuito e chiuso?', options: ['A', 'B', 'C'], correct: 'A', explanation: 'perche', evidenza: FRASI_FONTE[0] }];
    const out = await generaQuiz(h, MATERIALE_SENZA_ID);
    const schema = h.chiamate[0].generationConfig.responseSchema;
    assert.ok(schema.items.properties.evidenza, 'il campo della frase è ancora lì');
    assert.strictEqual(schema.items.properties.evidenzaId, undefined);
    assert.deepStrictEqual(Array.from(schema.items.required), ['q', 'correct', 'explanation', 'evidenza']);
    assert.strictEqual(out.length, 1, 'la frase copiata dal materiale regge come ieri');
});

// ── 3. il filtro, dal prompt al foglio ─────────────────────────────────────

test('la porta rovesciata: id inventato e frase copiata restano fuori, e la console dice il motivo', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [
        { q: 'Buona', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: ids[0] },
        { q: 'Inventata', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: 'ev-0123456789abcdef-99' },
        { q: 'Senza prova', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x' },
        { q: 'Con la frase', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenza: FRASI_FONTE[0] }
    ];
    const out = await generaQuiz(h, materiale, { quantity: 4 });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].q, 'Buona');
    const detto = h.avvisi.join('\n');
    ['id-sconosciuto', 'id-assente', 'id-frase-copiata'].forEach(m => assert.ok(detto.indexOf(m) >= 0, 'la console dice ' + m));
});
