'use strict';
/* Packet 0102 — i fogli dei nodi nascono sempre in modo «Scheda», ma solo con
   Output = Differenziazione e per un progetto non nato da una foto. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require('../public/js/mappai-pipeline-core.js');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');

function runtime({ output, nodi } = {}) {
    const store = new Map(output ? [['mappai_crea_output', output]] : []);
    const el = new Map();
    // Nessuna spunta dei fogli montata: il riquadro non c'è più.
    ['mn-bento', 'mp-quiz-on', 'mp-qt-mc', 'mp-syn-on', 'mp-adapt-on', 'mp-src-pdf', 'mp-ns-causal']
        .forEach(id => el.set(id, { value: '', checked: false }));
    const context = { appState: { db: { nodes: nodi || [] } }, MappAIPipelineCore: PC,
        MappAICostruisci: { memorizza() {} },
        document: { getElementById: id => el.get(id) || null, querySelector: () => null },
        localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
        console: { log() {} } };
    context.window = context;
    vm.runInNewContext(read('mappai-material-pipeline.js').replace('function _readConfig() {',
        'Pipeline.readConfig = _readConfig; Pipeline.setReview = function (v) { Pipeline._reviewTarget = v; }; function _readConfig() {'), context);
    return context.MappAIPipeline;
}
const SCHEDA = { maxLevel: 'all', fmt: '2x2', modes: ['card'], causal: false };

test('Differenziazione (anche di default): i fogli nascono da soli, solo «Scheda»', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(runtime().readConfig().nodesheet)), SCHEDA);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime({ output: 'differenziazione' }).readConfig().nodesheet)), SCHEDA);
});

test('Metacomprensione e Analisi iconografica: nessun foglio', () => {
    assert.equal(runtime({ output: 'metacomprensione' }).readConfig().nodesheet, undefined);
    assert.equal(runtime({ output: 'iconografica' }).readConfig().nodesheet, undefined);
});

test('progetto nato da una foto: nessun foglio', () => {
    const p = runtime({ output: 'differenziazione', nodi: [{ id: 'fonte_0' }] });
    p.setReview(true);
    assert.equal(p.readConfig().nodesheet, undefined);
});

test('stima: «Scheda», «Titolo» e «Da completare» non sono chiamate AI; le parole chiave sì, a lotti da 18', () => {
    const st = { branches: 6, nodes: 53 };
    for (const m of ['card', 'title', 'summary']) {
        assert.equal(PC.estimateCalls({ nodesheet: { modes: [m] } }, st).perStep.C, 0, m);
    }
    assert.equal(PC.estimateCalls({ nodesheet: { modes: ['card', 'keywords'] } }, st).perStep.C, 3);
});

test('editor: un foglio nuovo parte da «Titolo + descrizione», con la descrizione dei nodi', () => {
    const src = read('mappai-doc-editor.js');
    const i = src.indexOf('NS().docFromNodes(');
    assert.ok(i > 0);
    const blocco = src.slice(i, i + 200);
    assert.match(blocco, /layout: 'card'/);
    assert.match(blocco, /descs/);
    const NS = require('../public/js/mappai-nodesheet-core.js');
    const d = NS.docFromNodes([{ id: 'a', label: 'A' }], { fmt: '2x2', layout: 'card', descs: { a: 'testo' } });
    assert.equal(d.cards[0].layout, 'card');
    assert.equal(d.cards[0].desc, 'testo');
});
