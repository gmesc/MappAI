// ==========================================
// VAULT MANAGER — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa electronAPI, appState, e gli helper window.* via scope globale.
// NB: directLoadVault riassegna `tutorState` (let top-level in app.js) e chiama
// initD3Visualization() come bare identifier — entrambi risolti a runtime tramite
// lo scope lessicale globale condiviso (modulo caricato dopo app.js).
// 12/10/2026 (0087, lotto 10-modali): il modale «Esplora vault» (#vault-manager-modal,
// showVaultManager/loadVaultList) è USCITO — nessuno lo apriva dal 3/8 (ELABORA «Progetti
// esistenti» e INSEGNA leggono il disco). Restano directLoadVault e resetVaultState.

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
    window.showLoadingOverlay(true, "Caricamento Vault...");
    try {
        const loadRes = await window.electronAPI.loadVault(folderPath);
        window.showLoadingOverlay(false);
        if (loadRes.success) {
            if (loadRes.data && loadRes.data.extractionMode === 'lettura') {
                const reading = window.MappAIPercorsoLettura;
                if (!reading || typeof reading.openVault !== 'function') throw new Error(window.t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'));
                return await reading.openVault({ folderPath: folderPath, data: loadRes.data });
            }
            if (window.MappAIStudioView && appState.layoutMode === 'studio') {
                window.MappAIStudioView.exit();
                appState.layoutMode = 'default';
            }
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
            /* 0061 (29/09, ADR 0013): gesto `apri` — vince l'id scritto nella cartella;
               senza id, per nome come prima, ma non la voce che un'altra cartella dichiara
               già; una cartella vuota e senza id è una creazione. È la strada di INSEGNA,
               delle console, degli elenchi, del ripiego di `loadProject` e del
               ricongiungimento per id (D7). `loadRes` c'è già: nessuna attesa in più. */
            if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
                await StorageManager.adottaVault(folderPath, appState, { gesto: 'apri', idCartella: loadRes.data.projectId,
                    vuota: !(loadRes.data.nodes || []).length && !loadRes.data._pipelineManifest });
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

            /* 0078 (§4.2, interruttore `mappai_cartella_completa`): lo stato di
               generazione della mappa di PRIMA — disciplina, «tarata», pagine
               del PDF, rapporti, guida semantica, bozze della revisione,
               consumi — non passa a questa. Si azzera PRIMA di leggere ciò che
               la cartella porta (la vista, i consumi, la revisione), così
               quello vince. La lista è del core, una sola: `semanticGuidance`
               è fra i suoi campi. Spento o senza core: come prima. */
            if (window.MappAIVistaCore && window.MappAIVistaCore.cartellaCompleta && window.MappAIVistaCore.cartellaCompleta()) {
                window.MappAIVistaCore.azzeraGenerazione(appState);
                /* il layout torna quello di base: il bottone deve dirlo, o
                   mostrerebbe ancora il layout della mappa di prima */
                if (window.updateLayoutButtonLabel) { try { window.updateLayoutButtonLabel(); } catch (e) { } }
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
               altri contesti; qui ciò che manca è di un'altra mappa.
               0078: con l'interruttore acceso la vista porta anche la Catena dei
               perché rivista, le copie dei documenti e i nodi fissati: si
               applica DOPO che i nodi della cartella sono in `db` (qui sopra),
               perché marca solo i nodi che ci sono. */
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
    /* 0061 (29/09, D1; ADR 0013): l'identità nasce quando la generazione comincia
       (inv. 20-bis: ciò che dura dichiara a che cosa appartiene quando comincia). Senza,
       con una mappa aperta l'autosave del rendering scriveva la mappa nuova nella voce
       della precedente, e la cartella nuova ne avrebbe tenuto l'id. Si CONIA invece di
       azzerare: autosave, consumi e cartella partono con lo stesso id, e la regola
       `nuova` lo tiene. La chiamano le estrazioni, e ora «Importa JSON» e le mappe
       dimostrative (D6). `typeof` (inv. 3). */
    if (typeof StorageManager !== 'undefined') {
        StorageManager.currentProjectId = 'proj_' + Date.now();
        StorageManager.idInCartella = null;
    }
    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.classList.add('hidden');
        syncBtn.classList.remove('flex');
    }
};
