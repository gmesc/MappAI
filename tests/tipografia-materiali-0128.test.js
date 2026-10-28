/* 0128, allargamento 7 (Giacomo, 27/10): «Inserisci le opzioni che hai costruito in questo editor per la gestione di font e
   interlinea anche agli editor di tutti gli altri materiali»; «Sì, allarga il perimetro a mappai-quiz-print.js (quiz e
   domande aperte), mappai-branch-synthesis.js e mappai-causal-chains.js e porta dimensione e interlinea in tutti gli editor».
   La scelta per materiale sta nel core della stampa (`MappAIPrintLayout.tipografia`); i quattro fogli la seguono e, senza
   scelta, escono come prima (verificato a parte carattere per carattere contro il codice di `56c566f8`). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8');

function contesto(store) {
    const mem = new Map(Object.entries(store || {}));
    const ctx = {
        console: { log() { }, warn() { }, error() { } },
        localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
        t: (k, f) => f, showToast() { },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), addEventListener() { } },
        navigator: { language: 'it' }, appState: { db: { nodes: [], links: [] }, rootNodeLabel: 'Mappa' }, setTimeout, clearTimeout
    };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    ['mappai-print-layout.js', 'mappai-doc-head.js', 'mappai-docedit-core.js', 'mappai-quiz-print.js', 'mappai-causal-core.js',
        'mappai-causal-chains.js', 'mappai-branch-synthesis.js'].forEach((f) => vm.runInContext(JS(f), ctx, { filename: f }));
    return ctx;
}
const J = (o) => JSON.parse(JSON.stringify(o));   // oggetti nati nel contesto vm: altro prototipo
const scelta = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['mappai_tipo_' + k, JSON.stringify(v)]));

const SET = { title: 'Prova', items: [{ question: 'Che cosa trasporta il sangue?', options: ['Ossigeno', 'Sale'], correctIndex: 0, explanation: 'Perché.', lines: 4, guide: 'Ossigeno' }] };
const SYN = { branchLabel: 'Respirazione', mapName: 'Mappa', html: '<p>Uno.</p><ul><li>Due</li></ul>' };
const CHAINS = { root: [], branches: [{ label: 'Ramo', items: [] }], cross: [] };

test('core della stampa: la scelta per materiale, coi valori di serie dei fogli di oggi e i limiti', () => {
    const PL = contesto().MappAIPrintLayout;
    assert.deepStrictEqual(J(PL.tipografia('quiz')), { corpo: 13, interlinea: 1.55, k: 1, lk: 1, scelto: { corpo: false, interlinea: false } });
    assert.strictEqual(PL.tipografia('causal').corpo, 9, 'la catena: 12 px = 9 pt');
    assert.strictEqual(PL.tipografia('synthesis').interlinea, 1.7);
    assert.strictEqual(PL.tipografia('flashcards'), null, 'le flashcard e il foglio dei nodi hanno il loro core');
    let T = PL.setTipografia('quiz', 'corpo', 16);
    assert.strictEqual(T.corpo, 16); assert.ok(Math.abs(T.k - 16 / 13) < 1e-9); assert.ok(T.scelto.corpo && !T.scelto.interlinea);
    T = PL.setTipografia('quiz', 'interlinea', 1.55 + 0.1);
    assert.strictEqual(T.interlinea, 1.7, 'a passi di 0,1 (da 1,55 si arriva a 1,7)');
    assert.strictEqual(PL.setTipografia('quiz', 'corpo', 99).corpo, 20, 'mai oltre 20');
    assert.strictEqual(PL.setTipografia('quiz', 'corpo', 2).corpo, 8, 'mai sotto 8');
    assert.strictEqual(PL.setTipografia('quiz', 'interlinea', 9).interlinea, 2, 'mai oltre 2');
    PL.setTipografia('quiz', 'corpo', null); PL.setTipografia('quiz', 'interlinea', null);
    assert.deepStrictEqual(J(PL.tipografia('quiz').scelto), { corpo: false, interlinea: false }, '«di serie» la toglie');
    assert.strictEqual(PL.tipografia('openq').corpo, 13, 'un materiale non tocca l\'altro');
});

test('quiz e domande aperte: senza scelta i corpi di sempre; con la scelta scalano corpi e interlinee in proporzione', () => {
    const q0 = contesto().buildQuizSetHtml(SET, { now: 'D', mapName: 'Mappa' });
    assert.ok(q0.includes('font-size:13pt; font-weight:bold') && q0.includes('line-height:1.55;') && q0.includes('body { font-size: 12pt; }'));
    const q = contesto(scelta({ quiz: { corpo: 16, interlinea: 1.8 } })).buildQuizSetHtml(SET, { now: 'D', mapName: 'Mappa' });
    assert.ok(q.includes('font-size:16pt; font-weight:bold'), 'la domanda al corpo scelto');
    assert.ok(q.includes('font-size:14.77pt;'), 'le opzioni 12 × 16/13');
    assert.ok(q.includes('line-height:1.8;') && q.includes('line-height:1.74;'), 'interlinea della domanda e delle opzioni (1,5 × 1,8/1,55)');
    assert.ok(!q.includes('font-size:13pt; font-weight:bold'));
    const o0 = contesto().buildOpenQuestionsHtml(SET, { now: 'D', mapName: 'Mappa' });
    assert.ok(o0.includes('font-size:13pt; font-weight:bold') && o0.includes('body { font-size: 12pt; }'));
    const o = contesto(scelta({ openq: { corpo: 15 } })).buildOpenQuestionsHtml(SET, { now: 'D', mapName: 'Mappa' });
    assert.ok(o.includes('font-size:15pt; font-weight:bold') && o.includes('body { font-size: 13.85pt; }'));
    assert.ok(o.includes('line-height:1.55;'), 'l\'interlinea non scelta resta');
    const q2 = contesto(scelta({ openq: { corpo: 15 } })).buildQuizSetHtml(SET, { now: 'D', mapName: 'Mappa' });
    assert.strictEqual(q2, q0, 'la scelta delle domande aperte non tocca il quiz');
});

test('sintesi e catena: senza scelta nessuna regola in più; con la scelta il corpo di stampa e l\'interlinea', () => {
    const s0 = contesto().MappAIBranchSynthesis.buildPrintHtml(SYN);
    assert.ok(!s0.includes('0128: la scelta del docente') && s0.includes(':root { --ap-pt: 13pt; }'));
    const s = contesto(scelta({ synthesis: { corpo: 15, interlinea: 1.9 } })).MappAIBranchSynthesis.buildPrintHtml(SYN);
    assert.ok(s.includes('@media print { :root { --ap-pt: 15pt; } }') && s.includes('.bs-body p, .bs-body li { line-height: 1.9; }'));
    assert.ok(s.indexOf('--ap-pt: 15pt') > s.indexOf('--ap-pt: 13pt'), 'dopo il valore di serie, quindi vince');
    const c0 = contesto().MappAICausal.buildDocHtml(CHAINS, 'Mappa');
    assert.ok(!/body\{font-size:\d/.test(c0.split('</style>')[0].slice(-400)) && c0.includes('.cc-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;line-height:1.7}'));
    const c = contesto(scelta({ causal: { corpo: 11, interlinea: 2 } })).MappAICausal.buildDocHtml(CHAINS, 'Mappa');
    assert.ok(c.includes('body{font-size:14.67px}') && c.includes('.cc-conn{font-size:13.44px}') && c.includes('.cc-line{line-height:2}'), 'la catena in px, 11 pt = 14,67 px');
});
