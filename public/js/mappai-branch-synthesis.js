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

    /* Il CARATTERE di questo documento: le @font-face + la variabile --doc-font
       che la regola del `body` legge. Un documento in finestra propria non carica
       style.css, quindi `--app-font` lì non esiste: il blocco va scritto dentro.
       Argomento = la scelta fatta in ELABORA per QUESTO documento; senza, comanda
       il carattere dell'app (18/8/26). */
    function _fontDoc(id) {
        try {
            return (typeof window !== 'undefined' && window.MappAIFont)
                ? window.MappAIFont.styleDocumento(id) : '';
        } catch (e) { return ''; }
    }


    let _lastSynthesis = null; // { branchLabel, mapName, rawText, sourcesArr }

    // Modalità silenziosa (pipeline 011): niente overlay né modale risultato.
    // Default false → il flusso manuale è invariato. runWholeMap la alza/abbassa.
    let _silent = false;
    /* Il nome del lavoro (quarto argomento) viaggia SEMPRE: senza, l'indicatore
       in barra ripiega sul titolo del progetto attivo, e una generazione lunga
       si ribattezzava a ogni fase se nel frattempo si sceglieva un altro
       progetto in ELABORA. «Sintesi» dice anche più di un nome di mappa: quello
       che si sta creando, non dove ci si trova. */
    function _ovl(show, msg) {
        if (_silent || !window.showLoadingOverlay) return;
        window.showLoadingOverlay(show, msg, 'default', window.t('bs_lavoro', 'Sintesi'));
    }
    function _maybeResultModal(data) { if (!_silent) _openBranchSynthesisResultModal(data); }

    function _escBS(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function _isEnglish() {
        return window.currentLanguage === 'en' || window.currentLanguage === 'en-US';
    }

    /* ── LA CORNICE CONDIVISA (mappai-doc-head.js, 11/8/26) ──────────────────
       La sintesi prende dalla cornice il MARKUP della testata (e con esso i chip
       classe e materia, che prima nessun foglio stampato portava) e le
       dichiarazioni del PIÈ, che si incastrano nel suo @page.
       ⚠️ NON prende le regole di taglia: questo documento ha due scale sue —
       `--ap-txt-k` a schermo (le leve di leggibilità) e `--ap-pt` in stampa (i
       corpi in PUNTI, decisi da Giacomo il 10/8) — e le regole `.mm-dh__*`
       fissano dei px. Le tre righe qui sotto ridichiarano titolo e sottotitolo
       nelle DUE scale, come faceva `.bs-title`: senza, ingrandire il testo non
       ingrandirebbe più la testata. */
    function _DH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
    function _bsTestata(data, kindLabel, now) {
        const DH = _DH();
        if (!DH) {
            // ripiego: la testata di prima, così un documento esce comunque
            return '<div class="mm-dh"><div class="mm-dh__t">' + _escBS(data.branchLabel) +
                '</div><div class="mm-dh__s">' + _escBS(data.mapName) + ' · ' +
                _escBS(kindLabel) + ' · ' + _escBS(now) + '</div></div>';
        }
        return DH.testata(DH.conContesto({
            titolo: data.branchLabel, tipo: kindLabel, mappa: data.mapName,
            classe: data.classe, materia: data.materia, data: now
        }));
    }
    function _bsStileTestata(accento) {
        const DH = _DH();
        // `pagina:false`: il @page di questo documento è suo, e vive nel blocco
        // @media print più sotto insieme a tutta la taratura della stampa.
        return DH ? DH.stile({ accento: accento, pagina: false }) : '';
    }
    function _bsPie(mappa) {
        const DH = _DH();
        return DH ? DH.pieDichiarazioni({ mappa: mappa }) : '';
    }

    // Percorso RELATIVO → stringa utilizzabile in un attributo `src`. I nomi dei
    // file del vault portano spazi, parentesi e accenti: senza codifica il
    // riferimento si rompe in silenzio (un `#` nel nome tronca l'URL, e da lì in
    // poi il documento è muto senza dirlo). Si codifica segmento per segmento,
    // così le sottocartelle restano tali. Chi passa già un URL con schema
    // (`data:`, `file:`, `http:`, `//…`) lo vede transitare intatto.
    function _relUrl(p) {
        const s = String(p == null ? '' : p);
        if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.indexOf('//') === 0) return s;
        return s.split('/').map(function (seg) {
            try { return encodeURIComponent(seg); } catch (e) { return seg; }
        }).join('/');
    }
    function _mimeFromExt(p) {
        const ext = String(p == null ? '' : p).toLowerCase().split('.').pop();
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'm4a' || ext === 'mp4' || ext === 'aac') return 'audio/mp4';
        if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'audio/ogg';
        return 'audio/mpeg';   // mp3 e sconosciuti: è il formato che produciamo
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

    /* I TRE modali della sintesi (configurazione, risultato, scelta dell'audio)
       dichiaravano un piano scritto a mano — `z-[3000]`, `z-[3200]` — deciso
       quando la sintesi si apriva sopra la mappa nuda e non c'era altro sopra.
       Da quando ELABORA è una console a schermo intero che parte da 12000, quei
       numeri li mandavano DIETRO: il modale si costruiva davvero, ma non lo
       vedeva nessuno — ed è il difetto per cui «Crea un documento → Sintesi»
       sembrava un bottone morto (Giacomo, 17/8).
       Il piano si CHIEDE al motore, che è l'unico a sapere quanto è alta la
       pila in questo momento. Si chiede QUI, dove il modale nasce, e non nei
       chiamanti: la generazione è asincrona, quindi chi preme il bottone non sa
       quando comparirà il modale di risultato e non potrebbe alzarlo.
       Fuori dal motore (banchi, pagine di prova) non si tocca niente: resta il
       piano dichiarato nelle classi. */
    function _zSopra(modal) {
        try {
            var MM = window.MappAIModal;
            if (MM && MM.prossimoZ) modal.style.zIndex = String(MM.prossimoZ());
        } catch (e) { /* senza motore vale la classe */ }
    }

    // ── Modale di configurazione ──────────────────────────────────────────
    window.openBranchSynthesisModal = function (nodeId) {
        if (window.mappaiOccupato && window.mappaiOccupato()) return;
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
        _zSopra(modal);
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

            /* col nome del RAMO: l'indicatore dice che cosa si sta scrivendo,
               non in quale progetto ci si trova (che può cambiare sotto) */
            window.showLoadingOverlay(true, 'Sintesi del ramo in corso…', 'default',
                window.t('bs_lavoro', 'Sintesi') + ': ' + branchLabel);
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
                _ovl(true, window.t('bs_progress_whole', 'Sintesi della mappa in corso…'));
                const out = await _synthesizeOnce(
                    [...allNodes].sort((a, b) => (a.level || 0) - (b.level || 0)), mapName, apiKey);
                _ovl(false);
                if (!out) {
                    if (!_silent) window.showToast('La mappa non ha contenuti (descrizioni) da sintetizzare', 'warning');
                    return null;
                }
                _lastSynthesis = { branchLabel: mapName, mapName, rawText: out.rawText, sourcesArr: out.sourcesArr, causalTriples: out.causalTriples || [], tuned: !!(window.MappAITune && window.MappAITune.armed) };
                _maybeResultModal(_lastSynthesis);
                return _lastSynthesis;
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
                _ovl(true,
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
                _ovl(false);
                if (!_silent) window.showToast('Nessun ramo è stato sintetizzato — riprova', 'error');
                return null;
            }

            // Panoramica introduttiva (best-effort: se fallisce, il documento esce senza)
            let intro = '';
            try {
                _ovl(true, window.t('bs_progress_overview', 'Scrivo la panoramica…'));
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

            _ovl(false);
            _lastSynthesis = { whole: true, branchLabel: mapName, mapName, intro, sections, tuned: !!(window.MappAITune && window.MappAITune.armed) };
            _maybeResultModal(_lastSynthesis);
            return _lastSynthesis;
        } catch (err) {
            _ovl(false);
            console.error('[BranchSynthesis] Errore sintesi mappa:', err);
            if (_silent) throw err;   // pipeline: propaga per far fallire lo step
            window.showToast('Errore generazione sintesi: ' + (err.message || err), 'error');
            return null;
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
            const html = (triples && triples.length && window.MappAICausal && window.MappAICausal.htmlBlock)
                ? window.MappAICausal.htmlBlock(triples) : '';
            // `data-ap-skip`: è uno schema, non prosa — ad alta voce sarebbe
            // rumore (stessa ragione per cui non sta nel modale) e sfaserebbe
            // i cue dell'audio rispetto ai blocchi editabili.
            return html ? '<div data-ap-skip>' + html + '</div>' : '';
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
                    /* 🐛 «Audio voce naturale» è stato TOLTO da qui (17/8, dal
                       rilievo di Giacomo). Faceva partire la registrazione senza
                       scrivere la copia parlante nella cartella della mappa —
                       cioè ricadeva esattamente nel difetto segnalato stamattina:
                       voce registrata, nessun file in «Materiale Studio». Erano
                       due porte per lo stesso gesto con esiti diversi
                       (invariante 21), e questa faceva di meno. La voce si
                       registra dall'EDITOR, dove il bottone «Voce» scrive anche
                       il file — e apre lo stesso menu di scarico/QR, quindi qui
                       non si perde niente. */
                    '<button type="button" onclick="document.getElementById(\'branch-synthesis-modal\').remove()" class="pm-btn-cancel">' + _escBS(window.t('mm_chiudi', 'Chiudi')) + '</button>' +
                    '<button type="button" onclick="window.printBranchSynthesis()" class="pm-btn-cancel">' +
                        '<i data-lucide="printer" class="w-4 h-4"></i> ' + _escBS(window.t('de_print', 'Stampa')) +
                    '</button>' +
                    /* 🐛 IL VICOLO CIECO (17/8): questo modale ARCHIVIA la sintesi
                       in localStorage ma non scrive nessun file, e le sue azioni
                       non portavano da nessuna parte — «Stampa» apre una finestra
                       stampabile, non salva. Dopo aver generato non c'era modo di
                       tenere il documento: «non posso salvare la nuova sintesi».
                       Salvare e pubblicare vivono nell'EDITOR (decisione del
                       13/8: «Salva» tiene il documento, «Crea PDF» lo pubblica in
                       «Materiale Studio»), quindi l'azione conclusiva di questo
                       modale è ANDARCI. Non è un secondo posto dove si salva: è
                       la strada per l'unico che c'è. */
                    '<button type="button" onclick="window.apriSintesiNellEditor()" class="pm-btn-primary">' +
                        '<i data-lucide="pencil-line" class="w-4 h-4"></i> ' + _escBS(window.t('bs_rivedi', 'Rivedi e salva')) +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        _zSopra(modal);
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
        // Voce naturale (Gemini). Due strade, decise dal chiamante:
        //  · `audioDataUri` — l'audio INCORPORATO nel file. Un file solo, che si
        //    ascolta anche offline e si inoltra per posta, ma pesa: un MP3 vero
        //    da 6,16 MB porta l'HTML da 63 KB a 8,28 MB (137×). È la copia da
        //    CONSEGNARE.
        //  · `audioSrc` — percorso RELATIVO all'audio che sta nella STESSA
        //    cartella (es. `Sintesi-audio-Il Clima -VERDE.mp3`). Il documento
        //    resta leggero e punta al fratello: è la copia che vive nel VAULT,
        //    accanto al suo audio.
        // Se arrivano entrambi vince `audioDataUri`: chi incorpora ha già deciso
        // che quel file deve bastare a sé stesso.
        const audioUrl = opts.audioDataUri || (opts.audioSrc ? _relUrl(opts.audioSrc) : '');
        // UNA regola per il tipo — incorporato ⇔ il `src` comincia per `data:` —
        // e `data-ap-src` la dichiara nel markup: chi ospita il documento in un
        // iframe deve poter distinguere i due casi senza annusare una stringa
        // che, incorporata, è lunga megabyte.
        const audioEmbedded = /^data:/i.test(audioUrl);
        const audioTag = audioUrl
            ? '<audio id="ap-audio" preload="auto" data-ap-src="' + (audioEmbedded ? 'embedded' : 'file') + '" style="display:none">'
                + '<source src="' + (audioEmbedded ? audioUrl : _escBS(audioUrl)) + '"'
                + ' type="' + _escBS(opts.audioMime || (audioEmbedded ? 'audio/wav' : _mimeFromExt(opts.audioSrc))) + '">'
              + '</audio>'
            : '';
        // Cue map: tempo reale di inizio di ogni blocco → karaoke sincronizzato con la voce.
        const cuesTag = (opts.cues && opts.cues.length)
            ? '<script id="ap-cues" type="application/json">' + JSON.stringify(opts.cues) + '<\/script>'
            : '';

    /* Data del documento: GG/MM/AAAA senza ora — la scrive la cornice
       (mappai-doc-head.js), una regola per tutti i fogli. */
        const now = _DH() ? _DH().data(new Date()) : new Date().toLocaleDateString('it-IT');
        const accentColor = '#4f46e5';
        // `editedBlocks` = testo rivisto dal docente nell'editor documenti (ELABORA).
        // Sono gli STESSI tag di blocco (h3/h4/p/li) prodotti da _mdToHtml: il lettore
        // TTS e i cue dell'audio continuano a trovarli. Citazioni e box causale
        // restano quelli generati (non editabili).
        const editedHtml = (data.editedBlocks && data.editedBlocks.length && window.MappAIDocEdit)
            ? window.MappAIDocEdit.blocksToHtml(data.editedBlocks)
            : null;
        // Con i blocchi editati: nella sintesi di RAMO citazioni e box causale si
        // riappendono in coda (vivono fuori dal corpo); in quella di TUTTA LA MAPPA
        // stanno già dentro il corpo, sezione per sezione (blocchi `raw`) → non si
        // duplicano, e data.sourcesArr lì non esiste nemmeno.
        /* ── LE DUE SEZIONI CHE SI POSSONO SPEGNERE (18/8/26) ───────────────
           «La catena dei perché» e le «Note» (le citazioni numerate) sono
           generate, non editabili, e vivono in coda al corpo. Il docente le
           accende e le spegne dall'editor, e la scelta vale per HTML, PDF e
           stampa insieme — escono tutti da qui.
           Default ACCESE: una sintesi già fatta non deve cambiare aspetto
           perché è comparso un comando.
           ⚠️ Spegnendo le Note vanno tolti anche i RICHIAMI dal testo, o
           restano i numerini puntati a niente. Dalla resa, mai dalla sorgente:
           riaccendendole devono tornare. */
        const mostraCausale = data.mostraCausale !== false;
        const mostraNote = data.mostraNote !== false;
        const _senzaRichiami = function (corpo) {
            if (mostraNote || !window.MappAIDocEdit) return corpo;
            return window.MappAIDocEdit.togliRichiamiCitazione(corpo);
        };
        const _coda = function () {
            return (mostraCausale ? _causalBoxHtml(data.causalTriples) : '') +
                (mostraNote ? _buildCitationsHtml(data.sourcesArr || [], 'print') : '');
        };
        const contentHtml = editedHtml != null
            ? (data.whole
                ? editedHtml
                : _senzaRichiami(editedHtml) + _coda())
            : (data.whole
                ? _wholeBodyHtml(data, 'print')
                : _senzaRichiami(_mdToHtml(data.rawText, 'print')) + _coda());
        /* ── L'IMMAGINE DI RIFERIMENTO (dossier di fonte, 21/8) ─────────────
           Una sintesi che nasce da una fonte iconografica si apre con la FOTO:
           il testo parla di ciò che si vede, e senza l'immagine accanto va
           letto a memoria. Larghezza dichiarata in CENTIMETRI (max 15) perché
           la misura che conta è quella sul FOGLIO — in px sarebbe tarata sullo
           schermo e in stampa uscirebbe a caso.
           Sta DENTRO .bs-body: così l'editor documenti la legge come blocco
           `raw` e la conserva al salvataggio, invece di perderla al primo
           ritocco del testo. */
        const foto = data.foto || null;
        const fotoHtml = (foto && foto.b64)
            ? '<figure class="bs-fonte">'
                + '<img src="data:' + _escBS(foto.mime || 'image/jpeg') + ';base64,' + String(foto.b64).replace(/[^A-Za-z0-9+/=]/g, '') + '"'
                + ' alt="' + _escBS(foto.titolo || data.branchLabel || '') + '">'
                + '<figcaption>' + _escBS(foto.didascalia
                    || (window.t('bs_fonte_cap', 'Fonte iconografica analizzata') + (foto.titolo ? ' — ' + foto.titolo : '')))
                + '</figcaption>'
              + '</figure>'
            : '';
        const kindLabel = data.whole
            ? window.t('bs_whole_title', 'Sintesi della mappa')
            : 'Sintesi di ramo';

        // Etichette del comando Aa, una per stato del ciclo: il bottone DEVE dire
        // dove si è, altrimenti a schermo lo stato non è visibile in nessun modo.
        // Il documento è autoconsistente → le stringhe si cuociono qui.
        const dysLabels = [
            window.t('bs_doc_dys', 'Aa Dislessia'),
            window.t('bs_doc_dys_x15', 'Aa 1,5×'),
            window.t('bs_doc_dys_x2', 'Aa 2×')
        ];
        const dysTip = window.t('bs_doc_dys_tip', 'Veste ad alta leggibilità: un clic per il testo a 1,5×, un altro per 2×, un terzo per tornare al normale');
        // Evidenziazione della lettura (karaoke): due stati, e l'ETICHETTA li
        // nomina. La sola classe accesa sarebbe colore, cioè un canale solo —
        // la stessa ragione per cui il comando Aa dice dove si è.
        // Indice 0 = spento, 1 = acceso: il documento parte acceso.
        const hlLabels = [
            window.t('bs_doc_hl_off', 'Evidenzia: no'),
            window.t('bs_doc_hl_on', 'Evidenzia: sì')
        ];
        const hlTip = window.t('bs_doc_hl_tip', 'Accende o spegne l\'evidenziazione della frase che si sta ascoltando — e con essa lo scorrimento che la segue');
        /* Riga di lettura: un ciclo, come «Aa». L'altezza si sceglie passando da
           uno stato al successivo invece che con un cursore — un cursore in una
           testata che deve reggere anche un telefono sarebbe il pezzo più
           difficile da usare proprio per chi la riga di lettura la accende. */
        const rigaLabels = [
            window.t('bs_doc_riga_off', 'Riga: no'),
            window.t('bs_doc_riga_1', 'Riga: stretta'),
            window.t('bs_doc_riga_2', 'Riga: media'),
            window.t('bs_doc_riga_3', 'Riga: larga')
        ];
        const rigaTip = window.t('bs_doc_riga_tip', 'Oscura la pagina tranne una finestra che segue il puntatore, per non perdere il rigo: un clic per stringerla o allargarla, l\'ultimo la spegne');
        const rigaLabelsJson = JSON.stringify(rigaLabels).replace(/</g, '\\u003c');
        // Le etichette finiscono dentro uno <script> del documento: un `<` letterale
        // chiuderebbe il tag e la pagina si aprirebbe muta, senza errori in console.
        const dysLabelsJson = JSON.stringify(dysLabels).replace(/</g, '\\u003c');
        const hlLabelsJson = JSON.stringify(hlLabels).replace(/</g, '\\u003c');

        return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <!-- Senza questa riga un tablet dichiara una finestra finta di 980px e poi
         RIMPICCIOLISCE tutta la pagina per farcela stare: il testo arriva a metà
         della sua dimensione proprio sul dispositivo di chi ha bisogno che sia
         grande. Con essa la pagina si REIMPAGINA sulla larghezza vera. -->
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sintesi — ${_escBS(data.branchLabel)}</title>
    <style>
    ${_fontDoc(opts && opts.font)}
        /* Le due leve della taglia del testo. Sono FATTORI e non valori finiti,
           così ogni regola qui sotto continua a dichiarare la sua misura di
           partenza — calc(11px * var(--ap-txt-k)) dice «gli 11 di sempre,
           scalati»: un 17.6px scritto a mano non direbbe da dove viene, e al
           prossimo ritocco ci sarebbero due numeri da tenere allineati.
           ⚠️ Nessun apice inverso in questi commenti: sono dentro un template
           literal e lo chiuderebbero, facendo morire il file al parse.
           Sono DUE perché sono due decisioni separate — la testata e il corpo
           possono divergere — e oggi valgono entrambe 1.6 (+60%, 10/8/26). */
        :root { --ap-txt-k: 1.6; --ap-ui-k: 1.6; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        /* La colonna si misura in CARATTERI, non in pixel: 72ch resta la misura
           tipografica giusta (45-75 caratteri per riga) qualunque taglia prenda
           il testo. Coi vecchi 800px fissi, ingrandendo del 60% la riga sarebbe
           passata da 111 a 70 caratteri per caso, non per scelta.
           ⚠️ "ch" si risolve nel font dell'elemento che lo SCRIVE: qui il body,
           che è Space Mono — la stessa unità sui comandi misurerebbe altro. */
        body { font-family:var(--doc-font, 'Space Mono', monospace); font-size:calc(11px * var(--ap-txt-k)); color:#1e293b; margin:0 auto; padding:24px 32px; max-width:72ch; background:#f8fafc; }
        /* Su un telefono i 32px di fianco valgono il 16% della larghezza: si
           restringono, o la colonna scende sotto i 35 caratteri per riga. */
        @media (max-width: 640px) { body { padding:16px 14px; } }
        ${_bsStileTestata(accentColor)}
        /* Le DUE righe che la cornice non può dare: qui titolo e sottotitolo
           seguono la leva di leggibilità dello schermo (--ap-txt-k), come
           facevano .bs-title e .bs-subtitle. La cornice fissa dei px perché gli
           altri otto documenti una leva non ce l'hanno. */
        .mm-dh__t { font-size:calc(20px * var(--ap-txt-k)); }
        .mm-dh__s { font-size:calc(10px * var(--ap-txt-k)); }
        .mm-dh__c, .mm-dh__b { font-size:calc(10px * var(--ap-txt-k)); }
        .bs-body { background:white; border-radius:16px; padding:24px 28px; }
        .bs-body h3 { font-size:calc(14px * var(--ap-txt-k)); font-weight:900; color:${accentColor}; margin:18px 0 8px; }
        .bs-body h4 { font-size:calc(12px * var(--ap-txt-k)); font-weight:700; color:#1e293b; margin:14px 0 6px; }
        .bs-body p { font-size:calc(11px * var(--ap-txt-k)); line-height:1.7; color:#334155; margin:0 0 10px; }
        .bs-body ul { margin:0 0 10px 18px; padding:0; }
        .bs-body li { font-size:calc(11px * var(--ap-txt-k)); line-height:1.7; color:#334155; margin-bottom:4px; }
        .bs-body sup { color:${accentColor}; font-weight:bold; }
        /* Immagine di riferimento: 15cm di larghezza massima (misura del foglio,
           non dello schermo), centrata, con la didascalia sotto. Non si spezza
           fra due pagine. */
        .bs-fonte { margin:0 0 22px; padding:0; text-align:center; break-inside:avoid; page-break-inside:avoid; }
        /* Larghezza e altezza sono TETTI, non misure imposte: con width:100%
           il tetto d'altezza della stampa schiacciava il ritratto del 9%
           invece di rimpicciolirlo. Cosi' le proporzioni le tiene il
           browser, e un'immagine piccola non viene ingrandita sfocata. */
        .bs-fonte img { display:block; width:auto; height:auto; max-width:min(15cm, 100%); margin:0 auto; border-radius:8px; }
        .bs-fonte figcaption { margin-top:8px; font-size:calc(9px * var(--ap-txt-k)); color:#64748b; line-height:1.5; }
        .bs-citations { margin-top:20px; padding-top:14px; border-top:1px solid #e2e8f0; }
        .bs-citations-title { font-size:calc(9px * var(--ap-txt-k)); font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; margin-bottom:10px; }
        .bs-cite-row { display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #f1f5f9; }
        .bs-cite-num { font-size:calc(10px * var(--ap-txt-k)); font-weight:bold; color:${accentColor}; flex-shrink:0; }
        .bs-cite-text { font-size:calc(10px * var(--ap-txt-k)); color:#64748b; line-height:1.6; }
        .bs-cite-text strong { color:#475569; }
        .bs-footer { text-align:center; margin-top:24px; font-size:calc(9px * var(--ap-txt-k)); color:#94a3b8; }
        /* Lettore audio autonomo (TTS del browser) — accessibilità BES/DSA.
           Tutta la testata cresce con "--ap-ui-k", GEOMETRIA COMPRESA: scalare
           i soli corpi lascerebbe un testo da 19px dentro una pillola alta 34,
           cioè un chip che trabocca. */
        #ap-bar { display:flex; align-items:center; gap:10px; flex:1 1 auto; min-width:0; margin:0 16px; }
        .ap-chip { display:inline-flex; height:calc(34px * var(--ap-ui-k)); border-radius:9999px; background:#fff; border:1px solid #e2e8f0; overflow:hidden; flex:0 0 auto; }
        .ap-seg { display:inline-flex; align-items:center; justify-content:center; min-width:calc(40px * var(--ap-ui-k)); padding:0 calc(11px * var(--ap-ui-k)); border:0; background:transparent; color:${accentColor}; cursor:pointer; font:700 calc(12px * var(--ap-ui-k))/1 var(--doc-font, 'Space Mono', monospace); border-left:1px solid #eef2ff; }
        .ap-seg:first-child { border-left:0; }
        .ap-seg:hover { background:#eef2ff; }
        .ap-play.on { background:${accentColor}; color:#fff; }
        .ap-prog { position:relative; flex:1 1 120px; min-width:70px; height:calc(7px * var(--ap-ui-k)); border-radius:9999px; background:#e2e8f0; cursor:pointer; touch-action:none; }
        .ap-fill { position:absolute; left:0; top:0; height:100%; width:0; border-radius:9999px; background:${accentColor}; pointer-events:none; }
        .ap-thumb { position:absolute; top:50%; left:0; width:calc(13px * var(--ap-ui-k)); height:calc(13px * var(--ap-ui-k)); border-radius:50%; background:${accentColor}; transform:translate(-50%,-50%); box-shadow:0 1px 3px rgba(15,23,42,.35); pointer-events:none; }
        .ap-time { font:700 calc(11px * var(--ap-ui-k))/1 var(--doc-font, 'Space Mono', monospace); color:#64748b; min-width:calc(32px * var(--ap-ui-k)); text-align:right; }
        /* Il ▶ «ascolta da qui» vive DENTRO il testo, non nella testata: segue la
           taglia del corpo, o resterebbe un bottone piccolo in mezzo a righe grandi. */
        .ap-sec { display:inline-flex; align-items:center; justify-content:center; width:calc(20px * var(--ap-txt-k)); height:calc(20px * var(--ap-txt-k)); margin-right:7px; padding:0; border:0; border-radius:9999px; background:#eef2ff; color:${accentColor}; cursor:pointer; vertical-align:middle; font:700 calc(11px * var(--ap-txt-k))/1 var(--doc-font, 'Space Mono', monospace); }
        .bs-body-block { background:rgba(253,230,138,.35); border-radius:5px; box-shadow:0 0 0 3px rgba(253,230,138,.35); }
        ::highlight(ap-read) { background-color:#fde68a; color:#0f172a; }
        /* Modalità dislessia (attivabile nel documento). Il comando Aa è un ciclo
           a tre stati — spento → 1,5× → 2× → spento — e i due fattori sono le
           STESSE scale dell'accessibilità già in vigore nell'app
           (body.a11y-zoom-x15 / body.a11y-zoom-x2, public/css/style.css:134-140):
           una terza convenzione qui vorrebbe dire due tarature da tenere allineate.
           Il fattore vive in --ap-scala, così un numero solo governa tutti i corpi
           invece di doverli riscrivere uno per uno. */
        /* ⚠️ NIENTE FONDO CREMA (decisione di Giacomo, 10/8/26). La veste ad alta
           leggibilità cambiava anche il colore della carta — pagina #f6efdd e
           riquadro #fffdf6 — per attenuare l'abbagliamento. Ora resta ciò che
           riguarda il TESTO (carattere, corpo, interlinea, spaziatura fra le
           lettere e fra le parole): il fondo non cambia mai, né a schermo né in
           stampa. Con esso è caduta anche la regola che lo azzerava per la
           stampa, che senza il crema non aveva più niente da azzerare. */
        body.ap-dys { --ap-scala:1; }
        body.ap-dys.ap-x15 { --ap-scala:1.5; }
        body.ap-dys.ap-x2 { --ap-scala:2; }
        body.ap-dys .bs-body { max-width:none; }
        body.ap-dys .bs-body p, body.ap-dys .bs-body li { font-family:Verdana,'Trebuchet MS',sans-serif; font-size:calc(15px * var(--ap-scala)); line-height:2.05; letter-spacing:.03em; word-spacing:.14em; color:#33312e; text-align:left; margin-bottom:calc(14px * var(--ap-scala)); }
        body.ap-dys .bs-body h3 { font-family:Verdana,sans-serif; font-size:calc(19px * var(--ap-scala)); }
        body.ap-dys .bs-body h4 { font-family:Verdana,sans-serif; font-size:calc(15px * var(--ap-scala)); }
        /* Il ▶ «ascolta da qui» cresce col testo: a 2× un bersaglio fermo a 20px
           resterebbe sotto i 24 di WCAG proprio per chi ha ingrandito. */
        body.ap-dys .bs-body .ap-sec { width:calc(20px * var(--ap-scala)); height:calc(20px * var(--ap-scala)); font-size:calc(11px * var(--ap-scala)); }
        /* Comandi della testata (Aa · Evidenzia). Lo stile sta QUI e non in un
           attributo style=: lo stile inline batte qualunque regola del foglio
           che non porti !important, quindi lo stato acceso non si vedeva — la
           classe .on la metteva il JS e il fondo restava bianco. Misurato:
           #ap-dys-btn.on → rgb(255,255,255). Spostandolo in una classe, la
           regola con l'id vince per cascata, senza !important. */
        /* RIGA DI LETTURA — lo stesso strumento compensativo dell'app
           (#reading-ruler, public/css/style.css:940): un velo scuro su tutta la
           pagina con una finestra trasparente che segue il puntatore, così
           l'occhio non perde il rigo. Qui vive DENTRO il documento e non
           nell'app, perché il caso che conta è lo studente che apre il file da
           solo — dove l'app non c'è.
           ⚠️ L'altezza è in EM del corpo del testo, non in pixel: con «Aa» a 2×
           le righe sono alte il doppio, e una finestra fissa in pixel ne
           inquadrerebbe metà. Così la finestra contiene sempre lo stesso NUMERO
           di righe, che è ciò che serve a chi legge.
           "pointer-events:none" perché il velo non deve intercettare i clic:
           sotto ci sono i comandi «ascolta da qui». */
        #ap-riga { display:none; position:fixed; inset:0; pointer-events:none; z-index:99999;
            --ap-riga-y:50vh; --ap-riga-h:2.5em; font-size:calc(11px * var(--ap-txt-k)); line-height:1.7;
            background:linear-gradient(
                rgba(0,0,0,.85) 0%, rgba(0,0,0,.85) calc(var(--ap-riga-y) - var(--ap-riga-h)),
                transparent        calc(var(--ap-riga-y) - var(--ap-riga-h)),
                transparent        calc(var(--ap-riga-y) + var(--ap-riga-h)),
                rgba(0,0,0,.85)    calc(var(--ap-riga-y) + var(--ap-riga-h)), rgba(0,0,0,.85) 100%); }
        #ap-riga.on { display:block; }
        /* Col velo acceso la testata resta LEGGIBILE e cliccabile: è da lì che
           si spegne, e un comando sepolto sotto il velo sarebbe una trappola. */
        body.ap-riga-on #ap-topbar { z-index:100000; }
        .ap-hdr-btn { background:#fff; color:${accentColor}; border:1px solid #e2e8f0; border-radius:8px; padding:calc(6px * var(--ap-ui-k)) calc(12px * var(--ap-ui-k)); cursor:pointer; font-size:calc(11px * var(--ap-ui-k)); font-weight:bold; }
        /* Stato acceso: una regola sola per i due, o il secondo comando direbbe
           «acceso» in un modo diverso dal primo. */
        #ap-dys-btn.on, #ap-hl-btn.on { background:${accentColor}; color:#fff; border-color:${accentColor}; }
        /* «Stampa / PDF»: aveva TUTTO il suo stile in un attributo style=, quindi
           era l'unico comando che nessuna regola poteva più governare — né il
           carattere né la taglia. Ora è una classe come gli altri due. */
        .ap-print-btn { background:${accentColor}; color:#fff; border:none; border-radius:8px; padding:calc(6px * var(--ap-ui-k)) calc(16px * var(--ap-ui-k)); cursor:pointer; font-size:calc(11px * var(--ap-ui-k)); font-weight:bold; }
        /* ⚠️ IL CARATTERE DELLA TESTATA. Un <button> NON eredita il font dal suo
           contenitore: senza dichiararlo prende quello di sistema. La testata
           mostrava quindi tre caratteri diversi — il marchio in "monospace"
           generico (dichiarato in uno style= inline sul contenitore), i tre
           bottoni nel font di sistema, e le sole pillole del lettore in Space
           Mono, che è l'unica che se lo dichiarava. Una riga sola, su tutto ciò
           che la testata contiene. */
        #ap-topbar, #ap-topbar button, #ap-topbar input, #ap-topbar select { font-family:var(--doc-font, 'Space Mono', monospace); }
        /* La testata è fissata in cima e non occupa spazio nel flusso: sotto le
           serve un distanziatore, o il primo riquadro le finisce dietro. La sua
           altezza NON è un numero scritto a mano (cambiava con la taglia del
           testo e restava indietro): il valore qui è solo il ripiego con cui la
           pagina nasce, e allo "load" lo script lo sostituisce con l'altezza
           MISURATA, riaggiornandola a ogni cambio di larghezza. */
        /* ⚠️ La regola porta l'ID e non la classe, e non è pignoleria: la testata
           è anche .no-print, e ".no-print { display:block }" qui sotto ha la
           STESSA specificità di una classe — essendo scritta dopo vinceva, la
           testata tornava un blocco e i suoi tre pezzi si impilavano su tre
           righe alte 153px invece di 76 (misurato). Un id batte una classe per
           costruzione, quindi la regola non si rompe se il foglio si riordina. */
        #ap-topbar { position:fixed; top:0; left:0; right:0; background:#fff; border-bottom:1px solid #e2e8f0; padding:10px 24px; display:flex; align-items:center; justify-content:space-between; z-index:100; font-size:calc(12px * var(--ap-ui-k)); gap:10px; }
        #ap-spacer { height:var(--ap-hdr-h, calc(52px * var(--ap-ui-k))); }
        /* I tre comandi. Lo stile stava in un attributo style= col suo
           "flex:0 0 auto": il contenitore non si stringeva mai, quindi il wrap
           dichiarato più sotto non poteva scattare — i bottoni restavano in fila
           e uscivano dallo schermo. Uno stile inline batte qualunque regola del
           foglio che non porti !important: va tolto, non aggirato. */
        .ap-cmd { display:flex; gap:8px; flex:0 0 auto; }
        .no-print { display:block; }
        /* ORDINE DI CEDIMENTO DELLA TESTATA — soglie RIMISURATE dopo l'aumento
           del 60% (10/8/26), perché le vecchie (880 e 700) erano tarate sui
           corpi piccoli e col testo grande il bottone «Stampa / PDF» finiva
           FUORI dallo schermo: 41px oltre il bordo a 900px, 259px a 390px.
           ⚠️ Non si vedeva controllando lo sbordo della pagina: la testata è
           "position:fixed" e ciò che le trabocca non entra nello scrollWidth del
           documento. Il traboccamento va cercato DENTRO di lei.
           ⚠️ RIMISURATE UNA SECONDA VOLTA dopo l'aggiunta del comando «Riga»:
           un bottone in più sposta tutte e due le soglie, e con quelle vecchie
           «Stampa / PDF» tornava fuori dallo schermo a 1024, 941 e 661px. Chi
           aggiunge un comando alla testata deve rifare questa misura — non c'è
           modo di dedurla, perché dipende dalla lunghezza delle etichette.
           Le larghezze necessarie, misurate una per una:
             · con tutto ................ 1060px  (erano 926 con tre comandi)
             · senza il marchio .........  768px  (erano 634)
             · togliendo anche barra e tempo ... 634px — cioè NIENTE:
               la barra di avanzamento ha "flex:1 1 120px" e si comprimeva già
               da sola, quindi quella seconda soglia non guadagnava un pixel.
               Era una regola che sembrava governare qualcosa e non governava.
           Quindi si cede in due tempi, e nessun comando sparisce mai — chip, Aa,
           Evidenzia e Stampa sono ciò per cui il documento è stato consegnato:
             1. sotto 1080 va via il MARCHIO (il titolo è ripetuto due
                centimetri più sotto, nella testata del documento);
             2. sotto 790 la testata VA A CAPO. I comandi salgono, il lettore
                scende a tutta larghezza. La barra diventa più alta, e il
                distanziatore la segue perché è misurato e non scritto a mano. */
        @media (max-width: 1080px) { #ap-doc-brand { display:none; } }
        @media (max-width: 790px) {
            #ap-topbar { flex-wrap:wrap; row-gap:8px; }
            #ap-bar { order:3; flex:1 0 100%; margin:0; }
            .ap-cmd { flex:1 1 auto; flex-wrap:wrap; justify-content:flex-end; }
        }
        /* Ultimo gradino, per il telefono. Sulla riga singola nascondere la barra
           di avanzamento non guadagnava niente (si comprimeva da sola); sulla
           riga tutta sua invece sì, perché lì pretende i suoi 70px di minimo e
           insieme al chip supera la larghezza di uno schermo stretto. Restano il
           chip — cioè play, indietro, avanti, velocità — e il tempo trascorso:
           si ascolta e si sa a che punto si è, non si trascina. */
        @media (max-width: 460px) { .ap-prog { display:none; } }
        @media print {
            /* Margini di pagina: stessa convenzione del dossier
               (mappai-print-dossier.js:1960) — 18mm sopra, 15 ai lati, 22 sotto.
               Senza @page, dalla pagina 2 in poi il testo cominciava e finiva sul
               bordo del foglio: il padding di .bs-body vale per il BOX, non per
               ogni pagina. Il PDF nasce da window.print(), quindi chi sceglie
               «margini minimi» nella finestra di stampa può ancora scavalcarlo —
               qui l'app dichiara i SUOI margini, come fanno dossier e flashcard. */
            /* Il PIÈ (marchio a sinistra, «pagina X di Y» a destra) vive nei
               margin-box di questo @page: è l'unico posto da cui un contatore di
               pagine si può scrivere — counter(page) in un elemento del
               documento vale 0 (misurato). Il margine sotto è già 25mm e la
               banda del piè ci sta.
               (Niente apici inversi qui dentro: siamo in un template literal.) */
            @page { size: A4 portrait; margin: 20mm 20mm 25mm 20mm;
${_bsPie(data.mapName)}
            }
            /* ⚠️ IN STAMPA I CORPI SI DICHIARANO IN PUNTI (Giacomo, 10/8/26).
               A schermo il testo vive in px scalati da --ap-txt-k, e finiva sulla
               carta per conversione: 11px × 1,6 = 17,6px = 13,2pt — vicino ai 13
               chiesti, ma per caso, e destinato a spostarsi al primo ritocco
               della leva dello schermo. Sulla carta il punto è l'unità: 13pt
               vogliono dire 13pt su qualunque schermo li abbia composti.
               Un token solo governa tutta la scala; i moltiplicatori sono i
               rapporti storici fra i corpi (14/11 per h3, 12/11 per h4, 20/11
               per il titolo…), quindi le proporzioni restano quelle di prima. */
            :root { --ap-pt: 13pt; }
            /* ⚠️ I RIQUADRI PERDONO IL LORO IMBOTTITURA IN STAMPA, o i margini
               chiesti non sono quelli che si misurano sul foglio. Il margine di
               @page stacca il RIQUADRO dal bordo; dentro, ".bs-body" aggiungeva
               24px sopra e 28px ai lati — 6,3 e 7,4 mm — che si sommano.
               Misurato sul PDF prima della correzione: 27,5mm a sinistra e
               28,4 a destra dove ne erano stati chiesti 20. A schermo quel
               respiro serve (il riquadro è una scheda bianca sullo sfondo); sulla
               carta il riquadro non si vede, e la sua imbottitura è solo margine
               che nessuno ha chiesto. */
            .bs-body { padding: 0; border-radius: 0; }
            .mm-dh { padding: 0 0 10px; border-radius: 0; margin-bottom: 18px; }
            body { font-size: var(--ap-pt); }
            .bs-body p, .bs-body li { font-size: var(--ap-pt); }
            .bs-body h3 { font-size: calc(var(--ap-pt) * 1.273); }
            .bs-body h4 { font-size: calc(var(--ap-pt) * 1.091); }
            .mm-dh__t { font-size: calc(var(--ap-pt) * 1.818); }
            .mm-dh__s, .mm-dh__c, .mm-dh__b { font-size: calc(var(--ap-pt) * 0.909); }
            .bs-cite-num, .bs-cite-text { font-size: calc(var(--ap-pt) * 0.909); }
            .bs-citations-title, .bs-footer { font-size: calc(var(--ap-pt) * 0.818); }
            .bs-fonte figcaption { font-size: calc(var(--ap-pt) * 0.818); }
            /* ⚠️ TESTATA E IMMAGINE SULLO STESSO FOGLIO (21/8/26). L'area
               stampabile di un A4 con questi margini è alta 252mm: la testata a
               taglia piena ne prendeva 32,7 e la figura 228,1 — 260,8 in tutto,
               cioè 9mm di troppo, e l'immagine scivolava a pagina 2 lasciando
               la prima quasi vuota. Due leve, non una:
                 · la testata si stringe (titolo da 1,818 a 1,4 del corpo,
                   sottotitolo e pillole a 0,77, meno respiro sotto);
                 · l'immagine dichiara un TETTO DI ALTEZZA, o un ritratto molto
                   stretto tornerebbe a sfondare anche con la testata piccola —
                   i 15cm di larghezza non dicono nulla sull'altezza.
               Vale SOLO dove la figura c'e' (body:has(.bs-fonte)): le sintesi
               senza fonte iconografica tengono la testata di sempre. */
            body:has(.bs-fonte) .mm-dh { padding:0 0 6px; margin-bottom:10px; break-after:avoid; page-break-after:avoid; }
            body:has(.bs-fonte) .mm-dh__t { font-size: calc(var(--ap-pt) * 1.4); }
            body:has(.bs-fonte) .mm-dh__s,
            body:has(.bs-fonte) .mm-dh__c,
            body:has(.bs-fonte) .mm-dh__b { font-size: calc(var(--ap-pt) * 0.77); }
            .bs-fonte { margin-bottom:16px; }
            .bs-fonte img { max-height: 200mm; }
            /* La veste ad alta leggibilità resta proporzionale al corpo di
               stampa, non ai px dello schermo: 1,5× e 2× di TREDICI punti. */
            body.ap-dys .bs-body p, body.ap-dys .bs-body li { font-size: calc(var(--ap-pt) * 1.364 * var(--ap-scala)); }
            body.ap-dys .bs-body h3 { font-size: calc(var(--ap-pt) * 1.727 * var(--ap-scala)); }
            body.ap-dys .bs-body h4 { font-size: calc(var(--ap-pt) * 1.364 * var(--ap-scala)); }
            .no-print { display:none !important; }
            /* Il padding del body va a ZERO: a schermo stacca il foglio dallo
               sfondo, in stampa si sommerebbe al margine di @page restringendo la
               colonna (i 10px di prima valevano 2,65mm — MENO aria dello schermo).
               E il "max-width" sparisce: a decidere la colonna in stampa è @page,
               non una misura pensata per lo schermo — a 2× i 72ch valgono più
               della pagina e il testo si stringerebbe in una colonna centrale con
               due bande bianche ai lati. */
            body { background:white; padding:0; max-width:none; }
            /* ⚠️ Qui c'era una regola che riportava a bianco il fondo crema della
               veste ad alta leggibilità: serviva perché "body.ap-dys" porta una
               classe e batteva il "body{background:white}" qui sopra, che è una
               regola di elemento — chi stampava con quella veste accesa si
               portava a casa ogni pagina campita di crema. Tolto il crema del
               tutto (vedi la sezione della modalità dislessia), la regola non
               aveva più niente da azzerare ed è stata rimossa: una regola che
               sembra governare qualcosa e non governa è peggio della sua assenza.
               ⚠️ I documenti GIÀ scritti sul disco hanno ancora il crema, e da
               questa parte non si raggiungono: si aggiornano risalvandoli. */
            /* Un titolo non resta solo in fondo a una pagina, e un paragrafo non
               lascia una riga orfana di là dalla piega. */
            .bs-body h3, .bs-body h4 { break-after:avoid; page-break-after:avoid; break-inside:avoid; page-break-inside:avoid; }
            .bs-body p, .bs-body li { orphans:3; widows:3; }
            .bs-cite-row { break-inside:avoid; page-break-inside:avoid; }
            .bs-citations-title { break-after:avoid; page-break-after:avoid; }
        }
    </style>
</head>
<body>
    <div id="ap-topbar" class="no-print">
        <span id="ap-doc-brand" style="font-weight:bold;color:${accentColor};white-space:nowrap;">MappAI · ${_escBS(kindLabel)}</span>
        <div id="ap-bar"></div>
        <div class="ap-cmd">
            <button id="ap-dys-btn" type="button" class="ap-hdr-btn" title="${_escBS(dysTip)}">${_escBS(dysLabels[0])}</button>
            <button id="ap-hl-btn" type="button" class="ap-hdr-btn on" aria-pressed="true" title="${_escBS(hlTip)}">${_escBS(hlLabels[1])}</button>
            <button id="ap-riga-btn" type="button" class="ap-hdr-btn" aria-pressed="false" title="${_escBS(rigaTip)}">${_escBS(rigaLabels[0])}</button>
            <button type="button" class="ap-print-btn" onclick="window.print()">🖶 Stampa / PDF</button>
        </div>
    </div>
    <div id="ap-spacer" class="no-print"></div>
    <div id="ap-riga" class="no-print" aria-hidden="true"></div>

    ${_bsTestata(data, kindLabel, now)}
    <div class="bs-body">${audioTag}${cuesTag}${fotoHtml}${contentHtml}</div>
    <div class="bs-footer no-print">MappAI by insegnai.ch · ${now}</div>
    <script>
    (function(){
      var SPEEDS=[0.75,1,1.25,1.5], ri=1, BACK=10, FWD=5, CPS=14.5;
      /* Il distanziatore sotto la testata prende l'altezza MISURATA della
         testata, non un numero scritto a mano. Vale il primo dei quattro
         difetti che la taglia più grande avrebbe scoperto: la testata è fissa
         e non occupa spazio, quindi un 52px fermo lasciava il primo riquadro
         dietro la barra appena i comandi andavano a capo o crescevano.
         Sta PRIMA di ogni guardia: il documento senza lettore ha comunque una
         testata, e comunque le sta sotto. Il ripiego CSS regge il tempo che
         passa fra il primo disegno e questa riga. */
      (function(){
        var tb=document.getElementById('ap-topbar');
        if(!tb) return;
        var misura=function(){
          var h=Math.ceil(tb.getBoundingClientRect().height);
          if(h>0) document.documentElement.style.setProperty('--ap-hdr-h', h+'px');
        };
        misura();
        // I caratteri web arrivano dopo il primo disegno e cambiano l'altezza.
        if(document.fonts&&document.fonts.ready) document.fonts.ready.then(misura).catch(function(){});
        // Ridimensionando, i comandi possono andare a capo: l'altezza cambia.
        if(window.ResizeObserver){ try{ new ResizeObserver(misura).observe(tb); }catch(e){} }
        window.addEventListener('resize', misura);
        window.addEventListener('load', misura);
      })();
      /* RIGA DI LETTURA. Sta PRIMA delle guardie del lettore: è uno strumento
         di lettura, non di ascolto, e un documento senza voce ne ha bisogno
         quanto gli altri.
         Le tre altezze sono in EM (mezza finestra): 1.25em ≈ due righe e mezza,
         2.5em ≈ cinque, 4em ≈ otto. Crescono da sole con «Aa», perché l'unità è
         il corpo del testo. */
      (function(){
        var velo=document.getElementById('ap-riga');
        var btn=document.getElementById('ap-riga-btn');
        if(!velo||!btn) return;
        var ETI=${rigaLabelsJson}, ALT=['','1.25em','2.5em','4em'], passo=0;
        function segui(y){ velo.style.setProperty('--ap-riga-y', y+'px'); }
        function muovi(ev){
          var y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY;
          if(typeof y==='number') segui(y);
        }
        btn.addEventListener('click',function(){
          passo=(passo+1)%4;
          var acceso=passo>0;
          velo.classList.toggle('on',acceso);
          document.body.classList.toggle('ap-riga-on',acceso);
          btn.classList.toggle('on',acceso);
          btn.setAttribute('aria-pressed',acceso?'true':'false');
          btn.textContent=ETI[passo];
          if(acceso){
            velo.style.setProperty('--ap-riga-h',ALT[passo]);
            /* La posizione di partenza è METÀ SCHERMO, e la dichiara il CSS
               ("--ap-riga-y:50vh"): calcolarla qui da window.innerHeight vuol
               dire scrivere "0px" ogni volta che quel numero non è ancora noto —
               e una finestra a y=0 si legge come «non si è acceso niente».
               Il primo movimento del puntatore la sposta dove serve. */
            document.addEventListener('mousemove',muovi);
            document.addEventListener('touchmove',muovi,{passive:true});
          } else {
            document.removeEventListener('mousemove',muovi);
            document.removeEventListener('touchmove',muovi);
          }
        });
      })();
      var sup=('speechSynthesis' in window)&&('SpeechSynthesisUtterance' in window);
      var body=document.querySelector('.bs-body');
      var bar=document.getElementById('ap-bar');
      var dysBtn=document.getElementById('ap-dys-btn');
      var hlBtn=document.getElementById('ap-hl-btn');
      // Aa: ciclo a tre stati — spento → dislessia 1,5× → dislessia 2× → spento.
      // Le due scale sono quelle dell'accessibilità dell'app (vedi il foglio sopra).
      var DYS=${dysLabelsJson}, dysStep=0;
      var HLB=${hlLabelsJson};
      if(dysBtn){ dysBtn.addEventListener('click',function(){
        dysStep=(dysStep+1)%3; var cl=document.body.classList;
        cl.toggle('ap-dys',dysStep>0); cl.toggle('ap-x15',dysStep===1); cl.toggle('ap-x2',dysStep===2);
        dysBtn.classList.toggle('on',dysStep>0); dysBtn.textContent=DYS[dysStep];
      }); }
      // Il chip serve anche SENZA speechSynthesis quando il file porta la voce
      // naturale incorporata: su un tablet senza Web Speech l'MP3 c'è ed è proprio
      // il motivo per cui quel file è stato consegnato. Prima bastava l'assenza di
      // speechSynthesis a farlo sparire, audio o no.
      var hasAudio=!!document.getElementById('ap-audio');
      // Niente lettura possibile → via anche il comando dell'evidenziazione:
      // accenderebbe qualcosa che non può accadere. Aa resta, che di lettura
      // non ha bisogno.
      if((!sup&&!hasAudio)||!body||!bar){ if(bar) bar.style.display='none'; if(hlBtn) hlBtn.style.display='none'; return; }
      var lang=((document.documentElement.lang||'it').toLowerCase().indexOf('en')===0)?'en-US':'it-IT';
      var hlOK=false, HL=null, hlOn=true;   // karaoke acceso all'apertura (comportamento storico)
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
          if(bl.closest&&(bl.closest('.bs-citations')||bl.closest('[data-ap-skip]'))) continue;
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
      // Con l'evidenziazione spenta si spegne anche lo SCORRIMENTO che la segue:
      // è la stessa funzione — «seguire la lettura» — e una pagina che si muove
      // da sola senza che si veda perché è peggio di una pagina ferma.
      function hl(i){ clearHL(); if(!hlOn) return; var c=chunks[i]; if(!c) return; if(c.src&&c.src.classList){ c.src.classList.add('bs-body-block'); blockEl=c.src; } if(hlOK&&c.r){ try{ var r=document.createRange(); r.setStart(c.r.sN,c.r.sO); r.setEnd(c.r.eN,c.r.eO); HL.add(r); }catch(e){} } try{ if(c.src&&c.src.scrollIntoView) c.src.scrollIntoView({block:'nearest'}); }catch(e){} }
      function reading(){ return audioMode?(audioEl&&!audioEl.paused):playing; }
      // Girare l'interruttore mentre il documento legge deve avere effetto SUBITO:
      // accendendo si riprende dalla frase in corso, spegnendo si pulisce. Fermi,
      // non si evidenzia niente: non c'è nessuna «frase in corso» da marcare.
      function refreshHL(){
        if(!hlOn||!reading()){ clearHL(); return; }
        if(audioMode){ if(cuesData&&cuesData.length) hlByCues(CUR()); else hl(idxAtReal(CUR())); return; }
        hl(idx);
      }
      var bBack,bPlay,bFwd,bRate,fill,thumb,time,prog;
      function paint(p){ if(bPlay){ bPlay.textContent=p?'\\u23F8':'\\u25B6'; bPlay.classList.toggle('on',!!p); } }
      function fmt(s){ s=Math.max(0,Math.round(s)); var m=Math.floor(s/60),x=s%60; return m+':'+(x<10?'0':'')+x; }
      function render(rt){ rt=Math.max(0,Math.min(1,rt||0)); if(fill) fill.style.width=(rt*100)+'%'; if(thumb) thumb.style.left=(rt*100)+'%'; if(time) time.textContent=fmt(rt*TOT()); }
      function startTick(){ stopTick(); ticker=setInterval(function(){ if(!drag) render(total?gtimeSpeech()/total:0); },100); }
      function stopTick(){ if(ticker){ clearInterval(ticker); ticker=null; } }
      // ── Ripiego alla voce di sistema ────────────────────────────────────
      // Con l'audio FRATELLO (src relativo) il riferimento può non risolversi:
      // in un iframe srcdoc non esiste un URL su cui risolvere il relativo, e
      // un file inoltrato da solo (posta, WhatsApp) arriva senza l'audio
      // accanto. Restare con un chip che non suona è peggio del silenzio →
      // si torna alla voce del browser e si ricostruisce lo stato del lettore.
      var fellBack=false;
      function fallbackToSpeech(){
        if(fellBack||!audioMode) return;
        fellBack=true; audioMode=false;
        try{ audioEl.pause(); }catch(e){}
        if(gap) clearTimeout(gap); stopTick(); clearHL();
        playing=false; idx=0; subChar=0;
        // Senza speechSynthesis non resta niente da comandare: il chip sparisce
        // invece di restare lì a fingere.
        if(!sup){ if(bar) bar.style.display='none'; if(hlBtn) hlBtn.style.display='none'; return; }
        // In audioMode la velocità cambiava solo playbackRate: i tempi della
        // voce di sistema vanno ricalcolati sul gradino scelto, o la barra di
        // avanzamento ripartirebbe con la durata sbagliata.
        ensure(); timing(); paint(false); render(0);
      }
      // L'errore può essere già scattato prima che lo script arrivi qui:
      // preload="auto" comincia a scaricare col parse del tag.
      function audioBroken(){ try{ return !!audioEl.error||audioEl.networkState===3; }catch(e){ return false; } }
      function playAudio(retry){
        var f=function(err){
          // Un rifiuto per POLITICA di riproduzione (NotAllowedError) non dice
          // che l'audio manca, solo che il browser non l'ha fatto partire ora:
          // ripiegare lì spegnerebbe la voce naturale per un motivo che non
          // c'entra. Si ripiega quando la sorgente è davvero rotta.
          if(err&&err.name==='NotAllowedError'&&!audioBroken()){ paint(false); return; }
          var was=audioMode; fallbackToSpeech(); if(was&&sup&&retry) retry();
        };
        try{ var pr=audioEl.play(); if(pr&&pr['catch']) pr['catch'](f); }catch(e){ f(e); }
      }
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
      // clearHL mancava: in pausa l'evidenziazione restava accesa e congelata
      // sull'ultima frase, come se il documento stesse ancora leggendo lì.
      function pause(){ if(gap) clearTimeout(gap); stopTick(); try{ speechSynthesis.cancel(); }catch(e){} playing=false; subChar=0; clearHL(); paint(false); }
      function ensure(){ if(!chunks.length){ build(); timing(); } }
      function seekTspeech(t){ ensure(); t=Math.max(0,Math.min(t,Math.max(0,total-0.05))); var i=idxAt(t); var f=(dur[i]>0)?(t-(starts[i]||0))/dur[i]:0; playFrom(i,Math.floor(f*(chunks[i]?chunks[i].text.length:0))); }
      // ── Transport unificato: audio incorporato o Web Speech ──
      // Il riascolto passa da playAudio: se l'audio fratello non c'è, il ripiego
      // scatta E la lettura parte lo stesso (il clic non deve andare a vuoto).
      function doToggle(){ if(audioMode){ if(audioEl.paused) playAudio(doToggle); else audioEl.pause(); return; } ensure(); if(playing){ pause(); return; } if(idx>=chunks.length) idx=0; playFrom(idx,subChar); }
      function doSeekRel(d){ if(audioMode){ audioEl.currentTime=Math.max(0,Math.min((audioEl.currentTime||0)+d,Math.max(0,TOT()-0.1))); return; } ensure(); seekTspeech(gtimeSpeech()+d); }
      function doSeekRatio(rt){ if(audioMode){ audioEl.currentTime=Math.max(0,Math.min(rt*TOT(),Math.max(0,TOT()-0.05))); return; } ensure(); seekTspeech(rt*total); }
      function doRate(){ ri=(ri+1)%SPEEDS.length; bRate.textContent='\\u00d7'+SPEEDS[ri]; if(audioMode){ audioEl.playbackRate=rate(); return; } if(chunks.length){ var t=gtimeSpeech(); timing(); if(playing) seekTspeech(t); else render(total?t/total:0); } }
      function doPlayNode(node){ ensure(); var i=-1; for(var j=0;j<chunks.length;j++){ if(chunks[j].src===node){ i=j; break; } } if(i<0){ for(var q=0;q<chunks.length;q++){ try{ if(node.compareDocumentPosition(chunks[q].src)&Node.DOCUMENT_POSITION_FOLLOWING){ i=q; break; } }catch(e){} } } i=Math.max(0,i); if(audioMode){ var bi=(chunks[i]&&typeof chunks[i].bi==='number')?chunks[i].bi:0; try{ audioEl.currentTime=(cuesData&&cuesData[bi]!=null)?cuesData[bi]:((total?(starts[i]/total):0)*TOT()); }catch(e){} hl(i); playAudio(function(){ doPlayNode(node); }); return; } playFrom(i,0); }
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
        // Il fallimento arriva sul <source> (candidato scartato) o sull'elemento
        // (candidati esauriti), secondo il browser: si ascoltano entrambi.
        audioEl.addEventListener('error',fallbackToSpeech);
        var srcEl=audioEl.querySelector('source'); if(srcEl) srcEl.addEventListener('error',fallbackToSpeech);
        audioEl.addEventListener('play',function(){ paint(true); refreshHL(); });
        // Anche qui mancava clearHL: in pausa l'evidenziazione restava accesa.
        audioEl.addEventListener('pause',function(){ paint(false); clearHL(); });
        audioEl.addEventListener('ended',function(){ paint(false); clearHL(); render(1); });
        audioEl.addEventListener('timeupdate',function(){ if(drag) return; var tot=TOT(); render(tot?CUR()/tot:0); if(!hlOn) return; if(cuesData&&cuesData.length) hlByCues(CUR()); else hl(idxAtReal(CUR())); });
        audioEl.addEventListener('loadedmetadata',function(){ render(0); });
        if(audioBroken()) fallbackToSpeech();   // errore già scattato prima di noi
      }
      if(hlBtn){ hlBtn.addEventListener('click',function(){
        hlOn=!hlOn;
        hlBtn.classList.toggle('on',hlOn);
        hlBtn.textContent=HLB[hlOn?1:0];
        hlBtn.setAttribute('aria-pressed',hlOn?'true':'false');
        refreshHL();
      }); }
      (function(){ var hs=body.querySelectorAll('h3,h4'); for(var i=0;i<hs.length;i++){ (function(h){ if(h.querySelector('.ap-sec')) return; var b=document.createElement('button'); b.type='button'; b.className='ap-sec'; b.setAttribute('data-ap-skip',''); b.title='Ascolta da qui'; b.textContent='\\u25B6'; b.addEventListener('click',function(e){ e.stopPropagation(); doPlayNode(h); }); h.insertBefore(b,h.firstChild); })(hs[i]); } })();
      try{ document.addEventListener('visibilitychange',function(){ if(document.hidden && !audioMode) pause(); }); }catch(e){}
    })();
    <\/script>
</body>
</html>`;
    }

    // ── Stampa ─────────────────────────────────────────────────────────────
    /* Dal modale di risultato all'EDITOR, che è dove si salva e si pubblica.
       ⚠️ L'editor si disegna SOLO dentro `#elab-doc-host`, che monta la console
       ELABORA quando è in modalità documento: chiamando `openSynthesis` con la
       console chiusa il documento si caricherebbe e non si vedrebbe (è il
       difetto già pagato il 13/8 coi quiz). Quindi la casa si apre PRIMA — la
       stessa mossa di `_casaDocumenti` in `mappai-crea-quiz.js`; l'annuncio
       `mappai-doc-aperto` fa il resto. */
    window.apriSintesiNellEditor = function () {
        const m = document.getElementById('branch-synthesis-modal');
        if (m) m.remove();
        const DEd = window.MappAIDocEditor;
        if (!DEd || !DEd.openSynthesis) {
            window.showToast && window.showToast(window.t('bs_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning');
            return;
        }
        try {
            const EC = window.MappAIElaboraConsole;
            if (EC && EC.attiva && EC.attiva() && EC.aperta && !EC.aperta() && EC.open) EC.open();
        } catch (e) { /* senza console si prova comunque: c'è il workspace classico */ }
        try { DEd.openSynthesis('current'); }
        catch (e) { window.showToast && window.showToast(window.t('bs_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning'); }
    };

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
        // Stessa regola dei lettori: materiale generato fuori dal parlato.
        // Se qui e nei lettori i blocchi non coincidessero, i cue finirebbero
        // sul paragrafo sbagliato.
        bodyEl.querySelectorAll('.bs-citations, [data-ap-skip], sup').forEach(n => n.remove());
        const out = [];
        bodyEl.querySelectorAll('h3,h4,p,li,blockquote').forEach(bl => {
            const txt = _cleanPlain(bl.textContent || '');
            if (txt) out.push(txt);
        });
        return out;
    }

    /* ── IL LIMITE DI CHIAMATE DEL TTS ────────────────────────────────────────
       `UC()` sono le due funzioni pure (testate): quanto manca al prossimo posto
       libero nella finestra, e quanto aspettare quando il 429 arriva comunque.
       Il tetto è configurabile perché NON è una proprietà del nostro codice ma
       del piano di chi usa l'app: chi ha un piano a pagamento non deve
       aspettare per un limite che non ha. */
    function UC() { return window.MappAIUsageCore; }
    function _ttsLimite() {
        try {
            var v = parseInt(localStorage.getItem('mappai_tts_rpm'), 10);
            if (v > 0) return v;
        } catch (e) { }
        return 10;                     /* il piano gratuito di Google, oggi */
    }
    var _ttsChiamate = [];             /* quando sono partite: la finestra scorrevole */
    /* ── I CLIP GIÀ PAGATI NON SI RIPAGANO ────────────────────────────────────
       Se la generazione si ferma a metà — rate limit ostinato, rete che cade,
       chiave scaduta — i clip fatti fino a lì restano qui: al secondo tentativo
       si riparte da dove si era arrivati invece di ricomprare tutto.
       La chiave è il TESTO del blocco + voce + modello: se il docente corregge
       una frase, quel blocco si rigenera (e solo quello); gli altri no.
       Vive quanto la sessione: è un risparmio, non un archivio. */
    var _ttsCache = Object.create(null);
    function _ttsChiave(testo, voice, model) { return model + '|' + voice + '|' + testo; }

    /* ── LA CACHE SOPRAVVIVE ALLA CHIUSURA (17/8) ────────────────────────────
       🐛 Fino a oggi i clip vivevano SOLO in memoria. Giacomo ha esaurito la
       quota giornaliera al blocco 23 di 78, ha chiuso l'app — l'unico modo di
       fermarla, allora — e i 23 blocchi già pagati sono spariti. Il giorno dopo
       si ricominciava da capo, cioè si ripagava.
       Ora ogni clip va anche su DISCO, in `userData` (scelta di Giacomo: è
       lavoro in corso, non un materiale — nel vault sarebbero ~20 MB di roba
       tecnica in mezzo ai documenti di classe, sincronizzati a ogni ritocco).
       La chiave resta la stessa — modello|voce|TESTO — quindi la ripresa è per
       BLOCCO: correggendo una frase si rigenera quella e nient'altro, e
       cambiando modello o voce si rigenera tutto, com'è giusto (clip di due
       voci diverse nello stesso audio si sentono).
       Fuori da Electron non c'è disco: resta la cache di sessione, come prima. */
    function _cacheApi() {
        var a = window.electronAPI;
        return (a && a.ttsCacheGet && a.ttsCachePut) ? a : null;
    }
    async function _cacheDaDisco(chiave) {
        var a = _cacheApi(); if (!a) return null;
        try {
            var r = await a.ttsCacheGet({ chiave: chiave });
            if (!r || !r.trovato || !r.base64) return null;
            return { bytes: _b64ToBytes(r.base64), rate: parseInt(r.rate, 10) || 24000 };
        } catch (e) { return null; }
    }
    async function _cacheSuDisco(chiave, bytes, rate) {
        var a = _cacheApi(); if (!a) return;
        try {
            await a.ttsCachePut({ chiave: chiave, rate: rate, base64: _bytesToB64(bytes) });
        } catch (e) { /* la cache è un risparmio: se non si scrive, si ripagherà */ }
    }
    /** Byte → base64 senza sfondare lo stack: `apply` su 250 KB lo fa. */
    function _bytesToB64(bytes) {
        var s = '', CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return btoa(s);
    }
    /** Quante di queste chiavi sono già pronte (per il preavviso). */
    async function _giaPronti(chiavi) {
        var a = window.electronAPI;
        if (!a || !a.ttsCacheHas) return 0;
        try {
            var r = await a.ttsCacheHas({ chiavi: chiavi });
            return (r && r.presenti) ? r.presenti.filter(Boolean).length : 0;
        } catch (e) { return 0; }
    }

    /* ── ANNULLARE UNA REGISTRAZIONE IN CORSO (17/8) ─────────────────────────
       Finora non si poteva: l'unica uscita era chiudere l'app, che è anche il
       gesto che butta via i clip già pagati (la cache vive in memoria). Il
       flag lo alza il bottone del velo; lo leggono l'attesa e il giro dei
       blocchi, che sono i due posti dove il lavoro si ferma senza lasciare
       niente a metà.
       ⚠️ Annullare NON consegna un audio parziale: una sintesi letta a metà si
       scopre solo riascoltandola. Quello che resta è la CACHE — riprovando
       nella stessa sessione si riparte da dove si era arrivati. */
    var _ttsAnnulla = false;
    function _nomeLavoroVoce() { return window.t('bs_audio_lavoro', 'Voce naturale'); }
    /** Il velo, col nome del lavoro e la via d'uscita. */
    function _veloVoce(testo) {
        if (window.showLoadingOverlay) {
            window.showLoadingOverlay(true, testo, 'default', _nomeLavoroVoce(),
                function () { _ttsAnnulla = true; });
        }
    }
    function _seAnnullato() {
        if (!_ttsAnnulla) return false;
        throw new Error(window.t('bs_audio_annullato', 'Registrazione annullata'));
    }

    function _attendi(ms, testo) {
        return new Promise(function (res) {
            var fine = Date.now() + ms;
            (function tic() {
                /* Annullare durante l'attesa deve funzionare SUBITO: è proprio
                   lì che si passa la maggior parte del tempo, ed è lì che si
                   decide di rinunciare. */
                if (_ttsAnnulla) return res();
                var manca = Math.max(0, Math.ceil((fine - Date.now()) / 1000));
                /* l'attesa si DICE, secondo per secondo: un minuto di silenzio
                   su un overlay fermo si legge come un blocco dell'app */
                _veloVoce(testo.replace('{s}', manca));
                if (manca <= 0) return res();
                setTimeout(tic, 1000);
            })();
        });
    }
    async function _ttsChiamata(payload, key, model, n, tot) {
        var prog = window.t('bs_audio_prog', 'Genero audio') + ' ' + n + '/' + tot;
        for (var tentativo = 0; tentativo < 3; tentativo++) {
            _seAnnullato();
            /* PRIMA di chiamare: c'è posto nella finestra? */
            var attesa = UC() ? UC().nextSlotMs(_ttsChiamate, Date.now(), _ttsLimite()) : 0;
            if (attesa > 0) {
                await _attendi(attesa, prog + ' — ' + window.t('bs_audio_wait', 'attendo {s}s (limite del provider)'));
                _seAnnullato();
            }
            _veloVoce(prog + '…');
            _ttsChiamate.push(Date.now());
            try {
                return await window.electronAPI.generateGemini({ apiKey: key, payload: payload, model: model });
            } catch (err) {
                /* 🐛 «Aspetta un attimo» e «per oggi hai finito» arrivano nella
                   STESSA forma (un 429 con un ritardo dichiarato), e finora si
                   obbediva a entrambi allo stesso modo. Il 17/8 questo ha fatto
                   contare a Giacomo un timer da MILLE SECONDI su una quota che
                   non si sarebbe liberata prima di domani — e alla fine il
                   codice si sarebbe arreso comunque, dopo tre tentativi.
                   Il tetto giornaliero si riconosce e si dice SUBITO: aspettare
                   è tempo buttato, e nascondere il motivo dietro un conto alla
                   rovescia fa credere che basti pazientare. */
                if (UC() && UC().limiteGiornaliero(err)) {
                    var e = new Error(window.t('bs_audio_giorno', 'Hai esaurito la quota GIORNALIERA del modello vocale. Oggi non si può registrare: riprova domani, oppure cambia modello nelle impostazioni (ogni modello ha un contatore suo).'));
                    e.quotaGiornaliera = true;
                    throw e;
                }
                var ritenta = UC() ? UC().retryDelayMs(err) : 0;
                /* non è un limite di frequenza: è un errore vero, e ritentarlo
                   tre volte non lo fa diventare buono */
                if (!ritenta || tentativo === 2) throw err;
                await _attendi(ritenta, prog + ' — ' + window.t('bs_audio_retry', 'limite raggiunto, riprendo fra {s}s'));
            }
        }
        throw new Error(window.t('bs_audio_rate', 'Il provider continua a rifiutare le richieste: riprova fra qualche minuto.'));
    }

    /** L'audio dentro una risposta Gemini, o `null` se non c'è. */
    function _inlineAudio(resp) {
        const p = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content
            && resp.candidates[0].content.parts && resp.candidates[0].content.parts[0];
        const inl = p && p.inlineData;
        return (inl && inl.data) ? inl : null;
    }

    /* Il modello a cui chiedere quando il primo non produce audio. Deve tornare
       PCM 16 bit a 24 kHz come gli altri, o i clip non si concatenerebbero.
       Configurabile: il modello giusto cambia col piano di chi usa l'app, e i
       modelli TTS di Google sono tutti in «preview» — cioè destinati a essere
       sostituiti. `''` spegne il ripiego. */
    function _ttsRipiego(usato) {
        let alt = 'gemini-3.1-flash-tts-preview';
        try {
            const v = localStorage.getItem('mappai_tts_model_alt');
            if (v !== null) alt = v;
        } catch (e) { /* default */ }
        return (alt && alt !== usato) ? alt : '';
    }

    /** Una chiamata TTS + la sua riga nel registro consumi (che qui non passa
        da `fetchModelAPI`, quindi va scritta a mano). */
    async function _ttsChiamataConto(payload, key, model, i, n) {
        const resp = await _ttsChiamata(payload, key, model, i, n);
        try {
            const um = resp && resp.usageMetadata;
            if (um && window.MappAIUsage) window.MappAIUsage.record({
                provider: 'google', model: model,
                inTok: um.promptTokenCount || 0, outTok: um.candidatesTokenCount || 0,
                ctx: { cat: 'materials', sub: 'tts' }
            });
        } catch (uerr) { /* non bloccante */ }
        return resp;
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
        const saltati = [];   /* blocchi che nessun modello ha voluto leggere */
        const chiavi = [];    /* le chiavi di cache di QUESTA registrazione: si
                                 svuotano quando la copia parlante è scritta */
        _ttsAnnulla = false;  /* ogni registrazione riparte da zero, mai col «no» di prima */
        for (let i = 0; i < blocks.length; i++) {
            _seAnnullato();
            const payload = {
                contents: [{ parts: [{ text: blocks[i] }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
            };
            /* ⚠️ UNA CHIAMATA PER BLOCCO, E IL PROVIDER HA UN LIMITE (11/8/26).
               Il piano gratuito di Google ammette 10 richieste al minuto sul
               modello TTS: una sintesi di venti blocchi le sfondava alla decima,
               e l'errore buttava via TUTTI i clip già generati — già pagati.
               Qui si aspetta PRIMA di sfondare (finestra scorrevole: le prime
               dieci partono subito) e, se il 429 arriva lo stesso, si ritenta
               dopo l'attesa che l'API stessa dichiara. */
            const chiave = _ttsChiave(blocks[i], voice, model);
            chiavi.push(chiave);
            let bytes = _ttsCache[chiave] && _ttsCache[chiave].bytes;
            if (!bytes) {
                /* non in memoria: forse è di ieri, e sta su disco */
                const daDisco = await _cacheDaDisco(chiave);
                if (daDisco) { _ttsCache[chiave] = daDisco; bytes = daDisco.bytes; }
            }
            if (bytes) {
                /* già generato in un tentativo precedente: non si ripaga, e non
                   consuma un posto nella finestra del limite */
                rate = _ttsCache[chiave].rate || rate;
                _veloVoce(window.t('bs_audio_prog', 'Genero audio') + ' ' + (i + 1) + '/' + blocks.length + '…');
            } else {
                let inline = _inlineAudio(await _ttsChiamataConto(payload, key, model, i + 1, blocks.length));
                /* ⚠️ UN BLOCCO DI UNA PAROLA SOLA IL MODELLO NON LO LEGGE (17/8).
                   Misurato sulla chiave di Giacomo, con `gemini-2.5-flash-preview-tts`:
                   «Panoramica», «Introduzione», «Sintesi» tornano 200 OK con
                   `finishReason:"OTHER"` e NESSUN contenuto, mentre «La citta» —
                   otto caratteri, ma DUE parole — viene letto. Non è la
                   lunghezza: è il numero di parole, e i blocchi di una parola
                   sola sono esattamente i TITOLI DI SEZIONE.
                   Prima questo caso faceva `throw`, e siccome «Panoramica» era il
                   blocco 1 di 78 l'intera registrazione moriva dopo un secondo e
                   mezzo — è il difetto che Giacomo ha visto come «lo spinner ha
                   girato per un attimo».
                   Gli altri due modelli TTS della stessa chiave le parole singole
                   le leggono (provato): si ritenta con quello di ripiego, che
                   torna PCM 16 bit a 24 kHz come il primo, quindi i clip si
                   concatenano senza conversioni. */
                if (!inline) {
                    const alt = _ttsRipiego(model);
                    if (alt) inline = _inlineAudio(await _ttsChiamataConto(payload, key, alt, i + 1, blocks.length));
                }
                if (!inline) {
                    /* Nemmeno il ripiego: si SALTA il blocco e si va avanti. Un
                       titolo non letto è una perdita piccola; perdere le altre 77
                       frasi — e le chiamate già pagate — è il guasto peggiore che
                       possa capitare qui. Il cue si scrive lo stesso, altrimenti
                       il karaoke slitterebbe di un blocco da qui in poi: il
                       blocco saltato dura zero e comincia dove comincia il
                       successivo. Quanti ne sono stati saltati si dice alla fine. */
                    saltati.push(blocks[i]);
                    cues.push(Math.round(cum * 1000) / 1000);
                    continue;
                }
                const mr = /rate=(\d+)/.exec(inline.mimeType || ''); if (mr) rate = parseInt(mr[1], 10);
                bytes = _b64ToBytes(inline.data);
                _ttsCache[chiave] = { bytes: bytes, rate: rate };
                /* Su disco SUBITO, non alla fine: se la quota si esaurisce al
                   blocco dopo, questo è già salvo. Scriverli tutti in fondo
                   vorrebbe dire perderli proprio nel caso per cui la cache
                   esiste. */
                await _cacheSuDisco(chiave, bytes, rate);
            }
            pcmParts.push(bytes);
            cues.push(Math.round(cum * 1000) / 1000);
            cum += (bytes.length / 2) / rate; // durata reale del clip (PCM 16-bit mono)
        }
        /* Tutti i blocchi saltati = non c'è audio da consegnare. Meglio dirlo
           che restituire un file muto, che si scopre solo riascoltandolo. */
        if (!pcmParts.length) {
            throw new Error(window.t('bs_audio_noaudio', 'Risposta senza audio (modello TTS non disponibile con questa chiave?)'));
        }
        const totalLen = pcmParts.reduce((a, b) => a + b.length, 0);
        const all = new Uint8Array(totalLen); let off = 0;
        pcmParts.forEach(p => { all.set(p, off); off += p.length; });
        window.showLoadingOverlay && window.showLoadingOverlay(true, window.t('bs_audio_encoding', 'Comprimo l\'audio…'));
        const enc = _encodeAudio(all, rate); // MP3 se possibile
        // Firma del parlato al momento della registrazione: serve a non
        // consegnare mai un documento con testo nuovo e voce vecchia.
        return { blob: enc.blob, cues: cues, mime: enc.mime, ext: enc.ext, saltati: saltati, chiavi: chiavi, sig: blocks.join('') };
    }

    /** Il testo di adesso è ancora quello registrato? (altrimenti i cue slittano)
        ⚠️ Si confronta col `data` PASSATO, non con `_lastSynthesis` (17/8). Il
        `data` è quello per cui la registrazione è stata fatta: arriva da
        `generateSynthesisAudio(data)` e non può essere un altro. `_lastSynthesis`
        invece è «l'ultima sintesi generata in questa sessione», che con l'editor
        aperto su una sintesi letta dal VAULT è un documento diverso — il
        confronto cadeva sul testo sbagliato, e la guardia avvisava «il testo è
        cambiato» su una voce appena registrata. Resta come ripiego. */
    function _audioMatchesText(res, data) {
        try {
            const now = _blocksForAudio(data || _lastSynthesis).join('');
            return !res || !res.sig || res.sig === now;
        } catch (e) { return true; }   // nel dubbio non blocchiamo il docente
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
        _zSopra(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();
        // Guardia: fra la registrazione e la consegna il testo può essere stato
        // modificato (l'editor documenti è aperto lì accanto). In quel caso
        // l'HTML uscirebbe con parole nuove e voce vecchia, e i cue slittati.
        const guard = function () {
            if (_audioMatchesText(res, data)) return true;
            window.showToast && window.showToast(window.t('bs_audio_changed', 'Il testo è cambiato dopo la registrazione: rigenera la voce naturale.'), 'warning');
            return false;
        };
        const wavBtn = modal.querySelector('#bsa-wav');
        if (wavBtn) wavBtn.onclick = function () { _downloadBlob(blob, fname + '.' + ext); modal.remove(); window.showToast && window.showToast(window.t('bs_audio_done', '✓ Audio scaricato'), 'success'); };
        const htmlBtn = modal.querySelector('#bsa-html');
        if (htmlBtn) htmlBtn.onclick = async function () { if (!guard()) return; const uri = await _blobToDataUri(blob); _downloadHtml(_buildSynthesisPrintHtml(data, { audioDataUri: uri, audioMime: mime, cues: cues }), fname + '.html'); modal.remove(); window.showToast && window.showToast(window.t('bs_audio_html_done', '✓ HTML con audio scaricato'), 'success'); };
        const shareBtn = modal.querySelector('#bsa-share');
        if (shareBtn) shareBtn.onclick = async function () { if (!guard()) return; const uri = await _blobToDataUri(blob); modal.remove(); window.MappAILive.shareDocQr(fname + '.html', _buildSynthesisPrintHtml(data, { audioDataUri: uri, audioMime: mime, cues: cues })); };
    }

    /* ── DIRLO PRIMA, NON DOPO VENTI MINUTI ─────────────────────────────────
       🐛 Il bento dice «circa 15 chiamate all'AI» PRIMA di generare i
       materiali; la voce non diceva niente. Il 17/8 Giacomo ha avviato la
       registrazione della sintesi di un'intera mappa — 78 blocchi, cioè 78
       chiamate contro un tetto di 10 al minuto — e l'ha scoperto guardando lo
       spinner per venti minuti, per poi perdere tutto contro la quota
       giornaliera. Il numero che decide c'era già: nessuno glielo mostrava.
       Non si chiede per le registrazioni brevi: una conferma che compare
       sempre smette di essere letta, e un ramo di sei blocchi finisce in mezzo
       minuto. → true = si procede.
       ⚠️ Solo per il gesto manuale: la pipeline chiama
       `_generateSynthesisAudioWithCues` direttamente e resta headless. */
    async function _preavviso(data) {
        const MM = window.MappAIModal;
        if (!MM || !MM.conferma || !UC() || !UC().stimaTts) return true;
        let blocchi;
        try { blocchi = _blocksForAudio(data); } catch (e) { return true; }
        if (!blocchi || blocchi.length < 12) return true;   /* corta: si fa e basta */
        const unaParola = blocchi.filter(function (b) {
            return String(b || '').trim().split(/\s+/).length === 1;
        }).length;
        /* ⚠️ Si conta quello che MANCA, non il documento. Riprendendo il giorno
           dopo una registrazione fermata dalla quota, dire «78 blocchi · 12
           minuti» sarebbe falso — e farebbe rinunciare a una corsa ormai a un
           terzo dalla fine. I clip già su disco non si ripagano e non
           consumano nemmeno un posto nel limite al minuto. */
        const model = (function () { try { return localStorage.getItem('mappai_tts_model') || 'gemini-2.5-flash-preview-tts'; } catch (e) { return 'gemini-2.5-flash-preview-tts'; } })();
        const voice = (function () { try { return localStorage.getItem('mappai_tts_voice') || 'Kore'; } catch (e) { return 'Kore'; } })();
        const pronti = await _giaPronti(blocchi.map(function (b) { return _ttsChiave(b, voice, model); }));
        const restano = Math.max(0, blocchi.length - pronti);
        if (!restano) return true;   /* tutto già pronto: non c'è niente da preventivare */
        const s = UC().stimaTts({
            blocchi: restano, unaParola: Math.min(unaParola, restano),
            ripiego: !!_ttsRipiego(''), rpm: _ttsLimite()
        });
        const righe = [
            (pronti
                ? window.t('bs_pre_restano', '{n} blocchi da leggere — {p} già pronti dalla volta scorsa')
                    .replace('{n}', restano).replace('{p}', pronti)
                : window.t('bs_pre_blocchi', '{n} blocchi di testo da leggere').replace('{n}', restano)),
            window.t('bs_pre_chiamate', 'circa {n} chiamate all\'AI').replace('{n}', s.chiamate),
            window.t('bs_pre_tempo', 'circa {n} minuti, per il limite di {r} chiamate al minuto')
                .replace('{n}', s.minuti).replace('{r}', _ttsLimite())
        ];
        return MM.conferma({
            titolo: window.t('bs_pre_t', 'Registrare la voce naturale?'),
            icona: 'headphones',
            testo: righe.join(' · ') + '\n\n' + window.t('bs_pre_nota',
                'Una sintesi di tutta la mappa è lunga: se ti serve solo una parte, registra la sintesi di un RAMO. Puoi annullare mentre registra, e i blocchi già fatti non si ripagano finché non chiudi l\'app.'),
            conferma: window.t('bs_pre_ok', 'Registra')
        });
    }

    window.generateSynthesisAudio = async function (dataOverride) {
        const data = dataOverride || _lastSynthesis;
        if (!data) { window.showToast && window.showToast(window.t('bs_audio_need', 'Genera prima una sintesi'), 'warning'); return; }
        // La voce naturale è un PASSO FINALE: è una registrazione, non segue le
        // modifiche. Con l'editor aperto e il testo non salvato registreremmo
        // una versione già superata (e una chiamata AI per blocco, a vuoto).
        try {
            const ED = window.MappAIDocEditor;
            if (ED && ED.kind && ED.kind() === 'synthesis' && ED.hasUnsaved && ED.hasUnsaved()) {
                window.showToast && window.showToast(window.t('bs_audio_dirty', 'Salva prima le modifiche: la voce naturale registra il testo com\'è adesso.'), 'warning');
                return;
            }
        } catch (e) { /* editor assente: si procede */ }
        if (!(await _preavviso(data))) return;
        try {
            const res = await _generateSynthesisAudioWithCues(data);
            window.showLoadingOverlay && window.showLoadingOverlay(false);
            /* 🐛 17/8: la voce appena registrata non tornava MAI a chi possiede
               il documento. `_voceNaturale()` dell'editor ha un passo 3 —
               «generata in questa sessione, sta come blob» — che leggeva
               `data._audioBlob`: un campo che, censito nel repo, **nessuno
               scriveva** (le sole tre occorrenze lo azzeravano). Era codice
               morto, e la conseguenza si vedeva: si generava la voce, e poi
               HTML, Stampa e Crea PDF uscivano muti, perché quel blob non
               esisteva da nessuna parte fuori da questa funzione.
               Il deposito va fatto QUI perché è qui che il blob nasce e qui che
               si conosce il `data` a cui appartiene. `sig` viaggia con lui: è la
               firma del parlato, e serve a `audioStale` per non consegnare mai
               un testo nuovo con una voce vecchia. */
            data._audioBlob = res.blob;
            data._cues = res.cues || null;
            data._audioSig = res.sig || '';
            /* Un blocco non letto NON è un dettaglio interno: chi consegna
               l'audio deve sapere che in quel punto la voce tace, o lo scopre
               un allievo, da solo, a casa. */
            if (res.saltati && res.saltati.length) {
                window.showToast && window.showToast(
                    window.t('bs_audio_saltati', 'Voce registrata, ma {n} blocchi non sono stati letti (di solito titoli di una parola sola): ')
                        .replace('{n}', res.saltati.length) + res.saltati.slice(0, 3).join(' · '),
                    'warning');
            }
            _audioReadyChooser(res, data);
            return res;
        } catch (err) {
            window.showLoadingOverlay && window.showLoadingOverlay(false);
            /* Le tre uscite non sono la stessa cosa e non si dicono allo stesso
               modo: chi ha annullato lo sa già (non è un errore, e va detto che
               il lavoro fatto non è perduto); chi ha finito la quota del giorno
               deve sapere che riprovare fra un minuto non serve a niente. */
            if (_ttsAnnulla) {
                _ttsAnnulla = false;
                window.showToast && window.showToast(window.t('bs_audio_annullato_ok',
                    'Registrazione annullata. I blocchi già letti restano pronti: riprovando ora non si ripagano (finché non chiudi l\'app).'), 'info');
                return;
            }
            console.error('[BranchSynthesis] audio TTS fallito:', err);
            window.showToast && window.showToast(
                err && err.message ? err.message : window.t('bs_audio_fail', 'Audio non generato'),
                (err && err.quotaGiornaliera) ? 'warning' : 'error');
        }
    };

    // Superficie pubblica: costruzione dell'HTML stampabile/esportabile (usata
    // anche per la ri-apertura dall'archivio documenti).
    // getData/setData: l'editor documenti di ELABORA lavora sull'ultima sintesi
    // prodotta (o su una ricaricata dall'archivio) senza rigenerarla.
    window.MappAIBranchSynthesis = {
        buildPrintHtml: _buildSynthesisPrintHtml,
        getData: function () { return _lastSynthesis; },
        setData: function (d) { _lastSynthesis = d || null; return _lastSynthesis; },
        // Archivia con LA STESSA chiave dell'auto-salvataggio (kind|titolo|mappa):
        // l'editor documenti aggiorna la voce esistente invece di affiancargliene
        // una nuova, altrimenti la versione non corretta resterebbe stampabile.
        archiveDoc: function (data) { return _saveSynthesisDoc(data || _lastSynthesis); },
        // HTML del solo CORPO (senza citazioni): sorgente dei blocchi editabili.
        bodyHtml: function (data) {
            const d = data || _lastSynthesis;
            if (!d) return '';
            if (d.editedBlocks && d.editedBlocks.length && window.MappAIDocEdit) {
                return window.MappAIDocEdit.blocksToHtml(d.editedBlocks);
            }
            return d.whole ? _wholeBodyHtml(d, 'print') : _mdToHtml(d.rawText, 'print');
        }
    };

    // Namespace pipeline (011): sintesi «tutta la mappa» headless.
    //   runWholeMap({apiKey?, tuned?, silent?}) → Promise<data|null> (forma _lastSynthesis)
    //   buildHtml(data, opts?)   → string (= _buildSynthesisPrintHtml)
    //   generateAudio(data)      → Promise<{blob, mime, ext, cues}> (Google-only, throw se manca chiave)
    // Il flusso manuale (modale sintesi) resta invariato: usa gli entry esistenti.
    window.MappAISynthesis = {
        runWholeMap: async function (opts) {
            opts = opts || {};
            const apiKey = opts.apiKey || (window.getSystemKey ? window.getSystemKey() : '');
            if (!apiKey) throw new Error(window.t('tst_need_key', "Inserisci un'API Key per continuare"));
            const _prevArmed = window.MappAITune ? window.MappAITune.armed : false;
            const _prevSilent = _silent;
            if (window.MappAITune) window.MappAITune.armed = !!opts.tuned;
            _silent = !!opts.silent;
            try {
                return (await _generateWholeMapSynthesis(apiKey)) || null;
            } finally {
                _silent = _prevSilent;
                if (window.MappAITune) window.MappAITune.armed = _prevArmed;
            }
        },
        buildHtml: function (data, opts) { return _buildSynthesisPrintHtml(data, opts); },
        generateAudio: function (data) { return _generateSynthesisAudioWithCues(data); },
        /* «Si cancella quando la copia parlante è scritta» (regola di Giacomo,
           17/8). La chiama chi ha scritto il file, non il motore: finché quel
           file non è su disco i clip servono ancora — è proprio il caso in cui
           la scrittura fallisce che non deve costare una seconda registrazione.
           Le chiavi arrivano da `res.chiavi`. */
        svuotaCache: async function (chiavi) {
            var a = window.electronAPI;
            if (!a || !a.ttsCacheClear || !chiavi || !chiavi.length) return 0;
            try {
                chiavi.forEach(function (k) { delete _ttsCache[k]; });
                var r = await a.ttsCacheClear({ chiavi: chiavi });
                return (r && r.tolti) || 0;
            } catch (e) { return 0; }
        }
    };

    console.log('[MappAI] mappai-branch-synthesis.js caricato ✓');
})();
