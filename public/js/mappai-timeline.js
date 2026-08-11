/**
 * mappai-timeline.js
 * Vista Timeline cronologica per MappAI
 * Dipende da: app.js (appState, cleanLabel, getNodeColor, showToast,
 *             fetchModelAPI, salvageTruncatedJSON, showLoadingOverlay)
 *
 * v2 — Estrae date dai CHUNKS (testi verbatim) anziché dai nodi.
 *       Card stile dossier con contesto della fonte evidenziato.
 * v3 — Aggiunto sistema modale + generazione AI con fetchModelAPI.
 */

// ── HELPER: nome del progetto (letto dinamicamente da appState) ──────────────
// Priorità: appState.rootNodeLabel (impostato dall'utente sia per MindMap sia
// per KG) → nodo con level === 0 (MindMap) → fallback 'MappAI'. Sui KG il
// nodo level 0 può non esistere: senza questo helper il titolo della timeline
// finirebbe sempre su 'Mappa'/'MappAI'.
window._getTimelineProjectName = function () {
    try {
        var raw = (typeof appState !== 'undefined' && appState && appState.rootNodeLabel) || '';
        if (raw && String(raw).trim()) {
            return typeof cleanLabel === 'function' ? cleanLabel(raw) : String(raw).trim();
        }
        var rootNode = (appState && appState.db && Array.isArray(appState.db.nodes))
            ? appState.db.nodes.find(function (n) { return n.level === 0; })
            : null;
        if (rootNode && rootNode.label) {
            return typeof cleanLabel === 'function' ? cleanLabel(rootNode.label) : rootNode.label;
        }
    } catch (e) { /* no-op */ }
    return 'MappAI';
};

// ── HELPER: estrazione deterministica anni distinti da un testo ──────────────
// Usata come rete di sicurezza per la timeline AI: garantisce che nessun anno
// presente nel testo venga perso, anche se il modello AI ne salta alcuni.
window._extractYearsWithContext = function (text) {
    if (!text) return [];
    var out = [];
    var seen = {};
    function ctx(txt, idx, len) {
        var W = 120;
        var s = Math.max(0, idx - W), e = Math.min(txt.length, idx + len + W);
        var c = txt.slice(s, e).trim();
        if (s > 0) c = '…' + c;
        if (e < txt.length) c = c + '…';
        return c;
    }
    var m;
    // Periodo (1939-1945)
    var rangeRe = /\b(\d{4})\s*[-–]\s*(\d{4})\b/g;
    while ((m = rangeRe.exec(text)) !== null) {
        var y = parseInt(m[1]);
        if (!seen[y]) { seen[y] = true; out.push({ year: y, yearEnd: parseInt(m[2]), raw: m[0], context: ctx(text, m.index, m[0].length) }); }
    }
    // Anno singolo (1900-2029)
    var yearRe = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
    while ((m = yearRe.exec(text)) !== null) {
        var yy = parseInt(m[1]);
        if (!seen[yy]) { seen[yy] = true; out.push({ year: yy, yearEnd: null, raw: m[1], context: ctx(text, m.index, m[1].length) }); }
    }
    return out;
};

// ── DATE MANUALI + ESERCIZIO "TROVA LE DATE MANCANTI" (008) ──────────────────
// Layer dati persistente per le date aggiunte a mano (docente) o dallo studente
// come attività di studio. Vive in appState.db.timelineEvents → serializzato col
// progetto da StorageManager.saveCurrentProject (JSON.stringify(appState)).
// Le card manuali si FONDONO con quelle estratte dall'AI al render e sopravvivono
// alla rigenerazione. Logica pura (normalize/dedup/estrazione anni) delegata a
// window.MappAITimelineCore. Editing dal popup: la finestra timeline (stessa
// origine) chiama window.opener.MappAITimeline.* e re-inietta mergedEventsHtml().
window.MappAITimeline = window.MappAITimeline || {};

function _TLC() { return window.MappAITimelineCore; }

MappAITimeline._db = function () {
    if (!appState.db) appState.db = { nodes: [], links: [] };
    if (!Array.isArray(appState.db.timelineEvents)) appState.db.timelineEvents = [];
    return appState.db.timelineEvents;
};

