'use strict';
/*
 * opzioni-col-punto.test.js — le risposte della scelta multipla finiscono
 * sempre col punto (packet 0080, ADR 0012 revisione 5, punto E).
 *
 * Due piani, come il packet:
 *   1. il core — `chiudiOpzioni(items)` in mappai-pipeline-core.js: che cosa
 *      conta come fine frase (bivio B2 a), le due forme degli item, la
 *      risposta esatta che resta la stessa, l'input che non si tocca;
 *   2. i tre punti dell'app dove nascono le scelte multiple, coi moduli VERI in
 *      una sandbox `vm` (come study-session-evidence e standalone-review-guards):
 *      `generateDynamicQuiz`, il quiz per nodo e la sua rigenerazione. Con
 *      l'interruttore `mappai_mc_punto` acceso (assente = acceso, B3) e spento
 *      ('0' = i quiz e il prompt di oggi, invariante 1). Vero/Falso e domande
 *      aperte non passano dal passo (B4).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));
const salvage = require(path.join(__dirname, '..', 'public', 'js', 'mappai-json-salvage.js')).salvage;

const copia = v => JSON.parse(JSON.stringify(v));
const FINE = /[.?!…]["”»)]*$/;
// dove cade la risposta esatta di UN item, con le regole di chi legge (_indiceCorretta)
const dove = it => Object.keys(PC.posizioniCorrette([it]).pos)[0];

// ── 1. il core ─────────────────────────────────────────────────────────────

test('chiudiOpzioni esiste ed è esportata dal core', () => {
    assert.equal(typeof PC.chiudiOpzioni, 'function');
});

// La chiusura di una sola opzione, letta attraverso la funzione pubblica: la
// risposta esatta sta per indice sull'opzione accanto, quindi l'item è sempre
// riconosciuto e l'unica cosa che cambia è il testo misurato.
const chiusa = s => PC.chiudiOpzioni([{ q: 'D?', options: [s, 'Altro.'], correctIndex: 1 }])[0].options[0];

test('B2: un\'opzione senza segno finale riceve il punto', () => {
    assert.equal(chiusa('Roma'), 'Roma.');
    assert.equal(chiusa('Nel 1848'), 'Nel 1848.');
    assert.equal(chiusa('Disse «basta»'), 'Disse «basta».', 'le virgolette da sole non chiudono la frase');
});

test('B2: . ? ! … restano come sono, anche seguiti da virgolette o parentesi di chiusura', () => {
    for (const s of ['Roma.', 'Davvero?', 'Basta!', 'E poi…', 'E poi...',
        'Disse «basta.»', 'Disse «basta!»', 'Disse "no?"', 'Disse “sì.”', '(vedi sopra.)']) {
        assert.equal(chiusa(s), s, s);
    }
});

test('B2: , ; : finali diventano il punto', () => {
    assert.equal(chiusa('Roma,'), 'Roma.');
    assert.equal(chiusa('Roma;'), 'Roma.');
    assert.equal(chiusa('Roma:'), 'Roma.');
});

test('gli spazi in fondo non contano; un\'opzione vuota resta vuota', () => {
    assert.equal(chiusa('Roma  '), 'Roma.');
    assert.equal(chiusa(''), '');
    assert.equal(chiusa('   '), '   ');
});

test('si chiudono solo le opzioni scritte come testo', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'Quando?', options: [1848, 'Mai', 'Ieri'], correct: 'Mai' }]);
    assert.deepEqual(out.options, [1848, 'Mai.', 'Ieri.']);
    assert.equal(out.correct, 'Mai.');
});

test('forma options[]: la corretta e i distrattori si chiudono, la risposta per testo segue il testo nuovo', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'Capitale?', options: ['Roma', 'Milano', 'Torino?'], correct: 'Milano', explanation: 'x' }]);
    assert.deepEqual(out.options, ['Roma.', 'Milano.', 'Torino?']);
    assert.equal(out.correct, 'Milano.');
    assert.equal(out.explanation, 'x', 'gli altri campi restano');
});

test('forma a1/a2/a3 (quiz per nodo): le tre opzioni si chiudono, l\'indice 1-based resta', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'Capitale?', a1: 'Roma', a2: 'Milano?', a3: 'Torino,', correct: 2 }]);
    assert.equal(out.a1, 'Roma.');
    assert.equal(out.a2, 'Milano?');
    assert.equal(out.a3, 'Torino.');
    assert.equal(out.correct, 2);
    assert.equal(out.q, 'Capitale?');
});

test('forma a1/a2/a3 con la risposta scritta per testo: segue il testo nuovo', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'Capitale?', a1: 'Roma', a2: 'Milano', a3: 'Torino', correct: 'Milano' }]);
    assert.equal(out.correct, 'Milano.');
    assert.equal(out.a2, 'Milano.');
});

test('la risposta per testo diventa il testo NUOVO dell\'opzione (anche se il modello l\'ha scritta in minuscolo)', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'Capitale?', options: ['Roma', 'Milano', 'Torino'], correct: 'milano' }]);
    assert.equal(out.correct, 'Milano.');
});

test('risposta per indice, per numero, per lettera: resta com\'è', () => {
    const opts = ['Roma', 'Milano', 'Torino'];
    const a = PC.chiudiOpzioni([{ q: 'D?', options: opts.slice(), correct: 'Milano', correctIndex: 1 }])[0];
    assert.equal(a.correctIndex, 1);
    assert.equal(a.correct, 'Milano.', 'il testo segue, l\'indice resta');
    assert.equal(PC.chiudiOpzioni([{ q: 'D?', options: opts.slice(), correct: 2 }])[0].correct, 2);
    assert.equal(PC.chiudiOpzioni([{ q: 'D?', options: opts.slice(), correct: '2' }])[0].correct, '2');
    assert.equal(PC.chiudiOpzioni([{ q: 'D?', options: opts.slice(), correct: 'B' }])[0].correct, 'B');
    assert.equal(PC.chiudiOpzioni([{ q: 'D?', options: opts.slice(), correct: 'B' }])[0].options[2], 'Torino.');
});

test('la risposta esatta cade sulla stessa opzione prima e dopo il passo', () => {
    const items = [
        { q: '1', options: ['Roma', 'Milano', 'Torino'], correct: 'Torino' },
        { q: '2', options: ['Roma', 'Milano', 'Torino'], correct: 'Torino', correctIndex: 2 },
        { q: '3', options: ['Roma,', 'Milano;', 'Torino:'], correct: 'Milano;' },
        { q: '4', options: ['Roma', 'Milano', 'Torino'], correct: 3 },
        { q: '5', options: ['Roma', 'Milano', 'Torino'], correct: 'C' },
        { q: '6', a1: 'Roma', a2: 'Milano', a3: 'Torino', correct: 3 },
        { q: '7', a1: 'Roma', a2: 'Milano', a3: 'Torino', correct: 'Roma' }
    ];
    const out = PC.chiudiOpzioni(copia(items));
    out.forEach((it, i) => assert.equal(dove(it), dove(items[i]), 'item ' + it.q));
});

test('se due opzioni diventerebbero uguali, l\'item resta com\'era (la risposta non deve spostarsi)', () => {
    const senzaIndice = { q: 'D?', options: ['Roma', 'Roma.', 'Milano'], correct: 'Roma.' };
    const conIndice = { q: 'D?', options: ['Roma', 'Roma.', 'Milano'], correct: 'Roma.', correctIndex: 1 };
    assert.deepEqual(PC.chiudiOpzioni([copia(senzaIndice)])[0], senzaIndice);
    assert.deepEqual(PC.chiudiOpzioni([copia(conIndice)])[0], conIndice);
});

/* Il ricontrollo finale (verifica indipendente del 06/10, mutazione M11): una
   risposta per NUMERO che coincide col testo di un'opzione a cifre. Prima del
   passo `correct: 2` si legge come il testo «2»; dopo, «2.» non coincide più e
   lo stesso 2 diventerebbe l'indice della seconda opzione. La risposta si
   sposterebbe senza che nulla lo dica: l'item resta com'era. */
