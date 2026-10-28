/* =========================================================================
 * mappai-velo.js — i velini fatti a mano come le finestre del motore
 * -------------------------------------------------------------------------
 * 0122 lotto 4b (Giacomo, 22/10): «tieni il blur + dimmer per tutti i modali
 * di tutta l'app, e quando è aperto un modale lo sfondo è sempre bloccato»;
 * «il tasto ESC deve chiudere i modali»; un velo solo (lotto 4a).
 *
 * Il motore (`MappAIModal`) lo fa già per le sue finestre. Qui lo stesso per
 * le altre, con UNA chiamata: `MappAIVelo.monta(velino, chiudi)` —
 *   - il velo del motore (`.mm-velo`: scuro .45 + sfumato 3px), trasparente
 *     se sotto c'è già un velo aperto (un velo solo);
 *   - il piano più alto (`MappAIModal.prossimoZ`): niente più finestre che
 *     si aprono SOTTO le console di ELABORA e INSEGNA;
 *   - lo sfondo bloccato (`inert` sugli altri figli di body, col contatore
 *     `data-mm-congela` che usa anche il motore);
 *   - Esc chiude, ma solo il velino più in alto (una finestra del motore
 *     aperta sopra si chiude per prima, col suo Esc);
 *   - tutto si scioglie da sé quando il velino esce dal DOM o si nasconde.
 *
 * Gli statici di index.html non escono mai dal DOM: si mostrano e si
 * nascondono cambiando classe. L'aiutante li GUARDA da sé (`STATICI`) e li
 * monta quando diventano visibili, senza toccare le funzioni che li aprono.
 * ========================================================================= */
