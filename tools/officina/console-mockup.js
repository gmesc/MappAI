#!/usr/bin/env node
/* MOCKUP DELLA CONSOLE — le tre proposte, guardabili e misurate
 *
 *   node tools/officina/console-mockup.js   →   public/dev/console-mockup.html
 *
 * Serve a scegliere COME raccogliere in una finestra sola le famiglie di
 * modali che oggi sono sparse (classi/allievi, documenti, AI/consumi).
 * Riferimento: la schermata DATABOT passata da Giacomo il 30/7.
 *
 * Regole del mockup (skill mockup-layout):
 *   1. generato dal CODICE VERO — ogni pannello è un iframe che carica
 *      `mappai-modal-tokens.css` + `mappai-modal-core.js` + `mappai-modal.js`
 *      e chiama `MappAIModal.render(schema)`. Se il motore cambia, cambia il
 *      mockup: non può mostrare una forma che l'app non produrrebbe.
 *   2. si misura, non si guarda a occhio — le misure sono lette dentro gli
 *      iframe dopo `document.fonts.ready` e scritte nella didascalia.
 *   3. contenuti del caso peggiore — nomi lunghissimi, accenti, apostrofi,
 *      celle vuote, e gli STESSI contenuti in tutte le varianti.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public/dev/console-mockup.html');

const v = ['public/css/mappai-modal-tokens.css', 'public/js/mappai-modal-core.js', 'public/js/mappai-modal.js']
    .map(f => { try { return Math.round(fs.statSync(path.join(ROOT, f)).mtimeMs); } catch (e) { return 0; } }).join('-');

/* ══════════════════════════════════════════════════════════════════════════
   CONTENUTI — il caso peggiore, identico in tutte le varianti.
   Non contenuti gentili: il nome di mappa più lungo che esiste davvero, una
   classe con l'ordinale femminile e l'apostrofo, una cella vuota, un numero.
   ══════════════════════════════════════════════════════════════════════════ */
/* LE MATERIE HANNO UNA FONTE SOLA: l'elenco che il docente scrive nel suo
   profilo (Cabina E1). Qui sotto è quella fonte; la tabella delle classi e il
   campo del profilo leggono la stessa costante, così non possono divergere —
   se in tabella comparisse «Scienze» e nel profilo «Scienze naturali»,
   sarebbero due nomi per la stessa materia. */
const MATERIE_PROFILO = ['Storia', 'Educazione all’immagine', 'Geografia', 'Scienze naturali', 'Italiano'];
const M = n => MATERIE_PROFILO[n];

/* Le materie sono SCELTE cliccabili, non testo (richiesta di Giacomo, 31/7):
   un clic attiva subito quella coppia classe+materia e la porta nel chip di
   contesto — il percorso più corto fra «vedo» e «lavoro su».
   La colonna CLASSE porta il solo nome (niente descrizione del profilo) e un
   BOLLINO verde quando la classe ha la taratura AI: lo stato si vede senza
   allungare il nome. */
const RIGHE_CLASSI = [
    [{ testo: '1ª A', bollino: 'ok', titolo: 'Taratura AI attiva' }, { scelte: [M(0), M(1)], azione: 'attiva' }, '19', 'Media Bellinzona 2', '24/07/2026', '3 attività'],
    [{ testo: '1B', bollino: 'spento', titolo: 'Nessuna taratura AI' }, { scelte: [M(3)], azione: 'attiva' }, '21', 'Media Bellinzona 2', '21/07/2026', '—'],
    [{ testo: '2A', bollino: 'ok', titolo: 'Taratura AI attiva' }, { scelte: [M(0)], azione: 'attiva' }, '18', 'Media Giubiasco', '18/07/2026', '7 attività'],
    [{ testo: '4R', bollino: 'ok', titolo: 'Taratura AI attiva' }, { scelte: [M(4), M(0), M(2), M(3)], azione: 'attiva' }, '6', '—', '30/07/2026', '1 attività'],
];
/* La colonna «Classe · materia» PARLA LA STESSA LINGUA del profilo: la materia
   non è scritta a mano riga per riga, viene da MATERIE_PROFILO come nella
   tabella delle classi. Scritta a mano era già divergente — una riga diceva
   «Scienze» dove la materia dichiarata è «Scienze naturali» (trovato
   misurando la tabella il 2/8). */
/* due celle, non una stringa unica: la classe e la materia sono due
   dati e vanno in due colonne (richiesta di Giacomo, 2/8) */
const CM = (classe, iMateria) => [classe, M(iMateria)];

/* Le mappe: MindMap e Knowledge Graph, le due forme che il docente vede come
   una cosa sola («la mappa»). Stanno in cima all'elenco della classe perché
   sono ciò da cui nasce tutto il resto. */
const RIGHE_MAPPE = [
    ['Storia della Carta e delle sue tecniche di fabbricazione in Europa', 'Mappa mentale', ...CM('2A', 0), '77 nodi · L3', '19/07/2026'],
    ['Elettricità e circuiti', 'Knowledge graph', ...CM('1B', 3), '38 nodi · densità 2,0', '17/07/2026'],
];
const RIGHE_DOC = [
    ['Storia della Carta e delle sue tecniche di fabbricazione in Europa', 'Quiz cartaceo', ...CM('2A', 0), '12 domande', '21/07/2026'],
    ['La Fotosintesi', 'Sintesi di ramo', ...CM('1B', 3), '4 sezioni · audio', '24/07/2026'],
    ['Elvezia', 'Foglio nodi', '—', '—', '3×4 · 47 card', '18/07/2026'],
    ['Dal papiro alla stampa', 'Flashcard', ...CM('2A', 0), '2×2 · 28 carte', '20/07/2026'],
];
const RIGHE_AI = [
    ['La Fotosintesi', 'Generazione mappa', 'gemini-2.5-flash', '184.320', 'CHF 0,34'],
    ['La Fotosintesi', 'Quiz e flashcard', 'gemini-2.5-flash', '42.110', 'CHF 0,08'],
    ['Storia della Carta e delle sue tecniche di fabbricazione in Europa', 'Sintesi + voce', 'gemini-2.5-flash', '96.750', 'CHF 0,19'],
    ['Elvezia', 'Tutor (QR)', 'Apertus-70B-Instruct', '7.980', 'CHF 0,02'],
];

/* ── le tre console tematiche (proposta B) ─────────────────────────────── */
/* Navigazione del Registro. Due correzioni dal riesame di Giacomo (31/7):
   - «Credenziali» → «Accessi allievi»: la parola era ambigua (si leggeva come
     credenziali API, che stanno nella Cabina). Qui sono le identità
     emoji+numero con cui gli allievi entrano nelle sessioni (buildCredentials).
   - «Profilo insegnante» esce dal Registro: parla di ME, non della classe →
     vive nella Cabina, dov'è già. */
const NAV_REGISTRO = [
    { id: 'classi', etichetta: 'Classi', icona: 'users', contatore: 4, attiva: true },
    { id: 'allievi', etichetta: 'Allievi', icona: 'user-round', contatore: 64 },
    { id: 'discipline', etichetta: 'Discipline', icona: 'book-open', contatore: 6 },
    { id: 'attivita', etichetta: 'Attività di studio', icona: 'radio', contatore: 11 },
    { id: 'accessi', etichetta: 'Accessi allievi', icona: 'key-round' },
    /* «Documenti» e basta: il contesto in testata dice già DI CHI sono —
       ripeterlo nell'etichetta la fa troncare (misurato a 260px) */
    { id: 'documenti', etichetta: 'Documenti', icona: 'folder-open', contatore: 34 }
];

