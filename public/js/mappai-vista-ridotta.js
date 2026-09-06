/*
 * mappai-vista-ridotta.js — COSTRUISCI in forma ridotta (3/8/26)
 * ---------------------------------------------------------------------------
 * Una vista di COSTRUISCI con dentro solo quello che serve a fare una mappa da
 * una scheda: carica il PDF, scegli MM o KG, dai il tema (o il numero di nodi),
 * genera. Tutto il resto — le altre fonti, le macro-aree scritte a mano, il
 * focus, le lenti, le impostazioni di generazione, la stima dei costi — resta
 * nel codice ma sparisce dallo schermo.
 *
 * Si accende e si spegne con SHIFT+CTRL+ L,K,J,H e SI RICORDA
 * (`localStorage mappai_vista_ridotta`).
 *
 * ⚠️ Quella combo attivava la «modalità studente» (`toggleStudentMode`), che è
 * un'altra cosa: nascondeva il generatore INTERO e sostituiva due prompt con le
 * loro versioni semplificate. Le due non potevano convivere — si contendono
 * `#setup-form`, che una nasconde e l'altra mostra in forma ridotta. Decisione
 * di Giacomo (3/8): la vista ridotta prende la combo, la modalità studente va in
 * pensione. `window.toggleStudentMode` resta esposta (console, e i rami
 * `appState.studentMode` sparsi nei moduli restano innocui: il flag non si
 * accende più da nessuna parte).
 *
 * Nasconde con una CLASSE su <html> (`mappai-ridotta`), non toccando gli stili
 * uno per uno: accendere e spegnere è una riga, e niente resta appeso.
 *
 * Namespace: window.MappAIRidotta. Caricare DOPO mappai-live-classes.js
 * (legge il preset di taratura del contesto attivo).
 */
