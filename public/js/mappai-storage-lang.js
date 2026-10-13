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
    adottaVault: async function (folderPath, stato, opts) {
        /* 0061 (29/09) — CREARE NON È APRIRE (ADR 0013). Questa funzione serviva sia
           a chi riapre una cartella sia a chi la crea (fine generazione, pipeline,
           «Esporta nel Vault»), e cercava sempre per NOME: una mappa nuova col titolo
           di una vecchia ne prendeva l'id (28/9, «Svizzera e 2a GM» →
           proj_1788975818955 del 9/9). Ora il chiamante dice il gesto (`opts.gesto`:
           nuova · per-la-mappa · apri · voce; senza `opts` vale `apri`, cioè la
           riapertura di prima) e la decisione è del core
           (`MappAITeachCore.identitaDellaCartella`, inv. 4). Qui restano la posizione
           (cura (a) dell'11/9, trappola 26), l'elenco delle cartelle e il conio.
           Scrive `currentProjectId` e `idInCartella` = { percorso, id da scrivere in
           `index.yaml` (null = non si scrive), posizione }.
           ⚠️ NON scrive `activeVaultPath`: lo fa il chiamante, DOPO. Con la cartella
           nuova già attiva, un autosave che cadesse nelle attese qui dentro farebbe
           dichiarare la cartella alla voce del giro prima della decisione, e `nuova`
           conierebbe un secondo id (packet 0061 §4, «L'ordine»).
           ⚠️ Il tetto delle microtask (tests/review-store.test.js): senza
           `getAllVaults` nessuna attesa in più di prima; con `getAllVaults`, una. */
        const st = stato || (typeof appState !== 'undefined' ? appState : window.appState);
        const o = opts || { gesto: 'apri' };
        const gesto = o.gesto || 'apri';
        try {
            let classDir = null, discDir = null, vault = String(folderPath).split(/[\\/]/).filter(Boolean).pop();
            try {
                const info = (window.electronAPI && window.electronAPI.filesRootGet)
                    ? await window.electronAPI.filesRootGet() : null;
                const basi = [info && info.mapsBaseDir, info && info.studentsBaseDir].filter(Boolean);
                /* 0061, 30/09, scelta A di Giacomo: su Windows i percorsi nativi hanno `\`
                   (C:\…\Mappe\4R\Storia\X), e confrontata col prefisso della base la cartella
                   sembrava fuori da Mappe/: classe e materia null, e con D5 la voce le perdeva.
                   Si porta `\` a `/` sulla base e sul percorso, prima di confrontarli e di
                   spezzarli. Su macOS e Linux non cambia niente: `safeName` toglie già `\` da
                   ogni nome di cartella che l'app crea. La ritraduzione di Generico e il resto
                   del blocco restano com'erano. */
                const barre = (s) => String(s).replace(/\\/g, '/');
                for (const b of basi) {
                    const pref = barre(b).replace(/\/+$/, '') + '/';
                    if (barre(folderPath).indexOf(pref) !== 0) continue;
                    const segs = barre(folderPath).slice(pref.length).split('/').filter(Boolean);
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

            /* L'elenco delle cartelle (get-all-vaults) serve al core per le copie e
               per la guardia sul nome (D3): chi l'ha già letto lo passa
               (`ensureProjectVault`, per i fratelli); per `apri` e `per-la-mappa` si
               legge qui, UNA volta; `nuova` e `voce` non lo usano. */
            let cartelle = Array.isArray(o.cartelle) ? o.cartelle : null;
            if (!cartelle && (gesto === 'apri' || gesto === 'per-la-mappa')) {
                cartelle = [];
                if (window.electronAPI && window.electronAPI.getAllVaults) {
                    try { cartelle = (await window.electronAPI.getAllVaults()) || []; } catch (e) { cartelle = []; }
                }
            }

            const TC = window.MappAITeachCore;
            const projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            const deciso = (TC && TC.identitaDellaCartella)
                ? TC.identitaDellaCartella(projects, {
                    gesto: gesto, idCartella: o.idCartella, idAttuale: this.currentProjectId,
                    pos: { vault: vault, classDir: classDir, discDir: discDir }, fullPath: folderPath,
                    percorsoPrima: o.percorsoPrima || null, vuota: !!o.vuota, cartelle: cartelle || []
                })
                : null;   // senza il core: si conia, come prima
            this.currentProjectId = (deciso && deciso.id) ? deciso.id : ('proj_' + Date.now());
            this.idInCartella = { percorso: folderPath, id: (deciso && deciso.scrivi) ? this.currentProjectId : null,
                posizione: { classDir: classDir, discDir: discDir } };
            return this.currentProjectId;
        } catch (e) {
            // mai lasciare l'identità della mappa precedente: meglio una scheda
            // nuova che una scheda scambiata
            this.currentProjectId = 'proj_' + Date.now();
            this.idInCartella = null;
            return this.currentProjectId;
        }
    },

    saveCurrentProject: function () {
        if (appState && (appState._reviewRestoring || appState._reviewRestoreError)) return;
        // GUARDIA Studio attivo: durante una sessione la mappa sul canvas è
        // (20/8: qui si saltava il salvataggio mentre una modalità di Studio
        // attivo teneva il grafo smontato. Quelle modalità sono in pensione e
        // le attività di oggi non toccano il canvas: si salva sempre.)
        const reading = appState && appState.extractionMode === 'lettura';
        const readingRef = reading && appState._pipelineManifest && appState._pipelineManifest.reading;
        if (reading) {
            // 0070: il testo vive nella cartella. L'autosave può aggiornare solo
            // l'indice, dopo il readback e l'adozione della stessa identità.
            const FC = window.MappAIFilesCore, ic = this.idInCartella;
            const safeId = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
            const r = appState._pipelineManifest && appState._pipelineManifest.review;
            if (!FC || !FC.idProgettoValido(this.currentProjectId) || !appState.activeVaultPath ||
                !ic || ic.percorso !== appState.activeVaultPath || ic.id != null && ic.id !== this.currentProjectId ||
                !readingRef || readingRef.kind !== 'percorso-lettura' || readingRef.schemaVersion !== 1 ||
                readingRef.extractionMode !== 'lettura' || readingRef.projectId !== this.currentProjectId ||
                !safeId(readingRef.percorsoId) || !safeId(readingRef.sourceId) ||
                !Number.isSafeInteger(readingRef.sourceRevision) || readingRef.sourceRevision < 1 ||
                readingRef.sourcePath !== 'Materiale Studio/Sorgenti/Percorso-lettura-' + readingRef.percorsoId + '.json' ||
                readingRef.originalArchived !== true || !r || r.projectId !== this.currentProjectId || r.vaultPath !== appState.activeVaultPath) {
                return { ok: false, error: 'reading_identity_invalid' };
            }
            try {
                const listed = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
                if (!Array.isArray(listed) || listed.some(p => !p || typeof p !== 'object')) return { ok: false, error: 'reading_index_invalid' };
                const sameId = listed.filter(p => p && p.id === this.currentProjectId);
                const vaultName = String(appState.activeVaultPath).split(/[\\/]/).filter(Boolean).pop().normalize('NFC');
                if (sameId.length > 1 || sameId.some(p => p.type !== 'lettura') || listed.some(p => p &&
                    p.id !== this.currentProjectId && (p.vaultPath === appState.activeVaultPath ||
                        typeof p.vault === 'string' && p.vault.normalize('NFC') === vaultName))) {
                    return { ok: false, error: 'reading_identity_collision' };
                }
            } catch (error) { return { ok: false, error: 'reading_index_invalid' }; }
        } else if (!appState || !appState.db || !appState.db.nodes || appState.db.nodes.length === 0) return;

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
            /* 0061 (29/09, ADR 0013) — l'unica eccezione: l'id viene dalla cartella
               attiva (adottata in QUESTO percorso, e l'id è quello deciso lì). Allora il
               nome è cambiato perché la cartella si è spostata o rinominata («21 …» in
               Analisi): l'identità è sua e non si stacca. Una strada che cambia
               `activeVaultPath` senza adottare non passa il controllo sul percorso, e
               la rete scatta come prima. */
            const ic = this.idInCartella;
            const dallaCartella = !!(ic && ic.percorso === appState.activeVaultPath && ic.id === this.currentProjectId);
            if (attivo && prev && prev.vault && nfc(prev.vault) !== nfc(attivo) && !dallaCartella) {
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
            nodesCount: reading ? 0 : appState.db.nodes.length,
            type: appState.extractionMode || 'mindmap',
            // Nome della cartella vault collegata (null = progetto solo-localStorage):
            // usato da renderRecentProjects per nascondere i progetti il cui vault è stato eliminato
            vault: appState.activeVaultPath
                ? (String(appState.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() || null)
                : null,
            // Contenitore di classe che annida il vault (22/7, auto-vault): serve a
            // disambiguare il match col disco (get-all-vaults ritorna folderName +
            // classDir). null = progetto senza classe (vault piatto storico o in Mappe/Generico/).
            /* 0061 (29/09, D5): se la cartella attiva è stata ADOTTATA in questo
               percorso, la posizione della voce è quella che `adottaVault` ha appena
               ricavato dal percorso — anche null: una cartella fuori dalle basi
               (Analisi, Scrivania) non ha classe, e tenere «4R»/«Storia» della voce
               darebbe una posizione ibrida che non esiste. Senza `posizione` (una
               fotografia riaperta da `loadProject`), le righe di prima. */
            classDir: (this.idInCartella && this.idInCartella.percorso === appState.activeVaultPath && this.idInCartella.posizione)
                ? (this.idInCartella.posizione.classDir || null)
                : (appState.activeVaultClassDir
                    || (existing ? existing.classDir : null)
                    || null),
            // Disciplina della generazione (29/7): nome leggibile per le tabelle
            // (colonna DISCIPLINA) + cartella che annida il vault dentro la classe.
            // Congelata come cls/clsId: una mappa non cambia disciplina da sola.
            disc: existing ? (existing.disc || appState.generationDiscipline || null) : (appState.generationDiscipline || null),
            discDir: (this.idInCartella && this.idInCartella.percorso === appState.activeVaultPath && this.idInCartella.posizione)
                ? (this.idInCartella.posizione.discDir || null)
                : (appState.activeVaultDiscDir
                    || (existing ? existing.discDir : null)
                    || null)
        };

        /* 0082 (§4.4): col cassetto solo indice acceso la riga porta `cartella`, il
           percorso della cartella del progetto relativo alla radice dei file quando
           ci sta dentro, intero quando sta fuori (Analisi): «Riprendi» senza copia la
           ritrova anche fuori da `Mappe/`. La radice (`_radice`) la leggono
           `allineaCartella` e `loadProject` da `filesRootGet`, e resta: finché non è
           nota, se la cartella è quella della riga di prima il valore resta il suo.
           Spento: nessun campo nuovo. */
        const VCs = window.MappAIVistaCore;
        const soloIndice = !!(VCs && VCs.cassettoSoloIndice && VCs.cassettoSoloIndice());
        if (soloIndice) {
            const nfcV = s => { try { return String(s || '').normalize('NFC'); } catch (e) { return String(s || ''); } };
            if (!appState.activeVaultPath) pMeta.cartella = null;
            else if (this._radice) pMeta.cartella = VCs.percorsoRiga(appState.activeVaultPath, this._radice);
            else if (existing && existing.vault && pMeta.vault && nfcV(existing.vault) === nfcV(pMeta.vault) && existing.cartella !== undefined) pMeta.cartella = existing.cartella;
            else pMeta.cartella = VCs.percorsoRiga(appState.activeVaultPath, null);
        }

        if (reading) {
            pMeta.vaultPath = appState.activeVaultPath;
            pMeta.reading = { percorsoId: readingRef.percorsoId, sourceId: readingRef.sourceId,
                sourceRevision: readingRef.sourceRevision, sourcePath: readingRef.sourcePath };
        }

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
        /* 0076 (ADR 0018): con `mappai_cassetto_snello` = '1' la copia non porta
           ciò che è già nella cartella (la regola sta in MappAIVistaCore). Spento:
           la copia di oggi. Stesso interruttore per il ramo del cassetto pieno. */
        let snello = false;
        try { snello = localStorage.getItem('mappai_cassetto_snello') === '1'; } catch (e) { snello = false; }
        const _scrivi = () => {
            if (reading) {
                localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
                return;
            }
            /* 0082: il testo della copia si calcola in UN posto (`_testoCopia`), lo
               stesso che `allineaCartella` ricorda nell'impronta (inv. 6). */
            const testo = this._testoCopia();
            const id = this.currentProjectId;
            /* 0082 (§4.2): acceso, la copia non si rimette nel cassetto solo se lì non
               c'è (è uscita dopo una scrittura della cartella) e il testo è quello
               dell'impronta: la cartella ha già questo stato. In ogni altro caso si
               scrive come oggi; la riga d'indice si scrive sempre. Una copia DIVERSA
               dall'impronta vuol dire che la mappa è cambiata: si chiede la scrittura
               della cartella fra ~10 s (§4.3-bis), non a ogni `renderGraph`. */
            let salta = false, diversa = false;
            if (soloIndice) {
                let nelCassetto = null;
                try { nelCassetto = localStorage.getItem(id); } catch (e) { nelCassetto = undefined; }
                salta = VCs.saltaCopia(this._impronta, id, testo, nelCassetto);
                const imp = this._impronta;
                diversa = !(imp && imp.id === id && imp.copia === testo);
            }
            if (!salta) localStorage.setItem(id, testo);
            localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
            /* (un progetto senza cartella non ha niente da scrivere: niente timer) */
            if (soloIndice && !salta && diversa && appState.activeVaultPath) this._chiediAllineamento();
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
            // Una scrittura atomica dell'indice non lascia una mezza copia.
            // Il chiamante può segnalare Riprendi indisponibile: il testo è salvo.
            if (reading) return { ok: false, error: 'reading_index_write_failed' };
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
                   in silenzio è il guasto peggiore di questo file. La rete è la
                   cartella del progetto, quando c'è (il ramo del cassetto pieno qui
                   sotto la scrive, e col cassetto solo indice la scrive anche il
                   salvataggio automatico, 0082). Il `mm_*.json` qui sotto non è una
                   rete: nessuno lo rilegge, e da qui non si arriva nemmeno a
                   scriverlo (questo ramo esce prima). */
                console.error('[Storage] salvataggio non riuscito, quota piena:', e2 && e2.message);
                /* Il guasto peggiore di questo file, e finora lasciava traccia
                   SOLO in console: un tester non la apre, e la segnalazione
                   sarebbe arrivata come «non mi salva più». Ora è una riga del
                   registro, quindi viaggia da sola nella segnalazione. */
                /* 0076: prima di parlare si scrive la cartella, e si dice solo il vero.
                   Il reader non carica mappai-errori.js: lì resta il messaggio di oggi. */
                const _nuovo = snello && !!window.MappAIErrori;
                if (window.MappAIErrori) {
                    try {
                        window.MappAIErrori.registra({
                            dove: 'cassetto',
                            messaggio: 'SALVATAGGIO PERSO: spazio locale esaurito e nemmeno potando le copie ci sta. ' +
                                'Il vault su disco resta intatto. (' + (e2 && e2.message || '') + ')'
                        });
                        if (!_nuovo) window.MappAIErrori.controllaCassetto('salvataggio perso', true);
                    } catch (x) { }
                }
                if (_nuovo) {
                    let parla = false;
                    try { parla = this._cassettoPieno(pMeta); } catch (x) { parla = false; }
                    /* se il ramo del cassetto pieno parla (una finestra, o una scrittura
                       in volo che ne porterà una), il preavviso dell'80% su questa misura
                       sarebbe la seconda finestra sullo stesso guasto; se esce in
                       silenzio (generazione in corso, limite dei 60 s), il preavviso resta */
                    try {
                        if (parla) window.MappAIErrori.controllaCassetto('salvataggio perso', true, { preavviso: false });
                        else window.MappAIErrori.controllaCassetto('salvataggio perso', true);
                    } catch (x) { }
                    return;
                }
                if (window.showToast) window.showToast(window.t('tst_quota_piena',
                    'Spazio locale esaurito: il progetto NON è stato salvato. La mappa su disco (vault) resta intatta.'), 'error');
                return;
            }
        }

        if (reading) return { ok: true, projectId: this.currentProjectId };

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
        /* 0082 (§4.8): col cassetto solo indice acceso il `mm_*.json` nella radice di
           `Mappe/` non si scrive più — nessuno lo rilegge, e la cartella del progetto
           è la verità. Restano l'IPC e «Esporta JSON». Spento, come prima. */
        if (window.electronAPI && !soloIndice) {
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

    /* ── IL CASSETTO TIENE SOLO L'INDICE (0082, ADR 0018 revisione 2) ────────────
       Con `mappai_cassetto_solo_indice` = '1' (lettore unico:
       `MappAIVistaCore.cassettoSoloIndice`, che vale spento senza
       `mappai_cartella_completa` e nel reader) il salvataggio automatico scrive la
       cartella del progetto aperto dallo stato VIVO, ~10 s dopo che la mappa o le
       chat del Tutor sono cambiate e al più ogni 120 s come rete, e poi toglie la
       copia dal cassetto: resta la riga d'indice. Prima la cartella si scriveva solo
       a HOME, a ⌘Q, a fine generazione e con pochi altri gesti, e una modifica fatta
       dopo l'ultimo stava solo nella finestra e nella copia. Le regole sono pure
       (inv. 4, mappai-vista-core.js); qui l'I/O. Spento: niente di tutto questo.

       Il testo della COPIA, in un posto solo (inv. 6): quello che `_scrivi` mette nel
       cassetto e che `allineaCartella` ricorda nell'impronta. SNELLO (15/8): dopo il
       disegno D3 ogni arco porta dentro l'intero nodo di partenza e di arrivo —
       misurato su un foglio vero: 120 KB di link per 8,8 KB di dati. I link tornano
       coppie di id (il caricamento li accetta già così: è la forma dei vault).
       0076: con `mappai_cassetto_snello` = '1' la copia non porta ciò che è già
       nella cartella (la regola sta in MappAIVistaCore). */
    _testoCopia: function () {
        let snello = false;
        try { snello = localStorage.getItem('mappai_cassetto_snello') === '1'; } catch (e) { snello = false; }
        const VC = window.MappAIVistaCore;
        const daScrivere = (VC && VC.statoSnello)
            ? (snello ? VC.statoSnello(appState, { snello: true }) : VC.statoSnello(appState))
            : appState;
        return JSON.stringify(daScrivere);
    },

    /* L'IMPRONTA dell'ultima scrittura riuscita della cartella (in memoria, null
       all'avvio): { id, copia, chat, firma } — il testo della copia, quello delle
       chat e la loro firma in quell'istante. Dice se la cartella è indietro (sul
       testo, mai sulla presenza della copia) e se `_scrivi` può non rimettere una
       copia uscita. `_radice`: la radice dei file (`filesRootGet().rootDir`), letta
       una volta e tenuta, per il campo `cartella` della riga. `_firmaVista`: la firma
       delle chat vista per ultima da `_guardaChat`. `_rinvio`: il setTimeout di 10 s.
       `_alInVolo`: una scrittura sola in volo. `_cartellaDette`: le righe di
       registro già scritte nella sessione (una per percorso, una per progetto). */
    _impronta: null,
    _radice: null,
    _firmaVista: null,
    _rinvio: null,
    _alInVolo: false,
    _cartellaDette: {},

    /* §4.3 — il salvataggio automatico scrive la cartella e toglie la copia.
       1. pause: spento; revisione in ripristino o in errore; generazione; pipeline;
          cassetto pieno in volo; riapertura dalla cartella; una scrittura sua in
          volo; niente cartella, id o nodi (come `saveCurrentProject`); IPC mancanti.
       2. indietro? (sul testo della copia e delle chat). Se no e la copia c'è
          (rimasta dopo un rifiuto, o rimessa dal residuo del cassetto pieno), si
          prova SOLO a toglierla, con letture fresche di `index.yaml` e `Fonti/`.
       3. scrivibile? `index.yaml` c'è e non dichiara un altro progetto (la
          `saveVault` creerebbe la cartella che manca: inv. 20, ADR 0013).
       4. id, percorso, copia di T0, testo della copia, stato e chat nello STESSO
          giro della `saveVault`, senza attese in mezzo: una scrittura di HOME o ⌘Q
          arrivata durante il passo 3 non viene coperta da una più vecchia.
       5. riuscita (`success`, non `soloVista`): l'impronta; la copia si toglie solo
          alle condizioni di `copiaDaTogliere` (inv. 13). Non riuscita
          (`review-conflict` compreso): niente si toglie e l'impronta non cambia.
       6. nessuna finestra e nessun toast: il registro, una riga per percorso e una
          per progetto nella sessione. */
    allineaCartella: async function () {
        const VC = window.MappAIVistaCore;
        if (!(VC && VC.cassettoSoloIndice && VC.cassettoSoloIndice())) return;
        const api = window.electronAPI;
        const ferma = () => {
            if (typeof appState === 'undefined' || !appState) return true;
            if (appState.extractionMode === 'lettura') return true;
            if (appState._reviewRestoring || appState._reviewRestoreError) return true;
            try { if (window.MappAIGen && window.MappAIGen.attiva && window.MappAIGen.attiva()) return true; } catch (e) { return true; }
            try { if (window.MappAIPipeline && window.MappAIPipeline.occupata && window.MappAIPipeline.occupata()) return true; } catch (e) { return true; }
            if (this._cp && this._cp.inVolo) return true;
            if (this._apreDallaCartella) return true;
            if (!appState.activeVaultPath || !this.currentProjectId) return true;
            if (!appState.db || !Array.isArray(appState.db.nodes) || !appState.db.nodes.length) return true;
            return false;
        };
        if (this._alInVolo || ferma()) return;
        if (!api || !api.saveVault || !api.readVaultFile || !window.buildVaultMapData) return;

        const id = this.currentProjectId, percorso = appState.activeVaultPath;
        const nome = String(percorso).split(/[\\/]/).filter(Boolean).pop() || '';
        /* il registro: una riga per chiave nella sessione, col nome della cartella
           (mai il percorso intero: la riga viaggia nelle segnalazioni) */
        const registra = (chiave, msg) => {
            if (this._cartellaDette[chiave]) return;
            this._cartellaDette[chiave] = true;
            try { if (window.MappAIErrori && window.MappAIErrori.registra) window.MappAIErrori.registra({ dove: 'cassetto', messaggio: msg }); } catch (e) { }
        };
        /* passo 2: le chat come le scrive `buildVaultMapData` (typeof: nei test che
           ritagliano `StorageManager` il Tutor non c'è) */
        let chatOra;
        try {
            chatOra = (typeof tutorState !== 'undefined' && typeof serializeTutorState === 'function')
                ? JSON.stringify(serializeTutorState(tutorState)) : undefined;
        } catch (e) { chatOra = undefined; }
        const indietro = VC.cartellaIndietro(this._impronta, id, this._testoCopia(), chatOra);
        let copiaPrima = null;
        try { copiaPrima = localStorage.getItem(id); } catch (e) { copiaPrima = null; }
        if (!indietro && copiaPrima === null) return;

        const leggi = async (rel) => {
            let r = null;
            try { r = await api.readVaultFile({ vaultPath: percorso, relPath: rel }); } catch (e) { r = null; }
            if (!r || !r.ok) return null;
            try {
                return r.text != null ? String(r.text)
                    : new TextDecoder().decode(Uint8Array.from(atob(r.base64 || ''), c => c.charCodeAt(0)));
            } catch (e) { return null; }
        };
        /* i set della mappa (per id, distinti) che `save-vault` lascia fuori dalla
           cartella: la regola è quella di `MappAIFilesCore.setsDelVault`, non una
           copia (inv. 6). Senza il core nessuno dice che ci sono: restano «fuori». */
        const setsFuori = (sets, titolo) => {
            const tutti = Array.isArray(sets) ? sets.filter(Boolean) : [];
            if (!tutti.length) return 0;
            const FC = window.MappAIFilesCore;
            if (!FC || !FC.setsDelVault) return tutti.length;
            const dentro = FC.setsDelVault(tutti, titolo) || [];
            const chiave = s => (s && s.id != null) ? String(s.id).trim() : '';
            const idDentro = {};
            dentro.forEach(s => { const k = chiave(s); if (k) idDentro[k] = true; });
            const visti = {};
            let n = 0;
            tutti.forEach(s => {
                const k = chiave(s);
                if (k) { if (!idDentro[k] && !visti[k]) { visti[k] = true; n++; } }
                else if (dentro.indexOf(s) < 0) n++;
            });
            return n;
        };
        const MOTIVI = {
            'progetto': 'il progetto aperto è cambiato durante la scrittura',
            'copia-cambiata': 'la copia è cambiata durante la scrittura',
            'id': 'la cartella non dichiara l\'id del progetto',
            'fonti': 'la cartella non ha Fonti/ e ci sono fonti in memoria',
            'set': 'un set di domande resta fuori dalla cartella',
            'bozze': 'c\'è una bozza della revisione docente'
        };
        /* passo 5, l'uscita della copia: le condizioni lette ADESSO, e fra la lettura
           della copia e la sua uscita nessuna attesa */
        const togli = async (copiaT0, idConfermato, titolo) => {
            /* le fonti: ognuna nell'indice di `Fonti/` per id, col suo testo
               (`fontiCoperte`); quelle di `Allegati/` l'indice non le scrive
               (`vociScrivibili`). Senza il core delle fonti si chiedono tutte. */
            const FO = window.MappAIFontiCore;
            const tutte = Array.isArray(appState.sources) ? appState.sources.filter(Boolean) : [];
            const daCoprire = (FO && FO.vociScrivibili) ? FO.vociScrivibili(tutte) : tutte;
            let fontiOk = !daCoprire.length;
            if (!fontiOk) fontiOk = VC.fontiCoperte(await leggi('Fonti/fonti.json'), daCoprire);
            const st = appState;
            let copiaOra = null;
            try { copiaOra = localStorage.getItem(id); } catch (e) { copiaOra = undefined; }
            const d = VC.copiaDaTogliere({
                stessoProgetto: this.currentProjectId === id && !!st && st.activeVaultPath === percorso,
                copiaOra: copiaOra, copiaT0: copiaT0, idConfermato: idConfermato, fontiOk: fontiOk,
                setsFuori: setsFuori(st && st.db && st.db.studySets, titolo),
                bozze: !!(st && (st._reviewLocalDraft || st._reviewDiskDraft))
            });
            if (d.togli) {
                try { localStorage.removeItem(id); } catch (e) { }
                return;
            }
            /* una riga per motivo e per progetto nella sessione; i motivi passeggeri
               (il docente ha cambiato mappa o modificato durante la scrittura) non
               ne scrivono: al giro dopo la copia esce */
            if (['nessuna-copia', 'progetto', 'copia-cambiata'].indexOf(d.motivo) < 0) {
                registra('copia|' + d.motivo + '|' + id, 'Salvataggio automatico: la cartella «' + nome + '» è scritta, ma la copia del progetto resta ' +
                    'nella memoria rapida (' + (MOTIVI[d.motivo] || d.motivo) + ').');
            }
        };

        this._alInVolo = true;
        try {
            if (!this._radice && api.filesRootGet) {
                try { const info = await api.filesRootGet(); if (info && info.rootDir) this._radice = info.rootDir; } catch (e) { }
            }
            /* passo 3 */
            const DC = window.MappAIDocumentiCore;
            const indice = await leggi('index.yaml');
            const idLetto = (indice !== null && DC && DC.idDaIndice) ? DC.idDaIndice(indice) : '';
            const scrivibile = !!(DC && DC.idDaIndice) && VC.cartellaScrivibile(indice !== null, idLetto, id);
            if (!scrivibile) {
                registra('percorso|' + percorso, 'Salvataggio automatico: la cartella «' + nome + '» non si scrive (manca index.yaml, ' +
                    'o dichiara un altro progetto). La copia resta nella memoria rapida.');
                return;
            }
            if (this.currentProjectId !== id || appState.activeVaultPath !== percorso || ferma()) return;
            if (!indietro) {
                /* cartella pari, copia rimasta: si prova solo a toglierla */
                await togli(copiaPrima, idLetto === id, appState.rootNodeLabel);
                return;
            }
            /* passo 4: nello stesso giro, senza attese fino alla chiamata */
            let copiaT0 = null;
            try { copiaT0 = localStorage.getItem(id); } catch (e) { copiaT0 = null; }
            let testoCopia, mapData, testoChat, firma;
            try {
                testoCopia = this._testoCopia();
                firma = VC.firmaChat ? VC.firmaChat(window.tutorState) : null;
                mapData = window.buildVaultMapData();
                testoChat = JSON.stringify(mapData.tutorState);
            } catch (e) {
                registra('scrittura|' + id, 'Salvataggio automatico: la cartella «' + nome + '» NON è stata scritta (' + (e && e.message || '') + ').');
                return;
            }
            let res;
            try { res = await api.saveVault({ folderPath: percorso, mapData: mapData }); }
            catch (e) { res = { success: false, error: e && e.message }; }
            if (!res || !res.success || res.soloVista) {
                registra('scrittura|' + id, 'Salvataggio automatico: la cartella «' + nome + '» NON è stata scritta (' +
                    ((res && res.error) || (res && res.soloVista ? 'solo la vista' : '')) + '). La copia resta nella memoria rapida.');
                return;
            }
            this._impronta = { id: id, copia: testoCopia, chat: testoChat, firma: firma };
            this._firmaVista = firma;
            const FCc = window.MappAIFilesCore;
            const idConfermato = idLetto === id
                || (mapData.projectId === id && !!(FCc && FCc.idProgettoValido && FCc.idProgettoValido(id)));
            await togli(copiaT0, idConfermato, mapData.rootNodeLabel);
        } finally {
            this._alInVolo = false;
        }
    },

    /* §4.3-bis — IL RINVIO DI 10 S (B6 (a)): la cartella si scrive poco dopo
       l'ultima modifica, non solo al giro di 120 s (che resta come rete). Un rinvio
       solo per volta, azzerato e riarmato a ogni richiesta. Allo scadere, con una
       scrittura in volo si riarma; se una pausa del passo 1 ferma `allineaCartella`
       (generazione, pipeline, ripristino) non si riarma: ci pensa il giro di 120 s.
       Lo chiedono `_scrivi` (una copia diversa dall'impronta) e `_guardaChat`. */
    _chiediAllineamento: function () {
        const VC = window.MappAIVistaCore;
        if (!(VC && VC.cassettoSoloIndice && VC.cassettoSoloIndice())) return;
        if (this._rinvio !== null) { try { clearTimeout(this._rinvio); } catch (e) { } }
        this._rinvio = setTimeout(() => {
            this._rinvio = null;
            if (this._alInVolo) { this._chiediAllineamento(); return; }
            try {
                const p = this.allineaCartella();
                if (p && typeof p.catch === 'function') p.catch(e => console.warn('[Storage] allineaCartella:', e && e.message));
            } catch (e) { }
        }, 10000);
    },

    /* Lo sguardo sulle chat (B6 (a)), ogni 5 s da un setInterval qui sotto: le chat
       del Tutor non passano da `saveCurrentProject`, e una domanda al Tutor senza
       altre modifiche aspettava il giro di 120 s. Legge `window.tutorState` (lo
       stesso oggetto di `tutorState`, anche dopo `setTutorState`), ne fa la firma
       (pura, senza serializzare la storia) e, se è cambiata dall'ultima vista, la
       ricorda e chiede il rinvio. La prima volta la registra e basta. Spento, o con
       la revisione in ripristino: niente. */
    _guardaChat: function () {
        const VC = window.MappAIVistaCore;
        if (!(VC && VC.cassettoSoloIndice && VC.cassettoSoloIndice() && VC.firmaChat)) return;
        if (typeof appState === 'undefined' || !appState || appState._reviewRestoring) return;
        const ts = window.tutorState;
        if (ts === undefined) return;
        const f = VC.firmaChat(ts);
        if (this._firmaVista === null) { this._firmaVista = f; return; }
        if (f === this._firmaVista) return;
        this._firmaVista = f;
        this._chiediAllineamento();
    },

    /* «Riprendi» dalla cartella (ad acceso, revisione avversaria del 07/10):
       `directLoadVault` azzera lo stato di generazione della mappa di prima (0078,
       `azzeraGenerazione`), `generationDiscipline` compresa. Senza, in `index.yaml`
       vincerebbe la disciplina ATTIVA del docente (`_contestoDellaMappa`), e la
       scrittura automatica ~10 s dopo la riapertura la metterebbe nella cartella di
       una mappa di un'altra materia. Si rimette quella di QUESTO progetto: la `disc`
       della sua riga, o quella che la cartella dichiara (`vaultMateria`). Solo se il
       progetto aperto è ancora questo e la disciplina è vuota. */
    _disciplinaDellaRiga: function (id, disc) {
        try {
            if (this.currentProjectId !== id || typeof appState === 'undefined' || !appState || appState.generationDiscipline) return;
            const d = disc || appState.vaultMateria || '';
            if (d) appState.generationDiscipline = d;
        } catch (e) { }
    },

    /* B4 (a) — chi dopo «Riprendi» agisce sulla mappa (ELABORA apre i documenti,
       INSEGNA Lavagna o Live) passa da qui, così la regola sta in un posto solo
       (inv. 6). Col cassetto solo indice acceso un progetto senza copia si apre dalla
       cartella e la mappa cambia dopo la lettura del disco: `fn` aspetta la promessa
       di `loadProject` (anche rifiutata). Spento, o senza promessa: `fn` subito,
       come prima. */
    dopoApertura: function (promessa, fn) {
        const VC = window.MappAIVistaCore;
        let acceso = false;
        try { acceso = !!(VC && VC.cassettoSoloIndice && VC.cassettoSoloIndice()); } catch (e) { acceso = false; }
        if (acceso && promessa && typeof promessa.then === 'function') promessa.then(fn, fn);
        else fn();
    },

    /* ── IL CASSETTO PIENO (0076, ADR 0018 punto 4) ─────────────────────────
       Il toast di prima («NON è stato salvato… il vault resta intatto») sbagliava
       in tutte e due le direzioni: il salvataggio automatico non scrive la
       cartella, quindi il lavoro dopo l'ultimo gesto che l'aveva scritta stava
       solo nella finestra aperta. Qui, a interruttore acceso:
         1. si scrive la cartella del progetto aperto — una scrittura sola in
            volo, non più di una ogni 60 s (saveCurrentProject scatta a ogni
            `renderGraph`), mai durante una generazione o una pipeline (la
            scriveranno loro alla fine), e MAI con `ensureProjectVault`, che
            richiama saveCurrentProject;
         2. scritta (e non `soloVista`, il reader): al posto della copia vecchia
            il RESIDUO (B1 rivisto, Giacomo, 05/10: `_posaResiduo` qui sotto), e
            la finestra che lo dice;
         3. non scritta, o senza cartella, o la cartella non risponde entro 60 s:
            la finestra che dice che il progetto non è salvato. Le due finestre
            una volta per PROGETTO ciascuna, nella sessione.
       Cartella, id e residuo si fissano QUI, all'inizio (inv. 20-bis): il
       residuo è la copia dello stesso istante della mappa scritta nella cartella.
       Ritorna true se il ramo PARLA (una finestra adesso, o una scrittura in volo
       che ne porterà una); false se esce in silenzio. */
    _cp: { inVolo: false, inVoloId: null, ultima: 0, dette: {} },
    _cassettoPieno: function (pMeta) {
        const cp = this._cp;
        const T = (k, f) => (window.t ? window.t(k, f) : f);
        const id = this.currentProjectId;
        const registra = (msg) => {
            if (!window.MappAIErrori) return;
            try { window.MappAIErrori.registra({ dove: 'cassetto', messaggio: msg }); } catch (x) { }
        };
        const finestra = (quale) => {
            const chiave = id + '|' + quale;
            if (cp.dette[chiave]) return;
            cp.dette[chiave] = true;
            const MM = window.MappAIModal;
            if (!MM || !MM.conferma) return;
            /* una finestra sul cassetto si è vista: il preavviso dell'80% in questa
               sessione sarebbe la seconda sullo stesso guasto */
            try { if (window.MappAIErrori && window.MappAIErrori.segnaFinestraCassetto) window.MappAIErrori.segnaFinestraCassetto(); } catch (x) { }
            const si = quale === 'salvato';
            MM.conferma({
                titolo: si ? T('cp_salvato_t', 'Memoria rapida piena') : T('cp_non_salvato_t', 'Progetto non salvato'),
                icona: si ? 'hard-drive' : 'alert-triangle',
                testo: si
                    ? T('cp_salvato', 'Il tuo lavoro è salvato nella cartella. L\'app ha solo finito la memoria rapida.')
                    : T('cp_non_salvato', 'Questo progetto non è stato salvato: la memoria rapida dell\'app è piena e non sono riuscito a scrivere la cartella.'),
                conferma: T('cp_libera', 'Libera spazio ora'),
                annulla: T('cp_chiudi', 'Chiudi')
            }).then(ok => { if (ok && window.openCabina) window.openCabina('profilo', { sezione: 'pr-cartelle' }); }, () => { });
        };
        const percorso = appState.activeVaultPath;
        if (!percorso) { finestra('non-salvato'); return true; }
        if (cp.inVolo) {
            /* la scrittura in volo è di un ALTRO progetto: la seconda non parte (mai
               due in volo), ma questo progetto non resta muto — non è salvato */
            if (cp.inVoloId !== id) finestra('non-salvato');
            return true;
        }
        if ((window.MappAIGen && window.MappAIGen.attiva && window.MappAIGen.attiva()) ||
            (window.MappAIPipeline && window.MappAIPipeline.occupata && window.MappAIPipeline.occupata())) return false;
        const ora = Date.now();
        if (cp.ultima && ora - cp.ultima < 60000) return false;
        const api = window.electronAPI;
        if (!api || !api.saveVault || !window.buildVaultMapData) { finestra('non-salvato'); return true; }
        let mapData, residuoTesto = null;
        const quando = new Date(ora).toISOString();
        try { mapData = window.buildVaultMapData(); } catch (e) { finestra('non-salvato'); return true; }
        try {
            const VCc = window.MappAIVistaCore;
            if (VCc && VCc.residuo && VCc.statoSnello) {
                residuoTesto = JSON.stringify(VCc.residuo(VCc.statoSnello(appState, { snello: true }), { cartella: percorso, quando: quando }));
            }
        } catch (e) { residuoTesto = null; }   // senza residuo si va al ripiego: la copia vecchia resta
        /* La copia nel cassetto a T0, quando la scrittura parte (e se il progetto
           ha una riga d'indice): il residuo si posa SOLO sopra questa. Se intanto è
           arrivata una copia più nuova (si è liberato spazio) o il progetto è stato
           eliminato, il residuo di T0 non deve schiacciarla né farlo rinascere. */
        let copiaT0 = null, rigaT0 = false;
        try { copiaT0 = localStorage.getItem(id); } catch (x) { copiaT0 = null; }
        try { rigaT0 = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []).some(p => p && p.id === id); } catch (x) { rigaT0 = false; }
        cp.inVolo = true;
        cp.inVoloId = id;
        cp.ultima = ora;
        /* La guardia «una sola in volo» si scioglie solo quando la scrittura si
           CHIUDE; la finestra invece non aspetta oltre 60 s: una cartella che non
           risponde (disco esterno staccato, IPC appeso) altrimenti lascerebbe ogni
           cassetto pieno di qui in poi senza una parola. Una risposta che arriva
           DOPO il tetto vale ancora: se la cartella è stata scritta, il residuo si
           posa e la finestra dice «salvato» — la «non salvato» del tetto non resta
           l'ultima parola, sbagliata. */
        let tetto = null, scaduto = false;
        const esito = (res, inRitardo) => {
            if (res && res.soloVista) {
                /* il reader: `vista.json` non è la mappa — il messaggio di oggi */
                if (!inRitardo && window.showToast) window.showToast(T('tst_quota_piena',
                    'Spazio locale esaurito: il progetto NON è stato salvato. La mappa su disco (vault) resta intatta.'), 'error');
                return;
            }
            if (!res || !res.success) {
                /* `review-conflict` compreso: per chi lavora è «non scritta» */
                registra('Cassetto pieno: la cartella NON è stata scritta. (' + ((res && res.error) || '') + ')');
                if (!inRitardo) finestra('non-salvato');
                return;
            }
            const posato = this._posaResiduo(id, percorso, residuoTesto, pMeta, quando, { copia: copiaT0, riga: rigaT0 });
            if (posato !== 'sparita') finestra('salvato');
        };
        Promise.resolve()
            .then(() => api.saveVault({ folderPath: percorso, mapData: mapData }))
            .then(res => res, err => ({ success: false, error: err && err.message }))
            .then(res => {
                cp.inVolo = false;
                cp.inVoloId = null;
                if (tetto !== null) { try { clearTimeout(tetto); } catch (x) { } }
                esito(res, scaduto);
            });
        tetto = setTimeout(() => {
            scaduto = true;
            registra('Cassetto pieno: la cartella non ha risposto in 60 s («' + percorso + '»). La scrittura resta in volo.');
            finestra('non-salvato');
        }, 60000);
        return true;
    },

    /* ── IL RESIDUO AL POSTO DELLA COPIA (0076, B1 rivisto) ──────────────────
       La copia di prima riaprirebbe i nodi vecchi, e al primo HOME la cartella
       si riscriverebbe col vecchio; toglierla e basta perdeva ciò che la
       cartella non ha (le fonti, una foto non ancora lanciata, le pagine) e
       rendeva irraggiungibile una cartella fuori da `Mappe/`. Quindi:
         · il RESIDUO si scrive SOPRA la copia (un `setItem` solo: mai un momento
           in cui la copia non c'è), poi l'indice (inv. 18, «copia, poi indice»);
         · se il residuo non entra, la copia vecchia resta INTERA e la riga
           d'indice prende il segno «superata» col percorso esatto e l'impronta
           della copia (la sua lunghezza: se la copia viene riscritta dopo, il
           segno non vale più);
         · se non entra nemmeno l'indice: una riga nel registro, e si resta come
           oggi;
         · e tutto questo SOLO se la copia è ancora quella di quando la scrittura
           è partita (`t0` = { copia, riga }): una copia più nuova non si schiaccia,
           un progetto eliminato non rinasce. Allora niente, e l'indice non si
           tocca: una riga nel registro.
       → 'residuo' | 'superata' | 'nessuno' | 'cambiata' | 'sparita' */
    _posaResiduo: function (id, percorso, residuoTesto, pMeta, quando, t0) {
        let copiaPrima = null;
        try { copiaPrima = localStorage.getItem(id); } catch (x) { copiaPrima = null; }
        let P = null;
        try { P = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []; } catch (x) { P = null; }
        if (t0) {
            const rigaOra = !!(P && P.some(p => p && p.id === id));
            const sparita = (t0.copia !== null && copiaPrima === null) || (t0.riga && !rigaOra);
            if (sparita || copiaPrima !== t0.copia) {
                if (window.MappAIErrori) {
                    try {
                        window.MappAIErrori.registra({ dove: 'cassetto', messaggio: 'Cassetto pieno: la copia è cambiata (o il progetto è ' +
                            'stato eliminato) mentre si scriveva la cartella: niente residuo, l\'indice non si tocca.' });
                    } catch (y) { }
                }
                return sparita ? 'sparita' : 'cambiata';
            }
        }
        let posato = false;
        if (residuoTesto) {
            try { localStorage.setItem(id, residuoTesto); posato = true; } catch (x) { posato = false; }
        }
        if (posato) {
            if (P && pMeta && pMeta.id === id) {
                try {
                    const i = P.findIndex(p => p && p.id === id);
                    if (i >= 0) P[i] = pMeta; else P.push(pMeta);
                    P.sort((a, b) => b.date - a.date);
                    localStorage.setItem('tutor_ai_projects', JSON.stringify(P));
                } catch (x) { /* l'indice di prima resta: il residuo porta da sé il percorso */ }
            }
            return 'residuo';
        }
        try {
            if (!P) throw new Error('indice illeggibile');
            const segno = { cartella: percorso, quando: quando, copia: copiaPrima ? copiaPrima.length : 0 };
            const i = P.findIndex(p => p && p.id === id);
            if (i >= 0) P[i] = Object.assign({}, P[i], { superata: segno });
            else if (pMeta && pMeta.id === id) P.push(Object.assign({}, pMeta, { superata: segno }));
            else throw new Error('nessuna riga d\'indice');
            localStorage.setItem('tutor_ai_projects', JSON.stringify(P));
            return 'superata';
        } catch (x) {
            if (window.MappAIErrori) {
                try {
                    window.MappAIErrori.registra({ dove: 'cassetto', messaggio: 'Cassetto pieno: la cartella è scritta, ma né il residuo né il segno ' +
                        '«superata» entrano nella memoria rapida: alla riapertura si aprirà la copia di prima. (' + (x && x.message || '') + ')' });
                } catch (y) { }
            }
            return 'nessuno';
        }
    },

    loadProject: async function (id) {
    /* ⚠️ Non si cambia mappa mentre la pipeline lavora (13/8): i suoi passi
       leggono `appState` mentre scrivono in una cartella fissata all'inizio —
       caricarne un'altra farebbe finire i materiali della mappa nuova nel vault
       della vecchia, in silenzio. Il velo copre la sola area di CREA apposta,
       per lasciar GIRARE per l'app: guardare sì, sostituire no. */
    if ((window.mappaiOccupato && window.mappaiOccupato()) || appState._reviewRestoring || this._apreDallaCartella) return false;
        /* 0076: lo stato di prima, finché una riapertura dalla cartella (residuo o
           copia «superata») non è riuscita — per rimetterlo se qualcosa si ferma */
        let prima = null;
        /* 0082 (§4.5-4.6): l'interruttore del cassetto solo indice (lettore unico nel
           core della vista) e la classe della RIGA, letta qui in testa: dopo, il
           primo salvataggio col primo disegno scriverebbe la classe attiva in una
           riga che non ne ha (`clsId` di `saveCurrentProject`), e la cartella che
           manca nascerebbe sotto la classe sbagliata. Nessuna attesa in più. */
        const soloIndice = !!(window.MappAIVistaCore && window.MappAIVistaCore.cassettoSoloIndice
            && window.MappAIVistaCore.cassettoSoloIndice());
        let clsDellaRiga = null, discDellaRiga = null;
        try {
            const r0 = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []).find(x => x && x.id === id);
            clsDellaRiga = (r0 && r0.clsId) || null;
            discDellaRiga = (r0 && r0.disc) || null;
        } catch (e) { clsDellaRiga = null; discDellaRiga = null; }
        try {
            // 0070: nessuna fotografia locale per lettura, anche a flag spento.
            // Si controlla l'identità sul disco prima di adottare il progetto;
            // un'eventuale vecchia copia locale non precede mai la cartella.
            const indexRows = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            const readingRows = Array.isArray(indexRows) ? indexRows.filter(p => p && p.id === id) : [];
            const readingMeta = readingRows.find(p => p.type === 'lettura');
            if (readingMeta) {
                const fail = () => { throw new Error(window.t('pl_read_failed', 'Il testo salvato non è leggibile.')); };
                if (readingRows.length !== 1 || typeof readingMeta.vaultPath !== 'string' || !readingMeta.vaultPath || !readingMeta.reading) fail();
                if (!window.electronAPI || !window.electronAPI.loadVault || !window.MappAIPercorsoLettura || !window.MappAIPercorsoLettura.openVault) {
                    throw new Error(window.t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'));
                }
                const previousState = appState, previousDb = appState.db, previousPath = appState.activeVaultPath, previousId = this.currentProjectId;
                let disk;
                this._apreDallaCartella = true;
                try { disk = await window.electronAPI.loadVault(readingMeta.vaultPath); }
                finally { this._apreDallaCartella = false; }
                if (appState !== previousState || appState.db !== previousDb || appState.activeVaultPath !== previousPath || this.currentProjectId !== previousId) {
                    throw new Error(window.t('pl_stale', 'Il progetto è cambiato. Riapri il percorso prima di continuare.'));
                }
                const ptr = disk && disk.data && disk.data._pipelineManifest && disk.data._pipelineManifest.reading;
                if (!disk || !disk.success || disk.data.extractionMode !== 'lettura' || disk.data.projectId !== id || !ptr || ptr.projectId !== id ||
                    ptr.percorsoId !== readingMeta.reading.percorsoId || ptr.sourceId !== readingMeta.reading.sourceId || ptr.sourcePath !== readingMeta.reading.sourcePath) fail();
                await window.MappAIPercorsoLettura.openVault({ folderPath: readingMeta.vaultPath, data: disk.data });
                return true;
            }
            const data = localStorage.getItem(id);
            /* Senza snapshot ma con un VAULT, la mappa non è persa: si apre
               dalla cartella (15/8). È il ripiego che rende innocua una futura
               pulizia del cassetto — e già oggi una voce può restare senza
               foglio (quota piena, pulizia a mano di localStorage). */
            if (!data) {
                try {
                    const p = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || [])
                        .find(x => x && x.id === id);
                    /* 0076 (B1): una riga «superata» porta il percorso ESATTO della
                       cartella scritta a cassetto pieno — anche fuori da `Mappe/`,
                       dove la ricerca per nome qui sotto non arriva */
                    if (p && p.superata && p.superata.cartella && window.directLoadVault) {
                        if (soloIndice) {
                            /* 0082 (B4 (a)): acceso, si risponde DOPO l'apertura */
                            try { await window.directLoadVault(String(p.superata.cartella)); } catch (e) { }
                            this._disciplinaDellaRiga(id, p.disc);
                            return true;
                        }
                        window.directLoadVault(String(p.superata.cartella));
                        return true;
                    }
                    /* 0082 (§4.5): col cassetto solo indice acceso la copia esce quando la
                       cartella è scritta, e «Riprendi» senza copia diventa la strada di
                       ogni giorno. L'ordine, alla prima che risponde:
                         1. il segno «superata» (0076), qui sopra;
                         2. l'ID: la cartella che dichiara il `projectId` della riga, se è
                            una sola (inv. 20, ADR 0013: l'id prima del percorso);
                         3. il campo `cartella` della riga, riportato a percorso intero, se
                            è una mappa di questo progetto (`index.yaml` c'è e non dichiara
                            un altro id: mai la cartella di una classe) — anche fuori da
                            `Mappe/`, dove l'elenco non arriva;
                         4. la POSIZIONE e il ripiego, come prima.
                       E si risponde DOPO `directLoadVault` (B4 (a)): ELABORA e INSEGNA
                       aspettano la mappa. Se l'apertura non riesce si risponde `true` lo
                       stesso (`directLoadVault` non ha un esito: limite dichiarato fino
                       ad A4). Spento: l'ordine e i tempi di prima, qui sotto. */
                    /* La POSIZIONE, per le due strade. NFC sui due lati: il nome viene
                       dal DISCO (scomposto) e p.vault dalla memoria (composto) — guida
                       §8.25 */
                    const _n = (x) => (window.MappAITeachCore && window.MappAITeachCore.nfc)
                        ? window.MappAITeachCore.nfc(x) : String(x == null ? '' : x);
                    const stessaPos = (v) => v && _n(v.folderName) === _n(p.vault)
                        && _n(v.classDir || '') === _n(p.classDir || '')
                        && _n(v.discDir || '') === _n(p.discDir || '') && !v.studentDir;
                    const api0 = window.electronAPI;
                    if (soloIndice && p && api0 && api0.filesRootGet && window.directLoadVault) {
                        const apri = async (fp) => { try { await window.directLoadVault(fp); } catch (e) { } this._disciplinaDellaRiga(id, p.disc); return true; };
                        let all = [];
                        if (api0.getAllVaults) { try { all = (await api0.getAllVaults()) || []; } catch (e) { all = []; } }
                        const sue = all.filter(v => v && v.projectId === id && v.fullPath);
                        if (sue.length === 1) return await apri(sue[0].fullPath);
                        let info = null;
                        const radice = async () => {
                            if (this._radice) return this._radice;
                            try { info = info || (await api0.filesRootGet()); } catch (e) { info = null; }
                            if (info && info.rootDir) this._radice = info.rootDir;
                            return this._radice || null;
                        };
                        const VCr = window.MappAIVistaCore, DCr = window.MappAIDocumentiCore;
                        if (p.cartella && VCr.percorsoDaRiga && api0.readVaultFile && DCr && DCr.idDaIndice) {
                            const fp = VCr.percorsoDaRiga(p.cartella, await radice());
                            if (fp) {
                                let r = null;
                                try { r = await api0.readVaultFile({ vaultPath: fp, relPath: 'index.yaml' }); } catch (e) { r = null; }
                                let testo = null;
                                if (r && r.ok) {
                                    try {
                                        testo = r.text != null ? String(r.text)
                                            : new TextDecoder().decode(Uint8Array.from(atob(r.base64 || ''), c => c.charCodeAt(0)));
                                    } catch (e) { testo = null; }
                                }
                                if (testo !== null) {
                                    const idLetto = DCr.idDaIndice(testo);
                                    if (!idLetto || idLetto === id) return await apri(fp);
                                }
                            }
                        }
                        if (p.vault) {
                            const hit = all.find(stessaPos);
                            if (hit && hit.fullPath) return await apri(hit.fullPath);
                            try { info = info || (await api0.filesRootGet()); } catch (e) { info = null; }
                            if (!info || !info.mapsBaseDir) return true;
                            const FC = window.MappAIFilesCore;
                            const parents = (FC && FC.mapVaultParents) ? FC.mapVaultParents(p.classDir || '', p.discDir || '') : [];
                            return await apri([info.mapsBaseDir].concat(parents, [p.vault]).join('/'));
                        }
                        return false;
                    }
                    if (p && p.vault && window.electronAPI && window.electronAPI.filesRootGet && window.directLoadVault) {
                        /* La POSIZIONE la dice il disco (get-all-vaults), non si
                           ricostruisce a mano: dal 15/8 sera un vault senza classe
                           può stare in Mappe/Generico/ oppure piatto (preesistente),
                           e solo l'elenco sa quale dei due. Ripiego: il nesting di
                           FilesCore, se l'elenco non è disponibile. */
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

            const loadedState = JSON.parse(data);
            if (!loadedState) return false;

            /* L'identità della voce che si riapre, decisa dalla cartella letta (0061,
               ADR 0013, gesto `voce`). Una funzione sola per la lettura di sempre e per
               quella anticipata del residuo qui sotto. */
            const decidiVoce = (disk, vaultPath, st) => {
                const TCv = window.MappAITeachCore;
                return (TCv && TCv.identitaDellaCartella)
                    ? TCv.identitaDellaCartella(JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]'), {
                        gesto: 'voce', idCartella: disk.data && disk.data.projectId, idAttuale: id, fullPath: vaultPath,
                        pos: { vault: String(vaultPath).split(/[\\/]/).filter(Boolean).pop() || null,
                            classDir: st.activeVaultClassDir || null, discDir: st.activeVaultDiscDir || null }
                    })
                    : { stacca: false, scrivi: false };
            };

            /* 0076 (B1 rivisto: il residuo). Se la copia è un RESIDUO (scritto a
               cassetto pieno dopo la cartella), o se la riga d'indice la dichiara
               «superata» dalla cartella e l'impronta torna (la copia non è stata
               riscritta dopo), la MAPPA — nodi e collegamenti — si legge dalla
               cartella al percorso ESATTO del segno, anche fuori da `Mappe/`; il
               resto (fonti, foto in attesa, pagine, rapporti) viene dalla copia.
               La lettura è quella che questa funzione fa già (`loadVault` qui
               sotto), con la sua decisione d'identità e `R.restore`: nessuna strada
               nuova. Vale anche a interruttore spento: un residuo già scritto si
               riapre comunque. Il segno non entra nello stato: al salvataggio dopo
               la copia torna normale. */
            let dallaCartella = null, daResiduo = false;
            try {
                const res = loadedState._residuo;
                if (res && typeof res === 'object' && res.cartella) {
                    dallaCartella = String(res.cartella); daResiduo = true;
                } else {
                    const riga = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []).find(x => x && x.id === id);
                    const sup = riga && riga.superata;
                    if (sup && sup.cartella && sup.copia === data.length) dallaCartella = String(sup.cartella);
                }
            } catch (e) { dallaCartella = null; daResiduo = false; }
            delete loadedState._residuo;
            /* La cartella si legge e si controlla PRIMA di toccare la sessione: un
               residuo non ha la mappa, e se la sua cartella non si legge, è vuota o
               dichiara un altro progetto, non c'è niente da aprire — lo si dice e la
               sessione resta COM'ERA (stesso stato, stessa identità, stessa
               cartella). Prima lo stato si sostituiva e poi si controllava: restava
               una mappa vuota puntata sulla cartella, e HOME l'avrebbe scritta lì.
               Una copia «superata» che non regge si apre come oggi. */
            let letto = null;
            if (dallaCartella) {
                let motivo = null;
                this._apreDallaCartella = true;
                try {
                    const CAMPI = window.MappAIVistaCore && window.MappAIVistaCore.CAMPI_DALLA_CARTELLA;
                    if (!CAMPI || !(window.electronAPI && window.electronAPI.loadVault)) {
                        motivo = window.t ? window.t('cp_residuo_vuota', 'la sua cartella non ha la mappa, e la memoria rapida nemmeno.')
                            : 'la sua cartella non ha la mappa, e la memoria rapida nemmeno.';
                    } else {
                        let disk = null;
                        try { disk = await window.electronAPI.loadVault(dallaCartella); } catch (e) { disk = { success: false, error: e && e.message }; }
                        if (!disk || !disk.success) motivo = (disk && disk.error) || 'Impossibile leggere la cartella del progetto';
                        else {
                            const deciso = decidiVoce(disk, dallaCartella, loadedState);
                            if (deciso.stacca) {
                                motivo = window.t ? window.t('cp_residuo_altra', 'la sua cartella ora dichiara un altro progetto, e la memoria rapida non ha la mappa.')
                                    : 'la sua cartella ora dichiara un altro progetto, e la memoria rapida non ha la mappa.';
                            } else if (!((disk.data && disk.data.nodes) || []).length) {
                                motivo = window.t ? window.t('cp_residuo_vuota', 'la sua cartella non ha la mappa, e la memoria rapida nemmeno.')
                                    : 'la sua cartella non ha la mappa, e la memoria rapida nemmeno.';
                            } else letto = { disk: disk, deciso: deciso, campi: CAMPI };
                        }
                    }
                } finally { this._apreDallaCartella = false; }
                if (motivo) {
                    if (daResiduo) {
                        console.error('[Storage] riapertura dal residuo non riuscita («' + dallaCartella + '»): ' + motivo);
                        window.showAlert("Errore Caricamento", "Impossibile caricare il progetto: " + motivo);
                        window.showLoadingOverlay(false);
                        return false;
                    }
                    dallaCartella = null;
                }
            }
            if (dallaCartella) loadedState.activeVaultPath = dallaCartella;

            // Vista studio (1/8): stessa guardia di backToLanding/importGraph/
            // loadMapVault/directLoadVault — senza, l'overlay resterebbe attivo
            // (S.active true, tab visibile) su un canvas ricostruito da zero e
            // il primo tocco del pannello lancerebbe un TypeError.
            // (0076: dopo la lettura anticipata, così una riapertura fermata non
            // tocca nemmeno la vista di chi sta lavorando.)
            if (window.MappAIStudioView && appState.layoutMode === 'studio') {
                window.MappAIStudioView.exit();
                appState.layoutMode = 'default';
            }

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

            // Lo snapshot descrive il progetto, non il provider del prossimo giro B2.
            if (window.MappAIModelli && window.MappAIModelli.acceso()) {
                const usage = loadedState.generationUsage || {};
                loadedState.generationUsage = Object.assign({}, usage, {
                    provenienzaMappa: usage.provenienzaMappa || {
                        provider: usage.usedProvider || loadedState.aiProvider || '',
                        model: usage.usedModel || loadedState.aiModel || ''
                    }
                });
                loadedState.aiProvider = appState.aiProvider || localStorage.getItem('ai_provider') || 'google';
            }

            // Overwrite global appState
            loadedState._reviewRestoring = true;
            delete loadedState._reviewRestoreError;
            delete loadedState._reviewCommit;
            if (letto) prima = { stato: appState, id: this.currentProjectId, ic: this.idInCartella,
                sim: (typeof simulation !== 'undefined') ? simulation : null };
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
            /* 0061, 30/09: la voce che si apre non eredita la cartella adottata dalla mappa
               di prima (inv. 20-bis) — nemmeno quando la sua cartella non c'è più e il
               caricamento si ferma qui sotto. La decide, se c'è, il gesto `voce`. */
            this.idInCartella = null;

            /* 0078 (§4.3-4.4, interruttore `mappai_cartella_completa`, lettore unico nel
               core della vista): la copia del cassetto non ha mai portato le chat del
               Tutor (sono del modulo, non di `appState`), quindi dopo «Riprendi» restavano
               quelle della mappa di prima — e la `saveVault` dopo le scriveva nella
               cartella di questa. Acceso, nei tre rami qui sotto il Tutor riceve le chat
               della cartella di QUESTO progetto, o nessuna; e la cartella sua che non ha
               `Fonti/` la riceve in fondo. Spento: come prima. */
            const cartellaCompleta = !!(window.MappAIVistaCore && window.MappAIVistaCore.cartellaCompleta
                && window.MappAIVistaCore.cartellaCompleta());
            let cartellaSua = null;   // la cartella che si è rivelata di questo progetto

            // Il manifest sul disco precede quello della cache. L'eventuale
            // bozza locale viene riconciliata dal controller prima di render e
            // autosave; una revisione di un altro progetto non viene ereditata.
            if (appState.activeVaultPath && window.electronAPI && window.electronAPI.loadVault) {
                const vaultPath = appState.activeVaultPath;
                /* 0076: dalla cartella (residuo, «superata») la lettura è già stata
                   fatta e controllata qui sopra: non se ne fa una seconda */
                const disk = letto ? letto.disk : await window.electronAPI.loadVault(vaultPath);
                if (!disk || !disk.success) throw new Error((disk && disk.error) || 'Impossibile leggere la cartella del progetto');
                /* 0061 (29/09, ADR 0013) — il gesto `voce`: la voce riaperta porta con sé
                   la sua cartella, e l'id resta quello della voce. Ma se la cartella
                   DICHIARA un altro id, è di un'altra mappa: è la porta da cui l'11/9 una
                   mappa vecchia è entrata nella cartella della nuova (HOME e l'uscita ci
                   avrebbero scritto la mappa della voce). Allora la voce la lascia: la
                   mappa si apre senza cartella, il manifest di quella cartella non si
                   ripristina (è dell'altra mappa), e il backfill qui sotto non parte.
                   Senza id nella cartella, l'id ci si scrive solo se la voce aperta è
                   quella che la posizione riconosce (bivio 2 = A). La posizione viene
                   dalla fotografia: nessuna chiamata in più. */
                const deciso = letto ? letto.deciso : decidiVoce(disk, vaultPath, appState);
                if (deciso.stacca) {
                    console.warn('[Storage] la cartella «' + vaultPath + '» dichiara ' + disk.data.projectId +
                        ', non ' + id + ': la voce si apre senza cartella (0061)');
                    appState.activeVaultPath = null;
                    appState.activeVaultClassDir = null;
                    appState.activeVaultDiscDir = null;
                    appState._pipelineManifest = null;
                    delete appState._reviewRevision;
                    this.idInCartella = null;
                    /* 0078: le chat di quella cartella sono dell'altra mappa */
                    if (cartellaCompleta && window.setTutorState) window.setTutorState(null);
                    var staccata = true;   // `var`: la legge il backfill più sotto, fuori da questo blocco
                } else {
                    this.idInCartella = { percorso: vaultPath, id: deciso.scrivi ? id : null };
                    /* 0076: la mappa dalla cartella, prima di `R.restore`: i campi che il
                       residuo non porta, nell'elenco UNO del core (inv. 6) */
                    if (letto) letto.campi.forEach(k => { appState.db[k] = (disk.data && disk.data[k]) || []; });
                    if (window.MappAIReview && window.MappAIReview.restore) {
                        await window.MappAIReview.restore(vaultPath, disk.data._pipelineManifest || null, { fromCache: true, diskData: disk.data });
                    } else if (disk.data._pipelineManifest?.review) throw new Error('Revisione non disponibile: caricamento interrotto');
                    else { appState._pipelineManifest = disk.data._pipelineManifest || null; delete appState._reviewRevision; }
                    /* 0078: le chat di QUESTA mappa, dalla stessa lettura della cartella
                       (anche quella anticipata del residuo: nessuna seconda). DOPO il
                       ripristino della revisione: se lancia, il residuo rimette la mappa di
                       prima e il Tutor non è stato toccato. Senza chat nella cartella,
                       nessuna: mai quelle della mappa di prima. */
                    if (cartellaCompleta) {
                        if (window.setTutorState) window.setTutorState((disk.data && disk.data.tutorState) || null);
                        cartellaSua = vaultPath;
                    }
                }
            } else {
                appState._pipelineManifest = null;
                delete appState._reviewRevision;
                /* 0078: nessuna cartella, nessuna chat da rimettere: il Tutor si azzera */
                if (cartellaCompleta && window.setTutorState) window.setTutorState(null);
            }
            appState._reviewRestoring = false;
            prima = null;   // 0076: la riapertura è riuscita, da qui vale il percorso di sempre

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
            /* 0061 (29/09, D7; ADR 0013): prima di crearne una, si cerca la cartella
               che dichiara GIÀ l'id di questa voce — una voce che non ha fatto in tempo
               a dichiararla (uscita forzata durante la pipeline), o già riordinata
               senza che la fotografia lo sapesse. Se ce n'è esattamente una, si apre
               quella (gesto `apri`) invece di farne una « · 02». Non parte per una
               voce che ha appena lasciato la cartella di un'altra mappa (`staccata`). */
            if (!appState.activeVaultPath && window.ensureProjectVault && !staccata) {
                /* 0082 (B1 (a), §4.6): acceso, la cartella nasce con la classe della
                   riga letta in testa (null = Generico); spento, come prima */
                const apertura = soloIndice ? { reason: 'open', clsId: clsDellaRiga } : { reason: 'open' };
                /* gate 3 del 08/10, gesto (6): la cartella nasce sotto la disciplina del
                   progetto (`generationDiscipline`, da `ensureProjectVault`). Una copia nata
                   da un'apertura dalla cartella l'ha azzerata (0078): si rimette quella della
                   riga, o quella che la copia ricorda (`vaultMateria`). Solo se è vuota. */
                if (soloIndice) this._disciplinaDellaRiga(id, discDellaRiga);
                setTimeout(() => {
                    try {
                        const FCb = window.MappAIFilesCore;
                        if (window.electronAPI && window.electronAPI.getAllVaults && FCb && FCb.idProgettoValido && FCb.idProgettoValido(id)) {
                            window.electronAPI.getAllVaults().then(all => {
                                const sue = (all || []).filter(v => v && v.projectId === id && v.fullPath);
                                if (sue.length === 1 && window.directLoadVault) window.directLoadVault(sue[0].fullPath);
                                else window.ensureProjectVault(apertura);
                            }).catch(() => { try { window.ensureProjectVault(apertura); } catch (e) { } });
                        } else window.ensureProjectVault(apertura);
                    } catch (e) { }
                }, 400);
            }
            if (appState.activeVaultPath && window.MappAIPipeline && window.MappAIPipeline.checkResume) window.MappAIPipeline.checkResume(appState.activeVaultPath);

            /* 0078 (§4.4): `Fonti/` alla cartella di questo progetto che non ce l'ha,
               dalle fonti in memoria (quelle della copia). La funzione di ELABORA scrive
               solo dove `Fonti/` manca, mai un PDF, e non svuota mai le fonti in
               memoria; qui nessuna lettura delle fonti dal vault. Nel reader non c'è.
               Se lancia, «Riprendi» è riuscito lo stesso: lo dice il registro (il nome
               della cartella, mai il percorso), senza allarme. */
            if (cartellaSua && window.completaFontiDellaCartella) {
                try { await window.completaFontiDellaCartella(cartellaSua); }
                catch (e) {
                    try { console.warn('[Storage] Fonti/ non completata (0078):', e && e.message); } catch (x) { }
                    try {
                        if (window.MappAIErrori && window.MappAIErrori.registra) window.MappAIErrori.registra({ dove: 'fonti',
                            messaggio: 'Fonti/ non completata alla ripresa di «' + (String(cartellaSua).split(/[\\/]/).filter(Boolean).pop() || '') +
                                '»: le fonti restano nella memoria rapida' });
                    } catch (x) { }
                }
            }

            return true;
        } catch (e) {
            if (prima) {
                /* 0076: una riapertura dalla cartella fermata dopo aver sostituito lo
                   stato (la revisione non si riconcilia): si rimette tutto com'era —
                   lo stato, l'identità, la cartella — invece di lasciare una sessione
                   a metà che HOME scriverebbe sul disco */
                appState = prima.stato;
                this.currentProjectId = prima.id;
                this.idInCartella = prima.ic;
                try { simulation = prima.sim; } catch (x) { }
                prima = null;
            } else if (appState._reviewRestoring) { appState._reviewRestoring = false; appState._reviewRestoreError = e.message; }
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

/* 0082 (B4 (a)): restituisce la promessa di `loadProject` — col cassetto solo
   indice acceso, senza copia, si risolve dopo l'apertura dalla cartella, e ELABORA
   la aspetta prima di aprire i documenti. Chi la ignora fa quello che faceva. */
window.loadSavedProject = function (id) {
    return StorageManager.loadProject(id);
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
    /* 0082: col cassetto solo indice acceso, dopo la copia la cartella (la rete del
       rinvio di 10 s); spento esce subito */
    try {
        const p = StorageManager.allineaCartella();
        if (p && typeof p.catch === 'function') p.catch(e => console.warn('[Storage] allineaCartella:', e && e.message));
    } catch (e) { }
}, 120000); // periodic background save just in case

/* 0082 (B6 (a)): ogni 5 s uno sguardo alle chat del Tutor, che non passano da
   `saveCurrentProject`: se la loro firma è cambiata, la cartella si scrive ~10 s
   dopo. Spento, il metodo esce subito. */
setInterval(() => {
    try { StorageManager._guardaChat(); } catch (e) { }
}, 5000);

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
    // Interruttore del reranker Infomaniak (spento se mai toccato)
    const rerankToggle = document.getElementById('infomaniak-reranker-toggle');
    if (rerankToggle) { try { rerankToggle.checked = localStorage.getItem('mappai_reranker_infomaniak') === '1'; } catch (e) { rerankToggle.checked = false; } }
    // Interruttore delle evidenze dalla fonte (21/9/26): stessa forma, spento se mai toccato
    const evidenceToggle = document.getElementById('evidence-toggle');
    if (evidenceToggle) { try { evidenceToggle.checked = localStorage.getItem('mappai_evidence') === '1'; } catch (e) { evidenceToggle.checked = false; } }

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
            if (appState._reviewRestoring || appState._reviewRestoreError) { fatto(); return; }
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
