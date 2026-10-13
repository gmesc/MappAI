'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CC = require('../public/js/mappai-correction-core.js');

// ── unit: tassonomia, recordOp, summarize, serialize ─────────────────────────
test('opReasons/isValidReason: tassonomia coerente', () => {
    assert.ok(CC.opReasons('delete').includes('paraphrase'));
    assert.ok(CC.isValidReason('merge', 'duplicate'));
    assert.ok(!CC.isValidReason('merge', 'paraphrase'));
    assert.strictEqual(CC.opReasons('sconosciuta').length, 0);
});

test('recordOp: default reason + validazione + note custom', () => {
    const log = CC.newLog({ map: 'X' });
    const r = CC.recordOp(log, { op: 'delete', target: 'N1' });
    assert.strictEqual(r.reason, 'paraphrase');           // primo motivo = default
    assert.strictEqual(log.ops.length, 1);
    const r2 = CC.recordOp(log, { op: 'delete', target: 'N2', reason: 'inventato', note: 'boh' });
    assert.strictEqual(r2.reasonCustom, true);            // motivo fuori tassonomia → marcato, non scartato
    assert.throws(() => CC.recordOp(log, { op: 'nonexiste' }));
});

test('summarize: conta per op, per motivo, inferite', () => {
    const log = CC.newLog();
    CC.recordOp(log, { op: 'delete', target: 'A', reason: 'orphan', inferred: true });
    CC.recordOp(log, { op: 'delete', target: 'B', reason: 'orphan', inferred: true });
    CC.recordOp(log, { op: 'merge', target: 'C', into: 'D', reason: 'duplicate' });
    const s = CC.summarize(log);
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.byOp['delete'], 2);
    assert.strictEqual(s.byReason['delete:orphan'], 2);
    assert.strictEqual(s.inferred, 2);
});

test('serialize/parse: roundtrip + rifiuto manifest errato', () => {
    const log = CC.newLog({ map: 'Y' });
    CC.recordOp(log, { op: 'rename', target: 'N', before: { label: 'a' }, after: { label: 'b' } });
    const back = CC.parse(CC.serialize(log));
    assert.strictEqual(back.ops[0].op, 'rename');
    assert.throws(() => CC.parse(JSON.stringify({ manifest: 'altro', ops: [] })));
});

// ── diffMaps su grafi sintetici ──────────────────────────────────────────────
test('diffMaps: rileva delete-orfano, merge, promote-l1, retype sequenza', () => {
    const before = {
        nodes: [
            { id: 'ROOT', label: 'R', level: 0 },
            { id: 'L1_0', label: 'Ramo', level: 1, group: 1, desc: 'ramo tema' },
            { id: 'L1_0_L2_A', label: 'Padre', level: 2, group: 1, desc: 'il papiro si taglia in strisce sottili e si incrocia' },
            { id: 'ORF', label: 'Orfano', level: 3, group: 1, desc: 'nodo senza genitore nel tema abside colonna' },
            { id: 'DUP', label: 'Copia Papiro', level: 3, group: 1, desc: 'il papiro si taglia in strisce sottili e si incrocia come tessuto' }
        ],
        links: [
            { source: 'ROOT', target: 'L1_0', rel: 'include' },
            { source: 'L1_0', target: 'L1_0_L2_A', rel: 'include' },
            { source: 'L1_0_L2_A', target: 'DUP', rel: 'approfondisce' },
            { source: 'L1_0_L2_A', target: 'ORF2', rel: 'include' }  // link verso nodo assente: ininfluente
        ]
    };
    const after = {
        nodes: [
            { id: 'ROOT', label: 'R', level: 0 },
            { id: 'L1_0', label: 'Ramo', level: 1, group: 1, desc: 'ramo tema' },
            { id: 'L1_0_L2_A', label: 'Padre', level: 1, group: 3, desc: 'il papiro si taglia in strisce sottili e si incrocia' }
        ],
        links: [
            { source: 'ROOT', target: 'L1_0', rel: 'include' },
            { source: 'ROOT', target: 'L1_0_L2_A', rel: 'include' }
        ]
    };
    const log = CC.diffMaps(before, after, { map: 'test' });
    const ops = log.ops;
    const byOp = CC.summarize(log).byOp;
    // ORF: eliminato come orfano (nessun link entrante nel before)
    assert.ok(ops.some(o => o.op === 'delete' && o.target === 'ORF' && o.reason === 'orphan'), 'orfano eliminato');
    // DUP: la sua desc è quasi identica al Padre superstite → merge
    assert.ok(ops.some(o => o.op === 'merge' && o.target === 'DUP' && o.into === 'L1_0_L2_A'), 'dup fuso nel padre');
    // Padre promosso a L1 (level 2→1)
    assert.ok(ops.some(o => o.op === 'promote-l1' && o.target === 'L1_0_L2_A'), 'promozione L1');
    assert.ok(log.ops.every(o => o.inferred), 'tutte inferite');
});

