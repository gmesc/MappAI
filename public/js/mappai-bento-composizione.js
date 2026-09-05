/* ═══════════════════════════════════════════════════════════════════════════
   COMPOSIZIONE DEL BENTO di COSTRUISCI
   Fonte UNICA: la usa l'Officina §7 per comporre e il modulo dell'app per montare.

   Quattro cose stanno qui dentro, e stanno insieme apposta:

   1. `VOCI` — l'inventario di TUTTO ciò che la pipeline sa leggere. Ogni voce
      porta l'id VERO del campo (`mp-quiz-on`, `mp-ns-fmt`…): è quello che
      `MappAIPipeline._readConfig()` cerca nel DOM. Comporre il bento vuol dire
      decidere DOVE mettere quei campi, non riscriverli.
      ⚠️ Ogni voce dichiara anche `seFuori`: che cosa succede se non la si monta.
      Non è documentazione — è ciò che il banco mostra quando una voce resta
      nell'inventario, perché «manca» non basta: manca *e costa quanto*.

   2. `MODULI` — la composizione: quali voci in quale riquadro, in che ordine,
      con quante colonne e con quale ASPETTO (fondo, testo, bordo, altezza).

   3. `SCALA` — i tre corpi tipografici dichiarati (ce n'erano quattro, con 12 e
      12,5 a distinguersi per niente).

   4. Le regole pure: `valida` dice cosa è rimasto fuori, quale riga non chiude
      la griglia, chi è staccato dal suo master e quali coppie fondo/testo non si
      leggono. Testate in tests/bento-composizione.test.js.

   Una VOCE può essere una stringa (`'mp-qt-mc'`) o un oggetto `{id, et, w}` —
   `et` riscrive l'etichetta, `w` fissa la larghezza del campo. `vociDi(m)`
   normalizza le due forme: chi legge non deve saperlo.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIBento = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SCALA = {
        titolo: { px: 14, peso: 700, uso: 'titolo del modulo' },
        /* ⚠️ `pesoTitolo` non è un quarto corpo: è lo stesso 12px col peso del
           titolo. Il titolo di una RIGA di strumento («MindMap», «Profondità»)
           è un titolo, ma sta dentro una riga alta 30px e i 14px del titolo del
           riquadro non ci stanno. Dichiarato qui perché l'officina misura le
           coppie px/peso e senza questa riga segnalerebbe come «fuori scala» un
           grassetto voluto. */
        voce: { px: 12, peso: 600, pesoTitolo: 700, uso: 'opzioni, etichette di campo, campi, riga di esito' },
        azione: { px: 15, peso: 700, uso: 'le due card che concludono' }
    };

    /* l'aspetto di partenza di un modulo senza stile proprio: il grigio scuro del
       progetto (#404040 dal 5/8, era #0b0b0b) con testo chiaro — 10,37:1 */
    var STILE_BASE = { bg: '#404040', testo: '#ffffff', bordoPx: 0, bordoCol: '#333333' };

    /* ── I CONTROLLI GRANULARI DENTRO UN MODULO (5/8) ─────────────────────────
       Fin qui l'officina governava il RIQUADRO (titolo, icona, colonne, altezza,
       fondo, testo, bordo) e la singola voce (etichetta, larghezza del campo). Il
       livello in mezzo — come stanno le voci DENTRO il riquadro e che aspetto
       hanno i bottoni là dentro — viveva solo nel foglio: il `minmax(220px, 1fr)`
       della griglia, il `color-mix(currentColor 14%)` dei bottoni. Numeri veri, e
       non discutibili.
       ⚠️ Ogni campo qui vale '' o il valore di `LAYOUT_BASE`/`BOTTONI_BASE`
       quando NON è stato scelto, e in quel caso il renderer non emette niente: il
       foglio resta sul suo fallback e la resa è identica a prima. Una leva
       aggiunta non deve cambiare l'aspetto di chi non la tocca. */
    var LAYOUT_BASE = {
        etichette: 'sinistra',   /* 'sinistra' (a fianco del campo) | 'sopra' */
        etLarghezza: 0,          /* px: colonna FISSA delle etichette (0 = naturale).
                                    È la leva che allinea i campi fra loro: senza,
                                    ogni riga parte dove finisce la sua etichetta */
        colonneVoci: 'auto',     /* 'auto' | 'colonna' | 1..6 */
        colMin: 220              /* px: minimo di una colonna quando è 'auto' */
    };
    /* '' = derivato dal modulo. Il derivato è quello che il foglio fa già oggi:
       fondo = colore del testo al 14% sopra il fondo del riquadro, testo = quello
       del riquadro, e al passaggio verde con segno scuro (regola del 3/8). */
    var BOTTONI_BASE = { bg: '', testo: '', hoverBg: '', hoverTesto: '' };
    var BOTTONI_DERIVA = { mix: 14, hoverBg: '#41e6aa', hoverTesto: '#404040' };

    /* Le misure della griglia, per dire se una colonna di voci è troppo stretta.
       Sono i numeri MISURATI sull'app (bento 1236px, 4 colonne, gap 14): il banco
       non può chiedere al DOM, quindi li dichiara. */
    var GEOM = { colonna: 298.5, gap: 14, padding: 40, gapVoci: 8, minLeggibile: 120 };

    var VOCI = [
        /* ── Il CONTESTO: «Chi» e «Cosa» ──────────────────────────────────────
           In COSTRUISCI il chip dell'header è nascosto, quindi queste due voci
           sono l'UNICO posto dove il destinatario si dichiara — ed è anche il
           motivo per cui esistono: la generazione si bloccava perché il contesto
           veniva chiesto dopo, da un modale che finiva sotto il velo.
           Non portano un campo nuovo nella pipeline: SCRIVONO il contesto attivo
           (`setActive` / `setActiveStudent` / `setActiveDiscipline`), che è da
           dove `_resolveFolderPath` e la taratura già leggono. */
        /* ⚠️ I due punti stanno nell'ETICHETTA, non aggiunti dal renderer: sono
           domande, non nomi di campo, e l'anteprima dell'Officina rende per tipo
           — un'aggiunta nel solo renderer dell'app le farebbe divergere. Chi
           riscrive l'etichetta decide anche la punteggiatura. */
        { id: 'mp-chi', aiuto: 'Per chi è questa mappa: una classe o un singolo allievo. Decide la cartella dove finiscono i materiali e la taratura con cui l\u0027AI scrive.', et: 'Chi:', tipo: 'tendina', chiave: 'classId (contesto attivo)', daContesto: true,
          seFuori: '⚠️ senza «Chi» il destinatario resta quello dell\'ultima volta e non si vede: è il difetto che bloccava la generazione. Il gate del bottone non può nemmeno dire cosa manca' },
        { id: 'mp-disc', aiuto: 'La materia della classe scelta. Serve alla cartella (Mappe/classe/materia) e al taglio disciplinare del prompt.', et: 'Cosa:', tipo: 'tendina', chiave: 'disciplina (contesto attivo)', figlioDi: 'mp-chi',
          seFuori: 'con una classe a 2+ materie la cartella non si può decidere qui → il modale «Per quale classe e disciplina?» torna a chiederlo prima di generare' },
        { id: 'mp-class', aiuto: 'La classe che riceve i materiali. Di norma la scrive «Chi» e questo campo resta nascosto.', et: 'Classe destinataria', tipo: 'tendina', chiave: 'classId', daContesto: true,
          seFuori: 'la classe la dà «Chi» (o, senza quello, il CHIP dell\'header): il modulo monta un campo nascosto col contesto attivo, quindi i materiali finiscono comunque nella cartella giusta' },
        { id: 'mp-preset', aiuto: 'Salva questa configurazione di opzioni e la richiama la prossima volta. La classe non viene salvata nel preset.', et: 'Preset (salva e richiama)', tipo: 'preset', chiave: 'preset',
          seFuori: 'le opzioni si scelgono ma non si conservano: ogni volta si riparte da capo' },
        { id: 'mp-adapt-on', aiuto: 'Applica al testo generato il registro e le note della classe attiva (semplice · standard · ricco).', et: 'Adatta alla classe', tipo: 'spunta', chiave: 'levelTuned/tuned', master: true,
          seFuori: 'la taratura della CLASSE ATTIVA si applica lo stesso (preset + note): il modulo monta una spunta nascosta accesa. Scelta di Giacomo (4/8) — chi ha assegnato un preset a una classe non deve riconfermarlo a ogni generazione' },
        { id: 'mp-adapt-scope', aiuto: 'Se la taratura vale solo per la mappa, solo per i materiali o per entrambi.', et: 'Ambito dell\'adattamento', tipo: 'radio', chiave: 'levelTuned/tuned', figlioDi: 'mp-adapt-on',
          seFuori: 'la pipeline usa «Entrambi» (mappa + materiali): è il default, non una perdita' },

        /* ⚠️ `derivato` è la ragione per cui i due check «generici» non stanno più
           a schermo. Spuntare «Scelta multipla» DICE GIÀ che i quiz si generano:
           chiedere una seconda conferma in un riquadro a monte è un passaggio che
           non aggiunge una decisione. Il master resta però un DATO — si monta
           nascosto e si accende se almeno uno dei suoi figli è spunto — perché
           `MappAIPipeline._readConfig()` deve restare l'unico posto che legge la
           configurazione: derivare qui e non lì significa zero modifiche alla
           pipeline, e il modale storico (veste spenta) continua a funzionare. */
        { id: 'mp-quiz-on', aiuto: 'Genera quiz e flashcard dai rami della mappa. Si accende da sé quando spunti un genere qui sotto.', et: 'Quiz e flashcard', tipo: 'spunta', chiave: 'quiz', master: true,
          derivato: ['mp-qt-mc', 'mp-qt-fc', 'mp-qt-open'],
          seFuori: 'nessuna perdita: si accende da sé se almeno un genere di quiz è spuntato' },
        { id: 'mp-qt-mc', aiuto: 'Domande a scelta multipla con distrattori e spiegazione della risposta.', et: 'Scelta multipla', tipo: 'spunta', chiave: 'quiz.types', figlioDi: 'mp-quiz-on', seFuori: 'nessun quiz a scelta multipla' },
        { id: 'mp-qt-fc', aiuto: 'Carte domanda/risposta da studiare o da stampare e ritagliare.', et: 'Flashcard', tipo: 'spunta', chiave: 'quiz.types', figlioDi: 'mp-quiz-on', seFuori: 'nessuna flashcard' },
        /* Le domande aperte NON producono un set giocabile: sono un foglio da
           stampare, con le righe per scrivere e le tracce di correzione in coda
           (vedi `_QT.open` nella pipeline). Stanno qui perché per il docente la
           scelta è la stessa — «che verifica preparo?» — non perché siano un
           quiz. */
        { id: 'mp-qt-open', aiuto: 'Domande a cui si risponde scrivendo: il foglio porta le righe per la risposta e, in coda, le tracce di correzione per te.', et: 'Domande aperte', tipo: 'spunta', chiave: 'quiz.types', figlioDi: 'mp-quiz-on', seFuori: 'nessun foglio di domande aperte' },
        { id: 'mp-perbranch', aiuto: 'Quante domande generare per ogni ramo della mappa. Più domande = più chiamate AI.', et: 'Per ramo', tipo: 'numero', chiave: 'quiz.perBranch', figlioDi: 'mp-quiz-on', seFuori: 'restano 3 domande per ramo (default)' },
        { id: 'mp-angle', aiuto: 'Il taglio delle domande, quando se ne genera UNO solo. Dal 19/8 gli angoli si spuntano nel box «Più set per angolo»: questa tendina è fuori dalla composizione.', et: 'Angolo', tipo: 'tendina', chiave: 'quiz.angle', figlioDi: 'mp-quiz-on', seFuori: 'l\u0027angolo lo dicono le spunte del box «Più set per angolo»; un genere senza angoli spuntati esce ad angolo misto' },

        /* ⚠️ Una casella PER ANGOLO, e nessun interruttore generale: spegnerle
           tutte È lo spegnimento, e così si dice anche QUALI angoli servono —
           cosa che un interruttore solo non poteva dire. Con esse la tendina
           «Angolo» del box Quiz è uscita dalla composizione: erano due comandi
           per la stessa domanda (inv. 21).
           A CHE COSA si applica lo dicono le spunte di «Output automatici»
           («Scelta multipla», «Domande aperte»): ripeterle qui era una ridondanza
           (Giacomo, 4/9) — qui stanno SOLO gli angoli, cioè QUANTE volte. */
        { id: 'mp-ang-definizione', aiuto: 'Genera un materiale con questo taglio: che cos\u0027è: il concetto spiegato. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Definizione', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Definizione» non viene generato' },
        { id: 'mp-ang-causa', aiuto: 'Genera un materiale con questo taglio: perché avviene, che cosa lo provoca. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Causa', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Causa» non viene generato' },
        { id: 'mp-ang-conseguenza', aiuto: 'Genera un materiale con questo taglio: che cosa comporta, che cosa ne deriva. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Conseguenza', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Conseguenza» non viene generato' },
        { id: 'mp-ang-esempio', aiuto: 'Genera un materiale con questo taglio: il concetto applicato a un caso della fonte. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Esempio concreto', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Esempio concreto» non viene generato' },
        { id: 'mp-ang-confronto', aiuto: 'Genera un materiale con questo taglio: differenze e somiglianze fra due elementi. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Confronto', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Confronto» non viene generato' },
        { id: 'mp-ang-eccezione', aiuto: 'Genera un materiale con questo taglio: quando NON vale, i casi particolari. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Eccezione / limite', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Eccezione / limite» non viene generato' },
        { id: 'mp-ang-applicazione', aiuto: 'Genera un materiale con questo taglio: usare il concetto per dedurre o risolvere. Ogni angolo spuntato è una generazione in più — guarda la stima.', et: 'Applicazione / inferenza', tipo: 'spunta', chiave: 'quiz.angoli',
          seFuori: 'l\u0027angolo «Applicazione / inferenza» non viene generato' },

        /* ⚠️ `mp-ns-causal` NON è fra i derivanti: spuntare la catena non deve
           accendere i fogli nodi, o si otterrebbe un PDF di fogli che nessuno ha
           chiesto. È un materiale a sé. */
        { id: 'mp-ns-on', aiuto: 'Genera i fogli con una card per nodo, da stampare e ritagliare. Si accende da sé quando spunti un genere.', et: 'Fogli nodi', tipo: 'spunta', chiave: 'nodesheet', master: true,
          derivato: ['mp-ns-title', 'mp-ns-keywords', 'mp-ns-summary', 'mp-ns-card'],
          seFuori: 'nessuna perdita: si accende da sé se almeno un genere di foglio è spuntato' },
        { id: 'mp-ns-level', aiuto: 'Fino a che livello della mappa prendere i nodi da stampare.', et: 'Livello', tipo: 'tendina', chiave: 'nodesheet.maxLevel', figlioDi: 'mp-ns-on', seFuori: 'tutti i livelli (default)' },
        { id: 'mp-ns-fmt', aiuto: 'Quante card per foglio A4: 2×1 grandi, 2×2 medie, 3×4 piccole.', et: 'Formato', tipo: 'tendina', chiave: 'nodesheet.fmt', figlioDi: 'mp-ns-on', seFuori: 'formato 2×2 (default)' },
        { id: 'mp-ns-title', aiuto: 'Card con il solo titolo del nodo: si usa per ricostruire la mappa a memoria.', et: 'Titolo', tipo: 'spunta', chiave: 'nodesheet.modes', figlioDi: 'mp-ns-on',
          seFuori: 'senza nessun genere scelto la pipeline ripiega su «titolo»: è il default, non una perdita' },
        { id: 'mp-ns-keywords', aiuto: 'Card con il titolo e le sue parole chiave.', et: 'Parole chiave', tipo: 'spunta', chiave: 'nodesheet.modes', figlioDi: 'mp-ns-on', seFuori: 'niente fogli con parole chiave' },
        { id: 'mp-ns-summary', aiuto: 'Card con il titolo e lo spazio bianco da riempire a mano.', et: 'Da completare', tipo: 'spunta', chiave: 'nodesheet.modes', figlioDi: 'mp-ns-on', seFuori: 'niente fogli da completare' },
        { id: 'mp-ns-card', aiuto: 'Card con il titolo e la descrizione intera del nodo.', et: 'Scheda', tipo: 'spunta', chiave: 'nodesheet.modes', figlioDi: 'mp-ns-on', seFuori: 'niente fogli-scheda' },
        /* ⚠️ MATERIALE INDIPENDENTE dal 5/8 (decisione di Giacomo): niente
           `figlioDi`, chiave `causal` a livello di config, PDF suo in
           «Materiale Studio/» (step E della pipeline). Prima era un'opzione dei
           fogli nodi e le sue pagine finivano in coda a quel PDF: per avere la
           catena bisognava chiedere anche i fogli.
           L'id resta `mp-ns-causal`, che oggi è fuorviante: è un id del DOM e
           cambiarlo invaliderebbe i preset già salvati sul computer di Giacomo. */
        { id: 'mp-ns-causal', aiuto: 'Un documento a sé che ricostruisce i nessi di causa fra i concetti della mappa. Non costa chiamate AI: i legami sono già nel grafo.', et: 'Catena dei perché', tipo: 'spunta', chiave: 'causal',
          seFuori: 'niente catena dei perché fra i materiali (nessun altro materiale la contiene: è un file suo)' },

        { id: 'mp-syn-on', aiuto: 'Un testo continuo che riassume la mappa, da leggere o da ascoltare.', et: 'Sintesi della mappa', tipo: 'spunta', chiave: 'synthesis', master: true, seFuori: 'niente sintesi' },
        { id: 'mp-syn-audio', aiuto: 'Legge la sintesi con la voce naturale di Google e salva l\u0027audio accanto al testo. Costa chiamate AI.', et: 'Voce naturale (audio)', tipo: 'spunta', chiave: 'synthesis.audio', figlioDi: 'mp-syn-on', seFuori: 'sintesi solo testo' },

        { id: 'mp-src-pdf', aiuto: 'Copia il file di partenza dentro il vault, in «Allegati»: la cartella dell\u0027allievo basta a sé stessa.', et: 'Salva la fonte in «Allegati»', tipo: 'spunta', chiave: 'sourcePdf', seFuori: 'la fonte non viene copiata nel vault' },
        { id: 'mp-estimate', aiuto: 'Quante chiamate all\u0027AI costerà quello che hai spuntato, aggiornato mentre scegli.', et: 'Stima chiamate AI', tipo: 'esito', chiave: '—',
          seFuori: '⚠️ si sceglie senza vedere quanto costa: è la ragione per cui il modale è stato portato in pagina' },

        /* Fuori dalla composizione dal 5/8, e non è una perdita: senza nessun
           materiale spuntato è «Genera materiali» stesso a diventare blu e a
           chiamarsi «Genera Mappa». Un bottone che si adatta al posto di due
           affiancati di cui uno è sempre quello sbagliato. */
        { id: 'mn-solo-mappa', aiuto: 'Genera la sola mappa, senza materiali.', et: 'Genera solo la mappa', tipo: 'azione', chiave: '—',
          seFuori: 'nessuna perdita: senza materiali spuntati «Genera materiali» diventa blu e genera la sola mappa' },

        /* ═══ GLI STRUMENTI: ciò che la vista compatta nasconde ══════════════════
           La vista compatta lascia a schermo la strada breve (PDF → genere → tema →
           genera) e nasconde tutto il resto. Quelle funzioni non sono sparite: sono
           irraggiungibili, e finché stanno solo in un blocco CSS di nascondimenti
           non si possono nemmeno DISCUTERE. Da qui diventano voci componibili come
           le altre: si trascinano in un modulo dall'Officina §7.

           Due modi, e la differenza è sostanziale:
           · `sposta` — il modulo accoglie l'ELEMENTO VERO, che viene spostato lì
             dentro. Vale per tutto ciò che ha uno STATO (toggle, campi, pannelli):
             ridisegnarne una copia vorrebbe dire due controlli per lo stesso stato,
             che divergono al primo clic. È la stessa scelta del tema centrale e
             dello slider dei nodi in `#mn-genere-dx`.
           · `chiama` — un bottone che invoca una funzione. Vale per ciò che APRE
             qualcosa: non c'è stato da tenere allineato.
           ⚠️ Una voce `sposta` montata qui toglie l'elemento dal suo posto storico
           ANCHE nella vista piena: una casa sola per ogni controllo, non due. */

        /* Il box delle FONTI CARICATE: accoglie `#sources-container`, cioè le righe
           vere delle fonti non-PDF — il campo dove si incolla un URL, quello di
           YouTube, la textarea del testo copiato — con dentro i loro campi veri.
           Va messo accanto al box INPUT: i bottoni chiedono la fonte, questo la
           mostra e la fa compilare. È l'unica voce che può CRESCERE (fino a 30
           righe, poi scorre), e per questo la sua riga sta in fondo al bento: se
           stesse in mezzo, incollare un testo lungo sposterebbe tutto il resto. */
        /* ⚠️ `nascondiEt`: il posto non scrive NESSUNA etichetta, nemmeno da vuoto
           (5/8, richiesta di Giacomo: «in questo box voglio eliminare tutti i
           titoli»). Il nome resta nell'inventario dell'officina, dove serve a
           sapere che cosa si sta trascinando; a schermo un titolo sopra un elenco
           di fonti ripete quello che l'elenco già mostra.
           ⚠️ Dal 5/8 questo box è un ELENCO come quello dei PDF, non più una pila di
           campi: la stessa domanda («che cosa ho caricato?») deve avere la stessa
           risposta, qualunque sia il genere della fonte. Le righe di link, video e
           audio ci stanno compatte; la textarea del testo libero no — ha bisogno di
           spazio per essere scritta e vive nel suo box (`mn-testo`). */
        { id: 'mn-input-box', aiuto: 'Le fonti che non sono file: qui si incolla il link o l\u0027indirizzo del video.', et: 'Elenco delle fonti (link · video · audio)', tipo: 'strumento', forma: 'elenco', chiave: '—',
          sposta: '#sources-container', gruppo: 'Fonti', grande: true, nascondiEt: true,
          vuoto: 'Le fonti scelte qui a sinistra compaiono in questo elenco.',
          seFuori: '⚠️ i bottoni URL, YouTube e Audio aprono un campo che non si vede: quelle fonti diventano inutilizzabili' },
        /* Il box del TESTO LIBERO: non «sposta» un elemento fisso ma RACCOGLIE le
           righe-fonte che contengono una textarea, comprese quelle create dopo. È
           l'unico caso in cui il pezzo da montare non esiste al montaggio: nasce
           quando si preme «Testo». Cresce fino a 30 righe e poi scorre. */
        { id: 'mn-testo', aiuto: 'L\u0027area dove incollare gli appunti. Si allarga fino a trenta righe, poi scorre.', et: 'Testo libero (area di scrittura)', tipo: 'strumento', forma: 'area', chiave: '—',
          raccoglie: 'textarea', gruppo: 'Fonti', cresce: true, grande: true, nascondiEt: true,
          vuoto: 'Premi «Testo» fra le fonti: qui compare l\'area dove incollare gli appunti.',
          seFuori: '⚠️ premendo «Testo» il campo dove incollare gli appunti compare nell\'elenco delle fonti, stretto in una riga' },

        /* ── I QUATTRO PEZZI DELLA PRIMA SEZIONE (5/8, richiesta di Giacomo) ───
           Il bottone che carica i documenti, l'elenco delle fonti, la scelta del
           genere di mappa e le sue opzioni erano impaginati da `RIGHE`, cioè FUORI
           dalla composizione: si vedevano nell'app e non nell'officina, che quindi
           mostrava una schermata diversa da quella vera — ed è il difetto che un
           banco esiste per non far succedere.
           Ora sono voci come le altre, montate in moduli **nudi**: il modulo È il
           pezzo. Un riquadro attorno a un pezzo che il suo fondo ce l'ha già
           sarebbe un secondo contorno e un'altezza in più.
           ⚠️ Chi li toglie dalla composizione se li ritrova dove stavano prima:
           `impagina()` costruisce le due righe storiche solo per i pezzi che il
           bento non ha preso. Niente resta orfano. */
        { id: 'mn-upload', aiuto: 'Carica PDF, testo, CSV o Markdown: il testo viene estratto sul computer prima di andare all\u0027AI.', et: 'Carica documenti', tipo: 'strumento', forma: 'bottone', chiave: '—',
          sposta: '#btn-src-doc', gruppo: 'Fonti', grande: true,
          seFuori: '⚠️ il bottone da cui si carica un PDF torna nella riga storica sopra il bento: la prima fase resta a schermo ma non si compone' },
        { id: 'mn-elenco', aiuto: 'Che cosa hai caricato finora, con il peso di ogni file. Il pallino toglie la fonte.', et: 'Elenco delle fonti caricate', tipo: 'strumento', forma: 'elenco', chiave: '—',
          sposta: '#mn-files', gruppo: 'Fonti', grande: true,
          seFuori: 'l\'elenco di ciò che è stato caricato (file, link, video, testo) torna nella riga storica' },
        { id: 'mn-genere', aiuto: 'MAPPA MENTALE: un albero che parte da un tema. KNOWLEDGE GRAPH: concetti collegati fra loro, senza radice obbligata.', et: 'Mappa Mentale / Knowledge Graph', tipo: 'strumento', forma: 'segmento', chiave: '—',
          sposta: '#setup-form .mode-buttons-container', gruppo: 'Contenuto', grande: true,
          seFuori: 'la scelta del genere di mappa torna nella riga storica sopra il bento' },
        { id: 'mn-genere-opz', aiuto: 'Il tema centrale della mappa mentale, oppure quanti concetti generare nel grafo.', et: 'Tema centrale / numero di nodi', tipo: 'strumento', forma: 'campo', chiave: '—',
          sposta: '#mn-genere-dx', gruppo: 'Contenuto', grande: true,
          seFuori: 'il tema centrale (MindMap) e lo slider dei nodi (KG) tornano nella riga storica' },

        /* — le altre quattro fonti — */
        { id: 'mn-src-url', aiuto: 'Parti da una pagina web: MappAI ne scarica il contenuto.', et: 'Link web', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#btn-src-url',
          gruppo: 'Fonti', seFuori: 'in vista compatta non si può partire da una pagina web' },
        { id: 'mn-src-youtube', aiuto: 'Parti da un video YouTube: MappAI ne estrae il parlato.', et: 'Video YouTube', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#btn-src-youtube',
          gruppo: 'Fonti', seFuori: 'in vista compatta non si può partire da un video' },
        { id: 'mn-src-audio', aiuto: 'Parti da una registrazione: MappAI la ascolta e ne ricava il testo.', et: 'File audio', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#btn-src-audio',
          gruppo: 'Fonti', seFuori: 'in vista compatta non si può partire da una registrazione' },
        { id: 'mn-src-text', aiuto: 'Incolla appunti presi a mano o un testo copiato da altrove.', et: 'Testo libero', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#btn-src-text',
          gruppo: 'Fonti', seFuori: 'in vista compatta non si possono incollare appunti' },

        /* — che cosa entra nella mappa — */
        { id: 'mn-l1', aiuto: 'Scrivi tu le macro-aree invece di lasciarle decidere all\u0027AI: diventano i rami di primo livello. Il toggle qui sotto le lascia decidere all\u0027AI.', et: 'Macro-aree a mano', tipo: 'strumento', forma: 'pannello', chiave: '—',
          /* ⚠️ `#input-l1-container` e NON `#step-l1-wrap`: il wrap contiene anche
             il blocco del Focus specifico, che ha una voce SUA (`mn-focus`) — montando
             il wrap, il box delle macro-aree si portava dentro «Focus specifico
             (Opzionale)» e nel form restava un'etichetta orfana. Il contenitore giusto
             porta le macro-aree e il loro toggle «Genera Macro-Aree in automatico». */
          sposta: '#input-l1-container',
          gruppo: 'Contenuto', seFuori: 'le macro-aree le decide sempre l\'AI: non si può imporre l\'ossatura' },
        { id: 'mn-focus', aiuto: 'Restringe la mappa a un aspetto della fonte («solo le cause», «solo il Novecento»).', et: 'Focus specifico', tipo: 'strumento', forma: 'campo', chiave: '—', sposta: '#focus-input',
          gruppo: 'Contenuto', seFuori: 'non si può restringere la mappa a un aspetto della fonte' },
        { id: 'mn-lenti', aiuto: 'Filtri disciplinari che dicono all\u0027AI che cosa cercare: date, personaggi, formule, definizioni…', et: 'Lenti di estrazione', tipo: 'strumento', forma: 'pannello', chiave: '—', sposta: '#lenses-panel',
          gruppo: 'Contenuto', seFuori: 'niente lenti disciplinari: l\'AI estrae senza un taglio dichiarato' },
        { id: 'mn-disciplina', aiuto: 'Il taglio disciplinare del prompt, scelto a mano invece che dal contesto.', et: 'Disciplina (prompt)', tipo: 'strumento', forma: 'campo', chiave: '—', sposta: '#discipline-picker',
          gruppo: 'Contenuto', seFuori: 'il prompt non riceve il taglio disciplinare scelto a mano' },
        { id: 'mn-livello', aiuto: 'Adatta i contenuti a un linguaggio accessibile all\u0027età dei destinatari ma resta fedele ai fatti della fonte. Serve per fonti esterne (articoli, video, pagine web).', et: 'Adatta', tipo: 'strumento', forma: 'interruttore', chiave: '—', sposta: '#level-tune-row',
          gruppo: 'Contenuto', seFuori: 'la vista compatta lo accende da sé col preset SEMPLICE, ma non si può decidere' },

        /* — come lavora il motore — */
        /* ⚠️ I selettori puntano alla RIGA (`#row-…`), non al singolo bottone. Uno
           switch è fatto di due facce più il nome della cosa che governa: montando
           `#multipass-on` arrivava mezzo interruttore, senza nome e senza
           spiegazione — a schermo si leggeva «ON», «MappAI», «A», che sono valori,
           non comandi. Con la riga arrivano etichetta, entrambe le facce e il
           `data-tip` che il markup già portava. */
        { id: 'mn-multipass', et: 'Multi-pass (a fasi o in un colpo solo)', tipo: 'strumento', forma: 'segmento', chiave: '—',
          sposta: '#row-multipass', gruppo: 'Motore',
          aiuto: 'ON genera la mappa a fasi — regge le mappe grandi. OFF la fa in una volta sola: più veloce sulle schede brevi.',
          seFuori: 'la vista compatta lo tiene ACCESO per default: non si può spegnere' },
        /* ⚠️ Le due voci che Giacomo non riusciva a distinguere. Sono cose diverse:
           una sceglie COME si costruiscono i rami, l'altra QUANTO si scende. Il nome
           lo dice adesso, e l'aiuto lo ripete per esteso. */
        { id: 'mn-mmlogic', et: 'MindMap: come costruisce i rami (Normale · Adattiva)', tipo: 'strumento', forma: 'segmento', chiave: '—',
          sposta: '#row-mm-logic', gruppo: 'Motore',
          aiuto: 'ADATTIVA (consigliata) legge prima che tipo di scheda è e adatta la costruzione: meno rami inventati su fonti povere. NORMALE è la costruzione classica. Non decide QUANTI livelli — quello è «Profondità».',
          seFuori: 'resta «Adattiva», che è il default della vista compatta' },
        { id: 'mn-autodepth', et: 'Profondità: automatica o scelta a mano', tipo: 'strumento', forma: 'interruttore', chiave: '—',
          sposta: '#row-gen-depth', gruppo: 'Motore',
          aiuto: 'Fino a che livello scendono i rami. Con «Automatica» lo decide MappAI dal tipo di scheda e il menu a fianco si spegne; spenta, il livello lo scegli tu (L2 essenziale → L5 massimo). ⚠️ Non è «Mostra fino a», che nasconde e basta.',
          seFuori: 'resta automatica: il tetto di profondità non si può fissare a mano' },
        /* Il MENU del livello, staccato dal suo toggle (5/8, richiesta di Giacomo):
           «Profondità» con auto|manuale su una riga, e il livello su quella sotto —
           attivo solo con «manuale» (lo disabilita `syncAutoDepthUI`, che era già
           scritto per il caso in cui il menu stava accanto al toggle).
           ⚠️ `mn-autodepth` sposta la RIGA intera (`#row-gen-depth`), che nel markup
           contiene anche questo select: montando entrambe le voci, il select viene
           tirato fuori dalla riga e finisce nel suo posto. L'ordine conta — chi
           sposta la riga deve venire prima. */
        { id: 'mn-gendepth', et: 'Livello massimo', tipo: 'strumento', forma: 'campo', chiave: '—',
          sposta: '#gen-depth-select', gruppo: 'Motore', figlioDi: 'mn-autodepth',
          aiuto: 'Fino a che livello di dettaglio MappAI genera i rami. Si sceglie solo con «Profondità: manuale»; il dettaglio più fine confluisce nelle descrizioni. Diverso da «Mostra fino a», che è un filtro di vista.',
          seFuori: 'con «Profondità: manuale» non si può dire QUALE livello: resta quello impostato l\'ultima volta' },
        { id: 'mn-pipeline', et: 'Knowledge Graph: pipeline A / B', tipo: 'strumento', forma: 'segmento', chiave: '—',
          sposta: '#row-kg-logic', gruppo: 'Motore',
          aiuto: 'Solo per i Knowledge Graph. A: comunità GraphRAG, relazioni più ricche. B: MappAI classico.',
          seFuori: 'resta la pipeline attiva: nessun confronto A/B' },
        { id: 'mn-stima', aiuto: 'Quanti token ha la fonte e quanto costerà la generazione.', et: 'Stima token e costi', tipo: 'strumento', forma: 'esito', chiave: '—', sposta: '#token-cost-estimator-card',
          gruppo: 'Motore', seFuori: 'non si vede quanto costerà la generazione (vive anche nella Cabina)' },

        /* — aprire e analizzare — */
        { id: 'mn-apri-vault', aiuto: 'Riapre una mappa già salvata scegliendo la sua cartella.', et: 'Apri Vault', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#qa-apri-vault',
          gruppo: 'Apri', seFuori: 'resta fra i TRE AVVII in fondo alla pagina, dov\u0027è sempre stato: non montarlo qui non lo toglie di mezzo' },
        { id: 'mn-apri-json', aiuto: 'Importa una mappa da un file JSON.', et: 'Apri JSON', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#qa-apri-json',
          gruppo: 'Apri', seFuori: 'resta fra i tre avvii in fondo alla pagina: non montarlo qui non lo toglie di mezzo' },
        { id: 'mn-analisi', aiuto: 'La meta-analisi delle mappe generate: com\u0027è fatta la struttura, dove è povera.', et: 'Analisi (docente)', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#meta-analisi-docente',
          gruppo: 'Apri', seFuori: 'resta il suo bottone in fondo alla pagina (ma NON in vista compatta, dove il blocco dei nascondimenti lo spegne)' },
        { id: 'mn-selftest', aiuto: 'Strumento di chi sviluppa: prova le funzioni dell\u0027app.', et: 'Dev self-test', tipo: 'strumento', forma: 'bottone', chiave: '—', sposta: '#dst-btn',
          gruppo: 'Apri', seFuori: 'nessuna perdita per un docente: è uno strumento di chi sviluppa' },
        { id: 'mn-genera', aiuto: 'Avvia la generazione. Senza materiali spuntati genera la sola mappa.', et: 'Genera materiali', tipo: 'azione', chiave: '—', primaria: true,
          seFuori: '⚠️ non c\'è più modo di avviare la pipeline da questa pagina' }
    ];

    var COLONNE = 4;

    /* ── Le RIGHE sopra il bento, e perché sono un dato ───────────────────────
       COSTRUISCI non è solo il bento: sopra ci sono la riga delle fonti e quella
       del genere di mappa. Erano impaginate con due numeri scritti nel CSS
       (`340px | 1fr`), quindi «due colonne» non voleva dire niente e non si
       poteva discutere in officina come tutto il resto.
       Ora usano la STESSA griglia del bento — `repeat(4, 1fr)`, gap 14 — così le
       colonne si allineano verticalmente con i riquadri sotto invece di essere
       una misura vicina e diversa. Gli span li decide questo dato (5/8):
         fonti:  bottoni 2 | elenco dei file 2
         genere: MM/KG 1   | tema centrale oppure slider dei nodi 3
       `vuotoASinistra` = quante colonne prende la parte sinistra quando la destra
       non ha ancora niente da dire (senza file la colonna dei bottoni si
       distende, altrimenti restano 2 colonne di bianco — misurato in Electron). */
    var RIGHE = [
        /* ⚠️ `vuotoASinistra: 2` — cioè NON cambia (5/8, decisione di Giacomo):
           il bottone e l'elenco ci sono **da subito**, anche a elenco vuoto.
           Rovescia la scelta del 4/8, che distendeva i bottoni su quattro colonne
           finché non c'era un file: la riga cambiava forma sotto le dita, e la
           prima fase del mega-bento deve avere la stessa impaginazione sempre. */
        { id: 'mn-riga-fonti', sinistra: '#setup-form .source-buttons-container', destra: '#mn-files',
          span: [2, 2], vuotoASinistra: 2,
          nota: 'i bottoni-fonte e l\'elenco dei file caricati' },
        { id: 'mn-riga-genere', sinistra: '#setup-form .mode-buttons-container', destra: '#mn-genere-dx',
          span: [1, 3], vuotoASinistra: 1,
          nota: 'Mappa Mentale / Knowledge Graph e, accanto, il tema centrale o lo slider dei nodi' }
    ];

    /* ── La FIRMA della composizione ──────────────────────────────────────────
       L'Officina salva il lavoro in `localStorage`, e al caricamento preferisce
       quello al file: giusto finché si compone, sbagliato quando la composizione
       del CODICE è cambiata sotto — si continuava a ritoccare una versione vecchia
       senza saperlo, e le correzioni sembravano non arrivare (5/8).
       La firma cambia se cambia qualcosa che conta: gli id dei moduli, il loro
       ordine, gli span, le altezze, le voci. NON cambia per i colori, che si
       ritoccano di continuo e non sono struttura. */
    function firma(moduli) {
        var testo = (moduli || []).map(function (m) {
            /* ⚠️ Il LAYOUT delle voci entra nella firma, i colori dei bottoni no:
               la disposizione è struttura (decide quante voci stanno per riga e
               dove cadono le etichette), una tinta è un ritocco. Stessa regola del
               fondo e del testo del modulo. */
            var L = layoutDi(m);
            return [m.id, m.span || 1, m.altezza || 0,
                L.etichette, L.etLarghezza, L.colonneVoci, L.colMin,
                (m.voci || []).map(function (v) { return typeof v === 'string' ? v : (v && v.id); }).join(',')
            ].join('|');
        }).join(';');
        /* hash corto e deterministico (djb2): serve a confrontare, non a proteggere */
        var h = 5381;
        for (var i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) | 0;
        return 'c' + (h >>> 0).toString(36);
    }

    /* ── La FORMA di uno strumento ────────────────────────────────────────────
       Nel banco uno strumento si disegnava come «Nome#id»: un elenco di stringhe
       in cui non si vede né l'ingombro né il peso visivo, e comporre alla cieca è
       esattamente ciò che l'officina serve a evitare (5/8, rilievo di Giacomo).
       `forma` dice CHE COS'È: interruttore · segmento · bottone · campo · area ·
       pannello · esito. Il banco ne disegna un mockup minimalista con le classi e
       i colori veri — non l'elemento vero, che nel banco non esiste, ma la sua
       sagoma alla taglia giusta. */
    var FORME = ['interruttore', 'segmento', 'bottone', 'campo', 'area', 'pannello', 'esito'];
    function formaDi(v) {
        var b = (v && v.base) || v || {};
        if (b.forma) return b.forma;
        if (b.tipo === 'spunta') return 'interruttore';
        if (b.tipo === 'tendina' || b.tipo === 'numero' || b.tipo === 'preset') return 'campo';
        if (b.tipo === 'radio') return 'segmento';
        if (b.tipo === 'azione') return 'bottone';
        if (b.tipo === 'esito') return 'esito';
        return 'bottone';
    }

    function riga(id) {
        for (var i = 0; i < RIGHE.length; i++) if (RIGHE[i].id === id) return RIGHE[i];
        return null;
    }

    /* Una riga è valida se i due span chiudono le colonne: se non le chiudono
       resta una colonna di bianco a destra, che è esattamente il difetto da cui
       questo dato è nato. */
    function validaRighe(righe) {
        var errori = [];
        (righe || RIGHE).forEach(function (r) {
            var s = (r.span && r.span[0]) || 0, d = (r.span && r.span[1]) || 0;
            if (s < 1 || d < 1) { errori.push('la riga «' + r.id + '» ha uno span a zero'); return; }
            if (s + d !== COLONNE) {
                errori.push('la riga «' + r.id + '» occupa ' + (s + d) + ' colonne su ' + COLONNE +
                    ': resterebbe del bianco a destra');
            }
        });
        return errori;
    }

    /* Composizione di Giacomo (4/8): riquadri CHIARI (#f7f7f7 con testo #404040,
       9,68:1), la classe destinataria e «Adatta alla classe» fuori — la taratura
       della classe attiva si applica lo stesso, dalla spunta nascosta. Le voci possono essere oggetti {id, et, w} per riscrivere
       l'etichetta o fissare la larghezza di un campo; `stile` e `altezza`
       governano l'aspetto del riquadro. */
    var CHIARO = { bg: '#f1f4f8', testo: '#404040', bordoCol: '#f1f4f8' };

    /* ── I box NASCONDIBILI: li dichiara il loro FONDO ────────────────────────
       Composizione di Giacomo (5/8): i moduli col fondo scuro del progetto
       (`STILE_BASE.bg`, #404040) sono quelli che compaiono **solo nella vista
       estesa** — la combo SHIFT+CTRL+L,K,J,H li rivela sotto il mega-bento.
       Il marcatore è il fondo e non un flag nuovo, e la ragione è che così la
       distinzione si VEDE nell'officina mentre si compone: un riquadro scuro in
       mezzo a quelli chiari è già la sua etichetta. Chi vuole rendere stabile un
       box gli dà un fondo chiaro; chi vuole nasconderlo lo lascia scuro. */
    function nascondibile(m) {
        /* ⚠️ Un modulo NUDO non ha un fondo da leggere — il fondo è del pezzo che
           accoglie — quindi non può essere marcato «scuro». Senza questa riga i
           quattro moduli della prima sezione, che nessuno stile ce l'hanno,
           prenderebbero il fondo di base (#404040) e sparirebbero dalla vista
           compatta: cioè la schermata d'ingresso resterebbe senza il bottone che
           carica il PDF. */
        if (m && (m.nuda || soloAzioni(m))) return false;
        return stileDi(m).bg.toLowerCase() === STILE_BASE.bg.toLowerCase();
    }

    var MODULI = [
        /* ══ LA PRIMA SEZIONE — anche lei è composizione (5/8) ══════════════════
           Erano due righe impaginate a parte (`RIGHE`), quindi invisibili
           all'officina: il banco mostrava una schermata e l'app un'altra.
           Sono moduli **nudi**: nessun riquadro attorno: il fondo, il raggio e
           l'altezza modulare ce li ha già il pezzo che accolgono. Gli span
           riprendono quelli delle righe storiche (2+2 e 1+3), così l'impaginazione
           a schermo non cambia di un pixel — cambia dove è scritta.
           ⚠️ Niente `altezza` dichiarata: il pezzo dentro è già alto un modulo
           (`--mn-h-modulo`, 145px). Dichiararla qui vorrebbe dire due numeri per la
           stessa misura, e al primo ritocco del token uno dei due resta indietro. */
        { id: 'upload', titolo: '', icona: '', span: 1, nuda: true, voci: ['mn-upload'] },
        { id: 'elenco', titolo: '', icona: '', span: 3, nuda: true, voci: ['mn-elenco'] },
        { id: 'genere', titolo: '', icona: '', span: 1, nuda: true, voci: ['mn-genere'] },
        { id: 'genere-opz', titolo: '', icona: '', span: 3, nuda: true, voci: ['mn-genere-opz'] },

        /* ══ IL MEGA-BENTO — sempre a schermo, anche in vista compatta ══════════
           Composizione di Giacomo (5/8). Le prime due righe sono la vista compatta
           e NON cambiano quando si apre quella estesa: è la condizione perché la
           combo non spacchi il layout. */
        /* Il box GIALLO è il contesto: in COSTRUISCI è l'unico posto dove si
           dichiara, perché il chip dell'header lì è nascosto.
           ⚠️ La voce è `mp-chi`, NON `mp-class`: «Chi» elenca classi **e allievi**,
           e con un allievo la mappa va nella sua cartella. `mp-class` è solo le
           classi — ed è il campo che il modulo monta NASCOSTO perché la pipeline lo
           legge. Montarlo a vista avrebbe tolto gli allievi dal selettore. */
        { id: 'ctx', titolo: '', icona: 'graduation-cap', span: 1, altezza: 150,
          stile: { bg: '#fff700', testo: '#404040', bordoCol: '#fff700' },
          voci: [{ id: 'mp-chi', et: 'Chi:', w: 150 }, { id: 'mp-disc', w: 150 }],
          /* i due campi partono dallo stesso bordo: 45px bastano a «Chi:» e «Cosa:» */
          layout: { etLarghezza: 45 } },
        /* ⚠️ Sul verde il testo è NERO (#404040), non bianco: bianco su #41e6aa fa
           1,6:1 — la scritta sparisce, e questa è l'azione principale della pagina.
           È la terza volta che il JSON rimandato dall'officina riporta `#ffffff`. */
        { id: 'azioni', titolo: '', icona: 'package', span: 3, nuda: true,
          stile: { bg: '#41e6aa', testo: '#404040' }, voci: ['mn-genera'] },

        /* ══ I BOX NASCONDIBILI — solo nella vista estesa (combo) ═══════════════
           Fondo scuro = nascondibile: lo dice `nascondibile()`, non un flag. Stanno
           SOTTO il mega-bento, e il box che può crescere (le fonti caricate) sta
           nell'ultima riga: incollare un testo lungo non deve spostare niente di
           quello che sta sopra. */
        /* ⚠️ Tutti e quattro dichiarano `altezza: 130`, cioè la stessa del box GIALLO
           (5/8, richiesta di Giacomo: «i box neri alti come il giallo»). 130
           dichiarati = **145 reali**, che è il valore del token `--mn-h-modulo`: il
           resto è il padding del riquadro.
           Perché dichiararla invece di lasciarla al contenuto: senza, ogni box
           prendeva l'altezza di quello che ci si mette dentro — Modalità 75, FOCUS
           150 — e un ritocco alle voci cambiava le altezze da sé. Dichiarata, la
           riga è un modulo e le voci in più scorrono. */
        /* ⚠️ «Adatta al livello» (`mn-livello`) sta qui e non in FOCUS: decide COME
           l'AI scrive, come le altre tre leve di questo riquadro; in FOCUS avrebbe
           parlato di che cosa estrarre. Spostata da Giacomo (5/8). */
        /* ⚠️ Le voci stanno IN COLONNA: la riga è «etichetta a sinistra · comando a
           destra», come nell'anteprima dell'officina. Affiancate, i controlli veri
           (che arrivano con la loro taglia) sfondavano il riquadro.
           ⚠️ `titoloPosto: 'mai'` dove l'elemento PORTA GIÀ il suo nome
           («Generazione Multi-Pass», «KG (A/B)»): due nomi per la stessa cosa sono
           peggio di uno, e quello del markup è anche ciò che si ritrova fuori dal
           bento. Il titolo resta dove il pezzo mostra un VALORE e non un nome. */
        /* ⚠️ Stanno QUI, in coda, e non dove erano: gli extra devono venire
           TUTTI dopo il mega-bento stabile. Un box nascosto in mezzo spezza la
           griglia nel momento in cui la combo lo rivela — il test
           «i box extra stanno DOPO il mega-bento» esiste per questo, e l'ha
           colto appena li ho resi nascondibili senza spostarli. */
        /* ══ I QUATTRO BOX DELLE OPZIONI STANNO NELLA VISTA ESTESA (11/8) ══════
           Decisione di Giacomo: «meno box, meno attrito». Preset · Quiz · Fogli
           nodi · Fonte & Sintesi non sono più nella schermata d'ingresso: si
           rivelano con la combo SHIFT+CTRL+L,K,J,H, come gli altri strumenti.
           ⚠️ Il marcatore è il FONDO SCURO, non un flag: `nascondibile()` legge
           lo stile, e un riquadro scuro in mezzo a quelli chiari è già la sua
           etichetta nell'officina. Togliere `stile: CHIARO` è quindi il gesto
           che li sposta — non c'è una seconda lista da tenere allineata.
           ⚠️ RESTANO MONTATI nel DOM (solo nascosti): `_readConfig()` legge i
           loro campi, ed è ciò che permette al preset «Default» di governare la
           generazione senza che nessuno apra la vista estesa. Se un giorno li si
           smontasse davvero, la configurazione tornerebbe ai default del markup
           e le domande aperte sparirebbero in silenzio. */
        { id: 'output', titolo: 'Output automatici', icona: 'package-check', span: 4, altezza: 130,
          layout: { colonneVoci: 3 },
          voci: ['mp-qt-mc', 'mp-qt-fc', 'mp-qt-open',
              { id: 'mp-syn-on', et: 'Sintesi' }, { id: 'mp-syn-audio', et: 'Voce naturale' }] },
        { id: 'preset', titolo: 'Preset', icona: 'bookmark', span: 1, altezza: 130,
          voci: [{ id: 'mp-preset', w: 190 }] },
        /* ══ OUTPUT AUTOMATICI (20/8, richiesta di Giacomo) ═════════════════════
           Le spunte di CHE COSA la generazione produce, raccolte in un box a
           tutta riga: erano sparse fra «Quiz» e «Fonte & Sintesi», e per un
           DOSSIER da immagine sono l'unica cosa da decidere.
           ⚠️ SPOSTATE, non duplicate (inv. 6): gli id restano quelli che
           `_readConfig()` legge. Il master `mp-quiz-on` NON si monta: è un
           master DERIVATO (spuntare «Flashcard» lo accende da sé, e il
           renderer lo tiene nascosto nel DOM per `_readConfig`).
           ⚠️ La voce naturale resta SPENTA di default (`synthesis.audio:
           false` nella pipeline): l'opzione vive anche nell'editor della
           sintesi di ELABORA (bottone «Voce», 17/8). */
        { id: 'quiz', titolo: 'Quiz', icona: 'activity', span: 1,
          voci: [{ id: 'mp-perbranch', w: 70, et: 'Domande a ramo' }] },
        { id: 'ns', titolo: 'Fogli nodi', icona: 'layout-grid', span: 1,
          voci: ['mp-ns-card', 'mp-ns-keywords', 'mp-ns-summary',
              { id: 'mp-ns-level', w: 140 }, { id: 'mp-ns-fmt', w: 130 }] },
        { id: 'src', titolo: 'Fonte & Sintesi', icona: 'paperclip', span: 1,
          voci: [{ id: 'mp-src-pdf', et: 'Allega PDF' }, { id: 'mp-ns-causal', et: 'Catena perché' }] },
        /* Riga sua, a tutta larghezza: la scelta moltiplica il costo di ciò che
           sta nel box «Quiz» sopra, quindi le sta sotto e non dentro — dentro
           sarebbe una spunta come le altre, e non lo è (sette generazioni). */
        { id: 'multi', titolo: 'Più set per angolo', icona: 'layers', span: 4, altezza: 130,
          layout: { colonneVoci: 3 },
          voci: ['mp-ang-definizione', 'mp-ang-causa', 'mp-ang-conseguenza', 'mp-ang-esempio',
              'mp-ang-confronto', 'mp-ang-eccezione', 'mp-ang-applicazione'] },
        { id: 'modalita', titolo: 'Modalità', icona: 'book-open', span: 1, altezza: 260,
          bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#404040' },
          layout: { colonneVoci: 'colonna' },
          /* ⚠️ Quattro voci su cinque hanno `titoloPosto: 'mai'`: il nome lo porta il
             pezzo montato («MindMap», «Generazione Multi-Pass», «Profondità di
             generazione», «KG (A/B)»). Le `et` di quelle voci restano solo per
             l'inventario dell'officina — a schermo non compaiono.
             Il titolo resta su «Adatta linguaggio», il cui pezzo mostra un chip e
             nient'altro. */
          voci: [{ id: 'mn-mmlogic', et: '(Normale · Adattiva)', titoloPosto: 'mai' },
              /* ⚠️ Qui il titolo lo scrive il POSTO: il nome del markup
                 («Generazione Multi-Pass») in un box a una colonna non ci sta e
                 usciva troncato — «Generazione M…», che non è un nome. Misurato:
                 124px disponibili contro i 146 che chiede. */
              { id: 'mn-multipass', et: 'Multi-pass', titoloPosto: 'sempre' },
              { id: 'mn-autodepth', et: 'Profondità automatica', titoloPosto: 'mai' },
              /* ⚠️ Il menu del livello è una voce a SÉ, subito dopo il toggle: una
                 riga sua, e si attiva solo con «manuale» (5/8, richiesta di Giacomo).
                 Montandolo qui `spostaStrumenti` lo tira fuori da `#row-gen-depth`,
                 dove il markup lo teneva accanto al toggle — senza toccare quel markup. */
              /* «Livello» e non «Livello massimo»: accanto al menu, in una riga da
                 259px, la parola in più si troncava e il senso lo dà comunque il
                 menu («L3 — consigliato»). */
              { id: 'mn-gendepth', et: 'Livello', titoloPosto: 'sempre' },
              { id: 'mn-livello', mostraEt: true, et: 'Adatta linguaggio' },
              { id: 'mn-pipeline', et: 'Pipeline', titoloPosto: 'mai' }] },
        /* FOCUS: nessun titolo del posto — i quattro pezzi (macro-aree, campo del
           focus, lenti, disciplina) portano il proprio, o il segnaposto che vale
           da nome. */
        { id: 'focus', titolo: 'FOCUS', icona: 'settings', span: 3, altezza: 260,
          bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#404040' },
          layout: { colonneVoci: 'colonna' },
          voci: [{ id: 'mn-focus', titoloPosto: 'mai' },
              { id: 'mn-lenti', et: 'Lenti', titoloPosto: 'mai' },
              { id: 'mn-disciplina', titoloPosto: 'mai' }] },
        /* Le MACRO-AREE hanno un box loro, largo tutta la riga: il pannello porta
           l'elenco da scrivere a mano E il toggle «Genera Macro-Aree in automatico»,
           che è la decisione da cui dipende tutto il resto del riquadro. */
        { id: 'macroaree', titolo: 'Macro-aree', icona: '', span: 4, altezza: 250,
          layout: { colonneVoci: 1, colMin: 240 },
          voci: [{ id: 'mn-l1', titoloPosto: 'mai', et: 'Manuali' }] },
        { id: 'input', titolo: 'INPUT', icona: 'sparkles', span: 1, altezza: 200,
          stile: { testo: '#ffffff' },
          bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#404040' },
          voci: [{ id: 'mn-src-url', et: 'URL' }, { id: 'mn-src-youtube', et: 'YouTube' },
              { id: 'mn-src-audio', et: 'Audio' }, 'mn-src-text'] },
        /* l'elenco delle fonti non-PDF: righe compatte, la stessa veste dell'elenco
           dei documenti. Una colonna, perché sono righe di un elenco e non voci
           affiancabili. */
        { id: 'input-box', titolo: '', icona: '', span: 3, altezza: 200,
          bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#404040' },
          layout: { colonneVoci: 1 },
          voci: ['mn-input-box'] },
        /* Il TESTO LIBERO ha il suo box, largo tutta la riga: è l'unico posto della
           pagina dove si SCRIVE, e un campo di scrittura stretto in un elenco non
           serve a niente. Cresce fino a 30 righe e poi scorre — per questo sta in
           fondo alla composizione (c'è il test che lo pianta).
           ⚠️ Il titolo lo porta il POSTO (`mostraEt`), non il modulo: uno solo dei
           due, e quello del posto dice il nome della funzione montata. */
        { id: 'testo', titolo: '', icona: 'file-text', span: 4, altezza: 200,
          voci: [{ id: 'mn-testo', mostraEt: true }] }
    ];



    /* icone Lucide proposte nel banco: quelle che l'app usa già per questi
       domini. Il campo resta libero — è un elenco di scorciatoie, non un vincolo. */
    var ICONE = ['bookmark', 'help-circle', 'layout-grid', 'file-text', 'paperclip', 'activity',
        'graduation-cap', 'package', 'git-merge', 'sliders-horizontal', 'settings', 'sparkles',
        'book-open', 'printer', 'users', 'folder', 'square'];

    function voce(id) {
        for (var i = 0; i < VOCI.length; i++) if (VOCI[i].id === id) return VOCI[i];
        return null;
    }

    /* le voci di un modulo, sempre nella stessa forma: {id, et, w, base} */
    /* ⚠️ Si copiano TUTTI i campi scritti sulla voce, non solo `et` e `w`.
       Quando le leve per-voce erano due li si elencava a mano; alla terza (il
       pop-up, il titolo del posto) l'elenco è diventato una lista da tenere
       allineata — e infatti si è rotta in silenzio: la scelta finiva nel dato,
       l'officina la rileggeva dal file salvato e chi DISEGNA non la vedeva mai.
       Copiando tutto, una leva nuova funziona senza toccare questa funzione. */
    function vociDi(m) {
        return ((m && m.voci) || []).map(function (v) {
            var oggetto = (typeof v === 'object' && v) ? v : null;
            var id = oggetto ? oggetto.id : v;
            var base = voce(id) || { id: id, et: id, tipo: '?' };
            var out = {};
            if (oggetto) for (var k in oggetto) if (Object.prototype.hasOwnProperty.call(oggetto, k)) out[k] = oggetto[k];
            out.id = id;
            out.et = (oggetto && oggetto.et) || base.et;
            out.w = (oggetto && oggetto.w) || null;
            out.base = base;
            return out;
        });
    }

    /* Un modulo che contiene SOLO azioni non è un contenitore: È il bottone.
       Prima lo diceva il flag `nuda`, scritto a mano — e un modulo creato
       nell'officina non ce l'aveva, quindi l'azione finiva dentro una card e
       il suo testo non compariva affatto (il renderer non sapeva disegnare
       un'azione dentro un modulo normale). Ora si deduce dal contenuto. */
    function soloAzioni(m) {
        var v = vociDi(m);
        return v.length > 0 && v.every(function (x) { return x.base && x.base.tipo === 'azione'; });
    }

    function stileDi(m) {
        var s = (m && m.stile) || {};
        return {
            bg: s.bg || STILE_BASE.bg,
            testo: s.testo || STILE_BASE.testo,
            bordoPx: s.bordoPx == null ? STILE_BASE.bordoPx : s.bordoPx,
            bordoCol: s.bordoCol || STILE_BASE.bordoCol
        };
    }

    /* Come stanno le voci DENTRO il riquadro. I valori non scelti restano quelli
       di `LAYOUT_BASE`, e `presentazione()` non li emette: chi non tocca la leva
       vede esattamente quello che vedeva prima. */
    /* ── Il TITOLO di un posto, in tre stati ──────────────────────────────────
       Erano due flag opposti (`mostraEt` e `nascondiEt`) nati a due giorni di
       distanza, e due booleani contrari sono uno stato che si può scrivere in modo
       contraddittorio. Una leva sola, con tre valori:
         auto   — si vede finché il posto è vuoto (il pezzo montato porta il suo nome)
         sempre — resta anche a posto pieno: serve dove il pezzo mostra un VALORE
                  («ON», «A») e non il proprio nome
         mai    — non si emette affatto. Non «nascosto dal foglio»: non c'è, e quindi
                  non può ricomparire per una regola più forte.
       I due flag restano leggibili per non invalidare le composizioni già salvate. */
    /* ⚠️ L'ordine è: TUTTO quello che dice la VOCE, poi quello che dice
       l'inventario. Prima si guardavano i campi per tipo (`titoloPosto` di
       entrambi, poi `nascondiEt` di entrambi…) e una scelta fatta componendo
       perdeva contro il default della voce: `mostraEt: true` sul box del testo
       restituiva «mai», perché la voce d'inventario dichiara `nascondiEt`. Chi
       compone deve poter rovesciare il default — è il senso del banco. */
    function titoloPosto(v) {
        var b = (v && v.base) || {};
        var scelto = function (o) {
            if (!o) return '';
            if (o.titoloPosto) return o.titoloPosto;
            if (o.nascondiEt) return 'mai';
            if (o.mostraEt) return 'sempre';
            return '';
        };
        return scelto(v) || scelto(b) || 'auto';
    }

    function layoutDi(m) {
        var l = (m && m.layout) || {};
        var n = parseInt(l.colonneVoci, 10);
        return {
            etichette: l.etichette === 'sopra' ? 'sopra' : LAYOUT_BASE.etichette,
            etLarghezza: parseInt(l.etLarghezza, 10) > 0 ? parseInt(l.etLarghezza, 10) : 0,
            colonneVoci: l.colonneVoci === 'colonna' ? 'colonna'
                : (n >= 1 && n <= 6 ? n : LAYOUT_BASE.colonneVoci),
            colMin: parseInt(l.colMin, 10) > 0 ? parseInt(l.colMin, 10) : LAYOUT_BASE.colMin
        };
    }

    /* I colori dei bottoni DENTRO un modulo, risolti: i campi non scelti tornano
       il valore che il foglio produce già oggi, così il banco può calcolarne il
       contrasto anche quando nessuno ha scelto niente — che è il caso in cui il
       difetto è passato inosservato (bottoni a 1:1 sui box scuri). */
    function bottoniDi(m) {
        var st = stileDi(m), b = (m && m.bottoni) || {};
        return {
            bg: b.bg || componi(st.bg, st.testo, BOTTONI_DERIVA.mix) || st.bg,
            testo: b.testo || st.testo,
            hoverBg: b.hoverBg || BOTTONI_DERIVA.hoverBg,
            hoverTesto: b.hoverTesto || BOTTONI_DERIVA.hoverTesto,
            scelti: {
                bg: !!b.bg, testo: !!b.testo, hoverBg: !!b.hoverBg, hoverTesto: !!b.hoverTesto
            }
        };
    }
    function haBottoniScelti(m) {
        var s = bottoniDi(m).scelti;
        return !!(s.bg || s.testo || s.hoverBg || s.hoverTesto);
    }

    /* Quanto è larga UNA colonna di voci dentro il modulo. Serve al validatore per
       dire che «5 colonne in un riquadro da 1» non è una disposizione: è un muro
       di etichette tagliate. */
    function largezzaModulo(m) {
        var s = Math.max(1, Math.min(COLONNE, (m && m.span) || 1));
        return s * GEOM.colonna + (s - 1) * GEOM.gap;
    }
    function largezzaVoce(m) {
        var L = layoutDi(m);
        var utile = largezzaModulo(m) - GEOM.padding;
        var n = typeof L.colonneVoci === 'number' ? L.colonneVoci
            : (L.colonneVoci === 'colonna' ? 1 : Math.max(1, Math.floor((utile + GEOM.gapVoci) / (L.colMin + GEOM.gapVoci))));
        return Math.round((utile - (n - 1) * GEOM.gapVoci) / n);
    }

    /* ── Che cosa il renderer deve scrivere sul riquadro ──────────────────────
       Sta QUI e non nei due renderer (app e anteprima dell'officina) perché è la
       stessa domanda: «questo modulo che aspetto ha». Due copie divergerebbero
       alla prima leva aggiunta — è già successo con lo stile inline.
       ⚠️ Si emette SOLO ciò che è stato scelto: quello che manca resta al
       fallback dichiarato nel foglio, quindi la resa di chi non tocca niente non
       cambia di un pixel. */
    function presentazione(m) {
        var L = layoutDi(m), b = (m && m.bottoni) || {};
        var vars = '', attr = '';
        if (b.bg) vars += '--mn-btn-bg:' + b.bg + ';';
        if (b.testo) vars += '--mn-btn-txt:' + b.testo + ';';
        if (b.hoverBg) vars += '--mn-btn-hover:' + b.hoverBg + ';';
        if (b.hoverTesto) vars += '--mn-btn-hover-txt:' + b.hoverTesto + ';';
        if (haBottoniScelti(m)) attr += ' data-btn="1"';

        if (L.etichette === 'sopra') attr += ' data-et="sopra"';
        if (L.etLarghezza) { vars += '--mn-et-w:' + L.etLarghezza + 'px;'; attr += ' data-et-w="1"'; }
        if (L.colMin !== LAYOUT_BASE.colMin) vars += '--mn-col-min:' + L.colMin + 'px;';
        if (L.colonneVoci === 'colonna') attr += ' data-voci="colonna"';
        else if (typeof L.colonneVoci === 'number') {
            vars += '--mn-col-n:' + L.colonneVoci + ';';
            attr += ' data-voci-n="' + L.colonneVoci + '"';
        }
        return { vars: vars, attr: attr };
    }

    /* ── contrasto WCAG: serve al banco per dire subito che una coppia scelta a
          mano non si legge. Stessa formula usata ovunque nel progetto. ────── */
    function _rgb(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null;
        var n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function _lum(hex) {
        var r = _rgb(hex);
        if (!r) return null;
        var c = r.map(function (v) {
            v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    /* Il colore che si VEDE quando una tinta translucida sta sopra un fondo.
       Serve perché i bottoni dentro un modulo non hanno un fondo proprio: il
       foglio ne mette uno al 14% del colore del testo, quindi il contrasto vero
       non è «testo su fondo del modulo» ma «testo sul composito». Senza questo,
       il banco mostrerebbe un numero che nessuno vede a schermo.
       Verificato: bianco al 14% su #404040 dà #5b5b5b, che è il fondo misurato. */
    function componi(fondo, tinta, pct) {
        var a = _rgb(fondo), b = _rgb(tinta);
        if (!a || !b) return null;
        var p = Math.max(0, Math.min(100, pct)) / 100;
        return '#' + a.map(function (v, i) {
            var n = Math.round(v * (1 - p) + b[i] * p);
            return ('0' + n.toString(16)).slice(-2);
        }).join('');
    }
    function contrasto(a, b) {
        var la = _lum(a), lb = _lum(b);
        if (la == null || lb == null) return null;
        var hi = Math.max(la, lb), lo = Math.min(la, lb);
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    }

    /* I master che si accendono DA SOLI, perché almeno uno dei figli da cui
       dipendono è a schermo. Il renderer li monta nascosti e li tiene allineati;
       il validatore non li conta fra le voci «rimaste fuori». Sta qui e non nel
       renderer perché è la stessa domanda a cui risponde `valida`: chi accende
       cosa. Due liste separate divergerebbero al primo master aggiunto. */
    function mastersDerivati(moduli) {
        var montate = {};
        (moduli || []).forEach(function (m) {
            vociDi(m).forEach(function (v) { montate[v.id] = true; });
            if (m.master) montate[m.master] = true;
        });
        return VOCI.filter(function (v) {
            if (!v.derivato || montate[v.id]) return false;
            return v.derivato.some(function (id) { return montate[id]; });
        }).map(function (v) { return { id: v.id, da: v.derivato.filter(function (x) { return montate[x]; }) }; });
    }

    /* ── Il GATE del bottone «Genera materiali» ───────────────────────────────
       Regola pura, tenuta qui e non nel renderer perché è la definizione di
       «destinatario completo» — la stessa che decide dove finisce il vault:
         classe + materia  → Mappe/<classe>/<materia>/…
         allievo           → Allievi/<nome>/Mappe/…   (nessun livello materia:
                             con un allievo la materia non ha niente da decidere)
       `materieDisponibili = 0` significa che l'app non ha materie da proporre
       (profilo insegnante vuoto): bloccare su un dato che non si può fornire
       sarebbe un vicolo cieco, quindi la materia non è più richiesta.

       Perché un gate e non un avviso al clic: la generazione partiva su un
       contesto incompleto e si fermava a metà, dietro un velo, senza dire dove
       (4/8, un'ora di lavoro persa). Un bottone che non si può premere è
       un'informazione; uno che si preme e non fa niente è un guasto. */
    function gate(st) {
        st = st || {};
        var chi = String(st.chi || '');
        if (!chi) return { ok: false, manca: 'chi' };
        if (chi.indexOf('s:') === 0) return { ok: true, manca: '' };   /* allievo */
        if (!st.materieDisponibili) return { ok: true, manca: '' };
        return String(st.materia || '') ? { ok: true, manca: '' } : { ok: false, manca: 'cosa' };
    }

    function valida(moduli) {
        var errori = [], avvisi = [];
        moduli = moduli || [];
        var usate = {}, doppie = [];
        moduli.forEach(function (m) {
            vociDi(m).forEach(function (v) {
                if (usate[v.id]) doppie.push(v.id);
                usate[v.id] = true;
            });
            if (m.master) usate[m.master] = true;
        });
        /* un master derivato è montato (nascosto) dal renderer: non è una voce
           dimenticata, e dirlo lo farebbe cercare nel banco a vuoto */
        mastersDerivati(moduli).forEach(function (d) { usate[d.id] = true; });
        doppie.forEach(function (id) {
            errori.push('la voce «' + ((voce(id) || {}).et || id) + '» sta in due moduli: il campo verrebbe scritto due volte, e la pipeline ne leggerebbe uno solo');
        });

        var fuori = VOCI.filter(function (v) { return !usate[v.id]; });
        fuori.forEach(function (v) {
            avvisi.push('«' + v.et + '» non è montata → ' + (v.seFuori || 'la pipeline userà il suo default'));
        });

        var riga = 0, righe = [[]];
        moduli.forEach(function (m) {
            var s = Math.max(1, Math.min(COLONNE, m.span || 1));
            var occupato = righe[riga].reduce(function (a, x) { return a + x.span; }, 0);
            if (occupato + s > COLONNE) { righe.push([]); riga++; }
            righe[riga].push({ id: m.id, span: s });
        });
        righe.forEach(function (r, i) {
            var occ = r.reduce(function (a, x) { return a + x.span; }, 0);
            if (occ < COLONNE && i < righe.length - 1) {
                avvisi.push('la riga ' + (i + 1) + ' lascia ' + (COLONNE - occ) + ' colonne vuote: il modulo dopo scende, e uno resta spaiato');
            }
        });
        var ultima = righe[righe.length - 1];
        var occUlt = ultima.reduce(function (a, x) { return a + x.span; }, 0);
        if (ultima.length === 1 && occUlt < COLONNE) {
            avvisi.push('l\'ultimo modulo è solo su una riga e non la riempie: da solo in fondo si legge come dimenticato');
        }

        moduli.forEach(function (m) {
            vociDi(m).forEach(function (v) {
                if (!voce(v.id)) { errori.push('voce sconosciuta: ' + v.id); return; }
                var padreDentro = m.master === v.base.figlioDi ||
                    vociDi(m).some(function (x) { return x.id === v.base.figlioDi; });
                /* se il padre è un master DERIVATO non c'è niente da spegnere:
                   si accende proprio perché questo figlio è a schermo */
                var padreVoce = v.base.figlioDi ? voce(v.base.figlioDi) : null;
                if (padreVoce && padreVoce.derivato) padreDentro = true;
                if (v.base.figlioDi && !padreDentro) {
                    var padre = voce(v.base.figlioDi);
                    avvisi.push('«' + v.et + '» dipende da «' + (padre ? padre.et : v.base.figlioDi) +
                        '», che governa un altro modulo: spegnendo quello, questa resta a schermo senza avere effetto');
                }
            });
            /* l'aspetto scelto a mano può rendere un modulo illeggibile: il banco
               lo dice PRIMA, non dopo averlo guardato di sfuggita */
            var st = stileDi(m);
            var k = contrasto(st.bg, st.testo);
            var nome = m.titolo || m.id;
            if (k != null && k < 4.5) {
                avvisi.push('nel modulo «' + nome + '» il testo sul fondo fa ' +
                    String(k).replace('.', ',') + ':1 — sotto il minimo di 4,5:1, non si legge');
            }
            /* ── i BOTTONI dentro il modulo ───────────────────────────────────
               Il difetto che ha fatto nascere questa leva: sui box scuri i
               bottoni avevano il colore del fondo (1:1) e si vedevano solo al
               passaggio. Il contrasto si misura sul fondo COMPOSITO, che è quello
               che si vede — non sul fondo del riquadro. */
            var bt = bottoniDi(m);
            var kb = contrasto(bt.bg, bt.testo);
            if (kb != null && kb < 4.5) {
                avvisi.push('nel modulo «' + nome + '» i bottoni interni fanno ' +
                    String(kb).replace('.', ',') + ':1 sul loro fondo (' + bt.bg + '): a riposo non si leggono');
            }
            var kh = contrasto(bt.hoverBg, bt.hoverTesto);
            if (kh != null && kh < 4.5) {
                avvisi.push('nel modulo «' + nome + '» i bottoni al passaggio fanno ' +
                    String(kh).replace('.', ',') + ':1 — l\'hover non deve spostare il difetto, deve risolverlo');
            }
            /* ── la disposizione delle voci ───────────────────────────────────
               Una colonna sotto i 120px taglia le etichette: la disposizione va
               scelta guardando quanto spazio c'è, non quante voci ci sono. */
            var L = layoutDi(m);
            var larg = largezzaVoce(m);
            if (larg < GEOM.minLeggibile) {
                avvisi.push('nel modulo «' + nome + '» ogni voce avrebbe ' + larg +
                    'px: sotto i ' + GEOM.minLeggibile + 'px le etichette si tagliano — meno colonne, o un riquadro più largo');
            }
            if (L.etLarghezza && L.etichette === 'sopra') {
                avvisi.push('nel modulo «' + nome + '» la colonna delle etichette (' + L.etLarghezza +
                    'px) non ha effetto: con le etichette SOPRA il campo non c\'è una colonna da allineare');
            }
            if (L.colMin !== LAYOUT_BASE.colMin && typeof L.colonneVoci === 'number') {
                avvisi.push('nel modulo «' + nome + '» il minimo di colonna (' + L.colMin +
                    'px) non ha effetto: le colonne sono fissate a ' + L.colonneVoci);
            }
        });

        return { errori: errori, avvisi: avvisi, righe: righe, fuori: fuori.map(function (v) { return v.id; }) };
    }

    function forma(moduli) {
        var v = valida(moduli);
        return { righe: v.righe.length, colonne: COLONNE, moduli: (moduli || []).length };
    }

    return {
        SCALA: SCALA, VOCI: VOCI, MODULI: MODULI, COLONNE: COLONNE, ICONE: ICONE, STILE_BASE: STILE_BASE,
        voce: voce, vociDi: vociDi, soloAzioni: soloAzioni, stileDi: stileDi, contrasto: contrasto,
        valida: valida, forma: forma, mastersDerivati: mastersDerivati, gate: gate,
        RIGHE: RIGHE, riga: riga, validaRighe: validaRighe, nascondibile: nascondibile,
        firma: firma, FORME: FORME, formaDi: formaDi,
        /* i controlli granulari (5/8): layout delle voci e colori dei bottoni interni */
        LAYOUT_BASE: LAYOUT_BASE, BOTTONI_BASE: BOTTONI_BASE, BOTTONI_DERIVA: BOTTONI_DERIVA, GEOM: GEOM,
        layoutDi: layoutDi, bottoniDi: bottoniDi, haBottoniScelti: haBottoniScelti, titoloPosto: titoloPosto,
        componi: componi, largezzaVoce: largezzaVoce, largezzaModulo: largezzaModulo,
        presentazione: presentazione
    };
}));
