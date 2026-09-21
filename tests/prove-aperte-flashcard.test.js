'use strict';
/*
 * prove-aperte-flashcard.test.js — la prova nelle FLASHCARD e nelle DOMANDE
 * APERTE, osservata e non imposta (21/9/26, packet 0008 del piano Evidence).
 *
 * Che cosa si prova qui, in una riga: i due generi chiedono l'identificatore
 * della prova e il loro conto finisce nella traccia del passo 6, SENZA che
 * nulla venga scartato — il foglio esce con tutte le carte e tutte le domande
 * che il modello ha mandato, esattamente come prima di oggi.
 *
 * Tre banchi, nessun Electron e nessuna chiamata AI:
 *  1) `window.quizEvidenceBlock` reso parametrico: le chiamate di ieri — senza
 *     argomenti, e col solo materiale — devono dire lo STESSO testo, carattere
 *     per carattere. È la condizione di stop del packet: quel blocco è copiato
 *     byte per byte nell'app dello studente ed è tarato sul quiz a scelta
 *     multipla. Le quattro stringhe sono trascritte qui sotto.
 *  2) I due generatori VERI di `mappai-material-pipeline.js` (aperti al banco
 *     come `_branchMaterial`), dentro una sandbox `vm` con un `window` finto —
 *     lo stampo di tests/study-session-evidence.test.js. Il materiale non è
 *     scritto a mano: lo costruiscono i core che lo costruiscono nell'app, così
 *     gli identificatori sono quelli veri.
 *  3) L'editor dei documenti: `prove` è un campo di SERVIZIO e deve sopravvivere
 *     al giro apri → correggi → salva.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));
const EC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));
const LS = require(path.join(__dirname, '..', 'public', 'js', 'mappai-local-search-core.js'));
const DE = require(path.join(__dirname, '..', 'public', 'js', 'mappai-docedit-core.js'));
const salvage = require(path.join(__dirname, '..', 'public', 'js', 'mappai-json-salvage.js')).salvage;

const JS = (nome) => path.join(__dirname, '..', 'public', 'js', nome);

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
const MATERIALE_SENZA_ID = 'AREA: Elettricita\nCorto circuito: la batteria si scalda ' +
    'quando la resistenza e troppo bassa.\n' + FRASI_FONTE[0];

/* Le QUATTRO stringhe di ieri, trascritte. Se una cambia di un carattere, qui
   si accende una luce: vuol dire che è cambiata anche per il quiz a scelta
   multipla e per l'app dello studente, che chiamano il blocco senza argomenti. */
const PROVA_ID_IT = 'LA PROVA (obbligatoria per ogni domanda): ogni riga del MATERIALE qui sotto comincia con il suo identificatore fra doppie parentesi quadre, nella forma [[ev-…]]. Nel campo "evidenzaId" scrivi UNO degli identificatori elencati lì: quello della riga che rende vera la risposta esatta. Copialo esatto com\'è, senza le parentesi quadre. Non inventare mai un identificatore, non scriverne uno che non sia nell\'elenco, e non copiare la frase al suo posto. Se nessuna riga del materiale sostiene una risposta, NON scrivere quella domanda: scrivine una in meno.';
const PROVA_ID_EN = 'PROOF (mandatory for every question): every line of the MATERIAL below starts with its own identifier between double square brackets, in the form [[ev-…]]. In the "evidenzaId" field write ONE of the identifiers listed there: the one of the line that makes the correct answer true. Copy it exactly as it is, without the square brackets. Never invent an identifier, never write one that is not in the list, and do not copy the sentence instead. If no line of the material supports an answer, do NOT write that question: write one fewer.';
const PROVA_FRASE_IT = 'LA PROVA (obbligatoria per ogni domanda): nel campo "evidenza" copia la frase del MATERIALE qui sotto che rende vera la risposta esatta. Copiala dal materiale, non riscriverla e non riassumerla. Se nessuna frase del materiale sostiene una risposta, NON scrivere quella domanda: scrivine una in meno.';
const PROVA_FRASE_EN = 'PROOF (mandatory for every question): in the "evidenza" field copy the sentence from the MATERIAL below that makes the correct answer true. Copy it from the material, do not rewrite it and do not summarise it. If no sentence in the material supports an answer, do NOT write that question: write one fewer.';