test('diffMaps: retype relazione generica → sequenza e cross→gerarchia', () => {
    const before = {
        nodes: [{ id: 'A', label: 'A', level: 1, group: 1 }, { id: 'B', label: 'B', level: 1, group: 1 }],
        links: [{ source: 'A', target: 'B', rel: 'correlato a', isCross: true }]
    };
    const after = {
        nodes: [{ id: 'A', label: 'A', level: 1, group: 1 }, { id: 'B', label: 'B', level: 1, group: 1 }],
        links: [{ source: 'A', target: 'B', rel: 'è seguito da', isCross: false }]
    };
    const log = CC.diffMaps(before, after);
    const r = log.ops.find(o => o.op === 'retype-rel');
    assert.ok(r, 'retype rilevato');
    assert.strictEqual(r.reason, 'cross-to-hierarchy');   // isCross:true→false ha priorità
    assert.strictEqual(r.after.rel, 'è seguito da');
});

// ── FIXTURE SINTETICA: una coppia prima/dopo per operazione ──────────────────
// Prima qui c'era la coppia VERA «dal papiro alla paper» / «… copia», letta da
// ~/Documents: le due cartelle non esistono più e il test era sempre saltato,
// cioè non provava niente. Ora ogni correzione del docente è una coppia minima
// scritta qui, e si guarda che diffMaps la ricostruisca con il suo motivo.
const PAPIRO = 'Il papiro si ricava dal fusto della pianta palustre, tagliato in strisce sottili e incrociate.';
const mappaBase = () => ({
    nodes: [
        { id: 'ROOT', label: 'Dal papiro alla carta', level: 0 },
        { id: 'L1_0', label: 'Materiali', level: 1, group: 1, desc: 'I supporti della scrittura antica.' },
        { id: 'L1_0_L2_A', label: 'Papiro', level: 2, group: 1, desc: PAPIRO },
        { id: 'L1_1', label: 'Lavorazione', level: 1, group: 2, desc: 'Come si produce il foglio.' },
        { id: 'L1_1_L2_B', label: 'Pergamena', level: 2, group: 2, desc: 'La pergamena si ottiene dalla pelle di animale conciata e raschiata.' }
    ],
    links: [
        { source: 'ROOT', target: 'L1_0', rel: 'include' },
        { source: 'ROOT', target: 'L1_1', rel: 'include' },
        { source: 'L1_0', target: 'L1_0_L2_A', rel: 'include' },
        { source: 'L1_1', target: 'L1_1_L2_B', rel: 'include' }
    ]
});
// Due copie indipendenti della mappa base; `ritocca(prima, dopo)` fa la correzione.
function coppia(ritocca) {
    const prima = mappaBase(), dopo = mappaBase();
    ritocca(prima, dopo);
    return CC.diffMaps(prima, dopo, { map: 'fixture' }).ops;
}
const nodo = (m, id) => m.nodes.find(n => n.id === id);

test('diffMaps FIXTURE add-node: il concetto mancante aggiunto sotto il suo ramo', () => {
    const ops = coppia((prima, dopo) => {
        dopo.nodes.push({ id: 'L1_0_L2_C', label: 'Tavolette di cera', level: 2, group: 1, desc: 'Legno spalmato di cera, inciso con lo stilo.' });
        dopo.links.push({ source: 'L1_0', target: 'L1_0_L2_C', rel: 'include' });
    });
    assert.strictEqual(ops.length, 1, 'il link verso il nodo nuovo è implicito nell\'aggiunta: ' + JSON.stringify(ops));
    assert.strictEqual(ops[0].op, 'add-node');
    assert.strictEqual(ops[0].target, 'L1_0_L2_C');
    assert.strictEqual(ops[0].reason, 'missing-concept');
    assert.deepStrictEqual(ops[0].after, { label: 'Tavolette di cera', level: 2, group: 1, parent: 'L1_0' });
});

