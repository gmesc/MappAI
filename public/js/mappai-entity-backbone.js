/**
 * mappai-entity-backbone.js
 * Diagnostica READ-ONLY: cluster di entità semanticamente equivalenti
 * sparse su rami diversi ("Commissione Bergier" spalmata su 4 nodi).
 *
 * NON tocca il grafo — logga soltanto un report. È lo Step A della proposta
 * "Entity Backbone": verificare se gli embedding già visti come keystone
 * coincidono con le entità che il modello generativo ha frammentato.
 *
 * Differenza con executeSemanticDedup (app.js):
 *  - quello fa merge PAIRWISE a soglia alta (0.85) e CANCELLA i duplicati
 *  - questo fa CLUSTERING a soglia più permissiva (0.78), non tocca nulla,
 *    e ordina i cluster per "spread" — quanti rami L1 distinti attraversano.
 *    Spread alto = entità trasversale = candidata "keystone mai nato bene".
 *
 * Dipende da: app.js (appState, fetchEmbeddings, cosineSimilarity)
 * Gated da: localStorage 'mappai_entity_backbone_enabled'
 */

(function () {
    'use strict';

    const CONFIG = {
        clusterThreshold: 0.78,   // soglia di similarità per unire due nodi nello stesso cluster
        minClusterSize: 2,        // un cluster con un solo membro non è un'anomalia
        minSpread: 2,             // riportiamo solo cluster che attraversano ≥2 macro-aree
        topN: 20                  // quanti cluster mostrare nel report
    };

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    function _getId(l) {
        return {
            src: typeof l.source === 'object' ? l.source.id : l.source,
            tgt: typeof l.target === 'object' ? l.target.id : l.target
        };
    }

    /** Risale dal nodo fino al suo antenato L1 (la "macro-area" / ramo). */
    function _buildL1Resolver(nodes, links) {
        const parentOf = new Map();
        links.forEach(l => {
            const { src, tgt } = _getId(l);
            if (!parentOf.has(tgt)) parentOf.set(tgt, src);
        });
        const byId = new Map(nodes.map(n => [n.id, n]));
        return function l1Of(nodeId) {
            let cur = nodeId, hops = 0;
            while (cur && hops < 10) {
                const n = byId.get(cur);
                if (!n) return null;
                if (n.level === 1) return n.id;
                cur = parentOf.get(cur);
                hops++;
            }
            return null;
        };
    }

    /**
     * Union-Find essenziale per il clustering: unisce indici i,j se sim ≥ soglia.
     */
    function _clusterBySimilarity(embeddings, threshold) {
        const n = embeddings.length;
        const parent = Array.from({ length: n }, (_, i) => i);
        function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
        function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const sim = window.cosineSimilarity(embeddings[i], embeddings[j]);
                if (sim >= threshold) union(i, j);
            }
        }
        const groups = new Map();
        for (let i = 0; i < n; i++) {
            const root = find(i);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(i);
        }
        return [...groups.values()];
    }

    /**
     * Analizza la mappa corrente: clusterizza i nodi per similarità semantica
     * e segnala quelli che attraversano più macro-aree (rami) — candidati a
     * essere "la stessa entità reale, nata male in più punti".
     *
     * Restituisce un report; NON modifica appState.
     */
    async function analyzeCurrentMap(options = {}) {
        const giro = options.giro || (window.MappAIModelli && window.MappAIModelli.avvia());
        const cfg = { ...CONFIG, ...options };
        const report = { clusters: [], stats: { nodesAnalyzed: 0, clustersFound: 0, transversalClusters: 0 }, errors: [] };

        const state = _getAppState();
        const db = state?.db;
        if (!db || !db.nodes?.length) {
            console.warn('[EntityBackbone] appState.db non disponibile o vuoto');
            return report;
        }
        if (!window.fetchEmbeddings || !window.cosineSimilarity) {
            console.warn('[EntityBackbone] fetchEmbeddings/cosineSimilarity non disponibili (restart app?)');
            report.errors.push('embeddings API non disponibile');
            return report;
        }

        const nodes = db.nodes.filter(n => n.level >= 2);
        if (nodes.length < 4) {
            console.log('[EntityBackbone] Mappa troppo piccola — skip');
            return report;
        }
        report.stats.nodesAnalyzed = nodes.length;

        const texts = nodes.map(n => {
            const desc = (n.desc || n.content || '').replace(/\s+/g, ' ').slice(0, 100);
            return `${n.label}. ${desc}`.trim();
        });

        let embs;
        try {
            embs = giro ? await giro.embeddings(texts) : await window.fetchEmbeddings(texts);
        } catch (e) {
            if (giro) giro.verifica();
            console.warn('[EntityBackbone] Fetch embeddings fallito:', e.message);
            report.errors.push(e.message);
            return report;
        }
        if (!embs || embs.length !== nodes.length) {
            console.warn(`[EntityBackbone] Mismatch: ${embs?.length} embeddings vs ${nodes.length} nodi`);
            report.errors.push('embedding count mismatch');
            return report;
        }

        const l1Of = _buildL1Resolver(db.nodes, db.links || []);
        const l1Label = new Map(db.nodes.filter(n => n.level === 1).map(n => [n.id, n.label]));

        const indexClusters = _clusterBySimilarity(embs, cfg.clusterThreshold);

        const clusters = indexClusters
            .filter(idxs => idxs.length >= cfg.minClusterSize)
            .map(idxs => {
                const members = idxs.map(i => nodes[i]);
                const branchIds = new Set(members.map(m => l1Of(m.id)).filter(Boolean));
                return {
                    members: members.map(m => ({ id: m.id, label: m.label, level: m.level, branch: l1Label.get(l1Of(m.id)) || '?' })),
                    spread: branchIds.size,
                    size: members.length
                };
            })
            .filter(c => c.spread >= cfg.minSpread)
            .sort((a, b) => b.spread - a.spread || b.size - a.size)
            .slice(0, cfg.topN);

        report.clusters = clusters;
        report.stats.clustersFound = indexClusters.filter(idxs => idxs.length >= cfg.minClusterSize).length;
        report.stats.transversalClusters = clusters.length;

        _printReport(report);
        return report;
    }

    function _printReport(report) {
        if (!report.clusters.length) {
            console.log('%c[EntityBackbone] Nessun cluster trasversale trovato (soglia spread ≥ ' + CONFIG.minSpread + ')', 'color:#6366f1');
            return;
        }
        console.log('%c[EntityBackbone] ENTITÀ CANDIDATE A ESSERE "KEYSTONE FRAMMENTATI"', 'color:#10b981;font-weight:bold;font-size:13px');
        console.log(`   ${report.stats.transversalClusters} cluster trasversali su ${report.stats.clustersFound} cluster totali (${report.stats.nodesAnalyzed} nodi analizzati)\n`);
        report.clusters.forEach((c, i) => {
            console.log(`%c${i + 1}. spread=${c.spread} rami · ${c.size} nodi`, 'color:#f59e0b;font-weight:bold');
            c.members.forEach(m => console.log(`     [${m.branch}] "${m.label}" (${m.id}, L${m.level})`));
        });
        console.log('\n%cSe un\'entità che conosci come rilevante (es. "Commissione Bergier") compare qui con spread ≥ 2,\nsignifica che il modello l\'ha generata più volte invece di riconoscerla come nodo condiviso.', 'color:#94a3b8');
    }

    window.isEntityBackboneEnabled = function () {
        try {
            const state = _getAppState();
            return localStorage.getItem('mappai_entity_backbone_enabled') === '1'
                && (state?.aiProvider === 'google' || state?.aiProvider === 'infomaniak')
                && state?.extractionMode === 'mindmap';
        } catch (e) { return false; }
    };

    window.MappAIEntityBackbone = {
        CONFIG,
        analyzeCurrentMap
    };
})();