MappAITimeline._persist = function () {
    try {
        if (window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject();
    } catch (e) { console.warn('[Timeline] persist date manuali fallito:', e); }
};

MappAITimeline.list = function () { return MappAITimeline._db().slice(); };

MappAITimeline.add = function (ev) {
    var core = _TLC();
    var norm = core ? core.normalizeEvent(ev) : { ok: !!(ev && ev.anno && ev.evento), clean: ev };
    if (!norm.ok) return { ok: false, error: (norm.errors || []).join(',') || 'evento non valido' };
    var rec = norm.clean;
    rec.id = 'tlm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    rec.origin = ev.origin === 'student' ? 'student' : 'manual';
    if (ev.author) rec.author = String(ev.author).slice(0, 80);
    MappAITimeline._db().push(rec);
    MappAITimeline._persist();
    return { ok: true, event: rec };
};

MappAITimeline.remove = function (id) {
    var list = MappAITimeline._db();
    var i = list.findIndex(function (e) { return e.id === id; });
    if (i < 0) return { ok: false };
    list.splice(i, 1);
    MappAITimeline._persist();
    return { ok: true };
};

// ── Helper HTML (self-contained: girano anche quando chiamati dal popup) ──────
MappAITimeline._esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
MappAITimeline._fmtDate = function (e) {
    if (e.type === 'full')    return e.raw;
    if (e.type === 'range')   return e.raw;
    if (e.type === 'century') return (e.century || '') + ' sec.';
    return String(e.year);
};
MappAITimeline._hl = function (context, dateRaw) {
    var escd = String(dateRaw || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escd) return context;
    return context.replace(new RegExp(escd, 'gi'),
        '<strong style="color:#1e293b;background:#fef9c3;padding:1px 2px;border-radius:2px;font-style:normal;">$&</strong>');
};
MappAITimeline._color = function (macroArea) {
    var core = _TLC();
    return core ? core.categoryColor(macroArea) : '#6366f1';
};
MappAITimeline._key = function (e) {
    var core = _TLC();
    return core ? core.eventKey({ anno: e.year != null ? e.year : e.anno, evento: e.nodeLabel != null ? e.nodeLabel : e.evento })
                : ((e.year || e.anno || 0) + '|' + String(e.nodeLabel || e.evento || '').toLowerCase());
};

// Testo sorgente ricostruito da appState (per l'esercizio: quali anni cita la fonte).
MappAITimeline._sourceText = function () {
    try {
        var parts = [];
        ((appState.db && appState.db.nodes) || []).forEach(function (n) {
            if (n.desc) parts.push(n.desc); else if (n.content) parts.push(n.content);
        });
        var sd = (appState.db && appState.db.sourcesDict) || {};
        Object.values(sd).forEach(function (chunks) {
            if (Array.isArray(chunks)) chunks.forEach(function (c) { if (c && c.text) parts.push(c.text); });
        });
        return parts.filter(Boolean).join('\n\n').slice(0, 60000);
    } catch (e) { return ''; }
};

// Normalizza le date manuali nella shape usata dal render.
MappAITimeline._normalizeManual = function () {
    return MappAITimeline._db().map(function (e, idx) {
        return {
            year: e.anno, yearEnd: e.annoFine || null,
            raw: e.dataLabel || String(e.anno),
            type: e.annoFine ? 'range' : 'year',
            sortKey: e.anno * 10000,
            nodeLabel: e.evento, nodeLevel: 1,
            macroLabel: e.macroArea || '',
            macroColor: MappAITimeline._color(e.macroArea),
            chunkText: e.contesto || '',
            chunkSource: e.origin === 'student' ? 'Studente' : 'Aggiunta manuale',
            chunkTitle: 'Evento aggiunto',
            chunkIdx: 10000 + idx,
            _manual: true, _origin: e.origin, _id: e.id
        };
    });
};

// Card di un evento (estratto o manuale). idx 0-based → numero progressivo.
MappAITimeline._cardHtml = function (e, idx, side, showContext) {
    var esc = MappAITimeline._esc;
    var dateLabel = MappAITimeline._fmtDate(e);
    var ctxH = MappAITimeline._hl(esc(e.chunkText), esc(e.raw));
    var num = String(idx + 1).padStart(2, '0');
    var delBtn = e._manual
        ? '<button type="button" class="no-print" onclick="TL_del(\'' + e._id + '\')" title="Rimuovi data" ' +
          'style="background:rgba(255,255,255,.28);border:none;color:white;border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:12px;line-height:1;">✕</button>'
        : '';
    var originTag = e._origin === 'student' ? ' · 🎓 studente'
                  : e._origin === 'manual'  ? ' · ✏️ aggiunta' : '';
    return '<div class="tl-event tl-' + side + '">' +
        '<div class="tl-connector"><div class="tl-dot" style="background:' + e.macroColor + ';"></div></div>' +
        '<div class="dossier-card tl-card' + (e._manual ? ' tl-card-manual' : '') + '">' +
            '<div class="dossier-card-header" style="background:' + e.macroColor + ';color:white;">' +
                '<div class="dossier-card-header-main">' +
                    '<div class="tl-date-label">' + esc(dateLabel) + '</div>' +
                    '<h2 class="dossier-title">' + esc(e.nodeLabel) + '</h2>' +
                    '<span class="dossier-level-tag">' + esc(e.macroLabel) + originTag + '</span>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">' +
                    '<div class="tl-event-num">' + num + '</div>' + delBtn +
                '</div>' +
            '</div>' +
            (showContext && e.chunkText
                ? '<div class="dossier-body">' +
                    '<span class="dossier-section-label">CONTESTO DALLA FONTE</span>' +
                    '<div class="tl-chunk-source" style="color:' + e.macroColor + ';">' +
                        '▌ ' + esc(e.chunkTitle) + ' — <em>' + esc(e.chunkSource) + '</em>' +
                    '</div>' +
                    '<p class="dossier-desc tl-context-text">“' + ctxH + '”</p>' +
                  '</div>'
                : '') +
        '</div>' +
    '</div>';
};

// Card "buco" dell'esercizio: anno citato dalla fonte ma non ancora sulla timeline.
MappAITimeline._gapCardHtml = function (ry, side) {
    var esc = MappAITimeline._esc;
    var y = ry.year;
    var hint = esc(ry.hint || ry.context || '');
    var cats = (_TLC() ? _TLC().CATEGORY_KEYS : ['Politica', 'Economia', 'Militare', 'Diplomatica', 'Sociale', 'Cultura']);
    var optsHtml = cats.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    return '<div class="tl-event tl-' + side + '">' +
        '<div class="tl-connector"><div class="tl-dot" style="background:#94a3b8;border-style:dashed;"></div></div>' +
        '<div class="dossier-card tl-card tl-gap" id="gap-' + y + '">' +
            '<div class="dossier-card-header" style="background:#64748b;color:white;">' +
                '<div class="dossier-card-header-main">' +
                    '<div class="tl-date-label">' + esc(ry.raw || String(y)) + '</div>' +
                    '<h2 class="dossier-title">Data da completare</h2>' +
                    '<span class="dossier-level-tag">Quale evento accadde?</span>' +
                '</div>' +
                '<div class="tl-event-num">?</div>' +
            '</div>' +
            '<div class="dossier-body no-print">' +
                '<input id="gap-ev-' + y + '" type="text" placeholder="Nome dell\'evento…" ' +
                    'style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-family:inherit;font-size:11pt;margin-bottom:8px;">' +
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                    '<select id="gap-cat-' + y + '" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-family:inherit;font-size:10pt;">' + optsHtml + '</select>' +
                    '<button type="button" onclick="TL_hint(' + y + ')" style="background:#f1f5f9;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:10pt;">💡 Indizio</button>' +
                    '<button type="button" onclick="TL_fillGap(' + y + ')" style="background:#4f46e5;color:white;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:10pt;font-weight:bold;">✓ Aggiungi</button>' +
                '</div>' +
                '<p id="gap-hint-' + y + '" style="display:none;margin-top:8px;font-size:10pt;color:#475569;font-style:italic;background:#f8fafc;border-left:3px solid #cbd5e1;padding:6px 10px;border-radius:4px;">' + hint + '</p>' +
            '</div>' +
        '</div>' +
    '</div>';
};

// HTML degli eventi: base (AI/statico, in _lastBase) + date manuali, deduplicato
// e ordinato. In modalità esercizio interpola le card "buco". Aggiorna i contatori.
MappAITimeline.mergedEventsHtml = function (opts) {
    opts = opts || {};
    var showContext = opts.showContext !== false;

    var all = (MappAITimeline._lastBase || []).slice().concat(MappAITimeline._normalizeManual());
    var seen = {}, merged = [];
    all.forEach(function (e) {
        var key = MappAITimeline._key(e);
        if (seen[key]) return;
        seen[key] = true;
        merged.push(e);
    });

    var items = merged.map(function (e) { return { y: (e.sortKey || e.year * 10000), kind: 'event', e: e }; });

    var gapCount = 0;
    if (opts.exercise) {
        var core = _TLC();
        var have = {};
        merged.forEach(function (e) { have[e.year] = true; });
        var gaps = core
            ? core.extractYears(MappAITimeline._sourceText()).filter(function (ry) { return !have[ry.year]; })
            : [];
        gaps.forEach(function (ry) { items.push({ y: ry.year * 10000, kind: 'gap', ry: ry }); });
        gapCount = gaps.length;
    }

    items.sort(function (a, b) { return a.y - b.y; });

    var html = '', isLeft = true, evNum = 0;
    items.forEach(function (it) {
        var side = isLeft ? 'left' : 'right';
        isLeft = !isLeft;
        if (it.kind === 'event') { html += MappAITimeline._cardHtml(it.e, evNum, side, showContext); evNum++; }
        else html += MappAITimeline._gapCardHtml(it.ry, side);
    });

    MappAITimeline._lastMergedCount = merged.length;
    MappAITimeline._lastGapCount = gapCount;
    return html;
};

// Persiste il POOL di date estratte (R5): mappa gli eventi base (render-shape)
// nella core-shape e li salva in appState.db.timelineAI (SOVRASCRITTO — ultima
// generazione vince). Così le attività Live trovano il pool senza rigenerare.
MappAITimeline._persistPool = function (baseEvents) {
    try {
        var core = _TLC();
        var mapped = (baseEvents || []).map(function (e) {
            return {
                anno: e.year, annoFine: e.yearEnd || null,
                dataLabel: e.raw || String(e.year),
                evento: e.nodeLabel || '', contesto: e.chunkText || '',
                macroArea: e.macroLabel || '', origin: 'ai'
            };
        }).filter(function (m) {
            if (!core) return m.anno && m.evento;
            return core.normalizeEvent(m).ok;
        });
        if (!appState.db) appState.db = { nodes: [], links: [] };
        appState.db.timelineAI = mapped;
        MappAITimeline._persist();
    } catch (e) { console.warn('[Timeline] persist pool fallito:', e); }
};

// ── MODALE CONFIGURAZIONE TIMELINE ───────────────────────────────────────────

window.openTimelineGeneratorModal = function () {
    if (!appState.db?.nodes || appState.db.nodes.length === 0) {
        window.showToast('Genera prima una mappa', 'warning');
        return;
    }

    // Conta il testo disponibile per stimare il costo in token
    var totalText = (appState.db?.nodes || [])
        .map(function (n) {
            return [n.desc, n.content,
                    (n.chunks || []).join(' ')].join(' ');
        })
        .join(' ');
    var estimatedTokens = Math.round(totalText.length / 4);
    var mapName = window._getTimelineProjectName();

    // Crea modale inline
    var existingModal = document.getElementById('timeline-generator-modal');
    if (existingModal) existingModal.remove();

    var tokenBadgeClass = estimatedTokens > 40000 ? 'pm-badge pm-badge-warn' : 'pm-badge pm-badge-ok';
    var tokenBadgeText  = estimatedTokens > 40000
        ? 'Testo lungo \u2014 preferisci Gemma 4'
        : 'Dimensione ottimale per tutti i modelli';

    var modal = document.createElement('div');
    modal.id = 'timeline-generator-modal';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';

    modal.innerHTML =
        '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[500px] p-8 relative">' +

            // Pulsante chiudi (X) \u2014 identico al Stampa Dossier
            '<button type="button" onclick="document.getElementById(\'timeline-generator-modal\').remove()" ' +
                'class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                '<i data-lucide="x" class="w-6 h-6"></i>' +
            '</button>' +

            '<div class="space-y-6">' +

                // Header: icona + titolo + sottotitolo
                '<div class="flex items-center gap-3">' +
                    '<div class="pm-icon-wrap">' +
                        '<i data-lucide="calendar-clock" class="w-5 h-5 text-indigo-600"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div class="pm-title">Crea Timeline</div>' +
                        '<div class="pm-subtitle">' + mapName + '</div>' +
                    '</div>' +
                '</div>' +

                // Descrizione + badge token
                '<p class="pm-body-text">' +
                    'L\'AI analizza la mappa ed estrae tutti gli eventi datati con il loro significato storico.<br>' +
                    '<strong>Testo da analizzare:</strong> ~' + estimatedTokens.toLocaleString('it') + ' token&nbsp;' +
                    '<span class="' + tokenBadgeClass + '">' + tokenBadgeText + '</span>' +
                '</p>' +

                // Sezione opzioni
                '<div class="pm-section">' +
                    '<span class="pm-section-title">Formato di esportazione</span>' +
                    '<div class="space-y-3">' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="tl-style" id="tl-style-compact" value="compact" ' +
                                'class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div>' +
                                '<div class="pm-option-label">Compatta</div>' +
                                '<div class="pm-option-desc">Data \u00B7 Evento \u00B7 Categoria</div>' +
                            '</div>' +
                        '</label>' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="tl-style" id="tl-style-context" value="context" checked ' +
                                'class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div>' +
                                '<div class="pm-option-label">Con contesto</div>' +
                                '<div class="pm-option-desc">Data \u00B7 Evento \u00B7 Categoria \u00B7 Estratto dalla fonte</div>' +
                            '</div>' +
                        '</label>' +
                    '</div>' +
                '</div>' +

                // Footer bottoni
                '<div class="flex gap-3 pt-2 border-t border-slate-100">' +
                    '<button type="button" onclick="document.getElementById(\'timeline-generator-modal\').remove()" ' +
                        'class="pm-btn-cancel">Annulla</button>' +
                    '<button type="button" onclick="window.generateTimelineWithAI()" ' +
                        'class="pm-btn-primary">' +
                        '<i data-lucide="zap" class="w-4 h-4"></i> Genera Timeline' +
                    '</button>' +
                '</div>' +

            '</div>' +
        '</div>';

    document.body.appendChild(modal);

    // Inizializza icone Lucide nel modal appena inserito
    if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();

    // Chiudi con ESC
    var escHandler = function (e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
};

// ── GENERAZIONE TIMELINE CON AI ───────────────────────────────────────────────

window.generateTimelineWithAI = async function () {
    var modal = document.getElementById('timeline-generator-modal');

    // Leggi opzioni selezionate PRIMA di rimuovere il modale
    var selectedStyle = document.querySelector('input[name="tl-style"]:checked')?.value || 'context';
    var showContext = selectedStyle === 'context';

    if (modal) modal.remove();

    window.showLoadingOverlay(true, 'Generazione timeline in corso\u2026');

    try {
        // ── 1. Leggi apiKey con guard completo ─────────────────────────────────
        var apiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (!apiKey) {
            window.showLoadingOverlay(false);
            window.showToast(window.t('tst_need_key', "Inserisci un'API Key per continuare"), 'error');
            return;
        }

        // ── 2. Costruisci testo sorgente ────────────────────────────────────────
        var mapName = window._getTimelineProjectName();

        var allNodes    = appState.db?.nodes    || [];
        var sourcesDict = appState.db?.sourcesDict || {};

        // Raccogli desc/content dai nodi
        var sourceTextParts = [];
        allNodes.forEach(function (node) {
            if (node.desc)         sourceTextParts.push(node.desc);
            else if (node.content) sourceTextParts.push(node.content);
        });

        // Aggiungi chunks verbatim dal sourcesDict
        Object.values(sourcesDict).forEach(function (chunks) {
            if (!Array.isArray(chunks)) return;
            chunks.forEach(function (c) { if (c.text) sourceTextParts.push(c.text); });
        });

        var sourceText = sourceTextParts.filter(Boolean).join('\n\n').slice(0, 40000);

        if (!sourceText.trim()) {
            window.showLoadingOverlay(false);
            window.showToast('Nessun testo disponibile nella mappa', 'warning');
            return;
        }

        // ── 3. Costruisci prompt ────────────────────────────────────────────────
        var contextInstruction = showContext
            ? 'massimo 3 frasi dal testo che spiegano perch\u00e9 quella data \u00e8 importante (max 300 caratteri)'
            : 'stringa vuota';

        var userPrompt =
            'Analizza questo testo e estrai TUTTI gli eventi con una data precisa.\n' +
            'IMPORTANTE: il testo contiene MOLTE date — estraile TUTTE senza eccezioni, ' +
            'non fermarti alle prime. Ogni anno/data che compare nel testo deve diventare ' +
            'un evento. Non riassumere, non selezionare: sii esaustivo.\n\n' +
            'Includi: date e anni precisi, eventi storici politici militari ed economici.\n\n' +
            'Per ogni evento che trovi restituisci:\n' +
            '- anno: numero intero (anno principale)\n' +
            '- annoFine: numero intero o null (per periodi es. 1939-1945)\n' +
            '- dataLabel: stringa con la data esattamente come appare nel testo\n' +
            '- evento: nome preciso dell\'evento storico reale\n' +
            '  (es. "Piano Marshall", "Caduta Muro Berlino")\n' +
            '  NON usare il nome del nodo della mappa\n' +
            '- contesto: ' + contextInstruction + '\n' +
            '- macroArea: categoria (Politica/Economia/Militare/Diplomatica/Sociale)\n\n' +
            'Esempio formato risposta (SOLO JSON, niente altro):\n' +
            '[{"anno":1947,"annoFine":null,"dataLabel":"1947",' +
            '"evento":"Piano Marshall",' +
            '"contesto":"USA aiutano la ricostruzione europea",' +
            '"macroArea":"Economia"}]\n\n' +
            'TESTO DA ANALIZZARE:\n' + sourceText;

        // ── 4. Payload Gemini-format ────────────────────────────────────────────
        // Nota: NO responseMimeType — non supportato da Infomaniak/Apertus
        var payload = {
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: {
                parts: [{
                    text: 'Sei un esperto di cronologia storica. ' +
                          'Rispondi SOLO con un array JSON valido. ' +
                          'Nessun testo prima o dopo il JSON. ' +
                          'Nessun markdown. Solo JSON puro.'
                }]
            },
            generationConfig: {
                temperature: 0.1,
                // 4096 era troppo basso: con molti eventi (anno+evento+contesto+macroArea)
                // l'output veniva troncato. Alziamo per coprire timeline lunghe.
                maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(8192) : 8192)
            }
        };

        // ── 5. Chiama l'AI — try/catch separato per errori IPC ─────────────────
        if (window.MappAIUsage) window.MappAIUsage.setContext('materials', 'timeline');
        var response;
        try {
            response = await window.fetchModelAPI(window.injectClassTuning(payload), apiKey);
        } catch (apiErr) {
            window.showLoadingOverlay(false);
            console.error('[Timeline] API error:', apiErr);
            window.showToast(
                'Errore chiamata AI: ' + (apiErr.message || String(apiErr)),
                'error'
            );
            return;
        }

        var rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!rawText) {
            window.showLoadingOverlay(false);
            window.showToast('Risposta AI vuota \u2014 riprova', 'warning');
            return;
        }

        // ── 6. Parsing JSON con salvage ─────────────────────────────────────────
        var timelineData;
        try {
            timelineData = salvageTruncatedJSON(rawText);
        } catch (parseErr) {
            window.showLoadingOverlay(false);
            console.error('[Timeline] Parse error:', parseErr, '\nRaw:', rawText.slice(0, 200));
            window.showToast('Errore parsing risposta AI \u2014 riprova con Gemma 4', 'error');
            return;
        }

        if (!Array.isArray(timelineData) || timelineData.length === 0) {
            window.showLoadingOverlay(false);
            window.showToast(
                'Nessun evento trovato \u2014 aggiungi pi\u00f9 fonti alla mappa',
                'warning'
            );
            return;
        }

        // ── 6b. RETE DI SICUREZZA A 2 PASSAGGI (map-reduce) ─────────────────────
        // L'AI (soprattutto modelli piccoli) estrae solo alcuni eventi.
        // 1) Regex deterministico: trova TUTTI gli anni nel testo (completezza).
        // 2) Secondo passaggio AI: dà un NOME-evento pulito alle date mancanti
        //    (leggibilità). Fallback a una frase ripulita se anche il pass 2 fallisce.
        try {
            var aiYears = {};
            timelineData.forEach(function (e) { if (e && e.anno) aiYears[parseInt(e.anno)] = true; });

            var regexYears = window._extractYearsWithContext(sourceText);
            var missing = regexYears.filter(function (ry) { return !aiYears[ry.year]; });

            // Helper: ripulisce un ritaglio di contesto per usarlo come label leggibile
            var cleanCtxLabel = function (ctx, year) {
                if (!ctx) return 'Evento ' + year;
                var s = ctx.replace(/^…+/, '').replace(/…+$/, '').trim();
                // Parti dall'inizio di una frase se possibile, taglia al primo punto
                var firstStop = s.search(/[.;]/);
                if (firstStop > 15) s = s.slice(0, firstStop);
                s = s.slice(0, 70).replace(/\s+\S*$/, '').trim();
                if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
                return s || ('Evento ' + year);
            };

            if (missing.length > 0) {
                window.showLoadingOverlay(true, 'Timeline: assegno un nome alle date mancanti…');

                // ── PASS 2: chiedi all'AI di nominare SOLO le date mancanti ──────
                var labeled = {};
                try {
                    var missingList = missing.map(function (ry) {
                        return '- anno ' + ry.year + ': "' + ry.context.replace(/"/g, "'").slice(0, 180) + '"';
                    }).join('\n');

                    var labelPrompt =
                        'Per ciascuna delle seguenti date storiche, dato il contesto, ' +
                        'assegna un NOME-evento breve, chiaro e adatto a uno studente ' +
                        '(es. "Caduta del Muro di Berlino", "Crisi di Cuba"). ' +
                        'Indica anche la macroArea (Politica/Economia/Militare/Diplomatica/Sociale).\n\n' +
                        'DATE DA NOMINARE:\n' + missingList + '\n\n' +
                        'Rispondi SOLO con un array JSON, un oggetto per data:\n' +
                        '[{"anno":1962,"evento":"Crisi di Cuba","macroArea":"Militare"}]';

                    var labelPayload = {
                        contents: [{ role: 'user', parts: [{ text: labelPrompt }] }],
                        systemInstruction: { parts: [{ text: 'Sei un esperto di storia. Rispondi SOLO con array JSON valido, nessun markdown, nessun testo extra.' }] },
                        generationConfig: { temperature: 0.1, maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(8192) : 8192) }
                    };

                    var labelResp = await window.fetchModelAPI(labelPayload, apiKey);
                    var labelRaw = labelResp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    var labelArr = labelRaw ? salvageTruncatedJSON(labelRaw) : [];
                    if (Array.isArray(labelArr)) {
                        labelArr.forEach(function (e) {
                            if (e && e.anno && e.evento) labeled[parseInt(e.anno)] = { evento: e.evento, macroArea: e.macroArea || '' };
                        });
                    }
                } catch (pass2Err) {
                    console.warn('[Timeline] Pass 2 (etichettatura) fallito, uso fallback frase:', pass2Err);
                }

                // ── Merge: usa il nome dell'AI se disponibile, altrimenti frase pulita ──
                var namedByAI = 0, fallbacks = 0;
                missing.forEach(function (ry) {
                    var lab = labeled[ry.year];
                    if (lab) namedByAI++; else fallbacks++;
                    timelineData.push({
                        anno: ry.year,
                        annoFine: ry.yearEnd || null,
                        dataLabel: ry.raw,
                        evento: lab ? lab.evento : cleanCtxLabel(ry.context, ry.year),
                        contesto: ry.context,
                        macroArea: lab ? lab.macroArea : ''
                    });
                });
                console.info('[Timeline] Aggiunte ' + missing.length + ' date mancanti (' +
                    namedByAI + ' nominate dall\'AI, ' + fallbacks + ' con fallback frase).');
            }
        } catch (safetyErr) {
            console.warn('[Timeline] Rete di sicurezza non applicata:', safetyErr);
        }

        window.showLoadingOverlay(false);

        // ── 7. Deduplica per (anno, evento normalizzato) ────────────────────────
        // L'AI e la rete di sicurezza possono produrre lo stesso evento più volte
        // (es. "Piano Wahlen" estratto sia dal pass 1 sia dal regex pass 2).
        var _norm = function (s) {
            return String(s || '').toLowerCase()
                .replace(/[àáâã]/g, 'a').replace(/[èéêë]/g, 'e')
                .replace(/[ìíîï]/g, 'i').replace(/[òóôõ]/g, 'o')
                .replace(/[ùúûü]/g, 'u')
                .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
                .slice(0, 40);
        };
        var _seen = {};
        timelineData = timelineData.filter(function (e) {
            var key = (e.anno || 0) + '|' + _norm(e.evento);
            if (_seen[key]) return false;
            _seen[key] = true;
            return true;
        });

        // ── 8. Apri timeline ────────────────────────────────────────────────────
        window.openTimelineView(timelineData, mapName, { showContext: showContext });

    } catch (err) {
        window.showLoadingOverlay(false);
        console.error('[Timeline] Errore:', err);
        window.showToast('Errore generazione timeline: ' + (err.message || err), 'error');
    }
};


