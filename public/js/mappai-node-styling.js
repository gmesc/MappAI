/**
 * mappai-node-styling.js
 * KG node visual refinement: classificazione di ruolo + bridge marking.
 *
 * Sostituisce il calcolo BFS hubWeights (max 3 hop) con un'annotazione
 * basata sui legami DIRETTI (1-hop) per ridurre la dispersione visiva.
 *
 * Strategia:
 *   - Super-Hub (L1) restano pieni e saturi.
 *   - L2+ con grado >= 5 o 2+ hub diretti = keystone (anello spesso).
 *   - L2+ con grado 1 = leaf (anello sottile, opacity ridotta).
 *   - Altri L2+ = ordinary (anello medio).
 *   - Anello: max 2 colori. 'bridge' (link diretto a 2+ hub) = 60/40 owngroup/secondary.
 *     'mono' = 1 solo colore. 'mixed' = main owngroup + accent secondario.
 *
 * API (su window.MappAINodeStyling):
 *   annotate(nodes, links, groupColors)
 *     Aggiunge a ogni nodo:
 *       _role        : 'l1' | 'keystone' | 'ordinary' | 'leaf'
 *       _bridgeInfo  : { kind: 'mono'|'bridge'|'mixed', segments: [{color,fraction}] } | null
 *       _degree      : numero (1-hop)
 *       _opacity     : 0.65 (leaf) | 1.0
 *       _strokeW     : 2 (leaf) | 3 (ordinary) | 5 (keystone) | 0 (l1)
 *
 *   getRingSegments(node) → [{color, fraction}] | null
 *     null per L1 (gestito dal fill principale).
 */
(function () {
    const ROLE_VISUAL = {
        l1:       { strokeW: 0, opacity: 1.0 },
        keystone: { strokeW: 5, opacity: 1.0 },
        ordinary: { strokeW: 3, opacity: 1.0 },
        leaf:     { strokeW: 2, opacity: 0.65 }
    };

    function lookupColor(group, groupColors) {
        if (group === undefined || group === null) return '#94a3b8';
        return groupColors[group] || '#94a3b8';
    }

    function annotate(nodes, links, groupColors) {
        if (!Array.isArray(nodes) || !Array.isArray(links)) return;
        groupColors = groupColors || {};

        const isL1 = new Set();
        const groupOfId = {};
        const directDeg = {};
        const directHubs = {};       // id → Set di L1 hub ID direttamente collegati
        const neighborByGroup = {};  // id → { group: count }

        nodes.forEach(n => {
            if (n.level === 1) isL1.add(n.id);
            groupOfId[n.id] = n.group;
            directDeg[n.id] = 0;
            directHubs[n.id] = new Set();
            neighborByGroup[n.id] = {};
        });

        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (directDeg[s] === undefined || directDeg[t] === undefined) return;
            directDeg[s]++; directDeg[t]++;

            if (isL1.has(t)) directHubs[s].add(t);
            const gt = groupOfId[t];
            if (gt !== undefined) {
                neighborByGroup[s][gt] = (neighborByGroup[s][gt] || 0) + 1;
            }
            if (isL1.has(s)) directHubs[t].add(s);
            const gs = groupOfId[s];
            if (gs !== undefined) {
                neighborByGroup[t][gs] = (neighborByGroup[t][gs] || 0) + 1;
            }
        });

        nodes.forEach(n => {
            n._degree = directDeg[n.id] || 0;

            if (n.level <= 1) {
                n._role = 'l1';
                n._bridgeInfo = null;
                n._opacity = ROLE_VISUAL.l1.opacity;
                n._strokeW = ROLE_VISUAL.l1.strokeW;
                return;
            }

            const deg = n._degree;
            const hubs = directHubs[n.id];

            if (deg <= 1) n._role = 'leaf';
            else if (deg >= 5 || hubs.size >= 2) n._role = 'keystone';
            else n._role = 'ordinary';

            const ownGroup = n.group;
            const ownColor = lookupColor(ownGroup, groupColors);
            const byGroup = neighborByGroup[n.id] || {};

            const otherEntries = Object.entries(byGroup)
                .filter(([g]) => +g !== ownGroup && +g >= 0)
                .sort((a, b) => b[1] - a[1]);

            const secondaryGroup = otherEntries.length ? +otherEntries[0][0] : null;
            const secondaryColor = secondaryGroup !== null
                ? lookupColor(secondaryGroup, groupColors)
                : null;

            if (hubs.size >= 2) {
                const segs = secondaryColor
                    ? [{ color: ownColor, fraction: 0.6 }, { color: secondaryColor, fraction: 0.4 }]
                    : [{ color: ownColor, fraction: 1.0 }];
                n._bridgeInfo = { kind: 'bridge', segments: segs };
            } else if (otherEntries.length === 0) {
                n._bridgeInfo = { kind: 'mono', segments: [{ color: ownColor, fraction: 1.0 }] };
            } else {
                const ownCount = byGroup[ownGroup] || 0;
                const otherCount = otherEntries.reduce((s, [, c]) => s + c, 0);
                const total = ownCount + otherCount;
                const ownFrac = total ? Math.max(0.7, ownCount / total) : 1.0;
                const segs = (ownFrac < 1 && secondaryColor)
                    ? [{ color: ownColor, fraction: ownFrac }, { color: secondaryColor, fraction: 1 - ownFrac }]
                    : [{ color: ownColor, fraction: 1.0 }];
                n._bridgeInfo = { kind: 'mixed', segments: segs };
            }

            const vis = ROLE_VISUAL[n._role] || ROLE_VISUAL.ordinary;
            n._opacity = vis.opacity;
            n._strokeW = vis.strokeW;
        });
    }

    function getRingSegments(node) {
        if (!node || node._role === 'l1') return null;
        return node._bridgeInfo ? node._bridgeInfo.segments : null;
    }

    window.MappAINodeStyling = { annotate, getRingSegments };
})();
