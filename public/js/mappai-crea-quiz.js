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
            if (r.azione === 'ai') { _passoParametri(tp); }
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
    function _passoParametri(tp) {
        var aree = _aree();
        var opzAree = [{ valore: 'all', etichetta: t('cq_area_tutta', 'Tutta la mappa') }].concat(
            aree.map(function (a) { return { valore: a.id, etichetta: a.et }; }));
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
        /* La stima: fogli × rami. `area` diversa da «tutta» = un ramo solo. */
        function stima(v) {
            var n = scelti(v).length;
            var rami = (v && v.area && v.area !== 'all') ? 1 : Math.max(1, aree.length);
            return { fogli: n, chiamate: n * rami };
        }

        function schema(v) {
            var st = stima(v);
            return {
                titolo: t('cq_t3', 'Genera con l\'AI'), icona: 'sparkles', taglia: 'm', invio: false,
                sezioni: [
                    {
                        id: 'che', titolo: t('cq_g_che', 'Che cosa chiedono'),
                        campi: [
                            { id: 'area', tipo: 'scelta', etichetta: t('cq_area', 'Su quale area'),
                              opzioni: opzAree, valore: (v && v.area) || 'all' }
                        ]
                    },
                    {
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
                    },
                    {
                        id: 'quante', titolo: t('cq_g_quante', 'Quante e come graduate'),
                        /* ⚠️ La lista si FILTRA: un `null` fra i campi non sparisce —
                           `normalizzaCampo` lo trasforma in un campo di testo vuoto
                           senza etichetta, che a schermo è una riga misteriosa. */
                        campi: [
                            { id: 'quante', tipo: 'numero', etichetta: t('cq_quante', 'Quante domande per area'),
                              valore: (v && v.quante) || 5, min: 1, max: 30, larghezza: 'meta' },
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
                ],
                /* La stima si aggiorna mentre si sceglie: ridisegnare col valori
                   correnti è la strada che il motore prevede (`__campo`), e
                   rimette il fuoco dov'era. */
                suAzione: function (ev, box, ridisegna) {
                    if (ev.azione === '__campo') ridisegna(schema(ev.valori));
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
            var angoli = scelti(v);
            if (!angoli.length) {
                toast(t('cq_no_ang', 'Spunta almeno un\'angolazione: è quella che dice che cosa chiedere.'), 'warning');
                _passoParametri(tp);   // si riapre com'era: non si perde quello che era già scritto
                return;
            }
            _generaVarianti(tp, {
                nome: v.nome || '', quantita: v.quante || 5, area: v.area || 'all',
                base: (v.base != null && v.base !== '') ? v.base : null
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

        function passo(i) {
            if (i >= angoli.length) return _fineVarianti(fatti, falliti, piu);
            var k = angoli[i];
            /* Senza un nome scritto dal docente, la variante SI CHIAMA come il
               suo angolo. Con un nome, l'angolo lo qualifica: «verifica di
               ottobre - causa». Con un angolo solo il nome resta quello che il
               docente ha scritto — o, se non ne ha scritto nessuno, di nuovo
               l'angolo: due varianti generate in due momenti diversi devono
               poter convivere nella stessa cartella. */
            var nome = (opts.nome ? opts.nome + ' - ' : '') + _nomeAng(k);
            return P().generaSet({
                tipo: tp.id, nome: nome, quantita: opts.quantita,
                area: opts.area, angolo: k, base: opts.base
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

    /* Che cosa è successo, detto per intero. Con un foglio solo il messaggio
       resta quello di sempre (dove si corregge, dove si stampa); con più fogli
       conta prima QUANTI, perché è la domanda che ci si fa. */
    function _fineVarianti(fatti, falliti, piu) {
        if (!piu) {
            if (!fatti.length) { toast(falliti[0] ? falliti[0].errore : t('cq_ko', 'Generazione non riuscita.'), 'error'); return; }
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
                if (!f || !f.ok) { toast((f && f.errore) || t('cq_ko', 'Generazione non riuscita.'), 'warning'); return; }
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
