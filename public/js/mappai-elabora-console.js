/*
 * mappai-elabora-console.js — ELABORA come CONSOLE (8/8/26)
 * ---------------------------------------------------------------------------
 * La terza superficie del cablaggio bento, dopo la landing e INSEGNA. Qui però
 * NON c'è un bento: ELABORA è una console-EDITOR, come la F2 del banco — l'area
 * È il documento, a tutta larghezza. Quindi il lavoro nuovo è la COLONNA:
 *
 *   ┌──────────────┬────────────────────────────────────────────┐
 *   │ FONTE        │                                            │
 *   │  Testo       │        il documento, full-bleed            │
 *   │  PDF         │        (#elab-doc-host: ci disegna         │
 *   │ QUIZ         │         mappai-doc-editor.js, quello       │
 *   │  …           │         vero, non una copia)               │
 *   │ FLASHCARD    │                                            │
 *   │ FOGLIO NODI  │                                            │
 *   │ SINTESI      │                                            │
 *   │ [Crea nuovo] │                                            │
 *   └──────────────┴────────────────────────────────────────────┘
 *
 * ⚠️ Niente è stato riscritto: l'elenco dei documenti nasce dalle stesse fonti
 * che l'editor già interroga (`appState.db.studySets`, l'archivio
 * `MappAIStudyDocs`, il foglio dei nodi e la catena dei perché, che si
 * costruiscono dalla mappa), e ad aprirli sono le sue funzioni
 * (`MappAIDocEditor.openSet/openSynthesis/openNodeSheet/openCausal`). Due
 * elenchi degli stessi documenti divergerebbero al primo ritocco.
 *
 * Dietro il flag `mappai_console_bento_app` come il resto del cablaggio: senza,
 * ELABORA resta esattamente quella di prima.
 *
 * Namespace: window.MappAIElaboraConsole. Caricare DOPO mappai-doc-editor.js
 * e mappai-elabora.js.
 */
