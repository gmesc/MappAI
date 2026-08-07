/* OFFICINA — GLI ARCHETIPI DEI MODALI
 *
 * I 69 modali censiti nel campionario non sono 69 problemi diversi: sono
 * quattordici forme, scritte più volte. Qui ognuna ha un nome, una taglia, una
 * regola su quando usarla, e uno SCHEMA che il motore (`mappai-modal.js`) sa
 * disegnare. `istanze` elenca i modali reali che ci confluiscono: è il modo per
 * sapere quando la migrazione è finita e cosa resta scoperto.
 *
 * stato: 'da-fare' | 'bozza' | 'approvato'  → lo si cambia qui, a mano, quando
 * una forma è stata guardata e accettata. Niente stati automatici: l'unica cosa
 * che conta è che qualcuno l'abbia vista.
 */
'use strict';

module.exports = [

    /* ─────────────────────────────────────────────────────────── 1. CONFERMA */
    {
        id: 'conferma',
        nome: 'Conferma',
        stato: 'bozza',
        quando: 'Una domanda sola, due strade. Se l’azione cancella qualcosa, il bottone è distruttivo e non è quello a fuoco.',
        istanze: ['confirm-modal', 'layout-exit-confirm-modal', 'merge-confirm-modal', 'validate-link-modal',
            '_confirmResume (pipeline)', 'conferma uscita editor documenti', 'elimina classe', 'elimina documento'],
        schema: {
            titolo: 'Eliminare la classe 4R?',
            icona: 'trash-2',
            taglia: 's',
            sezioni: [{ testo: 'Le credenziali degli allievi vanno perse. I materiali già creati restano su disco.' }],
            azioni: [
                { id: 'no', etichetta: 'Annulla' },
                { id: 'si', etichetta: 'Elimina', ruolo: 'distruttivo', icona: 'trash-2' }
            ]
        }
    },

    /* ──────────────────────────────────────────────────────────── 2. AVVISO */
    {
        id: 'avviso',
        nome: 'Avviso / errore',
        stato: 'bozza',
        quando: 'Qualcosa è andato storto o va saputo prima di procedere. Una sola via d’uscita: capito.',
        istanze: ['alert-modal', 'api-tutorial-modal', 'avvisi di generazione', 'chiave API mancante'],
        schema: {
            titolo: 'Chiave API mancante',
            icona: 'alert-triangle',
            taglia: 's',
            sezioni: [{ testo: 'Per generare una mappa serve la chiave del provider AI. La imposti in Configurazione AI, e resta salvata su questo computer.' }],
            azioni: [{ id: 'ok', etichetta: 'Ho capito', ruolo: 'primario' }]
        }
    },

    /* ───────────────────────────────────────────── 3. RICHIESTA DI UN VALORE */
    {
        id: 'valore',
        nome: 'Richiesta di un valore',
        stato: 'bozza',
        quando: 'Un campo solo. Invio conferma, ESC annulla: qui il contratto tastiera vale più della grafica.',
        istanze: ['prompt-modal', 'edit-project-title-modal', 'showLinkFamilyPrompt', 'rinomina gruppo (lavagna)'],
        schema: {
            titolo: 'Titolo del progetto',
            icona: 'pencil-line',
            taglia: 's',
            sezioni: [{ campi: [{ id: 'titolo', etichetta: 'Titolo del progetto', valore: 'La Fotosintesi' }] }],
            azioni: [{ id: 'no', etichetta: 'Annulla' }, { id: 'si', etichetta: 'Salva', ruolo: 'primario' }]
        }
    },

    /* ──────────────────────────────────────────────────────── 4. FORM BREVE */
    {
        id: 'form',
        nome: 'Form breve',
        stato: 'bozza',
        quando: 'Da due a sei campi in una schermata. Oltre, diventa un wizard.',
        istanze: ['user-profile-modal', 'profilo insegnante', 'feedback-modal', 'files-settings', 'crea classe'],
        schema: {
            titolo: 'Profilo insegnante',
            sottotitolo: 'Serve a intestare i materiali e a tarare l’AI',
            icona: 'user-round',
            taglia: 'm',
            sezioni: [{
                titolo: 'Chi sei',
                campi: [
                    { id: 'nome', etichetta: 'Nome e cognome', valore: 'Giacomo Meschini' },
                    { id: 'sede', etichetta: 'Sede', valore: 'SM Bellinzona', larghezza: 'meta' },
                    { id: 'anno', etichetta: 'Anno scolastico', tipo: 'scelta', opzioni: ['2026/2027', '2027/2028'], larghezza: 'meta' },
                    { id: 'note', etichetta: 'Note per l’AI', tipo: 'area', aiuto: 'Registro, attenzioni particolari, vincoli di classe.' }
                ]
            }],
            azioni: [{ id: 'no', etichetta: 'Annulla' }, { id: 'si', etichetta: 'Salva', ruolo: 'primario' }]
        }
    },

    /* ────────────────────────────────────────────────────────── 5. OPZIONI */
    {
        id: 'opzioni',
        nome: 'Opzioni di stampa o generazione',
        stato: 'bozza',
        quando: 'Spunte e scelte che governano un’azione lunga. Il costo (pagine, chiamate AI, minuti) va scritto vicino al bottone che la lancia.',
        istanze: ['dossier-print-modal', 'timeline-generator', 'foglio dei nodi', 'stampa quiz', 'esporta PDF'],
        schema: {
            titolo: 'Opzioni di stampa',
            sottotitolo: 'Dossier · La Fotosintesi',
            icona: 'printer',
            taglia: 'm',
            sezioni: [
                {
                    titolo: 'Ambito',
                    campi: [
                        { id: 'a1', tipo: 'radio', gruppo: 'ambito', etichetta: 'Solo il nodo selezionato', valore: true },
                        { id: 'a2', tipo: 'radio', gruppo: 'ambito', etichetta: 'Il nodo e tutto il suo ramo' }
                    ]
                },
                {
                    titolo: 'Contenuto',
                    campi: [
                        { id: 'c1', tipo: 'spunta', etichetta: 'Includi il diagramma delle relazioni', valore: true },
                        { id: 'c2', tipo: 'spunta', etichetta: 'Includi le fonti citate', valore: true },
                        { id: 'c3', tipo: 'scelta', etichetta: 'Grandezza del testo', opzioni: ['Normale', 'Grande', 'Molto grande'] }
                    ]
                }
            ],
            nota: 'Stima: 4 pagine A4.',
            azioni: [{ id: 'no', etichetta: 'Annulla' }, { id: 'si', etichetta: 'Stampa', ruolo: 'primario', icona: 'printer' }]
        }
    },

    /* ───────────────────────────────────────────────────────── 6. WIZARD */
    {
        id: 'wizard',
        nome: 'Wizard a passi',
        stato: 'da-fare',
        quando: 'Una scelta per schermata, con il passo dichiarato. Serve quando le opzioni dipendono l’una dall’altra.',
        istanze: ['live setup', 'tutor QR setup', 'timeline live', 'lavagna collaborativa', 'giardino'],
        schema: {
            titolo: 'Studio attivo live',
            sottotitolo: 'Passo 2 di 4 · Modalità',
            icona: 'radio',
            taglia: 'l',
            sezioni: [{
                titolo: 'Che cosa fanno gli allievi',
                campi: [
                    { id: 'm1', tipo: 'radio', gruppo: 'modo', etichetta: 'Vero o falso', aiuto: 'Il più veloce da correggere, il meno discriminante', valore: true },
                    { id: 'm2', tipo: 'radio', gruppo: 'modo', etichetta: 'Scelta multipla', aiuto: 'Quattro opzioni, una corretta' },
                    { id: 'm3', tipo: 'radio', gruppo: 'modo', etichetta: 'Testo bucato (cloze)', aiuto: 'Nessuna chiamata AI: si genera dalle descrizioni' },
                    { id: 'm4', tipo: 'radio', gruppo: 'modo', etichetta: 'Domande mie', aiuto: 'Le scrivi tu, l’AI non interviene' }
                ]
            }],
            azioni: [{ id: 'indietro', etichetta: 'Indietro' }, { id: 'avanti', etichetta: 'Avanti', ruolo: 'primario' }]
        }
    },

    /* ────────────────────────────────────────────────────────────── 7. HUB */
    {
        id: 'hub',
        nome: 'Hub a schede',
        stato: 'bozza',
        quando: 'Un bivio fra strade diverse. Solo icona e titolo: la spiegazione sta nel tooltip, non sotto ogni scheda.',
        istanze: ['materiali di studio', 'graph manager', 'MappAI Live', 'launcher studio attivo', 'menu azioni'],
        schema: {
            titolo: 'Materiali di studio',
            icona: 'folder-open',
            taglia: 'l',
            layout: 'due',
            sezioni: [
                { titolo: 'Stampati', azioni: [{ id: 'h1', etichetta: 'Foglio dei nodi', icona: 'layout-grid' }, { id: 'h2', etichetta: 'Sintesi di ramo', icona: 'file-text' }] },
                { titolo: 'Da consegnare', azioni: [{ id: 'h3', etichetta: 'Quiz cartacei', icona: 'printer' }, { id: 'h4', etichetta: 'Timeline', icona: 'calendar-clock' }] }
            ],
            azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
        }
    },

    /* ──────────────────────────────────────────────────────── 8. CRUSCOTTO */
    {
        id: 'cruscotto',
        nome: 'Cruscotto',
        stato: 'bozza',
        quando: 'Molte scelte più un numero che le governa. Il numero sta a sinistra, sempre visibile mentre scegli a destra.',
        istanze: ['Genera materiali (pipeline)', 'Consumi AI', 'Revisione mappa', 'Fissa layout'],
        schema: {
            titolo: 'Genera materiali',
            sottotitolo: 'Mappa + quiz + fogli nodi + sintesi, archiviati nel vault',
            icona: 'package',
            taglia: 'xl',
            layout: 'cruscotto',
            sezioni: [
                {
                    titolo: 'Destinazione', colonna: 'lato',
                    campi: [
                        { id: 'classe', tipo: 'scelta', etichetta: 'Classe', opzioni: ['4R', '1B', '2A'] },
                        { id: 'disciplina', tipo: 'scelta', etichetta: 'Disciplina', opzioni: ['Storia', 'Scienze'] }
                    ]
                },
                {
                    titolo: 'Costo stimato', colonna: 'lato', accento: true,
                    testo: '~20 chiamate all’AI — mappa 5 · quiz 9 · fogli 2 · sintesi 4'
                },
                {
                    titolo: 'Quiz e flashcard',
                    campi: [
                        { id: 'q1', tipo: 'spunta', etichetta: 'Scelta multipla', valore: true },
                        { id: 'q2', tipo: 'spunta', etichetta: 'Vero / Falso', valore: true },
                        { id: 'q3', tipo: 'spunta', etichetta: 'Flashcard', valore: true },
                        { id: 'q4', tipo: 'numero', etichetta: 'Per ramo', valore: 6, larghezza: 'breve' }
                    ]
                },
                {
                    titolo: 'Fogli dei nodi',
                    campi: [
                        { id: 'f1', tipo: 'scelta', etichetta: 'Livello', opzioni: ['Tutti i livelli', 'Solo L1'] },
                        { id: 'f2', tipo: 'spunta', etichetta: 'Parole chiave', valore: true },
                        { id: 'f3', tipo: 'spunta', etichetta: 'Scheda', valore: true }
                    ]
                },
                {
                    titolo: 'Sintesi',
                    campi: [
                        { id: 's1', tipo: 'spunta', etichetta: 'Sintesi della mappa', valore: true },
                        { id: 's2', tipo: 'spunta', etichetta: 'Voce naturale (MP3)', aiuto: 'Una chiamata in più e qualche minuto' }
                    ]
                },
                {
                    titolo: 'Adatta alla classe', largo: true,
                    campi: [
                        { id: 'ad1', tipo: 'radio', gruppo: 'ad', etichetta: 'Solo la mappa', aiuto: 'profondità e complessità sul grado' },
                        { id: 'ad2', tipo: 'radio', gruppo: 'ad', etichetta: 'Solo i materiali', aiuto: 'registro e note su quiz, fogli e sintesi' },
                        { id: 'ad3', tipo: 'radio', gruppo: 'ad', etichetta: 'Entrambi', valore: true }
                    ]
                }
            ],
            nota: 'La pipeline riprende da dove si è fermata, se qualcosa va storto.',
            azioni: [{ id: 'no', etichetta: 'Annulla' }, { id: 'si', etichetta: 'Avvia', ruolo: 'primario', icona: 'play' }]
        }
    },

    /* ────────────────────────────────────────────────── 9. SCHEDA DI LETTURA */
    {
        id: 'lettura',
        nome: 'Scheda di lettura',
        stato: 'da-fare',
        quando: 'Testo lungo da leggere, non da compilare. Qui contano misura della riga, interlinea e strumenti compensativi.',
        istanze: ['source-modal (scheda del nodo)', 'ai-modal (tutor)', 'app-guide-modal', 'app-tutorial-modal'],
        schema: {
            titolo: 'Fase luminosa',
            sottotitolo: 'Livello 2 · La Fotosintesi',
            icona: 'book-open',
            taglia: 'l',
            sezioni: [{
                titolo: 'Descrizione',
                testo: 'Nei tilacoidi la clorofilla cattura la luce e la trasforma in energia chimica. L’acqua viene scissa, l’ossigeno liberato nell’aria, e restano ATP e NADPH: sono loro a far girare il ciclo di Calvin, che avviene dopo, nello stroma.'
            }],
            azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }, { id: 'espandi', etichetta: 'Espandi con AI', ruolo: 'primario', icona: 'sparkles' }]
        }
    },

    /* ─────────────────────────────────────────────────────────── 10. EDITOR */
    {
        id: 'editor',
        nome: 'Editor',
        stato: 'da-fare',
        quando: 'Si scrive e si salva. Il modale è «sporco» per definizione: ESC e velo chiedono conferma prima di buttare via.',
        istanze: ['edit-node-modal', 'editor documenti', 'editor foglio nodi', 'contextual-ai-extension'],
        schema: {
            titolo: 'Modifica il nodo',
            sottotitolo: 'Fase luminosa',
            icona: 'pencil-line',
            taglia: 'l',
            sporco: true,
            veloChiude: false,
            layout: 'due',
            sezioni: [
                { titolo: 'Identità', campi: [{ id: 'label', etichetta: 'Etichetta', valore: 'Fase luminosa' }, { id: 'colore', tipo: 'colore', etichetta: 'Colore', valore: '#4f46e5' }] },
                { titolo: 'Contenuto', campi: [{ id: 'desc', tipo: 'area', etichetta: 'Descrizione' }] }
            ],
            azioni: [{ id: 'elimina', etichetta: 'Elimina', ruolo: 'distruttivo', icona: 'trash-2' },
            { id: 'no', etichetta: 'Annulla' }, { id: 'si', etichetta: 'Salva', ruolo: 'primario' }]
        }
    },

    /* ─────────────────────────────────────────────────────────── 11. PLAYER */
    {
        id: 'player',
        nome: 'Player di sessione',
        stato: 'da-fare',
        quando: 'Una cosa alla volta, con avanzamento visibile e nessuna via d’uscita accidentale: ESC chiede conferma.',
        istanze: ['study-player-modal', 'quiz-modal', 'sessione di studio attivo'],
        schema: {
            titolo: 'Domanda 3 di 12',
            sottotitolo: 'Quiz · La Fotosintesi',
            icona: 'graduation-cap',
            taglia: 'l',
            sporco: true,
            sezioni: [{
                testo: 'Che cosa produce la fase luminosa?',
                campi: [
                    { id: 'r1', tipo: 'radio', gruppo: 'r', etichetta: 'ATP e NADPH' },
                    { id: 'r2', tipo: 'radio', gruppo: 'r', etichetta: 'Glucosio' },
                    { id: 'r3', tipo: 'radio', gruppo: 'r', etichetta: 'Anidride carbonica' }
                ]
            }],
            azioni: [{ id: 'salta', etichetta: 'Salta' }, { id: 'avanti', etichetta: 'Rispondi', ruolo: 'primario' }]
        }
    },

    /* ─────────────────────────────────────────────────────── 12. PROIEZIONE */
    {
        id: 'proiezione',
        nome: 'Proiezione',
        stato: 'da-fare',
        quando: 'Si guarda da lontano, dalla LIM. Fondo scuro, un solo messaggio, testo grande. Non è un modale: è una schermata.',
        istanze: ['QR a schermo intero (live, tutor, lavagna, timeline)', 'proiezione timeline'],
        schema: {
            titolo: 'Inquadra il QR con il telefono',
            sottotitolo: 'http://192.168.1.24:8767',
            icona: 'qr-code',
            taglia: 'l',
            esc: true,
            sezioni: [{ testo: 'Gli allievi entrano con emoji e numero. Nessuna app da installare.' }],
            azioni: [{ id: 'chiudi', etichetta: 'Chiudi', ruolo: 'primario' }]
        }
    },

    /* ────────────────────────────────────────────────────────── 13. ELENCO */
    {
        id: 'elenco',
        nome: 'Elenco / gestore',
        stato: 'da-fare',
        quando: 'Righe che si aprono, si rinominano, si eliminano. L’eliminazione chiede di digitare il nome.',
        istanze: ['vault-manager-modal', 'account classi', 'documenti archiviati', 'gestore layout'],
        schema: {
            titolo: 'Vault salvati',
            icona: 'files',
            taglia: 'm',
            sezioni: [{
                titolo: '3 vault',
                campi: [
                    { id: 'v1', tipo: 'nota', etichetta: 'La Fotosintesi · 4R · Scienze · 24/07/2026' },
                    { id: 'v2', tipo: 'nota', etichetta: 'Storia della Carta · 2A · Storia · 21/07/2026' },
                    { id: 'v3', tipo: 'nota', etichetta: 'Elvezia · senza classe · 18/07/2026' }
                ]
            }],
            azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }, { id: 'apri', etichetta: 'Apri', ruolo: 'primario' }]
        }
    },

    /* ────────────────────────────────────────────────────────── 15. CONSOLE */
    {
        id: 'console',
        nome: 'Console',
        stato: 'bozza',
        quando: 'Raccoglie una FAMIGLIA di superfici che oggi sono modali separati: navigazione di dominio a sinistra, schede + filtri + tabella a destra. Riferimento: la schermata passata da Giacomo il 30/7. Vuole XL o vista piena — sotto, ripiega sul cruscotto.',
        istanze: ['Registro (classi · allievi · discipline · attività · credenziali · profilo insegnante)',
            'Documenti (archivio · quiz cartacei · sintesi · fogli nodi · condivisi QR)',
            'AI (provider · lingua · taratura classi · consumi · tips · prompt)'],
        schema: {
            titolo: 'Registro',
            sottotitolo: 'Classi, allievi e attività — anno 2026/2027',
            icona: 'graduation-cap',
            taglia: 'xl',
            layout: 'console',
            nav: [
                { id: 'classi', etichetta: 'Classi', icona: 'users', contatore: 4, attiva: true },
                { id: 'allievi', etichetta: 'Allievi', icona: 'user-round', contatore: 64 },
                { id: 'discipline', etichetta: 'Discipline', icona: 'book-open', contatore: 6 },
                { id: 'attivita', etichetta: 'Attività di studio', icona: 'radio', contatore: 11 },
                { id: 'credenziali', etichetta: 'Credenziali', icona: 'key-round' },
                { id: 'profilo', etichetta: 'Profilo insegnante', icona: 'id-card' }
            ],
            schede: [
                { id: 'elenco', etichetta: 'Elenco', attiva: true },
                { id: 'taratura', etichetta: 'Taratura AI' },
                { id: 'report', etichetta: 'Report' }
            ],
            sezioni: [{
                colonna: 'filtri',
                campi: [
                    { id: 'q', etichetta: 'Cerca una classe' },
                    { id: 'sede', tipo: 'scelta', etichetta: 'Sede', opzioni: ['Tutte le sedi', 'Media Bellinzona 2', 'Media Giubiasco'] },
                    { id: 'attive', tipo: 'spunta', etichetta: 'Solo attive', valore: true }
                ],
                azioni: [{ id: 'nuova', etichetta: 'Nuova classe', ruolo: 'primario', icona: 'plus' }]
            }],
            tabella: {
                colonne: [
                    { etichetta: 'Classe', larghezza: '210px' },
                    { etichetta: 'Discipline' },
                    { etichetta: 'Allievi', larghezza: '80px', allinea: 'centro' },
                    { etichetta: 'Sede', larghezza: '180px' },
                    { etichetta: 'Ultimo uso', larghezza: '110px' }
                ],
                righe: [
                    ['1ª A', 'Storia · Educazione all’immagine', '19', 'Media Bellinzona 2', '24/07/2026'],
                    ['1B', 'Scienze naturali', '21', 'Media Bellinzona 2', '21/07/2026'],
                    ['2A', 'Storia', '18', 'Media Giubiasco', '18/07/2026'],
                    ['4R (recupero, sostegno pedagogico)', 'Italiano · Storia · Geografia · Scienze', '6', '—', '30/07/2026']
                ]
            },
            azioni: [{ id: 'chiudi', etichetta: 'Chiudi' }]
        }
    },

    /* ─────────────────────────────────────────────────────── 14. AVANZAMENTO */
    {
        id: 'avanzamento',
        nome: 'Avanzamento',
        stato: 'da-fare',
        quando: 'L’app sta lavorando. Va detto cosa sta facendo e a che punto è; se si può annullare, il bottone c’è davvero.',
        istanze: ['loading-overlay', 'pipeline in corso', 'showBusy (live)', 'generazione mappa'],
        schema: {
            titolo: 'Sto generando i materiali',
            sottotitolo: 'Passo B di D · quiz e flashcard',
            icona: 'loader-2',
            taglia: 's',
            esc: false,
            veloChiude: false,
            sezioni: [{ testo: 'Chiamata 7 di 20. Puoi lasciare la finestra aperta: se qualcosa va storto la pipeline riprende da qui.' }],
            azioni: [{ id: 'stop', etichetta: 'Interrompi', ruolo: 'distruttivo' }]
        }
    }
];
