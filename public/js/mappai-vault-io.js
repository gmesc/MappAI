// ==========================================
// MARKDOWN VAULT I/O (save/load/import/demo) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// SOTA: MARKDOWN VAULT LOGIC
// ==========================================

// Assembla l'oggetto mapData del vault dallo stato corrente. Lo usano la
// cartella che nasce a fine generazione (ensureProjectVault) e la pipeline 011
// (salvataggio automatico via electronAPI.saveVault, senza dialog).
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
        /* 0082 (gate 3 del 08/10; Giacomo: «1 a»): col cassetto solo indice acceso
           la cartella si scrive da sola anche solo aprendo una mappa, e la classe e
           la materia ATTIVE di chi guarda finivano nell'`index.yaml` di una mappa di
           un'altra classe (una cartella sotto 2A che dichiarava 1A). Ad acceso la
           mappa porta le sue: quelle della RIGA del progetto aperto (`cls`, `disc`,
           fissate quando è nato; mai la riga di un altro progetto, inv. 20-bis). Una
           riga che non le ha (mappa appena generata, voce vecchia): come prima. */
        var VCc = window.MappAIVistaCore;
        if (VCc && VCc.cassettoSoloIndice && VCc.cassettoSoloIndice() && typeof StorageManager !== 'undefined' && StorageManager.currentProjectId) {
            var riga = (JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]') || []).filter(function (p) {
                return p && p.id === StorageManager.currentProjectId;
            })[0];
            if (riga && riga.cls) out.classe = String(riga.cls);
            if (riga && riga.disc) out.materia = String(riga.disc);
        }
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
    /* 0061 (29/09, ADR 0013): l'id del progetto entra in `index.yaml` SOLO per la
       cartella che lo porta — adottata in questo percorso, con un id che si può
       scrivere e che è ancora quello della mappa a schermo. In ogni altro caso resta
       `undefined`, e `save-vault` conserva quello già su disco (per esempio dopo uno
       spostamento fatto da INSEGNA, che riscrive `activeVaultPath` senza adottare).
       `typeof` (inv. 3): nel browser `window.StorageManager` è la classe nativa, e
       leggerlo lì darebbe sempre «niente id» — `app.js:2300` ci è cascato. */
    var idDellaCartella;
    try {
        if (typeof StorageManager !== 'undefined') {
            var ic = StorageManager.idInCartella;
            if (ic && ic.id && ic.percorso === appState.activeVaultPath && ic.id === StorageManager.currentProjectId) idDellaCartella = ic.id;
        }
    } catch (e) { idDellaCartella = undefined; }
    return {
        reviewRevision: appState._reviewRevision,
        reviewCommit: appState._reviewCommit,
        projectId: idDellaCartella,
        extractionMode: appState.extractionMode,
        rootNodeLabel: appState.rootNodeLabel,
        /* DOSSIER di fonte (20/8): lo dice il grafo stesso — la radice dei
           dossier è `fonte_0` (nodiDaScheda), deterministico. Va in index.yaml
           perché le sidebar scelgono l'icona SENZA aprire il vault (inv. 7).
           0067 (01/10): `fonte_0` fra i nodi, non per forza il PRIMO — dopo la
           revisione o una riapertura l'ordine cambia, e i dossier si salvavano
           `dossier: false` (icona della mappa). */
        dossier: !!(appState.db.nodes && appState.db.nodes.some(function (n) { return n && n.id === 'fonte_0'; })),
        classe: ctx.classe,
        materia: ctx.materia,
        nodes: appState.db.nodes,
        links: appState.db.links,
        sourcesDict: appState.db.sourcesDict || {},
        studySets: appState.db.studySets || [],
        // Il frontmatter conserva anche ID/pagina/verbatim delle citazioni;
        // la sezione Fonti rimane leggibile nel Markdown.
        userProfile: appState.userProfile,
        tutorState: serializeTutorState(tutorState),
        aiProvider: appState.generationUsage?.provenienzaMappa?.provider || (appState.generationUsage?.modelli && appState.generationUsage?.usedProvider) || appState.aiProvider,
        aiModel: appState.generationUsage?.provenienzaMappa?.model || (appState.generationUsage?.modelli && appState.generationUsage?.usedModel) || document.getElementById('model-select')?.value || localStorage.getItem(appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model'),
        generationUsage: appState.generationUsage,
        customColors: appState.db.customColors || {},
        /* vista.json (15/8): Vista studio · focus · timeline · foglio nodi —
           le quattro cose che il vault non aveva e che restavano prigioniere
           del localStorage di UN computer. Il core decide che cosa entra;
           null = niente da scrivere (e main.js toglie un file stantio). */
        vista: window.MappAIVistaCore ? window.MappAIVistaCore.raccogli(appState) : undefined
    };
};

