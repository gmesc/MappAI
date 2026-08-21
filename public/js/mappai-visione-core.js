/* =========================================================================
   mappai-visione-core.js — LEGGERE UN'IMMAGINE, le regole (20/8/26)

   Nasce da una richiesta di docenti di STORIA di scuola media: da una fonte
   iconografica — una miniatura, un manifesto, una carta, una pagina di
   manuale — ricavare una SCHEDA DI ANALISI (tecnica, periodo, corrente,
   finalità, destinatario, diffusione, elementi grafici e tipografici) e da lì
   i materiali: flashcard, domande aperte, sintesi.

   LA GRIGLIA È QUATTRO BLOCCHI, e la divisione non è redazionale:
     A · carta d'identità   — genere, titolo, autore, data, luogo, tecnica
     B · che cosa si vede   — OSSERVAZIONE: il modello è affidabile
     C · che cosa vuole ottenere — INTERPRETAZIONE: qui inventa
     D · che cosa prova questa fonte — che cosa dimostra, che cosa tace

   ⚠️ LA DECISIONE CHE REGGE TUTTO IL RESTO.
   Un modello di visione DESCRIVE bene e CONTESTUALIZZA male. Su una miniatura
   dirà con precisione «un uomo incoronato, seduto, due figure inginocchiate» e
   poi può INVENTARE «è l'incoronazione di Carlo Magno, anno 800». Costruirci
   sopra sette fogli di domande vuol dire sette verifiche sbagliate, con
   l'errore nascosto nella premessa — dove nessuno lo cerca.
   Quindi i blocchi che si OSSERVANO stanno separati da quelli che si
   INTERPRETANO, e il docente corregge i secondi prima di generare: il contesto
   di una fonte storica lo sa lui e il modello no.
   Due regole tengono la griglia onesta, ed è codice, non buona volontà:
     1. OGNI campo di C porta il suo APPIGLIO VISIVO — non «propagandistico»,
        ma «propagandistico — lo dicono lo slogan in maiuscolo e la figura vista
        dal basso». Un campo interpretativo SENZA appiglio viene SCARTATO in
        `normalizzaAnalisi`: il prompt lo chiede, il codice lo impone, perché un
        modello le istruzioni ogni tanto le ignora. Così l'invenzione si verifica
        guardando l'immagine, in due secondi.
     2. Se la risposta non arriva in forma, il testo nudo cade in B, MAI in C o
        in D. Il campo che si può inventare non si riempie per ripiego —
        altrimenti il ripiego è il posto da cui entra l'invenzione.

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
       `heif` viaggia con `heic`: è lo stesso contenitore con due estensioni.
       ⚠️ Il TIFF è FUORI (20/8, decisione di Giacomo): nessuno dei consumatori
       lo mostra — non il browser, non i documenti — e teneva in piedi una
       conversione per un formato che dalle fotocamere non esce. */
    var ESTENSIONI = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
    var MIME = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.heic': 'image/heic', '.heif': 'image/heif'
    };
    /* Che cosa si può mostrare e incorporare SENZA conversione. Gemini l'HEIC lo
       accetta, ma **Chromium non lo decodifica**: la scheda deve far vedere la
       foto e il documento se la porta dentro, quindi la conversione serve lo
       stesso — ed è il motivo per cui, fuori da macOS, l'HEIC dice perché no
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

    /* La lettura è una chiamata a Gemini via `fetchModelAPI` (20/8 sera: il
       motore locale è stato tolto — vedi il commit). L'analisi a quattro
       blocchi è lunga: il tetto sta sopra i default dei quiz. */
    var MAX_TOKEN_ANALISI = 4096;

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

    /* ── IL PROMPT DELL'ANALISI ───────────────────────────────────────────────
       Quattro blocchi, e le due regole scritte DENTRO il prompt, non solo nella
       nostra testa: il modello deve sapere che i campi interpretativi sono
       quelli in cui gli è permesso NON rispondere, e che un'interpretazione
       senza appiglio visivo non vale. Senza quella licenza esplicita un modello
       risponde sempre — ed è il modo in cui nasce la premessa inventata.
       La `notaDocente`, se c'è, entra come VINCOLO e non come suggerimento. */
    function promptAnalisi(opts) {
        opts = opts || {};
        var nome = String(opts.nome || '').trim();
        var nota = String(opts.notaDocente || '').trim();
        var righe = [];
        righe.push('Sei uno storico che analizza una fonte iconografica per una classe di scuola media. Guarda questa immagine e rispondi SOLO con un JSON:');
        righe.push('{"identita":{"genere":"…","titolo":"…","autore":"…","data":"…","luogo":"…","tecnica":"…"},');
        righe.push(' "osservazione":{"descrizione":"…","testo":"…","iconografia":"…","linguaggioVisivo":"…","tipografia":"…"},');
        righe.push(' "interpretazione":{"corrente":"…","committente":"…","destinatario":"…","finalita":"…","strategie":"…","diffusione":"…"},');
        righe.push(' "critica":{"prova":"…","tace":"…"}}');
        righe.push('');
        righe.push('IDENTITA — che genere di fonte è (manifesto, dipinto, fotografia, vignetta, miniatura, carta, pubblicità), titolo o slogan, autore o firma SE VISIBILI, data o periodo, luogo e lingua, tecnica e supporto (litografia, xilografia, olio, fotografia, offset).');
        /* ⚠️ LO SLANG NON SI TRADUCE PAROLA PER PAROLA (21/8/26). Su un
           manifesto americano del '42 «GRIND these HEELS in our WHEELS» è
           uscito come «macina questi TALLONI»: "heel" lì è slang per
           «farabutto», e la resa alla lettera ha prodotto una frase senza
           senso — che poi la sintesi ha ripetuto agli allievi. Lo slogan resta
           in lingua ORIGINALE; il senso si spiega, e si spiega il gioco di
           parole se c'è. */
        righe.push('⚠️ SLOGAN E SCRITTE: trascrivili nella lingua ORIGINALE, alla lettera. Se contengono un modo di dire, un gergo o un gioco di parole, NON tradurli parola per parola: aggiungi fra parentesi tonde che cosa VOGLIONO DIRE, e di\' che è un modo di dire. Se non sei sicuro del senso, lascia solo l\'originale.');
        righe.push('OSSERVAZIONE — solo ciò che si VEDE, concreto e verificabile: "descrizione" (la scena, denotativa); "testo" (ogni scritta trascritta PER INTERO e alla lettera); "iconografia" (simboli, attributi, allegorie); "linguaggioVisivo" (composizione, punto di vista, luce, colore, gerarchia dimensionale, sguardi e gesti); "tipografia" (caratteri, corpo, gerarchia, rapporto testo-immagine).');
        /* ⚠️ LE FIGURE SI NOMINANO, GLI STEREOTIPI NO (21/8/26). Sullo stesso
           manifesto le tre teste caricaturali — Hitler, Mussolini, l'imperatore
           giapponese — sono rimaste «i nemici», e a una il modello ha attribuito
           di sua iniziativa uno «stereotipo antisemita» che nell'immagine non ha
           nessun appiglio: una caricatura antigiapponese letta come antiebraica.
           Due regole, non una: nominare quando il tratto è inequivocabile,
           e non appiccicare un'etichetta etnica a una figura senza il tratto
           visivo che la giustifica. */
        righe.push('⚠️ FIGURE RICONOSCIBILI: se una figura — anche caricaturale — ha tratti INEQUIVOCABILI di un personaggio storico (baffo e ciuffo, mento sporgente e testa rasata, occhiali tondi e uniforme, corona, tiara), NOMINALA in "iconografia" col tratto che la identifica, con un trattino: "Hitler — i baffi e il ciuffo". Se i tratti non bastano, descrivili e basta: non scrivere «i nemici» quando i volti si riconoscono, e non attribuire a una figura uno stereotipo etnico o religioso senza un elemento visivo che lo giustifichi (una caricatura antigiapponese non è una caricatura antisemita).');
        righe.push('INTERPRETAZIONE — che cosa la fonte vuole ottenere: corrente grafica o artistica, committente, destinatario, finalità (informare, celebrare, persuadere, vendere, denigrare), strategie persuasive (appello all\'emozione, autorità, urgenza, noi/loro, semplificazione), diffusione (dove circolava, come, per quanto).');
        righe.push('⚠️ REGOLA DELL\'APPIGLIO: ogni campo di INTERPRETAZIONE deve citare l\'elemento VISIVO che lo giustifica, con un trattino — così: "propagandistica — lo dicono lo slogan in maiuscolo e la figura vista dal basso". Un\'interpretazione che non sai ancorare a qualcosa che si vede NON va scritta: lascia il campo come stringa VUOTA.');
        righe.push('CRITICA — "prova": che cosa questa fonte DIMOSTRA davvero (le intenzioni di chi l\'ha prodotta, non i fatti che rappresenta); "tace": che cosa NON mostra, chi non è rappresentato, da quale parte sta.');
        righe.push('⚠️ I blocchi INTERPRETAZIONE e CRITICA sono quelli in cui puoi dire di non sapere: meglio un campo vuoto che un nome, una data o una finalità inventati. Una data sbagliata qui diventa una verifica sbagliata in classe.');
        righe.push('Scrivi in italiano, prosa continua, senza elenchi e senza markdown dentro i campi.');
        if (nome) righe.push('Il file si chiama «' + nome + '»: può aiutare, ma non è una prova.');
        if (nota) {
            righe.push('');
            righe.push('IL DOCENTE DICHIARA (questo è VERO, tienilo per buono e non contraddirlo): ' + nota);
        }
        return righe.join('\n');
    }

    /* ── LA GRIGLIA, COME DATO ────────────────────────────────────────────────
       I quattro blocchi coi loro campi, in UN posto: la leggono la
       normalizzazione, la scheda del docente, il documento e i nodi del
       dossier. Un secondo elenco divergerebbe al primo campo aggiunto (inv. 6).
       `interpretativo`: vale la regola dell'appiglio e la licenza del vuoto. */
    var BLOCCHI = [
        { id: 'identita', titolo: 'Carta d\u0027identit\u00e0', interpretativo: false,
          campi: [
            { id: 'genere', et: 'Genere della fonte' },
            { id: 'titolo', et: 'Titolo o slogan' },
            { id: 'autore', et: 'Autore o firma' },
            { id: 'data', et: 'Data o periodo' },
            { id: 'luogo', et: 'Luogo e lingua' },
            { id: 'tecnica', et: 'Tecnica e supporto' }
          ] },
        { id: 'osservazione', titolo: 'Che cosa si vede', interpretativo: false,
          campi: [
            { id: 'descrizione', et: 'Descrizione' },
            { id: 'testo', et: 'Testo trascritto' },
            { id: 'iconografia', et: 'Elementi iconografici' },
            { id: 'linguaggioVisivo', et: 'Linguaggio visivo' },
            { id: 'tipografia', et: 'Tipografia' }
          ] },
        { id: 'interpretazione', titolo: 'Che cosa vuole ottenere', interpretativo: true,
          campi: [
            { id: 'corrente', et: 'Corrente grafica o artistica' },
            { id: 'committente', et: 'Committente' },
            { id: 'destinatario', et: 'Destinatario' },
            { id: 'finalita', et: 'Finalit\u00e0' },
            { id: 'strategie', et: 'Strategie persuasive' },
            { id: 'diffusione', et: 'Diffusione' }
          ] },
        { id: 'critica', titolo: 'Che cosa prova questa fonte', interpretativo: true,
          campi: [
            { id: 'prova', et: 'Che cosa dimostra' },
            { id: 'tace', et: 'Che cosa non mostra' }
          ] }
    ];

    /* ── LA RISPOSTA, NORMALIZZATA ────────────────────────────────────────────
       `salvage` è la funzione di recupero dell'app (`salvageTruncatedJSON`,
       invariante 8): si riceve come parametro invece di cercarla su `window`,
       o questo file non si potrebbe provare in Node.
       Le DUE REGOLE della testata sono codice qui:
       · il testo nudo cade in `osservazione.descrizione`, MAI nei blocchi
         interpretativi;
       · un campo di INTERPRETAZIONE senza appiglio (nessun « — » che ancora
         l'affermazione a un elemento visivo) viene SCARTATO. Il prompt lo
         chiede; questo lo impone, perché un modello le istruzioni ogni tanto
         le ignora. `critica` è esente: «che cosa tace» parla per assenza, e
         un appiglio all'assenza non esiste. */
    function normalizzaAnalisi(raw, salvage) {
        var testo = String(raw == null ? '' : raw)
            .split('```json').join('').split('```').join('').trim();
        var o = null;
        if (typeof salvage === 'function') {
            try { o = salvage(testo); } catch (e) { o = null; }
        }
        if (!o || typeof o !== 'object' || Array.isArray(o)) {
            var a = testo.indexOf('{'), b = testo.lastIndexOf('}');
            if (a >= 0 && b > a) {
                try { o = JSON.parse(testo.slice(a, b + 1)); } catch (e) { o = null; }
            }
        }
        var out = {};
        BLOCCHI.forEach(function (bl) {
            out[bl.id] = {};
            var src = (o && typeof o === 'object' && !Array.isArray(o)) ? (o[bl.id] || {}) : {};
            bl.campi.forEach(function (c) {
                var v = _riga(src[c.id]);
                if (bl.id === 'interpretazione' && v && v.indexOf('—') < 0 && v.indexOf(' - ') < 0) {
                    v = '';   /* interpretazione senza appiglio: non vale */
                }
                out[bl.id][c.id] = v;
            });
        });
        if (!o || typeof o !== 'object' || Array.isArray(o)) {
            out.osservazione.descrizione = _riga(testo);
        }
        return out;
    }
    function _riga(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }

    /* ── IL TESTO DI UN BLOCCO, IN PROSA ─────────────────────────────────────
       «Etichetta: valore» per i soli campi pieni. Lo usano il materiale, la
       `desc` dei nodi del dossier e — via `BLOCCHI` — il documento: una forma
       sola, o le tre superfici raccontano la scheda in tre modi. */
    function testoBlocco(sch, blId) {
        var bl = null;
        for (var i = 0; i < BLOCCHI.length; i++) if (BLOCCHI[i].id === blId) bl = BLOCCHI[i];
        if (!bl) return '';
        var src = (sch && sch[blId]) || {};
        var righe = [];
        bl.campi.forEach(function (c) {
            var v = _riga(src[c.id]);
            if (v) righe.push(c.et + ': ' + v);
        });
        return righe.join('\n');
    }

    /* ── IL MATERIALE CHE VA AL GENERATORE ────────────────────────────────────
       L'UNICO compositore (invariante 6): lo usano le domande aperte, le
       flashcard e la sintesi, e un secondo qui divergerebbe al primo ritocco.
       L'ordine è quello della griglia: prima ciò che identifica, poi ciò che si
       vede, poi ciò che si interpreta — che il docente ha verificato — e la
       critica. I blocchi vuoti NON scrivono l'intestazione a vuoto. */
    function materialeDaScheda(sch) {
        sch = sch || {};
        var out = ['FONTE ICONOGRAFICA: ' + (_riga(sch.titolo) || _tSafe('vs_titolo_def', 'Immagine'))];
        BLOCCHI.forEach(function (bl) {
            var t = testoBlocco(sch, bl.id);
            if (t) out.push(bl.titolo.toUpperCase() + '\n' + t);
        });
        return out.join('\n\n');
    }
    /* C'è abbastanza per generare? Si somma il testo di TUTTI i blocchi.
       ⚠️ La soglia è BASSA di proposito (dieci parole): non giudica la qualità,
       ferma il caso degenere. Una soglia alta boccerebbe una scheda corta ma
       vera scritta a mano dal docente — il caso in cui vale di più. */
    var MIN_PAROLE = 10;
    function schedaPronta(sch) {
        var n = 0;
        BLOCCHI.forEach(function (bl) {
            n += testoBlocco(sch, bl.id).split(/\s+/).filter(Boolean).length;
        });
        return n >= MIN_PAROLE;
    }

    /* ── IL CONTESTO IN UNA RIGA ──────────────────────────────────────────────
       Per la testata dei fogli di domande: l'identità e la finalità, compresse.
       La scheda intera non ci sta — e la parte OSSERVATA non deve starci: sul
       foglio degli allievi sarebbe la risposta a metà delle domande. */
    function contestoBreve(sch) {
        sch = sch || {};
        var idn = sch.identita || {}, itp = sch.interpretazione || {};
        var pezzi = [idn.genere, idn.data, idn.luogo, idn.tecnica]
            .map(_riga).filter(Boolean);
        var testa = pezzi.join(' · ');
        var fin = _riga(itp.finalita);
        return [testa, fin].filter(Boolean).join(' — ');
    }

    /* ── I NODI DEL DOSSIER ───────────────────────────────────────────────────
       Il dossier è un vault VERO, e il suo grafo È la scheda: root = il titolo
       della fonte, un L1 per blocco pieno, `desc` = il testo del blocco.
       Deterministico: zero AI, zero «mappa generata dalla foto».
       PERCHÉ ESISTE: un vault senza nodi rompe chi lo apre — la console di
       ELABORA chiede `db.nodes.length`, la pipeline genera PER RAMO. Coi
       blocchi come rami, tutto il resto dell'app funziona senza una guardia
       nuova da nessuna parte. */
    function nodiDaScheda(sch) {
        sch = sch || {};
        var titolo = _riga(sch.titolo) || _tSafe('vs_titolo_def', 'Immagine');
        var nodes = [{ id: 'fonte_0', label: titolo, level: 0, group: 0,
            desc: _tSafe('vs_root_desc', 'Dossier di una fonte iconografica: la scheda di analisi è nei rami.') }];
        var links = [];
        var g = 1;
        BLOCCHI.forEach(function (bl) {
            var t = testoBlocco(sch, bl.id);
            if (!t) return;
            var id = 'fonte_' + bl.id;
            nodes.push({ id: id, label: bl.titolo, level: 1, group: g, desc: t });
            links.push({ source: 'fonte_0', target: id, rel: 'analizza' });
            g++;
        });
        return { nodes: nodes, links: links };
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
        if (b.indexOf('api key') >= 0 || b.indexOf('401') >= 0 || b.indexOf('403') >= 0 ||
            b.indexOf('permission') >= 0) {
            return { codice: 'chiave', messaggio: _tSafe('vs_e_key', 'La chiave API non è valida per questo servizio.'),
                rimedio: _tSafe('vs_e_key_r', 'Controlla la chiave Google nelle Impostazioni AI.') };
        }
        if (b.indexOf('429') >= 0 || b.indexOf('quota') >= 0 || b.indexOf('resource') >= 0) {
            return { codice: 'quota', messaggio: _tSafe('vs_e_quota', 'Il provider chiede di aspettare (quota).'),
                rimedio: _tSafe('vs_e_quota_r', 'Riprova fra qualche minuto.') };
        }
        if (b.indexOf('econnrefused') >= 0 || b.indexOf('fetch failed') >= 0 ||
            b.indexOf('network') >= 0 || b.indexOf('enotfound') >= 0) {
            return { codice: 'rete', messaggio: _tSafe('vs_e_off', 'Il servizio non risponde.'),
                rimedio: _tSafe('vs_e_off_r', 'Controlla la connessione e riprova.') };
        }
        if (b.indexOf('provider') >= 0 && b.indexOf('infomaniak') >= 0) {
            return { codice: 'provider', messaggio: _tSafe('vs_e_prov', 'La lettura delle immagini passa da Google Gemini.'),
                rimedio: _tSafe('vs_e_prov_r', 'Scegli il provider Google nelle Impostazioni AI e riprova.') };
        }
        if (b.indexOf('vuota') >= 0 || b.indexOf('finishreason') >= 0) {
            return { codice: 'vuota', messaggio: _tSafe('vs_e_empty', 'Il modello non ha risposto su questa immagine.'),
                rimedio: _tSafe('vs_e_empty_r', 'Riprova, o prova con una foto più nitida.') };
        }
        if (b.indexOf('timeout') >= 0 || b.indexOf('aborted') >= 0 || b.indexOf('etimedout') >= 0) {
            return { codice: 'lento', messaggio: _tSafe('vs_e_slow', 'La lettura non è finita in tempo.'),
                rimedio: _tSafe('vs_e_slow_r', 'Riprova con un\'immagine più piccola, o con un modello più leggero.') };
        }
        return { codice: 'altro', messaggio: _tSafe('vs_e_gen', 'La lettura dell\'immagine non è riuscita.'),
            rimedio: m ? m : _tSafe('vs_e_gen_r', 'Riprova.') };
    }

    /* ── IL PREVENTIVO DEL DOSSIER (fase 3) ───────────────────────────────────
       Un numero per le scelte della scheda di validazione: per ogni genere
       acceso, (angoli scelti o 1) × (categorie scelte o blocchi pieni), più la
       sintesi. La lettura è già stata pagata al caricamento e non si conta.
       4 categorie × 8 angoli × 2 generi moltiplica in fretta: mostrarlo mentre
       si spunta è la regola del bento (3/8) e del preavviso della voce. */
    function stimaDossier(op, nBlocchiPieni) {
        op = op || {};
        var blocchi = Math.max(1, nBlocchiPieni || 0);
        function genere(g) {
            if (!g || g.on === false) return 0;
            var ang = Array.isArray(g.angoli) ? g.angoli.filter(Boolean).length : 0;
            var cat = Array.isArray(g.cat) && g.cat.length ? Math.min(g.cat.length, blocchi) : blocchi;
            return Math.max(1, ang || 1) * cat;
        }
        var oq = genere(op.oq), fc = genere(op.fc);
        var syn = (op.syn === false) ? 0 : 1;
        return { chiamate: oq + fc + syn, oq: oq, fc: fc, syn: syn };
    }

    /* ── IL PREVENTIVO ────────────────────────────────────────────────────────
       La lettura è UNA chiamata a Gemini per immagine, e va detta prima come
       tutto ciò che spende (trappola 39). Le domande costano una chiamata per
       foglio. */
    function stimaFogli(angoli) {
        var n = Array.isArray(angoli) ? angoli.filter(Boolean).length : 0;
        return { fogli: n, chiamate: n + 1, letture: 1 };
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
        MAX_TOKEN_ANALISI: MAX_TOKEN_ANALISI,
        BLOCCHI: BLOCCHI,
        estensioneDi: estensioneDi,
        accetta: accetta,
        mimeDi: mimeDi,
        serveConversione: serveConversione,
        titoloDaNome: titoloDaNome,
        promptAnalisi: promptAnalisi,
        normalizzaAnalisi: normalizzaAnalisi,
        testoBlocco: testoBlocco,
        materialeDaScheda: materialeDaScheda,
        contestoBreve: contestoBreve,
        stimaDossier: stimaDossier,
        schedaPronta: schedaPronta,
        nodiDaScheda: nodiDaScheda,
        diagnosi: diagnosi,
        stimaFogli: stimaFogli,
        preparazione: preparazione
    };
});