test('se la risposta per numero cambierebbe lettura dopo il passo, l\'item resta com\'era', () => {
    const cifre = { q: 'D?', options: ['2', 'Roma', 'Milano'], correct: 2 };
    const tri = { q: 'D?', a1: '3', a2: '1', a3: '2', correct: 2 };
    const anno = { q: 'D?', options: [1848, '1861', 'Mai'], correct: 1861 };
    const out = PC.chiudiOpzioni([copia(cifre), copia(tri), copia(anno)]);
    assert.deepEqual(out, [cifre, tri, anno]);
});

/* Due opzioni che differiscono solo per le maiuscole (verifica del 06/10): la
   risposta per testo segue l'opzione che nominava DAVVERO, non la prima che le
   somiglia — prima del passo options[correctIndex] === correct, e dopo pure. */
test('la risposta per testo segue l\'opzione scritta uguale, prima di una che le somiglia', () => {
    const [out] = PC.chiudiOpzioni([{ q: 'D?', options: ['Roma', 'roma', 'Milano'], correctIndex: 1, correct: 'roma' }]);
    assert.equal(out.correct, 'roma.');
    assert.equal(out.options[out.correctIndex], out.correct);
});

test('un item senza risposta riconoscibile, o senza opzioni, resta identico', () => {
    const ignota = { q: 'D?', options: ['Roma', 'Milano'], correct: 'Napoli' };
    const aperta = { question: 'Perché?', guide: 'Spiega', criteri: [] };
    const flash = { front: 'Capitale', back: 'Roma' };
    const out = PC.chiudiOpzioni([copia(ignota), copia(aperta), copia(flash), null]);
    assert.deepEqual(out, [ignota, aperta, flash, null]);
    assert.deepEqual(PC.chiudiOpzioni(undefined), []);
    assert.deepEqual(PC.chiudiOpzioni([]), []);
});