const CONSOLE_REGISTRO = {
    titolo: 'Registro',
    sottotitolo: 'Classi, allievi e attività — anno 2026/2027',
    icona: 'graduation-cap',
    taglia: 'xl', layout: 'console', piena: true,
    invio: false,   /* elenco, non modulo: Invio nella ricerca non deve chiudere nulla */
    nav: NAV_REGISTRO,
    schede: [
        { id: 'elenco', etichetta: 'Elenco', attiva: true },
        { id: 'taratura', etichetta: 'Taratura AI' },
        { id: 'report', etichetta: 'Report' }
    ],
    sezioni: [
        {
            colonna: 'filtri', campi: [
                { id: 'q', etichetta: 'Cerca una classe' },
                { id: 'sede', tipo: 'scelta', etichetta: 'Sede', opzioni: ['Tutte le sedi', 'Media Bellinzona 2', 'Media Giubiasco'] },
                { id: 'attive', tipo: 'spunta', etichetta: 'Solo attive', valore: true }
            ],
            azioni: [{ id: 'nuova', etichetta: 'Nuova classe', ruolo: 'primario', icona: 'plus' }]
        }
    ],
    tabella: {
        colonne: [
            { etichetta: 'Classe', larghezza: '168px' },
            { etichetta: 'Materie' },
            { etichetta: 'Allievi', larghezza: '85px' },   /* il minimo che regge l'etichetta con la freccia di ordinamento: sotto, «Allievi» si tronca */
            { etichetta: 'Sede', larghezza: '180px' },
            { etichetta: 'Ultimo uso', larghezza: '110px' },
            { etichetta: 'Attività', larghezza: '110px' }
        ],
        righe: RIGHE_CLASSI
    },
    azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
};

/* DOCUMENTI — non più una console a sé, ma la VISTA «Documenti della classe»
   dentro il Registro, raggiunta dopo aver scelto classe e disciplina
   (osservazione di Giacomo, 31/7). Il contesto in testata dice su cosa stai
   guardando e resta valido cambiando vista: è ciò che trasforma tre finestre
   scollegate in un percorso. Rispecchia anche il disco:
   Mappe/<classe>/<disciplina>/<mappa>. */
const CONSOLE_DOCUMENTI = {
    titolo: 'Registro',
    sottotitolo: 'Documenti prodotti per la classe selezionata',
    icona: 'graduation-cap',
    taglia: 'xl', layout: 'console', piena: true,
    invio: false,
    contesto: [
        { id: 'classe', etichetta: '1ªA', icona: 'graduation-cap' },
        { id: 'disciplina', etichetta: 'Storia', icona: 'book-open' }
    ],
    nav: NAV_REGISTRO.map(v => Object.assign({}, v, { attiva: v.id === 'documenti' })),
    schede: [
        { id: 'tutti', etichetta: 'Tutti', attiva: true },
        /* Le MAPPE sono documenti anche loro — anzi sono quelli da cui nasce
           tutto il resto, e su disco stanno nella stessa cartella di classe.
           Senza questa scheda l'elenco della classe mostrava i materiali ma
           non le mappe che li hanno generati. Raccoglie MindMap e Knowledge
           Graph: per il docente sono due forme della stessa cosa. */
        { id: 'mappe', etichetta: 'Mappe' },
        { id: 'quiz', etichetta: 'Quiz cartacei' },
        { id: 'sintesi', etichetta: 'Sintesi' },
        { id: 'fogli', etichetta: 'Fogli dei nodi' },
        { id: 'condivisi', etichetta: 'Condivisi (QR)' }
    ],
    sezioni: [
        {
            colonna: 'filtri', campi: [
                { id: 'q', etichetta: 'Cerca un documento' },
                { id: 'mappa', tipo: 'scelta', etichetta: 'Mappa', opzioni: ['Mappe', 'La Fotosintesi', 'Elvezia'] }
            ],
            azioni: [
                { id: 'stampa', etichetta: 'Stampa', icona: 'printer' },
                { id: 'qr', etichetta: 'Condividi (QR)', ruolo: 'primario', icona: 'qr-code' }
            ]
        }
    ],
    tabella: {
        colonne: [
            /* anteprima del titolo accorciata del 45% (misurata: 444px a 1440
               → 244). Il nome intero resta leggibile nel fumetto dopo 900ms:
               è quello che rende accettabile una colonna più stretta.
               «Contenuto» diventa la colonna elastica, così Documento tiene
               la sua misura a qualunque larghezza di finestra. */
            { etichetta: 'Documento', larghezza: '244px' },
            { etichetta: 'Tipo', larghezza: '150px' },
            { etichetta: 'Classe', larghezza: '90px' },
            { etichetta: 'Materia', larghezza: '150px' },
            { etichetta: 'Contenuto' },
            { etichetta: 'Data', larghezza: '110px' }
        ],
        /* nel Registro l'elenco della classe comprende le MAPPE: sono i
           documenti da cui nasce tutto il resto */
        righe: RIGHE_MAPPE.concat(RIGHE_DOC)
    },
    azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
};

/* «Accessi allievi» — la vista che risponde alla domanda «a cosa serve
   Credenziali»: le identità emoji+numero con cui gli allievi entrano nelle
   sessioni via QR, il foglio stampabile da distribuire, e la rigenerazione.
   NON sono le chiavi API: quelle stanno nella Cabina (E2). */
const CONSOLE_ACCESSI = {
    titolo: 'Registro',
    sottotitolo: 'Accessi allievi — come entrano nelle attività via QR',
    icona: 'graduation-cap',
    taglia: 'xl', layout: 'console', area: 'due',
    piena: true, invio: false,
    contesto: [
        { id: 'classe', etichetta: '1ªA', icona: 'graduation-cap' },
        { id: 'disciplina', etichetta: 'Storia', icona: 'book-open' }
    ],
    nav: NAV_REGISTRO.map(v => Object.assign({}, v, { attiva: v.id === 'accessi' })),
    sezioni: [
        {
            titolo: 'Il foglio da distribuire',
            testo: 'Una tessera per allievo, da ritagliare. Gli allievi la usano per entrare senza installare nulla.',
            azioni: [
                { id: 'stampa', etichetta: 'Stampa tessere', ruolo: 'primario', icona: 'printer' },
                { id: 'pdf', etichetta: 'Salva PDF', icona: 'file-down' }
            ]
        },
        {
            /* Il bisogno vero è l'allievo che arriva a metà anno, non il
               rifacimento di tutte le identità: rigenerare invaliderebbe le
               tessere già consegnate a tutti gli altri. Si aggiunge una
               identità sola, e le altre restano valide. */
            titolo: 'Nuovo allievo',
            testo: 'Arriva un allievo a classe già avviata: riceve la sua identità e la sua tessera, le altre restano valide.',
            azioni: [
                { id: 'aggiungi', etichetta: 'Aggiungi allievo', ruolo: 'primario', icona: 'user-plus' }
            ]
        }
    ],
    tabella: {
        colonne: [
            { etichetta: 'Identità', larghezza: '170px' },
            { etichetta: 'Nome (facoltativo)' },
            { etichetta: 'Ultima attività', larghezza: '190px' },
            { etichetta: 'Consegne', larghezza: '110px' }
        ],
        righe: [
            ['🦊 volpe-03', 'Aline Bernasconi', 'Quiz · 24/07/2026', '7'],
            ['🐢 tartaruga-00', '—', 'Tutor · 21/07/2026', '3'],
            ['🦉 gufo-07', 'Gian-Luca Pellegrini-Rossi', 'Lavagna · 18/07/2026', '5'],
            ['🐝 ape-01', '—', '— mai entrato —', '0']
        ]
    },
    azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
};

/* ── proposta A: console unica ─────────────────────────────────────────── */
const CONSOLE_UNICA = JSON.parse(JSON.stringify(CONSOLE_REGISTRO));
CONSOLE_UNICA.titolo = 'Gestione';
CONSOLE_UNICA.sottotitolo = 'Tutto in una finestra sola';
CONSOLE_UNICA.icona = 'settings';
CONSOLE_UNICA.contesto = [];
/* Sedici voci in fila non sono una navigazione: sono un muro (osservazione di
   Giacomo, 2/8). Divise per ENTITÀ — la classe, i documenti, l'AI, io e
   l'app: sono gli stessi quattro raggruppamenti che nella proposta B sono
   quattro console separate. Guardarli qui come categorie è il modo per
   vedere se A e B dicono la stessa cosa con due densità diverse. */
