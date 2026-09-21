'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../public/js/mappai-modelli-core');

const profile = () => ({ schema: C.SCHEMA, provider: 'infomaniak',
  modelli: { mappa: 'gemma_map', materiali: 'gemma_materiali', embeddings: 'BAAI/bge-multilingual-gemma2' } });
const context = () => ({ provider: 'infomaniak', model: 'gemma_map', phase: 'mappa', productId: 'fake-product',
  runId: 'run-1', vaultPath: '/fake/vault', project: 'Il progetto', projectId: 'project-1' });

test('profilo copia i modelli esatti, normalizza solo le due fasi opzionali e non condivide dati', () => {
  const input = profile(), before = JSON.stringify(input);
  const copied = C.profilo(input);
  assert.deepEqual(copied, { schema: C.SCHEMA, provider: 'infomaniak',
    modelli: { mappa: 'gemma_map', materiali: 'gemma_materiali', embeddings: 'BAAI/bge-multilingual-gemma2', giudice: null, reranking: null } });
  assert.equal(JSON.stringify(input), before);
  input.modelli.mappa = 'changed';
  copied.modelli.materiali = 'another';
  assert.equal(copied.modelli.mappa, 'gemma_map');
  assert.equal(input.modelli.materiali, 'gemma_materiali');
  const google = profile(); google.provider = 'google';
  assert.equal(C.profilo(google).provider, 'google');
});

test('risolve tutte le fasi assegnate, senza inventare capacità né alias', () => {
  const input = profile();
  input.modelli.giudice = 'judge-id'; input.modelli.reranking = 'reranker-id';
  for (const [phase, service] of [['mappa', 'chat'], ['materiali', 'chat'], ['giudice', 'chat'], ['embeddings', 'embeddings'], ['reranking', 'rerank']]) {
    assert.deepEqual(C.fase(input, phase), { provider: input.provider, model: input.modelli[phase], phase, service });
  }
  for (const phase of ['giudice', 'reranking']) assert.throws(() => C.fase(profile(), phase), { code: 'modelli_modello_non_assegnato' });
  for (const phase of ['rerank', 'chat', 'recupero', '__proto__', 'constructor', '', null, {}]) {
    assert.throws(() => C.fase(input, phase), { code: 'modelli_fase_non_valida' });
  }
  const resolved = C.fase(input, 'mappa'); resolved.model = 'changed';
  assert.equal(input.modelli.mappa, 'gemma_map');
});

test('profilo rifiuta configurazioni incomplete, identificativi alterati e provider sconosciuti', () => {
  const invalid = [undefined, null, [], 'profile', {}, { ...profile(), schema: 'mappai-modelli@0' },
    { ...profile(), provider: 'Infomaniak' }, { ...profile(), provider: 'other' }];
  for (const key of ['schema', 'provider', 'modelli']) {
    const value = profile(); delete value[key]; invalid.push(value);
  }
  for (const phase of ['mappa', 'materiali', 'embeddings']) {
    const value = profile(); delete value.modelli[phase]; invalid.push(value);
  }
  for (const phase of ['mappa', 'materiali', 'embeddings', 'giudice', 'reranking']) {
    for (const model of ['', ' ', ' gemma', 'gemma\n', false, 12, {}, undefined]) {
      const value = profile(); value.modelli[phase] = model; invalid.push(value);
    }
  }
  for (const phase of ['mappa', 'materiali', 'embeddings']) {
    const value = profile(); value.modelli[phase] = null; invalid.push(value);
  }
  for (const value of invalid) assert.throws(() => C.profilo(value), { code: 'modelli_profilo_non_valido' });
});

test('nessun campo sconosciuto o segreto passa nel profilo, neppure simboli o accessori', () => {
  for (const key of ['apiKey', 'token', 'productId', 'unknown', Symbol('private')]) {
    for (const nested of [false, true]) {
      const value = profile(); (nested ? value.modelli : value)[key] = 'private-value';
      assert.throws(() => C.profilo(value), { code: 'modelli_profilo_non_valido' });
    }
  }
  const accessor = profile();
  Object.defineProperty(accessor, 'provider', { get() { throw new Error('getter must not run'); } });
  assert.throws(() => C.profilo(accessor), { code: 'modelli_profilo_non_valido' });
  const inherited = Object.assign(Object.create({ token: 'private' }), profile());
  assert.throws(() => C.profilo(inherited), { code: 'modelli_profilo_non_valido' });
});

