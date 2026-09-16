/*
 * mappai-rsvp-core.js — una parola alla volta (RSVP), il nucleo puro (17/9/26)
 * ---------------------------------------------------------------------------
 * Due superfici lo usano: l'effetto «una parola alla volta» del lettore ad
 * alta voce (mappai-tts-reader.js) e la lettura veloce senza voce. Qui niente
 * DOM: le parole, la lettera di fissazione, le pause, il markup della parola.
 *
 * La lettera di fissazione (ORP, Optimal Recognition Point) e le pause sono
 * quelle di rsvp-reading di Thomas Kolmans — MIT,
 * https://github.com/thomaskolmans/rsvp-reading (src/lib/rsvp-utils.js) —
 * riscritte in ES5 senza Svelte. La lettera sta sempre allo STESSO punto dello
 * schermo: l'occhio non si sposta, è la parola che gli arriva addosso.
 *
 * UMD puro, testato in Node (tests/rsvp-core.test.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIRsvpCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var PPM = 250, MIN_PPM = 100, MAX_PPM = 700;

    var LETTERA;
    try { LETTERA = new RegExp('\\p{L}', 'u'); } catch (e) { LETTERA = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/; }

    /* La stessa pulizia del lettore ad alta voce: via i numeri di nota [1] e i
       segni markdown, spazi normalizzati, punteggiatura attaccata alla parola. */
    function pulisci(s) {
        return String(s == null ? '' : s)
            .replace(/\[\d+\]/g, ' ')
            .replace(/[*_`#]+/g, ' ')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,;:!?…»)\]])/g, '$1')
            .trim();
    }

    function parole(testo) {
        var t = pulisci(testo);
        return t ? t.split(' ') : [];
    }

    /* Le frasi come intervalli [inizio, fine) sugli indici delle parole: una
       frase finisce con la parola che chiude su . ! ? … (anche dentro » o ”). */
    var FINE_FRASE = /[.!?…]+["'”’»)\]]*$/;
    function frasi(elenco) {
        var out = [], da = 0;
        for (var i = 0; i < elenco.length; i++) {
            if (FINE_FRASE.test(elenco[i])) { out.push([da, i + 1]); da = i + 1; }
        }
        if (da < elenco.length) out.push([da, elenco.length]);
        return out;
    }
    function fraseDi(intervalli, i) {
        for (var k = 0; k < intervalli.length; k++) {
            if (i >= intervalli[k][0] && i < intervalli[k][1]) return k;
        }
        return intervalli.length ? intervalli.length - 1 : -1;
    }

    /* Quante lettere contano per l'ORP, e quale lettera (fra le lettere). */
    function _indiceOrp(parola) {
        var n = 0;
        for (var i = 0; i < parola.length; i++) if (LETTERA.test(parola.charAt(i))) n++;
        if (n <= 3) return 0;
        if (n <= 5) return 1;
        if (n <= 9) return 2;
        if (n <= 12) return 3;
        return Math.floor(Math.log(n - 1) / Math.LN2) + 1;
    }
    /* L'indice del CARATTERE, saltando la punteggiatura davanti («Cai → C). */
    function orp(parola) {
        parola = String(parola || '');
        if (!parola) return 0;
        var voluta = _indiceOrp(parola), contate = 0;
        for (var i = 0; i < parola.length; i++) {
            if (LETTERA.test(parola.charAt(i))) {
                if (contate === voluta) return i;
                contate++;
            }
        }
        return Math.min(voluta, parola.length - 1);
    }
    function dividi(parola) {
        parola = String(parola || '');
        var i = orp(parola);
        return { prima: parola.slice(0, i), fuoco: parola.charAt(i), dopo: parola.slice(i + 1) };
    }

    /* Millisecondi di una parola: 60000/ppm, il doppio a fine frase (e su ; :),
       una volta e mezza sulla virgola. */
    function pausa(parola, ppm) {
        var base = 60000 / ((ppm > 0) ? ppm : PPM);
        var p = String(parola || '');
        if (/[.!?;:…]["'”’»)\]]*$/.test(p)) return base * 2;
        if (/,["'”’»)\]]*$/.test(p)) return base * 1.5;
        return base;
    }

    function _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* Tre colonne 1fr · auto · 1fr: la lettera di fuoco sta sempre al centro. */
    function html(parola) {
        var d = dividi(parola);
        return '<span class="mai-rsvp__w"><span class="mai-rsvp__b">' + _esc(d.prima) +
            '</span><span class="mai-rsvp__o">' + _esc(d.fuoco) +
            '</span><span class="mai-rsvp__a">' + _esc(d.dopo) + '</span></span>';
    }

    return {
        PPM: PPM, MIN_PPM: MIN_PPM, MAX_PPM: MAX_PPM,
        pulisci: pulisci, parole: parole, frasi: frasi, fraseDi: fraseDi,
        orp: orp, dividi: dividi, pausa: pausa, html: html
    };
}));
