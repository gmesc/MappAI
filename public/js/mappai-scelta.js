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
    function apriLive() {
        var MM = window.MappAIModal;
        var p = pool();
        if (!p.pool.length) {
            var strada = t('ds_niente_d', 'Genera i materiali da CREA (spunta «Domande aperte» o «Scelta multipla» in «Output automatici») oppure da ELABORA › «Crea un documento».');
            if (MM && MM.avviso) MM.avviso({ titolo: t('ds_niente', 'Non ci sono ancora domande per questa mappa'), icona: 'list-checks', testo: strada });
            else toast(t('ds_niente', 'Non ci sono ancora domande per questa mappa') + ' — ' + strada, 'warning');
            return;
        }
        var cls = (window.MappAIClasses && window.MappAIClasses.getActive) ? window.MappAIClasses.getActive() : null;
        if (!cls) { toast(t('ds_no_class', 'Scegli prima una classe: gli allievi entrano con le loro credenziali.'), 'warning'); return; }

        /* ── IL GENERE ────────────────────────────────────────────────────
           Aperte e scelta multipla sono due misure diverse: la seconda si
           corregge da sé, la prima no. Mescolarle per default vorrebbe dire
           farle convivere nello stesso profilo senza che nessuno l'abbia
           deciso. Si sceglie all'avvio, vedendo quante domande porta ognuna
           (inv. 21) — e se un genere solo esiste, non c'è niente da chiedere. */
        var q = SC().conteggioPerTipo(p.pool);
        var D = SC().CFG_DEFAULT;
        var righe = [];
        if (q.open && q.mc) {
            righe.push(
                { id: 'gen_open', tipo: 'radio', gruppo: 'gen', valore: true,
                  etichetta: t('ds_gen_open', 'Domande aperte') + ' (' + q.open + ')',
                  aiuto: t('ds_gen_open_d', 'Si scrive la risposta: la corregge il docente.') },
                { id: 'gen_mc', tipo: 'radio', gruppo: 'gen',
                  etichetta: t('ds_gen_mc', 'Quiz a scelta') + ' (' + q.mc + ')',
                  aiuto: t('ds_gen_mc_d', 'Si sceglie fra le opzioni: la correzione è nel dato.') },
                { id: 'gen_due', tipo: 'radio', gruppo: 'gen',
                  etichetta: t('ds_gen_due', 'Tutt\'e due') + ' (' + (q.open + q.mc) + ')',
                  aiuto: t('ds_gen_due_d', 'Ogni allievo legge domande di entrambi i generi.') }
            );
        }
        righe = righe.concat([
            { id: 'minimoAree', tipo: 'numero', etichetta: t('ds_min_aree', 'Argomenti da scegliere (almeno)'), valore: D.minimoAree, min: 1, max: 20 },
            { id: 'minimo', tipo: 'numero', etichetta: t('ds_min', 'Risposte da scrivere (almeno)'), valore: D.minimo, min: 1, max: 30 },
            { id: 'reveal', tipo: 'spunta', etichetta: t('ds_reveal', 'Alla consegna mostra il profilo dei tagli'), valore: D.reveal },
            { id: 'osservazioni', tipo: 'spunta', etichetta: t('ds_oss', 'Campo «Osservazioni» in fondo'), valore: D.osservazioni },
            { id: 'perche_no', tipo: 'spunta', etichetta: t('ds_pn', 'Chiedi «perché questa no?» su una evitata'), valore: D.perche_no },
            { id: 'autovalutazione', tipo: 'spunta', etichetta: t('ds_auto', 'Autovalutazione per risposta'), valore: D.autovalutazione },
            { id: 'secondo_giro', tipo: 'spunta', etichetta: t('ds_giro', 'Secondo giro su una domanda evitata'), valore: D.secondo_giro },
        ]);
        /* ⚠️ Spenta di default, e non è timidezza: con la correzione immediata
           si smette di ragionare e si prova finché non diventa verde. Vale solo
           per le domande a scelta multipla — su una risposta scritta non c'è
           niente da correggere sul momento, quindi la spunta non compare se il
           genere scelto non le contiene. */
        if (feedbackDisponibile() && q.mc) {
            righe.push({ id: 'feedback', tipo: 'spunta', valore: false,
              etichetta: t('ds_feedback', 'Correggi subito (solo scelta multipla)'),
              aiuto: t('ds_feedback_d', 'Dopo ogni risposta l\'allievo vede se è giusta, con la spiegazione. La domanda si chiude: una risposta già corretta non si ripensa.') });
        }
        /* ⚠️ Col genere nella chiave del campionamento, «Tutt'e due» RADDOPPIA
           il carico (una per argomento × taglio × genere): la riga che serve a
           decidere deve dirlo, o promette la metà del lavoro vero. */
        var quante = t('ds_quante', '{n} domande da {k} fogli. Ogni allievo ne legge una per argomento, per taglio e per genere.')
            .replace('{n}', p.pool.length).replace('{k}', p.fogli);
        if (!q.open || !q.mc) {
            /* un genere solo: si dice QUALE, invece di lasciar credere che ci
               siano anche le altre */
            quante += ' — ' + (q.mc ? t('ds_solo_mc', 'solo domande a scelta multipla')
                                    : t('ds_solo_open', 'solo domande aperte')) + '.';
        }

        /* Il pool che parte davvero, secondo il genere scelto. */
        function perGenere(v) {
            if (!q.open || !q.mc) return p.pool;
            if (v && v.gen_mc) return p.pool.filter(function (x) { return x.tipo === 'mc'; });
            if (v && v.gen_due) return p.pool;
            return p.pool.filter(function (x) { return x.tipo === 'open'; });
        }

        if (!MM || !MM.open) {
            var d = perGenere(null);
            avvia(cls, d, SC().normalizzaCfg({}), SC().conteggioPerTipo(d));
            return;
        }
        MM.open({
            titolo: t('ds_titolo', 'Domande a scelta'),
            icona: 'list-checks',
            taglia: 'm',
            sezioni: [{
                titolo: t('ds_materiale', 'Il materiale'),
                testo: quante + ' · ' + cls.name,   /* il motore escapa da sé */
                campi: righe
            }],
            azioni: [
                { id: 'annulla', etichetta: t('ds_annulla', 'Annulla'), ruolo: 'quieto' },
                { id: 'avvia', etichetta: t('ds_avvia', 'Avvia con QR'), ruolo: 'primario' }
            ]
        }).then(function (r) {
            if (!r || r.azione !== 'avvia') return;
            var scelto = perGenere(r.valori || {});
            if (!scelto.length) { toast(t('ds_gen_vuoto', 'Quel genere non ha domande per questa mappa.'), 'warning'); return; }
            avvia(cls, scelto, SC().normalizzaCfg(r.valori || {}), SC().conteggioPerTipo(scelto),
                !!(r.valori && r.valori.feedback));
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
        var nome = (q.open && q.mc) ? t('ds_attivita', 'Domande a scelta')
            : (q.mc ? t('ds_mc_titolo', 'Quiz a scelta') : t('ds_attivita', 'Domande a scelta'));
        /* il pool viaggia intero: il campionamento è del server, e per studente
           (due allievi leggono varianti diverse dello stesso taglio, così la
           classe copre tutto il materiale senza che nessuno legga tutto) */
        window.MappAILive.launchExternal(cls, nome, poolIntero, 0, {
            mode: 'scelta', scelta: cfg, feedbackImmediato: !!feedback, logActivity: 'scelta',
            reports: [{ which: 'scelta', label: t('ds_report', 'Report domande a scelta') }]
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
        open: { tipo: 'open', titolo: 'Domande a scelta', icona: 'list-checks', bus: 'scelta_open' },
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

    function apriInApp(tipo) {
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

        /* il seme è la MAPPA, non il caso: riaprendo l'attività si ritrovano le
           stesse domande, altrimenti la bozza punterebbe a domande sparite */
        var pool = SC().unaPerAngolo(intero, _chiaveBozza(tipo));
        var cfg = SC().normalizzaCfg({});
        var stato = SC().normalizzaStato(pool, _leggiBozza(tipo));
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
                onCambia: function (id, r, st) { stato = st; _scriviBozza(tipo, st); },
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
            try { localStorage.removeItem(_chiaveBozza(tipo)); } catch (e) { }
            /* e non c'è più niente da perdere: ESC non deve più chiedere
               «uscire senza salvare?» */
            if (ridisegna) {
                var box = ridisegna(Object.assign({}, schema, { sporco: false, suApertura: null }));
                var h2 = box && box.querySelector('[data-sez="scelta"] .mm-sez__c');
                if (h2) { h2.style.height = '62vh'; h2.style.padding = '0'; host = h2; }
            }
            window.MappAISceltaView.mostraEsito(host, {
                t: window.t, cfg: cfg, profilo: p,
                evitata: (cfg.perche_no || cfg.secondo_giro) ? SC().evitata(pool, st, _chiaveBozza(tipo)) : null
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
        apriInApp: apriInApp,
        poolPer: poolPer,
        pooliPerLauncher: pooliPerLauncher,
        ATTIVITA: ATTIVITA
    };
    console.log('[MappAI] mappai-scelta.js caricato ✓');
}());
