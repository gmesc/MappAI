'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EDGE_FAMILIES, getEdgeFamilyKey } = require('../public/js/mappai-relations.js');

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
