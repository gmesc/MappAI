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

    var modal = document.createElement('div');
    modal.id = 'timeline-generator-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.8);backdrop-filter:blur(4px);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;';

    var tokenNote = estimatedTokens > 40000
        ? '<br><span style="color:#d97706;">\u26a0\ufe0f Testo lungo \u2014 usa Gemma 4 per migliori risultati</span>'
        : '<br><span style="color:#059669;">\u2713 Dimensione ottimale per tutti i modelli</span>';

    modal.innerHTML = '<div style="background:white;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);font-family:\'Space Mono\',monospace;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">' +
            '<div style="width:36px;height:36px;background:#fef3c7;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">\uD83D\uDCC5</div>' +
            '<div>' +
                '<div style="font-size:15px;font-weight:900;color:#1e293b;">Crea Timeline</div>' +
                '<div style="font-size:10px;color:#64748b;">' + mapName + '</div>' +
            '</div>' +
        '</div>' +
        '<p style="font-size:11px;color:#475569;line-height:1.6;margin-bottom:16px;">' +
            'L\'AI analizzer\u00e0 il contenuto della mappa ed estrarr\u00e0 tutti gli eventi datati con il loro significato storico preciso.<br><br>' +
            '<strong>Testo da analizzare:</strong> ~' + estimatedTokens.toLocaleString('it') + ' token' + tokenNote +
        '</p>' +
        '<div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px;border:1px solid #e2e8f0;">' +
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:10px;">Cosa includere nella timeline</div>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-size:11px;color:#1e293b;">' +
                '<input type="checkbox" id="tl-opt-dates" checked style="accent-color:#f59e0b;"> \uD83D\uDCC5 Date e anni precisi' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-size:11px;color:#1e293b;">' +
                '<input type="checkbox" id="tl-opt-events" checked style="accent-color:#f59e0b;"> \u26a1 Eventi storici, politici, militari' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-size:11px;color:#1e293b;">' +
                '<input type="checkbox" id="tl-opt-people" style="accent-color:#f59e0b;"> \uD83D\uDC64 Personaggi citati con data' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:#1e293b;">' +
                '<input type="checkbox" id="tl-opt-context" checked style="accent-color:#f59e0b;"> \uD83D\uDCD6 Contesto dalla fonte originale' +
            '</label>' +
        '</div>' +
        '<div style="display:flex;gap:10px;">' +
            '<button type="button" onclick="document.getElementById(\'timeline-generator-modal\').remove()" ' +
                'style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">' +
                'Annulla' +
            '</button>' +
            '<button type="button" onclick="window.generateTimelineWithAI()" ' +
                'style="flex:2;padding:10px;border:none;border-radius:10px;background:#f59e0b;color:white;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">' +
                '\uD83D\uDE80 Genera Timeline' +
            '</button>' +
        '</div>' +
    '</div>';

    document.body.appendChild(modal);

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
    var opts = {
        dates:   document.getElementById('tl-opt-dates')?.checked   ?? true,
        events:  document.getElementById('tl-opt-events')?.checked  ?? true,
        people:  document.getElementById('tl-opt-people')?.checked  ?? false,
        context: document.getElementById('tl-opt-context')?.checked ?? true
    };

    if (modal) modal.remove();

    window.showLoadingOverlay(true, 'Generazione timeline in corso\u2026');

    try {
        // ── 1. Leggi apiKey con guard completo ─────────────────────────────────
        var apiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (!apiKey) {
            window.showLoadingOverlay(false);
            window.showToast("Inserisci un'API Key per continuare", 'error');
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
        var includeList = [];
        if (opts.dates)  includeList.push('date e anni precisi');
        if (opts.events) includeList.push('eventi storici, politici, militari ed economici');
        if (opts.people) includeList.push('personaggi storici citati con data');

        var contextInstruction = opts.context
            ? 'frase dal testo che spiega perch\u00e9 quella data \u00e8 importante (max 100 caratteri)'
            : 'stringa vuota';

        var userPrompt =
            'Analizza questo testo e estrai TUTTI gli eventi con una data precisa.\n' +
            'IMPORTANTE: il testo contiene MOLTE date — estraile TUTTE senza eccezioni, ' +
            'non fermarti alle prime. Ogni anno/data che compare nel testo deve diventare ' +
            'un evento. Non riassumere, non selezionare: sii esaustivo.\n\n' +
            'Includi: ' + includeList.join(', ') + '.\n\n' +
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
        var response;
        try {
            response = await window.fetchModelAPI(payload, apiKey);
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

        // ── 7. Apri timeline ────────────────────────────────────────────────────
        window.openTimelineView(timelineData, mapName);

    } catch (err) {
        window.showLoadingOverlay(false);
        console.error('[Timeline] Errore:', err);
        window.showToast('Errore generazione timeline: ' + (err.message || err), 'error');
    }
};


// ── TIMELINE VIEW (da sourcesDict) ───────────────────────────────────────────
window.openTimelineView = function (aiTimelineData, mapNameOverride) {

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
        window._renderTimeline(uniqueEventsAI, mapNameAI);
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

    window._renderTimeline(uniqueEvents, mapName);
};

// ── RENDER TIMELINE HTML (condiviso tra path AI e statico) ────────────────────
window._renderTimeline = function (uniqueEvents, mapName) {
    var now = new Date().toLocaleString('it-IT');

    // Funzioni helper locali
    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function formatDateLabel(event) {
        if (event.type === 'full')    return event.raw;
        if (event.type === 'range')   return event.raw;
        if (event.type === 'century') return event.century + ' sec.';
        return String(event.year);
    }
    function highlightDate(context, dateRaw) {
        var escaped = dateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return context.replace(
            new RegExp(escaped, 'gi'),
            '<strong style="color:#1e293b;background:#fef9c3;padding:1px 2px;border-radius:2px;font-style:normal;">$&</strong>'
        );
    }

    var isLeft = true;
    var timelineHtml = '';

    uniqueEvents.forEach(function (e, idx) {
        var side = isLeft ? 'left' : 'right';
        isLeft = !isLeft;

        var dateLabel          = formatDateLabel(e);
        var contextHighlighted = highlightDate(esc(e.chunkText), esc(e.raw));
        var numLabel           = String(idx + 1).padStart(2, '0');

        timelineHtml += '<div class="tl-event tl-' + side + '">' +
            '<div class="tl-connector">' +
                '<div class="tl-dot" style="background:' + e.macroColor + ';"></div>' +
            '</div>' +
            '<div class="dossier-card tl-card">' +
                '<div class="dossier-card-header" style="background:' + e.macroColor + ';color:white;">' +
                    '<div class="dossier-card-header-main">' +
                        '<div class="tl-date-label">' + esc(dateLabel) + '</div>' +
                        '<h2 class="dossier-title">' + esc(e.nodeLabel) + '</h2>' +
                        '<span class="dossier-level-tag">' + esc(e.macroLabel) + '</span>' +
                    '</div>' +
                    '<div class="tl-event-num">' + numLabel + '</div>' +
                '</div>' +
                '<div class="dossier-body">' +
                    '<span class="dossier-section-label">CONTESTO DALLA FONTE</span>' +
                    '<div class="tl-chunk-source" style="color:' + e.macroColor + ';">' +
                        '▌ ' + esc(e.chunkTitle) + ' — <em>' + esc(e.chunkSource) + '</em>' +
                    '</div>' +
                    '<p class="dossier-desc tl-context-text">&ldquo;' + contextHighlighted + '&rdquo;</p>' +
                '</div>' +
            '</div>' +
        '</div>';
    });

    // ── 5. CSS stile dossier + layout timeline ───────────────────────────────

    var tlStyles = [
        '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }',
        ':root {',
        '    --pdf-card-padding: 18pt; --pdf-card-border-radius: 8pt;',
        '    --pdf-accent-color: #4f46e5; --pdf-text-primary: #1e293b;',
        '    --pdf-text-secondary: #475569; --pdf-text-muted: #94a3b8;',
        '    --pdf-border: #e2e8f0; --pdf-bg-subtle: #f8fafc;',
        '}',
        'body { font-family: "Space Mono", monospace; font-size: 11pt; color: var(--pdf-text-primary); margin: 0; padding: 24px 32px; background: #f8fafc; }',
        '.tl-header { text-align: center; padding: 32px 16px 24px; background: white; border-radius: 16px; margin-bottom: 32px; border-bottom: 3px solid var(--pdf-accent-color); }',
        '.tl-title { font-size: 22pt; font-weight: 900; color: var(--pdf-text-primary); margin-bottom: 4px; }',
        '.tl-subtitle { font-size: 10pt; color: var(--pdf-text-muted); }',
        '.tl-count { display: inline-block; margin-top: 8px; background: #ede9fe; color: var(--pdf-accent-color); border-radius: 999px; padding: 3px 14px; font-size: 10pt; font-weight: 700; }',
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
        '.tl-footer { text-align: center; margin-top: 40px; font-size: 9pt; color: var(--pdf-text-muted); border-top: 1px solid var(--pdf-border); padding-top: 16px; }',
        '@media print { body { background: white; padding: 10mm; } .tl-container::before { background: #cbd5e1; } .dossier-card { box-shadow: none; } .tl-event { page-break-inside: avoid; } .no-print { display: none !important; } }'
    ].join('\n');

    // ── 6. Barra stampa ──────────────────────────────────────────────────────

    var printBar = '<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e2e8f0;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;font-family:monospace;font-size:12px;">' +
        '<span style="font-weight:bold;color:#4f46e5;">MappAI \u00b7 Timeline</span>' +
        '<div style="display:flex;gap:8px;">' +
            '<button onclick="window.print()" style="background:#4f46e5;color:white;border:none;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:bold;">\uD83D\uDDB8 Stampa / Esporta PDF</button>' +
            '<button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;">\u2715 Chiudi</button>' +
        '</div></div>' +
        '<div style="height:52px;" class="no-print"></div>';

    // ── 7. Documento finale ───────────────────────────────────────────────────

    var fullHtml = '<!DOCTYPE html><html lang="it"><head>' +
        '<meta charset="UTF-8">' +
        '<title>Timeline \u2014 ' + esc(mapName) + '</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">' +
        '<style>' + tlStyles + '</style>' +
        '</head><body>' +
        printBar +
        '<div class="tl-header">' +
            '<div class="tl-title">' + esc(mapName) + '</div>' +
            '<div class="tl-subtitle">Timeline cronologica \u00b7 ' + esc(now) + '</div>' +
            '<div class="tl-count">' + uniqueEvents.length + ' eventi datati dalle fonti originali</div>' +
        '</div>' +
        '<div class="tl-container">' + timelineHtml + '</div>' +
        '<div class="tl-footer">MappAI by insegnai.ch</div>' +
        '</body></html>';

    // ── 8. Apri finestra ─────────────────────────────────────────────────────

    var win = window.open('', '_blank');
    if (!win) {
        window.showToast('Popup bloccato \u2014 abilita i popup per questo sito', 'warning');
        return;
    }
    win.document.write(fullHtml);
    win.document.close();
    window.showToast('\u2713 Timeline aperta \u2014 ' + uniqueEvents.length + ' eventi', 'success');
};

console.log('[MappAI] mappai-timeline.js caricato \u2713');
