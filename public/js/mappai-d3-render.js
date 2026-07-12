// ==========================================
// D3 RENDER — estratto da app.js
// ==========================================
// Rendering D3: initD3Visualization, renderGraph, tick, drag, layout forces,
// lenti, filtri, pathfinder + stato condiviso (let simulation/svg/g/link/node/zoom,
// colorScale, linkingState, ...) letto a runtime da UI, moduli e contextual-ai.
// Il monkey-patch di renderGraph (updateStudyStats + StorageManager.saveCurrentProject)
// DEVE stare qui in coda: al load-time legge il binding renderGraph appena definito.
/* ==========================================
   D3MAP.JS - Rendering D3.js
   ========================================== */

let simulation, svg, g, link, node, zoom;
let globalFontScale = 1.0;
let attractionEnabled = true;
let isPinned = true;

const colorScale = {
    0: "#0f172a",
    1: "#ef4444",
    2: "#f59e0b",
    3: "#10b981",
    4: "#0ea5e9",
    5: "#6366f1",
    6: "#d946ef",
    7: "#8b5cf6"
};

const radiusScale = { 0: 45, 1: 30, 2: 20, 3: 15, 4: 10, 5: 7 };

function getNodeRadius(d) {
    const maxDeg = Math.max(...appState.db.nodes.map(n => n.degree || 0), 1);
    const degRatio = (d.degree || 0) / maxDeg;

    if (appState.extractionMode !== 'mindmap') {
        // KG: L0 fisso, L1 e L2+ scalano con il degree
        if (d.level === 0) return 45;
        if (d.level === 1) return 28 + degRatio * 22;   // 28–50 px
        return 12 + degRatio * 18;                       // 12–30 px
    }
    // MM: base dal livello + bonus proporzionale al degree (max +50% del base)
    const base = radiusScale[d.level !== undefined ? Math.min(d.level, 5) : 1] || 15;
    return base + degRatio * (base * 0.5);
}

let forceDistMult = 1, forceChargeMult = 1;
let labelsHidden = false, pathfinderActive = false;
let linkingState = { active: false, sourceNode: null };
let pathfinderState = { active: false, source: null, target: null };

function initD3Visualization() {
    // Normalizza le label dei nodi in-place: rimuove decorazioni markdown
    // (+, **, virgolette, troncamenti) iniettate da alcuni modelli. Idempotente:
    // sistema sia la visualizzazione sia l'export vault (che legge appState.db.nodes).
    if (appState.db && Array.isArray(appState.db.nodes)) {
        appState.db.nodes.forEach(n => {
            if (n.label) {
                const cleaned = cleanLabel(n.label);
                if (cleaned) n.label = cleaned;
            }
        });
    }

    const container = document.getElementById("d3-container");
    container.innerHTML = "";

    let width = container.clientWidth || window.innerWidth * 0.75;
    let height = container.clientHeight || window.innerHeight;

    svg = d3.select("#d3-container")
        .append("svg")
        .attr("id", "map-svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .on("click", handleBackgroundClick)
        .on("contextmenu", (e) => window.showContextMenu(e, 'bg', null))
        .on("touchstart", (e) => handleTouchStart(e, 'bg', null))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    const defs = svg.append("defs");
    // Marker arrowhead default (grigio)
    defs.append("marker")
        .attr("id", "arrowhead").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#94a3b8");
    // Marker arrowhead invertito default (per link bidirezionali — marker-start)
    defs.append("marker")
        .attr("id", "arrowhead-rev").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#94a3b8");
    // Un marker per ogni famiglia di relazione (usato dalla lente)
    if (typeof EDGE_FAMILIES === 'object') {
        Object.entries(EDGE_FAMILIES).forEach(([key, fam]) => {
            defs.append("marker")
                .attr("id", `arrowhead-${key}`).attr("viewBox", "0 -5 10 10")
                .attr("refX", 10).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
                .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", fam.color);
            // Versione invertita per marker-start (link bidirezionali colorati)
            defs.append("marker")
                .attr("id", `arrowhead-rev-${key}`).attr("viewBox", "0 -5 10 10")
                .attr("refX", 10).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
                .attr("orient", "auto-start-reverse")
                .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", fam.color);
        });
    }

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            // Raddoppiato lo spessore dell'outline bianca dei testi (richiesta utente)
            const k = event.transform.k;
            const strokeW = Math.max(1.2, (2.4 / k));
            g.selectAll(".node-text").style("stroke-width", strokeW + "px");
            if (window.applyDeepNodeDim) window.applyDeepNodeDim(k);
        });
    svg.call(zoom);

    window.updateDegreeStats();
    renderGraph();
    window.renderTreeView();

    if (isPinned && simulation && !simulation.alpha()) {
        setTimeout(() => window.applyPinning(true), 1500);
    }
}

