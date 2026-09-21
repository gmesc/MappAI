/* Magazzino embeddings: identità, validazione e formato; nessun I/O o DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-review-core'));
  else root.MappAIVettoriCore = factory(root.MappAIReviewCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (RC) {
  'use strict';
  const SCHEMA = 'mappai-vettori@1';
  const TETTO_BYTE = 8 * 1024 * 1024;
  const bytesOf = text => new TextEncoder().encode(text).length;
  const object = value => Object.prototype.toString.call(value) === '[object Object]';
  const hash = text => RC.revision({ items: [{ id: 'vettori-text', value: text }] }, []);
  function fail(code) { const error = new Error('vettori_' + code); error.code = error.message; throw error; }
  function identifier(value) {
    if (typeof value !== 'string' || !value.trim()) fail('invalid_identity');
    return value.trim();
  }
  function exactKeys(value, keys) {
    return object(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
  }
  // Solo parametri JSON pubblici: credenziali e Product ID restano nel trasporto.
  function canonical(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if ((!Array.isArray(value) && !object(value)) || seen.has(value)) fail('invalid_parameters');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = Array.from(value, item => canonical(item, seen));
    } else {
      result = {};
      Object.keys(value).sort().forEach(key => {
        if (/^(api[_-]?key|token|product[_-]?id|authorization|password|secret|credentials)$/i.test(key)) fail('private_parameters');
        Object.defineProperty(result, key, { value: canonical(value[key], seen), enumerable: true, writable: true, configurable: true });
      });
    }
    seen.delete(value);
    return result;
  }
  function namespace(options) {
    if (!object(options)) fail('invalid_identity');
    const parameters = options.parameters === undefined ? {} : options.parameters;
    if (!object(parameters)) fail('invalid_parameters');
    return {
      provider: identifier(options.provider).toLowerCase(), model: identifier(options.model),
      preprocessing: identifier(options.preprocessing === undefined ? 'raw@1' : options.preprocessing),
      parameters: canonical(parameters)
    };
  }
  function create(ns, actualModel = null, dimensions = 0) {
    if (!Number.isSafeInteger(dimensions) || dimensions < 0 ||
        (actualModel === null) !== (dimensions === 0)) fail('invalid_metadata');
    return { schema: SCHEMA, namespace: namespace(ns), actualModel: actualModel === null ? null : identifier(actualModel), dimensions, entries: [] };
  }
  function validateBatch(vectors, count) {
    if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(vectors) || vectors.length !== count) fail('invalid_batch_count');
    let dimensions = 0;
    for (let i = 0; i < count; i++) {
      const vector = vectors[i];
      if (!Array.isArray(vector) || !vector.length || (dimensions && vector.length !== dimensions)) fail('invalid_vector_dimensions');
      dimensions = vector.length;
      for (let j = 0; j < dimensions; j++) if (typeof vector[j] !== 'number' || !Number.isFinite(vector[j])) fail('invalid_vector_value');
    }
    return dimensions;
  }
  function validatedCopy(cache) {
    if (!exactKeys(cache, ['schema', 'namespace', 'actualModel', 'dimensions', 'entries']) || cache.schema !== SCHEMA ||
        !exactKeys(cache.namespace, ['provider', 'model', 'preprocessing', 'parameters']) || !Array.isArray(cache.entries)) fail('invalid_cache');
    const copy = create(cache.namespace, cache.actualModel, cache.dimensions), texts = new Set();
    if (copy.actualModel !== cache.actualModel) fail('invalid_metadata');
    copy.entries = Array.from(cache.entries, entry => {
      if (!exactKeys(entry, ['key', 'text', 'vector', 'lastUsed']) || typeof entry.text !== 'string' ||
          entry.key !== hash(entry.text) || texts.has(entry.text) || !Number.isFinite(entry.lastUsed) || entry.lastUsed < 0 || Object.is(entry.lastUsed, -0) ||
          validateBatch([entry.vector], 1) !== copy.dimensions || entry.vector.some(value => Object.is(value, -0))) fail('invalid_entry');
      texts.add(entry.text);
      return { key: entry.key, text: entry.text, vector: entry.vector.slice(), lastUsed: entry.lastUsed };
    });
    return copy;
  }
  function deserialize(text, ns) {
    const empty = create(ns);
    if (text == null || text === '') return { cache: empty, reason: 'missing' };
    try {
      if (typeof text !== 'string' || bytesOf(text) > TETTO_BYTE) return { cache: empty, reason: 'invalid_cache' };
      const cache = validatedCopy(JSON.parse(text));
      if (JSON.stringify(cache.namespace) !== JSON.stringify(empty.namespace)) return { cache: empty, reason: 'namespace_mismatch' };
      return { cache, reason: null };
    } catch (_) { return { cache: empty, reason: 'invalid_cache' }; }
  }
  function lookup(cache, text) {
    if (typeof text !== 'string') return null;
    const key = hash(text);
    // ponytail: scansione entro 8 MiB; indice in memoria solo se una misura lo richiede.
    const entry = cache.entries.find(row => row.key === key && row.text === text);
    return entry ? entry.vector.slice() : null;
  }
  function update(cache, texts, vectors, actualModel, now) {
    if (!Array.isArray(texts) || !Array.from(texts).every(text => typeof text === 'string') ||
        !Number.isFinite(now) || now < 0 || Object.is(now, -0)) fail('invalid_update');
    const dimensions = validateBatch(vectors, texts.length), copy = validatedCopy(cache);
    if (!texts.length) return copy;
    const model = identifier(actualModel);
    if (copy.dimensions && (copy.dimensions !== dimensions || copy.actualModel !== model)) fail('space_mismatch');
    copy.actualModel = model; copy.dimensions = dimensions;
    const entries = new Map(copy.entries.map(entry => [entry.text, entry]));
    texts.forEach((text, i) => {
      // JSON cambierebbe -0 in 0: il risultato resta valido, la riga non si conserva.
      if (vectors[i].some(value => Object.is(value, -0))) entries.delete(text);
      else entries.set(text, { key: hash(text), text, vector: vectors[i].slice(), lastUsed: now });
    });
    copy.entries = Array.from(entries.values());
    return copy;
  }
  function serialize(cache, maxBytes = TETTO_BYTE) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) fail('invalid_quota');
    const limit = Math.min(maxBytes, TETTO_BYTE), copy = validatedCopy(cache);
    let text = JSON.stringify(copy), bytes = bytesOf(text);
    const evicted = new Set();
    if (bytes > limit) {
      const oldest = copy.entries.map((entry, index) => ({ index, lastUsed: entry.lastUsed }))
        .sort((a, b) => a.lastUsed - b.lastUsed || a.index - b.index);
      for (const row of oldest) {
        if (bytes <= limit) break;
        bytes -= bytesOf(JSON.stringify(copy.entries[row.index])) + (copy.entries.length - evicted.size > 1 ? 1 : 0);
        evicted.add(row.index);
      }
      copy.entries = copy.entries.filter((_, index) => !evicted.has(index));
      text = JSON.stringify(copy); bytes = bytesOf(text);
    }
    if (bytes > limit) fail('cache_quota');
    return { cache: copy, text, bytes, evicted: evicted.size };
  }
  return { SCHEMA, TETTO_BYTE, namespace, create, deserialize, lookup, validateBatch, update, serialize };
}));
