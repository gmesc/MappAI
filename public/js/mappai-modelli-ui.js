/* Setup del profilo pubblico; i segreti appartengono ai trasporti esistenti. */
(function () {
    'use strict';
    const t = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
    const labels = { mappa: ['modelli_map', 'Mappa'], materiali: ['modelli_materials', 'Materiali'],
        embeddings: ['modelli_embeddings', 'Analisi semantica (embeddings)'], giudice: ['modelli_judge', 'Giudice'] };
    let lastRun = null;
    let refreshPanel = () => {};
    function state() { return typeof appState !== 'undefined' ? appState : window.appState || {}; }
    function catalog() {
        try { const rows = JSON.parse(localStorage.getItem('infomaniak_available_models') || '[]'); return Array.isArray(rows) ? rows : []; }
        catch (_) { return []; }
    }
    /* I modelli dei vettori di Google: li deposita `refreshGeminiModels` tenendo quelli che
       rispondono a `embedContent`. Deposito muto = tendina con la sola scelta di adesso. */
    function catalogoVettori() {
        try { const rows = JSON.parse(localStorage.getItem('gemini_embedding_models') || '[]'); return Array.isArray(rows) ? rows.filter(m => m && m.id) : []; }
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
            /* Il giudice parte dal modello scelto, come mappa e materiali (0088, B11): con la revisione accesa
               gira sempre, e un campo vuoto fermava «Più materiali insieme» su «Assegna un modello al giudice…».
               Un profilo già salvato non passa di qui, e il blocco di `mappai-modelli.js` resta per chi svuota il campo. */
            profile = { schema: 'mappai-modelli@1', provider, modelli: { mappa: selected, materiali: selected,
                embeddings: provider === 'infomaniak' ? 'bge_multilingual_gemma2' : 'gemini-embedding-001', giudice: selected, reranking: null } };
        }
        const help = document.createElement('p'); help.className = 'text-sm mt-2';
        help.textContent = t('modelli_help', 'Le scelte valgono dal prossimo avvio. Un lavoro già avviato mantiene i suoi modelli. Puoi usare lo stesso modello per più fasi.');
        host.append(help);
        const inputs = {};
        const updates = [];
        Object.keys(labels).forEach(phase => {
            const row = document.createElement('label'); row.className = 'block text-sm mt-3';
            const title = document.createElement('span'); title.textContent = t(...labels[phase]);
            /* Ogni fase è un menu a tendina VERO, come «Modello AI» e «Modello per le foto» (0088, B13). Prima era un campo di testo con
               una lista a scomparsa (`datalist`) che filtrava le voci con ciò che c'era scritto: con un modello già scelto, nella
               lista restava solo quello. Un `select` mostra sempre tutte le voci, e la classe `form_input` gli dà gli stessi token
               grafici della console (B12: fondo neutro, altezza e corpo dei controlli, raggio dei campi — packet 0087 lotto 5,
               `mappai-modal-tokens.css`). */
            const campo = document.createElement('select'); campo.id = 'modelli-' + phase;
            campo.className = 'form_input';
            const hint = document.createElement('p'); hint.className = 'text-xs mt-1 break-words';
            /* La scelta di adesso: parte dal profilo e poi la tiene il menu (anche «nessuno»), così un ridisegno dell'elenco non la
               rimette com'era. Le voci: con Infomaniak il catalogo vivo per quella fase; con Google i modelli della tendina
               principale (per i vettori, quelli che rispondono a `embedContent`, 10/10/26) — non un elenco scritto a mano, che
               invecchierebbe al primo modello nuovo. La scelta di adesso resta SEMPRE fra le voci, anche se l'elenco non la
               conosce: un menu non deve mai cancellare in silenzio un'assegnazione già salvata. */
            let corrente = profile.modelli[phase] || '';
            const update = () => {
                const C = window.MappAICatalogo;
                /* ⚠️ I vettori NON prendono mai i modelli di chat (ADR 0004: la tendina generativa non può sostituire il modello di
                   vettori): con Google sono solo quelli che rispondono a `embedContent` (`gemini_embedding_models`, 11/10), con
                   Infomaniak solo quelli del catalogo per la fase «embeddings»; senza elenco restano la scelta di adesso e l'avviso. */
                const vettori = phase === 'embeddings';
                let righe;
                if (vettori && provider === 'infomaniak') righe = C ? C.forPhase(catalog(), phase).map(m => ({ value: m.id, label: m.id + ' — ' + C.priceLabel(m.id, t) })) : [];
                else if (vettori) righe = catalogoVettori().map(m => ({ value: m.id,
                    label: m.displayName && m.displayName !== m.id ? m.displayName + ' · ' + m.id : m.id }));
                else if (provider === 'infomaniak' && C) righe = C.forPhase(catalog(), phase).map(m => ({ value: m.id, label: m.id + ' — ' + C.priceLabel(m.id, t) }));
                else righe = Array.from(document.getElementById('model-select')?.options || []).filter(o => o.value).map(o => ({ value: o.value, label: o.textContent }));
                const noti = righe.length;
                if (corrente && !righe.some(r => r.value === corrente)) {
                    const voce = { value: corrente, label: noti && provider === 'infomaniak' ? corrente + ' — ' + t('catalog_not_available', 'Non disponibile nel catalogo aggiornato') : corrente };
                    if (vettori && provider !== 'infomaniak') righe.unshift(voce); else righe.push(voce);   // i vettori di Google: in cima, com'era dall'11/10
                }
                campo.replaceChildren();
                [{ value: '', label: t('modelli_scegli', '— scegli un modello —') }].concat(righe).forEach(r => {
                    const option = document.createElement('option'); option.value = r.value; option.textContent = r.label; campo.append(option);
                });
                campo.value = corrente;
                if (provider === 'infomaniak' && C && corrente.trim()) {
                    const selected = catalog().find(m => C.canonical(m.id) === C.canonical(corrente));
                    const valid = selected && C.forPhase([selected], phase).length;
                    /* il prezzo sta già nella voce («modello — prezzo»): sotto resta solo ciò che la voce non dice */
                    hint.textContent = valid
                        ? (selected.availability === 'product' ? t('catalog_product', 'Elencato dal prodotto') : t('catalog_product_unverified', 'Accesso del prodotto da verificare'))
                        : t('catalog_wrong_phase', 'Modello non verificato per questa funzione: aggiorna il catalogo e scegli dalla lista.');
                } else hint.textContent = vettori && provider !== 'infomaniak' && !noti
                    ? t('modelli_embeddings_vuoto', 'Elenco non ancora caricato: premi «Aggiorna Modelli» qui sopra.') : '';
            };
            campo.addEventListener('change', () => { corrente = campo.value; update(); });
            update(); updates.push(update);
            row.append(title, campo, hint);
            host.append(row); inputs[phase] = campo;
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
    /* Con Google le voci dei menu per fase sono quelle di `#model-select`, che `refreshGeminiModels` riempie DOPO aver avvisato
       il pannello: si osserva la tendina principale, così i menu per fase seguono il suo ridisegno (0088, B13). */
    function osservaTendinaPrincipale() {
        if (typeof MutationObserver === 'undefined') return;
        const n = document.getElementById('model-select');
        if (n) new MutationObserver(() => refreshPanel()).observe(n, { childList: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { osservaTendinaPrincipale(); render(); });
    else { osservaTendinaPrincipale(); render(); }
})();