function renderGraph() {
    if (!g) return; // SVG non ancora inizializzato (es. Phase4 che gira prima di initD3Visualization)
    if (window.renderStudySets) window.renderStudySets();
    const nodes = appState.db.nodes;
    // Guard: scarta i link orfani (endpoint senza nodo corrispondente). Un solo link
    // rotto fa lanciare d3-force ("node not found: <id>") e svuota TUTTO il canvas.
    // Mutiamo in-place così la corruzione non viene salvata nel vault.
    if (Array.isArray(appState.db.links)) {
        const _nodeIds = new Set(nodes.map(n => n.id));
        const _eid = x => (x && typeof x === 'object') ? x.id : x;
        const _before = appState.db.links.length;
        appState.db.links = appState.db.links.filter(l => _nodeIds.has(_eid(l.source)) && _nodeIds.has(_eid(l.target)));
        const _dropped = _before - appState.db.links.length;
        if (_dropped > 0) console.warn(`[MappAI] Scartati ${_dropped} link orfani (endpoint mancante) prima del render D3.`);
    }
    const links = appState.db.links;

    // 1. Identify existing group IDs to avoid collisions
    const usedGroups = new Set();
    nodes.forEach(n => {
        if (n.group !== undefined && n.group !== null) usedGroups.add(n.group);
    });

    // 2. Assign unique, persistent group IDs to Level 1 nodes (Macroareas)
    let nextGroup = 1;
    nodes.filter(n => n.level === 1).forEach(n => {
        if (n.group === undefined || n.group === null) {
            while (usedGroups.has(nextGroup)) nextGroup++;
            n.group = nextGroup;
            usedGroups.add(nextGroup);
        }
    });

    function getParentGroup(nodeId) {
        const isKG = appState.extractionMode === 'kg';

        if (isKG) {
            // KG: cerca qualsiasi Hub L1 collegato (in qualsiasi direzione, BFS)
            const visited = new Set();
            const queue = [nodeId];
            visited.add(nodeId);
            while (queue.length > 0) {
                const cur = queue.shift();
                const curNode = nodes.find(x => x.id === cur);
                if (curNode && curNode.level === 1) return curNode.group;

                links.forEach(l => {
                    const sId = typeof l.source === 'object' ? l.source.id : l.source;
                    const tId = typeof l.target === 'object' ? l.target.id : l.target;
                    if (sId === cur && !visited.has(tId)) { visited.add(tId); queue.push(tId); }
                    if (tId === cur && !visited.has(sId)) { visited.add(sId); queue.push(sId); }
                });
                if (visited.size > 50) break; // Sicurezza anti-loop
            }
            return 1; // Default se nessun Hub trovato
        }

        // Mind Map: risali la catena gerarchica (comportamento originale)
        let currentId = nodeId;
        let safeCounter = 0;
        while (safeCounter < 100) {
            safeCounter++;
            let n = nodes.find(x => x.id === currentId);
            if (!n) return 1;
            if (n.level === 1) return n.group;
            if (n.level === 0) return 1;

            let l = links.find(link => {
                let targetId = typeof link.target === 'object' ? link.target.id : link.target;
                return targetId === currentId && !link.isCross;
            });
            if (!l) return 1;
            currentId = typeof l.source === 'object' ? l.source.id : l.source;
        }
        return 1;
    }

    nodes.filter(n => n.level >= 2).forEach(n => {
        n.group = getParentGroup(n.id);
    });

    // Calcolo del peso dei nodi (Strategia 3)
    nodes.forEach(n => {
        n.weight = links.filter(l => {
            let sId = typeof l.source === 'object' ? l.source.id : l.source;
            let tId = typeof l.target === 'object' ? l.target.id : l.target;
            return sId === n.id || tId === n.id;
        }).length;
    });

    const isKG = appState.extractionMode === 'kg';

    // ── Approccio 1: Pre-posizionamento nodi prima della simulazione ──────────
    // Solo al primo render (nodi senza x/y). Dà alla simulazione un punto di
    // partenza strutturato invece di posizioni casuali.
    if (nodes.every(n => n.x === undefined)) {
        if (isKG) {
            // KG: hub in cerchio, nodi L2 distribuiti attorno al loro hub primario
            const hubs = nodes.filter(n => n.level === 1);
            const hubRadius = Math.max(220, hubs.length * 65);
            hubs.forEach((hub, i) => {
                const angle = (i / hubs.length) * 2 * Math.PI - Math.PI / 2;
                hub.x = Math.cos(angle) * hubRadius;
                hub.y = Math.sin(angle) * hubRadius;
            });
            const hubByGroup = {};
            hubs.forEach(h => { hubByGroup[h.group] = h; });
            nodes.filter(n => n.level >= 2).forEach(n => {
                const hub = hubByGroup[n.group];
                const angle = Math.random() * 2 * Math.PI;
                const r = 130 + Math.random() * 90;
                n.x = hub ? hub.x + Math.cos(angle) * r : (Math.random() - 0.5) * 400;
                n.y = hub ? hub.y + Math.sin(angle) * r : (Math.random() - 0.5) * 400;
            });
        } else {
            // MM: layout gerarchico radiale — root al centro, ogni livello su
            // cerchi concentrici, ogni ramo occupa un settore angolare proporzionale.
            const root = nodes.find(n => n.level === 0);
            if (root) { root.x = 0; root.y = 0; }
            const l1Nodes = nodes.filter(n => n.level === 1);
            const numL1 = l1Nodes.length || 1;
            const mmRadii = [0, 280, 460, 630, 780, 920];
            const sectors = {};

            // Mappa parent: target → source (solo link non-cross)
            const mmParentMap = {};
            links.forEach(l => {
                if (l.isCross) return;
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                const tgt = typeof l.target === 'object' ? l.target.id : l.target;
                if (!mmParentMap[tgt]) mmParentMap[tgt] = src;
            });

            // Posiziona L1 sul primo cerchio e assegna loro un settore angolare
            l1Nodes.forEach((n, i) => {
                const minA = (i / numL1) * 2 * Math.PI;
                const maxA = ((i + 1) / numL1) * 2 * Math.PI;
                const mid = (minA + maxA) / 2 - Math.PI / 2;
                n.x = Math.cos(mid) * mmRadii[1];
                n.y = Math.sin(mid) * mmRadii[1];
                sectors[n.id] = { min: minA, max: maxA };
            });

            // Ricorsione: piazza i figli nel settore del genitore al livello successivo
            function placeMMChildren(parentId, level) {
                if (level > 5) return;
                const children = nodes.filter(n => mmParentMap[n.id] === parentId);
                if (!children.length) return;
                const pSec = sectors[parentId] || { min: 0, max: 2 * Math.PI };
                const span = pSec.max - pSec.min;
                const r = mmRadii[level] || (280 + level * 150);
                children.forEach((child, ci) => {
                    const cMin = pSec.min + (ci / children.length) * span;
                    const cMax = pSec.min + ((ci + 1) / children.length) * span;
                    child.x = Math.cos((cMin + cMax) / 2 - Math.PI / 2) * r;
                    child.y = Math.sin((cMin + cMax) / 2 - Math.PI / 2) * r;
                    sectors[child.id] = { min: cMin, max: cMax };
                    placeMMChildren(child.id, level + 1);
                });
            }
            l1Nodes.forEach(n => placeMMChildren(n.id, 2));
            if (root) placeMMChildren(root.id, 1);
        }
    }

    if (!simulation) {
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
                let baseDist = (d.source.level === 0) ? 200 : 140;
                if (isKG) baseDist = 200;
                return baseDist * forceDistMult;
            }))
            .force("collide", d3.forceCollide().radius(d => {
                let extraPadding = 50 + (d.weight * 5);
                if (extraPadding > 150) extraPadding = 150;
                return getNodeRadius(d) + extraPadding;
            }).iterations(3))
            .force("charge", d3.forceManyBody().strength(d => {
                let baseCharge = (d.level === 0 ? -1500 : -500);
                if (isKG && d.level === 1) baseCharge = -1000;
                return (baseCharge - (d.weight * 50)) * forceChargeMult;
            }))
            .force("center", d3.forceCenter(0, 0))
            .force("radial", d3.forceRadial(d => {
                if (isKG) {
                    return d.level === 1 ? 250 : 550;
                } else {
                    if (d.level === 0) return 0;
                    if (d.level === 1) return 300;
                    if (d.level === 2) return 500;
                    return 700;
                }
            }, 0, 0).strength(isKG ? 0.3 : 0.15)); // MM: forza radiale ridotta, il layout è già strutturato

        // ── Approccio 2 (KG): force cluster — attrae L2 verso il loro hub primario
        if (isKG) {
            simulation.force("cluster", alpha => {
                const hubByGroup = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubByGroup[h.group] = h; });
                appState.db.nodes.forEach(n => {
                    if (n.level < 2 || (n.fx !== undefined && n.fx !== null)) return;
                    const hub = hubByGroup[n.group];
                    if (!hub) return;
                    n.vx += (hub.x - n.x) * alpha * 0.12;
                    n.vy += (hub.y - n.y) * alpha * 0.12;
                });
            });
        }

        // Raffreddamento statico invisibile
        simulation.stop();
        simulation.tick(300);

        simulation.on("tick", tick);
        if (appState.layoutMode !== 'default') window.applyLayoutForces();
    } else {
        simulation.nodes(nodes);
        simulation.force("link").links(links).distance(d => {
            let baseDist = (d.source.level === 0) ? 200 : 140;
            if (isKG) baseDist = 200;
            return baseDist * forceDistMult;
        });
        simulation.force("collide").radius(d => {
            let extraPadding = 50 + (d.weight * 5);
            if (extraPadding > 150) extraPadding = 150;
            return getNodeRadius(d) + extraPadding;
        });
        simulation.force("charge").strength(d => {
            let baseCharge = (d.level === 0 ? -1500 : -500);
            if (isKG && d.level === 1) baseCharge = -1000;
            return (baseCharge - (d.weight * 50)) * forceChargeMult;
        });

        // Aggiorna/rimuovi cluster force in base alla modalità corrente
        if (isKG) {
            simulation.force("cluster", alpha => {
                const hubByGroup = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubByGroup[h.group] = h; });
                appState.db.nodes.forEach(n => {
                    if (n.level < 2 || n.fx !== undefined && n.fx !== null) return;
                    const hub = hubByGroup[n.group];
                    if (!hub) return;
                    n.vx += (hub.x - n.x) * alpha * 0.12;
                    n.vy += (hub.y - n.y) * alpha * 0.12;
                });
            });
        } else {
            simulation.force("cluster", null);
        }

        // Raffreddamento statico invisibile
        simulation.stop();
        simulation.tick(300);

        if (appState.layoutMode !== 'default') window.applyLayoutForces();
        simulation.alpha(0.3).restart();
    }

    const linkSelection = g.selectAll(".link-group").data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.rel}`);
    const linkEnter = linkSelection.enter().append("g").attr("class", "link-group")
        .style("opacity", 0) // Cascading animation start

        .on("contextmenu", (e, d) => window.showContextMenu(e, 'link', d))
        .on("touchstart", (e, d) => handleTouchStart(e, 'link', d))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    linkEnter.append("path").attr("class", "link").attr("fill", "none").attr("stroke", "#94a3b8").attr("stroke-width", 1.5).attr("marker-end", "url(#arrowhead)");
    linkEnter.append("text").attr("class", "link-label").attr("text-anchor", "middle").attr("dy", -4).text(d => d.rel);

    const linkMerge = linkEnter.merge(linkSelection);
    linkMerge.select("text.link-label")
        .text(d => d.rel)
        .style("font-size", (8 * globalFontScale * 0.765) + "px");
    linkMerge.classed("ai-suggested", d => d.aiSuggested === true);
    // Marker-start per link bidirezionali
    linkMerge.select('.link')
        .attr('marker-start', d => d.bidirectional ? 'url(#arrowhead-rev)' : null);
    linkSelection.exit().remove();

    // ── Stile KG per ruolo strutturale + bridge marking (1-hop) ─────────────
    // Vedi public/js/mappai-node-styling.js. Annota _role, _bridgeInfo,
    // _opacity, _strokeW su ogni nodo per ridurre la dispersione visiva.
    if (appState.extractionMode === 'kg') {
        const groupColors = {};
        nodes.filter(n => n.level === 1).forEach(h => {
            groupColors[h.group] = (appState.db.customColors && appState.db.customColors[h.group])
                ? appState.db.customColors[h.group]
                : (colorScale[h.group] || colorScale[1] || "#ef4444");
        });
        if (appState.db.customColors && appState.db.customColors[0] !== undefined) {
            groupColors[0] = appState.db.customColors[0];
        } else if (colorScale[0]) {
            groupColors[0] = colorScale[0];
        }

        if (window.MappAINodeStyling) {
            window.MappAINodeStyling.annotate(nodes, links, groupColors);
        }

        // Compat: alcuni punti del codice leggono hubColors/hubWeights.
        // Manteniamo le chiavi vuote per i nodi che non avranno segmenti hub-based.
        nodes.forEach(n => {
            if (n._bridgeInfo && n._bridgeInfo.segments) {
                n.hubColors = n._bridgeInfo.segments.map(s => s.color);
                n.hubWeights = {};
                n._bridgeInfo.segments.forEach(s => { n.hubWeights[s.color] = s.fraction; });
            } else {
                n.hubColors = [];
                n.hubWeights = {};
            }
        });
    }

    const nodeSelection = g.selectAll(".node-group").data(nodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
        .style("opacity", 0) // Cascading animation start
        .call(drag(simulation))
        .on("click", window.handleNodeClick)
        .on("dblclick", (e, d) => { e.stopPropagation(); window.openEditModal(d); })
        .on("contextmenu", (e, d) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, 'node', d); });

    // Hitbox invisibile: aumenta la zona cliccabile attorno al nodo
    // (utile per nodi piccoli, es. PATH su KG L2+)
    nodeEnter.append("circle")
        .attr("class", "node-hitbox")
        .attr("fill", "transparent")
        .attr("stroke", "none");

    nodeEnter.append("circle").attr("class", "node-circle");

    // Contenitore per gli archi segmentati (solo KG)
    nodeEnter.append("g").attr("class", "node-segments");

    nodeEnter.append("text").attr("class", "node-text")
        .attr("text-anchor", "middle")
        .attr("fill", "#0f172a")
        .style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            else if (d.level >= 5) baseSize = 8 * Math.pow(0.93, d.level - 5);
            return (baseSize * globalFontScale) + "px";
        });

    // Placeholder per compatibilità con il select("g.node-date-badge") nel merge — sempre nascosto.
    nodeEnter.append("g").attr("class", "node-date-badge").style("display", "none");

    nodeEnter.append("foreignObject")
        .attr("class", "node-icons-fo pointer-events-none")
        .attr("pointer-events", "none") // attributo SVG: bulletproof, non dipende da Tailwind CDN
        .attr("width", 100)
        .attr("height", 20)
        .attr("x", -50)
        .attr("y", 0);

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Hitbox: raggio +10px rispetto al cerchio visibile (più tolleranza al click)
    nodeMerge.select("circle.node-hitbox")
        .attr("r", d => getNodeRadius(d) + 10);

    nodeMerge.select("circle.node-circle")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", d => {
            if (appState.extractionMode === 'kg' && d.level > 1) return "#e2e8f0"; // Grigio Slate-200 per KG (migliore visibilità)
            let baseColor;
            if (d.level === 0) {
                baseColor = (appState.db.customColors && appState.db.customColors[0])
                    ? appState.db.customColors[0]
                    : colorScale[0];
                return baseColor;
            }
            baseColor = (appState.db.customColors && appState.db.customColors[d.group])
                ? appState.db.customColors[d.group]
                : (colorScale[d.group] || colorScale[1]);
            let hsl = d3.hsl(baseColor);
            hsl.l = Math.min(0.95, hsl.l + (d.level - 1) * 0.08);
            return hsl.toString();
        })
        .attr("stroke", d => {
            if (appState.extractionMode === 'kg') {
                if (d.level === 1) return "none"; // Super Hub senza outline
                if (d.level > 1) return "none"; // Gestito dai segmenti
            }
            if (d.studyStatus === 'done') return '#22c55e';
            if (d.studyStatus === 'review') return '#f59e0b';
            if (d.studyStatus === 'todo') return '#ef4444';

            let baseColor;
            if (d.level === 0) {
                return (appState.db.customColors && appState.db.customColors[0])
                    ? appState.db.customColors[0]
                    : colorScale[0];
            }
            return (appState.db.customColors && appState.db.customColors[d.group])
                ? appState.db.customColors[d.group]
                : (colorScale[d.group] || colorScale[d.level !== undefined ? d.level : 1] || "#333");
        })
        .attr("stroke-width", d => {
            if (appState.extractionMode === 'kg') return 0; // Tutto gestito via fill o segmenti
            if (d.studyStatus && d.studyStatus !== 'none') return d.level === 0 ? 6 : 4;
            return 2; // Outline base visibile
        });

    // Gestione anello colorato KG (bridge marking + role-based thickness)
    nodeMerge.select(".node-segments").each(function (d) {
        const container = d3.select(this);
        container.selectAll("*").remove();

        if (appState.extractionMode === 'kg' && d.level > 1) {
            const r = getNodeRadius(d);
            const strokeW = (d._strokeW !== undefined) ? d._strokeW : 3;
            const segs = window.MappAINodeStyling
                ? window.MappAINodeStyling.getRingSegments(d)
                : null;

            if (segs && segs.length) {
                let cumAngle = 0;
                segs.forEach(s => {
                    const arc = d3.arc()
                        .innerRadius(r)
                        .outerRadius(r + strokeW)
                        .startAngle(cumAngle)
                        .endAngle(cumAngle + s.fraction * 2 * Math.PI);
                    container.append("path").attr("d", arc).attr("fill", s.color);
                    cumAngle += s.fraction * 2 * Math.PI;
                });
            } else {
                container.append("circle")
                    .attr("r", r + 1.5)
                    .attr("fill", "none")
                    .attr("stroke", "#cbd5e1")
                    .attr("stroke-width", 2);
            }
        }
    });

    // Helper word-wrap condiviso tra text e badge
    const wrapLabel = (s, maxPerLine, maxLines) => {
        if (!s || s.length <= maxPerLine) return [s || ''];
        const words = s.split(/\s+/);
        const out = [];
        let cur = '';
        words.forEach(w => {
            if (!cur) { cur = w; }
            else if ((cur + ' ' + w).length <= maxPerLine) { cur += ' ' + w; }
            else { out.push(cur); cur = w; }
        });
        if (cur) out.push(cur);
        if (out.length > maxLines) {
            const head = out.slice(0, maxLines - 1);
            head.push(out.slice(maxLines - 1).join(' '));
            return head;
        }
        return out;
    };

    // Wrap per-parola: 2 parole significative → 2 righe, 3 → 3 righe.
    // Le parole-funzione (articoli, preposizioni semplici e articolate,
    // congiunzioni) non contano e restano attaccate alla parola significativa
    // successiva: "La Guerra Fredda" → ["La Guerra", "Fredda"], "Ciclo di
    // Calvin" → ["Ciclo", "di Calvin"], "ATP e NADPH" → ["ATP", "e NADPH"].
    // I token elisi ("L'Esercito") sono un'unica parola e contano come 1.
    const LABEL_FUNCTION_WORDS = new Set([
        // articoli
        'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
        // preposizioni semplici
        'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
        // preposizioni articolate
        'del', 'dello', 'della', 'dei', 'degli', 'delle',
        'al', 'allo', 'alla', 'ai', 'agli', 'alle',
        'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
        'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
        'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
        // congiunzioni
        'e', 'ed', 'o', 'od',
        // inglese (label EN)
        'the', 'an', 'of', 'to', 'and', 'or', 'for', 'with', 'in', 'on'
    ]);
    const splitLabelWords = (s) => {
        const tokens = String(s || '').trim().split(/\s+/).filter(Boolean);
        const groups = [];
        let pending = [];
        tokens.forEach(t => {
            const bare = t.toLowerCase().replace(/[^\p{L}']/gu, '');
            if (LABEL_FUNCTION_WORDS.has(bare)) { pending.push(t); return; }
            groups.push(pending.concat(t).join(' '));
            pending = [];
        });
        // parola-funzione in coda senza parola dopo: resta sull'ultima riga
        if (pending.length) {
            if (groups.length) groups[groups.length - 1] += ' ' + pending.join(' ');
            else groups.push(pending.join(' '));
        }
        return groups;
    };

    nodeMerge.select("text.node-text")
        .style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            else if (d.level >= 5) baseSize = 8 * Math.pow(0.93, d.level - 5);
            return (baseSize * globalFontScale) + "px";
        });

    nodeMerge.select("text.node-text")
        .each(function (d) {
            const textEl = d3.select(this);
            const labelStr = cleanLabel(d.label);
            const dateParsed = extractDateFromLabel(labelStr);
            const nameStr = dateParsed ? dateParsed.name : labelStr;

            let lines;
            const wordGroups = splitLabelWords(nameStr);
            if (nameStr.indexOf('\n') !== -1) {
                lines = getLabelLines(nameStr);
            } else if (wordGroups.length === 2 || wordGroups.length === 3) {
                // 2 parole significative → 2 righe, 3 → 3 righe (una per riga)
                lines = wordGroups;
            } else if (d.level >= 4) {
                lines = wrapLabel(nameStr, 16, 3);
            } else if (d.level === 3) {
                lines = wrapLabel(nameStr, 20, 3);
            } else {
                lines = wrapLabel(nameStr, 24, 3);
            }

            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));

            const DATE_GAP = 1.5;  // interlinea data→nome, leggermente maggiore del wrap
            const LINE_GAP = 1.1;  // interlinea tra righe del nome (word-wrap)

            textEl.text('');

            if (dateParsed) {
                // Centra il blocco [DATA + righe nome] nel cerchio
                const totalSpan = DATE_GAP + (lines.length - 1) * LINE_GAP;
                let firstDy = 0.35 - totalSpan / 2;
                if (hasIcons) firstDy -= 0.6;

                textEl.append('tspan').attr('x', 0).attr('dy', `${firstDy}em`).text(dateParsed.date);
                lines.forEach((line, i) => {
                    textEl.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? `${DATE_GAP}em` : `${LINE_GAP}em`)
                        .text(line);
                });
            } else {
                let firstDy = 0.35 - ((lines.length - 1) * 0.55);
                if (hasIcons) firstDy -= 0.6;
                lines.forEach((line, i) => {
                    textEl.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? `${firstDy}em` : `${LINE_GAP}em`)
                        .text(line);
                });
            }
        });

    // Il date-badge separato non è più usato: la data è nel tspan sopra.
    nodeMerge.select("g.node-date-badge").style("display", "none");

    nodeMerge.select("foreignObject.node-icons-fo")
        .attr("pointer-events", "none") // applica su tutti i nodi (enter + merge)
        // Dimensione conditional: se non ha icone, riduco a 1×1 per non bloccare i click
        .attr("width", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? 100 : 1;
        })
        .attr("height", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? 20 : 1;
        })
        .attr("x", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? -50 : 0;
        })
        .attr("y", d => {
            const labelStr = cleanLabel(d.label);
            const lines = getLabelLines(labelStr);
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            if (!hasIcons) return 0;

            // Place below the text lines
            const baseSize = (d.level === 0 ? 14 : (d.level === 1 ? 12 : (d.level === 2 ? 10 : 9)));
            const fontSize = baseSize * globalFontScale;
            return (lines.length * (fontSize * 0.6)) + 4;
        })
        .html(d => {
            let icons = [];
            const outlineClass = "node-icon-outline";
            const vis = d.iconVisibility || { text: true, image: true, link: true };

            // JIGSAW: lucchetto sui capi-ramo bloccati (ramo altrui / zona docente). Solo L0-L1 per non intasare.
            if (window.MappAIJigsaw && window.MappAIJigsaw.isEnabled() && d.level <= 1 && !window.MappAIJigsaw.canEdit(d)) {
                icons.push(`<i data-lucide="lock" class="w-3 h-3 text-rose-500 ${outlineClass}"></i>`);
            }

            if (d.hasCustomText && vis.text) icons.push(`<i data-lucide="pencil" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);

            // Multiple images
            if (vis.image) {
                const imgs = d.images || (d.image ? [d.image] : []);
                if (imgs.length > 0) icons.push(`<i data-lucide="image" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
            }

            // Multiple links
            const urls = d.urls || (d.url ? [d.url] : []);
            urls.forEach(u => {
                if (u.startsWith('file://')) {
                    if (vis.file !== false) icons.push(`<i data-lucide="database" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
                } else {
                    if (vis.link !== false) icons.push(`<i data-lucide="link" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
                }
            });

            // Tutor Icon (if chat history exists)
            if (tutorState.nodes[d.id] && tutorState.nodes[d.id].history.length > 0) {
                icons.push(`<i data-lucide="brain" class="w-3 h-3 text-indigo-600 ${outlineClass}"></i>`);
            }

            if (d.hasFile && vis.file !== false) icons.push(`<i data-lucide="database" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);

            if (icons.length === 0) return "";
            // Limit to 4 icons for visual clarity
            const limitedIcons = icons.slice(0, 4);
            return `<div style="display:flex; align-items:center; justify-content:center; gap:1px; width:100%; height:100%; opacity:0.9; pointer-events:none;">${limitedIcons.join('')}</div>`;
        })
        .each(function () {
            if (window.lucide && window.lucide.createIcons) {
                window.lucide.createIcons({ root: this });
            }
        });

    nodeSelection.exit().remove();
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);

    // Adatta il max dello slider di profondità alla profondità reale della mappa.
    // Necessario quando operazioni come relink o merge creano nodi oltre L5.
    const ls = document.getElementById('level-slider');
    if (ls) {
        const actualMax = nodes.reduce((m, n) => Math.max(m, n.level || 0), 5);
        const sliderMax = parseInt(ls.max);
        if (actualMax !== sliderMax) {
            const wasAtMax = parseInt(ls.value) === sliderMax;
            ls.max = actualMax;
            if (wasAtMax) {
                ls.value = actualMax;
                const lv = document.getElementById('level-slider-val');
                if (lv) lv.textContent = 'L' + actualMax;
            }
        }
    }

    window.applyVisualFilters();
    // Riapplica la lente relazioni se attiva (dopo ogni render)
    if (window.activeLensFamily) window.applyLensFamily();
    // Applica il filtro di visibilità link (cycle 3 stati)
    if (window.linkVisibilityMode && window.linkVisibilityMode !== 'all') window.applyLinkVisibility();

    // Applica subito le posizioni pre-calcolate (tick manuale)
    tick();

    // Animazione a cascata per svelamento progressivo (Strategia 4)
    // Link appaiono tutti insieme con delay
    linkEnter.transition().duration(800).delay(500).style("opacity", 1);

    // I nodi vecchi (merge senza enter) mantengono opacità modulata per ruolo
    // (foglie attenuate a 0.65 in KG, vedi mappai-node-styling.js)
    nodeSelection.style("opacity", d => (d._opacity !== undefined) ? d._opacity : 1);
    linkSelection.style("opacity", 1);

    // I nodi nuovi appaiono a scaglioni in base al livello, target = _opacity
    nodeEnter.transition().duration(600).delay(d => {
        if (d.level === 0) return 0;
        if (d.level === 1) return 400;
        if (d.level === 2) return 800;
        return 1200;
    }).style("opacity", d => (d._opacity !== undefined) ? d._opacity : 1);

    window.applyDeepNodeDim();
}

