/* =========================================================================
   mappai-visione-modello.js — IL MODELLO PER LE FOTO su Infomaniak (0066)

   Una tendina «Modello per le foto» sotto «Modello AI», nella vista
   «Impostazioni AI», visibile solo con Infomaniak attivo. Elenca i modelli che
   leggono immagini (`MappAICatalogo.leggeImmagini`) presi dal catalogo VIVO:
   un modello nuovo di Infomaniak compare da solo, come nella tendina principale.

   Chiavi (inv. 6):
   · `mappai_visione_modello_infomaniak` — la scelta del docente. Questo modulo
     è l'unico che la legge e la scrive.
   · `mappai_config_visione` — scritta SOLO dall'import dello 0064; qui si
     legge soltanto. Se la chiave di sopra è vuota, la tendina nasce su questa
     al posto del predefinito, senza scriverla.

   Quando si riempie: quando si riempie `#model-select` (apertura della vista,
   cambio di fornitore, «Aggiorna Modelli»). Non si avvolge `refreshGeminiModels`
   (GUIDA, trappola 9): si osserva il DOM, che è il risultato, e si fa una
   chiamata propria a `listInfomaniakModels`.

   Il gancio per lo 0064: `window.MappAIVisioneModello.imposta(id)`, sincrona.
   ========================================================================= */
