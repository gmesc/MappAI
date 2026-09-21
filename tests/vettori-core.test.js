'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const V = require('../public/js/mappai-vettori-core');
const { cosineSimilarity } = require('../public/js/mappai-math');
const NS = V.namespace({ provider: 'infomaniak', model: 'embedding-v1' });
const filled = () => V.update(V.create(NS), ['A', 'B'], [[1, 2], [3, 4]], 'embedding-v1', 10);
const roundtrip = cache => V.deserialize(V.serialize(cache).text, cache.namespace).cache;

test('namespace pubblico canonico: ordine parametri irrilevante, credenziali escluse e input separato', () => {
  const options = { provider: ' Infomaniak ', model: ' embedding-v1 ', apiKey: 'private-key', productId: 'private-product',
    parameters: { z: 3, nested: { b: 2, a: [true, null, 'x'] } } };
  const ns = V.namespace(options);
  assert.deepEqual(ns, { provider: 'infomaniak', model: 'embedding-v1', preprocessing: 'raw@1',
    parameters: { nested: { a: [true, null, 'x'], b: 2 }, z: 3 } });
  assert.equal(JSON.stringify(ns), JSON.stringify(V.namespace({ provider: 'infomaniak', model: 'embedding-v1',
    parameters: { nested: { a: [true, null, 'x'], b: 2 }, z: 3 } })));
  const cache = V.create(ns);
  options.parameters.nested.a[0] = false;
  ns.parameters.nested.a[1] = 'changed';
  assert.deepEqual(cache.namespace.parameters.nested.a, [true, null, 'x']);
  assert.doesNotMatch(JSON.stringify(cache), /private-key|private-product|apiKey|productId/);
  assert.throws(() => V.namespace({ provider: 'google' }), /vettori_invalid_identity/);
  for (const parameters of [[], { token: 'secret' }, { nested: { productId: 'secret' } }, { n: NaN }, { n: -0 }, { x: undefined }]) {
    assert.throws(() => V.namespace({ ...NS, parameters }), /vettori_/);
  }
  const circular = {}; circular.circular = circular;
  assert.throws(() => V.namespace({ ...NS, parameters: circular }), /vettori_invalid_parameters/);
});

test('round-trip conserva esattamente numeri, ordine e testo, inclusi zero e Unicode non normalizzato', () => {
  const texts = [' È elettrico\n', 'e\u0301', 'é', '😀', ''];
  const vectors = [[0, Number.MIN_VALUE], [Number.MAX_VALUE, -Number.MAX_VALUE], [Math.PI, 1 / 3], [1e-100, 1e100], [0, 0]];
  const cache = V.update(V.create(NS), texts, vectors, 'embedding-v1', 12);
  const serialized = V.serialize(cache);
  assert.equal(serialized.bytes, Buffer.byteLength(serialized.text, 'utf8'));
  assert.deepEqual(V.deserialize(serialized.text, NS), { cache, reason: null });
  texts.forEach((text, i) => assert.deepEqual(V.lookup(roundtrip(cache), text), vectors[i]));
  assert.equal(V.lookup(cache, 'È elettrico'), null);
  assert.equal(V.lookup(cache, 'missing'), null);
});

test('coseno reale identico prima/dopo il disco, anche sui due lati della soglia dei consumatori', () => {
  const threshold = 0.85;
  const vectors = [[1, 0], [0, 0], ...[-1e-12, 1e-12].map(delta => {
    const x = threshold + delta; return [x, Math.sqrt(1 - x * x)];
  })];
  const texts = ['reference', 'zero', 'below', 'above'];
  const saved = roundtrip(V.update(V.create(NS), texts, vectors, NS.model, 1));
  const reread = texts.map(text => V.lookup(saved, text));
  assert.deepEqual(reread, vectors);
  for (let i = 0; i < vectors.length; i++) for (let j = 0; j < vectors.length; j++) {
    assert.equal(cosineSimilarity(vectors[i], vectors[j]), cosineSimilarity(reread[i], reread[j]));
  }
  assert.equal(cosineSimilarity(reread[0], reread[1]), 0);
  assert.ok(cosineSimilarity(reread[0], reread[2]) < threshold);
  assert.ok(cosineSimilarity(reread[0], reread[3]) >= threshold);
});

