// mappai-node-merge.js — Fundi nodo A in nodo B
// I figli di A diventano figli di B; A viene eliminato.

window.mergeState = { active: false, sourceNode: null };

window.startMergeMode = function (sourceNode) {
    window.mergeState = { active: true, sourceNode };
    const hint = document.getElementById('mode-hint');
    hint.innerText = `FONDI: "${window.cleanLabel(sourceNode.label)}" — Clicca il nodo di destinazione (ESC per annullare)`;
    hint.classList.remove('hidden');
    // Disabilita altri modi attivi
    if (typeof linkingState !== 'undefined') linkingState.active = false;
};

window.cancelMergeMode = function () {
    window.mergeState = { active: false, sourceNode: null };
    const hint = document.getElementById('mode-hint');
    hint.classList.add('hidden');
};

window.handleMergeTargetClick = function (targetNode) {
    const sourceNode = window.mergeState.sourceNode;
    window.cancelMergeMode();

    if (sourceNode.id === targetNode.id) return;

    const srcLabel = window.cleanLabel(sourceNode.label);
    const tgtLabel = window.cleanLabel(targetNode.label);

    window.showConfirm(
        `Fondi "${srcLabel}" in "${tgtLabel}"?`,
        `I figli di "${srcLabel}" diventeranno figli di "${tgtLabel}". L'operazione non è annullabile.`,
        () => window.executeMerge(sourceNode, targetNode)
    );
};