(function () {
    'use strict';
    if (window.MappAIVisioneModello) return;

    var LS = 'mappai_visione_modello_infomaniak';
    var LS_CONFIG = 'mappai_config_visione';
    var PREDEFINITO = 'Qwen/Qwen3.5-122B-A10B-FP8';
    var ID_VALIDO = /^[A-Za-z0-9._\/-]{3,120}$/;
    var t = function (k, f) { return window.t ? window.t(k, f) : f; };

    function _st() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _leggi(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function _valido(id) { return typeof id === 'string' && ID_VALIDO.test(id); }

    /* Il modello per le foto: la scelta del docente, se no quello del file di
       configurazione, se no il predefinito. */
    function modello() {
        var mio = _leggi(LS);
        if (_valido(mio)) return mio;
        var cfg = _leggi(LS_CONFIG);
        return _valido(cfg) ? cfg : PREDEFINITO;
    }

    var righe = null;      // l'ultimo catalogo letto (solo modelli che leggono immagini)
    var giro = 0;
    var box = null, sel = null, stato = null, etichetta = null, nota = null;

    /* ── LA TENDINA ─────────────────────────────────────────────────────────── */
    function _monta() {
        if (box && box.parentNode) return true;
        var principale = document.getElementById('model-select');
        var blocco = principale && principale.parentNode && principale.parentNode.parentNode;
        if (!blocco || !blocco.parentNode) return false;
        box = document.createElement('div');
        box.id = 'visione-modello-box';
        var et = etichetta = document.createElement('label');
        et.className = 'input_label_xs uppercase font-bold tracking-wider block mb-2';
        sel = document.createElement('select');
        sel.id = 'visione-modello-select';
        sel.className = 'w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 appearance-none cursor-pointer focus_ring_standard';
        sel.addEventListener('change', function () { if (_valido(sel.value)) localStorage.setItem(LS, sel.value); });
        nota = document.createElement('p');
        nota.className = 'input_label_xs mt-1.5';
        stato = document.createElement('p');
        stato.className = 'input_label_xs mt-1';
        et.setAttribute('for', sel.id);
        box.appendChild(et); box.appendChild(sel); box.appendChild(nota); box.appendChild(stato);
        blocco.parentNode.insertBefore(box, blocco.nextSibling || null);
        _testi();
        _disegna(modello());
        return true;
    }
    // rilette a ogni giro: seguono un cambio di lingua fatto dopo il montaggio
    function _testi() {
        if (etichetta) etichetta.textContent = t('vs_mod_titolo', 'Modello per le foto');
        if (nota) nota.textContent = t('vs_mod_nota', 'Le prove fatte finora consigliano Qwen e Ministral.');
    }
    function _visibile() {
        if (!box) return;
        box.style.display = ((_st() || {}).aiProvider === 'infomaniak') ? '' : 'none';
    }
    function _opzione(valore, testo) {
        var o = document.createElement('option');
        o.value = valore; o.textContent = testo;
        sel.appendChild(o);
    }
    function _disegna(corrente) {
        if (!sel) return;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        var C = window.MappAICatalogo;
        var trovato = false;
        (righe || []).forEach(function (r) {
            if (r.id === corrente) trovato = true;
            _opzione(r.id, r.id + (C ? ' — ' + C.priceLabel(r.id, t) : ''));
        });
        if (!trovato) {
            /* il valore salvato resta anche se il catalogo non lo contiene;
               senza catalogo (niente token, rete giù) si mostra com'è */
            _opzione(corrente, righe ? corrente + ' — ' + t('catalog_not_available', 'Non disponibile nel catalogo aggiornato') : corrente);
        }
        sel.value = corrente;
    }
    function _stato(testo) { if (stato) stato.textContent = testo || ''; }

    function riempi() {
        if (!_monta()) return Promise.resolve();
        _testi();
        _visibile();
        if (((_st() || {}).aiProvider) !== 'infomaniak') return Promise.resolve();
        var mio = ++giro;
        var api = window.electronAPI, C = window.MappAICatalogo;
        var chiave = window.getProviderKey ? window.getProviderKey('infomaniak') : '';
        var pidEl = document.getElementById('infomaniak-product-id');
        var pid = (pidEl && pidEl.value) || (_st() || {}).infomaniakProductId || '';
        if (!chiave || !pid || !api || !api.listInfomaniakModels || !C || !C.leggeImmagini) {
            _stato(t('vs_mod_senza', 'Il catalogo si carica con il token e il Product ID di Infomaniak.'));
            _disegna(modello());
            return Promise.resolve();
        }
        return Promise.resolve(api.listInfomaniakModels({ apiKey: chiave, productId: pid })).then(function (rows) {
            if (mio !== giro) return;                 // superata da un giro partito dopo
            if (!Array.isArray(rows)) throw new Error('catalogo');
            // un id che `imposta` e la scelta non potrebbero salvare non si offre
            righe = rows.filter(function (r) { return C.leggeImmagini(r) && _valido(r.id); });
            _stato('');
            _disegna(modello());                      // il salvato si legge DOPO la rete (gara dello 0064)
        }).catch(function () {
            if (mio !== giro) return;
            _stato(t('vs_mod_errore', 'Catalogo non aggiornato: resta il modello scelto.'));
            _disegna(modello());
        });
    }

    /* Il gancio dello 0064. Sincrona; un id non valido non scrive e non lancia. */
    function imposta(id) {
        try {
            if (!_valido(id)) return false;
            localStorage.setItem(LS, id);
            if (sel) _disegna(id);
            return true;
        } catch (e) { return false; }
    }

    var attesa = null;
    /* Due segnali nel DOM: la tendina principale ridisegnata, e i bottoni del
       fornitore (`switchAIProvider` riscrive il loro testo col ✅). Il secondo
       serve quando il catalogo non risponde: `refreshGeminiModels` allora non
       tocca la tendina, ma la nostra deve comunque mostrarsi o sparire. */
    function _osserva() {
        if (typeof MutationObserver === 'undefined') return;
        var mo = new MutationObserver(function () {
            // un ridisegno fa più mutazioni: una chiamata sola
            if (attesa) clearTimeout(attesa);
            attesa = setTimeout(function () { attesa = null; riempi(); }, 50);
        });
        ['model-select', 'provider-google', 'provider-infomaniak'].forEach(function (id) {
            var n = document.getElementById(id);
            if (n) mo.observe(n, { childList: true });
        });
    }
    function _avvio() { _monta(); _visibile(); _osserva(); }

    window.MappAIVisioneModello = { modello: modello, imposta: imposta, riempi: riempi, PREDEFINITO: PREDEFINITO };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _avvio);
    else _avvio();
})();
