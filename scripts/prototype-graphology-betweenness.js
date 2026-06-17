/**
 * Prototipo isolato: confronta computeBetweenness custom (Brandes, da
 * mappai-structure-analyzer.js) con graphology-metrics/centrality/betweenness
 * sugli stessi dataset di esempio.
 *
 * Non tocca il codice dell'app — script standalone (Node), eseguibile con:
 *   node scripts/prototype-graphology-betweenness.js
 *
 * graphology + graphology-metrics installati come devDependencies per questo test.
 */

const fs = require('fs');
const path = require('path');
const Graph = require('graphology');
const betweennessCentrality = require('graphology-metrics/centrality/betweenness');
const { countConnectedComponents } = require('graphology-components');

// ── Implementazione custom (copia 1:1 da mappai-structure-analyzer.js) ──

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

function computeBetweennessCustom(nodes, links) {
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

    const result = ids.map(id => ({ id, score: CB.get(id) / 2 }));
    result.sort((a, b) => b.score - a.score);
    return result;
}

// ── Conversione dati MappAI → grafo graphology (stessa semantica di buildAdjacency) ──

function buildGraphologyGraph(nodes, links) {
    const graph = new Graph({ type: 'undirected' });
    nodes.forEach(n => graph.addNode(n.id));
    links.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (graph.hasNode(s) && graph.hasNode(t) && s !== t) {
            graph.mergeUndirectedEdge(s, t); // idempotente: collassa archi paralleli, come buildAdjacency (Set)
        }
    });
    return graph;
}

function computeBetweennessGraphology(nodes, links) {
    const graph = buildGraphologyGraph(nodes, links);
    // normalized:false + scale 0.5 su grafo undirected == /2 della versione custom
    const scores = betweennessCentrality(graph, { normalized: false });
    const result = nodes.map(n => ({ id: n.id, score: scores[n.id] || 0 }));
    result.sort((a, b) => b.score - a.score);
    return result;
}

// ── Tarjan custom (copia 1:1 da mappai-structure-analyzer.js) ──────────

function findBridgesAndArticulationsCustom(nodes, links) {
    const adj = buildAdjacency(nodes, links);
    const ids = nodes.map(n => n.id);
    const disc = new Map();
    const low = new Map();
    const parent = new Map();
    const articulation = new Set();
    const bridges = [];
    let timer = 0;

    ids.forEach(id => { disc.set(id, -1); low.set(id, -1); parent.set(id, null); });

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
                stack.pop();
                const p = parent.get(u);
                if (p !== null) {
                    low.set(p, Math.min(low.get(p), low.get(u)));
                    if (parent.get(p) !== null && low.get(u) >= disc.get(p)) {
                        articulation.add(p);
                    }
                    if (low.get(u) > disc.get(p)) {
                        bridges.push([p, u]);
                    }
                }
            }
        }
    });

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

// ── Bridges/articolazioni via graphology-components (brute-force) ─────
//
// Un ponte è un arco la cui rimozione aumenta il numero di componenti connesse.
// Un punto di articolazione è un nodo la cui rimozione spezza la sua componente
// in più parti. Per grafi piccoli (decine-centinaia di nodi) il brute-force è
// O(E*(V+E)) / O(V*(V+E)) — trascurabile, e molto più semplice di Tarjan.

function findBridgesGraphology(graph) {
    const baseline = countConnectedComponents(graph);
    const bridges = [];
    graph.edges().forEach(edge => {
        const source = graph.source(edge);
        const target = graph.target(edge);
        graph.dropEdge(edge);
        if (countConnectedComponents(graph) > baseline) {
            bridges.push([source, target]);
        }
        graph.mergeUndirectedEdge(source, target);
    });
    return bridges;
}

function findArticulationPointsGraphology(graph) {
    const articulation = [];
    graph.forEachNode(node => {
        if (graph.degree(node) < 2) return; // foglia: mai articolazione

        // sotto-grafo indotto dai vicini-raggiungibili di node, escluso node stesso
        const sub = new Graph({ type: 'undirected' });
        graph.forEachNode(id => { if (id !== node) sub.addNode(id); });
        graph.forEachEdge((edge, attr, s, t) => {
            if (s !== node && t !== node) sub.mergeUndirectedEdge(s, t);
        });

        // confronto solo entro la componente che conteneva node prima della rimozione
        const compBefore = connectedComponentOf(graph, node);
        const remaining = compBefore.filter(id => id !== node);
        if (remaining.length < 2) return;

        const compsAfter = countConnectedComponentsAmong(sub, remaining);
        if (compsAfter > 1) articulation.push(node);
    });
    return articulation;
}

