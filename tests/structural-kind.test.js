'use strict';
/*
 * structural-kind.test.js — UNA fonte per le righe strutturali (packet 0030).
 *
 * `MappAIBoilerplate.structuralKind(t)` dice quale delle quattro regole di
 * `isStructuralLine` vale: 'spazio' (A), 'stem' (B), 'riferimento' (C),
 * 'titolo' (D), '' se nessuna. `isStructuralLine` ne è il sì/no, e
 * `MappAIEvidenceCore.tipizza` legge il suo verdetto invece di ricopiarne le
 * regex (prima due erano copiate byte per byte in evidence-core: invariante 6).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const BP = require(path.join(__dirname, '..', 'public', 'js', 'mappai-boilerplate-core.js'));
const E = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));

const CASI = [
    // A) spazio risposta: soli puntini, trattini, underscore
    ['...................................................', 'spazio'],
    ['______________________________', 'spazio'],
    ['— — — — — — —', 'spazio'],
    // B) stem numerato di domanda/esercizio
    ['1) Durante le lezioni precedenti formula la tua ipotesi.', 'stem'],
    ['2. Riassumi schematicamente le ipotesi della classe.', 'stem'],
    ['1) La Svizzera commerciava con la Germania nazista.', 'stem'],
    // C) riferimento a documento/figura/tabella
    ['Doc. 1 Da cosa dipende il fatto di avere capelli lisci o ricci?', 'riferimento'],
    ['Documento 2 Spiega cosa sono gli alleli.', 'riferimento'],
    ['Fig. 1 Il circuito chiuso con la batteria e la lampadina.', 'riferimento'],
    ['Tabella 3 Le importazioni di carbone.', 'riferimento'],
    // D) titolo tutto maiuscolo e corto
    ['LA GUERRA FREDDA', 'titolo'],
    ['C IRCUITO IN SERIE', 'titolo'],
    // prosa: nessuna regola
    ["L'apparato radicale svolge funzioni di assorbimento idrico e minerale.", ''],
    ["E. coli è un batterio comune nell'intestino.", ''],
    ['Nel 2026. la situazione cambiò radicalmente ancora.', ''],
    ['Gli USA erano uno stato liberal-democratico.', ''],
    ['', ''],
];

test('structuralKind: il nome della regola che vale', () => {
    for (const [t, atteso] of CASI) assert.strictEqual(BP.structuralKind(t), atteso, `«${t}»`);
    assert.strictEqual(BP.structuralKind(null), '');
    assert.strictEqual(BP.structuralKind(undefined), '');
    assert.strictEqual(BP.structuralKind('   2. Con spazi davanti e dietro.   '), 'stem', 'la riga si legge senza spazi ai bordi');
});

test('isStructuralLine è il sì/no di structuralKind, su ogni caso', () => {
    for (const [t, atteso] of CASI) assert.strictEqual(BP.isStructuralLine(t), !!atteso, `«${t}»`);
});

test('l\'ordine delle regole: A prima di B prima di C prima di D', () => {
    // «10. DOC 1» è stem (B) anche se sembra un titolo maiuscolo (D)
    assert.strictEqual(BP.structuralKind('10. DOC 1'), 'stem');
    // «DOC. 1 IL CIRCUITO» è riferimento (C) prima che titolo (D)
    assert.strictEqual(BP.structuralKind('DOC. 1 IL CIRCUITO'), 'riferimento');
});

test('tipizza di evidence-core legge structuralKind: stem → domanda, spazio → consegna, riferimento e titolo → didascalia', () => {
    assert.strictEqual(E.tipizza('2. La Svizzera di fronte alla minaccia tedesca.').genere, 'domanda');
    assert.strictEqual(E.tipizza('..........').genere, 'consegna');
    assert.strictEqual(E.tipizza('Doc. 2 La lettera di Volta a Banks.').genere, 'didascalia');
    assert.strictEqual(E.tipizza('IL CIRCUITO ELETTRICO').genere, 'didascalia');
    for (const [t, kind] of CASI) {
        if (!t) continue;
        const g = E.tipizza(t).genere;
        if (kind === 'stem') assert.strictEqual(g, 'domanda', `«${t}»`);
        else if (kind === 'spazio') assert.strictEqual(g, 'consegna', `«${t}»`);
        else if (kind) assert.ok(['domanda', 'consegna', 'didascalia'].includes(g), `«${t}» → ${g}`);
        else assert.ok(!['didascalia'].includes(g), `prosa tipizzata didascalia: «${t}»`);
    }
});

test('invariante 6: le regex delle righe strutturali NON sono più copiate in evidence-core', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'), 'utf8');
    const bp = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-boilerplate-core.js'), 'utf8');
    const REGOLA_A = '/^[.·_…—–\\-\\s]{6,}$/';
    const REGOLA_B = '/^\\d{1,2}\\s*[\\).]\\s+\\S/';
    assert.ok(bp.includes(REGOLA_A) && bp.includes(REGOLA_B), 'le regole stanno in boilerplate-core (se cambiano, aggiornare qui)');
    assert.ok(!src.includes(REGOLA_A), 'regola A ricopiata in evidence-core');
    assert.ok(!src.includes(REGOLA_B), 'regola B ricopiata in evidence-core');
    assert.ok(/BP\.structuralKind\(/.test(src), 'evidence-core deve leggere structuralKind');
});