(function () {
    'use strict';

    function MM() { return window.MappAIModal; }
    function DEd() { return window.MappAIDocEditor; }
    function EL() { return window.MappAIElabora; }
    function t(k, f) { return window.t ? window.t(k, f) : f; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }
    /* `appState` è una `let` di app.js: non sta su window (regola nota). */
    function _appState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _bentoApp() {
    /* ⚠️ IL FLAG È IN PENSIONE (14/8 sera): il suo «passo indietro» era il rail
       delle tre forme, che non esiste più — a '0' la landing sarebbe rimasta
       senza modo di cambiare sezione. Risponde sempre di sì; la funzione resta
       perché la chiamano da più punti. */
        return true;
    }
    /* ── Che cosa c'è da elaborare ─────────────────────────────────────────────
       Le stesse fonti dell'elenco dell'editor, lette qui per costruire la
       colonna. Restano funzioni di sola lettura: nessuna scrive niente. */
    function _sets() {
        var s = _appState();
        return ((s && s.db && s.db.studySets) || []).filter(function (x) {
            return x && Array.isArray(x.items) && x.items.length;
        });
    }
    function _kindOf(set) {
        try { return window.MappAIDocEdit.kindOfSet(set); } catch (e) { return 'quiz'; }
    }
    /* Le sintesi DI QUESTA MAPPA.
       🐛 Prima erano tutte quelle mai archiviate nell'app, con quelle di altre
       mappe spostate in fondo: una scelta copiata dall'elenco dell'editor, dove
       però il contesto è «tutti i documenti». Qui la colonna dice «i documenti di
       questa mappa» — e la briciola accanto dichiara classe, materia e progetto.
       Effetto visibile (Giacomo, 9/8): in archivio c'era UNA sintesi, quella di
       «Riproduzione Sessuata», e compariva sotto OGNI progetto di OGNI classe.
       ⚠️ Il confronto è normalizzato (spazi e maiuscole): i nomi arrivano da due
       strade — `mapName` scritto all'archiviazione e `rootNodeLabel` della mappa
       caricata — e un nome che differisce per uno spazio farebbe sparire una
       sintesi che invece è di questa mappa. */
    function _nomeMappa(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); }
    /* C'è una mappa aperta? Senza, la colonna non ha documenti da elencare: sono
       documenti DI una mappa. Il conto dei nodi è il segno più onesto — il nome
       da solo può restare da un caricamento precedente. */
    function _lettura() { return window.MappAIPercorsoLettura; }
    function _materialiLettura() {
        var s = _appState(), L = _lettura();
        if (!s || s.extractionMode !== 'lettura' || !s.activeVaultPath || !L || !L.elaboraMaterials) return [];
        return L.elaboraMaterials();
    }
    function _mappaAperta() {
        var s = _appState();
        return !!(s && (s.extractionMode === 'lettura'
            ? _materialiLettura().length : s.db && (s.db.nodes || []).length));
    }
    function _sintesi() {
        var out = [];
        /* 🐛 Senza mappa aperta `rootNodeLabel` è vuoto, e la regola «se non so di
           che mappa sono, le mostro» faceva ricomparire TUTTE le sintesi
           dell'archivio — è quello che Giacomo vedeva su «Elabora › A chi?».
           Nessuna mappa aperta = nessun documento da elencare. */
        if (!_mappaAperta()) return out;
        var mapNow = _nomeMappa((_appState() && _appState().rootNodeLabel) || '');
        try {
            var BS = window.MappAIBranchSynthesis;
            var cur = BS && BS.getData && BS.getData();
            /* anche la sintesi «in memoria» è di UNA mappa (`mapName`): generata
               su un'altra e poi cambiata mappa, restava in elenco */
            if (cur && (!mapNow || !cur.mapName || _nomeMappa(cur.mapName) === mapNow)) {
                out.push({ id: 'current', titolo: cur.branchLabel || t('de_synth', 'Sintesi'), nota: t('de_current', 'in memoria') });
            }
        } catch (e) { }
        try {
            var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [];
            docs.filter(function (d) {
                if (d.kind !== 'synthesis' || d.hasHtml === false) return false;
                /* una sintesi senza mappa dichiarata (archivi vecchi) resta: non
                   si può dire che NON sia di questa, e nasconderla la perderebbe */
                if (!mapNow || !d.mapName) return true;
                return _nomeMappa(d.mapName) === mapNow;
            }).forEach(function (d) {
                out.push({ id: d.id, titolo: d.title, nota: d.mapName && _nomeMappa(d.mapName) !== mapNow ? d.mapName : '' });
            });
        } catch (e) { }
        return out;
    }
    function _nodi() {
        var s = _appState();
        return ((s && s.db && s.db.nodes) || []).length;
    }
    /* Quanti nessi causa-effetto ha questa mappa: il documento già salvato se
       c'è, altrimenti quelli ricavabili dai verbi dei link e dai connettivi delle
       descrizioni. È la stessa domanda che si fa `openCausal` prima di aprire —
       porla PRIMA evita di offrire una voce che poi rifiuta di aprirsi. */
    function _nessiCausali() {
        var s = _appState();
        try {
            var salvato = s && s.db && s.db.causalDoc;
            if (salvato && window.MappAICausalCore && window.MappAICausalCore.countRows) {
                var n = window.MappAICausalCore.countRows(salvato);
                if (n) return n;
            }
        } catch (e) { }
        try {
            var ch = window.MappAICausal && window.MappAICausal.buildForCurrentMap && window.MappAICausal.buildForCurrentMap();
            return (ch && ch.total) || 0;
        } catch (e) { return 0; }
    }
    /* Le fonti PDF della colonna. ⚠️ NON si guarda solo `x.file` (l'oggetto File
       del browser): una mappa riaperta dal vault non ce l'ha — quel campo non è
       ricostruibile da un percorso — e la voce del PDF non compariva, quindi il
       visore era irraggiungibile proprio sulle mappe riaperte, che sono il caso
       normale. Vale anche `vaultRel`, che è come `_collectPdfs` legge i byte dal
       disco (9/8). */
    /* il nome di una fonte PDF: dal file se c'è, altrimenti da `name`/`vaultRel`
       (sulle mappe riaperte la voce diceva «PDF 1» pur avendo il nome) */
    function _nomePdf(p, i) {
        return (p.file && p.file.name) || p.name
            || (p.vaultRel ? String(p.vaultRel).split('/').pop() : '')
            || (t('el_view_pdf', 'PDF') + ' ' + (i + 1));
    }
    function _pdf() {
        var s = _appState();
        return ((s && s.sources) || []).filter(function (x) {
            if (!x) return false;
            if (x.file && /\.pdf$/i.test(x.file.name || '')) return true;
            return !!(x.vaultRel && /\.pdf$/i.test(x.vaultRel));
        });
    }

    /* ── I TIPI DI DOCUMENTO — il popup «+ Crea nuovo» e le righe dalla mappa ──
       `da` dice CHI lo produce: `mappa` = si costruisce dalla mappa, subito e
       senza spendere niente; `mano` = un foglio vuoto che il docente scrive;
       `foto` = l'AI lo scrive dalla scheda di un progetto nato da una foto;
       `ai` = lo genera un motore che sta altrove, e qui si può solo portare
       l'utente dove quel motore vive.
       0091 (13/10/26, decisioni di Giacomo): «+ Crea nuovo» serve a fare un
       documento A MANO; la via con l'AI è «Più materiali insieme». Quindi:
         · Foglio dei nodi e Catena dei perché escono dal popup (`crea: false`)
           ma RESTANO qui, perché da queste due voci nascono le loro righe nelle
           tabelle (`_materiali`): si aprono e si correggono come prima;
         · la Sintesi esce: si genera solo da «Più materiali insieme»;
         · la voce «Quiz, Domande aperte e Flashcard» e i suoi due sotto-modali
           escono: i loro bottoni a mano stanno qui, uno per genere (il V/F a
           mano non c'è più);
         · un progetto nato da una foto ha in più le tre voci `foto` (`dossier:
           true`), che generano dalla sua scheda. */
    function _nomeLibero(tipo) {
        /* Il primo documento di un genere si chiama col nome base; dal secondo
           in poi «2», «3»… — un secondo foglio col nome base si fermerebbe
           (aperte) o avrebbe il nome di file del primo (set). */
        var CL = window.MappAIClona;
        var mat = []; try { mat = _materiali(); } catch (e) { mat = []; }
        var preso = mat.some(function (m) { return m && m.tipo === tipo && !m.clone; });
        if (!preso || !CL || !CL.nomeAuto) return '';
        return CL.nomeAuto(tipo, CL.cloniDi(mat, tipo));
    }
    function _aMano(id, tipo) {
        return {
            id: 'mano_' + id, da: 'mano', icona: { mc: 'list-checks', open: 'pen-line', flashcards: 'copy' }[id],
            et: function () {
                return id === 'mc' ? t('cq_mc', 'Scelta multipla')
                    : id === 'open' ? t('cq_open', 'Domande aperte') : t('cq_flash', 'Flashcard');
            },
            desc: function () { return t('ec_mano_d', 'Un foglio vuoto nell\'editor: scrivi tu le domande, una a una.'); },
            puo: function () { return _nodi() > 0 && !!(window.MappAICreaQuiz && window.MappAICreaQuiz.aMano); },
            perche: function () {
                return _nodi() > 0 ? t('ec_quiz_no', 'Il percorso «crea un quiz» non è caricato.')
                    : t('ec_mano_no', 'Apri prima una mappa.');
            },
            apri: function () { window.MappAICreaQuiz.aMano(id, _nomeLibero(tipo)); }
        };
    }
    /* La scheda di un progetto nato da una foto: la porta con sé la sua
       «Analisi della fonte» (la stessa che `_modificaAnalisi` riapre). */
    function _schedaDelDossier() {
        if (!_eDossierAperto() || !window.schedaFromAnalisiHtml) return null;
        var d = _docArchivioAnalisi();
        try { return (d && d.html) ? window.schedaFromAnalisiHtml(d.html) : null; } catch (e) { return null; }
    }
    function _daFoto(id) {
        return {
            id: 'foto_' + id, da: 'foto', dossier: true, icona: 'image',
            et: function () {
                return id === 'mc' ? t('ec_foto_mc', 'Scelta multipla dalla foto')
                    : id === 'open' ? t('ec_foto_open', 'Domande aperte dalla foto') : t('ec_foto_flash', 'Flashcard dalla foto');
            },
            desc: function () { return t('ec_foto_d', 'L\'AI le scrive dalla scheda della foto: scegli quante e con che angolazione, poi le correggi qui.'); },
            puo: function () { return !!(window.MappAICreaQuiz && window.MappAICreaQuiz.daFoto) && !!_schedaDelDossier(); },
            perche: function () { return t('ec_foto_no', 'Questo progetto non ha la scheda della foto: rifalla dall\'«Analisi della fonte».'); },
            apri: function () { window.MappAICreaQuiz.daFoto(id, _schedaDelDossier()); }
        };
    }
    var TIPI = [
        {
            id: 'nodesheet', da: 'mappa', icona: 'scissors', crea: false,
            et: function () { return t('de_ns', 'Foglio dei nodi'); },
            desc: function () { return t('ec_ns_d', 'Le card dei nodi, pronte da ritagliare. Si costruisce dalla mappa: non serve generarlo prima.'); },
            puo: function () { return _nodi() > 0 && !!(DEd() && DEd().openNodeSheet); },
            perche: function () { return t('ec_ns_no', 'La mappa non ha nodi da stampare.'); },
            apri: function () { DEd().openNodeSheet(); }
        },
        {
            id: 'causal', da: 'mappa', icona: 'git-branch', crea: false,
            et: function () { return t('de_cc', 'Catena dei perché'); },
            desc: function () { return t('ec_cc_d', 'I nessi causali della mappa messi in fila. Come il foglio dei nodi, si ricava dalla mappa al volo.'); },
            puo: function () { return _mappaAperta() && !!(DEd() && DEd().openCausal && window.MappAICausalCore) && _nessiCausali() > 0; },
            perche: function () { return t('ec_cc_no', 'Questa mappa non dichiara nessi causali.'); },
            apri: function () { DEd().openCausal(); }
        },
        _daFoto('open'), _daFoto('flashcards'), _daFoto('mc'),
        _aMano('mc', 'Quiz MC'), _aMano('open', 'Domande aperte'), _aMano('flashcards', 'Flashcard'),
        {
            /* PIÙ MATERIALI INSIEME (21/9). Il pannello esisteva già — è quello
               del bottone grande di COSTRUISCI (`index.html`,
               `MappAIPipeline.openModal`) — ma aveva due soli ingressi, ed
               entrambi vivono in un momento che da un progetto GIÀ generato non
               si ripresenta: il form della generazione nuova, e la revisione
               appena approvata (`mappai-review.js:309`). Da qui non c'era porta,
               e intanto un toast della revisione diceva «usa Genera materiali»
               senza darne una. Questa voce è quella porta: chiama la stessa
               funzione, non ne duplica una seconda (invariante 6 e 21).
               ⚠️ Il pannello che si apre è ancora HTML scritto a mano e non
               conosce le taglie del motore: unificarlo davvero è il packet 0009.
               Per toglierla: si cancella questa voce, e non resta niente. */
            /* `ai` e non `misto`: nel pannello dei materiali multipli non si
               scrive niente a mano, si genera — e il distintivo «tu o l'AI»
               prometterebbe una strada che lì non c'è. (I fogli dei nodi nascono
               dalla mappa senza AI, ma il gesto resta una generazione.) */
            id: 'batch', da: 'ai', icona: 'package',
            et: function () { return t('ec_batch', 'Più materiali insieme'); },
            desc: function () {
                /* 0090 (parte C): con la G2 in attesa la voce lo DICE — il modale si
                   apre sull'avviso e sul bottone «Completa validazione» */
                if (_g2InAttesa()) return t('mp_g2_attesa', 'I materiali chiesti l\'ultima volta aspettano la tua validazione: completala prima di generarne altri.');
                return t('ec_batch_d', 'Quiz, flashcard, domande aperte, fogli dei nodi e sintesi in un giro solo, per ogni ramo della mappa.');
            },
            /* ⚠️ `fromApproved: true` NON è un dettaglio: è ciò che distingue le
               due strade di `_startFromModal` (material-pipeline.js:2254).
               Con esso il pannello lavora sulla mappa CHE C'È —
               `runApprovedMaterials`, solo i materiali. Senza, «Avvia» finisce
               su `Pipeline.run` → `startGeneration`, che vuole generare anche la
               MAPPA: chiede il nome del nodo centrale e rimbalza il docente
               sulla schermata di CREA. Da un progetto già generato è l'ultima
               cosa che si vuole. È la stessa chiamata che fa la revisione
               approvata (mappai-review.js:309), e non a caso.
               La strada vale solo se il progetto porta il manifesto della
               revisione: senza, `_reviewTarget` resterebbe nullo e si
               ricadrebbe nella generazione della mappa — quindi qui la voce si
               spegne e DICE perché, invece di far partire la cosa sbagliata. */
            puo: function () {
                if (!(window.MappAIPipeline && window.MappAIPipeline.openModal)) return false;
                var st = _appState() || {};
                return !!(st.activeVaultPath && st._pipelineManifest && st._pipelineManifest.review);
            },
            perche: function () {
                var st = _appState() || {};
                if (!(window.MappAIPipeline && window.MappAIPipeline.openModal)) return t('ec_batch_no', 'Il motore dei materiali non è caricato.');
                if (!st.activeVaultPath) return t('ec_batch_no_vault', 'Apri un progetto: i materiali si generano dalla sua mappa.');
                return t('ec_batch_no_rev', 'Questo progetto non ha la revisione dei materiali: i materiali multipli si generano da CREA, insieme alla mappa.');
            },
            apri: function () { window.MappAIPipeline.openModal({ fromApproved: true }); }
        }
    ];
    /* `_vaiAlGeneratore` (il ponte verso l'hub «Materiali di studio») è stato
       tolto il 17/8 con l'ultimo che lo chiamava, la voce «Sintesi». La regola
       che l'aveva motivato resta vera — non si scrive un secondo ingresso alla
       generazione — ma qui non c'era nessun secondo ingresso da evitare: il
       motore della sintesi è una funzione sola, e la si chiama. L'hub resta
       raggiungibile da dove è sempre stato, la barra della mappa. */

    /* ══ I DOCUMENTI CHE STANNO SUL DISCO (9/8) ═══════════════════════════════
       🐛 Il difetto, dai dati di Giacomo: il vault di «I Cromosomi» contiene sette
       documenti — `Sintesi -VERDE.html`, i due quiz, le flashcard, i tre fogli
       dei nodi — e la colonna diceva «Sintesi 0». Elencava solo i set EDITABILI
       (`appState.db.studySets`, che il vault ricarica) e l'archivio in
       localStorage: il disco non lo guardava nessuno. Sono i due mondi che non si
       parlano, gli stessi della cecità sulla fonte — e in INSEGNA convivono già
       nello stesso elenco.
       Che cosa se ne fa qui: un file su disco è un documento FINITO (HTML o PDF),
       non un set da correggere; si apre in sola lettura nella tela, come fa
       INSEGNA. Chi vuole modificarlo passa dal set, che resta la voce editabile.
       ⚠️ I `.json` restano fuori: sono i set stessi, già in elenco come voci
       apribili — comparirebbero due volte, una editabile e una no.
       ⚠️ Il genere lo dice `MappAITeach.generePerFile` (la regola di INSEGNA,
       esposta): due classificatori dello stesso nome-file divergerebbero. */
    var _disco = null;          /* null = non ancora letto · [] = letto, niente */
    var _discoVault = '';       /* per quale vault: cambiando mappa si rilegge */
    var _discoManifest = null;  /* 0094 (F2): il pipeline.json della cartella attiva, letto con i file */
    function _generePerFile(nome) {
        try {
            if (window.MappAITeach && window.MappAITeach.generePerFile) return window.MappAITeach.generePerFile(nome);
        } catch (e) { }
        return { icon: 'file', label: 'File' };
    }
    function _gruppoDelFile(nome) {
        var lab = (_generePerFile(nome) || {}).label || 'File';
        if (/^Quiz/i.test(lab)) return 'quiz';
        if (/^Flashcard/i.test(lab)) return 'flash';
        if (/^Foglio/i.test(lab)) return 'ns';
        if (/^Sintesi/i.test(lab)) return 'syn';
        if (/^Analisi/i.test(lab)) return 'analisi';
        return 'altri';
    }
    function _caricaDisco() {
        var s = _appState();
        var api = window.electronAPI;
        var vp = (s && s.activeVaultPath) || '';
        if (!api || !api.vaultMaterialsList || !vp) { _disco = []; _discoVault = vp; _discoManifest = null; return; }
        _discoVault = vp; _discoManifest = null;
        api.vaultMaterialsList({ vaultPath: vp }).then(function (r) {
            if (_discoVault !== vp) return;          /* mappa cambiata nel frattempo */
            _discoManifest = (r && r.manifest) || null;
            _disco = ((r && r.files) || []).filter(function (f) {
                if (!f || !f.name) return false;
                if (/\.json$/i.test(f.name)) return false;
                /* ⚠️ LA SINTESI CON LA VOCE NON ENTRA IN ELABORA (10/8/26).
                   Dal 10/8 la sintesi esce in due file: l'editabile e la copia
                   con l'MP3 dentro (~8 MB). Qui si corregge, e quella copia non
                   si corregge — è un prodotto finito che vive in INSEGNA.
                   Il filtro sta QUI, a monte, e non nei consumatori: dal solo
                   elenco `_disco` dipendono i gruppi della colonna, il bottone
                   «Modifica» e l'anteprima. Filtrando in uno solo di quei tre
                   punti gli altri due avrebbero continuato a vederla — e
                   «Modifica» avrebbe aperto nell'editor un documento da 8 MB
                   che poi `_saveSynthesisFile` riscrive sopra sé stesso,
                   rendendolo editabile di fatto.
                   ⚠️ Si guarda il NOME e non l'etichetta del classificatore:
                   `_gruppoDelFile` decide su `/^Sintesi/i`, che combacia anche
                   con «Sintesi con voce» — usarlo qui non distinguerebbe. */
                if (/^Sintesi-voce\b/i.test(f.name)) return false;
                return true;
            });
            rifaiEsterno();
        }).catch(function () { _disco = []; });
    }
    /* la console si ridisegna dall'esterno di `open()`: l'appiglio lo lascia lei */
    var rifaiEsterno = function () { };
    function _fileDelGruppo(g) {
        return (_disco || []).filter(function (f) { return _gruppoDelFile(f.name) === g; });
    }
    function _vociDisco(g) {
        return _fileDelGruppo(g).map(function (f) {
            /* La voce resta MARCATA anche quando quel file è passato all'EDITOR
               (`synfile:`): è lo stesso documento, prima in sola lettura e poi
               aperto per essere corretto. Senza, premendo «Modifica» la colonna
               si spegneva e diceva che non si sta lavorando su niente. */
            return {
                id: 'disk:' + f.relPath,
                attiva: _voce === 'disk:' + f.relPath || _voce === 'synfile:' + f.relPath,
                /* LA STAMPANTE, sempre, sui documenti del vault (Giacomo, 9/8).
                   Prima ognuno portava l'icona del suo GENERE — la stessa delle
                   voci editabili — e in un elenco misto le due nature si
                   distinguevano solo leggendo il nome del file. L'icona dice
                   invece che cosa si può FARE: un set si corregge, un file
                   pre-generato si guarda o si stampa. Il genere lo dice già il
                   gruppo che lo contiene. */
                icona: 'printer',
                etichetta: f.name, sotto: t('ec_dal_vault', 'nel vault'), chiude: false
            };
        });
    }

    /* ══ F1 — LA LISTA UNIFICATA (spec ELABORA v2, §4) ════════════════════════
       Una voce per OGNI cosa che ELABORA sa mostrare — fonte, set editabili,
       file del vault — nella forma che `MappAITeach.tabelleMateriali` consuma:
       `{id, titolo, tipo, data, archivio, voce, cls, disc}`. È il contratto su
       cui poggia la nuova area a tabelle (F2): la si scrive PRIMA della UI
       perché è l'unica parte che si può provare senza cambiare nulla a schermo.
       ⚠️ `cls` e `disc` restano VUOTI per scelta: dentro ELABORA il contesto è
       già nelle briciole, e le colonne di `tabelleMateriali` si spengono da
       sole quando un campo non varia.

       L'AGGANCIO archivio↔disco (D3 della spec): quando un set editabile e un
       file del vault sono lo stesso documento, la lista emette UNA voce con
       entrambe le nature (`id` del set + `relPath` del file). Il criterio è il
       nome che `buildFileName` produrrebbe per quel set: se sul disco c'è,
       sono la stessa cosa. Si accetta anche la variante col vecchio marcatore
       ` -VERDE` (i file già scritti ce l'hanno, e `SUFFISSO_TARATO` resta
       esportato proprio perché chi rilegge deve riconoscerlo).
       ⚠️ La fusione avviene SOLO senza ambiguità: due set che produrrebbero lo
       stesso nome (due quiz MC della stessa mappa) restano voci separate —
       «mai una voce sbagliata» vale più di una riga in meno. */
    /* 🐛 Il set DICHIARA che cos'è, e va creduto (11/8/26).
       Prima si guardavano solo gli ITEM: `isTrueFalse` chiede due opzioni di
       testo «Vero»/«Falso», ma il quiz V/F della pipeline nasce con la risposta
       nel campo `correct` e SENZA opzioni (è così che il prompt lo chiede) →
       tornava `false`, il set finiva fra i «Quiz a scelta multipla», e siccome
       il nome atteso sul disco si ricava dal genere cercava `Quiz-MC-….pdf`:
       non trovandolo, `Quiz-VF-….pdf` restava una riga a sé. Una sola svista,
       due righe sbagliate. La pipeline scrive `type: 'Vero o Falso'`
       (`_QT.tf.typeLabel`): quella è la fonte, l'ispezione degli item resta
       come ripiego per i set fatti a mano. */
    function _generePerSet(x) {
        /* 0059 D11: le domande che ELABORA raccoglie dalla fonte
           (`openQuestions`) hanno un genere loro, «Domande della fonte». Si
           riconoscono da `origin`, che non dipende dalla lingua: `type` è
           «Aperte» (o «Open») e cadeva nel ripiego, «Scelta Multipla». Il
           genere NON è un genere di file di `buildFileName`: la riga non
           reclama il PDF di un altro genere (con `quiz_mc` si contendeva
           `Quiz-MC-<mappa>.pdf` col quiz vero, e nessuno dei due lo agganciava
           più). Vale anche per i set nati «Domande della scheda» (stessa
           `origin` dal 22/7): la riga cambia nome, il loro titolo no. */
        if (x && x.origin === 'elabora-questions') return { genere: 'domande_fonte', tipo: 'Domande della fonte' };
        var kind = _kindOf(x);
        if (kind === 'flashcards') return { genere: 'flashcards', tipo: 'Flashcard' };
        var dichiarato = String((x && (x.type || x.quizType)) || '').toLowerCase();
        if (/vero|false|\btf\b/.test(dichiarato)) return { genere: 'quiz_tf', tipo: 'Quiz V/F' };
        if (/multipla|multiple|\bmc\b/.test(dichiarato)) return { genere: 'quiz_mc', tipo: 'Quiz MC' };
        var tf = false;
        try {
            var DE = window.MappAIDocEdit;
            tf = !!(DE && DE.isTrueFalse && DE.isTrueFalse(x.items));
        } catch (e) { }
        return tf ? { genere: 'quiz_tf', tipo: 'Quiz V/F' } : { genere: 'quiz_mc', tipo: 'Quiz MC' };
    }
    /* ── IL NOME DI UN FILE A MENO DEL CARATTERE (0110, 17/10) ─────────────
       🐛 Si cercava il nome col carattere ATTUALE dell'app («… - Space Mono.pdf»)
       e lo si confrontava esatto: un quiz scritto in Atkinson Hyperlegible
       («Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf», vault
       vero) restava «senza PDF», e dallo 0105 si apriva nell'editor. Il
       carattere non dice QUALE documento è: si toglie da tutti e due i lati con
       la regola che già c'è (`senzaCarattere`), dopo il « -VERDE» storico. */
    function _sezionaNome(nomeFile) {
        var PC = window.MappAIPipelineCore, FC = window.MappAIFilesCore;
        var n = String(nomeFile == null ? '' : nomeFile);
        var m = /\.[A-Za-z0-9]+$/.exec(n);
        var est = m ? m[0] : '', base = est ? n.slice(0, -est.length) : n;
        var suf = (PC && PC.SUFFISSO_TARATO) || ' -VERDE';
        var verde = base.slice(-suf.length).toLowerCase() === suf.toLowerCase();
        if (verde) base = base.slice(0, -suf.length);
        var car = '';
        if (FC && FC.senzaCarattere) {
            var sc = FC.senzaCarattere(base + est, (PC && PC.fontEtichetta) ? [PC.fontEtichetta()] : []);
            base = sc.stem; car = sc.carattere;
        }
        return { chiave: (base + est).toLowerCase(), carattere: car, verde: verde };
    }
    /* Il nome che quel genere avrebbe sul disco, come CHIAVE (minuscolo, senza
       carattere né « -VERDE»): un elemento solo, in un elenco perché il
       pre-conteggio delle ambiguità conta gli elenchi. */
    function _nomiAttesi(genere, clone) {
        var PC = window.MappAIPipelineCore;
        var s = _appState();
        var mappa = (s && s.rootNodeLabel) || '';
        if (!PC || !PC.buildFileName || !mappa) return [];
        /* ⚠️ Il CLONE ha un file suo: senza il suo nome cercherebbe quello
           dell'originale, e due righe reclamerebbero lo stesso file (che
           l'aggancio, giustamente, rifiuterebbe di fondere — ma il clone
           resterebbe senza il documento che ha prodotto). */
        var CL = window.MappAIClona;
        var opz = (CL && CL.opzioniFile) ? CL.opzioniFile(mappa, clone) : { mappa: mappa };
        return [_sezionaNome(PC.buildFileName(genere, null, false, opz)).chiave];
    }
    /* Il file del disco con quella chiave, non ancora preso. D1 (Giacomo, 17/10):
       se lo stesso documento c'è in più caratteri vince quello ATTUALE (senza il
       « -VERDE» prima di quello col « -VERDE»), se no il più recente. */
    function _fileAtteso(chiavi, dischi, presi) {
        var PC = window.MappAIPipelineCore;
        var ora = (PC && PC.fontEtichetta) ? PC.fontEtichetta() : '';
        var meglio = null, rMeglio = 9;
        (dischi || []).forEach(function (f) {
            if (!f || presi[f.relPath]) return;
            var x = _sezionaNome(f.name);
            if (chiavi.indexOf(x.chiave) < 0) return;
            var r = (x.carattere && x.carattere === ora) ? (x.verde ? 1 : 0) : 2;
            if (r < rMeglio || (r === rMeglio && (f.mtime || 0) > (meglio.mtime || 0))) { meglio = f; rMeglio = r; }
        });
        return meglio;
    }
    /* ── LA SORGENTE DI UN FOGLIO DI DOMANDE APERTE (11/8) ────────────────────
       Il foglio nel vault è un PDF, e un PDF non si corregge. La sua sorgente è
       la voce d'ARCHIVIO che la pipeline salva accanto: l'HTML col JSON delle
       domande incorporato. Trovarla è ciò che dà a queste righe il bottone
       «Modifica» — senza, il genere nasce in sola lettura.
       L'aggancio è per NOME della mappa + genere: l'archivio non registra da
       quale file viene, e il titolo del set («<Mappa> — Domande aperte») è il
       solo appiglio che entrambi condividono. A più candidati vince il più
       RECENTE: è quello che il file sul disco rispecchia. */
    function _docArchivioAperte() {
        try {
            var s = _appState();
            var mappa = _nomeMappa((s && s.rootNodeLabel) || '');
            var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [];
            var cand = docs.filter(function (d) {
                /* ⚠️ `list()` NON porta l'HTML — dice solo `hasHtml`. Filtrare
                   su `d.html` non scarta: azzera, in silenzio. È la trappola
                   scritta nel commento del core, e ci sono cascato lo stesso:
                   l'aggancio non agganciava nulla e il bottone «Modifica» non
                   compariva mai. L'HTML si prende con `get(id)`, dove c'è. */
                if (!d || d.hasHtml === false || d.kind !== 'quizpaper') return false;
                if (!/domande aperte/i.test(String(d.title || ''))) return false;
                return !mappa || !d.mapName || _nomeMappa(d.mapName) === mappa;
            });
            cand.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
            return cand[0] || null;
        } catch (e) { return null; }
    }
    function _eDomandeAperte(nome) { return /^Domande.?aperte/i.test(String(nome || '')); }

    /* ── I NOMI FUNZIONALI (11/8/26) ─────────────────────────────────────────
       In ELABORA la riga dice CHE COSA È, non come si chiama il file. Dentro un
       progetto la mappa è una sola — la dice la briciola e la dice la colonna —
       quindi ripeterla in ogni riga («La Politica Svizzera — Scelta Multipla»,
       «Domande-aperte-La Politica Svizzera.pdf») era il nome del contesto in cui
       si è già, scritto una volta per riga. Resta la parola che distingue.
       ⚠️ I nomi di FILE si mostrano solo in INSEGNA: lì gli elenchi uniscono più
       mappe e il file è la cosa che si prende in mano. Regola di Giacomo. */
    var NOMI_FUNZ = {
        'Quiz MC': ['ec_n_mc', 'Scelta Multipla'],
        'Quiz V/F': ['ec_n_vf', 'Vero o Falso'],
        'Quiz': ['ec_n_quiz', 'Quiz'],
        'Domande aperte': ['ec_n_open', 'Domande Aperte'],
        'Domande della fonte': ['ec_n_srcq', 'Domande della fonte'],
        'Flashcard': ['ec_n_flash', 'Flashcard'],
        'Sintesi': ['ec_n_syn', 'Sintesi'],
        'Foglio nodi': ['ec_n_ns', 'Foglio dei nodi'],
        'Catena dei perché': ['ec_n_cc', 'Catena dei perché']
    };
    /* Il nome del CLONE si attacca al genere: «Scelta Multipla - verifica
       ottobre». Il genere resta la prima parola perché è ciò per cui si cerca;
       il nome personale distingue le copie fra loro. */
    function _nomeFunz(tipo, clone) {
        var v = NOMI_FUNZ[tipo];
        var base = v ? t(v[0], v[1]) : (tipo || t('lt_tipo_file', 'File'));
        return clone ? (base + ' - ' + clone) : base;
    }

    /* Il file che una sorgente ha prodotto, se c'è: si cerca per NOME ATTESO —
       lo stesso che `buildFileName` produrrebbe per quel genere e quella copia.
       Un genere può averne più d'uno (il foglio dei nodi ne fa due, card e
       parole chiave): si mostra il più recente e si «prendono» tutti, o il
       secondo tornerebbe in elenco come riga in sola lettura. */
    function _agganciaFile(v, tipo, clone, dischi, presi) {
        var noti = _cloniNoti(tipo).map(function (n) { return String(n).toLowerCase(); });
        var mio = String(clone || '').toLowerCase();
        var mii = (dischi || []).filter(function (f) {
            if (presi[f.relPath]) return false;
            if ((_generePerFile(f.name) || {}).label !== tipo) return false;
            var nm = String(f.name).toLowerCase();
            /* ⚠️ SI CERCA IL NOME DELLA COPIA, non un prefisso. `buildFileName`
               mette il DETTAGLIO prima del nome («Foglio-nodi-<Mappa>-card
               -verifica ottobre.pdf»), quindi un confronto per prefisso
               «…-<Mappa>-<copia>» non troverebbe mai il file di una copia — e
               la copia sembrerebbe non aver prodotto niente. Cercare il nome
               come SEGMENTO regge qualunque ordine, oggi e se domani cambia. */
            if (mio) return _haSegmento(nm, mio);
            /* l'ORIGINALE prende solo ciò che non appartiene a nessuna copia:
               arriva per primo, e senza questo si prenderebbe tutto */
            return !noti.some(function (n) { return _haSegmento(nm, n); });
        }).sort(function (a, b) { return (b.mtime || 0) - (a.mtime || 0); });
        if (!mii.length) return;
        /* Un genere può produrre più file dalla STESSA sorgente (il foglio dei
           nodi ne fa due, card e parole chiave): si mostra il più recente e si
           «prendono» tutti, o il secondo tornerebbe in elenco come riga a sé. */
        mii.forEach(function (f) { presi[f.relPath] = true; });
        v.relPath = mii[0].relPath;
        v.data = mii[0].mtime || v.data;
    }
    /* Il nome di una copia dentro il nome di un file: preceduto da un trattino e
       seguito da un trattino o dal punto dell'estensione. Il confronto per sola
       inclusione direbbe di sì anche a «verifica ottobre bis». */
    function _haSegmento(nome, pezzo) {
        if (!pezzo) return false;
        var i = nome.indexOf('-' + pezzo);
        if (i < 0) return false;
        var dopo = nome.charAt(i + pezzo.length + 1);
        return dopo === '' || dopo === '-' || dopo === '.';
    }
    /* I nomi delle copie che esistono per questo genere. */
    function _cloniNoti(tipo) {
        if (tipo === 'Foglio nodi') return _cloniDalProgetto('nodesheet');
        if (tipo === 'Catena dei perché') return _cloniDalProgetto('causal');
        if (tipo === 'Domande aperte') {
            return _archivioAperte().map(function (d) { return _cloneDalTitolo(d.title, 'Domande aperte'); })
                .filter(Boolean);
        }
        return [];
    }

    /* I nomi che quel GENERE avrebbe sul disco (la variante storica compresa). */
    function _nomiAttesiGenere(tipo, clone) {
        var K = { 'Foglio nodi': 'nodesheet', 'Catena dei perché': 'causal',
                  'Domande aperte': 'open_questions', 'Sintesi': 'synthesis' }[tipo];
        return K ? _nomiAttesi(K, clone) : [];
    }
    /* I nomi delle copie di un documento che nasce dalla mappa. */
    function _cloniDalProgetto(quale) {
        var CL = window.MappAIClona; var s = _appState();
        if (!CL || !s || !s.db) return [];
        return CL.elencaCloni(s.db, quale === 'nodesheet' ? 'nodeSheet' : 'causalDoc');
    }
    /* Le voci d'archivio delle ANALISI DELLA FONTE di questa mappa (20/8):
       la scheda a quattro blocchi di un dossier iconografico. La sorgente è
       l'HTML con la scheda incorporata (`qp-scheda`) — «Modifica» riapre la
       scheda, non un editor di testo. */
    function _docArchivioAnalisi() {
        var l = _archivioAnalisi();
        if (!l.length) return null;
        l.sort(function (a, b) { return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0); });
        return l[0];
    }
    function _archivioAnalisi() {
        try {
            var SD = window.MappAIStudyDocs; var st = _appState();
            var mappa = (st && st.rootNodeLabel) || '';
            if (!SD || !SD.list || !mappa) return [];
            return SD.list().filter(function (d) {
                return d && d.kind === 'analisi' && d.hasHtml !== false &&
                    (!d.mapName || _nomeMappa(d.mapName) === _nomeMappa(mappa));
            });
        } catch (e) { return []; }
    }

    /* Le voci d'archivio delle domande aperte di QUESTA mappa. */
    function _archivioAperte() {
        try {
            var SD = window.MappAIStudyDocs; var s = _appState();
            var mappa = (s && s.rootNodeLabel) || '';
            if (!SD || !SD.list || !mappa) return [];
            return SD.list().filter(function (d) {
                return d && d.kind === 'quizpaper' && d.mapName === mappa &&
                    /domande aperte/i.test(String(d.title || ''));
            });
        } catch (e) { return []; }
    }
    /* «Domande Aperte - verifica ottobre» → «verifica ottobre». I titoli scritti
       dalla pipeline («<Mappa> — Domande aperte») non hanno copia: tornano ''. */
    function _cloneDalTitolo(titolo, tipo) {
        var CL = window.MappAIClona;
        var base = CL ? CL.etichetta(tipo, '') : tipo;
        var t2 = String(titolo || '').trim();
        if (t2.indexOf(base + ' - ') === 0) return t2.slice(base.length + 3).trim();
        /* ⚠️ FORMA STORICA DELLA PIPELINE (20/8): «<Mappa> — <Genere> · causa».
           I materiali già generati per angolo la portano, e senza questa lettura
           le sette varianti tornavano in elenco tutte con lo stesso nome. */
        var i = t2.lastIndexOf(' · ');
        return i > 0 ? t2.slice(i + 3).trim() : '';
    }
    /* Il nome della variante di un set: dichiarato in `clone`, o letto dal
       titolo per i set scritti prima. */
    function _cloneDiSet(x, tipo) {
        return (x && x.clone) || _cloneDalTitolo(x && x.title, tipo);
    }

    function _materiali() {
        // Il percorso conserva sorgente e revisione nel suo controller: nessuna
        // conversione nei vecchi studySet, che perderebbe i rimandi al testo.
        var lettura = _materialiLettura();
        if ((_appState() || {}).extractionMode === 'lettura') return lettura;
        var out = [];
        /* La FONTE è la prima voce (D2): il testo sempre, i PDF quanti sono.
           Stessa catena di fallback del nome usata dalla colonna. */
        out.push({
            id: 'src:text', titolo: t('el_view_text', 'Testo'), tipo: 'Fonte',
            data: 0, archivio: false, voce: false, cls: '', disc: ''
        });
        _pdf().forEach(function (p, i) {
            out.push({
                id: 'src:pdf:' + i, titolo: _nomePdf(p, i),
                tipo: 'Fonte', data: 0, archivio: false, voce: false, cls: '', disc: ''
            });
        });
        /* Il disco non ancora letto non è un errore: si avvia la lettura e si
           compone con quello che c'è — al suo arrivo `rifaiEsterno` ridisegna,
           che è lo stesso patto asincrono della colonna di oggi. */
        if (_disco === null) { try { _caricaDisco(); } catch (e) { } }
        var dischi = (_disco || []);
        var presi = {};                      /* relPath già fusi con un set */
        var sets = _sets();
        /* pre-conteggio: un nome atteso reclamato da DUE set è ambiguo */
        var attesi = {};
        var perSet = sets.map(function (x) {
            var g = _generePerSet(x);
            var cl = _cloneDiSet(x, g.tipo);
            var nomi = _nomiAttesi(g.genere, cl);
            nomi.forEach(function (n) { attesi[n] = (attesi[n] || 0) + 1; });
            return { x: x, g: g, nomi: nomi, clone: cl };
        });
        perSet.forEach(function (r) {
            var v = {
                id: 'set:' + r.x.id, titolo: _nomeFunz(r.g.tipo, r.clone), tipo: r.g.tipo,
                data: Date.parse(r.x.date) || 0, archivio: true, modificabile: true,
                clonabile: true, clone: r.clone || '', voce: false, cls: '', disc: ''
            };
            var file = _fileAtteso(r.nomi.filter(function (n) { return attesi[n] === 1; }), dischi, presi);
            if (file) {
                presi[file.relPath] = true;
                v.relPath = file.relPath;    /* la seconda natura: il file vero */
                v.data = file.mtime || v.data;
                /* ⚠️ il TITOLO non diventa più il nome del file: in ELABORA la
                   riga è la SORGENTE, e il file è solo dove finisce. Il nome del
                   file si legge in INSEGNA. */
            }
            out.push(v);
        });
        /* ── LE SINTESI VENGONO DALL'ARCHIVIO (E DALLA MEMORIA), NON SOLO DAL DISCO (4/9/26)
           🐛 Giacomo: una sintesi generata a mano dopo la pipeline compariva a
           schermo, apriva l'editor, e poi non era in questo elenco — mentre un
           foglio di domande aperte fatto allo stesso modo sì. La ragione era di
           costruzione: qui le sintesi nascevano SOLO dai file `Sintesi-*.html`,
           che scrive la pipeline; quella manuale finisce in memoria e in
           archivio (`archiveDoc`), e il file arriva solo con «Crea PDF». Ora la
           riga nasce dalla sorgente, come per le aperte, e il file ci si
           aggancia se c'è (così la riga della pipeline non si raddoppia).
           La copia «in memoria» si tace quando l'archivio ha già la stessa
           sintesi: sarebbero due righe per un documento. */
        (function () {
            var sint = _sintesi();
            var titoliArchivio = sint.filter(function (d) { return d.id !== 'current'; })
                .map(function (d) { return _nomeMappa(d.titolo); });
            sint.forEach(function (d) {
                if (d.id === 'current' && titoliArchivio.indexOf(_nomeMappa(d.titolo)) >= 0) return;
                /* la sintesi dell'INTERA mappa si chiama «Sintesi» come la riga che
                   nasceva dal file (il nome della mappa lo dice già la briciola);
                   quella di un ramo tiene il ramo nel titolo, che è l'informazione */
                var titolo4 = /^Sintesi della mappa\b/i.test(d.titolo || '') ? _nomeFunz('Sintesi', '') : d.titolo;
                var v4 = {
                    id: 'syn:' + d.id, titolo: titolo4, tipo: 'Sintesi',
                    data: 0, archivio: d.id !== 'current', modificabile: true, clonabile: false,
                    voce: false, cls: '', disc: ''
                };
                /* ⚠️ Solo il file col NOME ESATTO dell'originale (variante VERDE
                   compresa), non «ciò che non è una copia nota»: per le sintesi
                   `_cloniNoti` è vuoto, e `_agganciaFile` avrebbe preso TUTTI i
                   file di sintesi tenendo il più recente — cioè la copia appena
                   fatta al posto dell'originale, e la copia senza riga (misurato
                   il 6/9). Le copie restano righe loro, dal disco. */
                var f4 = _fileAtteso(_nomiAttesi('synthesis', ''), dischi, presi);
                if (f4) {
                    presi[f4.relPath] = true;
                    v4.relPath = f4.relPath;
                    v4.data = f4.mtime || v4.data;
                }
                /* «Fai una copia» = la copia del FILE (`_clonaFile`, come la riga
                   che nasceva dal disco): c'è solo se il file c'è. Niente `docId`
                   qui: `_clonaV2` lo leggerebbe per primo e copierebbe la voce
                   d'archivio invece del file. */
                v4.clonabile = !!v4.relPath;
                out.push(v4);
            });
        })();
        /* i file del vault rimasti soli (già senza `Sintesi-voce`, filtrata a
           monte in `_caricaDisco` — D8) */
        dischi.forEach(function (f) {
            if (presi[f.relPath]) return;
            var g = _generePerFile(f.name) || {};
            var v = {
                id: 'disk:' + f.relPath, titolo: f.name, tipo: g.label || 'File',
                data: f.mtime || 0, archivio: false, modificabile: false,
                voce: !!g.voce, cls: '', disc: ''
            };
            /* ── LA SORGENTE, GENERE PER GENERE (11/8/26) ────────────────────
               Prima «si può correggere?» equivaleva a «viene da uno studySet»,
               e le sorgenti sono di QUATTRO nature diverse: un set, una voce
               d'archivio (domande aperte), un file HTML del vault (sintesi), la
               mappa stessa (foglio dei nodi, catena). Le ultime tre non erano
               marcate, quindi la colonna diceva «PDF» e la riga non offriva
               «Modifica» — anche dove aprendo il documento il bottone poi
               c'era. La domanda si fa ora al GENERE. */
            if (_gruppoDelFile(f.name) === 'syn' && DEd() && DEd().openSynthesisFromVault) {
                /* l'editabile è il file stesso: si apre e si riscrive */
                v.modificabile = true;
                v.clone = _cloneDalNome(f.name, 'Sintesi');
                /* la copia di una sintesi è la copia del suo FILE: gli IPC per
                   leggerlo e riscriverlo ci sono già */
                v.clonabile = true;
                v.titolo = _nomeFunz('Sintesi', v.clone);
            }
            out.push(v);
        });
        /* ── LE SORGENTI CHE NASCONO DALLA MAPPA ─────────────────────────────
           Foglio dei nodi e catena non hanno un file da cui partire: si
           costruiscono dalla mappa ogni volta. Erano raggiungibili solo da
           «Crea nuovo», cioè da un popup — e nell'elenco comparivano soltanto i
           loro PDF, in sola lettura. Sono sorgenti a tutti gli effetti e stanno
           nell'elenco delle sorgenti.
           ⚠️ Il foglio dei nodi è UNO SOLO (decisione di Giacomo): il formato
           — card, parole chiave — si sceglie DENTRO l'editor, quindi i due PDF
           che ne escono sono due rese della stessa cosa, non due documenti. */
        TIPI.forEach(function (tp) {
            if (tp.da !== 'mappa') return;
            var puo = false; try { puo = tp.puo(); } catch (e) { puo = false; }
            if (!puo) return;
            var tipo = tp.id === 'nodesheet' ? 'Foglio nodi' : 'Catena dei perché';
            var v = {
                id: tp.id === 'nodesheet' ? 'ns:' : 'cc:',
                titolo: _nomeFunz(tipo), tipo: tipo,
                data: 0, archivio: false, modificabile: true, dallaMappa: tp.id,
                voce: false, cls: '', disc: ''
            };
            /* ⚠️ IL FILE GIÀ PRODOTTO SI AGGANCIA ALLA SORGENTE (11/8/26).
               Prima queste due righe aprivano DIRITTO l'editor, e per Giacomo
               era un difetto: aprire un documento che esiste già deve mostrarlo,
               come per tutti gli altri generi — poi si sceglie «Modifica».
               L'editor diretto resta solo dove non c'è ancora niente da vedere.
               Il foglio dei nodi ne produce DUE (card e parole chiave) da un'unica
               sorgente: in anteprima si mostra il più recente, che è quello che
               il docente ha appena prodotto. */
            v.clonabile = true;
            _agganciaFile(v, tipo, '', dischi, presi);
            out.push(v);
            /* ── UNA RIGA PER OGNI COPIA ─────────────────────────────────────
               I cloni di questi due generi vivono nel PROGETTO, accanto
               all'originale (`db.nodeSheetCloni`, `db.causalDocCloni`): la
               regola di dove leggerli è in `mappai-clona-core.js`, una per
               entrambi. */
            _cloniDalProgetto(tp.id).forEach(function (nome) {
                var c = {
                    id: v.id + encodeURIComponent(nome), titolo: _nomeFunz(tipo, nome), tipo: tipo,
                    data: 0, archivio: false, modificabile: true, clonabile: true,
                    dallaMappa: tp.id, clone: nome, voce: false, cls: '', disc: ''
                };
                _agganciaFile(c, tipo, nome, dischi, presi);
                out.push(c);
            });
        });
        /* ── LE DOMANDE APERTE VENGONO DALL'ARCHIVIO, NON DAL DISCO (11/8/26) ─
           Prima la riga nasceva dal PDF e ci si agganciava la sorgente. Con i
           cloni non poteva funzionare: una copia appena fatta un PDF non ce l'ha
           ancora, e la riga non sarebbe comparsa affatto — cioè il clone
           sembrerebbe non essere stato creato. Ora è la sorgente a fare la riga,
           e il file ci si aggancia se c'è: lo stesso schema dei set. */
        /* ── L'ANALISI DELLA FONTE (20/8): la riga è la SORGENTE d'archivio,
           il PDF ci si aggancia se c'è — lo stesso schema delle aperte. */
        _archivioAnalisi().forEach(function (d) {
            var v3 = {
                id: 'an:' + d.id, titolo: t('ec_n_analisi', 'Analisi della fonte'), tipo: 'Analisi della fonte',
                data: Date.parse(d.date) || 0, archivio: true, modificabile: true,
                docId: d.id, voce: false, cls: '', disc: ''
            };
            var f3 = _fileAtteso(_nomiAttesi('analisi_fonte', ''), dischi, presi);
            if (f3) {
                presi[f3.relPath] = true;
                v3.relPath = f3.relPath;
                v3.data = f3.mtime || v3.data;
            }
            out.push(v3);
        });
        _archivioAperte().forEach(function (d) {
            var nome = _cloneDalTitolo(d.title, 'Domande aperte');
            var v2 = {
                id: 'oq:' + d.id, titolo: _nomeFunz('Domande aperte', nome), tipo: 'Domande aperte',
                data: Date.parse(d.date) || 0, archivio: true, modificabile: true, clonabile: true,
                docId: d.id, clone: nome, voce: false, cls: '', disc: ''
            };
            _agganciaFile(v2, 'Domande aperte', nome, dischi, presi);
            out.push(v2);
        });
        /* ⚠️ In ELABORA restano SOLO le sorgenti (decisione di Giacomo, 11/8):
           i file già generati vivono in INSEGNA, nell'elenco «Stampabili», che è
           dove si prendono per stamparli o consegnarli. Un PDF senza sorgente
           qui non avrebbe nessun gesto da offrire se non guardarlo. */
        return out.filter(function (m) { return m.tipo === 'Fonte' || m.modificabile; });
    }

    /* ── CLONA: una seconda copia editabile (11/8/26) ────────────────────────
       Qui c'è solo il GESTO — chiedere il nome, mettere il set nuovo dove vive
       lo stato, ridisegnare. Le regole (che cos'è un nome valido, come si
       numera, che cosa si copia e che cosa no) stanno in `mappai-clona-core.js`,
       pure e provate in Node: sono le stesse che dettano il nome del FILE, e se
       vivessero qui la console e la pipeline le direbbero in due modi. */
    function _clonaV2(mid, poi) {
        var CL = window.MappAIClona;
        if (!CL) { toast(t('ec_clona_ko', 'La copia non è disponibile qui.'), 'warning'); return; }
        var m = _materiali().filter(function (x) { return x.id === mid; })[0];
        if (!m || !m.clonabile) {
            toast(t('ec_clona_no', 'Questo documento non si può ancora copiare.'), 'info'); return;
        }
        var set = null;
        if (mid.indexOf('set:') === 0) {
            set = _sets().filter(function (x) { return String(x.id) === mid.slice(4); })[0];
            if (!set) { toast(t('ec_clona_via', 'Questo documento non è più nella mappa.'), 'warning'); return; }
        }
        var presi = CL.cloniDi(_materiali(), m.tipo);
        var proposto = CL.nomeAuto(m.tipo, presi);
        /* ⚠️ La firma vera di `chiedi` è { titolo, etichetta, valore, conferma }:
           non ha un campo per una riga di spiegazione, quindi il PERCHÉ del nome
           — che non è una formalità: è ciò che distinguerà i due file nella
           cartella — sta nell'etichetta del campo, che è l'unico posto in cui
           l'utente lo legge. */
        MM().chiedi({
            titolo: t('ec_clona_t', 'Fai una copia'),
            icona: 'copy',
            etichetta: t('ec_clona_n', 'Nome della copia — distingue anche il file nella cartella'),
            valore: proposto,
            conferma: t('ec_clona_ok', 'Crea la copia')
        }).then(function (r) {
            if (r == null || r === false) return;
            var v = CL.valida(r, m.tipo, presi);
            if (!v.ok) {
                toast(v.motivo === 'duplicato'
                    ? t('ec_clona_dup', 'Esiste già una copia con questo nome.')
                    : t('ec_clona_vuoto', 'Serve un nome: è ciò che distingue la copia dall\'originale.'), 'warning');
                return;
            }
            var s = _appState();
            if (!s || !s.db) { toast(t('ec_clona_ko', 'La copia non è disponibile qui.'), 'warning'); return; }
            /* Due nature, due modi di copiare — e stanno qui, non nel core: il
               core sa che cos'è un NOME valido, non dove vive il documento.
               La sintesi è un FILE del vault: si legge e si riscrive col nome
               nuovo. Un set è un oggetto in memoria: si duplica. */
            if (m.dallaMappa) { _clonaDocMappa(m, v.nome, poi); return; }
            if (m.docId) { _clonaArchivio(m, v.nome, poi); return; }
            if (!set) { _clonaFile(m, v.nome, poi); return; }
            /* L'id e la data li mette CHI CHIAMA: il core è puro e non guarda
               l'orologio (sarebbe un test non ripetibile). */
            var nuovo = CL.clonaSet(set, v.nome, {
                id: 'set_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
                genere: m.tipo, data: new Date().toISOString()
            });
            s.db.studySets = s.db.studySets || [];
            s.db.studySets.push(nuovo);
            /* ⚠️ Si SALVA subito: il set vive in `appState`, e senza persistere
               la copia sparirebbe alla prima riapertura del progetto — con il
               docente convinto di averla fatta. `StorageManager` è un `const`
               lessicale (regola nota del progetto): si interroga con `typeof`. */
            _salvaProgetto();
            toast(t('ec_clona_fatto', 'Copia creata: ') + CL.etichetta(m.tipo, v.nome), 'success');
            if (poi) poi();
        });
    }

    /* La copia di un documento che è un FILE del vault (oggi: la sintesi).
       Si legge e si riscrive col nome nuovo — nient'altro: il contenuto è già
       quello giusto, ed è il motivo per cui si copia invece di rigenerare.
       ⚠️ `ifAbsent: true`: se un file con quel nome c'è già NON si sovrascrive.
       Il validatore controlla i cloni che l'elenco conosce, ma sul disco può
       esserci un file che l'elenco non ha ancora letto — e la copia non deve
       poter cancellare il lavoro di qualcun altro per una corsa fra due
       letture. */
    function _clonaFile(m, nome, poi) {
        var s = _appState();
        var api = window.electronAPI;
        var PC = window.MappAIPipelineCore;
        var CL = window.MappAIClona;
        if (!api || !api.readVaultFile || !api.saveVaultFile || !s || !s.activeVaultPath || !PC || !CL) {
            toast(t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
        }
        var mappa = (s && s.rootNodeLabel) || '';
        var nuovo = PC.buildFileName('synthesis', null, false, CL.opzioniFile(mappa, nome));
        /* la copia sta nella STESSA cartella dell'originale */
        var cart = String(m.relPath || '').split('/').slice(0, -1).join('/');
        var rel = (cart ? cart + '/' : '') + nuovo;
        api.readVaultFile({ vaultPath: s.activeVaultPath, relPath: m.relPath })
            .then(function (r) {
                /* 🐛 (6/9) `read-vault-file` risponde con `base64` (main.js), non con
                   `text`: la copia falliva SEMPRE («Non riesco a scrivere la copia») —
                   trovato provando «Fai una copia» su una sintesi. Si decodifica come
                   UTF-8, che è come il file è stato scritto. */
                var testo = r && (r.text || r.content);
                if (testo == null && r && r.base64 != null) {
                    try { testo = new TextDecoder('utf-8').decode(Uint8Array.from(atob(r.base64), function (c) { return c.charCodeAt(0); })); }
                    catch (e) { testo = null; }
                }
                if (!r || r.ok === false || testo == null) throw new Error('lettura');
                return api.saveVaultFile({
                    vaultPath: s.activeVaultPath, relPath: rel, text: testo, ifAbsent: true
                });
            })
            .then(function (w) {
                if (!w || w.ok === false) {
                    toast(w && w.exists
                        ? t('ec_clona_dup', 'Esiste già una copia con questo nome.')
                        : t('ec_clona_kof', 'Non riesco a scrivere la copia.'), 'warning');
                    return;
                }
                /* il disco è cambiato: si rilegge, o l'elenco non mostra la copia
                   appena fatta (ed è la prima cosa che si va a cercare) */
                _disco = null;
                toast(t('ec_clona_fatto', 'Copia creata: ') + CL.etichetta(m.tipo, nome), 'success');
                if (poi) poi();
            })
            .catch(function () { toast(t('ec_clona_kof', 'Non riesco a scrivere la copia.'), 'warning'); });
    }

    /* La copia di un documento che nasce dalla MAPPA (foglio dei nodi, catena).
       Non c'è un file da copiare: c'è un oggetto nel progetto, e la copia è un
       secondo oggetto accanto. Se l'originale non è mai stato aperto e salvato
       non esiste ancora — e allora la copia parte dalla mappa, cioè da capo:
       è comunque un documento indipendente, che è ciò che serve. */
    function _clonaDocMappa(m, nome, poi) {
        var CL = window.MappAIClona; var s = _appState();
        if (!CL || !s || !s.db) { toast(t('ec_clona_ko', 'La copia non è disponibile qui.'), 'warning'); return; }
        var campo = m.dallaMappa === 'nodesheet' ? 'nodeSheet' : 'causalDoc';
        var sorgente = CL.leggiDoc(s.db, campo, m.clone || '');
        /* copia profonda: correggere la copia non deve toccare l'originale */
        var copia = sorgente ? JSON.parse(JSON.stringify(sorgente)) : null;
        if (copia) { delete copia.editedAt; }
        CL.scriviDoc(s.db, campo, nome, copia);
        _salvaProgetto();
        toast(t('ec_clona_fatto', 'Copia creata: ') + CL.etichetta(m.tipo, nome), 'success');
        if (poi) poi();
    }

    /* La copia di un documento la cui sorgente è una voce d'ARCHIVIO (le domande
       aperte). ⚠️ `list()` NON porta l'HTML — dice solo `hasHtml`: va letto con
       `get(id)`, ed è la trappola già pagata una volta su questo stesso archivio
       (filtrare su `d.html` non scarta, AZZERA). */
    function _clonaArchivio(m, nome, poi) {
        var CL = window.MappAIClona; var SD = window.MappAIStudyDocs; var s = _appState();
        if (!CL || !SD || !SD.get || !SD.save) { toast(t('ec_clona_ko', 'La copia non è disponibile qui.'), 'warning'); return; }
        var src = SD.get(m.docId);
        var html = src && src.html;
        if (!html) { toast(t('ec_clona_kos', 'La sorgente di questo documento non è più leggibile.'), 'warning'); return; }
        try {
            SD.save({
                kind: 'quizpaper', title: CL.etichetta(m.tipo, nome), html: html,
                mapName: (s && s.rootNodeLabel) || '', cls: src.cls || '', disc: src.disc || ''
            });
        } catch (e) { toast(t('ec_clona_kof', 'Non riesco a scrivere la copia.'), 'warning'); return; }
        toast(t('ec_clona_fatto', 'Copia creata: ') + CL.etichetta(m.tipo, nome), 'success');
        if (poi) poi();
    }

    /* L'eliminazione di una COPIA, qualunque sia la sua natura. Il file che la
       copia ha prodotto NON si tocca: vive in INSEGNA e lì si elimina — qui si
       butta la sorgente, che è ciò che questa console governa. */
    function _elCopia(m) {
        var T = window.MappAITeach;
        if (!T || !T.confirmDeleteText) {
            toast(t('ec_del_ko2', 'La conferma di eliminazione non è disponibile qui.'), 'warning'); return;
        }
        T.confirmDeleteText(m.titolo, function () {
            var CL = window.MappAIClona; var s = _appState();
            if (m.dallaMappa && CL && s && s.db) {
                CL.eliminaDoc(s.db, m.dallaMappa === 'nodesheet' ? 'nodeSheet' : 'causalDoc', m.clone);
                _salvaProgetto();
            } else if (m.docId && window.MappAIStudyDocs && window.MappAIStudyDocs.remove) {
                window.MappAIStudyDocs.remove(m.docId);
            } else if (m.id.indexOf('set:') === 0 && s && s.db) {
                var id = m.id.slice(4);
                s.db.studySets = (s.db.studySets || []).filter(function (x) { return String(x.id) !== id; });
                _salvaProgetto();
            } else if (m.relPath) {
                /* una copia che è un FILE (la sintesi): il file È la sorgente */
                var api = window.electronAPI;
                if (api && api.deleteVaultFile && s && s.activeVaultPath) {
                    api.deleteVaultFile({ vaultPath: s.activeVaultPath, relPath: m.relPath });
                }
                _disco = null;
            }
            toast(t('ec_del_fatto', 'Copia eliminata.'), 'success');
            rifaiEsterno();
        });
    }

    /* Il progetto si salva subito: senza, la copia sparirebbe alla riapertura —
       col docente convinto di averla fatta. `StorageManager` è un `const`
       lessicale (regola nota): si interroga con `typeof`. */
    function _salvaProgetto() {
        try {
            // niente ripiego su `window.StorageManager`: è la classe nativa del browser
            var SM = (typeof StorageManager !== 'undefined') ? StorageManager : null;
            if (SM && SM.saveCurrentProject) SM.saveCurrentProject();
        } catch (e) { /* la copia c'è comunque in memoria */ }
    }

    /* Il nome personale di un CLONE, letto dal nome del file: «Sintesi-<Mappa>
       -verifica ottobre.html» → «verifica ottobre». Torna '' per l'originale. */
    function _cloneDalNome(nomeFile, genere) {
        try {
            var s = _appState();
            var mappa = (s && s.rootNodeLabel) || '';
            if (!mappa) return '';
            /* il suffisso del carattere (« - TM Sans», 18/8) NON è il nome di una copia:
               si toglie prima di leggere (quirk noto dal 6/9, chiuso il 7/9) */
            var FCn = window.MappAIFilesCore;
            var base = FCn && FCn.senzaCarattere ? FCn.senzaCarattere(String(nomeFile)).stem : String(nomeFile).replace(/\.[A-Za-z0-9]+$/, '');
            var pre = genere + '-' + mappa;
            if (base.indexOf(pre) !== 0) return '';
            return base.slice(pre.length).replace(/^[-–—\s]+/, '').trim();
        } catch (e) { return ''; }
    }

    /* ── Lo SCHEMA della console ─────────────────────────────────────────────── */
    var _voce = '';      /* la voce scelta nella colonna */

    /* ── Lo stato della macchina a tre stati (spec ELABORA v2, §3) ────────────
       Vive nel MODULO, mai dentro `open()` — trappola già pagata: `_mappe is
       not defined` non dava errori a schermo, la console smetteva solo di
       aggiornarsi.
       `_prog` = id del progetto scelto in sidebar (null = nessuno). In F2 è
       bookkeeping: chi decide che cosa si mostra è ancora `mappaCorrente`
       (il progetto scelto È la mappa caricata).
       `_doc` = il documento aperto nell'area: `null` = S1 (tabelle) ·
       `{id, natura}` = S2 (anteprima, F3) · `+ editing:true` = S3 (editor, F4).
       ⚠️ `_voce` resta della console VECCHIA e va sostituita, non riusata
       (fa due mestieri — progetto e documento — e i punti che la leggono sono
       censiti nella spec §3). */
    var _prog = null;
    var _doc = null;

    /* La console è aperta? Serve a `mappai-elabora.js`: la landing chiama
       `MappAIElabora.render()` per suo conto (ri-sincronizzazione dei vault dopo
       l'ingresso in ELABORA, filtro classe) e quel render costruiva il workspace
       a tutto schermo DIETRO la console — misurato: `#elab-overlay` presente con
       la console aperta. Non è una variabile di comodo: è l'unico modo perché
       chi disegna il workspace sappia che quella superficie non è più la sua. */
    var _aperta = false;

    /* I gruppi chiusi: lo stato vive QUI, non nel DOM. Il motore piega da sé
       (risposta immediata) ma la console si ridisegna a ogni documento scelto —
       senza memoria i gruppi si riaprirebbero da soli al primo clic.
       Dall'8/8 sera la memoria vale anche FRA LE SESSIONI, ed è **globale**: i
       gruppi sono i GENERI di documento (fonte, quiz, flashcard…), non una
       proprietà della mappa — chi tiene chiusi i quiz perché non li usa li vuole
       chiusi su ogni mappa, e legarli alla mappa vorrebbe dire richiudere gli
       stessi sei gruppi a ogni apertura. Se la lettura fallisce si riparte da
       tutti APERTI: uno stato illeggibile non deve nascondere degli elenchi. */
    /* I gruppi della colonna nascono TUTTI PIEGATI, a ogni avvio dell'app
       (Giacomo, 10/8). Prima un gruppo mai toccato era assente dalla memoria e
       veniva reso APERTO: aprendo ELABORA la colonna partiva mezza estesa, e con
       sei generi si scorreva per trovare quello che serve.
       ⚠️ La memoria sta in `sessionStorage`, non in `localStorage`: quello che si
       apre resta aperto finché si lavora — anche attraverso il `location.reload()`
       che fa tornare alla landing da una mappa — ma il prossimo avvio riparte
       piegato. Con `localStorage` la scelta di un giorno sarebbe rimasta addosso
       a tutti quelli dopo. */
    var LS_GRUPPI = 'mappai_ec_gruppi';
    var _chiusi = (function () {
        /* La chiave col MEDESIMO nome esisteva in `localStorage` e ora non la
           legge più nessuno: si toglie, o resterebbe lì a dire una cosa che non
           è più vera a chi la trova. */
        try { localStorage.removeItem(LS_GRUPPI); } catch (e) { }
        try { var o = JSON.parse(sessionStorage.getItem(LS_GRUPPI) || '{}'); return (o && typeof o === 'object') ? o : {}; }
        catch (e) { return {}; }
    })();
    function _salvaChiusi() { try { sessionStorage.setItem(LS_GRUPPI, JSON.stringify(_chiusi)); } catch (e) { } }

    /* Un gruppo e le sue voci in un colpo: il CONTATORE sta sulla riga del
       titolo. ⚠️ Niente riga «Nessuno» quando il gruppo è vuoto: con il
       contatore a 0 sarebbe un doppione, e una voce che non si può scegliere in
       un elenco di voci che si scelgono si legge come un errore. */
    function _gruppo(nav, id, etichetta, voci) {
        nav.push({
            gruppo: etichetta, id: 'g:' + id, contatore: voci.length,
            /* `!== false`: piegato salvo che l'utente l'abbia APERTO in questa
               sessione. Assente = mai toccato = piegato. */
            collassabile: true, chiuso: _chiusi[id] !== false
        });
        voci.forEach(function (v) { nav.push(v); });
    }

    /* ══ IL PROGETTO DI QUESTO CONTESTO (Giacomo, 9/8) ═══════════════════════════
       🐛 Due difetti con la stessa radice: la colonna leggeva `appState`, che resta
       caricato con la mappa di PRIMA. Al boot mostrava «Fonte › Testo» senza che
       nessun progetto fosse scelto; e cambiando classe o materia la briciola si
       aggiornava mentre la colonna teneva nomi e contatori dell'ultimo progetto —
       cioè elencava i documenti di una mappa che non appartiene più al contesto.
       Qui si risponde a una domanda sola: c'è un progetto scelto DENTRO questo
       contesto? Se no, la colonna non elenca niente.
       ⚠️ `_mappe` è `null` finché l'elenco non arriva dal disco (pochi ms). In
       quell'istante non si sa, e la risposta dipende da COME ci si è arrivati:
       aprendo la console la mappa aperta è per definizione quella su cui si sta
       lavorando (ci si è arrivati da lì); dopo un cambio di contesto no — e
       mostrare i vecchi contenuti per un istante è esattamente il difetto. Da qui
       il flag `_contestoCambiato`, che vive solo per quell'attesa. */
    var _contestoCambiato = false;
    /* ⚠️ `_mappe` e `_inCorso` vivono nel MODULO, non dentro `open()`: le legge
       anche `_progettoDelContesto`, che `_nav` chiama — e `_nav` sta qui. Erano
       locali a `open()` e la colonna moriva con «_mappe is not defined» al primo
       ridisegno (nessun errore a schermo: la console semplicemente non si
       aggiornava più).
       `null` = elenco non ancora letto dal disco · `[]` = letto e vuoto. */
    var _mappe = null;
    var _totali = null;      /* quante mappe ci sono in tutto, filtro a parte */
    var _allineato = false;  /* il filtro è già stato allineato alla mappa aperta? */
    /* la mappa che si sta CARICANDO: il caricamento da vault passa dal disco e
       dura, e senza questo la briciola mostrava ancora il nome vecchio mentre la
       console era già tornata al segnaposto (misurato: ~400ms). */
    var _inCorso = null;
    function _progettoDelContesto() {
        if (!_mappaAperta()) return false;
        if (_mappe) {
            try {
                var T = window.MappAITeach;
                return !!(T && T.mappaCorrente && T.mappaCorrente(_mappe));
            } catch (e) { return true; }
        }
        return !_contestoCambiato;
    }

    /* ⚠️ NON è più la navigazione (13/8): la colonna la costruisce `_navV2`, che
       elenca i PROGETTI. Questa funzione resta perché il suo elenco è l'unico
       posto che sa come si CHIAMA un documento dato il suo id — serve alla
       domanda «salvare prima di uscire?», che senza direbbe «questo documento»
       proprio dove il nome c'è. Rinominata per non mentire sul suo mestiere:
       potarla insieme alla v1 avrebbe rotto quella domanda in silenzio. */
    function _indiceDocumenti() {
        var nav = [];
        var s = _appState();

        /* Nessun progetto scelto in questo contesto: i gruppi restano, coi loro
           contatori a zero — dicono che generi di documento esistono, e che qui
           non ce n'è ancora nessuno. Le VOCI no: apparterrebbero a un'altra
           mappa. */
        if (!_progettoDelContesto()) {
            _gruppo(nav, 'fonte', t('ec_g_fonte', 'Fonte'), []);
            _gruppo(nav, 'quiz', t('de_g_quiz', 'Quiz e verifiche'), []);
            _gruppo(nav, 'flash', t('de_g_flash', 'Flashcard'), []);
            _gruppo(nav, 'ns', t('de_g_ns', 'Foglio dei nodi'), []);
            _gruppo(nav, 'syn', t('ec_g_sintesi', 'Sintesi'), []);
            _gruppo(nav, 'cc', t('ec_g_catene', 'Catene'), []);
            return nav;
        }

        /* LA FONTE, in cima: è da lì che tutto il resto è stato ricavato, e
           rivedere un documento senza poter tornare alla fonte è metà lavoro. */
        var fonte = [{ id: 'src:text', etichetta: t('el_view_text', 'Testo'), icona: 'file-text', attiva: _voce === 'src:text' }];
        var pdf = _pdf();
        pdf.forEach(function (p, i) {
            fonte.push({ id: 'src:pdf:' + i, icona: 'file-type', attiva: _voce === 'src:pdf:' + i, etichetta: _nomePdf(p, i) });
        });
        _gruppo(nav, 'fonte', t('ec_g_fonte', 'Fonte'), fonte);

        var sets = _sets();
        /* set EDITABILI + documenti FINITI del vault, nello stesso gruppo: sono
           la stessa cosa vista in due stadi, e tenerli in elenchi diversi
           obbligava a cercare in due posti (9/8) */
        _gruppo(nav, 'quiz', t('de_g_quiz', 'Quiz e verifiche'),
            sets.filter(function (x) { return _kindOf(x) === 'quiz'; }).map(function (x) {
                return {
                    id: 'set:' + x.id, icona: 'file-question', attiva: _voce === 'set:' + x.id,
                    etichetta: x.title || t('de_quiz', 'Quiz'), contatore: x.items.length
                };
            }).concat(_vociDisco('quiz')));

        _gruppo(nav, 'flash', t('de_g_flash', 'Flashcard'),
            sets.filter(function (x) { return _kindOf(x) === 'flashcards'; }).map(function (x) {
                return {
                    id: 'set:' + x.id, icona: 'layers', attiva: _voce === 'set:' + x.id,
                    etichetta: x.title || 'Flashcard', contatore: x.items.length
                };
            }).concat(_vociDisco('flash')));

        var fogli = [];
        if (_nodi()) {
            var salvato = (s && s.db && s.db.nodeSheet) || null;
            fogli.push({
                id: 'ns', icona: 'scissors', attiva: _voce === 'ns',
                etichetta: (s && s.rootNodeLabel) || t('de_ns', 'Foglio dei nodi'),
                sotto: salvato ? t('de_ns_revised', 'rivisto') : ''
            });
        }
        _gruppo(nav, 'ns', t('de_g_ns', 'Foglio dei nodi'), fogli.concat(_vociDisco('ns')));

        /* SINTESI e CATENE separate (Giacomo, 8/8): sono due documenti diversi —
           una la scrive l'AI su un ramo, l'altra si ricava dai nessi della mappa
           — e tenerle sotto un titolo solo obbligava a leggere le righe per
           capire quale fosse quale. */
        _gruppo(nav, 'syn', t('ec_g_sintesi', 'Sintesi'), _sintesi().map(function (d) {
            return {
                id: 'syn:' + d.id, icona: 'file-text', attiva: _voce === 'syn:' + d.id,
                etichetta: d.titolo, sotto: d.nota || ''
            };
        }).concat(_vociDisco('syn')));

        /* 🐛 «Catena dei perché» compariva SEMPRE, anche senza mappa: la
           condizione guardava se il MODULO era caricato, non se la mappa avesse
           dei nessi. E cliccandola `openCausal` uscìva con un avviso lasciando la
           tela all'editor, che disegnava la sua vecchia lista. Ora la voce c'è
           solo se un documento esiste davvero — un doc già salvato nella mappa,
           oppure dei nessi che si possono ricavare adesso (conto deterministico,
           nessuna AI). */
        var catene = [];
        if (_mappaAperta() && window.MappAICausalCore && DEd() && DEd().openCausal && _nessiCausali() > 0) {
            catene.push({ id: 'cc', icona: 'git-branch', attiva: _voce === 'cc', etichetta: t('de_cc', 'Catena dei perché') });
        }
        _gruppo(nav, 'cc', t('ec_g_catene', 'Catene'), catene);

        /* i documenti del vault che non ricadono nei generi noti (un PDF messo lì
           a mano, un audio della sintesi): si dicono, invece di sparire */
        var altri = _vociDisco('altri');
        if (altri.length) _gruppo(nav, 'altri', t('ec_g_altri', 'Altri documenti'), altri);

        return nav;
    }

    /* ══ F2 — LO SCHELETRO DELLA v2: sidebar coi PROGETTI, area S1 ════════════
       La sidebar smette di elencare i documenti e elenca i progetti del
       contesto (D1: le briciole filtrano QUALI progetti, la sidebar sceglie
       QUALE); i documenti passano nell'area come tabelle per genere — le
       stesse di INSEGNA (`tabelleMateriali`), su `_materiali()` (F1).
       ⚠️ La sidebar riusa le VOCI del motore ({id, etichetta, icona, attiva}),
       non le tabelle: è un elenco di scelta, non una griglia di dati (§5-F2). */
    function _navV2() {
        var nav = [];
        var T = window.MappAITeach;
        var corrente = null;
        try { corrente = (_mappe && T && T.mappaCorrente) ? T.mappaCorrente(_mappe) : null; } catch (e) { }
        var voci = (_mappe || []).map(function (m) {
            return {
                id: 'prog:' + m.id, etichetta: m.nome,
                icona: (m.v && m.v.extractionMode === 'lettura') || (m.p && m.p.type === 'lettura') ? 'book-open'
                    : (m.v && m.v.dossier) ? 'image' : (m.type === 'kg' ? 'network' : 'map'),
                /* mentre una mappa si sta aprendo è LEI la scelta, non quella
                   ancora caricata sotto */
                attiva: _inCorsoV2 ? _inCorsoV2 === m.id : !!(corrente && corrente.id === m.id),
                /* «NUOVO» = generato in questa sessione e mai ancora aperto.
                   Sparisce al primo clic, e sparisce anche in INSEGNA: la
                   lista dei nuovi è una sola (`MappAIGen`). */
                badge: (window.MappAIGen && MappAIGen.eNuovo && MappAIGen.eNuovo(m)) ? t('ec_nuovo', 'NUOVO') : '',
                /* 0094 (lotto E): un nome dato dall'app propone il titolo */
                sotto: (T && T.propostaNome && T.propostaNome(m)) ? t('rn_provvisorio', 'nome provvisorio: Rinomina… propone «{nome}»').replace('{nome}', T.propostaNome(m)) : '',
                chiude: false
            };
        });
        /* intestazione SENZA `collassabile`: un gruppo piegato qui nasconderebbe
           l'unico elenco di scelta della console (e la memoria `_chiusi` dei
           generi non c'entra coi progetti) */
        nav.push({ gruppo: t('ec_g_progetti', 'Progetti'), id: 'g:prog', contatore: voci.length });
        /* Una colonna di sole intestazioni per il validatore È «senza
           navigazione» (le intestazioni non contano come voci — e ha ragione:
           non c'è niente da scegliere). La riga `vuoto:` dice lo stato — sta
           arrivando l'elenco, o non c'è niente in questo contesto — ed è già
           ignorata dal gestore `__nav`, come le sue sorelle. */
        if (!voci.length) {
            nav.push({
                id: 'vuoto:prog', chiude: false,
                etichetta: _mappe === null
                    ? t('ec_prog_cerco', 'Cerco i progetti…')
                    : t('ec_bric_vuoto', '— nessun progetto per questa classe e materia —')
            });
        }
        voci.forEach(function (v) { nav.push(v); });
        return nav;
    }
    /* la mappa in caricamento, vista dalla nav v2. ⚠️ Doppione dichiarato di
       `_inCorso` (che vive dentro `open()` e qui non si legge): F5 riordina lo
       stato, in F2 si tiene il segnale minimo per non toccare `open()` a metà. */
    var _inCorsoV2 = null;

    /* L'area in S1: la FONTE come prima tabella (D2 — `tabelleMateriali` non la
       conosce, il suo mestiere sono i generi di documento), poi i generi. */
    /* ── LA FOTO DI UN DOSSIER, PER LA HOME (0069, giro 11) ─────────────────────
       L'immagine originale vive in `Allegati/` (la copia la pipeline col nome del
       titolo); l'elenco si legge una volta per vault, come `_disco`, e al suo
       arrivo la console si ridisegna. Quale file: la regola del pannello di G2
       (`MappAIReviewFonte.trovaFoto`: il nome del titolo, poi l'unica immagine). */
    var _allegati = null, _allegatiVault = '';
    function _eDossierAperto() {
        try {
            var st = _appState(), n0 = _mappaAperta() && st && st.db && st.db.nodes && st.db.nodes[0];
            return !!(n0 && n0.id === 'fonte_0');     /* lo stesso segnale di `_montaAnteprimaFoto` */
        } catch (e) { return false; }
    }
    function _fotoDelDossier() {
        var s = _appState(), api = window.electronAPI, vp = (s && s.activeVaultPath) || '';
        if (!vp || !api || !api.vaultMaterialsList) return '';
        if (_allegatiVault !== vp) {
            _allegatiVault = vp; _allegati = null;
            api.vaultMaterialsList({ vaultPath: vp, dir: 'Allegati' }).then(function (r) {
                if (_allegatiVault !== vp) return;
                _allegati = ((r && r.files) || []).map(function (f) { return f && f.name; }).filter(Boolean);
                rifaiEsterno();
            }).catch(function () { if (_allegatiVault === vp) _allegati = []; });
        }
        if (!_allegati || !window.MappAIReviewFonte || !window.MappAIReviewFonte.trovaFoto) return '';
        var nome = window.MappAIReviewFonte.trovaFoto(_allegati, (s && s.rootNodeLabel) || '');
        return nome ? 'Allegati/' + nome : '';
    }
    function _tabelleV2() {
        var lista = _materiali();
        if ((_appState() || {}).extractionMode === 'lettura') {
            var gruppi = [];
            lista.forEach(function (m) {
                var g = gruppi.find(function (x) { return x.titolo === m.tipo; });
                if (!g) {
                    g = { id: 'g:lettura-' + (m.format || gruppi.length), titolo: m.tipo,
                        colonne: m.audience === 'source' ? [{ etichetta: t('lt_col_nome', 'Nome') }] : [{ etichetta: t('lt_col_nome', 'Nome') },
                            { etichetta: t('pl_working_description', 'Contenuto') },
                            { etichetta: t('mm_azioni', 'Azioni'), ordinabile: false, larghezza: 'calc(3 * var(--mm-ctl-h) + 2 * var(--mm-btn-gap))' }], righe: [] };
                    gruppi.push(g);
                }
                var azioni = [];
                if (m.modificabile) azioni.push({ id: 'modifica:' + m.id, icona: 'pencil', etichetta: t('ec_modifica', 'Modifica'), ruolo: 'quieto', soloIcona: true });
                if (m.clonabile) azioni.push({ id: 'clona:' + m.id, icona: 'copy', etichetta: t('ec_clona_t', 'Fai una copia'), ruolo: 'quieto', soloIcona: true });
                if (m.eliminabile) azioni.push({ id: 'del:' + m.id, icona: 'trash-2', etichetta: t('lt_sm_delete', 'Elimina'), ruolo: 'quieto', soloIcona: true });
                g.righe.push({ id: 'm:' + m.id, chiude: false, celle: m.audience === 'source' ? [m.titolo] : [m.titolo, m.descrizione || '', { azioni: azioni }] });
            });
            return gruppi;
        }
        var fonte = lista.filter(function (m) { return m.tipo === 'Fonte'; });
        var resto = lista.filter(function (m) { return m.tipo !== 'Fonte'; });
        /* 0069, giro 11: per un dossier da foto, a interruttore acceso, «Fonte» è la
           scheda «Analisi della fonte» più l'immagine originale (regola del core,
           `fonteDellaHome`); spento, o un progetto da PDF, la riga sopra resta lei */
        var DFc = window.MappAIDossierFonteCore, accesoDF = false;
        try { accesoDF = !!(DFc && DFc.fonteDellaHome && DFc.acceso(window.localStorage)); } catch (e) { accesoDF = false; }
        if (accesoDF && _eDossierAperto()) {
            var div = DFc.fonteDellaHome({ acceso: true, dossier: true, materiali: lista, foto: _fotoDelDossier() });
            fonte = div.fonte; resto = div.resto;
        }
        var tabs = [{
            id: 'g:fonte', titolo: t('ec_g_fonte', 'Fonte'),
            colonne: [{ etichetta: t('lt_col_nome', 'Nome'), larghezza: '' }],
            righe: fonte.map(function (m) {
                return { id: 'm:' + m.id, chiude: false, celle: [m.titolo] };
            })
        }, _tabellaFigure()];
        var attesa = _righeInAttesa();
        var T = window.MappAITeach;
        if (T && T.tabelleMateriali) {
            try { tabs = tabs.concat(T.tabelleMateriali(attesa.length ? resto.concat(attesa) : resto, false, 'elabora') || []); } catch (e) { }
        }
        if (attesa.length) _conChip(tabs);
        return tabs;
    }

    /* ── LE FONTI DI UNA MAPPA GIÀ IN MEMORIA (0114, gate 3 del 20/10) ─────────────
       Una mappa ripristinata dall'autosalvataggio, o appena generata in CREA dopo un
       ricaricamento, sta in memoria SENZA le sue fonti: la colonna la vede «già
       aperta», `_cambiaMappa` non parte, e l'unica strada che le rimette dal vault
       (`ripristinaFontiDalVault`, chiamata da `directLoadVault`) non si percorre.
       Visto al gate: «Fonte» col solo «Testo» e «Figure» vuota sul progetto appena
       generato. Qui si fa la stessa chiamata all'apertura, solo se c'è un vault e
       le fonti sono vuote (quelle in memoria sono sempre le migliori); all'arrivo si
       ridisegna, con lo stesso patto asincrono di `_caricaDisco`. */
    function _ripristinaFonti() {
        try {
            var st = _appState(), E = EL();
            if (!st || !st.activeVaultPath || (st.sources || []).length || !E || !E.ripristinaFontiDalVault) return;
            /* ⚠️ `rifai` vive dentro `open()`: da qui si ridisegna con `rifaiEsterno`, come il disco */
            Promise.resolve(E.ripristinaFontiDalVault(st.activeVaultPath))
                .then(function (n) { if (n && _aperta) rifaiEsterno(); })
                .catch(function () { });
        } catch (e) { }
    }

    /* ── LA TABELLA «FIGURE» (packet 0114, D2; Giacomo, 20/10: «tabella sempre presente») ──
       Subito dopo «Fonte»: una riga per PDF che ha un dossier delle figure, con le stesse
       QUATTRO colonne delle tabelle dei materiali (Nome · Figure lette · Da controllare ·
       Controllate dal docente): «Da controllare» dice il numero o «tutte controllate». I
       numeri li dà la vista di ELABORA, che li chiede al core (`dossier.daControllare`,
       `dossier.controllata`: un posto solo). Vuota, la tabella resta, come le altre: dice che
       il genere esiste e che qui non c'è niente da controllare. La riga apre la vista nella
       tela come il PDF (`src:fig:<i>`, `_dipingi`). ⚠️ Il numero è scritto altrove (trappola
       15): la vista lo annuncia con `mappai-figure-cambiata`. ⚠️ Le quattro colonne non sono
       un vezzo: `_conChip` e la prova «A» di tests/materiali-attesa.test.js trattano ogni
       tabella dopo «Fonte» come una tabella a quattro colonne (l'ultima larga per il chip). */
    function _tabellaFigure() {
        var righe = [];
        try {
            var E = EL(), per = {};
            (E && E.figTabella ? E.figTabella() : []).forEach(function (f) { per[f.nome] = f; });
            _pdf().forEach(function (p, i) {
                var f = per[_nomePdf(p, i)];
                if (!f) return;
                righe.push({ id: 'm:src:fig:' + i, chiude: false, celle: [f.nome, String(f.totale),
                    f.daControllare ? String(f.daControllare) : t('fig_tutte_controllate', 'tutte controllate'), String(f.controllate)] });
            });
        } catch (e) { righe = []; }
        return {
            id: 'g:figure', titolo: t('fig_vista', 'Figure'),
            colonne: [{ etichetta: t('lt_col_nome', 'Nome'), larghezza: '' }, { etichetta: t('fig_col_lette', 'Figure lette') },
                { etichetta: t('fig_sez_controlla', 'Da controllare') }, { etichetta: t('fig_sez_controllate', 'Controllate dal docente') }],
            righe: righe, vuota: t('fig_tab_vuota', 'Nessuna figura letta in questo progetto')
        };
    }

    /* ── I MATERIALI CHE ASPETTANO LA G2 (0090, parte A) ──────────────────────
       Giacomo, 12/10: nelle tabelle di ogni tipo «le righe con il chip sono solo
       quelle dei materiali che necessitano la validazione per essere generati».
       Le regole sono del core (`MappAIMaterialiAttesaCore.righe`): qui si danno
       alla lista nella forma di `_materiali()`, e `tabelleMateriali` (letto e
       mai modificato) le mette nella tabella della loro categoria. Interruttore
       `mappai_elabora_attesa` ('0' = niente righe). */
    /* 0094 (lotto F2, difetto 9): il manifesto conta solo per il SUO progetto. Se
       quello in memoria è di un altro (`diQuestoProgetto`), vale il pipeline.json
       della cartella attiva, letto da `_caricaDisco` insieme ai file. */
    function _progettoAperto() {
        var st = _appState() || {}, sm = null;
        try { sm = (typeof StorageManager !== 'undefined') ? StorageManager : null; } catch (e) { sm = null; }
        return { projectId: sm ? sm.currentProjectId : null, vaultPath: st.activeVaultPath || '' };
    }
    function _manifestoDelProgetto() {
        var C = window.MappAIMaterialiAttesaCore, st = _appState() || {}, chi = _progettoAperto();
        if (!C || !C.diQuestoProgetto) return st._pipelineManifest;
        if (C.diQuestoProgetto(st._pipelineManifest, chi)) return st._pipelineManifest;
        /* il pipeline.json letto dal disco della cartella attiva è suo per definizione */
        return (_discoVault && _discoVault === chi.vaultPath) ? _discoManifest : null;
    }
    function _g2InAttesa() {
        var C = window.MappAIMaterialiAttesaCore;
        try { return !!(C && C.acceso(window.localStorage) && C.g2InAttesa(_manifestoDelProgetto(), _progettoAperto())); }
        catch (e) { return false; }
    }
    function _righeInAttesa() {
        var C = window.MappAIMaterialiAttesaCore;
        try { if (!C || !C.acceso(window.localStorage)) return []; } catch (e) { return []; }
        var st = _appState() || {};
        if (st.extractionMode === 'lettura') return [];
        return C.righe(_manifestoDelProgetto(), _progettoAperto()).map(function (r) {
            return { id: r.id, titolo: t(r.chiave, r.nome), tipo: r.tipo, data: 0, archivio: false,
                voce: false, cls: '', disc: '', attesa: true };
        });
    }
    /* La riga in attesa non è un file né una sorgente: niente «Tipo», niente
       comandi del file; nella colonna delle azioni il chip «Completa
       validazione», che fa lo stesso gesto del clic sul nome (bivio 2:
       «sia il click sul nome che il click sul chip portano a G2»). La colonna
       delle azioni si allarga in TUTTE le tabelle, che stanno impilate e devono
       restare allineate (vedi `_larghezzaComandi` di landing-teach). */
    function _conChip(tabs) {
        var C = window.MappAIMaterialiAttesaCore;
        var et = t('ea_chip', 'Completa validazione');
        /* Space Mono a 12px (`--mm-btn-fs`) ≈ 7,2px per carattere; imbottitura
           14+14, bordo 1+1, cella 12+12 */
        var serve = Math.ceil(et.length * 7.2) + 54;
        tabs.forEach(function (tb) {
            if (!tb || !tb.colonne || !tb.colonne.length || tb.id === 'g:fonte') return;
            var ultima = tb.colonne[tb.colonne.length - 1];
            var ora = parseInt(ultima.larghezza, 10) || 0;
            if (ora < serve) ultima.larghezza = serve + 'px';
            (tb.righe || []).forEach(function (r) {
                var mid = String(r.id || '').replace(/^m:/, '');
                if (!C.eRiga(mid) || !r.celle) return;
                if (r.celle.length > 2) r.celle[1] = '—';
                r.celle[r.celle.length - 1] = { azioni: [{ id: 'chip:' + mid, etichetta: et, ruolo: 'secondario' }] };
            });
        });
    }

    function _schemaV2() {
        var s = {
            titolo: t('ui_landing_elabora', 'Elabora'),
            icona: 'wand-2', taglia: 'xl', layout: 'console', piena: true,
            invio: false, veloChiude: false,
            contesto: [],
            nav: _navV2(),
            sezioni: []
        };
        if (_doc) {
            /* S2 (anteprima) e S3 (editor): la tela SOSTITUISCE le tabelle —
               sono stati ALTERNATIVI, mai insieme (§7.3). Che cosa ci si
               disegna dentro lo decide `_dipingi` leggendo `_doc`/`_voce`. */
            s.tela = { id: 'elab' };
            /* la FONTE porta i suoi comandi sopra il documento (D2), più
               l'uscita — in S3 no: entrando in modifica i comandi
               dell'anteprima SPARISCONO (D5), e la fonte in S3 non ci va mai */
            if (_doc.natura === 'src' && !_doc.editing && EL() && EL().sourceActions) {
                /* 0096 (A, Giacomo 14/10): «allineati partendo da destra, anche per
                   evitare che la maniglia della sidebar li copra parzialmente». La
                   `colonna: 'barra'` del motore è proprio questo (comandi spinti a
                   destra sopra un editor, la usa INSEGNA): nessuna regola nuova su
                   `.mm-sez__azioni`, che è di tutte le console. Con l'interruttore
                   `mappai_comandi_fonte` a '0', la sezione di prima, a sinistra. */
                var aDestra = !EL().comandiFonte || EL().comandiFonte();
                s.sezioni.push({
                    id: 'src-cmd', nuda: true, colonna: aDestra ? 'barra' : null,
                    azioni: EL().sourceActions().map(function (a) {
                        /* `spento`/`fumetto` (0096, B): «Aggiungi PDF» col PDF già allegato */
                        return { id: a.id, etichetta: a.etichetta, icona: a.icona, ruolo: a.ruolo || 'quieto', chiude: false,
                            spento: !!a.spento, fumetto: a.fumetto || '' };
                    }).concat([{
                        id: 'esci-doc', etichetta: t('ec_esci', 'Esci'), icona: 'x',
                        ruolo: 'quieto', chiude: false
                    }])
                });
            }
        } else if (_progettoDelContesto()) {
            /* S1: le tabelle, e il gesto che aggiunge un documento all'elenco. */
            s.tabelle = _tabelleV2();
            s.sezioni.push({
                id: 'nuovo', nuda: true,
                azioni: [{
                    id: 'crea', etichetta: t('ec_crea', 'Crea nuovo'), icona: 'plus',
                    ruolo: 'primario', chiude: false
                }]
            });
        }
        /* senza progetto: nessun invito nell'area — il gesto è nella colonna,
           e una riga di testo in mezzo allo spazio vuoto non lo insegnava */
        return s;
    }

    /* Lo schema della console. La v1 (colonna a sette gruppi) è stata potata il
       13/8/26, dopo che questa aveva retto due giorni d'uso vero: teneva in vita
       una seconda risposta alla stessa domanda, e ogni ritocco andava fatto due
       volte o dimenticato una. Storia in git; il kill-switch
       `mappai_elabora_v2` non esiste più. */
    function _schema() {
        return _schemaV2();
    }
    function _eFonte() { return _voce.indexOf('src:') === 0; }

    /* Porta l'host dell'editor DENTRO la tela della console e fa disegnare
       l'editor. ⚠️ L'id è quello che l'editor cerca (`_host()` in
       mappai-doc-editor.js): un secondo elemento con lo stesso id, mentre il
       workspace classico è aperto, farebbe disegnare nel posto sbagliato — per
       questo la console si apre AL POSTO del workspace, non sopra. */
    function _montaHost(box) {
        var tela = (box || document).querySelector('.mm-tela[data-tela="elab"]');
        if (!tela) return null;
        var host = tela.querySelector('#elab-doc-host');
        if (!host) {
            /* il segnaposto se ne va appena c'è un documento da mostrare */
            var vuota = tela.querySelector('.mm-tela__vuota');
            if (vuota) vuota.remove();
            var vfile = tela.querySelector('#ec-file');
            if (vfile) { _fermaLettura(); vfile.remove(); }   /* un contenitore per volta */
            host = document.createElement('div');
            host.id = 'elab-doc-host';
            host.className = 'ec-host';
            tela.appendChild(host);
        }
        return host;
    }

    /* ⚠️ `read-vault-file` ritorna SEMPRE base64 (è nato per i PDF) e il testo va
       decodificato con `TextDecoder`, MAI con `atob` da solo: `atob` rende byte,
       non caratteri UTF-8, e «Elettricità» diventa «ElettricitÃ ». Stessa
       trappola già risolta in `mappai-elabora.js` (`_testoDaBase64`). */
    function _testoDaBase64(b64) {
        try {
            var bin = atob(b64);
            var buf = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(buf);
        } catch (e) { return ''; }
    }

    /* Le regole `.de-bar` (la barra dei quattro editor) sono dichiarate in
       `mappai-doc-editor.js` e iniettate dentro il suo `render()`: aprendo un
       file del vault senza aver mai aperto un editor non ci sarebbero, e la
       barra uscirebbe nuda. `assicuraStili` esiste per questo; la guardia perché
       arriva da un filone parallelo. */
    function _stiliEditor() {
        try { if (DEd() && DEd().assicuraStili) DEd().assicuraStili(); } catch (e) { }
    }

    /* Il lettore del documento ospitato è IL CHIP dell'app (`MappAITTS.mountChip`),
       non una seconda implementazione: è il comando che gli studenti con DSA
       usano su questi fogli, e il documento ne porta uno suo solo perché lo si
       apre anche fuori di qui.
       ⚠️ Il corpo da leggere sta DENTRO l'iframe: `.bs-body` è il corpo delle
       sintesi, il `body` del documento è il ripiego per tutto il resto.
       ⚠️ Il chip segue il toggle degli strumenti compensativi come ovunque
       nell'app: con `mappai_tts_tool_enabled` spento nasce nascosto. */
    /* La voce naturale è DENTRO il documento (base64) o è solo un riferimento a
       un file che gli sta accanto? Il generatore lo dichiara con
       `data-ap-src="embedded"`; il ripiego sul `src` serve ai documenti scritti
       prima che l'attributo esistesse.
       ⚠️ Si legge l'ATTRIBUTO, non la proprietà `.src`: la proprietà risolve da
       sé il percorso relativo e restituisce sempre un URL assoluto — non direbbe
       mai «non è `data:`», e il controllo non distinguerebbe niente. */
    function _audioIncorporato(doc) {
        try {
            var a = doc.getElementById('ap-audio');
            if (!a) return false;
            var dichiarato = a.getAttribute('data-ap-src');
            if (dichiarato) return dichiarato === 'embedded';
            var s = a.getAttribute('src') || '';
            if (!s) { var so = a.querySelector('source'); s = (so && so.getAttribute('src')) || ''; }
            return /^data:/i.test(s.trim());
        } catch (e) { return false; }
    }
    /* ── SCARICARE LA COPIA DA CONSEGNARE ────────────────────────────────────
       Il file che vive nel vault è LEGGERO: punta all'MP3 che gli sta accanto
       (63 KB invece di 8,3 MB). Va benissimo finché i due file restano nella
       stessa cartella — ma quello che si manda a un allievo deve bastare a sé
       stesso, o arriva muto e nessuno se ne accorge, perché il documento ripiega
       da solo sulla voce di sistema.
       Qui si prende l'HTML COM'È e gli si sostituisce il riferimento con l'audio
       vero in base64. Non si rigenera niente: rigenerare vorrebbe dire ricavare
       i dati della sintesi dal documento finito, e una correzione scritta a mano
       dal docente andrebbe persa. */
    function _mimeAudio(nome) {
        var e = (/\.([A-Za-z0-9]+)$/.exec(String(nome || '')) || [])[1];
        return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' })[String(e).toLowerCase()] || 'audio/mpeg';
    }
    /* Il nome dell'MP3 dichiarato dal documento, in chiaro. Nel markup viaggia
       codificato come segmento d'URL (gli spazi del nome della mappa sono `%20`)
       e con un percorso relativo davanti: qui si torna al nome del file. */
    function _audioFratello(html) {
        var m = /<audio[^>]*id="ap-audio"[^>]*>[\s\S]*?<source[^>]*src="([^"]+)"/i.exec(html);
        if (!m) return '';
        var s = String(m[1]).trim();
        if (/^data:/i.test(s)) return '';        // già dentro: non c'è niente da prendere
        try { s = decodeURIComponent(s); } catch (e) { /* già in chiaro */ }
        return s.split('/').pop();
    }
    function _scaricaTesto(nome, testo) {
        /* La copia che si consegna porta la taglia di testo corrente, come
           l'anteprima: un file vecchio scaricato da qui arriverebbe altrimenti
           coi corpi di prima, e l'allievo leggerebbe una cosa diversa da quella
           che il docente ha appena guardato. Non fa nulla sui documenti nuovi. */
        try {
            if (window.MappAIDocBar && window.MappAIDocBar.scalaTestoInHtml) {
                testo = window.MappAIDocBar.scalaTestoInHtml(testo);
            }
        } catch (e) { /* meglio il file com'è che nessun file */ }
        var b = new Blob([testo], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = nome;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function _scaricaHtml(vaultPath, relPath, nomeFile, html) {
        var nomeAudio = _audioFratello(html);
        if (!nomeAudio || !api.readVaultFile) {
            _scaricaTesto(nomeFile, html);
            toast(t('ec_html_ok', '✓ HTML scaricato'), 'success');
            return;
        }
        Promise.resolve(api.readVaultFile({ vaultPath: vaultPath, relPath: 'Materiale Studio/' + nomeAudio }))
            .then(function (res) {
                if (!res || !res.ok || !res.base64) {
                    /* L'MP3 non c'è più accanto al documento: si scarica comunque
                       il testo, dicendo che la voce naturale non ci sarà. Meglio
                       un file senza voce che nessun file. */
                    _scaricaTesto(nomeFile, html);
                    toast(t('ec_html_no_audio', '✓ HTML scaricato — senza voce naturale: l\'audio non è più nella cartella'), 'warning');
                    return;
                }
                var uri = 'data:' + _mimeAudio(nomeAudio) + ';base64,' + res.base64;
                /* Si sostituisce SOLO il `src` del `<source>` dentro `#ap-audio`,
                   e si aggiorna la dichiarazione che dice di che natura è: chi
                   ospita il documento in un iframe la legge per sapere se la sua
                   barra interna va lasciata al suo posto. */
                var fuori = html.replace(/(<audio[^>]*id="ap-audio"[\s\S]*?<source[^>]*src=")([^"]*)(")/i,
                    function (_, pre, __, post) { return pre + uri + post; })
                    .replace(/(<audio[^>]*id="ap-audio"[^>]*data-ap-src=")[^"]*(")/i, '$1embedded$2');
                _scaricaTesto(nomeFile, fuori);
                toast(t('ec_html_ok_audio', '✓ HTML scaricato — con la voce naturale incorporata'), 'success');
            })
            .catch(function () {
                _scaricaTesto(nomeFile, html);
                toast(t('ec_html_ok', '✓ HTML scaricato'), 'success');
            });
    }

    function _montaChip(host, doc) {
        if (!host || !doc || !window.MappAITTS || !window.MappAITTS.mountChip) return;
        try {
            var chip = window.MappAITTS.mountChip(host, function () {
                return doc.querySelector('.bs-body') || doc.body;
            });
            /* ⚠️ `mountChip` nasce SPENTO: si allinea a `isEnabled()`, che legge
               `mappai_tts_tool_enabled` e vale FALSO finché il docente non accende
               gli strumenti compensativi. Qui quel cancello non vale, ed è la
               differenza fra un lettore e nessun lettore: la barra del documento
               — che il chip sta sostituendo — il suo player ce l'aveva sempre.
               Nasconderla e non mettere niente al suo posto sarebbe una perdita
               secca proprio sul documento che si consegna a chi ha un DSA. */
            if (chip) chip.style.display = '';
        } catch (e) { }
    }
    /* Lasciando il documento la lettura si ferma: l'iframe se ne va, ma la voce
       del browser non è appesa al DOM e continuerebbe a parlare di una pagina
       che non c'è più. */
    function _fermaLettura() {
        try { if (window.MappAITTS && window.MappAITTS.stop) window.MappAITTS.stop(); } catch (e) { }
        try { if (window.MappAILetturaVeloce) window.MappAILetturaVeloce.chiudi(); } catch (e) { }
        /* 0069, giro 12: chi smonta l'anteprima passa di qui (vedi `_montaFile`,
           `_montaHost`): anche il blob dell'immagine se ne va */
        _revocaFoto();
    }
    /* ── L'IMMAGINE NELL'ANTEPRIMA (0069, giro 12) ───────────────────────────────
       Un <img> con un blob URL, centrato, intero (`object-fit: contain`), sullo
       stesso fondo dell'iframe. Un blob solo alla volta: si revoca quando se ne
       crea un altro e quando l'anteprima si smonta (`_fermaLettura`). Se l'immagine
       non si decodifica, la frase di sempre invece del bianco. */
    var _urlFoto = null;
    function _revocaFoto() {
        if (!_urlFoto) return;
        try { URL.revokeObjectURL(_urlFoto); } catch (e) { }
        _urlFoto = null;
    }
    function _mostraImmagine(host, b64, mime, nome) {
        _revocaFoto();
        var ko = function () {
            box.innerHTML = '<p style="font-family:monospace;padding:24px">' + t('ec_file_ko', 'Non riesco ad aprire questo file') + '</p>';
            _revocaFoto();
        };
        var box = document.createElement('div');
        box.style.cssText = 'flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff';
        host.appendChild(box);
        try {
            var bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            _urlFoto = URL.createObjectURL(new Blob([bytes], { type: mime }));
        } catch (e) { ko(); return; }
        var img = document.createElement('img');
        img.alt = nome || '';
        img.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain';
        img.onerror = ko;
        img.src = _urlFoto;
        box.appendChild(img);
    }

    /* ── 0096 (E): LA CATENA DEI PERCHÉ IN ELABORA, UNA BARRA SOLA ─────────────
       Giacomo, 14/10: «la doppia barra deve sparire e mettere il toggle 'modalità
       esercizio' deve entrare nella prima barra e quando premo stampa viene
       stampata la modalità esercizio ON o OFF che è attiva a schermo». Il documento
       della catena porta una barra sua («Catena dei perché · Modalità esercizio ·
       Stampa», mappai-causal-chains.js): fuori da ELABORA (il file, la finestra a
       sé, l'HTML consegnato) è l'unico modo di accendere l'esercizio, e lì resta
       (D2). Qui la spegne `nascondiInIframe` e il suo interruttore passa nella
       prima barra, subito prima di «Stampa».
       L'esercizio è la classe `cc-ex` sul `body` del documento, la stessa che
       accende il bottone della barra interna: «Stampa» (`stampaIframe`) stampa
       l'iframe com'è, quindi esce lo stato a schermo. Lo stato vive nel documento
       aperto (`stato.esercizio`): un ridisegno della console rifà l'iframe, e
       l'interruttore lo ritrova. */
    function _comandiFonte() {
        try { return !EL() || !EL().comandiFonte || EL().comandiFonte(); } catch (e) { return true; }
    }
    /* Il nome del PDF della Catena (gate del 15/10, Giacomo: «'[nome progetto] - catena
       perché[ - esercizio].pdf', ' - esercizio' va aggiunto solo se è stato esportato in
       'Modalità esercizio'»). Si calcola al clic su «Stampa», perché dipende dall'interruttore.
       Con l'estensione: `stampaIframe` toglie l'ultima, e un nome di progetto con un punto
       («9.b …») senza estensione perderebbe un pezzo. */
    function _nomeCatena(esercizio) {
        var p = '';
        try { p = (EL() && EL().nomeProgetto) ? EL().nomeProgetto() : ''; } catch (e) { p = ''; }
        return (p ? p + ' - ' : '') + t('ec_cc_file', 'catena perché') +
            (esercizio ? ' - ' + t('ec_cc_file_es', 'esercizio') : '') + '.pdf';
    }
    /* LA STAMPA COL NOME GIUSTO (gate dello 0096, 15/10). Misurato in Electron: la finestra
       di stampa di un documento dentro la console propone come nome del PDF il titolo della
       FINESTRA di MappAI («MappAI — Generatore AI…»), non quello del documento che
       `stampaIframe` presta per la stampa. Quindi il nome si presta anche alla finestra, e
       torna com'era a stampa chiusa (`afterprint`, su tutte e due; ripiego dopo 60 s se
       l'evento non arriva). `nome` con l'estensione: `stampaIframe` toglie l'ultima. */
    function _stampaConNome(fr, nome) {
        var D = window.MappAIDocBar;
        if (!D || !D.stampaIframe) return false;
        var prima = document.title, rimesso = false, w = null;
        try { w = fr.contentWindow; } catch (e) { w = null; }
        var rimetti = function () {
            if (rimesso) return;
            rimesso = true;
            document.title = prima;
            try { if (w && w.removeEventListener) w.removeEventListener('afterprint', rimetti); } catch (e) { }
            try { if (window.removeEventListener) window.removeEventListener('afterprint', rimetti); } catch (e) { }
        };
        try { if (w && w.addEventListener) w.addEventListener('afterprint', rimetti); } catch (e) { }
        try { if (window.addEventListener) window.addEventListener('afterprint', rimetti); } catch (e) { }
        var tm = setTimeout(rimetti, 60000);
        if (tm && tm.unref) tm.unref();          /* nei test in Node: il ripiego non tiene vivo il processo */
        document.title = String(nome || prima).replace(/\.[^.]+$/, '');
        var ok = D.stampaIframe(fr, nome);
        if (!ok) rimetti();
        return ok;
    }
    function _eCatena(d) {
        try { return !!(d && d.querySelector && d.querySelector('.cc-legend, .cc-conn-txt')); } catch (e) { return false; }
    }
    function _interruttoreEsercizio(barra, prima, fr, stato) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'de-btn de-interruttore';
        b.textContent = t('cc_exercise', 'Modalità esercizio');
        b.title = t('ec_cc_es_tip', 'Nasconde i connettivi: l\'allievo li completa. «Stampa» stampa quello che vedi.');
        function applica() {
            var on = !!(stato && stato.esercizio);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            var d = null;
            try { d = fr.contentDocument; } catch (e) { d = null; }
            if (d && d.body && d.body.classList) { if (on) d.body.classList.add('cc-ex'); else d.body.classList.remove('cc-ex'); }
        }
        b.addEventListener('click', function () {
            if (stato) stato.esercizio = !stato.esercizio;
            applica();
        });
        barra.insertBefore(b, prima || null);
        applica();
        return { applica: applica };
    }
    /* I puntini di una Catena salvata prima dello 0096 (D): il file li porta nel
       suo `<style>`; nell'anteprima si coprono, solo a schermo, e il file non
       cambia. In stampa il documento era già bianco. */
    function _fondoPiatto(d) {
        try {
            if (!d || d.getElementById('ec-cc-fondo')) return;
            var st = d.createElement('style');
            st.id = 'ec-cc-fondo';
            st.textContent = '@media screen{body{background-image:none !important;background-color:#f8fafc !important}}';
            (d.head || d.documentElement).appendChild(st);
        } catch (e) { }
    }

    /* Un documento del VAULT nella tela: sola lettura. È un file finito (HTML o
       PDF), non un set da correggere — si mostra con la stessa tecnica di INSEGNA
       (byte via IPC → iframe). Sopra, UNA barra sola, con la veste `.de-bar` dei
       quattro editor: prima ce n'erano due impilate, quella disegnata qui a mano
       e quella che il documento si porta dentro. */
    /* `opts` (solo dalla v2, F3 — senza, la barra è quella di sempre):
         · `modifica`     → il file è la SECONDA natura di un set fuso (F1): il
                            bottone «Modifica» apre il SET nell'editor (D4: la
                            sorgente c'è, anche se il file è un PDF finito);
         · `dopoModifica` → chiamata quando la sintesi passa all'editor
                            (`synfile:`), così la macchina a stati sa di essere
                            in S3 senza che questa funzione conosca `_doc`;
         · `esci`         → il bottone «Esci» in coda alla barra (S2 → S1). */
    /* ── I LINK INTERNI DELL'ANTEPRIMA (0069, giro 11; Giacomo al gate 3) ───────
       Un clic su un numero di nota della sintesi (`<a href="#bs-cite-…">`,
       mappai-branch-synthesis.js) caricava la LANDING dentro il riquadro: in un
       documento `srcdoc` un `href="#x"` si appoggia all'indirizzo della pagina
       madre (`index.html#x`), e l'iframe ci naviga. Guasto di prima, che lo 0069
       rende frequente (ogni dossier ha note cliccabili). Qui un clic su un link
       interno resta nel documento: niente navigazione, si porta in vista
       l'elemento con quell'id. Vale per tutte le sintesi, PDF compresi.
       Una volta per documento: il segno sta sul documento stesso. */
    function _agganciaNote(d) {
        if (!d || !d.addEventListener || d.__ecNote) return;
        d.__ecNote = true;
        d.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
            if (!a) return;
            e.preventDefault();
            var id = String(a.getAttribute('href') || '').slice(1), dove = null;
            if (!id) return;
            try { dove = d.getElementById(decodeURIComponent(id)); } catch (er) { dove = d.getElementById(id); }
            if (dove && dove.scrollIntoView) dove.scrollIntoView({ block: 'center' });
        });
    }
    function _montaFile(box, relPath, opts) {
        var tela = (box || document).querySelector('.mm-tela[data-tela="elab"]');
        if (!tela) return;
        /* 0096 (E): lo stato dell'esercizio, se il file è una Catena, vive nel
           documento aperto ADESSO (il `load` arriva dopo) */
        var statoCatena = _comandiFonte() ? (_doc || {}) : null;
        var eCatenaFile = false;      /* si sa al `load`, quando il documento c'è */
        /* l'iframe si ricostruisce da capo a ogni disegno: una lettura in corso
           riguarderebbe un documento che sta per sparire */
        _fermaLettura();
        var vecchio = tela.querySelector('#elab-doc-host'); if (vecchio) vecchio.remove();
        var vs = tela.querySelector('#ec-src'); if (vs) vs.remove();
        var vuota = tela.querySelector('.mm-tela__vuota'); if (vuota) vuota.remove();
        var host = tela.querySelector('#ec-file');
        if (!host) {
            host = document.createElement('div');
            host.id = 'ec-file';
            host.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:0';
            tela.appendChild(host);
        }
        var s = _appState();
        var api = window.electronAPI;
        if (!api || !api.readVaultFile || !s || !s.activeVaultPath) {
            host.innerHTML = '<p style="font-family:monospace;padding:24px">' + t('fx_desktop', 'Disponibile solo nell\'app desktop.') + '</p>';
            return;
        }
        var vaultPath = s.activeVaultPath;
        host.innerHTML = '<p style="font-family:monospace;padding:24px;color:#64748b">' + t('ec_apro', 'Apro…') + '</p>';
        api.readVaultFile({ vaultPath: vaultPath, relPath: relPath }).then(function (r) {
            if (_voce !== 'disk:' + relPath || !_aperta || !host.isConnected || (_appState() || {}).activeVaultPath !== vaultPath) return;          /* nel frattempo ha scelto altro */
            if (!r || !r.ok) {
                host.innerHTML = '<p style="font-family:monospace;padding:24px">' +
                    t('ec_file_ko', 'Non riesco ad aprire questo file') + (r && r.error ? ': ' + r.error : '') + '</p>';
                return;
            }
            var eHtml = /\.html?$/i.test(relPath);
            var mime = /\.pdf$/i.test(relPath) ? 'application/pdf'
                : eHtml ? 'text/html'
                    : /\.(mp3|m4a|wav)$/i.test(relPath) ? 'audio/mpeg' : 'application/octet-stream';
            /* 0069, giro 12: un'IMMAGINE (l'originale di un dossier, da `Allegati/`)
               non va all'iframe `data:` — 8,6 MB diventano un indirizzo di 11 MB,
               oltre il limite di Chromium, e l'iframe resta bianco. Va a un <img>
               con un blob URL (`_mostraImmagine`). La scelta è del core
               (`anteprimaFile`); per HTML, PDF e audio le righe qui sopra e sotto
               restano quelle di prima. */
            var DFv = window.MappAIDossierFonteCore;
            var vistaFile = (DFv && typeof DFv.anteprimaFile === 'function') ? DFv.anteprimaFile(relPath) : null;
            var eImg = !!(vistaFile && vistaFile.modo === 'img');
            if (eImg) mime = vistaFile.mime;
            var nomeFile = String(relPath).split('/').pop();
            _stiliEditor();
            host.innerHTML = '';

            /* ── LA BARRA, una sola, nella veste dei quattro editor ──────────── */
            var barra = document.createElement('div');
            barra.className = 'de-bar';
            var tit = document.createElement('div');
            tit.className = 'de-bar-t';
            tit.textContent = opts && opts.titolo || nomeFile;
            barra.appendChild(tit);
            var sp = document.createElement('div');
            sp.className = 'de-spacer';
            barra.appendChild(sp);
            /* Il posto del chip: si riempie al `load`, quando il documento c'è.
               `flex:0 1 auto` + `min-width:0` perché la barra va a capo: il
               lettore si stringe fin dove la sua barra di avanzamento regge
               (120px, il suo minimo) invece di spingere i bottoni fuori. */
            var chipHost = document.createElement('div');
            chipHost.style.cssText = 'display:inline-flex;align-items:center;flex:0 1 auto;min-width:0';
            barra.appendChild(chipHost);

            function bottone(etichetta, titolo, primario) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'de-btn' + (primario ? ' de-primary' : '');
                b.textContent = etichetta;
                if (titolo) b.title = titolo;
                barra.appendChild(b);
                return b;
            }

            /* v2, set FUSO (F1): il file è il prodotto, il set è la sorgente —
               «Modifica» apre il set. Vince sulla regola delle sintesi qui
               sotto: un file fuso con un set non è mai una sintesi (la fusione
               riguarda solo quiz e flashcard). */
            if (opts && opts.modifica) {
                bottone(t('ec_modifica', 'Modifica'),
                    t('ec_modifica_set_tip', 'Questo file è stato prodotto da un set ancora modificabile: aprilo nell\'editor.'), true)
                    .addEventListener('click', function () {
                        _fermaLettura();
                        opts.modifica();
                    });
            }
            /* «Modifica» solo sulle SINTESI: sono le uniche di cui l'editor sa
               ricostruire il documento leggendone il file. Il genere lo dice la
               regola di INSEGNA (`generePerFile`), non un secondo classificatore.
               ⚠️ Se `openSynthesisFromVault` non c'è, il bottone nemmeno: un
               comando che non fa niente è peggio di un comando che manca. */
            else if (_gruppoDelFile(nomeFile) === 'syn' && DEd() && DEd().openSynthesisFromVault) {
                bottone(t('ec_modifica', 'Modifica'),
                    t('ec_modifica_tip', 'Apri questa sintesi nell\'editor per rivederla.'), true)
                    .addEventListener('click', function () {
                        _fermaLettura();
                        var titolo = nomeFile.replace(/\.[^.]+$/, '');
                        var mappa = (_appState() && _appState().rootNodeLabel) || '';
                        Promise.resolve(DEd().openSynthesisFromVault({
                            vaultPath: vaultPath, relPath: relPath, title: titolo, mapName: mappa
                        })).then(function (ok) {
                            /* `false` = ha rinunciato E ha già avvisato: la voce
                               non cambia, o la colonna direbbe che il documento è
                               nell'editor mentre non ci è mai arrivato. */
                            if (!ok) return;
                            _voce = 'synfile:' + relPath;
                            if (opts && opts.dopoModifica) opts.dopoModifica();
                            rifaiEsterno();
                        }).catch(function () { });
                    });
            }

            var fr = document.createElement('iframe');
            function applicaFont(d, id) {
                if (!opts || !opts.font || !id || !d || !d.head || !window.MappAIFont) return;
                var style = d.getElementById('lettura-document-font');
                if (!style) { style = d.createElement('style'); style.id = 'lettura-document-font'; d.head.appendChild(style); }
                style.textContent = window.MappAIFont.styleDocumento(id);
            }
            if (opts && opts.font && window.MappAIFontCore && window.MappAIFont) {
                var font = document.createElement('select');
                font.className = 'de-ns-sel de-font';
                font.setAttribute('aria-label', t('de_font_lbl', 'Carattere del documento'));
                window.MappAIFontCore.elenco().forEach(function (item) {
                    var option = document.createElement('option'); option.value = item.id;
                    option.textContent = item.etichetta; font.appendChild(option);
                });
                font.value = opts.fontId || window.MappAIFont.attivo();
                font.addEventListener('change', function () {
                    var id = font.value, before = opts.fontId || window.MappAIFont.attivo();
                    font.disabled = true;
                    Promise.resolve().then(function () { return opts.font(id); }).then(function () {
                        if (!host.isConnected || (_appState() || {}).activeVaultPath !== vaultPath) return;
                        opts.fontId = id;
                        applicaFont(fr.contentDocument, id);
                    }).catch(function (e) {
                        font.value = before;
                        toast(e.message || t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'error');
                    }).finally(function () { font.disabled = false; });
                });
                barra.appendChild(font);
            }

            var bStampa = bottone(opts && opts.stampa ? t('de_pdf', 'Crea PDF') : t('de_print', 'Stampa'));
            /* 0128, allargamento 12 (Giacomo, 27/10): «tutte le anteprime dei documenti devono mostrare il bottone di stampa
               con l'icona stampante e senza il testo 'STAMPA'» — come la stampante della barra dell'editor */
            if (!(opts && opts.stampa)) {
                bStampa.textContent = '';
                bStampa.title = t('de_print', 'Stampa');
                bStampa.setAttribute('aria-label', t('de_print', 'Stampa'));
                var icoStampa = document.createElement('i');
                icoStampa.setAttribute('data-lucide', 'printer');
                icoStampa.className = 'w-4 h-4';
                bStampa.appendChild(icoStampa);
            }
            bStampa.addEventListener('click', function () {
                if (opts && opts.stampa) { opts.stampa(); return; }
                /* 🐛 Prima era `f.contentWindow.print()` dentro un catch muto: con
                   l'iframe a origine opaca lancia SecurityError e il bottone non
                   faceva nulla senza dirlo. */
                var ok = _stampaConNome(fr, eCatenaFile ? _nomeCatena(!!statoCatena.esercizio) : nomeFile);
                if (!ok) toast(t('ec_stampa_ko', 'Non riesco a stampare questo documento da qui: aprilo dalla cartella.'), 'warning');
            });

            /* «HTML»: la copia da CONSEGNARE, con la voce naturale dentro. Solo
               sui documenti HTML — un PDF non ha niente da incorporare. Sta
               accanto a «Stampa» perché sono le due uscite del documento: una
               sulla carta, una nelle mani dell'allievo. */
            if (eHtml) {
                bottone(t('ec_html', 'HTML'),
                    opts && opts.consegna ? t('ec_html', 'HTML') : t('ec_html_tip', 'Scarica il documento come file unico, con la voce naturale incorporata: si manda all\'allievo e funziona da solo.'))
                    .addEventListener('click', function () {
                        if (opts && opts.consegna) { opts.consegna(); return; }
                        _scaricaHtml(vaultPath, relPath, nomeFile, _testoDaBase64(r.base64));
                    });
            }

            bottone(t('lt_open_finder', 'Apri nel Finder')).addEventListener('click', function () {
                /* 🐛 Prima si mandava `{filePath}`, ma l'handler `pipeline-open-file`
                   pretende `{vaultPath, relPath}` e senza quelli tornava un errore
                   che nessuno leggeva: il bottone non ha mai aperto niente. */
                if (!api.pipelineOpenFile) { toast(t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
                Promise.resolve(api.pipelineOpenFile({ vaultPath: vaultPath, relPath: relPath }))
                    .then(function (res) {
                        if (res && res.ok === false) toast(t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning');
                    })
                    .catch(function () { toast(t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning'); });
            });

            /* v2 (S2 → S1): l'uscita esplicita, in coda — ESC fa lo stesso, ma
               un gesto visibile non può vivere solo su un tasto. */
            if (opts && opts.esci) {
                bottone(t('ec_esci', 'Esci'), t('ec_esci_tip', 'Chiudi il documento e torna alle tabelle.'))
                    .addEventListener('click', function () { opts.esci(); });
            }

            host.appendChild(barra);
            if (window.safeCreateIcons) window.safeCreateIcons();

            /* ── IL DOCUMENTO ────────────────────────────────────────────────
               ⚠️ Gli HTML entrano con `srcdoc`, non con `src="data:…"`: un
               data-URI è un'ORIGINE OPACA, e da fuori non si potrebbe né
               spegnere la barra interna né stampare (le due funzioni di
               `MappAIDocBar` tornano `false` proprio lì). I PDF restano al
               data-URI: quelli vanno al visore di Chromium, dove `srcdoc` non
               c'entra niente. */
            fr.style.cssText = 'flex:1;min-height:0;width:100%;border:0;background:#fff';
            fr.setAttribute('title', nomeFile);
            var sistemato = false;
            fr.addEventListener('load', function () {
                if (!eHtml || sistemato) return;
                var d = null;
                try { d = fr.contentDocument; } catch (e) { d = null; }
                if (!d || !d.body) return;
                /* ⚠️ Un iframe appena inserito fa un `load` per `about:blank`
                   PRIMA di quello del documento vero: senza questa guardia si
                   spegneva una barra che non c'era e si montava un lettore
                   puntato a una pagina bianca — poi un SECONDO al load vero. */
                var url = '';
                try { url = String((d.location && d.location.href) || ''); } catch (e) { url = ''; }
                if (url === 'about:blank') return;
                sistemato = true;
                // Il ridisegno rilegge l'HTML di lavoro: il font scelto vive nel manifest.
                applicaFont(d, opts && opts.fontId);
                /* 0069, giro 11: PRIMA delle uscite qui sotto (l'audio incorporato
                   esce presto), così vale per ogni documento */
                _agganciaNote(d);
                /* La lettura veloce accanto al lettore: il documento si
                   nasconde e al suo posto resta solo la parola. Prima
                   dell'eccezione dell'audio incorporato, che esce da qui. */
                if (window.MappAILetturaVeloce && !barra.querySelector('.ec-rsvp')) {
                    var bv = document.createElement('button');
                    bv.type = 'button'; bv.className = 'de-btn ec-rsvp';
                    bv.textContent = t('rsvp_titolo', 'Lettura veloce');
                    bv.title = t('rsvp_titolo', 'Lettura veloce');
                    bv.addEventListener('click', function () {
                        try { if (window.MappAITTS) window.MappAITTS.stop(); } catch (e) { }
                        window.MappAILetturaVeloce.daIframe(fr, nomeFile.replace(/\.[^.]+$/, ''));
                    });
                    barra.insertBefore(bv, chipHost.nextSibling);
                }
                /* La taglia del testo PRIMA di ogni altra cosa, e prima
                   dell'eccezione qui sotto: un documento con la voce incorporata
                   esce di qui senza passare dal resto, e resterebbe l'unico a
                   leggersi piccolo. Non fa nulla sui documenti già nuovi. */
                if (window.MappAIDocBar && window.MappAIDocBar.scalaTesto) window.MappAIDocBar.scalaTesto(fr);
                /* Il CARATTERE, subito dopo la taglia e per lo stesso motivo:
                   questo è un FILE, e si porta dentro quello di quando è stato
                   scritto. Senza, cambiando carattere in Cabina l'anteprima
                   restava indietro mentre l'editor mostrava il nuovo — due
                   schermate della stessa cosa che dicevano cose diverse.
                   Non tocca i documenti che un carattere se lo sono scelto.
                   Il file su disco resta com'è finché non lo si salva: quando
                   l'anteprima ha davvero cambiato qualcosa lo dice, o si
                   vedrebbe una cosa e se ne consegnerebbe un'altra. */
                if (window.MappAIFont && window.MappAIFont.applicaInIframe) {
                    var _fnAllineato = window.MappAIFont.applicaInIframe(fr);
                    if (_fnAllineato && window.MappAIFontCore) {
                        _diciCarattere(barra, window.MappAIFontCore.font(_fnAllineato).etichetta);
                    }
                }
                /* ⚠️ ECCEZIONE, e vale SOLO per l'audio INCORPORATO: un
                   documento condiviso può portarsi dentro la voce naturale in
                   base64, e quella il chip dell'app non sa suonarla — legge il
                   testo con la voce di sistema. Lì la barra del documento resta
                   com'è: meglio una barra sola giusta che un lettore che tace.
                   ⚠️ Non basta CHE ci sia un `<audio>`: dal 9/8 la sintesi nel
                   vault ne porta uno che punta all'MP3 fratello con un percorso
                   relativo — che in `srcdoc` non si risolve e resta muto
                   comunque. Con la condizione sulla sola presenza, l'eccezione
                   sarebbe diventata la regola e la barra doppia sarebbe tornata
                   su quasi tutte le sintesi. */
                if (_audioIncorporato(d)) {
                    /* La sua barra resta — è l'unica che sa suonare quell'MP3 —
                       ma senza i pezzi che la barra di sopra ha già: marchio e
                       «Stampa». Dal 10/8 l'audio è incorporato in TUTTE le
                       sintesi del vault, quindi questo è il caso normale, non
                       l'eccezione rara di prima: senza snellirla, «Stampa»
                       comparirebbe due volte a un dito di distanza. */
                    if (window.MappAIDocBar && window.MappAIDocBar.snellisciInIframe) {
                        window.MappAIDocBar.snellisciInIframe(fr);
                    }
                    return;
                }
                if (!window.MappAIDocBar || !window.MappAIDocBar.nascondiInIframe(fr)) return;
                /* 0096 (E): una Catena del vault ha la sua barra spenta qui sopra, e
                   senza l'interruttore l'esercizio non si accendeva più */
                if (statoCatena && _eCatena(d)) {
                    eCatenaFile = true;
                    _fondoPiatto(d);
                    _interruttoreEsercizio(barra, bStampa, fr, statoCatena);
                }
                _montaChip(chipHost, d);
            });
            if (eImg) { _mostraImmagine(host, r.base64, mime, nomeFile); return; }
            if (eHtml) fr.srcdoc = _testoDaBase64(r.base64);
            else {
                /* 0100: PDF e audio come `blob:` — un `data:` oltre 2 MiB è bloccato da Chromium */
                var urlFile = '';
                if (vistaFile && vistaFile.modo === 'blob' && typeof DFv.blobDaBase64 === 'function') {
                    try { _revocaFoto(); urlFile = _urlFoto = URL.createObjectURL(DFv.blobDaBase64(r.base64, mime)); } catch (e) { urlFile = ''; }
                }
                fr.src = urlFile || ('data:' + mime + ';base64,' + r.base64);
            }
            host.appendChild(fr);
        }).catch(function () {
            host.innerHTML = '<p style="font-family:monospace;padding:24px">' + t('ec_file_ko', 'Non riesco ad aprire questo file') + '</p>';
        });
    }

    /* Lo dice, invece di lasciarlo scoprire dal prodotto: l'anteprima mostra il
       carattere di adesso, ma il FILE ha ancora quello di quando è stato scritto.
       Chi lo apre dal Finder o lo manda via QR vedrebbe l'altro, finché non lo si
       salva. Una riga discreta accanto al nome, non un avviso: non è un guasto,
       è una cosa da sapere. */
    function _diciCarattere(barra, etichetta) {
        if (!barra || barra.querySelector('.ec-fn-nota')) return;
        var n = document.createElement('span');
        n.className = 'ec-fn-nota';
        n.style.cssText = 'font-size:11px;color:var(--mm-testo-3, #64748b);margin-left:10px;white-space:nowrap;' +
            'overflow:hidden;text-overflow:ellipsis;max-width:38ch';
        n.textContent = t('ec_fn_nota', 'mostrato in') + ' ' + etichetta;
        n.title = t('ec_fn_tip',
            'Il file ha ancora il carattere di quando è stato scritto: qui lo vedi con quello scelto in Cabina. Si allinea salvandolo dall’editor.');
        var tit = barra.querySelector('.de-bar-t');
        if (tit && tit.parentNode) tit.parentNode.insertBefore(n, tit.nextSibling);
        else barra.appendChild(n);
    }

    /* 0105 (Giacomo, 16/10): un materiale SENZA file prodotto si apre diritto
       nell'editor. Qui stavano le due anteprime che lo precedevano — quella dei
       set d'archivio (v2, D3) e quella al volo dalla sorgente (0087 lotto
       10-modifica, 12/10) — rimaste senza chiamanti: la storia è in git. */
    function _escHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
    }

    /* Il posto della FONTE nella tela. Id `ec-src`: lo cita il foglio di
       mappai-elabora.js per dare a questo sottoalbero le variabili di colore che
       lì sono scoped a `#elab-overlay` / `#elabora-content`. */
    function _montaSrc(box) {
        var tela = (box || document).querySelector('.mm-tela[data-tela="elab"]');
        if (!tela) return null;
        var host = tela.querySelector('#ec-src');
        if (!host) {
            var vuota = tela.querySelector('.mm-tela__vuota');
            if (vuota) vuota.remove();
            var vecchio = tela.querySelector('#elab-doc-host');
            if (vecchio) vecchio.remove();        /* un contenitore per volta */
            var vfile = tela.querySelector('#ec-file');
            if (vfile) { _fermaLettura(); vfile.remove(); }
            host = document.createElement('div');
            host.id = 'ec-src';
            tela.appendChild(host);
        }
        return host;
    }

    /* ── Il popup «+ Crea nuovo» ──────────────────────────────────────────────
       Un elenco di TIPI, non di comandi: si sceglie che cosa si vuole ottenere.
       0091: tre gruppi — «Dalla foto» (solo per un progetto nato da una foto),
       «A mano» (l'editor si apre subito, senza altri modali), «Con l'AI»
       («Più materiali insieme»). Le voci con `crea: false` non compaiono. */
    function _vociCrea() {
        var dossier = _eDossierAperto();
        return TIPI.filter(function (tp) { return tp.crea !== false && (!tp.dossier || dossier); });
    }
    function _popupCrea(poi) {
        if (!MM()) return;
        function voce(tp) {
            var puo = true;
            try { puo = tp.puo(); } catch (e) { puo = false; }
            var seconda = puo ? tp.desc() : (tp.perche ? tp.perche() : '');
            return {
                id: 'tipo:' + tp.id, icona: tp.icona,
                etichetta: tp.et(), sotto: seconda,
                badge: tp.da === 'ai' ? t('ec_da_ai', 'con l\'AI')
                    : tp.da === 'foto' ? t('ec_da_foto', 'dalla foto')
                    : tp.da === 'mano' ? t('ec_da_mano', 'a mano')
                    : t('ec_da_mappa', 'dalla mappa'),
            };
        }
        var tutte = _vociCrea();
        var gruppi = [
            { da: 'foto', titolo: t('ec_g_foto', 'Dalla foto') },
            { da: 'mano', titolo: t('ec_g_mano', 'A mano') },
            { da: 'ai', titolo: t('ec_g_ai', 'Con l\'AI') }
        ];
        var sezioni = gruppi.map(function (g) {
            var v = tutte.filter(function (tp) { return tp.da === g.da; }).map(voce);
            return v.length ? { titolo: g.titolo, voci: v } : null;
        }).filter(Boolean);
        MM().open({
            /* `xl` (1160px, `--mm-xl` in mappai-modal-tokens.css:100) è la taglia
               PIÙ LARGA che i token prevedono, e la usano già Cabina, la console
               ELABORA, la landing e la scelta: qui serve perché le voci sono
               cinque e la seconda riga di ognuna è una frase intera, che a 600px
               veniva troncata con i puntini (richiesta di Giacomo, 21/9).
               Nessun token nuovo: regola 17, prima `npm run stile -- --vicino`. */
            /* «+ Crea nuovo» (0091): lo stesso nome del bottone che lo apre;
               il «+» è l'icona, come sul bottone. */
            titolo: t('ec_crea_t', 'Crea nuovo'), icona: 'plus', taglia: 'xl', invio: false,
            veste: 'grande',   /* 0122 (Giacomo, 22/10): come le finestre delle Attività live */
            sezioni: sezioni
        }).then(function (r) {
            if (!r || !r.azione || r.azione.indexOf('tipo:') !== 0) return;
            var tp = TIPI.filter(function (x) { return 'tipo:' + x.id === r.azione; })[0];
            if (!tp) return;
            var puo = true; try { puo = tp.puo(); } catch (e) { puo = false; }
            if (!puo) { toast(tp.perche ? tp.perche() : t('ec_no', 'Non disponibile.'), 'warning'); return; }
            /* a mano, dalla foto, con l'AI: il percorso continua nel suo modulo,
               che apre da sé l'editor dentro questa console (`_casaDocumenti`) */
            if (tp.da !== 'mappa') { tp.apri(); return; }
            _voce = (tp.id === 'nodesheet') ? 'ns' : 'cc';
            if (poi) poi();
            try { tp.apri(); } catch (e) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); }
        });
    }

    /* ── La FONTE, ORA DENTRO L'AREA (8/8 sera) ──────────────────────────────
       Era un PONTE: la voce chiudeva la console e riapriva il workspace classico
       in modalità fonte, perché il corpo della fonte (testo estratto, PDF,
       copertura, evidenziazione) era scritto DENTRO la pagina intera di
       `mappai-elabora.js` e non si poteva staccare. Adesso quel corpo è una
       funzione sua (`_sourceBodyHTML`) e ELABORA sa disegnarlo in un contenitore
       qualunque (`mountSource`): la fonte entra nella tela come ogni altro
       documento, e non si esce più dalla console per guardarla.
       Della cornice del workspace qui non serve niente: la barra, i segmenti e
       l'uscita sono della console. Restano i suoi COMANDI, come fila di azioni
       sopra il documento (`sourceActions` → `runSourceAction`).
       ⚠️ Nessun `_daConsole` da maneggiare: `open()` di ELABORA non viene più
       chiamata da qui, quindi non c'è più niente da cui non farsi rimbalzare. */

    /* ── Apertura ─────────────────────────────────────────────────────────────
       `MappAIElaboraConsole.open()` sostituisce il workspace classico quando il
       cablaggio bento è acceso. Con flag OFF non viene nemmeno chiamata. */
    var _apriLetturaEsterno = null;
    function open(options) {
        options = options || {};
        if (!MM()) { if (EL() && EL().open) EL().open(); return; }
        if (!DEd()) { toast(t('ec_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning'); return; }
        /* ⚠️ Guardia anti-impilamento (trovata pilotando l'app via CDP, 10/8):
           un secondo `open()` con la console già aperta ne impilava una SECONDA
           sulla prima — `rifaiEsterno` ridisegnava solo la nuova e la vecchia
           restava a schermo, ferma, con i dati di prima. Dal percorso utente
           non ci si arriva (il rail passa da `onCosa`, che chiude prima), ma
           una chiamata programmatica doppia sì. Aperta = non si riapre. */
        if (_aperta) {
            if (options.letturaId && _apriLetturaEsterno) _apriLetturaEsterno(options.letturaId);
            return;
        }
        _voce = '';
        _aperta = true;
        var ridisegna = null;
        _mappe = null;
        _inCorso = null;
        _inCorsoV2 = null;
        _prog = null;
        _doc = null;
        var letturaMount = null;
        var letturaCreation = null;
        function smontaLettura() {
            var old = letturaMount; letturaMount = null;
            if (old && old.handle && old.handle.destroy) old.handle.destroy();
            if (old && old.host) old.host.remove();
        }
        function rifai() {
            if (!ridisegna) return;
            if (!_doc || !_doc.letturaId || !_doc.editing) smontaLettura();
            var box = ridisegna(_schema());
            _dipingi(box);
            montaBriciole(box);
            _montaAnteprimaFoto(box);
        }
        /* ── L'ANTEPRIMA DELLA FONTE (fase 3) ────────────────────────────────
           Sul dossier aperto, senza un documento scelto, l'area mostra la foto
           in piccolo: il clic apre l'EDITOR della scheda. La foto viene dalla
           sorgente incorporata dell'analisi in archivio (`qp-scheda`); senza
           foto il riquadro non si mostra. La scheda riletta si tiene in cache
           per doc: riparsare l'HTML a ogni ridisegno sarebbe lavoro a vuoto. */
        var _fotoCache = {};
        function _montaAnteprimaFoto(box) {
            try {
                if (_doc || !box) return;                     /* solo la vista d'insieme */
                if (!_mappaAperta()) return;
                var st = _appState();
                var n0 = st.db.nodes && st.db.nodes[0];
                if (!n0 || n0.id !== 'fonte_0') return;       /* non è un dossier */
                var d = _docArchivioAnalisi();
                if (!d) return;
                var sch = _fotoCache[d.id];
                if (sch === undefined) {
                    var pieno = window.MappAIStudyDocs.get(d.id);
                    sch = (pieno && window.schedaFromAnalisiHtml) ? window.schedaFromAnalisiHtml(pieno.html) : null;
                    _fotoCache[d.id] = sch;
                }
                if (!sch || !sch.fotoB64) return;
                var area = box.querySelector('.mm-console__area');
                if (!area || area.querySelector('.ec-foto-fonte')) return;
                var w = document.createElement('button');
                w.type = 'button';
                w.className = 'ec-foto-fonte';
                w.setAttribute('title', t('ec_foto_apri', 'Apri la scheda di analisi'));
                w.setAttribute('aria-label', t('ec_foto_apri', 'Apri la scheda di analisi'));
                w.style.cssText = 'display:block; border:none; background:none; padding:0; cursor:pointer; margin:0 0 14px;';
                var img = document.createElement('img');
                img.src = 'data:' + (sch.mime || 'image/jpeg') + ';base64,' + sch.fotoB64;
                img.alt = sch.titolo || '';
                img.style.cssText = 'max-height:160px; max-width:100%; border-radius:10px; display:block;';
                w.appendChild(img);
                var did = d.id;
                w.addEventListener('click', function () { _modificaAnalisi(did); });
                area.insertBefore(w, area.firstChild);
            } catch (e) { /* l'anteprima è un di più */ }
        }
        /* Dopo ogni disegno: se c'è un documento scelto, l'host torna nella tela
           e l'editor ridisegna. L'editor tiene il SUO stato (quale documento è
           aperto, le modifiche non salvate), quindi qui non si ricostruisce
           niente: si ridà solo il posto dove disegnare. */
        /* ── LE BRICIOLE al posto del chip (Giacomo, 8/8) ─────────────────────
           `montaPercorso` costruisce il percorso «Cosa › A chi? › Materia»
           DENTRO la testata della console e marca il box `mn-percorso` — che è
           ciò che dice alla veste di non metterci il chip.
           ⚠️ Si RImonta a ogni disegno: il motore, ridisegnando, costruisce un
           box NUOVO e sostituisce il vecchio, quindi il percorso montato prima
           se ne va con lui.
           ⚠️ Non si sposta qui `#header-utils` (la barra della landing) come fa
           INSEGNA: quel nodo è condiviso, e muoverlo mentre la veste osserva
           ogni mutazione del DOM ha bloccato il renderer (provato). Qui non si
           sposta niente: le briciole si costruiscono sul posto. */
        function montaBriciole(box) {
            var CB = window.MappAIConsoleBento;
            if (!box || !CB || !CB.montaPercorso || !CB.specContesto) return;
            var CL = window.MappAIClasses || {};
            /* quale mappa è caricata ADESSO: serve all'ultima briciola, che
               esiste solo quando un progetto è stato scelto davvero */
            var corrente = null;
            try {
                var _T = window.MappAITeach;
                corrente = (_mappe && _T && _T.mappaCorrente) ? _T.mappaCorrente(_mappe) : null;
            } catch (e) { corrente = null; }
            /* cambiato il contesto cambiano le mappe: l'elenco si rilegge (il
               filtro classe+materia vive in landing-teach, fonte unica) */
            /* CAMBIARE CONTESTO RIPORTA INDIETRO I LIVELLI SEGUENTI (Giacomo,
               9/8): scegliere una classe rimette «Materia» e nasconde il
               progetto; scegliere un'altra materia rimette «Progetto». Non è solo
               grafica — il documento aperto nella tela appartiene alla mappa di
               PRIMA, che nel contesto nuovo non c'è: si azzera la voce, si smonta
               la fonte e si lascia andare l'editor, come al cambio di mappa. */
            function dopo(f) {
                try { f(); } catch (e) { }
                smontaLettura();
                _contestoCambiato = true;      /* finché non si sa, la colonna tace */
                /* ⚠️ Anche il caricamento IN CORSO va dimenticato: cambiando
                   contesto mentre una mappa si stava aprendo, la briciola restava
                   bloccata su «… · apro…» — un'attesa di qualcosa che non
                   interessa più. */
                _inCorso = null;
                _inCorsoV2 = null;
                _prog = null;                  /* v2: il progetto era del contesto di prima */
                _doc = null;
                _voce = '';
                try { if (DEd().reset) DEd().reset(); } catch (e) { }
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                _mappe = null;
                _disco = null;
                rifai();
                _caricaMappe();
                _caricaDisco();
            }
            try {
                /* ⚠️ `specContesto` restituisce l'ARRAY dei livelli, mentre
                   `montaPercorso` vuole `{livelli: …}`: passarglielo nudo non
                   dava errore, semplicemente non montava niente e il chip
                   restava — un difetto muto. */
                var _cbCtx = {
                    /* «Cosa» porta fuori da qui: si chiude la console e la
                       landing resta sulla sezione scelta (stessa strada di INSEGNA) */
                    /* Cambiare sezione dal percorso esce dalla console, e la × è
                       la stessa strada del pallino della testata: chiede prima,
                       come ESC. Senza, si perdeva il documento aperto in quel
                       gesto e non nell'altro — cioè il lavoro sopravviveva a
                       seconda di come si usciva.
                       ⚠️ `setMode` DOPO la risposta: prima cambiava la landing
                       sotto anche quando l'utente rispondeva «torna indietro»,
                       e la console restava aperta su una sezione che non era
                       più quella dichiarata. */
                    onCosa: function (m) {
                        _conSalvataggio(function () {
                            try { if (window.MappAITeach && MappAITeach.setMode) MappAITeach.setMode(m); } catch (e) { }
                            var x = box.querySelector('[data-azione="__chiudi"]');
                            if (x) x.click();
                        });
                    },
                    onGenerico: function () {
                        dopo(function () {
                            if (CL.setActive) CL.setActive('');
                            /* ⚠️ `setActiveStudent('')` non azzera: il modulo si
                               aspetta `null` (con una stringa vuota costruirebbe
                               un profilo da `''`). */
                            if (CL.setActiveStudent) CL.setActiveStudent(null);
                            if (CL.setActiveDiscipline) CL.setActiveDiscipline('');
                        });
                    },
                    /* ⚠️ `specContesto` consegna l'OGGETTO classe, non il suo id:
                       `setActive(oggetto)` scriveva «[object Object]» in
                       localStorage, `getActive()` tornava null e la briciola
                       diceva «Generico» — cioè scegliere una classe da qui non
                       funzionava. Scegliere una classe azzera anche materia e
                       allievo, come nella landing (l'esclusione mutua e la
                       materia che non appartiene alla classe nuova). */
                    onClasse: function (c) {
                        dopo(function () {
                            if (CL.setActive) CL.setActive(c && c.id != null ? c.id : c);
                            if (CL.setActiveStudent) CL.setActiveStudent(null);
                            if (CL.setActiveDiscipline) CL.setActiveDiscipline('');
                        });
                    },
                    onAllievo: function (p) {
                        dopo(function () {
                            if (CL.setActiveStudent) CL.setActiveStudent(p);
                            if (CL.setActiveDiscipline) CL.setActiveDiscipline('');
                        });
                    },
                    onMateria: function (mm) { dopo(function () { if (CL.setActiveDiscipline) CL.setActiveDiscipline(mm); }); }
                };
                var liv = CB.specContesto(_cbCtx, 'materia');
                /* Il progetto sta DIETRO la rivelazione progressiva, come gli
                   altri livelli: senza destinatario la briciola diceva «Nessun
                   progetto» accanto a «A chi?» — una risposta a una domanda non
                   ancora fatta. Due condizioni, entrambe necessarie:
                   `specContesto` ha rivelato tutti e tre i livelli (quindi «A
                   chi?» è stato scelto) E la materia è scelta davvero — con la
                   classe scelta e la materia no il terzo livello esiste, ma porta
                   il prompt «Materia», e l'elenco dei progetti di «tutte le
                   materie» non è quello che si sta chiedendo. */
                var mat = '', clsAttiva = null;
                try { mat = (CL.activeDiscipline && CL.activeDiscipline()) || ''; } catch (e) { }
                try { clsAttiva = (CL.getActive && CL.getActive()) || null; } catch (e) { }
                /* La MATERIA è richiesta solo quando c'è una CLASSE attiva: là
                   serve davvero a restringere le mappe di quella classe. In
                   contesto GENERICO — che è come un docente vede il vault di un
                   collega, o le proprie mappe senza classe — pretenderla vorrebbe
                   dire non poter mai scegliere un progetto: le materie generiche
                   sono quelle del profilo, e una mappa arrivata da fuori non ne ha
                   nessuna (Giacomo, 9/8). */
                /* ── LA BRICIOLA SI COMPLETA QUANDO SCEGLI UN PROGETTO (14/8) ─
                   Finché non hai scelto, in alto resta la sola prima domanda:
                   le altre due sono scese in testa alla COLONNA, dove filtrano
                   l'elenco, e tenerle anche qui sarebbe lo stesso comando in due
                   posti mentre si sta ancora cercando. Scelto il progetto, la
                   testata dice il percorso INTERO — Elabora › classe › materia ›
                   progetto — e ogni pezzo resta cliccabile.
                   ⚠️ Rovescia la decisione del 9/8 («la quarta briciola sarebbe
                   un secondo comando»): con i filtri nella colonna, l'ultima
                   briciola non duplica più la scelta, è la via BREVE per passare
                   da una mappa all'altra senza tornare all'elenco. */
                var _sceltoId = _prog || (corrente && corrente.id) || '';
                var _scelto = (_mappe || []).filter(function (x) { return String(x.id) === String(_sceltoId); })[0]
                    || (_sceltoId ? corrente : null);
                if (!_scelto) liv = liv.slice(0, 1);
                /* 0094 (S7): «Rinomina…» in fondo al menu del progetto, ma non per un
                   percorso di lettura: qui la briciola è sempre il progetto aperto, e una
                   lettura aperta non si rinomina (S2). 0124 (ADR 0025): sotto, «Riassegna…» e
                   «Copia…»; il menu non elenca più gli altri progetti (Giacomo, 23/10). Dopo il
                   gesto la console passa al progetto nel posto nuovo (dopo «Copia», alla copia: D4).
                   Senza azioni la briciola resta un'etichetta. */
                var _rinE = (_scelto && window.MappAITeach && MappAITeach.perRinomina) ? MappAITeach.perRinomina(_scelto) : null;
                if (_rinE && _rinE.lettura) _rinE = null;
                var _progE = (_scelto && window.MappAITeach && MappAITeach.perProgetto) ? MappAITeach.perProgetto(_scelto) : null;
                if (_progE && _progE.lettura) _progE = null;
                var RCe = window.MappAIRiassegnaCopia;
                var _seguiE = function (r) {
                    var T = window.MappAITeach;
                    if (!r || !r.fullPath || !T || !T.mappeDelContesto) return;
                    T.mappeDelContesto().then(function (list) {
                        _mappe = list || [];
                        var m = _mappe.filter(function (x) { return x && x.v && String(x.v.fullPath) === String(r.fullPath); })[0];
                        if (m) _conSalvataggio(function () { _prog = m.id; _doc = null; _cambiaMappa(m); });
                        else rifai();
                    }).catch(function () { rifai(); });
                };
                var _azioni = [];
                if (_rinE) _azioni.push({ et: t('rn_voce', 'Rinomina…'), onPick: function () { if (window.MappAIRinomina) MappAIRinomina.apri(_rinE); } });
                if (_progE && RCe && RCe.attivo()) {
                    _azioni.push({ et: t('rc_riassegna_voce', 'Riassegna…'), onPick: function () { RCe.apri('riassegna', _progE, { dopo: _seguiE }); } });
                    _azioni.push({ et: t('rc_copia_voce', 'Copia…'), onPick: function () { RCe.apri('copia', _progE, { dopo: _seguiE }); } });
                }
                if (!_scelto) { /* niente */ }
                else liv.push(_azioni.length
                    ? { et: _scelto.nome, menu: { tipo: 'lista', voci: [], nuovo: _azioni } }
                    : { statico: _scelto.nome, qui: true });
                CB.montaPercorso(box, { livelli: liv });
                /* Le stesse due domande, in testa alla COLONNA: là c'è l'elenco
                   che filtrano, e là si capisce che si può restringere. Stesse
                   callback, stesso `specContesto` — un solo stato, due rese. */
                if (CB.montaFiltriSidebar) {
                    CB.montaFiltriSidebar(box, _cbCtx, {
                        visibili: (_mappe || []).length,
                        totale: (_totali == null ? (_mappe || []).length : _totali)
                    });
                }
            } catch (e) { /* senza percorso resta il chip: non è un motivo per fermarsi */ }
        }

        /* ── LA QUARTA BRICIOLA: il PROGETTO (Giacomo, 8/8 notte) ─────────────
           In ELABORA l'ultima briciola dice su QUALE mappa si sta lavorando, in
           ogni modo si sia arrivati qui (avvio → ELABORA · «Elabora» dal menu di
           una mappa aperta · da CREA con classe e materia già scelte · da INSEGNA
           con anche il progetto scelto), e cliccandola si passa a un'altra mappa
           della stessa classe e materia.
           ⚠️ È l'ultimo livello e ha un `menu`: quindi NON prende il corsivo di
           «sono qui» (`is-qui` vale solo per i livelli statici). È il prezzo del
           renderlo cliccabile, e si vede: un livello in corsivo che si apre
           direbbe due cose opposte.
           ⚠️ L'elenco arriva dal DISCO ed è ASINCRONO: finché non c'è si mostra
           il solo nome (dal `rootNodeLabel`) senza tendina — meglio una briciola
           che non si apre ancora di una briciola che dice «Progetto» mentre la
           mappa è lì aperta sotto. */

        /* Cambiare mappa da qui è più che caricarla: i documenti della colonna e
           quello aperto nella tela appartengono alla mappa di PRIMA. Si azzera
           l'editor, si smonta la fonte e si torna al segnaposto — poi si ridisegna
           quando la mappa nuova c'è DAVVERO (`apriMappa` aspetta l'identità: il
           caricamento da vault passa dal disco e non è sincrono). */
        function _cambiaMappa(m) {
            smontaLettura();
            var T = window.MappAITeach;
            if (!T || !T.apriMappa) { toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); return; }
            _voce = '';
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            _inCorso = m;
            _inCorsoV2 = m.id;                         /* la nav v2 marca la scelta */
            /* ⚠️ SCEGLIERE UN PROGETTO ALLINEA IL FILTRO (Giacomo, 14/8): la
               classe e la materia sono quelle della sua cartella, lette dal
               disco. Senza, aprendo liberamente un progetto di un'altra classe
               la briciola avrebbe continuato a dire il filtro — due verità a
               schermo, e nessun modo di sapere quale conta. */
            try { if (window.MappAITeach && MappAITeach.allineaContestoA) MappAITeach.allineaContestoA(m); } catch (e) { }
            rifai();                                   /* segnaposto + «apro…» sulla briciola */
            /* ⚠️ Se nel frattempo il contesto è cambiato (`_inCorso` azzerato da
               `dopo`), questa risposta è di una richiesta abbandonata: si lascia
               cadere, o riporterebbe in colonna i documenti di una mappa che non
               appartiene più al contesto scelto. */
            var atteso = m;
            /* 0094 (lotto F3, difetto 9 della guida): se il caricamento non parte o non
               arriva, la briciola torna al progetto DAVVERO aperto. Prima `_prog` restava
               quello scelto, e le tabelle del progetto caricato si leggevano col nome
               dell'altro (righe «Completa validazione» di «Circuiti» sotto «Elettricità»). */
            var _tornaAlCaricato = function () {
                if (_inCorso !== atteso) return;
                var corr = null;
                try { corr = (_mappe && T.mappaCorrente) ? T.mappaCorrente(_mappe) : null; } catch (e) { corr = null; }
                _prog = corr ? corr.id : null;
                _inCorso = null; _inCorsoV2 = null; rifai();
            };
            var ok = T.apriMappa(m, function () {
                if (_inCorso !== atteso) return;
                _inCorso = null; _inCorsoV2 = null; _caricaMappe(); _disco = null; _caricaDisco(); rifai();
            }, _tornaAlCaricato);
            if (!ok) { _tornaAlCaricato(); toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); }
        }

        /* l'elenco si rilegge dopo un cambio di contesto: classe o materia nuove
           = mappe diverse, e il filtro vive in landing-teach (fonte unica) */
        function _caricaMappe() {
            var T = window.MappAITeach;
            if (!T || !T.mappeDelContesto) { _mappe = []; return; }
            T.mappeDelContesto().then(function (list) {
                _mappe = list || [];
                _contestoCambiato = false;     /* ora si sa: decide `mappaCorrente` */
                /* ⚠️ Aprendo ELABORA su una mappa GIÀ caricata, il progetto è
                   scelto — quindi il filtro va allineato a lui come quando lo si
                   sceglie dalla colonna, o la briciola direbbe «A chi?» accanto
                   a un progetto che è lì. Una volta sola per sessione di
                   console: dopo, comanda l'utente. */
                if (!_allineato) {
                    _allineato = true;
                    var cur = null;
                    try { cur = T.mappaCorrente ? T.mappaCorrente(_mappe) : null; } catch (e) { }
                    if (cur && T.allineaContestoA) {
                        try { T.allineaContestoA(cur); } catch (e) { }
                        _caricaMappe();        /* il filtro è cambiato: l'elenco pure */
                        return;
                    }
                }
                rifai();
            }).catch(function () { _mappe = []; _contestoCambiato = false; });
            /* il TOTALE (filtro a parte) per la riga del conto sotto i filtri:
               senza, «3 progetti» non distingue un filtro che ne nasconde nove
               da un archivio con tre mappe */
            if (T.mappeTotali) T.mappeTotali().then(function (n) { _totali = n; rifai(); }).catch(function () { });
        }

        /* Le leve che la v2 passa a `_montaFile` (S2 di un file su disco):
           l'uscita, il passaggio a S3 delle sintesi, e — per i set FUSI —
           «Modifica» che apre il SET (D4: la sorgente c'è). */
        /* S2 → S3 per i documenti che nascono dalla mappa. Non c'è un file da
           riaprire: l'editor li ricostruisce, ed è per questo che il gesto è lo
           stesso di «Crea nuovo». `_voce` passa a 'ns'/'cc' perché è da lì che
           `_dipingi` capisce quale host montare. */
        function _apriEditorDallaMappa(quale, clone) {
            var D = DEd();
            if (!D) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); return; }
            _voce = (quale === 'nodesheet') ? 'ns' : 'cc';
            _doc = { id: _voce, natura: 'crea', editing: true, dallaMappa: quale, clone: clone || '' };
            rifai();
            /* ⚠️ NON si passa da `TIPI[].apri()`: quello apre l'ORIGINALE senza
               argomenti, e una copia si correggerebbe scrivendo sopra il
               documento di partenza. L'editor sa quale aprire solo se glielo si
               dice. */
            try {
                if (quale === 'nodesheet') D.openNodeSheet(clone || '');
                else D.openCausal(clone || '');
            } catch (e) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); }
        }
        function _optsDiskV2() {
            var o = {
                esci: function () { _conSalvataggio(_chiudiDocumento); },
                dopoModifica: function () { if (_doc) _doc.editing = true; }
            };
            if (_doc && _doc.letturaId) {
                var current = _doc, path = (_appState() || {}).activeVaultPath;
                o.titolo = current.title;
                o.fontId = current.fontId;
                o.font = function (id) {
                    if (_doc !== current || (_appState() || {}).activeVaultPath !== path) return Promise.reject(new Error(t('pl_stale', 'Il progetto è cambiato. Riapri il percorso prima di continuare.')));
                    return Promise.resolve(_lettura().setElaboraFont(id, current.letturaId)).then(function () { current.fontId = id; });
                };
                if (current.modificabile !== false) o.modifica = function () {
                    if (_doc !== current || (_appState() || {}).activeVaultPath !== path) return;
                    _fermaLettura(); current.editing = true; rifai();
                };
                function crea(format) {
                    if (_doc !== current || (_appState() || {}).activeVaultPath !== path) return;
                    Promise.resolve().then(function () { return _lettura().createElaboraVersion({ format: format, materialId: current.letturaId }); })
                        .catch(function (e) { toast(e.message || t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'error'); });
                }
                if (current.modificabile !== false) {
                    o.stampa = function () { crea('pdf'); };
                    o.consegna = function () { crea('html'); };
                }
            }
            else if (_doc && _doc.setId) o.modifica = function () { _apriEditorSet(_doc.setId); };
            else if (_doc && _doc.analisiId) o.modifica = function () { _modificaAnalisi(_doc.analisiId); };
            else if (_doc && _doc.docId) o.modifica = function () { _apriEditorAperte(_doc.docId); };
            else if (_doc && _doc.dallaMappa) {
                /* Foglio dei nodi e catena: la sorgente è la MAPPA, quindi
                   «Modifica» non apre un file — ricostruisce il documento
                   nell'editor. È lo stesso ingresso di «Crea nuovo». */
                o.modifica = function () { _apriEditorDallaMappa(_doc.dallaMappa, _doc.clone); };
            }
            return o;
        }
        function _dipingi(box) {
            if (!_voce) return;
            if (_doc && _doc.letturaId && (_doc.pending || _doc.editing)) {
                var current = _doc, path = (_appState() || {}).activeVaultPath;
                var readingHost = _montaHost(box);
                if (!readingHost) return;
                if (current.pending) { readingHost.textContent = t('ec_apro', 'Apro…'); return; }
                // Il motore ricrea il box anche quando arriva l'elenco del disco.
                // Riattaccare il medesimo host conserva collassi e selezione.
                if (letturaMount && letturaMount.doc === current && letturaMount.path === path) {
                    if (readingHost !== letturaMount.host) readingHost.replaceWith(letturaMount.host);
                    return;
                }
                smontaLettura();
                var mounted = { doc: current, path: path, host: readingHost, handle: null };
                letturaMount = mounted;
                Promise.resolve().then(function () {
                    if (letturaMount !== mounted || !_aperta || _doc !== current || (_appState() || {}).activeVaultPath !== path) return null;
                    return _lettura().mountElaboraEditor(readingHost, {
                        materialId: current.letturaId,
                        onExit: function () { if (_doc === current) _tornaAnteprima(); },
                        onChanged: function () { /* il controller salva e aggiorna l'HTML; la vista resta montata */ }
                    });
                }).then(function (handle) {
                    if (letturaMount !== mounted || !_aperta || _doc !== current || (_appState() || {}).activeVaultPath !== path) {
                        if (handle && handle.destroy) handle.destroy(); return;
                    }
                    mounted.handle = handle;
                }).catch(function (e) {
                    if (letturaMount !== mounted || _doc !== current) return;
                    toast(e.message || t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'error');
                    current.editing = false; rifai();
                });
                return;
            }
            /* ⚠️ S3 DELLE DOMANDE APERTE, PRIMA del ramo `disk:` — e l'ordine è
               la regola. Il documento viene da un FILE (quindi `_voce` dice
               `disk:`), ma in modifica l'editor lavora sulla sorgente
               d'archivio: lasciando decidere al ramo qui sotto si rimonterebbe
               l'anteprima del PDF sopra l'editor appena aperto, e «Modifica»
               sembrerebbe non fare niente. */
            /* L'EDITOR DELLA SCHEDA (fase 3): si rimonta dal suo stato
               (`_doc.scheda`) a ogni ridisegno — il pattern del doc-editor. */
            if (_doc && _doc.editing && _doc.analisiId && _doc.scheda) {
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                var hostAn = _montaHost(box);
                var V2 = window.MappAIVisione;
                /* ⚠️ GUASTO CHE PARLA (21/8): questa era l'unica uscita MUTA
                   della catena — host o modulo mancante e la tela restava
                   vuota, senza scheda e senza messaggio («Modifica non fa
                   niente»). Ora si avvisa e si TORNA dove si era: anteprima
                   del PDF se c'è, elenco altrimenti. */
                if (!hostAn || !V2 || !V2.montaSuperficie) {
                    toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning');
                    _doc.editing = false;
                    _voce = _doc.relPath ? ('disk:' + _doc.relPath) : '';
                    if (!_voce) _doc = null;
                    rifai();
                    return;
                }
                var docAn = _doc.docAn;
                try {
                    V2.montaSuperficie(_doc.scheda, {
                        modo: 'editor', host: hostAn,
                        onSalva: function (fatta) {
                            if (_salvaAnalisi(fatta, docAn) && _doc && _doc.analisiId) _doc.scheda = fatta;
                        },
                        onPdf: function (fatta) {
                            var st2 = _appState();
                            var html2 = window.buildAnalisiFonteHtml(fatta, { mapName: (st2 && st2.rootNodeLabel) || '', includeBar: false });
                            _rifaiPdfAnalisi(html2, (st2 && st2.rootNodeLabel) || '');
                        },
                        onRigenera: function (fatta) { _rigeneraMateriali(fatta, docAn); }
                    }).then(function (r) {
                        if (r && r.uscita && _doc && _doc.analisiId) {
                            /* F4: da un file si torna all'ANTEPRIMA, non al vuoto */
                            if (_doc.relPath) { _doc.editing = false; _voce = 'disk:' + _doc.relPath; }
                            else { _doc = null; _voce = ''; }
                            rifai();
                        }
                    });
                } catch (e) {
                    console.warn('[ELABORA] superficie analisi:', e);
                    toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning');
                    _doc.editing = false;
                    _voce = _doc.relPath ? ('disk:' + _doc.relPath) : '';
                    if (!_voce) _doc = null;
                    rifai();
                }
                return;
            }
            if (_doc && _doc.editing && (_doc.docId || _doc.dallaMappa)) {
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                var hostOq = _montaHost(box);
                if (hostOq && DEd().render) { try { DEd().render(); } catch (e) { } }
                return;
            }
            /* un documento del VAULT: sola lettura, host suo */
            if (_voce.indexOf('disk:') === 0) {
                try { if (DEd().reset) DEd().reset(); } catch (e) { }
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                _montaFile(box, _voce.slice(5), _doc ? _optsDiskV2() : null);
                return;
            }
            /* LA FONTE nella tela: host suo (`#ec-src`), non quello dell'editor —
               due disegni nello stesso contenitore si sovrascriverebbero, e
               `#elab-doc-host` è l'id che l'editor cerca. */
            if (_eFonte()) {
                try { if (DEd().reset) DEd().reset(); } catch (e) { }   /* l'editor lascia il posto */
                var hs = _montaSrc(box);
                var E = EL();
                if (!hs || !E || !E.mountSource) { toast(t('ec_src_ko', 'La vista della fonte non è disponibile.'), 'warning'); return; }
                var p = _voce.split(':');                 /* ['src','text'|'pdf'|'fig', idx?] */
                /* ⚠️ la vista si passa a `mountSource`, NON con `setSrcView`: quei
                   setter chiamano `render()`, e con l'host del giro precedente già
                   staccato dal documento la chiamata riaprirebbe il workspace a
                   tutto schermo sopra la console. */
                /* 0114: `src:fig:<i>` apre la vista «Figure» del PDF i-esimo, per nome */
                var pdfI = _pdf()[p[2] ? +p[2] : 0];
                try { E.mountSource(hs, { view: p[1] === 'pdf' ? 'pdf' : (p[1] === 'fig' ? 'figure' : 'text'), pdfIdx: p[2] ? +p[2] : 0, pdfNome: (p[1] === 'fig' && pdfI) ? _nomePdf(pdfI, p[2] ? +p[2] : 0) : undefined }); }
                catch (e) { toast(t('ec_src_ko', 'La vista della fonte non è disponibile.'), 'warning'); }
                return;
            }
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            var host = _montaHost(box);
            if (host && DEd().render) { try { DEd().render(); } catch (e) { } }
        }

        /* ── LASCIARE UN DOCUMENTO: prima si CHIEDE (Giacomo, 9/8) ───────────
           L'editor tiene le modifiche in memoria e le dichiara (`hasUnsaved`),
           il motore sa già fare la domanda a tre vie (`chiediSalvataggio`:
           salva · esci · torna indietro): non erano legati a niente, e uscire
           buttava via il lavoro in silenzio. La domanda è la stessa comunque si
           esca — con ESC o scegliendo un'altra voce nella colonna — perché il
           gesto è lo stesso: chiederla in un caso solo vorrebbe dire che il
           lavoro si perde a seconda di come si esce. */
        function _etichettaVoce(v) {
            /* un file passato all'editor porta l'id `synfile:`, ma nella colonna
               la sua riga resta quella `disk:`: senza questa riga la domanda
               direbbe «questo documento» proprio dove il nome del file c'è */
            var cerca = String(v || '').replace(/^synfile:/, 'disk:');
            var nome = '';
            try { _indiceDocumenti().forEach(function (x) { if (x && x.id === cerca && x.etichetta) nome = x.etichetta; }); }
            catch (e) { }
            return nome;
        }
        function _sporco() {
            try {
                if (letturaMount && letturaMount.handle && letturaMount.handle.hasUnsaved) return !!letturaMount.handle.hasUnsaved();
                if (DEd().haDocumento && DEd().haDocumento() && DEd().hasUnsaved && DEd().hasUnsaved()) return true;
                /* l'editor della SCHEDA (analisi fonte) non passa dal doc-editor:
                   il suo stato sporco vive nella superficie della visione (③) */
                var V2 = window.MappAIVisione;
                if (_doc && _doc.analisiId && _doc.editing && V2 && V2.superficie && V2.superficie.sporca) {
                    return !!V2.superficie.sporca();
                }
                return false;
            }
            catch (e) { return false; }
        }
        /* ⚠️ `poi` non è mai sincrono quando c'è da chiedere: chi chiama deve
           aver già risposto al motore (vedi `__esc`), o la console si chiude
           sotto la domanda. */
        function _conSalvataggio(poi) {
            if (letturaMount && letturaMount.handle && letturaMount.handle.requestExit) {
                var mounted = letturaMount;
                mounted.handle.requestExit(function () { if (letturaMount === mounted) poi(); }); return;
            }
            if (letturaMount && letturaMount.handle && letturaMount.handle.hasUnsaved && letturaMount.handle.hasUnsaved()) {
                toast(t('pl_operation_pending', 'Attendi che termini l’operazione.'), 'info'); return;
            }
            if (!_sporco() || !MM().chiediSalvataggio) { poi(); return; }
            MM().chiediSalvataggio({ nome: _etichettaVoce(_voce) }).then(function (a) {
                if (a === 'annulla') return;
                if (a !== 'salva') { poi(); return; }         /* «esci senza salvare» */
                /* ⚠️ Si passa da `salvaConNome`, non da `save()`: chi risponde
                   «salva» si aspetta il materiale, e `save()` per quattro generi
                   su cinque scrive solo in memoria e in localStorage — nessun
                   file nella cartella della mappa. Questa strada chiede il nome
                   e avvisa se esiste già, come «Stampa» e «Salva ed Esci».
                   ⚠️ E si ASPETTA: prima la chiamata non era attesa e `_sporco()`
                   veniva letto mentre la scrittura era ancora in volo — per una
                   sintesi-da-vault il documento non cambiava mai. */
                var D = DEd();
                var p = (D && D.salvaConNome) ? D.salvaConNome() : Promise.resolve(D && D.save && D.save());
                Promise.resolve(p).then(function (esito) {
                    /* `null` = ha rinunciato (nome annullato, collisione
                       annullata, validazione rifiutata): NON si esce, o si
                       perderebbe proprio ciò che si era chiesto di salvare. */
                    if (esito === null || _sporco()) return;
                    poi();
                }).catch(function () { /* l'errore l'ha già detto chi salva */ });
            });
        }
        /* Torna al segnaposto: l'area si svuota e la colonna resta.
           ⚠️ Nessun codice per riaprire la colonna: lo stato «chiusa» vive SOLO
           nella classe `is-nav-chiusa` che il motore appiccica al box
           (mappai-modal.js:716), e `rifai()` costruisce un box NUOVO che la
           prende solo da `schema.navChiusa` — che qui non si emette mai. Quindi
           la colonna riappare da sé; aggiungere una riga per farlo sarebbe
           codice che non fa niente. */
        function _chiudiDocumento() {
            smontaLettura();
            _voce = '';
            _doc = null;                       /* v2: si torna a S1 (per la v1 era già null) */
            /* la superficie dell'analisi ha un ascolto ESC sul documento: senza
               questo, chiudere il documento lo lasciava vivo fino al montaggio
               successivo — ESC sull'elenco vuoto apriva «Chiudere la scheda?» */
            try {
                var V2c = window.MappAIVisione;
                if (V2c && V2c.scordaSuperficie) V2c.scordaSuperficie();
            } catch (e) { }
            _fermaLettura();
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            rifai();
        }

        /* ══ F4 — S3 e il ritorno (v2) ════════════════════════════════════════
           «Modifica» apre l'EDITOR nel posto dell'anteprima; uscendo (ESC o la
           sua uscita a due stati) si torna all'ANTEPRIMA dello stesso
           documento, rinfrescata — si esce dall'editing per guardare il
           risultato, non per abbandonare il documento (assunzione della spec,
           da confermare con Giacomo alla prima demo). I documenti nati da
           «Crea nuovo» un'anteprima non ce l'hanno: da lì si torna a S1. */
        function _apriEditorSet(setId) {
            if (!_doc) return;
            _doc.editing = true;
            _voce = 'set:' + setId;
            try { DEd().openSet(setId); }
            catch (e) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); }
            /* l'apertura può RINUNCIARE: col file si resta nella sua anteprima,
               senza file si torna all'elenco (0105: un set senza file
               un'anteprima non ce l'ha più) */
            try {
                if (DEd().haDocumento && !DEd().haDocumento()) {
                    if (!_doc.relPath) { _chiudiDocumento(); return; }
                    _doc.editing = false;
                    _voce = 'disk:' + _doc.relPath;
                }
            } catch (e) { }
            rifai();
        }
        /* ── LA CORREZIONE DELL'ANALISI (20/8) ──────────────────────────────
           «Modifica» riapre la SCHEDA della visione, precompilata dalla
           sorgente incorporata. Alla conferma: l'archivio si riscrive (la
           dedup per kind|title|mapName sostituisce la voce) e il PDF nel
           vault si rifà — sorgente prima della resa, e una resa che fallisce
           non tocca la sorgente appena scritta (inv. 18). */
        function _modificaAnalisi(docId) {
            var SD = window.MappAIStudyDocs, V = window.MappAIVisione;
            if (!SD || !SD.get || !V || !V.montaSuperficie || !window.schedaFromAnalisiHtml) {
                toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); return;
            }
            var d = SD.get(docId);
            var scheda = d && window.schedaFromAnalisiHtml(d.html);
            if (!scheda) {
                toast(t('ec_an_no_src', 'Questo documento non porta con sé la scheda: si può stampare, ma non correggere.'), 'warning');
                return;
            }
            /* L'EDITOR nella TELA (fase 3): la stessa superficie della
               validazione di CREA, col piè degli editor — Salva · Annulla ·
               Crea PDF · Esci. Lo stato che sopravvive ai ridisegni della
               console è `_doc.scheda` (l'ultimo salvataggio): è il pattern del
               doc-editor, che ridisegna dal proprio stato. */
            /* ⚠️ Si MUTA `_doc`, non lo si sostituisce (21/8): la riga arriva
               dall'anteprima del PDF con `relPath` e `natura:'disk'` — un
               oggetto nuovo li perdeva, e con essi il ritorno all'anteprima
               (F4) e il «torna» che invece CHIUDEVA il documento. È il pattern
               del gemello che funziona (_apriEditorAperte). */
            if (_doc) {
                _doc.editing = true; _doc.analisiId = docId;
                _doc.scheda = scheda; _doc.docAn = d;
                if (!_doc.id) _doc.id = 'an:' + docId;
            } else {
                _doc = { id: 'an:' + docId, natura: 'crea', editing: true, analisiId: docId, scheda: scheda, docAn: d };
            }
            _voce = _doc.relPath ? ('disk:' + _doc.relPath) : ('an:' + docId);
            rifai();
        }
        /* Il salvataggio dell'analisi: archivio riscritto (la dedup per
           kind|title|mapName sostituisce) e PDF rifatto — sorgente prima della
           resa, e una resa che fallisce non tocca la sorgente (inv. 18). */
        function _salvaAnalisi(fatta, d) {
            var SD = window.MappAIStudyDocs;
            var st = _appState();
            var mappa = (st && st.rootNodeLabel) || '';
            var html = window.buildAnalisiFonteHtml(fatta, { mapName: mappa, includeBar: false });
            var nuovoId = null;
            try {
                nuovoId = SD.save({ kind: 'analisi', title: d.title, html: html, mapName: d.mapName || mappa, cls: d.cls, disc: d.disc });
            } catch (e) { nuovoId = null; }
            if (!nuovoId) { toast(t('ec_an_save_ko', 'Salvataggio non riuscito: archivio pieno?'), 'error'); return false; }
            _rifaiPdfAnalisi(html, mappa);
            return true;
        }
        /* ── RIGENERA I MATERIALI dalla scheda corretta (21/8, punto 2) ─────
           Il gesto vive nel piè dell'editor della scheda: salva è già passato
           (la superficie salva PRIMA di chiamarci), qui si chiede conferma —
           è una corsa di minuti che SOVRASCRIVE i materiali — e si passa la
           palla a `Pipeline.rigeneraDossier`, che rifà grafo, analisi,
           domande/flashcard (B) e sintesi (D) sul vault aperto. */
        function _rigeneraMateriali(fatta, d) {
            var P = window.MappAIPipeline;
            if (!P || !P.rigeneraDossier) {
                toast(t('ec_rig_no_pipeline', 'La pipeline dei materiali non è caricata.'), 'warning');
                return;
            }
            MM().open({
                titolo: t('ec_rig_t', 'Rigenerare i materiali?'), icona: 'refresh-cw', taglia: 's', invio: false,
                sezioni: [{ testo: t('ec_rig_d', 'Domande aperte, flashcard e sintesi si RIFANNO dalla scheda corretta e sovrascrivono i file attuali nel vault. Servono alcune chiamate all\'AI e qualche minuto.') }],
                azioni: [
                    { id: 'no', etichetta: t('mm_annulla', 'Annulla') },
                    { id: 'si', etichetta: t('ec_rig_vai', 'Rigenera'), ruolo: 'primario' }
                ]
            }).then(function (r) {
                if (!r || r.azione !== 'si') return;
                P.rigeneraDossier(fatta).then(function (esito) {
                    if (esito && esito.ok) {
                        toast(t('ec_rig_ok', 'Materiali rigenerati dalla scheda corretta.'), 'success');
                        rifai();
                    }
                });
            });
        }
        function _rifaiPdfAnalisi(html, mappa) {
            var st = _appState();
            var vp = (st && st.activeVaultPath) || '';
            var PC = window.MappAIPipelineCore;
            if (!vp || !PC || !window.electronAPI || !window.electronAPI.htmlToPdf) {
                toast(t('ec_an_solo_arch', 'Scheda corretta e salvata in archivio.'), 'success');
                return;
            }
            window.electronAPI.htmlToPdf({ html: html, options: { landscape: false } }).then(function (pdf) {
                if (!pdf || !pdf.ok) throw new Error((pdf && pdf.error) || 'PDF non generato');
                var nomeF = PC.buildFileName('analisi_fonte', null, false, { mappa: mappa });
                return window.electronAPI.saveVaultFile({ vaultPath: vp, relPath: 'Materiale Studio/' + nomeF, base64: pdf.base64 });
            }).then(function () {
                try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vp }); } catch (e) { }
                toast(t('ec_an_fatto', 'Scheda corretta: archivio e PDF aggiornati.'), 'success');
            }).catch(function (e) {
                toast(t('ec_an_pdf_ko', 'Scheda salvata, ma il PDF non si è rifatto: ') + (e && e.message || e), 'warning');
            });
        }
        /* Domande aperte: l'editor si apre sulla voce d'ARCHIVIO, non sul file.        /* Domande aperte: l'editor si apre sulla voce d'ARCHIVIO, non sul file.
           Salvando, l'archivio si riscrive; il PDF nella cartella lo rifà
           «Stampa» — e finché non lo si fa, il file sul disco resta quello di
           prima. È dichiarato nella barra dell'editor, non qui. */
        function _apriEditorAperte(docId) {
            if (!_doc) return;
            var D = DEd();
            if (!D || !D.openOpenQuestions) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); return; }
            _doc.editing = true;
            var ok = false;
            try { ok = D.openOpenQuestions(docId); }
            catch (e) { ok = false; }
            if (!ok) {
                /* ha già avvisato: col file si resta nella sua anteprima, senza
                   file si torna all'elenco (0105) */
                if (!_doc.relPath) { _chiudiDocumento(); return; }
                _doc.editing = false;
            }
            rifai();
        }
        /** C'è un'anteprima dove tornare uscendo dall'editing?
            Ce l'hanno i documenti che vengono da un FILE del vault (`disk:`, si
            rilegge dal disco) e i set d'archivio (`set:`, il builder li
            ridisegna). Non ce l'hanno quelli nati qui (`crea`) né le SINTESI,
            per cui l'editor È l'unica resa. Dal 0105 (16/10) nemmeno i set
            senza file: l'anteprima la dà solo un file prodotto.
            🐛 17/8: senza questa domanda, ESC su una sintesi metteva
            `editing = false`, azzerava l'editor e ridisegnava — e siccome
            `_dipingi` non ha un ramo d'anteprima per le sintesi, cadeva su
            quello finale, che rimonta un editor ormai vuoto: **l'area
            diventava grigia**, e serviva un secondo ESC per tornare
            all'elenco. Chi non ha un'anteprima esce dal documento in un colpo. */
        function _haAnteprima() {
            if (!_doc) return false;
            if (_doc.natura === 'crea' || _doc.natura === 'syn') return false;
            return !!_doc.relPath;
        }

        /* `scritto` = il file che l'editor ha appena scritto («PDF»): l'anteprima apre quello, non il file da cui si era
           partiti — che può avere un altro nome, o non esserci più (una variante in un altro carattere va nel Cestino).
           0128, allargamento 12 (Giacomo, 27/10). */
        function _tornaAnteprima(scritto, setNuovo) {
            if (!_doc) return;
            if (_doc.letturaId) { _apriPercorso(_doc.letturaId); return; }
            if (scritto && _doc.natura === 'disk') _doc.relPath = scritto;
            /* «PDF» con un nome nuovo ha fatto una COPIA del mazzo (allargamento 16): l'anteprima è la sua, e «Modifica» apre lei */
            if (setNuovo && _doc.setId) { _doc.setId = String(setNuovo); _doc.id = 'set:' + setNuovo; }
            if (!_haAnteprima()) { _chiudiDocumento(); return; }
            _doc.editing = false;
            _fermaLettura();
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            /* l'anteprima si RIGENERA da capo (file riletto dal disco, builder
               rieseguito sul set): è ciò che la rende «rinfrescata» — mostra il
               salvataggio appena fatto, non la copia di prima */
            _voce = _doc.relPath ? 'disk:' + _doc.relPath : _doc.id;
            rifai();
        }

        /* Aprire la voce scelta. Sta qui e non dentro `suAzione` perché ci si
           arriva anche DOPO la domanda sul salvataggio, cioè da una `then`. */
        function _apriVoce(v) {
            if (v.indexOf('src:') === 0) {
                /* la fonte si apre NELLA tela come ogni altro documento:
                   `src:pdf:<i>` porta l'indice del PDF scelto (senza, si
                   aprirebbe sempre il primo e la voce cliccata non
                   corrisponderebbe a ciò che compare). */
                _voce = v;
                rifai();
                return;
            }
            if (v.indexOf('disk:') === 0) { _voce = v; rifai(); return; }
            _voce = v;
            try {
                if (v.indexOf('set:') === 0) DEd().openSet(v.slice(4));
                else if (v.indexOf('syn:') === 0) DEd().openSynthesis(v.slice(4));
                else if (v === 'ns') DEd().openNodeSheet();
                else if (v === 'cc') DEd().openCausal();
            } catch (e) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); }
            /* Un'apertura può RINUNCIARE (l'editor avvisa e resta dov'era):
               allora la voce non si marca come aperta e l'area torna al suo
               segnaposto — altrimenti la colonna direbbe che un documento è
               aperto e la tela mostrerebbe uno spazio vuoto. */
            try { if (DEd().haDocumento && !DEd().haDocumento()) _voce = ''; } catch (e) { }
            rifai();
        }

        /* ══ F3 (v2) — il clic su una RIGA apre S2 ════════════════════════════
           `_doc` dice lo stato, `_voce` resta il puntatore di ciò che è
           dipinto nella tela — con gli STESSI valori della v1 (`disk:`,
           `src:`, `set:`), mai con una semantica nuova: i suoi lettori
           (`_dipingi`, `_eFonte`, `_etichettaVoce`) sono quelli censiti nella
           spec §3, e la sostituzione completa arriva quando la v1 muore (F6).
           Un set FUSO (F1) si mostra dal suo FILE — è il prodotto, e mostrare
           il file è ciò che rende le due nature la stessa riga — ma
           «Modifica» apre il SET (D4: la sorgente c'è). */
        function _apriPercorso(id, editing) {
            var L = _lettura(), path = (_appState() || {}).activeVaultPath;
            if (!L || !L.prepareElaboraDocument) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); return; }
            if (!_materialiLettura().some(function (m) { return m.id === id; })) {
                _chiudiDocumento(); return;
            }
            smontaLettura(); _fermaLettura();
            var requested = { id: id, letturaId: id, natura: 'disk', pending: true };
            _doc = requested; _voce = id; rifai();
            Promise.resolve().then(function () {
                if (!_aperta || _doc !== requested || (_appState() || {}).activeVaultPath !== path) return null;
                return L.prepareElaboraDocument(id);
            }).then(function (doc) {
                if (!_aperta || _doc !== requested || (_appState() || {}).activeVaultPath !== path) return;
                if (!doc || doc.id !== id || !doc.relPath) throw new Error(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'));
                requested.pending = false; requested.relPath = doc.relPath; requested.title = doc.title; requested.fontId = doc.fontId;
                requested.modificabile = doc.modificabile; requested.audience = doc.audience;
                requested.editing = !!editing && doc.modificabile !== false;
                _voce = 'disk:' + doc.relPath; rifai();
            }).catch(function (e) {
                if (!_aperta || _doc !== requested || (_appState() || {}).activeVaultPath !== path) return;
                toast(e.message || t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'error');
                _chiudiDocumento();
            });
        }
        function _creaAttivitaLettura() {
            if (letturaCreation) { toast(t('pl_operation_pending', 'Attendi che termini l’operazione.'), 'info'); return; }
            var L = _lettura();
            if (!L || !L.openAdditionalActivities) {
                toast(t('pl_runtime_missing', 'Il percorso di lettura non è disponibile in questa versione.'), 'warning'); return;
            }
            var state = _appState(), path = state.activeVaultPath, db = state.db, doc = _doc;
            var request = {};
            letturaCreation = request;
            function current() {
                return letturaCreation === request && _apriLetturaEsterno === _apriDocV2 && _aperta &&
                    _appState() === state && state.extractionMode === 'lettura' && state.activeVaultPath === path && state.db === db && _doc === doc;
            }
            // La console ospita l'ingresso comune; piano, generazione e Banco
            // restano nel controller. Una risposta tardiva non cambia progetto.
            Promise.resolve().then(function () {
                if (!current()) return;
                return L.openAdditionalActivities({ onChanged: function () {
                    if (!current()) return;
                    _disco = null; _caricaDisco(); rifai();
                } });
            }).catch(function (e) {
                if (current()) toast(e.message || t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'error');
            }).finally(function () {
                if (letturaCreation === request) letturaCreation = null;
            });
        }
        function _apriDocV2(mid) {
            _conSalvataggio(function () {
                if (mid.indexOf('lettura:') === 0) { _apriPercorso(mid); return; }
                if (mid.indexOf('set:') === 0) {
                    var m = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (m && m.relPath) {
                        _doc = { id: mid, natura: 'disk', relPath: m.relPath, setId: mid.slice(4) };
                        _voce = 'disk:' + m.relPath;
                    } else {
                        /* 0105: senza file, diritti nell'editor */
                        _doc = { id: mid, natura: 'set', setId: mid.slice(4) };
                        _apriEditorSet(mid.slice(4));
                        return;
                    }
                } else if (mid.indexOf('src:') === 0) {
                    _doc = { id: mid, natura: 'src' }; _voce = mid;
                } else if (mid.indexOf('disk:') === 0) {
                    var mm = _materiali().filter(function (x) { return x.id === mid; })[0];
                    _doc = { id: mid, natura: 'disk', relPath: mid.slice(5), docId: mm && mm.docId };
                    _voce = mid;
                } else if (mid.indexOf('an:') === 0) {
                    /* Analisi della fonte: il PDF si guarda, «Modifica» riapre
                       la SCHEDA (non un editor di testo — la sorgente è la
                       griglia, e il modale della visione è già il suo editor). */
                    var ma = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (!ma) return;
                    if (ma.relPath) {
                        _doc = { id: mid, natura: 'disk', relPath: ma.relPath, analisiId: ma.docId };
                        _voce = 'disk:' + ma.relPath;
                    } else {
                        _doc = { id: mid, natura: 'crea', analisiId: ma.docId };
                        _voce = mid;
                        rifai();
                        _modificaAnalisi(ma.docId);
                        return;
                    }
                } else if (mid.indexOf('oq:') === 0) {
                    var mo = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (!mo) return;
                    if (mo.relPath) {
                        /* il foglio è già stato prodotto: si guarda, e «Modifica»
                           apre la sorgente d'archivio */
                        _doc = { id: mid, natura: 'disk', relPath: mo.relPath, docId: mo.docId };
                        _voce = 'disk:' + mo.relPath;
                    } else {
                        /* senza PDF, diritti nell'editor della sorgente d'archivio
                           (0105, 16/10; dal 12/10 lo precedeva un'anteprima) */
                        _doc = { id: mid, natura: 'crea', editing: false, docId: mo.docId, titolo: mo.titolo };
                        _voce = mid;
                        _apriEditorAperte(mo.docId);
                        return;
                    }
                } else if (mid.indexOf('syn:') === 0) {
                    var ms = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (!ms) return;
                    if (ms.relPath) {
                        /* il file c'è: si guarda, e «Modifica» lo riapre dal vault */
                        _doc = { id: mid, natura: 'disk', relPath: ms.relPath };
                        _voce = 'disk:' + ms.relPath;
                    } else {
                        /* solo in archivio: diritti nell'editor (0105, 16/10; dal
                           12/10 lo precedeva un'anteprima). Stesso patto di
                           `natura:'syn'` più sotto: l'editor è l'unica resa */
                        _doc = { id: mid, natura: 'syn', editing: true, titolo: ms.titolo };
                        _voce = mid;
                        rifai();
                        try { DEd().openSynthesis(mid.slice(4)); }
                        catch (e) {
                            toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning');
                            _chiudiDocumento();
                        }
                        return;
                    }
                } else if (mid.indexOf('ns:') === 0 || mid.indexOf('cc:') === 0) {
                    var quale = mid.indexOf('ns:') === 0 ? 'nodesheet' : 'causal';
                    var nomeCl = decodeURIComponent(mid.slice(3));
                    var tp = TIPI.filter(function (x) { return x.id === quale; })[0];
                    var puo = false; try { puo = tp && tp.puo(); } catch (e) { puo = false; }
                    if (!tp || !puo) {
                        toast((tp && tp.perche) ? tp.perche() : t('ec_no', 'Non disponibile.'), 'warning');
                        return;
                    }
                    var riga = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (riga && riga.relPath) {
                        /* il documento esiste già: si GUARDA, e «Modifica» apre
                           l'editor — come per ogni altro genere */
                        _doc = { id: mid, natura: 'disk', relPath: riga.relPath,
                                 dallaMappa: quale, clone: nomeCl };
                        _voce = 'disk:' + riga.relPath;
                        rifai();
                        return;
                    }
                    /* niente ancora sul disco: diritti nell'editor (0105, 16/10 —
                       dal 12/10 lo precedeva un'anteprima, prima ancora si entrava
                       diritti come ora) */
                    _apriEditorDallaMappa(quale, nomeCl);
                    return;
                } else return;
                rifai();
            });
        }
        /* Il cestino delle righe (regola §10.15: conferma a digitazione del
           nome esatto, la stessa funzione della landing). Solo i FILE si
           eliminano da qui: una voce d'archivio non è un file, e il suo
           editor ha già i suoi comandi. */
        function _delV2(mid) {
            /* ── ELIMINARE UNA COPIA ─────────────────────────────────────────
               Il cestino sta SOLO sui cloni (decisione di Giacomo): una copia si
               crea apposta e si butta apposta. Dove vive la copia decide come si
               elimina — nel progetto, nell'archivio, o come set — e per ognuna
               la conferma è quella a digitazione del nome (regola §10.15). */
            var m0 = _materiali().filter(function (x) { return x.id === mid; })[0];
            if (m0 && m0.clone) { _elCopia(m0); return; }
            if (mid.indexOf('disk:') !== 0) {
                toast(t('ec_del_orig', 'Questo è il documento originale della mappa: si eliminano le copie, non lui.'), 'info');
                return;
            }
            var relPath = mid.slice(5);
            var s2 = _appState();
            var api2 = window.electronAPI;
            if (!api2 || !api2.deleteVaultFile || !s2 || !s2.activeVaultPath) {
                toast(t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
            }
            var T = window.MappAITeach;
            /* ⚠️ niente ripiego che elimina senza chiedere: senza la conferma
               a digitazione, il gesto NON parte */
            if (!T || !T.confirmDeleteText) {
                toast(t('ec_del_ko2', 'La conferma di eliminazione non è disponibile qui.'), 'warning'); return;
            }
            var vp = s2.activeVaultPath;
            var nome = relPath.split('/').pop();
            T.confirmDeleteText(nome, function () {
                Promise.resolve(api2.deleteVaultFile({ vaultPath: vp, relPath: relPath })).then(function (res) {
                    if (res && res.ok) {
                        try { if (window.MappAIVaults) window.MappAIVaults.segnala('file-eliminato', { vaultPath: vp, relPath: relPath }); } catch (e) { }
                        toast(t('lt_file_trashed', 'Spostato nel Cestino.'), 'success');
                        /* se era il documento aperto (anche come natura-file di
                           un set fuso), la tela non può restarci sopra */
                        if (_doc && (_doc.relPath === relPath || _doc.id === 'disk:' + relPath)) _chiudiDocumento();
                        _disco = null; _caricaDisco();   /* il bus ridisegna comunque: doppione innocuo */
                    } else {
                        toast(t('lt_file_del_ko', 'Non è stato possibile eliminare il file') +
                            (res && res.error ? ': ' + res.error : ''), 'error');
                    }
                }).catch(function () { toast(t('lt_file_del_ko', 'Non è stato possibile eliminare il file'), 'error'); });
            });
        }
        /* «Apri nel Finder» di una riga: SEMPRE sul vault attivo — la cache di
           INSEGNA usa la stessa chiave `disk:<relPath>` per vault diversi, e
           fidarsene qui aprirebbe il file di un'altra mappa. */
        function _finderV2(mid) {
            if (mid.indexOf('disk:') !== 0) return;
            var s3 = _appState();
            var api3 = window.electronAPI;
            if (!api3 || !api3.pipelineOpenFile || !s3 || !s3.activeVaultPath) {
                toast(t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
            }
            Promise.resolve(api3.pipelineOpenFile({ vaultPath: s3.activeVaultPath, relPath: mid.slice(5) }))
                .then(function (res) {
                    if (res && res.ok === false) toast(t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning');
                })
                .catch(function () { toast(t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning'); });
        }

        /* ── Uscire da un documento svuota l'AREA (Giacomo, 8/8 notte) ────────
           L'editor, chiudendo un documento, torna alla SUA lista e la disegna
           nell'host — che qui è la tela. Ma l'elenco dei documenti in questa
           console vive nella COLONNA: la lista dell'editor nell'area era un
           secondo elenco delle stesse cose nella stessa schermata. Ora l'editor
           annuncia l'uscita e la console torna al segnaposto, deselezionando
           anche la voce nella colonna (è `_voce = ''` a farlo: la voce attiva è
           un dato dello schema, non una classe appiccicata al DOM).
           ⚠️ L'ascolto si toglie alla chiusura: la console si apre e si chiude
           più volte in una sessione, e un ascoltatore per ogni apertura
           ridisegnerebbe N volte una finestra che non c'è più. */
        function _suUscitaDoc(ev) {
            if (!_aperta) return;
            /* L'editor annuncia l'uscita (la sua «Esci»/«Salva ed Esci») → si
               torna all'ANTEPRIMA rinfrescata, non all'elenco. L'evento arriva
               PRIMA del render dell'editor: il repaint sincrono toglie l'host e
               quel render non trova dove disegnare. */
            if (_doc && _doc.editing) _tornaAnteprima(ev && ev.detail && ev.detail.scritto, ev && ev.detail && ev.detail.set);
        }
        document.addEventListener('mappai-doc-uscito', _suUscitaDoc);
        /* 0114: un gesto sulle figure cambia il numero della tabella «Figure»; mentre la
           vista è aperta le tabelle non si vedono (la tela le sostituisce), quindi si
           ridisegna solo l'elenco, quando è lui a schermo */
        function _suFigure() { if (_aperta && !_doc) { try { rifai(); } catch (e) { } } }
        document.addEventListener('mappai-figure-cambiata', _suFigure);

        /* ── UN DOCUMENTO APERTO DA FUORI ENTRA NELLA TELA (13/8 sera) ────────
           «Crea un documento → Quiz → Le scrivo io» non passa da queste righe:
           il percorso vive in `mappai-crea-quiz.js`, che crea il documento e lo
           consegna all'editor. Ma l'editor si disegna solo dentro
           `#elab-doc-host`, e quell'host lo monta questa console quando è in
           modalità documento — che nessuno le aveva detto di essere. Risultato:
           il documento c'era, a schermo restava l'elenco di prima, e il gesto
           sembrava non aver funzionato. Ora l'editor ANNUNCIA e la console lo
           accoglie.
           ⚠️ Si ignora l'eco delle aperture proprie (`_doc.editing` già vero):
           la console imposta lo stato PRIMA di chiamare l'editor, e rifarlo qui
           azzererebbe la natura della riga (`disk`, `set`) da cui si è partiti. */
        function _suDocAperto(ev) {
            if (!_aperta) return;
            if (_doc && _doc.editing) return;
            var d = (ev && ev.detail) || {};
            /* ⚠️ Questa era una lista CHIUSA di tre forme (`docId`/`setId`/
               `dallaMappa`): una sintesi non è nessuna delle tre e usciva di
               qui subito, quindi l'host non veniva montato e il documento
               restava invisibile (17/8). La sintesi entra come quarta forma. */
            if (!d.docId && !d.setId && !d.dallaMappa && d.kind !== 'synthesis') return;
            if (d.docId) _doc = { id: 'oq:' + d.docId, natura: 'crea', editing: true, docId: d.docId };
            else if (d.setId) _doc = { id: 'set:' + d.setId, natura: 'crea', editing: true, setId: d.setId };
            else if (d.kind === 'synthesis') {
                /* Gli id sono QUELLI DELLA COLONNA (`syn:` per l'archivio o la
                   sintesi di sessione, `synfile:` per un file del vault), non
                   una terza convenzione: è così che la riga giusta si accende e
                   che `_etichettaVoce` sa come si chiama il documento.
                   `_doc = null` perché una sintesi non ha una sorgente
                   d'archivio da riaprire: la disegna il ramo finale di
                   `_dipingi`, che monta l'host e lascia fare all'editor. */
                var idSyn = d.dalVault ? ('synfile:' + d.dalVault) : ('syn:' + (d.synId || 'current'));
                /* Apertura partita DALLA console: la voce è già quella, e
                   ridisegnare due volte lo stesso stato è lavoro sprecato. */
                if (_voce === idSyn) return;
                /* ⚠️ Se la console stava già mostrando l'ANTEPRIMA di questo
                   stesso file (si è premuto «Modifica» su una riga `disk:`), il
                   suo `_doc` porta il `relPath` — cioè la strada del ritorno.
                   Sostituirlo con un `_doc` di sintesi la cancellerebbe, e
                   uscendo dall'editing si chiuderebbe il documento invece di
                   tornare all'anteprima da cui si era partiti. */
                if (_doc && d.dalVault && _doc.relPath === d.dalVault) {
                    _doc.editing = true;
                    _voce = idSyn;
                    _disco = null;
                    rifai();
                    _caricaDisco();
                    return;
                }
                /* ⚠️ `_doc` NON può restare `null`: è lui a far emettere la tela
                   (`if (_doc) s.tela = …` in `_schemaV2`), e senza tela
                   `_montaHost` non trova dove appendere `#elab-doc-host` — cioè
                   di nuovo un documento caricato e invisibile, il difetto che
                   questo ramo esiste per chiudere.
                   `natura:'syn'` senza `docId` né `dallaMappa` di proposito:
                   così `_dipingi` scarta i rami dell'anteprima e cade su quello
                   finale, che monta l'host e lascia disegnare l'editor — che per
                   una sintesi è l'unica resa, non c'è nessuna anteprima da
                   ricostruire. `editing:true` è ciò che fa ignorare l'eco delle
                   aperture successive. */
                _doc = { id: idSyn, natura: 'syn', editing: true };
                _voce = idSyn;
                _disco = null;
                rifai();
                _caricaDisco();
                return;
            }
            else _doc = { id: (d.dallaMappa === 'nodesheet' ? 'ns:' : 'cc:') + encodeURIComponent(d.clone || ''),
                          natura: 'crea', editing: true, dallaMappa: d.dallaMappa, clone: d.clone || '' };
            _voce = _doc.id;
            _disco = null;              /* il documento nuovo può aver scritto: si rilegge */
            rifai();
            _caricaDisco();
        }
        document.addEventListener('mappai-doc-aperto', _suDocAperto);

        /* ── LE CARTELLE SONO CAMBIATE (Giacomo, 9/8) ─────────────────────────
           La colonna elenca documenti che stanno anche su DISCO (le sintesi
           archiviate, i file scritti da «Nel vault», i materiali della pipeline)
           e la briciola elenca le mappe della classe: se qualcosa cambia là fuori
           mentre la console è aperta, qui si rilegge. Il canale raggruppa le
           notifiche, quindi una pipeline che scrive otto file fa un ridisegno. */
        var _staccaCanale = (window.MappAIVaults && window.MappAIVaults.quando)
            ? window.MappAIVaults.quando(function () {
                if (!_aperta) return;
                _mappe = null;
                _disco = null;
                rifai();
                _caricaMappe();
                _caricaDisco();
            })
            : function () { };

        _apriLetturaEsterno = _apriDocV2;
        var s = _schema();
        /* il PRIMO disegno: `open()` non restituisce il box, lo consegna qui */
        s.suApertura = function (box, ridis) {
            ridisegna = ridis;
            montaBriciole(box);
            /* 0094 (S7): tasto destro su un progetto della colonna → «Rinomina…» */
            if (window.MappAIRinomina && MappAIRinomina.menuContestuale) {
                MappAIRinomina.menuContestuale(box, function (nav) {
                    if (String(nav).indexOf('prog:') !== 0) return null;
                    var id = String(nav).slice(5);
                    var m = (_mappe || []).filter(function (x) { return String(x.id) === id; })[0];
                    return (m && window.MappAITeach && MappAITeach.perRinomina) ? MappAITeach.perRinomina(m) : null;
                });
            }
            /* l'elenco delle mappe arriva dal disco: si chiede all'apertura e la
               briciola si completa quando risponde (`suApertura` esiste per
               questo — `suAzione` nasce da un gesto e qui non c'è nessun gesto) */
            _caricaMappe();
            rifaiEsterno = rifai;      /* il disco risponde dopo: serve ridisegnare */
            _caricaDisco();            /* i documenti già prodotti, dal vault */
            _ripristinaFonti();        /* 0114: le fonti di una mappa già in memoria */
            if (options.letturaId) _apriDocV2(options.letturaId);
        };
        s.suAzione = function (ev, box, ridis) {
            ridisegna = ridis;
            var id = ev.azione;

            /* ── ESC CHIUDE IL DOCUMENTO, non la console ─────────────────────
               🐛 Non c'era nessun ramo `__esc`: il motore lo manda e chiude tutto
               se non riceve ESATTAMENTE `false`, poi la `then` di chiusura chiama
               `reset()` sull'editor — che azzera `_dirty`. Cioè un ESC distratto
               buttava via il lavoro non salvato senza una domanda.
               ⚠️ La risposta `false` deve partire SUBITO, prima della domanda sul
               salvataggio, che è asincrona: rispondere dopo vorrebbe dire che la
               console si chiude mentre la domanda è ancora a schermo. */
            if (id === '__esc') {
                /* La scala degli strati: editor → anteprima → elenco → niente.
                   ⚠️ Senza documento aperto ESC NON chiude la console (decisione
                   di Giacomo, 10/8): questa console non è una finestra SOPRA
                   ELABORA, è ELABORA — chiuderla lascerebbe sotto una landing
                   vuota, cioè un vicolo cieco apparente. Dalla sezione si esce
                   dal percorso in alto, che è un gesto deliberato. */
                if (!_doc) return false;
                if (_doc.editing) { _conSalvataggio(_tornaAnteprima); return false; }
                _conSalvataggio(_chiudiDocumento);
                return false;
            }

            if (id === 'crea') {
                if ((_appState() || {}).extractionMode === 'lettura') return _creaAttivitaLettura();
                /* Un documento «dalla mappa» nasce direttamente in EDITOR (niente
                   anteprima: di ciò che non esiste ancora non c'è nulla da
                   mostrare). `_popupCrea` scrive `_voce` PRIMA di chiamare `poi`. */
                return _popupCrea(function () {
                    _doc = { id: _voce, natura: 'crea', editing: true };
                    rifai();
                });
            }

            /* v2: i gesti delle tabelle e della barra della fonte */
            if (id === 'esci-doc') { _conSalvataggio(_chiudiDocumento); return; }
            /* 0090: il nome di una riga in attesa e il suo chip riaprono la G2 dov'era —
               la stessa strada di «Rivedi materiali» e di `runApprovedMaterials` */
            if (id.indexOf('m:att:') === 0 || id.indexOf('chip:att:') === 0) {
                if (window.MappAIPipeline && window.MappAIPipeline.completaValidazione) window.MappAIPipeline.completaValidazione();
                return;
            }
            if (id.indexOf('m:') === 0) { _apriDocV2(id.slice(2)); return; }
            if (id.indexOf('modifica:lettura:') === 0) { _conSalvataggio(function () { _apriPercorso(id.slice(9), true); }); return; }
            if (id.indexOf('clona:lettura:') === 0 || id.indexOf('del:lettura:') === 0) {
                var cloning = id.indexOf('clona:') === 0, mid = id.slice(cloning ? 6 : 4);
                var row = _materialiLettura().find(function (m) { return m.id === mid; });
                if (!row || !(cloning ? row.clonabile : row.eliminabile)) return;
                var state = _appState(), vault = state.activeVaultPath;
                function apply(name) {
                    if (!_aperta || _appState() !== state || state.activeVaultPath !== vault) return;
                    return Promise.resolve().then(function () { return cloning ? _lettura().cloneElaboraMaterial(mid, name) : _lettura().deleteElaboraMaterial(mid); })
                        .then(function () { if (_aperta && _appState() === state && state.activeVaultPath === vault) { _disco = null; rifai(); _caricaDisco(); } })
                        .catch(function (e) { toast(e.message, 'error'); });
                }
                if (cloning) return MM().chiedi({ titolo: t('ec_clona_t', 'Fai una copia'), etichetta: t('ec_clona_n', 'Nome della copia — distingue anche il file nella cartella'),
                    valore: row.titolo + ' — ' + t('pl_copy', 'Copia'), conferma: t('ec_clona_ok', 'Crea la copia') }).then(function (name) { if (name != null && name !== false) return apply(name); });
                if (window.MappAITeach && window.MappAITeach.confirmDeleteText) window.MappAITeach.confirmDeleteText(row.titolo, function () { return apply(); });
                return;
            }
            if (id.indexOf('clona:') === 0) { _clonaV2(id.slice(6), rifai); return; }
            if (id.indexOf('del:') === 0) { _delV2(id.slice(4)); return; }
            if (id.indexOf('fnd:') === 0) { _finderV2(id.slice(4)); return; }

            /* Un gruppo piegato: il motore l'ha già chiuso a schermo, qui si
               RICORDA — la console si ridisegna a ogni documento scelto, e senza
               memoria i gruppi si riaprirebbero da soli. */
            if (id === '__gruppo') {
                var g = String(ev.voce || '').replace(/^g:/, '');
                if (g) { _chiusi[g] = !!ev.chiuso; _salvaChiusi(); }
                return;
            }

            /* i comandi della fonte: li esegue ELABORA, che è il solo a sapere che
               cosa vogliono dire (esporta evidenziata, domande scheda, aggiungi
               PDF…). Qui si smista e basta — riscriverli sarebbe una seconda
               implementazione degli stessi gesti. */
            if (id && id.indexOf('src-') === 0 && EL() && EL().runSourceAction) {
                try { EL().runSourceAction(id); } catch (e) { }
                return;
            }

            if (id === '__nav') {
                var v = ev.voce || '';
                /* v2: la sidebar sceglie il PROGETTO (D1). Il caricamento è lo
                   stesso della briciola (`_cambiaMappa`: azzera, aspetta
                   l'identità giusta, ridisegna) — due strade per lo stesso
                   gesto divergerebbero al primo ritocco. */
                if (v.indexOf('prog:') === 0) {
                    var pid = v.slice(5);
                    var m = (_mappe || []).filter(function (x) { return String(x.id) === pid; })[0];
                    if (!m) return;
                    var T = window.MappAITeach, corr = null;
                    try { corr = (T && T.mappaCorrente) ? T.mappaCorrente(_mappe) : null; } catch (e) { }
                    if (!_inCorsoV2 && corr && corr.id === m.id) return;   /* è già quello */
                    _conSalvataggio(function () {
                        _prog = m.id; _doc = null;
                        /* visto: il bollino «NUOVO» sparisce al PRIMO clic */
                        try { if (window.MappAIGen && MappAIGen.visto) MappAIGen.visto(m); } catch (e) { }
                        _cambiaMappa(m);
                    });
                    return;
                }
                if (v.indexOf('vuoto:') === 0) return;        /* riga informativa */
                if (v === _voce) return;                      /* è già quella aperta */
                /* Scegliere un'altra voce È uscire dal documento aperto: stessa
                   domanda dell'ESC, altrimenti il lavoro si perde a seconda di
                   come si esce. */
                _conSalvataggio(function () { _apriVoce(v); });
                return;
            }
        };
        /* ⚠️ Chi apre una console DICHIARA la sua sezione: la veste la travasa
           dal `<html>` sul VELO (le console si impilano, una variabile globale
           direbbe sempre l'ultima aperta). Senza, il percorso non sa dove si è e
           mostra il solo «Cosa» — ed è anche ciò che tiene accesa la forma
           giusta quando si guarda da fuori. */
        try { document.documentElement.dataset.manSezionePendente = 'elabora'; } catch (e) { }
        MM().open(s).then(function () {
            smontaLettura(); _apriLetturaEsterno = null;
            /* uscendo si azzera l'editor: il documento aperto appartiene a
               questa sessione della console, non alla prossima */
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            /* e si SMONTA la fonte: l'host se ne va col velo, ma finché ELABORA
               lo tiene per buono ogni suo `render()` (l'hook sul salvataggio di
               un nodo, per esempio) crederebbe di dover disegnare lì. */
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            document.removeEventListener('mappai-doc-uscito', _suUscitaDoc);
            document.removeEventListener('mappai-doc-aperto', _suDocAperto);
            document.removeEventListener('mappai-figure-cambiata', _suFigure);
            try { _staccaCanale(); } catch (e) { }
            _voce = '';
            _prog = null; _doc = null; _inCorsoV2 = null;
            _allineato = false;      /* alla prossima apertura si riallinea */
            _aperta = false;
        });
        /* il primo disegno: la console si apre sul segnaposto (nessun documento
           scelto), quindi non c'è ancora niente da montare */
    }

    window.MappAIElaboraConsole = {
        open: open,
        /* hook per il validatore/banco: lo schema si controlla senza aprire */
        schema: _schema,
        /* F1 (spec ELABORA v2): la lista unificata del §4, esposta per provarla
           con dati finti senza aprire la console. Sola lettura. */
        materiali: _materiali,
        tipi: TIPI,
        attiva: _bentoApp,
        aperta: function () { return _aperta; },
        /* 0090 (parte B): a console aperta il ritorno in ELABORA la AGGIORNA (righe
           senza chip, file veri dal disco) invece di riaprirla: è il gesto di
           `rifaiEsterno` all'arrivo del disco. */
        aggiorna: function () {
            if (!_aperta) return false;
            _disco = null;
            try { rifaiEsterno(); } catch (e) { }
            try { _caricaDisco(); } catch (e) { }
            return true;
        },
        /* 0096 (B): solo il ridisegno, senza rileggere il disco. Lo chiede ELABORA
           quando un PDF è appena entrato nella fonte: «Aggiungi PDF» si spegne subito. */
        ridisegna: function () {
            if (!_aperta) return false;
            try { rifaiEsterno(); } catch (e) { }
            return true;
        }
    };
    console.log('[MappAIElaboraConsole] console di ELABORA caricata');
})();