test('l\'input non cambia: si restituiscono copie', () => {
    const items = [
        { q: 'D?', options: ['Roma', 'Milano', 'Torino'], correct: 'Roma', correctIndex: 0 },
        { q: 'E?', a1: 'Roma', a2: 'Milano', a3: 'Torino', correct: 1 }
    ];
    const prima = JSON.stringify(items);
    const out = PC.chiudiOpzioni(items);
    assert.equal(JSON.stringify(items), prima, 'gli oggetti ricevuti sono intatti');
    assert.notEqual(out[0], items[0]);
    assert.notEqual(out[0].options, items[0].options);
    assert.equal(items[0].options[0], 'Roma');
});

// ── 2. l'app: i moduli veri in una sandbox ─────────────────────────────────

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const TEMPLATE = 'CONSEGNA: scrivi le domande.';
const MATERIALE = 'Roma è la capitale d\'Italia dal 1871. Torino lo fu dal 1861 al 1865.';

/* Un banco con study-session (e, se chiesto, flashcards-sr) caricati nello
   stesso contesto, come nell'app. `interruttore`: undefined = localStorage non
   c'è nemmeno (come in Node); null = localStorage c'è e la chiave no (come
   nell'app di chi non l'ha mai toccata); altrimenti il valore scritto. */