/* 0124 (ADR 0025): qui c'era `saveMapVault`, «Esporta nel Vault» e «Sincronizza Vault». Non copiava: la
   cartella scelta (anche la Scrivania) DIVENTAVA la cartella del progetto, ed è così che nascevano i progetti fuori
   da «MappAI - file». Un progetto entra solo da «Importa vault» (`loadMapVault` → `MappAIImportVault`). */

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
/* 0070: crea soltanto la cartella del percorso. L'adozione della sessione
   avviene nel controller DOPO fonte e riferimento nel manifest salvati: un
   errore di I/O non deve cambiare identità o cartella del progetto aperto. */
window.createReadingVault = async function (opts) {
    const o = opts || {};
    const FC = window.MappAIFilesCore;
    const api = window.electronAPI;
    const fail = function (code) { const e = new Error(code); e.code = code; throw e; };
    if (!FC || !FC.idProgettoValido || !FC.idProgettoValido(o.projectId) ||
        typeof o.title !== 'string' || !o.title.trim() || typeof o.language !== 'string' || !o.language.trim() ||
        typeof o.assertCurrent !== 'function') fail('reading_vault_invalid');
    if (!api || !api.filesRootGet || !api.getAllVaults || !api.readVaultFile || !api.saveVault) fail('reading_vault_unavailable');
    const assertCurrent = o.assertCurrent;
    const check = function () { if (assertCurrent() === false) fail('reading_vault_stale'); };
    check();
    const projectId = o.projectId, title = o.title.trim();
    const ctx = _contestoDellaMappa();
    if (o.context) { ctx.classe = o.context.className || ''; ctx.materia = o.context.discipline || ''; }
    const cls = window.MappAIClasses && window.MappAIClasses.getActive ? window.MappAIClasses.getActive() : null;
    const allievo = window.MappAIClasses && window.MappAIClasses.activeStudentName ? window.MappAIClasses.activeStudentName() : '';
    const classDir = cls && cls.name ? FC.mapClassFolder(cls.sede, cls.name) : null;
    const discDir = classDir ? FC.disciplineFolder(o.context ? ctx.materia : appState.generationDiscipline || '') : '';
    /* 0094 (ADR 0021): la cartella nasce col TITOLO del racconto, non più `Lettura-<id>`;
       omonima fra i fratelli (stessa cartella madre) → « · 0N». Interruttore
       `mappai_nome_da_cartella` a '0': il nome di prima. */
    const NC = window.MappAINomeCartellaCore;
    let daTitolo = false;
    try { daTitolo = !!(NC && NC.acceso(window.localStorage)); } catch (e) { daTitolo = false; }
    let name = 'Lettura-' + projectId;
    const info = await api.filesRootGet();
    check();
    if (!info || !info.mapsBaseDir) fail('reading_vault_unavailable');
    const root = FC.mapVaultRoot({ maps: info.mapsBaseDir, students: info.studentsBaseDir }, allievo);
    const madre = [root].concat(FC.mapVaultParentsFor(allievo, classDir, discDir)).join('/');
    const vaults = await api.getAllVaults();
    check();
    if (!Array.isArray(vaults)) fail('reading_vault_unavailable');
    if (daTitolo) {
        const forma = s => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const fratelli = vaults.filter(v => v && v.fullPath && forma(v.fullPath).slice(0, forma(v.fullPath).lastIndexOf('/')) === forma(madre))
            .map(v => v.folderName);
        name = NC.nomeLibero(FC.vaultFolderName(title), fratelli).nome;
        if (vaults.some(v => v && v.projectId === projectId)) fail('reading_vault_exists');
    } else if (vaults.some(v => v && (String(v.folderName || '').toLowerCase() === name.toLowerCase() || v.projectId === projectId))) fail('reading_vault_exists');
    const folderPath = madre + '/' + name;
    /* Anche una cartella senza index.yaml può contenere lavoro: si crea solo
       quando il canale dichiara assente il VAULT, non il solo file. */
    const existing = await api.readVaultFile({ vaultPath: folderPath, relPath: 'index.yaml' });
    check();
    if (!existing || existing.ok !== false || existing.error !== 'vault inesistente') fail('reading_vault_exists');
    const saved = await api.saveVault({ folderPath, mapData: {
        projectId, extractionMode: 'lettura', rootNodeLabel: title,
        classe: ctx.classe, materia: ctx.materia, nodes: [], links: [], studySets: [], sourcesDict: {}, customColors: {}
    } });
    check();
    if (!saved || !saved.success) fail((saved && saved.error) || 'reading_vault_write_failed');
    return { folderPath, classDir: allievo ? null : classDir, discDir: allievo ? null : (discDir || null) };
};