(function () {
    'use strict';
    var LS = 'mappai_vista_ridotta';
    var CLASSE = 'mappai-ridotta';
    var t = function (k, f) { return window.t ? window.t(k, f) : f; };

    /* Dal 7/9 la vista ridotta è il DEFAULT (Giacomo: un'installazione nuova mostrava i
       riquadri scuri, che i tester non devono vedere): assente o '1' = ridotta, '0' = estesa. */
    function attiva() { try { return localStorage.getItem(LS) !== '0'; } catch (e) { return true; } }

    /* ── I default della vista ridotta ────────────────────────────────────────
       Qui non si sceglie: le impostazioni di generazione non sono a schermo,
       quindi le mette la vista. Sono le stesse leve dei bottoni nascosti, non
       una seconda strada — così uscendo dalla vista ridotta si ritrova lo stato
       che la vista ha impostato, senza sorprese. */
    function applicaDefault() {
        try { if (window.setMultiPassMode) window.setMultiPassMode(true, true); } catch (e) { }
        /* «Adattiva» = la logica di triage che sceglie la profondità dal tipo di
           scheda (`setMMLogic('triage')`). Con le impostazioni nascoste è l'unico
           modo perché la profondità resti sensata senza che nessuno la scelga. */
        try { if (window.setMMLogic) window.setMMLogic('triage', true); } catch (e) { }
        try { if (window.setAutoDepth) window.setAutoDepth(true, true); } catch (e) { }
        armaLivelloSePreset();
    }

    /* «Adatta al livello» acceso da solo quando il contesto attivo dichiara il
       preset SEMPLICE (BES/DSA) — anche senza note scritte a mano: il preset da
       solo dice già che a quell'allievo o a quella classe il testo va calibrato.
       Se il contesto non è quello, non si tocca: resta la scelta dell'utente. */
    function presetSemplice() {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var up = a && a.userProfile;
            if (up && up.nickname) return up.register === 'semplice';
            var CL = window.MappAIClasses;
            var c = (CL && CL.getActive) ? CL.getActive() : null;
            return !!(c && c.register === 'semplice');
        } catch (e) { return false; }
    }
    function armaLivelloSePreset() {
        if (!attiva() || !presetSemplice()) return;
        try {
            if (window.MappAITune && window.MappAITune.armLevel) window.MappAITune.armLevel();
            var cb = document.getElementById('level-tune-toggle');
            if (cb && !cb.disabled) cb.checked = true;
        } catch (e) { }
    }

    /* Il campo del tema e lo slider dei nodi si escludono: uno per genere di
       mappa. Fuori dalla vista ridotta li governa `setMode`, che qui non basta
       perché lo slider vive dentro il riquadro delle impostazioni nascosto. */
    function sincronizzaGenere() {
        if (!attiva()) return;
        var kg = false;
        try {
            var el = document.getElementById('extraction-mode');
            kg = (el && el.value === 'kg') ||
                (window.appState && window.appState.extractionMode === 'kg');
        } catch (e) { }
        var slider = document.getElementById('step-kg-density-container');
        if (slider) slider.classList.toggle('hidden', !kg);
        /* Con lo slider nascosto (MindMap) il riquadro dello step 4 resta vuoto:
           altezza 0 ma coi suoi margini, cioè ~96px di aria fra il tema e i
           bottoni (misurati).
           ⚠️ Qui si spegne con uno STILE INLINE `!important`, non con una regola
           nel foglio: né `:has()` né una classe dedicata vincevano su quel
           `display:flex` — in un CSS con 700+ `!important` la cascata non è
           prevedibile a tavolino. Provato: inline con priorità → `none`. */
        /* ⚠️ Il riquadro si riaccende in KG **solo se lo slider è ancora dentro**.
           Con la veste manifesto lo slider è stato spostato nel box del genere
           (`#mn-genere-dx`), quindi qui non resta niente da mostrare: riaccenderlo
           significava un contenitore alto ZERO che consuma comunque il gap del
           form — 14px in più fra il genere e le opzioni, e solo passando a
           Knowledge Graph. Un item alto zero conta come item: è la terza volta che
           questa trappola si presenta (§6). */
        var box = document.getElementById('step-gen-settings-container');
        var sliderDentro = !!(slider && box && box.contains(slider));
        if (box) {
            if (kg && sliderDentro) box.style.removeProperty('display');
            else box.style.setProperty('display', 'none', 'important');
        }
    }

    /* ── Passi che si sbloccano ───────────────────────────────────────────────
       Senza i titoli numerati, l'ordine lo dice l'OPACITÀ: quello che non si può
       ancora fare sta al 15% e non risponde al tocco. Tre stati:
         1  carica il PDF            (solo il bottone delle fonti è vivo)
         2  scegli MM o KG           (sbloccato appena c'è una fonte)
         3  genera                   (sbloccato quando il grafo è scelto E ha
                                      il suo dato: il tema per MM, lo slider
                                      per KG — che un valore ce l'ha già)
       Lo stato si RICALCOLA dai dati, non si accumula: togliendo l'ultima fonte
       si torna indietro da soli, senza una macchina a stati da tenere allineata. */
    function _fonti() {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var s = (a && a.sources) || [];
            /* una riga appena aggiunta NON è una fonte: conta solo quella che
               porta davvero un file o del testo */
            return s.filter(function (x) {
                return x && (x.file || (x.content && String(x.content).trim()));
            }).length;
        } catch (e) { return 0; }
    }
    function _kgScelto() {
        try {
            var el = document.getElementById('extraction-mode');
            if (el) return el.value === 'kg';
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            return !!(a && a.extractionMode === 'kg');
        } catch (e) { return false; }
    }
    function _passo() {
        if (!_fonti()) return 1;
        if (_kgScelto()) return 3;                       // lo slider ha già un valore
        var root = document.getElementById('root-node-name');
        return (root && String(root.value).trim()) ? 3 : 2;
    }

    /* Ogni voce: [id dell'elemento, passo dal quale è vivo] */
    /* ⚠️ MM/KG, il tema centrale e lo slider dei nodi NON sono più fra i passi
       bloccati (5/8, decisione di Giacomo): sono **sempre visibili e attivi**.
       Con la veste manifesto stanno in una riga loro (MM/KG a una colonna, il tema
       o lo slider a tre) e sbiadirli al 15% prima del file faceva sembrare rotta
       metà schermata — mentre scegliere il genere di mappa PRIMA di caricare la
       fonte è legittimo, e non costa niente.
       Resta il gate su ciò che spende: i due bottoni che generano. */
    var PASSI = [
        ['generate-materials-btn', 3], ['generate-btn', 3]
    ];
    function aggiornaSblocchi() {
        if (!attiva()) return;
        var p = _passo();
        PASSI.forEach(function (v) {
            var el = document.getElementById(v[0]);
            if (el) el.classList.toggle('vr-bloccato', p < v[1]);
        });
        /* in ridotta l'altezza cambia con le fonti caricate: il riferimento va
           rimisurato, o il margine resta quello di una schermata più corta */
        margineCrea();
    }

    /* Gli agganci: le fonti si aggiungono costruendo HTML (nessuna funzione di
       render da cui passare), quindi si guarda il contenitore invece di sperare
       che qualcuno ci avvisi. */
    var _osservatore = null;
    function osserva() {
        var cont = document.getElementById('sources-container');
        if (cont && !_osservatore && typeof MutationObserver !== 'undefined') {
            _osservatore = new MutationObserver(aggiornaSblocchi);
            _osservatore.observe(cont, { childList: true, subtree: true });
        }
        if (document._vrLegato) return;
        document._vrLegato = true;
        /* `change` prende la scelta del file, `input` il tema che si scrive */
        document.addEventListener('change', function (e) {
            if (e.target && e.target.closest && e.target.closest('#sources-container')) setTimeout(aggiornaSblocchi, 0);
        });
        document.addEventListener('input', function (e) {
            if (e.target && e.target.id === 'root-node-name') aggiornaSblocchi();
        });
    }

    function applica(on) {
        var html = document.documentElement;
        html.classList.toggle(CLASSE, !!on);
        if (on) { applicaDefault(); sincronizzaGenere(); osserva(); aggiornaSblocchi(); }
        else {
            /* uscendo, lo stile inline messo qui va tolto: altrimenti il riquadro
               delle impostazioni resterebbe spento anche nella vista completa */
            var box = document.getElementById('step-gen-settings-container');
            if (box) box.style.removeProperty('display');
            /* e nessun pezzo deve restare al 15%: nella vista completa i passi
               non esistono, tutto è raggiungibile da subito */
            PASSI.forEach(function (v) {
                var el = document.getElementById(v[0]);
                if (el) el.classList.remove('vr-bloccato');
            });
        }
        margineCrea();
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    /* ── CREA: il bordo superiore lo detta la vista RIDOTTA (Giacomo, 8/8) ────
       Il blocco si centra sulla vista RIDOTTA; la vista ESTESA parte dallo
       STESSO bordo e cresce verso il basso (scorre). Così espandendo, il blocco
       non «salta» su.
       ⚠️ Si tiene in cache l'ALTEZZA della ridotta, NON il margine: il margine
       dipende dalla finestra, quindi conservarlo (primo tentativo) dava un
       valore sbagliato appena la finestra cambiava — ed era la ragione per cui
       il blocco finiva spinto in basso. Dall'altezza il margine si ricalcola
       sulla finestra corrente, anche stando in estesa.
       ⚠️ La misura si prende SOLO in vista ridotta e SOLO da
       `getBoundingClientRect`, che forza il ricalcolo del layout: così non si
       legge un'altezza «a metà transizione», l'altro difetto del primo giro. */
    /* L'altezza della TOPBAR non è un numero scritto qui: si legge dal token
       `--mn-topbar-h` (mappai-stile-manifesto.css), che governa anche la banda
       della landing e la testata delle console. Accorciando la barra, la zona
       utile e quindi la centratura del blocco si adeguano da sole — senza questo
       resterebbe un 76 fisso e il blocco sarebbe centrato su una barra che non
       esiste più. */
    function _testata() {
        try {
            var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mn-topbar-h'));
            if (v > 0) return Math.round(v);
        } catch (e) { }
        return 76;
    }
    var FONDO = 24;
    /* ⚠️ NESSUNA CACHE dell'altezza di riferimento, e non è una semplificazione
       gratuita: tenerla in una variabile la riempiva SOLO passando dalla vista
       ridotta — che è spenta di default, e «Home» ricarica la pagina azzerando
       tutto. Nelle sessioni in cui non ci si passava, il blocco si ricentrava su
       SÉ STESSO a ogni ricalcolo e il bordo si spostava mentre si lavorava
       (fonte caricata, MM↔KG): esattamente il salto che questa funzione deve
       togliere. In più la cache si invalidava sulla sola altezza della finestra,
       mai sulla larghezza, da cui l'altezza del bento dipende. */
    try { localStorage.removeItem('mappai_crea_h_ridotta'); } catch (e) { }   /* residuo di una versione che la conservava */

    function _modoBuild() {
        var b = document.getElementById('build-content');
        return b && !b.classList.contains('hidden');
    }
    /* ⚠️ SI CENTRA IL BENTO, NON LA LASTRA. `.glass-card` non è «il blocco»: in
       cima porta ~120px di spazio morto (il contenitore dell'header, che il JS
       svuota spostando `#header-utils` fuori dalla lastra, la barra delle
       modalità col figlio nascosto, e il suo padding), e in fondo porta
       `#landing-quick-actions` e `#landing-meta-links` — contenuto vero che col
       bento non c'entra. Centrando la lastra si centra la somma di quelle masse,
       e il bento finisce fuori centro. */
    function _bento() {
        return document.getElementById('mn-bento')
            || document.getElementById('generation-details-card')
            || document.getElementById('build-content');
    }
    /* ⚠️ L'ULTIMO pezzo del blocco NON è il bento: sotto di lui restano i tre
       avvii (`#landing-quick-actions`, +80px: 14 di passo e 66 di bottone) e il
       contenitore dei link. Sono visibili in ENTRAMBE le viste, e l'occhio li
       legge come parte dello stesso blocco — centrando il solo bento, il gruppo
       che si vede finiva più in basso del centro. Si prende il primo che c'è
       davvero, con ripiego sul bento. */
    function _ultimo() {
        var ids = ['landing-meta-links', 'landing-quick-actions'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (!el) continue;
            try { if (getComputedStyle(el).display === 'none') continue; } catch (e) { }
            return el;
        }
        return _bento();
    }
    /* la landing può essere NASCOSTA pur restando `#build-content` senza
       `hidden`: aprendo una mappa si spegne `#landing-view` (display:none) senza
       toccare la modalità. Lì ogni misura vale 0 e produrrebbe un margine
       enorme, che poi sopravvive al rientro (che non sempre ricarica la pagina). */
    function _landingViva() {
        var lv = document.getElementById('landing-view');
        if (!lv) return null;
        try { if (getComputedStyle(lv).display === 'none') return null; } catch (e) { }
        return lv;
    }
    /* L'altezza del GRUPPO VISIBILE nello stato corrente: dal bordo alto del
       bento al bordo basso dell'ultimo pezzo. Con i `getBoundingClientRect` i
       margini fuori dal gruppo restano esclusi per costruzione — niente margini
       da sommare a mano. */
    function _hGruppo() {
        var b = document.getElementById('mn-bento');
        if (!b) return 0;
        var u = _ultimo() || b;
        return Math.round(u.getBoundingClientRect().bottom - b.getBoundingClientRect().top);
    }
    /* L'altezza che il gruppo avrebbe IN VISTA RIDOTTA, misurata adesso.
       ⚠️ Se la vista attiva è l'estesa, la ridotta si misura applicando la sua
       classe e leggendo NELLO STESSO GIRO: la lettura forza il ricalcolo del
       layout, ma il ridisegno avviene solo a fine giro — quando la classe è già
       stata tolta. Quindi non si vede nessun lampeggio, e il riferimento è
       sempre quello VERO di questa finestra, non uno scatto vecchio. */
    function _hRiferimento() {
        var html = document.documentElement;
        if (html.classList.contains(CLASSE)) return _hGruppo();
        html.classList.add(CLASSE);
        var h;
        try { h = _hGruppo(); } finally { html.classList.remove(CLASSE); }
        return h;
    }
    function margineCrea() {
        var html = document.documentElement;
        if (!html.classList.contains('manifesto') || !_modoBuild()) return;
        var lv = _landingViva(); if (!lv) return;
        /* Finché il bento VERO non c'è non si scrive niente: al boot
           `#build-content` non ha ancora `hidden` (glielo mette l'init della
           landing) e misurare un contenitore sostitutivo — molto più alto —
           darebbe un margine sbagliato che poi lampeggia quando il bento compare.
           Meglio lasciare il valore di ripiego del CSS. */
        var b = document.getElementById('mn-bento'); if (!b) return;
        var rb = b.getBoundingClientRect();
        if (rb.height <= 0) return;              /* non renderizzato: misura senza senso */
        var rif = _hRiferimento();
        if (rif <= 0) return;
        /* `--crea-top` governa il padding del CONTENITORE, ma a dover finire nel
           punto giusto è l'inizio del GRUPPO (il bento): si sottrae lo spazio
           morto che li separa — misurato, non stimato, perché cambia con la
           veste e con la vista. */
        var testata = _testata();
        var padOra = parseFloat(getComputedStyle(lv).paddingTop) || 0;
        var morto = Math.round(rb.top - lv.getBoundingClientRect().top - padOra);
        var zona = window.innerHeight - testata - FONDO;
        var topBento = testata + Math.max(0, Math.round((zona - rif) / 2));
        html.style.setProperty('--crea-top', Math.max(0, topBento - morto) + 'px');
    }
    /* ⚠️ IL PUNTO DELICATO: QUANDO si misura.
       `avvio()` gira a DOMContentLoaded, ma il BENTO si monta dopo (i
       `setTimeout` di costruisci-manifesto). Misurando lì si prende l'altezza di
       una schermata ancora senza bento — molto più corta del vero — e da quella
       esce un margine superiore troppo grande. Era il difetto: nessuno
       rimisurava dopo che il bento compariva, e il valore restava per tutta la
       sessione (peggio: finiva anche in localStorage e sopravviveva al riavvio).
       L'osservatore risolve senza indovinare tempi: appena la lastra cambia
       altezza — bento montato, fonte caricata, MM↔KG — il riferimento si
       aggiorna e il margine si ricalcola.
       Nessun rientro: `margineCrea` scrive una variabile su <html> che governa
       il `padding-top` del CONTENITORE, non l'altezza della lastra osservata; e
       comunque si agisce solo quando l'altezza è davvero cambiata. */
    var _hVista = -1;
    function osservaLastra() {
        if (typeof ResizeObserver === 'undefined') return;
        var card = document.querySelector('#landing-view .glass-card');
        if (!card || card._vrRO) return;
        card._vrRO = new ResizeObserver(function () {
            var h = Math.round(card.getBoundingClientRect().height);
            if (h === _hVista) return;
            _hVista = h;
            margineCrea();
        });
        card._vrRO.observe(card);
    }
    /* ⚠️ IL DIFETTO PRINCIPALE ERA QUI: si entra in COSTRUISCI e nessuno
       ricalcola. `agganciaSetMode()` avvolge `window.setMode`, che è il
       selettore MindMap/KG (mappai-ui-canvas.js) — NON `MappAITeach.setMode`,
       che è quella che toglie `hidden` a `#build-content`. Quindi al momento
       vero dell'ingresso restava il valore misurato al boot (senza bento), e le
       reti a tempo erano già scadute da un pezzo.
       Guardare l'ATTRIBUTO invece della funzione copre ogni strada: rail,
       briciola «Cosa», segnalibro, ritorno da una mappa. */
    function osservaModo() {
        if (typeof MutationObserver === 'undefined') return;
        var b = document.getElementById('build-content');
        if (!b || b._vrModo) return;
        b._vrModo = true;
        new MutationObserver(function () {
            margineCrea();
            /* entrando in COSTRUISCI il bento può montarsi subito dopo: una
               seconda misura poco più tardi coglie l'altezza definitiva */
            setTimeout(margineCrea, 350);
        }).observe(b, { attributes: true, attributeFilter: ['class'] });
    }
    /* la finestra cambia → il margine si ricalcola dalla stessa altezza di
       riferimento (per questo si conserva l'altezza e non il margine) */
    window.addEventListener('resize', margineCrea);
    /* ⚠️ RETI, perché l'osservatore da solo non basta: le notifiche del
       ResizeObserver NON arrivano a finestra non in primo piano (stessa trappola
       del rAF, già vista in questo progetto) — quindi in quello stato il margine
       resterebbe quello misurato al boot, che è il difetto da cui siamo partiti.
       Questi ricalcoli non «indovinano» il momento giusto: ognuno rimisura
       l'altezza CORRENTE, quindi basta che uno cada dopo il montaggio del bento.
       `fonts.ready` c'è perché il carattere che arriva cambia l'altezza del testo
       e quindi della lastra. */
    function reti() {
        [300, 800, 1500, 2500].forEach(function (ms) { setTimeout(margineCrea, ms); });
        window.addEventListener('load', margineCrea);
        try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(margineCrea); } catch (e) { }
    }

    function accendi(on, silenzioso) {
        var v = !!on;
        try { localStorage.setItem(LS, v ? '1' : '0'); } catch (e) { }
        applica(v);
        if (!silenzioso && window.showToast) {
            window.showToast(v
                ? t('vr_on', 'Vista ridotta attiva: solo PDF, tipo di mappa e genera.')
                : t('vr_off', 'Vista completa ripristinata.'), 'success');
        }
    }
    function inverti() { accendi(!attiva()); }

    /* Il genere di mappa si sceglie con `setMode`, che sta in app.js: qui ci si
       aggancia dopo, invece di duplicarne la logica. */
    var _setMode = null;
    function agganciaSetMode() {
        if (_setMode || typeof window.setMode !== 'function') return;
        _setMode = window.setMode;
        window.setMode = function () {
            var r = _setMode.apply(this, arguments);
            sincronizzaGenere();
            aggiornaSblocchi();
            margineCrea();
            return r;
        };
    }

    document.addEventListener('mappai-active-class-changed', armaLivelloSePreset);
    document.addEventListener('mappai-profili-cambiati', armaLivelloSePreset);

    function avvio() {
        agganciaSetMode();
        applica(attiva());
        osservaLastra();
        osservaModo();
        reti();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();

    window.MappAIRidotta = {
        attiva: attiva, accendi: accendi, inverti: inverti,
        sincronizza: sincronizzaGenere, aggiorna: aggiornaSblocchi, passo: _passo
    };
    console.log('[MappAIRidotta] vista ridotta di COSTRUISCI caricata');
})();