function banco({ lingua = 'it', interruttore, conFlashcards = false, soloFlashcards = false } = {}) {
    const chiamate = [];
    const win = {
        getPromptLanguage: () => lingua,
        getSystemKey: () => 'chiave-finta',
        mappaiOccupato: () => false,
        fillPromptTemplate: () => TEMPLATE,
        injectClassTuning: p => p,
        getMaxOutputTokens: n => n,
        QUIZ_TEMPERATURE: 0.4,
        salvageTruncatedJSON: salvage,
        MappAIPipelineCore: PC,
        showToast() {}, showLoadingOverlay() {}, showAlert(_t, m) { throw new Error(m); },
        t: (_k, v) => v,
        _risposta: [],
        fetchModelAPI: async (payload) => {
            chiamate.push(payload);
            return { candidates: [{ content: { parts: [{ text: JSON.stringify(win._risposta) }] } }] };
        }
    };
    const sandbox = {
        window: win,
        appState: { db: { nodes: [], links: [], studySets: [] } },
        MARKER_JSON: '```json', MARKER_END: '```',
        salvageTruncatedJSON: salvage,
        confirm: () => true,
        document: { getElementById: () => null, querySelectorAll: () => [] },
        console: { log() {}, warn() {}, error() {} },
        setTimeout, clearTimeout
    };
    if (interruttore !== undefined) {
        const store = interruttore === null ? {} : { mappai_mc_punto: interruttore };
        const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
        sandbox.localStorage = ls;
        win.localStorage = ls;
    }
    vm.createContext(sandbox);
    if (!soloFlashcards) vm.runInContext(JS('mappai-study-session.js'), sandbox);
    if (conFlashcards || soloFlashcards) vm.runInContext(JS('mappai-flashcards-sr.js'), sandbox);
    win.renderStudySets = () => {};
    return { win, chiamate, sandbox };
}
const promptDi = (h, i = 0) => h.chiamate[i].contents[0].parts[0].text;

const RISPOSTA_MC = [
    { q: 'Qual è la capitale d\'Italia?', options: ['Roma', 'Milano', 'Torino?'], correct: 'Roma', explanation: 'x' },
    { q: 'Quando Torino fu capitale?', options: ['Dal 1848,', 'Dal 1861', 'Mai!'], correct: 'Dal 1861', explanation: 'y' }
];
const generaQuiz = (h, extra) => h.win.generateDynamicQuiz(Object.assign({
    nodeLabel: 'Capitali', material: MATERIALE, quizType: 'Scelta Multipla',
    quantity: 2, apiKey: 'chiave-finta', nonce: 'FISSO', seme: 'S'
}, extra || {}));

test('quizPuntoBlock: una frase che chiede il punto, in italiano e in inglese; vuota a interruttore spento', () => {
    const it = banco({ lingua: 'it' }).win.quizPuntoBlock();
    const en = banco({ lingua: 'en' }).win.quizPuntoBlock();
    assert.ok(/finisce con il punto/.test(it), it);
    assert.ok(/full stop/i.test(en), en);
    assert.equal(banco({ interruttore: '0' }).win.quizPuntoBlock(), '');
    assert.ok(banco({ interruttore: '1' }).win.quizPuntoBlock().length > 0, 'un valore diverso da \'0\' lascia acceso');
});

test('generateDynamicQuiz, interruttore assente (= acceso): ogni opzione chiusa, la risposta esatta è la stessa', async () => {
    const h = banco();
    h.win._risposta = copia(RISPOSTA_MC);
    const out = await generaQuiz(h);
    assert.deepEqual(copia(out), copia(PC.chiudiOpzioni(PC.mescolaOpzioni(copia(RISPOSTA_MC), 'S'))));
    for (const it of out) {
        it.options.forEach(o => assert.match(o, FINE));
        assert.equal(it.options[it.correctIndex], it.correct);
    }
    assert.deepEqual(out.map(it => it.correct), ['Roma.', 'Dal 1861.']);
    assert.ok(promptDi(h).indexOf(h.win.quizPuntoBlock()) > 0, 'la regola arriva nel prompt');
});

/* B3 nell'app vera (verifica del 06/10, mutazione M13): localStorage c'è e la
   chiave non è mai stata scritta. Senza questo caso il banco provava «assente»
   solo dove localStorage manca del tutto, e un interruttore spento di default
   (`=== '1'`) passava ugualmente. */