// Effetto dim sui nodi L5+: più profondi = più trasparenti quando si è in panoramica;
// a zoom = 1 i nodi sono completamente opachi.
window.applyDeepNodeDim = function (k) {
    if (k === undefined) {
        const svgNode = document.getElementById('map-svg');
        k = svgNode ? d3.zoomTransform(svgNode).k : 1;
    }
    if (!g) return;
    g.selectAll(".node-group").each(function (d) {
        if (!d || d.level < 5) return;
        const depth = d.level - 5;              // 0 per L5, 1 per L6, 2 per L7 …
        const minOp = Math.max(0.12, 0.88 - depth * 0.18); // L5:0.88 L6:0.70 L7:0.52 L8:0.34
        const opacity = minOp + (1 - minOp) * Math.min(1, k);
        d3.select(this).style("opacity", opacity);
    });
};

function tick() {
    if (!g) return;
    g.selectAll(".link").each(function (d) {
        const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
        const ux = (tx - sx) / len, uy = (ty - sy) / len;
        const rs = getNodeRadius(d.source);
        const rt = getNodeRadius(d.target);
        const x1 = sx + ux * rs, y1 = sy + uy * rs;
        const x2 = tx - ux * rt, y2 = ty - uy * rt;
        let pathD;
        if (d.bidirectional) {
            // Curva quadratica Bezier: offset perpendolare di 40px per distinguerla
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const cx = mx - uy * 40, cy = my + ux * 40;
            pathD = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
        } else {
            pathD = `M${x1},${y1} L${x2},${y2}`;
        }
        d3.select(this).attr("d", pathD);
    });
    g.selectAll(".link-label").each(function (d) {
        const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        let lx, ly;
        if (d.bidirectional) {
            const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
            const ux = (tx - sx) / len, uy = (ty - sy) / len;
            const mx = (sx + tx) / 2, my = (sy + ty) / 2;
            // Midpoint visivo della curva Bezier = 0.5*(punto di controllo) spostato
            lx = mx - uy * 20;
            ly = my + ux * 20;
        } else {
            lx = sx + (tx - sx) * 0.67;
            ly = sy + (ty - sy) * 0.67;
        }
        d3.select(this).attr("x", lx).attr("y", ly);
    });
    g.selectAll(".node-group").attr("transform", d => `translate(${d.x},${d.y})`);
}

