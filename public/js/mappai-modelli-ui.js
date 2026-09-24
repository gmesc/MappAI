/* Setup del profilo pubblico; i segreti appartengono ai trasporti esistenti. */
(function () {
    'use strict';
    const t = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
    const labels = { mappa: ['modelli_map', 'Mappa'], materiali: ['modelli_materials', 'Materiali'],
        embeddings: ['modelli_embeddings', 'Analisi semantica (embeddings)'], giudice: ['modelli_judge', 'Giudice, se abilitato'] };
    let lastRun = null;
    let refreshPanel = () => {};
    function state() { return typeof appState !== 'undefined' ? appState : window.appState || {}; }
    function catalog() {
        try { const rows = JSON.parse(localStorage.getItem('infomaniak_available_models') || '[]'); return Array.isArray(rows) ? rows : []; }
        catch (_) { return []; }
    }
    function render() {
        const host = document.getElementById('modelli-setup');
        if (!host || !window.MappAIModelli) return;
        host.replaceChildren();
        refreshPanel = () => {};
        const enabled = window.MappAIModelli.acceso();
        const label = document.createElement('label'); label.className = 'flex items-center gap-2 font-bold text-sm';
        const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = enabled;
        toggle.addEventListener('change', () => { window.MappAIModelli[toggle.checked ? 'accendi' : 'spegni'](); render(); });
        label.append(toggle, document.createTextNode(t('modelli_enable', 'Usa un modello per ogni fase'))); host.append(label);
        if (!enabled) return;
        const provider = state().aiProvider || 'google';
        let profile;
        try { profile = window.MappAIModelli.profiloSetup(); }
        catch (_) {
            const selected = localStorage.getItem(provider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model') || '';
            profile = { schema: 'mappai-modelli@1', provider, modelli: { mappa: selected, materiali: selected,
                embeddings: provider === 'infomaniak' ? 'bge_multilingual_gemma2' : 'gemini-embedding-001', giudice: null, reranking: null } };
        }
        const help = document.createElement('p'); help.className = 'text-sm mt-2';
        help.textContent = t('modelli_help', 'Le scelte valgono dal prossimo avvio. Un lavoro già avviato mantiene i suoi modelli. Puoi usare lo stesso modello per più fasi.');
        host.append(help);
        const inputs = {};
        const updates = [];
        Object.keys(labels).forEach(phase => {
            const row = document.createElement('label'); row.className = 'block text-sm mt-3';
            const title = document.createElement('span'); title.textContent = t(...labels[phase]);
            const input = document.createElement('input'); input.type = 'text'; input.id = 'modelli-' + phase;
            input.value = profile.modelli[phase] || ''; input.autocomplete = 'off'; input.spellcheck = false;
            input.className = 'w-full border border-slate-300 rounded-lg p-2 bg-white text-slate-800';
            if (provider === 'infomaniak' || phase !== 'embeddings') {
                const list = document.createElement('datalist'); list.id = 'modelli-catalogo-' + phase;
                input.setAttribute('list', list.id);
                const hint = document.createElement('p'); hint.className = 'text-xs mt-1 break-words';
                const update = () => {
                    list.replaceChildren();
                    const C = window.MappAICatalogo;
                    const choices = provider === 'infomaniak' && C ? C.forPhase(catalog(), phase).map(m => ({
                        value: m.id, label: C.priceLabel(m.id, t) + (m.availability === 'catalogue' ? ' · ' + t('catalog_product_unverified', 'Accesso del prodotto da verificare') : '')
                    })) : Array.from(document.getElementById('model-select')?.options || []).filter(o => o.value).map(o => ({ value: o.value, label: o.textContent }));
                    choices.forEach(o => { const option = document.createElement('option'); option.value = o.value; option.label = o.label; list.append(option); });
                    if (provider === 'infomaniak' && C && input.value.trim()) {
                        const selected = catalog().find(m => C.canonical(m.id) === C.canonical(input.value));
                        const valid = selected && C.forPhase([selected], phase).length;
                        hint.textContent = C.priceLabel(input.value, t) + ' · ' + (valid
                            ? (selected.availability === 'product' ? t('catalog_product', 'Elencato dal prodotto') : t('catalog_product_unverified', 'Accesso del prodotto da verificare'))
                            : t('catalog_wrong_phase', 'Modello non verificato per questa funzione: aggiorna il catalogo e scegli dalla lista.'));
                    } else hint.textContent = '';
                };
                input.addEventListener('focus', update); input.addEventListener('input', update);
                updates.push(update); row.append(list); row.append(title, input, hint);
            } else {
                row.append(title, input);
            }
            host.append(row); inputs[phase] = input;
        });
        const save = document.createElement('button'); save.type = 'button'; save.className = 'pm-btn-primary mt-3';
        save.textContent = t('modelli_save', 'Salva assegnazioni');
        const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'text-sm mt-2';
        save.addEventListener('click', () => {
            try {
                const models = { reranking: null };
                Object.keys(inputs).forEach(phase => { models[phase] = inputs[phase].value.trim() || (phase === 'giudice' ? null : ''); });
                if (provider === 'infomaniak' && window.MappAICatalogo) {
                    const C = window.MappAICatalogo;
                    for (const phase of Object.keys(inputs)) {
                        if (phase === 'giudice' && !models[phase]) continue;
                        if (!C.forPhase(catalog(), phase).some(m => C.canonical(m.id) === C.canonical(models[phase]))) {
                            status.textContent = t(...labels[phase]) + ': ' + t('catalog_wrong_phase', 'Modello non verificato per questa funzione: aggiorna il catalogo e scegli dalla lista.');
                            return;
                        }
                    }
                }
                window.MappAIModelli.salvaProfilo({ schema: 'mappai-modelli@1', provider, modelli: models });
                status.textContent = t('modelli_saved', 'Assegnazioni salvate per il prossimo lavoro.');
            } catch (_) { status.textContent = t('modelli_invalid', 'Compila mappa, materiali ed embeddings con gli identificativi dei modelli.'); }
        });
        const next = document.createElement('p'); next.className = 'text-sm mt-2';
        next.textContent = t('modelli_rerank_later', 'Reranking Evidence: previsto in un passo successivo.');
        const summary = document.createElement('div'); summary.id = 'modelli-riepilogo'; summary.className = 'text-sm mt-3 break-words';
        const catalogueNote = document.createElement('p'); catalogueNote.className = 'text-xs mt-3 break-words';
        const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'pm-btn-secondary mt-2';
        refresh.textContent = t('catalog_refresh', 'Aggiorna catalogo');
        refresh.addEventListener('click', () => window.refreshGeminiModels && window.refreshGeminiModels());
        refreshPanel = () => {
            updates.forEach(update => update());
            if (provider !== 'infomaniak') return;
            let meta = {}; try { meta = JSON.parse(localStorage.getItem('infomaniak_catalogue_state') || '{}'); } catch (_) { /* vecchia cache */ }
            const C = window.MappAICatalogo;
            catalogueNote.textContent = t('catalog_updated', 'Catalogo aggiornato:') + ' ' + (meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString() : '—') +
                (meta.stale ? ' · ' + t('catalog_offline', 'Ultimo aggiornamento non riuscito; elenco precedente') : '') +
                ' · ' + t('catalog_rates', 'Tariffe CHF, IVA esclusa, listino del') + ' ' + (C ? C.DATE : '—');
            const other = catalog().filter(m => !C || !C.forPhase([m], 'mappa').length && !C.forPhase([m], 'embeddings').length);
            if (other.length) catalogueNote.textContent += '\n' + t('catalog_other', 'Altri servizi o modelli non disponibili per queste fasi:') + ' ' + other.map(m => m.id + (C ? ' (' + C.priceLabel(m.id, t) + ')' : '')).join(', ');
        };
        host.append(save, status);
        if (provider === 'infomaniak') host.append(refresh, catalogueNote);
        host.append(next, summary); refreshPanel(); mostraGiro(lastRun);
    }
    function mostraGiro(run) {
        lastRun = run;
        const host = document.getElementById('modelli-riepilogo'); if (!host || !run) return;
        host.replaceChildren();
        const title = document.createElement('p'); title.className = 'font-bold';
        title.textContent = t('modelli_last_run', 'Modelli chiamati nell’ultimo giro'); host.append(title);
        const rows = new Map();
        (run.chiamate || []).forEach(c => rows.set(c.phase + c.requestedModel + c.actualModel, c));
        for (const c of rows.values()) {
            const row = document.createElement('p');
            row.textContent = (labels[c.phase] ? t(...labels[c.phase]) : c.phase) + ': ' + c.provider + ' · ' + c.requestedModel + ' → ' +
                (c.actualModel || t('modelli_unknown_actual', 'modello effettivo non dichiarato'));
            host.append(row);
        }
    }
    window.MappAIModelliUI = { render, mostraGiro, aggiornaCatalogo: () => refreshPanel() };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
})();
