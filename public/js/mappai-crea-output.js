/* ═════════════════════════════════════════════════
   «OUTPUT» — che cosa vuole ottenere il docente (0087, lotto 10-crea, 12/10/2026)

   Giacomo: «aggiungere un box a sinistra del bottone DOCUMENTI in cui il docente
   dichiara quale tipo di materiale vuole ottenere. Il titolo del box è 'Output' e per
   intanto inserisci tre voci: 'Differenziazione', 'Analisi iconografica',
   'Metacomprensione'» — «le tre opzioni governano quali box mostrare nel BENTO».

   Il box sta nella composizione del bento (mappai-bento-composizione.js, modulo
   `output`); il campo è una tendina di index.html (#mn-output-campo) che il bento
   sposta nel suo box. Qui vive la scelta: si ricorda (localStorage), si scrive su
   <html data-crea-output> perché il foglio (mappai-stile-manifesto.css) accenda o
   spenga i box, e si applica ciò che un foglio non può fare:
   - Differenziazione: niente, il bento di sempre;
   - Analisi iconografica: i formati delle immagini sotto l'elenco vuoto dei file
     (`--crea-formati`, letti da MappAIVisioneCore) e i due posti d'attesa della terza
     riga (anteprima e titolo), finché il guscio della modalità iconografica
     (mappai-crea-iconografica.js, 0067) non monta i pezzi veri;
   - Metacomprensione: il configuratore della Lettura (0070) montato e mostrato nel
     suo host. LA SCELTA È L'INTERRUTTORE (correzione del 12/10 sera, Giacomo via
     ADMIN: «se un docente nel box output sceglie metacomprensione si attivi il box per
     la scelta dei materiali»): scegliendola si scrive `mappai_percorso_lettura = '1'`,
     la chiave che `enabled()` di mappai-percorso-lettura.js e tutta la strada della
     lettura (montaggio, generazione, ELABORA, revisione) leggono — nella beta.6 è
     spenta di default e in Cabina NON c'è un interruttore. La chiave non si rispegne
     cambiando scelta: i materiali già fatti restano modificabili.
   Fuori da Metacomprensione l'host della Lettura resta nascosto: il box «appare»
   quando lo si sceglie (parole di Giacomo).

   Il nucleo è puro e testato in Node (tests/crea-output.test.js); il resto gira
   solo con un documento. Nessun file del §3 viene toccato: il guscio, il bento e la
   lettura restano i loro, qui si leggono soltanto i loro id e le loro API.
   ═════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAICreaOutputCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var CHIAVE = 'mappai_crea_output';
    var VOCI = [
        { id: 'differenziazione', et: 'Differenziazione', en: 'Differentiation' },
        { id: 'iconografica', et: 'Analisi iconografica', en: 'Iconographic analysis' },
        { id: 'metacomprensione', et: 'Metacomprensione', en: 'Metacomprehension' }
    ];
    var DEFAULT = VOCI[0].id;
    var FORMATI_BASE = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

    function normalizza(v) {
        var s = String(v == null ? '' : v).trim().toLowerCase();
        for (var i = 0; i < VOCI.length; i++) if (VOCI[i].id === s) return s;
        return DEFAULT;
    }

    /* Che cosa comporta una scelta, dato lo stato attorno (puro):
       `fotoMontata` = il guscio iconografico ha già messo i pezzi veri.
       `lettura` = la Lettura si accende e si mostra: la scelta basta (12/10 sera),
       non c'è un interruttore da controllare prima. */
    function effetti(scelta, ctx) {
        ctx = ctx || {};
        var s = normalizza(scelta);
        return {
            scelta: s,
            formati: s === 'iconografica',
            attesa: s === 'iconografica' && !ctx.fotoMontata,
            lettura: s === 'metacomprensione',
            accendeLettura: s === 'metacomprensione'
        };
    }

    /* la riga dei formati sotto l'elenco vuoto: le estensioni della visione, o quelle note */
    function testoFormati(estensioni, etichetta) {
        var l = (estensioni && estensioni.length) ? estensioni : FORMATI_BASE;
        return (etichetta || 'Formati') + ': ' + l.join(' · ');
    }

    return { CHIAVE: CHIAVE, VOCI: VOCI, DEFAULT: DEFAULT, FORMATI_BASE: FORMATI_BASE,
        normalizza: normalizza, effetti: effetti, testoFormati: testoFormati };
}));

