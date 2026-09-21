/* Profilo pubblico e contesto privato per fase. Nessun I/O, DOM o catalogo modelli. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MappAIModelliCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'mappai-modelli@1';
  const SERVICES = { mappa: 'chat', materiali: 'chat', giudice: 'chat', embeddings: 'embeddings', reranking: 'rerank' };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const identifier = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
  const provider = value => value === 'google' || value === 'infomaniak';
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function fields(value, required, optional = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    // Accetta oggetti semplici anche da un altro realm; niente istanze, accessori o dati ereditati.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
    return required.every(key => own(value, key)) && Reflect.ownKeys(value).every(key =>
      typeof key === 'string' && (required.includes(key) || optional.includes(key)) &&
      own(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }
  function profilo(value) {
    if (!fields(value, ['schema', 'provider', 'modelli']) || value.schema !== SCHEMA || !provider(value.provider) ||
        !fields(value.modelli, ['mappa', 'materiali', 'embeddings'], ['giudice', 'reranking'])) fail('modelli_profilo_non_valido');
    const models = value.modelli, copied = {};
    for (const phase of Object.keys(SERVICES)) {
      const model = own(models, phase) ? models[phase] : null;
      if (!identifier(model) && !(['giudice', 'reranking'].includes(phase) && model === null)) fail('modelli_profilo_non_valido');
      copied[phase] = model;
    }
    return { schema: SCHEMA, provider: value.provider, modelli: copied };
  }
  function fase(profile, phase) {
    const copy = profilo(profile);
    if (typeof phase !== 'string' || !own(SERVICES, phase)) fail('modelli_fase_non_valida');
    if (copy.modelli[phase] === null) fail('modelli_modello_non_assegnato');
    return { provider: copy.provider, model: copy.modelli[phase], phase, service: SERVICES[phase] };
  }
  function contesto(value, service) {
    const keys = ['provider', 'model', 'phase', 'productId', 'runId', 'vaultPath', 'project', 'projectId'];
    if (!fields(value, keys) || !keys.every(key => typeof value[key] === 'string') || !provider(value.provider) ||
        !identifier(value.model) || !own(SERVICES, value.phase) || !['chat', 'embeddings', 'rerank'].includes(service) ||
        SERVICES[value.phase] !== service || !identifier(value.runId) || !value.project.trim() ||
        (value.provider === 'infomaniak' ? !identifier(value.productId) : value.productId !== '')) fail('modelli_contesto_non_valido');
    return Object.fromEntries(keys.map(key => [key, value[key]]));
  }
  return { SCHEMA, profilo, fase, contesto };
}));
