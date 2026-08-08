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
    function _sintesi() {
        var out = [];
        try {
            var BS = window.MappAIBranchSynthesis;
            var cur = BS && BS.getData && BS.getData();
            if (cur) out.push({ id: 'current', titolo: cur.branchLabel || t('de_synth', 'Sintesi'), nota: t('de_current', 'in memoria') });
        } catch (e) { }
        try {
            var mapNow = (_appState() && _appState().rootNodeLabel) || '';
            var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [];
            docs.filter(function (d) { return d.kind === 'synthesis' && d.hasHtml !== false; })
                .forEach(function (d) {
                    var altra = !!(mapNow && d.mapName && d.mapName !== mapNow);
                    out.push({ id: d.id, titolo: d.title, nota: altra ? d.mapName : '', altra: altra });
                });
        } catch (e) { }
        /* le sintesi di ALTRE mappe restano, ma in fondo: toglierle sarebbe un
           elenco vuoto senza spiegazione (stessa scelta dell'editor) */
        out.sort(function (a, b) { return (a.altra ? 1 : 0) - (b.altra ? 1 : 0); });
        return out;
    }
    function _nodi() {
        var s = _appState();
        return ((s && s.db && s.db.nodes) || []).length;
    }
    function _pdf() {
        var s = _appState();
        return ((s && s.sources) || []).filter(function (x) {
            return x && x.file && /\.pdf$/i.test(x.file.name || '');
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
            puo: function () { return !!(DEd() && DEd().openCausal && window.MappAICausalCore); },
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

    function _nav() {
        var nav = [];
        var s = _appState();

        /* LA FONTE, in cima: è da lì che tutto il resto è stato ricavato, e
           rivedere un documento senza poter tornare alla fonte è metà lavoro. */
        var fonte = [{ id: 'src:text', etichetta: t('el_view_text', 'Testo'), icona: 'file-text', attiva: _voce === 'src:text' }];
        var pdf = _pdf();
        pdf.forEach(function (p, i) {
            fonte.push({
                id: 'src:pdf:' + i, icona: 'file-type', attiva: _voce === 'src:pdf:' + i,
                etichetta: (p.file && p.file.name) || (t('el_view_pdf', 'PDF') + ' ' + (i + 1))
            });
        });
        _gruppo(nav, 'fonte', t('ec_g_fonte', 'Fonte'), fonte);

        var sets = _sets();
        _gruppo(nav, 'quiz', t('de_g_quiz', 'Quiz e verifiche'),
            sets.filter(function (x) { return _kindOf(x) === 'quiz'; }).map(function (x) {
                return {
                    id: 'set:' + x.id, icona: 'file-question', attiva: _voce === 'set:' + x.id,
                    etichetta: x.title || t('de_quiz', 'Quiz'), contatore: x.items.length
                };
            }));

        _gruppo(nav, 'flash', t('de_g_flash', 'Flashcard'),
            sets.filter(function (x) { return _kindOf(x) === 'flashcards'; }).map(function (x) {
                return {
                    id: 'set:' + x.id, icona: 'layers', attiva: _voce === 'set:' + x.id,
                    etichetta: x.title || 'Flashcard', contatore: x.items.length
                };
            }));

        var fogli = [];
        if (_nodi()) {
            var salvato = (s && s.db && s.db.nodeSheet) || null;
            fogli.push({
                id: 'ns', icona: 'scissors', attiva: _voce === 'ns',
                etichetta: (s && s.rootNodeLabel) || t('de_ns', 'Foglio dei nodi'),
                sotto: salvato ? t('de_ns_revised', 'rivisto') : ''
            });
        }
        _gruppo(nav, 'ns', t('de_g_ns', 'Foglio dei nodi'), fogli);

        /* SINTESI e CATENE separate (Giacomo, 8/8): sono due documenti diversi —
           una la scrive l'AI su un ramo, l'altra si ricava dai nessi della mappa
           — e tenerle sotto un titolo solo obbligava a leggere le righe per
           capire quale fosse quale. */
        _gruppo(nav, 'syn', t('ec_g_sintesi', 'Sintesi'), _sintesi().map(function (d) {
            return {
                id: 'syn:' + d.id, icona: 'file-text', attiva: _voce === 'syn:' + d.id,
                etichetta: d.titolo, sotto: d.nota || ''
            };
        }));

        var catene = [];
        if (window.MappAICausalCore && DEd() && DEd().openCausal) {
            catene.push({ id: 'cc', icona: 'git-branch', attiva: _voce === 'cc', etichetta: t('de_cc', 'Catena dei perché') });
        }
        _gruppo(nav, 'cc', t('ec_g_catene', 'Catene'), catene);

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
        else s.sezioni.push({ id: 'vuoto', nuda: true, testo: t('ec_scegli', 'Scegli un documento nella colonna, o creane uno nuovo.') });
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
            host = document.createElement('div');
            host.id = 'elab-doc-host';
            host.className = 'ec-host';
            tela.appendChild(host);
        }
        return host;
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
        /* le mappe della classe+materia attive: `null` = non ancora lette dal
           disco (la briciola mostra il solo nome), `[]` = lette e nessuna. */
        var _mappe = null;
        /* la mappa che si sta CARICANDO: il caricamento da vault passa dal disco
           e dura, e senza questo la briciola mostrava ancora il nome vecchio
           mentre la console era già tornata al segnaposto — cioè diceva una cosa
           mentre ne stava facendo un'altra (misurato: ~400ms). */
        var _inCorso = null;

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
            function dopo(f) { try { f(); } catch (e) { } _mappe = null; rifai(); _caricaMappe(); }
            try {
                /* ⚠️ `specContesto` restituisce l'ARRAY dei livelli, mentre
                   `montaPercorso` vuole `{livelli: …}`: passarglielo nudo non
                   dava errore, semplicemente non montava niente e il chip
                   restava — un difetto muto. */
                var liv = CB.specContesto({
                    /* «Cosa» porta fuori da qui: si chiude la console e la
                       landing resta sulla sezione scelta (stessa strada di INSEGNA) */
                    onCosa: function (m) {
                        try { if (window.MappAITeach && MappAITeach.setMode) MappAITeach.setMode(m); } catch (e) { }
                        var x = box.querySelector('[data-azione="__chiudi"]');
                        if (x) x.click();
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
                var mat = '';
                try { mat = (CL.activeDiscipline && CL.activeDiscipline()) || ''; } catch (e) { }
                var pronto = liv.length >= 3 && !!mat;
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
            var nome = (_inCorso && _inCorso.nome) || (corrente && corrente.nome) || (s && s.rootNodeLabel) || '';
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
            var ok = T.apriMappa(m, function () { _inCorso = null; _caricaMappe(); rifai(); });
            if (!ok) { _inCorso = null; rifai(); toast(t('ec_map_ko', 'Non riesco a cambiare progetto da qui.'), 'warning'); }
        }

        /* l'elenco si rilegge dopo un cambio di contesto: classe o materia nuove
           = mappe diverse, e il filtro vive in landing-teach (fonte unica) */
        function _caricaMappe() {
            var T = window.MappAITeach;
            if (!T || !T.mappeDelContesto) { _mappe = []; return; }
            T.mappeDelContesto().then(function (list) {
                _mappe = list || [];
                rifai();
            }).catch(function () { _mappe = []; });
        }

        function _dipingi(box) {
            if (!_voce) return;
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

        var s = _schema();
        /* il PRIMO disegno: `open()` non restituisce il box, lo consegna qui */
        s.suApertura = function (box, ridis) {
            ridisegna = ridis;
            montaBriciole(box);
            /* l'elenco delle mappe arriva dal disco: si chiede all'apertura e la
               briciola si completa quando risponde (`suApertura` esiste per
               questo — `suAzione` nasce da un gesto e qui non c'è nessun gesto) */
            _caricaMappe();
        };
        s.suAzione = function (ev, box, ridis) {
            ridisegna = ridis;
            var id = ev.azione;

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
                if (v.indexOf('src:') === 0) {
                    /* la fonte si apre NELLA tela come ogni altro documento:
                       `src:pdf:<i>` porta l'indice del PDF scelto (senza, si
                       aprirebbe sempre il primo e la voce cliccata non
                       corrisponderebbe a ciò che compare). */
                    _voce = v;
                    rifai();
                    return;
                }
                _voce = v;
                try {
                    if (v.indexOf('set:') === 0) DEd().openSet(v.slice(4));
                    else if (v.indexOf('syn:') === 0) DEd().openSynthesis(v.slice(4));
                    else if (v === 'ns') DEd().openNodeSheet();
                    else if (v === 'cc') DEd().openCausal();
                } catch (e) { toast(t('ec_apri_ko', 'Non riesco ad aprire questo documento.'), 'warning'); }
                rifai();
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
