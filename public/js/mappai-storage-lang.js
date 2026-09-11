// ==========================================
// STORAGE MANAGER, PROGETTI SALVATI & LINGUA — estratto da app.js
// ==========================================
// const StorageManager (autosave localStorage + saveMapJSON via Electron),
// barra progetti salvati, loadSavedProject, changeLanguage + init lingua
// (DOMContentLoaded). Timer/listener registrati al load: comportamento identico
// (gli script sincroni girano tutti prima di DOMContentLoaded/timers).
// ==========================================
// STORAGE MANAGER
// ==========================================
const StorageManager = {
    currentProjectId: null,

    /* ── adottaVault (15/8) ──────────────────────────────────────────────────
       Aprire una mappa dal disco DICHIARA CHI È. Prima nessuno toccava
       `currentProjectId`: l'identità restava quella della mappa precedente e
       il salvataggio successivo scriveva la mappa nuova nella scheda della
       vecchia — misurato sull'app viva (`stessoId: true` dopo directLoadVault)
       e nei dati (46 copie di una mappa, una voce col vault di un'altra).
       Cerca la voce che corrisponde alla POSIZIONE su disco (core puro,
       confronti in NFC — trappola §8.25) e la adotta; se non c'è ne conia una
       nuova SUBITO, così nemmeno un salvataggio parte con l'identità altrui.
       Allinea anche classDir/discDir di appState: erano il residuo della mappa
       precedente, e l'autosave li congelava nella voce sbagliata. */
    adottaVault: async function (folderPath, stato) {
        const st = stato || (typeof appState !== 'undefined' ? appState : window.appState);
        try {
            let classDir = null, discDir = null, vault = String(folderPath).split(/[\\/]/).filter(Boolean).pop();
            try {
                const info = (window.electronAPI && window.electronAPI.filesRootGet)
                    ? await window.electronAPI.filesRootGet() : null;
                const basi = [info && info.mapsBaseDir, info && info.studentsBaseDir].filter(Boolean);
                for (const b of basi) {
                    const pref = String(b).replace(/\/+$/, '') + '/';
                    if (String(folderPath).indexOf(pref) !== 0) continue;
                    const segs = String(folderPath).slice(pref.length).split('/').filter(Boolean);
                    // [vault] · [classe, vault] · [classe, materia, vault] ·
                    // (base allievi) [nome, 'Mappe', vault] → posizione flat.
                    // «Generico» (15/8 sera) è il contenitore dei vault senza
                    // classe: nome riservato, si RITRADUCE in classDir null o
                    // l'identità del progetto generico non verrebbe adottata.
                    const FC = window.MappAIFilesCore;
                    const ritraduci = (n) => (FC && FC.classDirDaCartella) ? FC.classDirDaCartella(n) : (n || null);
                    if (segs.length === 2 && b === info.mapsBaseDir) classDir = ritraduci(segs[0]);
                    if (segs.length === 3 && b === info.mapsBaseDir) { classDir = ritraduci(segs[0]); discDir = segs[1]; }
                    vault = segs[segs.length - 1];
                    break;
                }
            } catch (e) { /* fuori dalle basi (vault scelto a mano): si va di solo nome */ }

            if (st) { st.activeVaultClassDir = classDir; st.activeVaultDiscDir = discDir; }

            const TC = window.MappAITeachCore;
            const projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            const hit = (TC && TC.progettoDelVault)
                ? TC.progettoDelVault(projects, { vault: vault, classDir: classDir, discDir: discDir })
                : null;
            this.currentProjectId = hit ? hit.id : ('proj_' + Date.now());
            return this.currentProjectId;
        } catch (e) {
            // mai lasciare l'identità della mappa precedente: meglio una scheda
            // nuova che una scheda scambiata
            this.currentProjectId = 'proj_' + Date.now();
            return this.currentProjectId;
        }
    },

    saveCurrentProject: function () {
        // GUARDIA Studio attivo: durante una sessione la mappa sul canvas è
        // (20/8: qui si saltava il salvataggio mentre una modalità di Studio
        // attivo teneva il grafo smontato. Quelle modalità sono in pensione e
        // le attività di oggi non toccano il canvas: si salva sempre.)
        if (!appState || !appState.db || !appState.db.nodes || appState.db.nodes.length === 0) return;

        if (!this.currentProjectId) {
            this.currentProjectId = 'proj_' + Date.now();
        }

        /* ⚠️ RETE (15/8): l'identità deve appartenere alla mappa A SCHERMO.
           `adottaVault` la riallinea a ogni apertura dal disco, ma se una
           strada nuova dimenticasse di chiamarla, qui si scriverebbe la mappa
           nuova nella scheda della VECCHIA — è il difetto che ha prodotto una
           voce «2.1 PROJECT E» puntata su un altro vault, e 46 copie di una
           stessa mappa. Se la voce esistente dichiara un vault DIVERSO da
           quello attivo, l'identità si stacca e se ne conia una nuova. */
        try {
            const attivo = appState.activeVaultPath
                ? String(appState.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() : null;
            const nfc = s => { try { return String(s || '').normalize('NFC'); } catch (e) { return String(s || ''); } };
            const prevStr = localStorage.getItem('tutor_ai_projects');
            const prev = (prevStr ? JSON.parse(prevStr) : []).find(p => p.id === this.currentProjectId);
            if (attivo && prev && prev.vault && nfc(prev.vault) !== nfc(attivo)) {
                this.currentProjectId = 'proj_' + Date.now();
            }
        } catch (e) { /* best-effort: peggio bloccare un salvataggio che coniare un id */ }

        const projectsStr = localStorage.getItem('tutor_ai_projects');
        let projects = projectsStr ? JSON.parse(projectsStr) : [];

        // Update or add
        const idx = projects.findIndex(p => p.id === this.currentProjectId);
        const existing = idx >= 0 ? projects[idx] : null;
        // Classe attiva al momento della CREAZIONE (congelata al primo salvataggio;
        // progetti legacy senza campo restano null — mai retro-etichettati)
        let activeClsName = null, activeClsId = null;
        try {
            // L'ID classe attivo è in localStorage (sincrono, SEMPRE disponibile);
            // il NOME vive nella lista classi caricata via IPC (async) → se il primo
            // autosave parte prima del caricamento, getActive() → null e la classe
            // resterebbe congelata a null. Congelando anche clsId il nome si risolve
            // a render (renderProjects/renderElaboraProjects) quando lo store è pronto.
            if (window.MappAIClasses) {
                if (window.MappAIClasses.activeId) activeClsId = window.MappAIClasses.activeId() || null;
                const ac = window.MappAIClasses.getActive && window.MappAIClasses.getActive();
                if (ac && ac.name) activeClsName = ac.name;
            }
        } catch (e) { /* store classi non disponibile */ }
        const pMeta = {
            id: this.currentProjectId,
            name: appState.rootNodeLabel || "Mappa Senza Nome",
            date: Date.now(),                                          // ultima modifica
            created: (existing && (existing.created || existing.date)) || Date.now(), // creazione
            cls: existing ? (existing.cls || null) : activeClsName,
            // ID classe congelato alla creazione (per risolvere il nome a render
            // anche se lo store classi non era ancora caricato al primo salvataggio)
            clsId: existing ? (existing.clsId || activeClsId) : activeClsId,
            // Grade del grafo (005-landing-insegna): PRESERVATO dall'esistente —
            // senza questo ogni autosave lo cancellerebbe (assegnazione in Costruisci
            // o eredità dal chip in Insegna).
            grade: existing ? (existing.grade || null) : null,
            // Bollino taratura (19/7): true = mappa generata con la taratura livello
            // attiva. Riflette lo snapshot corrente (appState.generationTuned, salvato
            // e ripristinato al load); progetti legacy senza flag → false (grigio).
            tuned: (typeof appState.generationTuned === 'boolean')
                ? appState.generationTuned
                : (existing ? !!existing.tuned : false),
            nodesCount: appState.db.nodes.length,
            type: appState.extractionMode || 'mindmap',
            // Nome della cartella vault collegata (null = progetto solo-localStorage):
            // usato da renderRecentProjects per nascondere i progetti il cui vault è stato eliminato
            vault: appState.activeVaultPath
                ? (String(appState.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() || null)
                : null,
            // Contenitore di classe che annida il vault (22/7, auto-vault): serve a
            // disambiguare il match col disco (get-all-vaults ritorna folderName +
            // classDir). null = progetto senza classe (vault piatto storico o in Mappe/Generico/).
            classDir: appState.activeVaultClassDir
                || (existing ? existing.classDir : null)
                || null,
            // Disciplina della generazione (29/7): nome leggibile per le tabelle
            // (colonna DISCIPLINA) + cartella che annida il vault dentro la classe.
            // Congelata come cls/clsId: una mappa non cambia disciplina da sola.
            disc: existing ? (existing.disc || appState.generationDiscipline || null) : (appState.generationDiscipline || null),
            discDir: appState.activeVaultDiscDir
                || (existing ? existing.discDir : null)
                || null
        };

        if (idx >= 0) projects[idx] = pMeta;
        else projects.push(pMeta);

        // Sort by desc date
        projects.sort((a, b) => b.date - a.date);

        /* ── Scrittura a prova di quota (15/8) ──────────────────────────────
           Prima erano due `setItem` nudi: a localStorage pieno il primo
           passava e il secondo lanciava — una voce in elenco che promette uno
           snapshot che non c'è. Misurato sul profilo vero: 45,8 MB occupati su
           ~48, margine 4 MB ≈ 8-15 salvataggi.
           Ordine rovesciato (PRIMA lo snapshot, poi l'indice): se lo snapshot
           non entra, l'indice resta quello di prima e tutto è ancora coerente
           — è la regola sorgente→resa dell'invariante 18, applicata qui.
           A quota piena si libera lo spazio dei DOPPIONI (le copie non più
           recenti della stessa mappa: nessuna schermata sa aprirle, chi apre
           passa dal match che prende sempre l'ultima) e si riprova. Niente
           domande in mezzo al lavoro: si fa, e lo si DICE col toast. */
        const _scrivi = () => {
            /* SNELLO (15/8): dopo il disegno D3 ogni arco porta dentro l'intero
               nodo di partenza e di arrivo — misurato su un foglio vero: 120 KB
               di link per 8,8 KB di dati. I link tornano coppie di id (il
               caricamento li accetta già così: è la forma dei vault). */
            const daScrivere = (window.MappAIVistaCore && window.MappAIVistaCore.statoSnello)
                ? window.MappAIVistaCore.statoSnello(appState) : appState;
            localStorage.setItem(this.currentProjectId, JSON.stringify(daScrivere));
            localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        };
        try {
            _scrivi();
            /* Il cassetto si guarda DOPO un salvataggio riuscito: è il momento
               in cui è appena cresciuto, ed è l'unico posto attraversato da
               tutti. Il controllo si autolimita (una misura al minuto) e
               scrive nel registro solo quando la saturazione PEGGIORA, così un
               beta tester che si avvicina al muro lascia una traccia PRIMA di
               sbatterci — quando c'è ancora tempo per potare. */
            if (window.MappAIErrori && window.MappAIErrori.controllaCassetto) {
                try { window.MappAIErrori.controllaCassetto('salvataggio'); } catch (x) { }
            }
        }
        catch (e) {
            let potate = 0;
            try {
                const TC = window.MappAITeachCore;
                const via = (TC && TC.vociDaPotare) ? TC.vociDaPotare(projects, 1, this.currentProjectId) : [];
                const viaSet = {};
                via.forEach(id => { viaSet[id] = 1; try { localStorage.removeItem(id); } catch (x) { } });
                projects = projects.filter(p => !viaSet[p.id]);
                potate = via.length;
                _scrivi();
                if (potate && window.showToast) {
                    /* il conteggio NON entra nella chiave i18n (la traduzione è
                       statica): va in coda, uguale nelle due lingue */
                    window.showToast(window.t('tst_quota_potata',
                        'Spazio quasi esaurito: liberate copie vecchie dei progetti (le mappe su disco non sono toccate).')
                        + ' (' + potate + ')', 'info');
                }
                console.log('[Storage] quota piena: potate ' + potate + ' voci doppie, salvataggio riuscito al secondo giro');
                /* Andata bene, ma il muro c'è stato: nel registro ci va comunque.
                   È il segnale che su quel computer il cassetto è al limite —
                   senza, l'unica traccia sarebbe un toast già scomparso. */
                if (window.MappAIErrori) {
                    try {
                        window.MappAIErrori.registra({
                            dove: 'cassetto',
                            messaggio: 'Spazio locale ESAURITO durante un salvataggio: liberate ' + potate +
                                ' copie doppie, il salvataggio è poi riuscito. (' + (e && e.name || 'QuotaExceededError') + ')'
                        });
                        window.MappAIErrori.controllaCassetto('dopo la potatura', true);
                    } catch (x) { }
                }
            } catch (e2) {
                /* nemmeno potando ci sta: si dice FORTE — un salvataggio perso
                   in silenzio è il guasto peggiore di questo file. Il vault su
                   disco resta la rete (l'autosave JSON qui sotto è già partito
                   nelle chiamate precedenti). */
                console.error('[Storage] salvataggio non riuscito, quota piena:', e2 && e2.message);
                /* Il guasto peggiore di questo file, e finora lasciava traccia
                   SOLO in console: un tester non la apre, e la segnalazione
                   sarebbe arrivata come «non mi salva più». Ora è una riga del
                   registro, quindi viaggia da sola nella segnalazione. */
                if (window.MappAIErrori) {
                    try {
                        window.MappAIErrori.registra({
                            dove: 'cassetto',
                            messaggio: 'SALVATAGGIO PERSO: spazio locale esaurito e nemmeno potando le copie ci sta. ' +
                                'Il vault su disco resta intatto. (' + (e2 && e2.message || '') + ')'
                        });
                        window.MappAIErrori.controllaCassetto('salvataggio perso', true);
                    } catch (x) { }
                }
                if (window.showToast) window.showToast(window.t('tst_quota_piena',
                    'Spazio locale esaurito: il progetto NON è stato salvato. La mappa su disco (vault) resta intatta.'), 'error');
                return;
            }
        }

        // Indice leggero Quiz & flashcard (005): rigenera le voci di QUESTO
        // progetto da appState.db.studySets (in memoria) — mai riparsando snapshot.
        // La guardia Studio-attivo in testa a saveCurrentProject copre anche questo.
        try {
            if (window.MappAITeachCore && window.MappAITeachCore.buildSetsIndex) {
                const prevIdx = JSON.parse(localStorage.getItem('mappai_studysets_index') || '[]');
                const nextIdx = window.MappAITeachCore.buildSetsIndex(
                    prevIdx, this.currentProjectId, pMeta.name, pMeta.cls,
                    (appState.db && appState.db.studySets) || []
                );
                localStorage.setItem('mappai_studysets_index', JSON.stringify(nextIdx));
            }
        } catch (e) { /* indice best-effort: non bloccare il salvataggio */ }

        // Salva automaticamente la Mappa come .JSON tramite Electron.
        // NON passare appState raw: dopo la simulazione D3 i nodi contengono
        // riferimenti circolari non serializzabili (Structured Clone crash).
        // Passiamo solo i campi che saveMapJSON usa effettivamente.
        if (window.electronAPI) {
            try {
                window.electronAPI.saveMapJSON({
                    extractionMode: appState.extractionMode,
                    rootNodeLabel: appState.rootNodeLabel,
                    nodes: (appState.db.nodes || []).map(n => ({
                        id: n.id, label: n.label, level: n.level,
                        group: n.group, content: n.content, desc: n.desc
                    })),
                    links: (appState.db.links || []).map(l => ({
                        source: typeof l.source === 'object' ? l.source.id : l.source,
                        target: typeof l.target === 'object' ? l.target.id : l.target,
                        rel: l.rel || '', isCross: !!l.isCross
                    }))
                });
            } catch (e) {
                console.warn('[MappAI] saveMapJSON fallito:', e.message);
            }
        }
    },

    loadProject: function (id) {
    /* ⚠️ Non si cambia mappa mentre la pipeline lavora (13/8): i suoi passi
       leggono `appState` mentre scrivono in una cartella fissata all'inizio —
       caricarne un'altra farebbe finire i materiali della mappa nuova nel vault
       della vecchia, in silenzio. Il velo copre la sola area di CREA apposta,
       per lasciar GIRARE per l'app: guardare sì, sostituire no. */
    if (window.mappaiOccupato && window.mappaiOccupato()) return false;
        try {
            const data = localStorage.getItem(id);
            /* Senza snapshot ma con un VAULT, la mappa non è persa: si apre
               dalla cartella (15/8). È il ripiego che rende innocua una futura
               pulizia del cassetto — e già oggi una voce può restare senza
               foglio (quota piena, pulizia a mano di localStorage). */
            if (!data) {
                try {
                    const p = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || [])
                        .find(x => x && x.id === id);
                    if (p && p.vault && window.electronAPI && window.electronAPI.filesRootGet && window.directLoadVault) {
                        /* La POSIZIONE la dice il disco (get-all-vaults), non si
                           ricostruisce a mano: dal 15/8 sera un vault senza classe
                           può stare in Mappe/Generico/ oppure piatto (preesistente),
                           e solo l'elenco sa quale dei due. Ripiego: il nesting di
                           FilesCore, se l'elenco non è disponibile. */
                        /* NFC sui due lati: il nome viene dal DISCO (scomposto)
                           e p.vault dalla memoria (composto) — guida §8.25 */
                        const _n = (x) => (window.MappAITeachCore && window.MappAITeachCore.nfc)
                            ? window.MappAITeachCore.nfc(x) : String(x == null ? '' : x);
                        const stessaPos = (v) => v && _n(v.folderName) === _n(p.vault)
                            && _n(v.classDir || '') === _n(p.classDir || '')
                            && _n(v.discDir || '') === _n(p.discDir || '') && !v.studentDir;
                        const daElenco = window.electronAPI.getAllVaults
                            ? window.electronAPI.getAllVaults().then(all => (all || []).find(stessaPos)).catch(() => null)
                            : Promise.resolve(null);
                        Promise.all([daElenco, window.electronAPI.filesRootGet()]).then(([hit, info]) => {
                            if (hit && hit.fullPath) { window.directLoadVault(hit.fullPath); return; }
                            if (!info || !info.mapsBaseDir) return;
                            const FC = window.MappAIFilesCore;
                            const parents = (FC && FC.mapVaultParents) ? FC.mapVaultParents(p.classDir || '', p.discDir || '') : [];
                            window.directLoadVault([info.mapsBaseDir].concat(parents, [p.vault]).join('/'));
                        });
                        return true;   // il caricamento prosegue per la via del disco
                    }
                } catch (e) { /* niente ripiego possibile */ }
                return false;
            }

            // Vista studio (1/8): stessa guardia di backToLanding/importGraph/
            // loadMapVault/directLoadVault — senza, l'overlay resterebbe attivo
            // (S.active true, tab visibile) su un canvas ricostruito da zero e
            // il primo tocco del pannello lancerebbe un TypeError.
            if (window.MappAIStudioView && appState.layoutMode === 'studio') {
                window.MappAIStudioView.exit();
                appState.layoutMode = 'default';
            }

            const loadedState = JSON.parse(data);
            if (!loadedState) return false;

            // Robust initialization: ensure db and core structures exist
            if (!loadedState.db) loadedState.db = { nodes: [], links: [] };
            if (!loadedState.db.nodes) loadedState.db.nodes = [];
            if (!loadedState.db.links) loadedState.db.links = [];
            if (!loadedState.db.sourcesDict) loadedState.db.sourcesDict = {};
            if (!loadedState.db.customColors) loadedState.db.customColors = {};
            // Timeline Live (008): pool AI + date manuali — progetti legacy → vuoti (FR-063)
            if (!Array.isArray(loadedState.db.timelineEvents)) loadedState.db.timelineEvents = [];
            if (!Array.isArray(loadedState.db.timelineAI)) loadedState.db.timelineAI = [];
            if (!loadedState.extractionMode) loadedState.extractionMode = 'mindmap';

            // Uno snapshot salvato CON la vista studio attiva porta
            // layoutMode='studio': al load l'overlay non esiste, quindi il
            // ciclo ripartirebbe desincronizzato. Si normalizza al default.
            if (loadedState.layoutMode === 'studio') loadedState.layoutMode = 'default';

            // Overwrite global appState
            appState = loadedState;

            // Normalize links: D3 stores source/target as objects after simulation
            // After JSON deserialization they become plain objects, not node refs
            if (appState.db.links) {
                appState.db.links.forEach(l => {
                    if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id || l.source;
                    if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id || l.target;
                });
            }
            if (appState.db.nodes) {
                appState.db.nodes.forEach(n => {
                    delete n.vx; delete n.vy;
                });
            }

            // Reset simulation so D3 creates a fresh one with correct node references
            simulation = null;
            this.currentProjectId = id;

            // Ripristina posizioni salvate
            if (appState.db.nodes) {
                appState.db.nodes.forEach(n => {
                    if (n.pinned) { n.fx = n.x; n.fy = n.y; }
                });
            }

            // Mostra tasto Sincronizza se c'è un vault
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn && appState.activeVaultPath) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            } else if (syncBtn) {
                syncBtn.classList.add('hidden');
            }

            window.switchToMapLayout();
            setTimeout(() => {
                try {
                    initD3Visualization();
                } catch (err) {
                    console.error("D3 Init Error:", err);
                    window.showLoadingOverlay(false);
                }
            }, 200);

            // Backfill pigro (22/7): se un progetto legacy non ha ancora una
            // cartella su disco, creala all'apertura (nome ROOT, nesting classe).
            if (!appState.activeVaultPath && window.ensureProjectVault) {
                setTimeout(() => { try { window.ensureProjectVault({ reason: 'open' }); } catch (e) { } }, 400);
            }

            return true;
        } catch (e) {
            console.error("Critical Load Error:", e);
            window.showAlert("Errore Caricamento", "Impossibile caricare il progetto: " + e.message);
            window.showLoadingOverlay(false);
            return false;
        }
    },

    deleteProject: function (e, id) {
        e.stopPropagation();
        const T = window.t || ((k, f) => f);
        // Conferma "forte": l'utente deve digitare la keyword — un click distratto
        // sul cestino non deve poter cancellare mappa e appunti.
        const keyword = T('rp_del_keyword', 'cancella');
        window.showPrompt(
            T('rp_del_title', 'Elimina Progetto'),
            '',
            (input) => {
                if (String(input || '').trim().toLowerCase() !== keyword.toLowerCase()) {
                    if (window.showToast) window.showToast(T('rp_del_wrong', 'Parola di conferma errata — progetto NON eliminato.'), 'error');
                    return;
                }
                let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
                projects = projects.filter(p => p.id !== id);
                localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
                localStorage.removeItem(id);
                this.renderRecentProjects();
            },
            T('rp_del_desc', 'Eliminerà la mappa e gli appunti di questo progetto. Per confermare scrivi: ') + '"' + keyword + '"'
        );
    },

    // Cache dei nomi di cartelle vault che effettivamente esistono.
    // null = non ancora verificato (o verifica fallita) → nessun filtro in render.
    validVaultFolders: null,

    // Verifica quali vault EFFETTIVAMENTE ESISTONO nel file system
    // (senza toccare localStorage, il quale rimane integro)
    syncValidVaults: async function () {
        try {
            if (!window.electronAPI || !window.electronAPI.getValidVaultFolders) return;
            this.validVaultFolders = await window.electronAPI.getValidVaultFolders();
            this._migrateProjectVaultNames();
        } catch (e) {
            console.warn("[StorageManager] Errore syncValidVaults:", e);
            this.validVaultFolders = null;
        }
    },

    // Una tantum: arricchisce le voci legacy di tutor_ai_projects con p.vault
    // (nome cartella vault) estratto dallo snapshot salvato — così render non
    // deve mai riparsare gli snapshot (possono pesare MB).
    _migrateProjectVaultNames: function () {
        try {
            const projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
            let changed = false;
            projects.forEach(p => {
                if (p.vault !== undefined) return;
                let vault = null;
                try {
                    const snap = JSON.parse(localStorage.getItem(p.id) || 'null');
                    if (snap && snap.activeVaultPath) {
                        vault = String(snap.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() || null;
                    }
                } catch (e) { /* snapshot corrotto → niente filtro per questa voce */ }
                p.vault = vault;
                changed = true;
            });
            if (changed) localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        } catch (e) {
            console.warn("[StorageManager] Errore migrazione vault names:", e);
        }
    },

    // Elimina DEFINITIVAMENTE da localStorage i progetti il cui vault non esiste più
    // (voce in tutor_ai_projects + snapshot appState — libera quota localStorage).
    // Da console: StorageManager.purgeStaleProjects()
    purgeStaleProjects: async function () {
        await this.syncValidVaults();
        if (!Array.isArray(this.validVaultFolders)) {
            console.warn('[StorageManager] Vault non verificabili — nessuna pulizia eseguita.');
            return 0;
        }
        let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
        const stale = projects.filter(p => p.vault && !this.validVaultFolders.includes(p.vault));
        stale.forEach(p => localStorage.removeItem(p.id));
        projects = projects.filter(p => !stale.includes(p));
        localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        this.renderRecentProjects();
        console.log('[StorageManager] Rimossi ' + stale.length + ' progetti stale:', stale.map(p => p.name));
        return stale.length;
    },

    // renderRecentProjects(containerId?, opts?) — fonte UNICA delle righe progetto
    // per la modalità Costruisci (default) e per la sezione "Progetti esistenti"
    // della modalità Insegna (005-landing-insegna).
    //   containerId : id del contenitore (default 'recent-projects-container')
    //   opts.gradeMenu : mostra la cella grade cliccabile (menu assegnazione)
    //   opts.classChips: mostra i chip delle classi attive (dal registro sessioni)
    // Retrocompatibile: chiamata senza argomenti = comportamento storico.
    renderRecentProjects: function (containerId, opts) {
        opts = opts || {};
        const container = document.getElementById(containerId || 'recent-projects-container');
        if (!container) return;
        const T = window.t || ((k, f) => f);
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const core = window.MappAITeachCore;
        // opts.rowAction : funzione (nome globale) chiamata al click riga, riceve l'id
        //                  (default apre il progetto). opts.hideResume: nasconde «Riprendi».
        const rowAction = opts.rowAction || 'window.loadSavedProject';
        const hideResume = !!opts.hideResume;

        // Registro sessioni (per i chip): letto una volta, solo se richiesto.
        let registry = [];
        if (opts.classChips) {
            try { registry = JSON.parse(localStorage.getItem('mappai_session_registry') || '[]'); }
            catch (e) { registry = []; }
        }

        try {
            let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");

            // Nasconde i progetti il cui vault è stato eliminato dal file system.
            // localStorage resta integro: per pulire davvero → StorageManager.purgeStaleProjects()
            if (Array.isArray(this.validVaultFolders)) {
                projects = projects.filter(p => !p.vault || this.validVaultFolders.includes(p.vault));
            }

            // Filtro "Solo classe attiva" (Insegna): la UI passa gli id ammessi.
            if (Array.isArray(opts.onlyIds)) {
                const allow = new Set(opts.onlyIds);
                projects = projects.filter(p => allow.has(p.id));
            }

            if (projects.length === 0) {
                container.innerHTML = '<p class="text-xs text-slate-400 italic px-3 py-3">' +
                    (opts.emptyMsg || T('ui_no_projects_app', 'Nessun progetto salvato in questa App MappAI.')) + '</p>';
                return;
            }

            // Colonne adattive: la 3ª colonna è Classe (default) oppure Chip classi
            // (Insegna); con gradeMenu si aggiunge una colonna Grade.
            const col3 = opts.classChips
                ? T('rp_classes', 'Classi')
                : T('rp_class', 'Classe');
            const GRID = opts.gradeMenu
                ? 'grid grid-cols-[52px_minmax(0,1fr)_110px_96px_48px_150px] items-center gap-2 px-3'
                : 'grid grid-cols-[56px_minmax(0,1fr)_130px_56px_150px] items-center gap-2 px-3';
            const header = `
                    <div class="rp-header ${GRID} py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 select-none">
                        <span>${T('rp_type', 'Tipo')}</span>
                        <span>${T('rp_title', 'Titolo')}</span>
                        <span>${esc(col3)}</span>
                        ${opts.gradeMenu ? `<span>${T('rp_grade', 'Grado')}</span>` : ''}
                        <span class="text-right">${T('rp_nodes', 'Nodi')}</span>
                        <span></span>
                    </div>`;

            const rows = projects.map(p => {
                const isKg = p.type === 'kg';
                const icon = isKg ? 'network' : 'git-merge';
                const label = isKg ? 'KG' : 'MM';
                const labelFull = isKg ? 'Knowledge Graph' : 'Mappa Mentale';
                // Bollino taratura (19/7): verde = generata con taratura livello, grigio = standard.
                const tunedDot = `<span class="inline-block w-2 h-2 rounded-full shrink-0 ${p.tuned ? 'bg-emerald-500' : 'bg-slate-300'}" title="${p.tuned ? T('rp_tuned_yes', 'Generazione tarata') : T('rp_tuned_no', 'Generazione standard')}"></span>`;

                // Cella 3: chip classi (Insegna) oppure classe di salvataggio (default)
                let col3Cell;
                if (opts.classChips) {
                    const sessionChips = (core && core.classesForMap)
                        ? core.classesForMap(registry, { projectId: p.id, map: p.name }) : [];
                    // 19/7: mostra ANCHE la classe con cui la mappa è stata generata
                    // (p.cls), non solo le classi delle sessioni live. Dedup normGrade.
                    const norm = (core && core.normGrade) ? core.normGrade : (x => String(x == null ? '' : x).toLowerCase().trim());
                    const chips = [];
                    const seenCls = Object.create(null);
                    const pushCls = (c) => { if (c == null || c === '') return; const k = norm(c) || String(c); if (seenCls[k]) return; seenCls[k] = true; chips.push(c); };
                    pushCls(p.cls);
                    sessionChips.forEach(pushCls);
                    col3Cell = chips.length
                        ? '<span class="flex flex-wrap gap-1">' + chips.slice(0, 3).map(c =>
                            `<span class="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5"><i data-lucide="graduation-cap" class="w-2.5 h-2.5 shrink-0"></i>${esc(c)}</span>`).join('') + '</span>'
                        : '<span class="text-slate-300">—</span>';
                } else {
                    col3Cell = p.cls
                        ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 truncate"><i data-lucide="graduation-cap" class="w-3 h-3 shrink-0"></i>${esc(p.cls)}</span>`
                        : '<span class="text-slate-300">—</span>';
                }

                // Cella grade (solo gradeMenu): cliccabile → editGrade
                const gradeCell = opts.gradeMenu
                    ? `<button type="button" onclick="event.stopPropagation(); window.MappAITeach && window.MappAITeach.editGrade('${p.id}')" class="text-[10px] font-semibold rounded-full px-2 py-0.5 transition ${p.grade ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-400 bg-slate-50 hover:bg-slate-100'}" title="${T('rp_grade_set', 'Assegna grado')}">${p.grade ? esc(p.grade) : '+ ' + T('rp_grade', 'Grado')}</button>`
                    : '';

                return `
                    <div class="rp-row ${GRID} py-2 border-b border-slate-100 hover:bg-indigo-50 transition cursor-pointer group" onclick="${rowAction}('${p.id}')">
                        <span class="inline-flex items-center gap-1 text-indigo-400" title="${labelFull}">
                            <i data-lucide="${icon}" class="w-3 h-3 shrink-0"></i>
                            <span class="text-[9px] font-bold uppercase tracking-tight">${label}</span>
                        </span>
                        <span class="flex items-center gap-1.5 min-w-0" title="${esc(p.name)}">${tunedDot}<span class="text-[12px] font-bold text-slate-700 truncate group-hover:text-indigo-600 transition">${esc(p.name)}</span></span>
                        ${col3Cell}
                        ${gradeCell}
                        <span class="text-[11px] text-slate-500 text-right tabular-nums">${p.nodesCount}</span>
                        <span class="flex justify-end items-center gap-3">
                            ${hideResume ? '' : `<span class="text-[10px] text-indigo-500 font-semibold flex items-center gap-1 group-hover:text-indigo-700"><i data-lucide="play-circle" class="w-3 h-3"></i> ${T('rp_resume', 'Riprendi')}</span>`}
                            <button type="button" onclick="StorageManager.deleteProject(event, '${p.id}')" class="text-slate-300 hover:text-red-500 transition p-1" title="${T('rp_delete', 'Elimina')}"><i data-lucide="trash" class="w-3 h-3"></i></button>
                        </span>
                    </div>`;
            }).join('');

            // Solo le righe scrollano; l'header resta fisso sopra
            container.innerHTML = header +
                `<div class="rp-rows overflow-y-auto max-h-[300px]" style="scrollbar-gutter:stable;">${rows}</div>`;
            window.safeCreateIcons();
        } catch (e) {
            console.error("Error rendering projects:", e);
            container.innerHTML = '<p class="text-xs text-red-400 italic">Errore caricamento progetti.</p>';
        }
    }
};

