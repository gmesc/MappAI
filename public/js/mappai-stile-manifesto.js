/* ═══════════════════════════════════════════════════════════════════════════
   STILE «MANIFESTO» — il rail delle tre forme + il ritorno alla prima pagina
   Dal progetto Inkscape di Giacomo (Inkscape/landing MappAI.pdf, 3/8/26).

   Che cosa fa, in una riga: accende la classe `manifesto` su <html> (il foglio
   mappai-stile-manifesto.css è inerte senza), monta il RAIL delle tre forme al
   posto del selettore centrale, e tiene lo stato allineato alla modalità vera.

   Perché il rail lo monta il JS e non index.html: le tre forme SONO il
   selettore Costruisci/Elabora/Insegna uscito dalla barra centrale, e il loro
   comando è già scritto — window.MappAITeach.setMode(). Duplicarlo nel markup
   vorrebbe dire due sorgenti per la stessa azione, che divergono al primo
   ritocco. Qui il rail è una VESTE del selettore: chiama gli stessi setMode e
   si ridipinge leggendo la modalità corrente, mai una copia sua.

   ⚠️ Memoria: i CHIP (classe · materia · allievo) vivono in localStorage e
   sopravvivono alla chiusura — è il contesto di lavoro. La POSIZIONE
   Costruisci/Elabora/Insegna no: `init()` di mappai-landing-teach.js scrive ''
   a ogni avvio, e questo modulo non tocca quella chiave. La prima pagina è una
   domanda, non la ripresa di ieri.

   Kill-switch: localStorage `mappai_stile_manifesto` = '0' → niente classe,
   niente rail, la landing torna esattamente com'era.

   ⚠️ Le forme sono un codice DOPPIO (forma + colore) ma restano icone mute:
   l'audit del 31/7 aveva contato 26 bottoni solo-icona senza nome. Qui ognuna
   porta aria-label + title, e l'etichetta compare al passaggio.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var LS = 'mappai_stile_manifesto';
    var CLASSE = 'manifesto';
    var VUOTA = 'manifesto-vuota';

    function t(k, f) { try { return window.t ? window.t(k, f) : f; } catch (e) { return f; } }
    function attivo() { try { return localStorage.getItem(LS) !== '0'; } catch (e) { return true; } }

    /* La modalità la sa MappAITeach, che la legge da localStorage. Non la
       rileggo per conto mio: due letture della stessa cosa divergono. */
    /* Il rail dice DOVE SEI. Con una console aperta, dove sei è la console —
       non la modalità che le sta sotto: entrando in INSEGNA la landing viene
       messa su COSTRUISCI apposta (è dove si atterra chiudendo la console), e
       fino al 4/8 quel dettaglio interno finiva nel rail, che marcava
       «Costruisci» mentre la testata diceva «Insegna». Due comandi che dicono
       due cose diverse sulla stessa schermata.
       La sezione della console in cima la scrive `mappai-console-manifesto.js`
       sul VELO (il riquadro viene ricostruito a ogni ridisegno); «cabina» non è
       una delle tre forme, quindi con la Cabina aperta nessuna forma è attiva —
       ed è giusto: la Cabina è il pallino, non una modalità di lavoro. */
    function sezioneConsole() {
        var box = document.querySelectorAll('.mm-overlay .mm-box--piena.mm-box--console');
        if (!box.length) return '';
        var velo = box[box.length - 1].closest('.mm-overlay');
        return velo ? (velo.dataset.manSezione || '') : '';
    }

    function modo() {
        try {
            var c = sezioneConsole();
            if (c) return c;
            if (window.MappAITeach && window.MappAITeach.readMode) return window.MappAITeach.readMode();
            return localStorage.getItem('mappai_landing_mode') || '';
        } catch (e) { return ''; }
    }

    /* Le tre forme del disegno. `icona` è il nome Lucide; `modo` è ciò che
       passiamo a setMode — la stessa stringa dei tre segmenti storici. */
    var FORME = [
        { modo: 'build', icona: 'triangle', chiave: 'ui_landing_build', testo: 'Crea' },
        { modo: 'elabora', icona: 'hexagon', chiave: 'ui_landing_elabora', testo: 'Elabora' },
        { modo: 'teach', icona: 'box', chiave: 'ui_landing_teach', testo: 'Insegna' }
    ];

    /* ⚠️ Il rail sta SOPRA la console (deve restare visibile), quindi le tre
       forme si possono premere anche da lì dentro — e allora devono portare
       via davvero. Prima cambiavano la modalità della landing NASCOSTA sotto:
       lo stato cambiava, a schermo non succedeva niente e i due bottoni si
       leggevano come morti (segnalato da Giacomo, 4/8).
       Scegliere una forma è quindi anche il modo di USCIRE da una console.
       Si esce dalla stessa porta della × (`__chiudi`, che nel markup c'è ancora
       ma è nascosta): così una console `sporco` continua a chiedere conferma
       invece di buttare via quello che stavi scrivendo. Il cambio di modalità
       avviene DOPO, e solo se la console se n'è andata davvero: se rispondi
       «Torna indietro» resti dove sei. */
    function consoleInCima() {
        var b = document.querySelectorAll('.mm-overlay .mm-box--piena.mm-box--console');
        return b.length ? b[b.length - 1] : null;
    }

    function sezioneDelBox(box) {
        var v = box && box.closest('.mm-overlay');
        return v ? (v.dataset.manSezione || '') : '';
    }

    function vaiA(m, tentativi) {
        var box = consoleInCima();
        if (!box) {
            if (window.MappAITeach && window.MappAITeach.setMode) window.MappAITeach.setMode(m);
            return;
        }
        if (sezioneDelBox(box) === m) return;        /* sei già lì: niente da fare */
        if ((tentativi || 0) > 60) return;           /* ~9s: la conferma è stata rifiutata */
        /* si bussa una volta sola per clic sul rail, poi si aspetta: un segno
           lasciato sull'elemento resterebbe anche dopo un rifiuto, e il clic
           successivo non busserebbe più (il bottone tornerebbe morto). */
        if (!tentativi) {
            var x = box.querySelector('.mm-head .mm-close');
            if (x) x.click();
        }
        setTimeout(function () { vaiA(m, (tentativi || 0) + 1); }, 150);
    }

    function montaRail() {
        if (_bentoApp()) return;   /* cablaggio bento: niente rail, «Cosa» del percorso lo sostituisce */
        if (document.getElementById('manifesto-rail')) return;
        var host = document.getElementById('landing-view');
        if (!host) return;

        var rail = document.createElement('div');
        rail.id = 'manifesto-rail';
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', t('mn_rail_aria', 'Modalità di lavoro'));

        FORME.forEach(function (f) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'man-forma';
            b.dataset.modo = f.modo;
            var nome = t(f.chiave, f.testo);
            b.setAttribute('aria-label', nome);
            b.title = nome;
            b.innerHTML = '<i data-lucide="' + f.icona + '"></i>';
            b.addEventListener('click', function () { vaiA(f.modo, 0); });
            rail.appendChild(b);
        });
        host.appendChild(rail);

        /* il mini-logo: torna alla prima pagina (setMode('') è uno stato vero,
           lo accetta da quando la landing si apre vuota) */
        var home = document.createElement('button');
        home.id = 'manifesto-home';
        home.type = 'button';
        home.setAttribute('aria-label', t('mn_home', 'Torna alla prima pagina'));
        home.title = t('mn_home', 'Torna alla prima pagina');
        home.innerHTML = '<img src="MappAI_logo.svg" alt="">';
        /* stessa strada delle forme: se c'è una console aperta, prima si esce */
        home.addEventListener('click', function () { vaiA('', 0); });
        host.appendChild(home);

        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    /* ── Il NOME di dove sei, nella barra in alto (5/8, richiesta di Giacomo) ──
       La barra è una sola e porta tre cose sulla stessa riga: il pallino della
       Cabina, il chip del contesto e il nome della sezione. Il nome è l'unico
       testo ammesso lì.
       ⚠️ «Crea» e non «Costruisci»: è il nome che Giacomo usa parlando della
       console. Il rail tiene il suo (è un'altra superficie, con le sue etichette
       storiche). */
    /* ⚠️ Le stesse chiavi del rail e del selettore storico: il nome della sezione
       è UNO (Giacomo, 5/8: «il nome è CREA»). Con chiavi separate la barra e il
       fumetto del rail avrebbero potuto dire due parole diverse per lo stesso
       posto — ed è già successo («Crea» nella barra, «Costruisci» nel rail). */
    var TITOLI = {
        build: ['ui_landing_build', 'Crea'],
        elabora: ['ui_landing_elabora', 'Elabora'],
        teach: ['ui_landing_teach', 'Insegna'],
        cabina: ['mn_tit_cabina', 'Cabina']
    };

    function montaTitolo() {
        var hu = document.getElementById('header-utils');
        if (!hu || document.getElementById('mn-sezione')) return;
        var s = document.createElement('span');
        s.id = 'mn-sezione';
        /* non è un comando: chi legge con gli assistivi lo incontra come testo,
           e il ruolo di intestazione lo dichiara qui */
        s.setAttribute('role', 'heading');
        s.setAttribute('aria-level', '1');
        hu.appendChild(s);
    }

    /* ⚠️ Si scrive SOLO se cambia, e non è un'ottimizzazione: `textContent`
       sostituisce il nodo di testo, cioè è una modifica del DOM. La console
       osserva `body` in `subtree/childList` e a ogni modifica richiama
       `sincronizza` → scrivere ogni volta lo stesso nome faceva girare il
       ciclo all'infinito (renderer bloccato, misurato: la pagina non
       rispondeva più). */
    function sincronizzaTitolo(m) {
        var s = document.getElementById('mn-sezione');
        if (!s) return;
        var v = TITOLI[m];
        var txt = v ? t(v[0], v[1]) : '';
        if (s.textContent !== txt) s.textContent = txt;
    }

    /* ── CABLAGGIO console-bento sulla LANDING (6/8), dietro flag opt-in ─────────
       Il percorso «Cosa · A chi? · Materia» prende il posto del chip e del nome
       della sezione; «Cosa» sostituisce il rail (sceglie CREA/ELABORA/INSEGNA).
       ⚠️ Non tocca la landing DENTRO una console (INSEGNA ha già il suo percorso).
       ⚠️ Re-mount solo se lo stato cambia (firma): montaPercorso muta il DOM, e un
       rebuild a ogni `sincronizza` sarebbe lavoro inutile. */
    function _bentoApp() { try { return localStorage.getItem('mappai_console_bento_app') === '1'; } catch (e) { return false; } }
    var _sigCascata = '';
    function montaCascataLanding() {
        if (!_bentoApp() || consoleInCima()) return;
        var CB = window.MappAIConsoleBento;
        var hu = document.getElementById('header-utils');
        if (!hu || !CB || !CB.montaPercorso || !CB.specContesto) return;
        var CL = window.MappAIClasses || {};
        var m = modo();
        /* la cascata è DERIVATA dallo stato (sezione · classe · materia · allievo ·
           flag «A chi? scelto»): basta che una di queste chiavi cambi perché vada
           ricostruita. La rivelazione e le etichette-valore le calcola specContesto. */
        var sig = [m,
            (CL.getActive && CL.getActive() || {}).id || '',
            (CL.activeDiscipline && CL.activeDiscipline()) || '',
            (CL.activeStudentName && CL.activeStudentName()) || '',
            (function () { try { return localStorage.getItem('mappai_bento_achi') || ''; } catch (e) { return ''; } })()].join('|');
        if (sig === _sigCascata && hu.querySelector('.mn-briciole__l--menu')) return;
        _sigCascata = sig;
        function dopo(fn) {
            try { fn(); } catch (e) { }
            try { document.dispatchEvent(new CustomEvent('mappai-active-class-changed')); } catch (e) { }
            _sigCascata = ''; montaCascataLanding();
        }
        /* cambiare il destinatario azzera la materia (Giacomo): «se cambio la
           briciola classe, la materia si resetta e torna visibile Materia». */
        var livelli = CB.specContesto({
            onCosa: function (mm) { vaiA(mm, 0); },
            onGenerico: function () { dopo(function () { CL.setActive(''); if (CL.setActiveStudent) CL.setActiveStudent(null); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
            onClasse: function (c) { dopo(function () { CL.setActive(c.id); if (CL.setActiveStudent) CL.setActiveStudent(null); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
            onAllievo: function (p) { dopo(function () { if (CL.setActiveStudent) CL.setActiveStudent(p); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
            onMateria: function (mm) { dopo(function () { CL.setActiveDiscipline(mm); }); },
            onNuovaMateria: function () {
                var q = t('lt_cons_nuova_materia_q', 'Nome della nuova materia');
                if (window.showPrompt) return window.showPrompt(q, '', function (v) { if (v && String(v).trim()) dopo(function () { CL.setActiveDiscipline(String(v).trim()); }); });
                var v = null; try { v = window.prompt(q); } catch (e) { }
                if (v && String(v).trim()) dopo(function () { CL.setActiveDiscipline(String(v).trim()); });
            }
        });
        CB.montaPercorso(hu, { livelli: livelli }, hu);
    }

    /* Marca la forma attiva e lo stato «prima pagina». Chiamata DOPO ogni
       applyMode: è l'unico rendez-vous che ogni cambio di modalità attraversa
       (lo chiamano setMode e init), quindi basta un aggancio solo. */
    function sincronizza() {
        var m = modo();
        montaTitolo();
        sincronizzaTitolo(m);
        document.documentElement.classList.toggle(VUOTA, !m);
        /* In COSTRUISCI il contesto si dichiara nel box giallo del bento, quindi
           il chip dell'header lì sparisce: la stessa informazione in due posti
           finisce per divergere, e quello che nessuno aggiorna è quello che
           blocca la generazione. Basta una classe su <html> perché la regola
           sopravviva ai ridisegni del chip (`renderChip` ricostruisce il nodo:
           un attributo messo sull'elemento andrebbe perso).
           ⚠️ `modo()` ritorna la sezione della CONSOLE quando ce n'è una aperta:
           dentro INSEGNA il chip è il filtro della colonna e deve restare. */
        document.documentElement.classList.toggle('mn-costruisci', m === 'build');
        var forme = document.querySelectorAll('#manifesto-rail .man-forma');
        for (var i = 0; i < forme.length; i++) {
            forme[i].classList.toggle('attivo', forme[i].dataset.modo === m);
            forme[i].setAttribute('aria-current', forme[i].dataset.modo === m ? 'true' : 'false');
        }
        if (_bentoApp()) montaCascataLanding();
    }

    /* L'hero: nel disegno il marchio è al centro e sparisce entrando in una
       modalità. Servono due appigli che il markup non ha (la riga e il blocco
       del brand sono <div> senza id) — glieli do qui invece di toccare
       index.html, così il kill-switch resta una riga sola. */
    /* ⚠️ L'header va PORTATO FUORI dalla lastra, e non è un capriccio: la
       .glass-card ha `relative z-10`, quindi crea un contesto di impilamento —
       lo z-index del chip vive lì DENTRO e vale solo rispetto ai suoi fratelli.
       La banda bianca in cima (z 55, contesto radice) finiva quindi SOPRA il
       chip e il pallino, che sparivano. Misurato: presenti nel DOM a y=16,
       invisibili a schermo. Spostarlo sotto #landing-view lo riporta nel
       contesto radice, dove il suo z-index conta davvero.
       Il chip resta montato da renderChip(): quella cerca #header-utils per id
       e non sa (né deve sapere) dove sta nell'albero. */
    function sganciaHeader() {
        var hu = document.getElementById('header-utils');
        var host = document.getElementById('landing-view');
        if (hu && host && hu.parentElement !== host) host.appendChild(hu);
    }

    function marcaHero() {
        var h1 = document.querySelector('#landing-view .hero_title_main');
        if (!h1) return;
        var brand = h1.parentElement && h1.parentElement.parentElement;   /* .flex.flex-row.items-center */
        if (brand && !brand.id) brand.id = 'landing-brand';
        var riga = brand && brand.parentElement;                           /* la riga flex hero + header */
        if (riga && !riga.id) riga.id = 'landing-hero-row';
    }

    /* ⚠️ Difetto trovato misurando, e vale la pena scriverlo: avvolgere
       `MappAITeach.applyMode` NON intercetta niente. `setMode` chiama la
       funzione LOCALE del modulo, non quella esportata sull'oggetto: la patch
       si applicava a un riferimento che nessuno usa, e il rail restava spento
       col localStorage già su 'build'. (Stessa trappola per setMode, che init
       chiama internamente.)

       Il segnale vero è il DOM: qualunque strada porti a un cambio di
       modalità, applyMode toglie o mette `hidden` sui tre contenitori. Lo
       osservo lì — indipendente da come il modulo è scritto dentro. */
    function aggancia() {
        var nodi = ['build-content', 'teach-content', 'elabora-content']
            .map(function (id) { return document.getElementById(id); })
            .filter(Boolean);
        if (!nodi.length || !window.MutationObserver) return false;
        var obs = new MutationObserver(function () { try { sincronizza(); } catch (e) { } });
        nodi.forEach(function (n) { obs.observe(n, { attributes: true, attributeFilter: ['class'] }); });
        return true;
    }

    /* Gli avvii rapidi e i bottoni-fonte mostrano la sola icona finché non ci
       passi sopra (decisione di Giacomo, 4/8). L'etichetta resta nel DOM per gli
       assistivi, ma per chi vede l'informazione starebbe tutta in un glifo: il
       `title` la rende leggibile senza dover scoprire che c'è un passaggio da
       fare. ⚠️ Vale per ENTRAMBE le famiglie: i bottoni-fonte hanno lo stesso
       trucco, quindi hanno lo stesso bisogno. */
    function titoliAvvii() {
        var b = document.querySelectorAll(
            '#landing-quick-actions .btn_quick_action, #setup-form .btn_selezione_input');
        for (var i = 0; i < b.length; i++) {
            var t = (b[i].textContent || '').trim();
            if (t && !b[i].getAttribute('title')) {
                b[i].setAttribute('title', t);
                if (!b[i].getAttribute('aria-label')) b[i].setAttribute('aria-label', t);
            }
        }
    }

    function avvio() {
        if (!attivo()) return;
        document.documentElement.classList.add(CLASSE);
        if (_bentoApp()) {
            document.documentElement.classList.add('mn-bento-app');
            if (!avvio._lig) {
                avvio._lig = 1;
                document.addEventListener('mappai-active-class-changed', function () { if (_bentoApp()) { _sigCascata = ''; try { montaCascataLanding(); } catch (e) { } } });
            }
        }
        marcaHero();
        sganciaHeader();
        montaRail();
        titoliAvvii();
        aggancia();
        sincronizza();
    }

    /* Se un giorno lo si vuole spegnere dal vivo: MappAIManifesto.accendi(false). */
    function accendi(on) {
        try { localStorage.setItem(LS, on ? '1' : '0'); } catch (e) { }
        if (on) { avvio(); }
        else {
            document.documentElement.classList.remove(CLASSE, VUOTA);
            var r = document.getElementById('manifesto-rail'); if (r) r.remove();
            var h = document.getElementById('manifesto-home'); if (h) h.remove();
        }
    }

    window.MappAIManifesto = { avvio: avvio, accendi: accendi, sincronizza: sincronizza, attivo: attivo };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();

    console.log('[MappAIManifesto] stile manifesto caricato' + (attivo() ? '' : ' (spento)'));
}());