// ── il banco: study-session + misura + material-pipeline, tutti veri ────────
/* `win._risposta` è ciò che il modello «manda»; `chiamate` raccoglie i payload,
   cioè il prompt e lo schema che sono partiti davvero. */
function banco(lingua) {
    const chiamate = [], detto = [];
    const win = {
        getPromptLanguage: () => lingua || 'it',
        getMapLanguage: () => lingua || 'it',
        getSystemKey: () => 'chiave-finta',
        t: (k, f) => f,
        cleanLabel: (s) => String(s || '').trim(),
        showToast() {},
        showLoadingOverlay() {},
        fillPromptTemplate: (chiave) => 'CONSEGNA (' + chiave + '): scrivi il materiale di studio.',
        injectClassTuning: p => p,
        getMaxOutputTokens: n => n,
        QUIZ_TEMPERATURE: 0.4,
        salvageTruncatedJSON: salvage,
        MappAIPipelineCore: PC,
        MappAIEvidence: { acceso: () => true, ultimeTracce: () => [] },
        _risposta: [],
        fetchModelAPI: async (payload) => {
            chiamate.push(payload);
            return { candidates: [{ content: { parts: [{ text: JSON.stringify(win._risposta) }] } }] };
        }
    };
    const sandbox = {
        window: win,
        appState: { rootNodeLabel: 'Elettricita', aiProvider: 'infomaniak', extractionMode: 'mindmap', db: { nodes: [], links: [], studySets: [] }, sources: [] },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        console: { log() {}, info: (...a) => detto.push(a.join(' ')), warn: (...a) => detto.push(a.join(' ')), error() {} },
        setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    };
    vm.runInNewContext(fs.readFileSync(JS('mappai-misura-evidenze.js'), 'utf8'), sandbox);
    vm.runInNewContext(fs.readFileSync(JS('mappai-study-session.js'), 'utf8'), sandbox);
    vm.runInNewContext(fs.readFileSync(JS('mappai-material-pipeline.js'), 'utf8'), sandbox);
    return { win, chiamate, detto, P: win.MappAIPipeline, M: win.MappAIMisuraEvidenze };
}
const schemaDi = (h) => h.chiamate[0].generationConfig.responseSchema;
const promptDi = (h) => h.chiamate[0].contents[0].parts[0].text;

// ══ 1. il blocco della prova: parametrico, ma identico per chi lo chiamava ══

test('quizEvidenceBlock: le chiamate di ieri dicono lo stesso testo, carattere per carattere', () => {
    const it = banco('it').win, en = banco('en').win;
    const conId = materialeConEvidenze();
    // col materiale che elenca gli identificatori
    assert.strictEqual(it.quizEvidenceBlock(conId), PROVA_ID_IT);
    assert.strictEqual(en.quizEvidenceBlock(conId), PROVA_ID_EN);
    // senza identificatori: la richiesta della frase, come sempre
    assert.strictEqual(it.quizEvidenceBlock(MATERIALE_SENZA_ID), PROVA_FRASE_IT);
    assert.strictEqual(en.quizEvidenceBlock(MATERIALE_SENZA_ID), PROVA_FRASE_EN);
    // la firma resta compatibile: il reader lo chiama senza argomenti
    assert.strictEqual(it.quizEvidenceBlock(), PROVA_FRASE_IT);
    assert.strictEqual(en.quizEvidenceBlock(), PROVA_FRASE_EN);
    assert.strictEqual(it.quizEvidenceBlock(''), PROVA_FRASE_IT);
    // e un secondo argomento vuoto o storto non cambia niente
    assert.strictEqual(it.quizEvidenceBlock(conId, null), PROVA_ID_IT);
    assert.strictEqual(it.quizEvidenceBlock(conId, {}), PROVA_ID_IT);
    assert.strictEqual(it.quizEvidenceBlock(conId, 'carta'), PROVA_ID_IT);
});

