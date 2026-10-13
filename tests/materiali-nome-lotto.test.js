'use strict';
/*
 * materiali-nome-lotto.test.js — il nome del giro in «Più materiali insieme» (0091).
 *
 * Il difetto (Giacomo, gate dello 0090): due giri di scelta multipla sullo
 * stesso progetto davano in ELABORA due righe «Scelta Multipla» che non si
 * distinguono, e lo stesso in INSEGNA. Il modale ha ora un campo «Nome»: entra
 * in `quiz.nome`, che il motore unisce già all'angolo (ADR 0003) per titolo,
 * `clone` e nome del file. Un nome già preso si rifiuta prima di partire.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PC = require('../public/js/mappai-pipeline-core.js');
const CL = require('../public/js/mappai-clona-core.js');

const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const copy = v => JSON.parse(JSON.stringify(v));

function runtime({ sets = [], docs = [] } = {}) {
    const elements = new Map();
    ['mp-modal', 'mp-perbranch', 'mp-angle', 'mp-quiz-on', 'mp-qt-mixed', 'mp-qt-mc', 'mp-qt-open', 'mp-qt-fc',
        'mp-quiz-nome', 'mp-ns-on', 'mp-syn-on', 'mp-src-pdf', 'mp-ns-causal', 'mp-adapt-on',
        ...PC.angoliMulti().map(x => 'mp-ang-' + x)].forEach(id => elements.set(id, { value: '', checked: false }));
    elements.get('mp-modal').querySelector = sel => elements.get(sel.replace(/^#/, '')) || null;
    const context = {
        appState: { db: { studySets: sets }, rootNodeLabel: 'La fotosintesi' },
        MappAIPipelineCore: PC, MappAIClona: CL,
        MappAIStudyDocs: { list: () => docs },
        document: { getElementById: id => elements.get(id) || null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() { } },
        console: { log() { }, warn() { } }
    };
    context.window = context;
    vm.runInNewContext(read('mappai-material-pipeline.js').replace('function _readConfig() {', 'Pipeline.readConfig = _readConfig; function _readConfig() {'), context);
    return { pipeline: context.MappAIPipeline, el: id => elements.get(id) };
}

function scegli(h, { tipi = ['mc'], nome = '', angoli = [] } = {}) {
    h.el('mp-quiz-on').checked = true;
    h.el('mp-perbranch').value = '3';
    h.el('mp-angle').value = 'auto';
    tipi.forEach(t => { h.el({ mc: 'mp-qt-mc', open: 'mp-qt-open', flashcards: 'mp-qt-fc' }[t]).checked = true; });
    angoli.forEach(k => { h.el('mp-ang-' + k).checked = true; });
    h.el('mp-quiz-nome').value = nome;
    return h.pipeline.readConfig();
}

test('il nome scritto nel modale entra in quiz.nome, ripulito', () => {
    const h = runtime();
    const cfg = scegli(h, { tipi: ['mc', 'open', 'flashcards'], nome: '  verifica   ottobre ' });
    assert.equal(cfg.quiz.nome, CL.pulisci('verifica ottobre'));
    assert.equal(cfg.quiz.nome, 'verifica ottobre');
});

test('senza nome la configurazione è quella di prima', () => {
    const h = runtime();
    const cfg = scegli(h, { tipi: ['mc'] });
    assert.deepEqual(copy(cfg.quiz), { types: ['mc'], perBranch: 3, angle: 'auto', multi: [], angoli: [] });
});

test('il nome non finisce nei preset', () => {
    const h = runtime();
    const cfg = scegli(h, { tipi: ['mc'], nome: 'recupero' });
    assert.equal(PC.presetFromConfig(cfg).quiz.nome, undefined);
});

test('un nome libero passa; un nome già preso da un set o da un foglio dello stesso genere si rifiuta', () => {
    const libero = runtime({ sets: [{ type: 'Scelta Multipla', clone: 'altro' }] });
    assert.equal(libero.pipeline._nomeGiroPreso(scegli(libero, { tipi: ['mc'], nome: 'recupero' }).quiz), '');

    const setPreso = runtime({ sets: [{ type: 'Scelta Multipla', clone: 'Recupero' }] });
    assert.match(setPreso.pipeline._nomeGiroPreso(scegli(setPreso, { tipi: ['mc'], nome: 'recupero' }).quiz), /^Scelta Multipla: C'è già una copia/);

    const titoloAperte = CL.etichetta('Domande aperte', 'recupero');
    const fogliPresi = runtime({ docs: [{ kind: 'quizpaper', mapName: 'La fotosintesi', title: titoloAperte }] });
    assert.match(fogliPresi.pipeline._nomeGiroPreso(scegli(fogliPresi, { tipi: ['mc', 'open'], nome: 'recupero' }).quiz), /^Domande aperte: /);
});

test('con più angoli il controllo guarda il nome che il giro scriverà davvero (angolo · nome)', () => {
    const h = runtime({ sets: [{ type: 'Scelta Multipla', clone: 'causa · recupero' }] });
    const cfg = scegli(h, { tipi: ['mc'], nome: 'recupero', angoli: ['causa', 'esempio'] });
    assert.deepEqual(copy(cfg.quiz.multi), ['mc']);
    assert.match(h.pipeline._nomeGiroPreso(cfg.quiz), /Scelta Multipla/);
    const h2 = runtime({ sets: [{ type: 'Scelta Multipla', clone: 'recupero' }] });
    assert.equal(h2.pipeline._nomeGiroPreso(scegli(h2, { tipi: ['mc'], nome: 'recupero', angoli: ['causa', 'esempio'] }).quiz), '',
        'con due angoli i nomi sono «causa · recupero» ed «esempio · recupero»: «recupero» da solo non li blocca');
});

test('il giro usa la stessa regola del controllo per titolo, clone e file', () => {
    const src = read('mappai-material-pipeline.js');
    assert.match(src, /const \{ nomeVar, etichetta \} = _etichettaGiro\(config\.quiz, angoli, ang\);/);
    assert.match(src, /const nomePreso = _nomeGiroPreso\(cfg\.quiz\);\s*if \(nomePreso\) \{ _toast\(nomePreso, 'warning'\); return; \}/);
    assert.match(src, /id="mp-quiz-nome"/);
});