(function () {
    'use strict';

    var aperti = [];   // { ov, chiudi, sblocca } dei velini montati, in ordine di apertura

    function prossimoZ() {
        try { if (window.MappAIModal && window.MappAIModal.prossimoZ) return window.MappAIModal.prossimoZ(); } catch (e) { }
        return 12000;
    }
    function visibile(el) {
        if (!el || !el.isConnected || (el.classList && el.classList.contains('hidden'))) return false;
        try { return getComputedStyle(el).display !== 'none'; } catch (e) { return true; }
    }
    function piano(el) { var z = 0; try { z = Number(getComputedStyle(el).zIndex) || 0; } catch (e) { } return z; }
    /* una console (Cabina, INSEGNA, ELABORA) è una pagina piena, non un velo: sopra di lei la finestra ha il suo
       velo scuro e sfumato (Giacomo, 23/10: «lo sfondo della CABINA deve essere dimmato e blurrato come con tutti
       gli altri modali») */
    function eConsole(el) { return !!(el.querySelector && el.querySelector('.mm-box--console')); }
    /* un altro velo è già aperto? (finestre del motore, velini montati, `.mm-velo` di chi non passa di qui) */
    function sottoUnVelo(ov) {
        return Array.prototype.some.call(document.body.children, function (el) {
            if (el === ov || !visibile(el) || eConsole(el)) return false;
            return (el.classList && (el.classList.contains('mm-overlay') || el.classList.contains('mm-velo'))) ||
                aperti.some(function (a) { return a.ov === el; });
        });
    }

    /* lo sfondo bloccato: lo stesso `congela` del motore e del lotto 2 (contatore per elemento, rispetto
       dell'`inert` altrui). In più il velino stesso: se il motore lo aveva congelato (uno statico aperto
       sopra una console), gli si toglie l'`inert` finché è aperto e gli si rimette dopo. */
    function congela(ov) {
        if (!document.body || !document.body.children) return function () { };
        var presi = [];
        Array.prototype.forEach.call(document.body.children, function (el) {
            if (el === ov || !el.setAttribute) return;
            if (el.hasAttribute('inert') && !(el.dataset && el.dataset.mmCongela)) return;   /* inert di altri: non è nostro */
            el.dataset.mmCongela = String((Number(el.dataset.mmCongela) || 0) + 1);
            el.setAttribute('inert', ''); presi.push(el);
        });
        var eraCongelato = ov.hasAttribute && ov.hasAttribute('inert') && ov.dataset && ov.dataset.mmCongela;
        if (eraCongelato) ov.removeAttribute('inert');
        return function () {
            presi.forEach(function (el) {
                var n = (Number(el.dataset.mmCongela) || 1) - 1;
                if (n > 0) { el.dataset.mmCongela = String(n); return; }
                delete el.dataset.mmCongela; el.removeAttribute('inert');
            });
            if (eraCongelato && ov.dataset && Number(ov.dataset.mmCongela) > 0) ov.setAttribute('inert', '');
        };
    }

    function monta(ov, chiudi, opz) {
        opz = opz || {};
        if (!ov || !document.body || aperti.some(function (a) { return a.ov === ov; })) return function () { };
        var sopra = sottoUnVelo(ov);
        /* la classe si toglie alla chiusura se l'ha messa l'aiutante: uno statico nascosto che si tenesse `.mm-velo`
           farebbe credere al motore (mappai-modal.js, «un velo solo») che sotto c'è sempre un velo, e le sue
           finestre uscirebbero senza velo */
        var classeNostra = opz.velo !== false && !ov.classList.contains('mm-velo');
        if (opz.velo !== false) {
            /* il velo del motore al posto dei Tailwind (bg-slate-900/80, backdrop-blur-sm…) e degli inline */
            Array.prototype.slice.call(ov.classList).forEach(function (c) { if (/^(bg-|backdrop-blur)/.test(c)) ov.classList.remove(c); });
            ov.style.background = ''; ov.style.backgroundColor = ''; ov.style.backdropFilter = '';
            ov.classList.add('mm-velo');
        }
        if (sopra) {
            /* un velo solo: inline, perché la regola per id degli statici (tokens) batte `.mm-velo--sopra` */
            ov.classList.add('mm-velo--sopra');
            ov.style.background = 'transparent'; ov.style.backdropFilter = 'none';
        }
        ov.style.zIndex = String(prossimoZ());
        /* il fuoco: si ricorda chi ha aperto, si entra nel velino (se non ci ha già pensato lui) e alla chiusura si
           torna a chi ha aperto — altrimenti il ridisegno della console sotto lo posa sul suo primo campo (Giacomo,
           23/10: «il focus si sposta sulla input text area di 'chi sei'») */
        var apriva = document.activeElement;
        var scongela = congela(ov);
        if (!ov.contains || !ov.contains(document.activeElement)) {
            /* sul riquadro, non su un campo: niente cursore che lampeggia in un testo che non si è scelto */
            var dentro = (ov.querySelector && (ov.querySelector('[role="dialog"]') || ov.firstElementChild)) || ov;
            if (dentro.setAttribute && !dentro.hasAttribute('tabindex')) { dentro.setAttribute('tabindex', '-1'); dentro.style.outline = 'none'; }
            try { if (dentro.focus) dentro.focus({ preventScroll: true }); } catch (e) { }
        }
        /* `esc: false` (4b2): chi ha un Esc suo, più fine (il Banco di revisione: Esc dentro un campo annulla, a lavoro
           in corso non chiude), lo tiene; l'aiutante fa tutto il resto */
        var voce = { ov: ov, chiudi: chiudi, sblocca: null, esc: opz.esc !== false };
        var mo = null;
        /* il clic sul velo non chiude (Giacomo, 23/10: «[…] devono avere veloChiude spento e chiudersi solo con 'x'
           e ESC»): si ferma qui, in cattura sul velino, prima dei gestori propri — sul velino stesso o sul documento,
           come la scheda del nodo. `clicFuori: true` lo lascia passare (il visore delle immagini: un clic lo chiude) */
        var fermaClic = null;
        if (opz.clicFuori !== true && ov.addEventListener) {
            fermaClic = function (e) { if (e.target === ov) { e.stopImmediatePropagation(); e.preventDefault(); } };
            ov.addEventListener('click', fermaClic, true);
        }
        function sblocca() {
            var i = aperti.indexOf(voce); if (i < 0) return;
            aperti.splice(i, 1);
            if (mo) mo.disconnect();
            if (fermaClic) ov.removeEventListener('click', fermaClic, true);
            scongela();
            ov.style.zIndex = '';
            if (sopra) { ov.classList.remove('mm-velo--sopra'); ov.style.background = ''; ov.style.backdropFilter = ''; }
            if (classeNostra) ov.classList.remove('mm-velo');
            if (apriva && apriva.isConnected && apriva.focus && apriva !== document.body) {
                try { apriva.focus({ preventScroll: true }); } catch (e) { }
            }
        }
        voce.sblocca = sblocca;
        aperti.push(voce);
        /* si scioglie da sé: il velino esce dal DOM (i JS) o si nasconde (gli statici) */
        if (typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(function () { if (!visibile(ov)) sblocca(); });
            mo.observe(document.body, { childList: true });
            mo.observe(ov, { attributes: true, attributeFilter: ['class', 'style'] });
        }
        return sblocca;
    }

    /* Esc: un ascoltatore solo, in cattura. Chiude il velino montato più in alto, se sopra di lui non c'è
       una finestra del motore (quella ha il suo Esc). Arriva prima della tabella di `app.js` e la ferma. */
    function tasti(e) {
        if (e.key !== 'Escape' || !aperti.length) return;
        var vivi = aperti.filter(function (a) { return visibile(a.ov); });
        if (!vivi.length) return;
        var cima = vivi.reduce(function (x, y) { return piano(y.ov) >= piano(x.ov) ? y : x; });
        var motore = Array.prototype.some.call(document.querySelectorAll('body > .mm-overlay'), function (el) {
            return visibile(el) && piano(el) > piano(cima.ov);
        });
        if (motore || !cima.esc) return;
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        try { if (cima.chiudi) cima.chiudi(); } catch (err) { console.warn('[velo] chiusura:', err); }
    }

    /* ── gli statici di index.html: si guardano da sé ─────────────────────── */
    function clic(id) { return function () { var b = document.getElementById(id); if (b) b.click(); }; }
    function fn(nome) { return function () { if (typeof window[nome] === 'function') window[nome](); }; }
    var STATICI = [
        ['alert-modal', clic('alert-ok')],
        ['prompt-modal', clic('prompt-cancel')],
        ['link-family-modal', clic('link-family-cancel')],
        ['confirm-modal', clic('confirm-cancel')],
        ['edit-node-modal', fn('closeEditModal')],
        ['dossier-print-modal', fn('closeDossierPrintModal')],
        ['study-player-modal', fn('closeStudyPlayer')],
        ['source-modal', fn('closeSourceModal')],
        ['image-lightbox', fn('closeLightbox'), { velo: false, clicFuori: true }],   /* il visore delle immagini tiene il suo scuro .95 e il clic che lo chiude */
        ['validate-link-modal', fn('closeValidateModal')],
        ['app-tutorial-modal', fn('closeAppTutorial')],
        ['app-guide-modal', fn('closeAppGuide')]
    ];
    function guarda(el, chiudi, opz) {
        if (!el || typeof MutationObserver === 'undefined') return;
        var controlla = function () { if (visibile(el) && !aperti.some(function (a) { return a.ov === el; })) monta(el, chiudi, opz); };
        new MutationObserver(controlla).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        controlla();
    }
    function avvia() {
        document.addEventListener('keydown', tasti, true);
        STATICI.forEach(function (s) { guarda(document.getElementById(s[0]), s[1], s[2]); });
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
        else avvia();
    }

    window.MappAIVelo = { monta: monta, guarda: guarda, get aperti() { return aperti.length; } };
})();
