'use strict';
// classi.json che c'è ma non si legge non è un elenco vuoto (25/9/2026).
// Prima: l'elenco partiva da zero e il primo salvataggio (creare una classe)
// scriveva il vuoto sopra al file E sopra alla copia in localStorage — classi e
// credenziali degli allievi perse. Il modulo vero gira in una vm con stub minimi.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// gli oggetti nati nella vm hanno i prototipi di un altro realm: si confrontano in JSON
const puro = x => JSON.parse(JSON.stringify(x));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-live-classes.js'), 'utf8');

function carica({ load, saveResult, locale }) {
    const ls = new Map(locale ? [['mappai_classes', JSON.stringify(locale)]] : []);
    const toasts = [], scritti = [];
    const g = {
        console: { log() {}, warn() {} },
        localStorage: {
            getItem: k => (ls.has(k) ? ls.get(k) : null),
            setItem: (k, v) => { ls.set(k, String(v)); },
            removeItem: k => { ls.delete(k); }
        },
        document: { addEventListener() {}, dispatchEvent() {}, getElementById: () => null },
        CustomEvent: function (n) { this.type = n; },
        showToast: (m, k) => toasts.push({ k, m }),
        electronAPI: {
            liveClassesLoad: load,
            liveClassesSave: async d => { scritti.push(JSON.parse(JSON.stringify(d))); return saveResult || { success: true }; }
        }
    };
    g.window = g;
    vm.createContext(g);
    vm.runInContext(SRC, g);   // senza MappAILiveCore non parte il precaricamento automatico
    return { S: g.MappAIClasses, ls, toasts, scritti };
}

const COPIA = { schema: 'mappai-classes@1', classes: [{ id: 'c2a', name: '2A', students: [{ n: 1 }] }] };

test('file illeggibile: si mostra la copia locale e il salvataggio non scrive niente', async () => {
    const t = carica({ load: async () => ({ success: false, error: 'Unexpected end of JSON input' }), locale: COPIA });
    await t.S.load();
    assert.deepEqual(puro(t.S.list()).map(c => c.name), ['2A']);
    assert.ok(t.S.illeggibile);
    assert.ok(t.toasts.some(x => x.k === 'error'));
    t.S.data.classes.push({ id: 'nuova', name: '3B' });
    const r = await t.S.save();
    assert.deepEqual(puro(r), { success: false, error: 'classi-illeggibili' });
    assert.equal(t.scritti.length, 0, 'il file sul disco non si tocca');
    assert.deepEqual(JSON.parse(t.ls.get('mappai_classes')), COPIA, 'la copia locale resta quella buona');
});

test('file illeggibile e nessuna copia locale: elenco vuoto, ma non lo si scrive sopra al file', async () => {
    const t = carica({ load: async () => { throw new Error('ipc giù'); } });
    await t.S.load();
    assert.deepEqual(puro(t.S.list()), []);
    const r = await t.S.save();
    assert.equal(r.success, false);
    assert.equal(t.scritti.length, 0);
    assert.equal(t.ls.has('mappai_classes'), false);
});

test('file letto: come prima, si salva su disco e in locale', async () => {
    const t = carica({ load: async () => ({ success: true, data: COPIA }) });
    await t.S.load();
    assert.equal(t.S.illeggibile, null);
    await t.S.save();
    assert.equal(t.scritti.length, 1);
    assert.ok(t.ls.has('mappai_classes'));
});

test('il disco rifiuta il salvataggio: ora lo si dice (main.js risponde success:false, non rifiuta)', async () => {
    const t = carica({ load: async () => ({ success: true, data: COPIA }), saveResult: { success: false, error: 'EACCES' } });
    await t.S.load();
    const r = await t.S.save();
    assert.equal(r.success, false);
    assert.ok(t.toasts.some(x => x.k === 'error' && /EACCES/.test(x.m)));
});
