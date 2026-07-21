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

// ── FIXTURE REALE: la coppia "dal papiro alla paper" (prima) vs "copia" (dopo) ─
// Vive fuori dal repo (cartella Documents dell'utente): se manca, skip.
const fs = require('fs');
const path = require('path');
const VAULT_BASE = '/Users/giacomomeschini/Documents/MappAI - file/Mappe/2A';
const ORIG = path.join(VAULT_BASE, 'dal papiro alla paper');
const COPIA = path.join(VAULT_BASE, 'dal papiro alla paper copia');

function loadVault(dir) {
    const nodes = [];
    for (const f of fs.readdirSync(path.join(dir, 'Nodi'))) {
        if (!f.endsWith('.md')) continue;
        const raw = fs.readFileSync(path.join(dir, 'Nodi', f), 'utf8');
        const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); if (!m) continue;
        const fm = {}; m[1].split('\n').forEach(l => { const mm = l.match(/^(\w+):\s*"?([^"]*)"?\s*$/); if (mm) fm[mm[1]] = mm[2]; });
        nodes.push({ id: fm.id, label: fm.label, level: +fm.level, group: +fm.group, desc: m[2].replace(/^#[^\n]*\n/, '').trim() });
    }
    const links = JSON.parse(fs.readFileSync(path.join(dir, 'links.json'), 'utf8'));
    return { nodes, links };
}

test('diffMaps FIXTURE reale: ricostruisce le correzioni della coppia papiro/copia', { skip: !fs.existsSync(COPIA) }, () => {
    const before = loadVault(ORIG), after = loadVault(COPIA);
    const log = CC.diffMaps(before, after, { map: 'dal papiro alla paper' });
    const s = CC.summarize(log);
    // sanity: deve trovare eliminazioni, almeno una fusione, la promozione a L1, retype relazioni
    assert.ok((s.byOp['delete'] || 0) + (s.byOp['merge'] || 0) >= 7, `attesi ≥7 delete+merge, avuti ${(s.byOp['delete'] || 0)}+${(s.byOp['merge'] || 0)}`);
    assert.ok(s.byOp['promote-l1'] >= 1, 'promozione a macro-area rilevata (Materia Prima → Carta Preindustriale)');
    assert.ok((s.byOp['add-rel'] || 0) + (s.byOp['retype-rel'] || 0) >= 5, 'retyping/aggiunta relazioni di processo rilevato');
    // i 3 orfani-materiali eliminati devono comparire
    const del = log.ops.filter(o => o.op === 'delete').map(o => o.target);
    ['L1_1_L4_B1A', 'L1_1_L4_B1B'].forEach(id =>
        assert.ok(del.includes(id) || log.ops.some(o => o.op === 'merge' && o.target === id), `orfano ${id} gestito`));
});
