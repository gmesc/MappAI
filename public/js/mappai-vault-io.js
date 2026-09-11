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
/* ── IL VAULT DICE DI CHE COSA PARLA (Giacomo, 9/8) ────────────────────────────
   Perché: un vault si passa a un collega. Fino a oggi classe e materia vivevano
   SOLO nei nomi delle cartelle (`Mappe/<classe>/<materia>/<mappa>`) e nel progetto
   in localStorage — cioè in due posti che NON viaggiano con la cartella. Un collega
   che riceve il vault non sa di che disciplina parla, e se lo mette altrove
   l'informazione è persa del tutto.
   Ora `index.yaml` porta `classe` e `materia` come DICHIARAZIONE della mappa: la
   cartella resta la fonte di verità dove c'è (è la regola del progetto), ma quando
   la cartella non dice niente — un vault arrivato da fuori — si sa comunque di che
   materia si tratta.
   ⚠️ Non è la classe di CHI riceve: è quella di chi l'ha fatto. Chi non ha quella
   classe o quella materia nel proprio profilo vedrà la mappa come **Generico**. */
function _contestoDellaMappa() {
    var out = { classe: '', materia: '' };
    try {
        var CL = window.MappAIClasses;
        var c = CL && CL.getActive && CL.getActive();
        if (c && c.name) out.classe = c.name;
        var d = CL && CL.activeDiscipline && CL.activeDiscipline();
        if (d) out.materia = d;
        /* la generazione può aver dichiarato una disciplina sua (il modale
           classe+disciplina di `ensureGenerationContext`): quella vince, è la
           materia con cui la mappa è stata pensata */
        if (appState && appState.generationDiscipline) out.materia = appState.generationDiscipline;
    } catch (e) { }
    /* un vault RIAPERTO porta già le sue: non si sovrascrivono con il contesto di
       chi lo sta guardando — sarebbe riscrivere la storia della mappa */
    try {
        if (appState && appState.vaultClasse && !out.classe) out.classe = appState.vaultClasse;
        if (appState && appState.vaultMateria && !out.materia) out.materia = appState.vaultMateria;
    } catch (e) { }
    return out;
}

/* ── LA RETE DI SICUREZZA SI FA SENTIRE (12/9) ────────────────────────────────
   `save-vault` mette da parte una copia quando la mappa che sta per scrivere è
   molto più piccola di quella già in cartella. Una protezione silenziosa però
   non protegge: l'11 settembre il guasto è rimasto invisibile finché il docente
   non ha riaperto il progetto. Qui si dice che cosa è successo e dove sta la
   copia, con un avviso che resta a schermo più a lungo di un toast normale. */
window.avvisaIstantanea = function (res) {
    try {
        const i = res && res.istantanea;
        if (!i || !i.serve) return;
        const dove = i.dove || '.versioni';
        const msg = window.t
            ? window.t('vault_istantanea', 'Attenzione: la cartella conteneva {p} nodi e ne ho salvati {n}. Ho messo da parte una copia di prima in «{d}».')
                .replace('{p}', i.esistenti).replace('{n}', i.nuovi).replace('{d}', dove)
            : ('La cartella conteneva ' + i.esistenti + ' nodi e ne ho salvati ' + i.nuovi + '. Copia di prima in «' + dove + '».');
        console.warn('[Vault] ' + msg);
        if (window.showToast) window.showToast(msg, 'warning');
    } catch (e) { /* l'avviso è un di più: la copia c'è comunque */ }
};

/* Si ascolta una volta sola, all'avvio: da qui in poi ogni salvataggio che ha
   avuto bisogno della rete lo dice, da qualunque punto sia partito. */
try {
    if (window.electronAPI && window.electronAPI.onIstantaneaVault) {
        window.electronAPI.onIstantaneaVault(function (d) { window.avvisaIstantanea({ istantanea: d }); });
    }
} catch (e) { /* senza canale resta l'avviso dei punti espliciti */ }