test('B3: con localStorage presente e la chiave mai scritta, il punto è acceso', async () => {
    const h = banco({ interruttore: null });
    assert.ok(/finisce con il punto/.test(h.win.quizPuntoBlock()));
    h.win._risposta = copia(RISPOSTA_MC);
    const out = await generaQuiz(h);
    assert.deepEqual(copia(out), copia(PC.chiudiOpzioni(PC.mescolaOpzioni(copia(RISPOSTA_MC), 'S'))));
});

test('generateDynamicQuiz in inglese: la regola nel prompt è quella inglese', async () => {
    const h = banco({ lingua: 'en' });
    h.win._risposta = copia(RISPOSTA_MC);
    await generaQuiz(h);
    assert.ok(/full stop/i.test(promptDi(h)));
});

test('generateDynamicQuiz, interruttore spento: quiz e prompt di oggi', async () => {
    const on = banco(), off = banco({ interruttore: '0' });
    on.win._risposta = copia(RISPOSTA_MC);
    off.win._risposta = copia(RISPOSTA_MC);
    await generaQuiz(on);
    const out = await generaQuiz(off);
    assert.deepEqual(copia(out), copia(PC.mescolaOpzioni(copia(RISPOSTA_MC), 'S')), 'solo il rimescolamento di sempre');
    const blocco = on.win.quizPuntoBlock();
    assert.equal(promptDi(on).replace('\n\n' + blocco, ''), promptDi(off), 'l\'unica differenza del prompt è la regola');
    assert.ok(!/finisce con il punto/.test(promptDi(off)));
});

test('generateDynamicQuiz: il tipo della pipeline di CREA è scelta multipla e si chiude', async () => {
    const h = banco();
    h.win._risposta = copia(RISPOSTA_MC);
    const out = await generaQuiz(h, { quizType: 'Scelta multipla con 3 opzioni brevi e plausibili, una sola corretta' });
    out.forEach(it => it.options.forEach(o => assert.match(o, FINE)));
});

test('Vero/Falso e domande aperte non passano dal passo, e il loro prompt non ha la regola', async () => {
    const vf = banco();
    const RISPOSTA_VF = [{ q: 'Roma è la capitale d\'Italia.', options: ['Vero', 'Falso'], correct: 'Vero', explanation: 'x' }];
    vf.win._risposta = copia(RISPOSTA_VF);
    const out = await generaQuiz(vf, { quizType: 'Vero o Falso' });
    assert.deepEqual(copia(out), copia(PC.mescolaOpzioni(copia(RISPOSTA_VF), 'S')));
    assert.ok(!/finisce con il punto/.test(promptDi(vf)));

    const ap = banco();
    ap.win._risposta = [{ q: 'Perché Roma?', correct: 'Perché sì', explanation: 'x' }];
    await generaQuiz(ap, { quizType: 'Risposta Aperta' });
    assert.ok(!/finisce con il punto/.test(promptDi(ap)));
});

// ── il quiz per nodo (mappai-flashcards-sr.js) ─────────────────────────────

const RISPOSTA_NODO = [
    { q: 'Qual è la capitale d\'Italia?', a1: 'Roma', a2: 'Milano', a3: 'Torino?', correct: 1 },
    { q: 'Quando Torino fu capitale?', a1: 'Dal 1848,', a2: 'Dal 1861', a3: 'Mai!', correct: 2 }
];
const NODO = () => ({ id: 'n1', label: 'Capitali', desc: MATERIALE });
const testoGiusto = it => it['a' + it.correct];

const SET_NODO = () => ({ id: 'set_n', mode: 'quiz', type: 'Multiple Choice', title: 'Nodo: Capitali',
    items: [{ q: 'Vecchia', a1: 'A', a2: 'B', a3: 'C', correct: 1 }], material: MATERIALE, nodeQuiz: true });

