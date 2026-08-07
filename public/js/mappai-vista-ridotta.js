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

    function attiva() { try { return localStorage.getItem(LS) === '1'; } catch (e) { return false; } }

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
        if (window.safeCreateIcons) window.safeCreateIcons();
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
            return r;
        };
    }

    document.addEventListener('mappai-active-class-changed', armaLivelloSePreset);
    document.addEventListener('mappai-profili-cambiati', armaLivelloSePreset);

    function avvio() {
        agganciaSetMode();
        applica(attiva());
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();

    window.MappAIRidotta = {
        attiva: attiva, accendi: accendi, inverti: inverti,
        sincronizza: sincronizzaGenere, aggiorna: aggiornaSblocchi, passo: _passo
    };
    console.log('[MappAIRidotta] vista ridotta di COSTRUISCI caricata');
})();