function drag(simulation) {
    let dragStartPos = null;
    let longPressTimer = null;
    let longPressTriggered = false;
    let hasMovedSignificant = false;

    function dragstarted(event) {
        longPressTriggered = false;
        hasMovedSignificant = false;
        const sourceEvt = event.sourceEvent;

        if (sourceEvt) {
            const touch = sourceEvt.touches ? sourceEvt.touches[0] : sourceEvt;
            dragStartPos = { x: touch.clientX, y: touch.clientY };
        } else {
            dragStartPos = { x: event.x, y: event.y };
        }

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            window.ignoreNextNodeClick = true;
            const clientX = dragStartPos.x, clientY = dragStartPos.y;
            window.showContextMenu({
                preventDefault: () => { if (sourceEvt?.preventDefault) sourceEvt.preventDefault(); },
                stopPropagation: () => { if (sourceEvt?.stopPropagation) sourceEvt.stopPropagation(); },
                clientX, clientY
            }, 'node', event.subject);
            longPressTimer = null;
        }, 500);

        // Garantisce sempre tick visivi durante il drag, a qualsiasi livello di energia
        if (!event.active) {
            const targetAlpha = (isPinned || !attractionEnabled) ? 0.05 : 0.3;
            simulation.alphaTarget(targetAlpha).restart();
        }
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        if (dragStartPos) {
            const sourceEvt = event.sourceEvent;
            const touch = sourceEvt?.touches?.[0] ?? sourceEvt;
            const curX = touch ? touch.clientX : event.x;
            const curY = touch ? touch.clientY : event.y;
            const dist = Math.hypot(curX - dragStartPos.x, curY - dragStartPos.y);
            if (dist > 10) {
                hasMovedSignificant = true;
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            }
        }
        if (longPressTriggered) return;
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

        // Riporta la simulazione allo stato corretto dopo il drag
        if (!event.active) {
            simulation.alphaTarget(attractionEnabled && !isPinned ? 0 : 0);
        }

        if (longPressTriggered) {
            longPressTriggered = false;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 100);
            return;
        }

        // ── Logica posizione finale ──────────────────────────────────────────
        // Regola unica: se fisica attiva e pin spento → rilascia (la fisica decide).
        //               altrimenti → fissa il nodo nella posizione corrente.
        // L0 (root) è sempre al centro quando la fisica è attiva.

        const releaseToPhysics = attractionEnabled && !isPinned;

        if (!hasMovedSignificant) {
            // Tap/click: ripristina esattamente la posizione precedente
            if (releaseToPhysics && event.subject.level === 0) {
                event.subject.fx = 0; event.subject.fy = 0;
            } else if (releaseToPhysics) {
                event.subject.fx = null; event.subject.fy = null;
            } else {
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }
            window.handleNodeClick(event.sourceEvent, event.subject);
            window.ignoreNextNodeClick = true;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 300);
            return;
        }

        // Drag significativo
        if (releaseToPhysics) {
            if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; }
            else { event.subject.fx = null; event.subject.fy = null; }
        } else {
            // Pin ON o attrazione OFF: re-pinna nella nuova posizione
            if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; }
            else { event.subject.fx = event.x; event.subject.fy = event.y; }
        }
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

