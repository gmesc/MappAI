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

    /* Porta un documento di SINTESI già scritto sul disco alla taglia di testo
       corrente (+60%, 10/8/26). I file salvati prima di quella data portano nel
       loro `<style>` i corpi vecchi — 11px per il testo — e nessuno li riscrive:
       aperti nell'anteprima si leggevano piccoli mentre quelli nuovi no, cioè lo
       stesso documento aveva due taglie a seconda di quando era stato generato.
       Il foglio si appende in coda al `<head>`, quindi vince per ordine a parità
       di specificità con le regole originali.
       ⚠️ È IDEMPOTENTE per costruzione: dichiara gli stessi `calc()` del
       generatore, e il fattore lo legge da `--ap-txt-k` col valore corrente come
       ripiego. Su un documento NUOVO — che quella variabile ce l'ha — produce
       esattamente i valori che ha già; su uno VECCHIO — che non ce l'ha — usa il
       ripiego e lo porta alla stessa taglia. Un foglio con i pixel finiti avrebbe
       dovuto essere tenuto allineato al generatore a mano, e sarebbe divergito
       al primo ritocco.
       ⚠️ Non tocca la modalità dislessia: quelle scale sono assolute e
       deliberate, e il documento vecchio le ha già uguali a quelle nuove.
       Se il documento non è una sintesi (niente `.bs-body`) non fa nulla. */
    var SCALA_TESTO = [
        'body{font-size:calc(11px * var(--ap-txt-k,1.6));max-width:72ch}',
        '.bs-title{font-size:calc(20px * var(--ap-txt-k,1.6))}',
        '.bs-subtitle{font-size:calc(10px * var(--ap-txt-k,1.6))}',
        '.bs-body h3{font-size:calc(14px * var(--ap-txt-k,1.6))}',
        '.bs-body h4{font-size:calc(12px * var(--ap-txt-k,1.6))}',
        '.bs-body p,.bs-body li{font-size:calc(11px * var(--ap-txt-k,1.6))}',
        '.bs-citations-title{font-size:calc(9px * var(--ap-txt-k,1.6))}',
        '.bs-cite-num,.bs-cite-text{font-size:calc(10px * var(--ap-txt-k,1.6))}',
        '.bs-footer{font-size:calc(9px * var(--ap-txt-k,1.6))}',
        '.ap-sec{width:calc(20px * var(--ap-txt-k,1.6));height:calc(20px * var(--ap-txt-k,1.6));font-size:calc(11px * var(--ap-txt-k,1.6))}',
        /* Via anche il fondo crema dei documenti vecchi: dal 10/8 la veste ad
           alta leggibilità cambia il testo e non il colore della carta. */
        'body.ap-dys{background:#f8fafc}',
        'body.ap-dys .bs-body{background:#fff}',
        /* ⚠️ E IN STAMPA, che è il caso che morde. Il PDF nasce da questo stesso
           documento: senza queste righe il foglio dei file vecchi usciva col
           testo piccolo (i loro 11px), e a 1,5× e 2× con OGNI PAGINA campita di
           crema — "body.ap-dys" porta una classe e batteva il "background:white"
           del loro blocco di stampa, che è una regola di elemento.
           Il "max-width" torna libero: in stampa la colonna la decide @page. */
        '@media print{',
        /* ⚠️ `padding:0` sul BODY, e non solo sul riquadro: i documenti più
           vecchi dichiarano `body{padding:10px}` nel loro blocco di stampa —
           2,65mm che si sommano al margine di @page. Misurato su un file del
           2A: 22,6mm a sinistra dove ne erano stati chiesti 20. Il riquadro lo
           azzeravamo già; il body no, ed era l'ultimo residuo. */
        /* ⚠️ LE DUE FAMIGLIE DI SELETTORI CONVIVONO, e non è provvisorio.
           Dall'11/8/26 la testata della sintesi è quella condivisa (.mm-dh*),
           ma i documenti GIÀ SCRITTI nei vault portano ancora .bs-header /
           .bs-title / .bs-subtitle: quel file sul disco ha il suo CSS dentro e
           non lo si può riscrivere. Chi apre in anteprima una sintesi di
           settimana scorsa deve vederla impaginata come una di oggi, quindi qui
           si nominano ENTRAMBE. Togliere le vecchie vuol dire rompere in
           silenzio i documenti già consegnati. */
        '  body,body.ap-dys{background:#fff !important;max-width:none;padding:0}',
        '  body.ap-dys .bs-body,body.ap-dys .bs-header,body.ap-dys .mm-dh{background:#fff !important}',
        /* Gli stessi punti e gli stessi margini del generatore (10/8): un
           documento vecchio stampato dall'anteprima deve dare lo stesso foglio
           di uno nuovo, o la stessa sintesi esce in due misure a seconda di
           quando è stata prodotta. Le regole @page si cascadano: dichiarate qui,
           che è in coda al foglio, vincono su quelle del documento.
           ⚠️ Se cambiano di là, cambiano qui: sono due copie degli stessi
           numeri e non c'è modo di legarle — il documento sul disco porta il suo
           CSS e non può leggere il nostro. */
        '  @page{size:A4 portrait;margin:20mm 20mm 25mm 20mm}',
        '  :root{--ap-pt:13pt}',
        /* i riquadri perdono l'imbottitura, o si somma al margine di @page:
           misurato 27,5mm dove ne erano stati chiesti 20 */
        '  .bs-body{padding:0;border-radius:0}',
        '  .bs-header,.mm-dh{padding:0 0 10px;border-radius:0;margin-bottom:18px}',
        '  body{font-size:var(--ap-pt)}',
        '  .bs-body p,.bs-body li{font-size:var(--ap-pt)}',
        '  .bs-body h3{font-size:calc(var(--ap-pt) * 1.273)}',
        '  .bs-body h4{font-size:calc(var(--ap-pt) * 1.091)}',
        '  .bs-title,.mm-dh__t{font-size:calc(var(--ap-pt) * 1.818)}',
        '  .bs-subtitle,.mm-dh__s,.mm-dh__c,.mm-dh__b{font-size:calc(var(--ap-pt) * 0.909)}',
        '  .bs-cite-num,.bs-cite-text{font-size:calc(var(--ap-pt) * 0.909)}',
        '  .bs-citations-title,.bs-footer,.mm-dh-pie{font-size:calc(var(--ap-pt) * 0.818)}',
        '  body.ap-dys .bs-body p,body.ap-dys .bs-body li{font-size:calc(var(--ap-pt) * 1.364 * var(--ap-scala))}',
        '  body.ap-dys .bs-body h3{font-size:calc(var(--ap-pt) * 1.727 * var(--ap-scala))}',
        '  body.ap-dys .bs-body h4{font-size:calc(var(--ap-pt) * 1.364 * var(--ap-scala))}',
        '}'
    ].join('\n');

    /* Il documento che porta la voce naturale DENTRO di sé non può cedere la
       sua barra: il lettore dell'app legge il testo con la voce di sistema e
       quell'MP3 non sa suonarlo. Ma tenerla intera vuol dire due barre impilate
       — quella di chi ospita e quella del documento — con «Stampa» scritto due
       volte. Qui si toglie solo ciò che è DOPPIO: il marchio (il titolo è già
       nella barra di sopra) e il bottone di stampa (idem). Restano il lettore
       con la voce vera, «Aa» e «Evidenzia», che di sopra non ci sono.
       ⚠️ Il selettore del bottone di stampa non può essere la sola classe
       `.ap-print-btn`: i documenti scritti prima del 10/8 hanno quel bottone con
       lo stile inline e nessuna classe, e resterebbero col doppione. */
    function snellisciInIframe(iframe) {
        var d = _docDi(iframe);
        if (!d) return false;
        try {
            if (d.getElementById('mm-doc-snella')) return true;
            var st = d.createElement('style');
            st.id = 'mm-doc-snella';
            st.textContent = '#ap-doc-brand,.ap-print-btn,'
                + '.no-print button[onclick*="print"]{display:none !important}';
            (d.head || d.documentElement).appendChild(st);
            return true;
        } catch (e) { return false; }
    }

    /* Le stesse regole, per chi non ha un iframe ma una STRINGA: il documento
       che si scarica per consegnarlo. Senza, un file vecchio scaricato dal
       bottone «HTML» arriverebbe all'allievo con i corpi di prima — cioè
       l'anteprima nell'app e il file consegnato direbbero due cose diverse. */
    function scalaTestoInHtml(html) {
        var s = String(html || '');
        if (!/bs-body/.test(s) || /id="mm-doc-scala"/.test(s)) return s;
        var foglio = '<style id="mm-doc-scala">' + SCALA_TESTO + '</style>';
        /* In coda al "<head>", che è dove vince per ordine sulle regole
           originali a parità di specificità. Senza "</head>" (documento
           malformato) si ripiega in fondo: meglio in fondo che non applicato. */
        return /<\/head>/i.test(s) ? s.replace(/<\/head>/i, foglio + '</head>') : s + foglio;
    }

    function scalaTesto(iframe) {
        var d = _docDi(iframe);
        if (!d) return false;
        try {
            if (!d.querySelector('.bs-body')) return false;   // non è una sintesi
            if (d.getElementById('mm-doc-scala')) return true;
            var st = d.createElement('style');
            st.id = 'mm-doc-scala';
            st.textContent = SCALA_TESTO;
            (d.head || d.documentElement).appendChild(st);
            return true;
        } catch (e) { return false; }
    }

    /* Stampa il documento dentro l'iframe. Sostituisce il
       `iframe.contentWindow.print()` avvolto in un catch muto: con un iframe a
       origine opaca quello lancia SecurityError e il bottone non fa nulla senza
       dirlo. */
    function stampaIframe(iframe, titolo) {
        var d = _docDi(iframe);
        if (!d) return false;
        try {
            /* ⚠️ IL NOME DEL PDF LO DECIDE IL "<title>" del documento stampato,
               non il file da cui viene: un documento generato si intitola
               «Sintesi — <ramo>», quindi il salvataggio proponeva quello anche
               quando il file sul disco si chiamava in un altro modo — ed è il
               nome che il docente ha scelto. Qui il titolo si presta per il
               tempo della stampa e si rimette subito com'era: riscriverlo e
               basta cambierebbe anche ciò che si legge nella scheda del
               documento, che è un'altra cosa. */
            var prima = null;
            if (titolo) { prima = d.title; d.title = String(titolo).replace(/\.[^.]+$/, ''); }
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            if (prima !== null) d.title = prima;
            return true;
        } catch (e) { return false; }
    }

    return {
        stile: stile, html: html, icona: icona, AZIONI: AZIONI, GLIFI: GLIFI,
        nascondiInIframe: nascondiInIframe, stampaIframe: stampaIframe,
        scalaTesto: scalaTesto, scalaTestoInHtml: scalaTestoInHtml,
        snellisciInIframe: snellisciInIframe
    };
}));
