// ==========================================
// AI CROSS-LINKING + VALIDATE LINK — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// 12/10/2026 (0087, lotto 10-modali): «Unisci mappa» (mergeGraph/confirmMerge,
// #merge-confirm-modal, la voce del Graph manager) è USCITO: Giacomo non lo usa più.
// ==========================================
let validateLinkTarget = null;

// ==========================================
// AI CROSS-LINKING
// ==========================================
window.aiCrossLink = async function (existingIds, newIds) {
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
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
        // Invariante 8: mai JSON.parse diretto su una risposta AI. Da una lista
        // troncata il salvataggio tiene le correlazioni complete; se non recupera
        // niente LANCIA, e il catch qui sotto dà lo stesso «Errore AI cross-linking».
        const suggestions = window.salvageTruncatedJSON(jsonText);

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
