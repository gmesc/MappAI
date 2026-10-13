'use strict';
/*
 * Il LAYER BROWSER di mappai-study-bus.js: begin / record / end / abort.
 *
 * Il bus è il punto unico da cui le attività di studio scrivono la sessione
 * in `Studio Attivo/sessioni.jsonl` (via electronAPI.saveStudyRecord) — la
 * meta-analisi del docente e la celeration leggono da lì. Qui si prova quando
 * una sessione si SCRIVE e quando no: una sessione persa è uno studio che il
 * docente non vede, una scritta due volte falsa i conteggi.
 * (Il core puro, buildSessionRecord, è in study-bus.test.js.)
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// L'ambiente browser PRIMA del require, così si attiva window.MappAIStudyBus.
const scritti = [], padronanza = [];
global.window = {
    appState: { rootNodeLabel: 'Fotosintesi', activeVaultPath: '/vault/Fotosintesi' },
    MappAIMastery: { record: (...a) => { padronanza.push(a); } },
    electronAPI: { saveStudyRecord: async (p) => { scritti.push(p); return { ok: true }; } }
};
require('../public/js/mappai-study-bus.js');
const BUS = global.window.MappAIStudyBus;

// `begin` chiude la sessione precedente senza aspettarla: si lascia finire.
const unGiro = () => new Promise(r => setImmediate(r));

beforeEach(() => { BUS.abort(); scritti.length = 0; padronanza.length = 0; });

test('record + end → una sola saveStudyRecord, col record della sessione', async () => {
    BUS.begin('cloze', 'Cloze — completa');
    BUS.record('n1', 'Clorofilla', 'cloze', { score: 1, rate: 6 });
    BUS.record('n2', 'Stomi', 'cloze', { score: 0.2 });
    const rec = await BUS.end();

    assert.equal(scritti.length, 1);
    const p = scritti[0];
    assert.equal(p.vaultPath, '/vault/Fotosintesi', 'la sessione va nel vault aperto');
    assert.match(p.dateStr, /^\d{2}-\d{2}-\d{4}$/);
    assert.ok(p.markdownLine.includes('**1/2**'), p.markdownLine);
    assert.equal(p.jsonRecord.mode, 'cloze');
    assert.equal(p.jsonRecord.project, 'Fotosintesi');
    assert.equal(p.jsonRecord.total, 2);
    assert.deepEqual(p.jsonRecord.entries.map(e => e.nodeId), ['n1', 'n2']);
    assert.deepEqual(rec, p.jsonRecord, 'end restituisce lo stesso record che ha scritto');
    assert.equal(padronanza.length, 2, 'e ogni risultato è passato anche dalla padronanza');

    assert.equal(await BUS.end(), null, 'un secondo end non riscrive la stessa sessione');
    assert.equal(scritti.length, 1);
});

test('end senza risultati → niente su disco', async () => {
    BUS.begin('quiz', 'Quiz');
    assert.equal(await BUS.end(), null);
    assert.equal(await BUS.end(), null, 'né senza una sessione aperta');
    assert.equal(scritti.length, 0);
});

test('begin su una sessione aperta la chiude e la scrive: nessun dato perso', async () => {
    BUS.begin('cloze', 'Cloze');
    BUS.record('n1', 'Clorofilla', 'cloze', { score: 1 });
    BUS.begin('quiz', 'Quiz');   // l'attività ha dimenticato end()
    await unGiro();
    assert.equal(scritti.length, 1);
    assert.equal(scritti[0].jsonRecord.mode, 'cloze');

    BUS.record('n2', 'Stomi', 'quiz', { score: 0 });
    await BUS.end();
    assert.equal(scritti.length, 2);
    assert.equal(scritti[1].jsonRecord.mode, 'quiz');
    assert.deepEqual(scritti[1].jsonRecord.entries.map(e => e.nodeId), ['n2'], 'le sessioni non si mescolano');
});

test('begin su una sessione aperta ma vuota non scrive niente', async () => {
    BUS.begin('cloze', 'Cloze');
    BUS.begin('quiz', 'Quiz');
    await unGiro();
    assert.equal(scritti.length, 0);
});

test('abort → la sessione non si scrive; la padronanza resta registrata', async () => {
    BUS.begin('palazzo', 'Palazzo della memoria');
    BUS.record('n1', 'Clorofilla', 'palazzo', { score: 1 });
    BUS.abort();
    assert.equal(await BUS.end(), null);
    assert.equal(scritti.length, 0);
    assert.equal(padronanza.length, 1, 'annullare la sessione non cancella ciò che lo studente ha fatto');
});

test('senza electronAPI (iPad) end restituisce il record e non lancia', async () => {
    const api = global.window.electronAPI;
    global.window.electronAPI = undefined;
    try {
        BUS.begin('cloze', 'Cloze');
        BUS.record('n1', 'Clorofilla', 'cloze', { score: 1 });
        const rec = await BUS.end();
        assert.equal(rec.total, 1);
        assert.equal(scritti.length, 0);
    } finally { global.window.electronAPI = api; }
});