// ── TIMELINE VIEW (da sourcesDict) ───────────────────────────────────────────
window.openTimelineView = function (aiTimelineData, mapNameOverride, opts) {
    opts = opts || {};

    // ── 0. Se i dati arrivano dall'AI usa quelli direttamente ────────────────
    if (aiTimelineData && Array.isArray(aiTimelineData) &&
        aiTimelineData.length > 0) {

        var colorMap = {
            'Politica':    '#4f46e5',
            'Economia':    '#059669',
            'Militare':    '#dc2626',
            'Diplomatica': '#d97706',
            'Sociale':     '#7c3aed',
            'Cultura':     '#0891b2'
        };

        var uniqueEventsAI = aiTimelineData
            .filter(function (e) { return e.anno && e.evento; })
            .sort(function (a, b) { return a.anno - b.anno; })
            .map(function (e, idx) {
                return {
                    year:        e.anno,
                    yearEnd:     e.annoFine || null,
                    raw:         e.dataLabel || String(e.anno),
                    type:        e.annoFine ? 'range' : 'year',
                    sortKey:     e.anno * 10000,
                    nodeLabel:   e.evento,
                    nodeLevel:   1,
                    macroLabel:  e.macroArea || '',
                    macroColor:  colorMap[e.macroArea] || '#6366f1',
                    chunkText:   e.contesto || e.evento,
                    chunkSource: e.macroArea || 'Fonte',
                    chunkTitle:  'Evento storico',
                    chunkIdx:    idx
                };
            });

        var mapNameAI = mapNameOverride || window._getTimelineProjectName();

        // Salta il parsing statico e vai direttamente al render
        window._renderTimeline(uniqueEventsAI, mapNameAI, opts);
        return;
    }

    // ── Altrimenti: estrazione statica dai sourcesDict (fallback) ────────────

    if (!appState.db || !appState.db.sourcesDict ||
        Object.keys(appState.db.sourcesDict).length === 0) {
        window.showToast(
            'Genera prima una mappa con fonti caricate',
            'warning'
        );
        return;
    }

    // ── 1. Parser date con contesto ──────────────────────────────────────────

    function extractDatesWithContext(text) {
        if (!text) return [];
        const results = [];

        // Estrae ~120 caratteri prima e dopo la data
        function extractContext(txt, dateIndex, dateLength) {
            var WINDOW = 120;
            var start = Math.max(0, dateIndex - WINDOW);
            var end = Math.min(txt.length, dateIndex + dateLength + WINDOW);
            var ctx = txt.slice(start, end).trim();
            if (start > 0) ctx = '\u2026' + ctx;
            if (end < txt.length) ctx = ctx + '\u2026';
            return ctx;
        }

        var m;

        // Data completa italiana (14 luglio 1789)
        var MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                      'luglio','agosto','settembre','ottobre','novembre','dicembre'];
        var fullIt = /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/gi;
        while ((m = fullIt.exec(text)) !== null) {
            results.push({
                raw: m[0],
                year: parseInt(m[3]),
                sortKey: parseInt(m[3]) * 10000 +
                    MONTHS.indexOf(m[2].toLowerCase()) * 100 +
                    parseInt(m[1]),
                context: extractContext(text, m.index, m[0].length),
                type: 'full'
            });
        }

        // Periodo (1939-1945 o 1939\u20131945)
        var rangeRe = /\b(\d{4})\s*[-\u2013]\s*(\d{4})\b/g;
        while ((m = rangeRe.exec(text)) !== null) {
            results.push({
                raw: m[0],
                year: parseInt(m[1]),
                yearEnd: parseInt(m[2]),
                sortKey: parseInt(m[1]) * 10000,
                context: extractContext(text, m.index, m[0].length),
                type: 'range'
            });
        }

        // Anno singolo (1789) — solo se non già catturato da range o full date
        var yearRe = /\b(1[0-9]{3}|20[0-9]{2})\b/g;
        while ((m = yearRe.exec(text)) !== null) {
            var idx = m.index;
            var alreadyCaptured = results.some(function (r) {
                var rIdx = text.indexOf(r.raw);
                return idx >= rIdx && idx < rIdx + r.raw.length;
            });
            if (!alreadyCaptured) {
                results.push({
                    raw: m[1],
                    year: parseInt(m[1]),
                    sortKey: parseInt(m[1]) * 10000,
                    context: extractContext(text, m.index, m[1].length),
                    type: 'year'
                });
            }
        }

        // Secolo (XVIII secolo, sec. XIX)
        var centuryMap = {
            I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,
            IX:9,X:10,XI:11,XII:12,XIII:13,XIV:14,XV:15,
            XVI:16,XVII:17,XVIII:18,XIX:19,XX:20,XXI:21
        };
        var centuryRe = /\b([IVXLC]+)\s+secolo\b/gi;
        while ((m = centuryRe.exec(text)) !== null) {
            var roman = m[1].toUpperCase();
            if (centuryMap[roman]) {
                var centerYear = (centuryMap[roman] - 1) * 100 + 50;
                results.push({
                    raw: m[0],
                    year: centerYear,
                    sortKey: centerYear * 10000,
                    context: extractContext(text, m.index, m[0].length),
                    type: 'century',
                    century: roman
                });
            }
        }

        return results;
    }

    // Formatta la data per la card
    function formatDateLabel(event) {
        if (event.type === 'full')    return event.raw;
        if (event.type === 'range')   return event.raw;
        if (event.type === 'century') return event.century + ' sec.';
        return String(event.year);
    }

    // Evidenzia la data nel testo del chunk (bold + sfondo giallo)
    function highlightDate(context, dateRaw) {
        var escaped = dateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return context.replace(
            new RegExp(escaped, 'gi'),
            '<strong style="color:#1e293b;background:#fef9c3;padding:1px 2px;border-radius:2px;font-style:normal;">$&</strong>'
        );
    }

    // Escape HTML sicuro
    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── 2. Scansiona tutti i chunks in sourcesDict ───────────────────────────

    var events = [];
    var sourcesDict = appState.db.sourcesDict || {};
    var allNodes = appState.db.nodes || [];

    Object.keys(sourcesDict).forEach(function (nodeId) {
        var chunks = sourcesDict[nodeId];
        if (!Array.isArray(chunks)) return;

        var node = allNodes.find(function (n) { return n.id === nodeId; });
        if (!node) return;

        // Macroarea L1
        var macroNode = node.level === 1
            ? node
            : allNodes.find(function (n) { return n.level === 1 && n.group === node.group; });
        var macroLabel = macroNode ? (typeof cleanLabel === 'function' ? cleanLabel(macroNode.label) : macroNode.label) : '';
        var macroColor = macroNode && typeof getNodeColor === 'function' ? getNodeColor(macroNode) : '#6366f1';
        var nodeLabel  = typeof cleanLabel === 'function' ? cleanLabel(node.label) : node.label;

        chunks.forEach(function (chunk, chunkIdx) {
            if (!chunk.text) return;

            var dates = extractDatesWithContext(chunk.text);
            dates.forEach(function (dateObj) {
                events.push(Object.assign({}, dateObj, {
                    nodeId:      nodeId,
                    nodeLabel:   nodeLabel,
                    nodeLevel:   node.level,
                    macroLabel:  macroLabel,
                    macroColor:  macroColor,
                    chunkText:   chunk.text,
                    chunkSource: chunk.source || 'Fonte',
                    chunkTitle:  chunk.title  || 'Testo di origine',
                    chunkIdx:    chunkIdx
                }));
            });
        });
    });

    if (events.length === 0) {
        window.showToast(
            'Nessuna data trovata nelle fonti \u2014 usa la lens \uD83D\uDCC5 Date per includere le date',
            'warning'
        );
        return;
    }

    // ── 3. Ordina e deduplica (stessa data + stesso chunk = stesso evento) ───

    events.sort(function (a, b) { return a.sortKey - b.sortKey; });

    var seenKeys = new Set();
    var uniqueEvents = events.filter(function (e) {
        var key = e.year + '_' + e.nodeId + '_' + e.chunkIdx + '_' + e.raw;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });

    // ── 4–8. Genera HTML e apri finestra ──────────────────────────────────
    var mapName = mapNameOverride || window._getTimelineProjectName();

    window._renderTimeline(uniqueEvents, mapName, opts);
};