window.executeMerge = function (A, B) {
    const nodes = appState.db.nodes;
    const links = appState.db.links;

    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target,
    });

    // 1. Rimappa i link in uscita da A (i figli di A → figli di B)
    links.forEach(l => {
        const { src } = getId(l);
        if (src === A.id) {
            if (typeof l.source === 'object') l.source = B.id;
            else l.source = B.id;
        }
    });

    // 2. Rimappa i link in entrata verso A → in entrata verso B
    // (in KG preserva relazioni semantiche; in MindMap il link padre→A
    //  diventa padre→B, che è un self-loop se A era figlio di B — rimosso al passo 3)
    links.forEach(l => {
        const { tgt } = getId(l);
        if (tgt === A.id) {
            if (typeof l.target === 'object') l.target = B.id;
            else l.target = B.id;
        }
    });

    // 3. Rimuovi self-loop (B → B creati dal passo 1 se A e B erano collegati)
    appState.db.links = appState.db.links.filter(l => {
        const { src, tgt } = getId(l);
        return src !== tgt;
    });

    // 4. Deduplica: rimuove coppie source+target identiche tenendo il primo
    const seen = new Set();
    appState.db.links = appState.db.links.filter(l => {
        const { src, tgt } = getId(l);
        const key = `${src}→${tgt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 5. Merge sourcesDict
    const sd = appState.db.sourcesDict || {};
    if (sd[A.id]) {
        sd[B.id] = [...(sd[B.id] || []), ...sd[A.id]];
        delete sd[A.id];
    }

    // 6. Merge customColors (B ha la precedenza)
    const cc = appState.db.customColors || {};
    if (cc[A.id] && !cc[B.id]) {
        cc[B.id] = cc[A.id];
    }
    delete cc[A.id];

    // 7. Ricalcola livelli del sottoalbero di B (solo MindMap)
    if (appState.extractionMode !== 'kg') {
        _recalcLevels(B.id, B.level, nodes, appState.db.links);
    }

    // 7b. Propaga il group di B a tutto il suo sottoalbero (MM e KG).
    // I figli di A che sono stati rimappati su B mantengono ancora il group di A:
    // questo causa due "rami" visivamente identici e il color picker che li cambia entrambi.
    _recalcGroups(B.id, B.group, nodes, appState.db.links);

    // 8. Rimuovi A
    appState.db.nodes = nodes.filter(n => n.id !== A.id);

    if (typeof window.updateDegreeStats === 'function') window.updateDegreeStats();
    renderGraph();
    window.showToast(`"${window.cleanLabel(A.label)}" fuso in "${window.cleanLabel(B.label)}"`, 'success');
};

// ==========================================
// CAMBIA LINK — riassegna il genitore di A in MindMap
// ==========================================

window.relinkState = { active: false, sourceNode: null };

window.startRelinkMode = function (sourceNode) {
    window.relinkState = { active: true, sourceNode };
    if (window.mergeState.active) window.cancelMergeMode();
    if (typeof linkingState !== 'undefined') linkingState.active = false;
    const hint = document.getElementById('mode-hint');
    hint.innerText = `CAMBIA LINK: "${window.cleanLabel(sourceNode.label)}" — Clicca il nuovo nodo genitore (ESC per annullare)`;
    hint.classList.remove('hidden');
};

window.cancelRelinkMode = function () {
    window.relinkState = { active: false, sourceNode: null };
    document.getElementById('mode-hint').classList.add('hidden');
};

window.handleRelinkTargetClick = function (targetNode) {
    const sourceNode = window.relinkState.sourceNode;
    window.cancelRelinkMode();

    if (sourceNode.id === targetNode.id) return;

    window.showLinkFamilyPrompt(
        window.cleanLabel(targetNode.label),
        window.cleanLabel(sourceNode.label),
        (rel) => {
            if (rel) window.executeRelink(sourceNode, targetNode, rel);
        }
    );
};

window.executeRelink = function (A, newParent, rel) {
    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target,
    });

    // Rimuovi tutti i link in entrata verso A (distacca dal vecchio genitore)
    appState.db.links = appState.db.links.filter(l => {
        const { tgt } = getId(l);
        return tgt !== A.id;
    });

    // Aggiungi il nuovo link genitore→A
    appState.db.links.push({ source: newParent.id, target: A.id, rel });

    // Ricalcola livelli di A e del suo sottoalbero
    A.level = newParent.level + 1;
    _recalcLevels(A.id, A.level, appState.db.nodes, appState.db.links);

    // Aggiorna group di A e dell'intero sottoalbero.
    // Caso critico: se il nuovo genitore è il root (L0), A diventa L1 e deve avere
    // un group unico — altrimenti condivide il group del vecchio genitore L1 e i due
    // nodi L1 risultano indistinguibili per il color picker.
    const oldGroup = A.group;
    let newGroup;
    if (newParent.level === 0) {
        // A diventa L1 → assegna un group intero libero
        newGroup = _nextFreeGroup(appState.db.nodes);
        // Migra il custom color di A (se esiste per il vecchio group) al nuovo group
        const cc = appState.db.customColors || {};
        if (cc[oldGroup] !== undefined && cc[newGroup] === undefined) {
            cc[newGroup] = cc[oldGroup];
            // Non cancelliamo oldGroup: altri nodi L1 con quel group potrebbero esistere ancora
        }
    } else {
        // A rimane un nodo intermedio: eredita il group del nuovo genitore
        newGroup = newParent.group;
    }
    A.group = newGroup;
    _recalcGroups(A.id, newGroup, appState.db.nodes, appState.db.links);

    if (typeof window.updateDegreeStats === 'function') window.updateDegreeStats();
    renderGraph();
    window.showToast(`"${window.cleanLabel(A.label)}" spostato sotto "${window.cleanLabel(newParent.label)}"`, 'success');
};

// ==========================================

// Ricalcola ricorsivamente i livelli del sottoalbero radicato in parentId
function _recalcLevels(parentId, parentLevel, nodes, links) {
    const childLinks = links.filter(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source;
        return src === parentId;
    });
    childLinks.forEach(l => {
        const childId = typeof l.target === 'object' ? l.target.id : l.target;
        const child = nodes.find(n => n.id === childId);
        if (child) {
            child.level = parentLevel + 1;
            _recalcLevels(childId, child.level, nodes, links);
        }
    });
}

// Propaga ricorsivamente il group a tutti i discendenti di parentId.
// Necessario dopo merge e relink: _recalcLevels aggiorna solo level, non group.
// Senza questo, due nodi L1 possono condividere lo stesso group → stesso colore.
function _recalcGroups(parentId, parentGroup, nodes, links) {
    const childLinks = links.filter(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source;
        return src === parentId;
    });
    childLinks.forEach(l => {
        const childId = typeof l.target === 'object' ? l.target.id : l.target;
        const child = nodes.find(n => n.id === childId);
        if (child) {
            child.group = parentGroup;
            _recalcGroups(childId, parentGroup, nodes, links);
        }
    });
}

// Restituisce un intero group unico non ancora usato da nessun nodo.
function _nextFreeGroup(nodes) {
    const used = new Set(nodes.map(n => n.group).filter(g => typeof g === 'number'));
    let g = 0;
    while (used.has(g)) g++;
    return g;
}