window.applyPinning = function (pinned) {
    isPinned = pinned;
    const btn = document.getElementById('card-btn-physics');
    appState.db.nodes.forEach(n => { n.fx = pinned ? n.x : null; n.fy = pinned ? n.y : null; });
    if (pinned) {
        // Azzera tutte le forze: i nodi non si muovono da soli
        simulation.force("charge", d3.forceManyBody().strength(0));
        simulation.force("link").strength(0);
        simulation.force("collide", null);
        simulation.velocityDecay(0.8);
        // NON fermare la simulazione: servono i tick per il feedback visivo del drag
        simulation.alphaTarget(0).alpha(0.05);
        if (btn) { btn.classList.replace('bg-slate-100', 'bg-blue-50'); btn.classList.replace('text-slate-600', 'text-blue-600'); }
    } else {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult));
        simulation.force("link").strength(1);
        simulation.force("collide", d3.forceCollide().radius(d => getNodeRadius(d) + 4).strength(0.7));
        simulation.velocityDecay(0.4);
        simulation.alpha(0.3).alphaTarget(0).restart();
        if (btn) { btn.classList.replace('bg-blue-50', 'bg-slate-100'); btn.classList.replace('text-blue-600', 'text-slate-600'); }
    }
};

window.togglePhysics = function () { window.applyPinning(!isPinned); };

window.toggleAttraction = function () {
    if (!simulation) return;
    attractionEnabled = !attractionEnabled;
    const btn = document.getElementById('toggle-attraction-btn');

    if (attractionEnabled) {
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        simulation.force("link").strength(1);
        simulation.alpha(0.3).alphaTarget(0).restart();
        if (btn) btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition";
    } else {
        simulation.force("charge").strength(0);
        simulation.force("link").strength(0);
        // Non fermare la simulazione: serve per il drag visivo
        simulation.alphaTarget(0);
        if (btn) btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition";
    }
    if (btn) {
        btn.innerHTML = '<i data-lucide="magnet" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">ATTR</span>';
        window.safeCreateIcons();
    }
};

window.changeFontScale = function (dir) {
    globalFontScale = Math.max(0.5, Math.min(2.5, globalFontScale + (dir * 0.1)));
    if (g) {
        g.selectAll("text.node-text").style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            return (baseSize * globalFontScale) + "px";
        });

        g.selectAll("text.link-label").style("font-size", (8 * globalFontScale * 0.765) + "px");
    }
};

window.exportSnapshot = async function () {
    try {
        if (!window.electronAPI || !window.electronAPI.capturePage) {
            throw new Error(window.t('err_png_ipad', "La cattura PNG non è supportata su iPadOS. Usa l'esportazione SVG (Vettoriale)!"));
        }

        window.showToast(window.t('tst_png_capturing', "Cattura immagine pulita in corso..."), "info");

        // Attiva modalità snapshot (nasconde UI)
        document.body.classList.add('is-snapshotting');

        // Attendi un frame per il reflow del layout
        await new Promise(resolve => setTimeout(resolve, 150));

        const dataUrl = await window.electronAPI.capturePage();

        // Ripristina UI
        document.body.classList.remove('is-snapshotting');

        if (!dataUrl) throw new Error(window.t('err_screen_capture', "Errore durante la cattura dello schermo"));

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `MappAI_Snapshot_${new Date().getTime()}.png`, { type: 'image/png' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta Snapshot",
                    text: "Snapshot della mappa mentale creato con MappAI"
                });
                window.showToast(window.t('tst_png_shared', "Snapshot condiviso con successo!"), "success");
            } else {
                throw new Error(window.t('err_share_unsupported', "Condivisione file non supportata da questo dispositivo"));
            }
        } else {
            const a = document.createElement("a");
            a.download = `MappAI_Snapshot_${new Date().getTime()}.png`;
            a.href = dataUrl;
            a.click();
            window.showToast(window.t('tst_png_done', "Snapshot PNG (Clean) creato con successo!"), "success");
        }
    } catch (err) {
        document.body.classList.remove('is-snapshotting');
        console.error("Errore Snapshot:", err);
        window.showToast(err.message, "error");
    }
};

// Clona #map-svg incorporando gli stili CSS rilevanti (nodi/link/testi) in un
// <style> inline: base comune per l'export SVG e per il PDF vettoriale.
function _svgCloneWithStyles() {
    const svgElement = document.getElementById("map-svg");
    if (!svgElement) throw new Error("Mappa SVG non trovata nel documento");
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.removeAttribute("class");
    let cssStyles = "";
    try {
        for (const sheet of document.styleSheets) {
            try {
                const rules = sheet.cssRules || sheet.rules;
                for (const rule of rules) {
                    if (rule.cssText && (rule.cssText.includes(".node") || rule.cssText.includes(".link") || rule.cssText.includes("svg") || rule.cssText.includes("text"))) {
                        cssStyles += rule.cssText + "\n";
                    }
                }
            } catch (e) {
                // Ignora errori di fogli di stile cross-origin (es. Google Fonts)
            }
        }
    } catch (e) {
        console.warn("Impossibile leggere alcuni fogli di stile:", e);
    }
    const styleElem = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleElem.textContent = cssStyles;
    clonedSvg.insertBefore(styleElem, clonedSvg.firstChild);
    return clonedSvg;
}

// Registra Space Mono (normale + bold) in un'istanza jsPDF, così svg2pdf rende
// il testo col font della mappa invece del serif di default. Il font è
// VENDORIZZATO in base64 (public/js/vendor/spacemono-font.js) → nessun fetch:
// funziona OFFLINE. Fallback storico via fetch solo se il modulo non è caricato.
async function _ensureSpaceMonoInPdf(pdf) {
    if (window.MappAISpaceMono && window.MappAISpaceMono.registerInto(pdf)) return;
    // Fallback (modulo font non caricato): scarica una volta e mette in cache.
    if (!window.__spaceMonoB64) {
        const base = 'https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts/ttf/';
        const [reg, bold] = await Promise.all([
            fetch(base + 'SpaceMono-Regular.ttf').then(r => r.arrayBuffer()),
            fetch(base + 'SpaceMono-Bold.ttf').then(r => r.arrayBuffer())
        ]);
        const b64 = (buf) => {
            let bin = ''; const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
            return window.btoa(bin);
        };
        window.__spaceMonoB64 = { regular: b64(reg), bold: b64(bold) };
    }
    pdf.addFileToVFS('SpaceMono-Regular.ttf', window.__spaceMonoB64.regular);
    pdf.addFont('SpaceMono-Regular.ttf', 'Space Mono', 'normal');
    pdf.addFileToVFS('SpaceMono-Bold.ttf', window.__spaceMonoB64.bold);
    pdf.addFont('SpaceMono-Bold.ttf', 'Space Mono', 'bold');
}

