/*
 * mappai-font.js — IL CARATTERE DELL'APP, applicato (18/8/26)
 * -----------------------------------------------------------------------------
 * La parte con le mani: legge la scelta del docente, la scrive, la applica alla
 * pagina e la porta dentro jsPDF quando si esporta un PDF. Il catalogo, le
 * metriche e le regole stanno nel core puro (mappai-font-core.js), che gira
 * anche in Node: qui c'è solo ciò che tocca il DOM e il disco.
 *
 * ── LA REGOLA ────────────────────────────────────────────────────────────────
 * Il carattere scelto in Cabina vale per TUTTA l'app e per tutto ciò che l'app
 * genera: le mappe sul canvas, i quiz, le flashcard, le sintesi, i fogli. Un
 * documento aperto in ELABORA può avere il SUO carattere, che vince solo lì
 * (MappAIFontCore.risolvi).
 *
 * ── COME ARRIVA IL CARATTERE ─────────────────────────────────────────────────
 * Le @font-face si iniettano al boot dal catalogo, con i file di public/fonts/.
 * Non c'è un foglio CSS a parte apposta: sarebbe una seconda lista di caratteri
 * da tenere allineata al catalogo, e le @font-face sono dieci righe. Il browser
 * scarica solo i tagli che servono davvero.
 * ⚠️ I file sono LOCALI e non è un dettaglio: l'app si apre con `loadFile`
 * (file://) e fino a oggi perfino Space Mono arrivava da fonts.googleapis.com —
 * in aula senza rete l'app cadeva sul monospace di sistema senza dirlo.
 *
 * ── jsPDF ────────────────────────────────────────────────────────────────────
 * I PDF geometrici (mappa, dossier, foglio dei nodi, vista studio) disegnano il
 * testo con jsPDF, che vuole il font come TTF base64 registrato NELL'ISTANZA.
 * Quei moduli pesano ~200 KB l'uno e servono solo a chi esporta: si caricano a
 * richiesta, non al boot.
 * ⚠️ TestMe ha le curve in `CFF `; jsPDF legge solo `glyf`. I file in
 * public/fonts/ sono già convertiti da tools/font/prepara-font.py, a metriche
 * identiche — se un giorno si ripartisse dagli .otf originali, l'export
 * ricadrebbe in Helvetica in silenzio.
 *
 * Kill-switch: localStorage `mappai_font_selettore = '0'` → il catalogo resta
 * ma nessuno lo può cambiare: tutto Space Mono, come prima di questa feature.
 */
