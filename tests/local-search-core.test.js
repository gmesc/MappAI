'use strict';
/*
 * Cercare nella fonte — il core, su `main` (15/9/2026).
 *
 * Versione senza Python e senza modelli: `snapshot()` trasforma lo stato
 * dell'app in record con la loro PROVENIENZA, `lexical()` li ordina con BM25.
 * Qui si prova il contratto che regge il pannello:
 *   · le fonti e i materiali generati non si mescolano — è la separazione su cui
 *     poggia tutto («un materiale generato non può provare se stesso»);
 *   · ogni risultato sa da dove viene, o il docente non può controllarlo;
 *   · una ricerca senza risultati è una lista vuota, non un verdetto.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const C = require(path.join(__dirname, '..', 'public/js/mappai-local-search-core.js'));

const FONTE = [
    'Un circuito e chiuso quando la corrente puo percorrere tutto il tragitto dal ' +
    'generatore al ricevitore e tornare indietro senza interruzioni.',
    'Puo anche capitare che un circuito sia perfettamente chiuso e collegato a dovere, ' +
    'e tuttavia la batteria cominci a riscaldarsi in modo anomalo.',
    'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.',
].join(' ');

const statoBase = () => ({
    sources: [{ id: 'src-1', title: 'Elettricita.pdf', pages: [{ n: 4, text: FONTE }] }],
    db: {
        nodes: [{ id: 'n1', label: 'Corto circuito', desc: 'La batteria si scalda quando la resistenza e troppo bassa.' }],
        links: [],
    },
});

test('snapshot: le fonti diventano record `original` con titolo e pagina', () => {
    const s = C.snapshot(statoBase());
    const fonti = s.records.filter(r => r.origin === 'original');
    assert.ok(fonti.length, 'nessun record dalla fonte');
    assert.strictEqual(fonti[0].title, 'Elettricita.pdf');
    assert.strictEqual(fonti[0].page, 4);
    assert.ok(fonti[0].sourceRevision, 'senza revisione non si sa se il testo e cambiato');
});

test('snapshot: la mappa diventa record `generated`, non `original`', () => {
    const s = C.snapshot(statoBase());
    const nodo = s.records.filter(r => r.nodeId === 'n1');
    assert.ok(nodo.length, 'il nodo non e entrato nello snapshot');
    for (const r of nodo) assert.strictEqual(r.origin, 'generated');
});

test('snapshot: senza fonti lo DICE invece di tacere', () => {
    const s = C.snapshot({ ...statoBase(), sources: [] });
    assert.ok(s.diagnostics.some(d => d.code === 'no_source_text'));
});

test('lexical evidence: trova il passaggio e NON pesca fra i generati', () => {
    const s = C.snapshot(statoBase());
    const hits = C.lexical(s.records, 'la batteria si scalda anche a circuito chiuso?', 'evidence');
    assert.ok(hits.length, 'nessun passaggio trovato');
    assert.match(hits[0].text, /batteria cominci a riscaldarsi/, 'in cima deve esserci la frase che risponde');
    for (const h of hits) assert.ok(['original', 'reference'].includes(h.origin),
        `un ${h.origin} non puo comparire fra le PROVE: un materiale generato non prova se stesso`);
});

test('lexical occurrences: guarda i materiali, non le fonti', () => {
    const s = C.snapshot(statoBase());
    const hits = C.lexical(s.records, 'corto circuito batteria', 'occurrences');
    assert.ok(hits.length, 'nessuna occorrenza');
    for (const h of hits) assert.ok(['generated', 'teacher'].includes(h.origin), `origine inattesa: ${h.origin}`);
});

test('lexical: ogni risultato porta la sua provenienza, o non e controllabile', () => {
    const s = C.snapshot(statoBase());
    for (const h of C.lexical(s.records, 'ohm resistenza conduttore', 'evidence')) {
        assert.ok(h.recordId && h.origin && h.title, 'risultato senza provenienza');
        assert.ok(FONTE.includes(h.text.slice(0, 40)), 'il testo deve venire dalla fonte, non essere ricomposto');
    }
});

test('lexical: «nessun risultato» e una lista vuota, non un verdetto', () => {
    const s = C.snapshot(statoBase());
    assert.deepStrictEqual(C.lexical(s.records, 'fotosintesi clorofilliana', 'evidence'), []);
    assert.deepStrictEqual(C.lexical(s.records, '', 'evidence'), []);
    assert.deepStrictEqual(C.lexical([], 'circuito', 'evidence'), []);
});

test('lexical: unita e simboli sopravvivono (12 ohm, Ω)', () => {
    const s = C.snapshot(statoBase());
    for (const q of ['ohm', 'Ω']) {
        const hits = C.lexical(s.records, q, 'evidence');
        assert.ok(hits.length, `«${q}» non trova niente`);
        assert.match(hits[0].text, /ohm/);
    }
});