CONSOLE_UNICA.nav = [
    { gruppo: 'La classe' },
    { id: 'classi', etichetta: 'Classi', icona: 'users', contatore: 4, attiva: true },
    { id: 'allievi', etichetta: 'Allievi', icona: 'user-round', contatore: 64 },
    { id: 'materie', etichetta: 'Materie', icona: 'book-open', contatore: 5 },
    { id: 'attivita', etichetta: 'Attività di studio', icona: 'radio', contatore: 11 },
    { id: 'accessi', etichetta: 'Accessi allievi', icona: 'key-round' },

    { gruppo: 'Documenti' },
    { id: 'doc', etichetta: 'Documenti', icona: 'folder-open', contatore: 34 },
    { id: 'quiz', etichetta: 'Quiz cartacei', icona: 'printer', contatore: 9 },
    { id: 'sintesi', etichetta: 'Sintesi', icona: 'file-text', contatore: 7 },
    { id: 'fogli', etichetta: 'Fogli nodi', icona: 'layout-grid', contatore: 12 },

    { gruppo: 'AI' },
    { id: 'provider', etichetta: 'Impostazioni AI', icona: 'bot' },
    { id: 'consumi', etichetta: 'Consumi', icona: 'coins', contatore: 82 },
    { id: 'tips', etichetta: 'Tips di studio', icona: 'lightbulb' },
    { id: 'prompt', etichetta: 'Prompt (avanzato)', icona: 'terminal' },

    { gruppo: 'Io e l’app' },
    { id: 'profilo', etichetta: 'Profilo insegnante', icona: 'id-card' },
    { id: 'vault', etichetta: 'Vault e cartelle', icona: 'database' }
];

/* ── proposta C: la stessa console, ma dentro un modale XL 1160 ────────── */
const CONSOLE_MODALE = JSON.parse(JSON.stringify(CONSOLE_REGISTRO));
CONSOLE_MODALE.piena = false;
CONSOLE_MODALE.sottotitolo = 'La stessa console, dentro un modale da 1160px';

/* ══════════════════════════════════════════════════════════════════════════
   GRUPPO D — Console «Mappa»: sostituisce il menu contestuale del bottone
   esporta/esci (floating-actions-menu, index.html:1481). Contenuto CENSITO
   dal menu vero: 8 hub (Materiali · Live · Studio attivo · Garden · Graph
   manager · Sincronizza · Revisione · Co-docente) + Annulla + Torna alla Home.
   Le due azioni di stato diventano il PIÈ della console.
   ══════════════════════════════════════════════════════════════════════════ */
/* Navigazione della console «Mappa», rivista con Giacomo il 31/7 (round 5):
   - via «AI sulla mappa»;
   - «Elabora» è un LINK, non una griglia di azioni: apre la modalità ELABORA
     (cioè la console Documenti a tutto schermo);
   - «Genera materiali» è una vista con le sue opzioni, non un bottone;
   - «Jigsaw» raccoglie i vault per gruppi e la Revisione;
   - «Studio attivo» compare SOLO col profilo di un allievo attivo, quindi
     non sta nella griglia «Tutte le azioni». */
const NAV_MAPPA = [
    { id: 'materiali', etichetta: 'Materiali di studio', icona: 'printer', contatore: 6 },
    { id: 'live', etichetta: 'Live', icona: 'radio', contatore: 4 },
    { id: 'grafo', etichetta: 'Grafo e vault', icona: 'folder-cog', contatore: 4 },
    { id: 'jigsaw', etichetta: 'Jigsaw', icona: 'puzzle', contatore: 4 },
    { id: 'genera', etichetta: 'Genera materiali', icona: 'package' },
    /* «Elabora» senza freccia: il ↗ era un glifo infilato nell'etichetta, e
       le icone qui le disegna Lucide — un simbolo scritto nel testo è
       esattamente ciò che la regola dell'11/7 ha tolto da tutto il resto */
    { id: 'elabora', etichetta: 'Elabora', icona: 'sparkles' },
    { id: 'studio', etichetta: 'Studio attivo', icona: 'target', contatore: 7 }
];

const CONSOLE_MAPPA_GRIGLIA = {
    titolo: 'La Fotosintesi',
    sottotitolo: '77 nodi · 6 rami · classe 2A — tutte le azioni sulla mappa aperta',
    icona: 'map',
    taglia: 'xl', layout: 'console', area: 'tre',
    invio: false,        /* è un hub: nessuna azione primaria, Invio non deve fare nulla */
    nav: NAV_MAPPA,
    sezioni: [
        {
            titolo: 'Materiali stampati',
            azioni: [
                { id: 'm1', etichetta: 'Foglio nodi', icona: 'layout-grid' },
                { id: 'm2', etichetta: 'Sintesi', icona: 'file-text' },
                { id: 'm3', etichetta: 'Dossier', icona: 'book-open' },
                { id: 'm4', etichetta: 'Timeline', icona: 'calendar-clock' }
            ]
        },
        {
            titolo: 'Live',
            azioni: [
                { id: 'l1', etichetta: 'Quiz live (QR)', icona: 'radio' },
                { id: 'l2', etichetta: 'Lavagna', icona: 'presentation' },
                { id: 'l3', etichetta: 'Rispondi e Domanda', icona: 'message-circle' },
                { id: 'l4', etichetta: 'Materiali via QR', icona: 'qr-code' }
            ]
        },
        {
            titolo: 'Grafo e vault',
            azioni: [
                { id: 'g1', etichetta: 'Sincronizza vault', icona: 'refresh-cw' },
                { id: 'g2', etichetta: 'Esporta / importa', icona: 'folder-cog' },
                { id: 'g3', etichetta: 'Unisci mappe', icona: 'git-merge' },
                { id: 'g4', etichetta: 'Appunti in Markdown', icona: 'file-down' }
            ]
        },
        {
            titolo: 'Jigsaw',
            azioni: [
                { id: 'j1', etichetta: 'Genera vault', icona: 'users' },
                { id: 'j2', etichetta: 'Ricomponi vault', icona: 'combine' },
                { id: 'j3', etichetta: 'Lacune', icona: 'search-x' },
                { id: 'j4', etichetta: 'Revisione', icona: 'clipboard-pen' }
            ]
        },
        {
            titolo: 'Knowledge Garden',
            azioni: [
                { id: 'k1', etichetta: 'Apri Studio', icona: 'sprout' },
                { id: 'k2', etichetta: 'Importa piano', icona: 'file-up' }
            ]
        }
    ],
    nota: '«Studio attivo» non compare qui: si accende solo col profilo di un allievo attivo, e resta una voce di navigazione. «Elabora» e «Genera materiali» sono viste, non azioni: la prima porta fuori (ELABORA a tutto schermo), la seconda apre le sue opzioni.',
    azioni: [
        { id: 'undo', etichetta: 'Annulla', icona: 'rotate-ccw' },
        { id: 'home', etichetta: 'Torna alla Home', icona: 'arrow-left' },
        { id: 'chiudi', etichetta: 'Chiudi', ruolo: 'quieto' }
    ]
};

/* D2 — la stessa console sul dominio «Materiali»: azioni a sinistra,
   contesto della mappa in colonna laterale, documenti già prodotti sotto */
const CONSOLE_MAPPA_DOMINIO = {
    titolo: 'La Fotosintesi',
    sottotitolo: 'Materiali di studio della mappa aperta',
    icona: 'map',
    taglia: 'xl', layout: 'console', area: 'due',
    invio: false,
    nav: NAV_MAPPA.map(v => Object.assign({}, v, { attiva: v.id === 'materiali' })),
    schede: [
        { id: 'crea', etichetta: 'Crea', attiva: true },
        { id: 'archivio', etichetta: 'Già prodotti' },
        { id: 'condivisi', etichetta: 'Condivisi (QR)' }
    ],
    sezioni: [
        {
            /* una riga per fatto (richiesta di Giacomo, 31/7): in un paragrafo
               unico i cinque numeri si leggono come prosa e ci si perdono */
            colonna: 'lato', titolo: 'Questa mappa', accento: true,
            dati: [
                { etichetta: 'Nodi', valore: '77' },
                { etichetta: 'Rami', valore: '6' },
                { etichetta: 'Densità', valore: '1,22' },
                { etichetta: 'Profondità', valore: 'fino a L3' },
                { etichetta: 'Classe', valore: '2A' },
                { etichetta: 'Disciplina', valore: 'Storia' },
                { etichetta: 'Vault', valore: 'sincronizzato alle 14:02' }
            ]
        },
        {
            /* solo l'ACCESSO ai materiali già prodotti: la generazione ha la
               sua vista («Genera materiali»), qui si apre ciò che esiste */
            titolo: 'Stampati già prodotti',
            azioni: [
                { id: 'm1', etichetta: 'Fogli nodi (3)', icona: 'layout-grid' },
                { id: 'm2', etichetta: 'Sintesi (2)', icona: 'file-text' },
                { id: 'm3', etichetta: 'Dossier (1)', icona: 'book-open' },
                { id: 'm4', etichetta: 'Timeline (1)', icona: 'calendar-clock' }
            ]
        },
        {
            titolo: 'Consegna via QR',
            testo: 'Gli allievi inquadrano il codice e aprono ciò che hai scelto: i materiali già pronti, oppure un file preso dal computer.',
            azioni: [
                { id: 'q1', etichetta: 'Condividi', ruolo: 'primario', icona: 'qr-code' },
                { id: 'q2', etichetta: 'Scegli file', icona: 'folder-open' }
            ],
            /* l'esito della scelta sta SOTTO il bottone che l'ha prodotta:
               senza, non si saprebbe che cosa verrà condiviso */
            sotto: 'Scelto: Scheda-di-lavoro-fotosintesi.pdf · 1,2 MB'
        }
    ],
    tabella: {
        colonne: [
            { etichetta: 'Documento' },
            { etichetta: 'Tipo', larghezza: '150px' },
            { etichetta: 'Classe', larghezza: '90px' },
            { etichetta: 'Materia', larghezza: '150px' },
            { etichetta: 'Contenuto', larghezza: '160px' },
            { etichetta: 'Data', larghezza: '110px' }
        ],
        righe: RIGHE_DOC
    },
    azioni: [
        { id: 'undo', etichetta: 'Annulla', icona: 'rotate-ccw' },
        { id: 'home', etichetta: 'Torna alla Home', icona: 'arrow-left' },
        { id: 'chiudi', etichetta: 'Chiudi', ruolo: 'quieto' }
    ]
};