// ── RENDER TIMELINE HTML (condiviso tra path AI e statico) ────────────────────
window._renderTimeline = function (uniqueEvents, mapName, opts) {
    opts = opts || {};
    var showContext = opts.showContext !== false; // default: mostra il contesto
    /* Data del documento: GG/MM/AAAA senza ora — la scrive la cornice
       (mappai-doc-head.js), una regola per tutti i fogli. */
    var now = _tlDH() ? _tlDH().data(new Date()) : new Date().toLocaleDateString('it-IT');

    // Helper esc locale (per titolo/header del documento).
    var esc = window.MappAITimeline._esc;

    // Base = eventi estratti (AI o statici). Salvati per il refresh dal popup:
    // aggiunta/rimozione date manuali → il popup richiama mergedEventsHtml()
    // che rifonde questa base con le manuali.
    window.MappAITimeline._lastBase = (uniqueEvents || []).slice();

    // Persiste il pool per le attività Live (R5 — zero token al lancio).
    window.MappAITimeline._persistPool(window.MappAITimeline._lastBase);

    // HTML iniziale = base + eventuali date manuali già salvate nel progetto.
    var timelineHtml = window.MappAITimeline.mergedEventsHtml({ showContext: showContext, exercise: false });
    var eventCount   = window.MappAITimeline._lastMergedCount;

    // ── 5. CSS stile dossier + layout timeline ───────────────────────────────

    /* La CORNICE condivisa (mappai-doc-head.js): testata coi chip classe e
       materia, piè coi numeri di pagina. Le quattro regole che stavano qui erano
       una copia del foglio quiz, coi corpi convertiti in pt.
       ⚠️ Il badge del conteggio è VIVO: la modalità esercizio lo riscrive
       cercandolo per id (`tl-count`), quindi l'id va passato alla cornice. */
    function _tlDH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
    function _tlCornice(mapName) {
        var DH = _tlDH();
        return DH ? DH.stile({ accento: '#4f46e5', mappa: mapName }) : '';
    }
    function _tlTestata(mapName, now, eventCount) {
        var DH = _tlDH();
        if (!DH) return '';
        return DH.testata(DH.conContesto({
            titolo: mapName, tipo: 'Timeline cronologica', data: now,
            badge: eventCount + ' date', badgeId: 'tl-count'
        }));
    }
    function _tlPieSchermo(mapName) {
        var DH = _tlDH();
        return DH ? DH.pieSchermo({ mappa: mapName }) : '';
    }

    var tlStyles = [
        '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }',
        ':root {',
        '    --pdf-card-padding: 18pt; --pdf-card-border-radius: 8pt;',
        '    --pdf-accent-color: #4f46e5; --pdf-text-primary: #1e293b;',
        '    --pdf-text-secondary: #475569; --pdf-text-muted: #94a3b8;',
        '    --pdf-border: #e2e8f0; --pdf-bg-subtle: #f8fafc;',
        '}',
        // Cornice ALLINEATA agli altri fogli stampabili (quiz, flashcard, sintesi):
        // stessa header card, stesso badge pillola, stesso piè di pagina. Cambia
        // solo il corpo, che è proprio di ogni tipo di documento.
        'body { font-family: "Space Mono", monospace; font-size: 11pt; color: var(--pdf-text-primary); margin: 0; padding: 24px 32px; background: #f8fafc; }',
        // Testata e piè: cornice condivisa (mappai-doc-head.js). Erano quattro
        // regole copiate dal foglio quiz, con i corpi in pt invece che in px.
        _tlCornice(mapName),
        '.tl-container { position: relative; max-width: 960px; margin: 0 auto; padding: 0 16px; }',
        '.tl-container::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--pdf-border); transform: translateX(-50%); }',
        '.tl-event { display: flex; margin-bottom: 40px; position: relative; page-break-inside: avoid; }',
        '.tl-left { flex-direction: row; justify-content: flex-end; padding-right: calc(50% + 36px); }',
        '.tl-right { flex-direction: row-reverse; justify-content: flex-end; padding-left: calc(50% + 36px); }',
        '.tl-connector { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); z-index: 2; }',
        '.tl-dot { width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px #cbd5e1; }',
        '.dossier-card { background: white; border: 1px solid var(--pdf-border); border-radius: var(--pdf-card-border-radius); overflow: hidden; max-width: 420px; width: 100%; }',
        '.tl-card { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }',
        '.dossier-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14pt 18pt 12pt 18pt; }',
        '.dossier-card-header-main { flex: 1; }',
        '.tl-date-label { font-size: 20pt; font-weight: 900; color: rgba(255,255,255,0.95); letter-spacing: -0.02em; line-height: 1; margin-bottom: 6px; }',
        '.dossier-title { font-size: 13pt; font-weight: 700; margin: 0 0 4px 0; color: white; line-height: 1.2; }',
        '.dossier-level-tag { font-size: 9pt; color: rgba(255,255,255,0.75); display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }',
        '.tl-event-num { font-size: 9pt; font-weight: 900; color: rgba(255,255,255,0.5); flex-shrink: 0; align-self: flex-start; }',
        '.dossier-body { padding: 14pt 18pt; }',
        '.dossier-section-label { display: block; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pdf-text-muted); margin-bottom: 8pt; }',
        '.tl-chunk-source { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8pt; border-left: 3pt solid currentColor; padding-left: 8pt; }',
        '.dossier-desc { font-size: 11pt; line-height: 1.7; color: var(--pdf-text-secondary); margin: 0; font-style: italic; }',
        // (il piè a schermo lo disegna .mm-dh-pie della cornice)
        '.tl-card-manual { box-shadow: 0 2px 12px rgba(79,70,229,0.20); }',
        '.tl-gap { border: 2px dashed #cbd5e1 !important; }',
        '.tl-toolbtn { display:inline-flex; align-items:center; gap:5px; border:none; border-radius:8px; padding:7px 14px; cursor:pointer; font-size:12px; font-weight:bold; font-family:inherit; }',
        '.tl-guide { max-width:960px; margin:0 auto 14px; padding:0 4px; font-size:10.5pt; color:#475569; line-height:1.5; }',
        '.tl-guide b { color:#1e293b; }',
        '.tl-addform { max-width:960px; margin:0 auto 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 18px; display:none; }',
        '.tl-addform input, .tl-addform select, .tl-addform textarea { width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:9px 11px; font-family:inherit; font-size:11pt; background:#fff; }',
        '.tl-form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }',
        '.tl-field-label { display:block; font-size:9pt; font-weight:700; color:#64748b; margin-bottom:4px; }',
        '.tl-req { color:#dc2626; } .tl-opt { color:#94a3b8; font-weight:400; }',
        '.tl-ex-banner { max-width:960px; margin:0 auto 18px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:11px 14px; font-size:10pt; color:#4338ca; line-height:1.5; display:none; }',
        '.tl-ex-banner .dash { border-bottom:2px dashed #6366f1; }',
        '@media print { body { background: white; padding: 10mm; } .tl-container::before { background: #cbd5e1; } .dossier-card { box-shadow: none; } .tl-event { page-break-inside: avoid; } .tl-gap { display: none !important; } .no-print { display: none !important; } }'
    ].join('\n');

    // ── 6. Barra stampa ──────────────────────────────────────────────────────

    var catOptions = (window.MappAITimelineCore ? window.MappAITimelineCore.CATEGORY_KEYS
                      : ['Politica', 'Economia', 'Militare', 'Diplomatica', 'Sociale', 'Cultura'])
        .map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

    // Barra fissa (solo azioni) + riga-guida + form + banner esercizio (in flusso,
    // sotto lo spacer \u2192 non coprono pi\u00F9 il titolo della timeline).
    var printBar = '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e2e8f0;padding:9px 20px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px;gap:12px;flex-wrap:wrap;">' +
        '<span style="font-weight:bold;color:#4f46e5;">MappAI \u00b7 Timeline</span>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<button onclick="TL_toggleForm()" class="tl-toolbtn" style="background:#ede9fe;color:#4f46e5;">+ Aggiungi data</button>' +
            '<label class="tl-toolbtn" style="background:#f1f5f9;color:#475569;cursor:pointer;" title="Nasconde le date citate dalla fonte ma non ancora inserite: le ritrovi tu o gli studenti">' +
                '<input type="checkbox" id="tl-exercise-toggle" onchange="TL_refresh()" style="cursor:pointer;accent-color:#4f46e5;margin:0;"> Esercizio' +
            '</label>' +
            '<button onclick="TL_live()" class="tl-toolbtn" style="background:#4f46e5;color:white;" title="Lancia l\'attivit\u00E0 con la classe: gli allievi entrano dal telefono col QR">\u25B6 Attivit\u00E0 con la classe</button>' +
            '<button onclick="window.print()" class="tl-toolbtn" style="background:#f1f5f9;color:#475569;">\uD83D\uDDB8 Stampa</button>' +
            '<button onclick="window.close()" class="tl-toolbtn" style="background:#f1f5f9;color:#475569;">\u2715 Chiudi</button>' +
        '</div></div>' +
        '<div style="height:52px;" class="no-print"></div>' +

        // Riga-guida sempre visibile (il titolo scorre via, questa no)
        '<div class="tl-guide no-print"><b>' + esc(mapName) + '</b> \u00b7 <span id="tl-guide-count">' + eventCount + ' date</span> \u00b7 ' +
            'cronologia della mappa. Aggiungi le date mancanti, oppure lancia l\u2019attivit\u00E0 con la classe.' +
        '</div>' +

        // Banner esercizio (visibile solo quando la modalit\u00E0 \u00E8 attiva)
        '<div class="tl-ex-banner no-print" id="tl-ex-banner">' +
            '\uD83D\uDCA1 <b>Esercizio attivo.</b> Le card <span class="dash">tratteggiate</span> sono anni citati dalla fonte ' +
            'ma non ancora sulla timeline: scrivi l\u2019evento e premi \u201C\u2713 Aggiungi\u201D per completarle.' +
        '</div>' +

        // Form "Nuova data" (in flusso, nascosto di default)
        '<div class="tl-addform" id="tl-addform">' +
            '<div style="font-weight:bold;color:#1e293b;margin-bottom:12px;font-size:11pt;">Nuova data</div>' +
            '<div class="tl-form-grid">' +
                '<div><label class="tl-field-label">Anno <span class="tl-req">*</span></label>' +
                    '<input id="tl-f-anno" type="number" placeholder="es. 1945"></div>' +
                '<div><label class="tl-field-label">Anno fine <span class="tl-opt">(per i periodi)</span></label>' +
                    '<input id="tl-f-fine" type="number" placeholder="es. 1945"></div>' +
                '<div style="grid-column:span 2;"><label class="tl-field-label">Evento <span class="tl-req">*</span></label>' +
                    '<input id="tl-f-ev" type="text" placeholder="Cosa \u00E8 successo?"></div>' +
                '<div><label class="tl-field-label">Categoria</label>' +
                    '<select id="tl-f-cat">' + catOptions + '</select></div>' +
                '<div><label class="tl-field-label">Etichetta <span class="tl-opt">(opz.)</span></label>' +
                    '<input id="tl-f-label" type="text" placeholder="come appare la data"></div>' +
                '<div style="grid-column:1/-1;"><label class="tl-field-label">Contesto / spiegazione <span class="tl-opt">(opz.)</span></label>' +
                    '<textarea id="tl-f-ctx" rows="2" placeholder="una frase per spiegare perch\u00E9 \u00E8 importante" style="resize:vertical;"></textarea></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' +
                '<button onclick="TL_toggleForm()" class="tl-toolbtn" style="background:#f1f5f9;color:#475569;padding:9px 14px;">Annulla</button>' +
                '<button onclick="TL_add()" class="tl-toolbtn" style="background:#4f46e5;color:white;padding:9px 16px;">\u2713 Salva</button>' +
            '</div>' +
        '</div>';

    // ── 7. Documento finale ───────────────────────────────────────────────────

    // Script del popup: editing via window.opener.MappAITimeline (stessa origine).
    // Se l'opener \u00e8 chiuso/navigato, i pulsanti avvisano invece di rompersi.
    var tlScript = '<scr' + 'ipt>\n' +
        'var SHOW_CONTEXT = ' + (showContext ? 'true' : 'false') + ';\n' +
        'function OP(){ return (window.opener && window.opener.MappAITimeline) ? window.opener.MappAITimeline : null; }\n' +
        'function TL_noOp(){ alert("Per modificare le date tieni aperta la finestra principale di MappAI e riapri la timeline dalla mappa."); }\n' +
        'function TL_toggleForm(){ var f=document.getElementById("tl-addform"); if(f){ var open=(f.style.display==="block"); f.style.display=open?"none":"block"; if(!open){ f.scrollIntoView({behavior:"smooth",block:"nearest"}); var a=document.getElementById("tl-f-anno"); if(a) a.focus(); } } }\n' +
        'function TL_live(){ var o=window.opener; if(o && o.MappAITimelineLive && o.MappAITimelineLive.openSetup){ try{ o.focus(); }catch(e){} o.MappAITimelineLive.openSetup(); } else { alert("Per lanciare l\\u2019attivit\\u00e0 con la classe tieni aperta la finestra principale di MappAI (l\\u2019app desktop)."); } }\n' +
        'function TL_refresh(){ var op=OP(); if(!op){ TL_noOp(); return; } var ex=document.getElementById("tl-exercise-toggle").checked; document.getElementById("tl-container").innerHTML=op.mergedEventsHtml({showContext:SHOW_CONTEXT,exercise:ex}); var c=op._lastMergedCount+" date"; if(ex) c+=" \\u00b7 "+op._lastGapCount+" da completare"; var cc=document.getElementById("tl-count"); if(cc) cc.textContent=c; var gc=document.getElementById("tl-guide-count"); if(gc) gc.textContent=c; var bn=document.getElementById("tl-ex-banner"); if(bn) bn.style.display=ex?"block":"none"; }\n' +
        'function TL_val(id){ var el=document.getElementById(id); return el?el.value.trim():""; }\n' +
        'function TL_add(){ var op=OP(); if(!op){ TL_noOp(); return; } var anno=parseInt(TL_val("tl-f-anno")); var ev=TL_val("tl-f-ev"); if(!anno||!ev){ alert("Inserisci almeno Anno ed Evento."); return; } var r=op.add({anno:anno, annoFine:TL_val("tl-f-fine")||null, dataLabel:TL_val("tl-f-label")||String(anno), evento:ev, macroArea:TL_val("tl-f-cat"), contesto:TL_val("tl-f-ctx"), origin:"manual"}); if(r&&r.ok){ ["tl-f-anno","tl-f-fine","tl-f-label","tl-f-ev","tl-f-ctx"].forEach(function(i){ var el=document.getElementById(i); if(el) el.value=""; }); TL_toggleForm(); TL_refresh(); } else { alert((r&&r.error)||"Aggiunta non riuscita."); } }\n' +
        'function TL_del(id){ var op=OP(); if(!op){ TL_noOp(); return; } if(!confirm("Rimuovere questa data?")) return; op.remove(id); TL_refresh(); }\n' +
        'function TL_hint(y){ var h=document.getElementById("gap-hint-"+y); if(h) h.style.display=(h.style.display==="block")?"none":"block"; }\n' +
        'function TL_fillGap(y){ var op=OP(); if(!op){ TL_noOp(); return; } var ev=TL_val("gap-ev-"+y); if(!ev){ alert("Scrivi il nome dell\\u2019evento."); return; } var h=document.getElementById("gap-hint-"+y); op.add({anno:y, dataLabel:String(y), evento:ev, macroArea:TL_val("gap-cat-"+y), contesto:h?h.textContent:"", origin:"student"}); TL_refresh(); }\n' +
        '</scr' + 'ipt>';

    var fullHtml = '<!DOCTYPE html><html lang="it"><head>' +
        '<meta charset="UTF-8">' +
        '<title>Timeline \u2014 ' + esc(mapName) + '</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">' +
        '<style>' + tlStyles + '</style>' +
        '</head><body>' +
        printBar +
        _tlTestata(mapName, now, eventCount) +
        '<div class="tl-container" id="tl-container">' + timelineHtml + '</div>' +
        _tlPieSchermo(mapName) +
        tlScript +
        '</body></html>';

    // ── 8. Apri finestra ─────────────────────────────────────────────────────

    // Archivio documenti (005): timeline riapribile dalla landing Insegna.
    try {
        if (window.MappAIStudyDocs) {
            window.MappAIStudyDocs.save({
                kind: 'timeline',
                title: (window.t ? window.t('ui_create_timeline', 'Timeline') : 'Timeline') + ' \u2014 ' + (mapName || 'Progetto'),
                mapName: mapName || '',
                html: fullHtml
            });
        }
    } catch (e) { /* archivio best-effort */ }

    var win = window.open('', '_blank');
    if (!win) {
        window.showToast('Popup bloccato \u2014 abilita i popup per questo sito', 'warning');
        return;
    }
    win.document.write(fullHtml);
    win.document.close();
    window.showToast('\u2713 Timeline aperta \u2014 ' + eventCount + ' eventi', 'success');
};

console.log('[MappAI] mappai-timeline.js caricato \u2713');