test('quizEvidenceBlock: per una flashcard l unità è la CARTA, e il resto non si muove', () => {
    const conId = materialeConEvidenze();
    const b = banco('it').win.quizEvidenceBlock(conId, { campo: 'evidenzaId', unita: 'carta', unitaEn: 'card' });
    assert.ok(/^LA PROVA \(obbligatoria per ogni carta\)/.test(b), 'l unità è la carta');
    assert.ok(/NON scrivere quella carta: scrivine una in meno\.$/.test(b), 'anche in coda');
    assert.ok(/evidenzaId/.test(b) && /scrivi UNO degli identificatori/.test(b), 'un identificatore solo');
    // il testo è quello del quiz con la sola unità cambiata: nessuna seconda fonte
    assert.strictEqual(b, PROVA_ID_IT.split('domanda').join('carta'));
    const en = banco('en').win.quizEvidenceBlock(conId, { campo: 'evidenzaId', unita: 'carta', unitaEn: 'card' });
    assert.strictEqual(en, PROVA_ID_EN.split('question').join('card'));
});

test('quizEvidenceBlock: per le domande aperte il campo è prove e gli identificatori sono due', () => {
    const conId = materialeConEvidenze();
    const b = banco('it').win.quizEvidenceBlock(conId, { campo: 'prove', quanti: 2 });
    assert.ok(/Nel campo "prove"/.test(b), 'nomina il campo dell array');
    assert.ok(/fino a DUE degli identificatori/.test(b), 'e dice quanti');
    assert.ok(/Copiali esatti come sono, senza le parentesi quadre\./.test(b));
    assert.ok(/obbligatoria per ogni domanda/.test(b), 'l unità resta la domanda');
    assert.strictEqual(b.indexOf('evidenzaId'), -1, 'il campo del quiz non compare');
    const en = banco('en').win.quizEvidenceBlock(conId, { campo: 'prove', quanti: 2 });
    assert.ok(/In the "prove" field write up to TWO of the identifiers/.test(en));
    // `quanti` fuori scala non inventa un terzo caso: 1 oppure 2
    const tre = banco('it').win.quizEvidenceBlock(conId, { campo: 'prove', quanti: 7 });
    assert.strictEqual(tre, b);
});

// ══ 2. le FLASHCARD ════════════════════════════════════════════════════════

test('flashcard: col materiale che porta gli identificatori, lo schema chiede evidenzaId', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [
        { front: 'Quando un circuito e chiuso?', back: 'Quando la corrente fa tutto il giro.', evidenzaId: ids[0] },
        { front: 'Che cos e un corto circuito?', back: 'Un percorso a resistenza quasi nulla.' }
    ];
    const carte = await h.P._genFlashcards(materiale, 'Corto circuito', 2, 'chiave-finta', { angolo: 'definizioni' });
    const props = schemaDi(h).items.properties;
    assert.ok(props.evidenzaId, 'il campo della prova c è');
    assert.deepStrictEqual(Array.from(schemaDi(h).items.required), ['front', 'back', 'evidenzaId']);
    assert.strictEqual(Object.keys(props).length, 3, 'nessun campo di prosa libera in più');
    assert.ok(promptDi(h).indexOf('LA PROVA (obbligatoria per ogni carta)') > 0, 'la richiesta arriva nel prompt');
    assert.ok(promptDi(h).indexOf(materiale) > 0, 'col materiale in coda');
    // ⚠️ IL CUORE: non si scarta niente
    assert.strictEqual(carte.length, 2, 'la carta senza prova resta nel foglio');
    assert.deepStrictEqual(carte.map(c => c.front), h.win._risposta.map(c => c.front));
});

test('flashcard: due carte, una con id valido → ricevute 2 · con id 1 · scartate 0', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [
        { front: 'Con la prova', back: 'x', evidenzaId: ids[0] },
        { front: 'Senza la prova', back: 'y' }
    ];
    const carte = await h.P._genFlashcards(materiale, 'Corto circuito', 2, 'chiave-finta', {});
    assert.strictEqual(carte.length, 2);
    const giro = h.M.giro();
    assert.strictEqual(giro.fogli.length, 1, 'una voce nella traccia');
    const f = giro.fogli[0];
    assert.strictEqual(f.area, 'Corto circuito');
    assert.strictEqual(f.tipo, 'Flashcard');
    assert.strictEqual(f.conto.ricevute, 2);
    assert.strictEqual(f.conto.tenute, 2, 'tenute = ricevute: la porta è aperta');
    assert.strictEqual(f.conto.conId, 1);
    assert.strictEqual(f.conto.scartate, 0, 'zero scartate è il DISEGNO, non un punteggio pieno');
    assert.strictEqual(f.conto.prove.assente, 1);
    assert.deepStrictEqual(Object.keys(f.conto.perMotivo), []);
    // e il testo della carta finisce nella traccia leggibile
    assert.deepStrictEqual(f.tenute.map(t => t.q), ['Con la prova', 'Senza la prova']);
    assert.strictEqual(giro.totali.conId, 1);
});