test('rigenerazione del quiz per nodo, acceso: anche qui le opzioni si chiudono e la regola è nel prompt', async () => {
    const h = banco({ conFlashcards: true });
    h.sandbox.appState.db.studySets.push(SET_NODO());
    h.win._risposta = copia(RISPOSTA_NODO);
    await h.win.regenerateStudySet('set_n');
    const set = h.sandbox.appState.db.studySets[0];
    assert.deepEqual(copia(set.items), copia(PC.chiudiOpzioni(copia(RISPOSTA_NODO))));
    assert.deepEqual(set.items.map(testoGiusto), ['Roma.', 'Dal 1861.']);
    assert.ok(promptDi(h).indexOf(h.win.quizPuntoBlock()) > 0);
});

test('rigenerazione del quiz per nodo, spento: item e prompt di oggi', async () => {
    const on = banco({ conFlashcards: true }), off = banco({ conFlashcards: true, interruttore: '0' });
    for (const h of [on, off]) {
        h.sandbox.appState.db.studySets.push(SET_NODO());
        h.win._risposta = copia(RISPOSTA_NODO);
        await h.win.regenerateStudySet('set_n');
    }
    assert.deepEqual(copia(off.sandbox.appState.db.studySets[0].items), copia(RISPOSTA_NODO));
    assert.equal(promptDi(on).replace('\n\n' + on.win.quizPuntoBlock(), ''), promptDi(off));
});

test('rigenerazione di un quiz dinamico: passa da generateDynamicQuiz e si chiude', async () => {
    const h = banco({ conFlashcards: true });
    h.sandbox.appState.db.studySets.push({ id: 'set_d', mode: 'quiz', type: 'Scelta Multipla', title: 'Capitali',
        items: copia(RISPOSTA_MC), material: MATERIALE, quantity: 2 });
    h.win._risposta = copia(RISPOSTA_MC);
    await h.win.regenerateStudySet('set_d');
    const set = h.sandbox.appState.db.studySets[0];
    for (const it of set.items) {
        it.options.forEach(o => assert.match(o, FINE));
        assert.equal(it.options[it.correctIndex], it.correct);
    }
});

test('reader: flashcards-sr caricato da solo (senza study-session) non si rompe', async () => {
    const h = banco({ soloFlashcards: true });
    h.sandbox.appState.db.studySets.push(SET_NODO());
    h.win._risposta = copia(RISPOSTA_NODO);
    await h.win.regenerateStudySet('set_n');
    assert.equal(h.sandbox.appState.db.studySets[0].items.length, 2);
});

// ── 3. la virgola davanti alla risposta esatta (gate 3 del 06/10) ──────────
/* Al gate, su «Da Roma al Medioevo», 4 domande su 35 avevano la risposta
   esatta scritta dal modello con un segno davanti — «，» (la virgola cinese)
   tre volte, «, » una — e quindi non coincidevano con nessuna opzione: né il
   rimescolamento né il punto la riconoscevano, e il Banco le fermava con «La
   chiave non identifica una delle alternative». Sui quiz salvati prima dello
   0080 lo stesso guasto compare una volta (27/9). Giacomo, 06/10: «1,
   correggilo qui». La regola: virgole, punti e virgola, due punti (anche nelle
   forme a larghezza piena) e spazi DAVANTI alla risposta non contano per
   riconoscerla, e la risposta si riscrive col testo pulito dell'opzione. Vale
   anche a interruttore spento: è il riconoscimento di sempre, non il punto. */

const OPZ_VERE = ['Permettevano di diffondere solo le nuove leggi dei regni germanici.',
    'Garantivano che i testi antichi fossero conservati per il futuro.',
    'Sostituivano completamente l\'uso della lingua latina della Chiesa.'];

