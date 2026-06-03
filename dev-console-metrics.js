/**
 * dev-console-metrics.js — MappAI Graph Metrics Toolkit
 *
 * Incolla questo file intero nella Dev Console di MappAI (Ctrl+Shift+I / Cmd+Option+I),
 * oppure esegui i singoli snippet per confrontare grafi generati da provider/template diversi.
 *
 * Dipende da: appState (globale), MappAIStructureAnalyzer (globale)
 *
 * UTILIZZO RAPIDO
 *   MappAIMetrics.snapshot()          → report completo nel console
 *   MappAIMetrics.compare()           → copia JSON in clipboard per confronto
 *   MappAIMetrics.table()             → tabella compatta console.table
 *
 * UTILIZZO PER SEZIONE
 *   MappAIMetrics.basic()             → nodi, link, densità, modalità
 *   MappAIMetrics.relations()         → distribuzione tipi relazione (rel)
 *   MappAIMetrics.crosslinks()        → ratio cross-link (qualità KG)
 *   MappAIMetrics.levels()            → distribuzione nodi per livello (MindMap)
 *   MappAIMetrics.groups()            → distribuzione per macro-area (group)
 *   MappAIMetrics.degree()            → distribuzione gradi (min/max/avg/σ)
 *   MappAIMetrics.betweenness()       → top-10 betweenness centrality
 *   MappAIMetrics.sources()           → copertura fonti sui nodi
 *   MappAIMetrics.studyStatus()       → stato studio nodi (per future UI)
 *   MappAIMetrics.structural()        → analisi MappAIStructureAnalyzer completa
 */