/* ── il runtime: solo con un documento ─────────────────────────────────────── */
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var C = window.MappAICreaOutputCore;
    if (!C) return;
    var CHIAVE_LETTURA = 'mappai_percorso_lettura';   /* la chiave di enabled() in mappai-percorso-lettura.js:406 */

    function t(k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; }
    function leggi() {
        try { return C.normalizza(localStorage.getItem(C.CHIAVE)); } catch (e) { return C.DEFAULT; }
    }
    function scrivi(v) {
        try { localStorage.setItem(C.CHIAVE, C.normalizza(v)); } catch (e) { }
    }
    function accendiLettura() {
        try { if (localStorage.getItem(CHIAVE_LETTURA) !== '1') localStorage.setItem(CHIAVE_LETTURA, '1'); return true; }
        catch (e) { return false; }
    }
    function fotoMontata() {
        return !!(document.getElementById('ci-foto') || document.getElementById('ci-riquadro'));
    }

    /* la tendina: le tre voci, nella lingua dell'interfaccia, e il valore ricordato */
    function popola() {
        var sel = document.getElementById('mn-output-campo');
        if (!sel) return null;
        if (!sel.options.length) {
            C.VOCI.forEach(function (v) {
                var o = document.createElement('option');
                o.value = v.id;
                o.textContent = t('crea_output_' + v.id, v.et);
                sel.appendChild(o);
            });
            sel.addEventListener('change', function () {
                scrivi(sel.value);
                applica();
                try { document.dispatchEvent(new CustomEvent('mappai-crea-output-changed', { detail: { scelta: leggi() } })); } catch (e) { }
            });
        }
        sel.value = leggi();
        return sel;
    }

    function applica() {
        var e = C.effetti(leggi(), { fotoMontata: fotoMontata() });
        if (e.accendeLettura) accendiLettura();   /* prima del montaggio: mountCreatePlanner legge la chiave */
        var html = document.documentElement;
        html.setAttribute('data-crea-output', e.scelta);
        /* i formati: il foglio li legge dalla variabile, così non dipende da quando il
           bento ridisegna l'elenco vuoto */
        var V = window.MappAIVisioneCore;
        var testo = C.testoFormati(V && V.ESTENSIONI, t('crea_output_formati', 'Formati'));
        html.style.setProperty('--crea-formati', JSON.stringify(testo));
        /* la Lettura: montata e mostrata solo con Metacomprensione */
        var host = document.getElementById('lettura-crea-host');
        if (host) {
            var P = window.MappAIPercorsoLettura;
            if (e.lettura) {
                if (!host.dataset.letturaMounted && P && typeof P.mountCreatePlanner === 'function') {
                    try { P.mountCreatePlanner(host); } catch (err) { console.warn('[CREA Output] Lettura non montata:', err && err.message); }
                }
                if (host.dataset.letturaMounted) host.hidden = false;
            } else {
                if (host.dataset.letturaMounted) host.hidden = true;
            }
        }
        return e;
    }

    function avvia() { popola(); applica(); }
    /* dopo il bootstrap della Lettura (index.html, DOMContentLoaded): questo file sta
       dopo di lui, quindi il suo ascoltatore parte dopo e l'host spento resta spento */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia, { once: true });
    else avvia();

    window.MappAICreaOutput = {
        scelta: leggi,
        imposta: function (v) { scrivi(v); var s = popola(); if (s) s.value = leggi(); return applica(); },
        applica: applica,
        VOCI: C.VOCI
    };
    console.log('[MappAI] mappai-crea-output.js caricato ✓');
})();
