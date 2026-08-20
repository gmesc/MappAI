/* =========================================================================
   mappai-visione-core.js — LEGGERE UN'IMMAGINE, le regole (20/8/26)

   Nasce da una richiesta di docenti di STORIA di scuola media: da una fonte
   iconografica — una miniatura, un manifesto, una carta, una pagina di
   manuale — ricavare (1) un testo di CONTESTO e DESCRIZIONE e (2) le domande
   aperte con i vari angoli (e le flashcard).

   ⚠️ LA DECISIONE CHE REGGE TUTTO IL RESTO.
   Un modello di visione DESCRIVE bene e CONTESTUALIZZA male. Su una miniatura
   dirà con precisione «un uomo incoronato, seduto, due figure inginocchiate» e
   poi può INVENTARE «è l'incoronazione di Carlo Magno, anno 800». Costruirci
   sopra sette fogli di domande vuol dire sette verifiche sbagliate, con
   l'errore nascosto nella premessa — dove nessuno lo cerca.
   Quindi la lettura tiene i due campi SEPARATI:
     · `descrizione` = che cosa si vede, e basta (qui il modello è affidabile);
     · `contesto`    = che cosa potrebbe essere, dichiarato come ipotesi.
   E il contesto lo CORREGGE il docente prima di generare: quello, di una fonte
   storica, lo sa lui e il modello no.
   Corollario nel codice: se la risposta non arriva in forma, il testo nudo
   diventa `descrizione`, MAI `contesto`. Il campo che si può inventare non si
   riempie per ripiego.

   Logica pura: niente DOM, niente `window`, niente rete (invariante 4).
   Chi chiama: `mappai-visione.js` (UI), gli IPC di main.js per i parametri.
   ========================================================================= */
