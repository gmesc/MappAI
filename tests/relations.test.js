'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EDGE_FAMILIES, REL_FAMILY_MAP, getEdgeFamilyKey, getFamilyVerbs, getFamilyLabel, getFamilyDefaultRel, buildRelVocabularyBlock } = require('../public/js/mappai-relations.js');

test('EDGE_FAMILIES: 8 famiglie con i campi attesi', () => {
    const keys = Object.keys(EDGE_FAMILIES);
    assert.equal(keys.length, 8);
    for (const k of keys) {
        const fam = EDGE_FAMILIES[k];
        assert.ok(fam.color, `${k} ha color`);
        assert.ok(fam.label, `${k} ha label`);
        assert.ok(fam.icon, `${k} ha icon`);
        assert.ok(Array.isArray(fam.keywords), `${k} ha keywords[]`);
    }
});

test('getEdgeFamilyKey: mapping diretto dei verbi', () => {
    assert.equal(getEdgeFamilyKey('causa'), 'trasformazione');
    assert.equal(getEdgeFamilyKey('richiede'), 'dipendenza');
    assert.equal(getEdgeFamilyKey('precede'), 'sequenza');
    assert.equal(getEdgeFamilyKey('fa parte di'), 'appartenenza');
    assert.equal(getEdgeFamilyKey('si oppone a'), 'opposizione');
});

test('getEdgeFamilyKey: normalizza case e spazi', () => {
    assert.equal(getEdgeFamilyKey('  CAUSA  '), 'trasformazione');
});

test('getEdgeFamilyKey: vuoto/null → altro', () => {
    assert.equal(getEdgeFamilyKey(''), 'altro');
    assert.equal(getEdgeFamilyKey(null), 'altro');
});

test('getEdgeFamilyKey: verbo ignoto → altro', () => {
    assert.equal(getEdgeFamilyKey('zibaldone'), 'altro');
});

// ── Single source of truth: REL_FAMILY_MAP generata dai keywords ────────────

test('REL_FAMILY_MAP: classificazioni legacy preservate', () => {
    // il vecchio mapping hardcoded deve restare identico dopo la generazione
    const legacy = {
        'causa': 'trasformazione', 'provoca': 'trasformazione', 'produce': 'trasformazione',
        'genera': 'trasformazione', 'determina': 'trasformazione', 'trasforma in': 'trasformazione',
        'porta a': 'trasformazione', 'alimenta': 'trasformazione', 'catalizza': 'trasformazione',
        'richiede': 'dipendenza', 'dipende da': 'dipendenza', 'è condizione di': 'dipendenza',
        'utilizza': 'dipendenza', 'permette': 'dipendenza',
        'precede': 'sequenza', 'segue': 'sequenza', 'deriva da': 'sequenza',
        'fa parte di': 'appartenenza', 'comprende': 'appartenenza', 'contiene': 'appartenenza',
        'appartiene a': 'appartenenza', 'è esempio di': 'appartenenza',
        'rappresenta': 'appartenenza', 'coinvolge': 'appartenenza',
        'è regolato da': 'regolazione', 'regola': 'regolazione', 'governa': 'regolazione',
        'guida': 'regolazione', 'sostiene': 'regolazione', 'avviene in': 'regolazione',
        'si oppone a': 'opposizione', 'contrasta': 'opposizione', 'ostacola': 'opposizione',
        'è simile a': 'analogia', 'come': 'analogia', 'corrisponde a': 'analogia',
        'assomiglia a': 'analogia', 'paragonabile a': 'analogia', 'richiama': 'analogia'
    };
    for (const [verb, fam] of Object.entries(legacy)) {
        assert.equal(REL_FAMILY_MAP[verb], fam, `"${verb}" deve restare "${fam}"`);
    }
});

test('REL_FAMILY_MAP: i verbi nuovi dei prompt sono classificati', () => {
    assert.equal(getEdgeFamilyKey('smaschera'), 'opposizione');
    assert.equal(getEdgeFamilyKey('condanna'), 'opposizione');
    assert.equal(getEdgeFamilyKey('contraddice'), 'opposizione');
    assert.equal(getEdgeFamilyKey('influenza'), 'regolazione');
    assert.equal(getEdgeFamilyKey('finanzia'), 'regolazione');
    assert.equal(getEdgeFamilyKey('legittima'), 'regolazione');
    assert.equal(getEdgeFamilyKey('è conseguenza di'), 'trasformazione');
    assert.equal(getEdgeFamilyKey('evolve in'), 'sequenza');
    assert.equal(getEdgeFamilyKey('è formato da'), 'appartenenza');
    assert.equal(getEdgeFamilyKey('sfrutta'), 'dipendenza');
});