test('mescolaOpzioni riconosce la risposta con un segno davanti e la riscrive pulita', () => {
    for (const sporca of ['，Milano', ', Milano', '、Milano', ';Milano', '：Milano', ' ,Milano']) {
        const [out] = PC.mescolaOpzioni([{ q: 'D?', options: ['Roma', 'Milano', 'Torino'], correct: sporca }], 'S');
        assert.equal(out._mescolato, true, sporca);
        assert.equal(out.correct, 'Milano', sporca);
        assert.equal(out.options[out.correctIndex], 'Milano', sporca);
    }
    const pos = PC.posizioniCorrette([{ q: 'D?', options: ['Roma', 'Milano'], correct: '，Milano' }]);
    assert.equal(pos.tot, 1);
    assert.equal(pos.ignoti, 0);
});

test('il caso vero del gate: rimescolata e chiusa, la risposta esatta è l\'opzione giusta', () => {
    const item = { q: 'Perché i monasteri copiavano i manoscritti?', options: OPZ_VERE.slice(),
        correct: '，' + OPZ_VERE[1], explanation: 'x' };
    const [out] = PC.chiudiOpzioni(PC.mescolaOpzioni([item], 'seme'));
    assert.equal(out.correct, OPZ_VERE[1]);
    assert.equal(out.options[out.correctIndex], out.correct);
});

test('chiudiOpzioni senza rimescolamento (rigenerazione del quiz per nodo): la risposta sporca segue il testo nuovo, pulita', () => {
    const [tri] = PC.chiudiOpzioni([{ q: 'D?', a1: 'Roma', a2: 'Milano', a3: 'Torino', correct: '，Milano' }]);
    assert.equal(tri.a2, 'Milano.');
    assert.equal(tri.correct, 'Milano.');
    const [opt] = PC.chiudiOpzioni([{ q: 'D?', options: ['Roma', 'Milano', 'Torino'], correct: ', Milano' }]);
    assert.deepEqual(opt.options, ['Roma.', 'Milano.', 'Torino.']);
    assert.equal(opt.correct, 'Milano.');
});

test('una risposta fatta SOLO di segni resta non riconosciuta, come prima', () => {
    const solo = { q: 'D?', options: ['Roma', 'Milano'], correct: '，' };
    assert.deepEqual(PC.mescolaOpzioni([copia(solo)], 'S')[0], solo);
    assert.deepEqual(PC.chiudiOpzioni([copia(solo)])[0], solo);
});

test('generateDynamicQuiz: la risposta con la virgola davanti si riconosce, acceso e spento', async () => {
    const SPORCA = [{ q: 'Perché i monasteri copiavano i manoscritti?', options: OPZ_VERE.slice(),
        correct: '，' + OPZ_VERE[1], explanation: 'x' }];
    const on = banco(), off = banco({ interruttore: '0' });
    on.win._risposta = copia(SPORCA);
    off.win._risposta = copia(SPORCA);
    const [a] = await generaQuiz(on);
    const [b] = await generaQuiz(off);
    assert.equal(a.correct, OPZ_VERE[1]);
    assert.equal(a.options[a.correctIndex], a.correct);
    assert.equal(b.correct, OPZ_VERE[1]);
    assert.equal(b.options[b.correctIndex], b.correct);
});

/* Nessun passo indietro (terzo giro, 06/10): se anche l'OPZIONE comincia con un
   segno, la risposta scritta uguale si riconosceva prima della pulizia e deve
   riconoscersi ancora — prima si cerca il testo così com'è, poi quello pulito. */
test('un\'opzione che comincia con un segno: la risposta scritta uguale si riconosce ancora', () => {
    const item = { q: 'D?', options: [', sì', 'no', 'forse'], correct: ', sì' };
    const [m] = PC.mescolaOpzioni([copia(item)], 'S');
    assert.equal(m._mescolato, true);
    assert.equal(m.options[m.correctIndex], ', sì');
    const [c] = PC.chiudiOpzioni([copia(item)]);
    assert.deepEqual(c.options, [', sì.', 'no.', 'forse.']);
    assert.equal(c.correct, ', sì.');
});
