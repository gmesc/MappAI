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

    // Dissolve di un wrapper L1 solitario sintetico.
    // Caso (bug Fase 1): il modello ha prodotto UNA sola macro-categoria
    // (es. "Bipolarismo Geopolitico") sotto cui la Fase 3 ha annidato le
    // categorie VERE un livello troppo in basso, mentre altre sono trapelate
    // direttamente a ROOT → gerarchia incoerente.
    // Segnale deterministico: esiste UN solo nodo con id /^L1_\d+$/ (unica L1
    // di Fase 1) e ha ≥2 figli gerarchici diretti.
    // Azione: promuove i figli diretti a L1 (ROOT→figlio), rimuove il wrapper,
    // redirige i suoi cross-link verso ROOT e SOMMA la sua desc in ROOT.desc
    // (no overwrite). Livelli e group vengono poi ricalcolati dagli step 5/5b/6.
    // Gated: default ON. Disattiva con localStorage mappai_dissolve_wrapper_l1='off'.
    function _dissolveSolitaryWrapper(nodes, links, log) {
        if (localStorage.getItem('mappai_dissolve_wrapper_l1') === 'off') return false;

        const isPhase1L1 = id => /^L1_\d+$/.test(id);
        const phase1L1s = nodes.filter(n => isPhase1L1(n.id));
        if (phase1L1s.length !== 1) return false;        // 0 o ≥2 → mappa normale, no-op

        const wrapper = phase1L1s[0];
        const wid = wrapper.id;

        // Figli gerarchici diretti (no cross-link, no ROOT)
        const directChildren = links.filter(l =>
            l.isCross !== true && l.source === wid && l.target !== 'ROOT' && l.target !== wid
        );
        if (directChildren.length < 2) return false;     // non è un umbrella, lascia stare

        const root = nodes.find(n => n.id === 'ROOT');
        if (!root) return false;

        // 1) SOMMA la desc del wrapper dentro ROOT (no overwrite, idempotente)
        const wDesc = (wrapper.desc || '').trim();
        if (wDesc) {
            const rDesc = (root.desc || '').trim();
            if (!rDesc.includes(wDesc)) {
                root.desc = rDesc ? (rDesc + '\n\n' + wDesc) : wDesc;
            }
        }

        // 2) Riscrive i link che toccano il wrapper
        const rewritten = [];
        const seenHier = new Set();   // dedup ROOT→target gerarchici promossi
        for (const l of links) {
            const s = l.source, t = l.target;
            // hierarchical wrapper→child: promuovi (source→ROOT)
            if (l.isCross !== true && s === wid && t !== 'ROOT' && t !== wid) {
                const key = 'ROOT|' + t;
                if (seenHier.has(key)) continue;
                seenHier.add(key);
                rewritten.push({ ...l, source: 'ROOT' });
                continue;
            }
            // hierarchical ROOT→wrapper o wrapper→ROOT (garbage): scarta
            if (l.isCross !== true && ((s === 'ROOT' && t === wid) || (s === wid && t === 'ROOT'))) {
                continue;
            }
            // cross-link verso il wrapper: redirigi a ROOT (la charter è fusa in ROOT)
            if (l.isCross === true && t === wid) {
                if (s === 'ROOT' || s === wid) continue;  // evita self-loop
                rewritten.push({ ...l, target: 'ROOT' });
                continue;
            }
            // cross-link dal wrapper: redirigi a ROOT
            if (l.isCross === true && s === wid) {
                if (t === 'ROOT' || t === wid) continue;
                rewritten.push({ ...l, source: 'ROOT' });
                continue;
            }
            // residui che toccano ancora il wrapper: scarta; il resto invariato
            if (s === wid || t === wid) continue;
            rewritten.push(l);
        }
        links.length = 0;
        for (const l of rewritten) links.push(l);

        // 3) Rimuovi il nodo wrapper
        const wIdx = nodes.findIndex(n => n.id === wid);
        if (wIdx !== -1) nodes.splice(wIdx, 1);

        log.dissolvedWrapper = wid + ' ("' + (wrapper.label || '') + '") → ' +
            directChildren.length + ' figli promossi a L1, desc fusa in ROOT';
        return true;
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
        let dissolved = false;

        // ── Step 1: Normalizza source/target (D3 può averli convertiti in oggetti) ──
        links.forEach(l => {
            if (l.source && typeof l.source === 'object') l.source = l.source.id;
            if (l.target && typeof l.target === 'object') l.target = l.target.id;
        });

        // ── Step 1b: Dissolvi un eventuale wrapper L1 solitario sintetico ──
        // (deve girare PRIMA della separazione hierarchical/cross di Step 2,
        // così i link riscritti vengono raccolti correttamente).
        dissolved = _dissolveSolitaryWrapper(nodes, links, log);
        if (dissolved) changes++;

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

        // ── Step 5b: Dopo un dissolve, rinumera i group degli L1 ──
        // I figli promossi mantenevano il group del wrapper (tutti uguali →
        // collisione colore). Assegna un intero distinto a ciascun L1 nell'ordine
        // dell'array nodi. Step 6 poi propaga ai sottoalberi.
        if (dissolved) {
            let g = 0;
            for (const node of nodes) {
                if (node.level === 1) {
                    g++;
                    if (node.group !== g) { node.group = g; changes++; }
                }
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
            if (log.dissolvedWrapper)    console.log('  Wrapper L1 dissolto:', log.dissolvedWrapper);
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

    // Dissolve wrapper L1 solitario — default ON. Disattiva con flag 'off'.
    window.disableWrapperDissolve = () => {
        localStorage.setItem('mappai_dissolve_wrapper_l1', 'off');
        console.log('[TreeSanitizer] dissolve wrapper L1 DISATTIVATO');
    };
    window.enableWrapperDissolve = () => {
        localStorage.removeItem('mappai_dissolve_wrapper_l1');
        console.log('[TreeSanitizer] dissolve wrapper L1 ATTIVO (default)');
    };

})();