(function () {
    'use strict';

    // Un modulo con ascolti globali si carica una volta sola: due copie
    // vorrebbero dire due iniezioni di @font-face e due ascolti sullo storage.
    if (window.MappAIFont) return;

    var CHIAVE = 'mappai_font_app';        // la scelta del docente
    var KILL = 'mappai_font_selettore';    // l'interruttore della feature
    var ID_STILE = 'mappai-font-facce';
    var VER_FONT = 'f1';   // ← si bumpa rigenerando i file dei caratteri

    /*
     * Dove stanno i file dei caratteri, visto da CHI CI STA GUARDANDO.
     * ⚠️ Un `url('fonts/X.ttf')` dentro un <style> iniettato si risolve rispetto
     * al DOCUMENTO, non al modulo: va bene per public/index.html, che sta nella
     * radice, e va in 404 per qualunque pagina più in basso (i banchi di
     * public/dev/ — misurato: /dev/fonts/… non esiste). Il modulo invece sa
     * sempre dove si trova, e da public/js/ i caratteri sono un piano sopra.
     */
    var _mio = (document.currentScript && document.currentScript.src) || '';
    var BASE_FONT = _mio ? _mio.replace(/[^/]*$/, '') + '../fonts/' : 'fonts/';

    function _core() {
        return window.MappAIFontCore || null;
    }

    function _ls(k) {
        try { return localStorage.getItem(k); } catch (e) { return null; }
    }

    /** La feature è accesa? Spenta = tutto come prima, Space Mono e basta. */
    function accesa() { return _ls(KILL) !== '0'; }

    /** L'id del carattere dell'app. Mai null: al peggio il default. */
    function attivo() {
        var C = _core();
        if (!C) return 'space-mono';
        if (!accesa()) return C.DEFAULT;
        return C.valido(_ls(CHIAVE)) ? _ls(CHIAVE) : C.DEFAULT;
    }

    /** Lo stack CSS del carattere dell'app (o di quello chiesto). */
    function stack(id) {
        var C = _core();
        return C ? C.stackDi(id || attivo()) : "'Space Mono', monospace";
    }

    /** Le metriche per impaginare un foglio stampabile. */
    function metriche(id) {
        var C = _core();
        return C ? C.metriche(id || attivo()) : { advance: 0.612, headAdvance: 0.672, mono: true };
    }

    /**
     * Applica il carattere alla pagina. Una variabile sola: la regola `*` di
     * style.css la legge, quindi cambia tutto in un colpo senza toccare 86
     * dichiarazioni sparse.
     */
    function applica(id) {
        var scelto = id || attivo();
        var C = _core();
        if (!C) return scelto;
        document.documentElement.style.setProperty('--app-font', C.stackDi(scelto));
        document.documentElement.setAttribute('data-font', scelto);
        return scelto;
    }

    /** Scrive la scelta e la applica. Ritorna l'id che è rimasto in vigore. */
    function imposta(id) {
        var C = _core();
        if (!C || !accesa()) return attivo();
        if (!C.valido(id)) return attivo();
        try { localStorage.setItem(CHIAVE, id); } catch (e) { /* quota: si applica comunque */ }
        applica(id);
        annunciaMetriche(id);
        precaricaIncorporabile(id);
        // Chi disegna testo per conto suo (il canvas D3, la vista studio) non si
        // accorge di una variabile CSS: glielo si dice. Trappola 15 della guida.
        try {
            window.dispatchEvent(new CustomEvent('mappai-font-cambiato', { detail: { id: id } }));
        } catch (e) { /* vecchi runtime */ }
        return id;
    }

    // ── le @font-face ────────────────────────────────────────────────────────
    function iniettaFacce() {
        var C = _core();
        if (!C || document.getElementById(ID_STILE)) return;
        var st = document.createElement('style');
        st.id = ID_STILE;
        st.textContent = C.tutteLeFacce(BASE_FONT);
        (document.head || document.documentElement).appendChild(st);
    }

    /**
     * Il CSS del carattere per un DOCUMENTO in finestra propria (stampa, PDF
     * headless, anteprima) — dove `--app-font` non esiste, perché quel documento
     * non carica style.css.
     *
     *   const F = MappAIFont.cssDocumento(doc.font);
     *   html = '<style>' + F.facce + ' body{font-family:' + F.stack + '}</style>' + …
     *
     * `idDocumento` è la scelta fatta in ELABORA per QUEL documento; se non c'è,
     * comanda il carattere dell'app (MappAIFontCore.risolvi).
     *
     * ⚠️ Le @font-face puntano ai file con un URL ASSOLUTO, ricavato da dove sta
     * questo modulo: una finestra aperta con window.open non ha la stessa base
     * del documento dell'app, e un percorso relativo ci finirebbe accanto invece
     * che in public/fonts/. Per un documento che deve viaggiare FUORI da questo
     * computer (condiviso via QR, mandato per email) l'URL non basta: serve il
     * carattere incorporato — vedi `cssDocumentoIncorporato`.
     */
    function cssDocumento(idDocumento) {
        var C = _core();
        var id = C ? C.risolvi(idDocumento, attivo()) : 'space-mono';
        return {
            id: id,
            stack: C ? C.stackDi(id) : "'Space Mono', monospace",
            facce: _facceDocumento(id),
            /* `false` = il documento NON si porta dentro il carattere e lo
               chiede a un percorso: fuori di qui non ce l'avrà. Chi lo scrive
               deve poterlo sapere, invece di scoprirlo dal prodotto. */
            incorporato: !!_bytesDi(id),
            metriche: metriche(id)
        };
    }

    /*
     * I byte del carattere, se sono già in memoria. Il modulo si precarica —
     * vedi `precaricaIncorporabile` — perché i costruttori dei documenti sono
     * SINCRONI: chiamano `styleDocumento` dentro un template literal, e renderla
     * asincrona vorrebbe dire riscrivere i dieci punti che la usano.
     */
    function _bytesDi(id) {
        var C = _core();
        if (!C) return null;
        var f = C.font(id);
        return (f.incorporaGlobale && window[f.incorporaGlobale]) || null;
    }

    /*
     * Le @font-face di un DOCUMENTO. Coi byte dentro se ci sono, altrimenti col
     * percorso — che è un ripiego, non la strada normale.
     *
     * ⚠️ PERCHÉ I BYTE E NON UN PERCORSO. Misurato il 18/8 su un PDF vero: la
     * finestra che stampa carica l'HTML come `data:text/html` (main.js), cioè
     * un'ORIGINE OPACA, e da lì un caricamento `file://` è BLOCCATO. Il
     * carattere non arrivava mai e il PDF usciva col ripiego, mentre l'app lo
     * mostrava giusto — perché nell'app il documento sta sull'origine `file://`
     * dell'app, stessa origine, e passa. Il sintomo era «l'editor sì, il PDF no».
     * Lo stesso percorso è per giunta legato a QUESTA cartella: nell'app
     * pacchettizzata non esiste, e sul telefono di un allievo nemmeno.
     * I byte sono un sottoinsieme dei glifi compresso in WOFF: 76-101 KB, non i
     * 433 KB del .ttf intero (tools/font/prepara-font.py).
     */
    function _facceDocumento(id) {
        var C = _core();
        if (!C) return '';
        var inc = _bytesDi(id);
        if (inc) return inc.facce(C.font(id).famiglia);
        return C.facce(id, BASE_FONT);
    }

    /**
     * Porta in memoria i byte di un carattere, così i documenti costruiti dopo
     * se lo portano dentro. Si chiama al boot per il carattere dell'app e
     * quando un documento ne dichiara uno suo.
     */
    function precaricaIncorporabile(id) {
        var C = _core();
        if (!C) return Promise.resolve(false);
        var f = C.font(id || attivo());
        if (!f.incorpora) return Promise.resolve(false);
        if (window[f.incorporaGlobale]) return Promise.resolve(true);
        return _caricaScript(f.incorpora).then(function () {
            return !!window[f.incorporaGlobale];
        }).catch(function () { return false; });
    }

    /**
     * Il blocco CSS da mettere in TESTA allo stile di un documento:
     * le @font-face + la variabile che i costruttori leggono.
     *
     *   html = '<style>' + MappAIFont.styleDocumento(doc.font) + …resto… + '</style>'
     *
     * I costruttori scrivono `font-family: var(--doc-font, 'Space Mono', monospace)`:
     * col ripiego dentro la variabile, un documento aperto dove questo blocco non
     * c'è (un file HTML già salvato, riaperto fra un anno) resta leggibile invece
     * di cadere sul serif di sistema.
     */
    function styleDocumento(idDocumento) {
        var F = cssDocumento(idDocumento);
        return F.facce + '\n:root{--doc-font:' + F.stack + ';}\n';
    }

    // ── jsPDF: i moduli base64, caricati a richiesta ─────────────────────────
    var _inCorso = {};

    function _caricaScript(src) {
        if (_inCorso[src]) return _inCorso[src];
        _inCorso[src] = new Promise(function (ok, ko) {
            var s = document.createElement('script');
            /* stesso motivo di BASE_FONT: da public/js/ il vendor è qui accanto.
               Il marcatore c'è perché questi file li RIGENERA uno strumento
               (tools/font/prepara-font.py): stesso nome, contenuto diverso —
               cioè il caso in cui la cache serve il vecchio senza dirlo
               (invariante 5). Si bumpa quando si rigenerano i caratteri. */
            s.src = (_mio ? _mio.replace(/[^/]*$/, '') : 'js/') + src + '?v=' + VER_FONT;
            s.onload = function () { ok(true); };
            s.onerror = function () { ko(new Error('font non caricato: ' + src)); };
            (document.head || document.documentElement).appendChild(s);
        });
        return _inCorso[src];
    }

    /**
     * Prepara il carattere per jsPDF e ritorna il registratore.
     * → { fontName, registerInto(doc) } oppure null se non ce l'ha fatta.
     */
    function perPdf(id) {
        var C = _core();
        if (!C) return Promise.resolve(null);
        var f = C.font(id || attivo());
        if (window[f.globale]) return Promise.resolve(window[f.globale]);
        return _caricaScript(f.modulo).then(function () {
            return window[f.globale] || null;
        }).catch(function () { return null; });
    }

    /**
     * Registra il carattere in un documento jsPDF già aperto.
     * Ritorna il NOME da passare a doc.setFont(), o null se non si è potuto:
     * in quel caso chi chiama deve tenere il font che aveva, non fingere.
     *
     *   const nome = await MappAIFont.registraIn(doc);
     *   if (nome) doc.setFont(nome, 'normal');
     */
    function registraIn(doc, id) {
        return perPdf(id).then(function (m) {
            if (!m || !m.registerInto(doc)) return null;
            return m.fontName;
        });
    }

    /**
     * Dice a chi IMPAGINA quanto è largo un carattere adesso.
     *
     * I fogli stampabili (quiz cartacei, flashcard, foglio dei nodi) decidono
     * l'a-capo contando i caratteri, non misurandoli nel browser — apposta: così
     * la carta esce giusta anche in printToPDF e in un PDF fatto con jsPDF. Quei
     * moduli sono puri e girano in Node: non possono leggere `window`, quindi la
     * misura gliela si annuncia.
     *
     * ⚠️ Senza questo annuncio non si romperebbe niente in modo visibile — i
     * caratteri nuovi sono più STRETTI di Space Mono, quindi il testo starebbe
     * comunque dentro. Il foglio però riserverebbe il 38% di spazio in più del
     * necessario e il motore rimpicciolirebbe il corpo per farcelo stare: su un
     * carattere scelto per leggere meglio, il risultato rovesciato. Misurato sul
     * foglio dei nodi: 30 caratteri per riga contro i 38 che ci stanno davvero.
     */
    function annunciaMetriche(id) {
        var m = metriche(id);
        if (window.MappAIPrintLayout && window.MappAIPrintLayout.setFontMetrics) {
            window.MappAIPrintLayout.setFontMetrics(m);
        }
        if (window.MappAINodeSheet && window.MappAINodeSheet.setFontMetrics) {
            window.MappAINodeSheet.setFontMetrics(m);
        }
        return m;
    }

    // ── avvio ────────────────────────────────────────────────────────────────
    function init() {
        iniettaFacce();
        applica();
        annunciaMetriche();
        /* I byte del carattere in vigore, subito: il primo documento costruito
           dopo il boot deve poterseli portare dentro. Uno solo, non quattro. */
        precaricaIncorporabile();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.MappAIFont = {
        CHIAVE: CHIAVE, KILL: KILL,
        accesa: accesa, attivo: attivo, imposta: imposta, applica: applica,
        stack: stack, metriche: metriche, cssDocumento: cssDocumento, styleDocumento: styleDocumento,
        annunciaMetriche: annunciaMetriche, precaricaIncorporabile: precaricaIncorporabile,
        perPdf: perPdf, registraIn: registraIn,
        elenco: function () { var C = _core(); return C ? C.elenco() : []; }
    };
})();
