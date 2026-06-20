/**
 * mappai-branch-synthesis.js
 * "Sintesi di ramo (AI)" — sintesi narrativa con citazioni di un ramo
 * (sottoalbero MindMap o sottografo KG), ispirata alla "wiki synthesis"
 * di Atomic.
 *
 * Flusso:
 *  1. window.openBranchSynthesisModal(nodeId?) — modale di configurazione
 *     (selezione del ramo da sintetizzare, default = primo L1/hub).
 *  2. window.generateBranchSynthesisWithAI() — raccoglie i nodi del ramo,
 *     costruisce un elenco fonti numerato deduplicato da sourcesDict,
 *     chiama BRANCH_SYNTHESIS_IT/_EN via fetchModelAPI, mostra il risultato.
 *  3. window.printBranchSynthesis() — stampa la sintesi (pattern
 *     mappai-quiz-print.js).
 *
 * Dipende da: app.js (appState, cleanLabel, getDescendants, getSystemKey,
 * fetchModelAPI, getMaxOutputTokens, showLoadingOverlay, showToast,
 * fillPromptTemplate), mappai-timeline.js (_getTimelineProjectName).
 */

(function () {
    'use strict';

    let _lastSynthesis = null; // { branchLabel, mapName, rawText, sourcesArr }

    function _escBS(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function _isEnglish() {
        return window.currentLanguage === 'en' || window.currentLanguage === 'en-US';
    }

    // ── Raccolta nodi del ramo ────────────────────────────────────────────
    function _collectBranchNodes(rootId) {
        const root = appState.db.nodes.find(n => n.id === rootId);
        if (!root) return [];
        if (appState.extractionMode === 'mindmap') {
            return appState.db.nodes
                .filter(n => n.group === root.group)
                .sort((a, b) => (a.level || 0) - (b.level || 0));
        }
        const seen = new Set([root.id]);
        const list = [root];
        (window.getDescendants ? window.getDescendants(root.id) : []).forEach(n => {
            if (!seen.has(n.id)) { seen.add(n.id); list.push(n); }
        });
        return list.sort((a, b) => (a.level || 0) - (b.level || 0));
    }

    // ── Elenco fonti deduplicato + blocco contenuti per il prompt ─────────
    function _buildSourcesAndContent(nodes) {
        const sourcesDict = appState.db.sourcesDict || {};
        const sourcesArr = [];
        const sourceKeyToIdx = {};
        const nodeBlocks = [];

        nodes.forEach(node => {
            const text = (node.desc || node.content || '').trim();
            if (!text) return;

            const refs = [];
            const chunks = sourcesDict[node.id];
            if (Array.isArray(chunks)) {
                chunks.forEach(c => {
                    if (!c || !c.text) return;
                    const key = (c.title || '') + '|' + (c.source || '');
                    let idx = sourceKeyToIdx[key];
                    if (idx === undefined) {
                        idx = sourcesArr.length + 1;
                        sourceKeyToIdx[key] = idx;
                        sourcesArr.push({ idx, title: c.title || 'Documento', source: c.source || '', text: c.text });
                    }
                    if (!refs.includes(idx)) refs.push(idx);
                });
            }

            const label = window.cleanLabel ? window.cleanLabel(node.label) : node.label;
            let block = `## ${label} (Livello ${node.level || 0})\n${text}`;
            if (refs.length) block += `\n(Fonti per questo concetto: ${refs.map(i => `[${i}]`).join('')})`;
            nodeBlocks.push(block);
        });

        const sourcesListText = sourcesArr.length
            ? sourcesArr.map(s => {
                const flat = s.text.replace(/\s+/g, ' ').trim();
                const snippet = flat.length > 150 ? flat.slice(0, 150) + '…' : flat;
                return `${s.idx}. ${s.title}${s.source ? ' — ' + s.source : ''}: "${snippet}"`;
            }).join('\n')
            : (_isEnglish() ? '(no specific sources available)' : '(nessuna fonte specifica disponibile)');

        return { nodesListText: nodeBlocks.join('\n\n'), sourcesListText, sourcesArr };
    }

    // ── Markdown → HTML (sottoinsieme: ##/###, **bold**, *italic*, liste, [n]) ─
    function _mdToHtml(md, variant) {
        const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
        let html = '';
        let inList = false;

        function closeList() {
            if (inList) { html += '</ul>'; inList = false; }
        }

        function inlineFmt(s) {
            s = _escBS(s);
            s = s.replace(/\*\*(.+?)\*\*/g, variant === 'modal'
                ? '<strong class="font-bold text-slate-800">$1</strong>'
                : '<strong>$1</strong>');
            s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
            s = s.replace(/\[(\d+)\]/g, (m, n) => variant === 'modal'
                ? `<sup class="text-indigo-600 font-bold cursor-pointer" onclick="window._scrollToBranchCitation(${n})">[${n}]</sup>`
                : `<sup>[${n}]</sup>`);
            return s;
        }

        const H3 = variant === 'modal' ? 'h3 class="text-sm font-extrabold text-slate-800 mt-4 mb-2"' : 'h3';
        const H4 = variant === 'modal' ? 'h4 class="text-[13px] font-bold text-slate-700 mt-3 mb-1"' : 'h4';
        const UL = variant === 'modal' ? 'ul class="list-disc pl-5 text-[13px] text-slate-600 mb-3 space-y-1"' : 'ul';
        const P  = variant === 'modal' ? 'p class="text-[13px] text-slate-600 leading-relaxed mb-3"' : 'p';

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { closeList(); return; }

            let m;
            if ((m = trimmed.match(/^(#{2,4})\s+(.*)$/))) {
                closeList();
                const tag = m[1].length === 2 ? H3 : H4;
                const closeTag = m[1].length === 2 ? 'h3' : 'h4';
                html += `<${tag}>${inlineFmt(m[2])}</${closeTag}>`;
                return;
            }
            if ((m = trimmed.match(/^[-*]\s+(.*)$/))) {
                if (!inList) { html += `<${UL}>`; inList = true; }
                html += `<li>${inlineFmt(m[1])}</li>`;
                return;
            }
            closeList();
            html += `<${P}>${inlineFmt(trimmed)}</p>`;
        });
        closeList();
        return html;
    }

    // ── Blocco citazioni (modale o stampa) ────────────────────────────────
    function _buildCitationsHtml(sourcesArr, variant) {
        if (!sourcesArr.length) return '';
        const titleLabel = _isEnglish() ? 'Sources' : 'Fonti';

        if (variant === 'modal') {
            const rows = sourcesArr.map(s => {
                const snippet = s.text.length > 280 ? s.text.slice(0, 280).trim() + '…' : s.text;
                return `<div id="bs-cite-${s.idx}" class="flex gap-2 py-2 border-b border-slate-100 last:border-0 transition-colors rounded">
                    <span class="text-[11px] font-bold text-indigo-600 flex-shrink-0">[${s.idx}]</span>
                    <div class="text-[11px] text-slate-500 leading-relaxed">
                        <span class="font-bold text-slate-600">${_escBS(s.title)}${s.source ? ' — ' + _escBS(s.source) : ''}</span>
                        <p class="italic mt-0.5">&ldquo;${_escBS(snippet)}&rdquo;</p>
                    </div>
                </div>`;
            }).join('');
            return `<div class="mt-5 pt-4 border-t border-slate-100">
                <div class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">${titleLabel}</div>
                ${rows}
            </div>`;
        }

        // print
        const rows = sourcesArr.map(s => {
            const snippet = s.text.length > 280 ? s.text.slice(0, 280).trim() + '…' : s.text;
            return `<div class="bs-cite-row">
                <div class="bs-cite-num">[${s.idx}]</div>
                <div class="bs-cite-text"><strong>${_escBS(s.title)}${s.source ? ' — ' + _escBS(s.source) : ''}</strong><br>&ldquo;${_escBS(snippet)}&rdquo;</div>
            </div>`;
        }).join('');
        return `<div class="bs-citations">
            <div class="bs-citations-title">${titleLabel}</div>
            ${rows}
        </div>`;
    }

    window._scrollToBranchCitation = function (n) {
        const el = document.getElementById('bs-cite-' + n);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-indigo-50');
        setTimeout(() => el.classList.remove('bg-indigo-50'), 1200);
    };

    // ── Modale di configurazione ──────────────────────────────────────────
    window.openBranchSynthesisModal = function (nodeId) {
        if (!appState.db?.nodes || appState.db.nodes.length === 0) {
            window.showToast('Genera prima una mappa', 'warning');
            return;
        }

        const isMM = appState.extractionMode === 'mindmap';
        let branchOptions = isMM
            ? appState.db.nodes.filter(n => (n.level || 0) === 1)
            : appState.db.nodes.filter(n => (n.level || 0) <= 1);
        if (!branchOptions.length) branchOptions = [...appState.db.nodes];
        branchOptions = branchOptions.sort((a, b) =>
            (a.level || 0) - (b.level || 0) || String(a.label).localeCompare(String(b.label)));

        if (!branchOptions.length) {
            window.showToast('Nessun ramo disponibile per la sintesi', 'warning');
            return;
        }

        let preselect = branchOptions[0].id;
        if (nodeId) {
            const node = appState.db.nodes.find(n => n.id === nodeId);
            if (node) {
                if (isMM) {
                    const l1 = appState.db.nodes.find(n => n.level === 1 && n.group === node.group);
                    if (l1) preselect = l1.id;
                } else if (branchOptions.some(o => o.id === node.id)) {
                    preselect = node.id;
                }
            }
        }

        const existing = document.getElementById('branch-synthesis-config-modal');
        if (existing) existing.remove();

        const optionsHtml = branchOptions.map(n => {
            const label = window.cleanLabel ? window.cleanLabel(n.label) : n.label;
            return `<option value="${n.id}" ${n.id === preselect ? 'selected' : ''}>${_escBS(label)}</option>`;
        }).join('');

        const mapName = window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI';

        const modal = document.createElement('div');
        modal.id = 'branch-synthesis-config-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';
        modal.innerHTML =
            '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[500px] p-8 relative">' +
                '<button type="button" onclick="document.getElementById(\'branch-synthesis-config-modal\').remove()" ' +
                    'class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                    '<i data-lucide="x" class="w-6 h-6"></i>' +
                '</button>' +
                '<div class="space-y-6">' +
                    '<div class="flex items-center gap-3">' +
                        '<div class="pm-icon-wrap"><i data-lucide="sparkles" class="w-5 h-5 text-indigo-600"></i></div>' +
                        '<div>' +
                            '<div class="pm-title">Sintesi di ramo (AI)</div>' +
                            '<div class="pm-subtitle">' + _escBS(mapName) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<p class="pm-body-text">' +
                        'L\'AI scrive una sintesi narrativa del ramo scelto, con citazioni numerate ' +
                        'che rimandano alle fonti originali della mappa.' +
                    '</p>' +
                    '<div class="pm-section">' +
                        '<span class="pm-section-title">Ramo da sintetizzare</span>' +
                        '<select id="branch-synthesis-select" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700 focus_ring_standard">' +
                            optionsHtml +
                        '</select>' +
                    '</div>' +
                    '<div class="flex gap-3 pt-2 border-t border-slate-100">' +
                        '<button type="button" onclick="document.getElementById(\'branch-synthesis-config-modal\').remove()" class="pm-btn-cancel">Annulla</button>' +
                        '<button type="button" onclick="window.generateBranchSynthesisWithAI()" class="pm-btn-primary">' +
                            '<i data-lucide="zap" class="w-4 h-4"></i> Genera Sintesi' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();

        const escHandler = function (e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    };

    // ── Generazione AI ─────────────────────────────────────────────────────
    window.generateBranchSynthesisWithAI = async function () {
        const configModal = document.getElementById('branch-synthesis-config-modal');
        const selectedId = document.getElementById('branch-synthesis-select')?.value;
        if (configModal) configModal.remove();

        if (!selectedId) { window.showToast('Seleziona un ramo', 'warning'); return; }
        const root = appState.db.nodes.find(n => n.id === selectedId);
        if (!root) { window.showToast('Ramo non trovato', 'error'); return; }

        const branchLabel = window.cleanLabel ? window.cleanLabel(root.label) : root.label;

        window.showLoadingOverlay(true, 'Sintesi del ramo in corso…');

        try {
            const apiKey = window.getSystemKey ? window.getSystemKey() : '';
            if (!apiKey) {
                window.showLoadingOverlay(false);
                window.showToast("Inserisci un'API Key per continuare", 'error');
                return;
            }

            const branchNodes = _collectBranchNodes(selectedId);
            const { nodesListText, sourcesListText, sourcesArr } = _buildSourcesAndContent(branchNodes);

            if (!nodesListText) {
                window.showLoadingOverlay(false);
                window.showToast('Questo ramo non ha contenuti (descrizioni) da sintetizzare', 'warning');
                return;
            }

            const promptText = window.fillPromptTemplate('BRANCH_SYNTHESIS', {
                branchLabel: branchLabel,
                sourcesList: sourcesListText,
                nodesList: nodesListText
            });

            const payload = {
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(3000) : 3000)
                }
            };

            let response;
            try {
                response = await window.fetchModelAPI(payload, apiKey);
            } catch (apiErr) {
                window.showLoadingOverlay(false);
                window.showToast('Errore chiamata AI: ' + (apiErr.message || String(apiErr)), 'error');
                return;
            }

            const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            window.showLoadingOverlay(false);

            if (!rawText.trim()) {
                window.showToast('Risposta AI vuota — riprova', 'warning');
                return;
            }

            _lastSynthesis = {
                branchLabel,
                mapName: window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI',
                rawText,
                sourcesArr
            };
            _openBranchSynthesisResultModal(_lastSynthesis);

        } catch (err) {
            window.showLoadingOverlay(false);
            console.error('[BranchSynthesis] Errore:', err);
            window.showToast('Errore generazione sintesi: ' + (err.message || err), 'error');
        }
    };

    // ── Modale risultato ───────────────────────────────────────────────────
    function _openBranchSynthesisResultModal(data) {
        const existing = document.getElementById('branch-synthesis-modal');
        if (existing) existing.remove();

        const bodyHtml = _mdToHtml(data.rawText, 'modal');
        const citationsHtml = _buildCitationsHtml(data.sourcesArr, 'modal');

        const modal = document.createElement('div');
        modal.id = 'branch-synthesis-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';
        modal.innerHTML =
            '<div class="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[680px] max-h-[88vh] flex flex-col relative">' +
                '<button type="button" onclick="document.getElementById(\'branch-synthesis-modal\').remove()" ' +
                    'class="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                    '<i data-lucide="x" class="w-6 h-6"></i>' +
                '</button>' +
                '<div class="p-8 pb-4 flex items-center gap-3 border-b border-slate-100">' +
                    '<div class="pm-icon-wrap"><i data-lucide="sparkles" class="w-5 h-5 text-indigo-600"></i></div>' +
                    '<div>' +
                        '<div class="pm-title">Sintesi: ' + _escBS(data.branchLabel) + '</div>' +
                        '<div class="pm-subtitle">' + _escBS(data.mapName) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="branch-synthesis-body" class="p-8 pt-4 overflow-y-auto flex-1">' +
                    bodyHtml + citationsHtml +
                '</div>' +
                '<div class="flex gap-3 p-6 pt-4 border-t border-slate-100">' +
                    '<button type="button" onclick="document.getElementById(\'branch-synthesis-modal\').remove()" class="pm-btn-cancel">Chiudi</button>' +
                    '<button type="button" onclick="window.printBranchSynthesis()" class="pm-btn-primary">' +
                        '<i data-lucide="printer" class="w-4 h-4"></i> Stampa' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();

        const escHandler = function (e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // ── Stampa ─────────────────────────────────────────────────────────────
    window.printBranchSynthesis = function () {
        if (!_lastSynthesis) return;

        const now = new Date().toLocaleString('it-IT');
        const accentColor = '#4f46e5';
        const bodyHtml = _mdToHtml(_lastSynthesis.rawText, 'print');
        const citationsHtml = _buildCitationsHtml(_lastSynthesis.sourcesArr, 'print');

        const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Sintesi — ${_escBS(_lastSynthesis.branchLabel)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">
    <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family:'Space Mono', monospace; font-size:11px; color:#1e293b; margin:0 auto; padding:24px 32px; max-width:800px; background:#f8fafc; }
        .bs-header { text-align:center; padding:28px 16px 20px; background:white; border-radius:16px; margin-bottom:28px; border-bottom:2px solid ${accentColor}; }
        .bs-title { font-size:20px; font-weight:900; color:#1e293b; }
        .bs-subtitle { font-size:10px; color:#64748b; margin-top:4px; }
        .bs-body { background:white; border-radius:16px; padding:24px 28px; }
        .bs-body h3 { font-size:14px; font-weight:900; color:${accentColor}; margin:18px 0 8px; }
        .bs-body h4 { font-size:12px; font-weight:700; color:#1e293b; margin:14px 0 6px; }
        .bs-body p { font-size:11px; line-height:1.7; color:#334155; margin:0 0 10px; }
        .bs-body ul { margin:0 0 10px 18px; padding:0; }
        .bs-body li { font-size:11px; line-height:1.7; color:#334155; margin-bottom:4px; }
        .bs-body sup { color:${accentColor}; font-weight:bold; }
        .bs-citations { margin-top:20px; padding-top:14px; border-top:1px solid #e2e8f0; }
        .bs-citations-title { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; margin-bottom:10px; }
        .bs-cite-row { display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #f1f5f9; }
        .bs-cite-num { font-size:10px; font-weight:bold; color:${accentColor}; flex-shrink:0; }
        .bs-cite-text { font-size:10px; color:#64748b; line-height:1.6; }
        .bs-cite-text strong { color:#475569; }
        .bs-footer { text-align:center; margin-top:24px; font-size:9px; color:#94a3b8; }
        .no-print { display:block; }
        @media print { .no-print { display:none !important; } body { background:white; padding:10px; } }
    </style>
</head>
<body>
    <div class="no-print" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px;">
        <span style="font-weight:bold;color:${accentColor};">MappAI · Sintesi di ramo</span>
        <div style="display:flex;gap:8px;">
            <button onclick="window.print()" style="background:${accentColor};color:white;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold;">🖶 Stampa / Esporta PDF</button>
            <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;">✕ Chiudi</button>
        </div>
    </div>
    <div style="height:52px;" class="no-print"></div>

    <div class="bs-header">
        <div class="bs-title">${_escBS(_lastSynthesis.branchLabel)}</div>
        <div class="bs-subtitle">${_escBS(_lastSynthesis.mapName)} · Sintesi di ramo · ${now}</div>
    </div>
    <div class="bs-body">${bodyHtml}${citationsHtml}</div>
    <div class="bs-footer">MappAI by insegnai.ch · Generato il ${now}</div>
</body>
</html>`;

        const win = window.open('', '_blank');
        if (!win) {
            window.showToast('Popup bloccato — abilita i popup', 'warning');
            return;
        }
        win.document.write(fullHtml);
        win.document.close();
        window.showToast('✓ Sintesi stampabile aperta', 'success');
    };

    console.log('[MappAI] mappai-branch-synthesis.js caricato ✓');
})();
