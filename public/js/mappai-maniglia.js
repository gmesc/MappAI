/* mappai-maniglia.js — la maniglia fra due colonne, montata sul DOM (0118, 21/10/26)

   `MappAIManiglia.monta(opz)` dà a un elemento i gesti della maniglia del Banco:
   trascinare (con la cattura del puntatore), chiudere il pannello oltre il suo bordo sotto
   la soglia, riaprirlo con un clic sulla linguetta, frecce ← → e Invio/Spazio da tastiera.
   Le regole stanno in `mappai-maniglia-core.js`; qui si applicano classi, variabile CSS,
   ARIA e `inert`. L'aspetto lo decide chi monta, col suo CSS:
     contenitore.is-pannello-chiuso · contenitore.sta-chiudendo · contenitore.is-trascinando
     · contenitore.is-montando (un istante, al montaggio: le transizioni vanno spente)
     e la variabile `opz.variabile` (es. `--elab-fonte-w`) con la larghezza del pannello in %.

   opz = { contenitore, pannello, maniglia, chiave, variabile, lato: 'sinistra'|'destra',
           minPannello, minAltro, soglia, predefinita, etichette: { apri, sposta }, stretta }
   `stretta` = una media query sotto la quale le colonne sono impilate (es. '(max-width: 900px)'):
   lì il pannello non si chiude e non diventa `inert`.

   Montare due volte la stessa maniglia non raddoppia i gestori: torna il controllo che c'è.
   Chi ridisegna il DOM (ELABORA riscrive `#ec-src` a ogni `render`) rimonta sull'elemento
   nuovo; lo stato vive nella preferenza, non nel DOM. */