function connectedComponentOf(graph, startId) {
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

function countConnectedComponentsAmong(graph, nodeIds) {
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

function compareBridges(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const nodes = raw.nodes || (raw.db && raw.db.nodes) || [];
    const links = raw.links || (raw.db && raw.db.links) || [];

    console.log(`\n--- Ponti/articolazioni: ${path.basename(file)} ---`);

    const t0 = process.hrtime.bigint();
    const customResult = findBridgesAndArticulationsCustom(nodes, links);
    const t1 = process.hrtime.bigint();

    const graph = buildGraphologyGraph(nodes, links);
    const bridgesG = findBridgesGraphology(graph);
    const articG = findArticulationPointsGraphology(graph);
    const t2 = process.hrtime.bigint();

    const normBridge = ([a, b]) => [a, b].sort().join('|');
    const customBridgeSet = new Set(customResult.bridges.map(normBridge));
    const graphoBridgeSet = new Set(bridgesG.map(normBridge));
    const customArtSet = new Set(customResult.articulationPoints);
    const graphoArtSet = new Set(articG);

    const sameBridges = customBridgeSet.size === graphoBridgeSet.size &&
        [...customBridgeSet].every(b => graphoBridgeSet.has(b));
    const sameArt = customArtSet.size === graphoArtSet.size &&
        [...customArtSet].every(a => graphoArtSet.has(a));

    console.log(`Ponti      — custom: ${customResult.bridges.length}, graphology: ${bridgesG.length}, identici: ${sameBridges}`);
    console.log(`Articol.   — custom: ${customResult.articulationPoints.length}, graphology: ${articG.length}, identici: ${sameArt}`);
    console.log(`Tempo: custom (Tarjan) ${Number(t1 - t0) / 1e6}ms, graphology (brute-force) ${Number(t2 - t1) / 1e6}ms`);

    if (!sameBridges) {
        console.log('  custom ponti:    ', [...customBridgeSet]);
        console.log('  graphology ponti:', [...graphoBridgeSet]);
    }
    if (!sameArt) {
        console.log('  custom artic.:    ', [...customArtSet]);
        console.log('  graphology artic.:', [...graphoArtSet]);
    }
}

// ── Confronto ────────────────────────────────────────────────────────

function compare(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const nodes = raw.nodes || (raw.db && raw.db.nodes) || [];
    const links = raw.links || (raw.db && raw.db.links) || [];

    console.log(`\n=== ${path.basename(file)} (${nodes.length} nodi, ${links.length} link) ===`);

    const t0 = process.hrtime.bigint();
    const custom = computeBetweennessCustom(nodes, links);
    const t1 = process.hrtime.bigint();
    const grapho = computeBetweennessGraphology(nodes, links);
    const t2 = process.hrtime.bigint();

    const labelOf = id => ((nodes.find(n => n.id === id) || {}).label || id);

    console.log('\nTop 5 — custom (Brandes /2):');
    custom.slice(0, 5).forEach(r => console.log(`  ${r.score.toFixed(3)}  ${labelOf(r.id)} (${r.id})`));

    console.log('\nTop 5 — graphology-metrics (normalized:false):');
    grapho.slice(0, 5).forEach(r => console.log(`  ${r.score.toFixed(3)}  ${labelOf(r.id)} (${r.id})`));

    const customMap = new Map(custom.map(r => [r.id, r.score]));
    const graphoMap = new Map(grapho.map(r => [r.id, r.score]));
    let maxDiff = 0;
    nodes.forEach(n => {
        const diff = Math.abs((customMap.get(n.id) || 0) - (graphoMap.get(n.id) || 0));
        if (diff > maxDiff) maxDiff = diff;
    });

    console.log(`\nDifferenza massima tra le due implementazioni: ${maxDiff.toExponential(3)}`);
    console.log(`Tempo: custom ${Number(t1 - t0) / 1e6}ms, graphology ${Number(t2 - t1) / 1e6}ms`);
}

const FOTOSINTESI = path.join(__dirname, '..', 'public', 'esempi', 'formato-esempio-claude.json');
const RETE_ELETTRICA = path.join(__dirname, '..', 'public', 'esempi', 'rete_elettrica.json');

compare(FOTOSINTESI);
compare(RETE_ELETTRICA);

compareBridges(FOTOSINTESI);
compareBridges(RETE_ELETTRICA);
