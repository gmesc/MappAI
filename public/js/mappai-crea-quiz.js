/* =========================================================================
   CREA UN QUIZ — il percorso da «Crea un documento» (13/8/26)

   Prima «Quiz o flashcard» era un PONTE: apriva l'hub dei materiali, cioè
   mandava il docente altrove a fare una cosa che aveva chiesto lì. E l'unica
   strada era la generazione AI di TUTTA la mappa.

   Qui il percorso è dichiarato in tre passi, ognuno una domanda sola:
     1. che tipo   → Scelta multipla · Vero/Falso · Domande aperte · Flashcard
     2. chi scrive → io a mano, oppure l'AI
     3. (solo AI)  → nome, quante domande, su quale area, con che angolazione

   ⚠️ Il motore NON è qui: generare e salvare è `MappAIPipeline.generaSet`, lo
   stesso dello step B della pipeline. Questo modulo fa le domande e basta —
   altrimenti sarebbero due strade che divergono, e la prima cosa a divergere
   sarebbe il NOME dei file, cioè ciò da cui INSEGNA riconosce un materiale.

   ⚠️ La taratura per la classe o per l'allievo non si chiede: la mettono i
   generatori leggendo il contesto attivo (`injectClassTuning`). Chiederla qui
   vorrebbe dire poterla contraddire.

   A MANO si crea un set VUOTO e si apre l'editor: il documento nasce lì, con
   le stesse regole di uno generato — così le due strade finiscono nello stesso
   posto e producono lo stesso genere di file.
   ========================================================================= */