/* ══════════════════════════════════════════════════════════════════════════
   GRUPPO E — Console «Cabina»: raccoglie i bottoni della top section della
   landing (header-utils, index.html:628-651: Config AI · Guida · Tutorial ·
   Profilo insegnante) + il chip della classe attiva.
   ══════════════════════════════════════════════════════════════════════════ */
const NAV_CABINA = [
    { id: 'profilo', etichetta: 'Profilo insegnante', icona: 'id-card' },
    { id: 'classe', etichetta: 'Classe attiva', icona: 'graduation-cap', contatore: 4 },
    { id: 'ai', etichetta: 'Impostazioni AI', icona: 'bot' },
    { id: 'mappe', etichetta: 'Lingua e mappe', icona: 'languages' },
    { id: 'consumi', etichetta: 'Consumi', icona: 'coins', contatore: 82 },
    { id: 'guida', etichetta: 'Guida e tutorial', icona: 'help-circle' }
];

const CONSOLE_CABINA_PROFILO = {
    titolo: 'Cabina',
    sottotitolo: 'Profilo, classe attiva e AI — i quattro bottoni dell’header in un posto solo',
    icona: 'id-card',
    taglia: 'xl', layout: 'console', area: 'due', sporco: true, veloChiude: false,
    nav: NAV_CABINA.map(v => Object.assign({}, v, { attiva: v.id === 'profilo' })),
    contesto: [
        { id: 'classe', etichetta: '1ªA', icona: 'graduation-cap' },
        { id: 'disciplina', etichetta: 'Storia', icona: 'book-open' }
    ],
    sezioni: [
        {
            titolo: 'Chi sei',
            campi: [
                { id: 'nome', etichetta: 'Nome e cognome', valore: 'Giacomo Meschini' },
                { id: 'anno', tipo: 'scelta', etichetta: 'Anno scolastico', opzioni: ['2026/2027', '2027/2028'] }
            ]
        },
        {
            /* Più sedi: chi insegna in due istituti li ha entrambi, e la sede
               finisce nell'intestazione dei materiali e nel nome della
               cartella di classe — un campo solo lo costringeva a sceglierne
               una e correggere a mano l'altra. */
            titolo: 'Sedi',
            campi: [{
                id: 'sedi', tipo: 'elenco', etichetta: 'Sedi in cui insegni',
                valori: ['SM Bellinzona 2', 'SM Giubiasco'],
                aggiungi: 'Aggiungi sede',
                aiuto: 'Ogni classe dichiara la sua: qui stanno tutte quelle fra cui scegliere.'
            }]
        },
        {
            /* Le materie del profilo sono la fonte di ogni elenco di materie
               nell'app (tabella delle classi, chip di contesto, cartelle su
               disco): si aggiungono qui, una volta. */
            titolo: 'Materie',
            campi: [{
                id: 'materie', tipo: 'elenco', etichetta: 'Materie che insegni',
                valori: MATERIE_PROFILO,
                aggiungi: 'Aggiungi materia',
                aiuto: 'Da qui vengono i nomi che compaiono in tutta l’app: nelle classi, nel chip di contesto e nelle cartelle su disco.'
            }]
        },
        {
            /* L'ora di classe non è una materia: non ha contenuti disciplinari
               e produce materiali di altro genere. Sta come opzione a sé,
               altrimenti finirebbe nell'elenco delle materie e l'AI la
               tratterebbe come tale. */
            titolo: 'Ora di classe',
            campi: [
                {
                    id: 'ora-classe', tipo: 'spunta', etichetta: 'Sono docente di classe', valore: true,
                    aiuto: 'Aggiunge «Ora di classe» fra le materie selezionabili, con materiali non disciplinari.'
                },
                { id: 'classe-di-cui', tipo: 'scelta', etichetta: 'Classe di cui sei docente', opzioni: ['1ª A', '1B', '2A', '4R'] }
            ]
        },
        {
            /* Richiesta di Giacomo (31/7): una categoria unica per il docente
               di sostegno e l'OPI. È la QUALIFICA che apre i profili
               individuali: senza, l'app lavora per classe — con, si può
               lavorare sul singolo allievo. Il gate sta qui perché i dati di
               un allievo con misure compensative sono dati sensibili: si
               aprono dichiarando il ruolo che li giustifica. */
            titolo: 'Ruolo professionale', largo: true,
            campi: [
                {
                    id: 'ruolo-materia', tipo: 'radio', gruppo: 'ruolo',
                    etichetta: 'Docente di materia', valore: true,
                    aiuto: 'Si lavora per classe: mappe, materiali e attività sono della classe.'
                },
                {
                    id: 'ruolo-sostegno', tipo: 'radio', gruppo: 'ruolo',
                    etichetta: 'Docente di sostegno / OPI',
                    aiuto: 'Sblocca i profili dei singoli allievi: taratura, misure compensative e materiali individuali.'
                },
                {
                    id: 'sostegno-ente', etichetta: 'Servizio o istituto di riferimento',
                    aiuto: 'Compare nell’intestazione dei materiali individuali.'
                }
            ]
        },
        {
            titolo: 'Profili individuali degli allievi', accento: true, largo: true,
            testo: 'Attivi perché il ruolo dichiarato è «Docente di sostegno / OPI». Da qui in poi la prima metà del chip può contenere un ALLIEVO al posto della classe, in tutti e tre i tab.',
            dati: [
                { etichetta: 'Profili aperti', valore: '4 allievi su 64' },
                { etichetta: 'Dove vivono', valore: 'sul tuo computer, mai nelle chiamate all’AI' },
                { etichetta: 'Cosa tarano', valore: 'lingua, densità, misure compensative' }
            ],
            azioni: [
                { id: 'apri-prof', etichetta: 'Gestisci profili', icona: 'user-round' }
            ]
        }
    ],
    azioni: [
        { id: 'no', etichetta: 'Annulla' },
        { id: 'salva', etichetta: 'Salva', ruolo: 'primario', icona: 'save' }
    ]
};

/* E2 — la stessa Cabina sul dominio «AI e chiavi»: form a due colonne +
   totale in evidenza + le ultime chiamate. Config e consumi si guardano
   INSIEME: oggi sono i due modali più lontani fra loro. */
