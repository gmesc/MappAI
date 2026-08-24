/* tools/demo-video/domande-core.js — le domande aperte, lette dai PDF veri (23/8/26).
 *
 * Logica PURA (inv. 4): riceve il TESTO di un PDF di domande aperte (quello che dà
 * `pdftotext -layout`) e ne ricava le domande con la loro AREA. Serve alle slide comparative
 * della scena 6: la stessa area letta dai sette angoli.
 *
 * Perché dai PDF e non da una lista scritta a mano: le slide devono mostrare le domande VERE
 * del docente, non un esempio inventato — è la differenza fra una pubblicità e una bugia.
 * ⚠️ Le domande aperte non stanno nei `set-*.json` del vault (quelli sono `studySets`, cioè
 * «ciò che il player sa giocare»): la loro fonte su disco è il PDF (inv. 6, il nome mente).
 *
 * Forma del PDF (misurata sui file del 17/8):
 *     DOMANDA 1   Circuiti Elettrici Base
 *     Spiega perché un circuito deve essere chiuso…
 * e un'area può essere doppia: «Circuiti Elettrici Base   +   Grandezze Elettriche Misura».
 */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MappAIDomande = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const RIGA_DOMANDA = /^\s*DOMANDA\s+(\d+)\s{2,}(.+?)\s*$/;
    /* il piè di pagina del foglio: non è testo di domanda */
    const PIEDE = /^\s*MappAI\s+·/;

    /** normalizza gli spazi (il layout del PDF ne mette a manciate) */
    function pulisci(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

    /** «A   +   B» → ['A', 'B'] */
    function aree(intestazione) {
        return pulisci(intestazione).split(/\s+\+\s+/).map(pulisci).filter(Boolean);
    }

    /** testo di un PDF → [{ n, aree, testo }] */
    function leggi(testo) {
        const righe = String(testo || '').split('\n');
        const fuori = [];
        let corrente = null;
        for (const riga of righe) {
            const m = riga.match(RIGA_DOMANDA);
            if (m) {
                if (corrente) fuori.push(corrente);
                corrente = { n: Number(m[1]), aree: aree(m[2]), testo: '' };
                continue;
            }
            if (!corrente) continue;
            if (PIEDE.test(riga)) continue;
            const t = pulisci(riga);
            if (!t) continue;
            corrente.testo = corrente.testo ? corrente.testo + ' ' + t : t;
        }
        if (corrente) fuori.push(corrente);
        return fuori.filter((d) => d.testo);
    }

    /** l'area più ricorrente fra più angoli: quella su cui le slide si confrontano.
     *  `perAngolo` = { angolo: [domande] } */
    function areaComune(perAngolo) {
        const conto = new Map();
        Object.keys(perAngolo).forEach((ang) => {
            /* un'area conta UNA volta per angolo: cerchiamo quella presente ovunque, non quella
               che un angolo solo ripete venti volte */
            const viste = new Set();
            (perAngolo[ang] || []).forEach((d) => d.aree.forEach((a) => viste.add(a)));
            viste.forEach((a) => conto.set(a, (conto.get(a) || 0) + 1));
        });
        let vinta = null, max = 0;
        conto.forEach((n, a) => { if (n > max || (n === max && vinta && a.length < vinta.length)) { max = n; vinta = a; } });
        return { area: vinta, angoli: max };
    }

    /** una domanda per angolo sull'area data; salta gli angoli che non ce l'hanno.
     *  Sceglie la domanda PIÙ CORTA: in una slide, una riga lunga si legge male. */
    function confronto(perAngolo, area, ordine) {
        const angoli = ordine || Object.keys(perAngolo);
        const fuori = [];
        angoli.forEach((ang) => {
            const cand = (perAngolo[ang] || []).filter((d) => d.aree.indexOf(area) >= 0);
            if (!cand.length) return;
            const scelta = cand.slice().sort((a, b) => a.testo.length - b.testo.length)[0];
            fuori.push({ angolo: ang, testo: scelta.testo, aree: scelta.aree });
        });
        return fuori;
    }

    return { leggi, aree, areaComune, confronto, pulisci };
}));
