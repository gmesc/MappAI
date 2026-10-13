/* =========================================================================
   mappai-sse-core.js — LEGGERE LO STREAM DI INFOMANIAK senza perdere pezzi (25/9/26)

   Infomaniak risponde in streaming (Server-Sent Events: righe «data: {json}»
   separate da una riga vuota), e main.js lo pretende: una risposta lunga
   consegnata in un colpo solo cadrebbe nel Gateway Timeout. Il lettore di oggi,
   in `callInfomaniakChat`, spezza OGNI pezzo che arriva dalla rete con
   `chunk.toString().split('\n')` e non ricorda niente fra un pezzo e l'altro.
   Tre guasti, tutti muti:

     1. una riga «data:» tagliata fra due pezzi si perde intera: la prima metà
        non è JSON e il `catch` la ignora, la seconda non comincia con «data: ».
        Nella risposta manca testo, quindi JSON rotti e frasi mutilate che
        nessuno segnala;
     2. `toString()` taglia a metà le lettere di più byte (è, à, «, “). Oggi il
        danno si confonde col guasto 1, perché la lettera sta dentro una riga
        che si perde comunque; ma un rimedio fatto solo di buffer di riga
        lascerebbe «��» al posto della lettera. Per questo i byte passano da un
        decoder;
     3. `finish_reason` si legge SOLO dall'ultimo pezzo. Quando l'ultimo porta
        soltanto `usage` con `choices: []`, un `length` vero diventa `stop`.
        Misurato nel registro dei consumi: 206 chiamate Infomaniak su 206
        risultano STOP, comprese tre del Giudice arrivate esatte al tetto di
        4096 token. Ogni guardia di troncamento dell'app (`_detectTruncation`
        in app.js, che `length` lo riconosce già) è cieca su Infomaniak.

   Qui la lettura diventa una macchina a stati:
     - si leggono solo RIGHE COMPLETE: il pezzo di riga senza a-capo aspetta il
       pezzo successivo (a-capo \n o \r\n); l'ultima riga la svuota `chiudi()`;
     - i byte passano da un TextDecoder in modalità stream: la lettera tagliata
       aspetta la sua seconda metà;
     - `finish_reason` è l'ULTIMO non nullo visto in QUALUNQUE pezzo; lo stesso
       per `usage`, `id`, `model`, `created`;
     - una riga «data:» che non si legge non sparisce: si CONTA
       (`righeScartate`), senza tenerne il contenuto.
   `risposta()` restituisce l'oggetto che main.js costruisce oggi, chiave per
   chiave e con gli stessi ripieghi ('stream', 'stop', `{}`, il modello
   richiesto), così il collegamento è una sostituzione secca. Se
   `finish_reason` non arriva mai il ripiego resta 'stop', ma
   `stato().finishReason` è null e lo dice.

   PERCHÉ IL CORE NASCE PRIMA DEL COLLEGAMENTO: main.js non si tocca senza un
   packet approvato da Giacomo. Così la parte che decide se una risposta è
   intera si prova da sola in Node, contro una copia fedele del lettore di oggi
   (tests/sse-core.test.js), e il collegamento resta un diff di poche righe da
   approvare a parte.

   Logica pura: niente DOM, niente rete, niente API solo-Node (invariante 4).
   TextDecoder è globale sia in Node sia in Electron.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAISseCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* Un lettore per risposta: aggiungi(pezzo) per ogni pezzo della rete
       (Buffer, Uint8Array o stringa già decodificata), chiudi() alla fine,
       poi risposta(modelloRichiesto) e stato(). */
    function creaLettoreSSE() {
        const decoder = new TextDecoder('utf-8');
        let resto = '';               // la riga in corso, ancora senza a-capo
        let testo = '';
        let righeScartate = 0;
        let finishReason = null;
        let usage = null;
        let id = null;
        let model = null;
        let created = null;
        let ultimoChunk = null;

        let inSospeso = [];           // righe `data:` di un evento su più righe, fino alla riga vuota

        // Un pezzo JSON dello stream: vero se era un oggetto e lo si è letto.
        function valuta(valore) {
            let chunk = null;
            try { chunk = JSON.parse(valore); } catch (e) { return false; }
            if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return false;
            applica(chunk);
            return true;
        }
        /* La riga vuota chiude l'evento (standard SSE): le sue righe `data:` si uniscono con
           \n e si leggono UNA volta. Se l'unione non è un JSON si legge riga per riga, come
           faceva il lettore di prima: un server che manda un JSON per riga senza righe vuote
           in mezzo continua a funzionare, e una riga buona dopo righe rotte vale da sola.
           Le righe che non si leggono si CONTANO, non spariscono. Prima (25/9, seconda
           revisione del ramo) si riprovava l'unione a ogni riga: con tante righe rotte il
           costo era il quadrato, e una riga interna che da sola era un JSON «vinceva» e
           faceva perdere l'evento intero. */
        function chiudiEvento() {
            if (!inSospeso.length) return;
            const righe = inSospeso;
            inSospeso = [];
            if (righe.length > 1 && valuta(righe.join('\n'))) return;
            for (const r of righe) if (!valuta(r)) righeScartate++;
        }
        function leggiRiga(riga) {
            // «campo: valore»: contano solo le righe `data`. Commenti («: ping»),
            // event:, id:, retry: non portano testo; la riga vuota chiude l'evento.
            if (riga === '') { chiudiEvento(); return; }
            const dp = riga.indexOf(':');
            if (dp === -1 || riga.slice(0, dp) !== 'data') return;
            const valore = riga.slice(dp + 1).trim();   // «data: x» e «data:x»
            if (!valore) return;
            if (valore === '[DONE]') { chiudiEvento(); return; }
            inSospeso.push(valore);
        }

        function applica(chunk) {
            ultimoChunk = chunk;
            if (chunk.id) id = chunk.id;
            if (chunk.model) model = chunk.model;
            if (chunk.created) created = chunk.created;
            if (chunk.usage) usage = chunk.usage;
            const scelta = chunk.choices && chunk.choices[0];
            if (!scelta) return;
            if (scelta.delta && scelta.delta.content) testo += scelta.delta.content;
            if (scelta.finish_reason) finishReason = scelta.finish_reason;
        }

        // Le righe complete si leggono subito; l'ultima, senza a-capo, resta in
        // `resto` finché il pezzo dopo non la completa, o finché chiudi(). Una riga
        // finisce con \r\n, \n o \r (standard SSE); un \r in coda può essere la
        // metà di un \r\n, quindi aspetta il pezzo dopo.
        let crInCoda = false;         // `resto` finisce con un \r (forse metà di un \r\n)
        function consuma(nuovoTesto, fine) {
            // un pezzo senza a-capo si accoda e basta: rifare lo split a ogni pezzo
            // costava il quadrato della riga (1 MB a un byte per volta: 44 s). Niente
            // `resto.slice(-1)` qui: su una stringa fatta di `+=` V8 la appiattisce a
            // ogni chiamata, e il quadrato rientra dalla finestra.
            if (!fine && !crInCoda && !/[\r\n]/.test(nuovoTesto)) { resto += nuovoTesto; return; }
            let t = resto + nuovoTesto, coda = '';
            if (!fine && t.charCodeAt(t.length - 1) === 13) { coda = '\r'; t = t.slice(0, -1); }
            const righe = t.split(/\r\n|\r|\n/);
            resto = fine ? '' : righe.pop() + coda;
            crInCoda = coda === '\r';
            for (const riga of righe) leggiRiga(riga);
            if (fine) chiudiEvento();
        }

        return {
            aggiungi(pezzo) {
                if (pezzo == null) return;
                // stream:true → i byte di una lettera tagliata aspettano il pezzo dopo
                consuma(typeof pezzo === 'string' ? pezzo : decoder.decode(pezzo, { stream: true }), false);
            },
            chiudi() {
                // i byte ancora in sospeso (una lettera monca diventa «�») e l'ultima riga
                consuma(decoder.decode(), true);
            },
            // L'oggetto che main.js costruisce oggi, stesse chiavi e stessi ripieghi.
            risposta(modelloRichiesto) {
                return {
                    id: id || 'stream',
                    object: 'chat.completion',
                    created: created || Math.floor(Date.now() / 1000),
                    model: model || modelloRichiesto,
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: testo },
                            finish_reason: finishReason || 'stop'
                        }
                    ],
                    usage: usage || {}
                };
            },
            // Diagnostica: niente testo delle righe scartate, solo quante sono.
            stato() {
                return {
                    finishReason,      // quello VERO; null = mai arrivato (e risposta() dice 'stop')
                    righeScartate,     // righe «data:» che non erano un pezzo JSON leggibile
                    ultimoChunk        // l'ultimo pezzo letto: il `lastChunk` di oggi, per i log
                };
            }
        };
    }

    /* ── LA GUARDIA DEL SILENZIO (0091, 13/10/26) ─────────────────────────────
       Il difetto, dal gate dello 0090: una chiamata a Infomaniak partita e mai
       tornata. `callInfomaniakChat` aspettava solo `end` o `error` dello stream,
       senza orologio: uno stream muto che non si chiude — o una richiesta a cui
       non arriva nemmeno la risposta — teneva la promessa aperta per sempre, e il
       docente vedeva i secondi salire sul velo.
       La guardia conta il SILENZIO, non la durata: una risposta lunga che
       continua ad arrivare non si interrompe mai. Due tempi:
         - `primoDato`: da quando parte la richiesta al primo pezzo di risposta
           (un modello grande con un prompt lungo può pensare a lungo prima di
           scrivere: è il motivo per cui lo stream è forzato);
         - `fraDati`: il silenzio ammesso fra un pezzo e l'altro.
       Uso: `avvia()` quando parte la richiesta, `tocca()` a ogni pezzo,
       `ferma()` su fine ed errore. Alla scadenza chiama `alloScadere({ secondi,
       primoDato })` una volta sola. L'orologio si inietta (`timer`) per le prove. */
    var TEMPI_GUARDIA = { primoDato: 180000, fraDati: 90000 };

    function creaGuardia(opz) {
        opz = opz || {};
        var primo = opz.primoDato || TEMPI_GUARDIA.primoDato;
        var fra = opz.fraDati || TEMPI_GUARDIA.fraDati;
        var alloScadere = opz.alloScadere || function () { };
        var timer = opz.timer || {
            imposta: function (fn, ms) { return setTimeout(fn, ms); },
            annulla: function (h) { clearTimeout(h); }
        };
        var stato = 'nuova';        /* nuova → attiva → ferma | scaduta */
        var visto = false;          /* è arrivato almeno un pezzo? */
        var h = null;
        function arma(ms) {
            if (h !== null) timer.annulla(h);
            h = timer.imposta(function () {
                h = null;
                if (stato !== 'attiva') return;
                stato = 'scaduta';
                alloScadere({ secondi: Math.round(ms / 1000), primoDato: !visto });
            }, ms);
        }
        return {
            avvia: function () { if (stato !== 'nuova') return; stato = 'attiva'; arma(primo); },
            tocca: function () { if (stato !== 'attiva') return; visto = true; arma(fra); },
            ferma: function () {
                if (stato === 'attiva') stato = 'ferma';
                if (h !== null) { timer.annulla(h); h = null; }
            },
            scaduta: function () { return stato === 'scaduta'; },
            stato: function () { return stato; }
        };
    }

    /* I due tempi, con la possibilità di abbassarli SOLO per la prova in
       Electron: `MAPPAI_INFOMANIAK_GUARDIA_MS="5000,3000"` (primo dato, fra i
       dati). Un valore illeggibile non abbassa niente. */
    function tempiGuardia(daAmbiente) {
        var t = { primoDato: TEMPI_GUARDIA.primoDato, fraDati: TEMPI_GUARDIA.fraDati };
        var p = String(daAmbiente || '').split(',').map(function (x) { return parseInt(x, 10); });
        if (p[0] > 0) t.primoDato = p[0];
        if (p[1] > 0) t.fraDati = p[1];
        return t;
    }

    function messaggioGuardia(secondi) {
        return 'Infomaniak non risponde da ' + secondi + ' secondi: la richiesta è stata interrotta.';
    }

    return { creaLettoreSSE, creaGuardia, tempiGuardia, messaggioGuardia, TEMPI_GUARDIA };
}));
