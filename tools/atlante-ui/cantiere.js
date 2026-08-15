/* Atlante UI — CANTIERE
 *
 * Dove va ogni superficie, e a che punto è. È l'unico file dell'atlante scritto
 * a mano, perché la destinazione di una superficie è una DECISIONE, non un dato
 * che si legge dal codice.
 *
 * Ma non resta scollegato: `build.js` verifica ogni riga contro le superfici che
 * ha davvero raccolto (una riga che punta a una superficie inesistente è un
 * avviso in fase di build) e affianca alla destinazione le PROVE lette dal
 * sorgente — quante classi `.pm-*`, quanti overlay a stile inline, se il file
 * chiama il motore. La destinazione la decide Giacomo; il costo lo misura il
 * codice.
 *
 * Le superfici senza una riga qui NON spariscono: compaiono come «da assegnare»,
 * ed è quello il numero che dice quante decisioni mancano ancora.
 *
 * Stati — quattro, non di più: con più sfumature nessuno sa più che cosa fare.
 */
'use strict';

const STATI = {
    motore: {
        nome: 'al motore', colore: '#047857',
        spiega: 'La disegna MappAIModal da uno schema. È il traguardo: qui non resta lavoro.'
    },
    ponte: {
        nome: 'ponte', colore: '#b45309',
        spiega: 'La console la APRE, ma la finestra è ancora quella storica. Funziona, e nasconde il debito: ' +
            'chi la usa crede che sia migrata. Va chiusa, non lasciata lì.'
    },
    daFare: {
        nome: 'da migrare', colore: '#b91c1c',
        spiega: 'Vive fuori dallo standard: stile inline o classi .pm-*. Nessun focus trap, nessun ritorno del fuoco, token propri.'
    },
    pensione: {
        nome: 'da pensionare', colore: '#64748b',
        spiega: 'Il contenuto vive già altrove: quello che resta è markup morto o un secondo ingresso alla stessa cosa.'
    },
    fuori: {
        nome: 'fuori perimetro', colore: '#94a3b8',
        spiega: 'Deciso il 31/7 nell\'officina: non entra nello standard dei modali (pagine QR, veli di sistema).'
    }
};

/* id della superficie → dove va · in che stato è · perché.
   L'id è quello che build.js assegna: `st-<id html>` · `dyn-<id campione>` ·
   `console-<variante>` · `app-<console>` · `lnd-<id>` · `map-<id>`. */
