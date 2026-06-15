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
        leafIsolationMinSiblings: 4,
        // Leaf isolation per-livello (vedi ROADMAP §1.1 + analisi 2026-06-01)
        leafL2Severity: 'high',        // L2 isolato = macro-area non sviluppata
        leafL3Severity: 'medium',      // L3 isolato = candidato cross-link
        leafDetailMaxLevel: 5,         // L4-L5 = dettagli terminali (consolidabili)
        leafConsolidateMinSiblings: 3, // soglia per suggerire consolidamento foglie-dettaglio
        leafCrossLinkCap: 5,           // max card di tipo cross-link suggerite
        lowConnectivityRatio: 1.1,     // sotto questa densità link/nodi → meta-suggerimento
        bridgeMinEndpointDegree: 2,    // un ponte verso una foglia (grado 1) è triviale → scartato
        bridgeCap: 4                   // max ponti significativi segnalati
    };

    // ── Tipi di suggerimento ────────────────────────────────
    const SUGGESTION_TYPES = {
        GOD_NODE: 'god_node',
        MISPLACED: 'misplaced',
        UNDERUTILIZED: 'underutilized',
        UNBALANCED: 'unbalanced',
        UNDEVELOPED_BRANCH: 'undeveloped_branch', // L2 isolato senza figli
        SUGGEST_CROSSLINK: 'suggest_crosslink',    // L3 isolato → ponte tematico
        CONSOLIDATE_LEAVES: 'consolidate_leaves',  // L4-L5 dettagli sparsi
        LOW_CONNECTIVITY: 'low_connectivity',      // meta: mappa troppo ad albero
        KEYSTONE: 'keystone',                      // ponte / punto di articolazione
        MEANING_HUB: 'meaning_hub',                // alta betweenness centrality
        DUPLICATE_ENTITY: 'duplicate_entity'       // entità frammentata su più rami (Entity Backbone)
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

    /**
     * Estrae il livello gerarchico di un nodo.
     * Preferisce n.level; in fallback legge l'ID (es. "L1_0_L2_A_L3_A1" → 3).
     */
    function getLevel(node) {
        if (typeof node.level === 'number') return node.level;
        const matches = String(node.id || '').match(/L(\d+)/g);
        if (!matches || !matches.length) return 1;
        return matches
            .map(m => parseInt(m.slice(1), 10))
            .reduce((max, v) => Math.max(max, v), 1);
    }

    /**
     * Rileva se il grafo è una MindMap (gerarchica) o un KG (relazionale).
     * Le analisi per-livello (undeveloped_branch, suggest_crosslink per livello,
     * consolidate_leaves) hanno senso SOLO su MindMap. Su un KG il "level" è solo
     * un attributo di layout, non una gerarchia semantica → vanno disattivate.
     *
     * Euristica: nelle MindMap gli ID codificano il percorso (es. "L1_0_L2_A");
     * nei KG gli ID sono semantici (es. "FOTOSINTESI", "CLOROPLASTO").
     */
    function detectMode(nodes) {
        if (!nodes.length) return 'mindmap';
        const pathLike = nodes.filter(n => /L\d+_/.test(String(n.id || ''))).length;
        return (pathLike / nodes.length) >= 0.5 ? 'mindmap' : 'kg';
    }

    // ── Motore graphology (opzionale) ───────────────────────
    //
    // Se il bundle vendored `mappai-graphology.min.js` è caricato
    // (window.MappAIGraphology), betweenness e ponti/articolazioni usano le
    // implementazioni testate di graphology. Se NON è disponibile (es. import
    // JSON standalone, ambiente di test, bundle non caricato) si ricade
    // automaticamente sulle implementazioni custom — stesso risultato, parità
    // verificata in scripts/prototype-graphology-betweenness.js (diff ≤ 1e-15).
    // Questo rende lo swap completamente reversibile: basta non caricare lo
    // script e l'analizzatore continua a funzionare col codice custom.
    function _getGraphology() {
        try {
            const G = (typeof MappAIGraphology !== 'undefined')
                ? MappAIGraphology : window.MappAIGraphology;
            return (G && G.Graph) ? G : null;
        } catch (e) { return null; }
    }

    // Grafo graphology non-orientato con la STESSA semantica di buildAdjacency:
    // archi non-direzionati, self-loop scartati, paralleli collassati.
    function _buildGraphologyGraph(G, nodes, links) {
        const graph = new G.Graph({ type: 'undirected' });
        nodes.forEach(n => { if (!graph.hasNode(n.id)) graph.addNode(n.id); });
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s !== t && graph.hasNode(s) && graph.hasNode(t)) {
                graph.mergeUndirectedEdge(s, t); // idempotente → collassa paralleli, come il Set di buildAdjacency
            }
        });
        return graph;
    }

    // ── 1. God nodes: top-N per degree centrality ───────────
    function analyzeGodNodes(nodes, links, mode) {
        const adj = buildAdjacency(nodes, links);
        const ranked = nodes
            .map(n => ({ node: n, degree: adj.get(n.id)?.size || 0 }))
            .filter(r => r.degree >= CONFIG.godNodeMinDegree)
            .sort((a, b) => b.degree - a.degree)
            .slice(0, CONFIG.godNodeTopN);

        return ranked.map(r => {
            const level = getLevel(r.node);
            const isKG = mode === 'kg';
            let message;

            if (level <= 1) {
                // Nodo già al livello più alto — "spostarlo in alto" non ha senso.
                if (isKG) {
                    // In KG un Super-Hub L1 con alto grado è spesso atteso.
                    message = `"${r.node.label}" è un Super-Hub molto connesso (${r.degree} nodi). In modalità KG questo è normale se è una macro-area centrale. Valuta se suddividerlo in sotto-hub più specifici per ridurre il sovraccarico cognitivo.`;
                } else {
                    // In MindMap un nodo L1 con troppi figli diretti indica squilibrio.
                    message = `"${r.node.label}" è già un ramo principale (L1) ma è connesso a ${r.degree} nodi. Valuta se suddividerlo in macro-aree più specifiche per bilanciare la mappa.`;
                }
            } else {
                // Nodo a livello L2+ — promozione a L1/L2 è un suggerimento valido.
                message = `"${r.node.label}" è connesso a ${r.degree} nodi. Sembra un concetto-cerniera: valuta se spostarlo a un livello più alto (L1/L2).`;
            }

            return {
                type: SUGGESTION_TYPES.GOD_NODE,
                nodeId: r.node.id,
                severity: r.degree >= 10 ? 'high' : 'medium',
                message,
                data: { degree: r.degree, currentLevel: level, mode: mode || 'unknown' }
            };
        });
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

    // ── 4. Foglie isolate, differenziate per livello ────────
    //
    // In una MindMap gerarchica una foglia con un solo vicino (il parent) è la
    // NORMA, non un'anomalia. Segnalarle tutte (17/34 sul corpus GF GEMMA STORIA)
    // è rumore. La diagnosi utile dipende dal LIVELLO della foglia:
    //   - L2 isolato  → macro-area annunciata ma non sviluppata (anomalia vera)
    //   - L3 isolato  → concetto-ponte: candidato ideale a cross-link tematico
    //   - L4-L5 sparsi → dettagli terminali: consolidabili per leggibilità BES/DSA
    function detectLeafIsolation(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const nMap = nodeMap(nodes);
        const suggestions = [];
        const crossLinkCandidates = [];
        const detailLeavesByParent = new Map();

        nodes.forEach(n => {
            const neighbors = adj.get(n.id);
            if (!neighbors || neighbors.size !== 1) return; // solo foglie pure

            const parent = nMap.get([...neighbors][0]);
            const level = getLevel(n);

            if (level <= 2) {
                // L1/L2 foglia = ramo non sviluppato
                suggestions.push({
                    type: SUGGESTION_TYPES.UNDEVELOPED_BRANCH,
                    nodeId: n.id,
                    severity: CONFIG.leafL2Severity,
                    message: `"${n.label}" è a livello L${level} ma non ha sotto-nodi né collegamenti. È una macro-area annunciata e non sviluppata: aggiungi figli o declassala se è un dettaglio.`,
                    data: { level, parent: parent?.label || null }
                });
            } else if (level === 3) {
                // L3 foglia = concetto-ponte, raccolto per cap successivo
                crossLinkCandidates.push({ node: n, parent, level });
            } else {
                // L4-L5 foglia = dettaglio, raggruppato per parent
                const key = parent?.id || '__noparent__';
                if (!detailLeavesByParent.has(key)) {
                    detailLeavesByParent.set(key, { parent, leaves: [] });
                }
                detailLeavesByParent.get(key).leaves.push(n);
            }
        });

        // L3 → suggerimenti cross-link (cap per evitare rumore)
        crossLinkCandidates
            .slice(0, CONFIG.leafCrossLinkCap)
            .forEach(({ node, level }) => {
                suggestions.push({
                    type: SUGGESTION_TYPES.SUGGEST_CROSSLINK,
                    nodeId: node.id,
                    severity: CONFIG.leafL3Severity,
                    message: `"${node.label}" (L${level}) è un concetto isolato. Collegalo ad altre aree per renderlo un ponte tematico (es. relazioni di causa/effetto cross-ramo).`,
                    data: { level }
                });
            });

        // L4-L5 → consolidamento solo dove ci sono molte foglie sotto lo stesso parent
        detailLeavesByParent.forEach(({ parent, leaves }) => {
            if (leaves.length < CONFIG.leafConsolidateMinSiblings) return;
            suggestions.push({
                type: SUGGESTION_TYPES.CONSOLIDATE_LEAVES,
                nodeId: parent?.id || null,
                severity: 'low',
                message: `"${parent?.label || '?'}" ha ${leaves.length} dettagli terminali sparsi. Valuta di consolidarli per ridurre il carico cognitivo (utile BES/DSA).`,
                data: {
                    parent: parent?.label || null,
                    count: leaves.length,
                    leaves: leaves.map(l => l.label)
                }
            });
        });

        return suggestions;
    }

    // ── 5. Connettività globale (meta-suggerimento) ─────────
    // Se la mappa è quasi un albero puro (densità link/nodi bassa) il valore
    // cognitivo dei collegamenti trasversali è assente. Una sola card "high"
    // vale più di N foglie isolate.
    function detectLowConnectivity(nodes, links) {
        if (nodes.length < 5) return [];
        const ratio = links.length / nodes.length;
        if (ratio >= CONFIG.lowConnectivityRatio) return [];
        return [{
            type: SUGGESTION_TYPES.LOW_CONNECTIVITY,
            nodeId: null,
            severity: 'high',
            message: `La mappa ha pochi collegamenti trasversali (${links.length} link per ${nodes.length} nodi, densità ${ratio.toFixed(2)}). È quasi un albero puro: aggiungi cross-link tra concetti di aree diverse per evidenziare cause, contrasti e continuità.`,
            data: { ratio, links: links.length, nodes: nodes.length }
        }];
    }

    // ── 6. Ponti e punti di articolazione (Tarjan) ─────────
    //
    // Un PONTE è un arco la cui rimozione disconnette il grafo.
    // Un PUNTO DI ARTICOLAZIONE è un nodo la cui rimozione disconnette il grafo.
    // Pedagogicamente: il concetto-cardine che tiene insieme due aree.
    // Distinto dai god node — un nodo può avere grado alto SENZA essere un ponte.
    //
    // Implementazione: DFS con discovery-time e low-link (Tarjan), iterativa
    // per evitare stack overflow su grafi grandi.
    // (Fallback: usato quando graphology non è caricato — vedi dispatcher sotto.)
    function _findBridgesAndArticulationsFallback(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const ids = nodes.map(n => n.id);
        const disc = new Map();   // discovery time
        const low = new Map();    // low-link value
        const parent = new Map();
        const articulation = new Set();
        const bridges = [];
        let timer = 0;

        ids.forEach(id => { disc.set(id, -1); low.set(id, -1); parent.set(id, null); });

        // DFS iterativa: stack di {node, neighborIterator, childCount}
        ids.forEach(start => {
            if (disc.get(start) !== -1) return;
            const stack = [{ u: start, it: [...(adj.get(start) || [])], i: 0, children: 0 }];
            disc.set(start, timer); low.set(start, timer); timer++;

            while (stack.length) {
                const frame = stack[stack.length - 1];
                const u = frame.u;

                if (frame.i < frame.it.length) {
                    const v = frame.it[frame.i++];
                    if (disc.get(v) === -1) {
                        parent.set(v, u);
                        frame.children++;
                        disc.set(v, timer); low.set(v, timer); timer++;
                        stack.push({ u: v, it: [...(adj.get(v) || [])], i: 0, children: 0 });
                    } else if (v !== parent.get(u)) {
                        low.set(u, Math.min(low.get(u), disc.get(v)));
                    }
                } else {
                    // pop: propaga low-link al parent
                    stack.pop();
                    const p = parent.get(u);
                    if (p !== null) {
                        low.set(p, Math.min(low.get(p), low.get(u)));
                        // articolazione (caso non-root)
                        if (parent.get(p) !== null && low.get(u) >= disc.get(p)) {
                            articulation.add(p);
                        }
                        // ponte
                        if (low.get(u) > disc.get(p)) {
                            bridges.push([p, u]);
                        }
                    }
                }
            }
            // root è articolazione se ha >1 figlio nel DFS
            // (children del frame root: ricalcolato sotto)
        });

        // root articulation: una root con ≥2 figli DFS è articolazione
        const rootChildren = new Map();
        ids.forEach(id => {
            const p = parent.get(id);
            if (p !== null && parent.get(p) === null) {
                rootChildren.set(p, (rootChildren.get(p) || 0) + 1);
            }
        });
        rootChildren.forEach((c, root) => { if (c >= 2) articulation.add(root); });

        return { bridges, articulationPoints: [...articulation] };
    }

    // Versione graphology: ponti/articolazioni via conteggio componenti connesse.
    // Un PONTE è un arco la cui rimozione aumenta il numero di componenti.
    // Un'ARTICOLAZIONE è un nodo la cui rimozione spezza la sua componente.
    // Brute-force O(E·(V+E)) / O(V·(V+E)): banale sui nostri grafi (decine di nodi),
    // e più semplice di Tarjan. Parità verificata nel prototipo.
    function _componentOf(graph, startId) {
        const visited = new Set([startId]);
        const queue = [startId];
        while (queue.length) {
            const u = queue.shift();
            graph.forEachNeighbor(u, v => {
                if (!visited.has(v)) { visited.add(v); queue.push(v); }
            });
        }
        return [...visited];
    }

    function _countComponentsAmong(graph, nodeIds) {
        const idSet = new Set(nodeIds);
        const visited = new Set();
        let count = 0;
        nodeIds.forEach(start => {
            if (visited.has(start)) return;
            count++;
            const queue = [start];
            visited.add(start);
            while (queue.length) {
                const u = queue.shift();
                graph.forEachNeighbor(u, v => {
                    if (idSet.has(v) && !visited.has(v)) { visited.add(v); queue.push(v); }
                });
            }
        });
        return count;
    }

    function _findBridgesAndArticulationsGraphology(G, nodes, links) {
        const graph = _buildGraphologyGraph(G, nodes, links);
        const baseline = G.countConnectedComponents(graph);

        // Ponti: rimuovi ogni arco, controlla se le componenti aumentano, ripristina.
        // IMPORTANTE: snapshot della lista archi PRIMA del loop. Mutare il grafo
        // (dropEdge/mergeUndirectedEdge) dentro graph.forEachEdge fa rivisitare gli
        // archi ri-aggiunti → loop infinito su grafi densi (i KG si bloccavano qui).
        const bridges = [];
        const edgeList = graph.edges();
        edgeList.forEach(edge => {
            const source = graph.source(edge);
            const target = graph.target(edge);
            graph.dropEdge(edge);
            if (G.countConnectedComponents(graph) > baseline) bridges.push([source, target]);
            graph.mergeUndirectedEdge(source, target);
        });

        // Articolazioni: per ogni nodo di grado ≥2, rimuovilo (induci il sotto-grafo
        // sui restanti) e verifica se la sua componente si è spezzata.
        const articulationPoints = [];
        graph.forEachNode(node => {
            if (graph.degree(node) < 2) return; // foglia → mai articolazione
            const comp = _componentOf(graph, node);
            const remaining = comp.filter(id => id !== node);
            if (remaining.length < 2) return;

            const sub = new G.Graph({ type: 'undirected' });
            graph.forEachNode(id => { if (id !== node) sub.addNode(id); });
            graph.forEachEdge((edge, attr, s, t) => {
                if (s !== node && t !== node) sub.mergeUndirectedEdge(s, t);
            });
            if (_countComponentsAmong(sub, remaining) > 1) articulationPoints.push(node);
        });

        return { bridges, articulationPoints };
    }

    // Dispatcher: graphology se caricato, altrimenti Tarjan custom (stesso output).
    function findBridgesAndArticulations(nodes, links) {
        const G = _getGraphology();
        if (G) {
            try { return _findBridgesAndArticulationsGraphology(G, nodes, links); }
            catch (e) { console.warn('[structure-analyzer] graphology bridges fallita, uso fallback:', e); }
        }
        return _findBridgesAndArticulationsFallback(nodes, links);
    }

    // Suggerimenti pedagogici derivati da ponti/articolazioni
    function detectStructuralKeystones(nodes, links) {
        const nMap = nodeMap(nodes);
        const adj = buildAdjacency(nodes, links);
        const { bridges, articulationPoints } = findBridgesAndArticulations(nodes, links);
        const suggestions = [];

        articulationPoints.forEach(id => {
            const n = nMap.get(id);
            if (!n) return;
            suggestions.push({
                type: SUGGESTION_TYPES.KEYSTONE,
                nodeId: id,
                severity: 'medium',
                message: `"${n.label}" è un concetto-cardine: collega parti del grafo che altrimenti resterebbero separate. Studialo per primo — è la chiave di volta tra le aree.`,
                data: { kind: 'articulation' }
            });
        });

        // Un ponte è interessante SOLO se separa due parti non banali. Un ponte
        // verso una foglia terminale (grado 1) è triviale ("se togli l'unico link
        // a X, X si scollega") → rumore. Filtriamo questi e mettiamo un cap.
        const meaningfulBridges = bridges.filter(([a, b]) => {
            const da = adj.get(a)?.size || 0;
            const db = adj.get(b)?.size || 0;
            return Math.min(da, db) >= CONFIG.bridgeMinEndpointDegree;
        });

        meaningfulBridges
            .slice(0, CONFIG.bridgeCap)
            .forEach(([a, b]) => {
                const na = nMap.get(a), nb = nMap.get(b);
                if (!na || !nb) return;
                suggestions.push({
                    type: SUGGESTION_TYPES.KEYSTONE,
                    nodeId: null,
                    severity: 'low',
                    message: `Il collegamento "${na.label}" ↔ "${nb.label}" è l'unico ponte tra due porzioni sostanziali della mappa. Se si spezza, il discorso perde coerenza.`,
                    data: { kind: 'bridge', from: a, to: b }
                });
            });

        return suggestions;
    }

    // ── 7. Betweenness centrality (Brandes) ─────────────────
    //
    // Misura quanti percorsi minimi passano ATTRAVERSO un nodo.
    // Diversa dal degree: trova i concetti-snodo (alta betweenness, anche con
    // grado basso) — i "ponti di significato" che il degree non vede.
    // (Fallback: usato quando graphology non è caricato — vedi dispatcher sotto.)
    function _computeBetweennessFallback(nodes, links) {
        const adj = buildAdjacency(nodes, links);
        const ids = nodes.map(n => n.id);
        const CB = new Map();
        ids.forEach(id => CB.set(id, 0));

        ids.forEach(s => {
            const stack = [];
            const pred = new Map();
            const sigma = new Map();
            const dist = new Map();
            ids.forEach(t => { pred.set(t, []); sigma.set(t, 0); dist.set(t, -1); });
            sigma.set(s, 1); dist.set(s, 0);

            const queue = [s];
            while (queue.length) {
                const v = queue.shift();
                stack.push(v);
                (adj.get(v) || new Set()).forEach(w => {
                    if (dist.get(w) < 0) { queue.push(w); dist.set(w, dist.get(v) + 1); }
                    if (dist.get(w) === dist.get(v) + 1) {
                        sigma.set(w, sigma.get(w) + sigma.get(v));
                        pred.get(w).push(v);
                    }
                });
            }

            const delta = new Map();
            ids.forEach(t => delta.set(t, 0));
            while (stack.length) {
                const w = stack.pop();
                pred.get(w).forEach(v => {
                    const c = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
                    delta.set(v, delta.get(v) + c);
                });
                if (w !== s) CB.set(w, CB.get(w) + delta.get(w));
            }
        });

        // normalizza (grafo non orientato → /2) e ordina
        const result = ids.map(id => ({ id, score: CB.get(id) / 2 }));
        result.sort((a, b) => b.score - a.score);
        return result;
    }

    // Versione graphology: Brandes testato. `normalized:false` su grafo
    // non-orientato applica scale 0.5 → identico al fallback (CB/2).
    function _computeBetweennessGraphology(G, nodes, links) {
        const graph = _buildGraphologyGraph(G, nodes, links);
        const scores = G.betweennessCentrality(graph, { normalized: false });
        const result = nodes.map(n => ({ id: n.id, score: scores[n.id] || 0 }));
        result.sort((a, b) => b.score - a.score);
        return result;
    }

    // Dispatcher: graphology se caricato, altrimenti Brandes custom (stesso output).
    function computeBetweenness(nodes, links) {
        const G = _getGraphology();
        if (G) {
            try { return _computeBetweennessGraphology(G, nodes, links); }
            catch (e) { console.warn('[structure-analyzer] graphology betweenness fallita, uso fallback:', e); }
        }
        return _computeBetweennessFallback(nodes, links);
    }

    function detectMeaningHubs(nodes, links) {
        const nMap = nodeMap(nodes);
        const adj = buildAdjacency(nodes, links);
        const ranked = computeBetweenness(nodes, links).filter(r => r.score > 0);
        if (!ranked.length) return [];

        const maxScore = ranked[0].score;
        const suggestions = [];

        ranked.slice(0, 3).forEach(r => {
            const n = nMap.get(r.id);
            const degree = adj.get(r.id)?.size || 0;
            if (!n) return;
            // segnala solo gli "snodi nascosti": betweenness alta MA grado modesto
            const isHidden = degree <= 3 && r.score >= maxScore * 0.5;
            suggestions.push({
                type: SUGGESTION_TYPES.MEANING_HUB,
                nodeId: r.id,
                severity: isHidden ? 'medium' : 'low',
                message: isHidden
                    ? `"${n.label}" ha pochi collegamenti diretti ma vi passano molti percorsi: è uno snodo di significato nascosto. Vale più di quanto la sua posizione suggerisca.`
                    : `"${n.label}" è uno snodo centrale del ragionamento: molti percorsi concettuali lo attraversano.`,
                data: { betweenness: Number(r.score.toFixed(2)), degree }
            });
        });

        return suggestions;
    }

    // ── Orchestratore ───────────────────────────────────────
    function analyzeStructure(nodes, links, options = {}) {
        if (!Array.isArray(nodes) || !Array.isArray(links)) {
            return { suggestions: [], stats: { nodes: 0, links: 0 } };
        }

        // Due assi indipendenti decidono quali analisi sono SIGNIFICATIVE:
        //
        // 1) MODALITÀ (mindmap vs kg): le analisi per-livello (rami non
        //    sviluppati, cross-link per livello, consolidamento) hanno senso solo
        //    sulle MindMap. Su un KG il "level" è solo layout → vanno disattivate.
        // 2) DENSITÀ (tree-like vs networked): Tarjan e betweenness degenerano su
        //    un albero (ogni arco è un ponte, ecc.) → attive solo con cross-link.
        const mode = options.mode || detectMode(nodes);
        const ratio = nodes.length ? links.length / nodes.length : 0;
        const isTreeLike = ratio < CONFIG.lowConnectivityRatio;
        const isMindMap = mode === 'mindmap';

        const suggestions = [
            // Sempre valide (qualsiasi grafo):
            ...detectLowConnectivity(nodes, links),
            ...analyzeGodNodes(nodes, links, mode),
            ...detectMisplacedNodes(nodes, links),
            ...detectUnderutilizedClusters(nodes, links),
            // Gerarchiche: solo MindMap (sui KG il "level" non è semantico):
            ...(isMindMap ? detectLeafIsolation(nodes, links) : []),
            // Topologiche "vere": solo se il grafo ha cross-link (non-albero):
            ...(isTreeLike ? [] : detectStructuralKeystones(nodes, links)),
            ...(isTreeLike ? [] : detectMeaningHubs(nodes, links))
        ];

        const severityRank = { high: 0, medium: 1, low: 2 };
        suggestions.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

        return {
            suggestions,
            stats: {
                nodes: nodes.length,
                links: links.length,
                groups: groupByMacroArea(nodes).size,
                density: Number(ratio.toFixed(2)),
                mode,
                topology: isTreeLike ? 'tree-like' : 'networked',
                engine: _getGraphology() ? 'graphology' : 'custom'
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
        // Usa la modalità dichiarata dall'app se disponibile; altrimenti
        // analyzeStructure la deduce dalla forma degli ID (detectMode).
        const declaredMode = state?.extractionMode === 'kg' ? 'kg'
            : state?.extractionMode === 'mindmap' ? 'mindmap'
            : undefined;
        return analyzeStructure(db.nodes || [], db.links || [], { mode: declaredMode });
    }

    // ── Export ──────────────────────────────────────────────
    window.MappAIStructureAnalyzer = {
        CONFIG,
        SUGGESTION_TYPES,
        analyzeGodNodes,
        detectMisplacedNodes,
        detectUnderutilizedClusters,
        detectLeafIsolation,
        detectLowConnectivity,
        findBridgesAndArticulations,
        detectStructuralKeystones,
        computeBetweenness,
        detectMeaningHubs,
        detectMode,
        analyzeStructure,
        analyzeCurrentMap
    };
})();
