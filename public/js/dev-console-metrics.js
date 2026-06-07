/**
 * dev-console-metrics.js — MappAI Graph Metrics Toolkit
 *
 * Caricato automaticamente da index.html (dopo mappai-structure-analyzer.js).
 * Dopo ogni generazione completa le metriche vengono stampate automaticamente
 * in console e salvate in localStorage — basta aprire i DevTools per vederle.
 *
 * UTILIZZO RAPIDO
 *   MappAIMetrics.snapshot()          → report completo
 *   MappAIMetrics.table()             → tabella compatta (una riga)
 *   MappAIMetrics.truncations()       → affidabilità API: chiamate / troncate
 *   MappAIMetrics.compare('label')    → payload JSON + copia in clipboard
 *   MappAIMetrics.diff(a, b)          → delta numerico tra due snapshot
 *
 * PERSISTENZA
 *   MappAIMetrics.save('label')       → salva snapshot in localStorage
 *   MappAIMetrics.load('label')       → carica snapshot (senza label → ultimo)
 *   MappAIMetrics.loadLast()          → ultimo snapshot auto-salvato
 *   MappAIMetrics.list()              → vedi tutti gli snapshot
 *   MappAIMetrics.remove('label')     → rimuove uno snapshot
 *   MappAIMetrics.clearAll()          → svuota tutto
 */

