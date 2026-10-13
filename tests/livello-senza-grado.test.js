'use strict';
/*
 * 0093, lotto H — difetto 42 della guida: una classe vecchia senza grado mandava il suo NOME
 * all'AI come livello («Destinatari: studenti di <nome>»), per `grade = c.grade || c.name`
 * in `MappAITune.levelBlock` (app.js). Le classi create oggi hanno sempre il grado.
 *
 * L'oggetto vero `window.MappAITune` si estrae da app.js e gira in una vm.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

function tune(classe, o = {}) {
    const i = SRC.indexOf('window.MappAITune = {');
    assert.ok(i >= 0);
    const codice = SRC.slice(i, SRC.indexOf('\n};\n', i) + 3);
    const ctx = vm.createContext({});
    ctx.window = ctx;
    ctx.appState = { userProfile: {} };
    ctx.MappAIClasses = { getActive: () => classe, registerPrompt: k => (k === 'semplice' ? 'Frasi brevi.' : '') };
    vm.runInContext(codice, ctx);
    if (o.semplice) ctx.MappAITune.armLevel(true);
    return ctx.MappAITune;
}

test('42: una classe senza grado non manda il suo nome come livello', () => {
    const T = tune({ id: 'c1', name: 'Scienze 2B' });
    assert.equal(T.levelBlock(), '');
    assert.equal(T.levelBlock().includes('Scienze 2B'), false);
});

test('42: senza grado ma con l\'ordine scolastico, la riga dice l\'ordine e non il nome', () => {
    const b = tune({ id: 'c1', name: 'Scienze 2B', system: 'Ticino' }).levelBlock();
    assert.ok(b.includes('Destinatari: studenti di Ticino.'), b);
    assert.equal(b.includes('Scienze 2B'), false);
});

test('42: con il grado tutto come prima; col «semplifica comunque» il registro semplice entra anche senza grado', () => {
    const b = tune({ id: 'c2', name: '3A', grade: '3ª', system: 'Ticino' }).levelBlock();
    assert.ok(b.includes('Destinatari: studenti di 3ª · Ticino.'), b);
    const s = tune({ id: 'c1', name: 'Scienze 2B' }, { semplice: true }).levelBlock();
    assert.ok(s.includes('Frasi brevi.'), s);
    assert.equal(s.includes('Scienze 2B'), false);
});