const DESTINAZIONI = [
    /* ── già al motore ─────────────────────────────────────────────────── */
    { id: 'dyn-dyn-teacher', dove: 'Cabina › Profilo insegnante', stato: 'motore',
      nota: 'MappAITeacherProfile.sezioni() è la fonte unica: la Cabina monta le STESSE sezioni della finestra storica.' },
    { id: 'dyn-dyn-usage', dove: 'Cabina › Consumi AI', stato: 'motore',
      nota: 'Il cruscotto non è ridisegnato: arriva da MappAIUsageDash.contentHtml dentro la tela della console.' },

    /* ── ponti: la console ci arriva, ma la finestra è ancora storica ──── */
    { id: 'st-config-ai-modal', dove: 'Cabina › Impostazioni AI', stato: 'ponte',
      nota: 'L\'ULTIMO ponte dichiarato nell\'handoff. È anche uno dei 5 modali statici senza archetipo.' },
    { id: 'dyn-dyn-classi', dove: 'Cabina › Allievi · Classi', stato: 'ponte',
      nota: 'Le due tabelle sono al motore; «Gestisci» apre ancora questa scheda (z 9992, alzato a mano sopra la console).' },

    /* ── da pensionare: il contenuto è già in una console ──────────────── */
    { id: 'st-app-guide-modal', dove: 'Cabina › Tutorial', stato: 'pensione',
      nota: 'L\'header non ci punta più. Restano il markup e le chiavi i18n.' },
    { id: 'st-app-tutorial-modal', dove: 'Cabina › Consigli di studio', stato: 'pensione',
      nota: 'Stessi metodi di studio, stesse chiavi study_*: la Cabina li monta dalla stessa fonte.' },
    { id: 'st-alert-modal', dove: 'MappAIModal.avviso', stato: 'pensione',
      nota: 'Il motore ha già la scorciatoia. Finché showToast/showAlert legacy la usano, il markup resta.' },
    { id: 'st-confirm-modal', dove: 'MappAIModal.conferma', stato: 'pensione',
      nota: 'Attenzione alla firma storica showConfirm(titolo, messaggio, callback): con due argomenti la callback finisce stampata.' },
    { id: 'st-prompt-modal', dove: 'MappAIModal.chiedi', stato: 'pensione',
      nota: 'Markup fermo a z-9999: aperto sopra una console finisce DIETRO. È il difetto di «Elimina classe».' },

    /* ── console Mappa (D1/D2): sostituisce il menu radiale ────────────── */
    /* ⚠️ 13/8/26 — LA CONSOLE «MAPPA» (D1) È STATA RITIRATA (Giacomo): superata
       dalle decisioni successive. Il menu radiale resta quello che è e gira.
       Le sedici superfici che le erano state assegnate NON sono per questo
       sistemate: hanno perso la destinazione, e adesso lo dicono («—»). Sono
       decisioni che mancano, non lavoro in coda — ed è giusto che il conto delle
       decisioni mancanti salga, invece di indicare una meta che non esiste. */
    { id: 'map-floating-actions-menu', dove: '—', stato: 'daFare',
      nota: 'Il menu radiale con 22 azioni in 8 hub. Resta com\'è finché non si decide altro.' },
    { id: 'dyn-dyn-hub', dove: '—', stato: 'daFare',
      nota: 'L\'hub «Materiali di studio» diventa un dominio della console, non una finestra a sé.' },
    { id: 'dyn-dyn-active-study', dove: '—', stato: 'daFare',
      nota: 'Il launcher a due colonne è già un mezzo cruscotto: entra come vista.' },
    { id: 'st-dossier-print-modal', dove: '—', stato: 'daFare' },
    { id: 'st-study-config-modal', dove: '—', stato: 'daFare',
      nota: 'Uno dei 5 modali statici senza archetipo.' },
    { id: 'st-layout-manager-modal', dove: '—', stato: 'daFare',
      nota: 'Uno dei 5 senza archetipo. Convive con la vista STUDIO, che ha già il suo tab.' },
    { id: 'st-contextual-ai-extension-modal', dove: '—', stato: 'daFare',
      nota: 'Uno dei 5 senza archetipo.' },
    { id: 'st-link-family-modal', dove: '—', stato: 'daFare',
      nota: 'Uno dei 5 senza archetipo. È un elenco di famiglie: l\'archetipo è «Elenco», già nel motore.' },
    { id: 'st-edit-node-modal', dove: '—', stato: 'daFare' },
    { id: 'st-source-modal', dove: 'resta com\'è (Scheda Focus)', stato: 'daFare',
      nota: 'La superficie più aperta di tutta l\'app. Migrarla vale doppio, ma non è una console: è una scheda.' },
    { id: 'dyn-dyn-checkpoint', dove: '—', stato: 'daFare' },
    { id: 'dyn-dyn-correction', dove: '—', stato: 'daFare' },
    { id: 'st-merge-confirm-modal', dove: 'MappAIModal.conferma', stato: 'daFare' },
    { id: 'st-validate-link-modal', dove: '—', stato: 'daFare' },
    { id: 'st-vault-manager-modal', dove: '—', stato: 'daFare' },
    { id: 'st-layout-exit-confirm-modal', dove: 'MappAIModal.conferma', stato: 'daFare' },
    { id: 'st-ai-modal', dove: '—', stato: 'daFare' },
    { id: 'st-quiz-modal', dove: '—', stato: 'daFare' },
    { id: 'st-study-player-modal', dove: '—', stato: 'daFare' },

    /* ── console Documento (F): il guscio di ELABORA ───────────────────── */
    { id: 'dyn-dyn-docedit', dove: 'Console Documento (F1)', stato: 'daFare',
      nota: 'Il modale di scelta È l\'elenco della console F1: la console non si apre DOPO aver scelto, è il guscio.' },
    { id: 'st-edit-project-title-modal', dove: 'Console Documento › testata', stato: 'daFare' },

    /* ── INSEGNA ───────────────────────────────────────────────────────── */
    { id: 'dyn-dyn-tutor', dove: 'INSEGNA › Attività LIVE', stato: 'daFare',
      nota: 'La console avvia già Lavagna e LIVE con parametri; il wizard del Tutor è ancora una finestra a sé.' },
    { id: 'st-user-profile-modal', dove: 'Cabina › Allievi', stato: 'daFare',
      nota: 'Il profilo studente è la scheda che tara l\'AI: la sua casa è la Cabina, accanto alle classi.' },

    /* ── landing ───────────────────────────────────────────────────────── */
    { id: 'lnd-landing-view', dove: 'resta la landing', stato: 'daFare',
      nota: 'Dei suoi comandi solo DUE sono al motore: il chip del contesto e la Cabina. Tutto il resto è markup di pagina.' },
    { id: 'lnd-setup-form', dove: 'resta COSTRUISCI', stato: 'daFare',
      nota: 'La superficie più grande fuori standard. La vista ridotta ne nasconde i pezzi, non li migra: i campi non sono .mm-campo.' },
    { id: 'dyn-dyn-pipeline', dove: 'archetipo «cruscotto» (1160)', stato: 'daFare',
      nota: 'Il ridisegno esiste già in tools/campionario-modali/proposte.js: la stima delle chiamate va tenuta a vista mentre si sceglie.' },
    { id: 'dyn-dyn-files', dove: 'Cabina › Cartella dei file', stato: 'daFare' },

    /* ── fuori perimetro (verdetti officina, 31/7) ─────────────────────── */
    { id: 'dyn-dyn-qr', dove: '—', stato: 'fuori', nota: 'Pagina di proiezione: non è un modale.' },
    { id: 'st-loading-overlay', dove: '—', stato: 'fuori', nota: 'Velo di sistema. Copertura misurata: 0% — è tutto stile inline.' },
    { id: 'st-api-tutorial-modal', dove: 'Cabina › Impostazioni AI', stato: 'daFare',
      nota: 'Segue config-ai: è la sua guida, va dove va lei.' }
];

