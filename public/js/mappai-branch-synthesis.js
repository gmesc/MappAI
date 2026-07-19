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
    // Raccolta ramo → base condivisa col Dossier (mappai-study-export-core.js).
    function _collectBranchNodes(rootId) {
        return window.MappAIStudyExport.collectBranchNodes(rootId);
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

        // Default = "Tutta la mappa" quando si apre il modale dal menu (nessun
        // nodeId); se invece si arriva da un nodo specifico (es. tasto destro),
        // resta preselezionato quel ramo.
        const defaultAll = !nodeId;
        const optionsHtml = branchOptions.map(n => {
            const label = window.cleanLabel ? window.cleanLabel(n.label) : n.label;
            return `<option value="${n.id}" ${(!defaultAll && n.id === preselect) ? 'selected' : ''}>${_escBS(label)}</option>`;
        }).join('');
        // Sintesi dell'INTERA mappa (map-reduce per ramo sulle mappe grandi)
        const allOption = `<option value="__ALL__" ${defaultAll ? 'selected' : ''}>${_escBS(window.t('bs_all_map', 'Tutta la mappa'))} (${appState.db.nodes.length} nodi)</option>`;

        const mapName = window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI';

        // Toggle "Taratura AI" — solo se il contesto attivo ha un profilo SPECIALE (pallino verde)
        const _bsSpecial = !!(window.MappAITune && window.MappAITune.isSpecialActive && window.MappAITune.isSpecialActive());
        const _bsCtx = (window.MappAITune && window.MappAITune.activeContextName) ? window.MappAITune.activeContextName() : '';
        const tuneRow = _bsSpecial ?
            ('<label class="pm-section" style="display:flex;align-items:center;gap:8px;cursor:pointer" title="' + _escBS(window.t('bs_tune_tip', 'Genera una versione adattata al profilo (registro, note) del contesto attivo. Il file avrà il suffisso [VERDE].')) + '">' +
                '<input type="checkbox" id="bs-tune-toggle" style="width:16px;height:16px;accent-color:#16a34a">' +
                '<span class="pm-section-title" style="margin:0">' + _escBS(window.t('bs_tune_label', 'Taratura AI')) + ' · <span style="color:#16a34a;font-weight:800">' + _escBS(_bsCtx) + '</span></span>' +
            '</label>') : '';

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
                            '<div class="pm-title">' + _escBS(window.t('ui_branch_synth', 'Sintesi materiale')) + '</div>' +
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
                            allOption + optionsHtml +
                        '</select>' +
                    '</div>' +
                    tuneRow +
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
    // Una passata di sintesi su un insieme di nodi (un ramo, o l'intera mappa
    // se piccola). Ritorna { rawText, sourcesArr } o null se niente contenuti.
    async function _synthesizeOnce(nodes, label, apiKey) {
        const { nodesListText, sourcesListText, sourcesArr } = _buildSourcesAndContent(nodes);
        if (!nodesListText) return null;

        // «Catena dei perché» (19/7/26): nessi causa-effetto DETERMINISTICI del ramo
        // (link con verbi di ragionamento + connettivi nelle desc). Doppio uso:
        // scaffold nel prompt (l'AI collega senza inventare i nessi) + box nel
        // documento stampabile. '' / [] se il modulo manca o non trova nulla.
        let causalTriples = [];
        try {
            if (window.MappAICausal && window.MappAICausal.triplesFor) causalTriples = window.MappAICausal.triplesFor(nodes) || [];
        } catch (e) { causalTriples = []; }
        const causalScaffold = (causalTriples.length && window.MappAICausal.promptBlockFromTriples)
            ? window.MappAICausal.promptBlockFromTriples(causalTriples) : '';

        const promptText = window.fillPromptTemplate('BRANCH_SYNTHESIS', {
            branchLabel: label,
            sourcesList: sourcesListText,
            nodesList: nodesListText
        }) + causalScaffold;

        const payload = {
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(3000) : 3000)
            }
        };

        if (window.MappAIUsage) window.MappAIUsage.setContext('materials', 'synthesis');
        if (window.injectClassTuning) window.injectClassTuning(payload); // taratura [VERDE]: no-op se MappAITune non armato
        const response = await window.fetchModelAPI(payload, apiKey);
        const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText.trim()) throw new Error('Risposta AI vuota');
        return { rawText, sourcesArr, causalTriples };
    }

    window.generateBranchSynthesisWithAI = async function () {
        const configModal = document.getElementById('branch-synthesis-config-modal');
        const selectedId = document.getElementById('branch-synthesis-select')?.value;
        const tuneOn = !!(document.getElementById('bs-tune-toggle') && document.getElementById('bs-tune-toggle').checked);
        if (configModal) configModal.remove();

        if (!selectedId) { window.showToast('Seleziona un ramo', 'warning'); return; }

        const apiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (!apiKey) {
            window.showToast(window.t('tst_need_key', "Inserisci un'API Key per continuare"), 'error');
            return;
        }

        // Arma la taratura piena per QUESTA generazione (materiale [VERDE]); ripristina in finally.
        const _prevArmed = window.MappAITune ? window.MappAITune.armed : false;
        if (window.MappAITune) window.MappAITune.armed = tuneOn;
        try {
            if (selectedId === '__ALL__') { await _generateWholeMapSynthesis(apiKey); return; }

            const root = appState.db.nodes.find(n => n.id === selectedId);
            if (!root) { window.showToast('Ramo non trovato', 'error'); return; }
            const branchLabel = window.cleanLabel ? window.cleanLabel(root.label) : root.label;

            window.showLoadingOverlay(true, 'Sintesi del ramo in corso…');
            const out = await _synthesizeOnce(_collectBranchNodes(selectedId), branchLabel, apiKey);
            window.showLoadingOverlay(false);
            if (!out) {
                window.showToast('Questo ramo non ha contenuti (descrizioni) da sintetizzare', 'warning');
                return;
            }
            _lastSynthesis = {
                branchLabel,
                mapName: window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI',
                rawText: out.rawText,
                sourcesArr: out.sourcesArr,
                causalTriples: out.causalTriples || [],
                tuned: tuneOn
            };
            _openBranchSynthesisResultModal(_lastSynthesis);
        } catch (err) {
            window.showLoadingOverlay(false);
            console.error('[BranchSynthesis] Errore:', err);
            window.showToast('Errore generazione sintesi: ' + (err.message || err), 'error');
        } finally {
            if (window.MappAITune) window.MappAITune.armed = _prevArmed;
        }
    };

    // ── Sintesi dell'INTERA mappa ──────────────────────────────────────────
    // Mappe piccole (≤ WHOLE_SINGLE_MAX nodi): una chiamata sola. Mappe grandi:
    // map-reduce — una sintesi per ramo (budget token invariato per chiamata),
    // poi UNA chiamata di panoramica sulle sintesi accorciate. Le citazioni
    // restano numerate PER SEZIONE: rinumerarle globalmente è fragile e non
    // aggiunge nulla per lo studente. Un ramo fallito non azzera gli altri.
    const WHOLE_SINGLE_MAX = 30;

    async function _generateWholeMapSynthesis(apiKey) {
        const mapName = window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI';
        const allNodes = appState.db.nodes || [];

        try {
            if (allNodes.length <= WHOLE_SINGLE_MAX) {
                window.showLoadingOverlay(true, window.t('bs_progress_whole', 'Sintesi della mappa in corso…'));
                const out = await _synthesizeOnce(
                    [...allNodes].sort((a, b) => (a.level || 0) - (b.level || 0)), mapName, apiKey);
                window.showLoadingOverlay(false);
                if (!out) {
                    window.showToast('La mappa non ha contenuti (descrizioni) da sintetizzare', 'warning');
                    return;
                }
                _lastSynthesis = { branchLabel: mapName, mapName, rawText: out.rawText, sourcesArr: out.sourcesArr, causalTriples: out.causalTriples || [], tuned: !!(window.MappAITune && window.MappAITune.armed) };
                _openBranchSynthesisResultModal(_lastSynthesis);
                return;
            }

            const isMM = appState.extractionMode === 'mindmap';
            let branches = isMM
                ? allNodes.filter(n => (n.level || 0) === 1)
                : allNodes.filter(n => (n.level || 0) <= 1);
            if (!branches.length) branches = [allNodes[0]];

            const sections = [];
            for (let i = 0; i < branches.length; i++) {
                const b = branches[i];
                const label = window.cleanLabel ? window.cleanLabel(b.label) : b.label;
                window.showLoadingOverlay(true,
                    window.t('bs_progress', 'Sintesi ramo') + ' ' + (i + 1) + '/' + branches.length + ': ' + label + '…');
                try {
                    const out = await _synthesizeOnce(_collectBranchNodes(b.id), label, apiKey);
                    if (out) sections.push({ branchLabel: label, rawText: out.rawText, sourcesArr: out.sourcesArr, causalTriples: out.causalTriples || [] });
                } catch (e) {
                    console.warn('[BranchSynthesis] Ramo fallito:', label, e);
                    sections.push({ branchLabel: label, failed: true });
                }
            }

            if (!sections.some(s => !s.failed)) {
                window.showLoadingOverlay(false);
                window.showToast('Nessun ramo è stato sintetizzato — riprova', 'error');
                return;
            }

            // Panoramica introduttiva (best-effort: se fallisce, il documento esce senza)
            let intro = '';
            try {
                window.showLoadingOverlay(true, window.t('bs_progress_overview', 'Scrivo la panoramica…'));
                const digest = sections.filter(s => !s.failed)
                    .map(s => '## ' + s.branchLabel + '\n' + s.rawText.slice(0, 900)).join('\n\n');
                const langNote = window.mapLangNote ? window.mapLangNote() : '';
                const prompt = 'Queste sono le sintesi dei rami della mappa mentale "' + mapName + '".\n' +
                    'Scrivi una PANORAMICA introduttiva (150-220 parole) che colleghi i temi dei rami ' +
                    'in un discorso unico: niente elenchi, niente citazioni numerate, tono da introduzione di dispensa.\n' +
                    langNote + '\n\n' + digest;
                const payload = {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(1200) : 1200)
                    }
                };
                if (window.MappAIUsage) window.MappAIUsage.setContext('materials', 'synthesis');
                if (window.injectClassTuning) window.injectClassTuning(payload);
                const resp = await window.fetchModelAPI(payload, apiKey);
                intro = (resp?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            } catch (e) {
                console.warn('[BranchSynthesis] Panoramica fallita (non bloccante):', e);
            }

            window.showLoadingOverlay(false);
            _lastSynthesis = { whole: true, branchLabel: mapName, mapName, intro, sections, tuned: !!(window.MappAITune && window.MappAITune.armed) };
            _openBranchSynthesisResultModal(_lastSynthesis);
        } catch (err) {
            window.showLoadingOverlay(false);
            console.error('[BranchSynthesis] Errore sintesi mappa:', err);
            window.showToast('Errore generazione sintesi: ' + (err.message || err), 'error');
        }
    }

    // Corpo HTML della sintesi intera: panoramica + una sezione per ramo,
    // ciascuna con le SUE citazioni (numerazione per-sezione).
    function _wholeBodyHtml(data, variant) {
        const H = variant === 'modal'
            ? (txt) => '<h3 class="text-sm font-extrabold text-indigo-700 mt-5 mb-2 pb-1 border-b border-slate-100">' + _escBS(txt) + '</h3>'
            : (txt) => '<h3>' + _escBS(txt) + '</h3>';
        let html = '';
        if (data.intro) {
            html += H(window.t('bs_overview', 'Panoramica'));
            html += _mdToHtml(data.intro, variant);
        }
        (data.sections || []).forEach(sec => {
            html += H(sec.branchLabel);
            if (sec.failed) {
                const msg = _escBS(window.t('bs_branch_failed', 'Sintesi di questo ramo non riuscita — riprova sul ramo singolo.'));
                html += variant === 'modal'
                    ? '<p class="text-[13px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">' + msg + '</p>'
                    : '<p style="color:#b45309">' + msg + '</p>';
                return;
            }
            html += _mdToHtml(sec.rawText, variant)
                + (variant === 'print' ? _causalBoxHtml(sec.causalTriples) : '')
                + _buildCitationsHtml(sec.sourcesArr, variant);
        });
        return html;
    }

    // Box «La catena dei perché» nel documento STAMPABILE (non nel modale:
    // il lettore TTS legge tutto #branch-synthesis-body e le triple ad alta
    // voce sarebbero rumore). '' se modulo assente o nessun nesso.
    function _causalBoxHtml(triples) {
        try {
            return (triples && triples.length && window.MappAICausal && window.MappAICausal.htmlBlock)
                ? window.MappAICausal.htmlBlock(triples) : '';
        } catch (e) { return ''; }
    }

    // ── Modale risultato ───────────────────────────────────────────────────
    function _openBranchSynthesisResultModal(data) {
        _saveSynthesisDoc(data);   // auto-salvataggio: la sintesi è "creata" ora
        const existing = document.getElementById('branch-synthesis-modal');
        if (existing) existing.remove();

        const contentHtml = data.whole
            ? _wholeBodyHtml(data, 'modal')
            : _mdToHtml(data.rawText, 'modal') + _buildCitationsHtml(data.sourcesArr, 'modal');
        const titlePrefix = data.whole
            ? _escBS(window.t('bs_whole_title', 'Sintesi della mappa')) + ': '
            : 'Sintesi: ';

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
                        '<div class="pm-title">' + titlePrefix + _escBS(data.branchLabel) + '</div>' +
                        '<div class="pm-subtitle">' + _escBS(data.mapName) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="branch-synthesis-body" class="p-8 pt-4 overflow-y-auto flex-1">' +
                    contentHtml +
                '</div>' +
                '<div class="flex gap-3 p-6 pt-4 border-t border-slate-100 items-center">' +
                    '<span class="mai-tts-slot" data-tts-body="#branch-synthesis-body" data-tts-sections></span>' +
                    '<button type="button" onclick="window.generateSynthesisAudio()" class="pm-btn-cancel" title="' + _escBS(window.t('bs_audio_tip', 'Scarica un audio con voce naturale (Google) — utile per allievi dislessici')) + '">' +
                        '<i data-lucide="headphones" class="w-4 h-4"></i> ' + _escBS(window.t('bs_audio_btn', 'Audio voce naturale')) +
                    '</button>' +
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

    // ── Costruzione HTML stampabile (condiviso da stampa + salvataggio) ──────
    function _buildSynthesisPrintHtml(data, opts) {
        data = data || _lastSynthesis;
        opts = opts || {};
        if (!data) return '';
        // Voce naturale (Gemini) incorporata come data-URI: viaggia col file HTML.
        const audioTag = opts.audioDataUri
            ? '<audio id="ap-audio" preload="auto" style="display:none"><source src="' + opts.audioDataUri + '" type="' + (opts.audioMime || 'audio/wav') + '"></audio>'
            : '';
        // Cue map: tempo reale di inizio di ogni blocco → karaoke sincronizzato con la voce.
        const cuesTag = (opts.cues && opts.cues.length)
            ? '<script id="ap-cues" type="application/json">' + JSON.stringify(opts.cues) + '<\/script>'
            : '';

        const now = new Date().toLocaleString('it-IT');
        const accentColor = '#4f46e5';
        const contentHtml = data.whole
            ? _wholeBodyHtml(data, 'print')
            : _mdToHtml(data.rawText, 'print') + _causalBoxHtml(data.causalTriples) + _buildCitationsHtml(data.sourcesArr, 'print');
        const kindLabel = data.whole
            ? window.t('bs_whole_title', 'Sintesi della mappa')
            : 'Sintesi di ramo';

        return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Sintesi — ${_escBS(data.branchLabel)}</title>
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
        /* Lettore audio autonomo (TTS del browser) — accessibilità BES/DSA */
        #ap-bar { display:flex; align-items:center; gap:10px; flex:1 1 auto; min-width:0; margin:0 16px; }
        .ap-chip { display:inline-flex; height:34px; border-radius:9999px; background:#fff; border:1px solid #e2e8f0; overflow:hidden; flex:0 0 auto; }
        .ap-seg { display:inline-flex; align-items:center; justify-content:center; min-width:40px; padding:0 11px; border:0; background:transparent; color:${accentColor}; cursor:pointer; font:700 12px 'Space Mono',monospace; border-left:1px solid #eef2ff; }
        .ap-seg:first-child { border-left:0; }
        .ap-seg:hover { background:#eef2ff; }
        .ap-play.on { background:${accentColor}; color:#fff; }
        .ap-prog { position:relative; flex:1 1 120px; min-width:70px; height:7px; border-radius:9999px; background:#e2e8f0; cursor:pointer; touch-action:none; }
        .ap-fill { position:absolute; left:0; top:0; height:100%; width:0; border-radius:9999px; background:${accentColor}; pointer-events:none; }
        .ap-thumb { position:absolute; top:50%; left:0; width:13px; height:13px; border-radius:50%; background:${accentColor}; transform:translate(-50%,-50%); box-shadow:0 1px 3px rgba(15,23,42,.35); pointer-events:none; }
        .ap-time { font:700 11px 'Space Mono',monospace; color:#64748b; min-width:32px; text-align:right; }
        .ap-sec { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; margin-right:7px; padding:0; border:0; border-radius:9999px; background:#eef2ff; color:${accentColor}; cursor:pointer; vertical-align:middle; font:700 11px 'Space Mono',monospace; line-height:1; }
        .bs-body-block { background:rgba(253,230,138,.35); border-radius:5px; box-shadow:0 0 0 3px rgba(253,230,138,.35); }
        ::highlight(ap-read) { background-color:#fde68a; color:#0f172a; }
        /* Modalità dislessia (attivabile nel documento) */
        body.ap-dys { background:#f6efdd; }
        body.ap-dys .bs-body { background:#fffdf6; max-width:none; }
        body.ap-dys .bs-body p, body.ap-dys .bs-body li { font-family:Verdana,'Trebuchet MS',sans-serif; font-size:15px; line-height:2.05; letter-spacing:.03em; word-spacing:.14em; color:#33312e; text-align:left; margin-bottom:14px; }
        body.ap-dys .bs-body h3 { font-family:Verdana,sans-serif; font-size:19px; }
        body.ap-dys .bs-body h4 { font-family:Verdana,sans-serif; font-size:15px; }
        .no-print { display:block; }
        @media print { .no-print { display:none !important; } body { background:white; padding:10px; } }
    </style>
</head>
<body>
    <div class="no-print" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px;">
        <span style="font-weight:bold;color:${accentColor};white-space:nowrap;">MappAI · ${_escBS(kindLabel)}</span>
        <div id="ap-bar"></div>
        <div style="display:flex;gap:8px;flex:0 0 auto;">
            <button id="ap-dys-btn" type="button" style="background:#fff;color:${accentColor};border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:bold;">Aa Dislessia</button>
            <button onclick="window.print()" style="background:${accentColor};color:white;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold;">🖶 Stampa / PDF</button>
            <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;">✕ Chiudi</button>
        </div>
    </div>
    <div style="height:52px;" class="no-print"></div>

    <div class="bs-header">
        <div class="bs-title">${_escBS(data.branchLabel)}</div>
        <div class="bs-subtitle">${_escBS(data.mapName)} · ${_escBS(kindLabel)} · ${now}</div>
    </div>
    <div class="bs-body">${audioTag}${cuesTag}${contentHtml}</div>
    <div class="bs-footer">MappAI by insegnai.ch · Generato il ${now}</div>
    <script>
    (function(){
      var SPEEDS=[0.75,1,1.25,1.5], ri=1, BACK=10, FWD=5, CPS=14.5;
      var sup=('speechSynthesis' in window)&&('SpeechSynthesisUtterance' in window);
      var body=document.querySelector('.bs-body');
      var bar=document.getElementById('ap-bar');
      var dysBtn=document.getElementById('ap-dys-btn');
      if(dysBtn){ dysBtn.addEventListener('click',function(){ document.body.classList.toggle('ap-dys'); dysBtn.classList.toggle('on'); }); }
      if(!sup||!body||!bar){ if(bar) bar.style.display='none'; return; }
      var lang=((document.documentElement.lang||'it').toLowerCase().indexOf('en')===0)?'en-US':'it-IT';
      var hlOK=false, HL=null;
      try{ if(window.CSS&&CSS.highlights&&typeof Highlight!=='undefined'){ HL=new Highlight(); CSS.highlights.set('ap-read',HL); hlOK=true; } }catch(e){}
      function clean(s){ return String(s||'').replace(/\\[\\d+\\]/g,' ').replace(/[*_#]+/g,' ').replace(/\\s+/g,' ').replace(/\\s+([.,;:!?\\u2026\\u00bb)\\]])/g,'$1').trim(); }
      function pieces(block){
        var w=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
          var p=n.parentNode;
          while(p&&p!==block){ if(p.nodeType===1){ var tg=p.tagName.toLowerCase();
            if(tg==='sup'||tg==='button'||tg==='style'||tg==='script') return NodeFilter.FILTER_REJECT;
            if(p.classList&&(p.classList.contains('bs-citations')||p.hasAttribute('data-ap-skip'))) return NodeFilter.FILTER_REJECT; }
            p=p.parentNode; }
          return NodeFilter.FILTER_ACCEPT; }});
        var t='',m=[],n; while((n=w.nextNode())){ var v=n.nodeValue||''; m.push({node:n,start:t.length,len:v.length}); t+=v; }
        return {text:t,map:m};
      }
      function locate(m,pos){ for(var i=0;i<m.length;i++){ var pc=m[i]; if(pos>=pc.start&&pos<=pc.start+pc.len) return {node:pc.node,offset:pos-pc.start}; } var l=m[m.length-1]; return l?{node:l.node,offset:l.len}:null; }
      function sentRanges(t){ var re=/[.!?\\u2026]+[)\\]"'\\u201d\\u2019\\u00bb]*\\s*/g,res=[],last=0,mm; while((mm=re.exec(t))){ var e=mm.index+mm[0].length; res.push({start:last,end:e}); last=e; } if(last<t.length) res.push({start:last,end:t.length}); if(!res.length) res.push({start:0,end:t.length}); return res; }
      var chunks=[];
      var nBlocks=0;
      function build(){
        chunks=[]; nBlocks=0; var blocks=body.querySelectorAll('h3,h4,p,li,blockquote');
        for(var bx=0;bx<blocks.length;bx++){ var bl=blocks[bx];
          if(bl.closest&&bl.closest('.bs-citations')) continue;
          var pc=pieces(bl); if(!pc.text.trim()) continue;
          var myBi=nBlocks; nBlocks++;
          var tg=bl.tagName.toLowerCase(), head=(tg==='h3'||tg==='h4'), item=(tg==='li');
          var rgs=head?[{start:0,end:pc.text.length}]:sentRanges(pc.text);
          for(var k=0;k<rgs.length;k++){ var rg=rgs[k]; var raw=pc.text.slice(rg.start,rg.end); var spk=clean(raw); if(!spk) continue;
            var hs=rg.start,he=rg.end; while(he>hs&&/\\s/.test(pc.text.charAt(he-1))) he--; while(hs<he&&/\\s/.test(pc.text.charAt(hs))) hs++;
            var a=locate(pc.map,hs), b=locate(pc.map,he);
            var pit=1,pau=200,rm=1;
            if(head){ rm=0.94; pau=400; } else { if(/[?\\uff1f]\\s*$/.test(raw)){pit=1.09;pau=260;} else if(/[!\\uff01]\\s*$/.test(raw)){pit=1.04;pau=240;} if(item) pau=Math.max(pau,220); if(k===rgs.length-1) pau+=150; }
            chunks.push({text:spk,head:head,pitch:pit,rateMul:rm,endPause:pau,src:bl,bi:myBi,r:(a&&b)?{sN:a.node,sO:a.offset,eN:b.node,eO:b.offset}:null});
          }
        }
      }
      var idx=0,subChar=0,playing=false,gap=null,utter=null,ticker=null,blockEl=null,drag=false,dur=[],starts=[],total=0,t0=0;
      var audioEl=document.getElementById('ap-audio'); var audioMode=!!audioEl; // voce naturale incorporata (Gemini)
      var cuesData=null; try{ var _ce=document.getElementById('ap-cues'); if(_ce) cuesData=JSON.parse(_ce.textContent||'null'); }catch(e){ cuesData=null; } // tempi reali di inizio blocco (sync karaoke)
      function rate(){ return SPEEDS[ri]; }
      function timing(){ dur=chunks.map(function(c){ var cps=CPS*rate()*(c.rateMul||1); return Math.max(0.35,c.text.length/cps)+(c.endPause||0)/1000; }); starts=[]; var acc=0; for(var i=0;i<dur.length;i++){ starts[i]=acc; acc+=dur[i]; } total=acc; }
      function nw(){ try{return performance.now();}catch(e){return Date.now();} }
      function TOT(){ return (audioMode&&audioEl.duration&&isFinite(audioEl.duration)&&audioEl.duration>0)?audioEl.duration:total; }
      function gtimeSpeech(){ if(!chunks.length) return 0; var base=starts[idx]||0; var el=Math.min(dur[idx]||0,Math.max(0,(nw()-t0)/1000)); return Math.min(total,base+el); }
      function CUR(){ return audioMode?(audioEl.currentTime||0):gtimeSpeech(); }
      function idxAt(t){ for(var i=0;i<chunks.length;i++){ if(t<(starts[i]||0)+(dur[i]||0)) return i; } return Math.max(0,chunks.length-1); }
      function idxAtReal(rt){ var est=total?(rt/(TOT()||1))*total:0; return idxAt(est); } // tempo reale audio → chunk stimato (karaoke)
      function curBlockAt(t){ if(!cuesData) return 0; var lo=0; for(var i=0;i<cuesData.length;i++){ if(t>=cuesData[i]-0.001) lo=i; else break; } return lo; }
      function hlByCues(t){ var B=curBlockAt(t); var bStart=cuesData[B]||0, bEnd=(B+1<cuesData.length)?cuesData[B+1]:TOT(); var first=-1,last=-1; for(var i=0;i<chunks.length;i++){ if(chunks[i].bi===B){ if(first<0)first=i; last=i; } } if(first<0){ return; } var sum=0; for(var j=first;j<=last;j++) sum+=dur[j]||0; if(sum<=0||bEnd<=bStart){ hl(first); return; } var acc=bStart,target=first; for(var j2=first;j2<=last;j2++){ var w=(dur[j2]/sum)*(bEnd-bStart); if(t<acc+w){ target=j2; break; } acc+=w; target=j2; } hl(target); } // blocco esatto dai cue + sotto-sync frase nella finestra reale
      function clearHL(){ try{ if(HL) HL.clear(); }catch(e){} if(blockEl){ try{blockEl.classList.remove('bs-body-block');}catch(e){} blockEl=null; } }
      function hl(i){ clearHL(); var c=chunks[i]; if(!c) return; if(c.src&&c.src.classList){ c.src.classList.add('bs-body-block'); blockEl=c.src; } if(hlOK&&c.r){ try{ var r=document.createRange(); r.setStart(c.r.sN,c.r.sO); r.setEnd(c.r.eN,c.r.eO); HL.add(r); }catch(e){} } try{ if(c.src&&c.src.scrollIntoView) c.src.scrollIntoView({block:'nearest'}); }catch(e){} }
      var bBack,bPlay,bFwd,bRate,fill,thumb,time,prog;
      function paint(p){ if(bPlay){ bPlay.textContent=p?'\\u23F8':'\\u25B6'; bPlay.classList.toggle('on',!!p); } }
      function fmt(s){ s=Math.max(0,Math.round(s)); var m=Math.floor(s/60),x=s%60; return m+':'+(x<10?'0':'')+x; }
      function render(rt){ rt=Math.max(0,Math.min(1,rt||0)); if(fill) fill.style.width=(rt*100)+'%'; if(thumb) thumb.style.left=(rt*100)+'%'; if(time) time.textContent=fmt(rt*TOT()); }
      function startTick(){ stopTick(); ticker=setInterval(function(){ if(!drag) render(total?gtimeSpeech()/total:0); },100); }
      function stopTick(){ if(ticker){ clearInterval(ticker); ticker=null; } }
      function speakCur(){
        if(idx>=chunks.length){ finish(); return; }
        var c=chunks[idx];
        var txt=(subChar>0&&subChar<c.text.length)?c.text.slice(subChar):c.text;
        var u=new SpeechSynthesisUtterance(txt); u.lang=lang;
        u.rate=Math.max(0.5,Math.min(2,rate()*(c.rateMul||1))); u.pitch=c.pitch||1;
        u.onend=function(){ if(!playing||utter!==u) return; if(gap) clearTimeout(gap); gap=setTimeout(function(){ idx++; subChar=0; speakCur(); },c.endPause||180); };
        u.onerror=function(){ if(playing&&utter===u){ idx++; subChar=0; speakCur(); } };
        utter=u; t0=nw()-(subChar>0?(subChar/Math.max(1,c.text.length))*(dur[idx]||0)*1000:0);
        hl(idx); try{ speechSynthesis.cancel(); }catch(e){} try{ speechSynthesis.speak(u); }catch(e){} paint(true);
      }
      function finish(){ if(gap) clearTimeout(gap); stopTick(); clearHL(); playing=false; idx=0; subChar=0; paint(false); render(1); }
      function playFrom(i,sc){ if(gap) clearTimeout(gap); idx=Math.max(0,Math.min(i,chunks.length-1)); subChar=sc||0; playing=true; paint(true); startTick(); speakCur(); }
      function pause(){ if(gap) clearTimeout(gap); stopTick(); try{ speechSynthesis.cancel(); }catch(e){} playing=false; subChar=0; paint(false); }
      function ensure(){ if(!chunks.length){ build(); timing(); } }
      function seekTspeech(t){ ensure(); t=Math.max(0,Math.min(t,Math.max(0,total-0.05))); var i=idxAt(t); var f=(dur[i]>0)?(t-(starts[i]||0))/dur[i]:0; playFrom(i,Math.floor(f*(chunks[i]?chunks[i].text.length:0))); }
      // ── Transport unificato: audio incorporato o Web Speech ──
      function doToggle(){ if(audioMode){ if(audioEl.paused) audioEl.play(); else audioEl.pause(); return; } ensure(); if(playing){ pause(); return; } if(idx>=chunks.length) idx=0; playFrom(idx,subChar); }
      function doSeekRel(d){ if(audioMode){ audioEl.currentTime=Math.max(0,Math.min((audioEl.currentTime||0)+d,Math.max(0,TOT()-0.1))); return; } ensure(); seekTspeech(gtimeSpeech()+d); }
      function doSeekRatio(rt){ if(audioMode){ audioEl.currentTime=Math.max(0,Math.min(rt*TOT(),Math.max(0,TOT()-0.05))); return; } ensure(); seekTspeech(rt*total); }
      function doRate(){ ri=(ri+1)%SPEEDS.length; bRate.textContent='\\u00d7'+SPEEDS[ri]; if(audioMode){ audioEl.playbackRate=rate(); return; } if(chunks.length){ var t=gtimeSpeech(); timing(); if(playing) seekTspeech(t); else render(total?t/total:0); } }
      function doPlayNode(node){ ensure(); var i=-1; for(var j=0;j<chunks.length;j++){ if(chunks[j].src===node){ i=j; break; } } if(i<0){ for(var q=0;q<chunks.length;q++){ try{ if(node.compareDocumentPosition(chunks[q].src)&Node.DOCUMENT_POSITION_FOLLOWING){ i=q; break; } }catch(e){} } } i=Math.max(0,i); if(audioMode){ var bi=(chunks[i]&&typeof chunks[i].bi==='number')?chunks[i].bi:0; audioEl.currentTime=(cuesData&&cuesData[bi]!=null)?cuesData[bi]:((total?(starts[i]/total):0)*TOT()); audioEl.play(); hl(i); return; } playFrom(i,0); }
      function seg(txt,title){ var b=document.createElement('button'); b.type='button'; b.className='ap-seg'; b.textContent=txt; b.title=title; return b; }
      bBack=seg('\\u21BA10','Indietro 10 secondi'); bPlay=seg('\\u25B6','Ascolta / Pausa'); bPlay.className+=' ap-play'; bFwd=seg('5\\u21BB','Avanti 5 secondi'); bRate=seg('\\u00d71','Velocità di lettura');
      var chip=document.createElement('span'); chip.className='ap-chip'; chip.appendChild(bBack); chip.appendChild(bPlay); chip.appendChild(bFwd); chip.appendChild(bRate);
      prog=document.createElement('span'); prog.className='ap-prog'; fill=document.createElement('span'); fill.className='ap-fill'; thumb=document.createElement('span'); thumb.className='ap-thumb'; prog.appendChild(fill); prog.appendChild(thumb);
      time=document.createElement('span'); time.className='ap-time'; time.textContent='0:00';
      bar.appendChild(chip); bar.appendChild(prog); bar.appendChild(time);
      bBack.addEventListener('click',function(){ doSeekRel(-BACK); });
      bPlay.addEventListener('click',doToggle);
      bFwd.addEventListener('click',function(){ doSeekRel(FWD); });
      bRate.addEventListener('click',doRate);
      (function(){ function rat(x){ var bx=prog.getBoundingClientRect(); return bx.width?Math.max(0,Math.min(1,(x-bx.left)/bx.width)):0; }
        prog.addEventListener('pointerdown',function(e){ ensure(); drag=true; try{prog.setPointerCapture(e.pointerId);}catch(er){} render(rat(e.clientX)); e.preventDefault(); });
        prog.addEventListener('pointermove',function(e){ if(drag) render(rat(e.clientX)); });
        prog.addEventListener('pointerup',function(e){ if(!drag) return; drag=false; try{prog.releasePointerCapture(e.pointerId);}catch(er){} doSeekRatio(rat(e.clientX)); });
      })();
      build(); timing();
      if(cuesData && cuesData.length!==nBlocks) cuesData=null; // disallineamento → torna alla stima proporzionale
      if(audioMode){ audioEl.playbackRate=rate();
        audioEl.addEventListener('play',function(){ paint(true); });
        audioEl.addEventListener('pause',function(){ paint(false); });
        audioEl.addEventListener('ended',function(){ paint(false); render(1); });
        audioEl.addEventListener('timeupdate',function(){ if(drag) return; var tot=TOT(); render(tot?CUR()/tot:0); if(cuesData&&cuesData.length) hlByCues(CUR()); else hl(idxAtReal(CUR())); });
        audioEl.addEventListener('loadedmetadata',function(){ render(0); });
      }
      (function(){ var hs=body.querySelectorAll('h3,h4'); for(var i=0;i<hs.length;i++){ (function(h){ if(h.querySelector('.ap-sec')) return; var b=document.createElement('button'); b.type='button'; b.className='ap-sec'; b.setAttribute('data-ap-skip',''); b.title='Ascolta da qui'; b.textContent='\\u25B6'; b.addEventListener('click',function(e){ e.stopPropagation(); doPlayNode(h); }); h.insertBefore(b,h.firstChild); })(hs[i]); } })();
      try{ document.addEventListener('visibilitychange',function(){ if(document.hidden && !audioMode) pause(); }); }catch(e){}
    })();
    <\/script>
</body>
</html>`;
    }

    // ── Stampa ─────────────────────────────────────────────────────────────
    window.printBranchSynthesis = function () {
        if (!_lastSynthesis) return;
        window.MappAIStudyExport.openPrintable(_buildSynthesisPrintHtml(_lastSynthesis), {
            blockedMsg: 'Popup bloccato — abilita i popup',
            successMsg: '✓ Sintesi stampabile aperta'
        });
    };

    // Salva la sintesi corrente nell'archivio documenti (richiamabile dall'hub
    // Materiali di studio senza rigenerare). Best-effort: un errore non blocca.
    function _saveSynthesisDoc(data) {
        if (!window.MappAIStudyDocs) return;
        try {
            const kindTitle = data.whole ? window.t('bs_whole_title', 'Sintesi della mappa') : 'Sintesi';
            const verde = data.tuned ? ' [VERDE]' : '';
            window.MappAIStudyDocs.save({
                kind: 'synthesis',
                title: kindTitle + ': ' + (data.branchLabel || '') + verde,
                mapName: data.mapName || '',
                html: _buildSynthesisPrintHtml(data)
            });
        } catch (e) { console.warn('[BranchSynthesis] Salvataggio documento fallito:', e); }
    }

    // ── Audio voce naturale (Gemini TTS → file WAV scaricabile) ────────────
    // Materiale specifico per allievi dislessici: voce di qualità, non robotica.
    // Gira SOLO nell'app (serve electronAPI + chiave Google); il contenuto è
    // didattico, non dati personali dell'allievo.
    function _cleanPlain(md) {
        return String(md || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/\[\d+\]/g, '')
            .replace(/[*_`>#]/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    function _b64ToBytes(b64) {
        const bin = atob(b64); const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
    }
    function _pcmToWav(pcm, sampleRate) {
        const numCh = 1, bps = 16, blockAlign = numCh * bps / 8, byteRate = sampleRate * blockAlign;
        const buf = new ArrayBuffer(44 + pcm.length), dv = new DataView(buf);
        const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        ws(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); ws(8, 'WAVE'); ws(12, 'fmt ');
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
        dv.setUint32(24, sampleRate, true); dv.setUint32(28, byteRate, true);
        dv.setUint16(32, blockAlign, true); dv.setUint16(34, bps, true);
        ws(36, 'data'); dv.setUint32(40, pcm.length, true);
        new Uint8Array(buf, 44).set(pcm);
        return new Blob([buf], { type: 'audio/wav' });
    }
    // PCM 16-bit mono → MP3 (lamejs, ~6x più leggero del WAV). Fallback: null se lib assente.
    function _pcmToMp3(pcm, sampleRate, kbps) {
        if (!window.lamejs || !window.lamejs.Mp3Encoder) return null;
        try {
            const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
            const enc = new window.lamejs.Mp3Encoder(1, sampleRate, kbps || 64);
            const out = []; const block = 1152;
            for (let i = 0; i < samples.length; i += block) {
                const buf = enc.encodeBuffer(samples.subarray(i, i + block));
                if (buf.length > 0) out.push(new Uint8Array(buf));
            }
            const end = enc.flush();
            if (end.length > 0) out.push(new Uint8Array(end));
            return new Blob(out, { type: 'audio/mpeg' });
        } catch (e) { console.warn('[BranchSynthesis] MP3 encode fallito, uso WAV:', e); return null; }
    }
    // Sceglie MP3 se disponibile (piccolo, universale su iOS/Android), altrimenti WAV.
    function _encodeAudio(pcm, sampleRate) {
        const mp3 = _pcmToMp3(pcm, sampleRate, 64);
        if (mp3) return { blob: mp3, mime: 'audio/mpeg', ext: 'mp3' };
        return { blob: _pcmToWav(pcm, sampleRate), mime: 'audio/wav', ext: 'wav' };
    }

    function _fnameFor(data) {
        var base = (('Sintesi-' + (data.branchLabel || 'mappa')).replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().replace(/\s+/g, '-')) || 'Sintesi';
        return (data && data.tuned) ? base + '-[VERDE]' : base;
    }
    function _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    function _downloadHtml(html, filename) { _downloadBlob(new Blob([html], { type: 'text/html' }), filename); }
    function _blobToDataUri(blob) {
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    }

    // Blocchi leggibili (h3/h4/p/li) NELLO STESSO ORDINE del lettore: base per la
    // generazione audio per-blocco e per l'allineamento dei cue di sincronizzazione.
    function _blocksForAudio(data) {
        const full = _buildSynthesisPrintHtml(data);
        let doc; try { doc = new DOMParser().parseFromString(full, 'text/html'); } catch (e) { return []; }
        const bodyEl = doc.querySelector('.bs-body'); if (!bodyEl) return [];
        bodyEl.querySelectorAll('.bs-citations, sup').forEach(n => n.remove());
        const out = [];
        bodyEl.querySelectorAll('h3,h4,p,li,blockquote').forEach(bl => {
            const txt = _cleanPlain(bl.textContent || '');
            if (txt) out.push(txt);
        });
        return out;
    }

    // Genera l'audio (voce naturale Gemini) UN CLIP PER BLOCCO → { blob WAV, cues }.
    // cues[i] = tempo REALE di inizio del blocco i (dalla lunghezza PCM del clip) →
    // karaoke sincronizzato con la voce, non stimato.
    async function _generateSynthesisAudioWithCues(data) {
        if (!(window.electronAPI && window.electronAPI.generateGemini)) throw new Error(window.t('bs_audio_desktop', 'La voce naturale richiede l\'app desktop'));
        let key = ''; try { key = localStorage.getItem('gemini_api_key') || ''; } catch (e) {}
        if (!key) throw new Error(window.t('bs_audio_key', 'Serve la chiave API Google (Gemini) per la voce naturale'));
        const blocks = _blocksForAudio(data);
        if (!blocks.length) throw new Error(window.t('bs_audio_empty', 'Nessun testo da leggere'));
        const model = (function () { try { return localStorage.getItem('mappai_tts_model') || 'gemini-2.5-flash-preview-tts'; } catch (e) { return 'gemini-2.5-flash-preview-tts'; } })();
        const voice = (function () { try { return localStorage.getItem('mappai_tts_voice') || 'Kore'; } catch (e) { return 'Kore'; } })();
        const pcmParts = []; let rate = 24000; const cues = []; let cum = 0;
        for (let i = 0; i < blocks.length; i++) {
            window.showLoadingOverlay && window.showLoadingOverlay(true, window.t('bs_audio_prog', 'Genero audio') + ' ' + (i + 1) + '/' + blocks.length + '…');
            const payload = {
                contents: [{ parts: [{ text: blocks[i] }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
            };
            const resp = await window.electronAPI.generateGemini({ apiKey: key, payload: payload, model: model });
            // Registro consumi: il TTS bypassa fetchModelAPI → record manuale
            try {
                const um = resp && resp.usageMetadata;
                if (um && window.MappAIUsage) window.MappAIUsage.record({ provider: 'google', model: model, inTok: um.promptTokenCount || 0, outTok: um.candidatesTokenCount || 0, ctx: { cat: 'materials', sub: 'tts' } });
            } catch (uerr) { /* non bloccante */ }
            const part = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts && resp.candidates[0].content.parts[0];
            const inline = part && part.inlineData;
            if (!inline || !inline.data) throw new Error(window.t('bs_audio_noaudio', 'Risposta senza audio (modello TTS non disponibile con questa chiave?)'));
            const mr = /rate=(\d+)/.exec(inline.mimeType || ''); if (mr) rate = parseInt(mr[1], 10);
            const bytes = _b64ToBytes(inline.data);
            pcmParts.push(bytes);
            cues.push(Math.round(cum * 1000) / 1000);
            cum += (bytes.length / 2) / rate; // durata reale del clip (PCM 16-bit mono)
        }
        const totalLen = pcmParts.reduce((a, b) => a + b.length, 0);
        const all = new Uint8Array(totalLen); let off = 0;
        pcmParts.forEach(p => { all.set(p, off); off += p.length; });
        window.showLoadingOverlay && window.showLoadingOverlay(true, window.t('bs_audio_encoding', 'Comprimo l\'audio…'));
        const enc = _encodeAudio(all, rate); // MP3 se possibile
        return { blob: enc.blob, cues: cues, mime: enc.mime, ext: enc.ext };
    }

    // Menù dopo la generazione: condividi con audio (QR) · scarica HTML+audio · scarica WAV.
    // L'HTML con audio incorporato si ascolta anche offline: l'allievo lo salva dal telefono.
    function _audioReadyChooser(res, data) {
        const blob = res.blob, cues = res.cues, mime = res.mime || 'audio/wav', ext = res.ext || 'wav';
        const fname = _fnameFor(data);
        const canShare = !!(window.MappAILive && window.MappAILive.shareDocQr);
        const esc = _escBS;
        const modal = document.createElement('div');
        modal.id = 'bs-audio-chooser';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
        modal.innerHTML =
            '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[460px] p-7 relative">' +
                '<button type="button" onclick="document.getElementById(\'bs-audio-chooser\').remove()" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>' +
                '<div class="flex items-center gap-3 mb-2"><div class="pm-icon-wrap"><i data-lucide="headphones" class="w-5 h-5 text-indigo-600"></i></div>' +
                '<div class="pm-title">' + esc(window.t('bs_audio_ready', 'Voce naturale pronta')) + '</div></div>' +
                '<p class="pm-body-text mb-4">' + esc(window.t('bs_audio_ready_sub', 'Scegli come consegnare l\'audio. L\'HTML con audio incorporato si ascolta anche offline: l\'allievo lo salva sul telefono.')) + '</p>' +
                '<div class="flex flex-col gap-2">' +
                    (canShare ? '<button type="button" id="bsa-share" class="pm-btn-primary" style="justify-content:center"><i data-lucide="qr-code" class="w-4 h-4"></i> ' + esc(window.t('bs_audio_share', 'Condividi sintesi + audio (QR)')) + '</button>' : '') +
                    '<button type="button" id="bsa-html" class="pm-btn-cancel" style="justify-content:center"><i data-lucide="file-down" class="w-4 h-4"></i> ' + esc(window.t('bs_audio_dl_html', 'Scarica HTML + audio')) + '</button>' +
                    '<button type="button" id="bsa-wav" class="pm-btn-cancel" style="justify-content:center"><i data-lucide="download" class="w-4 h-4"></i> ' + esc(window.t('bs_audio_dl_file', 'Scarica solo audio') + ' (' + ext.toUpperCase() + ')') + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();
        const wavBtn = modal.querySelector('#bsa-wav');
        if (wavBtn) wavBtn.onclick = function () { _downloadBlob(blob, fname + '.' + ext); modal.remove(); window.showToast && window.showToast(window.t('bs_audio_done', '✓ Audio scaricato'), 'success'); };
        const htmlBtn = modal.querySelector('#bsa-html');
        if (htmlBtn) htmlBtn.onclick = async function () { const uri = await _blobToDataUri(blob); _downloadHtml(_buildSynthesisPrintHtml(data, { audioDataUri: uri, audioMime: mime, cues: cues }), fname + '.html'); modal.remove(); window.showToast && window.showToast(window.t('bs_audio_html_done', '✓ HTML con audio scaricato'), 'success'); };
        const shareBtn = modal.querySelector('#bsa-share');
        if (shareBtn) shareBtn.onclick = async function () { const uri = await _blobToDataUri(blob); modal.remove(); window.MappAILive.shareDocQr(fname + '.html', _buildSynthesisPrintHtml(data, { audioDataUri: uri, audioMime: mime, cues: cues })); };
    }

    window.generateSynthesisAudio = async function (dataOverride) {
        const data = dataOverride || _lastSynthesis;
        if (!data) { window.showToast && window.showToast(window.t('bs_audio_need', 'Genera prima una sintesi'), 'warning'); return; }
        try {
            const res = await _generateSynthesisAudioWithCues(data);
            window.showLoadingOverlay && window.showLoadingOverlay(false);
            _audioReadyChooser(res, data);
        } catch (err) {
            window.showLoadingOverlay && window.showLoadingOverlay(false);
            console.error('[BranchSynthesis] audio TTS fallito:', err);
            window.showToast && window.showToast(err && err.message ? err.message : window.t('bs_audio_fail', 'Audio non generato'), 'error');
        }
    };

    // Superficie pubblica: costruzione dell'HTML stampabile/esportabile (usata
    // anche per la ri-apertura dall'archivio documenti).
    window.MappAIBranchSynthesis = { buildPrintHtml: _buildSynthesisPrintHtml };

    console.log('[MappAI] mappai-branch-synthesis.js caricato ✓');
})();