window.loadSavedProject = function (id) {
    StorageManager.loadProject(id);
};

// toggleProjectsBar — no-op retrocompatibile. Il drawer #projects-bar è stato
// rimosso in 005-landing-insegna (la lista vive nella sezione collassabile di
// Costruisci e nella modalità Insegna). Restano solo chiamanti guardati in
// mappai-ui-canvas.js che non devono lanciare eccezioni.
window.toggleProjectsBar = function () { /* drawer rimosso: no-op */ };

setInterval(() => {
    /* ⚠️ Non mentre una mappa si sta costruendo (14/8): il salvataggio
       periodico scriverebbe un progetto A METÀ — nodi appena arrivati, rami
       ancora da espandere — e se poi la generazione fallisse resterebbe quello.
       Il salvataggio VERO lo fa la fine della generazione (`ensureProjectVault`
       → `saveCurrentProject`), che scrive quando c'è qualcosa di finito. */
    if (window.MappAIGen && window.MappAIGen.attiva()) return;
    if (window.MappAIPipeline && window.MappAIPipeline.occupata && window.MappAIPipeline.occupata()) return;
    StorageManager.saveCurrentProject();
}, 120000); // periodic background save just in case

// Aggiungo il gestore lingue per i modali
window.currentLanguage = localStorage.getItem('mappai_language') || 'it';