window.buildVaultMapData = function () {
    var ctx = _contestoDellaMappa();
    return {
        extractionMode: appState.extractionMode,
        rootNodeLabel: appState.rootNodeLabel,
        /* DOSSIER di fonte (20/8): lo dice il grafo stesso — la radice dei
           dossier è `fonte_0` (nodiDaScheda), deterministico. Va in index.yaml
           perché le sidebar scelgono l'icona SENZA aprire il vault (inv. 7). */
        dossier: !!(appState.db.nodes && appState.db.nodes[0] && appState.db.nodes[0].id === 'fonte_0'),
        classe: ctx.classe,
        materia: ctx.materia,
        nodes: appState.db.nodes,
        links: appState.db.links,
        studySets: appState.db.studySets || [],
        /* LE CITAZIONI NEL VAULT (11/9). Viaggiano nei `chunks` dei nodi, che
           `save-vault` scrive nella sezione «## Fonti» del markdown come
           `- [titolo | pagina N]: testo` e che il caricatore ricostruisce in
           `sourcesDict`. Prima erano SEMPRE vuoti (su Gemini `schemaBranch` non
           dichiara i chunks), quindi la mappa riaperta perdeva ogni fonte; ora
           li riempie l'àncora. `sourcesDict` NON si passa qui: `save-vault`
           scrive campi scelti e lo scarterebbe — sarebbe una promessa falsa. */
        userProfile: appState.userProfile,
        tutorState: serializeTutorState(tutorState),
        aiProvider: appState.aiProvider,
        aiModel: document.getElementById('model-select')?.value || localStorage.getItem(appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model'),
        generationUsage: appState.generationUsage,
        customColors: appState.db.customColors || {},
        /* vista.json (15/8): Vista studio · focus · timeline · foglio nodi —
           le quattro cose che il vault non aveva e che restavano prigioniere
           del localStorage di UN computer. Il core decide che cosa entra;
           null = niente da scrivere (e main.js toglie un file stantio). */
        vista: window.MappAIVistaCore ? window.MappAIVistaCore.raccogli(appState) : undefined
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
            window.avvisaIstantanea(saveRes);
            appState.activeVaultPath = result.folderPath;
            /* Adottare la cartella, non solo scriverne il percorso (11/9): senza,
               `activeVaultClassDir`/`activeVaultDiscDir` restano quelli della
               mappa di prima e il progetto si registra in una posizione che non
               è la sua. Da lì un'altra mappa può rivendicare la stessa cartella
               e sovrascriverla — è successo davvero. */
            try {
                if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
                    await StorageManager.adottaVault(result.folderPath, appState);
                }
            } catch (e) { console.warn('[Vault] adozione non riuscita:', e && e.message); }
            /* il disco è cambiato: chi mostra elenchi rilegge (9/8) */
            try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-salvata', { vaultPath: result.folderPath }); } catch (e) { }

            // Fonti/: ora che il vault esiste, salva gli originali PDF delle
            // sources ancora in memoria (22/7/26 — anteprima ELABORA persistente)
            if (window.MappAIElabora && window.MappAIElabora.flushSourcesToVault) {
                window.MappAIElabora.flushSourcesToVault();
            }
            /* Sorgenti/: i fogli di domande aperte che l'archivio tiene ancora
               per questa mappa (6/9) — stessa strada di `flushSourcesToVault` */
            try {
                if (window.MappAIQuizPrint && window.MappAIQuizPrint.ripescaSorgenti) window.MappAIQuizPrint.ripescaSorgenti(result.folderPath, appState.rootNodeLabel || '');
            } catch (e) { }

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

// Auto-creazione ORDINATA della cartella vault (riordino su disco, 22/7).
// A fine generazione (e come backfill dalla sezione Insegna) crea la cartella
// vault della mappa dentro «Mappe», nominata col ROOT del progetto. Se c'è una
// CLASSE ATTIVA la annida nella cartella della classe (Mappe/<classe>/<root>),
// altrimenti flat (Mappe/<root>). Idempotente: se il progetto è già legato a un
// vault (appState.activeVaultPath), AGGIORNA quella cartella invece di crearne
// una nuova (decisione 1B: stesso progetto = update). Collisione di nome nella
// stessa classe → suffisso « · 0N » (stesso schema della pipeline 011).
// Kill-switch: localStorage 'mappai_autovault' === '0'. Ritorna
// { created, folderPath, classDir } oppure null (skip/errore, mai bloccante).
window.ensureProjectVault = async function (opts) {
    opts = opts || {};
    try {
        if (localStorage.getItem('mappai_autovault') === '0') return null;
        if (!window.electronAPI || !window.electronAPI.saveVault || !window.electronAPI.filesRootGet) return null;
        if (!appState.db.nodes || !appState.db.nodes.length) return null;
        var FC = window.MappAIFilesCore;
        if (!FC) return null;

        // (1) Progetto già legato a una cartella → aggiorna in place.
        if (appState.activeVaultPath) {
            var upd = await window.electronAPI.saveVault({ folderPath: appState.activeVaultPath, mapData: window.buildVaultMapData() });
            if (upd && upd.success && window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject();
            /* Sorgenti/: ripescaggio dei fogli di domande aperte dall'archivio (6/9), senza sovrascrivere */
            try {
                if (upd && upd.success && window.MappAIQuizPrint && window.MappAIQuizPrint.ripescaSorgenti) window.MappAIQuizPrint.ripescaSorgenti(appState.activeVaultPath, appState.rootNodeLabel || '');
            } catch (e) { }
            return { created: false, folderPath: appState.activeVaultPath, classDir: appState.activeVaultClassDir || null, discDir: appState.activeVaultDiscDir || null };
        }

        // (2) Contesto attivo → dove va la cartella. Allievo e classe si escludono
        //     a vicenda: con un allievo la mappa è sua, con una classe si annida
        //     per classe/disciplina, senza nessuno dei due va in Mappe/Generico/ (FilesCore.GENERICO, 15/8 sera).
        var cls = null, allievo = '';
        try { cls = (window.MappAIClasses && window.MappAIClasses.getActive()) || null; } catch (e) { cls = null; }
        try { allievo = (window.MappAIClasses && window.MappAIClasses.activeStudentName) ? window.MappAIClasses.activeStudentName() : ''; } catch (e) { allievo = ''; }
        var info = await window.electronAPI.filesRootGet();
        var base = info && info.mapsBaseDir;
        if (!base) return null;

        var vaultName = FC.vaultFolderName(appState.rootNodeLabel || 'Mappa');
        var classDir = (cls && cls.name) ? FC.mapClassFolder(cls.sede, cls.name) : null;
        // Disciplina scelta all'avvio della generazione (29/7) → livello di cartella
        // dentro la classe. Senza classe non c'è disciplina: la mappa va in Generico.
        var discDir = classDir ? FC.disciplineFolder(appState.generationDiscipline || '') : '';

        // (3) Collisione → suffisso « · 0N ». I fratelli sono quelli della STESSA
        // coppia (classe, disciplina): due mappe omonime in discipline diverse non
        // si contendono il nome.
        var siblings = [];
        try {
            var all = await window.electronAPI.getAllVaults();
            siblings = (all || []).filter(function (v) {
                return (v.classDir || null) === (classDir || null) && (v.discDir || '') === (discDir || '');
            }).map(function (v) { return v.folderName; });
        } catch (e) { siblings = []; }
        var finalName = vaultName;
        if (siblings.indexOf(vaultName) >= 0 && FC.sessionSeq) {
            var seq = FC.sessionSeq(siblings, vaultName, ' · ');
            var n = Math.max(2, (seq.maxSeq || 0) + 1);
            finalName = vaultName + ' · ' + String(n).padStart(2, '0');
        }

        /* Con un profilo ALLIEVO attivo la mappa è materiale suo: vive in
           «Allievi/<nome>/Mappe», non fra quelle della classe (2/8). */
        var radice = FC.mapVaultRoot
          ? FC.mapVaultRoot({ maps: base, students: info && info.studentsBaseDir }, allievo)
          : base;
        var parents = FC.mapVaultParentsFor
          ? FC.mapVaultParentsFor(allievo, classDir, discDir)
          : FC.mapVaultParents(classDir, discDir);
        var folderPath = [radice].concat(parents, [finalName]).join('/');
        var saveRes = await window.electronAPI.saveVault({ folderPath: folderPath, mapData: window.buildVaultMapData() });
        if (!saveRes || !saveRes.success) return null;

        appState.activeVaultPath = folderPath;
        appState.activeVaultClassDir = classDir;
        appState.activeVaultDiscDir = discDir || null;
        /* AUTO-VAULT a fine generazione: è il caso che Giacomo vedeva più spesso —
           la mappa appena fatta non compariva negli elenchi finché non si
           riapriva la finestra. Ora lo dice (9/8). */
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-creata', { vaultPath: folderPath }); } catch (e) { }

        // Fonti/: travasa gli originali PDF ancora in memoria (come saveMapVault).
        if (window.MappAIElabora && window.MappAIElabora.flushSourcesToVault) {
            try { window.MappAIElabora.flushSourcesToVault(); } catch (e) { }
        }
        // Base64 → path locali su disco.
        if (saveRes.upgrades) {
            saveRes.upgrades.forEach(function (up) {
                var node = appState.db.nodes.find(function (n) { return n.id === up.id; });
                if (node && up.images) { node.images = up.images; if (up.images.length > 0) node.image = up.images[0]; }
            });
        }
        var syncBtn = document.getElementById('sync-vault-btn');
        if (syncBtn) { syncBtn.classList.remove('hidden'); syncBtn.classList.add('flex'); }

        if (window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject();
        return { created: true, folderPath: folderPath, classDir: classDir, discDir: discDir || null };
    } catch (e) {
        console.warn('[autovault] ensureProjectVault fallito:', e && e.message);
        return null;
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
    try {
        const result = await window.electronAPI.pickFolder({ importOnly: true });
        if (result.canceled) return;

        window.showLoadingOverlay(true, "Caricamento Vault...");

        const loadRes = await window.electronAPI.loadVault(result.folderPath);

        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = result.folderPath;
            /* stessa adozione di directLoadVault (15/8): l'identità del
               progetto appartiene alla mappa a schermo, mai alla precedente */
            if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
                await StorageManager.adottaVault(result.folderPath, appState);
            }
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            /* la mappa PORTA la sua classe e la sua materia (9/8): un vault
               ricevuto da un collega non cambia materia perché lo apre un altro */
            appState.vaultClasse = loadRes.data.classe || '';
            appState.vaultMateria = loadRes.data.materia || '';
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

            /* Un dizionario già in `mapData` (non lo scrive `save-vault`, ma può
               arrivare da un demo o da un import) ha la precedenza; per tutto il
               resto si ricostruisce dai chunks del markdown, che dall'11/9
               portano anche la pagina. */
            const _sdSalvato = loadRes.data.sourcesDict;
            if (_sdSalvato && typeof _sdSalvato === 'object') {
                Object.keys(_sdSalvato).forEach(k => { appState.db.sourcesDict[k] = _sdSalvato[k]; });
            }
            appState.db.nodes.forEach(n => {
                if (appState.db.sourcesDict[n.id]) return;
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            /* LE FONTI TORNANO DAL VAULT (9/8). Senza questo, riaprendo una mappa
               `appState.sources` restava vuoto: ELABORA non aveva né testo né PDF
               e la sua vista della fonte diceva «Nessuna fonte nel progetto» —
               con essa restavano vuote copertura, evidenziazione, «Domande
               scheda» e i due export.
               ⚠️ NON si attende: la lettura è asincrona (IPC) e il disegno della
               mappa non deve aspettarla. Chi usa le fonti (ELABORA) apre dopo, e
               ha la sua rete: se una fonte PDF è senza testo lo estrae al volo. */
            if (window.MappAIElabora && window.MappAIElabora.ripristinaFontiDalVault) {
                window.MappAIElabora.ripristinaFontiDalVault(result.folderPath).then(function (n) {
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
