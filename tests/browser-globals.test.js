'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Simula l'ambiente browser: definisce window/document minimi, POI carica i 4
// moduli puri nell'ORDINE di index.html (prima di app.js). Valida che le UMD
// impostino gli alias globali e i namespace a cui app.js fa binding al load
// (es. `const EDGE_FAMILIES = window.MappAIRelations.EDGE_FAMILIES`).
// È la verifica del "wiring" che Electron non mostrerebbe in terminale.
global.window = {};
global.document = {};

require('../public/js/mappai-text-utils.js');
require('../public/js/mappai-json-salvage.js');
require('../public/js/mappai-math.js');
require('../public/js/mappai-relations.js');

test('wiring: alias globali impostati come nel browser', () => {
    assert.equal(typeof window.cleanLabel, 'function');
    assert.equal(typeof window.getLabelLines, 'function');
    assert.equal(typeof window.extractDateFromLabel, 'function');
    assert.equal(typeof window.salvageTruncatedJSON, 'function');
    assert.equal(typeof window.cosineSimilarity, 'function');
    assert.equal(typeof window.getEdgeFamilyKey, 'function');
});

test('wiring: namespace MappAI* presenti (i binding di app.js risolvono)', () => {
    assert.ok(window.MappAITextUtils, 'MappAITextUtils');
    assert.ok(window.MappAIJsonSalvage, 'MappAIJsonSalvage');
    assert.ok(window.MappAIMath, 'MappAIMath');
    assert.ok(window.MappAIRelations, 'MappAIRelations');
    // i 3 simboli che app.js binda al load
    assert.ok(window.MappAIRelations.EDGE_FAMILIES);
    assert.equal(Object.keys(window.MappAIRelations.EDGE_FAMILIES).length, 8);
    assert.ok(window.MappAIRelations.REL_FAMILY_MAP);
    assert.equal(typeof window.MappAIRelations.getEdgeFamilyKey, 'function');
});

test('wiring: le funzioni globali operano end-to-end', () => {
    assert.equal(window.cleanLabel('**Titolo**'), 'Titolo');
    assert.deepEqual(window.salvageTruncatedJSON('{"a":1'), { a: 1 });
    assert.equal(window.getEdgeFamilyKey('causa'), 'trasformazione');
    assert.equal(window.cosineSimilarity([1, 0], [1, 0]), 1);
});
