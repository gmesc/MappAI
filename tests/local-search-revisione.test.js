'use strict';
/*
 * Cercare nella fonte, con una REVISIONE docente aperta (mappai-local-search-core.js,
 * `snapshot({ review })`). Il core non si tocca: qui si fissa che cosa entra
 * nello snapshot mentre la revisione è in corso.
 *   · una proposta del giudice ancora da decidere NON è contenuto della mappa:
 *     la ricerca vede il testo di prima, non quello proposto;
 *   · una riscrittura del docente («manual») entra, ed è `teacher`, non `generated`;
 *   · una relazione causale in bozza è UN record (causa → nesso → effetto),
 *     non tre pezzi sparsi.
 * (Il contratto di base — fonti `original`, mappa `generated` — è in
 * local-search-core.test.js.)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const C = require(path.join(__dirname, '..', 'public/js/mappai-local-search-core.js'));
const RC = require(path.join(__dirname, '..', 'public/js/mappai-review-core.js'));

const PRIMA = 'La batteria si scalda quando la resistenza e troppo bassa.';
const PROPOSTA = 'La batteria si scalda perche il cortocircuito annulla la resistenza del carico.';
const DEL_DOCENTE = 'La batteria si scalda: la corrente di cortocircuito attraversa la resistenza interna.';

const stato = () => ({
    sources: [{ id: 'src-1', title: 'Elettricita.pdf', pdfHash: 'h1', pages: [{ n: 4, text: 'Un circuito e chiuso quando la corrente torna al generatore.' }] }],
    db: { nodes: [{ id: 'n1', label: 'Corto circuito', desc: PRIMA }], links: [] }
});

// Una revisione vera, costruita sulla stessa mappa e le stesse fonti dello snapshot.
function revisione(s) {
    return RC.createReview({
        db: s.db, sources: s.sources, checkStatus: 'completed',
        report: { issues: [{ id: 'i-desc', target: { kind: 'node', id: 'n1', field: 'desc' }, after: PROPOSTA, problem: 'causa imprecisa' }] }
    });
}
const record = (snap, id) => snap.records.filter(r => r.recordId === id);

test('decisione pending: la proposta resta FUORI, la ricerca vede il testo di prima', () => {
    const s = stato();
    const snap = C.snapshot({ ...s, review: revisione(s) });
    const [desc] = record(snap, 'node:n1:desc');
    assert.equal(desc.text, PRIMA);
    assert.equal(desc.origin, 'generated', 'nessuno ha deciso: non è del docente');
    assert.deepEqual(desc.decisions, [{ issueId: 'i-desc', choice: 'pending' }], 'ma la domanda aperta si vede');
    assert.ok(!snap.records.some(r => r.text.includes('cortocircuito annulla')), 'il testo proposto non è in nessun record');
    assert.ok(!snap.diagnostics.some(d => d.code === 'map_conflicting_decisions'));
});

test('decisione manual: entra la riscrittura del docente, con origin teacher', () => {
    const s = stato();
    const review = RC.setDecision(revisione(s), 'i-desc', 'manual', { text: DEL_DOCENTE });
    const snap = C.snapshot({ ...s, review });
    const [desc] = record(snap, 'node:n1:desc');
    assert.equal(desc.text, DEL_DOCENTE);
    assert.equal(desc.origin, 'teacher');
    assert.deepEqual(desc.decisions, [{ issueId: 'i-desc', choice: 'manual' }]);
    const [etichetta] = record(snap, 'node:n1:label');
    assert.equal(etichetta.origin, 'generated', 'la decisione era sulla desc: l\'etichetta resta generata');
    assert.ok(!snap.records.some(r => r.text === PRIMA || r.text.includes('cortocircuito annulla')),
        'né il testo di prima né la proposta scartata');
});

test('bozza causale: una relazione è UN record, causa → nesso → effetto', () => {
    const s = stato();
    const review = { drafts: { E: { chains: { rootItems: [
        { cause: 'La resistenza e troppo bassa', effect: 'la batteria si scalda', conn: 'quindi' }
    ] } } } };
    const snap = C.snapshot({ ...s, review });
    const causali = snap.records.filter(r => r.itemId === 'causal-root-0');
    assert.equal(causali.length, 1, JSON.stringify(causali));
    assert.equal(causali[0].recordId, 'item:causal-root-0:relation');
    assert.equal(causali[0].role, 'relation');
    assert.equal(causali[0].kind, 'causal');
    assert.equal(causali[0].origin, 'generated');
    assert.equal(causali[0].text, 'La resistenza e troppo bassa → quindi → la batteria si scalda');
});
