/* MappAI — LA BARRA DEL DOCUMENTO (una sola, 2/8/26)
 *
 *   documento.innerHTML = MappAIDocBar.stile() + MappAIDocBar.html({
 *       titolo: 'Sintesi',
 *       azioni: ['stampa', 'chiudi']
 *   });
 *
 * Perché esiste: la topbar dei documenti stampabili è oggi COPIATA in sei file
 * (quiz-print, branch-synthesis, causal-chains, timeline, glossary, live-reports)
 * con tre glifi stampante diversi e le emoji nei bottoni — contro la regola del
 * progetto (icone Lucide, mai emoji). L'audit UI del 31/7 l'aveva contata fra i
 * finding di gravità alta; il verdetto di Giacomo dello stesso giorno le ha
 * assegnato i token `--mm-doc-*`, che però non erano mai stati scritti.
 *
 * ⚠️ Questo modulo è la FONTE dei token `--mm-doc-*`, non `mappai-modal-tokens.css`.
 * Motivo: la barra vive per metà in finestre aperte con `window.open`, che NON
 * caricano il CSS dell'app. Se i token stessero nel foglio dell'app, la finestra
 * dovrebbe riscriverseli — e da lì ricomincerebbero a divergere. Chi la usa
 * dentro l'app inietta lo stesso `stile()`.
 *
 * Le icone sono SVG in linea (tracciati di Lucide): in una finestra staccata non
 * c'è `lucide.createIcons()` da chiamare, e un'emoji non è un'icona.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIDocBar = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* Tracciati Lucide (stroke, 24×24). Solo quelli che servono alla barra. */
    var GLIFI = {
        printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
        save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
        'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
    };

    /* Le azioni predefinite: chi chiama ne nomina una e non deve ricordare né il
       glifo né che cosa fa. `azione` è il nome del comando, non il codice: dentro
       l'app la barra è pilotata da un gestore, in una finestra staccata dai due
       comandi che il browser conosce già. */
    var AZIONI = {
        salva: { icona: 'save', etichetta: 'Salva', ruolo: 'quieto' },
        stampa: { icona: 'printer', etichetta: 'Stampa', ruolo: 'primario', js: 'window.print()' },
        qr: { icona: 'qr-code', etichetta: 'Condividi (QR)', ruolo: 'quieto' },
        chiudi: { icona: 'x', etichetta: 'Chiudi', ruolo: 'quieto', js: 'window.close()' },
        indietro: { icona: 'arrow-left', etichetta: 'Indietro', ruolo: 'quieto' }
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function icona(nome) {
        var d = GLIFI[nome];
        if (!d) return '';
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
            ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    }

    /* I token della barra. Altezza 52: sotto ci sta un bersaglio da 44 col suo
       respiro, ed è la misura che le sei copie avevano già in comune (padding
       10 + bottone 32) — qui il bottone sale a 44 perché su iPad si tocca. */
    function stile() {
        return '<style>\n' +
            ':root{--mm-doc-h:60px;--mm-doc-fondo:#ffffff;--mm-doc-bordo:#e2e8f0;' +
            '--mm-doc-testo:#0f172a;--mm-doc-testo-2:#475569;--mm-doc-accento:#4f46e5;' +
            '--mm-doc-accento-hover:#4338ca;--mm-doc-fs:13px;--mm-doc-r:10px;--mm-doc-icona:18px}\n' +
            '.mm-doc-bar{position:fixed;top:0;left:0;right:0;height:var(--mm-doc-h);' +
            'display:flex;align-items:center;justify-content:space-between;gap:14px;' +
            'padding:0 20px;background:var(--mm-doc-fondo);border-bottom:1px solid var(--mm-doc-bordo);' +
            'z-index:100;font-family:\'Space Mono\',monospace;font-size:var(--mm-doc-fs)}\n' +
            '.mm-doc-bar__t{display:flex;align-items:center;gap:8px;min-width:0;' +
            'font-weight:700;color:var(--mm-doc-testo)}\n' +
            '.mm-doc-bar__t b{color:var(--mm-doc-accento)}\n' +
            /* il nome del documento è l'unica parte elastica: tronca lui */
            '.mm-doc-bar__t span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
            'color:var(--mm-doc-testo-2);font-weight:400}\n' +
            '.mm-doc-bar__az{display:flex;align-items:center;gap:8px;flex:0 0 auto}\n' +
            '.mm-doc-btn{display:inline-flex;align-items:center;gap:7px;min-height:44px;' +
            'padding:0 15px;border-radius:var(--mm-doc-r);border:1px solid var(--mm-doc-bordo);' +
            'background:var(--mm-doc-fondo);color:var(--mm-doc-testo-2);cursor:pointer;' +
            'font:inherit;font-size:var(--mm-doc-fs);font-weight:700}\n' +
            '.mm-doc-btn svg{width:var(--mm-doc-icona);height:var(--mm-doc-icona);flex:0 0 auto}\n' +
            '.mm-doc-btn:hover{border-color:var(--mm-doc-accento);color:var(--mm-doc-accento)}\n' +
            '.mm-doc-btn--primario{background:var(--mm-doc-accento);border-color:var(--mm-doc-accento);color:#fff}\n' +
            '.mm-doc-btn--primario:hover{background:var(--mm-doc-accento-hover);border-color:var(--mm-doc-accento-hover);color:#fff}\n' +
            '.mm-doc-spazio{height:var(--mm-doc-h)}\n' +
            /* stampando, la barra e il suo spazio spariscono: sono comandi, non documento */
            '@media print{.mm-doc-bar,.mm-doc-spazio{display:none!important}}\n' +
            '</style>';
    }

    /* opts: { titolo, sotto, azioni:[nome | {id,icona,etichetta,ruolo,js}], spazio } */
    function html(opts) {
        opts = opts || {};
        var az = (opts.azioni && opts.azioni.length ? opts.azioni : ['stampa', 'chiudi']).map(function (a) {
            var base = typeof a === 'string' ? AZIONI[a] : null;
            var b = base ? Object.assign({ id: a }, base) : (a || {});
            if (typeof a === 'object' && a.azione && AZIONI[a.azione]) {
                b = Object.assign({ id: a.azione }, AZIONI[a.azione], a);
            }
            return b;
        }).filter(function (b) { return b.etichetta; });

        return '<div class="mm-doc-bar no-print">' +
            '<span class="mm-doc-bar__t"><b>MappAI</b>' +
            (opts.titolo ? '<span>· ' + esc(opts.titolo) + '</span>' : '') + '</span>' +
            '<span class="mm-doc-bar__az">' + az.map(function (b) {
                return '<button type="button" class="mm-doc-btn' +
                    (b.ruolo === 'primario' ? ' mm-doc-btn--primario' : '') + '"' +
                    ' data-doc-azione="' + esc(b.id) + '"' +
                    (b.js ? ' onclick="' + esc(b.js) + '"' : '') + '>' +
                    icona(b.icona) + '<span>' + esc(b.etichetta) + '</span></button>';
            }).join('') + '</span></div>' +
            (opts.spazio === false ? '' : '<div class="mm-doc-spazio no-print"></div>');
    }

    /* ── IL DOCUMENTO OSPITATO DALL'APP ───────────────────────────────────────
       Un documento stampabile porta la SUA barra perché lo si apre anche fuori
       di qui: è il file che riceve lo studente con DSA sul suo computer, e lì il
       chip del lettore e «Stampa» sono l'unico modo di usarlo. Dentro l'app,
       invece, quella barra è la seconda — sopra c'è già quella della console.

       Perché si spegne da FUORI e non si evita di emetterla: i file sono già
       scritti sul disco e nessuno li riscriverà. Una regola iniettata vale
       anche per loro, mentre un `if` nel generatore varrebbe solo per i
       prossimi. `.no-print` è la classe che TUTTI i documenti dell'app usano
       per la loro barra e per il suo distanziatore (sintesi, quiz, catena dei
       perché, glossario, report), quindi la regola è una sola.

       ⚠️ Serve un iframe di STESSA ORIGINE (`srcdoc`, non `src="data:…"`): un
       documento a origine opaca non si lascia toccare e il tentativo lancia un
       SecurityError. Le due funzioni ritornano `false` quando non ci riescono,
       invece di ingoiare l'errore: chi chiama deve poterlo dire.               */

    function _docDi(iframe) {
        try {
            var d = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
            return (d && d.body) ? d : null;
        } catch (e) { return null; }   /* origine opaca */
    }

    /* Spegne la barra interna del documento. Idempotente: si può richiamare a
       ogni `load` senza accumulare fogli di stile. */
    function nascondiInIframe(iframe) {
        var d = _docDi(iframe);
        if (!d) return false;
        try {
            if (d.getElementById('mm-doc-in-casa')) return true;
            var st = d.createElement('style');
            st.id = 'mm-doc-in-casa';
            st.textContent = '.no-print,.mm-doc-bar,.mm-doc-spazio{display:none !important}';
            (d.head || d.documentElement).appendChild(st);
            return true;
        } catch (e) { return false; }
    }

    /* Stampa il documento dentro l'iframe. Sostituisce il
       `iframe.contentWindow.print()` avvolto in un catch muto: con un iframe a
       origine opaca quello lancia SecurityError e il bottone non fa nulla senza
       dirlo. */
    function stampaIframe(iframe) {
        var d = _docDi(iframe);
        if (!d) return false;
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            return true;
        } catch (e) { return false; }
    }

    return {
        stile: stile, html: html, icona: icona, AZIONI: AZIONI, GLIFI: GLIFI,
        nascondiInIframe: nascondiInIframe, stampaIframe: stampaIframe
    };
}));