window.changeLanguage = function (lang, silent) {
    window.currentLanguage = lang;
    localStorage.setItem('mappai_language', lang);
    // Uso i nomi definiti nei file .js caricati
    const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));

    // --- 1. LOCALIZZAZIONE LANDING PAGE ---
    const els = {
        'landing-subtitle': t.landing_subtitle,
        'btn-setup-label': t.btn_setup,
        /* `btn-app-guide-label` / `btn-app-tutorial-label`: gli elementi non
           esistono nel markup (erano bottoni di sola icona) — righe morte,
           tolte con i bottoni. */
        'label-step1': t.step1,
        'label-step2': t.step2,
        'label-mode-mindmap': t.step2_mindmap,
        'label-mode-kg': t.step2_kg,
        'label-step4': t.step_density_title,
        'label-step4-kg': t.step_kg_density_title,
        'btn-generate-label': (document.getElementById('extraction-mode')?.value || 'mindmap') === 'mindmap' ? t.new_map_btn : t.new_kg_btn,


        'btn-blank-canvas-label': t.btn_blank_canvas_label || "Oppure crea Canvas Vuoto (Manuale)",
        'label-save-folder': t.save_folder,
        'label-ext-guide': t.ext_ai_guide,
        'label-import-json': t.import_json,
        'modal-setup-title': t.modal_config_title,
        'modal-study-title-label': t.modal_study_title,
        'modal-guide-title-label': t.modal_guide_title,
        'label-language-select': lang === 'it' ? 'Lingua:' : 'Language:',
        'label-api-key': appState.aiProvider === 'infomaniak' ? (t.api_key_label_infomaniak || "API Token (Infomaniak)") : (t.api_key_label_google || t.api_key_label),
        'label-api-key-desc': t.api_key_desc,
        'label-api-key-how': t.api_key_how,
        'label-ai-model': t.ai_model_label,
        'label-refresh-models': t.refresh_models,
        'estimator-title-lbl': t.estimator_title,
        'estimator-tokens-lbl': t.estimator_tokens_label,
        'estimator-cost-lbl': t.estimator_cost_label,
        'feedback-section-title': t.feedback_section,
        'feedback-btn-title': t.feedback_btn_title,
        'feedback-btn-desc': t.feedback_btn_desc
        /* del modale segnalazioni restano solo le tre voci del CASSETTO: il
           modale è stato pensionato (15/8) e le sue etichette vivono nella
           Cabina, che passa da `t()` e non da questa mappa di id. */
    };

    for (let id in els) {
        const el = document.getElementById(id);
        if (el) el.innerText = els[id];
    }

    // Process data-i18n attributes automatically
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.innerHTML = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.setAttribute('placeholder', t[key]);
    });
    // Tooltip hover: title="" tradotti via data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (t[key]) el.setAttribute('title', t[key]);
    });
    // Tooltip hover STILIZZATI (MappAITips): data-tip="" tradotto via data-i18n-tip
    document.querySelectorAll('[data-i18n-tip]').forEach(el => {
        const key = el.getAttribute('data-i18n-tip');
        if (t[key]) el.setAttribute('data-tip', t[key]);
    });

    // --- 1b. LOCALIZZAZIONE PRICING (Inner HTML) ---
    const pricingFree = document.getElementById('pricing-free');
    const pricingPaid = document.getElementById('pricing-paid');
    const pricingNote = document.getElementById('pricing-note');
    if (pricingFree) pricingFree.innerHTML = t.pricing_free;
    if (pricingPaid) pricingPaid.innerHTML = t.pricing_paid;
    if (pricingNote) pricingNote.innerHTML = t.pricing_note;

    // --- 2. LOCALIZZAZIONE MODALE STUDIO (Active Recall, ecc) ---
    const studyContainer = document.getElementById('study-modal-content');
    // Il contenuto è ora statico nell'HTML, la traduzione avviene tramite data-i18n.

    const guideContainer = document.getElementById('guide-modal-content');
    if (guideContainer) {
        const normalGuide = document.getElementById('guide-normal-content');
        const studentGuide = document.getElementById('guide-student-content');

        if (normalGuide && studentGuide) {
            if (appState.studentMode) {
                normalGuide.classList.add('hidden');
                studentGuide.classList.remove('hidden');
            } else {
                normalGuide.classList.remove('hidden');
                studentGuide.classList.add('hidden');
            }
        }
    }

    // --- 4. FEEDBACK VISIVO BANDIERE ---
    const btnIt = document.getElementById('lang-btn-it');
    const btnEn = document.getElementById('lang-btn-en');
    if (btnIt && btnEn) {
        if (lang === 'it') {
            btnIt.classList.remove('grayscale', 'opacity-40');
            btnIt.classList.add('grayscale-0', 'opacity-100');
            btnEn.classList.remove('grayscale-0', 'opacity-100');
            btnEn.classList.add('grayscale', 'opacity-40');
        } else {
            btnEn.classList.remove('grayscale', 'opacity-40');
            btnEn.classList.add('grayscale-0', 'opacity-100');
            btnIt.classList.remove('grayscale-0', 'opacity-100');
            btnIt.classList.add('grayscale', 'opacity-40');
        }
    }

    // Invia segnale di cambio lingua se necessario (es. per toast)
    if (!silent && window.showToast) {
        window.showToast(lang === 'it' ? t.toast_lang_it : t.toast_lang_en, "info");
    }

    // Aggiorna dinamicamente le descrizioni di Step 4 in base a lingua e modalità
    if (window.updateStep4Display) {
        window.updateStep4Display();
    }
    if (window.updateTokenCostEstimator) {
        window.updateTokenCostEstimator();
    }
};

