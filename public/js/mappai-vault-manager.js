// ==========================================
// VAULT MANAGER — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa electronAPI, appState, e gli helper window.* via scope globale.
// NB: directLoadVault riassegna `tutorState` (let top-level in app.js) e chiama
// initD3Visualization() come bare identifier — entrambi risolti a runtime tramite
// lo scope lessicale globale condiviso (modulo caricato dopo app.js).
window.showVaultManager = async function () {
    const modal = document.getElementById('vault-manager-modal');
    const box = document.getElementById('vault-manager-box');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    window.safeCreateIcons();

    await window.loadVaultList();
};

window.closeVaultManager = function () {
    const modal = document.getElementById('vault-manager-modal');
    const box = document.getElementById('vault-manager-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.loadVaultList = async function () {
    const container = document.getElementById('vault-list-container');
    container.innerHTML = '<div class="flex items-center justify-center p-20 text-slate-300"><i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i></div>';
    window.safeCreateIcons();

    try {
        const vaults = await window.electronAPI.getAllVaults();
        container.innerHTML = "";

        if (!vaults || vaults.length === 0) {
            container.innerHTML = `<div class="text-center p-10 text-slate-400 font-bold uppercase tracking-widest text-xs">${window.getTranslation('empty_projects_msg')}</div>`;
            return;
        }

        vaults.forEach(v => {
            const card = document.createElement('div');
            card.className = "bg-white border border-slate-100 p-4 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer group shadow-sm flex justify-between items-center";

            let userBadge = "";
            if (v.nickname) {
                userBadge = `<span class="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">${v.nickname} (${v.age || '?'})</span>`;
            }

            card.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                        <i data-lucide="folder" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-black text-slate-800 text-sm leading-none">${v.rootNodeLabel || v.folderName}</span>
                            ${userBadge}
                        </div>
                        <span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">${v.folderName} • ${new Date(v.lastUpdated).toLocaleDateString()}</span>
                    </div>
                </div>
                <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-all"></i>
            `;

            card.onclick = () => {
                window.closeVaultManager();
                window.directLoadVault(v.fullPath);
            };
            container.appendChild(card);
        });
        window.safeCreateIcons();
    } catch (err) {
        container.innerHTML = `<div class="text-red-500 p-4 text-center text-xs">Errore nel caricamento: ${err.message}</div>`;
    }
};

window.directLoadVault = async function (folderPath) {
    // Mappa in sostituzione: chiudi un'eventuale sessione di Studio attivo
    // (ripristino snapshot) prima di caricare il vault.
    if (window.ActiveStudy && window.ActiveStudy.emergencyExit) window.ActiveStudy.emergencyExit();
    window.showLoadingOverlay(true, "Caricamento Vault...");
    try {
        const loadRes = await window.electronAPI.loadVault(folderPath);
        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = folderPath;
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            appState.rootNodeLabel = folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

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
                    folderPath: folderPath,
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
                sourcesDict: {}
            };

            if (window.MappAIJigsaw) {
                window.MappAIJigsaw.syncModeToVault(loadRes.data.branchLocks);
                window.MappAIJigsaw.applyLocks(appState.db.nodes, loadRes.data.branchLocks);
            }

            if (window.renderStudySets) window.renderStudySets();

            if (loadRes.data.userProfile) {
                appState.userProfile = loadRes.data.userProfile;
            }

            // Ripristina lo stato delle chat (o azzera: mai ereditare quelle della mappa precedente)
            window.setTutorState(loadRes.data.tutorState || null);

            // Ripristina AI Provider e Modello se presenti
            if (loadRes.data.aiProvider) {
                appState.aiProvider = loadRes.data.aiProvider;
                localStorage.setItem('ai_provider', appState.aiProvider);
                if (window.switchAIProvider) window.switchAIProvider(appState.aiProvider);
            }
            if (loadRes.data.aiModel) {
                const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
                localStorage.setItem(storageKey, loadRes.data.aiModel);
            }
            if (loadRes.data.generationUsage) {
                appState.generationUsage = loadRes.data.generationUsage;
                if (window.updateCostDisplay) window.updateCostDisplay();
            }
            // Forza il refresh dei modelli per popolare la tendina e selezionare quello corretto
            if (window.refreshGeminiModels) window.refreshGeminiModels();

            // Ricostruisci sourcesDict
            appState.db.nodes.forEach(n => {
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            if (loadRes.data.customColors) {
                appState.db.customColors = loadRes.data.customColors;
            }

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
            if (window.MappAIPipeline && window.MappAIPipeline.checkResume) window.MappAIPipeline.checkResume(folderPath);
        } else {
            window.showAlert("Errore Caricamento", loadRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore", e.message);
    }
};

window.resetVaultState = function () {
    appState.activeVaultPath = null;
    appState.activeVaultClassDir = null;   // 22/7: nesting classe del vault auto-creato
    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.classList.add('hidden');
        syncBtn.classList.remove('flex');
    }
};
