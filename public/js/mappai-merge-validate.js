// ==========================================
// MERGE/UNISCI + AI CROSS-LINKING + VALIDATE LINK — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// MERGE / UNISCI SYSTEM
// ==========================================
let pendingMergeData = null;
let pendingMergeFile = null;
let pendingMergeInputId = null;
let validateLinkTarget = null;

window.mergeGraph = function (event) {
    const file = event.target.files[0]; if (!file) return;
    pendingMergeInputId = event.target.id;
    if (!appState.db.nodes.length) {
        window.showToast(window.t('tst_no_open_map', "Nessuna mappa aperta. Usa 'Carica' per aprire una mappa prima."), "error");
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const rawData = JSON.parse(e.target.result);
            const data = rawData.db ? { ...rawData, ...rawData.db } : rawData;
            if (!data.nodes || !data.links) throw new Error("JSON non valido.");
            pendingMergeData = data;
            pendingMergeFile = file.name;

            // Show confirmation modal
            const modal = document.getElementById('merge-confirm-modal');
            const title = document.getElementById('merge-modal-title');
            const desc = document.getElementById('merge-modal-description');
            const aiOpt = document.getElementById('merge-ai-option');

            const importedLabel = data.rootNodeLabel || file.name;
            title.innerHTML = '<i data-lucide="merge" class="w-5 h-5"></i> Unisci: ' + importedLabel;

            desc.innerHTML = `
                        <p>Stai per unire <strong>"${importedLabel}"</strong> (${data.nodes.length} nodi, ${data.links.length} link) alla mappa corrente.</p>
                        <ul class="list-disc pl-4 mt-2 space-y-1 text-xs text-slate-500">
                            <li>I nodi verranno aggiunti con ID univoci per evitare conflitti.</li>
                            <li>Le due mappe appariranno come cluster separati sulla stessa vista.</li>
                            <li>Potrai creare link manuali tra le mappe con click destro → "Crea Relazione".</li>
                        </ul>
                    `;

            // Show AI option only for KG mode
            if (appState.extractionMode !== 'mindmap') {
                aiOpt.classList.remove('hidden');
            } else {
                aiOpt.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            window.safeCreateIcons();

        } catch (err) {
            window.showAlert("Errore", "Errore lettura file: " + err.message);
        }
    };
    reader.readAsText(file);
}

