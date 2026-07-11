/*
 * mappai-menu-hubs.js — hub modali del menu azioni rapide (11/7/26)
 * -------------------------------------------------------------------
 * Richiesta utente: il menu lungo spaventa i docenti poco esperti.
 * Il menu si asciuga a pochi bottoni; le voci vivono in due modali
 * stile launcher "Studio attivo":
 *   - window.openStudyMaterialsModal() → 🖨 Materiali di studio
 *       sezioni: Stampati (Foglio nodi, Sintesi ramo, Dossier, Timeline)
 *                JIGSAW  (Esporta, Ricomponi, Revisione lacune)
 *   - window.openGraphManagerModal()  → 🗂 Graph manager
 *       sezioni: Vault (esporta/importa) · File JSON (importa/unisci/dungeon
 *                se kill-switch attivo) · Appunti (esporta MD)
 * Le card sono PULITE (icona + titolo): niente testi grigi esplicativi.
 * Le spiegazioni vivono nei TOOLTIP HOVER (window.MappAITips): qualunque
 * elemento con data-tip="..." in QUALSIASI modale li eredita (delega globale).
 *
 * i18n: titoli card riusano le chiavi ui_* / tt_* già presenti in ENTRAMBI
 * i dizionari; le stringhe nuove solo-JS seguono la regola 13 (fallback IT
 * inline + chiave in en_translations.js).
 */
