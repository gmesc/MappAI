/* One relation, the standard modal, the existing vault/review writers. */
(function () {
    'use strict';
    const state = () => typeof appState !== 'undefined' ? appState : window.appState;
    const storage = () => typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;
    const core = () => window.MappAILinkEditorCore;
    const t = (k, s) => window.t ? window.t(k, s) : s;
    const clone = x => JSON.parse(JSON.stringify(x));
    const toast = (text, type) => window.showToast && window.showToast(text, type);
    let opened = false;
    function enabled() { try { return localStorage.getItem('mappai_link_editor') !== '0'; } catch (_) { return true; } }
    function guard(context, ref) {
        const s = state();
        if (s !== context.state || s.db !== context.db || s.activeVaultPath !== context.vault ||
            (storage() && storage().currentProjectId) !== context.project) throw new Error('link_changed');
        if (s._reviewRestoring || s._reviewLoading || s._reviewRestoreError || s._reviewCommit ||
            window.MappAIGen?.attiva() || window.MappAIPipeline?.occupata?.() || window.MappAIReview?.isBusy()) throw new Error('link_busy');
        const link = core().find(s.db, ref);
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWriteLink(link, 'rinomina link')) throw new Error('link_locked');
        return link;
    }
    function message(error) {
        const code = error && error.message;
        if (code === 'link_changed') return t('le_changed', 'Il progetto o il collegamento è cambiato. Riapri il collegamento per modificarlo.');
        if (code === 'link_busy') return t('le_busy', 'Attendi la fine della generazione o del salvataggio della revisione.');
        if (code === 'link_locked') return t('le_locked', 'Questo collegamento è bloccato per la modifica.');
        if (code === 'ambiguous_label') return t('le_duplicate', 'Esiste già un collegamento con queste parole e questo verso tra i due concetti. Scegli un testo diverso.');
        if (code === 'empty_review_label') return t('le_empty_review_choice', 'Scrivi una relazione oppure scegli «Nessuna» nel tipo di relazione.');
        if (code === 'stale_revision') return t('le_stale_review', 'La mappa non corrisponde alla revisione aperta. Le decisioni sono conservate: riapri la versione corretta prima di modificarla.');
        return t('le_save_error', 'Modifica non salvata. Il testo resta nella finestra. Dettaglio: ') + (code || '—');
    }
    function context() {
        const s = state();
        return { state: s, db: s.db, vault: s.activeVaultPath, project: storage() && storage().currentProjectId };
    }
    function render() {
        try {
            if (typeof renderGraph === 'function') renderGraph();
            else if (window.renderGraph) window.renderGraph();
            window.MappAIStudioView?.refreshLinks?.();
        } catch (e) { console.warn('[LinkEditor] render:', e); }
    }
    async function writeLabel(ctx, ref, value, opts) {
        guard(ctx, ref);
        const projected = core().withLabel(ctx.db, ref, value, opts);
        if (ctx.vault) {
            if (!window.electronAPI?.saveVault || !window.buildVaultMapData) throw new Error('Vault non disponibile');
            const payload = clone(Object.assign({}, window.buildVaultMapData(), { links: projected.links }));
            const result = await window.electronAPI.saveVault({ folderPath: ctx.vault, mapData: payload });
            if (!result?.success) throw new Error(result?.error || 'Vault non disponibile');
        }
        const live = guard(ctx, ref);
        live.rel = String(value).trim();
        if (!live.rel && opts?.relNone === true) live.relNone = true;
        else delete live.relNone;
        render();
        if (ctx.vault) { try { window.MappAIVaults?.segnala('mappa-salvata', { vaultPath: ctx.vault }); } catch (_) { /* disk is already saved */ } }
    }
    async function save(ctx, ref, value, opts) {
        guard(ctx, ref);
        const review = window.MappAIReview?.current();
        if (review?.initial.status === 'awaiting_review') {
            const undo = await window.MappAIReview.editLinkLabel(ref, value, opts);
            return { mode: 'review', undo };
        }
        if (review && review.initial.status !== 'approved') throw new Error('link_busy');
        await writeLabel(ctx, ref, value, opts);
        const after = Object.assign({}, ref, { rel: String(value).trim(), relNone: opts.relNone });
        return { mode: ctx.vault ? 'vault' : 'local', undo: async () => {
            if (window.MappAIReview?.current() !== review) throw new Error('link_changed');
            await writeLabel(ctx, after, ref.rel, { relNone: ref.relNone === true });
        } };
    }
    async function open(link) {
        if (opened) return;
        const ctx = context(), ref = core().reference(link);
        try { guard(ctx, ref); } catch (e) { toast(message(e), 'warning'); return; }
        const review = window.MappAIReview?.current(), pending = review?.initial.status === 'awaiting_review';
        let names;
        try { names = core().labels(ctx.db, ref); } catch (e) { toast(message(e), 'warning'); return; }
        const original = pending ? core().draft(review, ref) : ref.rel;
        const originalNone = pending ? core().draftNone(review, ref) : ref.relNone === true;
        let value = original, none = originalNone, saving = false, box, saved;
        const R = window.MappAIRelations, lang = /^en/.test(window.currentLanguage || '') ? 'en' : 'it';
        const families = Object.keys(R.EDGE_FAMILIES);
        const sentence = rel => !rel.trim() && none
            ? names[0] + ' — ' + names[1] + ' · ' + t('le_none_preview', 'Collegamento senza parole')
            : names[0] + ' → ' + (rel.trim() || t('le_no_label', '(senza etichetta)')) + ' → ' + names[1];
        const help = pending
            ? t('le_review_help', 'La correzione sarà salvata nella revisione e applicata alla mappa quando la confermi. Le altre decisioni restano conservate.')
            : t('le_map_help', 'Cambia le parole del collegamento mantenendo il verso della freccia. I materiali già creati restano come sono.');
        const schema = {
            titolo: t('le_title', 'Modifica collegamento'), taglia: 'm', invio: false,
            sezioni: [
                { id: 'relation', titolo: t('le_words', 'Parole del collegamento'), testo: help, etichette: 'sopra',
                    campi: [{ id: 'relation', etichetta: t('le_label', 'Relazione'), valore: original }] },
                { id: 'preview', titolo: t('le_sentence', 'Leggi la frase completa'), testo: sentence(value), accento: true },
                { id: 'suggestions', titolo: t('le_suggestions', 'Suggerimenti per tipo di relazione'),
                    testo: t('le_suggestions_help', 'Scegli un suggerimento oppure scrivi con parole tue. Confronta il significato e il verso con la fonte: il suggerimento non è una verifica.'),
                    campi: [{ id: 'family', tipo: 'scelta', etichetta: t('le_family', 'Tipo di relazione'),
                        valore: none ? 'none' : R.getEdgeFamilyKey(original), opzioni: [{ valore: 'none', etichetta: t('le_none', 'Nessuna') }].concat(families.map(k => ({ valore: k, etichetta: R.getFamilyLabel(k, lang) }))) }] },
                { id: 'notice', testo: pending ? t('le_review_notice', 'Salvare questa scelta non equivale a un controllo automatico.') :
                    t('le_none_notice', 'Con «Nessuna» rimangono la linea e la gerarchia, senza parole sul collegamento. Questa scelta non equivale a un controllo automatico.') }
            ],
            azioni: [{ id: 'cancel', etichetta: t('ui_cancel', 'Annulla') },
                { id: 'save', etichetta: pending ? t('le_save_review', 'Salva nella revisione') : t('ui_save', 'Salva'), ruolo: 'primario', chiude: false }],
            suApertura(el) {
                box = el;
                box.setAttribute('data-link-editor', '');
                const input = box.querySelector('[data-campo="relation"]');
                const preview = box.querySelector('[data-sez="preview"] .mm-testo');
                preview.setAttribute('aria-live', 'polite');
                preview.style.overflowWrap = 'anywhere';
                const update = () => {
                    value = input.value;
                    if (value.trim()) { none = false; if (select.value === 'none') { select.value = R.getEdgeFamilyKey(value); suggest(); } }
                    preview.textContent = sentence(value);
                };
                input.addEventListener('input', update);
                const section = box.querySelector('[data-sez="suggestions"]');
                const chips = document.createElement('div'); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px'; section.appendChild(chips);
                const select = box.querySelector('[data-campo="family"]');
                function suggest() {
                    chips.replaceChildren();
                    if (select.value === 'none') return;
                    const family = R.EDGE_FAMILIES[select.value] || R.EDGE_FAMILIES.altro;
                    (lang === 'en' ? family.keywordsEn : family.keywords).forEach(word => {
                        const button = document.createElement('button'); button.type = 'button'; button.className = 'mm-btn mm-btn--secondario'; button.textContent = word;
                        button.onclick = () => { if (!saving) { input.value = word; update(); input.focus(); } };
                        chips.appendChild(button);
                    });
                }
                select.addEventListener('change', () => {
                    none = select.value === 'none';
                    if (none) input.value = '';
                    update(); suggest();
                }); suggest();
                const status = document.createElement('p'); status.setAttribute('role', 'status'); status.id = 'link-editor-status'; status.className = 'mm-testo'; section.appendChild(status);
            },
            suAzione(event) {
                if (event.azione === '__esc' && saving) return false;
                if (event.azione !== 'save' || saving) return;
                value = box.querySelector('[data-campo="relation"]').value;
                const relNone = !value.trim() && (none || !pending);
                if (value.trim() === original && relNone === originalNone) { box.querySelector('[data-azione="__chiudi"]').click(); return; }
                const status = box.querySelector('#link-editor-status');
                saving = true;
                const controls = box.querySelectorAll('button, input, select'); controls.forEach(e => { e.disabled = true; });
                status.textContent = t('le_saving', 'Salvataggio…');
                save(ctx, ref, value, { relNone }).then(result => {
                    saved = result;
                    window.pushUndoAction(t('le_title', 'Modifica collegamento'), async () => {
                        try { guard(ctx, Object.assign({}, ref, { rel: result.mode === 'review' ? ref.rel : value.trim(), relNone: result.mode === 'review' ? ref.relNone : relNone })); await result.undo(); return true; }
                        catch (e) { toast(message(e), 'error'); return false; }
                    });
                    toast(result.mode === 'review' ? t('le_saved_review', 'Correzione salvata nella revisione. Conferma la revisione per applicarla alla mappa.') :
                        result.mode === 'vault' ? t('le_saved', 'Collegamento salvato nel progetto.') : t('le_saved_local', 'Collegamento modificato. Esporta il progetto nel vault per conservarlo su disco.'), 'success');
                    saving = false; controls.forEach(e => { e.disabled = false; }); box.querySelector('[data-azione="__chiudi"]').click();
                }).catch(e => { saving = false; controls.forEach(e => { e.disabled = false; }); status.textContent = message(e); });
            }
        };
        opened = true;
        try { await window.MappAIModal.open(schema); return saved; }
        finally { opened = false; }
    }
    window.MappAILinkEditor = { enabled, open };
}());
