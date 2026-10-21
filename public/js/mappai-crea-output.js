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

   0120 (21/10/2026, Giacomo: «un interruttore alla pipeline per l'output dei materiali
   METACOGNIZIONE e se uno user sceglie quell'output appare una finestra che spiega che
   cosa è l'intenzione di questi output e che le funzioni sono in costruzione»; D2 = B).
   La voce «Metacomprensione» sta dietro `mappai_output_metacomprensione`, SPENTO di
   serie: la voce si vede come «Metacomprensione (in costruzione)», sceglierla apre la
   finestra del motore dei modali (l'intenzione, poi «in costruzione», «Ho capito») e la
   tendina torna alla scelta di prima; la Lettura non si accende. Acceso (`'1'`, dalla
   console: localStorage.setItem('mappai_output_metacomprensione', '1')): la voce si
   chiama «Metacomprensione», la finestra si apre lo stesso e poi la Lettura si accende e
   si mostra come dal 12/10. Una scelta «metacomprensione» ricordata da prima, con
   l'interruttore spento, si legge come Differenziazione e all'avvio si RISCRIVE così su
   disco (`riallinea`): la pipeline dei materiali legge `mappai_crea_output` da sé
   (`_fogliSempre`, mappai-material-pipeline.js) senza sapere dell'interruttore, e con il
   valore vecchio avrebbe creduto Metacomprensione mentre la tendina dice Differenziazione
   (niente fogli dei nodi: rilettura dello 0120). La chiave della Lettura già accesa non si
   rispegne. La finestra si apre solo al gesto del
   docente sulla tendina, mai all'avvio né da `imposta()`.

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
    /* 0120: l'interruttore della voce «Metacomprensione» (vedi la testa del file) */
    var CHIAVE_META = 'mappai_output_metacomprensione';
    var VOCI = [
        { id: 'differenziazione', et: 'Differenziazione', en: 'Differentiation' },
        { id: 'iconografica', et: 'Analisi iconografica', en: 'Iconographic analysis' },
        { id: 'metacomprensione', et: 'Metacomprensione', en: 'Metacomprehension' }
    ];
    /* la stessa voce, a interruttore spento: la coda dice che è in costruzione */
    var VOCE_WIP = { chiave: 'crea_output_metacomprensione_wip', et: 'Metacomprensione (in costruzione)', en: 'Metacomprehension (under construction)', wip: true };
    var DEFAULT = VOCI[0].id;
    var FORMATI_BASE = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

    function normalizza(v) {
        var s = String(v == null ? '' : v).trim().toLowerCase();
        for (var i = 0; i < VOCI.length; i++) if (VOCI[i].id === s) return s;
        return DEFAULT;
    }

    /* l'interruttore: acceso solo con '1' (come gli altri `mappai_*`) */
    function metaAttiva(valore) { return String(valore == null ? '' : valore) === '1'; }

    /* le voci da mostrare: con l'interruttore spento la terza porta la coda «(in costruzione)» */
    function voci(ctx) {
        if (ctx && ctx.metaAttiva) return VOCI;
        return VOCI.map(function (v) { return v.id === 'metacomprensione' ? Object.assign({}, v, VOCE_WIP) : v; });
    }

    /* Che cosa comporta una scelta, dato lo stato attorno (puro):
       `fotoMontata` = il guscio iconografico ha già messo i pezzi veri;
       `metaAttiva` = l'interruttore della Metacomprensione; `prima` = la scelta
       valida prima del gesto, dove la tendina torna se la voce è respinta.
       `avviso` = si apre la finestra (ogni volta che si sceglie Metacomprensione);
       `respinta` = la scelta non vale: la tendina torna a `prima` e niente si scrive.
       `lettura` = la Lettura si accende e si mostra (dal 12/10 la scelta basta; dal
       21/10 serve anche l'interruttore acceso). */
    function effetti(scelta, ctx) {
        ctx = ctx || {};
        var voluta = normalizza(scelta);
        var meta = voluta === 'metacomprensione';
        var respinta = meta && !ctx.metaAttiva;
        var s = voluta;
        if (respinta) {
            s = normalizza(ctx.prima);
            if (s === 'metacomprensione') s = DEFAULT;
        }
        return {
            scelta: s,
            formati: s === 'iconografica',
            attesa: s === 'iconografica' && !ctx.fotoMontata,
            lettura: s === 'metacomprensione',
            accendeLettura: s === 'metacomprensione',
            avviso: meta,
            respinta: respinta
        };
    }

    /* la riga dei formati sotto l'elenco vuoto: le estensioni della visione, o quelle note */
    function testoFormati(estensioni, etichetta) {
        var l = (estensioni && estensioni.length) ? estensioni : FORMATI_BASE;
        return (etichetta || 'Formati') + ': ' + l.join(' · ');
    }

    return { CHIAVE: CHIAVE, CHIAVE_META: CHIAVE_META, VOCI: VOCI, DEFAULT: DEFAULT, FORMATI_BASE: FORMATI_BASE,
        normalizza: normalizza, metaAttiva: metaAttiva, voci: voci, effetti: effetti, testoFormati: testoFormati };
}));