test('batch parziali, sparsi, vuoti o non finiti sono rifiutati senza modificare la cache', () => {
  assert.equal(V.validateBatch([], 0), 0);
  assert.equal(V.validateBatch([[0, -0]], 1), 2);
  const cache = filled(), before = JSON.stringify(cache);
  for (const vectors of [[[1]], [[1], [1, 2]], [[1], []], [[NaN], [0]], [[Infinity], [0]], [['1'], [0]], new Array(2), [new Array(1), [1]]]) {
    assert.throws(() => V.update(cache, ['A', 'B'], vectors, NS.model, 20), /vettori_/);
    assert.equal(JSON.stringify(cache), before);
  }
  assert.throws(() => V.update(cache, new Array(2), [[1, 2], [3, 4]], NS.model, 20), /vettori_invalid_update/);
  assert.throws(() => V.validateBatch([[1]], -1), /vettori_invalid_batch_count/);
});

test('-0 resta una risposta valida ma non viene conservato o convertito in zero', () => {
  const vectors = [[1, -0], [0, 0]];
  const cache = V.update(filled(), ['A', 'zero'], vectors, NS.model, 20);
  assert.equal(Object.is(vectors[0][1], -0), true);
  assert.equal(V.lookup(cache, 'A'), null, 'una vecchia riga non rimane al posto del risultato nuovo non persistibile');
  assert.deepEqual(V.lookup(roundtrip(cache), 'zero'), [0, 0]);
  assert.deepEqual(V.lookup(cache, 'B'), [3, 4]);
});

test('update, lookup e serializzazione non condividono vettori o metadati con ingressi/risultati', () => {
  const input = [[1, 2]], ns = V.namespace({ ...NS, parameters: { task: ['document'] } });
  const first = V.update(V.create(ns), ['A'], input, NS.model, 1);
  const second = V.update(first, ['B'], [[3, 4]], NS.model, 2);
  const serialized = V.serialize(second);
  input[0][0] = 100;
  V.lookup(first, 'A')[0] = 200;
  serialized.cache.entries[0].vector[0] = 300;
  second.entries[0].vector[1] = 400;
  second.namespace.parameters.task[0] = 'changed';
  assert.deepEqual(V.lookup(first, 'A'), [1, 2]);
  assert.deepEqual(first.namespace.parameters.task, ['document']);
  assert.deepEqual(V.lookup(V.deserialize(serialized.text, ns).cache, 'A'), [1, 2]);
});

test('stesso testo una sola riga; cambio modello effettivo o dimensioni non mescola spazi', () => {
  const cache = V.update(filled(), ['A', 'A'], [[5, 6], [5, 6]], NS.model, 30);
  assert.equal(cache.entries.length, 2);
  assert.deepEqual(V.lookup(cache, 'A'), [5, 6]);
  assert.equal(cache.entries.find(entry => entry.text === 'A').lastUsed, 30);
  assert.throws(() => V.update(cache, ['C'], [[1, 2]], 'different-actual-model', 31), /vettori_space_mismatch/);
  assert.throws(() => V.update(cache, ['C'], [[1, 2, 3]], NS.model, 31), /vettori_space_mismatch/);
  assert.deepEqual(V.update(cache, [], [], null, 31), cache);
});

test('namespace differenti invalidano la cache salvata senza chiamare il provider', () => {
  const text = V.serialize(filled()).text;
  for (const changes of [{ provider: 'google' }, { model: 'v2' }, { preprocessing: 'raw@2' }, { parameters: { dimensions: 1024 } }]) {
    const ns = V.namespace({ ...NS, ...changes });
    assert.deepEqual(V.deserialize(text, ns), { cache: V.create(ns), reason: 'namespace_mismatch' });
  }
});

