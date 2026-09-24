/* Packet 0012: un giro possiede il contesto delle sue richieste.
 * I modelli sono pubblici; credenziali e Product ID restano nelle chiusure.
 * B2 passa questo giro ai flussi dell’app; il percorso senza giro resta compatibile.
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
    const t = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
    function acceso() { return storage(FLAG) === '1'; }
    function profiloSetup() {
        var provider = state().aiProvider || 'google';
        var saved = storage('mappai_modelli_' + provider);
        if (!saved) throw new Error(t('modelli_setup_missing', 'Configura i modelli per fase nel Setup AI.'));
        var p;
        try { p = window.MappAIModelliCore.profilo(JSON.parse(saved)); }
        catch (_) { throw new Error(t('modelli_invalid', 'Compila mappa, materiali ed embeddings con gli identificativi dei modelli.')); }
        if (p.provider !== provider) throw new Error(t('modelli_wrong_provider', 'Il profilo non appartiene al provider scelto.'));
        return p;
    }
    function salvaProfilo(input) {
        var p = window.MappAIModelliCore.profilo(input);
        localStorage.setItem('mappai_modelli_' + p.provider, JSON.stringify(p));
        return p;
    }
    function creaGiro(input, options) {
        if (storage(FLAG) !== '1') throw new Error(t('modelli_off', 'Modelli per fase spenti.'));
        var C = window.MappAIModelliCore;
        if (!C || !window.getProviderKey || typeof window.fetchModelAPI !== 'function'
            || typeof window.fetchEmbeddings !== 'function') throw new Error(t('modelli_unavailable', 'Modelli per fase non disponibili.'));
        var profilo = C.profilo(input), st = state();
        var apiKey = window.getProviderKey(profilo.provider);
        if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error(t('modelli_no_key', 'Chiave del provider mancante.'));
        var productId = profilo.provider === 'infomaniak'
            ? String(campo('infomaniak-product-id') || st.infomaniakProductId || storage('infomaniak_product_id')).trim() : '';
        if (profilo.provider === 'infomaniak' && !productId) throw new Error(t('modelli_no_product', 'Product ID Infomaniak mancante.'));
        var sm = typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;
        var giro = {
            productId: productId,
            runId: 'modelli-' + Date.now().toString(36) + '-' + (++sequenza).toString(36),
            vaultPath: typeof st.activeVaultPath === 'string' ? st.activeVaultPath : '',
            project: typeof st.rootNodeLabel === 'string' && st.rootNodeLabel.trim() ? st.rootNodeLabel : 'Senza titolo',
            projectId: sm && sm.currentProjectId != null ? String(sm.currentProjectId) : ''
        };
        var chat = window.fetchModelAPI, embeddings = window.fetchEmbeddings;
        var guard = options ? { db: st.db, started: false, bound: null, projectId: null } : null;
        if (options) {
            giro.vaultPath = options.nuovo ? '' : (options.vaultPath || giro.vaultPath);
            giro.projectId = options.nuovo ? '' : giro.projectId;
            giro.project = options.project || giro.project;
            if (!options.nuovo && (!giro.vaultPath || giro.vaultPath !== st.activeVaultPath)) throw new Error(t('modelli_open_project', 'Apri il progetto prima di avviare il giro.'));
        }
        var trace = [], previousRunId = options && options.previousRunId || null;
        function verifica() {
            if (!guard) return;
            if (options.nuovo && storage('mappai_reranker_infomaniak') === '1') throw new Error(t('modelli_reranker_off', 'Disattiva il reranker delle citazioni prima di avviare un giro con modelli per fase.'));
            if (state().db !== guard.db || (guard.bound && (state().activeVaultPath !== guard.bound ||
                String(sm && sm.currentProjectId || '') !== guard.projectId))) {
                var error = new Error(t('modelli_project_changed', 'Il progetto aperto è cambiato. Il giro è stato interrotto.'));
                error.code = 'MODELLI_PROGETTO_CAMBIATO'; throw error;
            }
        }
        if (guard && !options.nuovo) { guard.bound = giro.vaultPath; guard.projectId = giro.projectId; }
        function handle(target) {
        function contesto(phase, service) {
            var scelta = C.fase(profilo, phase);
            return C.contesto(Object.assign({}, target, {
                provider: scelta.provider, model: scelta.model, phase: scelta.phase
            }), service);
        }
        return Object.freeze({
            profilo: function () { return C.profilo(profilo); },
            fase: function (phase) { return C.fase(profilo, phase); },
            verifica: verifica,
            iniziaMappa: function () {
                if (!guard || !options.nuovo || guard.started || guard.bound) throw new Error(t('modelli_bad_destination', 'Destinazione della mappa non valida.'));
                guard.db = state().db; guard.started = true;
            },
            conVault: function (vaultPath) {
                verifica();
                if (!guard || (options.nuovo && !guard.started) || !vaultPath || state().activeVaultPath !== vaultPath || (guard.bound && guard.bound !== vaultPath)) throw new Error(t('modelli_bad_folder', 'La cartella non appartiene al giro.'));
                guard.bound = vaultPath;
                guard.projectId = String(sm && sm.currentProjectId || '');
                return handle(Object.assign({}, target, { vaultPath: vaultPath,
                    projectId: sm && sm.currentProjectId != null ? String(sm.currentProjectId) : '', project: state().rootNodeLabel || target.project }));
            },
            riepilogo: function () { return { profilo: C.profilo(profilo), runId: giro.runId, previousRunId: previousRunId, chiamate: JSON.parse(JSON.stringify(trace)) }; },
            chat: async function (phase, payload) {
                verifica();
                var result = await chat(payload, apiKey, contesto(phase, 'chat'));
                verifica();
                if (result && result._mappaiAI) trace.push(Object.assign({}, result._mappaiAI, { usage: result.usageMetadata ? Object.assign({}, result.usageMetadata) : null }));
                if (window.MappAIModelliUI) window.MappAIModelliUI.mostraGiro(this.riepilogo());
                return result;
            },
            embeddings: async function (texts) {
                verifica();
                var ctx = contesto('embeddings', 'embeddings');
                var values = await embeddings(texts, ctx.model, Object.assign({}, ctx, { apiKey: apiKey }));
                verifica();
                // Il contratto embeddings restituisce vettori, non il modello dichiarato dal server.
                trace.push({ provider: ctx.provider, phase: 'embeddings', requestedModel: ctx.model, actualModel: null,
                    runId: ctx.runId, project: ctx.project, projectId: ctx.projectId, vaultPath: ctx.vaultPath,
                    dimensions: values.length && values[0] ? values[0].length : null, usage: null });
                if (window.MappAIModelliUI) window.MappAIModelliUI.mostraGiro(this.riepilogo());
                return values;
            }
        });
        }
        return handle(giro);
    }
    function avvia(options) {
        options = options || {};
        var manifest = options.manifest, saved = manifest && manifest.config && manifest.config.modelli;
        if (saved && !acceso()) throw new Error(t('modelli_resume_on', 'Riattiva i modelli per fase per riprendere questo giro.'));
        if (!acceso() || (manifest && !saved && !options.nuovaAzione)) return null;
        var p;
        if (saved && !options.nuovaAzione) {
            try { p = window.MappAIModelliCore.profilo(saved); }
            catch (_) { throw new Error(t('modelli_invalid', 'Compila mappa, materiali ed embeddings con gli identificativi dei modelli.')); }
        } else p = profiloSetup();
        var config = options.config || {};
        if (options.nuovo && config.dossier) throw new Error(t('modelli_text_only', 'Questo giro per fase accetta fonti testuali: usa un PDF con testo, un documento o testo incollato.'));
        var giudice = !!options.giudice;
        if (giudice && !p.modelli.giudice) throw new Error(t('modelli_assign_judge', 'Assegna un modello al giudice nel Setup AI prima di avviare il controllo.'));
        if (options.nuovo && storage('mappai_reranker_infomaniak') === '1') throw new Error(t('modelli_reranker_off', 'Disattiva il reranker delle citazioni prima di avviare un giro con modelli per fase.'));
        if (p.provider === 'infomaniak' && config.synthesis && config.synthesis.audio) throw new Error(t('modelli_no_audio', 'Per questo giro Infomaniak scegli la sintesi senza voce: la voce naturale usa Google.'));
        return creaGiro(p, Object.assign({}, options, { previousRunId: manifest && manifest.modelliGiro && manifest.modelliGiro.runId }));
    }
    window.MappAIModelli = Object.freeze({
        accendi: function () { localStorage.setItem(FLAG, '1'); },
        spegni: function () { localStorage.setItem(FLAG, '0'); },
        acceso: acceso, profiloSetup: profiloSetup, salvaProfilo: salvaProfilo,
        avvia: avvia, creaGiro: creaGiro
    });
})();
