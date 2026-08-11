/* MappAI — CLONA: una seconda copia editabile, per scelta (11/8/26)
 *
 *     const C = MappAIClona;
 *     const nome = C.nomeAuto('Quiz MC', esistenti);        // «2», «3», …
 *     const v = C.valida(nome, 'Quiz MC', esistenti);       // {ok, motivo?}
 *     const nuovo = C.clonaSet(set, nome, {id: 'set_123'}); // il set clonato
 *     C.etichetta('Quiz MC', nome);                         // «Scelta Multipla - 2»
 *
 * ── PERCHÉ ESISTE, E PERCHÉ È UN MODULO A SÉ ────────────────────────────────
 * Finora una mappa aveva UN quiz a scelta multipla, UNA sintesi, UN foglio dei
 * nodi: correggere voleva dire riscrivere sopra. Il docente che prepara la
 * verifica di ottobre e quella di recupero aveva due strade, entrambe cattive —
 * rigenerare (e pagare di nuovo l'AI, perdendo le correzioni) o tenere due
 * versioni fuori dall'app. Il clone è la terza: si duplica ciò che si è già
 * corretto, gli si dà un nome, e le due copie vivono accanto.
 *
 * Sta in un file suo, puro e testato, perché il pezzo delicato NON è duplicare
 * un oggetto: è il NOME. Da quel nome dipendono tre cose che devono restare
 * d'accordo fra loro — l'etichetta nell'elenco, il nome del file nel vault e
 * l'aggancio fra i due — e sono scritte in tre moduli diversi. Se la regola
 * vive in mezzo a uno di quei tre, gli altri due la ricopiano e da lì
 * divergono. Qui è una, ed è provata in Node.
 *
 * ⚠️ IL NOME DEL CLONE DIVENTA PARTE DEL NOME DEL FILE. `buildFileName` lo
 * accetta già (`opts.nome`) e lo appende: «Quiz-MC-<Mappa>-verifica ottobre.pdf».
 * Senza un nome, due cloni della stessa mappa scriverebbero lo stesso file e il
 * secondo sovrascriverebbe il primo IN SILENZIO — da quando il marcatore
 * ` -VERDE` non si scrive più, è già così per le rigenerazioni. È il motivo per
 * cui qui un clone senza nome non esiste: se il docente non lo dà, lo mette la
 * numerazione.
 *
 * Puro: nessun DOM, nessun appState, nessuna dipendenza. UMD → test in Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIClona = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* I nomi funzionali dei generi: gli stessi che ELABORA scrive nelle righe.
       Duplicati qui di proposito — questo modulo non deve dipendere da una
       console per sapere come si chiama un quiz — ma è UNA tabella, e il test
       la confronta con quella della console. */
    var GENERI = {
        'Quiz MC': 'Scelta Multipla',
        'Quiz V/F': 'Vero o Falso',
        'Quiz': 'Quiz',
        'Domande aperte': 'Domande Aperte',
        'Flashcard': 'Flashcard',
        'Sintesi': 'Sintesi',
        'Foglio nodi': 'Foglio dei nodi',
        'Catena dei perché': 'Catena dei perché'
    };

    var MAX = 40;   /* caratteri del nome: oltre, l'etichetta non sta in una riga */

    /* Caratteri che un nome di file non può portare, più quelli che
       spezzerebbero la LETTURA del nome composto.
       ⚠️ Il TRATTINO si tiene: «verifica-ottobre» è un nome legittimo, e
       toglierlo cambierebbe sotto le mani ciò che il docente ha scritto. Rende
       il nome del file ambiguo a rileggerlo («Quiz-MC-Mappa-verifica-ottobre»),
       ed è il compromesso già accettato da `buildFileName`. */
    var VIETATI = /[\\/:*?"<>|\x00-\x1f]/g;

    function _s(x) { return String(x == null ? '' : x); }

    /* Il nome, ripulito. Torna '' se non resta niente di utilizzabile: chi
       chiama deve poter distinguere «non l'ha scritto» da «ha scritto ///». */
    function pulisci(nome) {
        return _s(nome).replace(VIETATI, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX).trim();
    }

    /* Due nomi sono LO STESSO nome se differiscono solo per maiuscole o spazi:
       su disco «Verifica Ottobre» e «verifica ottobre» sono due file distinti su
       Linux e uno solo su macOS — e un elenco che mostra due righe uguali è un
       elenco sbagliato ovunque. */
    function chiave(nome) { return pulisci(nome).toLowerCase(); }

    /* La numerazione automatica: «2», «3», … Parte da 2 perché l'ORIGINALE è
       l'1 — non si chiama «1», si chiama col suo nome, e il primo clone è il
       secondo esemplare. Salta i numeri già presi (anche quelli scritti a mano
       dal docente: se ha chiamato una copia «2», la prossima è «3»). */
    function nomeAuto(genere, esistenti) {
        var presi = {};
        (esistenti || []).forEach(function (x) { presi[chiave(x)] = 1; });
        for (var n = 2; n <= 99; n++) {
            if (!presi[String(n)]) return String(n);
        }
        return '';
    }

    /* Il verdetto sul nome scelto. `esistenti` = i nomi dei cloni già presenti
       PER QUEL GENERE (non di tutti: «verifica ottobre» può esistere per il
       quiz e per la sintesi, sono due documenti diversi). */
    function valida(nome, genere, esistenti) {
        var pulito = pulisci(nome);
        if (!pulito) return { ok: false, motivo: 'vuoto', nome: '' };
        var k = chiave(pulito);
        var dup = (esistenti || []).some(function (x) { return chiave(x) === k; });
        if (dup) return { ok: false, motivo: 'duplicato', nome: pulito };
        return { ok: true, nome: pulito };
    }

    /* L'etichetta nell'elenco: «Scelta Multipla - verifica ottobre».
       Il GENERE resta la prima parola perché è ciò per cui si cerca; il nome
       personale distingue le copie fra loro. Senza nome (= l'originale) resta
       il solo genere. */
    function etichetta(genere, nome) {
        var base = GENERI[genere] || _s(genere) || 'Documento';
        var n = pulisci(nome);
        return n ? (base + ' - ' + n) : base;
    }

    /* ── IL CLONE DI UN SET ──────────────────────────────────────────────────
       Immutabile: torna un oggetto NUOVO e non tocca l'originale (il set vive
       in `appState.db.studySets`, e mutarlo qui vorrebbe dire che clonare
       modifica anche ciò che si stava copiando).
       `opts.id` = l'identità nuova; senza, la sceglie chi chiama — questo
       modulo non genera id perché non deve sapere né l'ora né il caso
       (`Date.now`/`Math.random` renderebbero i test non ripetibili).
       `opts.data` idem. */
    function clonaSet(set, nome, opts) {
        opts = opts || {};
        var src = set || {};
        var n = pulisci(nome);
        var fuori = {};
        Object.keys(src).forEach(function (k) { fuori[k] = src[k]; });
        /* Gli ITEM si copiano in profondità di un livello: correggere una
           domanda del clone non deve cambiare la stessa domanda nell'originale.
           È il motivo per cui si clona. */
        fuori.items = (src.items || []).map(function (it) {
            if (!it || typeof it !== 'object') return it;
            var o = {};
            Object.keys(it).forEach(function (k) {
                o[k] = Array.isArray(it[k]) ? it[k].slice() : it[k];
            });
            return o;
        });
        fuori.id = opts.id || (src.id ? src.id + '-copia' : 'copia');
        fuori.clone = n;
        /* Il titolo segue l'etichetta, così l'elenco e l'editor dicono la stessa
           cosa. Il titolo dell'originale non si eredita: portava il nome della
           mappa («La Politica Svizzera — Scelta Multipla»), che nel clone
           sarebbe di nuovo il contesto in cui si è già. */
        fuori.titolo = undefined;
        delete fuori.titolo;
        fuori.title = etichetta(_s(src.tipoGenere || opts.genere || ''), n) || _s(src.title || '');
        if (opts.data) fuori.date = opts.data;
        /* ⚠️ `_pipeline` NON si eredita: quel marcatore dice «l'ho generato io
           nella pipeline», e un clone lo ha fatto il docente. Chi conta i
           materiali prodotti da una generazione non deve contare le copie. */
        delete fuori._pipeline;
        return fuori;
    }

    /* I nomi dei cloni già presenti per un genere, dati i materiali di ELABORA.
       Sta qui e non nella console perché è la stessa domanda che si fa il
       validatore: «questo nome è già preso?». */
    function cloniDi(materiali, genere) {
        return (materiali || [])
            .filter(function (m) { return m && m.tipo === genere && m.clone; })
            .map(function (m) { return m.clone; });
    }

    /* ── DOVE VIVE UN DOCUMENTO CHE NASCE DALLA MAPPA ────────────────────────
       Foglio dei nodi e catena non sono file: sono un oggetto dentro il
       progetto (`db.nodeSheet`, `db.causalDoc`), UNO per mappa. Per averne più
       di uno serviva un posto dove metterli, e la scelta è questa:

         db.nodeSheet          → l'ORIGINALE, dov'era              (invariato)
         db.nodeSheetCloni     → { '<nome>': documento }           (nuovo)

       ⚠️ L'originale NON si sposta dentro la mappa dei cloni. Ogni progetto già
       salvato ha `db.nodeSheet` con dentro il lavoro del docente: spostarlo
       vorrebbe dire una migrazione che, sbagliata anche una volta, perde un
       documento. Così un progetto vecchio si apre esattamente come prima, e la
       mappa dei cloni nasce vuota quando serve.

       Le tre funzioni ricevono il `db` e lo toccano: non sono «pure» nel senso
       stretto, ma lo sono nel senso che conta — non guardano né lo stato globale
       né l'orologio, e si provano in Node passando un oggetto. */
    function campoCloni(campo) { return _s(campo) + 'Cloni'; }

    function leggiDoc(db, campo, clone) {
        if (!db) return null;
        var n = pulisci(clone);
        if (!n) return db[campo] || null;
        var mappa = db[campoCloni(campo)];
        return (mappa && mappa[chiave(n)]) || null;
    }

    function scriviDoc(db, campo, clone, valore) {
        if (!db) return false;
        var n = pulisci(clone);
        if (!n) { db[campo] = valore; return true; }
        var k = campoCloni(campo);
        if (!db[k] || typeof db[k] !== 'object') db[k] = {};
        /* La CHIAVE è normalizzata (minuscole, spazi compattati) perché due
           nomi che differiscono solo per le maiuscole sono lo stesso documento;
           il nome COME L'HA SCRITTO il docente resta dentro, ed è quello che si
           mostra. */
        db[k][chiave(n)] = valore;
        if (valore && typeof valore === 'object') valore.clone = n;
        return true;
    }

    function eliminaDoc(db, campo, clone) {
        var n = pulisci(clone);
        if (!db || !n) return false;                 /* l'originale non si elimina da qui */
        var mappa = db[campoCloni(campo)];
        if (!mappa || !mappa[chiave(n)]) return false;
        delete mappa[chiave(n)];
        return true;
    }

    /* I nomi dei cloni di un genere, come li ha scritti il docente. */
    function elencaCloni(db, campo) {
        var mappa = (db && db[campoCloni(campo)]) || {};
        return Object.keys(mappa).map(function (k) {
            var d = mappa[k];
            return (d && d.clone) || k;
        });
    }

    /* Le opzioni da passare a `buildFileName` perché il file del clone abbia un
       nome suo. Una riga, ma è LA riga: senza `nome`, il clone scriverebbe
       sopra il file dell'originale senza dire niente. */
    function opzioniFile(mappa, nome) {
        var o = { mappa: _s(mappa) };
        var n = pulisci(nome);
        if (n) o.nome = n;
        return o;
    }

    return {
        pulisci: pulisci,
        chiave: chiave,
        nomeAuto: nomeAuto,
        valida: valida,
        etichetta: etichetta,
        clonaSet: clonaSet,
        cloniDi: cloniDi,
        campoCloni: campoCloni,
        leggiDoc: leggiDoc,
        scriviDoc: scriviDoc,
        eliminaDoc: eliminaDoc,
        elencaCloni: elencaCloni,
        opzioniFile: opzioniFile,
        GENERI: GENERI,
        MAX: MAX
    };
}));