const CONSOLE_CABINA_AI = {
    titolo: 'Cabina',
    sottotitolo: 'Impostazioni AI — provider, chiavi, lingua e profondità delle mappe',
    icona: 'bot',
    taglia: 'xl', layout: 'console', area: 'due', sporco: true, veloChiude: false,
    nav: NAV_CABINA.map(v => Object.assign({}, v, { attiva: v.id === 'ai' })),
    sezioni: [
        {
            titolo: 'Provider',
            campi: [
                { id: 'prov', tipo: 'scelta', etichetta: 'Provider AI', opzioni: ['Google (Gemini)', '🇨🇭 Infomaniak (Svizzera)'] },
                { id: 'key', etichetta: 'Chiave API', valore: '••••••••••••3kfa' },
                { id: 'pid', etichetta: 'Product ID (solo Infomaniak)', valore: '' }
            ]
        },
        {
            titolo: 'Lingua e profondità delle mappe',
            campi: [
                { id: 'lingua', tipo: 'scelta', etichetta: 'Lingua delle mappe', opzioni: ['Come l’interfaccia', 'Italiano', 'English', 'Lingua delle fonti'] },
                { id: 'prof', tipo: 'scelta', etichetta: 'Genera fino a', opzioni: ['L2 · essenziale', 'L3 · equilibrata', 'L4', 'L5 · massimo'] },
                { id: 'modello', tipo: 'scelta', etichetta: 'Modello', opzioni: ['gemini-2.5-flash', 'gemini-2.0-flash'] }
            ]
        },
    ],
    tabella: {
        colonne: [
            { etichetta: 'Documento' },
            { etichetta: 'Categoria', larghezza: '170px' },
            { etichetta: 'Modello', larghezza: '200px' },
            { etichetta: 'Token', larghezza: '110px' },
            { etichetta: 'Costo', larghezza: '100px' }
        ],
        righe: RIGHE_AI
    },
    azioni: [
        { id: 'no', etichetta: 'Annulla' },
        { id: 'salva', etichetta: 'Salva', ruolo: 'primario', icona: 'save' }
    ]
};

/* ══════════════════════════════════════════════════════════════════════════
   GRUPPO F — Console «Documento» (ELABORA · Documenti). Risponde alla
   domanda di Giacomo: la console NON è una finestra che si apre dopo aver
   scelto un documento — è il GUSCIO che c'è sempre, e il documento si apre
   DENTRO. Due stati dello stesso guscio:
     F1 elenco   → la navigazione elenca i tipi, la tabella i documenti
     F2 apertura → stesso guscio, il documento entra nella TELA e la barra
                   dell'editor prende il posto dei filtri
   Vantaggio sul modello «lista → finestra editor»: non si esce mai dal
   guscio, quindi si passa da un documento all'altro senza tornare indietro,
   e la navigazione resta visibile mentre si scrive.
   ══════════════════════════════════════════════════════════════════════════ */
const NAV_DOC = [
    /* ELABORA ha due anime: l'analisi della FONTE (Co-docente) e i documenti.
       Senza questa voce la console dei documenti non saprebbe tornare all'altra. */
    { id: 'fonte', etichetta: 'Fonte', icona: 'file-search' },
    { id: 'tutti', etichetta: 'Tutti', icona: 'files', contatore: 34 },
    { id: 'quiz', etichetta: 'Quiz', icona: 'help-circle', contatore: 9 },
    { id: 'flash', etichetta: 'Flashcard', icona: 'copy', contatore: 6 },
    { id: 'sintesi', etichetta: 'Sintesi', icona: 'file-text', contatore: 7 },
    { id: 'fogli', etichetta: 'Fogli dei nodi', icona: 'layout-grid', contatore: 12 },
    { id: 'condivisi', etichetta: 'Condivisi (QR)', icona: 'qr-code', contatore: 3 }
];

const CONSOLE_DOC_ELENCO = {
    titolo: 'Documenti',
    sottotitolo: 'ELABORA · scegli che cosa aprire',
    icona: 'folder-open',
    taglia: 'xl', layout: 'console', piena: true, navChiudibile: true, invio: false,
    contesto: [
        { id: 'classe', etichetta: '1ªA', icona: 'graduation-cap' },
        { id: 'disciplina', etichetta: 'Storia', icona: 'book-open' }
    ],
    nav: NAV_DOC.map(v => Object.assign({}, v, { attiva: v.id === 'tutti' })),
    schede: [
        { id: 'archivio', etichetta: 'Archivio', attiva: true },
        { id: 'disco', etichetta: 'Su disco' }
    ],
    sezioni: [
        {
            colonna: 'filtri', campi: [
                { id: 'q', etichetta: 'Cerca un documento' },
                { id: 'mappa', tipo: 'scelta', etichetta: 'Mappa', opzioni: ['Tutte le mappe', 'La Fotosintesi', 'Elvezia'] }
            ],
            azioni: [{ id: 'nuovo', etichetta: 'Nuovo documento', ruolo: 'primario', icona: 'plus' }]
        }
    ],
    tabella: {
        colonne: [
            { etichetta: 'Documento' },
            { etichetta: 'Tipo', larghezza: '150px' },
            { etichetta: 'Classe', larghezza: '90px' },
            { etichetta: 'Materia', larghezza: '150px' },
            { etichetta: 'Contenuto', larghezza: '160px' },
            { etichetta: 'Data', larghezza: '110px' }
        ],
        righe: RIGHE_DOC
    },
    azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
};

const CONSOLE_DOC_APERTO = {
    titolo: 'Documenti',
    /* Il documento aperto si dichiara nel SOTTOTITOLO, non nel chip: il chip
       porta il contesto (classe · materia), che vale per tutta la console e
       resta uguale passando da un documento all'altro; il documento invece
       cambia a ogni apertura, ed è ciò che il titolo della vista deve dire.
       Forma: ELABORA · [tipo di documento] · [nome mappa]. */
    sottotitolo: 'ELABORA · Quiz cartaceo · Storia della Carta e delle sue tecniche di fabbricazione in Europa',
    icona: 'folder-open',
    taglia: 'xl', layout: 'console', piena: true, sporco: true, invio: false, veloChiude: false,
    /* la navigazione si chiude: 280px in meno di colonna sono 280px in più
       per chi sta scrivendo. Qui il mockup la mostra GIÀ CHIUSA. */
    navChiudibile: true, navChiusa: true,
    contesto: [
        { id: 'classe', etichetta: '1ªA', icona: 'graduation-cap' },
        { id: 'disciplina', etichetta: 'Storia', icona: 'book-open' }
    ],
    nav: NAV_DOC.map(v => Object.assign({}, v, { attiva: v.id === 'quiz' })),
    schede: [
        { id: 'contenuto', etichetta: 'Contenuto', attiva: true },
        { id: 'aspetto', etichetta: 'Aspetto' },
        { id: 'anteprima', etichetta: 'Anteprima di stampa' }
    ],
    sezioni: [
        {
            /* i comandi stanno sulla STESSA riga delle schede (2/8): parlano
               dello stesso documento, e due righe separate rubano altezza
               proprio al foglio */
            colonna: 'barra',
            azioni: [
                { id: 'undo', etichetta: 'Annulla', icona: 'undo-2' },
                { id: 'html', etichetta: 'HTML', icona: 'code' },
                { id: 'vault', etichetta: 'Nel vault', icona: 'folder-down' },
                { id: 'stampa', etichetta: 'Stampa', icona: 'printer' },
                { id: 'salva', etichetta: 'Salva', ruolo: 'primario', icona: 'save' }
            ]
        }
    ],
    tela: {
        id: 'editor',
        segnaposto: 'Qui dentro vive l’editor vero (mappai-doc-editor.js): il foglio con le domande, identico a come verrà stampato. Il motore dei modali non lo disegna — gli dà lo spazio e il contorno.'
    },
    /* Niente piè di pagina: a tutto schermo sarebbe una riga sprecata in fondo.
       Un solo comando, in testata: «Chiudi» riporta all'elenco dei documenti
       (F1). «Esci da ELABORA» è stato tolto — si esce dall'elenco, non da qui:
       due uscite vicine sono due modi di sbagliare. */
    azioniTestata: [
        { id: 'chiudi-doc', etichetta: 'Chiudi', icona: 'x' }
    ]
};

/* ══════════════════════════════════════════════════════════════════════════
   IL CHIP DI CONTESTO — richiesta di Giacomo (31/7): una barra sempre
   presente in COSTRUISCI, ELABORA e INSEGNA, divisa in due metà cliccabili
   (classe/allievo · disciplina). Gli stati che deve reggere, tutti veri.
   ══════════════════════════════════════════════════════════════════════════ */