(function () {
    'use strict';

    // ── Helpers interni ──────────────────────────────────────────────────────

    // appState è dichiarato con 'let' in app.js → NON è su window.
    // Usiamo il bare name (condiviso tra script della stessa pagina) con
    // fallback su window per compatibilità con eventuali contesti diversi.
    function _getAppState() {
        /* eslint-disable no-undef */
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
        /* eslint-enable no-undef */
    }

    function _state() {
        const s = _getAppState();
        if (!s || !s.db) throw new Error('[MappAIMetrics] appState.db non disponibile — mappa caricata?');
        return s;
    }

    function _nodes() { return _state().db.nodes || []; }
    function _links() { return _state().db.links || []; }

    function _linkId(l) {
        return {
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target
        };
    }

    function _adj(nodes, links) {
        const adj = new Map();
        nodes.forEach(n => adj.set(n.id, new Set()));
        links.forEach(l => {
            const { source: s, target: t } = _linkId(l);
            if (adj.has(s) && adj.has(t) && s !== t) {
                adj.get(s).add(t);
                adj.get(t).add(s);
            }
        });
        return adj;
    }

    function _stddev(values) {
        if (!values.length) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    }

    function _pct(n, total) { return total ? (n / total * 100).toFixed(1) + '%' : '0%'; }

    function _modelKey(provider) {
        return provider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
    }

    // Restituisce il modello REALMENTE USATO per generare la mappa corrente.
    // Priorità (dall'alto verso il basso):
    //   1) appState.generationUsage.usedModel  ← impostato a inizio generazione,
    //      persistito nel vault, ripristinato al caricamento → fonte autoritativa
    //   2) localStorage del select corrente   ← FALLBACK fragile: riflette lo stato
    //      del select, non la generazione. Usato solo per vault legacy.
    function _resolveModel(state) {
        const used = state?.generationUsage?.usedModel;
        if (used && used.trim()) return used;
        return localStorage.getItem(_modelKey(state?.aiProvider)) || 'N/A';
    }

    // Restituisce il provider USATO per generare la mappa corrente.
    // Priorità: usedProvider → fallback su aiProvider attuale, oppure dedotto
    // dal nome del modello (mappe vecchie salvate prima di Strategia 0).
    function _resolveProvider(state) {
        if (state?.generationUsage?.usedProvider) return state.generationUsage.usedProvider;
        const used = state?.generationUsage?.usedModel || '';
        if (used) {
            if (/^gemini/i.test(used)) return 'google';
            if (used.includes('/')) return 'infomaniak'; // mistralai/..., google/gemma-...
        }
        return state?.aiProvider || 'N/A';
    }

    // ── Log capture per report unificato ──────────────────────────────────────
    //
    // Hook su console.log/warn/error che cattura i log con pattern rilevanti
    // (Phase 1.5 / 4 / 5, JSONL, troncamenti, dedup, errori rami) in un buffer
    // capped. Il buffer viene azzerato all'inizio di ogni nuova generazione
    // (hook su MappAITruncationTracker.reset).
    //
    // Espone MappAIMetrics.report() che produce un Markdown unificato con
    // tutto il contesto + lo copia in clipboard. Workflow: 1 comando, 1 paste.

    const _LOG_PATTERNS = [
        /\[Phase\s*[\d.]+\]/i,
        /\[Phase4\]/, /\[Phase5\]/,
        /\[JSONL\]/, /\[MappAI/,
        /Troncamento rilevato/,
        /Errore nel ramo/,
        /Parse fallito/,
        /Dedup:/, /Rimossi/,
        /BRANCH BOUNDARIES/, /JSONL/, /PHASE/,
        // Pattern di dettaglio per le operazioni Phase 4 / Phase 5
        /Operazioni applicate/i,
        /Operazione applicata/i,
        /\bfrom['":]?\s*L\d/i,    // operazioni di spostamento Phase 5 (es. "L1_3 → L1_2")
        /MERGES?:/i,
        /CROSSLINKS?:/i
    ];
    const _LOG_BUFFER_CAP = 1000;
    let _logBuffer = [];
    let _consoleHooked = false;

    // Pattern di stringhe CSS-stile passate a console.log come argomenti separati
    // dopo un placeholder %c. Esempi: "color:green;font-weight:bold", "color:#10b981".
    // Identifico l'argomento come stile se INIZIA con una proprietà CSS nota → skip.
    const _CSS_STYLE_RE = /^\s*(?:color|font-weight|font-size|font-style|background(?:-color)?|padding|margin|border|display|text-decoration)\s*:/i;

    function _captureLog(level, args) {
        try {
            const parts = [];
            for (let i = 0; i < args.length; i++) {
                const a = args[i];
                // Salta gli argomenti che sono solo stringhe-stile CSS
                if (typeof a === 'string' && _CSS_STYLE_RE.test(a)) continue;
                if (typeof a === 'string') parts.push(a);
                else { try { parts.push(JSON.stringify(a)); } catch { parts.push(String(a)); } }
            }
            // Rimuovi i placeholder %c dal testo finale
            const clean = parts.join(' ').replace(/%c/g, '').replace(/\s+/g, ' ').trim();
            if (_LOG_PATTERNS.some(p => p.test(clean))) {
                _logBuffer.push({ ts: Date.now(), level, content: clean.slice(0, 1500) });
                if (_logBuffer.length > _LOG_BUFFER_CAP) _logBuffer.shift();
            }
        } catch (e) { /* mai fail dentro un hook console */ }
    }

    function _hookConsole() {
        if (_consoleHooked) return;
        const orig = { log: console.log, warn: console.warn, error: console.error };
        console.log   = function (...a) { _captureLog('log',   a); orig.log.apply(console, a);   };
        console.warn  = function (...a) { _captureLog('warn',  a); orig.warn.apply(console, a);  };
        console.error = function (...a) { _captureLog('error', a); orig.error.apply(console, a); };
        _consoleHooked = true;
    }

    function _hookGenerationReset() {
        const tracker = window.MappAITruncationTracker;
        if (!tracker || tracker._hookedForLogReset) return;
        const origReset = tracker.reset.bind(tracker);
        tracker.reset = function () {
            _logBuffer = [];
            return origReset();
        };
        tracker._hookedForLogReset = true;
    }

    _hookConsole();
    // Aspetta che app.js abbia creato il tracker prima di hookarlo
    setTimeout(_hookGenerationReset, 800);
    setTimeout(_hookGenerationReset, 3000); // retry safety

    function clearLogs() {
        _logBuffer = [];
        console.log('%c🗑 Log buffer svuotato', 'color:orange');
    }

    function logsBuffer() {
        return _logBuffer.slice();
    }

    // ── Report unificato ──────────────────────────────────────────────────────

    function report(options = {}) {
        const { save = true } = options;
        const state = _getAppState();
        const nodes = state?.db?.nodes || [];
        const links = state?.db?.links || [];

        if (!nodes.length) {
            console.warn('[Report] Nessuna mappa caricata');
            return null;
        }

        // 1. Snapshot metriche
        const snapshot = _buildPayload('report_' + new Date().toISOString().slice(0, 19));

        // 2. L1 finali
        const l1s = nodes.filter(n => n.level === 1).map(n => n.label);

        // 3. L2 per ramo
        const getId = l => ({
            src: typeof l.source === 'object' ? l.source.id : l.source,
            tgt: typeof l.target === 'object' ? l.target.id : l.target
        });
        const l2ByL1 = {};
        nodes.filter(n => n.level === 1).forEach(l1 => {
            const childIds = new Set(links.filter(l => getId(l).src === l1.id).map(l => getId(l).tgt));
            const l2s = nodes.filter(n => n.level === 2 && childIds.has(n.id)).map(n => n.label);
            l2ByL1[l1.label] = l2s;
        });

        // 4. Suggerimenti per tipo
        const sa = window.MappAIStructureAnalyzer?.analyzeCurrentMap();
        const sugByType = (sa?.suggestions || []).reduce((a, s) => { a[s.type] = (a[s.type] || 0) + 1; return a; }, {});

        // 5. Flag attivi
        const flagsMap = {
            jsonl:            localStorage.getItem('mappai_jsonl_enabled') === '1',
            l1Validation:     localStorage.getItem('mappai_l1_validation_enabled') === '1',
            branchBoundaries: localStorage.getItem('mappai_branch_boundaries_enabled') === '1',
            phase4:           localStorage.getItem('mappai_mm_phase4_enabled') === '1',
            phase5:           localStorage.getItem('mappai_mm_phase5_enabled') === '1',
            chunkFreeze:      localStorage.getItem('mappai_freeze_chunks') === '1',
            enrichDescs:      localStorage.getItem('mappai_enrich_descs_enabled') === '1'
        };
        const activeFlags = Object.entries(flagsMap).filter(([_, v]) => v).map(([k]) => k);
        const flagsStr = activeFlags.length ? activeFlags.join(' ✓ | ') + ' ✓' : '(nessun flag attivo)';

        // 6. Truncations summary
        const trunc = window.MappAITruncationTracker?.summary(true) || { calls: 0, truncated: 0, truncationRate: 0 };

        const md = [
            `# MappAI Generation Report — ${new Date().toLocaleString()}`,
            '',
            `**Topic:** ${snapshot.topic || 'N/A'} | **Model:** ${snapshot.model || 'N/A'} | **Mode:** ${snapshot.mode || 'N/A'}`,
            `**Flags:** ${flagsStr}`,
            '',
            '## Compact metrics',
            '```',
            `nodes: ${snapshot.nodes}    links: ${snapshot.links}    density: ${snapshot.density}    topology: ${snapshot.topology}`,
            `crossLinks: ${snapshot.crossLinks} (${(snapshot.crossRatio * 100).toFixed(1)}%)    relTypes: ${snapshot.relTypes}    generic: ${(snapshot.genericRatio * 100).toFixed(1)}%`,
            `avgDegree: ${snapshot.avgDegree}    maxDegree: ${snapshot.maxDegree}    stddev: ${snapshot.stddevDegree}`,
            `groups: ${snapshot.groups}    maxLevel: ${snapshot.maxLevel}    sourceCov: ${(snapshot.sourceCovRatio * 100).toFixed(1)}%`,
            `apiCalls: ${trunc.calls}    truncated: ${trunc.truncated} (${(trunc.truncationRate * 100).toFixed(1)}%)`,
            '```',
            '',
            `## L1 finali (${l1s.length})`,
            ...l1s.map(l => `- ${l}`),
            '',
            '## L2 per ramo',
            ...Object.entries(l2ByL1).map(([l1, l2s]) =>
                `- **${l1}** (${l2s.length}): ${l2s.length ? l2s.join(', ') : '_(nessun L2)_'}`
            ),
            '',
            '## Suggerimenti strutturali per tipo',
            '```',
            ...Object.entries(sugByType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}: ${c}`),
            '```',
            '',
            `## Log generazione (${_logBuffer.length} eventi catturati)`,
            '```',
            ..._logBuffer.map(e => {
                const t = new Date(e.ts).toLocaleTimeString();
                const prefix = e.level === 'warn' ? '⚠️ ' : e.level === 'error' ? '❌ ' : '  ';
                return `[${t}] ${prefix}${e.content}`;
            }),
            '```',
            ''
        ].join('\n');

        if (save && navigator.clipboard) {
            navigator.clipboard.writeText(md).then(
                () => console.log(`%c📋 Report copiato in clipboard (${md.length} chars, ${_logBuffer.length} log)`, 'color:green;font-weight:bold'),
                () => { console.log('Clipboard fallita. Report:\n\n' + md); }
            );
        }

        console.log('%c── REPORT GENERATO ──', 'color:#6366f1;font-weight:bold');
        console.log(`Caratteri: ${md.length} | Log: ${_logBuffer.length} | Suggerimenti: ${sa?.suggestions?.length || 0}`);

        return { md, snapshot, l1s, l2ByL1, sugByType, flags: flagsMap, trunc, logs: _logBuffer.slice() };
    }

    // ── Core: costruisce il payload metriche (senza side-effect) ─────────────

    function _buildPayload(label) {
        const s = _state();
        const nodes = _nodes(), links = _links();
        const adj = _adj(nodes, links);
        const degrees = nodes.map(n => adj.get(n.id)?.size || 0);
        const mean = degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
        const cross = links.filter(l => l.isCross === true).length;
        const sd = s.db.sourcesDict || {};
        const withSrc = nodes.filter(n => sd[n.id] && sd[n.id].length).length;
        const density = nodes.length ? links.length / nodes.length : 0;
        const relFreq = {};
        links.forEach(l => { const r = l.rel || '(nessuna)'; relFreq[r] = (relFreq[r] || 0) + 1; });
        const genericLinks = links.filter(l => (l.rel || '').toLowerCase().includes('correlat')).length;
        const structural = window.MappAIStructureAnalyzer?.analyzeCurrentMap()?.stats || {};
        const trunc = window.MappAITruncationTracker?.summary(true) || { calls: 0, truncated: 0, truncationRate: 0 };

        return {
            label:          label || new Date().toISOString().slice(0, 19),
            provider:       _resolveProvider(s),
            model:          _resolveModel(s),
            mode:           s.extractionMode,
            topic:          s.rootNodeLabel,
            ts:             Date.now(),
            nodes:          nodes.length,
            links:          links.length,
            density:        Number(density.toFixed(3)),
            topology:       structural.topology || (density < 1.1 ? 'tree-like' : 'networked'),
            crossLinks:     cross,
            crossRatio:     Number((cross / (links.length || 1)).toFixed(3)),
            relTypes:       Object.keys(relFreq).length,
            genericLinks:   genericLinks,
            genericRatio:   Number((genericLinks / (links.length || 1)).toFixed(3)),
            relFreq,
            avgDegree:      Number(mean.toFixed(3)),
            maxDegree:      Math.max(0, ...degrees),
            stddevDegree:   Number(_stddev(degrees).toFixed(3)),
            groups:         new Set(nodes.map(n => n.group).filter(Boolean)).size,
            maxLevel:       Math.max(0, ...nodes.map(n => n.level ?? 0)),
            sourceCovRatio: Number((withSrc / (nodes.length || 1)).toFixed(3)),
            // Strategia 0 — flag di affidabilità della generazione
            apiCalls:        trunc.calls,
            truncatedCalls:  trunc.truncated,
            truncationRate:  trunc.truncationRate,
            structural
        };
    }

    // ── 1. BASIC ─────────────────────────────────────────────────────────────

    function basic() {
        const nodes = _nodes(), links = _links();
        const s = _state();
        const density = nodes.length ? (links.length / nodes.length).toFixed(3) : 0;
        const result = {
            provider:  _resolveProvider(s),
            model:     _resolveModel(s),
            topic:     s.rootNodeLabel || 'N/A',
            mode:      s.extractionMode || 'N/A',
            nodes:     nodes.length,
            links:     links.length,
            density:   Number(density),
            topology:  density < 1.1 ? 'tree-like' : 'networked',
            groups:    new Set(nodes.map(n => n.group).filter(Boolean)).size,
            maxLevel:  Math.max(0, ...nodes.map(n => n.level ?? 0))
        };
        console.log('%c── BASIC METRICS ──', 'color:#6366f1;font-weight:bold');
        console.table(result);
        return result;
    }

    // ── 2. RELATIONS ─────────────────────────────────────────────────────────

    function relations() {
        const links = _links();
        const freq = {};
        links.forEach(l => { const r = l.rel || '(nessuna)'; freq[r] = (freq[r] || 0) + 1; });
        const total = links.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([rel, count]) => ({ rel, count, pct: _pct(count, total) }));
        console.log('%c── RELATION TYPES ──', 'color:#6366f1;font-weight:bold');
        console.log(`Tipi unici: ${rows.length} | Link totali: ${total}`);
        console.table(rows);
        return { total, types: rows.length, rows };
    }

    // ── 3. CROSSLINKS ─────────────────────────────────────────────────────────

    function crosslinks() {
        const links = _links();
        const cross = links.filter(l => l.isCross === true).length;
        const hier  = links.length - cross;
        const ratio = cross / (links.length || 1);
        const result = {
            total:        links.length,
            hierarchical: hier,
            crossLink:    cross,
            crossRatio:   _pct(cross, links.length),
            quality:      ratio >= 0.3 ? '✅ buono' : ratio >= 0.15 ? '⚠️ mediocre' : '🔴 scarso'
        };
        console.log('%c── CROSSLINKS (KG quality) ──', 'color:#6366f1;font-weight:bold');
        console.table(result);
        return result;
    }

    // ── 4. LEVELS ─────────────────────────────────────────────────────────────

    function levels() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => { const lv = n.level ?? 0; freq[lv] = (freq[lv] || 0) + 1; });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([level, count]) => ({ level: `L${level}`, count, pct: _pct(count, total) }));
        console.log('%c── LEVEL DISTRIBUTION ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 5. GROUPS ─────────────────────────────────────────────────────────────

    function groups() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => { const g = n.group || '(nessun gruppo)'; freq[g] = (freq[g] || 0) + 1; });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([group, count]) => ({ group, count, pct: _pct(count, total) }));
        console.log('%c── GROUP DISTRIBUTION ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 6. DEGREE ─────────────────────────────────────────────────────────────

    function degree() {
        const nodes = _nodes(), links = _links();
        const adj = _adj(nodes, links);
        const degrees = nodes.map(n => ({ label: n.label, degree: adj.get(n.id)?.size || 0 }));
        const vals = degrees.map(d => d.degree);
        const sorted = [...vals].sort((a, b) => a - b);
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const buckets = { '0': 0, '1': 0, '2-3': 0, '4-6': 0, '7-10': 0, '11+': 0 };
        vals.forEach(v => {
            if (v === 0) buckets['0']++;
            else if (v === 1) buckets['1']++;
            else if (v <= 3) buckets['2-3']++;
            else if (v <= 6) buckets['4-6']++;
            else if (v <= 10) buckets['7-10']++;
            else buckets['11+']++;
        });
        const stats = {
            min:    sorted[0] ?? 0,
            p25:    sorted[Math.floor(sorted.length * 0.25)] ?? 0,
            median: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
            p75:    sorted[Math.floor(sorted.length * 0.75)] ?? 0,
            max:    sorted[sorted.length - 1] ?? 0,
            mean:   Number(mean.toFixed(2)),
            stddev: Number(_stddev(vals).toFixed(2))
        };
        console.log('%c── DEGREE DISTRIBUTION ──', 'color:#6366f1;font-weight:bold');
        console.log('Statistiche:', stats);
        console.log('Bucket:', buckets);
        console.log('Top-10 hub (per degree):');
        console.table(degrees.sort((a, b) => b.degree - a.degree).slice(0, 10));
        return { stats, buckets, top10: degrees.slice(0, 10) };
    }

    // ── 7. BETWEENNESS ────────────────────────────────────────────────────────

    function betweenness() {
        const nodes = _nodes(), links = _links();
        if (!nodes.length) { console.warn('Nessun nodo'); return []; }
        if (!window.MappAIStructureAnalyzer?.computeBetweenness) {
            console.warn('[MappAIMetrics] MappAIStructureAnalyzer non disponibile');
            return [];
        }
        const ranked = window.MappAIStructureAnalyzer.computeBetweenness(nodes, links);
        const adj = _adj(nodes, links);
        const nMap = new Map(nodes.map(n => [n.id, n]));
        const maxScore = ranked[0]?.score || 1;
        const rows = ranked
            .filter(r => r.score > 0)
            .slice(0, 10)
            .map(r => ({
                label:       nMap.get(r.id)?.label || r.id,
                betweenness: Number(r.score.toFixed(2)),
                normalised:  Number((r.score / maxScore).toFixed(3)),
                degree:      adj.get(r.id)?.size || 0,
                level:       nMap.get(r.id)?.level ?? '?',
                'hidden-hub': (adj.get(r.id)?.size || 0) <= 3 && r.score >= maxScore * 0.5 ? '⚠️' : ''
            }));
        console.log('%c── BETWEENNESS CENTRALITY top-10 ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 8. SOURCES ────────────────────────────────────────────────────────────

    function sources() {
        const nodes = _nodes();
        const sd = _state().db.sourcesDict || {};
        let withSrc = 0, withChunks = 0;
        nodes.forEach(n => {
            if (sd[n.id] && sd[n.id].length) withSrc++;
            if (n.chunks && n.chunks.length) withChunks++;
        });
        const result = {
            total:       nodes.length,
            withSource:  withSrc,
            withChunks:  withChunks,
            sourceRatio: _pct(withSrc, nodes.length),
            chunksRatio: _pct(withChunks, nodes.length)
        };
        console.log('%c── SOURCES COVERAGE ──', 'color:#6366f1;font-weight:bold');
        console.table(result);
        return result;
    }

    // ── 9. STUDY STATUS ───────────────────────────────────────────────────────

    function studyStatus() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => { const st = n.studyStatus || 'none'; freq[st] = (freq[st] || 0) + 1; });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => ({ status, count, pct: _pct(count, total) }));
        console.log('%c── STUDY STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 10. STRUCTURAL ────────────────────────────────────────────────────────

    function structural() {
        if (!window.MappAIStructureAnalyzer) {
            console.warn('[MappAIMetrics] MappAIStructureAnalyzer non disponibile');
            return null;
        }
        const result = window.MappAIStructureAnalyzer.analyzeCurrentMap();
        const { suggestions, stats } = result;
        const bySeverity = { high: 0, medium: 0, low: 0 };
        const byType = {};
        suggestions.forEach(s => {
            bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
            byType[s.type] = (byType[s.type] || 0) + 1;
        });
        console.log('%c── STRUCTURAL ANALYSIS ──', 'color:#6366f1;font-weight:bold');
        console.log('Stats:', stats);
        console.log(`Suggerimenti: ${suggestions.length} totali →`, bySeverity);
        console.log('Per tipo:', byType);
        const high = suggestions.filter(s => s.severity === 'high');
        if (high.length) {
            console.table(high.map(s => ({ type: s.type, message: s.message.slice(0, 90) + '…' })));
        }
        return result;
    }

    // ── 10b. TRUNCATIONS — affidabilità della generazione (Strategia 0) ─────
    //
    // Espone i dati del MappAITruncationTracker: chiamate API totali,
    // troncate (finishReason=MAX_TOKENS / length), tasso, breakdown per modello.
    // Quando truncationRate > 0 il grafo finale è INCOMPLETO rispetto a quanto
    // il modello stava generando: i nodi mancanti sono stati TAGLIATI dal
    // limite di output, non dimenticati dal modello.

    function truncations(includeAllSessions = false) {
        const t = window.MappAITruncationTracker;
        if (!t) { console.warn('[MappAIMetrics] tracker troncamenti non disponibile'); return null; }
        const src = includeAllSessions ? [...t.events, ...t.currentRun] : t.currentRun;
        const summary = t.summary(!includeAllSessions);

        console.log('%c── TRUNCATIONS (Strategia 0) ──', 'color:#6366f1;font-weight:bold');
        console.log(
            `Generazione corrente: ${summary.calls} chiamate API · ` +
            `%c${summary.truncated} troncate%c (${(summary.truncationRate * 100).toFixed(1)}%)`,
            summary.truncated > 0 ? 'color:orange;font-weight:bold' : 'color:green;font-weight:bold',
            ''
        );

        if (Object.keys(summary.byModel).length) {
            console.log('Per modello:');
            console.table(
                Object.entries(summary.byModel).map(([model, st]) => ({
                    model,
                    calls: st.calls,
                    truncated: st.truncated,
                    rate: (st.truncated / st.calls * 100).toFixed(1) + '%'
                }))
            );
        }

        const truncated = src.filter(e => e.truncated);
        if (truncated.length) {
            console.log('Dettaglio chiamate troncate:');
            console.table(truncated.map(e => ({
                ts: new Date(e.ts).toLocaleTimeString(),
                model: e.model,
                finishReason: e.finishReason,
                requestedMax: e.requestedMax,
                outputTokens: e.candidateTokens,
                utilizzo: e.requestedMax ? ((e.candidateTokens / e.requestedMax) * 100).toFixed(1) + '%' : 'N/A'
            })));
        } else if (summary.calls > 0) {
            console.log('%c✅ Nessun troncamento — generazione integra', 'color:green');
        }

        return summary;
    }

    // ── 11. SNAPSHOT ──────────────────────────────────────────────────────────

    function snapshot() {
        console.log('%c══════════════════════════════════════════════', 'color:#818cf8;font-weight:bold');
        console.log('%c  MappAI Graph Metrics Snapshot', 'color:#818cf8;font-size:14px;font-weight:bold');
        console.log('%c══════════════════════════════════════════════', 'color:#818cf8;font-weight:bold');
        const b  = basic();
        const cx = crosslinks();
        const r  = relations();
        const d  = degree();
        const g  = groups();
        const lv = levels();
        const s  = sources();
        const ss = studyStatus();
        const bt = betweenness();
        structural();
        const tr = truncations();
        return { basic: b, crosslinks: cx, relations: r, degree: d, groups: g, levels: lv, sources: s, studyStatus: ss, betweenness: bt, truncations: tr };
    }

    // ── 11b. EXPORT REPORT — Markdown completo + clipboard + localStorage ───
    //
    // Produce un report Markdown autocontenuto con TUTTE le sezioni metriche.
    // Salva in localStorage['mappai_last_report.md'] e copia in clipboard.
    // Usa downloadReport() per ottenerlo come file .md scaricabile.

    function _mdTable(rows) {
        if (!Array.isArray(rows) || !rows.length) return '_(nessun dato)_\n';
        const keys = Object.keys(rows[0]);
        const head = '| ' + keys.join(' | ') + ' |';
        const sep  = '| ' + keys.map(() => '---').join(' | ') + ' |';
        const body = rows.map(r =>
            '| ' + keys.map(k => {
                const v = r[k];
                if (v == null) return '';
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
            }).join(' | ') + ' |'
        ).join('\n');
        return `${head}\n${sep}\n${body}\n`;
    }

    function _mdKeyVal(obj) {
        return _mdTable(
            Object.entries(obj).map(([k, v]) => ({
                Campo: k,
                Valore: typeof v === 'object' ? JSON.stringify(v) : String(v)
            }))
        );
    }

    function exportReport(label) {
        const state = _state();
        const nodes = _nodes(), links = _links();
        const adj = _adj(nodes, links);
        const provider = _resolveProvider(state);
        const model    = _resolveModel(state);
        const topic    = state.rootNodeLabel || 'N/A';
        const mode     = state.extractionMode || 'N/A';
        const ts       = new Date().toISOString();
        const reportLabel = label || `${provider}_${(model || '').replace(/[^a-z0-9]/gi, '-')}_${Date.now()}`;

        const lines = [];
        const push  = (s) => lines.push(s);

        push(`# MappAI Metrics Report — ${reportLabel}`);
        push('');
        push(`- **Topic:** ${topic}`);
        push(`- **Provider:** ${provider}`);
        push(`- **Model:** ${model}`);
        push(`- **Mode:** ${mode}`);
        push(`- **Generated at:** ${ts}`);
        push('');

        // ── 1. Basic ──
        push('## 1. Basic metrics');
        push('');
        const density = nodes.length ? links.length / nodes.length : 0;
        push(_mdKeyVal({
            Nodes: nodes.length,
            Links: links.length,
            Density: density.toFixed(3),
            Topology: density < 1.1 ? 'tree-like' : 'networked',
            Groups: new Set(nodes.map(n => n.group).filter(Boolean)).size,
            MaxLevel: Math.max(0, ...nodes.map(n => n.level ?? 0))
        }));
        push('');

        // ── 2. Crosslinks ──
        push('## 2. Crosslinks (KG quality)');
        push('');
        const cross = links.filter(l => l.isCross === true).length;
        const ratio = cross / (links.length || 1);
        push(_mdKeyVal({
            Total: links.length,
            Hierarchical: links.length - cross,
            CrossLink: cross,
            CrossRatio: _pct(cross, links.length),
            Quality: ratio >= 0.3 ? 'buono' : ratio >= 0.15 ? 'mediocre' : 'scarso'
        }));
        push('');

        // ── 3. Relation types ──
        push('## 3. Relation types');
        push('');
        const relFreq = {};
        links.forEach(l => { const r = l.rel || '(nessuna)'; relFreq[r] = (relFreq[r] || 0) + 1; });
        const relRows = Object.entries(relFreq).sort((a, b) => b[1] - a[1])
            .map(([rel, count]) => ({ rel, count, pct: _pct(count, links.length) }));
        push(`_${relRows.length} tipi unici su ${links.length} link totali_`);
        push('');
        push(_mdTable(relRows));
        push('');

        // ── 4. Levels ──
        push('## 4. Level distribution');
        push('');
        const lvFreq = {};
        nodes.forEach(n => { const lv = n.level ?? 0; lvFreq[lv] = (lvFreq[lv] || 0) + 1; });
        push(_mdTable(
            Object.entries(lvFreq).sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([lv, c]) => ({ level: `L${lv}`, count: c, pct: _pct(c, nodes.length) }))
        ));
        push('');

        // ── 5. Groups ──
        push('## 5. Group distribution');
        push('');
        const gFreq = {};
        nodes.forEach(n => { const g = n.group || '(nessun gruppo)'; gFreq[g] = (gFreq[g] || 0) + 1; });
        push(_mdTable(
            Object.entries(gFreq).sort((a, b) => b[1] - a[1])
                .map(([g, c]) => ({ group: g, count: c, pct: _pct(c, nodes.length) }))
        ));
        push('');

        // ── 6. Degree ──
        push('## 6. Degree distribution');
        push('');
        const degs = nodes.map(n => ({ label: n.label, degree: adj.get(n.id)?.size || 0 }));
        const vals = degs.map(d => d.degree);
        const sorted = [...vals].sort((a, b) => a - b);
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        push(_mdKeyVal({
            min: sorted[0] ?? 0,
            p25: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
            median: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
            p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
            max: sorted[sorted.length - 1] ?? 0,
            mean: mean.toFixed(2),
            stddev: _stddev(vals).toFixed(2)
        }));
        push('');
        push('### Top-10 hub (per degree)');
        push('');
        push(_mdTable(degs.sort((a, b) => b.degree - a.degree).slice(0, 10)));
        push('');

        // ── 7. Betweenness ──
        push('## 7. Betweenness centrality (top-10)');
        push('');
        if (window.MappAIStructureAnalyzer?.computeBetweenness && nodes.length) {
            const ranked = window.MappAIStructureAnalyzer.computeBetweenness(nodes, links);
            const nMap = new Map(nodes.map(n => [n.id, n]));
            const maxScore = ranked[0]?.score || 1;
            push(_mdTable(ranked.filter(r => r.score > 0).slice(0, 10).map(r => ({
                label: nMap.get(r.id)?.label || r.id,
                betweenness: r.score.toFixed(2),
                normalised: (r.score / maxScore).toFixed(3),
                degree: adj.get(r.id)?.size || 0,
                level: nMap.get(r.id)?.level ?? '?',
                hiddenHub: (adj.get(r.id)?.size || 0) <= 3 && r.score >= maxScore * 0.5 ? 'yes' : ''
            }))));
        } else {
            push('_StructureAnalyzer non disponibile_');
        }
        push('');

        // ── 8. Sources ──
        push('## 8. Sources coverage');
        push('');
        const sd = state.db.sourcesDict || {};
        const withSrc    = nodes.filter(n => sd[n.id]?.length).length;
        const withChunks = nodes.filter(n => n.chunks?.length).length;
        push(_mdKeyVal({
            total: nodes.length, withSource: withSrc, withChunks: withChunks,
            sourceRatio: _pct(withSrc, nodes.length),
            chunksRatio: _pct(withChunks, nodes.length)
        }));
        push('');

        // ── 9. Study status ──
        push('## 9. Study status');
        push('');
        const ssFreq = {};
        nodes.forEach(n => { const st = n.studyStatus || 'none'; ssFreq[st] = (ssFreq[st] || 0) + 1; });
        push(_mdTable(
            Object.entries(ssFreq).sort((a, b) => b[1] - a[1])
                .map(([s, c]) => ({ status: s, count: c, pct: _pct(c, nodes.length) }))
        ));
        push('');

        // ── 10. Structural ──
        push('## 10. Structural analysis');
        push('');
        if (window.MappAIStructureAnalyzer) {
            const struct = window.MappAIStructureAnalyzer.analyzeCurrentMap();
            push(_mdKeyVal(struct.stats));
            push('');
            const bySev = { high: 0, medium: 0, low: 0 };
            const byType = {};
            struct.suggestions.forEach(sg => {
                bySev[sg.severity] = (bySev[sg.severity] || 0) + 1;
                byType[sg.type] = (byType[sg.type] || 0) + 1;
            });
            push(`**Suggerimenti:** ${struct.suggestions.length} totali — high: ${bySev.high}, medium: ${bySev.medium}, low: ${bySev.low}`);
            push('');
            if (struct.suggestions.length) {
                push('### Per tipo');
                push('');
                push(_mdTable(Object.entries(byType).map(([t, c]) => ({ type: t, count: c }))));
                push('');
                const top = struct.suggestions.filter(sg => sg.severity === 'high');
                if (top.length) {
                    push('### Suggerimenti high-severity');
                    push('');
                    top.forEach(sg => push(`- **[${sg.type}]** ${sg.message}`));
                    push('');
                }
            }
        } else {
            push('_StructureAnalyzer non disponibile_');
            push('');
        }

        // ── 11. Truncations (Strategia 0) ──
        push('## 11. Truncations (Strategia 0)');
        push('');
        const t = window.MappAITruncationTracker;
        if (t) {
            const sum = t.summary(true);
            push(_mdKeyVal({
                'API calls': sum.calls,
                'Truncated': sum.truncated,
                'Truncation rate': (sum.truncationRate * 100).toFixed(1) + '%'
            }));
            push('');
            if (Object.keys(sum.byModel).length) {
                push('### Per modello');
                push('');
                push(_mdTable(Object.entries(sum.byModel).map(([m, st]) => ({
                    model: m, calls: st.calls, truncated: st.truncated,
                    rate: (st.truncated / st.calls * 100).toFixed(1) + '%'
                }))));
                push('');
            }
            const trunc = t.currentRun.filter(e => e.truncated);
            if (trunc.length) {
                push('### Dettaglio chiamate troncate');
                push('');
                push(_mdTable(trunc.map(e => ({
                    ts: new Date(e.ts).toLocaleTimeString(),
                    model: e.model, finishReason: e.finishReason,
                    requestedMax: e.requestedMax, outputTokens: e.candidateTokens,
                    utilizzo: e.requestedMax ? ((e.candidateTokens / e.requestedMax) * 100).toFixed(1) + '%' : 'N/A'
                }))));
                push('');
            }
        } else {
            push('_Tracker non disponibile_');
            push('');
        }

        push('---');
        push(`_Generato da MappAIMetrics.exportReport() il ${ts}_`);

        const md = lines.join('\n');
        try { localStorage.setItem('mappai_last_report.md', md); } catch (_) {}
        if (navigator.clipboard) {
            navigator.clipboard.writeText(md).then(
                () => console.log('%c✅ Report Markdown copiato in clipboard e salvato in localStorage["mappai_last_report.md"]', 'color:green;font-weight:bold'),
                () => console.log('%c💾 Report salvato in localStorage (clipboard non disponibile)', 'color:#6366f1')
            );
        } else {
            console.log('%c💾 Report salvato in localStorage["mappai_last_report.md"]', 'color:#6366f1');
        }
        console.log(`%c   ${md.length.toLocaleString()} caratteri · ${md.split('\n').length} righe`, 'color:#888');
        return md;
    }

    function downloadReport(filename) {
        const md = localStorage.getItem('mappai_last_report.md');
        if (!md) {
            console.warn('[MappAIMetrics] Nessun report. Esegui prima exportReport().');
            return;
        }
        const name = filename || `mappai-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        console.log(`%c📥 Report scaricato: ${name}`, 'color:green');
    }

    // ── 12. TABLE ─────────────────────────────────────────────────────────────

    function table() {
        const s     = _state();
        const nodes = _nodes(), links = _links();
        const adj   = _adj(nodes, links);
        const degrees = nodes.map(n => adj.get(n.id)?.size || 0);
        const mean    = degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
        const cross   = links.filter(l => l.isCross === true).length;
        const withSrc = nodes.filter(n => { const sd = s.db.sourcesDict || {}; return sd[n.id]?.length; }).length;
        const density = nodes.length ? links.length / nodes.length : 0;
        const relTypes = new Set(links.map(l => l.rel).filter(Boolean)).size;
        const genericLinks = links.filter(l => (l.rel || '').toLowerCase().includes('correlat')).length;
        const trunc = window.MappAITruncationTracker?.summary(true) || { calls: 0, truncated: 0 };

        const row = {
            'Provider':   _resolveProvider(s),
            'Model':      _resolveModel(s),
            'Topic':      (s.rootNodeLabel || '').slice(0, 30),
            'Mode':       s.extractionMode,
            'Nodes':      nodes.length,
            'Links':      links.length,
            'Density':    Number(density.toFixed(2)),
            'CrossLinks': cross,
            'Cross%':     _pct(cross, links.length),
            'RelTypes':   relTypes,
            'Generic%':   _pct(genericLinks, links.length),
            'AvgDegree':  Number(mean.toFixed(2)),
            'MaxDegree':  Math.max(0, ...degrees),
            'Groups':     new Set(nodes.map(n => n.group).filter(Boolean)).size,
            'MaxLevel':   Math.max(0, ...nodes.map(n => n.level ?? 0)),
            'SourceCov%': _pct(withSrc, nodes.length),
            'Trunc':      trunc.truncated > 0 ? `⚠️ ${trunc.truncated}/${trunc.calls}` : `✓ 0/${trunc.calls}`
        };
        console.log('%c── COMPACT TABLE ──', 'color:#6366f1;font-weight:bold');
        console.table([row]);
        return row;
    }

    // ── 13. COMPARE — payload + clipboard ────────────────────────────────────

    function compare(label) {
        const payload = _buildPayload(label);
        const json = JSON.stringify(payload, null, 2);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(json).then(
                () => console.log('%c✅ JSON copiato in clipboard!', 'color:green'),
                () => console.log(json)
            );
        } else {
            console.log(json);
        }
        return payload;
    }

    // ── 14. SAVE / LOAD / LIST ────────────────────────────────────────────────

    const LS_KEY      = 'mappai_metrics_snapshots';
    const LS_LAST_KEY = 'mappai_metrics_last';

    function _readStore() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
        catch { return []; }
    }

    function _writeStore(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

    function save(label) {
        if (!label) { console.warn('[MappAIMetrics] save() richiede un label, es. save("gemini-flash")'); return; }
        const payload = _buildPayload(label);
        const store = _readStore().filter(s => s.label !== label);
        store.push(payload);
        _writeStore(store);
        // copia in clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(
                () => console.log(`%c💾 Snapshot "${label}" salvato e copiato in clipboard (${store.length} totali)`, 'color:green'),
                () => console.log(`%c💾 Snapshot "${label}" salvato (${store.length} totali)`, 'color:green')
            );
        }
        return payload;
    }

    function load(label) {
        const store = _readStore();
        const found = label ? store.find(s => s.label === label) : store[store.length - 1];
        if (!found) {
            console.warn(`[MappAIMetrics] Snapshot "${label}" non trovato. Usa .list() per vedere quelli disponibili.`);
            return null;
        }
        console.log(`%c📂 Snapshot: "${found.label}" (${new Date(found.ts).toLocaleString()})`, 'color:#6366f1');
        return found;
    }

    function loadLast() {
        try {
            const p = JSON.parse(localStorage.getItem(LS_LAST_KEY) || 'null');
            if (!p) { console.warn('[MappAIMetrics] Nessun auto-snapshot trovato — genera prima una mappa.'); return null; }
            console.log(`%c📂 Ultimo auto-snapshot: "${p.label}" (${new Date(p.ts).toLocaleString()})`, 'color:#6366f1');
            return p;
        } catch { return null; }
    }

    function list() {
        const store = _readStore();
        const last = (() => { try { return JSON.parse(localStorage.getItem(LS_LAST_KEY) || 'null'); } catch { return null; } })();
        if (!store.length && !last) { console.log('[MappAIMetrics] Nessuno snapshot salvato.'); return []; }
        const rows = [
            ...(last ? [{ label: `⚡ ${last.label}`, provider: last.provider, model: last.model, mode: last.mode, nodes: last.nodes, density: last.density, 'cross%': (last.crossRatio * 100).toFixed(1) + '%', saved: new Date(last.ts).toLocaleString() + ' (auto)' }] : []),
            ...store.map(s => ({ label: s.label, provider: s.provider, model: s.model, mode: s.mode, nodes: s.nodes, density: s.density, 'cross%': (s.crossRatio * 100).toFixed(1) + '%', saved: new Date(s.ts).toLocaleString() }))
        ];
        console.log('%c── SNAPSHOTS ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return store;
    }

    function remove(label) {
        _writeStore(_readStore().filter(s => s.label !== label));
        console.log(`%c🗑 Snapshot "${label}" rimosso`, 'color:orange');
    }

    function clearAll() {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_LAST_KEY);
        console.log('%c🗑 Tutti gli snapshot rimossi', 'color:orange');
    }

    // ── 15. DIFF ──────────────────────────────────────────────────────────────

    function diff(a, b) {
        if (!a || !b) { console.warn('[MappAIMetrics] diff() richiede due payload. Usa .load() o .loadLast()'); return; }
        const keys = ['nodes', 'links', 'density', 'crossLinks', 'crossRatio',
                      'relTypes', 'genericRatio', 'avgDegree', 'maxDegree',
                      'groups', 'maxLevel', 'sourceCovRatio',
                      'apiCalls', 'truncatedCalls', 'truncationRate'];
        const rows = keys.map(k => {
            const va = a[k], vb = b[k];
            const delta = (typeof va === 'number' && typeof vb === 'number') ? (vb - va).toFixed(3) : '—';
            const sign = Number(delta) > 0 ? '▲' : Number(delta) < 0 ? '▼' : '=';
            return { metric: k, [a.label || 'A']: va, [b.label || 'B']: vb, delta, trend: sign };
        });
        console.log('%c── DIFF ──', 'color:#6366f1;font-weight:bold');
        console.log(`${a.label || 'A'}  vs  ${b.label || 'B'}`);
        console.table(rows);
        return rows;
    }

    // ── Auto-metrics: patch di renderGraph ────────────────────────────────────
    //
    // renderGraph() viene chiamata dopo ogni generazione E dopo ogni piccolo edit.
    // Strategia: debounce 2s + soglia minima di variazione (≥3 nodi/link) per
    // evitare spam durante editing manuale. Si attiva solo se nodes ≥ 5.

    (function patchRenderGraph() {
        let _timer = null;
        let _lastN = 0, _lastL = 0;

        function _autoLog() {
            clearTimeout(_timer);
            _timer = setTimeout(() => {
                const nodes = _getAppState()?.db?.nodes || [];
                const links = _getAppState()?.db?.links || [];
                if (nodes.length < 5) return;
                const dN = Math.abs(nodes.length - _lastN);
                const dL = Math.abs(links.length - _lastL);
                if (dN < 3 && dL < 3) return; // solo piccoli edit → ignora
                _lastN = nodes.length;
                _lastL = links.length;

                console.log(
                    '%c📊 MappAI Metrics — aggiornate automaticamente',
                    'color:#818cf8;font-weight:bold;font-size:12px'
                );
                table();

                // Salva silenziosamente l'ultimo snapshot (no clipboard)
                try {
                    const payload = _buildPayload('auto_' + new Date().toISOString().slice(0, 19));
                    localStorage.setItem(LS_LAST_KEY, JSON.stringify(payload));
                } catch (e) { /* storage pieno o non disponibile */ }
            }, 2000);
        }

        // Aspetta che renderGraph sia definita (è una funzione globale in app.js)
        function _tryPatch() {
            if (typeof renderGraph !== 'function') {
                setTimeout(_tryPatch, 500);
                return;
            }
            const _orig = renderGraph;
            renderGraph = window.renderGraph = function () {
                const r = _orig.apply(this, arguments);
                _autoLog();
                return r;
            };
        }

        _tryPatch();
    })();

    // ── JSONL feature flag (Strategia 1A) ─────────────────────────────────────
    //
    // Attiva/disattiva il path JSONL solo per Infomaniak. Il flag è persistente
    // (localStorage) — sopravvive ai reload. Verificare lo stato con .jsonlStatus()

    function enableJSONL() {
        localStorage.setItem('mappai_jsonl_enabled', '1');
        const provider = _getAppState()?.aiProvider;
        if (provider !== 'infomaniak') {
            console.warn(`%c⚠️ JSONL attivato ma provider=${provider}. Avrà effetto solo se passi a Infomaniak.`, 'color:orange');
        } else {
            console.log('%c✅ JSONL ATTIVO per Infomaniak', 'color:green;font-weight:bold');
            console.log('   Le prossime generazioni useranno il formato JSONL sezionato (Strategia 1A).');
        }
        return true;
    }

    function disableJSONL() {
        localStorage.removeItem('mappai_jsonl_enabled');
        console.log('%c⛔ JSONL DISATTIVATO — ritorno al formato JSON monolitico', 'color:#6366f1;font-weight:bold');
        return false;
    }

    // ── Phase 1.5 feature flag (validazione semantica L1) ──────────────────

    function enableL1Validation() {
        localStorage.setItem('mappai_l1_validation_enabled', '1');
        const mode = _getAppState()?.extractionMode;
        if (mode !== 'mindmap') {
            console.warn(`%c⚠️ Phase 1.5 attivata ma extractionMode=${mode}. Avrà effetto solo in MindMap.`, 'color:orange');
        } else {
            console.log('%c✅ PHASE 1.5 ATTIVA (MindMap)', 'color:green;font-weight:bold');
            console.log('   Le prossime generazioni MM valideranno semanticamente le L1 prima di espanderle.');
        }
        return true;
    }

    function disableL1Validation() {
        localStorage.removeItem('mappai_l1_validation_enabled');
        console.log('%c⛔ PHASE 1.5 DISATTIVATA', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function l1ValidationStatus() {
        const enabled = localStorage.getItem('mappai_l1_validation_enabled') === '1';
        const mode = _getAppState()?.extractionMode;
        const active = enabled && mode === 'mindmap';
        const info = {
            flagSet:  enabled,
            mode,
            active,
            note: !enabled ? 'Flag spento — usa .enableL1Validation() per attivare'
                : mode !== 'mindmap' ? `Flag acceso ma extractionMode=${mode} (Phase 1.5 attivo solo in MindMap)`
                : 'Phase 1.5 attivo — la prossima generazione MM validerà le L1 prima della Fase 3'
        };
        console.log('%c── PHASE 1.5 STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Phase 5 flag (riclassificazione semantica) ─────────────────────────

    function enablePhase5() {
        localStorage.setItem('mappai_mm_phase5_enabled', '1');
        const mode = _getAppState()?.extractionMode;
        if (mode !== 'mindmap') {
            console.warn(`%c⚠️ Phase 5 attivata ma extractionMode=${mode}. Avrà effetto solo in MindMap.`, 'color:orange');
        } else {
            console.log('%c✅ PHASE 5 ATTIVA (MindMap)', 'color:green;font-weight:bold');
            console.log('   Dopo Phase 4, una chiamata AI proporrà spostamenti di nodi mal classificati.');
        }
        return true;
    }

    function disablePhase5() {
        localStorage.removeItem('mappai_mm_phase5_enabled');
        console.log('%c⛔ PHASE 5 DISATTIVATA', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function phase5Status() {
        const enabled = localStorage.getItem('mappai_mm_phase5_enabled') === '1';
        const mode = _getAppState()?.extractionMode;
        const active = enabled && mode === 'mindmap';
        const info = {
            flagSet:  enabled,
            mode,
            active,
            note: !enabled ? 'Flag spento — usa .enablePhase5() per attivare'
                : mode !== 'mindmap' ? `Flag acceso ma extractionMode=${mode} (attivo solo in MindMap)`
                : 'Phase 5 attiva — la prossima generazione MM riclassificherà nodi mal collocati'
        };
        console.log('%c── PHASE 5 STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Branch Boundaries flag (Strategia A — confini di ramo in Fase 3) ───

    function enableBranchBoundaries() {
        localStorage.setItem('mappai_branch_boundaries_enabled', '1');
        const mode = _getAppState()?.extractionMode;
        if (mode !== 'mindmap') {
            console.warn(`%c⚠️ Branch Boundaries attivati ma extractionMode=${mode}. Avrà effetto solo in MindMap.`, 'color:orange');
        } else {
            console.log('%c✅ BRANCH BOUNDARIES ATTIVI (MindMap)', 'color:green;font-weight:bold');
            console.log('   Ogni ramo Fase 3 riceverà nel prompt il catalogo degli altri L1.');
        }
        return true;
    }

    function disableBranchBoundaries() {
        localStorage.removeItem('mappai_branch_boundaries_enabled');
        console.log('%c⛔ BRANCH BOUNDARIES DISATTIVATI', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function branchBoundariesStatus() {
        const enabled = localStorage.getItem('mappai_branch_boundaries_enabled') === '1';
        const mode = _getAppState()?.extractionMode;
        const active = enabled && mode === 'mindmap';
        const info = {
            flagSet:  enabled,
            mode,
            active,
            note: !enabled ? 'Flag spento — usa .enableBranchBoundaries() per attivare'
                : mode !== 'mindmap' ? `Flag acceso ma extractionMode=${mode} (attivo solo in MindMap)`
                : 'Confini di ramo attivi — la prossima Fase 3 vedrà gli altri L1 nei prompt'
        };
        console.log('%c── BRANCH BOUNDARIES STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Phase 4 feature flag (Strategia B — consolidamento + cross-link) ────

    function enablePhase4() {
        localStorage.setItem('mappai_mm_phase4_enabled', '1');
        const mode = _getAppState()?.extractionMode;
        if (mode !== 'mindmap') {
            console.warn(`%c⚠️ Phase 4 attivata ma extractionMode=${mode}. Avrà effetto solo in MindMap.`, 'color:orange');
        } else {
            console.log('%c✅ PHASE 4 ATTIVA (MindMap)', 'color:green;font-weight:bold');
            console.log('   Le prossime generazioni MM eseguiranno consolidamento + cross-link AI.');
        }
        return true;
    }

    function disablePhase4() {
        localStorage.removeItem('mappai_mm_phase4_enabled');
        console.log('%c⛔ PHASE 4 DISATTIVATA', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function phase4Status() {
        const enabled = localStorage.getItem('mappai_mm_phase4_enabled') === '1';
        const mode = _getAppState()?.extractionMode;
        const active = enabled && mode === 'mindmap';
        const info = {
            flagSet:  enabled,
            mode,
            active,
            note: !enabled ? 'Flag spento — usa .enablePhase4() per attivare'
                : mode !== 'mindmap' ? `Flag acceso ma extractionMode=${mode} (Phase 4 attivo solo in MindMap)`
                : 'Phase 4 attivo — la prossima generazione MM userà il consolidamento AI'
        };
        console.log('%c── PHASE 4 STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    function jsonlStatus() {
        const enabled = localStorage.getItem('mappai_jsonl_enabled') === '1';
        const provider = _getAppState()?.aiProvider;
        const active = enabled && provider === 'infomaniak';
        const info = {
            flagSet:    enabled,
            provider:   provider,
            active:     active,
            note: !enabled ? 'Flag spento — usa .enableJSONL() per attivare'
                : provider !== 'infomaniak' ? `Flag acceso ma provider=${provider} (JSONL attivo solo su Infomaniak)`
                : 'JSONL attivo — la prossima generazione userà il formato sezionato'
        };
        console.log('%c── JSONL STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Freeze chunk verbatim (preparazione STEP 2 — chunks extra-pass) ───────
    //
    // Interruttore reversibile: quando ON i chunk verbatim NON vengono salvati
    // (né su node.chunks → niente "## Fonti" nel vault, né in sourcesDict → niente
    // fonte nel modale). Non tocca i prompt né i vault già esistenti.

    function enableChunkFreeze() {
        localStorage.setItem('mappai_freeze_chunks', '1');
        console.log('%c🧊 FREEZE CHUNK ATTIVO', 'color:#0ea5e9;font-weight:bold');
        console.log('   Le prossime generazioni NON salveranno i chunk verbatim (vault senza "## Fonti", modale senza fonte).');
        console.log('   I vault già salvati restano leggibili. Reversibile con .disableChunkFreeze()');
        return true;
    }

    function disableChunkFreeze() {
        localStorage.removeItem('mappai_freeze_chunks');
        console.log('%c♨️ FREEZE CHUNK DISATTIVATO — i chunk verbatim tornano a essere salvati', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function chunkFreezeStatus() {
        const frozen = localStorage.getItem('mappai_freeze_chunks') === '1';
        const info = {
            frozen,
            note: frozen
                ? 'Freeze attivo — le nuove generazioni scartano i chunk verbatim'
                : 'Freeze spento — i chunk verbatim vengono salvati normalmente'
        };
        console.log('%c── FREEZE CHUNK STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Arricchimento desc sottili ancorato alla fonte (3b) ───────────────────
    //
    // Post-pass automatico a fine generazione: riscrive le desc sotto soglia
    // (qualsiasi livello) in 50-80 parole fedeli al documento sorgente. Costo
    // extra (chiamate batched con il testo fonte). Default OFF.

    function enableEnrichDescs() {
        localStorage.setItem('mappai_enrich_descs_enabled', '1');
        const mode = _getAppState()?.extractionMode;
        if (mode && mode !== 'mindmap') {
            console.warn(`%c⚠️ Arricchimento attivato ma extractionMode=${mode}. Avrà effetto solo in MindMap.`, 'color:orange');
        } else {
            console.log('%c✅ ARRICCHIMENTO DESC ATTIVO (MindMap)', 'color:green;font-weight:bold');
            console.log('   A fine generazione le desc sottili (<35 parole) verranno riscritte in 50-80 parole ancorate alla fonte.');
        }
        return true;
    }

    function disableEnrichDescs() {
        localStorage.removeItem('mappai_enrich_descs_enabled');
        console.log('%c⛔ ARRICCHIMENTO DESC DISATTIVATO', 'color:#6366f1;font-weight:bold');
        return false;
    }

    function enrichDescsStatus() {
        const enabled = localStorage.getItem('mappai_enrich_descs_enabled') === '1';
        const mode = _getAppState()?.extractionMode;
        const info = {
            flagSet: enabled,
            mode,
            active: enabled && (mode === 'mindmap' || !mode),
            note: !enabled ? 'Flag spento — usa .enableEnrichDescs() per attivare'
                : (mode && mode !== 'mindmap') ? `Flag acceso ma extractionMode=${mode} (attivo solo in MindMap)`
                : 'Attivo — la prossima generazione MM arricchirà le desc sottili dalla fonte'
        };
        console.log('%c── ARRICCHIMENTO DESC STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(info);
        return info;
    }

    // ── Semantic Dedup (embeddings bge-multilingual-gemma2) ───────────────────

    function enableSemanticDedup() {
        localStorage.setItem('mappai_semantic_dedup_enabled', '1');
        console.log('%c✅ SEMANTIC DEDUP ATTIVO', 'color:green;font-weight:bold');
        console.log('   Richiede provider=infomaniak e mode=mindmap. Esegui dopo la generazione con MappAIMetrics.runSemanticDedup()');
        return true;
    }

    function disableSemanticDedup() {
        localStorage.removeItem('mappai_semantic_dedup_enabled');
        console.log('%c⛔ SEMANTIC DEDUP DISATTIVATO', 'color:#6366f1');
        return false;
    }

    async function runSemanticDedup(threshold = 0.85) {
        if (!window.executeSemanticDedup) {
            console.error('executeSemanticDedup non disponibile (restart app richiesto)');
            return null;
        }
        const r = await window.executeSemanticDedup({ threshold });
        if (typeof window.renderGraph === 'function') window.renderGraph();
        return r;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    window.MappAIMetrics = {
        basic,
        relations,
        crosslinks,
        levels,
        groups,
        degree,
        betweenness,
        sources,
        studyStatus,
        structural,
        truncations,
        exportReport,
        downloadReport,
        report,
        clearLogs,
        logsBuffer,
        snapshot,
        table,
        compare,
        save,
        load,
        loadLast,
        list,
        remove,
        clearAll,
        diff,
        enableJSONL,
        disableJSONL,
        jsonlStatus,
        enableL1Validation,
        disableL1Validation,
        l1ValidationStatus,
        enableBranchBoundaries,
        disableBranchBoundaries,
        branchBoundariesStatus,
        enablePhase4,
        disablePhase4,
        phase4Status,
        enablePhase5,
        disablePhase5,
        phase5Status,
        enableSemanticDedup,
        disableSemanticDedup,
        runSemanticDedup,
        enableChunkFreeze,
        disableChunkFreeze,
        chunkFreezeStatus,
        enableEnrichDescs,
        disableEnrichDescs,
        enrichDescsStatus
    };

    console.log(
        '%c✅ MappAIMetrics pronto',
        'color:green;font-weight:bold',
        '— dopo ogni generazione le metriche appaiono automaticamente in console.'
    );
})();