// Nome del PDF esportato: "[MM|KG]-[progetto]-[grade]-[NN]".
//  - MM/KG dalla modalità di estrazione
//  - progetto = rootNodeLabel
//  - grade = grado del progetto corrente (tutor_ai_projects) o classe attiva
//  - NN = numerazione progressiva (quante mappe già archiviate per il progetto)
// Ritorna { name, proj } (proj serve come mapName nell'archivio documenti).
function _studyMapPdfName() {
    const st = appState;
    const kind = (st && st.extractionMode === 'kg') ? 'KG' : 'MM';
    const proj = (st && st.db && st.db.rootNodeLabel) || (st && st.rootNodeLabel) || 'Mappa';
    let grade = '';
    try {
        const pid = window.StorageManager && window.StorageManager.currentProjectId;
        if (pid) {
            const arr = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            const p = arr.find(x => x.id === pid);
            if (p && p.grade) grade = p.grade;
        }
        if (!grade && window.MappAIClasses && window.MappAIClasses.getActive) {
            const c = window.MappAIClasses.getActive();
            if (c && c.grade) grade = c.grade;
        }
    } catch (e) { /* grade opzionale */ }
    let n = 0;
    try {
        if (window.MappAIStudyDocs) {
            n = window.MappAIStudyDocs.list().filter(d => d.kind === 'map' && d.mapName === proj).length;
        }
    } catch (e) { /* archivio opzionale */ }
    const slug = s => String(s || '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const nn = String(n).padStart(2, '0');
    return { name: [kind, slug(proj), slug(grade), nn].filter(Boolean).join('-'), proj: proj };
}

// Archivia il PDF della mappa nei "Documenti di studio" (data-URI, riapribile
// dal modale Documenti salvati). Best-effort: non blocca l'export su errore.
function _archiveMapPdf(pdf, meta) {
    try {
        if (!window.MappAIStudyDocs) return;
        window.MappAIStudyDocs.save({
            kind: 'map', title: meta.name, mapName: meta.proj,
            pdf: pdf.output('datauristring')
        });
    } catch (e) { console.warn('[PDF] archiviazione documento fallita (non bloccante):', e); }
}

// Export PDF VETTORIALE (svg2pdf su jsPDF): l'intera mappa come vettori — testo
// nitido a ogni zoom, niente overlay UI (per costruzione: si esporta solo l'SVG).
// Su qualunque errore ripiega sull'export raster storico (_exportPDFRaster).
window.exportPDF = async function () {
    try {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF || !jsPDF.API || typeof jsPDF.API.svg !== 'function') {
            throw new Error('svg2pdf non caricato');
        }
        const svgElement = document.getElementById("map-svg");
        if (!svgElement) throw new Error("Mappa SVG non trovata nel documento");
        const gEl = svgElement.querySelector('g');
        if (!gEl) throw new Error('Gruppo mappa non trovato');
        // bbox del CONTENUTO in coordinate locali del g: getBBox ignora la
        // transform di zoom → inquadra sempre l'intera mappa, non la viewport.
        const bbox = gEl.getBBox();
        if (!bbox || !isFinite(bbox.width) || bbox.width <= 0 || bbox.height <= 0) {
            throw new Error('Mappa vuota o non misurabile');
        }

        window.showToast(window.t('tst_pdf_working', "Generazione PDF in corso..."), "info");

        const MARGIN = 40;
        const w = Math.ceil(bbox.width + MARGIN * 2);
        const h = Math.ceil(bbox.height + MARGIN * 2);

        const clone = _svgCloneWithStyles();
        const cloneG = clone.querySelector('g');
        if (cloneG) cloneG.removeAttribute('transform'); // niente zoom: il viewBox fa l'inquadratura
        clone.setAttribute('viewBox', (bbox.x - MARGIN) + ' ' + (bbox.y - MARGIN) + ' ' + w + ' ' + h);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);
        // svg2pdf risolve il font-family come CHIAVE ESATTA contro getFontList():
        // la CSS globale "'Space Mono', monospace" ha gli apici → chiave con apici
        // ≠ "Space Mono" registrato → ripiega su Times. Normalizziamo ogni
        // font-family del <style> clonato a "Space Mono" nudo e lo forziamo anche
        // come attributo su ogni testo (doppia difesa: stylesheet + attributo).
        const cloneStyle = clone.querySelector('style');
        if (cloneStyle) cloneStyle.textContent = cloneStyle.textContent.replace(/font-family\s*:[^;}]*/gi, 'font-family:Space Mono');

        // svg2pdf NON onora `paint-order: stroke fill`: disegna la stroke DOPO il
        // fill → l'alone bianco copre il testo (label illeggibili). Emuliamo il
        // layering a mano: per ogni label creiamo una copia-alone bianca DIETRO
        // (solo stroke+fill bianchi) e lasciamo davanti il testo col suo fill,
        // stroke tolta. Così l'alone sta sotto (z=900) e il testo sopra (z=1000).
        clone.querySelectorAll('text.node-text').forEach(txt => {
            const sw = (txt.style && txt.style.strokeWidth) || txt.getAttribute('stroke-width') || '2px';
            const halo = txt.cloneNode(true);
            halo.removeAttribute('class');
            halo.removeAttribute('stroke');
            halo.style.fill = '#ffffff';
            halo.style.stroke = '#ffffff';
            halo.style.strokeWidth = sw;
            halo.style.strokeLinejoin = 'round';
            halo.style.paintOrder = '';
            halo.setAttribute('font-weight', 'bold');
            // testo in primo piano: fill originale (attributo #0f172a), niente stroke
            txt.removeAttribute('class');
            txt.removeAttribute('stroke');
            txt.style.stroke = 'none';
            txt.style.paintOrder = '';
            txt.setAttribute('font-weight', 'bold');
            txt.parentNode.insertBefore(halo, txt);
        });

        // font-family "Space Mono" nudo su OGNI testo (incluse le copie-alone):
        // svg2pdf matcha la chiave esatta di getFontList (la CSS con apici no).
        clone.querySelectorAll('text, tspan').forEach(el => el.setAttribute('font-family', 'Space Mono'));

        const pdf = new jsPDF({
            orientation: w > h ? 'landscape' : 'portrait',
            unit: 'px',
            format: [w, h],
            compress: true
        });
        // Registra Space Mono nell'istanza: senza, svg2pdf usa un serif di default
        // e le metriche sbagliate tagliano/deformano le etichette (best-effort).
        try { await _ensureSpaceMonoInPdf(pdf); }
        catch (e) { console.warn('[PDF] Space Mono non caricato, uso il font di ripiego:', e); }
        await pdf.svg(clone, { x: 0, y: 0, width: w, height: h });

        const meta = _studyMapPdfName();
        _archiveMapPdf(pdf, meta);   // salva nei Documenti di studio

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            const blob = pdf.output('blob');
            const file = new File([blob], meta.name + '.pdf', { type: 'application/pdf' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: "Esporta PDF", text: "Mappa mentale creata con MappAI" });
                window.showToast(window.t('tst_pdf_shared', "PDF condiviso con successo!"), "success");
            } else {
                throw new Error("Condivisione PDF non supportata da questo dispositivo");
            }
        } else {
            pdf.save(meta.name + '.pdf');
            window.showToast(window.t('tst_pdf_vector_done', "PDF vettoriale esportato!"), "success");
        }
    } catch (err) {
        console.warn('[PDF] Percorso vettoriale fallito, fallback raster:', err);
        window.showToast(window.t('tst_pdf_vector_fallback', "PDF vettoriale non disponibile — uso la cattura schermo"), "warning");
        return _exportPDFRaster();
    }
};

// Export PDF RASTER storico (screenshot della finestra) — fallback del vettoriale.
async function _exportPDFRaster() {
    try {
        if (!window.electronAPI || !window.electronAPI.capturePage) {
            throw new Error(window.t('err_pdf_ipad', "La cattura PDF non è supportata su iPadOS. Usa l'esportazione SVG (Vettoriale)!"));
        }

        window.showToast(window.t('tst_pdf_working', "Generazione PDF in corso..."), "info");

        // Attiva modalità snapshot (nasconde l'UI)
        document.body.classList.add('is-snapshotting');

        // Attendi un frame per il reflow del layout
        await new Promise(resolve => setTimeout(resolve, 150));

        const dataUrl = await window.electronAPI.capturePage();

        // Ripristina UI
        document.body.classList.remove('is-snapshotting');

        if (!dataUrl) throw new Error(window.t('err_screen_capture', "Errore durante la cattura dello schermo"));

        // Utilizziamo jsPDF (già incluso nell'app)
        const { jsPDF } = window.jspdf;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Crea il documento PDF con orientamento dinamico e dimensioni della finestra
        const pdf = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [width, height]
        });

        // Inserisce l'immagine catturata nel PDF
        pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            // Su iPadOS (Capacitor), esportiamo come Blob e usiamo navigator.share per il foglio di condivisione nativo
            const blob = pdf.output('blob');
            const file = new File([blob], `MappAI_Mappa_${new Date().getTime()}.pdf`, { type: 'application/pdf' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta PDF",
                    text: "Mappa mentale creata con MappAI"
                });
                window.showToast(window.t('tst_pdf_shared', "PDF condiviso con successo!"), "success");
            } else {
                throw new Error("Condivisione PDF non supportata da questo dispositivo");
            }
        } else {
            // Su Desktop (Electron/Browser), salva direttamente sul filesystem
            pdf.save(`MappAI_Mappa_${new Date().getTime()}.pdf`);
            window.showToast(window.t('tst_pdf_done', "Esportazione PDF completata!"), "success");
        }
    } catch (err) {
        document.body.classList.remove('is-snapshotting');
        console.error("Errore esportazione PDF:", err);
        window.showToast(err.message, "error");
    }
}

window.exportSVG = async function () {
    try {
        window.showToast(window.t('tst_svg_working', "Generazione SVG in corso..."), "info");

        // Clona l'SVG con gli stili CSS inline (helper condiviso col PDF vettoriale)
        const clonedSvg = _svgCloneWithStyles();

        // Serializza l'SVG in formato stringa XML
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            // Su iPadOS, usa navigator.share per condividere o salvare nei File
            const file = new File([blob], `MappAI_Mappa_${new Date().getTime()}.svg`, { type: 'image/svg+xml' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta SVG",
                    text: "Esporta mappa mentale in vettoriale"
                });
                window.showToast(window.t('tst_svg_shared', "SVG condiviso con successo!"), "success");
            } else {
                throw new Error("Condivisione non supportata su questo dispositivo. Prova a salvare.");
            }
        } else {
            // Su Desktop/Browser scarica il file
            const a = document.createElement("a");
            a.download = `MappAI_Mappa_${new Date().getTime()}.svg`;
            a.href = URL.createObjectURL(blob);
            a.click();
            window.showToast(window.t('tst_svg_done', "Esportazione SVG completata con successo!"), "success");
        }
    } catch (err) {
        console.error("Errore esportazione SVG:", err);
        window.showToast(window.t('tst_export_error', "Errore esportazione: ") + err.message, "error");
    }
};

window.changeDistance = function (dir) {
    forceDistMult = Math.max(0.5, Math.min(3, forceDistMult + (dir * 0.2)));
    forceChargeMult = Math.max(0.5, Math.min(3, forceChargeMult + (dir * 0.2)));
    if (!isPinned) {
        simulation.force("link").distance(d => ((d.source.level === 0) ? 120 : 80) * forceDistMult);
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        simulation.alpha(0.3).restart();
    }
}

