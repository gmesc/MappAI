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
    /* ⚠️ Non si cambia mappa mentre la pipeline lavora (13/8): i suoi passi
       leggono `appState` mentre scrivono in una cartella fissata all'inizio —
       caricarne un'altra farebbe finire i materiali della mappa nuova nel vault
       della vecchia, in silenzio. Il velo copre la sola area di CREA apposta,
       per lasciar GIRARE per l'app: guardare sì, sostituire no. */
    if (window.mappaiOccupato && window.mappaiOccupato()) return ;
    /* 20/8: qui c'era la chiusura d'emergenza dello Studio attivo — una modalità
       poteva aver smontato il grafo, e salvare o sostituire la mappa in quello
       stato rendeva la gerarchia irrecuperabile. Le attività di oggi sono
       MODALI: non toccano il canvas, quindi non c'è più niente da ripristinare. */
    // Vista studio (1/8): smonta l'overlay e riporta il ciclo al default —
    // senza, cambiando mappa o tornando alla home l'overlay resterebbe orfano
    // sopra il canvas nuovo e layoutMode 'studio' verrebbe persistito.
    if (window.MappAIStudioView && appState.layoutMode === 'studio') {
        window.MappAIStudioView.exit();
        appState.layoutMode = 'default';
    }
    window.showLoadingOverlay(true, "Caricamento Vault...");
    try {
        const loadRes = await window.electronAPI.loadVault(folderPath);
        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState._reviewRestoring = true;
            delete appState._reviewRestoreError;
            delete appState._reviewCommit;
            delete appState._reviewRevision;
            appState._pipelineManifest = loadRes.data._pipelineManifest || null;
            appState.activeVaultPath = folderPath;
            /* Aprire dal disco DICHIARA CHI È (15/8): senza, l'identità restava
               quella della mappa precedente e il prossimo salvataggio scriveva
               questa mappa nella scheda di un'altra (46 copie accumulate, una
               voce col vault sbagliato — misurato sui dati veri). Allinea anche
               classDir/discDir, che erano il residuo della mappa di prima. */
            if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
                await StorageManager.adottaVault(folderPath, appState);
            }
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            /* la mappa PORTA la sua classe e la sua materia (9/8): si tengono da
               parte così un salvataggio successivo non le riscrive col contesto di
               chi la sta guardando — un vault ricevuto da un collega non cambia
               materia solo perché lo apre un altro docente. */
            appState.vaultClasse = loadRes.data.classe || '';
            appState.vaultMateria = loadRes.data.materia || '';
            /* 🐛 Il TITOLO viene dal vault, non dal nome della cartella (9/8).
               Prima si prendeva sempre il basename: per un vault ricevuto da un
               collega — che può stare in una cartella chiamata come gli pare —
               la mappa perdeva il suo nome («Dal collega - Vulcani» invece di
               «Vulcani del Ticino»). Il nome della cartella resta il ripiego per
               i vault che non dichiarano nulla. */
            appState.rootNodeLabel = loadRes.data.rootNodeLabel
                || folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

            let nodesList = loadRes.data.nodes || [];
            let linksList = loadRes.data.links || [];

            const rootNode = nodesList.find(n => n.level === 0);
            if (rootNode && !loadRes.data._pipelineManifest?.review) {
                rootNode.label = appState.rootNodeLabel;
            }
            if (nodesList.length === 0) {
                if (loadRes.data._pipelineManifest?.review) throw new Error('Mappa revisionata senza nodi: ripristino interrotto');
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
                sourcesDict: loadRes.data.sourcesDict || {}
            };

            /* vista.json (15/8): Vista studio · focus · timeline · foglio nodi
               tornano dalla cartella. PRIMA di questo vivevano solo nello
               snapshot in localStorage: stesso vault su un altro computer =
               quattro cose sparite in silenzio.
               ⚠️ L'ordine conta: PRIMA si azzera tutto (i residui della mappa
               PRECEDENTE non devono sopravvivere al cambio — stessa regola del
               tutorState qui sotto), POI si applica la vista se c'è. La regola
               di fusione di `applica` («non azzerare ciò che manca») serve ad
               altri contesti; qui ciò che manca è di un'altra mappa. */
            appState.studioProfile = undefined;
            appState.focusTopic = '';
            appState.db.timelineEvents = [];
            appState.db.timelineAI = [];
            appState.db.nodeSheet = undefined;
            if (window.MappAIVistaCore && loadRes.data.vista) {
                var _vApplicati = window.MappAIVistaCore.applica(appState, loadRes.data.vista);
                if (_vApplicati.length) console.log('[Vault] vista.json applicata:', _vApplicati.join(', '));
            }

            if (window.MappAIJigsaw) {
                window.MappAIJigsaw.syncModeToVault(loadRes.data.branchLocks);
                window.MappAIJigsaw.applyLocks(appState.db.nodes, loadRes.data.branchLocks);
            }

            if (loadRes.data.userProfile) {
                appState.userProfile = loadRes.data.userProfile;
            }

            // Ripristina lo stato delle chat (o azzera: mai ereditare quelle della mappa precedente)
            window.setTutorState(loadRes.data.tutorState || null);

            // Ripristina AI Provider e Modello se presenti
            const profiloAttivo = window.MappAIModelli && window.MappAIModelli.acceso();
            if (loadRes.data.aiProvider && !profiloAttivo) {
                appState.aiProvider = loadRes.data.aiProvider;
                localStorage.setItem('ai_provider', appState.aiProvider);
                if (window.switchAIProvider) window.switchAIProvider(appState.aiProvider);
            }
            if (loadRes.data.aiModel && !profiloAttivo) {
                const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
                localStorage.setItem(storageKey, loadRes.data.aiModel);
            }
            if (loadRes.data.generationUsage) {
                appState.generationUsage = loadRes.data.generationUsage;
                if (window.updateCostDisplay) window.updateCostDisplay();
            }
            if (profiloAttivo) {
                // La provenienza della mappa viaggia separata dal Setup del prossimo giro.
                appState.generationUsage = Object.assign({}, loadRes.data.generationUsage || {}, {
                    provenienzaMappa: { provider: loadRes.data.aiProvider || loadRes.data.generationUsage?.usedProvider || '',
                        model: loadRes.data.generationUsage?.usedModel || loadRes.data.aiModel || '' }
                });
            }
            // Forza il refresh dei modelli per popolare la tendina e selezionare quello corretto
            if (window.refreshGeminiModels) window.refreshGeminiModels();

            // Ricostruisci sourcesDict
            appState.db.nodes.forEach(n => {
                if (loadRes.data.sourcesDict) return;
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => Object.assign({}, typeof c === 'object' ? c : {}, {
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            if (loadRes.data.customColors) {
                appState.db.customColors = loadRes.data.customColors;
            }
            if (window.MappAIReview && window.MappAIReview.restore) {
                await window.MappAIReview.restore(folderPath, loadRes.data._pipelineManifest || null, { fromCache: false });
            } else if (loadRes.data._pipelineManifest?.review) throw new Error('Revisione non disponibile: caricamento interrotto');
            appState._reviewRestoring = false;
            if (window.renderStudySets) window.renderStudySets();

            /* LE FONTI TORNANO DAL VAULT (9/8) — questa è la strada delle mappe
               aperte da INSEGNA e dalla briciola dei progetti (`directLoadVault`),
               cioè la più battuta: senza il ripristino, ELABORA su una mappa
               riaperta era un guscio. Non si attende (IPC asincrono, il disegno
               della mappa non deve aspettare). */
            if (window.MappAIElabora && window.MappAIElabora.ripristinaFontiDalVault) {
                window.MappAIElabora.ripristinaFontiDalVault(folderPath).then(function (n) {
                    if (n) console.log('[Vault] fonti ripristinate dal disco: ' + n);
                }).catch(function () { });
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
        if (appState._reviewRestoring) { appState._reviewRestoring = false; appState._reviewRestoreError = e.message; }
        window.showLoadingOverlay(false);
        window.showAlert("Errore", e.message);
    }
};

window.resetVaultState = function () {
    appState._pipelineManifest = null;
    delete appState._reviewRevision;
    delete appState._reviewCommit;
    delete appState._reviewRestoring;
    delete appState._reviewRestoreError;
    appState.activeVaultPath = null;
    appState.activeVaultClassDir = null;   // 22/7: nesting classe del vault auto-creato
    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.classList.add('hidden');
        syncBtn.classList.remove('flex');
    }
};
