/*
 * mappai-cabina.js — CONSOLE «CABINA» (2/8/26)
 * ---------------------------------------------------------------------------
 * La console dell'entità «io e l'app». Raccoglie i quattro bottoni solo-icona
 * dell'header (Config AI · Guida · Tutorial · Profilo) — che l'audit del 31/7
 * aveva contato fra i 26 comandi senza nome accessibile — più i profili di
 * classi e allievi, i consumi e le note d'uso.
 *
 * Che cosa è MIGRATO davvero e che cosa è ancora un rimando (dirlo è metà del
 * lavoro: una console che finge di aver assorbito tutto nasconde il debito):
 *   - «Profilo insegnante» → schema VERO, le sezioni sono le stesse che apre
 *     `showTeacherProfileModal` (`MappAITeacherProfile.sezioni`): una fonte sola.
 *   - «Allievi & Classi» → due elenchi veri: un clic sulla riga attiva quel
 *     contesto, il comando in coda apre la scheda per modificarla.
 *   - «Consumi AI» → il cruscotto vero (`MappAIUsageDash.contentHtml`), con
 *     l'elenco delle mappe in testa e due tendine: classe/allievo e materia.
 *   - «Consigli di studio» e «Tutorial» → testo, scritto qui.
 *   - «Termini & Condizioni» e «Privacy» → testo, scritto qui.
 *   - «Impostazioni AI» → per ora APRE la finestra che esiste già.
 *
 * Namespace: window.MappAICabina. Caricare DOPO mappai-teacher-profile.js.
 */
