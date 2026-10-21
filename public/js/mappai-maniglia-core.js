/* mappai-maniglia-core.js — il core della maniglia fra due colonne (0118, 21/10/26)

   La maniglia del Banco (`mappai-review.js`, Giacomo 17/9) scritta una volta sola, come
   regole pure: si trascina, spinta oltre il bordo del pannello sotto la SOGLIA (10%) il
   pannello si chiude e resta una linguetta, frecce ← → a passi del 5%, Invio e Spazio
   chiudono e riaprono, minimi in pixel per le due colonne. La preferenza è un JSON
   `{frazione, chiusa}` in localStorage, scritto solo dai gesti del docente.

   `lato` dice dove sta il pannello che si chiude: 'sinistra' (ELABORA: la fonte) o
   'destra' (il Banco con la veste). La frazione è sempre la larghezza del PANNELLO.

   Nessun DOM qui: la UI (`mappai-maniglia.js`) monta, questo file decide (invariante 4).
   Il Banco ha ancora la sua copia in linea: la migrazione è un lavoro a parte. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIManigliaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SOGLIA = 0.1;        // sotto il 10% dell'area il rilascio chiude il pannello
    const PASSO = 0.05;        // una freccia sposta il confine del 5%
    const TOLLERANZA = 3;      // px: sotto, la presa è un clic

    /* la frazione dentro i minimi; con l'area più stretta della somma dei minimi (o nascosta) nessun limite in px, come il Banco */
    function limita(frazione, larghezza, minPannello, minAltro) {
        const W = Number(larghezza) || 0, a = Number(minPannello) || 0, b = Number(minAltro) || 0;
        if (!(W > 0) || W < a + b) return frazione;
        return Math.min(Math.max(frazione, a / W), 1 - b / W);
    }

    /* la frazione del pannello per una x misurata dal bordo SINISTRO dell'area */
    function frazioneDa(x, larghezza, lato) {
        const W = Number(larghezza) || 0;
        if (!(W > 0)) return 0;
        const dalBordo = lato === 'destra' ? W - x : x;
        return dalBordo / W;
    }

    /* durante il trascinamento: sotto la soglia il pannello «sta chiudendo» */
    function chiude(frazione, soglia) {
        return frazione < (soglia == null ? SOGLIA : soglia);
    }

    /* il rilascio di un trascinamento.
       `prima` = lo stato all'inizio della presa, `frazione` = dove la si lascia.
       Chiudendo, il pannello si riaprirà alla larghezza di PRIMA, non a quella di passaggio. */
    function rilascio(prima, frazione, opz) {
        opz = opz || {};
        if (chiude(frazione, opz.soglia)) return { frazione: prima.frazione, chiusa: true };
        return { frazione: limita(frazione, opz.larghezza, opz.minPannello, opz.minAltro), chiusa: false };
    }

    /* un tasto sulla maniglia: lo stato nuovo, o null se il tasto non la riguarda (o non cambia niente).
       La freccia verso il pannello lo stringe; chiuso, lo riapre la freccia che si allontana dal suo bordo. */
    function tasto(stato, key, opz) {
        opz = opz || {};
        const stringe = opz.lato === 'destra' ? 'ArrowRight' : 'ArrowLeft';
        if (key === 'Enter' || key === ' ') return { frazione: stato.frazione, chiusa: !stato.chiusa };
        if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
        if (stato.chiusa) return key === stringe ? null : { frazione: stato.frazione, chiusa: false };
        const f = stato.frazione + (key === stringe ? -PASSO : PASSO);
        return { frazione: limita(f, opz.larghezza, opz.minPannello, opz.minAltro), chiusa: false };
    }

    /* la preferenza: un JSON rotto, assente o fuori misura torna alla predefinita */
    function leggi(testo, predefinita) {
        const base = { frazione: (predefinita > 0 && predefinita < 1) ? predefinita : 0.5, chiusa: false };
        if (!testo) return base;
        try {
            const letto = JSON.parse(testo);
            if (!letto || typeof letto !== 'object') return base;
            return {
                frazione: (typeof letto.frazione === 'number' && letto.frazione > 0 && letto.frazione < 1) ? letto.frazione : base.frazione,
                chiusa: letto.chiusa === true
            };
        } catch (e) { return base; }
    }
    function scrivi(stato) {
        return JSON.stringify({ frazione: Math.round(stato.frazione * 10000) / 10000, chiusa: !!stato.chiusa });
    }

    /* il valore per aria-valuenow: la percentuale del pannello, 0 se chiuso */
    function percentuale(stato, opz) {
        opz = opz || {};
        return stato.chiusa ? 0 : Math.round(limita(stato.frazione, opz.larghezza, opz.minPannello, opz.minAltro) * 100);
    }

    /* l'etichetta della maniglia (title e aria-label); i testi li passa chi monta, già tradotti */
    function etichetta(stato, testi) {
        testi = testi || {};
        return stato.chiusa ? (testi.apri || '') : (testi.sposta || '');
    }

    return { SOGLIA, PASSO, TOLLERANZA, limita, frazioneDa, chiude, rilascio, tasto, leggi, scrivi, percentuale, etichetta };
});
