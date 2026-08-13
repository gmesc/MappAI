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
        try { return localStorage.getItem('mappai_console_bento_app') === '1'; } catch (e) { return false; }
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
    function _mappaAperta() {
        var s = _appState();
        return !!(s && s.db && (s.db.nodes || []).length);
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
    function _pdf() {
        var s = _appState();
        return ((s && s.sources) || []).filter(function (x) {
            if (!x) return false;
            if (x.file && /\.pdf$/i.test(x.file.name || '')) return true;
            return !!(x.vaultRel && /\.pdf$/i.test(x.vaultRel));
        });
    }

    /* ── I TIPI DI DOCUMENTO — la fonte unica del popup «Crea nuovo» ──────────
       `da` dice CHI lo produce: `mappa` = si costruisce dalla mappa, subito e
       senza spendere niente; `ai` = lo genera un motore che sta altrove, e qui
       si può solo portare l'utente dove quel motore vive. Distinguerli è ciò che
       evita un popup che promette quattro cose e ne mantiene due. */
    var TIPI = [
        {
            id: 'nodesheet', da: 'mappa', icona: 'scissors',
            et: function () { return t('de_ns', 'Foglio dei nodi'); },
            desc: function () { return t('ec_ns_d', 'Le card dei nodi, pronte da ritagliare. Si costruisce dalla mappa: non serve generarlo prima.'); },
            puo: function () { return _nodi() > 0 && !!(DEd() && DEd().openNodeSheet); },
            perche: function () { return t('ec_ns_no', 'La mappa non ha nodi da stampare.'); },
            apri: function () { DEd().openNodeSheet(); }
        },
        {
            id: 'causal', da: 'mappa', icona: 'git-branch',
            et: function () { return t('de_cc', 'Catena dei perché'); },
            desc: function () { return t('ec_cc_d', 'I nessi causali della mappa messi in fila. Come il foglio dei nodi, si ricava dalla mappa al volo.'); },
            puo: function () { return _mappaAperta() && !!(DEd() && DEd().openCausal && window.MappAICausalCore) && _nessiCausali() > 0; },
            perche: function () { return t('ec_cc_no', 'Questa mappa non dichiara nessi causali.'); },
            apri: function () { DEd().openCausal(); }
        },
        {
            id: 'synthesis', da: 'ai', icona: 'file-text',
            et: function () { return t('de_synth', 'Sintesi'); },
            desc: function () { return t('ec_syn_d', 'Il testo disteso di un ramo o dell\'intera mappa. La genera l\'AI da «Materiali di studio»; qui poi si rivede.'); },
            puo: function () { return true; },
            apri: function () { _vaiAlGeneratore(); }
        },
        {
            id: 'quiz', da: 'ai', icona: 'list-checks',
            et: function () { return t('ec_quiz', 'Quiz o flashcard'); },
            desc: function () { return t('ec_quiz_d', 'Domande e carte da studio. Le genera l\'AI dalla mappa; qui si correggono prima di stamparle.'); },
            puo: function () { return true; },
            apri: function () { _vaiAlGeneratore(); }
        }
    ];
    /* I documenti che nascono dall'AI non si creano da qui: il loro motore vive
       nel hub «Materiali di studio». Portare l'utente lì è onesto — riscrivere
       un secondo ingresso alla generazione significherebbe due strade da tenere
       allineate. */
    function _vaiAlGeneratore() {
        if (window.openStudyMaterialsModal) { window.openStudyMaterialsModal(); return; }
        toast(t('ec_gen_ko', 'Il generatore dei materiali non è disponibile qui.'), 'warning');
    }

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
        return 'altri';
    }
    function _caricaDisco() {
        var s = _appState();
        var api = window.electronAPI;
        var vp = (s && s.activeVaultPath) || '';
        if (!api || !api.vaultMaterialsList || !vp) { _disco = []; _discoVault = vp; return; }
        _discoVault = vp;
        api.vaultMaterialsList({ vaultPath: vp }).then(function (r) {
            if (_discoVault !== vp) return;          /* mappa cambiata nel frattempo */
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
    /* I nomi che quel genere avrebbe sul disco, in minuscolo: prima la forma
       nuova, poi quella col marcatore storico. L'ordine conta: a parità di
       file presenti si aggancia la forma esatta. */
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
        var nome = PC.buildFileName(genere, null, false, opz);
        var tarato = String(nome).replace(/(\.[A-Za-z0-9]+)$/,
            (PC.SUFFISSO_TARATO || ' -VERDE') + '$1');
        return [String(nome).toLowerCase(), tarato.toLowerCase()];
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
        return t2.indexOf(base + ' - ') === 0 ? t2.slice(base.length + 3).trim() : '';
    }

    function _materiali() {
        var out = [];
        /* La FONTE è la prima voce (D2): il testo sempre, i PDF quanti sono.
           Stessa catena di fallback del nome usata dalla colonna. */
        out.push({
            id: 'src:text', titolo: t('el_view_text', 'Testo'), tipo: 'Fonte',
            data: 0, archivio: false, voce: false, cls: '', disc: ''
        });
        _pdf().forEach(function (p, i) {
            out.push({
                id: 'src:pdf:' + i,
                titolo: (p.file && p.file.name) || p.name
                    || (p.vaultRel ? String(p.vaultRel).split('/').pop() : '')
                    || (t('el_view_pdf', 'PDF') + ' ' + (i + 1)),
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
            var nomi = _nomiAttesi(g.genere, x.clone);
            nomi.forEach(function (n) { attesi[n] = (attesi[n] || 0) + 1; });
            return { x: x, g: g, nomi: nomi };
        });
        perSet.forEach(function (r) {
            var v = {
                id: 'set:' + r.x.id, titolo: _nomeFunz(r.g.tipo, r.x.clone), tipo: r.g.tipo,
                data: Date.parse(r.x.date) || 0, archivio: true, modificabile: true,
                clonabile: true, clone: r.x.clone || '', voce: false, cls: '', disc: ''
            };
            var file = null;
            for (var n = 0; n < r.nomi.length && !file; n++) {
                if (attesi[r.nomi[n]] !== 1) continue;
                for (var i = 0; i < dischi.length && !file; i++) {
                    if (!presi[dischi[i].relPath] && dischi[i].name.toLowerCase() === r.nomi[n]) file = dischi[i];
                }
            }
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
                var testo = r && (r.text || r.content);
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
            var SM = (typeof StorageManager !== 'undefined') ? StorageManager : window.StorageManager;
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
            var base = String(nomeFile).replace(/\.[A-Za-z0-9]+$/, '');
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
            fonte.push({
                id: 'src:pdf:' + i, icona: 'file-type', attiva: _voce === 'src:pdf:' + i,
                /* il nome viene dal file se c'è, altrimenti da `name`/`vaultRel`:
                   sulle mappe riaperte la voce diceva «PDF 1» pur avendo il nome */
                etichetta: (p.file && p.file.name) || p.name
                    || (p.vaultRel ? String(p.vaultRel).split('/').pop() : '')
                    || (t('el_view_pdf', 'PDF') + ' ' + (i + 1))
            });
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
                icona: m.type === 'kg' ? 'network' : 'map',
                /* mentre una mappa si sta aprendo è LEI la scelta, non quella
                   ancora caricata sotto */
                attiva: _inCorsoV2 ? _inCorsoV2 === m.id : !!(corrente && corrente.id === m.id),
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
    function _tabelleV2() {
        var lista = _materiali();
        var fonte = lista.filter(function (m) { return m.tipo === 'Fonte'; });
        var resto = lista.filter(function (m) { return m.tipo !== 'Fonte'; });
        var tabs = [{
            id: 'g:fonte', titolo: t('ec_g_fonte', 'Fonte'),
            colonne: [{ etichetta: t('lt_col_nome', 'Nome'), larghezza: '' }],
            righe: fonte.map(function (m) {
                return { id: 'm:' + m.id, chiude: false, celle: [m.titolo] };
            })
        }];
        var T = window.MappAITeach;
        if (T && T.tabelleMateriali) {
            try { tabs = tabs.concat(T.tabelleMateriali(resto, false, 'elabora') || []); } catch (e) { }
        }
        return tabs;
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
                s.sezioni.push({
                    id: 'src-cmd', nuda: true,
                    azioni: EL().sourceActions().map(function (a) {
                        return { id: a.id, etichetta: a.etichetta, icona: a.icona, ruolo: a.ruolo || 'quieto', chiude: false };
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
    function _montaFile(box, relPath, opts) {
        var tela = (box || document).querySelector('.mm-tela[data-tela="elab"]');
        if (!tela) return;
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
            if (_voce !== 'disk:' + relPath) return;          /* nel frattempo ha scelto altro */
            if (!r || !r.ok) {
                host.innerHTML = '<p style="font-family:monospace;padding:24px">' +
                    t('ec_file_ko', 'Non riesco ad aprire questo file') + (r && r.error ? ': ' + r.error : '') + '</p>';
                return;
            }
            var eHtml = /\.html?$/i.test(relPath);
            var mime = /\.pdf$/i.test(relPath) ? 'application/pdf'
                : eHtml ? 'text/html'
                    : /\.(mp3|m4a|wav)$/i.test(relPath) ? 'audio/mpeg' : 'application/octet-stream';
            var nomeFile = String(relPath).split('/').pop();
            _stiliEditor();
            host.innerHTML = '';

            /* ── LA BARRA, una sola, nella veste dei quattro editor ──────────── */
            var barra = document.createElement('div');
            barra.className = 'de-bar';
            var tit = document.createElement('div');
            tit.className = 'de-bar-t';
            tit.textContent = nomeFile;
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

            bottone(t('de_print', 'Stampa')).addEventListener('click', function () {
                /* 🐛 Prima era `f.contentWindow.print()` dentro un catch muto: con
                   l'iframe a origine opaca lancia SecurityError e il bottone non
                   faceva nulla senza dirlo. */
                var ok = window.MappAIDocBar && window.MappAIDocBar.stampaIframe
                    ? window.MappAIDocBar.stampaIframe(fr, nomeFile) : false;
                if (!ok) toast(t('ec_stampa_ko', 'Non riesco a stampare questo documento da qui: aprilo dalla cartella.'), 'warning');
            });

            /* «HTML»: la copia da CONSEGNARE, con la voce naturale dentro. Solo
               sui documenti HTML — un PDF non ha niente da incorporare. Sta
               accanto a «Stampa» perché sono le due uscite del documento: una
               sulla carta, una nelle mani dell'allievo. */
            if (eHtml) {
                bottone(t('ec_html', 'HTML'),
                    t('ec_html_tip', 'Scarica il documento come file unico, con la voce naturale incorporata: si manda all\'allievo e funziona da solo.'))
                    .addEventListener('click', function () {
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
                /* La taglia del testo PRIMA di ogni altra cosa, e prima
                   dell'eccezione qui sotto: un documento con la voce incorporata
                   esce di qui senza passare dal resto, e resterebbe l'unico a
                   leggersi piccolo. Non fa nulla sui documenti già nuovi. */
                if (window.MappAIDocBar && window.MappAIDocBar.scalaTesto) window.MappAIDocBar.scalaTesto(fr);
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
                _montaChip(chipHost, d);
            });
            if (eHtml) fr.srcdoc = _testoDaBase64(r.base64);
            else fr.src = 'data:' + mime + ';base64,' + r.base64;
            host.appendChild(fr);
        }).catch(function () {
            host.innerHTML = '<p style="font-family:monospace;padding:24px">' + t('ec_file_ko', 'Non riesco ad aprire questo file') + '</p>';
        });
    }

    /* ══ F3 — L'ANTEPRIMA DI UN SET D'ARCHIVIO (v2, D3) ═══════════════════════
       Una voce d'archivio non è un file: è un set in localStorage. La sua
       anteprima si GENERA dal builder headless — lo stesso che produce il
       foglio stampato (`buildQuizSetHtml` / `buildFlashcardSetHtml`, già usati
       dalla pipeline) — così le due nature mostrano la stessa cosa e il doppio
       registro si può fondere. Nessun visore nuovo: stesso iframe `srcdoc` e
       stessa barra `.de-bar` di `_montaFile`.
       ⚠️ L'anteprima è del DOCENTE: il quiz esce CON il foglio soluzioni
       (`includeAnswers: true`) — è la revisione, non la copia da consegnare.
       «Stampa» stampa ciò che si vede; la stampa con/senza soluzioni resta
       nell'editor, dove c'era già. */
    function _montaAnteprimaSet(box, setId, opts) {
        opts = opts || {};
        var tela = (box || document).querySelector('.mm-tela[data-tela="elab"]');
        if (!tela) return;
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
        var set = _sets().filter(function (x) { return String(x.id) === String(setId); })[0];
        if (!set) {
            /* il set può sparire sotto i piedi (mappa ricaricata, set eliminato):
               si dice, invece di mostrare l'anteprima di ieri */
            host.innerHTML = '<p style="font-family:monospace;padding:24px">' +
                t('ec_set_via', 'Questo set non è più nella mappa.') + '</p>';
            return;
        }
        var kind = _kindOf(set);
        var mappa = (_appState() && _appState().rootNodeLabel) || '';
        var html = '';
        try {
            html = kind === 'flashcards'
                ? (window.buildFlashcardSetHtml ? window.buildFlashcardSetHtml(set, { includeBar: false, mapName: mappa }) : '')
                : (window.buildQuizSetHtml ? window.buildQuizSetHtml(set, { includeBar: false, includeAnswers: true, mapName: mappa }) : '');
        } catch (e) { html = ''; }
        if (!html) {
            host.innerHTML = '<p style="font-family:monospace;padding:24px">' +
                t('ec_anteprima_ko', 'Non riesco a costruire l\'anteprima di questo set.') + '</p>';
            return;
        }
        _stiliEditor();
        host.innerHTML = '';
        var titolo = set.title || t('de_quiz', 'Quiz');

        var barra = document.createElement('div');
        barra.className = 'de-bar';
        var tit = document.createElement('div');
        tit.className = 'de-bar-t';
        tit.textContent = titolo;
        barra.appendChild(tit);
        var sp = document.createElement('div');
        sp.className = 'de-spacer';
        barra.appendChild(sp);
        function bottone(etichetta, titoloTip, primario) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'de-btn' + (primario ? ' de-primary' : '');
            b.textContent = etichetta;
            if (titoloTip) b.title = titoloTip;
            barra.appendChild(b);
            return b;
        }
        var fr = document.createElement('iframe');
        if (opts.modifica) {
            bottone(t('ec_modifica', 'Modifica'),
                t('ec_modifica_tip2', 'Apri questo set nell\'editor per correggerlo.'), true)
                .addEventListener('click', function () { opts.modifica(); });
        }
        bottone(t('de_print', 'Stampa')).addEventListener('click', function () {
            var ok = window.MappAIDocBar && window.MappAIDocBar.stampaIframe
                ? window.MappAIDocBar.stampaIframe(fr, titolo) : false;
            if (!ok) toast(t('ec_stampa_ko', 'Non riesco a stampare questo documento da qui: aprilo dalla cartella.'), 'warning');
        });
        if (opts.esci) {
            bottone(t('ec_esci', 'Esci'), t('ec_esci_tip', 'Chiudi il documento e torna alle tabelle.'))
                .addEventListener('click', function () { opts.esci(); });
        }
        host.appendChild(barra);

        fr.style.cssText = 'flex:1;min-height:0;width:100%;border:0;background:#fff';
        fr.setAttribute('title', titolo);
        fr.srcdoc = html;
        host.appendChild(fr);
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

    /* ── Il popup «Crea nuovo» ────────────────────────────────────────────────
       Un elenco di TIPI, non di comandi: si sceglie che cosa si vuole ottenere.
       I tipi che si costruiscono dalla mappa si aprono subito; quelli che
       richiedono l'AI portano al loro motore, e la riga lo dice. */
    function _popupCrea(poi) {
        if (!MM()) return;
        var voci = TIPI.map(function (tp) {
            var puo = true;
            try { puo = tp.puo(); } catch (e) { puo = false; }
            var seconda = puo ? tp.desc() : (tp.perche ? tp.perche() : '');
            return {
                id: 'tipo:' + tp.id, icona: tp.icona,
                etichetta: tp.et(), sotto: seconda,
                badge: tp.da === 'ai' ? t('ec_da_ai', 'con l\'AI') : t('ec_da_mappa', 'dalla mappa'),
            };
        });
        MM().open({
            titolo: t('ec_crea_t', 'Crea un documento'), icona: 'plus', taglia: 'm', invio: false,
            sezioni: [{ voci: voci }]
        }).then(function (r) {
            if (!r || !r.azione || r.azione.indexOf('tipo:') !== 0) return;
            var tp = TIPI.filter(function (x) { return 'tipo:' + x.id === r.azione; })[0];
            if (!tp) return;
            var puo = true; try { puo = tp.puo(); } catch (e) { puo = false; }
            if (!puo) { toast(tp.perche ? tp.perche() : t('ec_no', 'Non disponibile.'), 'warning'); return; }
            if (tp.da === 'ai') { tp.apri(); return; }        /* esce: il motore vive altrove */
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
    function open() {
        if (!MM()) { if (EL() && EL().open) EL().open(); return; }
        if (!DEd()) { toast(t('ec_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning'); return; }
        /* ⚠️ Guardia anti-impilamento (trovata pilotando l'app via CDP, 10/8):
           un secondo `open()` con la console già aperta ne impilava una SECONDA
           sulla prima — `rifaiEsterno` ridisegnava solo la nuova e la vecchia
           restava a schermo, ferma, con i dati di prima. Dal percorso utente
           non ci si arriva (il rail passa da `onCosa`, che chiude prima), ma
           una chiamata programmatica doppia sì. Aperta = non si riapre. */
        if (_aperta) return;
        _voce = '';
        _aperta = true;
        var ridisegna = null;
        _mappe = null;
        _inCorso = null;
        _inCorsoV2 = null;
        _prog = null;
        _doc = null;

        function rifai() {
            if (!ridisegna) return;
            var box = ridisegna(_schema());
            _dipingi(box);
            montaBriciole(box);
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
                var liv = CB.specContesto({
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
                    onMateria: function (mm) { dopo(function () { if (CL.setActiveDiscipline) CL.setActiveDiscipline(mm); }); },
                    onNuovaMateria: function () { }
                }, 'materia');
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
                var pronto = liv.length >= 3 && (clsAttiva ? !!mat : true);
                /* F5 (v2, D1): le briciole filtrano QUALI progetti — QUALE lo
                   sceglie la sidebar, dove il progetto attivo è già marcato.
                   La quarta briciola col suo menu sarebbe un secondo comando per
                   lo stesso gesto, e due comandi divergono al primo ritocco. */
                CB.montaPercorso(box, { livelli: liv });
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
            var T = window.MappAITeach;
            if (!T || !T.apriMappa) { toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); return; }
            _voce = '';
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            _inCorso = m;
            _inCorsoV2 = m.id;                         /* la nav v2 marca la scelta */
            rifai();                                   /* segnaposto + «apro…» sulla briciola */
            /* ⚠️ Se nel frattempo il contesto è cambiato (`_inCorso` azzerato da
               `dopo`), questa risposta è di una richiesta abbandonata: si lascia
               cadere, o riporterebbe in colonna i documenti di una mappa che non
               appartiene più al contesto scelto. */
            var atteso = m;
            var ok = T.apriMappa(m, function () {
                if (_inCorso !== atteso) return;
                _inCorso = null; _inCorsoV2 = null; _caricaMappe(); _disco = null; _caricaDisco(); rifai();
            });
            if (!ok) { _inCorso = null; _inCorsoV2 = null; rifai(); toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); }
        }

        /* l'elenco si rilegge dopo un cambio di contesto: classe o materia nuove
           = mappe diverse, e il filtro vive in landing-teach (fonte unica) */
        function _caricaMappe() {
            var T = window.MappAITeach;
            if (!T || !T.mappeDelContesto) { _mappe = []; return; }
            T.mappeDelContesto().then(function (list) {
                _mappe = list || [];
                _contestoCambiato = false;     /* ora si sa: decide `mappaCorrente` */
                rifai();
            }).catch(function () { _mappe = []; _contestoCambiato = false; });
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
            if (_doc && _doc.setId) o.modifica = function () { _apriEditorSet(_doc.setId); };
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
            /* ⚠️ S3 DELLE DOMANDE APERTE, PRIMA del ramo `disk:` — e l'ordine è
               la regola. Il documento viene da un FILE (quindi `_voce` dice
               `disk:`), ma in modifica l'editor lavora sulla sorgente
               d'archivio: lasciando decidere al ramo qui sotto si rimonterebbe
               l'anteprima del PDF sopra l'editor appena aperto, e «Modifica»
               sembrerebbe non fare niente. */
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
            /* v2, S2 di un set d'archivio: anteprima dal builder (D3) */
            if (_doc && !_doc.editing && _voce.indexOf('set:') === 0) {
                try { if (DEd().reset) DEd().reset(); } catch (e) { }
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                _montaAnteprimaSet(box, _voce.slice(4), {
                    modifica: function () { _apriEditorSet(_voce.slice(4)); },
                    esci: function () { _conSalvataggio(_chiudiDocumento); }
                });
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
                var p = _voce.split(':');                 /* ['src','text'|'pdf', idx?] */
                /* ⚠️ la vista si passa a `mountSource`, NON con `setSrcView`: quei
                   setter chiamano `render()`, e con l'host del giro precedente già
                   staccato dal documento la chiamata riaprirebbe il workspace a
                   tutto schermo sopra la console. */
                try { E.mountSource(hs, { view: p[1] === 'pdf' ? 'pdf' : 'text', pdfIdx: p[2] ? +p[2] : 0 }); }
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
            try { return !!(DEd().haDocumento && DEd().haDocumento() && DEd().hasUnsaved && DEd().hasUnsaved()); }
            catch (e) { return false; }
        }
        /* ⚠️ `poi` non è mai sincrono quando c'è da chiedere: chi chiama deve
           aver già risposto al motore (vedi `__esc`), o la console si chiude
           sotto la domanda. */
        function _conSalvataggio(poi) {
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
            _voce = '';
            _doc = null;                       /* v2: si torna a S1 (per la v1 era già null) */
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
            /* l'apertura può RINUNCIARE: allora si resta in anteprima */
            try {
                if (DEd().haDocumento && !DEd().haDocumento()) {
                    _doc.editing = false;
                    _voce = _doc.relPath ? 'disk:' + _doc.relPath : 'set:' + setId;
                }
            } catch (e) { }
            rifai();
        }
        /* Domande aperte: l'editor si apre sulla voce d'ARCHIVIO, non sul file.
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
            if (!ok) { _doc.editing = false; }   /* ha già avvisato: si resta in anteprima */
            rifai();
        }
        function _tornaAnteprima() {
            if (!_doc) return;
            if (_doc.natura === 'crea') { _chiudiDocumento(); return; }
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
        function _apriDocV2(mid) {
            _conSalvataggio(function () {
                if (mid.indexOf('set:') === 0) {
                    var m = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (m && m.relPath) {
                        _doc = { id: mid, natura: 'disk', relPath: m.relPath, setId: mid.slice(4) };
                        _voce = 'disk:' + m.relPath;
                    } else {
                        _doc = { id: mid, natura: 'set', setId: mid.slice(4) };
                        _voce = mid;
                    }
                } else if (mid.indexOf('src:') === 0) {
                    _doc = { id: mid, natura: 'src' }; _voce = mid;
                } else if (mid.indexOf('disk:') === 0) {
                    var mm = _materiali().filter(function (x) { return x.id === mid; })[0];
                    _doc = { id: mid, natura: 'disk', relPath: mid.slice(5), docId: mm && mm.docId };
                    _voce = mid;
                } else if (mid.indexOf('oq:') === 0) {
                    var mo = _materiali().filter(function (x) { return x.id === mid; })[0];
                    if (!mo) return;
                    if (mo.relPath) {
                        /* il foglio è già stato prodotto: si guarda, e «Modifica»
                           apre la sorgente d'archivio */
                        _doc = { id: mid, natura: 'disk', relPath: mo.relPath, docId: mo.docId };
                        _voce = 'disk:' + mo.relPath;
                    } else {
                        /* una copia appena fatta un PDF non ce l'ha ancora:
                           niente da mostrare, si entra in editor */
                        _doc = { id: mid, natura: 'crea', editing: true, docId: mo.docId };
                        _voce = mid;
                        rifai();
                        _apriEditorAperte(mo.docId);
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
                    /* niente ancora sul disco: non c'è un'anteprima da mostrare,
                       e si entra diritti in editor (la strada di «Crea nuovo») */
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
        function _suUscitaDoc() {
            if (!_aperta) return;
            /* L'editor annuncia l'uscita (la sua «Esci»/«Salva ed Esci») → si
               torna all'ANTEPRIMA rinfrescata, non all'elenco. L'evento arriva
               PRIMA del render dell'editor: il repaint sincrono toglie l'host e
               quel render non trova dove disegnare. */
            if (_doc && _doc.editing) _tornaAnteprima();
        }
        document.addEventListener('mappai-doc-uscito', _suUscitaDoc);

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

        var s = _schema();
        /* il PRIMO disegno: `open()` non restituisce il box, lo consegna qui */
        s.suApertura = function (box, ridis) {
            ridisegna = ridis;
            montaBriciole(box);
            /* l'elenco delle mappe arriva dal disco: si chiede all'apertura e la
               briciola si completa quando risponde (`suApertura` esiste per
               questo — `suAzione` nasce da un gesto e qui non c'è nessun gesto) */
            _caricaMappe();
            rifaiEsterno = rifai;      /* il disco risponde dopo: serve ridisegnare */
            _caricaDisco();            /* i documenti già prodotti, dal vault */
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
            if (id.indexOf('m:') === 0) { _apriDocV2(id.slice(2)); return; }
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
            /* uscendo si azzera l'editor: il documento aperto appartiene a
               questa sessione della console, non alla prossima */
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            /* e si SMONTA la fonte: l'host se ne va col velo, ma finché ELABORA
               lo tiene per buono ogni suo `render()` (l'hook sul salvataggio di
               un nodo, per esempio) crederebbe di dover disegnare lì. */
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
            document.removeEventListener('mappai-doc-uscito', _suUscitaDoc);
            try { _staccaCanale(); } catch (e) { }
            _voce = '';
            _prog = null; _doc = null; _inCorsoV2 = null;
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
        aperta: function () { return _aperta; }
    };
    console.log('[MappAIElaboraConsole] console di ELABORA caricata');
})();