/* Lavori del cantiere che NON hanno una superficie nell'atlante — perché sono
   finestre-documento, contenitori mancanti o codice senza più un ingresso.
   Stanno qui perché la coda di lavoro dev'essere una sola: se metà vive
   nell'handoff e metà nell'atlante, si lavora due volte sulla stessa cosa. */
const FUORI_ATLANTE = [
    { nome: 'Barra dei documenti — i cloni rimasti', stato: 'daFare',
      dove: 'public/js/mappai-doc-bar.js',
      file: ['public/js/mappai-branch-synthesis.js', 'public/js/mappai-causal-chains.js',
             'public/js/mappai-timeline.js', 'public/js/mappai-glossary.js', 'public/js/mappai-live-reports.js'],
      nota: 'La topbar di stampa era copiata in sei file con tre glifi stampante diversi. Uno è passato a doc-bar; questi no.' },
    { nome: '«File condivisi» — la libreria', stato: 'pensione',
      dove: 'MappAI Live › Materiali di studio › «Aggiungi file…»',
      file: ['public/js/mappai-landing-teach.js'],
      nota: 'PENSIONATA il 13/8: la si poteva riempire e non svuotare (la vista scriveva in un contenitore che la landing non ha più). Il gesto resta, nel pannello dei materiali della sessione.' },
    { nome: 'Progetti salvati — codice senza ingresso', stato: 'pensione',
      dove: 'StorageManager.renderRecentProjects · MappAITeach.editGrade',
      file: ['public/js/mappai-storage-lang.js', 'public/js/mappai-landing-teach.js'],
      nota: 'Dopo l\'eliminazione della sezione non hanno più un ingresso nella UI: degradano in silenzio, non lanciano.' },
    { nome: 'Modale «Invia segnalazione»', stato: 'pensione',
      dove: 'Cabina › Segnalazione',
      file: ['public/index.html', 'public/js/app.js', 'public/js/mappai-cabina.js'],
      nota: 'ELIMINATO il 15/8: markup via da index.html, le sei categorie sono voci con icone Lucide, il testo un campo del motore, l\'invio un\'azione. Il cassetto insegnai apre la Cabina. Sta qui e non fra le superfici perché una superficie non ce l\'ha più.' },
    { nome: 'I 713 !important di style.css', stato: 'daFare',
      dove: 'public/css/style.css',
      file: ['public/css/style.css'],
      nota: 'Il 59% delle dichiarazioni. È il motivo per cui la cascata non è prevedibile a tavolino.' }
];

module.exports = { STATI, DESTINAZIONI, FUORI_ATLANTE };