/* ── il runtime: solo con un documento ─────────────────────────────────────── */
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var C = window.MappAICreaOutputCore;
    if (!C) return;
    var CHIAVE_LETTURA = 'mappai_percorso_lettura';   /* la chiave di enabled() in mappai-percorso-lettura.js:406 */

    function t(k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; }
    function leggiMeta() {
        try { return C.metaAttiva(localStorage.getItem(C.CHIAVE_META)); } catch (e) { return false; }
    }
    /* la scelta valida ORA: «Metacomprensione» vale solo con l'interruttore acceso,
       altrimenti è il default — in lettura e in scrittura, così localStorage non
       porta mai una voce che la tendina non può mostrare come scelta */
    function valida(v) {
        v = C.normalizza(v);
        return (v === 'metacomprensione' && !leggiMeta()) ? C.DEFAULT : v;
    }
    function leggi() {
        try { return valida(localStorage.getItem(C.CHIAVE)); } catch (e) { return C.DEFAULT; }
    }
    function scrivi(v) {
        try { localStorage.setItem(C.CHIAVE, valida(v)); } catch (e) { }
    }
    function accendiLettura() {
        try { if (localStorage.getItem(CHIAVE_LETTURA) !== '1') localStorage.setItem(CHIAVE_LETTURA, '1'); return true; }
        catch (e) { return false; }
    }
    function fotoMontata() {
        return !!(document.getElementById('ci-foto') || document.getElementById('ci-riquadro'));
    }

    /* 0120: la finestra — che cosa vuole essere questo output, e che è in costruzione.
       Un'azione sola che conclude (invariante 10); senza il motore dei modali non si
       apre niente e la scelta segue lo stesso la sua strada. */
    function finestra() {
        var M = window.MappAIModal;
        if (!M || typeof M.open !== 'function') return Promise.resolve(null);
        var p;
        try {
            p = M.open({
                titolo: t('crea_output_meta_titolo', 'Metacomprensione'),
                taglia: 'm',
                sezioni: [
                    {
                        titolo: t('crea_output_meta_intento_titolo', 'Che cosa vuole essere'),
                        testo: t('crea_output_meta_intento', 'Da un testo, MappAI prepara attività di comprensione e di metacomprensione per la lettura: l\'allievo impara a pianificare, controllare e valutare come legge, su un problema concreto del testo (lessico, coesione, informazioni esplicite, inferenze, sequenze e cause). I materiali seguono i quattro processi PIRLS e le strategie esplicite raccomandate dall\'EEF, con un aiuto proporzionato che il docente può togliere.')
                    },
                    {
                        titolo: t('crea_output_meta_wip_titolo', 'In costruzione'),
                        testo: t('crea_output_meta_wip', 'La scelta dei materiali, la revisione e la stampa di questo output possono cambiare o non funzionare ancora: puoi guardare, ma i risultati non sono ancora pronti per la classe.')
                    }
                ],
                azioni: [{ id: 'ok', etichetta: t('crea_output_meta_ok', 'Ho capito'), ruolo: 'primario' }]
            });
        } catch (e) { return Promise.resolve(null); }
        return (p && typeof p.then === 'function') ? p : Promise.resolve(p);
    }

    /* la tendina: le tre voci, nella lingua dell'interfaccia, e il valore ricordato */
    function popola() {
        var sel = document.getElementById('mn-output-campo');
        if (!sel) return null;
        if (!sel.options.length) {
            C.voci({ metaAttiva: leggiMeta() }).forEach(function (v) {
                var o = document.createElement('option');
                o.value = v.id;
                o.textContent = t(v.chiave || ('crea_output_' + v.id), v.et);
                sel.appendChild(o);
            });
            sel.addEventListener('change', function () {
                /* 0120: il gesto passa dal core, che sa dell'interruttore. Con
                   «Metacomprensione» si apre la finestra; se la voce è respinta la
                   tendina torna alla scelta di prima quando la finestra si chiude. */
                var e = C.effetti(sel.value, { metaAttiva: leggiMeta(), prima: leggi(), fotoMontata: fotoMontata() });
                if (!e.respinta) scrivi(sel.value);
                var dopo = function () {
                    if (e.respinta) sel.value = e.scelta;
                    applica();
                    try { document.dispatchEvent(new CustomEvent('mappai-crea-output-changed', { detail: { scelta: leggi() } })); } catch (err) { }
                };
                if (e.avviso) finestra().then(dopo, dopo); else dopo();
            });
        }
        sel.value = leggi();
        return sel;
    }

    function applica() {
        var e = C.effetti(leggi(), { metaAttiva: leggiMeta(), fotoMontata: fotoMontata() });
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

    /* 0120: la scelta ricordata che l'interruttore non ammette più si riscrive al
       default, così chi legge localStorage da sé vede la stessa scelta della tendina */
    function riallinea() {
        try {
            var v = C.normalizza(localStorage.getItem(C.CHIAVE)), ok = valida(v);
            if (v !== ok) localStorage.setItem(C.CHIAVE, ok);
        } catch (e) { }
    }
    function avvia() { riallinea(); popola(); applica(); }
    /* dopo il bootstrap della Lettura (index.html, DOMContentLoaded): questo file sta
       dopo di lui, quindi il suo ascoltatore parte dopo e l'host spento resta spento */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia, { once: true });
    else avvia();

    window.MappAICreaOutput = {
        scelta: leggi,
        imposta: function (v) { scrivi(v); var s = popola(); if (s) s.value = leggi(); return applica(); },
        applica: applica,
        VOCI: C.VOCI,
        CHIAVE_META: C.CHIAVE_META
    };
    console.log('[MappAI] mappai-crea-output.js caricato ✓');
})();