(function () {
    'use strict';

    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function MM() { return window.MappAIModal; }
    function DEd() { return window.MappAIDocEditor; }
    function P() { return window.MappAIPipeline; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }
    /* Il generatore risponde con un CODICE (`occupata`, `revisione-pendente`), non
       con una frase, e per quei due la guardia che ha rifiutato ha già parlato:
       `mappaiOccupato` e `requireStandalone` mostrano il loro avviso da sé. Un
       secondo banner rosso col codice grezzo accanto a quello giusto si è visto
       il 21/9 (gate 3 del passo 3): qui si tace, e un codice sconosciuto diventa
       la frase generica. */
    var CODICI_GIA_DETTI = { 'occupata': true, 'revisione-pendente': true, 'revisione-in-corso': true };
    function _diciErrore(codice, tipo) {
        if (codice && CODICI_GIA_DETTI[codice]) return;
        toast(codice || t('cq_ko', 'Generazione non riuscita.'), tipo || 'error');
    }
    function _st() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _pulito(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
    function _mappa() {
        var s = _st() || {};
        return s.rootNodeLabel || 'MappAI';
    }

    /* I quattro generi, con il nome che portano nel file e la forma del set.
       `documento: true` = foglio da stampare, non set giocabile: le domande
       aperte non entrano in `studySets` perché il player pretende delle opzioni
       (è la stessa regola dichiarata nella pipeline, e vale anche qui). */
    var TIPI = [
        { id: 'mc', icona: 'list-checks', et: function () { return t('cq_mc', 'Scelta multipla'); },
          sotto: function () { return t('cq_mc_d', 'Una domanda, tre risposte, una sola giusta.'); },
          mode: 'quiz', label: 'Scelta Multipla' },
        { id: 'tf', icona: 'check-circle', et: function () { return t('cq_tf', 'Vero o Falso'); },
          sotto: function () { return t('cq_tf_d', 'Affermazioni da giudicare. Le più rapide da correggere in classe.'); },
          mode: 'quiz', label: 'Vero o Falso' },
        { id: 'open', icona: 'pen-line', et: function () { return t('cq_open', 'Domande aperte'); },
          sotto: function () { return t('cq_open_d', 'Si risponde scrivendo: il foglio porta le righe e, per te, le tracce di correzione.'); },
          documento: true, label: 'Domande aperte' },
        { id: 'flashcards', icona: 'copy', et: function () { return t('cq_flash', 'Flashcard'); },
          sotto: function () { return t('cq_flash_d', 'Carte domanda/risposta da ritagliare.'); },
          mode: 'flashcard', label: 'Flashcard' }
    ];
    function _tipo(id) { return TIPI.filter(function (x) { return x.id === id; })[0]; }

    /* ── DOVE SI APRE IL DOCUMENTO APPENA CREATO ─────────────────────────────
       L'editor vive DENTRO la console di ELABORA (si disegna in
       `#elab-doc-host`): senza quella console un documento appena creato si
       carica in memoria e non compare da nessuna parte — è il difetto per cui
       «creare un materiale non funzionava». Da dentro la console non cambia
       niente (è già aperta e non si riapre, ha la sua guardia); da fuori — il
       menu della mappa, la landing — la si apre PRIMA, perché è la casa dei
       documenti, non una scorciatoia. */
    function _casaDocumenti() {
        var EC = window.MappAIElaboraConsole;
        if (!EC || !EC.open || !EC.attiva) return false;
        try { if (!EC.attiva()) return false; } catch (e) { return false; }
        try { if (EC.aperta && EC.aperta()) return true; EC.open(); return true; }
        catch (e) { return false; }
    }

    /* Le aree fra cui scegliere: le macro-aree della mappa (L1), più «tutta la
       mappa». Sono le stesse che usa la pipeline (`_branchNodes`), lette qui
       dal db perché il modale deve elencarle prima di generare. */
    function _aree() {
        var s = _st() || {}, db = s.db || {}, nodi = db.nodes || [];
        var mm = s.extractionMode === 'mindmap';
        var l1 = mm ? nodi.filter(function (n) { return (n.level || 0) === 1; })
                    : nodi.filter(function (n) { return (n.level || 0) <= 1; });
        return l1.map(function (n) { return { id: n.id, et: _pulito(n.label) }; });
    }

    /* ── passo 1: che tipo ──────────────────────────────────────────────── */
    function apri() {
        if (!MM()) { toast(t('cq_no_motore', 'Il motore dei modali non è caricato.'), 'warning'); return; }
        MM().open({
            titolo: t('cq_t1', 'Che tipo di quiz'), icona: 'list-checks', taglia: 'm', invio: false,
            sezioni: [{
                voci: TIPI.map(function (tp) {
                    return { id: 'tp:' + tp.id, icona: tp.icona, etichetta: tp.et(), sotto: tp.sotto() };
                })
            }]
        }).then(function (r) {
            if (!r || !r.azione || r.azione.indexOf('tp:') !== 0) return;
            _passoChiScrive(_tipo(r.azione.slice(3)));
        });
    }

    /* ── passo 2: a mano o con l'AI ─────────────────────────────────────── */
    function _passoChiScrive(tp) {
        if (!tp) return;
        MM().open({
            titolo: tp.et(), icona: tp.icona, taglia: 'm', invio: false,
            sezioni: [{
                voci: [
                    { id: 'mano', icona: 'pencil', etichetta: t('cq_mano', 'Le scrivo io'),
                      sotto: t('cq_mano_d', 'Si apre l\'editor con un foglio vuoto: si aggiungono le domande una a una.') },
                    { id: 'ai', icona: 'sparkles', etichetta: t('cq_ai', 'Le genera l\'AI'),
                      sotto: t('cq_ai_d', 'Dalla mappa, con il linguaggio tarato sulla classe o sull\'allievo attivo.') }
                ]
            }]
        }).then(function (r) {
            if (!r || !r.azione) return;
            if (r.azione === 'mano') { _aMano(tp); return; }
            if (r.azione === 'ai') { _passoSorgente(tp); }
        });
    }

    /* ── passo 2-bis: da che cosa (20/8) ─────────────────────────────────────
       Nato da una richiesta di docenti di STORIA di scuola media: da una fonte
       iconografica — una miniatura, un manifesto, una carta — ricavare le
       domande aperte con i vari angoli, e le flashcard.
       ⚠️ Il passo compare SOLO per i due generi chiesti. Su Scelta multipla e
       Vero/Falso la strada dall'immagine funzionerebbe già (la sorgente
       esplicita di `generaSet` è a monte del ciclo), ma non è stata chiesta: un
       ingresso in più senza un bisogno dietro è un bivio che tutti devono
       leggere e nessuno usa.
       ⚠️ E se il lettore è spento o non c'è, il passo NON compare: un bivio con
       una strada sola è una domanda a cui l'utente non può rispondere. */
    var GENERI_IMMAGINE = ['open', 'flashcards'];
    function _visione() { return window.MappAIVisione; }
    function _daImmagine(tp) {
        var V = _visione();
        return !!(V && V.attivo() && GENERI_IMMAGINE.indexOf(tp.id) >= 0);
    }
    function _passoSorgente(tp) {
        if (!_daImmagine(tp)) { _passoParametri(tp, null); return; }
        var V = _visione();
        var gia = V.schedaCorrente();
        var voci = [
            { id: 'mappa', icona: 'map', etichetta: t('cq_src_mappa', 'Dalla mappa'),
              sotto: t('cq_src_mappa_d', 'Il materiale sono le macro-aree e le loro schede.') },
            { id: 'img', icona: 'image', etichetta: t('cq_src_img', 'Da un\'immagine'),
              sotto: t('cq_src_img_d', 'Una fonte iconografica letta sul tuo computer: la leggi, correggi il contesto, e le domande nascono da lì.') }
        ];
        /* La scheda già corretta si riusa: chi ha appena fatto le domande aperte
           e ora vuole le flashcard non deve rileggere la foto né riscrivere il
           contesto. È l'unica voce che dice un NOME, perché è l'unica che
           riguarda una cosa che esiste già. */
        if (gia) {
            voci.splice(1, 0, { id: 'stessa', icona: 'image', etichetta: t('cq_src_stessa', 'Dalla stessa immagine'),
                sotto: gia.titolo });
        }
        MM().open({
            titolo: t('cq_src_t', 'Da che cosa'), icona: tp.icona, taglia: 'm', invio: false,
            sezioni: [{ voci: voci }]
        }).then(function (r) {
            if (!r || !r.azione) return;
            if (r.azione === 'mappa') { _passoParametri(tp, null); return; }
            if (r.azione === 'stessa') { _passoParametri(tp, gia); return; }
            if (r.azione === 'img') {
                V.nuovaScheda().then(function (sch) {
                    if (!sch) return;              /* annullata: si resta dov'era */
                    _passoParametri(tp, sch);
                });
            }
        });
    }

    /* ── passo 3: i parametri della generazione ───────────────────────────
       ⚠️ L'ANGOLAZIONE È UNA SCELTA MULTIPLA (16/8, richiesta di Giacomo). Era
       una tendina: un angolo per volta, e per avere due versioni della stessa
       verifica bisognava rifare tutto il giro. Ora si spuntano gli angoli che
       servono e si generano ALTRETTANTI fogli in un colpo — che è il modo in
       cui un docente prepara le varianti (la riga A chiede le cause, la riga B
       le conseguenze, sullo stesso materiale).
       Costa: un foglio per angolo, e ogni foglio è una chiamata all'AI per
       ramo. Per questo la stima sta nel modale e si aggiorna mentre si sceglie:
       si decide vedendo quanto costa, non dopo. */
    function _passoParametri(tp, sch) {
        var aree = _aree();
        var opzAree = [{ valore: 'all', etichetta: t('cq_area_tutta', 'Tutta la mappa') }].concat(
            aree.map(function (a) { return { valore: a.id, etichetta: a.et }; }));
        /* ── L'ANGOLO NON VALE PER LE FLASHCARD (20/8) ───────────────────────
           `_genFlashcards` non riceve l'angolo e non l'ha mai ricevuto: le otto
           spunte producevano otto MAZZI IDENTICI con otto nomi diversi
           («…-causa», «…-conseguenza»), cioè una varietà che nel contenuto non
           c'è. Il bento di «Genera materiali» le esclude già dal box «Più set
           per angolo»; questa strada era rimasta indietro. Comandi inerti sono
           peggio che assenti (invariante 21). */
        var conAngoli = tp.id !== 'flashcards';
        /* Gli angoli li dichiara il motore dei quiz (`QUIZ_ANGLES`), non questo
           modale: sono gli stessi del modale «Genera materiali», e una seconda
           lista qui divergerebbe al primo angolo nuovo. */
        var ANG = (window.QUIZ_ANGLES) || [{ key: 'auto' }];
        var etAng = function (k) { return window.quizAngleLabel ? window.quizAngleLabel(k) : k; };

        /* Quali angoli sono spuntati adesso. Alla prima apertura: «auto», che è
           il comportamento di sempre. */
        function scelti(v) {
            if (!v) return ['auto'];
            var out = ANG.filter(function (a) { return v['ang_' + a.key]; }).map(function (a) { return a.key; });
            return out;
        }
        /* La stima: fogli × rami. `area` diversa da «tutta» = un ramo solo, e
           una SORGENTE (un'immagine) è un ramo solo per definizione. */
        function stima(v) {
            var n = conAngoli ? scelti(v).length : 1;
            var rami = sch ? 1 : ((v && v.area && v.area !== 'all') ? 1 : Math.max(1, aree.length));
            return { fogli: n, chiamate: n * rami };
        }

        function schema(v) {
            var st = stima(v);
            return {
                titolo: t('cq_t3', 'Genera con l\'AI'), icona: 'sparkles', taglia: 'm', invio: false,
                /* ⚠️ Le sezioni `null` si FILTRANO, come i campi: il motore
                   normalizzerebbe un null in una sezione vuota, che a schermo è
                   un riquadro senza contenuto e senza motivo. */
                sezioni: [
                    /* Da un'IMMAGINE non c'è un'area da scegliere: il materiale
                       è la scheda che si è appena corretta. Al posto del campo
                       si dice QUALE fonte, che è l'informazione che serve a
                       riconoscere quello che si sta per generare. */
                    sch ? {
                        id: 'che', titolo: t('cq_g_fonte', 'Da quale fonte'),
                        dati: [{ etichetta: t('vs_titolo', 'Titolo della fonte'), valore: sch.titolo }],
                        testo: t('cq_fonte_d', 'Le domande nascono dal contesto e dalla descrizione che hai appena confermato.')
                    } : {
                        id: 'che', titolo: t('cq_g_che', 'Che cosa chiedono'),
                        campi: [
                            { id: 'area', tipo: 'scelta', etichetta: t('cq_area', 'Su quale area'),
                              opzioni: opzAree, valore: (v && v.area) || 'all' }
                        ]
                    },
                    conAngoli ? {
                        id: 'ang', titolo: t('cq_g_ang', 'Angolazioni'),
                        testo: t('cq_ang_d2', 'Che cosa devono chiedere le domande. Ogni angolazione spuntata produce un FOGLIO SUO sullo stesso materiale: è il modo di preparare due versioni della stessa verifica. «Automatico» distribuisce i tipi di ragionamento dentro un foglio solo.'),
                        /* Otto spunte in colonna sono una lista che fa scorrere;
                           su due colonne si abbracciano con un colpo d'occhio,
                           e in un modale da 600px l'etichetta più lunga
                           («Applicazione / inferenza») ci sta. */
                        colonne: 2,
                        campi: ANG.map(function (a) {
                            return { id: 'ang_' + a.key, tipo: 'spunta', etichetta: etAng(a.key),
                                valore: v ? !!v['ang_' + a.key] : (a.key === 'auto') };
                        }),
                        /* La stima sotto le spunte, non altrove: è la conseguenza
                           di quello che si sta spuntando. */
                        /* «1 fogli» è il genere di dettaglio che fa sembrare un
                           testo scritto da una macchina: due chiavi, non un
                           conteggio con la «i» appiccicata. */
                        sotto: st.fogli
                            ? (st.fogli === 1
                                ? t('cq_stima_uno', 'Un foglio · circa {c} chiamate all\'AI').replace('{c}', st.chiamate)
                                : t('cq_stima', '{f} fogli · circa {c} chiamate all\'AI')
                                    .replace('{f}', st.fogli).replace('{c}', st.chiamate))
                            : t('cq_stima_zero', 'Nessuna angolazione scelta: spuntane almeno una.')
                    } : null,
                    {
                        id: 'quante', titolo: t('cq_g_quante', 'Quante e come graduate'),
                        /* ⚠️ La lista si FILTRA: un `null` fra i campi non sparisce —
                           `normalizzaCampo` lo trasforma in un campo di testo vuoto
                           senza etichetta, che a schermo è una riga misteriosa. */
                        campi: [
                            { id: 'quante', tipo: 'numero',
                              etichetta: sch ? t('cq_quante_f', 'Quante domande') : t('cq_quante', 'Quante domande per area'),
                              valore: (v && v.quante) || 2, min: 1, max: 30, larghezza: 'meta' },
                            /* ── LE DOMANDE D'AVVIO (13/8) ───────────────────────
                               Solo per le domande aperte: nei quiz a scelta multipla
                               la graduazione non ha lo stesso senso — lì le opzioni
                               orientano già, e una domanda «facile» diventa un
                               indovinello. Qui invece è la differenza fra un foglio
                               che si può cominciare e uno su cui chi sa metà scrive
                               zero righe. */
                            tp.documento ? { id: 'base', tipo: 'numero', etichetta: t('cq_base', 'Domande d\'avvio (%)'),
                              valore: (v && v.base != null && v.base !== '') ? v.base : 40, min: 0, max: 100, larghezza: 'meta',
                              aiuto: t('cq_base_d', 'Quante domande si possono risolvere con UN concetto solo, da chi ha studiato una parte della scheda. Le altre chiedono di collegare due o più concetti. Sul foglio degli allievi la differenza non si vede: compare solo sulle tue tracce di correzione.') } : null
                        ].filter(Boolean)
                    },
                    {
                        id: 'nome', titolo: t('cq_g_nome', 'Come si chiama il file'),
                        campi: [
                            /* La spiegazione del nome sta SUL campo, non in testa al
                               modale: è l'aiuto di quella riga, non l'argomento. */
                            { id: 'nome', etichetta: t('cq_nome', 'Nome (facoltativo)'), valore: (v && v.nome) || '',
                              aiuto: t('cq_nome_aiuto', 'Il nome del file lo compone MappAI — «{es}» — così le tabelle riconoscono il genere del materiale. Qui si scrive solo la parte che distingue questo foglio dagli altri.')
                                  .replace('{es}', _esempioNome(tp)) }
                        ]
                    }
                ].filter(Boolean),
                /* La stima si aggiorna mentre si sceglie: ridisegnare coi valori
                   correnti è la strada che il motore prevede (`__campo`), e
                   rimette il fuoco dov'era.
                   ⚠️ SOLO per ciò che la stima legge davvero — l'area e le
                   angolazioni, che sono una tendina e delle caselle. Sui campi
                   di TESTO no: `__campo` nasce da `change`, che lì scatta al
                   BLUR, e il blur lo produce il clic su «Genera». Il modale si
                   ridisegnava sotto il dito, il bottone spariva fra la pressione
                   e il rilascio — niente clic — e il fuoco tornava al primo
                   campo: bisognava premere due volte (Giacomo, 21/9). La stessa
                   trappola è dichiarata in `mappai-doc-editor.js`, che la schiva
                   passando da `suApertura`. */
                suAzione: function (ev, box, ridisegna) {
                    if (ev.azione !== '__campo') return;
                    var c = String(ev.campo || '');
                    if (c === 'area' || c.indexOf('ang_') === 0) ridisegna(schema(ev.valori));
                },
                azioni: [
                    { id: 'annulla', etichetta: t('mm_annulla', 'Annulla') },
                    { id: 'vai', etichetta: t('cq_vai', 'Genera'), icona: 'sparkles', ruolo: 'primario' }
                ]
            };
        }

        MM().open(schema(null)).then(function (r) {
            if (!r || r.azione !== 'vai') return;
            var v = r.valori || {};
            var angoli = conAngoli ? scelti(v) : ['auto'];
            if (!angoli.length) {
                toast(t('cq_no_ang', 'Spunta almeno un\'angolazione: è quella che dice che cosa chiedere.'), 'warning');
                _passoParametri(tp, sch);   // si riapre com'era: non si perde quello che era già scritto
                return;
            }
            _generaVarianti(tp, {
                nome: v.nome || '', quantita: v.quante || 5, area: sch ? 'all' : (v.area || 'all'),
                base: (v.base != null && v.base !== '') ? v.base : null,
                /* La sorgente esplicita: `generaSet` la preferisce ai rami della
                   mappa. Il materiale lo compone il core della visione — un
                   secondo compositore direbbe un giorno un'altra cosa. */
                sorgente: sch ? {
                    etichetta: sch.titolo,
                    materiale: (window.MappAIVisioneCore ? window.MappAIVisioneCore.materialeDaScheda(sch) : '')
                } : null,
                /* L'intro del foglio: il CONTESTO è la riga breve (identità +
                   finalità), mai l'osservazione — sul foglio degli allievi
                   sarebbe la risposta a metà delle domande. L'osservazione
                   viaggia in `descrizione`, che il builder mette SOLO sulle
                   tracce di correzione. */
                intro: sch ? {
                    fotoB64: sch.fotoB64 || '', mime: sch.mime || 'image/jpeg',
                    titolo: sch.titolo || '',
                    contesto: (window.MappAIVisioneCore && window.MappAIVisioneCore.contestoBreve)
                        ? window.MappAIVisioneCore.contestoBreve(sch) : '',
                    descrizione: (window.MappAIVisioneCore && window.MappAIVisioneCore.testoBlocco)
                        ? window.MappAIVisioneCore.testoBlocco(sch, 'osservazione') : ''
                } : null
            }, angoli);
        });
    }

    /* L'esempio di nome che il modale mostra: si costruisce col MOTORE che
       comporrà il nome vero (`buildFileName`), non a mano — un esempio che
       diverge dal file prodotto è peggio di nessun esempio. */
    function _esempioNome(tp) {
        var PC = window.MappAIPipelineCore;
        var kind = { mc: 'quiz_mc', tf: 'quiz_tf', flashcards: 'flashcards', open: 'open_questions' }[tp.id];
        if (!PC || !PC.buildFileName) return tp.label + '-' + _mappa() + '.pdf';
        return PC.buildFileName(kind, null, false, { mappa: _mappa(), nome: t('cq_nome_ph', 'verifica di ottobre') });
    }

    /* ── PIÙ ANGOLAZIONI = PIÙ FOGLI, uno per volta (16/8) ───────────────────
       Due vincoli decidono la forma di questa funzione, e nessuno dei due è
       negoziabile:
       1. `generaSet` mette il LUCCHETTO (`Pipeline._running`) e lo rilascia nel
          `finally`. Due chiamate insieme: la seconda torna «occupata» e il
          foglio non si fa. Quindi in SEQUENZA, una dopo l'altra.
       2. `generaSet` RIFIUTA un nome già preso (`_nomeGiaPreso`) — ed è giusto,
          perché due file con lo stesso nome si sovrascriverebbero. Quindi ogni
          variante porta il suo angolo nel nome.
       ⚠️ Con UN angolo solo il nome resta quello scritto dal docente: aggiungere
       sempre il suffisso cambierebbe il nome di ogni generazione singola, che
       finora non ce l'ha.
       ⚠️ Un foglio che fallisce NON ferma gli altri: si raccoglie l'esito e si
       dice alla fine quanti ne sono usciti. Perdere quattro fogli riusciti per
       il quinto che non è andato sarebbe il guasto peggiore qui dentro. */
    function _generaVarianti(tp, opts, angoli) {
        if (!P() || !P().generaSet) { toast(t('cq_no_motore_gen', 'Il generatore non è disponibile.'), 'warning'); return; }
        var piu = angoli.length > 1;          // cambia solo il MESSAGGIO finale
        var fatti = [], falliti = [];
        /* ── PIÙ ANGOLAZIONI SU UN PROGETTO REVISIONATO (21/9) ────────────────
           Un foglio per angolo, generato in fila, qui non funziona più: il
           primo passa dalla pipeline e apre il controllo dei materiali, e dal
           secondo in poi quel giro è APERTO — due fogli su tre non nascevano, e
           nemmeno lo si diceva (misurato dal vivo). La pipeline sa fare N set
           in un giro: quando il documento passa di là, si chiede UNA volta
           sola con tutte le angolazioni.
           ⚠️ «Misto» non può essere una delle varianti (per la pipeline è
           l'angolo BASE): se è spuntato insieme ad altri si generano gli altri,
           e glielo si dice — una perdita silenziosa sarebbe peggio del giro
           lungo che questo codice sostituisce. */
        if (piu && P().viaRevisione && P().viaRevisione() && P()._angoliSpecifici) {
            var specifici = P()._angoliSpecifici(angoli);
            if (specifici.length > 1) {
                if (specifici.length < angoli.length) {
                    toast(t('cq_ang_misto_fuori', 'Genero {n} fogli, uno per angolazione. Il «misto» non fa un foglio a sé quando scegli angolazioni precise.')
                        .replace('{n}', specifici.length), 'info');
                }
                var baseM = opts.nome || (opts.sorgente ? opts.sorgente.etichetta : '');
                P().generaSet({
                    tipo: tp.id, nome: baseM, nomeBase: baseM, quantita: opts.quantita,
                    area: opts.area, angolo: 'auto', angoli: specifici, base: opts.base,
                    sorgente: opts.sorgente || null, intro: opts.intro || null
                }).then(function (r) {
                    if (r && r.ok) { fatti.push({ angolo: specifici.join('·'), r: r }); }
                    else { falliti.push({ angolo: specifici.join('·'), errore: (r && r.errore) || t('cq_ko', 'Generazione non riuscita.') }); }
                    _fineVarianti(fatti, falliti, piu);
                }, function (e) {
                    falliti.push({ angolo: specifici.join('·'), errore: (e && e.message) ? e.message : String(e) });
                    _fineVarianti(fatti, falliti, piu);
                });
                return;
            }
        }

        function passo(i) {
            if (i >= angoli.length) return _fineVarianti(fatti, falliti, piu);
            var k = angoli[i];
            /* Senza un nome scritto dal docente, la variante SI CHIAMA come il
               suo angolo. Con un nome, l'angolo lo qualifica: «verifica di
               ottobre - causa». Con un angolo solo il nome resta quello che il
               docente ha scritto — o, se non ne ha scritto nessuno, di nuovo
               l'angolo: due varianti generate in due momenti diversi devono
               poter convivere nella stessa cartella. */
            /* ⚠️ DA UN'IMMAGINE, IL NOME LO DÀ LA FONTE (20/8). Senza, tutti i
               fogli generati da fotografie diverse si chiamerebbero uguale
               («Domande-aperte-<Mappa>-causa») e il secondo si rifiuterebbe di
               nascere per nome già preso. Il titolo della fonte è ciò che li
               distingue, ed è anche ciò che il docente cerca nell'elenco. */
            var base = opts.nome || (opts.sorgente ? opts.sorgente.etichetta : '');
            var nome = (base ? base + ' - ' : '') + _nomeAng(k);
            /* Le flashcard non hanno angolo (vedi `conAngoli`): il suffisso
               «misto» direbbe una distinzione che nel mazzo non esiste. */
            if (angoli.length === 1 && !_angoliContano(tp)) nome = base;
            return P().generaSet({
                tipo: tp.id, nome: nome, quantita: opts.quantita,
                area: opts.area, angolo: k, base: opts.base,
                sorgente: opts.sorgente || null, intro: opts.intro || null
            }).then(function (r) {
                if (r && r.ok) fatti.push({ angolo: k, r: r });
                else falliti.push({ angolo: k, errore: (r && r.errore) || t('cq_ko', 'Generazione non riuscita.') });
                return passo(i + 1);
            }, function (e) {
                falliti.push({ angolo: k, errore: (e && e.message) ? e.message : String(e) });
                return passo(i + 1);
            });
        }
        passo(0);
    }
    function _etAng(k) { return window.quizAngleLabel ? window.quizAngleLabel(k) : k; }
    /* Il nome che finisce nel FILE e nel titolo: la parola dell'angolo, breve e
       minuscola — `Domande aperte - causa`, `- conseguenza`, `- definizione`.
       ⚠️ Non l'etichetta a schermo: quella dice «Automatico (misto)» e
       «Esempio concreto», e in un nome di file diventerebbe
       `Domande-aperte-Il Clima-Automatico (misto).pdf`. La chiave di
       `QUIZ_ANGLES` è già la parola giusta; l'unica deroga è `auto`, che nel
       nome si legge «misto» — ed è la convenzione che Giacomo usava già a mano
       (i file `Domande-aperte-Il Clima-misto.pdf` nel vault lo dimostrano). */
    function _nomeAng(k) {
        var PC = window.MappAIPipelineCore;
        return (PC && PC.nomeAngolo) ? PC.nomeAngolo(k) : (k === 'auto' ? 'misto' : k);
    }
    /* Per quali generi l'angolo arriva davvero al prompt. Le flashcard no: la
       loro generazione non lo riceve (vedi `conAngoli` nel passo 3). */
    function _angoliContano(tp) { return tp && tp.id !== 'flashcards'; }

    /* Che cosa è successo, detto per intero. Con un foglio solo il messaggio
       resta quello di sempre (dove si corregge, dove si stampa); con più fogli
       conta prima QUANTI, perché è la domanda che ci si fa. */
    function _fineVarianti(fatti, falliti, piu) {
        /* ADR 0003: su un progetto revisionato il documento è passato dalla
           pipeline, che ha già mostrato il velo e aperto da sé la revisione dei
           materiali. Niente editor e niente esito qui: sarebbero un secondo
           messaggio sopra una finestra già aperta. */
        if (fatti.length && fatti.every(function (f) { return f.r && f.r.viaPipeline; })) return;
        if (!piu) {
            if (!fatti.length) { _diciErrore(falliti[0] ? falliti[0].errore : '', 'error'); return; }
            _diciEsito(fatti[0].r);
            _apriPrimo(fatti);
            return;
        }
        var tot = fatti.length + falliti.length;
        if (!fatti.length) {
            toast(t('cq_var_ko', 'Nessun foglio generato ({n} tentativi). {err}')
                .replace('{n}', tot).replace('{err}', falliti[0] ? falliti[0].errore : ''), 'error');
            return;
        }
        var msg = t('cq_var_ok', '✓ {n} fogli su {tot} — si correggono in ELABORA, si stampano da INSEGNA: {lista}')
            .replace('{n}', fatti.length).replace('{tot}', tot)
            .replace('{lista}', fatti.map(function (f) { return _etAng(f.angolo); }).join(' · '));
        if (falliti.length) {
            msg += ' — ' + t('cq_var_parz', 'non riuscite: {lista} ({err})')
                .replace('{lista}', falliti.map(function (f) { return _etAng(f.angolo); }).join(' · '))
                .replace('{err}', falliti[0].errore);
        }
        toast(msg, falliti.length ? 'warning' : 'success');
        _apriPrimo(fatti);
    }
    /* Si apre il PRIMO, non l'ultimo: chi ha chiesto tre varianti comincia a
       correggere dalla prima, e le altre sono già negli elenchi. */
    function _apriPrimo(fatti) {
        var r = fatti[0] && fatti[0].r;
        if (r && r.setId && DEd() && DEd().openSet) { _casaDocumenti(); DEd().openSet(r.setId); }
    }
    /* Il messaggio del foglio singolo, estratto per non averne due copie.
       ⚠️ `pdfErrore` = la SORGENTE c'è (si corregge in ELABORA) ma la resa PDF
       è fallita: va detto col suo motivo, non confuso con «manca il vault» —
       sono due rimedi diversi. */
    function _diciEsito(r) {
        if (r.pdfErrore) {
            toast(t('cq_ok_no_pdf', '✓ {titolo} — si corregge in ELABORA. Il PDF non è stato scritto: {err}')
                .replace('{titolo}', r.titolo).replace('{err}', r.pdfErrore), 'warning');
            return;
        }
        toast(r.file
            ? t('cq_ok', '✓ {titolo} — si corregge in ELABORA, si stampa da INSEGNA ({file})')
                .replace('{titolo}', r.titolo).replace('{file}', r.file)
            : t('cq_ok_no_vault', '✓ {titolo} — si corregge in ELABORA. Senza un vault sul disco il PDF non è stato scritto.')
                .replace('{titolo}', r.titolo), 'success');
    }

    /* ── a mano: un foglio vuoto e l'editor ────────────────────────────── */
    function _aMano(tp) {
        var s = _st();
        if (!s || !s.db) { toast(t('cq_no_mappa', 'Apri prima una mappa.'), 'warning'); return; }
        /* ⚠️ Non `MM().chiedi`: quella scorciatoia disegna un campo e basta, e
           qui serve DIRE come si comporrà il nome — se no il docente scrive
           «Quiz-MC-La Fotosintesi» a mano e se lo ritrova due volte nel file. */
        MM().open({
            titolo: t('cq_nome_t', 'Come si chiama'), icona: tp.icona, taglia: 'm',
            /* Stessa forma del modale dei parametri (16/8): la spiegazione del
               nome sta SUL campo — è l'aiuto di quella riga, non il tema del
               modale. Il titolo di sezione dice che cosa si sta facendo. */
            sezioni: [{
                id: 'n', titolo: t('cq_g_nome', 'Come si chiama il file'),
                campi: [{ id: 'nome', etichetta: t('cq_nome', 'Nome (facoltativo)'),
                    aiuto: t('cq_nome_aiuto', 'Il nome del file lo compone MappAI — «{es}» — così le tabelle riconoscono il genere del materiale. Qui si scrive solo la parte che distingue questo foglio dagli altri.')
                        .replace('{es}', _esempioNome(tp)) }]
            }],
            azioni: [
                { id: 'no', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'si', etichetta: t('cq_crea', 'Crea'), icona: 'plus', ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'si') return;
            var nome = String((r.valori && r.valori.nome) || '').trim();
            var titolo = _mappa() + ' — ' + tp.label + (nome ? ' · ' + nome : '');

            /* ⚠️ Le domande aperte non hanno un set: la loro sorgente è il FOGLIO
               (l'HTML porta con sé le domande) e l'editor le riapre da lì.
               Quindi il foglio vuoto lo scrive la pipeline — che è dove vivono
               le regole del titolo e del nome — e qui si apre l'editor su
               quello. Fino al 13/8 questa strada era CHIUSA: si rispondeva
               «genera con l'AI e poi correggi», cioè si obbligava a spendere
               una chiamata per poi cancellarne il contenuto. */
            if (tp.documento) {
                if (!P() || !P().nuovoFoglioAperte) { toast(t('cq_no_motore_gen', 'Il generatore non è disponibile.'), 'warning'); return; }
                var f = P().nuovoFoglioAperte({ nome: nome });
                if (!f || !f.ok) { _diciErrore(f && f.errore, 'warning'); return; }
                _casaDocumenti();
                if (DEd() && DEd().openOpenQuestions) DEd().openOpenQuestions(f.docId);
                else toast(t('cq_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning');
                /* Il PDF non si scrive ora: lo fa «Crea PDF» dall'editor —
                   salvare non è pubblicare (modello dei tre gesti). */
                toast(t('cq_ok_mano', '✓ {titolo} — scrivi le domande, poi «Crea PDF» per stamparlo.')
                    .replace('{titolo}', f.titolo), 'success');
                return;
            }
            var id = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            var vuoto = (tp.id === 'flashcards')
                ? [{ front: '', back: '' }]
                : [{ q: '', options: (tp.id === 'tf') ? ['Vero', 'Falso'] : ['', '', ''], correct: '', explanation: '' }];
            s.db.studySets = s.db.studySets || [];
            s.db.studySets.push({
                id: id, title: titolo, mode: tp.mode, type: tp.label,
                items: vuoto, date: new Date().toISOString(), clone: nome
            });
            /* ⚠️ DUE scritture, non una: il progetto in localStorage E il vault
               sul disco. Una mappa aperta dal disco può non avere un progetto —
               lì `saveCurrentProject` non ha dove scrivere e il set nuovo
               sparirebbe al ricaricamento (è il difetto del 13/8: il materiale
               spariva da ELABORA e restava solo il file in INSEGNA). E si
               ANNUNCIA, o gli elenchi già aperti mostrano quello di prima. */
            try { if (typeof StorageManager !== 'undefined') StorageManager.saveCurrentProject(); } catch (e) { }
            var vp = s.activeVaultPath;
            if (vp && window.electronAPI && window.electronAPI.saveVault && window.buildVaultMapData) {
                try {
                    window.electronAPI.saveVault({ folderPath: vp, mapData: window.buildVaultMapData() })
                        .then(function () {
                            try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vp }); } catch (e) { }
                        }).catch(function () { });
                } catch (e) { }
            }
            if (window.renderStudySets) { try { window.renderStudySets(); } catch (e) { } }
            if (DEd() && DEd().openSet) { _casaDocumenti(); DEd().openSet(id); }
            else toast(t('cq_no_editor', 'L\'editor dei documenti non è caricato.'), 'warning');
        });
    }

    window.MappAICreaQuiz = { apri: apri, TIPI: TIPI, _aree: _aree };
    console.log('[MappAICreaQuiz] percorso «crea un quiz» caricato');
})();
