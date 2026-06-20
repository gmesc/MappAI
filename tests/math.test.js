'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../public/js/mappai-math.js');

test('cosineSimilarity: vettori identici → 1', () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity: vettori ortogonali → 0', () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity: opposti → -1', () => {
    assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity: lunghezze diverse → 0', () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
});

test('cosineSimilarity: input vuoto/null → 0', () => {
    assert.equal(cosineSimilarity([], []), 0);
    assert.equal(cosineSimilarity(null, [1]), 0);
});

test('cosineSimilarity: vettore nullo (norma 0) → 0', () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});