window.cancelMerge = function () {
    const modal = document.getElementById('merge-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingMergeData = null;
    pendingMergeFile = null;
    // Reset file input
    const input = document.getElementById(pendingMergeInputId);
    if (input) input.value = '';
}

window.confirmMerge = function () {
    const modal = document.getElementById('merge-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (!pendingMergeData) return;

    // 1. Auto-save before merge
    if (window.electronAPI) {
        window.electronAPI.saveMapJSON(appState);
    }
    StorageManager.saveCurrentProject();
    window.showToast(window.t('tst_autosave_done', "Salvataggio automatico completato."), "success");

    const data = pendingMergeData;
    const wantAICrosslink = document.getElementById('merge-ai-crosslink')?.checked && appState.extractionMode !== 'mindmap';

    // 2. Normalize incoming links
    data.links.forEach(l => {
        if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
        if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
    });
    data.nodes.forEach(n => {
        delete n.vx; delete n.vy;
        delete n.fx; delete n.fy;
    });

    // 3. Semantic Merging & ID Collision Avoidance
    const prefix = '_m' + Date.now() + '_';
    const idMap = {};
    let addedNodes = 0;
    const newNodesToAdd = [];

    data.nodes.forEach(incomingNode => {
        const oldId = incomingNode.id;
        // Check if a node with the same label already exists
        const existingNode = appState.db.nodes.find(n => n.label && incomingNode.label && n.label.toLowerCase().trim() === incomingNode.label.toLowerCase().trim());

        if (existingNode) {
            // Semantic Merge
            idMap[oldId] = existingNode.id;
            // Merge descriptions & content (surgical injection)
            if (incomingNode.desc && existingNode.desc !== incomingNode.desc) {
                existingNode.desc = (existingNode.desc || "") + "\n\n[Dettaglio Unione]: " + incomingNode.desc;
            }
            if (incomingNode.content && existingNode.content !== incomingNode.content) {
                existingNode.content = (existingNode.content || "") + "\n\n[Nota Unione]: " + incomingNode.content;
            }

            // Merge chunks
            if (incomingNode.chunks && Array.isArray(incomingNode.chunks)) {
                existingNode.chunks = existingNode.chunks || [];
                existingNode.chunks.push(...incomingNode.chunks);
                existingNode.chunks = [...new Set(existingNode.chunks)];
            }
            // Merge URLs
            if (incomingNode.urls && Array.isArray(incomingNode.urls)) {
                existingNode.urls = existingNode.urls || [];
                existingNode.urls.push(...incomingNode.urls);
                existingNode.urls = [...new Set(existingNode.urls)];
            }
            // Merge Images
            if (incomingNode.images && Array.isArray(incomingNode.images)) {
                existingNode.images = existingNode.images || [];
                existingNode.images.push(...incomingNode.images);
                existingNode.images = [...new Set(existingNode.images)];
            }
        } else {
            // New Node
            const newId = prefix + oldId;
            idMap[oldId] = newId;
            incomingNode.id = newId;
            incomingNode.x = (incomingNode.x || 0) + 300 + Math.random() * 150;
            incomingNode.y = (incomingNode.y || 0) + 300 + Math.random() * 150;
            newNodesToAdd.push(incomingNode);
            addedNodes++;
        }
    });

    data.links.forEach(l => {
        l.source = idMap[l.source] || l.source;
        l.target = idMap[l.target] || l.target;
    });

    // Remove duplicate links
    const uniqueLinks = [];
    const linkSet = new Set();
    [...appState.db.links, ...data.links].forEach(l => {
        let sid = typeof l.source === 'object' ? l.source.id : l.source;
        let tid = typeof l.target === 'object' ? l.target.id : l.target;
        const sig1 = `${sid}-${tid}-${l.rel}`;
        const sig2 = `${tid}-${sid}-${l.rel}`;
        if (!linkSet.has(sig1) && !linkSet.has(sig2)) {
            linkSet.add(sig1);
            uniqueLinks.push(l);
        }
    });
    appState.db.links = uniqueLinks;

    // 4. Track which nodes are "new" for AI cross-linking
    const newNodeIds = new Set(newNodesToAdd.map(n => n.id));
    const existingNodeIds = new Set(appState.db.nodes.map(n => n.id));

    // 5. Add to appState
    let addedLinks = data.links.length;
    appState.db.nodes.push(...newNodesToAdd);

    // 6. Reset simulation
    simulation = null;
    initD3Visualization();
    window.updateDegreeStats();
    window.renderTreeView();
    window.updateUserNotesSidebar();

    const importedLabel = pendingMergeData.rootNodeLabel || pendingMergeFile;
    window.showToast(window.t('tst_merge_done', 'Unione completata: +{n} nodi, +{l} link da "{x}"').replace('{n}', addedNodes).replace('{l}', addedLinks).replace('{x}', importedLabel), "success");

    // 7. AI Cross-linking (async)
    if (wantAICrosslink) {
        setTimeout(() => {
            window.aiCrossLink(existingNodeIds, newNodeIds);
        }, 500);
    }

    pendingMergeData = null;
    pendingMergeFile = null;
    const input = document.getElementById(pendingMergeInputId);
    if (input) input.value = '';
}

// ==========================================
// AI CROSS-LINKING
// ==========================================
window.aiCrossLink = async function (existingIds, newIds) {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showToast(window.t('tst_no_key_corr', "Nessuna API Key per le correlazioni AI."), "error");
        return;
    }

    // Collect labels from both sets (no token limit needed for Gemini 1.5)
    const existingLabels = appState.db.nodes
        .filter(n => existingIds.has(n.id))
        .map(n => ({ id: n.id, label: n.label }));

    const newLabels = appState.db.nodes
        .filter(n => newIds.has(n.id))
        .map(n => ({ id: n.id, label: n.label }));

    if (existingLabels.length === 0 || newLabels.length === 0) return;

    window.showLoadingOverlay(true, "L'AI sta cercando correlazioni tra le mappe...");

    const promptText = window.fillPromptTemplate("SEMANTIC_CORRELATION", {
        existingLabels: existingLabels.map(n => `- ${n.id}: "${n.label}"`).join('\\n'),
        newLabels: newLabels.map(n => `- ${n.id}: "${n.label}"`).join('\\n')
    });

    try {
        if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'crosslink');
        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
        }, apiKey);

        let jsonText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const suggestions = JSON.parse(jsonText);

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            window.showLoadingOverlay(false);
            window.showToast(window.t('tst_no_corr', "Nessuna correlazione trovata dall'AI."), "info");
            return;
        }

        // Add AI-suggested links as dashed
        let addedAI = 0;
        suggestions.forEach(s => {
            // Verify both nodes exist
            const sourceExists = appState.db.nodes.some(n => n.id === s.source);
            const targetExists = appState.db.nodes.some(n => n.id === s.target);
            if (sourceExists && targetExists && s.rel) {
                appState.db.links.push({
                    source: s.source,
                    target: s.target,
                    rel: '🤖 ' + s.rel,
                    aiSuggested: true
                });
                addedAI++;
            }
        });

        // Re-render to show dashed links
        simulation = null;
        initD3Visualization();

        window.showLoadingOverlay(false);
        window.showToast(window.t('tst_ai_corr', "L'AI ha suggerito {n} correlazioni. Click destro sui link tratteggiati per validarli o rimuoverli.").replace('{n}', addedAI), "success");

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showToast(window.t('tst_crosslink_error', "Errore AI cross-linking: ") + err.message, "error");
    }
}