const CHIP_STATI = [
    {
        nome: 'Niente scelto', quando: 'primo avvio, o «Generico»: l’app lavora senza taratura di classe',
        parti: [
            { id: 'c', etichetta: 'Classe', icona: 'graduation-cap', vuoto: true },
            { id: 'd', etichetta: 'Materia', icona: 'book-open', vuoto: true }
        ]
    },
    {
        nome: 'Classe scelta, disciplina no', quando: 'la classe ne ha più d’una e non hai ancora scelto',
        parti: [
            { id: 'c', etichetta: '1ªA', icona: 'graduation-cap' },
            { id: 'd', etichetta: 'Materia', icona: 'book-open', vuoto: true }
        ]
    },
    {
        nome: 'Classe e disciplina', quando: 'lo stato normale del docente di materia',
        parti: [
            { id: 'c', etichetta: '1ªA', icona: 'graduation-cap' },
            { id: 'd', etichetta: 'Storia', icona: 'book-open' }
        ]
    },
    {
        nome: 'Allievo al posto della classe', quando: 'SOLO col ruolo «Docente di sostegno / OPI» dichiarato nel profilo',
        parti: [
            { id: 'c', etichetta: 'Aline Bernasconi', icona: 'user-round' },
            { id: 'd', etichetta: 'Storia', icona: 'book-open' }
        ]
    },
    {
        nome: 'Caso peggiore', quando: 'nome lungo davvero: la metà si accorcia, non spinge fuori l’altra',
        parti: [
            { id: 'c', etichetta: 'Gian-Luca Pellegrini-Rossi', icona: 'user-round' },
            { id: 'd', etichetta: 'Educazione all’immagine', icona: 'book-open' }
        ]
    }
];

/* ── che cosa mostriamo ────────────────────────────────────────────────── */
const VARIANTI = [
    {
        id: 'f1-doc', gruppo: 'F', nome: 'F1 · Console «Documento» — il guscio, con l’elenco',
        compromesso: 'Risposta alla domanda «quando si apre»: NON dopo aver scelto un documento. È il guscio che c’è sempre in ELABORA·Documenti; la navigazione elenca i tipi, la tabella i documenti della classe nel contesto. I nomi lunghi si troncano con l’ellissi e il nome intero compare al passaggio del mouse dopo 900ms. La navigazione si chiude col comando in cima alla colonna.',
        assorbe: 'ELABORA modalità «Documenti» (la lista) · documenti archiviati · quiz cartacei · condivisi QR',
        schema: CONSOLE_DOC_ELENCO
    },
    {
        id: 'f2-doc', gruppo: 'F', nome: 'F2 · …e il documento aperto DENTRO il guscio (tela)',
        compromesso: 'Aprendo un documento non si cambia finestra: entra nella TELA e la barra dell’editor prende il posto dei filtri. Il documento aperto si legge nel SOTTOTITOLO — «ELABORA · tipo · nome mappa» — mentre il chip resta al contesto (classe · materia), che non cambia passando da un documento all’altro. Qui la navigazione è mostrata GIÀ CHIUSA — 280px in meno di colonna sono 280px in più per chi scrive; il comando in alto a sinistra la riapre. «sporco»: ESC chiede conferma.',
        assorbe: 'i 4 editor di mappai-doc-editor.js (quiz · flashcard · sintesi · foglio dei nodi) e la loro barra azioni',
        schema: CONSOLE_DOC_APERTO
    },
    {
        id: 'b-registro', gruppo: 'B', nome: 'B① · Registro — punto di partenza: scegli la classe',
        compromesso: 'La classe è l’entità che organizza tutto (lo è già su disco: Mappe/<classe>/<disciplina>/<mappa>). Si parte da qui: i nomi delle DISCIPLINE nella tabella sono cliccabili e attivano subito quella coppia classe+disciplina, che entra nel chip di contesto e vale per tutta la console.',
        assorbe: 'account classi · profili studente · registro attività (= la sezione «Attività di studio» di INSEGNA, stessa fonte) · report per classe',
        schema: CONSOLE_REGISTRO
    },
    {
        id: 'b-documenti', gruppo: 'B', nome: 'B② · …e i documenti di QUELLA classe (contesto in testata)',
        compromesso: 'Correzione dal riesame di Giacomo: i documenti non sono una console a sé, sono la vista che si apre DOPO aver scelto classe e materia. Il contesto «1ª A · Storia» resta in testata cambiando vista: tre finestre scollegate diventano un percorso. La scheda «Mappe» raccoglie MindMap e Knowledge Graph — i documenti da cui nasce tutto il resto, che prima non comparivano nell’elenco della classe.',
        assorbe: 'le MAPPE della classe (MindMap e Knowledge Graph) · materiali di studio (hub) · documenti archiviati · quiz cartacei · condivisione QR — tutto filtrato sulla classe scelta',
        schema: CONSOLE_DOCUMENTI
    },
    {
        id: 'b-accessi', gruppo: 'B', nome: 'B③ · «Accessi allievi» (era «Credenziali»)',
        compromesso: 'La parola «Credenziali» era ambigua — si legge come chiavi API, che invece stanno nella Cabina. Qui sono le identità emoji+numero con cui gli allievi entrano nelle attività via QR: il foglio da distribuire, chi è entrato, e la rigenerazione (distruttiva: invalida le tessere già consegnate). Via la spiegazione «come funziona»: la vista si spiega da sé.',
        assorbe: 'foglio credenziali stampabile (buildCredentialCardsHtml) · «Stampa credenziali» del modale classi · elenco allievi con stato',
        schema: CONSOLE_ACCESSI
    },
    {
        id: 'a-unica', gruppo: 'A', nome: 'A · Console unica «Gestione» (16 voci, per confronto)',
        compromesso: 'L’allegato alla lettera: un solo posto per tutto. Le 16 voci sono ora divise per ENTITÀ (la classe · documenti · AI · io e l’app) — le stesse quattro che in B sono quattro console separate: guardarle qui come categorie mostra che A e B dicono la stessa cosa a due densità diverse. Resta il costo: per il docente poco esperto una colonna con quattro sezioni è comunque un gestionale.',
        assorbe: 'tutte le superfici delle tre console di B, in un solo elenco',
        schema: CONSOLE_UNICA
    },
    {
        id: 'd1-mappa', gruppo: 'D', nome: 'D1 · Console «Mappa» — griglia delle azioni (area a 3 colonne)',
        compromesso: 'Sostituisce il menu esporta/esci. Rivisto il 31/7: via «AI sulla mappa»; «Elabora» e «Genera materiali» diventano VOCI di navigazione (la prima porta a ELABORA a tutto schermo, la seconda apre le sue opzioni); nuova sezione «Jigsaw» coi vault per gruppi e la Revisione; «Studio attivo» resta voce ma fuori dalla griglia, perché si accende solo col profilo di un allievo. «Annulla» e «Torna alla Home» nel piè, sempre nello stesso posto.',
        assorbe: 'floating-actions-menu · openStudyMaterialsModal · openGraphManagerModal · openLiveHub (come navigazione)',
        schema: CONSOLE_MAPPA_GRIGLIA
    },
    {
        id: 'd2-mappa', gruppo: 'D', nome: 'D2 · Console «Mappa» — dominio attivo + documenti prodotti (2 colonne + tabella)',
        compromesso: 'La stessa console col dominio «Materiali» selezionato. Rivisto il 31/7: a sinistra solo l’ACCESSO agli stampati già prodotti (la generazione ha la sua vista), a destra un pannello solo per consegnare — QR con ciò che è pronto, oppure un file dal computer. Via Jigsaw e Genera materiali. Sotto, i documenti già prodotti: creare e ritrovare nello stesso posto.',
        assorbe: 'materiali di studio (hub) + documenti archiviati + quiz cartacei, per la mappa aperta',
        schema: CONSOLE_MAPPA_DOMINIO
    },
    {
        id: 'e1-cabina', gruppo: 'E', nome: 'E1 · Console «Cabina» — profilo e classe attiva (area a 2 colonne)',
        compromesso: 'Raccoglie i 4 bottoni dell’header della landing (Config AI · Guida · Tutorial · Profilo) + il chip classe. Vista «Profilo» rivista il 2/8: via le «Note per l’AI» (le attenzioni stanno sulla CLASSE, non sul docente); sedi e materie diventano ELENCHI a cui si aggiungono voci — chi insegna in due istituti o tre materie non deve più sceglierne una sola; nuova opzione «Ora di classe», tenuta fuori dalle materie perché non è una materia (nessun contenuto disciplinare, materiali di altro genere). Un solo Salva per tutto quello che oggi è sparso in 3 modali.',
        assorbe: 'header-utils della landing · profilo insegnante · switcher classe attiva',
        schema: CONSOLE_CABINA_PROFILO
    },
    {
        id: 'e2-cabina', gruppo: 'E', nome: 'E2 · Console «Cabina» — AI, chiavi e consumi (2 colonne + tabella)',
        compromesso: 'Vista «Impostazioni AI»: provider, chiavi, lingua e profondità delle mappe. I numeri di spesa NON stanno qui — vivono nella vista «Consumi», dov’è il loro posto; sotto restano le ultime chiamate come traccia. ⚠️ QUESTA sostituisce la console «AI» che avevo proposto in B: erano la stessa cosa proposta due volte.',
        assorbe: 'config-ai-modal (oggi senza archetipo) · usage dashboard · selettore lingua/profondità',
        schema: CONSOLE_CABINA_AI
    }
];

