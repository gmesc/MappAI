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
                return f && f.name && !/\.json$/i.test(f.name);
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

    /* ── Lo SCHEMA della console ─────────────────────────────────────────────── */
    var _voce = '';      /* la voce scelta nella colonna */

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
    var LS_GRUPPI = 'mappai_ec_gruppi';
    var _chiusi = (function () {
        try { var o = JSON.parse(localStorage.getItem(LS_GRUPPI) || '{}'); return (o && typeof o === 'object') ? o : {}; }
        catch (e) { return {}; }
    })();
    function _salvaChiusi() { try { localStorage.setItem(LS_GRUPPI, JSON.stringify(_chiusi)); } catch (e) { } }

    /* Un gruppo e le sue voci in un colpo: il CONTATORE sta sulla riga del
       titolo. ⚠️ Niente riga «Nessuno» quando il gruppo è vuoto: con il
       contatore a 0 sarebbe un doppione, e una voce che non si può scegliere in
       un elenco di voci che si scelgono si legge come un errore. */
    function _gruppo(nav, id, etichetta, voci) {
        nav.push({
            gruppo: etichetta, id: 'g:' + id, contatore: voci.length,
            collassabile: true, chiuso: !!_chiusi[id]
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

    function _nav() {
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

    function _schema() {
        var s = {
            titolo: t('ui_landing_elabora', 'Elabora'),
            icona: 'wand-2', taglia: 'xl', layout: 'console', piena: true,
            invio: false, veloChiude: false,
            /* niente chip: il contesto vive nel percorso della topbar, come nelle
               altre sezioni del cablaggio */
            contesto: [],
            nav: _nav(),
            sezioni: [{
                /* «Crea nuovo» sta nella COLONNA, sotto l'elenco: è il gesto che
                   aggiunge una voce a quell'elenco, non un comando del documento
                   aperto (che ha già la sua barra). */
                id: 'nuovo', colonna: 'lato', nuda: true,
                azioni: [{
                    id: 'crea', etichetta: t('ec_crea', 'Crea nuovo'), icona: 'plus',
                    ruolo: 'primario', chiude: false
                }]
            }],
        };
        /* L'AREA È IL DOCUMENTO: una tela sola, a tutta larghezza, dentro cui va
           `#elab-doc-host` — l'host che `mappai-doc-editor.js` cerca per
           disegnare, cioè l'editor vero e non una copia.
           ⚠️ La tela si emette SOLO con un documento aperto: una tela vuota è
           una superficie che non dice che cosa si sta guardando (il validatore
           lo contesta, e ha ragione). Senza documento l'area porta una riga che
           dice che cosa fare. */
        /* La FONTE ora vive nella STESSA tela (8/8 sera): non è più un ponte che
           chiude la console e riapre il workspace. Cambia solo CHI disegna dentro
           la tela — l'editor dei documenti o `MappAIElabora.mountSource` — e i
           comandi della fonte, che nel workspace stavano nella sua barra, qui
           sono una fila di azioni sopra il documento (la barra è della console). */
        var aperto = _voce && _voce.indexOf('vuoto:') !== 0;
        if (aperto) s.tela = { id: 'elab' };
        else s.sezioni.push({
            id: 'vuoto', nuda: true,
            /* senza progetto la colonna è vuota: invitare a «scegliere un
               documento nella colonna» sarebbe un invito a un elenco che non c'è */
            testo: _progettoDelContesto()
                ? t('ec_scegli', 'Scegli un documento nella colonna, o creane uno nuovo.')
                : t('ec_scegli_progetto', 'Scegli un progetto nella barra in alto: qui compariranno i suoi documenti.')
        });
        if (_eFonte() && EL() && EL().sourceActions) {
            s.sezioni.push({
                id: 'src-cmd', nuda: true,
                azioni: EL().sourceActions().map(function (a) {
                    return { id: a.id, etichetta: a.etichetta, icona: a.icona, ruolo: a.ruolo || 'quieto', chiude: false };
                })
            });
        }
        return s;
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
    function _montaFile(box, relPath) {
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

            /* «Modifica» solo sulle SINTESI: sono le uniche di cui l'editor sa
               ricostruire il documento leggendone il file. Il genere lo dice la
               regola di INSEGNA (`generePerFile`), non un secondo classificatore.
               ⚠️ Se `openSynthesisFromVault` non c'è, il bottone nemmeno: un
               comando che non fa niente è peggio di un comando che manca. */
            if (_gruppoDelFile(nomeFile) === 'syn' && DEd() && DEd().openSynthesisFromVault) {
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
                    ? window.MappAIDocBar.stampaIframe(fr) : false;
                if (!ok) toast(t('ec_stampa_ko', 'Non riesco a stampare questo documento da qui: aprilo dalla cartella.'), 'warning');
            });

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
                if (_audioIncorporato(d)) return;
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
        _voce = '';
        _aperta = true;
        var ridisegna = null;
        _mappe = null;
        _inCorso = null;

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
                CB.montaPercorso(box, { livelli: liv.concat(pronto ? _livelloProgetto() : []) });
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
        function _livelloProgetto() {
            var T = window.MappAITeach;
            var s = _appState();
            var corrente = (_mappe && T && T.mappaCorrente) ? T.mappaCorrente(_mappe) : null;
            /* ⚠️ Il nome della mappa CARICATA (`rootNodeLabel`) vale solo finché
               l'elenco del contesto non è arrivato: era il ripiego che rendeva la
               briciola «persistente» — cambiando classe o materia continuava a
               dire «Elettricità» anche quando quella mappa non appartiene più al
               contesto scelto. Con l'elenco in mano il nome si mostra SOLO se la
               mappa aperta è una di quelle del contesto (`mappaCorrente` la cerca
               dentro l'elenco filtrato); altrimenti la briciola torna neutra. */
            var nome = (_inCorso && _inCorso.nome) || (corrente && corrente.nome)
                || ((!_mappe && s && s.rootNodeLabel) || '');
            if (_inCorso) return [{ statico: nome + ' ' + t('ec_bric_carico', '· apro…') }];
            if (!_mappe) return nome ? [{ statico: nome, qui: true }] : [];
            if (!_mappe.length) {
                /* nessuna mappa per questa classe e materia: si dice, invece di
                   aprire una tendina vuota */
                return [{ et: nome || t('ec_bric_nessun', 'Nessun progetto'), qui: true, menu: { tipo: 'lista', voci: [
                    { et: t('ec_bric_vuoto', '— nessun progetto per questa classe e materia —'), on: false, onPick: function () { } }
                ] } }];
            }
            return [{
                et: nome || t('ec_bric_progetto', 'Progetto'),
                /* ⚠️ `qui: true`: è la briciola del posto in cui si è, e resta in
                   corsivo anche da cliccabile — senza, il corsivo del primo
                   disegno (statico, elenco non ancora arrivato) diventava
                   grassetto appena il disco rispondeva. */
                qui: true,
                menu: {
                    tipo: 'lista',
                    voci: _mappe.map(function (m) {
                        return {
                            et: m.nome, on: !!(corrente && corrente.id === m.id),
                            onPick: function () { _cambiaMappa(m); }
                        };
                    })
                }
            }];
        }

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
            rifai();                                   /* segnaposto + «apro…» sulla briciola */
            /* ⚠️ Se nel frattempo il contesto è cambiato (`_inCorso` azzerato da
               `dopo`), questa risposta è di una richiesta abbandonata: si lascia
               cadere, o riporterebbe in colonna i documenti di una mappa che non
               appartiene più al contesto scelto. */
            var atteso = m;
            var ok = T.apriMappa(m, function () {
                if (_inCorso !== atteso) return;
                _inCorso = null; _caricaMappe(); _disco = null; _caricaDisco(); rifai();
            });
            if (!ok) { _inCorso = null; rifai(); toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); }
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

        function _dipingi(box) {
            if (!_voce) return;
            /* un documento del VAULT: sola lettura, host suo */
            if (_voce.indexOf('disk:') === 0) {
                try { if (DEd().reset) DEd().reset(); } catch (e) { }
                try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
                _montaFile(box, _voce.slice(5));
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
            try { _nav().forEach(function (x) { if (x && x.id === cerca && x.etichetta) nome = x.etichetta; }); }
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
            _fermaLettura();
            try { if (DEd().reset) DEd().reset(); } catch (e) { }
            try { if (EL() && EL().unmountSource) EL().unmountSource(); } catch (e) { }
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
            if (!_voce || _eFonte()) return;      /* la fonte non ha un «indietro» */
            _voce = '';
            rifai();
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
                /* ⚠️ Senza documento aperto ESC NON fa niente, e si resta qui
                   (decisione di Giacomo, 10/8). Prima chiudeva la console: in
                   ELABORA questo spazzava via l'intera schermata della sezione
                   e sotto restava una landing vuota, da cui per rientrare
                   bisognava riscegliere dal percorso la sezione in cui si era
                   già — un vicolo cieco apparente. Questa console NON è una
                   finestra sopra ELABORA: è ELABORA. Dalla sezione si esce dal
                   percorso in alto, che è un gesto deliberato; ESC chiude uno
                   strato, e qui l'unico strato è il documento. */
                if (!_voce) return false;
                _conSalvataggio(_chiudiDocumento);
                return false;
            }

            if (id === 'crea') return _popupCrea(rifai);

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
            _aperta = false;
        });
        /* il primo disegno: la console si apre sul segnaposto (nessun documento
           scelto), quindi non c'è ancora niente da montare */
    }

    window.MappAIElaboraConsole = {
        open: open,
        /* hook per il validatore/banco: lo schema si controlla senza aprire */
        schema: _schema,
        tipi: TIPI,
        attiva: _bentoApp,
        aperta: function () { return _aperta; }
    };
    console.log('[MappAIElaboraConsole] console di ELABORA caricata');
})();