// ==========================================
// VALIDATE / REMOVE AI LINKS
// ==========================================
window.openValidateModal = function (linkData) {
    validateLinkTarget = linkData;
    const sNode = appState.db.nodes.find(n => n.id === (typeof linkData.source === 'object' ? linkData.source.id : linkData.source));
    const tNode = appState.db.nodes.find(n => n.id === (typeof linkData.target === 'object' ? linkData.target.id : linkData.target));

    document.getElementById('validate-node-a').textContent = sNode ? sNode.label : '?';
    document.getElementById('validate-node-b').textContent = tNode ? tNode.label : '?';
    document.getElementById('validate-rel-input').value = linkData.rel.replace('🤖 ', '');

    const modal = document.getElementById('validate-link-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    window.safeCreateIcons();
}

window.closeValidateModal = function () {
    const modal = document.getElementById('validate-link-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    validateLinkTarget = null;
}

window.confirmValidateLink = function () {
    if (!validateLinkTarget) return;
    const newRel = document.getElementById('validate-rel-input').value.trim();
    if (!newRel) {
        window.showToast(window.t('tst_need_rel_word', "Inserisci una parola di relazione."), "error");
        return;
    }
    // Update the link
    validateLinkTarget.rel = newRel;
    validateLinkTarget.aiSuggested = false;

    // Re-render to update visual
    renderGraph();
    window.closeValidateModal();
    window.showToast(window.t('tst_link_validated', "Link validato e confermato!"), "success");
}

window.removeAILink = function (linkData) {
    const idx = appState.db.links.indexOf(linkData);
    if (idx >= 0) {
        appState.db.links.splice(idx, 1);
        renderGraph();
        window.showToast(window.t('tst_ai_link_removed', "Link AI rimosso."), "info");
    }
}