test('diffMaps FIXTURE move: la pergamena spostata nel ramo giusto', () => {
    const ops = coppia((prima, dopo) => {
        nodo(dopo, 'L1_1_L2_B').group = 1;
        dopo.links = dopo.links.filter(l => l.target !== 'L1_1_L2_B');
        dopo.links.push({ source: 'L1_0', target: 'L1_1_L2_B', rel: 'include' });
    });
    // Lo spostamento è UNA correzione: gli archi d'albero vecchio e nuovo ne sono la conseguenza,
    // non una relazione tolta e una aggiunta (25/9: prima comparivano anche remove-rel e add-rel 'causal').
    assert.strictEqual(ops.length, 1, JSON.stringify(ops));
    const m = ops[0];
    assert.strictEqual(m.op, 'move');
    assert.strictEqual(m.target, 'L1_1_L2_B');
    assert.strictEqual(m.into, 'L1_0');
    assert.strictEqual(m.reason, 'wrong-branch', 'cambia il gruppo: è il ramo a essere sbagliato, non solo il genitore');
    assert.deepStrictEqual(m.before, { parent: 'L1_1', level: 2, group: 2 });
    assert.deepStrictEqual(m.after, { parent: 'L1_0', level: 2, group: 1 });
});

test('diffMaps FIXTURE relazioni vere: un cross-link aggiunto o tolto fra nodi rimasti al loro posto conta ancora', () => {
    const aggiunta = coppia((prima, dopo) => {
        dopo.links.push({ source: 'L1_0_L2_A', target: 'L1_1_L2_B', rel: 'precede', isCross: true });
    });
    assert.deepStrictEqual(aggiunta.map(o => [o.op, o.reason]), [['add-rel', 'sequence']]);
    const tolta = coppia((prima, dopo) => {
        prima.links.push({ source: 'L1_0_L2_A', target: 'L1_1_L2_B', rel: 'causa', isCross: true });
    });
    assert.deepStrictEqual(tolta.map(o => o.op), ['remove-rel']);
});

test('diffMaps FIXTURE rename: etichetta più chiara, nient\'altro', () => {
    const ops = coppia((prima, dopo) => { nodo(dopo, 'L1_0_L2_A').label = 'Papiro egiziano'; });
    assert.strictEqual(ops.length, 1, JSON.stringify(ops));
    assert.strictEqual(ops[0].op, 'rename');
    assert.strictEqual(ops[0].target, 'L1_0_L2_A');
    assert.strictEqual(ops[0].reason, 'clearer-label');
    assert.deepStrictEqual(ops[0].before, { label: 'Papiro' });
    assert.deepStrictEqual(ops[0].after, { label: 'Papiro egiziano' });
});

test('diffMaps FIXTURE edit-desc: tolta la frase fuori tema, la desc si accorcia', () => {
    const ops = coppia((prima) => {
        nodo(prima, 'L1_0_L2_A').desc = PAPIRO + ' Anche il riso si coltiva nelle risaie allagate della pianura padana.';
    });
    assert.strictEqual(ops.length, 1, JSON.stringify(ops));
    assert.strictEqual(ops[0].op, 'edit-desc');
    assert.strictEqual(ops[0].target, 'L1_0_L2_A');
    assert.strictEqual(ops[0].reason, 'remove-offtopic');
    assert.strictEqual(ops[0].after.descLen, PAPIRO.length);
    assert.ok(ops[0].before.descLen > ops[0].after.descLen);
});

test('diffMaps FIXTURE merge: il doppione sparito è fuso nel nodo che ne conteneva il testo', () => {
    const ops = coppia((prima) => {
        prima.nodes.push({ id: 'L1_0_L3_DUP', label: 'Foglio di papiro', level: 3, group: 1,
            desc: 'Il papiro si ricava dal fusto della pianta palustre, tagliato in strisce sottili.' });
        prima.links.push({ source: 'L1_0_L2_A', target: 'L1_0_L3_DUP', rel: 'approfondisce' });
    });
    assert.strictEqual(ops.length, 1, 'il link verso il doppione sparisce con lui: ' + JSON.stringify(ops));
    assert.strictEqual(ops[0].op, 'merge', 'non un delete: il testo è ancora nella mappa');
    assert.strictEqual(ops[0].target, 'L1_0_L3_DUP');
    assert.strictEqual(ops[0].into, 'L1_0_L2_A');
    assert.strictEqual(ops[0].reason, 'duplicate');
    assert.deepStrictEqual(ops[0].after, { into: 'L1_0_L2_A', intoLabel: 'Papiro' });
});

test('diffMaps FIXTURE: togliere l\'unico arco d\'albero di un nodo è una relazione tolta, non solo uno spostamento', () => {
    const ops = coppia((prima, dopo) => { dopo.links = dopo.links.filter(l => l.target !== 'L1_1_L2_B'); });
    assert.deepStrictEqual(ops.map(o => o.op).sort(), ['move', 'remove-rel']);
});