test('contesto è completo, privato e copiato; provider e servizio devono corrispondere', () => {
  const input = context(), copied = C.contesto(input, 'chat');
  assert.deepEqual(copied, input);
  copied.model = 'new'; input.productId = 'different';
  assert.equal(input.model, 'gemma_map'); assert.equal(copied.productId, 'fake-product');
  for (const phase of ['materiali', 'giudice']) assert.equal(C.contesto({ ...context(), phase }, 'chat').phase, phase);
  assert.equal(C.contesto({ ...context(), phase: 'embeddings' }, 'embeddings').phase, 'embeddings');
  assert.equal(C.contesto({ ...context(), phase: 'reranking' }, 'rerank').phase, 'reranking');
  const google = { ...context(), provider: 'google', productId: '', vaultPath: '', projectId: '' };
  assert.deepEqual(C.contesto(google, 'chat'), google);
  const titled = { ...context(), project: ' Progetto con spazi ', vaultPath: 'a/è', projectId: '' };
  assert.deepEqual(C.contesto(titled, 'chat'), titled, 'titolo e percorsi vengono conservati esattamente');
});

test('contesti incompleti, servizio/fase errati e chiavi private aggiunte non diventano fallback', () => {
  for (const key of Object.keys(context())) {
    const missing = context(); delete missing[key];
    assert.throws(() => C.contesto(missing, 'chat'), { code: 'modelli_contesto_non_valido' });
    assert.throws(() => C.contesto({ ...context(), [key]: null }, 'chat'), { code: 'modelli_contesto_non_valido' });
  }
  const invalid = [null, [], 'context', { ...context(), apiKey: 'private-key' }, { ...context(), extra: 'data' },
    { ...context(), provider: 'other' }, { ...context(), model: ' model' }, { ...context(), model: '' },
    { ...context(), productId: '' }, { ...context(), provider: 'google' }, { ...context(), runId: ' ' },
    { ...context(), project: ' ' }, { ...context(), phase: 'embeddings' }, { ...context(), phase: 'rerank' },
    { ...context(), phase: '__proto__' }, { ...context(), phase: 'constructor' }];
  for (const value of invalid) assert.throws(() => C.contesto(value, 'chat'), { code: 'modelli_contesto_non_valido' });
  for (const service of [undefined, null, 'Chat', 'rerank', 'embeddings', 'other']) {
    assert.throws(() => C.contesto(context(), service), { code: 'modelli_contesto_non_valido' });
  }
});

test('errori statici non espongono credenziali, modelli o identificativi ricevuti', () => {
  const secret = 'do-not-print-this-private-value';
  const check = fn => assert.throws(fn, error => !error.message.includes(secret) && !error.code.includes(secret) && error.message === error.code);
  check(() => C.profilo({ ...profile(), apiKey: secret }));
  check(() => C.fase(profile(), secret));
  check(() => C.contesto({ ...context(), token: secret }, 'chat'));
  check(() => C.contesto({ ...context(), productId: secret, phase: secret }, 'chat'));
});

test('UMD browser funziona fra realm differenti e con oggetti semplici a prototipo nullo', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/mappai-modelli-core'), 'utf8'), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.MappAIModelliCore.profilo(profile()))), C.profilo(profile()));
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.MappAIModelliCore.contesto(context(), 'chat'))), context());
  const foreign = vm.runInNewContext('({schema:"mappai-modelli@1",provider:"google",modelli:{mappa:"map",materiali:"material",embeddings:"embedding"}})');
  assert.equal(C.fase(foreign, 'mappa').model, 'map');
  const nullPrototype = Object.assign(Object.create(null), profile());
  nullPrototype.modelli = Object.assign(Object.create(null), nullPrototype.modelli);
  assert.deepEqual(C.profilo(nullPrototype), C.profilo(profile()));
});
