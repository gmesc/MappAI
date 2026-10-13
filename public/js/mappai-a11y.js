// ==========================================
// STRUMENTI A11Y (sillabazione, zoom testo, floating actions, regola di contesto) — estratto da app.js
// ==========================================
// Caricato DOPO app.js. NB: isHyphenated/originalModalHtml (reset da closeSourceModal),
// currentZoomIdx/zooms (scritti da applyTextZoom qui sotto, letti dal DOMContentLoaded finale
// di app.js) sono let/const top-level qui: i riferimenti bare cross-script si risolvono a
// runtime via scope lessicale globale condiviso (pattern batches 2-6).
let isHyphenated = false;
let originalModalHtml = "";

window.toggleHyphenation = function (btn) {
    const body = document.getElementById('source-modal-body');
    if (!body) return;

    btn.classList.toggle('bg-indigo-100');
    isHyphenated = !isHyphenated;

    if (isHyphenated) {
        body.classList.add('hyphens-auto-force');
        /* Sezione Hypher: la sillabazione la fa il CSS nativo (`hyphens: auto`).
           ⚠️ 9/9/26: hypher.js e it.js sono stati TOLTI dal repo — la libreria
           era senza nota di copyright (BSD-3 la richiede) e i pattern italiani
           venivano da ithyph.tex (LPPL, che la FSF dice incompatibile con la
           GPL). Questo blocco resta come storia: non gira, e non c’è più niente
           da chiamare.
        if (!originalModalHtml) originalModalHtml = body.innerHTML;
        
        if (window.Hypher && window.itPatterns) {
            const hyphenator = new window.Hypher(window.itPatterns);
            const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while(node = walk.nextNode()) {
                if (node.nodeValue.trim() !== '') {
                    node.nodeValue = hyphenator.hyphenateText(node.nodeValue);
                }
            }
        }
        */
    } else {
        body.classList.remove('hyphens-auto-force');
        if (originalModalHtml) {
            body.innerHTML = originalModalHtml;
            originalModalHtml = "";
        }
    }
};

window.toggleFloatingActions = function () {
    const menu = document.getElementById('floating-actions-menu');
    if (!menu) return;
    /* le voci fuori dalla prova beta tornano solo con l'interruttore (chi sviluppa) */
    try { if (localStorage.getItem('mappai_azioni_tutte') === '1') menu.querySelectorAll('[data-beta-nascosto]').forEach(b => b.removeAttribute('data-beta-nascosto')); } catch (e) { }
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        window.safeCreateIcons();
    }
};

