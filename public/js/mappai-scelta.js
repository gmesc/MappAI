/*
 * mappai-scelta.js — le attività «a scelta»: dove si LEGGONO i materiali e da
 * dove si avviano (Live col QR; in-app arriva con la fase E)
 * ---------------------------------------------------------------------------
 * Qui non si genera niente. I fogli «Domande aperte» e i set a scelta multipla
 * per angolo li ha già prodotti la pipeline di CREA (box «Più set per angolo»)
 * o ELABORA › «Crea un documento»: questo file li RILEGGE e li impila in un
 * pool solo (`MappAIScelta.poolDaFogli`).
 *
 * ⚠️ Dove stanno davvero, misurato: sul DISCO i fogli delle domande aperte sono
 * PDF — da un PDF non si ricavano più gli item. La sorgente riapribile (l'HTML
 * col `qp-set` incorporato) vive nell'ARCHIVIO (`MappAIStudyDocs`, genere
 * `quizpaper`), ed è da lì che si legge. I set a scelta multipla invece sono
 * `set-*.json` del vault e stanno già in `appState.db.studySets`.
 *
 * Il campionamento (una domanda per area × angolo) NON si fa qui: lo fa chi
 * trasporta — in Live il server, per studente, perché il pool campionato è
 * anche quello che si serve al telefono.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.MappAISceltaAttivita) return;      /* due caricamenti, due card (trappola 22) */

    function t(k, f) { try { return (window.t ? window.t(k, f) : f) || f; } catch (e) { return f; } }
    function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
    function SC() { return window.MappAIScelta; }
    function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

    function attiva() { return localStorage.getItem('mappai_domande_scelta') !== '0'; }
    /* «Correggi subito» ha il SUO interruttore: è la leva che cambia la
       pedagogia dell'attività (con la correzione immediata si smette di
       ragionare e si prova finché non diventa verde), e va potuta spegnere
       senza toccare il resto — inv. 1. Spento = la spunta non compare nemmeno
       nel modale, e le sessioni partono come prima. */
    function feedbackDisponibile() { return localStorage.getItem('mappai_quiz_live_feedback') !== '0'; }

    /* ⚠️ La STESSA catena di `_mapName()` della pipeline (material-pipeline.js),
       che è chi ha scritto `mapName` nell'archivio: `rootNodeLabel` grezzo per
       primo. Con una catena diversa basta un apostrofo o un nodo L0 rinominato
       perché il filtro scarti tutti i fogli — e l'attività sembra rotta. */
    function nomeMappa() {
        var s = S();
        if (!s) return '';
        return s.rootNodeLabel || (window._getTimelineProjectName ? window._getTimelineProjectName() : '') || '';
    }

    /* ── LEGGERE I MATERIALI ─────────────────────────────────────────────────
       Ritorna { fogli, quanti: {archivio, set}, mappa }. `fogli` è già nella
       forma che `poolDaFogli` si aspetta. Dedup per titolo: lo stesso foglio
       può stare in archivio e nel vault, e due copie della stessa domanda
       falserebbero il profilo per angolo. */
    function leggiFogli(mappa) {
        mappa = mappa || nomeMappa();
        var QP = window.MappAIQuizPrint;
        var fogli = [], visti = {}, daArchivio = 0, daSet = 0;

        function aggiungi(titolo, angle, tipo, items) {
            var k = String(titolo || '').toLowerCase().trim();
            if (!k || visti[k] || !items || !items.length) return false;
            visti[k] = 1;
            fogli.push({ titolo: titolo, angle: angle || '', tipo: tipo, items: items });
            return true;
        }

        /* 1) i fogli «Domande aperte»: dall'archivio, che è l'unico posto dove
              la sorgente è ancora leggibile */
        try {
            var docs = (window.MappAIStudyDocs ? window.MappAIStudyDocs.list() : []) || [];
            docs.forEach(function (d) {
                if (d.kind !== 'quizpaper' || !d.hasHtml) return;
                if (mappa && d.mapName && d.mapName !== mappa) return;
                if (!/domande.?aperte/i.test(d.title || '')) return;
                var full = window.MappAIStudyDocs.get(d.id);
                var set = (QP && QP.setFromHtml && full) ? QP.setFromHtml(full.html) : null;
                if (!set) return;
                if (aggiungi(d.title, set.angle || '', 'open', set.items)) daArchivio++;
            });
        } catch (e) { /* archivio illeggibile: restano i set */ }

        /* 2) i set a scelta multipla del vault (già in memoria col progetto) */
        try {
            var s = S();
            var sets = (s && s.db && s.db.studySets) || [];
            sets.forEach(function (set) {
                if (!set || set.mode !== 'quiz') return;
                var items = set.items || [];
                if (!items.length) return;
                /* solo scelta multipla: un Vero/Falso non è un richiamo da
                   riconoscere, è una moneta da lanciare */
                var mc = items.some(function (it) { return (it.options && it.options.length > 2) || it.a3; });
                if (!mc) return;
                if (aggiungi(set.title, set.angle || '', 'mc', items)) daSet++;
            });
        } catch (e) { /* nessun set */ }

        return { fogli: fogli, quanti: { archivio: daArchivio, set: daSet }, mappa: mappa };
    }

    /* Il pool intero (non campionato), pronto per il trasporto. */
    function pool(mappa) {
        var l = leggiFogli(mappa);
        return { pool: SC().poolDaFogli(l.fogli), quanti: l.quanti, fogli: l.fogli.length, mappa: l.mappa };
    }

    /* ── IL MODALE DEL DOCENTE ───────────────────────────────────────────────
       Dice PRIMA quante domande ci sono e da quanti fogli: è lo stesso motivo
       per cui il bento mostra la stima — si decide vedendo. */
    /* ── IL MODALE DEL DOCENTE — le domande aperte SEMPLICI (0116) ─────────
       Giacomo, 20/10/2026: «è solo la modalità di scelta della domande, di
       motivazione delle risposte e altre rifelssioni poste all'allievo vanno
       sospese perché creano troppo attrito». Il docente sceglie UN foglio di
       domande aperte, e ogni allievo risponde a tutte le sue domande: niente
       argomenti da scegliere, niente minimi, niente riflessioni, niente profilo.
       Ogni foglio ha un genere solo, quindi la scelta del genere è uscita
       (21/10): la scelta multipla parte da «Studio attivo live».
       `opz.fogli` (facoltativo): i fogli già letti da chi apre — INSEGNA li
       legge dal disco della mappa scelta. Senza, si leggono qui. */
    function fogliAperti(opz) {
        var fogli = (opz && Array.isArray(opz.fogli)) ? opz.fogli : leggiFogli(opz && opz.mappa).fogli;
        return fogli.filter(function (f) { return f && f.tipo === 'open' && f.items && f.items.length; });
    }

    /* Un foglio, tutte le sue domande, la modalità semplice. Serve anche al menu
       di «Studio attivo live» (lotto 5), che elenca gli stessi fogli. */
    function avviaFoglio(cls, foglio) {
        var pool = SC().poolDaFogli([foglio]);
        if (!pool.length) { toast(t('ds_niente', 'Non ci sono ancora domande per questa mappa'), 'warning'); return; }
        avvia(cls, pool, SC().normalizzaCfg({ semplice: true }), SC().conteggioPerTipo(pool), false);
    }

    function apriLive(opz) {
        var MM = window.MappAIModal;
        var fogli = fogliAperti(opz);
        if (!fogli.length) {
            var strada = t('ds_niente_open_d', 'Genera i materiali da CREA (spunta «Domande aperte» in «Output automatici») oppure da ELABORA › «Crea un documento».');
            if (MM && MM.avviso) MM.avviso({ titolo: t('ds_niente', 'Non ci sono ancora domande per questa mappa'), icona: 'list-checks', testo: strada });
            else toast(t('ds_niente', 'Non ci sono ancora domande per questa mappa') + ' — ' + strada, 'warning');
            return;
        }
        var cls = (window.MappAIClasses && window.MappAIClasses.getActive) ? window.MappAIClasses.getActive() : null;
        /* 0116 (voce 42): è un avviso, non una conferma — col toast usciva verde
           con la spunta, perché `showToast` conosce solo rosso e verde */
        if (!cls) {
            var nc = t('ds_no_class', 'Scegli prima una classe: gli allievi entrano con le loro credenziali.');
            if (MM && MM.avviso) MM.avviso({ titolo: t('lv_classe_t', 'Manca la classe'), icona: 'graduation-cap', testo: nc });
            else toast(nc, 'error');
            return;
        }

        if (!MM || !MM.open) { avviaFoglio(cls, fogli[fogli.length - 1]); return; }

        var quante = function (f) { return f.items.length + ' ' + t('lv_questions', 'domande'); };
        var campi = [];
        var testo;
        if (fogli.length > 1) {
            campi.push({ id: 'foglio', tipo: 'scelta', etichetta: t('ds_foglio', 'Foglio di domande'), valore: '0',
                opzioni: fogli.map(function (f, k) { return { valore: String(k), etichetta: f.titolo + ' (' + quante(f) + ')' }; }) });
            testo = t('ds_semplice_d', 'Ogni allievo risponde a tutte le domande del foglio.') + ' · ' + cls.name;
        } else {
            testo = fogli[0].titolo + ' (' + quante(fogli[0]) + '). ' +
                t('ds_semplice_d', 'Ogni allievo risponde a tutte le domande del foglio.') + ' · ' + cls.name;
        }
        MM.open({
            titolo: t('ds_titolo', 'Domande aperte'),
            icona: 'list-checks',
            taglia: 'm',
            sezioni: [{
                titolo: t('ds_materiale', 'Il materiale'),
                testo: testo,   /* il motore escapa da sé */
                campi: campi
            }],
            azioni: [
                { id: 'annulla', etichetta: t('ds_annulla', 'Annulla'), ruolo: 'quieto' },
                { id: 'avvia', etichetta: t('ds_avvia', 'Avvia con QR'), ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'avvia') return;
            var k = parseInt((r.valori || {}).foglio, 10);
            avviaFoglio(cls, fogli[(k >= 0 && k < fogli.length) ? k : 0]);
        });
    }

    function avvia(cls, poolIntero, cfg, quanti, feedback) {
        if (!window.MappAILive || !window.MappAILive.launchExternal) { toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return; }
        /* ⚠️ Il nome dell'attività si decide QUI, alla nascita della sessione, e
           se lo porta dietro: finisce nel nome della cartella
           (`Attività di studio/<classe>/<… nome …>`) e nel registro. Leggerlo
           dopo, o lasciarlo generico, vorrebbe dire due attività diverse con lo
           stesso nome sul disco (inv. 20-bis). */
        var q = quanti || { open: 1, mc: 0 };
        /* «Domande aperte» dal 0116 (20/10/2026): le sessioni nate prima restano
           col nome che hanno sul disco, «Domande a scelta» */
        var nome = (q.open && q.mc) ? t('ds_attivita', 'Domande aperte')
            : (q.mc ? t('ds_mc_titolo', 'Quiz a scelta') : t('ds_attivita', 'Domande aperte'));
        /* il pool viaggia intero: il campionamento è del server, e per studente
           (due allievi leggono varianti diverse dello stesso taglio, così la
           classe copre tutto il materiale senza che nessuno legga tutto) */
        window.MappAILive.launchExternal(cls, nome, poolIntero, 0, {
            mode: 'scelta', scelta: cfg, feedbackImmediato: !!feedback, logActivity: 'scelta',
            reports: [{ which: 'scelta', label: t('ds_report', 'Report domande aperte') }]
        });
    }


    /* ══ IL GUSCIO IN-APP ═════════════════════════════════════════════════════
       La stessa attività, senza QR e senza classe: la si apre sulla mappa aperta
       e si lavora da soli. La superficie è la STESSA (`MappAISceltaView`) — qui
       cambia solo il trasporto: la bozza va in `localStorage` invece che al
       server, e il profilo lo calcola il core in locale invece del server.
       ⚠️ Il campionamento va fatto anche qui (`unaPerAngolo`): senza, si
       aprirebbero centosettantacinque domande, che è esattamente ciò che
       l'attività ha deciso di non fare. */
    /* un'impronta corta e stabile del titolo di un foglio, per la sua bozza (0116) */
    function _impronta(x) {
        var h = 5381, str = String(x || '');
        for (var n = 0; n < str.length; n++) h = ((h * 33) ^ str.charCodeAt(n)) >>> 0;
        return h.toString(36);
    }
    function _chiaveBozza(tipo) {
        var s = S();
        /* ⚠️ `StorageManager` è una `const` lessicale: `window.StorageManager` è
           la classe DOM nativa (sempre vera, `currentProjectId` undefined). */
        var pid = null;
        try { pid = (typeof StorageManager !== 'undefined') ? StorageManager.currentProjectId : null; } catch (e) { pid = null; }
        var id = pid || (s && s.activeVaultPath) || nomeMappa();
        return 'mappai_scelta_bozza_' + tipo + '_' + String(id).slice(-60);
    }
    function _leggiBozza(tipo) {
        try { return JSON.parse(localStorage.getItem(_chiaveBozza(tipo)) || '{}') || {}; } catch (e) { return {}; }
    }
    function _scriviBozza(tipo, stato) {
        try { localStorage.setItem(_chiaveBozza(tipo), JSON.stringify(stato)); } catch (e) { /* quota: la sessione continua */ }
    }

    /* Il nodo da cui viene una domanda: la padronanza si registra per NODO, e
       l'unica cosa che l'item dichiara è il ramo. Se il ramo non si ritrova
       nella mappa si usa una chiave derivata dal nome — meglio una riga di
       padronanza su un'etichetta che nessuna riga. */
    function _nodoDelRamo(ramo) {
        var s = S();
        var nodi = (s && s.db && s.db.nodes) || [];
        var pulisci = window.cleanLabel || function (x) { return x; };
        var n = nodi.find(function (x) { return x.level === 1 && String(pulisci(x.label)).trim() === String(ramo).trim(); });
        /* ⚠️ Niente id inventati: le viste della padronanza partono dai NODI
           della mappa (`MM.node(id)`), quindi una riga «ramo:Oceani» non la
           leggerebbe nessuno — sarebbe peso morto in `localStorage`. */
        return n ? n.id : null;
    }

    /* Quale materiale consuma ognuna delle due attività. Non generano niente:
       leggono ciò che c'è (inv. 7). */
    var ATTIVITA = {
        open: { tipo: 'open', titolo: 'Domande aperte', icona: 'list-checks', bus: 'scelta_open' },
        mc: { tipo: 'mc', titolo: 'Quiz a scelta', icona: 'circle-check-big', bus: 'scelta_mc' }
    };

    /* Una lettura sola dell'archivio per apertura del launcher: `leggiFogli`
       apre e analizza gli HTML dei fogli, e chiamarla una volta per genere la
       farebbe due volte per niente. */
    function poolPer(tipo, l) {
        l = l || leggiFogli();
        return SC().poolDaFogli(l.fogli.filter(function (f) { return f.tipo === tipo; }));
    }
    function pooliPerLauncher() {
        var l = leggiFogli();
        return { open: poolPer('open', l), mc: poolPer('mc', l) };
    }

    function apriInApp(tipo, foglioK) {
        var A = ATTIVITA[tipo]; if (!A) return;
        var MM = window.MappAIModal;
        var intero = poolPer(tipo);
        if (!intero.length) {
            var strada = (tipo === 'open')
                ? t('ds_niente_d', 'Genera i materiali da CREA (spunta «Domande aperte» o «Scelta multipla» in «Output automatici») oppure da ELABORA › «Crea un documento».')
                : t('ds_niente_mc_d', 'Servono set a scelta multipla: generali da CREA (spunta «Scelta multipla» in «Output automatici») o da ELABORA › «Crea un documento».');
            if (MM && MM.avviso) MM.avviso({ titolo: t('ds_niente', 'Non ci sono ancora domande per questa mappa'), icona: A.icona, testo: strada });
            else toast(strada, 'warning');
            return;
        }
        if (!MM || !MM.open || !window.MappAISceltaView) { toast(t('hub_fn_missing', 'Funzione non disponibile'), 'error'); return; }

        /* 0116 (Giacomo, 21/10: «tendina anche in app»): le domande aperte si
           fanno UN foglio alla volta, come nel LIVE. Con più fogli si sceglie
           prima il foglio, poi si apre l'attività su quello. Ogni foglio ha la
           SUA bozza: cambiando foglio le risposte dell'altro restano. */
        var foglio = null;
        if (tipo === 'open') {
            var fogli = fogliAperti();
            if (fogli.length > 1 && foglioK == null) {
                MM.open({
                    titolo: t('ds_open_titolo', A.titolo), icona: A.icona, taglia: 'm',
                    sezioni: [{ campi: [{ id: 'foglio', tipo: 'scelta', etichetta: t('ds_foglio', 'Foglio di domande'), valore: '0',
                        opzioni: fogli.map(function (f, n) { return { valore: String(n), etichetta: f.titolo + ' (' + f.items.length + ' ' + t('lv_questions', 'domande') + ')' }; }) }] }],
                    azioni: [
                        { id: 'annulla', etichetta: t('ds_annulla', 'Annulla'), ruolo: 'quieto' },
                        { id: 'apri', etichetta: t('ds_apri_foglio', 'Apri'), ruolo: 'primario' }
                    ]
                }).then(function (r) {
                    if (!r || r.azione !== 'apri') return;
                    var n = parseInt((r.valori || {}).foglio, 10);
                    apriInApp('open', (n >= 0 && n < fogli.length) ? n : 0);
                });
                return;
            }
            foglio = fogli[(foglioK >= 0 && foglioK < fogli.length) ? foglioK : 0] || null;
            if (foglio) intero = SC().poolDaFogli([foglio]);
        }
        var chiave = foglio ? tipo + '_' + _impronta(foglio.titolo) : tipo;

        /* il seme è la MAPPA, non il caso: riaprendo l'attività si ritrovano le
           stesse domande, altrimenti la bozza punterebbe a domande sparite */
        /* 0116: le domande aperte in app sono SEMPLICI come nel LIVE — tutte le
           domande, nessuna scelta né riflessione. La scelta multipla resta com'è
           (è la stessa vista che usa il quiz MC dell'iPad). */
        var aperte = (tipo === 'open');
        var pool = aperte ? intero : SC().unaPerAngolo(intero, _chiaveBozza(chiave));
        var cfg = SC().normalizzaCfg(aperte ? { semplice: true } : {});
        var stato = SC().normalizzaStato(pool, _leggiBozza(chiave));
        var host = null, consegnato = false, ridisegna = null;

        /* ⚠️ La `tela` NON si usa qui: è una proprietà di primo livello dello
           schema e la disegna solo il layout «console», che pretende una
           navigazione. Messa dentro una sezione veniva scartata in silenzio — il
           modale si apriva vuoto, senza un errore. Qui basta una sezione NUDA
           (nessun riquadro) e il suo corpo fa da ospite. */
        var schema = {
            titolo: t('ds_' + tipo + '_titolo', A.titolo),
            icona: A.icona,
            taglia: 'xl',
            sporco: true,          /* ESC e velo chiedono conferma: c'è del lavoro dentro */
            veloChiude: false,
            invio: false,          /* Invio scrive, non chiude */
            sezioni: [{ id: 'scelta', nuda: true }],
            azioni: [],
            suApertura: function (box, rid) {
                ridisegna = rid;
                host = box.querySelector('[data-sez="scelta"] .mm-sez__c');
                if (!host) return;
                /* `.sc-wrap` è alto 100%: senza un'altezza da cui partire
                   collasserebbe a zero */
                host.style.height = '62vh';
                host.style.padding = '0';
                monta();
            }
        };
        MM.open(schema);

        function monta() {
            window.MappAISceltaView.monta(host, {
                pool: pool, cfg: cfg, stato: stato, t: window.t,
                /* ⚠️ Due cose: `MM.conferma` rende il testo in un paragrafo solo (gli
               a capo della view non si vedrebbero, e i motivi si leggerebbero
               attaccati); e il titolo NON lo decide chi apre — la stessa
               funzione la chiama anche il passo delle aree, e intitolarla
               «Consegnare?» dava «Consegnare? — Hai scelto 1 argomenti su 2». */
            chiedi: function (testo) {
                if (!MM.conferma) return Promise.resolve(window.confirm(testo));
                return MM.conferma({ testo: String(testo).replace(/\n+/g, ' · ') });
            },
                onCambia: function (id, r, st) { stato = st; _scriviBozza(chiave, st); },
                onConsegna: function (st) { consegna(st); }
            });
        }

        function consegna(st) {
            if (consegnato) return;
            consegnato = true;
            var p = SC().profilo(pool, st);
            registra(st, p);
            /* consegnato = finito: la bozza si toglie, o riaprendo l'attività si
               ritroverebbe tutto già scritto e si consegnerebbe due volte,
               scrivendo due volte le stesse righe di padronanza */
            try { localStorage.removeItem(_chiaveBozza(chiave)); } catch (e) { }
            /* e non c'è più niente da perdere: ESC non deve più chiedere
               «uscire senza salvare?» */
            if (ridisegna) {
                var box = ridisegna(Object.assign({}, schema, { sporco: false, suApertura: null }));
                var h2 = box && box.querySelector('[data-sez="scelta"] .mm-sez__c');
                if (h2) { h2.style.height = '62vh'; h2.style.padding = '0'; host = h2; }
            }
            window.MappAISceltaView.mostraEsito(host, {
                t: window.t, cfg: cfg, profilo: p,
                evitata: (cfg.perche_no || cfg.secondo_giro) ? SC().evitata(pool, st, _chiaveBozza(chiave)) : null
            });
        }

        /* ── il registro ─────────────────────────────────────────────────────
           Per la scelta multipla la correzione c'è nel dato, quindi la
           padronanza si scrive sempre. Per le domande aperte no: senza
           correzione non c'è misura — la sessione va comunque in
           `sessioni.jsonl`, perché «ha lavorato mezz'ora» è un dato. */
        function registra(st, p) {
            var BUS = window.MappAIStudyBus;
            if (!BUS || !BUS.begin) return;
            try {
                BUS.begin(A.bus, t('ds_' + tipo + '_titolo', A.titolo));
                pool.forEach(function (v) {
                    var r = (st.risposte || {})[v.id];
                    if (!r || !SC().scritta(r)) return;
                    var nodo = _nodoDelRamo(v.ramo || '');
                    var score = null;
                    if (v.tipo === 'mc' && v.giusta >= 0) score = (r.scelta === v.giusta) ? 1 : 0;
                    /* ⚠️ La scala della view è 3 = sicuro · 2 = così così · 1 = a
                       caso: rovesciarla premiava chi tirava a indovinare. */
                    else if (cfg.autovalutazione && r.auto) score = (r.auto === 3) ? 1 : (r.auto === 2 ? 0.5 : 0);
                    /* ⚠️ Senza correzione non c'è misura, ma la sessione va
                       comunque registrata: «ha risposto a sei richiami» è un
                       dato anche se nessuno dice se erano giuste. La padronanza
                       si scrive solo dove il nodo esiste davvero nella mappa:
                       una chiave inventata non la legge nessuna vista. */
                    if (score == null) { BUS._cur && BUS._cur.entries.push({ nodeId: nodo, label: v.ramo || '', score: null }); return; }
                    if (!nodo) return;
                    BUS.record(nodo, v.ramo || nomeMappa(), A.bus, { score: score });
                });
                BUS.end();
            } catch (e) { console.warn('[scelta] registro', e); }
        }
    }

    window.MappAISceltaAttivita = {
        attiva: attiva,
        feedbackDisponibile: feedbackDisponibile,
        leggiFogli: leggiFogli,
        pool: pool,
        apriLive: apriLive,
        fogliAperti: fogliAperti,     /* 0116: li elenca anche il menu di «Studio attivo live» */
        avviaFoglio: avviaFoglio,
        apriInApp: apriInApp,
        poolPer: poolPer,
        pooliPerLauncher: pooliPerLauncher,
        ATTIVITA: ATTIVITA
    };
    console.log('[MappAI] mappai-scelta.js caricato ✓');
}());