test('flashcard: senza identificatori nel materiale non cambia niente', async () => {
    const h = banco('it');
    h.win._risposta = [{ front: 'a', back: 'b' }];
    const carte = await h.P._genFlashcards(MATERIALE_SENZA_ID, 'Corto circuito', 1, 'chiave-finta', {});
    const props = schemaDi(h).items.properties;
    assert.deepStrictEqual(Object.keys(props), ['front', 'back'], 'lo schema è quello di ieri');
    assert.deepStrictEqual(Array.from(schemaDi(h).items.required), ['front', 'back']);
    assert.strictEqual(promptDi(h).indexOf('LA PROVA'), -1, 'nessuna richiesta di prova');
    assert.strictEqual(carte.length, 1);
    // la traccia c'è lo stesso — un giro non tracciato è un giro da rifare
    assert.strictEqual(h.M.giro().fogli[0].conto.prove.assente, 1);
});

// ══ 3. le DOMANDE APERTE ═══════════════════════════════════════════════════

const apre = (h, materiale, quante, opts) =>
    h.P._genOpenQuestions(materiale, 'Corto circuito', quante || 2, 'chiave-finta',
        Object.assign({ areaB: 'Resistenza', angolo: 'causa' }, opts || {}));

test('aperte: lo schema porta prove, array di al massimo due identificatori', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [{ domanda: 'Spiega perche la batteria si scalda.', traccia: 'Nomina la resistenza. Collega alla corrente.', righe: 5, aree: ['Corto circuito'], livello: 'ponte', prove: [ids[0], ids[1]] }];
    const out = await apre(h, materiale, 1);
    const props = schemaDi(h).items.properties;
    assert.ok(props.prove, 'il campo c è');
    assert.strictEqual(props.prove.type, 'ARRAY');
    assert.strictEqual(props.prove.maxItems, 2, 'anche gli array annidati vogliono il tetto');
    assert.strictEqual(props.prove.items.type, 'STRING');
    assert.ok(Array.from(schemaDi(h).items.required).indexOf('prove') >= 0, 'obbligatorio: un campo facoltativo non lo scrive');
    assert.ok(promptDi(h).indexOf('Nel campo "prove"') > 0, 'la richiesta arriva nel prompt');
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].prove, [ids[0], ids[1]], 'la prova viaggia con la domanda');
});

test('aperte: un id buono e uno inventato bastano, e nessuna domanda viene tolta', async () => {
    const h = banco('it');
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    const inventato = 'ev-0123456789abcdef-99';
    assert.strictEqual(materiale.indexOf(inventato), -1);
    h.win._risposta = [
        { domanda: 'Provata a meta.', traccia: 'Nomina X.', righe: 5, aree: [], livello: 'base', prove: ['[[' + ids[0] + ']]', inventato] },
        { domanda: 'Senza nessuna prova.', traccia: 'Nomina Y.', righe: 3, aree: [], livello: 'base', prove: [] },
        { domanda: 'Solo inventata.', traccia: 'Nomina Z.', righe: 3, aree: [], livello: 'base', prove: [inventato] }
    ];
    const out = await apre(h, materiale, 3);
    assert.strictEqual(out.length, 3, 'il foglio esce con tutte e tre: non si scarta niente');
    assert.deepStrictEqual(out[0].prove, [ids[0], inventato], 'le parentesi sono forma, non dato');
    assert.ok(!('prove' in out[1]), 'niente chiave vuota: sul disco non sarebbe un dato');
    // il CONTO: una sola domanda porta una prova che l'elenco riconosce
    const v = PC.verificaEvidenza(out, materiale);
    assert.strictEqual(v.items.length, 1, 'chi conta vede una domanda provata');
    assert.strictEqual(v.items[0].question, 'Provata a meta.');
    assert.strictEqual(v.scartati.length, 2, '…e due no — ma il foglio le ha tutte lo stesso');
    const f = h.M.giro().fogli[0];
    assert.strictEqual(f.tipo, 'Domande aperte');
    assert.strictEqual(f.conto.ricevute, 3);
    assert.strictEqual(f.conto.tenute, 3);
    assert.strictEqual(f.conto.conId, 1);
    assert.strictEqual(f.conto.scartate, 0);
});