window.ensureProjectVault = async function (opts) {
    opts = opts || {};
    try {
        if (appState._reviewRestoring || appState._reviewRestoreError) return null;
        if (localStorage.getItem('mappai_autovault') === '0') return null;
        if (!window.electronAPI || !window.electronAPI.saveVault || !window.electronAPI.filesRootGet) return null;
        if (!appState.db.nodes || !appState.db.nodes.length) return null;
        var FC = window.MappAIFilesCore;
        if (!FC) return null;

        // (1) Progetto già legato a una cartella → aggiorna in place.
        if (appState.activeVaultPath) {
            var upd = await window.electronAPI.saveVault({ folderPath: appState.activeVaultPath, mapData: window.buildVaultMapData() });
            if (!upd || !upd.success) return null;
            if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject();
            /* Sorgenti/: ripescaggio dei fogli di domande aperte dall'archivio (6/9), senza sovrascrivere */
            try {
                if (upd && upd.success && window.MappAIQuizPrint && window.MappAIQuizPrint.ripescaSorgenti) window.MappAIQuizPrint.ripescaSorgenti(appState.activeVaultPath, appState.rootNodeLabel || '');
            } catch (e) { }
            /* Fonti/ (0059): è la strada che prende la generazione CON i materiali
               (la pipeline ha già adottato la sua cartella), e qui il flush non
               c'era — riaperto, il vault non aveva la fonte. La cartella non è
               nata adesso: si scrive solo dove `Fonti/` c'è già. Interruttore
               `mappai_fonte_in_fonti` = '0' → senza flush, come prima. */
            if (window.MappAIElabora && window.MappAIElabora.flushSourcesToVault && window.MappAIElabora.fonteInFonti && window.MappAIElabora.fonteInFonti()) {
                try { await window.MappAIElabora.flushSourcesToVault({ vaultNuovo: false }); }
                catch (e) { console.warn('[autovault] fonti non scritte in Fonti/:', e && e.message); }
            }
            return { created: false, folderPath: appState.activeVaultPath, classDir: appState.activeVaultClassDir || null, discDir: appState.activeVaultDiscDir || null };
        }

        // (2) Contesto attivo → dove va la cartella. Allievo e classe si escludono
        //     a vicenda: con un allievo la mappa è sua, con una classe si annida
        //     per classe/disciplina, senza nessuno dei due va in Mappe/Generico/ (FilesCore.GENERICO, 15/8 sera).
        var cls = null, allievo = '';
        /* 0082 (B1 (a), B2 (a)): chi riapre un progetto senza cartella («Riprendi»,
           col cassetto solo indice acceso) passa la classe della SUA riga
           (`opts.clsId`, letta prima che lo stato si sostituisca): la cartella nasce
           lì, non sotto la classe attiva in quel momento, e l'allievo attivo non
           conta. Una riga senza classe, o con una classe che non esiste più, va in
           `Generico` come «Riordina». Ma se l'elenco delle classi è ancora vuoto e la
           riga HA una classe (non caricato: `get` darebbe null anche per una classe
           che c'è) la cartella non nasce: la copia resta, e ci si riprova alla
           prossima apertura. Una riga SENZA classe va in `Generico` anche con
           l'elenco vuoto: è il docente senza classi (Giacomo, 07/10: «Va in
           «Generico»»). Senza la chiave `clsId`, tutto come prima. */
        if (Object.prototype.hasOwnProperty.call(opts, 'clsId')) {
            var elenco = [];
            try { elenco = (window.MappAIClasses && window.MappAIClasses.list) ? (window.MappAIClasses.list() || []) : []; } catch (e) { elenco = []; }
            if (opts.clsId != null && (!Array.isArray(elenco) || !elenco.length)) return null;
            try { cls = (opts.clsId != null && window.MappAIClasses.get) ? (window.MappAIClasses.get(opts.clsId) || null) : null; } catch (e) { cls = null; }
        } else {
            try { cls = (window.MappAIClasses && window.MappAIClasses.getActive()) || null; } catch (e) { cls = null; }
            try { allievo = (window.MappAIClasses && window.MappAIClasses.activeStudentName) ? window.MappAIClasses.activeStudentName() : ''; } catch (e) { allievo = ''; }
        }
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
        /* 0061 (29/09; ADR 0013): la cartella si ADOTTA prima di scriverla, come fa già
           la pipeline, col gesto che dice il motivo: `generation` → `nuova` (nessuna
           ricerca per nome: la mappa appena generata non eredita l'id di un'omonima),
           `open`/`review` → `per-la-mappa` (la cartella nasce per la mappa che è già in
           memoria). Così `index.yaml` nasce con l'id. `adottaVault` allinea anche classe
           e materia (cura (a) dell'11/9), e l'elenco delle cartelle, già letto qui sopra
           per i fratelli, gli basta. `activeVaultPath` si scrive SOLO DOPO l'adozione: un
           autosave che cadesse nell'attesa non deve far dichiarare la cartella alla voce
           del giro prima della decisione (packet 0061 §4, «L'ordine»). Se la scrittura
           fallisce, l'identità torna com'era prima del gesto, e si ritorna null come prima. */
        var prima = { percorso: appState.activeVaultPath, classe: appState.activeVaultClassDir, materia: appState.activeVaultDiscDir,
            id: (typeof StorageManager !== 'undefined') ? StorageManager.currentProjectId : undefined,
            idInCartella: (typeof StorageManager !== 'undefined') ? StorageManager.idInCartella : undefined };
        var rimetti = function () {
            appState.activeVaultPath = prima.percorso;
            appState.activeVaultClassDir = prima.classe;
            appState.activeVaultDiscDir = prima.materia;
            if (typeof StorageManager !== 'undefined') { StorageManager.currentProjectId = prima.id; StorageManager.idInCartella = prima.idInCartella; }
        };
        if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
            var TCg = window.MappAITeachCore;
            await StorageManager.adottaVault(folderPath, appState, {
                gesto: (TCg && TCg.gestoDiCreazione) ? TCg.gestoDiCreazione(opts.reason) : 'nuova',
                cartelle: all || []
            });
        } else {
            appState.activeVaultClassDir = classDir;
            appState.activeVaultDiscDir = discDir || null;
        }
        appState.activeVaultPath = folderPath;
        var saveRes;
        try { saveRes = await window.electronAPI.saveVault({ folderPath: folderPath, mapData: window.buildVaultMapData() }); }
        catch (e) { rimetti(); throw e; }
        if (!saveRes || !saveRes.success) { rimetti(); return null; }
        /* AUTO-VAULT a fine generazione: è il caso che Giacomo vedeva più spesso —
           la mappa appena fatta non compariva negli elenchi finché non si
           riapriva la finestra. Ora lo dice (9/8). */
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-creata', { vaultPath: folderPath }); } catch (e) { }

        // Fonti/: travasa gli originali PDF ancora in memoria.
        /* 0059: la cartella è nata adesso. ATTESO: prima il `try` stava attorno a
           una funzione async non attesa, e un rifiuto gli sfuggiva. */
        if (window.MappAIElabora && window.MappAIElabora.flushSourcesToVault) {
            try { await window.MappAIElabora.flushSourcesToVault({ vaultNuovo: true }); }
            catch (e) { console.warn('[autovault] fonti non scritte in Fonti/:', e && e.message); }
        }
        // Base64 → path locali su disco.
        if (saveRes.upgrades) {
            saveRes.upgrades.forEach(function (up) {
                var node = appState.db.nodes.find(function (n) { return n.id === up.id; });
                if (node && up.images) { node.images = up.images; if (up.images.length > 0) node.image = up.images[0]; }
            });
        }

        if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject();
        return { created: true, folderPath: folderPath, classDir: classDir, discDir: discDir || null };
    } catch (e) {
        console.warn('[autovault] ensureProjectVault fallito:', e && e.message);
        return null;
    }
};