(function () {
    'use strict';

    // ── Helpers interni ──────────────────────────────────────────────────────

    function _state() {
        const s = window.appState;
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

    // ── 1. BASIC — nodi, link, densità, modalità ─────────────────────────────

    function basic() {
        const nodes = _nodes(), links = _links();
        const s = _state();
        const density = nodes.length ? (links.length / nodes.length).toFixed(3) : 0;
        const result = {
            provider:      s.aiProvider || 'N/A',
            model:         localStorage.getItem(s.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model') || 'N/A',
            topic:         s.rootNodeLabel || 'N/A',
            mode:          s.extractionMode || 'N/A',
            nodes:         nodes.length,
            links:         links.length,
            density:       Number(density),
            topology:      density < 1.1 ? 'tree-like' : 'networked',
            groups:        new Set(nodes.map(n => n.group).filter(Boolean)).size,
            maxLevel:      Math.max(0, ...nodes.map(n => n.level ?? 0))
        };
        console.log('%c── BASIC METRICS ──', 'color:#6366f1;font-weight:bold');
        console.table(result);
        return result;
    }

    // ── 2. RELATIONS — distribuzione tipi rel ────────────────────────────────

    function relations() {
        const links = _links();
        const freq = {};
        links.forEach(l => {
            const r = l.rel || '(nessuna)';
            freq[r] = (freq[r] || 0) + 1;
        });
        const total = links.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([rel, count]) => ({ rel, count, pct: _pct(count, total) }));
        console.log('%c── RELATION TYPES ──', 'color:#6366f1;font-weight:bold');
        console.log(`Tipi unici: ${rows.length} | Link totali: ${total}`);
        console.table(rows);
        return { total, types: rows.length, rows };
    }

    // ── 3. CROSSLINKS — ratio cross-link (qualità KG) ────────────────────────
    //
    // Un link è "cross" se l.isCross===true (marcato da markKgCrossLinks).
    // Su una MindMap TUTTI i link sono gerarchici → ratio attesa 0%.
    // Su un buon KG ci aspettiamo ≥30% di cross-link.

    function crosslinks() {
        const links = _links();
        const cross = links.filter(l => l.isCross === true).length;
        const hier  = links.length - cross;
        const ratio = _pct(cross, links.length);
        const result = {
            total:          links.length,
            hierarchical:   hier,
            crossLink:      cross,
            crossRatio:     ratio,
            quality:        cross / (links.length || 1) >= 0.3 ? '✅ buono' :
                            cross / (links.length || 1) >= 0.15 ? '⚠️ mediocre' : '🔴 scarso'
        };
        console.log('%c── CROSSLINKS (KG quality) ──', 'color:#6366f1;font-weight:bold');
        console.table(result);
        return result;
    }

    // ── 4. LEVELS — distribuzione nodi per livello (MindMap) ─────────────────

    function levels() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => {
            const lv = n.level ?? 0;
            freq[lv] = (freq[lv] || 0) + 1;
        });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([level, count]) => ({ level: `L${level}`, count, pct: _pct(count, total) }));
        console.log('%c── LEVEL DISTRIBUTION ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 5. GROUPS — distribuzione per macro-area ─────────────────────────────

    function groups() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => {
            const g = n.group || '(nessun gruppo)';
            freq[g] = (freq[g] || 0) + 1;
        });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([group, count]) => ({ group, count, pct: _pct(count, total) }));
        console.log('%c── GROUP DISTRIBUTION ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 6. DEGREE — distribuzione gradi dei nodi ─────────────────────────────

    function degree() {
        const nodes = _nodes(), links = _links();
        const adj = _adj(nodes, links);
        const degrees = nodes.map(n => ({ label: n.label, degree: adj.get(n.id)?.size || 0 }));
        const vals = degrees.map(d => d.degree);
        const sorted = [...vals].sort((a, b) => a - b);
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

        // distribuzione bucket
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

    // ── 7. BETWEENNESS — top-10 centralità betweenness (Brandes) ─────────────
    //
    // Usa l'algoritmo già implementato in MappAIStructureAnalyzer.
    // Se non disponibile, ricalcola inline (versione semplificata).

    function betweenness() {
        const nodes = _nodes(), links = _links();
        if (!nodes.length) { console.warn('Nessun nodo'); return []; }

        let ranked;
        if (window.MappAIStructureAnalyzer?.computeBetweenness) {
            ranked = window.MappAIStructureAnalyzer.computeBetweenness(nodes, links);
        } else {
            console.warn('[MappAIMetrics] MappAIStructureAnalyzer non disponibile, betweenness non calcolata');
            return [];
        }

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

    // ── 8. SOURCES — copertura fonti ─────────────────────────────────────────
    //
    // sourcesDict: { [nodeId]: [{title, source, text}] }
    // Conta i nodi con/senza fonte associata.

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

    // ── 9. STUDY STATUS — distribuzione stato studio ──────────────────────────

    function studyStatus() {
        const nodes = _nodes();
        const freq = {};
        nodes.forEach(n => {
            const st = n.studyStatus || 'none';
            freq[st] = (freq[st] || 0) + 1;
        });
        const total = nodes.length;
        const rows = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => ({ status, count, pct: _pct(count, total) }));
        console.log('%c── STUDY STATUS ──', 'color:#6366f1;font-weight:bold');
        console.table(rows);
        return rows;
    }

    // ── 10. STRUCTURAL — analisi MappAIStructureAnalyzer ─────────────────────

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
        if (suggestions.length) {
            console.log('Top suggerimenti (high):');
            console.table(
                suggestions
                    .filter(s => s.severity === 'high')
                    .map(s => ({ type: s.type, severity: s.severity, message: s.message.slice(0, 80) + '…' }))
            );
        }
        return result;
    }

    // ── 11. SNAPSHOT — report completo ───────────────────────────────────────

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
        return { basic: b, crosslinks: cx, relations: r, degree: d, groups: g, levels: lv, sources: s, studyStatus: ss, betweenness: bt };
    }

    // ── 12. TABLE — tabella compatta per confronto rapido ─────────────────────

    function table() {
        const s   = _state();
        const nodes = _nodes(), links = _links();
        const adj = _adj(nodes, links);
        const degrees = nodes.map(n => adj.get(n.id)?.size || 0);
        const mean = degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
        const cross = links.filter(l => l.isCross === true).length;
        const sd = s.db.sourcesDict || {};
        const withSrc = nodes.filter(n => sd[n.id] && sd[n.id].length).length;
        const density = nodes.length ? links.length / nodes.length : 0;

        const relTypes = new Set(links.map(l => l.rel).filter(Boolean)).size;
        const genericLinks = links.filter(l => (l.rel || '').toLowerCase().includes('correlat')).length;

        const row = {
            'Provider':    s.aiProvider,
            'Model':       localStorage.getItem(s.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model') || 'N/A',
            'Topic':       (s.rootNodeLabel || '').slice(0, 30),
            'Mode':        s.extractionMode,
            'Nodes':       nodes.length,
            'Links':       links.length,
            'Density':     Number(density.toFixed(2)),
            'CrossLinks':  cross,
            'Cross%':      _pct(cross, links.length),
            'RelTypes':    relTypes,
            'Generic%':    _pct(genericLinks, links.length),
            'AvgDegree':   Number(mean.toFixed(2)),
            'MaxDegree':   Math.max(0, ...degrees),
            'Groups':      new Set(nodes.map(n => n.group).filter(Boolean)).size,
            'MaxLevel':    Math.max(0, ...nodes.map(n => n.level ?? 0)),
            'SourceCov%':  _pct(withSrc, nodes.length)
        };
        console.log('%c── COMPACT TABLE (copy per confronto) ──', 'color:#6366f1;font-weight:bold');
        console.table([row]);
        return row;
    }

    // ── 13. COMPARE — esporta JSON in clipboard ───────────────────────────────
    //
    // Chiama dopo aver generato la mappa A, poi di nuovo per la mappa B.
    // Incolla entrambi i JSON in un editor per confronto manuale o diff.

    function compare(label) {
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

        const payload = {
            label:         label || new Date().toISOString().slice(0, 19),
            provider:      s.aiProvider,
            model:         localStorage.getItem(s.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model') || 'N/A',
            mode:          s.extractionMode,
            topic:         s.rootNodeLabel,
            ts:            Date.now(),
            nodes:         nodes.length,
            links:         links.length,
            density:       Number(density.toFixed(3)),
            topology:      structural.topology || (density < 1.1 ? 'tree-like' : 'networked'),
            crossLinks:    cross,
            crossRatio:    Number((cross / (links.length || 1)).toFixed(3)),
            relTypes:      Object.keys(relFreq).length,
            genericLinks:  genericLinks,
            genericRatio:  Number((genericLinks / (links.length || 1)).toFixed(3)),
            relFreq,
            avgDegree:     Number(mean.toFixed(3)),
            maxDegree:     Math.max(0, ...degrees),
            stddevDegree:  Number(_stddev(degrees).toFixed(3)),
            groups:        new Set(nodes.map(n => n.group).filter(Boolean)).size,
            maxLevel:      Math.max(0, ...nodes.map(n => n.level ?? 0)),
            sourceCovRatio:Number((withSrc / (nodes.length || 1)).toFixed(3)),
            structural
        };

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

    // ── 14. DIFF — confronta due payload compare() ────────────────────────────
    //
    // Uso:
    //   const a = MappAIMetrics.compare('gemini-flash')
    //   // ricarica mappa B
    //   MappAIMetrics.diff(a, MappAIMetrics.compare('infomaniak-gemma'))

    function diff(a, b) {
        const keys = ['nodes', 'links', 'density', 'crossLinks', 'crossRatio',
                      'relTypes', 'genericRatio', 'avgDegree', 'maxDegree',
                      'groups', 'maxLevel', 'sourceCovRatio'];
        const rows = keys.map(k => {
            const va = a[k], vb = b[k];
            const delta = (typeof va === 'number' && typeof vb === 'number')
                ? (vb - va).toFixed(3)
                : '—';
            const sign = Number(delta) > 0 ? '▲' : Number(delta) < 0 ? '▼' : '=';
            return { metric: k, [a.label || 'A']: va, [b.label || 'B']: vb, delta, trend: sign };
        });
        console.log('%c── DIFF ──', 'color:#6366f1;font-weight:bold');
        console.log(`${a.label || 'A'}  vs  ${b.label || 'B'}`);
        console.table(rows);
        return rows;
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
        snapshot,
        table,
        compare,
        diff
    };

    console.log(
        '%c✅ MappAIMetrics caricato',
        'color:green;font-weight:bold',
        '→ prova MappAIMetrics.snapshot() oppure .table() per iniziare'
    );
})();