// Close menu on click outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('floating-actions-container');
    const menu = document.getElementById('floating-actions-menu');
    if (container && !container.contains(e.target) && menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

/* L'interlinea viveva solo nel pannello del cerchio giallo, tolto il 26/9/2026
   (packet 0039): se n'è andata con lui. */
let currentZoomIdx = localStorage.getItem('mappai-a11y-zoom') ? parseInt(localStorage.getItem('mappai-a11y-zoom')) : 0;
const zooms = [1.0, 1.5, 2.0];

/* IL COMANDO «Aa» (09/10/26, packet 0087 lotto 6). Giacomo: «deve sempre essere
   un bottone singolo 'Aa' con un ciclo loop di fattori di ingrandimento». A
   schermo il bottone dice solo «Aa»; il fattore a cui si è arrivati lo dicono
   l'aria-label e il suggerimento («Grandezza del testo: ×1,5»). I fattori sono
   della superficie che lo monta; qui c'è soltanto come si scrive, in un posto
   solo — virgola in italiano, punto in inglese (`aa_sep`). */
window.MappAIAa = {
    etichetta: 'Aa',
    fattore: function (f) {
        var n = Number(f) || 1;
        var sep = window.t ? window.t('aa_sep', ',') : ',';
        return '×' + String(n).replace('.', sep);
    },
    aria: function (nome, f) { return nome + ': ' + window.MappAIAa.fattore(f); }
};

window.cycleTextZoom = function () {
    window.applyTextZoom((currentZoomIdx + 1) % zooms.length);
};

window.applyTextZoom = function (idx) {
    currentZoomIdx = idx;
    localStorage.setItem('mappai-a11y-zoom', currentZoomIdx);
    const z = zooms[currentZoomIdx];

    // Fuori dal contesto di lettura (landing, COSTRUISCI, INSEGNA, workspace di
    // ELABORA) lo zoom vale 1: là gli strumenti compensativi non agiscono, e il
    // bottone che li governa non c'è nemmeno. Vedi in fondo al file.
    const inContext = window.a11yInReadingContext
        ? window.a11yInReadingContext()
        : !!document.getElementById('map-view')?.classList.contains('active');
    const effectiveZ = inContext ? z : 1.0;

    // Imposta la variabile CSS per permettere l'anti-zoom sui bottoni
    document.documentElement.style.setProperty('--app-zoom', effectiveZ);

    if (effectiveZ > 1.0) {
        document.body.classList.add('a11y-zoomed-modals');
    } else {
        document.body.classList.remove('a11y-zoomed-modals');
    }

    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2');
    if (effectiveZ === 1.0) {
        document.body.classList.add('a11y-zoom-x1');
    } else if (effectiveZ === 1.5) {
        document.body.classList.add('a11y-zoom-x15');
    } else if (effectiveZ === 2.0) {
        document.body.classList.add('a11y-zoom-x2');
    }

    // Zoom per tutti i contenitori primari e modali con testo
    const zoomSelectors = [
        '#sidebar',
        '#source-modal-content-box',
        '#ai-modal-content-box',
        '#study-player-modal > div',
        '#app-guide-modal > div',
        '#app-tutorial-modal > div',
        '#config-ai-modal > div',
        '#validate-link-modal > div',
        '#alert-box',
        '#prompt-box',
        '#confirm-box',
        '#study-config-modal > div',
        '#vault-manager-box',
        '#edit-node-box',
        '#contextual-ai-extension-modal > div',
        '#feedback-box'
    ];

    // Applica inline style per bypassare bug di Safari su calc/CSS variables
    const sourceBody = document.getElementById('source-modal-body');
    const aiBody = document.getElementById('ai-modal-body');
    const flashcardFront = document.getElementById('flashcard-front-text');
    const flashcardBack = document.getElementById('flashcard-back-text');
    const quizQuestion = document.getElementById('study-quiz-question');
    const quizOptions = document.querySelectorAll('#study-quiz-options .quiz-option');

    if (sourceBody) {
        if (effectiveZ === 1.0) sourceBody.style.removeProperty('font-size');
        else sourceBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (aiBody) {
        if (effectiveZ === 1.0) aiBody.style.removeProperty('font-size');
        else aiBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (flashcardFront) {
        if (effectiveZ === 1.0) flashcardFront.style.removeProperty('font-size');
        else flashcardFront.style.setProperty('font-size', `${effectiveZ * 24}px`, 'important');
    }
    if (flashcardBack) {
        if (effectiveZ === 1.0) flashcardBack.style.removeProperty('font-size');
        else flashcardBack.style.setProperty('font-size', `${effectiveZ * 18}px`, 'important');
    }
    if (quizQuestion) {
        if (effectiveZ === 1.0) quizQuestion.style.removeProperty('font-size');
        else quizQuestion.style.setProperty('font-size', `${effectiveZ * 20}px`, 'important');
    }
    quizOptions.forEach(opt => {
        if (effectiveZ === 1.0) opt.style.removeProperty('font-size');
        else opt.style.setProperty('font-size', `${effectiveZ * 13}px`, 'important');
    });

    // Ripristina root font size se era stato modificato
    document.documentElement.style.fontSize = '';

    // Forza reflow su iOS Safari per aggiornare le variabili CSS nei fogli di stile
    document.documentElement.classList.toggle('force-reflow');
    const _reflow = document.documentElement.offsetHeight;

    window.safeCreateIcons();
};

// ══════════════════════════════════════════════════════════════════════════
// DOVE VIVONO GLI STRUMENTI COMPENSATIVI
// ══════════════════════════════════════════════════════════════════════════
// Servono a LEGGERE: la mappa, le schede dei nodi, il raccoglitore in sidebar.
// Sulla landing (COSTRUISCI / INSEGNA / ELABORA) non hanno niente da compensare
// e anzi fanno danno — ingrandiscono una griglia di bottoni, tirano una riga
// sopra un'interfaccia di lavoro.
//
// Quindi gli effetti — la riga di lettura e lo zoom del testo, che si accendono
// dalla fila del modale della fonte — si SOSPENDONO fuori dalla lettura e si
// RIPRISTINANO al rientro: lo stato scelto non si perde, semplicemente non agisce
// dove non serve.
//
// Il cerchio giallo che apriva il pannello degli strumenti (i filtri dei colori,
// l'interlinea) è stato spento il 19/9/2026 e tolto il 26/9/2026 (packet 0039):
// con lui sono usciti i due interruttori `mappai_a11y_bottone` e
// `mappai_a11y_everywhere`, che adesso nessuno legge più.
(function () {
    'use strict';

    let _suspended = null;      // stato sospeso fuori contesto (null = effetti attivi)

    /** Il contesto di lettura: mappa aperta e nessun workspace di ELABORA davanti. */
    function inReadingContext() {
        try {
            const mv = document.getElementById('map-view');
            if (!mv || !mv.classList.contains('active')) return false;   // landing / Costruisci / Insegna
            // ELABORA a tutto schermo. `offsetParent` NON serve: per un elemento
            // position:fixed è sempre null, e il controllo direbbe «non c'è»
            // mentre copre lo schermo. L'overlay viene rimosso all'uscita, quindi
            // esistere + non essere display:none basta e avanza.
            const ov = document.getElementById('elab-overlay');
            if (ov && getComputedStyle(ov).display !== 'none') return false;
            /* ⚠️ E le CONSOLE del motore (14/8). Erano nate dopo questa guardia,
               che conosceva solo l'ELABORA v1: con una mappa aperta sotto,
               `map-view` resta `active` anche quando davanti c'è la console di
               ELABORA, INSEGNA o la Cabina — quindi il bottone restava a
               schermo, e per giunta SOPRA la console (misurato con
               `elementFromPoint`: l'elemento in cima era la sua icona).
               Una console è una schermata di lavoro, non una di lettura: gli
               strumenti compensativi lì non hanno niente da compensare.
               `.mm-box--console` e non `.mm-overlay`: un modale qualunque può
               benissimo essere una superficie di LETTURA (la Scheda Focus di un
               nodo lo è), e spegnere gli strumenti proprio lì sarebbe il
               contrario di quello che serve. */
            const cons = document.querySelector('.mm-box--console');
            if (cons && getComputedStyle(cons).display !== 'none') return false;
            return true;
        } catch (e) { return true; }
    }
    window.a11yInReadingContext = inReadingContext;

    function suspend() {
        if (_suspended) return;
        const ruler = document.getElementById('reading-ruler');
        _suspended = { ruler: !!(ruler && ruler.classList.contains('active')) };
        if (_suspended.ruler) ruler.classList.remove('active');
        if (window.applyTextZoom) window.applyTextZoom(_zoomIdx());   // fuori contesto → x1 (lo decide applyTextZoom)
    }

    function restore() {
        if (!_suspended) return;
        if (_suspended.ruler) {
            const r = document.getElementById('reading-ruler');
            if (r) r.classList.add('active');
        }
        _suspended = null;
        if (window.applyTextZoom) window.applyTextZoom(_zoomIdx());
    }

    function _zoomIdx() {
        const v = parseInt(localStorage.getItem('mappai-a11y-zoom') || '0', 10);
        return isNaN(v) ? 0 : v;
    }

    /* ── IL CERCHIO GIALLO NON C'È PIÙ (spento il 19/9/2026, tolto il 26/9) ──────
       Era `position: fixed` in alto a destra con z-index 999999: galleggiava sopra
       QUALUNQUE cosa, compresa la testata del Banco di revisione. Gli strumenti di
       lettura restano dove si legge davvero: la fila del modale della fonte
       (#modal-a11y-toolbar: sillabazione, spaziatura, voce, Aa, riga di lettura,
       lettura veloce) e Cabina › Aspetto e leggibilità per il carattere. Sono usciti
       con lui i quattro filtri che vivevano SOLO nel suo pannello (inverti colori,
       riduci contrasti, contrasti elevati, scala di grigi) e l'interlinea.
       Qui resta la regola di contesto per riga di lettura e zoom. */
    function sync() {
        if (inReadingContext()) restore(); else suspend();
    }

    // Il contesto cambia in tre modi: map-view che si attiva/disattiva, l'overlay di
    // ELABORA che compare/sparisce, e i cambi di vista fatti da altri moduli. Un solo
    // osservatore su <body> li copre tutti; il rAF evita di ricalcolare N volte per tick.
    // NB: setTimeout e non requestAnimationFrame. In una finestra in secondo piano
    // il rAF non scatta: la richiesta resta appesa, il flag «già in coda» non si
    // riabbassa più e da lì in poi nessun cambio di vista viene più visto.
    let _queued = false;
    function schedule() {
        if (_queued) return;
        _queued = true;
        setTimeout(function () { _queued = false; sync(); }, 0);
    }
    function boot() {
        sync();
        try {
            new MutationObserver(schedule).observe(document.body, {
                childList: true, subtree: false, attributes: true, attributeFilter: ['class', 'style']
            });
            const mv = document.getElementById('map-view');
            if (mv) new MutationObserver(schedule).observe(mv, { attributes: true, attributeFilter: ['class'] });
        } catch (e) { /* niente osservatore: resta la sync all'avvio */ }
        window.addEventListener('hashchange', schedule);
        document.addEventListener('visibilitychange', schedule);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