window.loadDemoGraph = async function (url) {
    try {
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

        // 0061 (29/09, D6): una demo è una mappa NUOVA — stacca id e cartella della mappa di prima (ADR 0013)
        if (window.resetVaultState) window.resetVaultState();
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
    try {
        const result = await window.electronAPI.pickFolder({ importOnly: true });
        if (result.canceled) return;

        /* 0095 (ADR 0021): la cartella scelta non si apre più dov'è: si COPIA in
           Mappe/<classe>/<materia>/ e si apre la copia (l'originale resta com'è).
           Una cartella già in Mappe/ o in Allievi/ torna com'è (D3). Spento con
           `mappai_nome_da_cartella = '0'`, e senza il modulo (reader): come prima. */
        let imp = null;
        if (window.MappAIImportVault && window.MappAIImportVault.attivo()) {
            imp = await window.MappAIImportVault.importa(result.folderPath);
            if (!imp || imp.annullato || !imp.folderPath) return;
            result.folderPath = imp.folderPath;
        }

        window.showLoadingOverlay(true, "Caricamento Vault...");

        const loadRes = await window.electronAPI.loadVault(result.folderPath);

        window.showLoadingOverlay(false);
        if (loadRes.success) {
            if (loadRes.data && loadRes.data.extractionMode === 'lettura') {
                const reading = window.MappAIPercorsoLettura;
                if (!reading || typeof reading.openVault !== 'function') throw new Error(window.t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'));
                return await reading.openVault({ folderPath: result.folderPath, data: loadRes.data });
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
            appState.activeVaultPath = result.folderPath;
            /* stessa adozione di directLoadVault (15/8): l'identità del
               progetto appartiene alla mappa a schermo, mai alla precedente */
            /* 0061 (29/09, ADR 0013): gesto `apri` — vince l'id scritto nella cartella
               (anche spostata in Analisi e rinominata); senza id, per nome come prima;
               una cartella vuota e senza id è una creazione. `loadRes` c'è già: nessuna
               attesa in più (il tetto delle microtask di tests/review-store.test.js). */
            if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
                await StorageManager.adottaVault(result.folderPath, appState, { gesto: 'apri', idCartella: loadRes.data.projectId,
                    vuota: !(loadRes.data.nodes || []).length && !loadRes.data._pipelineManifest });
            }
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            /* la mappa PORTA la sua classe e la sua materia (9/8): un vault
               ricevuto da un collega non cambia materia perché lo apre un altro */
            appState.vaultClasse = loadRes.data.classe || '';
            appState.vaultMateria = loadRes.data.materia || '';
            appState.rootNodeLabel = loadRes.data.rootNodeLabel || result.folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

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

            /* 0078 (§4.2): l'interruttore `mappai_cartella_completa` (il suo
               lettore unico sta nel core della vista). Acceso, «Apri cartella»
               fa quello che fa già `directLoadVault`: lo stato di generazione
               della mappa di PRIMA si azzera PRIMA di leggere la cartella, poi
               la cartella porta la sua vista e i suoi consumi, e vincono.
               Spento o senza core: come prima — niente azzeramento, niente
               vista, niente consumi. */
            const _cartellaCompleta = !!(window.MappAIVistaCore && window.MappAIVistaCore.cartellaCompleta
                && window.MappAIVistaCore.cartellaCompleta());
            if (_cartellaCompleta) {
                window.MappAIVistaCore.azzeraGenerazione(appState);
                /* il layout torna quello di base: il bottone deve dirlo */
                if (window.updateLayoutButtonLabel) { try { window.updateLayoutButtonLabel(); } catch (e) { } }
            }

            appState.db = {
                nodes: nodesList,
                links: linksList,
                studySets: loadRes.data.studySets || [],
                sourcesDict: {},
                customColors: loadRes.data.customColors || {}
            };

            /* 0078: «Apri cartella» non applicava `vista.json` — timeline, foglio
               dei nodi, catena rivista, copie e nodi fissati si perdevano. La
               stessa sequenza di `directLoadVault`: si azzera ciò che la vista
               governa (è della mappa di prima), poi si applica la vista, DOPO i
               nodi della cartella (marca solo quelli che ci sono) e prima del
               ripristino della revisione. */
            if (_cartellaCompleta) {
                appState.studioProfile = undefined;
                appState.focusTopic = '';
                appState.db.timelineEvents = [];
                appState.db.timelineAI = [];
                appState.db.nodeSheet = undefined;
                if (loadRes.data.vista) {
                    const _vApplicati = window.MappAIVistaCore.applica(appState, loadRes.data.vista);
                    if (_vApplicati.length) console.log('[Vault] vista.json applicata:', _vApplicati.join(', '));
                }
            }

            if (window.MappAIJigsaw) {
                window.MappAIJigsaw.syncModeToVault(loadRes.data.branchLocks);
                window.MappAIJigsaw.applyLocks(appState.db.nodes, loadRes.data.branchLocks);
            }

            // Ripristina le chat del vault (o azzera: mai ereditare quelle della mappa precedente)
            window.setTutorState(loadRes.data.tutorState || null);

            /* 0078 (aggiunta del 06/10): i consumi dalla cartella, con le stesse
               righe di `directLoadVault` (la provenienza col profilo dei modelli
               compresa). Azzerati e basta, il salvataggio dopo scriverebbe
               `generationUsage: null` nell'`index.yaml`. Provider e modello no:
               quelle righe scrivono localStorage, e qui non ci sono mai state. */
            if (_cartellaCompleta) {
                const profiloAttivo = window.MappAIModelli && window.MappAIModelli.acceso();
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
            }

            /* Un dizionario già in `mapData` (non lo scrive `save-vault`, ma può
               arrivare da un demo o da un import) ha la precedenza; per tutto il
               resto si ricostruisce dai chunks del markdown, che dall'11/9
               portano anche la pagina. */
            const _sdSalvato = loadRes.data.sourcesDict;
            if (_sdSalvato && typeof _sdSalvato === 'object') {
                Object.keys(_sdSalvato).forEach(k => { appState.db.sourcesDict[k] = _sdSalvato[k]; });
            }
            appState.db.nodes.forEach(n => {
                if (_sdSalvato) return;
                if (appState.db.sourcesDict[n.id]) return;
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => Object.assign({}, typeof c === 'object' ? c : {}, {
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });
            if (window.MappAIReview && window.MappAIReview.restore) {
                await window.MappAIReview.restore(result.folderPath, loadRes.data._pipelineManifest || null, { fromCache: false });
            } else if (loadRes.data._pipelineManifest?.review) throw new Error('Revisione non disponibile: caricamento interrotto');
            appState._reviewRestoring = false;
            if (window.renderStudySets) window.renderStudySets();

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

            setTimeout(() => { initD3Visualization(); }, 200);
            window.showToast(window.t('tst_vault_loaded', "Vault caricato con successo!"), "success");
            // 011: pipeline materiali incompleta su questo vault → proponi la ripresa.
            if (window.MappAIPipeline && window.MappAIPipeline.checkResume) window.MappAIPipeline.checkResume(result.folderPath);
            /* 0095, D9 e D11 (Giacomo, gate del 13/10): un dossier da foto aperto da qui va
               in «Proietta», la vista affiancata di foto e scheda, sopra INSEGNA aperta sul
               progetto: uscendo da «Proietta» si torna lì, come quando lo si proietta da
               INSEGNA. La scheda la cerca per titolo nell'archivio di questo computer: per
               un vault arrivato da un altro si vede la foto. */
            if (imp && imp.dossier && window.MappAIImportVault && window.MappAIImportVault.apriDossier) {
                await window.MappAIImportVault.apriDossier(result.folderPath, appState.rootNodeLabel);
            }
        } else {
            window.showAlert("Errore Caricamento", loadRes.error);
        }
    } catch (e) {
        if (appState._reviewRestoring) { appState._reviewRestoring = false; appState._reviewRestoreError = e.message; }
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
