/*
 * mappai-html-sicuro.js — il testo dei DATI entra nell'HTML come testo (core puro)
 * --------------------------------------------------------------------------------
 * Nessun accesso a DOM, rete o disco: funzioni deterministiche, provate in Node.
 *
 * Perché esiste (25/9/2026). Nella finestra principale ogni JavaScript ha in mano
 * tutto `window.electronAPI`, cioè il disco del docente: un'iniezione di HTML è
 * codice eseguito sul suo computer. E i testi che la scheda del nodo e il tutor
 * disegnano NON sono nostri: i vault si passano fra colleghi, i PDF sorgente sono
 * di terzi, e una risposta del modello la pilota anche chi ha scritto quel PDF.
 * Un vault ricevuto con `label: <img src=x onerror=…>` scattava al primo clic
 * sul nodo.
 *
 *  - esc                        → l'escape dei cinque caratteri (& < > " '), per il
 *                                 testo E per i valori degli attributi `data-*`
 *  - evidenzia                  → la parola cercata dentro <mark>, con l'escape
 *                                 fatto PRIMA: la marcatura non può più cadere
 *                                 dentro un `&amp;` né dentro un tag
 *  - togliEvidenziazioniVecchie → toglie dal testo di una nota le <mark> che il
 *                                 vecchio `openSourceModal` ci scriveva DENTRO
 *  - valutaLink                 → quale link si consegna al sistema operativo
 *                                 (`openExternal`) e quale no
 *  - sanificaTutor              → l'HTML del tutor ridotto ai tag della lista
 *                                 bianca, senza un solo attributo
 *
 * UMD: window.MappAIHtmlSicuro (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.MappAIHtmlSicuro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function _s(v) { return v == null ? '' : String(v); }

    // ── 1. ESCAPE ───────────────────────────────────────────────────────────
    /* Tutti e cinque, SEMPRE, anche la `&`: un `&amp;` già scritto nel dato si
       vede «&amp;», com'è già sul canvas (D3 scrive le etichette come testo). Il
       testo del dato è testo: che cosa voglia dire in HTML non lo decide lui. */
    var ENTITA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(v) {
        return _s(v).replace(/[&<>"']/g, function (c) { return ENTITA[c]; });
    }

    // ── 2. EVIDENZIARE LA RICERCA ──────────────────────────────────────────
    /* La STESSA marcatura di `highlightQuery` (mappai-search-finder.js): a schermo
       la parola trovata resta quella di sempre. Là però la regex girava sull'HTML
       già composto, quindi una ricerca «amp» o «br» finiva dentro `&amp;` e
       `<br>`; qui gira sul testo grezzo e ogni pezzo passa dall'escape. */
    var CLASSE_MARK = 'bg-black text-white px-1 rounded font-bold';

    function evidenzia(testo, cerca) {
        var s = _s(testo), q = _s(cerca);
        if (!q) return esc(s);
        var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        // con un gruppo di cattura, `split` mette le occorrenze agli indici dispari
        return s.split(re).map(function (pezzo, i) {
            return (i % 2) ? '<mark class="' + CLASSE_MARK + '">' + esc(pezzo) + '</mark>' : esc(pezzo);
        }).join('');
    }

    /* Fino al 25/9/2026 `openSourceModal` evidenziava la ricerca RISCRIVENDO
       `db.text`, cioè la nota vera di `sourcesDict` (getInheritedDatabase non
       copia gli oggetti): a ogni apertura con una ricerca attiva la frase della
       fonte si prendeva una <mark> in più, e l'autosave la portava nel progetto e
       nel vault. Le note già sporcate si ripuliscono qui, SOLO a schermo; il dato
       su disco resta com'è. Si toglie soltanto la marcatura esatta di
       `highlightQuery`: un testo che non la contiene torna identico. */
    var MARK_VECCHIA = '<mark class="' + CLASSE_MARK + '">';
    function togliEvidenziazioniVecchie(testo) {
        var s = _s(testo);
        if (s.indexOf(MARK_VECCHIA) < 0) return s;
        /* più giri, finché il testo non cambia: se la seconda ricerca del codice
           vecchio aveva colpito una parola della CLASSE (text, font, mark…), la
           <mark> esterna torna intera solo dopo aver tolto quella interna */
        /* al più 50 giri: le ricerche del codice vecchio annidavano poche <mark>; un testo
           costruito apposta con migliaia di livelli costava lunghezza × profondità */
        for (var prima = null, giri = 0; s !== prima && s.indexOf(MARK_VECCHIA) >= 0 && giri < 50; giri++) {
            prima = s;
            s = s.split(MARK_VECCHIA).join('').replace(/<\/mark>/g, '');
        }
        return s;
    }

    // ── 3. I LINK CHE ESCONO DALL'APP ───────────────────────────────────────
    /* `open-external` (main.js) passa tutto a `shell.openExternal`, che NON
       guarda lo schema: un `file:` verso un .app o un .command lancia un
       programma, un `smb:` monta una cartella di rete da cui il link seguente lo
       lancia. Passano solo:
       - le pagine web (`http:`, `https:`) e la posta (`mailto:`);
       - i DOCUMENTI sul computer: `file:` senza host, con un'estensione della
         lista. Sono i link che crea la modifica del nodo col file scelto dal
         disco (`handlePickLocalFileForEdit`: 'file://' + percorso assoluto; i
         link non vengono mai riscritti in `../Allegati/`, le immagini sì).
       Tutto il resto si rifiuta: `javascript:`, `data:`, `vbscript:`, `smb:`, gli
       schemi delle app, un `file:` verso un programma, uno script o una cartella,
       un indirizzo senza schema. Lo schema lo legge il parser URL VERO, che toglie
       spazi e caratteri di controllo in testa e i TAB dentro («java\tscript:» è
       `javascript:`); e si consegna la sua `href`, cioè proprio ciò che è stato
       controllato. */
    var DOCUMENTI = {};
    ('pdf doc docx odt rtf txt md csv xls xlsx ods ppt pptx odp key pages numbers epub html htm ' +
        'png jpg jpeg gif webp svg bmp tif tiff heic avif ' +
        'mp3 m4a wav aac ogg flac mp4 m4v mov webm').split(' ').forEach(function (x) { DOCUMENTI[x] = 1; });

    function valutaLink(url) {
        var grezzo = _s(url).trim();
        if (!grezzo) return { ok: false, motivo: 'vuoto' };
        var u;
        try { u = new URL(grezzo); } catch (e) { return { ok: false, motivo: 'non-url' }; }
        var schema = u.protocol;          // il parser lo dà già minuscolo
        if (schema === 'http:' || schema === 'https:') return { ok: true, tipo: 'web', url: u.href };
        if (schema === 'mailto:') return { ok: true, tipo: 'posta', url: u.href };
        if (schema !== 'file:') return { ok: false, motivo: 'schema', schema: schema };

        /* Un host, o un percorso che comincia con due barre, è una cartella di
           RETE: su Windows diventa un percorso UNC, cioè SMB. */
        if (u.hostname) return { ok: false, motivo: 'file-rete' };
        var percorso;
        /* «sconto 50%.pdf»: il link che l'app stessa compone con 'file://' + percorso
           non è codificato, e un «%» nudo fa lanciare decodeURIComponent. Il «%» nudo
           (non seguito da due cifre esadecimali) diventa «%25» PRIMA di decodificare:
           così tutti i controlli qui sotto lavorano sul nome vero, e una sequenza ben
           formata ma non valida in UTF-8 resta un rifiuto. */
        try { percorso = decodeURIComponent(u.pathname.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); }
        catch (e) { return { ok: false, motivo: 'file-nome' }; }
        if (/^\/\//.test(percorso) || percorso.indexOf('\\') >= 0) return { ok: false, motivo: 'file-rete' };
        // un NUL o un a capo nel nome: le API di sistema troncano, e «doc.exe\0.pdf» si apre come doc.exe
        if (/[\u0000-\u001f\u007f]/.test(percorso)) return { ok: false, motivo: 'file-nome' };
        // l'ultimo pezzo: vuoto se il link finisce con «/» (una cartella, o un «Calcolatrice.app/»)
        var nome = percorso.split('/').pop();
        var m = /\.([a-z0-9]{1,5})$/i.exec(nome);
        if (!m || nome.indexOf(':') >= 0 || !DOCUMENTI[m[1].toLowerCase()]) return { ok: false, motivo: 'file-tipo' };
        return { ok: true, tipo: 'file', url: u.href };
    }

    // ── 4. L'HTML DEL TUTOR ─────────────────────────────────────────────────
    /* La risposta del tutor è HTML PER DISEGNO: i prompt chiedono <strong>, <p>,
       <ul>, <li> (SOCRATIC_TUTOR_*, e il prompt della barra laterale in
       mappai-ai-tutor.js). Qui passa soltanto la formattazione: i tag della
       lista, riscritti SENZA un attributo (niente `onclick`, `style`, `href`,
       `src`) e chiusi in ordine, così un <ul> lasciato aperto non si porta via il
       bottone della voce. Un tag fuori lista se ne va e ne resta il testo;
       <script>, <style> e simili se ne vanno col loro contenuto. Fra i tag, `<` e
       `>` diventano testo; i riferimenti di carattere già scritti (`&egrave;`,
       `&amp;`) restano, perché dentro il testo di un elemento sono solo caratteri,
       e la `&` sciolta diventa `&amp;`. */
    var TAG_TUTOR = {};
    ('p br strong b em i u s del ins mark small sup sub code pre blockquote hr ' +
        'ul ol li h1 h2 h3 h4 h5 h6 table thead tbody tr th td').split(' ').forEach(function (x) { TAG_TUTOR[x] = 1; });
    var VUOTI = { br: 1, hr: 1 };
    /* Un blocco che si apre chiude il <p> aperto, e un <li> chiude il <li> di
       prima: lo fa il parser del browser, e lo si rifà qui, perché una chiusura
       in più NON è innocua — un `</p>` che non trova il suo <p> crea un
       paragrafo vuoto, cioè una riga bianca che prima non c'era. */
    var CHIUDONO_P = {};
    'p ul ol li blockquote pre hr table h1 h2 h3 h4 h5 h6'.split(' ').forEach(function (x) { CHIUDONO_P[x] = 1; });
    var VIA_COL_CONTENUTO = { script: 1, style: 1, template: 1, textarea: 1, title: 1, iframe: 1,
        object: 1, noscript: 1, noembed: 1, noframes: 1, xmp: 1 };
    // un tag, con i valori fra virgolette (possono contenere «>»); poi commenti, <!…>, <?…>
    /* ⚠️ Niente «<» nudo dentro un tag, e valori fra virgolette di al più 1000
       caratteri (25/9, dalla revisione del ramo): con `[^>"']` e `"[^"]*"` ogni
       «<» senza «>» faceva rileggere la regex fino in fondo al testo, e
       `'<a'.repeat(…)` costava il QUADRATO (256 KB: 26 s a thread fermo; lo storico
       del tutor viene dal vault, senza tetto). Un tag fuori da queste misure esce
       come testo: dal lato sicuro. */
    var RE_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^<>"']|"[^"]{0,1000}"|'[^']{0,1000}')*)>|<!--[\s\S]*?(?:-->|$)|<![^<>]*>|<\?[^<>]*>/g;

    function _testoTutor(t) {
        return t.replace(/&(?!(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function sanificaTutor(html) {
        var src = _s(html), out = '', aperti = [], ultimo = 0, m;
        function chiudiFino(k) { while (aperti.length > k) out += '</' + aperti.pop() + '>'; }
        RE_TAG.lastIndex = 0;
        while ((m = RE_TAG.exec(src)) !== null) {
            out += _testoTutor(src.slice(ultimo, m.index));
            ultimo = RE_TAG.lastIndex;
            var nome = (m[2] || '').toLowerCase();
            if (!nome) continue;                               // commento, <!doctype>, <?…>
            if (m[1]) {                                        // chiusura
                var k = aperti.lastIndexOf(nome);
                if (k >= 0) chiudiFino(k);                     // orfana: non chiude niente di nostro
                continue;
            }
            if (VIA_COL_CONTENUTO[nome]) {
                // `[^<>]`: da un «</script» senza «>» non si rilegge fino in fondo (quadratico)
                var chiusa = new RegExp('</' + nome + '\\b[^<>]*>', 'gi');
                chiusa.lastIndex = ultimo;
                ultimo = chiusa.exec(src) ? chiusa.lastIndex : src.length;
                RE_TAG.lastIndex = ultimo;
                continue;
            }
            if (!TAG_TUTOR[nome]) continue;                    // fuori lista: via il tag, resta il testo
            if (CHIUDONO_P[nome] && aperti.indexOf('p') >= 0) chiudiFino(aperti.lastIndexOf('p'));
            if (nome === 'li') {
                var lista = Math.max(aperti.lastIndexOf('ul'), aperti.lastIndexOf('ol'));
                var li = aperti.lastIndexOf('li');
                if (li > lista) chiudiFino(li);
            }
            out += '<' + nome + '>';
            if (!VUOTI[nome]) aperti.push(nome);
        }
        out += _testoTutor(src.slice(ultimo));
        while (aperti.length) out += '</' + aperti.pop() + '>';
        return out;
    }

    return {
        esc: esc,
        evidenzia: evidenzia,
        togliEvidenziazioniVecchie: togliEvidenziazioniVecchie,
        valutaLink: valutaLink,
        sanificaTutor: sanificaTutor,
        CLASSE_MARK: CLASSE_MARK
    };
});
