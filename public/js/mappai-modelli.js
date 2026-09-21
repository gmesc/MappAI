/* Packet 0012: un giro possiede il contesto delle sue richieste.
 * I modelli sono pubblici; credenziali e Product ID restano nelle chiusure.
 * Nessun motore viene collegato implicitamente: l'integrazione è il passo B2.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.MappAIModelli) return;
    var FLAG = 'mappai_multimodello', sequenza = 0;
    function state() { return typeof appState !== 'undefined' ? appState : (window.appState || {}); }
    function storage(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
    function campo(id) {
        var el = document.getElementById(id);
        return el && typeof el.value === 'string' ? el.value.trim() : '';
    }
    function creaGiro(input) {
        if (storage(FLAG) !== '1') throw new Error('Modelli per fase spenti.');
        var C = window.MappAIModelliCore;
        if (!C || !window.getProviderKey || typeof window.fetchModelAPI !== 'function'
            || typeof window.fetchEmbeddings !== 'function') throw new Error('Modelli per fase non disponibili.');
        var profilo = C.profilo(input), st = state();
        var apiKey = window.getProviderKey(profilo.provider);
        if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Chiave del provider mancante.');
        var productId = profilo.provider === 'infomaniak'
            ? String(campo('infomaniak-product-id') || st.infomaniakProductId || storage('infomaniak_product_id')).trim() : '';
        if (profilo.provider === 'infomaniak' && !productId) throw new Error('Product ID Infomaniak mancante.');
        var sm = typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;
        var giro = {
            productId: productId,
            runId: 'modelli-' + Date.now().toString(36) + '-' + (++sequenza).toString(36),
            vaultPath: typeof st.activeVaultPath === 'string' ? st.activeVaultPath : '',
            project: typeof st.rootNodeLabel === 'string' && st.rootNodeLabel.trim() ? st.rootNodeLabel : 'Senza titolo',
            projectId: sm && sm.currentProjectId != null ? String(sm.currentProjectId) : ''
        };
        var chat = window.fetchModelAPI, embeddings = window.fetchEmbeddings;
        function contesto(phase, service) {
            var scelta = C.fase(profilo, phase);
            return C.contesto(Object.assign({}, giro, {
                provider: scelta.provider, model: scelta.model, phase: scelta.phase
            }), service);
        }
        return Object.freeze({
            profilo: function () { return C.profilo(profilo); },
            chat: function (phase, payload) { return chat(payload, apiKey, contesto(phase, 'chat')); },
            embeddings: function (texts) {
                var ctx = contesto('embeddings', 'embeddings');
                return embeddings(texts, ctx.model, Object.assign({}, ctx, { apiKey: apiKey }));
            }
        });
    }
    window.MappAIModelli = Object.freeze({
        accendi: function () { localStorage.setItem(FLAG, '1'); },
        spegni: function () { localStorage.setItem(FLAG, '0'); },
        creaGiro: creaGiro
    });
})();