window.toggleLayout = function () {
    if (!simulation) return;
    const isMindmap = appState.extractionMode === 'mindmap';
    const btn = document.getElementById('card-btn-layout');
    const span = document.getElementById('layout-label-text');
    const hasSnapshot = appState.db.nodes.some(n => n.savedX !== undefined);
    const hasSavedLayouts = appState.savedLayouts && appState.savedLayouts.length > 0;

    // Ciclo Layout: Default -> (Orbit) -> (Radial/Separated) -> (Personal) -> (Custom Layouts)
    if (appState.layoutMode === 'default') {
        appState.layoutMode = 'orbit';
    } else if (appState.layoutMode === 'orbit') {
        appState.layoutMode = isMindmap ? 'radial' : 'separated';
    } else if (appState.layoutMode === 'radial' || appState.layoutMode === 'separated') {
        if (hasSnapshot) appState.layoutMode = 'personal';
        else if (hasSavedLayouts) appState.layoutMode = 'custom_' + appState.savedLayouts[0].id;
        else appState.layoutMode = 'default';
    } else if (appState.layoutMode === 'personal') {
        if (hasSavedLayouts) appState.layoutMode = 'custom_' + appState.savedLayouts[0].id;
        else appState.layoutMode = 'default';
    } else if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
        const currentId = appState.layoutMode.replace('custom_', '');
        const layouts = appState.savedLayouts || [];
        const idx = layouts.findIndex(l => l.id === currentId);
        if (idx >= 0 && idx < layouts.length - 1) {
            appState.layoutMode = 'custom_' + layouts[idx + 1].id;
        } else {
            appState.layoutMode = 'default';
        }
    } else {
        appState.layoutMode = 'default';
    }

    // Applica logic layout
    if (appState.layoutMode === 'personal') {
        appState.db.nodes.forEach(n => {
            if (n.savedX !== undefined && n.savedY !== undefined) {
                n.x = n.savedX; n.y = n.savedY;
                n.fx = n.savedX; n.fy = n.savedY;
                n.pinned = true;
            }
        });
        window.showToast(window.t('tst_layout_restored', "Layout Personale Ripristinato"), "success");
    } else if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
        const layoutId = appState.layoutMode.replace('custom_', '');
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (layout) {
            appState.db.nodes.forEach(n => {
                const savedPos = layout.positions[n.id];
                if (savedPos) {
                    n.x = savedPos.x; n.y = savedPos.y;
                    n.fx = savedPos.fx; n.fy = savedPos.fy;
                    n.pinned = savedPos.pinned;
                }
            });
            // Applica inquadratura zoom e pan
            const svgEl = document.getElementById("map-svg");
            if (svgEl && typeof d3 !== 'undefined' && zoom) {
                d3.select("#map-svg").transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(layout.viewState.x, layout.viewState.y).scale(layout.viewState.k)
                );
            }
            window.showToast(window.t('tst_layout_x_restored', 'Layout "{x}" Ripristinato').replace('{x}', layout.name), "success");
        }
    }

    if (btn) {
        if (appState.layoutMode !== 'default') {
            btn.classList.add('bg-indigo-100', 'text-indigo-600');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
            if (appState.layoutMode === 'separated') span.innerText = 'SEPARATO';
            if (appState.layoutMode === 'radial') span.innerText = 'RADIALE';
            if (appState.layoutMode === 'orbit') span.innerText = 'ORBITA';
            if (appState.layoutMode === 'personal') span.innerText = 'PERSONAL';
            if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
                const layoutId = appState.layoutMode.replace('custom_', '');
                const layout = appState.savedLayouts.find(l => l.id === layoutId);
                span.innerText = layout ? layout.keyword : 'CUSTOM';
            }
        } else {
            btn.classList.remove('bg-indigo-100', 'text-indigo-600');
            btn.classList.add('bg-slate-100', 'text-slate-600');
            span.innerText = 'LAYOUT';
        }
    }

    if (appState.layoutMode !== 'personal' && (!appState.layoutMode || !appState.layoutMode.startsWith('custom_'))) {
        window.applyLayoutForces();
    } else {
        simulation.alpha(0.3).restart();
    }
};

window.applyLayoutForces = function () {
    if (!simulation) return;

    // reset forces first
    simulation.force("radial", null);
    simulation.force("x", null);
    simulation.force("y", null);

    if (appState.layoutMode === 'radial') {
        simulation.force("radial", d3.forceRadial(d => d.level * 180, 0, 0).strength(0.8));
        simulation.force("charge", d3.forceManyBody().strength(-400 * forceChargeMult));
    } else if (appState.layoutMode === 'separated') {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 || d.degree > 3) ? -2500 * forceChargeMult : -300 * forceChargeMult));
    } else if (appState.layoutMode === 'orbit') {
        simulation.force("radial", d3.forceRadial(d => (d.group || 1) * 150, 0, 0).strength(0.8));
        simulation.force("charge", d3.forceManyBody().strength(-400 * forceChargeMult));
    } else {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult));
    }

    simulation.alpha(1).restart();
}

window.toggleLabels = function () {
    // Se la lente è attiva, click su TESTO azzera la lente (non toglia label globali)
    if (window.activeLensFamily) {
        window.resetLensFamily();
        return;
    }
    labelsHidden = !labelsHidden;
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);
    const btn = document.getElementById('card-btn-labels');
    if (labelsHidden) { btn.classList.replace('bg-slate-100', 'bg-red-50'); btn.classList.replace('text-slate-600', 'text-red-500'); }
    else { btn.classList.replace('bg-red-50', 'bg-slate-100'); btn.classList.replace('text-red-500', 'text-slate-600'); }
}

// ── Lente Relazioni ────────────────────────────────────────────────────────

// Click sul bottone TESTO: dispatching tra toggle label e apertura menu lente
window.handleLabelsButtonClick = function (event) {
    const tgt = event.target;
    if (tgt && (tgt.id === 'lens-caret' || (tgt.closest && tgt.closest('#lens-caret')))) {
        event.stopPropagation();
        window.openLensMenu();
        return;
    }
    window.toggleLabels();
};

window.openLensMenu = function () {
    const menu = document.getElementById('lens-menu');
    if (!menu) return;

    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        return;
    }

    const families = window.getActiveFamiliesInMap();
    let html = '';

    const allActive = window.activeLensFamily === null;
    html += `<button type="button" class="lens-item${allActive ? ' active' : ''}"
        onclick="window.selectLensFamily(null)">
        <span class="lens-dot" style="background:#94a3b8;"></span>
        Tutte le relazioni
    </button>`;

    if (families.length > 1 || (families.length === 1 && families[0] !== 'altro')) {
        html += `<div class="lens-divider"></div>`;
    }

    families.forEach(key => {
        const fam = EDGE_FAMILIES[key];
        const isActive = window.activeLensFamily === key;
        html += `<button type="button" class="lens-item${isActive ? ' active' : ''}"
            onclick="window.selectLensFamily('${key}')"
            onmouseenter="this.style.color='${fam.color}'"
            onmouseleave="this.style.color=''">
            <span class="lens-dot" style="background:${fam.color};"></span>
            <i data-lucide="${fam.icon}" style="width:12px;height:12px;flex-shrink:0;"></i>
            ${window.MappAIRelations.getFamilyLabel(key, (window.currentLanguage === 'en' || window.currentLanguage === 'en-US') ? 'en' : 'it')}
        </button>`;
    });

    menu.innerHTML = html;
    menu.classList.remove('hidden');
    window.safeCreateIcons();

    setTimeout(() => {
        const closer = (e) => {
            if (!menu.contains(e.target)
                && e.target.id !== 'card-btn-labels'
                && e.target.id !== 'lens-caret'
                && !(e.target.closest && e.target.closest('#lens-caret'))) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closer);
            }
        };
        document.addEventListener('click', closer);
    }, 0);
};

window.selectLensFamily = function (familyKey) {
    window.activeLensFamily = familyKey;
    document.getElementById('lens-menu')?.classList.add('hidden');
    window.applyLensFamily();
};

window.applyLensFamily = function () {
    const key = window.activeLensFamily;
    const btn = document.getElementById('card-btn-labels');
    const caret = document.getElementById('lens-caret');
    if (!btn || !g) return;

    // Reset stili inline
    g.selectAll('.link')
        .style('stroke', null)
        .style('stroke-width', null)
        .style('stroke-opacity', null)
        .attr('marker-end', 'url(#arrowhead)')
        .attr('marker-start', d => d.bidirectional ? 'url(#arrowhead-rev)' : null);
    g.selectAll('.link-group').classed('lens-dimmed', false);
    g.selectAll('.node-group').classed('lens-dimmed', false);
    g.selectAll('circle.node-circle')
        .style('stroke', null)
        .style('stroke-width', null);
    g.selectAll('text.link-label')
        .style('font-size', null)
        .style('fill', null)
        .style('opacity', null)
        .style('stroke', null)
        .style('stroke-width', null)
        .style('stroke-linejoin', null)
        .style('paint-order', null)
        .style('font-weight', null);

    if (!key) {
        btn.style.background = '';
        btn.style.color = '';
        if (caret) caret.style.color = '';
        return;
    }

    const fam = EDGE_FAMILIES[key];
    if (!fam) return;

    const activeLinkSet = new Set();
    const activeNodeIds = new Set();
    appState.db.links.forEach(l => {
        if (window.getEdgeFamilyKey(l.rel) === key) {
            activeLinkSet.add(l);
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            activeNodeIds.add(s);
            activeNodeIds.add(t);
        }
    });

    const baseFontSize = 8 * globalFontScale * 0.765;

    g.selectAll('.link-group').each(function (d) {
        const isActive = activeLinkSet.has(d);
        d3.select(this).classed('lens-dimmed', !isActive);
        // Path + frecce colorate per i link attivi
        d3.select(this).select('.link')
            .style('stroke', isActive ? fam.color : null)
            .style('stroke-width', isActive ? '2.5px' : null)
            .style('stroke-opacity', isActive ? '1' : null)
            .attr('marker-end', isActive ? `url(#arrowhead-${key})` : 'url(#arrowhead)')
            .attr('marker-start', d => d.bidirectional
                ? (isActive ? `url(#arrowhead-rev-${key})` : 'url(#arrowhead-rev)')
                : null);
        // Label: forza visibile + font ×1.5 + colore famiglia + outline NERO per contrasto
        // (replica il pattern di .node-text, ma stroke nero come richiesto)
        d3.select(this).select('text.link-label')
            .style('opacity', isActive ? '1' : null)
            .style('font-size', isActive ? (baseFontSize * 1.5) + 'px' : null)
            .style('fill', isActive ? fam.color : null)
            .style('font-weight', isActive ? 'bold' : null)
            .style('stroke', isActive ? 'black' : null)
            .style('stroke-width', isActive ? '1px' : null)
            .style('stroke-linejoin', isActive ? 'round' : null)
            .style('paint-order', isActive ? 'stroke fill' : null);
    });

    g.selectAll('.node-group').each(function (d) {
        const active = activeNodeIds.has(d.id) || d.level === 0;
        d3.select(this).classed('lens-dimmed', !active);
        if (active && d.level > 0) {
            d3.select(this).select('circle.node-circle')
                .style('stroke', fam.color)
                .style('stroke-width', '3px');
        }
    });

    btn.style.background = fam.colorBtn;
    btn.style.color = 'white';
    if (caret) caret.style.color = 'rgba(255,255,255,0.85)';
};

