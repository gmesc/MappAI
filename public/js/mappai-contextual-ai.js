// ==========================================
// CONTEXTUAL AI EXTENSION — estratto da app.js
// ==========================================
// Espande un nodo iniettando concetti da testo/PDF tramite AI.
// Caricato DOPO app.js: usa appState, cleanLabel, fillPromptTemplate, fetchModelAPI,
// buildSystemInstruction e gli helper window.* via scope globale.
// NB reverse-deps risolte a runtime via scope lessicale globale condiviso:
//   - legge MIND_MAP_SYSTEM_INSTRUCTION / KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION (const in app.js)
//   - riassegna `simulation = null` (let top-level in app.js) prima di initD3Visualization()
let contextualAITargetNode = null;

window.openContextualAIExtensionModal = function (nodeData) {
    contextualAITargetNode = nodeData;
    document.getElementById('contextual-ai-node-title').textContent = cleanLabel(nodeData.label);
    document.getElementById('contextual-ai-input').value = '';
    document.getElementById('ctx-pdf-status').classList.add('hidden');
    document.getElementById('ctx-pdf-file').value = '';
    window.ctxExpansionPDFFile = null;
    window.switchCtxTab('text');

    const modal = document.getElementById('contextual-ai-extension-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const box = document.getElementById('contextual-ai-extension-box') || modal.querySelector('div');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (box) box.classList.remove('scale-95');
    }, 10);
};

window.executeContextualAIExtension = async function () {
    let sourceContent = "";
    if (window.ctxExpansionSourceType === 'pdf') {
        if (!window.ctxExpansionPDFFile) {
            window.showAlert("Errore", "Seleziona prima un file PDF.");
            return;
        }
        window.showLoadingOverlay(true, "Estrazione testo dal PDF in corso...");
        try {
            sourceContent = await window.extractTextFromPDF(window.ctxExpansionPDFFile);
            if (!sourceContent) throw new Error("Testo estratto vuoto.");
        } catch (e) {
            window.showLoadingOverlay(false);
            window.showAlert("Errore PDF", "Impossibile leggere il PDF: " + e.message);
            return;
        }
    } else {
        sourceContent = document.getElementById('contextual-ai-input').value.trim();
    }

    if (!sourceContent) {
        window.showAlert("Errore", "Inserisci del testo, un URL o carica un PDF per l'espansione.");
        return;
    }
    if (!contextualAITargetNode) return;

    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showAlert("Errore", "Inserisci la API Key di Google Gemini nelle impostazioni.");
        return;
    }

    window.closeContextualAIModal();
    window.showLoadingOverlay(true, "MappAI sta leggendo e iniettando i nuovi concetti...");

    try {

        const existingLabels = appState.db.nodes.map(n => n.label.toLowerCase().trim());
        const promptKey = appState.studentMode ? "SOTA_SECOND_BRAIN_STUDENT" : "SOTA_SECOND_BRAIN";

        const promptText = window.fillPromptTemplate(promptKey, {
            targetId: contextualAITargetNode.id,
            targetLabel: contextualAITargetNode.label,
            existingLabels: existingLabels.join(', '),
            sourceContent: sourceContent,
            targetLevel: contextualAITargetNode.level + 1,
            targetGroup: contextualAITargetNode.group || 0
        });

        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: promptText }] }],
            systemInstruction: { parts: [{ text: buildSystemInstruction(appState.extractionMode === 'mindmap' ? MIND_MAP_SYSTEM_INSTRUCTION : KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION) }] },
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
        }, apiKey);

        let jsonText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const newData = JSON.parse(jsonText);

        if (!newData.nodes || newData.nodes.length === 0) {
            window.showLoadingOverlay(false);
            window.showToast("Nessun nuovo concetto trovato nel materiale.", "info");
            return;
        }

        const idMap = {};
        newData.nodes.forEach(n => {
            // Smart Merging (Fusione Semantica)
            const existing = appState.db.nodes.find(old =>
                old.label && n.label &&
                old.label.toLowerCase().trim() === n.label.toLowerCase().trim()
            );

            if (existing) {
                idMap[n.id] = existing.id;
                // Inietta il contenuto del nuovo nodo nel vecchio
                if (n.desc || n.content) {
                    existing.chunks = existing.chunks || [];
                    const newChunk = n.desc || n.content;
                    if (!existing.chunks.includes(newChunk)) {
                        existing.chunks.push(newChunk);
                    }
                }
            } else {
                // Nuovo nodo
                idMap[n.id] = n.id;
                n.chunks = [n.desc || "Espansione IA"];
                n.studyStatus = 'none';
                n.x = contextualAITargetNode.x + (Math.random() * 200 - 100);
                n.y = contextualAITargetNode.y + (Math.random() * 200 - 100);
                appState.db.nodes.push(n);
            }
        });

        newData.links.forEach(l => {
            l.source = idMap[l.source] || l.source;
            l.target = idMap[l.target] || l.target;

            // Evita link duplicati
            const linkExists = appState.db.links.some(old => {
                const s1 = typeof old.source === 'object' ? old.source.id : old.source;
                const t1 = typeof old.target === 'object' ? old.target.id : old.target;
                return (s1 === l.source && t1 === l.target) || (s1 === l.target && t1 === l.source);
            });
            if (!linkExists) appState.db.links.push(l);
        });

        window.showLoadingOverlay(false);
        window.showToast(`Espansione completata: aggiunti ${newData.nodes.length} nuovi nodi.`, "success");

        simulation = null;
        initD3Visualization();
        window.updateDegreeStats();
        window.renderTreeView();

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore IA", "L'elaborazione ha fallito: " + err.message);
    }
};

window.switchCtxTab = function (tab) {
    const btnText = document.getElementById('tab-ctx-text');
    const btnPdf = document.getElementById('tab-ctx-pdf');
    const panelText = document.getElementById('ctx-panel-text');
    const panelPdf = document.getElementById('ctx-panel-pdf');

    if (tab === 'text') {
        btnText.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnText.classList.remove('text-slate-500');
        btnPdf.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnPdf.classList.add('text-slate-500');
        panelText.classList.remove('hidden');
        panelPdf.classList.add('hidden');
        window.ctxExpansionSourceType = 'text';
    } else {
        btnPdf.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnPdf.classList.remove('text-slate-500');
        btnText.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnText.classList.add('text-slate-500');
        panelPdf.classList.remove('hidden');
        panelText.classList.add('hidden');
        window.ctxExpansionSourceType = 'pdf';
    }
    window.safeCreateIcons();
};

window.handleCtxPDFSelect = function (input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('ctx-pdf-status');
    status.textContent = `File pronto: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    status.classList.remove('hidden');
    window.ctxExpansionPDFFile = file;
};

window.closeContextualAIModal = function () {
    const modal = document.getElementById('contextual-ai-extension-modal');
    if (!modal) return;
    const box = document.getElementById('contextual-ai-extension-box') || modal.querySelector('div');
    modal.classList.add('opacity-0');
    if (box) box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
};

window.ctxExpansionSourceType = 'text';
window.ctxExpansionPDFFile = null;
