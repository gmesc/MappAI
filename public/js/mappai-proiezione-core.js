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

    /* IL CORPO DEL TESTO PROIETTATO: un solo bottone «Aa» a ciclo (regola di
       Giacomo del 09/10, packet 0079 B7). Dalla partenza (22px) quattro taglie
       che crescono sempre — ×1 · ×1,25 · ×1,5 · ×1,8 = 22, 28, 33, 40 — poi si
       torna a ×1. Oltre i 40 anche un titolo smette di stare nel pannello; sotto
       i 22, dal fondo dell'aula, non serve. Un valore sporco (persistenza
       vecchia, typo) riparte da ×1: un salto da un numero mai visto sarebbe una
       sorpresa in mezzo alla lezione. */
    var CORPO_DEF = 22;
    var AA_FATTORI = [1, 1.25, 1.5, 1.8];
    var AA_CORPI = AA_FATTORI.map(function (f) { return Math.round(CORPO_DEF * f); });
    function aaSucc(c) { var i = AA_CORPI.indexOf(c); return i < 0 ? CORPO_DEF : AA_CORPI[(i + 1) % AA_CORPI.length]; }
    function aaFattore(c) { var i = AA_CORPI.indexOf(c); return i < 0 ? 1 : AA_FATTORI[i]; }

    /* LO SPLIT fra immagine e scheda (0079, lotto B): il disegno del divisore
       del Banco, chiuso da TUTTI E DUE i lati. Lo stato è { frazione, chiusa }:
       `frazione` = la larghezza dell'immagine sul totale (0.55 = la proporzione
       di sempre), `chiusa` = null | 'immagine' | 'scheda'. Chiudendo, la
       frazione resta quella di PRIMA del gesto: si riapre lì, non alla larghezza
       di passaggio. Niente minimi in px: bastano le soglie. */
    var SPLIT = { DEF: 0.55, SOGLIA: 0.1, PASSO: 0.05 };
    function _split(frazione, chiusa) { return { frazione: frazione, chiusa: chiusa || null }; }

    /* `inizio` è lo stato all'INIZIO del gesto (la UI lo conserva al
       pointerdown): durante il trascinamento la frazione viva cambia a ogni
       movimento, e chiudendo si torna a quella di partenza. */
    function splitDaPuntatore(x, W, inizio) {
        inizio = inizio || _split(SPLIT.DEF, null);
        if (!(W > 0)) return _split(inizio.frazione, inizio.chiusa);
        if (x < SPLIT.SOGLIA * W) return _split(inizio.frazione, 'immagine');
        if (x > (1 - SPLIT.SOGLIA) * W) return _split(inizio.frazione, 'scheda');
        return _split(x / W, null);
    }

    /* La tastiera, come nel Banco: ← → spostano di PASSO (oltre la soglia
       chiudono quel lato); da chiuso, la freccia che si allontana dal bordo
       riapre e quella verso il bordo non fa nulla; Home chiude l'immagine, End
       la scheda; Invio e Spazio riaprono un lato chiuso e, a tutti e due
       aperti, chiudono la scheda (come «Affianca»). Un altro tasto → null. */
    function splitDaTasto(stato, tasto) {
        stato = stato || _split(SPLIT.DEF, null);
        var f = stato.frazione, c = stato.chiusa || null;
        if (tasto === 'Home') return _split(f, 'immagine');
        if (tasto === 'End') return _split(f, 'scheda');
        if (tasto === 'Enter' || tasto === ' ') return c ? _split(f, null) : _split(f, 'scheda');
        if (tasto !== 'ArrowLeft' && tasto !== 'ArrowRight') return null;
        var sinistra = tasto === 'ArrowLeft';
        if (c === 'immagine') return sinistra ? _split(f, c) : _split(f, null);
        if (c === 'scheda') return sinistra ? _split(f, null) : _split(f, c);
        var g = Math.round((f + (sinistra ? -SPLIT.PASSO : SPLIT.PASSO)) * 1000) / 1000;
        if (g < SPLIT.SOGLIA) return _split(f, 'immagine');
        if (g > 1 - SPLIT.SOGLIA) return _split(f, 'scheda');
        return _split(g, null);
    }

    /* La frazione ricordata: buona solo fra le due soglie, altrimenti DEF. */
    function splitLeggi(valore) {
        if (valore === null || valore === undefined || valore === '') return SPLIT.DEF;
        var n = Number(valore);
        return (n >= SPLIT.SOGLIA && n <= 1 - SPLIT.SOGLIA) ? n : SPLIT.DEF;
    }

    return {
        Z_MIN: Z_MIN, Z_MAX: Z_MAX,
        CORPO_DEF: CORPO_DEF, AA_FATTORI: AA_FATTORI, AA_CORPI: AA_CORPI,
        adatta: adatta, clampZ: clampZ,
        zoomAlPunto: zoomAlPunto, clampPan: clampPan,
        aaSucc: aaSucc, aaFattore: aaFattore,
        SPLIT: SPLIT, splitDaPuntatore: splitDaPuntatore, splitDaTasto: splitDaTasto, splitLeggi: splitLeggi
    };
}));
