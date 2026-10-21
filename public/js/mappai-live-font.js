/*
 * mappai-live-font.js — il carattere del docente, sul telefono dell'allievo
 * ---------------------------------------------------------------------------
 * Il docente sceglie il carattere in MappAI (Cabina › Aspetto e leggibilità,
 * chiave `mappai_font_app`). Le sessioni live dell'allievo lo ereditano: il
 * docente lo manda con la sessione (`session.font`), il server lo espone in
 * `/api/session` solo se sta nel catalogo, e le pagine dell'allievo lo applicano
 * qui, appena la sessione arriva (packet 0112, 20/10/2026).
 *
 * Il CATALOGO è uno solo: `MappAIFontCore` (mappai-font-core.js). Questo modulo
 * non elenca nessun carattere: chiede al catalogo le @font-face e il ripiego.
 *
 * Come si applica: una variabile CSS, `--live-font`, che le pagine leggono col
 * proprio carattere storico come ripiego:
 *     font-family: var(--live-font, 'Space Mono', var(--emoji), …)
 * Senza questo modulo, senza catalogo o con un id che il catalogo non conosce la
 * variabile non esiste e la pagina resta com'era (Space Mono, locale).
 * ⚠️ Le emoji stanno DENTRO la variabile (`var(--emoji)` subito dopo il carattere):
 * il glifo lo prende il primo carattere dello stack che ce l'ha, e `--emoji` è la
 * variabile che `mappai-emoji-prova.js` decide su ogni dispositivo.
 *
 * Due modi di caricarlo: <script> (→ window.MappAILiveFont) e `require` in Node
 * (i test provano `css()`, che non tocca il DOM).
 */
(function () {
    'use strict';
    if (typeof window !== 'undefined' && window.MappAILiveFont) return;   /* due caricamenti = due iniezioni */

    var BASE = '/public/fonts/';    /* dove il server LAN serve i file dei caratteri */
    var ID_STILE = 'mappai-live-font';

    function core() {
        if (typeof window !== 'undefined' && window.MappAIFontCore) return window.MappAIFontCore;
        try { return require('./mappai-font-core.js'); } catch (e) { return null; }
    }

    /* Le regole CSS per quel carattere, o '' se non c'è niente da cambiare:
       Space Mono (il predefinito, già dichiarato in locale nella pagina), un id
       ignoto, nessun catalogo. È pura: si prova in Node. */
    function css(id, base) {
        var C = core();
        if (!C || typeof id !== 'string' || !C.valido(id) || id === C.DEFAULT) return '';
        var f = C.font(id);
        return C.facce(id, base == null ? BASE : base) +
            "\nhtml{--live-font:'" + f.famiglia + "',var(--emoji)," + f.ripiego + ';}';
    }

    function applica(id) {
        if (typeof document === 'undefined') return false;
        var testo = css(id);
        var vecchio = document.getElementById(ID_STILE);
        if (!testo) { if (vecchio) vecchio.remove(); return false; }
        var st = vecchio || document.createElement('style');
        st.id = ID_STILE; st.textContent = testo;
        if (!vecchio) (document.head || document.documentElement).appendChild(st);
        return true;
    }

    /* `/api/session` → il campo `font`. Tollera qualunque cosa: la pagina non deve rompersi per un carattere. */
    function daSessione(sess) {
        try { return applica(sess && sess.font); } catch (e) { return false; }
    }

    var api = { css: css, applica: applica, daSessione: daSessione };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.MappAILiveFont = api;
})();
