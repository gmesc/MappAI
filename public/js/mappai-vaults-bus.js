/*
 * mappai-vaults-bus.js — «le cartelle sono cambiate»: un canale solo (9/8/26)
 * ---------------------------------------------------------------------------
 * Il problema, dichiarato da Giacomo: gli elenchi delle mappe e dei materiali
 * non erano sempre veri. Generavi una mappa e la console non la vedeva;
 * spostavi una cartella e la tabella mostrava la vecchia; eliminavi un file e
 * la riga restava. Ogni superficie leggeva il disco UNA volta — all'apertura —
 * e da lì in poi viveva di ricordi.
 *
 * Il rimedio non è una cache più furba: è ACCORGERSI. Rileggere costa nulla —
 * misurato nell'app vera su 28 vault: `getAllVaults` 7ms la prima volta e 1-2ms
 * poi, i materiali di una mappa 1ms, le sessioni 5ms. Quindi la regola diventa:
 * chi scrive su disco lo DICE, e chi mostra elenchi rilegge.
 *
 *   MappAIVaults.segnala('mappa-salvata', {vaultPath})   ← chi scrive
 *   MappAIVaults.quando(fn)                              ← chi mostra
 *
 * Perché un canale e non N chiamate dirette: chi salva un vault non deve sapere
 * quali finestre sono aperte (oggi INSEGNA, ELABORA e la console; domani altro),
 * e chi disegna non deve indovinare quando qualcosa è cambiato. È lo stesso
 * pattern già in uso per `mappai-active-class-changed` e `mappai-profili-cambiati`,
 * che qui viene esteso al disco.
 *
 * ⚠️ Un solo evento per tutte le scritture, non uno per tipo: la domanda che si
 * fa chi disegna è sempre «è cambiato qualcosa là fuori?». Il `motivo` viaggia
 * nel detail per chi vuole distinguere (e per il log), non per moltiplicare i
 * canali.
 * ⚠️ Le notifiche si RAGGRUPPANO (60ms): la pipeline dei materiali scrive otto
 * file di fila, e otto ridisegni della stessa tabella sono sette di troppo.
 *
 * Namespace: window.MappAIVaults. Nessuna dipendenza; caricare presto.
 */
(function () {
    'use strict';

    var EVENTO = 'mappai-vaults-changed';
    var _pendenti = [];
    var _timer = null;

    function _emetti() {
        _timer = null;
        var motivi = _pendenti.slice();
        _pendenti = [];
        try {
            document.dispatchEvent(new CustomEvent(EVENTO, { detail: { motivi: motivi } }));
        } catch (e) { /* ambiente senza CustomEvent (test in Node): nessun ascoltatore */ }
    }

    /* motivo = 'mappa-salvata' | 'mappa-spostata' | 'file-scritto' | 'file-eliminato'
       | 'materiali-generati' | 'sessione-chiusa' | … (stringa libera: è per chi legge
       i log, non un enum che il codice controlla) */
    function segnala(motivo, dettaglio) {
        _pendenti.push({ motivo: String(motivo || 'cambiato'), dettaglio: dettaglio || null });
        if (_timer) return;
        _timer = setTimeout(_emetti, 60);
    }

    /* Ascolta. Ritorna la funzione per smettere: una console che si chiude deve
       poter staccarsi, o ridisegnerebbe una finestra che non c'è più. */
    function quando(fn) {
        if (typeof fn !== 'function') return function () { };
        var h = function (ev) { try { fn((ev && ev.detail) || { motivi: [] }); } catch (e) { } };
        document.addEventListener(EVENTO, h);
        return function () { document.removeEventListener(EVENTO, h); };
    }

    window.MappAIVaults = { EVENTO: EVENTO, segnala: segnala, quando: quando };
    if (typeof module === 'object' && module.exports) module.exports = window.MappAIVaults;
})();