(function () {
    'use strict';
    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function MM() { return window.MappAIModal; }
    function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }

    /* Undici voci in colonna diventano un muro: i gruppi dicono di che cosa
       parla ciascuna (di me · dell'app · dello studio · delle regole). */
    /* ⚠️ Il primo gruppo NON ha intestazione (scelta di Giacomo, 4/8, dal
       disegno): le tre voci in cima parlano di chi sei e di chi hai, e in cima
       a una colonna vuota un'etichetta «Io» dice meno di quanto costa — le
       intestazioni servono a spezzare il muro più in basso, dove il muro c'è. */
    var VOCI = [
        { id: 'profilo', chiave: 'cb_v_profilo', testo: 'Profilo insegnante', icona: 'id-card' },
        /* Due voci, non una: sono due elenchi con colonne diverse e due gesti
           diversi («crea una classe» ≠ «crea una scheda»). Insieme obbligavano
           a scorrere una tabella per arrivare all'altra. */
        { id: 'allievi', chiave: 'cb_v_allievi', testo: 'Allievi', icona: 'user-round' },
        { id: 'classi', chiave: 'cb_v_classi_solo', testo: 'Classi', icona: 'graduation-cap' },
        { gruppo: 'cb_g_app', gruppoTesto: 'L’app' },
        { id: 'aspetto', chiave: 'cb_v_aspetto', testo: 'Aspetto e leggibilità', icona: 'type' },
        { id: 'ai', chiave: 'cb_v_ai', testo: 'Impostazioni AI', icona: 'bot' },
        { id: 'consumi', chiave: 'cb_v_consumi', testo: 'Consumi AI', icona: 'coins' },
        { gruppo: 'cb_g_studio', gruppoTesto: 'Imparare' },
        { id: 'consigli', chiave: 'cb_v_consigli', testo: 'Consigli di studio', icona: 'lightbulb' },
        { id: 'tutorial', chiave: 'cb_v_tutorial', testo: 'Tutorial', icona: 'book-open' },
        /* La guida illustrata per i docenti vive sul web, non nell'app: la voce apre
           il browser (come i collegamenti di insegnai.ch) e non cambia vista. */
        { id: 'guida-online', chiave: 'cb_v_guida', testo: 'Guida per i docenti', icona: 'book-marked' },
        { gruppo: 'cb_g_note', gruppoTesto: 'Note d’uso' },
        { id: 'termini', chiave: 'cb_v_termini', testo: 'Termini & Condizioni', icona: 'scroll-text' },
        { id: 'privacy', chiave: 'cb_v_privacy', testo: 'Privacy', icona: 'shield-check' },
        /* Sviluppo: chi fa l'app e come gli si scrive. Sono le due cose che
           finora vivevano SOLO nel cassetto insegnai — visibile a schermo solo
           sulla landing vuota, quindi irraggiungibile appena si comincia a
           lavorare (e con la veste manifesto anche prima). */
        { gruppo: 'cb_g_dev', gruppoTesto: 'Sviluppo' },
        { id: 'insegnai', chiave: 'cb_v_insegnai', testo: 'insegnai.ch', icona: 'globe' },
        /* ⚠️ La sola voce con una veste sua: è il CLONE del bottone ambra del
           cassetto (`.btn_feedback_action`), stesso comando in due posti. */
        {
            id: 'feedback', chiave: 'cb_v_feedback', testo: 'Segnalazione', icona: 'alert-triangle',
            sottoChiave: 'cb_v_feedback_sub', sottoTesto: 'Invia feedback o bug',
            classe: 'mm-nav__v--segnala'
        }
    ];
    var IDS = VOCI.filter(function (v) { return v.id; }).map(function (v) { return v.id; });
    /* «classe» era il nome della vista prima che diventasse l'elenco dei due
       generi di profilo: chi la chiama così (link vecchi, header non aggiornato)
       non deve trovarsi altrove. */
    var ALIAS = { classe: 'classi', guida: 'tutorial' };
    /* ⚠️ Indirizzo pubblico della guida illustrata (13 capitoli, agosto 2026): da
       confermare con Giacomo — se cambia, cambia QUI e basta. */
    var GUIDA_DOCENTI_URL = 'https://www.insegnai.ch/mappai-guida.html';
    function _apriEsterno(url) {
        if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
        else window.open(url, '_blank', 'noopener');
    }
    /* Le due viste dei profili si aggiornano quando i dati cambiano ALTROVE:
       la scheda si modifica e si elimina dalla finestra di gestione, che di
       questa console non sa niente. Senza, la riga eliminata restava a schermo
       fino a un cmd+R (segnalato da Giacomo). */
    var VISTE_PROFILI = ['classi', 'allievi'];

    var _st = null;
    function _vuoto() {
        return {
            voce: 'profilo', profilo: null, rid: null,
            ud: { stato: 'vuoto', records: [], ctx: null, sel: '', fCtx: '', fMat: '', drill: null },
            err: { stato: 'vuoto', records: [], totale: 0, file: '', disco: false },
            cart: { stato: 'vuoto', organizzata: false, root: '', documenti: '' },
            /* la segnalazione che si sta scrivendo: sopravvive al cambio di
               categoria (che ridisegna) e al giro in un'altra vista */
            fb: { cat: 'ui', testo: '' }
        };
    }

    /* Dove finiscono i file: la risposta la sa il main (le impostazioni vivono
       in `userData`), quindi si chiede via IPC entrando nel profilo. */
    function _caricaCartelle() {
        var C = _st.cart;
        if (C.stato !== 'vuoto') return;
        var api = window.electronAPI;
        if (!api || !api.filesRootGet) { C.stato = 'nonapp'; return; }
        C.stato = 'carico';
        api.filesRootGet().then(function (st) {
            C.organizzata = !!(st && st.organized);
            C.root = (st && (st.rootDir || st.filesRoot)) || '';
            C.documenti = (st && st.documentsDir) || '';
        }).catch(function () { }).then(function () {
            C.stato = 'pronto';
            _ridisegna();
        });
    }

    /* Gli errori arrivano dal disco (IPC): si leggono entrando nella vista, non
       all'apertura della console — chi va in «Consigli di studio» non ha motivo
       di far leggere un file. */
    function _caricaErrori() {
        var E = _st.err;
        if (E.stato !== 'vuoto') return;
        E.stato = 'carico';
        var M = window.MappAIErrori;
        if (!M || !M.ultimi) { E.stato = 'pronto'; return; }
        M.ultimi(8).then(function (r) {
            E.records = (r && r.records) || [];
            E.totale = (r && r.totale) || 0;
            E.file = (r && r.file) || '';
            E.disco = !!(r && r.disco);
        }).catch(function () { }).then(function () {
            E.stato = 'pronto';
            _ridisegna();
        });
    }

    function _classi() {
        try { return (window.MappAIClasses && window.MappAIClasses.list()) || []; } catch (e) { return []; }
    }
    function _allievi() {
        try { return (window.MappAIClasses && window.MappAIClasses.students) ? window.MappAIClasses.students() : []; }
        catch (e) { return []; }
    }
    function _attiva() {
        try { return (window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive()) || null; }
        catch (e) { return null; }
    }
    function _allievo() {
        try {
            var CL = window.MappAIClasses;
            return (CL && CL.activeStudentName) ? CL.activeStudentName() : '';
        } catch (e) { return ''; }
    }
    function _speciale(kind, o) {
        try {
            var CL = window.MappAIClasses;
            if (kind === 'cls' && CL && CL.classSpecial) return !!CL.classSpecial(o);
            if (kind === 'stu' && CL && CL.studentSpecial) return !!CL.studentSpecial(o);
        } catch (e) { }
        return false;
    }

    /* I modali NON ancora migrati stanno sotto il motore (config AI a 9999, il
       cruscotto dei consumi a 1200, gli account classi a 9992) mentre la console
       parte da 12000: aperti DA QUI finirebbero dietro alla finestra che li ha
       chiamati — cioè invisibili. Finché non sono migrati si alzano sopra la pila.
       ⚠️ Dal 17/8 la logica NON vive più qui: è `MappAIModal.alza`, perché il
       problema non era della Cabina — ELABORA ci è inciampata allo stesso modo
       («Crea un documento → Sintesi» apriva l'hub a 9990 dietro la console) e
       una seconda copia sarebbe tornata a indovinare il numero. Il motore tiene
       la pila, quindi il motore sa a che piano mettere chi ci sale sopra. */
    function _alza(sel) {
        var MM2 = window.MappAIModal;
        if (MM2 && MM2.alza) MM2.alza(sel);
    }

    /* Quale finestra storica è aperta SOPRA la console, e come si chiude. Il
       motore tiene la sua pila e non sa niente di queste: senza questo elenco,
       ESC scavalcherebbe quella in cima. */
    function _legacySopra() {
        /* la finestra delle cartelle non ha un id: si riconosce dalla classe.
           Ha un ESC suo, ma senza questa riga lo stesso tasto chiuderebbe
           ANCHE la console sotto — due strati in un colpo. */
        var f = document.querySelector('.mappai-files-overlay');
        if (f) {
            return function () {
                f.remove();
                if (_st) { _st.cart.stato = 'vuoto'; _caricaCartelle(); }
            };
        }
        var m = document.getElementById('class-accounts-modal');
        if (m) {
            return function () {
                if (window.MappAIClasses && window.MappAIClasses.closeModal) window.MappAIClasses.closeModal();
                else m.remove();
            };
        }
        var statici = [
            ['app-guide-modal', 'closeAppGuide'],
            ['app-tutorial-modal', 'closeAppTutorial']
        ];
        for (var i = 0; i < statici.length; i++) {
            var el = document.getElementById(statici[i][0]);
            /* questi vivono nel markup e si nascondono con una classe: la
               presenza nel DOM non basta a dire che sono a schermo */
            if (!el || el.classList.contains('hidden')) continue;
            var fn = statici[i][1];
            return (function (nodo, nome) {
                return function () {
                    if (nome && typeof window[nome] === 'function') window[nome]();
                    else { nodo.classList.add('hidden'); nodo.classList.remove('flex'); }
                };
            })(el, fn);
        }
        return null;
    }

    /* ⚠️ Niente chip in testata alla Cabina (2/8). Il contesto attivo sta nel
       chip dell'header della landing, che è anche il posto da cui si cambia;
       qui era un doppione in sola lettura — e per giunta accanto alle viste
       «Allievi» e «Classi», che il contesto lo mostrano riga per riga col
       bollino e lo cambiano con un clic. */

    /* ═══════════════════════════════════════════════════════════════════════
       CONSUMI — i dati e i filtri
       Il registro NON sa di classi, allievi e materie: sa solo da quale mappa
       viene ogni chiamata. Le tre coordinate arrivano dal contesto delle mappe
       (`MappAITeach.contestoDelleMappe`), che le legge dal disco.
       ═══════════════════════════════════════════════════════════════════════ */
    function _UC() { return window.MappAIUsageCore; }

    /* ⚠️ Una riga di tabella CONCLUDE per default, come una voce di elenco:
       giusto in un picker, sbagliato in una console — sceglierla chiuderebbe la
       finestra in cui si sta lavorando. Qui una riga è sempre una SELEZIONE,
       quindi il default si rovescia una volta sola, in un posto solo. */
    function _riga(id, celle) {
        celle.id = id;
        celle.chiude = false;
        return celle;
    }

    function _caricaConsumi() {
        var U = _st.ud;
        if (U.stato !== 'vuoto') return;
        U.stato = 'carico';
        var UD = window.MappAIUsageDash;
        var pRec = (UD && UD.readAll) ? UD.readAll() : Promise.resolve([]);
        var api = window.electronAPI;
        var pVault = (api && api.getAllVaults)
            ? api.getAllVaults().catch(function () { return []; })
            : Promise.resolve([]);
        Promise.all([pRec, pVault]).then(function (r) {
            U.records = r[0] || [];
            U.ctx = (window.MappAITeach && window.MappAITeach.contestoDelleMappe)
                ? window.MappAITeach.contestoDelleMappe(r[1] || [])
                : { byKey: {}, classi: [], materie: [], allievi: [] };
        }).catch(function () {
            U.ctx = { byKey: {}, classi: [], materie: [], allievi: [] };
        }).then(function () {
            U.stato = 'pronto';
            _ridisegna();
        });
    }

    function _ctxDi(chiave) {
        var idx = (_st.ud.ctx && _st.ud.ctx.byKey) || {};
        return idx[chiave] || { classe: '', materia: '', allievo: '' };
    }
    /* `conSel` false = i record che alimentano l'ELENCO delle mappe: le due
       tendine restringono l'elenco, la riga scelta restringe il cruscotto. */
    function _recordFiltrati(conSel) {
        var U = _st.ud, C = _UC();
        if (!C) return [];
        return (U.records || []).filter(function (r) {
            var k = C.projectKey(r);
            if (conSel && U.sel && k !== U.sel) return false;
            var c = _ctxDi(k);
            if (U.fCtx) {
                if (U.fCtx.indexOf('cls:') === 0 && c.classe !== U.fCtx.slice(4)) return false;
                if (U.fCtx.indexOf('all:') === 0 && c.allievo !== U.fCtx.slice(4)) return false;
            }
            if (U.fMat && c.materia !== U.fMat) return false;
            return true;
        });
    }

    /* Le tendine elencano i PROFILI (è la domanda del docente: «quanto ho speso
       per la 2A?»), più i nomi che il disco conosce ma il profilo no — senza,
       una mappa in una cartella di classe cancellata non sarebbe raggiungibile. */
    function _opzioniContesto() {
        var ctx = _st.ud.ctx || { classi: [], allievi: [] };
        var out = [{ valore: '', etichetta: t('cb_ud_tutti', '— tutte le classi e gli allievi —') }];
        var visti = {};
        _classi().forEach(function (c) { if (c.name && !visti['c' + c.name]) { visti['c' + c.name] = 1; out.push({ valore: 'cls:' + c.name, etichetta: c.name }); } });
        (ctx.classi || []).forEach(function (n) { if (!visti['c' + n]) { visti['c' + n] = 1; out.push({ valore: 'cls:' + n, etichetta: n }); } });
        _allievi().forEach(function (p) {
            var n = p && p.nickname;
            if (n && !visti['a' + n]) { visti['a' + n] = 1; out.push({ valore: 'all:' + n, etichetta: n }); }
        });
        (ctx.allievi || []).forEach(function (n) { if (!visti['a' + n]) { visti['a' + n] = 1; out.push({ valore: 'all:' + n, etichetta: n }); } });
        return out;
    }
    function _opzioniMateria() {
        var ctx = _st.ud.ctx || { materie: [] };
        var out = [{ valore: '', etichetta: t('cb_ud_mat_tutte', '— tutte le materie —') }];
        var visti = {};
        var prof = [];
        try { prof = (window.MappAITeacherProfile && window.MappAITeacherProfile.disciplineList()) || []; } catch (e) { }
        prof.concat(ctx.materie || []).forEach(function (n) {
            if (n && !visti[n]) { visti[n] = 1; out.push({ valore: n, etichetta: n }); }
        });
        return out;
    }

    function _tabellaMappe() {
        var C = _UC();
        var recs = _recordFiltrati(false);
        var progetti = C ? C.listProjects(recs) : [];
        var tasso = (window.MappAIUsageDash && window.MappAIUsageDash.rate) ? window.MappAIUsageDash.rate() : 1;
        var kb = function (m) { try { return (typeof matchModelKB === 'function') ? matchModelKB(m) : null; } catch (e) { return null; } };
        var costo = function (lista) {
            var a = C.aggregate(lista, { kbLookup: kb, usdChf: tasso });
            return { chf: C.fmtChf(a.totals.total), chiamate: C.fmtTok(a.totals.calls) };
        };
        var tot = costo(recs);
        var righe = [_riga('udp:', [
            { testo: t('cb_ud_tutte_mappe', 'Tutte le mappe'), bollino: _st.ud.sel ? '' : 'attivo', titolo: t('cb_ud_sel', 'Selezione corrente') },
            '', '', tot.chiamate, tot.chf
        ])];
        progetti.forEach(function (p) {
            var c = _ctxDi(p.key);
            var q = costo(C.filterByProject(recs, p.key));
            righe.push(_riga('udp:' + p.key, [
                { testo: p.label, bollino: _st.ud.sel === p.key ? 'attivo' : '', titolo: t('cb_ud_sel', 'Selezione corrente') },
                c.allievo || c.classe || '—', c.materia || '—', q.chiamate, q.chf
            ]));
        });
        return {
            id: 'ud-mappe', titolo: t('cb_ud_mappe', 'Mappe'), collassabile: true,
            colonne: [
                { etichetta: t('cb_ud_c_mappa', 'Mappa'), larghezza: '300px' },
                { etichetta: t('cb_ud_c_ctx', 'Classe o allievo'), larghezza: '160px' },
                { etichetta: t('cb_ud_c_mat', 'Materia'), larghezza: '150px' },
                { etichetta: t('ud_calls', 'Chiamate AI'), larghezza: '110px' },
                { etichetta: t('ud_cost_total', 'Totale') }
            ],
            vuota: t('cb_ud_nessuna', 'Nessuna mappa con questi filtri.'),
            righe: righe
        };
    }

    /* Il cruscotto lo disegna la dashboard: è lo stesso che apre il bottone
       della landing. Due copie diverse degli stessi numeri divergono al primo
       ritocco, quindi qui si riempie soltanto la tela. */
    function _riempiTela(box) {
        if (!box) return;
        if (_st.voce === 'ai') {
            var hAi = box.querySelector('[data-tela="ai"]');
            if (hAi) _portaAi(hAi);
            return;
        }
        if (_st.voce !== 'consumi') return;
        var host = box.querySelector('[data-tela="ud"]');
        if (!host) return;
        var UD = window.MappAIUsageDash;
        if (!UD || !UD.contentHtml) {
            host.textContent = t('cb_ud_no_dash', 'Il cruscotto dei consumi non è caricato.');
            return;
        }
        host.innerHTML = UD.contentHtml(_recordFiltrati(true), { drillCat: _st.ud.drill });
        UD.wireContent(host, function (cat) { _st.ud.drill = cat; _ridisegna(); });
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LE VISTE
       ═══════════════════════════════════════════════════════════════════════ */

    /* Le voci arrivano dal dizionario dei metodi di studio: sono le stesse che
       il modale storico mostra, lette dalle stesse chiavi — la fonte è una.
       L'emoji in testa al titolo sparisce: nella console il titolo di sezione
       è testo, e le icone in MappAI le disegna Lucide. */
    var CONSIGLI = ['sr', 'ar', 'feynman', 'interleaving', 'elaboration', 'local_files'];
    function _senzaEmoji(s) {
        return String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    }
    function _vistaConsigli(s) {
        s.area = 'due';
        s.sezioni.push({
            id: 'cs-intro', nuda: true, largo: true,
            testo: t('study_intro', 'MappAI non è solo un generatore di schemi: è un ambiente di apprendimento attivo. La mappa generata dall’AI è il tuo punto di partenza — il vero studio inizia quando la personalizzi.')
        });
        CONSIGLI.forEach(function (k) {
            var tit = t('study_' + k + '_title', '');
            var des = t('study_' + k + '_desc', '');
            if (!tit && !des) return;
            s.sezioni.push({ id: 'cs-' + k, titolo: _senzaEmoji(tit), testo: des });
        });
        s.sezioni.push({
            id: 'cs-fine', nuda: true, largo: true,
            testo: t('study_footer', ''),
            azioni: [{ id: 'apri-consigli', etichetta: t('cb_cs_ascolta', 'Apri con la lettura ad alta voce'), icona: 'volume-2', chiude: false }]
        });
        s.nota = t('cb_cs_nota', 'Sono i metodi che le funzioni di studio dell’app mettono in pratica: flashcard a intervalli, richiamo attivo, quiz, cloze.');
        return s;
    }

    /* Il tutorial non racconta i bottoni: racconta una PROGRESSIONE. La mappa
       che l'AI genera non è il materiale da studiare — è il modello con cui
       l'allievo confronta la propria. Quindi si comincia con schede corte e
       mappe piccole, e si sale solo quando costruire è diventato facile. */
    var PASSI = [
        {
            id: 'p1', chiave: 'cb_tu_p1',
            titolo: 'Passo 1 — una scheda corta, una mappa piccola',
            testo: 'Parti da 200-400 parole su un solo tema e imposta «Genera fino a» su L2: escono 8-12 nodi. È il formato in cui l’allievo riesce a tenere tutta la mappa in testa, e in cui un errore si vede. Una scheda lunga alla prima prova produce una mappa che nessuno finisce di leggere.'
        },
        {
            id: 'p2', chiave: 'cb_tu_p2',
            titolo: 'Passo 2 — la mappa la costruisce l’allievo',
            testo: 'Con la stessa scheda, stampa il Foglio dei nodi con i soli titoli, oppure apri la Lavagna: gli allievi costruiscono, e la mappa dell’AI si mostra alla fine come confronto. È qui che si impara: costruire vale più che studiare una mappa già fatta.'
        },
        {
            id: 'p3', chiave: 'cb_tu_p3',
            titolo: 'Passo 3 — due schede sullo stesso tema',
            testo: 'Aggiungi una seconda fonte e sali a L3. Compaiono i primi legami trasversali, e con essi la domanda che conta: che cosa dice una fonte che l’altra non dice? Le parole-legame sugli archi diventano materia di discussione.'
        },
        {
            id: 'p4', chiave: 'cb_tu_p4',
            titolo: 'Passo 4 — il capitolo intero',
            testo: 'Testo denso, L3-L4, e «Genera materiali» che produce in un colpo quiz, flashcard, foglio dei nodi e sintesi nella cartella della classe. A questo punto la classe sa già costruire: il materiale serve ad allenare, non a spiegare.'
        }
    ];
    /* Sei casi d'uso, uno per prodotto: la situazione del docente, il gesto in
       MappAI, che cosa ricevono gli allievi. Ogni frase è verificata sull'app. */
    var CASI = [
        { id: 'uc1', chiave: 'cb_tu_uc1', titolo: 'Ripasso prima della verifica',
          testo: 'Dalla scheda del capitolo genera la mappa a L3 e premi «Genera materiali»: quiz a scelta multipla e flashcard finiscono nella cartella della classe. In classe, venti minuti di flashcard a coppie, poi il quiz via QR («Domande a scelta») con «Correggi subito»: il registro dei risultati ti dice su quali rami tornare.' },
        { id: 'uc2', chiave: 'cb_tu_uc2', titolo: 'L’allievo con DSA legge con la voce',
          testo: 'Genera la sintesi e registrale la voce naturale dall’editor di ELABORA: in INSEGNA compare «Sintesi con voce», da consegnare via QR o come file. Con il contesto dell’allievo attivo il testo è tarato sul suo registro; da Cabina › Aspetto e leggibilità scegli un carattere ad alta leggibilità per tutta l’app.' },
        { id: 'uc3', chiave: 'cb_tu_uc3', titolo: 'La mappa si costruisce sul banco',
          testo: 'Stampa il Foglio dei nodi con i soli titoli e ritaglia le card: i gruppi costruiscono la mappa sul banco, poi «Proietta» da INSEGNA mostra quella dell’AI per il confronto. Le differenze sono la lezione: perché questo nodo sta qui e non lì?' },
        { id: 'uc4', chiave: 'cb_tu_uc4', titolo: 'Dalla fotografia del libro',
          testo: 'Fotografa la pagina del manuale o la lavagna a fine ora e caricala con «Documenti»: l’AI la legge e ne fa la scheda, che correggi prima di generare. Da lì nascono mappa e materiali come da un PDF.' },
        { id: 'uc5', chiave: 'cb_tu_uc5', titolo: 'Domande aperte, un angolo al giorno',
          testo: 'Con «Più set per angolo» ottieni un foglio di domande aperte per ogni taglio: «Causa» come compito di oggi, «Confronto» domani, «Applicazione» per la verifica. Ogni foglio porta in coda le tracce di correzione per te; la copia per gli allievi esce da «Stampa → Senza tracce».' },
        { id: 'uc6', chiave: 'cb_tu_uc6', titolo: 'Stessa scheda, due classi diverse',
          testo: 'Genera una volta con la classe a registro semplice e una con quella a registro ricco: i fatti restano gli stessi, cambiano frasi ed esempi, e i materiali finiscono ognuno nella cartella della sua classe. «Fai una copia» in ELABORA ti dà varianti della stessa verifica per due gruppi.' }
    ];
    function _vistaTutorial(s) {
        s.area = 'due';
        s.sezioni.push({
            id: 'tu-intro', nuda: true, largo: true,
            testo: t('cb_tu_intro', 'Una progressione in quattro passi per allenare la costruzione di mappe. Si comincia da schede corte e mappe con pochi nodi e si sale verso contenuti più densi: la difficoltà cresce quando costruire è diventato facile, non prima.')
        });
        PASSI.forEach(function (p) {
            s.sezioni.push({ id: 'tu-' + p.id, titolo: t(p.chiave + '_t', p.titolo), testo: t(p.chiave + '_d', p.testo) });
        });
        s.sezioni.push({
            id: 'tu-tara', titolo: t('cb_tu_tara_t', 'Le due leve che cambiano tutto'), largo: true,
            testo: t('cb_tu_tara_d', 'La prima è il contesto attivo: con una classe o un allievo selezionato l’AI adatta registro, lunghezza delle frasi ed esempi, senza toccare i fatti. La seconda è «Genera fino a», che decide quanti livelli finiscono nei DATI — diverso da «Mostra fino a», che nasconde e basta: una mappa generata a L5 resta a L5 dentro quiz e materiali anche se sul canvas ne vedi tre.'),
            azioni: [
                { id: 'apri-guida', etichetta: t('cb_tu_guida', 'Come usare MappAI'), icona: 'help-circle', chiude: false },
                { id: 'vai-consumi', etichetta: t('cb_tu_costi', 'Quanto costa'), icona: 'coins', chiude: false }
            ]
        });
        s.sezioni.push({
            id: 'tu-casi', nuda: true, largo: true,
            testo: t('cb_tu_uc_intro', 'In classe — sei casi d’uso, uno per prodotto. Ognuno parte da una situazione vera e dice il gesto in MappAI e che cosa ricevono gli allievi.')
        });
        CASI.forEach(function (c) {
            s.sezioni.push({ id: 'tu-' + c.id, titolo: t(c.chiave + '_t', c.titolo), testo: t(c.chiave + '_d', c.testo) });
        });
        s.nota = t('cb_tu_nota', 'Ogni passo si prova con la stessa fonte: cambiano la profondità e chi disegna la mappa, non l’argomento.');
        return s;
    }

    /* Note d'uso. Il testo dice quello che il codice fa davvero — che cosa esce
       dal computer e che cosa no — perché è l'unica versione che si può
       verificare. Non sostituisce il testo legale pubblicato dall'autore. */
    function _vistaTermini(s) {
        s.area = 'due';
        s.sezioni.push({
            id: 'tc-cosa', titolo: t('cb_tc_cosa_t', 'Che cos’è MappAI'), largo: true,
            testo: t('cb_tc_cosa_d', 'Uno strumento di lavoro per chi insegna: genera mappe e materiali a partire da fonti che scegli tu, e li scrive sul tuo computer. Non è un registro, non è una piattaforma didattica e non ospita nulla in rete per conto tuo.')
        });
        s.sezioni.push({
            id: 'tc-ai', titolo: t('cb_tc_ai_t', 'I contenuti li scrive un modello'),
            testo: t('cb_tc_ai_d', 'Mappe, quiz, sintesi e risposte del tutor arrivano da un modello linguistico: possono contenere errori, omissioni e semplificazioni sbagliate anche quando la fonte è corretta. Ogni materiale va riletto prima di darlo alla classe. La responsabilità di quello che consegni resta di chi insegna.')
        });
        s.sezioni.push({
            id: 'tc-chiavi', titolo: t('cb_tc_chiavi_t', 'Chiave AI e costi'),
            testo: t('cb_tc_chiavi_d', 'La chiave API è tua e resta sul tuo computer: le chiamate le paghi al provider che hai scelto, secondo le sue tariffe. MappAI misura token e costo stimato in «Consumi AI», ma non fattura, non rivende e non fa da intermediario.')
        });
        s.sezioni.push({
            id: 'tc-classe', titolo: t('cb_tc_classe_t', 'Uso con gli allievi'),
            testo: t('cb_tc_classe_d', 'Lavagna, attività LIVE e Tutor QR aprono un server sul tuo computer a cui i dispositivi si collegano via Wi-Fi. Chi somministra l’attività risponde dei dati che raccoglie e delle regole del proprio istituto: prima di usarle con minori, verifica cosa prevede la tua scuola.')
        });
        s.sezioni.push({
            id: 'tc-fonti', titolo: t('cb_tc_fonti_t', 'Le fonti che carichi'),
            testo: t('cb_tc_fonti_d', 'Carichi tu i PDF, i link e i testi: assicurati di averne il diritto. I materiali generati ne sono una rielaborazione e ne seguono i vincoli — un capitolo sotto copyright non diventa libero perché ci hai fatto una mappa.')
        });
        s.nota = t('cb_note_nota', 'Sintesi informativa, non un contratto. Per le condizioni complete: insegnai.ch — giacomo@insegnai.ch');
        return s;
    }

    function _vistaPrivacy(s) {
        s.area = 'due';
        s.sezioni.push({
            id: 'pv-dove', titolo: t('cb_pv_dove_t', 'Dove vivono i dati'), largo: true,
            testo: t('cb_pv_dove_d', 'Sul tuo computer, in cartelle che puoi aprire dal Finder: mappe e vault, materiali, sessioni delle attività, profili di classi e allievi, registro dei consumi. Non c’è un account MappAI, non c’è un server di MappAI, non c’è sincronizzazione.')
        });
        s.sezioni.push({
            id: 'pv-esce', titolo: t('cb_pv_esce_t', 'Che cosa esce dal computer'),
            testo: t('cb_pv_esce_d', 'Solo quello che mandi a generare: il testo delle fonti che hai caricato e le istruzioni del prompt, verso il provider AI attivo (Google Gemini, oppure Infomaniak che tiene i dati in Svizzera). Nient’altro parte da solo.')
        });
        s.sezioni.push({
            id: 'pv-allievi', titolo: t('cb_pv_allievi_t', 'I profili degli allievi'),
            testo: t('cb_pv_allievi_d', 'Quando la taratura è attiva, nel prompt entrano età, grado, sistema scolastico e le note che hai scritto nella scheda (per una classe: grado, registro e note). Il NOME dell’allievo non entra mai. Le note servono a cambiare come l’AI scrive: scrivici i bisogni linguistici, non le diagnosi.')
        });
        s.sezioni.push({
            id: 'pv-lan', titolo: t('cb_pv_lan_t', 'Le attività in classe'),
            testo: t('cb_pv_lan_d', 'Lavagna, quiz LIVE e Tutor restano sulla rete locale: i telefoni parlano col tuo computer, non con Internet, e le risposte finiscono in una cartella tua. L’eccezione è il Tutor QR, dove i messaggi che gli allievi scrivono vengono inoltrati all’AI per ottenere la risposta.')
        });
        s.sezioni.push({
            id: 'pv-errori', titolo: t('cb_pv_errori_t', 'Il registro degli errori'),
            testo: t('cb_pv_errori_d', 'Quando qualcosa va storto MappAI scrive una riga in «Diagnostica», sul tuo computer: messaggio, file e riga, provider e modello attivi, titolo della mappa aperta. Non contiene il testo delle fonti né i profili di allievi e classi, e non parte da solo — lo si allega alla segnalazione, che spedisci tu dal tuo programma di posta. Si svuota dalla Cabina, in «Segnalazione».')
        });
        s.sezioni.push({
            id: 'pv-cancella', titolo: t('cb_pv_cancella_t', 'Cancellare'),
            testo: t('cb_pv_cancella_d', 'Le cartelle sono file normali: si eliminano dal Finder e spariscono davvero. Le identità degli allievi (emoji + numero) esistono solo dentro la classe, sul tuo disco, e si rigenerano quando vuoi.'),
            azioni: [{ id: 'apri-cartella-consumi', etichetta: t('cb_pv_apri', 'Apri la cartella dei consumi'), icona: 'folder-open', chiude: false }]
        });
        s.nota = t('cb_note_nota', 'Sintesi informativa, non un contratto. Per le condizioni complete: insegnai.ch — giacomo@insegnai.ch');
        return s;
    }

    /* ── GESTIONE CARTELLE (in coda al profilo insegnante) ───────────────────
       Dice DOVE finiscono i file e ci porta. Il nome è quello che si cerca
       («cartelle»), non quello del codice («files root»).
       ⚠️ Le sottocartelle NON sono un elenco scritto qui: arrivano da
       `FilesCore.SUB`, che è ciò che il main crea davvero — una lista a mano
       resterebbe indietro alla prima cartella nuova (com'è successo con
       «Allievi» e «Diagnostica», nate dopo). */
    function _sottocartelle() {
        var FC = window.MappAIFilesCore;
        var base = (FC && FC.SUB) ? Object.keys(FC.SUB).map(function (k) { return FC.SUB[k]; }) : [];
        return base.concat([t('cb_ca_diag', 'Diagnostica')]).join(' · ');
    }
    /* Aspetta che la finestra delle cartelle sparisca, poi rilegge e ridisegna.
       Un osservatore invece di un timer: la finestra può restare aperta un
       minuto (c'è un dialogo di sistema per scegliere la cartella, e una
       migrazione di mezzo), e un'attesa a tempo o scatta troppo presto o fa
       aspettare per niente. */
    function _quandoChiusaCartelle() {
        if (typeof MutationObserver === 'undefined') return;
        var obs = new MutationObserver(function () {
            if (document.querySelector('.mappai-files-overlay')) return;
            obs.disconnect();
            if (!_st) return;
            _st.cart.stato = 'vuoto';
            _caricaCartelle();          // al termine ridisegna da sé
        });
        obs.observe(document.body, { childList: true });
    }

    function _sezCartelle() {
        var C = _st.cart;
        /* ⚠️ La lettura si avvia DA QUI e non solo dagli agganci di apertura e
           cambio vista: dopo «Cambia posizione» lo stato torna «da rileggere»,
           e se la finestra delle cartelle si chiude con la × o col velo nessuno
           la richiamerebbe — il riquadro resterebbe su «Cerco la cartella…»
           per sempre. Idempotente: al secondo giro lo stato non è più vuoto. */
        if (C.stato === 'vuoto') { _caricaCartelle(); C = _st.cart; }
        var sez = { id: 'pr-cartelle', titolo: t('cb_ca_t', 'Gestione cartelle'), largo: true };
        if (C.stato === 'nonapp') {
            sez.testo = t('cb_ca_nonapp', 'I file di MappAI si gestiscono dall’app installata: qui, nel browser, non c’è un disco da mostrare.');
            return sez;
        }
        if (C.stato !== 'pronto') { sez.testo = t('cb_ca_leggo', 'Cerco la cartella…'); return sez; }
        if (!C.organizzata) {
            sez.testo = t('cb_ca_sparsi', 'I documenti che MappAI produce sono sparsi in più cartelle dentro Documenti. Puoi raccoglierli in una sola — «MappAI - file» — nella posizione che scegli tu: quelli che ci sono già vengono spostati, non copiati.');
            sez.azioni = [{ id: 'cart-cambia', etichetta: t('cb_ca_scegli', 'Scegli la posizione'), ruolo: 'primario', icona: 'folder-plus', chiude: false }];
            return sez;
        }
        sez.testo = t('cb_ca_d', 'Tutto quello che MappAI scrive — mappe e vault, materiali, sessioni delle attività, profili, registri — vive in questa cartella sul tuo computer. È una cartella normale: puoi aprirla, copiarla su un disco esterno, metterla in un backup.');
        sez.dati = [
            { etichetta: t('cb_ca_dove', 'Cartella'), valore: C.root },
            { etichetta: t('cb_ca_dentro', 'Dentro'), valore: _sottocartelle() }
        ];
        /* Lo spazio di lavoro interno (localStorage) e le copie in eccesso.
           Il conto si fa QUI, alla costruzione della vista: è una passata su
           chiavi già in memoria, e mostrare un numero vecchio in un riquadro
           che offre di liberarlo sarebbe una bugia. */
        var ant = _anteprimaCassetto();
        if (ant) {
            /* La PERCENTUALE, non solo i MB: «17,4 MB» non dice se è tanto o
               poco, «36% di ~48» sì — ed è lo stesso numero su cui il registro
               alza l'allarme, letto dalla stessa funzione (due conti diversi
               per la stessa cosa sarebbero due verità). */
            var sat = '';
            try {
                var E = window.MappAIErrori;
                if (E && E.cassetto) {
                    var m = E.cassetto();
                    if (m) sat = ' · ' + m.pct + '% ' + t('cb_ca_di_quota', 'dello spazio disponibile') +
                        (m.livello ? ' — ' + t('cb_ca_sat_' + m.livello, m.livello.toUpperCase()) : '');
                }
            } catch (e) { }
            sez.dati.push({
                etichetta: t('cb_ca_spazio', 'Spazio di lavoro'),
                valore: ant.totMB + ' MB' + sat + (ant.via.length
                    ? ' · ' + ant.via.length + ' ' + t('cb_ca_copie', 'copie vecchie dei progetti') + ' (' + ant.MB + ' MB)'
                    : ' · ' + t('cb_ca_pulito', 'nessuna copia in eccesso'))
            });
        }
        sez.azioni = [
            { id: 'cart-apri', etichetta: t('cb_ca_apri', 'Apri la cartella'), ruolo: 'primario', icona: 'folder-open', chiude: false },
            { id: 'cart-cambia', etichetta: t('cb_ca_cambia', 'Cambia posizione'), icona: 'folder-cog', chiude: false }
        ];
        if (ant && ant.via.length) {
            sez.azioni.push({ id: 'cart-pota', etichetta: t('cb_ca_pota', 'Libera spazio'), icona: 'brush-cleaning', chiude: false });
        }
        return sez;
    }

    /* La potatura RACCONTATA prima di farla: per ogni mappa resta la copia più
       recente — quella che l'app apre comunque (il match prende sempre
       l'ultima; le altre nessuna schermata sa aprirle). Il core dice CHI va
       via; qui solo i pesi, perché localStorage sta di qua. */
    function _anteprimaCassetto() {
        var TC = window.MappAITeachCore;
        if (!TC || !TC.anteprimaPotatura) return null;
        try {
            var P = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]');
            var ant = TC.anteprimaPotatura(P, 1, function (id) { return (localStorage.getItem(id) || '').length; });
            var tot = 0;
            for (var i = 0; i < localStorage.length; i++) tot += (localStorage.getItem(localStorage.key(i)) || '').length;
            ant.MB = (ant.byte / 1048576).toFixed(1);
            ant.totMB = (tot / 1048576).toFixed(1);
            ant.progetti = P;
            return ant;
        } catch (e) { return null; }
    }

    /* ── SVILUPPO ────────────────────────────────────────────────────────────
       Le due voci che finora vivevano SOLO nel cassetto insegnai. Il testo di
       presentazione arriva dalle stesse chiavi del cassetto (`about_desc*`):
       una fonte sola, o le due superfici divergono al primo ritocco.
       I collegamenti sono AZIONI, non link: in Electron un `<a target=_blank>`
       passa da `setWindowOpenHandler` e apre una finestra dell'app, mentre
       `openExternal` li consegna al browser di sistema — che è dove ci si
       aspetta di trovare un profilo social. */
    function _senzaTag(s) {
        return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
    var LINK_INSEGNAI = [
        { id: 'ins:sito', url: 'https://insegnai.ch', chiave: 'cb_in_sito', testo: 'insegnai.ch', icona: 'globe' },
        { id: 'ins:mail', url: 'mailto:giacomo@insegnai.ch', chiave: 'cb_in_mail', testo: 'giacomo@insegnai.ch', icona: 'mail' },
        { id: 'ins:ig', url: 'https://www.instagram.com/insegnai.ch/', chiave: 'cb_in_ig', testo: 'Instagram', icona: 'instagram' },
        { id: 'ins:fb', url: 'https://www.facebook.com/insegnai.ch/', chiave: 'cb_in_fb', testo: 'Facebook', icona: 'facebook' }
    ];
    function _vistaInsegnai(s) {
        s.area = 'due';
        s.sezioni.push({
            id: 'in-chi', titolo: t('cb_in_chi_t', 'Chi c’è dietro MappAI'), largo: true,
            /* il ritratto tondo del sito, non una foto nuova: è la stessa
               immagine con cui insegnai.ch si presenta altrove */
            figura: { src: 'insegnai_profilo.png', alt: t('cb_in_foto_alt', 'Ritratto di Giacomo Meschini, autore di MappAI'), tonda: true },
            /* ⚠️ Quelle chiavi nascono per il cassetto, che è HTML: `about_desc1`
               porta un `<strong>`. Il motore ESCAPA il testo (giustamente), e
               senza questa pulizia a schermo si leggeva «<strong>MappAI</strong>». */
            testo: _senzaTag([
                t('about_desc1', 'Ciao, mi chiamo Giacomo e sono lo sviluppatore di MappAI.'),
                t('about_desc2', 'Ho creato questo software come strumento di organizzazione e assistenza per lo studio.'),
                t('about_desc3', 'Sono anche un docente di scuola media e da anni mi interesso all’utilizzo dell’Intelligenza Artificiale in ambito educativo e non solo. Spero che questo software possa esservi d’aiuto.')
            ].join(' '))
        });
        s.sezioni.push({
            id: 'in-prog', titolo: t('cb_in_prog_t', 'Il progetto insegnai.ch'), largo: true,
            testo: t('cb_in_prog_d', 'insegnai.ch è il posto dove il lavoro viene pubblicato. Oltre allo sviluppo di MappAI e delle altre applicazioni, il sito propone approfondimenti ad ampio spettro sull’AI literacy: come funzionano davvero questi strumenti, che cosa cambiano nel modo di pensare, di scrivere e di insegnare, e come portarli in classe con criterio.')
        });
        s.sezioni.push({
            id: 'in-link', titolo: t('cb_in_link_t', 'Dove trovarmi'), largo: true,
            testo: t('cb_in_link_d', 'Sito, posta e i due profili su cui pubblico il lavoro su AI e didattica. Si aprono nel browser di sistema, fuori da MappAI.'),
            azioni: LINK_INSEGNAI.map(function (l) {
                return { id: l.id, etichetta: t(l.chiave, l.testo), icona: l.icona, chiude: false };
            })
        });
        s.nota = t('cb_in_nota', 'Questa vista crescerà: qui finiranno versione, note di rilascio e i canali dove seguire lo sviluppo.');
        return s;
    }

    /* ── FEEDBACK & BUG ──────────────────────────────────────────────────────
       ⚠️ La vista dice come funziona DAVVERO: nessun crash reporter, nessuna
       telemetria (verificato nel repo: zero `crashReporter`, zero Sentry, zero
       endpoint). Se l'app si chiude di colpo non resta niente da spedire —
       quindi la descrizione di che cosa si stava facendo È la segnalazione,
       e chi scrive deve saperlo prima di scrivere «si è chiuso». */
    /* ⚠️ Il MODALE «Invia segnalazione» è stato pensionato (15/8): scrivere una
       segnalazione è la cosa che si viene a fare qui, e una finestra sopra la
       console era una superficie in più per lo stesso gesto (con le sue emoji
       nei bottoni, contro la regola: solo Lucide). Categorie, testo e invio
       stanno nell'area, e il cassetto insegnai porta QUI. */
    function _vistaFeedback(s) {
        s.area = 'due';
        var F = _st.fb;
        var cats = (window.categorieSegnalazione ? window.categorieSegnalazione() : []);
        s.sezioni.push({
            id: 'fb-cat', titolo: t('cb_fb_cat_t', 'Che cosa vuoi segnalare'), largo: true,
            /* voci e non radio: la scelta è una sola, si fa con un colpo e si
               vede da lontano quale è accesa — con sei radio in fila servirebbe
               leggerle tutte per sapere dove si è */
            voci: cats.map(function (c) {
                return { id: 'fb-cat:' + c.id, etichetta: c.etichetta, icona: c.icona, attiva: F.cat === c.id, chiude: false };
            })
        });
        s.sezioni.push({
            id: 'fb-testo', titolo: t('cb_fb_testo_t', 'Racconta cosa è successo'), largo: true,
            testo: t('cb_fb_testo_d', 'Più sei preciso, più è probabile che si possa correggere: che cosa stavi facendo, che cosa ti aspettavi, che cosa è successo invece. Se è un suggerimento, dimmi il problema che risolverebbe.'),
            campi: [{
                id: 'fb-txt', tipo: 'area', etichetta: t('cb_fb_txt_lbl', 'Descrizione della segnalazione'),
                valore: F.testo
            }],
            azioni: [{ id: 'fb-invia', etichetta: t('cb_fb_invia', 'Prepara l’email'), ruolo: 'primario', icona: 'send', chiude: false }]
        });
        s.sezioni.push({
            id: 'fb-come', titolo: t('cb_fb_come_t', 'Come arriva la segnalazione'),
            testo: t('cb_fb_come_d', 'MappAI prepara un’email, la copia negli appunti e apre il tuo programma di posta con giacomo@insegnai.ch già compilato. Niente parte da solo: fino a quando non premi «invia» nel tuo client, la segnalazione non ha lasciato il computer.')
        });
        s.sezioni.push({
            id: 'fb-cosa', titolo: t('cb_fb_cosa_t', 'Che cosa viene allegato'),
            testo: t('cb_fb_cosa_d', 'La categoria che scegli, il modello AI selezionato, la versione dell’app e la stringa del browser interno. Nient’altro: né le tue mappe, né le fonti caricate, né i profili di classi e allievi.')
        });
        s.sezioni.push({
            id: 'fb-crash', titolo: t('cb_fb_crash_t', 'Gli errori restano su questo computer'),
            testo: t('cb_fb_crash_d', 'MappAI registra gli errori in un file sul tuo disco e non li spedisce a nessuno: nessun servizio esterno, nessun invio automatico. Le ultime righe finiscono in coda alla segnalazione quando apri il modulo — e partono solo se premi «invia» nel tuo programma di posta.')
        });
        s.sezioni.push(_sezErrori());
        s.nota = t('cb_fb_nota', 'Consigli e richieste valgono quanto i bug: la scelta di che cosa costruire dopo si fa anche così.');
        return s;
    }

    /* Il registro visto da qui. Mostra le ULTIME righe, non tutte: chi guarda
       vuole sapere se è successo qualcosa e che cosa, non leggere un file di
       log — quello si apre nella cartella. */
    function _sezErrori() {
        var E = _st.err;
        var sez = {
            id: 'fb-reg', titolo: t('cb_fb_reg_t', 'Errori registrati'), largo: true,
            azioni: [
                { id: 'err-copia', etichetta: t('cb_fb_reg_copia', 'Copia gli ultimi errori'), icona: 'clipboard-copy', chiude: false },
                /* «Apri Diagnostica», non «Apri la cartella»: nella stessa
                   console c'è già un bottone con quel nome (Gestione cartelle,
                   nel profilo) e porta ALTROVE — alla cartella madre. Due
                   comandi omonimi che aprono due posti diversi sono un modo di
                   sbagliare. L'icona resta la stessa: il gesto è lo stesso. */
                { id: 'err-cartella', etichetta: t('cb_fb_reg_cartella', 'Apri Diagnostica'), icona: 'folder-open', chiude: false },
                { id: 'err-svuota', etichetta: t('cb_fb_reg_svuota', 'Svuota il registro'), ruolo: 'distruttivo', icona: 'trash-2', chiude: false }
            ]
        };
        if (!window.MappAIErrori) {
            sez.testo = t('cb_fb_reg_off', 'Il registro degli errori non è caricato.');
            sez.azioni = [];
            return sez;
        }
        if (E.stato !== 'pronto') {
            sez.testo = t('cb_fb_reg_leggo', 'Leggo il registro…');
            return sez;
        }
        if (!E.records.length) {
            sez.testo = t('cb_fb_reg_vuoto', 'Nessun errore registrato. È la condizione normale: qui compaiono solo i guasti veri, non i messaggi di lavoro dell’app.');
            /* niente da copiare e niente da svuotare: resta la cartella */
            sez.azioni = sez.azioni.filter(function (a) { return a.id === 'err-cartella'; });
            return sez;
        }
        sez.testo = t('cb_fb_reg_d', 'Le ultime righe scritte sul disco. Ogni riga porta il messaggio, il file e la riga, il provider e il modello attivi e il titolo della mappa aperta — mai il contenuto delle fonti o i profili di allievi e classi.');
        /* ⚠️ Le righe si passano come OGGETTI, non come stringhe «etichetta:
           valore»: la forma breve spezza al PRIMO due punti, e nell'ora
           («11:46») il primo due punti è dentro il dato — l'etichetta sarebbe
           «2026-08-15 11». */
        sez.dati = E.records.slice().reverse().map(function (e) {
            var q = e.ctx || {};
            var dove = e.file ? (' — ' + String(e.file).split('/').pop() + ':' + (e.riga || 0)) : '';
            var chi = q.modello ? (' · ' + q.modello) : '';
            return {
                etichetta: String(e.ts || '').replace('T', ' ').slice(0, 16),
                valore: String(e.messaggio || '').slice(0, 120) + dove + chi
            };
        });
        sez.sotto = t('cb_fb_reg_tot', 'Registrati in tutto: ') + E.totale +
            (E.disco ? '' : ' · ' + t('cb_fb_reg_nodisco', 'copia in memoria del browser (fuori dall’app installata)'));
        return sez;
    }

    /* ── Allievi · Classi ────────────────────────────────────────────────────
       Due viste gemelle: la TABELLA in alto (è quello che si viene a vedere) e
       sotto i due comandi — «Crea profilo» e «Generico». Una regola sola in
       comune: il clic sulla riga ATTIVA quel contesto, il comando in coda apre
       la scheda per modificarla. */
    function _righeContesto() {
        var att = _attiva(), all = _allievo();
        var gest = function (id) {
            return {
                /* NON `quieto`: quel ruolo, in una cella di comandi, diventa
                   rosso al passaggio — è la veste del cestino di riga. Su
                   «Gestisci» prometterebbe una perdita che non c'è. */
                azioni: [{
                    id: id, etichetta: t('cls_manage', 'Gestisci'), icona: 'settings-2',
                    soloIcona: true
                }]
            };
        };
        var pallino = function (attivo, speciale, nome) {
            return {
                testo: nome,
                bollino: attivo ? 'attivo' : (speciale ? 'ok' : 'spento'),
                titolo: attivo ? t('cb_b_attivo', 'Contesto attivo')
                    : (speciale ? t('tune_special', 'Profilo con taratura speciale') : t('tune_standard', 'Profilo standard'))
            };
        };

        return {
            classi: _classi().map(function (c) {
                return _riga('cls:' + c.id, [
                    pallino(!!(att && att.id === c.id), _speciale('cls', c), c.name),
                    c.grade || '—',
                    (c.register && t('cb_reg_' + c.register, c.register)) || '—',
                    (window.MappAIClasses.disciplinesOf(c) || []).join(' · ') || '—',
                    String((c.students || []).length),
                    gest('cls-edit:' + c.id)
                ]);
            }),
            allievi: _allievi().map(function (p, i) {
                var cls = p.classId ? window.MappAIClasses.get(p.classId) : null;
                var attivo = !!(all && p.nickname && p.nickname.toLowerCase() === all.toLowerCase());
                return _riga('stu:' + i, [
                    pallino(attivo, _speciale('stu', p), p.nickname || '—'),
                    cls ? cls.name : '—',
                    p.grade || '—',
                    p.age ? String(p.age) : '—',
                    (p.register && t('cb_reg_' + p.register, p.register)) || '—',
                    (p.notes && String(p.notes).trim()) || '—',
                    gest('stu-edit:' + i)
                ]);
            })
        };
    }

    /* Il contesto attivo, detto a parole: sta nella NOTA, cioè sotto la tabella
       e sopra i comandi — dove si guarda prima di premerli. */
    function _notaContesto() {
        var att = _attiva(), all = _allievo();
        return all
            ? t('cb_ctx_allievo', 'Contesto attivo: allievo ') + all
            : (att ? t('cb_ctx_classe', 'Contesto attivo: classe ') + att.name
                : t('cb_ctx_generico', 'Contesto attivo: generico — nessuna taratura.'));
    }

    function _vistaClassi(s) {
        s.tabelle = [{
            id: 'tb-classi', titolo: t('cb_tb_classi', 'Profili classe'),
            vuota: t('cb_classe_nessuna', 'Nessuna classe. Creane una per tarare i contenuti sul livello dei tuoi allievi.'),
            colonne: [
                { etichetta: t('cb_c_classe', 'Classe'), larghezza: '200px' },
                { etichetta: t('cb_c_grado', 'Grado'), larghezza: '120px' },
                { etichetta: t('cb_c_registro', 'Registro'), larghezza: '150px' },
                { etichetta: t('cb_c_materie', 'Materie') },
                { etichetta: t('cb_c_allievi', 'Allievi'), larghezza: '90px' },
                { etichetta: t('cb_c_azioni', 'Azioni'), larghezza: '76px', ordinabile: false }
            ],
            righe: _righeContesto().classi
        }];
        /* I comandi vivono nel piè, che dentro la console sta DENTRO l'area:
           così stanno sotto la tabella, che è quello che si viene a vedere. */
        s.azioni = [
            { id: 'ctx-generico', etichetta: t('cls_generic', 'Generico'), icona: 'circle-dashed', chiude: false },
            { id: 'nuova-classe', etichetta: t('cb_crea_profilo', 'Crea profilo'), icona: 'plus', ruolo: 'primario', chiude: false }
        ];
        s.nota = _notaContesto();
        return s;
    }

    function _vistaAllievi(s) {
        s.tabelle = [{
            id: 'tb-allievi', titolo: t('cb_tb_allievi', 'Profili allievo'),
            vuota: t('stu_empty', 'Nessuna scheda studente. Creane una per un allievo che segui (es. sostegno).'),
            colonne: [
                { etichetta: t('cb_c_allievo', 'Allievo'), larghezza: '190px' },
                { etichetta: t('cb_c_classe', 'Classe'), larghezza: '130px' },
                { etichetta: t('cb_c_grado', 'Grado'), larghezza: '100px' },
                { etichetta: t('cb_c_eta', 'Età'), larghezza: '80px' },
                { etichetta: t('cb_c_preset', 'Preset'), larghezza: '150px' },
                { etichetta: t('cb_c_note', 'Note per la taratura') },
                { etichetta: t('cb_c_azioni', 'Azioni'), larghezza: '76px', ordinabile: false }
            ],
            righe: _righeContesto().allievi
        }];
        s.azioni = [
            { id: 'ctx-generico', etichetta: t('cls_generic', 'Generico'), icona: 'circle-dashed', chiude: false },
            { id: 'nuovo-allievo', etichetta: t('cb_crea_profilo', 'Crea profilo'), icona: 'user-plus', ruolo: 'primario', chiude: false }
        ];
        s.nota = t('cb_allievi_nota', 'Le schede allievo sono la taratura individuale: si aprono dichiarando il ruolo «Docente di sostegno / OPI» nel profilo.') +
            ' · ' + _notaContesto();
        return s;
    }

    function _vistaConsumi(s) {
        if (_st.ud.stato !== 'pronto') {
            s.sezioni.push({
                id: 'ud-carico', nuda: true,
                testo: t('cb_ud_carico', 'Leggo il registro delle chiamate AI…')
            });
            return s;
        }
        s.sezioni.push({
            id: 'ud-filtri', colonna: 'filtri',
            campi: [
                {
                    id: 'ud-ctx', tipo: 'scelta', valore: _st.ud.fCtx,
                    etichetta: t('cb_ud_f_ctx', 'Classe o allievo'), opzioni: _opzioniContesto()
                },
                {
                    id: 'ud-mat', tipo: 'scelta', valore: _st.ud.fMat,
                    etichetta: t('cb_ud_f_mat', 'Materia'), opzioni: _opzioniMateria()
                },
                {
                    id: 'ud-tasso', tipo: 'numero', larghezza: 'breve',
                    valore: (window.MappAIUsageDash && window.MappAIUsageDash.rate) ? window.MappAIUsageDash.rate() : 0.9,
                    etichetta: t('ud_rate', 'Tasso USD→CHF'), min: 0.1, max: 3,
                    /* Coi campi a solo segnaposto un numero già scritto resta un
                       numero NUDO: «0.9» accanto a due tendine non dice niente a
                       chi guarda. Qui l'indicazione deve restare visibile. */
                    aiuto: t('ud_rate', 'Tasso USD→CHF')
                }
            ],
            azioni: [
                { id: 'ud-stampa', etichetta: t('ud_print', 'Stampa'), icona: 'printer', chiude: false },
                { id: 'ud-cartella', etichetta: t('ud_tip_folder', 'Apri la cartella del registro su disco'), icona: 'folder-open', soloIcona: true, chiude: false }
            ]
        });
        s.tabelle = [_tabellaMappe()];
        s.tela = { id: 'ud', segnaposto: '' };
        s.nota = t('cb_ud_nota', 'I costi si calcolano qui dalle tariffe dei modelli: il registro salva solo i token, quindi correggere il tasso o un prezzo aggiorna anche lo storico.');
        return s;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LO SCHEMA
       ═══════════════════════════════════════════════════════════════════════ */
    /* «Uscire senza salvare?» si chiede solo se c'è qualcosa da perdere: il
       profilo a schermo diverso da quello su disco. Prima la domanda dipendeva
       dalla SEZIONE aperta (profilo = sempre, le altre = mai): dopo «Salva
       profilo» chiedeva lo stesso, e da un'altra sezione non chiedeva nemmeno
       con modifiche vere in sospeso (Giacomo, 4/9). Si legge al momento di
       uscire, per questo è una funzione e non un valore. */
    function _canon(o) {
        if (o === null || typeof o !== 'object') return o === undefined || o === '' ? null : o;
        if (Array.isArray(o)) return o.map(_canon);
        var out = {}; Object.keys(o).sort().forEach(function (k) { var v = _canon(o[k]); if (v !== null) out[k] = v; }); return out;
    }
    function _profiloSporco() {
        try {
            var TP = window.MappAITeacherProfile;
            if (!TP || !_st || !_st.profilo) return false;
            return JSON.stringify(_canon(_st.profilo)) !== JSON.stringify(_canon(TP.get()));
        } catch (e) { return false; }
    }

    function schema() {
        var s = {
            titolo: t('cb_titolo', 'Cabina'),
            sottotitolo: t('cb_sub', 'Il tuo profilo, il contesto di lavoro e l’AI'),
            icona: 'sliders-horizontal', taglia: 'xl', layout: 'console', piena: true,
            invio: false, veloChiude: false, sporco: _profiloSporco,
            nav: VOCI.map(function (v) {
                if (v.gruppo) return { gruppo: t(v.gruppo, v.gruppoTesto) };
                return {
                    id: v.id, etichetta: t(v.chiave, v.testo), icona: v.icona,
                    sotto: v.sottoChiave ? t(v.sottoChiave, v.sottoTesto) : '',
                    classe: v.classe || '',
                    attiva: _st.voce === v.id
                };
            }),
            sezioni: [],
            azioni: []
        };

        if (_st.voce === 'profilo') {
            var TP = window.MappAITeacherProfile;
            if (!TP) {
                s.sezioni.push({ id: 'no-tp', nuda: true, testo: t('cb_no_profilo', 'Il modulo del profilo insegnante non è caricato.') });
                return s;
            }
            if (!_st.profilo) _st.profilo = JSON.parse(JSON.stringify(TP.get()));
            s.area = 'due';
            s.sezioni = TP.sezioni(_st.profilo);
            /* In coda al profilo, non dentro: `TP.sezioni` è la fonte condivisa
               col modale storico e queste non sono cose del docente, sono cose
               dell'installazione. Stanno QUI perché è la prima schermata che si
               apre — e perché la domanda «dove me li ha messi?» arriva a
               chiunque, mentre la finestra che risponde non aveva più un
               ingresso da nessuna parte. */
            s.sezioni.push(_sezCartelle());
            /* `chiude:false`: salvare NON è uscire. La Cabina è la casa del
               profilo — si salva e si continua, magari passando alla classe
               attiva. Col default un'azione di piè conclude, e per giunta non
               sarebbe mai arrivata al gestore che scrive. */
            s.azioni = [{ id: 'salva-prof', etichetta: t('tp_save', 'Salva profilo'), ruolo: 'primario', icona: 'save', chiude: false }];
            return s;
        }
        if (_st.voce === 'classi') return _vistaClassi(s);
        if (_st.voce === 'allievi') return _vistaAllievi(s);
        if (_st.voce === 'aspetto') return _vistaAspetto(s);
        if (_st.voce === 'consumi') return _vistaConsumi(s);
        if (_st.voce === 'consigli') return _vistaConsigli(s);
        if (_st.voce === 'tutorial') return _vistaTutorial(s);
        if (_st.voce === 'termini') return _vistaTermini(s);
        if (_st.voce === 'privacy') return _vistaPrivacy(s);
        if (_st.voce === 'insegnai') return _vistaInsegnai(s);
        if (_st.voce === 'feedback') return _vistaFeedback(s);

        return _vistaAi(s);
    }

    /* ══ ASPETTO E LEGGIBILITÀ — il carattere dell'app (18/8) ═════════════
       Il carattere scelto qui vale per TUTTA l'app e per tutto ciò che l'app
       genera: le mappe, i quiz, le flashcard, le sintesi, i fogli stampabili.
       In ELABORA un singolo documento può avere il suo, che vince solo lì.

       ⚠️ Non c'è un riquadro di anteprima, ed è una scelta: la console È
       l'anteprima. Scegliendo un carattere cambia tutto quello che si sta
       guardando — la navigazione, i titoli, questa nota — cioè esattamente
       quello che cambierà lavorando. Un campione «Il pane della zia…» dentro un
       riquadro direbbe meno, e sarebbe una seconda superficie da tenere
       allineata al catalogo. */
    function _vistaAspetto(s) {
        var F = window.MappAIFont, C = window.MappAIFontCore;
        if (!F || !C) {
            s.sezioni.push({
                id: 'fn-no', nuda: true,
                testo: t('cb_fn_no', 'Il modulo dei caratteri non è caricato.')
            });
            return s;
        }
        var attivo = F.attivo();
        s.sezioni.push({
            id: 'fn-elenco',
            titolo: t('cb_fn_t', 'Carattere dell’app'),
            testo: t('cb_fn_d', 'Vale per l’interfaccia e per tutto quello che MappAI produce: mappe, quiz, flashcard, sintesi e fogli da stampare.'),
            largo: true,
            voci: C.elenco().map(function (f) {
                var note = [];
                if (!f.corsivo) note.push(t('cb_fn_no_corsivo', 'senza corsivo'));
                return {
                    id: 'fn:' + f.id,
                    etichetta: f.etichetta,
                    sotto: f.descrizione,
                    icona: f.id === attivo ? 'check' : 'type',
                    attiva: f.id === attivo,
                    badge: f.id === attivo ? t('cb_fn_in_uso', 'in uso')
                        : (note.length ? note.join(' · ') : ''),
                    /* `chiude:false`: scegliere un carattere non è uscire dalla
                       Cabina — si prova, si guarda, si cambia idea. Ed è anche
                       il modo in cui la console diventa l'anteprima. */
                    chiude: false
                };
            })
        });
        /* Il corsivo NON è un dettaglio tipografico: nei fogli dei quiz la
           spiegazione della risposta è in corsivo. Dove il carattere non ce
           l'ha, il browser inclina il tondo — si può fare, ma va detto invece
           che promesso. */
        if (!C.haCorsivo(attivo)) {
            s.sezioni.push({
                id: 'fn-corsivo', nuda: true, largo: true,
                testo: t('cb_fn_corsivo_avviso', 'Questo carattere non ha un corsivo suo: dove serve (la spiegazione di una risposta nei quiz) il testo viene inclinato dal computer.')
            });
        }
        s.nota = t('cb_fn_nota', 'I caratteri sono installati dentro MappAI: funzionano anche senza collegamento a internet. In ELABORA puoi dare a un singolo documento un carattere diverso da questo.');
        return s;
    }

    /* ══ IMPOSTAZIONI AI — l'ultimo ponte, chiuso (13/8) ═══════════════════
       Era l'unica voce che apriva ancora la finestra storica. Ora i comandi
       vivono nell'area della console.

       ⚠️ I comandi NON sono riscritti come schema: si SPOSTANO. Provider,
       chiave, Product ID, modello e listino sono cablati per ID a una dozzina
       di funzioni globali (`switchAIProvider`, `refreshGeminiModels`,
       `saveApiKey`, `updateModelCapabilities`…) e a `changeLanguage`, che li
       cerca nel documento. Ricostruirli come dati vorrebbe dire due superfici
       con gli stessi id — la trappola che il bento di CREA evita nello stesso
       modo, montando gli elementi VERI invece di copiarli.
       Conseguenza da sapere: gli elementi vanno RESTITUITI al loro posto
       quando la console si chiude, o alla riapertura non esisterebbero più
       (il motore butta via il riquadro, e con lui tutto ciò che contiene). */
    function _vistaAi(s) {
        /* `forma: 'colonna'`: la tela centra il contenuto (nasce per UN pezzo,
           il cruscotto dei consumi). Qui dentro ne spostiamo TRE, e centrati
           finivano in fila — provider e chiave in una colonna stretta a destra,
           la lingua a mezz'altezza, 300px di vuoto in cima. */
        s.tela = { id: 'ai', segnaposto: '', forma: 'colonna' };
        s.nota = t('cb_ai_nota', 'Le chiavi restano su questo computer: non vengono mai inviate se non al provider che scegli qui.');
        return s;
    }

    /* Dove stavano prima: un segnaposto vuoto nel modale storico, così il
       ritorno è esatto anche se nel frattempo il markup attorno è cambiato. */
    var _aiSegno = null, _aiPezzi = null;
    function _aiCorpo() {
        var m = document.getElementById('config-ai-modal');
        if (!m) return null;
        /* il corpo è tutto ciò che sta nel riquadro TRANNE la × e il titolo:
           quelli la console ce li ha già, e ripeterli sarebbe due volte lo
           stesso comando nella stessa schermata */
        var riquadro = m.firstElementChild;
        if (!riquadro) return null;
        var pezzi = [];
        for (var i = 0; i < riquadro.children.length; i++) {
            var el = riquadro.children[i];
            if (el.tagName === 'BUTTON' || el.tagName === 'H2') continue;
            pezzi.push(el);
        }
        return { riquadro: riquadro, pezzi: pezzi };
    }
    function _portaAi(host) {
        var c = _aiCorpo();
        if (!c || !c.pezzi.length) {
            host.textContent = t('cb_ai_no_dom', 'I comandi delle impostazioni AI non sono caricati.');
            return;
        }
        if (!_aiSegno) {
            _aiSegno = document.createComment(' comandi AI: ora nella Cabina ');
            c.riquadro.insertBefore(_aiSegno, c.pezzi[0]);
        }
        /* ⚠️ Si ricordano I PEZZI, non «il contenuto della tela»: quando la
           restituzione parte, la tela può già essere di un'altra vista o non
           esistere più (misurato — cambiando vista i comandi restavano orfani
           in un riquadro buttato via, e alla riapertura la Cabina mostrava una
           schermata muta). Coi nodi in mano il ritorno è esatto comunque. */
        _aiPezzi = c.pezzi.slice();
        /* ORDINE di lettura: prima quello per cui si apre questa vista
           (provider · chiave · modello), poi le due righe della lingua, che
           riguardano l'app intera. Nel modale storico stavano in cima perché
           erano due righe sottili sopra un form; qui, a tutta larghezza,
           mettevano l'essenziale sotto la piega. Si RIORDINA l'append, non il
           markup: gli elementi restano gli stessi e tornano al loro posto. */
        var ordinati = c.pezzi.slice().sort(function (a, b) {
            var pa = a.querySelector && a.querySelector('#provider-google') ? 0 : 1;
            var pb = b.querySelector && b.querySelector('#provider-google') ? 0 : 1;
            return pa - pb;
        });
        for (var i = 0; i < ordinati.length; i++) host.appendChild(ordinati[i]);
        /* Il modale storico non si apre più da nessuna parte, ma resta nel DOM
           col suo velo: senza questo, un click a vuoto lo riporterebbe davanti. */
        var m = document.getElementById('config-ai-modal');
        if (m) m.classList.add('hidden');
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    function _restituisciAi() {
        if (!_aiSegno || !_aiSegno.parentNode || !_aiPezzi) { _aiSegno = null; _aiPezzi = null; return; }
        for (var i = 0; i < _aiPezzi.length; i++) _aiSegno.parentNode.insertBefore(_aiPezzi[i], _aiSegno);
        _aiSegno.parentNode.removeChild(_aiSegno);
        _aiSegno = null; _aiPezzi = null;
    }

    /* Ridisegnare la console è sempre due cose: rimontare lo schema e
       ripopolare la tela — che il motore non sa disegnare e quindi non
       ridisegna da sé. Passare da una parte sola lascia il cruscotto vuoto. */
    function _ridisegna() {
        if (!_st || !_st.rid) return null;
        var box = _st.rid(schema());
        _riempiTela(box);
        return box;
    }

    function apri(voce) {
        if (!MM()) { if (window.showTeacherProfileModal) window.showTeacherProfileModal(); return; }
        _st = _vuoto();
        var v = ALIAS[voce] || voce;
        _st.voce = IDS.indexOf(v) >= 0 ? v : 'profilo';
        var s = schema();

        /* Dice alla veste «manifesto» che console è questa: qui il pallino in
           testata è ACCESO e chiude, mentre in ogni altra console è il bottone
           che porta QUI. Nessuna forma del rail si accende: la Cabina non è una
           delle tre modalità di lavoro, è il pallino. */
        try { document.documentElement.dataset.manSezionePendente = 'cabina'; } catch (e) { }

        /* La lettura del registro parte da QUI, non prima di `open()`: se
           finisse mentre la finestra non è ancora montata, `_ridisegna` non
           avrebbe la funzione con cui rimontarla e la vista resterebbe per
           sempre su «Leggo il registro…». */
        s.suApertura = function (box, ridisegna) {
            _st.rid = ridisegna;
            _riempiTela(box);
            if (_st.voce === 'consumi') _caricaConsumi();
            if (_st.voce === 'feedback') _caricaErrori();
            if (_st.voce === 'profilo') _caricaCartelle();
        };

        s.suAzione = function (ev, box, ridisegna) {
            var id = ev.azione;
            _st.rid = ridisegna;

            /* Il profilo si porta dietro quello che è stato scritto: cambiando
               vista non si perde, e tornando indietro è ancora lì. */
            if (_st.voce === 'profilo' && _st.profilo && window.MappAITeacherProfile) {
                window.MappAITeacherProfile.assorbi(_st.profilo, ev.valori);
            }

            /* ⚠️ Ogni comando di questa vista RIDISEGNA (scegliere la categoria,
               inviare): senza raccogliere il campo prima, il testo scritto
               sparirebbe al primo clic — il riquadro viene ricostruito da capo
               e il valore lo porta lo SCHEMA, non il DOM. */
            if (_st.voce === 'feedback' && ev.valori && ev.valori['fb-txt'] !== undefined) {
                _st.fb.testo = ev.valori['fb-txt'];
            }

            if (id === '__nav') {
                if (ev.voce === 'guida-online') { _apriEsterno(GUIDA_DOCENTI_URL); return; }   /* non è una vista */
                if (_st.voce === 'ai') _restituisciAi();
                _st.voce = ev.voce;
                if (_st.voce === 'consumi') _caricaConsumi();
                if (_st.voce === 'feedback') _caricaErrori();
                if (_st.voce === 'profilo') _caricaCartelle();
                _ridisegna();
                return;
            }
            /* ESC A STRATI: se da qui è stata aperta una finestra non ancora
               migrata (che il motore non conosce e non ha nella sua pila), il
               primo ESC chiude quella. Senza, chiuderebbe la console SOTTO e
               lascerebbe l'altra sospesa per aria. */
            if (id === '__esc') {
                var chiudi = _legacySopra();
                if (chiudi) { chiudi(); return false; }
                return;                                   // ESC chiude la console
            }

            if (id === '__campo') {
                if (_st.voce === 'profilo' &&
                    ['ruolo-materia', 'ruolo-sostegno', 'ora-classe'].indexOf(ev.campo) >= 0) _ridisegna();
                if (_st.voce === 'consumi') {
                    var v2 = ev.valori || {};
                    if (ev.campo === 'ud-ctx') { _st.ud.fCtx = v2['ud-ctx'] || ''; _st.ud.sel = ''; _st.ud.drill = null; }
                    if (ev.campo === 'ud-mat') { _st.ud.fMat = v2['ud-mat'] || ''; _st.ud.sel = ''; _st.ud.drill = null; }
                    if (ev.campo === 'ud-tasso' && window.MappAIUsageDash) window.MappAIUsageDash.setRate(v2['ud-tasso']);
                    _ridisegna();
                }
                return;
            }
            if (_st.voce === 'profilo' && window.MappAITeacherProfile &&
                (id.indexOf('__piu-') === 0 || id.indexOf('__via-') === 0)) {
                return window.MappAITeacherProfile.comandoElenco(_st.profilo, id, function () { _ridisegna(); });
            }
            /* Il carattere dell'app. `imposta` scrive, applica e annuncia;
               qui basta ridisegnare, così la spunta si sposta e la console si
               ridisegna NEL carattere nuovo — che è l'anteprima. */
            if (id.indexOf('fn:') === 0) {
                if (window.MappAIFont) window.MappAIFont.imposta(id.slice(3));
                _ridisegna();
                return;
            }
            if (id === 'salva-prof') {
                window.MappAITeacherProfile.salva(_st.profilo);
                /* riletto dallo store: quello che resta a schermo è quello che
                   è finito su disco, non quello che si era digitato */
                _st.profilo = JSON.parse(JSON.stringify(window.MappAITeacherProfile.get()));
                toast(t('tp_saved', 'Profilo insegnante salvato.'), 'success');
                _ridisegna();
                return;
            }

            // ── Allievi & Classi ───────────────────────────────────────────
            if (id.indexOf('cls-edit:') === 0) {
                if (window.MappAIClasses && window.MappAIClasses.openClassEdit) {
                    window.MappAIClasses.openClassEdit(id.slice(9));
                    _alza('#class-accounts-modal');
                }
                return;
            }
            if (id.indexOf('stu-edit:') === 0) {
                if (window.MappAIClasses && window.MappAIClasses.openStudentEdit) {
                    window.MappAIClasses.openStudentEdit(parseInt(id.slice(9), 10));
                    _alza('#class-accounts-modal');
                }
                return;
            }
            if (id.indexOf('cls:') === 0) {
                try { window.MappAIClasses.setActive(id.slice(4)); } catch (e) { }
                _ridisegna();
                return;
            }
            if (id.indexOf('stu:') === 0) {
                var p = _allievi()[parseInt(id.slice(4), 10)];
                if (p && window.MappAIClasses && window.MappAIClasses.setActiveStudent) {
                    window.MappAIClasses.setActiveStudent(p);
                    toast(t('stu_activated', 'Scheda attiva per la taratura.'), 'success');
                }
                _ridisegna();
                return;
            }
            if (id === 'ctx-generico') {
                try {
                    if (window.MappAIClasses.setActiveStudent) window.MappAIClasses.setActiveStudent(null);
                    window.MappAIClasses.setActive('');
                } catch (e) { }
                _ridisegna();
                return;
            }
            if (id === 'nuova-classe') {
                if (window.MappAIClasses && window.MappAIClasses.openClassCreate) {
                    window.MappAIClasses.openClassCreate(); _alza('#class-accounts-modal');
                }
                return;
            }
            if (id === 'nuovo-allievo') {
                if (window.MappAIClasses && window.MappAIClasses.openStudentCreate) {
                    window.MappAIClasses.openStudentCreate(); _alza('#class-accounts-modal');
                }
                return;
            }

            // ── Consumi ────────────────────────────────────────────────────
            if (id.indexOf('udp:') === 0) {
                var k = id.slice(4);
                _st.ud.sel = (_st.ud.sel === k) ? '' : k;   // secondo clic = torna a tutte
                _st.ud.drill = null;
                _ridisegna();
                return;
            }
            if (id === 'ud-stampa') {
                if (window.MappAIUsageDash && window.MappAIUsageDash.printReport) {
                    window.MappAIUsageDash.printReport(_recordFiltrati(true), _etichettaSelezione());
                }
                return;
            }
            if (id === 'ud-cartella' || id === 'apri-cartella-consumi') {
                if (window.electronAPI && window.electronAPI.usageOpenFolder) window.electronAPI.usageOpenFolder();
                else toast(t('cb_no_electron', 'Disponibile solo nell’app installata.'), 'warning');
                return;
            }
            if (id === 'vai-consumi') { _st.voce = 'consumi'; _caricaConsumi(); _ridisegna(); return; }

            // ── Ponti verso le finestre non ancora migrate ──────────────────
            if (id === 'apri-guida') {
                if (window.showAppGuide) { window.showAppGuide(); _alza('#app-guide-modal'); }
                return;
            }
            if (id === 'apri-consigli') {
                if (window.showAppTutorial) { window.showAppTutorial(); _alza('#app-tutorial-modal'); }
                return;
            }
            // ── Segnalazione ────────────────────────────────────────────────
            if (id.indexOf('fb-cat:') === 0) {
                _st.fb.cat = id.slice(7);
                _ridisegna();
                return;
            }
            if (id === 'fb-invia') {
                if (!window.inviaSegnalazione) {
                    toast(t('cb_fb_no_modulo', 'Il modulo di segnalazione non è caricato.'), 'warning');
                    return;
                }
                window.inviaSegnalazione(_st.fb.cat, _st.fb.testo).then(function (partita) {
                    if (!partita) return;          // testo vuoto: l'avviso l'ha già dato
                    _st.fb = { cat: 'ui', testo: '' };
                    _ridisegna();
                });
                return;
            }

            // ── Gestione cartelle ───────────────────────────────────────────
            if (id === 'cart-apri') {
                if (window.electronAPI && window.electronAPI.filesOpenRoot) window.electronAPI.filesOpenRoot();
                else toast(t('cb_no_electron', 'Disponibile solo nell’app installata.'), 'warning');
                return;
            }
            if (id === 'cart-cambia') {
                if (window.MappAIFiles && window.MappAIFiles.openSettings) {
                    window.MappAIFiles.openSettings();
                    _alza('.mappai-files-overlay');
                    /* La posizione può cambiare lì dentro, e quella finestra non
                       avvisa nessuno quando si chiude (× · velo · ESC): si
                       aspetta che sparisca dal DOM e si rilegge. Senza, il
                       riquadro continuerebbe a dichiarare il percorso VECCHIO
                       dopo che i file sono già stati spostati. */
                    _quandoChiusaCartelle();
                } else toast(t('cb_no_electron', 'Disponibile solo nell’app installata.'), 'warning');
                return;
            }

            if (id === 'cart-pota') {
                var ant = _anteprimaCassetto();
                if (!ant || !ant.via.length) { toast(t('cb_ca_pulito', 'nessuna copia in eccesso'), 'info'); return; }
                /* l'ANTEPRIMA sta nella conferma: si vede che cosa va via e
                   quanto si libera PRIMA di dire sì. Le prime mappe per nome,
                   il resto in un conteggio — un elenco di 98 righe non è
                   un'anteprima, è un muro. */
                var prime = ant.perMappa.slice(0, 5).map(function (r) {
                    return r.mappa + ' (' + r.tolte + ')';
                }).join(' · ');
                var altre = ant.perMappa.length > 5 ? ' · +' + (ant.perMappa.length - 5) + ' ' + t('cb_ca_altre', 'altre mappe') : '';
                MM().conferma({
                    titolo: t('cb_ca_pota', 'Libera spazio'),
                    testo: t('cb_ca_pota_d', 'Di ogni mappa resta la copia più recente — quella che l’app apre. Le copie più vecchie non sono raggiungibili da nessuna schermata, e le mappe su disco non vengono toccate.') +
                        '\n\n' + t('cb_ca_pota_via', 'Vanno via') + ' ' + ant.via.length + ' ' + t('cb_ca_copie', 'copie vecchie dei progetti') +
                        ' (' + ant.MB + ' MB): ' + prime + altre,
                    conferma: t('cb_ca_pota', 'Libera spazio')
                }).then(function (si) {
                    if (!si) return;
                    var viaSet = {};
                    ant.via.forEach(function (vid) { viaSet[vid] = 1; try { localStorage.removeItem(vid); } catch (e) { } });
                    try {
                        localStorage.setItem('tutor_ai_projects',
                            JSON.stringify(ant.progetti.filter(function (p) { return !viaSet[p.id]; })));
                    } catch (e) { }
                    toast(t('cb_ca_potato', 'Spazio liberato: ') + ant.MB + ' MB (' + ant.via.length + ')', 'success');
                    _st.cart.stato = 'vuoto';
                    _ridisegna();
                });
                return;
            }

            // ── Registro locale degli errori ────────────────────────────────
            if (id === 'err-copia') {
                if (!window.MappAIErrori) return;
                window.MappAIErrori.blocco(8).then(function (txt) {
                    if (!txt) { toast(t('cb_fb_reg_niente', 'Nessun errore da copiare.'), 'info'); return; }
                    navigator.clipboard.writeText(txt).then(function () {
                        toast(t('cb_fb_reg_copiati', 'Errori copiati: incollali nella segnalazione.'), 'success');
                    }, function () { toast(t('cb_fb_reg_nocopia', 'Copia non riuscita.'), 'warning'); });
                });
                return;
            }
            if (id === 'err-cartella') {
                if (window.electronAPI && window.electronAPI.errorOpenFolder) window.electronAPI.errorOpenFolder();
                else toast(t('cb_no_electron', 'Disponibile solo nell’app installata.'), 'warning');
                return;
            }
            if (id === 'err-svuota') {
                /* distruttivo: si conferma. Il registro è l'unica traccia di
                   quello che è andato storto — svuotarlo per sbaglio significa
                   perdere proprio la segnalazione che si stava per scrivere. */
                MM().conferma({
                    titolo: t('cb_fb_reg_svuota', 'Svuota il registro'),
                    testo: t('cb_fb_reg_conf', 'Cancella le righe degli errori registrati su questo computer. Non si torna indietro, e con esse sparisce il dettaglio da allegare alla segnalazione.'),
                    conferma: t('cb_fb_reg_svuota', 'Svuota il registro'), distruttivo: true
                }).then(function (si) {
                    if (!si || !window.MappAIErrori) return;
                    window.MappAIErrori.pulisci().then(function () {
                        _st.err = { stato: 'vuoto', records: [], totale: 0, file: '', disco: false };
                        _caricaErrori();
                        _ridisegna();
                        toast(t('cb_fb_reg_svuotato', 'Registro svuotato.'), 'success');
                    });
                });
                return;
            }

            // ── Sviluppo: i collegamenti di insegnai.ch ─────────────────────
            if (id.indexOf('ins:') === 0) {
                var L = LINK_INSEGNAI.filter(function (x) { return x.id === id; })[0];
                if (!L) return;
                if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(L.url);
                else window.open(L.url, '_blank', 'noopener');
                return;
            }
        };
        MM().open(s).then(function () { _restituisciAi(); }, function () { _restituisciAi(); });
    }

    function _etichettaSelezione() {
        var U = _st.ud, C = _UC();
        if (!U.sel || !C) return t('ud_all_maps', 'Tutte le mappe');
        var p = C.listProjects(U.records).filter(function (x) { return x.key === U.sel; })[0];
        return (p && p.label) || t('ud_all_maps', 'Tutte le mappe');
    }

    /* `_ridisegna` non fa niente a console chiusa (il `ridisegna` del motore si
       tira indietro da sé), quindi l'ascolto può restare acceso una volta sola. */
    if (typeof document !== 'undefined') {
        document.addEventListener('mappai-profili-cambiati', function () {
            if (_st && VISTE_PROFILI.indexOf(_st.voce) >= 0) _ridisegna();
        });
    }

    window.MappAICabina = { apri: apri, VOCI: VOCI, _schema: function () { if (!_st) _st = _vuoto(); return schema(); } };
    window.openCabina = apri;
    console.log('[MappAICabina] console «Cabina» caricata');
})();
