/**
 * mappai-suggestions-panel.js
 * Pannello UI "Suggerimenti strutturali" nella tab Struttura.
 *
 * Combina due fonti, entrambe READ-ONLY finché l'utente non clicca un'azione:
 *  - MappAIStructureAnalyzer.analyzeCurrentMap() — deterministico, gratis,
 *    sempre eseguito al click su "Analizza struttura".
 *  - MappAIEntityBackbone.analyzeCurrentMap() — 1 chiamata embeddings,
 *    eseguito solo su richiesta esplicita ("Includi analisi semantica").
 *
 * Le card "entità duplicata" offrono un'azione "Fondi qui" che richiama
 * window.executeMerge (mappai-node-merge.js) con conferma utente.
 *
 * Gated da localStorage 'mappai_structural_suggestions_panel_enabled'.
 * Dipende da: app.js (appState, executeSidebarSingleClick, showConfirm,
 * cleanLabel, showToast, safeCreateIcons), mappai-structure-analyzer.js,
 * mappai-entity-backbone.js, mappai-node-merge.js (executeMerge).
 */

(function () {
    'use strict';

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    const SEVERITY_STYLE = {
        high:   { dot: 'bg-red-500',   bg: 'bg-red-50',   border: 'border-red-100' },
        medium: { dot: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-100' },
        low:    { dot: 'bg-slate-400', bg: 'bg-slate-50', border: 'border-slate-100' }
    };

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function _renderGenericCard(s) {
        const style = SEVERITY_STYLE[s.severity] || SEVERITY_STYLE.low;
        const goBtn = s.nodeId
            ? `<button onclick="window.executeSidebarSingleClick('${s.nodeId}')" class="mt-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1">
                 <i data-lucide="crosshair" class="w-3 h-3"></i> Vai al nodo
               </button>`
            : '';
        return `
            <div class="suggestion-card p-3 rounded-lg border ${style.border} ${style.bg}">
                <div class="flex items-start gap-2">
                    <span class="mt-1 w-2 h-2 rounded-full ${style.dot} flex-shrink-0"></span>
                    <p class="text-xs text-slate-700 leading-relaxed">${_esc(s.message)}</p>
                </div>
                ${goBtn}
            </div>`;
    }

    function _renderDuplicateEntityCard(s) {
        const members = s.data.members || [];
        const anchor = members[0];
        const memberRows = members.map((m, i) => {
            const stayTag = i === 0
                ? '<span class="text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Resta</span>'
                : '';
            const mergeBtn = (i === 0 || !anchor) ? '' : `
                <button onclick="window.MappAISuggestionsPanel.mergeClusterMember('${m.id}','${anchor.id}', this)"
                    title="Fondi questo nodo nell'altro contrassegnato 'Resta'"
                    class="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 transition flex items-center gap-1 flex-shrink-0">
                    <i data-lucide="git-merge" class="w-3 h-3"></i> Fondi qui
                </button>`;
            return `
                <li class="flex items-center justify-between gap-2 py-1">
                    <span class="text-xs text-slate-600 truncate">
                        <span class="text-[10px] text-slate-400">[${_esc(m.branch)}]</span> ${_esc(m.label)}
                    </span>
                    <span class="flex items-center gap-2 flex-shrink-0">
                        ${stayTag}
                        <button onclick="window.executeSidebarSingleClick('${m.id}')" title="Vai al nodo" class="text-slate-400 hover:text-indigo-600 transition">
                            <i data-lucide="crosshair" class="w-3 h-3"></i>
                        </button>
                        ${mergeBtn}
                    </span>
                </li>`;
        }).join('');

        return `
            <div class="suggestion-card p-3 rounded-lg border border-violet-100 bg-violet-50">
                <div class="flex items-start gap-2 mb-1">
                    <span class="mt-1 w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"></span>
                    <p class="text-xs text-slate-700 leading-relaxed">${_esc(s.message)}</p>
                </div>
                <ul class="ml-4 divide-y divide-violet-100/60">${memberRows}</ul>
            </div>`;
    }

    function _renderCard(s) {
        const TYPES = window.MappAIStructureAnalyzer?.SUGGESTION_TYPES || {};
        if (s.type === TYPES.DUPLICATE_ENTITY) return _renderDuplicateEntityCard(s);
        return _renderGenericCard(s);
    }

    async function renderStructuralSuggestions(options = {}) {
        const list = document.getElementById('structural-suggestions-list');
        const status = document.getElementById('structural-suggestions-status');
        if (!list) return;

        list.innerHTML = '<p class="text-xs text-slate-400 italic px-1">Analisi in corso...</p>';
        if (status) status.textContent = '';

        const structural = window.MappAIStructureAnalyzer?.analyzeCurrentMap() || { suggestions: [], stats: {} };
        let suggestions = [...structural.suggestions];

        if (options.withEmbeddings) {
            if (!window.MappAIEntityBackbone || !window.fetchEmbeddings) {
                window.showToast?.('Analisi semantica non disponibile (modulo embeddings non caricato).', 'warning');
            } else {
                try {
                    const report = await window.MappAIEntityBackbone.analyzeCurrentMap();
                    if (report.errors?.length) {
                        window.showToast?.('Analisi semantica fallita: ' + report.errors[0], 'error');
                    } else {
                        const TYPES = window.MappAIStructureAnalyzer.SUGGESTION_TYPES;
                        const clusterSuggestions = (report.clusters || []).map(c => ({
                            type: TYPES.DUPLICATE_ENTITY,
                            nodeId: null,
                            severity: c.spread >= 3 ? 'high' : 'medium',
                            message: `Questi ${c.size} nodi (su ${c.spread} rami diversi) sembrano descrivere la stessa entità: valuta se fonderli.`,
                            data: { members: c.members, spread: c.spread }
                        }));
                        suggestions = [...clusterSuggestions, ...suggestions];
                    }
                } catch (e) {
                    window.showToast?.('Analisi semantica fallita: ' + e.message, 'error');
                }
            }
        }

        if (!suggestions.length) {
            list.innerHTML = '<p class="text-xs text-slate-400 italic px-1">Nessun suggerimento al momento — la struttura sembra equilibrata.</p>';
        } else {
            list.innerHTML = suggestions.map(_renderCard).join('');
        }
        if (status) {
            const st = structural.stats || {};
            status.textContent = `${st.nodes || 0} nodi · density ${st.density ?? '–'} · ${st.topology || ''}`;
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    function mergeClusterMember(memberId, anchorId, btnEl) {
        const state = _getAppState();
        const A = state?.db?.nodes?.find(n => n.id === memberId);
        const B = state?.db?.nodes?.find(n => n.id === anchorId);
        if (!A || !B) {
            window.showToast?.('Nodo non trovato — la mappa è cambiata, ri-esegui l\'analisi.', 'warning');
            return;
        }

        window.showConfirm(
            `Fondi "${window.cleanLabel(A.label)}" in "${window.cleanLabel(B.label)}"?`,
            `I figli di "${window.cleanLabel(A.label)}" diventeranno figli di "${window.cleanLabel(B.label)}". L'operazione non è annullabile.`,
            () => {
                window.executeMerge(A, B);
                const card = btnEl.closest('.suggestion-card');
                if (card) card.remove();
            }
        );
    }

    window.isStructuralSuggestionsPanelEnabled = function () {
        try { return localStorage.getItem('mappai_structural_suggestions_panel_enabled') === '1'; }
        catch (e) { return false; }
    };

    function _initVisibility() {
        const block = document.getElementById('structural-suggestions-block');
        if (block && window.isStructuralSuggestionsPanelEnabled()) {
            block.classList.remove('hidden');
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initVisibility);
    } else {
        _initVisibility();
    }

    window.MappAISuggestionsPanel = {
        renderStructuralSuggestions,
        mergeClusterMember
    };
    window.renderStructuralSuggestions = renderStructuralSuggestions;
})();