(function (root, factory) {
    var CORE = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (root) root.MappAIVisioneCore = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* i18n nei moduli provati in Node: mai `window.t` diretto (invariante 14) */
    function _tSafe(k, f) {
        try {
            if (typeof window !== 'undefined' && window && typeof window.t === 'function') return window.t(k, f);
        } catch (e) { /* in Node non esiste: resta l'italiano */ }
        return f;
    }

    /* ── I FORMATI ────────────────────────────────────────────────────────────
       Le quattro famiglie chieste. `heif` viaggia con `heic` (è lo stesso
       contenitore con due estensioni) e `tif` con `tiff`: due nomi per la
       stessa cosa, e chi arriva dallo scanner ha l'uno o l'altro. */
    var ESTENSIONI = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff'];
    var MIME = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.heic': 'image/heic', '.heif': 'image/heif',
        '.tif': 'image/tiff', '.tiff': 'image/tiff'
    };
    /* Che cosa il MOTORE sa decodificare da sé: llama.cpp legge jpeg e png e
       nient'altro. Tutto il resto passa da una conversione (`sips`, macOS) —
       ed è il motivo per cui heic e tiff, fuori da macOS, dicono perché no
       invece di fallire con un errore di libreria. */
    var LEGGIBILI = ['.jpg', '.jpeg', '.png'];

    function estensioneDi(nome) {
        var n = String(nome == null ? '' : nome).toLowerCase();
        var i = n.lastIndexOf('.');
        return i < 0 ? '' : n.slice(i);
    }
    function accetta(nome) { return ESTENSIONI.indexOf(estensioneDi(nome)) >= 0; }
    function mimeDi(nome) { return MIME[estensioneDi(nome)] || ''; }
    function serveConversione(nome) {
        var e = estensioneDi(nome);
        if (!e) return false;
        return LEGGIBILI.indexOf(e) < 0;
    }

    /* ── LE DUE MISURE ────────────────────────────────────────────────────────
       Sono due, e servono a due cose diverse:
       · LETTURA — quello che va al modello. Sotto i ~1200px il testo di una
         pagina fitta smette di leggersi; sopra i 1600 un MacBook Air si
         trascina senza guadagnare niente.
       · FOGLIO — quello che finisce INCORPORATO nel foglio delle domande. Va
         tenuto piccolo per una ragione che non si vede: l'archivio dei
         documenti è `localStorage`, con una quota che si è già saturata una
         volta, e sette angoli portano sette copie della stessa foto. */
    var MAX_LATO_LETTURA = 1600;
    var MAX_LATO_FOGLIO = 900;
    /* Oltre questo, prima ancora di convertire, si rifiuta e si dice perché:
       una foto da 60 MP fa fuori la memoria del processo che la converte. */
    var MAX_BYTE_SORGENTE = 40 * 1024 * 1024;

    var MODELLO_DEF = 'qwen2.5vl:7b';
    var HOST_DEF = 'http://127.0.0.1:11434';
    /* Una lettura su un Air dura decine di secondi: il tetto sta largo, e a
       tenere sveglio l'utente ci pensa il velo che dice a che punto è. */
    var TIMEOUT_DEF = 180000;

    /* ── IL TITOLO DELLA FONTE ────────────────────────────────────────────────
       Dal nome del file, ripulito: è quello che il docente vedrà nella scheda e
       potrà riscrivere, ed è anche l'etichetta con cui la fonte entra nel
       materiale. `IMG_4471` non dice niente, ma è meglio di «immagine»: dice
       ALMENO quale file, e il docente lo corregge in un campo che ha già
       davanti. */
    function titoloDaNome(nome) {
        var n = String(nome == null ? '' : nome);
        var i = n.lastIndexOf('.');
        if (i > 0) n = n.slice(0, i);
        n = n.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
        return n || _tSafe('vs_titolo_def', 'Immagine');
    }

    /* ── IL PROMPT DELLA LETTURA ──────────────────────────────────────────────
       Due campi, e la regola che li separa scritta dentro il prompt e non solo
       nella nostra testa: il modello deve sapere che il contesto è il campo in
       cui gli è permesso NON rispondere. Senza quella licenza esplicita, un
       modello risponde sempre — ed è esattamente il modo in cui nasce la
       premessa inventata.
       La `notaDocente`, se c'è, entra come VINCOLO e non come suggerimento: chi
       scrive «miniatura del XII secolo, ms. lat. 000» sta correggendo il
       modello, non chiedendogli un parere. */
    function promptLettura(opts) {
        opts = opts || {};
        var nome = String(opts.nome || '').trim();
        var nota = String(opts.notaDocente || '').trim();
        var righe = [];
        righe.push('Guarda questa immagine e rispondi SOLO con un JSON:');
        righe.push('{"descrizione":"…","contesto":"…"}');
        righe.push('');
        righe.push('DESCRIZIONE — che cosa si vede, in modo concreto e verificabile: persone, oggetti, gesti, ambienti, colori, disposizione. Se nell\'immagine c\'è del TESTO, trascrivilo per intero e alla lettera dentro la descrizione. Da 60 a 150 parole.');
        righe.push('CONTESTO — che cosa l\'immagine rappresenta e a che cosa si riferisce (epoca, luogo, avvenimento, genere della fonte).');
        righe.push('⚠️ Il contesto è l\'unico campo in cui puoi dire di non sapere: se non riconosci con certezza la fonte, lascia "contesto" come stringa VUOTA. Non tirare a indovinare nomi, date o avvenimenti: una data sbagliata qui diventa una verifica sbagliata in classe. Meglio vuoto che inventato.');
        righe.push('Scrivi in italiano, in prosa continua, senza elenchi e senza markdown.');
        if (nome) righe.push('Il file si chiama «' + nome + '»: può aiutare, ma non è una prova.');
        if (nota) {
            righe.push('');
            righe.push('IL DOCENTE DICHIARA (questo è VERO, tienilo per buono e non contraddirlo): ' + nota);
        }
        return righe.join('\n');
    }

    /* ── LA RISPOSTA, NORMALIZZATA ────────────────────────────────────────────
       `salvage` è la funzione di recupero dell'app (`salvageTruncatedJSON`,
       invariante 8): si riceve come parametro invece di cercarla su `window`,
       o questo file non si potrebbe provare in Node.
       ⚠️ Il ripiego riempie SOLO la descrizione. Vedi la testata: il campo che
       si può inventare non si riempie mai per ripiego. */
    function normalizzaLettura(raw, salvage) {
        var testo = String(raw == null ? '' : raw)
            .split('```json').join('').split('```').join('').trim();
        var o = null;
        if (typeof salvage === 'function') {
            try { o = salvage(testo); } catch (e) { o = null; }
        }
        if (!o || typeof o !== 'object' || Array.isArray(o)) {
            /* secondo tentativo, senza dipendere da nessuno: il primo oggetto
               che si trova nel testo (un modello ci mette spesso una frase
               attorno — è documentato per Qwen in `mappai-json-salvage.js`) */
            var a = testo.indexOf('{'), b = testo.lastIndexOf('}');
            if (a >= 0 && b > a) {
                try { o = JSON.parse(testo.slice(a, b + 1)); } catch (e) { o = null; }
            }
        }
        if (o && typeof o === 'object' && !Array.isArray(o)) {
            return {
                descrizione: _riga(o.descrizione || o.description || ''),
                contesto: _riga(o.contesto || o.context || '')
            };
        }
        return { descrizione: _riga(testo), contesto: '' };
    }
    function _riga(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }

    /* ── IL MATERIALE CHE VA AL GENERATORE ────────────────────────────────────
       L'UNICO compositore (invariante 6): lo usano le domande aperte e le
       flashcard, e un secondo qui divergerebbe al primo ritocco.
       L'ordine è quello: prima il contesto — che è ciò che il docente ha
       verificato e che vale più di tutto il resto — poi la descrizione.
       Se il contesto è vuoto non si scrive l'intestazione a vuoto: una riga
       «CONTESTO:» seguita dal nulla insegna al modello che quel campo si può
       lasciare in bianco anche nelle domande. */
    function materialeDaScheda(sch) {
        sch = sch || {};
        var titolo = _riga(sch.titolo);
        var contesto = _riga(sch.contesto);
        var descrizione = _riga(sch.descrizione);
        var out = [];
        out.push('FONTE ICONOGRAFICA: ' + (titolo || _tSafe('vs_titolo_def', 'Immagine')));
        if (contesto) out.push('CONTESTO (verificato dal docente): ' + contesto);
        if (descrizione) out.push('CHE COSA MOSTRA: ' + descrizione);
        return out.join('\n\n');
    }
    /* C'è abbastanza per generare? Una descrizione di tre parole produce
       domande inventate, ed è meglio dirlo prima di spendere le chiamate.
       ⚠️ La soglia è BASSA di proposito (12 parole sommate fra i due campi): il
       prompt ne chiede 60-150, quindi qui non si sta giudicando la qualità —
       si sta fermando il caso degenere («una piazza», una risposta vuota). Una
       soglia alta boccerebbe un contesto CORTO ma vero scritto a mano dal
       docente — «Manifesto di propaganda del 1917 per il prestito nazionale di
       guerra», undici parole — che è esattamente il caso in cui la scheda vale
       di più. Dieci è il numero che lascia passare quello e ferma il resto. */
    var MIN_PAROLE = 10;
    function schedaPronta(sch) {
        sch = sch || {};
        var n = (_riga(sch.contesto) + ' ' + _riga(sch.descrizione)).split(/\s+/).filter(Boolean).length;
        return n >= MIN_PAROLE;
    }

    /* ── I GUASTI, COL RIMEDIO ────────────────────────────────────────────────
       Trappola 38: due condizioni molto diverse arrivano nella stessa forma —
       un errore di rete — e chi le confonde fa aspettare l'utente per niente.
       Si classificano PRIMA di reagire, e la risposta dice che cosa fare, non
       che cosa è successo. */
    function diagnosi(err) {
        var m = '';
        if (err && typeof err === 'object') m = String(err.motivo || err.message || err.error || '');
        else m = String(err == null ? '' : err);
        var b = m.toLowerCase();

        if (b.indexOf('conversione-non-disponibile') >= 0) {
            return { codice: 'conversione', messaggio: _tSafe('vs_e_conv', 'Questo formato si converte solo su macOS.'),
                rimedio: _tSafe('vs_e_conv_r', 'Salva la foto come JPG o PNG e ricaricala.') };
        }
        if (b.indexOf('troppo-grande') >= 0 || b.indexOf('too large') >= 0) {
            return { codice: 'grande', messaggio: _tSafe('vs_e_big', 'L\'immagine è troppo grande.'),
                rimedio: _tSafe('vs_e_big_r', 'Riducila (o esportala a qualità più bassa) e riprova.') };
        }
        if (b.indexOf('econnrefused') >= 0 || b.indexOf('fetch failed') >= 0 ||
            b.indexOf('connect ') >= 0 || b.indexOf('spento') >= 0 || b.indexOf('enotfound') >= 0) {
            return { codice: 'spento', messaggio: _tSafe('vs_e_off', 'Il motore locale non risponde.'),
                rimedio: _tSafe('vs_e_off_r', 'Apri Ollama e lascialo acceso, poi riprova.') };
        }
        if (b.indexOf('not found') >= 0 || b.indexOf('404') >= 0 || b.indexOf('no such model') >= 0 ||
            b.indexOf('try pulling') >= 0) {
            return { codice: 'modello', messaggio: _tSafe('vs_e_mod', 'Il modello che legge le immagini non è installato.'),
                rimedio: _tSafe('vs_e_mod_r', 'Nel Terminale: ollama pull ') + MODELLO_DEF };
        }
        if (b.indexOf('timeout') >= 0 || b.indexOf('aborted') >= 0 || b.indexOf('etimedout') >= 0) {
            return { codice: 'lento', messaggio: _tSafe('vs_e_slow', 'La lettura non è finita in tempo.'),
                rimedio: _tSafe('vs_e_slow_r', 'Riprova con un\'immagine più piccola, o con un modello più leggero.') };
        }
        return { codice: 'altro', messaggio: _tSafe('vs_e_gen', 'La lettura dell\'immagine non è riuscita.'),
            rimedio: m ? m : _tSafe('vs_e_gen_r', 'Riprova.') };
    }

    /* ── IL PREVENTIVO ────────────────────────────────────────────────────────
       La lettura è locale e non costa chiamate: costano le domande, una per
       foglio. Dirlo prima è la regola già pagata col preavviso della voce. */
    function stimaFogli(angoli) {
        var n = Array.isArray(angoli) ? angoli.filter(Boolean).length : 0;
        return { fogli: n, chiamate: n, letture: 0 };
    }

    /* Le due misure che l'IPC deve usare, in un posto solo: chi prepara
       un'immagine per la LETTURA e chi la prepara per il FOGLIO chiede qui, e
       non scrive un numero suo. */
    function preparazione(quale) {
        return (quale === 'foglio')
            ? { maxLato: MAX_LATO_FOGLIO, formato: 'jpeg', mime: 'image/jpeg' }
            : { maxLato: MAX_LATO_LETTURA, formato: 'png', mime: 'image/png' };
    }

    return {
        ESTENSIONI: ESTENSIONI,
        LEGGIBILI: LEGGIBILI,
        MAX_LATO_LETTURA: MAX_LATO_LETTURA,
        MAX_LATO_FOGLIO: MAX_LATO_FOGLIO,
        MAX_BYTE_SORGENTE: MAX_BYTE_SORGENTE,
        MIN_PAROLE: MIN_PAROLE,
        MODELLO_DEF: MODELLO_DEF,
        HOST_DEF: HOST_DEF,
        TIMEOUT_DEF: TIMEOUT_DEF,
        estensioneDi: estensioneDi,
        accetta: accetta,
        mimeDi: mimeDi,
        serveConversione: serveConversione,
        titoloDaNome: titoloDaNome,
        promptLettura: promptLettura,
        normalizzaLettura: normalizzaLettura,
        materialeDaScheda: materialeDaScheda,
        schedaPronta: schedaPronta,
        diagnosi: diagnosi,
        stimaFogli: stimaFogli,
        preparazione: preparazione
    };
});