test('JSON mancante/corrotto e ogni metadato o riga invalida ripartono vuoti, senza contenuto negli errori', () => {
  for (const text of [null, undefined, '']) assert.deepEqual(V.deserialize(text, NS), { cache: V.create(NS), reason: 'missing' });
  const bad = [false, 12, [], {}, '"secret"', '{bad', 'null', '[]', '1'];
  const edits = [
    cache => { cache.schema = 'other'; },
    cache => { cache.apiKey = 'secret'; },
    cache => { cache.namespace.productId = 'secret'; },
    cache => { cache.namespace.parameters = { credentials: 'secret' }; },
    cache => { cache.actualModel = null; },
    cache => { cache.dimensions = 0; },
    cache => { cache.dimensions = 2.5; },
    cache => { cache.entries[0].key = 'different'; },
    cache => { cache.entries[0].text = 1; },
    cache => { cache.entries[0].vector = [1]; },
    cache => { cache.entries[0].vector = [1, null]; },
    cache => { cache.entries[0].lastUsed = -1; },
    cache => { cache.entries[0].lastUsed = '1'; },
    cache => { cache.entries.push(cache.entries[0]); },
    cache => { cache.entries[0].extra = 'secret'; }
  ];
  edits.forEach(edit => { const cache = filled(); edit(cache); bad.push(JSON.stringify(cache)); });
  for (const text of bad) assert.deepEqual(V.deserialize(text, NS), { cache: V.create(NS), reason: 'invalid_cache' });
  const negativeZero = V.serialize(filled()).text.replace('"vector":[1,2]', '"vector":[1,-0]');
  assert.equal(V.deserialize(negativeZero, NS).reason, 'invalid_cache');
  assert.equal(V.deserialize(' '.repeat(V.TETTO_BYTE + 1), NS).reason, 'invalid_cache');
});

test('collisione di hash: lookup controlla testo e impronta, entrambe le righe sopravvivono al disco', () => {
  const context = { TextEncoder, MappAIReviewCore: { revision: () => 'same-hash' } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/mappai-vettori-core'), 'utf8'), context);
  const core = context.MappAIVettoriCore;
  const cache = core.update(core.create(NS), ['first', 'second'], [[1], [2]], NS.model, 1);
  const reread = core.deserialize(core.serialize(cache).text, NS).cache;
  assert.equal(reread.entries.length, 2);
  assert.equal(core.lookup(reread, 'first')[0], 1);
  assert.equal(core.lookup(reread, 'second')[0], 2);
  assert.equal(core.lookup(reread, 'third'), null);
});

test('potatura LRU conta JSON completo e UTF-8, conserva i recenti e non muta l ingresso', () => {
  let cache = V.update(V.create(NS), ['vecchio😀', 'medioè', 'recente漢'], [[1], [2], [3]], NS.model, 10);
  cache = V.update(cache, ['vecchio😀'], [[1]], NS.model, 20);
  const before = JSON.stringify(cache);
  const expected = { ...cache, entries: cache.entries.filter(entry => entry.text !== 'medioè') };
  const budget = Buffer.byteLength(JSON.stringify(expected));
  const result = V.serialize(cache, budget);
  assert.equal(result.bytes, budget);
  assert.equal(result.bytes, Buffer.byteLength(result.text));
  assert.ok(result.bytes > result.text.length, 'la prova include davvero caratteri multibyte');
  assert.equal(result.evicted, 1);
  assert.deepEqual(result.cache.entries.map(entry => entry.text), ['vecchio😀', 'recente漢']);
  assert.equal(JSON.stringify(cache), before);
  const empty = { ...cache, entries: [] }, emptyBytes = Buffer.byteLength(JSON.stringify(empty));
  const evictedAll = V.serialize(cache, emptyBytes);
  assert.equal(evictedAll.evicted, 3);
  assert.equal(evictedAll.bytes, emptyBytes);
  assert.deepEqual(evictedAll.cache, empty);
  assert.throws(() => V.serialize(cache, emptyBytes - 1), /vettori_cache_quota/);
});

test('tetto reale di 8 MiB: una riga enorme si espelle; metadati troppo grandi segnalano errore cache', () => {
  const cache = V.update(V.create(NS), ['x'.repeat(V.TETTO_BYTE), 'small'], [[1], [2]], NS.model, 1);
  const result = V.serialize(cache);
  assert.ok(result.bytes <= V.TETTO_BYTE);
  assert.equal(result.evicted, 1);
  assert.deepEqual(result.cache.entries.map(entry => entry.text), ['small']);
  const oversized = V.create({ ...NS, parameters: { publicValue: '😀'.repeat(V.TETTO_BYTE / 4) } });
  assert.throws(() => V.serialize(oversized), /vettori_cache_quota/);
});
