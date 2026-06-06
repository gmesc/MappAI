// mappai-tree-sanitizer.js
// Passaggio deterministico post-generazione che corregge le anomalie
// strutturali della MindMap prodotte dal depth-first con ID generati dal modello:
//   1. Nodi con più genitori → tieni uno solo (rule: stesso prefisso L1)
//   2. Link L1→L1 → rimossi (gli L1 si appendono solo a ROOT)
//   3. Livelli → ricalcolati via BFS dalla profondità reale dell'albero
//   4. Group (colore) → propagato dall'antenato L1 corretto
// Zero chiamate AI. Idempotente: se la struttura è già pulita logga "nessun fix".
// Disabilita: localStorage.setItem('mappai_tree_sanitizer_disabled','true')

(function () {
    'use strict';

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    // Estrae il prefisso del ramo L1 dall'ID di un nodo.
    // "L1_0_L3_A1" → "L1_0"   "L1_2_L2_A" → "L1_2"   "ROOT" → null
    function _l1Prefix(id) {
        if (!id || id === 'ROOT') return null;
        const m = id.match(/^(L1_\d+)/);
        return m ? m[1] : null;
    }

    // Lunghezza del longest common prefix tra due stringhe
    function _commonPrefixLen(a, b) {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        return i;
    }

    // Dato un targetId e più link candidati come genitore, sceglie quello
    // semanticamente più corretto basandosi sul prefisso L1 condiviso.
    function _pickBestParent(targetId, candidates) {
        const targetBranch = _l1Prefix(targetId);
        if (!targetBranch) return candidates[0];
        // 1) source è esattamente il ramo root (L1_0, L1_1 …)
        const branchRoot = candidates.find(c => c.source === targetBranch);
        if (branchRoot) return branchRoot;
        // 2) source è nello stesso ramo L1
        const sameBranch = candidates.find(c => _l1Prefix(c.source) === targetBranch);
        if (sameBranch) return sameBranch;
        // 3) fallback: longest common prefix
        let best = candidates[0];
        let bestLen = _commonPrefixLen(best.source, targetId);
        for (let i = 1; i < candidates.length; i++) {
            const len = _commonPrefixLen(candidates[i].source, targetId);
            if (len > bestLen) { best = candidates[i]; bestLen = len; }
        }
        return best;
    }

    window.sanitizeMindMapTree = function () {
        const state = _getAppState();
        if (!state || !state.db) return { changes: 0 };
        if (state.extractionMode !== 'mindmap') return { changes: 0 };
        if (localStorage.getItem('mappai_tree_sanitizer_disabled') === 'true') {
            console.log('[TreeSanitizer] disabilitato via flag');
            return { changes: 0 };
        }

        const nodes = state.db.nodes;
        const links = state.db.links;
        const log = { removedLinks: [], fixedL1: [], recalcedLevels: 0, fixedGroups: 0 };
        let changes = 0;

        // ── Step 1: Normalizza source/target (D3 può averli convertiti in oggetti) ──
        links.forEach(l => {
            if (l.source && typeof l.source === 'object') l.source = l.source.id;
            if (l.target && typeof l.target === 'object') l.target = l.target.id;
        });

        // ── Step 2: Separa link gerarchici da cross-link ──
        // Cross = isCross:true oppure rel che indica cross/trasversale
        const isCrossLink = l => l.isCross === true;
        let hierarchical = links.filter(l => !isCrossLink(l));
        const crossLinks   = links.filter(l =>  isCrossLink(l));

        // ── Step 3: Rimuovi link L1→L1 ──
        // Nessun L1 può essere figlio di un altro L1 (solo ROOT può avere L1 come figli)
        const l1Ids = new Set(nodes.filter(n => n.level === 1).map(n => n.id));
        hierarchical = hierarchical.filter(l => {
            if (l.source !== 'ROOT' && l1Ids.has(l.source) && l1Ids.has(l.target)) {
                log.fixedL1.push(`${l.source} → ${l.target}`);
                changes++;
                return false;
            }
            return true;
        });

        // ── Step 4: Imponi singolo genitore per nodo ──
        const incomingByTarget = new Map();
        for (const l of hierarchical) {
            if (!incomingByTarget.has(l.target)) incomingByTarget.set(l.target, []);
            incomingByTarget.get(l.target).push(l);
        }
        const linksToRemove = new Set();
        for (const [targetId, incoming] of incomingByTarget) {
            if (incoming.length <= 1) continue;
            const best = _pickBestParent(targetId, incoming);
            for (const l of incoming) {
                if (l !== best) {
                    linksToRemove.add(l);
                    log.removedLinks.push(`${l.source} → ${targetId} (mantenuto ${best.source})`);
                    changes++;
                }
            }
        }
        const sanitizedH = hierarchical.filter(l => !linksToRemove.has(l));

        // ── Step 5: Ricalcola livelli via BFS da ROOT ──
        const childrenOf = new Map();
        const parentOf   = new Map();
        for (const l of sanitizedH) {
            parentOf.set(l.target, l.source);
            if (!childrenOf.has(l.source)) childrenOf.set(l.source, []);
            childrenOf.get(l.source).push(l.target);
        }
        const levelOf = new Map();
        levelOf.set('ROOT', 0);
        const queue = ['ROOT'];
        while (queue.length > 0) {
            const cur = queue.shift();
            for (const child of (childrenOf.get(cur) || [])) {
                if (!levelOf.has(child)) {
                    levelOf.set(child, levelOf.get(cur) + 1);
                    queue.push(child);
                }
            }
        }
        for (const node of nodes) {
            if (levelOf.has(node.id) && node.level !== levelOf.get(node.id)) {
                node.level = levelOf.get(node.id);
                log.recalcedLevels++;
                changes++;
            }
        }

        // ── Step 6: Propaga il group (colore) dall'antenato L1 reale ──
        // Necessario dopo che Phase5 ha spostato nodi tra rami: il group riflette
        // ancora il ramo originale. Ricerca risalendo la catena parentOf.
        const l1ById = new Map(nodes.filter(n => n.level === 1).map(n => [n.id, n]));
        const findGroup = (nodeId) => {
            let cur = nodeId;
            for (let depth = 0; depth < 20; depth++) {
                if (l1ById.has(cur)) return l1ById.get(cur).group;
                const par = parentOf.get(cur);
                if (!par || par === 'ROOT') return null;
                cur = par;
            }
            return null;
        };
        for (const node of nodes) {
            if (node.level <= 1) continue;
            const g = findGroup(node.id);
            if (g !== null && node.group !== g) {
                node.group = g;
                log.fixedGroups++;
                changes++;
            }
        }

        // ── Step 7: Aggiorna appState.db.links ──
        if (changes > 0) {
            state.db.links.length = 0;
            for (const l of sanitizedH)  state.db.links.push(l);
            for (const l of crossLinks)  state.db.links.push(l);
        }

        // ── Log ──
        if (changes > 0) {
            console.log('%c[TreeSanitizer] ' + changes + ' fix applicati', 'color:#22c55e;font-weight:bold');
            if (log.fixedL1.length)      console.log('  L1→L1 rimossi:', log.fixedL1);
            if (log.removedLinks.length) console.log('  Multi-genitore risolti:', log.removedLinks);
            if (log.recalcedLevels)      console.log('  Livelli ricalcolati:', log.recalcedLevels, 'nodi');
            if (log.fixedGroups)         console.log('  Group corretti:', log.fixedGroups, 'nodi');
        } else {
            console.log('[TreeSanitizer] struttura già pulita — nessun fix necessario');
        }

        return { changes, log };
    };

    // Comandi console per override manuale
    window.disableTreeSanitizer = () => {
        localStorage.setItem('mappai_tree_sanitizer_disabled', 'true');
        console.log('[TreeSanitizer] disabilitato');
    };
    window.enableTreeSanitizer = () => {
        localStorage.removeItem('mappai_tree_sanitizer_disabled');
        console.log('[TreeSanitizer] abilitato');
    };

})();
