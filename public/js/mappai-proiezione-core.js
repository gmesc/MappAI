/* =========================================================================
   mappai-proiezione-core.js — la GEOMETRIA della proiezione (20/8 notte)

   La matematica della vista «Proietta» di INSEGNA: zoom sul puntatore, pan
   coi bordi che non si perdono, «adatta» che fa entrare l'immagine nei due
   assi, la scala dei corpi per il testo proiettato. PURA (invariante 4):
   niente DOM — il modulo UI applica `transform` e ascolta gli eventi.

   Il MODELLO: l'immagine è disegnata a scala `z` con l'angolo in alto a
   sinistra spostato di (`x`, `y`) px rispetto all'angolo del riquadro.
   `transform: translate(x,y) scale(z)` con transform-origin 0 0.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIProiezioneCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var Z_MIN = 0.05, Z_MAX = 8;

    /* La scala che fa ENTRARE l'immagine nel riquadro, nei due assi, con un
       filo d'aria. Mai sopra 1×… no: SOPRA 1 va bene — una foto piccola su
       una LIM si vuole grande. Il tetto è quello dello zoom. */
    function adatta(imgW, imgH, boxW, boxH) {
        if (!imgW || !imgH || !boxW || !boxH) return { z: 1, x: 0, y: 0 };
        var z = Math.min(boxW / imgW, boxH / imgH) * 0.98;
        z = clampZ(z);
        return { z: z, x: (boxW - imgW * z) / 2, y: (boxH - imgH * z) / 2 };
    }

    function clampZ(z) { return Math.max(Z_MIN, Math.min(Z_MAX, Number(z) || 1)); }

    /* ZOOM SUL PUNTATORE: il punto dell'immagine sotto il cursore resta sotto
       il cursore. (px,py) = il puntatore nel riquadro; il punto-immagine è
       ((px - x) / z); imponendo che non si muova si ricava il nuovo scostamento. */
    function zoomAlPunto(stato, px, py, fattore) {
        var z1 = clampZ((stato.z || 1) * fattore);
        var k = z1 / (stato.z || 1);
        return { z: z1, x: px - (px - stato.x) * k, y: py - (py - stato.y) * k };
    }

    /* Il PAN non deve poter perdere l'immagine: almeno una striscia (min 48px o
       ciò che c'è) resta sempre dentro il riquadro, per ciascun asse. */
    function clampPan(stato, imgW, imgH, boxW, boxH) {
        var margine = 48;
        var w = imgW * stato.z, h = imgH * stato.z;
        var minX = Math.min(margine, w) - w, maxX = boxW - Math.min(margine, w);
        var minY = Math.min(margine, h) - h, maxY = boxH - Math.min(margine, h);
        return {
            z: stato.z,
            x: Math.max(minX, Math.min(maxX, stato.x)),
            y: Math.max(minY, Math.min(maxY, stato.y))
        };
    }

    /* I CORPI del testo proiettato: dal fondo dell'aula si legge dai 18px in
       su; oltre i 40 anche un titolo smette di stare nel pannello. */
    var CORPI = [18, 22, 26, 32, 40];
    /* un valore sporco (persistenza vecchia, typo) riparte dal DEFAULT: un
       salto da un numero mai visto sarebbe una sorpresa in mezzo alla lezione */
    function corpoSu(c) { var i = CORPI.indexOf(c); if (i < 0) return CORPO_DEF; return CORPI[Math.min(CORPI.length - 1, i + 1)]; }
    function corpoGiu(c) { var i = CORPI.indexOf(c); if (i < 0) return CORPO_DEF; return CORPI[Math.max(0, i - 1)]; }
    var CORPO_DEF = 22;

    return {
        Z_MIN: Z_MIN, Z_MAX: Z_MAX,
        CORPI: CORPI, CORPO_DEF: CORPO_DEF,
        adatta: adatta, clampZ: clampZ,
        zoomAlPunto: zoomAlPunto, clampPan: clampPan,
        corpoSu: corpoSu, corpoGiu: corpoGiu
    };
}));
