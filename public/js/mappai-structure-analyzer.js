/**
 * mappai-structure-analyzer.js
 * Analisi strutturale deterministica della mappa (zero AI calls).
 * Produce suggerimenti per la Modalità Studente (Piano 1 — feat/structural-suggestions).
 *
 * Dipende da: app.js (appState, appState.db.nodes, appState.db.links)
 * Output: array di suggerimenti consumati da #structural-suggestions-panel.
 *
 * Riferimento: ROADMAP_graphify.md §1.1
 */

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    const CONFIG = {
        godNodeTopN: 5,
        godNodeMinDegree: 6,
        underutilizedMinNodes: 3,
        unbalancedMaxRatio: 0.4,
        misplacedMinExternalRatio: 0.6, // >60% link verso un'altra macro-area
        misplacedMinLinks: 3,
        leafIsolationMinSiblings: 4
    };

    // ── Tipi di suggerimento ────────────────────────────────
    const SUGGESTION_TYPES = {
        GOD_NODE: 'god_node',
        MISPLACED: 'misplaced',
        UNDERUTILIZED: 'underutilized',
        UNBALANCED: 'unbalanced',
        LEAF_ISOLATION: 'leaf_isolation'
    };

    // ── Helpers ─────────────────────────────────────────────

    /**
     * Costruisce indice di adiacenza non-direzionato: { nodeId: Set<neighborId> }.
     */
    function buildAdjacency(nodes, links) {
        const adj = new Map();
        nodes.forEach(n => adj.set(n.id, new Set()));
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (adj.has(s) && adj.has(t) && s !== t) {
                adj.get(s).add(t);
                adj.get(t).add(s);
            }
        });
        return adj;
    }

    /**
     * Raggruppa i nodi per macro-area (campo `group`).
     */
    function groupByMacroArea(nodes) {
        const groups = new Map();
        nodes.forEach(n => {
            const g = n.group || '__ungrouped__';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(n);
        });
        return groups;
    }

    function nodeMap(nodes) {
        const m = new Map();
        nodes.forEach(n => m.set(n.id, n));
        return m;
    }

    // ── 1. God nodes: top-N per degree centrality ───────────
    function analyzeGodNodes(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const ranked = nodes
            .map(n => ({ node: n, degree: adj.get(n.id)?.size || 0 }))
            .filter(r => r.degree >= CONFIG.godNodeMinDegree)
            .sort((a, b) => b.degree - a.degree)
            .slice(0, CONFIG.godNodeTopN);

        return ranked.map(r => ({
            type: SUGGESTION_TYPES.GOD_NODE,
            nodeId: r.node.id,
            severity: r.degree >= 10 ? 'high' : 'medium',
            message: `"${r.node.label}" è connesso a ${r.degree} nodi. Sembra un concetto-cerniera: valuta se spostarlo a un livello più alto (L1/L2).`,
            data: { degree: r.degree, currentLevel: r.node.level }
        }));
    }

    // ── 2. Misplaced: nodo con più link verso un'altra area ─
    function detectMisplacedNodes(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const nMap = nodeMap(nodes);
        const suggestions = [];

        nodes.forEach(n => {
            const neighbors = adj.get(n.id);
            if (!neighbors || neighbors.size < CONFIG.misplacedMinLinks) return;

            const groupCount = new Map();
            neighbors.forEach(nid => {
                const g = nMap.get(nid)?.group;
                if (!g) return;
                groupCount.set(g, (groupCount.get(g) || 0) + 1);
            });

            const currentGroup = n.group;
            let bestGroup = null;
            let bestCount = 0;
            groupCount.forEach((c, g) => {
                if (g !== currentGroup && c > bestCount) {
                    bestCount = c;
                    bestGroup = g;
                }
            });

            if (!bestGroup) return;
            const ratio = bestCount / neighbors.size;
            if (ratio >= CONFIG.misplacedMinExternalRatio) {
                suggestions.push({
                    type: SUGGESTION_TYPES.MISPLACED,
                    nodeId: n.id,
                    severity: ratio > 0.8 ? 'high' : 'medium',
                    message: `"${n.label}" è in "${currentGroup}" ma ${bestCount} dei suoi ${neighbors.size} collegamenti vanno verso "${bestGroup}". Valuta lo spostamento.`,
                    data: { from: currentGroup, to: bestGroup, ratio }
                });
            }
        });

        return suggestions;
    }

    // ── 3. Underutilized / unbalanced clusters ──────────────
    function detectUnderutilizedClusters(nodes, links) {
        const groups = groupByMacroArea(nodes);
        const total = nodes.length;
        const suggestions = [];

        groups.forEach((groupNodes, groupName) => {
            if (groupName === '__ungrouped__') return;
            const count = groupNodes.length;

            if (count < CONFIG.underutilizedMinNodes) {
                suggestions.push({
                    type: SUGGESTION_TYPES.UNDERUTILIZED,
                    nodeId: null,
                    groupName,
                    severity: 'medium',
                    message: `La macro-area "${groupName}" ha solo ${count} nodi. Valuta se fonderla con un'area affine o approfondirla.`,
                    data: { count }
                });
            } else if (count / total > CONFIG.unbalancedMaxRatio) {
                suggestions.push({
                    type: SUGGESTION_TYPES.UNBALANCED,
                    nodeId: null,
                    groupName,
                    severity: 'medium',
                    message: `La macro-area "${groupName}" contiene il ${Math.round(count / total * 100)}% dei nodi (${count}/${total}). Valuta se suddividerla.`,
                    data: { count, ratio: count / total }
                });
            }
        });

        return suggestions;
    }

    // ── 4. Foglie isolate (senza cross-link) ────────────────
    function detectLeafIsolation(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const nMap = nodeMap(nodes);
        const groups = groupByMacroArea(nodes);
        const suggestions = [];

        nodes.forEach(n => {
            const neighbors = adj.get(n.id);
            if (!neighbors || neighbors.size === 0) return;

            const sameGroup = groups.get(n.group || '__ungrouped__') || [];
            if (sameGroup.length < CONFIG.leafIsolationMinSiblings) return;

            // foglia = un solo vicino (il parent), tutto nella stessa area
            if (neighbors.size !== 1) return;
            const onlyNeighbor = nMap.get([...neighbors][0]);
            if (!onlyNeighbor || onlyNeighbor.group !== n.group) return;

            suggestions.push({
                type: SUGGESTION_TYPES.LEAF_ISOLATION,
                nodeId: n.id,
                severity: 'low',
                message: `"${n.label}" è una foglia isolata in "${n.group}". Potrebbe beneficiare di un cross-link tematico.`,
                data: { parent: onlyNeighbor.label }
            });
        });

        return suggestions;
    }

    // ── Orchestratore ───────────────────────────────────────
    function analyzeStructure(nodes, links) {
        if (!Array.isArray(nodes) || !Array.isArray(links)) {
            return { suggestions: [], stats: { nodes: 0, links: 0 } };
        }

        const suggestions = [
            ...analyzeGodNodes(nodes, links),
            ...detectMisplacedNodes(nodes, links),
            ...detectUnderutilizedClusters(nodes, links),
            ...detectLeafIsolation(nodes, links)
        ];

        const severityRank = { high: 0, medium: 1, low: 2 };
        suggestions.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

        return {
            suggestions,
            stats: {
                nodes: nodes.length,
                links: links.length,
                groups: groupByMacroArea(nodes).size
            }
        };
    }

    /**
     * Wrapper che legge appState.db. Comodo per uso da console / UI.
     */
    function analyzeCurrentMap() {
        const state = (typeof appState !== 'undefined') ? appState : window.appState;
        const db = state?.db;
        if (!db) {
            console.warn('[structure-analyzer] appState.db non disponibile');
            return { suggestions: [], stats: { nodes: 0, links: 0 } };
        }
        return analyzeStructure(db.nodes || [], db.links || []);
    }

    // ── Export ──────────────────────────────────────────────
    window.MappAIStructureAnalyzer = {
        CONFIG,
        SUGGESTION_TYPES,
        analyzeGodNodes,
        detectMisplacedNodes,
        detectUnderutilizedClusters,
        detectLeafIsolation,
        analyzeStructure,
        analyzeCurrentMap
    };
})();