// ── Onboarding lingua al primo avvio ─────────────────────────────────────────
// Doppia scelta: lingua INTERFACCIA + lingua MAPPE (due cose diverse: un docente
// può volere l'app in inglese ma mappe in italiano per i suoi studenti).
// Appare SOLO su installazione fresca (nessuna mappai_language salvata).
window.showLanguageOnboarding = function () {
    const T = window.t || ((k, f) => f);
    const modal = document.createElement('div');
    modal.id = 'lang-onboarding-modal';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
    const opt = (name, value, label, desc, checked) => `
        <label class="pm-option">
            <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}>
            <div><span class="pm-option-label">${label}</span>
            ${desc ? `<span class="pm-option-desc">${desc}</span>` : ''}</div>
        </label>`;
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" role="dialog" aria-modal="true" aria-labelledby="lang-onb-title">
        <div class="flex items-center gap-3 mb-4">
            <div class="pm-icon-wrap"><i data-lucide="languages" class="w-6 h-6"></i></div>
            <div>
                <h3 class="pm-title" id="lang-onb-title">${T('onb_title', 'Benvenuto in MappAI! · Welcome!')}</h3>
                <p class="pm-subtitle">${T('onb_subtitle', 'Scegli le lingue · Choose your languages')}</p>
            </div>
        </div>
        <div class="pm-section">
            <div class="pm-section-title">🖥 ${T('onb_ui_lang', 'Lingua dell\'interfaccia · Interface language')}</div>
            ${opt('onb-ui-lang', 'it', 'Italiano 🇮🇹', '', true)}
            ${opt('onb-ui-lang', 'en', 'English 🇬🇧', '', false)}
        </div>
        <div class="pm-section">
            <div class="pm-section-title">🗺 ${T('onb_map_lang', 'Lingua delle mappe · Map language')}</div>
            ${opt('onb-map-lang', 'ui', T('onb_map_ui', 'Come l\'interfaccia · Same as interface'), '', true)}
            ${opt('onb-map-lang', 'it', 'Italiano', '', false)}
            ${opt('onb-map-lang', 'en', 'English', '', false)}
            ${opt('onb-map-lang', 'auto', T('onb_map_auto', 'Lingua delle fonti · Language of the sources'), T('onb_map_auto_desc', 'Le mappe nascono nella lingua dei documenti caricati · Maps follow the language of your documents'), false)}
        </div>
        <div class="flex justify-end mt-5">
            <button type="button" id="lang-onb-ok" class="pm-btn-primary">${T('onb_start', 'Inizia · Start')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    if (window.safeCreateIcons) window.safeCreateIcons();
    document.getElementById('lang-onb-ok').onclick = () => {
        const uiLang = (modal.querySelector('input[name="onb-ui-lang"]:checked') || {}).value || 'it';
        const mapLang = (modal.querySelector('input[name="onb-map-lang"]:checked') || {}).value || 'ui';
        localStorage.setItem('mappai_map_language', mapLang);
        localStorage.setItem('mappai_lang_onboarded', '1');
        modal.remove();
        window.changeLanguage(uiLang);
    };
};

// Add auto-render projects on load
document.addEventListener('DOMContentLoaded', async () => {
    // Inizializza secure keys dal Keychain nativo se disponibile, o da localStorage
    if (window.initSecureKeys) {
        try {
            await window.initSecureKeys();
        } catch (e) {
            console.error("[MappAI] Errore inizializzazione Secure Keys all'avvio:", e);
        }
    }

    // Inizializza Lingua (silent=true: niente toast all'avvio)
    window.changeLanguage(window.currentLanguage, true);

    // Onboarding lingue: solo installazione fresca (mai vista una lingua salvata)
    try {
        if (!localStorage.getItem('mappai_lang_onboarded')) {
            if (localStorage.getItem('mappai_language') === null) {
                window.showLanguageOnboarding();
            } else {
                localStorage.setItem('mappai_lang_onboarded', '1'); // utente esistente: non disturbare
            }
        }
    } catch (e) { /* localStorage non disponibile */ }

    /* I tre bottoni solo-icona dell'header non esistono più: l'header ha il chip
       del contesto e la Cabina (2/8). Questi listener stavano IN PIÙ rispetto
       all'`onclick` inline: finché i bottoni c'erano, un clic apriva due cose —
       la Cabina e la finestra storica sotto. Tolti con i bottoni. */

    const autoGenToggle = document.getElementById('l1-auto-generate-toggle');
    if (autoGenToggle) {
        autoGenToggle.addEventListener('change', () => {
            if (window.updateStep4Display) window.updateStep4Display();
        });
    }

    // Multi-pass ON di default (silent=true: niente toast all'avvio)
    window.setMultiPassMode(true, true);

    // Initialize Pipeline A/B selector. Default = B (MappAI classico KG).
    const savedPipeline = localStorage.getItem('mappai_generation_pipeline') || 'B';
    window.setPipeline(savedPipeline, true);
    // Initialize MM logic toggle (default MappAI)
    // Migrazione una-tantum: la logica MM "BERT" era sperimentale e degradava le macro-aree L1
    // (deriva geografica / espansione di contesto). Chi aveva il flag legacy 'bert' viene
    // riportato al default MappAI UNA volta sola; dopo la migrazione BERT resta comunque
    // selezionabile come opt-in (la scelta esplicita successiva persiste).
    if (localStorage.getItem('mappai_mm_logic_migrated') !== '1') {
        if (localStorage.getItem('mappai_mm_logic') === 'bert') {
            localStorage.setItem('mappai_mm_logic', 'mappai');
        }
        localStorage.setItem('mappai_mm_logic_migrated', '1');
    }
    // Default ADATTIVA (triage): se il flag non è mai stato impostato, attivalo.
    // Così sia getMMLogic sia il gate del triage (mm-triage.js, === '1') sono coerenti.
    // Opt-out esplicito → setMMLogic('mappai') scrive '0' e persiste.
    if (localStorage.getItem('mappai_mm_triage_enabled') === null) {
        localStorage.setItem('mappai_mm_triage_enabled', '1');
    }
    if (typeof window.setMMLogic === 'function') window.setMMLogic(window.getMMLogic(), true);
    // Stile icone UI (Lucide SVG / Android): applica la scelta salvata + sincronizza il toggle.
    /* Stile icone pensionato (13/8): l'app è solo Lucide SVG. Chi aveva scelto
       «Android» ha ancora la chiave in storage — si toglie, o al prossimo giro
       nessuno saprebbe più da dove viene un'emoji al posto di un'icona. */
    try { localStorage.removeItem('mappai_icon_style'); } catch (e) { }
    const desc = document.getElementById('pipeline-desc');
    if (desc) desc.innerHTML += '<br><small style="opacity:0.7; font-size:11px;">Riavvia generazione per applicare</small>';

    // Sincronizza la lista di vault che effettivamente esistono, poi renderizza
    StorageManager.syncValidVaults().then(() => {
        StorageManager.renderRecentProjects();
    }).catch(e => {
        console.warn("[Init] Errore syncValidVaults:", e);
        StorageManager.renderRecentProjects(); // Fallback: renderizza comunque
    });

    // Load Gemini Key
    const savedGeminiKey = (window.secureKeys && window.secureKeys['gemini_api_key']) || localStorage.getItem('gemini_api_key');
    if (savedGeminiKey) {
        const geminiInput = document.getElementById('gemini-api-key-input');
        if (geminiInput) geminiInput.value = savedGeminiKey;
    }
    // Load Infomaniak Key
    const savedInfomaniakKey = (window.secureKeys && window.secureKeys['infomaniak_api_key']) || localStorage.getItem('infomaniak_api_key');
    if (savedInfomaniakKey) {
        const infomaniakInput = document.getElementById('infomaniak-api-key-input');
        if (infomaniakInput) infomaniakInput.value = savedInfomaniakKey;
    }

    // Load Infomaniak Product ID
    if (appState.infomaniakProductId) {
        const productInput = document.getElementById('infomaniak-product-id');
        if (productInput) productInput.value = appState.infomaniakProductId;
    }

    // Load saved models on boot
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const modelsStorageKey = isInfomaniak ? 'infomaniak_available_models' : 'gemini_available_models';
    const selectionStorageKey = isInfomaniak ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const defaultModel = isInfomaniak ? 'mistral-small-4-119B-2603' : 'gemini-2.0-flash';

    const savedModelsStr = localStorage.getItem(modelsStorageKey);
    const selectEl = document.getElementById('model-select');
    if (savedModelsStr) {
        try {
            const savedModels = JSON.parse(savedModelsStr);
            const currentValue = localStorage.getItem(selectionStorageKey) || defaultModel;
            renderModelSelect(savedModels, selectEl, currentValue);
        } catch (e) {
            if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
        }
    } else {
        if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
    }

    // Initialize the UI for the current provider
    if (window.switchAIProvider) window.switchAIProvider(appState.aiProvider);

    // Setup estimator events and initial display
    if (selectEl) {
        selectEl.addEventListener('change', () => {
            if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
        });
    }
    if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();

    // Aggiorna dinamicamente l'etichetta del percorso cartella dei vault
    const labelEl = document.getElementById('vault-manager-folder-path-label');
    if (labelEl) {
        /* `isCapacitor` non è mai stato definito in questo file: era un
           ReferenceError a OGNI avvio, l'ultima riga del gestore. Registrato nel
           diario degli errori di Giacomo tre volte l'11 settembre. */
        var _cap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
        labelEl.textContent = _cap ? "Cartella: MappAI - Vault" : "Cartella: Documents/Salvataggi MappAI";
    }
});

// ── I salvataggi d'USCITA (15/8) ─────────────────────────────────────────────
// ⌘Q: il main trattiene l'uscita e chiede di salvare. Si scrive lo snapshot
// (sincrono) e, se c'è un vault, anche la cartella — poi si risponde e il main
// riparte. Il tetto di 3s sta nel main: qui non serve un secondo orologio.
// ⚠️ Con Studio attivo in corso NON si scrive il vault: la mappa in memoria è
// quella smontata dall'esercizio, e renderla permanente perderebbe la
// gerarchia (stessa guardia di saveCurrentProject, che salta da sé).
if (window.electronAPI && window.electronAPI.onSalvaPrimaDiUscire) {
    window.electronAPI.onSalvaPrimaDiUscire(async () => {
        const fatto = () => { try { window.electronAPI.salvataggioUscitaFatto(); } catch (e) { } };
        try {
            /* Le opzioni della Vista studio vivono in DUE posti: nel progetto
               (ci pensa saveCurrentProject, sono dentro appState) e a livello
               UTENTE, che è la taratura con cui si riapre la prossima mappa.
               La seconda si scriveva solo su `beforeunload`, che con ⌘Q non è
               garantito: qui il main ci sta aspettando, quindi è il posto
               giusto per esserne certi. */
            if (window.MappAIStudioView && window.MappAIStudioView.salvaProfilo) {
                try { window.MappAIStudioView.salvaProfilo(); } catch (e) { }
            }
            StorageManager.saveCurrentProject();
            if (appState.activeVaultPath && window.buildVaultMapData && window.electronAPI.saveVault) {
                await window.electronAPI.saveVault({ folderPath: appState.activeVaultPath, mapData: window.buildVaultMapData() });
            }
        } catch (e) { /* si esce comunque: il main ha il suo tetto */ }
        fatto();
    });
}
// Rete in più per le uscite che non passano dal main (reload compresi): lo
// snapshot è sincrono e fa in tempo; il vault no, e qui non si tenta.
window.addEventListener('beforeunload', () => {
    try { StorageManager.saveCurrentProject(); } catch (e) { }
});

// STUDY SESSION (config/player/punteggi/report) → estratto in js/mappai-study-session.js

// Inizializza Costi al caricamento
setTimeout(() => { if (window.updateCostDisplay) window.updateCostDisplay(); }, 1000);

// Event listener per riga di lettura compensativa
window.addEventListener('mousemove', e => {
    document.documentElement.style.setProperty('--ruler-y', e.clientY + 'px');
});