test('aperte: senza identificatori nel materiale il foglio esce come ieri', async () => {
    const h = banco('it');
    h.win._risposta = [{ domanda: 'Che cos e un corto circuito?', traccia: 'Nomina la resistenza.', righe: 3, aree: [], livello: 'base' }];
    const out = await apre(h, MATERIALE_SENZA_ID, 1);
    assert.strictEqual(schemaDi(h).items.properties.prove, undefined, 'niente campo da riempire');
    assert.strictEqual(Array.from(schemaDi(h).items.required).indexOf('prove'), -1);
    assert.strictEqual(promptDi(h).indexOf('LA PROVA'), -1);
    assert.strictEqual(out.length, 1);
    assert.ok(!('prove' in out[0]), 'la forma di ieri, chiave per chiave');
    assert.deepStrictEqual(Object.keys(out[0]), ['question', 'guide', 'criteri', 'lines', 'areas', 'livello', 'angle']);
});

// ══ 4. il CORE: l array prove si legge come un id solo ══════════════════════

test('idiDiProva: una fonte sola per il campo singolo e per l array, col tetto a due', () => {
    const id = (n) => 'ev-626f5dbd6c6c4bff-' + n;
    assert.deepStrictEqual(PC.idiDiProva({ evidenzaId: id(1) }), [id(1)], 'il quiz non cambia');
    assert.deepStrictEqual(PC.idiDiProva({ evidenceId: '[[' + id(2) + ']]' }), [id(2)], 'parentesi e nome inglese');
    assert.deepStrictEqual(PC.idiDiProva({ prove: [id(3), id(4), id(5)] }), [id(3), id(4)], 'mai più di due');
    assert.deepStrictEqual(PC.idiDiProva({ prove: [id(6), id(6)] }), [id(6)], 'niente doppioni');
    assert.deepStrictEqual(PC.idiDiProva({ prove: [] }), []);
    assert.deepStrictEqual(PC.idiDiProva({ prove: '  ' }), []);
    [null, undefined, 42, 'ev-1', []].forEach(x => assert.deepStrictEqual(PC.idiDiProva(x), [], JSON.stringify(x)));
});

// ══ 5. l EDITOR: la prova sopravvive al giro apri → correggi → salva ════════

test('prove è un campo di SERVIZIO: un giro nell editor non se lo porta via', () => {
    const ID = ['ev-aa1fdbc9b96af5b7-211', 'ev-aa1fdbc9b96af5b7-212'];
    const item = { q: 'Perche la batteria si scalda?', options: ['Resistenza bassa.', 'Filo lungo.'], correct: 1, explanation: '', prove: ID.slice(), ramo: 'Corto circuito' };
    const n = DE.normItem(item);
    assert.deepStrictEqual(n.prove, ID, 'sopravvive all apertura');
    assert.notStrictEqual(n.prove, item.prove, 'ed è una copia PROPRIA: l editor non condivide memoria col set');
    const set = { id: 'set_1', title: 'Elettricità — Scelta Multipla', mode: 'quiz', type: 'Scelta Multipla', items: [item] };
    const doc = DE.docFromSet(set);
    doc.items = DE.setField(doc.items, 0, 'question', 'Domanda riscritta dal docente?');
    const out = DE.applyToSet(set, doc);
    assert.strictEqual(out.items[0].q, 'Domanda riscritta dal docente?', 'la correzione c è');
    assert.deepStrictEqual(out.items[0].prove, ID, 'e la prova pure');
    // retrocompatibilità: un set di ieri non ha `prove` e non se la inventa
    const vecchio = DE.normItem({ q: 'x', options: ['a', 'b'], correct: 1 });
    assert.ok(!('prove' in vecchio), 'niente chiave a undefined sul disco');
});
