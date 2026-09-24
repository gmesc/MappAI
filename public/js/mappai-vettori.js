/* Cache degli embeddings nel vault (packet 0010).
 * Il disco resta l'autorità: si rilegge dentro la coda di ogni vault. Nessuna copia
 * dei vettori sopravvive in memoria fra operazioni, né un errore di scrittura
 * lascia un hit che sparirebbe al riavvio. Le credenziali vivono solo nello snapshot.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.MappAIVettori) return;
    var FILE = 'vettori.json', FLAG = 'mappai_vettori_cache';
    var queues = new Map(), last = null;
    var originale = window.fetchEmbeddings;
    function core() { return window.MappAIVettoriCore; }
    function state() {
        return typeof appState !== 'undefined' ? appState : (window.appState || {});
    }
    function storage(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
    function acceso() { return storage(FLAG) === '1'; }
    function campo(id) {
        var el = document.getElementById(id);
        return el && el.value || '';
    }
    function vault() { return state().activeVaultPath || ''; }
    function stesso(ctx) { return vault() === ctx.vaultPath; }
    function log(message) { console.info('[Vettori] ' + message); }
    function parametri(provider) {
        return provider === 'google' ? { taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 } : {};
    }
    function snapshot(model) {
        var st = state(), provider = st.aiProvider === 'google' ? 'google' : 'infomaniak';
        return {
            vaultPath: st.activeVaultPath,
            provider: provider,
            apiKey: window.getProviderKey(provider),
            productId: provider === 'infomaniak'
                ? (st.infomaniakProductId || campo('infomaniak-product-id') || storage('infomaniak_product_id')) : '',
            // Parametri fissi dell'IPC Google: il test esegue quell'handler e ne
            // confronta il payload per segnalare cambi futuri dello spazio.
            parameters: parametri(provider),
            // Stessi default del trasporto storico: non correggere alias senza prova.
            model: model || (provider === 'google' ? 'gemini-embedding-001' : 'bge_multilingual_gemma2')
        };
    }
    function snapshotEsplicito(model, value) {
        try {
            var M = window.MappAIModelliCore;
            if (!M || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
            // Conserva i descrittori: nessun getter viene eseguito e il core vede
            // anche i campi sconosciuti non enumerabili, senza modificare l'input.
            var descriptors = Object.getOwnPropertyDescriptors(value);
            var key = descriptors.apiKey && descriptors.apiKey.value;
            delete descriptors.apiKey;
            var ctx = M.contesto(Object.create(Object.getPrototypeOf(value), descriptors), 'embeddings');
            if (typeof key !== 'string' || !key.trim() || model !== ctx.model) throw new Error();
            return Object.assign({}, ctx, { apiKey: key, parameters: parametri(ctx.provider) });
        } catch (_) {
            throw new Error('Contesto embeddings non valido.');
        }
    }
    function seriale(path, work) {
        var previous = queues.get(path) || Promise.resolve();
        var task = previous.catch(function () {}).then(work);
        queues.set(path, task);
        function fine() { if (queues.get(path) === task) queues.delete(path); }
        task.then(fine, fine);
        return task;
    }
    async function leggi(ctx, ns) {
        var C = core();
        try {
            var res = await window.electronAPI.readVaultFile({ vaultPath: ctx.vaultPath, relPath: FILE });
            if (!stesso(ctx)) return C.create(ns);
            if (!res || !res.ok) { log('cache assente o non leggibile: ricalcolo'); return C.create(ns); }
            if (res.size > C.TETTO_BYTE || typeof res.base64 !== 'string'
                || res.base64.length > 4 * Math.ceil(C.TETTO_BYTE / 3)) throw new Error('cache_size');
            var bytes = Uint8Array.from(atob(res.base64), function (c) { return c.charCodeAt(0); });
            if (bytes.length > C.TETTO_BYTE) throw new Error('cache_size');
            var loaded = C.deserialize(new TextDecoder('utf-8', { fatal: true }).decode(bytes), ns);
            if (loaded.reason) log('cache non compatibile o corrotta: ricalcolo');
            return loaded.cache;
        } catch (_) {
            log('lettura cache non riuscita: ricalcolo');
            return C.create(ns);
        }
    }
    async function richiedi(ctx, texts) {
        var result = await window.fetchEmbeddingsRequest({
            provider: ctx.provider, apiKey: ctx.apiKey, productId: ctx.productId,
            model: ctx.model, texts: texts,
            project: ctx.project, projectId: ctx.projectId, runId: ctx.runId
        });
        // Errori del fornitore non sono errori di cache e non vengono assorbiti.
        var dimensions = core().validateBatch(result && result.embeddings, texts.length);
        var actualModel = result && typeof result.model === 'string' && result.model.trim()
            ? result.model : ctx.model;
        return { vectors: result.embeddings, actualModel: actualModel, dimensions: dimensions };
    }
    async function scrivi(ctx, cache, counts) {
        if (!stesso(ctx) || !acceso()) { last = null; return; }
        try {
            var saved = core().serialize(cache);
            var result = await window.electronAPI.saveVaultFile({
                vaultPath: ctx.vaultPath, relPath: FILE, text: saved.text, potaVarianti: false
            });
            if (!stesso(ctx)) { last = null; return; }
            if (!result || !result.ok) throw new Error('cache_write');
            last = {
                vaultPath: ctx.vaultPath, model: cache.actualModel, dimensions: cache.dimensions,
                rows: saved.cache.entries.length, bytes: saved.bytes, evicted: saved.evicted,
                requested: counts.requested, hits: counts.hits
            };
            log('richiesti ' + counts.requested + ', riusati ' + counts.hits
                + ', conservati ' + last.rows + ', espulsi ' + saved.evicted);
        } catch (_) {
            last = null;
            log('cache non salvata: i vettori restano disponibili per questa operazione');
        }
    }
    async function esegui(ctx, texts) {
        var C = core(), ns = C.namespace(ctx), unique = Array.from(new Set(texts));
        var cache = stesso(ctx) && acceso() ? await leggi(ctx, ns) : C.create(ns);
        if (!stesso(ctx) || !acceso()) cache = C.create(ns);
        var found = new Map(), missing = [];
        unique.forEach(function (text) {
            var vector = C.lookup(cache, text);
            if (vector) found.set(text, vector); else missing.push(text);
        });
        var hits = unique.length - missing.length, requested = 0;
        var actualModel = cache.actualModel;
        if (missing.length) {
            requested += missing.length;
            var result = await richiedi(ctx, missing);
            // Un cambio remoto scoperto su un miss invalida anche gli hit: una sola
            // seconda chiamata contiene TUTTI i testi, senza mescolare gli spazi.
            if (cache.dimensions && (cache.dimensions !== result.dimensions || cache.actualModel !== result.actualModel)) {
                log('spazio degli embeddings cambiato: ricostruisco la richiesta completa');
                cache = C.create(ns);
                found.clear(); hits = 0;
                requested += unique.length;
                result = await richiedi(ctx, unique);
                missing = unique;
            }
            actualModel = result.actualModel;
            missing.forEach(function (text, index) { found.set(text, result.vectors[index].slice()); });
        }
        var vectors = unique.map(function (text) { return found.get(text); });
        // update/serialize sono operazioni di cache. Se falliscono, non perdere il
        // risultato valido del provider; validateBatch è già passato fuori dal catch.
        try {
            cache = C.update(cache, unique, vectors, actualModel, Date.now());
            await scrivi(ctx, cache, { requested: requested, hits: hits });
        } catch (_) {
            last = null;
            log('aggiornamento cache non riuscito: restituisco i vettori senza conservarli');
        }
        return texts.map(function (text) { return found.get(text).slice(); });
    }
    function stato() {
        var current = vault();
        var value = Object.assign({ acceso: acceso(), vaultPath: current, rows: null },
            last && last.vaultPath === current ? last : {});
        log('cache ' + (value.acceso ? 'accesa' : 'spenta') + ', righe note: ' + (value.rows == null ? 'non lette' : value.rows));
        return value;
    }
    window.MappAIVettori = {
        accendi: function () { localStorage.setItem(FLAG, '1'); log('cache accesa'); },
        spegni: function () { localStorage.setItem(FLAG, '0'); last = null; log('cache spenta'); },
        stato: stato,
        svuota: function () {
            var path = vault(), api = window.electronAPI;
            if (!path || !api || !api.saveVaultFile || !core()) return Promise.resolve(false);
            return seriale(path, async function () {
                if (vault() !== path) return false;
                try {
                    // Uno schema senza namespace è intenzionalmente una cache vuota:
                    // al prossimo uso verrà costruito quello del modello richiesto.
                    var r = await api.saveVaultFile({ vaultPath: path, relPath: FILE,
                        text: JSON.stringify({ schema: core().SCHEMA, entries: [] }), potaVarianti: false });
                    last = null;
                    if (!r || !r.ok || vault() !== path) return false;
                    log('cache svuotata');
                    return true;
                } catch (_) { last = null; log('svuotamento cache non riuscito'); return false; }
            });
        }
    };
    if (typeof originale !== 'function') { log('trasporto assente: cache non collegata'); return; }
    window.fetchEmbeddings = async function (texts, model, context) {
        var api = window.electronAPI;
        if (context !== undefined) {
            var explicit = snapshotEsplicito(model, context);
            try {
                if (!core() || !window.fetchEmbeddingsRequest) throw new Error('Trasporto embeddings non disponibile.');
                if (!Array.isArray(texts)) throw new Error('Gli embeddings richiedono testi.');
                var captured = Array.from(texts);
                if (captured.some(function (text) { return typeof text !== 'string'; })) throw new Error('Gli embeddings richiedono testi.');
                if (!captured.length) return [];
                if (!acceso() || !explicit.vaultPath || !stesso(explicit)
                    || !api || !api.readVaultFile || !api.saveVaultFile) {
                    last = null;
                    var result = await richiedi(explicit, captured);
                    return result.vectors.map(function (vector) { return vector.slice(); });
                }
                return await seriale(explicit.vaultPath, function () { return esegui(explicit, captured); });
            } catch (error) {
                var message = String(error && error.message || 'Richiesta embeddings non riuscita.');
                var secrets = [explicit.apiKey, explicit.productId].filter(Boolean);
                secrets.slice().forEach(function (secret) {
                    try { secrets.push(encodeURIComponent(secret), encodeURI(secret)); } catch (_) { /* conserva il grezzo */ }
                });
                secrets.slice().forEach(function (secret) { secrets.push(secret.replace(/%[0-9A-F]{2}/g, function (code) { return code.toLowerCase(); })); });
                secrets.sort(function (a, b) { return b.length - a.length; })
                    .forEach(function (secret) { message = message.split(secret).join('«omesso»'); });
                throw new Error(message);
            }
        }
        if (!acceso() || !vault() || !Array.isArray(texts) || !texts.length || !core()
            || !api || !api.readVaultFile || !api.saveVaultFile
            || !window.fetchEmbeddingsRequest || !window.getProviderKey
            || (state().aiProvider === 'google' ? !api.generateEmbeddingsGoogle : !api.generateEmbeddingsInfomaniak)) {
            return originale.apply(this, arguments);
        }
        var input = Array.from(texts);
        if (input.some(function (text) { return typeof text !== 'string'; })) throw new Error('Gli embeddings richiedono testi.');
        var ctx = snapshot(model);
        return seriale(ctx.vaultPath, function () { return esegui(ctx, input); });
    };
})();
