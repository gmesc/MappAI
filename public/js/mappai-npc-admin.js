// ============================================================================
// mappai-npc-admin.js — Pannello "Gestione NPC" nella Developer Dashboard.
// Caricato DOPO admin_prompts.js. Espone window.MappAINpcAdmin.
//
// Mostra: stato motore LLM locale (RAM, modello caricato), modello attivo,
// modelli GGUF consigliati con download in-app (progresso), file picker locale,
// URL diretto. Il prompt NPC_NARRATOR resta nella lista laterale (tab NPC).
// Vedi docs/game-design/NPC_SYSTEM_SDS.md.
// ============================================================================
(function () {
    'use strict';

    const LS_MODEL = 'mappai_npc_model_path';

    // Modelli consigliati (italiano, MacBook Air 16 GB), generazione 2026.
    // role: 'narrazione' (NPC del prato) | 'azione' (NPC del dungeon, JSON/tool).
    // downloadUrl = best-effort: se 404, usa "pagina ↗" (download manuale) o l'URL diretto.
    const MODELS = [
        // — Narrazione (NPC narranti del prato) —
        {
            id: 'gemma4-e4b-q4', role: 'narrazione', name: 'Gemma 4 E4B-it (Q4_K_M)', sizeGB: 5.3, italiano: '★★★', recommended: true,
            note: 'Default — italiano ottimo, gen. 2026',
            fileName: 'gemma-4-E4B-it-Q4_K_M.gguf',
            downloadUrl: 'https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf',
            repoUrl: 'https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF'
        },
        {
            id: 'ministral3-8b-q4', role: 'narrazione', name: 'Ministral 3 8B Instruct (Q4_K_M)', sizeGB: 4.9, italiano: '★★★', recommended: false,
            note: 'Italiano top, Mistral europeo (GDPR)',
            fileName: 'Ministral-3-8B-Instruct-2512-Q4_K_M.gguf',
            downloadUrl: 'https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF/resolve/main/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf',
            repoUrl: 'https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF'
        },
        // — Azione / tool (NPC del dungeon: decisioni, JSON, reazioni) —
        {
            id: 'qwen35-4b-q4', role: 'azione', name: 'Qwen3.5 4B (Q4_K_M)', sizeGB: 2.6, italiano: '★★☆', recommended: true,
            note: 'Tool/JSON + ragionamento, leggero',
            fileName: 'Qwen3.5-4B-Q4_K_M.gguf',
            downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
            repoUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF'
        },
        {
            id: 'qwen35-08b-q4', role: 'azione', name: 'Qwen3.5 0.8B (Q4_K_M)', sizeGB: 0.6, italiano: '★☆☆', recommended: false,
            note: 'Decisioni rapidissime per behavior NPC',
            fileName: 'Qwen3.5-0.8B-Q4_K_M.gguf',
            downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
            repoUrl: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF'
        }
    ];

    function _api() { return window.electronAPI; }
    function _toast(m, t) { if (window.showToast) window.showToast(m, t); else console.log('[NPC]', m); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function getActiveModel() { try { return localStorage.getItem(LS_MODEL) || null; } catch (e) { return null; } }
    function setActiveModel(p) {
        try { localStorage.setItem(LS_MODEL, p); } catch (e) { }
        _toast('Modello NPC attivo impostato', 'success');
        refresh();
    }

    async function refresh() {
        const api = _api();
        // Stato motore
        const statusEl = document.getElementById('npc-status-body');
        if (statusEl && api && api.npcModelStatus) {
            try {
                const s = await api.npcModelStatus();
                const free = s.freeRamMB ? (s.freeRamMB / 1024).toFixed(1) : '?';
                const tot = s.totalRamMB ? (s.totalRamMB / 1024).toFixed(1) : '?';
                statusEl.innerHTML =
                    `<div>Modello caricato in memoria: <b>${s.loaded ? 'sì' : 'no'}</b></div>` +
                    `<div>RAM libera: <b>${free} GB</b> / ${tot} GB</div>` +
                    `<div>NPC attivi (sessioni): <b>${s.activeNpcs || 0}</b></div>`;
            } catch (e) { statusEl.textContent = 'Stato non disponibile (' + e.message + ')'; }
        }
        // Modello attivo
        const activeEl = document.getElementById('npc-active-model');
        if (activeEl) {
            const p = getActiveModel();
            activeEl.innerHTML = p
                ? `<span class="text-emerald-600 font-bold">✅</span> ${_esc(p)}`
                : '<span class="text-slate-400">Nessun modello selezionato</span>';
        }
        // Lista modelli consigliati + modelli scaricati (con elimina)
        await renderModelList();
        await renderLocalList();
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    // Elenco dei GGUF presenti in userData/models, con "Usa" ed "Elimina".
    async function renderLocalList() {
        const el = document.getElementById('npc-local-list');
        if (!el) return;
        const api = _api();
        let local = [];
        if (api && api.npcListLocalModels) {
            try { const r = await api.npcListLocalModels(); if (r.success) local = r.models || []; } catch (e) { }
        }
        if (!local.length) {
            el.innerHTML = '<div class="text-xs text-slate-400 italic">Nessun modello scaricato in userData/models.</div>';
            return;
        }
        const active = getActiveModel();
        el.innerHTML = local.map(m => {
            const isActive = active === m.path;
            const sizeGB = (m.sizeMB / 1024).toFixed(1);
            const useBtn = isActive
                ? '<span class="text-emerald-600 text-xs font-bold">✅ Attivo</span>'
                : `<button data-act="use" data-path="${_esc(m.path)}" class="px-2 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg hover:bg-emerald-100 text-xs">Usa</button>`;
            return `<div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <div class="min-w-0">
                    <div class="text-sm text-slate-700 truncate">${_esc(m.fileName)}</div>
                    <div class="text-[11px] text-slate-400">${sizeGB} GB</div>
                </div>
                <div class="shrink-0 flex items-center gap-2">${useBtn}
                    <button data-act="del" data-path="${_esc(m.path)}" data-name="${_esc(m.fileName)}" title="Elimina modello"
                        class="px-2 py-1 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 text-xs flex items-center gap-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>`;
        }).join('');
        el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
            const act = b.getAttribute('data-act');
            if (act === 'use') setActiveModel(b.getAttribute('data-path'));
            else if (act === 'del') deleteModel(b.getAttribute('data-path'), b.getAttribute('data-name'));
        }));
    }

    async function deleteModel(p, name) {
        if (!confirm('Eliminare il modello "' + name + '"?\nL\'operazione è irreversibile (libera spazio su disco).')) return;
        const api = _api();
        if (!api || !api.npcDeleteModel) { _toast('Eliminazione non disponibile', 'error'); return; }
        const r = await api.npcDeleteModel({ path: p });
        if (r.success) {
            if (getActiveModel() === p) { try { localStorage.removeItem(LS_MODEL); } catch (e) { } } // era attivo → deseleziona
            _toast('Modello eliminato', 'success');
            refresh();
        } else { _toast('Eliminazione fallita: ' + r.error, 'error'); }
    }

    async function renderModelList() {
        const listEl = document.getElementById('npc-model-list');
        if (!listEl) return;
        const api = _api();
        let local = [];
        if (api && api.npcListLocalModels) {
            try { const r = await api.npcListLocalModels(); if (r.success) local = r.models || []; } catch (e) { }
        }
        const localByName = {}; local.forEach(m => { localByName[m.fileName] = m; });
        const active = getActiveModel();

        listEl.innerHTML = MODELS.map(m => {
            const got = localByName[m.fileName];
            const isActive = got && active === got.path;
            const badge = m.recommended ? '<span class="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Consigliato</span>' : '';
            const roleTag = m.role === 'azione'
                ? '<span class="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">azione</span>'
                : '<span class="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">narrazione</span>';
            let action;
            if (isActive) {
                action = '<span class="text-emerald-600 text-sm font-bold flex items-center gap-1">✅ Attivo</span>';
            } else if (got) {
                action = `<button data-act="use" data-path="${_esc(got.path)}" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 font-bold rounded-lg hover:bg-emerald-100 text-sm">Usa</button>`;
            } else {
                action =
                    `<button data-act="dl" data-id="${m.id}" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 font-bold rounded-lg hover:bg-indigo-100 text-sm">Scarica</button>` +
                    `<a href="#" data-act="page" data-url="${_esc(m.repoUrl)}" class="text-xs text-slate-400 hover:text-indigo-600 ml-2">pagina ↗</a>`;
            }
            return `<div class="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3" data-card="${m.id}">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-slate-800 text-sm">${_esc(m.name)}</span> ${roleTag} ${badge}
                    </div>
                    <div class="text-xs text-slate-500">${m.sizeGB} GB · italiano ${m.italiano} · ${_esc(m.note)}</div>
                    <div class="npc-dl-progress hidden mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="npc-dl-bar h-full bg-indigo-500" style="width:0%"></div></div>
                </div>
                <div class="shrink-0 flex items-center">${action}</div>
            </div>`;
        }).join('');

        // wiring azioni
        listEl.querySelectorAll('[data-act]').forEach(el => {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const act = el.getAttribute('data-act');
                if (act === 'use') setActiveModel(el.getAttribute('data-path'));
                else if (act === 'page') { const u = el.getAttribute('data-url'); if (api && api.openExternal) api.openExternal(u); }
                else if (act === 'dl') downloadModel(el.getAttribute('data-id'));
            });
        });
    }

    async function downloadModel(modelId) {
        const m = MODELS.find(x => x.id === modelId);
        if (!m) return;
        const api = _api();
        if (!api || !api.npcDownloadModel) { _toast('Download non disponibile', 'error'); return; }
        const card = document.querySelector(`[data-card="${modelId}"]`);
        const prog = card && card.querySelector('.npc-dl-progress');
        const bar = card && card.querySelector('.npc-dl-bar');
        if (prog) prog.classList.remove('hidden');
        _toast(`Scarico ${m.name}… (${m.sizeGB} GB)`, 'info');

        const unsub = api.onNpcDownloadProgress ? api.onNpcDownloadProgress((p) => {
            if (p.modelId !== modelId) return;
            if (bar && p.pct != null) bar.style.width = p.pct + '%';
        }) : null;

        try {
            const r = await api.npcDownloadModel({ url: m.downloadUrl, fileName: m.fileName, modelId });
            if (r.success) { _toast(`${m.name} scaricato`, 'success'); setActiveModel(r.path); }
            else { _toast('Download fallito: ' + r.error + ' — prova "pagina ↗" o URL diretto', 'error'); }
        } catch (e) { _toast('Download fallito: ' + e.message, 'error'); }
        finally { if (unsub) unsub(); refresh(); }
    }

    async function pickLocal() {
        const api = _api();
        if (!api || !api.pickFile) { _toast('Picker non disponibile', 'error'); return; }
        const r = await api.pickFile();
        if (r && !r.canceled && r.filePath) {
            if (!r.filePath.toLowerCase().endsWith('.gguf')) { _toast('Seleziona un file .gguf', 'error'); return; }
            setActiveModel(r.filePath);
        }
    }

    async function downloadCustom() {
        const input = document.getElementById('npc-custom-url');
        const url = input && input.value.trim();
        if (!url) { _toast('Inserisci un URL GGUF', 'error'); return; }
        const fileName = (url.split('/').pop() || 'modello.gguf').split('?')[0];
        if (!fileName.toLowerCase().endsWith('.gguf')) { _toast('L\'URL deve puntare a un .gguf', 'error'); return; }
        const api = _api();
        _toast('Scarico da URL…', 'info');
        try {
            const r = await api.npcDownloadModel({ url, fileName, modelId: 'custom' });
            if (r.success) { _toast('Scaricato', 'success'); setActiveModel(r.path); }
            else _toast('Download fallito: ' + r.error, 'error');
        } catch (e) { _toast('Download fallito: ' + e.message, 'error'); }
    }

    // Mostra/nascondi il pannello in base al tab attivo della dashboard.
    function syncWithTab(tab, currentKey) {
        const panel = document.getElementById('npc-management-panel');
        if (!panel) return;
        const show = (tab === 'NPC' && !currentKey);
        panel.style.display = show ? 'flex' : 'none';
        if (show) refresh();
    }

    // Riporta il pannello gestione in primo piano (deseleziona il prompt).
    function openManagement() {
        window.currentAdminPromptKey = null;
        if (window.renderAdminPromptsList) window.renderAdminPromptsList();
    }

    window.MappAINpcAdmin = { refresh, renderModelList, downloadModel, pickLocal, downloadCustom, syncWithTab, openManagement, MODELS };
})();
