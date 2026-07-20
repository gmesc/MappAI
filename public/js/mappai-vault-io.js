// ==========================================
// MARKDOWN VAULT I/O (save/load/import/demo) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// SOTA: MARKDOWN VAULT LOGIC
// ==========================================

// Assembla l'oggetto mapData del vault dallo stato corrente (stessi campi del
// salvataggio manuale). Riusato da saveMapVault (con dialog) E dalla pipeline
// 011 (salvataggio automatico via electronAPI.saveVault, senza dialog).
window.buildVaultMapData = function () {
    return {
        extractionMode: appState.extractionMode,
        rootNodeLabel: appState.rootNodeLabel,
        nodes: appState.db.nodes,
        links: appState.db.links,
        studySets: appState.db.studySets || [],
        userProfile: appState.userProfile,
        tutorState: serializeTutorState(tutorState),
        aiProvider: appState.aiProvider,
        aiModel: document.getElementById('model-select')?.value || localStorage.getItem(appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model'),
        generationUsage: appState.generationUsage,
        customColors: appState.db.customColors || {}
    };
};

window.saveMapVault = async function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessuna mappa da esportare.");

    try {
        const result = await window.electronAPI.pickFolder({ createOnly: true });
        if (result.canceled) return;

        window.showLoadingOverlay(true, "Esportazione Vault in corso...");

        const saveRes = await window.electronAPI.saveVault({
            folderPath: result.folderPath,
            mapData: window.buildVaultMapData()
        });

        window.showLoadingOverlay(false);
        if (saveRes.success) {
            appState.activeVaultPath = result.folderPath;

            // Applica upgrade per ripulire il Base64 dalla memoria
            if (saveRes.upgrades) {
                saveRes.upgrades.forEach(up => {
                    const node = appState.db.nodes.find(n => n.id === up.id);
                    if (node && up.images) {
                        node.images = up.images;
                        if (up.images.length > 0) node.image = up.images[0];
                    }
                });
                console.log("Memory Clean: Base64 images replaced with local paths.");
            }

            // Mostra subito il tasto Sincronizza
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            }

            window.showToast(window.t('tst_vault_created', "Vault creato e collegato!"), "success");
        } else {
            window.showAlert("Errore Salvataggio", saveRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        console.error(e);
        window.showAlert("Errore", e.message);
    }
};

window.loadDemoGraph = async function (url) {
    try {
        window.closeVaultManager();
        window.showLoadingOverlay(true, "Caricamento Demo...");
        const res = await fetch(url);
        if (!res.ok) throw new Error("File demo non trovato.");
        const data = await res.json();

        if (!data.nodes || !data.links) throw new Error("Formato JSON non valido.");

        data.links.forEach(l => {
            if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
            if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
        });
        data.nodes.forEach(n => {
            delete n.vx; delete n.vy;
            delete n.fx; delete n.fy;
        });

        appState.db = { nodes: data.nodes, links: data.links };
        appState.extractionMode = data.mode || data.extractionMode || "mindmap";

        if (data.generationUsage) {
            appState.generationUsage = data.generationUsage;
            if (window.updateCostDisplay) window.updateCostDisplay();
        } else {
            appState.generationUsage = null;
        }

        if (data.customColors) {
            appState.db.customColors = data.customColors;
        }

        appState.db.sourcesDict = {};
        (appState.db.nodes || []).forEach(n => {
            if (n.chunks && n.chunks.length > 0) {
                appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                    title: "Estratto Fonte",
                    source: "Dato Demo",
                    text: c
                }));
            }
        });

        // reset/rimpiazzo chat: setTutorState aggiorna la variabile reale (il vecchio
        // window.tutorState era una reference morta con shape legacy)
        window.setTutorState(data.tutorState || null);

        appState.rootNodeLabel = data.rootNodeLabel || "Mappa Esempio";

        if (typeof simulation !== 'undefined') simulation = null;
        window.switchToMapLayout();
        if (typeof initD3Visualization === 'function') initD3Visualization();

        window.showLoadingOverlay(false);
        window.showToast(window.t('tst_demo_loaded', "Mappa dimostrativa caricata con successo!"), "success");
    } catch (err) {
        window.showLoadingOverlay(false);
        console.error(err);
        window.showAlert("Errore", "Impossibile caricare l'esempio: " + err.message);
    }
};
window.loadMapVault = async function () {
    // Mappa in sostituzione: chiudi un'eventuale sessione di Studio attivo
    // (ripristino snapshot) prima di caricare il vault.
    if (window.ActiveStudy && window.ActiveStudy.emergencyExit) window.ActiveStudy.emergencyExit();
    try {
        const result = await window.electronAPI.pickFolder({ importOnly: true });
        if (result.canceled) return;

        window.showLoadingOverlay(true, "Caricamento Vault...");

        const loadRes = await window.electronAPI.loadVault(result.folderPath);

        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = result.folderPath;
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            appState.rootNodeLabel = result.folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

            let nodesList = loadRes.data.nodes || [];
            let linksList = loadRes.data.links || [];

            const rootNode = nodesList.find(n => n.level === 0);
            if (rootNode) {
                rootNode.label = appState.rootNodeLabel;
            }
            if (nodesList.length === 0) {
                const rootId = "node_" + Math.random().toString(36).substr(2, 9);
                nodesList = [{
                    id: rootId,
                    label: appState.rootNodeLabel,
                    level: 0,
                    group: 0,
                    x: 640,
                    y: 400,
                    fx: 640,
                    fy: 400
                }];
                linksList = [];
                // Salva immediatamente il vault con il nodo radice di default per creare i file fisici
                window.electronAPI.saveVault({
                    folderPath: result.folderPath,
                    mapData: {
                        extractionMode: appState.extractionMode,
                        rootNodeLabel: appState.rootNodeLabel,
                        nodes: nodesList,
                        links: linksList,
                        customColors: {}
                    }
                });
            }

            appState.db = {
                nodes: nodesList,
                links: linksList,
                studySets: loadRes.data.studySets || [],
                sourcesDict: {},
                customColors: loadRes.data.customColors || {}
            };

            if (window.MappAIJigsaw) {
                window.MappAIJigsaw.syncModeToVault(loadRes.data.branchLocks);
                window.MappAIJigsaw.applyLocks(appState.db.nodes, loadRes.data.branchLocks);
            }

            // Ripristina le chat del vault (o azzera: mai ereditare quelle della mappa precedente)
            window.setTutorState(loadRes.data.tutorState || null);

            if (window.renderStudySets) window.renderStudySets();

            appState.db.nodes.forEach(n => {
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            window.switchToMapLayout();

            // Mostra tasto Sincronizza Vault
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            }

            setTimeout(() => { initD3Visualization(); }, 200);
            window.showToast(window.t('tst_vault_loaded', "Vault caricato con successo!"), "success");
            // 011: pipeline materiali incompleta su questo vault → proponi la ripresa.
            if (window.MappAIPipeline && window.MappAIPipeline.checkResume) window.MappAIPipeline.checkResume(result.folderPath);
        } else {
            window.showAlert("Errore Caricamento", loadRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        console.error(e);
        window.showAlert("Errore", e.message);
    }
};

window.handleImportClick = function (event) {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
    if (isCapacitor) {
        // Su iPadOS/Capacitor facciamo scattare direttamente il click sull'input file nascosto
        // in modo sincrono per conservare la user gesture valida di WKWebView
        const filePicker = document.getElementById('mappai-ipad-vault-file-picker');
        if (filePicker) {
            filePicker.click();
        }
    } else {
        // Su desktop/electron chiamiamo il normale caricamento
        window.loadMapVault();
    }
};

window.handleIPadVaultFileSelected = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    window.showLoadingOverlay(true, "Importazione Vault in corso...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const parsed = JSON.parse(evt.target.result);
            const data = parsed.db ? parsed.db : parsed;
            if (!data.nodes || !data.links) {
                window.showLoadingOverlay(false);
                window.showAlert("Errore", "Il file selezionato non è un Vault di MappAI valido.");
                return;
            }
            const baseName = file.name.replace('.json', '');
            const safeName = baseName.replace(/[^a-zA-Z0-9_]/g, "_");

            // Salva il vault nativamente tramite il bridge
            const saveRes = await window.electronAPI.saveVault({
                folderPath: safeName,
                mapData: parsed
            });

            window.showLoadingOverlay(false);
            if (saveRes && saveRes.success) {
                window.showToast(window.t('tst_vault_imported', "Vault importato con successo!"), "success");
                // Ricarica la lista dei vault nel modale
                if (typeof window.loadVaultList === 'function') {
                    await window.loadVaultList();
                }
            } else {
                window.showAlert("Errore", "Impossibile salvare il Vault nel dispositivo.");
            }
        } catch (err) {
            window.showLoadingOverlay(false);
            window.showAlert("Errore", "Errore durante la lettura del file JSON: " + err.message);
        }
    };
    reader.readAsText(file);

    // Resetta il valore dell'input per permettere di riselezionare lo stesso file
    event.target.value = "";
};

window.openJSONUploader = function () {
    const fileInput = document.getElementById('landing-import');
    if (fileInput) fileInput.click();
};

window.startEmptyMap = function () {
    // Reset DB to a single root node
    const rootId = "node_" + Math.random().toString(36).substr(2, 9);
    appState.db = {
        nodes: [{ id: rootId, label: "Nuovo Progetto", level: 0, group: 0, desc: "Inizia a scrivere qui..." }],
        links: []
    };
    appState.rootNodeLabel = "Nuovo Progetto";
    appState.extractionMode = "mindmap";

    // Reset simulation
    simulation = null;
    window.switchToMapLayout();
    initD3Visualization();
    window.showToast(window.t('tst_new_project', "Nuovo progetto creato"), "info");
};

// --- Gestione Drag & Drop Globale ---
window.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
window.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.json')) {
        const mockEvent = { target: { files: [files[0]], value: '' } };
        window.importGraph(mockEvent);
        window.showToast(window.t('tst_map_loaded', "Mappa caricata con successo!"), "success");
    }
});