test("REL_FAMILY_MAP: 'include' resta fuori (default MM → famiglia altro)", () => {
    assert.equal(REL_FAMILY_MAP['include'], undefined);
    assert.equal(getEdgeFamilyKey('include'), 'altro');
});

test('getFamilyVerbs: verbi della famiglia, senza esclusi; altro → []', () => {
    assert.ok(getFamilyVerbs('opposizione').includes('smaschera'));
    assert.ok(!getFamilyVerbs('appartenenza').includes('include'));
    assert.ok(!getFamilyVerbs('analogia').includes('come'));
    assert.deepEqual(getFamilyVerbs('altro'), []);
    assert.deepEqual(getFamilyVerbs('famiglia-inesistente'), []);
});

test('buildRelVocabularyBlock flat: elenco quotato, senza generici né include', () => {
    const flat = buildRelVocabularyBlock('flat');
    assert.ok(flat.includes('"causa"'));
    assert.ok(flat.includes('"smaschera"'));
    assert.ok(flat.includes('"è condizione di"'));
    assert.ok(!flat.includes('"include"'));
    assert.ok(!flat.includes('correlato'));
    assert.ok(!flat.includes('associato'));
});

test('buildRelVocabularyBlock perFamily: una riga per famiglia (7, senza altro)', () => {
    const block = buildRelVocabularyBlock('perFamily');
    const lines = block.split('\n');
    assert.equal(lines.length, 7);
    assert.ok(lines.every(l => l.startsWith('- ')));
    assert.ok(block.includes('Causa / Effetto: causa'));
    assert.ok(!block.includes('Altro / Libero'));
});

// ── Bilinguismo (lingua mappe EN) ────────────────────────────────────────────

test('verbi inglesi classificati nella famiglia giusta', () => {
    assert.equal(getEdgeFamilyKey('causes'), 'trasformazione');
    assert.equal(getEdgeFamilyKey('requires'), 'dipendenza');
    assert.equal(getEdgeFamilyKey('precedes'), 'sequenza');
    assert.equal(getEdgeFamilyKey('is part of'), 'appartenenza');
    assert.equal(getEdgeFamilyKey('regulates'), 'regolazione');
    assert.equal(getEdgeFamilyKey('opposes'), 'opposizione');
    assert.equal(getEdgeFamilyKey('resembles'), 'analogia');
    assert.equal(getEdgeFamilyKey('exposes'), 'opposizione');
});

test("'includes' resta fuori dalla mappa come 'include'", () => {
    assert.equal(REL_FAMILY_MAP['includes'], undefined);
});

test('vocabolario EN: verbi inglesi, senza includes/like', () => {
    const flat = buildRelVocabularyBlock('flat', 'en');
    assert.ok(flat.includes('"causes"'));
    assert.ok(flat.includes('"exposes"'));
    assert.ok(!flat.includes('"includes"'));
    assert.ok(!flat.includes('"like"'));
    assert.ok(!flat.includes('"causa"'), 'niente verbi italiani nel blocco EN');
    const perFam = buildRelVocabularyBlock('perFamily', 'en');
    assert.ok(perFam.includes('Cause / Effect: causes'));
});

test('vocabolario IT invariato (default senza lang)', () => {
    assert.ok(buildRelVocabularyBlock('flat').includes('"causa"'));
    assert.ok(!buildRelVocabularyBlock('flat').includes('"causes"'));
});

test('getFamilyLabel e getFamilyDefaultRel bilingui', () => {
    assert.equal(getFamilyLabel('trasformazione', 'it'), 'Causa / Effetto');
    assert.equal(getFamilyLabel('trasformazione', 'en'), 'Cause / Effect');
    assert.equal(getFamilyDefaultRel('opposizione', 'it'), 'si oppone a');
    assert.equal(getFamilyDefaultRel('opposizione', 'en'), 'opposes');
    assert.equal(getFamilyVerbs('dipendenza', 'en')[0], 'requires');
});