const LARGHEZZE = [1440, 1920];

/* ══════════════════════════════════════════════════════════════════════════
   La pagina dentro l'iframe: carica i file VERI e chiama il motore VERO.
   ══════════════════════════════════════════════════════════════════════════ */
function paginaIframe(schema) {
    /* una console a vista piena si guarda da bordo a bordo: il velo puntinato
       e il padding servono solo alle varianti che restano riquadri sospesi */
    const piena = !!schema.piena;
    return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/mappai-modal-tokens.css?v=${v}">
<script src="../js/lucide.min.js"></script>
<script src="../js/mappai-modal-core.js?v=${v}"></script>
<script src="../js/mappai-modal.js?v=${v}"></script>
<style>
  /* le variabili di :root dell'app: senza --emoji-font la dichiarazione
     font-family verrebbe SCARTATA e si misurerebbe un altro carattere */
  :root { --emoji-font:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif; }
  * { font-family:'Space Mono', var(--emoji-font), monospace; box-sizing:border-box; }
  html,body { margin:0; height:100%; }
  body { background:#eef1f6; display:flex; align-items:center; justify-content:center;
         ${piena ? 'padding:0;' : `background-image:radial-gradient(#dbe1ea 1px, transparent 1px);
         background-size:16px 16px; padding:18px;`} }
</style></head><body>
<script>
  var SCHEMA = ${JSON.stringify(schema)};
  document.body.appendChild(MappAIModal.render(SCHEMA));
  if (window.lucide) try { lucide.createIcons(); } catch(e){}
</script>
</body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* la pagina del chip: un iframe solo, coi cinque stati uno sotto l'altro,
   costruiti con MappAIModal.chipContesto — lo stesso codice della testata */
const paginaChip = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/mappai-modal-tokens.css?v=${v}">
<script src="../js/lucide.min.js"></script>
<script src="../js/mappai-modal-core.js?v=${v}"></script>
<script src="../js/mappai-modal.js?v=${v}"></script>
<style>
  :root { --emoji-font:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif; }
  * { font-family:'Space Mono', var(--emoji-font), monospace; box-sizing:border-box; }
  body { margin:0; padding:20px 24px; background:#fff; }
  .st { display:flex; align-items:center; gap:16px; padding:11px 0; border-bottom:1px solid #f1f5f9; }
  .st:last-child { border-bottom:0; }
  .st .et { flex:0 0 300px; }
  .st .et b { display:block; font-size:12px; }
  .st .et span { font-size:10.5px; color:#94a3b8; line-height:1.5; display:block; margin-top:2px; }
  .barra { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px 16px;
           display:flex; align-items:center; gap:14px; margin-bottom:18px; }
  .barra .tit { font-size:13px; font-weight:700; }
  .barra .seg { display:inline-flex; background:#f1f5f9; border-radius:999px; padding:3px; gap:2px; margin-left:auto; }
  .barra .seg button { border:0; background:none; border-radius:999px; padding:6px 14px; font:700 12px inherit;
                       color:#64748b; cursor:pointer; }
  .barra .seg button.on { background:#fff; color:#4f46e5; box-shadow:0 1px 2px rgba(15,23,42,.08); }
</style></head><body>
<div class="barra">
  <span class="tit">MappAI</span>
  <div id="chip-vivo"></div>
  <span class="seg"><button class="on">Costruisci</button><button>Elabora</button><button>Insegna</button></span>
</div>
<div id="stati"></div>
<script>
  var STATI = ${JSON.stringify(CHIP_STATI)};
  document.getElementById('chip-vivo').appendChild(MappAIModal.chipContesto(STATI[2].parti));
  function riga(host, s) {
    var r = document.createElement('div'); r.className = 'st';
    var e = document.createElement('div'); e.className = 'et';
    e.innerHTML = '<b>' + s.nome + '</b><span>' + s.quando + '</span>';
    r.appendChild(e);
    var c = MappAIModal.chipContesto(s.parti);
    r.appendChild(c);
    var m = document.createElement('span');
    m.style.cssText = 'font-size:10.5px;color:#94a3b8;margin-left:12px';
    r.appendChild(m);
    host.appendChild(r);
    requestAnimationFrame(function () {
      m.textContent = Math.round(c.getBoundingClientRect().width) + '×' + Math.round(c.getBoundingClientRect().height) + 'px';
    });
  }
  STATI.forEach(function (s) { riga(document.getElementById('stati'), s); });
  if (window.lucide) try { lucide.createIcons(); } catch(e){}
</script>
</body></html>`;

const pannelli = VARIANTI.map(vr => {
    const iframes = LARGHEZZE.map(w =>
        `<div class="pan" data-w="${w}">
       <div class="pan-h"><b>${w}px</b><span class="mis" id="mis-${vr.id}-${w}">misuro…</span></div>
       <iframe class="tela" data-var="${vr.id}" data-larg="${w}"
               style="width:${w}px;height:${Math.round(w * 0.63)}px"
               src="console-mockup-${vr.id}.html?v=${v}"></iframe>
     </div>`).join('');
    return `<section class="var" id="v-${vr.id}">
    <div class="var-h">
      <span class="gr gr-${vr.gruppo}">${vr.gruppo}</span>
      <h3>${esc(vr.nome)}</h3>
      <p class="comp">${esc(vr.compromesso)}</p>
      <p class="ass"><b>Assorbe:</b> ${esc(vr.assorbe)}</p>
    </div>
    <div class="righe">${iframes}</div>
  </section>`;
}).join('\n');

const page = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Console — mockup comparativi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>
  :root { --emoji-font:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif; }
  * { font-family:'Space Mono', var(--emoji-font), monospace; box-sizing:border-box; }
  body { margin:0; background:#e8ebf1; color:#0f172a; }
  header.top { position:sticky; top:0; z-index:60; background:rgba(232,235,241,.96);
    backdrop-filter:blur(8px); border-bottom:1px solid #d7dde7; padding:14px 26px 12px; }
  h1 { font-size:22px; margin:0 0 3px; }
  .sub { font-size:12px; color:#64748b; margin:0 0 10px; max-width:100ch; line-height:1.6; }
  .cmd { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .cmd b { font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; margin-right:2px; }
  .mini { background:#fff; border:1px solid #d7dde7; border-radius:999px; padding:5px 12px;
    font-size:11.5px; font-weight:700; color:#475569; cursor:pointer; }
  .mini.on { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }
  .wrap { padding:22px 26px 80px; }
  .var { margin-bottom:34px; }
  .var-h { max-width:100ch; margin-bottom:10px; }
  .var-h h3 { font-size:16px; margin:4px 0 6px; display:inline-block; }
  .gr { display:inline-block; font-size:10px; font-weight:700; border-radius:999px; padding:2px 9px;
    vertical-align:2px; margin-right:8px; }
  .gr-A { background:#fef3c7; color:#a16207; } .gr-B { background:#d1fae5; color:#047857; }
  .gr-C { background:#e0e7ff; color:#4338ca; }
  .gr-D { background:#fee2e2; color:#b91c1c; } .gr-E { background:#cffafe; color:#0e7490; }
  .gr-F { background:#f3e8ff; color:#7e22ce; }
  .comp { font-size:12px; color:#475569; line-height:1.65; margin:0 0 5px; }
  .ass { font-size:11px; color:#94a3b8; line-height:1.6; margin:0; }
  .righe { display:flex; gap:18px; align-items:flex-start; overflow-x:auto; padding-bottom:8px; }
  .pan-h { display:flex; align-items:baseline; gap:10px; margin-bottom:5px; font-size:11px; color:#64748b; }
  .pan-h b { font-size:12px; color:#334155; }
  .mis { color:#94a3b8; }
  .mis.ko { color:#c2410c; font-weight:700; }
  iframe.tela { border:1px solid #cbd5e1; border-radius:10px; background:#eef1f6; display:block;
    box-shadow:0 8px 24px -12px rgba(15,23,42,.35); }
  /* «affianca»: si scala la RIGA, non gli iframe — gli iframe restano alle
     larghezze vere, altrimenti dentro girerebbe un layout responsive diverso */
  body.affianca .righe { transform:scale(.42); transform-origin:top left; width:238%; }
  body.solo-1440 .pan[data-w="1920"], body.solo-1920 .pan[data-w="1440"] { display:none; }
</style></head><body>

<header class="top">
  <h1>Console — le proposte</h1>
  <p class="sub" style="margin-bottom:4px"><b>B</b>: il Registro come PERCORSO — scegli la classe (B①),
  vedi i suoi documenti (B②), gestisci gli accessi degli allievi (B③); il contesto in testata tiene
  insieme le viste · <b>A/C</b>: alternative di confronto (console unica · dentro un modale) ·
  <b>D</b>: la console «Mappa» che sostituisce il menu esporta/esci · <b>E</b>: la «Cabina» che raccoglie
  i 4 bottoni dell'header della landing, l'AI e i consumi.</p>
  <p class="sub">Ogni pannello è un iframe largo <b>davvero</b> 1440 o 1920 px, dentro cui gira il motore vero
  (<code>MappAIModal.render</code>) coi token veri. Contenuti del caso peggiore, identici in tutte le varianti:
  il nome di mappa più lungo che esiste, «1ª A» con ordinale e apostrofo, una cella vuota.
  Le misure a fianco sono lette dentro gli iframe dopo il caricamento dei font.</p>
  <div class="cmd">
    <b>Larghezze</b>
    <button class="mini on" data-w="tutte">1440 + 1920</button>
    <button class="mini" data-w="1440">solo 1440</button>
    <button class="mini" data-w="1920">solo 1920</button>
    <span style="width:14px"></span>
    <b>Scala</b>
    <button class="mini on" data-s="1">1:1 — per giudicare la leggibilità</button>
    <button class="mini" data-s="0.42">affianca — per giudicare la composizione</button>
  </div>
</header>

<div class="wrap">

<section class="var" id="v-chip">
  <div class="var-h">
    <span class="gr gr-F">CHIP</span><h3>Il chip di contesto — «classe/allievo · disciplina»</h3>
    <p class="comp">Una barra sempre presente in <b>Costruisci · Elabora · Insegna</b>: un chip diviso in due metà,
    ognuna cliccabile, ognuna con il suo selettore. Forma <b>compatta, adottata il 2/8</b>: niente freccette
    (la metà si capisce cliccabile dal fondo che cambia al passaggio), padding stretto, icone 15px, classe
    scritta senza spazio — «1ªA». Si è stretta la larghezza (−19%), non il bersaglio: l'altezza resta 43px. La prima metà tiene una CLASSE oppure un ALLIEVO —
    l'allievo solo se nel profilo è dichiarato il ruolo «Docente di sostegno / OPI» (vista E1).
    È lo stesso componente che compare in testata alle console: la stessa informazione non può avere due vesti.</p>
    <p class="ass"><b>Sostituisce:</b> il chip «classe attiva» di header-utils · lo switcher di classe · il filtro classe di INSEGNA · il modale classe+disciplina alla generazione</p>
  </div>
  <div class="righe"><div class="pan" data-w="1440">
    <div class="pan-h"><b>1440px</b><span class="mis" id="mis-chip-1440">misuro…</span></div>
    <iframe class="tela" data-var="chip" data-larg="1440" style="width:1440px;height:460px" src="console-mockup-chip.html?v=${v}"></iframe>
  </div></div>
</section>

${pannelli}
</div>

<script>
document.querySelectorAll('[data-w]').forEach(function(b){
  if (b.tagName !== 'BUTTON') return;
  b.addEventListener('click', function(){
    document.querySelectorAll('button[data-w]').forEach(function(x){ x.classList.toggle('on', x===b); });
    document.body.classList.remove('solo-1440','solo-1920');
    var w = b.getAttribute('data-w');
    if (w !== 'tutte') document.body.classList.add('solo-'+w);
  });
});
document.querySelectorAll('button[data-s]').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('button[data-s]').forEach(function(x){ x.classList.toggle('on', x===b); });
    document.body.classList.toggle('affianca', b.getAttribute('data-s') !== '1');
  });
});

/* ── misure DENTRO gli iframe (stessa origine) ───────────────────────────
   Mai prima di document.fonts.ready: col ripiego (Times) le righe cadono
   altrove e il conteggio dei tagli è falso. */
function misura(f){
  var d = f.contentDocument; if (!d) return;
  var id = f.getAttribute('data-var'), w = f.getAttribute('data-larg');
  var out = document.getElementById('mis-'+id+'-'+w); if (!out) return;
  d.fonts.ready.then(function(){
    if (id === 'chip') {                       /* la pagina del chip non ha riquadro */
      var chips = [].slice.call(d.querySelectorAll('.mm-ctx'));
      var parti = [].slice.call(d.querySelectorAll('.mm-ctx__p'));
      var tag = parti.filter(function(e){ var s=e.querySelector('span'); return s && s.scrollWidth > s.clientWidth+1; }).length;
      var alt = chips.length ? Math.round(chips[0].getBoundingClientRect().height) : 0;
      var pMax = Math.max.apply(null, parti.map(function(e){ return Math.round(e.getBoundingClientRect().width); }));
      out.textContent = chips.length + ' chip · ' + parti.length + ' metà · alto ' + alt + 'px' +
        ' · metà più larga ' + pMax + 'px · troncati ' + tag;
      out.className = 'mis' + (tag ? ' ko' : '');
      return;
    }
    var box = d.querySelector('.mm-box');
    if (!box) { out.textContent = 'nessun riquadro reso'; out.className='mis ko'; return; }
    var r = box.getBoundingClientRect();
    var side = d.querySelector('.mm-console__side');
    var tab  = d.querySelector('.mm-tab');
    var wrap = d.querySelector('.mm-tab-wrap');
    var nav  = d.querySelectorAll('.mm-nav__v');
    /* testi tagliati: celle, navigazione, titoli di sezione e bottoni-azione */
    var tagliati = [].slice.call(d.querySelectorAll('.mm-tab td, .mm-nav__t, .mm-tab th, .mm-sez__t, .mm-btn span'))
      .filter(function(e){ return e.scrollWidth > e.clientWidth + 1; }).length;
    var sborda = d.body.scrollWidth > f.clientWidth + 2;
    var righeViste = wrap ? Math.floor((wrap.clientHeight - 34) / 35) : 0;
    var hNav = nav.length ? Math.round(nav[0].getBoundingClientRect().height) : 0;
    var sez = d.querySelector('.mm-console__sez');
    var colonneArea = sez ? (getComputedStyle(sez).gridTemplateColumns.split(' ').filter(Boolean).length || 1) : 0;
    var testo = 'riquadro ' + Math.round(r.width) + '×' + Math.round(r.height) +
      ' · navigazione ' + (side ? Math.round(side.getBoundingClientRect().width) : '?') + 'px' +
      ' · voce alta ' + hNav + 'px' +
      (colonneArea ? ' · area a ' + colonneArea + (colonneArea === 1 ? ' colonna' : ' colonne') : '') +
      (tab ? ' · tabella ' + Math.round(tab.getBoundingClientRect().width) + 'px · ~' + righeViste + ' righe visibili' : '') +
      ' · troncati ' + tagliati;
    if (sborda) testo += ' · SBORDA';
    out.textContent = testo;
    out.className = 'mis' + ((sborda) ? ' ko' : '');
  });
}
document.querySelectorAll('iframe.tela').forEach(function(f){
  if (f.contentDocument && f.contentDocument.readyState === 'complete') misura(f);
  f.addEventListener('load', function(){ misura(f); });
});
</script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');

/* una pagina-iframe per variante: l'iframe deve essere di STESSA ORIGINE per
   poterlo misurare dall'esterno, quindi file veri, non srcdoc */
VARIANTI.forEach(vr => {
    fs.writeFileSync(path.join(ROOT, 'public/dev/console-mockup-' + vr.id + '.html'), paginaIframe(vr.schema), 'utf8');
});
fs.writeFileSync(path.join(ROOT, 'public/dev/console-mockup-chip.html'), paginaChip, 'utf8');

console.log('scritto:', path.relative(ROOT, OUT));
console.log('  varianti:', VARIANTI.length, '· larghezze:', LARGHEZZE.join(' · '));
VARIANTI.forEach(vr => console.log('   -', vr.id, '→ public/dev/console-mockup-' + vr.id + '.html'));