window.resetLensFamily = function () {
    window.activeLensFamily = null;
    window.applyLensFamily();
};

window.updateDegreeStats = function () {
    let deg = {};
    appState.db.nodes.forEach(n => deg[n.id] = 0);
    appState.db.links.forEach(l => {
        let sid = typeof l.source === 'object' ? l.source.id : l.source;
        let tid = typeof l.target === 'object' ? l.target.id : l.target;
        if (deg[sid] !== undefined) deg[sid]++;
        if (deg[tid] !== undefined) deg[tid]++;
    });
    appState.db.nodes.forEach(n => n.degree = deg[n.id]);
    let maxDeg = Math.max(...Object.values(deg), 0);

    const slider = document.getElementById('node-filter-slider');
    if (slider) {
        slider.max = maxDeg;
        slider.value = 0;
    }
    const display = document.getElementById('filter-val-display');
    if (display) display.innerText = `0`;
}

window.applyVisualFilters = function () {
    const minLinkSlider = document.getElementById('node-filter-slider');
    const minDegree = minLinkSlider && !minLinkSlider.closest('.hidden') ? (parseInt(minLinkSlider.value) || 0) : 0;

    const levelSlider = document.getElementById('level-slider');
    const maxLvl = (levelSlider && !levelSlider.closest('.hidden')) ? parseInt(levelSlider.value) : 5;

    let pathSet = new Set(), linkPathSet = new Set();

    if (pathfinderActive && pathfinderState.source && pathfinderState.target) {
        const path = calculatePath(pathfinderState.source, pathfinderState.target);
        if (path) {
            path.forEach(id => pathSet.add(id));
            for (let i = 0; i < path.length - 1; i++) {
                let a = path[i], b = path[i + 1];
                appState.db.links.forEach(l => {
                    let s = typeof l.source === 'object' ? l.source.id : l.source;
                    let t = typeof l.target === 'object' ? l.target.id : l.target;
                    if ((s === a && t === b) || (s === b && t === a)) linkPathSet.add(l);
                });
            }
        }
    }

    g.selectAll(".node-group")
        .classed("hidden", d => {
            if (d.level > maxLvl) return true;
            if (d.degree < minDegree && !pathSet.has(d.id)) return true;
            return false;
        })
        .classed("dimmed", d => pathfinderActive && pathfinderState.target && !pathSet.has(d.id));

    g.selectAll(".link-group")
        .classed("hidden", d => {
            let s = typeof d.source === 'object' ? d.source : appState.db.nodes.find(n => n.id === d.source);
            let t = typeof d.target === 'object' ? d.target : appState.db.nodes.find(n => n.id === d.target);
            if (!s || !t) return true;

            if (Math.max(s.level, t.level) > maxLvl) return true;

            let sDeg = s.degree || 0;
            let tDeg = t.degree || 0;
            if ((sDeg < minDegree || tDeg < minDegree) && !linkPathSet.has(d)) return true;

            return false;
        })
        .classed("dimmed", d => pathfinderActive && pathfinderState.target && !linkPathSet.has(d));

    g.selectAll(".link").classed("pathfinder-active", d => linkPathSet.has(d));
}

window.onLevelSliderInput = function (val) {
    document.getElementById('level-slider-val').textContent = 'L' + val;
    window.applyVisualFilters();
}

window.updateFilter = function (val) {
    document.getElementById('filter-val-display').innerText = val;
    window.applyVisualFilters();
}

// ── Visibilità Link (cycle 3 stati) ────────────────────────────────────────

const LINK_VIS_STATES = {
    all:       { icon: 'network',  label: 'LINK',  tooltip: 'Tutti i link visibili (click per nascondere cross-link)',  bg: '',           color: '' },
    hierarchy: { icon: 'git-fork', label: 'TREE',  tooltip: 'Solo gerarchia (click per vedere solo cross-link)',         bg: '#dbeafe',    color: '#2563eb' },
    cross:     { icon: 'shuffle',  label: 'CROSS', tooltip: 'Solo cross-link (click per tornare a tutti)',               bg: '#fef3c7',    color: '#d97706' }
};
const LINK_VIS_CYCLE = ['all', 'hierarchy', 'cross'];

window.cycleLinkVisibility = function () {
    const idx = LINK_VIS_CYCLE.indexOf(window.linkVisibilityMode);
    const next = LINK_VIS_CYCLE[(idx + 1) % LINK_VIS_CYCLE.length];
    window.linkVisibilityMode = next;
    localStorage.setItem('mappai_link_vis_mode', next);
    window.applyLinkVisibility();
};

window.applyLinkVisibility = function () {
    const mode = window.linkVisibilityMode || 'all';
    const state = LINK_VIS_STATES[mode] || LINK_VIS_STATES.all;

    // Aggiorna bottone (icona + colore + label + tooltip)
    const btn = document.getElementById('card-btn-link-vis');
    const iconEl = document.getElementById('card-btn-link-vis-icon');
    const labelEl = document.getElementById('card-btn-link-vis-label');
    if (btn) {
        btn.style.background = state.bg;
        btn.style.color = state.color;
        btn.title = state.tooltip;
    }
    if (iconEl) {
        iconEl.setAttribute('data-lucide', state.icon);
        // Reset SVG e ri-render via lucide
        const parent = iconEl.parentNode;
        const fresh = document.createElement('i');
        fresh.id = 'card-btn-link-vis-icon';
        fresh.setAttribute('data-lucide', state.icon);
        fresh.className = 'w-5 h-5';
        if (state.color) fresh.style.color = state.color;
        parent.replaceChild(fresh, iconEl);
        window.safeCreateIcons();
    }
    if (labelEl) labelEl.textContent = state.label;

    // Applica filtro al rendering: marca i link come hidden via classe CSS
    if (!g) return;
    // Assicura che i link abbiano isCross calcolato in base alla modalità corrente
    if (appState.extractionMode === 'kg') {
        window.markKgCrossLinks(appState.db.nodes, appState.db.links);
    } else {
        window.markMmCrossLinks(appState.db.nodes, appState.db.links);
    }

    g.selectAll('.link-group').classed('link-hidden', function (d) {
        if (mode === 'all') return false;
        if (mode === 'hierarchy') return d.isCross === true;
        if (mode === 'cross') return d.isCross !== true;
        return false;
    });
};

window.togglePathfinder = function () {
    pathfinderActive = !pathfinderActive;
    const btn = document.getElementById('card-btn-pathfinder');
    const hint = document.getElementById('mode-hint');
    pathfinderState = { active: pathfinderActive, source: null, target: null };

    if (pathfinderActive) {
        btn.classList.replace('bg-slate-100', 'bg-amber-50'); btn.classList.replace('text-slate-600', 'text-amber-600');
        hint.innerText = "PATHFINDER: Clicca sul Nodo di Partenza"; hint.classList.remove('hidden');
        linkingState.active = false;
    } else {
        btn.classList.replace('bg-amber-50', 'bg-slate-100'); btn.classList.replace('text-amber-600', 'text-slate-600');
        hint.classList.add('hidden');
    }
    window.applyVisualFilters();
}

function calculatePath(start, end) {
    let adj = {};
    appState.db.nodes.forEach(n => adj[n.id] = []);
    appState.db.links.forEach(l => {
        let s = typeof l.source === 'object' ? l.source.id : l.source;
        let t = typeof l.target === 'object' ? l.target.id : l.target;
        if (adj[s] && adj[t]) {
            adj[s].push(t); adj[t].push(s);
        }
    });
    let q = [[start.id]], visited = new Set([start.id]);
    while (q.length > 0) {
        let path = q.shift(), curr = path[path.length - 1];
        if (curr === end.id) return path;
        for (let neighbor of adj[curr] || []) {
            if (!visited.has(neighbor)) { visited.add(neighbor); q.push([...path, neighbor]); }
        }
    }
    return null;
}

function handleBackgroundClick() {
    if (window.mergeState && window.mergeState.active) window.cancelMergeMode();
    if (window.relinkState && window.relinkState.active) window.cancelRelinkMode();
    if (linkingState.active) { linkingState.active = false; document.getElementById('mode-hint').classList.add('hidden'); }

    // PATHFINDER: il click sullo sfondo NON resetta più la selezione (era troppo
    // distruttivo quando l'utente sbaglia di pochi pixel). Per uscire, ri-cliccare il
    // bottone PATH oppure selezionare un altro nodo come sorgente.
    if (pathfinderActive) {
        hideContextMenu();
        return; // niente reset selezione, niente clear node-details
    }

    currentNode = null;
    g.selectAll(".node-group, .link-group").classed("dimmed", false).classed("highlighted", false);
    document.getElementById('node-details').innerHTML = `<div class="text-center text-slate-400 mt-12"><i data-lucide="scan-search" class="mx-auto h-12 w-12 mb-4"></i><h2 class="text-md font-bold">Nessun nodo selezionato</h2></div>`;
    window.safeCreateIcons();
    hideContextMenu();
}

// Override renderGraph per chiamare updateStudyStats automaticamente
const originalRenderGraph = renderGraph;
renderGraph = function () {
    if (typeof originalRenderGraph === 'function') originalRenderGraph();
    window.updateStudyStats();
    StorageManager.saveCurrentProject();
};