(function () {
    'use strict';
    const C = () => window.MappAIManigliaCore;
    const memoria = {};   // la preferenza per chiave, se localStorage non risponde: vale per questa apertura
    /* I controlli vivi, per la media query `stretta`: UN ascoltatore per modulo, non uno per montaggio (ELABORA rimonta a
       ogni `render` senza smontare). Al cambio di larghezza si riapplicano quelli ancora nel documento, gli altri si lasciano. */
    const vivi = new Set();
    let mqAscoltate = {};
    function ascoltaStretta(q) {
        if (!q || mqAscoltate[q] || !window.matchMedia) return;
        try {
            const mq = window.matchMedia(q);
            const f = () => vivi.forEach(k => { if (k.maniglia.isConnected === false) vivi.delete(k); else k.applica(); });
            if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
            mqAscoltate[q] = true;
        } catch (e) { /* senza media query: si riapplica al gesto */ }
    }

    function leggiPref(chiave, predefinita) {
        let testo = null;
        try { testo = localStorage.getItem(chiave); } catch (e) { testo = null; }
        if (testo == null && memoria[chiave]) testo = memoria[chiave];
        return C().leggi(testo, predefinita);
    }
    function scriviPref(chiave, stato) {
        const testo = C().scrivi(stato);
        memoria[chiave] = testo;
        try { localStorage.setItem(chiave, testo); } catch (e) { /* resta in memoria */ }
    }

    function monta(opz) {
        if (!opz || !opz.contenitore || !opz.pannello || !opz.maniglia || !C()) return null;
        const man = opz.maniglia;
        if (man._mappaiManiglia) { man._mappaiManiglia.applica(); return man._mappaiManiglia; }
        const K = C(), cont = opz.contenitore, pan = opz.pannello;
        const lato = opz.lato === 'destra' ? 'destra' : 'sinistra';
        const soglia = opz.soglia == null ? K.SOGLIA : opz.soglia;
        const testi = opz.etichette || {};
        const misure = () => ({ larghezza: cont.clientWidth || 0, minPannello: opz.minPannello || 0, minAltro: opz.minAltro || 0, lato, soglia });
        const stretta = () => { try { return !!(opz.stretta && window.matchMedia && window.matchMedia(opz.stretta).matches); } catch (e) { return false; } };
        let stato = leggiPref(opz.chiave, opz.predefinita);

        man.tabIndex = 0;
        man.setAttribute('role', 'separator');
        man.setAttribute('aria-orientation', 'vertical');
        man.setAttribute('aria-valuemin', '0');
        man.setAttribute('aria-valuemax', '100');

        function applica() {
            const m = misure(), chiusa = stato.chiusa && !stretta();
            cont.classList.toggle('is-pannello-chiuso', chiusa);
            if (opz.variabile) cont.style.setProperty(opz.variabile, chiusa ? '0%' : (K.limita(stato.frazione, m.larghezza, m.minPannello, m.minAltro) * 100).toFixed(2) + '%');
            pan.inert = chiusa;
            const testo = K.etichetta({ chiusa }, testi);
            man.title = testo; man.setAttribute('aria-label', testo);
            man.setAttribute('aria-valuenow', String(K.percentuale({ frazione: stato.frazione, chiusa }, m)));
        }
        function salva() { scriviPref(opz.chiave, stato); }

        let presa = null;
        function giu(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            presa = { x: e.clientX, mosso: false, chiude: false, id: e.pointerId, prima: { frazione: stato.frazione, chiusa: stato.chiusa }, ultima: stato.frazione };
            try { man.setPointerCapture(e.pointerId); } catch (err) { /* senza cattura funziona lo stesso dentro la maniglia */ }
            cont.classList.add('is-trascinando');
        }
        function muovi(e) {
            if (!presa || presa.id !== e.pointerId) return;
            if (Math.abs(e.clientX - presa.x) > K.TOLLERANZA) presa.mosso = true;
            if (!presa.mosso) return;
            const b = cont.getBoundingClientRect();
            const f = K.frazioneDa(e.clientX - b.left, b.width, lato);
            presa.ultima = f;
            presa.chiude = K.chiude(f, soglia);
            cont.classList.toggle('sta-chiudendo', presa.chiude);
            if (!presa.chiude) { stato = { frazione: f, chiusa: false }; applica(); }
        }
        function lascia() {
            if (!presa) return;
            const p = presa; presa = null;
            cont.classList.remove('is-trascinando', 'sta-chiudendo');
            if (!p.mosso) {
                if (!p.prima.chiusa) return;   // clic sulla maniglia aperta: niente
                stato = { frazione: p.prima.frazione, chiusa: false };   // clic sulla linguetta: riapre
            } else {
                const m = misure();
                stato = K.rilascio(p.prima, p.ultima, m);
            }
            applica(); salva();
        }
        function tastiera(e) {
            const nuovo = K.tasto(stato, e.key, misure());
            if (!nuovo) return;
            e.preventDefault();
            stato = nuovo; applica(); salva();
        }
        man.addEventListener('pointerdown', giu);
        man.addEventListener('pointermove', muovi);
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => man.addEventListener(n, lascia));
        man.addEventListener('keydown', tastiera);

        const controllo = {
            applica, maniglia: man,
            stato: () => ({ frazione: stato.frazione, chiusa: stato.chiusa }),
            smonta() {
                man.removeEventListener('pointerdown', giu);
                man.removeEventListener('pointermove', muovi);
                ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => man.removeEventListener(n, lascia));
                man.removeEventListener('keydown', tastiera);
                vivi.delete(controllo);
                delete man._mappaiManiglia;
            }
        };
        man._mappaiManiglia = controllo;
        vivi.add(controllo); ascoltaStretta(opz.stretta);
        /* Il primo `applica` NON si anima. Chi ridisegna (ELABORA a ogni `render`) crea un contenitore nuovo che nasce con la
           larghezza di riserva del CSS; `misure()` legge `clientWidth` e fissa lo stile lì, e il valore vero arriverebbe con la
           transizione di 0,28 s: la colonna scivolerebbe a ogni gesto, e una presa in quel momento cadrebbe fuori dalla maniglia
           (misurato in Electron, 21/10). `is-montando` spegne le transizioni (CSS di chi monta); la lettura di `offsetWidth`
           fissa il valore nuovo prima di riaccenderle. */
        cont.classList.add('is-montando');
        applica();
        void cont.offsetWidth;
        cont.classList.remove('is-montando');
        return controllo;
    }

    window.MappAIManiglia = { monta };
})();