(function () {
    'use strict';

    /* ── Tooltip hover globale ─────────────────────────────────────────────
     * Un solo div riusato, delega su document: vale per tutti i modali
     * presenti e futuri. Posizionato sopra l'elemento (sotto se non c'è
     * spazio), clamp ai bordi finestra. Sparisce su mouseout/scroll. */
    let tipEl = null;
    function ensureTip() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.id = 'mappai-tip';
        tipEl.style.cssText = 'position:fixed;z-index:2147483000;max-width:280px;' +
            'background:#0f172a;color:#f1f5f9;font-size:12.5px;line-height:1.5;' +
            'padding:8px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.28);' +
            'pointer-events:none;opacity:0;transition:opacity .12s;';
        document.body.appendChild(tipEl);
        return tipEl;
    }
    function showTip(target) {
        const txt = target.getAttribute('data-tip');
        if (!txt) return;
        const el = ensureTip();
        el.textContent = txt;
        el.style.opacity = '0';
        requestAnimationFrame(() => {
            const r = target.getBoundingClientRect();
            const w = el.offsetWidth, h = el.offsetHeight;
            let x = r.left + r.width / 2 - w / 2;
            x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
            let y = r.top - h - 8;
            if (y < 8) y = r.bottom + 8;
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.opacity = '1';
        });
    }
    function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }
    document.addEventListener('mouseover', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (t) showTip(t);
    });
    document.addEventListener('mouseout', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (t) hideTip();
    });
    window.addEventListener('scroll', hideTip, true);
    window.MappAITips = { show: showTip, hide: hideTip };

    /* ── Modale hub (stesso linguaggio visivo del launcher Studio attivo) ── */
    function esc(s) { return String(s || '').replace(/"/g, '&quot;'); }

    // titolo con icona Lucide SVG (mai emoji — richiesta utente 11/7/26)
    function buildHubModal(icon, title, bodyHtml, maxWidth) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(15,23,42,.45);' +
            'display:flex;align-items:center;justify-content:center;padding:18px;';
        overlay.innerHTML = `<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);
            width:min(${maxWidth || '760px'},94vw);max-height:88vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">
                    <i data-lucide="${icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>${title}</div>
                <button type="button" class="hub-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>
            </div>
            ${bodyHtml}
        </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('.hub-close').onclick = () => overlay.remove();
        const escH = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escH); } };
        document.addEventListener('keydown', escH);
        document.body.appendChild(overlay);
        if (window.safeCreateIcons) window.safeCreateIcons();
        return overlay;
    }

    const sectionHeader = (txt) =>
        `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:14px 0 8px">${txt}</div>`;

    // card pulita: icona + titolo; spiegazione SOLO nel tooltip hover.
    // ok=false → card spenta con motivo nel tooltip (niente attributo disabled:
    // gli elementi disabled non emettono eventi mouse → il tooltip non uscirebbe).
    function card(c) {
        const off = !c.ok;
        return `<button type="button" class="hub-card" data-act="${c.key}" data-tip="${esc(off ? c.offTip : c.tip)}"
            style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:#fff;
            border:1px solid #e2e8f0;border-radius:12px;padding:13px 14px;cursor:${off ? 'default' : 'pointer'};
            transition:border-color .15s;${off ? 'opacity:.45' : ''}">
            <i data-lucide="${c.icon}" style="width:20px;height:20px;color:#4f46e5;flex:0 0 auto"></i>
            <span style="font-weight:700;font-size:13.5px;color:#0f172a">${c.title}</span>
        </button>`;
    }

    function grid(cards) {
        return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px">${cards.map(card).join('')}</div>`;
    }

    function wire(overlay, actions) {
        overlay.querySelectorAll('.hub-card').forEach(btn => {
            const act = actions[btn.dataset.act];
            if (!act || !act.ok) return;
            btn.onmouseenter = () => btn.style.borderColor = '#4f46e5';
            btn.onmouseleave = () => btn.style.borderColor = '#e2e8f0';
            btn.onclick = () => { hideTip(); overlay.remove(); act.fn(); };
        });
    }

    const t = (k, f) => (window.t ? window.t(k, f) : f);

    // Modalità JIGSAW studente: le funzioni docente (export/ricomponi/lacune)
    // e l'import JSON bulk NON devono comparire (prima li nascondeva
    // _syncStudentUI sui bottoni del menu; ora il gate vive qui).
    const jigsawStudentOn = () => ['1', 'true'].includes(localStorage.getItem('mappai_jigsaw_mode'));

    /* ── 🖨 Materiali di studio ────────────────────────────────────────────── */
    window.openStudyMaterialsModal = function () {
        const J = window.MappAIJigsaw;
        const offTip = t('hub_fn_missing', 'Funzione non disponibile in questa versione.');
        const defs = {
            sheet:    { icon: 'scissors',        ok: !!window.openNodeLabelsPrintModal,  fn: () => window.openNodeLabelsPrintModal(),
                        title: t('ui_node_sheet_btn', 'Foglio nodi'),        tip: t('tt_node_sheet', 'Foglio stampabile con i nodi da ritagliare (forbici).') },
            synth:    { icon: 'sparkles',        ok: !!window.openBranchSynthesisModal,  fn: () => window.openBranchSynthesisModal(),
                        title: t('ui_branch_synth', 'Sintesi di ramo (AI)'), tip: t('tt_branch_synthesis', 'Genera una sintesi narrativa con citazioni di un ramo.') },
            dossier:  { icon: 'files',           ok: !!window.openDossierPrintModal,     fn: () => window.openDossierPrintModal(),
                        title: t('ui_print_dossier_btn', 'Stampa dossier'),  tip: t('tt_print_dossier', 'Dossier PDF stampabile con i contenuti della mappa.') },
            timeline: { icon: 'gantt-chart',     ok: !!window.openTimelineGeneratorModal, fn: () => window.openTimelineGeneratorModal(),
                        title: t('ui_create_timeline', 'Crea Timeline'),     tip: t('tt_gen_timeline', 'Genera una timeline cronologica con l\'AI.') },
            jexport:  { icon: 'users',           ok: !!(J && J.openExportModal),    fn: () => J.openExportModal(),
                        title: t('ui_export_jigsaw', 'Esporta JIGSAW'),      tip: t('tt_jigsaw_export', 'Una copia per gruppo: editing sbloccato su un solo ramo, studio su tutta la mappa.') },
            jmerge:   { icon: 'git-merge',       ok: !!(J && J.openReconcileModal), fn: () => J.openReconcileModal(),
                        title: t('ui_reassemble_copies', 'Ricomponi copie'), tip: t('tt_jigsaw_merge', 'Ricompone le copie dei gruppi nel master: rami lavorati + ponti ratificati.') },
            jgap:     { icon: 'clipboard-check', ok: !!(J && J.openGapModal),       fn: () => J.openGapModal(),
                        title: t('ui_gap_review', 'Revisione lacune'),       tip: t('tt_jigsaw_compare', 'Confronta le copie col master: elenco lacune per la revisione privata.') }
        };
        Object.keys(defs).forEach(k => { defs[k].key = k; defs[k].offTip = offTip; });
        let body =
            sectionHeader(t('mh_section_print', 'Stampati')) +
            grid([defs.sheet, defs.synth, defs.dossier, defs.timeline]);
        if (!jigsawStudentOn()) {   // funzioni docente: nascoste sulle copie studente
            body += sectionHeader(t('mh_section_jigsaw', 'JIGSAW — lavoro a gruppi')) +
                grid([defs.jexport, defs.jmerge, defs.jgap]);
        }
        const overlay = buildHubModal('printer', t('ui_materials_hub', 'Materiali di studio'), body, '720px');
        wire(overlay, defs);
    };

    /* ── Graph manager ─────────────────────────────────────────────────────── */
    window.openGraphManagerModal = function () {
        const clickInput = (id) => { const el = document.getElementById(id); if (el) el.click(); };
        const offTip = t('hub_fn_missing', 'Funzione non disponibile in questa versione.');
        const defs = {
            vexport: { icon: 'archive',     ok: !!window.saveMapVault, fn: () => window.saveMapVault(),
                       title: t('ui_export_vault', 'Esporta nel Vault'), tip: t('tt_save_vault', 'Salva la mappa come vault Markdown (cartella compatibile Obsidian).') },
            vimport: { icon: 'folder-open', ok: !!window.loadMapVault, fn: () => window.loadMapVault(),
                       title: t('ui_import_vault', 'Importa dal Vault'), tip: t('tt_open_vault', 'Riapre una mappa salvata come vault Markdown.') },
            jimport: { icon: 'upload',      ok: !!document.getElementById('menu-import-json'), fn: () => clickInput('menu-import-json'),
                       title: t('import_json', 'Importa JSON'),          tip: t('tt_import_json', 'Importa una mappa da file JSON.') },
            jmergef: { icon: 'merge',       ok: !!document.getElementById('sidebar-merge'), fn: () => clickInput('sidebar-merge'),
                       title: t('ui_merge_maps', 'Unisci Mappe'),        tip: t('tt_merge_json', 'Unisce un altro JSON alla mappa corrente.') },
            notes:   { icon: 'file-text',   ok: !!window.exportNotesMarkdown, fn: () => window.exportNotesMarkdown(),
                       title: t('ui_export_notes', 'Esporta Appunti'),   tip: t('tt_export_notes_md', 'Esporta gli appunti della mappa in Markdown.') },
            dungeon: { icon: 'castle',      ok: !!document.getElementById('menu-import-floorplan'), fn: () => clickInput('menu-import-floorplan'),
                       title: t('ui_import_floorplan', 'Importa piano Dungeon'), tip: t('tt_import_floorplan', 'Importa un piano del Memory Dungeon nel vault.') }
        };
        Object.keys(defs).forEach(k => { defs[k].key = k; defs[k].offTip = offTip; });
        // JIGSAW studente: niente import JSON (bypass dei lock di ramo)
        const jsonCards = jigsawStudentOn() ? [defs.jmergef] : [defs.jimport, defs.jmergef];
        // il dungeon è nascosto di default (pivot Knowledge Garden): appare solo col kill-switch
        if (localStorage.getItem('mappai_dungeon_visible') === '1') jsonCards.push(defs.dungeon);
        const body =
            sectionHeader(t('gm_section_vault', 'Vault (salvataggio consigliato)')) +
            grid([defs.vexport, defs.vimport]) +
            sectionHeader(t('gm_section_json', 'File JSON')) +
            grid(jsonCards) +
            sectionHeader(t('gm_section_notes', 'Appunti')) +
            grid([defs.notes]);
        const overlay = buildHubModal('folder-cog', t('ui_graph_manager', 'Graph manager'), body, '720px');
        wire(overlay, defs);
    };

    console.log('[MappAIMenuHubs] hub Materiali di studio + Graph manager + tooltip caricati');
})();
