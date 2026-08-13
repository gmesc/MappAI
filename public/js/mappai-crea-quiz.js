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

    /* ── passo 3: i parametri della generazione ─────────────────────────── */
    function _passoParametri(tp) {
        var aree = _aree();
        var opzAree = [{ valore: 'all', etichetta: t('cq_area_tutta', 'Tutta la mappa') }].concat(
            aree.map(function (a) { return { valore: a.id, etichetta: a.et }; }));
        /* Le angolazioni le dichiara il motore dei quiz (`QUIZ_ANGLES`), non
           questo modale: sono le stesse del modale «Genera materiali», e una
           seconda lista qui divergerebbe alla prima angolazione nuova. */
        var opzAngoli = ((window.QUIZ_ANGLES) || [{ key: 'auto' }]).map(function (a) {
            return { valore: a.key, etichetta: window.quizAngleLabel ? window.quizAngleLabel(a.key) : a.key };
        });

        MM().open({
            titolo: t('cq_t3', 'Genera con l\'AI'), icona: 'sparkles', taglia: 'm', invio: false,
            sezioni: [{
                id: 'par', titolo: tp.et(),
                testo: t('cq_nome_aiuto', 'Il nome del file lo compone MappAI — «{es}» — così le tabelle riconoscono il genere del materiale. Qui si scrive solo la parte che distingue questo foglio dagli altri.')
                    .replace('{es}', _esempioNome(tp)),
                campi: [
                    { id: 'nome', etichetta: t('cq_nome', 'Nome (facoltativo)'), aiuto: t('cq_nome_ph', 'verifica di ottobre') },
                    { id: 'quante', tipo: 'numero', etichetta: t('cq_quante', 'Quante domande per area'), valore: 5, min: 1, max: 30, larghezza: 'meta' },
                    { id: 'area', tipo: 'scelta', etichetta: t('cq_area', 'Su quale area'), opzioni: opzAree, valore: 'all' },
                    { id: 'angolo', tipo: 'scelta', etichetta: t('cq_ang', 'Angolazione'), opzioni: opzAngoli, valore: 'auto',
                      aiuto: t('cq_ang_d', 'Che cosa devono chiedere le domande. «Automatico» le distribuisce fra i tipi di ragionamento.') }
                ]
            }],
            azioni: [
                { id: 'annulla', etichetta: t('mm_annulla', 'Annulla') },
                { id: 'vai', etichetta: t('cq_vai', 'Genera'), icona: 'sparkles', ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'vai') return;
            var v = r.valori || {};
            _genera(tp, { nome: v.nome || '', quantita: v.quante || 5, area: v.area || 'all', angolo: v.angolo || 'auto' });
        });
    }

    /* Come si chiamerà il file: si mostra PRIMA di generare, così il docente sa
       che cosa sta scegliendo (e che il resto del nome non è negoziabile). */
    function _esempioNome(tp) {
        var PC = window.MappAIPipelineCore;
        var kind = { mc: 'quiz_mc', tf: 'quiz_tf', flashcards: 'flashcards', open: 'open_questions' }[tp.id];
        if (!PC || !PC.buildFileName) return tp.label + '-' + _mappa() + '.pdf';
        return PC.buildFileName(kind, null, false, { mappa: _mappa(), nome: t('cq_nome_ph', 'verifica di ottobre') });
    }

    /* ── genera davvero (il motore è della pipeline) ────────────────────── */
    function _genera(tp, opts) {
        if (!P() || !P().generaSet) { toast(t('cq_no_motore_gen', 'Il generatore non è disponibile.'), 'warning'); return; }
        P().generaSet({
            tipo: tp.id, nome: opts.nome, quantita: opts.quantita,
            area: opts.area, angolo: opts.angolo
        }).then(function (r) {
            if (!r || !r.ok) { toast((r && r.errore) || t('cq_ko', 'Generazione non riuscita.'), 'error'); return; }
            /* Che cosa è successo, detto per intero: dove si corregge e dove si
               stampa. Sono due posti diversi, ed è la domanda che il docente si
               farebbe subito dopo.
               ⚠️ `pdfErrore` = la SORGENTE c'è (si corregge in ELABORA) ma la
               resa PDF è fallita: va detto col suo motivo, non confuso con
               «manca il vault» — sono due rimedi diversi. */
            if (r.pdfErrore) {
                toast(t('cq_ok_no_pdf', '✓ {titolo} — si corregge in ELABORA. Il PDF non è stato scritto: {err}')
                    .replace('{titolo}', r.titolo).replace('{err}', r.pdfErrore), 'warning');
            } else {
                toast(r.file
                    ? t('cq_ok', '✓ {titolo} — si corregge in ELABORA, si stampa da INSEGNA ({file})')
                        .replace('{titolo}', r.titolo).replace('{file}', r.file)
                    : t('cq_ok_no_vault', '✓ {titolo} — si corregge in ELABORA. Senza un vault sul disco il PDF non è stato scritto.')
                        .replace('{titolo}', r.titolo), 'success');
            }
            if (r.setId && DEd() && DEd().openSet) { _casaDocumenti(); DEd().openSet(r.setId); }
        });
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
            sezioni: [{
                id: 'n', titolo: tp.et(),
                testo: t('cq_nome_aiuto', 'Il nome del file lo compone MappAI — «{es}» — così le tabelle riconoscono il genere del materiale. Qui si scrive solo la parte che distingue questo foglio dagli altri.')
                    .replace('{es}', _esempioNome(tp)),
                campi: [{ id: 'nome', etichetta: t('cq_nome', 'Nome (facoltativo)'), aiuto: t('cq_nome_ph', 'verifica di ottobre') }]
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
