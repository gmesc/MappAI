const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    generateGemini: (data) => ipcRenderer.invoke('generate-gemini', data),
    generateInfomaniak: (data) => ipcRenderer.invoke('generate-infomaniak', data),
    generateEmbeddingsInfomaniak: (data) => ipcRenderer.invoke('generate-embeddings-infomaniak', data),
    generateEmbeddingsGoogle: (data) => ipcRenderer.invoke('generate-embeddings-google', data),
    listModels: (data) => ipcRenderer.invoke('list-models', data),
    listInfomaniakModels: (data) => ipcRenderer.invoke('list-infomaniak-models', data),
    saveMapJSON: (mapData) => ipcRenderer.invoke('save-map-json', mapData),
    savePipelineArtifact: (data) => ipcRenderer.invoke('save-pipeline-artifact', data),
    openPipelineFolder: (data) => ipcRenderer.invoke('open-pipeline-folder', data),
    openSaveFolder: () => ipcRenderer.invoke('open-save-folder'),
    // Organizzazione file (010)
    filesRootGet: () => ipcRenderer.invoke('files-root-get'),
    filesRootChoose: () => ipcRenderer.invoke('files-root-choose'),
    filesMigratePreview: () => ipcRenderer.invoke('files-migrate-preview'),
    filesSetup: (opts) => ipcRenderer.invoke('files-setup', opts),
    filesOpenRoot: () => ipcRenderer.invoke('files-open-root'),
    studySessionsList: () => ipcRenderer.invoke('study-sessions-list'),
    // Registro consumi AI
    usageLogAppend: (rec) => ipcRenderer.invoke('usage-log-append', rec),
    usageLogRead: () => ipcRenderer.invoke('usage-log-read'),
    /* Cache su disco dei clip della voce naturale: una registrazione fermata
       dalla quota giornaliera riprende domani senza ripagare i blocchi già
       letti. Sta in userData, non nel vault: è lavoro in corso. */
    ttsCacheHas: (o) => ipcRenderer.invoke('tts-cache-has', o),
    ttsCacheGet: (o) => ipcRenderer.invoke('tts-cache-get', o),
    ttsCachePut: (o) => ipcRenderer.invoke('tts-cache-put', o),
    ttsCacheClear: (o) => ipcRenderer.invoke('tts-cache-clear', o),
    usageOpenFolder: () => ipcRenderer.invoke('usage-open-folder'),
    // Registro locale degli errori (niente esce da solo: lo legge la Cabina)
    errorLogAppend: (rec) => ipcRenderer.invoke('error-log-append', rec),
    errorLogRead: (limite) => ipcRenderer.invoke('error-log-read', limite),
    errorLogClear: () => ipcRenderer.invoke('error-log-clear'),
    errorOpenFolder: () => ipcRenderer.invoke('error-open-folder'),
    // ⌘Q salva prima di uscire (15/8): il main trattiene l'uscita e chiede;
    // il renderer salva e risponde. Il tetto di 3s sta nel main.
    onSalvaPrimaDiUscire: (cb) => ipcRenderer.on('salva-prima-di-uscire', cb),
    salvataggioUscitaFatto: () => ipcRenderer.send('salvataggio-uscita-fatto'),
    studyReportOpen: (filePath) => ipcRenderer.invoke('study-report-open', filePath),
    uploadFileGemini: (data) => ipcRenderer.invoke('upload-file-gemini', data),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    parseDocx: (filePath) => ipcRenderer.invoke('parse-docx', filePath),
    pickFile: () => ipcRenderer.invoke('pick-file'),
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    saveChatTranscript: (data) => ipcRenderer.invoke('save-chat-transcript', data),
    saveQuizTextResponse: (data) => ipcRenderer.invoke('save-quiz-text-response', data),
    saveStudyRecord: (data) => ipcRenderer.invoke('save-study-record', data),
    savePDFToVault: (data) => ipcRenderer.invoke('save-pdf-to-vault', data),
    // Pipeline «Genera materiali» (011)
    htmlToPdf: (data) => ipcRenderer.invoke('html-to-pdf', data),
    saveVaultFile: (data) => ipcRenderer.invoke('save-vault-file', data),
    readVaultFile: (data) => ipcRenderer.invoke('read-vault-file', data),
    // sposta nel Cestino un file dentro un vault (materiali di INSEGNA)
    deleteVaultFile: (data) => ipcRenderer.invoke('delete-vault-file', data),
    /* Scarica una copia di un materiale chiedendo nome e posizione (dialogo di
       sistema). Torna { ok, path } · { ok, annullato:true } se l'utente rinuncia. */
    vaultFileDownload: (data) => ipcRenderer.invoke('vault-file-download', data),
    /* Apre il dialogo di stampa di sistema su un materiale del vault. Torna
       { ok } · { ok, aperto:true } se la stampa non è partita e il file è stato
       aperto nell'applicazione di sistema come ripiego. */
    vaultFilePrint: (data) => ipcRenderer.invoke('vault-file-print', data),
    vaultMaterialsList: (data) => ipcRenderer.invoke('vault-materials-list', data),
    // elenca `Fonti/`: gli originali delle fonti e i testi estratti (9/8)
    vaultSourcesList: (data) => ipcRenderer.invoke('vault-sources-list', data),
    pipelineOpenFolder: (data) => ipcRenderer.invoke('pipeline-open-folder', data),
    pipelineOpenFile: (data) => ipcRenderer.invoke('pipeline-open-file', data),
    saveVault: (data) => {
        // Propaga il flag sottocartelle-per-ramo (gated). NON sovrascrive un valore esplicito
        // (l'export JIGSAW forza branchFolders:true a prescindere dal flag utente).
        try {
            if (data && data.mapData && data.mapData.branchFolders === undefined) {
                data.mapData.branchFolders = (typeof localStorage !== 'undefined') &&
                    ['1', 'true'].includes(localStorage.getItem('mappai_vault_branch_folders'));
            }
            // Padronanza del vault (localStorage) → verrà scritta in Studio Attivo/mastery.json.
            // Chiave = 'mappai_mastery::' + activeVaultPath; sul risalvataggio dello studente coincide con folderPath.
            // PRIMO salvataggio: activeVaultPath non esisteva ancora → lo studio fatto prima
            // vive sotto la chiave-label ('mappai_mastery::' + rootNodeLabel). Fallback su quella.
            if (data && data.mapData && data.folderPath && data.mapData.masteryStore === undefined) {
                let raw = (typeof localStorage !== 'undefined') && localStorage.getItem('mappai_mastery::' + data.folderPath);
                if (!raw && (typeof localStorage !== 'undefined') && data.mapData.rootNodeLabel) {
                    raw = localStorage.getItem('mappai_mastery::' + String(data.mapData.rootNodeLabel));
                }
                if (raw) { try { data.mapData.masteryStore = JSON.parse(raw); } catch (_) {} }
            }
            // Anonimato: in modalità JIGSAW il profilo (nome/età) NON viene mai persistito nel vault.
            if (data && data.mapData &&
                (typeof localStorage !== 'undefined') && ['1', 'true'].includes(localStorage.getItem('mappai_jigsaw_mode'))) {
                data.mapData.userProfile = null;
            }
        } catch (_) {}
        return ipcRenderer.invoke('save-vault', data);
    },
    writeBranchLocks: (data) => ipcRenderer.invoke('write-branch-locks', data),
    listVaultSubfolders: (parentPath) => ipcRenderer.invoke('list-vault-subfolders', parentPath),
    readStudySessions: (vaultPath) => ipcRenderer.invoke('read-study-sessions', vaultPath),
    loadDungeonFloors: (vaultPath) => ipcRenderer.invoke('load-dungeon-floors', vaultPath),
    saveDungeonFloor: (data) => ipcRenderer.invoke('save-dungeon-floor', data),
    saveDungeonRuleset: (data) => ipcRenderer.invoke('save-dungeon-ruleset', data),
    saveDungeonMaterials: (data) => ipcRenderer.invoke('save-dungeon-materials', data),
    exportDungeonBundle: (data) => ipcRenderer.invoke('export-dungeon-bundle', data),
    // --- Knowledge Garden (sessione LAN dal PC docente) ---
    gardenStartSession: (data) => ipcRenderer.invoke('garden-start-session', data),
    gardenStopSession: () => ipcRenderer.invoke('garden-stop-session'),
    gardenSessionStatus: () => ipcRenderer.invoke('garden-session-status'),
    gardenOpenFolder: () => ipcRenderer.invoke('garden-open-folder'),
    // --- Lavagna Collaborativa (sessione LAN dal PC docente) ---
    collabStartSession: (data) => ipcRenderer.invoke('collab-start-session', data),
    collabStopSession: () => ipcRenderer.invoke('collab-stop-session'),
    collabSessionInfo: () => ipcRenderer.invoke('collab-session-info'),
    collabOpenFolder: () => ipcRenderer.invoke('collab-open-folder'),
    collabSessionsList: () => ipcRenderer.invoke('collab-sessions-list'),
    // --- Tutor AI via QR "Chatta e Scrivi" (007) ---
    tutorStartSession: (data) => ipcRenderer.invoke('tutor-start-session', data),
    tutorStopSession: () => ipcRenderer.invoke('tutor-stop-session'),
    tutorSessionInfo: () => ipcRenderer.invoke('tutor-session-info'),
    tutorOpenFolder: () => ipcRenderer.invoke('tutor-open-folder'),
    // --- MappAI Live (Studio attivo via QR + Materiali + Classi) ---
    liveStartSession: (data) => ipcRenderer.invoke('live-start-session', data),
    liveStopSession: () => ipcRenderer.invoke('live-stop-session'),
    liveSessionInfo: () => ipcRenderer.invoke('live-session-info'),
    liveOpenFolder: () => ipcRenderer.invoke('live-open-folder'),
    liveMaterialsStart: (data) => ipcRenderer.invoke('live-materials-start', data),
    liveMaterialsStop: () => ipcRenderer.invoke('live-materials-stop'),
    liveMaterialsInfo: () => ipcRenderer.invoke('live-materials-info'),
    liveMaterialsAdd: () => ipcRenderer.invoke('live-materials-add'),
    liveMaterialsAddHtml: (data) => ipcRenderer.invoke('live-materials-add-html', data),
    // Sezione Progetti/Attività Insegna (19/7): apri cartelle, zip vault → QR.
    openVaultFolder: (data) => ipcRenderer.invoke('open-vault-folder', data),
    zipVaultToMaterials: (data) => ipcRenderer.invoke('zip-vault-to-materials', data),
    openMapsFolder: () => ipcRenderer.invoke('open-save-folder'),
    studySessionOpenFolder: (data) => ipcRenderer.invoke('study-session-open-folder', data),
    liveClassesLoad: () => ipcRenderer.invoke('live-classes-load'),
    liveClassesSave: (data) => ipcRenderer.invoke('live-classes-save', data),
    // documento nella cartella di una classe o di un allievo (foglio credenziali)
    classDocSave: (data) => ipcRenderer.invoke('class-doc-save', data),
    classDocOpen: (data) => ipcRenderer.invoke('class-doc-open', data),
    studentFolderEnsure: (data) => ipcRenderer.invoke('student-folder-ensure', data),
    launcherChoice: (choice) => ipcRenderer.invoke('launcher-choice', choice),
    launcherReturn: () => ipcRenderer.invoke('launcher-return'),
    loadVault: (folderPath) => ipcRenderer.invoke('load-vault', folderPath),
    pickFolder: () => ipcRenderer.invoke('pick-folder'),
    fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),
    getAllVaults: () => ipcRenderer.invoke('get-all-vaults'),
    deleteVault: (data) => ipcRenderer.invoke('delete-vault', data),
    vaultRelocate: (data) => ipcRenderer.invoke('vault-relocate', data),
    getValidVaultFolders: () => ipcRenderer.invoke('get-valid-vault-folders'),
    loadPrompts: () => ipcRenderer.invoke('load-prompts'),
    savePrompts: (data) => ipcRenderer.invoke('save-prompts', data),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    capturePage: () => ipcRenderer.invoke('capture-page'),
    // --- VISIONE: preparare un'immagine (la lettura passa da fetchModelAPI) ---
    immaginePrepara: (data) => ipcRenderer.invoke('immagine-prepara', data)
});
